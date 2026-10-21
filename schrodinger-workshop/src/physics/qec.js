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
import { qcNewState, qcApply, qcMeasureQubit, mulberry32, qcQubitRho, qcRhoFidelity } from './qcircuit.js';

export const QEC_DEFAULTS = {
  code: 'bitflip',        /* bitflip | phaseflip */
  p: 0.05,
  /* 逻辑初态 Ry(θ)Rz(φ)|0⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩。
     默认取 **|+i⟩**（θ=π/2, φ=π/2）而不是 |+⟩：X_L|+⟩=|+⟩，逻辑 X 错误在 |+⟩ 上
     **完全不可观测**（首版用 |+⟩，双错试验的保真度仍是 1，P_L 恒为 0）。 */
  theta: Math.PI / 2, phase: Math.PI / 2,
  trials: 4000,
  seed: 7,
};

export const QEC_CODES = {
  bitflip: {
    label: '比特翻转码',
    err: 'x', fix: 'x', stab: 'z',
    text: '把 α|0⟩+β|1⟩ 编成 α|000⟩+β|111⟩，每个物理比特以概率 p 翻 **X**。稳定子 Z₀Z₁、Z₁Z₂ 的综合 (m₀m₁) 唯一确定翻的是哪一位（10→q0、11→q1、01→q2、00→无错），据此施加 X 即可。**单错必纠、双错必错**：两个比特翻时综合会指向「第三个比特」，修正把好比特也翻掉 ⟹ 逻辑错误。于是 P_L = 3p²(1−p)+p³ = 3p²−2p³，与未编码的 p 在 **p=1/2** 处交叉——编码只在 p<1/2 时有益。',
  },
  phaseflip: {
    label: '相位翻转码',
    err: 'z', fix: 'z', stab: 'x',
    text: '同一个码在 **H 基**下的对偶：错误换成 **Z**（相位翻转），稳定子换成 X₀X₁、X₁X₂（用 ancilla 做 H–CNOT–CNOT–H 后测量）。综合与修正的逻辑完全同构，P_L 也是 3p²−2p³。注意它**完全不管 X 错误**——单个 Z 错能纠，一个 X 错就直接毁掉相位信息。这就是为什么真正的通用纠错要把两个码串起来（Shor 9 比特码 = 3×3），本轮只做重复码这一层。',
  },
};

/* 错误位置数组 → 两个稳定子的本征值（0 = +1，1 = −1）
   Z₀Z₁ 对 |abc⟩ 的本征值 = (−1)^{a+b}；X₀X₁ 同理（在 H 基下同构）。 */
export function qecSyndromeOf(errors){
  const e = [0, 0, 0];
  for (const q of errors) if (q >= 0 && q < 3) e[q] ^= 1;
  return [e[0] ^ e[1], e[1] ^ e[2]];
}

/* 综合 → 应该修正哪个比特（−1 = 不动） */
export function qecFixFromSyndrome(syn){
  const k = syn[0] * 2 + syn[1];
  return k === 2 ? 0 : k === 3 ? 1 : k === 1 ? 2 : -1;
}

/* 逻辑错误判定：≥2 个物理比特翻 ⟹ 综合指向第三个 ⟹ 修完还剩一个错 */
export function qecIsLogicalError(errors){
  return errors.length >= 2;
}

/* 单次试验：真跑 5 比特态矢（3 数据 + 2 ancilla），返回全过程
   cfg: { code, p, theta }；rng: mulberry32 风格 */
export function qecTrial(cfg = {}, rng){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const spec = QEC_CODES[c.code] || QEC_CODES.bitflip;
  const s = qcNewState(5);
  const trace = [];

  /* ① 逻辑初态（同时把 ancilla 置 |0⟩ —— qcNewState 已经是） */
  qcApply(s, { op: 'ry', q: 0, theta: c.theta });
  qcApply(s, { op: 'rz', q: 0, theta: c.phase });
  trace.push({ step: 'prepare', gate: 'Ry(θ)Rz(φ)' });

  /* ② 编码 */
  qcApply(s, { op: 'cnot', c: 0, q2: 1 });
  qcApply(s, { op: 'cnot', c: 0, q2: 2 });
  trace.push({ step: 'encode', gate: 'CNOT×2' });

  /* phase-flip 码要把编码态转到 **H 基**（α|+++⟩+β|---⟩）——它的稳定子是 X₀X₁/X₁X₂，
     而 α|000⟩+β|111⟩ 不是 X 稳定子的本征态（首版漏了这三步 H，测出的综合恒为 01）。 */
  if (c.code === 'phaseflip'){
    for (let q = 0; q < 3; q++) qcApply(s, { op: 'h', q });
    trace.push({ step: 'basis', gate: 'H×3' });
  }

  /* ③ 噪声：逐数据比特独立以 p 施加错误 Pauli（forceErrors 供 pot78 穷举用） */
  const errors = [];
  if (c.forceErrors){
    for (const q of c.forceErrors){ qcApply(s, { op: spec.err, q }); errors.push(q); }
  } else {
    for (let q = 0; q < 3; q++){
      if (rng() < c.p){ qcApply(s, { op: spec.err, q }); errors.push(q); }
    }
  }
  trace.push({ step: 'noise', errors: errors.slice() });

  /* ④ 稳定子测量（ancilla 3 测 Z₀Z₁ 或 X₀X₁；4 测 Z₁Z₂ 或 X₁X₂） */
  const syn = [];
  for (const [qa, qb, anc] of [[0, 1, 3], [1, 2, 4]]){
    if (spec.stab === 'z'){
      qcApply(s, { op: 'cnot', c: qa, q2: anc });
      qcApply(s, { op: 'cnot', c: qb, q2: anc });
    } else {
      qcApply(s, { op: 'h', q: anc });
      qcApply(s, { op: 'cnot', c: anc, q2: qa });
      qcApply(s, { op: 'cnot', c: anc, q2: qb });
      qcApply(s, { op: 'h', q: anc });
    }
    syn.push(qcMeasureQubit(s, anc, rng));
  }
  trace.push({ step: 'syndrome', syn: syn.slice() });

  /* ⑤ 修正：按综合指向的比特施加同一 Pauli */
  const fixQ = qecFixFromSyndrome(syn);
  if (fixQ >= 0) qcApply(s, { op: spec.fix, q: fixQ });
  trace.push({ step: 'correct', q: fixQ });

  /* ⑥ 解码：phase-flip 先回计算基，再用编码的逆（CNOT 自逆，但**控制必须是 q0**） */
  if (c.code === 'phaseflip'){
    for (let q = 0; q < 3; q++) qcApply(s, { op: 'h', q });
    trace.push({ step: 'basis', gate: 'H×3' });
  }
  qcApply(s, { op: 'cnot', c: 0, q2: 1 });
  qcApply(s, { op: 'cnot', c: 0, q2: 2 });
  trace.push({ step: 'decode', gate: 'CNOT×2' });

  /* ⑦ 逻辑判定：q0 的部分迹 vs 目标纯态 |ψ0⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩。
     X_L / Z_L 都会让 F 掉到 0（只要 |ψ0⟩ 不是 |+⟩ 或 |0⟩ 这类退化态）。 */
  const th = c.theta / 2, ph = c.phase;
  const alpha = [Math.cos(th), 0];
  const beta = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)];
  const F = qcRhoFidelity(qcQubitRho(s, 0), alpha, beta);
  const logicalError = F < 0.5;
  const x0 = blochX(s, 0);
  /* 数据比特的最终比特串（|000⟩ + 正确的 q0 逻辑态 ⟹ q1,q2 应为 0） */
  const rho0 = qcQubitRho(s, 0);
  const p000 = rho0.re[0][0], p100 = rho0.re[1][1];
  return {
    errors, syn, fixQ, F, logicalError,
    ok: !logicalError,
    trace,
    /* 三比特振幅（|000⟩ 与 |111⟩ 的模方，解码后应分别在 |000⟩/|100⟩ 上） */
    p0: p000, p1: p100,
    state: s,
  };
}

function blochX(s, q){
  const D = s.dim, bit = 1 << q;
  let orr = 0;
  for (let i = 0; i < D; i++){
    if (i & bit) continue;
    const j = i | bit;
    orr += s.re[i] * s.re[j] + s.im[i] * s.im[j];
  }
  return 2 * orr;
}


/* 一批试验：P_L 与按「错误个数」的分解 */
export function qecEnsemble(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const rng = mulberry32(c.seed);
  const n = Math.max(1, c.trials | 0);
  let nL = 0;
  const byCount = [0, 0, 0, 0];          /* 0/1/2/3 个错 */
  const byCountL = [0, 0, 0, 0];         /* 其中判成逻辑错误的 */
  const synCount = [0, 0, 0, 0];         /* 四种综合的频次 */
  for (let k = 0; k < n; k++){
    const r = qecTrial(c, rng);
    const ec = r.errors.length;
    byCount[ec]++;
    if (r.logicalError){ nL++; byCountL[ec]++; }
    synCount[r.syn[0] * 2 + r.syn[1]]++;
  }
  return {
    p: c.p, code: c.code, trials: n, PL: nL / n,
    PLexact: qecLogicalRate(c.p), Pun: c.p,
    byCount, byCountL, synCount,
  };
}

/* 解析：P_L = 3p²(1−p) + p³ = 3p² − 2p³ */
export function qecLogicalRate(p){
  return 3 * p * p * (1 - p) + p * p * p;
}
/* 阈值：P_L(p) = p ⟹ p = 1/2（另一根 p=1 是退化解） */
export function qecThreshold(){ return 0.5; }

/* 扫描：对一组 p 各跑一批（页面曲线用；pot78 用大 trials） */
export function qecSweep(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const ps = c.ps || [0.002, 0.005, 0.01, 0.02, 0.04, 0.07, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5];
  const out = { p: [], PL: [], PLexact: [], Pun: [] };
  for (const p of ps){
    const e = qecEnsemble({ ...c, p });
    out.p.push(p); out.PL.push(e.PL);
    out.PLexact.push(e.PLexact); out.Pun.push(p);
  }
  return out;
}

/* 单比特错误的「教科书」对照：给定错误位置集合，综合与修正是否把它纠回。
   这是 pot78 A 组的穷举对象（3 种单错 + 1 种无错 + 3 种双错 + 1 种三错 = 8 种）。 */
export function qecSyndromeTable(){
  const rows = [];
  const all = [[], [0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]];
  for (const e of all){
    const syn = qecSyndromeOf(e);
    const fixQ = qecFixFromSyndrome(syn);
    /* 修正后的残余错误 = 原错误 XOR 修正位 */
    const res = e.slice();
    if (fixQ >= 0){
      const i = res.indexOf(fixQ);
      if (i >= 0) res.splice(i, 1); else res.push(fixQ);
    }
    rows.push({ errors: e, syn, fixQ, residual: res, ok: res.length === 0 });
  }
  return rows;
}
