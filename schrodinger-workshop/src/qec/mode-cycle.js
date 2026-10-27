/* ============================================================================
 * mode-cycle.js（QEC hub 模式）— 由 cycle.js 重构而来（R98 七页整合）：R84 循环 EC + 逻辑线路
 *
 * R82 是「一次 EC 用好几轮」，R84 把 EC 变成**周期**：编码 → [逻辑门 + EC 周期]×T → 解码。
 * 这一页要回答两个问题：
 *   ① R82 说的「最后一轮残留」在循环里去哪了？（中间周期的残留被下一周期清掉，
 *      只有**最后一个周期**的残留留下 ⟹ P_L 随周期数**饱和**而不是线性增长）
 *   ② 逻辑门上的错误能不能被后面的 EC 拦下？（门后有 EC：救回率 100%；门在末尾：0%）
 *
 * 三块可视化：
 *   #cyFlow  周期时间线（每周期 R 轮 EC + 周期之间的逻辑门 + 该门错误被谁处理）
 *   #cyCurve P_L 随周期数（当前配置 + 空闲对照 + 未编码基线 p）
 *   #cyGate  同一个门、门后有 / 无 EC 的单故障救回率（这是「循环 EC 有什么用」的直答）
 *
 * ⚠ 判定口径：含逻辑门时保真度必须用 |⟨ref|ψ⟩|²（ref 走同一条线路、含同一个门）。
 *   用「|0_L⟩ 的解析参数」会得到 F≈0（逻辑门把态翻到 |1_L⟩），这是 R84 踩过的坑。
 * ========================================================================== */
import { NAV_HREFS } from '../core/nav.js';
import { FS_KINDS, fsCircuit, fsFirstOrder, fsStream, fsEnsemble, fsRun, cyInterception, cySweepCycles } from '../physics/flagsynd.js';
import { qecGenericCsv, downloadText, encodeShort, mergeShort } from './export.js';
import { LiveDriver } from './live.js';

const CY_CSS = `
  #cyPanel{top:108px;left:14px;width:246px;padding:13px;z-index:10;max-height:calc(100vh - 234px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #cyPanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #cyPanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #cyPanel .row label{color:var(--dim);min-width:34px}
  #cyPanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #cyPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #cyPanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:44px;text-align:right}
  #cyPanel .btns{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:6px}
  #cyPanel .btns.g2{grid-template-columns:1fr 1fr}
  #cyPanel .btns.g3{grid-template-columns:repeat(3,1fr)}
  #cyPanel .btns.g4{grid-template-columns:repeat(4,1fr)}
  #cyPanel button{font-family:var(--mono);font-size:10px;padding:5px 3px;border-radius:6px;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #cyPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #cyPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #cyPanel .note{font-size:9.5px;color:var(--dim);line-height:1.5;margin-top:8px}
  #cyHud{top:108px;right:14px;padding:11px 13px;z-index:10;width:272px;font-family:var(--mono);
    max-height:calc(100vh - 154px);overflow-y:auto;scrollbar-width:thin;
    scrollbar-color:rgba(120,160,220,.25) transparent}
  #cyHud .hrow{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:2.5px 0}
  #cyHud .hrow span:first-child{color:var(--dim);white-space:nowrap}
  #cyHud .hrow span:last-child{color:var(--txt);text-align:right}
  #cyHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #cyHud .big{font-size:13px}
  #cyHud .warn{color:var(--red)}
  #cyHud .ok{color:var(--green)}
  #cyStage{position:fixed;left:50%;top:calc(50% + 8px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-columns:1fr 1fr;grid-template-rows:0.92fr 1fr;gap:9px;
    width:min(calc(100vw - 580px),1030px);height:min(80vh,660px)}
  #cyFlow{grid-column:1 / span 2}
  #cyFlow,#cyCurve,#cyGate{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #cyHint{left:14px;bottom:14px;z-index:10;padding:9px 12px;width:246px;font-size:10px;
    color:var(--dim);line-height:1.5;max-height:206px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #cyHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #cyDiag{position:fixed;left:-9999px}
  @media (max-width:1240px){#cyStage{width:calc(100vw - 40px)}#cyHint{display:none}}
`;

const cyCOL = {
  cyan: 'rgba(103,232,249,', mag: 'rgba(240,171,252,', amber: 'rgba(251,191,36,',
  red: 'rgba(248,113,113,', dim: 'rgba(154,167,189,', txt: 'rgba(230,237,243,',
  wire: 'rgba(120,160,220,', green: 'rgba(74,222,128,',
};
const cyMdLite = t => String(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const cyNf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');

const cyKINDS = ['std', 'cat'];
const cyLOGICS = [
  { k: 'none', name: '无', sym: '', desc: '周期之间不插逻辑门（纯 EC 循环）' },
  { k: 'idle', name: '空闲', sym: 'I', desc: '每数据比特一个恒等门——空闲本身也是错误机会（R80 的 idle 口径）' },
  { k: 'xl', name: 'X_L', sym: 'X', desc: '横向 X_L = Z₀Z₃Z₆：逐比特 Z，不传播错误' },
  { k: 'zl', name: 'Z_L', sym: 'Z', desc: '横向 Z_L = X₀X₁X₂：逐比特 X，不传播错误' },
];
const cyDECODES = [
  { k: 'single', name: '只修最后' },
  { k: 'immediate', name: '每轮都修' },
  { k: 'repeat', name: '连续一致', desc: '连续 need 轮综合征相同才修；T×R<2 时永远等不到第二轮（恒不修正）' },
];

export class CycleApp {
  constructor(shell){
    this.shell = shell;
    this.modeRoot = shell.modeRoot;
    this._listeners = [];
    /* R119：?s=1~<mode>~... 位置码本短链；坏串自动回落原 query */
    const q = mergeShort(new URLSearchParams(location.search));
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const str = (k, d) => (q.has(k) ? q.get(k) : d);
    this.state = {
      kind: cyKINDS.includes(str('kind', 'cat')) ? str('kind', 'cat') : 'cat',
      cycles: Math.max(1, Math.min(4, Math.round(num('cycles', 2)))),
      rounds: Math.max(1, Math.min(2, Math.round(num('rounds', 1)))),
      logic: cyLOGICS.some(l => l.k === str('logic', 'xl')) ? str('logic', 'xl') : 'xl',
      noisyLogic: str('noisyLogic', '1') !== '0',
      decode: cyDECODES.some(d => d.k === str('decode', 'repeat')) ? str('decode', 'repeat') : 'repeat',
      p: Math.max(0.001, Math.min(0.12, num('p', 0.02))),
      trials: Math.max(120, Math.min(1200, Math.round(num('trials', 400)))),
      seed: Math.round(num('seed', 7)),
      /* R98 P2 实时沙盒：?live=1 直达即播（MC 随播随长） */
      live: q.get('live') === '1',
    };
    this.ic = null;        /* 门错误拦截率（精确枚举，快） */
    this.sw = null;        /* P_L 随周期数（MC，慢） */
    this.mc = null;        /* 当前配置的 MC */
    this.fo = null;        /* 当前配置的精确单故障枚举 */
  }
  q(sel){ return this.modeRoot.querySelector(sel); }
  on(el, ev, fn){ if (el){ el.addEventListener(ev, fn); this._listeners.push([el, ev, fn]); } }

  deactivate(){
    clearTimeout(this._pDebounce); clearTimeout(this._deb); clearInterval(this._queueTimer);
    if (this._tok != null) this._tok++;   /* 作废在途 setTimeout 链（rounds/cycle/family） */
    this._ro?.disconnect();
    this.live?.dispose();                 /* R98 P2：停 rAF 播放环 */
    for (const [el, ev, fn] of this._listeners) el.removeEventListener(ev, fn);
    this._listeners.length = 0;
    this.modeRoot.replaceChildren();      /* 移除本 mode 的 DOM（面板/HUD/画布/提示） */
  }
  key(){ const s = this.state; return `${s.kind}|T${s.cycles}|R${s.rounds}|${s.logic}|${s.noisyLogic ? 1 : 0}|${s.decode}`; }
  cfg(extra = {}){
    const s = this.state;
    return { kind: s.kind, cycles: s.cycles, rounds: s.rounds, logic: s.logic,
      noisyLogic: s.noisyLogic, decode: s.decode, p: s.p, trials: s.trials, seed: s.seed, ...extra };
  }

  activate(){
    this.modeRoot.insertAdjacentHTML('beforeend', `
      <aside id="cyPanel" class="panel qpanel">
        <div class="grp">提取线路</div>
        <div class="btns g2" id="cyKinds"></div>
        <div class="grp">EC 周期数 T</div>
        <div class="btns" id="cyCycles"></div>
        <div class="grp">每周期轮数 R</div>
        <div class="btns g2" id="cyRounds"></div>
        <div class="grp">周期之间的逻辑门</div>
        <div class="btns" id="cyLogics"></div>
        <div class="grp">逻辑门段是否注错</div>
        <div class="btns g2" id="cyNoisy"></div>
        <div class="grp">跨轮解码</div>
        <div class="btns" id="cyDecodes"></div>
        <div class="grp">每门每比特错误率 p</div>
        <div class="row"><label>p</label><input type="range" id="cyP" min="0.001" max="0.10" step="0.001"><output id="cyPO">—</output></div>
        <div class="grp">MC 样本数</div>
        <div class="row"><label>N</label><input type="range" id="cyTrials" min="120" max="1200" step="40"><output id="cyTrialsO">—</output></div>
        <div class="grp">实验</div>
        <div class="btns g3">
          <button id="cyPlay">▶ 播放</button>
          <button id="cyRun">跑 MC + 扫描</button>
          <button id="cyOnce">单次试验</button>
        </div>
        <div class="grp">导出（R119 · 带可复现元数据头）</div>
        <div class="btns">
          <button id="cyExpSweep" title="周期数扫描：每点的周期数 T / 逻辑错误率 P_L / 平均故障数">扫描 CSV</button>
          <button id="cyExpMc" title="当前配置的 MC 结果与电路统计（单行）+ 元数据头：适合把一组「结论数字」贴进表里">结论 CSV</button>
        </div>
        <div id="cyExpMsg" style="font-family:var(--mono);font-size:9.5px;color:var(--dim);margin:2px 0 3px"></div>
        <div class="btns"><button id="cyExpUrl" title="把当前配置（码型 / 周期数 / 轮数 / 逻辑门 / 解码器 / p / 样本数 / seed）编码成链接，打开即还原">复制快照链接</button><button id="cyExpUrlOpen" title="在新标签页打开这份快照（用来验证链接真的还原了状态）">验证快照</button></div>

        <div class="note">拦截率用<b>精确单故障枚举</b>：逻辑门上的每个单故障位点，
          看它最后是「被后续 EC 纠回」还是「直达逻辑错误」。门后有 EC 与门在末尾的对照，
          就是「循环 EC 有什么用」的直答。</div>
      </aside>

      <aside id="cyHud" class="panel qhud">
        <div class="hrow"><span>配置</span><span id="hCfg" class="big">—</span></div>
        <div class="hrow"><span>开销</span><span id="hCost">—</span></div>
        <div class="hrow"><span>逻辑门</span><span id="hGates">—</span></div>
        <hr>
        <div class="hrow"><span>门错误救回率（后有 EC）</span><span id="hMid" class="big">—</span></div>
        <div class="hrow"><span>门错误救回率（门在末尾）</span><span id="hTail" class="big">—</span></div>
        <hr>
        <div class="hrow"><span>静默逻辑位点（精确）</span><span id="hLogic">—</span></div>
        <div class="hrow"><span>量级</span><span id="hOrder">—</span></div>
        <div class="hrow"><span>MC P_L</span><span id="hPL">—</span></div>
        <div class="hrow"><span>MC 平均故障数</span><span id="hF">—</span></div>
        <div class="hrow"><span>MC 真丢弃率</span><span id="hDisc">—</span></div>
        <hr>
        <div class="hrow"><span>最近一条轨迹</span><span id="hTrial">—</span></div>
      </aside>

      <div id="cyStage" class="qstage">
        <canvas id="cyFlow"></canvas>
        <canvas id="cyCurve"></canvas>
        <canvas id="cyGate"></canvas>
      </div>
      <div id="cyHint" class="panel qhint"><b>—</b><span></span></div>
      <div id="cyDiag"></div>
    `);
    this.cv = { flow: this.q('#cyFlow'), curve: this.q('#cyCurve'), gate: this.q('#cyGate') };

    const mk = (host, items, onPick) => {
      const el = this.q(host);
      if (!el) return;
      for (const it of items){
        const b = document.createElement('button');
        b.textContent = it.label; b.dataset.v = it.v;
        if (it.title) b.title = it.title;
        b.addEventListener('click', () => { onPick(it.v); this.syncPanel(); this.compute(); });
        el.appendChild(b);
      }
    };
    mk('#cyKinds', cyKINDS.map(k => ({ v: k, label: FS_KINDS[k].label })), v => this.state.kind = v);
    mk('#cyCycles', [1, 2, 3, 4].map(t => ({ v: t, label: 'T=' + t })), v => this.state.cycles = v);
    mk('#cyRounds', [1, 2].map(r => ({ v: r, label: 'R=' + r })), v => this.state.rounds = v);
    mk('#cyLogics', cyLOGICS.map(l => ({ v: l.k, label: l.name, title: l.desc })), v => this.state.logic = v);
    mk('#cyNoisy', [{ v: 1, label: '注错' }, { v: 0, label: '理想' }], v => this.state.noisyLogic = !!v);
    mk('#cyDecodes', cyDECODES.map(d => ({ v: d.k, label: d.name })), v => this.state.decode = v);

    const pIn = this.q('#cyP'), trIn = this.q('#cyTrials');
    this.on(pIn, 'input', () => { this.state.p = parseFloat(pIn.value); this.q('#cyPO').textContent = this.state.p.toFixed(3); });
    this.on(pIn, 'change', () => this.compute());
    this.on(trIn, 'input', () => { this.state.trials = parseInt(trIn.value, 10); this.q('#cyTrialsO').textContent = this.state.trials; });
    this.on(trIn, 'change', () => this.compute());
    this.on(this.q('#cyRun'), 'click', () => this.compute());
    this.on(this.q('#cyOnce'), 'click', () => { this.once(); this.renderHud(); this.drawAll(); });

    /* ---- R119 导出（同一套 export.js：元数据头/转义/缺失值口径与重复码页一致） ---- */
    this.on(this.q('#cyExpSweep'), 'click', () => this.exportData('sweep'));
    this.on(this.q('#cyExpMc'), 'click', () => this.exportData('mc'));
    this.on(this.q('#cyExpUrl'), 'click', () => this.copySnapshot());
    this.on(this.q('#cyExpUrlOpen'), 'click', () => { window.open(this._snapshotUrl(), '_blank'); });

    /* ---- R98 P2 实时沙盒：播放器（分帧累加，20fps） ---- */
    this.live = new LiveDriver({
      make: () => fsStream(this.state.kind, this.cfg()),
      onFrame: res => { this.mc = res; this.renderHud(); this.drawFlow(); },
      onState: () => this.syncPlayBtn(),
    });
    this.on(this.q('#cyPlay'), 'click', () => this.live.toggle());
    this.syncPlayBtn();
    if (this.state.live) this.live.start();   /* ?live=1：compute 的 MC 段将走播放分支 */

    if (window.ResizeObserver){ const ro = new ResizeObserver(() => this.resize()); ro.observe(this.q('#cyStage')); this._ro = ro; }
    this.syncPanel();
    this.renderHint();
    this.resize();
    this.compute();
  }

  syncPanel(){
    const s = this.state;
    const mark = (host, v) => { for (const b of this.modeRoot.querySelectorAll(host + ' button')) b.classList.toggle('on', b.dataset.v === String(v)); };
    mark('#cyKinds', s.kind); mark('#cyCycles', s.cycles); mark('#cyRounds', s.rounds);
    mark('#cyLogics', s.logic); mark('#cyNoisy', s.noisyLogic ? 1 : 0); mark('#cyDecodes', s.decode);
    for (const b of this.modeRoot.querySelectorAll('#cyNoisy button')) b.classList.toggle('dim', s.logic === 'none');
    /* 只有「连续一致」自己会在 T×R<2 时永远等不到确认 ⟹ 只置灰它这一个选项 */
    for (const b of this.modeRoot.querySelectorAll('#cyDecodes button'))
      b.classList.toggle('dim', b.dataset.v === 'repeat' && s.cycles * s.rounds < 2);
    const setv = (id, v) => { const e = this.q('#' + id); if (e) e.value = v; };
    setv('cyP', s.p); const po = this.q('#cyPO'); if (po) po.textContent = s.p.toFixed(3);
    setv('cyTrials', s.trials); const to = this.q('#cyTrialsO'); if (to) to.textContent = s.trials;
  }

  renderHint(){
    const b = this.q('#cyHint b'), sp = this.q('#cyHint span');
    if (b) b.textContent = '循环 EC + 逻辑线路（R84）';
    if (sp) sp.innerHTML = cyMdLite(
      'R82 的「一次 EC」把残留留在最后一轮。循环 EC 把它接成 **T 个周期**：' +
      '中间周期的残留由下一周期清掉，只剩**最后一个周期** ⟹ P_L 随 T 饱和而非线性增长。' +
      '逻辑门（横向 X_L / Z_L）与所有稳定子对易 ⟹ EC 看不见它、不会误纠；' +
      '但门上的**错误**会被下一周期拦下（救回率 100%），门在末尾则直达逻辑错误（0%）。');
  }

  resize(){
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of Object.values(this.cv)){
      if (!c) continue;
      const r = c.getBoundingClientRect();
      if (r.width < 4) continue;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    this.drawAll();
  }

  compute(){
    this.fo = null; this.mc = null; this.ic = null; this.sw = null; this.trial = null;
    this.renderHud(); this.drawAll();
    const tok = (this._tok = (this._tok || 0) + 1);
    setTimeout(() => {
      if (tok !== this._tok) return;
      /* 拦截率最贵的是 cat 的两个线路（~20 个位点 × 全线路），先算它 */
      this.ic = cyInterception(this.cfg());
      this.renderHud(); this.drawGate();
      setTimeout(() => {
        if (tok !== this._tok) return;
        /* R98 P2：播放中 → 换累加器接着演；否则同步全批（旧行为） */
        if (this.live && this.live.playing){
          this.live.sync();
          this.fo = fsFirstOrder(this.state.kind, this.cfg());
          this.renderHud(); this.drawFlow();
          setTimeout(() => {
            if (tok !== this._tok) return;
            const Ts = [1, 2, 3, 4].filter(t => t <= Math.max(2, this.state.cycles));
            this.sw = cySweepCycles(this.cfg({ Ts, trials: Math.max(120, Math.round(this.state.trials / 2)) }));
            this.renderHud(); this.drawCurve();
          }, 20);
          return;
        }
        this.mc = fsEnsemble(this.state.kind, this.cfg());
        this.fo = fsFirstOrder(this.state.kind, this.cfg());
        this.renderHud(); this.drawFlow();
        setTimeout(() => {
          if (tok !== this._tok) return;
          const Ts = [1, 2, 3, 4].filter(t => t <= Math.max(2, this.state.cycles));
          this.sw = cySweepCycles(this.cfg({ Ts, trials: Math.max(120, Math.round(this.state.trials / 2)) }));
          this.renderHud(); this.drawCurve();
        }, 20);
      }, 20);
    }, 30);
  }

  once(){
    this.trial = fsRun(this.state.kind, this.cfg(), null, (this.state.seed ^ 0x2b3f) >>> 0 || 1);
  }

  /* R98 P2：播放按钮文案/态（on 类 = 播放中） */
  syncPlayBtn(){
    const b = this.q('#cyPlay');
    if (!b) return;
    const on = !!(this.live && this.live.playing);
    b.textContent = on ? '⏸ 暂停' : '▶ 播放';
    b.classList.toggle('on', on);
  }

  renderHud(){
    const s = this.state;
    const set = (id, v, cls) => { const el = this.q('#' + id); if (!el) return; el.textContent = v; el.className = cls || ''; };
    const lg = (cyLOGICS.find(l => l.k === s.logic) || {}).name || '无';
    /* R=1 时 repeat 永远等不到第二轮确认 ⟹ 恒不修正。这不是 bug 而是口径：
       提前亮出来，避免把「没修」误读成「修不好」。 */
    const vacuous = s.decode === 'repeat' && s.rounds < 2;
    set('hCfg', `${FS_KINDS[s.kind].label} · T=${s.cycles} × R=${s.rounds} · ${lg}` +
      (vacuous ? ' · ⚠ R=1 时「连续一致」永不确认 ⟹ 不修正' : ''), vacuous ? 'warn' : '');
    const circ = fsCircuit(s.kind, this.cfg());
    set('hCost', `${circ.stats.gates} 门 · ${circ.stats.meas} 测 · ${circ.stats.nq}q`);
    set('hGates', s.logic === 'none' ? '—（未插门）' : `${circ.stats.logicGates} 个（${s.noisyLogic ? '注错' : '理想'}）`);
    if (this.ic){
      set('hMid', this.ic.mid.rescue == null ? '—' : (100 * this.ic.mid.rescue).toFixed(0) + '%  (' + this.ic.mid.perfect + '/' + this.ic.mid.n + ')',
        this.ic.mid.rescue >= 0.99 ? 'ok' : (this.ic.mid.rescue <= 0.01 ? 'warn' : ''));
      set('hTail', this.ic.tail.rescue == null ? '—' : (100 * this.ic.tail.rescue).toFixed(0) + '%  (' + this.ic.tail.perfect + '/' + this.ic.tail.n + ')',
        this.ic.tail.rescue <= 0.01 ? 'warn' : 'ok');
    } else { set('hMid', '—'); set('hTail', '—'); }
    if (this.fo){
      const e = this.fo.byPhase.extract;
      set('hLogic', `${e.logic} / ${e.n}`, e.logic ? 'warn' : 'ok');
      set('hOrder', e.logic === 0 ? 'O(p²)（容错）' : 'O(p)（不容错）', e.logic === 0 ? 'ok' : 'warn');
    } else { set('hLogic', '—'); set('hOrder', '—'); }
    if (this.mc){
      set('hPL', (100 * this.mc.PL).toFixed(2) + '%  (' + this.mc.logic + '/' + this.mc.trials + ')');
      set('hF', cyNf(this.mc.meanFaults, 2));
      set('hDisc', (100 * this.mc.noGoodRate).toFixed(1) + '%');
    } else { set('hPL', '—'); set('hF', '—'); set('hDisc', '—'); }
    if (this.trial){
      const t = this.trial;
      const marks = t.synRounds.map((_, r) => {
        const usable = t.usableR ? t.usableR[r] : true;
        const fx = (t.fixLog || []).find(f => f.round === r);
        if (!usable) return '✗';
        return fx && fx.fix.length ? '✓' : '·';
      }).join('');
      set('hTrial', `${marks} · F=${cyNf(t.F, 3)}${t.cls === 'perfect' ? ' 纠回' : t.cls === 'logic' ? ' 静默逻辑' : ''}`);
    } else set('hTrial', '—');
  }

  /* 画布 1：周期时间线 —— 每周期 R 轮 EC，周期间标逻辑门 */
  drawFlow(){
    const c = this.cv.flow;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = cyCOL.txt + '.95)';
    g.fillText('周期时间线：每周期 R 轮 EC（格 = 一轮，✓ 落了修正 / ✗ 无可用读数），周期之间的 ⟦门⟧ 由后面的周期处理', 10 * dpr, 16 * dpr);

    const s = this.state;
    const T = s.cycles, R = s.rounds;
    const lg = cyLOGICS.find(l => l.k === s.logic) || cyLOGICS[0];
    const x0 = 12 * dpr, top = 40 * dpr;
    const rowH = Math.min(66 * dpr, (H - top - 44 * dpr));
    const cyW = (W - 2 * x0) / T;

    for (let t = 0; t < T; t++){
      const cx = x0 + cyW * t;
      /* 周期框 */
      g.strokeStyle = cyCOL.wire + '.38)'; g.lineWidth = 1 * dpr;
      g.beginPath(); g.roundRect ? g.roundRect(cx + 4 * dpr, top, cyW - 8 * dpr, rowH, 8 * dpr)
        : g.rect(cx + 4 * dpr, top, cyW - 8 * dpr, rowH);
      g.stroke();
      g.font = (10 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = cyCOL.dim + '.95)'; g.textAlign = 'left';
      g.fillText('周期 ' + (t + 1), cx + 12 * dpr, top + 15 * dpr);

      /* R 个 EC 轮 */
      const boxW = Math.min(34 * dpr, (cyW - 40 * dpr) / Math.max(1, R));
      for (let r = 0; r < R; r++){
        const bx = cx + 12 * dpr + r * (boxW + 6 * dpr);
        const by = top + 24 * dpr;
        g.fillStyle = cyCOL.cyan + '.10)';
        g.strokeStyle = cyCOL.cyan + '.35)';
        g.beginPath(); g.rect(bx, by, boxW, 20 * dpr); g.fill(); g.stroke();
        g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
        g.fillStyle = cyCOL.dim + '.9)';
        g.fillText('R' + (r + 1), bx + boxW / 2, by + 13 * dpr);
      }
      /* 该周期的自检率（样本级统计，逐周期细分留给轨迹行） */
      g.font = (9 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
      g.fillStyle = cyCOL.dim + '.8)';
      g.fillText(this.mc ? `自检 ${(100 * this.mc.discard).toFixed(0)}%` : '计算中…', cx + 12 * dpr, top + rowH - 10 * dpr);

      /* 周期之间的逻辑门 */
      if (t > 0 && s.logic !== 'none'){
        const gx = cx - 2 * dpr;
        g.save();
        g.translate(gx, top + rowH / 2);
        g.fillStyle = cyCOL.amber + '.16)';
        g.strokeStyle = cyCOL.amber + '.75)'; g.lineWidth = 1.2 * dpr;
        g.beginPath(); g.rect(-12 * dpr, -13 * dpr, 24 * dpr, 26 * dpr); g.fill(); g.stroke();
        g.font = (12 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
        g.fillStyle = cyCOL.amber + '.95)';
        g.fillText(lg.sym || '·', 0, 4 * dpr);
        g.restore();
      }
    }

    /* 末尾：解码 */
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'right';
    g.fillStyle = cyCOL.mag + '.9)';
    g.fillText('→ 解码 · 判定', W - 12 * dpr, top + rowH + 16 * dpr);

    /* 图例 */
    g.textAlign = 'left'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = cyCOL.dim + '.8)';
    const legend = '⟦' + (lg.sym || '·') + '⟧ = 逻辑门（' + lg.name + '）：与稳定子对易 ⟹ EC 看不见它本身，但看得见它上面的错误';
    g.fillText(legend, 10 * dpr, H - 8 * dpr);
  }

  /* 画布 2：P_L 随周期数 */
  drawCurve(){
    const c = this.cv.curve;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = cyCOL.txt + '.95)';
    g.fillText('P_L 随周期数（饱和 = 中间残留被后续周期清掉）', 10 * dpr, 16 * dpr);

    if (!this.sw){
      g.font = (10 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = cyCOL.dim + '.8)';
      g.fillText('MC 扫描计算中…', 10 * dpr, 36 * dpr);
      return;
    }
    const sw = this.sw;
    const px0 = 50 * dpr, py0 = 40 * dpr, pw = W - px0 - 16 * dpr, ph = H - py0 - 30 * dpr;
    const Ts = sw.T;
    const maxPL = Math.max(this.state.p, 0.02, ...sw.PL) * 1.25;
    const X = t => px0 + (Ts.length <= 1 ? pw / 2 : (t - Ts[0]) / (Ts[Ts.length - 1] - Ts[0]) * pw);
    const Y = v => py0 + ph - Math.min(1, v / maxPL) * ph;

    /* 网格 + 轴 */
    g.strokeStyle = cyCOL.wire + '.14)'; g.lineWidth = 1 * dpr;
    g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
    for (let k = 0; k <= 4; k++){
      const v = maxPL * k / 4, y = Y(v);
      g.beginPath(); g.moveTo(px0, y); g.lineTo(px0 + pw, y); g.stroke();
      g.fillStyle = cyCOL.dim + '.7)'; g.textAlign = 'right';
      g.fillText((100 * v).toFixed(1) + '%', px0 - 4 * dpr, y + 3 * dpr);
    }
    for (const t of Ts){
      const x = X(t);
      g.beginPath(); g.moveTo(x, py0); g.lineTo(x, py0 + ph); g.stroke();
      g.fillStyle = cyCOL.dim + '.75)'; g.textAlign = 'center';
      g.fillText('T=' + t, x, py0 + ph + 13 * dpr);
    }

    /* 未编码基线 p */
    g.strokeStyle = cyCOL.dim + '.5)'; g.setLineDash([4 * dpr, 4 * dpr]);
    g.beginPath(); g.moveTo(px0, Y(this.state.p)); g.lineTo(px0 + pw, Y(this.state.p)); g.stroke();
    g.setLineDash([]);
    g.fillStyle = cyCOL.dim + '.85)'; g.textAlign = 'left';
    g.fillText('未编码 p', px0 + 4 * dpr, Y(this.state.p) - 4 * dpr);

    /* 曲线 */
    g.strokeStyle = cyCOL.cyan + '.95)'; g.lineWidth = 1.8 * dpr;
    g.beginPath();
    sw.PL.forEach((v, i) => { const x = X(Ts[i]), y = Y(v); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    sw.PL.forEach((v, i) => {
      const x = X(Ts[i]), y = Y(v);
      g.beginPath(); g.arc(x, y, 3.2 * dpr, 0, Math.PI * 2);
      g.fillStyle = cyCOL.cyan + '.95)'; g.fill();
      g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillStyle = cyCOL.txt + '.9)';
      g.fillText((100 * v).toFixed(2), x, y - 7 * dpr);
    });

    g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillStyle = cyCOL.dim + '.8)';
    g.fillText(`MC ${sw.trials} 样本/点 · 每点平均故障 ${sw.faults.map(f => f.toFixed(1)).join(' / ')}`, 10 * dpr, H - 8 * dpr);
  }

  /* 画布 3：门错误救回率（mid vs tail） */
  drawGate(){
    const c = this.cv.gate;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = cyCOL.txt + '.95)';
    g.fillText('同一个逻辑门错误，门后有 / 无 EC', 10 * dpr, 16 * dpr);
    g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = cyCOL.dim + '.85)';
    g.fillText('精确单故障枚举（immediate 解码：repeat 需要 2 轮一致，单周期内等不到确认）', 10 * dpr, 29 * dpr);

    if (!this.ic){ g.fillStyle = cyCOL.dim + '.8)'; g.fillText('计算中…', 10 * dpr, 50 * dpr); return; }
    const rows = [
      { k: 'mid', label: '门在周期之间', sub: '后面还有 EC', hue: cyCOL.cyan, a: this.ic.mid },
      { k: 'tail', label: '门在末尾', sub: '后面没有 EC', hue: cyCOL.red, a: this.ic.tail },
    ];
    const x0 = 12 * dpr, labelW = 108 * dpr, barX = x0 + labelW, barW = W - barX - 58 * dpr;
    const top = 46 * dpr, rowH = (H - top - 32 * dpr) / rows.length;
    for (const r of rows){
      const y = top + rowH * 0.5 + (rowH * rows.indexOf(r));
      g.textAlign = 'left'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = cyCOL.txt + '.9)';
      g.fillText(r.label, x0, y - 2 * dpr);
      g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = cyCOL.dim + '.8)';
      g.fillText(r.sub + ' · n=' + r.a.n, x0, y + 10 * dpr);
      /* 轨道 */
      g.fillStyle = 'rgba(10,18,32,.9)';
      g.strokeStyle = cyCOL.wire + '.28)'; g.lineWidth = 1 * dpr;
      g.beginPath(); g.rect(barX, y - 9 * dpr, barW, 18 * dpr); g.fill(); g.stroke();
      /* 分段：纠回 / 仅规范 / 逻辑受损 */
      const tot = Math.max(1, r.a.n);
      let acc = 0;
      const segs = [['perfect', cyCOL.cyan], ['gauge', cyCOL.green], ['outside', cyCOL.amber], ['logic', cyCOL.red], ['flagged', cyCOL.mag]];
      for (const [key, hue] of segs){
        const w = barW * (r.a[key] || 0) / tot;
        if (w <= 0) continue;
        g.fillStyle = hue + '.62)';
        g.fillRect(barX + acc, y - 9 * dpr, w, 18 * dpr);
        acc += w;
      }
      g.textAlign = 'left'; g.font = (10 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = r.a.rescue >= 0.99 ? cyCOL.green + '.95)' : (r.a.rescue <= 0.01 ? cyCOL.red + '.95)' : cyCOL.amber + '.95)');
      g.fillText((100 * r.a.rescue).toFixed(0) + '%', barX + barW + 6 * dpr, y + 4 * dpr);
    }
    g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillStyle = cyCOL.dim + '.8)';
    g.fillText('青 = 纠回 · 绿 = 仅规范 · 黄 = 逻辑受损 · 红 = 静默逻辑 · 品红 = 检出', 10 * dpr, H - 8 * dpr);
  }

  drawAll(){ this.drawFlow(); this.drawCurve(); this.drawGate(); }

  /* ---- R119 导出 ---- */
  _expMeta(){
    const st = this.state;
    return {
      product: '循环 EC（重复码 + 逻辑门）',
      extra: [
        'kind=' + st.kind + '  logic=' + st.logic + '  decode=' + st.decode,
        'rounds=' + st.T + '  p=' + st.p + '  trials=' + st.trials + '  seed=' + st.seed,
      ],
      generated: new Date().toISOString(),
    };
  }
  _exportText(kind){
    const meta = this._expMeta();
    if (kind === 'sweep'){
      const sw = this.sw;
      if (!sw) return null;
      const rows = sw.T.map((T, i) => ({ T, pl: sw.PL[i], f: sw.faults[i] }));
      return {
        name: 'cycle-sweep.csv',
        text: qecGenericCsv([
          { k: 'T', n: 'rounds', num: true },
          { k: 'pl', n: 'P_L', num: true },
          { k: 'f', n: 'mean_faults', num: true },
        ], rows, { ...meta, title: '周期数扫描导出' }),
        rows: rows.length,
      };
    }
    const mc = this.mc;
    if (!mc) return null;
    const st = (this.fo && this.fo.stats) || fsCircuit(this.state.kind, this.cfg()).stats;
    /* 列与 circuitStats 的真实字段对齐（stats 里没有 M/opps，别凭空写） */
    const rows = [{
      PL: mc.PL, logic: mc.logic, trials: mc.trials, discard: mc.discard,
      noGood: mc.noGoodRate, meanFaults: mc.meanFaults,
      nq: st.nq, data: st.data, anc: st.ancillas,
      gates: st.gates, cnots: st.cnots, singles: st.singles, meas: st.meas,
      rounds: st.rounds, cycles: st.cycles, logicGates: st.logicGates,
    }];
    return {
      name: 'cycle-summary.csv',
      text: qecGenericCsv([
        { k: 'PL', n: 'P_L', num: true },
        { k: 'logic', n: 'logical_errors', num: true },
        { k: 'trials', n: 'trials', num: true },
        { k: 'discard', n: 'discarded', num: true },
        { k: 'noGood', n: 'no_good_rate', num: true },
        { k: 'meanFaults', n: 'mean_faults', num: true },
        { k: 'nq', n: 'qubits_total', num: true },
        { k: 'data', n: 'data_qubits', num: true },
        { k: 'anc', n: 'ancillas', num: true },
        { k: 'gates', n: 'gates', num: true },
        { k: 'cnots', n: 'cnots', num: true },
        { k: 'singles', n: 'single_qubit_gates', num: true },
        { k: 'meas', n: 'measurements', num: true },
        { k: 'rounds', n: 'rounds', num: true },
        { k: 'cycles', n: 'cycles', num: true },
        { k: 'logicGates', n: 'logic_gates', num: true },
      ], rows, { ...meta, title: '当前配置结论导出' }),
      rows: rows.length,
    };
  }
  /* R118：快照链接 */
  _snapshotUrl(){
    const s = this.state;
    const q = new URLSearchParams();
    q.set('mode', 'cycle');
    q.set('kind', s.kind);
    q.set('cycles', String(s.cycles));
    q.set('rounds', String(s.rounds));
    q.set('logic', s.logic);
    q.set('decode', s.decode);
    q.set('noisyLogic', s.noisyLogic ? '1' : '0');
    q.set('p', String(s.p));
    q.set('trials', String(s.trials));
    q.set('seed', String(s.seed));
    return location.origin + location.pathname + '?' + q.toString();
  }
  _shortUrl(){
    const s = this.state;
    const tok = encodeShort('cycle', {
      kind: s.kind, cycles: s.cycles, rounds: s.rounds, logic: s.logic,
      decode: s.decode, noisyLogic: s.noisyLogic ? 1 : 0,
      p: s.p, trials: s.trials, seed: s.seed,
    });
    return location.origin + location.pathname + '?mode=cycle&s=' + tok;
  }
  copySnapshot(){
    const url = this._shortUrl(), msg = this.q('#cyExpMsg');
    const done = ok => { if (msg) msg.innerHTML = (ok ? '已复制快照链接' : '剪贴板不可用，请手动复制') +
      '<br><span style="color:var(--cyan);word-break:break-all">' + url + '</span>'; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
        return url;
      }
    } catch (e) {}
    done(false);
    return url;
  }

  exportData(kind){
    const out = this._exportText(kind);
    const msg = this.q('#cyExpMsg');
    if (!out){
      if (msg) msg.textContent = '先点「跑 MC + 扫描」，再导出';
      return null;
    }
    downloadText(out.name, out.text);
    if (msg) msg.textContent = '已导出 ' + out.name + '（' + out.rows + ' 行 + 元数据头）';
    return out;
  }

  debugHandle(){
    const self = this;
    return {
      get state(){ return self.state; },
      kinds: () => cyKINDS.map(k => ({ k, label: FS_KINDS[k].label })),
      /* R119：导出（与按钮同一份字符串） */
      exportText: kind => { const o = self._exportText(kind); return o ? { name: o.name, text: o.text, rows: o.rows } : null; },
      snapshotUrl: () => self._snapshotUrl(),
      shortUrl: () => self._shortUrl(),
      logics: () => cyLOGICS.map(l => ({ k: l.k, name: l.name })),
      navLinks: () => NAV_HREFS,
      data: () => ({
        cfg: { ...self.state },
        stats: self.fo ? self.fo.stats : (() => { const c = fsCircuit(self.state.kind, self.cfg()); return c.stats; })(),
        ic: self.ic ? { mid: { ...self.ic.mid }, tail: { ...self.ic.tail } } : null,
        fo: self.fo ? { n: self.fo.byPhase.extract.n, logic: self.fo.byPhase.extract.logic,
          perfect: self.fo.byPhase.extract.perfect, gauge: self.fo.byPhase.extract.gauge,
          outside: self.fo.byPhase.extract.outside, flagged: self.fo.byPhase.extract.flagged,
          disagree: self.fo.disagree } : null,
      }),
      mc: () => (self.mc ? { PL: self.mc.PL, logic: self.mc.logic, trials: self.mc.trials,
        discard: self.mc.discard, noGoodRate: self.mc.noGoodRate, meanFaults: self.mc.meanFaults } : null),
      sweep: () => (self.sw ? { T: self.sw.T.slice(), PL: self.sw.PL.slice(), faults: self.sw.faults.slice(),
        trials: self.sw.trials } : null),
      trial: () => (self.trial ? { F: self.trial.F, cls: self.trial.cls, rounds: self.trial.rounds,
        synRounds: self.trial.synRounds.map(s => s.slice()), usableR: (self.trial.usableR || []).slice(),
        fixLog: (self.trial.fixLog || []).map(f => ({ round: f.round, fix: f.fix.length })),
        logicGates: (self.trial.fixLog || []).length } : null),
      /* R98 P2：实时播放（按钮等价路径；测试可直驱） */
      play: () => { self.live.start(); self.syncPlayBtn(); },
      pause: () => { self.live.stop(); self.syncPlayBtn(); },
      live: () => ({ playing: self.live.playing, ...self.live.progress }),
      canvasPixels: () => {
        const f = sel => {
          const c = self.modeRoot.querySelector(sel);
          if (!c || !c.width) return -1;
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
          return n;
        };
        return { flow: f('#cyFlow'), curve: f('#cyCurve'), gate: f('#cyGate') };
      },
    };
  }
}

/* ---- QEC hub mode 描述符（R98）：壳按 id/tab 建切换条；css 在 activate 时注入、deactivate 时移除 ---- */
export const CYCLE_MODE = { handle: '__cy', id: 'cycle', name: '循环 EC', tab: '↻', css: CY_CSS, mount(shell){ const app = new CycleApp(shell); app.activate(); return app; } };
