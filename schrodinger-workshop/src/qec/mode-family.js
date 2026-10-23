/* ============================================================================
 * mode-family.js（QEC hub 模式）— 由 family.js 重构而来（R98 七页整合）：R85 码族与真阈值：重复码族 × Steane 级联族
 *
 * 物理核心在 src/physics/codefamily.js（精确引擎 + MC，pot85 38/38 对账）。
 * 本页把 R78/R79 的「单个码的伪阈值」升级成「码族的真阈值」，三块画布：
 *   ① #fmCurve  全族 P_L(p) 双对数（rep3/5/7/9 + st1/st2）：未编码基线 p、
 *      L1×L2 交叉（真阈值证据）、伪阈值竖线（x-only 恰 1/2 · depol 恰 3/4
 *      不动点）、测量地板曲线（meas 开）、当前 p 的精确点 + MC 点。
 *   ② #fmFate   当前点 MC 结局分解（perfect/logic/outside）+ MC↔精确 4σ 对账。
 *   ③ #fmPower  领先幂次 α（P_L ~ c·p^α，p→0）：级联每层 ×2；rep 退极化
 *      α=1（Z 帧无校验穿透，无阈值）；meas 开时全族被地板压成 α=1。
 *
 * 本页要立住的三件事（与 codefamily.js 头部注释、pot85 断言一一对应）：
 *   ① **真阈值存在**：重复码（仅 X）阈值 = 1/2 闭式可验；Steane 级联
 *      L1 ~ O(p²)、L2 ~ O(p⁴)，两条曲线在 p* 交叉（x-only 0.0646 /
 *      depol 0.0909）——「码族越大阈值现象越锐」的直接证据。
 *   ② **单次解码有地板**：综合征测量一旦带噪（同 p），最后一次读数的噪声
 *      无法被后续轮次确认 ⟹ outside = 1−(1−p)^m 的 O(p) 地板与码距无关，
 *      压平全部曲线 ⟹ 无交叉、无伪阈值（R82/R83 多轮解码正为平掉它而生）。
 *   ③ **depol 的 p=3/4 是精确不动点、不是阈值**：该点退极化信道退化为
 *      X/Z 两帧独立公平翻转（每位 x,z 各 1/2 且独立，因 (1−p)=p/3=1/4）
 *      ⟹ P(X 帧多数失败)=1/2、P(Z 帧奇偶)=1/2、独立 ⟹ P_L = 3/4，对一切
 *      码族、一切 d/层级成立（pot85 E4 六族逐族断言）。它在非物理区段且
 *      不随 d 改善 ⟹ 只是伪阈值意义上的数学交点。
 * ========================================================================== */
import { CF_FAMILIES, CF_NOISES, cfSweep, cfEnsemble, cfExactPL, cfFloor, cfNQ, cfDistance, cfSynBits, cfLeadingPower, CF_FAMILY_ST3 } from '../physics/codefamily.js';

const FM_CSS = `
  #fmPanel{top:108px;left:14px;width:250px;padding:13px;z-index:10;max-height:calc(100vh - 234px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #fmPanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #fmPanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #fmPanel .row label{color:var(--dim);min-width:34px}
  #fmPanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #fmPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #fmPanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:46px;text-align:right}
  #fmPanel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
  #fmPanel .btns.g3{grid-template-columns:repeat(3,1fr)}
  #fmPanel button{font-family:var(--mono);font-size:10.5px;padding:5px 4px;border-radius:6px;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #fmPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #fmPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #fmPanel .note{font-size:9.5px;color:var(--dim);line-height:1.55;margin-top:8px}
  #fmHud{top:108px;right:14px;padding:11px 13px;z-index:10;width:268px;font-family:var(--mono);
    max-height:calc(100vh - 154px);overflow-y:auto;scrollbar-width:thin;
    scrollbar-color:rgba(120,160,220,.25) transparent}
  #fmHud .hrow{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:2.5px 0}
  #fmHud .hrow span:first-child{color:var(--dim)}
  #fmHud .hrow span:last-child{color:var(--txt);text-align:right}
  #fmHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #fmHud .big{font-size:13px}
  #fmHud .warn{color:var(--red)}
  #fmHud .ok{color:var(--green)}
  #fmHud .cap{font-size:9.5px;color:var(--dim);line-height:1.5;margin-top:6px}
  #fmHud .cap b{color:var(--amber);font-weight:600}
  #fmStage{position:fixed;left:50%;top:calc(50% + 8px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1.06fr 1fr;gap:9px;
    width:min(calc(100vw - 580px),1060px);height:min(80vh,660px)}
  #fmCurve{grid-column:1 / span 2}
  #fmCurve,#fmFate,#fmPower{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #fmHint{left:14px;bottom:14px;z-index:10;padding:9px 12px;width:250px;font-size:10px;
    color:var(--dim);line-height:1.55;max-height:224px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #fmHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #fmDiag{position:fixed;left:-9999px}
  @media (max-width:1260px){#fmStage{width:calc(100vw - 40px)}#fmHint{display:none}}
`;

/* 站点 palette（core/styles.js 的 :root 变量，canvas 里只能用字面量） */
const fmFCOL = {
  cyan: 'rgba(103,232,249,', mag: 'rgba(240,171,252,', amber: 'rgba(251,191,36,',
  red: 'rgba(248,113,113,', dim: 'rgba(154,167,189,', txt: 'rgba(230,237,243,',
  wire: 'rgba(120,160,220,', green: 'rgba(74,222,128,',
  violet: 'rgba(167,139,250,', blue: 'rgba(96,165,250,',
};
/* 各族曲线配色（与 CF_FAMILIES 同序；st3 只做模块级幽灵条） */
const fmFAM_HUE = { rep3: fmFCOL.cyan, rep5: fmFCOL.green, rep7: fmFCOL.amber, rep9: fmFCOL.mag,
  st1: fmFCOL.violet, st2: fmFCOL.blue, st3: fmFCOL.dim };
const fmFATES = [
  { k: 'perfect', name: '纠回', hue: fmFCOL.cyan, desc: '残差 ∈ S' },
  { k: 'outside', name: '逻辑受损', hue: fmFCOL.amber, desc: '残差 ∉ N(S)（综合征非零）' },
  { k: 'logic', name: '静默逻辑', hue: fmFCOL.red, desc: '残差 ∈ 逻辑陪集（最危险）' },
];
const fmNOISE_NAME = { x: '仅 X（bit-flip）', depol: '退极化 X/Y/Z' };

/** 页面扫描点（比引擎默认 CF_PS 多 0.65/0.75/0.85：把 depol 的 3/4 不动点
 *  与 x-only 的 1/2 阈值都纳进可视区段。cdp85 与 Node 对账用同一张表。 */
export const FM_PS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.18, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85];

const fmMdLite = t => String(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const fmNf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const fmFmt = v => !Number.isFinite(v) ? '—' : (v === 0 ? '0' : (v >= 1e-4 ? v.toFixed(6) : v.toExponential(2)));

export class FamilyApp {
  constructor(shell){
    this.shell = shell;
    this.modeRoot = shell.modeRoot;
    this._listeners = [];
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const str = (k, d) => (q.has(k) ? q.get(k) : d);
    this.state = {
      noise: CF_NOISES.some(n => n.k === str('noise', 'x')) ? str('noise', 'x') : 'x',
      meas: num('meas', 0) ? 1 : 0,
      fam: CF_FAMILIES.some(f => f.k === str('fam', 'st1')) ? str('fam', 'st1') : 'st1',
      p: Math.max(0.001, Math.min(0.85, num('p', 0.02))),
      trials: Math.max(200, Math.min(8000, Math.round(num('trials', 4000)))),
      seed: Math.round(num('seed', 7)),
    };
    this.sweep = null;    /* 全族精确扫描（只随 noise/meas 变，150–650ms） */
    this.mc = null;       /* 当前族当前点 MC（随 fam/p/seed/trials 变） */
    this.powers = null;   /* 各族领先幂次（只随 noise/meas 变） */
    this.st3p = null;     /* Steane³ 模块级幂次（幽灵条） */
  }

  q(sel){ return this.modeRoot.querySelector(sel); }
  on(el, ev, fn){ if (el){ el.addEventListener(ev, fn); this._listeners.push([el, ev, fn]); } }

  deactivate(){
    clearTimeout(this._pDebounce); clearTimeout(this._deb); clearInterval(this._queueTimer);
    if (this._tok != null) this._tok++;   /* 作废在途 setTimeout 链（rounds/cycle/family） */
    this._ro?.disconnect();
    for (const [el, ev, fn] of this._listeners) el.removeEventListener(ev, fn);
    this._listeners.length = 0;
    this.modeRoot.replaceChildren();      /* 移除本 mode 的 DOM（面板/HUD/画布/提示） */
  }

  activate(){
    this.modeRoot.insertAdjacentHTML('beforeend', `
      <aside id="fmPanel" class="panel qpanel">
        <div class="grp">错误谱（每比特以 p 注入）</div>
        <div class="btns" id="fmNoises"></div>

        <div class="grp">综合征测量噪声</div>
        <div class="btns" id="fmMeases"></div>

        <div class="grp">当前族（MC 对账用）</div>
        <div class="btns g3" id="fmFams"></div>

        <div class="grp">每比特错误率 p</div>
        <div class="row"><label>p</label><input type="range" id="fmP" min="0.001" max="0.85" step="0.001"><output id="fmPO">—</output></div>

        <div class="grp">MC 样本数 N</div>
        <div class="row"><label>N</label><input type="range" id="fmTrials" min="200" max="8000" step="200"><output id="fmTrialsO">—</output></div>

        <div class="grp">实验</div>
        <div class="btns">
          <button id="fmRun">跑一次 MC</button>
          <button id="fmSeed">换种子</button>
        </div>

        <div class="note">
          曲线走<b>精确引擎</b>（级联结构分解递归，无 MC 误差）；MC 只在当前点取样，
          与精确值 <b>4σ 对账</b>。改噪声谱 / 测量开关会重算全族扫描（约 0.2–0.7s）。</div>
      </aside>

      <aside id="fmHud" class="panel qhud">
        <div class="hrow"><span>配置</span><span id="hCfg" class="big">—</span></div>
        <div class="hrow"><span>结构</span><span id="hStruct">—</span></div>
        <hr>
        <div class="hrow"><span>精确 P_L(p)</span><span id="hExact" class="big">—</span></div>
        <div class="hrow"><span>测量地板</span><span id="hFloor">—</span></div>
        <div class="hrow"><span>L1×L2 交叉</span><span id="hCross">—</span></div>
        <div class="hrow"><span>伪阈值（选中族 vs p）</span><span id="hPseudo">—</span></div>
        <hr>
        <div class="hrow"><span>MC P_L</span><span id="hMcPL">—</span></div>
        <div class="hrow"><span>MC↔精确 4σ</span><span id="hZ">—</span></div>
        <div class="hrow"><span>MC 结局 纠回/受损/逻辑</span><span id="hFate">—</span></div>
        <div class="hrow"><span>MC 平均帧错误数</span><span id="hFaults">—</span></div>
        <div class="hrow"><span>领先幂次 α</span><span id="hPower">—</span></div>
        <div class="cap"><b>Steane³ [[343,1,27]]</b>（模块级，不上面板）：α=8，
          p=10⁻³ 处 P_L≈10⁻¹⁷，任何可行 MC 样本都是 0 事件，画出来只能是噪声。</div>
      </aside>

      <div id="fmStage" class="qstage">
        <canvas id="fmCurve"></canvas>
        <canvas id="fmFate"></canvas>
        <canvas id="fmPower"></canvas>
      </div>

      <div id="fmHint" class="panel qhint"><b>—</b><span></span></div>
      <div id="fmDiag"></div>
    `);
    this.cv = { curve: this.q('#fmCurve'), fate: this.q('#fmFate'), power: this.q('#fmPower') };

    const mk = (host, items, onPick) => {
      for (const it of items){
        const b = document.createElement('button');
        b.textContent = it.label; b.dataset.v = it.v;
        if (it.title) b.title = it.title;
        this.on(b, 'click', () => { onPick(it.v); this.syncPanel(); });
        host.appendChild(b);
      }
    };
    mk(this.q('#fmNoises'), CF_NOISES.map(n => ({ v: n.k, label: n.name, title: n.desc })),
      v => { this.state.noise = v; this.compute(); });
    mk(this.q('#fmMeases'), [
      { v: 0, label: '无噪', title: '综合征测量理想（阈值现象出现的条件）' },
      { v: 1, label: '带噪（同 p）', title: '每位综合征以 p 翻转——单次解码 ⟹ O(p) 地板' },
    ], v => { this.state.meas = v ? 1 : 0; this.compute(); });
    mk(this.q('#fmFams'), CF_FAMILIES.map(f => ({ v: f.k, label: f.sym, title: f.name })),
      v => { this.state.fam = v; this.syncPanel(); this.runMc(); });

    this.on(this.q('#fmP'), 'input', e => {
      this.state.p = parseFloat(e.target.value);
      this.syncPanel(); this.runMc();
    });
    this.on(this.q('#fmTrials'), 'input', e => {
      this.state.trials = parseInt(e.target.value, 10);
      this.syncPanel();
    });
    this.on(this.q('#fmRun'), 'click', () => this.runMc());
    this.on(this.q('#fmSeed'), 'click', () => {
      this.state.seed = (this.state.seed * 1103515245 + 12345) % 2147483647;
      this.runMc();
    });
    this.on(window, 'resize', () => this.resize());
    if (window.ResizeObserver){
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.q('#fmStage'));
      this._ro = ro;
    }

    this.syncPanel();
    this.renderHint();
    this.resize();
    this.compute();
  }

  syncPanel(){
    const s = this.state;
    const mark = (host, v) => { for (const b of this.modeRoot.querySelectorAll(host + ' button')) b.classList.toggle('on', b.dataset.v === String(v)); };
    mark('#fmNoises', s.noise); mark('#fmMeases', s.meas); mark('#fmFams', s.fam);
    const setv = (id, v) => { const e = this.q('#' + id); if (e) e.value = v; };
    setv('fmP', s.p); this.q('#fmPO').textContent = s.p.toFixed(3);
    setv('fmTrials', s.trials); this.q('#fmTrialsO').textContent = s.trials;
  }

  renderHint(){
    const b = this.q('#fmHint b'), sp = this.q('#fmHint span');
    if (b) b.textContent = '码族与真阈值（R85）';
    if (sp) sp.innerHTML = fmMdLite(
      'R78/R79 只有一个码：曲线下穿未编码基线的交点是**伪阈值**（码距固定）。' +
      '把整族码画在一起才看得见**真阈值**：级联每层把领先幂次 ×2（L1 α=2、L2 α=4），' +
      'L1/L2 曲线在 p* 交叉——码越大，交叉越早、越锐。' +
      '退极化下重复码挡不住 Z 帧穿透（α=1，无阈值）；它在 p=3/4 的「交点」是' +
      '**精确不动点**（两帧独立公平翻转 ⟹ P_L≡3/4），在非物理区段，不是阈值。');
  }

  /* ---------- 计算链：扫描（贵）→ MC（当前点） ---------- */
  /* ⚠ _tok 必须显式初始化（(this._tok||0)+1）：曾误写 ++this._tok——初值
   * undefined ⟹ NaN，而回调里 NaN!==NaN 恒真 ⟹ 扫描永远被当作过期而
   * 提前返回，sweep/powers 永远是 null（cdp85 首跑 13 FAIL 的根因）。
   * rounds.js 的同款模式写作 (this._tok||0)+1，口径与此对齐。 */
  compute(){
    this.sweep = null; this.mc = null; this.powers = null; this.st3p = null;
    this.renderHud(); this.drawAll();
    const tok = this._tok = (this._tok || 0) + 1;
    setTimeout(() => {
      if (tok !== this._tok) return;
      const s = this.state;
      this.sweep = cfSweep({ noise: s.noise, meas: s.meas, ps: FM_PS });
      this.powers = CF_FAMILIES.map(f => ({ k: f.k, ...cfLeadingPower(f, s.noise, s.meas) }));
      this.st3p = cfLeadingPower(CF_FAMILY_ST3, s.noise, s.meas);
      this.renderHud(); this.drawCurve(); this.drawPower();
      setTimeout(() => { if (tok !== this._tok) return; this.runMc(tok); }, 20);
    }, 30);
  }

  runMc(tok){
    if (tok && tok !== this._tok) return;
    const s = this.state;
    const t0 = performance.now();
    this.mc = cfEnsemble(s.fam, { noise: s.noise, meas: s.meas, p: s.p, trials: s.trials, seed: s.seed });
    this.mc.ms = performance.now() - t0;
    this.renderHud(); this.drawFate(); this.drawCurve();
  }

  /* MC↔精确 4σ 对账（口径与 pot85 D 节逐字一致） */
  recon(){
    const s = this.state, mc = this.mc;
    if (!mc) return null;
    const fam = CF_FAMILIES.find(f => f.k === s.fam);
    const nq = cfNQ(fam);
    const ex = mc.exact;
    const sig = Math.sqrt(Math.max(1e-300, ex * (1 - ex) / mc.trials));
    const zPL = Math.abs(mc.PL - ex) / sig;
    /* meanFaults = (xw+zw)/N（帧错误总数）：x-only 每比特期望 p；
     * depol 每比特 X/Y/Z 各 p/3 ⟹ xw+zw 期望 4p/3（Y 记两帧），
     * 每比特方差 2p−16p²/9（c∈{0,1,2}：P(1)=2p/3、P(2)=p/3） */
    const muB = s.noise === 'x' ? s.p : 4 * s.p / 3;
    const varB = s.noise === 'x' ? s.p * (1 - s.p) : 2 * s.p - 16 * s.p * s.p / 9;
    const mExp = nq * muB, mSig = Math.sqrt(nq * varB / mc.trials);
    const zF = Math.abs(mc.meanFaults - mExp) / mSig;
    return { nq, ex, sig, zPL, mExp, mSig, zF, ok4: zPL <= 4 + 1e-12 && zF <= 4 + 1e-9 };
  }

  /* ---------- HUD ---------- */
  renderHud(){
    const s = this.state, sw = this.sweep, mc = this.mc;
    const set = (id, v, cls) => {
      const el = this.q('#' + id);
      if (!el) return;
      el.textContent = v;
      el.className = cls || '';
    };
    const fam = CF_FAMILIES.find(f => f.k === s.fam);
    set('hCfg', `${fmNOISE_NAME[s.noise]} · ${s.meas ? '测量带噪' : '测量无噪'} · ${fam.name}`);
    set('hStruct', `${cfNQ(fam)} 比特 · 距离 ${cfDistance(fam)} · 综合征 ${cfSynBits(fam)} 位`);
    set('hExact', fmFmt(cfExactPL(s.p, fam, s.noise, s.meas)));
    set('hFloor', s.meas ? fmFmt(cfFloor(s.p, fam, 1)) + `（1−(1−p)^${cfSynBits(fam)}）` : '0（测量无噪）');
    if (!sw){
      ['hCross', 'hPseudo'].forEach(id => set(id, '计算中…'));
    } else {
      set('hCross', sw.cross12 == null ? '无（测量地板压平）' : 'p* = ' + sw.cross12.toFixed(6));
      const ps = sw.pseudo[s.fam];
      if (ps == null) set('hPseudo', '无（曲线不下穿基线）');
      else if (fam.kind === 'rep') set('hPseudo', 'p* = ' + ps.toFixed(6) + (s.noise === 'x' ? '（恰 1/2：经典阈值）' : '（恰 3/4：精确不动点·非物理区段）'));
      else set('hPseudo', 'p* = ' + ps.toFixed(6) + '（vs 未编码基线）');
    }
    if (!mc){
      ['hMcPL', 'hZ', 'hFate', 'hFaults', 'hPower'].forEach(id => set(id, '计算中…'));
      return;
    }
    const r = this.recon();
    set('hMcPL', fmFmt(mc.PL) + '  (' + (mc.byFate.logic + mc.byFate.outside) + '/' + mc.trials + ')');
    set('hZ', `z=${fmNf(r.zPL, 2)}σ · 故障 z=${fmNf(r.zF, 2)}σ`, r.ok4 ? 'ok' : 'warn');
    set('hFate', `${mc.byFate.perfect} / ${mc.byFate.outside} / ${mc.byFate.logic}`);
    set('hFaults', `${fmNf(mc.meanFaults, 2)} / 期望 ${fmNf(r.mExp, 2)}`);
    const pw = this.powers ? this.powers.find(x => x.k === s.fam) : null;
    set('hPower', pw ? `α=${fmNf(pw.power, 3)} · c≈${pw.PL / Math.pow(1e-4, pw.power) < 1e4 ? fmNf(pw.PL / Math.pow(1e-4, pw.power), 1) : (pw.PL / Math.pow(1e-4, pw.power)).toExponential(1)}` : '—');
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
    this.drawAll();
  }
  drawAll(){ this.drawCurve(); this.drawFate(); this.drawPower(); }

  /* 画布 1：全族 P_L(p) 双对数 + 基线 + 交叉 + 伪阈值线 + 地板 + 当前点 */
  drawCurve(){
    const c = this.cv.curve;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = fmFCOL.txt + '.95)';
    g.fillText('全族 P_L(p)（双对数 · 精确引擎）：码距 / 层级越大，曲线越早低头', 10 * dpr, 16 * dpr);
    const s = this.state;
    g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = fmFCOL.dim + '.85)';
    g.fillText(s.meas
      ? '测量噪声开：地板 1−(1−p)^m 与码距无关，把全部曲线压平 ⟹ 无交叉、无伪阈值（多轮解码见 R82/R83）'
      : (s.noise === 'x'
        ? '仅 X：重复码阈值恰 1/2（闭式）；L1×L2 交叉 0.0646 = 真阈值证据（级联每层指数压低）'
        : '退极化：Z 帧无校验穿透 ⟹ 重复码无阈值；p=3/4 是两帧独立公平的精确不动点（非物理区段，非阈值）'),
      10 * dpr, 29 * dpr);

    /* 图例（一族一色 + 基线 + 地板 + MC 点） */
    let lx = 10 * dpr;
    g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
    for (const f of CF_FAMILIES){
      g.fillStyle = fmFAM_HUE[f.k] + '.9)';
      g.fillRect(lx, 35 * dpr, 8 * dpr, 6 * dpr);
      g.fillStyle = fmFCOL.dim + '.9)';
      g.fillText(f.sym, lx + 11 * dpr, 41 * dpr);
      lx += (18 + f.sym.length * 8.6) * dpr;
    }
    g.strokeStyle = fmFCOL.dim + '.55)'; g.lineWidth = 1.2 * dpr; g.setLineDash([4 * dpr, 3 * dpr]);
    g.beginPath(); g.moveTo(lx, 38 * dpr); g.lineTo(lx + 16 * dpr, 38 * dpr); g.stroke(); g.setLineDash([]);
    g.fillStyle = fmFCOL.dim + '.9)'; g.fillText('基线 p', lx + 20 * dpr, 41 * dpr);
    lx += (20 + 3 * 8.6) * dpr;
    if (s.meas){
      g.strokeStyle = fmFCOL.amber + '.7)'; g.lineWidth = 1.1 * dpr; g.setLineDash([2 * dpr, 2 * dpr]);
      g.beginPath(); g.moveTo(lx, 38 * dpr); g.lineTo(lx + 16 * dpr, 38 * dpr); g.stroke(); g.setLineDash([]);
      g.fillStyle = fmFCOL.amber + '.9)'; g.fillText('地板', lx + 20 * dpr, 41 * dpr);
      lx += (20 + 2 * 8.6) * dpr;
    }
    g.beginPath(); g.arc(lx + 4 * dpr, 38 * dpr, 3 * dpr, 0, Math.PI * 2);
    g.fillStyle = fmFCOL.txt + '.95)'; g.fill();
    g.fillStyle = fmFCOL.dim + '.9)'; g.fillText('MC 点', lx + 11 * dpr, 41 * dpr);

    const px0 = 46 * dpr, py0 = 50 * dpr, pw = W - px0 - 14 * dpr, ph = H - py0 - 30 * dpr;
    /* x: log10 p ∈ [−3, log10 0.9]；y: log10 P_L ∈ [−9, 0]（st2 depol @0.001 ≈ 3.5e-9） */
    const X0 = -3, X1 = Math.log10(0.9), Y0 = -9, Y1 = 0;
    const lx2 = p => px0 + (Math.log10(p) - X0) / (X1 - X0) * pw;
    const ly = v => py0 + ph - (Math.log10(Math.min(1, Math.max(1e-9, v))) - Y0) / (Y1 - Y0) * ph;

    /* 网格 */
    g.strokeStyle = fmFCOL.wire + '.14)'; g.lineWidth = 1 * dpr;
    g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
    for (let e = -3; e <= -1; e++){
      const X = lx2(Math.pow(10, e));
      g.beginPath(); g.moveTo(X, py0); g.lineTo(X, py0 + ph); g.stroke();
      g.fillStyle = fmFCOL.dim + '.7)'; g.textAlign = 'center';
      g.fillText('1e' + e, X, py0 + ph + 12 * dpr);
    }
    for (let e = -9; e <= 0; e += 3){
      const Y = ly(Math.pow(10, e));
      g.beginPath(); g.moveTo(px0, Y); g.lineTo(px0 + pw, Y); g.stroke();
      g.fillStyle = fmFCOL.dim + '.7)'; g.textAlign = 'right';
      g.fillText('1e' + e, px0 - 4 * dpr, Y + 3 * dpr);
    }
    /* 未编码基线 P = p */
    g.strokeStyle = fmFCOL.dim + '.55)'; g.lineWidth = 1.2 * dpr; g.setLineDash([4 * dpr, 3 * dpr]);
    g.beginPath(); g.moveTo(lx2(0.001), ly(0.001)); g.lineTo(lx2(0.85), ly(0.85)); g.stroke();
    g.setLineDash([]);

    const sw = this.sweep;
    if (!sw){ g.fillStyle = fmFCOL.dim + '.7)'; g.textAlign = 'left'; g.fillText('全族扫描计算中…', px0 + pw / 2 - 60 * dpr, py0 + ph / 2); return; }

    /* 各族曲线 + 地板 */
    for (const f of CF_FAMILIES){
      const hue = fmFAM_HUE[f.k];
      g.strokeStyle = hue + '.95)'; g.lineWidth = 1.6 * dpr;
      g.beginPath();
      sw.p.forEach((p, i) => { const X = lx2(p), Y = ly(sw.fams[f.k][i]); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.stroke();
      if (s.meas){
        g.strokeStyle = fmFCOL.amber + '.55)'; g.lineWidth = 1 * dpr; g.setLineDash([3 * dpr, 2 * dpr]);
        g.beginPath();
        sw.p.forEach((p, i) => { const X = lx2(p), Y = ly(sw.floor[f.k][i]); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
        g.stroke(); g.setLineDash([]);
      }
    }

    /* L1×L2 交叉（真阈值证据） */
    if (sw.cross12 != null){
      const pv = cfExactPL(sw.cross12, 'st1', s.noise, s.meas);
      const X = lx2(sw.cross12), Y = ly(pv);
      g.strokeStyle = fmFCOL.red + '.9)'; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.arc(X, Y, 5 * dpr, 0, Math.PI * 2); g.stroke();
      g.fillStyle = fmFCOL.red + '.95)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = X > px0 + pw * 0.6 ? 'right' : 'left';
      g.fillText('L1×L2 交叉 p*=' + sw.cross12.toFixed(4), X + (X > px0 + pw * 0.6 ? -8 * dpr : 8 * dpr), Y - 7 * dpr);
    }
    /* 伪阈值竖线：x-only 恰 1/2（经典阈值）· depol 恰 3/4（精确不动点） */
    if (!s.meas && s.noise === 'x' && sw.pseudo.rep3 != null){
      const X = lx2(sw.pseudo.rep3);
      g.strokeStyle = fmFCOL.red + '.5)'; g.lineWidth = 1 * dpr; g.setLineDash([2 * dpr, 3 * dpr]);
      g.beginPath(); g.moveTo(X, py0); g.lineTo(X, py0 + ph); g.stroke(); g.setLineDash([]);
      g.fillStyle = fmFCOL.red + '.85)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillText('1/2 经典阈值', X, py0 + 10 * dpr);
    }
    if (!s.meas && s.noise === 'depol' && sw.pseudo.rep3 != null){
      const X = lx2(sw.pseudo.rep3);
      g.strokeStyle = fmFCOL.amber + '.6)'; g.lineWidth = 1 * dpr; g.setLineDash([2 * dpr, 3 * dpr]);
      g.beginPath(); g.moveTo(X, py0); g.lineTo(X, py0 + ph); g.stroke(); g.setLineDash([]);
      g.fillStyle = fmFCOL.amber + '.95)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillText('3/4 精确不动点', X, py0 + 10 * dpr);
    }

    /* 当前 p：竖线 + 精确点 + MC 点 */
    const s2 = this.state;
    if (s2.p >= 0.001 && s2.p <= 0.9){
      const X = lx2(s2.p);
      g.strokeStyle = fmFCOL.wire + '.4)'; g.lineWidth = 1 * dpr;
      g.beginPath(); g.moveTo(X, py0); g.lineTo(X, py0 + ph); g.stroke();
      const fam = CF_FAMILIES.find(f => f.k === s2.fam);
      const ex = cfExactPL(s2.p, fam, s2.noise, s2.meas);
      g.beginPath(); g.arc(X, ly(ex), 3.4 * dpr, 0, Math.PI * 2);
      g.fillStyle = fmFAM_HUE[fam.k] + '.95)'; g.fill();
      g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
      g.fillStyle = fmFAM_HUE[fam.k] + '.95)';
      g.fillText('精确 ' + fmFmt(ex), X + 6 * dpr, ly(ex) + 3 * dpr);
      if (this.mc && this.mc.family === s2.fam){
        g.beginPath(); g.arc(X, ly(this.mc.PL), 3 * dpr, 0, Math.PI * 2);
        g.fillStyle = fmFCOL.txt + '.95)'; g.fill();
        g.fillStyle = fmFCOL.txt + '.8)';
        g.fillText('MC', X + 6 * dpr, ly(this.mc.PL) + 3 * dpr);
      }
    }

    /* 底部：伪阈值读数 */
    g.font = (9 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillStyle = fmFCOL.dim + '.85)';
    const psTxt = CF_FAMILIES.map(f => f.sym + '=' + (sw.pseudo[f.k] == null ? '无' : sw.pseudo[f.k].toFixed(4))).join(' · ');
    g.fillText('伪阈值（vs 未编码基线）：' + psTxt, 10 * dpr, H - 9 * dpr);
  }

  /* 画布 2：当前点 MC 结局分解 + MC↔精确 4σ 对账 */
  drawFate(){
    const c = this.cv.fate;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = fmFCOL.txt + '.95)';
    g.fillText('当前点：MC 结局分解 + MC↔精确 4σ 对账', 10 * dpr, 16 * dpr);
    const mc = this.mc, r = this.recon();
    if (!mc || !r){
      g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = fmFCOL.dim + '.7)';
      g.fillText('MC 计算中…', 10 * dpr, 40 * dpr);
      return;
    }
    /* 图例 */
    let lx = 10 * dpr;
    g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
    for (const f of fmFATES){
      g.fillStyle = f.hue + '.85)'; g.fillRect(lx, 25 * dpr, 7 * dpr, 7 * dpr);
      g.fillStyle = fmFCOL.dim + '.9)'; g.fillText(f.name, lx + 10 * dpr, 31 * dpr);
      lx += (18 + f.name.length * 9) * dpr;
    }
    /* 堆叠条 */
    const x0 = 10 * dpr, x1 = W - 12 * dpr;
    const y = 44 * dpr, bh = 16 * dpr;
    let x = x0;
    for (const f of fmFATES){
      const v = mc.byFate[f.k] || 0;
      if (!v) continue;
      const w = (x1 - x0) * v / mc.trials;
      g.fillStyle = f.hue + '0.72)';
      g.fillRect(x, y, Math.max(0.6 * dpr, w), bh);
      if (w > 26 * dpr){
        g.fillStyle = 'rgba(6,12,22,.92)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
        g.fillText(v + '（' + (100 * v / mc.trials).toFixed(1) + '%）', x + w / 2, y + 11 * dpr);
      }
      x += w;
    }
    /* 对账行 */
    const rows = [
      ['精确 P_L(p)', fmFmt(r.ex)],
      ['MC P_L ± 1σ', fmFmt(mc.PL) + ' ± ' + r.sig.toExponential(1) + `（${mc.byFate.logic + mc.byFate.outside}/${mc.trials}）`],
      ['P_L 偏差', fmNf(r.zPL, 2) + 'σ', r.zPL <= 4 + 1e-12 ? 'ok' : 'warn'],
      ['期望平均帧错误数', fmNf(r.mExp, 3) + `（${r.nq} 比特 × ${this.state.noise === 'x' ? 'p' : '4p/3'}）`],
      ['MC 平均帧错误数', fmNf(mc.meanFaults, 3) + '（' + fmNf(r.zF, 2) + 'σ）', r.zF <= 4 + 1e-9 ? 'ok' : 'warn'],
    ];
    let ry = y + bh + 20 * dpr;
    g.font = (10 * dpr) + 'px ui-monospace,monospace';
    for (const row of rows){
      g.textAlign = 'left';
      g.fillStyle = fmFCOL.dim + '.9)';
      g.fillText(row[0], x0, ry);
      g.textAlign = 'right';
      g.fillStyle = row[2] === 'warn' ? fmFCOL.red + '.95)' : (row[2] === 'ok' ? fmFCOL.green + '.9)' : fmFCOL.txt + '.95)');
      g.fillText(row[1], x1, ry);
      ry += 16 * dpr;
    }
    g.textAlign = 'left';
    g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = fmFCOL.dim + '.85)';
    g.fillText('判据（与 pot85 D 节同口径）：|z| ≤ 4σ；σ_PL=√(P(1−P)/N)，故障 σ=√(n·Var/N)。MC ' + mc.ms.toFixed(0) + 'ms', 10 * dpr, H - 9 * dpr);
  }

  /* 画布 3：领先幂次 α（P_L ~ c·p^α） */
  drawPower(){
    const c = this.cv.power;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = fmFCOL.txt + '.95)';
    g.fillText('领先幂次 α（P_L ~ c·p^α，p→0 由引擎对数差分给出）', 10 * dpr, 16 * dpr);
    if (!this.powers){
      g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = fmFCOL.dim + '.7)';
      g.fillText('计算中…', 10 * dpr, 40 * dpr);
      return;
    }
    const labW = 118 * dpr, valW = 104 * dpr;
    const bx = 10 * dpr + labW, bw = W - bx - valW - 10 * dpr;
    const top = 30 * dpr, rowH = (H - top - 40 * dpr) / 7;
    const maxA = 8;
    const items = this.powers.map(pw => ({ ...pw, ghost: false }))
      .concat([{ ...this.st3p, ghost: true }]);
    items.forEach((pw, i) => {
      const y = top + rowH * i + rowH * 0.5;
      const hue = pw.ghost ? fmFCOL.dim : fmFAM_HUE[pw.k];
      g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
      g.fillStyle = pw.ghost ? fmFCOL.dim + '.75)' : fmFCOL.txt + '.9)';
      const nm = pw.ghost ? 'Steane³（模块级）' : (CF_FAMILIES.find(f => f.k === pw.k) || {}).name || pw.k;
      g.fillText(nm, 10 * dpr, y + 3 * dpr);
      const w = Math.max(1 * dpr, bw * Math.min(1, pw.power / maxA));
      g.fillStyle = hue + (pw.ghost ? '.4)' : '.8)');
      g.fillRect(bx, y - 5 * dpr, w, 10 * dpr);
      if (pw.ghost){
        g.strokeStyle = hue + '.6)'; g.lineWidth = 1 * dpr;
        g.strokeRect(bx, y - 5 * dpr, w, 10 * dpr);
      }
      const cst = pw.PL / Math.pow(1e-4, pw.power);
      g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = pw.ghost ? fmFCOL.dim + '.8)' : fmFCOL.txt + '.95)';
      g.fillText('α=' + fmNf(pw.power, 3) + '  c≈' + (cst < 1e4 ? fmNf(cst, 1) : cst.toExponential(1)), bx + w + 6 * dpr, y + 3 * dpr);
    });
    g.font = (9 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillStyle = fmFCOL.dim + '.85)';
    const notes = this.state.meas
      ? ['测量噪声开：O(p) 地板主导一切 ⟹ 全族 α=1——级联的指数优势被单次解码的度量噪声吃掉',
         '（这正是 R82/R83 用多轮 + 跨轮确认把测量噪声平掉之后才恢复阈值现象的原因）']
      : (this.state.noise === 'x'
        ? ['仅 X：Steane 级联每层 α×2（L1=2、L2=4）；重复码 α=(d+1)/2（多数表决的失效权重）',
           'rep3/5/7/9 的 α=2/3/4/5：码距每 +2，小 p 处领先幂次 +1']
        : ['退极化：Steane 仍 α=2/4（两帧各一层 Hamming）；重复码 α=1——Z 帧无校验穿透 ⟹ 无阈值',
           'rep 族曲线在 p=3/4 与基线相交：精确不动点（非物理区段），不是阈值']);
    notes.forEach((t, i) => g.fillText(t, 10 * dpr, H - 24 * dpr + i * 12 * dpr));
  }

  /* ---------- 调试句柄（cdp85 用） ---------- */
  debugHandle(){
    const self = this;
    return {
      get state(){ return self.state; },
      ready: () => ({ sweep: !!self.sweep, mc: !!self.mc, powers: !!self.powers }),
      sweep: () => (self.sweep ? {
        p: self.sweep.p.slice(), uncoded: self.sweep.uncoded.slice(),
        noise: self.sweep.noise, meas: self.sweep.meas,
        fams: Object.fromEntries(Object.entries(self.sweep.fams).map(([k, v]) => [k, v.slice()])),
        floor: Object.fromEntries(Object.entries(self.sweep.floor).map(([k, v]) => [k, v.slice()])),
        cross12: self.sweep.cross12, pseudo: { ...self.sweep.pseudo },
      } : null),
      mc: () => (self.mc ? { ...self.mc } : null),
      recon: () => self.recon(),
      powers: () => (self.powers ? self.powers.map(p => ({ ...p })) : null),
      st3Power: () => (self.st3p ? { ...self.st3p } : null),
      exactAt: (fam, p) => cfExactPL(p == null ? self.state.p : p, fam, self.state.noise, self.state.meas),
      floorAt: (fam, p) => cfFloor(p == null ? self.state.p : p, fam, self.state.meas),
      setNoise: v => { if (CF_NOISES.some(n => n.k === v)){ self.state.noise = v; self.syncPanel(); self.compute(); } },
      setMeas: v => { self.state.meas = v ? 1 : 0; self.syncPanel(); self.compute(); },
      setFam: v => { if (CF_FAMILIES.some(f => f.k === v)){ self.state.fam = v; self.syncPanel(); self.runMc(); } },
      setP: v => { self.state.p = Math.max(0.001, Math.min(0.85, v)); self.syncPanel(); self.runMc(); },
      setTrials: v => { self.state.trials = Math.max(200, Math.min(8000, Math.round(v))); self.syncPanel(); },
      setSeed: v => { self.state.seed = v; },
      runMc: () => self.runMc(),
      canvasPixels: () => Object.fromEntries(Object.entries(self.cv).map(([k, c]) => [k, c ? c.width * c.height : 0])),
      navLinks: () => Array.from(document.querySelectorAll('.qtop a')).map(a => a.getAttribute('href')),
    };
  }
}

/* ---- QEC hub mode 描述符（R98）：壳按 id/tab 建切换条；css 在 activate 时注入、deactivate 时移除 ---- */
export const FAMILY_MODE = { handle: '__fm', id: 'family', name: '码族', tab: '▦', css: FM_CSS, mount(shell){ const app = new FamilyApp(shell); app.activate(); return app; } };
