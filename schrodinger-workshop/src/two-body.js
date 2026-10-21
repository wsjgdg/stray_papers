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
import { createContext, createProgram, Quad, makeTarget } from './core/gl.js';
import { TB_PRESETS, TB_COMMON, tbMakeWave, tbKdkStep, tbMeasure, tbRelax, tbPot1, tbPot2, tbMakeVArray, tbFieldHash, TB_FS_KICK, TB_FS_DRIFT, TB_FS_DRAW } from './physics/twobody.js';

/* 页面布局（复用 styles.js 的 :root 变量与 reset；本块只管 two-body 专属结构） */
const TB_CSS = `
  #tbTop{top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;
    padding:9px 18px;z-index:10;white-space:nowrap}
  #tbTop .logo{font-family:var(--mono);font-weight:700;font-size:14px;letter-spacing:.12em;
    background:linear-gradient(90deg,var(--cyan),var(--mag));-webkit-background-clip:text;background-clip:text;color:transparent}
  #tbTop .eq{font-family:var(--mono);font-size:12px;color:var(--dim)}
  #tbTop .eq b{color:var(--cyan);font-weight:600}
  #tbTop a{font-family:var(--mono);font-size:11px;color:var(--dim);text-decoration:none;
    border:1px solid var(--line);border-radius:6px;padding:3px 8px;transition:all .15s}
  #tbTop a:hover{color:var(--cyan);border-color:rgba(103,232,249,.4)}
  #tbPanel{top:74px;left:14px;width:224px;padding:13px;z-index:10;max-height:calc(100vh - 250px);overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #tbHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:200px;font-family:var(--mono)}
  #tbHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0}
  #tbHud .hrow span:first-child{color:var(--dim)}
  #tbHud .hrow span:last-child{color:var(--txt)}
  #tbHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #tbStage{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:5;
    display:flex;flex-direction:column;align-items:center;gap:5px;--sz:min(62vh,52vw)}
  #tbFieldWrap{position:relative}
  #tbField{display:block;width:var(--sz);height:var(--sz);border-radius:10px;touch-action:none}
  #tbN2{position:absolute;left:calc(100% + 5px);top:0;width:52px;height:var(--sz);display:block}
  #tbN1{width:var(--sz);height:52px;display:block}
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
    this.state = {
      L, preset: q.get('preset') || 'cross', stats: q.get('stats') || 'boson',
      g: num('g', 0), eps: num('eps', 0), omega: num('omega', 0.02),
      substeps: Math.round(num('substeps', 6)), dt: num('dt', 0.08),
      mode: Math.round(num('mode', 0)), paused: q.get('paused') === '1',
      simTime: 0, frames: 0,
    };
    if (!TB_PRESETS[this.state.preset]) this.state.preset = 'cross';
    if (!['boson', 'fermion'].includes(this.state.stats)) this.state.stats = 'boson';
    this._scale = 400; this._nScale = 16; this._E = null; this._relax = null;
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
      /* 初次加载沿用 URL 参数（不重置 g/eps/omega） */
      this.loadPreset(this.state.preset, this.state.stats, false);
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
<div id="tbTop" class="panel">
  <div class="logo">双粒子工场 · TWO-BODY</div>
  <div class="eq"><b>i</b>ℏ∂ψ/∂t = [−ℏ²/2m(∂₁²+∂₂²)+V₁+V₂+<b>g</b>δ]ψ</div>
  <a href="./index.html">← 单粒子主页</a>
  <a href="./hubbard.html">哈伯德页</a>
  <a href="./paths.html">路径页</a>
  <a href="./qcircuit.html">线路页</a>
  <a href="./noise.html">噪声页</a>
  <a href="./qec.html">纠错页</a>
  <a href="./shor.html">级联页</a>
</div>
<div id="tbPanel" class="panel">
  <div class="sec"><h3>预设</h3><div class="grid3" id="tbPresets">
    ${Object.keys(pr).map(k => '<button data-preset="' + k + '">' + pr[k].name + '</button>').join('')}
  </div></div>
  <div class="sec"><h3>统计（交换对称）</h3><div class="grid2">
    <button id="tbBoson" class="on">玻色子 +</button><button id="tbFermion">费米子 −</button>
  </div></div>
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
<div id="tbHud" class="panel">
  <div class="hrow"><span>⟨P⟩ 交换期望</span><span id="hExch">—</span></div>
  <div class="hrow"><span>‖ψ‖² / 初值</span><span id="hNorm">—</span></div>
  <div class="hrow"><span>对角质量</span><span id="hDiag">—</span></div>
  <div class="hrow"><span>对角峰值</span><span id="hDiagMax">—</span></div>
  <div class="hrow"><span>max|n₁−n₂|</span><span id="hDn">—</span></div>
  <hr>
  <div class="hrow"><span>E（离散）</span><span id="hE">—</span></div>
  <div class="hrow"><span>t / 帧</span><span id="hT">—</span></div>
  <div class="hrow"><span>fps</span><span id="hFps">—</span></div>
  <hr>
  <div class="hrow"><span>探针 (x₁,x₂)</span><span id="hProbe">—</span></div>
</div>
<div id="tbStage">
  <div id="tbFieldWrap">
    <canvas id="tbField"></canvas>
    <canvas id="tbN2"></canvas>
  </div>
  <canvas id="tbN1"></canvas>
</div>
<div class="tbAxis" id="tbAxX">x₁ →</div>
<div class="tbAxis" id="tbAxY">x₂ →</div>
<div id="tbHint" class="panel"><b></b><span></span></div>
<div id="tbToast"></div>
<div id="tbDiag"></div>`;
    this.container.querySelectorAll('[data-preset]').forEach(b =>
      this.on(b, 'click', () => this.loadPreset(b.dataset.preset, this.state.stats, true)));
    this.on(this.q('#tbBoson'), 'click', () => this.setStats('boson'));
    this.on(this.q('#tbFermion'), 'click', () => this.setStats('fermion'));
    this.on(this.q('#tbPause'), 'click', () => this.togglePause());
    this.on(this.q('#tbStep'), 'click', () => this.stepFrames(1));
    this.on(this.q('#tbReset'), 'click', () => this.resetWave());
    this.on(this.q('#tbRelax'), 'click', () => this.startRelax());
    this.on(this.q('#tbMode'), 'click', () => this.toggleMode());
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
    bind('#rG', 'g', '#oG', v => v.toFixed(1));
    bind('#rEps', 'eps', '#oEps', v => v.toFixed(2));
    bind('#rOm', 'omega', '#oOm', v => v.toFixed(3),
      () => { if (this.state.preset === 'eigen') this.loadPreset('eigen', this.state.stats, false); });
    bind('#rSub', 'substeps', '#oSub', v => String(v | 0));
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
    const sig = [this.state.preset, P.trap, P.omega, P.eps, P.g, L].join('|');
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
    };
  }
  /* resetParams=true 仅在点预设按钮时（切场景恢复该预设默认参数）；
     URL 初次加载 / 统计切换 / ω 拖动均保持当前参数。 */
  loadPreset(key, stats, resetParams = false){
    const w = tbMakeWave(this.state.L, key, { stats, omega: this.state.omega });
    if (w.norm < 1e-9){
      this.toast('泡利不相容：两个费米子不能占据同一单粒子态');
      return false;
    }
    this.state.preset = key; this.state.stats = stats;
    if (resetParams){
      const pr = TB_PRESETS[key];
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
    this._fpsFrames++;
    const now = performance.now();
    if (now - this._lastFpsT > 500){
      this._fps = Math.round(this._fpsFrames * 1000 / (now - this._lastFpsT));
      this._fpsFrames = 0; this._lastFpsT = now;
      this.q('#hFps').textContent = String(this._fps);
    }
    this.bakePot();   /* 签名未变则立即返回（滑块/预设改动下一帧生效） */
    if (this._relax) this.relaxChunk();
    else if (!this.state.paused) this.evolveFrame();
    this.draw();
    if (this.state.frames % 6 === 0) this.refreshMeasure();
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
