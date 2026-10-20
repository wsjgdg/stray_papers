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
import { getKernel, buildShaders, AB_MAX } from '../physics/kernel.js';
import { MAX_BLOBS, normBlob } from '../physics/schrodinger3d.js';
import { injectStyles } from './styles.js';
import { TransmissionScanner } from './scan.js';
import { TransmissionScanner3 } from './scan.js';
import { SlitScanner } from './scan.js';
import { GpScanner, NlsScanner } from './scan.js';
import { BlochScanner } from './scan.js';
import { LandauScanner, fieldMoments2 } from './scan.js';

/* ---------- R52：GP 基态渐进弛豫的每帧步数预算 ----------
   GP 预设「基态（虚时间弛豫）」的虚时间流由帧循环分帧推进：每帧最多
   RELAX_BUDGET 步（实测单步 ~4ms@256² ⟹ 8 步 ≈ 32ms CPU/帧），总步数
   ~212 ⟹ ~27 帧（~0.45s@60fps）完成；弛豫期间 KDK 冻结、场快照逐帧
   上传（收敛过程可见）。数学与步进语义见 physics/gp.js 的 RELAX 注释。 */
const RELAX_BUDGET = 8;

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

/* ---------- R61 Bohm 轨迹残影管线（引擎级，无内核注入）----------
   双纹理 ping-pong（RGBA16F）：fade 全屏 pass（B = A·uFade）→ blit B→A →
   stamp POINTS + MAX 混合（A = max(A, stamp)）。读写分离避免 FBO↔sampler
   反馈环；MAX 混合对 16F 是 WebGL2 核心能力（32F 才需 EXT_float_blend）。
   stamp 的 VS 无属性输入：gl_VertexID 索引 uPos（64×1 RG32F）⟹ createProgram
   的第三参自定义 VS（gl.js R61 扩展）。停泊粒子 (−1,−1) 的裁剪坐标在
   NDC 外被光栅化丢弃。 */
const VS_BOHM_STAMP = `#version 300 es
uniform sampler2D uPos;      /* 64×1 RG32F：(x,y) uv 世界坐标 */
uniform float uPointSize;
void main(){
  vec2 p = texture(uPos, vec2((float(gl_VertexID)+0.5)/64.0, 0.5)).rg;
  gl_Position = vec4(p*2.0-1.0, 0.0, 1.0);
  gl_PointSize = uPointSize;
}`;
const FS_BOHM_STAMP = `#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 o;
void main(){
  float r = length(gl_PointCoord-0.5)*2.0;
  o = vec4(uColor*smoothstep(1.0, 0.35, r), 1.0);
}`;
const FS_BOHM_FADE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTrail;
uniform float uFade;
void main(){ o = vec4(texture(uTrail, vUv).rgb*uFade, 1.0); }`;

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
      /* AB 螺线管（R54 多管）：abSols = [[x,y,φ],...] 世界坐标元组列表
         （≤AB_MAX，放置/删除/选中见 placeSolenoid 一族）；abPhi 为「草稿磁通」——
         无选中管时 Φ 滑块编辑它，放置新管时取用；abSel 为选中管索引
         （-1 = 无选中，UI 态不存档）。abCursor 为 R55 放置预览环的鼠标世界
         坐标（null = 无预览；仅 flux 工具悬停时非空，UI 态不存档）。 */
      abPhi: 0, abSols: [], abSel: -1, abCursor: null,
      preset: null, lastWave: null, waveCount: 1,
      drag: null,
      /* 3D 交互工具（R44）：'cam' 拖拽旋转相机（默认）/ 'pot' 势刷放置 blob */
      tool3: 'cam',
      /* R61 概率流可视化：showJ = J 箭头 overlay（2D，24×24 格阵；3D 为 HUD
         统计读数）；bohmOn = Bohm 轨迹（2D 专属：64 粒子制导速度积分 +
         残影）。默认关——TPL_DISPLAY 新增段全部 uniform 门控，关闭时最终
         行与旧路径逐字等价。bohmFade = 残影每帧衰减系数。 */
      showJ: false, bohmOn: false, bohmFade: 0.985,
      /* R63 均匀磁场 B_z 的**轨道**耦合（Landau 能级）：bOrb 为格点单位的
         B（q=1）⟹ 回旋频率 ω_c=bOrb/m、回旋周期 T=2πm/bOrb、Landau 能级
         E_n=(n+½)ω_c。**与 Pauli 的 bX/bY/bZ 正交**（后者是自旋塞曼项，不含
         轨道耦合）；与 AB 的 abSols 亦正交（点磁通 vs 均匀矢势）。默认 0 ⟹
         uBOn=0 走原 stencil 逐位等价。 */
      bOrb: 0,
      /* R62 光学晶格：latV0（势深，世界单位）/ latA（周期，世界 px）/
         twistX（Bloch 相位 θ_B=k·a，∈[0,π] 覆盖简约 BZ）/ latBand（弛漾目标带
         1|2）。lattice 预设的 params 会注入同名默认值，此处给非 lattice 预设
         下也存在的初值（面板滑块绑定需要 state 有键）。 */
      latV0: 0.1, latA: 32, twistX: 0, latBand: 1,
      /* R64 量子弹球：billKind = 'stadium' | 'circle'（两个预设各注入一个；
         面板下拉可切换并重画硬壁势）。billBand = 当前显示的本征态序号
         （0 起，UI 态，不存档——谱是运行时缓存）。 */
      billKind: 'stadium', billBand: 0,
      ...this.kernel.defaults(),
      ...(options.state || {}),
    };
    /* R60：程序化注入的丘列表（options.state.potBlobs，如课程站嵌入/旧调用方）
       可能缺椭球/软化字段——经 normBlob 归一为球+硬边，与导入迁移同口径 */
    if (Array.isArray(this.state.potBlobs))
      this.state.potBlobs = this.state.potBlobs.map(normBlob);
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
    /* R62 Bloch 能带扫描（k 扫描测两带 ⟨E⟩ + Mathieu 解析叠图）；仅薛定谔
       内核的光学晶格预设可用（面板在 buildDOM 后按内核静态门控） */
    this.scannerBloch = new BlochScanner(this);
    /* R63 Landau 回旋周期扫描（bOrb 扫描 + 质心轨迹周期检测 + T₀/T_晶格 叠图）；
       仅薛定谔内核（landauSec 同款门控），与 AB/扭曲边界互斥（gate 层拒绝） */
    this.scannerLandau = new LandauScanner(this);
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
    this.restorePanels();    /* R56：恢复上次的左右面板收起状态（localStorage） */
    this.upgradeHints();   /* R45：hint 折叠升级（DOM 构建后一次；模板零改动） */
    this.upgradeSecs();    /* R48：sec 级分区折叠（同上模式；扫描 sec 默认折） */
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
      <button data-tool="bohm">Bohm 放点</button>
    </div>
  </div>
  <div class="sec">
    <h3>物理参数</h3>
    <div class="row"><label>质量 m</label><input type="range" id="rMass" min="0.15" max="4" step="0.05" value="1"><output id="oMass">1.00</output></div>
    <div class="row" ${d3?'style="display:none"':''}><label>波包宽度 σ</label><input type="range" id="rSigma" min="4" max="40" step="0.5" value="7"><output id="oSigma">7.0</output></div>
    <div class="row"><label>积分子步</label><input type="range" id="rSpeed" min="1" max="16" step="1" value="6"><output id="oSpeed">6</output></div>
    <div class="row" ${d3?'style="display:none"':''}><label>笔刷半径</label><input type="range" id="rBrush" min="3" max="40" step="1" value="10"><output id="oBrush">10</output></div>
    ${extraHtml}
    <div class="row" ${d3?'style="display:none"':''}><label>V 值</label><input type="range" id="rV" min="0.01" max="1" step="0.01" value="0.3"><output id="oV">0.30</output></div>
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
  <div class="sec" id="landauSec">
    <h3>均匀磁场 B（Landau 能级）</h3>
    <div class="row"><label>磁场 B_z</label><input type="range" id="rBOrb" min="-0.06" max="0.06" step="0.001" value="0"><output id="oBOrb">0.000</output></div>
    <div class="row"><label>回旋预测</label><span id="landauStat">B=0 · 无轨道耦合</span></div>
    <div class="hint" style="margin-top:4px">均匀 B 的**轨道**耦合（最小耦合 p→p−qA，Landau 规范 A=(−B·y,0,0)，q=1）：仅 x 向 link 有 Peierls 相位 e^{±iB·y}（A_x 沿 x 恒定 ⟹ 线积分**精确**，离散 H 严格厄米）。<b>积分器</b>：复数 H 配 KDK 的 Re/Im 拆分<b>不酉</b>（kick 用 Re(Hψ)、drift 用 Im(Hψ)，B≠0 时范数漂移随网格放大直至爆炸）⟹ B≠0 自动切**规范帧 ADI**：x 扫描以 φ=e^{iBxy}ψ 把 x 相位吸收成实 stencil（精确保酉），y 扫描在原帧走裸实 stencil（Landau 规范 y 向本无相位），两方向交替 ⟹ 二阶；CPU float64 镜像已验证保范/二阶/轨道周期（+0.15%）。<b>Landau 能级</b> E_n=(n+½)ℏω_c、<b>回旋频率</b> ω_c=B/m；连续统周期 T₀=2πm/B 是<b>小振幅极限</b>——紧束缚带非抛物 ⟹ 大振幅轨道类单摆拉长（读数实时给 T_晶格；能级间距=ω_c 不受影响，CPU 对角化已验）。B=0 走原 KDK 逐位等价。<b>仅薛定谔内核</b>（NLS/GP 非线性项双重计数、Dirac/Pauli 走 CN、3D 无 B 分支）；<b>与 AB 磁通/扭曲边界互斥</b>（规范帧不兼容，拖 B 前请先清空）；<b>与 Pauli 自旋塞曼滑块正交</b>（那是纯自旋项，无轨道耦合）。</div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnLandauScan">扫描回旋周期</button>
      <button id="btnLandauScanStop" disabled>中止</button>
    </div>
    <div class="row"><label>扫描状态</label><span id="landauScanStat">就绪</span></div>
    <canvas id="landauScanCanvas" width="420" height="180"></canvas>
    <div class="hint" style="margin-top:4px"><b>回旋周期扫描</b>：固定轨道半径（r=30 texel）、逐点扫 B，发高斯包测<b>质心轨迹</b>（Ehrenfest：线性演化下质心严格走经典轨道），按 y/x 两条通道的上升穿越间隔取中位数得周期 T。叠图两条参考曲线：灰虚线 <b>T₀=2πm/B</b>（连续统/谐振极限）与青虚线 <b>T_晶格</b>（紧束缚带的半经典闭式，含非谐）——θ₀=B·r 随 B 线性增长，实测点应贴 T_晶格 而非 1/B 直线。扫描会临时切到「自由传播」场景并强制 256² 网格，结束后恢复原预设与 σ。</div>
  </div>
  <div class="sec" id="latticeSec">
    <h3>光学晶格（Bloch）</h3>
    <div class="row"><label>晶格深度 V₀</label><input type="range" id="rLatV0" min="0.01" max="0.5" step="0.005" value="0.1"><output id="oLatV0">0.100</output></div>
    <div class="row"><label>晶格周期 a</label><input type="range" id="rLatA" min="8" max="32" step="8" value="32"><output id="oLatA">32</output></div>
    <div class="row"><label>Bloch 相位 θ=k·a</label><input type="range" id="rTwistX" min="0" max="3.1416" step="0.005" value="0"><output id="oTwistX">0.000</output></div>
    <div class="row"><label>目标能带</label>
      <select id="selLatBand">
        <option value="1" selected>带 1（最低）</option>
        <option value="2">带 2（需先收敛带 1）</option>
      </select>
    </div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnBlochRelax">Bloch 弛漾</button>
      <button id="btnBlochStop" disabled>中止</button>
    </div>
    <div class="row"><label>弛漾状态</label><span id="blochStat">就绪</span></div>
    <div class="hint" style="margin-top:4px">V=V₀sin²(πx/a) 周期势。Bloch 定理：ψ(x+a)=e^{ika}ψ(x)，准动量 k 只在简约布里渊区 [0,π/a] 内独立 ⟹ 能量分成能带、带间是能隙。<b>θ 滑块</b>直接设定 Bloch 相位 θ=k·a（0→π 覆盖整个简约 BZ；GPU 侧由 twisted 边界 e^{±iθ} wrap 携带）。<b>Bloch 弛漾</b>：CPU 虚时间流（PR-ADI + twisted 循环三对角）收敛到当前 (k, 带) 的精确本征态——带 2 以带 1 收敛态作 Gram-Schmidt 投影，并每步投影回目标晶体动量块与横向基模（否则会塌到相邻 k 的带 1，见 worklog R62 五轮记录）。</div>
  </div>
  <div class="sec" id="billiardSec">
    <h3>量子弹球（能级统计）</h3>
    <div class="row"><label>腔体形状</label>
      <select id="selBillKind">
        <option value="stadium" selected>stadium（混沌）</option>
        <option value="circle">圆形（可积）</option>
      </select>
    </div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnBillSpec">求谱（前 16 态）</button>
      <button id="btnBillShow">显示选中态</button>
    </div>
    <div class="row"><label>本征态序号</label><input type="range" id="rBillBand" min="1" max="16" step="1" value="1"><output id="oBillBand">1</output></div>
    <div class="row"><label>谱统计</label><span id="billStat">未求解</span></div>
    <div class="row"><label>能级 E</label><span id="billLevels">—</span></div>
    <div class="hint" style="margin-top:4px">硬壁腔（腔外 V=1.0）内的自由粒子。<b>经典动力学决定量子谱</b>：stadium 混沌 ⟹ 能级互相排斥（最近邻间距比 ⟨r⟩→0.53，GOE）；圆形腔可积 ⟹ 间距服从 Poisson（⟨r⟩≈0.39，含简并时更低）。<b>⟨r⟩</b>=⟨min(sᵢ,sᵢ₋₁)/max(sᵢ,sᵢ₋₁)⟩ 不需要展开能级密度，是有限样本下最稳的可积/混沌判据。<b>求谱</b>用 Lanczos（全重正交化，krylov 96）解 <b>与 GPU 同一离散</b>的 H=−uK·∇²₅+V，耗时数秒（一次性）；<b>显示选中态</b>把该本征向量上传到场上——混沌腔的高激发态会出现 <b>scar</b>（沿不稳定周期轨道增强的密度脊）。注意 stadium 的谱若有 x/y 反射对称会裂成多条独立序列、低能 ⟨r⟩ 假装可积，故腔内置了一个偏心小凸起破坏对称；样本仅 16 态（间距 14 个）⟹ 只能定性看分离方向，定量值以 CPU 200 态样本为准。</div>
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
    <canvas id="scanCanvas" width="420" height="180"></canvas>
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
    <canvas id="paramScanCanvas" width="420" height="180"></canvas>
    <div class="hint" style="margin-top:4px">GP：扫 g（排斥侧 g&lt;0，托马斯-费米云/涡旋）——测云半径 Rrms（⟹R_TF=√3·Rrms）、峰值 n₀、涡旋愈合层 ξ，与 TF 解析 R_TF=(2R_trap²|g|/π)^¼、n₀=μ/|g| 对照。NLS：扫 g（focusing 侧 g&gt;0，条带孤子）——测 σx/σy 与峰值末/初比（&gt;3 判自聚焦发散）。**固定测量窗 200 帧 + 全程序列**：非线性无耗散系统（呼吸模永久振荡、TOF 单调膨胀、孤子稳定传播）没有天然终点，故不用「清空/双稳」类停止判据，改由时间平均 + 摆动幅度给出结论。P 在两内核下守恒（幺正非线性），塌缩/网格截断导致的数值漂移属诚实限制。</div>
  </div>
  <div class="sec" id="blochScanSec">
    <h3>Bloch 能带扫描</h3>
    <div class="row"><label>k 取样点数</label><input type="range" id="rBlochN" min="5" max="33" step="1" value="17"><output id="oBlochN">17</output></div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnBlochScan">开始扫描</button>
      <button id="btnBlochScanStop" disabled>中止</button>
    </div>
    <div class="row"><label>状态</label><span id="blochScanStat">就绪</span></div>
    <canvas id="blochScanCanvas" width="420" height="180"></canvas>
    <div class="hint" style="margin-top:4px">逐 k 点跑 CPU 弛漾：先带 1（作 Gram-Schmidt 参考）再带 2，读收敛后的 ⟨E⟩；叠图 1D Mathieu 解析谱（连续谱对照含横向基模能量 ey₀）。<b>口径</b>：离散系统的有效质量为 m·(grid/256)² ⟹ 强制 grid=256² 才是与解析同一物理系统（其余网格是不同系统，偏差 80%~500%）；残余 ~1% 量级偏差来自势纹理 8 位量化（round(v·127)/127）与有限差分。虚线=解析，实点=实测，BZ 边界竖虚线标注第一能隙。</div>
  </div>
  <div class="sec">
    <h3>AB 磁通（多管）</h3>
    <div class="row"><label>磁通 Φ</label><input type="range" id="rABPhi" min="0" max="6.2832" step="0.01" value="0"><output id="oABPhi">0.00</output></div>
    <div class="row"><label>选中</label><output id="oABSel">无 · 放置即新建</output><button id="btnABCenter">置中</button></div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnABDel">删除选中</button>
      <button id="btnABClear">清空</button>
    </div>
    <div class="row"><label>放置</label><span class="hint">「磁通(AB)」工具（2D：快捷键/工具按钮；3D：体积面板「磁通」模式）：点空白放新管（取滑块 Φ 并选中），点已有管选中；Delete 删选中。3D 磁通管**沿 z 轴贯穿整个体积**，管轴位置取点击视线的 xy 投影；Φ 为绕管一周的相位。</span></div>
  </div>
  <div class="sec" ${d3?'style="display:none"':''}>
    <h3>概率流与 Bohm 轨迹</h3>
    <div class="grid2" style="margin-top:6px">
      <button id="btnShowJ">J 箭头</button>
      <button id="btnBohm">Bohm 轨迹</button>
    </div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnBohmSeed">撒 24 粒子</button>
      <button id="btnBohmClear">清轨迹</button>
    </div>
    <div class="row"><label>残影衰减</label><input type="range" id="rBohmFade" min="0.9" max="1" step="0.001" value="0.985"><output id="oBohmFade">0.985</output></div>
    <div class="hint" style="margin-top:4px"><b>J = (1/m)·Im(ψ*∇ψ)</b>（Dirac 内核为 ψ†σψ，群速口径）——连续性方程 ∂<sub>t</sub>ρ + ∇·J = 0 的守恒流。箭头：24×24 格阵格心采样，长度 ∝ |J|/max|J|，青→暖白随幅值。<b>Bohm 轨迹</b>：64 粒子沿制导速度 v = J/ρ 积分（节点附近钳制），暖色残影为轨迹历史；「Bohm 放点」工具单击放单粒子。快捷键 <span class="k">J</span> / <span class="k">B</span>。HUD 的 Gauss 残差 = Σ∇·J − 界面通量和（离散望远镜恒等式，float 舍入量级为自校验）。</div>
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
    <div class="row" id="rowPotV0"><label>势垒 V₀</label><input type="range" id="rPotV0" min="0" max="5" step="0.005" value="0.02"><output id="oPotV0">0.020</output></div>
    <div class="row" id="rowPotR"><label>势垒半径 R</label><input type="range" id="rPotR" min="4" max="20" step="1" value="10"><output id="oPotR">10</output></div>
    <div class="row" id="rowPotW"><label>谐振子 ω</label><input type="range" id="rPotW" min="0.004" max="0.06" step="0.002" value="0.0156"><output id="oPotW">0.0156</output></div>
    <div class="row" id="rowPotZ"><label>核电荷 Z</label><input type="range" id="rPotZ" min="0.1" max="0.5" step="0.01" value="0.25"><output id="oPotZ">0.25</output></div>
    <div class="row" id="rowPotWallX"><label>墙心 x₀</label><input type="range" id="rPotWallX" min="-20" max="20" step="1" value="0"><output id="oPotWallX">0</output></div>
    <div class="row" id="rowPotWallT"><label>墙厚 T</label><input type="range" id="rPotWallT" min="1" max="10" step="1" value="4"><output id="oPotWallT">4</output></div>
    <div class="row" id="rowPotSlitW"><label>缝宽 W</label><input type="range" id="rPotSlitW" min="2" max="16" step="1" value="6"><output id="oPotSlitW">6</output></div>
    <div class="row" id="rowPotSlitD"><label>缝距 D</label><input type="range" id="rPotSlitD" min="0" max="32" step="1" value="20"><output id="oPotSlitD">20</output></div>
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
      <button data-tool3="cam" class="on">视角旋转</button>
      <button data-tool3="pot">势刷放置</button>
      <button data-tool3="flux">磁通(AB)</button>
      <button id="btnBlobDel">清空势丘</button>
    </div>
    <div class="row"><label>势丘半径 R</label><input type="range" id="rBlobR" min="3" max="24" step="1" value="8"><output id="oBlobR">8</output></div>
    <div class="row"><label>势丘强度 V₀</label><input type="range" id="rBlobV0" min="-2" max="2" step="0.05" value="0.5"><output id="oBlobV0">0.50</output></div>
    <div class="grid3" style="margin:4px 0 2px">
      <div><div class="mini">X 轴比 <b id="oBlobRX">1.00</b></div><input type="range" id="rBlobRX" min="0.2" max="2" step="0.05" value="1"></div>
      <div><div class="mini">Y 轴比 <b id="oBlobRY">1.00</b></div><input type="range" id="rBlobRY" min="0.2" max="2" step="0.05" value="1"></div>
      <div><div class="mini">Z 轴比 <b id="oBlobRZ">1.00</b></div><input type="range" id="rBlobRZ" min="0.2" max="2" step="0.05" value="1"></div>
    </div>
    <div class="row"><label>边缘软化</label><input type="range" id="rBlobSoft" min="0" max="8" step="0.5" value="0"><output id="oBlobSoft">0</output></div>
    <div class="row"><label>势丘列表</label><output id="oBlobPos">无</output></div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnPhase3" class="on">相位着色</button>
      <button id="btnSlice3">切片模式</button>
    </div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnShowJ3">J 场统计</button>
    </div>
    <div class="row"><label>J 场</label><span class="hint">3D 下 showJ 为 HUD 统计读数（ΣJ / Σ∇·J / Gauss 残差 / max|J|）——箭头 overlay 与 Bohm 轨迹为 2D 专属（volume 路径未挂 J 层）。</span></div>
    <div class="row" id="sliceRow3" style="display:none"><label>切片层 z</label><input type="range" id="rSliceZ3" min="0" max="1" step="0.01" value="0.5"><output id="oSliceZ3">0.50</output></div>
    <div class="grid2" style="margin-top:6px">
      <button id="btnCam3">重置相机</button>
      <button id="btnExport3">导出现场</button>
      <button id="btnImport3">导入现场</button>
    </div>
    <input type="file" id="fileImport3" accept=".json,application/json" style="display:none">
    <div class="hint" style="margin-top:4px">拖拽旋转 · 滚轮缩放。V₀/R 仅球势垒预设生效；ω/σ 决定谐振子基态（σ=1/√ω）；Z 仅氢原子预设生效（改动后波包按新 Z 重发）；墙心 x₀/墙厚 T/缝宽 W/缝距 D 仅双缝预设生效（D=0 退化为单缝，改动即时生效）。<b>势刷</b>：切到「势刷放置」后在体积上拖拽，沿视线中点连续涂抹势丘链（按下必落首丘，拖拽按 0.6·最短轴距离阈值续落——丘链重叠 ⟹ 视觉连续；与主势/第二势独立叠加，负 V₀=势阱；上限 16 丘，超出淘汰最旧；放置后演化继续，不重发波包）。<b>形状（R60）</b>：轴比 X/Y/Z（0.2–2，半轴 = R×轴比，全 1 = 球）× 边缘软化（0 = 硬边；&gt;0 时丘内恒 V₀、丘外按 exp(−(dn−1)²/2soft²) 高斯衰减，dn 为归一化椭球距离）——轴比与软化同样 stamp 时快照，只影响后续丘。积分器：KDK 为速度 Verlet（默认，R34 已验证守恒）；CN 为 Crank-Nicolson + block-Jacobi，Cayley 矩阵严格正交、范数机器精度守恒——同预设下切换可对照二者离散误差（切换即时生效，不重发波包）。导出现场：参数 + 场数据 + 相机 + 积分器选择的单文件 JSON 存档（网格不符时拒绝导入，不重采样）。</div>
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
    <canvas id="scanCanvas3" width="420" height="180"></canvas>
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
    <canvas id="slitScanCanvas" width="420" height="180"></canvas>
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
  <div id="jSec" style="display:none">
    <hr>
    <div class="hrow"><span>ΣJ (Jx, Jy[, Jz])</span><span id="hJSum">—</span></div>
    <div class="hrow"><span>Σ∇·J</span><span id="hJDiv">—</span></div>
    <div class="hrow"><span>Gauss 残差</span><span id="hJGauss">—</span></div>
    <div class="hrow"><span>max|J|</span><span id="hJMax">—</span></div>
    <div class="hrow"><span>Bohm 粒子</span><span id="hBohmN">—</span></div>
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
    ? '<b>拖拽</b> 旋转视角 · <b>滚轮</b> 缩放 · <span class="k">P</span> 势刷 · <span class="k">1-'+Object.keys(presets).length+'</span> 预设 · <span class="k">Space</span> 暂停 · <span class="k">R</span> 重置波包 · <span class="k">[</span><span class="k">]</span> 收起侧面板'
    : '<b>拖拽</b> 发射波包（方向=动量 k）· <span class="k">1-'+Object.keys(presets).length+'</span> 预设 · <span class="k">Space</span> 暂停 · <span class="k">T</span> 拖尾 · <span class="k">R</span> 重置 · <span class="k">C</span> 清空势场 · <span class="k">J</span> 概率流 · <span class="k">B</span> Bohm 轨迹 · <span class="k">[</span><span class="k">]</span> 收起侧面板'}
</footer>
<div id="toast"></div>
<div id="brushcursor"></div>
<div id="diag"></div>
<button class="qf-tab" id="tabL" title="左侧面板：收起（快捷键 [）">‹</button>
<button class="qf-tab" id="tabR" title="右侧面板：收起（快捷键 ]）">›</button>
`;
  }

  /* ---------- 面板双向收起（R56，「试验场全屏」）----------
     左列 #panel + #desc、右列 #hud + #legend 各为一组，由 body class
     （qf-hide-left / qf-hide-right）驱动整组 transform 滑出（styles.js）。
     拉手（#tabL/#tabR）与快捷键 [ / ] 触发；状态持久化于
     localStorage qf.panels.state = {left,right}（true = 展开）。
     设计口径：默认全展开（无存档/坏存档都不改行为）；存档只记显式
     false——局部升级（如未来加第三组）不影响旧存档语义。 */
  panelSideOpen(side){ return !document.body.classList.contains('qf-hide-' + side); }
  setPanelSide(side, open, persist = true){
    document.body.classList.toggle('qf-hide-' + side, !open);
    const tab = this.q(side === 'left' ? '#tabL' : '#tabR');
    if (tab){
      const L = side === 'left';
      tab.textContent = L ? (open ? '\u2039' : '\u203a') : (open ? '\u203a' : '\u2039');
      tab.title = (L ? '左' : '右') + '侧面板：' + (open ? '收起' : '展开') +
                  '（快捷键 ' + (L ? '[' : ']') + '）';
    }
    if (persist){
      try {
        localStorage.setItem('qf.panels.state', JSON.stringify({
          left: this.panelSideOpen('left'), right: this.panelSideOpen('right')
        }));
      } catch(_){ /* 隐私模式等写入失败：静默降级为会话内有效 */ }
    }
  }
  togglePanelSide(side){ this.setPanelSide(side, !this.panelSideOpen(side)); }
  restorePanels(){
    let st = null;
    try { st = JSON.parse(localStorage.getItem('qf.panels.state') || 'null'); } catch(_){}
    /* 缺省/坏值 → 全展开；仅显式 false 收起（向后兼容的宽松口径） */
    this.setPanelSide('left', !(st && st.left === false), false);
    this.setPanelSide('right', !(st && st.right === false), false);
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
    /* R61 概率流 program（buildShaders 无条件装配 ⟹ 编译；帧内按 state 开关）：
       jField（ψ → RG32F J 场）+ jRed（通量/散度归约 MRT）+ bohmStep（64 粒子
       制导步进）+ bohmFade（残影衰减全屏）+ bohmStamp（POINTS 盖章，自定义
       VS_BOHM_STAMP——createProgram 第三参）。 */
    if (sh.jField){
      this.progJField = createProgram(gl, sh.jField);
      this.progJRed = createProgram(gl, sh.jRed);
      this.progBohmStep = createProgram(gl, sh.bohmStep);
      this.progBohmFade = createProgram(gl, FS_BOHM_FADE);
      this.progBohmStamp = createProgram(gl, FS_BOHM_STAMP, VS_BOHM_STAMP);
    }
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
      /* R58 3D 耗散缩放 pass（γ≠0 时帧末跑；与 2D progScale 同义） */
      this.progScale3d = sh.scale3d ? createProgram(gl, sh.scale3d) : null;
      /* R61 3D 概率流：jField3（逐层 J 场 RGBA32F）+ jRed3（线性分块归约） */
      if (sh.jField3){
        this.progJField3 = createProgram(gl, sh.jField3);
        this.progJRed3 = createProgram(gl, sh.jRed3);
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
    /* R61：概率流归约 MRT（与 reduceT 同构：o0=(ΣJx,ΣJy,ΣdivJ,Σρ)、
       o1=界面通量、o2=(max|J|,Σ|J|)）。2D/3D 各一份（3D 的 reduce3d 占用
       reduceT，不能复用）。 */
    this.jRedT = makeReduce(gl);
    if (this.kernel.dim3) this.jRedT3 = makeReduce(gl);
    /* R61 Bohm 粒子位置 ping-pong（64×1 RG32F；(−1,−1) = 停泊/未激活）——
       网格无关，构造期一次分配。 */
    const mkPos = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 64, 1, 0, gl.RG, gl.FLOAT, null);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { tex: t, fbo: f };
    };
    this.posA = mkPos(); this.posB = mkPos();
    this.ptsVao = gl.createVertexArray();   /* POINTS stamp：无属性（VS 只用 gl_VertexID） */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._bohmN = 0; this._bohmRow = 0;
    this._jScale = 0; this._j = null; this._j3 = null;
    this._jBuf0 = new Float32Array(32*32*4);   /* jRed MRT 附件 0：(ΣJx,ΣJy,ΣdivJ,Σρ) */
    this._jBuf1 = new Float32Array(32*32*4);   /* 附件 1：界面通量（2D 四下上 / 3D 前四） */
    this._jBuf2 = new Float32Array(32*32*4);   /* 附件 2：(max|J|,Σ|J|[,0,0]) */
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
    /* R61 3D 概率流场（RGBA32F n³：(Jx,Jy,Jz,0)，NEAREST；jField3 逐层写入） */
    if (this.jT3){ gl.deleteTexture(this.jT3.tex); gl.deleteFramebuffer(this.jT3.fbo); }
    this.jT3 = makeTarget3D(gl, n, gl.RGBA32F, gl.RGBA, gl.NEAREST);
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
    /* R61 概率流场（RG32F (Jx,Jy)，与 psi 同尺寸 NEAREST；CLAMP_TO_EDGE
       与 TPL_JFIELD 的界外约定一致）。常驻分配一次，开关时每 evolve 后重算。 */
    if (this.jT){ gl.deleteTexture(this.jT.tex); gl.deleteFramebuffer(this.jT.fbo); }
    this.jT = makeTarget(gl, g, g, gl.RG32F, gl.RG, gl.NEAREST);
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
    /* R61 Bohm 轨迹残影：RGBA16F 双纹理 ping-pong（与 dispA/dispB 同口径：
       resize blit 保留，不丢轨迹）。fade/stamp 管线见 bohmStamp()。 */
    const oldTA = this.bohmTrailA, oldTB = this.bohmTrailB;
    this.bohmTrailA = makeRGBA16F(gl, w, h);
    this.bohmTrailB = makeRGBA16F(gl, w, h);
    if (oldTA){
      gl.useProgram(this.progBlit);
      gl.bindVertexArray(this.quad.vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bohmTrailA.fbo);
      gl.viewport(0,0,w,h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, oldTA.tex);
      gl.uniform1i(this.u(this.progBlit,'uTex'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.deleteTexture(oldTA.tex); gl.deleteFramebuffer(oldTA.fbo);
    }
    if (oldTB){ gl.deleteTexture(oldTB.tex); gl.deleteFramebuffer(oldTB.fbo); }
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
  /* CPU 场数据上传 psiA 纹理（initWave 与 R52 渐进弛豫写回共用）。
     data 为 Float32Array(grid²·pairs·2?)——与 makeWave 返回的交错布局一致。 */
  _uploadPsi(data){
    const gl = this.gl, g = this.state.grid;
    gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.ifmt, g, g, 0, this.fmt, gl.FLOAT, data);
  }

  initWave(fx, fy, kx, ky, add){
    const g = this.state.grid, gl = this.gl;
    /* 内核私有初相参数（Pauli 的 spinTheta/spinPhi 等）随 state 透传给 makeWave；
       无此概念的内核忽略多余字段（makeWave 按需读取 p.spinTheta ?? 默认）。
       m=state.m 供一阶内核（Dirac）构造裸质量依赖的正能旋量；标量内核忽略。 */
    const { data, sum: rawSum } = this.kernel.makeWave(g, { fx, fy, kx, ky, sigma: this.state.sigma, m: this.state.m,
                                                              /* R51：g 透传（GP 基态预设的虚时间弛豫需要当前 g；
                                                                 无此概念的内核忽略多余字段——契约允许） */
                                                              g: this.state.g,
                                                              spinTheta: this.state.spinTheta, spinPhi: this.state.spinPhi,
                                                              /* R62：晶格参数透传（lattice 模式的初态是 Bloch
                                                                 平面波 × y 基模，需要 latA 与 twistX；不传则
                                                                 makeWave 拿到 undefined ⟹ NaN 场） */
                                                              latV0: this.state.latV0, latA: this.state.latA,
                                                              twistX: this.state.twistX });
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
    this._uploadPsi(data);
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
    if (p.params){
      Object.assign(this.state, p.params);   /* 内核预设参数（σ/g/potKind 等） */
      /* R54：abSols 是数组（元组列表）——预设对象每次 presets() 调用虽重建，
         仍做显式深拷贝，杜绝「调 Φ 改到预设字面量」的共享引用隐患 */
      if (Array.isArray(this.state.abSols))
        this.state.abSols = this.state.abSols.map(s => [s[0], s[1], s[2]]);
      /* R60：丘列表同策——预设若注入 potBlobs（当前无预设含该字段），
         经 normBlob 归一全字段（旧五字段丘 ⟹ 球+硬边），杜绝共享引用 */
      if (Array.isArray(this.state.potBlobs))
        this.state.potBlobs = this.state.potBlobs.map(normBlob);
    }
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
    /* R62：state 透传给 build —— lattice 预设的势重画要读当前 latV0/latA
       （滑块实时调参；不传则 drawLattice 拿到 undefined ⟹ NaN 势场） */
    p.build({ vctx: this.vctx, vGray: v => this.vGray(v), state: this.state });
    this.uploadV();
    this.initWave(p.wave[0], p.wave[1], p.wave[2], p.wave[3]);
    this.q('#descName').textContent = p.name;
    this.q('#descText').textContent = p.text;
    this.container.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === key));
    this.refreshParamHud();   /* 参数派生 HUD（B 场行/透射面板门控）随预设参数刷新 */
    this.toast(p.name);
  }

  /* R62 晶格参数（latV0/latA/twistX）变更后的统一生效路径：
     ① 确保在晶格场景内（preset 非 lattice 时静默进入并 toast——拖 V₀ 就该看到
        晶格，比「滑块无效」直观）；② 按新参数重画势（内核 enterLattice 与
        presets().lattice.build 共用 drawLatticeV，单源真值）；③ 按新 θ 重发初态。
     **不走 loadPreset**：那条路径会用预设 params 把三个参数打回默认值，与
     「拖滑块调参」的语义冲突（loadPreset 的语义是切场景，不是调参）。 */
  applyLatticeParams(){
    const st = this.state;
    if (this.kernelId !== 'schrodinger' || !this.kernel.enterLattice) return;
    if (st.preset !== 'lattice'){
      st.preset = 'lattice';
      const p = this.kernel.presets().lattice;
      if (p){
        this.q('#descName').textContent = p.name;
        this.q('#descText').textContent = p.text;
      }
      this.container.querySelectorAll('[data-preset]').forEach(b =>
        b.classList.toggle('on', b.dataset.preset === 'lattice'));
      this.toast('光学晶格');
    }
    this.kernel.enterLattice({ vctx: this.vctx, state: st });
    this.uploadV();
    this.reinitWave();        /* 初态按新 θ 重发（makeWave 在 lattice 模式读 twistX） */
    this.refreshParamHud();
  }

  /* R62 单次 Bloch 弛漾（面板「Bloch 弛漾」）：起 CPU 虚时间任务，由 frame()
     主循环经 kernel.relaxStep 分帧推进（暂停态也推进——同 R52 GP 基态口径）。
     带 2 需要带 1 收敛态作 Gram-Schmidt 参考 ⟹ 无参考时先跑带 1，_blochQueue
     记录待跑的带 2（在 _onRelaxDone 里接续，与扫描器的 per-point 次序同策）。 */
  startBlochRelax(){
    const st = this.state;
    if (this.kernelId !== 'schrodinger' || !this.kernel.startRelax){ this.toast('当前内核无 Bloch 弛漾'); return; }
    if (st.preset !== 'lattice'){ this.toast('请先切换到「光学晶格」预设'); return; }
    let band = st.latBand === 2 ? 2 : 1;
    this._blochQueue = 0;
    if (band === 2 && !this.kernel._band1Ref){ this._blochQueue = 2; band = 1; }
    this.kernel.startRelax({ grid: st.grid, m: st.m, v0: st.latV0, a: st.latA, theta: st.twistX, band });
    this._blochStat('带 ' + band + ' 弛漾中…');
    this.toast('Bloch 弛漾 · 带 ' + band);
  }

  stopBlochRelax(){
    if (!this.kernel.relaxStep) return;
    this._blochQueue = 0;
    this.kernel._relaxTask = null;      /* 丢弃任务（无副作用：任务态自包含） */
    this._blochStat('已中止');
    this.toast('Bloch 弛漾已中止');
  }

  /* 弛漾完成回调（evolve() 在 r.done 当帧调用）：写状态行 + 接续排队的带 2。
     状态行如实标注：收敛步数、⟨E⟩、本征残差；blockProj=false 时明确提示
     「带 2 数值不可信」（a_t 非整数 ⟹ 块投影关闭），不静默给出错误数值。 */
  _onRelaxDone(info){
    if (!info || this.kernelId !== 'schrodinger') return;
    const fmtE = v => (Math.abs(v) < 1e-3 ? v.toExponential(3) : v.toFixed(6));
    const warn = (info.band === 2 && info.blockProj === false) ? ' · ⚠ 块投影关闭，带2 不可信' : '';
    this._blochStat((info.converged ? '带 ' + info.band + ' 收敛' : '带 ' + info.band + ' 未收敛') +
      ' @' + info.steps + ' 步 · E=' + fmtE(info.energy) + ' · 残差 ' + info.res.toExponential(2) + warn);
    if (this._blochQueue === 2 && info.band === 1 && info.converged){
      this._blochQueue = 0;
      const st = this.state;
      this.kernel.startRelax({ grid: st.grid, m: st.m, v0: st.latV0, a: st.latA, theta: st.twistX, band: 2 });
      this._blochStat('带 2 弛漾中…');
    } else if (this._blochQueue === 2 && info.band === 1){
      this._blochQueue = 0;
      this._blochStat('带 1 未收敛 ⟹ 带 2 已跳过（无可靠参考态）');
    }
  }

  _blochStat(txt){
    const el = this.q('#blochStat');
    if (el) el.textContent = txt;
  }

  /* ---------- R64 量子弹球：求谱 + 显示本征态 ----------
     求谱是**一次性 CPU 计算**（Lanczos，与 GPU 同一离散口径）。强制 256²：
     vctx 恒 256²，1:1 采样才没有插值/缩放的口径差（与 BlochScanner 强制 256
     同策）。求谱与「当前演化中的场」完全解耦——它只读势场、不改 psi 与本征态
     之外的任何 state。 */
  billiardSpectrum(){
    if (this.kernelId !== 'schrodinger' || !this.kernel.spectrum){
      return this.toast('当前内核无弹球谱求解');
    }
    const st = this.state;
    const stat = this.q('#billStat');
    if (stat) stat.textContent = '求解中…（腔压缩 + shift-invert Lanczos）';
    /* 用当前网格（evecs 全长 = grid²，可直接上传显示）。谱按**预设腔体几何**
       计算，忽略用户手绘的势场改动——面板 hint 已注明。 */
    const sp = this.kernel.spectrum({ grid: st.grid, m: st.m, kind: st.billKind,
                                      nev: 10, eps: 1e-4 });
    this._billSpec = sp;
    this._refreshBillStat();
    const r = sp.meanR;
    this.toast('求谱完成 · ' + sp.evals.length + ' 态 · ⟨r⟩=' +
      (isFinite(r.r) ? r.r.toFixed(3) : '—') + ' · ' + (sp.ms/1000).toFixed(2) + 's');
  }

  _refreshBillStat(){
    const sp = this._billSpec, stat = this.q('#billStat');
    if (!stat) return;
    if (!sp){ stat.textContent = '未求解'; return; }
    const r = sp.meanR;
    const rmax = sp.resid.reduce((a, b) => Math.max(a, b), 0);
    stat.textContent = sp.evals.length + ' 态 · ⟨r⟩=' + (isFinite(r.r) ? r.r.toFixed(3) : '—') +
      '（n=' + r.n + ' 间距）· ' + (sp.ms/1000).toFixed(1) + 's · 残差 ' + rmax.toExponential(1) +
      (sp.notConv ? ' ⚠未完全收敛' : '');
    const lv = this.q('#billLevels');
    if (lv) lv.textContent = sp.evals.slice(0, 6).map(v => v.toExponential(2)).join(' · ') + ' …';
  }

  /* 谱结果快照（面板读数 + CDP 断言共用；无谱返回 null） */
  billInfo(){
    const sp = this._billSpec;
    if (!sp) return null;
    return {
      kind: this.state.billKind, n: sp.evals.length, mK: sp.mK, ms: sp.ms, nc: sp.nc,
      evals: Array.from(sp.evals), r: sp.meanR.r, nR: sp.meanR.n,
      residMax: sp.resid.reduce((a, b) => Math.max(a, b), 0),
      notConv: sp.resid.some(v => v > 1e-6),
      stat: (this.q('#billStat') || {}).textContent,
      levels: (this.q('#billLevels') || {}).textContent,
    };
  }

  /* 把第 idx 个本征向量上传到 psiA（实部，虚部 0）。本征态在演化下只累积
     全局相位 ⟹ 密度图样静止，可直接观察 scar；同时把 lastWave 置为中点零
     动量，避免「重置波包」把画面对回高斯包以外的旧几何。 */
  billiardShowBand(idx){
    const sp = this._billSpec;
    if (!sp || !sp.evecs[idx]) return this.toast('先点「求谱」');
    const g = this.state.grid, N = g*g, x = sp.evecs[idx];
    const data = new Float32Array(N*2);
    for (let i = 0; i < N; i++){ data[i*2] = x[i]; data[i*2+1] = 0; }
    this._uploadPsi(data);
    this.state.waveCount = 1;
    this.state.simTime = 0;
    this.state.lastWave = [0.5, 0.5, 0, 0];
    this.state.billBand = idx;
    this.toast('第 ' + (idx + 1) + ' 个本征态 · E=' + sp.evals[idx].toFixed(6));
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
    /* R52：GP 基态预设的虚时间渐进弛豫（初态构造）优先于实时演化——任务
       未完成时冻结 KDK，每帧推进 RELAX_BUDGET 步虚时间流并上传场快照
       （收敛过程在画面上可见）；完成当帧恢复正常演化。返回 false 表示本帧
       被弛豫占用（扫描器 _tick 据此跳过帧计数/测量，固定测量窗从基态起算）。 */
    if (this.kernel.relaxStep){
      const r = this.kernel.relaxStep(RELAX_BUDGET);
      if (r){
        this._uploadPsi(r.data);
        if (r.done && this.kernel.spinReadout) this.spinHud();
        /* R62：Bloch 弛漾完成当帧写状态行 / 接续排队的带 2（扫描器的相位机
           用自己的 measure 钩子，与此互不干扰——二者不会同时活跃） */
        if (r.done) this._onRelaxDone(r.info);
      }
    }
    if (this.kernel.relaxPending) return false;
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
    } else if (this.state.bOrb !== 0 && this.kernelId === 'schrodinger'){
      /* R63 均匀 B_z：仅 2D 薛定谔内核走规范帧 ADI（evolveKDK_B）。NLS/GP 的
         非线性项进 ADI 双扫描会被双重计数、Dirac/Pauli 走 CN、3D 无 B 分支
         ——面板/滑块/URL 三层门控保证不会带 B 进这些内核，此处为分派兜底。 */
      this.evolveKDK_B(dt);
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

  /* ---------- R61 概率流 J：场 / 归约 / Bohm 轨迹 ----------
     数学契约见 kernel.js 头注【概率流约定】。单位制：J = (1/m)·Im(ψ*∇ψ)
     为格点动量通量（平面波 ⟹ J_x=k/m）；Dirac 覆写为 ψ†σψ（群速口径）。
     Bohm 制导速度 v = J/ρ（格点速度 ⟹ ×1/g 换算 uv 步长）。 */
  jFieldPass(){
    const gl = this.gl, st = this.state;
    gl.useProgram(this.progJField);
    gl.bindVertexArray(this.quad.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.jT.fbo);
    gl.viewport(0,0,st.grid,st.grid);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
    gl.uniform1i(this.u(this.progJField,'uPsi'), 0);
    gl.uniform2f(this.u(this.progJField,'uTexel'), 1/st.grid, 1/st.grid);
    gl.uniform1f(this.u(this.progJField,'uInvM'), 1/st.m);
    this.kernel.setUniforms(gl, this.progJField, st);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  jRedPass(){
    const gl = this.gl, st = this.state;
    gl.useProgram(this.progJRed);
    gl.bindVertexArray(this.quad.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.jRedT.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.viewport(0,0,32,32);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.jT.tex);
    gl.uniform1i(this.u(this.progJRed,'uJ'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
    gl.uniform1i(this.u(this.progJRed,'uPsi'), 1);
    gl.uniform1f(this.u(this.progJRed,'uGrid'), st.grid);
    this.kernel.setUniforms(gl, this.progJRed, st);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._jBuf0);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._jBuf1);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._jBuf2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const o0 = [0,0,0,0], o1 = [0,0,0,0], o2 = [0,0,0,0];
    for (let i=0;i<1024;i++){
      for (let c=0;c<4;c++){
        o0[c] += this._jBuf0[i*4+c]; o1[c] += this._jBuf1[i*4+c]; o2[c] += this._jBuf2[i*4+c];
      }
    }
    this._j = { sjx:o0[0], sjy:o0[1], sdj:o0[2], sp:o0[3], fl:o1[0], fr:o1[1], fb:o1[2], ft:o1[3], mj:o2[0], saj:o2[1] };
    this._jScale = o2[0];   /* max|J|：显示箭头长度归一化基准 */
    this.jHud();
  }

  jField3Pass(){
    const gl = this.gl, st = this.state, n = st.grid;
    gl.useProgram(this.progJField3);
    gl.bindVertexArray(this.quad.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.jT3.fbo);
    gl.viewport(0,0,n,n);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.psiA3.tex);
    gl.uniform1i(this.u(this.progJField3,'uPsi'), 0);
    gl.uniform3f(this.u(this.progJField3,'uTexel3'), 1/n, 1/n, 1/n);
    gl.uniform1f(this.u(this.progJField3,'uInvM'), 1/st.m);
    this.kernel.setUniforms(gl, this.progJField3, st);
    const uLayer = this.u(this.progJField3,'uLayer');
    for (let l=0;l<n;l++){
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.jT3.tex, 0, l);
      gl.uniform1f(uLayer, (l+0.5)/n);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  jRed3Pass(){
    const gl = this.gl, st = this.state;
    gl.useProgram(this.progJRed3);
    gl.bindVertexArray(this.quad.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.jRedT3.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.viewport(0,0,32,32);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.jT3.tex);
    gl.uniform1i(this.u(this.progJRed3,'uJ'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.psiA3.tex);
    gl.uniform1i(this.u(this.progJRed3,'uPsi'), 1);
    gl.uniform1f(this.u(this.progJRed3,'uGrid3'), st.grid);
    this.kernel.setUniforms(gl, this.progJRed3, st);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._jBuf0);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._jBuf1);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,this._jBuf2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const o0 = [0,0,0,0], o1 = [0,0,0,0], o2 = [0,0,0,0];
    for (let i=0;i<1024;i++){
      for (let c=0;c<4;c++){
        o0[c] += this._jBuf0[i*4+c]; o1[c] += this._jBuf1[i*4+c]; o2[c] += this._jBuf2[i*4+c];
      }
    }
    this._j3 = { jx:o0[0], jy:o0[1], jz:o0[2], dj:o0[3],
                 fxm:o1[0], fxp:o1[1], fym:o1[2], fyp:o1[3],
                 fzm:o2[0], fzp:o2[1], mj:o2[2], sp:o2[3] };
    this._jScale = o2[2];
    this.jHud();
  }

  /* J HUD（2D/3D 同一节）：ΣJ 向量、Σ∇·J、Gauss 残差（望远镜自校验）、
     max|J|（箭头归一化基准）、Bohm 粒子数。 */
  jHud(){
    if (!this.q('#jSec')) return;
    const ex = v => (v === 0 ? '0' : v.toExponential(2));
    if (this._j){
      const j = this._j;
      const gauss = j.sdj - (j.fr - j.fl + j.ft - j.fb);
      this.q('#hJSum').textContent = '(' + ex(j.sjx) + ', ' + ex(j.sjy) + ')';
      this.q('#hJDiv').textContent = ex(j.sdj);
      this.q('#hJGauss').textContent = ex(gauss);
      this.q('#hJMax').textContent = ex(j.mj);
    } else if (this._j3){
      const j = this._j3;
      const gauss = j.dj - (j.fxp - j.fxm + j.fyp - j.fym + j.fzp - j.fzm);
      this.q('#hJSum').textContent = '(' + ex(j.jx) + ', ' + ex(j.jy) + ', ' + ex(j.jz) + ')';
      this.q('#hJDiv').textContent = ex(j.dj);
      this.q('#hJGauss').textContent = ex(gauss);
      this.q('#hJMax').textContent = ex(j.mj);
    }
    const bn = this.q('#hBohmN');
    if (bn) bn.textContent = this.kernel.dim3 ? '—（2D 专属）' : String(this._bohmN);
  }

  /* J/Bohm HUD 节可见性（任一开关打开即显示） */
  _jSecVis(){
    const s = this.q('#jSec');
    if (s) s.style.display = (this.state.showJ || this.state.bohmOn) ? '' : 'none';
  }

  setShowJ(v){
    this.state.showJ = !!v;
    const b = this.q('#btnShowJ'); if (b) b.classList.toggle('on', this.state.showJ);
    const b3 = this.q('#btnShowJ3'); if (b3) b3.classList.toggle('on', this.state.showJ);
    this._jSecVis();
    /* toggle 时立即建立 J 场与尺度（箭头长度归一化基准 max|J| 来自 jRed） */
    if (this.state.showJ && this.progJField){
      if (this.kernel.dim3){ this.jField3Pass(); this.jRed3Pass(); }
      else { this.jFieldPass(); this.jRedPass(); }
    }
    return this.state.showJ;
  }

  setBohmOn(v){
    if (this.kernel.dim3){ this.state.bohmOn = false; return false; }   /* Bohm 轨迹 2D 专属 */
    this.state.bohmOn = !!v;
    const b = this.q('#btnBohm'); if (b) b.classList.toggle('on', this.state.bohmOn);
    this._jSecVis();
    if (this.state.bohmOn){
      if (this._bohmN === 0) this.bohmSeeds(24);   /* 默认 |ψ|² 加权撒 24 粒 */
      this.jFieldPass(); this.jRedPass();          /* 立即可用的 J 场 + 尺度 */
      this.bohmClearTrail();
    }
    return this.state.bohmOn;
  }

  /* 读回 64 个粒子（posA 为当前读纹理）：null = 停泊/未激活 */
  bohmPositions(){
    const gl = this.gl;
    const buf = new Float32Array(64*2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.posA.fbo);
    gl.readPixels(0,0,64,1,gl.RG,gl.FLOAT,buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return Array.from({length:64}, (_,i) => buf[i*2] < 0 ? null : [buf[i*2], buf[i*2+1]]);
  }

  /* 放置单粒子（pointer 'bohm' 工具 / CDP）：空位追加；满员轮换最旧。
     返回槽位；dim3 内核拒绝（轨迹 2D 专属）。 */
  bohmPlace(wx, wy){
    if (this.kernel.dim3) return -1;
    const pos = this.bohmPositions();
    let slot = -1;
    for (let i=0;i<64;i++) if (!pos[i]){ slot = i; break; }
    if (slot < 0){ slot = this._bohmRow % 64; this._bohmRow++; }
    const wasActive = !!pos[slot];
    const buf = new Float32Array(64*2).fill(-1);
    for (let i=0;i<64;i++) if (pos[i]){ buf[i*2] = pos[i][0]; buf[i*2+1] = pos[i][1]; }
    buf[slot*2] = Math.max(0, Math.min(1, wx));
    buf[slot*2+1] = Math.max(0, Math.min(1, wy));
    const gl = this.gl;
    for (const t of [this.posA, this.posB]){
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 64, 1, 0, gl.RG, gl.FLOAT, buf);
    }
    this._bohmN = pos.filter(Boolean).length + (wasActive ? 0 : 1);
    this.jHud();
    return slot;
  }

  /* |ψ|² 加权撒 n 个粒子（一次 CPU 回读 + 前缀和二分；用户触发，非每帧） */
  bohmSeeds(n){
    n = Math.max(1, Math.min(64, n|0));
    const gl = this.gl, g = this.state.grid, ch = this.kernel.pairs === 2 ? 4 : 2;
    const buf = new Float32Array(g*g*ch);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
    gl.readPixels(0,0,g,g,this.fmt,gl.FLOAT,buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const cdf = new Float64Array(g*g);
    let acc = 0;
    for (let i=0;i<g*g;i++){ acc += this.kernel.cpuDensity(buf, i*ch); cdf[i] = acc; }
    if (!(acc > 0)) return 0;   /* 空场不撒 */
    const pos = new Float32Array(64*2).fill(-1);
    for (let s=0; s<n; s++){
      const r = Math.random()*acc;
      let lo = 0, hi = g*g-1;
      while (lo < hi){ const mid = (lo+hi)>>1; if (cdf[mid] >= r) hi = mid; else lo = mid+1; }
      pos[s*2] = ((lo % g) + 0.5)/g;
      pos[s*2+1] = (((lo/g)|0) + 0.5)/g;
    }
    for (const t of [this.posA, this.posB]){
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 64, 1, 0, gl.RG, gl.FLOAT, pos);
    }
    this._bohmN = n; this._bohmRow = 0;
    this.jHud();
    return n;
  }

  bohmClearTrail(){
    const gl = this.gl;
    for (const t of [this.bohmTrailA, this.bohmTrailB]){
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearColor(0,0,0,1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bohmReset(){
    const gl = this.gl;
    const pos = new Float32Array(64*2).fill(-1);
    for (const t of [this.posA, this.posB]){
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 64, 1, 0, gl.RG, gl.FLOAT, pos);
    }
    this._bohmN = 0; this._bohmRow = 0;
    this.bohmClearTrail();
    this.jHud();
  }

  /* 制导步进一帧：v = J/max(ρ,floor)（格点速度）× dt × 1/g（uv 步长），
     长度钳制 uMaxStep；出界停泊。ping-pong 后 posA 恒为当前读纹理。 */
  bohmStep(){
    const gl = this.gl, st = this.state;
    gl.useProgram(this.progBohmStep);
    gl.bindVertexArray(this.quad.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.posB.fbo);
    gl.viewport(0,0,64,1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.posA.tex);
    gl.uniform1i(this.u(this.progBohmStep,'uPos'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.jT.tex);
    gl.uniform1i(this.u(this.progBohmStep,'uJ'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
    gl.uniform1i(this.u(this.progBohmStep,'uPsi'), 2);
    gl.uniform2f(this.u(this.progBohmStep,'uTexel'), 1/st.grid, 1/st.grid);
    gl.uniform1f(this.u(this.progBohmStep,'uInvGrid'), 1/st.grid);
    gl.uniform1f(this.u(this.progBohmStep,'uDt'), 1.2);        /* 与帧 dt 同 */
    gl.uniform1f(this.u(this.progBohmStep,'uRhoFloor'), 1e-7); /* 节点防除零 */
    gl.uniform1f(this.u(this.progBohmStep,'uMaxStep'), 0.05);  /* uv 单位半格上限 */
    this.kernel.setUniforms(gl, this.progBohmStep, st);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const t = this.posA; this.posA = this.posB; this.posB = t;
  }

  /* 残影一帧：fade（B=A·uFade）→ blit B→A → stamp POINTS（MAX 混合）→
     A 持有最新（display 采样 A）。**无 ping-pong 交换**——fade/blit/stamp
     三步依次读写分离（fade 读 A 写 B、blit 读 B 写 A、stamp 读 posA 写 A），
     终点即 A；若学 bohmStep 的写法在末尾交换 A↔B，stamp 会落进 B 而显示
     采样空 A（残影永不可见，2026-10 R61 CDP 实测捕获：bohmTrailStats
     A.mx≡0 / B.n≈790）。resize 段亦以「blit 旧 A→新 A」维持同一不变量。 */
  bohmStamp(){
    const gl = this.gl, cw = this.canvas.width, ch = this.canvas.height;
    gl.useProgram(this.progBohmFade);
    gl.bindVertexArray(this.quad.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bohmTrailB.fbo);
    gl.viewport(0,0,cw,ch);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bohmTrailA.tex);
    gl.uniform1i(this.u(this.progBohmFade,'uTrail'), 0);
    gl.uniform1f(this.u(this.progBohmFade,'uFade'), this.state.bohmFade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(this.progBlit);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bohmTrailA.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bohmTrailB.tex);
    gl.uniform1i(this.u(this.progBlit,'uTex'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(this.progBohmStamp);
    gl.bindVertexArray(this.ptsVao);
    gl.viewport(0,0,cw,ch);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.posA.tex);
    gl.uniform1i(this.u(this.progBohmStamp,'uPos'), 0);
    gl.uniform1f(this.u(this.progBohmStamp,'uPointSize'), Math.max(2, Math.min(cw,ch)*0.008));
    gl.uniform3f(this.u(this.progBohmStamp,'uColor'), 1.0, 0.85, 0.35);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.drawArrays(gl.POINTS, 0, 64);
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* 残影纹理回读（调试/验证）：两张 ping-pong 纹理的亮像素统计
     {cw, ch, A:{mx,sum,n}, B:{mx,sum,n}}。bohmTrailA 恒为显示采样纹理
     （display pass TEXTURE4）⟹ stamp 后 A.mx>0.1、B 为 scratch。
     R61 取证与回归断言面：曾因 bohmStamp 末尾误置 ping-pong 交换致
     stamp 写进 B、显示永远采样空 A（截图无残影），见 worklog R61。 */
  bohmTrailStats(){
    const gl = this.gl, cw = this.canvas.width, ch = this.canvas.height;
    const read = (t) => {
      const buf = new Float32Array(cw*ch*4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.readPixels(0,0,cw,ch,gl.RGBA,gl.FLOAT,buf);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      let mx = 0, sum = 0, n = 0;
      for (let i=0;i<cw*ch;i++){ const v = buf[i*4]+buf[i*4+1]+buf[i*4+2]; if (v > mx) mx = v; sum += v; if (v > 0.05) n++; }
      return { mx, sum, n };
    };
    return { cw, ch, A: read(this.bohmTrailA), B: read(this.bohmTrailB) };
  }

  /* AB 多螺线管 uniform 上传（R54）：扁平数组一次 uniform2fv/uniform1fv——
     uABPos[AB_MAX]/uABPhi[AB_MAX] 尾部不足处补 (0.5,0.5)/0（shader 只读前
     uABCount 项，尾部值无物理意义；缓冲区复用，每帧重填 8 项成本可忽略）。
     uABSel 仅 display program 声明（其余 program location=null，静默忽略）。
     diag=true（manualPass 诊断路径）与 count=0 一样强制 uABOn=0：走原 5 点
     stencil（精确等价无矢势路径，R26 口径不变）。 */
  setABUniforms(gl, prog, diag){
    const st = this.state;
    const sols = st.abSols || [];
    const n = Math.min(sols.length, AB_MAX);
    const pos = this._abPos || (this._abPos = new Float32Array(AB_MAX*2));
    const phi = this._abPhi || (this._abPhi = new Float32Array(AB_MAX));
    for (let i = 0; i < AB_MAX; i++){
      if (i < n){ pos[i*2] = sols[i][0]; pos[i*2+1] = sols[i][1]; phi[i] = sols[i][2]; }
      else { pos[i*2] = 0.5; pos[i*2+1] = 0.5; phi[i] = 0; }
    }
    gl.uniform1f(this.u(prog,'uABOn'), (!diag && n > 0) ? 1 : 0);
    gl.uniform2fv(this.u(prog,'uABPos'), pos);
    gl.uniform1fv(this.u(prog,'uABPhi'), phi);
    gl.uniform1i(this.u(prog,'uABCount'), diag ? 0 : n);
    const selLoc = this.u(prog,'uABSel');
    if (selLoc !== null && selLoc !== undefined)
      gl.uniform1i(selLoc, (!diag && st.abSel >= 0 && st.abSel < n) ? st.abSel : -1);
    /* R55 放置预览环（仅 display program 声明这两个 uniform；evolve/CN 的
       location=null 静默跳过——同 uABSel 模式）。cursor 为 null 时上传
       (-1,-1) 关闭预览；草稿 Φ 供预览环的色相/辉光映射。 */
    const curLoc = this.u(prog,'uABCursor');
    if (curLoc !== null && curLoc !== undefined){
      const c = st.abCursor;
      gl.uniform2f(curLoc, c ? c[0] : -1, c ? c[1] : -1);
    }
    const dLoc = this.u(prog,'uABDraftPhi');
    if (dLoc !== null && dLoc !== undefined) gl.uniform1f(dLoc, st.abPhi || 0);
  }

  /* R62 Bloch 扭曲边界的**总相位** θ_BC = h·θ_B（h = 256/latA = 网格内的晶格
     周期数）。面板 twistX 的语义是**每晶格周期**的 Bloch 相位 θ_B = k·a
     （∈[0,π] 覆盖简约 BZ）；而 twisted BC（ψ(x+n)=e^{iθ}ψ(x)）要求的是跨越
     整个网格 h 个周期累积的总相位——两者差 h 倍（worklog R62 第五轮：混用会
     使 θ≠0 的初态动量支撑错位 ⟹ 带 2 弛漾崩塌到相邻 k 的带 1）。
     latA 非 256 的约数时 h 非整数 ⟹ 直接取实数值（GPU 相位仍可运行，但势与
     边界不严格自洽；CPU 弛漾的块投影会在 info.blockProj=false 中如实标注）。 */
  twistBC(){
    const h = 256/Math.max(1e-9, this.state.latA || 32);
    return (this.state.twistX || 0)*h;
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
    /* R62 Bloch 扭曲边界：uTwistX = **跨整个网格**的总相位 θ_BC = h·θ_B
       （h=256/latA 个晶格周期；面板 twistX 语义是每周期相位 θ_B=k·a）。
       θ_BC=0 ⟹ shader 走原 Dirichlet 路径逐位等价（同 uABOn/uDriveAmp 门控）。 */
    gl.uniform1f(this.u(this.progEvolve,'uTwistX'), this.twistBC());
    /* R63 均匀 B_z：B 模式由 evolveKDK_B 独家处理（规范帧 ADI 定制分支），
       本 plain 路径恒 uBOn=0/uBz=0/uLapDir=0 ⟹ 定制分支不进、LAP_BLOCK 无
       B 分支 ⟹ 逐位等价 R62 及以前的裸 5 点 KDK（含 NLS/GP/Dirac/Pauli）。
       uLapDir=0 显式上传还消除「evolveKDK_B 跑过后 program 级 state 残留」
       的隐患（B 滑块拖回 0 的当帧即回 plain 路径）。 */
    gl.uniform1f(this.u(this.progEvolve,'uBOn'), 0);
    gl.uniform1f(this.u(this.progEvolve,'uBz'), 0);
    gl.uniform1f(this.u(this.progEvolve,'uLapDir'), 0);
    /* Aharonov-Bohm（R54 多管）：count=0 → uABOn=0 走原 5 点 stencil（精确等价旧路径）；
       link 相位算子厄米且谱半径不变（|U|=1），P 守恒、E_max 不变。 */
    this.setABUniforms(gl, this.progEvolve, false);
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

  /* R63 均匀磁场 B_z 的**规范帧 ADI**一帧推进（kernelId='schrodinger' 且
     state.bOrb≠0；2D 专属，evolve() 门控分派）。
     立项根因：复数 H（Peierls 相位）配 GPU KDK 的 Re/Im 拆分**不酉**——kick
     用 Re(Hψ)、drift 用 Im(Hψ)，B≠0 时放大矩阵谱半径 ρ>1 且 ρ−1 随网格线性
     增长（CPU 镜像实测 n=16: 3.4e-3@B=0.02，外推 n=128 ~2.4e-2/子步必爆），
     AB 多管分支同构亦有此病（|U|=1 只保谱半径，不保 KDK 的酉性）。
     算法（kernel.js TPL_EVOLVE 定制分支，CPU float64 镜像数值验证见 worklog
     R63「实施记录与验证」）：
       · 每子步两个方向扫描，偶子步 x→y、奇子步 y→x（alternating-Lie，
         [A,B] 相消 ⟹ 二阶，等价 Strang 精度）；
       · 每扫描 = 完整 KDK（kick/drift/kick 3 pass）⟹ 6 pass/子步（plain
         KDK 3 pass 的 2×；规范变换融合在 x 扫描着色器内，无额外 pass）；
       · x 扫描（uLapDir=1）：shader 内 φ=e^{+iBxy}ψ 规范旋转使 x 向 link 变
         **实** stencil ⟹ 与 B=0 逐字同构的精确酉 KDK；y 扫描（uLapDir=2）：
         Landau 规范 y 向本无相位 ⟹ 原帧裸实 1D stencil；
       · V/2 对半 splitting（shader 内 V*=0.5；含驱动势——驱动是 V 的一部分，
         规范不变，两扫描合计恰为全 V）；
       · B 模式强制 uTwistX=0 与 AB off（setABUniforms diag=true）——规范帧
         要求无扭曲边界/无点磁通，面板/滑块/URL 层已互斥，此处兜底；
       · **稳定性（实测修正，勿再按单方向界推）**：交替 splitting 的稳定域由
         **完整 2D H 的谱**支配，不是单方向 1D 界——交叉项 (dts²/2)[A,B] 在
         λ~O(1) 时被放大。CPU float64 镜像（n=256/B=0.05 同扫描几何，3 个
         回旋周期）实测：dts=0.1/0.2/0.3 保范 2e-6/5e-5/2e-4（有界、不增长），
         dts=0.4 在 t≈90 崩溃（P−1→4.8），dts=0.6 立即漂移（t=32 即 1.3）。
         ⟹ eMax 取与 plain KDK **逐字相同**的全 2D 界（uK·8+1）⟹ dt=1.2 时
         sub=4、dts=0.3（成本 4×6=24 pass/帧，plain 为 4×3=12 pass）。 */
  evolveKDK_B(dt){
    const k = 0.5/this.state.m;
    const gl = this.gl;
    /* 与 evolveKDK 同一 eMax（全 2D 界；理由见上段实测） */
    const eMax = k*8 + 1 + this.kernel.eMaxExtra(this.state) + Math.abs(this.state.driveAmp);
    const sub = Math.max(this.state.substeps, Math.ceil(dt*eMax/1.5));
    const dtSub = dt/sub;
    gl.useProgram(this.progEvolve);
    gl.bindVertexArray(this.quad.vao);
    gl.uniform1f(this.u(this.progEvolve,'uDt'), dtSub);
    gl.uniform1f(this.u(this.progEvolve,'uK'), k);
    gl.uniform2f(this.u(this.progEvolve,'uTexel'), 1/this.state.grid, 1/this.state.grid);
    /* 含时外场：帧中点冻结相位（与 plain KDK 同口径；驱动经 V/2 进两个扫描） */
    const dPhase = this.state.driveOmega * (this.state.simTime + dt*0.5);
    gl.uniform1f(this.u(this.progEvolve,'uDriveAmp'), this.state.driveAmp);
    gl.uniform1f(this.u(this.progEvolve,'uDrivePhase'), dPhase);
    gl.uniform1i(this.u(this.progEvolve,'uDriveMode'), this.state.driveMode);
    gl.uniform1f(this.u(this.progEvolve,'uTwistX'), 0);          /* B 模式禁扭曲边界 */
    gl.uniform1f(this.u(this.progEvolve,'uBOn'), 1);
    gl.uniform1f(this.u(this.progEvolve,'uBz'), this.state.bOrb);
    this.setABUniforms(gl, this.progEvolve, true);               /* B 模式禁 AB（diag 口径） */
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.vTex);
    gl.uniform1i(this.u(this.progEvolve,'uV'), 1);
    this.kernel.setUniforms(gl, this.progEvolve, this.state);   /* 内核私有 uniform */
    const uUV = this.u(this.progEvolve,'uUpdateV');
    const uDir = this.u(this.progEvolve,'uLapDir');
    for (let s=0; s<sub; s++){
      /* alternating-Lie：偶子步先 x 后 y、奇子步先 y 后 x */
      const order = (s % 2 === 0) ? [1.0, 2.0] : [2.0, 1.0];
      for (const dir of order){
        gl.uniform1f(uDir, dir);
        for (let pass=0; pass<3; pass++){
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiB.fbo);
          gl.viewport(0,0,this.state.grid,this.state.grid);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
          gl.uniform1i(this.u(this.progEvolve,'uPsi'), 0);
          gl.uniform1f(uUV, pass === 1 ? 0.0 : 1.0);   // kick, drift, kick
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const tmp = this.psiA; this.psiA = this.psiB; this.psiB = tmp;
        }
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
    /* R58：含时外场幅值计入 H 特征值上界（与 2D 同口径），防极端小质量下
       dt·E 越过 KDK 稳定极限；A=0 时该项为 0 ⟹ 与 R34–R57 逐位一致。 */
    const eMax = k*12 + 1 + this.kernel.eMaxExtra(this.state) + Math.abs(this.state.driveAmp);
    const sub = Math.max(this.state.substeps, Math.ceil(dt*eMax/1.5));
    const dtSub = dt/sub;
    gl.useProgram(this.progEvolve3d);
    gl.bindVertexArray(this.quad.vao);
    gl.uniform1f(this.u(this.progEvolve3d,'uDt'), dtSub);
    gl.uniform1f(this.u(this.progEvolve3d,'uK'), k);
    gl.uniform3f(this.u(this.progEvolve3d,'uTexel3'), 1/n, 1/n, 1/n);
    gl.uniform1f(this.u(this.progEvolve3d,'uGrid3'), n);
    /* R58 含时外场：帧中点冻结相位 φ = ω·(t + dt/2)（与 2D KDK 同口径，
       simTime 派生无累加态）；A=0 时 shader 内 `V += 0·cos(φ)` 精确恒等。 */
    gl.uniform1f(this.u(this.progEvolve3d,'uDriveAmp'), this.state.driveAmp);
    gl.uniform1f(this.u(this.progEvolve3d,'uDrivePhase'), this.state.driveOmega*(this.state.simTime + 0.5*dt));
    gl.uniform1i(this.u(this.progEvolve3d,'uDriveMode'), this.state.driveMode|0);
    this.kernel.setUniforms(gl, this.progEvolve3d, this.state);   /* 私有 uniform（势参数） */
    /* R57：3D AB 磁通管 uniform（引擎级，与 2D 同一 setABUniforms；管轴沿 z、
       uABPos=管轴 xy 投影）。count=0 ⟹ uABOn=0 走原 7 点 stencil 逐位等价。 */
    this.setABUniforms(gl, this.progEvolve3d, false);
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
    /* R58 耗散（开放系统）：帧级标量衰减 e^{-γ·dt}——与 2D 同一论证（数学精确、
       与子步数/网格/内核/积分器解耦；把 −iγ 塞进 H 的方案衰减率带 O((γ·dt_sub)²)
       误差且与谱耦合，已弃用）。3D 经 _volumePass3 逐层 draw 缩放全卷（与
       evolve3d 同机制）；u/v 两通道同乘（v 是 KDK 辅助量，同步缩放保持 u/v
       比例）。γ=0 时跳过 ⟹ 厄米路径零改动（零回归）。 */
    if (this.state.gamma !== 0 && this.progScale3d){
      const gl = this.gl;
      gl.useProgram(this.progScale3d);
      gl.uniform1f(this.u(this.progScale3d,'uScale'), Math.exp(-this.state.gamma * dt));
      this._volumePass3(this.progScale3d, this.psiA3.tex, this.psiB3, null);
      const tmp = this.psiA3; this.psiA3 = this.psiB3; this.psiB3 = tmp;
    }
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
    /* R58：含时外场幅值计入 H 特征值上界（与 2D 同口径），防极端小质量下
       dt·E 越过 KDK 稳定极限；A=0 时该项为 0 ⟹ 与 R34–R57 逐位一致。 */
    const eMax = k*12 + 1 + this.kernel.eMaxExtra(this.state) + Math.abs(this.state.driveAmp);
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
      /* R58 含时外场（rhs/sweep 两 program 同源，与 KDK 同帧中点口径） */
      gl.uniform1f(this.u(prog,'uDriveAmp'), this.state.driveAmp);
      gl.uniform1f(this.u(prog,'uDrivePhase'), this.state.driveOmega*(this.state.simTime + 0.5*dt));
      gl.uniform1i(this.u(prog,'uDriveMode'), this.state.driveMode|0);
      this.kernel.setUniforms(gl, prog, this.state);   /* 私有 uniform（势参数） */
      /* R57：3D AB uniform（rhs/sweep 两 program 同源，与 KDK 路径同一份 abSols） */
      this.setABUniforms(gl, prog, false);
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
    /* R62 Bloch 扭曲边界（CN 两个 program 同源，同 KDK 口径） */
    gl.uniform1f(this.u(prog,'uTwistX'), diag ? 0 : this.twistBC());
    this.setABUniforms(gl, prog, diag);   /* AB 多螺线管（diag 时强制关闭，同 R31 诊断口径） */
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.vTex);
    gl.uniform1i(this.u(prog,'uV'), 1);
    this.kernel.setUniforms(gl, prog, st);   /* 内核私有 uniform（Dirac 的 uMass 等） */
  }

  frame(now){
    this._raf = requestAnimationFrame(this.frame);
    const k = 0.5/this.state.m;
    const gl = this.gl;
    /* R52：弛豫任务不受暂停影响（初态构造必须完成——暂停态切 gs 预设不能
       卡死；scanBusy 时物理由扫描器 _tick 独家驱动，frame() 不重复推进，
       避免同一帧双倍弛豫步进）。 */
    const scanBusy = this.scanner.busy || this.scannerGp.busy || this.scannerNls.busy ||
                     this.scannerSlit.busy || this.scannerBloch.busy;
    if (!this.state.paused || (this.kernel.relaxPending && !scanBusy)) this.evolve();
    /* R61 3D 概率流（evolve 后重算逐层 J 场；归约在 frame3d 的 120ms 节流块内）。
       3D 无箭头 overlay（volume ray-march 未挂 J 层）——showJ 在 3D 为 HUD
       统计读数（ΣJ/Σ∇·J/Gauss 残差/max|J|），面板按钮与文档如实标注。 */
    if (this.kernel.dim3 && (this.state.showJ || this.state.bohmOn)) this.jField3Pass();
    /* 3D 体积路径（kernel.dim3）：volume ray-march → 合成 → 全卷 HUD；与 2D 路径
       完全分离（互不共享显示 program / 归约管线），零分支风险。 */
    if (this.kernel.dim3){ this.frame3d(now); return; }

    /* R61 概率流 / Bohm 轨迹（默认关；evolve 后重算 J 场，与显示同帧——
       扫描器独占物理时 frame() 的 evolve 不跑，此处仍按 psiA 重算，读数不陈旧） */
    if (this.state.showJ || this.state.bohmOn) this.jFieldPass();
    if (this.state.bohmOn && this._bohmN > 0){ this.bohmStep(); this.bohmStamp(); }
    /* R62：Bloch 弛漾进度（200ms 节流；**不受 paused 门控**——弛漾在暂停态也
       推进，进度行必须跟着走，否则看起来像卡死） */
    if (this.kernelId === 'schrodinger' && this.kernel.relaxPending && now - (this._lastBlochF || 0) > 200){
      this._lastBlochF = now;
      const t = this.kernel._relaxTask;
      if (t) this._blochStat('带 ' + t.band + ' 弛漾中… ' + t.steps + ' 步');
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
    /* AB 螺线管标记（与演化同开关：count=0 不画环；选中管金环供交互反馈） */
    this.setABUniforms(gl, this.progDisplay, false);
    this.kernel.setUniforms(gl, this.progDisplay, this.state);
    /* R61：概率流箭头 / Bohm 残影 uniform（默认 0 ⟹ shader 门控段不执行，
       与旧路径逐字等价）。uJScale = max|J|（jRed 回读；0 时箭头段整体跳过）。 */
    gl.uniform1f(this.u(this.progDisplay,'uShowJ'), this.state.showJ ? 1 : 0);
    gl.uniform1f(this.u(this.progDisplay,'uBohmOn'), this.state.bohmOn ? 1 : 0);
    gl.uniform1f(this.u(this.progDisplay,'uBohmGain'), this.state.bohmOn ? 0.9 : 0);
    gl.uniform1f(this.u(this.progDisplay,'uJScale'), this._jScale || 0);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.jT.tex);
    gl.uniform1i(this.u(this.progDisplay,'uJ'), 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.bohmTrailA.tex);
    gl.uniform1i(this.u(this.progDisplay,'uBohmTrail'), 4);
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
      /* R63：留存最近一次归约矩——质心（Σx·p/P, Σy·p/P）是回旋运动的观测量，
         验证脚本需按帧采样（无额外 GPU 回读） */
      this._lastMom = { sp, st, sv, sx, sy, sxx, syy };
      this.hud(sp, st, sv, Math.sqrt(sp2), {sx, sy, sxx, syy, stx, sty, pmx, pmy});
      /* R61 概率流归约（同 120ms 节流；仅开关时跑）——max|J| 驱动箭头归一化 */
      if (this.state.showJ || this.state.bohmOn) this.jRedPass();
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
    /* R59：3D 磁通管标记 uniform（与演化同一份 abSols，复用 setABUniforms；
       uABSel 选中提亮；显示路径不需要 abCursor/uABDraftPhi ⟹ location 为 null 静默跳过） */
    this.setABUniforms(gl, this.progVolume, false);
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
      /* R61 3D 概率流归约（同 120ms 节流；仅开关时跑） */
      if (this.state.showJ || this.state.bohmOn) this.jRed3Pass();
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

  /* ---------- 3D 势刷（R44）：屏幕 → 体积射线拾取 ----------
     相机模型的 CPU 镜像，与 TPL_DISPLAY3D 的 ray-march 段逐字同源
     （镜像契约：改 shader 相机段必须同步此处，否则拾取点与画面不符）：
        ro   = dist·(cp·ct, sp, cp·st)
        fwd  = −ro/|ro|
        right= normalize(cross(fwd, (0,1,0)))      φ 钳制 ±1.45 ⟹ |right|≥0.12 不退化
        up   = cross(right, fwd)
        rd   = normalize(fwd*1.6 + right·ndc.x·aspect*0.5 + up·ndc.y·0.5)
     输入 nx/ny 为画布分数坐标（ny 向上，与 vUv 同口径——2D toWorld 的
     uy=1−(cy−top)/height 即此口径）。 */
  screenRay3(nx, ny){
    const cw = this.canvas.width, ch = this.canvas.height;
    const ct = Math.cos(this.cam.theta), st = Math.sin(this.cam.theta);
    const cp = Math.cos(this.cam.phi), sp = Math.sin(this.cam.phi);
    const ro = [this.cam.dist*cp*ct, this.cam.dist*sp, this.cam.dist*cp*st];
    const rl = Math.hypot(ro[0], ro[1], ro[2]);
    const fwd = [-ro[0]/rl, -ro[1]/rl, -ro[2]/rl];
    /* right = normalize(cross(fwd, (0,1,0))) = normalize((−fwd.z, 0, fwd.x)) */
    let rx = -fwd[2], ry = 0, rz = fwd[0];
    const rn = Math.hypot(rx, ry, rz);
    rx /= rn; ry /= rn; rz /= rn;
    /* up = cross(right, fwd) */
    const ux = ry*fwd[2] - rz*fwd[1], uy = rz*fwd[0] - rx*fwd[2], uz = rx*fwd[1] - ry*fwd[0];
    const ndcx = (nx - 0.5)*2, ndcy = (ny - 0.5)*2, aspect = cw/ch;
    let dx = fwd[0]*1.6 + rx*ndcx*aspect*0.5 + ux*ndcy*0.5;
    let dy = fwd[1]*1.6 + ry*ndcx*aspect*0.5 + uy*ndcy*0.5;
    let dz = fwd[2]*1.6 + rz*ndcx*aspect*0.5 + uz*ndcy*0.5;
    const dl = Math.hypot(dx, dy, dz);
    dx /= dl; dy /= dl; dz /= dl;
    return { ro, rd: [dx, dy, dz] };
  }

  /* 射线与单位立方体 [−0.5,0.5]³ slab 求交（TPL_DISPLAY3D 同口径），
     返回穿透段 { tEnter, tExit }；未命中（视线离开体积）返回 null。
     放置深度取段中点——确定、可复现（测试可断言），用户用拖拽微调位置。 */
  pickBlob3(nx, ny){
    const { ro, rd } = this.screenRay3(nx, ny);
    let tEnter = -Infinity, tExit = Infinity;
    for (let a = 0; a < 3; a++){
      const o = ro[a], d = rd[a];
      /* d=0 时 ±Infinity（GLSL 同行为）；|ro|≥dist≥1.1>0.5 ⟹ 不会 0/0 */
      const t0 = (-0.5 - o)/d, t1 = (0.5 - o)/d;
      tEnter = Math.max(tEnter, Math.min(t0, t1));
      tExit = Math.min(tExit, Math.max(t0, t1));
    }
    if (!(tEnter < tExit)) return null;
    const t = Math.max(0, tEnter) + 0.5*(tExit - Math.max(0, tEnter));
    const n = this.state.grid;
    return { x: (ro[0] + rd[0]*t)*n, y: (ro[1] + rd[1]*t)*n, z: (ro[2] + rd[2]*t)*n };
  }

  /* 势刷 stamp（R49 连续涂抹 ⟹ R60 椭球+软化，由 R44 placeBlob3 单丘
     升级）：在画布客户坐标处沿视线 slab 中点落一个势丘（规格 = 当前滑块
     potBlobR/potBlobV0/potBlobRX/RY/RZ/potBlobSoft，stamp 时快照；三轴
     半轴 = R·轴比，soft=0 = 硬边、>0 = 高斯软化边）。force=true
     （pointerdown）无视距离阈值必落；force=false（pointermove 拖拽涂抹）
     仅在与最后一个丘中心距 ≥0.6·min(rx,ry,rz) 时落新丘——按最短轴取阈值
     ⟹ 任意轴比下丘链均重叠连续（球时 min=R ⟹ 与 R49 的 0.6R 一致），
     同时天然节流（慢拖不密、快拖不断）。丘数上限 MAX_BLOBS=16，超出
     FIFO 淘汰最旧（announce 时 toast 明示）。 */
  stampBlob3(cx, cy, force, announce){
    const r = this.canvas.getBoundingClientRect();
    const nx = (cx - r.left)/r.width, ny = 1 - (cy - r.top)/r.height;
    const p = this.pickBlob3(nx, ny);
    if (!p) return false;
    const spec = {
      r: this.state.potBlobR, v0: this.state.potBlobV0,
      rx: this.state.potBlobR*this.state.potBlobRX,
      ry: this.state.potBlobR*this.state.potBlobRY,
      rz: this.state.potBlobR*this.state.potBlobRZ,
      soft: this.state.potBlobSoft,
    };
    /* 世界 texel ∈ [−n/2, n/2]（slab 中点天然在域内）；留 2 texel 边缘余量 */
    const lim = this.state.grid/2 - 2;
    const b = {
      x: Math.max(-lim, Math.min(lim, p.x)),
      y: Math.max(-lim, Math.min(lim, p.y)),
      z: Math.max(-lim, Math.min(lim, p.z)),
      r: spec.r, v0: spec.v0,
      rx: spec.rx, ry: spec.ry, rz: spec.rz, soft: spec.soft,
    };
    const list = this.state.potBlobs || (this.state.potBlobs = []);
    if (!force && list.length){
      const last = list[list.length - 1];
      const dx = b.x - last.x, dy = b.y - last.y, dz = b.z - last.z;
      /* 最短轴口径（R60）：任意轴比下链连续；球 ⟹ 0.6R（R49 同值） */
      const thr = 0.6*Math.min(spec.rx, spec.ry, spec.rz);
      if (Math.sqrt(dx*dx + dy*dy + dz*dz) < thr) return false;   /* 距离阈值：过密不落 */
    }
    let evicted = false;
    if (list.length >= MAX_BLOBS){ list.shift(); evicted = true; }
    list.push(b);
    this.updateBlobReadout();
    if (announce){
      this.toast(evicted
        ? '势丘 ×' + list.length + '（最旧丘已淘汰，上限 ' + MAX_BLOBS + '）'
        : '势丘 → (' + b.x.toFixed(1) + ', ' + b.y.toFixed(1) + ', ' + b.z.toFixed(1) + ') texel');
    }
    return true;
  }

  /* 势丘列表读数（面板「势丘」行）：丘数 · 最后丘位置 · 最后丘实际形状
     （R60：轴比按最后丘快照显示——改滑块只影响后续丘，与 stamp 快照语义一致；
     三轴相等显「球」，否则显 X/Y/Z 轴比） */
  updateBlobReadout(){
    const el = this.q('#oBlobPos'); if (!el) return;
    const list = this.state.potBlobs || [];
    if (!list.length){
      el.textContent = '无';
      return;
    }
    const b = list[list.length - 1];
    const ax = (b.rx === b.r && b.ry === b.r && b.rz === b.r) ? '球'
      : (b.rx/b.r).toFixed(1) + '/' + (b.ry/b.r).toFixed(1) + '/' + (b.rz/b.r).toFixed(1);
    el.textContent = '×' + list.length + ' · (' + b.x.toFixed(1) + ', ' + b.y.toFixed(1)
      + ', ' + b.z.toFixed(1) + ') · R=' + b.r.toFixed(0) + ' 轴' + ax
      + ' · 软化' + b.soft.toFixed(1) + ' · V₀=' + b.v0.toFixed(2);
  }

  /* 势丘规格滑块行同步（DOM ← state；导入存档后调用）。滑块语义是「新丘
     规格」（R49 ⟹ R60）：改滑块只影响后续 stamp，不追溯已落丘（丘各自快照）。 */
  syncBlobRows(){
    const rs = [['#rBlobR','#oBlobR','potBlobR', v => String(v|0)],
                ['#rBlobV0','#oBlobV0','potBlobV0', v => v.toFixed(2)],
                ['#rBlobRX','#oBlobRX','potBlobRX', v => v.toFixed(2)],
                ['#rBlobRY','#oBlobRY','potBlobRY', v => v.toFixed(2)],
                ['#rBlobRZ','#oBlobRZ','potBlobRZ', v => v.toFixed(2)],
                ['#rBlobSoft','#oBlobSoft','potBlobSoft', v => v.toFixed(1)]];
    for (const [id, out, key, fmt] of rs){
      const el = this.q(id); if (!el) continue;
      el.value = this.state[key];
      this.q(out).textContent = fmt(this.state[key]);
    }
    this.updateBlobReadout();
  }

  /* 3D 工具模式切换（R44 ⟹ R57 加 'flux'）：'cam' 视角旋转 | 'pot' 势刷放置
     | 'flux' AB 磁通管放置（R57）。面板按钮 / P 键 / 自动化测试共用同一入口
     （按钮态与光标在此集中同步）。P 键仍在 cam↔pot 间切换（R44 契约不变，
     flux 只能经面板按钮进入，避免打乱既有快捷键语义）。 */
  setTool3(mode){
    this.state.tool3 = (mode === 'pot' || mode === 'flux') ? mode : 'cam';
    const canvas = this.q('#gl');
    if (canvas) canvas.style.cursor = this.state.tool3 === 'cam' ? '' : 'crosshair';
    this.container.querySelectorAll('[data-tool3]').forEach(x =>
      x.classList.toggle('on', x.dataset.tool3 === this.state.tool3));
    this.toast(this.state.tool3 === 'pot'
      ? '势刷：拖拽放置球形势丘（负 V₀ = 势阱，P 键切回视角）'
      : this.state.tool3 === 'flux'
        ? '磁通(AB)：点击体积放置沿 z 轴贯穿的磁通管（管轴取视线的 xy 投影，取当前 Φ）'
        : '视角旋转（P 键切到势刷）');
  }

  /* R57：3D AB 磁通管放置/选中。磁通管沿 z 轴贯穿整个体积 ⟹ 管轴由 xy 两个
     自由度确定（uABPos 存 uv 空间 [0,1]²）。点击位置取 R44 同口径的「视线
     slab 穿透段中点」（pickBlob3，世界 texel）⟹ 转 uv（w/n + 0.5）；未命中
     体积（视线离开 box）返回 false 并由调用方 toast。命中已有管（xy 距离
     < 0.05，与 2D pickSolenoid 同阈值）则切换选中，否则以草稿 Φ 放新管。
     因管沿 z 贯穿，z 不参与命中判据——任何视角下的点击只看 xy 投影。 */
  pickFlux3(clientX, clientY){
    const r = this.canvas.getBoundingClientRect();
    const nx = (clientX - r.left)/r.width, ny = (clientY - r.top)/r.height;
    const hit = this.pickBlob3(nx, ny);
    if (!hit) { this.toast('视线未命中体积（磁通管需放在体积内）'); return false; }
    const n = this.state.grid;
    const ux = hit.x/n + 0.5, uy = hit.y/n + 0.5;
    const found = this.pickSolenoid(ux, uy);
    if (found >= 0) this.selectSolenoid(found);
    else this.placeSolenoid(ux, uy, this.state.abPhi);
    return true;
  }

  /* ---------- hint 可折叠（R45，用户选定方案 a）----------
     面板各区的 .hint 长文本是内容溢出的元凶（R43 客观实测：
     2D 697px / 3D 1673px / GP 980px）。运行时升级：hint 文本搬进
     .hintBody、前置 .hintToggle 按钮，**默认折叠**；展开态经
     localStorage 持久化（key = 文本摘要，跨内核/面板显隐稳定）。
     HTML 模板零改动——未来新增 .hint 自动获得折叠能力。
     行内 hint（.row 内的 span.hint，如 AB「放置方式」）不升级：
     它本就短且参与 flex 行布局，套按钮结构会破坏行几何。 */
  upgradeHints(){
    let open = null;
    try { open = JSON.parse(localStorage.getItem('qf.hints.open') || 'null'); } catch(_){ /* 隐私模式/坏 JSON ⟹ 默认全折叠 */ }
    const openSet = new Set(Array.isArray(open) ? open : []);
    this.container.querySelectorAll('.hint').forEach(h => {
      if (h.dataset.hintUpgraded) return;
      if (h.closest('.row')) return;            /* 行内短提示不折叠 */
      h.dataset.hintUpgraded = '1';
      /* key 必须在搬家前取（h.textContent 只算当前子节点；body 未挂回时
         取到的是空串 ⟹ 所有 hint 共享同一 key、持久化串味——cdp45 抓出） */
      const key = (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const body = document.createElement('div');
      body.className = 'hintBody';
      while (h.firstChild) body.appendChild(h.firstChild);   /* 节点搬家（保留 <b> 等内联标签） */
      const isOpen = openSet.has(key);
      h.classList.toggle('open', isOpen);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hintToggle';
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      const sync = () => { btn.textContent = (h.classList.contains('open') ? '▾ ' : '▸ ') + '使用说明'; };
      sync();
      this.on(btn, 'click', () => {
        const nowOpen = !h.classList.contains('open');
        h.classList.toggle('open', nowOpen);
        btn.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
        sync();
        /* 持久化：读-改-写（同面板多个 hint 独立记忆） */
        let cur = null;
        try { cur = JSON.parse(localStorage.getItem('qf.hints.open') || 'null'); } catch(_){}
        const set = new Set(Array.isArray(cur) ? cur : []);
        if (nowOpen) set.add(key); else set.delete(key);
        try { localStorage.setItem('qf.hints.open', JSON.stringify([...set])); } catch(_){}
      });
      h.appendChild(btn); h.appendChild(body);
    });
  }

  /* ---------- sec 级分区折叠（R48，README「后续方向」a2）----------
     hint 折叠（R45）之后仍超视口的大头是**区块结构**（R45 归因修正：
     3D 扫描三块 1241px / GP paramScanSec 488px，canvas 硬高占 820px）。
     本升级把每个 .sec 的 h3 变切换头：class collapsed 驱动子元素显隐
     （CSS `.sec.collapsed > *:not(h3){display:none}`），展开态经
     localStorage `qf.secs.state`（{key: open} 对象）持久化。
     与门控正交：syncControls 按内核切 sec 的 style.display（整区显隐），
     本折叠切 sec 内部子元素——两者不竞争（display:none 的 sec 其折叠
     态无视觉意义，切换内核后按持久化恢复）。
     默认折叠：四个扫描面板 sec（id 白名单）——仅在使用扫描工具时需要，
     且扫描开始会自动展开（expandSecFor）；无 id sec 默认展开。
     键盘可达：h3 tabindex=0 + Enter/Space（与 hintToggle 一致）。 */
  upgradeSecs(){
    let st = null;
    try { st = JSON.parse(localStorage.getItem('qf.secs.state') || 'null'); } catch(_){}
    if (!st || typeof st !== 'object') st = {};
    const DEFAULT_COLLAPSED = ['scanSec','scan3Sec','slitScanSec','paramScanSec'];
    this.container.querySelectorAll('.sec').forEach(sec => {
      if (sec.dataset.secUpgraded) return;
      const h3 = sec.querySelector('h3'); if (!h3) return;
      sec.dataset.secUpgraded = '1';
      /* key 优先 sec id（门控切换/内核切换稳定）；无 id 用 h3 摘要 */
      const key = sec.id || (h3.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      let isOpen = (typeof st[key] === 'boolean') ? st[key] : !DEFAULT_COLLAPSED.includes(sec.id);
      const sync = () => {
        sec.classList.toggle('collapsed', !isOpen);
        h3.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      };
      h3.setAttribute('tabindex', '0');
      h3.setAttribute('role', 'button');
      sync();
      const toggle = () => {
        isOpen = !isOpen; sync();
        st[key] = isOpen;
        try { localStorage.setItem('qf.secs.state', JSON.stringify(st)); } catch(_){}
      };
      this.on(h3, 'click', toggle);
      this.on(h3, 'keydown', e => {
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(); }
      });
    });
  }

  /* 元素所在 sec 若折叠则展开（GenericScanner.start 调用：用户点了「开始
     扫描」就应看到 canvas 与状态行——R48 UX 补丁；CDP 测试经 start()
     入口操作可见元素，避免 display:none 下的点击失败）。返回是否发生展开。 */
  expandSecFor(el){
    const sec = el && el.closest ? el.closest('.sec') : null;
    if (!sec || !sec.classList.contains('collapsed')) return false;
    const h3 = sec.querySelector('h3');
    if (h3) h3.click();        /* 复用 toggle 路径（持久化/aria 一致） */
    return true;
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
    /* AB 磁通（R54 多管）：0 根 = 关；否则「N 管」+ 选中管 Φ（弧度 + 2π 份额），
       无选中管时仅报管数（选中是 UI 态，HUD 不引申）。 */
    const sols = this.state.abSols || [];
    if (sols.length === 0){
      this.q('#hAB').textContent = '关';
    } else {
      const i = this.state.abSel;
      const tail = (i >= 0 && i < sols.length)
        ? ' · Φ=' + sols[i][2].toFixed(2) + ' (' + (sols[i][2]/6.2831853).toFixed(2) + '×2π)'
        : ' · 无选中';
      this.q('#hAB').textContent = sols.length + ' 管' + tail;
    }
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
    /* R63 Landau 回旋预测读数（schrodinger.js landauModel 单源模型；暂停时拖
       B 滑块也即时刷新）。B≠0 时同时给出：
       · ω_c=B/m 与连续统周期 T₀=2πm/B（小振幅谐振极限）；
       · T_晶格——紧束缚带非抛物的半经典修正（闭式椭圆积分型求积，大振幅
         类单摆拉长；与 CPU/ODE 实测 1e-5 对账，见 worklog R63）；
       · 轨道振幅 θ₀=k_x+B·y_c 与 y 向包络（贴墙时预警——半经典轨道出界后
         Ehrenfest 对应失效，实测周期不再遵循任何一条曲线）。
       URL 层拒绝 ?bOrb= 时展示原因（拖滑块即清除）。 */
    const landauStat = this.q('#landauStat');
    if (landauStat){
      const B = this.state.bOrb || 0;
      if (B === 0){
        landauStat.textContent = this._urlBOrbNote
          ? 'B=0 · ' + this._urlBOrbNote
          : 'B=0 · 无轨道耦合（走原 KDK 路径，逐位等价）';
      } else {
        const lm = this.kernel.landauModel ? this.kernel.landauModel(this.state) : null;
        if (lm){
          const wall = Math.min(lm.yLo, this.state.grid - lm.yHi);
          /* θ₀ ≥ π（轨道跨布里渊边界）时闭式失效 ⟹ 只报 T₀ 与几何量，
             T_晶格 明确标注「近似失效」而不是给 NaN/假值。 */
          const tl = lm.valid
            ? ' · T_晶格≈' + lm.T.toFixed(0) + '（×' + lm.ratio.toFixed(2) + '）'
            : ' · T_晶格：θ₀>π 半经典近似失效';
          landauStat.textContent = 'ω_c=' + lm.wc.toFixed(4) +
            ' · T₀=2πm/B=' + lm.T0.toFixed(0) + '（≈' + Math.round(lm.T0/1.2) + ' 帧）' +
            tl + ' · θ₀=' + lm.th0.toFixed(2) + 'rad' +
            (wall < 0 ? ' · ⚠轨道已出界（越 ' + (-wall).toFixed(0) + ' texel）'
              : wall < 4 ? ' · ⚠轨道将撞壁（余 ' + wall.toFixed(0) + ' texel）' : '');
        } else {
          landauStat.textContent = 'ω_c=' + (Math.abs(B)/this.state.m).toFixed(4) + ' · 当前内核无 Landau 模型';
        }
      }
    }
    /* R62 Bloch 能带扫描面板门控：仅薛定谔内核 + lattice 预设可用（扫描 gate
       内亦有同款检查兜底——面板先行隐藏，避免用户点到一个必然失败的按钮）。
       与 scanSec 同一动态门控模式（仅在实际变化时写 style）。 */
    const blochScanSec = this.q('#blochScanSec');
    if (blochScanSec){
      const wantBloch = (this.kernelId === 'schrodinger' && this.state.preset === 'lattice') ? '' : 'none';
      if (blochScanSec.style.display !== wantBloch) blochScanSec.style.display = wantBloch;
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

  /* ---------- AB 多螺线管（R54）：放置 / 选中 / 删除 / 调参 ----------
     数据模型 state.abSols = [[x,y,φ],...]（世界坐标，≤AB_MAX）。「分别调参」
     的交互模型：放置即选中 → Φ 滑块编辑选中管；点已有环切换选中；删除/清空
     按选中操作。所有变更统一走 refreshABReadout + syncABPhiSlider + HUD 刷新，
     pointer 事件与 debugHandle（CDP）共用同一方法入口（不合成鼠标事件）。 */
  placeSolenoid(wx, wy, phi){
    /* R63 互斥守卫：均匀 B 模式（evolveKDK_B 强制 uABOn=0）下放置 AB 会静默
       失效 ⟹ 直接拒绝并提示（与 rBOrb 滑块守卫对称：B≠0 时清空 AB 才能开 B，
       开 B 后不放 AB）。twistX 同理由 applyLatticeParams/URL 层天然错开。 */
    if (this.state.bOrb !== 0 && this.kernelId === 'schrodinger'){
      this.toast('均匀磁场模式下 AB 磁通被禁用（互斥）——请先把 B_z 拖回 0');
      return -1;
    }
    const list = this.state.abSols || (this.state.abSols = []);
    let evicted = false;
    if (list.length >= AB_MAX){ list.shift(); evicted = true; }   /* FIFO 淘汰最旧（R49 potBlobs 同策） */
    list.push([wx, wy, phi]);
    this.state.abSel = list.length - 1;                           /* 放置即选中（滑块随之对齐） */
    this.syncABPhiSlider();
    this.refreshABReadout();
    this.refreshParamHud();
    this.toast('AB 螺线管 ×' + list.length + (evicted ? '（最旧已淘汰，上限 ' + AB_MAX + '）' : '')
      + ' → (' + wx.toFixed(2) + ', ' + wy.toFixed(2) + ') Φ=' + phi.toFixed(2));
    return this.state.abSel;
  }
  selectSolenoid(i){
    const n = (this.state.abSols || []).length;
    this.state.abSel = (i >= 0 && i < n) ? i : -1;
    this.syncABPhiSlider();
    this.refreshABReadout();
    this.refreshParamHud();
    return this.state.abSel;
  }
  deleteSolenoid(){
    const list = this.state.abSols || [];
    const i = this.state.abSel;
    if (i < 0 || i >= list.length){ this.toast('无选中的螺线管'); return -1; }
    list.splice(i, 1);
    this.state.abSel = list.length ? Math.min(i, list.length - 1) : -1;   /* 删后顺移选中，保持可继续调参 */
    this.syncABPhiSlider();
    this.refreshABReadout();
    this.refreshParamHud();
    this.toast('已删除螺线管（剩 ' + list.length + ' 根）');
    return this.state.abSel;
  }
  clearSolenoids(){
    const n = (this.state.abSols || []).length;
    this.state.abSols = [];
    this.state.abSel = -1;
    this.syncABPhiSlider();
    this.refreshABReadout();
    this.refreshParamHud();
    this.toast(n ? '螺线管已清空（' + n + ' 根）' : '螺线管列表已为空');
  }
  /* 命中测试：点击落点与各管中心的距离 < 0.05 世界单位（显示环半径 0.035，
     容忍 ~40% 余量；toWorld 输出即 shader 的 Aspect 修正坐标，同空间直接比）。
     后放置者优先（重叠时最后落的管在上层被选中）。 */
  pickSolenoid(wx, wy){
    const list = this.state.abSols || [];
    for (let i = list.length - 1; i >= 0; i--){
      if (Math.hypot(wx - list[i][0], wy - list[i][1]) < 0.05) return i;
    }
    return -1;
  }
  /* Φ 滑块当前应对齐的值：选中管 Φ，或无选中时的草稿 abPhi */
  abSelPhi(){
    const i = this.state.abSel;
    if (i >= 0 && this.state.abSols && this.state.abSols[i]) return this.state.abSols[i][2];
    return this.state.abPhi;
  }
  syncABPhiSlider(){
    const el = this.q('#rABPhi'), o = this.q('#oABPhi');
    if (!el || !o) return;
    const v = this.abSelPhi();
    el.value = v;
    o.textContent = v.toFixed(2);
  }
  /* AB 面板读数：选中行「#k/N · Φ=x.xx @ (x, y)」或「无 · 放置即新建」
     （位置并入选中行，省一行面板空间——R48/R53 溢出控制口径）。 */
  refreshABReadout(){
    const list = this.state.abSols || [];
    const n = list.length;
    const sel = (this.state.abSel >= 0 && this.state.abSel < n) ? this.state.abSel : -1;
    const oSel = this.q('#oABSel');
    if (oSel) oSel.textContent = sel >= 0
      ? '#' + (sel + 1) + '/' + n + ' · Φ=' + list[sel][2].toFixed(2)
        + ' @ (' + list[sel][0].toFixed(2) + ', ' + list[sel][1].toFixed(2) + ')'
      : '无 · 放置即新建';
  }
  /* AB 磁通滑块（R54 多管）：写入目标随选中态切换——有选中管时编辑该管 Φ，
     无选中时编辑草稿 abPhi（放置新管时取用）。不用 bindRange（其 key 固定），
     滑块同步由 syncABPhiSlider 单独负责（syncControls 调用）。 */
  bindABPhi(){
    const el = this.q('#rABPhi'), o = this.q('#oABPhi');
    if (!el || !o) return;
    const self = this;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      const i = self.state.abSel;
      if (i >= 0 && self.state.abSols[i]) self.state.abSols[i][2] = v;
      else self.state.abPhi = v;
      o.textContent = v.toFixed(2);
      self.refreshABReadout();
      self.refreshParamHud();
    });
    this.syncABPhiSlider();
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
    const SKIP = new Set(['grid','paused','simTime','preset','lastWave','waveCount','drag','tool','abSel']);
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
      /* AB 螺线管列表（R54，数组非数字 ⟹ 白名单循环不收，须显式存档）：
         顶层 abSols 段 [[x,y,φ],...]（与 state.abSols 同构）。abSel 是 UI
         选中态（运行时概念，入 SKIP 不存档）；旧存档无 abSols 段——导入时
         按 abX/abY/abPhi 标量段迁移为单管列表（见 importPotentialData）。 */
      abSols: (this.state.abSols || []).map(s => [s[0], s[1], s[2]]),
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
    /* 参数恢复：仅白名单标量键（须已存在于 state）；运行时态/结构键不碰。
       注：旧存档的 abX/abY 标量键已不在 state（R54 起为 abSols 列表）⟹
       `k in this.state` 守卫天然跳过；abPhi 仍是草稿键，照常恢复。 */
    const SKIP = new Set(['grid','paused','simTime','preset','lastWave','waveCount','drag','tool','abSel']);
    let n = 0;
    for (const k of Object.keys(obj.state || {})){
      if (SKIP.has(k)) continue;
      const v = obj.state[k];
      if (typeof v === 'number' && isFinite(v) && k in this.state){ this.state[k] = v; n++; }
    }
    /* AB 螺线管列表恢复（R54）：新存档取 abSols 段（≤AB_MAX 个 [x,y,φ] 全有限
       元组）；旧存档无该段 ⟹ 若 abPhi≠0（单管曾启用过）由 abX/abY/abPhi 迁为
       单管列表并选中，abPhi=0/缺失 ⟹ 空列表（与旧版关闭态一致）。 */
    const fin = v => (typeof v === 'number' && isFinite(v)) ? v : null;
    if (obj.abSols !== undefined){
      if (!Array.isArray(obj.abSols) || obj.abSols.length > AB_MAX)
        throw new Error('存档 AB 螺线管段无效（须数组且 ≤' + AB_MAX + ' 项）');
      for (let i = 0; i < obj.abSols.length; i++){
        const s = obj.abSols[i];
        if (!Array.isArray(s) || s.length !== 3 || !s.every(v => typeof v === 'number' && isFinite(v)))
          throw new Error('存档 AB 螺线管 #' + i + ' 无效（须 [x,y,φ] 全有限）');
      }
      this.state.abSols = obj.abSols.map(s => [s[0], s[1], s[2]]);
      this.state.abSel = this.state.abSols.length ? 0 : -1;
    } else {
      const st0 = obj.state || {};
      const ax0 = fin(st0.abX), ay0 = fin(st0.abY), ap0 = fin(st0.abPhi);
      this.state.abSols = (ap0 !== null && ap0 !== 0)
        ? [[ax0 === null ? 0.5 : ax0, ay0 === null ? 0.5 : ay0, ap0]]
        : [];
      this.state.abSel = this.state.abSols.length ? 0 : -1;
    }
    this.syncControls();
    /* R61：导入即换场——Bohm 粒子与残影对旧场无意义，重置（开关本身保留：
       用户可在新场上重新撒点/放点）。 */
    if (this.posA) this.bohmReset();
    this.toast('势场已导入（恢复 ' + n + ' 项参数'
      + (this.state.abSols.length ? ' + AB 螺线管 ' + this.state.abSols.length + ' 根' : '') + '）');
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
      /* 势刷丘列表（R49 数组 ⟹ R60 椭球+软化，数组非数字 ⟹ 白名单循环不收，
         须显式存档）：顶层 blobs 段 [[x,y,z,r,v0,rx,ry,rz,soft],...]（与
         state.potBlobs 同构）。R49 旧存档为 5 元组 [x,y,z,r,v0]——导入时
         迁为球+硬边（rx=ry=rz=r, soft=0）；R44 旧存档无此段——导入时按
         potBV0≠0 从 state 单丘五字段迁移。 */
      blobs: (this.state.potBlobs || []).map(b => [b.x, b.y, b.z, b.r, b.v0, b.rx, b.ry, b.rz, b.soft]),
      /* AB 磁通管列表（R57，数组非数字 ⟹ 白名单循环不收，须显式存档）：
         顶层 abSols 段 [[x,y,φ],...]（3D 磁通管沿 z 轴，x/y 为管轴在 xy
         平面的 uv 投影；与 state.abSols 同构、与 2D 势场存档同段名）。
         abSel 为 UI 选中态（运行时概念，不存档）；R57 前旧存档无此段——
         导入时按「无 abSols 段 ⟹ 空列表」迁移（与旧版无 AB 语义一致）。 */
      abSols: (this.state.abSols || []).map(s => [s[0], s[1], s[2]]),
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
    /* 势刷丘列表（R49 5 元组 ⟹ R60 9 元组）：blobs 段每项须为 5 元组
       [x,y,z,r,v0]（R49 旧档 ⟹ 迁为球+硬边）或 9 元组
       [x,y,z,r,v0,rx,ry,rz,soft]（R60；三轴须 >0、软化须 ≥0）且全有限。
       R44 旧存档无 blobs 段——合法（迁移路径见阶段 2）。 */
    let blobList = null;
    if (obj.blobs !== undefined){
      if (!Array.isArray(obj.blobs) || obj.blobs.length > MAX_BLOBS)
        throw new Error('存档势丘段无效（须数组且 ≤' + MAX_BLOBS + ' 项）');
      for (let i = 0; i < obj.blobs.length; i++){
        const b = obj.blobs[i];
        if (!Array.isArray(b) || (b.length !== 5 && b.length !== 9)
            || !b.every(v => typeof v === 'number' && isFinite(v)))
          throw new Error('存档势丘 #' + i + ' 无效（须 [x,y,z,r,v0] 或 [x,y,z,r,v0,rx,ry,rz,soft] 全有限）');
        if (b.length === 9 && (b[5] <= 0 || b[6] <= 0 || b[7] <= 0 || b[8] < 0))
          throw new Error('存档势丘 #' + i + ' 形状无效（三轴半轴须 >0、软化宽度须 ≥0）');
      }
      blobList = obj.blobs.map(b => b.length === 9
        ? { x: b[0], y: b[1], z: b[2], r: b[3], v0: b[4], rx: b[5], ry: b[6], rz: b[7], soft: b[8] }
        : normBlob({ x: b[0], y: b[1], z: b[2], r: b[3], v0: b[4] }));
    }
    /* 阶段 2：写现场 */
    const SKIP = new Set(['grid','paused','simTime','preset','lastWave','waveCount','drag','tool']);
    let n = 0;
    for (const k of Object.keys(obj.state || {})){
      if (SKIP.has(k)) continue;
      const v = obj.state[k];
      if (typeof v === 'number' && isFinite(v) && k in this.state){ this.state[k] = v; n++; }
    }
    /* 势刷丘列表恢复（R49 5 元组 ⟹ R60 9 元组）：新存档取 blobs 段（5 元组
       旧档在此已归一为球+硬边）；R44 旧存档无该段 ⟹ 若 potBV0 为有限数且
       ≠0（单丘曾放置过）迁为列表首项（经 normBlob 补球+硬边默认），滑块
       规格 potBR→potBlobR 一并迁移；无段且 potBV0=0/缺失 ⟹ 空列表（与
       R44 关闭态一致）。 */
    if (blobList){
      this.state.potBlobs = blobList;
    } else {
      const st = obj.state || {};
      const bv0 = st.potBV0;
      this.state.potBlobs = (typeof bv0 === 'number' && isFinite(bv0) && bv0 !== 0)
        ? [normBlob({ x: st.potBX || 0, y: st.potBY || 0, z: st.potBZ || 0,
             r: st.potBR || 8, v0: bv0 })]
        : [];
      if (typeof st.potBR === 'number' && isFinite(st.potBR)) this.state.potBlobR = st.potBR;
    }
    if (obj.integrator3) this.state.integrator3 = obj.integrator3;
    if (obj.camera) { this.cam.theta = obj.camera.theta; this.cam.phi = obj.camera.phi; this.cam.dist = obj.camera.dist; }
    /* AB 磁通管列表恢复（R57）：新存档取 abSols 段（≤AB_MAX 个 [x,y,φ] 全有限
       元组，x/y 为管轴 xy 的 uv 投影）；R57 前旧存档无该段 ⟹ 空列表（与旧版
       3D 无 AB 语义一致，无迁移必要——3D 此前根本不显示/不支持 AB）。 */
    if (obj.abSols !== undefined){
      if (!Array.isArray(obj.abSols) || obj.abSols.length > AB_MAX)
        throw new Error('非法 abSols 段（须为 ≤' + AB_MAX + ' 个元组的数组）');
      for (let i = 0; i < obj.abSols.length; i++){
        const s = obj.abSols[i];
        if (!Array.isArray(s) || s.length !== 3 || !s.every(v => typeof v === 'number' && isFinite(v)))
          throw new Error('非法 abSols[' + i + ']（须为 [x,y,φ] 全有限三元组）');
      }
      this.state.abSols = obj.abSols.map(s => [s[0], s[1], s[2]]);
      this.state.abSel = this.state.abSols.length ? 0 : -1;
    }
    const blobMsg = this.state.potBlobs.length ? ' + 势丘 ' + this.state.potBlobs.length + ' 个' : '';
    const abMsg = this.state.abSols.length ? ' + AB 磁通管 ' + this.state.abSols.length + ' 根' : '';
    if (waveF32){
      this.uploadWave3(waveF32);
      this._baseCaptured = false;          /* P 守恒基准按导入场重捕（HUD err% 口径） */
      this.toast('3D 现场已导入（恢复 ' + n + ' 项参数' + blobMsg + abMsg + ' + 场数据 ' + (this.state.grid**3) + ' 体素）');
    } else {
      this.reinitWave();
      this._baseCaptured = false;
      this.toast('3D 存档无场数据：已恢复 ' + n + ' 项参数' + blobMsg + abMsg + ' 并按预设重发初态');
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
    this.refreshPotRows();                    /* R53：主势槽 8 行按 potKind 显隐（预设注入类型） */
    /* R49：3D 工具按钮态 + 势丘规格滑块与读数（预设切换 / 导入存档后同步；
       滑块同步覆盖 R44 旧存档迁移（potBR→potBlobR）的面板更新；
       2D 内核下 querySelectorAll 为空、#oBlobPos 不存在 ⟹ 同步调用天然无害） */
    this.container.querySelectorAll('[data-tool3]').forEach(x =>
      x.classList.toggle('on', x.dataset.tool3 === (this.state.tool3 || 'cam')));
    this.syncBlobRows();
    /* R62：晶格目标带下拉 + 两个晶格面板的显隐（仅薛定谔内核有 lattice 场景；
       扫描面板还需 preset==='lattice'，由 refreshParamHud 动态门控） */
    const lb = this.q('#selLatBand');
    if (lb) lb.value = String(this.state.latBand === 2 ? 2 : 1);
    const latSec = this.q('#latticeSec');
    if (latSec){
      const want = (this.kernelId === 'schrodinger') ? '' : 'none';
      if (latSec.style.display !== want) latSec.style.display = want;
    }
    /* R63 Landau 面板门控：仅薛定谔内核（schrodinger 永非 dim3——3D 是独立
       内核 schrodinger3d）。规范帧 ADI 定制分支为标量路径：NLS/GP 非线性项
       进双扫描会双重计数、Dirac/Pauli 走 CN、3D 无 B 分支。滑块/URL 层
       亦有同款兜底（见 bindRange('#rBOrb') 与 applyUrlParams）。 */
    const landauSec = this.q('#landauSec');
    if (landauSec){
      const wantL = (this.kernelId === 'schrodinger') ? '' : 'none';
      if (landauSec.style.display !== wantL) landauSec.style.display = wantL;
    }
    /* R64 量子弹球面板：仅薛定谔内核 + 两个弹球预设（腔体几何是预设内绘制
       的势场，别的预设下没有硬壁可解谱）。形状下拉同步 state.billKind。 */
    const billSec = this.q('#billiardSec');
    if (billSec){
      const wantB = (this.kernelId === 'schrodinger' &&
        (this.state.preset === 'billiard' || this.state.preset === 'billiardC')) ? '' : 'none';
      if (billSec.style.display !== wantB) billSec.style.display = wantB;
    }
    const sbk = this.q('#selBillKind');
    if (sbk) sbk.value = this.state.billKind === 'circle' ? 'circle' : 'stadium';
    /* 预设切换 = 腔体变了 ⟹ 旧谱作废（避免读数与画面不一致） */
    if (this._billPresetKey !== this.state.preset){
      this._billPresetKey = this.state.preset;
      if (this._billSpec){ this._billSpec = null; this._refreshBillStat(); }
    }
    /* R54：AB 多螺线管面板同步（预设 params/URL/导入存档可注入 abSols/abSel；
       滑块对齐选中管 Φ，选中行/位置读数随列表刷新） */
    this.syncABPhiSlider();
    this.refreshABReadout();
    /* R61：概率流/Bohm 开关按钮态 + HUD 节可见性（预设/导入不改变开关，
       但 URL ?showJ/?bohm 与 debugHandle 可能已置位——此处对齐 UI） */
    const bj = this.q('#btnShowJ'); if (bj) bj.classList.toggle('on', !!this.state.showJ);
    const bj3 = this.q('#btnShowJ3'); if (bj3) bj3.classList.toggle('on', !!this.state.showJ);
    const bb = this.q('#btnBohm'); if (bb) bb.classList.toggle('on', !!this.state.bohmOn);
    const bt = this.container.querySelector('[data-tool="bohm"]');
    if (bt) bt.classList.toggle('on', this.state.tool === 'bohm');
    this._jSecVis();
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

  /* 主势槽参数行的动态显隐（R53 面板精简）：主势无面板下拉（类型由预设 params 注入，
     URL/导入存档可改），8 个参数行历来全显示——FREE 预设下 6~8 行纯占位，是 3D
     面板单块 652px / 溢出 505px 的最大结构性来源。按 potKind 显隐（与 refreshPot2Rows
     同一模式，层 1）：球势垒 V₀/R、谐振子 ω、库仑 Z、双缝 V₀/墙心/墙厚/缝宽/缝距。
     调用点：syncControls（预设切换/导入存档/URL 参数后统一同步）。 */
  refreshPotRows(){
    const k = this.state.potKind | 0;
    const show = {
      rowPotV0: k === 1 || k === 4,
      rowPotR: k === 1,
      rowPotW: k === 2,
      rowPotZ: k === 3,
      rowPotWallX: k === 4,
      rowPotWallT: k === 4,
      rowPotSlitW: k === 4,
      rowPotSlitD: k === 4,
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
      /* 3D：轨道相机（拖拽旋转 + 滚轮缩放）+ 势刷（R49：拖拽连续涂抹球
         形势丘链）。无拖拽发射（初态由预设/σ 滑块给定）；工具模式
         state.tool3='cam' | 'pot' 决定 pointer 语义（面板按钮 / P 键切换）。 */
      this.on(canvas, 'pointerdown', e => {
        try{ canvas.setPointerCapture(e.pointerId); }catch(_){/* 合成/无效 pointerId 时不应中断交互 */ }
        if (this.state.tool3 === 'pot'){
          this.stampBlob3(e.clientX, e.clientY, true, true);   /* 按下必落首丘（无视距离阈值） */
        } else if (this.state.tool3 === 'flux'){
          this.pickFlux3(e.clientX, e.clientY);   /* R57：AB 磁通管放置/选中（不设 cam.drag ⟹ 不旋转视角） */
        } else {
          this.cam.drag = { x: e.clientX, y: e.clientY };
        }
      });
      this.on(canvas, 'pointermove', e => {
        if (this.state.tool3 === 'pot'){
          if (e.buttons & 1) this.stampBlob3(e.clientX, e.clientY, false, false);  /* 拖拽涂抹（0.6R 距离阈值） */
          return;
        }
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
        /* AB 螺线管放置/选中（R54 多管）：点已有环 → 选中（分别调参的对象）；
           点空白 → 以草稿 abPhi 放新管并自动选中。Φ=0 也落点（位置标记，
           演化路径 link 相位恒 0、与无矢势逐位等价——点放无物理副作用）。
           R55：放置/选中后同步预览环 cursor（虚影环留在操作点，与真环重合
           同色——快速连点时 preview 不闪回旧位置）。 */
        const hit = this.pickSolenoid(wx, wy);
        if (hit >= 0) this.selectSolenoid(hit);
        else this.placeSolenoid(wx, wy, this.state.abPhi);
        this.state.abCursor = [wx, wy];
      } else if (this.state.tool === 'bohm'){
        /* R61：Bohm 放点——单击落单粒子（自动开启轨迹，同 flux 工具的即时反馈） */
        if (!this.state.bohmOn) this.setBohmOn(true);
        this.bohmPlace(wx, wy);
      } else {
        this.paintV(e);
      }
    });
    this.on(canvas, 'pointermove', e => {
      this.updateBrushCursor(e);
      /* R55 放置预览环：flux 工具悬停时预览环跟随鼠标（世界坐标） */
      if (this.state.tool === 'flux'){
        const [wx, wy] = this.toWorld(e.clientX, e.clientY);
        this.state.abCursor = [wx, wy];
      }
      if (this.state.drag){
        this.state.drag.cx = e.clientX; this.state.drag.cy = e.clientY;
        aimLine.setAttribute('x1', this.state.drag.cx0 ?? e.clientX);
        aimLine.setAttribute('y1', this.state.drag.cy0 ?? e.clientY);
        aimLine.setAttribute('x2', e.clientX); aimLine.setAttribute('y2', e.clientY);
        aimDot.setAttribute('cx', this.state.drag.cx); aimDot.setAttribute('cy', this.state.drag.cy);
        const k = this.dragK(this.state.drag);
        aimTxt.setAttribute('x', e.clientX + 10); aimTxt.setAttribute('y', e.clientY - 8);
        aimTxt.textContent = 'k = ' + k.mag.toFixed(3);
      } else if (e.buttons & 1 && this.state.tool !== 'wave' && this.state.tool !== 'flux' && this.state.tool !== 'bohm'){
        this.paintV(e);
      }
    });
    this.on(canvas, 'pointerleave', () => { this.q('#brushcursor').style.display = 'none'; this.state.abCursor = null; });
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
      canvas.style.cursor = (this.state.tool === 'wave' || this.state.tool === 'flux' || this.state.tool === 'bohm') ? 'crosshair' : 'cell';
      if (this.state.tool !== 'flux') this.state.abCursor = null;   /* R55：离开 flux 工具即撤预览环 */
      if (this.state.tool !== 'bohm') this.q('#brushcursor').style.display = 'none';
      if (this.state.tool === 'wave') this.q('#brushcursor').style.display = 'none';
    }));
    this.on(this.q('#btnPause'), 'click', () => this.togglePause());
    this.on(this.q('#btnStep'), 'click', () => { const p = this.state.paused; this.state.paused = false; requestAnimationFrame(() => { this.state.paused = p; }); });
    /* R61 概率流 / Bohm 轨迹开关与操作（2D；3D 仅 J 场统计） */
    this.on(this.q('#btnShowJ'), 'click', () => this.setShowJ(!this.state.showJ));
    this.on(this.q('#btnBohm'), 'click', () => this.setBohmOn(!this.state.bohmOn));
    this.on(this.q('#btnBohmSeed'), 'click', () => { this.bohmSeeds(24); this.toast('已撒 24 个 Bohm 粒子（|ψ|² 加权）'); });
    this.on(this.q('#btnBohmClear'), 'click', () => { this.bohmClearTrail(); this.toast('轨迹残影已清空'); });
    this.bindRange('#rBohmFade','#oBohmFade','bohmFade', v => v.toFixed(3));
    if (this.q('#btnShowJ3')) this.on(this.q('#btnShowJ3'), 'click', () => this.setShowJ(!this.state.showJ));
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
    /* R63 均匀 B 轨道耦合：滑块即时生效（每帧 evolveKDK_B 上传 uBOn/uBz/uLapDir，
       无需重发波包——与驱动幅值同类：只改算符不改态）。
       门控（与面板显隐/URL 层三层一致）：
       ① 仅薛定谔内核（NLS/GP 非线性项 ADI 双扫描双重计数、Dirac/Pauli 走 CN）；
       ② 与 AB 磁通/扭曲边界互斥——规范帧 ADI 要求 uABOn=0/uTwistX=0（Landau
          规范的规范变换 φ=e^{iBxy}ψ 与扭曲边界/点磁通不兼容）。
       拒绝时把 state 回退 0 并 syncControls 推回 DOM（bindRange 的 upd 先写
       state 后调 after，故此处纠正是唯一落点）。 */
    this.bindRange('#rBOrb','#oBOrb','bOrb', v => v.toFixed(3), () => {
      this._urlBOrbNote = null;                     /* 用户主动操作 ⟹ URL 拒绝备注失效 */
      const st = this.state;
      if (st.bOrb !== 0 && this.kernelId !== 'schrodinger'){
        st.bOrb = 0; this.syncControls();
        this.toast('均匀磁场（Landau）仅支持薛定谔内核（当前：' + this.kernelId + '）');
        return;
      }
      if (st.bOrb !== 0 && ((st.abSols && st.abSols.length) || (st.twistX || 0) !== 0)){
        st.bOrb = 0; this.syncControls();
        this.toast('均匀磁场与 AB 磁通/扭曲边界互斥（规范帧 ADI 要求先清空两者）');
        return;
      }
      this.refreshParamHud();
    });
    /* R62 光学晶格参数：三个滑块的 after 回调统一走 applyLatticeParams
       （确保处于晶格场景 → 按新 V₀/a/θ 重画势 + 重发初态） */
    this.bindRange('#rLatV0','#oLatV0','latV0', v => v.toFixed(3), () => this.applyLatticeParams());
    this.bindRange('#rLatA','#oLatA','latA', v => v.toFixed(0), () => this.applyLatticeParams());
    this.bindRange('#rTwistX','#oTwistX','twistX', v => v.toFixed(3), () => this.applyLatticeParams());
    if (this.q('#selLatBand')){
      this.on(this.q('#selLatBand'), 'change', e => {
        this.state.latBand = parseInt(e.target.value, 10) === 2 ? 2 : 1;
        this.refreshParamHud();
      });
    }
    /* Bloch 单次弛漾（面板按钮）：以当前 θ 与目标带起 CPU 虚时间流，由 frame()
       主循环分帧推进（relaxStep），完成当帧写状态行。带 2 需要带 1 参考态——
       无则先跑带 1（同扫描器的 per-point 次序）。 */
    if (this.q('#btnBlochRelax')){
      this.on(this.q('#btnBlochRelax'), 'click', () => this.startBlochRelax());
      this.on(this.q('#btnBlochStop'), 'click', () => this.stopBlochRelax());
    }
    /* Bloch 能带扫描（BLOCH_SPEC；面板按钮 + k 点数滑块） */
    if (this.q('#btnBlochScan')){
      const blochBind = (id, out, fmt) => {
        const el = this.q(id), o = this.q(out);
        const upd = () => { o.textContent = fmt(parseFloat(el.value)); };
        el.addEventListener('input', upd); upd();
      };
      blochBind('#rBlochN', '#oBlochN', v => String(v|0));
      this.on(this.q('#btnBlochScan'), 'click', () => {
        this.scannerBloch.start({ kN: parseInt(this.q('#rBlochN').value, 10) || 17 });
      });
      this.on(this.q('#btnBlochScanStop'), 'click', () => this.scannerBloch.stop());
    }
    /* R63 Landau 回旋周期扫描（LANDAU_SPEC；面板按钮） */
    if (this.q('#btnLandauScan')){
      this.on(this.q('#btnLandauScan'), 'click', () => this.scannerLandau.start({}));
      this.on(this.q('#btnLandauScanStop'), 'click', () => this.scannerLandau.stop());
    }
    /* R64 量子弹球：形状下拉（重画硬壁势 + 作废旧谱）+ 求谱 + 显示选中态 */
    if (this.q('#btnBillSpec')){
      this.on(this.q('#selBillKind'), 'change', () => {
        const el = this.q('#selBillKind');
        this.state.billKind = el.value === 'circle' ? 'circle' : 'stadium';
        this._billSpec = null; this._refreshBillStat();
        this.kernel.paintBilliard({ vctx: this.vctx, vGray: v => this.vGray(v), state: this.state });
        this.uploadV();
      });
      this.on(this.q('#btnBillSpec'), 'click', () => this.billiardSpectrum());
      this.on(this.q('#btnBillShow'), 'click', () => this.billiardShowBand(this.state.billBand || 0));
      const rb = this.q('#rBillBand'), ob = this.q('#oBillBand');
      if (rb && ob){
        const upd = () => {
          ob.textContent = rb.value;
          this.state.billBand = (parseInt(rb.value, 10) || 1) - 1;
        };
        rb.addEventListener('input', upd);
        rb.value = String((this.state.billBand || 0) + 1); ob.textContent = rb.value;
      }
    }
    this.bindABPhi();   /* R54：多管 Φ 滑块（写入目标随选中态切换，见方法注释） */
    this.refreshABReadout();   /* R54：初始态读数（构造默认 abSols=[] ⟹ 「无 · 放置即新建」） */
    this.on(this.q('#btnABCenter'), 'click', () => {
      const i = this.state.abSel;
      if (i < 0 || !(this.state.abSols || [])[i]){ this.toast('无选中的螺线管'); return; }
      this.state.abSols[i][0] = 0.5; this.state.abSols[i][1] = 0.5;
      this.refreshABReadout();
      this.toast('AB 螺线管 #' + (i + 1) + ' 已置中');
    });
    this.on(this.q('#btnABDel'), 'click', () => this.deleteSolenoid());
    this.on(this.q('#btnABClear'), 'click', () => this.clearSolenoids());
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
      this.refreshPotRows();                  /* R53：初始态主势行显隐（默认 FREE ⟹ 8 行全隐） */
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
      /* 势刷（R49 连续涂抹 ⟹ R60 椭球+软化）：工具切换 + 新丘规格滑块
         （半径/强度/三轴比/软化，负强度 = 势阱，stamp 时快照进每个丘——
         改滑块只影响后续丘，不追溯已落丘；轴比全 1 + 软化 0 = R49 硬边球）
         + 清空按钮（potBlobs = []）。放置逻辑在 pointer 事件（stampBlob3）。 */
      this.container.querySelectorAll('[data-tool3]').forEach(b =>
        this.on(b, 'click', () => this.setTool3(b.dataset.tool3)));
      this.bindRange('#rBlobR','#oBlobR','potBlobR', v => String(v|0), () => this.updateBlobReadout());
      this.bindRange('#rBlobV0','#oBlobV0','potBlobV0', v => v.toFixed(2), () => this.updateBlobReadout());
      this.bindRange('#rBlobRX','#oBlobRX','potBlobRX', v => v.toFixed(2), () => this.updateBlobReadout());
      this.bindRange('#rBlobRY','#oBlobRY','potBlobRY', v => v.toFixed(2), () => this.updateBlobReadout());
      this.bindRange('#rBlobRZ','#oBlobRZ','potBlobRZ', v => v.toFixed(2), () => this.updateBlobReadout());
      this.bindRange('#rBlobSoft','#oBlobSoft','potBlobSoft', v => v.toFixed(1), () => this.updateBlobReadout());
      this.on(this.q('#btnBlobDel'), 'click', () => {
        const n = (this.state.potBlobs || []).length;
        this.state.potBlobs = [];
        this.syncBlobRows();
        this.toast(n ? '势丘已清空（' + n + ' 个）' : '势丘列表已为空');
      });
      this.syncBlobRows();
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

    /* 面板收起拉手（R56）：点击边缘 tab 切换对应侧整列面板 */
    this.on(this.q('#tabL'), 'click', () => this.togglePanelSide('left'));
    this.on(this.q('#tabR'), 'click', () => this.togglePanelSide('right'));

    /* 键盘 */
    const presetKeys = Object.keys(this.kernel.presets());
    this.on(window, 'keydown', e => {
      if (e.code === 'Space'){ e.preventDefault(); this.togglePause(); }
      else if (e.key >= '1' && e.key <= '9'){ const pk = presetKeys[+e.key - 1]; if (pk) this.loadPreset(pk); }
      else if (e.key === 'r' || e.key === 'R'){ this.reinitWave(); }   /* 2D: lastWave；3D: lastWave3 */
      else if ((e.key === 'c' || e.key === 'C') && !this.kernel.dim3){ this.clearV(); }   /* 3D 无势场画布 */
      else if ((e.key === 'p' || e.key === 'P') && this.kernel.dim3){ this.setTool3(this.state.tool3 === 'pot' ? 'cam' : 'pot'); }   /* R44：势刷/视角切换 */
      else if (e.key === 't' || e.key === 'T'){ this.state.decay = this.state.decay > 0.01 ? 0 : 0.97; this.q('#rTrail').value = this.state.decay; this.q('#oTrail').textContent = this.state.decay.toFixed(2); }
      else if (e.key === 'j' || e.key === 'J'){ this.setShowJ(!this.state.showJ); }   /* R61：概率流箭头 / 3D J 场统计 */
      else if ((e.key === 'b' || e.key === 'B') && !this.kernel.dim3){ this.setBohmOn(!this.state.bohmOn); }   /* R61：Bohm 轨迹（2D 专属） */
      else if (e.key === '[' || e.key === ']'){
        /* R56：左/右侧面板整列收起/展开。表单元素聚焦时不拦截
           （避免误伤滑块/下拉/按钮的键盘操作）。 */
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
        this.togglePanelSide(e.key === '[' ? 'left' : 'right');
      }
      else if (e.key === 'Delete' || e.key === 'Backspace'){
        /* R54：删除选中的 AB 螺线管。表单元素聚焦时不拦截（避免误伤
           滑块/下拉/按钮的键盘操作）；无管时无操作（不 preventDefault）。 */
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
        if ((this.state.abSols || []).length){ e.preventDefault(); this.deleteSolenoid(); }
      }
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
    this.applyABParams(qp);                    /* R54：AB 多螺线管 URL 参数（引擎级） */
    /* R62 晶格 URL 参数（引擎级：latV0/latA/twistX 与 abSols 同属引擎 state）：
         ?latV0=0.3&latA=32&twistX=1.5708&latBand=2     （twistX = θ_B = k·a）
       时序：loadPreset（预设 params 注入默认值）→ 此处覆盖 → syncControls ⟹
       首帧即按目标晶格演化。非 schrodinger 内核忽略。 */
    const qlv = parseFloat(qp.get('latV0')), qla = parseFloat(qp.get('latA'));
    const qtw = parseFloat(qp.get('twistX')), qlb = parseInt(qp.get('latBand'), 10);
    if (isFinite(qlv)) this.state.latV0 = qlv;
    if (isFinite(qla)) this.state.latA = qla;
    if (isFinite(qtw)) this.state.twistX = qtw;
    if (qlb === 1 || qlb === 2) this.state.latBand = qlb;
    /* R63 均匀 B 轨道耦合：?bOrb=0.01（格点单位，q=1）。门控同滑块层：仅
       薛定谔内核 + 与 AB/扭曲边界互斥；不满足时忽略并记因（landauStat 读数
       展示，拖滑块即清除——URL 冲突不静默）。 */
    const qbo = parseFloat(qp.get('bOrb'));
    if (isFinite(qbo) && qbo !== 0){
      if (this.kernelId !== 'schrodinger'){
        this._urlBOrbNote = '?bOrb=' + qbo + ' 已忽略：均匀磁场仅支持薛定谔内核';
      } else if ((this.state.abSols && this.state.abSols.length) || (this.state.twistX || 0) !== 0){
        this._urlBOrbNote = '?bOrb=' + qbo + ' 已忽略：与 AB 磁通/扭曲边界互斥';
      } else {
        this.state.bOrb = qbo;
      }
    }
    /* 晶格参数经 URL 覆盖后需重画势 / 重发初态（loadPreset 用的是预设默认值）：
       latV0/latA 影响势纹理，twistX 影响初态平面波相位 ⟹ 任一被覆盖都要重走 */
    if (this.kernelId === 'schrodinger' && this.state.preset === 'lattice' &&
        (isFinite(qlv) || isFinite(qla) || isFinite(qtw)))
      this.applyLatticeParams();
    /* R61：?showJ=1 / ?bohm=1（2D 专属；3D 仅 showJ 有效——J 场统计）。
       须在 syncControls 前（setShowJ 内部会同步按钮态与 HUD 节可见性）。 */
    if (qp.get('showJ') === '1') this.setShowJ(true);
    if (qp.get('bohm') === '1') this.setBohmOn(true);
    this.syncControls();
  }

  /* AB 多螺线管 URL 参数（R54，引擎级——abSols 是引擎状态，全 2D 内核可用；
     AB 处理从 schrodinger.js applyParams 迁来并扩展为多管语法）：
       ?abSols=x,y,φ;x,y,φ;…   多管语法（分号分隔元组），整体替换列表并选中首管；
       ?abX&abY&abPhi          旧单管简写（R26 起测试链接兼容）：编辑当前选中/首管，
                               列表为空且 Φ≠0 时落一根新管（默认位置 0.5,0.5）。
     时序：loadPreset（预设 params 可注入 abSols/abSel）→ initWave → 此处覆盖，
     均在 frame() 主循环启动之前，首帧即以目标配置演化（旧口径不变）。 */
  applyABParams(qp){
    const st = this.state;
    const as = qp.get('abSols');
    if (as !== null && as !== ''){
      const list = [];
      for (const tup of as.split(';')){
        const p = tup.split(',').map(v => parseFloat(v));
        if (p.length === 3 && p.every(v => isFinite(v))) list.push([p[0], p[1], p[2]]);
      }
      st.abSols = list.slice(0, AB_MAX);
      st.abSel = list.length ? 0 : -1;
    }
    const ax = parseFloat(qp.get('abX')), ay = parseFloat(qp.get('abY'));
    const ap = parseFloat(qp.get('abPhi'));
    if (!isNaN(ax) || !isNaN(ay) || !isNaN(ap)){
      const list = st.abSols || (st.abSols = []);
      let i = (st.abSel >= 0 && st.abSel < list.length) ? st.abSel : (list.length ? 0 : -1);
      if (i < 0){
        /* 列表为空：仅当最终 Φ≠0 时落新管（Φ=0 保持关闭态，与旧版语义一致） */
        const phi = isNaN(ap) ? 0 : ap;
        if (phi !== 0) list.push([isNaN(ax) ? 0.5 : ax, isNaN(ay) ? 0.5 : ay, phi]);
        i = list.length ? list.length - 1 : -1;
      } else {
        if (!isNaN(ax)) list[i][0] = Math.max(0, Math.min(1, ax));
        if (!isNaN(ay)) list[i][1] = Math.max(0, Math.min(1, ay));
        if (!isNaN(ap)) list[i][2] = ap;
      }
      st.abSel = i;
    }
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
      /* 势刷射线拾取（R44）：screenRay3/pickBlob3 的调试句柄转发——
         验证脚本直接对账「CPU 相机镜像 vs shader 相机模型」与放置落点。 */
      screenRay3: (nx, ny) => this.screenRay3(nx, ny),
      pickBlob3: (nx, ny) => this.pickBlob3(nx, ny),
      /* 势刷 stamp（R49）：pointer 事件同一入口的调试转发（客户坐标）——
         验证脚本驱动连续涂抹/FIFO/规格快照断言，不合成 mouse 事件序列。 */
      stampBlob3: (cx, cy, force, announce) => this.stampBlob3(cx, cy, force, announce),
      /* 3D 工具模式（R44）：'cam' | 'pot'，按钮 / P 键 / 验证脚本共用入口 */
      setTool3: (m) => this.setTool3(m),
      tool3: () => this.state.tool3 || 'cam',
      /* 势丘列表（R49 ⟹ R60）：当前丘列表快照 [{x,y,z,r,v0,rx,ry,rz,soft}]
         （对账 GLSL uniform 与面板读数；soft=0 且三轴=r 即 R49 硬边球） */
      blobs: () => (this.state.potBlobs || []).map(b => ({ x: b.x, y: b.y, z: b.z, r: b.r, v0: b.v0, rx: b.rx, ry: b.ry, rz: b.rz, soft: b.soft })),
      /* AB 螺线管列表（R54）：[[x,y,φ],...] 快照 + 选中索引（对账 GLSL uniform
         数组与面板读数）；abPlace/abSelect/abDelete/abClear/abPick 为 pointer
         事件同一入口的调试转发（CDP 驱动放置/选中/删除，不合成鼠标事件序列）。 */
      abSols: () => (this.state.abSols || []).map(s => ({ x: s[0], y: s[1], phi: s[2] })),
      abSel: () => this.state.abSel,
      abPlace: (x, y, phi) => this.placeSolenoid(x, y, phi),
      abSelect: (i) => this.selectSolenoid(i),
      abDelete: () => this.deleteSolenoid(),
      abClear: () => this.clearSolenoids(),
      abPick: (x, y) => this.pickSolenoid(x, y),
      /* R55 放置预览环：flux 工具悬游标世界坐标（null = 无预览）。
         abSetCursor 供 CDP 直接驱动预览环渲染（不合成鼠标事件）。 */
      abCursor: () => { const c = this.state.abCursor; return c ? [c[0], c[1]] : null; },
      abSetCursor: (x, y) => { this.state.abCursor = (x < 0 || y < 0) ? null : [x, y]; return this.state.abCursor ? [x, y] : null; },
      /* R61 概率流 / Bohm 轨迹调试句柄：
         - jRed()：最近一次归约快照（2D {sjx,sjy,sdj,sp,fl,fr,fb,ft,mj,saj}；
           3D {jx,jy,jz,dj,fxm,fxp,fym,fyp,fzm,fzp,mj,sp}）
         - jScale()：max|J|（箭头归一化基准）
         - jFieldPass()/jRedPass()：手动跑一次（维度自适应）——CDP 可在暂停态
           建立 J 场后直接断言，无需等帧循环节流
         - bohmPositions()：64 粒子快照（null = 停泊）——轨迹推进断言
         - bohmPlace/bohmSeeds/bohmStep/bohmStamp/bohmReset/bohmClearTrail：
           pointer 事件同一入口的调试转发（不合成鼠标事件序列） */
      showJ: () => this.state.showJ,
      bohmOn: () => this.state.bohmOn,
      setShowJ: (v) => this.setShowJ(v),
      setBohmOn: (v) => this.setBohmOn(v),
      jRed: () => (this.kernel.dim3 ? this._j3 : this._j) || null,
      jScale: () => this._jScale || 0,
      jFieldPass: () => this.kernel.dim3 ? this.jField3Pass() : this.jFieldPass(),
      jRedPass: () => this.kernel.dim3 ? this.jRed3Pass() : this.jRedPass(),
      bohmPositions: () => this.bohmPositions(),
      bohmPlace: (x, y) => this.bohmPlace(x, y),
      bohmSeeds: (n) => this.bohmSeeds(n),
      bohmStep: () => this.bohmStep(),
      bohmStamp: () => this.bohmStamp(),
      bohmClearTrail: () => this.bohmClearTrail(),
      bohmReset: () => this.bohmReset(),
      /* 残影纹理统计（R61 swap 修复的取证/断言面）：A=显示采样纹理
         （stamp 后必须非空），B=scratch */
      bohmTrailStats: () => this.bohmTrailStats(),
      /* 2D 当前场原始数据（psiA 回读，RG/RGBA32F 交错）：供验证脚本做跨版本
         场级比对（R54 单管零回归：HEAD dist vs 新 dist 同参数同帧数对账）。 */
      field2d: () => {
        const g = this.state.grid, ch = this.kernel.pairs === 2 ? 4 : 2;
        const buf = new Float32Array(g*g*ch);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiA.fbo);
        gl.readPixels(0, 0, g, g, this.fmt, gl.FLOAT, buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { g, ch, data: Array.from(buf) };
      },
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
      /* R62 光学晶格 / Bloch 调试句柄（cdp62 浏览器验证用）：
         - latParams()：晶格参数快照 + θ_BC（twisted 边界总相位 = h·θ_B）
         - startBlochRelax/stopBlochRelax：面板同一入口（无需合成点击）
         - relaxPending()/relaxTask()/lastRelax()：弛漾任务态直读（异步分帧推进）
         - blochModel()：解析模型（Mathieu 带 + 横向基模能量 ey0）供对账 */
      scanBloch: this.scannerBloch,
      latParams: () => ({
        latV0: this.state.latV0, latA: this.state.latA, twistX: this.state.twistX,
        latBand: this.state.latBand, grid: this.state.grid, m: this.state.m,
        thetaBC: this.twistBC(), preset: this.state.preset,
      }),
      startBlochRelax: () => { this.startBlochRelax(); return !!this.kernel.relaxPending; },
      stopBlochRelax: () => { this.stopBlochRelax(); return !!this.kernel.relaxPending; },
      relaxPending: () => !!this.kernel.relaxPending,
      relaxTask: () => { const t = this.kernel._relaxTask; return t ? { band: t.band, steps: t.steps, mu: t.mu, blockOff: t.blockOff } : null; },
      lastRelax: () => this.kernel._lastRelax || null,
      blochModel: () => (this.kernel.blochModel ? this.kernel.blochModel(this.state) : null),
      /* R63 质心（归约矩 Σx·p/P, Σy·p/P，格点单位）+ simTime：回旋轨迹采样。
         归约为 120ms 节流 ⟹ 采样间隔同频（回旋周期 ~10² 帧，足够密） */
      centroid: () => {
        const m = this._lastMom;
        if (!m || !(m.sp > 0)) return null;
        return { x: m.sx/m.sp, y: m.sy/m.sp, P: m.sp, T: m.st, V: m.sv, t: this.state.simTime };
      },
      bOrb: () => this.state.bOrb || 0,
      /* R63：setBOrb 门控同滑块层（仅薛定谔内核 + 与 AB/扭曲边界互斥）。
         拒绝时返回**当前生效值**（非请求值）——CDP 诊断方可自证门控生效，
         不会把「静默失败」误读成「已设置」。 */
      setBOrb: (v) => {
        const nv = Number(v) || 0;
        const st = this.state;
        const ok = nv === 0 || (this.kernelId === 'schrodinger' &&
          !(st.abSols && st.abSols.length) && (st.twistX || 0) === 0);
        st.bOrb = ok ? nv : 0;
        this._urlBOrbNote = null;
        this.syncControls(); this.refreshParamHud();
        return st.bOrb;
      },
      /* R63 Landau 扫描调试句柄（cdp63 浏览器验证用）：
         - scanLandau：扫描器实例（start(opts)/stop()/busy/results/summary）
         - landauModel()：半经典模型快照（θ₀/T₀/T_晶格/valid——与 HUD 同源）
         - mom2()：**精确**质心（fieldMoments2，扫描器同一原语；非 HUD 的
           120ms 节流读数）——CDP 逐帧采样回旋轨迹用 */
      scanLandau: this.scannerLandau,
      landauModel: () => (this.kernel.landauModel ? this.kernel.landauModel(this.state) : null),
      /* R64 量子弹球调试句柄（cdp64 用）：求谱 + 选态 + 结果快照 */
      billiardSpectrum: () => { this.billiardSpectrum(); return this.billInfo(); },
      billiardShowBand: (i) => { this.billiardShowBand(Number(i) || 0); return true; },
      billInfo: () => this.billInfo(),
      /* 本征态的密度摘要（scar 判据用）：中央带（|y−g/2|<8）均值 / 全腔均值 */
      billBand: (i) => {
        const sp = this._billSpec;
        if (!sp || !sp.evecs[i]) return null;
        const g = this.state.grid, x = sp.evecs[i], row = Math.floor(g/2);
        let all = 0, band = 0, nb = 0, peak = 0;
        for (let y = 0; y < g; y++) for (let k = 0; k < g; k++){
          const p = x[y*g + k]*x[y*g + k];
          all += p; if (p > peak) peak = p;
          if (Math.abs(y - row) < 8){ band += p; nb++; }
        }
        return { bandRatio: (band/nb)/(all/(g*g) || 1), peak, mean: all/(g*g) };
      },
      mom2: () => {
        const m = fieldMoments2(this);
        return { cx: m.cx, cy: m.cy, P: m.P, peak: m.peak, Rrms: m.Rrms, t: this.state.simTime };
      },
      /* 单帧物理推进（不经 rAF）：CDP 以固定步数驱动，避免受帧率影响 */
      stepOnce: () => { this.evolve(); return this.state.simTime; },
      /* 按给定几何重发波包 + 设 σ（cdp63 单点回旋验证：与扫描器 beginPoint 同口径） */
      emit: (fx, fy, kx, ky) => { this.initWave(fx, fy, kx, ky); return this.state.lastWave; },
      setSigma: (v) => { this.state.sigma = Number(v) || 0; if (this.state.lastWave) this.reinitWave(); return this.state.sigma; },
      /* R52：内核实例（渐进弛豫任务状态诊断：relaxPending/_relaxTask.steps/
         _lastRelax——虚时间流分帧推进是异步引擎行为，CDP 需直读任务态） */
      kernel: this.kernel,
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
        } else if (this.state.bOrb !== 0 && this.kernelId === 'schrodinger'){
          /* R63 B 模式诊断步进：规范帧 ADI 序列（evolveKDK_B 同构；diag 口径：
             驱动/AB/扭曲归零）。语义：n = 子步数，每子步 = 6 pass（x,y 两扫描
             各 kick/drift/kick）——与 plain 路径的「n = 平铺 pass 数」不同，
             调用方（cdp 诊断）按 B 模式口径解读。 */
          gl.useProgram(this.progEvolve);
          gl.uniform1f(this.u(this.progEvolve,'uDt'), 1.2/6);
          gl.uniform1f(this.u(this.progEvolve,'uK'), 0.5/this.state.m);
          gl.uniform2f(this.u(this.progEvolve,'uTexel'), tx, tx);
          gl.uniform1f(this.u(this.progEvolve,'uDriveAmp'), 0);
          gl.uniform1f(this.u(this.progEvolve,'uDrivePhase'), 0);
          gl.uniform1i(this.u(this.progEvolve,'uDriveMode'), 0);
          gl.uniform1f(this.u(this.progEvolve,'uTwistX'), 0);
          gl.uniform1f(this.u(this.progEvolve,'uBOn'), 1);
          gl.uniform1f(this.u(this.progEvolve,'uBz'), this.state.bOrb);
          this.setABUniforms(gl, this.progEvolve, true);
          this.kernel.setUniforms(gl, this.progEvolve, this.state);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, this.vTex);
          gl.uniform1i(this.u(this.progEvolve,'uV'), 1);
          const uUV = this.u(this.progEvolve,'uUpdateV');
          const uDir = this.u(this.progEvolve,'uLapDir');
          for (let i=0;i<n;i++){
            const order = (i % 2 === 0) ? [1.0, 2.0] : [2.0, 1.0];
            for (const dir of order){
              gl.uniform1f(uDir, dir);
              for (let pass=0; pass<3; pass++){
                gl.bindFramebuffer(gl.FRAMEBUFFER, this.psiB.fbo);
                gl.viewport(0,0,g0,g0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.psiA.tex);
                gl.uniform1i(this.u(this.progEvolve,'uPsi'), 0);
                gl.uniform1f(uUV, pass === 1 ? 0.0 : 1.0);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                const tmp = this.psiA; this.psiA = this.psiB; this.psiB = tmp;
              }
            }
          }
        } else {
        gl.useProgram(this.progEvolve);
        gl.uniform1f(this.u(this.progEvolve,'uDt'), 1.2/6);
        gl.uniform1f(this.u(this.progEvolve,'uK'), 0.5/this.state.m);
        gl.uniform2f(this.u(this.progEvolve,'uTexel'), tx, tx);
        gl.uniform1f(this.u(this.progEvolve,'uDriveAmp'), 0);
        gl.uniform1f(this.u(this.progEvolve,'uDrivePhase'), 0);
        gl.uniform1i(this.u(this.progEvolve,'uDriveMode'), 0);
        gl.uniform1f(this.u(this.progEvolve,'uTwistX'), 0);   /* 诊断路径：无扭曲边界（同驱动/AB 归零口径） */
        gl.uniform1f(this.u(this.progEvolve,'uBOn'), 0);      /* 诊断路径：无轨道耦合（同上） */
        gl.uniform1f(this.u(this.progEvolve,'uBz'), 0);
        gl.uniform1f(this.u(this.progEvolve,'uLapDir'), 0);   /* R63：plain 诊断路径无 ADI 扫描 */
        this.setABUniforms(gl, this.progEvolve, true);   /* 诊断路径强制无 AB（diag，同 evolveCN 口径） */
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
    if (this.scannerBloch) this.scannerBloch.stop();
    cancelAnimationFrame(this._raf);
    for (const [t, type, fn, opts] of this._listeners) t.removeEventListener(type, fn, opts);
    this._listeners = [];
    window.removeEventListener('error', this._onError);
    clearTimeout(this._toastTimer);
    if (this.gl){
      const gl = this.gl;
      for (const t of [this.psiA, this.psiB, this.dispA, this.dispB]) if (t){ gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      for (const t of [this.psiA3, this.psiB3]) if (t){ gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      /* R61：J 场 / 残影 / 粒子目标（含全部三个 MRT 附件） */
      for (const t of [this.jT, this.bohmTrailA, this.bohmTrailB, this.posA, this.posB]) if (t){ gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      for (const t of [this.jT3]) if (t){ gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      for (const t of [this.reduceT, this.jRedT, this.jRedT3]) if (t){
        gl.deleteTexture(t.tex); gl.deleteTexture(t.tex2); gl.deleteTexture(t.tex3); gl.deleteFramebuffer(t.fbo);
      }
      if (this.ptsVao) gl.deleteVertexArray(this.ptsVao);
      gl.deleteTexture(this.vTex);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
    if (window.__app && window.__app.kernelId === this.kernelId) delete window.__app;
    this.container.innerHTML = '';
  }
}
