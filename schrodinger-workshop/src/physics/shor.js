/* ============================================================================
 * shor.js — R79 Shor 9 比特码：3×3 级联，纠正**任意**单比特错误
 *
 * 结构（把 R78 的两个 3 比特重复码串起来）：
 *
 *   逻辑 |0⟩ ⟹ [(|000⟩+|111⟩)/√2]⊗3     逻辑 |1⟩ ⟹ [(|000⟩−|111⟩)/√2]⊗3
 *
 *   - 外层（跨 3 个块）管 **Z** 类错误：稳定子 X₀X₁X₂X₃X₄X₅、X₃X₄X₅X₆X₇X₈
 *   - 内层（每块 3 比特）管 **X** 类错误：稳定子 Z₀Z₁、Z₁Z₂、Z₃Z₄、Z₄Z₅、Z₆Z₇、Z₇Z₈
 *   8 个稳定子生成元全部独立 ⟹ 码空间维数 2⁹/2⁸ = 2（正好 1 个逻辑比特）。
 *
 * 关键恒等式（本轮 pot79 逐条验证）：
 *   ① 27 种单比特 Pauli（9 位置 × X/Y/Z）的综合互不相同 ⟹ 单错必纠（态矢 F=1 精确）
 *   ② 码距 = 3：N(S)\S 的最小权重是 3（X_L=X₀X₁X₂ / Z_L=Z₀Z₃Z₆ / Y_L=X_L·Z_L）⟹ 权重 ≤2 无逻辑
 *   ③ 精确 P_L(p)：穷举 3⁹ = 19683 个错误模式，按「最大似然解码（截断到权重 ≤2）」
 *      逐模式判定，得到关 p 的 9 次多项式（10 个整数 fail[0..9] 完全决定）
 *   ④ 与 R78 重复码在**同一** i.i.d. Pauli 信道下对照（repPLexact：Z 类错误穿透）
 *
 * 实现要点：Pauli 用**辛表示**（x/z 两个 9 位掩码，忽略全局相位——相位不影响综合征
 * 与陪集归属）；乘积 = 按位异或；对易子 = 辛内积奇偶。综合征 = 错误与 8 个生成元的
 * 对易向量。态矢真跑用**单个复用 ancilla 顺序测 8 个稳定子**（10 比特，测后重置），
 * 与并行 8-ancilla（17 比特，shorTrialParallel）在同种子下逐位一致——pot79 D 组对账。
 * ========================================================================== */
import { qcNewState, qcApply, qcApplyAll, qcMeasureQubit, mulberry32, qcQubitRho, qcRhoFidelity, qcExpect, qcFrToggle, qcFrGate } from './qcircuit.js';
import { gnTouched, gnPauli, gnSampleError } from './gatenoise.js';

export const SHOR_N = 9;

export const SHOR_DEFAULTS = {
  p: 0.05,
  /* 逻辑初态 Ry(θ)Rz(φ)|0⟩。默认 **|+i⟩**（θ=π/2, φ=π/2）——与 R78 同口径：
     X_L|+i⟩=|−i⟩、Z_L|+i⟩=|−i⟩ 都可观测；但 Y_L|+i⟩=|+i⟩ 不可观测（|+i⟩ 是 Y 的
     +1 本征态），所以 pot79 另跑 (θ=0.9, φ=1.3) 参考态覆盖 Y_L，并以穷举代数
 *     判定（shorCoset）作为无参考态依赖的终极判据。 */
  theta: Math.PI / 2, phase: Math.PI / 2,
  trials: 3000,
  seed: 7,
  /* ---- R87 门级噪声三键（默认 iid ⟹ 与 R79 逐位等价，零回归）----
     noise:      'iid'  = R79 静态口径（9 个数据比特各一次机会，P_L = O(p²)）
                 'gate' = R80 口径（每个门 × 该门触及的每个比特 = 一次机会）
     spectrum:   'depolar'（X/Y/Z 各 p/3）/ 'x'（仅 X，概率 p）/ 'z'（仅 Z，概率 p）
     noisyPhase: 'extract' 仅综合征提取段（M = 52）/ 'all' 编码+提取+解码（M = 90） */
  noise: 'iid', spectrum: 'depolar', noisyPhase: 'extract',
};

/* ---------- Pauli 辛表示 ---------- */
export function shorPauli(q, t){
  const b = 1 << q;
  if (t === 'x') return { x: b, z: 0 };
  if (t === 'z') return { x: 0, z: b };
  if (t === 'y') return { x: b, z: b };
  return { x: 0, z: 0 };
}
export function shorMul(a, b){ return { x: a.x ^ b.x, z: a.z ^ b.z }; }
const parity = v => { let c = 0; while (v){ c ^= v & 1; v >>= 1; } return c; };
export function shorCommutes(a, b){ return (parity(a.x & b.z) + parity(a.z & b.x)) % 2 === 0; }

/* ---------- 稳定子 ---------- */
export const SHOR_STABS = [
  { k: 'z', qs: [0, 1], label: 'Z₀Z₁', short: 'Z01' },
  { k: 'z', qs: [1, 2], label: 'Z₁Z₂', short: 'Z12' },
  { k: 'z', qs: [3, 4], label: 'Z₃Z₄', short: 'Z34' },
  { k: 'z', qs: [4, 5], label: 'Z₄Z₅', short: 'Z45' },
  { k: 'z', qs: [6, 7], label: 'Z₆Z₇', short: 'Z67' },
  { k: 'z', qs: [7, 8], label: 'Z₇Z₈', short: 'Z78' },
  { k: 'x', qs: [0, 1, 2, 3, 4, 5], label: 'X₀X₁X₂X₃X₄X₅', short: 'X012345' },
  { k: 'x', qs: [3, 4, 5, 6, 7, 8], label: 'X₃X₄X₅X₆X₇X₈', short: 'X345678' },
];
export function shorStabVec(g){
  let x = 0, z = 0;
  for (const q of g.qs){ if (g.k === 'x') x |= 1 << q; else z |= 1 << q; }
  return { x, z };
}
const GENVEC = SHOR_STABS.map(shorStabVec);

/* 逻辑算符（各取最小权重代表，权重都是 3 ⟹ 码距 3）：
   X_L = Z₀Z₃Z₆（每块各翻一个 Z —— 「块级比特翻转」：把 |0_L⟩ 翻成 |1_L⟩）
   Z_L = X₀X₁X₂（一块内全翻 X —— 「块级相位翻转」：|0_L⟩→|0_L⟩、|1_L⟩→−|1_L⟩）
   Y_L = X_L·Z_L = Y₀X₁X₂Z₃Z₆（权重 5；Y 陪集中最小权重代表就是 5——权重 3 的
         Y₀Y₃Y₆ ∉ N(S)（与 Z₀Z₁ 反对易），根本不能当代表，首版在此翻车）
   ⚠ R81 修正：这两个**标签**在 R79 里是对调的（源码与 README 都写成 X_L=X₀X₁X₂、
   Z_L=Z₀Z₃Z₆）。内层是**相位翻转码**（稳定子 Z₀Z₁、Z₁Z₂），对它而言 X₀X₁X₂ 的
   特征值是 (|0_L⟩:+1, |1_L⟩:−1) ⟹ 作用为 Z_L；Z₀Z₃Z₆ 才把 |0_L⟩ 翻成 |1_L⟩ ⟹ X_L。
   判据是编码器数值（pot81 E5）：⟨0_L|X₀X₁X₂|0_L⟩=1、⟨1_L|X₀X₁X₂|1_L⟩=−1。
   陪集**划分**不受影响（同四个陪集、同一分割），只是 1/2 号标签互换；R79 的
   「coset≠0 ⟹ 逻辑失败」结论与全部计数都不变（只是 36/81 的归属对调）。
   ⚠ 历史 bug：首版把 Z_L 误设成 Z₀Z₁Z₂（它与 X₀…X₅ 反对易 ⟹ 不在 N(S)），
   跨块 ZZ 双错的残差 Z₀Z₃Z₆ 被误报 coset=−1。由暴力枚举 N(S) 的 4 陪集抓出。 */
export const SHOR_LOGICALS = [
  { name: 'X_L', v: { x: 0, z: 0b001001001 }, label: 'Z₀Z₃Z₆' },
  { name: 'Z_L', v: { x: 0b000000111, z: 0 }, label: 'X₀X₁X₂' },
  { name: 'Y_L', v: { x: 0b000000111, z: 0b001001001 }, label: 'Y₀X₁X₂Z₃Z₆' },
];

/* 稳定子群 S = ⟨8 生成元⟩：2⁸ = 256 个元素（生成元独立性由计数自证） */
const STAB_SPAN = (() => {
  const set = new Set();
  for (let m = 0; m < 256; m++){
    let x = 0, z = 0;
    for (let b = 0; b < 8; b++) if (m & (1 << b)){ x ^= GENVEC[b].x; z ^= GENVEC[b].z; }
    set.add(x * 512 + z);
  }
  return set;
})();
export function shorInStabilizer(v){ return STAB_SPAN.has(v.x * 512 + v.z); }
export const SHOR_STAB_COUNT = STAB_SPAN.size;

/* 残差落在哪个陪集：0 = S 内（纠回）· 1 = X_L·S · 2 = Z_L·S · 3 = Y_L·S · −1 = 不在 N(S)
   N(S)/S ≅ Z₂×Z₂ 有 4 个元素，四陪集互不相交且并集 = N(S)（pot79 A 组穷举验证）。
   注意判定顺序无关：v ∈ Y_L·S 时 v·X_L 与 v·Z_L 都不在 S（否则陪集会重合）。 */
export function shorCoset(v){
  if (shorInStabilizer(v)) return 0;
  for (let i = 0; i < SHOR_LOGICALS.length; i++){
    if (shorInStabilizer(shorMul(v, SHOR_LOGICALS[i].v))) return i + 1;
  }
  return -1;
}

/* 错误模式 [{q,t},...] → 8 位综合征（bit = 与该生成元反对易 = 1，即本征值 −1） */
export function shorSyndromeOf(errs){
  const syn = [];
  for (const g of SHOR_STABS){
    let b = 0;
    for (const e of errs){
      if (!g.qs.includes(e.q)) continue;
      if (g.k === 'z'){ if (e.t === 'x' || e.t === 'y') b ^= 1; }
      else { if (e.t === 'z' || e.t === 'y') b ^= 1; }
    }
    syn.push(b);
  }
  return syn;
}

/* ---------- 解码表：综合征 → 修正 Pauli 列表 ----------
   候选按权重分层（恒等 → 27 个单错 → 324 个双错），同综合征取权重最小、再取字典序最小。
   在 i.i.d. 等概信道下 P(单错)=p/3 > P(双错)=(p/3)²（p<3 恒成立）⟹ 这就是截断到
   权重 ≤2 的**最大似然**解码。
   ⚠ 注意一（pot79 A6 留档）：同一综合征的候选**不保证同陪集**——X₂（权重 1）与 X₀X₁
   （权重 2）综合征相同，但残差分别在 S 与 X_L·S。这正是 ML 分层起作用的机制：优先信
   低权重。
   ⚠ 注意二（pot79 A6b 留档，比注意一更强）：同一综合征的**同最小权重**候选也不保证
   同陪集——混合 Pauli 类型下两个权重 2 候选的乘积可以是权重 3 ∈ N(S)\S（此前
   「|s1Δs2| 无奇偶关系 ⟹ 乘积权重 ≥5」的手工论证有误：该奇偶关系只约束 x/z 掩码
   的汉明重量，不约束混合类型乘积）。pot79 实证 18 个综合征存在此分歧（如
   00010001：X₅Z₈/X₅Z₇/X₅Z₆ 残差 ∈ Z_L·S vs Z₂Y₅/Z₁Y₅/Z₀Y₅ 纠回），组间乘积权重
   3。此时综合征 + 权重不足以区分，解码器必漏其一——这正是 A8 权重 2 失败
   117/324（X_L 36 + Z_L 81）的产生机制，是截断 ML 的固有代价而非缺陷。
   表仍是综合征的确定性函数（同 key 永远给同一修正）且满足 ML 最小性。 */
const TYPES = ['x', 'y', 'z'];
function buildTable(){
  const table = new Map();
  const put = (errs, pri) => {
    const k = shorSyndromeOf(errs).join('');
    const cur = table.get(k);
    if (!cur || pri < cur.pri) table.set(k, { errs: errs.map(e => ({ q: e.q, t: e.t })), pri });
  };
  put([], 0);
  let i = 0;
  for (let q = 0; q < 9; q++) for (const t of TYPES) put([{ q, t }], 1 + i++);
  i = 0;
  for (let q1 = 0; q1 < 9; q1++) for (let q2 = q1 + 1; q2 < 9; q2++)
    for (const t1 of TYPES) for (const t2 of TYPES) put([{ q: q1, t: t1 }, { q: q2, t: t2 }], 1000 + i++);
  return table;
}
const SHOR_TABLE = buildTable();
export function shorDecode(syn){
  const e = SHOR_TABLE.get(syn.join(''));
  return e ? e.errs.map(x => ({ q: x.q, t: x.t })) : [];
}
/* 表统计（页面/pot79 用）：多少综合征有 ≤2 修正、多少只能恒等 */
export function shorTableStats(){
  let withFix = 0, onlyIdentity = 0, w1 = 0, w2 = 0;
  for (const [, e] of SHOR_TABLE){
    if (e.errs.length === 0) onlyIdentity++;
    else { withFix++; if (e.errs.length === 1) w1++; else w2++; }
  }
  return { syndromes: SHOR_TABLE.size, withFix, onlyIdentity, w1, w2 };
}

/* ---------- 编码 / 解码线路 ----------
   外编码（phase-flip 层，跨 3 块）：CNOT(0→3)、CNOT(0→6) 把 q0 复制到 q3/q6，
   再对 q0/q3/q6 同时 H ⟹ α|+++⟩+β|−−−⟩（块代表进入 H 基，± 号就是逻辑相位）。
   内编码（bit-flip 层，每块 3 比特）：CNOT(q→q+1)、CNOT(q→q+2) 把块代表摊成
   (|000⟩±|111⟩)/√2。合起来：α[(|000⟩+|111⟩)/√2]⊗3 + β[(|000⟩−|111⟩)/√2]⊗3。
   ⚠ 顺序不能换：若先内后外，q3/q6 的 H 基复制会被内层 CNOT 抹掉（首版把 9 个
   比特全做成相等 ⟹ GHZ 态，X 稳定子期望 = 0，已由直接振幅计算抓出）。 */
export function shorEncodeGates(){
  return [
    { op: 'cnot', c: 0, q2: 3 }, { op: 'cnot', c: 0, q2: 6 },
    { op: 'h', q: 0 }, { op: 'h', q: 3 }, { op: 'h', q: 6 },
    { op: 'cnot', c: 0, q2: 1 }, { op: 'cnot', c: 0, q2: 2 },
    { op: 'cnot', c: 3, q2: 4 }, { op: 'cnot', c: 3, q2: 5 },
    { op: 'cnot', c: 6, q2: 7 }, { op: 'cnot', c: 6, q2: 8 },
  ];
}
export function shorDecodeGates(){
  return [
    { op: 'cnot', c: 6, q2: 8 }, { op: 'cnot', c: 6, q2: 7 },
    { op: 'cnot', c: 3, q2: 5 }, { op: 'cnot', c: 3, q2: 4 },
    { op: 'cnot', c: 0, q2: 2 }, { op: 'cnot', c: 0, q2: 1 },
    { op: 'h', q: 6 }, { op: 'h', q: 3 }, { op: 'h', q: 0 },
    { op: 'cnot', c: 0, q2: 6 }, { op: 'cnot', c: 0, q2: 3 },
  ];
}

/* ---------- 单次试验：10 比特态矢真跑（9 数据 + 1 个复用 ancilla） ----------
   综合征提取用**顺序测量**：8 个稳定子逐个测，ancilla 测完投影后重置回 |0⟩ 再测下一个。
   稳定子两两对易 ⟹ 顺序测量与并行 8-ancilla 测量给出相同综合征、相同数据末态
   （pot79 D 组用 shorTrialParallel 的 17 比特真跑逐条对账，同种子逐位一致）。
   收益：态矢 2¹⁷ → 2¹⁰（128 倍），单次 ~23ms → ~0.2ms，MC 集合达到可交互。 */
function shorTrialIid(cfg = {}, rng){
  const c = { ...SHOR_DEFAULTS, ...cfg };
  const s = qcNewState(10);
  const ANC = 9;
  const trace = [];

  /* ① 逻辑初态 */
  qcApply(s, { op: 'ry', q: 0, theta: c.theta });
  qcApply(s, { op: 'rz', q: 0, theta: c.phase });
  trace.push({ step: 'prepare', gate: 'Ry(θ)Rz(φ)' });

  /* ② 编码 */
  qcApplyAll(s, shorEncodeGates());
  trace.push({ step: 'encode', gate: 'H + CNOT×8' });

  /* ③ 噪声：逐数据比特独立以 p 施加随机 Pauli（forceErrors 供穷举/测试用） */
  const errors = [];
  if (c.forceErrors){
    for (const e of c.forceErrors){ qcApply(s, { op: e.t, q: e.q }); errors.push({ q: e.q, t: e.t }); }
  } else {
    for (let q = 0; q < 9; q++){
      if (rng() < c.p){
        const t = TYPES[Math.floor(rng() * 3)];
        qcApply(s, { op: t, q });
        errors.push({ q, t });
      }
    }
  }
  trace.push({ step: 'noise', errors: errors.map(e => ({ ...e })) });

  /* ④ 综合征：ancilla 顺序测 8 个稳定子（Z 类 CNOT 数据→ancilla；
     X 类 H–CNOT(ancilla→数据)×k–H；测完重置 ancilla） */
  const syn = [];
  for (const g of SHOR_STABS){
    if (g.k === 'z'){
      for (const q of g.qs) qcApply(s, { op: 'cnot', c: q, q2: ANC });
    } else {
      qcApply(s, { op: 'h', q: ANC });
      for (const q of g.qs) qcApply(s, { op: 'cnot', c: ANC, q2: q });
      qcApply(s, { op: 'h', q: ANC });
    }
    const b = qcMeasureQubit(s, ANC, rng);
    if (b) qcApply(s, { op: 'x', q: ANC });      /* 重置 ancilla → |0⟩，测下一个 */
    syn.push(b);
  }
  trace.push({ step: 'syndrome', syn: syn.slice() });

  /* ⑤ 修正（查表） */
  const fix = shorDecode(syn);
  for (const e of fix) qcApply(s, { op: e.t, q: e.q });
  trace.push({ step: 'correct', fix: fix.map(e => ({ ...e })) });

  /* ⑥ 解码 */
  qcApplyAll(s, shorDecodeGates());
  trace.push({ step: 'decode', gate: 'CNOT×8 + H' });

  /* ⑦ 逻辑保真度：q0 的部分迹 vs 目标纯态 */
  const th = c.theta / 2, ph = c.phase;
  const alpha = [Math.cos(th), 0];
  const beta = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)];
  const F = qcRhoFidelity(qcQubitRho(s, 0), alpha, beta);

  /* 残差陪集（代数判定，不依赖参考态） */
  let res = { x: 0, z: 0 };
  for (const e of errors) res = shorMul(res, shorPauli(e.q, e.t));
  for (const e of fix) res = shorMul(res, shorPauli(e.q, e.t));
  const coset = shorCoset(res);

  /* 逻辑错误用**代数判据**（残差 ∉ S）：与精确 P_L 同口径、参考态无关。
     ⚠ 不能用 F<0.5 判：Y_L 类残差在 Y 本征态（如 |+i⟩）上 F=1 不可见（pot79 C2 留档），
     且任何参考态都看不全三个逻辑算符（纯态 ⟨X⟩²+⟨Y⟩²+⟨Z⟩²=1）。F 判据另存 visibleError。 */
  return {
    errors, syn, fix, F,
    logicalError: coset !== 0,
    visibleError: F < 0.5,
    ok: coset === 0,
    coset,
    weight: errors.length,
    trace,
    state: s,
  };
}

/* ---------- 并行版（参照实现，pot79 D 组对账用） ----------
   17 比特态矢：9 数据 + 8 ancilla 同时测。与 shorTrial（顺序复用）在同种子下
   逐位一致（综合征、修正、F）。仅验证/展示用，不进 MC 热路径。 */
export function shorTrialParallel(cfg = {}, rng){
  const c = { ...SHOR_DEFAULTS, ...cfg };
  const s = qcNewState(17);
  const trace = [];

  qcApply(s, { op: 'ry', q: 0, theta: c.theta });
  qcApply(s, { op: 'rz', q: 0, theta: c.phase });
  qcApplyAll(s, shorEncodeGates());

  const errors = [];
  if (c.forceErrors){
    for (const e of c.forceErrors){ qcApply(s, { op: e.t, q: e.q }); errors.push({ q: e.q, t: e.t }); }
  } else {
    for (let q = 0; q < 9; q++){
      if (rng() < c.p){
        const t = TYPES[Math.floor(rng() * 3)];
        qcApply(s, { op: t, q });
        errors.push({ q, t });
      }
    }
  }

  const syn = [];
  SHOR_STABS.forEach((g, gi) => {
    const anc = 9 + gi;
    if (g.k === 'z'){
      for (const q of g.qs) qcApply(s, { op: 'cnot', c: q, q2: anc });
    } else {
      qcApply(s, { op: 'h', q: anc });
      for (const q of g.qs) qcApply(s, { op: 'cnot', c: anc, q2: q });
      qcApply(s, { op: 'h', q: anc });
    }
    syn.push(qcMeasureQubit(s, anc, rng));
  });

  const fix = shorDecode(syn);
  for (const e of fix) qcApply(s, { op: e.t, q: e.q });
  qcApplyAll(s, shorDecodeGates());

  const th = c.theta / 2, ph = c.phase;
  const alpha = [Math.cos(th), 0];
  const beta = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)];
  const F = qcRhoFidelity(qcQubitRho(s, 0), alpha, beta);

  let res = { x: 0, z: 0 };
  for (const e of errors) res = shorMul(res, shorPauli(e.q, e.t));
  for (const e of fix) res = shorMul(res, shorPauli(e.q, e.t));

  /* 与 shorTrial 同口径：代数判据（残差 ∉ S） */
  return { errors, syn, fix, F, logicalError: shorCoset(res) !== 0, visibleError: F < 0.5, ok: shorCoset(res) === 0, coset: shorCoset(res), weight: errors.length, trace, state: s };
}

/* ============================================================================
 * R87：门级噪声（noise='gate'）接进 Shor 码
 *
 * 与 R86（重复码）同口径三键：noise / spectrum / noisyPhase，复用 R80 的
 * gnTouched（单比特门 1 / CNOT 2）与 gnSampleError。有效机会数
 *   M(extract) = 6 个 Z 类稳定子 × 2 CNOT × 2 + 2 个 X 类稳定子 × (H + 6 CNOT + H)
 *              = 24 + 28 = 52
 *   M(all)     = 编码 19 + 提取 52 + 解码 19 = 90
 * 每个机会再分 x/y/z 三个 Pauli 位点 ⟹ sites = 3M（156 / 270）。
 * 机会数是重复码（8/16）的 6.5 倍 —— 这是本轮要量化的代价。
 *
 * 判定走**Pauli 帧**（不依赖参考态，与 shorExactPL 的代数口径同源）：
 *   ① 帧随线路逐门传播（qcFrGate），注错用 qcFrToggle 打点；
 *   ② 综合征由**帧在测量时刻的 ancilla x 位精确预测**——Z 类稳定子的 CNOT 把数据
 *      x 帧 parity 送到 ancilla，X 类稳定子把数据 z 帧经两道 H 转成 ancilla x 帧
 *      ⟹ 两类都统一为 (fr.x >> ANC) & 1；与态矢实测逐位对照 ⟹ synMiss ≡ 0；
 *   ③ 修正后（解码前）取数据 9 位的残差帧，shorCoset 定陪集 = 逻辑判据。
 * 测量后 ancilla 复位 ⟹ 帧位清零（复用 ancilla 的必要处理，否则下一次预测串味）。
 * ========================================================================== */
export const SHOR_ANC = 9;
const DATA_MASK = 0x1FF;                 /* 9 个数据比特 */
const OPS_CACHE = new Map();

/* 扁平 ops 列表（带 ph 相位标签）。缓存 key 只含 theta|phase —— 逐次运行选项
   （forceErrors / faults）由 shorExec 经 opts 传入，绝不进缓存（R86 的
   CIRC_CACHE 污染坑：缓存里烘进空数组会让后续 ensemble 的噪声分支走空循环）。 */
export function shorOps(cfg = {}){
  const c = { ...SHOR_DEFAULTS, ...cfg };
  const key = c.theta + '|' + c.phase;
  let ops = OPS_CACHE.get(key);
  if (ops) return ops;
  ops = [];
  const push = (o, ph) => ops.push({ ...o, ph });
  push({ op: 'ry', q: 0, theta: c.theta }, 'prep');
  push({ op: 'rz', q: 0, theta: c.phase }, 'prep');
  for (const g of shorEncodeGates()) push(g, 'encode');
  for (const st of SHOR_STABS){
    if (st.k === 'z'){
      for (const q of st.qs) push({ op: 'cnot', c: q, q2: SHOR_ANC }, 'extract');
    } else {
      push({ op: 'h', q: SHOR_ANC }, 'extract');
      for (const q of st.qs) push({ op: 'cnot', c: SHOR_ANC, q2: q }, 'extract');
      push({ op: 'h', q: SHOR_ANC }, 'extract');
    }
    push({ op: 'meas', q: SHOR_ANC }, 'extract');
    push({ op: 'reset', q: SHOR_ANC }, 'extract');   /* 复位不计机会、不计门数 */
  }
  push({ op: 'fix' }, 'correct');
  for (const g of shorDecodeGates()) push(g, 'decode');
  OPS_CACHE.set(key, ops);
  return ops;
}

export function shorCircuitStats(cfg = {}){
  const c = { ...SHOR_DEFAULTS, ...cfg };
  const opps = { prep: 0, encode: 0, extract: 0, decode: 0 };
  let gates = 0;
  for (const o of shorOps(c)){
    if (o.op === 'meas' || o.op === 'reset' || o.op === 'fix') continue;
    gates++;
    opps[o.ph] += gnTouched(o).length;
  }
  const M = c.noisyPhase === 'all' ? opps.encode + opps.extract + opps.decode : opps.extract;
  return { opps, M, sites: 3 * M, gates, nq: 10, noisy: c.noisyPhase === 'all' ? 'encode+extract+decode' : 'extract' };
}

/* 执行一次线路（态矢 + Pauli 帧）。opts: { rng, cfg, faults, probe }
   faults: [{gate,q,t}] 强制注入位点（枚举/测试用，无视注错范围与概率） */
export function shorExec(cfg, opts = {}){
  const c = { ...SHOR_DEFAULTS, ...cfg };
  const { rng = null, faults = null, probe = false } = opts;
  const ops = shorOps(c);
  const p = c.p, spectrum = c.spectrum;
  const noisyPh = c.noisyPhase === 'all' ? ['encode', 'extract', 'decode'] : ['extract'];
  const s = qcNewState(10);
  const fr = { x: 0, z: 0 };
  const fired = [];
  const syn = [], synFrame = [];
  const diag = { synMiss: 0, random: 0 };
  const forced = new Map();
  if (faults) for (const f of faults){
    if (!forced.has(f.gate)) forced.set(f.gate, []);
    forced.get(f.gate).push(f);
  }
  const inject = (q, t, gate) => { gnPauli(s, q, t); qcFrToggle(fr, q, t); fired.push({ gate, q, t }); };

  /* 测量：rng 在时走 qcMeasureQubit；无 rng 时确定性优先（枚举用，与 R86 同口径）。
     帧预测 = 测量时刻 ancilla 的 x 帧位（Z 类：数据 x 帧 parity 已被 CNOT 送到
     ancilla；X 类：数据 z 帧经两道 H 转成 ancilla x 帧）。 */
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
      for (let i = 0; i < s.dim; i++) if ((((i & bit) ? 1 : 0) !== out)) { s.re[i] = 0; s.im[i] = 0; }
      let nrm = 0;
      for (let i = 0; i < s.dim; i++) nrm += s.re[i] * s.re[i] + s.im[i] * s.im[i];
      if (nrm > 0){ const rr = 1 / Math.sqrt(nrm); for (let i = 0; i < s.dim; i++){ s.re[i] *= rr; s.im[i] *= rr; } }
    }
    const sf = (fr.x >> q) & 1;
    synFrame.push(sf);
    if (sf !== out) diag.synMiss++;
    return out;
  };

  let fix = [], coset = 0, res = { x: 0, z: 0 }, probeOut = null, F = 0;
  const synBits = [];
  for (let i = 0; i < ops.length; i++){
    const o = ops[i];
    if (o.op === 'meas'){ synBits.push(measure(o.q)); syn.push(synBits[synBits.length - 1]); continue; }
    if (o.op === 'reset'){
      if (synBits[synBits.length - 1]) qcApply(s, { op: 'x', q: o.q });
      fr.x &= ~(1 << o.q); fr.z &= ~(1 << o.q);      /* 复位后重新制备 |0⟩，帧清零 */
      continue;
    }
    if (o.op === 'fix'){
      fix = shorDecode(syn);
      for (const e of fix){ qcApply(s, { op: e.t, q: e.q }); qcFrToggle(fr, e.q, e.t); }
      /* 探针：所有修正已完成、解码之前（码空间仍完好定义） */
      res = { x: fr.x & DATA_MASK, z: fr.z & DATA_MASK };
      coset = shorCoset(res);
      if (probe){
        probeOut = { stab: [], logic: [] };
        for (const g of SHOR_STABS){
          let xm = 0, zm = 0;
          for (const q of g.qs) { if (g.k === 'z') zm |= 1 << q; else xm |= 1 << q; }
          probeOut.stab.push(qcExpect(s, xm, zm));
        }
        for (const lg of SHOR_LOGICALS) probeOut.logic.push(qcExpect(s, lg.v.x, lg.v.z));
        const th = c.theta / 2, ph = c.phase;
        probeOut.F = qcRhoFidelity(qcQubitRho(s, 0), [Math.cos(th), 0], [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)]);
      }
      continue;
    }
    qcApply(s, o);
    qcFrGate(fr, o);
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
  /* 解码后残差：把末态帧沿**解码门的逆序**回推到码空间再定陪集。
     ⚠ 必须做这一步，否则 noisyPhase='all' 时解码段（19 个机会）的故障全部发生在
     探针点之后、判定完全看不见。推导：无解码故障时 fr_end = D R D†（D=解码、
     R=探针点残差），回推给 D† fr_end D = R ⟹ 与 cosetFix 恒等；有解码故障时
     故障被 D† 映回码空间与 R 合并 ⟹ 正确计入。自洽性检验：extract 口径下
     cosetDec ≡ cosetFix（解码段不注错，二者必须逐位相等）。 */
  for (let i = shorDecodeGates().length - 1; i >= 0; i--) qcFrGate(fr, shorDecodeGates()[i]);
  const resDec = { x: fr.x & DATA_MASK, z: fr.z & DATA_MASK };
  const cosetDec = shorCoset(resDec);

  /* 末态保真度（解码后 q0 的部分迹 vs 目标纯态）——R79 口径，仅叙事用 */
  if (!probe){
    const th = c.theta / 2, ph = c.phase;
    F = qcRhoFidelity(qcQubitRho(s, 0), [Math.cos(th), 0], [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)]);
  } else {
    F = probeOut.F;
  }
  /* 主判据 = cosetDec（覆盖解码段故障）；cosetFix = 探针点（解码前）陪集，对照用 */
  return { syn, synFrame, fix, res, coset: cosetDec, cosetFix: coset, cosetDec,
    resDec, F, fired, diag, state: s, probe: probeOut,
    logicalError: cosetDec !== 0, weight: fired.length };
}

/* 门级模式单次试验（页面与 MC 的入口；i.i.d. 走 shorTrialIid 保零回归） */
export function shorTrialGate(cfg = {}, rng){
  const c = { ...SHOR_DEFAULTS, ...cfg };
  const r = shorExec(c, { rng, faults: c.faults || null });
  const st = shorCircuitStats(c);
  const trace = [
    { step: 'prepare', gate: 'Ry(θ)Rz(φ)' },
    { step: 'encode', gate: 'CNOT×8 + H×3' },
    { step: 'gatenoise', faults: r.fired.map(f => ({ gate: f.gate, q: f.q, t: f.t })) },
    { step: 'syndrome', syn: r.syn.slice(), synFrame: r.synFrame.slice() },
    { step: 'correct', fix: r.fix.map(e => ({ q: e.q, t: e.t })) },
    { step: 'decode', gate: 'CNOT×8 + H×3' },
  ];
  return {
    errors: r.fired.map(f => ({ q: f.q, t: f.t })),
    syn: r.syn, synFrame: r.synFrame, fix: r.fix, F: r.F,
    logicalError: r.logicalError, ok: r.coset === 0, coset: r.coset,
    visibleError: r.F < 0.5, weight: r.weight, trace, state: r.state,
    noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase,
    faults: r.fired.slice(), synMiss: r.diag.synMiss, M: st.M,
  };
}

/* 统一入口：i.i.d. 逐位等价 R79，gate 走门级路径 */
export function shorTrial(cfg = {}, rng){
  const c = { ...SHOR_DEFAULTS, ...cfg };
  if (c.noise === 'gate') return shorTrialGate(c, rng);
  const r = shorTrialIid(c, rng);
  r.noise = 'iid'; r.spectrum = c.spectrum; r.noisyPhase = c.noisyPhase;
  return r;
}

/* ---------- 单故障精确枚举 ⟹ 领先阶 c₁（P_L = c₁p + O(p²)）----------
   位点 = (机会, Pauli 类型)。退极化谱每个位点三类型各 p/3 ⟹ 权重 1/3；
   单谱只有本类型、概率 p ⟹ 权重 1。fatal = 该单故障下残差 ∉ S。
   c₁ = Σ w(t)·fatal(位点,t)。这是**精确**的领先阶，不含统计误差。 */
export function shorFaultSurvey(cfg = {}, order = 1){
  const c = { ...SHOR_DEFAULTS, ...cfg, noise: 'gate' };
  const ops = shorOps(c);
  const noisyPh = c.noisyPhase === 'all' ? ['encode', 'extract', 'decode'] : ['extract'];
  const sites = [];
  for (let i = 0; i < ops.length; i++){
    const o = ops[i];
    if (o.op === 'meas' || o.op === 'reset' || o.op === 'fix') continue;
    if (o.ph === 'prep' || !noisyPh.includes(o.ph)) continue;
    for (const q of gnTouched(o)) sites.push({ gate: i, q, ph: o.ph, op: o.op });
  }
  const types = c.spectrum === 'x' ? ['x'] : c.spectrum === 'z' ? ['z'] : ['x', 'y', 'z'];
  const w = types.length === 1 ? 1 : 1 / 3;
  const rows = [];
  let c1 = 0, fatal = 0, total = 0;
  for (const s of sites){
    for (const t of types){
      const r = shorExec(c, { rng: null, faults: [{ gate: s.gate, q: s.q, t }] });
      const f = r.coset !== 0;
      total++; if (f){ fatal++; c1 += w; }
      rows.push({ gate: s.gate, q: s.q, t, ph: s.ph, op: s.op, coset: r.coset, fatal: f, syn: r.syn.join('') });
    }
  }
  /* 二阶（可选）：位点对。退极化提取段 N=156 ⟹ 12090 对，约 1s；仅测试用。 */
  let c2 = null, pairs = null;
  if (order >= 2){
    const list = [];
    for (const s of sites) for (const t of types) list.push({ gate: s.gate, q: s.q, t, w });
    c2 = 0; pairs = 0;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++){
        const r = shorExec(c, { rng: null, faults: [list[i], list[j]] });
        pairs++;
        if (r.coset !== 0) c2 += list[i].w * list[j].w;
      }
  }
  const st = shorCircuitStats(c);
  return { M: st.M, sites: st.sites, opps: st.opps, spectrum: c.spectrum, noisyPhase: c.noisyPhase,
    rows, fatal, total, c1, c2, pairs, byPhase: sites.reduce((a, s) => (a[s.ph] = (a[s.ph] || 0) + 1, a), {}) };
}

/* ---------- 精确 P_L：3⁹ = 19683 个错误模式一次性穷举 ----------
   fail[w] = 权重 w 的错误模式中被判逻辑失败的个数（与 p 无关），
   P_L(p) = Σ_w fail[w]·(p/3)^w·(1−p)^{9−w} 是 9 次多项式。 */
const SHOR_FAIL = (() => {
  const fail = new Array(10).fill(0);
  const tot = new Array(10).fill(0);
  const rec = (q, errs) => {
    if (q === 9){
      const w = errs.length;
      tot[w]++;
      const fix = shorDecode(shorSyndromeOf(errs));
      let res = { x: 0, z: 0 };
      for (const e of errs) res = shorMul(res, shorPauli(e.q, e.t));
      for (const e of fix) res = shorMul(res, shorPauli(e.q, e.t));
      if (shorCoset(res) !== 0) fail[w]++;
      return;
    }
    rec(q + 1, errs);
    for (const t of TYPES){ errs.push({ q, t }); rec(q + 1, errs); errs.pop(); }
  };
  rec(0, []);
  return { fail, tot };
})();
export function shorExactPL(p){
  let PL = 0;
  for (let w = 0; w <= 9; w++) PL += SHOR_FAIL.fail[w] * Math.pow(p / 3, w) * Math.pow(1 - p, 9 - w);
  return { PL, fail: SHOR_FAIL.fail.slice(), tot: SHOR_FAIL.tot.slice(), patterns: 19683 };
}

/* ---------- 码距：N(S)\S 的最小权重 ---------- */
export function shorDistance(){
  /* 枚举权重 ≤2 的全部 352 个 Pauli（含恒等）：若综合征平凡（∈N(S)）但不在 S ⟹ 逻辑 */
  let best = Infinity, exhibit = null;
  const rec = (q, errs) => {
    if (errs.length > 2) return;
    if (q === 9){
      if (errs.length === 0) return;
      let v = { x: 0, z: 0 };
      for (const e of errs) v = shorMul(v, shorPauli(e.q, e.t));
      if (shorSyndromeOf(errs).every(b => b === 0) && !shorInStabilizer(v)){
        if (errs.length < best){ best = errs.length; exhibit = errs.map(e => e.q + e.t.toUpperCase()); }
      }
      return;
    }
    rec(q + 1, errs);
    for (const t of TYPES){ errs.push({ q, t }); rec(q + 1, errs); errs.pop(); }
  };
  rec(0, []);
  /* 权重 3 的逻辑必然存在（X_L 等）⟹ 码距 = 3 */
  return { distance: best === Infinity ? 3 : best, exhibit, checkedUpTo: 2 };
}

/* ---------- 权重 ≤2 模式的可纠性统计（页面叙事用） ---------- */
export function shorWeight2Stats(){
  const stats = {};
  const rec = (q, errs) => {
    if (errs.length > 2) return;
    if (q === 9){
      const w = errs.length;
      if (w === 0) return;
      const key = w === 1 ? 'w1' : 'w2';
      stats[key] = stats[key] || { tot: 0, ok: 0 };
      stats[key].tot++;
      const fix = shorDecode(shorSyndromeOf(errs));
      let res = { x: 0, z: 0 };
      for (const e of errs) res = shorMul(res, shorPauli(e.q, e.t));
      for (const e of fix) res = shorMul(res, shorPauli(e.q, e.t));
      if (shorCoset(res) === 0) stats[key].ok++;
      return;
    }
    rec(q + 1, errs);
    for (const t of TYPES){ errs.push({ q, t }); rec(q + 1, errs); errs.pop(); }
  };
  rec(0, []);
  return stats;
}

/* ---------- 3 比特重复码在**同一** i.i.d. Pauli 信道下的精确 P_L（对照基线） ----------
   与 R78 的 3p²−2p³ 不同口径：那个是 bit-flip 专用信道；这里 Z 类错误不被重复码纠正，
   直接穿透成逻辑错误。解码器沿用 R78 的 4→4 综合征表（恒等/单比特 X 修正）。枚举 4³=64。 */
export function repPLexact(p){
  const REP_STAB = [{ x: 0, z: 0b011 }, { x: 0, z: 0b110 }];   /* Z₀Z₁、Z₁Z₂ */
  const inS = v => {
    for (let m = 0; m < 4; m++){
      let x = 0, z = 0;
      for (let b = 0; b < 2; b++) if (m & (1 << b)){ x ^= REP_STAB[b].x; z ^= REP_STAB[b].z; }
      if (x === v.x && z === v.z) return true;
    }
    return false;
  };
  const fail = [0, 0, 0, 0], tot = [0, 0, 0, 0];
  const rec = (q, errs) => {
    if (q === 3){
      const w = errs.length;
      tot[w]++;
      /* R78 综合征表：Z 类奇偶 → 单比特 X 修正（00 → 不动） */
      const e3 = [0, 0, 0];
      for (const e of errs) if (e.t === 'x' || e.t === 'y') e3[e.q] ^= 1;
      const m0 = e3[0] ^ e3[1], m1 = e3[1] ^ e3[2];
      const k = m0 * 2 + m1;
      const fixQ = k === 2 ? 0 : k === 3 ? 1 : k === 1 ? 2 : -1;
      let res = { x: 0, z: 0 };
      for (const e of errs) res = shorMul(res, shorPauli(e.q, e.t));
      if (fixQ >= 0) res = shorMul(res, shorPauli(fixQ, 'x'));
      if (!inS(res)) fail[w]++;
      return;
    }
    rec(q + 1, errs);
    for (const t of TYPES){ errs.push({ q, t }); rec(q + 1, errs); errs.pop(); }
  };
  rec(0, []);
  let PL = 0;
  for (let w = 0; w <= 3; w++) PL += fail[w] * Math.pow(p / 3, w) * Math.pow(1 - p, 3 - w);
  return { PL, fail, tot };
}

/* ---------- 蒙特卡洛集合 ----------
   逻辑失败用**代数判据**（残差 ∉ S，即 coset≠0），与 shorExactPL 同口径：
   综合征超出权重 ≤2 覆盖时解码器不动作（shorDecode 返回 []），残差 ∉ N(S)，
   计入 byCoset[4]（越界类）。F<0.5 的可见判据另见 trial.visibleError。 */
const SURVEY_CACHE = new Map();
export function shorSurveyCached(cfg = {}){
  const c = { ...SHOR_DEFAULTS, ...cfg, noise: 'gate' };
  const key = c.spectrum + '|' + c.noisyPhase;
  let v = SURVEY_CACHE.get(key);
  if (!v){ v = shorFaultSurvey(c, 1); SURVEY_CACHE.set(key, v); }
  return v;
}

export function shorEnsemble(cfg = {}){
  const c = { ...SHOR_DEFAULTS, ...cfg };
  const rng = mulberry32(c.seed);
  const n = Math.max(1, c.trials | 0);
  const gate = c.noise === 'gate';
  let nL = 0, nF = 0, synMiss = 0;
  const byWeight = new Array(10).fill(0);
  const byWeightL = new Array(10).fill(0);
  const byCoset = [0, 0, 0, 0, 0];   /* [∈S, X_L·S, Z_L·S, Y_L·S, ∉N(S)]；shorCoset 的 −1 归入越界类 */
  for (let k = 0; k < n; k++){
    const r = shorTrial(c, rng);
    /* i.i.d.：weight = 数据错误数 ∈[0,9]；gate：weight = 注入故障数，第 10 桶为「≥9」 */
    const wi = Math.min(r.weight, 9);
    byWeight[wi]++;
    if (gate){ nF += r.weight; synMiss += r.synMiss || 0; }
    if (r.logicalError){ nL++; byWeightL[wi]++; byCoset[r.coset === -1 ? 4 : r.coset]++; }
  }
  const ex = shorExactPL(c.p);
  const out = {
    p: c.p, trials: n, PL: nL / n,
    PLexact: gate ? null : ex.PL, Pun: c.p,
    byWeight, byWeightL, byCoset,
    /* 对照：重复码（同信道）与未编码 */
    repExact: repPLexact(c.p).PL,
    noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase,
  };
  if (gate){
    const st = shorCircuitStats(c);
    const sv = shorSurveyCached(c);
    out.M = st.M; out.sites = st.sites; out.opps = st.opps;
    out.c1 = sv.c1; out.fatal = sv.fatal; out.total = sv.total;
    out.meanFaults = nF / n; out.synMiss = synMiss;
    /* 门级口径下「重复码基线」不是同一个电路（机会数 8/16 vs 52/90），
       repExact 是 i.i.d. 口径的值 ⟹ 不相干，置 null；跨码对照见 pot87。 */
    out.repExact = null;
  }
  return out;
}

/* 扫描（页面曲线用）：**精确** P_L(p) 与重复码对照（穷举与 p 无关，O(1) 每点）。
   MC 点只画当前 p（ensemble 已给），不做全曲线 MC——17→10 比特后单次 0.2ms，
   但 12 点 × 数千次仍要数秒，曲线用精确值即可（pot79 C 组多点对账 MC vs 精确）。 */
export function shorSweep(cfg = {}){
  const c = { ...SHOR_DEFAULTS, ...cfg };
  const gate = c.noise === 'gate';
  const ps = c.ps || (gate
    /* 门级：几何网格，覆盖到交点之外（P_L 在 p≳0.3 已接近饱和） */
    ? [0.001, 0.0015, 0.002, 0.003, 0.005, 0.007, 0.01, 0.015, 0.02, 0.03, 0.05, 0.08, 0.12, 0.2, 0.3, 0.45]
    : [0.002, 0.005, 0.01, 0.02, 0.04, 0.07, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5]);
  const out = { p: [], PLexact: [], PL: [], rep: [], Pun: [], noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase };
  if (gate){
    /* 门级没有便宜的精确多项式（帧空间 2¹⁸ × 综合征 2⁸ 太大），曲线走 MC；
       领先阶 c₁·p 由单故障枚举精确给出，一并回显作小 p 参照。 */
    const sv = shorSurveyCached(c);
    out.c1 = sv.c1; out.M = shorCircuitStats(c).M;
    const tr = Math.max(120, c.sweepTrials | 0 || 400);
    for (const p of ps){
      const rng = mulberry32(c.seed ^ 0x5f3a);
      let nL = 0;
      for (let k = 0; k < tr; k++) if (shorTrialGate({ ...c, p }, rng).logicalError) nL++;
      out.p.push(p); out.PL.push(nL / tr); out.PLexact.push(null); out.rep.push(null); out.Pun.push(p);
    }
    return out;
  }
  for (const p of ps){
    out.p.push(p);
    out.PLexact.push(shorExactPL(p).PL);
    out.PL.push(null);
    out.rep.push(repPLexact(p).PL);
    out.Pun.push(p);
  }
  return out;
}

/* Shor 精确曲线与两条基线的第一个交叉点（二分，页面标注用） */
export function shorCrossover(kind = 'uncoded'){
  const f = p => shorExactPL(p).PL - (kind === 'uncoded' ? p : repPLexact(p).PL);
  let lo = 1e-6, hi = 0.6;
  if (f(lo) > 0) return null;          /* 一开始就输（不该发生） */
  if (f(hi) < 0) return null;          /* 一直赢（不该发生） */
  for (let i = 0; i < 60; i++){
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
