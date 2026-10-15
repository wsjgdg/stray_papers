/* ============================================================================
 * PhysicsKernel —— 物理内核契约
 *
 * 引擎（core/app.js）负责一切与物理无关的事务：DOM、GL 资源、KDK 积分循环、
 * 渲染管线、交互、HUD、URL 参数、调试句柄。内核只提供四样东西：
 *
 *   1. shaders()   —— GLSL 注入点（见下方 TPL_* 模板的 {{TOKEN}}）：
 *        uniforms                    GLSL uniform 声明串（如 'uniform float uG;'），
 *                                     注入三个模板的 uniform 区，由 setUniforms 赋值
 *        localH(vec4 c, float V) 域内的代码片段，返回 H·c 的局部（非导数）部分。
 *            薛定谔:  V*c                    （V 由引擎注入）
 *            NLS:     (V - uG*dot(c.xy,c.xy))*c    （uG>0 = focusing，见 nls.js 符号约定）
 *            Pauli:  V*c - uK*σ·B·c        （4 通道实线性积，含 σ_y 耦合）
 *        注：TPL_EVOLVE 实现的是一阶系统 w' = J·M·w（w=(x₁,y₁,x₂,y₂) 交错布局，
 *        J 为复结构）——localH 只需给出 M·c 的全通道积，对任意实线性算符成立
 *        （Pauli 的 σ·B 含自耦合，无需引擎模板改动）。
 *        density(vec4 psi)      → float，|ψ|²（可跨分量求和）
 *        kinetic(vec4 dxp, vec4 dyp) → float，动能密度（引擎已备好 4 阶中心差分）
 *        potential(vec4 psi, float V) → float，势能密度（含非线性平均场项；
 *            Pauli 的势能密度含塞曼自旋能 −uK·⟨ψ|σ·B|ψ⟩，用 reduce 循环内世界坐标 x）
 *        pmeanX/pmeanY（可选）  → float，⟨p_x⟩/⟨p_y⟩ 密度（默认复标量
 *                                     Im(ψ*∂ψ)，pairs 感知；与 kinetic 同 4 阶算子，
 *                                     不确定原理 HUD 的 Δk 均值项来源）
 *        pixelColor(vec4 psi)   → vec3，可选，覆盖默认「色相=相位」映射
 *   2. makeWave(grid, p) → { data, sum }，CPU 端生成初始波函数（pairs*2 个 float/格）。
 *      p = { fx, fy, kx, ky, sigma, m, spinTheta?, spinPhi? }：m=state.m（Dirac
 *      的正能旋量依赖裸质量）；自旋角由引擎从 state 透传（无此概念的内核忽略；
 *      Pauli 的布洛赫分解 cos(θ/2)|↑⟩+e^{iφ}sin(θ/2)|↓⟩）。
 *      引擎负责归一化与等份叠加（add 分支全通道求和，pairs 通用）。
 *   3. presets()  → { key: { name, text, build(paint), wave:[fx,fy,kx,ky], params? } }
 *        build(paint)：paint = { vctx, vGray }，在 256² 势场画布上作画
 *        params：预设附加状态（如 NLS 的 { g:2.5, sigma:5 }），加载时并入 state
 *   4. 其余元数据：id / name / equation / pairs / defaults / extraControls /
 *      setUniforms / applyParams / eMaxExtra
 *      extraControls(reinit, refreshParamHud)：引擎注入两个行为回调，rows 的
 *      after 按参数语义选用——初相类参数（Pauli 自旋角）用 reinit（按 lastWave
 *      重发波包）；参数派生 HUD（B 场读数）用 refreshParamHud（暂停时也即时）。
 *   5. energyLevels(state) → 可选，返回解析能级阶梯 { kind, param, nearest(E)→{label,e,d} }
 *      （HUD「E → 最近能级」对照用）；无解析谱的内核返回 null（HUD 隐藏该区）。
 *      单位与引擎一致：格点单位、ℏ=1、m=state.m。
 *   6. transmissionModel(state) → 可选，返回矩势垒透射的解析模型
 *      { T(E,V0,a), convolved(kx,dk,V0,a) }（「透射率扫描」工具的理论曲线与
 *      Δk 卷积期望）；无解析模型的内核返回 null（扫描面板隐藏）。单位与引擎
 *      一致：格点单位、ℏ=1、m=state.m。薛定谔内核落地；Pauli 仅 B=0 时委托
 *      同一模型（V 自旋无关 ⟹ 透射率逐字一致），B≠0 时自旋-空间耦合无线性
 *      公式，返回 null（诚实门控）。NLS/GP 的非线性项使线性透射模型失效。
 *   7. spinReadout / spinRead(rawSum)（可选，多复分量内核）：spinReadout=true
 *      时引擎显示 HUD 自旋区（⟨σx⟩/⟨σy⟩/⟨σz⟩/|⟨σ⟩| + B 场行）与调试句柄
 *      window.__app.spin。spinRead 接收引擎 spinSum() 的原始求和
 *      { re12=ΣRe(ψ₁*ψ₂), im12=ΣIm(ψ₁*ψ₂), n1=Σ|ψ₁|², n2=Σ|ψ₂|², P }，
 *      返回布洛赫向量 { sx, sy, sz, len }——物理公式在内核侧，引擎只做
 *      readPixels 求和（app.js 不含物理公式的架构洁癖）。
 *   8. cpuDensity(buf, i)：CPU 端 |ψ|²（调试/测量句柄：probSplit/com/moments/
 *      fieldStats/rowScan/manualPass/probSum/psiBlobs/psiArgmax 全部经此）。
 *      基类默认只算前两通道（pairs=1）；pairs=2 内核须覆盖为四通道平方和。
 *
 * 波函数纹理格式由 pairs 决定：1 → RG32F（单复分量），2 → RGBA32F（双复分量，
 * 自旋/Dirac 用）。引擎所有 shader 按 vec4 泛型书写：RG32F 采样得 (r,g,0,1)，
 * 多余的 zw 通道在写回 RG32F 附件时被丢弃，数值与逐字等价。
 *
 * 已覆盖的物理族：二阶时间可分离 H(u)=Hv, v'=-Hu 系统（薛定谔/NLS/GP）、
 * 含时外场驱动、AB 磁通（link 相位）、Pauli 自旋（pairs=2 双复分量：localH
 * 给 σ·B 的 4 通道实线性积，引擎模板零改动；自旋读数经 spinReadout 契约）、
 * Dirac 一阶系统（pairs=2：KINETIC_E/kinScale/helpers 三 token，见下）、
 * 3D 体积求解（dim3=true：TPL_EVOLVE3D/TPL_DISPLAY3D，见下）。
 *
 * 3D token（R34 #34 引入；kernel.dim3=true 时 buildShaders 装配 evolve3d +
 *   display3d 两个 program，app.js 走 evolve3d 分支与 volume 显示）：
 *   pot3     —— TPL_EVOLVE3D 的解析势表达式（float，变量 w=p−0.5 世界坐标，
 *               居中域 [−0.5,0.5]³；默认 '0.0' 自由空间）。3D 无势纹理
 *               （笔刷工具不适用 3D）——球垒/谐振子等由预设经此注入。
 *   density3 —— TPL_DISPLAY3D 的体积密度（vec4 c → float；标量默认
 *               dot(c.xy,c.xy)=|ψ|²）。
 *   phase3   —— 体积相位着色（float，弧度；默认 atan(c.y,c.x)）。
 *   helpers  —— 复用 2D 同名注入位（pot3 需函数时在此定义）。
 *   makeWave3d —— 引擎 initWave 调用的 3D 初态生成（n, opts → Float32Array，
 *                 n³·通道数）；2D makeWave 对 dim3 内核不被调用。
 *
 * 一阶系统 token（Dirac 内核 #33 引入；默认值对标量内核逐字等价、回归零风险）：
 *   kineticE —— TPL_EVOLVE 的动能项表达式（默认 '-uK*lap'）。引擎 KDK 骨架
 *              本就是一阶系统 w'=J·M·w（w=(Reψ,Imψ)），Dirac 只需把 M·w 的
 *              导数部分注入：kineticE='diracD(vUv)' 给出 −i·α·∂ψ 的实形 4
 *              通道积（含 AB link 相位分支）。默认路径逐字不变。lap 由引擎级
 *              {{LAP_BLOCK}} token 提供（EVOLVE/CN_RHS/CN_SWEEP 三模板共用，
 *              R33 提取）；覆写 kineticE 为函数时 lap 成死代码被编译器消除。
 *   kinScale —— TPL_REDUCE 动能密度系数（默认 'uK'=1/2m）。Dirac 的 α·p 动能
 *              无 1/2m 因子，覆写 '1.0'。
 *   helpers  —— TPL_EVOLVE 函数定义注入点（S/rot4/ang/wrapPi 之后、main 之前，
 *              可前向引用全部引擎 helper）。kineticE 需语句（多采样+分支）而
 *              非单一表达式时在此定义函数；display/reduce 模板无此注入点
 *              （其片段均为表达式）。
 *   scanEc   —— 可选方法 scanEc(state, kx)：透射率扫描的入射中心能量口径
 *              （默认薛定谔离散色散 2sin²(k/2)/m）。Dirac 覆写为总能量
 *              √(sin²k+m²)（扫描面板 x 轴 V0/E 与模型 T 的 E 同口径）。
 *
 * Aharonov-Bohm 约定（矢势/磁通）：AB 矢势作用在动能项（拉普拉斯）而非势项——
 * backlog 原表述「矢势注入 localH」已按此修正。实现为最小耦合的 link 相位：
 * 5 点拉普拉斯的每条邻格跳变乘上 U = e^{iθ}，θ = ∫A·dl 为沿该 link 的矢势线积分
 * （引擎级 uniform uABOn/uABPos/uABPhi，每帧设置）：
 *   对称规范 A = (Φ/2π)·(−(y−y0), (x−x0)) / r² = (Φ/2π)·dθ（角度 1-形式）。
 *   θ 取**精确线积分**：θ = (Φ/2π)·wrapPi(β(p+Δ)−β(p))，β=atan2(Δy,Δx)
 *   （∫A·dl 沿 link 即张角差，精确；被积分子 (d×Δ) 沿 link 恒定）。
 *   wrapPi 的 (−π,π] 分支切割在螺线管负 x 射线，构成规范弦（纯规范）。
 *   ∮A·dl = Φ：绕螺线管一周的相位即磁通本身——磁场 B 约束在管内（本模型不模拟
 *   管内，只给 link 相位），管外 B=0 而 A≠0，正是 AB 效应的物理舞台。
 * 数值性质（与驱动同等严格的零风险保证）：
 *   Φ=0 时 uABOn=0，走 else 分支的原 5 点 stencil——逐字等价旧路径，回归零风险；
 *   |U|=1 ⟹ link 拉普拉斯每行元素模不变，Gershgorin 谱半径仍 ≤ 8，E_max 不变
 *   （无需像含时外场那样抬稳定界）；
 *   正向与反向 link 共享同一对端点 ⟹ θ 精确反号 ⟹ link 拉普拉斯厄米 ⟹
 *   总概率严格守恒（无钳制、无奇点：atan2 处处有限，格点重合由 ang() 回退兜底）；
 *   Wilson 环 = e^{iΦ} 精确成立（绕管任意环路的相位严格量化）⟹ 算符层面
 *   Φ→Φ+2π 严格规范等价（H(Φ+2π)=G†·H(Φ)·G，G=diag(e^{iβ_v})）——但规范等价
 *   比较的两个演化必须同步变换初态（ψ₀→Gψ₀）；若初态固定不变，Φ 与 Φ+2π
 *   实际比较的是两个不同物理初态（规范 0 语言下为 ψ₀ 与 G†ψ₀），密度图样
 *   不同属预期。CDP 复测（2026-10-13 R26）：初态固定时 I(2π) vs I(0) 相对差
 *   17%（T0=481.2 对齐），且对 substeps 不敏感（6→24 仅 17.3%→15.4%），
 *   证实该差异源于初态未规范变换而非积分误差。早期注释「密度图样逐时刻
 *   不变（CDP 实测到浮点级）」不实，已撤。
 *
 * 实现迭代纪实（诚实记录）：初版 θ 按 link 中点采样 A(mid)·Δ + r²≥4 格² 钳制，
 * 实测两个缺陷——(1) 格心采样（非中点）时正反 link 的 θ 非精确反号，非厄米，
 * P 漂移 3e-4@Φ=π/2；(2) 中点采样虽厄米，但钳制使管心邻近小环路的 Wilson 环
 * 偏离 e^{iΦ}（螺线管格间位置时核心 4-cycle 全部落钳制区，残差 −0.18 rad），
 * Φ→Φ+2π 规范等价被破坏（CDP 实测屏密度差 8.5e-5，为自漂移噪声底的 2.4 倍）。
 * 精确线积分方案同时解决两者：端点角差天然反号（厄米），且绕管环路相位严格
 * =Φ（无钳制残差），分支切割的规范弦对规范不变量无影响。
 *
 * 耗散约定（开放系统）：引擎每帧演化结束后跑 TPL_SCALE pass，对 (u, v) 整场乘
 * e^{-γ·dt}（γ = state.gamma，帧级 uniform）。iψ_t = Hψ + γ 损失项的解为密度
 * e^{-2γt} 衰减；γ<0 为增益。帧级标量衰减数学上精确、与子步数/网格/内核解耦
 * （早期方案把 -iγ 塞进 KDK 的 H，衰减率带 O((γ·dt_sub)²) 误差且与谱耦合，已弃用）。
 *
 * 含时外场约定（AC Stark / 行波驱动）：引擎在 TPL_EVOLVE 内、{{LOCAL_H}} 展开前
 * 对 V 叠加时变项 V_d（uniform uDriveAmp/uDrivePhase/uDriveMode，每帧设置）：
 *   mode 0（均匀 AC Stark）：V_d = A·cos(φ) —— 空间均匀，整体能级周期性移动；
 *   mode 1（x 行波驱动）  ：V_d = A·cos(2πx − φ) —— 空间非均匀，产生周期性
 *                           空间力 F = −∂V_d/∂x = A·2π·sin(2πx − φ)。
 * 相位 φ = ω·(t + dt/2) 由 CPU 按帧中点推算（simTime 派生，无额外累加态，
 * 暂停即冻结、与序列化口径一致）。V_d 为实势 → H 仍厄米 → 总概率严格守恒；
 * 能量 E 不守恒（外场对波包做功）属预期物理，HUD 的 ⟨V⟩/E 仅计绘制势场。
 * A=0 时 V += 0·cos(φ) 为 IEEE 精确恒等（±0.0），厄米路径零改动、回归零风险。
 * 稳定性：E_max 上界须含 |A|（引擎 frame 内已加），否则极端小质量 m 下
 * dt_sub·E_max 可能越过 KDK 稳定极限 2（θ→π 混叠）。
 *
 * CN 积分器约定（Crank-Nicolson + block-Jacobi；kernel.integrator='cn' 时启用，
 * Dirac 与 Pauli 均走此路径）：
 *   KDK 速度 Verlet 要求 M 的通道可对齐分解为 kick/drift 两步（标量内核
 *   u'=-Hv, v'=Hu 恰好满足）。一阶算符 M 若**混合通道**（Dirac 的 α·p 把 ψ₂
 *   导数耦合进 ψ₁ 方程），KDK 映射谱半径 ρ>1（实测 1.0216@dt_sub=0.2, m=1,
 *   1D klein；dt_sub 扫描 0.05→1.0014 … 1.2→1.6922），范数指数爆炸——
 *   结构性失效，非符号/边界细节（见 dirac.js 头注【积分器】节）。常数 σ·B
 *   同族但更轻：σ_x/σ_z 为 (u|v) 分裂下的偶算符 ⟹ ρ=1 精确稳定；σ_y 为
 *   奇算符（u|v 互换）⟹ kick 自耦合 ⟹ ρ=√(1+φ²)（φ=dt_sub·uK·|B_y|，
 *   R32 量化：默认 tilted 预设 +0.122%/900 帧、B_y=0.05 上限 +9.85%/900 帧）
 *   ⟹ Pauli R33 起切 CN 根治。CN 方案 (I−h·G)w_{n+1}=(I+h·G)w_n，h=dt_sub/2，G=−J·M
 *   （J=复结构 (a,b)↦(−b,a)，M 为复线性厄米算符的实形：实对称且 MJ=JM）⟹ G
 *   斜对称 ⟹ Cayley 矩阵严格正交：范数机器精度守恒、无条件稳定。
 *   引擎侧（app.js evolveCN）每子步两个 pass：
 *     cnRhs   ：w_n → rhs = w_n + h·G(w_n)（G=−J·M 全量作用，一遍）
 *     cnSweep ：block-Jacobi 迭代 x ← (I−h·Gloc)⁻¹(rhs + h·Gkin(x))，
 *               Gloc = 局部（非导数）部分；(I−h·Gloc)⁻¹ 闭式解由内核经
 *               {{CN_LOCAL_SOLVE}} 注入（Dirac：βm+V 对角 2×2 块；Pauli：
 *               σ·B Cayley 全 4×4 块），Gkin = 导数耦合项；12 次扫掠收敛
 *               ~1e-9（收缩比 ~0.18/迭代，理论上界 h·‖Mkin‖——h≤dt_sub/2 时远小于 1）。
 *   h=dt_sub/2 的因子 2 是 CN 的正确离散（(I−hG)x=(I+hG)c 两边同 h 等效
 *   Cayley 步长 2h，动力学整体快一倍——klein_td4.py 时间域实测确认，单模
 *   相位率 −2·arctan(hE/2) vs 错值 −2·arctan(hE)）。
 *   纹理约定：cnRhs 读 uPsi（TEX0）；cnSweep 读 uPsi=TEX0（x_k）+ uRhs=TEX2
 *   （rhs 固定），sweep 之间 ping-pong uPsi。uDtHalf = dt_sub/2 每子步一致。
 *   显式路径（KDK）与 CN 路径经 kernel.integrator 分流：'cn' 时 app.js
 *   编译 progCnRhs/progCnSweep、分配 this.rhs target，evolve()/manualPass()
 *   走 CN 分支；其余内核零改动。
 * ========================================================================== */

import { gaussianWave } from './gaussian.js';

/* ---------- KDK 速度 Verlet 骨架（引擎级，{{LOCAL_H}} 由内核注入） ---------- */

/* ---------- 拉普拉斯 stencil 块（引擎级共享 token，TPL_EVOLVE/CN_RHS/CN_SWEEP 共用）----------
   契约（展开处必须满足）：
     - 局部变量 c = texture(uPsi,vUv)（中心 texel；CN_SWEEP 中即 Jacobi 当前迭代 x_k）
     - helper S/rot4/ang/wrapPi 与 uniform uABOn/uABPos/uABPhi/uTexel 已声明
   产出：vec4 lap（5 点 stencil，含 AB 最小耦合 link 相位分支）。
   KINETIC_E 默认 -uK*lap 依赖本块；一阶内核（Dirac）覆写 kineticE 为函数（如
   diracD(vUv)）时 lap 沦为死代码，被编译器消除——行为零变化（R33 起 CN 路径
   的 Pauli 用默认 -uK*lap，必须共享本块而非各自复制，保证 AB 分支单源真值）。 */
const TPL_LAP_BLOCK = `  vec4 lap;
  if(uABOn > 0.5){
    /* 最小耦合 link 相位（精确线积分）：每条邻格跳变乘 U=e^{iθ}，θ=∫A·dl。
       对称规范 A=(Φ/2π)·(−(y−y0),(x−x0))/r² = (Φ/2π)·dθ 是角度 1-形式，
       沿直线 link 的线积分**精确**等于端点视角差：
         θ_link(p→p+Δ) = (Φ/2π)·wrapPi(β(p+Δ) − β(p)),  β(q)=atan2(q.y−y0, q.x−x0)
       （被积函数 (d×Δ)/|d+sΔ|² 分子恒定，积分即张角差——比中点采样 A(mid)·Δ
       的 O(texel²) 近似高高一阶；且 atan2 处处有限，无奇点、无需 r² 钳制。）
       wrapPi 到 (−π,π] 处理 atan2 分支切割（螺线管负 x 射线）：切割处 link 相位
       ≈∓π·Φ/2π 为规范弦（纯规范，密度等规范不变量不受影响；垂直跨弦 link 的
       原始角差 ≈±2π 被 wrap 精确恢复为小值）。ang() 对 |d|²≈0 回退 0 防
       atan2(0,0)（螺线管被工具放到格点上时），保持反向 link 精确反号。
       正向/反向 link 共享同一对端点 ⟹ θ 精确反号 ⟹ link 拉普拉斯严格厄米；
       围绕螺线管的 Wilson 环 = e^{iΦ} **精确**成立（无钳制残差）⟹
       H(Φ+2π)=G†·H(Φ)·G（G=diag(e^{iβ_v})，算符层面规范等价；「密度图样
       逐时刻不变」需初态同步变换 ψ₀→Gψ₀，初态固定时 I(2π) vs I(0) 差 17%
       属预期——R26 CDP 复测，详见文件头约定节）。|U|=1 ⟹ 谱半径
       仍 ≤8，E_max 不变。 */
    float cAB = uABPhi/6.28318530718;
    vec2 dp = vUv - uABPos;
    float b0 = ang(dp);
    vec2 dq;
    dq = vUv + vec2(uTexel.x,0.0) - uABPos;  lap  = rot4(S(vUv+vec2( uTexel.x,0.0)), cAB*wrapPi(ang(dq)-b0));
    dq = vUv - vec2(uTexel.x,0.0) - uABPos;  lap += rot4(S(vUv+vec2(-uTexel.x,0.0)), cAB*wrapPi(ang(dq)-b0));
    dq = vUv + vec2(0.0,uTexel.y) - uABPos;  lap += rot4(S(vUv+vec2(0.0, uTexel.y)), cAB*wrapPi(ang(dq)-b0));
    dq = vUv - vec2(0.0,uTexel.y) - uABPos;  lap += rot4(S(vUv+vec2(0.0,-uTexel.y)), cAB*wrapPi(ang(dq)-b0));
    lap -= 4.0*c;
  } else {
    lap = S(vUv+vec2(-uTexel.x,0.0))+S(vUv+vec2(uTexel.x,0.0))
         + S(vUv+vec2(0.0,-uTexel.y))+S(vUv+vec2(0.0,uTexel.y)) - 4.0*c;
  }`;

const TPL_EVOLVE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPsi;
uniform sampler2D uV;
uniform float uDt;
uniform float uK;
uniform float uUpdateV;   // 1.0 = 更新 v 分量, 0.0 = 更新 u 分量
uniform vec2 uTexel;
uniform float uDriveAmp;    // 含时外场幅值 A（势单位），0 = 关闭（精确恒等）
uniform float uDrivePhase;  // 驱动相位 φ = ω·(t+dt/2)，CPU 每帧按帧中点推算
uniform int   uDriveMode;   // 0 = 均匀 AC Stark A·cos(φ)；1 = x 行波 A·cos(2πx−φ)
uniform float uABOn;        // AB 磁通开关：0 = 原 5 点 stencil（Φ=0 时精确等价）
uniform vec2  uABPos;       // 螺线管位置（世界坐标）
uniform float uABPhi;       // 磁通 Φ（rad，绕行一周总相位；0 = 关闭）
{{UNIFORMS}}
vec4 S(vec2 uv){
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) return vec4(0.0);
  return texture(uPsi,uv);
}
vec2 rot(vec2 p, float a){ float s=sin(a), co=cos(a); return vec2(p.x*co-p.y*s, p.x*s+p.y*co); }
vec4 rot4(vec4 c, float a){ return vec4(rot(c.xy,a), rot(c.zw,a)); }   /* 两复分量同相旋转 */
/* AB link 相位辅助：视角（螺线管格点上 |d|²≈0 回退 0，防 atan2(0,0)）与 (−π,π] wrap */
float ang(vec2 d){ return dot(d,d) < 1e-12 ? 0.0 : atan(d.y, d.x); }
float wrapPi(float a){ if(a > 3.14159265358979) a -= 6.28318530718; if(a < -3.14159265358979) a += 6.28318530718; return a; }
{{HELPERS}}
void main(){
  vec4 c = texture(uPsi,vUv);
{{LAP_BLOCK}}
  float V = (texture(uV,vUv).r*255.0-128.0)/127.0;
  /* 含时外场（实势 → H 厄米 → 概率守恒；A=0 时为 IEEE 精确恒等） */
  V += uDriveAmp * (uDriveMode == 1 ? cos(6.28318530718*vUv.x - uDrivePhase) : cos(uDrivePhase));
  vec4 Hc = {{KINETIC_E}} + {{LOCAL_H}};   /* KINETIC_E 默认 -uK*lap（标量内核逐字等价）；一阶内核（Dirac）注入 -i·α·∂ */
  if(uUpdateV > 0.5){
    o = vec4(c.x, c.y - 0.5*uDt*Hc.x, c.z, c.w - 0.5*uDt*Hc.z);   // v_half/v_new = v - dt/2*H*u
  } else {
    o = vec4(c.x + uDt*Hc.y, c.y, c.z + uDt*Hc.w, c.w);           // u_new = u + dt*H*v_half
  }
}`;

/* 共享色彩映射：相位 arg(ψ) → RGB（h = arg/2π + 0.5）。2D 显示与 3D 体积
   相位着色共用同一份实现（单源真值）——两处若各写一份，π 相位差是否呈互补色
   这种约定就会漂移（R34 首版 3D 自带的 hue2rgb 把相位 0 与 π 都映射到暖白，
   2p_z 双瓣看着同色，与「相位差 π 呈互补双瓣」的文档口径不符）。
   调用口径（与 2D 默认像素色一致）：hsv2rgb(vec3(atan(ψ_y,ψ_x)/2π + 0.5, 0.80, 1.0))。 */
const SNIP_HSV = `vec3 hsv2rgb(vec3 c){
  vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
  rgb = rgb*rgb*(3.0-2.0*rgb);
  return c.z*mix(vec3(1.0),rgb,c.y);
}`;

/* ---------- 3D KDK 速度 Verlet 骨架（引擎级，kernel.dim3=true 时启用）----------
   与 TPL_EVOLVE 同构：一阶系统 w'=J·M·w 的 kick/drift/kick 交叉投影逐字
   一致，仅把 2D 5 点 stencil 换成 3D 7 点、sampler2D 换 sampler3D、按层
   draw（app.js evolve3d：每子步 3 个全卷 pass，每 pass N 次逐层绘制）。
   边界：texture CLAMP_TO_EDGE（Neumann 零梯度）——与 2D 的 S() 越界返回 0
   （Dirichlet）**不同**，3D 下波包触壁软反射；有界势（谐振子）场景更物理。
   势：无 3D 势纹理（笔刷工具不适用 3D），由内核经 pot3 注入解析势
   （表达式变量 w = p−0.5，世界坐标 ∈ [−0.5,0.5]³；无驱动/AB——3D 路径
   暂不支持，预留 UNIFORMS 注入位）。 */
const TPL_EVOLVE3D = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform highp sampler3D uPsi;
uniform float uDt;
uniform float uK;
uniform float uUpdateV;   // 1.0 = 更新 v 分量, 0.0 = 更新 u 分量
uniform vec3 uTexel3;     // (1/N, 1/N, 1/N)
uniform float uLayer;     // 当前绘制层 z ∈ (0,1)（层中点）
uniform float uGrid3;     // N（格点数；世界坐标 = (p−0.5)·N，格点单位）
{{UNIFORMS}}
vec4 S(vec3 p){ return texture(uPsi, clamp(p, vec3(0.0), vec3(1.0))); }
{{HELPERS}}
void main(){
  vec3 p = vec3(vUv, uLayer);
  vec4 c = S(p);
  vec3 e = uTexel3;
  vec4 lap = S(p+vec3(e.x,0.0,0.0)) + S(p-vec3(e.x,0.0,0.0))
           + S(p+vec3(0.0,e.y,0.0)) + S(p-vec3(0.0,e.y,0.0))
           + S(p+vec3(0.0,0.0,e.z)) + S(p-vec3(0.0,0.0,e.z)) - 6.0*c;
  vec3 w = (p - 0.5)*uGrid3;                         /* 世界坐标（格点单位，居中） */
  float V = {{POT3}};
  vec4 Hc = -uK*lap + V*c;                           /* 标量：势逐通道同乘 */
  if(uUpdateV > 0.5){
    o = vec4(c.x, c.y - 0.5*uDt*Hc.x, c.z, c.w - 0.5*uDt*Hc.z);   // v_half/v_new = v - dt/2*H*u
  } else {
    o = vec4(c.x + uDt*Hc.y, c.y, c.z + uDt*Hc.w, c.w);           // u_new = u + dt*H*v_half
  }
}`;

/* ---------- 3D 显示：volume ray-march（引擎级，kernel.dim3=true 时启用）----------
   发射-吸收模型：密度由内核 density3 注入（vec4 c → float，经函数 den3 单点
   注入——切片与 ray-march 两条路径共用；相位 phase3 同理经 ph3 注入）。
   相机轨道（θ/φ/dist）在 shader 内计算射线，单位立方体 [-0.5,0.5]³ slab 求交，
   固定步数（uSteps）+ 透射率提前退出。切片模式（uSlice>0.5）退化为 z=uSliceZ
   的 2D 密度切片（调试/低成本视图）。步数成本实测极低（R34 spike：8→32 步
   仅 +15ms@400×300 SwiftShader），默认 48。
   注意：注释内勿写带双花括号的 token 名（fill() 重复注入位守卫会拦截，
   R33 教训）——故本注释用 density3/phase3 裸名指代。 */
const TPL_DISPLAY3D = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform highp sampler3D uVol;
uniform float uTheta;      /* 相机方位角 */
uniform float uPhi;        /* 相机极角（钳制 ±1.45 rad，防 cross 退化） */
uniform float uDist;       /* 相机距（世界单位） */
uniform float uAspect;     /* 画布宽高比 W/H（标量，见 app.js frame3d 的圆像推导） */
uniform int   uSteps;
uniform float uDensity;    /* 曝光/密度标度 */
uniform float uPhaseColor; /* 0 = 单色热度, 1 = 相位着色 */
uniform float uSlice;      /* 0 = ray-march, 1 = z 切片 */
uniform float uSliceZ;     /* 切片层 z ∈ [0,1] */
{{UNIFORMS}}
/* 单点注入：den3/ph3 两条渲染路径（切片 / ray-march）共用同一函数体 */
float den3(vec4 c){ return {{DENSITY3}}; }
float ph3(vec4 c){ return {{PHASE3}}; }
{{HSV}}
void main(){
  /* ---- 切片模式：z=uSliceZ 平面密度 ---- */
  if(uSlice > 0.5){
    vec4 c = texture(uVol, vec3(vUv, uSliceZ));
    float d = den3(c);
    float ph = ph3(c);
    vec3 col = uPhaseColor > 0.5 ? hsv2rgb(vec3(ph/6.28318530718+0.5, 0.80, 1.0)) : vec3(1.0,0.75,0.35);
    o = vec4(col*clamp(d*uDensity*2.2, 0.0, 1.0), 1.0);
    return;
  }
  /* ---- ray-march：轨道相机 ---- */
  float ct = cos(uTheta), st_ = sin(uTheta), cp = cos(uPhi), sp = sin(uPhi);
  vec3 ro = uDist*vec3(cp*ct, sp, cp*st_);
  vec3 fwd = normalize(-ro);
  vec3 right = normalize(cross(fwd, vec3(0.0,1.0,0.0)));
  vec3 up = cross(right, fwd);
  vec2 ndc = (vUv-0.5)*2.0;
  vec3 rd = normalize(fwd*1.6 + right*ndc.x*uAspect*0.5 + up*ndc.y*0.5);
  vec3 t0 = (vec3(-0.5)-ro)/rd, t1 = (vec3(0.5)-ro)/rd;
  vec3 tn = min(t0,t1), tf = max(t0,t1);
  float tEnter = max(max(tn.x,tn.y),tn.z), tExit = min(min(tf.x,tf.y),tf.z);
  if(tEnter > tExit){ o = vec4(0.015,0.02,0.035,1.0); return; }
  tEnter = max(tEnter, 0.0);
  float dt = (tExit-tEnter)/float(uSteps);
  vec3 acc = vec3(0.0);
  float trans = 1.0;
  for(int i=0;i<uSteps;i++){
    vec3 p = ro + rd*(tEnter + (float(i)+0.5)*dt);
    vec4 c = texture(uVol, p+0.5);
    float d = den3(c);
    float ph = ph3(c);
    vec3 col = uPhaseColor > 0.5 ? hsv2rgb(vec3(ph/6.28318530718+0.5, 0.80, 1.0)) : vec3(1.0,0.72,0.32);
    float a = 1.0 - exp(-d*uDensity*dt*14.0);
    acc += trans*a*col;
    trans *= 1.0-a;
    if(trans < 0.004) break;
  }
  o = vec4(acc + trans*vec3(0.015,0.02,0.035), 1.0);
}`;

/* ---------- CN 积分器（Crank-Nicolson + block-Jacobi；kernel.integrator='cn'）----------
   动机：KDK 速度 Verlet 要求 M 通道对齐（本征基可按 kick/drift 两通道投影分解为
   逐模态 2×2 旋转）。Dirac 的 M=α·p+βm+V **混合通道**（α·p 把 ψ₂ 的导数耦合进
   ψ₁ 的方程）⟹ KDK 映射谱半径 ρ>1（实测 1.0216@dt_sub=0.2、1D m=1），范数指数
   爆炸——结构性失效，非符号/边界细节（详见 dirac.js 文件头【积分器】节）。
   常数 σ·B 同族但更轻：σ_x/σ_z 偶算符 ρ=1 精确、σ_y 奇耦合 ρ=√(1+φ²)
   （φ=dt_sub·uK·|B_y|，R32 量化）⟹ Pauli 内核 R33 起切 CN（见 pauli.js）。
   CN：(I−h·G)w_{n+1}=(I+h·G)w_n，h=dt_sub/2（注意每子步推进 2h=dt_sub——uDtHalf
   约定），G=−J·M（J=复结构 (a,b)↦(−b,a)，M 为复线性厄米算符的实形：实对称且
   MJ=JM）⟹ G 斜对称 ⟹ Cayley 矩阵严格正交：范数机器精度守恒、无条件稳定。
   两个 pass 每子步执行（app.js evolveCN）：
     TPL_CN_RHS   ：w_n → rhs = w_n + h·G(w_n)（G=−J·M，局部+导数全量；一遍）
     TPL_CN_SWEEP ：block-Jacobi 迭代 x ← (I−h·Gloc)⁻¹(rhs + h·Gkin(x))，
                    Gloc = 局部（非导数）部分；(I−h·Gloc)⁻¹ 闭式解由内核经
                    CN_LOCAL_SOLVE 注入位注入（函数 cnLocalSolve(arg, V)），
                    Gkin = 导数耦合项；不动点即精确 CN 系统（收敛 ⟹ 正交），
                     Jacobi 只是把 Gkin(x) 滞后近似的迭代求解器。
   Jacobi 截断实测（R33，numpy float64 逐字复刻 16200 子步）：
     - Dirac：Gkin=α·p 一阶导数，收缩 ~0.18/迭代 ⟹ 12 扫掠截断 ~1e-9/步
     - Pauli：Gkin=−uK·lap 二阶拉普拉斯（σ·B 全进 Gloc），谱半径界
       h·uK·8=0.4（与网格无关的格点单位）；但平滑波包的高频内容指数衰减
       （高斯 σ=7 在 k=π/4 处幅值 e^-15）⟹ 误差注入 ≈0，实测 12 扫掠与
       精确 CN（Fourier 逐模态 Cayley）均 +6.4e-13/16200 步——截断可忽略。
     - GPU（RGBA32F 纹理管线，float32）另有一层舍入积累：Pauli 四案例
       1620 sim-time 实测 +0.1492%/+0.1228%/−0.0099%/+0.0272%（无系统偏向、
       量级 ~0.1%，60fps 交互时标下 <0.01%，不可见）；Dirac 同管线 +0.0099%。
       要压低需更多扫掠或 float64 累加 reduce——代价/收益不成比例，如实标注。
   token 与 TPL_EVOLVE 同套（KINETIC_E/LOCAL_H/HELPERS/UNIFORMS/LAP_BLOCK + CN_LOCAL_SOLVE），
   S/rot4/ang/wrapPi 与驱动/AB uniform 逐字复制。纹理约定：uPsi=TEXTURE0（sweep 加
   uRhs=TEXTURE2）、uV=TEXTURE1。uMass/uB 等内核私有 uniform 经 {{UNIFORMS}} 注入
   （Dirac：βm+V 对角 2×2 块；Pauli：σ·B Cayley 全 4×4 块——见各自 cnLocalSolve）。 */
const TPL_CN_RHS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPsi;
uniform sampler2D uV;
uniform float uDtHalf;      /* h = dt_sub/2（CN 半步） */
uniform vec2 uTexel;
uniform float uK;           /* 1/2m（Pauli 的 localH 用；Dirac 不用，被优化掉） */
uniform float uDriveAmp;
uniform float uDrivePhase;
uniform int   uDriveMode;
uniform float uABOn;
uniform vec2  uABPos;
uniform float uABPhi;
{{UNIFORMS}}
vec4 S(vec2 uv){
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) return vec4(0.0);
  return texture(uPsi,uv);
}
vec2 rot(vec2 p, float a){ float s=sin(a), co=cos(a); return vec2(p.x*co-p.y*s, p.x*s+p.y*co); }
vec4 rot4(vec4 c, float a){ return vec4(rot(c.xy,a), rot(c.zw,a)); }
float ang(vec2 d){ return dot(d,d) < 1e-12 ? 0.0 : atan(d.y, d.x); }
float wrapPi(float a){ if(a > 3.14159265358979) a -= 6.28318530718; if(a < -3.14159265358979) a += 6.28318530718; return a; }
{{HELPERS}}
void main(){
  vec4 c = texture(uPsi,vUv);
  float V = (texture(uV,vUv).r*255.0-128.0)/127.0;
  V += uDriveAmp * (uDriveMode == 1 ? cos(6.28318530718*vUv.x - uDrivePhase) : cos(uDrivePhase));
{{LAP_BLOCK}}
  vec4 Hc = {{KINETIC_E}} + {{LOCAL_H}};      /* = M·w（实形算符全量作用） */
  vec4 Gc = vec4(Hc.y, -Hc.x, Hc.w, -Hc.z);   /* G = −J_int·M（复结构作用） */
  o = c + uDtHalf * Gc;                        /* rhs = w + h·G(w) */
}`;

const TPL_CN_SWEEP = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPsi;        /* x_k（Jacobi 当前迭代值） */
uniform sampler2D uRhs;        /* rhs = w_n + h·G(w_n)（CN_RHS pass 产物） */
uniform sampler2D uV;
uniform float uDtHalf;
uniform vec2 uTexel;
uniform float uK;           /* 1/2m（Pauli 的 cnLocalSolve 用；Dirac 不用，被优化掉） */
uniform float uDriveAmp;
uniform float uDrivePhase;
uniform int   uDriveMode;
uniform float uABOn;
uniform vec2  uABPos;
uniform float uABPhi;
{{UNIFORMS}}
vec4 S(vec2 uv){
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) return vec4(0.0);
  return texture(uPsi,uv);
}
vec2 rot(vec2 p, float a){ float s=sin(a), co=cos(a); return vec2(p.x*co-p.y*s, p.x*s+p.y*co); }
vec4 rot4(vec4 c, float a){ return vec4(rot(c.xy,a), rot(c.zw,a)); }
float ang(vec2 d){ return dot(d,d) < 1e-12 ? 0.0 : atan(d.y, d.x); }
float wrapPi(float a){ if(a > 3.14159265358979) a -= 6.28318530718; if(a < -3.14159265358979) a += 6.28318530718; return a; }
{{HELPERS}}
{{CN_LOCAL_SOLVE}}
void main(){
  vec4 c = texture(uPsi,vUv);    /* x_k 中心值（lap stencil 的 −4c 项；S() 内部另读 uPsi） */
  vec4 rhs = texture(uRhs,vUv);
  float V = (texture(uV,vUv).r*255.0-128.0)/127.0;
  V += uDriveAmp * (uDriveMode == 1 ? cos(6.28318530718*vUv.x - uDrivePhase) : cos(uDrivePhase));
{{LAP_BLOCK}}
  vec4 Hk = {{KINETIC_E}};                     /* Dirac: diracD(vUv)（内部 S() 读 uPsi=x_k）；Pauli: -uK*lap */
  vec4 Gk = vec4(Hk.y, -Hk.x, Hk.w, -Hk.z);    /* Gkin = −J_int·(α·p 部分) */
  vec4 arg = rhs + uDtHalf * Gk;               /* 正确迭代符号: +（klein_td 数值验证） */
  o = cnLocalSolve(arg, V);   /* 局部块 (I−h·Gloc)⁻¹ 闭式解——函数定义在本 program
                                 的 CN_LOCAL_SOLVE 注入位（HELPERS 之后，见模板头；
                                 Dirac：βm+V 对角 2×2 块，Pauli：σ·B Cayley 全 4×4
                                 块，R33）。教训：注释内勿写带双花括号的 token 名，
                                 fill() 全局替换会把函数源码注入注释、其内部注释结束
                                 符提前关闭外层注释致函数体半沉（R33 CDP 实测崩错，
                                 现由 fill() 重复 token 守卫构建期拦截）。 */
}`;

/* ---------- 耗散（开放系统）：帧级标量衰减 pass ----------
   不在 KDK 的 H 里加非厄米项（那样衰减率带 O((γ·dt_sub)²) 误差，且与谱/子步数耦合），
   而是每帧演化结束后对整场乘 e^{-γ·dt}：数学上精确、与 substeps/m/grid/核全部解耦，
   且 γ=0 时跳过该 pass——厄米演化路径零改动，历史回归零风险。
   γ>0 = 粒子损失（密度 e^{-2γt}）；γ<0 = 增益（增长）。 */
const TPL_SCALE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPsi;
uniform float uScale;
void main(){
  o = texture(uPsi, vUv) * uScale;
}`;

/* ---------- 显示：相位->色相，概率->亮度，等值线，网格，余晖 max 混合 ---------- */
const TPL_DISPLAY = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPsi;
uniform sampler2D uTrail;
uniform sampler2D uV;
uniform float uDecay;
uniform vec2 uPsiTexel;
uniform vec2 uAspect;
uniform float uABOn;        // AB 螺线管标记开关（与演化一致：Φ=0 不画）
uniform vec2  uABPos;       // 螺线管位置（世界坐标）
uniform float uABPhi;       // 磁通 Φ（rad；标记亮度随 |Φ| 增强）
{{UNIFORMS}}
vec4 bilerp(sampler2D t, vec2 uv, vec2 texel){
  vec2 f = fract(uv/texel - 0.5) - 0.5;
  vec2 base = (uv/texel - 0.5 - f)*texel;
  vec4 a = texture(t, base+vec2(0.0,0.0));
  vec4 b = texture(t, base+vec2(texel.x,0.0));
  vec4 c = texture(t, base+vec2(0.0,texel.y));
  vec4 d = texture(t, base+texel);
  return mix(mix(a,b,f.x+0.5), mix(c,d,f.x+0.5), f.y+0.5);
}
{{HSV}}
void main(){
  vec2 wuv = (vUv-0.5)*uAspect + 0.5;
  if(wuv.x<0.0||wuv.x>1.0||wuv.y<0.0||wuv.y>1.0){
    /* 信箱区：暗蓝底 + 世界边缘一圈微光，避免死黑 */
    vec2 dd = abs(vUv-0.5) - vec2(0.5/uAspect.x, 0.5/uAspect.y);
    float outD = max(dd.x, dd.y);
    vec3 bg = vec3(0.012,0.018,0.034) + vec3(0.05,0.11,0.20)*smoothstep(0.010,0.0,outD)*0.8;
    o = vec4(bg,1.0); return;
  }
  vec4 psi = bilerp(uPsi, wuv, uPsiTexel);
  float p = {{DENSITY}};
  vec3 col = {{PIXEL_COLOR}};
  /* 指数饱和 tone map：小 p 段近线性（保结构），大 p 段平滑封顶（不刺眼），
     峰值 |psi|^2 ~ 3e-3 时亮度 ~0.95，彻底解决画面过暗 */
  float lum = 1.0 - exp(-p*1000.0);
  vec3 img = col*lum;
  img += vec3(0.05,0.15,0.24)*lum*0.55;
  /* 势场可视化：势垒暖色 / 势阱冷色，外加等值线——笔刷效果即时可见 */
  float vv = (texture(uV,wuv).r*255.0-128.0)/127.0;
  float av = abs(vv);
  vec3 vcol = vv >= 0.0 ? vec3(0.46,0.14,0.09) : vec3(0.07,0.16,0.42);
  img += vcol*pow(av,0.7)*0.55;
  float vw = max(fwidth(vv)*4.0,1e-4);
  float vl = abs(fract(vv*4.0+0.5)-0.5)/vw;
  img += vec3(0.28,0.34,0.44)*smoothstep(1.2,0.0,vl)*0.22*smoothstep(0.03,0.08,av);
  float w = max(fwidth(p*20.0),1e-4);
  float line = abs(fract(p*20.0+0.5)-0.5)/w;
  img += vec3(0.20,0.28,0.38)*smoothstep(1.3,0.0,line)*0.40*smoothstep(0.002,0.02,p);
  vec2 g = abs(fract(wuv*16.0)-0.5);
  img += vec3(0.07,0.11,0.16)*(1.0-smoothstep(0.47,0.5,max(g.x,g.y)))*0.30;
  vec2 q = vUv-0.5;
  img *= 1.0-0.35*dot(q,q);
  /* AB 螺线管标记：世界坐标圆环（uAspect 修正保证屏幕正圆）+ 核芯微光，
     Φ≠0 时显现（与演化 uABOn 同开关）。磁场约束在管内，管外只有矢势——
     这个环就是「看不见的磁通」的位置标记。 */
  if(uABOn > 0.5){
    vec2 dq = (wuv - uABPos)*uAspect;
    float rr = length(dq);
    float wq = max(fwidth(rr), 1e-4);
    img += vec3(0.55,0.75,1.0)*smoothstep(1.4,0.0,abs(rr-0.035)/wq)*0.9;
    img += vec3(0.35,0.55,0.95)*smoothstep(0.035,0.012,rr)*0.55;
  }
  o = vec4(max(img, texture(uTrail,vUv).rgb*uDecay), 1.0);
}`;

/* ---------- 能量/概率/矩归约：32^2 MRT 三 RGBA32F ----------
   o0：每 texel 打包 (Σp, uK·ΣT, Σp², ΣVp)
   o1：每 texel 打包 (Σx·p, Σy·p, Σx²·p, Σy²·p)（世界坐标概率矩）。
   o2：每 texel 打包 (uK·ΣT_x, uK·ΣT_y, Σ⟨p_x⟩密度, Σ⟨p_y⟩密度)
      （分轴动能 + 分轴均值动量；z/w 为 R28 新增，见下）。
   动能口径（R27 修正）：KINETIC 片段 0.25(|Δψ|²)≈−⟨ψ|lap_d|ψ⟩ 是 **p² 二次型**
   （格点单位、ℏ=1），物理动能 T_phys = uK·ΣT（uK=1/2m，KDK 守恒的离散能量正是
   uK·st+sv）。故 st accumulates uK·KINETIC：st = T_phys·P（物理动能和），
   HUD 显示逐粒子 ⟨T⟩=st/P——旧口径直接累加裸片段（T 项差 2m 倍）标签为「动能」
   不实，已修。⟨p²⟩=2m·⟨T⟩（不确定原理 HUD 的 Δp 来源）。
   轴分解约定：KINETIC 片段须可分离为 f(dxp)+g(dyp)（现有内核均为
   0.25*(dot(dxp,dxp)+dot(dyp,dyp)) 形式）——kinPart(dxp,vec4(0)) 与
   kinPart(vec4(0),dyp) 给出单轴分量，恒有 stx+sty≡st（自校验；不可分离的
   内核会使二者不符）。per-axis 展宽的不确定关系 Δx·Δk_x ≥ ½ 是紧致界：
   2D 高斯波包恰好饱和（单向宽度 σ 配单向展宽 1/2σ），只用总 Δk 会退化成
   保守界 √2·½。
   均值动量口径（R28 修正）：⟨p_x⟩=Im(ψ*∂_xψ) 每 texel 密度求和（PMEANX/Y
   片段，dxp 已是 2∂_xψ 故 ×0.5），与 ⟨p_x²⟩（4 阶 stencil）**同算子**，
   Δk_x=grid·√(⟨p_x²⟩−⟨p_x⟩²) 全 Fourier 一致。旧口径用质心速度 v_c 差分
   （⟨p⟩=m·v_c）测的是离散群速度 ⟨sin k⟩/m 而非 ⟨k⟩——kx=0.09 的波包
   低 0.1%~1.1%（σ 越大差越小，与 sin(kx)·e^{−Δp²/2} 精确吻合），
   与 ⟨k²⟩ 混用使 Δk 虚高（σ=18 时 +2%），已弃用（_momPrev 差分整条移除）。
   矩的用途：Δx²=⟨x²⟩−⟨x⟩²（世界坐标）；k 为世界波数（k=grid·p_格点）。
   x/y 取块内 texel 中心的世界坐标；纹理 v 轴向上，与 readPixels 索引
   （行 0 在底部）一致，世界 y 向上。 */
const TPL_REDUCE = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location=0) out vec4 o0;
layout(location=1) out vec4 o1;
layout(location=2) out vec4 o2;
uniform sampler2D uPsi;
uniform sampler2D uV;
uniform float uGrid;
uniform float uK;      /* =1/2m：动能密度 ×uK → 物理动能（HUD/能级的能量单位） */
{{UNIFORMS}}
/* 轴分解动能（零向量代入法，契约见上）：stx+sty≡st 自校验。
   psi 参数为一阶内核（Dirac）准备——其 KINETIC 片段含 ψ 本身（α·p 动能
   密度 = ⟨ψ|α·p|ψ⟩ 的双线性型）；标量内核的片段只用 dxp/dyp，psi 不被引用。 */
float kinPart(vec4 psi, vec4 dxp, vec4 dyp){ return {{KIN_SCALE}}*{{KINETIC}}; }
void main(){
  vec2 base = floor(vUv*32.0)*8.0;   /* 输出 texel(0-31) -> 输入 8x8 块起点 */
  float sp=0.0, st=0.0, sp2=0.0, sv=0.0;
  float sx=0.0, sy=0.0, sxx=0.0, syy=0.0;
  float stx=0.0, sty=0.0;
  float pmx=0.0, pmy=0.0;   /* Σ⟨p_x⟩/⟨p_y⟩ 密度（Im(ψ*∂ψ)，与 stx 同 4 阶算子） */
  for(int j=0;j<8;j++){
    for(int i=0;i<8;i++){
      vec2 uv = (base+vec2(float(i),float(j))+0.5)/uGrid;
      vec4 psi = texture(uPsi,uv);
      float V = (texture(uV,uv).r*255.0-128.0)/127.0;
      float p = {{DENSITY}};
      /* 4 阶中心差分（2h 标度，与 0.25 因子配套：0.25·dxp² ≈ h²|ψ_x|²）：
         [f(x−2)−8f(x−1)+8f(x+1)−f(x+2)]/6 ≈ 2h·f'，误差 O(h⁴)。
         比 2-texel 中心差分（O(h²)）关键地更准：高斯包络的差分梯度有
         −1/(4σ²) 相对偏差（σ=7 时 Δk 低 0.9%），初始最小不确定态的
         Δx·Δk_x 会显示 0.496 误触 <½ 告警；4 阶后偏差 ~1e-7，饱和值
         精确落在 ½。界外采样（±2 texel）由 CLAMP_TO_EDGE 取边界值，
         Dirichlet 边界 ψ≈0，与「界外=0」等价。 */
      vec4 dxp = (texture(uPsi,uv-vec2(2.0/uGrid,0.0)) - 8.0*texture(uPsi,uv-vec2(1.0/uGrid,0.0))
                + 8.0*texture(uPsi,uv+vec2(1.0/uGrid,0.0)) - texture(uPsi,uv+vec2(2.0/uGrid,0.0)))/6.0;
      vec4 dyp = (texture(uPsi,uv-vec2(0.0,2.0/uGrid)) - 8.0*texture(uPsi,uv-vec2(0.0,1.0/uGrid))
                + 8.0*texture(uPsi,uv+vec2(0.0,1.0/uGrid)) - texture(uPsi,uv+vec2(0.0,2.0/uGrid)))/6.0;
      float x = (base.x+float(i)+0.5)/uGrid;
      float y = (base.y+float(j)+0.5)/uGrid;
      sp += p; sp2 += p*p;
      st  += kinPart(psi, dxp, dyp);
      stx += kinPart(psi, dxp, vec4(0.0));
      sty += kinPart(psi, vec4(0.0), dyp);
      pmx += {{PMEANX}};
      pmy += {{PMEANY}};
      sv += {{POTENTIAL}};
      sx += x*p; sy += y*p; sxx += x*x*p; syy += y*y*p;
    }
  }
  o0 = vec4(sp,st,sp2,sv);
  o1 = vec4(sx,sy,sxx,syy);
  o2 = vec4(stx,sty,pmx,pmy);
}`;

/* 默认像素着色：色相 = 相位 arg(ψ)（取第一复分量），亮度 = 概率密度 */
const DEFAULT_PIXEL_COLOR = 'hsv2rgb(vec3(atan(psi.y,psi.x)/6.2831853+0.5,0.80,1.0))';

/* 默认均值动量片段（复标量；dxp/dyp 为 2∂ψ，故 ×0.5 得 Im(ψ*∂ψ)=|ψ|²∂_xφ）：
   pairs=1 取唯一复分量；pairs=2 两复分量求和（总动量）。 */
const DEFAULT_PMEAN = {
  1: { x: '0.5*(psi.x*dxp.y-psi.y*dxp.x)', y: '0.5*(psi.x*dyp.y-psi.y*dyp.x)' },
  2: { x: '0.5*((psi.x*dxp.y-psi.y*dxp.x)+(psi.z*dxp.w-psi.w*dxp.z))',
       y: '0.5*((psi.x*dyp.y-psi.y*dyp.x)+(psi.z*dyp.w-psi.w*dyp.z))' },
};

/* ---------- 基类：给出全部默认值，子类按需覆盖 ---------- */
export class PhysicsKernel {
  constructor(){
    this.id = 'base';
    this.name = '量子';
    this.equation = '';
    this.pairs = 1;                 /* 复分量对数：1=RG32F，2=RGBA32F */
    this.spinReadout = false;       /* 自旋读数能力（Pauli）：HUD 自旋区 + __app.spin */
  }
  makeWave(){ throw new Error('kernel.makeWave not implemented'); }
  shaders(){ throw new Error('kernel.shaders not implemented'); }
  presets(){ return {}; }
  defaults(){ return {}; }          /* 并入 state 的内核私有参数（如 NLS 的 g） */
  /* 面板附加控件：{ html, rows:[{id,out,key,fmt,after?}] }；
     签名 extraControls(reinit, refreshParamHud)——引擎注入行为回调，rows 的
     after 按参数语义选用（初相类用 reinit，参数派生 HUD 用 refreshParamHud）。 */
  extraControls(){ return null; }
  setUniforms(gl, prog, state){ /* 内核私有 uniform；program 无此 uniform 时 WebGL 静默 no-op */ }
  applyParams(qp, state){ /* URL 参数扩展 */ }
  eMaxExtra(state){ return 0; }     /* H 特征值上界的附加项（非线性项等） */
  /* 解析能级阶梯（可选）：仅对有解析谱的场景返回，见契约第 5 项 */
  energyLevels(state){ return null; }
  /* 透射率扫描解析模型（可选）：{ T(E,V0,a), convolved(kx,dk,V0,a) }，
     无模型返回 null（引擎隐藏扫描面板）。见契约第 6 项。 */
  transmissionModel(state){ return null; }
  /* 均值动量片段（可选覆盖）：默认复标量 Im(ψ*∂ψ)（pairs 感知，见 DEFAULT_PMEAN）。
       不确定原理 HUD 的 ⟨p⟩ 来源；多分量/耦合内核可改（如相对论性动量）。 */
  pmeanSnippets(){
    const d = DEFAULT_PMEAN[this.pairs] || DEFAULT_PMEAN[1];
    return { pmeanX: d.x, pmeanY: d.y };
  }
  cpuDensity(buf, i){ return buf[i]*buf[i] + buf[i+1]*buf[i+1]; } /* 调试句柄用 */
}

/* ---------- 注册表 ---------- */
const registry = new Map();
export function registerKernel(k){ registry.set(k.id, k); }
export function getKernel(id){ return registry.get(id) || registry.get('schrodinger'); }
export function kernelIds(){ return [...registry.keys()]; }

/* ---------- 着色器装配：模板 + 内核片段 → 三个可编译 program 源码 ---------- */
export function buildShaders(kernel){
  const s = kernel.shaders();
  const need = { LOCAL_H: s.localH, DENSITY: s.density, KINETIC: s.kinetic, POTENTIAL: s.potential };
  for (const [k, v] of Object.entries(need)){
    if (typeof v !== 'string' || !v.trim()) throw new Error('kernel "' + kernel.id + '" missing shader snippet: ' + k);
  }
  /* KINETIC_E / KIN_SCALE / HELPERS：可选覆盖（一阶内核 Dirac 用）。
     KINETIC_E = 演化模板的动能项（默认 -uK*lap，即标量拉普拉斯路径逐字不变）；
     KIN_SCALE = reduce 模板动能密度的系数（默认 uK = 1/2m；Dirac 的 α·p 动能
     无 1/2m 因子，覆写为 1.0）；
     HELPERS = TPL_EVOLVE 的函数定义注入点（S/rot4/ang/wrapPi 之后、main 之前，
     可引用全部引擎 helper）——kineticE 需要语句（多采样 + 分支）而不能是单一
     表达式时在此定义函数。默认 ''，标量内核路径零改动。 */
  const opt = { KINETIC_E: s.kineticE || '-uK*lap', KIN_SCALE: s.kinScale || 'uK', HELPERS: s.helpers || '' };
  /* 内核私有 uniform 声明（如 NLS: 'uniform float uG;'）——注入三个模板的 uniform 区，
     由 kernel.setUniforms() 逐帧赋值；program 中未引用时被编译器优化掉，取值返回 null。 */
  const uni = s.uniforms || '';
  const pm = kernel.pmeanSnippets();
  const fill = (tpl, map) => {
    /* 重复 token 守卫：fill() 是全局替换，模板注释里误写 {{TOKEN}} 会把片段源码
       注入注释、片段内部的注释结束符会提前关闭外层注释，致函数体半沉成活代码
       （R33 CDP 实测：TPL_CN_SWEEP 注释内的 {{CN_LOCAL_SOLVE}} 引发
       'h'/'Bz' undeclared 崩错）。构建期拒绝重复注入位，杜绝该类静默损坏。 */
    const counts = {};
    for (const m of tpl.matchAll(/\{\{(\w+)\}\}/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
    for (const k in counts) if (counts[k] > 1)
      throw new Error('template token {{' + k + '}} appears ' + counts[k] + ' times (duplicate injection point)');
    return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => {
      if (!(k in map)) throw new Error('unknown template token: ' + k);
      return map[k];
    });
  };
  const out = {
    evolve: fill(TPL_EVOLVE, { ...need, ...opt, UNIFORMS: uni, LAP_BLOCK: TPL_LAP_BLOCK }),
    display: fill(TPL_DISPLAY, {
      DENSITY: s.density,
      PIXEL_COLOR: s.pixelColor || DEFAULT_PIXEL_COLOR,
      UNIFORMS: uni,
      HSV: SNIP_HSV,
    }),
    reduce: fill(TPL_REDUCE, { ...need, ...opt, UNIFORMS: uni, PMEANX: pm.pmeanX, PMEANY: pm.pmeanY }),
    scale: TPL_SCALE,
  };
  /* CN 积分器路径（kernel.integrator==='cn'，Dirac/Pauli）：两个额外 program，
     shaders() 返回的对象即 {evolve, display, reduce, scale, cnRhs, cnSweep}。
     app.js 按 sh.cnRhs 是否存在决定编译与 evolveCN 分支。
     cnLocalSolve（必填，缺失即构建失败）：局部块 (I−h·Gloc)⁻¹ 的闭式解——
     注入 TPL_CN_SWEEP 的函数 vec4 cnLocalSolve(vec4 arg, float V)，可引用模板
     uniform（uDtHalf/uK/uTexel）与 {{UNIFORMS}}/{{HELPERS}} 注入的私有内容。
     Dirac 给 βm+V 对角 2×2 块；Pauli 给 σ·B 的 Cayley 全 4×4 块（R33）。 */
  if (kernel.integrator === 'cn'){
    if (typeof s.cnLocalSolve !== 'string' || !s.cnLocalSolve.trim())
      throw new Error('kernel "' + kernel.id + '" (integrator=cn) missing shader snippet: cnLocalSolve');
    out.cnRhs = fill(TPL_CN_RHS, { ...need, ...opt, UNIFORMS: uni, LAP_BLOCK: TPL_LAP_BLOCK });
    out.cnSweep = fill(TPL_CN_SWEEP, { ...need, ...opt, UNIFORMS: uni, LAP_BLOCK: TPL_LAP_BLOCK, CN_LOCAL_SOLVE: s.cnLocalSolve });
  }
  /* 3D 路径（kernel.dim3=true，R34）：evolve3d（7 点拉普拉斯 KDK）+ display3d
     （volume ray-march）。pot3 = 解析势表达式（变量 w=p−0.5 世界坐标）；
     density3/phase3 = 体积密度/相位（标量默认 dot(c.xy,c.xy)/atan(c.y,c.x)）。
     app.js 按 sh.evolve3d 是否存在决定编译 3D program 与 evolve3d 分支。 */
  if (kernel.dim3){
    out.evolve3d = fill(TPL_EVOLVE3D, {
      UNIFORMS: uni, POT3: s.pot3 || '0.0', HELPERS: s.helpers || '',
    });
    out.display3d = fill(TPL_DISPLAY3D, {
      UNIFORMS: uni,
      DENSITY3: s.density3 || 'dot(c.xy,c.xy)',
      PHASE3: s.phase3 || 'atan(c.y, c.x)',
      HSV: SNIP_HSV,
    });
  }
  return out;
}

/* 导出模板仅供测试/文档引用（生产路径经 buildShaders 消费） */
export const TEMPLATES = { TPL_EVOLVE, TPL_EVOLVE3D, TPL_DISPLAY3D, SNIP_HSV, TPL_CN_RHS, TPL_CN_SWEEP, TPL_DISPLAY, TPL_REDUCE, TPL_SCALE, TPL_LAP_BLOCK, DEFAULT_PIXEL_COLOR, DEFAULT_PMEAN };
