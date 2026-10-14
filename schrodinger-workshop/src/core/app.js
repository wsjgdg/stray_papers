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
import { TransmissionScanner } from './scan.js';

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
      decay: 0.97, bright: 1.0, gamma: 0, tool: 'wave', paused: false, simTime: 0,
      driveAmp: 0, driveOmega: 0.1, driveMode: 0,
      abX: 0.5, abY: 0.5, abPhi: 0,   /* AB 螺线管（世界坐标）与磁通 Φ（rad）；Φ=0 = 关 */
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
    this._lastFpsT = performance.now(); this._lastReduceF = 0; this._lastSpinF = 0;
    this.baseP0 = 1; this._baseCaptured = false;
    this._readBuf = new Float32Array(32*32*4);
    this._readBuf2 = new Float32Array(32*32*4);   /* MRT 附件 1：世界坐标概率矩 */
    this._readBuf3 = new Float32Array(32*32*4);   /* MRT 附件 2：分轴动能 + 均值动量 */
    this._lastE = null;                            /* 最近一次归约的逐粒子总能（能级对照） */
    this._raf = 0;
    this.scanner = new TransmissionScanner(this);  /* 透射率扫描工具（内核无模型时面板隐藏） */
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
    /* 内核附加控件；引擎注入两个行为回调：
       reinit        —— 按 lastWave 重发波包（初相类参数：Pauli 自旋角）
       refreshParamHud —— 参数派生 HUD 刷新（B 场读数等，暂停时拖滑块也即时） */
    const extra = k.extraControls(() => this.reinitWave(), () => this.refreshParamHud());
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
    <div class="grid3" style="margin-top:6px">
      <button data-tool="flux">磁通(AB)</button>
    </div>
  </div>
  <div class="sec">
    <h3>物理参数</h3>
    <div class="row"><label>质量 m</label><input type="range" id="rMass" min="0.15" max="4" step="0.05" value="1"><output id="oMass">1.00</output></div>
    <div class="row"><label>波包宽度 σ</label><input type="range" id="rSigma" min="4" max="40" step="0.5" value="7"><output id="oSigma">7.0</output></div>
    <div class="row"><label>积分子步</label><input type="range" id="rSpeed" min="1" max="16" step="1" value="6"><output id="oSpeed">6</output></div>
    <div class="row"><label>笔刷半径</label><input type="range" id="rBrush" min="3" max="40" step="1" value="10"><output id="oBrush">10</output></div>
    ${extraHtml}
  </div>
  <div class="sec">
    <h3>势场强度</h3>
    <div class="row"><label>V 值</label><input type="range" id="rV" min="0.01" max="1" step="0.01" value="0.3"><output id="oV">0.30</output></div>
  </div>
  <div class="sec">
    <h3>开放系统</h3>
    <div class="row"><label>耗散 γ</label><input type="range" id="rGamma" min="0" max="0.2" step="0.005" value="0"><output id="oGamma">0.000</output></div>
  </div>
  <div class="sec">
    <h3>含时外场</h3>
    <div class="row"><label>驱动幅值 A</label><input type="range" id="rDriveAmp" min="0" max="0.5" step="0.005" value="0"><output id="oDriveAmp">0.000</output></div>
    <div class="row"><label>驱动频率 ω</label><input type="range" id="rDriveOmega" min="0.01" max="0.5" step="0.01" value="0.1"><output id="oDriveOmega">0.10</output></div>
    <div class="row"><label>驱动模式</label>
      <select id="selDriveMode">
        <option value="0" selected>均匀 AC Stark</option>
        <option value="1">x 行波驱动</option>
      </select>
    </div>
  </div>
  <div class="sec" id="scanSec">
    <h3>透射率扫描</h3>
    <div class="row"><label>V0/E 下限</label><input type="range" id="rScanLo" min="0.05" max="2" step="0.05" value="0.25"><output id="oScanLo">0.25</output></div>
    <div class="row"><label>V0/E 上限</label><input type="range" id="rScanHi" min="0.1" max="4" step="0.05" value="2.2"><output id="oScanHi">2.20</output></div>
    <div class="row"><label>扫描点数</label><input type="range" id="rScanN" min="3" max="25" step="1" value="13"><output id="oScanN">13</output></div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnScan">开始扫描</button>
      <button id="btnScanStop" disabled>中止</button>
    </div>
    <div class="row"><label>状态</label><span id="scanStat">就绪</span></div>
    <canvas id="scanCanvas" width="420" height="260"></canvas>
    <div class="hint" style="margin-top:4px">矩势垒 x=120 w=16（全高）· 波包 kx=0.3 σ=18 · 256² 网格 · 实测 vs Δk 卷积理论（E=V0 左侧为隧穿区）</div>
  </div>
  <div class="sec">
    <h3>AB 磁通</h3>
    <div class="row"><label>磁通 Φ</label><input type="range" id="rABPhi" min="0" max="6.2832" step="0.01" value="0"><output id="oABPhi">0.00</output></div>
    <div class="row"><label>螺线管位置</label><output id="oABPos">(0.50, 0.50)</output><button id="btnABCenter">置中</button></div>
    <div class="row"><label>放置方式</label><span class="hint">选「磁通(AB)」工具后点击画布</span></div>
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
    <div class="grid2" style="margin-top:6px">
      <button id="btnExportV">导出势场</button>
      <button id="btnImportV">导入势场</button>
    </div>
    <input type="file" id="fileImportV" accept=".json,application/json" style="display:none">
  </div>
</aside>

<section id="hud" class="panel">
  <div class="hrow"><span>总概率 P</span><span id="hP">—</span></div>
  <div class="hrow"><span>守恒误差</span><span id="hErr">—</span></div>
  <hr>
  <div class="hrow"><span>动能 ⟨T⟩</span><span id="hT">—</span></div>
  <div class="hrow"><span>势能 ⟨V⟩</span><span id="hV">—</span></div>
  <div class="hrow"><span>总能 E</span><span id="hE">—</span></div>
  <div class="hrow"><span>驱动 V_d(中心)</span><span id="hDrive">—</span></div>
  <div class="hrow"><span>AB 磁通 Φ</span><span id="hAB">关</span></div>
  <hr>
  <div class="hrow"><span>Δx, Δy</span><span id="hDxy">—</span></div>
  <div class="hrow"><span>Δk_x, Δk_y</span><span id="hDkxy">—</span></div>
  <div class="hrow"><span>Δx·Δk_x</span><span id="hProdX">—</span></div>
  <div class="hrow"><span>Δy·Δk_y</span><span id="hProdY">—</span></div>
  <div class="hrow"><span>质心 k</span><span id="hKc">—</span></div>
  <div id="ladderSec" style="display:none">
    <hr>
    <div class="hrow"><span>能级阶梯</span><span id="hLadKind">—</span></div>
    <div class="hrow"><span>E → 最近能级</span><span id="hLadNear">—</span></div>
  </div>
  <div id="spinSec" style="display:none">
    <hr>
    <div class="hrow"><span>⟨σ_x⟩</span><span id="hSX">—</span></div>
    <div class="hrow"><span>⟨σ_y⟩</span><span id="hSY">—</span></div>
    <div class="hrow"><span>⟨σ_z⟩</span><span id="hSZ">—</span></div>
    <div class="hrow"><span>|⟨σ⟩|</span><span id="hSLen">—</span></div>
    <div class="hrow"><span>磁场 B</span><span id="hB">—</span></div>
  </div>
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
    this.sh = sh;                           /* CN 路径探测：sh.cnRhs 存在 ⟺ kernel.integrator='cn' */
    this.progEvolve = createProgram(gl, sh.evolve);
    this.progDisplay = createProgram(gl, sh.display);
    this.progComposite = createProgram(gl, FS_COMPOSITE);
    this.progReduce = createProgram(gl, sh.reduce);
    this.progBlit = createProgram(gl, FS_BLIT);
    this.progScale = createProgram(gl, sh.scale);   /* 耗散帧级衰减 pass */
    /* CN 积分器（kernel.integrator='cn'，当前仅 Dirac）：rhs pass + block-Jacobi
       扫掠 pass 两个额外 program（契约见 kernel.js 头注【CN 积分器约定】） */
    if (sh.cnRhs){
      this.progCnRhs = createProgram(gl, sh.cnRhs);
      this.progCnSweep = createProgram(gl, sh.cnSweep);
    }
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
    if (this.rhs){ gl.deleteTexture(this.rhs.tex); gl.deleteFramebuffer(this.rhs.fbo); this.rhs = null; }
    this.psiA = makeTarget(gl, g, g, this.ifmt, this.fmt, gl.NEAREST);
    this.psiB = makeTarget(gl, g, g, this.ifmt, this.fmt, gl.NEAREST);
    /* CN 路径的 rhs 固定纹理（每子步由 cnRhs 重写、12 次扫掠期间只读） */
    if (this.kernel.integrator === 'cn'){
      this.rhs = makeTarget(gl, g, g, this.ifmt, this.fmt, gl.NEAREST);
    }
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
    /* 内核私有初相参数（Pauli 的 spinTheta/spinPhi 等）随 state 透传给 makeWave；
       无此概念的内核忽略多余字段（makeWave 按需读取 p.spinTheta ?? 默认）。
       m=state.m 供一阶内核（Dirac）构造裸质量依赖的正能旋量；标量内核忽略。 */
    const { data, sum: rawSum } = this.kernel.makeWave(g, { fx, fy, kx, ky, sigma: this.state.sigma, m: this.state.m,
                                                              spinTheta: this.state.spinTheta, spinPhi: this.state.spinPhi });
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
      sum = 0;   /* 重算总概率：理论上 n/(n+1)+1/(n+1)=1，重算吸收旧场演化浮点漂移，保持 P 严格归一。
                    全通道求和（pairs=2 时 zw 两通道也是概率，不能只加 xy——旧代码 i+=2
                    只覆盖分量 1，Pauli 双分量下归一化系数错 √2，P 与干涉图样全错）。 */
      for (let i=0;i<data.length;i++) sum += data[i]*data[i];
    } else {
      this.state.waveCount = 1;                /* 清场发射（预设/重置/σ 调整/URL 参数）：场回到单包 */
    }
    const s = 1/Math.sqrt(sum);
    for (let i=0; i<data.length; i++) data[i] *= s;
    gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.ifmt, g, g, 0, this.fmt, gl.FLOAT, data);
    this.state.lastWave = [fx, fy, kx, ky];
    this.state.simTime = 0;
    /* 自旋 HUD 即时刷新：自旋角滑块/重置/预设切换都走 initWave，帧循环节流
       （120ms）在暂停时会停摆——此处直接刷新，暂停态改自旋也立即可见。 */
    if (this.kernel.spinReadout) this.spinHud();
  }

  /* 按 lastWave 原参数重发波包（内核 extraControls 的 after 回调用）：
     自旋角属初相——变更后须重发才生效（演化中的场不会因初相参数改变而变）。 */
  reinitWave(){
    const w = this.state.lastWave;
    if (w) this.initWave(w[0], w[1], w[2], w[3]);
  }

  /* ---------- 分区域概率（透射率扫描的测量原语；调试句柄同源） ---------- */
  /* 一次 readPixels 直读 psiA，按世界坐标 xSplit 把概率分为左/右两半，
     同时给出质心 x 与总 P——透射/反射测量与停止判据共用同一原子快照，
     无归约节流（120ms）的时间斜偏。xSplit 为世界坐标（0..1）。 */
  probSplit(xSplit){
    const gl = this.gl, g = this.state.grid;
    const ch = this.kernel.pairs === 2 ? 4 : 2;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
    const buf = new Float32Array(g*g*ch);
    gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const xs = Math.max(0, Math.min(g, Math.floor(xSplit*g)));
    let sL = 0, sR = 0, sx = 0;
    for (let y=0; y<g; y++){
      const row = y*g;
      for (let x=0; x<g; x++){
        const i = (row + x)*ch;
        const p = this.kernel.cpuDensity(buf, i);   /* 全分量 |ψ|²（pairs 感知） */
        if (x < xs) sL += p; else sR += p;
        sx += x*p;
      }
    }
    const P = sL + sR;
    return { left: sL, right: sR, P, T: P > 0 ? sR/P : 0, comX: P > 0 ? (sx/P)/g : 0, simTime: this.state.simTime };
  }

  /* ---------- 自旋测量（Pauli 内核；纯引擎层原始求和，无物理公式） ---------- */
  /* 一次 readPixels 直读 psiA，产出布洛赫向量的原始求和：
       re12 = ΣRe(ψ₁*ψ₂), im12 = ΣIm(ψ₁*ψ₂), n1 = Σ|ψ₁|², n2 = Σ|ψ₂|², P = n1+n2
     物理解释（⟨σx⟩=2re12/P 等）由内核 spinRead(rawSum) 给出——引擎只求和、
     不写公式（架构洁癖：app.js 不含物理）。仅 pairs=2 有意义；pairs=1 时
     ψ₂≡0 ⟹ re12=im12=n2=0（不调用即可）。 */
  spinSum(){
    const gl = this.gl, g = this.state.grid;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
    const buf = new Float32Array(g*g*4);
    gl.readPixels(0,0,g,g,gl.RGBA,gl.FLOAT,buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let re12=0, im12=0, n1=0, n2=0;
    for (let i=0;i<buf.length;i+=4){
      const a=buf[i], b=buf[i+1], c=buf[i+2], d=buf[i+3];
      n1 += a*a + b*b; n2 += c*c + d*d;
      re12 += a*c + b*d;      /* Re(ψ₁*ψ₂) = ac+bd */
      im12 += a*d - b*c;      /* Im(ψ₁*ψ₂) = ad−bc（共轭在左） */
    }
    return { re12, im12, n1, n2, P: n1+n2 };
  }

  /* HUD 自旋区刷新：⟨σx⟩/⟨σy⟩/⟨σz⟩/|⟨σ⟩|（kernel.spinRead 物理解释）。
     调用点：frame() 120ms 节流（与 reduce 同频）+ initWave 末尾（暂停态即时）。 */
  spinHud(){
    if (!this.kernel.spinReadout) return;
    const s = this.kernel.spinRead(this.spinSum());
    this.q('#hSX').textContent = s.sx.toFixed(4);
    this.q('#hSY').textContent = s.sy.toFixed(4);
    this.q('#hSZ').textContent = s.sz.toFixed(4);
    const el = this.q('#hSLen');
    el.textContent = s.len.toFixed(4);
    el.className = s.len > 0.999 && s.len < 1.001 ? 'ok' : '';
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
    this.refreshParamHud();   /* 参数派生 HUD（B 场行/透射面板门控）随预设参数刷新 */
    this.toast(p.name);
  }

  toast(msg){
    const t = this.q('#toast'); t.textContent = msg; t.style.opacity = 1;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.style.opacity = 0, 900);
  }

  /* ---------- 主循环 ---------- */
  /* 单帧物理推进（CN 或 KDK 速度 Verlet + 耗散帧级衰减）。
     从 frame() 原样抽出：uniform 序列、子步自适应、ping-pong、simTime 累移
     与 dissipation 逐字不变——frame()（每 tick 一次）与透射率扫描
     （boost 倍频）共用同一路径，物理零差异。调用方负责暂停判定。
     kernel.integrator='cn'（当前仅 Dirac）走 CN 路径，其余 KDK 逐字不变。 */
  evolve(){
    const dt = 1.2;
    if (this.kernel.integrator === 'cn'){
      this.evolveCN(dt);
    } else {
      this.evolveKDK(dt);
    }
    /* 耗散（开放系统）：帧级标量衰减 e^{-γ·dt}，精确且与子步/网格/内核解耦；
       γ=0 时跳过——厄米路径零改动。u/v 两通道同乘（v 是 KDK 辅助量，同步缩放
       保持 u/v 比例，下一步 kick 的 H·u 作用不受影响）。CN 后通用：标量乘法
       对任意态成立，与积分器无关。 */
    if (this.state.gamma !== 0){
      const s = Math.exp(-this.state.gamma * dt);
      const gl = this.gl;
      gl.useProgram(this.progScale);
      gl.bindVertexArray(this.quad.vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiB.fbo);
      gl.viewport(0,0,this.state.grid,this.state.grid);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
      gl.uniform1i(this.u(this.progScale,'uPsi'), 0);
      gl.uniform1f(this.u(this.progScale,'uScale'), s);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const tmp = this.psiA; this.psiA = this.psiB; this.psiB = tmp;
    }
  }

  /* KDK 速度 Verlet 一帧推进（标量/NLS/GP/Pauli 路径；从 evolve() 原样抽出） */
  evolveKDK(dt){
    const k = 0.5/this.state.m;
    const gl = this.gl;
    const eMax = k*8 + 1 + this.kernel.eMaxExtra(this.state) + Math.abs(this.state.driveAmp);   /* H 特征值上界（含时外场幅值计入稳定界） */
    const sub = Math.max(this.state.substeps, Math.ceil(dt*eMax/1.5));
    const dtSub = dt/sub;
    gl.useProgram(this.progEvolve);
    gl.bindVertexArray(this.quad.vao);
    gl.uniform1f(this.u(this.progEvolve,'uDt'), dtSub);
    gl.uniform1f(this.u(this.progEvolve,'uK'), k);
    gl.uniform2f(this.u(this.progEvolve,'uTexel'), 1/this.state.grid, 1/this.state.grid);
    /* 含时外场：相位取帧中点 φ = ω·(t+dt/2)——KDK 对时变 H 的标准中点冻结
       （二阶精度）；此处 simTime 仍是帧初值。相位由 simTime 派生而非累加：
       暂停即冻结、重置/序列化口径一致，无额外运行时态。 */
    const dPhase = this.state.driveOmega * (this.state.simTime + dt*0.5);
    gl.uniform1f(this.u(this.progEvolve,'uDriveAmp'), this.state.driveAmp);
    gl.uniform1f(this.u(this.progEvolve,'uDrivePhase'), dPhase);
    gl.uniform1i(this.u(this.progEvolve,'uDriveMode'), this.state.driveMode);
    /* Aharonov-Bohm：Φ=0 → uABOn=0 走原 5 点 stencil（精确等价旧路径）；
       link 相位算子厄米且谱半径不变（|U|=1），P 守恒、E_max 不变。 */
    gl.uniform1f(this.u(this.progEvolve,'uABOn'), this.state.abPhi === 0 ? 0 : 1);
    gl.uniform2f(this.u(this.progEvolve,'uABPos'), this.state.abX, this.state.abY);
    gl.uniform1f(this.u(this.progEvolve,'uABPhi'), this.state.abPhi);
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

  /* CN 积分器一帧推进（kernel.integrator='cn'，当前仅 Dirac）——推导与数值
     验证记录见 dirac.js 头注【积分器】节、klein_td4.py。KDK 对混合通道的
     一阶 M（α·p 把 ψ₂ 导数耦合进 ψ₁ 方程）结构性失效（映射谱半径 1.0216，
     范数爆炸）；CN 的 Cayley 矩阵严格正交（G=−J·M 斜对称）⟹ 无条件稳定、
     总概率机器精度守恒。
     (I−hG)w_{n+1}=(I+hG)w_n，h=dt_sub/2：因子 2 是 CN 的正确离散（两边同用
     全 h 等效步长 2h、动力学快一倍——时间域单模相位率实测确认）。每子步：
     cnRhs 一遍（w_n→rhs 固定纹理）+ 12 次 block-Jacobi 扫掠（收缩 ~0.18/
     迭代，截断 ~1e-9；收敛性记录见 kernel.js TPL_CN_SWEEP 注释）。 */
  evolveCN(dt){
    const k = 0.5/this.state.m;
    const eMax = k*8 + 1 + this.kernel.eMaxExtra(this.state) + Math.abs(this.state.driveAmp);
    const sub = Math.max(this.state.substeps, Math.ceil(dt*eMax/1.5));
    const hh = 0.5*dt/sub;
    /* 含时外场相位与 KDK 同口径：帧中点冻结 φ = ω·(t+dt/2) */
    const dPhase = this.state.driveOmega * (this.state.simTime + dt*0.5);
    this._cnSteps(sub, hh, dPhase, 1/this.state.grid, false);
    this.state.simTime += dt;
  }

  /* CN 步进 n 个子步（rhs pass + 12 扫掠/子步）——evolveCN 与 manualPass 共用。
     diag=true 时驱动/AB 归零（manualPass 诊断口径，与 KDK 路径一致）。
     纹理约定：cnRhs/cnSweep 的 uPsi=TEX0、uV=TEX1；cnSweep 追加 uRhs=TEX2。 */
  _cnSteps(n, hh, dPhase, tx, diag){
    const gl = this.gl, g = this.state.grid;
    this._setCNUniforms(this.progCnRhs, hh, dPhase, tx, diag);
    this._setCNUniforms(this.progCnSweep, hh, dPhase, tx, diag);
    for (let i=0; i<n; i++){
      /* 1) rhs pass：w_n(psiA) → this.rhs（本子步固定，扫掠期间只读） */
      gl.useProgram(this.progCnRhs);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.rhs.fbo);
      gl.viewport(0,0,g,g);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
      gl.uniform1i(this.u(this.progCnRhs,'uPsi'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      /* 2) 12 次 block-Jacobi 扫掠：x_0=w_n，x_{k+1}=(I−hGloc)⁻¹(rhs+h·Gkin(x_k))；
             psiA/psiB ping-pong，末态回 psiA（与 KDK 路径同一不变式） */
      gl.useProgram(this.progCnSweep);
      for (let it=0; it<12; it++){
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiB.fbo);
        gl.viewport(0,0,g,g);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
        gl.uniform1i(this.u(this.progCnSweep,'uPsi'), 0);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.rhs.tex);
        gl.uniform1i(this.u(this.progCnSweep,'uRhs'), 2);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const tmp = this.psiA; this.psiA = this.psiB; this.psiB = tmp;
      }
    }
  }

  /* CN program 共享 uniform 序列（uDtHalf/uTexel/drive/AB/uV/内核私有）——两个
     program 的 uniform 名逐字相同，但取值是 program 级状态，须逐 program 设置。 */
  _setCNUniforms(prog, hh, dPhase, tx, diag){
    const gl = this.gl, st = this.state;
    /* uniform 设置前必须先成为当前 program（引擎全路径惯例）；否则本 GL
       后端对非当前 program 的 uniform 写入静默失败——hh=0 ⟹ CN 退化为恒等
       映射 ⟹ 全场冻结（2026-10-14 R31 诊断：manualPass 前后 texel 逐位不变）。 */
    gl.useProgram(prog);
    gl.uniform1f(this.u(prog,'uDtHalf'), hh);
    gl.uniform2f(this.u(prog,'uTexel'), tx, tx);
    gl.uniform1f(this.u(prog,'uDriveAmp'), diag ? 0 : st.driveAmp);
    gl.uniform1f(this.u(prog,'uDrivePhase'), dPhase);
    gl.uniform1i(this.u(prog,'uDriveMode'), diag ? 0 : st.driveMode);
    gl.uniform1f(this.u(prog,'uABOn'), (diag || st.abPhi === 0) ? 0 : 1);
    gl.uniform2f(this.u(prog,'uABPos'), st.abX, st.abY);
    gl.uniform1f(this.u(prog,'uABPhi'), diag ? 0 : st.abPhi);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.vTex);
    gl.uniform1i(this.u(prog,'uV'), 1);
    this.kernel.setUniforms(gl, prog, st);   /* 内核私有 uniform（Dirac 的 uMass 等） */
  }

  frame(now){
    this._raf = requestAnimationFrame(this.frame);
    const k = 0.5/this.state.m;
    const gl = this.gl;
    if (!this.state.paused) this.evolve();

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
    /* AB 螺线管标记（与演化同开关：Φ=0 不画环） */
    gl.uniform1f(this.u(this.progDisplay,'uABOn'), this.state.abPhi === 0 ? 0 : 1);
    gl.uniform2f(this.u(this.progDisplay,'uABPos'), this.state.abX, this.state.abY);
    gl.uniform1f(this.u(this.progDisplay,'uABPhi'), this.state.abPhi);
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

    /* 概率/能量/矩归约（MRT 三附件：
       0 = (Σp, uK·ΣT, Σp², ΣVp)，1 = 世界坐标矩 (Σx·p,Σy·p,Σx²·p,Σy²·p)，
       2 = 分轴动能 (uK·ΣT_x, uK·ΣT_y)） */
    if (!this.state.paused && now - this._lastReduceF > 120){
      this._lastReduceF = now;
      gl.useProgram(this.progReduce);
      gl.bindVertexArray(this.quad.vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.reduceT.fbo);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);   /* MRT（FBO 级状态，不影响其他 pass） */
      gl.viewport(0,0,32,32);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
      gl.uniform1i(this.u(this.progReduce,'uPsi'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.vTex);
      gl.uniform1i(this.u(this.progReduce,'uV'), 1);
      gl.uniform1f(this.u(this.progReduce,'uGrid'), this.state.grid);
      gl.uniform1f(this.u(this.progReduce,'uK'), k);                  /* 动能 ×uK → 物理 T（与 KDK 守恒能量同单位） */
      this.kernel.setUniforms(gl, this.progReduce, this.state);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._readBuf);
      gl.readBuffer(gl.COLOR_ATTACHMENT1);
      gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._readBuf2);
      gl.readBuffer(gl.COLOR_ATTACHMENT2);
      gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._readBuf3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      let sp=0, st=0, sp2=0, sv=0, sx=0, sy=0, sxx=0, syy=0, stx=0, sty=0, pmx=0, pmy=0;
      for (let i=0;i<1024;i++){
        sp+=this._readBuf[i*4]; st+=this._readBuf[i*4+1]; sp2+=this._readBuf[i*4+2]; sv+=this._readBuf[i*4+3];
        sx+=this._readBuf2[i*4]; sy+=this._readBuf2[i*4+1]; sxx+=this._readBuf2[i*4+2]; syy+=this._readBuf2[i*4+3];
        stx+=this._readBuf3[i*4]; sty+=this._readBuf3[i*4+1];
        pmx+=this._readBuf3[i*4+2]; pmy+=this._readBuf3[i*4+3];
      }
      if (!this._baseCaptured){ this.baseP0 = sp; this._baseCaptured = true; }
      this.hud(sp, st, sv, Math.sqrt(sp2), {sx, sy, sxx, syy, stx, sty, pmx, pmy});
    }

    /* 自旋 HUD（Pauli 内核）：与 reduce 同频 120ms 节流（spinSum 也是一次
       全纹理 readPixels，不跟 reduce 合并以避免归约路径混入自旋测量） */
    if (this.kernel.spinReadout && !this.state.paused && now - this._lastSpinF > 120){
      this._lastSpinF = now;
      this.spinHud();
    }

    this._frames++;
    if (now - this._lastFpsT > 500){ this.fps = this._frames*1000/(now-this._lastFpsT); this._frames = 0; this._lastFpsT = now; this.q('#hFps').textContent = this.fps.toFixed(0); }
    document.title = 'OK f=' + this.fps.toFixed(0) + ' p=' + this.q('#hP').textContent;
  }

  hud(p, t, v, peak, mom){
    const err = Math.abs(p - this.baseP0)/Math.max(this.baseP0,1e-9)*100;
    /* 能量口径（R27 修正）：reduce 的 st 现为 uK·ΣKINETIC = T_phys·P（物理动能和，
       与 KDK 守恒的离散能量 uK·st+sv 同单位）；HUD 显示逐粒子期望值 ⟨T⟩=st/P、
       ⟨V⟩=sv/P——旧口径把裸 p² 二次型当「动能 T」（差 2m 倍）、E 混用两种单位，
       标签与值不符，且无法与能级阶梯的本征值对照，已修。 */
    const P = Math.max(p, 1e-12);
    const T = t/P, V = v/P;
    const e = T + V;
    this._lastE = e;
    this.q('#hP').textContent = p.toFixed(4);
    this.q('#hErr').textContent = err.toFixed(3) + '%';
    this.q('#hErr').className = err < 1 ? 'ok' : 'warn';
    this.q('#hT').textContent = T.toFixed(4);
    this.q('#hV').textContent = V.toFixed(4);
    this.q('#hE').textContent = e.toFixed(4);
    /* 含时外场瞬时值 + AB 磁通读数：参数派生、不依赖 GPU 归约——
       暂停时拖滑块也即时刷新（抽出 refreshParamHud，滑块 after 回调共用） */
    this.refreshParamHud();
    this.q('#hPeak').textContent = peak.toFixed(4);
    this.q('#hTime').textContent = this.state.simTime.toFixed(1);
    this.q('#hGrid').textContent = this.state.grid + '² · ' + this.state.m.toFixed(2);
    /* 不确定原理（ℏ=1，per-axis 紧致界）：Δx/Δy 取世界坐标矩；k 为世界波数
       （k=grid·p_格点），故 Δx·Δk_x ≥ ½（与 Δx_格点·Δp_x_格点 同一不等式）。
       ⟨p_x²⟩=2m·⟨T_x⟩（4 阶 stencil）；⟨p_x⟩=Im(ψ*∂_xψ) 均值（reduce o2.z，
       与 ⟨p_x²⟩ 同算子，全 Fourier 一致）——R28 前用质心速度差分（m·v_c），
       实测其测的是离散群速度 ⟨sin k⟩/m 而非 ⟨k⟩（kx=0.09 时低 0.1%~1.1%，
       与 sin(kx)·e^{−Δp²/2} 精确吻合），与 ⟨k²⟩ 混用致 Δk 虚高（σ=18 +2%），
       已改为梯度版均值；_momPrev 差分整条移除，Δk 首帧即可读（无「—」空窗）。
       2D 高斯波包恰好饱和 Δx·Δk_x=½——不确定原理的饱和态，直接可视化。 */
    if (mom && p > 1e-9){
      const g = this.state.grid, m = this.state.m;
      const mx = mom.sx/P, my = mom.sy/P;
      const dx = Math.sqrt(Math.max(0, mom.sxx/P - mx*mx));
      const dy = Math.sqrt(Math.max(0, mom.syy/P - my*my));
      this.q('#hDxy').textContent = dx.toFixed(4) + ', ' + dy.toFixed(4);
      const px2 = 2*m*(mom.stx/P), py2 = 2*m*(mom.sty/P);   /* ⟨p_x²⟩,⟨p_y²⟩（格点） */
      const pvx = mom.pmx/P, pvy = mom.pmy/P;               /* ⟨p_x⟩,⟨p_y⟩ = Im(ψ*∂ψ) 均值（格点） */
      const dkx = g*Math.sqrt(Math.max(0, px2 - pvx*pvx));  /* Δk_x（世界波数） */
      const dky = g*Math.sqrt(Math.max(0, py2 - pvy*pvy));
      this.q('#hDkxy').textContent = dkx.toFixed(3) + ', ' + dky.toFixed(3);
      const prodX = dx*dkx, prodY = dy*dky;
      const setProd = (sel, prod) => {
        const el = this.q(sel);
        el.textContent = prod.toFixed(3) + (prod >= 0.5 ? '' : ' <½');
        el.className = prod >= 0.5 ? 'ok' : 'warn';
      };
      setProd('#hProdX', prodX);
      setProd('#hProdY', prodY);
      this.q('#hKc').textContent = '(' + (g*pvx).toFixed(2) + ', ' + (g*pvy).toFixed(2) + ')';
    }
  }

  /* 参数派生 HUD 读数（磁通 Φ / 驱动 V_d 瞬时值 / 能级阶梯）：纯 state 计算，无 GPU 成本 */
  refreshParamHud(){
    /* 含时外场瞬时值（世界中心 x=½ 处）：均匀模式 A·cos(φ)；行波模式
       A·cos(π−φ) = −A·cos(φ)。仅作显示，物理演化以 shader 内的 V_d 为准。 */
    const dPhi = this.state.driveOmega * (this.state.simTime + 0.6);
    const dv = this.state.driveAmp * (this.state.driveMode === 1 ? -Math.cos(dPhi) : Math.cos(dPhi));
    this.q('#hDrive').textContent = this.state.driveAmp === 0 ? '关' : dv.toFixed(4);
    /* AB 磁通：0 = 关闭（等价无矢势）；非零显示弧度 + 2π 份额 */
    this.q('#hAB').textContent = this.state.abPhi === 0 ? '关'
      : this.state.abPhi.toFixed(3) + ' rad (' + (this.state.abPhi/6.2831853).toFixed(2) + '×2π)';
    /* 磁场读数（Pauli 内核；参数派生，暂停时拖 B 滑块也即时刷新——滑块 after
       回调注入 refreshParamHud）。显示三分量 + |B| + 梯度（SG 场）。 */
    if (this.kernel.spinReadout && this.q('#hB')){
      const b = this.state;
      this.q('#hB').textContent = '(' + b.bX.toFixed(3) + ', ' + b.bY.toFixed(3) + ', ' + b.bZ.toFixed(3) + ')' +
        ' |B|=' + Math.hypot(b.bX, b.bY, b.bZ).toFixed(4) +
        (b.bGrad !== 0 ? ' g=' + b.bGrad.toFixed(4) : '');
    }
    /* 透射率扫描面板动态门控：模型可用性可以是参数派生的（Pauli：B=0 有模型、
       B≠0 无模型）——预设切换/B 滑块变更后即时反映（仅在实际变化时写 style，
       避免每 tick 无谓的布局失效）。 */
    const scanSec = this.q('#scanSec');
    if (scanSec){
      const hasModel = !!(this.kernel.transmissionModel && this.kernel.transmissionModel(this.state));
      const want = hasModel ? '' : 'none';
      if (scanSec.style.display !== want) scanSec.style.display = want;
    }
    /* 能级阶梯（内核可选）：解析谱 + 最近能级对照。最近能级用最近一次归约的
       ⟨E⟩（_lastE）——暂停时归约停跑，该行保持上次读数而非清零。 */
    const lad = this.kernel.energyLevels ? this.kernel.energyLevels(this.state) : null;
    const sec = this.q('#ladderSec');
    if (!lad){ sec.style.display = 'none'; return; }
    sec.style.display = '';
    this.q('#hLadKind').textContent = lad.kind + ' · ' + lad.param;
    const e = this._lastE;
    if (e == null || !isFinite(e)){ this.q('#hLadNear').textContent = '—'; return; }
    const r = lad.nearest(e);
    const fmtE = v => Math.abs(v) < 1e-3 ? v.toExponential(2) : v.toFixed(6);
    this.q('#hLadNear').textContent = 'E' + r.label + ' = ' + fmtE(r.e);
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
    if (this.state.tool === 'wave' || this.state.tool === 'flux'){ this.q('#brushcursor').style.display = 'none'; return; }
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

  /* ---------- 势场序列化 / 导入导出 ---------- */
  /* JSON 单文件存档：势场灰度（256² R 通道，V∈[-1,1] 编码 g=round(V*127+128）+
     物理参数白名单。引擎级参数（m/σ/substeps/笔刷/V 值/拖尾/亮度）与内核私有参数
     （如 NLS/GP 的 g）一并存档；运行时态（paused/simTime/lastWave/waveCount/
     drag/tool）与结构键（grid）不存档。势场画布恒 256²，与模拟网格解耦。 */
  serializeState(){
    const d = this.vctx.getImageData(0, 0, 256, 256).data;
    const gray = new Uint8Array(256*256);
    for (let i = 0; i < gray.length; i++) gray[i] = d[i*4];   /* R 通道（vGray 写入时 R=G=B） */
    let bin = '';
    for (let i = 0; i < gray.length; i++) bin += String.fromCharCode(gray[i]);
    const SKIP = new Set(['grid','paused','simTime','preset','lastWave','waveCount','drag','tool']);
    const params = {};
    for (const k of Object.keys(this.state)){
      if (SKIP.has(k)) continue;
      const v = this.state[k];
      if (typeof v === 'number' && isFinite(v)) params[k] = v;
    }
    return {
      format: 'schrodinger-workshop.potential',
      version: 1,
      kernel: this.kernelId,
      state: params,
      potential: { grid: 256, encoding: 'gray-v', data: btoa(bin) },
    };
  }

  exportPotential(){
    const obj = this.serializeState();
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'potential-' + this.kernelId + '-' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.toast('势场已导出（' + (blob.size/1024).toFixed(1) + ' KB）');
  }

  importPotentialData(obj){
    if (!obj || obj.format !== 'schrodinger-workshop.potential' || obj.version !== 1)
      throw new Error('不是有效的势场存档（format/version 不匹配）');
    if (obj.kernel !== this.kernelId)
      throw new Error('存档内核为 ' + obj.kernel + '，当前为 ' + this.kernelId);
    const p = obj.potential;
    if (!p || p.grid !== 256 || p.encoding !== 'gray-v' || typeof p.data !== 'string')
      throw new Error('存档势场段无效');
    const bin = atob(p.data);
    if (bin.length !== 256*256) throw new Error('存档势场长度不符: ' + bin.length);
    const gray = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) gray[i] = bin.charCodeAt(i);
    const img = this.vctx.createImageData(256, 256);
    for (let i = 0; i < gray.length; i++){
      const g = gray[i];
      img.data[i*4] = g; img.data[i*4+1] = g; img.data[i*4+2] = g; img.data[i*4+3] = 255;
    }
    this.vctx.globalCompositeOperation = 'source-over';
    this.vctx.putImageData(img, 0, 0);
    this.uploadV();
    /* 参数恢复：仅白名单标量键（须已存在于 state）；运行时态/结构键不碰 */
    const SKIP = new Set(['grid','paused','simTime','preset','lastWave','waveCount','drag','tool']);
    let n = 0;
    for (const k of Object.keys(obj.state || {})){
      if (SKIP.has(k)) continue;
      const v = obj.state[k];
      if (typeof v === 'number' && isFinite(v) && k in this.state){ this.state[k] = v; n++; }
    }
    this.syncControls();
    this.toast('势场已导入（恢复 ' + n + ' 项参数）');
    return n;
  }

  importPotentialFile(file){
    const r = new FileReader();
    r.onload = () => {
      try { this.importPotentialData(JSON.parse(r.result)); }
      catch (err){ this.toast('导入失败: ' + err.message); }
    };
    r.onerror = () => this.toast('导入失败: 文件读取错误');
    r.readAsText(file);
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
    const dm = this.q('#selDriveMode');       /* 驱动模式下拉（非滑块行，单独同步） */
    if (dm) dm.value = String(this.state.driveMode);
    const abp = this.q('#oABPos');            /* AB 螺线管位置读数（预设 params 可能改 abX/abY） */
    if (abp) abp.textContent = '(' + this.state.abX.toFixed(2) + ', ' + this.state.abY.toFixed(2) + ')';
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
      } else if (this.state.tool === 'flux'){
        /* AB 螺线管放置：点击即落点（世界坐标）；磁通 Φ 由滑块控制，
           Φ=0 时画环隐藏、演化走标准路径（点放无副作用） */
        this.state.abX = wx; this.state.abY = wy;
        this.q('#oABPos').textContent = '(' + wx.toFixed(2) + ', ' + wy.toFixed(2) + ')';
        this.toast('AB 螺线管 → (' + wx.toFixed(2) + ', ' + wy.toFixed(2) + ')');
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
      } else if (e.buttons & 1 && this.state.tool !== 'wave' && this.state.tool !== 'flux'){
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
      canvas.style.cursor = (this.state.tool === 'wave' || this.state.tool === 'flux') ? 'crosshair' : 'cell';
      if (this.state.tool === 'wave') this.q('#brushcursor').style.display = 'none';
    }));
    this.on(this.q('#btnPause'), 'click', () => this.togglePause());
    this.on(this.q('#btnStep'), 'click', () => { const p = this.state.paused; this.state.paused = false; requestAnimationFrame(() => { this.state.paused = p; }); });
    this.on(this.q('#btnReset'), 'click', () => { const w = this.state.lastWave; if (w) this.initWave(w[0],w[1],w[2],w[3]); });
    this.on(this.q('#btnClearV'), 'click', () => { this.clearV(); this.toast('势场已清空'); });
    this.on(this.q('#btnExportV'), 'click', () => this.exportPotential());
    this.on(this.q('#btnImportV'), 'click', () => this.q('#fileImportV').click());
    this.on(this.q('#fileImportV'), 'change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) this.importPotentialFile(f);
      e.target.value = '';   /* 允许重复导入同一文件 */
    });

    this.bindRange('#rMass','#oMass','m', v => v.toFixed(2));
    this.bindRange('#rSigma','#oSigma','sigma', v => v.toFixed(1), () => {
      const w = this.state.lastWave; if (w) this.initWave(w[0],w[1],w[2],w[3]);   // σ 只影响波包生成，重发以即时可见
    });
    this.bindRange('#rSpeed','#oSpeed','substeps', v => v.toFixed(0));
    this.bindRange('#rBrush','#oBrush','brush', v => v.toFixed(0));
    this.bindRange('#rV','#oV','vStrength', v => v.toFixed(2));
    this.bindRange('#rGamma','#oGamma','gamma', v => v.toFixed(3));
    this.bindRange('#rDriveAmp','#oDriveAmp','driveAmp', v => v.toFixed(3), () => this.refreshParamHud());
    this.bindRange('#rDriveOmega','#oDriveOmega','driveOmega', v => v.toFixed(2), () => this.refreshParamHud());
    this.bindRange('#rABPhi','#oABPhi','abPhi', v => v.toFixed(2), () => this.refreshParamHud());
    this.on(this.q('#btnABCenter'), 'click', () => {
      this.state.abX = 0.5; this.state.abY = 0.5;
      this.q('#oABPos').textContent = '(0.50, 0.50)';
      this.toast('AB 螺线管已置中');
    });
    this.bindRange('#rTrail','#oTrail','decay', v => v.toFixed(2));
    this.bindRange('#rBright','#oBright','bright', v => '×'+v.toFixed(2));
    const extra = this.kernel.extraControls(() => this.reinitWave(), () => this.refreshParamHud());   /* 内核附加滑块（如 NLS 的 g / Pauli 自旋角） */
    if (extra) for (const r of extra.rows) this.bindRange(r.id, r.out, r.key, r.fmt, r.after);

    this.on(this.q('#selGrid'), 'change', e => {
      const g = parseInt(e.target.value, 10);
      this.allocGrid(g);
      this.loadPreset(this.state.preset);
    });

    this.on(this.q('#selDriveMode'), 'change', e => {
      this.state.driveMode = parseInt(e.target.value, 10) || 0;
      this.refreshParamHud();
    });

    /* 透射率扫描：参数为面板专用（不入 state——不污染势场序列化存档）。
       内核无解析透射模型（契约 transmissionModel 返回 null，如 NLS/GP）时隐藏面板。 */
    if (!(this.kernel.transmissionModel && this.kernel.transmissionModel(this.state)))
      this.q('#scanSec').style.display = 'none';
    /* 自旋 HUD 区：内核 spinReadout 能力标志（Pauli）时显示，否则隐藏 */
    if (this.kernel.spinReadout) this.q('#spinSec').style.display = '';
    const scanBind = (id, out, fmt) => {
      const el = this.q(id), o = this.q(out);
      const upd = () => { o.textContent = fmt(parseFloat(el.value)); };
      el.addEventListener('input', upd); upd();
    };
    scanBind('#rScanLo', '#oScanLo', v => v.toFixed(2));
    scanBind('#rScanHi', '#oScanHi', v => v.toFixed(2));
    scanBind('#rScanN', '#oScanN', v => String(v|0));
    this.on(this.q('#btnScan'), 'click', () => {
      this.scanner.start({
        v0Lo: parseFloat(this.q('#rScanLo').value),
        v0Hi: parseFloat(this.q('#rScanHi').value),
        v0N: parseInt(this.q('#rScanN').value, 10) || 13,
      });
    });
    this.on(this.q('#btnScanStop'), 'click', () => this.scanner.stop());

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
      /* 分区域概率（透射率扫描的测量原语；原子快照：左/右概率 + 质心 + 总 P） */
      probSplit: (x) => this.probSplit(x),
      /* 自旋布洛赫向量读数（Pauli 内核）：引擎 spinSum 原始求和 → 内核
         spinRead 物理解释 → {sx,sy,sz,len}。HUD 自旋区同源。 */
      spin: () => this.kernel.spinRead(this.spinSum()),
      /* 分量质心（Pauli 专用诊断）：直读 psiA，按 ↑/↓ 两分量分别求 x 质心
         与概率。引擎级纯测量（无物理解释）；SG 梯度力下两质心反向分离，
         分离量 ∝ t²（每分量半位移 ½·(uK·g/m)·t²/grid，见 pauli.js 头注）。
         pairs≠2 的内核返回 null。 */
      spinCom: () => {
        if (this.kernel.pairs !== 2) return null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        const g = this.state.grid;
        const buf = new Float32Array(g*g*4);
        gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let n1=0,n2=0,x1=0,x2=0;
        for (let i=0;i<buf.length;i+=4){
          const idx = i/4, x = idx%g;
          const p1 = buf[i]*buf[i]+buf[i+1]*buf[i+1];
          const p2 = buf[i+2]*buf[i+2]+buf[i+3]*buf[i+3];
          n1+=p1; n2+=p2; x1+=x*p1; x2+=x*p2;
        }
        return { x1:(x1/n1)/g, x2:(x2/n2)/g, n1, n2, P:n1+n2, simTime:this.state.simTime };
      },
      /* 透射率扫描器：start(opts)/stop()/busy/results/summary（CDP 驱动与读数） */
      scan: this.scanner,
      scanModel: () => (this.kernel.transmissionModel ? this.kernel.transmissionModel(this.state) : null),
      vpx: (x, y) => { const d = this.vctx.getImageData(x|0, y|0, 1, 1).data; return d[0]; },
      vscan: () => {
        const d = this.vctx.getImageData(0,0,256,256).data;
        let min=255, max=0, non128=0;
        for (let i=0;i<d.length;i+=4){ const v=d[i]; if(v!==128){ non128++; if(v<min)min=v; if(v>max)max=v; } }
        return { min, max, non128 };
      },
      vrow: (y) => { const d = this.vctx.getImageData(0,y,256,1).data; const a=[]; for(let x=0;x<256;x++) a.push(d[x*4]); return a; },
      serializeState: () => this.serializeState(),
      importPotentialData: (o) => this.importPotentialData(o),
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
      /* 质心 (x,y) 与总概率 P：直读 psiA 纹理（行波驱动下质心围绕阱心周期性
         振荡——含时外场空间力的直接可观测量；A=0 对称发射时质心应静止） */
      com: () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        const g = this.state.grid;
        const ch = this.kernel.pairs === 2 ? 4 : 2;
        const buf = new Float32Array(g*g*ch);
        gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let sx=0, sy=0, s=0;
        for (let i=0;i<buf.length;i+=ch){
          const p = this.kernel.cpuDensity(buf, i);
          const idx = i/ch;
          sx += (idx%g)*p; sy += Math.floor(idx/g)*p; s += p;
        }
        return { x:(sx/s)/g, y:(sy/s)/g, p:s, simTime: this.state.simTime };
      },
      /* 概率矩一次读回（CPU 直读 psiA，独立于 GPU 归约管线——不确定原理 HUD 的
         对账基准）：世界坐标矩 ⟨x⟩/⟨y⟩/⟨x²⟩/⟨y²⟩ + ⟨p²⟩。
         ⟨p²⟩ = −⟨ψ|lap_d|ψ⟩/P = Σ_links|Δψ|²/P（1-texel 链路含 Dirichlet
         边界链路，外侧=0；GPU reduce 用 4 阶中心差分，光滑场极限一致、
         边界/尖锐结构附近有小差——对账时以此为基准、HUD 读数为准）。 */
      moments: () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        const g = this.state.grid;
        const ch = this.kernel.pairs === 2 ? 4 : 2;
        const buf = new Float32Array(g*g*ch);
        gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let s=0, sx=0, sy=0, sxx=0, syy=0;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++){
          const i=(y*g+x)*ch;
          const p = this.kernel.cpuDensity(buf, i);
          const xw=(x+0.5)/g, yw=(y+0.5)/g;
          s+=p; sx+=xw*p; sy+=yw*p; sxx+=xw*xw*p; syy+=yw*yw*p;
        }
        let link=0, lx=0, ly=0;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++){
          const i=(y*g+x)*ch;
          for (let c=0;c<ch;c++){
            const u = buf[i+c];
            const xp = x+1<g ? buf[(y*g+x+1)*ch+c] : 0;   /* Dirichlet：界外=0 */
            const yp = y+1<g ? buf[((y+1)*g+x)*ch+c] : 0;
            const ddx = xp-u, ddy = yp-u;
            link += ddx*ddx + ddy*ddy;
            lx += ddx*ddx; ly += ddy*ddy;
          }
        }
        return { P:s, x:sx/s, y:sy/s, x2:sxx/s, y2:syy/s, p2:link/s, px2:lx/s, py2:ly/s, simTime:this.state.simTime };
      },
      /* 场统计一次读回：质心 x、总概率 P、若干采样点的 (re,im,|ψ|²,arg)。
         含时外场验证用：均匀驱动的纯整体相位、行波驱动下镜像点的密度/相位
         不对称性，均可由单次读回批量算出（避免每点多一次 readPixels）。 */
      fieldStats: (pts) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        const g = this.state.grid;
        const ch = this.kernel.pairs === 2 ? 4 : 2;
        const buf = new Float32Array(g*g*ch);
        gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let sx=0, s=0;
        for (let i=0;i<buf.length;i+=ch){
          const p = this.kernel.cpuDensity(buf, i);
          sx += ((i/ch)%g)*p; s += p;
        }
        const at = (wx, wy) => {
          const x = Math.min(g-1, Math.max(0, Math.round(wx*g)));
          const y = Math.min(g-1, Math.max(0, Math.round(wy*g)));
          const i = (y*g+x)*ch;
          /* re/im/arg = 第一复分量（pairs=1 时即全场；pairs=2 时补 re2/im2/arg2
             为第二分量）；p 恒为全分量密度（cpuDensity） */
          const o = { re: buf[i], im: buf[i+1], p: this.kernel.cpuDensity(buf, i), arg: Math.atan2(buf[i+1], buf[i]) };
          if (ch === 4){ o.re2 = buf[i+2]; o.im2 = buf[i+3]; o.arg2 = Math.atan2(buf[i+3], buf[i+2]); }
          return o;
        };
        const out = { comX: (sx/s)/g, P: s, simTime: this.state.simTime };
        for (const pt of (pts || [['C',0.5,0.5]])){
          if (pt[0] === 'comX' || pt[0] === 'P' || pt[0] === 'simTime')
            throw new Error('fieldStats: 采样点名与保留键冲突: ' + pt[0]);
          out[pt[0]] = at(pt[1], pt[2]);
        }
        return out;
      },
      /* AB 条纹诊断：读 psiA 在 wx（世界坐标 x）处的整列 (re,im,p,arg)。
         屏幕干涉图样 I(y) 的一阶傅里叶分量 m1(Φ) 由此列算出——AB 签名：
         条纹随 Φ 平移 ⟹ arg(m1) 随 Φ 近线性、m1(−Φ)=conj(m1(Φ))（奇函数）、
         |m1| 与 Φ 近似无关（换条纹位置不换对比度）。 */
      rowScan: (wx) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        const g = this.state.grid;
        const ch = this.kernel.pairs === 2 ? 4 : 2;
        const buf = new Float32Array(g*g*ch);
        gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const x = Math.min(g-1, Math.max(0, Math.round(wx*g)));
        const re = [], im = [], re2 = [], im2 = [], p = [];
        for (let y=0;y<g;y++){
          const i=(y*g+x)*ch;
          re.push(buf[i]); im.push(buf[i+1]);
          if (ch === 4){ re2.push(buf[i+2]); im2.push(buf[i+3]); }
          p.push(this.kernel.cpuDensity(buf, i));   /* 全分量 |ψ|² */
        }
        return { x, re, im, re2, im2, p, grid: g, simTime: this.state.simTime };
      },
      /* AB 螺线管标记环像素统计：读 dispA 全帧，数「蓝 > 红」像素（标记环为
         蓝色 vec3(0.55,0.75,1.0)；AB 预设势场仅暖色势垒，故 b>r 像素≈环）。
         Φ=0 不画环 ⟹ 计数≈0；Φ≠0 计数>0。 */
      dispBlue: () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispA.fbo);
        const w = this.dispA.w, h = this.dispA.h;
        const buf = new Float32Array(w*h*4);
        gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let blue = 0, sum = 0;
        for (let i=0;i<buf.length;i+=4){
          sum += buf[i]+buf[i+1]+buf[i+2];
          if (buf[i+2] > buf[i] + 0.05) blue++;
        }
        return { blue, sum, w, h };
      },
      /* GPU vs CPU 单步对比（诊断）：读当前 psiA，在 CPU 上按引擎同参数
         （sub 子步 × 3-pass KDK、uK=0.5/m、uDt=1.2/sub、V/驱动一致）复算 1 帧，
         回传两侧统计量。调用方随后单步 1 帧再读 com/probSum 与 cpu 预测比对。 */
      cpuPred: () => {
        const g = this.state.grid, ch = this.kernel.pairs === 2 ? 4 : 2;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        const buf = new Float32Array(g*g*ch);
        gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const vd = this.vctx.getImageData(0,0,256,256).data;
        const V = new Float32Array(g*g);
        for (let y=0;y<g;y++) for (let x=0;x<g;x++){
          const px = Math.min(255, Math.round(x/g*256)), py = Math.min(255, Math.round(y/g*256));
          V[y*g+x] = (vd[(py*256+px)*4]-128)/127;
        }
        const re0 = new Float64Array(g*g), im0 = new Float64Array(g*g);
        for (let i=0;i<g*g;i++){ re0[i]=buf[i*ch]; im0[i]=buf[i*ch+1]; }
        const k = 0.5/this.state.m, dt = 1.2;
        const eMax = k*8 + 1 + this.kernel.eMaxExtra(this.state) + Math.abs(this.state.driveAmp);
        const sub = Math.max(this.state.substeps, Math.ceil(dt*eMax/1.5));
        const dtSub = dt/sub;
        const dPhase = this.state.driveOmega*(this.state.simTime + dt*0.5);
        let re = re0, im = im0;
        const Hc = (x,y) => {
          const i = y*g+x;
          if (x<=0||x>=g-1||y<=0||y>=g-1) return [0,0];
          let v = V[i];
          if (this.state.driveAmp !== 0) v += this.state.driveAmp*(this.state.driveMode===1 ? Math.cos(6.28318530718*(x/g)-dPhase) : Math.cos(dPhase));
          return [-k*(re[i-1]+re[i+1]+re[i-g]+re[i+g]-4*re[i]) + v*re[i],
                  -k*(im[i-1]+im[i+1]+im[i-g]+im[i+g]-4*im[i]) + v*im[i]];
        };
        for (let s=0;s<sub;s++) for (let pass=0;pass<3;pass++){
          const nr = new Float64Array(g*g), ni = new Float64Array(g*g);
          for (let y=0;y<g;y++) for (let x=0;x<g;x++){
            const i=y*g+x;
            if (x<=0||x>=g-1||y<=0||y>=g-1) continue;
            const h = Hc(x,y);
            if (pass===1){ nr[i]=re[i]+dtSub*h[1]; ni[i]=im[i]; }
            else { nr[i]=re[i]; ni[i]=im[i]-0.5*dtSub*h[0]; }
          }
          re=nr; im=ni;
        }
        const stat = (r,m) => { let sx=0,s=0; for(let yy=0;yy<g;yy++) for(let xx=0;xx<g;xx++){const i=yy*g+xx;const p=r[i]*r[i]+m[i]*m[i];sx+=xx*p;s+=p;} return {comX:sx/s/g, P:s}; };
        window.__cpuPred = { re, im, g };   /* 供 cmpPred 与 GPU 实测逐点比对 */
        return { gpu: stat(re0,im0), cpu: stat(re,im), sub, dtSub, k };
      },
      /* 与 window.__cpuPred（cpuPred 留存）逐点比对当前 GPU 场 */
      cmpPred: () => {
        const cp = window.__cpuPred; if (!cp) throw new Error('cmpPred: 先调用 cpuPred');
        const g = this.state.grid, ch = this.kernel.pairs === 2 ? 4 : 2;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        const buf = new Float32Array(g*g*ch);
        gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let maxRe = 0, maxIm = 0, nBad = 0;
        const pts = [[0.18,0.5],[0.19,0.5],[0.20,0.5],[0.18,0.45],[0.30,0.5],[0.50,0.5],[0.10,0.5],[0.18,0.3]];
        const at = (wx,wy) => { const x=Math.round(wx*g), y=Math.round(wy*g); const i=y*g+x;
          return { gpu:[buf[i*ch],buf[i*ch+1]], cpu:[cp.re[i],cp.im[i]] }; };
        const detail = {};
        for (let i=0;i<g*g;i++){
          const dr = Math.abs(buf[i*ch]-cp.re[i]), di = Math.abs(buf[i*ch+1]-cp.im[i]);
          if (dr>maxRe) maxRe=dr; if (di>maxIm) maxIm=di;
          if (dr > 1e-3 || di > 1e-3) nBad++;
        }
        for (const [wx,wy] of pts){
          const d = at(wx,wy);
          detail[wx+','+wy] = { gpu: d.gpu.map(v=>+v.toFixed(5)), cpu: d.cpu.map(v=>+v.toFixed(5)) };
        }
        return { maxRe, maxIm, nBad, detail };
      },
      /* 手动跑 n 个 evolve pass（不经 frame；uUpdateV 序列与 frame 一致：kick,drift,kick）。
         诊断 GPU vs CPU 分叉用：n=1 单 kick 后 ψ 应几乎不变。
         texel 参数可覆盖 uTexel（诊断 uniform 是否生效）。
         CN 内核（integrator='cn'）：每步 = 1 个完整 CN 子步（dt=1.2/6 的半步
         hh=0.1，rhs + 12 扫掠），驱动/AB 归零——与 evolveCN 同路径。 */
      manualPass: (n, texel) => {
        const g0 = this.state.grid;
        const tx = texel === undefined ? 1/g0 : texel;
        const gl = this.gl;
        gl.bindVertexArray(this.quad.vao);
        if (this.kernel.integrator === 'cn'){
          this._cnSteps(n, 0.5*(1.2/6), 0, tx, true);
        } else {
        gl.useProgram(this.progEvolve);
        gl.uniform1f(this.u(this.progEvolve,'uDt'), 1.2/6);
        gl.uniform1f(this.u(this.progEvolve,'uK'), 0.5/this.state.m);
        gl.uniform2f(this.u(this.progEvolve,'uTexel'), tx, tx);
        gl.uniform1f(this.u(this.progEvolve,'uDriveAmp'), 0);
        gl.uniform1f(this.u(this.progEvolve,'uDrivePhase'), 0);
        gl.uniform1i(this.u(this.progEvolve,'uDriveMode'), 0);
        gl.uniform1f(this.u(this.progEvolve,'uABOn'), 0);
        gl.uniform2f(this.u(this.progEvolve,'uABPos'), 0.5, 0.5);
        gl.uniform1f(this.u(this.progEvolve,'uABPhi'), 0);
        this.kernel.setUniforms(gl, this.progEvolve, this.state);   /* 内核私有 uniform（Dirac 的 uMass 等）：暂停态手动步进时 evolve 帧循环可能尚未设置过 */
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.vTex);
        gl.uniform1i(this.u(this.progEvolve,'uV'), 1);
        for (let i=0;i<n;i++){
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiB.fbo);
          gl.viewport(0,0,g0,g0);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
          gl.uniform1i(this.u(this.progEvolve,'uPsi'), 0);
          gl.uniform1f(this.u(this.progEvolve,'uUpdateV'), i%3===1 ? 0.0 : 1.0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const tmp = this.psiA; this.psiA = this.psiB; this.psiB = tmp;
        }
        }
        const g = this.state.grid, ch = this.kernel.pairs === 2 ? 4 : 2;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        const buf = new Float32Array(g*g*ch);
        gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let sx=0,s=0;
        for (let i=0;i<buf.length;i+=ch){ const p=this.kernel.cpuDensity(buf, i); sx+=(i/ch)%g*p; s+=p; }
        const i18 = Math.round(0.5*g)*g + Math.round(0.18*g);   /* 索引 = y*g+x（易错：勿交换） */
        const row = a => { /* 波包中心行的 |ψ| 轮廓（前 64 点） */
          const y = Math.round(0.5*g); const out = [];
          for (let x=Math.round(0.18*g)-16; x<Math.round(0.18*g)+16; x++) out.push(+Math.hypot(a[(y*g+x)*ch], a[(y*g+x)*ch+1]).toExponential(1));
          return out; };
        return { n, comX:(sx/s)/g, P:s, c: [buf[i18*ch], buf[i18*ch+1]], row: row(buf) };
      },
      /* 精确总概率：直读 psiA 纹理（HUD 的 P 有 reduce 120ms 节流 + 4 位小数滞后，
         耗散衰减后期 P→0 时测试需要无滞后读数） */
      probSum: () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        const w = this.psiA.w, h = this.psiA.h;
        const ch = this.kernel.pairs === 2 ? 4 : 2;
        const buf = new Float32Array(w*h*ch);
        gl.readPixels(0,0,w,h,this.fmt,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let s = 0;
        for (let i = 0; i < buf.length; i += ch) s += this.kernel.cpuDensity(buf, i);
        return s;
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
        /* 按 pairs 选格式（旧代码固定 RGBA×4 通道读 RG32F 附件——依赖驱动
           宽容度，且 pairs=2 语义下 strid 也必须是 4） */
        const ch = this.kernel.pairs === 2 ? 4 : 2;
        const buf = new Float32Array(g*g*ch);
        gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        /* 可选 x 窗口 [wx0,wx1]（世界坐标）：叠加发射后场上有多个波包，
           全局 argmax 会在包间跳变；窗口跟踪可隔离待测包（须与其他包轨迹分离）。 */
        const x0 = wx0 === undefined ? 0 : Math.max(0, Math.floor(wx0*g));
        const x1 = wx1 === undefined ? g : Math.min(g, Math.ceil(wx1*g));
        let bi=0, bv=-1;
        for (let y=0;y<g;y++) for (let x=x0;x<x1;x++){
          const i=(y*g+x)*ch; const p = this.kernel.cpuDensity(buf, i);
          if(p>bv){bv=p;bi=y*g+x;}
        }
        return { x:(bi%g)/g, y:Math.floor(bi/g)/g, p:bv, grid:g, simTime: this.state.simTime, win:[x0/g, x1/g] };
      },
      uniInfo: (which) => {
        const p = which === 'evolve' ? this.progEvolve : this.progDisplay;
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS), out = {};
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
        /* 按 pairs 选格式（旧代码固定 RG×2 通道，pairs=2 时读回只有分量 1、
           且 RGBA32F 附件上 RG/FLOAT 读取非法） */
        const ch = this.kernel.pairs === 2 ? 4 : 2;
        const buf = new Float32Array(g*g*ch);
        gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const col = new Float64Array(g);
        let mx = 0;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++){
          const i=(y*g+x)*ch; const p = this.kernel.cpuDensity(buf, i);
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
    if (this.scanner) this.scanner.stop();   /* 停止扫描 rAF，恢复 paused/σ */
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
