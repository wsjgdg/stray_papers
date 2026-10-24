/* ============================================================================
 * codefamily.js — R85 码族与真阈值：重复码族 × Steane 级联族
 *
 * 这一页要立住的两件事：
 *   ① **真阈值存在**：重复码（仅 X 噪声）的阈值是经典 1/2（闭式可验）；
 *      Steane 级联 L1 ~ O(p²)、L2 ~ O(p⁴)——每级联一层指数压低，
 *      L1/L2 曲线在 p* 交叉就是「码族越大阈值现象越锐」的直接证据。
 *   ② **单次解码有地板**：综合征测量一旦带噪（同 p），最后一次读数的噪声
 *      无法被后续轮次确认 ⟹ 残差综合征 ≠ 0（outside 类）频率 ≈ 1−(1−p)^m，
 *      与码距 d 无关 ⟹ 所有族的曲线被同一条 O(p) 地板压平，**没有阈值**。
 *      这就是 R82/R83「多轮 + 连续一致解码」存在的原因：只有多轮才能把
 *      测量噪声平掉。本页把测量噪声做成开关（默认关），两边曲线同屏对照。
 *
 * 判定口径（与 flagsynd / shor.js 完全一致）：
 *   残差 = 真实错误 ⊕ 解码器修正；失败 ⟺ 残差 ∉ S（稳定子群）。
 *     - perfect：残差 ∈ S（纠回）
 *     - logic ：残差 ∈ N(S)\S（辛乘积为零但不在 S ⟹ 静默逻辑错误）
 *     - outside：残差 ∉ N(S)（综合征非零——测量噪声的主产地）
 *
 * 实现要点：
 *   - 纯 Pauli 帧演算（x/z 两个 0/1 数组，不用态矢）——码族扫描要跑 10⁴ 点次。
 *   - 解码器：重复码 = 相邻差综合征的最小权重解（O(d) DP，两个候选取轻）；
 *     Steane = Hamming[7,4] 综合征查表（3 位 → 唯一权重 ≤1 解，列即全部
 *     非零 3 位向量）。级联解码：先逐块内层 Hamming 解码，块级逻辑错误
 *     （奇偶位）作为外层的 7 位错误向量，再外层 Hamming 解码。
 *   - 精确引擎（画曲线用，MC 在小 p 处没有分辨率）：级联结构可分解——
 *     每层只需子块的 2×2 联合表 Q2(C/L × C/L)（outside 由边际闭式给出），
 *     层间递归 Q2_{k} = pn0²·Σ_{4^7} Π qℓ·[xclass][zclass]，顶层
 *     P(clean) = pn0²·Σ_{4^7} Π Q2·[xc=0][zc=0]。16384 项/层，与 p 无关的
 *     预计算 + O(p) 每点。pot85 用 MC 与穷举双重对账。
 *   - ⚠ 帧面对调陷阱（首版在此处错过，已修）：每帧的综合征取自 **自己**
 *     的逻辑指示向量——X 帧综合征 = H·ℓx（Z 型校验测 X 帧），Z 帧对称
 *     取 H·ℓz（X 型校验测 Z 帧）。辛积 ⟨R, X_L⟩ = r_z·1⁷ 只说「残差
 *     与逻辑 X 的反对易由 Z 帧奇偶决定」——那是逻辑失败判据，不是综合
 *     征来源，不可混用。pot85 以 4^7 穷举 + MC 双重对账逐位验。
 * ========================================================================== */
import { mulberry32 } from './qcircuit.js';

/* ---------- Steane [[7,1,3]] 的 H（Hamming[7,4] 校验矩阵，3×7）---------- *
 * 列 = 全部 7 个非零 3 位向量：c0=100 c1=010 c2=001 c3=110 c4=101 c5=011 c6=111
 * 行（7 位掩码，bit j = 第 j 列的第 i 位）：
 *   row0 = (1,0,0,1,1,0,1) = 0b1011001 = 89
 *   row1 = (0,1,0,1,0,1,1) = 0b1101010 = 106
 *   row2 = (0,0,1,0,1,1,1) = 0b1110100 = 116
 * 性质（pot85 逐条验）：H·Hᵀ = 0；行空间 = [7,3,4] 单纯形（权重 0/4）；
 *   ker(H) = 行空间 ∪ (1⁷+行空间)（权重 3 的 Fano 线 × 7 + 1⁷）；
 *   X̄_L = Z̄_L = 1⁷（全 1，H·1⁷ = 0 且 ∉ 行空间）。                        */
export const STEANE_H = [0b1011001, 0b1101010, 0b1110100];
export const STEANE_N = 7;

const popcnt = v => { let c = 0; while (v){ c ^= v & 1; v >>= 1; } return c; };
const hdot = v => (popcnt(v & STEANE_H[0])) | (popcnt(v & STEANE_H[1]) << 1) | (popcnt(v & STEANE_H[2]) << 2);
/* 列 j 的 3 位综合征值 */
const H_COL = Array.from({ length: 7 }, (_, j) =>
  ((STEANE_H[0] >> j) & 1) | (((STEANE_H[1] >> j) & 1) << 1) | (((STEANE_H[2] >> j) & 1) << 2));
/* 综合征 → 修正掩码：0 → 0；非零 → 唯一权重 1 列（Hamming 解码器） */
const HC_TABLE = (() => {
  const t = new Array(8).fill(0);
  for (let j = 0; j < 7; j++) t[H_COL[j]] = 1 << j;
  return t;
})();
export function hammingCorrect(syn3){ return HC_TABLE[syn3 & 7]; }
export function steaneSyn(v){ return hdot(v); }
/** ker(H) 中「逻辑陪集」判据：综合征 0 且奇偶 1 ⟺ ∈ 1⁷+行空间（Fano 线或 1⁷） */
export function isLogicalCoset(v){ return hdot(v) === 0 && (popcnt(v) & 1) === 1; }

/* ---------- 族定义 ---------- */
export const CF_FAMILIES = [
  { k: 'rep3', kind: 'rep', d: 3, name: '重复码 d=3', sym: '⌗3' },
  { k: 'rep5', kind: 'rep', d: 5, name: '重复码 d=5', sym: '⌗5' },
  { k: 'rep7', kind: 'rep', d: 7, name: '重复码 d=7', sym: '⌗7' },
  { k: 'rep9', kind: 'rep', d: 9, name: '重复码 d=9', sym: '⌗9' },
  { k: 'st1', kind: 'steane', level: 1, name: 'Steane [[7,1,3]]', sym: '⊗7' },
  { k: 'st2', kind: 'steane', level: 2, name: 'Steane² [[49,1,9]]', sym: '⊗49' },
];
/** L3 = 343 比特：模块级导出（pot85 验证标度），页面不上面板——p=10⁻³ 处
 *  P_L ~ 10⁷·p⁸ ≈ 10⁻¹⁷，任何可行 MC 样本量都测不到（0 事件），画出来只能是噪声。 */
export const CF_FAMILY_ST3 = { k: 'st3', kind: 'steane', level: 3, name: 'Steane³ [[343,1,27]]', sym: '⊗343' };
export const CF_ALL = [...CF_FAMILIES, CF_FAMILY_ST3];

export const CF_DEFAULTS = {
  family: 'st1',
  noise: 'x',        /* 'x' 仅 X（bit-flip 信道）· 'depol' 退极化 X/Y/Z 各 p/3 */
  meas: 0,           /* 0 综合征测量无噪 · 1 每位以 p 翻转（单次解码 ⟹ 地板） */
  p: 0.02,
  trials: 4000,
  seed: 7,
};
export const CF_NOISES = [
  { k: 'x', name: '仅 X', desc: '每比特以 p 注入 X（bit-flip 信道，R78 同口径）' },
  { k: 'depol', name: '退极化', desc: '每比特 X/Y/Z 各 p/3——重复码挡不住 Z 类穿透' },
];

/** 族的比特数 / 码距 / 综合征位数（测量地板用）。fam 接受族对象或 'rep3'/'st1' 字符串 key */
export function cfNQ(fam){ const f = typeof fam === 'string' ? CF_ALL.find(x => x.k === fam) : fam; return f.kind === 'rep' ? f.d : Math.pow(7, f.level); }
export function cfDistance(fam){ const f = typeof fam === 'string' ? CF_ALL.find(x => x.k === fam) : fam; return f.kind === 'rep' ? f.d : Math.pow(3, f.level); }
export function cfSynBits(fam){ const f = typeof fam === 'string' ? CF_ALL.find(x => x.k === fam) : fam; return f.kind === 'rep' ? f.d - 1 : Math.pow(7, f.level) - 1; }

/* ============================================================================
 * 精确引擎（无 MC 误差；meas 开关两态都精确）
 * ========================================================================== */

/* ---- 重复码 ---- */
/* X -only + 无测量噪声：多数表决失败 ⟺ 翻转权重 > d/2（d 奇）——闭式 */
export function repPLexactX(p, d){
  let PL = 0;
  for (let w = (d + 1) / 2; w <= d; w++) PL += binom(d, w) * Math.pow(p, w) * Math.pow(1 - p, d - w);
  return PL;
}
function binom(n, k){
  let r = 1;
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return r;
}
/* 退极化：枚举 4^d 个 (x,z) 帧对，按受影响比特数 nAff=|x∨z| 与结局分桶
 * （一次性，缓存）。概率权重 = (1−p)^{d−nAff}·(p/3)^{nAff}——Y 错只算一个
 * 受影响比特（曾按 wx+wz 分桶：既与权重公式错配，又越界崩溃）。 */
const REP_TAB = new Map();
function repTable(d){
  if (REP_TAB.has(d)) return REP_TAB.get(d);
  /* counts[nAff][fate]：fate 0=perfect 1=logicX 2=logicZ */
  const counts = Array.from({ length: d + 1 }, () => [0, 0, 0]);
  const rec = (q, x, z, na) => {
    if (q === d){
      /* X 帧：相邻差综合征的最小权重解（DP）。综合征 = diff(x) = [x[i]^x[i+1]]，
       *   e0 递推 e0[i+1] = e0[i] ^ (x[i]^x[i+1])（y[0]=0 的解），另一解为其补 1^d⊕e0。
       * ⚠ 曾误写 e0[i+1] = e0[i] ^ x[i]——那是解 diff(e)=x（前缀异或），残差永远
       *   构不出 1^d，depol 的 X 帧逻辑项整段丢失（P_L 只剩 P(pz)；p=0.2/d=3 处
       *   低估 8%）。pot85 E1 独立穷举对质抓出；MC 路径 repTrial 一向用正确的
       *   x[i]^x[i+1]，两路径口径以此对齐。 */
      const e0 = new Array(d).fill(0);
      for (let i = 0; i < d - 1; i++) e0[i + 1] = e0[i] ^ (x[i] ^ x[i + 1]);
      let w0 = 0; for (const b of e0) w0 += b;
      const w1 = d - w0;
      const corr = w0 <= w1 ? e0 : e0.map(v => 1 - v);
      const rx = x.map((b, i) => b ^ corr[i]);
      const allOne = rx.every(b => b === 1);
      let pz = 0; for (const b of z) pz ^= b;
      const fate = allOne ? 1 : (pz ? 2 : 0);   /* Z 帧无校验 ⟹ 奇偶即逻辑 */
      counts[na][fate]++;
      return;
    }
    rec(q + 1, [...x, 0], [...z, 0], na);
    rec(q + 1, [...x, 1], [...z, 0], na + 1);
    rec(q + 1, [...x, 1], [...z, 1], na + 1);
    rec(q + 1, [...x, 0], [...z, 1], na + 1);
  };
  rec(0, [], [], 0);
  REP_TAB.set(d, counts);
  return counts;
}
/* 退极化 + 无测量噪声的精确 P_L（数据部分；测量噪声由外层闭式叠加） */
export function repPLexactDepol(p, d){
  const counts = repTable(d);
  let PL = 0;
  for (let w = 0; w <= d; w++){
    const bad = counts[w][1] + counts[w][2];
    if (!bad) continue;
    PL += bad * Math.pow(1 - p, d - w) * Math.pow(p / 3, w);
  }
  return PL;
}

/* ---- Steane 级联：2×2 块递归 ---- */
const C = 0, L = 1;   /* 子块帧类：clean / logical（outside 走边际闭式） */

/* 层间一步：由子块 2×2 联合表 Q2（C/L × C/L，未归一）算本层 2×2 表。
 *   Q2_k(a,b) = qBothOK⁷·pn0²·Σ_{(u,v)∈4⁷} Π_j qℓ(u_j,v_j)·[xc(u)=a]·[zc(v)=b]
 * 其中 qBothOK = Σ Q2_{k-1}（子块两帧都未 outside 的联合概率），
 *   qℓ = Q2_{k-1}/qBothOK（条件分布）；qBothOK⁷ 不可省——Q2 必须是真实
 *   联合概率，否则层数一高就差 (qBothOK⁷)^level。
 *   xc(u) = parity(u ⊕ hammingCorrect(H·u))（X 帧自身综合征解码后的残差奇偶），
 *   pn0 = 两帧综合征测量都无噪的概率（meas 关：1；开：(1−p)³，3 位各以 p 翻）。 */
function stepQ2(Q2, pn0){
  const tot = Q2[C][C] + Q2[C][L] + Q2[L][C] + Q2[L][L];
  const q = [
    [Q2[C][C] / tot, Q2[C][L] / tot],
    [Q2[L][C] / tot, Q2[L][L] / tot],
  ];
  /* 预计算 128 个 7 位模式的类别：xc(u) = parity(u ⊕ hc(H·u))（X 帧自身综合征） */
  const xc = new Array(128), zc = new Array(128);
  for (let m = 0; m < 128; m++){
    const corr = hammingCorrect(hdot(m));
    xc[m] = popcnt(m ^ corr) & 1;
    zc[m] = xc[m];   /* H 对称，两类同函数（depol 下 q 不同而已） */
  }
  /* Π_j q(u_j,v_j) 对 4^7 个 (u,v) 组合求和，按 (xc(u), zc(v)) 分桶 */
  const J = [[0, 0], [0, 0]];
  for (let u = 0; u < 128; u++){
    for (let v = 0; v < 128; v++){
      let pr = 1;
      for (let j = 0; j < 7; j++) pr *= q[(u >> j) & 1][(v >> j) & 1];
      J[xc[u]][zc[v]] += pr;
    }
  }
  /* q 是条件分布（除掉 qBothOK=tot）；真实联合概率乘回 tot⁷，再乘测量无噪 pn0² */
  const s = Math.pow(tot, 7) * pn0 * pn0;
  return [
    [J[C][C] * s, J[C][L] * s],
    [J[L][C] * s, J[L][L] * s],
  ];
}
/* 顶层：子块联合表 Q2 → logic = Σ_{u,v∈2⁷} Π_j Q2(u_j,v_j)·[xc(u)∨zc(v)]
 * （子块全未 outside 且外层残差奇偶为奇的概率，不含顶层测量因子——由调用方乘 pn0²）。
 * 128×128 按位求积（与 stepQ2 同构，权重用 Q2 而非 q）。 */
function topLogic(Q2){
  const xc = new Array(128), zc = new Array(128);
  for (let m = 0; m < 128; m++){
    const corr = hammingCorrect(hdot(m));
    xc[m] = popcnt(m ^ corr) & 1;
    zc[m] = xc[m];
  }
  let logic = 0;
  for (let u = 0; u < 128; u++){
    for (let v = 0; v < 128; v++){
      if (!xc[u] && !zc[v]) continue;
      let pr = 1;
      for (let j = 0; j < 7; j++) pr *= Q2[(u >> j) & 1][(v >> j) & 1];
      logic += pr;
    }
  }
  return logic;
}
/** Steane 级联 level 层的精确 P_L(p)（noise: 'x' 仅 X / 'depol' 退极化；meas 开/关都精确）。
 *  P_L = P(任一处 outside) + P(全链一致但残差奇偶为奇)
 *      = [1−(1−p)^{7^level−1}] + (1−p)^6·logic   （meas 开：全链共 7^level−1 个综合征位）
 *      = logic                                    （meas 关：综合征全精确，outside 恒 0）
 *  ⚠ outside 项必须走闭式 + expm1：若写成 1−pn0²·tot⁷，meas 关时 tot=1±1e-16，
 *  相消噪声 ~1e-16 会淹没小 p 的 logic（st3 在 p=10⁻⁴ 处 ~10⁻²⁴），曾让 PL 变负、
 *  cfLeadingPower 出 NaN。logic 本身正项直加，无此问题。 */
export function steaneExactPL(p, level, meas = 0, noise = 'depol'){
  const pn0 = meas ? Math.pow(1 - p, 3) : 1;
  /* level 0 子块 = 物理量子：(x,z) 四类，never outside。x-only 时 Z 帧恒 C */
  let Q2 = noise === 'x'
    ? [[1 - p, 0], [p, 0]]
    : [[1 - p, p / 3], [p / 3, p / 3]];
  for (let k = 1; k < level; k++) Q2 = stepQ2(Q2, pn0);
  const logic = topLogic(Q2);
  const outside = meas ? -Math.expm1((Math.pow(7, level) - 1) * Math.log1p(-p)) : 0;
  return outside + pn0 * pn0 * logic;
}

/* ============================================================================
 * 统一入口：单点精确 P_L / 扫描 / 交叉点
 * ========================================================================== */
export function cfExactPL(p, fam, noise = 'x', meas = 0){
  const f = typeof fam === 'string' ? CF_ALL.find(x => x.k === fam) : fam;
  if (!f) return NaN;
  if (f.kind === 'rep'){
    const data = noise === 'x' ? repPLexactX(p, f.d) : repPLexactDepol(p, f.d);
    /* 测量噪声：任一位综合征被翻 ⟹ outside（与码距无关的 O(p) 地板） */
    const pm = meas ? 1 - Math.pow(1 - p, f.d - 1) : 0;
    return pm + (1 - pm) * data;
  }
  return steaneExactPL(p, f.level, meas, noise);
}
/** 测量地板：至少一位综合征被翻转的概率（P_L 的下界，与码距无关的 O(p) 项） */
export function cfFloor(p, fam, meas = 0){
  if (!meas) return 0;
  const f = typeof fam === 'string' ? CF_ALL.find(x => x.k === fam) : fam;
  const m = f.kind === 'rep' ? f.d - 1 : Math.pow(7, f.level) - 1;
  return 1 - Math.pow(1 - p, m);
}

export const CF_PS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.18, 0.25, 0.35, 0.5];

/** 扫描（页面曲线）：全族精确 P_L(p) + 未编码基线 + 阈值标注 */
export function cfSweep(cfg = {}){
  const c = { ...CF_DEFAULTS, ...cfg };
  const ps = c.ps || CF_PS;
  const out = { p: ps.slice(), noise: c.noise, meas: c.meas, fams: {}, floor: {}, uncoded: ps.slice() };
  for (const f of CF_FAMILIES){
    out.fams[f.k] = ps.map(p => cfExactPL(p, f, c.noise, c.meas));
    out.floor[f.k] = ps.map(p => cfFloor(p, f, c.meas));
  }
  /* 交叉点：L1 vs L2（真阈值的证据：两族曲线相交）。
   * ⚠ 必须「粗网格找首个变号 + 区间内 bisect」而不能直接对端点 bisect——
   * x-only 时 p=1/2 是每族 P_L 的平凡不动点（该点 P_L 恒 1/2），直接
   * bisect(1e-5, 0.5) 会撞上 d(0.5)=0 返回端点 0.5，完全错过真交叉
   * （x-only 全阶真值 0.0646，不是领先幂次的 1/21=0.0476——(1−p) 因子
   * 把交叉点推高了；depol 真值 0.0909）。pot85 用自带网格实现逐位对账。 */
  const f1 = p => cfExactPL(p, 'st1', c.noise, c.meas);
  const f2 = p => cfExactPL(p, 'st2', c.noise, c.meas);
  out.cross12 = firstCross(f1, f2, 1e-5, 0.5);
  /* 伪阈值：各族 vs 未编码基线 p。x-only 时 rep 族恰在 1/2（经典阈值），
   * Steane 两族同点（该点 st1=st2≈p）；depol 时 rep 族恰在 3/4——p=3/4 的
   * 退极化信道是 X/Z 两帧独立公平翻转（每位 x,z 各 1/2 独立），于是
   * P(X 帧多数失败)=1/2、P(Z 帧奇偶)=1/2、独立 ⟹ P_L=3/4，与 d/层级无关
   * 的精确不动点（pot85 E4 逐族断言）。搜索上界必须覆盖 3/4（曾取 0.6，
   * 会把该根漏报成 null）。meas 开时 O(p) 地板恒大于 p ⟹ 网格内无变号
   * ⟹ null（页面如实显示「无伪阈值」）。 */
  out.pseudo = {};
  for (const f of CF_FAMILIES){
    const g = p => cfExactPL(p, f, c.noise, c.meas) - p;
    out.pseudo[f.k] = firstCross(g, x => 0, 1e-7, 0.9);
  }
  return out;
}
/** 首个交叉点：粗网格（CROSS_GRID 点）找第一处变号，再在括号区间内 bisect 细化。
 *  区间内无变号（含 meas 开时的地板情景）⟹ null——调用方须如实处理 null。 */
const CROSS_GRID = 512;
function firstCross(f, g, lo, hi){
  const d = x => f(x) - g(x);
  let a = lo, da = d(a);
  if (da === 0) return a;
  for (let i = 1; i <= CROSS_GRID; i++){
    const b = lo + (hi - lo) * i / CROSS_GRID;
    const db = d(b);
    if (db === 0) return b;
    if ((da > 0) !== (db > 0)){
      let xa = a, xb = b;
      for (let k = 0; k < 60; k++){
        const m = (xa + xb) / 2;
        if ((d(m) > 0) === (da > 0)) xa = m; else xb = m;
      }
      return (xa + xb) / 2;
    }
    a = b; da = db;
  }
  return null;
}

/* ============================================================================
 * 蒙特卡洛（页面当前点 + pot85 对账精确引擎）
 * ========================================================================== */
/** 单次试验：返回 { fate, weight, xw, zw }。fate ∈ perfect/logic/outside */
export function cfTrial(fam, cfg = {}, rng){
  const c = { ...CF_DEFAULTS, ...cfg };
  const f = typeof fam === 'string' ? CF_ALL.find(x => x.k === fam) : fam;
  const r = rng || mulberry32(c.seed);
  if (f.kind === 'rep') return repTrial(f.d, c, r);
  return steaneTrial(f.level, c, r);
}

function sampleErr(c, r){
  const u = r();
  if (c.noise === 'x') return u < c.p ? [1, 0] : [0, 0];
  if (u < c.p / 3) return [1, 0];
  if (u < 2 * c.p / 3) return [1, 1];
  if (u < c.p) return [0, 1];
  return [0, 0];
}
function noiseBit(c, r){ return c.meas && r() < c.p ? 1 : 0; }

function repTrial(d, c, r){
  const x = [], z = [];
  for (let i = 0; i < d; i++){ const e = sampleErr(c, r); x.push(e[0]); z.push(e[1]); }
  /* X 帧：相邻差综合征（Z 校验 ZiZi+1 测 X），每位可被测量噪声翻转 */
  const syn = [];
  for (let i = 0; i < d - 1; i++) syn.push((x[i] ^ x[i + 1]) ^ noiseBit(c, r));
  /* 最小权重解：两个候选（差分为 syn 的向量 = e0 与 e0+1^d）取轻 */
  const e0 = new Array(d).fill(0);
  for (let i = 0; i < d - 1; i++) e0[i + 1] = e0[i] ^ syn[i];
  let w0 = 0; for (const b of e0) w0 += b;
  const corr = w0 * 2 <= d ? e0 : e0.map(v => 1 - v);
  const rx = x.map((b, i) => b ^ corr[i]);
  /* 残差综合征 = 测量噪声（修正精确消去真实综合征）⟹ outside ⟺ 残差综合征 ≠ 0。
   * ⚠ 勿与 diff(x) 比：diff(rx)=0 恒成立（解码器精确匹配所测综合征），
   * 与 diff(x) 比等于「真实综合征非零即 outside」——单错都会被误判。 */
  let out = false;
  for (let i = 0; i < d - 1; i++) if (rx[i] ^ rx[i + 1]) out = true;
  let pz = 0; for (const b of z) pz ^= b;
  const allOne = rx.every(b => b === 1);
  let fate = 'perfect';
  if (out) fate = 'outside';
  else if (allOne || (c.noise !== 'x' && pz)) fate = 'logic';
  return { fate, xw: x.reduce((a, b) => a + b, 0), zw: z.reduce((a, b) => a + b, 0) };
}

/* Steane 级联 MC：递归解码。块结局 cx/cz ∈ C/L/O（clean/logical/outside） */
function steaneTrial(level, c, r){
  const n = Math.pow(7, level);
  const x = new Array(n), z = new Array(n);
  for (let i = 0; i < n; i++){ const e = sampleErr(c, r); x[i] = e[0]; z[i] = e[1]; }
  const out = decodeBlock(level, x, z, 0, c, r);
  return { fate: out.cx === 'O' || out.cz === 'O' ? 'outside' : (out.cx === 'L' || out.cz === 'L' ? 'logic' : 'perfect'),
    xw: x.reduce((a, b) => a + b, 0), zw: z.reduce((a, b) => a + b, 0) };
}
function decodeBlock(level, x, z, off, c, r){
  if (level === 0){
    const cx = x[off] ? 'L' : 'C', cz = z[off] ? 'L' : 'C';
    return { cx, cz };
  }
  const cn = Math.pow(7, level - 1);
  const lx = new Array(7).fill(0), lz = new Array(7).fill(0);
  let outX = false, outZ = false;
  for (let j = 0; j < 7; j++){
    const ch = decodeBlock(level - 1, x, z, off + j * cn, c, r);
    if (ch.cx === 'O') outX = true; else lx[j] = ch.cx === 'L' ? 1 : 0;
    if (ch.cz === 'O') outZ = true; else lz[j] = ch.cz === 'L' ? 1 : 0;
  }
  /* 外层 X 侧：综合征 = H·ℓx（Z 型校验测 X 帧——本帧自己的向量），噪声 3 位 */
  let sx = 0;
  for (let i = 0; i < 3; i++){ let b = 0; for (let j = 0; j < 7; j++) b ^= lx[j] & ((STEANE_H[i] >> j) & 1); sx |= (b ^ noiseBit(c, r)) << i; }
  const cxOut = sx !== hdotL(lx);
  const corrX = hammingCorrect(sx);
  let parX = 0; for (let j = 0; j < 7; j++) parX ^= (lx[j] ^ ((corrX >> j) & 1));
  /* 外层 Z 侧：综合征 = H·ℓz（X 型校验测 Z 帧） */
  let sz = 0;
  for (let i = 0; i < 3; i++){ let b = 0; for (let j = 0; j < 7; j++) b ^= lz[j] & ((STEANE_H[i] >> j) & 1); sz |= (b ^ noiseBit(c, r)) << i; }
  const czOut = sz !== hdotL(lz);
  const corrZ = hammingCorrect(sz);
  let parZ = 0; for (let j = 0; j < 7; j++) parZ ^= (lz[j] ^ ((corrZ >> j) & 1));
  return {
    cx: outX || cxOut ? 'O' : (parX ? 'L' : 'C'),
    cz: outZ || czOut ? 'O' : (parZ ? 'L' : 'C'),
  };
}
function hdotL(v7){
  let s = 0;
  for (let i = 0; i < 3; i++){ let b = 0; for (let j = 0; j < 7; j++) b ^= v7[j] & ((STEANE_H[i] >> j) & 1); s |= b << i; }
  return s;
}

/* 流式累加器（R98 P2）：step(count) 分帧；result() 出当前统计。 */
export function cfStream(fam, cfg = {}){
  const c = { ...CF_DEFAULTS, ...cfg };
  const f = typeof fam === 'string' ? CF_ALL.find(x => x.k === fam) : fam;
  const rng = mulberry32(c.seed);
  const byFate = { perfect: 0, logic: 0, outside: 0 };
  let n = 0, wsum = 0;
  function one(){
    const t = cfTrial(f, c, rng);
    byFate[t.fate]++;
    wsum += t.xw + t.zw;
    n++;
  }
  return {
    get total(){ return Math.max(1, c.trials | 0); },
    get n(){ return n; },
    step(count){ for (let k = 0, m = Math.max(0, count | 0); k < m; k++) one(); },
    result(){
      const nn = Math.max(1, n);
      return {
        family: f.k, p: c.p, noise: c.noise, meas: c.meas, trials: n,
        PL: (byFate.logic + byFate.outside) / nn,
        byFate, meanFaults: wsum / nn,
        exact: cfExactPL(c.p, f, c.noise, c.meas),
      };
    },
  };
}

/* 一次性全批：同一 rng 消耗序 ⟹ 数值与流式逐位一致 */
export function cfEnsemble(fam, cfg = {}){
  const s = cfStream(fam, cfg);
  s.step(s.total);
  return s.result();
}

/* ============================================================================
 * 结构自检（pot85 用）：Steane 上全部 C(7,2) 个权重 2 X 错误必失败
 * （Hamming 解码把双错修成单错，残差是 Fano 线 ⟹ 逻辑）——「距离 3 的码
 *   双错必漏」的代数真相，也是 L1 ~ O(p²) 系数的来源。                      */
export function steaneWeight2Check(){
  let fail = 0, tot = 0;
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++){
    tot++;
    const x = (1 << a) | (1 << b);
    const corr = hammingCorrect(hdot(x));
    if (isLogicalCoset(x ^ corr)) fail++;
  }
  return { tot, fail };
}
/** 级联标度（小 p 极限，pot85 对照）：
 *   x-only  L1 ≈ 21p²（C(7,2) 个权重 2 全失败）；L2 ≈ C(7,2)·(21p²)² = 9261p⁴。
 *   depol   L1 ≈ 2·C(7,2)·(2p/3)² − C(7,2)·(p/3)² = 49p²/3 —— 并集要扣掉
 *     「同两个 Y 同时打穿两帧」的交集项（首版手推 56p²/3 就是漏了它）；
 *           L2 ≈ 2·C(7,2)·(28p²/3)² − 21·(7p²/3)² ≈ 3544p⁴。
 *   幂次由引擎对数差分给出（rep depol ≈ 1：Z 帧无校验穿透，无阈值）。 */
export function cfLeadingPower(fam, noise = 'depol', meas = 0){
  const f = typeof fam === 'string' ? CF_ALL.find(x => x.k === fam) : fam;
  const p = 1e-4;
  const a = cfExactPL(p, f, noise, meas), b = cfExactPL(p / 2, f, noise, meas);
  return { PL: a, power: Math.log2(a / b) };
}
