/* ============================================================================
 * qcnoise.js — R104 线路页 Markov 门噪声（T₁/T₂）：精确密度矩阵通道
 *
 * 背景：qcircuit 线路页（physics/qcircuit.js）此前是**纯酉**模拟器——态矢
 * |ψ⟩ 依次过门、末尾才测量。真实器件上每个门都伴随退相干：与环境的耦合把
 * 纯态变成混合态，必须用密度矩阵 ρ（2^n × 2^n、厄米、半正定、tr=1）。
 * noise.html 已有一套时间口径的 Kraus 通道（挂在 t 上）；gatenoise.html 有
 * 门级 Pauli 噪声（挂在门上，但只报保真度）。本模块补上第三块：
 * **门级 T₁/T₂ 接进线路编辑器**——每个门作用后，对该门触及的每个比特施加
 *   振幅阻尼   γ = 1−e^{−t_g/T₁}   （能量弛豫：|1⟩→|0⟩，横向也衰减）
 *   相位阻尼   λ = 1−e^{−t_g/T₂}   （纯退相位：只压跨该位的相干）
 * 两条都是 noise.js 同款 Kraus（单源口径），精确解——不是一阶近似。
 * 自然满足 T₂ ≤ 2T₁：即使 λ=0，T₁ 本身也把横向衰减压到 1/(2T₁)。
 *
 * 实现要点（全部经 pot104 数值验证）：
 *   ① U ρ U† 的**两趟公式**（免稠密矩阵乘，每门 O(4^n)）：
 *      右乘 U†：对 controls=mask 的 target 列对 (j0,j1)，
 *        new[j0] = conj(m00)·c0 + conj(m01)·c1
 *        new[j1] = conj(m10)·c0 + conj(m11)·c1
 *      左乘 U ：对 controls=mask 的 target 行对 (i0,i1)，
 *        new[i0][:] = m00·r0 + m01·r1 ；new[i1][:] = m10·r0 + m11·r1
 *      （推导：U 是「target 上 2×2 块 m、controls=mask 才生效、其余恒等」的
 *        直和型算符 ⟹ 每个矩阵元只连接 target 对中的两个指数。X 门在
 *        1 比特上手推验证：XρX = [[d,c],[b,a]] ✓）
 *   ② SWAP 不保持 target 对结构 ⟹ 按位置换重排索引（O(4^n) 查表，不动浮点）。
 *   ③ 两个阻尼通道都是**就地对角缩放**（Kraus 和可写成块对角因子）：
 *      振幅阻尼：|0⟩|0⟩ 块 += γ·|1⟩|1⟩ 块；跨位 ×√(1−γ)；|1⟩|1⟩ 块 ×(1−γ)
 *      相位阻尼：b_i≠b_j 的矩阵元 ×(1−λ)，对角不变
 *   ④ 测量 = Born 规则 p(j)=ρ_jj + 子空间投影（保留同结果子空间内的相干，
 *      不是只留对角——这是「测一个比特」与「读 diagonal」的区别）；
 *      X/Y/Bell/GHZ 基走 R100/R103 同款「旋转-测量-旋回」。
 *   ⑤ **零回归契约**：noise=null（γ=λ=0）时逐位复现态矢路径（pot104 A 节
 *      全预设 + 随机线路对账）；页面默认关闭噪声，走原 qcExec 路径。
 *
 * 复杂度：单门 O(4^n)（两趟各扫半矩阵）；n=8 时 256² = 65k 复操作/门，毫秒级。
 * R105 增补第三通道：退极化 ρ→(1−p)ρ+(p/3)ΣPρP（Bloch 各向同性缩放 λ=1−4p/3），
 *   与 R77/R80 同口径 ⟹ 线路页可直接演示 **ESD（纠缠猝死）**：Bell 在双侧退极化
 *   k 步后 C = max(0, (3λ^{2k}−1)/2) 在**有限 k** 精确归零（T₁/T₂ 只是渐近衰减，
 *   γ<1 时 C 恒 >0）——这是退极化独有的签名。
 * 诚实限制：① **测量无读出误差**（理想投影）；② 无非马尔可夫记忆、无串扰、无
 *   泄漏/热激发（T₁ 只写 |1⟩→|0⟩）；③ 经典前馈 cond 的门噪声语义 = 内部门真实
 *   执行才衰减（未触发不衰减）。
 * ========================================================================== */
import { QC_UNARY, qcRotation, mulberry32, jacobiReal, QC_JOINT_PREP, qcJointK } from './qcircuit.js';

/* ---------- 门矩阵（与 qcApply 同一套展开；mask = 控制位掩码，0 = 无控） ---------- */
const QCN_C0 = { re: 0, im: 0 }, QCN_C1 = { re: 1, im: 0 };
function qcnGateMatrix(g){
  const op = g.op;
  if (op === 'cnot') return { m: QC_UNARY.x.m, q: g.t ?? g.q2, mask: 1 << (g.c ?? g.q1) };
  if (op === 'cz') return { m: QC_UNARY.z.m, q: g.t ?? g.q2, mask: 1 << (g.c ?? g.q1) };
  if (op === 'toffoli') return { m: QC_UNARY.x.m, q: g.q3, mask: (1 << g.q1) | (1 << g.q2) };
  if (op === 'rx' || op === 'ry' || op === 'rz'){
    return { m: qcRotation(op, g.theta ?? 0), q: g.q, mask: g.c != null ? (1 << g.c) : 0 };
  }
  if (op === 'phase'){
    const th = g.theta ?? 0;
    return { m: [QCN_C1, QCN_C0, QCN_C0, { re: Math.cos(th), im: Math.sin(th) }], q: g.q, mask: g.c != null ? (1 << g.c) : 0 };
  }
  const u = QC_UNARY[op];
  if (!u) return null;
  return { m: u.m, q: g.q, mask: g.c != null ? (1 << g.c) : 0 };
}

/* 门触及的比特集合（噪声施加对象；cond 未触发时在 qcnExec 里根本不调用） */
export function qcnGateTouched(g){
  if (g.op === 'swap') return [g.q1, g.q2];
  if (g.op === 'measure') return g.qubits ? g.qubits.slice() : [g.q];
  const t = qcnGateMatrix(g);
  const set = new Set();
  if (t){
    set.add(t.q);
    for (let k = 0; k < 30; k++) if ((t.mask >> k) & 1) set.add(k);
  }
  return [...set];
}

/* ---------- 密度矩阵表示 ---------- */
export function qcnRho(n){
  const dim = 1 << n;
  const r = { n, dim, re: new Float64Array(dim * dim), im: new Float64Array(dim * dim) };
  r.re[0] = 1;
  return r;
}
/* 由纯态 |ψ⟩（qcNewState 结构）构造 ρ = |ψ⟩⟨ψ| */
export function qcnRhoFromPure(s){
  const D = s.dim;
  const r = { n: s.n, dim: D, re: new Float64Array(D * D), im: new Float64Array(D * D) };
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++){
    r.re[i * D + j] = s.re[i] * s.re[j] + s.im[i] * s.im[j];       /* ψ_i ψ_j* */
    r.im[i * D + j] = s.im[i] * s.re[j] - s.re[i] * s.im[j];
  }
  return r;
}

/* ---------- 门作用：U ρ U†（两趟公式，见文件头 ①） ---------- */
function qcnApply1q(rho, m, q, mask){
  const D = rho.dim, bit = 1 << q;
  const Re = rho.re, Im = rho.im;
  const m00r = m[0].re, m00i = m[0].im, m01r = m[1].re, m01i = m[1].im;
  const m10r = m[2].re, m10i = m[2].im, m11r = m[3].re, m11i = m[3].im;
  /* 第一趟：A = ρ U†（右乘）。controls 未满的列对 U† 列为 δ ⟹ 不变 */
  for (let j0 = 0; j0 < D; j0++){
    if (j0 & bit) continue;
    if ((j0 & mask) !== mask) continue;
    const j1 = j0 | bit;
    for (let i = 0; i < D; i++){
      const a0r = Re[i * D + j0], a0i = Im[i * D + j0];
      const a1r = Re[i * D + j1], a1i = Im[i * D + j1];
      /* conj(m)·a：Re = mr·ar + mi·ai，Im = mr·ai − mi·ar */
      Re[i * D + j0] = m00r * a0r + m00i * a0i + m01r * a1r + m01i * a1i;
      Im[i * D + j0] = m00r * a0i - m00i * a0r + m01r * a1i - m01i * a1r;
      Re[i * D + j1] = m10r * a0r + m10i * a0i + m11r * a1r + m11i * a1i;
      Im[i * D + j1] = m10r * a0i - m10i * a0r + m11r * a1i - m11i * a1r;
    }
  }
  /* 第二趟：ρ' = U A（左乘）。controls 未满的行对不变 */
  for (let i0 = 0; i0 < D; i0++){
    if (i0 & bit) continue;
    if ((i0 & mask) !== mask) continue;
    const i1 = i0 | bit;
    for (let j = 0; j < D; j++){
      const a0r = Re[i0 * D + j], a0i = Im[i0 * D + j];
      const a1r = Re[i1 * D + j], a1i = Im[i1 * D + j];
      /* m·a：Re = mr·ar − mi·ai，Im = mr·ai + mi·ar */
      Re[i0 * D + j] = m00r * a0r - m00i * a0i + m01r * a1r - m01i * a1i;
      Im[i0 * D + j] = m00r * a0i + m00i * a0r + m01r * a1i + m01i * a1r;
      Re[i1 * D + j] = m10r * a0r - m10i * a0i + m11r * a1r - m11i * a1i;
      Im[i1 * D + j] = m10r * a0i + m10i * a0r + m11r * a1i + m11i * a1r;
    }
  }
}
/* SWAP(a,b)：ρ'_{σ(i),σ(j)} = ρ_{ij}，σ = 交换位 a,b 的索引置换 */
function qcnSwapRho(rho, a, b){
  if (a === b) return;
  const D = rho.dim, ba = 1 << a, bb = 1 << b;
  const map = new Uint32Array(D);
  for (let i = 0; i < D; i++){
    const ia = (i & ba) ? 1 : 0, ib = (i & bb) ? 1 : 0;
    map[i] = ia === ib ? i : (i ^ ba ^ bb);
  }
  const nr = new Float64Array(rho.re.length), ni = new Float64Array(rho.im.length);
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++){
    nr[i * D + j] = rho.re[map[i] * D + map[j]];
    ni[i * D + j] = rho.im[map[i] * D + map[j]];
  }
  rho.re.set(nr); rho.im.set(ni);
}
export function qcnApplyGate(rho, g){
  if (g.op === 'swap'){ qcnSwapRho(rho, g.q1, g.q2); return rho; }
  const t = qcnGateMatrix(g);
  if (!t) throw new Error('qcnApplyGate: unknown gate ' + g.op);
  qcnApply1q(rho, t.m, t.q, t.mask);
  return rho;
}

/* ---------- 阻尼通道（就地） ---------- */
/* 振幅阻尼 γ（T₁）：E₀=diag(1,√(1−γ))、E₁=√γ|0⟩⟨1| 作用在比特 q 上 */
export function qcnAmpDamp(rho, q, gamma){
  const g = Math.min(1, Math.max(0, gamma));
  if (g <= 0) return;
  const D = rho.dim, bit = 1 << q, s = Math.sqrt(1 - g), oneMg = 1 - g;
  const Re = rho.re, Im = rho.im;
  for (let i0 = 0; i0 < D; i0++){
    if (i0 & bit) continue;
    const i1 = i0 | bit;
    for (let j0 = 0; j0 < D; j0++){
      if (j0 & bit) continue;
      const j1 = j0 | bit;
      /* E₁ρE₁† 把 |1⟩|1⟩ 块搬到 |0⟩|0⟩ 块（先读后写，就地安全） */
      const p11r = Re[i1 * D + j1], p11i = Im[i1 * D + j1];
      Re[i0 * D + j0] += g * p11r;
      Im[i0 * D + j0] += g * p11i;
      /* E₀ρE₀†：跨位相干 ×√(1−γ)、|1⟩|1⟩ 块 ×(1−γ) */
      Re[i0 * D + j1] *= s; Im[i0 * D + j1] *= s;
      Re[i1 * D + j0] *= s; Im[i1 * D + j0] *= s;
      Re[i1 * D + j1] *= oneMg; Im[i1 * D + j1] *= oneMg;
    }
  }
}
/* 相位阻尼 λ（T₂）：E₀=√(1−λ/2)I、E₁=√(λ/2)Z ⟹ 跨位相干 ×(1−λ)，对角不变 */
export function qcnPhaseDamp(rho, q, lambda){
  const l = Math.min(1, Math.max(0, lambda));
  if (l <= 0) return;
  const D = rho.dim, bit = 1 << q, keep = 1 - l;
  const Re = rho.re, Im = rho.im;
  for (let i0 = 0; i0 < D; i0++){
    if (i0 & bit) continue;
    const i1 = i0 | bit;
    for (let j0 = 0; j0 < D; j0++){
      if (j0 & bit) continue;
      const j1 = j0 | bit;
      Re[i0 * D + j1] *= keep; Im[i0 * D + j1] *= keep;
      Re[i1 * D + j0] *= keep; Im[i1 * D + j0] *= keep;
    }
  }
}

/* ---------- 退极化通道（R105） ---------- */
/* R105：退极化（第三通道）——单比特去极化 ρ → (1−p)ρ + (p/3)(XρX+YρY+ZρZ)。
   就地闭式（λ ≡ 1−4p/3 是 Bloch 缩放因子，三方向**各向同性**——这是退极化
   与 T₁/T₂ 的判据分水岭）：
     记 σ_yρσ_y 的 2×2 块形式 = [[d,−c],[−b,a]]（注意与 σ_xρσ_x=[[d,c],[b,a]]、
     σ_zρσ_z=[[a,−b],[−c,d]] 差一个符号位），三者求和后：
       · q 位**相同**的矩阵元对 (i0,j0)↔(i1,j1)：a' = ((1+λ)a+(1−λ)d)/2、d' 对称
         （X/Y/Z 各贡献 2·d+a / 2·a+d）
       · q 位**不同**的矩阵元 (i0,j1) 与 (i1,j0)：仅 ×λ（c 与 −c 相消、只留 −b）
   p=3/4 ⟹ λ=0 ⟹ 该比特完全去极化（块内取平均、跨位清零 ⟹ ρ→(I/2)⊗tr_q ρ）。 */
export function qcnDepolar(rho, q, p){
  const pp = Math.min(0.75, Math.max(0, p));
  if (!(pp > 0)) return;                 /* p=0 / 负数 / NaN 一律 no-op（与两个阻尼通道同口径） */
  const D = rho.dim, bit = 1 << q, lam = 1 - 4 * pp / 3;
  const wA = (1 + lam) / 2, wB = (1 - lam) / 2;   /* = 1−2p/3 与 2p/3 */
  const Re = rho.re, Im = rho.im;
  for (let i0 = 0; i0 < D; i0++){
    if (i0 & bit) continue;
    const i1 = i0 | bit;
    for (let j0 = 0; j0 < D; j0++){
      if (j0 & bit) continue;
      const j1 = j0 | bit;
      /* 块内混合：q 位同为 0 / 同为 1 的两个矩阵元（先读后写，就地安全） */
      const k00 = i0 * D + j0, k11 = i1 * D + j1;
      const a0r = Re[k00], a0i = Im[k00], a1r = Re[k11], a1i = Im[k11];
      Re[k00] = wA * a0r + wB * a1r; Im[k00] = wA * a0i + wB * a1i;
      Re[k11] = wB * a0r + wA * a1r; Im[k11] = wB * a0i + wA * a1i;
      /* 跨位：q 位不同 ⟹ 只缩放 λ */
      const k01 = i0 * D + j1, k10 = i1 * D + j0;
      Re[k01] *= lam; Im[k01] *= lam;
      Re[k10] *= lam; Im[k10] *= lam;
    }
  }
}

/* ---------- 噪声参数 ---------- */
/* t1,t2,tg 任意正数（同一单位）；γ=1−e^{−tg/t1}、λ=1−e^{−tg/t2}。
   t2eff = 1/(1/t2 + 1/(2t1))：T₁ 本身贡献的横向衰减（T₂ ≤ 2T₁ 自动满足）。 */
export function qcnNoiseParams(t1, t2, tg, pd = 0){
  const T1 = Math.max(1e-9, t1), T2 = Math.max(1e-9, t2), TG = Math.max(0, tg);
  const pdep = Math.min(0.75, Math.max(0, Number.isFinite(pd) ? pd : 0));
  return {
    gamma: 1 - Math.exp(-TG / T1),
    lambda: 1 - Math.exp(-TG / T2),
    pdep,
    ldep: 1 - 4 * pdep / 3,           /* 退极化的 Bloch 缩放因子（R77/R80 同口径） */
    t2eff: 1 / (1 / T2 + 1 / (2 * T1)),
  };
}

/* ---------- 测量 ---------- */
/* Z 基：p1 = Σ_{i:bit} ρ_ii；投影到该位 out 子空间（保留块内相干）+ 归一 */
export function qcnMeasureZ(rho, q, rng){
  const D = rho.dim, bit = 1 << q;
  let p1 = 0;
  for (let i = 0; i < D; i++) if (i & bit) p1 += rho.re[i * D + i];
  const out = rng() < p1 ? 1 : 0;
  const Re = rho.re, Im = rho.im;
  for (let i = 0; i < D; i++){
    const bi = (i & bit) ? 1 : 0;
    for (let j = 0; j < D; j++){
      if (bi !== out || ((j & bit) ? 1 : 0) !== out){ Re[i * D + j] = 0; Im[i * D + j] = 0; }
    }
  }
  const p = out ? p1 : (1 - p1);
  const k = p > 0 ? 1 / p : 0;
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++){ Re[i * D + j] *= k; Im[i * D + j] *= k; }
  return out;
}
/* 单比特测量（R100 同款「旋转-测量-旋回」，旋转走密度路径） */
export function qcnMeasureQubit(rho, q, rng, basis = 'z'){
  if (basis !== 'z' && basis !== 'x' && basis !== 'y') throw new Error('unknown measure basis ' + basis);
  const pre = basis === 'x' ? [{ op: 'h', q }] : basis === 'y' ? [{ op: 'sdg', q }, { op: 'h', q }] : [];
  const post = basis === 'x' ? [{ op: 'h', q }] : basis === 'y' ? [{ op: 'h', q }, { op: 's', q }] : [];
  for (const g of pre) qcnApplyGate(rho, g);
  const bit = qcnMeasureZ(rho, q, rng);
  for (const g of post) qcnApplyGate(rho, g);
  return bit;
}
/* 联合测量（R103 同款）：P† → 顺序 Z 测 k 次（投影互交换 ⟺ 联合 Z）→ P 旋回 */
export function qcnMeasureJoint(rho, qubits, rng, basis = 'bell'){
  const P = QC_JOINT_PREP[basis];
  if (!P) throw new Error('unknown joint measure basis ' + basis);
  const k = qcJointK(basis);
  if (!Array.isArray(qubits) || qubits.length !== k) throw new Error('joint measure ' + basis + ' needs ' + k + ' qubits');
  const seen = new Set();
  for (const q of qubits){
    if (!Number.isInteger(q) || q < 0 || q >= rho.n) throw new Error('joint measure qubit out of range: ' + q);
    if (seen.has(q)) throw new Error('joint measure qubits must be distinct: ' + qubits.join(','));
    seen.add(q);
  }
  const prep = P(qubits);
  const outcomes = [];
  for (const g of [...prep].reverse()) qcnApplyGate(rho, g);       /* P†（自伴 ⟹ 逆序） */
  for (const q of qubits) outcomes.push(qcnMeasureZ(rho, q, rng));
  for (const g of prep) qcnApplyGate(rho, g);                     /* P 旋回 */
  return outcomes;
}

/* ---------- 执行（镜像 qcExec；noise = {gamma, lambda} | null） ---------- */
function qcnNoiseAfter(rho, g, noise){
  if (!noise) return;
  const { gamma, lambda, pdep } = noise;
  if (!(gamma > 0 || lambda > 0 || pdep > 0)) return;
  for (const q of qcnGateTouched(g)){
    if (gamma > 0) qcnAmpDamp(rho, q, gamma);
    if (lambda > 0) qcnPhaseDamp(rho, q, lambda);
    if (pdep > 0) qcnDepolar(rho, q, pdep);
  }
}
export function qcnExec(rho, op, cres, rng, noise = null){
  if (op.op === 'measure'){
    if (op.qubits){
      const bits = qcnMeasureJoint(rho, op.qubits, rng, op.basis || 'bell');
      if (cres && op.cbit != null) for (let i = 0; i < bits.length; i++) cres[op.cbit + i] = bits[i];
      return { kind: 'measure', qubits: op.qubits.slice(), cbit: op.cbit, bits, basis: op.basis || 'bell', joint: true };
    }
    const bit = qcnMeasureQubit(rho, op.q, rng, op.basis || 'z');
    if (cres && op.cbit != null) cres[op.cbit] = bit;
    return { kind: 'measure', q: op.q, cbit: op.cbit, bit, basis: op.basis || 'z' };
  }
  if (op.op === 'cond'){
    const on = cres ? !!cres[op.cbit] : false;
    if (on){ qcnApplyGate(rho, op.gate); qcnNoiseAfter(rho, op.gate, noise); }
    return { kind: 'cond', cbit: op.cbit, on };
  }
  qcnApplyGate(rho, op);
  qcnNoiseAfter(rho, op, noise);
  return { kind: 'gate' };
}
export function qcnRunProgram(rho, ops, rng, cres = null, noise = null){
  const c = cres || new Uint8Array(8);
  const rec = [];
  for (const op of ops) rec.push(qcnExec(rho, op, c, rng, noise));
  return { cres: c, rec };
}

/* ---------- 观测量 ---------- */
export function qcnProbs(rho){
  const p = new Float64Array(rho.dim);
  for (let i = 0; i < rho.dim; i++) p[i] = rho.re[i * rho.dim + i];
  return p;
}
export function qcnTrace(rho){
  const D = rho.dim;
  let tr = 0;
  for (let i = 0; i < D; i++) tr += rho.re[i * D + i];
  return tr;
}
export function qcnPurity(rho){
  const D = rho.dim;
  let s = 0;
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++){
    const a = rho.re[i * D + j], b = rho.im[i * D + j];
    s += a * a + b * b;                     /* ρ 厄米 ⟹ trρ² = Σ|ρ_ij|² */
  }
  return s;
}
/* 最大非对角相干 max|ρ_ij|（i≠j）——混合态里「还剩多少量子性」的读数 */
export function qcnMaxCoh(rho){
  const D = rho.dim;
  let mx = 0;
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++){
    if (i === j) continue;
    const v = Math.hypot(rho.re[i * D + j], rho.im[i * D + j]);
    if (v > mx) mx = v;
  }
  return mx;
}
/* 末态抽样（页面「测量」按钮）：按 Born 规则抽指数 + 投影 */
export function qcnSampleRho(rho, rng){
  const p = qcnProbs(rho);
  const u = rng();
  let acc = 0;
  for (let i = 0; i < rho.dim; i++){ acc += p[i]; if (u < acc) return i; }
  return rho.dim - 1;
}
export function qcnCollapseRho(rho, idx){
  const D = rho.dim;
  rho.re.fill(0); rho.im.fill(0);
  rho.re[idx * D + idx] = 1;
  return rho;
}
/* ⟨Z_a Z_b⟩（Z 对角 ⟹ 只读 diagonal） */
export function qcnZZ(rho, a, b){
  const ba = 1 << a, bb = 1 << b, D = rho.dim;
  let v = 0;
  for (let i = 0; i < D; i++){
    const sa = (i & ba) ? -1 : 1, sb = (i & bb) ? -1 : 1;
    v += sa * sb * rho.re[i * D + i];
  }
  return v;
}
/* 单比特约化密度矩阵（2×2 复；保真度 HUD 用） */
export function qcnQubitRho(rho, q){
  const D = rho.dim, bit = 1 << q;
  const rr = [[0, 0], [0, 0]], ii = [[0, 0], [0, 0]];
  for (let i = 0; i < D; i++){
    if (i & bit) continue;
    const j = i | bit;
    rr[0][0] += rho.re[i * D + i];
    rr[1][1] += rho.re[j * D + j];
    rr[0][1] += rho.re[i * D + j];
    ii[0][1] += rho.im[i * D + j];
  }
  rr[1][0] = rr[0][1];
  ii[1][0] = -ii[0][1];
  return { re: rr, im: ii };
}

/* ---------- 位置换（子系统迁低位，与 qcPermuteBits 同构） ---------- */
export function qcnPermuteRho(rho, mask){
  const n = rho.n, D = rho.dim, m = mask & ((1 << n) - 1);
  const keep = [], rest = [];
  for (let k = 0; k < n; k++) ((m >> k) & 1 ? keep : rest).push(k);
  const kA = keep.length;
  const map = new Uint32Array(D);
  for (let t = 0; t < D; t++){
    let lo = 0, hi = 0;
    for (let b = 0; b < kA; b++) if ((t >> keep[b]) & 1) lo |= 1 << b;
    for (let b = 0; b < rest.length; b++) if ((t >> rest[b]) & 1) hi |= 1 << b;
    map[t] = (hi << kA) | lo;
  }
  const out = { n, dim: D, re: new Float64Array(D * D), im: new Float64Array(D * D) };
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++){
    out.re[i * D + j] = rho.re[map[i] * D + map[j]];
    out.im[i * D + j] = rho.im[map[i] * D + map[j]];
  }
  return out;
}
/* 任意子系统熵：位置换迁低位 → 部分求迹 → 实嵌入 Jacobi（与 qcEntropy 同判据） */
export function qcnEntropySubset(rho, mask){
  const n = rho.n, m = mask & ((1 << n) - 1);
  const bits = [];
  for (let k = 0; k < n; k++) if ((m >> k) & 1) bits.push(k);
  const kA = bits.length;
  if (!kA) return { S: 0, spectrum: [], sum: 0, kA: 0, dimA: 1, mask: m, bits };
  const pr = qcnPermuteRho(rho, m);
  const D = pr.dim, mA = 1 << kA, rest = D / mA;
  const A = [];
  for (let i = 0; i < 2 * mA; i++) A.push(new Float64Array(2 * mA));
  for (let i = 0; i < mA; i++) for (let j = 0; j < mA; j++){
    let rr = 0, ii = 0;
    for (let e = 0; e < rest; e++){
      const p = e * mA + i, q = e * mA + j;
      rr += pr.re[p * D + q];
      ii += pr.im[p * D + q];
    }
    A[i][j] += rr; A[i][mA + j] += -ii;
    A[mA + i][j] += ii; A[mA + i][mA + j] += rr;
  }
  const { val } = jacobiReal(A, 2 * mA, 80);
  const sorted = val.slice().sort((a, b) => b - a);
  const lam = [];
  for (let i = 0; i < 2 * mA; i += 2){          /* 实嵌入本征值各二重 ⟹ 隔一取 */
    const v = Math.max(0, sorted[i]);
    if (v > 1e-14) lam.push(v);
  }
  const sum = lam.reduce((a, b) => a + b, 0);
  let S = 0;
  for (const v of lam) if (v > 1e-14) S -= v * Math.log(v);
  if (S < 0 && S > -1e-12) S = 0;
  return { S, spectrum: lam, sum, kA, dimA: mA, mask: m, bits };
}

/* ---------- Wootters 全式 concurrence（n=2，任意两比特态） ----------
 * X 态闭式只在 X 形初态 + 保持 X 形的通道下精确；门噪声 + 任意线路会打破
 * X 形 ⟹ 用全式：R = ρ S ρ* S（S = σ_y⊗σ_y），C = max(0, Σ√λ_i 带符号）。
 * S|k⟩ = s_k|π(k)⟩，π=[3,2,1,0]、s=[−1,1,1,−1] ⟹ R_{ij} = Σ_k ρ_{i,π(k)} ρ*_{k,π(j)}。 */
export function qcnConcurrence(rho){
  if (rho.n !== 2) return NaN;
  const D = 4, R = rho.re, I = rho.im;
  const pi = [3, 2, 1, 0];
  const Rre = new Float64Array(16), Rim = new Float64Array(16);
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++){
    let sr = 0, si = 0;
    for (let k = 0; k < D; k++){
      const a = i * D + pi[k], b = k * D + pi[j];
      /* (a_r + i a_i)·conj(b_r + i b_i) */
      sr += R[a] * R[b] + I[a] * I[b];
      si += I[a] * R[b] - R[a] * I[b];
    }
    Rre[i * D + j] = sr; Rim[i * D + j] = si;
  }
  /* 实嵌入 [[Re,−Im],[Im,Re]]（厄米 ⟹ 本征值各二重） */
  const m = 8;
  const A = [];
  for (let i = 0; i < m; i++) A.push(new Float64Array(m));
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++){
    A[i][j] += Rre[i * D + j]; A[i][D + j] += -Rim[i * D + j];
    A[D + i][j] += Rim[i * D + j]; A[D + i][D + j] += Rre[i * D + j];
  }
  const { val } = jacobiReal(A, m, 120);
  const sorted = val.slice().sort((a, b) => b - a).map(v => Math.max(0, v));
  const roots = [0, 2, 4, 6].map(i => Math.sqrt(sorted[i]));   /* 隔一取（二重） */
  return Math.max(0, roots[0] - roots[1] - roots[2] - roots[3]);
}

/* 注：不再 re-export mulberry32——scripts/build-standalone.mjs 只支持单行静态
   import + 具名 export 声明，不解析 `export {}` 列表（dist 构建会 FAIL）。
   需要 RNG 的调用方直接从 ./qcircuit.js import。 */
