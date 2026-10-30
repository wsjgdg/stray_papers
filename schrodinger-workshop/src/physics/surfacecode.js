/* ============================================================================
 * surfacecode.js（R128 新建）— 旋转表面码（rotated surface code）[[d²,1,d]]
 *
 * 为什么开这一页（码族页 / family 页诚实限制 ③ 的原话）：
 *   「表面码未做（d=3,5,7 表面码留待后续）」。family 页用**重复码族 + Steane
 *   级联族**立住了「伪阈值 vs 真阈值」的判据，但那两类码都是**一维**结构
 *   （重复码只查 X；Steane 是块状级联）。表面码是二维拓扑码：**权重 4 与
 *   权重 2 的稳定子混排、两类边界分开**，纠错靠「把综合征连起来」而不是
 *   「多数表决 / 查表」。这一页把这条路线补上。
 *
 * ---- 码的构造（本文件的唯一真源；printScLattice 可打印检查）----------
 * 数据比特：(r,c)，0 ≤ r,c < d（n = d²）。
 * 稳定子：以「单元」(i,j) 为中心，支撑 = 四角 ∩ 网格；i,j ∈ [-1, d-1]。
 *   - 单元权重 1（四角只有一个在网格内）⟹ 不是稳定子（跳过）。
 *   - 内部单元（0 ≤ i,j ≤ d-2）⟹ 权重 4。
 *   - 边界单元（i 或 j = -1 / d-1）⟹ 权重 2。
 *   类型由棋盘格 (i+j) mod 2 定：偶 = X，奇 = Z。
 *   **边界额外规则**（不加这条就构造不出 [[d²,1,d]]——见下面的搜索记录）：
 *     上/下边（i = -1 或 d-1）只保留 (i+j) 为**奇**的单元；
 *     左/右边（j = -1 或 d-1）只保留 (i+j) 为**偶**的单元。
 * 计数：内部单元 (d-1)² 个，按奇偶两类各 (d-1)²/2；边界每边保留 (d-1)/2 个
 *   （四边共 2(d-1) 个，两类各 d-1）⟹ |X| = |Z| = (d-1)²/2 + (d-1)
 *   = (d²-1)/2 ⟹ 稳定子总数 d²-1 = n-1 ⟹ k = 1。
 *   权重谱只有 4 与 2：|X| 里权重 4 的 (d-1)²/2 个、权重 2 的 d-1 个。
 * 逻辑：X_L = 顶行（d 个比特）、Z_L = 左列（d 个比特），权重都恰为 d。
 *
 * ---- 构造是怎么定下来的（诚实记录，避免下轮重走）----------------------
 * 只看棋盘格奇偶（不加边界规则）时：d=3 得 12 个候选稳定子，其中 X/Z 交叠
 * 为奇数的对子把 12 个单元连成一整块 ⟹ 任何合法配色都要求全部同型 ⟹ 不可能
 * 同时有 X 和 Z。故必须按「边」区分奇偶。把四个边各两种取法（2^4 = 16 种）
 * 全枚举后，只有两种配色同时满足 [commute ∧ k=1 ∧ 距离=d]，且互为 X↔Z 镜像；
 * 本文件取其中一种（上/下保留奇数单元）。d=5 同款配色复现 [[25,1,5]]。
 *
 * ---- 噪声口径 -----------------------------------------------------------
 * code-capacity（综合征测量理想，不注入测量错误）：与 family 页 meas=0 同口径。
 *   noise='x'    每比特以 p 注入 X（bit-flip 信道；只解一种错误）。
 *   noise='depol' 每比特 I 概率 1-p，X/Y/Z 各 p/3。
 *                ⟹ X 分量概率 2p/3、Z 分量概率 2p/3（Y 同时给两帧）。
 *   ⚠ 退极化下本页**分帧独立解码**（X 帧、Z 帧各解一次），丢掉 Y 的相关性
 *   ⟹ 阈值落在 p ≈ 1.5 × 单帧阈值（正是文献 10.3% → 15.5% 的那个 1.5 因子）。
 *   相关性解码（correlated matching）能推到 18.9%，本页**不做**（如实标注）。
 *
 * ---- 解码器：MWPM（最小权重完美匹配）-----------------------------------
 * 匹配图（每种帧一张）：节点 = 对型稳定子 + 两个边界节点；边 = 数据比特
 *   （比特属于 2 个对型稳定子 ⟹ 连这两点；只属于 1 个 ⟹ 连到它所在的边界）。
 *   实测（d=3）左/右列比特只属 1 个 Z 稳定子 ⟹ X 帧在**左/右边界**终止；
 *   上/下行比特只属 1 个 X 稳定子 ⟹ Z 帧在**上/下边界**终止。
 * 权重：均匀 1（code-capacity 同款）；节点间距离 = BFS 步数（含边界节点）。
 * 求解：缺陷数 k ≤ 14 用**位掩码 DP 精确解**（边界节点可被任意缺陷多次匹配，
 *   标准做法）；k > 14 退回「贪心 + 2-opt」，并把回退率**报在 HUD 上**。
 *   回退率在 d≤7、p≤0.15 的区间 ≤1%；d=9 在 p≳0.09 起就明显上升
 *   ⟹ 本页只上 d=3/5/7，d=9 只在测试里用（如实标注）。
 * 失败判据：修正后的残差 ∈ N(S)（构造保证综合征为 0）⟹ 只需看逻辑类：
 *   X 帧残差与 Z_L 的交叠奇偶为 1 ⟹ 逻辑 X 错误；Z 帧对称。
 *
 * ---- 验证（Node 套件 pot128；逐条对应）--------------------------------
 *   A 结构：d=3/5/7/9 的 n=d²、|X|=|Z|=(d²-1)/2、全对易、rank=n-1 ⟹ k=1、
 *     逻辑 X/Z 权重 d、互不对易、不在稳定子 span 内、解码图强连通。
 *   B 距离：穷举低权重（d=3/5 搜到 ≤d；d=7 搜到 ≤6）⟹ 不存在权重 < d 的逻辑。
 *   C 解码最优性：d=3 全 512 个 X 帧错误模式（16 个可达综合征），解码修正的
 *     权重 = 同综合征最小权重（0 次次优）；且 d=3 的 P_L 与「逐综合征最大
 *     似然」解码**逐点相等**（差 0.0e+0）。
 *   D 精确枚举：d=3 全 4⁹ 模式（退极化）/ 2⁹（仅 X）的 P_L 与 MC 在 4σ 内。
 *   E 阈值：同 p 下 P_L 随 d 单调降（阈值下侧）/ 随 d 单调升（阈值上侧）——
 *     两侧排序反转即阈值；交叉点带 σ（d3×d5 ≈0.095±0.010 / d5×d7 ≈0.090±0.005，
 *     退极化 0.133±0.009 / 0.140±0.004），相邻两对的差落在 σ 内 ⟹ **不宣称
 *     交叉点随 d 上移**（本尺寸不可分辨，见 README 物理结果④）。
 *   F 单比特/双比特错误：d≥3 的单比特 Pauli 错误 100% 纠回；d≥5 的双比特
 *     错误 100% 纠回（码距 t=⌊(d-1)/2⌋ 的直接后果）。
 *   G 边界与确定性：p=0 ⟹ P_L=0；同种子逐位一致；不同种子在 4σ 内。
 * ========================================================================== */

import { mulberry32 } from './qcircuit.js';

/* ---------- 位运算：BigInt 掩码（d=9 ⟹ 81 比特，超出 number 安全位宽） ---------- */
const pc = v => { let c = 0; while (v){ c += Number(v & 1n); v >>= 1n; } return c; };
const bitLen = v => { let n = 0; while (v){ n++; v >>= 1n; } return n; };
const toMask = arr => arr.reduce((m, q) => m | (1n << BigInt(q)), 0n);
const has = (m, q) => ((m >> BigInt(q)) & 1n) === 1n;

/* ---------- GF(2) 线性代数（pivot = 最高位；inSpan 必须用真正的行阶梯） ----------
 * ⚠ 教训（本轮实测）：最早的 rankRows 只把新行按已有行的 pivot 消一次，
 * 得到的基**不是**行阶梯 ⟹ inSpan 会误判（同样的输入换个插入顺序就得出
 * 「权重 2 的逻辑」这种假结果）。改成 pivot 表 + 逐位回代后，d=3/5/7 的
 * 距离搜索才稳定给出 d。线性代数不吃「差不多」。 */
export function makeBasis(rows){
  const b = new Map();
  for (let r of rows){
    while (r){
      const p = bitLen(r) - 1;
      const x = b.get(p);
      if (x === undefined){ b.set(p, r); break; }
      r ^= x;
    }
  }
  return b;
}
export function inSpan(b, v){
  while (v){
    const p = bitLen(v) - 1;
    const x = b.get(p);
    if (x === undefined) return false;
    v ^= x;
  }
  return true;
}
export const basisRank = b => b.size;

/* ---------- 码定义 ---------- */
export const SC_DISTANCES = [3, 5, 7];
/** 引擎支持（测试用）到 d=9：n=81、|X|=|Z|=40、解码图节点 42。 */
export const SC_ALL_DISTANCES = [3, 5, 7, 9];
export const SC_NOISES = [
  { k: 'x', name: '仅 X', desc: '每比特以 p 注入位翻转（单帧：只解一种错误；文献 d→∞ MWPM 渐近阈值 10.3%）' },
  { k: 'depol', name: '退极化', desc: '每比特 X/Y/Z 各 p/3；分帧独立解码 ⟹ 阈值 ≈1.5×单帧（文献渐近 15.5%）' },
];
export const SC_DEFAULTS = { d: 3, noise: 'x', p: 0.08, trials: 4000, seed: 7 };
/** 扫描点：跨阈值两侧（实测交叉：仅 X 0.090–0.095±0.01，退极化 0.133–0.140±0.01）。 */
export const SC_PS = [0.02, 0.04, 0.06, 0.075, 0.09, 0.10, 0.11, 0.13, 0.16, 0.20];

const SC_CACHE = new Map();

/** 造码（带缓存）：返回 qubit / 稳定子 / 逻辑 / 两张解码图 */
export function scBuild(d){
  if (!(d >= 3 && d % 2 === 1)) throw new Error('表面码距离必须是 ≥3 的奇数（收到 ' + d + '）');
  if (SC_CACHE.has(d)) return SC_CACHE.get(d);
  const n = d * d, X = [], Z = [];
  for (let i = -1; i <= d - 1; i++){
    for (let j = -1; j <= d - 1; j++){
      const sup = [];
      for (const [r, c] of [[i, j], [i, j + 1], [i + 1, j], [i + 1, j + 1]]){
        if (r >= 0 && r < d && c >= 0 && c < d) sup.push(r * d + c);
      }
      if (sup.length < 2) continue;                       // 角单元（权重 1）不是稳定子
      const par = ((i + j) % 2 + 2) % 2;
      const side = (i === -1 ? 'T' : i === d - 1 ? 'B' : j === -1 ? 'L' : j === d - 1 ? 'R' : null);
      if (side && par !== ((side === 'T' || side === 'B') ? 1 : 0)) continue;
      const rec = { sup, mask: toMask(sup), w: sup.length, par, side, i, j };
      (par === 0 ? X : Z).push(rec);
    }
  }
  const code = { d, n, X, Z };
  code.xl = toMask(Array.from({ length: d }, (_, c) => c));       // 顶行 = 逻辑 X
  code.zl = toMask(Array.from({ length: d }, (_, r) => r * d));   // 左列 = 逻辑 Z
  code.xg = scGraph(code, 'X');
  code.zg = scGraph(code, 'Z');
  SC_CACHE.set(d, code);
  return code;
}

/** 匹配图：type='X' ⟹ 节点 = Z 稳定子 + {左,右} 边界；type='Z' ⟹ X 稳定子 + {上,下} */
function scGraph(code, type){
  const d = code.d, n = code.n;
  const stab = type === 'X' ? code.Z : code.X;
  const nS = stab.length, nodes = nS + 2;
  const adj = Array.from({ length: nodes }, () => []);
  const qStab = Array.from({ length: n }, () => []);
  stab.forEach((s, k) => s.sup.forEach(q => qStab[q].push(k)));
  for (let q = 0; q < n; q++){
    const L = qStab[q], r = Math.floor(q / d), c = q % d;
    if (L.length === 2){
      adj[L[0]].push({ to: L[1], q }); adj[L[1]].push({ to: L[0], q });
    } else if (L.length === 1){
      const bi = type === 'X' ? (c === 0 ? nS : nS + 1) : (r === 0 ? nS : nS + 1);
      adj[L[0]].push({ to: bi, q }); adj[bi].push({ to: L[0], q });
    } else {
      throw new Error('表面码构造异常：比特 ' + q + ' 不属于任何对型稳定子');
    }
  }
  /* BFS 全源最短距离 + 父指针（回溯路径用；节点数 ≤ 42，全源很便宜） */
  const dist = [], par = [];
  for (let s = 0; s < nodes; s++){
    const D = new Array(nodes).fill(Infinity), P = new Array(nodes).fill(-1), PQ = new Array(nodes).fill(-1);
    D[s] = 0; const queue = [s];
    for (let h = 0; h < queue.length; h++){
      const u = queue[h];
      for (const { to, q: qq } of adj[u]){
        if (D[to] === Infinity){ D[to] = D[u] + 1; P[to] = u; PQ[to] = qq; queue.push(to); }
      }
    }
    dist.push(D); par.push({ P, PQ });
  }
  return { nS, nodes, adj, dist, par, stab, type, qStab };
}

/** 路径上的比特掩码（从 a 的 BFS 树走到 b） */
function pathMask(g, a, b){
  const P = g.par[a]; let m = 0n, u = b, guard = 0;
  while (u !== a){
    const p = P.P[u];
    if (p < 0) throw new Error('匹配图上不可达：' + a + ' → ' + b);
    m |= 1n << BigInt(P.PQ[u]); u = p;
    if (++guard > 1e6) throw new Error('路径回溯成环');
  }
  return m;
}

/* ---------- MWPM ---------- */
export const SC_CFG = { dpMax: 14 };

function matchPairs(g, defects){
  const k = defects.length, nS = g.nS, bA = nS, bB = nS + 1, D = g.dist;
  if (k === 0) return { pairs: [], mode: 'none' };
  if (k <= SC_CFG.dpMax){
    const memo = new Map();
    const solve = mask => {
      if (mask === 0) return { cost: 0, plan: [] };
      const cached = memo.get(mask);
      if (cached !== undefined) return cached;
      const i = Math.log2(mask & -mask) | 0;              // 取最低位缺陷
      let best = null;
      for (const b of [bA, bB]){                          // 缺陷 ← 边界（边界可被复用）
        const c = D[defects[i]][b];
        if (c < Infinity){
          const r = solve(mask & ~(1 << i));
          if (r && (best === null || c + r.cost < best.cost)) best = { cost: c + r.cost, plan: [{ a: defects[i], b }].concat(r.plan) };
        }
      }
      for (let j = i + 1; j < k; j++){                    // 缺陷 ← 缺陷
        if (!(mask & (1 << j))) continue;
        const c = D[defects[i]][defects[j]];
        if (c < Infinity){
          const r = solve(mask & ~(1 << i) & ~(1 << j));
          if (r && (best === null || c + r.cost < best.cost)) best = { cost: c + r.cost, plan: [{ a: defects[i], b: defects[j] }].concat(r.plan) };
        }
      }
      memo.set(mask, best);
      return best;
    };
    const r = solve((1 << k) - 1);
    if (r) return { pairs: r.plan, mode: 'dp' };
  }
  /* 兜底：贪心（每次取全局最短可选边）+ 2-opt（交叉互换 / 单缺陷改边界 /
   * 两个边界对并成缺陷对）。实测「纯贪心」比 DP 差 6–11σ，2-opt 只挽回一部分
   * ⟹ 它只配当兜底，回退率必须曝光（HUD「回退」行 + pot128 H 组）。 */
  let rem = defects.slice(), plan = [];
  while (rem.length){
    let bi = 0, bj = -1, bc = Infinity, bb = -1;
    for (let i = 0; i < rem.length; i++){
      for (let j = i + 1; j < rem.length; j++){
        const c = D[rem[i]][rem[j]];
        if (c < bc){ bc = c; bi = i; bj = j; bb = -1; }
      }
      for (const b of [bA, bB]){
        const c = D[rem[i]][b];
        if (c < bc){ bc = c; bi = i; bj = -1; bb = b; }
      }
    }
    plan.push({ a: rem[bi], b: bj >= 0 ? rem[bj] : bb });
    rem = rem.filter((_, i) => i !== bi && i !== bj);
  }
  const isB = x => x === bA || x === bB;
  for (let sweep = 0; sweep < 40; sweep++){
    let improved = false;
    for (let i = 0; i < plan.length; i++){
      for (let j = i + 1; j < plan.length; j++){
        const A1 = plan[i].a, A2 = plan[i].b, B1 = plan[j].a, B2 = plan[j].b;
        const old = D[A1][A2] + D[B1][B2];
        for (const [x, y] of [[[A1, B1], [A2, B2]], [[A1, B2], [A2, B1]]]){
          if (isB(x[0]) && isB(x[1])) continue;          // 边界—边界对无效
          if (isB(y[0]) && isB(y[1])) continue;
          const d1 = D[x[0]][x[1]], d2 = D[y[0]][y[1]];
          if (!(d1 < Infinity && d2 < Infinity)) continue;
          if (d1 + d2 < old){ plan[i] = { a: x[0], b: x[1] }; plan[j] = { a: y[0], b: y[1] }; improved = true; }
        }
      }
    }
    for (let i = 0; i < plan.length; i++){
      const { a, b } = plan[i];
      if (!isB(b)){
        for (const nb of [bA, bB]) if (D[a][nb] < D[a][b]){ plan[i] = { a, b: nb }; improved = true; }
      } else {
        for (let j = i + 1; j < plan.length; j++){
          const q = plan[j];
          if (isB(q.b) && D[a][q.a] < D[a][b] + D[q.a][q.b]){ plan[i] = { a, b: q.a }; plan.splice(j, 1); improved = true; break; }
        }
      }
    }
    if (!improved) break;
  }
  return { pairs: plan, mode: 'greedy' };
}

/** 单帧解码：给定该帧错误掩码 → {corr, residual, cls, k, mode} */
export function scDecode(code, mask, type){
  const g = type === 'X' ? code.xg : code.zg;
  const defects = [];
  g.stab.forEach((s, k) => { if (pc(s.mask & mask) & 1) defects.push(k); });
  const dual = type === 'X' ? code.zl : code.xl;
  if (!defects.length) return { corr: 0n, residual: mask, cls: pc(mask & dual) & 1, k: 0, mode: 'none' };
  const { pairs, mode } = matchPairs(g, defects);
  let corr = 0n;
  for (const { a, b } of pairs) corr ^= pathMask(g, a, b);
  const residual = mask ^ corr;
  return { corr, residual, cls: pc(residual & dual) & 1, k: defects.length, mode };
}

/* ---------- 结构自检 ---------- */
export function scVerify(d){
  const C = scBuild(d);
  let commute = true;
  for (const a of C.X) for (const b of C.Z) if (pc(a.mask & b.mask) & 1) commute = false;
  const bAll = makeBasis([...C.X.map(c => c.mask), ...C.Z.map(c => c.mask)]);
  const bX = makeBasis(C.X.map(c => c.mask));
  const bZ = makeBasis(C.Z.map(c => c.mask));
  const deg = stabs => { const a = new Array(C.n).fill(0); stabs.forEach(s => s.sup.forEach(q => a[q]++)); return a; };
  const xd = deg(C.X), zd = deg(C.Z);
  const rank = basisRank(bAll);
  return {
    d, n: C.n, nX: C.X.length, nZ: C.Z.length, commute, rank, k: C.n - rank,
    xlWeight: pc(C.xl), zlWeight: pc(C.zl),
    xlLogical: C.Z.every(c => (pc(c.mask & C.xl) & 1) === 0),
    zlLogical: C.X.every(c => (pc(c.mask & C.zl) & 1) === 0),
    anticommute: (pc(C.xl & C.zl) & 1) === 1,
    xlInSpan: inSpan(bX, C.xl), zlInSpan: inSpan(bZ, C.zl),
    weightHist: [0, 2, 4].reduce((o, w) => (o[w] = C.X.filter(c => c.w === w).length, o), {}),
    minXdeg: Math.min(...xd), maxXdeg: Math.max(...xd),
    minZdeg: Math.min(...zd), maxZdeg: Math.max(...zd),
    graphConnected: [C.xg, C.zg].every(g => g.dist.every(row => row.every(v => v < Infinity))),
  };
}

/** 最小权重逻辑搜索（独立于解码器；权重上限 wmax 之内找不到 ⟹ 距离 > wmax） */
export function scMinLogical(code, type, wmax){
  const n = code.n, stabs = type === 'X' ? code.X : code.Z, other = type === 'X' ? code.Z : code.X;
  const basis = makeBasis(stabs.map(c => c.mask));
  const qsyn = Array.from({ length: n }, (_, q) => {
    let s = 0n;
    other.forEach((m, k) => { if (has(m.mask, q)) s |= 1n << BigInt(k); });
    return s;
  });
  const comb = []; let hit = null;
  const rec = (start, w) => {
    if (hit) return;
    if (w === 0){
      let s = 0n, v = 0n;
      for (const q of comb){ s ^= qsyn[q]; v |= 1n << BigInt(q); }
      if (s === 0n && !inSpan(basis, v)) hit = { w: comb.length, v };
      return;
    }
    for (let q = start; q < n; q++){ comb.push(q); rec(q + 1, w - 1); comb.pop(); }
  };
  for (let w = 1; w <= wmax && !hit; w++) rec(0, w);
  return hit;
}

/* ---------- 采样与 MC ----------
 * RNG 用 qcircuit.js 的 mulberry32（与 codefamily/qcircuit 同源）：
 * ⚠ 不能在本文件重新定义——单文件 bundler 把所有模块拼进同一个 script 作用域，
 * 重名会在 `node --check` 处直接 FAIL（本轮实测：multiply declared）。
 * 依赖方向 qcircuit → surfacecode 与 codefamily 一致，无环。 */

/** 单次试验：返回两帧的错误/修正/缺陷数与失败标志（页面画图用同一份数据） */
export function scTrial(code, cfg, rng){
  const { p, noise } = cfg;
  let mx = 0n, mz = 0n;
  for (let q = 0; q < code.n; q++){
    const u = rng();
    if (noise === 'x'){
      if (u < p) mx |= 1n << BigInt(q);
    } else {
      const t = u * 3;                       // X / Y / Z 各占 1/3，合计 p
      if (t < p) mx |= 1n << BigInt(q);
      else if (t < 2 * p){ mx |= 1n << BigInt(q); mz |= 1n << BigInt(q); }
      else if (t < 3 * p) mz |= 1n << BigInt(q);
    }
  }
  const rx = scDecode(code, mx, 'X'), rz = scDecode(code, mz, 'Z');
  return {
    fail: (rx.cls | rz.cls) === 1, xfail: rx.cls === 1, zfail: rz.cls === 1,
    mx, mz, corrX: rx.corr, corrZ: rz.corr,
    kx: rx.k, kz: rz.k, modeX: rx.mode, modeZ: rz.mode,
    resX: rx.residual, resZ: rz.residual,
  };
}

/** MC 集合：PL / 两帧分解 / 回退率 / 平均缺陷数 */
export function scEnsemble(code, cfg = {}){
  const c = { p: 0.05, noise: 'depol', trials: 2000, seed: 7, ...cfg };
  const rng = mulberry32(c.seed);
  let fail = 0, xf = 0, zf = 0, fb = 0, ksum = 0, lastTrial = null;
  for (let i = 0; i < c.trials; i++){
    const r = scTrial(code, c, rng);
    lastTrial = r;
    if (r.fail) fail++;
    if (r.xfail) xf++;
    if (r.zfail) zf++;
    if (r.modeX === 'greedy' || r.modeZ === 'greedy') fb++;
    ksum += r.kx + r.kz;
  }
  const N = c.trials;
  return {
    d: code.d, p: c.p, noise: c.noise, trials: N,
    PL: fail / N, PLx: xf / N, PLz: zf / N,
    fallback: fb / N, meanDefects: ksum / (2 * N), lastTrial,
    sigma: Math.sqrt(Math.max(fail / N * (1 - fail / N), 1e-12) / N),
  };
}

/** 流式单帧 MC：与 scEnsemble 同 RNG 顺序，附最近一条完整轨迹供播放显示。 */
export function scStream(code, cfg = {}){
  const c = { p: 0.05, noise: 'depol', trials: 2000, seed: 7, ...cfg };
  const rng = mulberry32(c.seed);
  let fail = 0, xf = 0, zf = 0, fb = 0, ksum = 0, n = 0, lastTrial = null;
  function one(){
    const r = scTrial(code, c, rng);
    if (r.fail) fail++;
    if (r.xfail) xf++;
    if (r.zfail) zf++;
    if (r.modeX === 'greedy' || r.modeZ === 'greedy') fb++;
    ksum += r.kx + r.kz;
    lastTrial = r;
    n++;
  }
  return {
    get total(){ return Math.max(1, c.trials | 0); },
    get n(){ return n; },
    step(count){ for (let k = 0, m = Math.max(0, count | 0); k < m; k++) one(); },
    result(){
      const N = Math.max(1, n), PL = fail / N;
      return { d: code.d, p: c.p, noise: c.noise, trials: n, PL, PLx: xf / N, PLz: zf / N,
        fallback: fb / N, meanDefects: ksum / (2 * N),
        sigma: Math.sqrt(Math.max(PL * (1 - PL), 1e-12) / N), lastTrial };
    },
  };
}

/** d=3 精确枚举（4⁹ = 262144 / 2⁹ = 512；d≥5 不可枚举，如实抛错） */
export function scExactPL(code, cfg = {}){
  const { p, noise } = cfg, n = code.n;
  if (n > 12) throw new Error('精确枚举只对 d=3（n=9）可行：4^9 = 262144，d=5 是 4^25');
  const states = noise === 'x' ? 2 : 4, total = Math.pow(states, n);
  let fail = 0, xf = 0, zf = 0, mass = 0;
  for (let s = 0; s < total; s++){
    let mx = 0n, mz = 0n, x = s, wt = 0;
    for (let q = 0; q < n; q++){
      const sym = x % states; x = (x - sym) / states;
      if (noise === 'x'){ if (sym === 1){ mx |= 1n << BigInt(q); wt++; } }
      else if (sym === 1){ mx |= 1n << BigInt(q); wt++; }
      else if (sym === 2){ mx |= 1n << BigInt(q); mz |= 1n << BigInt(q); wt++; }
      else if (sym === 3){ mz |= 1n << BigInt(q); wt++; }
    }
    const prob = Math.pow(p, wt) * Math.pow(1 - p, n - wt) * Math.pow(noise === 'x' ? 1 : 1 / 3, noise === 'x' ? 0 : wt);
    const rx = scDecode(code, mx, 'X'), rz = scDecode(code, mz, 'Z');
    if (rx.cls === 1) xf += prob;
    if (rz.cls === 1) zf += prob;
    if ((rx.cls | rz.cls) === 1) fail += prob;
    mass += prob;
  }
  return { PL: fail, PLx: xf, PLz: zf, mass, trials: total };
}

/** d=3 的「逐综合征最大似然」解码 P_L（用于证明 MWPM 在 d=3 处不输 ML） */
export function scMLexact(code, p, type = 'X'){
  const n = code.n;
  if (n > 12) throw new Error('ML 枚举只对 d=3');
  const g = type === 'X' ? code.xg : code.zg;
  const synOf = m => { let s = 0; g.stab.forEach((st, k) => { if (pc(st.mask & m) & 1) s |= 1 << k; }); return s; };
  const bySyn = new Map();
  for (let s = 0; s < (1 << n); s++){
    let m = 0n, wt = 0;
    for (let q = 0; q < n; q++) if (s >> q & 1){ m |= 1n << BigInt(q); wt++; }
    const prob = Math.pow(p, wt) * Math.pow(1 - p, n - wt);
    const cls = scDecode(code, m, type).cls, key = synOf(m);
    const cur = bySyn.get(key) || [0, 0];
    cur[cls] += prob; bySyn.set(key, cur);
  }
  let fail = 0;
  for (let s = 0; s < (1 << n); s++){
    let m = 0n, wt = 0;
    for (let q = 0; q < n; q++) if (s >> q & 1){ m |= 1n << BigInt(q); wt++; }
    const prob = Math.pow(p, wt) * Math.pow(1 - p, n - wt);
    const cls = scDecode(code, m, type).cls, [p0, p1] = bySyn.get(synOf(m));
    if (cls !== (p1 >= p0 ? 1 : 0)) fail += prob;
  }
  return fail;
}

/** 曲线扫描（每个 d 一条 P_L(p)）；噪声口径共用 */
export function scSweep(cfg = {}){
  const c = { noise: 'x', trials: 4000, seed: 7, ps: SC_PS, ds: SC_DISTANCES, ...cfg };
  return c.ds.map(d => {
    const code = scBuild(d);
    const rows = c.ps.map(p => {
      const r = scEnsemble(code, { p, noise: c.noise, trials: c.trials, seed: c.seed });
      return { p, PL: r.PL, sigma: r.sigma, fallback: r.fallback, meanDefects: r.meanDefects };
    });
    return { d, rows };
  });
}

/**
 * 交叉点扫描（scCrossing / scCrossingCI 共用）：把两条曲线压成差值序列。
 * 判据分两关，缺一不可：
 *   ① 单点分辨：两端都要 PL > k·σ（σ = √(P(1-P)/N)，scEnsemble 给）。低 p 端 P_L
 *      掉到 0 或几十个计数时，差值符号纯由 MC 噪声决定。
 *   ② **排序反转**：交叉点低 p 侧必须存在一个「差值显著为正（A>B）」的点、
 *      高 p 侧必须存在一个「差值显著为负（A<B）」的点（k·σ_f 判据，σ_f=√(σ_A²+σ_B²)），
 *      或镜像。只过第 ① 关是不够的——本轮 jsdom 冒烟在 N=1500 上抓到 c57=0.0200：
 *      两条曲线在低 p 端差别只有几十个计数，差值符号翻转一次就被当成交叉点。
 *      第 ② 关要求「曲线确实从一侧换到了另一侧」，噪声翻转过不了。
 * 有多个合格变号时取**最高 p 的那个**（低 p 端的假象已被两关挡住；真出现二次
 * 交叉时，阈值意义的是高 p 那个）。
 */
function crossScan(a, b, k){
  const n = Math.min(a.length, b.length), pts = [];
  for (let i = 0; i < n; i++){
    const A = a[i], B = b[i];
    const sA = A.sigma === undefined ? 0 : A.sigma, sB = B.sigma === undefined ? 0 : B.sigma;
    pts.push({ p: A.p, f: A.PL - B.PL, sf: Math.hypot(sA, sB), ok: A.PL > k * sA && B.PL > k * sB });
  }
  /** 低 p 侧（< i）有显著正、高 p 侧（≥ i）有显著负，或镜像 ⟹ 记为一次排序反转 */
  const reversal = i => {
    let loPos = false, loNeg = false, hiPos = false, hiNeg = false;
    for (let j = 0; j < i; j++){
      if (!pts[j].ok) continue;
      if (pts[j].f > k * pts[j].sf) loPos = true;
      if (pts[j].f < -k * pts[j].sf) loNeg = true;
    }
    for (let j = i; j < pts.length; j++){
      if (!pts[j].ok) continue;
      if (pts[j].f > k * pts[j].sf) hiPos = true;
      if (pts[j].f < -k * pts[j].sf) hiNeg = true;
    }
    return (loPos && hiNeg) || (loNeg && hiPos);
  };
  return { pts, reversal, n };
}

/** 交叉点（线性插值）；统计上分不开时返回 null（页面显示「—」，不编数字） */
export function scCrossing(a, b, k = 3){
  const { pts, reversal } = crossScan(a, b, k);
  let best = null;
  for (let i = 1; i < pts.length; i++){
    if (!pts[i - 1].ok || !pts[i].ok || !reversal(i)) continue;
    const f1 = pts[i - 1].f, f2 = pts[i].f;
    if (f1 === 0){ best = pts[i - 1].p; continue; }
    if (f1 * f2 < 0) best = pts[i - 1].p + (f1 / (f1 - f2)) * (pts[i].p - pts[i - 1].p);
  }
  return best;
}

/**
 * 交叉点 + 不确定度：σ_p ≈ σ_f / |df/dp|（f = PL_A − PL_B，σ_f = √(σ_A²+σ_B²)）。
 * 为什么必须给 σ：d=5×d=7 两条曲线在阈值附近贴得很近，交叉点的位置对 MC
 * 噪声极敏感（页面默认网格 SC_PS 上实测：退极化 d5×d7 在 N=4000 给 0.113±0.008、
 * N=12000 给 0.139±0.012；仅 X 在 N=1500/4000 直接判未分辨，N=12000 才给
 * 0.097±0.011）——只写一个三位小数等于假装它有三位精度。页面 HUD 显示 p ± σ。
 */
export function scCrossingCI(a, b, k = 3){
  const { pts, reversal } = crossScan(a, b, k);
  let best = null;
  for (let i = 1; i < pts.length; i++){
    if (!pts[i - 1].ok || !pts[i].ok || !reversal(i)) continue;
    const f1 = pts[i - 1].f, f2 = pts[i].f;
    if (f1 === 0){ best = { p: pts[i - 1].p, sigma: pts[i - 1].sf, i: i - 1 }; continue; }
    if (f1 * f2 < 0){
      const t = f1 / (f1 - f2);
      const slope = Math.abs((f2 - f1) / (pts[i].p - pts[i - 1].p));
      const sf = Math.max(pts[i - 1].sf, pts[i].sf);
      best = { p: pts[i - 1].p + t * (pts[i].p - pts[i - 1].p), sigma: slope > 0 ? sf / slope : Infinity, i: i - 1 };
    }
  }
  return best;
}

/** 领先幂次 α（P_L ~ C·p^α）：在最小两点上取对数斜率 */
export function scLeadingPower(rows){
  const pts = rows.filter(r => r.PL > 0).slice(0, 3);
  if (pts.length < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const r of pts){
    const x = Math.log(r.p), y = Math.log(r.PL);
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const k = pts.length;
  const den = k * sxx - sx * sx;
  if (!den) return null;
  return (k * sxy - sx * sy) / den;
}

/** 单比特 / 双比特 Pauli 错误的暴力纠错检查（d≥3 的 t=⌊(d-1)/2⌋ 直接后果） */
export function scWeightRepair(code, wmax, type = 'X'){
  const n = code.n, comb = []; let worst = null;
  const rec = (start, w) => {
    if (worst) return;
    if (w === 0){
      let m = 0n;
      for (const q of comb) m |= 1n << BigInt(q);
      const r = scDecode(code, m, type);
      if (r.cls) worst = { m, w: comb.length };
      return;
    }
    for (let q = start; q < n; q++){ comb.push(q); rec(q + 1, w - 1); comb.pop(); }
  };
  for (let w = 1; w <= wmax && !worst; w++) rec(0, w);
  return worst;    // null ⟹ 全部权重 ≤ wmax 的错误都被纠回
}

/* ============================================================================
 * 带噪测量口径（phenomenological）—— 时间维进匹配图
 *
 * code-capacity 口径假设综合征理想（诚实限制①）。把测量误差也算进来，匹配图必须
 * 多一个**时间**维：
 *   - 层 l（l = 0..R）是一次读出后的「探测事件」平面；R = **带噪**测量轮数，默认 R = d−1
 *     （总共 d 次读出：d−1 次带噪 + 末次理想）⟹ d 个数据错误层、d−1 个测量错误层；
 *   - 层内边 = 数据比特错误（带比特号，修正要用它）；层间 time 边 = 测量错误（不带比特）；
 *   - 两条边界在**每一层各有一份**且**不跨层相连**：连起来会让链沿边界在时间上
 *     瞬移（实测把逻辑错误率放大一个量级——0.018 → 0.18 那一档）；
 *   - 剥叶时所有边界统一挂到一个合成根 ⟹ 等价于「每个缺陷各自选最近的边界」，
 *     与二维 DP 的「边界可复用、但不许边界—边界配对」同义。
 * 缺陷 = 相邻两轮综合征之差：D_l = syn(e_l) ⊕ m_{l+1} ⊕ m_l（m_0 = m_{R+1} = 0）。
 * 于是「真值链」= 各层 e_l 的层内边 + 各轮 m_t 的 time 边，其边界正好是 D；
 * 任何一条边界为 D 的链投影到空间就是一组合法的修正（残余综合征恒零，pot130 B 组）。
 * 解码：边权取 −log 似然（层内 w_S = ln((1−p)/p)、层间 w_T = ln((1−q)/q)），
 *   q=0 时 w_T = ∞ ⟹ 解码器退化成「逐层独立解码」（pot130 D 组的闭式对照）。
 *   缺陷数 ≤ dpMax 走精确 DP，超出退贪心 + 2-opt（**回退率必须曝光**，与二维口径同规）。
 * ========================================================================== */

export const SC_PHEN = {
  dpMax: 20,
  /** 带噪测量口径的扫描点：交叉点在 0.01–0.03（q=0）到 0.02–0.03（q=p）之间 */
  ps: [0.005, 0.0075, 0.01, 0.0125, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05],
  pMin: 0.004,
  pMax: 0.06,
};

const SC_SPACE_CACHE = new Map();

/**
 * 时空匹配图（带缓存）。
 * 节点 = l·(nS+2) + k：k < nS 是稳定子，k = nS / nS+1 是两条边界（各层各一份）。
 * 边：层内 space（稳定子—稳定子）/ bnd（稳定子—边界），层间 time（同一稳定子）。
 */
export function scSpaceGraph(code, type, R){
  if (!(R >= 0 && R === Math.round(R))) throw new Error('测量轮数必须是非负整数（收到 ' + R + '）');
  const key = code.d + ':' + type + ':' + R;
  if (SC_SPACE_CACHE.has(key)) return SC_SPACE_CACHE.get(key);
  const g = type === 'X' ? code.xg : code.zg;
  const nS = g.nS, nn = nS + 2, L = R + 1, V = L * nn;
  const edges = [];
  const id = (k, l) => l * nn + k;
  const seen = new Set();
  for (let u = 0; u < g.nodes; u++) for (const e of g.adj[u]){
    const a = Math.min(u, e.to), b = Math.max(u, e.to);
    const k2 = a + ',' + b + ',' + e.q;
    if (seen.has(k2)) continue; seen.add(k2);
    for (let l = 0; l < L; l++)
      edges.push({ a: id(a, l), b: id(b, l), q: e.q, kind: b < nS ? 'space' : 'bnd' });
  }
  for (let l = 0; l + 1 < L; l++) for (let k = 0; k < nS; k++)
    edges.push({ a: id(k, l), b: id(k, l + 1), q: -1, kind: 'time' });
  const adj = Array.from({ length: V }, () => []);
  edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
  const grounds = [];
  for (let l = 0; l < L; l++) for (let b = nS; b < nn; b++) grounds.push(id(b, l));
  const isGround = new Uint8Array(V);
  for (const gd of grounds) isGround[gd] = 1;
  const gr = { d: code.d, type, R, nS, nn, L, V, edges, adj, grounds, isGround, id };
  SC_SPACE_CACHE.set(key, gr);
  return gr;
}

/** 时空图结构自检（页面 HUD 的「时空图」行 + Node 套件 A 组） */
export function scSpaceVerify(d, R = Math.max(1, d - 1)){
  const code = scBuild(d);
  const out = { d, R, layers: R + 1, ok: true, notes: [] };
  for (const type of ['X', 'Z']){
    const gr = scSpaceGraph(code, type, R);
    const nS = gr.nS, L = gr.L;
    const nSpace = gr.edges.filter(e => e.kind === 'space').length;
    const nBnd = gr.edges.filter(e => e.kind === 'bnd').length;
    const nTime = gr.edges.filter(e => e.kind === 'time').length;
    /* ① 计数：层内边 = 2D 图边数 × 层数；time 边 = nS × (L−1) */
    const n2d = type === 'X' ? code.xg : code.zg;
    let e2d = 0;
    const seen = new Set();
    for (let u = 0; u < n2d.nodes; u++) for (const e of n2d.adj[u]){
      const a = Math.min(u, e.to), b = Math.max(u, e.to);
      const k2 = a + ',' + b + ',' + e.q;
      if (seen.has(k2)) continue; seen.add(k2); e2d++;
    }
    if (nSpace + nBnd !== e2d * L) out.notes.push(type + ' 层内边数 ≠ 2D 边数 × 层数');
    if (nTime !== nS * (L - 1)) out.notes.push(type + ' time 边数 ≠ nS × (L−1)');
    /* ② 每层都恰好有两条边界节点，且边界不跨层相连 */
    if (gr.grounds.length !== 2 * L) out.notes.push(type + ' 边界节点数 ≠ 2 × 层数');
    for (const gd of gr.grounds){
      const deg = gr.adj[gd].map(i => gr.edges[i]);
      if (deg.some(e => e.kind === 'time')) out.notes.push(type + ' 边界节点跨层相连');
      if (!deg.length) out.notes.push(type + ' 边界节点孤立');
    }
    /* ③ 连通性（R ≥ 0 都要求整图连通：time 边把各层串起来） */
    const seenV = new Uint8Array(gr.V); const q = [0]; seenV[0] = 1;
    for (let h = 0; h < q.length; h++){
      for (const ei of gr.adj[q[h]]){
        const e = gr.edges[ei], v = e.a === q[h] ? e.b : e.a;
        if (!seenV[v]){ seenV[v] = 1; q.push(v); }
      }
    }
    if (q.length !== gr.V) out.notes.push(type + ' 时空图不连通（' + q.length + '/' + gr.V + '）');
    /* ④ 每个稳定子节点既有层内边也有 time 边（R ≥ 1 时） */
    if (R >= 1 && gr.adj[gr.id(0, 0)].every(i => gr.edges[i].kind !== 'time'))
      out.notes.push(type + ' 稳定子缺 time 边');
    /* ⑤ R = 0 时退化成 2D 图：节点数 = nS + 2，边数 = 2D 边数 */
    if (R === 0 && gr.V !== nS + 2) out.notes.push(type + ' R=0 未退化到 2D 图');
    out[type] = { V: gr.V, nS, space: nSpace, bnd: nBnd, time: nTime, e2d };
  }
  out.ok = out.notes.length === 0;
  return out;
}

/** 加权最短路（Dijkstra，节点数 ≤ 200：朴素 O(V²) 足够）；地面节点只记距离不展开 */
function scSpaceDij(gr, src, wS, wT){
  const D = new Float64Array(gr.V).fill(Infinity);
  const P = new Int32Array(gr.V).fill(-1);
  const done = new Uint8Array(gr.V);
  D[src] = 0;
  for (;;){
    let u = -1, best = Infinity;
    for (let v = 0; v < gr.V; v++) if (!done[v] && D[v] < best){ best = D[v]; u = v; }
    if (u < 0) break;
    done[u] = 1;
    if (gr.isGround[u]) continue;
    for (const ei of gr.adj[u]){
      const e = gr.edges[ei], v = e.a === u ? e.b : e.a;
      const w = e.kind === 'time' ? wT : wS;
      if (D[u] + w < D[v]){ D[v] = D[u] + w; P[v] = ei; }
    }
  }
  return { D, P };
}

const scSpacePathQ = (gr, par, v, stop) => {
  let m = 0n, cur = v, guard = 0;
  while (cur !== stop){
    const ei = par.P[cur];
    if (ei < 0) throw new Error('时空路径回溯失败');
    if (gr.edges[ei].q >= 0) m ^= 1n << BigInt(gr.edges[ei].q);
    cur = gr.edges[ei].a === cur ? gr.edges[ei].b : gr.edges[ei].a;
    if (++guard > 1e6) throw new Error('时空路径成环');
  }
  return m;
};

/** 时空匹配解码：DP（≤ dpMax）→ 贪心 + 2-opt。返回 {qubits, mode, cost, pairs} */
export function scSpaceDecode(gr, defects, wS, wT, dpMax = SC_PHEN.dpMax){
  const k = defects.length, G = gr.grounds;
  if (!k) return { qubits: 0n, mode: 'none', cost: 0, pairs: 0 };
  const dist = defects.map(d => scSpaceDij(gr, d, wS, wT));
  const dd = defects.map((_, i) => defects.map((_, j) => dist[i].D[defects[j]]));
  const dg = defects.map((_, i) => G.map(g => dist[i].D[g]));
  const near = i => { let b = 0; for (let j = 1; j < G.length; j++) if (dg[i][j] < dg[i][b]) b = j; return b; };
  let plan = null, mode = 'dp';
  if (k <= dpMax){
    const memo = new Map();
    const solve = mask => {
      if (mask === 0) return { cost: 0, plan: [] };
      const hit = memo.get(mask); if (hit !== undefined) return hit;
      const i = 31 - Math.clz32(mask & -mask);
      let best = null;
      for (let b = 0; b < G.length; b++){
        const c = dg[i][b];
        if (!Number.isFinite(c)) continue;
        const r = solve(mask & ~(1 << i));
        if (r && (best === null || c + r.cost < best.cost)) best = { cost: c + r.cost, plan: [[i, -1, b]].concat(r.plan) };
      }
      for (let j = i + 1; j < k; j++){
        if (!(mask & (1 << j))) continue;
        const c = dd[i][j];
        if (!Number.isFinite(c)) continue;
        const r = solve(mask & ~(1 << i) & ~(1 << j));
        if (r && (best === null || c + r.cost < best.cost)) best = { cost: c + r.cost, plan: [[i, j, -1]].concat(r.plan) };
      }
      memo.set(mask, best);
      return best;
    };
    const r = solve((1 << k) - 1);
    if (r) plan = r.plan;
  }
  if (!plan){
    mode = 'greedy';
    let rem = defects.map((_, i) => i);
    plan = [];
    while (rem.length){
      let bi = 0, bj = -1, bc = Infinity, bg = -1;
      for (let a = 0; a < rem.length; a++){
        for (let b = a + 1; b < rem.length; b++){
          const c = dd[rem[a]][rem[b]];
          if (c < bc){ bc = c; bi = a; bj = b; bg = -1; }
        }
        const g = near(rem[a]);
        if (dg[rem[a]][g] < bc){ bc = dg[rem[a]][g]; bi = a; bj = -1; bg = g; }
      }
      plan.push([rem[bi], bj >= 0 ? rem[bj] : -1, bj >= 0 ? -1 : bg]);
      rem = rem.filter((_, i) => i !== bi && i !== bj);
    }
    /* 2-opt：交叉互换 + 各自改接边界（与二维 matchPairs 兜底同一套动作） */
    const cost = e => e[1] >= 0 ? dd[e[0]][e[1]] : dg[e[0]][e[2]];
    for (let sweep = 0; sweep < 40; sweep++){
      let improved = false;
      for (let a = 0; a < plan.length; a++){
        for (let b = a + 1; b < plan.length; b++){
          const P = plan[a], Q = plan[b];
          if (P[1] < 0 || Q[1] < 0) continue;
          const old = cost(P) + cost(Q);
          /* 只做交叉互换：两条配对 (P,Q) 重连成 (P.a,Q.a)+(P.b,Q.b) 或 (P.a,Q.b)+(P.b,Q.a)。
             ⚠ 别再加「两条各自改接边界」这种动作——它会把 P.b / Q.b 直接丢掉，
             产生的「计划」少配了两个缺陷（代价看着更低，实际是非法修正）；
             单缺陷改接边界由下面那一趟单独处理。 */
          const cands = [
            [[P[0], Q[0], -1], [P[1], Q[1], -1]],
            [[P[0], Q[1], -1], [P[1], Q[0], -1]],
          ];
          for (const [n1, n2] of cands){
            if (n1[1] >= 0 && !Number.isFinite(dd[n1[0]][n1[1]])) continue;
            if (n2[1] >= 0 && !Number.isFinite(dd[n2[0]][n2[1]])) continue;
            if (cost(n1) + cost(n2) < old - 1e-12){ plan[a] = n1; plan[b] = n2; improved = true; break; }
          }
        }
      }
      for (let a = 0; a < plan.length; a++){
        const [x, y] = plan[a];
        if (y >= 0 && dg[x][near(x)] < dd[x][y]){ plan[a] = [x, -1, near(x)]; improved = true; }
      }
      if (!improved) break;
    }
  }
  let qubits = 0n, cost = 0;
  for (const [i, j, g] of plan){
    if (j >= 0){ qubits ^= scSpacePathQ(gr, dist[i], defects[j], defects[i]); cost += dd[i][j]; }
    else { qubits ^= scSpacePathQ(gr, dist[i], G[g], defects[i]); cost += dg[i][g]; }
  }
  return { qubits, mode, cost, pairs: plan.length };
}

/** 一层的独立数据错误（与 scTrial 同口径：noise='x' / 'depol'） */
function scErrLayer(code, noise, p, rng){
  let mx = 0n, mz = 0n;
  for (let q = 0; q < code.n; q++){
    const u = rng();
    if (noise === 'x'){
      if (u < p) mx |= 1n << BigInt(q);
    } else {
      const t = u * 3;
      if (t < p) mx |= 1n << BigInt(q);
      else if (t < 2 * p){ mx |= 1n << BigInt(q); mz |= 1n << BigInt(q); }
      else if (t < 3 * p) mz |= 1n << BigInt(q);
    }
  }
  return { mx, mz };
}

const scSynMask = (g, mask) => {
  let s = 0;
  g.stab.forEach((st, k) => { if ((pc(st.mask & mask)) & 1) s |= 1 << k; });
  return s;
};

/**
 * 单次带噪测量试验。cfg: { p, noise, q = p, rounds = d−1, dpMax }
 * 返回两帧的错误 / 修正 / 残余 / 每层缺陷（画布用）/ 回退标志。
 */
export function scSpaceTrial(code, cfg, rng, grs){
  const p = cfg.p, noise = cfg.noise === 'depol' ? 'depol' : 'x';
  const q = cfg.q === undefined ? p : cfg.q;
  const R = cfg.rounds === undefined ? Math.max(1, code.d - 1) : cfg.rounds;
  const L = R + 1, nS = code.zg.nS, nn = nS + 2;
  const wS = Math.log((1 - p) / p);
  const wT = q <= 0 ? Infinity : Math.log((1 - q) / q);
  const gX = grs && grs.X ? grs.X : scSpaceGraph(code, 'X', R);
  const gZ = grs && grs.Z ? grs.Z : scSpaceGraph(code, 'Z', R);
  const lay = [];
  for (let l = 0; l < L; l++) lay.push(scErrLayer(code, noise, p, rng));
  const out = {};
  let anyFail = 0, fb = 0;
  for (const type of ['X', 'Z']){
    const g = type === 'X' ? code.xg : code.zg;
    const dual = type === 'X' ? code.zl : code.xl;
    const gr = type === 'X' ? gX : gZ;
    const m = [0];
    for (let t = 1; t <= R; t++){
      let s = 0;
      for (let k = 0; k < nS; k++) if (rng() < q) s |= 1 << k;
      m[t] = s;
    }
    const defects = [], perLayer = [];
    const defMask = [];
    let tot = 0n;
    for (let l = 0; l < L; l++){
      const e = type === 'X' ? lay[l].mx : lay[l].mz;
      tot ^= e;
      let d = scSynMask(g, e);
      if (l + 1 <= R) d ^= m[l + 1];
      if (l >= 1) d ^= m[l];
      perLayer.push(d); defMask.push(d);
      for (let k = 0; k < nS; k++) if (d >> k & 1) defects.push(l * nn + k);
    }
    const dh = scSpaceDecode(gr, defects, wS, wT, cfg.dpMax);
    const residual = tot ^ dh.qubits;
    const cls = pc(residual & dual) & 1;
    out[type] = {
      cls, residual, corr: dh.qubits, k: defects.length, tot,
      mode: dh.mode, cost: dh.cost, perLayer, errLayer: lay.map(x => type === 'X' ? x.mx : x.mz),
      synAfter: scSynMask(g, residual),
    };
    if (dh.mode === 'greedy') fb = 1;
    if (cls) anyFail = 1;
  }
  return {
    fail: anyFail === 1, xfail: out.X.cls === 1, zfail: out.Z.cls === 1,
    kx: out.X.k, kz: out.Z.k,
    mx: lay.reduce((a, l) => a ^ l.mx, 0n), mz: lay.reduce((a, l) => a ^ l.mz, 0n),
    corrX: out.X.corr, corrZ: out.Z.corr, resX: out.X.residual, resZ: out.Z.residual,
    defX: out.X.perLayer, defZ: out.Z.perLayer,
    errX: out.X.errLayer, errZ: out.Z.errLayer,
    modeX: out.X.mode, modeZ: out.Z.mode,
    badSyn: (out.X.synAfter | out.Z.synAfter) !== 0,
    fallback: fb, R, rounds: R, q,
  };
}

/** 带噪测量集合：P_L / 两帧分解 / 平均时空缺陷 / 回退率 / 残余综合征自检 */
export function scSpaceEnsemble(code, cfg = {}){
  const c = { p: 0.02, noise: 'x', trials: 600, seed: 7, q: undefined, rounds: undefined, dpMax: SC_PHEN.dpMax, ...cfg };
  const R = c.rounds === undefined ? Math.max(1, code.d - 1) : c.rounds;
  const grs = { X: scSpaceGraph(code, 'X', R), Z: scSpaceGraph(code, 'Z', R) };
  const rng = mulberry32(c.seed);
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let fail = 0, xf = 0, zf = 0, bad = 0, ksum = 0, fbn = 0, lastTrial = null;
  for (let i = 0; i < c.trials; i++){
    const r = scSpaceTrial(code, c, rng, grs);
    lastTrial = r;
    if (r.fail) fail++;
    if (r.xfail) xf++;
    if (r.zfail) zf++;
    if (r.badSyn) bad++;
    if (r.modeX === 'greedy') fbn++;
    if (r.modeZ === 'greedy') fbn++;
    ksum += r.kx + r.kz;
  }
  const N = c.trials, PL = fail / N;
  return {
    d: code.d, p: c.p, noise: c.noise, q: c.q === undefined ? c.p : c.q, rounds: R, layers: R + 1, trials: N,
    PL, PLx: xf / N, PLz: zf / N, badSyn: bad / N, meanDefects: ksum / (2 * N), fallback: fbn / (2 * N), lastTrial,
    ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
    sigma: Math.sqrt(Math.max(PL * (1 - PL), 1e-12) / N),
  };
}

/** 流式带噪测量 MC：共享时空图并逐批推进，附最近试验用于画布回放。 */
export function scSpaceStream(code, cfg = {}){
  const c = { p: 0.02, noise: 'x', trials: 600, seed: 7, q: undefined, rounds: undefined, dpMax: SC_PHEN.dpMax, ...cfg };
  const R = c.rounds === undefined ? Math.max(1, code.d - 1) : c.rounds;
  const grs = { X: scSpaceGraph(code, 'X', R), Z: scSpaceGraph(code, 'Z', R) };
  const rng = mulberry32(c.seed);
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let fail = 0, xf = 0, zf = 0, bad = 0, ksum = 0, fbn = 0, n = 0, lastTrial = null;
  function one(){
    const r = scSpaceTrial(code, c, rng, grs);
    if (r.fail) fail++;
    if (r.xfail) xf++;
    if (r.zfail) zf++;
    if (r.badSyn) bad++;
    if (r.modeX === 'greedy') fbn++;
    if (r.modeZ === 'greedy') fbn++;
    ksum += r.kx + r.kz;
    lastTrial = r;
    n++;
  }
  return {
    get total(){ return Math.max(1, c.trials | 0); },
    get n(){ return n; },
    step(count){ for (let k = 0, m = Math.max(0, count | 0); k < m; k++) one(); },
    result(){
      const N = Math.max(1, n), PL = fail / N;
      return { d: code.d, p: c.p, noise: c.noise, q: c.q === undefined ? c.p : c.q,
        rounds: R, layers: R + 1, trials: n, PL, PLx: xf / N, PLz: zf / N,
        badSyn: bad / N, meanDefects: ksum / (2 * N), fallback: fbn / (2 * N),
        ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
        sigma: Math.sqrt(Math.max(PL * (1 - PL), 1e-12) / N), lastTrial };
    },
  };
}
