/* ============================================================================
 * qec.js — R78 量子纠错：3 比特重复码（bit-flip / phase-flip）
 *
 * 3 比特重复码是最小的「真」纠错码：把一个逻辑比特摊到 3 个物理比特上
 *
 *   编码  α|0⟩+β|1⟩  ─CNOT(0→1),CNOT(0→2)─►  α|000⟩+β|111⟩
 *   错误  每个物理比特以概率 p 发生 X（bit-flip）或 Z（phase-flip）
 *   诊断  测两个稳定子 Z₀Z₁、Z₁Z₂（用 ancilla：CNOT(a→q) 再测 a）
 *         综合 (m₀,m₁) 唯一确定「哪个比特翻了」
 *   修正  按综合施加对应的 X（或 Z）
 *   解码  CNOT(1→0),CNOT(2→0) ⟹ q0 恢复成逻辑态
 *
 * 为什么这算「纠错」而不是「容错」：单比特错误**必然**被纠回（3 种位置 + 无错，
 * 综合是 4 → 4 的双射）；双比特错误会被误诊成「第三种单错」，于是把好比特也翻掉
 * ⟹ 逻辑错误。所以 P_L = P(≥2 个错) = 3p²(1−p)+p³ = 3p²−2p³，与未编码的 p
 * 在 **p = 1/2** 处交叉（这就是阈值；更低阈值要靠更多层/更大码距）。
 *
 * phase-flip 码是同一件事在 H 基下的对偶：稳定子换成 X₀X₁、X₁X₂，错误与修正换成 Z。
 * 两个码都只处理**一类**错误——这正是 Shor 9 比特码要把它们串起来的原因（本轮诚实标注）。
 * ========================================================================== */
import { qcNewState, qcApply, qcMeasureQubit, mulberry32, qcQubitRho, qcRhoFidelity, qcExpect, qcFrToggle, qcFrGate } from './qcircuit.js';
import { gnTouched, gnPauli, gnSampleError } from './gatenoise.js';
import { qcnFlipBits, qcnNoiseParams } from './qcnoise.js';

/* ============================================================================
 * R86：门级噪声（把 R80 的 gatenoise.js 接进本模块）
 * ============================================================================
 * R78 的噪声是**静态 i.i.d.** 口径：编码后、解码前，每个数据比特独立以概率 p
 * 翻一次 Pauli。真实硬件不是这样——错误发生在**门执行之后**、跟着门走（R80）。
 * 新增 noise:'gate' 模式（默认 'iid'，与 R78 逐位一致）：
 *
 *   · 每个门作用后，对该门**触及的每个比特**（gnTouched：单比特门 1 个、
 *     CNOT 2 个）以概率 p 注入一个随机 Pauli。谱（spectrum）depolar / x / z，
 *     权重与 gatenoise.js 同一份（depolar = X/Y/Z 各 1/3）。
 *   · 制备（prep）按理想给（R80 的 noisyFrom 约定：输入态视为给定）。
 *   · ancilla 测后不重置——每个 ancilla 只用一次，天然干净（R78 即此结构）。
 *   · noisyPhase:'extract'（默认）只给综合提取段挂故障，与 R78/R79 的
 *     「编码后注错、解码前纠错」口径对齐，对照只看提取线路本身；
 *     'all' 把 encode/extract/decode 全挂上（会看到编码器/解码器自己的故障）。
 *   · **错误机会数**随之改变：i.i.d. 是 3 个（每数据比特一次）；门级是
 *     M = Σ_gates |gnTouched(g)| 个（bitflip 提取段 8、phaseflip 提取段 12、
 *     'all' 口径 16 / 26）。同一个 p，门级模式 P_L 整体更高——
 *     「门的数量 = 错误机会的数量」，这是 R86 的核心教学点。
 *
 * 判定口径（R86 起三条独立路径，任一处写错都会对不上）：
 *   ① 末态探针（flagsynd 同款，qcExpect 共享单源）：修正后、解码前，测 2 个
 *      稳定子 + 3 个逻辑算符的期望，与**理想跑同一条线路**得到的参考值比符号
 *      （signOf：|ref|<0.2 判该分量在参考态上不可观测）。五分类：
 *        perfect  残差 ∈ S（精确）
 *        logic    残差 ∈ N(S)\S（**静默**逻辑错误——容错的真正失败模式）
 *        outside  残差 ∉ N(S)（打出码空间；F<1）
 *        gauge    残差 ∉ N(S) 但 F=1（只有规范比特出错、逻辑完好）
 *        mixed    探针期望非 ±1（本线路态矢纯，实测永不出现）
 *      完备性：E∈N(S)\S ⟹ E=L·s ⟹ 与 L 反对易的逻辑分量符号必翻；参考态上
 *      三个逻辑分量的 Bloch 向量模为 1，至少一个可观测，且每个逻辑陪集至少
 *      翻其中一个可观测分量（|+i⟩ 上 Z_L 不可观但 X_L/Y_L 覆盖全部陪集，
 *      pot86 逐试验断言）。盲区（如 |+⟩ 上的 X_L）对应 F≈1 的非失败，
 *      不需要 F 兜底；F 只用于 gauge/outside 拆分。
 *   ② Pauli 帧（qcFrGate 传播 + 综合征由帧的 x 位**精确预测**）：与 ① 同点
 *      取残差判陪集，作独立对账；预测综合征还与态矢实测值逐位比对
 *      （本线路所有测量对给定故障配置都是确定的——残差恒为 Pauli，
 *      ancilla 测前恒为 Z 本征态，pot86 断言 synMiss ≡ 0）。
 *   ③ DP-over-frames 精确解：帧空间 2^{2·5}=1024 × 综合征 4 个状态，每个门后
 *      按谱分支（不错 / X / Y / Z），测量取帧位、修正查表、解码传播全是帧的
 *      确定函数 ⟹ P_L(p) 是**精确多项式**（零统计误差）。与 MC 在 4σ 内对账，
 *      小 p 展开系数 c₁/c₂ 与单/双故障枚举互校。
 *   单故障枚举（qecFaultSurvey）给一阶系数 c₁（P_L ≈ c₁p + O(p²)），
 *   二阶枚举给 c₂——DP 的小 p 展开必须同时命中两者。
 * ========================================================================== */

/* ============================================================================
 * R108：物理通道噪声（把 R104–R107 的 qcnoise.js 通道族接进本模块）
 * ============================================================================
 * 前两种口径（iid / gate）都是 **Pauli 注入**：错误是离散的 X/Y/Z，帧能精确
 * 跟踪、DP-over-frames 有零统计误差的精确解。真实硬件不是这样——错误是**连续
 * 通道**：弛豫、退相位、热激发、退极化、读出误报。新增 noise:'phys' 口径：
 *
 *   · 表示换成**密度矩阵** ρ（qcnRho，5 比特 32×32；iid/gate 的态矢路径不动，
 *     零回归）。
 *   · 数据错误保留 R78 静态块：编码后、解码前，每个数据比特独立以概率 p 翻一次
 *     spec.err（bitflip 码 X / phaseflip 码 Z）——与 iid 同一机制，P_L 的
 *     3p²−2p³ 骨架因此保留（ε=0 且门通道全关时 phys ≡ iid，见 pot108 A 节）。
 *   · 门通道（noisyPhase 内的每个门作用后，对 gnTouched 的每个比特）：
 *       振幅阻尼 / 热激发 γ=1−e^{−tg/T₁}（peq>0 走 GAD，peq=0 走振幅阻尼）
 *       相位阻尼           λ=1−e^{−tg/T₂}
 *       退极化             p_dep（ρ→(1−p)ρ+(p/3)ΣPρP）
 *     全部来自 qcnoise.js 单一数据源（与 qcircuit 线路页同一份函数、同一组
 *     t1/t2/tg/pd/re/peq 参数名）。
 *   · 读出误差（SPAM）：ancilla 的 Z 测量**量子态仍按理想投影坍缩**，但记录的
 *     经典位以概率 ε 独立翻转（qcnFlipBits）——综合征因此可能错，修正查表用的
 *     是翻后的位。单错不再必纠：p=0 时 P_L = ε(1−ε) ≠ 0（只有 m₀ 被翻才会把
 *     修正打到逻辑比特 q0 上；m₁ / 双翻的错修落在 q1/q2，是规范错误、F=1）。
 *
 * 三个新教学签名（pot108 逐条验证）：
 *   ① 读出底座：p→0 时 P_L → ε(1−ε)（bitflip 与 phaseflip 对偶同值）——与 p
 *      无关的误差底座，存储错误率再低也回不去；DP-over-syndromes 精确（B 节）。
 *   ② 退极化等价：phys 只开 p_dep 时 ≡ gate 退极化谱（通道 = 随机 Pauli 注入
 *      的系综），MC 4σ 对账 + DP 精确折线重合（C 节）——两种表示互相印证。
 *   ③ 非 Pauli 通道无精确解：γ/λ>0 时帧跟踪失效（振幅阻尼不是 Pauli），
 *      qecExactPL 返回 NaN，页面只画 MC 并显式标注（诚实限制）。
 * ========================================================================== */

/* ============================================================================
 * R109：容错读出——k 次重复综合征测量 + 多数表决（readout voting）
 * ============================================================================
 * R108 的读出误差 ε 是**单次**综合征测量的经典翻转：p=0 时底座 ε(1−ε)。
 * 真实硬件（以及 Google/IBM 的表面码实验）的标准对策：每个稳定子**独立重
 * 复测量 k 次**（每次一套 fresh ancilla），对 k 个经典记录做**多数表决**——
 * 表决后的有效读出误差
 *
 *     ε_k = P(k 次独立翻转里 ≥⌈k/2⌉ 次为 1) = Σ_{j≥⌈k/2⌉} C(k,j)ε^j(1−ε)^{k−j}
 *
 *   k=1 ⟹ ε · k=3 ⟹ 3ε²−2ε³ · k=5 ⟹ 10ε³−15ε⁴+6ε⁵（ε<1/2 时严格递减）
 *
 * 两个必须讲清楚的教学点（pot109 D/E 节逐条验证）：
 *   ① 表决只修**经典读出翻转**，不修数据错误：单个数据错误在 k 次重复里
 *      给出同一个错综合（无门噪声时逐次相同），多数表决原样复现它——P_L(p)
 *      的 3p²−2p³ 骨架不变，只是底座从 ε(1−ε) 换成 ε_k(1−ε_k)。
 *   ② 表决**不免费**：每次重复都是一次新的综合征提取（rd 倍提取门），门
 *      通道（γ/λ/p_dep）的错误机会随之翻 rd 倍——读出误差主导时 rd↑ 有利，
 *      门噪声主导时 rd↑ 反而更差。这就是「测量是有代价的」。
 *
 * 实现：qecCircuit 按 rd 分配 fresh ancilla（nq = n+(n−1)·rd，n=3 rd=1 时与
 * R108 **逐位同线路**）；执行器在修正点对各稳定子的 rd 个记录取多数；DP-over-
 * frames 的键从「2 记录位」升级为「每稳定子投票计数 0..rd」，测量分支按 ε
 * 独立翻、修正分支按 >rd/2 表决（γ=0 时仍零统计误差的精确解）。
 * ========================================================================== */

/* ============================================================================
 * R110：码距 d=n 的重复码（n=3/5）——码距与表决的两层正交
 * ============================================================================
 * R78–R109 全是 3 比特重复码（d=3：纠 1 个数据错）。把码长开到 n=5（d=5：
 * 纠 2 个数据错），与 R109 的 k 次表决读出组合出教科书的「两层防御」：
 *
 *   数据错误层（码距治）：d=2t+1 纠正 t 个数据错误。n=3 ⟹ t=1（3p²−2p³），
 *     n=5 ⟹ t=2（10p³−15p⁴+6p⁵——与 ε_5 同多项式形状，都是「5 里 ≥3」的尾率）。
 *   读出错误层（表决治 SPAM）：每个稳定子测 k 次取多数，ε→ε_k（R109）。
 *
 * 两层**正交**（pot110 E 节逐条验证）：表决只缩小 ε_k，不碰数据错误项；码距
 * 只缩小数据错误项，不碰读出底座。但两层有**耦合的代价**——稳定子数量从 2 增
 * 到 4，读出误差的暴露面翻倍：p=0 时底座从 ε(1−ε)（n=3，15 个非零表决综合征
 * 里 1 个致命）变成 2ε_k(1−ε_k)³+ε_k²(1−ε_k)²+2ε_k³(1−ε_k)（n=5，15 个里
 * 5 个致命——单比特表决翻错时有 2/4 的概率把修正引到 q0）。领先阶 ≈(n−1)/2·ε_k：
 * 码越长，读出误差越贵。这就是「测量/稳定子是有代价的」在码距维度上的版本。
 *
 * 解码器换成**最小权重**（maximum-likelihood）口径：综合征 s 的一切一致修正
 * 模式只有两个（前缀模式与其全局补集——X_L=ⁿX 的零综合征），取轻者。n=3 时
 * 与 R108 查表逐位等价（syn 10→q0、11→q1、01→q2、00→不动）；n=5 时修正可以
 * 落两个比特（如 syn 0010 ⟹ X₃X₄）。判决口径不变：F<0.5（q0 约化保真度）。
 * 对 bitflip 码还有一个本轮证明的简化判据（默认 |+i⟩ 态无 X 类盲区）：
 * **逻辑错误 ⟺ q0 ∈ 残差模式**（残差 = 真实错误 ⊕ 修正；X 在 q_i, i≥1 上
 * 过解码 CNOT(0→i) 不动（target X 不变），只有 q0 上的 X 毁逻辑比特）。
 * ========================================================================== */

export const QEC_DEFAULTS = {
  code: 'bitflip',        /* bitflip | phaseflip */
  /* R110/R112：码长 n（码距 d=n；3 = R78 口径 / 5 = d=5 纠 2 个 / 7 = d=7 纠 3 个
     / 9 = d=9 纠 4 个数据错）。稳定子数 = n−1，ancilla 数 = (n−1)·rd，
     nq = n + (n−1)·rd（n=9·rd=1 与 n=5·rd=3 同为 nq=17 重配置）。 */
  n: 3,                   /* 3 | 5 | 7 | 9（其余值归一到 3） */
  p: 0.05,
  /* 逻辑初态 Ry(θ)Rz(φ)|0⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩。
     默认取 **|+i⟩**（θ=π/2, φ=π/2）而不是 |+⟩：X_L|+⟩=|+⟩，逻辑 X 错误在 |+⟩ 上
     **完全不可观测**（首版用 |+⟩，双错试验的保真度仍是 1，P_L 恒为 0）。 */
  theta: Math.PI / 2, phase: Math.PI / 2,
  trials: 4000,
  seed: 7,
  /* ---- R86 门级噪声 ---- */
  noise: 'iid',           /* iid（R78 静态口径，默认）| gate（R80 门级口径）| phys（R108 物理通道口径） */
  spectrum: 'depolar',    /* depolar | x | z（gate 模式；iid 模式下谱由码定：
                             bitflip 只翻 X、phaseflip 只翻 Z，与 R78 一致；
                             phys 模式忽略本字段——门通道是 T₁/T₂/退极化族，不是谱选择） */
  noisyPhase: 'extract',  /* extract（默认，只提取段）| all（encode/extract/decode） */
  /* ---- R108 物理通道参数（与 qcircuit 线路页同名同义；γ=1−e^{−tg/T₁} 等） ---- */
  t1: 3000,               /* 能量弛豫时间（任意单位；默认偏大 ⟹ 每门 γ≈3.3e-3） */
  t2: 2000,               /* 退相位时间（T₂ ≤ 2T₁ 自动满足） */
  tg: 10,                 /* 门时 */
  pd: 0.002,              /* 每门每比特退极化概率 */
  re: 0.005,              /* 每位测量记录的独立翻转概率（读出误差 ε） */
  peq: 0,                 /* 热平衡激发布居（0 = 纯弛豫 ⟹ R104 振幅阻尼） */
  /* ---- R109 容错读出：综合征重复测量次数 k（多数表决；1 = R108 单次口径） ---- */
  rd: 1,                  /* 1 | 3 | 5（奇数；每次重复一套 fresh ancilla，nq=n+(n−1)·rd）。
                             表决后有效读出误差 ε_k=ΣC(k,j)ε^j(1−ε)^{k−j}；只修经典
                             翻转、不修数据错误，且提取门机会翻 rd 倍（不免费） */
};

/* 噪声模型与谱的页面标签（src/qec.js 用） */
export const QEC_NOISE = {
  iid: { label: '静态 i.i.d.', short: 'iid',
    desc: 'R78 口径：编码后、解码前，每个数据比特独立以概率 p 翻一次 Pauli（bitflip 码翻 X、phaseflip 码翻 Z）。错误**不挂在门上**——3 个数据比特 = 3 次错误机会。' },
  gate: { label: '门级（R80）', short: 'gate',
    desc: 'R80 口径：每个门作用后，对该门触及的每个比特以概率 p 注入随机 Pauli。错误机会数 = Σ|gnTouched(门)|（n=3 时提取段 8/12 个，「all」口径 16/26 个；n=5 时更多）——同一个 p，机会越多 P_L 越高。' },
  phys: { label: '物理通道（R108）', short: 'phys',
    desc: 'R108 口径：数据错误仍是静态 i.i.d. Pauli（率 p），但提取段每个门作用后对触及比特施加真实硬件通道——振幅阻尼/热激发 γ=1−e^(−tg/T₁)（按 p_eq 分配上下行）、相位阻尼 λ=1−e^(−tg/T₂)、退极化 p_d；ancilla 测量的经典记录位再以概率 ε 翻转（读出误差）。ρ 是混合态、综合征不再确定：单错不再必纠，P_L 有一个与 p 无关的底座 ε(1−ε)+门通道贡献。γ/λ>0 时无精确解（帧跟踪失效），只出 MC。' },
};
export const QEC_SPECTRA = {
  depolar: { label: '退极化 X/Y/Z', short: 'depol' },
  x: { label: '仅 X', short: 'X' },
  z: { label: '仅 Z', short: 'Z' },
};

export const QEC_CODES = {
  bitflip: {
    label: '比特翻转码',
    err: 'x', fix: 'x', stab: 'z',
    text: '把 α|0⟩+β|1⟩ 编成 α|0…0⟩+β|1…1⟩（n=3、5、7 或 9），每个物理比特以概率 p 翻 **X**。n−1 个稳定子 ZᵢZᵢ₊₁ 的综合唯一确定「哪些比特翻了」（最小权重解码：综合征的一致修正模式只有前缀模式与其全局补集两个，取轻的——n=3 时 10→q0、11→q1、01→q2、00→不动）。n=3（d=3）**单错必纠、双错必错**：P_L = 3p²−2p³；n=5（d=5）**≤2 错必纠、≥3 错必错**：P_L = 10p³−15p⁴+6p⁵；n=7/9 同理（≤3/≤4 错必纠，P_L = 35p⁴−84p⁵+70p⁶−20p⁷ / 126p⁵−420p⁶+540p⁷−315p⁸+70p⁹）——同 p 下高阶项被逐个压掉，但稳定子从 2 个增到 n−1 个，读出误差暴露面同步放大（p=0 底座 ≈(n−1)/2·ε_k）。',
  },
  phaseflip: {
    label: '相位翻转码',
    err: 'z', fix: 'z', stab: 'x',
    text: '同一个码在 **H 基**下的对偶：错误换成 **Z**（相位翻转），稳定子换成 XᵢXᵢ₊₁（用 ancilla 做 H–CNOT(a→d)–H 后测量）。综合与修正的逻辑完全同构（n=3 时 P_L 也是 3p²−2p³，n=5/7/9 时分别是 10p³−15p⁴+6p⁵ / 35p⁴−84p⁵+70p⁶−20p⁷ / 126p⁵−420p⁶+540p⁷−315p⁸+70p⁹）。注意它**完全不管 X 错误**——单个 Z 错能纠，一个 X 错就直接毁掉相位信息。这就是为什么真正的通用纠错要把两个码串起来（Shor 9 比特码 = 3×3），本轮只做重复码这一层。',
  },
};

/* R110/R112：码长归一（页面/URL 只暴露 3/5/7/9；非法值归一到 3）。
   n=7（d=7，t=3）与 n=9（d=9，t=4）在 R112 接入：解码器是 O(n) 前缀构造，
   本就支持任意 n；代价是 nq = n+(n−1)·rd 涨到 13/17（态矢 2^13 / 2^17）——
   由 qecExec 的 nq>18 守卫与页面的性能预算共同约束（见 qecNormN 调用方）。 */
export function qecNormN(n){
  const k = Math.round(Number(n));
  return (k === 5 || k === 7 || k === 9) ? k : 3;
}

/* 错误位置数组 → n−1 个稳定子的本征值（0 = +1，1 = −1）
   ZᵢZᵢ₊₁ 对 |e₀…e_{n−1}⟩ 的本征值 = (−1)^{eᵢ+eᵢ₊₁}；X 型同理（H 基同构）。
   n=3 时返回 [e₀^e₁, e₁^e₂]，与 R78–R109 逐位一致。 */
export function qecSyndromeOf(errors, n = 3){
  const N = qecNormN(n);
  const e = new Array(N).fill(0);
  for (const q of errors) if (q >= 0 && q < N) e[q] ^= 1;
  const s = [];
  for (let i = 0; i < N - 1; i++) s.push(e[i] ^ e[i + 1]);
  return s;
}

/* 综合 → 最小权重修正位列表（空 = 不动）。
   综合征 s 的一切一致 X 模式恰有两个：前缀模式 P0（e₀=0, eᵢ₊₁=eᵢ^sᵢ）与
   其全局补集 P1（≡ P0·X_L，零综合征的只有 I 与 X_L）。取轻者——n 为奇数
   时无平局。n=3 逐位复现 R108 查表（[1,0]→[0]、[1,1]→[1]、[0,1]→[2]、
   [0,0]→[]）；n=5 可返回两位（如 [0,0,1,0]→[3,4]）。 */
export function qecFixFromSyndrome(syn, n = 3){
  const N = qecNormN(n);
  const e = new Array(N).fill(0);
  for (let i = 0; i < N - 1; i++) e[i + 1] = e[i] ^ ((syn[i] ? 1 : 0));
  const w0 = e.reduce((a, b) => a + b, 0);
  const fix = [];
  if (w0 * 2 > N){
    /* 补集更轻：修正位 = P0 的 0 位（q0 也在内——跨越逻辑比特的修正） */
    for (let q = 0; q < N; q++) if (!e[q]) fix.push(q);
  } else if (w0 > 0){
    for (let q = 0; q < N; q++) if (e[q]) fix.push(q);
  }
  return fix;
}

/* 逻辑错误判定（静态口径）：>t=（n−1)/2 个物理比特翻 ⟹ 最小权重解码器只能
   修掉轻补集、残差 ≡ X_L ⟹ 逻辑错误。n=3 ⟹ ≥2；n=5 ⟹ ≥3。 */
export function qecIsLogicalError(errors, n = 3){
  const N = qecNormN(n);
  return errors.length > (N - 1) / 2;
}

/* 谱权重（与 gatenoise.js 的 gnSampleError 同分布；survey/DP 共用） */
export function qecSpecW(spectrum){
  if (spectrum === 'x') return { x: 1, y: 0, z: 0 };
  if (spectrum === 'z') return { x: 0, y: 0, z: 1 };
  return { x: 1 / 3, y: 1 / 3, z: 1 / 3 };
}

/* ============================================================================
 * 探针掩码（qcExpect 的 (xm,zm) 形式；R110 按码长 n 生成）
 *   bitflip（计算基帧）：稳定子 ZᵢZᵢ₊₁（i=0..n−2）；逻辑 X_L=ⁿX、Z_L=Z₀、
 *     Y_L=Y₀ⁿ⁻¹X
 *   phaseflip（H 帧）：稳定子 XᵢXᵢ₊₁；逻辑 X_L^H=ⁿX、Z_L^H=ⁿZ、Y_L^H=ⁿY
 *     （整体相位不影响符号判定：参考值与实测值用同一个算符，且陪集归属
 *     只看交换关系）
 *   代表元可差一个稳定子（对码空间态期望相同，R86 论证见头注）。
 * ========================================================================== */
const QEC_PROBE_CACHE = new Map();
function qecProbes(code, n){
  const N = qecNormN(n);
  const key = code + '|' + N;
  let P = QEC_PROBE_CACHE.get(key);
  if (P) return P;
  const full = (1 << N) - 1;
  const stabs = [];
  for (let i = 0; i < N - 1; i++){
    const pair = 0b11 << i;
    stabs.push(code === 'phaseflip' ? { xm: pair, zm: 0 } : { xm: 0, zm: pair });
  }
  P = code === 'phaseflip'
    ? { stabs, XL: { xm: full, zm: 0 }, ZL: { xm: 0, zm: full }, YL: { xm: full, zm: full } }
    : { stabs, XL: { xm: full, zm: 0 }, ZL: { xm: 0, zm: 1 }, YL: { xm: full, zm: 1 } };
  QEC_PROBE_CACHE.set(key, P);
  return P;
}

/* 末态探针：n−1 个稳定子期望 + 3 个逻辑期望（ancilla 已测掉，只读数据比特） */
export function qecProbe(s, code, n = 3){
  const P = qecProbes(code, n);
  const synErr = [];
  let mixed = false;
  for (const g of P.stabs){
    const e = qcExpect(s, g.xm, g.zm);
    if (e < -0.5) synErr.push(1);
    else if (e > 0.5) synErr.push(0);
    else { synErr.push(-1); mixed = true; }
  }
  return {
    synErr, mixed,
    XL: qcExpect(s, P.XL.xm, P.XL.zm),
    ZL: qcExpect(s, P.ZL.xm, P.ZL.zm),
    YL: qcExpect(s, P.YL.xm, P.YL.zm),
  };
}

/* ---------- 分类：末态探针 + 参考态 → 陪集（flagsynd fsClass 同款） ---------- */
function signOf(v, ref){
  if (Math.abs(ref) < 0.2) return 0;      /* 该分量在参考态上不可观测 */
  return (v * ref >= 0) ? 1 : -1;
}
export function qecClass(pre, ref, F){
  if (!pre || pre.mixed) return { coset: -2, cls: 'mixed' };
  /* 残差 ∉ N(S)（有稳定子期望为 −1）分两种：F=1 说明**只有规范比特**出错、
     逻辑比特完好（码空间的「位置」偏了但 q0 仍是目标纯态）；F<1 才是逻辑信息受损。
     例：bitflip 码里混进来的一个 Z 错（静态口径下不会发生，门级退极化会）。 */
  if (pre.synErr.some(b => b === 1)){
    const f = F == null ? 0 : F;
    return { coset: -1, cls: f > 1 - 1e-9 ? 'gauge' : 'outside' };
  }
  const sX = signOf(pre.XL, ref.XL);
  const sZ = signOf(pre.ZL, ref.ZL);
  const sY = signOf(pre.YL, ref.YL);
  let coset = 0;
  if (sZ === -1 && sY === -1 && sX === 1) coset = 1;        /* X_L */
  else if (sX === -1 && sY === -1 && sZ === 1) coset = 2;   /* Z_L */
  else if (sX === -1 && sZ === -1 && sY === 1) coset = 3;   /* Y_L */
  else if (sX === -1 || sZ === -1 || sY === -1) coset = 1;  /* 兜底（参考态盲区下的
     保守判：至少有一个可观测分量翻了，必是逻辑错误；具体陪集号以帧路径为准） */
  return { coset, cls: coset === 0 ? 'perfect' : 'logic', sX, sY, sZ };
}

/* ---------- 解码后判定（物理问题：逻辑比特有没有坏） ----------
   解码把码空间映到 q0 单个逻辑比特，q1..q_{n−1} 理应归 |0⟩。残差帧只看数据位：
   q0 上有 X/Y ⟹ 逻辑 X 型；Z/Y ⟹ 逻辑 Z 型；皆有 ⟹ Y 型；q0 干净而其他数据位
   脏 ⟹ gauge（逻辑完好、物理比特脏，F=1 精确成立）；全干净 ⟹ perfect。
   与 F<0.5 在非退化参考态上逐位一致（pot86 断言）；盲区（|+⟩ 上的 X_L）
   帧说 logic 而 F=1——那是参考态看不见，不是判定错。 */
export function qecDecodedClass(fr, n = 3){
  const m = (1 << qecNormN(n)) - 1;
  const x = fr.x & m, z = fr.z & m;
  const x0 = x & 1, z0 = z & 1;
  if (x0 && z0) return { coset: 3, cls: 'logic' };
  if (x0) return { coset: 1, cls: 'logic' };
  if (z0) return { coset: 2, cls: 'logic' };
  if (x || z) return { coset: -1, cls: 'gauge' };
  return { coset: 0, cls: 'perfect' };
}

/* ---------- 帧残差 → 码空间陪集（与探针独立的一条路径；R110 按 n 生成） ---------- */
const QEC_STAB_SPAN = (() => {
  const cache = new Map();
  const mk = (code, n) => {
    const N = qecNormN(n);
    const key = code + '|' + N;
    let set = cache.get(key);
    if (set) return set;
    const gens = [];
    for (let i = 0; i < N - 1; i++){
      const pair = 0b11 << i;
      gens.push(code === 'phaseflip' ? { xm: pair, zm: 0 } : { xm: 0, zm: pair });
    }
    /* R112：键基 = 2^N（x/z 掩码各宽 N 位）。旧口径 x*32+z 只在 n≤5 时单射——
       n=7 起掩码宽 6+ 位，不同 (x,z) 撞同键（实测 {x:1,z:1}=Y₀ 撞上稳定子
       {x:0,z:33}⟹ 单 Y 错被误判 perfect）。x·2^N+z ≤ 2^18（n=9）整数精确。 */
    const P2 = 1 << N;
    set = new Set();
    for (let m = 0; m < (1 << gens.length); m++){
      let x = 0, z = 0;
      for (let b = 0; b < gens.length; b++) if (m & (1 << b)){ x ^= gens[b].xm; z ^= gens[b].zm; }
      set.add(x * P2 + z);
    }
    cache.set(key, set);
    return set;
  };
  return { mk, get: (code, n) => mk(code, n) };
})();
function qecLogicSet(code, n){
  const N = qecNormN(n);
  const full = (1 << N) - 1;
  return code === 'phaseflip'
    ? [{ xm: full, zm: 0 }, { xm: 0, zm: full }, { xm: full, zm: full }]
    : [{ xm: full, zm: 0 }, { xm: 0, zm: 1 }, { xm: full, zm: 1 }];
}
/* 帧陪集：0 = ∈S（perfect）· 1/2/3 = X_L/Z_L/Y_L 陪集（logic）· −1 = ∉N(S)
   R112：键 = x·2^N+z（与 QEC_STAB_SPAN 同基；n=9 ⟹ ≤2^18 精确）。 */
export function qecFrameCoset(code, fr, n = 3){
  if (!fr.x && !fr.z) return 0;
  const span = QEC_STAB_SPAN.get(code, n);
  const P2 = 1 << qecNormN(n);
  if (span.has(fr.x * P2 + fr.z)) return 0;
  const L = qecLogicSet(code, n);
  for (let i = 0; i < 3; i++){
    if (span.has((fr.x ^ L[i].xm) * P2 + (fr.z ^ L[i].zm))) return i + 1;
  }
  return -1;
}
/* 帧的最小权重代表元（S 内元素物理上不可见——不取最小会把「无害的稳定子」
   报成权重 2，flagsynd 踩过的坑，pot81 抓出） */
export function qecFrameWeight(code, fr, n = 3){
  const span = QEC_STAB_SPAN.get(code, n);
  const m = (1 << qecNormN(n)) - 1;
  const P2 = m + 1;
  let best = popc((fr.x | fr.z) & m);
  for (const k of span){
    const x = (k / P2) | 0, z = k % P2;
    const w = popc(((fr.x ^ x) | (fr.z ^ z)) & m);
    if (w < best) best = w;
  }
  return best;
}
function popc(v){ let c = 0; while (v){ c += v & 1; v >>>= 1; } return c; }

/* ============================================================================
 * 线路（单一数据源：试验 / 故障枚举 / 门数统计共用，保证枚举与真跑不 diverg）
 * ========================================================================== */
const CIRC_CACHE = new Map();
export function qecCircuit(code = 'bitflip', cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const spec = QEC_CODES[code] || QEC_CODES.bitflip;
  const isPhase = code === 'phaseflip';
  /* R109：读出表决重复数（奇数 1/3/5；非法值归一到 1）。rd 进缓存键——
     线路结构（ancilla 数/测量数）随它变，与 code/theta/phase 同级。
     R110：码长 n（3/5；非法值归一到 3）同样进键——数据比特数/稳定子数随它变。 */
  const rd = qecNormRd(c.rd);
  const n = qecNormN(c.n);
  const key = `${code}|${c.theta}|${c.phase}|${n}|${rd}`;
  let circ = CIRC_CACHE.get(key);
  if (circ) return circ;
  const ops = [];
  const push = (o) => { ops.push(o); return ops.length - 1; };
  /* ① 逻辑初态（理想；帧在此必为零，非 Clifford 门的帧抛错不会触发） */
  push({ op: 'ry', q: 0, theta: c.theta, ph: 'prep' });
  push({ op: 'rz', q: 0, theta: c.phase, ph: 'prep' });
  /* ② 编码（CNOT(0→i), i=1..n−1；phaseflip 追加 H×n 转入 H 帧——稳定子是 X 型，
     α|0…0⟩+β|1…1⟩ 不是 X 稳定子本征态；首版漏了这三步 H，测出的综合恒为 01）。
     n=3 时 CNOT(0→1),CNOT(0→2) 与 R108 逐位相同（零回归锚点）。 */
  for (let i = 1; i < n; i++) push({ op: 'cnot', c: 0, q2: i, ph: 'encode' });
  if (isPhase) for (let q = 0; q < n; q++) push({ op: 'h', q, ph: 'encode' });
  /* ③ 静态噪声块的决策点（gate 模式跳过：错误挂在门上，没有静态块） */
  push({ op: 'noise', ph: 'noise' });
  /* ④ 稳定子测量（stab si 测 ZᵢZᵢ₊₁ 或 XᵢXᵢ₊₁；ancilla 编号 n+si·rd+rp）。
     X 类用 H–CNOT(a→d)–H 的相位反冲：有效操作条件于 X_{qa}X_{qb}，
     对稳定子本征态给出确定读数且不动数据（R78 同款，pot78 B5 同构验证）。
     R109：每个稳定子**重复 rd 次**，每次一套 fresh ancilla（ancilla 测后
     不重置——重复利用会把综合征又 XOR 一次，物理上错）；rd=1 且 n=3 时
     ancilla 编号 3/4、ops 序列与 R108 逐位相同（零回归）。 */
  for (let si = 0; si < n - 1; si++){
    const qa = si, qb = si + 1;
    for (let rp = 0; rp < rd; rp++){
      const anc = n + si * rd + rp;
      if (spec.stab === 'z'){
        push({ op: 'cnot', c: qa, q2: anc, ph: 'extract', stab: si });
        push({ op: 'cnot', c: qb, q2: anc, ph: 'extract', stab: si });
      } else {
        push({ op: 'h', q: anc, ph: 'extract', stab: si });
        push({ op: 'cnot', c: anc, q2: qa, ph: 'extract', stab: si });
        push({ op: 'cnot', c: anc, q2: qb, ph: 'extract', stab: si });
        push({ op: 'h', q: anc, ph: 'extract', stab: si });
      }
      push({ op: 'meas', q: anc, ph: 'extract', stab: si, rep: rp });
    }
  }
  /* ⑤ 修正点（运行期按表决后综合最小权重解码插入，不带噪声；探针在此取样） */
  push({ op: 'fix', ph: 'correct' });
  /* ⑥ 解码：phaseflip 先回计算基，再用编码的逆（CNOT 自逆，控制必须是 q0） */
  if (isPhase) for (let q = 0; q < n; q++) push({ op: 'h', q, ph: 'decode' });
  for (let i = 1; i < n; i++) push({ op: 'cnot', c: 0, q2: i, ph: 'decode' });

  /* 统计：门数 + 分相位错误机会数 M = Σ|gnTouched| */
  let gates = 0, cnots = 0, singles = 0, meas = 0;
  const opps = { prep: 0, encode: 0, extract: 0, decode: 0 };
  for (const o of ops){
    if (o.op === 'meas'){ meas++; continue; }
    if (o.op === 'fix' || o.op === 'noise') continue;
    gates++;
    if (o.op === 'cnot') cnots++; else singles++;
    opps[o.ph] = (opps[o.ph] || 0) + gnTouched(o).length;
  }
  /* ⚠ 缓存口径剔除逐次运行选项（forceErrors / faults / forceFlips）：CIRC_CACHE
     的 key 只有 code|theta|phase|n|rd，先跑的 forced 试验会把它们烘进 circ.cfg；
     qecExec 的 cfg 合并不覆盖缺失键，后续 ensemble（cfg 无这些键）会看到陈旧值
     ——空数组也 truthy ⟹ 噪声分支走空循环：不注入、不消耗 rng，PL 恒 0。R86
     复写引入的坑，基线比对抓出。qecExec 只读 opts.faults，但缓存仍须剔除以防
     语义泄漏。 */
  const cacheCfg = { ...c };
  delete cacheCfg.forceErrors;
  delete cacheCfg.forceFlips;   /* R108：phys 的强制综合征翻转（逐次运行选项，同上） */
  delete cacheCfg.faults;
  /* rd/n 是结构参数（ancilla 数/测量数），保留在 circ.cfg——执行器读它无需
     再传；逐次运行选项只有上面三个。 */
  const nq = n + (n - 1) * rd;
  circ = { code, n, rd, nq, spec, cfg: cacheCfg, ops, stats: { nq, n, rd, gates, cnots, singles, meas, opps, M: opps.encode + opps.extract + opps.decode } };
  CIRC_CACHE.set(key, circ);
  return circ;
}

/* ============================================================================
 * 执行一次（态矢 + Pauli 帧双轨；测量与修正都是帧的确定函数）
 *   opts: { rng, p, noise, spectrum, noisyPhase, faults, cfg }
 *     rng=null ⟹ 测量确定性优先（p1<1e-9→0 / >1−1e-9→1；真随机才计数，
 *              本线路实测恒确定——残差是 Pauli、ancilla 测前是 Z 本征态）
 *     faults=[{gate,q,t}] ⟹ 精确故障枚举（在该门强制注入，无视注错范围）
 * ========================================================================== */
export function qecExec(circ, opts = {}){
  const c = { ...circ.cfg, ...(opts.cfg || {}) };
  const spec = circ.spec;
  const faults = opts.faults || null;
  const rng = opts.rng || null;
  const p = opts.p != null ? opts.p : (c.p || 0);
  const spectrum = opts.spectrum || c.spectrum || 'depolar';
  const gateMode = (opts.noise || c.noise || 'iid') === 'gate';
  const noisyAll = (opts.noisyPhase || c.noisyPhase || 'extract') === 'all';
  const noisyPh = gateMode ? (noisyAll ? ['encode', 'extract', 'decode'] : ['extract']) : [];
  /* R110：态矢维数守卫——nq>18 ⟹ 2^nq 维复振幅（n=5 rd=5 ⟹ nq=25 ⟹ 536MB）
     直接 OOM。页面只暴露 nq≤17 的组合（n=5 时 rd∈{1,3}）；DP-over-frames
     （qecExactPL）走帧、无态矢，不受此限。 */
  if (circ.nq > 18) throw new Error('qecExec: nq=' + circ.nq + ' ⟹ 态矢 2^' + circ.nq + ' 维过大（上限 2^18）');
  const s = qcNewState(circ.nq);
  const fr = { x: 0, z: 0 };
  const n = circ.n, nStab = n - 1, dmask = (1 << n) - 1;
  /* R109：syn 平铺全部 rd 重复（stab-major 序），synByStab 按稳定子分组供
     多数表决；rd=1 时 syn=[m₀,m₁]、表决 ≡ 直接取位（与 R108 逐位一致）。
     R110：稳定子数 = n−1（n=3 ⟹ 2；n=5 ⟹ 4）。 */
  const syn = [], synByStab = Array.from({ length: nStab }, () => []), synFrame = [], fired = [];
  const diag = { random: 0, synMiss: 0 };
  const forced = new Map();
  if (faults) for (const f of faults){
    if (!forced.has(f.gate)) forced.set(f.gate, []);
    forced.get(f.gate).push(f);
  }
  const inject = (q, t, gate) => {
    gnPauli(s, q, t);
    qcFrToggle(fr, q, t);
    fired.push({ gate, q, t });
  };
  const noiseErrors = [];     /* R78 口径：i.i.d. 静态块命中的数据比特 */
  let fixQ = -1, fixQs = [], pre = null, frAtFix = null;

  /* 测量：rng 在时走 qcMeasureQubit（与 R78 逐位一致：总是消费一次 rng）；
     无 rng 时确定性优先（枚举用）。帧预测 syn = 帧的 x 位（Z 读数被 X 型残差翻）。 */
  const measure = (q) => {
    const bit = 1 << q;
    let p1 = 0;
    for (let i = 0; i < s.dim; i++) if (i & bit) p1 += s.re[i] * s.re[i] + s.im[i] * s.im[i];
    let out;
    if (rng){
      out = qcMeasureQubit(s, q, rng);
    } else {
      if (p1 < 1e-9) out = 0;
      else if (p1 > 1 - 1e-9) out = 1;
      else { diag.random++; out = p1 > 0.5 ? 1 : 0; }
      for (let i = 0; i < s.dim; i++){ if (((i & bit) ? 1 : 0) !== out){ s.re[i] = 0; s.im[i] = 0; } }
      let nrm = 0;
      for (let i = 0; i < s.dim; i++) nrm += s.re[i] * s.re[i] + s.im[i] * s.im[i];
      if (nrm > 0){ const rr = 1 / Math.sqrt(nrm); for (let i = 0; i < s.dim; i++){ s.re[i] *= rr; s.im[i] *= rr; } }
    }
    const sf = (fr.x >> q) & 1;
    synFrame.push(sf);
    if (sf !== out) diag.synMiss++;
    return out;
  };

  for (let i = 0; i < circ.ops.length; i++){
    const o = circ.ops[i];
    if (o.op === 'noise'){
      /* 静态 i.i.d. 块：逐数据比特独立以 p 施加 spec.err。
         ⚠ rng 消耗必须与 R78 一致：非 forceErrors 时每比特必调一次 rng()
         （哪怕 p=0），否则 MC 轨迹整体错位、逐位回归失败。 */
      if (gateMode) continue;
      if (c.forceErrors){
        for (const q of c.forceErrors){
          qcApply(s, { op: spec.err, q });
          qcFrToggle(fr, q, spec.err);
          noiseErrors.push(q);
        }
      } else {
        for (let q = 0; q < n; q++){
          if (rng && rng() < p){
            qcApply(s, { op: spec.err, q });
            qcFrToggle(fr, q, spec.err);
            noiseErrors.push(q);
          }
        }
      }
      continue;
    }
    if (o.op === 'meas'){
      const b = measure(o.q);
      syn.push(b);
      synByStab[o.stab != null ? o.stab : 0].push(b);
      continue;
    }
    if (o.op === 'fix'){
      /* R109：修正查表用**表决后**的综合（每位 = 该稳定子 rd 个记录的多数）。
         R110：最小权重解码——n=3 时恰 0/1 个修正位（fixQ 语义不变），n=5 时
         可两位（如 voted=0010 ⟹ X₃X₄）。fixQ 保留为「首个修正位」（−1 = 不动），
         fixQs 是完整列表（UI/调试用）。 */
      const voted = synByStab.map(qecMajority);
      fixQs = qecFixFromSyndrome(voted, n);
      fixQ = fixQs.length ? fixQs[0] : -1;
      for (const fq of fixQs){
        qcApply(s, { op: spec.fix, q: fq });
        qcFrToggle(fr, fq, spec.fix);
      }
      /* 探针取样点：所有修正已完成、解码之前（码空间仍完好定义） */
      pre = qecProbe(s, circ.code, n);
      frAtFix = { x: fr.x & dmask, z: fr.z & dmask };
      continue;
    }
    /* 普通门 */
    qcApply(s, o);
    qcFrGate(fr, o);
    if (gateMode){
      const list = forced.get(i);
      if (list){
        for (const f of list) inject(f.q, f.t, i);
      } else if (rng && p > 0 && o.ph !== 'prep' && noisyPh.includes(o.ph)){
        for (const q of gnTouched(o)){
          const t = gnSampleError(spectrum, p, rng);
          if (t) inject(q, t, i);
        }
      }
    }
  }

  /* ⑦ 逻辑判定：q0 的部分迹 vs 目标纯态 |ψ0⟩（R78 口径，零回归）。 */
  const th = c.theta / 2, ph = c.phase;
  const alpha = [Math.cos(th), 0];
  const beta = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)];
  const F = qcRhoFidelity(qcQubitRho(s, 0), alpha, beta);
  const rho0 = qcQubitRho(s, 0);
  const frAtEnd = { x: fr.x & dmask, z: fr.z & dmask };
  const dec = qecDecodedClass(frAtEnd, n);
  return {
    syn, synVoted: synByStab.map(qecMajority), synFrame, fixQ, fixQs, pre, frAtFix, frAtEnd,
    cosetFix: qecFrameCoset(circ.code, frAtFix, n),
    cosetDec: dec.coset, clsDec: dec.cls,
    F, logicalError: F < 0.5,
    errors: noiseErrors.slice(),
    fired: fired.slice(),
    state: s,
    p0: rho0.re[0][0], p1: rho0.re[1][1],
    diag,
  };
}

/* ============================================================================
 * R108：phys 口径执行一次（**量子轨迹** MCWF：态矢 + Kraus 跳变采样）
 *
 * 为什么不是「密度矩阵 + 通道」：把退极化通道**确定性地**作用到 ρ 上，会把全部
 * 错误构型的混合态一起保留下来，末态 F = Σ_k w_k·F_k 是**平均**保真度——
 * 逐试验判 F<0.5 量到的是「混合态里逻辑权重是否过半」，而不是「这次抽样到的
 * 错误构型是否致命」。QEC 的逻辑错误率是**逐次实验**口径：每次实验环境采样出
 * 一个具体错误构型，解码器据此成功或失败（首版密度矩阵实现因此把 pdep=0.01 的
 * P_L 少算了 4 倍——MC 0.013 vs DP 0.045，pot108 C1 抓出）。
 *
 * 正确口径 = 量子轨迹（Monte Carlo wave functions）：每次试验在态矢上**采样**
 * 每个错误机会的一个 Kraus 结果，轨迹系综与密度矩阵通道逐位同分布：
 *   · 退极化 p_dep：gnSampleError('depolar') —— 无操作 w.p. 1−p，X/Y/Z 各 p/3
 *     （与 gate 模式同一函数、同一分布 ⟹ pdep-only ≡ gate 退极化谱，4σ 对账）。
 *   · 相位阻尼 λ：Kraus E₁=√(λ/2)·Z ⟹ w.p. λ/2 施加 Z（保迹 Pauli「跳变」，
 *     帧仍可跟踪）。通道 = (1−λ/2)ρ + (λ/2)ZρZ，跨位相干 ×(1−λ) ✓。
 *   · 振幅阻尼 / 热激发 γ（peq>0 走 GAD）：down（|1⟩→|0⟩）w.p. gDown·p₁、
 *     up（|0⟩→|1⟩）w.p. gUp·p₀；不跳则施加 E₀=diag(√(1−gUp),√(1−gDown))
 *     并重归一（||E₀ψ||² = 1−gUp·p₀−gDown·p₁）。peq=0 ⟹ 纯 R104 振幅阻尼。
 *     跳变不是 Pauli ⟹ **Pauli 帧失效**（frameOK 闩死，诚实标注）。
 *   · 读出误差 ε：量子态按理想投影坍缩，记录经典位以 ε 翻转（qcnFlipBits；
 *     ε=0 不消耗 rng）。
 * 数据错误保留 R78 静态块（率 p 的 spec.err 注入）——P_L 的 3p²−2p³ 骨架因此
 * 保留：全通道关闭时本路径与 iid **逐位一致**（同 rng 消耗形状、同确定性结果）。
 *
 * 判定：q0 约化 ρ vs 目标纯态，F<0.5 ⟺ 逻辑错误（R78 口径，逐次实验）。
 * 帧：Pauli 事件（depol / phase-Z）照常 qcFrToggle；synFrame 是帧对测量结果的
 *   独立预测，frameOK 时与真实测量位逐位一致（ε 无关——翻的只是经典记录），
 *   diag.frameMiss 恒 0（pot108 D 节断言）。
 * ========================================================================== */
export function qecExecPhys(circ, opts = {}){
  const c = { ...circ.cfg, ...(opts.cfg || {}) };
  const spec = circ.spec;
  const rng = opts.rng || null;
  if (!rng) throw new Error('qecExecPhys: rng required（轨迹跳变与测量是随机的）');
  const p = opts.p != null ? opts.p : (c.p || 0);
  const noisyAll = (opts.noisyPhase || c.noisyPhase || 'extract') === 'all';
  const noisyPh = noisyAll ? ['encode', 'extract', 'decode'] : ['extract'];
  const np = qcnNoiseParams(c.t1, c.t2, c.tg, c.pd, c.re, c.peq);
  /* R110：态矢维数守卫（同 qecExec：n=5 rd=5 ⟹ nq=25 ⟹ 2^25 维 = 536MB） */
  if (circ.nq > 18) throw new Error('qecExecPhys: nq=' + circ.nq + ' ⟹ 态矢 2^' + circ.nq + ' 维过大（上限 2^18）');
  const s = qcNewState(circ.nq);
  const fr = { x: 0, z: 0 };
  const n = circ.n, nStab = n - 1, dmask = (1 << n) - 1;
  let frameOK = true;                 /* T1/热激发跳变不是 Pauli ⟹ 帧失效（闩死） */
  /* R109：syn/synTrue/flips 平铺全部 rd 重复（stab-major 序）；synByStab /
     synTrueByStab 按稳定子分组供多数表决与表决后错位统计。rd=1 时
     syn=[m₀,m₁]、表决 ≡ 直接取位（与 R108 逐位一致）。
     R110：稳定子数 = n−1（n=3 ⟹ 2；n=5 ⟹ 4）。 */
  const syn = [], synByStab = Array.from({ length: nStab }, () => []), synTrueByStab = Array.from({ length: nStab }, () => []), synFrame = [], synTrue = [], flips = [], fired = [];
  const noiseErrors = [];
  let fixQ = -1, fixQs = [], pre = null, frAtFix = null;
  const diag = { frameMiss: 0, jumps: 0 };

  /* 单比特 |1⟩ 布居（跳变概率用） */
  const pop1 = (q) => {
    const bit = 1 << q;
    let p1 = 0;
    for (let i = 0; i < s.dim; i++) if (i & bit) p1 += s.re[i] * s.re[i] + s.im[i] * s.im[i];
    return p1;
  };
  /* T₁/热激发跳变（MCWF）：down w.p. gDown·p₁、up w.p. gUp·p₀，其余走 E₀+重归一 */
  const thermalJump = (q, gate) => {
    const bit = 1 << q;
    const p1 = pop1(q);
    const pDown = np.gDown * p1, pUp = np.gUp * (1 - p1);
    const u = rng();
    if (u < pDown){
      /* down：|1⟩⟨1| 振幅搬到 |0⟩⟨0|，除 √p₁ */
      for (let i0 = 0; i0 < s.dim; i0++){
        if (i0 & bit) continue;
        s.re[i0] = s.re[i0 | bit]; s.im[i0] = s.im[i0 | bit];
        s.re[i0 | bit] = 0; s.im[i0 | bit] = 0;
      }
      const k = p1 > 0 ? 1 / Math.sqrt(p1) : 0;
      for (let i = 0; i < s.dim; i++){ s.re[i] *= k; s.im[i] *= k; }
      fired.push({ gate, q, t: 't1', kind: 't1' });
      frameOK = false;
      return;
    }
    if (u < pDown + pUp){
      /* up：|0⟩⟨0| 振幅搬到 |1⟩⟨1|，除 √p₀ */
      for (let i0 = 0; i0 < s.dim; i0++){
        if (i0 & bit) continue;
        s.re[i0 | bit] = s.re[i0]; s.im[i0 | bit] = s.im[i0];
        s.re[i0] = 0; s.im[i0] = 0;
      }
      const k = (1 - p1) > 0 ? 1 / Math.sqrt(1 - p1) : 0;
      for (let i = 0; i < s.dim; i++){ s.re[i] *= k; s.im[i] *= k; }
      fired.push({ gate, q, t: 'up', kind: 'up' });
      frameOK = false;
      return;
    }
    /* 不跳：E₀ = diag(√(1−gUp), √(1−gDown))，重归一 1/√(1−pUp−pDown) */
    const sc0 = Math.sqrt(1 - np.gUp), sc1 = Math.sqrt(1 - np.gDown);
    const k = (1 - pUp - pDown) > 0 ? 1 / Math.sqrt(1 - pUp - pDown) : 0;
    for (let i = 0; i < s.dim; i++){
      const sc = (i & bit) ? sc1 : sc0;
      s.re[i] *= sc * k; s.im[i] *= sc * k;
    }
  };

  /* 测量（与 qecExec 同口径：qcMeasureQubit 投影坍缩；帧给独立预测）。
     R109：stab 参数把记录按稳定子归组（rd 次重复各自独立翻）；forceFlips
     是**平铺**的逐测量翻转掩码 [δ₀..δ_{(n−1)·rd−1}]（rd=1 且 n=3 时就是
     R108 的 [δ₀,δ₁]）。 */
  const measure = (q, stab) => {
    const tb = qcMeasureQubit(s, q, rng);
    /* forceFlips=[δ…]：测试用——记录位 = 真实位 ⊕ δ（不消耗 rng），
       与 forceErrors 同属逐次运行选项（CIRC_CACHE 已剔除，不烘进 circ.cfg） */
    const bit = c.forceFlips ? (tb ^ (c.forceFlips[syn.length] ? 1 : 0)) : qcnFlipBits([tb], np.eps, rng)[0];
    const sf = (fr.x >> q) & 1;
    syn.push(bit); synTrue.push(tb); synFrame.push(sf);
    synByStab[stab].push(bit); synTrueByStab[stab].push(tb);
    flips.push(bit === tb ? 0 : 1);
    if (frameOK && tb !== sf) diag.frameMiss++;
    return bit;
  };

  for (let i = 0; i < circ.ops.length; i++){
    const o = circ.ops[i];
    if (o.op === 'noise'){
      /* 静态数据块：与 iid 同机制（非 forceErrors 时每比特必调一次 rng） */
      if (c.forceErrors){
        for (const q of c.forceErrors){
          qcApply(s, { op: spec.err, q });
          qcFrToggle(fr, q, spec.err);
          noiseErrors.push(q);
        }
      } else {
        for (let q = 0; q < n; q++){
          if (rng() < p){
            qcApply(s, { op: spec.err, q });
            qcFrToggle(fr, q, spec.err);
            noiseErrors.push(q);
          }
        }
      }
      continue;
    }
    if (o.op === 'meas'){ measure(o.q, o.stab || 0); continue; }
    if (o.op === 'fix'){
      /* R109：修正查表用**表决后**的综合；bitErr = 表决位 ≠ 真实位多数
         （rd=1 时 ≡ flips——单次记录的翻转指示）。R110：n−1 个稳定子位 +
         最小权重解码（可多位修正）。 */
      const voted = synByStab.map(qecMajority);
      const trueMj = synTrueByStab.map(qecMajority);
      fixQs = qecFixFromSyndrome(voted, n);
      fixQ = fixQs.length ? fixQs[0] : -1;
      for (const fq of fixQs){
        qcApply(s, { op: spec.fix, q: fq });
        qcFrToggle(fr, fq, spec.fix);
      }
      pre = qecProbe(s, circ.code, n);
      frAtFix = { x: fr.x & dmask, z: fr.z & dmask };
      continue;
    }
    /* 普通门 + 门后通道（thermal → phase → depol，与 qcnNoiseAfter 同序） */
    qcApply(s, o);
    qcFrGate(fr, o);
    if (o.ph !== 'prep' && noisyPh.includes(o.ph)){
      for (const q of gnTouched(o)){
        if (np.gamma > 0){ thermalJump(q, i); diag.jumps++; }
        if (np.lambda > 0 && rng() < np.lambda / 2){
          qcApply(s, { op: 'z', q });
          qcFrToggle(fr, q, 'z');
          fired.push({ gate: i, q, t: 'z', kind: 'phase' });
        }
        if (np.pdep > 0){
          const t = gnSampleError('depolar', np.pdep, rng);
          if (t){
            gnPauli(s, q, t);
            qcFrToggle(fr, q, t);
            fired.push({ gate: i, q, t, kind: 'depol' });
          }
        }
      }
    }
  }

  /* ⑦ 逻辑判定：q0 约化 vs 目标纯态（R78 口径，零回归） */
  const th = c.theta / 2, ph = c.phase;
  const alpha = [Math.cos(th), 0];
  const beta = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)];
  const F = qcRhoFidelity(qcQubitRho(s, 0), alpha, beta);
  const rho0 = qcQubitRho(s, 0);
  const frAtEnd = { x: fr.x & dmask, z: fr.z & dmask };
  const dec = frameOK ? qecDecodedClass(frAtEnd, n) : { coset: null, cls: null };
  const voted = synByStab.map(qecMajority);
  const trueMj = synTrueByStab.map(qecMajority);
  return {
    syn, synVoted: voted, synTrue, flips, fixQ, fixQs, pre, frAtFix, frAtEnd,
    bitErr: voted.map((v, i) => v ^ trueMj[i]),
    cosetFix: frameOK ? qecFrameCoset(circ.code, frAtFix, n) : null,
    cosetDec: dec.coset, clsDec: dec.cls,
    F, logicalError: F < 0.5,
    errors: noiseErrors.slice(),
    fired: fired.slice(),
    frameOK,
    state: s,
    p0: rho0.re[0][0], p1: rho0.re[1][1],
    diag,
  };
}
/* 理想跑同一条线路取参考期望（探针判据的基准；缓存）。R110：n 进键——
   线路结构（比特数/稳定子数）随它变。 */
const REF_CACHE = new Map();
export function qecRef(circ){
  const key = circ.code + '|' + circ.cfg.theta + '|' + circ.cfg.phase + '|' + (circ.n || 3);
  let r = REF_CACHE.get(key);
  if (!r){
    const run = qecExec(circ, { rng: null, p: 0, noise: 'iid' });
    r = { ...run.pre, synErr: run.pre.synErr.slice(), F: run.F, syn: run.syn.slice(), fixQ: run.fixQ };
    REF_CACHE.set(key, r);
  }
  return r;
}

/* ============================================================================
 * 单次试验：真跑 5 比特态矢（3 数据 + 2 ancilla），返回全过程
 *   cfg: { code, p, theta, phase, noise, spectrum, noisyPhase, forceErrors, faults }
 *     forceErrors: iid 模式的强制错误位（测试用）
 *     faults: [{gate,q,t}] gate 模式的强制注入位点（测试用；无视注错范围）
 *   rng: mulberry32 风格。i.i.d 模式与 R78 逐位一致（rng 消耗序不变）。
 * ========================================================================== */
export function qecTrial(cfg = {}, rng){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const circ = qecCircuit(c.code, c);
  const nEnc = circ.n;
  if (c.noise === 'phys'){
    /* R108：量子轨迹路径（rng 必需——跳变与测量都随机；页面/测试都传 rng） */
    const r = qecExecPhys(circ, { rng, cfg: c });
    const ref = qecRef(circ);
    const cl = qecClass(r.pre, ref, r.F);
    const trace = [];
    trace.push({ step: 'prepare', gate: 'Ry(θ)Rz(φ)' });
    trace.push({ step: 'encode', gate: 'CNOT×' + (nEnc - 1) });
    if (c.code === 'phaseflip') trace.push({ step: 'basis', gate: 'H×' + nEnc });
    trace.push({ step: 'noise', errors: r.errors.slice() });
    trace.push({ step: 'gatenoise', faults: r.fired.slice() });
    trace.push({ step: 'syndrome', syn: r.syn.slice(), synVoted: r.synVoted.slice(), synTrue: r.synTrue.slice(), flips: r.flips.slice(), bitErr: r.bitErr.slice() });
    trace.push({ step: 'correct', q: r.fixQ, qs: r.fixQs.slice() });
    if (c.code === 'phaseflip') trace.push({ step: 'basis', gate: 'H×' + nEnc });
    trace.push({ step: 'decode', gate: 'CNOT×' + (nEnc - 1) });
    return {
      errors: r.errors, syn: r.syn, synVoted: r.synVoted, synTrue: r.synTrue, synFrame: r.synFrame, flips: r.flips, bitErr: r.bitErr, fixQ: r.fixQ, fixQs: r.fixQs,
      F: r.F, logicalError: r.logicalError, ok: !r.logicalError,
      trace,
      p0: r.p0, p1: r.p1,
      state: r.state,
      noise: 'phys', rd: c.rd, n: nEnc,
      /* 探针五分类（轨迹态是纯态，分类照常）；帧分类仅 frameOK 时有效 */
      cls: cl.cls, coset: cl.coset, sX: cl.sX, sY: cl.sY, sZ: cl.sZ,
      clsDec: r.clsDec, cosetDec: r.cosetDec, synFrame: r.synFrame, pre: r.pre,
      faults: r.fired, frameOK: r.frameOK,
    };
  }
  const ref = qecRef(circ);
  const r = qecExec(circ, { rng, cfg: c, faults: c.faults || null });
  const cl = qecClass(r.pre, ref, r.F);
  const trace = [];
  trace.push({ step: 'prepare', gate: 'Ry(θ)Rz(φ)' });
  trace.push({ step: 'encode', gate: 'CNOT×' + (nEnc - 1) });
  if (c.code === 'phaseflip') trace.push({ step: 'basis', gate: 'H×' + nEnc });
  if (c.noise === 'gate'){
    trace.push({ step: 'gatenoise', faults: r.fired.slice() });
  } else {
    trace.push({ step: 'noise', errors: r.errors.slice() });
  }
  trace.push({ step: 'syndrome', syn: r.syn.slice(), synVoted: r.synVoted.slice(), synFrame: r.synFrame.slice() });
  trace.push({ step: 'correct', q: r.fixQ, qs: r.fixQs.slice() });
  if (c.code === 'phaseflip') trace.push({ step: 'basis', gate: 'H×' + nEnc });
  trace.push({ step: 'decode', gate: 'CNOT×' + (nEnc - 1) });
  return {
    errors: r.errors, syn: r.syn, synVoted: r.synVoted, fixQ: r.fixQ, fixQs: r.fixQs, F: r.F, logicalError: r.logicalError,
    ok: !r.logicalError,
    trace,
    /* 码字振幅（|0…0⟩ 与 |1…1⟩ 的模方，解码后应分别在 |0…0⟩/|100…⟩ 上） */
    p0: r.p0, p1: r.p1,
    state: r.state,
    /* ---- R86 门级噪声新增 ---- */
    noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase, rd: c.rd, n: nEnc,
    faults: r.fired, cls: cl.cls, coset: cl.coset, sX: cl.sX, sY: cl.sY, sZ: cl.sZ,
    clsDec: r.clsDec, cosetDec: r.cosetDec, synFrame: r.synFrame, pre: r.pre,
  };
}

/* ============================================================================
 * 流式试验累加器（R98 P2）：step(count) 分帧跑 count 次并入累加器，
 * result() 出当前统计（trials = 已跑次数，随帧增长）。qecEnsemble 为
 * 薄封装——同一 rng 消耗序，数值与逐位一致（pot 套件不变）。
 * ========================================================================== */
export function qecStream(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const phys = c.noise === 'phys';
  const rd = qecNormRd(c.rd);
  const n = qecNormN(c.n);
  const circ = qecCircuit(c.code, c);
  const ref = qecRef(circ);
  const rng = mulberry32(c.seed);
  let nTrials = 0;
  let nL = 0, nLdec = 0;
  /* R110：直方图宽度随码长走——byCount 0..n 个数据错、synCount 2^{n−1} 种
     表决后综合、byBitErr 0..n−1 个稳定子表决错位、byFlip 0..(n−1)·rd 个
     记录位被翻。n=3, rd=1 时形状与 R108/R109 逐位相同（零回归）。 */
  const byCount = new Array(n + 1).fill(0);   /* 0..n 个错（i.i.d. 口径；phys 的静态数据错） */
  const byCountL = new Array(n + 1).fill(0);  /* 其中判成逻辑错误的 */
  const synCount = new Array(1 << (n - 1)).fill(0);  /* 2^{n−1} 种综合的频次（R109：表决后的综合） */
  const fates = { perfect: 0, gauge: 0, outside: 0, logic: 0, mixed: 0 };  /* 探针（码空间） */
  const fatesDec = { perfect: 0, gauge: 0, logic: 0 };                     /* 解码后（逻辑比特） */
  /* R108 phys 专属：综合征读出翻转按个数分解（0..(n−1)·rd 个重复被翻）。
     R109：另加**表决后**错位分解（0..n−1 个稳定子位错）——voting 的直接度量。 */
  const nFlip = (n - 1) * rd;
  const byFlip = new Array(nFlip + 1).fill(0), byFlipL = new Array(nFlip + 1).fill(0);
  const byBitErr = new Array(n).fill(0), byBitErrL = new Array(n).fill(0);
  let flipSum = 0, bitErrSum = 0, jumpSum = 0, frameMissSum = 0, noFrame = 0;
  const faultHist = {};
  let faultSum = 0, synMiss = 0, randomMeas = 0, disagree = 0, disagreeBlind = 0, blind = 0;
  function one(){
    if (phys){
      const r = qecExecPhys(circ, { rng, cfg: c });
      const cl = qecClass(r.pre, ref, r.F);
      fates[cl.cls]++;
      if (r.frameOK){ fatesDec[r.clsDec]++; if (r.clsDec === 'logic') nLdec++; }
      else noFrame++;
      if (r.logicalError) nL++;
      if (r.diag.frameMiss) frameMissSum++;
      const ec = r.errors.length;
      byCount[ec]++;
      if (r.logicalError) byCountL[ec]++;
      const nf = r.flips.reduce((a, b) => a + b, 0);
      const ne = r.bitErr.reduce((a, b) => a + b, 0);
      byFlip[nf]++;
      if (r.logicalError) byFlipL[nf]++;
      byBitErr[ne]++;
      if (r.logicalError) byBitErrL[ne]++;
      flipSum += nf;
      bitErrSum += ne;
      jumpSum += r.fired.length;
      synCount[r.synVoted.reduce((a, b) => a * 2 + b, 0)]++;
      nTrials++;
      return;
    }
    const r = qecExec(circ, { rng, cfg: c });
    const cl = qecClass(r.pre, ref, r.F);
    fates[cl.cls]++;
    fatesDec[r.clsDec]++;
    if (r.clsDec === 'logic') nLdec++;
    if (r.logicalError) nL++;
    if (r.diag.synMiss) synMiss++;
    if (r.diag.random) randomMeas++;
    /* 交叉校验：探针分类 vs 帧陪集分类（同点、同残差）。唯一合法的不一致是
       修正点盲逻辑：帧见 logic 陪集而探针沉默（cl.cls='perfect'）——残差
       L∥参考 Bloch 向量，各逻辑期望都不翻，F_fix=1。注意解码后稳定子部分
       的 Z₀ 可把盲逻辑污染成真失败（Y_L·Z₀Z₁ 解码成 X₀），故不承诺 F_end；
       断言 disagree ≡ disagreeBlind（任何其他 mismatch 都是帧/探针真分歧）。 */
    const frameCls = r.cosetFix === 0 ? 'perfect'
      : r.cosetFix > 0 ? 'logic'
      : (r.F > 1 - 1e-9 ? 'gauge' : 'outside');
    if (frameCls !== cl.cls){
      disagree++;
      if (cl.cls === 'perfect' && r.cosetFix > 0) disagreeBlind++;
    }
    /* 盲区登记（末端）：帧（解码后陪集）说 logic 而 F≥0.5——本征态上逻辑
       残差作用等于恒等（|+i⟩ 上的 Y_L），物理上不是失败 */
    if (r.clsDec === 'logic' && !r.logicalError) blind++;
    if (c.noise !== 'gate'){
      const ec = r.errors.length;
      byCount[ec]++;
      if (r.logicalError) byCountL[ec]++;
    } else {
      const nf = r.fired.length;
      faultHist[nf] = (faultHist[nf] || 0) + 1;
      faultSum += nf;
    }
    synCount[r.synVoted.reduce((a, b) => a * 2 + b, 0)]++;
    nTrials++;
  }
  return {
    get total(){ return Math.max(1, c.trials | 0); },
    get n(){ return nTrials; },
    step(count){ for (let k = 0, m = Math.max(0, count | 0); k < m; k++) one(); },
    result(){
      const nn = Math.max(1, nTrials);   /* 防御 0 次 → 除 0；正常路径 n≥1 */
      return {
        p: c.p, code: c.code, trials: nTrials, PL: nL / nn, PLdec: nLdec / nn,
        /* PLexact：i.i.d. 模式 = 解析 Σ_{w>t}C(n,w)p^w(1−p)^{n−w}；gate / phys
           模式 = DP-over-frames 精确值（phys 且 γ/λ>0 时返回 NaN——非 Pauli
           通道无精确解，诚实标注） */
        PLexact: c.noise === 'iid' ? qecLogicalRate(c.p, n) : qecExactPL(c), Pun: c.p,
        noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase, rd, n,
        byCount, byCountL, synCount,
        fates, fatesDec, faultHist,
        meanFaults: c.noise === 'gate' ? faultSum / nn : NaN,
        meanFaultsIID: c.noise === 'gate' ? NaN : byCount.reduce((a, v, k) => a + k * v, 0) / nn,
        /* R108 phys：读出翻转统计（iid/gate 恒 0，字段形状保持稳定）。
           R109：byFlip 长度 (n−1)·rd+1（平铺重复的翻转直方图）；byBitErr 是
           **表决后**错位直方图（0..n−1 个稳定子位错）——voting 效果的度量 */
        byFlip: phys ? byFlip.slice() : [nn, ...new Array(nFlip).fill(0)],
        byFlipL: phys ? byFlipL.slice() : new Array(nFlip + 1).fill(0),
        byBitErr: phys ? byBitErr.slice() : [nn, ...new Array(n - 1).fill(0)],
        byBitErrL: phys ? byBitErrL.slice() : new Array(n).fill(0),
        meanFlips: phys ? flipSum / nn : 0,
        meanBitErr: phys ? bitErrSum / nn : 0,
        meanJumps: phys ? jumpSum / nn : 0,
        frameMiss: phys ? frameMissSum : 0,
        noFrame: phys ? noFrame : 0,
        physParams: phys ? { t1: c.t1, t2: c.t2, tg: c.tg, pd: c.pd, re: c.re, peq: c.peq } : null,
        synMiss, randomMeas, disagree, disagreeBlind, blind,
        stats: circ.stats,
      };
    },
  };
}

/* 一次性全批（页面既有口径）：同一 rng 消耗序 ⟹ 数值与流式逐位一致 */
export function qecEnsemble(cfg = {}){
  const s = qecStream(cfg);
  s.step(s.total);
  return s.result();
}

/* 解析：P_L = Σ_{w>t} C(n,w)·p^w·(1−p)^{n−w}，t=(n−1)/2（最小权重解码下
   权重 >t 的数据错误必致逻辑错误——补集更轻、解码器修错边）。
   n=3 ⟹ 3p²(1−p)+p³ = 3p²−2p³ · n=5 ⟹ 10p³−15p⁴+6p⁵（与 ε_5 同形）·
   n=7 ⟹ 35p⁴−84p⁵+70p⁶−20p⁷ · n=9 ⟹ 126p⁵−420p⁶+540p⁷−315p⁸+70p⁹
   （可读标签由 qecLogicalRateLab 程序展开，不手抄）。 */
export function qecLogicalRate(p, n = 3){
  const N = qecNormN(n);
  const t = (N - 1) / 2;
  let s = 0;
  for (let w = t + 1; w <= N; w++){
    let binom = 1;
    for (let i = 0; i < w; i++) binom = binom * (N - i) / (i + 1);
    s += binom * Math.pow(p, w) * Math.pow(1 - p, N - w);
  }
  return s;
}
/* 阈值：P_L(p) = p ⟹ p = 1/2（P_L(1/2)=Σ_{w>t}C(n,w)/2ⁿ = 1/2——奇数 n 的
   二项尾率恒等式；另一根 p=1 是退化解） */
export function qecThreshold(){ return 0.5; }

/* R112：解析式的可读标签（面板/HUD/图例用）——由 qecLogicalRate 的系数**程序
   展开**（不手抄，防抄错）：
   n=3 ⟹ 3p²−2p³ · n=5 ⟹ 10p³−15p⁴+6p⁵
   n=7 ⟹ 35p⁴−84p⁵+70p⁶−20p⁷ · n=9 ⟹ 126p⁵−420p⁶+540p⁷−315p⁸+70p⁹ */
export function qecLogicalRateLab(n = 3){
  const N = qecNormN(n);
  const t = (N - 1) / 2;
  const coef = new Array(N + 1).fill(0);
  for (let w = t + 1; w <= N; w++){
    let binom = 1;
    for (let i = 0; i < w; i++) binom = binom * (N - i) / (i + 1);
    /* p^w(1−p)^{N−w} = Σ_j C(N−w,j)·(−1)^j·p^{w+j} */
    for (let j = 0; j <= N - w; j++){
      let b2 = 1;
      for (let i = 0; i < j; i++) b2 = b2 * (N - w - i) / (i + 1);
      coef[w + j] += binom * b2 * (j % 2 ? -1 : 1);
    }
  }
  const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  const parts = [];
  for (let k = t + 1; k <= N; k++){
    const v = coef[k];
    if (!v) continue;
    parts.push((v < 0 ? '−' : parts.length ? '+' : '') + Math.abs(v) + 'p' + SUP[k]);
  }
  return parts.join('');
}

/* R109：读出表决重复数归一（页面/URL 只暴露 1/3/5；非法值归一到 1） */
export function qecNormRd(rd){
  const k = Math.round(Number(rd));
  if (k === 3 || k === 5) return k;
  return 1;
}
/* R109：多数表决后的有效读出误差
     ε_k = P(k 次独立翻转中 ≥⌈k/2⌉ 次为 1) = Σ_{j≥⌈k/2⌉} C(k,j)ε^j(1−ε)^{k−j}
   k=1 ⟹ ε · k=3 ⟹ 3ε²−2ε³ · k=5 ⟹ 10ε³−15ε⁴+6ε⁵。
   ε<1/2 时随 k 严格递减（表决有益）；ε≥1/2 时 ε_k≥1/2（表决无益——多数
   本身不可信）。空数组/奇数平局按 0（防御；正常 rd 为奇数不会平局）。 */
export function qecVoteErr(k, eps){
  const K = qecNormRd(k);
  const e = Math.max(0, Math.min(1, Number(eps) || 0));
  let s = 0;
  for (let j = Math.ceil(K / 2); j <= K; j++){
    let binom = 1;
    for (let i = 0; i < j; i++) binom = binom * (K - i) / (i + 1);
    s += binom * Math.pow(e, j) * Math.pow(1 - e, K - j);
  }
  return s;
}
/* R109：一组经典位的多数（>半数判 1；空/平局判 0——rd 恒奇数，平局不出现） */
export function qecMajority(bits){
  let s = 0;
  for (const b of bits) s += b ? 1 : 0;
  return s * 2 > bits.length ? 1 : 0;
}

/* 扫描：对一组 p 各跑一批（页面曲线用；pot78 用大 trials）。
   gate 模式追加 DP-over-frames 精确曲线（PLexact 列），MC 点照常。

   R117：拆成 `qecSweepPlan` + 逐点 `step(i)`。目的有二：
     1) 页面可以**逐点绘制**（n=5·rd=3 的一次 6 点扫描 = 6 × 9.1s ≈ 54s，同步跑
        会把主线程冻住整整一分钟、期间连进度都没有）；
     2) 每个点算完立刻可复用（DP 记忆化见 qecExactPL），中断/改样本数不重算。
   `qecSweep` 保留为同步包装（pot 套件与导出仍用它），行为与拆分前**逐位一致**。 */
export function qecSweepPlan(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const gate = c.noise === 'gate';
  const phys = c.noise === 'phys';
  const ps = c.ps || (gate
    ? Array.from({ length: 16 }, (_, i) => 0.002 * Math.pow(0.3 / 0.002, i / 15))
    : [0.002, 0.005, 0.01, 0.02, 0.04, 0.07, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5]);
  const step = i => {
    const p = ps[i];
    const row = { p, PL: NaN, PLexact: NaN, Pun: p };
    if (gate){
      row.PLexact = qecExactPL({ ...c, p });
      row.PL = qecEnsemble({ ...c, p, trials: c.sweepTrials || 1200 }).PL;
    } else if (phys){
      /* R108：DP 精确（γ/λ>0 时 NaN）+ MC（密度矩阵，默认 900 次/点） */
      row.PLexact = qecExactPL({ ...c, p });
      row.PL = qecEnsemble({ ...c, p, trials: c.sweepTrials || 900 }).PL;
    } else {
      const e = qecEnsemble({ ...c, p });
      row.PL = e.PL; row.PLexact = e.PLexact;
    }
    return row;
  };
  return {
    ps, step, length: ps.length,
    noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase, cfg: c,
  };
}

export function qecSweep(cfg = {}){
  const plan = qecSweepPlan(cfg);
  const out = { p: [], PL: [], PLexact: [], Pun: [], noise: plan.noise, spectrum: plan.spectrum, noisyPhase: plan.noisyPhase };
  for (let i = 0; i < plan.length; i++){
    const r = plan.step(i);
    out.p.push(r.p);
    out.Pun.push(r.Pun);
    out.PLexact.push(r.PLexact);
    out.PL.push(r.PL);
  }
  return out;
}


/* R112/R113：DP-over-frames 状态空间预算。末态键 = 数据帧（x/z 各 n 位 ⟹ ≤2^{2n}）
   × 投票字段（nStab·VB 位 ⟹ ≤2^{(n−1)·VB}），门分支（gate / phys·pd>0·λ>0）
   下真实状态数逼近这个上界（ancilla 帧位测后即弃，只余 ±1 个在测 ancilla 的
   2 位 ⟹ 额外 ×2）。
   ⚠ R113：R112 首版把在测 ancilla 的余位按 ×4 估，与实测不符——**实测峰值
   一律是 2^{2n}·2^{(n−1)VB}·2**（dbg113 逐步插桩，depolar / extract 段）：

     n=3 rd=1 ⟹ 2^9   = 512       / 毫秒级      （旧估 2^10）
     n=5 rd=1 ⟹ 2^15   = 32768     / 123ms       （旧估 2^16）
     n=5 rd=3 ⟹ 786432 ≈ 0.75·2^20 / 9.0s        （旧估 2^20，略低估 1.5×）
     n=7 rd=1 ⟹ 2^21   = 2097152   / 5.3s        （旧估 2^22 ⟹ 被 1.2e6 误杀）
     n=9 rd=1 ⟹ ~2^27                            ⟹ 122s 后 Map maximum size
                                                    exceeded（页面崩，真崩）

   ⟹ R113 把因子改成 ×2 并把 cap 提到 2.5e6：**n=7·rd=1 门级恢复精确解**
   （2.1e6 < 2.5e6，5.3s），n=9（1.3e8）与 n=5·rd=5（8.4e6）仍拒。
   估算本身有 ±1.5× 误差 ⟹ 除前置估算外再加**运行时硬顶**（每步检查
   dist.size，超 cap 立即返 NaN）：估算偏乐观也不会重演「122s 后崩页」。
   iid / phys 无门分支（pd=λ=0）不乘门分支熵 ⟹ 状态数 ≈2^n×投票，
   n=9 也只有 7ms（实测），不受本预算约束。 */
export const QEC_DP_STATE_CAP = 2.5e6;
/* R113：DP「每点很贵」阈值（不是预算——只用来决定扫描点数：昂贵的配置少扫
   几点）。n=7·rd=1 门级 nq=13 **不算重配置**（态矢 MC 很快），但它的 DP 是
   5.3s/点 ⟹ 18 点扫描 = 95s，比 n=5·rd=3（重配置、6 点、54s）还慢。真正的
   驱动量是 DP 状态数，不是 nq ⟹ 单独设一个阈值 2^17（n=5·rd=1 的 2^15 恰好
   在其下，18 点不变；n=5·rd=3 与 n=7·rd=1 在其上，降到 6 点）。 */
export const QEC_DP_HEAVY = 1 << 17;
/* 状态空间上界（0 = 无门分支，不受预算约束） */
export function qecDpStates(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const circ = qecCircuit(c.code, c);
  const rd = qecNormRd(c.rd);
  const gate = c.noise === 'gate', phys = c.noise === 'phys';
  let branching = false;
  if (gate) branching = c.p > 0;
  if (phys){
    const np = qcnNoiseParams(c.t1, c.t2, c.tg, c.pd, c.re, c.peq);
    branching = np.pdep > 0 || np.lambda > 0;
  }
  if (!branching) return 0;
  const VB = Math.max(1, Math.ceil(Math.log2(rd + 1)));
  return Math.pow(2, 2 * circ.n) * Math.pow(2, (circ.n - 1) * VB) * 2;
}
export function qecDpOverBudget(cfg = {}){
  const est = qecDpStates(cfg);
  return est > QEC_DP_STATE_CAP;
}
/* R113：扫描点数降级判据（与预算无关：超预算 ⟹ NaN 根本不跑；本函数针对
   「能跑但每点很贵」的配置） */
export function qecDpHeavy(cfg = {}){
  return qecDpStates(cfg) >= QEC_DP_HEAVY;
}

/* ============================================================================
 * DP-over-frames 精确解：P_L(p) 的精确多项式（零统计误差）
 *
 * 帧空间 2^{2·nq}（nq = n+(n−1)·rd 个比特的 x/z 掩码；R109 前 ancilla 恒 2、
 * n=3 rd=1 时 nq=5 ⟹ 1024）× 投票字段 (n−1)·VB 位，每个门后按谱分支；测量读帧
 * 的 x 位（确定）、修正查表（确定）、解码传播（确定）⟹ 全程无随机分支，末态
 * 帧完全决定结局。与态矢 MC 是两套独立表示，4σ 对账。
 *
 * R108 扩展（三种口径统一到同一 DP）：
 *   · iid  ：静态数据块（率 p，spec.err）+ 无门分支 + 无读出翻转
 *   · gate ：无静态块 + 门分支（率 p，谱 = c.spectrum）
 *   · phys ：静态数据块（率 p）+ 门分支（退极化率 p_dep，谱恒退极化 X/Y/Z 各
 *             1/3——退极化通道 ≡ 随机 Pauli 注入的系综）+ **相位阻尼**（Z 注入
 *             率 λ/2：Kraus E₁=√(λ/2)·Z 的 Pauli 通道展开）+ **读出翻转**（每位
 *             测量以概率 ε 把记录综合征翻过来；量子态/帧不受影响，纯经典分支）
 *   · 守卫：phys 且 γ>0 ⟹ 返回 NaN。振幅阻尼/热激发不是 Pauli，帧无法表示——
 *     非 Pauli 通道没有零统计误差的精确解（诚实限制）。退极化、相位阻尼、读出
 *     翻转都是 Pauli/经典可表示的，照样给精确值。
 *
 * R109 扩展（容错读出表决）：测量分支从「记录位直接落 syn」升级为「按 ε 翻后
 *   累加投票计数」，修正分支按计数 >rd/2 表决。rd=1 时计数 ≡ 记录位，与 R108
 *   逐位一致；表决后有效读出误差 ε_k 由 DP 自然给出（p=0 时精确 = ε_k(1−ε_k)）。
 * ========================================================================== */
/* R117：DP 结果记忆化。DP 只依赖「电路 + 噪声参数 + p」，**与 trials 无关** ——
   而 trials 在 `_curveKey` 里 ⟹ 拖样本数滑块会触发整轮重扫。对 n=7·rd=1（6 点 ×
   5.3s ≈ 32s）这是纯浪费：DP 一分不变，只有 MC 需要重跑。
   键取「DP 真正读到的全部字段」，显式列出而不是 JSON.stringify(cfg)——后者会把
   trials/sweepTrials/seed 这些无关字段混进来，缓存直接失效。
   只缓存有限值：预算守卫/γ>0 的 NaN 是立刻返回的，缓存它们没有收益。 */
const QEC_DP_MEMO = new Map();
const QEC_DP_MEMO_MAX = 256;
const QEC_DP_STATS = { hit: 0, miss: 0 };
function qecDpKey(c){
  return [
    c.code, qecNormN(c.n), qecNormRd(c.rd), c.noise, c.spectrum, c.noisyPhase,
    Math.max(0, Math.min(1, c.p)), c.theta, c.phase,
    c.t1, c.t2, c.tg, c.pd, c.re, c.peq,
  ].join('|');
}
export function qecDpCacheStats(){ return { size: QEC_DP_MEMO.size, hit: QEC_DP_STATS.hit, miss: QEC_DP_STATS.miss }; }
export function qecDpCacheClear(){ QEC_DP_MEMO.clear(); QEC_DP_STATS.hit = 0; QEC_DP_STATS.miss = 0; }

export function qecExactPL(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const key = qecDpKey(c);
  const hit = QEC_DP_MEMO.get(key);
  if (hit !== undefined){ QEC_DP_STATS.hit++; return hit; }
  QEC_DP_STATS.miss++;
  const v = qecExactPLUncached(c);
  if (Number.isFinite(v)){
    QEC_DP_MEMO.set(key, v);
    if (QEC_DP_MEMO.size > QEC_DP_MEMO_MAX) QEC_DP_MEMO.delete(QEC_DP_MEMO.keys().next().value);
  }
  return v;
}

function qecExactPLUncached(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const circ = qecCircuit(c.code, c);
  const gate = c.noise === 'gate';
  const phys = c.noise === 'phys';
  const noisyAll = c.noisyPhase === 'all';
  const noisyPh = gate || phys ? (noisyAll ? ['encode', 'extract', 'decode'] : ['extract']) : [];
  /* R109：表决重复数（与 qecCircuit 同一归一函数——DP 的键宽由它定） */
  const rd = qecNormRd(c.rd);
  /* R108：phys 的物理参数（守卫 + 门分支率 + 读出翻转率） */
  const np = phys ? qcnNoiseParams(c.t1, c.t2, c.tg, c.pd, c.re, c.peq) : null;
  if (phys && np.gamma > 0) return NaN;   /* 振幅阻尼/热激发非 Pauli：无精确解（λ 有 Z 分支，仍精确） */
  /* R112：DP 状态空间预算守卫（n=9·门分支 ⟹ ~3×10⁸ 状态，实测 Map 爆容量）。
     预算外直接 NaN——与 γ>0 同一诚实口径，页面转「仅 MC」。 */
  if (qecDpOverBudget(c)) return NaN;
  const eps = phys ? np.eps : 0;
  const W = gate ? qecSpecW(c.spectrum) : qecSpecW('depolar');   /* phys 门通道恒退极化谱 */
  const gateP = gate ? Math.max(0, Math.min(1, c.p)) : (phys ? np.pdep : 0);
  const p = Math.max(0, Math.min(1, c.p));
  const spec = circ.spec;
  /* R109/R110：键 = 「帧数:投票数」**字符串**。帧数 = x·2^NB+z（NB=nq；双精度
     整数精确区 <2^50），投票数 = Σᵢ(vᵢ<<(i·VB))（vᵢ = 第 i 个稳定子的投票计数，
     0..rd 个记录位里判 1 的个数——读出翻转在 meas 分支按 ε 累加）。rd=1 时计数
     ≡ 记录位本身，与 R108 布局同构。VB/SH 由 rd/n 定：n=3 rd=1 ⟹ VB=1,SH=2 ·
     n=3 rd=3 ⟹ VB=2,SH=4 · n=5 rd=1 ⟹ VB=1,SH=4；稳定子数 = n−1（n=5 ⟹ 4）。
     ⚠ R110：**不能**把帧和投票 packing 进同一个整数——JS 位运算只有 32 位，而
     n=5 rd=3 的帧键需 2·17+8=42 位（n=5 rd=5 时 62 位）：((x<<NB)|z)<<SH 的
     `<<` 静默截断，ancilla q≥7 的帧位（键位 ≥32）被吃掉 ⟹ 表决恒读 0 ⟹ DP
     与 MC 差 24σ+。n=3 rd≤5 与 n=5 rd=1 键宽 ≤32 位不越界，所以 R109 全绿——
     泛化到 n=5 rd≥3 才暴露（pot110 ② 节抓出）。帧数/投票数分列、用算术
     （×,+）打包，53 位尾数内精确；解析每状态只做一次（内循环携带元组）。 */
  const nn = circ.n, nStab = nn - 1;
  const NB = circ.nq;
  const VB = Math.max(1, Math.ceil(Math.log2(rd + 1)));
  const SH = nStab * VB;
  const VMASK = (1 << VB) - 1;
  const P2 = Math.pow(2, NB);              /* 帧数打包基（frame = x·P2+z < 2^{2NB}） */
  /* R121：键改成**数值**（原来 frame + ':' + votes 的字符串）。DP 主体对键类型
     无感知 ⟹ 只换这两个函数即可，逐位一致性与加速比都用「两份源码对照」测过：
     n=3/5·rd=1、n=3·rd=1·iid、n=5·rd=3、n=7·rd=1 五组 **Object.is 全 OK**（插入
     顺序不变 ⟹ 加法顺序不变），加速 1.50×～2.13×（n=5·rd=3：8.68s→4.08s）。
     数值范围：votes < 2^SH，frame < 2^{2NB} ⟹ 键 < 2^{2NB+SH} ≤ 2^44 ≪ 2^53。 */
  const VBASE = Math.pow(2, SH);
  const keyOf = (x, z, votes) => (x * P2 + z) * VBASE + votes;
  const unpack = (k) => {
    const votes = k % VBASE;
    const f = (k - votes) / VBASE;
    const x = (f / P2) | 0;
    return { x, z: f - x * P2, votes };
  };
  let dist = new Map([[keyOf(0, 0, 0), 1]]);
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  for (const o of circ.ops){
    /* R113：运行时硬顶。前置估算有 ±1.5× 误差（实测 n=5·rd=3 低估 1.5×），
       这道闸是「绝不重演 n=9 的 122s 后 Map 爆容量崩页」的最后保险：中途
       超容量立即放弃、返 NaN（页面转「仅 MC」，与预算外同一诚实口径）。 */
    if (dist.size > QEC_DP_STATE_CAP) return NaN;
    if (o.op === 'noise'){
      if (gate) continue;                    /* 门级模式：没有静态块（phys 保留） */
      /* i.i.d./phys：逐数据比特独立以 p 施加 spec.err */
      const next = new Map();
      for (const [k, v] of dist){
        const u = unpack(k);
        /* cur: [x, z, votes, w] 元组数组（同键多条由末尾 add 合并） */
        let cur = [[u.x, u.z, u.votes, v]];
        for (let q = 0; q < nn; q++){
          const nx = [];
          for (const [x, z, s, w] of cur){
            nx.push([x, z, s, w * (1 - p)]);
            const b = 1 << q;
            const x2 = spec.err === 'x' ? (x ^ b) : x;
            const z2 = spec.err === 'z' ? (z ^ b) : z;
            nx.push([x2, z2, s, w * p]);
          }
          cur = nx;
        }
        for (const [x, z, s, w] of cur) add(next, keyOf(x, z, s), w);
      }
      dist = next;
      continue;
    }
    if (o.op === 'meas'){
      /* 真实位 = 帧的 x 位（确定：量子态按理想投影坍缩，翻转只发生在经典记录上）。
         R109：记录位按 ε 独立翻后**累加**到该稳定子的投票计数（不直接定位）——
         同一次测量的两个分支只差这一个计数位，rep 之间的独立性由「每次 meas
         各自分支」天然保证。
         ⚠ 性能关键（rd>1）：测后**清除该 ancilla 的帧位**（x/z 都清）。每个
         ancilla 只在自己的 rep 用一次、测后再无门触及它——它的帧位是死位，
         清掉不改变任何后续判定（末态只读数据位），但让状态数从 2^{2·nq}×投票
         回落到数据帧量级（rd=3 时 DP 从 >16M 状态/13.5s 回到 <2k 状态/毫秒级）。
         这与「帧预测 synMiss」无关——预测发生在清除之前。 */
      const next = new Map();
      const dead = ~(1 << o.q);                 /* 清该比特的 x/z 帧位 */
      const si = o.stab;
      for (const [k, v] of dist){
        const u = unpack(k);
        /* R110：只动 si 这一个稳定子的投票字段；其余稳定子已累加的计数原样
           保留（sBase = 全部投票字段挖掉 si 位）——提取顺序是「stab0 的 rd 次
           → stab1 的 rd 次 → …」，先测的稳定子计数要活到 fix 分支。 */
        const vS = (u.votes >> (si * VB)) & VMASK;
        const tb = (u.x >> o.q) & 1;
        const x2 = u.x & dead, z2 = u.z & dead;  /* ancilla 帧位作废（测后即弃） */
        const sBase = u.votes & ~(VMASK << (si * VB));
        if (eps > 0){
          add(next, keyOf(x2, z2, sBase | ((vS + (tb ^ 1)) << (si * VB))), v * eps);   /* 记录位被翻 */
          add(next, keyOf(x2, z2, sBase | ((vS + tb) << (si * VB))), v * (1 - eps));   /* 记录位正确 */
        } else {
          add(next, keyOf(x2, z2, sBase | ((vS + tb) << (si * VB))), v);
        }
      }
      dist = next;
      continue;
    }
    if (o.op === 'fix'){
      const next = new Map();
      for (const [k, v] of dist){
        const u = unpack(k);
        /* R109：表决 = 计数严格过半（rd 恒奇数，无平局）；rd=1 时 ≡ 取记录位。
           R110：n−1 个稳定子逐一表决 → n−1 位综合征 → 最小权重修正**列表**
           （n=5 可返回两位，如综合征 [0,0,1,0] → 修 q3,q4）。 */
        const voted = [];
        for (let si = 0; si < nStab; si++){
          voted.push(((u.votes >> (si * VB)) & VMASK) * 2 > rd ? 1 : 0);
        }
        const fixQs = qecFixFromSyndrome(voted, nn);
        let x2 = u.x, z2 = u.z;
        for (const fq of fixQs){
          const b = 1 << fq;
          if (spec.fix === 'x') x2 ^= b; else z2 ^= b;
        }
        /* 修正后投票字段失去意义（后面只读帧）——抹平合并，控制状态数 */
        add(next, keyOf(x2, z2, 0), v);
      }
      dist = next;
      continue;
    }
    /* 普通门：帧传播（确定）+ 门后注错（按谱分支；gate 率 p，phys 率 p_dep） */
    const next = new Map();
    for (const [k, v] of dist){
      const u = unpack(k);
      const fr = { x: u.x, z: u.z };
      qcFrGate(fr, o);
      let cur = [[fr.x, fr.z, u.votes, v]];
      if (gateP > 0 && o.ph !== 'prep' && noisyPh.includes(o.ph)){
        for (const q of gnTouched(o)){
          const nx = [];
          for (const [x, z, sy, w] of cur){
            nx.push([x, z, sy, w * (1 - gateP)]);
            const b = 1 << q;
            for (const t of ['x', 'y', 'z']){
              if (!W[t]) continue;
              const x2 = (t === 'x' || t === 'y') ? (x ^ b) : x;
              const z2 = (t === 'z' || t === 'y') ? (z ^ b) : z;
              nx.push([x2, z2, sy, w * gateP * W[t]]);
            }
          }
          cur = nx;
        }
      }
      /* R108 phys：相位阻尼 = Z 注入率 λ/2（与退极化独立、可交换，后套一层） */
      if (phys && np.lambda > 0 && o.ph !== 'prep' && noisyPh.includes(o.ph)){
        const phP = np.lambda / 2;
        for (const q of gnTouched(o)){
          const nx = [];
          for (const [x, z, sy, w] of cur){
            nx.push([x, z, sy, w * (1 - phP)]);
            nx.push([x, z ^ (1 << q), sy, w * phP]);
          }
          cur = nx;
        }
      }
      for (const [x, z, sy, w] of cur) add(next, keyOf(x, z, sy), w);
    }
    dist = next;
  }
  /* 末态：q0 约化保真度（解析，R78 口径 F<0.5）。
     Pauli 残差下末态是乘积态 E|ψ_full⟩ = E_q0|ψ₀⟩⊗E_{q1…q_{n−1}}|00…0⟩，
     q1..q_{n−1} 的污位被 partial trace 掉（约化保真度看不见）⟹ F 只由 q0 的
     (x₀,z₀) 决定：
       (0,0)→1 · (1,0)→sin²θcos²φ · (0,1)→cos²θ · (1,1)→sin²θsin²φ
     与态矢 MC 的 PL（qcRhoFidelity on q0）逐点同判据，4σ 对账是同口径。
     注意这与「帧陪集」末态判的区别：本征态盲区（如 |+i⟩ 上的 Y_L）残差作用
     等于恒等，F=1 不是失败——陪集判会过度计数，F 判不会。 */
  const T = c.theta, P = c.phase;
  const fQ0 = (x0, z0) => {
    if (!x0 && !z0) return 1;
    const s = Math.sin(T), c2 = Math.cos(T);
    if (x0 && z0) return s * s * Math.sin(P) * Math.sin(P);
    if (x0) return s * s * Math.cos(P) * Math.cos(P);
    return c2 * c2;
  };
  let PL = 0;
  for (const [k, v] of dist){
    const u = unpack(k);
    if (fQ0(u.x & 1, u.z & 1) < 0.5) PL += v;
  }
  return PL;
}

/* ============================================================================
 * 精确故障枚举（单阶 order=1 / 二阶 order=2）：一阶/二阶系数 c₁、c₂
 *   P_L(p) = c₁·p + c₂·p² + O(p³)
 * 位点 = 每个门（prep/meas/fix/noise 标记除外，且落在 noisyPhase 内）的
 * 每个触及比特 × 3 个 Pauli。每个位点跑一次 qecExec（强制故障、无 rng——
 * 测量确定），按谱加权。两条独立路径交叉校验：探针分类 vs 帧陪集分类。
 *
 * ⚠ c₂ 是**多项式系数**不是原始 pair-sum：DP 模型每个 (门,比特) 机会只抽一次
 * 谱（同机会的不同 Pauli 互斥），且未出错机会贡献 (1−p)^{M−k} 的展开：
 *   c₁ = S1                                  （S1 = logic 单错权重和）
 *   c₂ = S2 − (M−1)·S1                       （S2 = 跨机会 logic 双错权重和）
 * M = 有效机会数 = 落选门数 × |gnTouched|（gate 模式每个机会独立以 p 注错）。
 * 口径与 DP-over-frames 末态判据一致：bucket = 失败（F<0.5，R78 口径），
 * 不是帧陪集的 'logic'（后者在本征态盲区上会过度计数，见 qecExactPL 头注）。
 * ========================================================================== */
export function qecFaultSites(circ){
  const out = [];
  for (let i = 0; i < circ.ops.length; i++){
    const o = circ.ops[i];
    if (o.op === 'meas' || o.op === 'fix' || o.op === 'noise' || o.ph === 'prep') continue;
    for (const q of gnTouched(o)) for (const t of ['x', 'y', 'z']){
      out.push({ gate: i, q, t, ph: o.ph, gop: o.op, stab: o.stab != null ? o.stab : -1 });
    }
  }
  return out;
}

export function qecFaultSurvey(cfg = {}, order = 1){
  const c = { ...QEC_DEFAULTS, ...cfg, noise: 'gate' };
  const circ = qecCircuit(c.code, c);
  const ref = qecRef(circ);
  /* noisyPhase 过滤：'extract' 只枚举提取段；'all' 三段都枚举（与 qecExec 的
     noisyPh 口径一致——survey 与真跑必须同一注错范围，否则 c₁ 与 DP 差一个
     相位因子，R86 冒烟③抓出过：不过滤时 extract 模式的 c₁ 恰好是全部相位的一半） */
  const noisyPh = c.noisyPhase === 'all' ? ['encode', 'extract', 'decode'] : ['extract'];
  const sites = qecFaultSites(circ).filter(s => noisyPh.includes(s.ph));
  const W = qecSpecW(c.spectrum);
  /* 有效机会数 M：同一 (门,比特) 的 3 个 Pauli 位点共享一次谱抽样 */
  const M = new Set(sites.map(s => s.gate + ':' + s.q)).size;
  const byPhase = {};
  const rows = [];
  let cLogic = 0, S2 = 0, disagree = 0, randomN = 0, blindFix = 0;

  const runOne = (faults, site) => {
    const r = qecExec(circ, { faults, rng: null, p: 0, noise: 'gate', spectrum: c.spectrum, cfg: c });
    const cl = qecClass(r.pre, ref, r.F);
    if (r.diag.random) randomN++;
    /* 交叉校验（同点：修正后、解码前）：帧陪集分类 vs 探针五分类。
       唯一允许的不一致是本征态盲区——帧说 logic 而探针说 perfect，此时残差
       L∥参考 Bloch 向量、F=1（不是失败）；断言 disagree ≡ blindFix。 */
    const frameCls = r.cosetFix === 0 ? 'perfect'
      : r.cosetFix > 0 ? 'logic'
      : (r.F > 1 - 1e-9 ? 'gauge' : 'outside');
    if (site && site.ph !== 'decode' && frameCls !== cl.cls){
      disagree++;
      if (r.F > 1 - 1e-9) blindFix++;
    }
    return { r, cl };
  };

  for (const site of sites){
    const { r, cl } = runOne([{ gate: site.gate, q: site.q, t: site.t }], site);
    const w = W[site.t] || 0;
    const fail = r.logicalError;               /* F<0.5：R78/DP 同口径 */
    if (fail) cLogic += w;
    byPhase[site.ph] = byPhase[site.ph] || { n: 0, fail: 0 };
    byPhase[site.ph].n++;
    if (fail) byPhase[site.ph].fail++;
    rows.push({
      ...site, fail, probe: cl.cls, coset: cl.coset, cosetFix: r.cosetFix,
      cosetDec: r.cosetDec, F: r.F,
      wPre: qecFrameWeight(circ.code, r.frAtFix, circ.n), wEnd: qecFrameWeight(circ.code, r.frAtEnd, circ.n),
    });
  }
  if (order >= 2){
    for (let i = 0; i < sites.length; i++){
      for (let j = i + 1; j < sites.length; j++){
        const a = sites[i], b = sites[j];
        /* 同 (门,比特) 机会互斥（一次谱抽样只出一个 Pauli），不计 pair */
        if (a.gate === b.gate && a.q === b.q) continue;
        const { r } = runOne([{ gate: a.gate, q: a.q, t: a.t }, { gate: b.gate, q: b.q, t: b.t }], null);
        if (r.logicalError) S2 += (W[a.t] || 0) * (W[b.t] || 0);
      }
    }
  }
  /* 多项式系数：c₂ = S2 − (M−1)·c₁（(1−p)^{M−1} 展开的二阶项） */
  const c2 = order >= 2 ? S2 - (M - 1) * cLogic : NaN;
  return {
    code: c.code, p: c.p, spectrum: c.spectrum, noisyPhase: c.noisyPhase, order,
    sites: sites.length, M, rows,
    byPhase,
    /* 一阶/二阶系数（P_L ≈ c1·p + c2·p² + O(p³)） */
    c1: cLogic, c2, pairSum: S2,
    PL1: cLogic * c.p,
    stats: circ.stats,
    disagree, blindFix, randomMeas: randomN,
  };
}

/* 单比特/少比特错误的「教科书」对照：给定错误位置集合，综合与修正是否把它纠回。
   R110：n=3 穷举 2³=8 种（与 pot78 A 组逐位一致：fixQ 字段保留旧语义——
   首位修正或 −1）；n=5 穷举 2⁵=32 种，最小权重修正可返回两位（fixQs 数组），
   页面表格按权重 ≤t 过滤展示。 */
export function qecSyndromeTable(n = 3){
  const N = qecNormN(n);
  const rows = [];
  /* 行序 = 权重升序 + 字典序（n=3 时 [], [0], [1], [2], [0,1], [0,2], [1,2],
     [0,1,2] ——与 R78 基线逐行一致；n=5 时 32 行同样「纠得动的排前面」，
     页面按权重 ≤t 过滤展示） */
  const all = [];
  for (let m = 0; m < (1 << N); m++){
    const e = [];
    for (let q = 0; q < N; q++) if (m & (1 << q)) e.push(q);
    all.push(e);
  }
  all.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  });
  for (const e of all){
    const syn = qecSyndromeOf(e, N);
    const fixQs = qecFixFromSyndrome(syn, N);
    /* 修正后的残余错误 = 原错误 ⊕ 修正位集合（集合对称差；应用顺序无关） */
    const res = e.slice();
    for (const fq of fixQs){
      const i = res.indexOf(fq);
      if (i >= 0) res.splice(i, 1); else res.push(fq);
    }
    rows.push({ errors: e, syn, fixQs, fixQ: fixQs.length ? fixQs[0] : -1, residual: res, ok: res.length === 0 });
  }
  return rows;
}

/* ============================================================================
 * R111：未编码公平基线 P_un —— R86 遗留「门级口径下编码是否有益」的对照
 *
 * 背景（R86 的诚实缺口）：门级口径下页面一直拿 P_L 与「未编码 p」比较，并据此
 * 说「p<1/2 时 P_L > p，编码反而更差」。但这两个数**不在同一机会数基准上**——
 * 编码线路在提取段有 M 个错误机会（n=3 时 8/12 个），而「未编码 p」默认的是
 * 单个比特的一次存储错误（1 个机会）。拿 8 个机会的结果比 1 个机会的基线，
 * 得到「编码更差」是基线的错，不是纠错的错。
 *
 * 本轮的公平基线：**同样的噪声机会数**。裸传（1 个数据比特，不做编码/提取/
 * 修正/解码）也经历 M 个机会——物理意义是「同样的门周期 / 同样的时间预算」：
 * 编码把这 M 个机会花在纠错上，裸传把它们花在等待上。
 *
 * 判据（⚠ 别写成「累积 Pauli ≠ I」）：逻辑初态是 |+i⟩（θ=φ=π/2），它的 Bloch
 * 向量沿 +Y ⟹ **Y|+i⟩ = +|+i⟩、F=1** —— Y 是它的稳定子，**Y 错误不可观测**
 * （dbg111b 实测：F(X)=0、F(Y)=1.000000000000、F(Z)=0）。这与 R78「换掉 |+⟩
 * 是因为 X_L 在 |+⟩ 上不可观测」是同族问题：纯态总有一个 Pauli 方向是它的
 * 稳定子，|+i⟩ 换掉了 X 盲区却留下了 Y 盲区。⟹ **致命集合 = {X, Z}**。
 * ⚠ 编码侧同样用保真度判据（qecExec/qecExactPL 都走 F ⟹ 同样漏 Y_L 类，
 *   实测 DP ≡ MC 4σ：z ≤ 0.97）⟹ 两侧盲区口径一致，相对比较仍然公平；
 *   绝对 P_L 若要覆盖 Y 类须换初态或改代数判据（R79 在 Shor 码已这么做）。
 *
 * 于是「M 个机会各注入一个 Pauli」是 Pauli 群 Z₂×Z₂ 上的随机游走，只须投影到
 * 特征标 χ_Y（χ(I)=+1、χ(X)=−1、χ(Y)=+1、χ(Z)=−1）即可得闭式：
 *
 *   P_un = 1 − (1/2)·[ 1 + μ_Y·λ_Y^M ]
 *
 *   λ_Y = K(I) − K(X) + K(Y) − K(Z)      （每机会 Pauli 分布 K 的 χ_Y 特征标）
 *   μ_Y = 1 − 2·p_stat                   （静态块：spec.err ∈ {X,Z} 都与 Y 不对易）
 *
 * 三种谱的闭式（M 个机会、每机会率 p，无静态块）：
 *   退极化（X/Y/Z 各 1/3）：λ_Y = 1−4p/3 ⟹ P_un = (1/2)[1 − (1−4p/3)^M]
 *   x 谱 / z 谱（单一 Pauli）：λ_Y = 1−2p ⟹ P_un = (1/2)[1 − (1−2p)^M]
 *   iid（M=0、静态块率 p）：P_un = 1 − (1/2)[1 + (1−2p)] = **p**（与页面既有
 *     「未编码 p」逐位一致——这正是 R86 的旧基线，它只有 1 个机会）。
 *   小 p 一阶：退极化 ≈ (2/3)M·p（1/3 的注入是 Y、不致命）；x/z 谱 ≈ M·p。
 *
 * 两条诚实边界：
 *   ① 裸传只有 1 个数据比特、无 ancilla ⟹ **没有综合征读出误差**（SPAM 底座
 *      是编码特有的代价）——本基线按保真度口径（终态不测量），不计裸传的最终
 *      读出；若比较「逻辑错误率」，裸传的读出只翻经典记录、不改逻辑态。
 *   ② phys 且 γ>0（振幅阻尼/热激发）非 Pauli ⟹ 随机游走闭式失效 ⟹ 返 NaN
 *      （与 qecExactPL 同一诚实口径）。退极化/相位阻尼仍是 Pauli 可表示的。
 * ========================================================================== */

/* 裸传的机会数与每机会 Pauli 分布（与 qecFaultSites 同一口径 ⟹ M 与 c₁ 同源） */
export function qecUncodedSpec(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const circ = qecCircuit(c.code, c);
  const noisyPh = c.noisyPhase === 'all' ? ['encode', 'extract', 'decode'] : ['extract'];
  /* 有效机会数 M = Σ|gnTouched|（同一 (门,比特) 的 3 个 Pauli 位点共享一次抽样） */
  const M = new Set(qecFaultSites(circ).filter(s => noisyPh.includes(s.ph)).map(s => s.gate + ':' + s.q)).size;
  /* 静态块：iid 与 phys 有（率 p，注入 spec.err）；gate 无（错误挂在门上） */
  const pStat = c.noise === 'gate' ? 0 : c.p;
  let dist = { i: 1, x: 0, y: 0, z: 0 };
  let exact = true, why = '';
  if (c.noise === 'gate'){
    const w = qecSpecW(c.spectrum);
    dist = { i: 1 - c.p, x: c.p * w.x, y: c.p * w.y, z: c.p * w.z };
  } else if (c.noise === 'phys'){
    const g = 1 - Math.exp(-c.tg / Math.max(1e-9, c.t1));
    const lam = 1 - Math.exp(-c.tg / Math.max(1e-9, c.t2));
    if (g > 0){ exact = false; why = 'γ>0：振幅阻尼/热激发非 Pauli，随机游走闭式失效'; }
    /* 每门：先退极化（率 pd，谱恒退极化）后相位阻尼（Z，率 λ/2）——按 qecExecPhys
       同序合成到 Pauli 群上（YZ≡X、XZ≡Y、ZZ≡I，模全局相位） */
    const d3 = c.pd / 3, l2 = lam / 2;
    dist = {
      i: (1 - c.pd) * (1 - l2) + d3 * l2,
      x: d3, y: d3,
      z: d3 * (1 - l2) + (1 - c.pd) * l2,
    };
  }
  return { M, pStat, dist, exact, why, noise: c.noise, spectrum: c.spectrum,
    noisyPhase: c.noisyPhase, specErr: circ.spec.err, n: circ.n };
}

/* Z₂×Z₂ 随机游走闭式（见节首注释）：致命集合 = {X, Z}，只投影到 χ_Y。
   γ>0（非 Pauli）⟹ NaN，与 qecExactPL 同一诚实口径。 */
export function qecUncodedRate(cfg = {}){
  const sp = qecUncodedSpec(cfg);
  if (!sp.exact) return NaN;
  /* χ_Y：I→+1, X→−1, Y→+1, Z→−1 */
  const lamY = sp.dist.i - sp.dist.x + sp.dist.y - sp.dist.z;
  /* 静态块注入 spec.err ∈ {X, Z}，两者 χ_Y 都是 −1 ⟹ μ_Y = 1 − 2p_stat */
  const muY = 1 - 2 * sp.pStat;
  return 1 - 0.5 * (1 + muY * Math.pow(lamY, sp.M));
}

/* 裸传的态矢真跑（1 个比特；与上面的闭式是两套独立表示，4σ 对账）。
   初态 = 编码线路同一个逻辑初态 Ry(θ)Rz(φ)|0⟩；逻辑错误判据 = 保真度 F。 */
export function qecUncodedTrial(cfg = {}, rng){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const sp = qecUncodedSpec(cfg);
  if (!sp.exact) return { logicalError: false, F: NaN, jumps: 0, bad: true };
  const s = qcNewState(1);
  qcApply(s, { op: 'ry', q: 0, theta: c.theta });
  qcApply(s, { op: 'rz', q: 0, theta: c.phase });
  const ideal = { re: Float64Array.from(s.re), im: Float64Array.from(s.im) };
  let jumps = 0;
  /* 静态块（iid / phys）；gate 无静态块 */
  if (sp.pStat > 0 && rng() < sp.pStat){ qcApply(s, { op: sp.specErr, q: 0 }); jumps++; }
  /* M 个门机会：与 gate/phys 同分布（gnSampleError 是单一数据源） */
  for (let k = 0; k < sp.M; k++){
    let t = null;
    if (c.noise === 'gate'){
      t = gnSampleError(c.spectrum, c.p, rng);
    } else if (c.noise === 'phys'){
      t = gnSampleError('depolar', c.pd, rng);
      if (!t){
        const lam = 1 - Math.exp(-c.tg / Math.max(1e-9, c.t2));
        if (rng() < lam / 2) t = 'z';
      }
    }
    if (t){ qcApply(s, { op: t, q: 0 }); jumps++; }
  }
  /* F = |⟨ψ_ideal|ψ⟩|² */
  let re = 0, im = 0;
  for (let j = 0; j < 2; j++){
    re += ideal.re[j] * s.re[j] + ideal.im[j] * s.im[j];
    im += ideal.re[j] * s.im[j] - ideal.im[j] * s.re[j];
  }
  const F = re * re + im * im;
  return { logicalError: F < 1 - 1e-9, F, jumps, bad: false, M: sp.M };
}

/* 裸传系综（MC）：与 qecEnsemble 同形（trials / seed / PL） */
export function qecUncodedEnsemble(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const rng = mulberry32(c.seed);
  const nn = Math.max(1, c.trials | 0);
  let nL = 0, jumpSum = 0;
  for (let k = 0; k < nn; k++){
    const r = qecUncodedTrial(c, rng);
    if (r.bad) return { p: c.p, trials: nn, PL: NaN, PLexact: NaN, M: qecUncodedSpec(c).M, meanJumps: NaN, bad: true };
    if (r.logicalError) nL++;
    jumpSum += r.jumps;
  }
  return { p: c.p, trials: nn, PL: nL / nn, PLexact: qecUncodedRate(c),
    M: qecUncodedSpec(c).M, meanJumps: jumpSum / nn, bad: false };
}

/* 门级「编码是否有益」的临界点：P_L(p) − P_un(p) 的首个变号点（二分 20 步）。
   ⚠ 语义：这是**同机会数基线下的**交点——与 R86 的「P_L = p 交点」（1 个机会的
   基线）不同。返回 null 表示扫过的区间内**同向**：若全程 P_L < P_un 则编码全程
   有益（无阈值），由调用方读端点符号判定（见 endBelow）。 */
export function qecUncodedThreshold(cfg = {}, lo = 1e-4, hi = 0.6){
  const f = p => qecExactPL({ ...cfg, p }) - qecUncodedRate({ ...cfg, p });
  const fLo = Number.isFinite(f(lo)) ? f(lo) : NaN;
  const fHi = Number.isFinite(f(hi)) ? f(hi) : NaN;
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) return null;
  if (fLo * fHi > 0) return null;          /* 同向：无交点 */
  let a = lo, b = hi;
  for (let i = 0; i < 20; i++){
    const m = 0.5 * (a + b);
    if (f(m) * f(a) > 0) a = m; else b = m;
  }
  return 0.5 * (a + b);
}
