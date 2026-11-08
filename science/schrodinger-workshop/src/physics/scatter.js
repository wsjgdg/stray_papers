/* ============================================================================
 * 球方垒散射：相移 δ_l + 分波截面（R70：解析对照补齐）
 *
 * 物理：半径 R、高 V0 的球形势垒，入射平面波能量 E。分波展开
 *     ψ = Σ_l (2l+1) i^l P_l(cosθ) · R_l(r)
 * 径向约化函数 u_l = r·R_l 满足 u_l'' + [k² − l(l+1)/r² − V(r)]u_l = 0，
 * 渐近 u_l ∝ sin(kr − lπ/2 + δ_l)。相移由 r=R 的对数导数匹配定出：
 *
 *   垒外（E>V0）：u ∝ kr·j_l(kr)，散射解 u ∝ kr[j_l(kr)cos δ − n_l(kr)sin δ]
 *   垒内（E>V0）：u ∝ qr·j_l(qr)，q = √(2m(E−V0))（正则）
 *   垒内（E<V0）：u ∝ κr·i_l(κr)，κ = √(2m(V0−E))（修正球贝塞尔，正则）
 *
 * 匹配 u、u' 连续 ⟹ tan δ_l = (A' − L_in·A)/(B' − L_in·B)
 *     A = j_l(kR), B = n_l(kR), A' = k·j_l'(kR), B' = k·n_l'(kR)
 *     L_in = 垒内对数导数 u'_in(R)/u_in(R)：
 *       E>V0：q·j_l'(qR)/j_l(qR)（节点处 → ±∞，公式自然给出 Dirichlet 极限）
 *       E=V0：u ∝ r^{l+1} ⟹ (l+1)/R（精确极限）
 *       E<V0：κ·i_l'(κR)/i_l(κR)（**标度化**求值防 e^{κR} 上溢，见下）
 *
 * 自检锚点（CPU 验证脚本同款）：硬球 V0→∞ ⟹ δ_0=−kR；自由 V0=0 ⟹ δ_l=0；
 * 低能 δ_l ~ (kR)^{2l+1}；s 波共振 δ_0=π/2 ⟹ σ_0=4π/k²（幺正上限）；
 * 与 1D 全宽 2R 对称垒 TMM 的奇宇称 sector 对应 δ_0=½arg(t−r)。
 *
 * 截面（分波求和）：
 *     σ_tot = (4π/k²) Σ_l (2l+1) sin²δ_l
 *     f(θ) = (1/2ik) Σ_l (2l+1)(e^{2iδ_l}−1) P_l(cosθ)
 *     dσ/dΩ = |f(θ)|²
 *
 * 验证结论（pot70 验证脚本同款，CPU 三层交叉）：
 *   ① 教科书关系机器精度：E<V0 cot(kR+δ)=(κ/k)coth(κR)；
 *      E>V0 tan(kR+δ)=(k/q)tan(qR)（偏差 1e-11~1e-16）。
 *   ② 格点奇宇称直接积分（独立数值实现，原点节点奇初值向右递推）
 *      与 texel 级精确离散界面条件机器精度一致（1e-13~1e-15）：
 *        tan(kR+δ) = tan(k/2)·coth(κ/2)·tanh(κR)   （E<V0）
 *        tan(kR+δ) = tan(k/2)·cot(q/2)·tan(qR)      （E>V0）
 *      连续极限 (k/κ)tanh(κR)、(k/q)tan(qR) ✓ 自洽。
 *   ③ 模型（连续函数形式 + 离散色散）vs 格点精确解残差 0.014~0.04 rad，
 *      与 O(h²) 界面修正解析预测**逐位吻合**：连续式 (k/κ)tanh(κR) 与
 *      离散式 tan(k/2)coth(κ/2)tanh(κR) 之差 = 因子 1+(k²−κ²)/12。
 *      ⟹ 模型在连续极限精确；格点 O(h²) 修正已解析量化（非 bug）。
 *   ④ 离散档湮灭指数必须用负能解析延拓 κ=arccosh(1+m·d)（=2asinh(√(md/2))），
 *      误用传播公式 arccos(1−m·d) 曾造成 0.05 rad 恒定残差（已修）。
 *   ⑤ modSphRatio 连分数修复（R70 收尾轮，pot70 S10/S12）：旧版用种子
 *      (î_L, î_{L+1})=(1,0) 的向下递推，z≫l 时递推混入不衰减的第二解
 *      （交替解 |λ|≈1），z≳16 后比值退化为 ~(−1)^n 震荡垃圾（l=2、
 *      z=1.1e5 时返回 1.3e-3 而非 1+2/z），破坏 l≥1 的 Dirichlet 硬球
 *      极限（δ_2 偏 3.3%）。potR≤20 × V0≳0.35 ⟹ z=κR 可达 28——UI
 *      高端同样踩坑，故必须连分数（全正项、无条件稳定）。修复后经三层
 *      独立参考验证：直接 i 级数 4.9e-16（l=1..8、中 z）；硬球前向
 *      j/n 级数参考（V0=1e8）mod π ≤2.2e-5（残差 = atan((k/κ)tanh κR)
 *      有限 V0 修正，解析可释）；Numerov 端到端（1/x 渐近修正 +
 *      Richardson）l=0..3、E 双侧 ≤8.5e-6。
 *
 * 色散口径（与 barrier3d.js 逐字一致的项目约定）：
 *   · 'continuous'：教科书连续色散 k=√(2mE)（解析球贝塞尔对照的基准）；
 *   · 'discrete'：引擎 5 点/7 点 stencil 沿轴离散色散 k=kOf(E)=2asin(√(mE/2))
 *     （E≥2/m 截到带顶 π）——与 GPU 实测对照时用这一档。
 *   两档差异即格点色散效应，CPU 验证脚本量化（低 k 处应不可分辨）。
 *
 * 诚实边界（文档化，不装作精确）：
 *   · 模型是**球方垒平面波**；GPU 实测是有限宽波包（Δk 展宽 + 横向 l≥1
 *     耦合 + 绕球份额，R38 已量化）⟹ 对照目标是包络与极限，不是点值相等。
 *   · 分波求和按 l 截断（lmax），截断误差由尾部 (2l+1)sin²δ_l 估计。
 *   · 球方垒解析解假设 r<R 内 V 恒为 V0。引擎侧：**3D** 势经 uniform 以
 *     float 注入（uPotV0，无量化，R70 面板直接读 state.potV0/potR）；
 *     **2D** 势纹理 8 位量化（vGray: round(v·127+128)，解码 round(v·127)/127）
 *     ——2D 对照须对齐量化后的 V0（调用方负责）。
 * ========================================================================== */

/* ---- 球贝塞尔（float64）----
   j_l：向下递推（Miller）+ j_0=sin z/z 归一化——对 l>z 也稳定；
   **起始索引必须远在转折区 n≈z+c·z^{1/3} 之上**：L=ceil(z)+12+⌈6·z^{1/3}⌉
   （实证：固定 L=16 在 z≳10 后精度崩塌——z=20 时 69× 错、符号都反；
   potR≤20 × k≤π ⟹ z=kR 可达 63，UI 高端全靠这条规则兜底）。 */
function sphJ(l, z){
  if (l === 0) return Math.abs(z) < 1e-12 ? 1 : Math.sin(z)/z;
  const L = Math.max(l + 12, Math.ceil(z) + 12 + Math.ceil(6*Math.cbrt(z)));
  let jp1 = 0, jp0 = 1, jl = 0;               /* j_{n+1}, j_n；jl 捕获 j_l */
  for (let n = L; n >= 1; n--){
    const jm1 = (2*n + 1)/z*jp0 - jp1;        /* j_{n-1} = (2n+1)/z·j_n − j_{n+1} */
    if (n - 1 === l) jl = jm1;
    jp1 = jp0; jp0 = jm1;
  }
  /* 循环结束后 jp0 = 未归一化 j_0；用精确 j_0 定标度 */
  const j0 = Math.abs(z) < 1e-12 ? 1 : Math.sin(z)/z;
  return jl*(j0/jp0);
}
function sphN(l, z){
  if (l === 0) return -Math.cos(z)/z;
  let nm1 = -Math.cos(z)/z;                   /* n_0 */
  let n0 = -Math.cos(z)/(z*z) - Math.sin(z)/z;/* n_1 */
  if (l === 1) return n0;
  for (let n = 1; n < l; n++){
    const np1 = (2*n + 1)/z*n0 - nm1;         /* n_{n+1} = (2n+1)/z·n_n − n_{n-1} */
    nm1 = n0; n0 = np1;
  }
  return n0;
}
/* 标度化修正球贝塞尔比值 i_{l-1}(z)/i_l(z)（防 e^z 上溢）：
   **连分数递推**（全正项、无条件稳定）。由递推 i_{n-1} = i_{n+1} +
   (2n+1)/z·i_n 除以 i_n：令 ρ_n = i_{n+1}/i_n，则
       ρ_{n-1} = 1/(ρ_n + (2n+1)/z)，  r_l = i_{l-1}/i_l = ρ_l + (2l+1)/z
   自高阶截断 N = max(l+24, ⌈z⌉+24) 起步（ρ_N ≈ z/(2N+3)），截断误差按
   ∏1/a_n²（a_n=(2n+1)/z）指数衰减。l=0 用闭式 coth z。
   历史 bug（已修）：旧版用种子 (î_L, î_{L+1})=(1,0) 的向下递推——z≫l 时
   递推的第二解（交替解 |λ|≈1）不衰减，算出的比值在 z≳16 后变成
   ~(−1)^n 震荡垃圾（l=2、z=1.1e5 时返回 1.3e-3 而非 1+2/z），破坏
   l≥1 的 Dirichlet 硬球极限（δ_2 偏 3.3%）。potR≤20 × V0≳0.35 ⟹
   z=κR 可达 28——UI 高端同样踩坑，故必须连分数。 */
function modSphRatio(l, z){
  if (l === 0) return 1/Math.tanh(z);                  /* i_{-1}/i_0 = coth z（不溢出） */
  if (l < 0) return NaN;
  const N = Math.max(l + 24, Math.ceil(z) + 24);
  let rho = z/(2*N + 3);                              /* 高阶种子 i_{N+1}/i_N ≈ z/(2N+3) */
  for (let n = N; n >= l + 1; n--) rho = 1/(rho + (2*n + 1)/z);
  return rho + (2*l + 1)/z;
}
const dSphJ = (l, z) => (l === 0) ? -sphJ(1, z) : sphJ(l - 1, z) - (l + 1)/z*sphJ(l, z);
const dSphN = (l, z) => (l === 0) ? -sphN(1, z) : sphN(l - 1, z) - (l + 1)/z*sphN(l, z);

/* 引擎离散色散（barrier.js / barrier3d.js 同款反解） */
const kOfD = (E, m) => {
  if (!(E > 0)) return 0;
  const s = m*E/2;
  return s >= 1 ? Math.PI : 2*Math.asin(Math.sqrt(s));
};

export function sphericalScatterModel(m){
  /* 垒内对数导数 L_in = u'_in(R)/u_in(R)（数值稳定形式） */
  const logDerivIn = (l, E, V0, R, disp) => {
    const d = V0 - E;
    if (Math.abs(d) < 1e-12) return (l + 1)/R;         /* E=V0：u ∝ r^{l+1} */
    if (d < 0){                                          /* E>V0：导带 */
      const q = disp === 'discrete' ? kOfD(E - V0, m) : Math.sqrt(2*m*(E - V0));
      if (!(q > 1e-9)) return (l + 1)/R;                /* q→0 同 E=V0 极限 */
      const z = q*R;
      const jl = sphJ(l, z);
      if (Math.abs(jl) < 1e-300) return Infinity;       /* 内节点：Dirichlet 极限 */
      /* i_l' = j_{l-1} − (l+1)/z·j_l；l=0 时 j_0' = −j_1 */
      const jlp = (l === 0) ? -sphJ(1, z) : sphJ(l - 1, z) - (l + 1)/z*jl;
      return q*jlp/jl;
    }
    /* E<V0：倏逝（标度化比值防上溢）。
       离散档湮灭指数必须用色散的负能解析延拓 κ=arccosh(1+m·d)，
       而非传播公式 arccos(1−m·d)（asinh/asin 分叉，d~0.3 时相对差 5%，
       曾造成与格点积分的 0.05 rad 恒定残差）。数值稳定式：
       arccosh(1+x) = 2·asinh(√(x/2))（小 x 不损失精度）。 */
    const ka = disp === 'discrete' ? 2*Math.asinh(Math.sqrt(m*d/2)) : Math.sqrt(2*m*d);
    const z = ka*R;
    /* i_l' = i_{l-1} − (l+1)/z·i_l ⟹ L_in = κ·(i_{l-1}/i_l − (l+1)/z) */
    const r = modSphRatio(l, z);
    return ka*(r - (l + 1)/z);
  };
  /* 单分波相移。disp='continuous' | 'discrete'（见文件头）。
     返回 { delta, tan }；E≤0 或 k=0 时 δ=0（无散射）。
     delta 归一化到 (−π/2, π/2]（相移定义 mod π；sin²δ 与 e^{2iδ} 不受
     影响，但避免自由情形 numer≡0 时 atan2(0,<0)=π 的显示伪影）。 */
  const phaseShift = (l, E, V0, R, disp) => {
    if (!(E > 0) || !(R > 0)) return { delta: 0, tan: 0 };
    const k = disp === 'discrete' ? kOfD(E, m) : Math.sqrt(2*m*E);
    if (!(k > 1e-9)) return { delta: 0, tan: 0 };
    const A = sphJ(l, k*R), B = sphN(l, k*R);
    const Ap = k*dSphJ(l, k*R), Bp = k*dSphN(l, k*R);
    const L = logDerivIn(l, E, V0, R, disp);
    const numer = Ap - L*A, denom = Bp - L*B;
    const norm = d => (d > Math.PI/2) ? d - Math.PI : d;
    if (!isFinite(numer) || !isFinite(denom)){
      /* L=±∞（内节点）⟹ Dirichlet 极限 tan δ = A/B */
      if (!isFinite(L)) return { delta: norm(Math.atan2(A, B)), tan: A/B };
      return { delta: 0, tan: 0 };
    }
    return { delta: norm(Math.atan2(numer, denom)), tan: numer/denom };
  };
  /* 分波求和：相移表 + 截面。lmax 截断 + 尾部估计。 */
  const scatter = (E, V0, R, opts) => {
    const o = Object.assign({ disp: 'continuous', lmax: 16 }, opts);
    const k = o.disp === 'discrete' ? kOfD(E, m) : Math.sqrt(2*m*E);
    const deltas = [];
    let sig = 0, tail = 0;
    for (let l = 0; l <= o.lmax; l++){
      const { delta } = phaseShift(l, E, V0, R, o.disp);
      const s2 = Math.sin(delta)*Math.sin(delta);
      const w = (2*l + 1)*s2;
      sig += w;
      if (l >= 4) tail = Math.max(tail, w);   /* 尾部量级估计（粗） */
      deltas.push({ l, delta, s2, w });
    }
    const sigma = k > 1e-9 ? 4*Math.PI/(k*k)*sig : 0;
    return { k, deltas, sigma, tail, lmax: o.lmax };
  };
  /* 散射振幅 f(θ)（复数，分波截断 lmax）与 dσ/dΩ。
     f(θ) = (1/2ik)·Σ_l (2l+1)(e^{2iδ_l}−1)P_l(cosθ)
     令 S = Σ(2l+1)P(e^{2iδ}−1) = Sr + i·Si，则 f = −i·S/(2k)
     ⟹ Re f = Si/(2k)、Im f = −Sr/(2k)（1/i 因子曾漏挂——|f|² 不受影响，
     但 Im f(0)=kσ/4π 光学定理会抓到，见 pot70 S8）。 */
  const amplitude = (E, V0, R, cosT, opts) => {
    const o = Object.assign({ disp: 'continuous', lmax: 16 }, opts);
    const sc = scatter(E, V0, R, o);
    if (!(sc.k > 1e-9)) return { re: 0, im: 0, abs: 0, dsdO: 0 };
    let sr = 0, si = 0;
    for (const d of sc.deltas){
      const e2 = Math.cos(2*d.delta), s2i = Math.sin(2*d.delta);
      /* (e^{2iδ}−1) = (cos2δ−1) + i·sin2δ */
      const cr = e2 - 1, ci = s2i;
      const P = legendre(d.l, cosT);
      const w = (2*d.l + 1)*P/(2*sc.k);
      sr += w*cr; si += w*ci;
    }
    const re = si, im = -sr;               /* f = −i·S/(2k) */
    const abs = Math.hypot(re, im);
    return { re, im, abs, dsdO: abs*abs };
  };
  /* 分波截面 σ_l = (4π/k²)(2l+1)sin²δ_l；s 波幺正上限 4π/k² */
  const partial = (E, V0, R, l, opts) => {
    const o = Object.assign({ disp: 'continuous' }, opts);
    const k = o.disp === 'discrete' ? kOfD(E, m) : Math.sqrt(2*m*E);
    if (!(k > 1e-9)) return 0;
    const { delta } = phaseShift(l, E, V0, R, o.disp);
    return 4*Math.PI/(k*k)*(2*l + 1)*Math.sin(delta)*Math.sin(delta);
  };
  return { phaseShift, scatter, amplitude, partial, logDerivIn, sphJ, sphN };
}

/* Legendre P_l（递推，cosθ∈[−1,1] 稳定） */
export function legendre(l, x){
  if (l === 0) return 1;
  if (l === 1) return x;
  let pm = 1, p0 = x;
  for (let n = 1; n < l; n++){
    const p1 = ((2*n + 1)*x*p0 - n*pm)/(n + 1);
    pm = p0; p0 = p1;
  }
  return p0;
}
