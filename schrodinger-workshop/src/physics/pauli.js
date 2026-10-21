/* ============================================================================
 * Pauli 自旋内核（spin-1/2）：iℏ∂ψ/∂t = [−ℏ²/2m ∇² + V − (qℏ/2m)·σ·B]·ψ
 *
 * 波函数为二分量旋量 ψ = (ψ₁, ψ₂)（pairs=2，RGBA32F：xy=↑ 分量、zw=↓ 分量）。
 * 这是本引擎第一个多复分量内核——验证 PhysicsKernel 契约对自旋族的支持。
 *
 * 物理模型（诚实声明适用范围）：
 *   哈密顿 H = −uK·∇² + V·I − uK·(σ·B)，uK = 1/2m（引擎 uniform），
 *   塞曼耦合强度取 q=1（即 uB = q/2m = uK；q 固定，质量 m 经滑块调节）。
 *   **只含自旋（塞曼）耦合，不含轨道耦合 (p−qA)²/2m**——对应「中性粒子
 *   （如中子）的磁矩」图像：无电荷即无轨道耦合，塞曼项是全部电磁作用。
 *   均匀 B 下的轨道 Landau 量子化需要拉普拉斯项的 link 相位扩展
 *   （引擎级改动），不在本内核范围——如实标注为已知限制。
 *
 * 磁场（uniform 分量 + x 向梯度，斯特恩-盖拉赫用）：
 *   B(x,y) = (bX, bY, bZ + bGrad·(x−½))，x 为归一化世界坐标 ∈[0,1]
 *   （与 AB 螺线管位置、行波驱动、势场画笔同一坐标系）；bGrad 即全域
 *   Bz 变化量（bZ=0 时屏幕左半 Bz<0、右半 Bz>0）。
 *   梯度只加在 Bz 的 x 向上：σz 本征态受恒力 F_x = ±uK·∂Bz/∂x = ±uK·g，
 *   自旋沿 x 的波包分裂为 ↑/↓ 两束（SG 图像）。
 *
 * 【位移公式的量纲诚实声明】引擎拉普拉斯为 texel 间距 5 点 stencil
 *   （h=1/grid），归一化坐标下 H_kin=−uK·h²·∂²_x ⟹ 有效质量
 *   m_eff = m·grid²（格点单位下 H=−(1/2m)∂²_X，m 即滑块质量）。
 *   故每分量半位移（格点）：
 *     ΔX = ½·(uK·g/m_eff)·t²·grid = uK²·g·t²/(m·grid)   （m=1, grid=256:
 *     ΔX = g·t²/1024；g=0.016 时 t=1080（60fps·15s）→ 每束 18 格）
 *   CDP 实证（R30）：g=0.016 下 ΔX 实测与理论偏差 <1%（t² 律比值 5.86 vs
 *   5.85），自旋转相同步符合 ⟨σx⟩=cos(2·uK·Bz_local·t)。
 *
 * σ·B 的实线性 4×4 作用（列布局 c = (x₁,y₁,x₂,y₂)，ψ₁=x₁+iy₁, ψ₂=x₂+iy₂）：
 *   (σ·B·ψ)₁ = Bz·ψ₁ + (Bx−iBy)·ψ₂
 *   (σ·B·ψ)₂ = (Bx+iBy)·ψ₁ − Bz·ψ₂
 *   ⟹ M 对称（厄米）⟹ 精确流严格守恒 P；KDK 分裂与标量内核同构
 *      （模板实现一阶系统 w' = J·M·w，localH 给 M·c 全通道积）。
 *      【R32 量化 → R33 修复】KDK 的数值守恒仅对 (u|v) 分裂下的**偶**
 *      算符成立：σ_x/σ_z（纯 B_x/B_z）⟹ 两个 2×2 Verlet 块、ρ=1 精确；
 *      σ_y 为**奇**算符（u|v 互换）⟹ kick 自耦合 ⟹ ρ=√(1+φ²)>1
 *      （φ=dt_sub·uK·|B_y|）——慢指数漂移：默认 tilted 预设（|B|=0.02）
 *      实测 +0.122%/900 帧、B_y=0.05 滑块上限 +9.85%/900 帧（R32，numpy
 *      全算符与 CDP 互证）。本内核 R33 起切 CN（integrator='cn'）：Cayley
 *      矩阵严格正交 ⟹ 无条件稳定，σ_y 漂移根治——CDP 复测（9×manualPass
 *      (1800)=1620 sim-time）：tilted+By=0.05 从 KDK 的 +9.941% 降至
 *      −0.0099%（同跨度下 KDK 线性外推 ~+15%，>1500× 改善）。残差 0.01–
 *      0.15% 为 RGBA32F 纹理 float32 舍入积累（算法层 numpy float64 复刻
 *      实测 6.4e-13/16200 子步，Jacobi 截断可忽略——平滑波包高频内容指数
 *      衰减），无系统偏向、交互时标下不可见（详见 worklog R33 与 kernel.js
 *      CN 约定节）。σ·B 局部块闭式解见 shaders().cnLocalSolve。
 *
 * 自旋态布洛赫球约定：|ψ⟩ = cos(θ/2)|↑⟩ + e^{iφ}·sin(θ/2)|↓⟩
 *   θ=0 → ↑（⟨σz⟩=+1）；θ=π/2,φ=0 → +x（⟨σx⟩=+1）；φ 控制赤道面方位。
 *
 * 招牌预设：
 *   larmor          均匀 Bz，自旋→x，kx=0：⟨σ⟩ 绕 z 进动
 *                   ω = 2·uK·Bz = Bz/m（空间/自旋解耦，进动与波包扩散无关）
 *   stern-gerlach   Bz 的 x 向梯度，自旋→x：波包分裂为 ↑/↓ 两束
 *                   （每束半位移 uK²·g·t²/(m·grid)，60fps 下 ~15s 可见分离；
 *                   Bx=By=0 ⟹ 无自旋混合，两束保持纯 ↑/↓ 蓝/橙分色）
 *   tilted          B ∥ (1,1,1)，自旋→z：⟨σ⟩ 绕斜轴锥形进动
 *                   ⟨σz⟩ = ⅓ + ⅔·cos(ωt)（ω = 2·uK·|B|）——可检验签名
 *   free            B=0：自旋态冻结（|⟨σ⟩|=1 恒定），透射率扫描面板可见
 *                   （B=0 时 V 自旋无关，透射率与薛定谔内核逐字一致）
 * ========================================================================== */
import { PhysicsKernel, registerKernel } from './kernel.js';
import { rectangularBarrierModel } from './barrier.js';

export class PauliKernel extends PhysicsKernel {
  constructor(){
    super();
    this.id = 'pauli';
    this.name = 'Pauli 自旋';
    this.equation = '<b>PAULI SPIN-1/2</b> · <i>i</i>ℏ ∂ψ/∂t = [−ℏ²/2m ∇² + V − (<i>q</i>ℏ/2m)·σ·B]·ψ';
    this.pairs = 2;
    /* 自旋读数能力标志：引擎据此显示 HUD 自旋区（⟨σx⟩/⟨σy⟩/⟨σz⟩/|⟨σ⟩|）
       与调试句柄 spin。约定：内核提供 spinRead(rawSum) → {sx,sy,sz,len}，
       rawSum 由引擎 spinSum() 从 psiA 纹理直读（纯测量、无物理公式）。 */
    this.spinReadout = true;
    /* R33：切 CN 积分器。KDK 对 σ_y（(u|v) 分裂下的**奇**算符）结构性失效——
       谱半径 ρ=√(1+φ²)>1（φ=dt_sub·uK·|B_y|），慢指数漂移（R32 量化：
       默认 tilted +0.122%/900 帧、B_y=0.05 上限 +9.85%/900 帧）。CN 的
       Cayley 矩阵严格正交 ⟹ 无条件稳定，σ_y 漂移根治（CDP 复测：+9.941%
       → −0.0099%@1620 sim-time；算法层 numpy 复刻 6.4e-13/16200 子步，
       GPU 残差为 float32 纹理舍入 ~0.1% 量级，无系统偏向）；
       σ·B 局部块经 shaders().cnLocalSolve 注入（见下）。代价 ~4.3× GPU
       （13 pass/子步 vs KDK 3）——正确性优先。 */
    this.integrator = 'cn';
  }

  /* 初始旋量波包：高斯包络 × 布洛赫自旋态（θ/φ 经引擎从 state 透传）。
     引擎负责归一化与等份叠加；θ/φ 滑块变更时重发波包即时可见。 */
  makeWave(grid, p){
    const th = p.spinTheta === undefined ? Math.PI/2 : p.spinTheta;
    const ph = p.spinPhi === undefined ? 0 : p.spinPhi;
    const up = Math.cos(th/2), dn = Math.sin(th/2);   /* |↑⟩,|↓⟩ 振幅（up²+dn²=1） */
    const cx = p.fx*grid, cy = p.fy*grid;
    const data = new Float32Array(grid*grid*4);
    let sum = 0;
    for (let y=0; y<grid; y++){
      for (let x=0; x<grid; x++){
        const dx = x-cx, dy = y-cy;
        const env = Math.exp(-(dx*dx+dy*dy)/(2*p.sigma*p.sigma));
        const pk = p.kx*dx + p.ky*dy;                  /* 动量平面波相位（两分量同） */
        const i = (y*grid+x)*4;
        const c = Math.cos(pk), s = Math.sin(pk);
        data[i]   = up*env*c;  data[i+1] = up*env*s;   /* ψ₁ = cos(θ/2)·env·e^{ikr} */
        data[i+2] = dn*env*Math.cos(pk+ph);            /* ψ₂ = e^{iφ}·sin(θ/2)·env·e^{ikr} */
        data[i+3] = dn*env*Math.sin(pk+ph);
        sum += env*env;                                /* up²+dn²=1 ⟹ Σ|ψ|²=Σenv² */
      }
    }
    return { data, sum };
  }

  defaults(){
    return { bX: 0, bY: 0, bZ: 0.02, bGrad: 0,
             spinTheta: Math.PI/2, spinPhi: 0 };
  }

  shaders(){
    return {
      /* 内核私有 uniform + 共用 helper（uniforms 串注入三个模板的全局区，
         函数声明合法；未被引用的 helper 在对应 program 中无副作用）：
         - pauliSigmaB：σ·B 的实线性 4×4 作用（localH 用）
         - pauliPixel：像素着色（display 用；hsv 内核与 TPL_DISPLAY 的
           hsv2rgb 逐字同式——因注入顺序在本段之后才定义 hsv2rgb，故自包含
           重写两行，避免前向声明依赖） */
      uniforms:
        'uniform vec4 uB;   /* 磁场 (Bx, By, Bz, dBz/dx) */\n' +
        'vec4 pauliSigmaB(vec4 c, float Bz){\n' +
        '  return vec4( Bz*c.x + uB.x*c.z + uB.y*c.w,\n' +
        '               Bz*c.y - uB.y*c.z + uB.x*c.w,\n' +
        '               uB.x*c.x - uB.y*c.y - Bz*c.z,\n' +
        '               uB.y*c.x + uB.x*c.y - Bz*c.w );\n' +
        '}\n' +
        'vec3 pauliPixel(vec4 psi, float p){\n' +
        '  vec2 ph = dot(psi.xy,psi.xy) >= dot(psi.zw,psi.zw) ? psi.xy : psi.zw;\n' +
        '  float sz = p > 1e-9 ? (dot(psi.xy,psi.xy)-dot(psi.zw,psi.zw))/p : 0.0;\n' +
        '  float h = atan(ph.y,ph.x)/6.2831853 + 0.5;\n' +
        '  vec3 rgb = clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);\n' +
        '  rgb = rgb*rgb*(3.0-2.0*rgb);\n' +
        '  vec3 hue = mix(vec3(1.0), rgb, 0.80);\n' +
        '  return mix(hue, mix(vec3(1.0,0.45,0.15), vec3(0.30,0.60,1.0), 0.5*(sz+1.0)), 0.55);\n' +
        '}',
      /* H·c 局部部分 = V·c − uK·(σ·B)·c（uK=q/2m 由引擎注入，q=1）。
         Bz 含 x 向梯度：Bz(x) = uB.z + uB.w·(x−½)，x 取 texel 世界坐标 vUv.x。
         4 通道积即 M·c——KDK 模板的一阶系统 w'=J·M·w 对任意实线性 M 成立
         （含 σ_y 耦合，无需引擎模板改动）。 */
      localH: 'V*c - uK*pauliSigmaB(c, uB.z + uB.w*(vUv.x - 0.5))',
      /* CN 局部块 (I−h·Gloc)⁻¹ 闭式解（TPL_CN_SWEEP 的 {{CN_LOCAL_SOLVE}} 注入点）。
         M_loc = V·I − uK·σ·B（2×2 厄米）⟹ 引擎 CN 约定的局部解为 (I+i·h·M_loc)⁻¹：
         记 A=1+ihV、c=h·uK·|B|、n=B/|B|，(n·σ)²=I ⟹
         (A·I − i·c·nσ)⁻¹ = (A·I + i·c·nσ)/(A²+c²)，
         其中 i·c·(nσ)·arg = i·h·uK·(σ·B)·arg（复用 pauliSigmaB——c·n=h·uK·B），
         A·arg 为标量 (1+ihV) 逐通道相乘，分母 A²+c²=(1+c²−h²V²)+i·2hV 做复除。
         B=0 时退化为 arg/(1+ihV)（纯势 Cayley 相位移，与 Dirac 的 V 块同构）；
         局部部分严格保范（Cayley 酉性）⟹ σ_y 奇耦合的 KDK 慢指数漂移
         （R32 量化的 ρ=√(1+φ²)）由此根治。Bz 含 x 向梯度，逐 texel 取值。 */
      cnLocalSolve:
        'vec4 cnLocalSolve(vec4 arg, float V){\n' +
        '  float h = uDtHalf;\n' +
        '  float Bz = uB.z + uB.w*(vUv.x - 0.5);\n' +
        '  vec4 t = pauliSigmaB(arg, Bz);            /* (σ·B)·arg */\n' +
        '  vec4 a = vec4(arg.x - h*V*arg.y, arg.y + h*V*arg.x,\n' +
        '                arg.z - h*V*arg.w, arg.w + h*V*arg.z);   /* A·arg */\n' +
        '  vec4 s = vec4(a.x - h*uK*t.y, a.y + h*uK*t.x,\n' +
        '                a.z - h*uK*t.w, a.w + h*uK*t.z);         /* A·arg + i·h·uK·(σ·B)·arg */\n' +
        '  float c2 = h*h*uK*uK*(uB.x*uB.x + uB.y*uB.y + Bz*Bz);\n' +
        '  float dr = 1.0 + c2 - h*h*V*V, di = 2.0*h*V;           /* A²+c² */\n' +
        '  float inv = 1.0/(dr*dr + di*di);\n' +
        '  return vec4((s.x*dr + s.y*di)*inv, (s.y*dr - s.x*di)*inv,\n' +
        '              (s.z*dr + s.w*di)*inv, (s.w*dr - s.z*di)*inv);\n' +
        '}',
      /* |ψ|² = |ψ₁|²+|ψ₂|²（RGBA32F 四通道全参与） */
      density: 'dot(psi.xy,psi.xy) + dot(psi.zw,psi.zw)',
      /* 动能：两分量拉普拉斯之和（vec4 点积天然覆盖 xy+zw） */
      kinetic: '0.25*(dot(dxp,dxp)+dot(dyp,dyp))',
      /* 势能密度含塞曼自旋能：−uK·⟨ψ|σ·B|ψ⟩（否则 HUD 的 E=⟨T⟩+⟨V⟩
         漏掉自旋项，均匀场下看起来不守恒——把塞曼能并入 ⟨V⟩ 后 E 为
         真实守恒量）。⟨σ·B⟩密度 = Bz·(p₁−p₂) + 2(Bx·Re ψ₁*ψ₂ + By·Im ψ₁*ψ₂)，
         Bz 取该 texel 世界坐标 x（reduce 循环内变量，非 vUv——reduce 的
         vUv 是 32² 归约目标坐标，勿混用）。 */
      potential:
        'V*p - uK*((uB.z + uB.w*(x - 0.5))*(dot(psi.xy,psi.xy) - dot(psi.zw,psi.zw))\n' +
        '          + 2.0*(uB.x*(psi.x*psi.z + psi.y*psi.w) + uB.y*(psi.x*psi.w - psi.y*psi.z)))',
      /* 像素着色：色相 = 优势分量相位；自旋倾向着色——σz>0（偏↑）蓝、
         σz<0（偏↓）橙，与相位色相 55% 混合（SG 分裂后两束蓝/橙分明） */
      pixelColor: 'pauliPixel(psi, p)',
    };
  }

  /* 面板附加控件：磁场三分量 + Bz 梯度 + 自旋极角/方位角。
     引擎注入两个行为回调：
       reinit         —— 自旋角属初相，变更后按新布洛赫方向重发波包；
       refreshParamHud —— B 场滑块变更即时刷新 HUD 磁场行（参数派生读数）。
     磁场 uniform 每帧从 state 读取，演化本身无需重发。 */
  extraControls(reinit, refreshParamHud){
    return {
      html:
        '<div class="row"><label>磁场 B_x</label><input type="range" id="rBX" min="-0.05" max="0.05" step="0.001" value="0"><output id="oBX">0.000</output></div>' +
        '<div class="row"><label>磁场 B_y</label><input type="range" id="rBY" min="-0.05" max="0.05" step="0.001" value="0"><output id="oBY">0.000</output></div>' +
        '<div class="row"><label>磁场 B_z</label><input type="range" id="rBZ" min="-0.05" max="0.05" step="0.001" value="0.02"><output id="oBZ">0.020</output></div>' +
        '<div class="row"><label>B_z 梯度 g</label><input type="range" id="rBGrad" min="0" max="0.05" step="0.001" value="0.016"><output id="oBGrad">0.0160</output></div>' +
        '<div class="row"><label>自旋极角 θ</label><input type="range" id="rSpinT" min="0" max="3.1416" step="0.01" value="1.5708"><output id="oSpinT">1.57</output></div>' +
        '<div class="row"><label>自旋方位角 φ</label><input type="range" id="rSpinP" min="-3.1416" max="3.1416" step="0.01" value="0"><output id="oSpinP">0.00</output></div>',
      rows: [
        { id:'#rBX',    out:'#oBX',    key:'bX',        fmt: v => v.toFixed(3), after: refreshParamHud },
        { id:'#rBY',    out:'#oBY',    key:'bY',        fmt: v => v.toFixed(3), after: refreshParamHud },
        { id:'#rBZ',    out:'#oBZ',    key:'bZ',        fmt: v => v.toFixed(3), after: refreshParamHud },
        { id:'#rBGrad', out:'#oBGrad', key:'bGrad',     fmt: v => v.toFixed(4), after: refreshParamHud },
        { id:'#rSpinT', out:'#oSpinT', key:'spinTheta', fmt: v => v.toFixed(2), after: reinit },
        { id:'#rSpinP', out:'#oSpinP', key:'spinPhi',   fmt: v => v.toFixed(2), after: reinit },
      ],
    };
  }

  setUniforms(gl, prog, state){
    const loc = gl.getUniformLocation(prog, 'uB');
    if (loc) gl.uniform4f(loc, state.bX, state.bY, state.bZ, state.bGrad);
  }

  /* 稳定性附加项：塞曼算符谱半径 uK·|B|max（|B|max 取梯度两端与均匀分量的
     最大模；拉普拉斯 uK·8 与 V∈[−1,1] 已由引擎基线覆盖）。 */
  eMaxExtra(state){
    const g = Math.abs(state.bGrad);
    const bzMax = Math.max(Math.abs(state.bZ + 0.5*g), Math.abs(state.bZ - 0.5*g));
    return (0.5/state.m) * Math.hypot(state.bX, state.bY, bzMax);
  }

  applyParams(qp, state){
    const f = (k, lo, hi) => { const v = parseFloat(qp.get(k)); if (!isNaN(v)) state[k] = Math.max(lo, Math.min(hi, v)); };
    f('bX', -0.05, 0.05); f('bY', -0.05, 0.05); f('bZ', -0.05, 0.05);
    f('bGrad', 0, 0.05); f('spinTheta', 0, Math.PI); f('spinPhi', -Math.PI, Math.PI);
    /* R71 Berry 循环参数（引擎级 state，供 CDP/URL 直设）：
       ?berryTheta=&berryOmega=&berryB0= —— 上下界与面板滑块一致。 */
    f('berryTheta', 0.05, Math.PI); f('berryOmega', 0.002, 0.02); f('berryB0', 0.01, 0.05);
  }

  /* 自旋读数（引擎 spinSum 原始求和 → 布洛赫向量）。
     rawSum = { re12: ΣRe(ψ₁*ψ₂), im12: ΣIm(ψ₁*ψ₂), n1: Σ|ψ₁|², n2: Σ|ψ₂|², P }。
     ⟨σx⟩=2Re(ψ₁*ψ₂)/P, ⟨σy⟩=2Im(ψ₁*ψ₂)/P, ⟨σz⟩=(n1−n2)/P（ℏ=1，σ 本征值 ±1）。 */
  spinRead(s){
    const P = Math.max(s.P, 1e-30);
    const sx = 2*s.re12/P, sy = 2*s.im12/P, sz = (s.n1 - s.n2)/P;
    return { sx, sy, sz, len: Math.hypot(sx, sy, sz) };
  }

  /* CPU 密度（调试/测量句柄用）：双分量求和 */
  cpuDensity(buf, i){ return buf[i]*buf[i] + buf[i+1]*buf[i+1] + buf[i+2]*buf[i+2] + buf[i+3]*buf[i+3]; }

  /* 矩势垒透射模型：仅 B=0 时提供（V 自旋无关 ⟹ 两分量独立演化、透射率与
     薛定谔内核逐字一致；B≠0 时自旋-空间耦合，无简单线性透射公式，返回
     null —— 引擎据此隐藏扫描面板，诚实标注）。 */
  transmissionModel(state){
    if (state.bX !== 0 || state.bY !== 0 || state.bZ !== 0 || state.bGrad !== 0) return null;
    return rectangularBarrierModel(state.m);
  }

  /* R71 Berry 相位（绝热循环）：本内核的 uB uniform **每帧从 state.bX/bY/bZ
     读取**（setUniforms），故 Berry 循环可以让引擎逐帧覆写这三个分量而零
     新 shader（B(t)=B₀(sinθ cosφ, sinθ sinφ, cosθ)、φ=ωt）——这是把几何
     相位做进面板的关键：无需引擎或模板改动。约束：Berry 面板要求 bGrad=0
     （有梯度则不同 x 走不同大小的锥，相位被平均掉），循环期间强制归零、
     结束恢复。σ·B 的局部 Cayley 闭式（cnLocalSolve）对任意方向的 B 成立，
     故锥面路径上的 CN 演化与静态均匀场同一精度。 */
  presets(){
    return {
      larmor: { name:'拉莫尔进动', text:'自旋沿 +x 的波包置于均匀磁场 B_z 中：自旋（布洛赫向量）绕磁场轴进动，频率 ω = qB/m（ℏ=1，q=1）——B_z=0.02、m=1 时周期 ≈ 314 模拟时间 ≈ 4.4 秒。波包取 k=0 静止：空间与自旋解耦（均匀场、无势），进动不受波包扩散干扰。HUD 自旋区实时显示 ⟨σ_x⟩=cos(ωt)、⟨σ_y⟩=−sin(ωt)、⟨σ_z⟩=0，|⟨σ⟩|=1 严格守恒。拖动 B_z 滑块可连续改变进动频率（含反向）。',
                build(){}, wave:[0.5,0.5,0,0],
                params:{ bX:0, bY:0, bZ:0.02, bGrad:0, spinTheta:Math.PI/2, spinPhi:0, sigma:7 } },
      'stern-gerlach': { name:'斯特恩-盖拉赫', text:'磁场 B_z 沿 x 方向线性梯度（g=∂B_z/∂x，全域变化量）：自旋沿 +x 的波包中，↑ 分量受恒力 +uK·g、↓ 分量受 −uK·g——波包分裂为两束，各自偏转相反方向。这正是斯特恩-盖拉赫实验：不均匀磁场把自旋叠加态分解为空间可分的两束（蓝色=↑ / 橙色=↓）。每束半位移 uK²·g·t²/(m·grid)（格点；m_eff=m·grid²，因拉普拉斯为 texel 间距 stencil）——g=0.016 时 60fps 下 ~15s 分离约 2σ，调大 g 滑块可加速。Bx=By=0 ⟹ 无横向场、自旋不混合：两束始终保持纯 ↑/↓（蓝/橙分色）；总 ⟨σ⟩ 随两束空间重叠衰减（SG 即自旋-空间纠缠的产生过程），B_z(x) 的空域变化即偏转力本身。',
                build(){}, wave:[0.32,0.5,0,0],
                params:{ bX:0, bY:0, bZ:0, bGrad:0.016, spinTheta:Math.PI/2, spinPhi:0, sigma:18 } },
      tilted: { name:'斜场进动', text:'磁场沿 (1,1,1) 方向（|B|=0.02），自旋初态沿 +z：布洛赫向量绕斜轴做锥形进动（半锥角即 z 与 B 的夹角 54.7°）。可检验签名：⟨σ_z⟩ = ⅓ + ⅔·cos(ωt)（在 1 与 −⅓ 间振荡），⟨σ_x⟩、⟨σ_y⟩ 同频振荡，|⟨σ⟩|=1 恒定。波包以 k=0.05 漂移，演示「边飞边转」。',
                build(){}, wave:[0.3,0.5,0.05,0],
                params:{ bX:0.0115, bY:0.0115, bZ:0.0115, bGrad:0, spinTheta:0, spinPhi:0, sigma:7 } },
      free: { name:'自由自旋波包', text:'B=0：自旋态冻结（无进动、无受力），波包自由飞行并扩散，⟨σ⟩ 保持初值（|⟨σ⟩|=1）。作为自旋动力学的对照组；此时透射率扫描面板可用——V 自旋无关，势垒透射率与薛定谔内核逐字一致（透射率扫描工具可直查）。',
                build(){}, wave:[0.18,0.5,0.09,0],
                params:{ bX:0, bY:0, bZ:0, bGrad:0, spinTheta:Math.PI/2, spinPhi:0, sigma:7 } },
    };
  }
}

registerKernel(new PauliKernel());
