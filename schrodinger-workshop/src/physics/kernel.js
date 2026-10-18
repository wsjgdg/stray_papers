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
 *   kinetic3 —— TPL_REDUCE3D 的动能密度（float，参数 (c,dxp,dyp,dzp) 为采样
 *               点与三轴前向差分；默认 'dot(dxp,dxp)+dot(dyp,dyp)+dot(dzp,dzp)'
 *               = Σ_axes|Δψ|²，与内核 moments3d 的 CPU 口径逐字一致——两条独立
 *               实现用于对账互证。一阶内核（3D Dirac）可注入覆盖。
 *   helpers  —— 复用 2D 同名注入位（pot3 需函数时在此定义）。
 *   makeWave3d —— 引擎 initWave 调用的 3D 初态生成（n, opts → Float32Array，
 *                 n³·通道数）；2D makeWave 对 dim3 内核不被调用。
 *   cnLocalSolve3 —— 3D CN 积分器的局部块闭式解（R36 #34 backlog ②；函数
 *                 vec4 cnLocalSolve3(vec4 arg, float V)，注入 TPL_CN_SWEEP3D
 *                 的 CN_LOCAL_SOLVE3 位）。提供该 snippet 的内核在 3D 下同时
 *                 挂载 KDK/CN 两条积分路径，运行时由 state.integrator3 切换
 *                 （默认 'kdk' ⟹ 无该 snippet 时行为逐字不变）。
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
 *
 * 3D CN（R36 #34 backlog ②）：dim3 内核提供 cnLocalSolve3 时，buildShaders
 *   追加装配 cnRhs3d/cnSweep3d（TPL_CN_RHS3D/TPL_CN_SWEEP3D）——与 2D CN 同一
 *   (I−hG)w_{n+1}=(I+hG)w_n 方案、同一 block-Jacobi 12 扫掠，差异全在维度：
 *   7 点 stencil（Gkin 谱半径界 h·uK·12）、sampler3D + 逐层 draw（每全卷 pass
 *   = N 次 framebufferTextureLayer）、势经 {{POT3}} 解析注入（无 uV 纹理）、
 *   无驱动/AB uniform。局部块由内核注入：标量薛定谔为 (1+i·h·V)⁻¹ 复平面
 *   Cayley 旋转（schrodinger3d.js）。与 2D 的本质区别：2D 的 CN 是**内核级**
 *   开关（Dirac/Pauli 因 KDK 结构性失效被迫切换），3D 的 CN 是**运行时可选**
 *   （state.integrator3='kdk'|'cn'，面板/URL 切换）——标量 3D 的 KDK 并无缺陷
 *   （R34 已验证守恒），CN 的价值是严格正交性（Cayley）与教学上的积分器对照。
 * ========================================================================== */

import { gaussianWave } from './gaussian.js';

/* AB 螺线管数量上限（R54 多管）：与四个 2D shader 模板内的 #define AB_MAX
   逐字同步（JS↔GLSL 契约，同 R49 MAX_BLOBS 模式——循环上界取编译期常量，
   uABCount 动态 break 截断；任一侧改动必须同步另一侧）。 */
export const AB_MAX = 8;

/* ---------- KDK 速度 Verlet 骨架（引擎级，{{LOCAL_H}} 由内核注入） ---------- */

/* ---------- 拉普拉斯 stencil 块（引擎级共享 token，TPL_EVOLVE/CN_RHS/CN_SWEEP 共用）----------
   契约（展开处必须满足）：
     - 局部变量 c = texture(uPsi,vUv)（中心 texel；CN_SWEEP 中即 Jacobi 当前迭代 x_k）
     - helper S/rot4/ang/wrapPi 与 uniform uABOn/uABPos[]/uABPhi[]/uABCount/uTexel
       及 #define AB_MAX 已声明（四个模板的 uniform 区逐字同款）
   产出：vec4 lap（5 点 stencil，含 AB 最小耦合 link 相位分支）。
   KINETIC_E 默认 -uK*lap 依赖本块；一阶内核（Dirac）覆写 kineticE 为函数（如
   diracD(vUv)）时 lap 沦为死代码，被编译器消除——行为零变化（R33 起 CN 路径
   的 Pauli 用默认 -uK*lap，必须共享本块而非各自复制，保证 AB 分支单源真值）。 */
const TPL_LAP_BLOCK = `  vec4 lap;
  if(uABOn > 0.5){
    /* 多管最小耦合 link 相位（R54）：U(1) 链变量相乘 ⟹ 各管相位**线性相加**。
       每根管以本管位置为心独立贡献 θ_k=(Φ_k/2π)·wrapPi(β_k(p+Δ)−β_k(p))，
       β_k(q)=atan2(q.y−y_k, q.x−x_k)——对称规范 A_k=(Φ_k/2π)·dθ_k 是角度
       1-形式，沿直线 link 的线积分**精确**等于端点视角差（被积函数
       (d×Δ)/|d+sΔ|² 分子恒定，积分即张角差——比中点采样 A(mid)·Δ 的
       O(texel²) 近似高高一阶；且 atan2 处处有限，无奇点、无需 r² 钳制）。
       矢势可加 ⟹ 共位两管 Φ₁,Φ₂ ≡ 单管 Φ₁+Φ₂（Wilson 环 = e^{i(Φ₁+Φ₂)}）；
       float32 下各管 c_k=Φ_k/2π 独立舍入，Σc_k 与 (ΣΦ)/2π 一般相差 ~1ulp——
       如共位双 π 管：2·fround(π/2π)=1.0 与 fround(2π/2π)=1.0 恰相等，但
       一般 Φ 值不保证逐位一致，属系数舍入级差异（物理等价不变）。
       wrapPi 到 (−π,π] 处理 atan2 分支切割（螺线管负 x 射线）：切割处 link
       相位 ≈∓π·Φ/2π 为规范弦（纯规范，密度等规范不变量不受影响；垂直跨弦
       link 的原始角差 ≈±2π 被 wrap 精确恢复为小值）。ang() 对 |d|²≈0 回退 0
       防 atan2(0,0)（螺线管被工具放到格点上时），保持反向 link 精确反号。
       正向/反向 link 共享同一对端点 ⟹ 每管 θ 精确反号 ⟹ link 拉普拉斯严格
       厄米；围绕螺线管的 Wilson 环 = e^{iΦ} **精确**成立（无钳制残差）⟹
       H(Φ+2π)=G†·H(Φ)·G（G=diag(e^{iβ_v})，算符层面规范等价；「密度图样
       逐时刻不变」需初态同步变换 ψ₀→Gψ₀，初态固定时 I(2π) vs I(0) 差 17%
       属预期——R26 CDP 复测，详见文件头约定节）。|U|=1 ⟹ 谱半径仍 ≤8，
       E_max 不变。
       与单管版（R26）的回归关系：count=0 ⟹ uABOn=0 走 else 分支逐位等价旧
       5 点 stencil；count=1 ⟹ 循环体即旧单管体（相位和 0+θ、加法结合序
       一致），max-abs 口径零回归——唯一差异是 IEEE ±0 符号位（0.0+x=x 精确
       除非 x=∓0：邻值精确 0 的边界 texel 或相位精确 0 时可能出现），无任何
       数值/物理意义（JS === 与最大差都不可分辨）。
       循环上界 AB_MAX 为编译期常量，uABCount 动态 break（R49 blobSum 同款
       GLSL ES 3.00 写法）；尾部未用管位不读。 */
    float abPhXp = 0.0, abPhXm = 0.0, abPhYp = 0.0, abPhYm = 0.0;
    for (int k = 0; k < AB_MAX; k++){
      if (k >= uABCount) break;
      float ck = uABPhi[k]/6.28318530718;
      vec2 dk = vUv - uABPos[k];
      float bk = ang(dk);
      abPhXp += ck*wrapPi(ang(vUv + vec2( uTexel.x, 0.0) - uABPos[k]) - bk);
      abPhXm += ck*wrapPi(ang(vUv + vec2(-uTexel.x, 0.0) - uABPos[k]) - bk);
      abPhYp += ck*wrapPi(ang(vUv + vec2( 0.0, uTexel.y) - uABPos[k]) - bk);
      abPhYm += ck*wrapPi(ang(vUv + vec2( 0.0,-uTexel.y) - uABPos[k]) - bk);
    }
    lap = rot4(S(vUv+vec2( uTexel.x,0.0)), abPhXp)
        + rot4(S(vUv+vec2(-uTexel.x,0.0)), abPhXm)
        + rot4(S(vUv+vec2( 0.0, uTexel.y)), abPhYp)
        + rot4(S(vUv+vec2( 0.0,-uTexel.y)), abPhYm) - 4.0*c;
  } else {
    lap = S(vUv+vec2(-uTexel.x,0.0))+S(vUv+vec2(uTexel.x,0.0))
         + S(vUv+vec2(0.0,-uTexel.y))+S(vUv+vec2(0.0,uTexel.y)) - 4.0*c;
  }`;

/* ---------- 3D 拉普拉斯 stencil 块（引擎级共享 token，TPL_EVOLVE3D/CN_RHS3D/CN_SWEEP3D 共用）----------
   R57：3D 模板此前各自内联复制 7 点 stencil（三份），与 R33 确立的「LAP_BLOCK
   单源真值」原则相悖 ⟹ 抽为本 token，AB 分支只有一个真源。
   契约（展开处必须满足）：
     - 局部变量 vec3 p（当前体素 uv，含 uLayer 的 z）、vec3 e = uTexel3（体素步长）
     - 局部变量 vec4 c = S(p)（中心体素）
     - helper rot/rot4/ang/wrapPi（与 2D TPL_LAP_BLOCK 逐字同款）与
       uniform uABOn/uABPos[AB_MAX]/uABPhi[AB_MAX]/uABCount 已声明
   产出：vec4 lap（7 点 stencil，含 3D AB 最小耦合 link 相位分支）。
   与 2D 的维度差异：
     · 5 点 → 7 点（六个邻格 + −6c 中心项，中心项只减一次与管数无关）
     · 磁通管在 3D 是沿 z 轴的**直线**（无限细螺线管），管轴在 xy 平面的
       投影点即 uABPos[k]（vec2）；对称规范 A_k=(Φ_k/2π)·dθ_k 的方位角
       θ_k(q)=atan2(q.y−y_k, q.x−x_k) **与 z 无关** ⟹ ±z 两个 link 的相位
       恒 0（沿管轴平移不改变方位角，与 A_z=0 的规范自洽），只 ±x/±y 四个
       link 携带相位——这是 3D AB 与 2D AB 的唯一结构性差异。
     · 其余数学与 2D 逐字同构：θ 取**精确线积分**（被积函数分子恒定，沿直线
       link 的积分即端点张角差 wrapPi(θ(p+Δ)−θ(p))，比中点采样高一阶且
       atan2 处处有限无奇点）；正反 link 共享同一对端点 ⟹ θ 精确反号 ⟹
       link 拉普拉斯严格厄米；Wilson 环 = e^{iΦ} 精确成立；多管 U(1) 链变量
       相乘 ⟹ 相位线性相加（R54 同构）。
     · 零回归：count=0 ⟹ uABOn=0 走 else 分支，逐位等价 R34–R56 的 3D 路径。 */
const TPL_LAP3D_BLOCK = `  vec4 lap;
  if(uABOn > 0.5){
    float abPhXp = 0.0, abPhXm = 0.0, abPhYp = 0.0, abPhYm = 0.0;
    for (int k = 0; k < AB_MAX; k++){
      if (k >= uABCount) break;
      float ck = uABPhi[k]/6.28318530718;
      vec2 dk = p.xy - uABPos[k];
      float bk = ang(dk);
      abPhXp += ck*wrapPi(ang(p.xy + vec2( e.x, 0.0) - uABPos[k]) - bk);
      abPhXm += ck*wrapPi(ang(p.xy + vec2(-e.x, 0.0) - uABPos[k]) - bk);
      abPhYp += ck*wrapPi(ang(p.xy + vec2( 0.0, e.y) - uABPos[k]) - bk);
      abPhYm += ck*wrapPi(ang(p.xy + vec2( 0.0,-e.y) - uABPos[k]) - bk);
    }
    lap = rot4(S(p+vec3(e.x,0.0,0.0)), abPhXp)
        + rot4(S(p-vec3(e.x,0.0,0.0)), abPhXm)
        + rot4(S(p+vec3(0.0,e.y,0.0)), abPhYp)
        + rot4(S(p-vec3(0.0,e.y,0.0)), abPhYm)
        + S(p+vec3(0.0,0.0,e.z)) + S(p-vec3(0.0,0.0,e.z)) - 6.0*c;
  } else {
    lap = S(p+vec3(e.x,0.0,0.0)) + S(p-vec3(e.x,0.0,0.0))
        + S(p+vec3(0.0,e.y,0.0)) + S(p-vec3(0.0,e.y,0.0))
        + S(p+vec3(0.0,0.0,e.z)) + S(p-vec3(0.0,0.0,e.z)) - 6.0*c;
  }`;

const TPL_EVOLVE = `#version 300 es
precision highp float;
#define AB_MAX ${AB_MAX}
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
uniform float uABOn;        // AB 多螺线管开关：0 = 原 5 点 stencil（count=0 时精确等价）
uniform vec2  uABPos[AB_MAX];   // 各螺线管位置（世界坐标；uABCount 之外不读）
uniform float uABPhi[AB_MAX];   // 各管磁通 Φ（rad，绕行一周总相位；0 = 该管 link 相位恒 0）
uniform int   uABCount;     // 实际管数（编译期常量循环 + 动态 break 截断）
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

/* ---------- 3D 归约：全卷测量（引擎级，kernel.dim3=true 时启用）----------
   WebGL2 无 3D 纹理的 mip/归约链，故采用「线性索引分块」：输出 32²=1024 个
   texel，每个负责 n³/1024 个体素（连续切片，累加与顺序无关），遍历 3D 纹理
   直接采样（邻居差分也精确，无需「层图集」技巧及其跨 tile 边界问题）。
   动能默认取**前向链路** Σ_axes|Δψ|²（1-texel 前向差分，3 轴 × 全分量）——
   与内核 moments3d 的 CPU 口径逐字一致，两条独立实现可逐项对账（2D 的
   TPL_REDUCE 用 4 阶中心差分更准，但 3D 需要与 CPU 同口径才能互证；两者在
   光滑场极限一致，离散差 O(h²) 已文档化）。
   MRT 三附件布局（CPU 侧：o0/o1 前 3 通道求和、o1.w 取 max、o2 求和）：
     o0 = (Σp, uK·ΣT, Σp², ΣVp)
     o1 = (Σx·p, Σy·p, Σz·p, max|ψ|²)         ← 质心为 texel 序号/n 口径
     o2 = (uK·ΣT_x, uK·ΣT_y, uK·ΣT_z, 0)      ← 分轴动能，stx+sty+stz ≡ st 自校验
   注释内勿写带双花括号的 token 名（fill() 重复注入位守卫会拦截，R33 教训）。 */
const TPL_REDUCE3D = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location=0) out vec4 o0;
layout(location=1) out vec4 o1;
layout(location=2) out vec4 o2;
uniform highp sampler3D uPsi;
uniform float uGrid3;   /* n（体素边长） */
uniform float uK;       /* =1/2m：动能密度 ×uK → 物理动能 */
{{UNIFORMS}}
float den3(vec4 c){ return {{DENSITY3}}; }
/* 3D 动能密度（默认前向链路式，与 CPU moments3d 同口径；一阶内核可注入 kinetic3
   覆盖，契约见文件头 3D token 段） */
float kin3(vec4 c, vec4 dxp, vec4 dyp, vec4 dzp){ return {{KINETIC3}}; }
{{HELPERS}}
void main(){
  int n = int(uGrid3 + 0.5);
  ivec2 gi = ivec2(floor(gl_FragCoord.xy));
  int id = gi.y*32 + gi.x;
  int total = n*n*n;
  int per = (total + 1023)/1024;
  float sp=0.0, st=0.0, sp2=0.0, sv=0.0;
  float sx=0.0, sy=0.0, sz=0.0, peak=0.0;
  float stx=0.0, sty=0.0, stz=0.0;
  float inv = 1.0/float(n);
  for(int k=0;k<per;k++){
    int idx = id*per + k;
    if(idx >= total) break;
    int ix = idx - (idx/n)*n;
    int iy = (idx/n) - (idx/(n*n))*n;
    int iz = idx/(n*n);
    vec3 uvw = (vec3(float(ix),float(iy),float(iz))+0.5)*inv;
    vec4 c = texture(uPsi, uvw);
    float p = den3(c);
    /* 前向链路（3 轴）：Neumann 边界由 CLAMP_TO_EDGE 给出 Δ=0（界外取自身） */
    vec4 dxp = texture(uPsi, uvw+vec3(inv,0.0,0.0)) - c;
    vec4 dyp = texture(uPsi, uvw+vec3(0.0,inv,0.0)) - c;
    vec4 dzp = texture(uPsi, uvw+vec3(0.0,0.0,inv)) - c;
    vec3 w = (uvw - 0.5)*float(n);
    float V = {{POT3}};
    sp += p; sp2 += p*p;
    st  += kin3(c, dxp, dyp, dzp);
    stx += kin3(c, dxp, vec4(0.0), vec4(0.0));
    sty += kin3(c, vec4(0.0), dyp, vec4(0.0));
    stz += kin3(c, vec4(0.0), vec4(0.0), dzp);
    sv += V*p;
    sx += float(ix)*inv*p; sy += float(iy)*inv*p; sz += float(iz)*inv*p;
    peak = max(peak, p);
  }
  o0 = vec4(sp, uK*st, sp2, sv);
  o1 = vec4(sx, sy, sz, peak);
  o2 = vec4(uK*stx, uK*sty, uK*stz, 0.0);
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
#define AB_MAX ${AB_MAX}
/* AB 多螺线管（R57，引擎级——与 2D 同款 uniform，3D 磁通管沿 z 轴，
   uABPos[k] 为管轴在 xy 平面的投影点（uv 空间）。同 AB_MAX #define 已在
   2D 模板使用，3D 三个模板各声明一次（GLSL 编译期常量，无链接冲突）。 */
uniform float uABOn;            // 0 = 原 7 点 stencil（count=0 时逐位等价）
uniform vec2  uABPos[AB_MAX];   // 各管轴 xy 投影（uABCount 之外不读）
uniform float uABPhi[AB_MAX];   // 各管磁通 Φ（rad，绕管一周总相位）
uniform int   uABCount;         // 实际管数（编译期常量循环 + 动态 break）
{{UNIFORMS}}
vec4 S(vec3 p){ return texture(uPsi, clamp(p, vec3(0.0), vec3(1.0))); }
/* AB link 相位辅助（与 2D 逐字同款，保证两边数学单源） */
vec2 rot(vec2 p, float a){ float s=sin(a), co=cos(a); return vec2(p.x*co-p.y*s, p.x*s+p.y*co); }
vec4 rot4(vec4 c, float a){ return vec4(rot(c.xy,a), rot(c.zw,a)); }
float ang(vec2 d){ return dot(d,d) < 1e-12 ? 0.0 : atan(d.y, d.x); }
float wrapPi(float a){ if(a > 3.14159265358979) a -= 6.28318530718; if(a < -3.14159265358979) a += 6.28318530718; return a; }
{{HELPERS}}
void main(){
  vec3 p = vec3(vUv, uLayer);
  vec4 c = S(p);
  vec3 e = uTexel3;
  {{LAP3D_BLOCK}}
  vec3 w = (p - 0.5)*uGrid3;                         /* 世界坐标（格点单位，居中） */
  float V = {{POT3}};
  vec4 Hc = -uK*lap + V*c;                           /* 标量：势逐通道同乘 */
  if(uUpdateV > 0.5){
    o = vec4(c.x, c.y - 0.5*uDt*Hc.x, c.z, c.w - 0.5*uDt*Hc.z);   // v_half/v_new = v - dt/2*H*u
  } else {
    o = vec4(c.x + uDt*Hc.y, c.y, c.z + uDt*Hc.w, c.w);           // u_new = u + dt*H*v_half
  }
}`;

/* ---------- 3D CN 积分器（R36 #34 backlog ②；kernel.dim3 且内核提供
   cnLocalSolve3 时装配）----------
   与 2D TPL_CN_RHS/TPL_CN_SWEEP 同一方案（(I−hG)w_{n+1}=(I+hG)w_n，
   h=uDtHalf=dt_sub/2，G=−i·M 复结构作用，G=Gloc+Gkin 的 block-Jacobi 12 扫掠），
   维度差异逐项对照：
     · 5 点 stencil → 7 点（S(p±e_axis)×6 − 6c；Gkin 谱半径界 h·uK·12）
     · sampler2D + vUv → sampler3D + vec3(vUv, uLayer)（逐层 draw，app.js 每全卷
       pass = N 次 framebufferTextureLayer + 全屏三角形）
     · 势纹理 uV → POT3 解析注入（3D 无势画布；无驱动/AB uniform）
     · 局部块闭式解经 CN_LOCAL_SOLVE3 注入（标量薛定谔：(1+i·h·V)⁻¹）
   边界：S() 的 clamp(p,0,1) = CLAMP_TO_EDGE = Neumann 零梯度（与 TPL_EVOLVE3D
   一致；2D CN 的 S() 越界返回 0 是 Dirichlet——两边文档已各自标注）。
   纹理约定（app.js evolveCN3d）：两个 program 的 uPsi=TEX0；cnSweep3d 追加
   uRhs=TEX2（rhs 固定纹理，扫掠期间只读），sweep 之间 psiA3/psiB3 ping-pong。
   注意：注释内勿写带双花括号的 token 名（fill() 重复注入位守卫会拦截，R33 教训）
   ——故本注释用 POT3/CN_LOCAL_SOLVE3 裸名指代。 */
const TPL_CN_RHS3D = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform highp sampler3D uPsi;
uniform float uDtHalf;      /* h = dt_sub/2（CN 半步） */
uniform float uK;
uniform vec3 uTexel3;
uniform float uGrid3;
uniform float uLayer;       /* 当前绘制层 z ∈ (0,1)（层中点） */
#define AB_MAX ${AB_MAX}
/* AB 多螺线管（R57，引擎级——与 2D 同款 uniform，3D 磁通管沿 z 轴，
   uABPos[k] 为管轴在 xy 平面的投影点（uv 空间）。同 AB_MAX #define 已在
   2D 模板使用，3D 三个模板各声明一次（GLSL 编译期常量，无链接冲突）。 */
uniform float uABOn;            // 0 = 原 7 点 stencil（count=0 时逐位等价）
uniform vec2  uABPos[AB_MAX];   // 各管轴 xy 投影（uABCount 之外不读）
uniform float uABPhi[AB_MAX];   // 各管磁通 Φ（rad，绕管一周总相位）
uniform int   uABCount;         // 实际管数（编译期常量循环 + 动态 break）
{{UNIFORMS}}
vec4 S(vec3 p){ return texture(uPsi, clamp(p, vec3(0.0), vec3(1.0))); }
/* AB link 相位辅助（与 2D 逐字同款，保证两边数学单源） */
vec2 rot(vec2 p, float a){ float s=sin(a), co=cos(a); return vec2(p.x*co-p.y*s, p.x*s+p.y*co); }
vec4 rot4(vec4 c, float a){ return vec4(rot(c.xy,a), rot(c.zw,a)); }
float ang(vec2 d){ return dot(d,d) < 1e-12 ? 0.0 : atan(d.y, d.x); }
float wrapPi(float a){ if(a > 3.14159265358979) a -= 6.28318530718; if(a < -3.14159265358979) a += 6.28318530718; return a; }
{{HELPERS}}
void main(){
  vec3 p = vec3(vUv, uLayer);
  vec4 c = S(p);
  vec3 e = uTexel3;
  {{LAP3D_BLOCK}}
  vec3 w = (p - 0.5)*uGrid3;
  float V = {{POT3}};
  vec4 Hc = -uK*lap + V*c;                           /* M·w 全量（标量：势逐通道同乘） */
  vec4 Gc = vec4(Hc.y, -Hc.x, Hc.w, -Hc.z);          /* G = −i·M（复结构作用） */
  o = c + uDtHalf * Gc;                              /* rhs = w + h·G(w) */
}`;

const TPL_CN_SWEEP3D = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform highp sampler3D uPsi;        /* x_k（Jacobi 当前迭代值） */
uniform highp sampler3D uRhs;        /* rhs = w_n + h·G(w_n)（CN_RHS3D pass 产物） */
uniform float uDtHalf;
uniform float uK;
uniform vec3 uTexel3;
uniform float uGrid3;
uniform float uLayer;
#define AB_MAX ${AB_MAX}
/* AB 多螺线管（R57，引擎级——与 2D 同款 uniform，3D 磁通管沿 z 轴，
   uABPos[k] 为管轴在 xy 平面的投影点（uv 空间）。同 AB_MAX #define 已在
   2D 模板使用，3D 三个模板各声明一次（GLSL 编译期常量，无链接冲突）。 */
uniform float uABOn;            // 0 = 原 7 点 stencil（count=0 时逐位等价）
uniform vec2  uABPos[AB_MAX];   // 各管轴 xy 投影（uABCount 之外不读）
uniform float uABPhi[AB_MAX];   // 各管磁通 Φ（rad，绕管一周总相位）
uniform int   uABCount;         // 实际管数（编译期常量循环 + 动态 break）
{{UNIFORMS}}
vec4 S(vec3 p){ return texture(uPsi, clamp(p, vec3(0.0), vec3(1.0))); }
/* AB link 相位辅助（与 2D 逐字同款，保证两边数学单源） */
vec2 rot(vec2 p, float a){ float s=sin(a), co=cos(a); return vec2(p.x*co-p.y*s, p.x*s+p.y*co); }
vec4 rot4(vec4 c, float a){ return vec4(rot(c.xy,a), rot(c.zw,a)); }
float ang(vec2 d){ return dot(d,d) < 1e-12 ? 0.0 : atan(d.y, d.x); }
float wrapPi(float a){ if(a > 3.14159265358979) a -= 6.28318530718; if(a < -3.14159265358979) a += 6.28318530718; return a; }
{{HELPERS}}
{{CN_LOCAL_SOLVE3}}
void main(){
  vec3 p = vec3(vUv, uLayer);
  vec4 c = S(p);                     /* x_k 中心值（lap stencil 的 −6c 项） */
  vec4 rhs = texture(uRhs, p);
  vec3 e = uTexel3;
  {{LAP3D_BLOCK}}
  vec3 w = (p - 0.5)*uGrid3;
  float V = {{POT3}};
  vec4 Hk = -uK*lap;                            /* Gkin = −i·(−uK·lap)：仅导数部分 */
  vec4 Gk = vec4(Hk.y, -Hk.x, Hk.w, -Hk.z);
  vec4 arg = rhs + uDtHalf * Gk;                /* 正确迭代符号: +（与 2D 同，klein_td 数值验证） */
  o = cnLocalSolve3(arg, V);   /* 局部块 (I−h·Gloc)⁻¹ 闭式解——函数定义在本 program
                                 的 CN_LOCAL_SOLVE3 注入位（HELPERS 之后，见模板头；
                                 标量薛定谔：(1+i·h·V)⁻¹ 复平面 Cayley 旋转，R36）。
                                 教训同 R33：注释内勿写带双花括号的 token 名。 */
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
#define AB_MAX ${AB_MAX}
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
uniform vec2  uABPos[AB_MAX];
uniform float uABPhi[AB_MAX];
uniform int   uABCount;
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
#define AB_MAX ${AB_MAX}
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
uniform vec2  uABPos[AB_MAX];
uniform float uABPhi[AB_MAX];
uniform int   uABCount;
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
#define AB_MAX ${AB_MAX}
in vec2 vUv; out vec4 o;
uniform sampler2D uPsi;
uniform sampler2D uTrail;
uniform sampler2D uV;
uniform float uDecay;
uniform vec2 uPsiTexel;
uniform vec2 uAspect;
uniform float uABOn;          // AB 螺线管标记开关（与演化一致：count=0 不画）
uniform vec2  uABPos[AB_MAX]; // 各螺线管位置（世界坐标）
uniform float uABPhi[AB_MAX]; // 各管磁通 Φ（rad）
uniform int   uABCount;       // 实际管数（编译期常量循环 + 动态 break）
uniform int   uABSel;         // 选中管索引（-1 = 无；画金色外环作交互反馈）
uniform vec2  uABCursor;      // R55：放置预览环世界坐标（(-1,-1) = 无预览；仅本 program 有）
uniform float uABDraftPhi;    // R55：草稿磁通（预览环的 Φ 色相/辉光源）
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
  /* AB 螺线管标记（R54 多管 + R55 视觉编码增强）：
     世界坐标圆环（uAspect 修正保证屏幕正圆）+ 核芯辉光 + 规范弦射线 +
     放置预览环；count=0 时不画（与演化 uABOn 同开关）。磁场约束在管内，
     管外只有矢势——这些环就是「看不见的磁通」的位置标记。
     R55 视觉编码（Φ→颜色的映射，多管「分别调参」的直观反馈）：
     - 色相轮：hue = 0.55 + 0.28·fract(Φ/2π)，Φ=0 青 → π 蓝紫 → 2π 紫红，
       周期 2π 与 AB 规范等价周期一致（Φ 与 Φ+2π 同色——物理自洽）
     - 辉光：aglow = 0.30 + 0.50·|sin(Φ/2)|，Φ=π 峰值 0.80、Φ=0/2π 谷值 0.30，
       |sin(Φ/2)| 周期恰为 2π ⟹ Φ=2π 与 Φ=0 辉光相同（规范等价）
     - 规范弦：wrapPi 的 (−π,π] 分支切割在螺线管负 x 世界射线，此处 link
       原始角差 ≈±2π 被 wrap 恢复为小值——弦是纯规范对象（密度等规范不
       变量不受影响），以低 alpha 水平线提示其存在与走向
     - 放置预览环（uABCursor）：flux 工具悬停处的半透明虚影环，色相/辉光
       取草稿 abPhi（放置即得该外观），(-1,-1) 关闭 */
  if(uABOn > 0.5){
    for (int k = 0; k < AB_MAX; k++){
      if (k >= uABCount) break;
      vec2 dq = (wuv - uABPos[k])*uAspect;
      float rr = length(dq);
      float wq = max(fwidth(rr), 1e-4);
      float frac = fract(uABPhi[k]/6.28318530718);
      vec3 acol = hsv2rgb(vec3(0.55 + 0.28*frac, 0.65, 1.0));   /* Φ 色相轮（周期 2π） */
      float aglow = 0.30 + 0.50*abs(sin(uABPhi[k]*0.5));        /* 辉光随 |Φ|（规范等价周期） */
      img += acol*smoothstep(1.4,0.0,abs(rr-0.035)/wq)*0.9;
      img += acol*smoothstep(0.035,0.012,rr)*aglow*0.55;
      /* 规范弦：管左侧（dq.x≤0）水平射线，exp(dq.x·4) 向左 0.25 单位衰减 */
      float str = step(dq.x, 0.0)*smoothstep(0.004,0.0,abs(dq.y))*exp(dq.x*4.0);
      img += vec3(0.45,0.55,0.75)*str*0.12;
      if (k == uABSel){
        img += vec3(1.0,0.82,0.30)*smoothstep(1.1,0.0,abs(rr-0.055)/wq)*0.85;
      }
    }
  }
  /* 放置预览环（R55）：与真环同一套色相/辉光映射，半透明（0.30/0.18）示虚影 */
  if(uABCursor.x >= 0.0){
    vec2 dc = (wuv - uABCursor)*uAspect;
    float rc = length(dc);
    float wc = max(fwidth(rc), 1e-4);
    float fracC = fract(uABDraftPhi/6.28318530718);
    vec3 pcol = hsv2rgb(vec3(0.55 + 0.28*fracC, 0.65, 1.0));
    float pglow = 0.30 + 0.50*abs(sin(uABDraftPhi*0.5));
    img += pcol*smoothstep(1.2,0.0,abs(rc-0.035)/wc)*0.30;
    img += pcol*smoothstep(0.035,0.012,rc)*pglow*0.18;
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
     （volume ray-march）+ reduce3d（全卷 GPU 归约）。pot3 = 解析势表达式
     （变量 w=p−0.5 世界坐标）；density3/phase3 = 体积密度/相位（标量默认
     dot(c.xy,c.xy)/atan(c.y,c.x)）；kinetic3 = 3D 动能密度（默认前向链路式，
     与内核 moments3d 的 CPU 口径一致，供双测量对账）。
     app.js 按 sh.evolve3d 是否存在决定编译 3D program 与 evolve3d 分支。 */
  if (kernel.dim3){
    out.evolve3d = fill(TPL_EVOLVE3D, {
      UNIFORMS: uni, POT3: s.pot3 || '0.0', HELPERS: s.helpers || '',
      LAP3D_BLOCK: TPL_LAP3D_BLOCK,
    });
    out.display3d = fill(TPL_DISPLAY3D, {
      UNIFORMS: uni,
      DENSITY3: s.density3 || 'dot(c.xy,c.xy)',
      PHASE3: s.phase3 || 'atan(c.y, c.x)',
      HSV: SNIP_HSV,
    });
    out.reduce3d = fill(TPL_REDUCE3D, {
      UNIFORMS: uni,
      DENSITY3: s.density3 || 'dot(c.xy,c.xy)',
      POT3: s.pot3 || '0.0',
      KINETIC3: s.kinetic3 || 'dot(dxp,dxp)+dot(dyp,dyp)+dot(dzp,dzp)',
      /* HELPERS（R41）：pot3 需函数定义时在此注入——R41 把单槽势抽成
         pot3Slot() 供两槽叠加，reduce3d 的 ⟨V⟩ 归约必须与 evolve3d 同源 */
      HELPERS: s.helpers || '',
    });
    /* 3D CN（R36）：内核提供 cnLocalSolve3 ⟺ 挂载 CN 路径。与 2D CN 的
       kernel.integrator 内核级开关不同，3D 是运行时切换（state.integrator3，
       面板/URL，默认 'kdk'）——故此处按 snippet 存在性装配，app.js 按
       sh.cnRhs3d 是否存在决定编译与 evolveCN3d 分支；无该 snippet 的 dim3
       内核装配结果与 R34/R35 逐字一致（零回归）。 */
    if (typeof s.cnLocalSolve3 === 'string' && s.cnLocalSolve3.trim()){
      out.cnRhs3d = fill(TPL_CN_RHS3D, { UNIFORMS: uni, POT3: s.pot3 || '0.0', HELPERS: s.helpers || '', LAP3D_BLOCK: TPL_LAP3D_BLOCK });
      out.cnSweep3d = fill(TPL_CN_SWEEP3D, { UNIFORMS: uni, POT3: s.pot3 || '0.0', HELPERS: s.helpers || '', CN_LOCAL_SOLVE3: s.cnLocalSolve3, LAP3D_BLOCK: TPL_LAP3D_BLOCK });
    }
  }
  return out;
}

/* 导出模板仅供测试/文档引用（生产路径经 buildShaders 消费） */
export const TEMPLATES = { TPL_EVOLVE, TPL_EVOLVE3D, TPL_CN_RHS3D, TPL_CN_SWEEP3D, TPL_DISPLAY3D, TPL_REDUCE3D, SNIP_HSV, TPL_CN_RHS, TPL_CN_SWEEP, TPL_DISPLAY, TPL_REDUCE, TPL_SCALE, TPL_LAP_BLOCK, TPL_LAP3D_BLOCK, DEFAULT_PIXEL_COLOR, DEFAULT_PMEAN };
