/* ============================================================================
 * flag.js（页面）— R81 综合提取自身的容错：冗余验证 vs 猫态
 *
 * 物理核心在 src/physics/flagsynd.js。本页只做三件事：
 *   ① 把「同一个语义位点」的故障在四种线路上并排画出来（ancilla 吃一个 X，
 *      看它顺着 CNOT 扇到几个数据比特）；
 *   ② 把**精确单故障枚举**的五类结局画成堆叠条（perfer / gauge / outside / logic /
 *      flagged），这是本页的主证据：只有 std 有「单故障 → 静默逻辑」的位点；
 *   ③ 把传播权重直方图与开销（nq / ancilla / 门数 / 测量数）并排，摆出容错的代价。
 *
 * 判定口径（与物理核心一致）：修正后、解码前取样，用 8 个稳定子期望 + 三个逻辑分量
 * 符号定陪集；另有一条独立的 Pauli 帧演算给出权重，两条路径逐位点对账（不一致即报错）。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { navHtml } from './core/nav.js';
import { FS_KINDS, FS_DEFAULTS, fsFirstOrder, fsProbeWorst, fsEnsemble } from './physics/flagsynd.js';

const FL_CSS = `
  #flTop{top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;
    padding:9px 16px;z-index:10;white-space:nowrap}
  #flTop .logo{font-family:var(--mono);font-weight:700;font-size:14px;letter-spacing:.12em;
    background:linear-gradient(90deg,var(--cyan),var(--mag));-webkit-background-clip:text;background-clip:text;color:transparent}
  #flTop .eq{font-family:var(--mono);font-size:12px;color:var(--dim)}
  #flTop .eq b{color:var(--cyan);font-weight:600}
  #flTop .eq i{color:var(--amber);font-style:italic}
  #flTop a{font-family:var(--mono);font-size:10.5px;color:var(--dim);text-decoration:none;
    border:1px solid var(--line);border-radius:6px;padding:3px 7px;transition:all .15s}
  #flTop a:hover{color:var(--cyan);border-color:rgba(103,232,249,.4)}
  #flTop a.cur{color:var(--mag);border-color:rgba(240,171,252,.45)}
  #flPanel{top:74px;left:14px;width:242px;padding:13px;z-index:10;max-height:calc(100vh - 200px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #flPanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #flPanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #flPanel .row label{color:var(--dim);min-width:34px}
  #flPanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #flPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #flPanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:46px;text-align:right}
  #flPanel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
  #flPanel .btns.g3{grid-template-columns:repeat(3,1fr)}
  #flPanel .btns.g4{grid-template-columns:1fr 1fr}
  #flPanel button{font-family:var(--mono);font-size:10.5px;padding:5px 4px;border-radius:6px;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #flPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #flPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #flPanel .note{font-size:9.5px;color:var(--dim);line-height:1.55;margin-top:8px}
  #flHud{top:74px;right:14px;padding:11px 13px;z-index:10;width:262px;font-family:var(--mono);
    max-height:calc(100vh - 120px);overflow-y:auto;scrollbar-width:thin;
    scrollbar-color:rgba(120,160,220,.25) transparent}
  #flHud .hrow{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:2.5px 0}
  #flHud .hrow span:first-child{color:var(--dim)}
  #flHud .hrow span:last-child{color:var(--txt)}
  #flHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #flHud .big{font-size:13px}
  #flHud .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:8px 0 4px}
  #flHud .cap{font-size:9.5px;color:var(--dim);line-height:1.5;margin-top:5px}
  #flHud .cap b{color:var(--amber);font-weight:600}
  #flHud .warn{color:var(--red)}
  #flStage{position:fixed;left:50%;top:calc(50% + 8px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1.02fr 1fr;gap:9px;
    width:min(calc(100vw - 560px),1040px);height:min(80vh,660px)}
  #flFan{grid-column:1 / span 2}
  #flFan,#flFate,#flProp{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #flHint{left:14px;bottom:14px;z-index:10;padding:9px 12px;width:242px;font-size:10px;
    color:var(--dim);line-height:1.55;max-height:210px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #flHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #flDiag{position:fixed;left:-9999px}
  @media (max-width:1220px){#flStage{width:calc(100vw - 40px)}#flHint{display:none}}
`;

/* 站点 palette（core/styles.js 的 :root 变量，canvas 里只能用字面量） */
const COL = {
  cyan: 'rgba(103,232,249,', mag: 'rgba(240,171,252,', amber: 'rgba(251,191,36,',
  red: 'rgba(248,113,113,', dim: 'rgba(154,167,189,', txt: 'rgba(230,237,243,',
  wire: 'rgba(120,160,220,', green: 'rgba(74,222,128,',
};
const mdLite = t => String(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : '—');
const nf = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');

/* 五类结局：颜色 + 名称（与物理核心的 bucket 一一对应） */
const FATES = [
  { k: 'perfect', name: '纠回', hue: COL.cyan, desc: '残差 ∈ S' },
  { k: 'gauge', name: '仅规范比特', hue: COL.green, desc: 'F=1，逻辑比特完好' },
  { k: 'outside', name: '逻辑受损', hue: COL.amber, desc: '残差 ∉ N(S) 且 F<1' },
  { k: 'logic', name: '静默逻辑', hue: COL.red, desc: '残差 ∈ 逻辑陪集（最危险）' },
  { k: 'flagged', name: '检出丢弃', hue: COL.mag, desc: 'flag=1' },
];
const KINDS = Object.keys(FS_KINDS);
/* 谱权重：depolar 三等分；x/z 只一种 */
const SPEC_W = { depolar: { x: 1 / 3, y: 1 / 3, z: 1 / 3 }, x: { x: 1 }, z: { z: 1 } };
const SPEC_NAME = { depolar: '退极化 X/Y/Z', x: '仅 X', z: '仅 Z' };

export class FlagApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const str = (k, d) => (q.has(k) ? q.get(k) : d);
    this.state = {
      kind: FS_KINDS[str('kind', 'std')] ? str('kind', 'std') : 'std',
      spectrum: SPEC_W[str('spectrum', 'depolar')] ? str('spectrum', 'depolar') : 'depolar',
      p: Math.max(0, Math.min(0.2, num('p', FS_DEFAULTS.p))),
      trials: Math.max(100, Math.min(2000, Math.round(num('trials', 400)))),
      seed: Math.round(num('seed', FS_DEFAULTS.seed)),
    };
    this.fo = {};        /* kind → fsFirstOrder 结果（精确枚举，一次算好） */
    this.worst = {};     /* kind → fsProbeWorst（扇出图） */
    this.mc = null;
    this._queue = KINDS.slice();
    this._busy = false;
  }

  q(sel){ return this.container.querySelector(sel) || document.querySelector(sel); }
  on(el, ev, fn){ if (el) el.addEventListener(ev, fn); }

  mount(){
    injectStyles();
    const sheet = document.createElement('style');
    sheet.textContent = FL_CSS;
    document.head.appendChild(sheet);
    this.container.insertAdjacentHTML('beforeend', `
      <header id="flTop" class="panel">
        <div class="logo">容错工场</div>
        <div class="eq">每门一次错误机会 ─► 综合提取<b>自己</b>出错时，码还成立吗？</div>
        ${navHtml('./flag.html')}
      </header>

      <aside id="flPanel" class="panel">
        <div class="grp">提取线路（X 类 / Z 类）</div>
        <div class="btns g4" id="flKinds"></div>

        <div class="grp">错误谱（每门每比特以 p 注入）</div>
        <div class="btns g3" id="flSpectra"></div>

        <div class="grp">每门每比特错误率 p</div>
        <div class="row"><label>p</label><input type="range" id="flP" min="0" max="0.1" step="0.001"><output id="flPO">—</output></div>

        <div class="grp">MC 样本数（只跑选中线路）</div>
        <div class="row"><label>N</label><input type="range" id="flTrials" min="200" max="2000" step="100"><output id="flTrialsO">—</output></div>

        <div class="grp">实验</div>
        <div class="btns">
          <button id="flRun">跑一次 MC</button>
          <button id="flReseed">换种子</button>
        </div>

        <div class="note">
          精确枚举与 <b>p 无关</b>（逐个位点注入一次，统计结局），所以改 p 只改一阶率、不重算表。
          MC 才按 p 采样。</div>
      </aside>

      <aside id="flHud" class="panel">
        <div class="hrow"><span>线路</span><span id="hKind" class="big">—</span></div>
        <div class="hrow"><span>比特 / ancilla</span><span id="hLayout">—</span></div>
        <div class="hrow"><span>门数 / CNOT / 测量</span><span id="hCost">—</span></div>
        <hr>
        <div class="hrow"><span>提取段位点</span><span id="hSites">—</span></div>
        <div class="hrow"><span>纠回 / 规范 / 受损</span><span id="hFate1">—</span></div>
        <div class="hrow"><span>静默逻辑位点</span><span id="hLogic" class="big">—</span></div>
        <div class="hrow"><span>检出位点</span><span id="hFlag">—</span></div>
        <div class="hrow"><span>传播上界 wMax</span><span id="hW">—</span></div>
        <hr>
        <div class="hrow"><span>一阶 P(静默逻辑)</span><span id="hPL1">—</span></div>
        <div class="hrow"><span>一阶 P(检出)</span><span id="hDet1">—</span></div>
        <div class="hrow"><span>一阶 P(逻辑受损)</span><span id="hHarm1">—</span></div>
        <hr>
        <div class="hrow"><span>MC 逻辑错误率</span><span id="hMcPL">—</span></div>
        <div class="hrow"><span>MC 丢弃率</span><span id="hMcDisc">—</span></div>
        <div class="hrow"><span>MC 平均故障数</span><span id="hMcF">—</span></div>
        <hr>
        <div class="hrow"><span>语义位点</span><span id="hSem">—</span></div>
        <div class="hrow"><span>最坏位点</span><span id="hWorst">—</span></div>
      </aside>

      <div id="flStage">
        <canvas id="flFan"></canvas>
        <canvas id="flFate"></canvas>
        <canvas id="flProp"></canvas>
      </div>

      <div id="flHint" class="panel"><b>—</b><span></span></div>
      <div id="flDiag"></div>
    `);
    this.cv = { fan: this.q('#flFan'), fate: this.q('#flFate'), prop: this.q('#flProp') };

    const kb = this.q('#flKinds');
    for (const k of KINDS){
      const b = document.createElement('button');
      b.textContent = FS_KINDS[k].label; b.dataset.kind = k; b.title = FS_KINDS[k].desc;
      this.on(b, 'click', () => { this.state.kind = k; this.syncPanel(); this.renderHud(); this.drawAll(); });
      kb.appendChild(b);
    }
    const sb = this.q('#flSpectra');
    for (const sp of ['depolar', 'x', 'z']){
      const b = document.createElement('button');
      b.textContent = SPEC_NAME[sp]; b.dataset.sp = sp;
      this.on(b, 'click', () => { this.state.spectrum = sp; this.syncPanel(); this.renderHud(); this.drawAll(); });
      sb.appendChild(b);
    }
    this.on(this.q('#flP'), 'input', e => {
      this.state.p = parseFloat(e.target.value);
      this.syncPanel(); this.renderHud(); this.drawAll();
    });
    this.on(this.q('#flTrials'), 'input', e => {
      this.state.trials = parseInt(e.target.value, 10);
      this.syncPanel(); this.renderHud();
    });
    this.on(this.q('#flRun'), 'click', () => this.runMc());
    this.on(this.q('#flReseed'), 'click', () => {
      this.state.seed = (this.state.seed * 1103515245 + 12345) % 2147483647;
      this.runMc();
    });
    this.on(window, 'resize', () => this.resize());
    if (window.ResizeObserver){
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.q('#flStage'));
      this._ro = ro;
    }

    this.syncPanel();
    this.renderHint();
    this.resize();
    /* 枚举较贵（cat ≈1.5 s）：逐条线路排队算，让首屏先画出来 */
    this._queueTimer = setInterval(() => {
      if (!this._queue.length){ clearInterval(this._queueTimer); this._queueTimer = 0; return; }
      const k = this._queue.shift();
      this.fo[k] = fsFirstOrder(k, {});
      this.worst[k] = fsProbeWorst(k, {});
      this.renderHud();
      this.drawAll();
    }, 30);
  }

  syncPanel(){
    const s = this.state;
    for (const b of this.container.querySelectorAll('#flKinds button')) b.classList.toggle('on', b.dataset.kind === s.kind);
    for (const b of this.container.querySelectorAll('#flSpectra button')) b.classList.toggle('on', b.dataset.sp === s.spectrum);
    const setv = (id, v) => { const e = this.q('#' + id); if (e) e.value = v; };
    setv('flP', s.p); this.q('#flPO').textContent = s.p.toFixed(3);
    setv('flTrials', s.trials); this.q('#flTrialsO').textContent = s.trials;
  }

  renderHint(){
    const b = this.q('#flHint b'), sp = this.q('#flHint span');
    if (b) b.textContent = '综合提取自己的容错（R81）';
    if (sp) sp.innerHTML = mdLite(
      'R79 把综合提取当**理想**的；真实线路每个 CNOT 都是错误机会。X 类 ancilla 在 |+⟩ 上，' +
      '**X 错误是它的稳定子** ⟹ 读数看不见，却把 X 扇到后面所有数据比特——单故障就**静默逻辑错误**。');
  }

  /* 谱加权的一阶率：每个位点的概率 = p × w(Pauli 类型) */
  derive(kind){
    const fo = this.fo[kind];
    if (!fo) return null;
    const e = fo.byPhase.extract || { n: 0, perfect: 0, gauge: 0, outside: 0, logic: 0, flagged: 0, wMax: 0, wSum: 0 };
    const w = SPEC_W[this.state.spectrum];
    let wL = 0, wF = 0, wO = 0;
    for (const r of fo.rows){
      if (r.ph !== 'extract') continue;
      const ww = w[r.t] || 0;
      if (!ww) continue;
      if (r.bucket === 'logic') wL += ww;
      else if (r.bucket === 'flagged') wF += ww;
      else if (r.bucket === 'outside') wO += ww;
    }
    return {
      ...e,
      PL1: wL * this.state.p, det1: wF * this.state.p, harm1: wO * this.state.p,
      wMean: e.wSum / Math.max(1, e.n),
      stats: fo.stats,
    };
  }

  runMc(){
    const k = this.state.kind;
    const t0 = performance.now();
    this.mc = fsEnsemble(k, {
      p: this.state.p, spectrum: this.state.spectrum,
      trials: this.state.trials, seed: this.state.seed,
    });
    this.mc.ms = performance.now() - t0;
    this.renderHud();
  }

  /* ---------- HUD ---------- */
  renderHud(){
    const s = this.state, d = this.derive(s.kind), w = this.worst[s.kind], mc = this.mc;
    const set = (id, v, cls) => {
      const el = this.q('#' + id);
      if (!el) return;
      el.textContent = v;
      if (cls === 'warn') el.classList.add('warn'); else el.classList.remove('warn');
    };
    set('hKind', FS_KINDS[s.kind].label);
    if (!d){
      set('hLayout', '计算中…');
      ['hCost', 'hSites', 'hFate1', 'hLogic', 'hFlag', 'hW', 'hPL1', 'hDet1', 'hHarm1', 'hSem', 'hWorst'].forEach(id => set(id, '—'));
      return;
    }
    set('hLayout', d.stats.nq + ' 比特 · ' + d.stats.ancillas + ' ancilla');
    set('hCost', d.stats.gates + ' / ' + d.stats.cnots + ' / ' + d.stats.meas);
    set('hSites', d.n);
    set('hFate1', d.perfect + ' / ' + d.gauge + ' / ' + d.outside);
    set('hLogic', d.logic + '（' + pct(d.logic, d.n) + '）', d.logic ? 'warn' : null);
    set('hFlag', d.flagged + '（' + pct(d.flagged, d.n) + '）');
    set('hW', d.wMax + ' 个比特');
    set('hPL1', d.PL1 ? d.PL1.toExponential(2) : '0');
    set('hDet1', d.det1 ? d.det1.toExponential(2) : '0');
    set('hHarm1', d.harm1 ? d.harm1.toExponential(2) : '0');
    if (mc && mc.kind === s.kind){
      set('hMcPL', (100 * mc.PL).toFixed(1) + '%  (' + mc.logic + '/' + mc.trials + ')');
      set('hMcDisc', (100 * mc.discard).toFixed(1) + '%');
      set('hMcF', nf(mc.meanFaults, 2));
    } else {
      set('hMcPL', '按「跑一次 MC」'); set('hMcDisc', '—'); set('hMcF', '—');
    }
    if (w){
      const sup = [0,1,2,3,4,5,6].filter(q => (w.dataMask & (1 << q))).length;
      set('hSem', (w.cls === 'logic' ? '静默逻辑' : w.cls === 'gauge' ? '仅规范' : w.cls === 'outside' ? '逻辑受损' : '纠回')
        + ' · ' + sup + ' 比特 · w' + w.wPre);
      const ext = (this.fo[s.kind] ? this.fo[s.kind].rows : []).filter(r => r.ph === 'extract');
      const ws = ext.length ? ext.reduce((a, b) => (b.wPre > a.wPre ? b : a), ext[0]) : null;
      set('hWorst', ws ? `${ws.gop} q${ws.q} ${ws.t.toUpperCase()} · w${ws.wPre}` : '—',
        ws && ws.bucket === 'logic' ? 'warn' : null);
    }
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
  drawAll(){ this.drawFan(); this.drawFate(); this.drawProp(); }

  /* 画布 1：同一语义位点 → 扇到几个数据比特（四行对照）
     每行：ancilla ● + 6 个数据 ● 排在同一行，红线 = 该故障实际扇到的比特。 */
  drawFan(){
    const c = this.cv.fan;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = COL.txt + '.95)';
    g.fillText('同一语义位点：X 类首块首道 CNOT 之后，ancilla 吃一个 X ⟹ 扇到哪些数据比特', 10 * dpr, 16 * dpr);
    g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = COL.dim + '.85)';
    g.fillText('实心红 = 该故障污染的数据比特（Pauli 帧的实际支撑）；空心 = 干净比特', 10 * dpr, 29 * dpr);

    const rowH = (H - 38 * dpr) / 4;
    const x0 = 10 * dpr, labW = 116 * dpr, numW = 216 * dpr;
    const fanX0 = x0 + labW;
    const span = W - fanX0 - numW - 8 * dpr;
    const step = Math.min(span / 7.6, 40 * dpr);
    const r = Math.min(8 * dpr, step * 0.28);

    KINDS.forEach((kind, i) => {
      const yTop = 38 * dpr + rowH * i;
      const cy = yTop + rowH * 0.5;
      const w = this.worst[kind];
      const sel = kind === this.state.kind;
      if (sel){
        g.fillStyle = COL.cyan + '.07)';
        g.fillRect(x0 - 3 * dpr, yTop + 2 * dpr, W - 2 * x0 + 6 * dpr, rowH - 4 * dpr);
        g.strokeStyle = COL.cyan + '.32)'; g.lineWidth = 1 * dpr;
        g.strokeRect(x0 - 3 * dpr, yTop + 2 * dpr, W - 2 * x0 + 6 * dpr, rowH - 4 * dpr);
      }
      g.textAlign = 'left';
      g.font = (11 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = sel ? COL.cyan + '.95)' : COL.txt + '.78)';
      g.fillText(FS_KINDS[kind].label, x0 + 2 * dpr, cy - 2 * dpr);
      g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = COL.dim + '.8)';
      const st = this.fo[kind] ? this.fo[kind].stats : null;
      g.fillText(st ? `${st.nq}q · ${st.ancillas}anc · ${st.gates}g` : '计算中…', x0 + 2 * dpr, cy + 10 * dpr);

      if (!w) return;
      /* ancilla 圆点（故障点） */
      const ax = fanX0 + step * 0.4;
      g.beginPath(); g.arc(ax, cy, r * 0.92, 0, Math.PI * 2);
      g.fillStyle = COL.red + '.5)'; g.fill();
      g.strokeStyle = COL.red + '1)'; g.lineWidth = 1.3 * dpr; g.stroke();
      g.font = (8 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillStyle = COL.txt + '.95)';
      g.fillText('a', ax, cy + 3 * dpr);
      /* 数据圆点 + 扇出曲线 */
      for (let q = 0; q < 6; q++){
        const cx = fanX0 + step * (1.55 + q * 1.02);
        const hit = !!(w.dataMask & (1 << q));
        if (hit){
          g.beginPath();
          g.moveTo(ax + r * 0.9, cy);
          g.quadraticCurveTo((ax + cx) / 2, cy - 15 * dpr, cx - r, cy - 1 * dpr);
          g.strokeStyle = COL.red + '.42)'; g.lineWidth = 1.1 * dpr; g.stroke();
        }
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
        if (hit){ g.fillStyle = COL.red + '.85)'; g.fill(); g.strokeStyle = COL.red + '1)'; g.lineWidth = 1.2 * dpr; }
        else { g.fillStyle = 'rgba(10,18,32,.85)'; g.fill(); g.strokeStyle = COL.wire + '.5)'; g.lineWidth = 1 * dpr; }
        g.stroke();
        g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
        g.fillStyle = hit ? COL.txt + '.95)' : COL.dim + '.75)';
        g.fillText('q' + q, cx, cy + r + 11 * dpr);
      }
      /* 右侧数字（右对齐，避免出界） */
      const support = [0,1,2,3,4,5].filter(q => (w.dataMask & (1 << q))).length;
      const fate = w.cls === 'logic' ? '静默逻辑' : w.cls === 'gauge' ? '仅规范' : w.cls === 'outside' ? '逻辑受损' : '纠回';
      g.textAlign = 'right';
      g.font = (10 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = w.cls === 'logic' ? COL.red + '.95)' : w.cls === 'outside' ? COL.amber + '.95)' : COL.green + '.95)';
      g.fillText(`污染 ${support} 个比特 · ${fate}`, W - 8 * dpr, cy - 4 * dpr);
      g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = COL.dim + '.85)';
      g.fillText(`F=${nf(w.F, 3)} · 最小权重 ${w.wPre} · ${w.flagged ? '已检出' : '未检出'}`, W - 8 * dpr, cy + 9 * dpr);
    });
  }

  /* 画布 2：五类结局堆叠条 */
  drawFate(){
    const c = this.cv.fate;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillStyle = COL.txt + '.95)';
    g.fillText('单故障结局分布（提取段 · 精确枚举）', 10 * dpr, 17 * dpr);

    const x0 = 10 * dpr + 104 * dpr, x1 = W - 12 * dpr;
    const top = 40 * dpr, rowH = (H - top - 26 * dpr) / KINDS.length;
    let legendX = 10 * dpr;
    g.font = (9 * dpr) + 'px ui-monospace,monospace';
    for (const f of FATES){
      g.fillStyle = f.hue + '.85)';
      g.fillRect(legendX, 25 * dpr, 7 * dpr, 7 * dpr);
      g.fillStyle = COL.dim + '.9)';
      g.fillText(f.name, legendX + 10 * dpr, 31 * dpr);
      legendX += (20 + f.name.length * 9) * dpr;
    }
    KINDS.forEach((kind, i) => {
      const d = this.derive(kind);
      const y = top + rowH * i + rowH * 0.5;
      const bh = Math.min(15 * dpr, rowH * 0.5);
      g.font = (10.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
      g.fillStyle = kind === this.state.kind ? COL.cyan + '.95)' : COL.txt + '.75)';
      g.fillText(FS_KINDS[kind].label, 10 * dpr, y - 2 * dpr);
      g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = COL.dim + '.8)';
      g.fillText(d ? d.n + ' 位点' : '…', 10 * dpr, y + 9 * dpr);
      if (!d){ g.fillStyle = COL.dim + '.7)'; g.fillText('计算中…', 10 * dpr + 104 * dpr, y + 3 * dpr); return; }
      const tot = Math.max(1, d.n);
      let x = x0;
      for (const f of FATES){
        const v = d[f.k] || 0;
        if (!v) continue;
        const wBar = (x1 - x0) * v / tot;
        g.fillStyle = f.hue + '0.72)';
        g.fillRect(x, y - bh / 2, Math.max(0.6 * dpr, wBar), bh);
        if (wBar > 16 * dpr){
          g.fillStyle = 'rgba(6,12,22,.92)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
          g.fillText(String(v), x + wBar / 2, y + 3 * dpr);
        }
        x += wBar;
      }
    });
    g.font = (9 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillStyle = COL.dim + '.85)';
    g.fillText('横轴 = 该线路提取段全部单故障位点（每门每比特 × X/Y/Z 三种 Pauli）', 10 * dpr, H - 8 * dpr);
  }

  /* 画布 3：传播权重直方图 */
  drawProp(){
    const c = this.cv.prop;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillStyle = COL.txt + '.95)';
    g.fillText('一个故障污染几个比特（提取段）', 10 * dpr, 16 * dpr);

    const plotX = 44 * dpr, plotY = 40 * dpr, plotW = W - plotX - 12 * dpr, plotH = H - plotY - 26 * dpr;
    const maxW = 4;
    const bw = plotW / (maxW + 1) / (KINDS.length + 0.6);
    const gap = 2 * dpr;
    /* 轴 */
    g.strokeStyle = COL.wire + '.28)'; g.lineWidth = 1 * dpr;
    g.beginPath(); g.moveTo(plotX, plotY); g.lineTo(plotX, plotY + plotH); g.lineTo(plotX + plotW, plotY + plotH); g.stroke();
    let maxV = 1;
    for (const kind of KINDS){
      const fo = this.fo[kind];
      if (!fo) continue;
      for (const r of fo.rows) if (r.ph === 'extract') maxV = Math.max(maxV, 0);
    }
    /* 归一化到每条线路的位点数 */
    const val = (kind, w) => {
      const fo = this.fo[kind];
      if (!fo) return 0;
      let n = 0, tot = 0;
      for (const r of fo.rows){ if (r.ph !== 'extract') continue; tot++; if (r.wPre === w) n++; }
      return tot ? n / tot : 0;
    };
    /* 网格线 50% / 100% */
    g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'right';
    for (const frac of [0.5, 1]){
      const yy = plotY + plotH * (1 - frac);
      g.strokeStyle = COL.wire + '.14)'; g.lineWidth = 1 * dpr;
      g.beginPath(); g.moveTo(plotX, yy); g.lineTo(plotX + plotW, yy); g.stroke();
      g.fillStyle = COL.dim + '.7)';
      g.fillText((frac * 100) + '%', plotX - 4 * dpr, yy + 3 * dpr);
    }
    for (let w = 0; w <= maxW; w++){
      KINDS.forEach((kind, ki) => {
        if (!this.fo[kind]) return;
        const v = val(kind, w);
        const x = plotX + (w + 0.3) * (plotW / (maxW + 1)) + ki * bw;
        const h = Math.max(0, v) * plotH;
        const hue = [COL.cyan, COL.green, COL.amber, COL.red, COL.mag][Math.min(w, 4)];
        g.fillStyle = hue + (kind === this.state.kind ? '.9)' : '.42)');
        g.fillRect(x, plotY + plotH - h, bw - gap, h);
      });
    }
    /* 刻度 */
    g.font = (9 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
    for (let w = 0; w <= maxW; w++){
      const x = plotX + (w + 0.5) * (plotW / (maxW + 1));
      g.fillStyle = COL.dim + '.85)';
      g.fillText('w=' + w, x, plotY + plotH + 13 * dpr);
    }
    /* 图例（顶部，避免与 w= 刻度打架） */
    let lx = 10 * dpr;
    g.textAlign = 'left';
    for (const kind of KINDS){
      const on = kind === this.state.kind;
      g.fillStyle = on ? COL.cyan + '.9)' : COL.wire + '.42)';
      g.fillRect(lx, 24 * dpr, 8 * dpr, 6 * dpr);
      g.fillStyle = on ? COL.cyan + '.95)' : COL.dim + '.85)';
      g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
      g.fillText(FS_KINDS[kind].label, lx + 11 * dpr, 30 * dpr);
      lx += (18 + FS_KINDS[kind].label.length * 8.6) * dpr;
    }
  }

  /* ---------- 调试句柄（cdp81 用） ---------- */
  debugHandle(){
    const self = this;
    return {
      get state(){ return self.state; },
      kinds: () => KINDS.map(k => ({
        kind: k, label: FS_KINDS[k].label,
        ready: !!self.fo[k],
        stats: self.fo[k] ? self.fo[k].stats : null,
        extract: self.fo[k] ? (() => { const d = self.derive(k); return d ? {
          n: d.n, perfect: d.perfect, gauge: d.gauge, outside: d.outside, logic: d.logic,
          flagged: d.flagged, wMax: d.wMax, PL1: d.PL1, det1: d.det1, harm1: d.harm1 } : null; })() : null,
        all: self.fo[k] ? { sites: self.fo[k].sites, logic: self.fo[k].logic, flagged: self.fo[k].flagged,
          outside: self.fo[k].outside, gauge: self.fo[k].gauge, disagree: self.fo[k].disagree } : null,
        probe: self.worst[k] ? {
          gate: self.worst[k].gate, anc: self.worst[k].anc, wPre: self.worst[k].wPre,
          cls: self.worst[k].cls, coset: self.worst[k].coset, F: self.worst[k].F,
          dataMask: self.worst[k].dataMask, flagged: self.worst[k].flagged,
          worstSite: (() => { const ext = (self.fo[k] ? self.fo[k].rows : []).filter(r => r.ph === 'extract');
            if (!ext.length) return null;
            const r = ext.reduce((a, b) => (b.wPre > a.wPre ? b : a), ext[0]);
            return { gop: r.gop, q: r.q, t: r.t, stab: r.stab, wPre: r.wPre, wRes: r.wRes, coset: r.coset, bucket: r.bucket }; })() } : null,
      })),
      mc: () => (self.mc ? { kind: self.mc.kind, p: self.mc.p, spectrum: self.mc.spectrum,
        trials: self.mc.trials, PL: self.mc.PL, discard: self.mc.discard, perfect: self.mc.perfect,
        gauge: self.mc.gauge, outside: self.mc.outside, logic: self.mc.logic, flagged: self.mc.flagged,
        meanFaults: self.mc.meanFaults, randomMeas: self.mc.randomMeas, ms: self.mc.ms } : null),
      prop: kind => {
        const fo = self.fo[kind];
        if (!fo) return null;
        const h = {};
        for (const r of fo.rows){ if (r.ph !== 'extract') continue; h[r.wPre] = (h[r.wPre] || 0) + 1; }
        return h;
      },
      fates: () => FATES.map(f => f.k),
      setKind: k => { if (FS_KINDS[k]){ self.state.kind = k; self.syncPanel(); self.renderHud(); self.drawAll(); } },
      setP: v => { self.state.p = v; self.syncPanel(); self.renderHud(); self.drawAll(); },
      setSpectrum: s => { if (SPEC_W[s]){ self.state.spectrum = s; self.syncPanel(); self.renderHud(); self.drawAll(); } },
      setSeed: s => { self.state.seed = s; },
      runMc: () => self.runMc(),
      busy: () => self._queue.length,
      canvasPixels: () => Object.fromEntries(Object.entries(self.cv).map(([k, c]) => [k, c ? c.width * c.height : 0])),
      navLinks: () => Array.from(document.querySelectorAll('#flTop a')).map(a => a.getAttribute('href')),
    };
  }
}
