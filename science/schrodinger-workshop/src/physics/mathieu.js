/* ============================================================================
 * 1D Mathieu 能带模型（R62 光学晶格 Bloch 能带扫描的解析对照）
 *
 * 物理：V(x)=V₀·sin²(πx/a) 周期势（格点/世界单位，ℏ=1），薛定谔方程
 *   −ψ''/(2m) + V(x)·ψ = E·ψ
 * Bloch-Floquet 展开 ψ=e^{ikx}·Σ_n c_n·e^{i(2πn/a)x}（k∈[0,π/a] 简约 BZ）
 * 代入得**对称三对角**特征值问题（n∈[−Nc,Nc]）：
 *   对角 b_n = (k+2πn/a)²/(2m) + V₀/2        （动能 + 势的常数项）
 *   次对角 c   = −V₀/4                        （cos(2πx/a)=½(e^{i2πx/a}+e^{−i2πx/a})）
 * 每个 k 的最小/次小特征值即第 1/2 能带 E₁(k)≤E₂(k)；BZ 边界 k=π/a 处
 * E₂−E₁ 即第一能隙（gap）。
 *
 * 与标准 Mathieu 方程的换算（第三方对账锚点，scipy.special）：
 *   z=πx/a ⟹ ψ_zz + [a_M − 2q_M·cos2z]ψ = 0
 *   a_M = 2m(E−V₀/2)·(a/π)²，  q_M = −m·V₀·(a/π)²/2   （q 偶函数，取 |q|）
 *   E   = a_M/(2m)·(π/a)² + V₀/2
 *   scipy.special.mathieu_a/b(n,|q|) ⟺ 周期/反周期 Mathieu 函数的特征值参数：
 *     k=0（Bloch 周期）   ：带1（偶）= a_0、带2（奇）= b_2
 *     k=π/a（Bloch 反周期）：带1（奇）= b_1、带2（偶）= a_1
 *   （宇称分类：ce_{2m} 周期、se_{2m} 周期、ce_{2m+1}/se_{2m+1} 反周期；
 *     默认参数 V₀=0.1、a=32、m=1 ⟹ |q|≈5.2，pot62 以 scipy 四点对账定标。）
 *
 * 数值：Sturm 二分（LDL^T 负惯性指数计数，缩放递推防溢出）逐 k 取前两个
 * 特征值——O(n) 每次计数、100 次二分 ⟹ 全 k 网格毫秒级，无外部依赖。
 * ========================================================================== */

/* Bloch 三对角构造（默认参数：a=32、V₀=0.1、m=1 ⟹ |q|≈5.2；Nc=20 时傅里叶
   系数残差 ~(q/4Nc²)^Nc 量级，远低于对账阈值 1e-6） */
export const MATHIEU_NC = 20;

export function mathieuTridiag(k, o){
  const m = o.m, a = o.a, V0 = o.V0, Nc = o.Nc || MATHIEU_NC;
  const n = 2*Nc + 1;
  const b = new Float64Array(n);
  const twoPiA = 2*Math.PI/a;
  for (let i = 0; i < n; i++){
    const mode = k + (i - Nc)*twoPiA;             /* k + 2πn/a */
    b[i] = mode*mode/(2*m) + V0/2;
  }
  return { n, b, c: -V0/4, c2: (V0/4)*(V0/4), k };
}

/* 小于 lam 的特征值计数（LDL^T 负惯性指数，Sylvester 惯性定律）。
   三对角对称矩阵 T−λI = L·D·L^T（L 单位下三角、D 对角），D 的负对角元
   个数即小于 λ 的特征值数。递推 d = b_i−λ − c²/d（Schur 补，O(n)）。
   **实现选型记录（实测教训）**：初版用行列式递推（p_i=(b_i−λ)p_{i−1}−c²p_{i−2}
   计数 p_i<0），Float64 下 p_i 指数爆炸至 ±Infinity，负号在溢出点整段丢失
   （实测 count(λ) 非单调：count(0.025)=20 而 count(0.07)=2）⟹ 二分收敛到
   错误值（band1≡band2、gap≡0）。LDL 的 d 是 Schur 补对角元、量级受矩阵
   条件数约束不爆炸，实测全程单调逐 1 跳变。缩放递推救不了「d2 计算时已
   溢出」——必须在递推式本身选稳定形式。小主元（|d|<1e-300）替换为
   ±1e-300（λ 恰中特征值时的奇异档，二分中点几乎不会命中）。 */
export function sturmCount(b, c2, lam){
  let d = b[0] - lam, neg = d < 0 ? 1 : 0;
  for (let i = 1; i < b.length; i++){
    if (!(Math.abs(d) > 1e-300)) d = d < 0 ? -1e-300 : 1e-300;
    d = b[i] - lam - c2/d;
    if (d < 0) neg++;
  }
  return neg;
}

/* 第 j 小特征值（j 从 1 起）：Gershgorin 界内二分，sturmCount(mid)<j ⟹ 上探 */
export function sturmEigenvalue(b, c2, j){
  let lo = Infinity, hi = -Infinity;
  const span = 2*Math.abs(Math.sqrt(c2));
  for (let i = 0; i < b.length; i++){
    lo = Math.min(lo, b[i] - span);
    hi = Math.max(hi, b[i] + span);
  }
  lo -= 1; hi += 1;
  for (let it = 0; it < 120; it++){
    const mid = 0.5*(lo + hi);
    if (sturmCount(b, c2, mid) < j) lo = mid; else hi = mid;
    if (hi - lo <= 1e-13*Math.max(1, Math.abs(mid))) break;
  }
  return 0.5*(lo + hi);
}

/* 全 BZ 能带：k∈[0,π/a]，kN 点（含两端）。返回 {k[], band1[], band2[],
   gap:{k, E1, E2, width}, a:{k:0,kHalf}} 原始对象（未做 Mathieu 参数换算）。 */
export function mathieuBands(o){
  const a = o.a, kN = o.kN || 33;
  const kMax = Math.PI/a;                          /* 简约 BZ 边界 */
  const k = [], band1 = [], band2 = [];
  for (let i = 0; i < kN; i++){
    const kk = kMax * i/(kN - 1);
    const tr = mathieuTridiag(kk, o);
    k.push(kk);
    band1.push(sturmEigenvalue(tr.b, tr.c2, 1));
    band2.push(sturmEigenvalue(tr.b, tr.c2, 2));
  }
  /* 第一能隙：BZ 边界处 E₂−E₁（1D 能带的 gap 恒在区边界；带内 E₁ 递增） */
  const E1b = band1[kN - 1], E2b = band2[kN - 1];
  return {
    k, band1, band2, kN, kMax,
    gap: { k: kMax, E1: E1b, E2: E2b, width: E2b - E1b },
  };
}

/* Mathieu 特征值参数换算：a_M(b_n) → E（格点单位）。
   scipy 对账用：E(mathieu_a(0,q)) 应等于 k=0 的 band1，余见文件头分类表。 */
export function mathieuParamToE(aM, o){
  const m = o.m, a = o.a, V0 = o.V0;
  return aM/(2*m)*Math.pow(Math.PI/a, 2) + V0/2;
}

/* 反向：E → a_M（供 pot62 把 scipy 特征值参数与本模型互相换算核对） */
export function energyToMathieuParam(E, o){
  const m = o.m, a = o.a, V0 = o.V0;
  return 2*m*(E - V0/2)*Math.pow(a/Math.PI, 2);
}

/* q 参数（|q_M|，偶函数）——对账记录用 */
export function mathieuQ(o){
  return Math.abs(-o.m*o.V0*o.a*o.a/(2*Math.PI*Math.PI));
}
