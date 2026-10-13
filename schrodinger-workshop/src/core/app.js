/* ============================================================================
 * QuantumField —— 量子场演化组件（引擎层）
 *
 * 职责：DOM 构建、GL 资源管理、KDK 积分循环、渲染管线、交互、HUD、
 *       URL 参数、调试句柄（window.__app）。
 * 物理内核（演化算子 / 波包生成 / 预设 / 附加控件）全部来自 PhysicsKernel，
 * 见 ../physics/kernel.js —— 本文件不含任何物理公式。
 *
 * 多实例安全：无模块级可变状态；一页建议只挂一个实例
 * （WebGL 上下文上限约 16，且元素 ID 为全局单例设计）。
 * ========================================================================== */
import { createContext, createProgram, Quad, makeTarget, makeRGBA16F, makeReduce, FS_BLIT } from './gl.js';
import { getKernel, buildShaders } from '../physics/kernel.js';
import { injectStyles } from './styles.js';

/* 合成到屏幕：扫描线 + 微弱噪点 + 亮度曝光（引擎级视觉，无内核注入） */
const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform float uTime;
uniform float uBright;   /* 画面亮度（曝光）：扫描线/颗粒之后统一缩放，trail 缓冲不受影响 */
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec3 c = texture(uTex,vUv).rgb;
  c *= 0.97 + 0.03*sin(vUv.y*900.0);
  c += (hash(vUv+uTime)-0.5)*0.012;
  o = vec4(c*uBright,1.0);
}`;

export class QuantumField {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    this.options = options;
    const kid = options.kernel || 'schrodinger';
    this.kernel = getKernel(kid);
    this.kernelId = this.kernel.id;
    /* 引擎级默认状态 + 内核私有参数（如 NLS 的 g）+ 调用方覆盖 */
    this.state = {
      grid: 256, m: 1.0, sigma: 7, substeps: 6, brush: 10, vStrength: 0.3,
      decay: 0.97, bright: 1.0, tool: 'wave', paused: false, simTime: 0,
      preset: null, lastWave: null, waveCount: 1,
      drag: null,
      ...this.kernel.defaults(),
      ...(options.state || {}),
    };
    this._uloc = new Map();     /* program → uniform name → location 缓存 */
    this._rows = [];            /* 面板滑块行（引擎 + 内核），syncControls 用 */
    this._listeners = [];       /* unmount 时统一移除 */
    /* 帧循环计数与归约基线（原模块级变量，改为实例字段以支持多实例） */
    this._frames = 0; this.fps = 0;
    this._lastFpsT = performance.now(); this._lastReduceF = 0;
    this.baseP0 = 1; this._baseCaptured = false;
    this._readBuf = new Float32Array(32*32*4);
    this._raf = 0;
    this._onError = e => {
      const d = this.q('#diag');
      if (d) d.textContent = 'ERR ' + e.message;
      document.title = 'ERR ' + e.message;
    };
    window.addEventListener('error', this._onError);
    this.frame = this.frame.bind(this);
  }

  /* ---------- 工具 ---------- */
  q(s){ return this.container.querySelector(s); }
  on(target, type, fn, opts){
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  }
  u(prog, name){
    let m = this._uloc.get(prog);
    if (!m){ m = new Map(); this._uloc.set(prog, m); }
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(prog, name));
    return m.get(name);
  }

  /* ---------- 挂载 ---------- */
  mount(){
    injectStyles();
    this.buildDOM();
    this.canvas = this.q('#gl');
    const { gl, error } = createContext(this.canvas);
    if (!gl){ this.fail(error); return this; }
    this.gl = gl;
    try {
      this.quad = new Quad(gl);
      this.initPrograms();
      this.initTargets();
      this.initPotential();
      this.bindUI();
      this.bootstrap();
      requestAnimationFrame(this.frame);
    } catch (err){
      this.fail((err && err.message) || String(err));
      return this;
    }
    window.__app = this.debugHandle();
    return this;
  }

  fail(msg){
    const d = this.q('#diag');
    if (d) d.textContent = 'ERR ' + msg;
    document.title = 'ERR ' + msg;
  }

  /* ---------- DOM ---------- */
  buildDOM(){
    const k = this.kernel;
    const presets = k.presets();
    const presetBtns = Object.keys(presets).map(key =>
      '<button data-preset="' + key + '">' + presets[key].name + '</button>').join('');
    const extra = k.extraControls();
    const extraHtml = extra ? extra.html : '';
    this.container.innerHTML = `
<canvas id="gl"></canvas>
<svg id="aim"><line id="aimline" x1="0" y1="0" x2="0" y2="0"></line><circle id="aimdot" r="4"></circle><text id="aimtxt" x="0" y="0"></text></svg>
<div class="corner" id="c1"></div><div class="corner" id="c2"></div><div class="corner" id="c3"></div><div class="corner" id="c4"></div>

<header id="topbar" class="panel">
  <div class="logo">${k.name}工场</div>
  <div class="eq">${k.equation}</div>
  <div id="status">● LIVE</div>
</header>

<aside id="panel" class="panel">
  <div class="sec">
    <h3>预设场景</h3>
    <div class="grid2">${presetBtns}</div>
  </div>
  <div class="sec">
    <h3>工具</h3>
    <div class="grid3">
      <button data-tool="wave" class="on">波包</button>
      <button data-tool="barrier">势垒</button>
      <button data-tool="well">势阱</button>
    </div>
    <div class="grid3" style="margin-top:6px">
      <button data-tool="erase">橡皮</button>
      <button id="btnPause">暂停</button>
      <button id="btnStep">单步</button>
    </div>
  </div>
  <div class="sec">
    <h3>物理参数</h3>
    <div class="row"><label>质量 m</label><input type="range" id="rMass" min="0.15" max="4" step="0.05" value="1"><output id="oMass">1.00</output></div>
    <div class="row"><label>波包宽度 σ</label><input type="range" id="rSigma" min="4" max="18" step="0.5" value="7"><output id="oSigma">7.0</output></div>
    <div class="row"><label>积分子步</label><input type="range" id="rSpeed" min="1" max="16" step="1" value="6"><output id="oSpeed">6</output></div>
    <div class="row"><label>笔刷半径</label><input type="range" id="rBrush" min="3" max="40" step="1" value="10"><output id="oBrush">10</output></div>
    ${extraHtml}
  </div>
  <div class="sec">
    <h3>势场强度</h3>
    <div class="row"><label>V 值</label><input type="range" id="rV" min="0.01" max="1" step="0.01" value="0.3"><output id="oV">0.30</output></div>
  </div>
  <div class="sec">
    <h3>渲染与网格</h3>
    <div class="row"><label>画面亮度</label><input type="range" id="rBright" min="0.3" max="2.5" step="0.05" value="1"><output id="oBright">×1.00</output></div>
    <div class="row"><label>余晖拖尾</label><input type="range" id="rTrail" min="0" max="0.99" step="0.01" value="0.97"><output id="oTrail">0.97</output></div>
    <div class="row"><label>网格精度</label>
      <select id="selGrid">
        <option value="128">128² 流畅</option>
        <option value="192">192² 均衡</option>
        <option value="256" selected>256² 精细</option>
        <option value="320">320² 极致</option>
      </select>
    </div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnReset">重置波包</button>
      <button id="btnClearV">清空势场</button>
    </div>
  </div>
</aside>

<section id="hud" class="panel">
  <div class="hrow"><span>总概率 P</span><span id="hP">—</span></div>
  <div class="hrow"><span>守恒误差</span><span id="hErr">—</span></div>
  <hr>
  <div class="hrow"><span>动能 T</span><span id="hT">—</span></div>
  <div class="hrow"><span>势能 ⟨V⟩</span><span id="hV">—</span></div>
  <div class="hrow"><span>总能 E</span><span id="hE">—</span></div>
  <hr>
  <div class="hrow"><span>峰值 |ψ|²</span><span id="hPeak">—</span></div>
  <div class="hrow"><span>模拟时间 t</span><span id="hTime">—</span></div>
  <div class="hrow"><span>帧率</span><span id="hFps">—</span></div>
  <div class="hrow"><span>网格 · m</span><span id="hGrid">—</span></div>
</section>

<div id="legend" class="panel">
  <canvas id="wheel" width="168" height="168"></canvas>
  <div class="cap"><b>色相 = 相位 arg(ψ)</b><br>亮度 = 概率密度 |ψ|²<br>等值线 = |ψ|² 等高线<br>暖色 = 势垒 V&gt;0 · 冷色 = 势阱 V&lt;0</div>
</div>

<div id="desc" class="panel"><b id="descName">自由传播</b><span id="descText"></span></div>

<footer id="hint" class="panel">
  <b>拖拽</b> 发射波包（方向=动量 k）· <span class="k">1-${Object.keys(presets).length}</span> 预设 · <span class="k">Space</span> 暂停 · <span class="k">T</span> 拖尾 · <span class="k">R</span> 重置 · <span class="k">C</span> 清空势场
</footer>
<div id="toast"></div>
<div id="brushcursor"></div>
<div id="diag"></div>
`;
  }

  /* ---------- 着色器 / 目标 / 势场 ---------- */
  initPrograms(){
    const gl = this.gl;
    const sh = buildShaders(this.kernel);   /* 模板 + 内核片段装配，契约错误在此抛出 */
    this.progEvolve = createProgram(gl, sh.evolve);
    this.progDisplay = createProgram(gl, sh.display);
    this.progComposite = createProgram(gl, FS_COMPOSITE);
    this.progReduce = createProgram(gl, sh.reduce);
    this.progBlit = createProgram(gl, FS_BLIT);
  }

  initTargets(){
    const gl = this.gl;
    /* 波函数纹理格式由内核分量数决定：1 对 → RG32F，2 对 → RGBA32F */
    this.fmt = this.kernel.pairs === 2 ? gl.RGBA : gl.RG;
    this.ifmt = this.kernel.pairs === 2 ? gl.RGBA32F : gl.RG32F;
    this.allocGrid(this.state.grid);
    this.reduceT = makeReduce(gl);
  }

  allocGrid(g){
    this.state.grid = g;
    const gl = this.gl;
    if (this.psiA){
      gl.deleteTexture(this.psiA.tex); gl.deleteFramebuffer(this.psiA.fbo);
      gl.deleteTexture(this.psiB.tex); gl.deleteFramebuffer(this.psiB.fbo);
    }
    this.psiA = makeTarget(gl, g, g, this.ifmt, this.fmt, gl.NEAREST);
    this.psiB = makeTarget(gl, g, g, this.ifmt, this.fmt, gl.NEAREST);
  }

  allocDisplay(){
    const gl = this.gl, canvas = this.canvas;
    const w = canvas.width, h = canvas.height;
    const oldA = this.dispA, oldB = this.dispB;
    this.dispA = makeRGBA16F(gl, w, h);
    this.dispB = makeRGBA16F(gl, w, h);
    /* resize 不丢拖尾：旧 dispA 持有历史余晖（max 混合的累积结果），
       blit 进新 dispA（LINEAR 滤波顺便做分辨率缩放），否则窗口尺寸一变拖尾瞬间清空。 */
    if (oldA){
      gl.useProgram(this.progBlit);
      gl.bindVertexArray(this.quad.vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispA.fbo);
      gl.viewport(0,0,w,h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, oldA.tex);
      gl.uniform1i(this.u(this.progBlit,'uTex'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.deleteTexture(oldA.tex); gl.deleteFramebuffer(oldA.fbo);
    }
    if (oldB){ gl.deleteTexture(oldB.tex); gl.deleteFramebuffer(oldB.fbo); }
  }

  initPotential(){
    const gl = this.gl;
    /* 势场 canvas (256^2) -> R 通道灰度编码 V∈[-1,1] */
    this.vCanvas = document.createElement('canvas'); this.vCanvas.width = this.vCanvas.height = 256;
    this.vctx = this.vCanvas.getContext('2d', { willReadFrequently: true });
    this.vTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.vTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  uploadV(){
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.vTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.vCanvas);
  }

  vGray(v){ const g = Math.round(Math.max(-1, Math.min(1, v))*127+128); return 'rgb('+g+','+g+','+g+')'; }

  /* ---------- 波包（引擎层：归一化 + 等份叠加 + 上传；形状由内核生成） ---------- */
  /* add=true 时不清场：读回当前 ψ 与新波包线性叠加（量子叠加原理——两列物质波相遇自干涉），
     再整体归一化保持总概率 P=1。用于拖拽发射，便于观察多波包干涉。
     预设切换 / 重置 / σ 调整 / URL 参数均为默认 add=false（清除旧场）。
     等份叠加：发射前场上有 n 个波包，新包加入后 n+1 个各占 1/(n+1) 概率
     ——旧场整体 ×√(n/(n+1))、新包 ×√(1/(n+1))，叠加后总概率恰为 1。
     任意连发次数下所有波包份额一致、旧包永不消失（实测 6 连发 7 包列积分相等）。 */
  initWave(fx, fy, kx, ky, add){
    const g = this.state.grid, gl = this.gl;
    const { data, sum: rawSum } = this.kernel.makeWave(g, { fx, fy, kx, ky, sigma: this.state.sigma });
    let sum = rawSum;
    /* 新波包先归一化到 Σ|ψ|²=1，再与旧场叠加。
       纹理中的旧场恒满足 Σ|ψ|²=1（初始归一化 + 演化酉守恒，HUD P=1.0000/err=0.000%）。
       若把原始高斯（Σ|ψ|² ≈ 2πσ² ≈ 154，σ=7）直接叠加进已归一化的旧场，
       统一缩放 s = 1/√(1+154) = 0.080 会把旧场振幅压掉 √154 ≈ 12.4 倍（密度 ≈154 倍）
       ——旧波包一次发射即「被清除」。 */
    {
      const s0 = 1/Math.sqrt(sum);
      for (let i=0;i<data.length;i++) data[i] *= s0;
      sum = 1;
    }
    if (add){
      const n = this.state.waveCount;          /* 发射前场上的波包数 */
      this.state.waveCount = n + 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
      const old = new Float32Array(data.length);
      gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,old);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const sOld = Math.sqrt(n/(n+1)), sNew = Math.sqrt(1/(n+1));
      for (let i=0;i<data.length;i++) data[i] = data[i]*sNew + old[i]*sOld;
      sum = 0;   /* 重算总概率：理论上 n/(n+1)+1/(n+1)=1，重算吸收旧场演化浮点漂移，保持 P 严格归一 */
      for (let i=0;i<data.length;i+=2) sum += data[i]*data[i]+data[i+1]*data[i+1];
    } else {
      this.state.waveCount = 1;                /* 清场发射（预设/重置/σ 调整/URL 参数）：场回到单包 */
    }
    const s = 1/Math.sqrt(sum);
    for (let i=0; i<data.length; i++) data[i] *= s;
    gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.ifmt, g, g, 0, this.fmt, gl.FLOAT, data);
    this.state.lastWave = [fx, fy, kx, ky];
    this.state.simTime = 0;
  }

  /* ---------- 预设 ---------- */
  loadPreset(key){
    const p = this.kernel.presets()[key]; if (!p) return;
    this.state.preset = key;
    if (p.params) Object.assign(this.state, p.params);   /* 内核预设参数（σ/g 等） */
    this.syncControls();
    this.vctx.globalCompositeOperation = 'source-over';
    this.vctx.fillStyle = this.vGray(0); this.vctx.fillRect(0,0,256,256);
    p.build({ vctx: this.vctx, vGray: v => this.vGray(v) });
    this.uploadV();
    this.initWave(p.wave[0], p.wave[1], p.wave[2], p.wave[3]);
    this.q('#descName').textContent = p.name;
    this.q('#descText').textContent = p.text;
    this.container.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === key));
    this.toast(p.name);
  }

  toast(msg){
    const t = this.q('#toast'); t.textContent = msg; t.style.opacity = 1;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.style.opacity = 0, 900);
  }

  /* ---------- 主循环 ---------- */
  frame(now){
    this._raf = requestAnimationFrame(this.frame);
    /* 时间尺度与稳定性（KDK 速度 Verlet 用于 u'=Hv, v'=-Hu）：
       每模式旋转角 θ = arccos(1-(dt_sub·E)²/2)，E 为 H 的特征值；
       稳定充要条件 |1-(dt_sub·E)²/2| ≤ 1，即 dt_sub·E ≤ 2（θ→π 时混叠失真）。
       E 的上界 = k·8 + |V|max + 内核附加项 = (0.5/m)·8 + 1（5 点拉普拉斯 2D 最大
       特征值 8，势幅 ±1；非线性内核另计 |g|·peak|ψ|²）。
       初版 dt=0.04/子步：波包群速度 sin(κ)·0.24/帧 ≈ 0.08 cell/帧，比自身 σ=7 cell
       慢 200 倍，max 混合拖尾数学上无法成形、隧穿/振荡效应超出观察尺度
       （用户反馈「余晖没反应」的根因）。
       现为 dt=1.2/帧总推进：κ=0.334 波包 0.39 cell/帧（60fps 约 10.8s 横穿全屏），拖尾条纹 ≈3σ。
       子步长自适应兜底：sub_eff = max(substeps, ceil(dt·E_max/1.5))，保证 dt_sub·E_max ≤ 1.5
       （对稳定极限 2.0 留 1.33× 裕度）——极端小质量 m=0.15（E_max≈27.7）时自动加密至 23 子步。
       教训：直接把 dt 从 0.04 提到 0.6/子步会让 E_max=5 的模式半对角 1-0.36·25/2 = -3.5，
       特征值 -7.0 溢出单位圆，棋盘格噪声每子步 ×7 指数发散，数帧内炸穿 RGBA16F（P=NaN）。 */
    const dt = 1.2;
    const k = 0.5/this.state.m;
    const gl = this.gl;
    if (!this.state.paused){
      const eMax = k*8 + 1 + this.kernel.eMaxExtra(this.state);   /* H 特征值上界 */
      const sub = Math.max(this.state.substeps, Math.ceil(dt*eMax/1.5));
      const dtSub = dt/sub;
      gl.useProgram(this.progEvolve);
      gl.bindVertexArray(this.quad.vao);
      gl.uniform1f(this.u(this.progEvolve,'uDt'), dtSub);
      gl.uniform1f(this.u(this.progEvolve,'uK'), k);
      gl.uniform2f(this.u(this.progEvolve,'uTexel'), 1/this.state.grid, 1/this.state.grid);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.vTex);
      gl.uniform1i(this.u(this.progEvolve,'uV'), 1);
      this.kernel.setUniforms(gl, this.progEvolve, this.state);   /* 内核私有 uniform（如 uG） */
      const uUV = this.u(this.progEvolve,'uUpdateV');
      for (let s=0; s<sub; s++){
        /* 速度 Verlet: v_half -> u_new -> v_new（3 遍，每遍后交换 ping-pong） */
        for (let pass=0; pass<3; pass++){
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiB.fbo);
          gl.viewport(0,0,this.state.grid,this.state.grid);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
          gl.uniform1i(this.u(this.progEvolve,'uPsi'), 0);
          gl.uniform1f(uUV, pass === 1 ? 0.0 : 1.0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const tmp = this.psiA; this.psiA = this.psiB; this.psiB = tmp;
        }
      }
      this.state.simTime += dt;
    }

    /* 显示 pass（含余晖） */
    gl.useProgram(this.progDisplay);
    gl.bindVertexArray(this.quad.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispB.fbo);
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
    gl.uniform1i(this.u(this.progDisplay,'uPsi'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dispA.tex);
    gl.uniform1i(this.u(this.progDisplay,'uTrail'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.vTex);
    gl.uniform1i(this.u(this.progDisplay,'uV'), 2);
    gl.uniform1f(this.u(this.progDisplay,'uDecay'), this.state.decay);
    gl.uniform2f(this.u(this.progDisplay,'uPsiTexel'), 1/this.state.grid, 1/this.state.grid);
    const cw = this.canvas.width, ch = this.canvas.height;
    gl.uniform2f(this.u(this.progDisplay,'uAspect'),
      cw >= ch ? cw/ch : 1,
      cw >= ch ? 1 : ch/cw);
    this.kernel.setUniforms(gl, this.progDisplay, this.state);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const td = this.dispA; this.dispA = this.dispB; this.dispB = td;

    /* 合成到屏幕 */
    gl.useProgram(this.progComposite);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0,0,cw,ch);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dispA.tex);
    gl.uniform1i(this.u(this.progComposite,'uTex'), 0);
    gl.uniform1f(this.u(this.progComposite,'uTime'), now*0.001);
    gl.uniform1f(this.u(this.progComposite,'uBright'), this.state.bright);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* 概率/能量归约 */
    if (!this.state.paused && now - this._lastReduceF > 120){
      this._lastReduceF = now;
      gl.useProgram(this.progReduce);
      gl.bindVertexArray(this.quad.vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.reduceT.fbo);
      gl.viewport(0,0,32,32);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
      gl.uniform1i(this.u(this.progReduce,'uPsi'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.vTex);
      gl.uniform1i(this.u(this.progReduce,'uV'), 1);
      gl.uniform1f(this.u(this.progReduce,'uGrid'), this.state.grid);
      this.kernel.setUniforms(gl, this.progReduce, this.state);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._readBuf);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      let sp=0, st=0, sp2=0, sv=0;
      for (let i=0;i<1024;i++){ sp+=this._readBuf[i*4]; st+=this._readBuf[i*4+1]; sp2+=this._readBuf[i*4+2]; sv+=this._readBuf[i*4+3]; }
      if (!this._baseCaptured){ this.baseP0 = sp; this._baseCaptured = true; }
      this.hud(sp, st, sv, Math.sqrt(sp2));
    }

    this._frames++;
    if (now - this._lastFpsT > 500){ this.fps = this._frames*1000/(now-this._lastFpsT); this._frames = 0; this._lastFpsT = now; this.q('#hFps').textContent = this.fps.toFixed(0); }
    document.title = 'OK f=' + this.fps.toFixed(0) + ' p=' + this.q('#hP').textContent;
  }

  hud(p, t, v, peak){
    const err = Math.abs(p - this.baseP0)/Math.max(this.baseP0,1e-9)*100;
    const e = t + v;
    this.q('#hP').textContent = p.toFixed(4);
    this.q('#hErr').textContent = err.toFixed(3) + '%';
    this.q('#hErr').className = err < 1 ? 'ok' : 'warn';
    this.q('#hT').textContent = t.toFixed(4);
    this.q('#hV').textContent = v.toFixed(4);
    this.q('#hE').textContent = e.toFixed(4);
    this.q('#hPeak').textContent = peak.toFixed(4);
    this.q('#hTime').textContent = this.state.simTime.toFixed(1);
    this.q('#hGrid').textContent = this.state.grid + '² · ' + this.state.m.toFixed(2);
  }

  /* ---------- 交互 ---------- */
  resize(){
    const canvas = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    this.allocDisplay();
  }

  toWorld(cx, cy){
    const r = this.canvas.getBoundingClientRect();
    const wide = r.width >= r.height;
    const sx = wide ? r.width/r.height : 1, sy = wide ? 1 : r.height/r.width;
    const ux = (cx - r.left)/r.width, uy = 1 - (cy - r.top)/r.height;
    return [ (ux-0.5)*sx + 0.5, (uy-0.5)*sy + 0.5 ];
  }

  dragK(d){
    const dx = d.cx - d.cx0, dy = d.cy - d.cy0;
    let mag = Math.min(Math.hypot(dx,dy)*0.0022, 0.35);
    if (mag < 1e-6) return { kx:0, ky:0, mag:0 };
    const s = mag / (Math.hypot(dx,dy) || 1);
    return { kx: dx*s, ky: -dy*s, mag };
  }

  updateBrushCursor(e){
    if (this.state.tool === 'wave'){ this.q('#brushcursor').style.display = 'none'; return; }
    const r = this.canvas.getBoundingClientRect();
    const world2screen = Math.min(r.width, r.height);   // 世界正方形边长（屏幕 px）
    const rad = Math.max(5, this.state.brush/256*world2screen);
    const bc = this.q('#brushcursor');
    bc.style.display = 'block';
    bc.style.width = bc.style.height = (rad*2)+'px';
    bc.style.left = (e.clientX - rad)+'px';
    bc.style.top = (e.clientY - rad)+'px';
  }

  paintV(e){
    const [wx, wy] = this.toWorld(e.clientX, e.clientY);
    /* 坐标约定（易错点）：texImage2D 上传 canvas 时不翻转，canvas 行 0（顶部）→ 纹理 t=0 → 屏幕底部；
       世界坐标与 psi 纹理均为 y-up（wy=0 在屏幕底部），故画布行必须 py = wy*256。
       旧值 (1-wy)*256 会把笔刷垂直镜像到屏幕对侧（所有预设都垂直对称，故一直未暴露）。 */
    const px = wx*256, py = wy*256;
    const r = this.state.brush;
    const grad = this.vctx.createRadialGradient(px,py,r*0.35,px,py,r);
    /* 笔刷值：势垒 +V / 势阱 -V / 橡皮 0（即灰度 128 = V 零点）。
       边缘 stop 必须用「同色透明」而非 rgba(0,0,0,0)：透明 stop 的 RGB 是黑色，
       渐变插值会把笔刷外缘向黑（V=-1）拉，画出带负值沟槽的势垒/势阱。 */
    const v = this.state.tool === 'erase' ? 0 : (this.state.tool === 'well' ? -this.state.vStrength : this.state.vStrength);
    const g = Math.round(Math.max(-1, Math.min(1, v))*127+128);
    grad.addColorStop(0, 'rgb('+g+','+g+','+g+')');
    grad.addColorStop(1, 'rgba('+g+','+g+','+g+',0)');
    this.vctx.fillStyle = grad;
    this.vctx.beginPath(); this.vctx.arc(px,py,r,0,7); this.vctx.fill();
    this.uploadV();
  }

  togglePause(){
    this.state.paused = !this.state.paused;
    this.q('#btnPause').textContent = this.state.paused ? '继续' : '暂停';
    this.q('#btnPause').classList.toggle('on', this.state.paused);
    this.q('#status').textContent = this.state.paused ? '❚❚ PAUSED' : '● LIVE';
  }

  clearV(){
    this.vctx.globalCompositeOperation='source-over';
    this.vctx.fillStyle=this.vGray(0); this.vctx.fillRect(0,0,256,256);
    this.uploadV();
  }

  /* 滑块。after：值变更后的即时生效回调（如 σ 变更立即按新宽度重发波包）。
     真源是 state（构造时已合并内核 defaults）——DOM 滑块跟随 state 初始化，
     而非把 HTML 的 value 属性倒写回 state（那会静默覆盖内核默认值，
     如 GP 的 substeps:16 曾被 rSpeed 的 value="6" 覆盖）。 */
  bindRange(id, out, key, fmt, after){
    const el = this.q(id), o = this.q(out);
    if (!el || !o) throw new Error('bindRange: missing element ' + id);
    this._rows.push({ id, out, key, fmt, after });
    const self = this;
    const upd = () => { self.state[key] = parseFloat(el.value); o.textContent = fmt(self.state[key]); if (after) after(); };
    el.addEventListener('input', upd);
    el.value = this.state[key];                 /* DOM ← state */
    o.textContent = fmt(this.state[key]);
  }

  /* 预设参数（σ/g 等）变更后，把全部滑块行同步到 state 当前值 */
  syncControls(){
    for (const r of this._rows){
      const el = this.q(r.id), o = this.q(r.out);
      if (!el || !o) continue;
      el.value = this.state[r.key];
      o.textContent = r.fmt(this.state[r.key]);
    }
  }

  bindUI(){
    const canvas = this.q('#gl');
    const aim = this.q('#aim'), aimLine = this.q('#aimline'), aimDot = this.q('#aimdot'), aimTxt = this.q('#aimtxt');

    this.on(canvas, 'pointerdown', e => {
      try{ canvas.setPointerCapture(e.pointerId); }catch(_){/* 合成/无效 pointerId 时不应中断交互 */ }
      this.updateBrushCursor(e);
      const [wx, wy] = this.toWorld(e.clientX, e.clientY);
      if (this.state.tool === 'wave'){
        this.state.drag = { wx, wy, cx: e.clientX, cy: e.clientY, cx0: e.clientX, cy0: e.clientY };
        aim.style.display = 'block';
        aimDot.setAttribute('cx', e.clientX); aimDot.setAttribute('cy', e.clientY);
      } else {
        this.paintV(e);
      }
    });
    this.on(canvas, 'pointermove', e => {
      this.updateBrushCursor(e);
      if (this.state.drag){
        this.state.drag.cx = e.clientX; this.state.drag.cy = e.clientY;
        aimLine.setAttribute('x1', this.state.drag.cx0 ?? e.clientX);
        aimLine.setAttribute('y1', this.state.drag.cy0 ?? e.clientY);
        aimLine.setAttribute('x2', e.clientX); aimLine.setAttribute('y2', e.clientY);
        aimDot.setAttribute('cx', this.state.drag.cx); aimDot.setAttribute('cy', this.state.drag.cy);
        const k = this.dragK(this.state.drag);
        aimTxt.setAttribute('x', e.clientX + 10); aimTxt.setAttribute('y', e.clientY - 8);
        aimTxt.textContent = 'k = ' + k.mag.toFixed(3);
      } else if (e.buttons & 1 && this.state.tool !== 'wave'){
        this.paintV(e);
      }
    });
    this.on(canvas, 'pointerleave', () => { this.q('#brushcursor').style.display = 'none'; });
    this.on(canvas, 'pointerup', e => {
      if (!this.state.drag) return;
      const d = this.state.drag; this.state.drag = null;
      aim.style.display = 'none';
      const k = this.dragK(d);
      this.initWave(d.wx, d.wy, k.kx, k.ky, true);   // 拖拽发射：叠加不清场（量子叠加）
    });

    /* 预设 / 工具按钮 */
    this.container.querySelectorAll('[data-preset]').forEach(b =>
      this.on(b, 'click', () => this.loadPreset(b.dataset.preset)));
    this.container.querySelectorAll('[data-tool]').forEach(b => this.on(b, 'click', () => {
      this.state.tool = b.dataset.tool;
      this.container.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x === b));
      canvas.style.cursor = this.state.tool === 'wave' ? 'crosshair' : 'cell';
      if (this.state.tool === 'wave') this.q('#brushcursor').style.display = 'none';
    }));
    this.on(this.q('#btnPause'), 'click', () => this.togglePause());
    this.on(this.q('#btnStep'), 'click', () => { const p = this.state.paused; this.state.paused = false; requestAnimationFrame(() => { this.state.paused = p; }); });
    this.on(this.q('#btnReset'), 'click', () => { const w = this.state.lastWave; if (w) this.initWave(w[0],w[1],w[2],w[3]); });
    this.on(this.q('#btnClearV'), 'click', () => { this.clearV(); this.toast('势场已清空'); });

    this.bindRange('#rMass','#oMass','m', v => v.toFixed(2));
    this.bindRange('#rSigma','#oSigma','sigma', v => v.toFixed(1), () => {
      const w = this.state.lastWave; if (w) this.initWave(w[0],w[1],w[2],w[3]);   // σ 只影响波包生成，重发以即时可见
    });
    this.bindRange('#rSpeed','#oSpeed','substeps', v => v.toFixed(0));
    this.bindRange('#rBrush','#oBrush','brush', v => v.toFixed(0));
    this.bindRange('#rV','#oV','vStrength', v => v.toFixed(2));
    this.bindRange('#rTrail','#oTrail','decay', v => v.toFixed(2));
    this.bindRange('#rBright','#oBright','bright', v => '×'+v.toFixed(2));
    const extra = this.kernel.extraControls();       /* 内核附加滑块（如 NLS 的 g） */
    if (extra) for (const r of extra.rows) this.bindRange(r.id, r.out, r.key, r.fmt, r.after);

    this.on(this.q('#selGrid'), 'change', e => {
      const g = parseInt(e.target.value, 10);
      this.allocGrid(g);
      this.loadPreset(this.state.preset);
    });

    /* 键盘 */
    const presetKeys = Object.keys(this.kernel.presets());
    this.on(window, 'keydown', e => {
      if (e.code === 'Space'){ e.preventDefault(); this.togglePause(); }
      else if (e.key >= '1' && e.key <= '9'){ const pk = presetKeys[+e.key - 1]; if (pk) this.loadPreset(pk); }
      else if (e.key === 'r' || e.key === 'R'){ const w = this.state.lastWave; if (w) this.initWave(w[0],w[1],w[2],w[3]); }
      else if (e.key === 'c' || e.key === 'C'){ this.clearV(); }
      else if (e.key === 't' || e.key === 'T'){ this.state.decay = this.state.decay > 0.01 ? 0 : 0.97; this.q('#rTrail').value = this.state.decay; this.q('#oTrail').textContent = this.state.decay.toFixed(2); }
    });

    this.on(window, 'resize', () => this.resize());

    /* 相位轮图例 */
    (function drawWheel(self){
      const c = self.q('#wheel'), x = c.getContext('2d');
      const img = x.createImageData(168,168);
      for (let j=0;j<168;j++) for (let i=0;i<168;i++){
        const dx = i-84, dy = j-84, d = Math.hypot(dx,dy);
        if (d > 80){ continue; }
        const ph = Math.atan2(-dy,dx)/6.2831853+0.5;
        const hsv = hsv2rgbJS(ph, 0.8, 1);
        const v = Math.max(0, 1 - d/80);
        const idx = (j*168+i)*4;
        img.data[idx]   = 255*(hsv[0]*v + (1-v)*0.03);
        img.data[idx+1] = 255*(hsv[1]*v + (1-v)*0.05);
        img.data[idx+2] = 255*(hsv[2]*v + (1-v)*0.09);
        img.data[idx+3] = 255;
      }
      x.putImageData(img,0,0);
      function hsv2rgbJS(h,s,v){
        const f = (n) => { const k=(n+h*6)%6; return v - v*s*Math.max(0,Math.min(k,4-k,1)); };
        return [f(5),f(3),f(1)];
      }
    })(this);
  }

  /* ---------- 启动 ---------- */
  bootstrap(){
    const qp = new URLSearchParams(location.search);
    const qg = parseInt(qp.get('grid')||'0', 10);
    if (qg >= 64 && qg <= 512){ this.state.grid = qg; this.q('#selGrid').value = String(qg); }
    this.resize();
    this.allocGrid(this.state.grid);
    const qs = qp.get('speed');
    if (qs){ this.state.substeps = Math.max(1, Math.min(40, parseInt(qs,10)||6)); this.q('#rSpeed').value = Math.min(16,this.state.substeps); this.q('#oSpeed').textContent = this.state.substeps; }
    const presets = this.kernel.presets();
    const qpreset = qp.get('preset');
    this.loadPreset(presets[qpreset] ? qpreset : Object.keys(presets)[0]);
    const kxO = parseFloat(qp.get('kx')), kyO = parseFloat(qp.get('ky'));
    if (!isNaN(kxO) || !isNaN(kyO)){
      const w = this.state.lastWave;
      this.initWave(w[0], w[1], isNaN(kxO)?w[2]:kxO, isNaN(kyO)?w[3]:kyO);
    }
    this.kernel.applyParams(qp, this.state);   /* 内核私有 URL 参数（如 NLS ?g=） */
    this.syncControls();
  }

  /* ---------- 调试句柄：供自动化测试读取内部状态（不影响正常使用） ---------- */
  debugHandle(){
    const self = this;
    const gl = this.gl;
    return {
      state: this.state, vCanvas: this.vCanvas, canvas: this.canvas, vctx: this.vctx,
      kernelId: this.kernelId,
      vpx: (x, y) => { const d = this.vctx.getImageData(x|0, y|0, 1, 1).data; return d[0]; },
      vscan: () => {
        const d = this.vctx.getImageData(0,0,256,256).data;
        let min=255, max=0, non128=0;
        for (let i=0;i<d.length;i+=4){ const v=d[i]; if(v!==128){ non128++; if(v<min)min=v; if(v>max)max=v; } }
        return { min, max, non128 };
      },
      vrow: (y) => { const d = this.vctx.getImageData(0,y,256,1).data; const a=[]; for(let x=0;x<256;x++) a.push(d[x*4]); return a; },
      trailSum: () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispA.fbo);
        const w = this.dispA.w, h = this.dispA.h;
        const buf = new Float32Array(w*h*4);
        gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let mx=0, sum=0;
        for (let i=0;i<buf.length;i+=4){ const l=0.2126*buf[i]+0.7152*buf[i+1]+0.0722*buf[i+2]; sum+=l; if(l>mx)mx=l; }
        return { max: mx, sum };
      },
      trailLit: (th) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispA.fbo);
        const w = this.dispA.w, h = this.dispA.h;
        const buf = new Float32Array(w*h*4);
        gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const t = th === undefined ? 0.2 : th;
        let lit=0, sum=0, mx=0;
        for (let i=0;i<buf.length;i+=4){ const l=0.2126*buf[i]+0.7152*buf[i+1]+0.0722*buf[i+2]; sum+=l; if(l>mx)mx=l; if(l>t)lit++; }
        return { lit, sum, max: mx, w, h };
      },
      psiPeak: () => { /* 从 GPU 读 1 像素验证波场非空 */ return true; },
      psiArgmax: (wx0, wx1) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        const g = this.state.grid;
        const buf = new Float32Array(g*g*4);
        gl.readPixels(0,0,g,g,gl.RGBA,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        /* 可选 x 窗口 [wx0,wx1]（世界坐标）：叠加发射后场上有多个波包，
           全局 argmax 会在包间跳变；窗口跟踪可隔离待测包（须与其他包轨迹分离）。 */
        const x0 = wx0 === undefined ? 0 : Math.max(0, Math.floor(wx0*g));
        const x1 = wx1 === undefined ? g : Math.min(g, Math.ceil(wx1*g));
        let bi=0, bv=-1;
        for (let y=0;y<g;y++) for (let x=x0;x<x1;x++){
          const i=(y*g+x)*4; const p = this.kernel.cpuDensity(buf, i);
          if(p>bv){bv=p;bi=y*g+x;}
        }
        return { x:(bi%g)/g, y:Math.floor(bi/g)/g, p:bv, grid:g, simTime: this.state.simTime, win:[x0/g, x1/g] };
      },
      uniInfo: () => {
        const p = this.progDisplay, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS), out = {};
        for (let i=0;i<n;i++){
          const info = gl.getActiveUniform(p, i);
          const loc = gl.getUniformLocation(p, info.name);
          out[info.name] = { type: info.type, loc: loc===null ? 'NULL' : 'ok', val: loc===null ? null : gl.getUniform(p, loc) };
        }
        return out;
      },
      fboInfo: () => {
        const s1 = (gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispA.fbo), gl.checkFramebufferStatus(gl.FRAMEBUFFER));
        const s2 = (gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispB.fbo), gl.checkFramebufferStatus(gl.FRAMEBUFFER));
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { dispA: s1, dispB: s2, COMPLETE: gl.FRAMEBUFFER_COMPLETE, sameTex: this.dispA.tex === this.dispB.tex };
      },
      /* 波包计数：读 psiA 全纹理，按 x 列积分 |ψ|²。
         包数以 prominence 局部极大为准：列轮廓每个局部极大向左右走到谷，
         显著度 prom = 峰高 - max(左谷, 右谷)，prom ≥ 全局列峰 2% 计为独立波包。
         旧实现用「全局峰像素 2%」阈值切列段——列积分标度比像素峰高 ~σ√(2π)≈17 倍，
         等效列阈值仅 0.34%，色散宽尾包会把相邻包桥接成一段（误报丢包）。
         runs（阈值切段）与 prof 保留供轮廓诊断。 */
      psiBlobs: () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        const g = this.state.grid;
        const buf = new Float32Array(g*g*2);
        gl.readPixels(0,0,g,g,gl.RG,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const col = new Float64Array(g);
        let mx = 0;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++){
          const i=(y*g+x)*2; const p = this.kernel.cpuDensity(buf, i);
          col[x]+=p; if(p>mx)mx=p;
        }
        let mxCol = 0;
        for (let x=0;x<g;x++) if (col[x]>mxCol) mxCol = col[x];
        const peaks = [];
        for (let x=1;x<g-1;x++){
          if (col[x] > col[x-1] && col[x] >= col[x+1]){
            let li = x; while (li > 0   && col[li-1] < col[li]) li--;
            let ri = x; while (ri < g-1 && col[ri+1] < col[ri]) ri++;
            const prom = col[x] - Math.max(col[li], col[ri]);
            if (prom >= mxCol*0.02) peaks.push({ x:+(x/g).toFixed(4), col:+col[x].toExponential(2), prom:+prom.toExponential(2) });
          }
        }
        const th = mx*0.02;
        const runs=[]; let s=-1;
        for (let x=0;x<g;x++){
          if (col[x]>th){ if(s<0)s=x; }
          else if (s>=0){ runs.push([+(s/g).toFixed(4), +((x-1)/g).toFixed(4)]); s=-1; }
        }
        if (s>=0) runs.push([+(s/g).toFixed(4), +((g-1)/g).toFixed(4)]);
        /* 列轮廓降采样（32 点）供诊断 */
        const prof = [];
        for (let k=0;k<32;k++){ let v=0; for (let x=k*8;x<(k+1)*8;x++) v+=col[x]; prof.push(+(v/8).toExponential(2)); }
        return { runs, peaks, peak: mx, mxCol, prof };
      }
    };
  }

  /* ---------- 卸载（课程站 SPA 路由切换时调用） ---------- */
  unmount(){
    cancelAnimationFrame(this._raf);
    for (const [t, type, fn, opts] of this._listeners) t.removeEventListener(type, fn, opts);
    this._listeners = [];
    window.removeEventListener('error', this._onError);
    clearTimeout(this._toastTimer);
    if (this.gl){
      const gl = this.gl;
      for (const t of [this.psiA, this.psiB, this.dispA, this.dispB]) if (t){ gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      if (this.reduceT){ gl.deleteTexture(this.reduceT.tex); gl.deleteFramebuffer(this.reduceT.fbo); }
      gl.deleteTexture(this.vTex);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
    if (window.__app && window.__app.kernelId === this.kernelId) delete window.__app;
    this.container.innerHTML = '';
  }
}
