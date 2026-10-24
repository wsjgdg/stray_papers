/* ============================================================================
 * qcircuit.js — R75 小规模量子线路：态矢模拟器（纯 CPU，n ≤ 12）
 *
 * 约定（页面、测试、文档共用同一套，写错一处就会全盘错位）：
 *   ① 态矢 ψ = Σ_i a_i |i⟩，i ∈ [0, 2^n)；**指数的第 k 位 = 量子比特 k**
 *      （LSB 是 q0）。X 作用在 q_k 上就是翻转指数的第 k 位。
 *   ② 振幅存成两条 Float64Array（re/im），门是 2×2 复矩阵 {a,b,c,d}（各为 [re,im]）。
 *   ③ 受控门：控制位全 1 时才作用；CNOT 的 c=[control]、t=target。
 *   ④ 子系统 A = **低 k_A 位**（q0..q_{k_A−1}），环境 = 高位块；这样 reshape 成
 *      [2^{n−kA}][2^{kA}] 就是连续的，约化密度矩阵直接 Gram 求和。
 *   ⑤ 全局相位不可观测：涉及 Rz/Rx/Ry 的断言一律用保真度 |⟨φ|ψ⟩|² 或概率，
 *      不比振幅本身（相位约定不同不是 bug）。
 *
 * 复杂度：单门 O(2^n)；n=12 时 4096 振幅、单门 ~4096 次复乘（微秒级）。
 * ========================================================================== */

/* ---------- 复数小工具 ---------- */
const cx = (re, im) => ({ re, im });
const cadd = (x, y) => cx(x.re + y.re, x.im + y.im);
const cmul = (x, y) => cx(x.re * y.re - x.im * y.im, x.re * y.im + x.im * y.re);
const cabs2 = x => x.re * x.re + x.im * x.im;
const C0 = cx(0, 0), C1 = cx(1, 0), CI = cx(0, 1);

/* ---------- 门表 ---------- */
/* 每个门：{ name, arity, matrix? }；带参门由工厂生成 */
const S2 = Math.SQRT1_2;

export const QC_UNARY = {
  h: { label: 'H', m: [cx(S2, 0), cx(S2, 0), cx(S2, 0), cx(-S2, 0)] },
  x: { label: 'X', m: [C0, C1, C1, C0] },
  y: { label: 'Y', m: [C0, cx(0, -1), cx(0, 1), C0] },
  z: { label: 'Z', m: [C1, C0, C0, cx(-1, 0)] },
  s: { label: 'S', m: [C1, C0, C0, CI] },
  sdg: { label: 'S†', m: [C1, C0, C0, cx(0, -1)] },
  t: { label: 'T', m: [C1, C0, C0, cx(Math.SQRT1_2, Math.SQRT1_2)] },
  tdg: { label: 'T†', m: [C1, C0, C0, cx(Math.SQRT1_2, -Math.SQRT1_2)] },
};

export function qcRotation(op, theta){
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  if (op === 'rx') return [cx(c, 0), cx(0, -s), cx(0, -s), cx(c, 0)];
  if (op === 'ry') return [cx(c, 0), cx(-s, 0), cx(s, 0), cx(c, 0)];
  if (op === 'rz') return [cx(Math.cos(theta / 2), -Math.sin(theta / 2)), C0, C0,
                           cx(Math.cos(theta / 2), Math.sin(theta / 2))];
  throw new Error('unknown rotation ' + op);
}

/* ---------- 态 ---------- */
export function qcNewState(n){
  const dim = 1 << n;
  const s = { n, dim, re: new Float64Array(dim), im: new Float64Array(dim) };
  s.re[0] = 1;
  return s;
}
/* 基态 |j⟩（qcNewState 默认给 |0⟩；测试与页面都需要任意基态，别手写 re[j]=1
   ——那会和已有的 re[0]=1 叠加成两个基态的相干和，是本轮踩过的坑）。 */
export function qcBasis(n, j){
  const dim = 1 << n;
  const s = { n, dim, re: new Float64Array(dim), im: new Float64Array(dim) };
  s.re[j & (dim - 1)] = 1;
  return s;
}
export function qcClone(s){
  return { n: s.n, dim: s.dim, re: Float64Array.from(s.re), im: Float64Array.from(s.im) };
}
export function qcNorm(s){
  let a = 0;
  for (let i = 0; i < s.dim; i++) a += s.re[i] * s.re[i] + s.im[i] * s.im[i];
  return a;
}
export function qcProbs(s){
  const p = new Float64Array(s.dim);
  for (let i = 0; i < s.dim; i++) p[i] = s.re[i] * s.re[i] + s.im[i] * s.im[i];
  return p;
}
/* 归一化（测量后、数值漂移后） */
export function qcRenormalize(s){
  const n2 = qcNorm(s);
  if (n2 <= 0) throw new Error('norm collapsed');
  const k = 1 / Math.sqrt(n2);
  for (let i = 0; i < s.dim; i++){ s.re[i] *= k; s.im[i] *= k; }
  return s;
}

/* ---------- 门作用 ---------- */
/* 单比特矩阵 m 作用在比特 q（就地） */
function applyMatrix(s, m, q){
  const bit = 1 << q;
  const { re, im } = s;
  for (let i = 0; i < s.dim; i++){
    if (i & bit) continue;
    const j = i | bit;
    const a0r = re[i], a0i = im[i], a1r = re[j], a1i = im[j];
    /* m = [m00 m01; m10 m11]，逐项展开免临时对象 */
    re[i] = m[0].re * a0r - m[0].im * a0i + m[1].re * a1r - m[1].im * a1i;
    im[i] = m[0].re * a0i + m[0].im * a0r + m[1].re * a1i + m[1].im * a1r;
    re[j] = m[2].re * a0r - m[2].im * a0i + m[3].re * a1r - m[3].im * a1i;
    im[j] = m[2].re * a0i + m[2].im * a0r + m[3].re * a1i + m[3].im * a1r;
  }
}
function ctrlMask(controls){
  let m = 0;
  for (const c of controls || []) m |= 1 << c;
  return m;
}
/* 受控单比特门：控制位全 1 时才对 target 作用。就地实现：逐对扫描后仅处理
   满足控制条件的指数（不做子空间拷贝，n=12 也只有 4096 次判断） */
function applyControlled(s, m, q, controls){
  const mask = ctrlMask(controls);
  if (!mask){ applyMatrix(s, m, q); return; }
  const bit = 1 << q;
  const { re, im } = s;
  for (let i = 0; i < s.dim; i++){
    if ((i & mask) !== mask) continue;
    if (i & bit) continue;
    const j = i | bit;
    const a0r = re[i], a0i = im[i], a1r = re[j], a1i = im[j];
    re[i] = m[0].re * a0r - m[0].im * a0i + m[1].re * a1r - m[1].im * a1i;
    im[i] = m[0].re * a0i + m[0].im * a0r + m[1].re * a1i + m[1].im * a1r;
    re[j] = m[2].re * a0r - m[2].im * a0i + m[3].re * a1r - m[3].im * a1i;
    im[j] = m[2].re * a0i + m[2].im * a0r + m[3].re * a1i + m[3].im * a1r;
  }
}
function applySwap(s, a, b){
  const ba = 1 << a, bb = 1 << b;
  if (a === b) return;
  const { re, im } = s;
  for (let i = 0; i < s.dim; i++){
    const ia = (i & ba) ? 1 : 0, ib = (i & bb) ? 1 : 0;
    if (ia === ib) continue;
    if (ia === 0) continue;             /* 每对只处理一次（i 的 a 位为 0、b 位为 1） */
    const j = i ^ ba ^ bb;
    const tr = re[i], ti = im[i];
    re[i] = re[j]; im[i] = im[j];
    re[j] = tr; im[j] = ti;
  }
}

/* 展开成统一形式：{ op, q, c, theta } */
export function qcApply(s, g){
  const op = g.op;
  if (op === 'cnot'){ applyControlled(s, QC_UNARY.x.m, g.t ?? g.q2, [g.c ?? g.q1]); return s; }
  if (op === 'cz'){ applyControlled(s, QC_UNARY.z.m, g.t ?? g.q2, [g.c ?? g.q1]); return s; }
  if (op === 'swap'){ applySwap(s, g.q1, g.q2); return s; }
  if (op === 'toffoli'){
    applyControlled(s, QC_UNARY.x.m, g.q3, [g.q1, g.q2]); return s;
  }
  if (op === 'rx' || op === 'ry' || op === 'rz'){
    const m = qcRotation(op, g.theta ?? 0);
    if (g.c != null) applyControlled(s, m, g.q, [g.c]);
    else applyMatrix(s, m, g.q);
    return s;
  }
  if (op === 'phase'){
    /* P(φ)=diag(1,e^{iφ})：受控 P 就是标准「受控相位门」diag(1,1,1,e^{iφ})。
       QFT 必须用它而不是受控 Rz——受控 Rz 差一个控制位上的 Rz(φ)，只对
       计算基输入无害，对叠加输入会错（这也是本轮设计时纠正的一处）。 */
    const th = g.theta ?? 0;
    const m = [C1, C0, C0, cx(Math.cos(th), Math.sin(th))];
    if (g.c != null) applyControlled(s, m, g.q, [g.c]);
    else applyMatrix(s, m, g.q);
    return s;
  }
  const u = QC_UNARY[op];
  if (!u) throw new Error('unknown gate ' + op);
  if (g.c != null) applyControlled(s, u.m, g.q, [g.c]);
  else applyMatrix(s, u.m, g.q);
  return s;
}
export function qcApplyAll(s, gates){ for (const g of gates) qcApply(s, g); return s; }

/* 稠密矩阵（测试用，n ≤ 3）：把线路作用到每个基矢上拼成列 */
export function qcProgramMatrix(n, gates){
  const dim = 1 << n;
  const M = [];
  for (let k = 0; k < dim; k++){
    const s = { n, dim, re: new Float64Array(dim), im: new Float64Array(dim) };
    s.re[k] = 1;
    qcApplyAll(s, gates);
    M.push(s);
  }
  return M;   /* M[k][j] = 第 k 列的第 j 行 = ⟨j|U|k⟩ */
}

/* ---------- 测量与统计 ---------- */
export function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* 按 |a|² 抽样一个指数 */
export function qcSample(s, rng){
  const p = qcProbs(s);
  const u = rng();
  let acc = 0;
  for (let i = 0; i < s.dim; i++){
    acc += p[i];
    if (u < acc) return i;
  }
  return s.dim - 1;
}
/* 塌缩到指数 i（就地归一化，其余振幅归零） */
export function qcCollapse(s, idx){
  for (let i = 0; i < s.dim; i++){ if (i !== idx){ s.re[i] = 0; s.im[i] = 0; } }
  qcRenormalize(s);
  return s;
}
/* 单比特边缘：p0 = P(该位=0) */
export function qcMarginal(s, q){
  const bit = 1 << q;
  let p1 = 0;
  for (let i = 0; i < s.dim; i++) if (i & bit) p1 += s.re[i] * s.re[i] + s.im[i] * s.im[i];
  return { p0: 1 - p1, p1, z: 1 - 2 * p1 };
}
/* 两体 ZZ 关联 ⟨Z_a Z_b⟩（实；Z 对角） */
export function qcZZ(s, a, b){
  const ba = 1 << a, bb = 1 << b;
  let v = 0;
  for (let i = 0; i < s.dim; i++){
    const sa = (i & ba) ? -1 : 1, sb = (i & bb) ? -1 : 1;
    v += sa * sb * (s.re[i] * s.re[i] + s.im[i] * s.im[i]);
  }
  return v;
}
export function qcPauliCorr(s, a, pa, b, pb){
  const t = qcClone(s);
  const applyTo = (st, q, p) => {
    if (p === 'x') applyMatrix(st, QC_UNARY.x.m, q);
    else if (p === 'y') applyMatrix(st, QC_UNARY.y.m, q);
    else if (p === 'z'){
      const bit = 1 << q;
      for (let i = 0; i < st.dim; i++) if (i & bit){ st.re[i] = -st.re[i]; st.im[i] = -st.im[i]; }
    }
  };
  /* 先作用在 |ψ⟩ 上得到 P_b|ψ⟩，再与 P_a|ψ⟩ 内积 */
  applyTo(t, b, pb);
  const u = qcClone(s);
  applyTo(u, a, pa);
  let re = 0, im = 0;
  for (let i = 0; i < s.dim; i++){
    re += u.re[i] * t.re[i] + u.im[i] * t.im[i];
    im += u.im[i] * t.re[i] - u.re[i] * t.im[i];
  }
  /* ⟨u|t⟩ 应为实数（对易/反对易都给实数） */
  return re;
}

/* ---------- 任意 Pauli 期望 ⟨P⟩（P 由 x/z 两个比特掩码给出，支持 Y） ----------
   判定用：R81 起「从末态反推」的容错判定、R86 起 qec.js/shor.js 的门噪声
   结局判定都靠它（稳定子期望 + 逻辑期望），故收为此处共享单源
   （原为 flagsynd.js 私有的 fsExpect，R86 提取）。
   算法：P|i⟩ = i^{n_Y}·(−1)^{popcount(z & i)}·|i ⊕ x⟩（各比特独立作用、无次序
   问题），⟨P⟩ = Σ_i ψ_i* · (Pψ)_i；n_Y = popcount(x&z) mod 4 决定整体相位。 */
export function qcExpect(s, xm, zm){
  const { re, im, dim } = s;
  let ar = 0, ai = 0;
  for (let i = 0; i < dim; i++){
    const r0 = re[i], i0 = im[i];
    if (r0 === 0 && i0 === 0) continue;
    const j = i ^ xm;
    let c = 0, v = zm & i;
    while (v){ c ^= v & 1; v >>= 1; }
    const sg = c ? -1 : 1;
    const br = re[j] * sg, bi = im[j] * sg;
    ar += r0 * br + i0 * bi;
    ai += r0 * bi - i0 * br;
  }
  let xy = xm & zm, nY = 0;
  while (xy){ nY += xy & 1; xy >>= 1; }
  nY &= 3;
  if (nY === 0) return ar;
  if (nY === 1) return -ai;
  if (nY === 2) return -ar;
  return ai;
}

/* ---------- Pauli 帧（辛表示）：只跟踪错误、忽略相位 ----------
   R86 起 qec.js 的门噪声判定与 flagsynd.js 的容错提取共用（与 qcExpect 同一
   「共享单源」原则：原为 flagsynd.js 私有的 frToggle/frGate）。帧 = {x,z} 两个
   比特掩码（x 位 = 该比特上有 X/Y 分量，z 位 = Z/Y 分量），描述「相对理想线路
   的残差 Pauli」，不含全局相位。
   传播规则（与 qcApply 的门集合一致）：
     CNOT(c,t)：X_c → X_c X_t（前向）；Z_t → Z_c Z_t（后向）；X_t、Z_c 不动。
     H(q)：X_q ↔ Z_q。测量：帧的 X_q 翻转 Z 读数（重置才清帧，本工程线路每个
     ancilla 只用一次，无需重置）。
     x/y/z 门：就地 toggle。ry/rz/rx/phase 在非零帧上出现即抛错（非 Clifford，
     帧语义未定义——flagsynd 与 qec 的制备段都保证帧为零时才过旋转门）。 */
export function qcFrToggle(fr, q, t){
  const b = 1 << q;
  if (t === 'x' || t === 'y') fr.x ^= b;
  if (t === 'z' || t === 'y') fr.z ^= b;
}
export function qcFrGate(fr, o){
  const op = o.op;
  if (op === 'cnot'){
    const c = o.c ?? o.q1, t = o.t ?? o.q2;
    if ((fr.x >> c) & 1) fr.x ^= 1 << t;
    if ((fr.z >> t) & 1) fr.z ^= 1 << c;
    return;
  }
  if (op === 'h'){
    const b = 1 << o.q, xb = (fr.x & b) ? 1 : 0, zb = (fr.z & b) ? 1 : 0;
    if (zb) fr.x |= b; else fr.x &= ~b;
    if (xb) fr.z |= b; else fr.z &= ~b;
    return;
  }
  if (op === 'x' || op === 'y' || op === 'z'){ qcFrToggle(fr, o.q, op); return; }
  if (op === 'ry' || op === 'rz' || op === 'rx' || op === 'phase'){
    if (fr.x || fr.z) throw new Error('frame: 非 Clifford 门在非零帧上出现 ' + op);
  }
}

/* ---------- 纠缠 ---------- */
/* 约化密度矩阵 ρ_A（A = 低 kA 位）的特征值：Gram 矩阵 ρ[i][j]=Σ_e ψ(i,e)ψ*(j,e)，
   用实嵌入 [[Re,−Im],[Im,Re]] 的 Jacobi（本征值各二重，排序后隔一取、不折半，
   与 R73 熵的修法同一坑）。 */
function jacobiReal(A, m, sweeps = 60){
  const V = [];
  for (let i = 0; i < m; i++){ V.push(new Float64Array(m)); V[i][i] = 1; }
  for (let sw = 0; sw < sweeps; sw++){
    let off = 0;
    for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) off += A[p][q] * A[p][q];
    if (off < 1e-30) break;
    for (let p = 0; p < m; p++){
      for (let q = p + 1; q < m; q++){
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-18) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), sn = t * c;
        for (let k = 0; k < m; k++){
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - sn * akq;
          A[k][q] = sn * akp + c * akq;
        }
        for (let k = 0; k < m; k++){
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - sn * aqk;
          A[q][k] = sn * apk + c * aqk;
        }
        for (let k = 0; k < m; k++){
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - sn * vkq;
          V[k][q] = sn * vkp + c * vkq;
        }
      }
    }
  }
  const val = [];
  for (let i = 0; i < m; i++) val.push(A[i][i]);
  return { val, vec: V };
}

export function qcReducedRho(s, kA){
  const mA = 1 << kA, rest = s.dim / mA;
  const A = [];
  for (let i = 0; i < 2 * mA; i++) A.push(new Float64Array(2 * mA));
  for (let i = 0; i < mA; i++){
    for (let j = 0; j < mA; j++){
      let rr = 0, ii = 0;
      for (let e = 0; e < rest; e++){
        const p = e * mA + i, q = e * mA + j;
        rr += s.re[p] * s.re[q] + s.im[p] * s.im[q];
        ii += s.re[p] * s.im[q] - s.im[p] * s.re[q];
      }
      /* ρ = [[rr, -ii],[ii, rr]] 的实嵌入块 */
      A[i][j] += rr;
      A[i][mA + j] += -ii;
      A[mA + i][j] += ii;
      A[mA + i][mA + j] += rr;
    }
  }
  /* i,j 与 j,i 的实部对称性由上面求和自动满足（ρ 厄米） */
  return A;
}

export function qcEntropy(s, kA){
  const mA = 1 << kA, m = 2 * mA;
  const A = qcReducedRho(s, kA);
  const { val } = jacobiReal(A, m, 80);
  const sorted = val.slice().sort((a, b) => b - a);
  const lam = [];
  for (let i = 0; i < m; i += 2){          /* 实嵌入本征值各二重 ⟹ 隔一取 */
    const v = Math.max(0, sorted[i]);
    if (v > 1e-14) lam.push(v);
  }
  const sum = lam.reduce((a, b) => a + b, 0);
  let S = 0;
  for (const v of lam) if (v > 1e-14) S -= v * Math.log(v);
  /* λ=1 的纯态在 float64 里会算出 −0（Σ 干净时 −1·log1 = −0），钳到 0 */
  if (S < 0 && S > -1e-12) S = 0;
  return { S, spectrum: lam, sum, kA, dimA: mA };
}

/* 两比特 concurrence（n=2，A 取 q0）：C = 2|a00 a11 − a01 a10| */
export function qcConcurrence(s){
  if (s.n !== 2) return NaN;
  const [a00r, a00i] = [s.re[0], s.im[0]];
  const [a01r, a01i] = [s.re[1], s.im[1]];
  const [a10r, a10i] = [s.re[2], s.im[2]];
  const [a11r, a11i] = [s.re[3], s.im[3]];
  const dr = a00r * a11r - a00i * a11i - (a01r * a10r - a01i * a10i);
  const di = a00r * a11i + a00i * a11r - (a01r * a10i + a01i * a10r);
  return 2 * Math.hypot(dr, di);
}

/* 保真度 |⟨φ|ψ⟩|² */
export function qcFidelity(s, t){
  if (s.dim !== t.dim) return NaN;
  let re = 0, im = 0;
  for (let i = 0; i < s.dim; i++){
    re += s.re[i] * t.re[i] + s.im[i] * t.im[i];
    im += s.re[i] * t.im[i] - s.im[i] * t.re[i];
  }
  const d = qcNorm(s) * qcNorm(t);
  return d > 0 ? (re * re + im * im) / d : 0;
}

/* 振幅信息（页面/测试用）：指数、|a|、相位 */
export function qcAmplitudes(s){
  const out = [];
  for (let i = 0; i < s.dim; i++){
    const p = s.re[i] * s.re[i] + s.im[i] * s.im[i];
    if (p < 1e-14) continue;
    out.push({ i, re: s.re[i], im: s.im[i], abs: Math.sqrt(p), phase: Math.atan2(s.im[i], s.re[i]) });
  }
  return out;
}
/* 把指数写成 |q_{n-1}…q_0⟩ 的比特串（显示用：最左 = 最高位） */
export function qcBits(idx, n){
  let s = '';
  for (let k = n - 1; k >= 0; k--) s += ((idx >> k) & 1) ? '1' : '0';
  return s;
}

/* ---------- 预设线路 ---------- */
export const QC_PRESETS = {
  bell: {
    label: '贝尔对',
    n: 2, text: 'H 把 q0 打成叠加，再 CNOT 把 q1 拉过来：**两个振幅，相位锁死**。(|00⟩+|11⟩)/√2 的每一个边缘都是 50/50，但 Z 基测量结果**完全相关**——这就是「局域看是噪声、全局看是完美关联」。走一遍后再点「测量」，看它塌到 00 还是 11。',
    gates: [{ op: 'h', q: 0 }, { op: 'cnot', c: 0, q2: 1 }],
  },
  ghz: {
    label: 'GHZ (4)',
    n: 4, text: 'H + CNOT 链 ⟹ (|0000⟩+|1111⟩)/√2。**任意单比特的约化态都是完全混合**（熵 = ln2），但四体 ZZ 关联 = 1。GHZ 是「纠缠不是两两关联的总和」的最短反例（三体以上才有真正的多体纠缠）。',
    gates: [{ op: 'h', q: 0 }, { op: 'cnot', c: 0, q2: 1 }, { op: 'cnot', c: 0, q2: 2 }, { op: 'cnot', c: 0, q2: 3 }],
  },
  qft: {
    label: 'QFT (4)',
    n: 4, text: '量子傅里叶变换 = H + 受控相位 + 逆序 SWAP：|j⟩ → (1/√N)Σ_k e^{2πijk/N}|k⟩。当输入是**周期态**时输出会在某个动量上集中（相位估计/Shor 的核心）。本条线路逐基态与解析 DFT 矩阵对照到 1e-15（pot75）。',
    gates: [],   /* 真正线路由 qcQftGates(n) 生成 */
  },
  teleport: {
    label: '量子传态',
    n: 3, text: '把 q0 上的未知态**搬到 q2**：Bell 对 + Bell 测量 + 两个经典位前馈。三条硬事实：① 分支内 q2 是纯态 X^m1Z^m0|ψ⟩（未修正时保真度只有 1/2），② 修正后四个分支**都**回到 |ψ⟩（F=1），③ 只看 q2、没有经典位的话拿不到任何信息（分支平均 = I/2）——量子不可克隆与无信号性同时成立。拖 θ/φ 换个待传态，换种子换个分支。',
    gates: [],
  },
  grover: {
    label: 'Grover (2)',
    n: 2, text: '两比特搜索 |11⟩：H⊗H → 标记（CZ）→ 扩散（H X CZ X H）。**一轮就把概率全部搬到 |11⟩**（P=1，精确，不是逼近）——两比特是唯一一轮收敛的尺寸，正好用来看清「振幅放大」的几何：先把目标翻个相位，再围绕平均值反射。',
    gates: [
      { op: 'h', q: 0 }, { op: 'h', q: 1 },
      { op: 'cz', c: 0, q2: 1 },
      { op: 'h', q: 0 }, { op: 'h', q: 1 },
      { op: 'x', q: 0 }, { op: 'x', q: 1 },
      { op: 'cz', c: 0, q2: 1 },
      { op: 'x', q: 0 }, { op: 'x', q: 1 },
      { op: 'h', q: 0 }, { op: 'h', q: 1 },
    ],
  },
};

/* QFT 线路（n 比特）。**次序是实测定的**（穷举 n=2 的八种变体，只有这一族给出
   2.7e-16 的 DFT 符合）：
     从最高位 j=n−1 往下：H(q_j)，再由每个更低位 q_k（k<j）控制一个
     相位门 φ=π/2^{j−k}，最后把比特顺序整体反转（SWAP 对）。
   为什么不是「从低位往上」：那种写法里相位落在还没做过 H 的高位上，控制位此刻
   还是计算基态，相位永远不起作用——n=2 的输出只剩 ±1/√N 的实数符号（本轮踩过）。
   受控相位门 diag(1,1,1,e^{iφ}) 对控制/目标对称，所以 q_j 与 q_k 的角色互换等价。 */
export function qcQftGates(n, inverse = false){
  const g = [];
  for (let j = n - 1; j >= 0; j--){
    g.push({ op: 'h', q: j });
    for (let k = j - 1; k >= 0; k--){
      g.push({ op: 'phase', q: j, c: k, theta: Math.PI / (1 << (j - k)) });
    }
  }
  for (let i = 0; i < (n >> 1); i++) g.push({ op: 'swap', q1: i, q2: n - 1 - i });
  return inverse ? qcInvertGates(g) : g;
}

/* 通用逆线路：逆序 + 每个门取逆（h/x/y/z/swap/cnot/cz/toffoli 自逆；s↔sdg、
   t↔tdg；带参门 θ→−θ）。pot75 用它验证 U†U=I。 */
export function qcInvertGates(gates){
  const dual = { s: 'sdg', sdg: 's', t: 'tdg', tdg: 't' };
  return gates.slice().reverse().map(g => {
    if (g.op === 'phase' || g.op === 'rx' || g.op === 'ry' || g.op === 'rz')
      return { ...g, theta: -(g.theta ?? 0) };
    return { ...g, op: dual[g.op] || g.op };
  });
}

export function qcPresetGates(name, n){
  if (name === 'qft') return qcQftGates(n ?? 4);
  const p = QC_PRESETS[name];
  if (!p) return [];
  if (name === 'ghz' && n && n !== p.n){
    const g = [{ op: 'h', q: 0 }];
    for (let k = 1; k < n; k++) g.push({ op: 'cnot', c: 0, q2: k });
    return g;
  }
  return p.gates.map(x => ({ ...x }));
}

/* ============================================================================
 * 经典寄存器与「测量-前馈」（R76）
 *
 * R75 的线路是纯酉的：门依次作用，末尾才允许测量。真实的协议（传态、纠错、
 * 迭代相位估计）需要**中途测量 + 用结果控制后面的门**。这里补上两件事：
 *   ① qcMeasureQubit：只测一个比特（投影到该位的 0/1 子空间 + 归一化），
 *      不是把整个态塌到一个基态——传态里测 q0/q1 之后 q2 的叠加必须留着；
 *      R100 加 basis='x'/'y'（旋转-测量-旋回），默认 'z' 路径逐位不变；
 *   ② qcExec：把 {op:'measure'}、{op:'cond'} 与普通门统一成「一步」。
 * ========================================================================== */

export function qcNewClassical(nbits){ return new Uint8Array(nbits); }

/* 单比特测量：返回 0/1，就地把态投影到对应子空间并归一化。
 * basis='z'（默认，R76 原路径）：Z 基（计算基）——投影到该位 0/1 子空间。
 * basis='x'/'y'（R100）：**旋转-测量-旋回**——X 基 H·M·H；Y 基 S†H·M·H·S
 *（|+i⟩=S·H|0⟩ ⟹ U=H·S† 把 Y 本征基映到 Z 基）。两条性质保证实现正确：
 *  ① 概率：旋转不改变该位在旋转后基下的边缘分布 ⟹ p(±)=(1±⟨P⟩)/2 精确
 *     （⟨X⟩=2Reρ01、⟨Y⟩=−2Imρ01，ρ 为 qcQubitRho 的约化密度矩阵）；
 *  ② 测后态：旋回把 Z 本征态映回该基本征态（X: |±⟩；Y: |±i⟩），
 *     cbit 0 = +1 本征值、1 = −1 本征值。 */
export function qcMeasureQubit(s, q, rng, basis = 'z'){
  if (basis !== 'z' && basis !== 'x' && basis !== 'y') throw new Error('unknown measure basis ' + basis);
  const pre = basis === 'x' ? ['h'] : basis === 'y' ? ['sdg', 'h'] : [];
  const post = basis === 'x' ? ['h'] : basis === 'y' ? ['h', 's'] : [];
  for (const g of pre) qcApply(s, { op: g, q });
  const bit = qcMeasureZ(s, q, rng);
  for (const g of post) qcApply(s, { op: g, q });
  return bit;
}
/* Z 基测量内核（qcMeasureQubit 的 basis 包装调用它；保持不变导出语义） */
function qcMeasureZ(s, q, rng){
  const bit = 1 << q;
  let p1 = 0;
  for (let i = 0; i < s.dim; i++) if (i & bit) p1 += s.re[i] * s.re[i] + s.im[i] * s.im[i];
  const out = rng() < p1 ? 1 : 0;
  for (let i = 0; i < s.dim; i++){
    const has = (i & bit) ? 1 : 0;
    if (has !== out){ s.re[i] = 0; s.im[i] = 0; }
  }
  qcRenormalize(s);
  return out;
}

/* 执行一步：普通门 / 测量写入经典位 / 条件门。
 * measure 的 basis（'z' 默认 / 'x' / 'y'，R100）透传给 qcMeasureQubit，
 * 并写进执行记录供 UI 标注；未给 basis 的旧调用逐位等价 R76/R99 路径。 */
export function qcExec(s, op, cres, rng){
  if (op.op === 'measure'){
    const bit = qcMeasureQubit(s, op.q, rng, op.basis || 'z');
    if (cres && op.cbit != null) cres[op.cbit] = bit;
    return { kind: 'measure', q: op.q, cbit: op.cbit, bit, basis: op.basis || 'z' };
  }
  if (op.op === 'cond'){
    const on = cres ? !!cres[op.cbit] : false;
    if (on) qcApply(s, op.gate);
    return { kind: 'cond', cbit: op.cbit, on };
  }
  qcApply(s, op);
  return { kind: 'gate' };
}

/* 跑一整段（含测量/条件），返回每步的记录 */
export function qcRunProgram(s, ops, rng, cres = qcNewClassical(8)){
  const rec = [];
  for (const op of ops) rec.push(qcExec(s, op, cres, rng));
  return { cres, rec };
}

/* 任意比特的约化密度矩阵（2×2，复）：ρ[a][b] = Σ_rest ψ(a,rest) ψ*(b,rest) */
export function qcQubitRho(s, q){
  const bit = 1 << q;
  const rr = [[0, 0], [0, 0]], ii = [[0, 0], [0, 0]];
  for (let i = 0; i < s.dim; i++){
    if (i & bit) continue;
    const j = i | bit;
    /* |0⟩⟨0| / |1⟩⟨1| 对角 */
    rr[0][0] += s.re[i] * s.re[i] + s.im[i] * s.im[i];
    rr[1][1] += s.re[j] * s.re[j] + s.im[j] * s.im[j];
    /* 非对角：ψ0 ψ1* = (r0+ii0)(r1−ii1) */
    rr[0][1] += s.re[i] * s.re[j] + s.im[i] * s.im[j];
    ii[0][1] += s.im[i] * s.re[j] - s.re[i] * s.im[j];
  }
  rr[1][0] = rr[0][1];
  ii[1][0] = -ii[0][1];
  return { re: rr, im: ii };
}

/* 纯态 |ψ⟩=α|0⟩+β|1⟩ 与 ρ 的保真度 ⟨ψ|ρ|ψ⟩（α,β 为 [re,im]） */
export function qcRhoFidelity(rho, alpha, beta){
  const a = alpha, b = beta;
  const ac = [a[0], -a[1]], bc = [b[0], -b[1]];
  const mul = (x, y) => [x[0]*y[0] - x[1]*y[1], x[0]*y[1] + x[1]*y[0]];
  const add = (x, y) => [x[0]+y[0], x[1]+y[1]];
  /* v = ρ|ψ⟩: v_a = Σ_b ρ_ab ψ_b */
  let v0 = add(mul([rho.re[0][0], rho.im[0][0]], b), [0, 0]);
  v0 = add([0, 0], mul([rho.re[0][0], rho.im[0][0]], b));
  v0 = add(v0, mul([rho.re[0][1], rho.im[0][1]], [0, 0]));
  /* 上面写复杂了，直接逐项算 */
  v0 = add(mul([rho.re[0][0], rho.im[0][0]], a), mul([rho.re[0][1], rho.im[0][1]], b));
  const v1 = add(mul([rho.re[1][0], rho.im[1][0]], a), mul([rho.re[1][1], rho.im[1][1]], b));
  const val = add(mul(ac, v0), mul(bc, v1));
  return val[0];
}

/* 单比特态制备：Ry(θ) 再 Rz(φ) ⟹ cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩ */
export function qcPrep1q(theta, phi, q = 0){
  return [{ op: 'ry', q, theta }, { op: 'rz', q, theta: phi }];
}

/* |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩ 的振幅（测试/显示用） */
export function qcTargetAmps(theta, phi){
  return { alpha: [Math.cos(theta / 2), 0], beta: [Math.sin(theta / 2) * Math.cos(phi), Math.sin(theta / 2) * Math.sin(phi)] };
}

/* 传态线路：q0 载待传态，q1/q2 为 Bell 对，Bell 测量后按 m0→Z、m1→X 修正 q2。
   经典位：cbit 0 = m0（q0 的 H 之后测量），cbit 1 = m1（q1 测量）。 */
export function qcTeleportGates(theta = 1.0, phi = 0.4, withFix = true){
  const g = [];
  /* ① 制备待传态到 q0 */
  g.push(...qcPrep1q(theta, phi, 0));
  /* ② Bell 对 (q1,q2) */
  g.push({ op: 'h', q: 1 }, { op: 'cnot', c: 1, q2: 2 });
  /* ③ Bell 测量 */
  g.push({ op: 'cnot', c: 0, q2: 1 }, { op: 'h', q: 0 });
  g.push({ op: 'measure', q: 0, cbit: 0 });
  g.push({ op: 'measure', q: 1, cbit: 1 });
  /* ④ 经典前馈 */
  if (withFix){
    g.push({ op: 'cond', cbit: 1, gate: { op: 'x', q: 2 } });
    g.push({ op: 'cond', cbit: 0, gate: { op: 'z', q: 2 } });
  }
  return g;
}
