/* ============================================================================
 * hubbard.js（页面）— 格点费米-哈伯德**沙盒**：二次量子化 / 莫特 / 纠缠熵
 *
 * 纯 CPU、纯 2D canvas（无 WebGL）：态是固定粒子数基上的复向量。
 *
 * 【三种玩法】本页从「两个预设的演示」改成可直接动手的沙盒，物理量都画在
 * 格点链上，指针操作与主页同源（点=放、拖=画）：
 *   1. 初态工具：点格点循环 空→↑→↓→↑↓（右键反向）。点击立刻把该乘积态设成
 *      当前态并切到演化模式——粒子数变了就重建扇区（L=10 约 0.29s，给 toast）。
 *   2. 势笔刷：在链上横拖给每格写 μ_i（左键=吸引 μ<0、右键=排斥 μ>0）。外场
 *      **只进对角项**，所以画势不重建扇区、可以边拖边看密度流动。
 *   3. 擦除：把该格 μ_i 清零（整段清空用面板「清空场」）。
 *
 * 【两种模式】决定「谁是态」：
 *   gs  基态：H 一改（U/μ/L）就重解最低态，ψ 由求解器给。
 *   evo 演化：ψ 是当前初态，按 exp(−iHt) 自由演化；改 H 立刻生效（不重置 t）。
 * 预设只是「配方」：莫特=gs+U=4，猝变=evo+奈尔态。点初态格子会自动切到 evo，
 * 因为「你刚指定的 Fock 态」不可能是含场的基态。
 *
 * 绘图分层（自上而下）：格点卡片（↑/↓ 占据箭头、双占徽标、n_i）→ μ_i 带 →
 * 键关联 J_i 带 → 格点序号。拖动时被笔刷扫过的格点会高亮。
 *
 * 调试句柄 window.__hb（cdp139 用）：measures/entropy/step/setU/setL/solveNow/
 * gapNow/history/bond + 沙盒侧 clickSite/setTool/paint/mu/pat/mode/spec/applySpec/
 * siteAtX/view —— 全部确定性接口（不依赖 rAF 时序）。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { injectResponsive } from './core/responsive.js';
import { navHtml } from './core/nav.js';
import { hbSector, hbSetField, hbProductFromPattern, hbMeasure, hbEnergy, hbEntropy, hbEntropyAt, hbEntropyProfile, hbDensityCorr, hbMomentumDist, hbCorrelation, hbKrylovExp, hbBondCorr, hbNorm, hbResidual, HbGsTask, HbScanTask, HB_PRESETS } from './physics/hubbard.js';

/* 画面上 μ 的满量程（|μ|/t 到 6 就是满格高） */
const MU_VIEW = 6;
const HB_TOOLS = [
  { k: 'state', name: '初态', tip: '点击格子：空→↑→↓→↑↓（右键反向）' },
  { k: 'field', name: '势笔刷', tip: '拖动涂势：左键=吸引 μ<0，右键=排斥 μ>0' },
  { k: 'erase', name: '擦除', tip: '点击清除该格的 μ' },
];

/* 下方图表的四个视图（Phase 2）：时间轴只有一个视图，其余是「当前态」的观测量 */
const HB_VIEWS = [
  { k: 'Sx', name: 'S(x)', tip: '纠缠剖面：以切点 x 分开时左半的熵' },
  { k: 'nk', name: 'n(k)', tip: '动量分布：k = 2πm/L，Σ_m n(k_m) = N' },
  { k: 'nn', name: '⟨n n⟩', tip: '密度关联矩阵（暂停时刷新）' },
  { k: 'St', name: 'S(t)', tip: '半链熵随时间（基态下退化为标尺）' },
  { k: 'scan', name: 'U/t 扫描', tip: '扫 U/t：基态量 + 淬变后的熵饱和值/早窗斜率' },
];
/* 扫描图上的四个纵轴量 */
const HB_METRICS = [
  { k: 'Ssat', name: 'S 饱和', get: r => r.Ssat, hint: '淬变末段（后 25% 窗）的半链熵均值' },
  { k: 'slope', name: '斜率', get: r => r.slope, hint: '早窗 t ≤ L/3 的线性拟合 dS/dt' },
  { k: 'Sgs', name: 'S_gs', get: r => r.Sgs, hint: '基态半链熵' },
  { k: 'Dgs', name: 'D_gs', get: r => r.Dgs, hint: '基态双占 Σ⟨n↑n↓⟩' },
];
/* 协议：演化中按时间改 H（不是预设，是给 H 加一条时间表） */
const HB_PROTOCOLS = {
  uramp: { name: 'U 斜坡', tip: 'U/t 线性从 0 升到当前值，历时 T', T: 8 },
  pulse: { name: '势阱脉冲', tip: '0 号格 μ=−A·sin²(πt/T)，T 后撤掉', T: 4, A: 4 },
  push: { name: '势垒推动', tip: '一口移动的井把密度从左推到右，历时 T', T: 10, A: 4, w: 0.9 },
};
const HB_CSS = `
  #hbPanel{top:74px;left:14px;width:232px;padding:13px;z-index:10;max-height:calc(100vh - 190px);overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #hbHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:212px;font-family:var(--mono)}
  #hbHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0}
  #hbHud .hrow span:first-child{color:var(--dim)}
  #hbHud .hrow span:last-child{color:var(--txt)}
  #hbHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #hbStage{position:fixed;left:50%;top:53%;transform:translate(-50%,-50%);z-index:5;
    display:flex;flex-direction:column;align-items:center;gap:6px;--w:min(78vw,780px)}
  #hbLadder{width:var(--w);height:300px;border:1px solid var(--line);border-radius:10px;background:rgba(4,8,16,.5);
    display:block;touch-action:none}
  #hbStage[data-tool="state"] #hbLadder{cursor:pointer}
  #hbStage[data-tool="field"] #hbLadder,#hbStage[data-tool="erase"] #hbLadder{cursor:crosshair}
  #hbChart{width:var(--w);height:170px;border:1px solid var(--line);border-radius:10px;background:rgba(4,8,16,.5);display:block}
  #hbViews{display:flex;gap:5px;align-self:stretch;justify-content:flex-end;margin-bottom:-2px;
    font-family:var(--mono);opacity:.92}
  #hbViews button{font-family:var(--mono);font-size:9.5px;letter-spacing:.04em;padding:2px 8px;border-radius:6px;
    background:rgba(9,16,30,.55);border:1px solid var(--line);color:var(--dim);cursor:pointer}
  #hbViews button.on{color:var(--cyan);border-color:rgba(103,232,249,.55);background:rgba(103,232,249,.07)}
  #hbPanel .grid4{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}
  #hbPanel .grid4 button{font-size:10px;padding:5px 2px}
  #hbScrubRow{display:flex;align-items:center;gap:6px;margin-top:4px}
  #hbScrubRow input[type=range]{flex:1;min-width:0}
  #hbScrubInfo{font-family:var(--mono);font-size:10px;color:var(--cyan);white-space:nowrap}
  #hbScrubRow.off{opacity:.4;pointer-events:none}
  #hbHint{left:14px;bottom:52px;z-index:10;padding:10px 14px;max-width:330px;font-size:11.5px;
    color:var(--dim);line-height:1.65;max-height:130px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #hbHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:12px}
  #hbToast{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;pointer-events:none;
    font-family:var(--mono);font-size:13px;color:var(--cyan);letter-spacing:.16em;opacity:0;transition:opacity .4s;
    text-shadow:0 0 18px rgba(103,232,249,.8);text-align:center;white-space:pre-line}
  #hbDiag{position:fixed;left:-9999px}
  #hbErr{display:none;position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:30;max-width:min(90vw,760px);
    padding:9px 14px;border-radius:8px;border:1px solid rgba(251,113,133,.5);background:rgba(60,10,18,.92);
    color:#fecdd3;font:11.5px/1.5 var(--mono);white-space:pre-wrap}
  #hbPanel .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
  #hbPanel .grid3 button{padding:6px 2px;font-size:10.5px}
  #hbPanel .grid2 button.sm{font-size:10px;padding:5px 2px}
  #hbFieldInfo{font-family:var(--mono);font-size:10.5px;color:var(--cyan)}
  #hbModeTag{color:var(--amber)}
  @media (max-width:1100px){#hbStage{--w:min(92vw,640px)}#hbHint{display:none}}
`;

const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
/* 奈尔填充：偶数格 ↑、奇数格 ↓（↑ 用 1、↓ 用 2 的占据码） */
const neelPattern = L => Int8Array.from({ length: L }, (_, i) => (i % 2 === 0 ? 1 : 2));

export class HubbardApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    this.state = {
      preset: q.get('preset') || 'mott',
      L: Math.round(num('L', 8)), U: num('U', 4),
      paused: q.get('paused') === '1', dt: num('dt', 0.05), spf: Math.round(num('spf', 2)),
      t: 0, frames: 0,
      mode: q.get('mode') === 'evo' ? 'evo' : 'gs',
      tool: q.get('tool') || 'state',
      muDepth: clamp(num('muD', 2), 0, MU_VIEW), muSign: q.get('sgn') === '+' ? 1 : -1,
      mu: null, pat: null, nUp: 0, nDn: 0,
      view: 'Sx',
      Umax: 8,
    };
    if (![8, 10].includes(this.state.L)) this.state.L = 8;
    if (!HB_TOOLS.some(t => t.k === this.state.tool)) this.state.tool = 'state';
    if (!HB_PRESETS[this.state.preset]) this.state.preset = 'mott';
    if (!HB_VIEWS.some(v => v.k === this.state.view)) this.state.view = 'Sx';
    /* Phase-2 观测量缓存：脏标记 + 渐进任务（S(x) 的 L=10 全扫 ~0.65s） */
    /* Phase-3：协议 / 时间轴检查点 / U 扫描 */
    this.proto = null; this.protoSaved = null; this.protoStart = 0;
    this.cps = []; this.cpNext = 0; this.scrubIdx = -1;
    this.scan = null; this.scanRes = []; this.scanMetric = 'Ssat'; this.scanMs = 0;
    this.residual = null;
    this.probe = { sx: null, sxL: 0, nk: null, nn: null, rho: null, live: false };
    this._dirty = { sx: true, nk: true, nn: true };
    this.sxJob = null; this.sxMs = 0;
    this.state.mu = new Float64Array(this.state.L);
    this.state.pat = neelPattern(this.state.L);
    this._spec = this.readUrlSpec(q);
    this.sec = null; this.re = null; this.im = null;
    this.job = null; this.gapJob = null; this.gap = null;
    this.hist = []; this.S = 0; this.bsig = null; this.msg = '';
    this.m = null; this._hover = -1; this._paint = null; this._view = null;
    this._listeners = []; this._fps = 0; this._fpsFrames = 0; this._lastFpsT = performance.now();
    this._onError = e => { const d = this.q('#hbDiag'); if (d) d.textContent = 'ERR ' + e.message; document.title = 'ERR ' + e.message; };
    window.addEventListener('error', this._onError);
    this.frame = this.frame.bind(this);
  }

  q(s){ return this.container.querySelector(s); }
  on(t, type, fn){ if (!t) return; t.addEventListener(type, fn); this._listeners.push([t, type, fn]); }
  toast(m, ms = 2000){
    const el = this.q('#hbToast'); if (!el) return;
    el.textContent = m; el.style.opacity = 1;
    clearTimeout(this._tt); this._tt = setTimeout(() => { el.style.opacity = 0; }, ms);
  }

  mount(){
    injectStyles();
    injectResponsive();
    const st = document.createElement('style');
    st.id = 'hb-styles'; st.textContent = HB_CSS;
    document.head.appendChild(st);
    this.buildDOM();
    this.bindUI();
    this.resize();
    this.initPreset();
    if (this._spec) this.applySpec(this._spec, { fromUrl: true });
    requestAnimationFrame(this.frame);
    window.__hb = this.debugHandle();
    return this;
  }

  buildDOM(){
    this.container.innerHTML = `
<div id="hbTop" class="panel qtop">
  <div class="logo">哈伯德工场 · HUBBARD</div>
  <div class="eq"><b>H</b> = −<b>t</b>Σ(c†<sub>i</sub>c<sub>i+1</sub>+h.c.) + <b>U</b>Σ n<sub>i↑</sub>n<sub>i↓</sub> + Σ<b>μ</b><sub>i</sub>n<sub>i</sub></div>
  ${navHtml('./hubbard.html', '  ')}
</div>
<div id="hbPanel" class="panel qpanel">
  <div class="sec"><h3>预设</h3><div class="grid2" id="hbPresets">
    ${Object.keys(HB_PRESETS).map(k => '<button data-preset="' + k + '">' + HB_PRESETS[k].name + '</button>').join('')}
  </div></div>
  <div class="sec"><h3>模式</h3><div class="grid2">
    <button id="hbModeGs" class="sm">解基态</button><button id="hbModeEvo" class="sm">从初态演化</button>
  </div></div>
  <div class="sec"><h3>工具</h3><div class="grid3" id="hbTools">
    ${HB_TOOLS.map(t => '<button data-tool="' + t.k + '">' + t.name + '</button>').join('')}
  </div>
    <div class="row"><label>|μ| / t</label><input type="range" id="rMu" min="0" max="${MU_VIEW}" step="0.25" value="${this.state.muDepth}"><output id="oMu">${this.state.muDepth.toFixed(2)}</output></div>
    <div class="grid2" style="margin-top:5px">
      <button id="hbMuNeg" class="sm">吸引 μ&lt;0</button><button id="hbMuPos" class="sm">排斥 μ&gt;0</button>
    </div>
    <div class="grid2" style="margin-top:5px">
      <button id="hbClearField" class="sm">清空场</button><button id="hbClearPat" class="sm">复位填充</button>
    </div>
    <div class="row" style="margin-top:5px"><label>场</label><span id="hbFieldInfo">—</span></div>
  </div>
  <div class="sec"><h3>协议（演化中改 H）</h3><div class="grid3">
    ${Object.keys(HB_PROTOCOLS).map(k => '<button data-proto="' + k + '" title="' + HB_PROTOCOLS[k].tip + '">' + HB_PROTOCOLS[k].name + '</button>').join('')}
  </div>
    <div class="grid2" style="margin-top:5px">
      <button id="hbProtoStop" class="sm">停止协议</button><button id="hbProtoInfo" class="sm" disabled style="opacity:.75">—</button>
    </div>
  </div>
  <div class="sec"><h3>U/t 扫描</h3>
    <div class="grid2"><button id="hbScanRun">运行扫描</button><button id="hbScanStop" class="sm">中止</button></div>
    <div class="grid4" style="margin-top:5px">
      ${HB_METRICS.map(m => '<button data-metric="' + m.k + '" class="sm" title="' + m.hint + '">' + m.name + '</button>').join('')}
    </div>
    <div class="row" style="margin-top:5px"><label>U 上限</label><input type="range" id="rUmax" min="2" max="8" step="1" value="${this.state.Umax}"><output id="oUmax">${this.state.Umax}</output></div>
  </div>
  <div class="sec"><h3>格点</h3><div class="grid3">
    <button data-L="8">L = 8</button><button data-L="10">L = 10</button><button data-L="12" class="sm">L = 12</button>
  </div></div>
  <div class="sec"><h3>参数</h3>
    <div class="row"><label>U / t</label><input type="range" id="rU" min="0" max="8" step="0.25" value="${this.state.U}"><output id="oU">${this.state.U.toFixed(2)}</output></div>
    <div class="row"><label>半链熵</label><span id="hbStat" style="font-size:10px;color:var(--cyan);font-family:var(--mono)">—</span></div>
  </div>
  <div class="sec"><h3>操作</h3><div class="grid2">
    <button id="hbPause">暂停</button><button id="hbStep">单步</button>
    <button id="hbReset">重置</button><button id="hbGap">算能隙</button>
    <button id="hbLink" class="sm">复制链接</button><button id="hbSave" class="sm">导出 JSON</button>
  </div>
    <div class="row" style="margin-top:5px"><label>时间轴</label><span id="hbScrubInfo">—</span></div>
    <div id="hbScrubRow" class="off"><input type="range" id="hbScrub" min="0" max="0" step="1" value="0"></div>
  </div>
</div>
<div id="hbHud" class="panel qhud">
  <div class="hrow"><span>模式</span><span id="hMode">—</span></div>
  <div class="hrow"><span>维度 C(L,N↑)C(L,N↓)</span><span id="hDim">—</span></div>
  <div class="hrow"><span>E / t</span><span id="hE">—</span></div>
  <div class="hrow"><span>势能 Σμ⟨n⟩</span><span id="hPot">—</span></div>
  <div class="hrow"><span>双占 D = Σ⟨n↑n↓⟩</span><span id="hD">—</span></div>
  <div class="hrow"><span>半链熵 S</span><span id="hS">—</span></div>
  <div class="hrow"><span>N↑ / N↓</span><span id="hN">—</span></div>
  <div class="hrow"><span>‖ψ‖</span><span id="hNorm">—</span></div>
  <hr>
  <div class="hrow"><span>U / t</span><span id="hU">—</span></div>
  <div class="hrow"><span>t / 帧</span><span id="hT">—</span></div>
  <div class="hrow"><span>电荷能隙 Δ</span><span id="hGap">—</span></div>
  <div class="hrow"><span>早窗斜率 dS/dt</span><span id="hSlope">—</span></div>
  <div class="hrow"><span>残差 ‖Hψ−Eψ‖</span><span id="hRes">—</span></div>
  <div class="hrow"><span>Lanczos m</span><span id="hM">—</span></div>
  <div class="hrow"><span>协议 / 扫描</span><span id="hProto">—</span></div>
  <div class="hrow"><span>fps</span><span id="hFps">—</span></div>
</div>
<div id="hbStage" class="qstage" data-tool="${this.state.tool}">
  <canvas id="hbLadder"></canvas>
  <div id="hbViews">${HB_VIEWS.map(v => '<button data-view="' + v.k + '" title="' + v.tip + '">' + v.name + '</button>').join('')}</div>
  <canvas id="hbChart"></canvas>
</div>
<div id="hbHint" class="panel qhint"><b></b><span></span></div>
<div id="hbToast"></div>
<div id="hbDiag"></div>
<div id="hbErr"></div>`;
    this.container.querySelectorAll('[data-preset]').forEach(b =>
      this.on(b, 'click', () => this.setPreset(b.dataset.preset)));
    /* 【坑】HTML 属性名不区分大小写、进 DOM 一律小写：`data-L` 对应 `dataset.l`，
       写 `b.dataset.L` 永远是 undefined ⟹ parseInt → NaN ⟹ setL 直接 return，
       L 按钮点了没反应（cdp139 走的是 __hb.setL()，所以一直没暴露）。改读 getAttribute。 */
    this.container.querySelectorAll('[data-L]').forEach(b =>
      this.on(b, 'click', () => this.setL(parseInt(b.getAttribute('data-L'), 10))));
    this.container.querySelectorAll('[data-tool]').forEach(b =>
      this.on(b, 'click', () => this.setTool(b.dataset.tool)));
    this.container.querySelectorAll('[data-view]').forEach(b =>
      this.on(b, 'click', () => this.setView(b.dataset.view)));
  }

  bindUI(){
    this.on(this.q('#rU'), 'input', () => {
      this.state.U = parseFloat(this.q('#rU').value);
      this.q('#oU').textContent = this.state.U.toFixed(2);
      this.q('#hU').textContent = this.state.U.toFixed(2);
      this.afterHChange('U');
    });
    this.on(this.q('#rMu'), 'input', () => this.setMuDepth(parseFloat(this.q('#rMu').value)));
    this.on(this.q('#hbMuNeg'), 'click', () => this.setMuSign(-1));
    this.on(this.q('#hbMuPos'), 'click', () => this.setMuSign(1));
    this.on(this.q('#hbClearField'), 'click', () => this.clearField(true));
    this.on(this.q('#hbClearPat'), 'click', () => this.resetPattern());
    this.on(this.q('#hbModeGs'), 'click', () => this.applyMode('gs'));
    this.on(this.q('#hbModeEvo'), 'click', () => this.applyMode('evo'));
    this.on(this.q('#hbPause'), 'click', () => this.togglePause());
    this.on(this.q('#hbStep'), 'click', () => this.stepFrames(1));
    this.on(this.q('#hbReset'), 'click', () => this.initPreset());
    this.on(this.q('#hbGap'), 'click', () => this.startGap());
    this.on(this.q('#hbLink'), 'click', () => this.copyLink());
    this.on(this.q('#hbSave'), 'click', () => this.exportJson());
    this.container.querySelectorAll('[data-proto]').forEach(b =>
      this.on(b, 'click', () => this.startProtocol(b.dataset.proto)));
    this.on(this.q('#hbProtoStop'), 'click', () => this.stopProtocol(true));
    this.container.querySelectorAll('[data-metric]').forEach(b =>
      this.on(b, 'click', () => { this.scanMetric = b.dataset.metric; this.syncPanel(); this.draw(); }));
    this.on(this.q('#hbScanRun'), 'click', () => this.startScan());
    this.on(this.q('#hbScanStop'), 'click', () => this.stopScan());
    this.on(this.q('#rUmax'), 'input', () => {
      this.state.Umax = parseFloat(this.q('#rUmax').value);
      this.q('#oUmax').textContent = String(this.state.Umax);
    });
    this.on(this.q('#hbScrub'), 'input', () => this.scrubTo(parseInt(this.q('#hbScrub').value, 10)));
    this.on(window, 'resize', () => { this.resize(); this.draw(); });
    this.on(document, 'keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      if (/input|textarea|select/i.test(tag)) return;
      if (e.key === '1' || e.key === '2' || e.key === '3') this.setTool(HB_TOOLS[+e.key - 1].k);
      else if (e.key >= '4' && e.key <= '8') this.setView(HB_VIEWS[+e.key - 4].k);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
        if (this.cps.length && this.state.mode === 'evo'){
          e.preventDefault();
          const d = e.key === 'ArrowLeft' ? -1 : 1;
          this.scrubTo(clamp((this.scrubIdx < 0 ? this.cps.length - 1 : this.scrubIdx) + d, 0, this.cps.length - 1));
        }
      }
      else if (e.key === ' ') { e.preventDefault(); this.togglePause(); }
    });
    this.bindCanvas();
  }

  /* ---------- 画布交互：点击放、拖动画 ---------- */
  bindCanvas(){
    const cv = this.q('#hbLadder');
    if (!cv) return;
    this.on(cv, 'contextmenu', e => e.preventDefault());
    this.on(cv, 'pointerdown', e => {
      const i = this.siteAtX(this.evX(e));
      this._hover = i;
      if (i < 0) return;
      e.preventDefault();
      this._paint = { i };
      this.applyAt(i, e.button === 2);
      this.draw();
    });
    this.on(cv, 'pointermove', e => {
      const i = this.siteAtX(this.evX(e));
      if (i !== this._hover){ this._hover = i; this.draw(); }
      if (this._paint && i >= 0 && i !== this._paint.i){
        this._paint.i = i;
        this.applyAt(i, false);
        this.draw();
      }
    });
    this.on(cv, 'pointerup', () => { if (this._paint){ this._paint = null; this.queueUrl(); this.draw(); } });
    this.on(cv, 'pointerleave', () => { this._hover = -1; this._paint = null; this.draw(); });
    const ch = this.q('#hbChart');
    if (ch){
      this.on(ch, 'click', e => {
        if (this.state.view !== 'scan') return;
        const r = ch.getBoundingClientRect ? ch.getBoundingClientRect() : null;
        const dpr = ch.width / (ch.clientWidth || ch.width) || 1;
        this.scanPick((e.clientX - (r ? r.left : 0)) * dpr);
      });
      this.on(ch, 'pointermove', e => {
        if (this.state.view !== 'scan' || !this.scanRes.length) return;
        const r = ch.getBoundingClientRect ? ch.getBoundingClientRect() : null;
        const dpr = ch.width / (ch.clientWidth || ch.width) || 1;
        const W = ch.width, x0 = 46 * dpr, w = W - 46 * dpr - 18 * dpr;
        const Umax = Math.max(2, this.state.Umax);
        const U = clamp(((e.clientX - (r ? r.left : 0)) * dpr - x0) / w, 0, 1) * Umax;
        let bi = -1, bd = Infinity;
        this.scanRes.forEach((rr, i) => { const d = Math.abs(rr.U - U); if (d < bd){ bd = d; bi = i; } });
        if (bi !== this._scanHover){ this._scanHover = bi; this.draw(); }
      });
    }
  }
  /* 指针 → 设备像素（jsdom 里 rect 宽为 0，退化为 1:1 设备坐标） */
  evX(e){
    const cv = this.q('#hbLadder');
    const r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : null;
    if (r && r.width > 0) return (e.clientX - r.left) * (cv.width / r.width);
    return e.clientX;
  }
  siteAtX(x){
    const L = this.state.L, cv = this.q('#hbLadder');
    if (!cv) return -1;
    const W = cv.width || 0;
    if (!(W > 0)) return -1;
    const dpr = W / (cv.clientWidth || W);
    const pad = 42 * dpr, stepX = (W - 2 * pad) / Math.max(1, L - 1);
    const f = (x - pad) / stepX;
    if (!Number.isFinite(f)) return -1;
    const i = Math.round(f);
    if (i < 0 || i > L - 1) return -1;
    /* 首末格各多给半格缓冲，避免边缘点不到 */
    if (f < -0.5 || f > L - 0.5) return -1;
    return i;
  }
  applyAt(i, right){
    const tool = this.state.tool;
    if (tool === 'state') this.toggleSite(i, right ? -1 : 1);
    else if (tool === 'field') this.paintSite(i, (right ? -1 : 1) * this.state.muSign);
    else this.paintSite(i, 0);
  }

  /* ---------- 预设 / 模式 ---------- */
  initPreset(){
    const { L, preset } = this.state;
    this.cancelSolve();
    this.state.paused = false;
    this.state.t = 0; this.state.frames = 0; this.hist = [];
    this.gap = null; this.job = null; this.gapJob = null; this.slope = null;
    this.q('#hGap').textContent = '—'; this.q('#hSlope').textContent = '—';
    this.state.pat = neelPattern(L);
    this.state.mu = new Float64Array(L);
    this.rebuildSector(L / 2, L / 2);
    this.state.mode = preset === 'quench' ? 'evo' : 'gs';
    if (this.state.mode === 'gs'){
      this.startSolve();
    } else {
      const w = hbProductFromPattern(this.sec, this.state.pat);
      this.re = w.re; this.im = w.im;
      this.measureAll(true);
    }
    this.syncPanel();
    this.draw();
  }
  applyMode(mode, opts = {}){
    if (mode === 'evo' && this.staticTier()){
      this.toast('L=12 静态档：不做实时演化（单步 Krylov ≈0.5 s）', 2600);
      return;
    }
    this.cancelSolve();
    if (mode === 'gs'){
      this.state.mode = 'gs';
      this.startSolve();
    } else {
      this.state.mode = 'evo';
      const w = hbProductFromPattern(this.sec, this.state.pat);
      this.re = w.re; this.im = w.im;
      this.state.t = 0; this.state.frames = 0; this.hist = [];
      this.state.paused = opts.paused ?? false;
      this.job = null;
      this.resetTimeline();
      this.measureAll(true);
    }
    this.syncPanel(); this.draw(); this.queueUrl();
  }
  /* H 变了（U/μ/L）：gs 模式重解，evo 模式只更新读数 */
  afterHChange(why){
    /* 能隙是「当前 H」的函数：U/μ/L 一变，已显示的 Δ 与在飞的能隙任务都作废 */
    if (this.gap !== null || this.gapJob){
      this.gap = null; this.gapJob = null;
      const gp = this.q('#hGap'); if (gp) gp.textContent = '—';
    }
    if (this.state.mode === 'gs'){
      /* 在飞任务的 Lanczos 基属于旧 H（U 是构造参数、diagPot 已被就地改写），
         让它跑完只会把一个「半途中换过 H」的态写进 this.re —— 直接丢弃。 */
      this.job = null;
      this.scheduleSolve(160);
      this.msg = '基态求解中…';
      const st = this.q('#hbStat'); if (st) st.textContent = this.msg;
    } else {
      this.job = null;
      if (this.re) this.measureAll(true);
    }
    this.syncPanel(); this.draw();
    void why;
  }
  setPreset(k){
    if (!HB_PRESETS[k]) return;
    /* 点当前预设也重置：「预设」是配方不是开关，否则用户以为坏了 */
    this.state.preset = k;
    this.initPreset(); this.queueUrl();
  }
  setL(L){
    if (L === this.state.L) return;
    if (![8, 10, 12].includes(L)) return;
    this.stopProtocol(false);
    this.state.L = L;
    if (L === 12) this.state.mode = 'gs';
    this.initPreset();
    this.queueUrl();
    if (L === 10) this.toast('L=10：扇区 63504 维，基态要算几秒', 1800);
    if (L === 12) this.toast('L=12 静态档：853776 维，基态约 70 s（内存 ~1 GB），只解基态/看观测量', 3200);
  }
  togglePause(){
    if (this.state.mode !== 'evo') return;
    this.state.paused = !this.state.paused;
    this.q('#hbPause').textContent = this.state.paused ? '继续' : '暂停';
  }
  setTool(k){
    if (!HB_TOOLS.some(t => t.k === k)) return;
    this.state.tool = k;
    this.syncPanel();
    const st = this.q('#hbStage'); if (st) st.dataset.tool = k;
    this.draw();
  }
  setMuDepth(v){
    this.state.muDepth = clamp(v, 0, MU_VIEW);
    const r = this.q('#rMu'); if (r) r.value = String(this.state.muDepth);
    const o = this.q('#oMu'); if (o) o.textContent = this.state.muDepth.toFixed(2);
  }
  setMuSign(s){
    this.state.muSign = s < 0 ? -1 : 1;
    this.syncPanel();
  }

  /* ---------- 外场 μ ---------- */
  hasField(){ for (let i = 0; i < this.state.mu.length; i++) if (this.state.mu[i] !== 0) return true; return false; }
  fieldSites(){ let n = 0; for (let i = 0; i < this.state.mu.length; i++) if (this.state.mu[i] !== 0) n++; return n; }
  applyField(){
    hbSetField(this.sec, this.hasField() ? this.state.mu : null);
    this.afterHChange('μ');
    this.queueUrl();
  }
  paintSite(i, sign){
    const L = this.state.L;
    if (i < 0 || i >= L) return;
    const v = sign === 0 ? 0 : Math.sign(sign) * Math.abs(this.state.muDepth);
    if (this.state.mu[i] === v) return;
    this.state.mu[i] = v;
    this.applyField();
  }
  clearField(loud){
    if (!this.hasField()){ if (loud) this.toast('场上没有势', 900); return; }
    this.state.mu = new Float64Array(this.state.L);
    this.applyField();
    if (loud) this.toast('已清空场', 1100);
  }

  /* ---------- 初态：点格点循环 空→↑→↓→↑↓ ---------- */
  toggleSite(i, dir = 1){
    const L = this.state.L;
    if (i < 0 || i >= L) return;
    const pat = Int8Array.from(this.state.pat);
    pat[i] = ((pat[i] + dir) % 4 + 4) % 4;
    let up = 0, dn = 0;
    for (let j = 0; j < L; j++){ if (pat[j] & 1) up++; if (pat[j] & 2) dn++; }
    if (up !== this.state.nUp || dn !== this.state.nDn){
      this.toast(`重建扇区 C(${L},${up})·C(${L},${dn}) = ${up === 0 || dn === 0 ? '…' : ''}`, 900);
      this.rebuildSector(up, dn);
    }
    this.state.pat = pat;
    if (this.staticTier()){
      /* L=12：设了占据也只是「换个扇区重新解基态」，不做逐帧演化 */
      this.state.mode = 'gs';
      this.resetTimeline();
      this.startSolve();
      this.syncPanel(); this.draw(); this.queueUrl();
      return;
    }
    /* 你指定的 Fock 态不可能同时是（含场）基态 ⟹ 自动进演化模式 */
    this.state.mode = 'evo';
    this.state.paused = false;
    this.state.t = 0; this.state.frames = 0; this.hist = []; this.slope = null;
    const w = hbProductFromPattern(this.sec, pat);
    this.re = w.re; this.im = w.im;
    this.job = null;
    this.measureAll(true);
    this.syncPanel(); this.draw(); this.queueUrl();
  }
  resetPattern(){
    if (this.staticTier()){ this.toast('L=12 静态档：只能解基态，不做态演化', 2400); return; }
    /* 【坑】复位填充只改图案、不重建扇区：之前点过格点（粒子数变了）时，Néel 图案
       与新扇区不匹配 ⟹ hbProductFromPattern 查不到基态索引、返回**全零向量** ⟹
       占据箭头/n_i/图表全空（看着就是黑屏）。所以先按图案把扇区对齐。 */
    this.state.pat = neelPattern(this.state.L);
    let up = 0, dn = 0;
    for (const c of this.state.pat){ if (c & 1) up++; if (c & 2) dn++; }
    if (up !== this.state.nUp || dn !== this.state.nDn) this.rebuildSector(up, dn);
    this.state.mode = 'evo';
    this.state.paused = false;
    const w = hbProductFromPattern(this.sec, this.state.pat);
    this.re = w.re; this.im = w.im;
    this.state.t = 0; this.state.frames = 0; this.hist = [];
    this.measureAll(true);
    this.syncPanel(); this.draw(); this.queueUrl();
  }
  rebuildSector(nUp, nDn){
    this.cancelSolve();
    this.sec = hbSector(this.state.L, nUp, nDn);
    this.state.nUp = nUp; this.state.nDn = nDn;
    /* 新扇区是新对象：外场必须重新烘进去（旧 diagPot 随旧 sec 丢弃） */
    hbSetField(this.sec, this.hasField() ? this.state.mu : null);
    this.job = null; this.gapJob = null; this.gap = null;
    /* 新扇区的维度/粒子数都变了：上一扇区的测量、观测量缓存、在飞的剖面任务全部作废，
       否则 drawLadder 会拿旧长度的 nU[i]（undefined）去画，画面直接空掉。 */
    this.m = null; this.bsig = null; this.S = 0; this.E = undefined;
    this.sxJob = null; this.probe = { sx: null, sxL: 0, nk: null, nn: null, rho: null, live: false };
    this._dirty = { sx: true, nk: true, nn: true };
    this.resetTimeline();
    this.q('#hGap').textContent = '—';
    this.q('#hDim').textContent = String(this.sec.dim);
  }

  /* ---------- 求解任务 ---------- */
  startSolve(){
    if (!this.sec) return;
    this.state.mode = 'gs';
    this.state.paused = true;
    this.q('#hbPause').textContent = '继续';
    this.msg = '基态求解中…';
    this.residual = null;
    const m = this.sec.dim > 200000 ? 140 : (this.sec.dim > 10000 ? 90 : 140);
    this.job = { task: new HbGsTask(this.sec, 1, this.state.U, { m, maxMemMB: 700 }), kind: 'gs' };
  }
  scheduleSolve(ms = 260){
    clearTimeout(this._solveTimer);
    this._solveTimer = setTimeout(() => {
      this._solveTimer = null;
      /* 定时器可能在「重置 / 切到演化 / 换扇区」之后才响：只在仍处基态时兑现，
         否则它会静默把用户刚设好的初态替换成基态。 */
      if (this.state.mode === 'gs') this.startSolve();
    }, ms);
  }
  cancelSolve(){
    if (this._solveTimer){ clearTimeout(this._solveTimer); this._solveTimer = null; }
  }
  startGap(){
    if (this.gapJob || !this.re) return;
    const L = this.state.L, U = this.state.U, N = L / 2;
    if (this.state.nUp !== N || this.state.nDn !== N){
      this.toast('能隙定义在半满 N↑=N↓=L/2：先复位填充', 2200);
      return;
    }
    const fld = this.hasField() ? this.state.mu : null;
    const secP = hbSector(L, N + 1, N), secM = hbSector(L, N - 1, N);
    hbSetField(secP, fld); hbSetField(secM, fld);   /* 三个扇区同一外场，Δ 才可比 */
    this.gapJob = {
      phase: 0, U,
      ep: new HbGsTask(secP, 1, U, { m: 120 }),
      em: null, secM,
    };
    this.toast('算能隙：解 (N+1,N) 扇区…', 1200);
  }
  advanceJobs(){
    if (this.job){
      /* 时间预算：L=12 单次 Lanczos 迭代 ~175ms，固定 step(6) 会冻 1s/帧 */
      const t0 = performance.now();
      let r;
      do { r = this.job.task.step(1); } while (!r.done && performance.now() - t0 < 18);
      const stEl = this.q('#hbStat');
      if (stEl && !r.done) stEl.textContent = `解基态 ${this.job.task.iter}/${this.job.task.m}`;
      if (r.done){
        this.re = this.job.task.re; this.im = this.job.task.im;
        this.gsM = this.job.task.m; this.gsMCapped = this.job.task.mCapped;
        this.job = null;
        this.msg = '';
        this.residual = hbResidual(this.sec, this.re, this.im, 1, this.state.U);
        this._sNeed = true;
        this.measureAll(true);
        this.state.paused = false;
        this.q('#hbPause').textContent = '暂停';
        this.queueUrl();
      }
    }
    if (this.gapJob){
      const g = this.gapJob;
      if (g.phase === 0){
        const r = g.ep.step(6);
        if (r.done){
          g.phase = 1;
          g.em = new HbGsTask(g.secM, 1, g.U, { m: 120 });
          this.toast('算能隙：解 (N−1,N) 扇区…', 1200);
        }
      } else if (g.phase === 1){
        const r = g.em.step(6);
        if (r.done){
          const e0 = hbEnergy(this.sec, this.re, this.im, 1, g.U);
          this.gap = g.ep.energy + g.em.energy - 2 * e0;
          this.q('#hGap').textContent = nf(this.gap, 4);
          this.toast('Δ = ' + nf(this.gap, 4) + ' t', 2000);
          this.gapJob = null;
        }
      }
    }
  }

  /* ---------- Phase-2 观测量：S(x) / n(k) / ⟨n_i n_j⟩ ----------
     三个量都是「当前态的单帧泛函」，逐帧重算会吃掉帧率，所以：
       · 演化未暂停 ⟹ 不重算，图右上角标「暂停后更新」（缓存的旧值仍可看）；
       · 基态 / 暂停 ⟹ 按脏标记惰性重算。
     S(x) 全扫 L=10 约 0.6s（边切点便宜、中心最贵），用**渐进任务**由外向内填，
     每帧给 8ms 预算 ⟹ 剖面从两端长出来；n(k)（~100ms）与 ⟨nn⟩（~10ms）单次同步。 */
  setView(k){
    if (!HB_VIEWS.some(v => v.k === k)) return false;
    this.state.view = k;
    /* 演化中切过来：拍一次快照（用户动作触发，不放进逐帧路径） */
    if (this.re && !this.probesLive() && k !== 'St') this.snapshotProbes();
    this.syncPanel(); this.queueUrl(); this.draw();
    return true;
  }
  invalidateProbes(){
    this._dirty = { sx: true, nk: true, nn: true };
    this.sxJob = null;
  }
  /* 能否拿 this.re 去算观测量。除模式/暂停外还必须核对**维度**：
     正在解新扇区的基态时，this.sec 已经换了，但 this.re 还是上一个扇区的旧向量，
     拿去算 S(x)/n(k)/⟨nn⟩ 只会得到 NaN（dist139 就是这样把 NaN 送进 symEigVals 的）。 */
  probeReady(){ return !!this.re && !!this.sec && this.re.length === this.sec.dim && !this.job; }
  probesLive(){ return this.probeReady() && (this.state.mode === 'gs' || this.state.paused); }
  /* 由外向内：切点 x 与 L−x 的代价都 ∝ min(x,L−x)·…，所以先算便宜的两端 */
  startSx(){
    if (!this.probeReady()) return;
    const L = this.state.L, order = [];
    for (let d = 0; d <= (L >> 1); d++){
      order.push(d); if (L - d !== d) order.push(L - d);
    }
    const out = new Float64Array(L + 1).fill(NaN);
    /* 抓快照：演化中 this.re/im 每帧都是新数组，任务跨帧读会被换掉 */
    this.sxJob = { order, k: 0, out, L, sec: this.sec, t0: performance.now(), re: this.re.slice(), im: this.im.slice() };
    this.probe.sx = out; this.probe.sxL = L;
  }
  stepSx(budget = 8){
    const j = this.sxJob; if (!j) return;
    /* 扇区身份也校验：同 L 但粒子数变了（新 sec、新维度）时旧快照会读出 undefined → NaN */
    if (!this.re || j.L !== this.state.L || j.sec !== this.sec || j.re.length !== this.sec.dim){
      this.sxJob = null; return;
    }
    const t0 = performance.now();
    while (j.k < j.order.length && performance.now() - t0 < budget){
      const c = j.order[j.k++];
      j.out[c] = (c <= 0 || c >= j.L) ? 0 : hbEntropyAt(this.sec, j.re, j.im, c).S;
    }
    this.probe.sx = j.out;
    if (j.k >= j.order.length){
      this.sxMs = performance.now() - j.t0;
      this.sxJob = null; this._dirty.sx = false;
    }
  }
  computeNk(){
    if (!this.probeReady()) return;
    const L = this.state.L;
    const rho = hbCorrelation(this.sec, this.re, this.im);
    const nk = new Float64Array(L);
    for (let m = 0; m < L; m++) nk[m] = hbMomentumDist(rho, L, m);
    this.probe.rho = rho; this.probe.nk = nk; this._dirty.nk = false;
  }
  computeNn(){
    if (!this.probeReady()) return;
    this.probe.nn = hbDensityCorr(this.sec, this.re, this.im); this._dirty.nn = false;
  }
  /* 演化中切视图用：单次快照（n(k) ~100ms、⟨nn⟩ ~10ms；S(x) 起渐进任务） */
  snapshotProbes(){
    if (!this.probeReady()) return;
    const v = this.state.view;
    if (v === 'nk') this.computeNk();
    else if (v === 'nn') this.computeNn();
    else if (v === 'Sx' && !this.sxJob) this.startSx();
  }
  ensureProbe(){
    if (!this.re || !this.probesLive()) return;
    const v = this.state.view;
    if (v === 'Sx'){
      if ((this._dirty.sx || (this.probe.sxL !== this.state.L)) && !this.sxJob) this.startSx();
    } else if (v === 'nk' && this._dirty.nk) this.computeNk();
    else if (v === 'nn' && this._dirty.nn) this.computeNn();
  }
  /* 同步算到底：导出与调试句柄用（L=10 约 0.75s，全部就绪） */
  probeAll(){
    if (!this.probeReady()) return null;
    const L = this.state.L;
    this.probe.sx = hbEntropyProfile(this.sec, this.re, this.im); this.probe.sxL = L;
    this.computeNk(); this.computeNn();
    this.sxJob = null; this._dirty = { sx: false, nk: false, nn: false };
    return { sx: this.probe.sx, nk: this.probe.nk, nn: this.probe.nn };
  }

  /* ---------- Phase-3：协议（演化中按时间表改 H） ----------
     协议不是预设：它给 H 加一条时间表，逐帧改写 U 或 μ。「停止协议」会把协议开始前的
     U/μ 复原（否则用户会以为参数被协议吃掉了）。 */
  staticTier(){ return this.state.L >= 12; }
  startProtocol(kind){
    const P = HB_PROTOCOLS[kind];
    if (!P) return;
    if (this.staticTier()){ this.toast('L=12 静态档：不做实时演化（协议需要逐帧推进）', 2400); return; }
    if (this.state.mode !== 'evo') this.applyMode('evo');
    this.protoSaved = { U: this.state.U, mu: Float64Array.from(this.state.mu) };
    this.proto = { kind, T: P.T, A: P.A ?? 0, w: P.w ?? 1, site: 0 };
    this.protoStart = this.state.t;
    this.state.paused = false;
    this.q('#hbPause').textContent = '暂停';
    this.toast(P.tip, 2400);
    this.syncPanel(); this.draw();
  }
  stopProtocol(restore){
    if (!this.proto) return;
    this.proto = null;
    if (restore && this.protoSaved){
      this.state.U = this.protoSaved.U;
      this.state.mu = Float64Array.from(this.protoSaved.mu);
      hbSetField(this.sec, this.hasField() ? this.state.mu : null);
      this.protoSaved = null;
    }
    this.syncPanel(); this.draw();
  }
  applyProtocol(){
    const p = this.proto;
    if (!p || this.state.paused || this.state.mode !== 'evo') return;
    const L = this.state.L, tau = this.state.t - this.protoStart;
    const f = clamp(tau / p.T, 0, 1);
    if (p.kind === 'uramp'){
      const U = (this.protoSaved ? this.protoSaved.U : this.state.U) * f;
      this.state.U = U;
      this.q('#rU').value = String(U);
      this.q('#oU').textContent = U.toFixed(2);
      this.q('#hU').textContent = U.toFixed(2);
    } else if (p.kind === 'pulse'){
      const a = f < 1 ? -p.A * Math.sin(Math.PI * f) ** 2 : 0;
      const mu = new Float64Array(L);
      mu[p.site] = a;
      this.state.mu = mu;
      hbSetField(this.sec, a === 0 ? null : mu);
    } else if (p.kind === 'push'){
      const x = 1 + (L - 2) * f;
      const mu = new Float64Array(L);
      for (let i = 0; i < L; i++) mu[i] = -p.A * Math.exp(-((i - x) ** 2) / (2 * p.w * p.w));
      this.state.mu = mu;
      hbSetField(this.sec, mu);
    }
    if (f >= 1) this.stopProtocol(true);
    this.syncProtoInfo();
  }
  syncProtoInfo(){
    const el = this.q('#hbProtoInfo');
    if (!el) return;
    if (!this.proto){ el.textContent = '—'; return; }
    const P = HB_PROTOCOLS[this.proto.kind];
    const f = clamp((this.state.t - this.protoStart) / this.proto.T, 0, 1);
    el.textContent = `${P.name} ${(f * 100).toFixed(0)}%`;
    el.classList.toggle('on', true);
  }

  /* ---------- Phase-3：时间轴检查点 + 拖动 ----------
     每 CP_EVERY 个时间单位存一份态快照（环形缓冲，按内存预算定上限）⟹ 滑到任意已记录
     时刻是**精确复现**（不是从 0 重算）；从某点继续则截断未来（分支）。 */
  maxCp(){
    if (!this.sec) return 8;
    return clamp(Math.floor((24 * 1048576) / (this.sec.dim * 16)), 8, 120);
  }
  resetTimeline(){ this.cps = []; this.cpNext = 0; this.scrubIdx = -1; this.syncScrub(); }
  pushCheckpoint(force){
    if (!this.re || this.state.mode !== 'evo') return;
    if (!force && this.state.t + 1e-9 < this.cpNext) return;
    this.cpNext = this.state.t + 0.5;
    this.cps.push({
      t: this.state.t, re: Float64Array.from(this.re), im: Float64Array.from(this.im),
      S: this.S, D: this.m ? this.m.Dtot : 0,
    });
    const max = this.maxCp();
    while (this.cps.length > max) this.cps.shift();
    this.scrubIdx = -1;
    this.syncScrub();
  }
  scrubTo(i){
    if (!this.cps.length) return;
    i = clamp(i | 0, 0, this.cps.length - 1);
    const cp = this.cps[i];
    this.re = Float64Array.from(cp.re); this.im = Float64Array.from(cp.im);
    this.state.t = cp.t;
    this.state.frames = Math.round(cp.t / Math.max(1e-9, this.state.dt * this.state.spf));
    this.state.paused = true;
    this.cps.length = i + 1;
    this.cpNext = cp.t + 0.5;
    this.scrubIdx = i;
    this.hist = this.hist.filter(pt => pt[0] <= cp.t + 1e-9);
    this.measureAll(true);
    this.syncPanel(); this.draw();
  }
  syncScrub(){
    const row = this.q('#hbScrubRow'), inp = this.q('#hbScrub'), info = this.q('#hbScrubInfo');
    if (!row || !inp || !info) return;
    const n = this.cps.length;
    const on = this.state.mode === 'evo' && n > 0;
    row.classList.toggle('off', !on);
    inp.max = String(Math.max(0, n - 1));
    inp.value = String(this.scrubIdx >= 0 ? this.scrubIdx : Math.max(0, n - 1));
    info.textContent = on
      ? `${n} 帧 · t=${this.cps[this.scrubIdx >= 0 ? this.scrubIdx : n - 1].t.toFixed(2)}（←/→ 步进）`
      : '演化中累积';
  }

  /* ---------- Phase-3：U/t 扫描（分片推进，UI 不冻） ---------- */
  startScan(){
    if (this.scan) return;
    if (this.staticTier()){ this.toast('L=12 静态档不做扫描（每点基态 ~20 s）', 2400); return; }
    if (this.hasField()){ this.toast('先清空场再扫描（扫描是「干净」Hubbard）', 2200); return; }
    const Us = [];
    for (let U = 0; U <= this.state.Umax + 1e-9; U += 2) Us.push(U);
    /* L=8：m=140 让 U=6/8 的残差落到 1e-13（m=60 只有 2e-3，Lanczos 还没收敛）；
       L≥10：单点成本高，降 m 并缩短窗，扫描仍能看出趋势（残差在图上逐点标出） */
    const big = this.state.L >= 10;
    this.scan = new HbScanTask(this.sec, {
      Us, dt: 0.1, tMax: big ? 8 : 10, sample: 0.5,
      gsM: big ? 100 : 140, mKrylov: 10,
      pattern: Int8Array.from(this.state.pat),
    });
    this.scanRes = []; this.scanT0 = performance.now(); this.scanMsTotal = 0;
    this.setView('scan');
    this.toast(`扫描 ${Us.length} 个 U/t（L=${this.state.L}）…`, 1600);
    this.syncPanel();
  }
  stopScan(){
    if (!this.scan) return;
    this.scan = null;
    this.toast('扫描已中止', 1200);
    this.syncPanel(); this.draw();
  }
  stepScan(){
    const sc = this.scan;
    if (!sc) return;
    sc.step(18);
    this.scanRes = sc.results.slice();
    if (sc.done){
      this.scanMsTotal = performance.now() - this.scanT0;
      this.scan = null;
      this.toast(`扫描完成：${this.scanRes.length} 点 · ${(this.scanMsTotal / 1000).toFixed(1)} s`, 2200);
      this.syncPanel();
    }
  }

  /* ---------- 演化 ---------- */
  evolveFrame(){
    if (this.staticTier()) return;          /* L=12：单步 Krylov ~0.5s，不进实时循环 */
    const { dt, spf } = this.state;
    for (let i = 0; i < spf; i++){
      const o = hbKrylovExp(this.sec, this.re, this.im, 1, this.state.U, dt, 12);
      this.re = o.re; this.im = o.im;
      this.state.t += dt;
    }
    this.state.frames++;
    this.pushCheckpoint();
  }
  stepFrames(n){
    if (this.state.mode !== 'evo') return;
    for (let i = 0; i < n; i++){
      this.evolveFrame();
      if (i % 2 === 1) this.measureAll(false);
    }
    this.measureAll(true);
    this.draw();
  }
  measureAll(force){
    if (!this.re) return;
    /* 维度不一致 = 态向量还是上一个扇区的：任何测量都会是 NaN，直接跳过（HUD 保留旧值） */
    if (this.re.length !== this.sec.dim) return;
    this.invalidateProbes();
    const m = hbMeasure(this.sec, this.re, this.im);
    this.m = m;
    this.E = hbEnergy(this.sec, this.re, this.im, 1, this.state.U);
    /* 熵是最贵的一项（L=8 16ms / L=10 70ms / L=12 2.8s，随中心切点爆炸）。
       L≥10 演化中按 250ms 节流（否则每两帧一次会把 8fps 拖到 2fps）；L=8 逐次算。
       L=12 静态档只在「需要」时算（_sNeed 由求解完成/显式刷新置位）。 */
    const now = performance.now();
    let ent;
    if (this.staticTier()){
      ent = this._sNeed ? hbEntropy(this.sec, this.re, this.im) : { S: this.S || 0, spectrum: [], sum: 1 };
      if (this._sNeed){ this._sNeed = false; this._sT = now; }
    } else if (force || this.state.mode === 'gs' ||
               now - (this._sT || 0) > (this.sec.dim > 20000 ? 250 : 0)){
      ent = hbEntropy(this.sec, this.re, this.im);
      this._sT = now;
    } else {
      ent = { S: this.S || 0, spectrum: [], sum: 1 };
    }
    this.S = ent.S;
    if (this.state.mode === 'evo'){
      if (!this.hist.length || this.state.t - this.hist[this.hist.length - 1][0] > 1e-9)
        this.hist.push([this.state.t, ent.S]);
      if (this.hist.length > 4000) this.hist.shift();
    } else {
      this.hist = [[0, ent.S], [1, ent.S]];
    }
    /* 演化态在 t=0 时先落一个检查点：否则「拖回最左」是第一步之后，不是初态 */
    if (this.state.mode === 'evo' && !this.cps.length && this.state.t < 1e-9) this.pushCheckpoint(true);
    this.bsig = hbBondCorr(this.sec, this.re, this.im, 1);
    let fld = 0;
    for (let i = 0; i < this.state.L; i++) fld += this.state.mu[i] * m.nT[i];
    this.fieldE = fld;
    /* HUD */
    this.q('#hMode').textContent = this.state.mode === 'gs' ? '基态（H 变即重解）' : '演化';
    this.q('#hDim').textContent = String(this.sec.dim) + (this.staticTier() ? ' · 静态档' : '');
    this.q('#hE').textContent = nf(this.E, 5);
    this.q('#hPot').textContent = this.hasField() ? nf(fld, 4) : '—';
    this.q('#hD').textContent = nf(m.Dtot, 4);
    this.q('#hS').textContent = nf(ent.S, 4);
    this.q('#hN').textContent = this.state.nUp + ' / ' + this.state.nDn;
    this.q('#hNorm').textContent = nf(hbNorm(this.re, this.im), 8);
    this.q('#hT').textContent = nf(this.state.t, 2) + ' / ' + this.state.frames;
    this.q('#hbStat').textContent = 'S=' + nf(ent.S, 3) + ' · D=' + nf(m.Dtot, 2);
    if (this.state.mode === 'evo'){
      const win = this.hist.filter(p => p[0] <= this.state.L / 3);
      if (win.length > 3){
        const xs = win.map(p => p[0]), ys = win.map(p => p[1]);
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
        let sxy = 0, sxx = 0;
        for (let i = 0; i < xs.length; i++){ sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
        this.slope = sxx > 0 ? sxy / sxx : 0;
        this.q('#hSlope').textContent = nf(this.slope, 3);
      }
    }
    void force;
  }

  /* ---------- 绘制 ---------- */
  resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const id of ['#hbLadder', '#hbChart']){
      const c = this.q(id);
      if (!c) continue;
      const w = c.clientWidth || 640, h = c.clientHeight || (id === '#hbLadder' ? 300 : 170);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
  }
  draw(){
    this.drawLadder();
    this.drawChart();
  }
  /* 格点链：卡片（↑/↓ 占据 + 双占徽标 + n_i）/ μ 带 / J 带 / 序号 */
  drawLadder(){
    const cv = this.q('#hbLadder');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const dpr = W / (cv.clientWidth || W) || 1;
    ctx.clearRect(0, 0, W, H);
    const L = this.state.L;
    const pad = 42 * dpr, stepX = (W - 2 * pad) / Math.max(1, L - 1);
    const xOf = i => pad + i * stepX;
    const cardW = Math.min(stepX * 0.66, 66 * dpr), cardH = 74 * dpr, cardY = 30 * dpr;
    const nY = cardY + cardH + 15 * dpr;
    const muZero = 176 * dpr, muAmp = 30 * dpr;
    const jZero = 246 * dpr, jAmp = 14 * dpr;
    const idxY = H - 9 * dpr;
    this._view = { pad, stepX, cardW, cardH, cardY, W, H, dpr };
    const m = this.m;
    const mono = px => `${px}px ui-monospace,monospace`;

    const rrect = (x, y, w, h, r) => {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    };

    /* 顶部提示（跟随当前工具，不放常驻图例） */
    const tool = HB_TOOLS.find(t => t.k === this.state.tool) || HB_TOOLS[0];
    ctx.fillStyle = 'rgba(154,167,189,.92)'; ctx.font = mono(10.5 * dpr); ctx.textAlign = 'left';
    ctx.fillText(`格点 i · ${tool.tip}`, 10 * dpr, 15 * dpr);

    /* 悬停高亮：只包住这一格的卡片（整列色柱会像选中了整列，干扰读数） */
    if (this._hover >= 0 && this._hover < L){
      const hx = xOf(this._hover);
      rrect(hx - cardW / 2 - 4 * dpr, cardY - 4 * dpr, cardW + 8 * dpr, cardH + 8 * dpr, 9 * dpr);
      ctx.fillStyle = 'rgba(103,232,249,.07)'; ctx.fill();
    }

    /* μ 带基线 + J 带基线 */
    ctx.strokeStyle = 'rgba(120,160,220,.16)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(pad - 22 * dpr, muZero); ctx.lineTo(W - pad + 22 * dpr, muZero); ctx.stroke();

    /* 逐格：卡片 + 占据 + 双占 + μ 柱 */
    for (let i = 0; i < L; i++){
      const x = xOf(i), nu = m ? m.nU[i] : 0, nd = m ? m.nD[i] : 0;
      const dbl = m ? m.dbl[i] : 0;
      const on = this._paint && this._paint.i === i;
      /* 卡片 */
      rrect(x - cardW / 2, cardY, cardW, cardH, 7 * dpr);
      ctx.fillStyle = 'rgba(9,16,30,.72)'; ctx.fill();
      ctx.strokeStyle = on ? 'rgba(103,232,249,.75)' : (this._hover === i ? 'rgba(103,232,249,.34)' : 'rgba(120,160,220,.20)');
      ctx.lineWidth = (on ? 1.6 : 1) * dpr; ctx.stroke();
      /* 上下半区：↑ 冷色 / ↓ 品红，柱高与箭头位置都随占据分数 */
      const halfH = (cardH - 12 * dpr) / 2;
      /* dir=+1：柱自半区底向上长、箭头朝上（↑）；dir=−1：自半区顶向下长、箭头朝下（↓） */
      const slot = (x, yTop, frac, col, dir) => {
        const f = clamp(frac, 0, 1);
        ctx.strokeStyle = 'rgba(120,160,220,.14)'; ctx.lineWidth = 1 * dpr;
        ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, yTop + halfH); ctx.stroke();
        if (f < 0.02) return;
        const h = halfH * f, s = 4.2 * dpr;
        const tip = dir > 0 ? yTop + halfH - h : yTop + h;
        ctx.fillStyle = col.replace('ALPHA', (0.30 + 0.45 * f).toFixed(3));
        ctx.fillRect(x - 2 * dpr, dir > 0 ? tip : yTop, 4 * dpr, h);
        ctx.fillStyle = col.replace('ALPHA', (0.55 + 0.45 * f).toFixed(3));
        ctx.beginPath();
        if (dir > 0){ ctx.moveTo(x - s, tip + s); ctx.lineTo(x, tip); ctx.lineTo(x + s, tip + s); }
        else { ctx.moveTo(x - s, tip - s); ctx.lineTo(x, tip); ctx.lineTo(x + s, tip - s); }
        ctx.closePath(); ctx.fill();
      };
      slot(x, cardY + 5 * dpr, nu, 'rgba(103,232,249,ALPHA)', 1);
      slot(x, cardY + cardH / 2 + 1 * dpr, nd, 'rgba(240,171,252,ALPHA)', -1);
      /* 双占徽标：半径 ∝ ⟨n↑n↓⟩ */
      if (dbl > 0.02){
        ctx.fillStyle = 'rgba(251,191,36,' + (0.35 + 0.55 * clamp(dbl, 0, 1)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x + cardW / 2 + 5 * dpr, cardY + 5 * dpr, (2.0 + 3.6 * clamp(dbl, 0, 1)) * dpr, 0, 6.2832);
        ctx.fill();
      }
      /* n_i */
      ctx.fillStyle = 'rgba(230,237,243,.80)'; ctx.font = mono(10 * dpr); ctx.textAlign = 'center';
      ctx.fillText((nu + nd).toFixed(2), x, nY);
      /* μ 柱（左键吸引=负=向下冷色，排斥=正=向上暖色） */
      const mu = this.state.mu[i];
      if (mu !== 0){
        const h = clamp(Math.abs(mu) / MU_VIEW, 0, 1) * muAmp;
        ctx.fillStyle = mu < 0 ? 'rgba(96,178,250,.72)' : 'rgba(250,190,96,.72)';
        ctx.fillRect(x - 5 * dpr, mu < 0 ? muZero : muZero - h, 10 * dpr, h);
      }
      /* 序号 */
      ctx.fillStyle = 'rgba(154,167,189,.85)'; ctx.font = mono(10 * dpr); ctx.textAlign = 'center';
      ctx.fillText(String(i), x, idxY);
    }

    /* 键关联 J_i（格点之间，正青负琥珀） */
    if (this.bsig && this.bsig.length){
      const maxJ = Math.max(1e-9, ...Array.from(this.bsig, Math.abs));
      for (let s = 0; s < L - 1; s++){
        const j = this.bsig[s], mx = (xOf(s) + xOf(s + 1)) / 2;
        const h = Math.abs(j) / maxJ * jAmp;
        ctx.fillStyle = j >= 0 ? 'rgba(103,232,249,.55)' : 'rgba(251,191,36,.6)';
        ctx.fillRect(mx - 3 * dpr, j >= 0 ? jZero - h : jZero, 6 * dpr, Math.max(h, 0.6 * dpr));
      }
    }
    /* 两条带的说明（左缘，极小字号，不占版面） */
    ctx.textAlign = 'left'; ctx.font = mono(9 * dpr);
    ctx.fillStyle = 'rgba(154,167,189,.55)';
    ctx.fillText('μ', 8 * dpr, muZero + 3 * dpr);
    ctx.fillText('J', 8 * dpr, jZero + 3 * dpr);
    ctx.fillStyle = 'rgba(154,167,189,.42)';
    ctx.fillText('Π', 8 * dpr, nY + 3 * dpr);
  }
  drawChart(){
    const cv = this.q('#hbChart');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height, dpr = W / (cv.clientWidth || W) || 1;
    ctx.clearRect(0, 0, W, H);
    const mono = px => `${px}px ui-monospace,monospace`;
    this.ensureProbe();
    const v = this.state.view;
    if (v === 'Sx') return this.drawProbeSx(ctx, W, H, dpr, mono);
    if (v === 'nk') return this.drawProbeNk(ctx, W, H, dpr, mono);
    if (v === 'nn') return this.drawProbeNn(ctx, W, H, dpr, mono);
    if (v === 'scan') return this.drawScan(ctx, W, H, dpr, mono);
    const padL = 42 * dpr, padR = 14 * dpr, padT = 20 * dpr, padB = 26 * dpr;
    const x0 = padL, y0 = H - padB, w = W - padL - padR, h = H - padT - padB;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(154,167,189,.9)'; ctx.font = mono(10.5 * dpr);

    if (this.state.mode === 'gs'){
      /* 定态没有时间轴：横轴是 t 的话只能画一条直线（信息量为零），
         改成 S 相对上限 (L/2)ln2 的标尺 + 双占读数。 */
      const L = this.state.L, Smax = (L / 2) * Math.LN2;
      const S = Number.isFinite(this.S) ? this.S : 0;
      ctx.fillText(`半链纠缠熵 S（基态标尺，上限 (L/2)ln2 = ${Smax.toFixed(2)}）`, padL, 13 * dpr);
      const barY = padT + h * 0.42, barH = 14 * dpr;
      ctx.fillStyle = 'rgba(120,160,220,.10)';
      ctx.fillRect(x0, barY, w, barH);
      ctx.fillStyle = 'rgba(103,232,249,.72)';
      ctx.fillRect(x0, barY, w * clamp(S / Smax, 0, 1), barH);
      ctx.strokeStyle = 'rgba(120,160,220,.28)'; ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(x0, barY, w, barH);
      /* 25/50/75% 刻度 */
      ctx.fillStyle = 'rgba(154,167,189,.55)'; ctx.font = mono(9 * dpr);
      for (const f of [0.25, 0.5, 0.75]){
        const x = x0 + w * f;
        ctx.fillRect(x, barY - 3 * dpr, 1 * dpr, barH + 6 * dpr);
        ctx.fillText((Smax * f).toFixed(2), x - 8 * dpr, barY + barH + 13 * dpr);
      }
      ctx.fillStyle = 'rgba(230,237,243,.92)'; ctx.font = mono(11.5 * dpr);
      ctx.fillText('S = ' + S.toFixed(4), x0 + w * clamp(S / Smax, 0, 1) + 8 * dpr, barY + barH * 0.75 - 10 * dpr);
      ctx.fillStyle = 'rgba(154,167,189,.85)'; ctx.font = mono(10 * dpr);
      const m = this.m;
      ctx.fillText(`D = ${m ? m.Dtot.toFixed(4) : '—'}   ·   Σμ⟨n⟩ = ${this.hasField() ? nf(this.fieldE, 3) : '0'}   ·   ` +
        '改 U / μ 会就地重解（时间轴只在「从初态演化」下有意义）', padL, H - 6 * dpr);
      return;
    }

    ctx.strokeStyle = 'rgba(120,160,220,.2)'; ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(x0, padT, w, h);
    ctx.fillStyle = 'rgba(154,167,189,.9)'; ctx.font = mono(10.5 * dpr);
    ctx.fillText('半链纠缠熵 S(t)  ·  虚线=早窗线性拟合', padL, 13 * dpr);
    const hist = this.hist.length ? this.hist : [[0, 0], [1, 0]];
    const tMax = Math.max(1e-6, hist[hist.length - 1][0]);
    const sMax = Math.max(1e-3, ...hist.map(p => p[1])) * 1.15;
    const px = t => x0 + (t / tMax) * w;
    const py = s => y0 - (s / sMax) * h;
    ctx.fillStyle = 'rgba(154,167,189,.8)';
    ctx.fillText(tMax.toFixed(1), x0 + w - 26 * dpr, y0 + 16 * dpr);
    ctx.fillText('0', x0 - 10 * dpr, y0 + 16 * dpr);
    ctx.fillText(sMax.toFixed(2), 4 * dpr, padT + 10 * dpr);
    ctx.strokeStyle = 'rgba(103,232,249,.95)'; ctx.lineWidth = 1.8 * dpr;
    ctx.beginPath();
    hist.forEach(([t2, s2], i) => { i ? ctx.lineTo(px(t2), py(s2)) : ctx.moveTo(px(t2), py(s2)); });
    ctx.stroke();
    if (this.slope){
      ctx.strokeStyle = 'rgba(251,191,36,.8)'; ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      const tEnd = Math.min(this.state.L / 3, tMax);
      const s0 = hist[0][1];
      ctx.moveTo(px(0), py(s0)); ctx.lineTo(px(tEnd), py(s0 + this.slope * tEnd));
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(251,191,36,.9)'; ctx.font = mono(9.5 * dpr);
      ctx.fillText('dS/dt = ' + nf(this.slope, 3), x0 + 8 * dpr, padT + 12 * dpr);
    }
    ctx.fillStyle = 'rgba(154,167,189,.75)'; ctx.font = mono(10 * dpr);
    ctx.fillText('t（每帧 ' + this.state.spf * this.state.dt + ' t）', x0 + w - 108 * dpr, y0 + 16 * dpr);
  }

  /* ---------- 三个观测视图 ---------- */
  /* 图表通用抬头：标题 + 右上角状态（未暂停时提示数据是旧的） */
  probeHead(ctx, dpr, mono, title, sub, W){
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(154,167,189,.9)'; ctx.font = mono(10.5 * dpr);
    ctx.fillText(title, 14 * dpr, 13 * dpr);
    if (sub){
      ctx.fillStyle = this.probesLive() ? 'rgba(154,167,189,.62)' : 'rgba(251,191,36,.75)';
      ctx.font = mono(9.5 * dpr); ctx.textAlign = 'right';
      ctx.fillText(sub, W - 14 * dpr, 13 * dpr);
      ctx.textAlign = 'left';
    }
  }
  /* S(x)：切点 x 处的左半熵。已算的点连线，未算的点跳过（渐进长出） */
  drawProbeSx(ctx, W, H, dpr, mono){
    const L = this.state.L;
    const x0 = 44 * dpr, y0 = H - 26 * dpr, w = W - 44 * dpr - 16 * dpr, h = H - 22 * dpr - 26 * dpr;
    const sx = (this.probe.sxL === L) ? this.probe.sx : null;
    let sMax = 0.35;
    if (sx) for (let i = 1; i < L; i++) if (Number.isFinite(sx[i])) sMax = Math.max(sMax, sx[i]);
    sMax = Math.max(sMax * 1.18, Math.LN2 * 1.05);
    const px = x => x0 + (x / L) * w, py = s => y0 - (s / sMax) * h;
    this.probeHead(ctx, dpr, mono, `纠缠剖面 S(x) · 切点 x 左侧 ${'x'} 格（纵轴上限 ${sMax.toFixed(2)}）`,
      this.probesLive() ? (this.sxJob ? `填充 ${this.sxJob.k}/${L + 1}` : (this.sxMs ? this.sxMs.toFixed(0) + ' ms' : '')) : '演化中 · 暂停后更新', W);
    /* 轴 */
    ctx.strokeStyle = 'rgba(120,160,220,.20)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,160,220,.18)'; ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath(); ctx.moveTo(px(L >> 1), py(0)); ctx.lineTo(px(L >> 1), py(sMax * 0.86)); ctx.stroke();
    ctx.setLineDash([]);
    /* 曲线：只在连续已算点上连线 */
    if (sx){
      ctx.strokeStyle = 'rgba(103,232,249,.92)'; ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath();
      let pen = false;
      for (let x = 0; x <= L; x++){
        if (!Number.isFinite(sx[x])){ pen = false; continue; }
        const X = px(x), Y = py(sx[x]);
        pen ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); pen = true;
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(103,232,249,.95)';
      for (let x = 0; x <= L; x++){
        if (!Number.isFinite(sx[x])) continue;
        ctx.beginPath(); ctx.arc(px(x), py(sx[x]), 2.0 * dpr, 0, 6.2832); ctx.fill();
      }
      /* 半链读数：与 HUD 的 S 对齐（x=L/2） */
      const half = sx[L >> 1];
      if (Number.isFinite(half)){
        ctx.fillStyle = 'rgba(230,237,243,.9)'; ctx.font = mono(10 * dpr);
        ctx.textAlign = 'center';
        ctx.fillText('S(L/2) = ' + half.toFixed(4), px(L >> 1), py(half) - 7 * dpr);
        ctx.textAlign = 'left';
      }
    }
    /* x 刻标 */
    ctx.fillStyle = 'rgba(154,167,189,.55)'; ctx.font = mono(8.5 * dpr);
    for (let x = 0; x <= L; x += (L > 8 ? 2 : 1)) ctx.fillText(String(x), px(x) - 2 * dpr, y0 + 12 * dpr);
  }
  /* n(k)：动量分布，k = 2πm/L；半满参考线 n = 1 */
  drawProbeNk(ctx, W, H, dpr, mono){
    const L = this.state.L;
    const nk = (this.probe.nk && this.probe.nk.length === L) ? this.probe.nk : null;
    const x0 = 44 * dpr, y0 = H - 26 * dpr, w = W - 44 * dpr - 16 * dpr, h = H - 22 * dpr - 26 * dpr;
    let vMax = 1.2;
    let sum = 0;
    if (nk) for (const v of nk){ vMax = Math.max(vMax, v); sum += v; }
    vMax = Math.max(vMax * 1.12, 1.15);
    const bw = w / L;
    const py = v => y0 - (v / vMax) * h;
    this.probeHead(ctx, dpr, mono,
      `动量分布 n(k) · k = 2πm/L${nk ? ' · Σ = ' + sum.toFixed(3) + '（= N↑+N↓）' : ''}`,
      this.probesLive() ? (nk ? '' : '计算中…') : '演化中 · 暂停后更新', W);
    ctx.strokeStyle = 'rgba(120,160,220,.20)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.stroke();
    /* n=1 参考线（半满、自旋简并时的平均占据） */
    ctx.strokeStyle = 'rgba(120,160,220,.22)';
    ctx.beginPath(); ctx.moveTo(x0, py(1)); ctx.lineTo(x0 + w, py(1)); ctx.stroke();
    if (nk){
      for (let m = 0; m < L; m++){
        const v = Math.max(0, nk[m]);
        const bx = x0 + m * bw + bw * 0.18, bwd = bw * 0.64;
        /* 高于 1 的（占据多）用青色，低于 1 的（空穴）用暗青 —— 同一色相，靠明度区分 */
        ctx.fillStyle = nk[m] >= 1 ? 'rgba(103,232,249,.82)' : 'rgba(96,178,250,.55)';
        ctx.fillRect(bx, py(v), bwd, Math.max(1, y0 - py(v)));
        ctx.fillStyle = 'rgba(230,237,243,.62)'; ctx.font = mono(8.5 * dpr); ctx.textAlign = 'center';
        if (bw > 26 * dpr) ctx.fillText(v.toFixed(2), bx + bwd / 2, py(v) - 3 * dpr);
        ctx.fillStyle = 'rgba(154,167,189,.55)'; ctx.font = mono(8.5 * dpr);
        ctx.fillText(String(m), bx + bwd / 2, y0 + 12 * dpr);
      }
      ctx.textAlign = 'left';
    }
  }
  /* ⟨n_i n_j⟩：矩阵热图（对角 = ⟨n_i²⟩ = n_i + 2⟨n↑n↓⟩ > n_i） */
  drawProbeNn(ctx, W, H, dpr, mono){
    const L = this.state.L;
    const nn = (this.probe.nn && this.probe.nn.length === L * L) ? this.probe.nn : null;
    let lo = 0, hi = 1, dLo = 1, dHi = 1;
    if (nn){
      lo = Infinity; hi = -Infinity; dLo = Infinity; dHi = -Infinity;
      for (let i = 0; i < L; i++){
        for (let j = 0; j < L; j++){
          const v = nn[i * L + j];
          if (i === j){ dLo = Math.min(dLo, v); dHi = Math.max(dHi, v); }
          else { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        }
      }
    }
    const span = Math.max(1e-6, hi - lo);
    this.probeHead(ctx, dpr, mono,
      `密度关联 ⟨n_i n_j⟩${nn ? ` · 非对角 ${lo.toFixed(2)}…${hi.toFixed(2)} · 对角 ${dLo.toFixed(2)}…${dHi.toFixed(2)}（= n_i + 2⟨n↑n↓⟩）` : ''}`,
      this.probesLive() ? (nn ? '' : '计算中…') : '演化中 · 暂停后更新', W);
    const top = 22 * dpr, bot = 18 * dpr, side = 26 * dpr;
    const g = Math.min((H - top - bot) / L, (W - side - 18 * dpr) / L);
    const gx = W / 2 - (g * L) / 2, gy = top;
    if (!nn) return;
    for (let i = 0; i < L; i++){
      for (let j = 0; j < L; j++){
        /* 对角是另一个量（⟨n_i²⟩ ≈ n_i + 2⟨n↑n↓⟩），固定一档亮度免得把非对角压平 */
        const v = nn[i * L + j];
        const al = 0.10 + 0.58 * clamp((v - lo) / span, 0, 1);
        ctx.fillStyle = i === j ? 'rgba(251,191,36,.20)' : `rgba(103,232,249,${al.toFixed(3)})`;
        ctx.fillRect(gx + j * g + 0.5 * dpr, gy + i * g + 0.5 * dpr, g - 1 * dpr, g - 1 * dpr);
      }
    }
    /* 对角描边（i=j 是 ⟨n_i²⟩，比 n_i 大一倍双占） */
    ctx.strokeStyle = 'rgba(251,191,36,.55)'; ctx.lineWidth = 1 * dpr;
    for (let i = 0; i < L; i++) ctx.strokeRect(gx + i * g + 1.5 * dpr, gy + i * g + 1.5 * dpr, g - 3 * dpr, g - 3 * dpr);
    if (g > 15 * dpr){
      ctx.fillStyle = 'rgba(154,167,189,.5)'; ctx.font = mono(8 * dpr); ctx.textAlign = 'center';
      for (let i = 0; i < L; i++) ctx.fillText(String(i), gx + i * g + g / 2, H - 6 * dpr);
      ctx.textAlign = 'right';
      for (let i = 0; i < L; i++) ctx.fillText(String(i), gx - 5 * dpr, gy + i * g + g / 2 + 3 * dpr);
      ctx.textAlign = 'left';
    }
  }

  /* ---------- U/t 扫描图：一个纵轴量 vs U/t，点可点选载入 ---------- */
  drawScan(ctx, W, H, dpr, mono){
    const res = this.scanRes;
    const metric = HB_METRICS.find(m => m.k === this.scanMetric) || HB_METRICS[0];
    const Umax = Math.max(2, this.state.Umax);
    const x0 = 46 * dpr, y0 = H - 28 * dpr, w = W - 46 * dpr - 18 * dpr, h = H - 24 * dpr - 28 * dpr;
    let vmin = Infinity, vmax = -Infinity;
    for (const r of res){ const v = metric.get(r); if (Number.isFinite(v)){ vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); } }
    if (!res.length || !Number.isFinite(vmin)){ vmin = 0; vmax = 1; }
    if (vmax - vmin < 1e-9) vmax = vmin + 1;
    const padV = (vmax - vmin) * 0.14;
    vmin -= padV; vmax += padV;
    if (metric.k !== 'slope' && metric.k !== 'Ssat' && vmin > 0) vmin = 0;
    const px = U => x0 + (U / Umax) * w;
    const py = v => y0 - ((v - vmin) / (vmax - vmin)) * h;
    const sc = this.scan;
    const head = sc
      ? `U/t 扫描中 ${sc.idx}/${sc.Us.length}（${sc.phase === 'gs' ? '解基态' : '淬变演化'}）· ${metric.name}`
      : `U/t 扫描 · ${metric.name}${res.length ? ' · ' + res.length + ' 点 · ' + (this.scanMsTotal / 1000).toFixed(1) + ' s' : '（点「运行扫描」）'}`;
    this.probeHead(ctx, dpr, mono, head,
      sc ? '进度 ' + Math.round(100 * sc.idx / sc.Us.length) + '%' : (res.length ? '点图载入该 U' : ''),
      W);
    /* 轴 */
    ctx.strokeStyle = 'rgba(120,160,220,.20)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.stroke();
    ctx.fillStyle = 'rgba(154,167,189,.55)'; ctx.font = mono(8.5 * dpr);
    for (let U = 0; U <= Umax; U += (Umax > 6 ? 2 : 1)) ctx.fillText(String(U), px(U) - 2 * dpr, y0 + 12 * dpr);
    ctx.textAlign = 'right';
    ctx.fillText(vmax.toFixed(2), x0 - 5 * dpr, py(vmax) + 3 * dpr);
    ctx.fillText(vmin.toFixed(2), x0 - 5 * dpr, py(vmin) + 3 * dpr);
    ctx.textAlign = 'left';
    if (!res.length) return;
    /* 曲线 + 点 */
    ctx.strokeStyle = 'rgba(103,232,249,.9)'; ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    res.forEach((r, i) => { const X = px(r.U), Y = py(metric.get(r)); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.stroke();
    for (const r of res){
      const X = px(r.U), Y = py(metric.get(r));
      ctx.fillStyle = 'rgba(103,232,249,.95)';
      ctx.beginPath(); ctx.arc(X, Y, 2.4 * dpr, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(230,237,243,.75)'; ctx.font = mono(8.5 * dpr); ctx.textAlign = 'center';
      ctx.fillText(metric.get(r).toFixed(3), X, Y - 6 * dpr);
      ctx.fillStyle = 'rgba(154,167,189,.62)';
      ctx.fillText('U=' + r.U, X, y0 + 22 * dpr);
    }
    ctx.textAlign = 'left';
    if (this._scanHover != null){
      const i = this._scanHover;
      if (res[i]){
        const X = px(res[i].U);
        ctx.strokeStyle = 'rgba(251,191,36,.5)'; ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.beginPath(); ctx.moveTo(X, py(vmin)); ctx.lineTo(X, py(vmax)); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  /* 扫描图上的点选：取最近的 U 载入（基态模式下直接重解） */
  scanPick(x){
    if (!this.scanRes.length) return;
    const cv = this.q('#hbChart');
    const W = cv.width, dpr = W / (cv.clientWidth || W) || 1;
    const x0 = 46 * dpr, w = W - 46 * dpr - 18 * dpr;
    const Umax = Math.max(2, this.state.Umax);
    const U = clamp(((x - x0) / w) * Umax, 0, Umax);
    let best = null, bd = Infinity;
    for (const r of this.scanRes){
      const d = Math.abs(r.U - U);
      if (d < bd){ bd = d; best = r; }
    }
    if (!best) return;
    this.state.U = best.U;
    this.q('#rU').value = String(best.U);
    this.q('#oU').textContent = best.U.toFixed(2);
    this.q('#hU').textContent = best.U.toFixed(2);
    if (this.state.mode === 'gs') this.startSolve(); else this.measureAll(true);
    this.toast(`载入 U/t = ${best.U.toFixed(1)}`, 1200);
    this.syncPanel(); this.draw();
  }

  /* ---------- 帧循环 ---------- */
  frame(){
    requestAnimationFrame(this.frame);
    if (this._dead) return;
    try { this.frameBody(); this.clearError(); }
    catch (e){
      this._errCount = (this._errCount || 0) + 1;
      this.reportError(e);
      /* 连续出错就停下：否则每帧都清一次画布 ⟹ 用户只看到一块黑 */
      if (this._errCount > 3) this._dead = true;
    }
  }
  /* 连续几帧恢复正常就把横幅收掉（一次性的坏帧不该留个红条） */
  clearError(){
    if (this._title0 === undefined) this._title0 = document.title;
    if (!this._errCount) return;
    this._errCount--;
    if (this._errCount > 0) return;
    const box = this.q('#hbErr'); if (box){ box.style.display = 'none'; box.textContent = ''; }
    if (this._title0 !== undefined) document.title = this._title0;
  }
  reportError(e){
    const msg = (e && (e.stack || e.message)) || String(e);
    console.error('[hubbard]', e);
    const d = this.q('#hbDiag'); if (d) d.textContent = 'ERR ' + msg;
    document.title = 'ERR ' + (e && e.message ? e.message : e);
    const box = this.q('#hbErr');
    if (box){
      box.textContent = '页面出错（已停止重绘，避免整屏变黑）：' + (e && e.message ? e.message : e) +
        '  —— 详细堆栈见控制台 / document.title';
      box.style.display = 'block';
    }
  }
  frameBody(){
    this._fpsFrames++;
    const now = performance.now();
    if (now - this._lastFpsT > 500){
      this._fps = Math.round(this._fpsFrames * 1000 / (now - this._lastFpsT));
      this._fpsFrames = 0; this._lastFpsT = now;
      const f = this.q('#hFps'); if (f) f.textContent = String(this._fps);
    }
    this.advanceJobs();
    if (this.sxJob) this.stepSx();
    if (this.scan) this.stepScan();
    if (this.state.mode === 'evo' && !this.state.paused && !this.job && this.re){
      this.applyProtocol();
      this.evolveFrame();
    }
    if (this.state.mode === 'evo' && !this.state.paused && !this.job && this.state.frames % 2 === 0) this.measureAll(false);
    this.draw();
    if (this.job){ const s = this.q('#hbStat'); if (s) s.textContent = this.msg; }
  }

  syncHudExtra(){
    const set = (id, v) => { const el = this.q('#' + id); if (el) el.textContent = v; };
    set('hRes', this.residual == null ? '—' : this.residual.toExponential(1));
    set('hM', this.gsM ? `${this.gsM}${this.gsMCapped ? '（内存上限）' : ''}` : '—');
    const bits = [];
    if (this.proto) bits.push(HB_PROTOCOLS[this.proto.kind].name);
    if (this.scan) bits.push(`扫描 ${this.scan.idx}/${this.scan.Us.length}`);
    else if (this.scanRes.length) bits.push(`扫描 ${this.scanRes.length} 点`);
    if (this.cps.length) bits.push(`${this.cps.length} 检查点`);
    set('hProto', bits.length ? bits.join(' · ') : '—');
  }

  syncPanel(){
    this.container.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === this.state.preset));
    this.container.querySelectorAll('[data-L]').forEach(b =>
      b.classList.toggle('on', parseInt(b.getAttribute('data-L'), 10) === this.state.L));
    this.container.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === this.state.tool));
    this.container.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === this.state.view));
    const gs = this.state.mode === 'gs';
    this.q('#hbModeGs').classList.toggle('on', gs);
    this.q('#hbModeEvo').classList.toggle('on', !gs);
    this.q('#hbMuNeg').classList.toggle('on', this.state.muSign < 0);
    this.q('#hbMuPos').classList.toggle('on', this.state.muSign > 0);
    this.q('#rU').value = this.state.U; this.q('#oU').textContent = this.state.U.toFixed(2);
    this.q('#hU').textContent = this.state.U.toFixed(2);
    this.q('#rMu').value = this.state.muDepth; this.q('#oMu').textContent = this.state.muDepth.toFixed(2);
    const n = this.fieldSites();
    this.q('#hbFieldInfo').textContent = n ? `${n} 格 · Σ|μ|=${this.state.mu.reduce((a, v) => a + Math.abs(v), 0).toFixed(1)}` : '无（点「势笔刷」在链上涂）';
    this.q('#hMode').textContent = gs ? '基态（H 变即重解）' : '演化';
    const pr = HB_PRESETS[this.state.preset];
    this.q('#hbHint').querySelector('b').textContent = pr.name;
    this.q('#hbHint').querySelector('span').innerHTML = pr.text;
    this.q('#hbPause').textContent = this.state.paused ? '继续' : '暂停';
    this.q('#hbPause').style.opacity = gs ? 0.45 : 1;
    const st = this.q('#hbStage'); if (st) st.dataset.tool = this.state.tool;
    this.container.querySelectorAll('[data-proto]').forEach(b =>
      b.classList.toggle('on', !!this.proto && this.proto.kind === b.dataset.proto));
    this.container.querySelectorAll('[data-metric]').forEach(b =>
      b.classList.toggle('on', b.dataset.metric === this.scanMetric));
    const sr = this.q('#hbScanRun');
    if (sr) sr.textContent = this.scan ? '扫描中…' : '运行扫描';
    this.syncProtoInfo();
    this.syncScrub();
    this.syncHudExtra();
  }

  /* ---------- 状态序列化 / URL / 导出 ---------- */
  serialize(){
    return {
      v: 1,
      preset: this.state.preset,
      mode: this.state.mode,
      L: this.state.L,
      U: this.state.U,
      tool: this.state.tool,
      muDepth: this.state.muDepth,
      muSign: this.state.muSign,
      mu: Array.from(this.state.mu, v => +v.toFixed(4)),
      pat: Array.from(this.state.pat),
      t: +this.state.t.toFixed(4),
      paused: !!this.state.paused,
      view: this.state.view,
      Umax: this.state.Umax,
    };
  }
  queryFor(spec){
    const qs = new URLSearchParams();
    qs.set('preset', spec.preset); qs.set('L', String(spec.L)); qs.set('U', String(spec.U));
    qs.set('mode', spec.mode);
    qs.set('pat', spec.pat.join(''));
    if (spec.mu.some(v => v !== 0)) qs.set('mu', spec.mu.map(v => String(+v.toFixed(3))).join(','));
    if (spec.view && spec.view !== 'Sx') qs.set('view', spec.view);
    return qs.toString();
  }
  queueUrl(){
    clearTimeout(this._urlTimer);
    this._urlTimer = setTimeout(() => this.syncUrl(), 420);
  }
  syncUrl(){
    try {
      const qs = this.queryFor(this.serialize());
      /* 用相对查询串：noise 少（jsdom 对「路径级」replaceState 会报 navigation 未实现） */
      history.replaceState(null, '', '?' + qs);
    } catch (_){ /* file:// 下 replaceState 可能被拒，忽略 */ }
  }
  readUrlSpec(q){
    const L = Math.round(parseFloat(q.get('L') || '0'));
    const muS = q.get('mu'), patS = q.get('pat');
    if (!muS && !patS && !q.get('mode')) return null;
    const len = [8, 10].includes(L) ? L : 8;
    const spec = { L: len };
    if (muS){
      const arr = muS.split(',').map(Number);
      if (arr.length === len && arr.every(Number.isFinite)) spec.mu = arr;
    }
    if (patS && patS.length === len && /^[0-3]+$/.test(patS)) spec.pat = Array.from(patS, c => +c);
    if (q.get('mode') === 'evo' || q.get('mode') === 'gs') spec.mode = q.get('mode');
    const vq = q.get('view');
    if (vq && HB_VIEWS.some(v => v.k === vq)) spec.view = vq;
    return (spec.mu || spec.pat || spec.mode || spec.view) ? spec : null;
  }
  /* 校验后再应用：任一非法字段整体拒绝（不半改状态） */
  applySpec(spec, opts = {}){
    if (!spec || typeof spec !== 'object') return false;
    const L = [8, 10].includes(spec.L | 0) ? (spec.L | 0) : this.state.L;
    const mu = Array.isArray(spec.mu) && spec.mu.length === L && spec.mu.every(v => Number.isFinite(v))
      ? Float64Array.from(spec.mu, v => clamp(v, -MU_VIEW, MU_VIEW)) : null;
    const pat = Array.isArray(spec.pat) && spec.pat.length === L && spec.pat.every(v => Number.isInteger(v) && v >= 0 && v <= 3)
      ? Int8Array.from(spec.pat) : null;
    const mode = spec.mode === 'evo' || spec.mode === 'gs' ? spec.mode : null;
    const view = HB_VIEWS.some(v => v.k === spec.view) ? spec.view : null;
    if (!mu && !pat && !mode && !view && !opts.fromUrl) return false;
    if (view) this.state.view = view;
    if (L !== this.state.L){
      this.state.L = L;
      this.state.mu = new Float64Array(L);
      this.state.pat = neelPattern(L);
      this.rebuildSector(L / 2, L / 2);
    }
    if (mu) this.state.mu = mu;
    if (pat) this.state.pat = pat;
    let up = 0, dn = 0;
    for (let i = 0; i < L; i++){ if (this.state.pat[i] & 1) up++; if (this.state.pat[i] & 2) dn++; }
    if (up !== this.state.nUp || dn !== this.state.nDn) this.rebuildSector(up, dn);
    hbSetField(this.sec, this.hasField() ? this.state.mu : null);
    const md = (mode === 'evo' && this.staticTier()) ? 'gs' : (mode || this.state.mode);
    if (md === 'gs'){
      this.state.mode = 'gs';
      this.startSolve();
    } else {
      this.state.mode = 'evo';
      const w = hbProductFromPattern(this.sec, this.state.pat);
      this.re = w.re; this.im = w.im;
      this.state.t = 0; this.state.frames = 0; this.hist = [];
      this.state.paused = spec.paused === true;
      this.job = null;
      this.measureAll(true);
    }
    this.syncPanel(); this.draw();
    return true;
  }
  copyLink(){
    this.syncUrl();
    const url = location.href;
    const done = () => this.toast('链接已复制（含场与初态）', 1400);
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(done, () => this.toast(url, 4000));
    } else this.toast(url, 4000);
  }
  exportJson(){
    const spec = this.serialize();
    /* 观测数据一并在导出里（L=10 需 ~0.75s；导出是显式动作，值得等） */
    const pr = this.re ? this.probeAll() : null;   /* 求解在飞/扇区不匹配时返回 null */
    if (pr){
      const L = this.state.L;
      spec.obs = {
        S: +this.S.toFixed(9),
        Sx: Array.from(pr.sx, v => (Number.isFinite(v) ? +v.toFixed(9) : null)),
        nk: Array.from(pr.nk, v => +v.toFixed(9)),
        nn: Array.from(pr.nn, v => +v.toFixed(9)),
        nkSum: +Array.from(pr.nk).reduce((a, b) => a + b, 0).toFixed(9),
        L,
      };
    }
    const txt = JSON.stringify(spec, null, 1);
    try {
      const blob = new Blob([txt], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hubbard-L' + spec.L + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      this.toast('已导出 hubbard-L' + spec.L + '.json', 1400);
    } catch (_){ this.toast(txt.slice(0, 120), 3000); }
    return txt;
  }

  /* ---------- 调试句柄（cdp139） ---------- */
  debugHandle(){
    return {
      app: this, state: this.state,
      measures: () => ({
        dim: this.sec.dim, E: this.E, D: this.m ? this.m.Dtot : null, S: this.S,
        norm: this.re ? hbNorm(this.re, this.im) : null, t: this.state.t, frames: this.state.frames,
        U: this.state.U, L: this.state.L, gap: this.gap, slope: this.slope ?? null,
        nT: this.m ? Array.from(this.m.nT) : null,
        nU: this.m ? Array.from(this.m.nU) : null,
        nD: this.m ? Array.from(this.m.nD) : null,
        dbl: this.m ? Array.from(this.m.dbl) : null,
        fieldE: this.fieldE ?? null,
        mode: this.state.mode, nUp: this.state.nUp, nDn: this.state.nDn,
        busy: !!this.job || !!this.gapJob,
      }),
      entropy: () => (this.re ? hbEntropy(this.sec, this.re, this.im) : null),
      step: (n = 1) => this.stepFrames(n),
      setU: u => {
        this.state.U = u; this.q('#rU').value = u;
        this.q('#oU').textContent = u.toFixed(2); this.q('#hU').textContent = u.toFixed(2);
        this.afterHChange('U');
      },
      setL: L => this.setL(L),
      preset: k => this.setPreset(k),
      solveNow: () => {
        /* 「现在就把基态解到底」：停掉 debounce、切 gs、必要时新开任务 */
        if (this._solveTimer){ clearTimeout(this._solveTimer); this._solveTimer = null; }
        if (!this.job){ this.state.mode = 'gs'; this.startSolve(); }
        if (!this.job) return this.E;
        while (!this.job.task.done) this.job.task.step(20);
        this.re = this.job.task.re; this.im = this.job.task.im;
        this.job = null; this.measureAll(true); this.state.paused = false;
        return this.E;
      },
      gapNow: () => {
        if (this.gap !== null) return this.gap;
        this.startGap();
        while (this.gapJob) this.advanceJobs();
        return this.gap;
      },
      history: () => this.hist.slice(-600),
      bond: () => (this.bsig ? Array.from(this.bsig) : null),
      /* ---- 沙盒接口 ---- */
      clickSite: (i, right) => this.toggleSite(i, right ? -1 : 1),
      paint: (i, sign) => this.paintSite(i, sign),
      setTool: k => this.setTool(k),
      tool: () => this.state.tool,
      mu: () => Array.from(this.state.mu),
      pat: () => Array.from(this.state.pat),
      mode: () => this.state.mode,
      fieldSites: () => this.fieldSites(),
      setMuDepth: d => this.setMuDepth(d),
      setMuSign: s => this.setMuSign(s),
      clearField: () => this.clearField(false),
      setMode: m => this.applyMode(m),
      resetPattern: () => this.resetPattern(),
      setField: arr => { this.state.mu = Float64Array.from(arr); this.applyField(); },
      spec: () => this.serialize(),
      applySpec: s => this.applySpec(s),
      query: () => this.queryFor(this.serialize()),
      siteAtX: x => this.siteAtX(x),
      view: () => ({ ...this._view }),
      /* ---- Phase-3：协议 / 时间轴 / 扫描 ---- */
      startProtocol: k => this.startProtocol(k),
      stopProtocol: r => this.stopProtocol(r),
      proto: () => (this.proto ? { kind: this.proto.kind, T: this.proto.T, f: clamp((this.state.t - this.protoStart) / this.proto.T, 0, 1) } : null),
      checkpoints: () => this.cps.map(c => ({ t: c.t, S: c.S, D: c.D })),
      scrubTo: i => this.scrubTo(i),
      scrubIdx: () => this.scrubIdx,
      /* 确定性帧推进（测试用）：与 frame() 同一顺序（协议 → 演化 → 测量） */
      tick: (n = 1) => {
        for (let i = 0; i < n; i++){
          if (this.state.mode === 'evo' && !this.state.paused && this.re){ this.applyProtocol(); this.evolveFrame(); }
        }
        this.measureAll(true); this.draw();
        return this.state.t;
      },
      scanStart: () => this.startScan(),
      scanStep: () => { const n0 = this.scanRes.length; this.stepScan(); return this.scanRes.length - n0; },
      scanState: () => ({
        running: !!this.scan, progress: this.scan ? { ...this.scan.progress } : null,
        metric: this.scanMetric, ms: this.scanMsTotal,
        rows: this.scanRes.map(r => ({
          U: r.U, Ssat: r.Ssat, slope: r.slope, Sgs: r.Sgs, Dgs: r.Dgs, Egs: r.Egs,
          m: r.m, res: r.res, D: r.D, curve: r.curve,
        })),
      }),
      setMetric: k => { if (HB_METRICS.some(m => m.k === k)){ this.scanMetric = k; this.syncPanel(); this.draw(); } },
      scanPick: x => this.scanPick(x),
      staticTier: () => this.staticTier(),
      residual: () => this.residual,
      /* ---- Phase-2 观测量（cdp141 用） ---- */
      setView: k => this.setView(k),
      activeView: () => this.state.view,
      probeNow: () => { const p = this.probeAll(); return { sx: Array.from(p.sx), nk: Array.from(p.nk), nn: Array.from(p.nn) }; },
      probeState: () => ({
        view: this.state.view, live: this.probesLive(), busy: !!this.sxJob,
        progress: this.sxJob ? [this.sxJob.k, this.sxJob.order.length] : null,
        sxMs: this.sxMs,
        sx: this.probe.sxL === this.state.L && this.probe.sx ? Array.from(this.probe.sx) : null,
        nk: this.probe.nk ? Array.from(this.probe.nk) : null,
        nn: this.probe.nn ? Array.from(this.probe.nn) : null,
        dirty: { ...this._dirty },
      }),
      exportJson: () => this.exportJson(),
    };
  }
}
