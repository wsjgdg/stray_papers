/* 矩势垒透射的解析模型（「透射率扫描」工具的理论曲线；薛定谔与 Pauli 内核共用）。
   单位与引擎一致：格点（texel）、ℏ=1、m 为粒子质量。
   离散色散（引擎 5 点拉普拉斯的精确能带，x 向本征值 −4sin²(k/2)）：
     E(k) = 2·sin²(k/2)/m，反解 k(E) = 2·arcsin(√(mE/2))（E ≤ 2/m）。
   矩势垒（宽 a、高 V0）平面波透射（转移矩阵法的标准结果）：
     E>V0: T = [1 + V0²·sin²(k₂a)/(4E(E−V0))]⁻¹，k₂ = k(E−V0)
     E<V0: T = [1 + V0²·sinh²(κa)/(4E(V0−E))]⁻¹，κ = k(V0−E)
     E=V0: T = [1 + V0²·m·a²/(2E)]⁻¹（上下极限一致）
   k≪1 时退化为教科书公式（k₂=√(2m(E−V0))、κ=√(2m(V0−E))）。
   波包不是平面波：入射动量分布 p(k) 高斯（均值 kx、宽 dk=1/(√2σ)——与
   |ψ|² 宽度 σ²/2 的傅里叶对偶一致），透射后 p_t(k)=T(E(k))·p(k)，故
   P_trans = ∫T(E(k))p(k)dk 即 convolved——宽包实测应对照此曲线而非中心
   E 曲线（σ=18、kx=0.3 时 dk/kx≈13%，卷积把 E=V0 附近的陡峭结构抹平）。 */
export function rectangularBarrierModel(m){
  /* k(E)：能量→格点波数（离散色散反解；E≤0 为 0，E≥2/m 时为带顶 π） */
  const kOf = E => {
    if (!(E > 0)) return 0;
    const s = m*E/2;
    return s >= 1 ? Math.PI : 2*Math.asin(Math.sqrt(s));
  };
  const T = (E, V0, a) => {
    if (!(V0 > 0)) return 1;          /* 无势垒：全透射 */
    if (!(E > 0)) return 0;           /* 零能粒子对正势垒：全反射 */
    const d = V0 - E;
    if (Math.abs(d) < 1e-12) return 1/(1 + V0*V0*m*a*a/(2*E));
    if (d < 0){
      const k2 = kOf(E - V0);
      return 1/(1 + V0*V0*Math.sin(k2*a)*Math.sin(k2*a)/(4*E*(E - V0)));
    }
    const ka = kOf(d);
    return 1/(1 + V0*V0*Math.sinh(ka*a)*Math.sinh(ka*a)/(4*E*d));
  };
  const E = k => 2*Math.sin(k/2)*Math.sin(k/2)/m;
  return {
    T, E,
    /* Δk 卷积期望（Simpson，±5dk，401 点）：宽包透射率的合理对照目标 */
    convolved(kx, dk, V0, a){
      if (!(V0 > 0)) return 1;
      if (!(dk > 0)) return T(E(kx), V0, a);
      const N = 400, span = 5*dk;
      let sum = 0, wsum = 0;
      for (let i = 0; i <= N; i++){
        const k = kx - span + 2*span*i/N;
        const w = Math.exp(-((k - kx)/dk)*((k - kx)/dk)/2);
        const wt = (i === 0 || i === N) ? 1 : (i%2 ? 4 : 2);
        sum += wt*w*T(E(k), V0, a); wsum += wt*w;
      }
      return sum/wsum;
    },
  };
}
