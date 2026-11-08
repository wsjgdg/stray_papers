/* ============================================================================
 * 球形势垒 s 波透射模型（3D 扫描的解析对照，barrier.js 的 3D 对应物）
 *
 * 物理：l=0（迎头）径向方程 u''+k²u=0（垒外）/ u''+q²u=0（垒内），
 * u=r·R 且 u(0)=0（原点正则）⟹ 球垒的 s 波透射与「全宽 2R 的 1D 势垒
 * 偶宇称 sector」严格同解：
 *     T = 1/(1 + V0²·sin²(q·R)/(4E(E−V0)))          E > V0
 *     T = 1/(1 + V0²·sinh²(κ·R)/(4E(V0−E)))         E < V0（κ=kOf(V0−E)）
 * 共振（T=1）条件 q·R = nπ ⟹ V0_n = E − 2·sin²(nπ/(2R))/m。
 *
 * 色散口径（与引擎逐字一致，R29 既定约定）：
 *     E(k) = 2·sin²(k/2)/m        （5 点/7 点 stencil 沿轴离散色散；
 *                                   3D 7 点沿轴特征值 = 2uK(2−cos k)，同型）
 *     kOf(E) = 2·asin(√(mE/2))    （反解；E≥2/m 时截到带顶 π）
 * uK=0.5/m 由引擎 evolve 路径给出（app.js「const k = 0.5/this.state.m」）。
 *
 * 诚实边界（文档化，不装作精确）：
 *   · 模型是**平面波 s 波**；实测波包有 Δk 轴向展宽（convolved 已按高斯
 *     谱卷积）与**横向动量展宽**（耦合 l≥1 分波，未建模）⟹ 对照目标是
 *     「包络 + 共振峰位置」，不是点值相等。
 *   · 横向展宽使实测峰值低于平面波 T=1，峰位略有偏移——验证判据用
 *     卷积模型的峰位（数值扫描求得），容差按扫描步宽设。
 *   · 横向展宽的**主导效应是「绕球透射」**：碰撞参数 b>R 的波包份额根本不
 *     撞球（经典射线全额透射），使实测 3D T 系统性**高于** s 波曲线，且
 *     V0 越大高出越多（s 波衰减而绕球份额不变）。rayCorrected 给出这一
 *     偏移的经典射线估计（近似，见该函数注）；扫描图叠三条参考曲线。
 * ========================================================================== */
export function sphericalBarrierModel3(m){
  /* k(E)：能量→格点波数（离散色散反解；E≤0 为 0，E≥2/m 为带顶 π） */
  const kOf = E => {
    if (!(E > 0)) return 0;
    const s = m*E/2;
    return s >= 1 ? Math.PI : 2*Math.asin(Math.sqrt(s));
  };
  const E = k => 2*Math.sin(k/2)*Math.sin(k/2)/m;
  const T = (Ec, V0, R) => {
    if (!(V0 > 0)) return 1;          /* 无势垒：全透射 */
    if (!(Ec > 0)) return 0;
    const d = V0 - Ec;
    if (Math.abs(d) < 1e-12) return 1/(1 + V0*V0*m*R*R/(2*Ec));
    if (d < 0){
      const q = kOf(Ec - V0);
      return 1/(1 + V0*V0*Math.sin(q*R)*Math.sin(q*R)/(4*Ec*(Ec - V0)));
    }
    const ka = kOf(d);
    return 1/(1 + V0*V0*Math.sinh(ka*R)*Math.sinh(ka*R)/(4*Ec*d));
  };
  /* Δk 卷积期望（Simpson，±5dk，401 点）：轴向谱高斯权重的平均透射率。
     注意：只卷轴向 k；横向展宽的 l≥1 效应不在内（见文件头诚实边界）。 */
  const convolved = (kx, dk, V0, R) => {
    if (!(V0 > 0)) return 1;
    if (!(dk > 0)) return T(E(kx), V0, R);
    const N = 400, span = 5*dk;
    let sum = 0, wsum = 0;
    for (let i = 0; i <= N; i++){
      const k = kx - span + 2*span*i/N;
      const w = Math.exp(-((k - kx)/dk)*((k - kx)/dk)/2);
      const wt = (i === 0 || i === N) ? 1 : (i%2 ? 4 : 2);
      sum += wt*w*T(E(k), V0, R); wsum += wt*w;
    }
    return sum/wsum;
  };
  /* 共振峰位（T=1 的 V0 列表）：q·R = nπ 且 q 在导带内（q ≤ π）。
     返回 [{n, v0, ratio}]（ratio = v0/Ec）。 */
  const resonances = (Ec, R) => {
    const out = [];
    const kTop = kOf(Ec);
    for (let n = 1; n*Math.PI/R <= kTop + 1e-12; n++){
      const q = n*Math.PI/R;
      const v0 = Ec - 2*Math.sin(q/2)*Math.sin(q/2)/m;
      if (v0 > 0) out.push({ n, v0, ratio: v0/Ec });
    }
    return out;
  };
  /* 卷积模型的峰位（数值扫描：在 [lo,hi] 上以 step 分辨率求局部极大）。
     用于验证判据——实测峰应对齐卷积模型的峰（而非平面波 T=1 的理想位），
     因为 Δk 展宽会把峰推离理想位。 */
  const convolvedPeaks = (kx, dk, R, lo, hi, step) => {
    const f = v => convolved(kx, dk, v, R);
    const pts = [];
    for (let v = lo; v <= hi + 1e-12; v += step){
      pts.push({ v, t: f(v) });
      if (pts.length > 2){
        const a = pts[pts.length-3], b = pts[pts.length-2], c = pts[pts.length-1];
        if (b.t >= a.t && b.t >= c.t && b.t > 0.05) pts[pts.length-2].peak = true;
      }
    }
    return pts.filter(p => p.peak).map(p => p.v);
  };
  /* 经典射线修正（R38；**近似模型**，诚实边界见下）：
       T_3d(V0) ≈ f_miss + (1 − f_miss)·T_s_conv(V0)
     物理：入射波包有横向高斯展宽，飞到球垒时横向宽度 σ⊥(t_c)（自由色散
     σ⊥=σ0√(1+(t_c/t_d)²)，t_d=2mσ0²）；碰撞参数 b>R 的份额「绕球」全额
     透射（经典射线），b<R 的份额按 s 波迎头透射。碰撞时刻取波包中心抵达
     垒远面 t_c=(|x0|+R)/v_g（v_g=sin(kx)/m 为 kx 处群速度）。
     诚实边界：经典射线无衍射（球缘半影、grazing 射线的离心抑制不在内）；
     t_c 的取法有 t1..t3（近面/球心/远面）的模糊带；实测还另有「色散尾未
     过门」的小亏量（高 T 端 ~5-8%）。⟹ 用途是解释「实测 3D T 系统性高于
     s 波曲线」的偏移量级并给出包络，不是精确点值。 */
  const rayCorrected = (kx, sigma, V0, R, x0) => {
    if (!(V0 > 0)) return 1;
    const vg = Math.sin(kx) / m;            /* kx 处群速度（世界单位/时间单位） */
    const td = 2 * m * sigma * sigma;       /* 自由色散时标 */
    const tc = (Math.abs(x0) + R) / vg;     /* 中心抵达垒远面 */
    const sPerp = sigma * Math.sqrt(1 + (tc / td) * (tc / td));
    const fMiss = Math.exp(-(R * R) / (2 * sPerp * sPerp));
    const dk = 1 / (Math.SQRT2 * sigma);
    return fMiss + (1 - fMiss) * convolved(kx, dk, V0, R);
  };
  return { T, E, kOf, convolved, resonances, convolvedPeaks, rayCorrected };
}
