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
import { qcNewState, qcApply, qcMeasureQubit, mulberry32, qcQubitRho, qcRhoFidelity, qcExpect, qcFrToggle, qcFrGate } from './qcircuit.js';
import { gnTouched, gnPauli, gnSampleError } from './gatenoise.js';

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

export const QEC_DEFAULTS = {
  code: 'bitflip',        /* bitflip | phaseflip */
  p: 0.05,
  /* 逻辑初态 Ry(θ)Rz(φ)|0⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩。
     默认取 **|+i⟩**（θ=π/2, φ=π/2）而不是 |+⟩：X_L|+⟩=|+⟩，逻辑 X 错误在 |+⟩ 上
     **完全不可观测**（首版用 |+⟩，双错试验的保真度仍是 1，P_L 恒为 0）。 */
  theta: Math.PI / 2, phase: Math.PI / 2,
  trials: 4000,
  seed: 7,
  /* ---- R86 门级噪声 ---- */
  noise: 'iid',           /* iid（R78 静态口径，默认）| gate（R80 门级口径） */
  spectrum: 'depolar',    /* depolar | x | z（gate 模式；iid 模式下谱由码定：
                             bitflip 只翻 X、phaseflip 只翻 Z，与 R78 一致） */
  noisyPhase: 'extract',  /* extract（默认，只提取段）| all（encode/extract/decode） */
};

/* 噪声模型与谱的页面标签（src/qec.js 用） */
export const QEC_NOISE = {
  iid: { label: '静态 i.i.d.', short: 'iid',
    desc: 'R78 口径：编码后、解码前，每个数据比特独立以概率 p 翻一次 Pauli（bitflip 码翻 X、phaseflip 码翻 Z）。错误**不挂在门上**——3 个数据比特 = 3 次错误机会。' },
  gate: { label: '门级（R80）', short: 'gate',
    desc: 'R80 口径：每个门作用后，对该门触及的每个比特以概率 p 注入随机 Pauli。错误机会数 = Σ|gnTouched(门)|（提取段 8/12 个，「all」口径 16/26 个）——同一个 p，机会越多 P_L 越高。' },
};
export const QEC_SPECTRA = {
  depolar: { label: '退极化 X/Y/Z', short: 'depol' },
  x: { label: '仅 X', short: 'X' },
  z: { label: '仅 Z', short: 'Z' },
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

/* 谱权重（与 gatenoise.js 的 gnSampleError 同分布；survey/DP 共用） */
export function qecSpecW(spectrum){
  if (spectrum === 'x') return { x: 1, y: 0, z: 0 };
  if (spectrum === 'z') return { x: 0, y: 0, z: 1 };
  return { x: 1 / 3, y: 1 / 3, z: 1 / 3 };
}

/* ============================================================================
 * 探针掩码（qcExpect 的 (xm,zm) 形式）
 *   bitflip（计算基帧）：稳定子 Z₀Z₁/Z₁Z₂；逻辑 X_L=X₀X₁X₂、Z_L=Z₀、Y_L=Y₀X₁X₂
 *   phaseflip（H 帧）：稳定子 X₀X₁/X₁X₂；逻辑 X_L^H=X₀X₁X₂、Z_L^H=Z₀Z₁Z₂、
 *     Y_L^H = i·X_L^H·Z_L^H = −Y₀Y₁Y₂（整体相位不影响符号判定：参考值与实测值
 *     用同一个算符，且陪集归属只看交换关系）
 *   代表元可差一个稳定子（对码空间态期望相同，R86 论证见头注）。
 * ========================================================================== */
const QEC_PROBES = {
  bitflip: {
    stabs: [{ xm: 0, zm: 0b011 }, { xm: 0, zm: 0b110 }],
    XL: { xm: 0b111, zm: 0 }, ZL: { xm: 0, zm: 0b001 }, YL: { xm: 0b111, zm: 0b001 },
  },
  phaseflip: {
    stabs: [{ xm: 0b011, zm: 0 }, { xm: 0b110, zm: 0 }],
    XL: { xm: 0b111, zm: 0 }, ZL: { xm: 0, zm: 0b111 }, YL: { xm: 0b111, zm: 0b111 },
  },
};

/* 末态探针：2 个稳定子期望 + 3 个逻辑期望（ancilla 已测掉，只读数据比特） */
export function qecProbe(s, code){
  const P = QEC_PROBES[code] || QEC_PROBES.bitflip;
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
export function qecClass(pre, ref, F){
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
   解码把码空间映到 q0 单个逻辑比特，q1/q2 理应归 |0⟩。残差帧只看数据位：
   q0 上有 X/Y ⟹ 逻辑 X 型；Z/Y ⟹ 逻辑 Z 型；皆有 ⟹ Y 型；q0 干净而 q1/q2
   脏 ⟹ gauge（逻辑完好、物理比特脏，F=1 精确成立）；全干净 ⟹ perfect。
   与 F<0.5 在非退化参考态上逐位一致（pot86 断言）；盲区（|+⟩ 上的 X_L）
   帧说 logic 而 F=1——那是参考态看不见，不是判定错。 */
export function qecDecodedClass(fr){
  const x = fr.x & 0b111, z = fr.z & 0b111;
  const x0 = x & 1, z0 = z & 1;
  if (x0 && z0) return { coset: 3, cls: 'logic' };
  if (x0) return { coset: 1, cls: 'logic' };
  if (z0) return { coset: 2, cls: 'logic' };
  if (x || z) return { coset: -1, cls: 'gauge' };
  return { coset: 0, cls: 'perfect' };
}

/* ---------- 帧残差 → 码空间陪集（与探针独立的一条路径） ---------- */
const QEC_STAB_SPAN = (() => {
  const mk = (gens) => {
    const set = new Set();
    for (let m = 0; m < (1 << gens.length); m++){
      let x = 0, z = 0;
      for (let b = 0; b < gens.length; b++) if (m & (1 << b)){ x ^= gens[b].xm; z ^= gens[b].zm; }
      set.add(x * 8 + z);
    }
    return set;
  };
  return {
    bitflip: mk([{ xm: 0, zm: 0b011 }, { xm: 0, zm: 0b110 }]),
    phaseflip: mk([{ xm: 0b011, zm: 0 }, { xm: 0b110, zm: 0 }]),
  };
})();
const QEC_LOGIC = {
  bitflip: [{ xm: 0b111, zm: 0 }, { xm: 0, zm: 0b001 }, { xm: 0b111, zm: 0b001 }],
  phaseflip: [{ xm: 0b111, zm: 0 }, { xm: 0, zm: 0b111 }, { xm: 0b111, zm: 0b111 }],
};
/* 帧陪集：0 = ∈S（perfect）· 1/2/3 = X_L/Z_L/Y_L 陪集（logic）· −1 = ∉N(S) */
export function qecFrameCoset(code, fr){
  if (!fr.x && !fr.z) return 0;
  const span = QEC_STAB_SPAN[code] || QEC_STAB_SPAN.bitflip;
  if (span.has(fr.x * 8 + fr.z)) return 0;
  const L = QEC_LOGIC[code] || QEC_LOGIC.bitflip;
  for (let i = 0; i < 3; i++){
    if (span.has((fr.x ^ L[i].xm) * 8 + (fr.z ^ L[i].zm))) return i + 1;
  }
  return -1;
}
/* 帧的最小权重代表元（S 内元素物理上不可见——不取最小会把「无害的稳定子」
   报成权重 2，flagsynd 踩过的坑，pot81 抓出） */
export function qecFrameWeight(code, fr){
  const span = QEC_STAB_SPAN[code] || QEC_STAB_SPAN.bitflip;
  let best = popc((fr.x | fr.z) & 0b111);
  for (const k of span){
    const x = (k / 8) | 0, z = k % 8;
    const w = popc(((fr.x ^ x) | (fr.z ^ z)) & 0b111);
    if (w < best) best = w;
  }
  return best;
}
function popc(v){ let c = 0; while (v){ c += v & 1; v >>>= 1; } return c; }

/* ============================================================================
 * 线路（单一数据源：试验 / 故障枚举 / 门数统计共用，保证枚举与真跑不 diverg）
 * ========================================================================== */
const CIRC_CACHE = new Map();
export function qecCircuit(code = 'bitflip', cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const spec = QEC_CODES[code] || QEC_CODES.bitflip;
  const isPhase = code === 'phaseflip';
  const key = `${code}|${c.theta}|${c.phase}`;
  let circ = CIRC_CACHE.get(key);
  if (circ) return circ;
  const ops = [];
  const push = (o) => { ops.push(o); return ops.length - 1; };
  /* ① 逻辑初态（理想；帧在此必为零，非 Clifford 门的帧抛错不会触发） */
  push({ op: 'ry', q: 0, theta: c.theta, ph: 'prep' });
  push({ op: 'rz', q: 0, theta: c.phase, ph: 'prep' });
  /* ② 编码（phaseflip 追加 H×3 转入 H 帧——稳定子是 X 型，α|000⟩+β|111⟩
     不是 X 稳定子本征态；首版漏了这三步 H，测出的综合恒为 01） */
  push({ op: 'cnot', c: 0, q2: 1, ph: 'encode' });
  push({ op: 'cnot', c: 0, q2: 2, ph: 'encode' });
  if (isPhase) for (let q = 0; q < 3; q++) push({ op: 'h', q, ph: 'encode' });
  /* ③ 静态噪声块的决策点（gate 模式跳过：错误挂在门上，没有静态块） */
  push({ op: 'noise', ph: 'noise' });
  /* ④ 稳定子测量（ancilla 3 测 Z₀Z₁ 或 X₀X₁；4 测 Z₁Z₂ 或 X₁X₂）。
     X 类用 H–CNOT(a→d)×2–H 的相位反冲：有效操作条件于 X_{qa}X_{qb}，
     对稳定子本征态给出确定读数且不动数据（R78 同款，pot78 B5 同构验证）。 */
  for (const [qa, qb, anc, si] of [[0, 1, 3, 0], [1, 2, 4, 1]]){
    if (spec.stab === 'z'){
      push({ op: 'cnot', c: qa, q2: anc, ph: 'extract', stab: si });
      push({ op: 'cnot', c: qb, q2: anc, ph: 'extract', stab: si });
    } else {
      push({ op: 'h', q: anc, ph: 'extract', stab: si });
      push({ op: 'cnot', c: anc, q2: qa, ph: 'extract', stab: si });
      push({ op: 'cnot', c: anc, q2: qb, ph: 'extract', stab: si });
      push({ op: 'h', q: anc, ph: 'extract', stab: si });
    }
    push({ op: 'meas', q: anc, ph: 'extract', stab: si });
  }
  /* ⑤ 修正点（运行期按综合征查表插入，不带噪声；探针在此取样） */
  push({ op: 'fix', ph: 'correct' });
  /* ⑥ 解码：phaseflip 先回计算基，再用编码的逆（CNOT 自逆，控制必须是 q0） */
  if (isPhase) for (let q = 0; q < 3; q++) push({ op: 'h', q, ph: 'decode' });
  push({ op: 'cnot', c: 0, q2: 1, ph: 'decode' });
  push({ op: 'cnot', c: 0, q2: 2, ph: 'decode' });

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
  /* ⚠ 缓存口径剔除逐次运行选项（forceErrors / faults）：CIRC_CACHE 的 key 只有
     code|theta|phase，先跑的 forced 试验会把它们烘进 circ.cfg；qecExec 的 cfg
     合并不覆盖缺失键，后续 ensemble（cfg 无这些键）会看到陈旧值——空数组也
     truthy ⟹ 噪声分支走空循环：不注入、不消耗 rng，PL 恒 0。R86 复写引入的坑，
     基线比对抓出。qecExec 只读 opts.faults，但缓存仍须剔除以防语义泄漏。 */
  const cacheCfg = { ...c };
  delete cacheCfg.forceErrors;
  delete cacheCfg.faults;
  circ = { code, nq: 5, spec, cfg: cacheCfg, ops, stats: { nq: 5, gates, cnots, singles, meas, opps, M: opps.encode + opps.extract + opps.decode } };
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
export function qecExec(circ, opts = {}){
  const c = { ...circ.cfg, ...(opts.cfg || {}) };
  const spec = circ.spec;
  const faults = opts.faults || null;
  const rng = opts.rng || null;
  const p = opts.p != null ? opts.p : (c.p || 0);
  const spectrum = opts.spectrum || c.spectrum || 'depolar';
  const gateMode = (opts.noise || c.noise || 'iid') === 'gate';
  const noisyAll = (opts.noisyPhase || c.noisyPhase || 'extract') === 'all';
  const noisyPh = gateMode ? (noisyAll ? ['encode', 'extract', 'decode'] : ['extract']) : [];
  const s = qcNewState(circ.nq);
  const fr = { x: 0, z: 0 };
  const syn = [], synFrame = [], fired = [];
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
  let fixQ = -1, pre = null, frAtFix = null;

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
        for (let q = 0; q < 3; q++){
          if (rng && rng() < p){
            qcApply(s, { op: spec.err, q });
            qcFrToggle(fr, q, spec.err);
            noiseErrors.push(q);
          }
        }
      }
      continue;
    }
    if (o.op === 'meas'){ syn.push(measure(o.q)); continue; }
    if (o.op === 'fix'){
      fixQ = qecFixFromSyndrome(syn);
      if (fixQ >= 0){
        qcApply(s, { op: spec.fix, q: fixQ });
        qcFrToggle(fr, fixQ, spec.fix);
      }
      /* 探针取样点：所有修正已完成、解码之前（码空间仍完好定义） */
      pre = qecProbe(s, circ.code);
      frAtFix = { x: fr.x & 0b111, z: fr.z & 0b111 };
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
  const frAtEnd = { x: fr.x & 0b111, z: fr.z & 0b111 };
  const dec = qecDecodedClass(frAtEnd);
  return {
    syn, synFrame, fixQ, pre, frAtFix, frAtEnd,
    cosetFix: qecFrameCoset(circ.code, frAtFix),
    cosetDec: dec.coset, clsDec: dec.cls,
    F, logicalError: F < 0.5,
    errors: noiseErrors.slice(),
    fired: fired.slice(),
    state: s,
    p0: rho0.re[0][0], p1: rho0.re[1][1],
    diag,
  };
}

/* 理想跑同一条线路取参考期望（探针判据的基准；缓存） */
const REF_CACHE = new Map();
export function qecRef(circ){
  const key = circ.code + '|' + circ.cfg.theta + '|' + circ.cfg.phase;
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
export function qecTrial(cfg = {}, rng){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const circ = qecCircuit(c.code, c);
  const ref = qecRef(circ);
  const r = qecExec(circ, { rng, cfg: c, faults: c.faults || null });
  const cl = qecClass(r.pre, ref, r.F);
  const trace = [];
  trace.push({ step: 'prepare', gate: 'Ry(θ)Rz(φ)' });
  trace.push({ step: 'encode', gate: 'CNOT×2' });
  if (c.code === 'phaseflip') trace.push({ step: 'basis', gate: 'H×3' });
  if (c.noise === 'gate'){
    trace.push({ step: 'gatenoise', faults: r.fired.slice() });
  } else {
    trace.push({ step: 'noise', errors: r.errors.slice() });
  }
  trace.push({ step: 'syndrome', syn: r.syn.slice(), synFrame: r.synFrame.slice() });
  trace.push({ step: 'correct', q: r.fixQ });
  if (c.code === 'phaseflip') trace.push({ step: 'basis', gate: 'H×3' });
  trace.push({ step: 'decode', gate: 'CNOT×2' });
  return {
    errors: r.errors, syn: r.syn, fixQ: r.fixQ, F: r.F, logicalError: r.logicalError,
    ok: !r.logicalError,
    trace,
    /* 三比特振幅（|000⟩ 与 |111⟩ 的模方，解码后应分别在 |000⟩/|100⟩ 上） */
    p0: r.p0, p1: r.p1,
    state: r.state,
    /* ---- R86 门级噪声新增 ---- */
    noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase,
    faults: r.fired, cls: cl.cls, coset: cl.coset, sX: cl.sX, sY: cl.sY, sZ: cl.sZ,
    clsDec: r.clsDec, cosetDec: r.cosetDec, synFrame: r.synFrame, pre: r.pre,
  };
}

/* ============================================================================
 * 一批试验：P_L 与按「错误个数」的分解（R78 口径）+ 结局五分类（R86）
 * ========================================================================== */
export function qecEnsemble(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const circ = qecCircuit(c.code, c);
  const ref = qecRef(circ);
  const rng = mulberry32(c.seed);
  const n = Math.max(1, c.trials | 0);
  let nL = 0, nLdec = 0;
  const byCount = [0, 0, 0, 0];          /* 0/1/2/3 个错（i.i.d. 口径） */
  const byCountL = [0, 0, 0, 0];         /* 其中判成逻辑错误的 */
  const synCount = [0, 0, 0, 0];         /* 四种综合的频次 */
  const fates = { perfect: 0, gauge: 0, outside: 0, logic: 0, mixed: 0 };  /* 探针（码空间） */
  const fatesDec = { perfect: 0, gauge: 0, logic: 0 };                     /* 解码后（逻辑比特） */
  const faultHist = {};
  let faultSum = 0, synMiss = 0, randomMeas = 0, disagree = 0, disagreeBlind = 0, blind = 0;
  for (let k = 0; k < n; k++){
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
    synCount[r.syn[0] * 2 + r.syn[1]]++;
  }
  return {
    p: c.p, code: c.code, trials: n, PL: nL / n, PLdec: nLdec / n,
    /* PLexact：i.i.d. 模式 = 解析 3p²−2p³；gate 模式 = DP-over-frames 精确值
       （末态判据与 PL 同为 q0 约化 F<0.5，可直接 4σ 对账） */
    PLexact: c.noise === 'gate' ? qecExactPL(c) : qecLogicalRate(c.p), Pun: c.p,
    noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase,
    byCount, byCountL, synCount,
    fates, fatesDec, faultHist,
    meanFaults: c.noise === 'gate' ? faultSum / n : NaN,
    meanFaultsIID: c.noise === 'gate' ? NaN : (byCount[1] + 2 * byCount[2] + 3 * byCount[3]) / n,
    synMiss, randomMeas, disagree, disagreeBlind, blind,
    stats: circ.stats,
  };
}

/* 解析：P_L = 3p²(1−p) + p³ = 3p² − 2p³ */
export function qecLogicalRate(p){
  return 3 * p * p * (1 - p) + p * p * p;
}
/* 阈值：P_L(p) = p ⟹ p = 1/2（另一根 p=1 是退化解） */
export function qecThreshold(){ return 0.5; }

/* 扫描：对一组 p 各跑一批（页面曲线用；pot78 用大 trials）。
   gate 模式追加 DP-over-frames 精确曲线（PLexact 列），MC 点照常。 */
export function qecSweep(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const gate = c.noise === 'gate';
  const ps = c.ps || (gate
    ? Array.from({ length: 16 }, (_, i) => 0.002 * Math.pow(0.3 / 0.002, i / 15))
    : [0.002, 0.005, 0.01, 0.02, 0.04, 0.07, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5]);
  const out = { p: [], PL: [], PLexact: [], Pun: [], noise: c.noise, spectrum: c.spectrum, noisyPhase: c.noisyPhase };
  for (const p of ps){
    out.p.push(p);
    out.Pun.push(p);
    if (gate){
      out.PLexact.push(qecExactPL({ ...c, p }));
      const e = qecEnsemble({ ...c, p, trials: c.sweepTrials || 1200 });
      out.PL.push(e.PL);
    } else {
      const e = qecEnsemble({ ...c, p });
      out.PL.push(e.PL);
      out.PLexact.push(e.PLexact);
    }
  }
  return out;
}

/* ============================================================================
 * DP-over-frames 精确解：P_L(p) 的精确多项式（零统计误差）
 *
 * 帧空间 2^{2·5} = 1024（5 比特的 x/z 掩码）× 综合征 4（两位），每个门后按谱
 * 分支；测量读帧的 x 位（确定）、修正查表（确定）、解码传播（确定）⟹ 全程无
 * 随机分支，末态帧完全决定结局。与态矢 MC 是两套独立表示，4σ 对账。
 * ========================================================================== */
export function qecExactPL(cfg = {}){
  const c = { ...QEC_DEFAULTS, ...cfg };
  const circ = qecCircuit(c.code, c);
  const gate = c.noise === 'gate';
  const noisyAll = c.noisyPhase === 'all';
  const noisyPh = gate ? (noisyAll ? ['encode', 'extract', 'decode'] : ['extract']) : [];
  const W = qecSpecW(c.spectrum);
  const p = Math.max(0, Math.min(1, c.p));
  const spec = circ.spec;
  /* 键：((x<<5)|z)<<2 | syn */
  let dist = new Map([[0, 1]]);
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  for (const o of circ.ops){
    if (o.op === 'noise'){
      if (gate) continue;                    /* 门级模式：没有静态块 */
      /* i.i.d.：逐数据比特独立以 p 施加 spec.err */
      const next = new Map();
      for (const [k, v] of dist){
        let cur = new Map([[k, v]]);
        for (let q = 0; q < 3; q++){
          const nx = new Map();
          for (const [kk, vv] of cur){
            const x = (kk >> 7) & 31, z = (kk >> 2) & 31, syn = kk & 3;
            add(nx, kk, vv * (1 - p));
            const b = 1 << q;
            const x2 = spec.err === 'x' ? (x ^ b) : x;
            const z2 = spec.err === 'z' ? (z ^ b) : z;
            add(nx, ((x2 << 5) | z2) << 2 | syn, vv * p);
          }
          cur = nx;
        }
        for (const [kk, vv] of cur) add(next, kk, vv);
      }
      dist = next;
      continue;
    }
    if (o.op === 'meas'){
      /* 综合征位 = 帧的 x 位（确定，无分支：残差是 Pauli、ancilla 测前是
         Z 本征态，读数由帧的 X 分量唯一决定——与态矢路径逐位一致） */
      const next = new Map();
      for (const [k, v] of dist){
        const x = (k >> 7) & 31, syn = k & 3;
        add(next, (k & ~3) | (syn | (((x >> o.q) & 1) << o.stab)), v);
      }
      dist = next;
      continue;
    }
    if (o.op === 'fix'){
      const next = new Map();
      for (const [k, v] of dist){
        const x = (k >> 7) & 31, z = (k >> 2) & 31, syn = k & 3;
        const fixQ = qecFixFromSyndrome([syn & 1, (syn >> 1) & 1]);
        let x2 = x, z2 = z;
        if (fixQ >= 0){
          const b = 1 << fixQ;
          if (spec.fix === 'x') x2 ^= b; else z2 ^= b;
        }
        add(next, ((x2 << 5) | z2) << 2 | syn, v);
      }
      dist = next;
      continue;
    }
    /* 普通门：帧传播（确定）+ 门后注错（按谱分支） */
    const next = new Map();
    for (const [k, v] of dist){
      const fr = { x: (k >> 7) & 31, z: (k >> 2) & 31 };
      const syn = k & 3;
      qcFrGate(fr, o);
      let cur = new Map([[((fr.x << 5) | fr.z) << 2 | syn, v]]);
      if (gate && p > 0 && o.ph !== 'prep' && noisyPh.includes(o.ph)){
        for (const q of gnTouched(o)){
          const nx = new Map();
          for (const [kk, vv] of cur){
            const x = (kk >> 7) & 31, z = (kk >> 2) & 31, sy = kk & 3;
            add(nx, kk, vv * (1 - p));
            const b = 1 << q;
            for (const t of ['x', 'y', 'z']){
              if (!W[t]) continue;
              const x2 = (t === 'x' || t === 'y') ? (x ^ b) : x;
              const z2 = (t === 'z' || t === 'y') ? (z ^ b) : z;
              add(nx, ((x2 << 5) | z2) << 2 | sy, vv * p * W[t]);
            }
          }
          cur = nx;
        }
      }
      for (const [kk, vv] of cur) add(next, kk, vv);
    }
    dist = next;
  }
  /* 末态：q0 约化保真度（解析，R78 口径 F<0.5）。
     Pauli 残差下末态是乘积态 E|ψ_full⟩ = E_q0|ψ₀⟩⊗E_{q1q2}|00⟩，q1/q2 的
     污位被 partial trace 掉（约化保真度看不见）⟹ F 只由 q0 的 (x₀,z₀) 决定：
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
    const x = (k >> 7) & 31, z = (k >> 2) & 31;
    if (fQ0(x & 1, z & 1) < 0.5) PL += v;
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
export function qecFaultSites(circ){
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

export function qecFaultSurvey(cfg = {}, order = 1){
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
      wPre: qecFrameWeight(circ.code, r.frAtFix), wEnd: qecFrameWeight(circ.code, r.frAtEnd),
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
