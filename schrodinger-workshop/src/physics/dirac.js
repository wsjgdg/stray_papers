/* ============================================================================
 * Dirac 方程内核（2+1 维）：iℏ ∂ψ/∂t = [α_x·p_x + α_y·p_y + β·m + V]·ψ
 *
 * 波函数为双复分量旋量 ψ=(ψ₁,ψ₂)（pairs=2，RGBA32F：xy=ψ₁、zw=ψ₂）——
 * 与 Pauli 同一纹理布局，但矩阵代数从 σ·B（宇称偶、二阶算符背景）升级为
 * 完整的 Clifford 代数 {α_x,α_y,β}=0、α²=β²=1（一阶方程）。
 *
 * 【表象与实形化】取手征（Weyl）表象 2×2 复矩阵：
 *   β = diag(1,−1)，α_x = σ_x = [[0,1],[1,0]]，α_y = σ_y = [[0,−i],[i,0]]
 *   （α_x、β 实对称，α_y 纯虚对称；三者实线性、两两反对易。）
 * 引擎按 4 实分量布局 c=(x₁,y₁,x₂,y₂)（ψ₁=x₁+iy₁, ψ₂=x₂+iy₂）工作，
 * 实形化后三个矩阵均为 4×4 **实对称**矩阵：
 *   α_x·C = (c.z, c.w, c.x, c.y)             （交换两复分量，即 σ_x 块）
 *   α_y·C = (c.w, −c.z, −c.y, c.x)           （−iψ₂ = y₂−ix₂、iψ₁ = −y₁+ix₁）
 *   β ·C = (c.x, c.y, −c.z, −c.w)
 * ⟹ H_D = α·p + βm + V 为**实线性厄米**算符（α、β、V 实，唯一复源是常数 −i
 * 藏在 p=−i∇ 里）⟹ 总概率严格守恒。
 *
 * 【积分器：CN + block-Jacobi——引擎 KDK 对本内核结构性失效（#33 最重要一条）】
 * 一阶方程 i∂_tψ=Hψ 拆实形 ψ=u+iv 得 w'=J·M·w（引擎交错布局）。薛定谔的
 * M=diag(H,H) 通道对齐 ⟹ KDK 的 kick/drift 两通道投影可分解为逐模态 2×2
 * 旋转，|λ|=1 精确。**Dirac 的 M 混合通道**（α·p 把 ψ₂ 的导数耦合进 ψ₁
 * 的方程）⟹ 本征基非通道对齐，kick/drift 的通道投影剪切不可交换——KDK
 * 映射谱半径实测 ρ=1.0216（1D、dt_sub=0.2、m=1；平面波 400 步放大 1.97e4，
 * dt_sub 扫描 0.05→1.0014 … 1.2→1.6922），与符号/边界细节无关，是结构性
 * 失效（Pauli 的常数 σ·B 是同族但更轻的缺陷：σ_x/σ_z 在 (u|v) 分裂下为
 * 偶算符 ⟹ ρ=1 精确稳定；σ_y 为奇算符（u|v 互换）⟹ kick 自耦合 ⟹
 * ρ=√(1+φ²)（φ=dt_sub·uK·|B_y|）——R32 量化闭环：默认 tilted 预设
 * +0.122%/900 帧、B_y=0.05 滑块上限 +9.85%/900 帧；**R33 起 Pauli 已切
 * CN 路径**（本内核同款 CN_LOCAL_SOLVE 泛化注入，Pauli 侧注入 σ·B 的
 * Cayley 4×4 闭式），该缺陷根治：CDP 复测 tilted+By=0.05 同跨度
 * +9.941%→−0.0099%（详见 pauli.js 头注 R33 段）。
 * ⟹ 本内核走引擎 CN 路径（integrator='cn'）：
 *   (I−h·G)w_{n+1} = (I+h·G)w_n，h=dt_sub/2，G=−J·M 斜对称（M 对称）
 *   ⟹ Cayley 矩阵严格正交：范数机器精度守恒、无条件稳定（无 dt·E_max 极限）。
 *   GPU 求解 = block-Jacobi：对角 2×2 块（βm+V 局部）闭式求逆 + α·p 导数
 *   耦合迭代 x ← (I−h·Gloc)⁻¹(rhs + h·Gkin·x)，12 次扫掠收敛到 ~1e-9
 *   （收缩比 ~0.18/迭代，理论上界 h√2）。时间域验证（klein_td4.py，numpy
 *   同算法）：300 步范数守恒 2e-9、质心=格点群速、连续性方程成立。
 *   引擎交错布局 G=−J·M 的通道排布 ((Mw).y, −(Mw).x, (Mw).w, −(Mw).z)：
 *   α_x p_x 对 u 的作用纯进虚槽（−i·∂_x u 再交换分量）：(Hv)₁ −= ∂_xv₂ …
 *   逐通道展开（记 dxv=½(ψ(x+h)−ψ(x−h)) 为 4 通道 x 向中心差分）：
 *     Hc.x =  dxv.w − dyv.z          （α_x v_x + α_y v_y 的通道 1）
 *     Hc.y = −dxv.z − dyv.w
 *     Hc.z =  dxv.y + dyv.x
 *     Hc.w = −dxv.x + dyv.y          ← w 分量 +Dy(y)：曾误写 −Dy(y)（破坏 M
 *                                   对称性，KDK/CN 双路径受累）；三重验证：
 *                                   复形展开 / 分块对称 / 交换子（R31 记录）
 *   即 −i·α·∂ψ = (∂_xψ₂^I − ∂_yψ₂^R, −∂_xψ₂^R − ∂_yψ₂^I,
 *                 ∂_xψ₁^I + ∂_yψ₁^R, −∂_xψ₁^R − ∂_yψ₁^I)。
 *   局部部分（βm+V，LOCAL_H）：
 *     vec4((m+V)c.x, (m+V)c.y, (V−m)c.z, (V−m)c.w)   （β=diag(1,1,−1,−1)）
 *
 * 【离散色散】中心差分 ∂→i·sin k ⟹ 平面波本征关系
 *   H(k)·u = ±√(sin²k_x+sin²k_y+m²)·u， E±(k)=±√(sin²k_x+sin²k_y+m²)
 * 谱半径 ≤ √2 + m + |V|（每轴 |sin k|≤1）⟹ eMaxExtra 补足引擎基线
 * 4/m+1（拉普拉斯路径，Dirac 不用）与 √2+m+1 的差：max(0, √2+m−4/m)
 * ——m 大时基线反而不够（m=4 时 4/m+1=2 < √2+m+1=6.41）。
 *
 * 【正能旋量初态】离散精确正能平面波（E=√(sin²k+m²)）：
 *   u(k) = N·(1, (sin k_x + i·sin k_y)/(E+m))
 * 高斯包络 × 该旋量仍不是本征态（包络内每个 k 的本征旋量不同）⟹ 残留
 * 负能成分引发 zitterbewegung（颤振）：分量概率以 ~2E≈2m 的频率振荡。
 * 这正是 zitter 预设的展示对象——不是数值误差，是 Dirac 方程的物理内容
 * （连续极限的标准结果；离散格点上频率为 2√(sin²k+m²)）。
 *
 * 【Klein 佯谬与矩势垒透射——格点色散口径】连续解析解（一阶方程界面
 *   ψ 连续即可，无需导数匹配）给出 q·a=nπ 处**精确共振全透射 T=1**，但那是
 *   k,q→0 极限；格点（|sin k|≤1、每区 4 模态含 Nyquist 别名对）的精确解
 *   由 transmissionModel 的 latticeT 给出（界面匹配 8 方程最小二乘，
 *   T+R=1、全场残差 1e-15）。实测对照（m=0.3、k=0.3、V0=0.95）：
 *     a=16：T_latt=0.166（T_cont=0.337）——薄垒连续公式高估一倍
 *     a=14：T_latt=0.995（T_cont=0.858）——格点色散把共振条件修对了
 *           （q_latt·a=6.31≈2π，连续 q·a=6.10 偏 2.9%）
 *   Klein 签名仍在：T 不随 a 指数衰减（同参数薛定谔 ≈e^(−2κa)≈1e-10），
 *   宽坝 T 振荡周期 2π/q_latt≈13.9 格（格点 a 扫描的峰结构）。
 *   时间域裁决（klein_td4.py，CN+Jacobi 同算法长跑）：T_sim=T_latt 谱平均
 *   ±3%（分区/link 流双测量互证；入射流积分=v_g·P0；连续性方程成立）——
 *   模拟与格点精确解一致，连续公式的偏离是色散离散的物理而非数值缺陷。
 *
 * 【能密度口径】动能（reduce，KIN_SCALE=1.0——α·p 动能无 1/2m 因子）：
 *   E_x = ½(u₁∂_xv₂ − v₁∂_xu₂ + u₂∂_xv₁ − v₂∂_xu₁) = ⟨ψ|α_x p_x|ψ⟩密度
 *   E_y = ½(−u₁∂_yu₂ − v₁∂_yv₂ + u₂∂_yu₁ + v₂∂_yv₁)
 *   （dxp/dyp 为引擎 4 阶中心差分 = 2∂，0.25→½ 因子配套，与 Pauli 同式。）
 * 势能密度：V·p + m·(p₁−p₂)（βm 期望 = m(|ψ₁|²−|ψ₂|²)）。
 * 均值动量用引擎默认 Im(ψ*∂ψ) 两分量和——Dirac 的正则动量（平移生成元）
 * 仍守恒（均匀势下），HUD 不确定原理区口径不变。
 *
 * 【AB link 相位】最小耦合 p→p−A 作用在 α·p 上（不是 βm）——diracD 的
 * 四个邻点采样在 uABOn>0.5 时经 rot4 乘 link 相位（与引擎标量路径同一
 * 精确线积分约定），给出 2+1 维旋量的 AB 效应（规范 U(1) 对旋量的作用）。
 *
 * 【已知限制（诚实声明）】
 *   1. 连续近似：色散/群速公式已内入 sin k（格点精确），但 Klein 的连续 T
 *      公式只是格点解的 k→0 极限（见上节对照）——CDP/扫描工具一律以
 *      latticeT 格点解为对照真值。CN 无条件稳定，Jacobi 12 sweeps 截断
 *      误差 ~1e-9/步；子步数沿用引擎 KDK 同公式只为统一时间离散精度。
 *   2. 势场 8 位编码硬上限 ±1（引擎约束）⟹ Klein 区需 m<~0.5（2m<0.95），
 *      预设取 m=0.3；质量滑块范围 0.15–4 内更高势垒不可画（引擎约束，非内核）。
 *   3. 无自旋读数（spinReadout 不设）：Dirac 的 σ_z=β 期望 =(n1−n2)/P 仍
 *      有定义但不是守恒量/进动轴，HUD 自旋区不显示（避免误导）；
 *      CDP 用 spinCom/fieldStats 直读分量。
 *   4. 3D：本内核为 2+1 维（α_x, α_y）；3D Dirac 属 3D 纹理 backlog。
 * ========================================================================== */
import { PhysicsKernel, registerKernel } from './kernel.js';

export class DiracKernel extends PhysicsKernel {
  constructor(){
    super();
    this.id = 'dirac';
    this.name = 'Dirac 相对论';
    this.equation = '<b>DIRAC (2+1 D)</b> · <i>i</i>ℏ ∂ψ/∂t = [α_x·p_x + α_y·p_y + β·m + V]·ψ';
    this.pairs = 2;
    /* CN 积分器：KDK 对 Dirac 结构性失效（通道混合 M，谱半径 ρ=1.0216），
       详见文件头【积分器】节；引擎 app.js 按此标志走 CN 路径。 */
    this.integrator = 'cn';
    /* 不设 spinReadout：见文件头「已知限制」第 3 条。 */
  }

  /* 初始旋量波包：高斯包络 × 离散正能旋量 u(k)（头注【正能旋量初态】）。
     u(k) = (1, (sin k_x + i·sin k_y)/(E+m))，E=√(sin²k_x+sin²k_y+m²)。
     k=0 时 u=(1,0)：纯上分量静止包（zitter 预设的初态）。
     引擎负责归一化与等份叠加；θ/φ 自旋滑块不适用于 Dirac（忽略）。 */
  makeWave(grid, p){
    const m = p.m === undefined ? 1 : p.m;
    const sk = Math.sin(p.kx), tk = Math.sin(p.ky);      /* 离散动量（格点波数→sin k） */
    const E = Math.sqrt(sk*sk + tk*tk + m*m);
    const w2r = sk/(E+m), w2i = tk/(E+m);                /* 下分量 (sin k_x+i·sin k_y)/(E+m) */
    const cx = p.fx*grid, cy = p.fy*grid;
    const data = new Float32Array(grid*grid*4);
    let sum = 0;
    for (let y=0; y<grid; y++){
      for (let x=0; x<grid; x++){
        const dx = x-cx, dy = y-cy;
        const env = Math.exp(-(dx*dx+dy*dy)/(2*p.sigma*p.sigma));
        const pk = p.kx*dx + p.ky*dy;                    /* 平面波相位（两分量同 k） */
        const i = (y*grid+x)*4;
        const c = Math.cos(pk), s = Math.sin(pk);
        data[i]   = env*c;  data[i+1] = env*s;           /* ψ₁ = env·e^{ikr} */
        data[i+2] = env*(w2r*c - w2i*s);                 /* ψ₂ = env·(w2r+iw2i)·e^{ikr} */
        data[i+3] = env*(w2r*s + w2i*c);
        sum += env*env*(1 + w2r*w2r + w2i*w2i);
      }
    }
    return { data, sum };
  }

  defaults(){ return {}; }   /* 无内核私有参数：m 是引擎既有滑块 */

  shaders(){
    return {
      uniforms: 'uniform float uMass;   /* 裸质量 m（βm 项；引擎 uK=1/2m 不适用于一阶项） */',
      /* diracD：−i·α·∂ψ 的实形 4 通道积（推导见文件头）。±x/±y 邻点中心差分，
         AB on 时经 rot4 乘 link 相位（最小耦合 p→p−A 作用在 α·p 上）。 */
      helpers:
        'vec4 diracD(vec2 uv){\n' +
        '  vec4 sp, sm, tp, tm;\n' +
        '  if(uABOn > 0.5){\n' +
        '    float cAB = uABPhi/6.28318530718;\n' +
        '    vec2 dp = uv - uABPos;\n' +
        '    float b0 = ang(dp);\n' +
        '    vec2 dq;\n' +
        '    dq = uv + vec2(uTexel.x,0.0) - uABPos;  sp = rot4(S(uv+vec2( uTexel.x,0.0)), cAB*wrapPi(ang(dq)-b0));\n' +
        '    dq = uv - vec2(uTexel.x,0.0) - uABPos;  sm = rot4(S(uv+vec2(-uTexel.x,0.0)), cAB*wrapPi(ang(dq)-b0));\n' +
        '    dq = uv + vec2(0.0,uTexel.y) - uABPos;  tp = rot4(S(uv+vec2(0.0, uTexel.y)), cAB*wrapPi(ang(dq)-b0));\n' +
        '    dq = uv - vec2(0.0,uTexel.y) - uABPos;  tm = rot4(S(uv+vec2(0.0,-uTexel.y)), cAB*wrapPi(ang(dq)-b0));\n' +
        '  } else {\n' +
        '    sp = S(uv+vec2( uTexel.x,0.0)); sm = S(uv+vec2(-uTexel.x,0.0));\n' +
        '    tp = S(uv+vec2(0.0, uTexel.y)); tm = S(uv+vec2(0.0,-uTexel.y));\n' +
        '  }\n' +
        '  vec4 dxv = 0.5*(sp-sm), dyv = 0.5*(tp-tm);\n' +
        '  return vec4(dxv.w - dyv.z, -dxv.z - dyv.w, dxv.y + dyv.x, -dxv.x + dyv.y);\n' +
        '}',
      kineticE: 'diracD(vUv)',
      kinScale: '1.0',
      /* CN 局部块 (I−h·Gloc)⁻¹ 闭式解（TPL_CN_SWEEP 的 {{CN_LOCAL_SOLVE}} 注入点；
         R33 从模板内联提升为内核 snippet——表达式逐字不变，Dirac 行为零变化）。
         Gloc = −J·(βm+V)：通道 1 特征值 s1=uMass+V、通道 2 特征值 s2=V−uMass，
         块矩阵 [[1,−hs],[hs,1]]/det 求逆（det=1+h²s²）。 */
      cnLocalSolve:
        'vec4 cnLocalSolve(vec4 arg, float V){\n' +
        '  float s1 = uMass + V, s2 = V - uMass;\n' +
        '  float d1 = 1.0/(1.0 + uDtHalf*uDtHalf*s1*s1);\n' +
        '  float d2 = 1.0/(1.0 + uDtHalf*uDtHalf*s2*s2);\n' +
        '  return vec4((arg.x + uDtHalf*s1*arg.y)*d1,\n' +
        '              (arg.y - uDtHalf*s1*arg.x)*d1,\n' +
        '              (arg.z + uDtHalf*s2*arg.w)*d2,\n' +
        '              (arg.w - uDtHalf*s2*arg.z)*d2);\n' +
        '}',
      /* H·c 局部部分 = (βm+V)·c（β=diag(1,1,−1,−1)） */
      localH: 'vec4((uMass+V)*c.x, (uMass+V)*c.y, (V-uMass)*c.z, (V-uMass)*c.w)',
      /* |ψ|² = |ψ₁|²+|ψ₂|² */
      density: 'dot(psi.xy,psi.xy) + dot(psi.zw,psi.zw)',
      /* 动能密度 ⟨ψ|α·p|ψ⟩（dxp/dyp=2∂，½ 因子配套；可轴分解 f(dxp)+g(dyp)） */
      kinetic:
        '0.5*(psi.x*dxp.w - psi.y*dxp.z + psi.z*dxp.y - psi.w*dxp.x)\n' +
        '+ 0.5*(-psi.x*dyp.z - psi.y*dyp.w + psi.z*dyp.x + psi.w*dyp.y)',
      /* 势能密度 = V·p + m·(p₁−p₂)（βm 期望） */
      potential: 'V*p + uMass*(dot(psi.xy,psi.xy) - dot(psi.zw,psi.zw))',
      /* 像素着色：优势分量相位色相 + 分量权重着色（偏 ψ₁ 蓝、偏 ψ₂ 橙，
         55% 混合——与 Pauli 同构；正能电子主要集中在 ψ₁，ZB/散射时两分量
         交替可见）。hsv2rgb 由 display 模板提供（定义于 main 前）。 */
      pixelColor:
        'mix((dot(psi.xy,psi.xy) >= dot(psi.zw,psi.zw)\n' +
        '        ? hsv2rgb(vec3(atan(psi.y,psi.x)/6.2831853+0.5,0.80,1.0))\n' +
        '        : hsv2rgb(vec3(atan(psi.w,psi.z)/6.2831853+0.5,0.80,1.0))),\n' +
        '     mix(vec3(1.0,0.45,0.15), vec3(0.30,0.60,1.0),\n' +
        '         0.5*(clamp((dot(psi.xy,psi.xy)-dot(psi.zw,psi.zw))/max(p,1e-9),-1.0,1.0)+1.0)),\n' +
        '    0.55)',
    };
  }

  setUniforms(gl, prog, state){
    const loc = gl.getUniformLocation(prog, 'uMass');
    if (loc) gl.uniform1f(loc, state.m);
  }

  /* R61 概率流覆写：Dirac 的守恒流为 J^k = ψ†α^kψ（Noether 电流，ℏ=c=1，
     无 1/m 因子——lattice 单位下速度即无量纲群速）。Weyl 表象手算：
       J_x = ψ†σ_xψ = 2Re(ψ₁*ψ₂) = 2(x·z + y·w)
       J_y = ψ†σ_yψ = 2Im(ψ₁*ψ₂) = 2(x·w − y·z)
     物理校验：正能平面波 u=(1,w)、w=s/(E+m)（k_y=0）⟹ J_x/ρ = s/E =
     群速 ∂E/∂k_x ✓（Bohm 制导速度与群速一致，一阶方程的自洽签名）。
     连续性方程 ∂_tρ + ∇·J = 0 对 Dirac 严格成立（ρ=ψ†ψ）⟹ 引擎 jRed 的
     Gauss 望远镜自校验同样适用。基类默认 (1/m)·Im(ψ*∇ψ) 对一阶方程不适用
     （会把 group velocity 错标上 1/m），故必须覆写。 */
  currentSnippets(){
    return {
      jx: '2.0*(psi.x*psi.z + psi.y*psi.w)',
      jy: '2.0*(psi.x*psi.w - psi.y*psi.z)',
      jz: '0.0',
    };
  }

  /* 稳定性附加项：Dirac H 谱半径 √2+m+1（|α·p|≤√2、|βm|=m、|V|≤1）；
     引擎基线 4/m+1+eMaxExtra+|A| 须 ≥ 之 ⟹ 补 max(0, √2+m−4/m)。 */
  eMaxExtra(state){
    return Math.max(0, Math.SQRT2 + state.m - 4/state.m);
  }

  /* 扫描工具的入射中心能量口径：Dirac 总能量（离散色散）ℰ=√(sin²k+m²)。
     透射率模型 T(E,V0,a) 的 E 同为总能量口径（含静质量 m）。 */
  scanEc(state, kx){
    return Math.sqrt(Math.sin(kx)*Math.sin(kx) + state.m*state.m);
  }

  cpuDensity(buf, i){ return buf[i]*buf[i] + buf[i+1]*buf[i+1] + buf[i+2]*buf[i+2] + buf[i+3]*buf[i+3]; }

  /* 矩势垒透射模型（正入射）——**格点色散口径**：T(E,V0,a) = latticeT 的
     界面匹配精确解（每区 4 模态含 Nyquist 别名对、4 界面站点 8 方程最小二乘；
     与连续公式的系统对照见文件头【Klein 佯谬】节）。E 为总能量（ℏ=1、格点
     单位）。convolved 对高斯 k 分布（均值 kx、宽 dk）积分 T(E(k),V0,a)——
     宽波包的合理对照目标（与薛定谔内核同口径；谱平均修正 Klein 曲线的
     k 依赖性——时间域 klein_td4.py 证实 T_sim=T_latt 谱平均 ±3%）。 */
  transmissionModel(state){
    const m = state.m;
    const Eof = k => Math.sqrt(Math.sin(k)*Math.sin(k) + m*m);   /* 离散色散：k→总能量 */
    const T = (E, V0, a) => {
      if (V0 === 0) return 1;                     /* 平坦段：全透射 */
      /* q²=0 转折点（(E−V0)²=m²）：±κ 消失波模态重合、匹配矩阵秩亏——
         取 V0±δ 两侧平均（T 对 V0 光滑，误差 O(δ²)；测度零参数点） */
      if (Math.abs((E-V0)*(E-V0) - m*m) < 1e-9) return 0.5*(T(E, V0+1e-4, a) + T(E, V0-1e-4, a));
      const out = latticeT(E, V0, a, m);          /* sk≥1（无外部传播波）⟹ null → 0 */
      return out === null ? 0 : out.T;
    };
    return {
      T, E: Eof,
      /* Δk 卷积期望（Simpson，±5dk，401 点；与 barrier.js 同模式） */
      convolved(kx, dk, V0, a){
        if (V0 === 0) return 1;
        if (!(dk > 0)) return T(Eof(kx), V0, a);
        const N = 400, span = 5*dk;
        let sum = 0, wsum = 0;
        for (let i = 0; i <= N; i++){
          const k = kx - span + 2*span*i/N;
          const w = Math.exp(-((k - kx)/dk)*((k - kx)/dk)/2);
          const wt = (i === 0 || i === N) ? 1 : (i%2 ? 4 : 2);
          sum += wt*w*T(Eof(k), V0, a); wsum += wt*w;
        }
        return sum/wsum;
      },
    };
  }

  presets(){
    return {
      zitter: { name:'Zitterbewegung 颤振', text:'静止的纯上分量高斯波包（k=0，u=(1,0)）——它不是 Dirac 方程的本征态：波包内每个 k 的正能旋量 (1,(sin k)/(E+m)) 取向不同，叠加后残留负能成分，正负能干涉使两个分量的概率以 ~2m 的频率高速振荡（颤振）。这是 Dirac 方程最著名的「病态」：点粒子的位置期待值也存在这种 ~2m 频率的抖动。m=1 时振荡周期 ≈ π 模拟时间（≈2.6 帧）。蓝色=ψ₁ 主导、橙色=ψ₂ 主导，两色高速交替即是颤振；提高质量滑块可提高频率（∝m）。',
                build(){}, wave:[0.5,0.5,0,0],
                params:{ m:1, sigma:6 } },
      'klein-barrier': { name:'Klein 佯谬·势垒', text:'m=0.3 的粒子（E≈0.42）撞上 V0≈0.95 的势垒——垒高超过 E+m=0.72，进入 Klein 区：势垒内不出现消失波，而是负能（空穴）态群速反向「载着」概率继续前进，透射率不随势垒宽度指数衰减。格点精确解（transmissionModel）给出 T≈0.17；同参数薛定谔方程给出 ≈10⁻¹⁰（指数抑制）——两个理论的判决性分歧。波包 k=0.3、σ=18，与透射率扫描工具几何一致。势场 8 位编码上限 ±1（引擎约束）⟹ Klein 区要求 m<0.5，故本预设取小质量。',
                build(paint){ paint.vctx.fillStyle = paint.vGray(0.95); paint.vctx.fillRect(120,0,16,256); },
                wave:[0.10,0.5,0.3,0],
                params:{ m:0.3, sigma:18 } },
      'klein-resonance': { name:'Klein 共振全透射', text:'同一势垒（V0≈0.95）但宽度调到 14 格：格点色散下 q_latt·a≈2π 近共振——实测透射率 ≈0.99，势垒几乎完全透明，像不存在一样（经典粒子 100% 反弹、薛定谔粒子 ≈100% 反射的势垒！）。物理来源：Dirac 方程一阶结构下，势垒两个界面产生的反射相干相消。格点精确解（latticeT）T=0.995，反而比连续公式的 0.86 更接近全透射——离散色散把共振条件修对了（q_latt·a=6.31 vs 2π=6.28）。共振周期 2π/q_latt≈13.9 格：轻扫质量/势场笔刷破坏共振条件，透射率随即坍塌。',
                build(paint){ paint.vctx.fillStyle = paint.vGray(0.95); paint.vctx.fillRect(120,0,14,256); },
                wave:[0.10,0.5,0.3,0],
                params:{ m:0.3, sigma:18 } },
      relativistic: { name:'相对论群速', text:'m=1、k=0.5 的波包自由飞行：格点群速 v_g=dE/dk=sin(k)·cos(k)/E=0.379（E=√(sin²k+m²)=1.109），比薛定谔的 k/m=0.5 低约 24%——质量「拖累」下相对论性色散的直接可测量（klein_td4.py 时间域实测质心 0.25% 内吻合）。注意 v_g≠⟨α_x⟩=sin(k)/E=0.432：格点速度算符是 ∂H/∂k=α_x·cos(k)，窄包 ⟨v⟩=cos k·sin k/E 才等于群速。HUD 质心漂移速度（世界坐标/模拟时间）对照理论值 0.379/256=0.00148。把质量滑块调大，群速进一步压低（v→sin k/m 的极限要 m→∞）。',
                build(){}, wave:[0.10,0.5,0.5,0],
                params:{ m:1, sigma:12 } },
    };
  }
}

/* ============================================================================
 * 格点 Dirac 矩势垒精确透射（transmissionModel 的真值口径；klein5.py 的 JS 移植）
 *
 * 离散递推（引擎同约定：中心差分 ∂→i·sin k、V 能量平移）：
 *   ψ2_{j+1} = ψ2_{j-1} + 2i(E−m−V_j)·ψ1_j
 *   ψ1_{j+1} = ψ1_{j-1} + 2i(E−V_j+m)·ψ2_j
 * 每区模态 e^{ikj}·(1, s(k))，s(k)=sin k/(E−V+m)，色散 sin²k=(E−V)²−m²。
 * sin²k 有 4 解 ⟹ 每区 4 模态 ±k₁、±(π−k1)（Nyquist 别名对，旋量比跟随
 * sin k 符号）；Klein 区（E−V0<0）别名对群速反向；消失波区（(E−V0)²<m²）
 * 无别名（虚 q），仅 2 模态。未知量 r1,r2 | A₁..A₄ | t1,t2；方程 = 4 界面
 * 站点（−1,0,a−1,a）递推残差（8 复数，超定时最小二乘）。
 * T=|t1|²+|t2|²、R=|r1|²+|r2|²（严格 T+R=1；klein5.py 全场残差 1e-15）。
 * sk≥1（外部无传播模态）⟹ null。复数对统一用 [re, im]。
 * ========================================================================== */
const _csub = (a,b) => [a[0]-b[0], a[1]-b[1]];
const _cmul = (a,b) => [a[0]*b[0]-a[1]*b[1], a[0]*b[1]+a[1]*b[0]];
const _cconj = a => [a[0], -a[1]];

/* 复系数线性求解 A·x=b（高斯消元 + 部分主元；A n×n 的 [re,im] 二维数组） */
function _cSolve(A, b){
  const n = b.length;
  for (let col=0; col<n; col++){
    let piv = col, best = A[col][col][0]*A[col][col][0] + A[col][col][1]*A[col][col][1];
    for (let r=col+1; r<n; r++){
      const v = A[r][col][0]*A[r][col][0] + A[r][col][1]*A[r][col][1];
      if (v > best){ best = v; piv = r; }
    }
    if (!(best > 0)) return null;                     /* 秩亏（物理上不出现） */
    if (piv !== col){ const t=A[col]; A[col]=A[piv]; A[piv]=t; const tb=b[col]; b[col]=b[piv]; b[piv]=tb; }
    const d = A[col][col];
    for (let r=col+1; r<n; r++){
      const f = _cmul(A[r][col], [d[0]/(d[0]*d[0]+d[1]*d[1]), -d[1]/(d[0]*d[0]+d[1]*d[1])]);
      for (let c2=col; c2<n; c2++) A[r][c2] = _csub(A[r][c2], _cmul(f, A[col][c2]));
      b[r] = _csub(b[r], _cmul(f, b[col]));
    }
  }
  const x = new Array(n);
  for (let r=n-1; r>=0; r--){
    let s = b[r];
    for (let c2=r+1; c2<n; c2++) s = _csub(s, _cmul(A[r][c2], x[c2]));
    const d = A[r][r];
    x[r] = _cmul(s, [d[0]/(d[0]*d[0]+d[1]*d[1]), -d[1]/(d[0]*d[0]+d[1]*d[1])]);
  }
  return x;
}

/* 超定最小二乘（法方程 M†M·x=M†b；行数≥列数，物理问题良态） */
function _cLstsq(M, b){
  const rows = b.length, n = M[0].length;
  const A = Array.from({length:n}, () => Array.from({length:n}, () => [0,0]));
  const c = Array.from({length:n}, () => [0,0]);
  for (let k=0; k<rows; k++){
    for (let i=0; i<n; i++){
      const mi = _cconj(M[k][i]);
      for (let j=0; j<n; j++) A[i][j] = [A[i][j][0] + _cmul(mi, M[k][j])[0], A[i][j][1] + _cmul(mi, M[k][j])[1]];
      c[i] = [c[i][0] + _cmul(mi, b[k])[0], c[i][1] + _cmul(mi, b[k])[1]];
    }
  }
  return _cSolve(A, c);
}

/* latticeT(E, V0, a, m) → { T, R } | null（sk≥1 无外部传播波）。
   复模态 (q, s)：e^{iqj}·(1, s)；s 为 [re,im]（实 q 时纯实、消失波时纯虚）。 */
function latticeT(E, V0, a, m){
  const sk2 = E*E - m*m;
  if (!(sk2 > 0)) return null;
  const sk = Math.sqrt(sk2);
  if (!(sk < 1)) return null;                          /* 外部无传播模态 */
  const k1 = Math.asin(sk), k2 = Math.PI - k1, k3 = Math.PI + k1;
  const s = sk/(E+m);                                  /* 外部旋量比（实数） */
  const sq2 = (E-V0)*(E-V0) - m*m;
  const modes = [];                                    /* [q, sre, sim] */
  if (sq2 > 1e-14){
    const sq = Math.sqrt(sq2), sp = sq/(E-V0+m);
    const q1 = Math.asin(Math.min(sq, 1)), q2 = Math.PI - q1;
    modes.push([q1, sp, 0], [-q1, -sp, 0], [q2, sp, 0], [-q2, -sp, 0]);
  } else {
    const kap = Math.sqrt(Math.max(-sq2, 0)), d = E-V0+m;
    modes.push([kap, 0, kap/d], [-kap, 0, -kap/d]);    /* 消失波：s=i·κ/d */
  }
  const nA = modes.length;
  const n = 2 + nA + 2;                                /* r1,r2 | A* | t1,t2 */
  const sites = [-1, 0, a-1, a];
  const Vj = j => (j >= 0 && j <= a-1) ? V0 : 0;
  /* 站点 j 的 (ψ1, ψ2)，x=[r1,r2,A...,t1,t2]（复数对），inc=入射幅值 */
  function psi(j, x, inc){
    if (j <= -1){
      const e1 = [Math.cos(k1*j), Math.sin(k1*j)];
      const e2 = [Math.cos(-k1*j), Math.sin(-k1*j)];
      const e3 = [Math.cos(k2*j), Math.sin(k2*j)];
      const p1 = [inc*e1[0] + x[0][0]*e2[0] - x[0][1]*e2[1] + x[1][0]*e3[0] - x[1][1]*e3[1],
                  inc*e1[1] + x[0][0]*e2[1] + x[0][1]*e2[0] + x[1][0]*e3[1] + x[1][1]*e3[0]];
      const p2 = [s*(inc*e1[0] - x[0][0]*e2[0] + x[0][1]*e2[1] + x[1][0]*e3[0] - x[1][1]*e3[1]),
                  s*(inc*e1[1] - x[0][0]*e2[1] - x[0][1]*e2[0] + x[1][0]*e3[1] + x[1][1]*e3[0])];
      return [p1, p2];
    }
    if (j <= a-1){
      let p1 = [0,0], p2 = [0,0];
      for (let i=0; i<nA; i++){
        const [q, sre, sim] = modes[i];
        const e = [Math.cos(q*j), Math.sin(q*j)];
        const A = x[2+i];
        const Ae = _cmul(A, e);
        p1 = [p1[0]+Ae[0], p1[1]+Ae[1]];
        const sAe = _cmul([sre, sim], Ae);
        p2 = [p2[0]+sAe[0], p2[1]+sAe[1]];
      }
      return [p1, p2];
    }
    const ja = j - a;
    const e1 = [Math.cos(k1*ja), Math.sin(k1*ja)];
    const e3 = [Math.cos(k3*ja), Math.sin(k3*ja)];
    const t1 = x[n-2], t2 = x[n-1];
    const p1 = _cmul(t1, e1), p1b = _cmul(t2, e3);
    const p2 = [_cmul(t1, e1)[0] - p1b[0], _cmul(t1, e1)[1] - p1b[1]];
    return [[p1[0]+p1b[0], p1[1]+p1b[1]], [s*p2[0], s*p2[1]]];
  }
  /* 站点递推残差（2 复数方程/站点）：
     Z1 = ψ2_{j+1}−ψ2_{j−1} − 2i(E−m−V_j)·ψ1_j
     Z2 = ψ1_{j+1}−ψ1_{j−1} − 2i(E−V_j+m)·ψ2_j
     2i·c·(zr+izi) = (−2c·zi, 2c·zr) ⟹
     Re Z = Re(ψ_{j+1})−Re(ψ_{j−1}) + 2c·Im(ψ_j)，
     Im Z = Im(ψ_{j+1})−Im(ψ_{j−1}) − 2c·Re(ψ_j) */
  function resid(j, x, inc){
    const [pm1a, pm1b] = psi(j-1, x, inc), [p0a, p0b] = psi(j, x, inc), [pp1a, pp1b] = psi(j+1, x, inc);
    const c1 = E - m - Vj(j), c2 = E - Vj(j) + m;
    return [
      [pp1b[0]-pm1b[0] + 2*c1*p0a[1], pp1b[1]-pm1b[1] - 2*c1*p0a[0]],
      [pp1a[0]-pm1a[0] + 2*c2*p0b[1], pp1a[1]-pm1a[1] - 2*c2*p0b[0]],
    ];
  }
  const M = [], b = [];
  for (let col=0; col<n; col++){
    const x = Array.from({length:n}, () => [0,0]);
    x[col] = [1,0];
    const rows = [];
    for (const j of sites){ const r = resid(j, x, 0); rows.push(r[0], r[1]); }
    M.push(rows);
  }
  {
    const x = Array.from({length:n}, () => [0,0]);
    for (const j of sites){ const r = resid(j, x, 1); b.push([-r[0][0], -r[0][1]], [-r[1][0], -r[1][1]]); }
  }
  /* M 是 n×8（列=未知量、行=方程），转置为 8×n 供 _cLstsq */
  const MT = Array.from({length:8}, (_, r) => M.map(col => col[r]));
  const sol = _cLstsq(MT, b);
  if (!sol) return null;
  const r1 = sol[0], r2 = sol[1], t1 = sol[n-2], t2 = sol[n-1];
  const T = (t1[0]*t1[0]+t1[1]*t1[1]) + (t2[0]*t2[0]+t2[1]*t2[1]);
  const R = (r1[0]*r1[0]+r1[1]*r1[1]) + (r2[0]*r2[0]+r2[1]*r2[1]);
  return { T, R };
}

registerKernel(new DiracKernel());
