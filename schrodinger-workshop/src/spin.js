/* ============================================================================
 * spin.js（页面）— 海森堡自旋链沙盒：XXZ 各向异性 / 场 / 淬变 / 临界纠缠
 *
 * 纯 CPU、纯 2D canvas。态是固定 Sᶻ 扇区上的复向量（基 = C(L,nUp) 个位掩码），
 * 画面上只有「自旋本身」：每格一支箭头（长度 ∝ |⟨S^z_i⟩|、颜色分 ↑/↓），
 * 下面一条键关联带（⟨S_i·S_{i+1}⟩，反铁磁为负），再下面是被笔刷写过的局域场。
 *
 * 【三种玩法】
 *   1. 初态工具：点格点把该格自旋翻过来（右键反向）。扇区跟着 nUp 重建。
 *   2. 场笔刷：横拖给每格写 bz_i（左键 = +b 偏向 ↑、右键 = −b 偏向 ↓）。
 *   3. 擦除：把该格 bz_i 清零。
 *
 * 【两种模式】gs = 解基态（Δ/h/L/bz 一改就重解，去抖）；evo = 从当前初态按
 * exp(−iHt) 演化（改 H 立即生效、不重置 t）。
 *
 * 【四个图表视图】S(x) 纠缠剖面 / S(q) 结构因子 / ⟨S^z_iS^z_j⟩ 关联矩阵 / S(t) 熵-时间。
 *
 * 调试句柄 window.__sp（cdp145 用）：measures/entropy/step/setDelta/setH/setL/solveNow/
 * history/pat/flip/setTool/paint/view/pickAt/spec/applySpec —— 全部确定性接口。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { injectResponsive } from './core/responsive.js';
import { navHtml } from './core/nav.js';
/* 3D 透视视图复用哈伯德页的相机/投影/拾取（纯数学模块，pot143 已逐条对账） */
import { hbProject, hbSitePositions, hbPick, hbOrbit, hbZoom, hbCamDefault, hbDepthRange } from './hubbard3d.js';
import { symEigVals } from './physics/hubbard.js';
import { spSector, spProduct, spNeel, spMeasure, spEnergy, spResidual, spNorm, spKrylovExp, spEntropy, spEntropyAt, spEntropyProfile, spStructureFactor, spComposeField, spNormalizeFieldObjects, SP_FIELD_SHAPES, SpGsTask, SP_PRESETS } from './physics/spin.js';

/* 局域场的满量程（|b| 到 4 就是满格高） */
const B_VIEW = 4;
const SP_TOOLS = [
  { k: 'state', name: '初态', tip: '点击格点翻转该格自旋（右键反向）' },
  { k: 'field', name: '场笔刷', tip: '拖动涂自由手绘局域场：左键 = +b（偏 ↑），右键 = −b（偏 ↓）' },
  { k: 'erase', name: '擦除', tip: '点击清除该格的自由手绘局域场' },
  { k: 'object', name: '场对象', tip: '点击空格放置可移动的局域场源；拖动对象锚点移动，右键删除' },
];
const SP_PROJ = [
  { k: '2d', name: '2D', tip: '平面阶梯：箭头 + 键关联带 + 局域场带' },
  { k: '3d', name: '3D', tip: '透视：链沿 x、自旋沿 ±y、局域场 b_i 沿 ∓z 刺出平面（拖空白转视角）' },
];
const SP_VIEWS = [
  { k: 'Sx', name: 'S(x)', tip: '纠缠剖面：以切点 x 分开时左半的熵' },
  { k: 'Sq', name: 'S(q)', tip: '静态结构因子：S(q=π) 高 = 反铁磁序' },
  { k: 'zz', name: '⟨Sᶻ Sᶻ⟩', tip: '自旋关联矩阵（ρ_ij = ⟨S^z_iS^z_j⟩）' },
  { k: 'St', name: 'S(t)', tip: '半链纠缠熵随时间（基态下退化为标尺）' },
];

/* ---------------------------------- CSS ---------------------------------- */
const SP_CSS = `
#spTop{display:flex;justify-content:space-between;align-items:baseline;gap:14px}
#spTop .eq{font-family:var(--mono);font-size:11px;color:var(--dim)}
#spStage{position:relative}
#spStage canvas{display:block;width:100%;border:0;border-radius:10px;background:rgba(6,11,20,.55);
  box-shadow:inset 0 0 0 1px rgba(120,160,220,.12)}  /* 边框用 inset 阴影：不占盒模型，位图 = CSS 盒 */
#spLadder{margin-bottom:8px}
#spPanel .grid2,#spPanel .grid3,#spPanel .grid4{display:grid;gap:5px}
#spPanel .grid2{grid-template-columns:repeat(2,1fr)}
#spPanel .grid3{grid-template-columns:repeat(3,1fr)}
#spPanel .grid4{grid-template-columns:repeat(4,1fr)}
#spPanel .grid2 button,#spPanel .grid3 button,#spPanel .grid4 button{padding:6px 2px;font-size:10.5px}
#spPanel .sec{margin-bottom:9px}
#spPanel .sec h3{font-size:10.5px;letter-spacing:.14em;color:var(--dim);margin:0 0 5px;font-weight:500}
#spPanel .row{display:flex;align-items:center;gap:6px;margin:4px 0;font-size:10.5px;color:var(--dim)}
#spPanel .row input[type=range]{flex:1;min-width:0}
#spPanel .row output{font-family:var(--mono);color:var(--cyan);min-width:34px;text-align:right}
#spPanel button.on{background:rgba(103,232,249,.14);border-color:rgba(103,232,249,.55);color:#d7fbff}
#spHud .hrow{display:flex;justify-content:space-between;gap:8px;font-size:10.5px;line-height:1.7}
#spHud .hrow span:first-child{color:var(--dim)}
#spHud .hrow span:last-child{font-family:var(--mono);color:var(--cyan)}
#spHint{font-size:10.5px;line-height:1.6;color:var(--dim)}
#spHint b{color:var(--amber);font-weight:500}
#spToast{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;pointer-events:none;
  padding:8px 16px;border-radius:9px;background:rgba(8,14,24,.94);border:1px solid rgba(103,232,249,.35);
  font-family:var(--mono);font-size:13px;color:var(--cyan);letter-spacing:.16em;opacity:0;transition:opacity .4s;
  text-shadow:0 0 18px rgba(103,232,249,.8);text-align:center;white-space:pre-line}
#spDiag{position:fixed;left:-9999px}
#spErr{display:none;position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:30;max-width:min(90vw,760px);
  padding:9px 14px;border-radius:8px;border:1px solid rgba(251,113,133,.5);background:rgba(60,10,18,.92);
  color:#fecdd3;font:11.5px/1.5 var(--mono);white-space:pre-wrap}
`;
const SP_LAYOUT = `
/* 舞台宽度 = 可用宽度（两侧面板各 246 / 214 px 已让出），窄窗也不会钻到面板底下 */
#spStage{position:fixed;left:50%;top:53%;transform:translate(-50%,-50%);z-index:5;
  display:flex;flex-direction:column;gap:6px;width:var(--sp-w,min(56vw,760px))}
#spPanel{top:74px;left:14px;width:232px;padding:13px;z-index:10;max-height:calc(100vh - 190px);
  overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
#spHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:196px;font-family:var(--mono);
  max-height:calc(100vh - 190px);overflow-y:auto}
#spHint{left:50%;transform:translateX(-50%);bottom:10px;width:min(92vw,640px);max-height:74px;
  overflow-y:auto;z-index:10;padding:8px 12px}
#spStage canvas{width:100%}
/* 窄屏开关（只在 861–1200px 出现）：这一刻度带里三栏排不下，就不要硬排——
   舞台独占整幅宽度，控制面板/读数改成**可开合的底部 sheet**（默认收起）。 */
.sp-band{display:none}
/* 861–1200px：屏幕放不下「232 面板 + 画布 + 196 读数」三栏。此前是把舞台压到
   calc(100vw−520px)（900px 窗口只剩 380px 画布），看起来就是「全部挤在一行」。
   现在：舞台占满（两侧各留 20px、上限 760px），面板/读数浮在底部、点开关才出来。 */
@media (min-width:861px) and (max-width:1200px){
  #spStage{width:min(calc(100vw - 40px),760px)}
  #spPanel,#spHud{display:none;position:fixed;left:6px;right:6px;width:auto;top:auto;bottom:52px;
    max-height:58vh;z-index:13;overflow-y:auto}
  #spPanel.open,#spHud.open{display:block}
  .sp-band{display:inline-flex;align-items:center}
  #spViews{justify-content:flex-start}
}
@media (max-width:1100px){#spHint{display:none}}
/* ≤860px：core/responsive.js 用内联样式把 #spStage / .qpanel / .qhud 变底部 sheet
   （内联 position:fixed;left:6px;right:6px 覆盖上表规则），dock 三态靠 qpanel/qhud 类
   隐藏/显示——所以画布宽度必须走 100%（不能是 vw 计算值，否则手机上算出负数）。 */
`;
const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class SpinApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const L = Math.round(num('L', 12));
    this.state = {
      preset: SP_PRESETS[q.get('preset')] ? q.get('preset') : 'xxx',
      L: [8, 10, 12, 14, 16].includes(L) ? L : 12,
      delta: clamp(num('D', 1), 0, 4),
      h: clamp(num('h', 0), 0, 4),
      mode: q.get('mode') === 'evo' ? 'evo' : 'gs',
      tool: SP_TOOLS.some(t => t.k === q.get('tool')) ? q.get('tool') : 'state',
      view: SP_VIEWS.some(v => v.k === q.get('view')) ? q.get('view') : 'Sx',
      proj: q.get('proj') === '3d' ? '3d' : '2d',
      nUp: 0, spins: null, bz: null, fieldBase: null, fieldObjects: [], selectedFieldObject: null,
      objectShape: 'gaussian', objectAmp: 1.5, objectWidth: 1.5,
      t: 0, frames: 0, paused: q.get('paused') === '1',
      dt: num('dt', 0.04), spf: Math.round(num('spf', 2)),
      brush: clamp(num('br', 1.5), 0, B_VIEW),
    };
    this.sec = null; this.re = null; this.im = null;
    this.cam = hbCamDefault(); this._sites3 = null; this._orbit = null;
    /* 相机也能从 URL 读：非法值退回默认（相机只是视图参数，不必整份拒绝） */
    const camQ = q.get('cam');
    if (camQ){
      const arr = camQ.split(',').map(Number);
      if (arr.length === 3 && arr.every(Number.isFinite)){
        this.cam = { yaw: arr[0], pitch: clamp(arr[1], -1.33, 1.33), dist: clamp(arr[2], 3.2, 20) };
      }
    }
    this.E = NaN; this.residual = null; this.m = null; this.S = NaN; this.Sq = null;
    this.hist = []; this.job = null; this.msg = '';
    this._hover = -1; this._paint = null; this._view = null;
    this._nextFieldObjectId = 1;
    this._sxProf = null; this._sxJob = null; this._sxPending = null;
    this._listeners = []; this._fps = 0; this._fpsFrames = 0; this._lastFpsT = performance.now();
    this._errCount = 0; this._dead = false; this._title0 = undefined;
    this._onError = e => { const d = this.q('#spDiag'); if (d) d.textContent = 'ERR ' + e.message; };
    window.addEventListener('error', this._onError);
    this.frame = this.frame.bind(this);
  }

  q(s){ return this.container.querySelector(s); }
  on(t, type, fn, opts){ if (!t) return; t.addEventListener(type, fn, opts); this._listeners.push([t, type, fn, opts]); }
  toast(m, ms = 2000){
    const el = this.q('#spToast'); if (!el) return;
    el.textContent = m; el.style.opacity = 1;
    clearTimeout(this._tt); this._tt = setTimeout(() => { el.style.opacity = 0; }, ms);
  }

  mount(){
    injectStyles();
    injectResponsive();
    const st = document.createElement('style');
    st.id = 'sp-styles'; st.textContent = SP_CSS + SP_LAYOUT;
    document.head.appendChild(st);
    this.buildDOM();
    this.bindUI();
    this.layoutSize();
    this.initPreset();
    if (this._spec) this.applySpec(this._spec, { fromUrl: true });
    /* 布局随时可能变（字体加载完、刻度带内联宽度生效、预览面板拖拽）：尺寸自检
       在 draw() 里兜底，另外用 ResizeObserver 主动触发一次重排。 */
    if (typeof ResizeObserver !== 'undefined' && this.q('#spStage')){
      try {
        this._ro = new ResizeObserver(() => { this.layoutSize(); this.draw(); });
        this._ro.observe(this.q('#spStage'));
      } catch (_){ this._ro = null; }
    }
    /* 兜底：没有 ResizeObserver 的环境（老浏览器/jsdom）靠 window.resize 重排 */
    this._onWinResize = () => { this.layoutSize(); };
    window.addEventListener('resize', this._onWinResize);
    requestAnimationFrame(this.frame);
    window.__sp = this.debugHandle();
    return this;
  }

  buildDOM(){
    const P = SP_PRESETS;
    this.container.innerHTML = `
<div id="spTop" class="panel qtop">
  <div><h1>自旋链工场</h1>
    <div class="eq">H = Σ<sub>i</sub> J [ S<sup>x</sup><sub>i</sub>S<sup>x</sup><sub>i+1</sub> + S<sup>y</sup><sub>i</sub>S<sup>y</sup><sub>i+1</sub> + Δ S<sup>z</sup><sub>i</sub>S<sup>z</sup><sub>i+1</sub> ] − Σ<sub>i</sub> b<sub>i</sub> S<sup>z</sup><sub>i</sub></div></div>
  <nav>${navHtml('./spin.html')}</nav>
</div>

<div id="spPanel" class="panel qpanel">
  <div class="sec"><h3>预设</h3><div class="grid2">
    ${Object.keys(P).map(k => `<button data-preset="${k}" title="${P[k].text}">${P[k].name}</button>`).join('')}
  </div></div>
  <div class="sec"><h3>模式</h3><div class="grid2">
    <button id="spModeGs">解基态</button><button id="spModeEvo">从初态演化</button>
  </div></div>
  <div class="sec"><h3>工具</h3><div class="grid4">
    ${SP_TOOLS.map(t => `<button data-tool="${t.k}" title="${t.tip}">${t.name}</button>`).join('')}
  </div></div>
  <div class="sec" id="spObjectPanel"><h3>场对象 · <span id="spObjCount">0</span></h3>
    <div class="grid3" id="spObjShapes">${SP_FIELD_SHAPES.map((s,i) => `<button data-object-shape="${s}" title="${['连续高斯局域场','有限宽度盒形场','交错正负场'][i]}">${['高斯','盒形','交错'][i]}</button>`).join('')}</div>
    <div class="row"><label>振幅</label><input type="range" id="rObjAmp" min="-4" max="4" step="0.1" value="${this.state.objectAmp}"><output id="oObjAmp">${this.state.objectAmp.toFixed(1)}</output></div>
    <div class="row"><label>宽度 w（格）</label><input type="range" id="rObjWidth" min="0.5" max="8" step="0.5" value="${this.state.objectWidth}"><output id="oObjWidth">${this.state.objectWidth.toFixed(1)}</output></div>
    <div class="grid3"><button id="spObjPlace" class="sm">放置</button><button id="spObjDup" class="sm">复制</button><button id="spObjDelete" class="sm">删除</button></div>
    <div id="spObjStatus" style="font-size:10px;color:var(--dim);margin-top:4px">选形状后点「放置」，再点链上空位；拖对象标记可移动。</div>
  </div>
  <div class="sec"><h3>参数</h3>
    <div class="row"><label>Δ（各向异性）</label><input type="range" id="rDelta" min="0" max="4" step="0.05" value="${this.state.delta}"><output id="oDelta">${this.state.delta.toFixed(2)}</output></div>
    <div class="row"><label>h（均匀场）</label><input type="range" id="rH" min="0" max="4" step="0.05" value="${this.state.h}"><output id="oH">${this.state.h.toFixed(2)}</output></div>
    <div class="row"><label>|b| 笔刷</label><input type="range" id="rBrush" min="0" max="${B_VIEW}" step="0.25" value="${this.state.brush}"><output id="oBrush">${this.state.brush.toFixed(2)}</output></div>
    <div class="row"><button id="spClearField" class="sm">清空局域场</button></div>
  </div>
  <div class="sec"><h3>链长</h3><div class="grid3">
    ${[8, 10, 12, 14, 16].map(L => `<button data-len="${L}"${L === 16 ? ' class="sm"' : ''}>L = ${L}</button>`).join('')}
  </div></div>
  <div class="sec"><h3>操作</h3><div class="grid2">
    <button id="spPause">暂停</button><button id="spStep">单步</button>
    <button id="spReset" class="sm">重置</button><button id="spLink" class="sm">复制链接</button>
    <button id="spSave" class="sm">导出 JSON</button><button id="spLoad" class="sm">导入 JSON</button>
    <button id="spGap" class="sm">算能隙</button>
    <input id="spLoadFile" type="file" accept="application/json,.json" style="display:none">
  </div></div>
</div>

<div id="spStage" class="qstage" data-tool="${this.state.tool}">
  <canvas id="spLadder"></canvas>
  <div id="spViews" style="display:flex;gap:4px;margin:2px 0 6px;align-items:center">
    <button class="sp-band" id="spDrawerPanel" title="展开/收起控制面板（窄屏）">⚙ 控制</button>
    <button class="sp-band" id="spDrawerHud" title="展开/收起读数（窄屏）">◫ 读数</button>
    <span class="sp-band" style="flex:1"></span>
    ${SP_VIEWS.map(v => `<button data-view="${v.k}" title="${v.tip}">${v.name}</button>`).join('')}
    <span style="width:10px"></span>
    ${SP_PROJ.map(v => `<button data-proj="${v.k}" title="${v.tip}">${v.name}</button>`).join('')}
  </div>
  <canvas id="spChart"></canvas>
</div>

<div id="spHud" class="panel qhud">
  <div class="hrow"><span>模式</span><span id="hMode">—</span></div>
  <div class="hrow"><span>扇区 / 维数</span><span id="hDim">—</span></div>
  <div class="hrow"><span>E</span><span id="hE">—</span></div>
  <div class="hrow"><span>E/N</span><span id="hEN">—</span></div>
  <div class="hrow"><span>能隙 ΔE</span><span id="hGap">—</span></div>
  <div class="hrow"><span>半链熵 S</span><span id="hS">—</span></div>
  <div class="hrow"><span>⟨S²⟩</span><span id="hS2">—</span></div>
  <div class="hrow"><span>Sᶻ / N↑</span><span id="hSz">—</span></div>
  <div class="hrow"><span>t / 帧</span><span id="hT">—</span></div>
  <div class="hrow"><span>残差</span><span id="hRes">—</span></div>
  <div class="hrow"><span>Lanczos m</span><span id="hM">—</span></div>
  <div class="hrow"><span>fps</span><span id="hFps">—</span></div>
</div>
<div id="spHint" class="panel qhint"><b></b><span></span></div>
<div id="spToast"></div>
<div id="spDiag"></div>
<div id="spErr"></div>`;

    this.container.querySelectorAll('[data-preset]').forEach(b =>
      this.on(b, 'click', () => this.setPreset(b.dataset.preset)));
    /* 属性名进 DOM 一律小写：读 data-len 只用 getAttribute / dataset.len（见 R142 教训） */
    this.container.querySelectorAll('[data-len]').forEach(b =>
      this.on(b, 'click', () => this.setL(parseInt(b.getAttribute('data-len'), 10))));
    this.container.querySelectorAll('button[data-tool]').forEach(b =>
      this.on(b, 'click', () => this.setTool(b.dataset.tool)));
    this.container.querySelectorAll('[data-view]').forEach(b =>
      this.on(b, 'click', () => this.setView(b.dataset.view)));
    this._spec = this.readUrlSpec(new URLSearchParams(location.search));
  }

  bindUI(){
    this.on(this.q('#rDelta'), 'input', () => {
      this.state.delta = parseFloat(this.q('#rDelta').value);
      this.q('#oDelta').textContent = this.state.delta.toFixed(2);
      this.afterHChange('delta');
    });
    this.on(this.q('#rH'), 'input', () => {
      this.state.h = parseFloat(this.q('#rH').value);
      this.q('#oH').textContent = this.state.h.toFixed(2);
      this.afterHChange('h');
    });
    this.on(this.q('#rBrush'), 'input', () => {
      this.state.brush = parseFloat(this.q('#rBrush').value);
      this.q('#oBrush').textContent = this.state.brush.toFixed(2);
    });
    this.on(this.q('#spClearField'), 'click', () => this.clearField(true));
    this.container.querySelectorAll('[data-object-shape]').forEach(b => this.on(b, 'click', () => this.setObjectShape(b.dataset.objectShape)));
    this.on(this.q('#rObjAmp'), 'input', () => this.setObjectProperty('amp', parseFloat(this.q('#rObjAmp').value)));
    this.on(this.q('#rObjWidth'), 'input', () => this.setObjectProperty('width', parseFloat(this.q('#rObjWidth').value)));
    this.on(this.q('#spObjPlace'), 'click', () => { this.setTool('object'); this.toast('点击链上空位放置场对象', 1200); });
    this.on(this.q('#spObjDup'), 'click', () => this.duplicateFieldObject());
    this.on(this.q('#spObjDelete'), 'click', () => this.deleteFieldObject());
    this.on(this.q('#spDrawerPanel'), 'click', () => this.toggleBand('panel'));
    this.on(this.q('#spDrawerHud'), 'click', () => this.toggleBand('hud'));
    this.on(this.q('#spModeGs'), 'click', () => this.applyMode('gs'));
    this.on(this.q('#spModeEvo'), 'click', () => this.applyMode('evo'));
    this.on(this.q('#spPause'), 'click', () => this.togglePause());
    this.on(this.q('#spStep'), 'click', () => this.stepFrames(1));
    this.on(this.q('#spReset'), 'click', () => this.initPreset());
    this.on(this.q('#spLink'), 'click', () => this.copyLink());
    this.on(this.q('#spSave'), 'click', () => this.exportJson());
    this.on(this.q('#spLoad'), 'click', () => this.q('#spLoadFile').click());
    this.on(this.q('#spLoadFile'), 'change', e => {
      const file=e.target.files&&e.target.files[0];
      if(file)this.importJsonFile(file);
      e.target.value='';
    });
    this.on(this.q('#spGap'), 'click', () => this.startGap());
    this.container.querySelectorAll('button[data-proj]').forEach(b =>
      this.on(b, 'click', () => this.setProj(b.getAttribute('data-proj'))));
    this.on(window, 'resize', () => {
      const w = window.innerWidth || 0;
      if (w > 1200 || w <= 860) this.closeBand();
      this.resize(); this.draw();
    });
    this.on(document, 'keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      if (/input|textarea|select/i.test(tag)) return;
      if (e.key === '1' || e.key === '2' || e.key === '3') this.setTool(SP_TOOLS[+e.key - 1].k);
      else if (e.key === 'o' || e.key === 'O') this.setTool('object');
      else if (e.key >= '4' && e.key <= '7') this.setView(SP_VIEWS[+e.key - 4].k);
      else if (e.key === '0') this.toggleProj();
      else if (this.state.proj === '3d' && (e.key === 'r' || e.key === 'R')){
        this.cam = hbCamDefault(); this.syncPanel(); this.draw(); this.queueUrl();
      }
      else if (e.key === ' ') { e.preventDefault(); this.togglePause(); }
      else if (e.key === 'Escape') this.closeBand();
    });
    this.bindCanvas();
  }

  /* ---------- 画布交互 ---------- */
  bindCanvas(){
    const cv = this.q('#spLadder');
    if (!cv) return;
    this.on(cv, 'contextmenu', e => e.preventDefault());
    this.on(cv, 'pointerdown', e => {
      const i = this.pick(e);
      this._hover = i;
      /* 3D：格点之外（或 Shift / 中键）就是「转相机」——不必先切工具，点格点照样可用 */
      if (this.state.proj === '3d' && (i < 0 || e.shiftKey || e.button === 1)){
        e.preventDefault();
        this._paint = null;
        this._orbit = { x: e.clientX, y: e.clientY };
        return;
      }
      if (i < 0) return;
      e.preventDefault();
      if(this.state.tool==='object'){
        const objectId=this.objectPointerDown(i,e.button===2);
        this._paint=objectId?{i,objectId}:null;
      }else{
        this._paint = { i };
        this.applyAt(i, e.button === 2);
      }
      this.draw();
    });
    this.on(cv, 'pointermove', e => {
      if (this._orbit){
        const dx = e.clientX - this._orbit.x, dy = e.clientY - this._orbit.y;
        this._orbit = { x: e.clientX, y: e.clientY };
        this.cam = hbOrbit(this.cam || hbCamDefault(), dx, dy);
        this._hover = -1;
        this.draw();
        return;
      }
      const i = this.pick(e);
      if (i !== this._hover){ this._hover = i; this.draw(); }
      if (this._paint && i >= 0 && i !== this._paint.i){
        this._paint.i = i;
        if(this._paint.objectId)this.moveFieldObject(this._paint.objectId,i);
        else this.applyAt(i, false);
        this.draw();
      }
    });
    this.on(cv, 'pointerup', () => {
      const was = !!this._paint || !!this._orbit;
      this._orbit = null;
      if (was){ this._paint = null; this.queueUrl(); this.draw(); }
    });
    this.on(cv, 'pointerleave', () => {
      const wasPaint=!!this._paint;
      this._hover = -1; this._paint = null; this._orbit = null;
      if(wasPaint)this.queueUrl();
      this.draw();
    });
    this.on(cv, 'wheel', e => {
      if (this.state.proj !== '3d') return;
      e.preventDefault();
      this.cam = hbZoom(this.cam || hbCamDefault(), Math.exp((e.deltaY || 0) * 0.0012));
      this.draw(); this.queueUrl();
    }, { passive: false });
    this.on(cv, 'dblclick', () => {
      if (this.state.proj !== '3d') return;
      this.cam = hbCamDefault(); this.draw(); this.queueUrl();
    });
    const ch = this.q('#spChart');
    if (ch){
      this.on(ch, 'click', e => {
        if (this.state.view !== 'Sq') return;
        const r = ch.getBoundingClientRect ? ch.getBoundingClientRect() : null;
        const dpr = ch.width / (ch.clientWidth || ch.width) || 1;
        this.qPeak((e.clientX - (r ? r.left : 0)) * dpr);
      });
    }
  }
  evX(e){
    const cv = this.q('#spLadder');
    const r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : null;
    if (r && r.width > 0) return (e.clientX - r.left) * (cv.width / r.width);
    return e.clientX;
  }
  /* 指针 → 设备像素 (x,y)：jsdom 里 rect 为 0，退化成 1:1 设备坐标 */
  evPt(e){
    const cv = this.q('#spLadder');
    const r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : null;
    if (r && r.width > 0 && r.height > 0){
      return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
    }
    return { x: e.clientX, y: e.clientY };
  }
  /* 3D 拾取：用最近一次 draw 存下的格点屏幕位置（几何在 hubbard3d.js，pot143 已对账） */
  siteAtPt(pt){
    const cv = this.q('#spLadder');
    if (!cv || !this._sites3 || !this._sites3.length) return -1;
    const dpr = (this._geo && this._geo.dpr) || (cv.width / (cv.clientWidth || cv.width)) || 1;
    const rad = Math.max(10 * dpr, 0.30 * this._sites3[0].k);
    return hbPick(this.cam || hbCamDefault(), cv.width, cv.height, hbSitePositions(this.state.L), pt.x, pt.y, rad);
  }
  pick(e){
    return this.state.proj === '3d' ? this.siteAtPt(this.evPt(e)) : this.siteAtX(this.evX(e));
  }
  siteAtX(x){
    const L = this.state.L, cv = this.q('#spLadder');
    if (!cv) return -1;
    const W = cv.width || 0;
    if (!(W > 0)) return -1;
    /* 与绘制共用同一份几何（_view 是画的时候存下的），避免两处各算一遍导致点歪 */
    const pad = this._view ? this._view.pad : clamp(W * 0.045, 24, 64);
    const stepX = this._view ? this._view.stepX : (W - 2 * pad) / Math.max(1, L - 1);
    const f = (x - pad) / stepX;
    if (!Number.isFinite(f)) return -1;
    if (f < -0.5 || f > L - 0.5) return -1;
    const i = Math.round(f);
    return (i < 0 || i > L - 1) ? -1 : i;
  }
  applyAt(i, right){
    const tool = this.state.tool;
    if (tool === 'state') this.flipSite(i, right ? -1 : 1);
    else if (tool === 'field') this.paintSite(i, (right ? -1 : 1) * this.state.brush);
    else this.paintSite(i, 0);
  }
  /* S(q) 图上点一下：把该 q 的峰值位置报出来（图上标出 q=π 的那个峰） */
  qPeak(x){
    const cv = this.q('#spChart');
    if (!cv || !this.Sq) return -1;
    const dpr = cv.width / (cv.clientWidth || cv.width) || 1;
    const L = this.state.L, pad = 40 * dpr, w = cv.width - 2 * pad;
    const m = clamp(Math.round((x - pad) / w * (L - 1)), 0, L - 1);
    const q = 2 * Math.PI * m / L;
    this.toast(`q = ${(q / Math.PI).toFixed(2)}π · S(q) = ${this.Sq[m].toFixed(4)}`, 1800);
    return m;
  }

  /* ---------- 状态 / 扇区 ---------- */
  /* 初始化/重置到当前预设。keepMode: 用户自己选的模式优先——切预设、切链长都不许
     把「从初态演化」悄悄打回「解基态」（旧版每次 startSolve 都把 mode 写成 gs）。 */
  initPreset(opts = {}){
    const keepMode = opts.keepMode === true;
    const p = SP_PRESETS[this.state.preset] || SP_PRESETS.xxx;
    this.cancelSolve();
    this.state.paused = false;
    this.state.t = 0; this.state.frames = 0; this.hist = [];
    this.gap = null; this.gapJob = null;
    this.q('#hGap').textContent = '—';
    if (typeof p.delta === 'number') this.state.delta = clamp(p.delta, 0, 4);
    if (typeof p.h === 'number') this.state.h = clamp(p.h, 0, 4);
    this.q('#rDelta').value = String(this.state.delta);
    this.q('#oDelta').textContent = this.state.delta.toFixed(2);
    this.q('#rH').value = String(this.state.h);
    this.q('#oH').textContent = this.state.h.toFixed(2);
    this.state.spins = Int8Array.from({ length: this.state.L }, (_, i) => (i % 2 === 0 ? 1 : -1));
    this.state.nUp = this.state.spins.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
    this.state.fieldBase = new Float64Array(this.state.L);
    this.state.fieldObjects = []; this.state.selectedFieldObject = null;
    this.rebuildField(); this.syncObjectPanel();
    this.rebuildSector(this.state.nUp);
    if (!keepMode) this.state.mode = p.mode === 'evo' ? 'evo' : 'gs';
    if (this.state.mode === 'gs') this.startSolve();
    else {
      const w = spNeel(this.sec);
      this.re = w.re; this.im = w.im;
      this.measureAll(true);
    }
    this.syncPanel(); this.draw();
  }
  rebuildSector(nUp){
    this.cancelSolve();
    this.sec = spSector(this.state.L, nUp, {
      J: 1, delta: this.state.delta, h: this.state.h,
      field: this.hasField() ? this.state.bz : null,
    });
    this.state.nUp = nUp;
    /* 注意：**不要**在这里重写 state.spins —— 调用方（翻格点 / applySpec）已经把
       具体构型写好了，重建成「前 nUp 格朝上」会把它悄悄改掉。 */
    const nUpReal = Array.from(this.state.spins).filter(v => v > 0).length;
    if (nUpReal !== nUp) throw new Error(`rebuildSector: 构型里有 ${nUpReal} 个 ↑，与扇区 nUp=${nUp} 不符`);
    /* 新扇区是新对象：上一扇区的测量 / 缓存在飞的剖面任务全部作废
       （否则 drawLadder 会拿旧长度的数组去画，画面直接空掉） */
    this.m = null; this.S = NaN; this.Sq = null; this.E = NaN; this.residual = null;
    this._sxProf = null; this._sxJob = null; this._sxPending = null; this._dirtySx = true;
    this.job = null;
    this.q('#hDim').textContent = `${nUp}↑ / ${this.state.L - nUp}↓ · ${this.sec.dim}`;
  }
  /* 场 / Δ / h 变了：只重烤对角项（不重建 CSR），然后按模式重解或只更新读数 */
  afterHChange(why){
    this.cancelSolve();
    this._sxPending=null;
    this.gap = null; this.gapJob = null;
    this.q('#hGap').textContent = '—';
    this.sec = spSector(this.state.L, this.state.nUp, {
      J: 1, delta: this.state.delta, h: this.state.h,
      field: this.hasField() ? this.state.bz : null,
    });
    if (this.state.mode === 'gs') this.startSolve();
    else if (this.sec.dim === (this.re ? this.re.length : -1)) this.measureAll(true);
    this.syncPanel(); this.draw();
    void why;
  }
  hasField(){ return this.state.bz && this.state.bz.some(v => v !== 0); }

  flipSite(i, dir = 1){
    const L = this.state.L;
    if (i < 0 || i >= L) return;
    const spins = Int8Array.from(this.state.spins);
    spins[i] = -spins[i];
    /* 翻转改变 nUp ⟹ 扇区必须重建（这才是「点在格子上」的物理后果） */
    let nUp = 0;
    for (let j = 0; j < L; j++) if (spins[j] > 0) nUp++;
    this.state.spins = spins;
    if (nUp !== this.state.nUp) this.rebuildSector(nUp);
    if (this.state.mode === 'gs'){
      this.startSolve();
      this.syncPanel(); this.draw(); this.queueUrl();
      return;
    }
    /* 演化模式：把这个直积态设成当前态（点是「指定初态」，不是「扰动基态」） */
    const prod = spProduct(this.sec, Array.from(spins));
    this.re = prod.re; this.im = prod.im;
    this.state.t = 0; this.state.frames = 0; this.hist = [];
    this.job = null;
    this.measureAll(true);
    this.syncPanel(); this.draw(); this.queueUrl();
    void dir;
  }
  rebuildField(){
    this.state.bz = spComposeField(this.state.L, this.state.fieldBase, this.state.fieldObjects);
    for (let i = 0; i < this.state.bz.length; i++){
      this.state.bz[i] = clamp(this.state.bz[i], -B_VIEW, B_VIEW);
    }
  }
  paintSite(i, v){
    if (!(i >= 0 && i < this.state.L)) return;
    this.state.fieldBase[i] = clamp(v, -B_VIEW, B_VIEW);
    this.rebuildField();
    this.afterHChange('brush');
  }
  clearField(loud){
    const hasLayer = this.state.fieldObjects.length > 0 || this.state.fieldBase.some(v => v !== 0);
    if (!hasLayer){ if (loud) this.toast('场上没有局域场', 900); return; }
    this.state.fieldBase = new Float64Array(this.state.L);
    this.state.fieldObjects = []; this.state.selectedFieldObject = null;
    this.rebuildField(); this.syncObjectPanel();
    this.afterHChange('clear'); this.queueUrl();
    if (loud) this.toast('已清空自由场与场对象', 1100);
  }
  fieldObjectAt(i){
    let best = null, dist = Infinity;
    for (const o of this.state.fieldObjects){
      const d = Math.abs(o.center - i);
      if (d <= 0.6 && d < dist){ best = o; dist = d; }
    }
    return best;
  }
  newFieldObjectId(){
    let id;
    do { id = `field-${this._nextFieldObjectId++}`; }
    while (this.state.fieldObjects.some(o => o.id === id));
    return id;
  }
  addFieldObject(center, props = {}){
    if (!Number.isInteger(center) || center < 0 || center >= this.state.L || this.state.fieldObjects.length >= 24) return null;
    const [o] = spNormalizeFieldObjects(this.state.L, [{
      id: this.newFieldObjectId(), shape: props.shape || this.state.objectShape,
      center, width: props.width ?? this.state.objectWidth, amp: props.amp ?? this.state.objectAmp,
    }]);
    this.state.fieldObjects.push(o); this.state.selectedFieldObject = o.id;
    this.rebuildField(); this.syncObjectPanel();
    this.afterHChange('object-add'); this.queueUrl();
    return o.id;
  }
  objectPointerDown(i, right = false){
    const hit = this.fieldObjectAt(i);
    if (right){
      if (hit){ this.state.selectedFieldObject = hit.id; this.deleteFieldObject(); }
      return null;
    }
    if (hit){ this.state.selectedFieldObject = hit.id; this.syncObjectPanel(); return hit.id; }
    if (this.state.fieldObjects.length >= 24){ this.toast('场对象已达上限（24）', 1300); return null; }
    return this.addFieldObject(i);
  }
  moveFieldObject(id, site){
    const o = this.state.fieldObjects.find(x => x.id === id);
    if (!o || site === o.center) return;
    o.center = site; this.rebuildField(); this.syncObjectPanel(); this.afterHChange('object-move');
  }
  setObjectShape(shape){
    if (!SP_FIELD_SHAPES.includes(shape)) return false;
    this.state.objectShape = shape;
    const o = this.state.fieldObjects.find(x => x.id === this.state.selectedFieldObject);
    if (o){ o.shape = shape; this.rebuildField(); this.afterHChange('object-edit'); }
    this.syncObjectPanel(); this.draw(); this.queueUrl();
    return true;
  }
  setObjectProperty(key, value){
    if (!Number.isFinite(value) || !['amp', 'width'].includes(key)) return false;
    value = key === 'amp' ? clamp(value, -B_VIEW, B_VIEW) : clamp(value, 0.5, 8);
    const o = this.state.fieldObjects.find(x => x.id === this.state.selectedFieldObject);
    if (o){ o[key] = value; this.rebuildField(); this.afterHChange('object-edit'); }
    else if (key === 'amp') this.state.objectAmp = value;
    else this.state.objectWidth = value;
    this.syncObjectPanel(); this.draw(); this.queueUrl();
    return true;
  }
  duplicateFieldObject(){
    const o = this.state.fieldObjects.find(x => x.id === this.state.selectedFieldObject);
    if (!o){ this.toast('先选中一个场对象', 1000); return false; }
    if (this.state.fieldObjects.length >= 24){ this.toast('场对象已达上限（24）', 1300); return false; }
    const id = this.newFieldObjectId();
    const copy = { ...o, id, center: o.center < this.state.L - 1 ? o.center + 1 : Math.max(0, o.center - 1) };
    this.state.fieldObjects.push(copy); this.state.selectedFieldObject = id;
    this.rebuildField(); this.syncObjectPanel(); this.afterHChange('object-copy'); this.queueUrl();
    return true;
  }
  deleteFieldObject(){
    const n = this.state.fieldObjects.length;
    this.state.fieldObjects = this.state.fieldObjects.filter(o => o.id !== this.state.selectedFieldObject);
    if (n === this.state.fieldObjects.length) return false;
    this.state.selectedFieldObject = null;
    this.rebuildField(); this.syncObjectPanel(); this.afterHChange('object-delete'); this.queueUrl();
    return true;
  }
  syncObjectPanel(){
    const count = this.q('#spObjCount'), status = this.q('#spObjStatus');
    if (count) count.textContent = String(this.state.fieldObjects.length);
    const o = this.state.fieldObjects.find(x => x.id === this.state.selectedFieldObject);
    if (status){
      status.textContent = o
        ? `已选 ${o.shape} · 中心 ${o.center} · 振幅 ${o.amp.toFixed(1)} · 宽度 ${o.width.toFixed(1)} 格；拖动锚点移动。`
        : '选形状后点「放置」，再点链上空位；拖对象标记可移动。';
    }
    this.container.querySelectorAll('[data-object-shape]').forEach(b =>
      b.classList.toggle('on', b.dataset.objectShape === (o ? o.shape : this.state.objectShape)));
    const amp = o ? o.amp : this.state.objectAmp, width = o ? o.width : this.state.objectWidth;
    if (this.q('#rObjAmp')) this.q('#rObjAmp').value = String(amp);
    if (this.q('#oObjAmp')) this.q('#oObjAmp').textContent = amp.toFixed(1);
    if (this.q('#rObjWidth')) this.q('#rObjWidth').value = String(width);
    if (this.q('#oObjWidth')) this.q('#oObjWidth').textContent = width.toFixed(1);
    if (this.q('#spObjDup')) this.q('#spObjDup').disabled = !o;
    if (this.q('#spObjDelete')) this.q('#spObjDelete').disabled = !o;
  }
  /* 链长只换「链」，不换「场景」：Δ / h / 预设 / 模式全部保留，局域场按新长度截取或补零，
     初态回落到新链的 Néel 图案（构型长度变了，逐格翻转保不住）。 */
  setL(L){
    if (L === this.state.L) return;
    if (![8, 10, 12, 14, 16].includes(L)) return;
    this.cancelSolve();
    const prevBase = this.state.fieldBase, prevObjects = this.state.fieldObjects;
    this.state.L = L;
    this.state.spins = Int8Array.from({ length: L }, (_, i) => (i % 2 === 0 ? 1 : -1));
    this.state.fieldBase = new Float64Array(L);
    if (prevBase) for (let i = 0; i < Math.min(L, prevBase.length); i++) this.state.fieldBase[i] = prevBase[i];
    this.state.fieldObjects = prevObjects.map(o => ({...o,center:clamp(o.center,0,L-1)}));
    if (!this.state.fieldObjects.some(o=>o.id===this.state.selectedFieldObject)) this.state.selectedFieldObject=null;
    this.rebuildField(); this.syncObjectPanel();
    this.state.nUp = Array.from(this.state.spins).filter(v => v > 0).length;
    this.state.t = 0; this.state.frames = 0; this.hist = [];
    this.gap = null; this.gapJob = null;
    if (this.q('#hGap')) this.q('#hGap').textContent = '—';
    this.rebuildSector(this.state.nUp);
    if (this.state.mode === 'gs') this.startSolve();
    else {
      const prod = spProduct(this.sec, Array.from(this.state.spins));
      this.re = prod.re; this.im = prod.im;
      this.measureAll(true);
    }
    this.syncPanel(); this.draw(); this.queueUrl();
    this.toast(`L=${L}：扇区 ${this.sec ? this.sec.dim : '?'} 维（Δ/h/模式保留，初态重置为 Néel）`, 1600);
  }
  setDelta(v){ this.state.delta = clamp(v, 0, 4); this.q('#rDelta').value = String(this.state.delta); this.q('#oDelta').textContent = this.state.delta.toFixed(2); this.afterHChange('delta'); }
  setH(v){ this.state.h = clamp(v, 0, 4); this.q('#rH').value = String(this.state.h); this.q('#oH').textContent = this.state.h.toFixed(2); this.afterHChange('h'); }
  setPreset(k){
    if (!SP_PRESETS[k]) return;
    this.state.preset = k;
    this.initPreset({ keepMode: true });
    const p = SP_PRESETS[k];
    /* 该预设的「原生模式」与当前模式不同时只提示，不代用户切换 */
    const want = p.mode === 'evo' ? '从初态演化' : '解基态';
    const hint = (p.mode === 'evo') !== (this.state.mode === 'evo') ? `（这个预设本是「${want}」）` : '';
    this.toast(p.name + hint, 1600);
    this.syncPanel(); this.draw(); this.queueUrl();
  }
  setTool(k){
    if (!SP_TOOLS.some(t => t.k === k)) return false;
    this.state.tool = k;
    const st = this.q('#spStage'); if (st) st.dataset.tool = k;
    this.syncPanel(); this.syncObjectPanel(); this.draw(); this.queueUrl();
    return true;
  }
  setView(k){
    if (!SP_VIEWS.some(v => v.k === k)) return false;
    this.state.view = k;
    if(k!=='Sx'){this._sxJob=null;this._sxPending=null;}
    if (k === 'Sx' && this.probeReady()) this.measureAll(true);
    this.syncPanel(); this.draw(); this.queueUrl();
    return true;
  }
  setProj(k){
    if (!SP_PROJ.some(v => v.k === k) || k === this.state.proj) return false;
    this.state.proj = k;
    this._hover = -1; this._sites3 = null; this._paint = null; this._orbit = null;
    this.syncPanel(); this.draw(); this.queueUrl();
    return true;
  }
  toggleProj(){ return this.setProj(this.state.proj === '3d' ? '2d' : '3d'); }
  applyMode(mode){
    this.cancelSolve();
    this._sxPending=null;
    if (mode === 'gs'){
      this.state.mode = 'gs';
      this.startSolve();
    } else {
      this.state.mode = 'evo';
      const prod = spProduct(this.sec, Array.from(this.state.spins));
      this.re = prod.re; this.im = prod.im;
      this.state.t = 0; this.state.frames = 0; this.hist = [];
      this.state.paused = false;
      this.measureAll(true);
    }
    this.syncPanel(); this.draw(); this.queueUrl();
  }
  /* 861–1200px 的「底部 sheet 开合」：同一时刻只开一个（两个都开就又把画面挤没了）；
     ≤860 由 core 的 dock 三态接管，>1200 两个按钮本身被 CSS 藏起来。 */
  toggleBand(which){
    const p = this.q('#spPanel'), h = this.q('#spHud');
    if (!p || !h) return false;
    const target = which === 'panel' ? p : h;
    const other = which === 'panel' ? h : p;
    const on = !target.classList.contains('open');
    other.classList.remove('open');
    target.classList.toggle('open', on);
    this.syncBand();
    return on;
  }
  closeBand(){
    const p = this.q('#spPanel'), h = this.q('#spHud');
    if (p) p.classList.remove('open');
    if (h) h.classList.remove('open');
    this.syncBand();
  }
  bandOpen(){ return { panel: !!(this.q('#spPanel') || {}).classList?.contains('open'), hud: !!(this.q('#spHud') || {}).classList?.contains('open') }; }
  syncBand(){
    const o = this.bandOpen();
    const bp = this.q('#spDrawerPanel'), bh = this.q('#spDrawerHud');
    if (bp) bp.classList.toggle('on', o.panel);
    if (bh) bh.classList.toggle('on', o.hud);
  }
  togglePause(){
    this.state.paused = !this.state.paused;
    this.q('#spPause').textContent = this.state.paused ? '继续' : '暂停';
    this.syncPanel(); this.draw();
  }

  /* ---------- 求解 ---------- */
  cancelSolve(){
    if (this._solveTimer){ clearTimeout(this._solveTimer); this._solveTimer = null; }
    this.job = null;
  }
  startSolve(){
    if (!this.sec) return;
    /* 不在这里写 mode：调用方已经确定是基态档；旧版在这里硬写 'gs' 是
       「切预设/链长后模式被自动切回基态」的根因之一。 */
    this.state.paused = true;
    this.q('#spPause').textContent = '继续';
    this.msg = '基态求解中…';
    this.residual = null;
    const m = this.sec.dim > 20000 ? 120 : 90;
    this.job = { task: new SpGsTask(this.sec, { m, maxMemMB: 420 }), kind: 'gs' };
    this.q('#spModeGs') && this.syncPanel();
  }
  advanceJobs(ms = 12){
    const j = this.job;
    if (!j) return false;
    const t0 = performance.now();
    while (performance.now() - t0 < ms){
      j.task.step(2);
      if (j.task.done) break;
    }
    this.gsM = j.task.m; this.gsMCapped = j.task.mCapped;
    if (j.task.done){
      this.re = j.task.re; this.im = j.task.im;
      this.E = j.task.energy;
      this.residual = j.task.residual;
      this.job = null;
      this.measureAll(true);
      this.state.paused = false;
      this.q('#spPause').textContent = '暂停';
      return true;
    }
    return false;
  }
  solveNow(){
    if (this.state.mode !== 'gs') return this.E;
    if (this._solveTimer){ clearTimeout(this._solveTimer); this._solveTimer = null; }
    if (!this.job) this.startSolve();
    if (!this.job) return this.E;
    if (!this.job.task.done) this.job.task.step(100000);
    if (this.job.task.done){
      this.re = this.job.task.re; this.im = this.job.task.im;
      this.E = this.job.task.energy;
      this.residual = this.job.task.residual;
      this.gsM = this.job.task.m; this.gsMCapped = this.job.task.mCapped;
      this.job = null;
      this.measureAll(true);
      this.state.paused = false;
      this.q('#spPause').textContent = '暂停';
    }
    return this.E;
  }
  /* 能隙：同一 H（同 Δ、h、bz）下 Sz+1 扇区的基态能量差 */
  startGap(){
    const { L, nUp } = this.state;
    if (nUp + 1 > L){ this.toast('已满：没有 Sz+1 扇区', 1400); return; }
    this.toast('算能隙：解 Sz+1 扇区的基态…', 1600);
    const sec2 = spSector(L, nUp + 1, { J: 1, delta: this.state.delta, h: this.state.h, field: this.hasField() ? this.state.bz : null });
    this.gapJob = new SpGsTask(sec2, { m: 90, maxMemMB: 420 });
  }
  gapNow(){
    if (this.gap !== null) return this.gap;
    if (!this.gapJob) this.startGap();
    if (this.gapJob){
      if (!this.gapJob.done) this.gapJob.step(100000);
      if (this.gapJob.done){
        const e1 = this.E;
        this.gap = this.gapJob.energy - e1;
        this.gapJob = null;
        this.q('#hGap').textContent = nf(this.gap, 4);
      }
    }
    return this.gap;
  }

  /* ---------- 测量 ---------- */
  probeReady(){ return !!this.re && !!this.sec && this.re.length === this.sec.dim; }
  measureAll(force){
    if (!this.probeReady()) return;
    const m = spMeasure(this.sec, this.re, this.im);
    this.m = m;
    this.E = spEnergy(this.sec, this.re, this.im);
    this.residual = this.job ? null : spResidual(this.sec, this.re, this.im, this.E);
    this.Sq = spStructureFactor(this.sec, m.zz);
    /* 半链熵：L=16 的 Gram 是 256×256，约 60 ms ⟹ 演化中按 250 ms 节流 */
    const now = performance.now();
    if (force || this.state.mode === 'gs' || now - (this._sT || 0) > 250){
      this.S = spEntropy(this.sec, this.re, this.im, symEigVals).S;
      this._sT = now;
    }
    if (this.state.mode === 'evo'){
      if (!this.hist.length || this.state.t - this.hist[this.hist.length - 1][0] > 1e-9)
        this.hist.push([this.state.t, this.S]);
      if (this.hist.length > 4000) this.hist.shift();
    } else {
      this.hist = [[0, this.S], [1, this.S]];
    }
    /* S(x)：保持最近一条完整曲线可见；演化中的新快照排队，旧任务完成后再算，
       避免高频测量不断清空/重启 L=16 的全剖面任务而造成闪烁。 */
    if(this.state.view==='Sx'&&this.probeReady()){
      const snapshot={sec:this.sec,re:this.re.slice(),im:this.im.slice()};
      if(force||(!this._sxJob&&!this._sxProf)){
        this._sxPending=null;this.startSxProfile(snapshot);
      }else if(this.state.mode==='evo'){
        if(this._sxJob)this._sxPending=snapshot;
        else this.startSxProfile(snapshot);
      }
    }
    this.syncHud();
  }
  startSxProfile(snapshot){
    const {sec,re,im}=snapshot,L=this.state.L;
    this._sxJob={order:this._cutOrder(),k:0,out:new Float64Array(L+1).fill(NaN),sec,L,re,im};
  }
  _cutOrder(){

    const L = this.state.L, o = [];
    for (let d = 1; d < L; d++){
      o.push(d);
      if (L - d !== d && L - d > 0 && L - d < L) o.push(L - d);
    }
    return o;
  }
  stepSx(budget = 8){
    const j = this._sxJob;
    if (!j) return;
    if (j.sec !== this.sec || !this.re || j.re.length !== this.sec.dim){
      this._sxJob = null; this._sxPending = null; return;
    }
    const t0 = performance.now();
    while (j.k < j.order.length && performance.now() - t0 < budget){
      const c = j.order[j.k++];
      j.out[c] = spEntropyAt(j.sec, j.re, j.im, c, symEigVals).S;
    }
    j.out[0] = 0; j.out[j.L] = 0;
    if (j.k >= j.order.length){
      this._sxProf = j.out; this._sxJob = null;
      const pending=this._sxPending;this._sxPending=null;
      if(pending&&pending.sec===this.sec&&this.state.view==='Sx')this.startSxProfile(pending);
    }
  }
  syncHud(){
    const set = (id, v) => { const el = this.q('#' + id); if (el) el.textContent = v; };
    const L = this.state.L;
    set('hMode', this.state.mode === 'gs' ? '基态（H 变即重解）' : '演化');
    set('hDim', `${this.state.nUp}↑ / ${L - this.state.nUp}↓ · ${this.sec.dim}`);
    set('hE', nf(this.E, 6));
    set('hEN', Number.isFinite(this.E) ? nf(this.E / L, 6) : '—');
    set('hGap', this.gap == null ? '—' : nf(this.gap, 4));
    set('hS', nf(this.S, 5));
    set('hS2', this.m ? nf(this.m.S2, 4) : '—');
    set('hSz', `${nf(this.m ? this.m.mag : NaN, 3)} / ${this.state.nUp}`);
    set('hT', `${nf(this.state.t, 2)} / ${this.state.frames}`);
    set('hRes', this.residual == null ? '—' : this.residual.toExponential(1));
    set('hM', this.gsM ? `${this.gsM}${this.gsMCapped ? '（内存上限）' : ''}` : '—');
  }
  syncPanel(){
    this.container.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === this.state.preset));
    this.container.querySelectorAll('[data-len]').forEach(b =>
      b.classList.toggle('on', parseInt(b.getAttribute('data-len'), 10) === this.state.L));
    this.container.querySelectorAll('button[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === this.state.tool));
    this.container.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === this.state.view));
    this.container.querySelectorAll('button[data-proj]').forEach(b => b.classList.toggle('on', b.getAttribute('data-proj') === this.state.proj));
    const gs = this.state.mode === 'gs';
    const a = this.q('#spModeGs'), b = this.q('#spModeEvo');
    if (a) a.classList.toggle('on', gs);
    if (b) b.classList.toggle('on', !gs);
    const st = this.q('#spStage');
    if (st){ st.dataset.tool = this.state.tool; st.dataset.proj = this.state.proj; }
    this.q('#spPause').textContent = this.state.paused ? '继续' : '暂停';
    const hint = this.q('#spHint');
    if (hint){
      hint.querySelector('b').textContent = SP_PRESETS[this.state.preset].name + ' · ';
      hint.querySelector('span').textContent = SP_PRESETS[this.state.preset].text;
    }
    this.syncHud();
  }

  /* ---------- 帧循环 ---------- */
  frame(){
    requestAnimationFrame(this.frame);
    if (this._dead) return;
    try { this.frameBody(); this.clearError(); }
    catch (e){
      this._errCount++;
      this.reportError(e);
      if (this._errCount > 3) this._dead = true;
    }
  }
  clearError(){
    if (this._title0 === undefined) this._title0 = document.title;
    if (!this._errCount) return;
    this._errCount--;
    if (this._errCount > 0) return;
    const box = this.q('#spErr'); if (box){ box.style.display = 'none'; box.textContent = ''; }
    document.title = this._title0;
  }
  reportError(e){
    const msg = (e && (e.stack || e.message)) || String(e);
    console.error('[spin]', e);
    const d = this.q('#spDiag'); if (d) d.textContent = 'ERR ' + msg;
    document.title = 'ERR ' + (e && e.message ? e.message : e);
    const box = this.q('#spErr');
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
    if (this._sxJob) this.stepSx();
    if (this.gapJob){
      this.gapJob.step(2);
      if (this.gapJob.done){
        this.gap = this.gapJob.energy - this.E;
        this.gapJob = null;
        this.q('#hGap').textContent = nf(this.gap, 4);
      }
    }
    if (this.state.mode === 'evo' && !this.state.paused && !this.job && this.re){
      this.evolveFrame();
    }
    if (this.state.mode === 'evo' && !this.state.paused && !this.job && this.state.frames % 2 === 0) this.measureAll(false);
    this.draw();
    if (this.job){ const s = this.q('#hDim'); void s; }
  }
  evolveFrame(){
    const steps = this.state.spf;
    for (let s = 0; s < steps; s++){
      const out = spKrylovExp(this.sec, this.re, this.im, this.state.dt, 12);
      this.re = out.re; this.im = out.im;
      this.state.t += this.state.dt;
    }
    this.state.frames++;
    if (this.state.frames % 3 === 0) this.measureAll(false);
  }
  stepFrames(n = 1){
    if (!this.re) return;
    for (let k = 0; k < n; k++){
      if (this.state.mode !== 'evo') break;
      const out = spKrylovExp(this.sec, this.re, this.im, this.state.dt, 12);
      this.re = out.re; this.im = out.im;
      this.state.t += this.state.dt;
      this.state.frames++;
    }
    this.measureAll(true);
    this.draw();
    return this.state.t;
  }

  /* ---------- 绘图 ---------- */
  /* ---------- 画布尺寸：唯一真相在 JS 里 ----------
     两个坑一次解决：
     ① **模糊**：位图必须是 CSS 盒 × DPR，且 CSS 盒不能随窗口再变——否则浏览器把
        位图拉伸显示（缩放 = 模糊）。这里每次布局都把 CSS 高度写死成 px、位图按
        DPR 重算，并在 draw() 里自检（clientWidth 与位图/DPR 不符就重排一次）。
     ② **挤压**：高度原来是写死的 268 / 178，宽屏上就是一条又宽又扁的带子。
        改成随视口算（阶梯 34vh 夹在 200–380、图表 20vh 夹在 130–240），并在总高
        超出可用高度时按比例一起缩，保证「两块画布 + 视图行」永远塞得进视口。 */
  layoutSize(){
    const vh = window.innerHeight || 800;
    const stage = this.q('#spStage');
    const dpr = window.devicePixelRatio || 1;
    /* 宽度**只能**照抄舞台实测值（0 才是「还没排版」的回退）：若在这里加最小值，
       窄容器下位图会比 CSS 盒宽 ⟹ 又被拉伸，而且自检每帧都判不一致（抖动）。 */
    const rawW = (stage && stage.clientWidth) || 0;
    const cssW = Math.round(rawW > 0 ? rawW : 720);
    const room = vh - 116;                       /* 顶栏 48 + 底部 dock/hint 留白 */
    let ladH = Math.round(Math.min(Math.max(vh * 0.34, 200), 380));
    let chH = Math.round(Math.min(Math.max(vh * 0.20, 130), 240));
    const gap = 44;                              /* 视图行 + flex gap */
    if (ladH + chH + gap > room){
      const k = Math.max(0.5, (room - gap) / (ladH + chH));
      ladH = Math.max(140, Math.round(ladH * k));
      chH = Math.max(96, Math.round(chH * k));
    }
    this._geo = { dpr, cssW, ladH, chH };
    /* 舞台本体也要落在**整数像素**上：CSS 的 `left:50%`+`translate(-50%,-50%)` 在宽/高为
       奇数或小数时会把整块画布放到半像素处，合成阶段同样会重采样（另一种「糊」）。
       桌面档（未被响应式模块写成 sheet）就自己算整数 left/top；sheet 档（内联 right 存在）
       交还给 core/responsive.js，不抢它的几何。 */
    if (stage && !stage.style.right){
      const stH = stage.offsetHeight || (ladH + chH + 44);
      stage.style.width = cssW + 'px';
      stage.style.left = Math.max(0, Math.round((window.innerWidth - cssW) / 2)) + 'px';
      stage.style.top = Math.max(48, Math.round((window.innerHeight - stH) / 2)) + 'px';
      stage.style.transform = 'none';
    }
    for (const [id, cssH] of [['spLadder', ladH], ['spChart', chH]]){
      const cv = this.q('#' + id);
      if (!cv) continue;
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round(cssH * dpr);
      /* 宽高都钉成整数 px：CSS 盒与位图必须**逐像素对齐**，只要盒宽是小数
         （56vw 之类）或含 1px 边框，浏览器就会把位图重采样 = 模糊。
         sheet 态下舞台宽由内联 left/right 决定，ResizeObserver 会在它变化后重钉。 */
      cv.style.width = cssW + 'px';
      cv.style.height = cssH + 'px';
    }
  }
  /* 自检：布局在窗口/刻度带/字体加载后都可能变，位图与 CSS 盒不一致就重排 */
  syncCanvasSize(){
    const cv = this.q('#spLadder');
    if (!cv || !this._geo) return false;
    const dpr = window.devicePixelRatio || 1;
    /* 只比宽度与 DPR：高度是我们自己写进 inline style 的，宽度才是被 CSS（width:100%）
       与容器共同决定的那个量——它一变，位图就被浏览器拉伸 = 模糊。 */
    const cw = Math.round((cv.clientWidth || this._geo.cssW) * dpr);
    if (cw === cv.width && dpr === this._geo.dpr) return false;
    this.layoutSize();
    return true;
  }
  resize(){ this.layoutSize(); }
  draw(){
    if (!this._geo) this.layoutSize();
    this.syncCanvasSize();
    this.drawLadder();
    this.drawChart();
  }
  drawLadder(){
    const cv = this.q('#spLadder');
    if (!cv) return;
    if (this.state.proj === '3d') return this.drawLadder3D(cv);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const dpr = (this._geo && this._geo.dpr) || (W / (cv.clientWidth || W)) || 1;
    ctx.clearRect(0, 0, W, H);
    const L = this.state.L;
    const pad = clamp(W * 0.045, 24 * dpr, 64 * dpr);
    const stepX = (W - 2 * pad) / Math.max(1, L - 1);
    const xOf = i => pad + i * stepX;
    /* 竖直方向按 H 的比例分配：文字带 12%、箭头区 20%、J 带 74%、b 带 89%、序号 97%
       —— 这样 200px 的矮画布与 380px 的高画布都不会「全挤在上半截」。 */
    const midY = H * 0.36, arrowH = H * 0.20;
    const jZero = H * 0.74, jAmp = H * 0.055;
    const bZero = H * 0.89, bAmp = H * 0.06;
    const idxY = H * 0.975;
    const fs = clamp(H * 0.036, 8, 12);          /* 正文字号（CSS px，随高度走） */
    this._view = { pad, stepX, midY, arrowH, W, H, dpr };
    const m = this.m;
    const mono = px => `${px}px ui-monospace,monospace`;

    const tool = SP_TOOLS.find(t => t.k === this.state.tool) || SP_TOOLS[0];
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(154,167,189,.92)'; ctx.font = mono(fs * dpr);
    ctx.fillText(`自旋链 · ${tool.tip}`, 10 * dpr, H * 0.06);
    ctx.fillStyle = 'rgba(154,167,189,.55)'; ctx.font = mono((fs - 1) * dpr);
    ctx.fillText(`Δ=${this.state.delta.toFixed(2)} · h=${this.state.h.toFixed(2)} · Sᶻ=${this.sec ? this.sec.Sz : '—'}`, 10 * dpr, H * 0.105);

    /* 链脊 */
    ctx.strokeStyle = 'rgba(120,160,220,.14)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(pad - 16 * dpr, midY); ctx.lineTo(W - pad + 16 * dpr, midY); ctx.stroke();

    /* 悬停高亮 */
    if (this._hover >= 0 && this._hover < L){
      const hx = xOf(this._hover);
      ctx.fillStyle = 'rgba(103,232,249,.07)';
      ctx.fillRect(hx - stepX * 0.36, midY - arrowH - 14 * dpr, stepX * 0.72, arrowH * 2 + 28 * dpr);
    }

    for (let i = 0; i < L; i++){
      const x = xOf(i);
      const sz = m ? m.sz[i] : 0;
      const spin = this.state.spins[i] > 0 ? 1 : -1;
      /* 箭头长度 ∝ |⟨S^z_i⟩|（最大 1/2 ⟹ 归一化到 1） */
      const f = m ? clamp(Math.abs(sz) / 0.5, 0, 1) : Math.abs(spin);
      const dir = m && Math.abs(sz) > 1e-9 ? Math.sign(sz) : spin;
      const up = dir > 0;
      const tipY = midY - (up ? 1 : -1) * arrowH * f;
      const col = up ? '103,232,249' : '240,171,252';
      ctx.strokeStyle = `rgba(${col},${(0.28 + 0.55 * f).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, 2.2 * dpr * (0.6 + 0.6 * f));
      ctx.beginPath(); ctx.moveTo(x, midY); ctx.lineTo(x, tipY); ctx.stroke();
      /* 箭头头部 */
      const s = Math.max(4 * dpr, arrowH * 0.09);
      ctx.beginPath();
      if (up){ ctx.moveTo(x - s, tipY + s); ctx.lineTo(x, tipY); ctx.lineTo(x + s, tipY + s); }
      else { ctx.moveTo(x - s, tipY - s); ctx.lineTo(x, tipY); ctx.lineTo(x + s, tipY - s); }
      ctx.closePath();
      ctx.fillStyle = `rgba(${col},${(0.45 + 0.5 * f).toFixed(3)})`; ctx.fill();
      /* 中心点 */
      ctx.fillStyle = 'rgba(9,16,30,.9)';
      const dot = Math.max(2.2 * dpr, H * 0.009);
      ctx.beginPath(); ctx.arc(x, midY, dot, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = `rgba(${col},.7)`; ctx.lineWidth = 1 * dpr;
      ctx.beginPath(); ctx.arc(x, midY, dot, 0, 6.2832); ctx.stroke();
      /* ⟨S^z_i⟩ 读数 */
      ctx.textAlign = 'center'; ctx.font = mono((fs - 1) * dpr);
      ctx.fillStyle = 'rgba(230,237,243,.72)';
      ctx.fillText(m ? sz.toFixed(2) : '—', x, up ? midY + arrowH + fs * 1.5 * dpr : midY - arrowH - fs * 0.7 * dpr);
      ctx.fillStyle = 'rgba(154,167,189,.85)'; ctx.font = mono(fs * dpr);
      ctx.fillText(String(i), x, idxY);
    }

    /* 键关联带：⟨S_i·S_{i+1}⟩（负 = 反铁磁，青；正 = 铁磁，琥珀） */
    ctx.strokeStyle = 'rgba(120,160,220,.16)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(pad - 22 * dpr, jZero); ctx.lineTo(W - pad + 22 * dpr, jZero); ctx.stroke();
    if (m && m.bond.length){
      const maxJ = Math.max(0.05, ...m.bond.map(Math.abs));
      for (let s = 0; s < L - 1; s++){
        const j = m.bond[s], mx = (xOf(s) + xOf(s + 1)) / 2;
        const h = Math.abs(j) / maxJ * jAmp;
        const bw = Math.max(5 * dpr, stepX * 0.13);
        ctx.fillStyle = j <= 0 ? 'rgba(103,232,249,.62)' : 'rgba(251,191,36,.66)';
        ctx.fillRect(mx - bw / 2, j <= 0 ? jZero : jZero - h, bw, Math.max(h, 0.8 * dpr));
      }
    }
    /* 局域场带 */
    for (let i = 0; i < L; i++){
      const bz = this.state.bz[i];
      if (bz === 0) continue;
      const h = clamp(Math.abs(bz) / B_VIEW, 0, 1) * bAmp;
      const bw = Math.max(5 * dpr, stepX * 0.13);
      ctx.fillStyle = bz > 0 ? 'rgba(250,190,96,.72)' : 'rgba(96,178,250,.72)';
      ctx.fillRect(xOf(i) - bw / 2, bz > 0 ? bZero - h : bZero, bw, h);
    }
    ctx.strokeStyle = 'rgba(120,160,220,.16)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(pad - 22 * dpr, bZero); ctx.lineTo(W - pad + 22 * dpr, bZero); ctx.stroke();
    for(const o of this.state.fieldObjects){
      const selected=o.id===this.state.selectedFieldObject,x=xOf(o.center),r=(selected?3.6:2.5)*dpr;
      ctx.strokeStyle=selected?'rgba(103,232,249,.96)':(o.amp>0?'rgba(250,190,96,.82)':o.amp<0?'rgba(96,178,250,.82)':'rgba(190,200,215,.72)');
      ctx.lineWidth=(selected?1.25:0.9)*dpr;ctx.beginPath();
      if(o.shape==='gaussian')ctx.arc(x,bZero,r,0,6.2832);
      else if(o.shape==='box')ctx.rect(x-r,bZero-r,r*2,r*2);
      else{ctx.moveTo(x,bZero-r);ctx.lineTo(x+r,bZero);ctx.lineTo(x,bZero+r);ctx.lineTo(x-r,bZero);ctx.closePath();}
      ctx.stroke();
    }
    ctx.textAlign = 'left'; ctx.font = mono(9 * dpr); ctx.fillStyle = 'rgba(154,167,189,.55)';
    ctx.fillText('J', 8 * dpr, jZero + 3 * dpr);
    ctx.fillText('b', 8 * dpr, bZero + 3 * dpr);
  }


  /* ---------- 3D 透视：链沿 x、自旋沿 ±y、局域场 b_i 沿 ∓z 刺出平面 ----------
     相机/投影/拾取全部来自 hubbard3d.js（纯数学，pot143 已逐条对账），这里只负责画。
     画家算法：所有图元带深度，远→近排序；透明度按深度雾衰减（深度感不靠阴影）。 */
  drawLadder3D(cv){
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const dpr = (this._geo && this._geo.dpr) || (W / (cv.clientWidth || W)) || 1;
    ctx.clearRect(0, 0, W, H);
    const L = this.state.L, m = this.m;
    const cam = this.cam || (this.cam = hbCamDefault());
    const xs = hbSitePositions(L);
    const P = (x, y, z) => hbProject(cam, W, H, { x, y, z });
    const fog = hbDepthRange(cam, W, H, xs);
    const mono = px => `${px}px ui-monospace,monospace`;
    const fs = clamp(H * 0.036, 8, 12);
    const SPIN = 0.9, B_LEN = 1.6;          /* 箭头满量程 / 场刺满量程（世界单位） */
    const S = xs.map(x => P(x, 0, 0));
    this._sites3 = S.map((p, i) => ({ i, x: p.x, y: p.y, depth: p.depth, k: p.k, near: fog.nearness(p.depth) }));
    /* 标签方向用链在**屏幕**上的法向：世界 +y 偏移在俯仰角大时会把标号甩到画面角落 */
    const sdx = L > 1 ? S[L - 1].x - S[0].x : 1, sdy = L > 1 ? S[L - 1].y - S[0].y : 0;
    const sl = Math.hypot(sdx, sdy) || 1;
    const nx = -sdy / sl, ny = sdx / sl;
    const stepPx = L > 1 ? Math.hypot(S[1].x - S[0].x, S[1].y - S[0].y) : 999;

    const tool = SP_TOOLS.find(t => t.k === this.state.tool) || SP_TOOLS[0];
    ctx.textAlign = 'left'; ctx.font = mono(fs * dpr); ctx.fillStyle = 'rgba(154,167,189,.92)';
    ctx.fillText(`自旋链 3D · ${tool.tip}`, 10 * dpr, H * 0.06);
    ctx.fillStyle = 'rgba(154,167,189,.55)'; ctx.font = mono((fs - 1) * dpr);
    ctx.fillText('拖空白转视角 · 滚轮缩放 · 双击/R 复位 · 0 切回 2D', 10 * dpr, H * 0.105);

    const items = [];
    const add = (depth, fn) => items.push({ depth, fn });
    const bondMax = m && m.bond && m.bond.length ? Math.max(0.05, ...m.bond.map(Math.abs)) : 0.25;

    /* ① 地面网格（y = −1.25 的参考面）：没有它整条链看起来像贴在纸上的贴纸；
       同时给每格搭一根细「支柱」把链和地面钉在一起，透视才有落点。 */
    const FY = -1.05, FZ = 1.2;
    add(Infinity, () => {
      ctx.strokeStyle = 'rgba(120,160,220,.06)'; ctx.lineWidth = 1 * dpr;
      const x0 = xs[0] - 0.45, x1 = xs[L - 1] + 0.45;
      for (let k = -2; k <= 2; k++){
        const z = k * FZ / 2;
        const a = P(x0, FY, z), b = P(x1, FY, z);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (let i = 0; i < L; i++){
        const a = P(xs[i], FY, -FZ), b = P(xs[i], FY, FZ);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120,160,220,.05)';
      for (let i = 0; i < L; i++){
        const a = S[i], b = P(xs[i], FY, 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    });

    /* ② 链脊：颜色 = 键关联 ⟨S_i·S_{i+1}⟩ 的符号与大小（负 = 反铁磁） */
    for (let s = 0; s < L - 1; s++){
      const a = S[s], b = S[s + 1];
      const dep = (a.depth + b.depth) / 2 + 1e-6;
      const nr = fog.nearness(dep);
      const j = m && m.bond && m.bond.length ? m.bond[s] : 0;
      const amt = clamp(Math.abs(j) / bondMax, 0, 1);
      add(dep, () => {
        ctx.strokeStyle = j >= 0
          ? `rgba(103,232,249,${(0.10 + 0.32 * amt * (0.5 + 0.5 * nr)).toFixed(3)})`
          : `rgba(251,191,36,${(0.10 + 0.38 * amt * (0.5 + 0.5 * nr)).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, (1.0 + 2.8 * amt) * dpr * (0.7 + 0.6 * nr));
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
    }

    /* ③ 局域场刺：b_i>0 沿 +z（暖色）、b_i<0 沿 −z（冷色）——2D 里这条信息只能塞成一条色带 */
    for (let i = 0; i < L; i++){
      const b = this.state.bz ? this.state.bz[i] : 0;
      if (!b) continue;
      const base = S[i];
      const tip = P(xs[i], 0, clamp(b / B_VIEW, -1, 1) * B_LEN);
      const dep = (base.depth + tip.depth) / 2;
      const nr = fog.nearness(dep);
      const w = Math.max(2 * dpr, tip.k * 0.02);
      add(dep, () => {
        ctx.strokeStyle = b > 0
          ? `rgba(250,190,96,${(0.35 + 0.45 * nr).toFixed(3)})`
          : `rgba(96,178,250,${(0.35 + 0.45 * nr).toFixed(3)})`;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
        /* 尖端圆点：b 的正负与大小一眼可读（刺本身在斜视角下会被压短） */
        ctx.fillStyle = b > 0 ? 'rgba(250,190,96,.85)' : 'rgba(96,178,250,.85)';
        ctx.beginPath(); ctx.arc(tip.x, tip.y, Math.max(2 * dpr, tip.k * 0.013), 0, 6.2832); ctx.fill();
      });
    }

    /* ④ 自旋箭头：长度 ∝ |⟨Sᶻ_i⟩|（≤0.5 即满量程），↑ 青 / ↓ 紫 */
    for (let i = 0; i < L; i++){
      const base = S[i], nr = fog.nearness(base.depth);
      const szv = m && m.sz ? m.sz[i] : this.state.spins[i] * 0.5;
      const up = szv >= 0;
      const len = clamp(Math.abs(szv) * 2, 0, 1) * SPIN;
      const tip = P(xs[i], up ? len : -len, 0);
      add(base.depth - 1e-6, () => {
        ctx.strokeStyle = up ? `rgba(103,232,249,${(0.40 + 0.50 * nr).toFixed(3)})`
                             : `rgba(240,171,252,${(0.40 + 0.50 * nr).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, 2.0 * dpr * (0.7 + 0.6 * nr));
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
        /* 箭头三角（屏幕空间，尺寸随透视缩放 k） */
        const ang = Math.atan2(tip.y - base.y, tip.x - base.x);
        const s2 = Math.max(3.5 * dpr, tip.k * 0.055);
        ctx.fillStyle = up ? 'rgba(103,232,249,.85)' : 'rgba(240,171,252,.85)';
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x - s2 * Math.cos(ang - 0.45), tip.y - s2 * Math.sin(ang - 0.45));
        ctx.lineTo(tip.x - s2 * Math.cos(ang + 0.45), tip.y - s2 * Math.sin(ang + 0.45));
        ctx.closePath(); ctx.fill();
        /* 基点圆点（= 格点） */
        ctx.fillStyle = this._hover === i ? 'rgba(103,232,249,.95)' : 'rgba(154,167,189,.55)';
        ctx.beginPath(); ctx.arc(base.x, base.y, Math.max(2 * dpr, base.k * 0.018), 0, 6.2832); ctx.fill();
        /* 格点标号：贴链的屏幕法向，太密就不画 */
        if (stepPx >= 26 * dpr){
          ctx.fillStyle = 'rgba(154,167,189,.75)'; ctx.font = mono((fs - 1) * dpr); ctx.textAlign = 'center';
          ctx.fillText(String(i), base.x + nx * (fs * 1.5 * dpr), base.y + ny * (fs * 1.5 * dpr) + fs * 0.35 * dpr);
        }
      });
    }

    items.sort((a, b) => b.depth - a.depth);
    for (const it of items) it.fn();
    /* Object anchors are thin outlines around lattice nodes, not overlays on the spin arrows. */
    for(const o of this.state.fieldObjects){
      const wx=xs[0]+(L>1?xs[1]-xs[0]:0)*o.center,p=P(wx,0,0);
      const selected=o.id===this.state.selectedFieldObject,r=(selected?5:3.5)*dpr;
      ctx.strokeStyle=selected?'rgba(103,232,249,.96)':(o.amp>0?'rgba(250,190,96,.82)':o.amp<0?'rgba(96,178,250,.82)':'rgba(190,200,215,.72)');
      ctx.lineWidth=(selected?1.25:0.9)*dpr;ctx.beginPath();
      if(o.shape==='box')ctx.rect(p.x-r,p.y-r,r*2,r*2);
      else if(o.shape==='staggered'){
        ctx.moveTo(p.x,p.y-r);ctx.lineTo(p.x+r,p.y);ctx.lineTo(p.x,p.y+r);ctx.lineTo(p.x-r,p.y);ctx.closePath();
      }else ctx.arc(p.x,p.y,r,0,6.2832);
      ctx.stroke();
    }
    this._view = { pad: 0, stepX: stepPx, W, H, dpr, proj: '3d' };
  }
  drawChart(){
    const cv = this.q('#spChart');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const dpr = (this._geo && this._geo.dpr) || (W / (cv.clientWidth || W)) || 1;
    ctx.clearRect(0, 0, W, H);
    const padL = clamp(W * 0.055, 26 * dpr, 60 * dpr), padR = 16 * dpr;
    const padT = clamp(H * 0.16, 20 * dpr, 34 * dpr), padB = clamp(H * 0.17, 18 * dpr, 28 * dpr);
    const x0 = padL, y0 = H - padB, w = W - padL - padR, h = H - padT - padB;
    const mono = px => `${px}px ui-monospace,monospace`;
    const cfs = clamp(H * 0.062, 8.5, 12);        /* 图表字号（随画布高） */
    const title = (t, sub = '') => {
      ctx.textAlign = 'left'; ctx.font = mono(cfs * dpr); ctx.fillStyle = 'rgba(154,167,189,.92)';
      ctx.fillText(t, 12 * dpr, Math.max(13 * dpr, padT * 0.55));
      if (sub){ ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(154,167,189,.55)'; ctx.font = mono((cfs - 1) * dpr); ctx.fillText(sub, W - 12 * dpr, 13 * dpr); }
    };
    const grid = (n = 4) => {
      ctx.strokeStyle = 'rgba(120,160,220,.10)'; ctx.lineWidth = 1 * dpr;
      for (let k = 0; k <= n; k++){
        const y = y0 - h * k / n;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke();
      }
    };
    const v = this.state.view;
    const geo = { x0, y0, w, h, dpr, mono, title, grid, W, cfs, padB };
    if (v === 'Sx') return this.drawSx(ctx, geo);
    if (v === 'Sq') return this.drawSq(ctx, geo);
    if (v === 'zz') return this.drawZZ(ctx, geo);
    return this.drawSt(ctx, geo);
  }
  drawSx(ctx, g){
    const { x0, y0, w, h, dpr, mono, title, grid, W, cfs, padB } = g;
    const L = this.state.L;
    const prof = this._sxProf && this._sxProf.length === L + 1 ? this._sxProf : null;
    /* 数值写在标题右侧的副标题里：原来压在曲线上（用户要求叠加物不得遮住画面） */
    title('半链/任意切点纠缠熵 S(x)', prof ? `S(L/2) = ${prof[L >> 1].toFixed(4)}` : '基态求解后填充');
    grid(4);
    const maxS = Math.max(1, ...(prof ? Array.from(prof) : [1]));
    const px = i => x0 + w * i / Math.max(1, L);
    const py = v => y0 - h * clamp(v / maxS, 0, 1);
    if (prof){
      ctx.strokeStyle = 'rgba(103,232,249,.85)'; ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath();
      for (let i = 0; i <= L; i++){
        const X = px(i), Y = py(prof[i]);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(103,232,249,.9)';
      for (let i = 0; i <= L; i++){ ctx.beginPath(); ctx.arc(px(i), py(prof[i]), 2.2 * dpr, 0, 6.2832); ctx.fill(); }
    }
    ctx.textAlign = 'center'; ctx.font = mono((cfs - 1) * dpr); ctx.fillStyle = 'rgba(154,167,189,.7)';
    for (let i = 0; i <= L; i += (L > 10 ? 2 : 1)) ctx.fillText(String(i), px(i), y0 + padB * 0.62);
    ctx.textAlign = 'right';
    ctx.fillText(maxS.toFixed(2), x0 - 6 * dpr, y0 - h + 4 * dpr);
    ctx.fillText('0', x0 - 6 * dpr, y0 + 4 * dpr);
    void W;
  }
  drawSq(ctx, g){
    const { x0, y0, w, h, dpr, mono, title, grid, cfs, padB } = g;
    const L = this.state.L, Sq = this.Sq;
    title('静态结构因子 S(q) · q = 2πm/L', Sq ? 'S(π) 高 ⟹ 反厄尔序' : '');
    grid(4);
    if (!Sq) return;
    const vmax = Math.max(0.05, ...Sq);
    const bw = w / L;
    for (let m = 0; m < L; m++){
      const v = Sq[m];
      const bh = h * clamp(v / vmax, 0, 1);
      const bx = x0 + m * bw + bw * 0.18;
      const neg = v < 0;
      ctx.fillStyle = neg ? 'rgba(251,113,133,.6)'
        : (m === (L >> 1) ? 'rgba(251,191,36,.75)' : 'rgba(103,232,249,.55)');
      ctx.fillRect(bx, y0 - bh, bw * 0.64, Math.max(bh, 1 * dpr));
      if (bw > 26 * dpr){
        ctx.textAlign = 'center'; ctx.font = mono((cfs - 2) * dpr); ctx.fillStyle = 'rgba(154,167,189,.6)';
        ctx.fillText((2 * m / L).toFixed(1) + 'π', bx + bw * 0.32, y0 + padB * 0.55);
      }
    }
    ctx.textAlign = 'right'; ctx.font = mono((cfs - 1) * dpr); ctx.fillStyle = 'rgba(154,167,189,.7)';
    ctx.fillText(vmax.toFixed(2), x0 - 6 * dpr, y0 - h + 4 * dpr);
    ctx.fillText('0', x0 - 6 * dpr, y0 + 4 * dpr);
  }
  drawZZ(ctx, g){
    const { x0, y0, w, h, dpr, mono, title, cfs, padB } = g;
    const L = this.state.L, m = this.m;
    title('自旋关联矩阵 ⟨S^z_iS^z_j⟩', m ? '红 = 反关联（奈尔）· 青 = 正关联' : '');
    if (!m) return;
    const gsz = Math.min(w, h) / L;
    const ox = x0 + (w - gsz * L) / 2, oy = y0 - gsz * L;
    let vmax = 0.05;
    for (let k = 0; k < L * L; k++) vmax = Math.max(vmax, Math.abs(m.zz[k]));
    for (let i = 0; i < L; i++){
      for (let j = 0; j < L; j++){
        const v = m.zz[i * L + j] / vmax;
        const r = v < 0 ? 240 : 103, gg = v < 0 ? 90 : 232, b = v < 0 ? 120 : 249;
        ctx.fillStyle = `rgba(${r},${gg},${b},${(0.08 + 0.75 * Math.abs(v)).toFixed(3)})`;
        ctx.fillRect(ox + j * gsz, oy + i * gsz, gsz - 0.6 * dpr, gsz - 0.6 * dpr);
      }
    }
    ctx.textAlign = 'center'; ctx.font = mono((cfs - 2) * dpr); ctx.fillStyle = 'rgba(154,167,189,.65)';
    for (let i = 0; i < L; i++){
      ctx.fillText(String(i), ox + i * gsz + gsz / 2, y0 + padB * 0.5);
      ctx.fillText(String(i), ox - (cfs * 0.62) * dpr, oy + i * gsz + gsz / 2 + cfs * 0.3 * dpr);
    }
  }
  drawSt(ctx, g){
    const { x0, y0, w, h, dpr, mono, title, grid, cfs, padB } = g;
    const hist = this.hist;
    title('半链纠缠熵 S(t)', this.state.mode === 'gs' ? '基态：退化为标尺' : '虚线 = 早窗线性拟合');
    grid(4);
    const sMax = Math.max(0.5, ...hist.map(p => p[1])) * 1.1;
    const tMax = Math.max(1, this.state.t, ...hist.map(p => p[0]));
    const px = t => x0 + w * clamp(t / tMax, 0, 1);
    const py = v => y0 - h * clamp(v / sMax, 0, 1);
    ctx.strokeStyle = 'rgba(103,232,249,.85)'; ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    hist.forEach(([t, s], i) => { const X = px(t), Y = py(s); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
    ctx.stroke();
    ctx.textAlign = 'right'; ctx.font = mono((cfs - 1) * dpr); ctx.fillStyle = 'rgba(154,167,189,.7)';
    ctx.fillText(sMax.toFixed(2), x0 - 6 * dpr, y0 - h + 4 * dpr);
    ctx.fillText('0', x0 - 6 * dpr, y0 + 4 * dpr);
    ctx.textAlign = 'center';
    ctx.fillText(tMax.toFixed(1), x0 + w - 16 * dpr, y0 + padB * 0.55);
    ctx.fillText('0', x0 - 10 * dpr, y0 + padB * 0.55);
  }

  /* ---------- 序列化 ---------- */
  serialize(){
    return {
      v: 1, preset: this.state.preset, L: this.state.L,
      delta: +this.state.delta.toFixed(3), h: +this.state.h.toFixed(3),
      mode: this.state.mode, tool: this.state.tool, view: this.state.view,
      spins: Array.from(this.state.spins), t: +this.state.t.toFixed(4),
      bz: Array.from(this.state.fieldBase, v => +v.toFixed(3)),
      fieldObjects: this.state.fieldObjects.map(o => ({...o})),
      selectedFieldObject: this.state.selectedFieldObject,
      objectTemplate: {shape:this.state.objectShape,amp:this.state.objectAmp,width:this.state.objectWidth},
      proj: this.state.proj,
      cam: this.state.proj === '3d'
        ? [+this.cam.yaw.toFixed(3), +this.cam.pitch.toFixed(3), +this.cam.dist.toFixed(3)] : undefined,
      paused: !!this.state.paused,
    };
  }
  queryFor(spec){
    const qs = new URLSearchParams();
    qs.set('preset', spec.preset);
    qs.set('L', String(spec.L));
    qs.set('D', String(spec.delta));
    qs.set('h', String(spec.h));
    qs.set('mode', spec.mode);
    if(spec.tool&&spec.tool!=='state')qs.set('tool',spec.tool);
    qs.set('spins', spec.spins.map(s => (s > 0 ? 'u' : 'd')).join(''));
    if (spec.bz && spec.bz.some(v => v !== 0)) qs.set('bz', spec.bz.map(String).join(','));
    if (spec.fieldObjects && spec.fieldObjects.length) qs.set('fo', JSON.stringify(spec.fieldObjects));
    if (spec.view !== 'Sx') qs.set('view', spec.view);
    if (spec.proj === '3d'){
      qs.set('proj', '3d');
      if (spec.cam) qs.set('cam', spec.cam.map(v => +(+v).toFixed(3)).join(','));
    }
    return qs.toString();
  }
  readUrlSpec(q){
    const L = [8, 10, 12, 14, 16].includes(Math.round(parseFloat(q.get('L') || '0'))) ? Math.round(parseFloat(q.get('L'))) : 12;
    const spins = q.get('spins'), bz = q.get('bz'), fo = q.get('fo');
    if (!spins && !bz && !fo) return null;
    const spec = { L };
    if (spins && spins.length === L && /^[ud]+$/.test(spins)) spec.spins = Array.from(spins, c => (c === 'u' ? 1 : -1));
    if (bz){
      const arr = bz.split(',').map(Number);
      if (arr.length === L && arr.every(Number.isFinite)) spec.bz = arr.map(v => clamp(v, -B_VIEW, B_VIEW));
    }
    if(fo){
      try{spec.fieldObjects=spNormalizeFieldObjects(L,JSON.parse(fo));}catch(_){return null;}
    }
    if (!spec.spins && !spec.bz && !spec.fieldObjects) return null;
    const D = parseFloat(q.get('D')), H = parseFloat(q.get('h'));
    if (Number.isFinite(D)) spec.delta = clamp(D, 0, 4);
    if (Number.isFinite(H)) spec.h = clamp(H, 0, 4);
    return spec;
  }
  applySpec(spec, opts = {}){
    if (!spec || typeof spec !== 'object') return false;
    if (spec.delta !== undefined && !Number.isFinite(spec.delta)) return false;
    if (spec.h !== undefined && !Number.isFinite(spec.h)) return false;
    const L = spec.L;
    if (L !== undefined && ![8, 10, 12, 14, 16].includes(L)) return false;
    if (spec.mode !== undefined && !['gs', 'evo'].includes(spec.mode)) return false;
    if (spec.tool !== undefined && !SP_TOOLS.some(v => v.k === spec.tool)) return false;
    if (spec.view !== undefined && !SP_VIEWS.some(v => v.k === spec.view)) return false;
    if (spec.preset !== undefined && !SP_PRESETS[spec.preset]) return false;
    if (spec.spins !== undefined && !(Array.isArray(spec.spins) && spec.spins.length === L && spec.spins.every(v => v === 1 || v === -1))) return false;
    if (spec.bz !== undefined && !(Array.isArray(spec.bz) && spec.bz.length === L && spec.bz.every(Number.isFinite))) return false;
    let normalizedObjects;
    if(spec.fieldObjects!==undefined){try{normalizedObjects=spNormalizeFieldObjects(L,spec.fieldObjects);}catch(_){return false;}}
    /* 投影/相机也走严格校验：proj 未知或 cam 非三个有限数 ⟹ 整份拒绝（错的深链不做半改） */
    if (spec.proj !== undefined && !SP_PROJ.some(v => v.k === spec.proj)) return false;
    if (spec.cam !== undefined && !(Array.isArray(spec.cam) && spec.cam.length === 3 && spec.cam.every(Number.isFinite))) return false;
    /* 只改「怎么看」的 spec（URL 的 proj/cam、导出的 JSON 里带视图）：不动物理、不重解基态，
       否则一次投影切换会把已经解好的 E 扔回 NaN。 */
    const viewOnly = spec.L === undefined && spec.spins === undefined && spec.bz === undefined &&
      spec.fieldObjects === undefined && spec.delta === undefined && spec.h === undefined;
    if (viewOnly){
      if (spec.proj === undefined && spec.cam === undefined) return false;
      if (spec.proj !== undefined) this.state.proj = spec.proj;
      if (spec.cam !== undefined){
        this.cam = { yaw: spec.cam[0], pitch: clamp(spec.cam[1], -1.33, 1.33), dist: clamp(spec.cam[2], 3.2, 20) };
      }
      this.syncPanel(); this.draw();
      return true;
    }
    if (spec.spins === undefined && spec.bz === undefined && spec.fieldObjects === undefined && !opts.fromUrl) return false;
    if (L && L !== this.state.L){
      this.state.L = L;
      this.state.spins = Int8Array.from({ length: L }, (_, i) => (i % 2 === 0 ? 1 : -1));
      this.state.fieldBase = new Float64Array(L);
      this.state.fieldObjects = []; this.state.selectedFieldObject = null;
    }
    if (spec.proj !== undefined) this.state.proj = spec.proj;
    if (spec.cam !== undefined){
      this.cam = { yaw: spec.cam[0], pitch: clamp(spec.cam[1], -1.33, 1.33), dist: clamp(spec.cam[2], 3.2, 20) };
    }
    if (spec.preset !== undefined) this.state.preset = spec.preset;
    if (spec.mode !== undefined) this.state.mode = spec.mode;
    if (spec.tool !== undefined) this.state.tool = spec.tool;
    if (spec.view !== undefined) this.state.view = spec.view;
    if (spec.delta !== undefined) this.state.delta = clamp(spec.delta, 0, 4);
    if (spec.h !== undefined) this.state.h = clamp(spec.h, 0, 4);
    if (spec.bz !== undefined){
      this.state.fieldBase = Float64Array.from(spec.bz);
      if(spec.fieldObjects===undefined)this.state.fieldObjects=[];
    }
    if(spec.fieldObjects!==undefined)this.state.fieldObjects=normalizedObjects.map(o=>({...o}));
    this.state.selectedFieldObject=this.state.fieldObjects.some(o=>o.id===spec.selectedFieldObject)?spec.selectedFieldObject:null;
    if(spec.objectTemplate&&SP_FIELD_SHAPES.includes(spec.objectTemplate.shape)&&Number.isFinite(spec.objectTemplate.amp)&&Number.isFinite(spec.objectTemplate.width)){
      this.state.objectShape=spec.objectTemplate.shape;this.state.objectAmp=clamp(spec.objectTemplate.amp,-B_VIEW,B_VIEW);this.state.objectWidth=clamp(spec.objectTemplate.width,0.5,8);
    }
    if (spec.spins) this.state.spins = Int8Array.from(spec.spins);
    this.state.t = 0; this.state.frames = 0; this.hist = [];
    this.rebuildField(); this.syncObjectPanel();
    let nUp = 0;
    for (let i = 0; i < this.state.L; i++) if (this.state.spins[i] > 0) nUp++;
    this.q('#rDelta').value = String(this.state.delta);
    this.q('#oDelta').textContent = this.state.delta.toFixed(2);
    this.q('#rH').value = String(this.state.h);
    this.q('#oH').textContent = this.state.h.toFixed(2);
    this.rebuildSector(nUp);
    this.state.spins = Int8Array.from(this.state.spins);
    if (this.state.mode === 'gs') this.startSolve();
    else {
      const prod = spProduct(this.sec, Array.from(this.state.spins));
      this.re = prod.re; this.im = prod.im;
      this.measureAll(true);
    }
    this.syncPanel(); this.draw();
    return true;
  }
  copyLink(){
    try {
      const qs = this.queryFor(this.serialize());
      const url = location.origin + location.pathname + '?' + qs;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(
        () => this.toast('链接已复制', 1200), () => this.toast(url.slice(0, 90), 2600));
      else this.toast(url.slice(0, 90), 2600);
      return url;
    } catch (e){ this.toast('复制失败：' + e.message, 2000); return ''; }
  }
  queueUrl(){
    clearTimeout(this._urlTimer);
    this._urlTimer = setTimeout(() => {
      try { history.replaceState(null, '', '?' + this.queryFor(this.serialize())); } catch (_){ /* file:// 忽略 */ }
    }, 420);
  }
  async importJsonFile(file){
    try{
      const spec=JSON.parse(await file.text());
      if(!this.applySpec(spec)){this.toast('JSON 无效或参数越界，当前场景未更改',1800);return false;}
      this.toast('场景 JSON 已导入',1200);this.queueUrl();return true;
    }catch(e){
      this.toast('JSON 导入失败：'+e.message,1800);return false;
    }
  }
  exportJson(){
    const spec = this.serialize();
    spec.obs = {
      E: Number.isFinite(this.E) ? +this.E.toFixed(9) : null,
      EN: Number.isFinite(this.E) ? +(this.E / this.state.L).toFixed(9) : null,
      S: Number.isFinite(this.S) ? +this.S.toFixed(9) : null,
      S2: this.m ? +this.m.S2.toFixed(9) : null,
      sz: this.m ? this.m.sz.map(v => +v.toFixed(9)) : null,
      bond: this.m ? this.m.bond.map(v => +v.toFixed(9)) : null,
      Sq: this.Sq ? Array.from(this.Sq, v => +v.toFixed(9)) : null,
      gap: this.gap == null ? null : +this.gap.toFixed(9),
      residual: this.residual == null ? null : this.residual,
      dim: this.sec ? this.sec.dim : null,
    };
    const txt = JSON.stringify(spec, null, 1);
    try {
      const blob = new Blob([txt], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'spin-L' + spec.L + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      this.toast('已导出 spin-L' + spec.L + '.json', 1400);
    } catch (_){ this.toast(txt.slice(0, 120), 3000); }
    return txt;
  }

  /* ---------- 调试句柄（测试与课程站共用） ---------- */
  debugHandle(){
    return {
      app: this, state: this.state,
      measures: () => ({
        dim: this.sec.dim, E: this.E, EN: this.E / this.state.L, S: this.S,
        S2: this.m ? this.m.S2 : null, sz: this.m ? this.m.sz.slice() : null,
        bond: this.m ? this.m.bond.slice() : null, zz: this.m ? Array.from(this.m.zz) : null,
        mag: this.m ? this.m.mag : null, norm: this.re ? spNorm(this.re, this.im) : null,
        t: this.state.t, frames: this.state.frames, L: this.state.L, delta: this.state.delta,
        h: this.state.h, nUp: this.state.nUp, gap: this.gap,
        residual: this.residual, busy: !!this.job,
      }),
      entropy: () => (this.probeReady() ? spEntropy(this.sec, this.re, this.im, symEigVals) : null),
      entropyAt: cut => (this.probeReady() ? spEntropyAt(this.sec, this.re, this.im, cut, symEigVals) : null),
      profile: () => (this.probeReady() ? Array.from(spEntropyProfile(this.sec, this.re, this.im, symEigVals)) : null),
      structureFactor: () => (this.Sq ? Array.from(this.Sq) : null),
      step: (n = 1) => this.stepFrames(n),
      solveNow: () => this.solveNow(),
      gapNow: () => this.gapNow(),
      setDelta: v => this.setDelta(v),
      setH: v => this.setH(v),
      setL: L => this.setL(L),
      preset: k => this.setPreset(k),
      mode: () => this.state.mode,
      setMode: m => this.applyMode(m),
      tool: () => this.state.tool,
      setTool: k => this.setTool(k),
      view: () => this.state.view,
      setView: k => this.setView(k),
      flip: i => this.flipSite(i, 1),
      paint: (i, v) => this.paintSite(i, v),
      bz: () => Array.from(this.state.bz),
      fieldBase: () => Array.from(this.state.fieldBase),
      fieldObjects: () => this.state.fieldObjects.map(o=>({...o})),
      addFieldObject: (center,props) => this.addFieldObject(center,props),
      moveFieldObject: (id,site) => this.moveFieldObject(id,site),
      selectFieldObject: id => { this.state.selectedFieldObject=id;this.syncObjectPanel();this.draw(); },
      duplicateFieldObject: () => this.duplicateFieldObject(),
      deleteFieldObject: () => this.deleteFieldObject(),
      pat: () => Array.from(this.state.spins),
      fieldSites: () => this.state.bz.filter(v => v !== 0).length,
      hasField: () => this.hasField(),
      clearField: () => this.clearField(false),
      history: () => this.hist.slice(-600),
      siteAtX: x => this.siteAtX(x),
      view3: () => ({ ...this._view }),
      hover: () => this._hover,
      band: which => this.toggleBand(which),
      proj: () => this.state.proj,
      setProj: k => this.setProj(k),
      cam: () => ({ ...(this.cam || hbCamDefault()) }),
      setCam: c => { this.cam = { yaw: +c.yaw, pitch: +c.pitch, dist: +c.dist }; this.draw(); },
      siteAtPt: (x, y) => this.siteAtPt({ x, y }),
      sites3: () => (this._sites3 || []).map(s => ({ i: s.i, x: s.x, y: s.y, k: s.k, depth: s.depth })),
      bandOpen: () => this.bandOpen(),
      spec: () => this.serialize(),
      query: () => this.queryFor(this.serialize()),
      applySpec: s => this.applySpec(s),
      exportJson: () => this.exportJson(),
      mass: () => null,
    };
  }
  unmount(){
    this._listeners.forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
    this._listeners = [];
    window.removeEventListener('error', this._onError);
    if (this._onWinResize) window.removeEventListener('resize', this._onWinResize);
    if (this._ro){ this._ro.disconnect(); this._ro = null; }
  }
}

