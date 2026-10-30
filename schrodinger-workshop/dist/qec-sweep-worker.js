/*! 薛定谔工场 · 单文件分发版（qec-sweep-worker.js）— 由 scripts/build-standalone.mjs 自动生成，请勿手改。
    源码工程（ES 模块，课程站组件化用）：src/qec/sweep-worker.js
    模块拼接序（拓扑序，依赖在前）：
      src/physics/qcircuit.js
      src/physics/noise.js
      src/physics/gatenoise.js
      src/physics/qcnoise.js
      src/physics/qec.js
      src/qec/sweep-worker.js
*/

/* ===== src/physics/qcircuit.js ===== */
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
 *      （R102：任意子系统经 `qcPermuteBits` 迁到本约定后复用，见其注释；
 *        R103：联合测量同理——纠缠联合基经制备线路逆序迁到计算基后测 Z。）
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

const QC_UNARY = {
  h: { label: 'H', m: [cx(S2, 0), cx(S2, 0), cx(S2, 0), cx(-S2, 0)] },
  x: { label: 'X', m: [C0, C1, C1, C0] },
  y: { label: 'Y', m: [C0, cx(0, -1), cx(0, 1), C0] },
  z: { label: 'Z', m: [C1, C0, C0, cx(-1, 0)] },
  s: { label: 'S', m: [C1, C0, C0, CI] },
  sdg: { label: 'S†', m: [C1, C0, C0, cx(0, -1)] },
  t: { label: 'T', m: [C1, C0, C0, cx(Math.SQRT1_2, Math.SQRT1_2)] },
  tdg: { label: 'T†', m: [C1, C0, C0, cx(Math.SQRT1_2, -Math.SQRT1_2)] },
};

/* 标准 U3(θ,φ,λ)：覆盖任意单比特酉门（忽略不可观测的整体相位）。 */
function qcU3(theta = 0, phi = 0, lambda = 0){
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  return [
    cx(c, 0),
    cx(-Math.cos(lambda) * s, -Math.sin(lambda) * s),
    cx(Math.cos(phi) * s, Math.sin(phi) * s),
    cx(Math.cos(phi + lambda) * c, Math.sin(phi + lambda) * c),
  ];
}

function qcRotation(op, theta){
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  if (op === 'rx') return [cx(c, 0), cx(0, -s), cx(0, -s), cx(c, 0)];
  if (op === 'ry') return [cx(c, 0), cx(-s, 0), cx(s, 0), cx(c, 0)];
  if (op === 'rz') return [cx(Math.cos(theta / 2), -Math.sin(theta / 2)), C0, C0,
                           cx(Math.cos(theta / 2), Math.sin(theta / 2))];
  throw new Error('unknown rotation ' + op);
}

/* ---------- 态 ---------- */
function qcNewState(n){
  const dim = 1 << n;
  const s = { n, dim, re: new Float64Array(dim), im: new Float64Array(dim) };
  s.re[0] = 1;
  return s;
}
/* 基态 |j⟩（qcNewState 默认给 |0⟩；测试与页面都需要任意基态，别手写 re[j]=1
   ——那会和已有的 re[0]=1 叠加成两个基态的相干和，是本轮踩过的坑）。 */
function qcBasis(n, j){
  const dim = 1 << n;
  const s = { n, dim, re: new Float64Array(dim), im: new Float64Array(dim) };
  s.re[j & (dim - 1)] = 1;
  return s;
}
function qcClone(s){
  return { n: s.n, dim: s.dim, re: Float64Array.from(s.re), im: Float64Array.from(s.im) };
}
function qcNorm(s){
  let a = 0;
  for (let i = 0; i < s.dim; i++) a += s.re[i] * s.re[i] + s.im[i] * s.im[i];
  return a;
}
function qcProbs(s){
  const p = new Float64Array(s.dim);
  for (let i = 0; i < s.dim; i++) p[i] = s.re[i] * s.re[i] + s.im[i] * s.im[i];
  return p;
}
/* 归一化（测量后、数值漂移后） */
function qcRenormalize(s){
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
function qcApply(s, g){
  const op = g.op;
  if (op === 'cnot'){ applyControlled(s, QC_UNARY.x.m, g.t ?? g.q2, [g.c ?? g.q1]); return s; }
  if (op === 'cz'){ applyControlled(s, QC_UNARY.z.m, g.t ?? g.q2, [g.c ?? g.q1]); return s; }
  if (op === 'swap'){ applySwap(s, g.q1, g.q2); return s; }
  if (op === 'toffoli'){
    applyControlled(s, QC_UNARY.x.m, g.q3, [g.q1, g.q2]); return s;
  }
  if (op === 'u3'){
    const m = qcU3(g.theta ?? 0, g.phi ?? 0, g.lambda ?? 0);
    if (g.c != null) applyControlled(s, m, g.q, [g.c]);
    else applyMatrix(s, m, g.q);
    return s;
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
function qcApplyAll(s, gates){ for (const g of gates) qcApply(s, g); return s; }

/* 稠密矩阵（测试用，n ≤ 3）：把线路作用到每个基矢上拼成列 */
function qcProgramMatrix(n, gates){
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
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* 按 |a|² 抽样一个指数 */
function qcSample(s, rng){
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
function qcCollapse(s, idx){
  for (let i = 0; i < s.dim; i++){ if (i !== idx){ s.re[i] = 0; s.im[i] = 0; } }
  qcRenormalize(s);
  return s;
}
/* 单比特边缘：p0 = P(该位=0) */
function qcMarginal(s, q){
  const bit = 1 << q;
  let p1 = 0;
  for (let i = 0; i < s.dim; i++) if (i & bit) p1 += s.re[i] * s.re[i] + s.im[i] * s.im[i];
  return { p0: 1 - p1, p1, z: 1 - 2 * p1 };
}
/* 两体 ZZ 关联 ⟨Z_a Z_b⟩（实；Z 对角） */
function qcZZ(s, a, b){
  const ba = 1 << a, bb = 1 << b;
  let v = 0;
  for (let i = 0; i < s.dim; i++){
    const sa = (i & ba) ? -1 : 1, sb = (i & bb) ? -1 : 1;
    v += sa * sb * (s.re[i] * s.re[i] + s.im[i] * s.im[i]);
  }
  return v;
}
function qcPauliCorr(s, a, pa, b, pb){
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
function qcExpect(s, xm, zm){
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
     x/y/z 门：就地 toggle。ry/rz/rx/phase/U3 在非零帧上出现即抛错（一般为非 Clifford，
     帧语义未定义——flagsynd 与 qec 的制备段都保证帧为零时才过旋转门）。 */
function qcFrToggle(fr, q, t){
  const b = 1 << q;
  if (t === 'x' || t === 'y') fr.x ^= b;
  if (t === 'z' || t === 'y') fr.z ^= b;
}
function qcFrGate(fr, o){
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
  if (op === 'ry' || op === 'rz' || op === 'rx' || op === 'phase' || op === 'u3'){
    if (fr.x || fr.z) throw new Error('frame: 非 Clifford 门在非零帧上出现 ' + op);
  }
}

/* ---------- 纠缠 ---------- */
/* 约化密度矩阵 ρ_A（A = 低 kA 位）的特征值：Gram 矩阵 ρ[i][j]=Σ_e ψ(i,e)ψ*(j,e)，
   用实嵌入 [[Re,−Im],[Im,Re]] 的 Jacobi（本征值各二重，排序后隔一取、不折半，
   与 R73 熵的修法同一坑）。 */
/* 实对称矩阵的 Jacobi 本征求解（就地修改 A，返回 {val, vec}）。
   R104 起导出：qcnoise.js 的密度矩阵谱（部分求迹熵、Wootters concurrence）
   复用同一求解器——单源真值原则，不复制第二份 Jacobi。 */
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

function qcReducedRho(s, kA){
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

function qcEntropy(s, kA){
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

/* R102：按 mask 重排态矢比特——mask 中的位（升序、保持相对次序）移到低位，
   其余位（升序）移到高位。比特置换是索引的精确重排（O(dim·n) 查表，无数值
   误差），使任意子系统的约化密度矩阵可复用 qcReducedRho 的低位约定——
   这是 README「q0 是最低位唯一坐标约定」的受控迁移，不引入第二套位序。 */
function qcPermuteBits(s, mask){
  const n = s.n;
  const keep = [], rest = [];
  for (let k = 0; k < n; k++) ((mask >> k) & 1 ? keep : rest).push(k);
  const kA = keep.length;
  const out = { n, dim: s.dim, re: new Float64Array(s.dim), im: new Float64Array(s.dim) };
  for (let t = 0; t < s.dim; t++){
    let lo = 0, hi = 0;
    for (let b = 0; b < kA; b++) if ((t >> keep[b]) & 1) lo |= 1 << b;
    for (let b = 0; b < rest.length; b++) if ((t >> rest[b]) & 1) hi |= 1 << b;
    const u = (hi << kA) | lo;
    out.re[u] = s.re[t]; out.im[u] = s.im[t];
  }
  return out;
}

/* R102：任意子系统熵——mask 的位构成子系统 A，互补位 traced out（诚实限制 ⑥：
   此前只有低 k_A 位，取任意子系统须先搭 SWAP）。纯态恒等式 S(A)=S(Ā) 是
   pot102 E 节的判据；mask=0 ⟹ S=0（平凡子系统）；mask=全 ⟹ S=0（纯态）。
   返回附带 mask/bits 供 UI 标注。 */
function qcEntropySubset(s, mask){
  const n = s.n;
  const m = mask & ((1 << n) - 1);
  const bits = [];
  for (let k = 0; k < n; k++) if ((m >> k) & 1) bits.push(k);
  const r = qcEntropy(qcPermuteBits(s, m), bits.length);
  return { ...r, mask: m, bits };
}

/* 两比特 concurrence（n=2，A 取 q0）：C = 2|a00 a11 − a01 a10| */
function qcConcurrence(s){
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
function qcFidelity(s, t){
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
function qcAmplitudes(s){
  const out = [];
  for (let i = 0; i < s.dim; i++){
    const p = s.re[i] * s.re[i] + s.im[i] * s.im[i];
    if (p < 1e-14) continue;
    out.push({ i, re: s.re[i], im: s.im[i], abs: Math.sqrt(p), phase: Math.atan2(s.im[i], s.re[i]) });
  }
  return out;
}
/* 把指数写成 |q_{n-1}…q_0⟩ 的比特串（显示用：最左 = 最高位） */
function qcBits(idx, n){
  let s = '';
  for (let k = n - 1; k >= 0; k--) s += ((idx >> k) & 1) ? '1' : '0';
  return s;
}

/* ---------- 预设线路 ---------- */
const QC_PRESETS = {
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
function qcQftGates(n, inverse = false){
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
function qcInvertGates(gates){
  const dual = { s: 'sdg', sdg: 's', t: 'tdg', tdg: 't' };
  return gates.slice().reverse().map(g => {
    if (g.op === 'phase' || g.op === 'rx' || g.op === 'ry' || g.op === 'rz')
      return { ...g, theta: -(g.theta ?? 0) };
    if (g.op === 'u3') return { ...g, theta: -(g.theta ?? 0), phi: -(g.lambda ?? 0), lambda: -(g.phi ?? 0) };
    return { ...g, op: dual[g.op] || g.op };
  });
}

function qcPresetGates(name, n){
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

function qcNewClassical(nbits){ return new Uint8Array(nbits); }

/* 单比特测量：返回 0/1，就地把态投影到对应子空间并归一化。
 * basis='z'（默认，R76 原路径）：Z 基（计算基）——投影到该位 0/1 子空间。
 * basis='x'/'y'（R100）：**旋转-测量-旋回**——X 基 H·M·H；Y 基 S†H·M·H·S
 *（|+i⟩=S·H|0⟩ ⟹ U=H·S† 把 Y 本征基映到 Z 基）。两条性质保证实现正确：
 *  ① 概率：旋转不改变该位在旋转后基下的边缘分布 ⟹ p(±)=(1±⟨P⟩)/2 精确
 *     （⟨X⟩=2Reρ01、⟨Y⟩=−2Imρ01，ρ 为 qcQubitRho 的约化密度矩阵）；
 *  ② 测后态：旋回把 Z 本征态映回该基本征态（X: |±⟩；Y: |±i⟩），
 *     cbit 0 = +1 本征值、1 = −1 本征值。 */
function qcMeasureQubit(s, q, rng, basis = 'z'){
  if (basis !== 'z' && basis !== 'x' && basis !== 'y') throw new Error('unknown measure basis ' + basis);
  if (!Number.isInteger(q) || q < 0 || q >= s.n) throw new Error('measure qubit out of range: ' + q);   /* R106：与联合测量同口径（此前单比特测量静默接受越界 q，返回恒 0 的假测量） */
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

/* ---------- 联合测量（R103）：k 个比特在纠缠联合基下一次性测量 ----------
 * 动机：单比特测量的**乘积基**（如 X⊗Y）投影算符可因子分解 ⟹ 已可由 k 次单测量
 * 顺序表达（qcMeasureQubit ×k，投影算符互交换）。但 Bell/GHZ 这类**纠缠联合基**
 * 的投影算符不可因子分解——必须一次性联合测量，无法拆成逐比特测量。
 * 实现 = R100「旋转-测量-旋回」的 k 比特版：
 *   ① 作用制备线路 P 的逆（P†；P 全部由自伴门 H/CNOT 构成 ⟹ P† = 逆序），
 *      把联合基 {P|j⟩} 旋到计算基；
 *   ② 对每个比特做 Z 基测量——Z 投影算符互交换 ⟹ 顺序测 k 次 ≡ 联合 Z 测量，
 *      联合分布与测后态都与一次联合测量相同；
 *   ③ 逆序作用 P 旋回，测后态 = P|j⟩_A ⊗ |rest_j⟩（rest 已被投影）。
 * 经典位： outcomes[i]（qubits[i] 的结果）写 cbit+i——Bell 写 2 位、GHZ 写 3 位，
 * cond 前馈按单位读取即可（传态协议：X^{m1}Z^{m0} 仍成立，见 pot103 E）。
 * 标签约定：outcomes = qubits 顺序的比特串；Bell 基 P|00⟩=|Φ+⟩、P|01⟩=|Ψ+⟩、
 * P|10⟩=|Φ−⟩、P|11⟩=|Ψ−⟩（H(q_a)·CNOT(q_a→q_b)，与 bell 预设同款制备线路）。 */
/* R104 起导出：qcnoise.js 的密度矩阵联合测量复用同一张制备线路表（单源） */
const QC_JOINT_PREP = {
  /* 值 = 制备线路 P（把 |j⟩ 送到联合基态；顺序即门序） */
  bell: qs => [{ op: 'h', q: qs[0] }, { op: 'cnot', c: qs[0], q2: qs[1] }],
  ghz: qs => [{ op: 'h', q: qs[0] }, { op: 'cnot', c: qs[0], q2: qs[1] }, { op: 'cnot', c: qs[0], q2: qs[2] }],
};
function qcJointK(basis){
  const p = QC_JOINT_PREP[basis];
  if (!p) throw new Error('unknown joint measure basis ' + basis);
  return p([0, 1, 2]).length;   /* 用占位位跑一遍数门数 ⟺ 联合基的比特数 */
}
function qcMeasureJoint(s, qubits, rng, basis = 'bell'){
  const P = QC_JOINT_PREP[basis];
  if (!P) throw new Error('unknown joint measure basis ' + basis);
  const k = qcJointK(basis);
  if (!Array.isArray(qubits) || qubits.length !== k) throw new Error('joint measure ' + basis + ' needs ' + k + ' qubits');
  const seen = new Set();
  for (const q of qubits){
    if (!Number.isInteger(q) || q < 0 || q >= s.n) throw new Error('joint measure qubit out of range: ' + q);
    if (seen.has(q)) throw new Error('joint measure qubits must be distinct: ' + qubits.join(','));
    seen.add(q);
  }
  const prep = P(qubits);
  const outcomes = [];
  for (const g of [...prep].reverse()) qcApply(s, g);      /* P†（自伴门 ⟹ 逆序） */
  for (const q of qubits) outcomes.push(qcMeasureZ(s, q, rng));
  for (const g of prep) qcApply(s, g);                      /* P 旋回 */
  return outcomes;
}

/* 执行一步：普通门 / 测量写入经典位 / 条件门。
 * measure 两种形状（R103）：
 *   单比特 {op:'measure', q, cbit, basis}——basis 'z'/'x'/'y'（R100）；
 *   联合   {op:'measure', qubits:[...], cbit, basis:'bell'|'ghz'}——一次测 k 个
 *   比特（qcMeasureJoint），outcomes[i] 写 cbit+i（k 个连续经典位）。
 * 未给 basis 的旧调用逐位等价 R76/R99 路径。 */
function qcExec(s, op, cres, rng){
  if (op.op === 'measure'){
    if (op.qubits){
      const bits = qcMeasureJoint(s, op.qubits, rng, op.basis || 'bell');
      if (cres && op.cbit != null) for (let i = 0; i < bits.length; i++) cres[op.cbit + i] = bits[i];
      return { kind: 'measure', qubits: op.qubits.slice(), cbit: op.cbit, bits, basis: op.basis || 'bell', joint: true };
    }
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
function qcRunProgram(s, ops, rng, cres = qcNewClassical(8)){
  const rec = [];
  for (const op of ops) rec.push(qcExec(s, op, cres, rng));
  return { cres, rec };
}

/* 任意比特的约化密度矩阵（2×2，复）：ρ[a][b] = Σ_rest ψ(a,rest) ψ*(b,rest) */
function qcQubitRho(s, q){
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
function qcRhoFidelity(rho, alpha, beta){
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
function qcPrep1q(theta, phi, q = 0){
  return [{ op: 'ry', q, theta }, { op: 'rz', q, theta: phi }];
}

/* |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩ 的振幅（测试/显示用） */
function qcTargetAmps(theta, phi){
  return { alpha: [Math.cos(theta / 2), 0], beta: [Math.sin(theta / 2) * Math.cos(phi), Math.sin(theta / 2) * Math.sin(phi)] };
}

/* 传态线路：q0 载待传态，q1/q2 为 Bell 对，Bell 测量后按 m0→Z、m1→X 修正 q2。
   经典位：cbit 0 = m0（q0 的 H 之后测量），cbit 1 = m1（q1 测量）。 */
function qcTeleportGates(theta = 1.0, phi = 0.4, withFix = true){
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

/* ===== src/physics/noise.js ===== */
/* ============================================================================
 * noise.js — R77 开放量子系统：密度矩阵 / Kraus 通道 / 量子轨迹 / T₁ T₂
 *
 * 前几轮的量子态都是**纯态**（|ψ⟩，2^n 个复数）。真实器件不是：与环境的耦合把
 * 纯态变成混合态，必须用密度矩阵 ρ（2^n × 2^n 厄米、半正定、tr=1）。
 *
 * 三个通道（全部是**精确解**，不是一阶近似——Kraus 形式对任意大的参数都成立）：
 *   振幅阻尼（T₁ 弛豫，能量泄漏）  γ = 1−e^{−t/T₁}
 *     E₀ = diag(1, √(1−γ)),  E₁ = [[0,√γ],[0,0]]
 *   相位阻尼（T₂ 纯退相位，只毁相干）λ = 1−e^{−t/T₂}
 *     随机相位实现：E₀ = √(1−λ/2)·I,  E₁ = √(λ/2)·Z
 *     （等价于 E₀=diag(1,√(1−λ)), E₁=diag(0,√λ)，但「以 λ/2 概率翻相对相位」
 *       更贴 R69 的物理图像，也让量子轨迹看出「哪一步跳了」）
 *   退极化（各向同性收缩）          p = 1−e^{−t/T_dep}
 *     E₀=√(1−3p/4)I, E₁=√(p/4)X, E₂=√(p/4)Y, E₃=√(p/4)Z  ⟹ Bloch 向量 ×(1−p)
 *
 * 单比特闭式（θ,φ 初态）：
 *   relax  : x,y = sinθ(cosφ,sinφ)·e^{−t/2T₁},  z = cosθ·e^{−t/T₁} + (1−e^{−t/T₁})
 *            ⟹ **T₂ ≤ 2T₁ 的物理来源**：纯 T₁ 极限下横向衰减率恰为 1/(2T₁)
 *   dephase: x,y × e^{−t/T₂},  z 不变
 *   depolar: x,y,z × e^{−t/T_dep}
 *
 * 两比特（Bell |Φ⁺⟩）的 concurrence 本页全用 **X 态闭式**：所有上述通道都不改变
 * 布居结构 ⟹ ρ 恒为 X 形，C = 2·max(0, |ρ₀₃|−√(ρ₁₁ρ₂₂), |ρ₁₂|−√(ρ₀₀ρ₃₃)) 精确。
 *   双侧相位阻尼 C = e^{−2t/T₂}；单侧 C = e^{−t/T₂}
 *   双侧退极化 C = max(0, [3(1−p)²−1]/2) ⟹ **纠缠猝死**（ESD）于 (1−p)²=1/3
 *   单侧退极化 C = max(0, 1−3p/2)                   ⟹ ESD 于 p=2/3
 * ========================================================================== */

const NZ_DEFAULTS = {
  kind: 'relax',                 /* 噪声类型：relax | dephase | depolar */
  n: 1,                          /* 比特数（1 = 单比特 Bloch；2 = Bell 纠缠） */
  tau: 1.0,                      /* 当前通道的时间常数（显示为 T₁ / T₂ / T_dep） */
  theta: Math.PI / 2, phi: 0,    /* 单比特初态 |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩ */
  dt: 0.01, steps: 400,
  side: 'both',                  /* bell: both | q0 */
  nTraj: 240, seed: 7,
};

const NZ_PRESETS = {
  relax: {
    label: 'T₁ 弛豫', kind: 'relax', tau: 1.2, theta: Math.PI / 2, phi: 0, steps: 400,
    text: '能量弛豫：|1⟩ 会**自发衰变**到 |0⟩（放出量子给环境）。从 |+⟩ 出发，Bloch 向量不沿直线走——它沿一条**弧线**回到北极：横向分量按 e^{−t/2T₁} 衰减、纵向分量按 1−e^{−t/T₁} 长起来。这条弧线就是 **T₂ ≤ 2T₁** 的来源：即使没有额外退相位，T₁ 本身也把相干时间压到 2T₁。轨迹模式下能看到**量子跳跃**：某一条轨迹突然从赤道跳到北极，而平均才是指数曲线。',
  },
  dephase: {
    label: 'T₂ 退相位', kind: 'dephase', tau: 1.0, theta: Math.PI / 2.6, phi: 0.9, steps: 400,
    text: '纯退相位：**不动布居、只毁相干**。Bloch 向量横向分量按 e^{−t/T₂} 缩到 0、纵向分量一动不动——最终落在 z 轴上（还是纯态？不是：是经典混合态 (p₀,p₁)，纯度 tr ρ² 从 1 掉到 p₀²+p₁²）。这就是 R69 那条连续场退相干通道的单比特版本：R69 每帧给每个格点乘 e^{iφ}(φ~N(0,γ_φdt))，条纹对比度按 e^{−γ_φt} 衰减 ⟹ **1/T₂ = γ_φ** 是同一个时间常数。',
  },
  depolar: {
    label: '退极化', kind: 'depolar', tau: 1.0, theta: Math.PI / 2, phi: 0, steps: 400,
    text: '各向同性退化：Bloch 向量沿直线缩向原点（×e^{−t/T_dep}），三个分量等比例衰减——没有「优先方向」，这是「错误完全随机」的模型。完全退极化后 ρ=I/2：哪一维都不剩。注意它和 T₂ 的区别：退相位是向 z 轴收缩（z 保留），退极化是向原点收缩（z 也丢）。',
  },
  bell: {
    label: 'Bell 纠缠退化', kind: 'dephase', n: 2, tau: 0.9, side: 'both', steps: 400,
    text: '两比特 |Φ⁺⟩ 的纠缠。相位阻尼双侧 **C=e^{−2t/T₂}**（指数趋 0，永不突消）；退极化双侧 **C=max(0,[3(1−p)²−1]/2)**，在 (1−p)²=1/3 处**突然归零** = 纠缠猝死（ESD）：局域噪声下纠缠会消失得比渐近衰减更彻底。本页通道都保 X 形，故闭式精确。',
  },
};

/* ---------- 复数小工具：2×2 矩阵用行主序 [a,b,c,d]，re/im 各一数组 ---------- */
const k2 = (a, b, c, d) => ({ re: [a[0], b[0], c[0], d[0]], im: [a[1], b[1], c[1], d[1]] });
const NZ_C0 = [0, 0];
const NZ_C1 = [1, 0];

/* ---------- 密度矩阵 ---------- */
function nzRho(n){
  const dim = 1 << n;
  const r = { n, dim, re: new Float64Array(dim * dim), im: new Float64Array(dim * dim) };
  r.re[0] = 1;
  return r;
}

/* 由纯态 |ψ⟩ 构造 ρ=|ψ⟩⟨ψ|（纯态用 qcNewState 的 {n,dim,re,im} 结构） */
function nzRhoFromPure(n, re, im){
  const dim = 1 << n;
  const r = { n, dim, re: new Float64Array(dim * dim), im: new Float64Array(dim * dim) };
  for (let i = 0; i < dim; i++){
    for (let j = 0; j < dim; j++){
      /* ψ_i ψ_j* */
      r.re[i * dim + j] = re[i] * re[j] + im[i] * im[j];
      r.im[i * dim + j] = im[i] * re[j] - re[i] * im[j];
    }
  }
  return r;
}

/* 单比特态 |ψ(θ,φ)⟩ 的密度矩阵 */
function nzRhoQubit(theta, phi){
  const dim = 2;
  const r = { n: 1, dim, re: new Float64Array(4), im: new Float64Array(4) };
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  r.re[0] = c * c; r.re[3] = s * s;
  r.re[1] = c * s * Math.cos(phi); r.im[1] = -c * s * Math.sin(phi);
  r.re[2] = r.re[1]; r.im[2] = -r.im[1];
  return r;
}

function nzCopy(rho, out = null){
  const o = out || { n: rho.n, dim: rho.dim, re: new Float64Array(rho.re.length), im: new Float64Array(rho.im.length) };
  o.re.set(rho.re); o.im.set(rho.im); o.n = rho.n; o.dim = rho.dim;
  return o;
}

function nzTrace(rho){
  const D = rho.dim;
  let tr = 0, ti = 0;
  for (let i = 0; i < D; i++){ tr += rho.re[i * D + i]; ti += rho.im[i * D + i]; }
  return { re: tr, im: ti };
}

/* 纯度 tr ρ²（=1 纯态，=1/dim 全混合） */
function nzPurity(rho){
  const D = rho.dim;
  let s = 0;
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++){
    /* (ρ²)_ii = Σ_j ρ_ij ρ_ji 的实部；ρ 厄米 ⟹ ρ_ji = ρ_ij* ⟹ 该项 = |ρ_ij|² */
    const a = rho.re[i * D + j], b = rho.im[i * D + j];
    s += a * a + b * b;
  }
  return s;
}

/* ---------- Kraus 通道 ---------- */
function nzAmpDampKraus(gamma){
  const g = Math.min(1, Math.max(0, gamma)), s = Math.sqrt(1 - g), r = Math.sqrt(g);
  return [k2(NZ_C1, NZ_C0, NZ_C0, [s, 0]), k2(NZ_C0, [r, 0], NZ_C0, NZ_C0)];
}
function nzPhaseDampKraus(lambda){
  const l = Math.min(1, Math.max(0, lambda));
  const a = Math.sqrt(1 - l / 2), b = Math.sqrt(l / 2);
  return [k2([a, 0], NZ_C0, NZ_C0, [a, 0]), k2([b, 0], NZ_C0, NZ_C0, [-b, 0])];
}
function nzDepolarKraus(p){
  const q = Math.min(1, Math.max(0, p));
  const a = Math.sqrt(Math.max(0, 1 - 3 * q / 4)), b = Math.sqrt(q / 4);
  return [
    k2([a, 0], NZ_C0, NZ_C0, [a, 0]),
    k2(NZ_C0, [b, 0], [b, 0], NZ_C0),                    /* X */
    k2(NZ_C0, [0, -b], [0, b], NZ_C0),                   /* Y */
    k2([b, 0], NZ_C0, NZ_C0, [-b, 0]),                   /* Z */
  ];
}

/* ρ' = Σ_k E_k ρ E_k†，只作用在比特 q 上（其余比特的位保持不变） */
function nzApplyKraus(rho, q, E, out){
  const D = rho.dim, bit = 1 << q;
  const oRe = out.re, oIm = out.im;
  oRe.fill(0); oIm.fill(0);
  const K = E.length;
  for (let i = 0; i < D; i++){
    const iq = (i & bit) ? 1 : 0, i0 = i & ~bit;
    for (let j = 0; j < D; j++){
      const jq = (j & bit) ? 1 : 0, j0 = j & ~bit;
      let sr = 0, si = 0;
      for (let k = 0; k < K; k++){
        const ek = E[k];
        for (let a = 0; a < 2; a++){
          const ia = a ? (i0 | bit) : i0;
          const e1r = ek.re[iq * 2 + a], e1i = ek.im[iq * 2 + a];
          if (e1r === 0 && e1i === 0) continue;
          for (let b = 0; b < 2; b++){
            const jb = b ? (j0 | bit) : j0;
            const e2r = ek.re[jq * 2 + b], e2i = ek.im[jq * 2 + b];
            const pr = rho.re[ia * D + jb], pi = rho.im[ia * D + jb];
            if (pr === 0 && pi === 0) continue;
            const tr = e1r * pr - e1i * pi, ti = e1r * pi + e1i * pr;
            sr += tr * e2r + ti * e2i;              /* × conj(e2) */
            si += ti * e2r - tr * e2i;
          }
        }
      }
      oRe[i * D + j] = sr; oIm[i * D + j] = si;
    }
  }
  return out;
}

function nzKrausOf(kind, param){
  if (kind === 'relax') return nzAmpDampKraus(param);
  if (kind === 'dephase') return nzPhaseDampKraus(param);
  if (kind === 'depolar') return nzDepolarKraus(param);
  return null;
}

/* 对每个比特施加同一通道（页面 Bell 预设的「双侧噪声」） */
function nzApplyAll(rho, kind, param, out){
  const D = rho.dim, len = rho.re.length, E = nzKrausOf(kind, param);
  const dst = out || { n: rho.n, dim: D, re: new Float64Array(len), im: new Float64Array(len) };
  const a = { n: rho.n, dim: D, re: rho.re, im: rho.im };
  const b = { n: rho.n, dim: D, re: new Float64Array(len), im: new Float64Array(len) };
  let src = a, tmp = b;
  for (let q = 0; q < rho.n; q++){
    nzApplyKraus(src, q, E, tmp);
    const t = src; src = tmp; tmp = t;
  }
  /* 结果可能落在 a 或 b；统一拷回 dst（dst 与 a 同数组时自赋值无害） */
  dst.re.set(src.re); dst.im.set(src.im);
  return dst;
}

/* ---------- 测量量 ---------- */
function nzBloch(rho, q){
  const D = rho.dim, bit = 1 << q;
  let r00 = 0, r11 = 0, o1r = 0, o1i = 0;
  for (let i = 0; i < D; i++){
    if (i & bit){ r11 += rho.re[i * D + i]; continue; }
    r00 += rho.re[i * D + i];
    const j = i | bit;
    o1r += rho.re[i * D + j]; o1i += rho.im[i * D + j];
  }
  const x = 2 * o1r, y = -2 * o1i, z = r00 - r11;
  return { x, y, z, r: Math.hypot(x, y, z), p0: r00, p1: r11 };
}

/* X 形判定（本页所有通道都保持 X 形 ⟹ concurrence 闭式精确） */
function nzXInfo(rho){
  if (rho.n !== 2) return { xform: false, offmax: NaN };
  const D = 4;
  const off = [rho.re[0 * D + 1], rho.re[0 * D + 2], rho.re[1 * D + 3], rho.re[2 * D + 3],
               rho.im[0 * D + 1], rho.im[0 * D + 2], rho.im[1 * D + 3], rho.im[2 * D + 3]];
  let m = 0;
  for (const v of off) m = Math.max(m, Math.abs(v));
  return { xform: m < 1e-12, offmax: m };
}

function nzConcurrence(rho){
  if (rho.n !== 2) return { C: NaN, xform: false };
  const D = 4;
  const a = rho.re[0], b = rho.re[1 * D + 1], c = rho.re[2 * D + 2], d = rho.re[3 * D + 3];
  const w = Math.hypot(rho.re[3], rho.im[3]);          /* ρ03 */
  const z = Math.hypot(rho.re[1 * D + 2], rho.im[1 * D + 2]); /* ρ12 */
  const C = 2 * Math.max(0, w - Math.sqrt(Math.max(0, b * c)), z - Math.sqrt(Math.max(0, a * d)));
  return { C, ...nzXInfo(rho) };
}

/* 两比特保真度（对 Bell）⟨Φ⁺|ρ|Φ⁺⟩ */
function nzBellFidelity(rho){
  if (rho.n !== 2) return NaN;
  const D = 4;
  /* |Φ⁺⟩ = (|00⟩+|11⟩)/√2 ⟹ F = (ρ00,00 + ρ00,11 + ρ11,00 + ρ11,11)/2 */
  return (rho.re[0] + rho.re[3] + rho.re[3 * D] + rho.re[3 * D + 3]) / 2;
}


/* ---------- 两比特 Pauli 关联 ⟨σa ⊗ σb⟩（a,b ∈ 'x'|'y'|'z'） ----------
   这是**可测量**的纠缠判据：Bell |Φ⁺⟩ 给 ⟨XX⟩=⟨ZZ⟩=+1、⟨YY⟩=−1；任何局域噪声都会
   让三条一起缩。与 concurrence 的区别：C 是导出量（需态层析后重构），关联是直接
   测量量（三组基下各测一次即可）。 */
const PAULI_RE = { x: [0, 1, 1, 0], y: [0, 0, 0, 0], z: [1, 0, 0, -1] };
const PAULI_IM = { x: [0, 0, 0, 0], y: [0, -1, 1, 0], z: [0, 0, 0, 0] };

function nzPauliCorr2(rho, a, b){
  if (rho.n !== 2) return NaN;
  const D = 4;
  const Ar = PAULI_RE[a], Ai = PAULI_IM[a], Br = PAULI_RE[b], Bi = PAULI_IM[b];
  let sr = 0;
  for (let i0 = 0; i0 < 2; i0++) for (let i1 = 0; i1 < 2; i1++)
    for (let j0 = 0; j0 < 2; j0++) for (let j1 = 0; j1 < 2; j1++){
      const i = i0 | (i1 << 1), j = j0 | (j1 << 1);
      /* (A⊗B)_{ji} = A[j0][i0]·B[j1][i1] */
      const ar = Ar[j0 * 2 + i0], ai = Ai[j0 * 2 + i0];
      const br = Br[j1 * 2 + i1], bi = Bi[j1 * 2 + i1];
      const mr = ar * br - ai * bi, mi = ar * bi + ai * br;
      const pr = rho.re[i * D + j], pi = rho.im[i * D + j];
      sr += pr * mr - pi * mi;
    }
  return sr;
}

/* ---------- 时间扫描（页面曲线 + pot77 对照共用一条实现） ---------- */
/* 通道参数：把时间常数换成「一步的增量」。三个通道都取增量 = 1−e^{−dt/τ}，
   于是 t 步后总参数 = 1−e^{−t/τ}（半群性质），Bloch/相干因子是严格的指数。 */
function nzStepParam(kind, tau, dt){
  const x = Math.exp(-dt / Math.max(1e-12, tau));
  return 1 - x;
}

/* 解析 Bloch（单比特，初态 θ,φ） */
function nzBlochExact(kind, tau, t, theta, phi){
  const st = Math.sin(theta), ct = Math.cos(theta);
  if (kind === 'relax'){
    const ez = Math.exp(-t / tau), exy = Math.exp(-t / (2 * tau));
    return { x: st * Math.cos(phi) * exy, y: st * Math.sin(phi) * exy, z: ct * ez + (1 - ez) };
  }
  if (kind === 'dephase'){
    const e = Math.exp(-t / tau);
    return { x: st * Math.cos(phi) * e, y: st * Math.sin(phi) * e, z: ct };
  }
  const e = Math.exp(-t / tau);
  return { x: st * Math.cos(phi) * e, y: st * Math.sin(phi) * e, z: ct * e };
}

/* 解析 concurrence（Bell |Φ⁺⟩ 初态，X 态闭式）：
     dephase : 单侧 1−λ，双侧 (1−λ)²  ⟹ e^{−t/T₂} / e^{−2t/T₂}
     relax   : 单侧 √(1−γ)，双侧 (1−γ)² ⟹ e^{−t/2T₁} / e^{−2t/T₁}
               （双侧推导：|11⟩ 会经 |01⟩/|10⟩ 两跳衰变，故 b=c=γs²/2 不为零：
                a=(1+γ²)/2, b=c=γs²/2, d=s⁴/2, w=s²/2
                ⟹ C=2(w−√(bc)) = 2(s²/2 − γs²/2) = s⁴ = (1−γ)²。
                首版误以为 b=0，把双侧写成 1−γ，pot77 抓到 0.25 的偏差。）
               ⟹ **双侧振幅阻尼与双侧相位阻尼的 C 衰减完全同形**（都是 (1−p)²），
                  但机制不同：前者靠布居混合，后者靠相干损失。
     depolar : 单侧 max(0,1−3p/2)，双侧 max(0,[3(1−p)²−1]/2) ⟹ 双侧 ESD 于 (1−p)²=1/3
   注意 relax 与 dephase 的**速率差 2 倍**是物理的：振幅阻尼在 τ 内把 |1⟩ 清空，
   而相位阻尼要两侧各去相干一次才把纠缠杀尽。 */
function nzConcurrenceExact(kind, tau, t, side){
  const p = 1 - Math.exp(-t / Math.max(1e-12, tau));
  const both = side !== 'q0';
  if (kind === 'dephase') return Math.pow(1 - p, both ? 2 : 1);
  if (kind === 'relax'){
    /* 单侧 √(1−γ)：σ₋ 只吃 q0，w 乘 √(1−γ)、√(bc)=0（b 仍为零）
       双侧 (1−γ)²：两跳衰变产生 b=c=γs²/2，w−√(bc) 再掉一个 s² */
    const s2 = Math.max(0, 1 - p);
    return both ? s2 * s2 : Math.sqrt(s2);
  }
  const k = both ? (1 - p) * (1 - p) : (1 - p);
  return Math.max(0, (3 * k - 1) / 2);
}

/* 双侧 ESD 时刻（depolar：解 (1−p)²=1/3）：t* = τ·ln3/2 ≈ 0.5493τ */
function nzEsdTime(tau){ return Math.log(3) / 2 * tau; }

function streamSingle(c, steps, dt){
  const D = 2;
  let cur = nzRhoQubit(c.theta, c.phi);
  let nxt = { n: 1, dim: D, re: new Float64Array(4), im: new Float64Array(4) };
  const E = nzKrausOf(c.kind, nzStepParam(c.kind, c.tau, dt));
  const out = { t: [], x: [], y: [], z: [], purity: [], ax: [], ay: [], az: [], rho: null, tr: [], kind: c.kind };
  let n = 0;                    /* 已记录步数（0..steps，含初态 ⟹ 共 steps+1 个记录点） */
  function one(){
    const t = n * dt;
    const b = nzBloch(cur, 0), ex = nzBlochExact(c.kind, c.tau, t, c.theta, c.phi);
    out.t.push(t); out.x.push(b.x); out.y.push(b.y); out.z.push(b.z);
    out.purity.push(nzPurity(cur));
    out.ax.push(ex.x); out.ay.push(ex.y); out.az.push(ex.z);
    out.tr.push(nzTrace(cur).re);
    out.rho = nzCopy(cur);      /* 当前时刻快照（流式播放时 HUD/热图随帧更新） */
    if (n < steps){ nzApplyKraus(cur, 0, E, nxt); const tmp = cur; cur = nxt; nxt = tmp; }
    n++;
  }
  return { out, one, get n(){ return n; } };
}

function streamBell(c, steps, dt){
  const D = 4;
  const r0 = { n: 2, dim: D, re: new Float64Array(16), im: new Float64Array(16) };
  r0.re[0] = 0.5; r0.re[3] = 0.5; r0.re[12] = 0.5; r0.re[15] = 0.5;   /* |Φ⁺⟩⟨Φ⁺| */
  let cur = r0;
  let alt = { n: 2, dim: D, re: new Float64Array(16), im: new Float64Array(16) };
  const E = nzKrausOf(c.kind, nzStepParam(c.kind, c.tau, dt));
  const qs = c.side === 'q0' ? [0] : [0, 1];
  const out = { t: [], C: [], aC: [], purity: [], x: [], y: [], z: [], xx: [], yy: [], zz: [], F: [], rho: null, tr: [], kind: c.kind, xform: true };
  let xformMax = 0;
  let n = 0;
  function one(){
    const t = n * dt;
    const cc = nzConcurrence(cur);
    const b = nzBloch(cur, 0);
    out.t.push(t); out.C.push(cc.C);
    out.aC.push(nzConcurrenceExact(c.kind, c.tau, t, c.side));
    out.purity.push(nzPurity(cur)); out.x.push(b.x); out.y.push(b.y); out.z.push(b.z);
    out.xx.push(nzPauliCorr2(cur, 'x', 'x'));
    out.yy.push(nzPauliCorr2(cur, 'y', 'y'));
    out.zz.push(nzPauliCorr2(cur, 'z', 'z'));
    out.F.push(nzBellFidelity(cur));
    out.tr.push(nzTrace(cur).re);
    out.rho = nzCopy(cur);
    xformMax = Math.max(xformMax, cc.offmax);
    if (n < steps){
      /* 逐比特交替：每趟严格 read=src / write=dst 且两者不同，趟末把 src 指向结果。
         （首版用「结果可能是 cur 也可能是 nxt」的推断式交换，在 qs.length 为偶数时
           会出现 src===dst 的自覆盖。） */
      let src = cur, dst = alt;
      for (let k = 0; k < qs.length; k++){
        nzApplyKraus(src, qs[k], E, dst);
        const tmp = src; src = dst; dst = tmp;
      }
      cur = src; alt = dst;
    }
    out.xform = xformMax < 1e-12;
    out.xformMax = xformMax;
    n++;
  }
  return { out, one, get n(){ return n; } };
}

/* 流式时间扫描（R98 P3）：step(count) 分帧推进 count 个记录点（含初态共
   steps+1 个），result() 出当前进度（数组随帧增长、rho 为当前时刻快照）。
   nzScan 为薄封装——同一演化顺序，数值与逐位一致（pot77 等不变）。 */
function nzStream(cfg = {}){
  const c = { ...NZ_DEFAULTS, ...cfg };
  const steps = Math.max(1, Math.min(4000, c.steps | 0)), dt = c.dt;
  const S = (c.n === 2) ? streamBell(c, steps, dt) : streamSingle(c, steps, dt);
  const total = steps + 1;
  return {
    get total(){ return total; },
    get n(){ return S.n; },
    step(count){ for (let k = 0, m = Math.max(0, count | 0); k < m && S.n < total; k++) S.one(); },
    result(){ return S.out; },
  };
}

function nzScan(cfg = {}){
  const s = nzStream(cfg);
  s.step(s.total);
  return s.result();
}

/* ---------- 量子轨迹（纯态 + 随机跳变；平均 ⟹ 密度矩阵） ---------- */
/* 单步：按 Kraus 分支概率采样，施加对应算符并归一化。
   relax   : p_jump = γ·P(bit q = 1)，跳变 = 该比特 |1⟩→|0⟩（σ₋），不跳 = |1⟩ 分量 ×√(1−γ)
   dephase : 以 λ/2 概率给该比特 |1⟩ 分量乘 −1（Z），否则不动（模不变）
   depolar : 以 3p/4 概率施加随机 Pauli（X/Y/Z 各 1/3），否则不动
   注意 depolar 的「Kraus 参数 p」与「翻 Pauli 的概率」差 4/3：Bloch 收缩因子是
   1−p（Kraus 口径），而采样概率 p_pauli = 3p/4 给出 E[ρ] 的收缩 = 1−4p_pauli/3 = 1−p。 */
function nzTrajStep(s, q, kind, param, rng){
  const D = s.dim, bit = 1 << q;
  if (kind === 'dephase'){
    const p = param / 2;
    if (rng() < p){
      for (let i = 0; i < D; i++) if (i & bit){ s.re[i] = -s.re[i]; s.im[i] = -s.im[i]; }
      return { jumped: true, p };
    }
    return { jumped: false, p };
  }
  if (kind === 'depolar'){
    const p = 3 * param / 4;
    if (rng() < p){
      const which = Math.floor(rng() * 3);
      if (which === 0){                                   /* X */
        for (let i = 0; i < D; i++) if (!(i & bit)){
          const j = i | bit;
          const tr = s.re[i], ti = s.im[i];
          s.re[i] = s.re[j]; s.im[i] = s.im[j]; s.re[j] = tr; s.im[j] = ti;
        }
      } else if (which === 1){                            /* Y */
        for (let i = 0; i < D; i++) if (!(i & bit)){
          const j = i | bit;
          const ar = s.re[i], ai = s.im[i];
          /* Y|0⟩=i|1⟩, Y|1⟩=−i|0⟩ */
          s.re[i] = -s.im[j]; s.im[i] = s.re[j];
          s.re[j] = ai; s.im[j] = -ar;
        }
      } else {                                            /* Z */
        for (let i = 0; i < D; i++) if (i & bit){ s.re[i] = -s.re[i]; s.im[i] = -s.im[i]; }
      }
      return { jumped: true, p, which };
    }
    return { jumped: false, p };
  }
  /* relax */
  let p1 = 0;
  for (let i = 0; i < D; i++) if (i & bit) p1 += s.re[i] * s.re[i] + s.im[i] * s.im[i];
  const pj = Math.min(1, param * p1);
  if (rng() < pj && p1 > 1e-18){
    /* 跳变：把 |1⟩ 分量搬到 |0⟩（σ₋），再归一化 */
    for (let i = 0; i < D; i++) if (!(i & bit)){
      const j = i | bit;
      const a = Math.sqrt((s.re[j] ** 2 + s.im[j] ** 2) / ((s.re[i] ** 2 + s.im[i] ** 2) + (s.re[j] ** 2 + s.im[j] ** 2) + 1e-300));
      s.re[i] += a * s.re[j] / Math.max(1e-300, Math.hypot(s.re[j], s.im[j])) * Math.hypot(s.re[j], s.im[j]) ;
      s.im[i] += a * s.im[j];
      s.re[j] = 0; s.im[j] = 0;
    }
    nzTrajNorm(s);
    return { jumped: true, p: pj };
  }
  const damp = Math.sqrt(Math.max(0, 1 - param));
  for (let i = 0; i < D; i++) if (i & bit){ s.re[i] *= damp; s.im[i] *= damp; }
  nzTrajNorm(s);
  return { jumped: false, p: pj };
}

function nzTrajNorm(s){
  let n = 0;
  for (let i = 0; i < s.dim; i++) n += s.re[i] * s.re[i] + s.im[i] * s.im[i];
  if (n <= 0) return 0;
  const f = 1 / Math.sqrt(n);
  for (let i = 0; i < s.dim; i++){ s.re[i] *= f; s.im[i] *= f; }
  return n;
}

function nzTrajNew(n){
  const dim = 1 << n;
  const s = { n, dim, re: new Float64Array(dim), im: new Float64Array(dim) };
  s.re[0] = 1;
  return s;
}

/* 单比特初态 |ψ(θ,φ)⟩ 的纯态向量 */
function nzPureQubit(theta, phi){
  const s = nzTrajNew(1);
  s.re[0] = Math.cos(theta / 2); s.im[0] = 0;
  s.re[1] = Math.sin(theta / 2) * Math.cos(phi);
  s.im[1] = Math.sin(theta / 2) * Math.sin(phi);
  return s;
}

/* 一整组轨迹：返回每条轨迹的 Bloch 点列（页面点云）+ 平均密度矩阵的时间序列
   （与 nzScan 的实线对照：蒙特卡洛平均 ⟹ 密度矩阵，1/√N 收敛）。 */
function nzTrajEnsemble(cfg = {}){
  const c = { ...NZ_DEFAULTS, ...cfg };
  const steps = Math.max(1, Math.min(400, c.steps | 0)), dt = c.dt;
  const nT = Math.max(1, Math.min(4000, c.nTraj | 0));
  const rng = mulberry32(c.seed);
  const param = nzStepParam(c.kind, c.tau, dt);
  const paths = [];       /* 每条 = {x:[],y:[],z:[]} */
  let jumps = 0, jumpT = [];
  const acc = new Float64Array(steps + 1);       /* 平均 x,y,z 用三个数组 */
  const accY = new Float64Array(steps + 1), accZ = new Float64Array(steps + 1);
  const frames = [];
  for (let k = 0; k < nT; k++){
    const s = c.n === 2 ? (() => { const t = nzTrajNew(2); t.re[0] = Math.SQRT1_2; t.re[3] = Math.SQRT1_2; return t; })()
                        : nzPureQubit(c.theta, c.phi);
    const q = c.n === 2 ? 0 : 0;
    const px = [], py = [], pz = [], jt = [];
    for (let st = 0; st <= steps; st++){
      const b = trajBloch(s, q);
      px.push(b.x); py.push(b.y); pz.push(b.z);
      acc[st] += b.x; accY[st] += b.y; accZ[st] += b.z;
      if (st === steps) break;
      const r = nzTrajStep(s, q, c.kind, param, rng);
      if (r.jumped && c.kind === 'relax'){ jumps++; jt.push(st * dt); }
    }
    paths.push({ x: px, y: py, z: pz, jumps: jt });
    if (k === 0) for (let st = 0; st <= steps; st++) frames.push(st * dt);
  }
  return {
    t: frames, paths, nTraj: nT, jumps, jumpRate: jumps / nT,
    mx: Array.from(acc, v => v / nT), my: Array.from(accY, v => v / nT), mz: Array.from(accZ, v => v / nT),
    param,
  };
}

/* 纯态的 Bloch 向量（轨迹用；只对单比特或「取某一比特」有意义） */
function trajBloch(s, q){
  const D = s.dim, bit = 1 << q;
  let r0 = 0, r1 = 0, or_ = 0, oi = 0;
  for (let i = 0; i < D; i++){
    const p = s.re[i] * s.re[i] + s.im[i] * s.im[i];
    if (i & bit) r1 += p;
    else {
      r0 += p;
      const j = i | bit;
      /* ψ_i ψ_j* */
      or_ += s.re[i] * s.re[j] + s.im[i] * s.im[j];
      oi += s.im[i] * s.re[j] - s.re[i] * s.im[j];
    }
  }
  const x = 2 * or_, y = -2 * oi, z = r0 - r1;
  return { x, y, z, r: Math.hypot(x, y, z) };
}

/* ===== src/physics/gatenoise.js ===== */
/* ============================================================================
 * gatenoise.js — R80 线路级门噪声：把 R77 的 Pauli 错误通道「挂到」R75 的门上
 *
 * 前几轮的噪声分两种口径，都与**线路结构**无关：
 *   R77（noise.js）静态通道：噪声挂在*时间*上，参数随 t 指数累积（1−e^{−t/τ}）；
 *   R78/R79（qec.js/shor.js）静态错误：编码后、解码前，每个数据比特独立以概率 p
 *     翻一次 Pauli。
 * 真实硬件两者都不是：错误发生在**门执行之后**、跟着门走。一个 1000 门的线路
 * 就是 1000 次错误机会——这就是本模块的模型：
 *
 *   每个门作用后，对该门**触及的每个比特**（单比特门 1 个、CNOT/CZ 2 个、
 *   Toffoli 3 个）以概率 p 注入一个随机 Pauli 错误。
 *
 * 三种错误谱（spectrum）：
 *   depolar：错的话 X/Y/Z 各 1/3  ⟹ Bloch 收缩 λ = 1−4p/3（每门每比特一次机会）
 *   x       ：只错 X              ⟹ 垂直 x 的分量收缩 1−2p，x 分量不动
 *   z       ：只错 Z              ⟹ z 分量不动，横向收缩 1−2p
 * 口径对照（pot80 E 组数值验证）：R77 的退极化 Kraus 参数 p_K（Bloch ×(1−p_K)）
 * 与这里的 Pauli 错误率 p 满足 **p_K = 4p/3**——「翻 Pauli 的概率」与「Kraus
 * 参数」差 4/3，是两个页面的参数别名，不是两个物理。
 *
 * 三层实现对账（本模块方法论核心，与 R79 的 pot/cdp 双层同构）：
 *   ① gnRun     蒙特卡洛态矢：真跑轨迹，每个错误机会现场采样（mulberry32）；
 *   ② gnRhoRun  密度矩阵精确：错误实现成 Pauli 通道逐步作用（n≤4，零统计误差）；
 *   ③ 闭式      解析预测（推导见下），与 ② 对到机器精度、与 ① 对到 4σ。
 *
 * 闭式与推导（pot80 逐条数值验证，不是「文献值」）：
 *   λ(p)        = 1−4p/3（depolar）/ 1−2p（x、z）
 *   F_gate(p)   = 1−2p/3 —— **平均门保真度与错误谱无关**（谱只改「错成什么」，
 *                 不改「错不错」的概率：Haar 平均下任何固定 Pauli 的
 *                 |⟨ψ|σ|ψ⟩|² = 1/3）。这是「门保真度 → 线路保真度」的起点：
 *                 门级已经 1−2p/3，线路级却按 λ^k 掉——
 *                 门保真度看不出谱的差异，线路保真度强依赖谱。
 *   恒等链      F_idle(k)：depolar (1+λ^k)/2（酉协变 D(UρU†)=UD(ρ)U†，
 *                 与线路内容无关，只取决于门数）；x/z 按输入 Bloch 分量：
 *                 F = (1 + r_∥² + (1−2p)^k r_⊥²)/2（r_∥ = 与错误轴平行的分量）。
 *   Bell        C(k)：depolar λ^{2k+3} − (1−λ^{2k+2})/2；
 *                 x 谱 (1−2p)^{2k+2}（H 上的 X 错误免疫：X|+⟩=|+⟩；CNOT 后
 *                 仅单侧错才把 |Φ⁺⟩→|Ψ⁺⟩，双侧错 X₀X₁|Φ⁺⟩=|Φ⁺⟩ 翻回原态）；
 *                 z 谱 (1−2p)^{2k+3}（每个 Z 错误把 |Φ⁺⟩↔|Φ⁻⟩ 翻个相干符号）。
 *                 ESD（纠缠猝死）p*：depolar ≈0.2570；**x 谱无猝死**——C 只在
 *                 p=1/2 归零；z = 1/2（不猝死，指数趋 0）。
 *   GHZ_n       Z 关联指数须用 Heisenberg picture 推导（门会把可观测量支撑搬走，
 *                 朴素的事件数相加会错）：⟨Z₀Z₁⟩ = γ_Z^{2k+n}、⟨Z₁Z₂⟩ = γ_Z^{2k+3}、
 *                 zN = γ_Z^{nk+P(n)}·(n偶?1:0)，P(n) = (3n−2)/2（n 偶）/
 *                 (3n−1)/2（n 奇）；γ_Z 是 Z 型可观测量的收缩因子
 *                 （depolar λ；x 谱 1−2p；**z 谱 1**——Z 错误与 Z 对易，完全不缩）。
 *   **旋转链只有 depolar 有闭式**（酉协变 ⟹ F = (1+λ^k)/2 与转角无关）；
 *   x/z 谱不具酉协变性（X 通道只与 Clifford 对易），旋转链无闭式——页面如实标
 *   「无闭式」，只画 MC 与精确 ρ 两层。这正是「退极化是特殊谱」的教学点。
 * ========================================================================== */

const GN_DEFAULTS = {
  preset: 'idle',                 /* idle | rot | bell | ghz */
  n: 4,                           /* 仅 ghz 用（3/4/5）；其余预设固定 */
  k: 12,                          /* 线路长度：idle/rot = 操作门数；bell/ghz = 附加空闲轮数 */
  pGate: 0.02,                    /* 每门每比特 Pauli 错误概率 */
  spectrum: 'depolar',            /* depolar | x | z */
  theta: Math.PI / 2, phase: 0,   /* 单比特预设的输入态 |ψ⟩ = cos(θ/2)|0⟩+e^{iφ}sin(θ/2)|1⟩ */
  trials: 3000, seed: 7,
  nPts: 25, pMax: 0.3, kMax: 64,  /* 扫描范围（页面曲线用） */
};

const GN_SPECTRA = {
  depolar: { label: '退极化 X/Y/Z', short: 'depolar' },
  x: { label: '仅 X（比特翻）', short: 'X' },
  z: { label: '仅 Z（相位翻）', short: 'Z' },
};

/* 旋转链预设的每门转角（固定小角，避免与输入态 θ 混淆） */
const ROT_TWIST = 0.35;

const GN_PRESETS = {
  idle: {
    label: '恒等链', n: 1,
    text: '输入态给好后，线上跑 k 个**恒等门**——门什么也不做，但每个门后都按谱注入错误。这是「纯累积」模型：k 个门 = k 次错误机会，Bloch 向量按 λ^k 收缩。退极化下**任意单比特线路**都给出同样的 (1+λ^k)/2（酉协变），恒等链只是最干净的特例。',
  },
  rot: {
    label: '旋转链', n: 1,
    text: 'k 个 Ry(0.35) 串成 Ry(0.35k)。门与错误**不対易**：退极化因酉协变仍有闭式 (1+λ^k)/2（与转角无关！），X/Z 谱没有闭式——同样的 λ、同样的 k，谱与线路结构的交互全在这里。',
  },
  bell: {
    label: 'Bell 对', n: 2,
    text: 'H + CNOT 造 |Φ⁺⟩，之后每轮给两个比特各加一个恒等门（k 轮）。**每个 Pauli 错误都把 Bell 态映到另一个 Bell 态**——所以逐轨迹 concurrence 恒等于 1，而系综（密度矩阵）的 C 衰减甚至猝死。纠缠是系综性质，不是单条轨迹的性质。',
  },
  ghz: {
    label: 'GHZ', n: 4,
    text: 'H + CNOT 链造 (|0…0⟩+|1…1⟩)/√2。**关联衰减速度按「被几个门碰过」分层**（指数由 Heisenberg picture 推导，门会把可观测量支撑搬走）：⟨Z₀Z₁⟩ 按 γ^{2k+n} 掉，⟨Z₁Z₂⟩ 只按 γ^{2k+3} 掉。多体关联 ⟨Z⊗n⟩ 掉得最快（γ^{nk+P(n)}，P(n)≈1.5n），且 n 为奇时理想值本身就是 0。',
  },
};

/* ---------- 门触及的比特集合（噪声只作用在这些比特上） ---------- */
function gnTouched(g){
  const op = g.op;
  if (op === 'cnot' || op === 'cz') return [g.c ?? g.q1, g.t ?? g.q2];
  if (op === 'swap') return [g.q1, g.q2];
  if (op === 'toffoli') return [g.q1, g.q2, g.q3];
  if (op === 'rx' || op === 'ry' || op === 'rz' || op === 'phase'){
    return g.c != null ? [g.q, g.c] : [g.q];
  }
  return [g.q];   /* h/x/y/z/s/sdg/t/tdg/id */
}

/* ---------- 态矢上的 Pauli 施加（就地；与 nzTrajStep 的跳变实现同款） ---------- */
function gnPauli(s, q, t){
  const bit = 1 << q, { re, im } = s;
  if (t === 'x'){
    for (let i = 0; i < s.dim; i++){
      if (i & bit) continue;
      const j = i | bit, tr = re[i], ti = im[i];
      re[i] = re[j]; im[i] = im[j]; re[j] = tr; im[j] = ti;
    }
  } else if (t === 'y'){
    for (let i = 0; i < s.dim; i++){
      if (i & bit) continue;
      const j = i | bit, ar = re[i], ai = im[i];
      re[i] = -im[j]; im[i] = re[j];      /* Y|0⟩=i|1⟩ */
      re[j] = ai; im[j] = -ar;            /* Y|1⟩=−i|0⟩ */
    }
  } else {
    for (let i = 0; i < s.dim; i++) if (i & bit){ re[i] = -re[i]; im[i] = -im[i]; }
  }
  return s;
}

/* ---------- 错误谱采样：返回 'x'|'y'|'z' 或 null（本比特这步没错） ----------
   depolar：先以 p 决定错不错，再等概选 X/Y/Z（两次抽样，rng 消耗与 x/z 谱不同，
   但分布严格正确——MC 只信统计不信逐位）。 */
function gnSampleError(spectrum, p, rng){
  if (spectrum === 'x') return rng() < p ? 'x' : null;
  if (spectrum === 'z') return rng() < p ? 'z' : null;
  if (rng() < p){
    const u = rng() * 3;
    return u < 1 ? 'x' : (u < 2 ? 'y' : 'z');
  }
  return null;
}

/* ---------- 预设线路 ----------
   返回 { name, n, k, gates, noisyFrom, ideal, label }。
   noisyFrom 之前的门是「输入态制备」，按约定**无噪声**（与 R78/R79 的 prepare 步
   一致：输入态视为理想给定，噪声只挂在操作门上）。bell/ghz 的制备就是线路本身
   （H/CNOT），全部带噪声。
   n 的取值：单比特预设固定 1；bell 固定 2（两比特线路，与 cfg.n 无关——否则
   gnSweep({preset:'bell', n:4}) 会造出 4 比特线路而 gnRhoInfo 不再输出 C）；
   ghz 由 cfg.n 给，钳制 3..5（n=2 与 bell 重复，不开放）。 */
function gnPresetGates(name, n, k, theta, phi){
  const P = GN_PRESETS[name] || GN_PRESETS.idle;
  const N = P.n === 1 ? 1 : (name === 'bell' ? 2 : Math.max(3, Math.min(5, n | 0)));
  const K = Math.max(0, k | 0);
  const prep = [], ops = [];
  if (name === 'rot' || name === 'idle'){
    prep.push({ op: 'ry', q: 0, theta }, { op: 'rz', q: 0, theta: phi });
    for (let j = 0; j < K; j++){
      ops.push(name === 'idle' ? { op: 'id', q: 0 } : { op: 'ry', q: 0, theta: ROT_TWIST });
    }
  } else if (name === 'bell'){
    ops.push({ op: 'h', q: 0 }, { op: 'cnot', c: 0, q2: 1 });
    for (let j = 0; j < K; j++) ops.push({ op: 'id', q: 0 }, { op: 'id', q: 1 });
  } else {
    ops.push({ op: 'h', q: 0 });
    for (let q = 1; q < N; q++) ops.push({ op: 'cnot', c: 0, q2: q });
    for (let j = 0; j < K; j++) for (let q = 0; q < N; q++) ops.push({ op: 'id', q });
  }
  const gates = prep.concat(ops);
  /* 理想态：无噪声参照。'id' 门对态矢是恒等，但 qcApply 不认识它——过滤后跑 */
  const ideal = qcApplyAll(qcNewState(N), gates.filter(g => g.op !== 'id'));
  return { name, n: N, k: K, gates, noisyFrom: prep.length, ideal, label: P.label };
}

/* ---------- ① 蒙特卡洛态矢：单条轨迹 ---------- */
function gnTrial(n, gates, cfg = {}, rng){
  const c = { pGate: 0.02, spectrum: 'depolar', noisyFrom: 0, ...cfg };
  const s = qcNewState(n);
  const errors = [];
  for (let i = 0; i < gates.length; i++){
    const g = gates[i];
    if (g.op !== 'id') qcApply(s, g);
    if (i < c.noisyFrom) continue;
    for (const q of gnTouched(g)){
      const t = gnSampleError(c.spectrum, c.pGate, rng);
      if (t){ gnPauli(s, q, t); errors.push({ gate: i, q, t }); }
    }
  }
  return { state: s, errors };
}

/* ---------- ② 密度矩阵精确路径（n≤4） ---------- */
function gnRhoNew(n){
  const dim = 1 << n;
  const r = { n, dim, re: new Float64Array(dim * dim), im: new Float64Array(dim * dim) };
  r.re[0] = 1;
  return r;
}

/* σ_t ρ σ_t（就地读出到 out）：X 换指标、Z 翻号、Y 两者兼之。
   Y 的号：⟨i|YρY|j⟩ = (−1)^{i_q+j_q}·ρ_{i⊕b,j⊕b}
   （Y|j⟩ = i(−1)^{j_q}|j⊕b⟩，⟨i|Y = −i(−1)^{i_q}⟨i⊕b|，(⟨i|Y)(Y|j⟩) = +1）。
   首版把 (−i)(i) 算成 −1 多写了一个负号，退极化全错而 x/z 谱免疫（pot80 A 组抓到）。 */
function gnConjPauli(rho, q, t, out){
  const D = rho.dim, b = 1 << q;
  for (let i = 0; i < D; i++){
    const iq = (i & b) ? 1 : 0;
    for (let j = 0; j < D; j++){
      const jq = (j & b) ? 1 : 0;
      let sgn = 1, ii = i, jj = j;
      if (t === 'x'){ ii = i ^ b; jj = j ^ b; }
      else if (t === 'z'){ if (iq) sgn = -sgn; if (jq) sgn = -sgn; }
      else { ii = i ^ b; jj = j ^ b; if (iq !== jq) sgn = -1; }
      out.re[i * D + j] = sgn * rho.re[ii * D + jj];
      out.im[i * D + j] = sgn * rho.im[ii * D + jj];
    }
  }
}

/* 单比特 Pauli 错误通道：E(ρ) = (1−p)ρ + Σ_t w_t σ_t ρ σ_t
   （depolar: X/Y/Z 各 p/3；x/z 谱：单类概率 p）。对任意 p∈[0,1] 都是合法的
   酉混合通道（p>3/4 时 λ<0 = Bloch 反转，依然 CP）。 */
function gnRhoChannel(rho, q, spectrum, p){
  const D = rho.dim, len = D * D;
  const types = spectrum === 'depolar' ? ['x', 'y', 'z'] : [spectrum];
  const w = spectrum === 'depolar' ? p / 3 : p;
  const tmp = { re: new Float64Array(len), im: new Float64Array(len) };
  const one = { re: new Float64Array(len), im: new Float64Array(len) };
  for (const t of types){
    gnConjPauli(rho, q, t, one);
    for (let m = 0; m < len; m++){ tmp.re[m] += w * one.re[m]; tmp.im[m] += w * one.im[m]; }
  }
  const idw = 1 - p;
  for (let m = 0; m < len; m++){
    rho.re[m] = idw * rho.re[m] + tmp.re[m];
    rho.im[m] = idw * rho.im[m] + tmp.im[m];
  }
}

/* ρ → UρU†。U 由 qcProgramMatrix 拿到（D² 成本），乘法只遍历「同块」指标：
   门在非触及位上是恒等 ⟹ U_{(b,i),(b',k)} = δ_{bb'}u_{ik}，于是
   ρ'_{ij} = Σ_{k∈块(i), l∈块(j)} U_{i,k} ρ_{k,l} conj(U_{j,l})。
   **i 与 j 可以分属不同块**（ρ 的块间相干，如 GHZ 的 ρ_{0,15}）——首版要求
   两块相同，把块间相干清零（Bell n=2 单块免疫，GHZ n=4 的 F=0.5 暴露）。
   乘积用标准复数乘法并**真正取共轭**（首版漏了 conj 的负号且公式符号错，
   实门 H/CNOT 免疫、rz 暴露为 F=cos φ）。 */
function gnRhoUnitary(rho, g){
  if (g.op === 'id') return;
  const D = rho.dim;
  const U = qcProgramMatrix(rho.n, [g]);       /* U[kk].re[i] = ⟨i|U|kk⟩ */
  let mask = 0;
  for (const q of gnTouched(g)) mask |= 1 << q;
  const out = { re: new Float64Array(D * D), im: new Float64Array(D * D) };
  for (let i = 0; i < D; i++){
    const bi = i & ~mask;
    for (let j = 0; j < D; j++){
      const bj = j & ~mask;
      let sr = 0, si = 0;
      for (let kk = 0; kk < D; kk++){
        if ((kk & ~mask) !== bi) continue;
        const ur = U[kk].re[i], ui = U[kk].im[i];
        if (ur === 0 && ui === 0) continue;
        for (let ll = 0; ll < D; ll++){
          if ((ll & ~mask) !== bj) continue;
          const vr = U[ll].re[j], vi = -U[ll].im[j];     /* conj(U_{jl}) */
          const pr = rho.re[kk * D + ll], pi = rho.im[kk * D + ll];
          if (pr === 0 && pi === 0) continue;
          const a = ur * pr - ui * pi, b = ur * pi + ui * pr;   /* U_ik·ρ_kl */
          sr += a * vr - b * vi;                                 /* ·conj(U_jl) */
          si += a * vi + b * vr;
        }
      }
      out.re[i * D + j] = sr; out.im[i * D + j] = si;
    }
  }
  rho.re.set(out.re); rho.im.set(out.im);
}

function gnRhoRun(n, gates, cfg = {}){
  const c = { pGate: 0.02, spectrum: 'depolar', noisyFrom: 0, ...cfg };
  const rho = gnRhoNew(n);
  for (let i = 0; i < gates.length; i++){
    const g = gates[i];
    gnRhoUnitary(rho, g);
    if (i < c.noisyFrom) continue;
    for (const q of gnTouched(g)) gnRhoChannel(rho, q, c.spectrum, c.pGate);
  }
  return rho;
}

/* ---------- 可观测量（从 ρ 或轨迹态提取；页面与 pot80 共用） ---------- */
/* ⟨ideal|ρ|ideal⟩ */
function gnFidelityRho(rho, psi){
  const D = rho.dim;
  let s = 0;
  for (let i = 0; i < D; i++){
    const ar = psi.re[i], ai = psi.im[i];
    if (ar === 0 && ai === 0) continue;
    for (let j = 0; j < D; j++){
      const br = psi.re[j], bi = psi.im[j];
      if (br === 0 && bi === 0) continue;
      const pr = rho.re[i * D + j], pi = rho.im[i * D + j];
      const x1 = ar * pr + ai * pi, y1 = ar * pi - ai * pr;    /* ψ*_i ρ_ij */
      s += x1 * br - y1 * bi;                                   /* ·ψ_j 取实部 */
    }
  }
  return s;
}

/* ⟨⊗_{q∈qs} Z_q⟩（任意比特数；只读对角） */
function gnZCorr(rho, qs){
  let mask = 0;
  for (const q of qs) mask |= 1 << q;
  let v = 0;
  for (let i = 0; i < rho.dim; i++){
    let pc = 0, x = i & mask;
    while (x){ pc += x & 1; x >>= 1; }
    v += (pc & 1 ? -1 : 1) * rho.re[i * rho.dim + i];
  }
  return v;
}

/* 纯态上的多比特 Z 关联（轨迹统计用） */
function gnZCorrPure(s, qs){
  let mask = 0;
  for (const q of qs) mask |= 1 << q;
  let v = 0;
  for (let i = 0; i < s.dim; i++){
    let pc = 0, x = i & mask;
    while (x){ pc += x & 1; x >>= 1; }
    v += (pc & 1 ? -1 : 1) * (s.re[i] * s.re[i] + s.im[i] * s.im[i]);
  }
  return v;
}

/* 一批可观测量的汇总（页面 HUD / 曲线 / pot80 共用同一出口） */
function gnRhoInfo(rho, spec){
  const out = { F: gnFidelityRho(rho, spec.ideal) };
  if (rho.n === 1) out.bloch = nzBloch(rho, 0);
  if (rho.n === 2) out.C = nzConcurrence(rho).C;
  out.zz = [];
  for (let i = 0; i < rho.n; i++) for (let j = i + 1; j < rho.n; j++){
    out.zz.push({ i, j, v: gnZCorr(rho, [i, j]) });
  }
  const all = [];
  for (let q = 0; q < rho.n; q++) all.push(q);
  out.zN = gnZCorr(rho, all);
  return out;
}

/* ---------- ① 蒙特卡洛集合 ----------
   返回平均密度矩阵 + 由它算出的可观测量 + 逐轨迹线性统计（F/Bloch/ZZ 的 mean±sd，
   用于 MC 误差棒）+ 错误直方图 + 末条轨迹。C 非线性：只给 C(ρ_MC)，不给误差棒
   （页面注明）；另给 meanCtraj——Bell 预设下它恒等于 1，是「纠缠是系综性质」
   的现场证据。 */
/* 流式累加器（R98 P2）：step(count) 分帧；result() 出当前统计（rho = 累积均值）。 */
function gnStream(cfg = {}){
  const c = { ...GN_DEFAULTS, ...cfg };
  const spec = gnPresetGates(c.preset, c.n, c.k, c.theta, c.phase);
  const rng = mulberry32(c.seed);
  const D = 1 << spec.n, len = D * D;
  const acc = { re: new Float64Array(len), im: new Float64Array(len) };
  const nq = spec.n;
  const sumF = { s: 0, s2: 0 };
  const sumB = [], sumZ = [];
  for (let q = 0; q < nq; q++) sumB.push({ x: { s: 0, s2: 0 }, y: { s: 0, s2: 0 }, z: { s: 0, s2: 0 } });
  for (let i = 0; i < nq; i++) for (let j = i + 1; j < nq; j++) sumZ.push({ i, j, s: 0, s2: 0 });
  let sumC = 0, nC = 0;
  const errHist = new Array(spec.gates.length + 2).fill(0);
  let last = null, errSum = 0, N = 0;
  function one(){
    const tr = gnTrial(spec.n, spec.gates, { pGate: c.pGate, spectrum: c.spectrum, noisyFrom: spec.noisyFrom }, rng);
    const st = tr.state;
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++){
      acc.re[i * D + j] += st.re[i] * st.re[j] + st.im[i] * st.im[j];
      acc.im[i * D + j] += st.im[i] * st.re[j] - st.re[i] * st.im[j];
    }
    const F = qcFidelity(st, spec.ideal);
    sumF.s += F; sumF.s2 += F * F;
    for (let q = 0; q < nq; q++){
      const bit = 1 << q;
      let r0 = 0, r1 = 0, or_ = 0, oi = 0;
      for (let i = 0; i < D; i++){
        const p = st.re[i] * st.re[i] + st.im[i] * st.im[i];
        if (i & bit) r1 += p;
        else {
          r0 += p;
          const j = i | bit;
          or_ += st.re[i] * st.re[j] + st.im[i] * st.im[j];
          oi += st.im[i] * st.re[j] - st.re[i] * st.im[j];
        }
      }
      const bx = 2 * or_, by = -2 * oi, bz = r0 - r1;
      sumB[q].x.s += bx; sumB[q].x.s2 += bx * bx;
      sumB[q].y.s += by; sumB[q].y.s2 += by * by;
      sumB[q].z.s += bz; sumB[q].z.s2 += bz * bz;
    }
    for (const e of sumZ){
      const v = gnZCorrPure(st, [e.i, e.j]);
      e.s += v; e.s2 += v * v;
    }
    if (nq === 2){
      const cc = (() => {
        const a00r = st.re[0], a00i = st.im[0], a01r = st.re[1], a01i = st.im[1];
        const a10r = st.re[2], a10i = st.im[2], a11r = st.re[3], a11i = st.im[3];
        const dr = a00r * a11r - a00i * a11i - (a01r * a10r - a01i * a10i);
        const di = a00r * a11i + a00i * a11r - (a01r * a10i + a01i * a10r);
        return 2 * Math.hypot(dr, di);
      })();
      sumC += cc; nC++;
    }
    errHist[tr.errors.length]++;
    errSum += tr.errors.length;
    last = tr;
    N++;
  }
  return {
    get total(){ return Math.max(1, c.trials | 0); },
    get n(){ return N; },
    step(count){ for (let k = 0, m = Math.max(0, count | 0); k < m; k++) one(); },
    result(){
      const NN = Math.max(1, N);
      const rho = { n: spec.n, dim: D, re: new Float64Array(len), im: new Float64Array(len) };
      for (let m = 0; m < len; m++){ rho.re[m] = acc.re[m] / NN; rho.im[m] = acc.im[m] / NN; }
      const sd = (o) => Math.sqrt(Math.max(0, o.s2 / NN - (o.s / NN) * (o.s / NN)));
      return {
        preset: c.preset, n: spec.n, k: spec.k, p: c.pGate, spectrum: c.spectrum, trials: N,
        rho,
        info: gnRhoInfo(rho, spec),
        F: { mean: sumF.s / NN, sd: sd(sumF) },
        bloch: sumB.map(o => ({ x: { mean: o.x.s / NN, sd: sd(o.x) }, y: { mean: o.y.s / NN, sd: sd(o.y) }, z: { mean: o.z.s / NN, sd: sd(o.z) } })),
        zz: sumZ.map(o => ({ i: o.i, j: o.j, mean: o.s / NN, sd: sd(o) })),
        meanCtraj: nC ? sumC / nC : NaN,
        errHist: errHist.slice(0, spec.gates.length + 1),
        errMean: errSum / NN,
        last: { state: last.state, errors: last.errors },
      };
    },
  };
}

/* 一次性全批：同一 rng 消耗序 ⟹ 数值与流式逐位一致 */
function gnRun(cfg = {}){
  const s = gnStream(cfg);
  s.step(s.total);
  return s.result();
}

/* ---------- ③ 闭式 ---------- */
/* λ：每门每比特一次错误机会的 Bloch 收缩因子 */
function gnLambda(spectrum, p){
  return spectrum === 'depolar' ? 1 - 4 * p / 3 : 1 - 2 * p;
}

/* Z 型可观测量的收缩因子：z 谱下 Z 错误与 Z 对易 ⟹ 完全不缩 */
function gnGammaZ(spectrum, p){
  if (spectrum === 'depolar') return 1 - 4 * p / 3;
  if (spectrum === 'x') return 1 - 2 * p;
  return 1;
}

/* 平均门保真度（单比特门）：与谱无关 */
function gnGateFidelity(p){ return 1 - 2 * p / 3; }

/* 恒等链：输入 Bloch r（|r|=1），k 个恒等门后对理想态的保真度 */
function gnIdleFidelity(spectrum, p, k, r){
  if (spectrum === 'depolar') return (1 + Math.pow(gnLambda(spectrum, p), k)) / 2;
  const l = Math.pow(1 - 2 * p, k);
  if (spectrum === 'x') return (1 + r[0] * r[0] + l * (r[1] * r[1] + r[2] * r[2])) / 2;
  return (1 + r[2] * r[2] + l * (r[0] * r[0] + r[1] * r[1])) / 2;
}

/* 恒等链：k 个恒等门后的 Bloch 向量 */
function gnIdleBloch(spectrum, p, k, r){
  const l = Math.pow(gnLambda(spectrum, p), k);
  if (spectrum === 'depolar') return [l * r[0], l * r[1], l * r[2]];
  if (spectrum === 'x') return [r[0], l * r[1], l * r[2]];
  return [l * r[0], l * r[1], r[2]];
}

/* 输入态 |ψ(θ,φ)⟩ 的 Bloch 向量 */
function gnStateBloch(theta, phi){
  return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
}

/* Bell 线路（H+CNOT）+ k 轮双比特空闲的 concurrence 闭式。
   推导要点：
   - depolar：H 后 q0 的 x 分量收缩 λ ⟹ w₂=λ/2；CNOT 后双侧通道 ⟹
     ρ₃ = λ²ρ₂ + (1−λ²)/4·I，w₃=λ³/2，b₃=c₃=(1−λ²)/4 ⟹
     C = 2(w−√(bc)) = λ³ − (1−λ²)/2；每轮空闲使 w→λ²w、b→(1−λ^{2k+2})/4。
   - x：H 上的 X 错误免疫（X|+⟩=|+⟩）。CNOT 后：无错（(1−p)²）或两侧皆错
     （p²，X₀X₁|Φ⁺⟩=|Φ⁺⟩ 双翻回原态）都留在 |Φ⁺⟩；仅单侧错（2p(1−p)，
     X₀|Φ⁺⟩=|Ψ⁺⟩）翻到 |Ψ⁺⟩ ⟹ P(Φ)=(1−p)²+p²、P(Ψ)=2p(1−p)，
     C=|P(Φ)−P(Ψ)|=(1−2p)²。每轮空闲同样只有单侧错才翻 ⟹ 差 ×(1−2p)²，
     合计 C(k)=(1−2p)^{2k+2}。（首版误以为双侧 X 也翻态，漏了 p² 项。）
   - z：每个 Z 错误把 |Φ⁺⟩↔|Φ⁻⟩（w 翻号）⟹ 3+2k 个事件各贡献 (1−2p)。 */
function gnBellConcurrence(spectrum, p, k = 0){
  if (spectrum === 'depolar'){
    const l = Math.pow(1 - 4 * p / 3, 2 * k + 3);
    return Math.max(0, l - (1 - Math.pow(1 - 4 * p / 3, 2 * k + 2)) / 2);
  }
  if (spectrum === 'x') return Math.pow(1 - 2 * p, 2 * k + 2);
  return Math.pow(1 - 2 * p, 2 * k + 3);
}

/* Bell 线路对 |Φ⁺⟩ 的保真度闭式（depolar：F = A+w = (1+λ^{2k+2})/4+λ^{2k+3}/2） */
function gnBellFidelity(spectrum, p, k = 0){
  if (spectrum === 'depolar'){
    const l = Math.pow(1 - 4 * p / 3, 2 * k + 2);
    return (1 + l) / 4 + l * (1 - 4 * p / 3) / 2;
  }
  return NaN;   /* x/z 谱留给精确 ρ（页面不画闭式） */
}

/* GHZ_n 线路（H(0) + CNOT(0,q), q=1..n−1，全部带噪）+ k 轮全比特空闲。
   闭式指数用 **Heisenberg picture** 推导：可观测量从末端逆序推过每一道门及其
   后的错误通道；Z 型可观测量每被一个错误事件触及就收缩 γ_Z 倍
   （depolar λ=1−4p/3；x 谱 1−2p；z 谱 1——Z 错误与 Z 对易）。
   - ⟨Z₀Z₁⟩：空闲轮每轮 2 个事件（q0/q1 各一次）；CNOT(0,q)（q≥2）各 1 个
     （支撑 {0,1} 只含控制位 0）；CNOT(0,1) 2 个（Z₁→Z₀Z₁ 后支撑仍 {0,1}）；
     H 步推完 CNOT(0,1) 后支撑缩为 {1}，H 错误打在 q0 上不触及 ⟹ 0 个。
     合计 2k+n。
   - ⟨Z₁Z₂⟩：空闲 2k；CNOT(0,q)（q≥3）0 个；CNOT(0,2) 1 个（Z₂→Z₀Z₂ 使支撑
     扩到 {0,1,2}）；CNOT(0,1) 2 个；H 步 0 个 ⟹ 合计 2k+3。
   - zN = ⟨Z₀…Z_{n−1}⟩：空闲 nk；CNOT 阶梯事件数自 CNOT(0,n−1) 起交替
     2,1,2,1,…（每步后 Z₀ 在/不在支撑间切换）；H 步仅 n 为奇时支撑含 0 记 1 个。
     合计 P(n) = (3n−2)/2（n 偶）/ (3n−1)/2（n 奇）。
     另一方面 H 把 Z₀→X₀：n 奇时末观测量为 X₀Z₁…Z_{n−1}，在 |0ⁿ⟩ 上期望 0
     ⟹ 理想值本身带奇偶因子 (1+(−1)ⁿ)/2；n 偶时 Z₀ 与 CNOT 目标反传的 Z₀ 抵消，
     末观测量 Z₁…Z_{n−1} 期望 1。
   - x 谱细节：错误仅 X；H 步（n 奇）观测量已是 X 型、X 错误免疫，但该情形被
     奇偶因子清零，不影响公式。z 谱 γ_Z=1，公式退化为奇偶因子本身。
   （首版用「每比特事件数相加」的朴素计数，忽略了门把可观测量支撑搬走——
   zz01 差一个 λ、zN 差 λ²，且奇 n 的 zN 缺奇偶因子差 1.0。） */
function gnGhzParity(n){ return (n % 2 === 0) ? 1 : 0; }
function gnGhzPrepEvents(n){ return (n % 2 === 0) ? (3 * n - 2) / 2 : (3 * n - 1) / 2; }
function gnGhzCorr(spectrum, p, n, k, i, j){
  const g = gnGammaZ(spectrum, p);
  if (i === 0 && j === 1) return Math.pow(g, 2 * k + n);
  if (i === 1 && j === 2) return Math.pow(g, 2 * k + 3);
  return NaN;   /* 其余比特对无闭式（页面只画 (0,1)/(1,2) 两条） */
}
function gnGhzZN(spectrum, p, n, k){
  return gnGhzParity(n) * Math.pow(gnGammaZ(spectrum, p), n * k + gnGhzPrepEvents(n));
}

/* Bell ESD 的 p*（C 首次归零）：x 谱 (1−2p)^{2k+2} 要到 p=1/2 才归零 ⟹
   **无猝死**；z 谱 1/2；depolar 解 2λ^{2k+3}+λ^{2k+2}−1=0（λ∈(0,1) 单调 ⟹ 二分）。 */
function gnEsdBells(spectrum, p, k = 0){
  if (spectrum === 'x') return 0.5;   /* 无 ESD：p=1/2 处归零（首版误给 1−1/√2） */
  if (spectrum === 'z') return 0.5;
  const f = l => 2 * Math.pow(l, 2 * k + 3) + Math.pow(l, 2 * k + 2) - 1;
  let lo = 0, hi = 1;
  for (let it = 0; it < 80; it++){
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid; else lo = mid;   /* f 单调递增：正 ⟹ 根在左侧 */
  }
  return (3 / 4) * (1 - (lo + hi) / 2);
}

/* ---------- 曲线（页面用：闭式 + 精确 ρ 两层，MC 点由页面单独取当前 p） ---------- */
function gnCurveKeys(preset){
  if (preset === 'bell') return ['C'];
  if (preset === 'ghz') return ['zz01', 'zz12', 'zN'];
  return ['F'];
}

/* 指定 (p, k) 处的闭式可观测量（键与 gnCurveKeys 一致；旋转链 x/z 谱的 F 为 NaN） */
function gnClosedAt(cfg, p, k){
  const c = { ...GN_DEFAULTS, ...cfg };
  const K = k == null ? c.k : k, sp = c.spectrum, out = {};
  if (c.preset === 'bell'){
    out.C = gnBellConcurrence(sp, p, K);
  } else if (c.preset === 'ghz'){
    out.zz01 = gnGhzCorr(sp, p, c.n, K, 0, 1);
    out.zz12 = gnGhzCorr(sp, p, c.n, K, 1, 2);
    out.zN = gnGhzZN(sp, p, c.n, K);
  } else if (c.preset === 'idle'){
    out.F = gnIdleFidelity(sp, p, K, gnStateBloch(c.theta, c.phase));
  } else {
    out.F = sp === 'depolar' ? (1 + Math.pow(gnLambda(sp, p), K)) / 2 : NaN;
  }
  return out;
}

/* p 扫描（固定 k）与 k 扫描（固定 p）：返回闭式/精确两层的曲线数组 */
function gnSweep(cfg = {}){
  const c = { ...GN_DEFAULTS, ...cfg };
  const keys = gnCurveKeys(c.preset);
  const nPts = Math.max(2, c.nPts | 0);
  const init = () => { const o = {}; for (const k of keys) o[k] = []; return o; };
  const p = [], cP = init(), eP = init();
  for (let i = 0; i < nPts; i++){
    const pp = c.pMax * i / (nPts - 1);
    p.push(pp);
    const spec = gnPresetGates(c.preset, c.n, c.k, c.theta, c.phase);
    const rho = gnRhoRun(spec.n, spec.gates, { pGate: pp, spectrum: c.spectrum, noisyFrom: spec.noisyFrom });
    const ex = gnRhoInfo(rho, spec);
    const cl = gnClosedAt(c, pp, c.k);
    for (const key of keys){
      cP[key].push(cl[key]);
      eP[key].push(key === 'C' ? ex.C : key === 'F' ? ex.F : key === 'zz01' ? (ex.zz.find(z => z.i === 0 && z.j === 1) || {}).v : key === 'zz12' ? (ex.zz.find(z => z.i === 1 && z.j === 2) || {}).v : ex.zN);
    }
  }
  const kMax = Math.max(1, c.kMax | 0);
  const kArr = [], cK = init(), eK = init();
  for (let j = 0; j <= kMax; j++){
    kArr.push(j);
    const spec = gnPresetGates(c.preset, c.n, j, c.theta, c.phase);
    const rho = gnRhoRun(spec.n, spec.gates, { pGate: c.pGate, spectrum: c.spectrum, noisyFrom: spec.noisyFrom });
    const ex = gnRhoInfo(rho, spec);
    const cl = gnClosedAt(c, c.pGate, j);
    for (const key of keys){
      cK[key].push(cl[key]);
      eK[key].push(key === 'C' ? ex.C : key === 'F' ? ex.F : key === 'zz01' ? (ex.zz.find(z => z.i === 0 && z.j === 1) || {}).v : key === 'zz12' ? (ex.zz.find(z => z.i === 1 && z.j === 2) || {}).v : ex.zN);
    }
  }
  return { preset: c.preset, spectrum: c.spectrum, n: gnPresetGates(c.preset, c.n, c.k, c.theta, c.phase).n, keys, p, k: kArr, cP, eP, cK, eK };
}

/* ===== src/physics/qcnoise.js ===== */
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
 * R106 增补读出误差（SPAM 半边）：量子态**仍按理想投影坍缩**（读出误差不污染 ρ），
 *   但**记录的经典位**以概率 ε 独立翻转（每位一次 Bernoulli 抽样）——「读出误报」
 *   口径；与「赋值误差」（连坍缩子空间一起翻）不同，后者本模型不取。ε 钳到
 *   [0, 1/2]（>1/2 无物理意义：等价于确定性报反的补事件）。cond 前馈按**记录位**
 *   决策 ⟹ 传态修正用错位 ⟹ 保真度掉到 ~(1−ε)²（球平均 1−4ε/3+2ε²/3）。
 * R107 增补热激发（广义振幅阻尼 GAD）：T₁ 弛豫的有限温度推广——总纵弛豫率
 *   γ=tg/T₁ 按**平衡布居 p_eq** 重新分配为 gDown=γ(1−p_eq)（|1⟩→|0⟩）与
 *   gUp=γ·p_eq（|0⟩→|1⟩），满足细致平衡 ⟹ 平衡态是对角热态（p₁₁_∞=p_eq、
 *   z_∞=1−2p_eq），**不是**最大混合（p_eq<1/2 时）也**不是**纯基态（p_eq>0 时）
 *   ——三通道终点对照就此闭合：T₁(p_eq=0)⟹纯基态、热⟹对角热态、退极化⟹最大混合。
 *   p_eq=0 ⟹ 精确回到 R104 振幅阻尼路径（零回归锚点）。
 * 诚实限制：① 读出误差是**经典位翻转**（量子态按理想投影坍缩，无「赋值误差」）；
 *   ② 无非马尔可夫记忆、无串扰、无泄漏（热激发只翻转布居，不把比特搬出计算基）；
 *   ③ 经典前馈 cond 的门噪声语义 = 内部门真实执行才衰减（未触发不衰减）。
 * ========================================================================== */

/* ---------- 门矩阵（与 qcApply 同一套展开；mask = 控制位掩码，0 = 无控） ---------- */
const QCN_C0 = { re: 0, im: 0 }, QCN_C1 = { re: 1, im: 0 };
function qcnGateMatrix(g){
  const op = g.op;
  if (op === 'cnot') return { m: QC_UNARY.x.m, q: g.t ?? g.q2, mask: 1 << (g.c ?? g.q1) };
  if (op === 'cz') return { m: QC_UNARY.z.m, q: g.t ?? g.q2, mask: 1 << (g.c ?? g.q1) };
  if (op === 'toffoli') return { m: QC_UNARY.x.m, q: g.q3, mask: (1 << g.q1) | (1 << g.q2) };
  if (op === 'u3'){
    return { m: qcU3(g.theta ?? 0, g.phi ?? 0, g.lambda ?? 0), q: g.q, mask: g.c != null ? (1 << g.c) : 0 };
  }
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
function qcnGateTouched(g){
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
function qcnRho(n){
  const dim = 1 << n;
  const r = { n, dim, re: new Float64Array(dim * dim), im: new Float64Array(dim * dim) };
  r.re[0] = 1;
  return r;
}
/* 由纯态 |ψ⟩（qcNewState 结构）构造 ρ = |ψ⟩⟨ψ| */
function qcnRhoFromPure(s){
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
function qcnApplyGate(rho, g){
  if (g.op === 'swap'){ qcnSwapRho(rho, g.q1, g.q2); return rho; }
  const t = qcnGateMatrix(g);
  if (!t) throw new Error('qcnApplyGate: unknown gate ' + g.op);
  qcnApply1q(rho, t.m, t.q, t.mask);
  return rho;
}

/* ---------- 阻尼通道（就地） ---------- */
/* 振幅阻尼 γ（T₁）：E₀=diag(1,√(1−γ))、E₁=√γ|0⟩⟨1| 作用在比特 q 上 */
function qcnAmpDamp(rho, q, gamma){
  const g = Math.min(1, Math.max(0, Number.isFinite(gamma) ? gamma : 0));   /* R107：NaN 钳 0（此前 NaN 会静默污染 ρ） */
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
function qcnPhaseDamp(rho, q, lambda){
  const l = Math.min(1, Math.max(0, Number.isFinite(lambda) ? lambda : 0)); /* R107：NaN 钳 0（同上） */
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
function qcnDepolar(rho, q, p){
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

/* ---------- 热激发通道（R107：广义振幅阻尼 GAD） ---------- */
/* R107：振幅阻尼的有限温度推广——|1⟩→|0⟩ 弛豫（gDown）之外再加 |0⟩→|1⟩ 热激发
   （gUp），满足细致平衡 gUp/gDown = p_eq/(1−p_eq)（平衡激发布居 p_eq）。
   就地闭式（与振幅阻尼同块结构）：
     · 对角块 [[a,c],[b,d]]（q 位相同）：
         a' = (1−gUp)·a + gDown·d    （|1⟩→|0⟩ 把布居搬进 |0⟩）
         d' = gUp·a + (1−gDown)·d    （|0⟩→|1⟩ 搬出；平衡态 p11/gUp... 见下）
         c,b ×s，s = √((1−gDown)(1−gUp))（Kraus E₀=E₀† 对角 ⟹ 相干衰减因子）
       平衡解：gDown·p11 = gUp·p00 ⟹ p11_∞ = gUp/(gDown+gUp) = p_eq（细致平衡）。
     · q 位不同的矩阵元：×s（同一单比特通道的相干衰减）。
   p_eq=0 ⟹ gUp=0 ⟹ s=√(1−gDown)、a'=a+gDown·d、d'=(1−gDown)d——**与 qcnAmpDamp
   逐位相同**（R104 回归锚点）；p_eq=1/2 ⟹ 无限温 ⟹ 布居平衡是 I/2（但相干衰减
   因子是 (1−γ/2) 而非退极化的 λ=1−4p/3——布居相同、通道不同）。
   注意：gDown+gUp = γ（总纵弛豫率，同一 tg/T₁ 口径），温度只**重新分配**上下行速率。 */
function qcnThermal(rho, q, gDown, gUp){
  const gd = Math.min(1, Math.max(0, Number.isFinite(gDown) ? gDown : 0));  /* R107：NaN 钳 0（与 qcnDepolar 同口径） */
  const gu = Math.min(1, Math.max(0, Number.isFinite(gUp) ? gUp : 0));
  if (gd <= 0 && gu <= 0) return;
  if (gu === 0){ qcnAmpDamp(rho, q, gd); return; }   /* p_eq=0 ⟹ 精确回到 R104 路径 */
  const D = rho.dim, bit = 1 << q, s = Math.sqrt((1 - gd) * (1 - gu));
  const Re = rho.re, Im = rho.im;
  for (let i0 = 0; i0 < D; i0++){
    if (i0 & bit) continue;
    const i1 = i0 | bit;
    for (let j0 = 0; j0 < D; j0++){
      if (j0 & bit) continue;
      const j1 = j0 | bit;
      /* 布居再分配：a'=（1−gUp)a + gDown·d、d'=gUp·a +（1−gDown)d（先读后写） */
      const ar = Re[i0 * D + j0], ai = Im[i0 * D + j0];
      const dr = Re[i1 * D + j1], di = Im[i1 * D + j1];
      Re[i0 * D + j0] = (1 - gu) * ar + gd * dr; Im[i0 * D + j0] = (1 - gu) * ai + gd * di;
      Re[i1 * D + j1] = gu * ar + (1 - gd) * dr; Im[i1 * D + j1] = gu * ai + (1 - gd) * di;
      /* 相干：跨位与块内同因子 s */
      Re[i0 * D + j1] *= s; Im[i0 * D + j1] *= s;
      Re[i1 * D + j0] *= s; Im[i1 * D + j0] *= s;
    }
  }
}

/* ---------- 噪声参数 ---------- */
/* t1,t2,tg 任意正数（同一单位）；γ=1−e^{−tg/t1}、λ=1−e^{−tg/t2}。
   t2eff = 1/(1/t2 + 1/(2t1))：T₁ 本身贡献的横向衰减（T₂ ≤ 2T₁ 自动满足）。 */
function qcnNoiseParams(t1, t2, tg, pd = 0, re = 0, peq = 0){
  const T1 = Math.max(1e-9, t1), T2 = Math.max(1e-9, t2), TG = Math.max(0, tg);
  const pdep = Math.min(0.75, Math.max(0, Number.isFinite(pd) ? pd : 0));
  const eps = Math.min(0.5, Math.max(0, Number.isFinite(re) ? re : 0));  /* R106：读出误差钳 [0,1/2] */
  const pe = Math.min(0.5, Math.max(0, Number.isFinite(peq) ? peq : 0)); /* R107：热平衡激发布居钳 [0,1/2]（正温度） */
  const gamma = 1 - Math.exp(-TG / T1);
  return {
    gamma,                            /* 总纵弛豫率：gDown+gUp（温度只重新分配上下行） */
    gDown: gamma * (1 - pe),          /* R107：|1⟩→|0⟩ 弛豫速率 */
    gUp: gamma * pe,                  /* R107：|0⟩→|1⟩ 热激发速率（p_eq=0 ⟹ 恒 0 ≡ R104 振幅阻尼） */
    lambda: 1 - Math.exp(-TG / T2),
    pdep,
    ldep: 1 - 4 * pdep / 3,           /* 退极化的 Bloch 缩放因子（R77/R80 同口径） */
    eps,                              /* R106：每位测量记录独立翻转的概率 */
    peq: pe,                          /* R107：平衡激发布居（z_∞ = 1−2p_eq） */
    t2eff: 1 / (1 / T2 + 1 / (2 * T1)),
  };
}

/* ---------- 测量 ---------- */
/* Z 基：p1 = Σ_{i:bit} ρ_ii；投影到该位 out 子空间（保留块内相干）+ 归一 */
function qcnMeasureZ(rho, q, rng){
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
function qcnMeasureQubit(rho, q, rng, basis = 'z'){
  if (basis !== 'z' && basis !== 'x' && basis !== 'y') throw new Error('unknown measure basis ' + basis);
  if (!Number.isInteger(q) || q < 0 || q >= rho.n) throw new Error('measure qubit out of range: ' + q);   /* R106：与纯路径/联合测量同口径 */
  const pre = basis === 'x' ? [{ op: 'h', q }] : basis === 'y' ? [{ op: 'sdg', q }, { op: 'h', q }] : [];
  const post = basis === 'x' ? [{ op: 'h', q }] : basis === 'y' ? [{ op: 'h', q }, { op: 's', q }] : [];
  for (const g of pre) qcnApplyGate(rho, g);
  const bit = qcnMeasureZ(rho, q, rng);
  for (const g of post) qcnApplyGate(rho, g);
  return bit;
}
/* 联合测量（R103 同款）：P† → 顺序 Z 测 k 次（投影互交换 ⟺ 联合 Z）→ P 旋回 */
function qcnMeasureJoint(rho, qubits, rng, basis = 'bell'){
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

/* ---------- 读出误差（R106） ---------- */
/* 经典位翻转：每位独立地以概率 ε 翻转**记录值**（量子态已在上一层按理想投影
   坍缩，不受影响）。ε=0 / 负数 / NaN ⟹ 原样返回且**不消耗随机数**（零回归：
   与 R105 路径的随机流逐位一致）。 */
function qcnFlipBits(bits, eps, rng){
  if (!(eps > 0)) return bits;
  const out = bits.slice();
  for (let i = 0; i < out.length; i++) if (rng() < eps) out[i] ^= 1;
  return out;
}

/* ---------- 执行（镜像 qcExec；noise = {gamma, lambda, pdep, eps, peq, gDown, gUp} | null） ---------- */
function qcnNoiseAfter(rho, g, noise){
  if (!noise) return;
  const { gamma, lambda, pdep, peq, gDown, gUp } = noise;
  if (!(gamma > 0 || lambda > 0 || pdep > 0)) return;
  for (const q of qcnGateTouched(g)){
    if (gamma > 0){
      /* R107：p_eq>0 ⟹ 热通道（GAD）；p_eq=0 ⟹ 精确走 R104 振幅阻尼原路径（零回归） */
      if (peq > 0) qcnThermal(rho, q, gDown, gUp);
      else qcnAmpDamp(rho, q, gamma);
    }
    if (lambda > 0) qcnPhaseDamp(rho, q, lambda);
    if (pdep > 0) qcnDepolar(rho, q, pdep);
  }
}
function qcnExec(rho, op, cres, rng, noise = null){
  if (op.op === 'measure'){
    const eps = noise ? noise.eps : 0;
    if (op.qubits){
      const trueBits = qcnMeasureJoint(rho, op.qubits, rng, op.basis || 'bell');
      const bits = qcnFlipBits(trueBits, eps, rng);      /* R106：记录位可翻，态不翻 */
      if (cres && op.cbit != null) for (let i = 0; i < bits.length; i++) cres[op.cbit + i] = bits[i];
      return { kind: 'measure', qubits: op.qubits.slice(), cbit: op.cbit, bits, trueBits, basis: op.basis || 'bell', joint: true };
    }
    const trueBit = qcnMeasureQubit(rho, op.q, rng, op.basis || 'z');
    const bit = qcnFlipBits([trueBit], eps, rng)[0];
    if (cres && op.cbit != null) cres[op.cbit] = bit;
    return { kind: 'measure', q: op.q, cbit: op.cbit, bit, trueBit, basis: op.basis || 'z' };
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
function qcnRunProgram(rho, ops, rng, cres = null, noise = null){
  const c = cres || new Uint8Array(8);
  const rec = [];
  for (const op of ops) rec.push(qcnExec(rho, op, c, rng, noise));
  return { cres: c, rec };
}

/* ---------- 观测量 ---------- */
function qcnProbs(rho){
  const p = new Float64Array(rho.dim);
  for (let i = 0; i < rho.dim; i++) p[i] = rho.re[i * rho.dim + i];
  return p;
}
function qcnTrace(rho){
  const D = rho.dim;
  let tr = 0;
  for (let i = 0; i < D; i++) tr += rho.re[i * D + i];
  return tr;
}
function qcnPurity(rho){
  const D = rho.dim;
  let s = 0;
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++){
    const a = rho.re[i * D + j], b = rho.im[i * D + j];
    s += a * a + b * b;                     /* ρ 厄米 ⟹ trρ² = Σ|ρ_ij|² */
  }
  return s;
}
/* 最大非对角相干 max|ρ_ij|（i≠j）——混合态里「还剩多少量子性」的读数 */
function qcnMaxCoh(rho){
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
function qcnSampleRho(rho, rng){
  const p = qcnProbs(rho);
  const u = rng();
  let acc = 0;
  for (let i = 0; i < rho.dim; i++){ acc += p[i]; if (u < acc) return i; }
  return rho.dim - 1;
}
function qcnCollapseRho(rho, idx){
  const D = rho.dim;
  rho.re.fill(0); rho.im.fill(0);
  rho.re[idx * D + idx] = 1;
  return rho;
}
/* ⟨Z_a Z_b⟩（Z 对角 ⟹ 只读 diagonal） */
function qcnZZ(rho, a, b){
  const ba = 1 << a, bb = 1 << b, D = rho.dim;
  let v = 0;
  for (let i = 0; i < D; i++){
    const sa = (i & ba) ? -1 : 1, sb = (i & bb) ? -1 : 1;
    v += sa * sb * rho.re[i * D + i];
  }
  return v;
}
/* 单比特约化密度矩阵（2×2 复；保真度 HUD 用） */
function qcnQubitRho(rho, q){
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
function qcnPermuteRho(rho, mask){
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
function qcnEntropySubset(rho, mask){
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
function qcnConcurrence(rho){
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

/* ===== src/physics/qec.js ===== */
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

/* ============================================================================
 * R86：门级噪声（把 R80 的 gatenoise.js 接进本模块）
 * ============================================================================
 * R78 的噪声是**静态 i.i.d.** 口径：编码后、解码前，每个数据比特独立以概率 p
 * 翻一次 Pauli。真实硬件不是这样——错误发生在**门执行之后**、跟着门走（R80）。
 * 新增 noise:'gate' 模式（默认 'iid'，与 R78 逐位一致）：
 *
 *   · 每个门作用后，对该门**触及的每个比特**（gnTouched：单比特门 1 个、
 *     CNOT 2 个）以概率 p 注入一个随机 Pauli。谱（spectrum）depolar / x / z，
 *     权重与 gatenoise.js 同一份（depolar = X/Y/Z 各 1/3）。
 *   · 制备（prep）按理想给（R80 的 noisyFrom 约定：输入态视为给定）。
 *   · ancilla 测后不重置——每个 ancilla 只用一次，天然干净（R78 即此结构）。
 *   · noisyPhase:'extract'（默认）只给综合提取段挂故障，与 R78/R79 的
 *     「编码后注错、解码前纠错」口径对齐，对照只看提取线路本身；
 *     'all' 把 encode/extract/decode 全挂上（会看到编码器/解码器自己的故障）。
 *   · **错误机会数**随之改变：i.i.d. 是 3 个（每数据比特一次）；门级是
 *     M = Σ_gates |gnTouched(g)| 个（bitflip 提取段 8、phaseflip 提取段 12、
 *     'all' 口径 16 / 26）。同一个 p，门级模式 P_L 整体更高——
 *     「门的数量 = 错误机会的数量」，这是 R86 的核心教学点。
 *
 * 判定口径（R86 起三条独立路径，任一处写错都会对不上）：
 *   ① 末态探针（flagsynd 同款，qcExpect 共享单源）：修正后、解码前，测 2 个
 *      稳定子 + 3 个逻辑算符的期望，与**理想跑同一条线路**得到的参考值比符号
 *      （signOf：|ref|<0.2 判该分量在参考态上不可观测）。五分类：
 *        perfect  残差 ∈ S（精确）
 *        logic    残差 ∈ N(S)\S（**静默**逻辑错误——容错的真正失败模式）
 *        outside  残差 ∉ N(S)（打出码空间；F<1）
 *        gauge    残差 ∉ N(S) 但 F=1（只有规范比特出错、逻辑完好）
 *        mixed    探针期望非 ±1（本线路态矢纯，实测永不出现）
 *      完备性：E∈N(S)\S ⟹ E=L·s ⟹ 与 L 反对易的逻辑分量符号必翻；参考态上
 *      三个逻辑分量的 Bloch 向量模为 1，至少一个可观测，且每个逻辑陪集至少
 *      翻其中一个可观测分量（|+i⟩ 上 Z_L 不可观但 X_L/Y_L 覆盖全部陪集，
 *      pot86 逐试验断言）。盲区（如 |+⟩ 上的 X_L）对应 F≈1 的非失败，
 *      不需要 F 兜底；F 只用于 gauge/outside 拆分。
 *   ② Pauli 帧（qcFrGate 传播 + 综合征由帧的 x 位**精确预测**）：与 ① 同点
 *      取残差判陪集，作独立对账；预测综合征还与态矢实测值逐位比对
 *      （本线路所有测量对给定故障配置都是确定的——残差恒为 Pauli，
 *      ancilla 测前恒为 Z 本征态，pot86 断言 synMiss ≡ 0）。
 *   ③ DP-over-frames 精确解：帧空间 2^{2·5}=1024 × 综合征 4 个状态，每个门后
 *      按谱分支（不错 / X / Y / Z），测量取帧位、修正查表、解码传播全是帧的
 *      确定函数 ⟹ P_L(p) 是**精确多项式**（零统计误差）。与 MC 在 4σ 内对账，
 *      小 p 展开系数 c₁/c₂ 与单/双故障枚举互校。
 *   单故障枚举（qecFaultSurvey）给一阶系数 c₁（P_L ≈ c₁p + O(p²)），
 *   二阶枚举给 c₂——DP 的小 p 展开必须同时命中两者。
 * ========================================================================== */

/* ============================================================================
 * R108：物理通道噪声（把 R104–R107 的 qcnoise.js 通道族接进本模块）
 * ============================================================================
 * 前两种口径（iid / gate）都是 **Pauli 注入**：错误是离散的 X/Y/Z，帧能精确
 * 跟踪、DP-over-frames 有零统计误差的精确解。真实硬件不是这样——错误是**连续
 * 通道**：弛豫、退相位、热激发、退极化、读出误报。新增 noise:'phys' 口径：
 *
 *   · 表示换成**密度矩阵** ρ（qcnRho，5 比特 32×32；iid/gate 的态矢路径不动，
 *     零回归）。
 *   · 数据错误保留 R78 静态块：编码后、解码前，每个数据比特独立以概率 p 翻一次
 *     spec.err（bitflip 码 X / phaseflip 码 Z）——与 iid 同一机制，P_L 的
 *     3p²−2p³ 骨架因此保留（ε=0 且门通道全关时 phys ≡ iid，见 pot108 A 节）。
 *   · 门通道（noisyPhase 内的每个门作用后，对 gnTouched 的每个比特）：
 *       振幅阻尼 / 热激发 γ=1−e^{−tg/T₁}（peq>0 走 GAD，peq=0 走振幅阻尼）
 *       相位阻尼           λ=1−e^{−tg/T₂}
 *       退极化             p_dep（ρ→(1−p)ρ+(p/3)ΣPρP）
 *     全部来自 qcnoise.js 单一数据源（与 qcircuit 线路页同一份函数、同一组
 *     t1/t2/tg/pd/re/peq 参数名）。
 *   · 读出误差（SPAM）：ancilla 的 Z 测量**量子态仍按理想投影坍缩**，但记录的
 *     经典位以概率 ε 独立翻转（qcnFlipBits）——综合征因此可能错，修正查表用的
 *     是翻后的位。单错不再必纠：p=0 时 P_L = ε(1−ε) ≠ 0（只有 m₀ 被翻才会把
 *     修正打到逻辑比特 q0 上；m₁ / 双翻的错修落在 q1/q2，是规范错误、F=1）。
 *
 * 三个新教学签名（pot108 逐条验证）：
 *   ① 读出底座：p→0 时 P_L → ε(1−ε)（bitflip 与 phaseflip 对偶同值）——与 p
 *      无关的误差底座，存储错误率再低也回不去；DP-over-syndromes 精确（B 节）。
 *   ② 退极化等价：phys 只开 p_dep 时 ≡ gate 退极化谱（通道 = 随机 Pauli 注入
 *      的系综），MC 4σ 对账 + DP 精确折线重合（C 节）——两种表示互相印证。
 *   ③ 非 Pauli 通道无精确解：γ/λ>0 时帧跟踪失效（振幅阻尼不是 Pauli），
 *      qecExactPL 返回 NaN，页面只画 MC 并显式标注（诚实限制）。
 * ========================================================================== */

/* ============================================================================
 * R109：容错读出——k 次重复综合征测量 + 多数表决（readout voting）
 * ============================================================================
 * R108 的读出误差 ε 是**单次**综合征测量的经典翻转：p=0 时底座 ε(1−ε)。
 * 真实硬件（以及 Google/IBM 的表面码实验）的标准对策：每个稳定子**独立重
 * 复测量 k 次**（每次一套 fresh ancilla），对 k 个经典记录做**多数表决**——
 * 表决后的有效读出误差
 *
 *     ε_k = P(k 次独立翻转里 ≥⌈k/2⌉ 次为 1) = Σ_{j≥⌈k/2⌉} C(k,j)ε^j(1−ε)^{k−j}
 *
 *   k=1 ⟹ ε · k=3 ⟹ 3ε²−2ε³ · k=5 ⟹ 10ε³−15ε⁴+6ε⁵（ε<1/2 时严格递减）
 *
 * 两个必须讲清楚的教学点（pot109 D/E 节逐条验证）：
 *   ① 表决只修**经典读出翻转**，不修数据错误：单个数据错误在 k 次重复里
 *      给出同一个错综合（无门噪声时逐次相同），多数表决原样复现它——P_L(p)
 *      的 3p²−2p³ 骨架不变，只是底座从 ε(1−ε) 换成 ε_k(1−ε_k)。
 *   ② 表决**不免费**：每次重复都是一次新的综合征提取（rd 倍提取门），门
 *      通道（γ/λ/p_dep）的错误机会随之翻 rd 倍——读出误差主导时 rd↑ 有利，
 *      门噪声主导时 rd↑ 反而更差。这就是「测量是有代价的」。
 *
 * 实现：qecCircuit 按 rd 分配 fresh ancilla（nq = n+(n−1)·rd，n=3 rd=1 时与
 * R108 **逐位同线路**）；执行器在修正点对各稳定子的 rd 个记录取多数；DP-over-
 * frames 的键从「2 记录位」升级为「每稳定子投票计数 0..rd」，测量分支按 ε
 * 独立翻、修正分支按 >rd/2 表决（γ=0 时仍零统计误差的精确解）。
 * ========================================================================== */

/* ============================================================================
 * R110：码距 d=n 的重复码（n=3/5）——码距与表决的两层正交
 * ============================================================================
 * R78–R109 全是 3 比特重复码（d=3：纠 1 个数据错）。把码长开到 n=5（d=5：
 * 纠 2 个数据错），与 R109 的 k 次表决读出组合出教科书的「两层防御」：
 *
 *   数据错误层（码距治）：d=2t+1 纠正 t 个数据错误。n=3 ⟹ t=1（3p²−2p³），
 *     n=5 ⟹ t=2（10p³−15p⁴+6p⁵——与 ε_5 同多项式形状，都是「5 里 ≥3」的尾率）。
 *   读出错误层（表决治 SPAM）：每个稳定子测 k 次取多数，ε→ε_k（R109）。
 *
 * 两层**正交**（pot110 E 节逐条验证）：表决只缩小 ε_k，不碰数据错误项；码距
 * 只缩小数据错误项，不碰读出底座。但两层有**耦合的代价**——稳定子数量从 2 增
 * 到 4，读出误差的暴露面翻倍：p=0 时底座从 ε(1−ε)（n=3，15 个非零表决综合征
 * 里 1 个致命）变成 2ε_k(1−ε_k)³+ε_k²(1−ε_k)²+2ε_k³(1−ε_k)（n=5，15 个里
 * 5 个致命——单比特表决翻错时有 2/4 的概率把修正引到 q0）。领先阶 ≈(n−1)/2·ε_k：
 * 码越长，读出误差越贵。这就是「测量/稳定子是有代价的」在码距维度上的版本。
 *
 * 解码器换成**最小权重**（maximum-likelihood）口径：综合征 s 的一切一致修正
 * 模式只有两个（前缀模式与其全局补集——X_L=ⁿX 的零综合征），取轻者。n=3 时
 * 与 R108 查表逐位等价（syn 10→q0、11→q1、01→q2、00→不动）；n=5 时修正可以
 * 落两个比特（如 syn 0010 ⟹ X₃X₄）。判决口径不变：F<0.5（q0 约化保真度）。
 * 对 bitflip 码还有一个本轮证明的简化判据（默认 |+i⟩ 态无 X 类盲区）：
 * **逻辑错误 ⟺ q0 ∈ 残差模式**（残差 = 真实错误 ⊕ 修正；X 在 q_i, i≥1 上
 * 过解码 CNOT(0→i) 不动（target X 不变），只有 q0 上的 X 毁逻辑比特）。
 * ========================================================================== */

const QEC_DEFAULTS = {
  code: 'bitflip',        /* bitflip | phaseflip */
  /* R110/R112：码长 n（码距 d=n；3 = R78 口径 / 5 = d=5 纠 2 个 / 7 = d=7 纠 3 个
     / 9 = d=9 纠 4 个数据错）。稳定子数 = n−1，ancilla 数 = (n−1)·rd，
     nq = n + (n−1)·rd（n=9·rd=1 与 n=5·rd=3 同为 nq=17 重配置）。 */
  n: 3,                   /* 3 | 5 | 7 | 9（其余值归一到 3） */
  p: 0.05,
  /* 逻辑初态 Ry(θ)Rz(φ)|0⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩。
     默认取 **|+i⟩**（θ=π/2, φ=π/2）而不是 |+⟩：X_L|+⟩=|+⟩，逻辑 X 错误在 |+⟩ 上
     **完全不可观测**（首版用 |+⟩，双错试验的保真度仍是 1，P_L 恒为 0）。 */
  theta: Math.PI / 2, phase: Math.PI / 2,
  trials: 4000,
  seed: 7,
  /* ---- R86 门级噪声 ---- */
  noise: 'iid',           /* iid（R78 静态口径，默认）| gate（R80 门级口径）| phys（R108 物理通道口径） */
  spectrum: 'depolar',    /* depolar | x | z（gate 模式；iid 模式下谱由码定：
                             bitflip 只翻 X、phaseflip 只翻 Z，与 R78 一致；
                             phys 模式忽略本字段——门通道是 T₁/T₂/退极化族，不是谱选择） */
  noisyPhase: 'extract',  /* extract（默认，只提取段）| all（encode/extract/decode） */
  /* ---- R108 物理通道参数（与 qcircuit 线路页同名同义；γ=1−e^{−tg/T₁} 等） ---- */
  t1: 3000,               /* 能量弛豫时间（任意单位；默认偏大 ⟹ 每门 γ≈3.3e-3） */
  t2: 2000,               /* 退相位时间（T₂ ≤ 2T₁ 自动满足） */
  tg: 10,                 /* 门时 */
  pd: 0.002,              /* 每门每比特退极化概率 */
  re: 0.005,              /* 每位测量记录的独立翻转概率（读出误差 ε） */
  peq: 0,                 /* 热平衡激发布居（0 = 纯弛豫 ⟹ R104 振幅阻尼） */
  /* ---- R109 容错读出：综合征重复测量次数 k（多数表决；1 = R108 单次口径） ---- */
  rd: 1,                  /* 1 | 3 | 5（奇数；每次重复一套 fresh ancilla，nq=n+(n−1)·rd）。
                             表决后有效读出误差 ε_k=ΣC(k,j)ε^j(1−ε)^{k−j}；只修经典
                             翻转、不修数据错误，且提取门机会翻 rd 倍（不免费） */
};

/* 噪声模型与谱的页面标签（src/qec.js 用） */
const QEC_NOISE = {
  iid: { label: '静态 i.i.d.', short: 'iid',
    desc: 'R78 口径：编码后、解码前，每个数据比特独立以概率 p 翻一次 Pauli（bitflip 码翻 X、phaseflip 码翻 Z）。错误**不挂在门上**——3 个数据比特 = 3 次错误机会。' },
  gate: { label: '门级（R80）', short: 'gate',
    desc: 'R80 口径：每个门作用后，对该门触及的每个比特以概率 p 注入随机 Pauli。错误机会数 = Σ|gnTouched(门)|（n=3 时提取段 8/12 个，「all」口径 16/26 个；n=5 时更多）——同一个 p，机会越多 P_L 越高。' },
  phys: { label: '物理通道（R108）', short: 'phys',
    desc: 'R108 口径：数据错误仍是静态 i.i.d. Pauli（率 p），但提取段每个门作用后对触及比特施加真实硬件通道——振幅阻尼/热激发 γ=1−e^(−tg/T₁)（按 p_eq 分配上下行）、相位阻尼 λ=1−e^(−tg/T₂)、退极化 p_d；ancilla 测量的经典记录位再以概率 ε 翻转（读出误差）。ρ 是混合态、综合征不再确定：单错不再必纠，P_L 有一个与 p 无关的底座 ε(1−ε)+门通道贡献。γ/λ>0 时无精确解（帧跟踪失效），只出 MC。' },
};
const QEC_SPECTRA = {
  depolar: { label: '退极化 X/Y/Z', short: 'depol' },
  x: { label: '仅 X', short: 'X' },
  z: { label: '仅 Z', short: 'Z' },
};

const QEC_CODES = {
  bitflip: {
    label: '比特翻转码',
    err: 'x', fix: 'x', stab: 'z',
    text: '把 α|0⟩+β|1⟩ 编成 α|0…0⟩+β|1…1⟩（n=3、5、7 或 9），每个物理比特以概率 p 翻 **X**。n−1 个稳定子 ZᵢZᵢ₊₁ 的综合唯一确定「哪些比特翻了」（最小权重解码：综合征的一致修正模式只有前缀模式与其全局补集两个，取轻的——n=3 时 10→q0、11→q1、01→q2、00→不动）。n=3（d=3）**单错必纠、双错必错**：P_L = 3p²−2p³；n=5（d=5）**≤2 错必纠、≥3 错必错**：P_L = 10p³−15p⁴+6p⁵；n=7/9 同理（≤3/≤4 错必纠，P_L = 35p⁴−84p⁵+70p⁶−20p⁷ / 126p⁵−420p⁶+540p⁷−315p⁸+70p⁹）——同 p 下高阶项被逐个压掉，但稳定子从 2 个增到 n−1 个，读出误差暴露面同步放大（p=0 底座 ≈(n−1)/2·ε_k）。',
  },
  phaseflip: {
    label: '相位翻转码',
    err: 'z', fix: 'z', stab: 'x',
    text: '同一个码在 **H 基**下的对偶：错误换成 **Z**（相位翻转），稳定子换成 XᵢXᵢ₊₁（用 ancilla 做 H–CNOT(a→d)–H 后测量）。综合与修正的逻辑完全同构（n=3 时 P_L 也是 3p²−2p³，n=5/7/9 时分别是 10p³−15p⁴+6p⁵ / 35p⁴−84p⁵+70p⁶−20p⁷ / 126p⁵−420p⁶+540p⁷−315p⁸+70p⁹）。注意它**完全不管 X 错误**——单个 Z 错能纠，一个 X 错就直接毁掉相位信息。这就是为什么真正的通用纠错要把两个码串起来（Shor 9 比特码 = 3×3），本轮只做重复码这一层。',
  },
};

/* R110/R112：码长归一（页面/URL 只暴露 3/5/7/9；非法值归一到 3）。
   n=7（d=7，t=3）与 n=9（d=9，t=4）在 R112 接入：解码器是 O(n) 前缀构造，
   本就支持任意 n；代价是 nq = n+(n−1)·rd 涨到 13/17（态矢 2^13 / 2^17）——
   由 qecExec 的 nq>18 守卫与页面的性能预算共同约束（见 qecNormN 调用方）。 */
function qecNormN(n){
  const k = Math.round(Number(n));
  return (k === 5 || k === 7 || k === 9) ? k : 3;
}

/* 错误位置数组 → n−1 个稳定子的本征值（0 = +1，1 = −1）
   ZᵢZᵢ₊₁ 对 |e₀…e_{n−1}⟩ 的本征值 = (−1)^{eᵢ+eᵢ₊₁}；X 型同理（H 基同构）。
   n=3 时返回 [e₀^e₁, e₁^e₂]，与 R78–R109 逐位一致。 */
function qecSyndromeOf(errors, n = 3){
  const N = qecNormN(n);
  const e = new Array(N).fill(0);
  for (const q of errors) if (q >= 0 && q < N) e[q] ^= 1;
  const s = [];
  for (let i = 0; i < N - 1; i++) s.push(e[i] ^ e[i + 1]);
  return s;
}

/* 综合 → 最小权重修正位列表（空 = 不动）。
   综合征 s 的一切一致 X 模式恰有两个：前缀模式 P0（e₀=0, eᵢ₊₁=eᵢ^sᵢ）与
   其全局补集 P1（≡ P0·X_L，零综合征的只有 I 与 X_L）。取轻者——n 为奇数
   时无平局。n=3 逐位复现 R108 查表（[1,0]→[0]、[1,1]→[1]、[0,1]→[2]、
   [0,0]→[]）；n=5 可返回两位（如 [0,0,1,0]→[3,4]）。 */
function qecFixFromSyndrome(syn, n = 3){
  const N = qecNormN(n);
  const e = new Array(N).fill(0);
  for (let i = 0; i < N - 1; i++) e[i + 1] = e[i] ^ ((syn[i] ? 1 : 0));
  const w0 = e.reduce((a, b) => a + b, 0);
  const fix = [];
  if (w0 * 2 > N){
    /* 补集更轻：修正位 = P0 的 0 位（q0 也在内——跨越逻辑比特的修正） */
    for (let q = 0; q < N; q++) if (!e[q]) fix.push(q);
  } else if (w0 > 0){
    for (let q = 0; q < N; q++) if (e[q]) fix.push(q);
  }
  return fix;
}

/* 逻辑错误判定（静态口径）：>t=（n−1)/2 个物理比特翻 ⟹ 最小权重解码器只能
   修掉轻补集、残差 ≡ X_L ⟹ 逻辑错误。n=3 ⟹ ≥2；n=5 ⟹ ≥3。 */
function qecIsLogicalError(errors, n = 3){
  const N = qecNormN(n);
  return errors.length > (N - 1) / 2;
}

/* 谱权重（与 gatenoise.js 的 gnSampleError 同分布；survey/DP 共用） */
function qecSpecW(spectrum){
  if (spectrum === 'x') return { x: 1, y: 0, z: 0 };
  if (spectrum === 'z') return { x: 0, y: 0, z: 1 };
  return { x: 1 / 3, y: 1 / 3, z: 1 / 3 };
}

/* ============================================================================
 * 探针掩码（qcExpect 的 (xm,zm) 形式；R110 按码长 n 生成）
 *   bitflip（计算基帧）：稳定子 ZᵢZᵢ₊₁（i=0..n−2）；逻辑 X_L=ⁿX、Z_L=Z₀、
 *     Y_L=Y₀ⁿ⁻¹X
 *   phaseflip（H 帧）：稳定子 XᵢXᵢ₊₁；逻辑 X_L^H=ⁿX、Z_L^H=ⁿZ、Y_L^H=ⁿY
 *     （整体相位不影响符号判定：参考值与实测值用同一个算符，且陪集归属
 *     只看交换关系）
 *   代表元可差一个稳定子（对码空间态期望相同，R86 论证见头注）。
 * ========================================================================== */
const QEC_PROBE_CACHE = new Map();
function qecProbes(code, n){
  const N = qecNormN(n);
  const key = code + '|' + N;
  let P = QEC_PROBE_CACHE.get(key);
  if (P) return P;
  const full = (1 << N) - 1;
  const stabs = [];
  for (let i = 0; i < N - 1; i++){
    const pair = 0b11 << i;
    stabs.push(code === 'phaseflip' ? { xm: pair, zm: 0 } : { xm: 0, zm: pair });
  }
  P = code === 'phaseflip'
    ? { stabs, XL: { xm: full, zm: 0 }, ZL: { xm: 0, zm: full }, YL: { xm: full, zm: full } }
    : { stabs, XL: { xm: full, zm: 0 }, ZL: { xm: 0, zm: 1 }, YL: { xm: full, zm: 1 } };
  QEC_PROBE_CACHE.set(key, P);
  return P;
}

/* 末态探针：n−1 个稳定子期望 + 3 个逻辑期望（ancilla 已测掉，只读数据比特） */
function qecProbe(s, code, n = 3){
  const P = qecProbes(code, n);
  const synErr = [];
  let mixed = false;
  for (const g of P.stabs){
    const e = qcExpect(s, g.xm, g.zm);
    if (e < -0.5) synErr.push(1);
    else if (e > 0.5) synErr.push(0);
    else { synErr.push(-1); mixed = true; }
  }
  return {
    synErr, mixed,
    XL: qcExpect(s, P.XL.xm, P.XL.zm),
    ZL: qcExpect(s, P.ZL.xm, P.ZL.zm),
    YL: qcExpect(s, P.YL.xm, P.YL.zm),
  };
}

/* ---------- 分类：末态探针 + 参考态 → 陪集（flagsynd fsClass 同款） ---------- */
function signOf(v, ref){
  if (Math.abs(ref) < 0.2) return 0;      /* 该分量在参考态上不可观测 */
  return (v * ref >= 0) ? 1 : -1;
}
function qecClass(pre, ref, F){
  if (!pre || pre.mixed) return { coset: -2, cls: 'mixed' };
  /* 残差 ∉ N(S)（有稳定子期望为 −1）分两种：F=1 说明**只有规范比特**出错、
     逻辑比特完好（码空间的「位置」偏了但 q0 仍是目标纯态）；F<1 才是逻辑信息受损。
     例：bitflip 码里混进来的一个 Z 错（静态口径下不会发生，门级退极化会）。 */
  if (pre.synErr.some(b => b === 1)){
    const f = F == null ? 0 : F;
    return { coset: -1, cls: f > 1 - 1e-9 ? 'gauge' : 'outside' };
  }
  const sX = signOf(pre.XL, ref.XL);
  const sZ = signOf(pre.ZL, ref.ZL);
  const sY = signOf(pre.YL, ref.YL);
  let coset = 0;
  if (sZ === -1 && sY === -1 && sX === 1) coset = 1;        /* X_L */
  else if (sX === -1 && sY === -1 && sZ === 1) coset = 2;   /* Z_L */
  else if (sX === -1 && sZ === -1 && sY === 1) coset = 3;   /* Y_L */
  else if (sX === -1 || sZ === -1 || sY === -1) coset = 1;  /* 兜底（参考态盲区下的
     保守判：至少有一个可观测分量翻了，必是逻辑错误；具体陪集号以帧路径为准） */
  return { coset, cls: coset === 0 ? 'perfect' : 'logic', sX, sY, sZ };
}

/* ---------- 解码后判定（物理问题：逻辑比特有没有坏） ----------
   解码把码空间映到 q0 单个逻辑比特，q1..q_{n−1} 理应归 |0⟩。残差帧只看数据位：
   q0 上有 X/Y ⟹ 逻辑 X 型；Z/Y ⟹ 逻辑 Z 型；皆有 ⟹ Y 型；q0 干净而其他数据位
   脏 ⟹ gauge（逻辑完好、物理比特脏，F=1 精确成立）；全干净 ⟹ perfect。
   与 F<0.5 在非退化参考态上逐位一致（pot86 断言）；盲区（|+⟩ 上的 X_L）
   帧说 logic 而 F=1——那是参考态看不见，不是判定错。 */
function qecDecodedClass(fr, n = 3){
  const m = (1 << qecNormN(n)) - 1;
  const x = fr.x & m, z = fr.z & m;
  const x0 = x & 1, z0 = z & 1;
  if (x0 && z0) return { coset: 3, cls: 'logic' };
  if (x0) return { coset: 1, cls: 'logic' };
  if (z0) return { coset: 2, cls: 'logic' };
  if (x || z) return { coset: -1, cls: 'gauge' };
  return { coset: 0, cls: 'perfect' };
}

/* ---------- 帧残差 → 码空间陪集（与探针独立的一条路径；R110 按 n 生成） ---------- */
const QEC_STAB_SPAN = (() => {
  const cache = new Map();
  const mk = (code, n) => {
    const N = qecNormN(n);
    const key = code + '|' + N;
    let set = cache.get(key);
    if (set) return set;
    const gens = [];
    for (let i = 0; i < N - 1; i++){
      const pair = 0b11 << i;
      gens.push(code === 'phaseflip' ? { xm: pair, zm: 0 } : { xm: 0, zm: pair });
    }
    /* R112：键基 = 2^N（x/z 掩码各宽 N 位）。旧口径 x*32+z 只在 n≤5 时单射——
       n=7 起掩码宽 6+ 位，不同 (x,z) 撞同键（实测 {x:1,z:1}=Y₀ 撞上稳定子
       {x:0,z:33}⟹ 单 Y 错被误判 perfect）。x·2^N+z ≤ 2^18（n=9）整数精确。 */
    const P2 = 1 << N;
    set = new Set();
    for (let m = 0; m < (1 << gens.length); m++){
      let x = 0, z = 0;
      for (let b = 0; b < gens.length; b++) if (m & (1 << b)){ x ^= gens[b].xm; z ^= gens[b].zm; }
      set.add(x * P2 + z);
    }
    cache.set(key, set);
    return set;
  };
  return { mk, get: (code, n) => mk(code, n) };
})();
function qecLogicSet(code, n){
  const N = qecNormN(n);
  const full = (1 << N) - 1;
  return code === 'phaseflip'
    ? [{ xm: full, zm: 0 }, { xm: 0, zm: full }, { xm: full, zm: full }]
    : [{ xm: full, zm: 0 }, { xm: 0, zm: 1 }, { xm: full, zm: 1 }];
}
/* 帧陪集：0 = ∈S（perfect）· 1/2/3 = X_L/Z_L/Y_L 陪集（logic）· −1 = ∉N(S)
   R112：键 = x·2^N+z（与 QEC_STAB_SPAN 同基；n=9 ⟹ ≤2^18 精确）。 */
function qecFrameCoset(code, fr, n = 3){
  if (!fr.x && !fr.z) return 0;
  const span = QEC_STAB_SPAN.get(code, n);
  const P2 = 1 << qecNormN(n);
  if (span.has(fr.x * P2 + fr.z)) return 0;
  const L = qecLogicSet(code, n);
  for (let i = 0; i < 3; i++){
    if (span.has((fr.x ^ L[i].xm) * P2 + (fr.z ^ L[i].zm))) return i + 1;
  }
  return -1;
}
/* 帧的最小权重代表元（S 内元素物理上不可见——不取最小会把「无害的稳定子」
   报成权重 2，flagsynd 踩过的坑，pot81 抓出） */
function qecFrameWeight(code, fr, n = 3){
  const span = QEC_STAB_SPAN.get(code, n);
  const m = (1 << qecNormN(n)) - 1;
  const P2 = m + 1;
  let best = popc((fr.x | fr.z) & m);
  for (const k of span){
    const x = (k / P2) | 0, z = k % P2;
    const w = popc(((fr.x ^ x) | (fr.z ^ z)) & m);
    if (w < best) best = w;
  }
  return best;
}
function popc(v){ let c = 0; while (v){ c += v & 1; v >>>= 1; } return c; }

/* ============================================================================
 * 线路（单一数据源：试验 / 故障枚举 / 门数统计共用，保证枚举与真跑不 diverg）
 * ========================================================================== */
const CIRC_CACHE = new Map();
function qecCircuit(code = 'bitflip', cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const spec = QEC_CODES[code] || QEC_CODES.bitflip;
  const isPhase = code === 'phaseflip';
  /* R109：读出表决重复数（奇数 1/3/5；非法值归一到 1）。rd 进缓存键——
     线路结构（ancilla 数/测量数）随它变，与 code/theta/phase 同级。
     R110：码长 n（3/5；非法值归一到 3）同样进键——数据比特数/稳定子数随它变。 */
  const rd = qecNormRd(c.rd);
  const n = qecNormN(c.n);
  const key = `${code}|${c.theta}|${c.phase}|${n}|${rd}`;
  let circ = CIRC_CACHE.get(key);
  if (circ) return circ;
  const ops = [];
  const push = (o) => { ops.push(o); return ops.length - 1; };
  /* ① 逻辑初态（理想；帧在此必为零，非 Clifford 门的帧抛错不会触发） */
  push({ op: 'ry', q: 0, theta: c.theta, ph: 'prep' });
  push({ op: 'rz', q: 0, theta: c.phase, ph: 'prep' });
  /* ② 编码（CNOT(0→i), i=1..n−1；phaseflip 追加 H×n 转入 H 帧——稳定子是 X 型，
     α|0…0⟩+β|1…1⟩ 不是 X 稳定子本征态；首版漏了这三步 H，测出的综合恒为 01）。
     n=3 时 CNOT(0→1),CNOT(0→2) 与 R108 逐位相同（零回归锚点）。 */
  for (let i = 1; i < n; i++) push({ op: 'cnot', c: 0, q2: i, ph: 'encode' });
  if (isPhase) for (let q = 0; q < n; q++) push({ op: 'h', q, ph: 'encode' });
  /* ③ 静态噪声块的决策点（gate 模式跳过：错误挂在门上，没有静态块） */
  push({ op: 'noise', ph: 'noise' });
  /* ④ 稳定子测量（stab si 测 ZᵢZᵢ₊₁ 或 XᵢXᵢ₊₁；ancilla 编号 n+si·rd+rp）。
     X 类用 H–CNOT(a→d)–H 的相位反冲：有效操作条件于 X_{qa}X_{qb}，
     对稳定子本征态给出确定读数且不动数据（R78 同款，pot78 B5 同构验证）。
     R109：每个稳定子**重复 rd 次**，每次一套 fresh ancilla（ancilla 测后
     不重置——重复利用会把综合征又 XOR 一次，物理上错）；rd=1 且 n=3 时
     ancilla 编号 3/4、ops 序列与 R108 逐位相同（零回归）。 */
  for (let si = 0; si < n - 1; si++){
    const qa = si, qb = si + 1;
    for (let rp = 0; rp < rd; rp++){
      const anc = n + si * rd + rp;
      if (spec.stab === 'z'){
        push({ op: 'cnot', c: qa, q2: anc, ph: 'extract', stab: si });
        push({ op: 'cnot', c: qb, q2: anc, ph: 'extract', stab: si });
      } else {
        push({ op: 'h', q: anc, ph: 'extract', stab: si });
        push({ op: 'cnot', c: anc, q2: qa, ph: 'extract', stab: si });
        push({ op: 'cnot', c: anc, q2: qb, ph: 'extract', stab: si });
        push({ op: 'h', q: anc, ph: 'extract', stab: si });
      }
      push({ op: 'meas', q: anc, ph: 'extract', stab: si, rep: rp });
    }
  }
  /* ⑤ 修正点（运行期按表决后综合最小权重解码插入，不带噪声；探针在此取样） */
  push({ op: 'fix', ph: 'correct' });
  /* ⑥ 解码：phaseflip 先回计算基，再用编码的逆（CNOT 自逆，控制必须是 q0） */
  if (isPhase) for (let q = 0; q < n; q++) push({ op: 'h', q, ph: 'decode' });
  for (let i = 1; i < n; i++) push({ op: 'cnot', c: 0, q2: i, ph: 'decode' });

  /* 统计：门数 + 分相位错误机会数 M = Σ|gnTouched| */
  let gates = 0, cnots = 0, singles = 0, meas = 0;
  const opps = { prep: 0, encode: 0, extract: 0, decode: 0 };
  for (const o of ops){
    if (o.op === 'meas'){ meas++; continue; }
    if (o.op === 'fix' || o.op === 'noise') continue;
    gates++;
    if (o.op === 'cnot') cnots++; else singles++;
    opps[o.ph] = (opps[o.ph] || 0) + gnTouched(o).length;
  }
  /* ⚠ 缓存口径剔除逐次运行选项（forceErrors / faults / forceFlips）：CIRC_CACHE
     的 key 只有 code|theta|phase|n|rd，先跑的 forced 试验会把它们烘进 circ.cfg；
     qecExec 的 cfg 合并不覆盖缺失键，后续 ensemble（cfg 无这些键）会看到陈旧值
     ——空数组也 truthy ⟹ 噪声分支走空循环：不注入、不消耗 rng，PL 恒 0。R86
     复写引入的坑，基线比对抓出。qecExec 只读 opts.faults，但缓存仍须剔除以防
     语义泄漏。 */
  const cacheCfg = { ...c };
  delete cacheCfg.forceErrors;
  delete cacheCfg.forceFlips;   /* R108：phys 的强制综合征翻转（逐次运行选项，同上） */
  delete cacheCfg.faults;
  /* rd/n 是结构参数（ancilla 数/测量数），保留在 circ.cfg——执行器读它无需
     再传；逐次运行选项只有上面三个。 */
  const nq = n + (n - 1) * rd;
  circ = { code, n, rd, nq, spec, cfg: cacheCfg, ops, stats: { nq, n, rd, gates, cnots, singles, meas, opps, M: opps.encode + opps.extract + opps.decode } };
  CIRC_CACHE.set(key, circ);
  return circ;
}

/* ============================================================================
 * 执行一次（态矢 + Pauli 帧双轨；测量与修正都是帧的确定函数）
 *   opts: { rng, p, noise, spectrum, noisyPhase, faults, cfg }
 *     rng=null ⟹ 测量确定性优先（p1<1e-9→0 / >1−1e-9→1；真随机才计数，
 *              本线路实测恒确定——残差是 Pauli、ancilla 测前是 Z 本征态）
 *     faults=[{gate,q,t}] ⟹ 精确故障枚举（在该门强制注入，无视注错范围）
 * ========================================================================== */
function qecExec(circ, opts = {}){
  const c = { ...circ.cfg, ...(opts.cfg || {}) };
  const spec = circ.spec;
  const faults = opts.faults || null;
  const rng = opts.rng || null;
  const p = opts.p != null ? opts.p : (c.p || 0);
  const spectrum = opts.spectrum || c.spectrum || 'depolar';
  const gateMode = (opts.noise || c.noise || 'iid') === 'gate';
  const noisyAll = (opts.noisyPhase || c.noisyPhase || 'extract') === 'all';
  const noisyPh = gateMode ? (noisyAll ? ['encode', 'extract', 'decode'] : ['extract']) : [];
  /* R110：态矢维数守卫——nq>18 ⟹ 2^nq 维复振幅（n=5 rd=5 ⟹ nq=25 ⟹ 536MB）
     直接 OOM。页面只暴露 nq≤17 的组合（n=5 时 rd∈{1,3}）；DP-over-frames
     （qecExactPL）走帧、无态矢，不受此限。 */
  if (circ.nq > 18) throw new Error('qecExec: nq=' + circ.nq + ' ⟹ 态矢 2^' + circ.nq + ' 维过大（上限 2^18）');
  const s = qcNewState(circ.nq);
  const fr = { x: 0, z: 0 };
  const n = circ.n, nStab = n - 1, dmask = (1 << n) - 1;
  /* R109：syn 平铺全部 rd 重复（stab-major 序），synByStab 按稳定子分组供
     多数表决；rd=1 时 syn=[m₀,m₁]、表决 ≡ 直接取位（与 R108 逐位一致）。
     R110：稳定子数 = n−1（n=3 ⟹ 2；n=5 ⟹ 4）。 */
  const syn = [], synByStab = Array.from({ length: nStab }, () => []), synFrame = [], fired = [];
  const diag = { random: 0, synMiss: 0 };
  const forced = new Map();
  if (faults) for (const f of faults){
    if (!forced.has(f.gate)) forced.set(f.gate, []);
    forced.get(f.gate).push(f);
  }
  const inject = (q, t, gate) => {
    gnPauli(s, q, t);
    qcFrToggle(fr, q, t);
    fired.push({ gate, q, t });
  };
  const noiseErrors = [];     /* R78 口径：i.i.d. 静态块命中的数据比特 */
  let fixQ = -1, fixQs = [], pre = null, frAtFix = null;

  /* 测量：rng 在时走 qcMeasureQubit（与 R78 逐位一致：总是消费一次 rng）；
     无 rng 时确定性优先（枚举用）。帧预测 syn = 帧的 x 位（Z 读数被 X 型残差翻）。 */
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
      for (let i = 0; i < s.dim; i++){ if (((i & bit) ? 1 : 0) !== out){ s.re[i] = 0; s.im[i] = 0; } }
      let nrm = 0;
      for (let i = 0; i < s.dim; i++) nrm += s.re[i] * s.re[i] + s.im[i] * s.im[i];
      if (nrm > 0){ const rr = 1 / Math.sqrt(nrm); for (let i = 0; i < s.dim; i++){ s.re[i] *= rr; s.im[i] *= rr; } }
    }
    const sf = (fr.x >> q) & 1;
    synFrame.push(sf);
    if (sf !== out) diag.synMiss++;
    return out;
  };

  for (let i = 0; i < circ.ops.length; i++){
    const o = circ.ops[i];
    if (o.op === 'noise'){
      /* 静态 i.i.d. 块：逐数据比特独立以 p 施加 spec.err。
         ⚠ rng 消耗必须与 R78 一致：非 forceErrors 时每比特必调一次 rng()
         （哪怕 p=0），否则 MC 轨迹整体错位、逐位回归失败。 */
      if (gateMode) continue;
      if (c.forceErrors){
        for (const q of c.forceErrors){
          qcApply(s, { op: spec.err, q });
          qcFrToggle(fr, q, spec.err);
          noiseErrors.push(q);
        }
      } else {
        for (let q = 0; q < n; q++){
          if (rng && rng() < p){
            qcApply(s, { op: spec.err, q });
            qcFrToggle(fr, q, spec.err);
            noiseErrors.push(q);
          }
        }
      }
      continue;
    }
    if (o.op === 'meas'){
      const b = measure(o.q);
      syn.push(b);
      synByStab[o.stab != null ? o.stab : 0].push(b);
      continue;
    }
    if (o.op === 'fix'){
      /* R109：修正查表用**表决后**的综合（每位 = 该稳定子 rd 个记录的多数）。
         R110：最小权重解码——n=3 时恰 0/1 个修正位（fixQ 语义不变），n=5 时
         可两位（如 voted=0010 ⟹ X₃X₄）。fixQ 保留为「首个修正位」（−1 = 不动），
         fixQs 是完整列表（UI/调试用）。 */
      const voted = synByStab.map(qecMajority);
      fixQs = qecFixFromSyndrome(voted, n);
      fixQ = fixQs.length ? fixQs[0] : -1;
      for (const fq of fixQs){
        qcApply(s, { op: spec.fix, q: fq });
        qcFrToggle(fr, fq, spec.fix);
      }
      /* 探针取样点：所有修正已完成、解码之前（码空间仍完好定义） */
      pre = qecProbe(s, circ.code, n);
      frAtFix = { x: fr.x & dmask, z: fr.z & dmask };
      continue;
    }
    /* 普通门 */
    qcApply(s, o);
    qcFrGate(fr, o);
    if (gateMode){
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
  }

  /* ⑦ 逻辑判定：q0 的部分迹 vs 目标纯态 |ψ0⟩（R78 口径，零回归）。 */
  const th = c.theta / 2, ph = c.phase;
  const alpha = [Math.cos(th), 0];
  const beta = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)];
  const F = qcRhoFidelity(qcQubitRho(s, 0), alpha, beta);
  const rho0 = qcQubitRho(s, 0);
  const frAtEnd = { x: fr.x & dmask, z: fr.z & dmask };
  const dec = qecDecodedClass(frAtEnd, n);
  return {
    syn, synVoted: synByStab.map(qecMajority), synFrame, fixQ, fixQs, pre, frAtFix, frAtEnd,
    cosetFix: qecFrameCoset(circ.code, frAtFix, n),
    cosetDec: dec.coset, clsDec: dec.cls,
    F, logicalError: F < 0.5,
    errors: noiseErrors.slice(),
    fired: fired.slice(),
    state: s,
    p0: rho0.re[0][0], p1: rho0.re[1][1],
    diag,
  };
}

/* ============================================================================
 * R108：phys 口径执行一次（**量子轨迹** MCWF：态矢 + Kraus 跳变采样）
 *
 * 为什么不是「密度矩阵 + 通道」：把退极化通道**确定性地**作用到 ρ 上，会把全部
 * 错误构型的混合态一起保留下来，末态 F = Σ_k w_k·F_k 是**平均**保真度——
 * 逐试验判 F<0.5 量到的是「混合态里逻辑权重是否过半」，而不是「这次抽样到的
 * 错误构型是否致命」。QEC 的逻辑错误率是**逐次实验**口径：每次实验环境采样出
 * 一个具体错误构型，解码器据此成功或失败（首版密度矩阵实现因此把 pdep=0.01 的
 * P_L 少算了 4 倍——MC 0.013 vs DP 0.045，pot108 C1 抓出）。
 *
 * 正确口径 = 量子轨迹（Monte Carlo wave functions）：每次试验在态矢上**采样**
 * 每个错误机会的一个 Kraus 结果，轨迹系综与密度矩阵通道逐位同分布：
 *   · 退极化 p_dep：gnSampleError('depolar') —— 无操作 w.p. 1−p，X/Y/Z 各 p/3
 *     （与 gate 模式同一函数、同一分布 ⟹ pdep-only ≡ gate 退极化谱，4σ 对账）。
 *   · 相位阻尼 λ：Kraus E₁=√(λ/2)·Z ⟹ w.p. λ/2 施加 Z（保迹 Pauli「跳变」，
 *     帧仍可跟踪）。通道 = (1−λ/2)ρ + (λ/2)ZρZ，跨位相干 ×(1−λ) ✓。
 *   · 振幅阻尼 / 热激发 γ（peq>0 走 GAD）：down（|1⟩→|0⟩）w.p. gDown·p₁、
 *     up（|0⟩→|1⟩）w.p. gUp·p₀；不跳则施加 E₀=diag(√(1−gUp),√(1−gDown))
 *     并重归一（||E₀ψ||² = 1−gUp·p₀−gDown·p₁）。peq=0 ⟹ 纯 R104 振幅阻尼。
 *     跳变不是 Pauli ⟹ **Pauli 帧失效**（frameOK 闩死，诚实标注）。
 *   · 读出误差 ε：量子态按理想投影坍缩，记录经典位以 ε 翻转（qcnFlipBits；
 *     ε=0 不消耗 rng）。
 * 数据错误保留 R78 静态块（率 p 的 spec.err 注入）——P_L 的 3p²−2p³ 骨架因此
 * 保留：全通道关闭时本路径与 iid **逐位一致**（同 rng 消耗形状、同确定性结果）。
 *
 * 判定：q0 约化 ρ vs 目标纯态，F<0.5 ⟺ 逻辑错误（R78 口径，逐次实验）。
 * 帧：Pauli 事件（depol / phase-Z）照常 qcFrToggle；synFrame 是帧对测量结果的
 *   独立预测，frameOK 时与真实测量位逐位一致（ε 无关——翻的只是经典记录），
 *   diag.frameMiss 恒 0（pot108 D 节断言）。
 * ========================================================================== */
function qecExecPhys(circ, opts = {}){
  const c = { ...circ.cfg, ...(opts.cfg || {}) };
  const spec = circ.spec;
  const rng = opts.rng || null;
  if (!rng) throw new Error('qecExecPhys: rng required（轨迹跳变与测量是随机的）');
  const p = opts.p != null ? opts.p : (c.p || 0);
  const noisyAll = (opts.noisyPhase || c.noisyPhase || 'extract') === 'all';
  const noisyPh = noisyAll ? ['encode', 'extract', 'decode'] : ['extract'];
  const np = qcnNoiseParams(c.t1, c.t2, c.tg, c.pd, c.re, c.peq);
  /* R110：态矢维数守卫（同 qecExec：n=5 rd=5 ⟹ nq=25 ⟹ 2^25 维 = 536MB） */
  if (circ.nq > 18) throw new Error('qecExecPhys: nq=' + circ.nq + ' ⟹ 态矢 2^' + circ.nq + ' 维过大（上限 2^18）');
  const s = qcNewState(circ.nq);
  const fr = { x: 0, z: 0 };
  const n = circ.n, nStab = n - 1, dmask = (1 << n) - 1;
  let frameOK = true;                 /* T1/热激发跳变不是 Pauli ⟹ 帧失效（闩死） */
  /* R109：syn/synTrue/flips 平铺全部 rd 重复（stab-major 序）；synByStab /
     synTrueByStab 按稳定子分组供多数表决与表决后错位统计。rd=1 时
     syn=[m₀,m₁]、表决 ≡ 直接取位（与 R108 逐位一致）。
     R110：稳定子数 = n−1（n=3 ⟹ 2；n=5 ⟹ 4）。 */
  const syn = [], synByStab = Array.from({ length: nStab }, () => []), synTrueByStab = Array.from({ length: nStab }, () => []), synFrame = [], synTrue = [], flips = [], fired = [];
  const noiseErrors = [];
  let fixQ = -1, fixQs = [], pre = null, frAtFix = null;
  const diag = { frameMiss: 0, jumps: 0 };

  /* 单比特 |1⟩ 布居（跳变概率用） */
  const pop1 = (q) => {
    const bit = 1 << q;
    let p1 = 0;
    for (let i = 0; i < s.dim; i++) if (i & bit) p1 += s.re[i] * s.re[i] + s.im[i] * s.im[i];
    return p1;
  };
  /* T₁/热激发跳变（MCWF）：down w.p. gDown·p₁、up w.p. gUp·p₀，其余走 E₀+重归一 */
  const thermalJump = (q, gate) => {
    const bit = 1 << q;
    const p1 = pop1(q);
    const pDown = np.gDown * p1, pUp = np.gUp * (1 - p1);
    const u = rng();
    if (u < pDown){
      /* down：|1⟩⟨1| 振幅搬到 |0⟩⟨0|，除 √p₁ */
      for (let i0 = 0; i0 < s.dim; i0++){
        if (i0 & bit) continue;
        s.re[i0] = s.re[i0 | bit]; s.im[i0] = s.im[i0 | bit];
        s.re[i0 | bit] = 0; s.im[i0 | bit] = 0;
      }
      const k = p1 > 0 ? 1 / Math.sqrt(p1) : 0;
      for (let i = 0; i < s.dim; i++){ s.re[i] *= k; s.im[i] *= k; }
      fired.push({ gate, q, t: 't1', kind: 't1' });
      frameOK = false;
      return;
    }
    if (u < pDown + pUp){
      /* up：|0⟩⟨0| 振幅搬到 |1⟩⟨1|，除 √p₀ */
      for (let i0 = 0; i0 < s.dim; i0++){
        if (i0 & bit) continue;
        s.re[i0 | bit] = s.re[i0]; s.im[i0 | bit] = s.im[i0];
        s.re[i0] = 0; s.im[i0] = 0;
      }
      const k = (1 - p1) > 0 ? 1 / Math.sqrt(1 - p1) : 0;
      for (let i = 0; i < s.dim; i++){ s.re[i] *= k; s.im[i] *= k; }
      fired.push({ gate, q, t: 'up', kind: 'up' });
      frameOK = false;
      return;
    }
    /* 不跳：E₀ = diag(√(1−gUp), √(1−gDown))，重归一 1/√(1−pUp−pDown) */
    const sc0 = Math.sqrt(1 - np.gUp), sc1 = Math.sqrt(1 - np.gDown);
    const k = (1 - pUp - pDown) > 0 ? 1 / Math.sqrt(1 - pUp - pDown) : 0;
    for (let i = 0; i < s.dim; i++){
      const sc = (i & bit) ? sc1 : sc0;
      s.re[i] *= sc * k; s.im[i] *= sc * k;
    }
  };

  /* 测量（与 qecExec 同口径：qcMeasureQubit 投影坍缩；帧给独立预测）。
     R109：stab 参数把记录按稳定子归组（rd 次重复各自独立翻）；forceFlips
     是**平铺**的逐测量翻转掩码 [δ₀..δ_{(n−1)·rd−1}]（rd=1 且 n=3 时就是
     R108 的 [δ₀,δ₁]）。 */
  const measure = (q, stab) => {
    const tb = qcMeasureQubit(s, q, rng);
    /* forceFlips=[δ…]：测试用——记录位 = 真实位 ⊕ δ（不消耗 rng），
       与 forceErrors 同属逐次运行选项（CIRC_CACHE 已剔除，不烘进 circ.cfg） */
    const bit = c.forceFlips ? (tb ^ (c.forceFlips[syn.length] ? 1 : 0)) : qcnFlipBits([tb], np.eps, rng)[0];
    const sf = (fr.x >> q) & 1;
    syn.push(bit); synTrue.push(tb); synFrame.push(sf);
    synByStab[stab].push(bit); synTrueByStab[stab].push(tb);
    flips.push(bit === tb ? 0 : 1);
    if (frameOK && tb !== sf) diag.frameMiss++;
    return bit;
  };

  for (let i = 0; i < circ.ops.length; i++){
    const o = circ.ops[i];
    if (o.op === 'noise'){
      /* 静态数据块：与 iid 同机制（非 forceErrors 时每比特必调一次 rng） */
      if (c.forceErrors){
        for (const q of c.forceErrors){
          qcApply(s, { op: spec.err, q });
          qcFrToggle(fr, q, spec.err);
          noiseErrors.push(q);
        }
      } else {
        for (let q = 0; q < n; q++){
          if (rng() < p){
            qcApply(s, { op: spec.err, q });
            qcFrToggle(fr, q, spec.err);
            noiseErrors.push(q);
          }
        }
      }
      continue;
    }
    if (o.op === 'meas'){ measure(o.q, o.stab || 0); continue; }
    if (o.op === 'fix'){
      /* R109：修正查表用**表决后**的综合；bitErr = 表决位 ≠ 真实位多数
         （rd=1 时 ≡ flips——单次记录的翻转指示）。R110：n−1 个稳定子位 +
         最小权重解码（可多位修正）。 */
      const voted = synByStab.map(qecMajority);
      const trueMj = synTrueByStab.map(qecMajority);
      fixQs = qecFixFromSyndrome(voted, n);
      fixQ = fixQs.length ? fixQs[0] : -1;
      for (const fq of fixQs){
        qcApply(s, { op: spec.fix, q: fq });
        qcFrToggle(fr, fq, spec.fix);
      }
      pre = qecProbe(s, circ.code, n);
      frAtFix = { x: fr.x & dmask, z: fr.z & dmask };
      continue;
    }
    /* 普通门 + 门后通道（thermal → phase → depol，与 qcnNoiseAfter 同序） */
    qcApply(s, o);
    qcFrGate(fr, o);
    if (o.ph !== 'prep' && noisyPh.includes(o.ph)){
      for (const q of gnTouched(o)){
        if (np.gamma > 0){ thermalJump(q, i); diag.jumps++; }
        if (np.lambda > 0 && rng() < np.lambda / 2){
          qcApply(s, { op: 'z', q });
          qcFrToggle(fr, q, 'z');
          fired.push({ gate: i, q, t: 'z', kind: 'phase' });
        }
        if (np.pdep > 0){
          const t = gnSampleError('depolar', np.pdep, rng);
          if (t){
            gnPauli(s, q, t);
            qcFrToggle(fr, q, t);
            fired.push({ gate: i, q, t, kind: 'depol' });
          }
        }
      }
    }
  }

  /* ⑦ 逻辑判定：q0 约化 vs 目标纯态（R78 口径，零回归） */
  const th = c.theta / 2, ph = c.phase;
  const alpha = [Math.cos(th), 0];
  const beta = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)];
  const F = qcRhoFidelity(qcQubitRho(s, 0), alpha, beta);
  const rho0 = qcQubitRho(s, 0);
  const frAtEnd = { x: fr.x & dmask, z: fr.z & dmask };
  const dec = frameOK ? qecDecodedClass(frAtEnd, n) : { coset: null, cls: null };
  const voted = synByStab.map(qecMajority);
  const trueMj = synTrueByStab.map(qecMajority);
  return {
    syn, synVoted: voted, synTrue, flips, fixQ, fixQs, pre, frAtFix, frAtEnd,
    bitErr: voted.map((v, i) => v ^ trueMj[i]),
    cosetFix: frameOK ? qecFrameCoset(circ.code, frAtFix, n) : null,
    cosetDec: dec.coset, clsDec: dec.cls,
    F, logicalError: F < 0.5,
    errors: noiseErrors.slice(),
    fired: fired.slice(),
    frameOK,
    state: s,
    p0: rho0.re[0][0], p1: rho0.re[1][1],
    diag,
  };
}
/* 理想跑同一条线路取参考期望（探针判据的基准；缓存）。R110：n 进键——
   线路结构（比特数/稳定子数）随它变。 */
const REF_CACHE = new Map();
function qecRef(circ){
  const key = circ.code + '|' + circ.cfg.theta + '|' + circ.cfg.phase + '|' + (circ.n || 3);
  let r = REF_CACHE.get(key);
  if (!r){
    const run = qecExec(circ, { rng: null, p: 0, noise: 'iid' });
    r = { ...run.pre, synErr: run.pre.synErr.slice(), F: run.F, syn: run.syn.slice(), fixQ: run.fixQ };
    REF_CACHE.set(key, r);
  }
  return r;
}

/* ============================================================================
 * 单次试验：真跑 5 比特态矢（3 数据 + 2 ancilla），返回全过程
 *   cfg: { code, p, theta, phase, noise, spectrum, noisyPhase, forceErrors, faults }
 *     forceErrors: iid 模式的强制错误位（测试用）
 *     faults: [{gate,q,t}] gate 模式的强制注入位点（测试用；无视注错范围）
 *   rng: mulberry32 风格。i.i.d 模式与 R78 逐位一致（rng 消耗序不变）。
 * ========================================================================== */
function qecTrial(cfg = {}, rng){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const circ = qecCircuit(c.code, c);
  const nEnc = circ.n;
  if (c.noise === 'phys'){
    /* R108：量子轨迹路径（rng 必需——跳变与测量都随机；页面/测试都传 rng） */
    const r = qecExecPhys(circ, { rng, cfg: c });
    const ref = qecRef(circ);
    const cl = qecClass(r.pre, ref, r.F);
    const trace = [];
    trace.push({ step: 'prepare', gate: 'Ry(θ)Rz(φ)' });
    trace.push({ step: 'encode', gate: 'CNOT×' + (nEnc - 1) });
    if (c.code === 'phaseflip') trace.push({ step: 'basis', gate: 'H×' + nEnc });
    trace.push({ step: 'noise', errors: r.errors.slice() });
    trace.push({ step: 'gatenoise', faults: r.fired.slice() });
    trace.push({ step: 'syndrome', syn: r.syn.slice(), synVoted: r.synVoted.slice(), synTrue: r.synTrue.slice(), flips: r.flips.slice(), bitErr: r.bitErr.slice() });
    trace.push({ step: 'correct', q: r.fixQ, qs: r.fixQs.slice() });
    if (c.code === 'phaseflip') trace.push({ step: 'basis', gate: 'H×' + nEnc });
    trace.push({ step: 'decode', gate: 'CNOT×' + (nEnc - 1) });
    return {
      errors: r.errors, syn: r.syn, synVoted: r.synVoted, synTrue: r.synTrue, synFrame: r.synFrame, flips: r.flips, bitErr: r.bitErr, fixQ: r.fixQ, fixQs: r.fixQs,
      F: r.F, logicalError: r.logicalError, ok: !r.logicalError,
      trace,
      p0: r.p0, p1: r.p1,
      state: r.state,
      noise: 'phys', rd: c.rd, n: nEnc,
      /* 探针五分类（轨迹态是纯态，分类照常）；帧分类仅 frameOK 时有效 */
      cls: cl.cls, coset: cl.coset, sX: cl.sX, sY: cl.sY, sZ: cl.sZ,
      clsDec: r.clsDec, cosetDec: r.cosetDec, synFrame: r.synFrame, pre: r.pre,
      faults: r.fired, frameOK: r.frameOK,
    };
  }
  const ref = qecRef(circ);
  const r = qecExec(circ, { rng, cfg: c, faults: c.faults || null });
  const cl = qecClass(r.pre, ref, r.F);
  const trace = [];
  trace.push({ step: 'prepare', gate: 'Ry(θ)Rz(φ)' });
  trace.push({ step: 'encode', gate: 'CNOT×' + (nEnc - 1) });
  if (c.code === 'phaseflip') trace.push({ step: 'basis', gate: 'H×' + nEnc });
  if (c.noise === 'gate'){
    trace.push({ step: 'gatenoise', faults: r.fired.slice() });
  } else {
    trace.push({ step: 'noise', errors: r.errors.slice() });
  }
  trace.push({ step: 'syndrome', syn: r.syn.slice(), synVoted: r.synVoted.slice(), synFrame: r.synFrame.slice() });
  trace.push({ step: 'correct', q: r.fixQ, qs: r.fixQs.slice() });
  if (c.code === 'phaseflip') trace.push({ step: 'basis', gate: 'H×' + nEnc });
  trace.push({ step: 'decode', gate: 'CNOT×' + (nEnc - 1) });
  return {
    errors: r.errors, syn: r.syn, synVoted: r.synVoted, fixQ: r.fixQ, fixQs: r.fixQs, F: r.F, logicalError: r.logicalError,
    ok: !r.logicalError,
    trace,
    /* 码字振幅（|0…0⟩ 与 |1…1⟩ 的模方，解码后应分别在 |0…0⟩/|100…⟩ 上） */
    p0: r.p0, p1: r.p1,
    state: r.state,
    /* ---- R86 门级噪声新增 ---- */
    noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase, rd: c.rd, n: nEnc,
    faults: r.fired, cls: cl.cls, coset: cl.coset, sX: cl.sX, sY: cl.sY, sZ: cl.sZ,
    clsDec: r.clsDec, cosetDec: r.cosetDec, synFrame: r.synFrame, pre: r.pre,
  };
}

/* ============================================================================
 * 流式试验累加器（R98 P2）：step(count) 分帧跑 count 次并入累加器，
 * result() 出当前统计（trials = 已跑次数，随帧增长）。qecEnsemble 为
 * 薄封装——同一 rng 消耗序，数值与逐位一致（pot 套件不变）。
 * ========================================================================== */
function qecStream(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const phys = c.noise === 'phys';
  const rd = qecNormRd(c.rd);
  const n = qecNormN(c.n);
  const circ = qecCircuit(c.code, c);
  const ref = qecRef(circ);
  const rng = mulberry32(c.seed);
  let nTrials = 0;
  let nL = 0, nLdec = 0;
  /* R110：直方图宽度随码长走——byCount 0..n 个数据错、synCount 2^{n−1} 种
     表决后综合、byBitErr 0..n−1 个稳定子表决错位、byFlip 0..(n−1)·rd 个
     记录位被翻。n=3, rd=1 时形状与 R108/R109 逐位相同（零回归）。 */
  const byCount = new Array(n + 1).fill(0);   /* 0..n 个错（i.i.d. 口径；phys 的静态数据错） */
  const byCountL = new Array(n + 1).fill(0);  /* 其中判成逻辑错误的 */
  const synCount = new Array(1 << (n - 1)).fill(0);  /* 2^{n−1} 种综合的频次（R109：表决后的综合） */
  const fates = { perfect: 0, gauge: 0, outside: 0, logic: 0, mixed: 0 };  /* 探针（码空间） */
  const fatesDec = { perfect: 0, gauge: 0, logic: 0 };                     /* 解码后（逻辑比特） */
  /* R108 phys 专属：综合征读出翻转按个数分解（0..(n−1)·rd 个重复被翻）。
     R109：另加**表决后**错位分解（0..n−1 个稳定子位错）——voting 的直接度量。 */
  const nFlip = (n - 1) * rd;
  const byFlip = new Array(nFlip + 1).fill(0), byFlipL = new Array(nFlip + 1).fill(0);
  const byBitErr = new Array(n).fill(0), byBitErrL = new Array(n).fill(0);
  let flipSum = 0, bitErrSum = 0, jumpSum = 0, frameMissSum = 0, noFrame = 0;
  const faultHist = {};
  let faultSum = 0, synMiss = 0, randomMeas = 0, disagree = 0, disagreeBlind = 0, blind = 0;
  function one(){
    if (phys){
      const r = qecExecPhys(circ, { rng, cfg: c });
      const cl = qecClass(r.pre, ref, r.F);
      fates[cl.cls]++;
      if (r.frameOK){ fatesDec[r.clsDec]++; if (r.clsDec === 'logic') nLdec++; }
      else noFrame++;
      if (r.logicalError) nL++;
      if (r.diag.frameMiss) frameMissSum++;
      const ec = r.errors.length;
      byCount[ec]++;
      if (r.logicalError) byCountL[ec]++;
      const nf = r.flips.reduce((a, b) => a + b, 0);
      const ne = r.bitErr.reduce((a, b) => a + b, 0);
      byFlip[nf]++;
      if (r.logicalError) byFlipL[nf]++;
      byBitErr[ne]++;
      if (r.logicalError) byBitErrL[ne]++;
      flipSum += nf;
      bitErrSum += ne;
      jumpSum += r.fired.length;
      synCount[r.synVoted.reduce((a, b) => a * 2 + b, 0)]++;
      nTrials++;
      return;
    }
    const r = qecExec(circ, { rng, cfg: c });
    const cl = qecClass(r.pre, ref, r.F);
    fates[cl.cls]++;
    fatesDec[r.clsDec]++;
    if (r.clsDec === 'logic') nLdec++;
    if (r.logicalError) nL++;
    if (r.diag.synMiss) synMiss++;
    if (r.diag.random) randomMeas++;
    /* 交叉校验：探针分类 vs 帧陪集分类（同点、同残差）。唯一合法的不一致是
       修正点盲逻辑：帧见 logic 陪集而探针沉默（cl.cls='perfect'）——残差
       L∥参考 Bloch 向量，各逻辑期望都不翻，F_fix=1。注意解码后稳定子部分
       的 Z₀ 可把盲逻辑污染成真失败（Y_L·Z₀Z₁ 解码成 X₀），故不承诺 F_end；
       断言 disagree ≡ disagreeBlind（任何其他 mismatch 都是帧/探针真分歧）。 */
    const frameCls = r.cosetFix === 0 ? 'perfect'
      : r.cosetFix > 0 ? 'logic'
      : (r.F > 1 - 1e-9 ? 'gauge' : 'outside');
    if (frameCls !== cl.cls){
      disagree++;
      if (cl.cls === 'perfect' && r.cosetFix > 0) disagreeBlind++;
    }
    /* 盲区登记（末端）：帧（解码后陪集）说 logic 而 F≥0.5——本征态上逻辑
       残差作用等于恒等（|+i⟩ 上的 Y_L），物理上不是失败 */
    if (r.clsDec === 'logic' && !r.logicalError) blind++;
    if (c.noise !== 'gate'){
      const ec = r.errors.length;
      byCount[ec]++;
      if (r.logicalError) byCountL[ec]++;
    } else {
      const nf = r.fired.length;
      faultHist[nf] = (faultHist[nf] || 0) + 1;
      faultSum += nf;
    }
    synCount[r.synVoted.reduce((a, b) => a * 2 + b, 0)]++;
    nTrials++;
  }
  return {
    get total(){ return Math.max(1, c.trials | 0); },
    get n(){ return nTrials; },
    step(count){ for (let k = 0, m = Math.max(0, count | 0); k < m; k++) one(); },
    result(){
      const nn = Math.max(1, nTrials);   /* 防御 0 次 → 除 0；正常路径 n≥1 */
      return {
        p: c.p, code: c.code, trials: nTrials, PL: nL / nn, PLdec: nLdec / nn,
        /* PLexact：i.i.d. 模式 = 解析 Σ_{w>t}C(n,w)p^w(1−p)^{n−w}；gate / phys
           模式 = DP-over-frames 精确值（phys 且 γ/λ>0 时返回 NaN——非 Pauli
           通道无精确解，诚实标注） */
        PLexact: c.noise === 'iid' ? qecLogicalRate(c.p, n) : qecExactPL(c), Pun: c.p,
        noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase, rd, n,
        byCount, byCountL, synCount,
        fates, fatesDec, faultHist,
        meanFaults: c.noise === 'gate' ? faultSum / nn : NaN,
        meanFaultsIID: c.noise === 'gate' ? NaN : byCount.reduce((a, v, k) => a + k * v, 0) / nn,
        /* R108 phys：读出翻转统计（iid/gate 恒 0，字段形状保持稳定）。
           R109：byFlip 长度 (n−1)·rd+1（平铺重复的翻转直方图）；byBitErr 是
           **表决后**错位直方图（0..n−1 个稳定子位错）——voting 效果的度量 */
        byFlip: phys ? byFlip.slice() : [nn, ...new Array(nFlip).fill(0)],
        byFlipL: phys ? byFlipL.slice() : new Array(nFlip + 1).fill(0),
        byBitErr: phys ? byBitErr.slice() : [nn, ...new Array(n - 1).fill(0)],
        byBitErrL: phys ? byBitErrL.slice() : new Array(n).fill(0),
        meanFlips: phys ? flipSum / nn : 0,
        meanBitErr: phys ? bitErrSum / nn : 0,
        meanJumps: phys ? jumpSum / nn : 0,
        frameMiss: phys ? frameMissSum : 0,
        noFrame: phys ? noFrame : 0,
        physParams: phys ? { t1: c.t1, t2: c.t2, tg: c.tg, pd: c.pd, re: c.re, peq: c.peq } : null,
        synMiss, randomMeas, disagree, disagreeBlind, blind,
        stats: circ.stats,
      };
    },
  };
}

/* 一次性全批（页面既有口径）：同一 rng 消耗序 ⟹ 数值与流式逐位一致 */
function qecEnsemble(cfg = {}){
  const s = qecStream(cfg);
  s.step(s.total);
  return s.result();
}

/* 解析：P_L = Σ_{w>t} C(n,w)·p^w·(1−p)^{n−w}，t=(n−1)/2（最小权重解码下
   权重 >t 的数据错误必致逻辑错误——补集更轻、解码器修错边）。
   n=3 ⟹ 3p²(1−p)+p³ = 3p²−2p³ · n=5 ⟹ 10p³−15p⁴+6p⁵（与 ε_5 同形）·
   n=7 ⟹ 35p⁴−84p⁵+70p⁶−20p⁷ · n=9 ⟹ 126p⁵−420p⁶+540p⁷−315p⁸+70p⁹
   （可读标签由 qecLogicalRateLab 程序展开，不手抄）。 */
function qecLogicalRate(p, n = 3){
  const N = qecNormN(n);
  const t = (N - 1) / 2;
  let s = 0;
  for (let w = t + 1; w <= N; w++){
    let binom = 1;
    for (let i = 0; i < w; i++) binom = binom * (N - i) / (i + 1);
    s += binom * Math.pow(p, w) * Math.pow(1 - p, N - w);
  }
  return s;
}
/* 阈值：P_L(p) = p ⟹ p = 1/2（P_L(1/2)=Σ_{w>t}C(n,w)/2ⁿ = 1/2——奇数 n 的
   二项尾率恒等式；另一根 p=1 是退化解） */
function qecThreshold(){ return 0.5; }

/* R112：解析式的可读标签（面板/HUD/图例用）——由 qecLogicalRate 的系数**程序
   展开**（不手抄，防抄错）：
   n=3 ⟹ 3p²−2p³ · n=5 ⟹ 10p³−15p⁴+6p⁵
   n=7 ⟹ 35p⁴−84p⁵+70p⁶−20p⁷ · n=9 ⟹ 126p⁵−420p⁶+540p⁷−315p⁸+70p⁹ */
function qecLogicalRateLab(n = 3){
  const N = qecNormN(n);
  const t = (N - 1) / 2;
  const coef = new Array(N + 1).fill(0);
  for (let w = t + 1; w <= N; w++){
    let binom = 1;
    for (let i = 0; i < w; i++) binom = binom * (N - i) / (i + 1);
    /* p^w(1−p)^{N−w} = Σ_j C(N−w,j)·(−1)^j·p^{w+j} */
    for (let j = 0; j <= N - w; j++){
      let b2 = 1;
      for (let i = 0; i < j; i++) b2 = b2 * (N - w - i) / (i + 1);
      coef[w + j] += binom * b2 * (j % 2 ? -1 : 1);
    }
  }
  const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  const parts = [];
  for (let k = t + 1; k <= N; k++){
    const v = coef[k];
    if (!v) continue;
    parts.push((v < 0 ? '−' : parts.length ? '+' : '') + Math.abs(v) + 'p' + SUP[k]);
  }
  return parts.join('');
}

/* R109：读出表决重复数归一（页面/URL 只暴露 1/3/5；非法值归一到 1） */
function qecNormRd(rd){
  const k = Math.round(Number(rd));
  if (k === 3 || k === 5) return k;
  return 1;
}
/* R109：多数表决后的有效读出误差
     ε_k = P(k 次独立翻转中 ≥⌈k/2⌉ 次为 1) = Σ_{j≥⌈k/2⌉} C(k,j)ε^j(1−ε)^{k−j}
   k=1 ⟹ ε · k=3 ⟹ 3ε²−2ε³ · k=5 ⟹ 10ε³−15ε⁴+6ε⁵。
   ε<1/2 时随 k 严格递减（表决有益）；ε≥1/2 时 ε_k≥1/2（表决无益——多数
   本身不可信）。空数组/奇数平局按 0（防御；正常 rd 为奇数不会平局）。 */
function qecVoteErr(k, eps){
  const K = qecNormRd(k);
  const e = Math.max(0, Math.min(1, Number(eps) || 0));
  let s = 0;
  for (let j = Math.ceil(K / 2); j <= K; j++){
    let binom = 1;
    for (let i = 0; i < j; i++) binom = binom * (K - i) / (i + 1);
    s += binom * Math.pow(e, j) * Math.pow(1 - e, K - j);
  }
  return s;
}
/* R109：一组经典位的多数（>半数判 1；空/平局判 0——rd 恒奇数，平局不出现） */
function qecMajority(bits){
  let s = 0;
  for (const b of bits) s += b ? 1 : 0;
  return s * 2 > bits.length ? 1 : 0;
}

/* 扫描：对一组 p 各跑一批（页面曲线用；pot78 用大 trials）。
   gate 模式追加 DP-over-frames 精确曲线（PLexact 列），MC 点照常。

   R117：拆成 `qecSweepPlan` + 逐点 `step(i)`。目的有二：
     1) 页面可以**逐点绘制**（n=5·rd=3 的一次 6 点扫描 = 6 × 9.1s ≈ 54s，同步跑
        会把主线程冻住整整一分钟、期间连进度都没有）；
     2) 每个点算完立刻可复用（DP 记忆化见 qecExactPL），中断/改样本数不重算。
   `qecSweep` 保留为同步包装（pot 套件与导出仍用它），行为与拆分前**逐位一致**。 */
/* R129：扫描策略（R123 记下的 A/B 两个候选，做成了运行时可选的开关）。
 *
 *   fastSweep   —— A：每点 MC 样本减半（120→60）。代价是统计精度：p=0.5 附近
 *                  σ=√(P(1−P)/N) 由 ~4% 涨到 ~6%。实测只对「MC 占大头」的档位
 *                  有意义（n=9 门级 −50%、n=5·rd=3 −18%）；n=7 的 MC 只占 4%，
 *                  开它纯亏。
 *   skipMcWhenExact —— B：有精确解（DP 有限）就不跑该点的 MC，PL 直接取精确值，
 *                  并在行里标 `PLsrc='exact'`。省 37%（n=5·rd=3）/ 4%（n=7）。
 *                  **信息代价**：曲线上少了「MC 与精确解重合」的现场证据 ⟹ 页面
 *                  在扫描收尾时补一次**单点对账**（同一点跑 MC 与 DP，报 z/σ），
 *                  用 1 个点换回证据（见 mode-rep 的 spotCheck）。
 *
 * 两个开关缺省都是 false ⟹ 与 R128 及之前**逐位一致**（pot 套件的逐位断言靠这个）。
 * 页面把它们做成按钮，并把实测成本写进诊断面板：拿信息换时间是用户的决定，
 * 不是引擎偷偷替用户做的决定。
 */
function qecSweepPolicy(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const gate = c.noise === 'gate';
  const base = c.sweepTrials || (gate ? 1200 : 900);
  const fast = !!c.fastSweep;
  return {
    fastSweep: fast,
    skipMcWhenExact: !!c.skipMcWhenExact,
    sweepTrials: base,
    trialsMc: fast ? Math.max(40, Math.round(base / 2)) : base,
  };
}

function qecSweepPlan(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const gate = c.noise === 'gate';
  const phys = c.noise === 'phys';
  const pol = qecSweepPolicy(c);
  const ps = c.ps || (gate
    ? Array.from({ length: 16 }, (_, i) => 0.002 * Math.pow(0.3 / 0.002, i / 15))
    : [0.002, 0.005, 0.01, 0.02, 0.04, 0.07, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5]);
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const step = i => {
    const p = ps[i];
    /* tExact/tMc：逐点成本（ms）。R123 的结论「最贵那档 DP 占 61%」原本只能靠
       离线脚本量，现在页面的诊断面板能实时报同一件事。字段只增不改数。 */
    const row = { p, PL: NaN, PLexact: NaN, Pun: p, PLsrc: 'mc', tExact: 0, tMc: 0 };
    if (gate || phys){
      const t0 = now();
      /* gate：DP-over-frames；phys：DP 精确（γ/λ>0 时 NaN） */
      row.PLexact = qecExactPL({ ...c, p });
      row.tExact = now() - t0;
      /* R129（策略 B）：有精确解且用户要求 ⟹ 不跑 MC，PL 直接取精确值 */
      if (pol.skipMcWhenExact && Number.isFinite(row.PLexact)){
        row.PL = row.PLexact; row.PLsrc = 'exact';
        return row;
      }
      const t1 = now();
      row.PL = qecEnsemble({ ...c, p, trials: pol.trialsMc }).PL;
      row.tMc = now() - t1;
    } else {
      /* iid：解析解本身就是精确的（qecEnsemble 顺带算），没有「省 MC」这回事 */
      const t1 = now();
      const e = qecEnsemble({ ...c, p });
      row.PL = e.PL; row.PLexact = e.PLexact;
      row.tMc = now() - t1;
    }
    return row;
  };
  const plan = {
    ps, step, length: ps.length,
    noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase, cfg: c,
    policy: pol,
  };
  /* R124：自适应补点。默认**不启用**——`qecSweep` 与既有调用一条不变（pot 套件的
     逐位断言靠这个保证）。调用方拿到粗扫结果后调 refine(rows, m)：
       1) 先找 P_L(精确/或 MC) 与 y=p 的**交点区间**（变号处）；
       2) 找不到（整段同向）就退到「相邻变化最大的区间」；
       3) 在该区间内按**几何插值**补 m 个点（对数轴上均匀）。
     用几何插值是因为扫描网格本身是对数的（0.002…0.55）。 */
  plan.refine = (rows = [], m = 2) => {
    const rs = rows.filter(r => Number.isFinite(r.p));
    if (rs.length < 2 || !(m > 0)) return [];
    const f = r => {
      const v = Number.isFinite(r.PLexact) ? r.PLexact : r.PL;
      return Number.isFinite(v) ? v - r.p : NaN;
    };
    let lo = null, hi = null;
    for (let i = 1; i < rs.length; i++){
      const fa = f(rs[i - 1]), fb = f(rs[i]);
      if (Number.isFinite(fa) && Number.isFinite(fb) && fa * fb <= 0){ lo = rs[i - 1].p; hi = rs[i].p; break; }
    }
    if (lo == null){
      let best = -Infinity;
      for (let i = 1; i < rs.length; i++){
        const d = Math.abs((rs[i].PLexact ?? rs[i].PL) - (rs[i - 1].PLexact ?? rs[i - 1].PL));
        if (Number.isFinite(d) && d > best){ best = d; lo = rs[i - 1].p; hi = rs[i].p; }
      }
    }
    if (!(lo > 0) || !(hi > lo)) return [];
    const out = [];
    for (let k = 1; k <= m; k++) out.push(Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * k / (m + 1)));
    return out;
  };
  return plan;
}

function qecSweep(cfg = {}){
  const plan = qecSweepPlan(cfg);
  const out = { p: [], PL: [], PLexact: [], Pun: [], noise: plan.noise, spectrum: plan.spectrum, noisyPhase: plan.noisyPhase };
  for (let i = 0; i < plan.length; i++){
    const r = plan.step(i);
    out.p.push(r.p);
    out.Pun.push(r.Pun);
    out.PLexact.push(r.PLexact);
    out.PL.push(r.PL);
  }
  return out;
}


/* R112/R113：DP-over-frames 状态空间预算。末态键 = 数据帧（x/z 各 n 位 ⟹ ≤2^{2n}）
   × 投票字段（nStab·VB 位 ⟹ ≤2^{(n−1)·VB}），门分支（gate / phys·pd>0·λ>0）
   下真实状态数逼近这个上界（ancilla 帧位测后即弃，只余 ±1 个在测 ancilla 的
   2 位 ⟹ 额外 ×2）。
   ⚠ R113：R112 首版把在测 ancilla 的余位按 ×4 估，与实测不符——**实测峰值
   一律是 2^{2n}·2^{(n−1)VB}·2**（dbg113 逐步插桩，depolar / extract 段）：

     n=3 rd=1 ⟹ 2^9   = 512       / 毫秒级      （旧估 2^10）
     n=5 rd=1 ⟹ 2^15   = 32768     / 123ms       （旧估 2^16）
     n=5 rd=3 ⟹ 786432 ≈ 0.75·2^20 / 9.0s        （旧估 2^20，略低估 1.5×）
     n=7 rd=1 ⟹ 2^21   = 2097152   / 5.3s        （旧估 2^22 ⟹ 被 1.2e6 误杀）
     n=9 rd=1 ⟹ ~2^27                            ⟹ 122s 后 Map maximum size
                                                    exceeded（页面崩，真崩）

   ⟹ R113 把因子改成 ×2 并把 cap 提到 2.5e6：**n=7·rd=1 门级恢复精确解**
   （2.1e6 < 2.5e6，5.3s），n=9（1.3e8）与 n=5·rd=5（8.4e6）仍拒。
   估算本身有 ±1.5× 误差 ⟹ 除前置估算外再加**运行时硬顶**（每步检查
   dist.size，超 cap 立即返 NaN）：估算偏乐观也不会重演「122s 后崩页」。
   iid / phys 无门分支（pd=λ=0）不乘门分支熵 ⟹ 状态数 ≈2^n×投票，
   n=9 也只有 7ms（实测），不受本预算约束。 */
const QEC_DP_STATE_CAP = 2.5e6;
/* R113：DP「每点很贵」阈值（不是预算——只用来决定扫描点数：昂贵的配置少扫
   几点）。n=7·rd=1 门级 nq=13 **不算重配置**（态矢 MC 很快），但它的 DP 是
   5.3s/点 ⟹ 18 点扫描 = 95s，比 n=5·rd=3（重配置、6 点、54s）还慢。真正的
   驱动量是 DP 状态数，不是 nq ⟹ 单独设一个阈值 2^17（n=5·rd=1 的 2^15 恰好
   在其下，18 点不变；n=5·rd=3 与 n=7·rd=1 在其上，降到 6 点）。 */
const QEC_DP_HEAVY = 1 << 17;
/* 状态空间上界（0 = 无门分支，不受预算约束） */
function qecDpStates(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const circ = qecCircuit(c.code, c);
  const rd = qecNormRd(c.rd);
  const gate = c.noise === 'gate', phys = c.noise === 'phys';
  let branching = false;
  if (gate) branching = c.p > 0;
  if (phys){
    const np = qcnNoiseParams(c.t1, c.t2, c.tg, c.pd, c.re, c.peq);
    branching = np.pdep > 0 || np.lambda > 0;
  }
  if (!branching) return 0;
  const VB = Math.max(1, Math.ceil(Math.log2(rd + 1)));
  return Math.pow(2, 2 * circ.n) * Math.pow(2, (circ.n - 1) * VB) * 2;
}
function qecDpOverBudget(cfg = {}){
  const est = qecDpStates(cfg);
  return est > QEC_DP_STATE_CAP;
}
/* R113：扫描点数降级判据（与预算无关：超预算 ⟹ NaN 根本不跑；本函数针对
   「能跑但每点很贵」的配置） */
function qecDpHeavy(cfg = {}){
  return qecDpStates(cfg) >= QEC_DP_HEAVY;
}

/* ============================================================================
 * DP-over-frames 精确解：P_L(p) 的精确多项式（零统计误差）
 *
 * 帧空间 2^{2·nq}（nq = n+(n−1)·rd 个比特的 x/z 掩码；R109 前 ancilla 恒 2、
 * n=3 rd=1 时 nq=5 ⟹ 1024）× 投票字段 (n−1)·VB 位，每个门后按谱分支；测量读帧
 * 的 x 位（确定）、修正查表（确定）、解码传播（确定）⟹ 全程无随机分支，末态
 * 帧完全决定结局。与态矢 MC 是两套独立表示，4σ 对账。
 *
 * R108 扩展（三种口径统一到同一 DP）：
 *   · iid  ：静态数据块（率 p，spec.err）+ 无门分支 + 无读出翻转
 *   · gate ：无静态块 + 门分支（率 p，谱 = c.spectrum）
 *   · phys ：静态数据块（率 p）+ 门分支（退极化率 p_dep，谱恒退极化 X/Y/Z 各
 *             1/3——退极化通道 ≡ 随机 Pauli 注入的系综）+ **相位阻尼**（Z 注入
 *             率 λ/2：Kraus E₁=√(λ/2)·Z 的 Pauli 通道展开）+ **读出翻转**（每位
 *             测量以概率 ε 把记录综合征翻过来；量子态/帧不受影响，纯经典分支）
 *   · 守卫：phys 且 γ>0 ⟹ 返回 NaN。振幅阻尼/热激发不是 Pauli，帧无法表示——
 *     非 Pauli 通道没有零统计误差的精确解（诚实限制）。退极化、相位阻尼、读出
 *     翻转都是 Pauli/经典可表示的，照样给精确值。
 *
 * R109 扩展（容错读出表决）：测量分支从「记录位直接落 syn」升级为「按 ε 翻后
 *   累加投票计数」，修正分支按计数 >rd/2 表决。rd=1 时计数 ≡ 记录位，与 R108
 *   逐位一致；表决后有效读出误差 ε_k 由 DP 自然给出（p=0 时精确 = ε_k(1−ε_k)）。
 * ========================================================================== */
/* R117：DP 结果记忆化。DP 只依赖「电路 + 噪声参数 + p」，**与 trials 无关** ——
   而 trials 在 `_curveKey` 里 ⟹ 拖样本数滑块会触发整轮重扫。对 n=7·rd=1（6 点 ×
   5.3s ≈ 32s）这是纯浪费：DP 一分不变，只有 MC 需要重跑。
   键取「DP 真正读到的全部字段」，显式列出而不是 JSON.stringify(cfg)——后者会把
   trials/sweepTrials/seed 这些无关字段混进来，缓存直接失效。
   只缓存有限值：预算守卫/γ>0 的 NaN 是立刻返回的，缓存它们没有收益。 */
const QEC_DP_MEMO = new Map();
const QEC_DP_MEMO_MAX = 256;
const QEC_DP_STATS = { hit: 0, miss: 0 };
function qecDpKey(c){
  return [
    c.code, qecNormN(c.n), qecNormRd(c.rd), c.noise, c.spectrum, c.noisyPhase,
    Math.max(0, Math.min(1, c.p)), c.theta, c.phase,
    c.t1, c.t2, c.tg, c.pd, c.re, c.peq,
  ].join('|');
}
function qecDpCacheStats(){ return { size: QEC_DP_MEMO.size, hit: QEC_DP_STATS.hit, miss: QEC_DP_STATS.miss }; }
function qecDpCacheClear(){ QEC_DP_MEMO.clear(); QEC_DP_STATS.hit = 0; QEC_DP_STATS.miss = 0; }

function qecExactPL(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const key = qecDpKey(c);
  const hit = QEC_DP_MEMO.get(key);
  if (hit !== undefined){ QEC_DP_STATS.hit++; return hit; }
  QEC_DP_STATS.miss++;
  const v = qecExactPLUncached(c);
  if (Number.isFinite(v)){
    QEC_DP_MEMO.set(key, v);
    if (QEC_DP_MEMO.size > QEC_DP_MEMO_MAX) QEC_DP_MEMO.delete(QEC_DP_MEMO.keys().next().value);
  }
  return v;
}

function qecExactPLUncached(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const circ = qecCircuit(c.code, c);
  const gate = c.noise === 'gate';
  const phys = c.noise === 'phys';
  const noisyAll = c.noisyPhase === 'all';
  const noisyPh = gate || phys ? (noisyAll ? ['encode', 'extract', 'decode'] : ['extract']) : [];
  /* R109：表决重复数（与 qecCircuit 同一归一函数——DP 的键宽由它定） */
  const rd = qecNormRd(c.rd);
  /* R108：phys 的物理参数（守卫 + 门分支率 + 读出翻转率） */
  const np = phys ? qcnNoiseParams(c.t1, c.t2, c.tg, c.pd, c.re, c.peq) : null;
  if (phys && np.gamma > 0) return NaN;   /* 振幅阻尼/热激发非 Pauli：无精确解（λ 有 Z 分支，仍精确） */
  /* R112：DP 状态空间预算守卫（n=9·门分支 ⟹ ~3×10⁸ 状态，实测 Map 爆容量）。
     预算外直接 NaN——与 γ>0 同一诚实口径，页面转「仅 MC」。 */
  if (qecDpOverBudget(c)) return NaN;
  const eps = phys ? np.eps : 0;
  const W = gate ? qecSpecW(c.spectrum) : qecSpecW('depolar');   /* phys 门通道恒退极化谱 */
  const gateP = gate ? Math.max(0, Math.min(1, c.p)) : (phys ? np.pdep : 0);
  const p = Math.max(0, Math.min(1, c.p));
  const spec = circ.spec;
  /* R109/R110：键 = 「帧数:投票数」**字符串**。帧数 = x·2^NB+z（NB=nq；双精度
     整数精确区 <2^50），投票数 = Σᵢ(vᵢ<<(i·VB))（vᵢ = 第 i 个稳定子的投票计数，
     0..rd 个记录位里判 1 的个数——读出翻转在 meas 分支按 ε 累加）。rd=1 时计数
     ≡ 记录位本身，与 R108 布局同构。VB/SH 由 rd/n 定：n=3 rd=1 ⟹ VB=1,SH=2 ·
     n=3 rd=3 ⟹ VB=2,SH=4 · n=5 rd=1 ⟹ VB=1,SH=4；稳定子数 = n−1（n=5 ⟹ 4）。
     ⚠ R110：**不能**把帧和投票 packing 进同一个整数——JS 位运算只有 32 位，而
     n=5 rd=3 的帧键需 2·17+8=42 位（n=5 rd=5 时 62 位）：((x<<NB)|z)<<SH 的
     `<<` 静默截断，ancilla q≥7 的帧位（键位 ≥32）被吃掉 ⟹ 表决恒读 0 ⟹ DP
     与 MC 差 24σ+。n=3 rd≤5 与 n=5 rd=1 键宽 ≤32 位不越界，所以 R109 全绿——
     泛化到 n=5 rd≥3 才暴露（pot110 ② 节抓出）。帧数/投票数分列、用算术
     （×,+）打包，53 位尾数内精确；解析每状态只做一次（内循环携带元组）。 */
  const nn = circ.n, nStab = nn - 1;
  const NB = circ.nq;
  const VB = Math.max(1, Math.ceil(Math.log2(rd + 1)));
  const SH = nStab * VB;
  const VMASK = (1 << VB) - 1;
  const P2 = Math.pow(2, NB);              /* 帧数打包基（frame = x·P2+z < 2^{2NB}） */
  /* R121：键改成**数值**（原来 frame + ':' + votes 的字符串）。DP 主体对键类型
     无感知 ⟹ 只换这两个函数即可，逐位一致性与加速比都用「两份源码对照」测过：
     n=3/5·rd=1、n=3·rd=1·iid、n=5·rd=3、n=7·rd=1 五组 **Object.is 全 OK**（插入
     顺序不变 ⟹ 加法顺序不变），加速 1.50×～2.13×（n=5·rd=3：8.68s→4.08s）。
     数值范围：votes < 2^SH，frame < 2^{2NB} ⟹ 键 < 2^{2NB+SH} ≤ 2^44 ≪ 2^53。 */
  const VBASE = Math.pow(2, SH);
  const keyOf = (x, z, votes) => (x * P2 + z) * VBASE + votes;
  const unpack = (k) => {
    const votes = k % VBASE;
    const f = (k - votes) / VBASE;
    const x = (f / P2) | 0;
    return { x, z: f - x * P2, votes };
  };
  let dist = new Map([[keyOf(0, 0, 0), 1]]);
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  for (const o of circ.ops){
    /* R113：运行时硬顶。前置估算有 ±1.5× 误差（实测 n=5·rd=3 低估 1.5×），
       这道闸是「绝不重演 n=9 的 122s 后 Map 爆容量崩页」的最后保险：中途
       超容量立即放弃、返 NaN（页面转「仅 MC」，与预算外同一诚实口径）。 */
    if (dist.size > QEC_DP_STATE_CAP) return NaN;
    if (o.op === 'noise'){
      if (gate) continue;                    /* 门级模式：没有静态块（phys 保留） */
      /* i.i.d./phys：逐数据比特独立以 p 施加 spec.err */
      const next = new Map();
      for (const [k, v] of dist){
        const u = unpack(k);
        /* cur: [x, z, votes, w] 元组数组（同键多条由末尾 add 合并） */
        let cur = [[u.x, u.z, u.votes, v]];
        for (let q = 0; q < nn; q++){
          const nx = [];
          for (const [x, z, s, w] of cur){
            nx.push([x, z, s, w * (1 - p)]);
            const b = 1 << q;
            const x2 = spec.err === 'x' ? (x ^ b) : x;
            const z2 = spec.err === 'z' ? (z ^ b) : z;
            nx.push([x2, z2, s, w * p]);
          }
          cur = nx;
        }
        for (const [x, z, s, w] of cur) add(next, keyOf(x, z, s), w);
      }
      dist = next;
      continue;
    }
    if (o.op === 'meas'){
      /* 真实位 = 帧的 x 位（确定：量子态按理想投影坍缩，翻转只发生在经典记录上）。
         R109：记录位按 ε 独立翻后**累加**到该稳定子的投票计数（不直接定位）——
         同一次测量的两个分支只差这一个计数位，rep 之间的独立性由「每次 meas
         各自分支」天然保证。
         ⚠ 性能关键（rd>1）：测后**清除该 ancilla 的帧位**（x/z 都清）。每个
         ancilla 只在自己的 rep 用一次、测后再无门触及它——它的帧位是死位，
         清掉不改变任何后续判定（末态只读数据位），但让状态数从 2^{2·nq}×投票
         回落到数据帧量级（rd=3 时 DP 从 >16M 状态/13.5s 回到 <2k 状态/毫秒级）。
         这与「帧预测 synMiss」无关——预测发生在清除之前。 */
      const next = new Map();
      const dead = ~(1 << o.q);                 /* 清该比特的 x/z 帧位 */
      const si = o.stab;
      for (const [k, v] of dist){
        const u = unpack(k);
        /* R110：只动 si 这一个稳定子的投票字段；其余稳定子已累加的计数原样
           保留（sBase = 全部投票字段挖掉 si 位）——提取顺序是「stab0 的 rd 次
           → stab1 的 rd 次 → …」，先测的稳定子计数要活到 fix 分支。 */
        const vS = (u.votes >> (si * VB)) & VMASK;
        const tb = (u.x >> o.q) & 1;
        const x2 = u.x & dead, z2 = u.z & dead;  /* ancilla 帧位作废（测后即弃） */
        const sBase = u.votes & ~(VMASK << (si * VB));
        if (eps > 0){
          add(next, keyOf(x2, z2, sBase | ((vS + (tb ^ 1)) << (si * VB))), v * eps);   /* 记录位被翻 */
          add(next, keyOf(x2, z2, sBase | ((vS + tb) << (si * VB))), v * (1 - eps));   /* 记录位正确 */
        } else {
          add(next, keyOf(x2, z2, sBase | ((vS + tb) << (si * VB))), v);
        }
      }
      dist = next;
      continue;
    }
    if (o.op === 'fix'){
      const next = new Map();
      for (const [k, v] of dist){
        const u = unpack(k);
        /* R109：表决 = 计数严格过半（rd 恒奇数，无平局）；rd=1 时 ≡ 取记录位。
           R110：n−1 个稳定子逐一表决 → n−1 位综合征 → 最小权重修正**列表**
           （n=5 可返回两位，如综合征 [0,0,1,0] → 修 q3,q4）。 */
        const voted = [];
        for (let si = 0; si < nStab; si++){
          voted.push(((u.votes >> (si * VB)) & VMASK) * 2 > rd ? 1 : 0);
        }
        const fixQs = qecFixFromSyndrome(voted, nn);
        let x2 = u.x, z2 = u.z;
        for (const fq of fixQs){
          const b = 1 << fq;
          if (spec.fix === 'x') x2 ^= b; else z2 ^= b;
        }
        /* 修正后投票字段失去意义（后面只读帧）——抹平合并，控制状态数 */
        add(next, keyOf(x2, z2, 0), v);
      }
      dist = next;
      continue;
    }
    /* 普通门：帧传播（确定）+ 门后注错（按谱分支；gate 率 p，phys 率 p_dep） */
    const next = new Map();
    for (const [k, v] of dist){
      const u = unpack(k);
      const fr = { x: u.x, z: u.z };
      qcFrGate(fr, o);
      let cur = [[fr.x, fr.z, u.votes, v]];
      if (gateP > 0 && o.ph !== 'prep' && noisyPh.includes(o.ph)){
        for (const q of gnTouched(o)){
          const nx = [];
          for (const [x, z, sy, w] of cur){
            nx.push([x, z, sy, w * (1 - gateP)]);
            const b = 1 << q;
            for (const t of ['x', 'y', 'z']){
              if (!W[t]) continue;
              const x2 = (t === 'x' || t === 'y') ? (x ^ b) : x;
              const z2 = (t === 'z' || t === 'y') ? (z ^ b) : z;
              nx.push([x2, z2, sy, w * gateP * W[t]]);
            }
          }
          cur = nx;
        }
      }
      /* R108 phys：相位阻尼 = Z 注入率 λ/2（与退极化独立、可交换，后套一层） */
      if (phys && np.lambda > 0 && o.ph !== 'prep' && noisyPh.includes(o.ph)){
        const phP = np.lambda / 2;
        for (const q of gnTouched(o)){
          const nx = [];
          for (const [x, z, sy, w] of cur){
            nx.push([x, z, sy, w * (1 - phP)]);
            nx.push([x, z ^ (1 << q), sy, w * phP]);
          }
          cur = nx;
        }
      }
      for (const [x, z, sy, w] of cur) add(next, keyOf(x, z, sy), w);
    }
    dist = next;
  }
  /* 末态：q0 约化保真度（解析，R78 口径 F<0.5）。
     Pauli 残差下末态是乘积态 E|ψ_full⟩ = E_q0|ψ₀⟩⊗E_{q1…q_{n−1}}|00…0⟩，
     q1..q_{n−1} 的污位被 partial trace 掉（约化保真度看不见）⟹ F 只由 q0 的
     (x₀,z₀) 决定：
       (0,0)→1 · (1,0)→sin²θcos²φ · (0,1)→cos²θ · (1,1)→sin²θsin²φ
     与态矢 MC 的 PL（qcRhoFidelity on q0）逐点同判据，4σ 对账是同口径。
     注意这与「帧陪集」末态判的区别：本征态盲区（如 |+i⟩ 上的 Y_L）残差作用
     等于恒等，F=1 不是失败——陪集判会过度计数，F 判不会。 */
  const T = c.theta, P = c.phase;
  const fQ0 = (x0, z0) => {
    if (!x0 && !z0) return 1;
    const s = Math.sin(T), c2 = Math.cos(T);
    if (x0 && z0) return s * s * Math.sin(P) * Math.sin(P);
    if (x0) return s * s * Math.cos(P) * Math.cos(P);
    return c2 * c2;
  };
  let PL = 0;
  for (const [k, v] of dist){
    const u = unpack(k);
    if (fQ0(u.x & 1, u.z & 1) < 0.5) PL += v;
  }
  return PL;
}

/* ============================================================================
 * 精确故障枚举（单阶 order=1 / 二阶 order=2）：一阶/二阶系数 c₁、c₂
 *   P_L(p) = c₁·p + c₂·p² + O(p³)
 * 位点 = 每个门（prep/meas/fix/noise 标记除外，且落在 noisyPhase 内）的
 * 每个触及比特 × 3 个 Pauli。每个位点跑一次 qecExec（强制故障、无 rng——
 * 测量确定），按谱加权。两条独立路径交叉校验：探针分类 vs 帧陪集分类。
 *
 * ⚠ c₂ 是**多项式系数**不是原始 pair-sum：DP 模型每个 (门,比特) 机会只抽一次
 * 谱（同机会的不同 Pauli 互斥），且未出错机会贡献 (1−p)^{M−k} 的展开：
 *   c₁ = S1                                  （S1 = logic 单错权重和）
 *   c₂ = S2 − (M−1)·S1                       （S2 = 跨机会 logic 双错权重和）
 * M = 有效机会数 = 落选门数 × |gnTouched|（gate 模式每个机会独立以 p 注错）。
 * 口径与 DP-over-frames 末态判据一致：bucket = 失败（F<0.5，R78 口径），
 * 不是帧陪集的 'logic'（后者在本征态盲区上会过度计数，见 qecExactPL 头注）。
 * ========================================================================== */
function qecFaultSites(circ){
  const out = [];
  for (let i = 0; i < circ.ops.length; i++){
    const o = circ.ops[i];
    if (o.op === 'meas' || o.op === 'fix' || o.op === 'noise' || o.ph === 'prep') continue;
    for (const q of gnTouched(o)) for (const t of ['x', 'y', 'z']){
      out.push({ gate: i, q, t, ph: o.ph, gop: o.op, stab: o.stab != null ? o.stab : -1 });
    }
  }
  return out;
}

function qecFaultSurvey(cfg = {}, order = 1){
  const c = { ...QEC_DEFAULTS, ...cfg, noise: 'gate' };
  const circ = qecCircuit(c.code, c);
  const ref = qecRef(circ);
  /* noisyPhase 过滤：'extract' 只枚举提取段；'all' 三段都枚举（与 qecExec 的
     noisyPh 口径一致——survey 与真跑必须同一注错范围，否则 c₁ 与 DP 差一个
     相位因子，R86 冒烟③抓出过：不过滤时 extract 模式的 c₁ 恰好是全部相位的一半） */
  const noisyPh = c.noisyPhase === 'all' ? ['encode', 'extract', 'decode'] : ['extract'];
  const sites = qecFaultSites(circ).filter(s => noisyPh.includes(s.ph));
  const W = qecSpecW(c.spectrum);
  /* 有效机会数 M：同一 (门,比特) 的 3 个 Pauli 位点共享一次谱抽样 */
  const M = new Set(sites.map(s => s.gate + ':' + s.q)).size;
  const byPhase = {};
  const rows = [];
  let cLogic = 0, S2 = 0, disagree = 0, randomN = 0, blindFix = 0;

  const runOne = (faults, site) => {
    const r = qecExec(circ, { faults, rng: null, p: 0, noise: 'gate', spectrum: c.spectrum, cfg: c });
    const cl = qecClass(r.pre, ref, r.F);
    if (r.diag.random) randomN++;
    /* 交叉校验（同点：修正后、解码前）：帧陪集分类 vs 探针五分类。
       唯一允许的不一致是本征态盲区——帧说 logic 而探针说 perfect，此时残差
       L∥参考 Bloch 向量、F=1（不是失败）；断言 disagree ≡ blindFix。 */
    const frameCls = r.cosetFix === 0 ? 'perfect'
      : r.cosetFix > 0 ? 'logic'
      : (r.F > 1 - 1e-9 ? 'gauge' : 'outside');
    if (site && site.ph !== 'decode' && frameCls !== cl.cls){
      disagree++;
      if (r.F > 1 - 1e-9) blindFix++;
    }
    return { r, cl };
  };

  for (const site of sites){
    const { r, cl } = runOne([{ gate: site.gate, q: site.q, t: site.t }], site);
    const w = W[site.t] || 0;
    const fail = r.logicalError;               /* F<0.5：R78/DP 同口径 */
    if (fail) cLogic += w;
    byPhase[site.ph] = byPhase[site.ph] || { n: 0, fail: 0 };
    byPhase[site.ph].n++;
    if (fail) byPhase[site.ph].fail++;
    rows.push({
      ...site, fail, probe: cl.cls, coset: cl.coset, cosetFix: r.cosetFix,
      cosetDec: r.cosetDec, F: r.F,
      wPre: qecFrameWeight(circ.code, r.frAtFix, circ.n), wEnd: qecFrameWeight(circ.code, r.frAtEnd, circ.n),
    });
  }
  if (order >= 2){
    for (let i = 0; i < sites.length; i++){
      for (let j = i + 1; j < sites.length; j++){
        const a = sites[i], b = sites[j];
        /* 同 (门,比特) 机会互斥（一次谱抽样只出一个 Pauli），不计 pair */
        if (a.gate === b.gate && a.q === b.q) continue;
        const { r } = runOne([{ gate: a.gate, q: a.q, t: a.t }, { gate: b.gate, q: b.q, t: b.t }], null);
        if (r.logicalError) S2 += (W[a.t] || 0) * (W[b.t] || 0);
      }
    }
  }
  /* 多项式系数：c₂ = S2 − (M−1)·c₁（(1−p)^{M−1} 展开的二阶项） */
  const c2 = order >= 2 ? S2 - (M - 1) * cLogic : NaN;
  return {
    code: c.code, p: c.p, spectrum: c.spectrum, noisyPhase: c.noisyPhase, order,
    sites: sites.length, M, rows,
    byPhase,
    /* 一阶/二阶系数（P_L ≈ c1·p + c2·p² + O(p³)） */
    c1: cLogic, c2, pairSum: S2,
    PL1: cLogic * c.p,
    stats: circ.stats,
    disagree, blindFix, randomMeas: randomN,
  };
}

/* 单比特/少比特错误的「教科书」对照：给定错误位置集合，综合与修正是否把它纠回。
   R110：n=3 穷举 2³=8 种（与 pot78 A 组逐位一致：fixQ 字段保留旧语义——
   首位修正或 −1）；n=5 穷举 2⁵=32 种，最小权重修正可返回两位（fixQs 数组），
   页面表格按权重 ≤t 过滤展示。 */
function qecSyndromeTable(n = 3){
  const N = qecNormN(n);
  const rows = [];
  /* 行序 = 权重升序 + 字典序（n=3 时 [], [0], [1], [2], [0,1], [0,2], [1,2],
     [0,1,2] ——与 R78 基线逐行一致；n=5 时 32 行同样「纠得动的排前面」，
     页面按权重 ≤t 过滤展示） */
  const all = [];
  for (let m = 0; m < (1 << N); m++){
    const e = [];
    for (let q = 0; q < N; q++) if (m & (1 << q)) e.push(q);
    all.push(e);
  }
  all.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  });
  for (const e of all){
    const syn = qecSyndromeOf(e, N);
    const fixQs = qecFixFromSyndrome(syn, N);
    /* 修正后的残余错误 = 原错误 ⊕ 修正位集合（集合对称差；应用顺序无关） */
    const res = e.slice();
    for (const fq of fixQs){
      const i = res.indexOf(fq);
      if (i >= 0) res.splice(i, 1); else res.push(fq);
    }
    rows.push({ errors: e, syn, fixQs, fixQ: fixQs.length ? fixQs[0] : -1, residual: res, ok: res.length === 0 });
  }
  return rows;
}

/* ============================================================================
 * R111：未编码公平基线 P_un —— R86 遗留「门级口径下编码是否有益」的对照
 *
 * 背景（R86 的诚实缺口）：门级口径下页面一直拿 P_L 与「未编码 p」比较，并据此
 * 说「p<1/2 时 P_L > p，编码反而更差」。但这两个数**不在同一机会数基准上**——
 * 编码线路在提取段有 M 个错误机会（n=3 时 8/12 个），而「未编码 p」默认的是
 * 单个比特的一次存储错误（1 个机会）。拿 8 个机会的结果比 1 个机会的基线，
 * 得到「编码更差」是基线的错，不是纠错的错。
 *
 * 本轮的公平基线：**同样的噪声机会数**。裸传（1 个数据比特，不做编码/提取/
 * 修正/解码）也经历 M 个机会——物理意义是「同样的门周期 / 同样的时间预算」：
 * 编码把这 M 个机会花在纠错上，裸传把它们花在等待上。
 *
 * 判据（⚠ 别写成「累积 Pauli ≠ I」）：逻辑初态是 |+i⟩（θ=φ=π/2），它的 Bloch
 * 向量沿 +Y ⟹ **Y|+i⟩ = +|+i⟩、F=1** —— Y 是它的稳定子，**Y 错误不可观测**
 * （dbg111b 实测：F(X)=0、F(Y)=1.000000000000、F(Z)=0）。这与 R78「换掉 |+⟩
 * 是因为 X_L 在 |+⟩ 上不可观测」是同族问题：纯态总有一个 Pauli 方向是它的
 * 稳定子，|+i⟩ 换掉了 X 盲区却留下了 Y 盲区。⟹ **致命集合 = {X, Z}**。
 * ⚠ 编码侧同样用保真度判据（qecExec/qecExactPL 都走 F ⟹ 同样漏 Y_L 类，
 *   实测 DP ≡ MC 4σ：z ≤ 0.97）⟹ 两侧盲区口径一致，相对比较仍然公平；
 *   绝对 P_L 若要覆盖 Y 类须换初态或改代数判据（R79 在 Shor 码已这么做）。
 *
 * 于是「M 个机会各注入一个 Pauli」是 Pauli 群 Z₂×Z₂ 上的随机游走，只须投影到
 * 特征标 χ_Y（χ(I)=+1、χ(X)=−1、χ(Y)=+1、χ(Z)=−1）即可得闭式：
 *
 *   P_un = 1 − (1/2)·[ 1 + μ_Y·λ_Y^M ]
 *
 *   λ_Y = K(I) − K(X) + K(Y) − K(Z)      （每机会 Pauli 分布 K 的 χ_Y 特征标）
 *   μ_Y = 1 − 2·p_stat                   （静态块：spec.err ∈ {X,Z} 都与 Y 不对易）
 *
 * 三种谱的闭式（M 个机会、每机会率 p，无静态块）：
 *   退极化（X/Y/Z 各 1/3）：λ_Y = 1−4p/3 ⟹ P_un = (1/2)[1 − (1−4p/3)^M]
 *   x 谱 / z 谱（单一 Pauli）：λ_Y = 1−2p ⟹ P_un = (1/2)[1 − (1−2p)^M]
 *   iid（M=0、静态块率 p）：P_un = 1 − (1/2)[1 + (1−2p)] = **p**（与页面既有
 *     「未编码 p」逐位一致——这正是 R86 的旧基线，它只有 1 个机会）。
 *   小 p 一阶：退极化 ≈ (2/3)M·p（1/3 的注入是 Y、不致命）；x/z 谱 ≈ M·p。
 *
 * 两条诚实边界：
 *   ① 裸传只有 1 个数据比特、无 ancilla ⟹ **没有综合征读出误差**（SPAM 底座
 *      是编码特有的代价）——本基线按保真度口径（终态不测量），不计裸传的最终
 *      读出；若比较「逻辑错误率」，裸传的读出只翻经典记录、不改逻辑态。
 *   ② phys 且 γ>0（振幅阻尼/热激发）非 Pauli ⟹ 随机游走闭式失效 ⟹ 返 NaN
 *      （与 qecExactPL 同一诚实口径）。退极化/相位阻尼仍是 Pauli 可表示的。
 * ========================================================================== */

/* 裸传的机会数与每机会 Pauli 分布（与 qecFaultSites 同一口径 ⟹ M 与 c₁ 同源） */
function qecUncodedSpec(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const circ = qecCircuit(c.code, c);
  const noisyPh = c.noisyPhase === 'all' ? ['encode', 'extract', 'decode'] : ['extract'];
  /* 有效机会数 M = Σ|gnTouched|（同一 (门,比特) 的 3 个 Pauli 位点共享一次抽样） */
  const M = new Set(qecFaultSites(circ).filter(s => noisyPh.includes(s.ph)).map(s => s.gate + ':' + s.q)).size;
  /* 静态块：iid 与 phys 有（率 p，注入 spec.err）；gate 无（错误挂在门上） */
  const pStat = c.noise === 'gate' ? 0 : c.p;
  let dist = { i: 1, x: 0, y: 0, z: 0 };
  let exact = true, why = '';
  if (c.noise === 'gate'){
    const w = qecSpecW(c.spectrum);
    dist = { i: 1 - c.p, x: c.p * w.x, y: c.p * w.y, z: c.p * w.z };
  } else if (c.noise === 'phys'){
    const g = 1 - Math.exp(-c.tg / Math.max(1e-9, c.t1));
    const lam = 1 - Math.exp(-c.tg / Math.max(1e-9, c.t2));
    if (g > 0){ exact = false; why = 'γ>0：振幅阻尼/热激发非 Pauli，随机游走闭式失效'; }
    /* 每门：先退极化（率 pd，谱恒退极化）后相位阻尼（Z，率 λ/2）——按 qecExecPhys
       同序合成到 Pauli 群上（YZ≡X、XZ≡Y、ZZ≡I，模全局相位） */
    const d3 = c.pd / 3, l2 = lam / 2;
    dist = {
      i: (1 - c.pd) * (1 - l2) + d3 * l2,
      x: d3, y: d3,
      z: d3 * (1 - l2) + (1 - c.pd) * l2,
    };
  }
  return { M, pStat, dist, exact, why, noise: c.noise, spectrum: c.spectrum,
    noisyPhase: c.noisyPhase, specErr: circ.spec.err, n: circ.n };
}

/* Z₂×Z₂ 随机游走闭式（见节首注释）：致命集合 = {X, Z}，只投影到 χ_Y。
   γ>0（非 Pauli）⟹ NaN，与 qecExactPL 同一诚实口径。 */
function qecUncodedRate(cfg = {}){
  const sp = qecUncodedSpec(cfg);
  if (!sp.exact) return NaN;
  /* χ_Y：I→+1, X→−1, Y→+1, Z→−1 */
  const lamY = sp.dist.i - sp.dist.x + sp.dist.y - sp.dist.z;
  /* 静态块注入 spec.err ∈ {X, Z}，两者 χ_Y 都是 −1 ⟹ μ_Y = 1 − 2p_stat */
  const muY = 1 - 2 * sp.pStat;
  return 1 - 0.5 * (1 + muY * Math.pow(lamY, sp.M));
}

/* 裸传的态矢真跑（1 个比特；与上面的闭式是两套独立表示，4σ 对账）。
   初态 = 编码线路同一个逻辑初态 Ry(θ)Rz(φ)|0⟩；逻辑错误判据 = 保真度 F。 */
function qecUncodedTrial(cfg = {}, rng){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const sp = qecUncodedSpec(cfg);
  if (!sp.exact) return { logicalError: false, F: NaN, jumps: 0, bad: true };
  const s = qcNewState(1);
  qcApply(s, { op: 'ry', q: 0, theta: c.theta });
  qcApply(s, { op: 'rz', q: 0, theta: c.phase });
  const ideal = { re: Float64Array.from(s.re), im: Float64Array.from(s.im) };
  let jumps = 0;
  /* 静态块（iid / phys）；gate 无静态块 */
  if (sp.pStat > 0 && rng() < sp.pStat){ qcApply(s, { op: sp.specErr, q: 0 }); jumps++; }
  /* M 个门机会：与 gate/phys 同分布（gnSampleError 是单一数据源） */
  for (let k = 0; k < sp.M; k++){
    let t = null;
    if (c.noise === 'gate'){
      t = gnSampleError(c.spectrum, c.p, rng);
    } else if (c.noise === 'phys'){
      t = gnSampleError('depolar', c.pd, rng);
      if (!t){
        const lam = 1 - Math.exp(-c.tg / Math.max(1e-9, c.t2));
        if (rng() < lam / 2) t = 'z';
      }
    }
    if (t){ qcApply(s, { op: t, q: 0 }); jumps++; }
  }
  /* F = |⟨ψ_ideal|ψ⟩|² */
  let re = 0, im = 0;
  for (let j = 0; j < 2; j++){
    re += ideal.re[j] * s.re[j] + ideal.im[j] * s.im[j];
    im += ideal.re[j] * s.im[j] - ideal.im[j] * s.re[j];
  }
  const F = re * re + im * im;
  return { logicalError: F < 1 - 1e-9, F, jumps, bad: false, M: sp.M };
}

/* 裸传系综（MC）：与 qecEnsemble 同形（trials / seed / PL） */
function qecUncodedEnsemble(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const rng = mulberry32(c.seed);
  const nn = Math.max(1, c.trials | 0);
  let nL = 0, jumpSum = 0;
  for (let k = 0; k < nn; k++){
    const r = qecUncodedTrial(c, rng);
    if (r.bad) return { p: c.p, trials: nn, PL: NaN, PLexact: NaN, M: qecUncodedSpec(c).M, meanJumps: NaN, bad: true };
    if (r.logicalError) nL++;
    jumpSum += r.jumps;
  }
  return { p: c.p, trials: nn, PL: nL / nn, PLexact: qecUncodedRate(c),
    M: qecUncodedSpec(c).M, meanJumps: jumpSum / nn, bad: false };
}

/* 门级「编码是否有益」的临界点：P_L(p) − P_un(p) 的首个变号点（二分 20 步）。
   ⚠ 语义：这是**同机会数基线下的**交点——与 R86 的「P_L = p 交点」（1 个机会的
   基线）不同。返回 null 表示扫过的区间内**同向**：若全程 P_L < P_un 则编码全程
   有益（无阈值），由调用方读端点符号判定（见 endBelow）。 */
function qecUncodedThreshold(cfg = {}, lo = 1e-4, hi = 0.6){
  const f = p => qecExactPL({ ...cfg, p }) - qecUncodedRate({ ...cfg, p });
  const fLo = Number.isFinite(f(lo)) ? f(lo) : NaN;
  const fHi = Number.isFinite(f(hi)) ? f(hi) : NaN;
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) return null;
  if (fLo * fHi > 0) return null;          /* 同向：无交点 */
  let a = lo, b = hi;
  for (let i = 0; i < 20; i++){
    const m = 0.5 * (a + b);
    if (f(m) * f(a) > 0) a = m; else b = m;
  }
  return 0.5 * (a + b);
}

/* ===== src/qec/sweep-worker.js ===== */
/* sweep-worker.js — 扫描点的并行计算（R126 建立，R127 修取消语义）
 *
 * 协议（单向派发、逐点回传）：
 *   main → worker : { id, cfg }       算一整轮扫描
 *   main → worker : { cancel: true }  作废在途任务（换配置 / 离开 mode）
 *   worker → main : { id, i, n, row } 第 i 点算完（n = 总点数，用于进度）
 *   worker → main : { id, done }      整轮完成
 *   worker → main : { id, error }     失败 ⟹ 主线程接手
 *
 * ⚠ R127 修的**真缺陷**：首版循环是同步跑完的，而 Worker 只有在消息队列空闲时才处理
 *   下一条消息 ⟹ `{cancel:true}` 会排在整轮之后才被看到，**根本打断不了在途任务**
 *   （旧任务继续吃 CPU，而 cancel 的存在意义正是让它停）。修法：逐点 `await` 让出，
 *   让 cancel 有机会插入；每次继续前检查 dead。
 * ⚠ 让出后会出现「旧任务在跑时来了新任务」：此时**不能**直接开跑（两个循环会交错
 *   回传），也不能丢掉新任务（主线程在等它的 done ⟹ 扫描永远结束不了）。处理：
 *   置 dead 打断旧的，新任务进**单槽队列**，旧任务退出后接着跑。
 * ⚠ NaN 要走 null：CDP 的 returnByValue 不过 NaN（R116 已踩过），主线程回转成 NaN。
 * ⚠ Worker 在 file:// 与单文件 dist 下不可用 ⟹ 由调用方的回退路径兜住。 */

let dead = false;      /* 打断在途任务 */
let busy = false;      /* 有任务在跑 */
let queued = null;     /* 单槽：只要最新的一条（旧的自然过期） */
const yield1 = () => new Promise(r => setTimeout(r, 0));

async function run(m){
  busy = true;
  dead = false;
  const id = m.id;
  try {
    const plan = qecSweepPlan(m.cfg || {});
    for (let i = 0; i < plan.length; i++){
      const r = plan.step(i);
      self.postMessage({ id, i, n: plan.length, row: {
        p: r.p, PL: r.PL,
        PLexact: Number.isFinite(r.PLexact) ? r.PLexact : null,
        Pun: r.Pun,
        /* R129：扫描策略的两项附注——PL 的来源（mc/exact）与逐点成本（ms）。
           少了它们，主线程就无法区分「MC 点」与「跳过 MC 的精确点」，也不可能
           在诊断面板里报 DP/MC 成本拆分。 */
        PLsrc: r.PLsrc || 'mc',
        tExact: r.tExact || 0, tMc: r.tMc || 0,
      } });
      await yield1();                 /* 让出 ⟹ cancel 才能被处理 */
      if (dead) return;               /* 被作废：不再发 done（主线程按 id 丢弃） */
    }
    self.postMessage({ id, done: true });
  } catch (err){
    self.postMessage({ id, error: String((err && err.message) || err) });
  } finally {
    busy = false;
    const nx = queued; queued = null;
    if (nx) run(nx);
  }
}

self.onmessage = e => {
  const m = e.data || {};
  if (m.cancel){ dead = true; return; }
  if (busy){ dead = true; queued = m; return; }   /* 打断旧的、排队新的 */
  run(m);
};
