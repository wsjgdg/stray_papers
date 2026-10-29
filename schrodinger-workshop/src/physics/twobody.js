/* ============================================================================
 * twobody.js — R72 全同粒子 / 交换对称（双粒子构型空间内核）
 *
 * 物理模型（一维双粒子构型空间 ψ(x₁,x₂)，L×L 格点）：
 *   iℏ∂ψ/∂t = Hψ，  H = −uK(∂²/∂x₁² + ∂²/∂x₂²) + V₁(x₁) + V₂(x₂) + U(x₁−x₂)
 *   uK = 1/(2m)（引擎同款 uniform；本页 m=1 ⟹ uK=0.5），ℏ=1，世界坐标 = texel。
 *
 * 为什么开新页而不是并进主页（README R72 行的原定结论）：
 *   构型空间语义与主页的单粒子 x 空间差异过大（坐标轴是两个粒子的位置、
 *   对角线 x₁=x₂ 是「重合线」、交换算符 P 是一等观测对象），面板/HUD/预设
 *   体系都无法复用；但**离散算子与引擎同族**（5 点交叉 stencil、KDK、
 *   CLAMP_TO_EDGE），故共用 src/core/gl.js 与 styles.js，物理与 GPU 实现
 *   收在本文件（CPU 镜像与 GLSL 同源手写平行实现，pot72/cdp72 互为独立通道）。
 *
 * 【交换对称】Pψ(x₁,x₂) = ψ(x₂,x₁)。初态按统计对称化：
 *   ψ₀(x₁,x₂) = [φ_a(x₁)φ_b(x₂) ± φ_b(x₁)φ_a(x₂)]/√2   （+ 玻色 / − 费米）
 *   ⟹ ⟨P⟩ = ⟨ψ|P|ψ⟩ = ±1；反对称态在对角线 x₁=x₂ 上**恒零**
 *   （泡利不相容的直接可视化）；同单粒子态（a=b）的反对称化恒等于 0
 *   （Pauli guard：makeWave 返回 norm≈0，页面拒绝加载并 toast）。
 *
 * 【交换对称何时守恒】[H,P]=0 ⟺ V₁=V₂（粒子全同）。本文件势场：
 *   V₁(x) = trap ? min(½ω²(x−xc)², vcap) : 0
 *   V₂(x) = (1+ε)·V₁(x) + ε·bump(x)          bump = bumpH·exp(−((x−xc)/bumpW)²)
 *   U(x₁−x₂) = g·δ_{x₁=x₂}（格点接触相互作用，仅对对角 texel 生效）
 *   ε=0 ⟹ 全同 ⟹ ⟨P⟩ 严格守恒（H 与 P 对易，KDK 逐通道保持对称性）；
 *   ε>0 ⟹ 粒子 2 的势场不同 ⟹ 可区分 ⟹ ⟨P⟩ 漂离 ±1（物理本身，非 bug），
 *   且一阶边缘密度 n₁(x)=∫|ψ(x,x₂)|²dx₂ 与 n₂ 不再重合（全同时恒等）。
 *
 * 【积分器】KDK（kick-drift-kick，与主页引擎同族的一阶系统 w=(u,v) 分裂，
 *   u=Reψ、v=Imψ；u'=Hv、v'=−Hu）。H 为实对称离散算符（5 点 stencil 含
 *   CLAMP_TO_EDGE Neumann 闭合 + 对角势），故 KDK 保**影子哈密顿量**：
 *   范数漂移有界 O(dt²)（非长期累积），pot72 C4 定量入档。对角接触项
 *   g 只进 kick（势项），无条件稳定。
 *
 * 【验证锚点（pot72/cdp72 共用本文件导出的 CPU 函数）】
 *   - 无相互作用时 H=H₁+H₂ 可分 ⟹ 精确解 = 两个 1D 精确演化的乘积；
 *     1D 精确演化用 Neumann 3 点拉普拉斯的**余弦模**闭式（λ_k=2cos(πk/L)−2，
 *     特征向量 cos(πk(i+½)/L)，机器精度）⟹ KDK 误差 O(dt²) 可标定。
 *   - 谐振子阱：解析 φ₀/φ₁ 反对称化初态 + 虚时间松弛到**离散**本征态
 *     （‖Hψ−Eψ‖ 残差检验，pot72 E2/E3）。
 *   - HBT 接触统计：对角密度 玻色 = 2×可区分、费米 = 0×（pot72 B）。
 *
 * 诚实限制（文档同款，面板 hint 亦标注）：
 *   1. 接触相互作用是**格点 δ**（仅 x₁=x₂ texel），非连续 δ；不给散射长度
 *      公式，只定性展示「费米子不受接触作用影响 / 玻色子被压制」。
 *   2. 边界为 CLAMP_TO_EDGE（Neumann 反射）而非硬墙 Dirichlet；短时演示
 *      无影响，长时边界反射会污染（波包抵达边窗 ≈L/2/v 时间后）。
 *   3. 谐振子阱在 |V|>vcap 处截断（本预设参数下截断点在波包尾部之外，
 *      影响 <1e-4，但严格说阱是截断的）。
 *   4. 离散本征态与解析本征态差 O(h²)——「松弛」按钮的作用即收敛到离散态。
 *   5. 费米子「弹开」是**交换相互作用**（无实作用力时的密度效应），不是
 *      经典碰撞；Tonks–Girardeau 精确映射不在本轮范围。
 * ========================================================================== */

/* ---------- 预设与共享参数 ----------
   bumpH=0.2：ε 滑块的可区分势垒峰高（只按 ε 缩放，ε=0 时全预设不受影响）。
   pot72 实测 ε=0.3 时 ⟨P⟩ 偏离 −1 达 9.3e-2（bumpH=0.08 仅 1.7e-2，视觉/读数
   区分度不足），故定 0.2。 */
export const TB_COMMON = { bumpH: 0.2, bumpW: 10, vcap: 6 };

export const TB_PRESETS = {
  /* 自由空间对穿：两个相向波包（±k₀），g 滑块加接触相互作用，
     统计切换对比「玻色穿插 / 费米交换空穴 / 接触排斥」。 */
  cross: {
    name: '自由对穿', trap: 0, omega: 0.02, g: 0, eps: 0,
    d: 52, sigma: 6.5, k0: 0.25, r0: 26,
    text: '两个相同波包相向运动（x₀=∓d/2，k=±k₀），无外势。**玻色**：对称化密度在对角线上**聚束**（HBT 因子 2×），两包穿插而过；**费米**：反对称态对角线密度恒 0（交换空穴），一阶密度表现为**交换弹开**——没有任何真实排斥力。g 滑块加**格点接触相互作用**（只压对角线）：玻色子被压回、费米子毫无变化（它们本来就不在对角线上）。ε 滑块让粒子 2 多一个势垒 ⟹ 不再全同 ⟹ ⟨P⟩ 漂离 ±1、n₁ 与 n₂ 分开。初态三个旋钮（宽度 σ / 动量 k₀ / 间距 d）改动即重发波包：把 d 调到 ~2σ 且 k₀→0 时两个轨道不再正交，**HBT 因子掉到 2/(1+|⟨a|b⟩|²)**（HUD 同时给重叠、预测与实测），这是「2× 只在正交极限成立」的直接演示。',
  },
  /* 谐振子阱对穿：阱中双粒子从 ±r₀ 静止释放，相对坐标振荡。 */
  trap: {
    name: '阱中对穿', trap: 1, omega: 0.02, g: 0, eps: 0,
    d: 0, sigma: 6.5, k0: 0, r0: 26,
    text: '每个粒子受同一谐振子阱 V=½ω²(x−L/2)²（ω 滑块）。双包从 ±r₀ 静止释放：经典地各自荡向中心（首次相遇 t=π/2ω），**费米**在对角线处交换弹开，来回周期 π/ω（对角质量峰间距，pot72 E4 定量）。ε≠0 时粒子 2 的阱深 ×(1+ε) ⟹ 可区分 ⟹ ⟨P⟩ 不再守恒。初态两个旋钮：宽度 σ 与释放半径 r₀（改动即重发波包）；包太宽或 r₀ 太大时 HUD 的「边缘留白」转负——3σ 尾部已越界，CLAMP 边界会把它反射回来。',
  },
  /* 自由放置：两条轨道由**用户沿轴点选**给出（x_a,k_a = +k₀；x_b,k_b = −k₀）。
     页面在 x₁/x₂ 边缘密度条上点一下 ⟹ 切到本预设并重发对称化初态。
     点选仍然只能给「一条高斯轨道」（中心 + 宽度 + 动量），不是主页那种任意绘制：
     构型空间里的合法初态必须是对称化乘积——这条限制不因交互而消失。 */
  custom: {
    name: '自由放置', trap: 0, omega: 0.02, g: 0, eps: 0,
    d: 52, sigma: 6.5, k0: 0.25, r0: 26, custom: 1,
    text: '**沿轴点选轨道**：在下方 x₁ 条上点一下 ⟹ 粒子 1 的轨道中心；在右侧 x₂ 条上点一下 ⟹ 粒子 2 的轨道中心（按住拖动可连续挪）。两条轨道仍是**同宽高斯**、动量 ±k₀（面板滑块），随后**对称化**成两粒子初态——所以 ⟨P⟩ 依旧是 ±1，费米两条轨道完全重合时会被泡利不相容挡住（toast 拒绝加载）。点选自动切到本预设；切回别的预设会恢复该预设的默认初态。',
  },
  /* 阱中本征态：解析 (0,0) 玻色基态 / (0,1) 费米第一激发；
     「松弛」按钮收敛到**离散**本征态（|ψ|² 冻结、整体相位以 E 旋转）。 */
  eigen: {
    name: '阱中本征态', trap: 1, omega: 0.02, g: 0, eps: 0,
    d: 0, sigma: 6.5, k0: 0, r0: 26, eigen: 1,
    text: '谐振子阱中双粒子的**定态**：玻色取 (0,0)（E=ω）、费米取 (0,1) 斯莱特态（E=2ω，最低反对称态）。解析初态与离散本征态差 O(h²)（|ψ|² 会轻微呼吸）；点「松弛到离散本征态」跑虚时间流收敛到**当前格点**的严格本征态（‖Hψ−Eψ‖→0，pot72 E2 检验），之后 |ψ|² 冻结、整体相位以 E=ω/2+3ω/2 旋转。',
  },
};

/* ---------- 布局约定（单一真值）----------
   CPU 状态 = 两个 **连续** Float64Array(L²)：re[k]、im[k]，k = idx(L,i,j) = j·L+i
   （i=x₁ 列、j=x₂ 行）。交错只在 GPU 上传/回读边界做（two-body.js upload/splitField）。
   R72 首版 tbMakeWave 用 2·(jL+i) 交错、tbApplyH 用连续索引——两套坐标混用，
   演化读错元素；统一后所有 CPU 函数（MakeWave/ApplyH/Kdk/Measure/Relax/SymErr）
   共用本 idx。 */
const idx = (L, i, j) => j * L + i;

/* 势场（CPU 与 GLSL 同源：GLSL 不重算势，页面把本函数烘焙成 R32F 纹理
   uPot 供 kick/drift 采样——单源真值，改这里即全场生效） */
export function tbPot1(x, P){
  if (!P.trap) return 0;
  const r = x - P.xc;
  return Math.min(0.5 * P.omega * P.omega * r * r, P.vcap);
}
export function tbPot2(x, P){
  const r = x - P.xc;
  const bump = P.bumpH * Math.exp(-(r * r) / (P.bumpW * P.bumpW));
  return (1 + P.eps) * tbPot1(x, P) + P.eps * bump;
}
/* 全势 V(x₁,x₂)（含格点接触项 g·δ_{x₁=x₂}） */
export function tbV(i, j, P){
  let V = tbPot1(i, P) + tbPot2(j, P);
  if (i === j) V += P.g;
  return V;
}
/* 预计算整张 V 表（L²，float64）：tbApplyH/tbKdkStep/tbRelax/tbEnergy 都可选传，
   避免每 texel 每步调 exp/min（JS 下是数量级差距；物理与 tbV 逐字同值）。 */
export function tbMakeVArray(L, P){
  const V = new Float64Array(L * L);
  const p1 = new Float64Array(L), p2 = new Float64Array(L);
  for (let i = 0; i < L; i++){ p1[i] = tbPot1(i, P); p2[i] = tbPot2(i, P); }
  for (let j = 0; j < L; j++) for (let i = 0; i < L; i++)
    V[j * L + i] = p1[i] + p2[j] + (i === j ? P.g : 0);
  return V;
}

/* ---------- H·ψ（5 点交叉 stencil ×2 轴 + 势；CLAMP_TO_EDGE = Neumann 闭合） ----------
   H = −uK·∇² + V（∇² 取 lap = Σ邻居 − 4c）——与引擎 TPL_EVOLVE 的
   kineticE 默认 '-uK*lap' 同号；漏掉负号会让动能变负、谱下界跑到 −4，R72
   首版冒烟（E₀=0.000175 vs 理论 0.04、松弛收敛到 E=−3.98）即由此外露。 */
export function tbApplyH(re, im, L, P, outRe, outIm, Varr){
  const uK = P.uK;
  for (let j = 0; j < L; j++){
    const jm = (j > 0 ? j - 1 : 0), jp = (j < L - 1 ? j + 1 : L - 1);
    const row = j * L;
    for (let i = 0; i < L; i++){
      const im0 = (i > 0 ? i - 1 : 0), ip = (i < L - 1 ? i + 1 : L - 1);
      const k = row + i;
      const cr = re[k], ci = im[k];
      const lr = re[row + im0] + re[row + ip] + re[jm * L + i] + re[jp * L + i] - 4 * cr;
      const li = im[row + im0] + im[row + ip] + im[jm * L + i] + im[jp * L + i] - 4 * ci;
      const V = Varr ? Varr[k] : tbV(i, j, P);
      outRe[k] = -uK * lr + V * cr;
      outIm[k] = -uK * li + V * ci;
    }
  }
}

/* ---------- 一步 KDK（状态即 (u,v)=(Reψ,Imψ)，无独立速度；与 GPU 三 pass 逐式同构） ----------
   iψ'=Hψ 拆成 u'=Hv、v'=−Hu 的一阶系统，Strang 分裂（与引擎 TPL_EVOLVE 的
   uUpdateV 序列逐字同构）：
     kick1: v ← v − (dt/2)·H·u      （只改 Im 通道）
     drift: u ← u + dt·H·v          （只改 Re 通道；**左乘 H**，不是 u+dt·v）
     kick2: v ← v − (dt/2)·H·u
   H 为实算符 ⟹ 通道可分：H·u 只依赖 re、H·v 只依赖 im（tbApplyH 同时算两者，
   各取所需）。R72 首版把 (re,im) 之外再挂一对"速度"数组并置零，等于丢掉了
   初态 Imψ 的相位信息——600 子步范数掉到 0.484，冒烟即拦下。 */
export function tbKdkStep(re, im, L, P, dt, Varr){
  const h = dt / 2;
  const N = re.length;
  const hRe = new Float64Array(N), hIm = new Float64Array(N);
  /* kick1: im −= h·H·re */
  tbApplyH(re, im, L, P, hRe, hIm, Varr);
  for (let k = 0; k < N; k++) im[k] -= h * hRe[k];
  /* drift: re += dt·H·im */
  tbApplyH(re, im, L, P, hRe, hIm, Varr);
  for (let k = 0; k < N; k++) re[k] += dt * hIm[k];
  /* kick2: im −= h·H·re（新 re） */
  tbApplyH(re, im, L, P, hRe, hIm, Varr);
  for (let k = 0; k < N; k++) im[k] -= h * hRe[k];
}

/* ---------- 初态：单粒子波包 + 对称/反对称化 ---------- */
/* 高斯波包 φ(x)=exp(−(x−x₀)²/2σ²)·e^{ik₀x}（未归一化，调用方统一离散归一化） */
function packet(x, x0, k0, sig){
  const r = x - x0;
  return { re: Math.exp(-(r * r) / (2 * sig * sig)) * Math.cos(k0 * x),
           im: Math.exp(-(r * r) / (2 * sig * sig)) * Math.sin(k0 * x) };
}
/* 谐振子解析本征函数 φₙ(x)（实；NₙHₙ(α(x−xc))e^{−α²(x−xc)²/2}，α=√ω） */
export function tbHarmonicEigen(n, L, omega, xc){
  const alpha = Math.sqrt(omega);
  const out = new Float64Array(L);
  const H = [z => 1, z => 2 * z, z => 4 * z * z - 2, z => 8 * z * z * z - 12 * z];
  const norm = Math.pow(alpha / Math.PI, 0.25) / Math.sqrt(Math.pow(2, n) * [1, 1, 2, 6][n]);
  for (let i = 0; i < L; i++){
    const z = alpha * (i + 0.5 - xc);
    out[i] = norm * H[n](z) * Math.exp(-0.5 * z * z);
  }
  return out;
}

/* 初态参数解析 + 钳制（页面滑块与 URL 共用；tbOrbits/tbInitInfo/tbMakeWave 同源）。
   —— σ/k₀/d/r₀ 四个旋钮的合法区间写在这里，不散落在页面里。
   d 的上限按「两侧还留得下 3σ 的尾部」定：d ≤ L−1−6σ（同 fmt 下 σ 大 ⟹ 间距自动收窄），
   下限保证两个包不重叠到分不开（d ≥ 2σ，否则两个包基本是同一团东西）。 */
export function tbInitParams(L, presetKey, opts = {}){
  const pr = TB_PRESETS[presetKey] || TB_PRESETS.cross;
  const xc = (L - 1) / 2;
  if (pr.eigen) return { eigen: true, omega: opts.omega ?? pr.omega, sigma: 0, k0: 0, d: 0, r0: 0 };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  if (pr.custom){
    /* 点选口径：中心限制在 [3σ+0.5, L−1−3σ−0.5]（整包留在场内），动量 ±k₀（k₀ 走同一套钳制）。
       两个粒子共用 σ（页面只有一根宽度滑块）；位置各自独立。 */
    const sigma = clamp(opts.sigma ?? pr.sigma, 1.5, Math.max(1.5, (L - 1) / 6));
    const k0 = clamp(opts.k0 ?? pr.k0, 0, 1.5);
    const lo = 3 * sigma + 0.5, hi = (L - 1) - 3 * sigma - 0.5;
    const pos = (v, dflt) => clamp(Number.isFinite(v) ? v : dflt, Math.min(lo, hi), Math.max(lo, hi));
    return {
      custom: true, eigen: false, omega: opts.omega ?? pr.omega, sigma, k0, d: 0, r0: 0,
      xa: pos(opts.xa, pr.customX ?? (xc - pr.d / 2)),
      xb: pos(opts.xb, pr.customY ?? (xc + pr.d / 2)),
      ka: +k0, kb: -k0,
    };
  }
  let sigma = clamp(opts.sigma ?? pr.sigma, 1.5, Math.max(1.5, (L - 1) / 6));
  /* 注：σ > (L−1)/8 时「d ≥ 2σ」与「3σ 尾部留白」无法同时满足 ⟹ margin 必然 < 0，
     页面 HUD 会如实标红（不禁用，让人看见边界截断的代价）。 */
  const r0min = 1, r0max = Math.max(2, xc - 2 - 3 * sigma);
  const r0 = clamp(opts.r0 ?? pr.r0, r0min, r0max);
  const dmin = Math.max(2 * sigma, 2), dmax = Math.max(dmin, (L - 1) - 6 * sigma);
  const d = clamp(opts.d ?? pr.d, dmin, dmax);
  const k0 = clamp(opts.k0 ?? pr.k0, 0, 1.5);
  return { eigen: false, sigma, d, k0, r0, omega: opts.omega ?? pr.omega };
}

/* 两个单粒子轨道（1D，长度 L）：返回 {A:{re,im}, B:{re,im}, xa, xb, ka, kb, sigma,…}。
   makeWave / tbInitInfo / 页面 HUD / Node 套件全部走这里——初态只有一处真值。 */
export function tbOrbits(L, presetKey, opts = {}){
  const pr = TB_PRESETS[presetKey] || TB_PRESETS.cross;
  const q = tbInitParams(L, presetKey, opts);
  const stats = opts.stats || 'boson';
  const xc = (L - 1) / 2;
  if (q.eigen){
    /* 玻色 (0,0) 基态（E=ω）；费米 (0,1) 斯莱特态（E=2ω，最低反对称态） */
    const na = 0, nb = stats === 'boson' ? 0 : 1;
    const A = tbHarmonicEigen(na, L, q.omega, xc), B = tbHarmonicEigen(nb, L, q.omega, xc);
    const re = a => ({ re: Float64Array.from(a), im: new Float64Array(L) });
    return { ...q, na, nb, xa: xc, xb: xc, ka: 0, kb: 0, A: re(A), B: re(B) };
  }
  const xa = q.custom ? q.xa : (pr.trap ? xc - q.r0 : xc - q.d / 2);
  const xb = q.custom ? q.xb : (pr.trap ? xc + q.r0 : xc + q.d / 2);
  const ka = q.custom ? q.ka : (pr.trap ? 0 : +q.k0);
  const kb = q.custom ? q.kb : (pr.trap ? 0 : -q.k0);
  const arr = (x0, k) => {
    const o = { re: new Float64Array(L), im: new Float64Array(L) };
    for (let i = 0; i < L; i++){ const p = packet(i + 0.5, x0, k, q.sigma); o.re[i] = p.re; o.im[i] = p.im; }
    return o;
  };
  return { ...q, xa, xb, ka, kb, A: arr(xa, ka), B: arr(xb, kb) };
}

/** 初态元信息（页面 HUD + 套件共用）：
 *    overlap = |⟨a|b⟩|²（离散归一化重叠）
 *    hbt     = 玻色对角质量 / 可区分对角质量 = 2/(1+overlap)（**不是恒为 2**）
 *    margin  = 左包到左边界、右包到右边界两者较小者减去 3σ；<0 ⟹ 尾部被 CLAMP 边界切
 *    sep     = 两包中心距（texel）
 *  这些量全部由 tbOrbits 的**同一份**离散轨道算出（不是另写一套公式）。 */
export function tbInitInfo(L, presetKey, opts = {}){
  const o = tbOrbits(L, presetKey, opts);
  const dot = (u, v) => {
    let sr = 0, si = 0, nu = 0, nv = 0;
    for (let i = 0; i < L; i++){
      sr += u.re[i] * v.re[i] + u.im[i] * v.im[i];
      si += u.re[i] * v.im[i] - u.im[i] * v.re[i];
      nu += u.re[i] * u.re[i] + u.im[i] * u.im[i];
      nv += v.re[i] * v.re[i] + v.im[i] * v.im[i];
    }
    const norm = Math.sqrt(Math.max(nu * nv, 1e-300));
    return { re: sr / norm, im: si / norm, nu, nv };
  };
  const c = dot(o.A, o.B);
  const overlap = c.re * c.re + c.im * c.im;
  const out = {
    preset: presetKey, eigen: !!o.eigen, stats: opts.stats || 'boson',
    sigma: o.sigma, k0: o.k0, d: o.d, r0: o.r0, omega: o.omega,
    xa: o.xa, xb: o.xb, ka: o.ka, kb: o.kb,
    overlap, hbt: 2 / (1 + overlap), sep: Math.abs(o.xb - o.xa), margin: null,
  };
  if (!o.eigen){
    /* 对穿预设：左包离左边界、右包离右边界；自由放置（custom）两轨道各自独立，
       取四支里的最小者——否则把两条轨道都放在右半场会得到一个假的「留白」。 */
    out.margin = (o.custom
      ? Math.min(o.xa, o.xb, (L - 1) - o.xa, (L - 1) - o.xb)
      : Math.min(o.xa, (L - 1) - o.xb)) - 3 * o.sigma;
    out.custom = !!o.custom;
  }
  return out;
}

/* makeWave：返回 {re, im, norm}（norm=离散范数；<1e-9 ⟹ 页面应拒绝加载）
   opts: {stats:'boson'|'fermion', g, eps, omega, d, sigma, k0, r0}
   —— g/eps/omega 只影响势场不改变初态（初态与它们无关），此处接收是为了一并
   返回完整参数快照；真正消费它们的是演化循环。 */
export function tbMakeWave(L, presetKey, opts = {}){
  const pr = TB_PRESETS[presetKey] || TB_PRESETS.cross;
  const stats = opts.stats || 'boson';
  const re = new Float64Array(L * L), im = new Float64Array(L * L);
  const orb = tbOrbits(L, presetKey, opts);
  const A = orb.A, B = orb.B;
  const fa = i => ({ re: A.re[i], im: A.im[i] });
  const fb = i => ({ re: B.re[i], im: B.im[i] });
  const sgn = stats === 'boson' ? 1 : -1;
  for (let j = 0; j < L; j++) for (let i = 0; i < L; i++){
    const a1 = fa(i), b2 = fb(j), b1 = fb(i), a2 = fa(j);
    const k = idx(L, i, j);
    re[k] = (a1.re * b2.re - a1.im * b2.im + sgn * (b1.re * a2.re - b1.im * a2.im)) / Math.SQRT2;
    im[k] = (a1.re * b2.im + a1.im * b2.re + sgn * (b1.re * a2.im + b1.im * a2.re)) / Math.SQRT2;
  }
  let norm = 0;
  for (let k = 0; k < re.length; k++) norm += re[k] * re[k] + im[k] * im[k];
  if (norm > 1e-18){ const s = 1 / Math.sqrt(norm); for (let k = 0; k < re.length; k++){ re[k] *= s; im[k] *= s; } norm = 1; }
  return { re, im, norm };
}

/* ---------- 测量（readback 后直接消费；返回一阶边缘密度 n₁/n₂） ---------- */
export function tbMeasure(re, im, L){
  let norm = 0, exch = 0, diagMass = 0, diagMax = 0, peak = 0;
  const n1 = new Float64Array(L), n2 = new Float64Array(L);
  for (let j = 0; j < L; j++) for (let i = 0; i < L; i++){
    const k = idx(L, i, j), kk = idx(L, j, i);
    const p = re[k] * re[k] + im[k] * im[k];
    norm += p; peak = Math.max(peak, p);
    n1[i] += p; n2[j] += p;
    if (i === j){ diagMass += p; diagMax = Math.max(diagMax, p); }
    /* ⟨P⟩ = Σ Re(ψ*(i,j)·ψ(j,i)) */
    exch += re[k] * re[kk] + im[k] * im[kk];
  }
  let dn = 0;
  for (let i = 0; i < L; i++) dn = Math.max(dn, Math.abs(n1[i] - n2[i]));
  return { norm, exch, diagMass, diagMax, peak, n1, n2, dn12: dn };
}

/* ---------- 能量 ⟨H⟩（实数；H 实对称 ⟹ Im 部分为 0） ---------- */
export function tbEnergy(re, im, L, P, Varr){
  const hRe = new Float64Array(re.length), hIm = new Float64Array(im.length);
  tbApplyH(re, im, L, P, hRe, hIm, Varr);
  let E = 0;
  for (let k = 0; k < re.length; k++) E += re[k] * hRe[k] + im[k] * hIm[k];
  return E;
}

/* ---------- 虚时间松弛（∂ψ/∂τ=−Hψ + 归一化 + sector 投影；收敛到 sector 基态） ----------
   【sector 投影必须显式做】τ 流对 H 的多项式作用于 P 对易，精确算术下不混 sector；
   但 float64 舍入种子（~1e-16）里含对称分量，而玻色基态 E≈ω 比反对称基态 E≈2ω
   衰减更快 ⟹ 相对增长 e^{−ω·τ}，约 6000 步后反超（R72 实测：it=6000 resid=1.0e-9，
   it=12000 resid 回退到 5.9e-2、E 跌向 0.0199）。每步投影 ψ←(ψ+sym·Pψ)/2 后
   该泄漏结构性归零（与引擎 Bloch 弛豫「每步投影回目标块」同思路）。
   opts.sym: +1 玻色 / −1 费米 / 缺省 0（不投影，仅用于通用诊断）。 */
export function tbRelax(re, im, L, P, opts = {}){
  /* 显式 τ 步稳定界：λ_max(H) ≈ 8uK(动能) + V_max ≤ vcap + g；取 1.7/λ 留安全余量，
     上限 0.15（收敛速率 ∝ dtτ ⟹ 默认取上限，pot72 实测 ~3000 步到残差 1e-10）。
     R72 首版固定 0.05 且 H 符号错，18750 步收敛到 E=−3.98（不可能值）——两处均修。 */
  const dtTau = opts.dtTau ?? Math.min(0.15, 1.7 / (8 * P.uK + P.vcap + P.g + 1e-9));
  const maxIters = opts.maxIters ?? 30000, tol = opts.tol ?? 1e-13;
  const checkEvery = opts.checkEvery ?? 50;   /* 分块调用（页面 30 步/帧）时传 25 */
  const sym = opts.sym ?? 0;
  const tolResid = opts.residual ?? 1e-8;     /* 残差判据（能量判据二次收敛、过早停） */
  const Varr = tbMakeVArray(L, P);
  const hRe = new Float64Array(re.length), hIm = new Float64Array(im.length);
  let E0 = tbEnergy(re, im, L, P, Varr), iters = 0, dE = 1;
  for (; iters < maxIters; iters++){
    tbApplyH(re, im, L, P, hRe, hIm, Varr);
    let nrm = 0;
    for (let k = 0; k < re.length; k++){
      re[k] -= dtTau * hRe[k]; im[k] -= dtTau * hIm[k];
      nrm += re[k] * re[k] + im[k] * im[k];
    }
    const s = 1 / Math.sqrt(nrm);
    for (let k = 0; k < re.length; k++){ re[k] *= s; im[k] *= s; }
    /* sector 投影（i<j 成对处理；费米对角置零） */
    if (sym !== 0){
      for (let j = 0; j < L; j++) for (let i = j; i < L; i++){
        if (i === j){
          if (sym < 0){ const k = idx(L, i, j); re[k] = 0; im[k] = 0; }
          continue;
        }
        const k = idx(L, i, j), kk = idx(L, j, i);
        const ar = 0.5 * (re[k] + sym * re[kk]), ai = 0.5 * (im[k] + sym * im[kk]);
        re[k] = ar; im[k] = ai; re[kk] = sym * ar; im[kk] = sym * ai;
      }
      let n2 = 0;
      for (let k = 0; k < re.length; k++) n2 += re[k] * re[k] + im[k] * im[k];
      const s2 = 1 / Math.sqrt(n2);
      for (let k = 0; k < re.length; k++){ re[k] *= s2; im[k] *= s2; }
    }
    if ((iters + 1) % checkEvery === 0){
      /* 残差判据（与最终返回同口径）：能量判据 E=E∞+gap·c² 是二次的，c=1e-5 时
         dE~1e-11 早已低于 1e-13 阈值而残差仍有 1e-7 ⟹ 单用 dE 会过早停。 */
      tbApplyH(re, im, L, P, hRe, hIm, Varr);
      let E1 = 0;
      for (let k = 0; k < re.length; k++) E1 += re[k] * hRe[k] + im[k] * hIm[k];
      let num = 0, den = 0;
      for (let k = 0; k < re.length; k++){
        const dr = hRe[k] - E1 * re[k], di = hIm[k] - E1 * im[k];
        num += dr * dr + di * di; den += hRe[k] * hRe[k] + hIm[k] * hIm[k];
      }
      const resid = Math.sqrt(num / Math.max(den, 1e-300));
      dE = Math.abs(E1 - E0) / Math.max(Math.abs(E1), 1e-12);
      E0 = E1;
      /* 只认残差：dE 在 c~1e-6 时就已 <1e-13（E=E∞+gap·c² 二次），会把残差
         3e-7 的状态判成收敛（R72 实测 3800 步即停）。 */
      if (resid < tolResid) { iters++; break; }
    }
  }
  /* 本征态残差 ‖Hψ−Eψ‖/‖Hψ‖ */
  const E = tbEnergy(re, im, L, P, Varr);
  tbApplyH(re, im, L, P, hRe, hIm, Varr);
  let num = 0, den = 0;
  for (let k = 0; k < re.length; k++){
    const dr = hRe[k] - E * re[k], di = hIm[k] - E * im[k];
    num += dr * dr + di * di; den += hRe[k] * hRe[k] + hIm[k] * hIm[k];
  }
  return { iters, energy: E, residual: Math.sqrt(num / Math.max(den, 1e-300)) };
}

/* ---------- 1D 精确自由演化（Neumann 3 点拉普拉斯余弦模闭式，机器精度） ----------
   特征向量 v_k(i)=cos(πk(i+½)/L)，特征值 λ_k=2cos(πk/L)−2（含 i=0 的 clamp
   闭合，已代入验证）；H_1D=−uK·lap ⟹ 精确演化 ψ(t)=Σ c_k e^{−i uK λ_k t} v_k。 */
export function tbFreeEvolve1D(re, im, L, uK, t){
  const outRe = new Float64Array(L), outIm = new Float64Array(L);
  for (let k = 0; k < L; k++){
    const lam = 2 * Math.cos(Math.PI * k / L) - 2;   /* lap 特征值 ≤0 */
    const ph = uK * lam * t;                          /* E_k=−uK·λ ⟹ e^{−iE_k t}=e^{i uK λ t} */
    const cp = Math.cos(ph), sp = Math.sin(ph);
    let ar = 0, ai = 0, nrm = (k === 0 ? L : L / 2);
    for (let i = 0; i < L; i++){
      const v = Math.cos(Math.PI * k * (i + 0.5) / L);
      ar += v * re[i]; ai += v * im[i];
    }
    ar /= nrm; ai /= nrm;
    for (let i = 0; i < L; i++){
      const v = Math.cos(Math.PI * k * (i + 0.5) / L);
      outRe[i] += v * (ar * cp - ai * sp);
      outIm[i] += v * (ar * sp + ai * cp);
    }
  }
  return { re: outRe, im: outIm };
}

/* ---------- 对称性误差（测试用）：max|ψ(i,j) − sgn·ψ(j,i)| ---------- */
export function tbSymErr(re, im, L, sgn){
  let m = 0;
  for (let j = 0; j < L; j++) for (let i = 0; i < L; i++){
    const k = idx(L, i, j), kk = idx(L, j, i);
    m = Math.max(m, Math.abs(re[k] - sgn * re[kk]), Math.abs(im[k] - sgn * im[kk]));
  }
  return m;
}

/* ---------- 场哈希（FNV-1a over float32 比特；GPU↔GPU 确定性比对用） ---------- */
export function tbFieldHash(f32){
  const u = new Uint32Array(f32.buffer, f32.byteOffset, Math.floor(f32.byteLength / 4));
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++){ h ^= u[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/* ============================================================================
 * GPU shader（与上方 CPU 函数逐式同源；改任一侧必须同步另一侧并重跑 pot72/cdp72）
 *
 * 势场 V 不在 shader 里重算：页面把 tbPot1/tbPot2 烘焙成 R32F 纹理 uPot
 * （CPU 侧 float64 → 纹理 float32），kick/drift 只采样 —— 单源真值，避免
 * 两段 GLSL 各写一份 trap/bump/接触项 的漂移风险（R72 设计修订）。
 * ========================================================================== */
/* kick：v ← v − (dt/2)·H·u（只改 .y=Im 通道，.x 原样拷贝）；H = −uK·lap + V */
export const TB_FS_KICK = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uU;
uniform sampler2D uPot;
uniform vec2 uTexel;
uniform float uDtHalf, uK;
void main(){
  vec2 c  = texture(uU, vUv).xy;
  vec2 xm = texture(uU, vUv - vec2(uTexel.x, 0.0)).xy;
  vec2 xp = texture(uU, vUv + vec2(uTexel.x, 0.0)).xy;
  vec2 ym = texture(uU, vUv - vec2(0.0, uTexel.y)).xy;
  vec2 yp = texture(uU, vUv + vec2(0.0, uTexel.y)).xy;
  vec2 lap = xm + xp + ym + yp - 4.0*c;
  float V = texture(uPot, vUv).r;
  float Hu = -uK*lap.x + V*c.x;
  o = vec4(c.x, c.y - uDtHalf*Hu, 0.0, 1.0);
}`;

/* drift：u ← u + dt·H·v（只改 .x=Re 通道；H 左乘 v，与引擎 uUpdateV=0 逐字同构） */
export const TB_FS_DRIFT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uU;
uniform sampler2D uPot;
uniform vec2 uTexel;
uniform float uDt, uK;
void main(){
  vec2 c  = texture(uU, vUv).xy;
  vec2 xm = texture(uU, vUv - vec2(uTexel.x, 0.0)).xy;
  vec2 xp = texture(uU, vUv + vec2(uTexel.x, 0.0)).xy;
  vec2 ym = texture(uU, vUv - vec2(0.0, uTexel.y)).xy;
  vec2 yp = texture(uU, vUv + vec2(0.0, uTexel.y)).xy;
  vec2 lap = xm + xp + ym + yp - 4.0*c;
  float V = texture(uPot, vUv).r;
  float Hv = -uK*lap.y + V*c.y;
  o = vec4(c.x + uDt*Hv, c.y, 0.0, 1.0);
}`;

/* 显示：密度模式（青白辉度）/ 相位模式（色相=argψ，跨对角 π 跳变可见）+
   对角线 x₁=x₂ 琥珀缝 + 边框。bilerp 手工上采样（状态纹理必须 NEAREST，
   stencil 精确性不能让给 LINEAR）。 */
export const TB_FS_DRAW = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uU;
uniform vec2 uTexel;
uniform float uScale;
uniform float uMode;
uniform float uDiagOn;
vec3 hsv2rgb(vec3 c){
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0))*6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec4 bilerp(sampler2D t, vec2 uv, vec2 texel){
  vec2 f = fract(uv/texel - 0.5) - 0.5;
  vec2 base = (uv/texel - 0.5 - f)*texel;
  vec4 a = texture(t, base);
  vec4 b = texture(t, base + vec2(texel.x, 0.0));
  vec4 c = texture(t, base + vec2(0.0, texel.y));
  vec4 d = texture(t, base + texel);
  return mix(mix(a,b,f.x+0.5), mix(c,d,f.x+0.5), f.y+0.5);
}
void main(){
  vec2 c = bilerp(uU, vUv, uTexel).xy;
  float p = dot(c, c);
  vec3 col = (uMode > 0.5)
    ? hsv2rgb(vec3(atan(c.y, c.x)/6.28318530718 + 0.5, 0.72, 1.0))
    : vec3(0.36, 0.82, 0.98);
  float lum = 1.0 - exp(-p*uScale);
  vec3 img = col*lum + vec3(0.016, 0.024, 0.045);
  if (uDiagOn > 0.5){
    float d = abs(vUv.x - vUv.y)*0.70710678;
    float w = max(fwidth(d), 1e-5);
    img += vec3(0.98, 0.75, 0.14)*smoothstep(1.6*w, 0.0, d)*0.9;
  }
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = min(e.x, e.y);
  img += vec3(0.13, 0.2, 0.3)*smoothstep(0.004, 0.0, edge)*0.8;
  o = vec4(img, 1.0);
}`;
