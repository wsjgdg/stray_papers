/* ============================================================================
 * two-body.js — R72 双粒子构型空间页（two-body.html 入口）
 *
 * 与主页（QuantumField）的关系：共用 src/core/gl.js（GL 引导/Program/Quad/
 * RG32F 目标）与 src/core/styles.js（CSS 变量与 reset），物理内核为
 * src/physics/twobody.js（CPU 镜像与 GLSL 同源）。主页顶栏有切换入口。
 *
 * 页面语义：场 = |ψ(x₁,x₂)|²（或相位），x₁ 横轴、x₂ 纵轴；对角线 x₁=x₂
 * 是「重合线」（琥珀缝）——反对称态在其上恒零（泡利不相容可视化）。
 * 一阶边缘密度 n₁(x₁)=∫|ψ|²dx₂（下条）与 n₂(x₂)=∫|ψ|²dx₁（右条）：
 * 全同粒子（ε=0）时两条恒等；可区分（ε>0）时分开。
 *
 * KDK 三 pass 结构（与 twobody.js CPU 逐步同构）：
 *   kick1: u[p],v[q] → v[p]   （v += dt/2·H·u）
 *   drift: u[p],v[p] → u[q]   （u += dt·v）
 *   kick2: u[q],v[p] → v[q]   （v += dt/2·H·u）   ⟹ parity 翻转
 * 四个 RG32F 目标（u×2、v×2）NEAREST（stencil 精确性）；显示 pass 手工
 * bilerp 上采样。
 *
 * 调试句柄 window.__tb（cdp72 专用）：measure/readField/step/mirror
 * （页内 CPU 镜像对比）/compareMirror（GPU vs 页内 CPU，页内算完只回传
 * 摘要）/relaxNow。step/mirror 全部确定性接口（不依赖 rAF 时序）。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { injectResponsive } from './core/responsive.js';
import { navHtml } from './core/nav.js';
import { createContext, createProgram, Quad, makeTarget } from './core/gl.js';
import { TB_PRESETS, TB_COMMON, tbMakeWave, tbInitParams, tbInitInfo, tbOrbits, tbKdkStep, tbMeasure, tbRelax, tbPot1, tbPot2, tbMakeVArray, tbFieldHash, TB_FS_KICK, TB_FS_DRIFT, TB_FS_DRAW } from './physics/twobody.js';

/* 页面布局（复用 styles.js 的 :root 变量与 reset；本块只管 two-body 专属结构） */
const TB_CSS = `
  #tbPanel{top:74px;left:14px;width:224px;padding:13px;z-index:10;max-height:calc(100vh - 250px);overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #tbHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:200px;font-family:var(--mono)}
  #tbHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0}
  #tbHud .hrow span:first-child{color:var(--dim)}
  #tbHud .hrow span:last-child{color:var(--txt)}
  #tbHud .hrow span.warn{color:var(--amber)}
  #tbPanel .note{font-size:9.5px;color:var(--dim);line-height:1.5;margin-top:6px}
  #tbHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #tbStage{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:5;
    display:flex;flex-direction:column;align-items:center;gap:5px;--sz:min(62vh,52vw)}
  #tbFieldWrap{position:relative}
  #tbField{display:block;width:var(--sz);height:var(--sz);border-radius:10px;touch-action:none}
  #tbN2{position:absolute;left:calc(100% + 5px);top:0;width:52px;height:var(--sz);display:block}
  #tbN1{width:var(--sz);height:52px;display:block;cursor:crosshair;touch-action:none}
  #tbN2{cursor:crosshair;touch-action:none}
  /* 叠加层：轨道虚线 + 势阱条带。pointer-events:none —— 所有拖拽都在 #tbField 上处理 */
  #tbRails{position:absolute;left:0;top:0;width:var(--sz);height:var(--sz);pointer-events:none;border-radius:10px}
  .tbAxis{font-family:var(--mono);font-size:10.5px;color:var(--dim);position:fixed;z-index:6;pointer-events:none}
  #tbAxX{transform:translateX(-50%)}
  #tbAxY{transform:translateY(-50%) rotate(-90deg);transform-origin:center}
  #tbHint{left:14px;bottom:52px;z-index:10;padding:10px 14px;max-width:330px;font-size:11.5px;
    color:var(--dim);line-height:1.65;max-height:120px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #tbHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:12px}
  #tbToast{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;pointer-events:none;
    font-family:var(--mono);font-size:13px;color:var(--cyan);letter-spacing:.18em;opacity:0;transition:opacity .4s;
    text-shadow:0 0 18px rgba(103,232,249,.8);text-align:center;white-space:pre-line}
  #tbDiag{position:fixed;left:-9999px}
  @media (max-width:1100px){#tbStage{--sz:min(56vh,86vw)}#tbHint{display:none}}
`;

const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const sci = (x, d = 2) => (Number.isFinite(x) ? x.toExponential(d) : '—');

export class TwoBodyApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    this.options = options;
    /* URL 参数（cdp72 确定性加载用）：preset/stats/g/eps/omega/substeps/dt/L/mode/paused */
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const L = Math.round(num('L', 128));
    const preset0 = TB_PRESETS[q.get('preset')] ? q.get('preset') : 'cross';
    const pr0 = TB_PRESETS[preset0];
    this.state = {
      L, preset: preset0, stats: q.get('stats') || 'boson',
      g: num('g', 0), eps: num('eps', 0), omega: num('omega', 0.02),
      /* 初态四个旋钮：缺省跟预设，URL 可覆盖（越界由 tbInitParams 钳制） */
      sigma: num('sigma', pr0.sigma), k0: num('k0', pr0.k0),
      d: num('d', pr0.d), r0: num('r0', pr0.r0),
      /* 自由放置（沿轴点选）的两条轨道中心；缺省摆成对穿预设的两个位置 */
      xa: num('xa', NaN), xb: num('xb', NaN),
      substeps: Math.round(num('substeps', 6)), dt: num('dt', 0.08),
      mode: Math.round(num('mode', 0)), paused: q.get('paused') === '1',
      /* 势阱刷：wells = [{x,w,v}] 共享 1D 轴上的高斯势；wellTool 是「拖拽 = 放/挪势阱」模式 */
      wells: [], wellTool: q.get('welltool') === '1',
      wellV: num('wellv', TB_COMMON.wellV),
      simTime: 0, frames: 0,
    };
    if (!TB_PRESETS[this.state.preset]) this.state.preset = 'cross';
    if (!['boson', 'fermion'].includes(this.state.stats)) this.state.stats = 'boson';
    if (!Number.isFinite(this.state.xa)) this.state.xa = (L - 1) / 2 - TB_PRESETS.cross.d / 2;
    if (!Number.isFinite(this.state.xb)) this.state.xb = (L - 1) / 2 + TB_PRESETS.cross.d / 2;
    this._scale = 400; this._nScale = 16; this._E = null; this._relax = null;
    this._mountT = typeof performance !== 'undefined' ? performance.now() : 0;
    this._field = null; this._m = null; this._baseNorm = null;
    this._listeners = []; this._uloc = new Map();
    this._fps = 0; this._fpsFrames = 0; this._lastFpsT = performance.now();
    this._onError = e => {
      const d = this.q('#tbDiag');
      if (d) d.textContent = 'ERR ' + e.message;
      document.title = 'ERR ' + e.message;
    };
    window.addEventListener('error', this._onError);
    this.frame = this.frame.bind(this);
  }

  q(s){ return this.container.querySelector(s); }
  on(t, type, fn, opts){ t.addEventListener(type, fn, opts); this._listeners.push([t, type, fn, opts]); }
  u(prog, name){
    let m = this._uloc.get(prog);
    if (!m){ m = new Map(); this._uloc.set(prog, m); }
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(prog, name));
    return m.get(name);
  }
  toast(msg, ms = 2200){
    const t = this.q('#tbToast');
    if (!t) return;
    t.textContent = msg; t.style.opacity = 1;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.style.opacity = 0; }, ms);
  }

  /* ---------- 挂载 ---------- */
  mount(){
    injectStyles();
    injectResponsive();
    const st = document.createElement('style');
    st.id = 'tb-styles'; st.textContent = TB_CSS;
    document.head.appendChild(st);
    this.buildDOM();
    this.canvas = this.q('#tbField');
    const { gl, error } = createContext(this.canvas);
    if (!gl){ this.fail(error); return this; }
    this.gl = gl;
    try {
      this.quad = new Quad(gl);
      this.initPrograms();
      this.initTargets();
      this.bindUI();
      /* 初次加载沿用 URL 参数（不重置 g/eps/omega），但初态四旋钮要先钳制：
         走 applyInit ⟹ 面板显示的 σ/k₀/d/r₀ 与真正送进引擎的值逐位相同。 */
      this.applyInit();
      this.syncWellHud();
      this.syncBuildBadge();            /* 势阱 HUD / 势阱刷按钮文案与 state 对齐 */
      this.resize();
      requestAnimationFrame(this.frame);
    } catch (err){
      this.fail((err && err.message) || String(err));
      return this;
    }
    window.__tb = this.debugHandle();
    return this;
  }

  fail(msg){
    const d = this.q('#tbDiag');
    if (d) d.textContent = 'ERR ' + msg;
    document.title = 'ERR ' + msg;
    /* 控件禁用：GL 缺失时任何点击/输入都不应有动作（曾有此坑——见 worklog R97：
       buildDOM 先接线后取 gl，失败后点预设抛 TypeError 而非优雅报错）。 */
    this.container.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
    const c = this.q('#tbField');
    if (c){
      const ctx = c.getContext('2d');
      if (ctx){ ctx.fillStyle = '#04060c'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#fbbf24'; ctx.font = '13px monospace';
        ctx.fillText('WebGL2 初始化失败: ' + msg, 16, 28); }
    }
  }

  /* ---------- DOM ---------- */
  buildDOM(){
    const pr = TB_PRESETS;
    this.container.innerHTML = `
<div id="tbTop" class="panel qtop">
  <div class="logo">双粒子工场 · TWO-BODY</div>
  <div class="eq"><b>i</b>ℏ∂ψ/∂t = [−ℏ²/2m(∂₁²+∂₂²)+V₁+V₂+<b>g</b>δ]ψ</div>
  ${navHtml('./two-body.html', '  ')}
</div>
<div id="tbPanel" class="panel qpanel">
  <div class="sec"><h3>预设</h3><div class="grid2" id="tbPresets">
    ${Object.keys(pr).map(k => '<button data-preset="' + k + '">' + pr[k].name + '</button>').join('')}
  </div></div>
  <div class="sec"><h3>统计（交换对称）</h3><div class="grid2">
    <button id="tbBoson" class="on">玻色子 +</button><button id="tbFermion">费米子 −</button>
  </div></div>
  <div class="sec" id="tbInitSec"><h3>初态（波包）</h3>
    <div class="row" id="rowSigma"><label>宽度 σ</label><input type="range" id="rSigma" min="1.5" max="21" step="0.1" value="6.5"><output id="oSigma">6.5</output></div>
    <div class="row" id="rowK0"><label>动量 k₀</label><input type="range" id="rK0" min="0" max="0.8" step="0.01" value="0.25"><output id="oK0">0.25</output></div>
    <div class="row" id="rowD"><label>间距 d</label><input type="range" id="rD" min="4" max="120" step="1" value="52"><output id="oD">52</output></div>
    <div class="row" id="rowR0"><label>释放 r₀</label><input type="range" id="rR0" min="1" max="60" step="1" value="26"><output id="oR0">26</output></div>
    <div class="note" id="tbInitNote">拖任一滑块 ⟹ 按当前统计重发波包（t 归零）；被钳制的量会写回滑块，面板不报假数。<br><b>在 x₁ / x₂ 边缘密度条上点一下</b>（或按住拖动）⟹ 给该粒子放轨道，自动切到「自由放置」。</div>
  </div>
  <div class="sec" id="tbWellSec"><h3>势阱（共享 1D 轴）</h3>
    <div class="row"><label>深度 V₀</label><input type="range" id="rWellV" min="-8" max="8" step="0.5" value="-4"><output id="oWellV">-4.0</output></div>
    <div class="grid2" style="margin-top:6px">
      <button id="tbWell" style="grid-column:1/3">势阱刷：关</button>
      <button id="tbWellClear" style="grid-column:1/3">清空势阱</button>
    </div>
    <div class="note">负 = 阱 · 正 = 垒 · 右键删。势在共享 1D 轴上，画面里成对出现（底边给 x₁、左边给 x₂）。</div>
  </div>
  <div class="sec"><h3>参数</h3>
    <div class="row"><label>接触 g</label><input type="range" id="rG" min="0" max="40" step="0.5" value="0"><output id="oG">0.0</output></div>
    <div class="row"><label>可区分 ε</label><input type="range" id="rEps" min="0" max="0.6" step="0.02" value="0"><output id="oEps">0.00</output></div>
    <div class="row"><label>阱频 ω</label><input type="range" id="rOm" min="0.005" max="0.08" step="0.001" value="0.02"><output id="oOm">0.020</output></div>
    <div class="row"><label>积分子步</label><input type="range" id="rSub" min="1" max="16" step="1" value="6"><output id="oSub">6</output></div>
  </div>
  <div class="sec"><h3>操作</h3><div class="grid2">
    <button id="tbPause">暂停</button><button id="tbStep">单步</button>
    <button id="tbReset">重置</button><button id="tbRelax">松弛</button>
    <button id="tbMode" style="grid-column:1/3">显示：密度</button>
  </div></div>
</div>
<div id="tbHud" class="panel qhud">
  <div class="hrow"><span>⟨P⟩ 交换期望</span><span id="hExch">—</span></div>
  <div class="hrow"><span>‖ψ‖² / 初值</span><span id="hNorm">—</span></div>
  <div class="hrow"><span>对角质量</span><span id="hDiag">—</span></div>
  <div class="hrow"><span>对角峰值</span><span id="hDiagMax">—</span></div>
  <div class="hrow"><span>max|n₁−n₂|</span><span id="hDn">—</span></div>
  <div class="hrow"><span>初态</span><span id="hInit">—</span></div>
  <div class="hrow"><span>轨道重叠 / HBT</span><span id="hOv">—</span></div>
  <div class="hrow"><span>边缘留白</span><span id="hFit">—</span></div>
  <div class="hrow"><span>势阱</span><span id="hWells">0 个</span></div>
  <hr>
  <div class="hrow"><span>E（离散）</span><span id="hE">—</span></div>
  <div class="hrow"><span>t / 帧</span><span id="hT">—</span></div>
  <div class="hrow"><span>fps</span><span id="hFps">—</span></div>
  <hr>
  <div class="hrow"><span>探针 (x₁,x₂)</span><span id="hProbe">—</span></div>
  <div class="hrow"><span>构建</span><span id="hBuild">—</span></div>
</div>
<div id="tbStage" class="qstage">
  <div id="tbFieldWrap">
    <canvas id="tbField"></canvas>
    <canvas id="tbRails"></canvas>
    <canvas id="tbN2"></canvas>
  </div>
  <canvas id="tbN1"></canvas>
</div>
<div class="tbAxis" id="tbAxX">x₁ →</div>
<div class="tbAxis" id="tbAxY">x₂ →</div>
<div id="tbHint" class="panel qhint"><b></b><span></span></div>
<div id="tbToast"></div>
<div id="tbDiag"></div>`;
  }

  /* 控件接线：仅在 GL 就绪后调用（与主页 app.js 的 bindUI 同序）——
     R97 前接线在 buildDOM 内（先接线后取 gl），GL 创建失败时控件仍活着，
     点预设直接抛 TypeError（读 undefined.bindTexture）。现在失败路径压根
     没有监听器，双保险（fail() 还会禁用控件）。 */
  bindUI(){
    this.container.querySelectorAll('[data-preset]').forEach(b =>
      this.on(b, 'click', () => this.loadPreset(b.dataset.preset, this.state.stats, true)));
    this.on(this.q('#tbBoson'), 'click', () => this.setStats('boson'));
    this.on(this.q('#tbFermion'), 'click', () => this.setStats('fermion'));
    this.on(this.q('#tbPause'), 'click', () => this.togglePause());
    this.on(this.q('#tbStep'), 'click', () => this.stepFrames(1));
    this.on(this.q('#tbReset'), 'click', () => this.resetWave());
    this.on(this.q('#tbRelax'), 'click', () => this.startRelax());
    this.on(this.q('#tbMode'), 'click', () => this.toggleMode());
    this.on(this.q('#tbWell'), 'click', () => this.toggleWellTool());
    this.on(this.q('#tbWellClear'), 'click', () => {
      if (this.clearWells()) this.toast('已清空势阱');
    });
    /* 滑块：g/eps/子步只改 uniform（即时生效，不重置演化）；ω 在 eigen 预设下
       改变解析初态 ⟹ 重发波包（保留其他参数），trap 预设下只改 uniform。 */
    const bind = (id, key, outId, fmt, after) => {
      const el = this.q(id), out = this.q(outId);
      this.on(el, 'input', () => {
        this.state[key] = parseFloat(el.value);
        if (out) out.textContent = fmt(this.state[key]);
        if (after) after();
      });
    };
    /* 初态四旋钮：先过 tbInitParams 钳制，再写回 state/滑块，最后重发波包。
       —— 面板显示的必须是**实际生效**的值（R129 的教训：面板报的数要与真实一致）。 */
    const initBind = (id, key) => {
      const el = this.q(id);
      this.on(el, 'input', () => {
        this.state[key] = parseFloat(el.value);
        this.applyInit();
      });
    };
    initBind('#rSigma', 'sigma');
    initBind('#rK0', 'k0');
    initBind('#rD', 'd');
    initBind('#rR0', 'r0');

    bind('#rG', 'g', '#oG', v => v.toFixed(1));
    bind('#rEps', 'eps', '#oEps', v => v.toFixed(2));
    bind('#rOm', 'omega', '#oOm', v => v.toFixed(3),
      () => { if (this.state.preset === 'eigen') this.loadPreset('eigen', this.state.stats, false); });
    bind('#rSub', 'substeps', '#oSub', v => String(v | 0));
    /* 阱深：改的是「之后放的阱」，已放的阱保留原深度（免得拖滑块把全部阱一起改深） */
    bind('#rWellV', 'wellV', '#oWellV', v => v.toFixed(1), () => this.syncWellHud());
    /* 沿轴点选：x₁ 条（下方，横）⟹ 粒子 1；x₂ 条（右侧，竖）⟹ 粒子 2。
       pointerdown 立即落点，按住拖动连续挪（与主页「拖拽发射」同手感）。 */
    const bindPick = (id, which, horiz) => {
      const cv = this.q(id);
      let dragging = false;
      const pick = ev => {
        const r = cv.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const t = horiz
          ? (ev.clientX - r.left) / r.width
          : 1 - (ev.clientY - r.top) / r.height;
        this.placeOrbit(which, t * this.state.L - 0.5);
      };
      this.on(cv, 'pointerdown', ev => {
        ev.preventDefault();
        dragging = true;
        try { if (cv.setPointerCapture && ev.pointerId !== undefined) cv.setPointerCapture(ev.pointerId); } catch (_){}
        pick(ev);
      });
      this.on(cv, 'pointermove', ev => { if (dragging) pick(ev); });
      const stop = () => { dragging = false; };
      this.on(cv, 'pointerup', stop);
      this.on(cv, 'pointercancel', stop);
      this.on(cv, 'pointerleave', stop);
    };
    bindPick('#tbN1', 0, true);
    bindPick('#tbN2', 1, false);

    /* ---------- 画布上的拖拽（这才是用户会去拖的地方）----------
       两种模式：
         ① 轨道模式（默认）：抓住 x₁ 竖虚线 ⟹ 挪粒子 1 的轨道；抓住 x₂ 横虚线 ⟹ 挪粒子 2。
         ② 势阱刷模式：拖空白处新增势阱并立即拖到想要的位置；拖已有势阱 ⟹ 挪它；右键删。
       抓取带按**屏幕像素**算（26px），不按 texel 算——否则网格一变手感全变。
       按下即 setPointerCapture：拖到画布外也不会丢事件（首版没有它，指针一离开细条就断，
       这正是「移不动」最可能的直接原因之一）。 */
    const texelOf = ev => {
      const r = this.q('#tbField').getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return {
        i: (ev.clientX - r.left) / r.width * this.state.L,
        j: (1 - (ev.clientY - r.top) / r.height) * this.state.L,
        px: this.state.L / r.width,
      };
    };
    const capture = (el, ev) => {
      try { if (el.setPointerCapture && ev.pointerId !== undefined) el.setPointerCapture(ev.pointerId); } catch (_){}
    };
    const field = this.q('#tbField');
    this.on(field, 'pointerdown', ev => {
      const t = texelOf(ev);
      if (!t) return;
      if (this.state.wellTool){
        ev.preventDefault();
        const near = this.nearestWell(t.i);
        const tol = Math.max(TB_COMMON.wellW, 2.5 * t.px);
        let idx;
        if (near.idx >= 0 && near.dist <= tol){
          idx = near.idx;
        } else {
          idx = this.addWell(t.i);
          this.state.wells[idx].v = this.state.wellV;
        }
        this._drag = { kind: 'well', idx };
      } else {
        const o = tbOrbits(this.state.L, this.state.preset, this.initOpts());
        if (TB_PRESETS[this.state.preset] && TB_PRESETS[this.state.preset].eigen){
          this.toast('本征态没有「包心」可拖：先切到对穿或自由放置');
          return;
        }
        const tol = 26 * t.px;
        const di = Math.abs(t.i - o.xa), dj = Math.abs(t.j - o.xb);
        if (Math.min(di, dj) > tol){
          this.toast('拖边缘的小柄挪轨道 · 或用「势阱刷」放势阱');
          return;
        }
        ev.preventDefault();
        this._drag = { kind: 'orbit', which: di <= dj ? 0 : 1 };
      }
      capture(field, ev);
      this._dragApply(t);
      this.drawRails();
    });
    this.on(field, 'pointermove', ev => {
      if (!this._drag) return;
      const t = texelOf(ev);
      if (t) { this._dragApply(t); }
    });
    const endDrag = ev => {
      if (!this._drag) return;
      this._drag = null;
      try { if (field.releasePointerCapture && ev && ev.pointerId !== undefined) field.releasePointerCapture(ev.pointerId); } catch (_){}
      this.drawRails();
    };
    this.on(field, 'pointerup', endDrag);
    this.on(field, 'pointercancel', endDrag);
    window.addEventListener('pointerup', endDrag);
    /* 右键删势阱（势阱刷模式下） */
    this.on(field, 'contextmenu', ev => {
      if (!this.state.wellTool) return;
      const t = texelOf(ev);
      if (!t) return;
      const near = this.nearestWell(t.i);
      if (near.idx >= 0 && near.dist <= Math.max(TB_COMMON.wellW, 2.5 * t.px)){
        ev.preventDefault();
        this.removeWell(near.idx);
        this.drawRails();
        this.toast('已删除势阱');
      }
    });

    /* 悬停探针：报告 texel 坐标与 |ψ(i,j)|²、|ψ(j,i)|²（交换结构直接可见） */
    this.on(this.q('#tbField'), 'pointermove', ev => {
      if (!this._field) return;
      const r = ev.target.getBoundingClientRect();
      const i = Math.floor((ev.clientX - r.left) / r.width * this.state.L);
      const j = Math.floor((1 - (ev.clientY - r.top) / r.height) * this.state.L);
      if (i < 0 || j < 0 || i >= this.state.L || j >= this.state.L) return;
      const L = this.state.L, k = 2 * (j * L + i), kk = 2 * (i * L + j);
      const p = this._field[k] * this._field[k] + this._field[k + 1] * this._field[k + 1];
      const p2 = this._field[kk] * this._field[kk] + this._field[kk + 1] * this._field[kk + 1];
      this.q('#hProbe').textContent = `(${i},${j}) ${sci(p)} | ${sci(p2)}`;
    });
    this.on(window, 'resize', () => this.resize());
    /* 布局尺寸可能晚于 mount 落定（--sz 依赖 vh/vw + 字体度量）：observe 初次回调
       即校正缓冲尺寸。元素尺寸由 CSS 固定，改 canvas.width 不会反向触发循环。 */
    if (window.ResizeObserver){
      this._ro = new ResizeObserver(() => { if (this.q('#tbField').clientWidth > 0) this.resize(); });
      this._ro.observe(this.q('#tbField'));
    }
  }

  initPrograms(){
    this.progKick = createProgram(this.gl, TB_FS_KICK);
    this.progDrift = createProgram(this.gl, TB_FS_DRIFT);
    this.progDraw = createProgram(this.gl, TB_FS_DRAW);
  }
  initTargets(){
    const { gl } = this, L = this.state.L;
    /* 状态纹理只两张（ping-pong）：RG32F 的 .xy = (Reψ, Imψ)，kick 改 .y、
       drift 改 .x——与引擎 psiA/psiB 同构（无独立"速度"纹理）。 */
    const mk = () => makeTarget(gl, L, L, gl.RG32F, gl.RG, gl.NEAREST);
    this.psi = [mk(), mk()];
    /* 势场纹理（CPU 烘焙 tbPot1/tbPot2 + 接触项，shader 只采样——单源真值） */
    this.potTex = makeTarget(gl, L, L, gl.R32F, gl.RED, gl.NEAREST);
    this._potSig = '';
    this.parity = 0;
    this._readBuf = new Float32Array(2 * L * L);
  }
  /* 势场烘焙：签名变化才重算（拖滑块时每帧一次，O(L²) 加法，~10μs） */
  bakePot(){
    const L = this.state.L, P = this.params();
    const wsig = (P.wells || []).map(w => w.x.toFixed(2) + ':' + w.v.toFixed(2)).join(',');
    const sig = [this.state.preset, P.trap, P.omega, P.eps, P.g, L, wsig].join('|');
    if (sig === this._potSig) return false;
    const p1 = new Float64Array(L), p2 = new Float64Array(L);
    for (let i = 0; i < L; i++){ p1[i] = tbPot1(i, P); p2[i] = tbPot2(i, P); }
    const V = new Float32Array(L * L);
    let vmax = 0;
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++){
      const v = p1[i] + p2[j] + (i === j ? P.g : 0);
      V[j * L + i] = v;
      if (Math.abs(v) > vmax) vmax = Math.abs(v);
    }
    this._vmax = vmax;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.potTex.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, L, L, 0, gl.RED, gl.FLOAT, V);
    this._potSig = sig;
    return true;
  }
  resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sz = this.q('#tbField').clientWidth || 480;
    this.canvas.width = Math.round(sz * dpr); this.canvas.height = Math.round(sz * dpr);
    const rails = this.q('#tbRails');
    if (rails){ rails.width = Math.round(sz * dpr); rails.height = Math.round(sz * dpr); }
    const n1 = this.q('#tbN1'), n2 = this.q('#tbN2');
    n1.width = Math.round(sz * dpr); n1.height = Math.round(52 * dpr);
    n2.width = Math.round(52 * dpr); n2.height = Math.round(sz * dpr);
    /* 轴标签定位（随舞台尺寸） */
    const r = this.q('#tbFieldWrap').getBoundingClientRect();
    const ax = this.q('#tbAxX'), ay = this.q('#tbAxY');
    ax.style.left = (r.left + r.width / 2) + 'px'; ax.style.top = (r.bottom + 40) + 'px';
    ay.style.left = (r.right + 62) + 'px'; ay.style.top = (r.top + r.height / 2) + 'px';
  }

  /* ---------- 预设 / 统计 ---------- */
  syncPanel(){
    const pr = TB_PRESETS[this.state.preset];
    this.container.querySelectorAll('[data-preset]').forEach(b =>
      b.classList.toggle('on', b.dataset.preset === this.state.preset));
    this.q('#tbBoson').classList.toggle('on', this.state.stats === 'boson');
    this.q('#tbFermion').classList.toggle('on', this.state.stats === 'fermion');
    this.q('#rG').value = this.state.g; this.q('#oG').textContent = this.state.g.toFixed(1);
    this.q('#rEps').value = this.state.eps; this.q('#oEps').textContent = this.state.eps.toFixed(2);
    this.q('#rOm').value = this.state.omega; this.q('#oOm').textContent = this.state.omega.toFixed(3);
    this.q('#rSub').value = this.state.substeps; this.q('#oSub').textContent = String(this.state.substeps);
    this.q('#rOm').disabled = !pr.trap;
    this.q('#rOm').style.opacity = pr.trap ? 1 : 0.4;
    /* 初态四旋钮：按预设显隐（eigen 不用它们；k₀ 只对自由对穿有意义；
       d 只对自由对穿、r₀ 只对阱中对穿） */
    const show = (id, on) => { const el = this.q(id); if (el) el.style.display = on ? '' : 'none'; };
    show('#rowSigma', !pr.eigen);
    show('#rowK0', !pr.eigen && (!!pr.custom || !pr.trap));
    show('#rowD', !pr.eigen && !pr.trap && !pr.custom);
    show('#rowR0', !pr.eigen && !!pr.trap && !pr.custom);
    show('#tbInitNote', !pr.eigen);
    if (!pr.eigen){
      const L = this.state.L;
      this.q('#rSigma').max = Math.max(1.5, (L - 1) / 6).toFixed(1);
      this.q('#rD').max = String(Math.round((L - 1) - 3.0));
      this.q('#rR0').max = String(Math.round((L - 1) / 2));
      this.q('#rSigma').value = this.state.sigma; this.q('#oSigma').textContent = this.state.sigma.toFixed(1);
      this.q('#rK0').value = this.state.k0; this.q('#oK0').textContent = this.state.k0.toFixed(2);
      this.q('#rD').value = this.state.d; this.q('#oD').textContent = String(Math.round(this.state.d));
      this.q('#rR0').value = this.state.r0; this.q('#oR0').textContent = String(Math.round(this.state.r0));
    }
    /* HUD：初态 / 轨道重叠 / 边缘留白（全部来自 tbInitInfo 同一份轨道） */
    const info = tbInitInfo(this.state.L, this.state.preset, this.initOpts());
    this._info = info;
    const hInit = this.q('#hInit'), hOv = this.q('#hOv'), hFit = this.q('#hFit');
    if (hInit) hInit.textContent = info.eigen
      ? `本征态 · ω=${info.omega.toFixed(3)}`
      : info.custom
        ? `放置 x₁=${info.xa.toFixed(0)} · x₂=${info.xb.toFixed(0)} · σ=${info.sigma.toFixed(1)}`
        : `σ=${info.sigma.toFixed(1)} · k₀=${info.ka.toFixed(2)} · ${pr.trap ? 'r₀' : 'd'}=${Math.round(info.sep)}`;
    if (hOv) hOv.textContent = `${info.overlap < 1e-4 ? info.overlap.toExponential(1) : info.overlap.toFixed(4)} · HBT ${info.hbt.toFixed(3)}`;
    if (hFit && info.margin !== null){
      hFit.textContent = `${info.margin.toFixed(1)} px`;
      hFit.className = info.margin < 0 ? 'warn' : '';
      hFit.title = info.margin < 0
        ? '留白 < 0 ⟹ 波包 3σ 尾部已越过边界；CLAMP_TO_EDGE 会把它反射回来（诚实限制②）'
        : '两包中心到最近边界再减 3σ；>0 表示 3σ 尾部还在场内';
    } else if (hFit){ hFit.textContent = '—'; hFit.className = ''; }
    this.syncWellHud();
    this.q('#tbHint').querySelector('b').textContent = pr.name;
    this.q('#tbHint').querySelector('span').innerHTML = pr.text;
    this.q('#tbMode').textContent = '显示：' + (this.state.mode ? '相位' : '密度');
  }
  /* 参数快照（CPU 镜像与 GPU uniform 同源） */
  params(){
    const pr = TB_PRESETS[this.state.preset], L = this.state.L;
    return {
      uK: 0.5, g: this.state.g, eps: this.state.eps, trap: pr.trap ? 1 : 0,
      omega: this.state.omega, bumpH: TB_COMMON.bumpH, bumpW: TB_COMMON.bumpW,
      vcap: TB_COMMON.vcap, xc: (L - 1) / 2, L,
      wells: this.state.wells,
    };
  }
  /* resetParams=true 仅在点预设按钮时（切场景恢复该预设默认参数）；
     URL 初次加载 / 统计切换 / ω 拖动均保持当前参数。 */
  loadPreset(key, stats, resetParams = false){
    const pr = TB_PRESETS[key] || TB_PRESETS.cross;
    if (resetParams && !pr.eigen){
      this.state.sigma = pr.sigma; this.state.k0 = pr.k0;
      this.state.d = pr.d; this.state.r0 = pr.r0;
    }
    const w = tbMakeWave(this.state.L, key, this.initOpts({ stats }));
    if (w.norm < 1e-9){
      this.toast('泡利不相容：两个费米子不能占据同一单粒子态');
      return false;
    }
    this.state.preset = key; this.state.stats = stats;
    if (resetParams){
      this.state.g = pr.g; this.state.eps = pr.eps; this.state.omega = pr.omega;
    }
    this._init = { re: w.re, im: w.im };
    this.state.simTime = 0; this.state.frames = 0; this._E = null;
    this.upload(w.re, w.im);
    this.syncPanel();
    this.bakePot();
    this.refreshMeasure();
    return true;
  }
  /* 初态参数对象（唯一一份）：重发 / HUD / 调试句柄都从这里取，避免手抄漏项。
     custom 预设多两个位置字段（xa/xb），其它预设多传也无害（tbInitParams 只取认识的）。 */
  initOpts(patch){
    return {
      stats: this.state.stats, omega: this.state.omega,
      sigma: this.state.sigma, k0: this.state.k0,
      d: this.state.d, r0: this.state.r0,
      xa: this.state.xa, xb: this.state.xb,
      ...(patch || {}),
    };
  }
  /* 初态参数（σ/k₀/d/r₀）变更的统一入口：
     ① 过 tbInitParams 钳制（越界就收进合法区间，绝不把越界值送进引擎）；
     ② 写回 state 与滑块位置（面板不报假数）；
     ③ 按当前统计重发波包（loadPreset 会同步面板 + 重烘势场 + 重新测量）；
     ④ 留白 < 0 时如实告警（包尾被 CLAMP 边界切，这是限制不是 bug）。 */
  applyInit(){
    const L = this.state.L, key = this.state.preset;
    const q = tbInitParams(L, key, this.initOpts());
    if (!q.eigen){
      this.state.sigma = q.sigma; this.state.k0 = q.k0;
      this.state.d = q.d; this.state.r0 = q.r0;
      if (q.custom){ this.state.xa = q.xa; this.state.xb = q.xb; }
    }
    const ok = this.loadPreset(key, this.state.stats, false);
    const info = tbInitInfo(L, key, this.initOpts());
    if (ok && info.margin !== null && info.margin < 0){
      this.toast('波包太宽 / 间距太大：尾部被边界截断（留白 ' + info.margin.toFixed(1) + '）');
    }
    return info;
  }
  /* ---------- 势阱刷 ----------
     势是**共享 1D 轴**上的可分离势：加一个阱 = 在 x₀ 处放一个高斯（v<0 阱 / v>0 垒），
     粒子 1 看到 V₁(x₁)、粒子 2 看到 (1+ε)·V₁(x₂) ⟹ ε=0 时两支完全同形、[H,P]=0 不被破坏
     （这正是本页不提供「自由 2D 涂抹」的原因：2D 涂抹必然让 V₁≠V₂、⟨P⟩ 无故漂移）。
     画面上因此总是**成对**出现：竖条（x₁ = x₀）+ 横条（x₂ = x₀）。 */
  addWell(x){
    const L = this.state.L;
    const xi = Math.min(L - 1, Math.max(0, x));
    if (this.state.wells.length >= TB_COMMON.wellMax) this.state.wells.shift();
    this.state.wells.push({ x: xi, w: TB_COMMON.wellW, v: this.state.wellV });
    this._drag = { kind: 'well', idx: this.state.wells.length - 1 };   /* 新放的阱立刻高亮可拖 */
    this.bakePot(); this.drawRails(); this.syncWellHud();
    return this.state.wells.length - 1;
  }
  moveWell(k, x){
    const w = this.state.wells[k];
    if (!w) return false;
    w.x = Math.min(this.state.L - 1, Math.max(0, x));
    this.bakePot(); this.drawRails(); this.syncWellHud();
    return true;
  }
  removeWell(k){
    if (!this.state.wells[k]) return false;
    this.state.wells.splice(k, 1);
    this.bakePot(); this.drawRails(); this.syncWellHud();
    return true;
  }
  clearWells(){
    if (!this.state.wells.length) return false;
    this.state.wells = [];
    this.bakePot(); this.drawRails(); this.syncWellHud();
    return true;
  }
  nearestWell(x){
    let best = -1, bd = Infinity;
    this.state.wells.forEach((w, k) => { const d = Math.abs(w.x - x); if (d < bd){ bd = d; best = k; } });
    return { idx: best, dist: bd };
  }
  /* 构建徽标：document.lastModified 在 no-store 下就是文件真实修改时间。
     如果你看到的仍是旧时间，说明**页面本身还是旧的**（缓存/标签页没重载），不是功能没写。
     同时把能力写成 body 的 data-* 标记，方便在控制台一行确认：
       document.body.dataset.features  → "rails,wellbrush,pick" */
  syncBuildBadge(){
    const el = this.q('#hBuild');
    const stamp = (document.lastModified || '').replace(/^\w{3} /, '').replace(/ GMT.*$/, '');
    const feats = 'rails,wellbrush,pick';
    document.body.dataset.features = feats;
    document.body.dataset.tbBuild = stamp;
    if (el) el.textContent = `${stamp} · 轨道✓ 势阱✓`;
  }
  syncWellHud(){
    const h = this.q('#hWells');
    if (h) h.textContent = this.state.wells.length
      ? `${this.state.wells.length} 个 · V₀=${this.state.wellV.toFixed(1)}`
      : '0 个（点「势阱刷」后在画布上拖）';
    const b = this.q('#tbWell');
    if (b){ b.textContent = '势阱刷：' + (this.state.wellTool ? '开' : '关'); b.classList.toggle('on', !!this.state.wellTool); }
  }
  /* 叠加层：轨道虚线（可抓）+ 势阱条带。势场本身不在 GLSL 里画（shader 只画 |ψ|²/相位），
     所以「看得见势」这件事必须由这一层负责。 */
  /* ---------- 叠加层：轨道握把 + 势阱剖面 ----------
     设计原则：**不挡波函数**。所以
       · 轨道只用一根 1px 极淡虚线作「引导」，真正的手柄是贴着边缘的小圆角柄（看得见、好抓）；
       · 势阱不再画成整条色块，而是 ①场内极淡的高斯渐变带 + ②贴在底边/左边的**势能剖面曲线**
         （量子教材里 1D 势的标准画法），正为垒向上、负为阱向下，ε>0 时左边那条按 (1+ε) 画高；
       · 引导提示只在**首次 9 秒**或**势阱刷打开时**出现，之后淡出，不长期占画面。 */
  drawRails(){
    const cv = this.q('#tbRails');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height, L = this.state.L;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.clearRect(0, 0, W, H);
    if (!W || !H) return;
    const px = W / L;
    const has = k => typeof ctx[k] === 'function';
    const f = v => Math.round(v * 100) / 100;                 /* 少写字，减少 canvas 状态变更 */

    /* 圆角矩形路径（不用 roundRect：老 Safari 没有） */
    const rrect = (x, y, w, h, r) => {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      if (has('arc')){
        ctx.moveTo(x + rr, y);
        ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
        ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
        ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
        ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
        ctx.closePath();
      } else {
        ctx.rect(x, y, w, h);
      }
    };
    /* 带暗色描边的文字：叠在亮波函数上也读得清 */
    const label = (txt, x, y, col, align = 'center', size = 9.5 * dpr) => {
      ctx.font = `${f(size)}px ui-monospace,SFMono-Regular,Menlo,monospace`;
      ctx.textAlign = align;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = 'rgba(4,8,16,.82)';
      if (has('strokeText')) ctx.strokeText(txt, x, y);
      ctx.fillStyle = col;
      ctx.fillText(txt, x, y);
    };

    /* ---------- ① 势阱：场内**不常驻**色带（会糊住波函数）；只在拖动/势阱刷时高亮 ---------- */
    const wells = this.state.wells;
    const hotWell = this._drag && this._drag.kind === 'well' ? this._drag.idx : -1;
    if (wells.length){
      wells.forEach((w, k) => {
        const neg = w.v < 0;
        const rgb = neg ? '96,178,250' : '250,190,96';
        const sig = Math.max(2 * dpr, w.w * px * 0.85);
        const hw = sig * 1.45;
        const cx = (w.x + 0.5) * px, cy = H - (w.x + 0.5) * px;
        /* 边缘刻度：顶边（x₁ 轴）与右边（x₂ 轴）各一个 7px 小刻度，给出位置而无色块 */
        const tick = (col) => {
          ctx.strokeStyle = `rgba(${rgb},.5)`;
          ctx.lineWidth = 1.4 * dpr;
          ctx.beginPath();
          ctx.moveTo(cx, 0); ctx.lineTo(cx, 7 * dpr);
          ctx.moveTo(W, cy); ctx.lineTo(W - 7 * dpr, cy);
          ctx.stroke();
        };
        tick();
        /* 高亮：正在拖这个阱（或势阱刷开着且是最后一个）时，才画一层柔和色带 */
        const hot = k === hotWell || (this.state.wellTool && k === wells.length - 1);
        if (hot){
          const peak = Math.min(0.16, 0.06 + Math.abs(w.v) / 8 * 0.08);
          const band = (x0, y0, x1, y1) => {
            let g = null;
            if (has('createLinearGradient')){
              try { g = ctx.createLinearGradient(x0, y0, x1, y1); } catch (_){ g = null; }
            }
            if (g && typeof g.addColorStop === 'function'){
              g.addColorStop(0, `rgba(${rgb},0)`);
              g.addColorStop(0.5, `rgba(${rgb},${f(peak)})`);
              g.addColorStop(1, `rgba(${rgb},0)`);
              ctx.fillStyle = g;
            } else ctx.fillStyle = `rgba(${rgb},${f(peak * 0.6)})`;
          };
          band(cx - hw, 0, cx + hw, 0);
          ctx.fillRect(cx - hw, 0, 2 * hw, H);
          band(0, cy - hw, 0, cy + hw);
          ctx.fillRect(0, cy - hw, W, 2 * hw);
        }
        /* 深度小标：贴在带子顶端 / 右端（负=阱 冷色，正=垒 暖色） */
        const tag = (neg ? '−' : '+') + Math.abs(w.v).toFixed(1);
        label(tag, cx, 15 * dpr, `rgba(${rgb},.72)`, 'center', 8 * dpr);
        label(tag, W - 10 * dpr, cy - 4 * dpr, `rgba(${rgb},.72)`, 'right', 8 * dpr);
      });
      /* ---------- ② 势能剖面：只在最外侧 24px 内画，作「教材式」提示 ---------- */
      const inset = 24 * dpr;
      let vmax = 1e-9;
      for (const w of wells) vmax = Math.max(vmax, Math.abs(w.v));
      const curve = (vertical, scale) => {
        const N = 96;
        const base = vertical ? inset : H - inset;       /* 基线：左边界 / 底边 */
        const amp = inset - 5 * dpr;
        ctx.beginPath();
        for (let k = 0; k <= N; k++){
          const t = k / N, pos = t * L;
          let V = 0;
          for (const q of wells){ const dd = pos - (q.x + 0.5); V += q.v * Math.exp(-(dd * dd) / (q.w * q.w)); }
          const hgt = Math.max(-1, Math.min(1, (V * scale) / vmax)) * amp;
          const along = vertical ? (H - t * H) : (t * W);
          if (k) ctx.lineTo(vertical ? base + hgt : along, vertical ? along : base - hgt);
          else ctx.moveTo(vertical ? base + hgt : along, vertical ? along : base - hgt);
        }
        ctx.strokeStyle = 'rgba(170,200,235,.5)';
        ctx.lineWidth = 1.1 * dpr;
        ctx.stroke();
      };
      curve(false, 1);                        /* V₁(x₁)：底边 */
      curve(true, 1 + this.state.eps);        /* V₂(x₂)：左边（ε>0 时整支放大） */
      /* 极淡基线，让剖面的零位可读 */
      ctx.strokeStyle = 'rgba(150,180,215,.16)';
      ctx.beginPath();
      ctx.moveTo(0, H - inset); ctx.lineTo(W, H - inset);
      ctx.moveTo(inset, 0); ctx.lineTo(inset, H);
      ctx.stroke();
      label('V(x₁)', W - 7 * dpr, H - inset - 4 * dpr, 'rgba(170,200,235,.55)', 'right', 8 * dpr);
      label('V(x₂)', inset + 4 * dpr, 26 * dpr, 'rgba(170,200,235,.55)', 'left', 8 * dpr);
    }

    /* ---------- ③ 轨道：极淡引导线 + 边缘圆角柄 ---------- */
    const pr = TB_PRESETS[this.state.preset];
    if (pr && !pr.eigen){
      const o = tbOrbits(L, this.state.preset, this.initOpts());
      const vx = (o.xa + 0.5) * px, hy = H - (o.xb + 0.5) * px;
      const drag = this._drag && this._drag.kind === 'orbit' ? this._drag.which : -1;

      /* 引导线：1px、点状、几乎透明；拖拽中才提亮 */
      ctx.setLineDash([2 * dpr, 7 * dpr]);
      ctx.lineWidth = 1 * dpr;
      ctx.strokeStyle = drag === 0 ? 'rgba(125,225,245,.55)' : 'rgba(125,225,245,.20)';
      ctx.beginPath(); ctx.moveTo(vx, 0); ctx.lineTo(vx, H); ctx.stroke();
      ctx.strokeStyle = drag === 1 ? 'rgba(250,205,120,.55)' : 'rgba(250,205,120,.18)';
      ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(W, hy); ctx.stroke();
      ctx.setLineDash([]);

      /* 手柄：x₁ 贴顶边（竖直柄），x₂ 贴右边（水平柄） */
      const grip = (x, y, vertical, hot, rgb) => {
        const long = (hot ? 30 : 24) * dpr, thin = 5 * dpr, r = 2.5 * dpr;
        if ('shadowBlur' in ctx){ ctx.shadowBlur = 6 * dpr; ctx.shadowColor = `rgba(${rgb},.5)`; }
        ctx.fillStyle = `rgba(${rgb},${hot ? 1 : 0.82})`;
        if (vertical) rrect(x - long / 2, y, long, thin, r);
        else rrect(x - thin, y - long / 2, thin, long, r);
        ctx.fill();
        if ('shadowBlur' in ctx) ctx.shadowBlur = 0;
      };
      grip(vx, 3 * dpr, true, drag === 0, '125,225,245');
      grip(W - 3 * dpr, hy, false, drag === 1, '250,205,120');

      /* 标签：贴在手柄内侧，带暗底描边 */
      label('x₁', vx, 20 * dpr, 'rgba(125,225,245,.9)');
      label('x₂', W - 10 * dpr, hy + 14 * dpr, 'rgba(250,205,120,.9)', 'right');
    }

    /* ---------- ④ 一次性的操作提示（9 秒后淡出；势阱刷开着时常驻） ---------- */
    const age = (typeof performance !== 'undefined' ? performance.now() : 0) - (this._mountT || 0);
    const fade = this.state.wellTool ? 1 : Math.max(0, Math.min(1, (9000 - age) / 1500));
    if (fade > 0.02){
      const txt = this.state.wellTool
        ? '势阱刷：拖动放阱 · 右键删'
        : '拖边缘小柄挪轨道';
      ctx.font = `${f(9.5 * dpr)}px ui-monospace,SFMono-Regular,Menlo,monospace`;
      const tw = (ctx.measureText ? ctx.measureText(txt).width : txt.length * 5.7 * dpr) || txt.length * 5.7 * dpr;
      const padX = 6 * dpr, padY = 3.5 * dpr;
      const bh = 9.5 * dpr + 2 * padY;
      const x = W - tw - 2 * padX - 8 * dpr;         /* 右上角：避开左下剖面与左上标签 */
      const by = 8 * dpr;
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = 'rgba(6,12,22,.55)';
      rrect(x, by, tw + 2 * padX, bh, 5 * dpr);
      ctx.fill();
      ctx.fillStyle = this.state.wellTool ? 'rgba(250,205,120,.95)' : 'rgba(165,195,230,.92)';
      ctx.textAlign = 'left';
      ctx.fillText(txt, x + padX, by + padY + 8 * dpr);
      ctx.globalAlpha = 1;
    }
  }
  /* 拖动的一步（pointerdown 与 pointermove 共用，所以「按下」就有反馈） */
  _dragApply(t){
    const d = this._drag;
    if (!d) return false;
    if (d.kind === 'well'){
      this.moveWell(d.idx, t.i);
      return true;
    }
    this.placeOrbit(d.which, d.which === 0 ? t.i : t.j);
    return true;
  }
  toggleWellTool(){
    this.state.wellTool = !this.state.wellTool;
    this.syncWellHud();
    this.q('#tbField').style.cursor = this.state.wellTool ? 'cell' : '';
    this.toast(this.state.wellTool
      ? '势阱刷：拖动放阱 · 右键删'
      : '势阱刷：关');
  }
  /* 沿轴点选轨道：which=0 ⟹ 粒子 1（下方 x₁ 条），which=1 ⟹ 粒子 2（右侧 x₂ 条）。
     首次点选从**当前预设的两条轨道**接续（画面不跳），之后把预设切到「自由放置」。
     位置由 tbInitParams 钳到「整包留在场内」，所以这里不做第二次钳制。 */
  placeOrbit(which, x){
    const L = this.state.L;
    if (!Number.isFinite(x)) return false;
    if (this.state.preset !== 'custom'){
      const o = tbOrbits(L, this.state.preset, this.initOpts());
      this.state.xa = o.xa; this.state.xb = o.xb;
      this.state.preset = 'custom';
    }
    if (which === 0) this.state.xa = x; else this.state.xb = x;
    this.applyInit();
    return true;
  }
  setStats(s){
    if (s === this.state.stats) return;
    this.loadPreset(this.state.preset, s, false);
  }
  togglePause(){
    this.state.paused = !this.state.paused;
    this.q('#tbPause').textContent = this.state.paused ? '继续' : '暂停';
    this.q('#tbPause').classList.toggle('on', this.state.paused);
  }
  toggleMode(){
    this.state.mode = this.state.mode ? 0 : 1;
    this.q('#tbMode').textContent = '显示：' + (this.state.mode ? '相位' : '密度');
  }
  resetWave(){
    if (!this._init) return;
    this.upload(this._init.re, this._init.im);
    this.state.simTime = 0; this.state.frames = 0; this._E = null;
    this.refreshMeasure();
    this.toast('已重置');
  }

  /* ---------- GPU 上传 / 读取 ---------- */
  upload(re, im){
    const { gl } = this, L = this.state.L, n = 2 * L * L;
    const inter = new Float32Array(n);
    for (let k = 0; k < n; k += 2){ inter[k] = re[k / 2]; inter[k + 1] = im[k / 2]; }
    gl.bindTexture(gl.TEXTURE_2D, this.psi[0].tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, L, L, 0, gl.RG, gl.FLOAT, inter);
    this.parity = 0;
  }
  readField(){
    const { gl } = this, L = this.state.L;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.psi[this.parity].fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, L, L, gl.RG, gl.FLOAT, this._readBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._readBuf;
  }
  /* 交错 readback → (re,im) 拆分（tbMeasure 口径） */
  splitField(f){
    const n = f.length / 2;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let k = 0; k < n; k++){ re[k] = f[2 * k]; im[k] = f[2 * k + 1]; }
    return { re, im };
  }

  /* ---------- 演化 ----------
     uniform 必须在 gl.useProgram 之后设置（pass() 内部先 useProgram 再 setup）——
     R72 首版在 pass 之前调 setKickUniforms，结果写在上一帧残留的 progDraw 上
     （GL INVALID_OPERATION，静默无效）：kick 的 uDtHalf/uK/uTexel 全为 0、uPot
     默认 0 采样成波函数本身。自由预设差异小（V=0 vs Reψ~0.05）掩盖了它，阱预设
     maxDiff 0.039（相对 0.93）才暴露。 */
  kickUniforms(dt){
    const { gl } = this, L = this.state.L, k = this.progKick;
    gl.uniform2f(this.u(k, 'uTexel'), 1 / L, 1 / L);
    gl.uniform1f(this.u(k, 'uDtHalf'), dt / 2);
    gl.uniform1f(this.u(k, 'uK'), 0.5);
    this.bindTex(k, 'uPot', 2, this.potTex.tex);
  }
  /* 自适应步长：显式 KDK 稳定界 dt·λ_max ≲ 2，λ_max ≈ 8uK(动能) + V_max。
     格点 δ 接触项 g 直接抬高 V_max（g=25 ⟹ dt·29>2 会指数爆炸到 NaN），
     故把一步拆成 k 份 dt/k，**每帧物理时间不变**（simTime 仍按名义 dt·substeps）。 */
  effStep(){
    const dtSafe = 1.9 / (4 + (this._vmax || 0));
    const k = Math.max(1, Math.ceil(this.state.dt / dtSafe));
    return { dt: this.state.dt / k, k };
  }
  pass(prog, target, setup){
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(prog);
    setup();
    this.quad.draw(gl);
  }
  bindTex(prog, name, unit, tex){
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.u(prog, name), unit);
  }
  kdkSubstep(dt){
    const { gl } = this, p = this.parity, q = 1 - p, L = this.state.L;
    /* kick1: u[p] → u[q]（只改 Im） */
    this.pass(this.progKick, this.psi[q], () => {
      this.bindTex(this.progKick, 'uU', 0, this.psi[p].tex);
      this.kickUniforms(dt);
    });
    /* drift: u[q] → u[p]（只改 Re） */
    this.pass(this.progDrift, this.psi[p], () => {
      gl.uniform1f(this.u(this.progDrift, 'uDt'), dt);
      gl.uniform1f(this.u(this.progDrift, 'uK'), 0.5);
      gl.uniform2f(this.u(this.progDrift, 'uTexel'), 1 / L, 1 / L);
      this.bindTex(this.progDrift, 'uU', 0, this.psi[q].tex);
      this.bindTex(this.progDrift, 'uPot', 2, this.potTex.tex);
    });
    /* kick2: u[p] → u[q]（只改 Im） */
    this.pass(this.progKick, this.psi[q], () => {
      this.bindTex(this.progKick, 'uU', 0, this.psi[p].tex);
      this.kickUniforms(dt);
    });
    this.parity = q;
  }
  evolveFrame(){
    const { dt, k } = this.effStep();
    for (let s = 0; s < this.state.substeps; s++)
      for (let j = 0; j < k; j++) this.kdkSubstep(dt);
    this.state.simTime += this.state.dt * this.state.substeps;
    this.state.frames++;
  }
  stepFrames(n){
    /* 单步路径也要重烘势场：否则「改了 ε/g/势阱但页面暂停着点单步」会用旧势
       （rAF 循环会补烘，所以浏览器里通常看不出来；确定性路径不该依赖 rAF）。 */
    this.bakePot();
    for (let i = 0; i < n; i++) this.evolveFrame();
    this.refreshMeasure();
  }

  /* ---------- 测量 / HUD / 条带 ---------- */
  measureNow(){ return this.refreshMeasure(); }
  refreshMeasure(){
    const f = this.readField();
    this._field = f;
    const { re, im } = this.splitField(f);
    const m = tbMeasure(re, im, this.state.L);
    this._m = m;
    if (this._baseNorm === null) this._baseNorm = m.norm || 1;
    this.q('#hExch').textContent = nf(m.exch, 5);
    this.q('#hNorm').textContent = nf(m.norm / this._baseNorm, 6);
    this.q('#hDiag').textContent = sci(m.diagMass);
    this.q('#hDiagMax').textContent = sci(m.diagMax);
    this.q('#hDn').textContent = sci(m.dn12);
    this.q('#hE').textContent = this._E === null ? '—' : nf(this._E, 5);
    this.q('#hT').textContent = nf(this.state.simTime, 1) + ' / ' + this.state.frames;
    const tgt = 0.9 / Math.max(m.peak, 1e-9);
    this._scale += (Math.min(Math.max(tgt, 1), 1e6) - this._scale) * 0.25;
    this.drawStrips(m.n1, m.n2);
    this.drawRails();
    return m;
  }
  drawStrips(n1, n2){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let peak = 1e-12;
    for (let i = 0; i < n1.length; i++) peak = Math.max(peak, n1[i], n2[i]);
    this._nScale = 0.92 / peak;
    const draw = (cv, arr, horiz) => {
      const ctx = cv.getContext('2d');
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(4,8,16,.4)'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(103,232,249,.85)'; ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      for (let i = 0; i < arr.length; i++){
        const t = (i + 0.5) / arr.length;
        const v = Math.min(arr[i] * this._nScale, 1);
        if (horiz){ const x = t * W, y = H - v * (H - 4 * dpr) - 2 * dpr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        else { const y = (1 - t) * H, x = v * (W - 4 * dpr) + 2 * dpr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(251,191,36,.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (horiz){ ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); } else { ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); }
      ctx.stroke();
    };
    /* 轨道落点标记：自定义预设下两条轨道各自的位置 + 动量方向（箭头）。
       —— 点选是「看不见落点」的交互就白搭，所以标记必须画在条上。 */
    const mark = (cv, x, k, horiz) => {
      const ctx = cv.getContext('2d');
      const W = cv.width, H = cv.height, dpr2 = Math.min(window.devicePixelRatio || 1, 2);
      const t = (x + 0.5) / this.state.L;
      ctx.strokeStyle = 'rgba(251,191,36,.95)'; ctx.lineWidth = 1.2 * dpr2;
      ctx.setLineDash([3 * dpr2, 3 * dpr2]);
      ctx.beginPath();
      if (horiz){ ctx.moveTo(t * W, 0); ctx.lineTo(t * W, H); } else { ctx.moveTo(0, (1 - t) * H); ctx.lineTo(W, (1 - t) * H); }
      ctx.stroke();
      ctx.setLineDash([]);
      if (Math.abs(k) > 1e-9){
        const fr = [255, 191, 36];
        ctx.fillStyle = 'rgba(' + fr.join(',') + ',.95)';
        ctx.beginPath();
        if (horiz){
          const y = H - 6 * dpr2, sgn = k > 0 ? 1 : -1;
          ctx.moveTo(t * W + sgn * 7 * dpr2, y);
          ctx.lineTo(t * W - sgn * 2 * dpr2, y - 4 * dpr2);
          ctx.lineTo(t * W - sgn * 2 * dpr2, y + 4 * dpr2);
        } else {
          const xx = 6 * dpr2, sgn = k > 0 ? -1 : 1;      /* 竖直条：y 向上 = 位置增大 */
          ctx.moveTo(xx, (1 - t) * H + sgn * 7 * dpr2);
          ctx.lineTo(xx - 4 * dpr2, (1 - t) * H - sgn * 2 * dpr2);
          ctx.lineTo(xx + 4 * dpr2, (1 - t) * H - sgn * 2 * dpr2);
        }
        ctx.closePath(); ctx.fill();
      }
    };
    const st = this.state;
    const showMark = st.preset === 'custom' || st.preset === 'cross' || st.preset === 'trap';
    if (showMark){
      const o = tbOrbits(st.L, st.preset, this.initOpts());
      mark(this.q('#tbN1'), o.xa, o.ka, true);
      mark(this.q('#tbN2'), o.xb, o.kb, false);
    }
    draw(this.q('#tbN1'), n1, true);
    draw(this.q('#tbN2'), n2, false);
  }

  /* ---------- 松弛（虚时间 → 当前对称 sector 的离散基态） ---------- */
  startRelax(){
    if (this._relax){ this.toast('松弛进行中…'); return; }
    const { re, im } = this.splitField(this.readField());
    this._relax = { re, im, iters: 0, done: false, chunk: 0 };
    this.q('#tbRelax').textContent = '松弛中…';
    this.q('#tbRelax').disabled = true;
    this.toast('虚时间松弛中（保持交换对称）', 1200);
  }
  relaxChunk(){
    const r = this._relax;
    if (!r || r.done) return;
    r.chunk++;
    const sym = this.state.stats === 'boson' ? 1 : -1;
    const res = tbRelax(r.re, r.im, this.state.L, this.params(), { maxIters: 30, checkEvery: 25, sym });
    r.iters += res.iters;
    if (r.chunk % 4 === 0) this.q('#hE').textContent = '松弛 ' + r.iters + ' 步';
    if (res.iters < 30 || r.iters > 30000){
      r.done = true;
      this._E = res.energy;
      this.upload(r.re, r.im);
      this.q('#tbRelax').textContent = '松弛';
      this.q('#tbRelax').disabled = false;
      this.q('#hE').textContent = nf(res.energy, 5) + ' (' + res.iters + ')';
      this.toast('已收敛到离散本征态\nE=' + nf(res.energy, 5) + ' · 残差 ' + sci(res.residual) + ' · ' + res.iters + ' 步');
      this._relax = null;
      this.refreshMeasure();
    }
  }
  relaxSync(){
    const { re, im } = this.splitField(this.readField());
    const sym = this.state.stats === 'boson' ? 1 : -1;
    const res = tbRelax(re, im, this.state.L, this.params(), { sym });
    this._E = res.energy;
    this.upload(re, im);
    this.q('#hE').textContent = nf(res.energy, 5) + ' (' + res.iters + ')';
    this.refreshMeasure();
    return res;
  }

  /* ---------- 渲染 ---------- */
  draw(){
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.progDraw);
    gl.uniform2f(this.u(this.progDraw, 'uTexel'), 1 / this.state.L, 1 / this.state.L);
    gl.uniform1f(this.u(this.progDraw, 'uScale'), this._scale);
    gl.uniform1f(this.u(this.progDraw, 'uMode'), this.state.mode);
    gl.uniform1f(this.u(this.progDraw, 'uDiagOn'), 1);
    this.bindTex(this.progDraw, 'uU', 0, this.psi[this.parity].tex);
    this.quad.draw(gl);
  }

  /* ---------- 帧循环 ---------- */
  frame(){
    requestAnimationFrame(this.frame);
    const relaxing = !!this._relax;
    this._fpsFrames++;
    const now = performance.now();
    if (now - this._lastFpsT > 500){
      this._fps = Math.round(this._fpsFrames * 1000 / (now - this._lastFpsT));
      this._fpsFrames = 0; this._lastFpsT = now;
      this.q('#hFps').textContent = String(this._fps);
    }
    this.bakePot();   /* 签名未变则立即返回（滑块/预设改动下一帧生效） */
    if (relaxing) this.relaxChunk();
    else if (!this.state.paused) this.evolveFrame();
    this.draw();
    /* 帧数在暂停/松弛时不变；必须只在真实演化帧采样，否则 frames%6===0 会
       每个 rAF 都 readPixels。重发初态、松弛收敛与单步路径会显式 refreshMeasure。 */
    if (!relaxing && !this.state.paused && this.state.frames % 6 === 0) this.refreshMeasure();
  }

  /* ---------- 调试句柄（cdp72） ---------- */
  summary(m){
    return { norm: m.norm, exch: m.exch, diagMass: m.diagMass, diagMax: m.diagMax, peak: m.peak, dn12: m.dn12 };
  }
  debugHandle(){
    return {
      app: this, state: this.state,
      measure: () => this.summary(this.measureNow()),
      readField: () => Array.from(this.readField()),
      fieldHash: () => tbFieldHash(this.readField()),
      step: (n = 1) => this.stepFrames(n),
      preset: k => this.loadPreset(k, this.state.stats, false),
      stats: s => this.setStats(s),
      /* 初态旋钮：set 走与滑块同一条路径（钳制 → 重发 → 告警） */
      initInfo: () => this._info || tbInitInfo(this.state.L, this.state.preset, this.initOpts()),
      /* 沿轴点选（与鼠标同一入口）：place(0|x, texel) ⟹ 自动切到「自由放置」 */
      place: (which, x) => this.placeOrbit(which, x),
      /* 势阱：与画布拖拽同一条路径（cdp132 走这里，不再重写一套） */
      wells: () => this.state.wells.map(w => ({ x: w.x, w: w.w, v: w.v })),
      addWell: x => this.addWell(x),
      moveWell: (k, x) => this.moveWell(k, x),
      removeWell: k => this.removeWell(k),
      clearWells: () => this.clearWells(),
      wellTool: on => { if (!!on !== !!this.state.wellTool) this.toggleWellTool(); return this.state.wellTool; },
      drag: () => this._drag,
      setInit: patch => { Object.assign(this.state, patch || {}); return this.applyInit(); },
      relaxNow: () => { const r = this.relaxSync(); return { iters: r.iters, energy: r.energy, residual: r.residual }; },
      /* 页内 CPU 镜像：从初态按当前参数跑 frames 帧，与 GPU 场逐 texel 对比
         （GPU float32 vs CPU float64；页内算完只回传摘要） */
      compareMirror: (frames) => {
        const P = this.params(), L = this.state.L;
        const re = Float64Array.from(this._init.re), im = Float64Array.from(this._init.im);
        const Varr = tbMakeVArray(L, P);
        const { dt, k } = this.effStep();
        const sub = this.state.substeps;
        for (let f = 0; f < frames; f++) for (let s = 0; s < sub; s++)
          for (let j = 0; j < k; j++) tbKdkStep(re, im, L, P, dt, Varr);
        const cpu = this.summary(tbMeasure(re, im, L));
        const gpu = this.summary(this.measureNow());
        let md = 0, mrd = 0;
        for (let k = 0; k < re.length; k++){
          const gr = this._field[2 * k], gi = this._field[2 * k + 1];
          const d = Math.hypot(gr - re[k], gi - im[k]);
          if (d > md) md = d;
          const sc = Math.max(Math.abs(re[k]), Math.abs(im[k]), 1e-6);
          if (d / sc > mrd) mrd = d / sc;
        }
        return { frames, cpu, gpu, maxDiff: md, maxRelDiff: mrd };
      },
    };
  }
}
