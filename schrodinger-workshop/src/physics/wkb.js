/* ============================================================================
 * WKB 透射包络（R70：双势垒 T(E) 曲线的解析对照）
 *
 * 动机：R67 的离散 TMM 给出双垒 T(E) 的「精确数值」（与 GPU 同一 5 点递推），
 * 但曲线上**没有解析参照**——共振峰为什么在那里、包络为什么按那个斜率衰减，
 * 都缺一个闭式答案。WKB 补上这一块：
 *   · E < V0：T_WKB ≈ exp(−4κb)（两片墙各贡献 exp(−2κb)，κ=√(2m(V0−E))）
 *     ——这是「非共振谷底」的包络；精确曲线在谷底附近贴着它，在共振处冲到 1。
 *   · E > V0：领头阶 WKB 无反射 ⟹ T=1；精确曲线在 1 附近振荡（垒内往返相位），
 *     振幅 ~ V0²/(4E(E−V0)) 随 E 衰减 ⟹ 高端「平均」收敛到 1。
 *   · E ≈ V0：**WKB 失效**（两个转向点重合，连接公式的指数衰减假设崩溃）——
 *     如实标注，不把失效区画成可信曲线。
 *
 * 诚实边界（与 README/面板 hint 同款，不装作精确）：
 *   · 领头阶 WKB 不含连接公式的振幅前因子：单垒精确解
 *     T = [1 + V0²sinh²(κa)/(4E(V0−E))]⁻¹ ≈ 16E(V0−E)/V0² · e^{−2κa}
 *     比 e^{−2κa} 多一个前因子 16E(V0−E)/V0²（E≪V0 时 ≪1）。所以收敛性
 *     判据用**不透明度**（=−½ln T，前因子只是可加常数）而非 T 点值：
 *     不透明度_WKB = 2κb（T_WKB=e^{−4κb}）与不透明度_精确在 E≪V0、κb 大时收敛。
 *   · WKB 包络**看不到共振峰**（准束缚结构需要well内相位匹配，超出领头阶）——
 *     这正是「精确 TMM 峰 + WKB 谷底包络」对照的教学价值所在。
 *   · 准能级用 Bohr–Sommerfeld 驻波条件 k·gap = nπ；本模块给**离散色散版**
 *     E_n = 2uK(1−cos(nπ/gap))（R67 的 (nπ/gap)²uK 是其低 k 近似，
 *     n 高时 k→π、离散版显著更低——引擎离散口径的正确答案）。
 * ========================================================================== */

/* 双垒 WKB 模型。单位与引擎一致：格点（texel）、ℏ=1、m 为粒子质量。
   参数：V0 垒高、bw 单片垒宽（texel）、gap 中央阱宽（texel）。 */
export function wkbBarrierModel(m){
  const uK = 0.5/m;
  /* 连续衰减常数 κ(E)=√(2m(V0−E))（ℏ=1） */
  const kappa = (E, V0) => (E < V0) ? Math.sqrt(Math.max(0, 2*m*(V0 - E))) : 0;
  /* WKB 双垒透射包络（领头阶）：
     E<V0：exp(−4κb)（谷底）；E>V0：1（无反射领头阶）；E=V0：失效（返回 NaN，
     调用方负责标注——不把失效区画成曲线）。 */
  const envelope = (E, V0, bw, gap) => {
    if (!(V0 > 0)) return 1;
    if (Math.abs(E - V0) < 1e-9) return NaN;      /* 转向点重合：WKB 失效 */
    if (E < V0) return Math.exp(-4*kappa(E, V0)*bw);
    return 1;
  };
  /* WKB 不透明度（=−½ln T；双垒 T_WKB=e^{−4κb} ⟹ 不透明度 = 2κb。
     E>V0 时为 0（领头阶无反射）。注意与「光学深度」−lnT=4κb 的口径差
     2×——本模块统一用 −½lnT（与 TMM 实测 −½lnT 直接可比）。 */
  const opacity = (E, V0, bw) => (E < V0) ? 2*kappa(E, V0)*bw : 0;
  /* Bohr–Sommerfeld 准能级（离散色散）：阱内驻波 k·gap = nπ，
     k = 2·asin(√(mE/2)) 的反演 ⟹ E_n = 2uK(1−cos(nπ/gap))。
     返回 [{n, E, k}]，k=nπ/gap 为离散波数。 */
  const quasiLevels = (V0, gap, nMax, Emax) => {
    const out = [];
    for (let n = 1; n <= nMax; n++){
      const k = n*Math.PI/gap;
      if (k >= Math.PI) break;                    /* 带顶以上无导带 */
      const E = 2*uK*(1 - Math.cos(k));
      if (E < Emax) out.push({ n, E, k });
    }
    return out;
  };
  /* 与 dbCurve 同网格采样的包络点（画布叠加用） */
  const curvePoints = (V0, bw, gap, Emax, nE) => {
    const pts = [];
    for (let i = 0; i < nE; i++){
      const E = 2e-4 + (Emax - 2e-4)*i/(nE - 1);
      pts.push({ E, T: envelope(E, V0, bw, gap) });
    }
    return pts;
  };
  return { uK, kappa, envelope, opacity, quasiLevels, curvePoints };
}
