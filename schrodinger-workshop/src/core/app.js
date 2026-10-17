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
import { createContext, createProgram, Quad, makeTarget, makeRGBA16F, makeReduce, makeTarget3D, FS_BLIT } from './gl.js';
import { getKernel, buildShaders } from '../physics/kernel.js';
import { injectStyles } from './styles.js';
import { TransmissionScanner } from './scan.js';
import { TransmissionScanner3 } from './scan.js';
import { SlitScanner } from './scan.js';
import { GpScanner, NlsScanner } from './scan.js';

/* ---------- 大数组 base64 助手（R37 3D 现场存档用）----------
   Float32Array ↔ base64（字节序 = 运行平台原生序，x86/ARM 均为小端；
   WebGL readPixels 产出的就是该字节序，round-trip 逐位一致）。
   分块 8192 走 String.fromCharCode.apply / charCodeAt——一次性 apply 整个
   MB 级数组会超调用栈参数上限（V8 ~65535）。 */
function f32ToB64(f32){
  const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let bin = '';
  const CH = 8192;
  for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(bin);
}
function b64ToF32(b64){
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  const CH = 8192;
  for (let i = 0; i < bin.length; i += CH){
    const end = Math.min(i + CH, bin.length);
    for (let j = i; j < end; j++) u8[j] = bin.charCodeAt(j);
  }
  return new Float32Array(u8.buffer);
}

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
    /* 3D 体积渲染轨道相机（kernel.dim3 时由 pointer/wheel 驱动；2D 内核不用） */
    this.cam = { theta: 0.7, phi: 0.35, dist: 2.2, drag: null };
    this.scanner = new TransmissionScanner(this);  /* 透射率扫描工具（内核无模型时面板隐藏） */
    this.scanner3 = new TransmissionScanner3(this);  /* 3D 透射扫描（R38；内核无 transmissionModel3 时面板隐藏） */
    this.scannerSlit = new SlitScanner(this);  /* 3D 双缝图样扫描（R40；内核非 3D 时面板隐藏） */
    /* 非线性内核参数扫描（R42）：GP（g<0 排斥侧，TF 云/涡旋）与 NLS（g>0
       focusing，孤子宽度/自聚焦发散）——共享一套面板 DOM，按内核选实例。 */
    this.scannerGp = new GpScanner(this);
    this.scannerNls = new NlsScanner(this);
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
    const d3 = !!k.dim3;               /* 3D 内核：隐藏 2D 专属面板区，挂 3D 体积渲染面板 */
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
  <div class="sec" ${d3?'style="display:none"':''}>
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
    <div class="row" ${d3?'style="display:none"':''}><label>波包宽度 σ</label><input type="range" id="rSigma" min="4" max="40" step="0.5" value="7"><output id="oSigma">7.0</output></div>
    <div class="row"><label>积分子步</label><input type="range" id="rSpeed" min="1" max="16" step="1" value="6"><output id="oSpeed">6</output></div>
    <div class="row" ${d3?'style="display:none"':''}><label>笔刷半径</label><input type="range" id="rBrush" min="3" max="40" step="1" value="10"><output id="oBrush">10</output></div>
    ${extraHtml}
  </div>
  <div class="sec" ${d3?'style="display:none"':''}>
    <h3>势场强度</h3>
    <div class="row"><label>V 值</label><input type="range" id="rV" min="0.01" max="1" step="0.01" value="0.3"><output id="oV">0.30</output></div>
  </div>
  <div class="sec" ${d3?'style="display:none"':''}>
    <h3>开放系统</h3>
    <div class="row"><label>耗散 γ</label><input type="range" id="rGamma" min="0" max="0.2" step="0.005" value="0"><output id="oGamma">0.000</output></div>
  </div>
  <div class="sec" ${d3?'style="display:none"':''}>
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
  <div class="sec" id="paramScanSec">
    <h3>非线性参数扫描</h3>
    <div class="row"><label>g 下限</label><input type="range" id="rParamLo" min="-20" max="-4" step="0.5" value="-20"><output id="oParamLo">-20.0</output></div>
    <div class="row"><label>g 上限</label><input type="range" id="rParamHi" min="-20" max="-4" step="0.5" value="-4"><output id="oParamHi">-4.0</output></div>
    <div class="row"><label>扫描点数</label><input type="range" id="rParamN" min="3" max="9" step="1" value="5"><output id="oParamN">5</output></div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnParamScan">开始扫描</button>
      <button id="btnParamScanStop" disabled>中止</button>
    </div>
    <div class="row"><label>状态</label><span id="paramScanStat">就绪</span></div>
    <canvas id="paramScanCanvas" width="420" height="300"></canvas>
    <div class="hint" style="margin-top:4px">GP：扫 g（排斥侧 g&lt;0，托马斯-费米云/涡旋）——测云半径 Rrms（⟹R_TF=√3·Rrms）、峰值 n₀、涡旋愈合层 ξ，与 TF 解析 R_TF=(2R_trap²|g|/π)^¼、n₀=μ/|g| 对照。NLS：扫 g（focusing 侧 g&gt;0，条带孤子）——测 σx/σy 与峰值末/初比（&gt;3 判自聚焦发散）。**固定测量窗 200 帧 + 全程序列**：非线性无耗散系统（呼吸模永久振荡、TOF 单调膨胀、孤子稳定传播）没有天然终点，故不用「清空/双稳」类停止判据，改由时间平均 + 摆动幅度给出结论。P 在两内核下守恒（幺正非线性），塌缩/网格截断导致的数值漂移属诚实限制。</div>
  </div>
  <div class="sec" ${d3?'style="display:none"':''}>
    <h3>AB 磁通</h3>
    <div class="row"><label>磁通 Φ</label><input type="range" id="rABPhi" min="0" max="6.2832" step="0.01" value="0"><output id="oABPhi">0.00</output></div>
    <div class="row"><label>螺线管位置</label><output id="oABPos">(0.50, 0.50)</output><button id="btnABCenter">置中</button></div>
    <div class="row"><label>放置方式</label><span class="hint">选「磁通(AB)」工具后点击画布</span></div>
  </div>
  <div class="sec">
    <h3>渲染与网格</h3>
    <div class="row"><label>画面亮度</label><input type="range" id="rBright" min="0.3" max="2.5" step="0.05" value="1"><output id="oBright">×1.00</output></div>
    <div class="row" ${d3?'style="display:none"':''}><label>余晖拖尾</label><input type="range" id="rTrail" min="0" max="0.99" step="0.01" value="0.97"><output id="oTrail">0.97</output></div>
    <div class="row" ${d3?'style="display:none"':''}><label>网格精度</label>
      <select id="selGrid">
        <option value="128">128² 流畅</option>
        <option value="192">192² 均衡</option>
        <option value="256" selected>256² 精细</option>
        <option value="320">320² 极致</option>
      </select>
    </div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnReset">重置波包</button>
      <span ${d3?'style="display:none"':''}><button id="btnClearV">清空势场</button></span>
    </div>
    <div class="grid2" style="margin-top:6px" ${d3?'style="display:none"':''}>
      <button id="btnExportV">导出势场</button>
      <button id="btnImportV">导入势场</button>
    </div>
    <input type="file" id="fileImportV" accept=".json,application/json" style="display:none">
  </div>
${d3 ? `
  <div class="sec" id="sec3d">
    <h3>3D 体积渲染</h3>
    <div class="row"><label>网格精度</label>
      <select id="selGrid3">
        <option value="32">32³ 流畅</option>
        <option value="48">48³ 均衡</option>
        <option value="64" selected>64³ 精细</option>
        <option value="96">96³ 极致</option>
        <option value="128">128³ 离线</option>
      </select>
    </div>
    <div class="row" id="intRow3"><label>积分器</label>
      <select id="selInt3">
        <option value="kdk" selected>KDK 速度 Verlet</option>
        <option value="cn">CN 严格正交</option>
      </select>
    </div>
    <div class="row"><label>射线步数</label><input type="range" id="rSteps3" min="16" max="128" step="8" value="48"><output id="oSteps3">48</output></div>
    <div class="row"><label>曝光</label><input type="range" id="rExp3" min="100" max="10000" step="100" value="3600"><output id="oExp3">3600</output></div>
    <div class="row"><label>波包宽度 σ</label><input type="range" id="rSigma3" min="2" max="20" step="0.5" value="6"><output id="oSigma3">6.0</output></div>
    <div class="row"><label>势垒 V₀</label><input type="range" id="rPotV0" min="0" max="5" step="0.005" value="0.02"><output id="oPotV0">0.020</output></div>
    <div class="row"><label>势垒半径 R</label><input type="range" id="rPotR" min="4" max="20" step="1" value="10"><output id="oPotR">10</output></div>
    <div class="row"><label>谐振子 ω</label><input type="range" id="rPotW" min="0.004" max="0.06" step="0.002" value="0.0156"><output id="oPotW">0.0156</output></div>
    <div class="row"><label>核电荷 Z</label><input type="range" id="rPotZ" min="0.1" max="0.5" step="0.01" value="0.25"><output id="oPotZ">0.25</output></div>
    <div class="row"><label>墙心 x₀</label><input type="range" id="rPotWallX" min="-20" max="20" step="1" value="0"><output id="oPotWallX">0</output></div>
    <div class="row"><label>墙厚 T</label><input type="range" id="rPotWallT" min="1" max="10" step="1" value="4"><output id="oPotWallT">4</output></div>
    <div class="row"><label>缝宽 W</label><input type="range" id="rPotSlitW" min="2" max="16" step="1" value="6"><output id="oPotSlitW">6</output></div>
    <div class="row"><label>缝距 D</label><input type="range" id="rPotSlitD" min="0" max="32" step="1" value="20"><output id="oPotSlitD">20</output></div>
    <div class="row"><label>第二势</label>
      <select id="selPotKind2">
        <option value="0" selected>无（单势）</option>
        <option value="1">球势垒</option>
        <option value="2">谐振子</option>
        <option value="3">库仑</option>
        <option value="4">双缝墙</option>
      </select>
    </div>
    <div class="row" id="rowPotV02"><label>叠加 V₀₂</label><input type="range" id="rPotV02" min="0" max="5" step="0.005" value="0.02"><output id="oPotV02">0.020</output></div>
    <div class="row" id="rowPotR2"><label>叠加半径 R₂</label><input type="range" id="rPotR2" min="4" max="20" step="1" value="10"><output id="oPotR2">10</output></div>
    <div class="row" id="rowPotW2"><label>叠加 ω₂</label><input type="range" id="rPotW2" min="0.004" max="0.06" step="0.002" value="0.0156"><output id="oPotW2">0.0156</output></div>
    <div class="row" id="rowPotZ2"><label>叠加 Z₂</label><input type="range" id="rPotZ2" min="0.1" max="0.5" step="0.01" value="0.25"><output id="oPotZ2">0.25</output></div>
    <div class="row" id="rowPotWallX2"><label>叠加墙心 x₂</label><input type="range" id="rPotWallX2" min="-20" max="20" step="1" value="0"><output id="oPotWallX2">0</output></div>
    <div class="row" id="rowPotWallT2"><label>叠加墙厚 T₂</label><input type="range" id="rPotWallT2" min="1" max="10" step="1" value="4"><output id="oPotWallT2">4</output></div>
    <div class="row" id="rowPotSlitW2"><label>叠加缝宽 W₂</label><input type="range" id="rPotSlitW2" min="2" max="16" step="1" value="6"><output id="oPotSlitW2">6</output></div>
    <div class="row" id="rowPotSlitD2"><label>叠加缝距 D₂</label><input type="range" id="rPotSlitD2" min="0" max="32" step="1" value="20"><output id="oPotSlitD2">20</output></div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnPhase3" class="on">相位着色</button>
      <button id="btnSlice3">切片模式</button>
    </div>
    <div class="row" id="sliceRow3" style="display:none"><label>切片层 z</label><input type="range" id="rSliceZ3" min="0" max="1" step="0.01" value="0.5"><output id="oSliceZ3">0.50</output></div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnCam3">重置相机</button>
      <button id="btnExport3">导出现场</button>
      <button id="btnImport3">导入现场</button>
    </div>
    <input type="file" id="fileImport3" accept=".json,application/json" style="display:none">
    <div class="hint" style="margin-top:4px">拖拽旋转 · 滚轮缩放。V₀/R 仅球势垒预设生效；ω/σ 决定谐振子基态（σ=1/√ω）；Z 仅氢原子预设生效（改动后波包按新 Z 重发）；墙心 x₀/墙厚 T/缝宽 W/缝距 D 仅双缝预设生效（D=0 退化为单缝，改动即时生效）。积分器：KDK 为速度 Verlet（默认，R34 已验证守恒）；CN 为 Crank-Nicolson + block-Jacobi，Cayley 矩阵严格正交、范数机器精度守恒——同预设下切换可对照二者离散误差（切换即时生效，不重发波包）。导出现场：参数 + 场数据 + 相机 + 积分器选择的单文件 JSON 存档（网格不符时拒绝导入，不重采样）。</div>
  </div>
  <div class="sec" id="scan3Sec">
    <h3>3D 透射扫描</h3>
    <div class="row"><label>V0/E 下限</label><input type="range" id="rScan3Lo" min="0.05" max="2" step="0.05" value="0.1"><output id="oScan3Lo">0.10</output></div>
    <div class="row"><label>V0/E 上限</label><input type="range" id="rScan3Hi" min="0.1" max="4" step="0.05" value="1.5"><output id="oScan3Hi">1.50</output></div>
    <div class="row"><label>扫描点数</label><input type="range" id="rScan3N" min="3" max="25" step="1" value="13"><output id="oScan3N">13</output></div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnScan3">开始扫描</button>
      <button id="btnScan3Stop" disabled>中止</button>
    </div>
    <div class="row"><label>状态</label><span id="scanStat3">就绪</span></div>
    <canvas id="scanCanvas3" width="420" height="260"></canvas>
    <div class="hint" style="margin-top:4px">球形势垒 R=6（世界单位）· 迎头波包 kx=0.7 σ=3 · 强制 64³（32³ 盒装不下首程测量窗：色散使相互作用持续到波包中心越盒，透射波完成前即打墙返回；软渲染 13 点约 5min，真实 GPU 秒级）· 实测 vs 射线修正模型（绿：含绕球透射的 3D 对照目标）与 s 波 Δk 卷积（琥珀）· 红虚线 = 共振预测位（q·R=nπ）· E=V0 左侧为越障共振区 · 实测值含波包绕球透射（l≥1 分波），系统性地高于 s 波曲线，详见 README「3D 透射率扫描」</div>
  </div>
  <div class="sec" id="slitScanSec">
    <h3>双缝图样扫描</h3>
    <div class="row"><label>D 下限</label><input type="range" id="rSlitScanLo" min="0" max="32" step="1" value="0"><output id="oSlitScanLo">0</output></div>
    <div class="row"><label>D 上限</label><input type="range" id="rSlitScanHi" min="0" max="32" step="1" value="32"><output id="oSlitScanHi">32</output></div>
    <div class="row"><label>扫描点数</label><input type="range" id="rSlitScanN" min="3" max="9" step="1" value="9"><output id="oSlitScanN">9</output></div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnSlitScan">开始扫描</button>
      <button id="btnSlitScanStop" disabled>中止</button>
    </div>
    <div class="row"><label>状态</label><span id="slitScanStat">就绪</span></div>
    <canvas id="slitScanCanvas" width="420" height="300"></canvas>
    <div class="hint" style="margin-top:4px">双缝墙 V₀=3 T=4 W=6（slits3d 口径）· 迎头波包 kx=1.2 σ=6 · 64³ · 每点重发波包、固定测量窗 [32,56] 帧等间隔取 4 次、记峰数最多帧（时间线确定性 R39 已验证：飞行时间只由 kx/σ 决定，与 D 无关）· 屏剖面为 x=24 处 z 求和（可分离性 ⟹ 等价 2D 衍射）· 琥珀虚线 = Fraunhofer 远场预测 y_n=nλL/D——深 Fresnel 区仅定性参考，偏差如实汇报 · D=0 为单缝退化对照点 · 9 点软渲染约 4min，真实 GPU 秒级</div>
  </div>` : ''}
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
  <div id="uncSec" ${d3?'style="display:none"':''}>
  <hr>
  <div class="hrow"><span>Δx, Δy</span><span id="hDxy">—</span></div>
  <div class="hrow"><span>Δk_x, Δk_y</span><span id="hDkxy">—</span></div>
  <div class="hrow"><span>Δx·Δk_x</span><span id="hProdX">—</span></div>
  <div class="hrow"><span>Δy·Δk_y</span><span id="hProdY">—</span></div>
  <div class="hrow"><span>质心 k</span><span id="hKc">—</span></div>
  </div>
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
  ${d3
    ? '<b>拖拽</b> 旋转视角 · <b>滚轮</b> 缩放 · <span class="k">1-'+Object.keys(presets).length+'</span> 预设 · <span class="k">Space</span> 暂停 · <span class="k">R</span> 重置波包'
    : '<b>拖拽</b> 发射波包（方向=动量 k）· <span class="k">1-'+Object.keys(presets).length+'</span> 预设 · <span class="k">Space</span> 暂停 · <span class="k">T</span> 拖尾 · <span class="k">R</span> 重置 · <span class="k">C</span> 清空势场'}
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
    /* CN 积分器（kernel.integrator='cn'，Dirac/Pauli）：rhs pass + block-Jacobi
       扫掠 pass 两个额外 program（契约见 kernel.js 头注【CN 积分器约定】） */
    if (sh.cnRhs){
      this.progCnRhs = createProgram(gl, sh.cnRhs);
      this.progCnSweep = createProgram(gl, sh.cnSweep);
    }
    /* 3D 体积路径（kernel.dim3=true，R34）：evolve3d（7 点拉普拉斯 KDK，逐层
       draw 全卷）+ volume（ray-march 显示）。2D program 仍编译（dim3 运行时
       不被引用）——buildShaders 对全部内核统一装配，零分支风险。 */
    if (sh.evolve3d){
      this.progEvolve3d = createProgram(gl, sh.evolve3d);
      this.progVolume = createProgram(gl, sh.display3d);
      this.progReduce3d = createProgram(gl, sh.reduce3d);   /* 全卷 GPU 归约（R35） */
      /* 3D CN（R36）：内核提供 cnLocalSolve3 ⟺ sh.cnRhs3d 存在。与 2D CN 的
         内核级开关不同，3D 是运行时切换（state.integrator3）——故只要内核支持
         就编译，evolve() 每帧按 state 分流；KDK 默认路径零改动。 */
      if (sh.cnRhs3d){
        this.progCnRhs3d = createProgram(gl, sh.cnRhs3d);
        this.progCnSweep3d = createProgram(gl, sh.cnSweep3d);
      }
    }
  }

  initTargets(){
    const gl = this.gl;
    /* 波函数纹理格式由内核分量数决定：1 对 → RG32F，2 对 → RGBA32F */
    this.fmt = this.kernel.pairs === 2 ? gl.RGBA : gl.RG;
    this.ifmt = this.kernel.pairs === 2 ? gl.RGBA32F : gl.RG32F;
    if (this.kernel.dim3){
      /* 3D：体积 ping-pong（RG32F n³）；2D psiA/psiB 不分配（3D 帧路径不引用，
         2D 调试句柄对 3D 内核调用会诚实地抛错而非返回垃圾） */
      this.allocGrid3d(this.state.grid);
    } else {
      this.allocGrid(this.state.grid);
    }
    this.reduceT = makeReduce(gl);
  }

  /* 3D 体积 ping-pong 目标（n³ RG32F NEAREST；fbo 不预附着层——evolve3d/回读
     每层 draw/read 前须 framebufferTextureLayer，契约见 gl.js makeTarget3D）。 */
  allocGrid3d(n){
    this.state.grid = n;
    const gl = this.gl;
    if (this.psiA3){
      gl.deleteTexture(this.psiA3.tex); gl.deleteFramebuffer(this.psiA3.fbo);
      gl.deleteTexture(this.psiB3.tex); gl.deleteFramebuffer(this.psiB3.fbo);
    }
    if (this.rhs3){ gl.deleteTexture(this.rhs3.tex); gl.deleteFramebuffer(this.rhs3.fbo); this.rhs3 = null; }
    this.psiA3 = makeTarget3D(gl, n, gl.RG32F, gl.RG, gl.NEAREST);
    this.psiB3 = makeTarget3D(gl, n, gl.RG32F, gl.RG, gl.NEAREST);
    /* CN3D 的 rhs 固定纹理（每子步由 cnRhs3d 重写、12 次扫掠期间只读）——仅在
       内核支持 CN3D 时分配（progCnRhs3d 在 initTargets 前已由 initPrograms 置位）；
       不支持时不占 n³ 显存。 */
    if (this.progCnRhs3d) this.rhs3 = makeTarget3D(gl, n, gl.RG32F, gl.RG, gl.NEAREST);
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
    if (this.kernel.dim3){
      const w = this.state.lastWave3;
      if (w) this.initWave3d({ wave3: w.wave3, kind: w.kind });
      return;
    }
    const w = this.state.lastWave;
    if (w) this.initWave(w[0], w[1], w[2], w[3]);
  }

  /* ---------- 3D 初态（引擎层：归一化 + 上传；形状由内核 makeWave3d 生成）----------
     p = 预设对象（wave3:[fx,fy,fz,kx,ky,kz] + kind）或 { wave3, kind } 重发参数。
     与 2D initWave 的差别：无 add 叠加分支（3D 交互是相机轨道，无拖拽发射）、
     无势场画布步骤（势经 pot3 解析注入）。归一化口径与 2D 一致：
     Σ|ψ|²=1（P 基座，HUD 守恒误差以此为基准）。 */
  initWave3d(p){
    const n = this.state.grid, gl = this.gl;
    const w3 = p.wave3 || [0.3, 0.5, 0.5, 0.12, 0, 0];
    const kind = p.kind || 'gaussian';
    const { data, sum } = this.kernel.makeWave3d(n, {
      fx: w3[0], fy: w3[1], fz: w3[2], kx: w3[3], ky: w3[4], kz: w3[5],
      sigma: this.state.sigma, kind, z: this.state.potZ,
    });
    const s0 = 1/Math.sqrt(sum);
    for (let i=0;i<data.length;i++) data[i] *= s0;
    gl.bindTexture(gl.TEXTURE_3D, this.psiA3.tex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RG32F, n, n, n, 0, gl.RG, gl.FLOAT, data);
    this.state.lastWave3 = { wave3: w3, kind };
    this.state.simTime = 0;
    this._baseCaptured = false; this.baseP0 = 1;   /* P 基座重捕（守恒误差口径） */
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
    if (p.params) Object.assign(this.state, p.params);   /* 内核预设参数（σ/g/potKind 等） */
    this.syncControls();
    if (this.kernel.dim3){
      /* 3D：无势场画布（势经 pot3 解析注入），初态走 initWave3d */
      this.initWave3d(p);
      this.q('#descName').textContent = p.name;
      this.q('#descText').textContent = p.text;
      this.container.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === key));
      this.refreshParamHud();
      this.toast(p.name);
      return;
    }
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
     kernel.integrator='cn'（Dirac 与 Pauli）走 CN 路径，其余 KDK 逐字不变；
     3D（dim3）由 state.integrator3 在 evolve3d/evolveCN3d 间运行时切换
     （R36；内核不支持 CN3D 时恒为 KDK）。 */
  evolve(){
    const dt = 1.2;
    if (this.kernel.dim3){
      /* 3D 体积路径（R34/R36）：7 点拉普拉斯 KDK 或 CN（state.integrator3），
         逐层 draw 全卷；无耗散帧级衰减（γ 面板对 3D 隐藏——scale pass 是
         2D 目标通路） */
      this._evolve3dFrame(dt);
      return;
    }
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

  /* CN 积分器一帧推进（kernel.integrator='cn'，Dirac/Pauli）——推导与数值
     验证记录见 dirac.js 头注【积分器】节、klein_td4.py。KDK 对混合通道的
     一阶 M（α·p 把 ψ₂ 导数耦合进 ψ₁ 方程）结构性失效（映射谱半径 1.0216，
     范数爆炸）；CN 的 Cayley 矩阵严格正交（G=−J·M 斜对称）⟹ 算法层无条件
     稳定、范数机器精度守恒（精确算术口径；GPU 实测残差 0.01–0.15%/长时程，
     来源为 RGBA32F 纹理 float32 舍入积累，无系统偏向，交互时标不可见——
     量化记录见 kernel.js CN 节头注）。
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

  /* 3D KDK 速度 Verlet 一帧推进（kernel.dim3；TPL_EVOLVE3D）。
     与 evolveKDK 同构（kick/drift/kick 交叉投影逐字一致），差异全在维度：
       · 7 点 stencil（谱半径 12）——eMax = uK·12（2D 为 uK·8）
       · uTexel3 = (1/N)³、uLayer = (l+0.5)/N（层中点）
       · 每 pass = N 次逐层 draw（framebufferTextureLayer 重绑 + 全屏三角形）：
         WebGL2 无法把 3D 纹理整体当附件，只能逐层写；全卷 pass 成本 = N×
         单层开销（R34 spike 实测：64³ 全卷 8.8ms/pass、128³ 105.6ms/pass，
         SwiftShader；逐层重绑的固定开销在 N 大时占主导）。
     无驱动/AB（3D 路径暂不支持，模板未预留该 uniform）；势经 kernel pot3
     解析注入（uPotKind 分支 + 私有 uniform），每帧设置一次（不随子步变化）。
     末态回 psiA3（与 2D 路径同一不变式：ping-pong 后 A 恒为当前场）。 */
  evolve3d(dt){
    const k = 0.5/this.state.m;
    const gl = this.gl, n = this.state.grid;
    const eMax = k*12 + 1 + this.kernel.eMaxExtra(this.state);
    const sub = Math.max(this.state.substeps, Math.ceil(dt*eMax/1.5));
    const dtSub = dt/sub;
    gl.useProgram(this.progEvolve3d);
    gl.bindVertexArray(this.quad.vao);
    gl.uniform1f(this.u(this.progEvolve3d,'uDt'), dtSub);
    gl.uniform1f(this.u(this.progEvolve3d,'uK'), k);
    gl.uniform3f(this.u(this.progEvolve3d,'uTexel3'), 1/n, 1/n, 1/n);
    gl.uniform1f(this.u(this.progEvolve3d,'uGrid3'), n);
    this.kernel.setUniforms(gl, this.progEvolve3d, this.state);   /* 私有 uniform（势参数） */
    const uUV = this.u(this.progEvolve3d,'uUpdateV');
    const uLayer = this.u(this.progEvolve3d,'uLayer');
    for (let s=0; s<sub; s++){
      for (let pass=0; pass<3; pass++){
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiB3.fbo);
        gl.viewport(0,0,n,n);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_3D, this.psiA3.tex);
        gl.uniform1i(this.u(this.progEvolve3d,'uPsi'), 0);
        gl.uniform1f(uUV, pass === 1 ? 0.0 : 1.0);
        for (let l=0; l<n; l++){
          gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.psiB3.tex, 0, l);
          gl.uniform1f(uLayer, (l + 0.5)/n);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        const tmp = this.psiA3; this.psiA3 = this.psiB3; this.psiB3 = tmp;
      }
    }
    this.state.simTime += dt;
  }

  /* 3D 单帧物理推进的分流点（R36）：state.integrator3='cn' 且内核支持 CN3D
     时走 evolveCN3d，否则 KDK（evolve3d）——默认 'kdk'，R34/R35 路径逐字不变。
     evolve() 与 manualPass3d 共用（诊断步进与实时帧走同一物理，零双轨偏差）。 */
  _evolve3dFrame(dt){
    if (this.state.integrator3 === 'cn' && this.progCnRhs3d) this.evolveCN3d(dt);
    else this.evolve3d(dt);
  }

  /* 3D CN 一帧推进（kernel.dim3 且 state.integrator3='cn'，R36；TPL_CN_RHS3D/
     TPL_CN_SWEEP3D）。与 evolve3d 同构（同样的 eMax/子步自适应/逐层 draw/末态
     回 psiA3 不变式），每子步两个全卷 pass 阶段：
       1) cnRhs3d 一遍：w_n(psiA3) → rhs3（本子步固定，扫掠期间只读）
       2) 12 次 block-Jacobi 扫掠：x_0=w_n，x_{k+1}=(I−hGloc)⁻¹(rhs+h·Gkin(x_k))；
          psiA3/psiB3 ping-pong（12 为偶数 ⟹ 末态回 psiA3，与 KDK 同一不变式）
     成本口径（R34 spike 同尺度外推 + R36 实测）：每子步 13 个全卷 pass vs KDK
     的 3 个——CN 的代价是 ~4.3× 绘制量，换 Cayley 严格正交（见 kernel.js CN 节）。
     无驱动/AB（3D 路径不支持）；势经 kernel.setUniforms 每帧设置一次
     （uDtHalf/uK/uTexel3/uGrid3 子步间不变，故只在帧首统一设置）。 */
  evolveCN3d(dt){
    const k = 0.5/this.state.m;
    const gl = this.gl, n = this.state.grid;
    const eMax = k*12 + 1 + this.kernel.eMaxExtra(this.state);
    const sub = Math.max(this.state.substeps, Math.ceil(dt*eMax/1.5));
    const hh = 0.5*dt/sub;
    /* 帧首统一设置两个 CN3D program 的子步无关 uniform + 内核私有 uniform（势参数）。
       注意必须先 useProgram 再赋值（program 级状态，引擎全路径惯例，R31 教训）。 */
    for (const prog of [this.progCnRhs3d, this.progCnSweep3d]){
      gl.useProgram(prog);
      gl.uniform1f(this.u(prog,'uDtHalf'), hh);
      gl.uniform1f(this.u(prog,'uK'), k);
      gl.uniform3f(this.u(prog,'uTexel3'), 1/n, 1/n, 1/n);
      gl.uniform1f(this.u(prog,'uGrid3'), n);
      this.kernel.setUniforms(gl, prog, this.state);   /* 私有 uniform（势参数） */
    }
    for (let s=0; s<sub; s++){
      /* 1) rhs pass：w_n(psiA3) → rhs3 */
      this._volumePass3(this.progCnRhs3d, this.psiA3.tex, this.rhs3, null);
      /* 2) 12 次扫掠：偶数迭代读 psiA3 写 psiB3，奇数互换；第 12 次（it=11）写
            回 psiA3 ⟹ 末态在 psiA3（与 KDK 的 ping-pong 不变式一致） */
      for (let it=0; it<12; it++){
        const src = (it % 2 === 0) ? this.psiA3 : this.psiB3;
        const dst = (it % 2 === 0) ? this.psiB3 : this.psiA3;
        this._volumePass3(this.progCnSweep3d, src.tex, dst, this.rhs3.tex);
      }
    }
    this.state.simTime += dt;
  }

  /* 3D 全卷 pass 助手（evolveCN3d 用）：srcTex（uPsi=TEX0）逐层 draw 到 dst；
     rhsTex 非空时绑 uRhs=TEX2（cnSweep3d）。与 evolve3d 内联逐层循环同一
     契约：viewport n×n + framebufferTextureLayer(COLOR_ATTACHMENT0, l) + 全屏三角形。 */
  _volumePass3(prog, srcTex, dst, rhsTex){
    const gl = this.gl, n = this.state.grid;
    gl.useProgram(prog);
    gl.bindVertexArray(this.quad.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0,0,n,n);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, srcTex);
    gl.uniform1i(this.u(prog,'uPsi'), 0);
    if (rhsTex){
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_3D, rhsTex);
      gl.uniform1i(this.u(prog,'uRhs'), 2);
    }
    const uLayer = this.u(prog,'uLayer');
    for (let l=0; l<n; l++){
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, dst.tex, 0, l);
      gl.uniform1f(uLayer, (l + 0.5)/n);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
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

  /* CN program 共享 uniform 序列（uDtHalf/uTexel/uK/drive/AB/uV/内核私有）——两个
     program 的 uniform 名逐字相同，但取值是 program 级状态，须逐 program 设置。
     uK = 1/2m：Pauli 的 localH/cnLocalSolve 需要；Dirac 的 CN program 不引用它
     （location 为 null，uniform1f 静默忽略——零影响）。 */
  _setCNUniforms(prog, hh, dPhase, tx, diag){
    const gl = this.gl, st = this.state;
    /* uniform 设置前必须先成为当前 program（引擎全路径惯例）；否则本 GL
       后端对非当前 program 的 uniform 写入静默失败——hh=0 ⟹ CN 退化为恒等
       映射 ⟹ 全场冻结（2026-10-14 R31 诊断：manualPass 前后 texel 逐位不变）。 */
    gl.useProgram(prog);
    gl.uniform1f(this.u(prog,'uDtHalf'), hh);
    gl.uniform2f(this.u(prog,'uTexel'), tx, tx);
    gl.uniform1f(this.u(prog,'uK'), 0.5/st.m);
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
    /* 3D 体积路径（kernel.dim3）：volume ray-march → 合成 → 全卷 HUD；与 2D 路径
       完全分离（互不共享显示 program / 归约管线），零分支风险。 */
    if (this.kernel.dim3){ this.frame3d(now); return; }

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

    this.frameTail(now);
  }

  /* 帧尾（2D/3D 共用）：帧率统计 + 标题状态（document.title 供 CDP 断言） */
  frameTail(now){
    this._frames++;
    if (now - this._lastFpsT > 500){ this.fps = this._frames*1000/(now-this._lastFpsT); this._frames = 0; this._lastFpsT = now; this.q('#hFps').textContent = this.fps.toFixed(0); }
    document.title = 'OK f=' + this.fps.toFixed(0) + ' p=' + this.q('#hP').textContent;
  }

  /* ---------- 3D 帧路径（volume ray-march + 合成 + 全卷 HUD）----------
     显示 program 消费 psiA3（3D 纹理）→ dispB（RGBA16F），再经 composite 上屏
     （扫描线/噪点/亮度与 2D 同源）。HUD 的 P/T/V/E 来自 probSum3d（全卷 CPU
     回读 + 内核 moments3d 物理分解），节流 500ms：64³ 回读 ~40ms，比 2D 的
     GPU 归约贵一个量级（GPU 3D reduce 需层图集技巧，留作优化项）。 */
  frame3d(now){
    const gl = this.gl, st = this.state;
    const cw = this.canvas.width, ch = this.canvas.height;
    /* 体积 ray-march → dispB */
    gl.useProgram(this.progVolume);
    gl.bindVertexArray(this.quad.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispB.fbo);
    gl.viewport(0,0,cw,ch);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.psiA3.tex);
    gl.uniform1i(this.u(this.progVolume,'uVol'), 0);
    gl.uniform1f(this.u(this.progVolume,'uTheta'), this.cam.theta);
    gl.uniform1f(this.u(this.progVolume,'uPhi'), this.cam.phi);
    gl.uniform1f(this.u(this.progVolume,'uDist'), this.cam.dist);
    /* uAspect 是**标量**（= W/H）：射线按 right*ndc.x*uAspect*0.5 展开，取 A=W/H
       方使世界正方体成正方像（推导：水平 px/(X/Z) = 3.2/A·W/2 与垂直 3.2·H/2 相等）。
       注意不可照搬 2D display 的 vec2 惯例——对 float uniform 调 uniform2f 会
       INVALID_OPERATION 且静默不写（uAspect 保持 0 ⟹ 屏幕 x 方向不参与射线 ⟹
       成像退化为「只随 y 变化的横带」，R34 首轮实测踩中，见 worklog）。 */
    gl.uniform1f(this.u(this.progVolume,'uAspect'), cw/ch);
    gl.uniform1i(this.u(this.progVolume,'uSteps'), st.steps3|0);
    gl.uniform1f(this.u(this.progVolume,'uDensity'), st.exposure3);
    gl.uniform1f(this.u(this.progVolume,'uPhaseColor'), st.phaseColor ? 1 : 0);
    gl.uniform1f(this.u(this.progVolume,'uSlice'), st.slice3 ? 1 : 0);
    gl.uniform1f(this.u(this.progVolume,'uSliceZ'), st.sliceZ);
    this.kernel.setUniforms(gl, this.progVolume, st);   /* 私有 uniform（3D 内核一般无） */
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const td = this.dispA; this.dispA = this.dispB; this.dispB = td;
    /* 合成到屏幕（与 2D 同源：扫描线 + 噪点 + 亮度） */
    gl.useProgram(this.progComposite);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0,0,cw,ch);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dispA.tex);
    gl.uniform1i(this.u(this.progComposite,'uTex'), 0);
    gl.uniform1f(this.u(this.progComposite,'uTime'), now*0.001);
    gl.uniform1f(this.u(this.progComposite,'uBright'), st.bright);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    /* 全卷测量（P/T/V/E/peak）——走 GPU 归约（R35），节流；调试句柄无节流。
       GPU 归约后成本从 O(n³) 的 CPU 回读（64³ ~40ms）降到「1024 体素块并行遍历
       + 4KB 回读」，故节流可收回 120ms（与 2D 的 reduce 同频）；大网格仍放宽
       （96³ 500ms / 128³ 1000ms）——遍历总量仍 ∝ n³，别让它成为主开销。 */
    /* 实测成本（SwiftShader）：64³ 1.3ms / 96³ 3.5ms / 128³ 6.4ms，故无需随网格
       放大间隔，统一 120ms（与 2D reduce 同频）；旧 CPU 回读档位为 500/1500/3000ms。 */
    if (now - this._lastReduceF > 120){
      this._lastReduceF = now;
      const m = this.reducePass3d();
      if (!this._baseCaptured){ this.baseP0 = m.P; this._baseCaptured = true; }
      const err = Math.abs(m.P - this.baseP0)/Math.max(this.baseP0,1e-9)*100;
      this.q('#hP').textContent = m.P.toFixed(4);
      this.q('#hErr').textContent = err.toFixed(3) + '%';
      this.q('#hErr').className = err < 1 ? 'ok' : 'warn';
      this.q('#hT').textContent = m.T.toFixed(4);
      this.q('#hV').textContent = m.V.toFixed(4);
      this.q('#hE').textContent = m.E.toFixed(4);
      this.q('#hPeak').textContent = m.peak.toFixed(4);
      this.q('#hTime').textContent = st.simTime.toFixed(1);
      this.q('#hGrid').textContent = st.grid + '³ · ' + st.m.toFixed(2);
      this._lastE = m.E;                 /* 能级阶梯对照读数（refreshParamHud） */
      this.refreshParamHud();
    }
    this.frameTail(now);
  }

  /* ---------- 3D 全卷回读测量（内核物理分解）----------
     WebGL2 无法直接 readPixels 3D 纹理：逐层 framebufferTextureLayer + readPixels
     （n² × RG32F）拼成 n³ 缓冲，交内核 moments3d 求 P/T/V/E/peak/质心。
     成本：64³ ≈ 40ms（SwiftShader 实测口径），故帧内 500ms 节流。 */
  probSum3d(){
    const gl = this.gl, n = this.state.grid;
    /* 缓冲按网格缓存（128³ = 16MB/次，逐次新建会造成可观的 GC 抖动） */
    const need = n*n*n*2;
    if (!this._buf3d || this._buf3d.length !== need){
      this._buf3d = new Float32Array(need);
      this._layer3d = new Float32Array(n*n*2);
    }
    const buf = this._buf3d, layer = this._layer3d;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA3.fbo);
    for (let l=0; l<n; l++){
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.psiA3.tex, 0, l);
      gl.readPixels(0,0,n,n,gl.RG,gl.FLOAT,layer);
      buf.set(layer, l*n*n*2);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const m = this.kernel.moments3d(buf, n, this.state);
    m.simTime = this.state.simTime;
    return m;
  }

  /* 屏幕剖面（R39 双缝验证；R40 扫描器经类方法路径调用）：读 psiA3 全卷，
     取世界 x=wx 的 x 切片，返回沿 y 的 |ψ|² 剖面 prof[]（z 向累加）与沿 z
     的分布 zs[]（y 向累加），外加 profYZ（n×n 二维切片，索引 z*n+y）。
     双缝墙 z 向无限且势与 z 无关 ⟹ 各 z 层 y 剖面应同构（用 profYZ 逐层
     对比验证 z 不变性）。单缝则只有宽中央主极大。条纹间距理论值
     Δy=λL/D（λ=2π/k、L=缝到屏距离）。 */
  screenSlice3(wx){
    const n = this.state.grid;
    const buf = this.readWave3();
    const half = n/2;
    const xi = Math.min(n-1, Math.max(0, Math.round(wx + half - 0.5)));
    const prof = new Array(n).fill(0), zs = new Array(n).fill(0);
    const profYZ = new Array(n*n).fill(0);
    for (let z=0; z<n; z++){
      for (let y=0; y<n; y++){
        const i = ((z*n + y)*n + xi)*2;
        const p = buf[i]*buf[i] + buf[i+1]*buf[i+1];
        prof[y] += p; zs[z] += p;
        profYZ[z*n + y] = p;
      }
    }
    return { n, xi, sliceWx: xi + 0.5 - half, prof, zs, profYZ, simTime: this.state.simTime };
  }

  /* ---------- 3D 场数据读回 / 上传（R37 现场存档的基础件）----------
     readWave3：psiA3 全卷回读（RG32F 交错 (re,im)，与 probSum3d 同一逐层
       协议，但返回原始 Float32Array 而非物理矩）——现场序列化与调试句柄
       wave3Data 共用，保证「存档的场」与「验证看到的场」是同一份数据。
     uploadWave3：反向路径，逐层 texSubImage3D 写进 psiA3（ping-pong 另一侧
       与 rhs3 由后续帧自然覆盖，无需清理；末态不变式仍在 psiA3）。 */
  readWave3(){
    const gl = this.gl, n = this.state.grid;
    const need = n*n*n*2;
    if (!this._buf3d || this._buf3d.length !== need){
      this._buf3d = new Float32Array(need);
      this._layer3d = new Float32Array(n*n*2);
    }
    const buf = this._buf3d, layer = this._layer3d;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA3.fbo);
    for (let l=0; l<n; l++){
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.psiA3.tex, 0, l);
      gl.readPixels(0,0,n,n,gl.RG,gl.FLOAT,layer);
      buf.set(layer, l*n*n*2);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return buf.slice();   /* 拷贝：调用方长期持有（序列化）不得被下次回写污染 */
  }

  uploadWave3(f32){
    const gl = this.gl, n = this.state.grid;
    if (f32.length !== n*n*n*2) throw new Error('uploadWave3 长度不符: ' + f32.length);
    const layer = this._layer3d && this._layer3d.length === n*n*2 ? this._layer3d : new Float32Array(n*n*2);
    this._layer3d = layer;
    gl.bindTexture(gl.TEXTURE_3D, this.psiA3.tex);
    for (let l=0; l<n; l++){
      layer.set(f32.subarray(l*n*n*2, (l+1)*n*n*2));
      gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, l, n, n, 1, gl.RG, gl.FLOAT, layer);
    }
  }

  /* ---------- 3D 全卷 GPU 归约（R35）----------
     WebGL2 无 3D 纹理的归约链 ⟹ 用「线性索引分块」：32² 个输出 texel 各遍历
     n³/1024 个体素（TPL_REDUCE3D），三张 MRT 附件回读后 CPU 只做 1024 项求和
     ——把 O(n³) 的 CPU 遍历（64³ 还要先回读 2MB）换成 GPU 遍历 + 4KB 回读。
     与 probSum3d（CPU 全卷回读 + 内核 moments3d）是两条独立实现：动能同为
     1-texel 前向链路口径，故二者可逐项对账（调试句柄 timing3d 同时给出耗时）。 */
  reducePass3d(){
    const gl = this.gl, n = this.state.grid, k = 0.5/this.state.m;
    gl.useProgram(this.progReduce3d);
    gl.bindVertexArray(this.quad.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.reduceT.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.viewport(0,0,32,32);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.psiA3.tex);
    gl.uniform1i(this.u(this.progReduce3d,'uPsi'), 0);
    gl.uniform1f(this.u(this.progReduce3d,'uGrid3'), n);
    gl.uniform1f(this.u(this.progReduce3d,'uK'), k);
    this.kernel.setUniforms(gl, this.progReduce3d, this.state);   /* 私有 uniform（势参数） */
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._readBuf);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._readBuf2);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._readBuf3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let sp=0, st=0, sp2=0, sv=0, sx=0, sy=0, sz=0, peak=0, stx=0, sty=0, stz=0;
    for (let i=0;i<1024;i++){
      sp+=this._readBuf[i*4]; st+=this._readBuf[i*4+1]; sp2+=this._readBuf[i*4+2]; sv+=this._readBuf[i*4+3];
      sx+=this._readBuf2[i*4]; sy+=this._readBuf2[i*4+1]; sz+=this._readBuf2[i*4+2];
      if (this._readBuf2[i*4+3] > peak) peak = this._readBuf2[i*4+3];   /* 局部峰值取 max（非求和） */
      stx+=this._readBuf3[i*4]; sty+=this._readBuf3[i*4+1]; stz+=this._readBuf3[i*4+2];
    }
    return { P: sp, T: st, V: sv, E: st + sv, peak, sp2,
             cx: sp > 0 ? sx/sp : 0.5, cy: sp > 0 ? sy/sp : 0.5, cz: sp > 0 ? sz/sp : 0.5,
             Tx: stx, Ty: sty, Tz: stz, simTime: this.state.simTime };
  }

  /* 3D 手动步进（诊断/验证用，不经 frame）：跑 n 个完整帧（每帧 sub 子步 ×
     3 个全卷 pass；integrator3='cn' 时为 13 个），返回前后测量与漂移量——
     与 2D manualPass 同定位。积分器路径经 _evolve3dFrame 分流（与实时帧同一
     物理）。确定性：无时间依赖势 ⟹ 相同输入必得相同输出；simTime 保持不变
     （诊断口径：不改变可见的模拟时钟）。 */
  manualPass3d(n){
    const t0 = this.state.simTime;
    const before = this.probSum3d();
    for (let i=0; i<n; i++) this._evolve3dFrame(1.2);
    const after = this.probSum3d();
    this.state.simTime = t0;
    return { n, before, after,
             dP: Math.abs(after.P - before.P)/Math.max(before.P,1e-9)*100,
             dE: after.E - before.E, simTime: t0 };
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
    /* 3D 透射扫描面板门控（R38）：内核提供 transmissionModel3（s 波球垒模型）
       才显示——与 scanSec 同一动态门控模式（仅在实际变化时写 style）。 */
    const scan3Sec = this.q('#scan3Sec');
    if (scan3Sec){
      const hasModel3 = !!(this.kernel.transmissionModel3 && this.kernel.transmissionModel3(this.state));
      const want3 = hasModel3 ? '' : 'none';
      if (scan3Sec.style.display !== want3) scan3Sec.style.display = want3;
    }
    /* 双缝图样扫描面板门控（R40）：3D 内核才显示（扫描器固定 64³ 体积路径，
       2D 内核 start() 内亦有 dim3 检查兜底——双缝势参数属 3D 预设）。 */
    const slitScanSec = this.q('#slitScanSec');
    if (slitScanSec){
      const wantSlit = this.kernel.dim3 ? '' : 'none';
      if (slitScanSec.style.display !== wantSlit) slitScanSec.style.display = wantSlit;
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

  /* ---------- 3D 实验现场序列化（R37 #34 backlog ③）----------
     与 2D 势场存档平行，但 3D 的存档单元是「实验现场」而非「势场画布」：
       · 势为解析式（potKind/V₀/R/ω/Z 参数级存档，无灰度画布）
       · 波函数体积数据（psiA3 全卷 RG32F 交错 (re,im) float32，base64）
       · 积分器选择 integrator3（KDK/CN 对照实验从同一现场出发）
       · 轨道相机（theta/phi/dist——视角也是复现的一部分）
     导入策略：**两阶段**（先全量校验无副作用，再写现场）⟹ 失败原子性；
     网格不符**拒绝导入**（不静默重采样——重采样会改变物理，属欺骗性兼容）。
     JSON 体积（实测 64³）：整档 2,796,723 B ≈ 2.7MiB（场数据 base64 占
     2,796,204 B）——RG32F 全卷 float32 原样，不搞有损压缩；128³ 约 11MiB。 */
  serializeSnapshot3(){
    const n = this.state.grid;
    const buf = this.readWave3();
    const SKIP = new Set(['grid','paused','simTime','preset','lastWave','waveCount','drag','tool']);
    const params = {};
    for (const k of Object.keys(this.state)){
      if (SKIP.has(k)) continue;
      const v = this.state[k];
      if (typeof v === 'number' && isFinite(v)) params[k] = v;
    }
    return {
      format: 'schrodinger-workshop.snapshot3d',
      version: 1,
      kernel: this.kernelId,
      grid: n,
      state: params,
      /* integrator3 是字符串选择（白名单循环只收数字）——但它是实验现场的一部分
         （KDK/CN 对照从同一现场出发），故显式存档 + 导入时校验取值。 */
      integrator3: this.state.integrator3 === 'cn' ? 'cn' : 'kdk',
      camera: { theta: this.cam.theta, phi: this.cam.phi, dist: this.cam.dist },
      wave: { encoding: 'rg32f-f32', floats: n*n*n*2, data: f32ToB64(buf) },
    };
  }

  exportSnapshot3(){
    const obj = this.serializeSnapshot3();
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'snapshot3d-' + this.kernelId + '-' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.toast('3D 现场已导出（' + (blob.size/1024).toFixed(1) + ' KB）');
  }

  importSnapshot3Data(obj){
    /* 阶段 1：全量校验（不碰任何现场状态——校验失败即原子失败） */
    if (!obj || obj.format !== 'schrodinger-workshop.snapshot3d' || obj.version !== 1)
      throw new Error('不是有效的 3D 现场存档（format/version 不匹配）');
    if (obj.kernel !== this.kernelId)
      throw new Error('存档内核为 ' + obj.kernel + '，当前为 ' + this.kernelId);
    if (obj.grid !== this.state.grid)
      throw new Error('存档网格 ' + obj.grid + '³ ≠ 当前 ' + this.state.grid + '³（拒绝导入：不做静默重采样）');
    let waveF32 = null;
    if (obj.wave){
      const w = obj.wave;
      if (w.encoding !== 'rg32f-f32' || typeof w.data !== 'string')
        throw new Error('存档场数据段无效（encoding 缺失或不支持）');
      waveF32 = b64ToF32(w.data);
      const need = this.state.grid*this.state.grid*this.state.grid*2;
      if (waveF32.length !== need)
        throw new Error('存档场数据长度不符: ' + waveF32.length + ' ≠ ' + need);
      for (let i = 0; i < waveF32.length; i++){
        if (!isFinite(waveF32[i])) throw new Error('存档场数据含非有限值 @' + i);
      }
    }
    if (obj.camera !== undefined && (obj.camera === null || typeof obj.camera !== 'object'
        || !['theta','phi','dist'].every(k => typeof obj.camera[k] === 'number' && isFinite(obj.camera[k]))))
      throw new Error('存档相机段无效');
    if (obj.integrator3 !== undefined && obj.integrator3 !== 'kdk' && obj.integrator3 !== 'cn')
      throw new Error('存档积分器段无效（须 kdk/cn）: ' + obj.integrator3);
    /* 阶段 2：写现场 */
    const SKIP = new Set(['grid','paused','simTime','preset','lastWave','waveCount','drag','tool']);
    let n = 0;
    for (const k of Object.keys(obj.state || {})){
      if (SKIP.has(k)) continue;
      const v = obj.state[k];
      if (typeof v === 'number' && isFinite(v) && k in this.state){ this.state[k] = v; n++; }
    }
    if (obj.integrator3) this.state.integrator3 = obj.integrator3;
    if (obj.camera) { this.cam.theta = obj.camera.theta; this.cam.phi = obj.camera.phi; this.cam.dist = obj.camera.dist; }
    if (waveF32){
      this.uploadWave3(waveF32);
      this._baseCaptured = false;          /* P 守恒基准按导入场重捕（HUD err% 口径） */
      this.toast('3D 现场已导入（恢复 ' + n + ' 项参数 + 场数据 ' + (this.state.grid**3) + ' 体素）');
    } else {
      this.reinitWave();
      this._baseCaptured = false;
      this.toast('3D 存档无场数据：已恢复 ' + n + ' 项参数并按预设重发初态');
    }
    this.syncControls();
    return n;
  }

  importSnapshot3File(file){
    const r = new FileReader();
    r.onload = () => {
      try { this.importSnapshot3Data(JSON.parse(r.result)); }
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
    const g3 = this.q('#selGrid3');           /* 3D 体积网格下拉（?grid= / 面板切换后同步） */
    if (g3) g3.value = String(this.state.grid);
    const si3 = this.q('#selInt3');           /* 3D 积分器下拉（?int3= / 预设切换后同步） */
    if (si3) si3.value = this.state.integrator3;
    const pk2 = this.q('#selPotKind2');       /* 第二势槽下拉（R41：预设/导入可注入组合） */
    if (pk2) pk2.value = String(this.state.potKind2 | 0);
    this.refreshPot2Rows();
    const abp = this.q('#oABPos');            /* AB 螺线管位置读数（预设 params 可能改 abX/abY） */
    if (abp) abp.textContent = '(' + this.state.abX.toFixed(2) + ', ' + this.state.abY.toFixed(2) + ')';
  }

  /* 第二势槽参数行的动态显隐（R41 组合势）：仅当前 potKind2 所需的行显示，
     其余隐藏——与主槽「预设决定哪些滑块生效」同一叙事，但组合势参数量大，
     用动态显隐避免面板臃肿。仅在实际变化时写 style（避免每 tick 布局失效）。 */
  refreshPot2Rows(){
    const k = this.state.potKind2 | 0;
    const show = {
      rowPotV02: k === 1 || k === 4,
      rowPotR2: k === 1,
      rowPotW2: k === 2,
      rowPotZ2: k === 3,
      rowPotWallX2: k === 4,
      rowPotWallT2: k === 4,
      rowPotSlitW2: k === 4,
      rowPotSlitD2: k === 4,
    };
    for (const [id, on] of Object.entries(show)){
      const el = this.q('#' + id); if (!el) continue;
      const want = on ? '' : 'none';
      if (el.style.display !== want) el.style.display = want;
    }
  }

  bindUI(){
    const canvas = this.q('#gl');
    const aim = this.q('#aim'), aimLine = this.q('#aimline'), aimDot = this.q('#aimdot'), aimTxt = this.q('#aimtxt');

    if (this.kernel.dim3){
      /* 3D：轨道相机（拖拽旋转 + 滚轮缩放）。无拖拽发射（初态由预设/σ 滑块
         给定）、无势场笔刷（势经 pot3 解析注入）。 */
      this.on(canvas, 'pointerdown', e => {
        try{ canvas.setPointerCapture(e.pointerId); }catch(_){/* 合成/无效 pointerId 时不应中断交互 */ }
        this.cam.drag = { x: e.clientX, y: e.clientY };
      });
      this.on(canvas, 'pointermove', e => {
        const d = this.cam.drag; if (!d) return;
        this.cam.theta -= (e.clientX - d.x)*0.008;
        /* φ 钳制 ±1.45 rad（cos φ ≥ 0.12）：相机视线与 up 接近平行时
           shader 内 cross(fwd, up) 退化（|right|→0 ⟹ normalize 出 NaN ⟹ 画面全黑）。 */
        this.cam.phi = Math.max(-1.45, Math.min(1.45, this.cam.phi + (e.clientY - d.y)*0.008));
        d.x = e.clientX; d.y = e.clientY;
      });
      this.on(canvas, 'pointerup', () => { this.cam.drag = null; });
      this.on(canvas, 'pointerleave', () => { this.cam.drag = null; });
      this.on(canvas, 'wheel', e => {
        e.preventDefault();
        this.cam.dist = Math.max(1.1, Math.min(4.5, this.cam.dist*Math.exp(e.deltaY*0.0012)));
      }, { passive:false });
    } else {
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
    }

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
    this.on(this.q('#btnReset'), 'click', () => {
      if (this.kernel.dim3){ this.reinitWave(); return; }        /* 3D：按 lastWave3 重发体积初态 */
      const w = this.state.lastWave; if (w) this.initWave(w[0],w[1],w[2],w[3]);
    });
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

    /* 3D 体积面板（kernel.dim3）：网格 / 射线步数 / 曝光 / σ / 解析势参数 /
       相位着色 / 切片模式 / 相机重置。
       V₀、R 为纯势参数（每帧从 uniform 读入演化，即时生效，无需重发波包）；
       ω（谐振子）与 Z（氢原子）同时决定基态形状 ⟹ 变更后须重发初态
       （形状变了，单改势会让当前场成为非本征叠加态）。 */
    if (this.kernel.dim3){
      this.bindRange('#rSteps3','#oSteps3','steps3', v => String(v|0));
      this.bindRange('#rExp3','#oExp3','exposure3', v => String(v|0));
      this.bindRange('#rSigma3','#oSigma3','sigma', v => v.toFixed(1), () => this.reinitWave());
      this.bindRange('#rPotV0','#oPotV0','potV0', v => v.toFixed(3));
      this.bindRange('#rPotR','#oPotR','potR', v => String(v|0));
      this.bindRange('#rPotW','#oPotW','potW', v => v.toFixed(4), () => this.reinitWave());
      this.bindRange('#rPotZ','#oPotZ','potZ', v => v.toFixed(2), () => this.reinitWave());
      /* 双缝墙（R39；仅 potKind=4 预设生效）——势参数即时生效，无需重发波包 */
      this.bindRange('#rPotWallX','#oPotWallX','potWallX', v => String(v|0));
      this.bindRange('#rPotWallT','#oPotWallT','potWallT', v => String(v|0));
      this.bindRange('#rPotSlitW','#oPotSlitW','potSlitW', v => String(v|0));
      this.bindRange('#rPotSlitD','#oPotSlitD','potSlitD', v => String(v|0));
      /* 第二势槽（R41 组合势）：下拉切换即时生效 + 8 个叠加参数滑块（仅当前
         第二势类型所需的行显示，其余隐藏——与主槽「预设决定哪些滑块生效」
         同一叙事，但组合势参数量大，故用动态显隐避免面板臃肿）。 */
      this.on(this.q('#selPotKind2'), 'change', e => {
        this.state.potKind2 = parseInt(e.target.value, 10) || 0;
        this.refreshPot2Rows();
      });
      this.bindRange('#rPotV02','#oPotV02','potV02', v => v.toFixed(3));
      this.bindRange('#rPotR2','#oPotR2','potR2', v => String(v|0));
      this.bindRange('#rPotW2','#oPotW2','potW2', v => v.toFixed(4));
      this.bindRange('#rPotZ2','#oPotZ2','potZ2', v => v.toFixed(2));
      this.bindRange('#rPotWallX2','#oPotWallX2','potWallX2', v => String(v|0));
      this.bindRange('#rPotWallT2','#oPotWallT2','potWallT2', v => String(v|0));
      this.bindRange('#rPotSlitW2','#oPotSlitW2','potSlitW2', v => String(v|0));
      this.bindRange('#rPotSlitD2','#oPotSlitD2','potSlitD2', v => String(v|0));
      this.refreshPot2Rows();
      this.bindRange('#rSliceZ3','#oSliceZ3','sliceZ', v => v.toFixed(2));
      this.on(this.q('#btnPhase3'), 'click', () => {
        this.state.phaseColor = this.state.phaseColor ? 0 : 1;
        this.q('#btnPhase3').classList.toggle('on', !!this.state.phaseColor);
      });
      this.on(this.q('#btnSlice3'), 'click', () => {
        this.state.slice3 = this.state.slice3 ? 0 : 1;
        this.q('#btnSlice3').classList.toggle('on', !!this.state.slice3);
        this.q('#sliceRow3').style.display = this.state.slice3 ? '' : 'none';
      });
      this.on(this.q('#btnCam3'), 'click', () => {
        this.cam = { theta: 0.7, phi: 0.35, dist: 2.2, drag: null };
        this.toast('相机已重置');
      });
      this.on(this.q('#selGrid3'), 'change', e => {
        const g = parseInt(e.target.value, 10);
        this.allocGrid3d(g);
        this.loadPreset(this.state.preset);
      });
      /* 积分器切换（R36）：内核不支持 CN3D（无 cnLocalSolve3）时隐藏该行；
         切换即时生效——下一帧按 state.integrator3 分流，不重发波包，
         保证 KDK/CN 对照实验从同一初态出发。 */
      if (!this.progCnRhs3d){
        this.q('#intRow3').style.display = 'none';
      } else {
        this.on(this.q('#selInt3'), 'change', e => {
          this.state.integrator3 = e.target.value === 'cn' ? 'cn' : 'kdk';
          this.toast('积分器 → ' + (this.state.integrator3 === 'cn' ? 'CN（Cayley 严格正交）' : 'KDK 速度 Verlet'));
        });
      }
      /* 实验现场序列化（R37）：导出 = 参数 + 场数据 + 相机 + 积分器选择；
         导入经隐藏 file input（与 2D 势场导入同模式）。 */
      this.on(this.q('#btnExport3'), 'click', () => this.exportSnapshot3());
      this.on(this.q('#btnImport3'), 'click', () => this.q('#fileImport3').click());
      this.on(this.q('#fileImport3'), 'change', e => {
        const f = e.target.files && e.target.files[0];
        if (f) this.importSnapshot3File(f);
        e.target.value = '';   /* 允许重复导入同一文件 */
      });
      /* 3D 透射扫描（R38）：与 2D 扫描同模式（范围/点数滑块 + 开始/中止） */
      const scan3Bind = (id, out, fmt) => {
        const el = this.q(id), o = this.q(out);
        const upd = () => { o.textContent = fmt(parseFloat(el.value)); };
        el.addEventListener('input', upd); upd();
      };
      scan3Bind('#rScan3Lo', '#oScan3Lo', v => v.toFixed(2));
      scan3Bind('#rScan3Hi', '#oScan3Hi', v => v.toFixed(2));
      scan3Bind('#rScan3N', '#oScan3N', v => String(v|0));
      this.on(this.q('#btnScan3'), 'click', () => {
        this.scanner3.start({
          v0Lo: parseFloat(this.q('#rScan3Lo').value),
          v0Hi: parseFloat(this.q('#rScan3Hi').value),
          v0N: parseInt(this.q('#rScan3N').value, 10) || 13,
        });
      });
      this.on(this.q('#btnScan3Stop'), 'click', () => this.scanner3.stop());
      /* 3D 双缝图样扫描（R40）：与 scan3 同模式（D 范围/点数滑块 + 开始/中止） */
      const slitScanBind = (id, out, fmt) => {
        const el = this.q(id), o = this.q(out);
        const upd = () => { o.textContent = fmt(parseFloat(el.value)); };
        el.addEventListener('input', upd); upd();
      };
      slitScanBind('#rSlitScanLo', '#oSlitScanLo', v => String(v|0));
      slitScanBind('#rSlitScanHi', '#oSlitScanHi', v => String(v|0));
      slitScanBind('#rSlitScanN', '#oSlitScanN', v => String(v|0));
      this.on(this.q('#btnSlitScan'), 'click', () => {
        this.scannerSlit.start({
          dLo: parseFloat(this.q('#rSlitScanLo').value),
          dHi: parseFloat(this.q('#rSlitScanHi').value),
          dN: parseInt(this.q('#rSlitScanN').value, 10) || 9,
        });
      });
      this.on(this.q('#btnSlitScanStop'), 'click', () => this.scannerSlit.stop());
    }

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
    /* 非线性参数扫描面板门控（R42）：仅 GP / NLS 内核显示（其余内核无此工具，
       薛定谔系已有矩垒透射扫描）。滑块量程按内核设置：GP 扫排斥侧 g<0
       （−20…−4），NLS 扫 focusing 侧 g>0（1…8）。 */
    const isGp = this.kernelId === 'gp', isNls = this.kernelId === 'nls';
    if (!isGp && !isNls) this.q('#paramScanSec').style.display = 'none';
    else {
      const lo = this.q('#rParamLo'), hi = this.q('#rParamHi');
      const loV = isGp ? -20 : 1, hiV = isGp ? -4 : 8;
      lo.min = hi.min = String(loV); lo.max = hi.max = String(hiV);
      lo.value = String(loV); hi.value = String(hiV);
      this.q('#oParamLo').textContent = String(loV);
      this.q('#oParamHi').textContent = String(hiV);
    }
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
    /* 非线性参数扫描（R42）：面板按内核选实例（GP/NLS 共用一套 DOM） */
    const paramBind = (id, out, fmt) => {
      const el = this.q(id), o = this.q(out);
      const upd = () => { o.textContent = fmt(parseFloat(el.value)); };
      el.addEventListener('input', upd); upd();
    };
    paramBind('#rParamLo', '#oParamLo', v => v.toFixed(1));
    paramBind('#rParamHi', '#oParamHi', v => v.toFixed(1));
    paramBind('#rParamN', '#oParamN', v => String(v|0));
    const paramScanner = () => (this.kernelId === 'gp' ? this.scannerGp : this.scannerNls);
    this.on(this.q('#btnParamScan'), 'click', () => {
      paramScanner().start({
        lo: parseFloat(this.q('#rParamLo').value),
        hi: parseFloat(this.q('#rParamHi').value),
        n: parseInt(this.q('#rParamN').value, 10) || 5,
      });
    });
    this.on(this.q('#btnParamScanStop'), 'click', () => paramScanner().stop());

    /* 键盘 */
    const presetKeys = Object.keys(this.kernel.presets());
    this.on(window, 'keydown', e => {
      if (e.code === 'Space'){ e.preventDefault(); this.togglePause(); }
      else if (e.key >= '1' && e.key <= '9'){ const pk = presetKeys[+e.key - 1]; if (pk) this.loadPreset(pk); }
      else if (e.key === 'r' || e.key === 'R'){ this.reinitWave(); }   /* 2D: lastWave；3D: lastWave3 */
      else if ((e.key === 'c' || e.key === 'C') && !this.kernel.dim3){ this.clearV(); }   /* 3D 无势场画布 */
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
    if (this.kernel.dim3){
      /* 3D 网格上限 128³：内存 n³ 且每 pass n 次逐层 draw（spike 实测 128³
         105.6ms/pass，纯离线档）。initTargets 已按默认 grid 分配体积目标，
         此处仅当 ?grid= 显式覆盖时重建。 */
      if (qg >= 32 && qg <= 128){ this.state.grid = qg; this.allocGrid3d(qg); }
    } else if (qg >= 64 && qg <= 512){ this.state.grid = qg; this.q('#selGrid').value = String(qg); }
    this.resize();
    if (!this.kernel.dim3) this.allocGrid(this.state.grid);
    const qs = qp.get('speed');
    if (qs){ this.state.substeps = Math.max(1, Math.min(40, parseInt(qs,10)||6)); this.q('#rSpeed').value = Math.min(16,this.state.substeps); this.q('#oSpeed').textContent = this.state.substeps; }
    /* 3D 积分器覆盖（?int3=kdk|cn，R36）：仅 dim3 且内核支持 CN3D 时有效
       （不支持时 progCnRhs3d 缺失，evolve 分流自然回落 KDK）。须在 loadPreset
       之前设置——预设 params 不含 integrator3，用户选择跨预设保留。 */
    const qi = qp.get('int3');
    if (this.kernel.dim3 && (qi === 'cn' || qi === 'kdk')) this.state.integrator3 = qi;
    const presets = this.kernel.presets();
    const qpreset = qp.get('preset');
    this.loadPreset(presets[qpreset] ? qpreset : Object.keys(presets)[0]);
    const kxO = parseFloat(qp.get('kx')), kyO = parseFloat(qp.get('ky'));
    /* 2D 专属：?kx/?ky 覆盖发射方向（3D 无 lastWave——初态由 preset 的 wave3
       给定，URL 覆盖走 ?preset= 与内核 applyParams） */
    if (!this.kernel.dim3 && (!isNaN(kxO) || !isNaN(kyO))){
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
      /* 积分器模式（'cn' | 'kdk'）：CDP 验证直接断言路径，避免从漂移量反推 */
      integrator: this.kernel.integrator,
      /* 3D 体积内核标志（dim3）与体积网格：CDP 按此分流断言 */
      dim3: !!this.kernel.dim3,
      grid3: () => this.state.grid,
      /* 3D 积分器当前模式（'kdk' | 'cn'，R36）+ CN3D 可用性：CDP 直接断言
         路径而非从漂移量反推；setIntegrator3 供验证脚本在两种路径间切换。 */
      integrator3: () => this.state.integrator3,
      cn3Available: !!this.progCnRhs3d,
      setIntegrator3: (v) => {
        this.state.integrator3 = (v === 'cn' && this.progCnRhs3d) ? 'cn' : 'kdk';
        const si = this.q('#selInt3'); if (si) si.value = this.state.integrator3;
        return this.state.integrator3;
      },
      /* 3D 全卷测量（内核 moments3d 物理分解）：P/T/V/E/peak/质心 + simTime。
         无节流（HUD 用 500ms 节流版本）；64³ 约 40ms，验证脚本可直接调用。 */
      probSum3d: () => this.probSum3d(),
      /* 屏幕剖面（R39 双缝验证）：读 psiA3 全卷，取世界 x=wx 的 x 切片，返回
         沿 y 的 |ψ|² 剖面 prof[]（z 向累加）与沿 z 的分布 zs[]（y 向累加），
         外加 profYZ（n×n 二维切片，索引 z*n+y）。双缝墙 z 向无限且势与 z 无关
         ⟹ 各 z 层 y 剖面应同构（用 profYZ 逐层对比验证 z 不变性）。
         单缝则只有宽中央主极大。条纹间距理论值 Δy=λL/D（λ=2π/k、L=缝到屏距离）。 */
      /* 屏幕剖面（R39）：类方法 screenSlice3 的调试句柄转发（R40 SlitScanner
         直接走类方法路径 app.screenSlice3，不经过此对象）。 */
      screenSlice3: (wx) => this.screenSlice3(wx),
      /* 3D 当前体积原始数据（逐层 readPixels 拼装，RG32F 交错 (re,im)）：
         供验证脚本把 GPU 场搬到 CPU 做镜像对账（R36 CN 的 GPU↔CPU 互证）。
         与现场序列化共用 readWave3——「存档的场」与「验证看到的场」同源。 */
      wave3Data: () => {
        const buf = this.readWave3();
        return { n: this.state.grid, data: Array.from(buf) };
      },
      /* 3D 实验现场序列化（R37）：round-trip 对账（序列化 → 反序列化 →
         逐位一致）与错误路径（format/kernel/grid/长度/非有限值）经 CDP 验证。 */
      serializeSnapshot3: () => this.serializeSnapshot3(),
      importSnapshot3Data: (o) => this.importSnapshot3Data(o),
      /* P 守恒基准是否已重捕（导入场后应回落 false，下一帧按新场重捕） */
      baseCaptured: () => this._baseCaptured,
      /* 3D 全卷 GPU 归约（R35）：与 probSum3d（CPU）互为独立实现，动能同为
         1-texel 前向链路口径 ⟹ 两条路径可逐项对账。 */
      reduce3d: () => this.reducePass3d(),
      /* 两条路径的耗时对照（ms）：验证 GPU 归约替代 CPU 回读的实际收益 */
      timing3d: () => {
        const t0 = performance.now(); const cpu = this.probSum3d(); const t1 = performance.now();
        const gpu = this.reducePass3d(); const t2 = performance.now();
        return { cpuMs: t1 - t0, gpuMs: t2 - t1, speedup: (t1 - t0)/Math.max(t2 - t1, 1e-6),
                 dP: Math.abs(gpu.P - cpu.P)/Math.max(cpu.P, 1e-9),
                 dT: Math.abs(gpu.T - cpu.T), dV: Math.abs(gpu.V - cpu.V), dPeak: Math.abs(gpu.peak - cpu.peak),
                 dcx: Math.abs(gpu.cx - cpu.cx) };
      },
      /* 3D 确定性步进 n 帧（不经 frame）：返回前后测量 + P 百分比漂移 + ΔE。
         验证守恒性/驻波稳定性用（KDK 的离散能量应无长期漂移）。 */
      manualPass3d: (n) => this.manualPass3d(n),
      /* 轨道相机读写（验证渲染路径：不同视角都应出图） */
      setCam: (t, p, d) => {
        if (t !== undefined) this.cam.theta = t;
        if (p !== undefined) this.cam.phi = p;
        if (d !== undefined) this.cam.dist = d;
        return { theta: this.cam.theta, phi: this.cam.phi, dist: this.cam.dist };
      },
      getCam: () => ({ theta: this.cam.theta, phi: this.cam.phi, dist: this.cam.dist }),
      wave3: () => this.state.lastWave3 || null,
      /* 显示帧亮度分布剖面（列/行投影）：返回 5% 能量跨度与峰值位置。
         用途：断言成像**不是横带/竖条**（R34 首轮 uAspect 静默失效时成像退化为
         只随 y 变化的横带，而 trailSum>0 之类的聚合断言照样通过——需要方向分辨
         的判据才抓得住）。紧凑体积应满足 colSpan.frac 与 rowSpan.frac 均 < 0.6。 */
      dispProfile: () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispA.fbo);
        const w = this.dispA.w, h = this.dispA.h;
        const buf = new Float32Array(w*h*4);
        gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const col = new Float64Array(w), row = new Float64Array(h);
        let lo0 = Infinity;
        for (let y=0;y<h;y++) for (let x=0;x<w;x++){
          const i = (y*w+x)*4;
          const l = 0.2126*buf[i] + 0.7152*buf[i+1] + 0.0722*buf[i+2];
          col[x] += l; row[y] += l;
          if (l < lo0) lo0 = l;                     /* 背景（体渲染的常色垫底） */
        }
        /* 扣背景：体渲染的背景是常数（未命中射线返回底色），不减掉它会让
           5% 能量跨度退化为整个画面 ⟹ 判据失效。
           注意方向：列投影 col[x] 是沿 y 累加（h 个像素）⟹ 扣 lo0*h；
           行投影 row[y] 是沿 x 累加（w 个像素）⟹ 扣 lo0*w（R34 首版写反过）。 */
        const bgc = lo0*h, bgr = lo0*w;
        for (let x=0;x<w;x++) col[x] -= bgc;
        for (let y=0;y<h;y++) row[y] -= bgr;
        const span = (a, n) => {
          let tot = 0; for (let i=0;i<n;i++) if (a[i] > 0) tot += a[i];
          if (tot <= 0) return { tot: 0, lo: 0, hi: n-1, frac: 1 };
          const thr = tot*0.05;
          let lo = 0, hi = n-1, acc = 0;
          for (let i=0;i<n;i++){ acc += Math.max(0,a[i]); if (acc >= thr){ lo = i; break; } }
          acc = 0;
          for (let i=n-1;i>=0;i--){ acc += Math.max(0,a[i]); if (acc >= thr){ hi = i; break; } }
          return { tot, lo, hi, frac: (hi - lo + 1)/n };
        };
        const peakIdx = a => { let bi = 0; for (let i=1;i<a.length;i++) if (a[i] > a[bi]) bi = i; return bi; };
        return { w, h, colSpan: span(col,w), rowSpan: span(row,h), colPeak: peakIdx(col)/w, rowPeak: peakIdx(row)/h };
      },
      /* GL 错误码（0 = 无错误）：uniform 类型不匹配这类**静默失败**（如对 float
         uniform 调 uniform2f → INVALID_OPERATION 且 uniform 不写）不会被 JS 异常
         捕获，只能靠显式查询。CDP 断言在若干真实帧之后调用。 */
      glError: () => gl.getError(),
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
      /* 3D 透射扫描器（R38）：同契约；内核无 transmissionModel3 时 start() 拒绝 */
      scan3: this.scanner3,
      scanModel3: () => (this.kernel.transmissionModel3 ? this.kernel.transmissionModel3(this.state) : null),
      /* 双缝图样扫描器（R40）：start(opts)/stop()/busy/results/summary（CDP 驱动与读数） */
      scanSlit: this.scannerSlit,
      /* 非线性参数扫描器（R42）：GP / NLS 各一实例，start() 内核不符时拒绝 */
      scanGp: this.scannerGp,
      scanNls: this.scannerNls,
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
      for (const t of [this.psiA3, this.psiB3]) if (t){ gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      if (this.reduceT){ gl.deleteTexture(this.reduceT.tex); gl.deleteFramebuffer(this.reduceT.fbo); }
      gl.deleteTexture(this.vTex);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
    if (window.__app && window.__app.kernelId === this.kernelId) delete window.__app;
    this.container.innerHTML = '';
  }
}
