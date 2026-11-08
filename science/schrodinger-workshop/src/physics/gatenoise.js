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
import { qcNewState, qcApply, qcApplyAll, qcProgramMatrix, mulberry32, qcFidelity } from './qcircuit.js';
import { nzBloch, nzConcurrence } from './noise.js';

export const GN_DEFAULTS = {
  preset: 'idle',                 /* idle | rot | bell | ghz */
  n: 4,                           /* 仅 ghz 用（3/4/5）；其余预设固定 */
  k: 12,                          /* 线路长度：idle/rot = 操作门数；bell/ghz = 附加空闲轮数 */
  pGate: 0.02,                    /* 每门每比特 Pauli 错误概率 */
  spectrum: 'depolar',            /* depolar | x | z */
  theta: Math.PI / 2, phase: 0,   /* 单比特预设的输入态 |ψ⟩ = cos(θ/2)|0⟩+e^{iφ}sin(θ/2)|1⟩ */
  trials: 3000, seed: 7,
  nPts: 25, pMax: 0.3, kMax: 64,  /* 扫描范围（页面曲线用） */
};

export const GN_SPECTRA = {
  depolar: { label: '退极化 X/Y/Z', short: 'depolar' },
  x: { label: '仅 X（比特翻）', short: 'X' },
  z: { label: '仅 Z（相位翻）', short: 'Z' },
};

/* 旋转链预设的每门转角（固定小角，避免与输入态 θ 混淆） */
const ROT_TWIST = 0.35;

export const GN_PRESETS = {
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
export function gnTouched(g){
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
export function gnPauli(s, q, t){
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
export function gnSampleError(spectrum, p, rng){
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
export function gnPresetGates(name, n, k, theta, phi){
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
export function gnTrial(n, gates, cfg = {}, rng){
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
export function gnRhoNew(n){
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

export function gnRhoRun(n, gates, cfg = {}){
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
export function gnFidelityRho(rho, psi){
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
export function gnZCorr(rho, qs){
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
export function gnZCorrPure(s, qs){
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
export function gnRhoInfo(rho, spec){
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
export function gnStream(cfg = {}){
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
export function gnRun(cfg = {}){
  const s = gnStream(cfg);
  s.step(s.total);
  return s.result();
}

/* ---------- ③ 闭式 ---------- */
/* λ：每门每比特一次错误机会的 Bloch 收缩因子 */
export function gnLambda(spectrum, p){
  return spectrum === 'depolar' ? 1 - 4 * p / 3 : 1 - 2 * p;
}

/* Z 型可观测量的收缩因子：z 谱下 Z 错误与 Z 对易 ⟹ 完全不缩 */
export function gnGammaZ(spectrum, p){
  if (spectrum === 'depolar') return 1 - 4 * p / 3;
  if (spectrum === 'x') return 1 - 2 * p;
  return 1;
}

/* 平均门保真度（单比特门）：与谱无关 */
export function gnGateFidelity(p){ return 1 - 2 * p / 3; }

/* 恒等链：输入 Bloch r（|r|=1），k 个恒等门后对理想态的保真度 */
export function gnIdleFidelity(spectrum, p, k, r){
  if (spectrum === 'depolar') return (1 + Math.pow(gnLambda(spectrum, p), k)) / 2;
  const l = Math.pow(1 - 2 * p, k);
  if (spectrum === 'x') return (1 + r[0] * r[0] + l * (r[1] * r[1] + r[2] * r[2])) / 2;
  return (1 + r[2] * r[2] + l * (r[0] * r[0] + r[1] * r[1])) / 2;
}

/* 恒等链：k 个恒等门后的 Bloch 向量 */
export function gnIdleBloch(spectrum, p, k, r){
  const l = Math.pow(gnLambda(spectrum, p), k);
  if (spectrum === 'depolar') return [l * r[0], l * r[1], l * r[2]];
  if (spectrum === 'x') return [r[0], l * r[1], l * r[2]];
  return [l * r[0], l * r[1], r[2]];
}

/* 输入态 |ψ(θ,φ)⟩ 的 Bloch 向量 */
export function gnStateBloch(theta, phi){
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
export function gnBellConcurrence(spectrum, p, k = 0){
  if (spectrum === 'depolar'){
    const l = Math.pow(1 - 4 * p / 3, 2 * k + 3);
    return Math.max(0, l - (1 - Math.pow(1 - 4 * p / 3, 2 * k + 2)) / 2);
  }
  if (spectrum === 'x') return Math.pow(1 - 2 * p, 2 * k + 2);
  return Math.pow(1 - 2 * p, 2 * k + 3);
}

/* Bell 线路对 |Φ⁺⟩ 的保真度闭式（depolar：F = A+w = (1+λ^{2k+2})/4+λ^{2k+3}/2） */
export function gnBellFidelity(spectrum, p, k = 0){
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
export function gnGhzParity(n){ return (n % 2 === 0) ? 1 : 0; }
export function gnGhzPrepEvents(n){ return (n % 2 === 0) ? (3 * n - 2) / 2 : (3 * n - 1) / 2; }
export function gnGhzCorr(spectrum, p, n, k, i, j){
  const g = gnGammaZ(spectrum, p);
  if (i === 0 && j === 1) return Math.pow(g, 2 * k + n);
  if (i === 1 && j === 2) return Math.pow(g, 2 * k + 3);
  return NaN;   /* 其余比特对无闭式（页面只画 (0,1)/(1,2) 两条） */
}
export function gnGhzZN(spectrum, p, n, k){
  return gnGhzParity(n) * Math.pow(gnGammaZ(spectrum, p), n * k + gnGhzPrepEvents(n));
}

/* Bell ESD 的 p*（C 首次归零）：x 谱 (1−2p)^{2k+2} 要到 p=1/2 才归零 ⟹
   **无猝死**；z 谱 1/2；depolar 解 2λ^{2k+3}+λ^{2k+2}−1=0（λ∈(0,1) 单调 ⟹ 二分）。 */
export function gnEsdBells(spectrum, p, k = 0){
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
export function gnClosedAt(cfg, p, k){
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
export function gnSweep(cfg = {}){
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
