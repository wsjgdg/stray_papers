/* ============================================================================
 * mode-surf.js（QEC hub 第 8 模式，R128 新建）— 旋转表面码 [[d²,1,d]]
 *
 * 物理核心在 src/physics/surfacecode.js（pot128 81/81）。本页要把三件事画出来：
 *   ① **二维拓扑码长什么样**：d×d 数据比特 + 权重 4/2 混排的 X/Z 稳定子、
 *      两类边界分开（左右 = X 帧终止处，上下 = Z 帧终止处）。最近一次试验的
 *      错误（红点）、综合征（亮起的稳定子）、MWPM 修正链（蓝环）直接叠在码上。
 *   ② **阈值就是三条曲线的排序反转**：d=3/5/7 的 P_L(p) 双对数曲线 + 未编码
 *      基线 p；阈值下侧 P_L 随 d 降、上侧随 d 升，交叉点即有限尺寸阈值。
 *   ③ **距离抑制**：固定 p 看 P_L 随 d 的变化（阈值下侧指数掉、上侧反而涨）。
 *
 * 口径（与引擎头注一致，页面也照抄一行，避免"看着像就该对"）：
 *   - code-capacity：综合征测量理想；噪声明细只有「仅 X」与「退极化」两档；
 *   - 退极化**分帧独立解码** ⟹ 阈值 ≈ 1.5 × 单帧（10.3% → 15.5% 的那个因子）；
 *   - 解码器 MWPM：缺陷数 ≤ 14 走精确 DP，超出退回贪心+2-opt ⟹ **回退率**
 *     必须显示（HUD「解码器」行）；d=3/5/7、p ≤ 0.2 时回退率 ≤1%。
 *   - d=3 可全枚举（4⁹ = 262144）⟹ 页面给一个「精确对账」按钮，把 MC 与
 *     精确值按 4σ 对齐；d≥5 没有精确解（4²⁵），只能 MC。
 * ========================================================================== */
import { scBuild, scVerify, scEnsemble, scTrial, scExactPL, scCrossing, scCrossingCI, scLeadingPower, scMinLogical, SC_DISTANCES, SC_NOISES, SC_PS } from '../physics/surfacecode.js';
import { scSpaceGraph, scSpaceVerify, scSpaceEnsemble, scSpaceTrial, scStream, scSpaceStream, SC_PHEN } from '../physics/surfacecode.js';
import { LiveDriver } from './live.js';
import { ShotReplay } from './shot-replay.js';
import { ConfidenceFeedback } from './confidence.js';
import { mulberry32 } from '../physics/qcircuit.js';
import { scCircuitStream, scCircuitEnsemble } from '../physics/surfacecircuit.js';

const SF_CSS = `
  #sfPanel{top:108px;left:14px;width:254px;padding:13px;z-index:10;max-height:calc(100vh - 234px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #sfPanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #sfPanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #sfPanel .row label{color:var(--dim);min-width:34px}
  #sfPanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #sfPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #sfPanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:46px;text-align:right}
  #sfPanel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
  #sfPanel .btns.g3{grid-template-columns:repeat(3,1fr)}
  #sfPanel button{font-family:var(--mono);font-size:10.5px;padding:5px 4px;border-radius:6px;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #sfPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #sfPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #sfPanel button:disabled{opacity:.45;cursor:default}
  #sfPanel .note{font-size:9.5px;color:var(--dim);line-height:1.55;margin-top:8px}
  #sfHud{top:108px;right:14px;padding:11px 13px;z-index:10;width:272px;font-family:var(--mono);
    max-height:calc(100vh - 154px);overflow-y:auto;scrollbar-width:thin;
    scrollbar-color:rgba(120,160,220,.25) transparent}
  #sfHud .hrow{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:2.5px 0}
  #sfHud .hrow span:first-child{color:var(--dim)}
  #sfHud .hrow span:last-child{color:var(--txt);text-align:right}
  #sfHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #sfHud .big{font-size:13px}
  #sfHud .warn{color:var(--red)}
  #sfHud .ok{color:var(--green)}
  #sfHud .cap{font-size:9.5px;color:var(--dim);line-height:1.5;margin-top:6px}
  #sfHud .cap b{color:var(--amber);font-weight:600}
  #sfStage{position:fixed;left:50%;top:calc(50% + 8px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-columns:1.05fr 1fr;grid-template-rows:1fr 1fr;gap:9px;
    width:min(calc(100vw - 590px),1080px);height:min(80vh,660px)}
  #sfCode{grid-row:1 / span 2}
  #sfCode,#sfCurve,#sfDist{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #sfHint{left:14px;bottom:14px;z-index:10;padding:9px 12px;width:254px;font-size:10px;
    color:var(--dim);line-height:1.55;max-height:210px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #sfHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  @media (max-width:1260px){#sfStage{width:calc(100vw - 40px)}#sfHint{display:none}}
`;

/* 站点 palette 字面量（canvas 里不能用 CSS 变量） */
const sfC = {
  cyan: 'rgba(103,232,249,', mag: 'rgba(240,171,252,', amber: 'rgba(251,191,36,',
  red: 'rgba(248,113,113,', dim: 'rgba(154,167,189,', txt: 'rgba(230,237,243,',
  wire: 'rgba(120,160,220,', green: 'rgba(74,222,128,', violet: 'rgba(167,139,250,',
};
const sfDCOL = { 3: sfC.cyan, 5: sfC.green, 7: sfC.amber };
const sfNoiseName = { x: '仅 X（bit-flip）', depol: '退极化 X/Y/Z' };
const sfFmt = v => !Number.isFinite(v) ? '—'
  : (v === 0 ? '0' : (v >= 1e-3 ? v.toFixed(5) : v.toExponential(2)));
const sfNF = (v, n = 2) => Number.isFinite(v) ? v.toFixed(n) : '—';
const sfMdLite = t => String(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const pcOf = m => { let c = 0; while (m){ c += Number(m & 1n); m >>= 1n; } return c; };

export class SurfApp {
  constructor(shell){
    this.shell = shell;
    this.modeRoot = shell.modeRoot;
    this._listeners = [];
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) && Number.isFinite(parseFloat(q.get(k))) ? parseFloat(q.get(k)) : d);
    const dWanted = Math.round(num('d', 3));
    const measWanted = ['noisy', 'circuit'].includes(q.get('meas')) ? q.get('meas') : 'ideal';
    this.state = {
      d: measWanted === 'circuit' && dWanted === 7 ? 5 : SC_DISTANCES.includes(dWanted) ? dWanted : 3,
      noise: measWanted === 'circuit' ? 'depol' : SC_NOISES.some(n => n.k === q.get('noise')) ? q.get('noise') : 'x',
      p: Math.max(measWanted === 'circuit' ? 0.0005 : 0.005, Math.min(measWanted === 'circuit' ? 0.02 : 0.25, num('p', measWanted === 'circuit' ? 0.005 : 0.08))),
      trials: Math.max(200, Math.min(measWanted === 'circuit' ? 4000 : 20000, Math.round(num('trials', measWanted === 'circuit' ? 400 : 1500)))),
      seed: Math.round(num('seed', 7)),
      /* meas='noisy' ⟹ phenomenological；'circuit' ⟹ 含 CNOT 与 ancilla SPAM 的首阶段模型。
         qR = q/p 只在引擎/调试层暴露：面板固定 q = p（标准取法）。
         q=0 时解码退化成逐层独立、d3×d5 两条曲线在 0.05 以内不交叉（未分辨），
         给旋钮反而误导，所以不上面板（README 里写明这条取舍）。 */
      meas: measWanted,
      qR: [0, 0.5, 1].includes(parseFloat(q.get('qr'))) ? parseFloat(q.get('qr')) : 1,
      live: q.get('live') === '1',
    };
    this.code = scBuild(this.state.d);
    this.trial = null;      /* 最近一次试验快照（码画布用） */
    this.mc = null;         /* 当前点 MC */
    this.sweep = null;      /* [{d, rows:[{p,PL,sigma,fallback}]}] */
    this.cross = null;      /* {c35, c57} */
    this.power = null;      /* {3,5,7} 领先幂次 */
    this.verify = null;     /* scVerify 结果（结构自检） */
    this.exact = null;      /* d=3 精确值 + z */
    this._sweepToken = 0;
    this.cv = {};
  }

  q(sel){ return this.modeRoot.querySelector(sel); }
  on(el, ev, fn){ if (el){ el.addEventListener(ev, fn); this._listeners.push([el, ev, fn]); } }

  deactivate(){
    this.ciFeedback?.dispose();
    this.shotReplay?.dispose();
    this._sweepToken++;                    /* 作废在途分帧扫描 */
    clearTimeout(this._queueTimer);
    clearTimeout(this._runTimer);
    this._ro?.disconnect();
    this.live?.dispose();
    this.live = null;
    for (const [el, ev, fn] of this._listeners) el.removeEventListener(ev, fn);
    this._listeners.length = 0;
    this.modeRoot.replaceChildren();
  }

  activate(){
    this.modeRoot.insertAdjacentHTML('beforeend', `
      <aside id="sfPanel" class="panel qpanel">
        <div class="grp">码距 d（n = d² 比特）</div>
        <div class="btns g3" id="sfDs"></div>

        <div class="grp">噪声口径</div>
        <div class="btns" id="sfMeas"></div>

        <div class="grp">错误谱（每比特）</div>
        <div class="btns" id="sfNoises"></div>

        <div class="grp" id="sfPLabel">每比特错误率 p</div>
        <div class="row"><label>p</label><input type="range" id="sfP" min="0.005" max="0.25" step="0.005"><output id="sfPO">—</output></div>

        <div class="grp">MC 样本数 N</div>
        <div class="row"><label>N</label><input type="range" id="sfTrials" min="200" max="20000" step="200"><output id="sfTrialsO">—</output></div>

        <div class="grp">实验</div>
        <div class="btns g3">
          <button id="sfPlay">▶ 播放</button>
          <button id="sfRun">跑完 MC</button>
          <button id="sfSnap">换一张码图</button>
          <button id="sfSeed">换种子</button>
        </div>
        <div class="btns" style="margin-top:6px">
          <button id="sfScan">扫描 P_L(p)</button>
          <button id="sfExact">d=3 精确对账</button>
        </div>

        <div class="note">曲线走 MC（每点 N 次抽样，分帧累加，不阻塞交互）；
          d=3 的「精确对账」按 4⁹ = 262144 个错误模式全枚举，约 4–6s。</div>
      </aside>

      <aside id="sfHud" class="panel qhud">
        <div class="hrow"><span>配置</span><span id="hCfg" class="big">—</span></div>
        <div class="hrow"><span>结构自检</span><span id="hStruct">—</span></div>
        <div class="hrow"><span>逻辑算符</span><span id="hLogic">—</span></div>
        <hr>
        <div class="hrow"><span>当前点 P_L（累计）</span><span id="hPL" class="big">—</span></div>
        <div class="hrow"><span>播放进度</span><span id="hMCProgress">—</span></div>
        <div class="hrow"><span>最近样本</span><span id="hLast">—</span></div>
        <div class="hrow"><span>X / Z 帧分解（累计）</span><span id="hSplit">—</span></div>
        <div class="hrow"><span>平均缺陷数（单帧）</span><span id="hDef">—</span></div>
        <div class="hrow"><span>解码器</span><span id="hDec">—</span></div>
        <div class="hrow" id="hSpaceRow"><span>时空匹配图</span><span id="hSpace">—</span></div>
        <hr>
        <div class="hrow"><span>交叉点 d3×d5 / d5×d7</span><span id="hCross">—</span></div>
        <div class="hrow"><span>领先幂次 α（p→0）</span><span id="hAlpha">—</span></div>
        <div class="hrow"><span>d=3 精确对账</span><span id="hExact">—</span></div>
        <div class="hrow"><span>扫描进度</span><span id="hProg">—</span></div>
        <div class="cap" id="sfModelNote"><b>退极化是分帧独立解码</b>：丢掉 Y 的相关性 ⟹ 阈值 ≈ 1.5×单帧
          （10.3% → 15.5% 的那个因子；相关解码可到 18.9%，本页不做）。
          <b>交叉点写「未分辨」就是没算出来</b>：两条曲线在该网格/样本数下没有显著的
          排序反转（σ ∝ 1/√N，d5×d7 要 N ≳ 12000 才分得开）。
          <b>d=9 不上页面</b>：缺陷数超 DP 上限后回退率 ~26%，数字不再可信。
          <b>带噪测量口径</b>固定 q = p、d−1 轮带噪 + 末轮理想读出；时空缺陷数随 d 涨得快，
          d=7 的回退率过半 ⟹ 只上 d=3/5。它的 d3×d5 交叉 ≈0.023：默认 N=1500 判「未分辨」，
          N ≳ 4000 才分得开（离线 N=8000 给 0.0231±0.0018）。</div>
      </aside>

      <div id="sfStage" class="qstage">
        <canvas id="sfCode"></canvas>
        <canvas id="sfCurve"></canvas>
        <canvas id="sfDist"></canvas>
      </div>

      <div id="sfHint" class="panel qhint"><b>—</b><span></span></div>
    `);
    this.cv = { code: this.q('#sfCode'), curve: this.q('#sfCurve'), dist: this.q('#sfDist') };
    this.shotReplay = new ShotReplay(this.q('#sfHud'), 'surf');
    this.shotReplay.mount();
    this.ciFeedback = new ConfidenceFeedback(this.q('#sfHud'));
    this.ciFeedback.mount();
    this.live = new LiveDriver({
      make: () => this.circuit
        ? scCircuitStream(this.code, { p: this.state.p, rounds: this.state.d, trials: this.state.trials, seed: this.state.seed })
        : this.phen
          ? scSpaceStream(this.code, { ...this.phenCfg(), trials: this.state.trials, seed: this.state.seed })
          : scStream(this.code, { p: this.state.p, noise: this.state.noise, trials: this.state.trials, seed: this.state.seed }),
      onFrame: res => {
        res.ms = this.live.lastFrameMs;
        this.mc = res;
        if (res.lastTrial) this.trial = res.lastTrial;
        this.renderHud(); this.drawCode(); this.drawCurve(); this.drawDist();
      },
      onState: () => this.syncPlayBtn(),
      fps: 16,
      duration: 6000,
    });

    const mk = (host, items, onPick) => {
      for (const it of items){
        const b = document.createElement('button');
        b.textContent = it.label; b.dataset.v = String(it.v);
        if (it.title) b.title = it.title;
        this.on(b, 'click', () => { onPick(it.v); this.syncPanel(); });
        host.appendChild(b);
      }
    };
    mk(this.q('#sfDs'), SC_DISTANCES.map(d => ({ v: d, label: 'd=' + d, title: `n=${d * d} 比特，距离 ${d}` })),
      v => { this.state.d = v; this.code = scBuild(v); this.runMc(); });
    mk(this.q('#sfNoises'), SC_NOISES.map(n => ({ v: n.k, label: n.name, title: n.desc })),
      v => { this.state.noise = v; this.runMc(); });
    mk(this.q('#sfMeas'), [
      { v: 'ideal', label: '单帧（码容量）', title: '综合征测量理想：二维匹配图' },
      { v: 'noisy', label: '带噪测量', title: 'phenomenological：每轮读出以 q 出错，时间维进匹配图' },
      { v: 'circuit', label: '电路级（首阶段）', title: '显式 ancilla 稳定子提取；CNOT 退极化 + ancilla 准备/读出错误；仅 d=3/5，当前匹配器忽略相关性，不用于阈值结论' },
    ], v => {
      this.state.meas = v;
      if ((v === 'noisy' || v === 'circuit') && this.state.d === 7) this.state.d = 5;
      if (v === 'circuit') { this.state.noise = 'depol'; if (this.state.p > 0.02 || this.state.p < 0.0005) this.state.p = 0.005; this.state.trials = Math.min(this.state.trials, 400); }
      this.code = scBuild(this.state.d); this.syncPanel(); this.runMc(); this.startSweep();
    });

    this.on(this.q('#sfP'), 'input', e => {
      this.state.p = parseFloat(e.target.value);
      this.syncPanel();
      if (this.circuit){ clearTimeout(this._runTimer); this._runTimer = setTimeout(() => this.runMc(), 180); }
      else this.runMc();
    });
    this.on(this.q('#sfTrials'), 'input', e => {
      this.state.trials = parseInt(e.target.value, 10);
      this.syncPanel(); if (this.live && this.live.playing) this.live.sync();
    });
    this.on(this.q('#sfPlay'), 'click', () => this.live.toggle());
    this.on(this.q('#sfRun'), 'click', () => this.runMc());
    this.on(this.q('#sfSnap'), 'click', () => { if (!this.circuit) this.runMc(true); });
    this.on(this.q('#sfSeed'), 'click', () => {
      this.state.seed = (this.state.seed * 1103515245 + 12345) % 2147483647;
      this.runMc();
    });
    this.on(this.q('#sfScan'), 'click', () => this.startSweep());
    this.on(this.q('#sfExact'), 'click', () => this.runExact());

    this.on(window, 'resize', () => this.resize());
    if (window.ResizeObserver){
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.q('#sfStage'));
      this._ro = ro;
    }

    this.verify = scVerify(this.state.d);
    this.syncPanel();
    this.renderHint();
    this.resize();
    this.syncPlayBtn();
    this.computeAll();
  }

  /* ---------- 面板 / 提示 ---------- */
  syncPanel(){
    const s = this.state;
    const mark = (host, v) => {
      for (const b of this.modeRoot.querySelectorAll(host + ' button')) b.classList.toggle('on', b.dataset.v === String(v));
    };
    /* d 按钮在换 d 时要重建标题里的 n，故每次 sync 重算 title */
    for (const b of this.modeRoot.querySelectorAll('#sfDs button')){
      const d = parseInt(b.dataset.v, 10);
      b.title = `n=${d * d} 比特，距离 ${d}`;
    }
    mark('#sfDs', s.d); mark('#sfNoises', s.noise);
    mark('#sfMeas', s.meas);
    for (const b of this.modeRoot.querySelectorAll('#sfNoises button')){
      b.disabled = this.circuit && b.dataset.v !== 'depol';
      if (this.circuit && b.dataset.v !== 'depol') b.title = '当前 circuit-level 首阶段固定为双比特退极化';
    }
    /* 带噪测量口径只上 d=3/5：d=7 的时空缺陷数（k̄≈22）远超 DP 上限，回退率过半 */
    const phen = s.meas === 'noisy', circuit = s.meas === 'circuit';
    for (const b of this.modeRoot.querySelectorAll('#sfDs button')){
      const d = parseInt(b.dataset.v, 10);
      b.disabled = (phen || circuit) && d === 7;
      b.title = circuit && d === 7
        ? '电路级首阶段只支持 d=3/5；更大距离需先校准时空解码与相关故障模型'
        : phen && d === 7
        ? '带噪测量下 d=7 的时空缺陷数常超 DP 上限（回退率 >50%），数字不再可信'
        : `n=${d * d} 比特，距离 ${d}`;
    }
    const exBtn = this.q('#sfExact');
    if (exBtn){
      exBtn.disabled = phen || circuit;
      exBtn.title = circuit ? '当前仅对 code-capacity 单帧模型实现精确枚举' : phen ? '精确枚举只对单帧口径成立（带噪测量要从 4 层 × 2⁹ × 2⁴ 起枚举）' : '';
    }
    const setv = (id, v) => { const e = this.q('#' + id); if (e) e.value = v; };
    const pInput = this.q('#sfP'), nInput = this.q('#sfTrials');
    if (pInput){ pInput.min = this.circuit ? '0.0005' : '0.005'; pInput.max = this.circuit ? '0.02' : '0.25'; pInput.step = this.circuit ? '0.0005' : '0.005'; pInput.value = s.p; }
    this.q('#sfPO').textContent = s.p.toFixed(4);
    if (nInput){ nInput.max = this.circuit ? '4000' : '20000'; nInput.value = s.trials; }
    this.q('#sfTrialsO').textContent = s.trials;
    const pLabel = this.q('#sfPLabel'); if (pLabel) pLabel.textContent = this.circuit ? '每个电路位置的错误率 p' : '每比特错误率 p';
    const snap = this.q('#sfSnap'); if (snap){ snap.disabled = this.circuit; snap.title = this.circuit ? '回放须复用已计入统计的 circuit shot，不额外抽样' : ''; }
    const scan = this.q('#sfScan'); if (scan){ scan.disabled = this.circuit; scan.title = this.circuit ? '首阶段暂不做 circuit-level 阈值扫描：解码器边权尚未纳入故障相关性' : ''; }
    const note = this.q('#sfModelNote');
    if (note && this.circuit) note.innerHTML = '<b>首阶段 circuit-level 模型</b>：每轮真实运行 ancilla 稳定子提取；CNOT 后施加双比特退极化，ancilla 准备与经典读出各以 p 翻错。仅 d=3/5。暂不含 idle/T₁/T₂；MWPM 使用边缘近似权重、忽略 hook/相关故障，当前曲线不是可信阈值。';
    else if (note) note.innerHTML = '<b>退极化是分帧独立解码</b>：丢掉 Y 的相关性 ⟹ 阈值 ≈ 1.5×单帧（10.3% → 15.5%；相关解码可到 18.9%，本页不做）。交叉点「未分辨」表示当前网格/样本数不足；带噪测量固定 q=p、d−1 轮 + 末轮理想读出，d=7 因时空缺陷过多而置灰。';
  }

  renderHint(){
    const b = this.q('#sfHint b'), sp = this.q('#sfHint span');
    if (b) b.textContent = '旋转表面码 [[d²,1,d]]';
    if (sp) sp.innerHTML = sfMdLite(
      '码族页的重复码/Steane 级联是**一维**结构（多数表决 / 查表）；表面码是**二维拓扑码**：' +
      '权重 4 与权重 2 的稳定子混排、两类边界分开，纠错靠「把综合征连起来」。' +
      '点「换一张码图」看错误（红）、综合征（亮框）、MWPM 修正链（蓝环）：' +
      '权重 ≤ t=⌊(d−1)/2⌋ 的错误必纠回，代价是**两条跨码链** = 逻辑错误（权重 d）。' +
      '阈值不是某个 p 的绝对值，而是 **d=3/5/7 三条曲线的排序反转**。' +
      '**带噪测量**（phenomenological）把时间放进匹配图：每轮读出以 q=p 出错 ⟹ 探测事件在时空里成对，' +
      '有限尺寸交叉从 ~9.5% 掉到 ~2.3%。画布下方那 2(d+1) 行点阵就是逐层的探测事件。' +
      (this.circuit ? '**首阶段 circuit-level** 显式模拟每轮 ancilla + CNOT 提取、双比特退极化与 ancilla 准备/读出错；当前时空 MWPM 用边缘近似权重，忽略 hook 相关性，不作为阈值测量。' : ''));
  }

  /* ---------- 计算 ---------- */
  computeAll(){
    this.verify = scVerify(this.state.d);
    this.space = this.spacetime ? scSpaceVerify(this.state.d, this.circuit ? this.state.d : Math.max(1, this.state.d - 1)) : null;
    if (this.state.live && this.live) this.live.start();
    else this.runMc();
    this.startSweep();
  }

  /** 当前口径的试验配置（带噪测量：q = k·p、轮数 = d） */
  phenCfg(extra){
    const s = this.state;
    return { p: s.p, noise: s.noise, q: this.phen ? s.qR * s.p : undefined, rounds: this.phen ? Math.max(1, s.d - 1) : 0, ...extra };
  }

  /** 当前点 MC + 一张码图快照 */
  runMc(newSnap){
    const s = this.state;
    const code = this.code;
    if (this.live && this.live.playing){
      this.verify = scVerify(s.d);
      this.space = this.spacetime ? scSpaceVerify(s.d, this.circuit ? s.d : Math.max(1, s.d - 1)) : null;
      this.live.sync();
      return;
    }
    const t0 = performance.now();
    if (this.circuit){
      this.mc = scCircuitEnsemble(code, { p: s.p, rounds: s.d, trials: s.trials, seed: s.seed });
      this.mc.ms = performance.now() - t0;
      this.space = scSpaceVerify(s.d, s.d);
      this.trial = this.mc.lastTrial;
    } else if (this.phen){
      this.mc = scSpaceEnsemble(code, { ...this.phenCfg(), trials: s.trials, seed: s.seed });
      this.mc.ms = performance.now() - t0;
      this.space = scSpaceVerify(s.d, Math.max(1, s.d - 1));
      if (newSnap || !this.mc.lastTrial){
        const rng = mulberry32((s.seed * 2654435761) % 2147483647);
        this.trial = scSpaceTrial(code, this.phenCfg(), rng);
      } else this.trial = this.mc.lastTrial;
    } else {
      this.mc = scEnsemble(code, { p: s.p, noise: s.noise, trials: s.trials, seed: s.seed });
      this.mc.ms = performance.now() - t0;
      /* 默认画 MC 的最后一条样本；「换一张码图」才单独重抽。 */
      if (newSnap || !this.mc.lastTrial){
        const rng = mulberry32((s.seed * 2654435761) % 2147483647);
        this.trial = scTrial(code, { p: s.p, noise: s.noise }, rng);
      } else this.trial = this.mc.lastTrial;
      this.space = null;
    }
    this.verify = scVerify(s.d);
    this.renderHud();
    this.drawCode(); this.drawCurve(); this.drawDist();
  }

  syncPlayBtn(){
    const b = this.q('#sfPlay');
    if (!b) return;
    const on = !!(this.live && this.live.playing);
    b.textContent = on ? '⏸ 暂停' : '▶ 播放';
    b.classList.toggle('on', on);
  }

  /** 当前口径的扫描网格 */
  get grid(){
    return this.phen
      ? { ds: [3, 5], ps: SC_PHEN.ps, pMin: SC_PHEN.pMin, pMax: SC_PHEN.pMax, ticks: [0.005, 0.01, 0.02, 0.04] }
      : { ds: SC_DISTANCES, ps: SC_PS, pMin: 0.005, pMax: 0.25, ticks: [0.01, 0.03, 0.1, 0.25] };
  }
  get phen(){ return this.state.meas === 'noisy'; }
  get circuit(){ return this.state.meas === 'circuit'; }
  get spacetime(){ return this.phen || this.circuit; }

  /** 分帧扫描：一次算一个 (d, p) 点，插一个 setTimeout 让出主线程 */
  startSweep(){
    const tok = ++this._sweepToken;
    if (this.circuit){
      clearTimeout(this._queueTimer); this._queueTimer = null; this._gridN = 0;
      this.sweep = null; this.cross = null; this.power = null;
      this.renderHud(); this.drawCurve(); this.drawDist(); return;
    }
    const s = this.state, G = this.grid;
    const jobs = [];
    for (const d of G.ds) for (const p of G.ps) jobs.push({ d, p });
    this._gridN = jobs.length;
    this.sweep = G.ds.map(d => ({ d, rows: [] }));
    this.cross = null; this.power = null;
    this._queueTimer = null;
    let i = 0;
    const step = () => {
      if (tok !== this._sweepToken) return;           /* 已切模式/重开扫描 */
      if (i >= jobs.length){
        this.finishSweep();
        return;
      }
      const { d, p } = jobs[i];
      const row = this.phen
        ? scSpaceEnsemble(scBuild(d), { p, noise: s.noise, q: s.qR * p, rounds: Math.max(1, d - 1), trials: s.trials, seed: s.seed })
        : scEnsemble(scBuild(d), { p, noise: s.noise, trials: s.trials, seed: s.seed });
      const bucket = this.sweep.find(c => c.d === d);
      bucket.rows.push({ p, PL: row.PL, sigma: row.sigma, fallback: row.fallback, meanDefects: row.meanDefects });
      i++;
      this.renderHud();
      this.drawCurve();
      this._queueTimer = setTimeout(step, 0);
    };
    this.renderHud();
    this._queueTimer = setTimeout(step, 20);
  }

  finishSweep(){
    const [a, b, c] = this.sweep;
    const i35 = a && b ? scCrossingCI(a.rows, b.rows) : null;
    const i57 = b && c ? scCrossingCI(b.rows, c.rows) : null;
    this.cross = {
      c35: i35 ? i35.p : null, c57: i57 ? i57.p : null,
      s35: i35 ? i35.sigma : null, s57: i57 ? i57.sigma : null,
    };
    this.power = {};
    for (const cur of this.sweep) this.power[cur.d] = scLeadingPower(cur.rows);
    this.renderHud();
    this.drawCurve(); this.drawDist();
  }

  runExact(){
    const s = this.state;
    if (this.phen || this.circuit){
      this.exact = { phen: this.phen, circuit: this.circuit };
      this.renderHud();
      return;
    }
    const btn = this.q('#sfExact');
    if (btn){ btn.disabled = true; btn.textContent = '枚举中…'; }
    setTimeout(() => {
      const C3 = scBuild(3);
      const t0 = performance.now();
      const ex = scExactPL(C3, { p: s.p, noise: s.noise });
      const mc = scEnsemble(C3, { p: s.p, noise: s.noise, trials: Math.max(s.trials, 4000), seed: s.seed });
      const sig = Math.sqrt(Math.max(ex.PL * (1 - ex.PL), 1e-12) / mc.trials);
      this.exact = { p: s.p, noise: s.noise, exact: ex.PL, mc: mc.PL, trials: mc.trials, z: Math.abs(mc.PL - ex.PL) / sig, ms: performance.now() - t0, mass: ex.mass };
      if (btn){ btn.disabled = false; btn.textContent = 'd=3 精确对账'; }
      this.renderHud();
    }, 30);
  }

  /* ---------- HUD ---------- */
  renderHud(){
    this.ciFeedback?.sync({ label: '逻辑失效率 P_L', rate: this.mc && this.mc.PL, n: this.mc && this.mc.trials });
    this.shotReplay?.sync(this.trial || (this.mc && this.mc.lastTrial), this.mc && this.mc.trials, this.state);
    const s = this.state, v = this.verify, mc = this.mc;
    const set = (id, txt, cls) => { const el = this.q('#' + id); if (el){ el.textContent = txt; el.className = cls || ''; } };
    const phenTxt = this.phen ? ` · phenomenological q=p（${Math.max(1, s.d - 1)} 轮 + 理想终读）` : this.circuit ? ` · circuit-level CNOT+SPAM（${s.d} 轮，近似 MWPM）` : ' · code-capacity';
    set('hCfg', `${this.circuit ? '双比特退极化' : sfNoiseName[s.noise]} · d=${s.d} · p=${s.p.toFixed(4)} · N=${s.trials}${phenTxt}`);
    if (v){
      set('hStruct', `${v.n} 比特 · |X|=${v.nX} · |Z|=${v.nZ} · k=${v.k} · 全对易=${v.commute ? '✓' : '✗'}`,
        (v.k === 1 && v.commute) ? 'ok' : 'warn');
      set('hLogic', `X_L 权重 ${v.xlWeight} · Z_L 权重 ${v.zlWeight} · 反对易=${v.anticommute ? '✓' : '✗'}`);
    }
    if (mc){
      set('hPL', `${sfFmt(mc.PL)}  (${Math.round(mc.PL * mc.trials)}/${mc.trials})`, 'big');
      set('hMCProgress', `${mc.trials} / ${s.trials}`);
      const last = this.trial || mc.lastTrial;
      if (last){
        const err = pcOf((last.mx || 0n) | (last.mz || 0n));
        const outcome = last.fail ? (last.xfail && last.zfail ? 'X/Z 逻辑失败' : last.xfail ? 'X 帧逻辑失败' : 'Z 帧逻辑失败') : '纠回';
        set('hLast', this.circuit
          ? `#${mc.trials} ${outcome} · 电路故障 ${last.faultCount} · CNOT ${last.cnotCount}`
          : `#${mc.trials} ${outcome} · 错误 ${err} · 缺陷 ${last.kx + last.kz}`);
      } else set('hLast', '—');
      set('hSplit', `${sfFmt(mc.PLx)} / ${sfFmt(mc.PLz)}`);
      set('hDef', `${sfNF(mc.meanDefects, 2)} 个${this.spacetime ? '（时空）' : ''}`);
      const decName = this.circuit ? '电路级边缘 MWPM' : this.phen ? 'phenomenological 时空 MWPM' : '二维 MWPM·DP';
      set('hDec', `${decName} · 回退 ${(mc.fallback * 100).toFixed(2)}% · ${sfNF(mc.ms, 1)}ms`,
        mc.fallback > 0.02 ? 'warn' : '');
    }
    const spRow = this.q('#hSpaceRow');
    if (spRow) spRow.style.display = this.spacetime ? '' : 'none';
    if (this.spacetime && this.space){
      const X = this.space.X;
      set('hSpace', `${this.space.layers} 层 × ${X.nS + 2} 节点 · ${X.space + X.bnd + X.time} 边 · 自检${this.space.ok ? '✓' : '✗'}`,
        this.space.ok ? 'ok' : 'warn');
    } else set('hSpace', '—');
    if (!mc){ set('hMCProgress', `0 / ${s.trials}`); set('hLast', '—'); }
    if (this.circuit){
      set('hCross', '首阶段不做 circuit-level 阈值扫描');
    } else if (this.cross){
      /* σ 大到位数无意义时（N 小 / 曲线贴得太近）不给三位小数：退回两位并标「≈」。
         阈值：σ_p > 0.03 ⟹ 交叉点只知道个量级（N=400 时 c57 常落在这档）。 */
      const fmt = (v, sg) => v === null ? '未分辨'
        : !Number.isFinite(sg) ? v.toFixed(3)
        : sg > 0.03 ? `≈${v.toFixed(2)}±${sg.toFixed(2)}` : `${v.toFixed(3)}±${sg.toFixed(3)}`;
      set('hCross', `${fmt(this.cross.c35, this.cross.s35)} / ${fmt(this.cross.c57, this.cross.s57)}`);
    } else set('hCross', '扫描中…');
    if (this.circuit){ set('hAlpha', '未拟合（首阶段不做阈值结论）'); }
    else if (this.power){
      const dsA = this.phen ? [3, 5] : SC_DISTANCES;
      set('hAlpha', dsA.map(d => `d${d}:${Number.isFinite(this.power[d]) ? this.power[d].toFixed(2) : '—'}`).join('  '));
    } else set('hAlpha', '扫描中…');
    if (this.exact && this.exact.circuit){
      set('hExact', '电路级口径未实现精确枚举');
    } else if (this.exact && this.exact.phen){
      set('hExact', '带噪测量口径无精确枚举（4 层 × 2⁹ × 2⁴ 起步）');
    } else if (this.exact){
      set('hExact', `p=${this.exact.p.toFixed(3)}：精确 ${sfFmt(this.exact.exact)} vs MC ${sfFmt(this.exact.mc)} ⟹ z=${sfNF(this.exact.z, 2)}σ`,
        this.exact.z <= 4 ? 'ok' : 'warn');
    } else set('hExact', '未跑（按按钮）');
    const done = this.sweep ? this.sweep.reduce((a, c) => a + c.rows.length, 0) : 0;
    const total = this._gridN || (SC_DISTANCES.length * SC_PS.length);
    set('hProg', this.circuit ? '首阶段无阈值扫描' : `${done}/${total} 点${done === total ? '（完成）' : '…'}`);
  }

  /* ---------- 画布 ---------- */
  resize(){
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const k of Object.keys(this.cv)){
      const c = this.cv[k];
      if (!c) continue;
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) continue;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    this.drawCode(); this.drawCurve(); this.drawDist();
  }

  /* 画布 1：码本身 + 错误 / 综合征 / 修正链 */
  drawCode(){
    const c = this.cv.code;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const s = this.state, code = this.code, d = s.d, n = code.n;
    g.textAlign = 'left';
    const phen = this.spacetime;
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = sfC.txt + '.95)';
    g.fillText(`旋转表面码 d=${d}：${n} 比特 · ${code.X.length}+${code.Z.length} 个稳定子 · k=1`
      + (this.circuit ? ` · 电路级提取 ${s.d} 轮` : phen ? ` · 带噪测量 ${Math.max(1, s.d - 1)} 轮 + 理想读出` : ''), 10 * dpr, 16 * dpr);
    g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = sfC.dim + '.85)';
    g.fillText(phen
      ? (this.circuit ? `红点=最终数据帧 · 亮框=终层探测事件 · 蓝环=时空 MWPM 投影 · 下方=各轮综合征读数` : `红点=总错误 · 亮框=末层探测事件 · 蓝环=时空链的空间投影 · 下方 = 逐层探测事件`)
      : `红点=错误 · 亮框=被点亮的综合征 · 蓝环=MWPM 修正 · 权重 ${d} 的横/竖链 = 逻辑（无法分辨）`,
    10 * dpr, 29 * dpr);

    /* 网格几何：数据比特占 (d)×(d)，四周留一格给边界；带噪测量时底部留出时空条 */
    const pad = 34 * dpr;
    const stripH = phen ? Math.min(H * 0.30, 22 * dpr + 2 * (d + 1) * 8 * dpr) : 0;
    const avail = Math.min(W - 2 * pad, H - 2 * pad - 22 * dpr - stripH);
    const step = avail / (d + 0.0);
    const ox = (W - step * (d - 1)) / 2, oy = 44 * dpr + (H - 44 * dpr - step * (d - 1)) / 2;
    const P = (r, cc) => ({ x: ox + cc * step, y: oy + r * step });

    /* 稳定子：X（青）实心小方框、Z（绿）空心；支撑用四角细线围起来 */
    const drawStab = (st, hue) => {
      const pts = st.sup.map(q => P(Math.floor(q / d), q % d));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      g.strokeStyle = hue + '.55)';
      g.lineWidth = 1.1 * dpr;
      g.beginPath();
      g.moveTo(Math.min(...xs), Math.min(...ys));
      g.lineTo(Math.max(...xs), Math.min(...ys));
      g.lineTo(Math.max(...xs), Math.max(...ys));
      g.lineTo(Math.min(...xs), Math.max(...ys));
      g.closePath(); g.stroke();
      const cx = xs.reduce((a, b) => a + b, 0) / pts.length;
      const cy = ys.reduce((a, b) => a + b, 0) / pts.length;
      const sz = Math.max(3.2 * dpr, step * 0.13);
      g.fillStyle = hue + '.30)';
      g.strokeStyle = hue + '.85)';
      g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.rect(cx - sz, cy - sz, 2 * sz, 2 * sz); g.fill(); g.stroke();
    };

    /* 逻辑算符参考线：顶行（X_L）/ 左列（Z_L），虚线 */
    const a0 = P(0, 0), a1 = P(0, d - 1), b0 = P(0, 0), b1 = P(d - 1, 0);
    g.setLineDash([3 * dpr, 4 * dpr]);
    g.strokeStyle = sfC.violet + '.40)'; g.lineWidth = 1.1 * dpr;
    g.beginPath(); g.moveTo(a0.x, a0.y - 8 * dpr); g.lineTo(a1.x, a1.y - 8 * dpr); g.stroke();
    g.beginPath(); g.moveTo(b0.x - 8 * dpr, b0.y); g.lineTo(b1.x - 8 * dpr, b1.y); g.stroke();
    g.setLineDash([]);

    for (const st of code.Z) drawStab(st, sfC.green);
    for (const st of code.X) drawStab(st, sfC.cyan);

    /* 错误 / 修正：先画修正环，再画错误点（错误在最上层） */
    const t = this.trial;
    if (t){
      const drawMask = (mask, hue, ring) => {
        for (let q = 0; q < n; q++){
          if (!((mask >> BigInt(q)) & 1n)) continue;
          const p = P(Math.floor(q / d), q % d);
          if (ring){
            g.strokeStyle = hue + '.95)'; g.lineWidth = 2 * dpr;
            g.beginPath(); g.arc(p.x, p.y, Math.max(4.5 * dpr, step * 0.22), 0, Math.PI * 2); g.stroke();
          } else {
            g.fillStyle = hue + '.95)';
            g.beginPath(); g.arc(p.x, p.y, Math.max(3.4 * dpr, step * 0.16), 0, Math.PI * 2); g.fill();
          }
        }
      };
      drawMask(t.corrX, sfC.cyan, true);
      drawMask(t.corrZ, sfC.green, true);
      drawMask(t.mx, sfC.red, false);
      drawMask(t.mz, sfC.mag, false);
      /* 综合征：把被点亮的稳定子描粗 */
      const glow = st => {
        const pts = st.sup.map(q => P(Math.floor(q / d), q % d));
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        g.strokeStyle = sfC.amber + '.95)'; g.lineWidth = 2.2 * dpr;
        g.beginPath();
        g.moveTo(Math.min(...xs), Math.min(...ys));
        g.lineTo(Math.max(...xs), Math.min(...ys));
        g.lineTo(Math.max(...xs), Math.max(...ys));
        g.lineTo(Math.min(...xs), Math.max(...ys));
        g.closePath(); g.stroke();
      };
      if (phen){
        const dX = t.defX[d], dZ = t.defZ[d];        /* 末层探测事件 */
        code.Z.forEach((st, k) => { if (dX >> k & 1) glow(st); });
        code.X.forEach((st, k) => { if (dZ >> k & 1) glow(st); });
      } else {
        code.Z.forEach(st => { if (pcOf(st.mask & t.mx) & 1) glow(st); });
        code.X.forEach(st => { if (pcOf(st.mask & t.mz) & 1) glow(st); });
      }
    }

    /* 比特：小白点（画在稳定子之上、错误之下会更好，但为简洁统一放这里） */
    g.fillStyle = 'rgba(8,14,26,.95)';
    for (let r = 0; r < d; r++) for (let cc = 0; cc < d; cc++){
      const p = P(r, cc);
      g.beginPath(); g.arc(p.x, p.y, Math.max(1.8 * dpr, step * 0.07), 0, Math.PI * 2); g.fill();
      g.strokeStyle = sfC.dim + '.55)'; g.lineWidth = 1 * dpr; g.stroke();
    }

    /* 结论行 */
    if (t){
      const bad = t.xfail || t.zfail;
      g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = bad ? sfC.red + '.95)' : sfC.green + '.95)';
      g.fillText(bad
        ? `本次试验：逻辑错误（${t.xfail ? 'X 帧' : ''}${t.xfail && t.zfail ? ' + ' : ''}${t.zfail ? 'Z 帧' : ''}）——缺陷 ${t.kx}/${t.kz}，修正链连通了两条边界`
        : `本次试验：已纠回 —— 缺陷 ${t.kx}/${t.kz}，修正链只连接相邻缺陷（或就近边界）`, 10 * dpr, H - 9 * dpr);
    }
    if (phen && t) this.drawSpaceStrip(g, W, H, dpr, stripH, t);
  }

  /* 时空缺陷条：行 = 层（0..R），列 = 该帧的稳定子；上 X 帧、下 Z 帧 */
  drawSpaceStrip(g, W, H, dpr, stripH, t){
    const s = this.state, R = s.d, nS = this.code.zg.nS;
    const x0 = 40 * dpr, x1 = W - 10 * dpr, cw = (x1 - x0) / nS;
    const rows = 2 * (R + 1);
    const top = H - stripH + 16 * dpr;
    const rh = Math.min(9 * dpr, (stripH - 22 * dpr) / rows);
    g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = sfC.dim + '.85)';
    g.fillText(`时空探测事件：行 = 层 l（0…${R}，末层 = 理想读出），列 = 稳定子`, 10 * dpr, H - stripH + 8 * dpr);
    for (let l = 0; l <= R; l++){
      for (const [frame, base] of [['X', 0], ['Z', R + 1]]){
        const mask = frame === 'X' ? t.defX[l] : t.defZ[l];
        for (let k = 0; k < nS; k++){
          const cx = x0 + (k + 0.5) * cw, cy = top + (base + l + 0.5) * rh;
          const on = (mask >> k) & 1;
          g.fillStyle = on ? (frame === 'X' ? sfC.cyan + '.95)' : sfC.mag + '.95)') : sfC.wire + '.13)';
          g.beginPath(); g.arc(cx, cy, Math.max(1.3 * dpr, rh * 0.33), 0, Math.PI * 2); g.fill();
        }
      }
      g.fillStyle = sfC.dim + '.65)';
      g.fillText('l' + l, 10 * dpr, top + (l + 0.62) * rh);
    }
  }

  /* 画布 2：P_L(p) 双对数（三条曲线 + 基线 + 当前点 + 交叉点） */
  drawCurve(){
    const c = this.cv.curve;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = (11 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = sfC.txt + '.95)';
    g.fillText(this.circuit ? 'Circuit-level：当前单点样本（未做阈值扫描）' : 'P_L(p)：阈值 = 三条曲线的排序反转', 10 * dpr, 15 * dpr);
    g.font = (8.6 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = sfC.dim + '.85)';
    g.fillText(this.circuit ? '边缘权重 MWPM 不含 hook 相关性；单点仅作线路诊断' : '双对数 · 虚线 = 未编码基线 p（编码有益 ⟺ 曲线在它下方）', 10 * dpr, 27 * dpr);

    const L = 46 * dpr, Rr = W - 12 * dpr, T = 40 * dpr, B = H - 26 * dpr;
    const G = this.grid, pMin = G.pMin, pMax = G.pMax, yMin = 1e-5, yMax = 1;
    const X = p => L + (Math.log10(p) - Math.log10(pMin)) / (Math.log10(pMax) - Math.log10(pMin)) * (Rr - L);
    const Y = v => B - (Math.log10(Math.max(v, yMin)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin)) * (B - T);
    /* 网格 */
    g.strokeStyle = sfC.wire + '.16)'; g.lineWidth = 1 * dpr;
    for (const p of G.ticks){
      g.beginPath(); g.moveTo(X(p), T); g.lineTo(X(p), B); g.stroke();
      g.fillStyle = sfC.dim + '.8)'; g.font = (8 * dpr) + 'px ui-monospace,monospace';
      g.fillText(p.toString(), X(p) - 6 * dpr, B + 12 * dpr);
    }
    for (const v of [1e-4, 1e-3, 1e-2, 1e-1, 1]){
      g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(Rr, Y(v)); g.stroke();
      g.fillStyle = sfC.dim + '.8)'; g.font = (8 * dpr) + 'px ui-monospace,monospace';
      g.fillText(v >= 0.01 ? v.toString() : v.toExponential(0), 8 * dpr, Y(v) + 3 * dpr);
    }
    /* 基线 p */
    g.strokeStyle = sfC.dim + '.5)'; g.setLineDash([4 * dpr, 3 * dpr]); g.lineWidth = 1.2 * dpr;
    g.beginPath(); g.moveTo(X(pMin), Y(pMin)); g.lineTo(X(Math.min(pMax, 1)), Y(Math.min(pMax, 1))); g.stroke();
    g.setLineDash([]);

    /* 曲线 */
    if (this.sweep){
      for (const cur of this.sweep){
        if (!cur.rows.length) continue;
        const hue = sfDCOL[cur.d] || sfC.cyan;
        g.strokeStyle = hue + '.95)'; g.lineWidth = 1.8 * dpr;
        g.beginPath();
        cur.rows.slice().sort((a, b) => a.p - b.p).forEach((r, i) => {
          const x = X(r.p), y = Y(r.PL);
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        });
        g.stroke();
        for (const r of cur.rows){
          g.fillStyle = hue + '.9)';
          g.beginPath(); g.arc(X(r.p), Y(r.PL), 2.1 * dpr, 0, Math.PI * 2); g.fill();
        }
        /* 图例（右上角一行，按 d 递增排开） */
        g.fillStyle = hue + '.95)';
        g.font = (8.6 * dpr) + 'px ui-monospace,monospace';
        const ids = (this.sweep || []).map(c => c.d);
        const li = ids.indexOf(cur.d);
        g.fillText('d=' + cur.d, Rr - (ids.length - li) * 30 * dpr, T + 2 * dpr);
      }
    }
    /* 交叉点竖线 */
    if (this.cross){
      const marks = [
        { v: this.cross.c35, t: 'd3×d5' },
        { v: this.cross.c57, t: 'd5×d7' },
      ];
      for (const m of marks){
        if (m.v === null) continue;
        g.strokeStyle = sfC.amber + '.55)'; g.setLineDash([2 * dpr, 3 * dpr]); g.lineWidth = 1.1 * dpr;
        g.beginPath(); g.moveTo(X(m.v), T); g.lineTo(X(m.v), B); g.stroke();
        g.setLineDash([]);
        g.fillStyle = sfC.amber + '.9)';
        g.font = (8 * dpr) + 'px ui-monospace,monospace';
        g.fillText(m.t, X(m.v) - 14 * dpr, T - 4 * dpr + 12 * dpr);
      }
    }
    /* 当前点（竖线 + 三条曲线上的实测点） */
    const s = this.state;
    g.strokeStyle = sfC.txt + '.35)'; g.lineWidth = 1 * dpr;
    g.beginPath(); g.moveTo(X(s.p), T); g.lineTo(X(s.p), B); g.stroke();
    if (this.sweep){
      for (const cur of this.sweep){
        const row = cur.rows.find(r => Math.abs(r.p - s.p) < 1e-9);
        if (row){
          g.fillStyle = (sfDCOL[cur.d] || sfC.cyan) + '.95)';
          g.beginPath(); g.arc(X(row.p), Y(row.PL), 3.4 * dpr, 0, Math.PI * 2); g.fill();
        }
      }
    }
    if (this.mc){
      g.strokeStyle = sfC.txt + '.95)'; g.lineWidth = 1.6 * dpr;
      g.beginPath(); g.arc(X(s.p), Y(this.mc.PL), 4.2 * dpr, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = sfC.dim + '.8)';
    g.font = (8 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right';
    g.fillText('p →', Rr, B + 20 * dpr);
    g.textAlign = 'left';
  }

  /* 画布 3：固定 p 下 P_L 随 d（距离抑制 / 反抑制） */
  drawDist(){
    const c = this.cv.dist;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const s = this.state;
    g.font = (11 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = sfC.txt + '.95)';
    g.fillText(this.circuit ? `电路级单点：d=${s.d} · p=${s.p.toFixed(4)}` : `距离抑制：p=${s.p.toFixed(3)} 时 P_L 随 d 的走向`, 10 * dpr, 15 * dpr);
    g.font = (8.6 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = sfC.dim + '.85)';
    g.fillText(this.circuit ? '当前只画已模拟码距；不外推距离趋势或阈值' : '阈值下侧随 d 指数掉（码越大约好）；阈值上侧反过来涨', 10 * dpr, 27 * dpr);

    const L = 46 * dpr, Rr = W - 14 * dpr, T = 42 * dpr, B = H - 26 * dpr;
    const Y = v => B - (Math.log10(Math.max(v, 1e-5)) - Math.log10(1e-5)) / 5 * (B - T);
    g.strokeStyle = sfC.wire + '.16)'; g.lineWidth = 1 * dpr;
    for (const v of [1e-4, 1e-3, 1e-2, 1e-1, 1]){
      g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(Rr, Y(v)); g.stroke();
      g.fillStyle = sfC.dim + '.8)'; g.font = (8 * dpr) + 'px ui-monospace,monospace';
      g.fillText(v >= 0.01 ? v.toString() : v.toExponential(0), 8 * dpr, Y(v) + 3 * dpr);
    }
    const ds = this.spacetime ? [3, 5] : SC_DISTANCES;
    const slot = (Rr - L) / ds.length;
    const pts = [];
    for (let i = 0; i < ds.length; i++){
      const d = ds[i];
      let row = null, fresh = false;
      if (this.sweep){
        const cur = this.sweep.find(x => x.d === d);
        row = cur ? cur.rows.find(r => Math.abs(r.p - s.p) < 1e-9) : null;
      }
      if (!row && d === s.d && this.mc){ row = { PL: this.mc.PL }; fresh = true; }
      const x = L + slot * (i + 0.5);
      if (row){
        pts.push({ x, y: Y(row.PL), d, fresh });
      }
      g.fillStyle = sfC.dim + '.85)';
      g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'center';
      g.fillText('d=' + d, x, B + 14 * dpr);
      g.textAlign = 'left';
    }
    if (pts.length){
      g.strokeStyle = sfC.violet + '.85)'; g.lineWidth = 1.8 * dpr;
      g.beginPath();
      pts.forEach((p, i) => { if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); });
      g.stroke();
      for (const p of pts){
        g.fillStyle = (sfDCOL[p.d] || sfC.cyan) + '.95)';
        g.beginPath(); g.arc(p.x, p.y, (p.fresh ? 4.2 : 3) * dpr, 0, Math.PI * 2); g.fill();
      }
      /* 方向判读：末点低于首点 ⟹ 距离抑制 */
      const trend = pts.length > 1 ? (pts[pts.length - 1].y > pts[0].y ? '反抑制（阈值上侧）' : '距离抑制（阈值下侧）') : '单点';
      g.fillStyle = sfC.txt + '.85)';
      g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'right'; g.fillText(trend, Rr, T + 2 * dpr); g.textAlign = 'left';
    } else {
      g.fillStyle = sfC.dim + '.85)';
      g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.fillText('该 p 不在扫描点上：跑「跑一次 MC」看当前 d，或拖动 p 到扫描点', L, (T + B) / 2);
    }
  }

  /* ---------- 调试句柄（window.__sf，与既有模式同风） ---------- */
  debugHandle(){
    const self = this;
    return {
      get state(){ return { ...self.state }; },
      get mc(){ return self.mc; },
      get verify(){ return self.verify; },
      get cross(){ return self.cross; },
      get power(){ return self.power; },
      get sweep(){ return self.sweep; },
      get exact(){ return self.exact; },
      get trial(){
        const t = self.trial;
        if (!t) return null;
        const hex = m => m.toString(16);
        return {
          fail: t.fail, xfail: t.xfail, zfail: t.zfail, kx: t.kx, kz: t.kz,
          mx: hex(t.mx), mz: hex(t.mz), corrX: hex(t.corrX), corrZ: hex(t.corrZ),
          wErrX: Number(t.mx.toString(2).split('1').length - 1),
          wCorrX: Number(t.corrX.toString(2).split('1').length - 1),
        };
      },
      set(patch){
        Object.assign(self.state, patch || {});
        if (self.state.meas === 'noisy' && self.state.d === 7) self.state.d = 5;
        self.code = scBuild(self.state.d);
        self.syncPanel(); self.runMc();
        return { ...self.state };
      },
      snapshot(){
        return { state: { ...self.state }, mc: self.mc, verify: self.verify, cross: self.cross };
      },
      runSweep(){ self.startSweep(); return true; },
      runExact(){ self.runExact(); return true; },
      /* 诊断用：直接读引擎（不经 UI） */
      probe(d, cfg){ return scEnsemble(scBuild(d), cfg); },
      space(d, cfg){ return scSpaceEnsemble(scBuild(d), cfg); },
      spaceVerify(d, R){ return scSpaceVerify(d, R === undefined ? d : R); },
      get phen(){ return self.phen; },
      get grid(){ return self.grid; },
      structure(d){ return scVerify(d); },
      minLogical(d, type, wmax){ return scMinLogical(scBuild(d), type, wmax); },
      span(){ return { n: self.code.n, nX: self.code.X.length, nZ: self.code.Z.length }; },
    };
  }
}

/* ---------- hub 描述符（qechub.js 的 MODES 表按 id 排序） ---------- */
export const SURF_MODE = {
  id: 'surf',
  name: '表面码',
  tab: '⬚',
  handle: '__sf',
  css: SF_CSS,
  mount: shell => { const app = new SurfApp(shell); app.activate(); return app; },
};
