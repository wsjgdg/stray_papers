/* ============================================================================
 * flagsynd.js — R81 容错综合提取：冗余验证（flag）与猫态
 *
 * 动机（接 R80）：R80 把错误挂到**每个门**上，得到「门的数量 = 错误机会的数量」。
 * 但 R79 的 Shor 码分析里综合提取（syndrome extraction）被当成**理想**的：
 * 提取线路自己一个错误都不犯。真实硬件上提取线路的每个 CNOT 都是错误机会，
 * 而且——关键——**ancilla 上的一个错误会顺着 CNOT 传播到多个数据比特**。
 *
 * 三条结构性事实（pot81 逐条数值裁决，不是文献引文）：
 *   ① 标准提取（X 类，权重 6）：H(a); CNOT(a→0) … CNOT(a→5); H(a); 测 a。
 *      ancilla 在 CNOT(a→0) 之后吃一个 X 错误 ⟹ X 顺着后面 5 道 CNOT 全部传播到
 *      数据 ⟹ **权重 5** 的静默数据错误；而综合征**一位都不错**（X 与 |+⟩ 对易、
 *      与 X 基读数对易）⟹ 解码器毫无察觉。9 比特码只纠权重 1 ⟹ 单故障把码字
 *      推出码空间，而且没人知道。
 *   ② Z 类（权重 2）的 ancilla 是 CNOT 的**目标**：X_a 不传播（但会翻转 Z 读数
 *      ⟹ 假综合征）；Z_a 向控制端传播（Z_t → Z_c Z_t）⟹ 权重 ≤1 的 Z 错误，
 *      本轮后面的 X 类提取能看见它。
 *   ③ 提取期间产生的 X 错误，本轮后面没有任何测量能看见（X 类稳定子不测 X，
 *      Z 类稳定子已经测完了）⟹ 单轮提取的固有限制、多轮提取的必要性。
 *
 * 一个被数值否决的方案（留档，本轮第一版）：对权重 2 的 Z 类稳定子做
 * 「1-flag」——CNOT(d0→a); CNOT(a→f); CNOT(d1→a)——想把 a 的 X 错误搬到 f 上。
 * 不成立：ancilla 在两道数据 CNOT 之间**已经持有数据值**（a = d0），flag CNOT
 * 会把数据纠缠进 f，理想态保真度 0.6048 而不是 1（pot81 首次运行即抓出）。
 * 结论：权重 2 的稳定子没有干净的 1-flag；要么冗余比对，要么换猫态。
 *
 * 本轮实现的两条修法（可数值验证，不是引用）：
 *   冗余验证（dup）：同一个稳定子用**两个独立 ancilla 各测一遍**，两份读数不一致
 *     ⟹ flag ⟹ 丢弃本轮。理想情形两份必然相等（无假警报）。它把「静默」变成
 *     「检出」，但**检出 ≠ 修复**：数据上的错误照样在（后面 weight 一览会看到）。
 *   猫态（cat）：权重的 w 的稳定子用 **w 个 ancilla 的 GHZ**，每个只碰 1 个数据
 *     比特 ⟹ 单故障最多污染 1 个数据比特。GHZ 的 Z 奇偶用一道验证序列搬到 flag：
 *     单个 X 错误必然把偶数奇偶翻成奇数 ⟹ **确定性**检出（不是 50%）。
 *     注意 X 类 ancilla 处在 |+⟩，X 是它的稳定子，单 ancilla 上**原理上看不见**；
 *     GHZ 不满足这一点，所以猫态是 X 类唯一可检的形态。
 *
 * 判定口径（与 R79 同源，但改为**从末态反推**）：修正后、解码前，末态是纯的
 * （所有 ancilla 都被测掉），所以它是某个 Pauli E 作用在码字上的结果。测 8 个
 * 稳定子的期望 ⟨g⟩ = ±1 得 E 的综合征；全 +1 则 E ∈ N(S)，再用三个逻辑分量
 * ⟨X_L⟩⟨Y_L⟩⟨Z_L⟩ 与理想值的符号差定陪集（0 / X / Z / Y）。四类结局：
 *   perfect  残差 ∈ S（解码后 F=1，精确）
 *   logic    残差 ∈ 逻辑陪集（**静默**逻辑错误 —— 容错的真正失败模式）
 *   outside  残差 ∉ N(S)（打出码空间；本轮修不回来，下一轮能看见）
 *   flagged  flag=1（后选择丢弃，不计入逻辑错误，代价是丢弃率）
 * 另有一条完全独立的 **Pauli 帧**演算（辛表示 + 门传播规则）给出残差与权重，
 * 与末态探针逐故障对账 —— 两条路径独立，任一处写错都会对不上。
 *
 * 诚实限制：
 *   ① 单轮提取。X 类稳定子排在后面，其提取期内的 X 错误本轮无人看见（事实③）。
 *      四种线路共用同一顺序，对照公平；但绝对数值偏悲观，「多轮」才是实战口径。
 *   ② 重置（测后翻回 |0⟩）按理想处理，不注入故障。
 *   ③ 输入态制备按理想给（与 R80 的 noisyFrom 同约定）。
 *   ④ 判定用末态 + 单轮解码，**不是**多轮记忆实验的阈值估计；阈值需要跨轮联合
 *      解码，本轮只给「单故障 → 结局」的精确映射与权重分布。
 *   ⑤ 猫态按「每个 ancilla 只碰 1 个数据比特」的理想结构实现；真实器件上
 *      猫态的制备本身比这贵得多（GHZ 制备的 5 道 CNOT 已计入开销）。
 * ========================================================================== */
import { qcNewState, qcApply, mulberry32, qcQubitRho, qcRhoFidelity, qcExpect, qcFrToggle, qcFrGate } from './qcircuit.js';
import { shorDecode, shorEncodeGates, shorDecodeGates, SHOR_STABS } from './shor.js';
import { gnTouched, gnPauli, gnSampleError } from './gatenoise.js';

export const FS_DEFAULTS = {
  kind: 'std',
  p: 0.01,                    /* 每门每比特 Pauli 错误概率（R80 口径） */
  spectrum: 'depolar',        /* depolar | x | z */
  /* 参考态 Ry(θ)Rz(φ)|0⟩：**故意取通用态**（θ=0.9, φ=1.3）——|+i⟩ 上
     ⟨X_L⟩=⟨Z_L⟩=0，逻辑判据退化（R79 pot79 C2 的教训）。这里三个分量都非零。 */
  theta: 0.9, phi: 1.3,
  trials: 400, seed: 7,
  /* ---- R82 多轮提取 ---- */
  rounds: 1,                      /* 综合征提取轮数 R（1 = R81 的单轮口径） */
  /* R83：不可信读数的处理。0 = 跳过该轮（R82 口径，代价是丢弃率被高估）；
     k>0 = 每个稳定子最多再**重测** k 次，取第一个「可用」的读数
     （dup 两份一致 / 猫态验证位为 0）。重测是**条件性**的：一旦取得可用读数，
     后续尝试的门在运行时被真正跳过（不作用到态矢、不注入故障），
     所以 retry=0 与 R82 逐位等价，retry>0 只在真的失败时才多花门。 */
  decode: 'single',               /* 跨轮解码：single 只修最后一轮 · immediate 每轮都修 · repeat 连续 need 轮一致才修 */
  need: 2,                        /* agree 需要连续多少轮综合征一致才接受 */
  /* 噪声范围：'extract'（默认）只给综合提取段挂故障——编码/解码按理想处理，
     与 R79 的口径一致（R79 也是「编码后注错、解码前纠错」）。这样做是为了让对照
     只看提取线路本身；'all' 把 encode/extract/decode 全挂上，会看到编码器自己的
     单故障就有 18% 走成静默逻辑错误（它是所有四种线路的共同下限，不是对照对象）。 */
  noisyPhase: 'extract',
  /* ---- R83 重测 ---- */
  retry: 0,                       /* 每个稳定子最多再重测几次（0 = R82 的跳过口径） */
  /* ---- R84 循环 EC + 逻辑线路 ---- */
  cycles: 1,                      /* EC 周期数 T（T>1 时周期之间插逻辑门） */
  logic: 'none',                  /* 周期之间的逻辑操作：none / idle / xl / zl（横向 Pauli） */
  /* 在**最后一个周期之后**再插一次逻辑门（后面没有 EC）。只用于对照实验：
     「同一个门、门后有没有 EC」的差别就是 EC 对门错误的拦截能力。 */
  trailingLogic: false,
  noisyLogic: false,              /* 逻辑门段是否也注错（默认只在提取段注错） */
};

/* 比特布局：0..8 数据 · 9.. = A0..（ancilla 池）· 池后一位 = F（验证/flag）
   池大小 = max(2, catX)：dup 要 2 个、猫态 Z 类要 2 个、猫态 X 类要 catX 个。 */
const A0 = 9;
function layoutFor(spec){
  const zNeed = spec.z === 'single' ? 1 : 2;                       /* single 1 · dup/cat 2（权重 2 稳定子 1:1） */
  const xNeed = spec.x === 'single' ? 1 : spec.x === 'dup' ? 2 : Math.max(2, Math.min(6, spec.catX || 3));
  const pool = Math.max(zNeed, xNeed);
  const hasF = spec.z === 'cat' || spec.x === 'cat';               /* 只有猫态需要验证位 */
  const F = hasF ? A0 + pool : -1;
  const nq = A0 + pool + (hasF ? 1 : 0);
  return { A0, pool, F, nq, hasF };
}
const FS_DATA_MASK = 0x1ff;
/* 逻辑算符（**R81 修正过的标签**：内层是相位翻转码，X₀X₁X₂ 作用为 Z_L；
   Z₀Z₃Z₆ 才是 X_L。R79 源码/README 里两者对调了，见 shor.js 的留档） */
const LXL = { x: 0, z: 0b001001001 };            /* X_L = Z₀Z₃Z₆ */
const LZL = { x: 0b000000111, z: 0 };            /* Z_L = X₀X₁X₂ */
const LYL = { x: 0b000000111, z: 0b001001001 };  /* Y_L = X_L·Z_L */

export const FS_KINDS = {
  std: { label: '标准提取', short: 'std', z: 'single', x: 'single',
    desc: '两类稳定子都用一个 ancilla 顺序提取（R79 的做法）。X 类提取里 ancilla 的 X 错误顺着剩下的 CNOT 传播到多个数据比特，而且对读数**不可见**（X|+⟩=|+⟩）⟹ 静默逻辑错误。' },
  dup: { label: '冗余验证', short: 'dup', z: 'dup', x: 'dup',
    desc: '每个稳定子用两个独立 ancilla 各测一遍，读数不一致 ⟹ flag ⟹ 丢弃本轮。Z 类有效；X 类**完全无效**——ancilla 的 X 错误对两份读数都不可见，两份读数一样地"正确"。' },
  cat: { label: '猫态 ×3', short: 'cat', z: 'cat', x: 'cat', catX: 3,
    desc: '权重 w 的稳定子用 GHZ ancilla（Z 类 2 个 1:1；X 类 3 个、每个碰 2 个数据比特），GHZ 的 Z 奇偶由验证序列搬到 flag：单 X 错误必然把偶奇偶翻成奇 ⟹ 确定性检出。' },
  full: { label: '冗余 + 猫态', short: 'full', z: 'dup', x: 'cat', catX: 3,
    desc: 'Z 类用冗余比对（猫态在 Z 类抓不到交互期的 X 错误），X 类用猫态（限定传播 + 可检）。分工由故障画像决定。' },
};

/* ---------- 小工具 ---------- */
function fsPopc(v){ let c = 0; while (v){ c += v & 1; v >>>= 1; } return c; }
function parityOf(v){ let c = 0; while (v){ c ^= v & 1; v >>>= 1; } return c; }
function maskOf(qs){ let m = 0; for (const q of qs) m |= 1 << q; return m; }

/* ---------- Pauli 期望（P 由 x/z 掩码给，支持 Y） ----------
   已提取为 qcircuit.js 的 qcExpect（R86 共享单源：qec.js/shor.js 的门噪声
   判定也要用），此处经导入使用。 */

function fsExpect(s, xm, zm){ return qcExpect(s, xm, zm); }

/* ---------- Pauli 帧（辛表示），只跟踪错误、忽略相位 ----------
   已提取为 qcircuit.js 的 qcFrToggle/qcFrGate（R86 共享单源：qec.js 的门噪声
   判定也要用），此处经导入使用。规则：
   CNOT(c,t)：X_c → X_c X_t（前向）；Z_t → Z_c Z_t（后向）；X_t、Z_c 不动。
   H(q)：X_q ↔ Z_q。测量+重置：帧的 X_q 翻转 Z 读数，重置把该比特帧清空。 */
function frToggle(fr, q, t){ return qcFrToggle(fr, q, t); }
function frGate(fr, o){ return qcFrGate(fr, o); }

/* ---------- 测量（确定性优先，真随机时计数） ---------- */
function normInPlace(s){
  let n = 0;
  for (let i = 0; i < s.dim; i++) n += s.re[i] * s.re[i] + s.im[i] * s.im[i];
  if (n > 0){ const r = 1 / Math.sqrt(n); for (let i = 0; i < s.dim; i++){ s.re[i] *= r; s.im[i] *= r; } }
}
function fsMeasureZ(s, q, rng, diag){
  const bit = 1 << q;
  let p1 = 0;
  for (let i = 0; i < s.dim; i++) if (i & bit) p1 += s.re[i] * s.re[i] + s.im[i] * s.im[i];
  let out;
  if (p1 < 1e-9) out = 0;
  else if (p1 > 1 - 1e-9) out = 1;
  else {
    /* 真随机：猫态的**单个** ancilla 读数就是随机的（只有奇偶确定）；
       这里照实抽样，并在 diag 里计数（pot81 用它检查「同故障换种子分类不变」）。 */
    if (diag) diag.random++;
    out = rng ? (rng() < p1 ? 1 : 0) : (p1 > 0.5 ? 1 : 0);
  }
  for (let i = 0; i < s.dim; i++){
    const has = (i & bit) ? 1 : 0;
    if (has !== out){ s.re[i] = 0; s.im[i] = 0; }
  }
  normInPlace(s);
  return out;
}

/* ============================================================================
 * 线路构建
 * ========================================================================== */
/* ============================================================================
 * 单个稳定子的提取块（R82 的多轮线路复用同一份，保证「单轮 ≡ R82 的 r=1」）
 *   返回带 ph/stab/round 的完整 op 数组；调用方只需依次 push。
 * ========================================================================== */
export function fsBlockOps(stabIndex, spec, lay, round = 0, att = 0){
  const st = SHOR_STABS[stabIndex];
  const A0 = lay.A0, F = lay.F;
  const out = [];
  const add = (o) => { out.push({ ...o, ph: 'extract', stab: stabIndex, round, att }); return out.length - 1; };
  if (st.k === 'z'){
    const [d0, d1] = st.qs;
    if (spec.z === 'single'){
      add({ op: 'cnot', c: d0, q2: A0 });
      add({ op: 'cnot', c: d1, q2: A0 });
      add({ op: 'meas', q: A0, role: 'syn', stab: stabIndex });
    } else if (spec.z === 'dup'){
      add({ op: 'cnot', c: d0, q2: A0 });
      add({ op: 'cnot', c: d1, q2: A0 });
      add({ op: 'meas', q: A0, role: 'syn', stab: stabIndex });
      add({ op: 'cnot', c: d0, q2: A0 + 1 });
      add({ op: 'cnot', c: d1, q2: A0 + 1 });
      add({ op: 'meas', q: A0 + 1, role: 'syn2', stab: stabIndex });
    } else {   /* cat：2 个 ancilla 的 GHZ，每只碰 1 个数据比特 */
      add({ op: 'h', q: A0 });
      add({ op: 'cnot', c: A0, q2: A0 + 1 });
      add({ op: 'cnot', c: A0, q2: F });
      add({ op: 'cnot', c: A0 + 1, q2: F });
      add({ op: 'meas', q: F, role: 'flag', stab: stabIndex });
      add({ op: 'cnot', c: d0, q2: A0 });
      add({ op: 'cnot', c: d1, q2: A0 + 1 });
      add({ op: 'meas', q: A0, role: 'cat', stab: stabIndex });
      add({ op: 'meas', q: A0 + 1, role: 'cat', stab: stabIndex });
    }
  } else if (spec.x === 'single'){
    add({ op: 'h', q: A0 });
    for (const q of st.qs) add({ op: 'cnot', c: A0, q2: q });
    add({ op: 'h', q: A0 });
    add({ op: 'meas', q: A0, role: 'syn', stab: stabIndex });
  } else if (spec.x === 'dup'){
    add({ op: 'h', q: A0 });
    for (const q of st.qs) add({ op: 'cnot', c: A0, q2: q });
    add({ op: 'h', q: A0 });
    add({ op: 'meas', q: A0, role: 'syn', stab: stabIndex });
    add({ op: 'h', q: A0 + 1 });
    for (const q of st.qs) add({ op: 'cnot', c: A0 + 1, q2: q });
    add({ op: 'h', q: A0 + 1 });
    add({ op: 'meas', q: A0 + 1, role: 'syn2', stab: stabIndex });
  } else {
    /* X 类猫态：nc 个 ancilla 的 GHZ，数据比特按 j → floor(j·nc/6) 分配给 ancilla。
       nc=6 ⟹ 1:1（单故障最多污染 1 个）；nc=3 ⟹ 1:2（最多 2 个，但态矢小 8 倍）。 */
    const nc = Math.max(2, Math.min(6, spec.catX || 3));
    add({ op: 'h', q: A0 });
    for (let k = 1; k < nc; k++) add({ op: 'cnot', c: A0 + k - 1, q2: A0 + k });
    /* ⚠ 只用「相邻两两异或」，不要用「全加求和」：求和只抓得住**奇数个** X 错误
       （偶数个 X 的奇偶不变 ⟹ 逃逸，pot81 实测 nc=6 求和版留 2 个静默逻辑位点）；
       两两异或对任意单个 X 错误都翻转某一对 ⟹ 确定性检出（nc=2 时两者等价）。 */
    for (let k = 1; k < nc; k++){
      add({ op: 'cnot', c: A0 + k - 1, q2: F });
      add({ op: 'cnot', c: A0 + k, q2: F });
      add({ op: 'meas', q: F, role: 'flag', stab: stabIndex });
    }
    for (let j = 0; j < 6; j++) add({ op: 'cnot', c: A0 + Math.floor(j * nc / 6), q2: st.qs[j] });
    for (let k = 0; k < nc; k++) add({ op: 'h', q: A0 + k });
    for (let k = 0; k < nc; k++) add({ op: 'meas', q: A0 + k, role: 'cat', stab: stabIndex });
  }
  return out;
}

export function fsBuildCircuit(kind = 'std', cfg = {}){
  const base = FS_KINDS[kind] || FS_KINDS.std;
  const c = { ...FS_DEFAULTS, ...cfg };
  /* cfg.catX 允许覆盖（pot81 用 nc=6 的 1:1 版本验证传播上界 1；页面用 nc=3 省钱） */
  const spec = c.catX ? { ...base, catX: c.catX } : base;
  const lay = layoutFor(spec);
  const F = lay.F;
  const ops = [];
  const push = (o) => { ops.push(o); return ops.length - 1; };
  const blocks = [];

  /* ① 逻辑初态（理想） */
  push({ op: 'ry', q: 0, theta: c.theta, ph: 'prep' });
  push({ op: 'rz', q: 0, theta: c.phi, ph: 'prep' });
  /* ② 编码 */
  for (const g of shorEncodeGates()) push({ ...g, ph: 'encode' });

  /* ③ 综合提取：T 个 EC 周期 × 每周期 R 轮（T=1,R=1 即 R81 的单轮口径，逐位一致） */
  const R = Math.max(1, Math.min(8, c.rounds | 0 || 1));
  const RT = Math.max(0, Math.min(3, c.retry | 0 || 0));   /* 每个稳定子的额外重测次数 */
  const T = Math.max(1, Math.min(6, c.cycles | 0 || 1));
  const LOGIC = ['none', 'idle', 'xl', 'zl'].includes(c.logic) ? c.logic : 'none';
  /* 横向逻辑门（都对数据比特逐个施加 Pauli，不传播错误）：
       X_L = Z₀Z₃Z₆（R81 数值裁决的标签）· Z_L = X₀X₁X₂
       idle = 每个数据比特一个恒等门（只为产生「空闲也是错误机会」的 R80 口径） */
  const logicOpsOf = (k) => {
    if (k === 'idle') return Array.from({ length: 9 }, (_, q) => ({ op: 'id', q }));
    if (k === 'xl') return [{ op: 'z', q: 0 }, { op: 'z', q: 3 }, { op: 'z', q: 6 }];
    if (k === 'zl') return [{ op: 'x', q: 0 }, { op: 'x', q: 1 }, { op: 'x', q: 2 }];
    return [];
  };
  const logicSeq = [];
  let logicGates = 0, unlogicGates = 0;
  for (let t = 0; t < T; t++){
    if (t > 0 && LOGIC !== 'none'){
      const gl = logicOpsOf(LOGIC);
      logicSeq.push(gl);
      for (const g of gl){ push({ ...g, ph: 'logic', cycle: t }); logicGates++; }
    }
    for (let r = 0; r < R; r++){
      /* 扁平轮索引：跨周期的一致性判断天然连续（循环 EC 正是这个语义） */
      const rr = t * R + r;
      for (let i = 0; i < SHOR_STABS.length; i++){
        for (let a = 0; a <= RT; a++){
          const blkOps = fsBlockOps(i, spec, lay, rr, a);
          const blk = { stab: i, kind: SHOR_STABS[i].k, short: SHOR_STABS[i].short,
            label: SHOR_STABS[i].label, gates: 0, ops: [], round: rr, cycle: t, att: a };
          for (const o of blkOps){
            const idx = push(o);
            blk.ops.push(idx);
            if (o.op !== 'meas') blk.gates++;
          }
          blocks.push(blk);
        }
      }
      /* 轮末修正点：跨轮联合解码在这里决定是否把该轮的修正落到态矢与 Pauli 帧上。
         ⚠ 早期版本只在所有轮跑完后修正一次 ⟹ 错误跨轮累积而修正能力不变，
         实测 P_L 随轮数**上升**（R=3 是 R=1 的 19×）。真实协议必须每轮清账。 */
      push({ op: 'fixr', ph: 'extract', round: rr, cycle: t });
    }
  }
  /* 末尾逻辑门（对照实验用）：后面没有 EC，门的错误直接进解码 */
  if (c.trailingLogic && LOGIC !== 'none'){
    const gl = logicOpsOf(LOGIC);
    logicSeq.push(gl);
    for (const g of gl){ push({ ...g, ph: 'logicTail', cycle: T }); logicGates++; }
  }
  /* ⚠ 不做「撤销逻辑门」。首版在探针前把逻辑门按逆序撤掉（Pauli 自逆），
     结果是错的：撤销发生在**最后一个 EC 之后**，而 EC 会看到「门 + 注入错误」的合成
     Pauli 并把它当 Y 错误纠掉（Y₀ 与两类稳定子都反对易），撤销再把 Z₀ 加回来 ⟹
     末端留下权重 1 的 Z 错误、无人可纠（pot84 首轮实测：门上位点救回率 22%，
     与「门后无 EC」完全相同，正是「EC 的工作被撤销抵消」的指纹）。
     正确口径：**逻辑门留在末态，参考态也含同一个门**（fsRef 走同一条线路），
     保真度改用 |⟨ref|ψ⟩|²。逻辑算符 ∈ N(S) ⟹ EC 本来就看不见它，不会误纠。 */

  /* ④ 修正点（运行期按综合征查表插入，不带噪声） */
  push({ op: 'fix', ph: 'correct' });
  /* ⑤ 解码 */
  for (const g of shorDecodeGates()) push({ ...g, ph: 'decode' });

  let gates = 0, cnots = 0, singles = 0, meas = 0;
  for (const o of ops){
    if (o.op === 'meas'){ meas++; continue; }
    /* fix（探针点）与 fixr（轮末修正点）都不是门，不计入门数——R81 的开销数字必须逐位不变 */
    if (o.op === 'fix' || o.op === 'fixr') continue;
    gates++;
    if (o.op === 'cnot') cnots++; else singles++;
  }
  return { kind, nq: lay.nq, spec: { ...spec, lay }, cfg: c, ops, blocks,
    rounds: R, stats: {
      nq: lay.nq, data: 9, ancillas: lay.nq - 9, gates, cnots, singles, meas,
      rounds: R, retry: RT, cycles: T, logic: LOGIC, logicGates, trailingLogic: !!c.trailingLogic,
      sitesPerRound: blocks.length ? blocks.filter(b => b.round === 0 && b.att === 0).length : 0,
    } };
}

const fsCIRC_CACHE = new Map();
export function fsCircuit(kind = 'std', cfg = {}){
  const c = { ...FS_DEFAULTS, ...cfg };
  /* ⚠ noisyLogic 必须进缓存键：fsExec 的注错范围回退读 circ.cfg.noisyLogic，
     漏了它 ⟹ 「注错/理想」切换拿到的是另一档的缓存线路（MC 完全不变，页面开关假死）。 */
  const key = `${kind}|${c.theta}|${c.phi}|${c.catX || (FS_KINDS[kind] || {}).catX || 0}|R${c.rounds | 0 || 1}|${c.decode || 'single'}|${c.need | 0 || 2}|rt${c.retry | 0 || 0}|c${c.cycles | 0 || 1}|${c.logic || 'none'}|t${c.trailingLogic ? 1 : 0}|nl${c.noisyLogic ? 1 : 0}`;
  let circ = fsCIRC_CACHE.get(key);
  if (!circ){ circ = fsBuildCircuit(kind, c); fsCIRC_CACHE.set(key, circ); }
  return circ;
}

/* 单故障位点：每个门的每个触及比特 × 3 个 Pauli（prep 段不计） */
export function fsFaultSites(circ){
  const stabOf = new Map();
  for (const b of circ.blocks) for (const idx of b.ops) stabOf.set(idx, b.stab);
  const out = [];
  for (let i = 0; i < circ.ops.length; i++){
    const o = circ.ops[i];
    /* fixr = 轮末修正点（R82）：不是门，不产生故障位点。早先漏跳它 ⟹ gnTouched 的
       fallback 返回 [undefined]，凭空多出 3 个 q=undefined 的位点（R=1 变 159 而非 156）。 */
    if (o.op === 'meas' || o.op === 'fix' || o.op === 'fixr' || o.ph === 'prep') continue;
    /* unlogic 是判定口径里的「撤销」，不是线路的一部分：不产生故障位点 */
    if (o.ph === 'unlogic') continue;
    for (const q of gnTouched(o)) for (const t of ['x', 'y', 'z']){
      out.push({ gate: i, q, t, ph: o.ph, gop: o.op, stab: stabOf.has(i) ? stabOf.get(i) : -1,
        round: o.round || 0 });
    }
  }
  return out;
}

/* ---------- 解码后的陪集（覆盖**全部阶段**，含解码段自身的故障） ----------
   探针取样点在「修正后、解码前」：解码段里发生的故障在那个时刻还没发生，探针看不见
   （pot81 C2 抓出 27 个「探针说 perfect 但 F<1」的位点，全是解码段）。
   修法：把残差帧按解码线路的共轭映射过去（S → S_dec、X_L → X₀ …），在解码后的
   基底里判陪集——对任何阶段的故障都成立，且与探针在「修正前已发生」的位点上必须一致
   （两条独立路径的交叉校验，见 fsFirstOrder 的 disagree）。 */
const DEC_CACHE = new Map();
function decodeMaps(circ){
  const key = `${circ.kind}|${circ.cfg.theta}|${circ.cfg.phi}|${circ.nq}`;
  let m = DEC_CACHE.get(key);
  if (m) return m;
  const ops = circ.ops.filter(o => o.ph === 'decode');
  const img = v => {
    const fr = { x: v.x, z: v.z };
    for (const o of ops) frGate(fr, o);
    return { x: fr.x & FS_DATA_MASK, z: fr.z & FS_DATA_MASK };
  };
  const gens = SHOR_STABS.map(g => ({ x: g.k === 'x' ? maskOf(g.qs) : 0, z: g.k === 'z' ? maskOf(g.qs) : 0 }));
  const span = new Set();
  for (let mask = 0; mask < 256; mask++){
    let x = 0, z = 0;
    for (let b = 0; b < 8; b++) if (mask & (1 << b)){ x ^= gens[b].x; z ^= gens[b].z; }
    const v = img({ x, z });
    span.add(v.x * 512 + v.z);
  }
  m = { span, XL: img(LXL), ZL: img(LZL), YL: img(LYL) };
  DEC_CACHE.set(key, m);
  return m;
}
function cosetDecoded(m, v){
  if (!v.x && !v.z) return 0;
  if (m.span.has(v.x * 512 + v.z)) return 0;
  if (m.span.has((v.x ^ m.XL.x) * 512 + (v.z ^ m.XL.z))) return 1;
  if (m.span.has((v.x ^ m.ZL.x) * 512 + (v.z ^ m.ZL.z))) return 2;
  if (m.span.has((v.x ^ m.YL.x) * 512 + (v.z ^ m.YL.z))) return 3;
  return -1;
}

/* ============================================================================
 * 执行一次
 * ========================================================================== */
function fsExec(circ, opts = {}){
  const { ops, nq, cfg } = circ;
  const c = { ...cfg, ...(opts.cfg || {}) };
  const faults = opts.faults || null;
  const rng = opts.rng || null;
  const p = opts.p != null ? opts.p : 0;
  const spectrum = opts.spectrum || 'depolar';
  const noisyAll = (opts.noisyPhase || c.noisyPhase || 'extract') === 'all';
  const noisyLogic = opts.noisyLogic != null ? !!opts.noisyLogic : !!c.noisyLogic;
  const diag = { random: 0, frameFlip: 0, frameMiss: 0 };
  const s = qcNewState(nq);
  const fr = { x: 0, z: 0 };
  const R = (circ.stats && circ.stats.rounds ? circ.stats.rounds * (circ.stats.cycles || 1) : (circ.rounds || 1));
  const RT = (circ.stats && circ.stats.retry) || 0;
  const syn = new Array(SHOR_STABS.length).fill(0);        /* 最终用于解码的综合征 */
  const syn2 = new Array(SHOR_STABS.length).fill(0);
  const flags = [];
  const fired = [];
  /* R82：按轮记录（synRounds[r][stab] / flagRounds[r]），跨轮解码在 fix 点做 */
  const synRounds = Array.from({ length: R }, () => new Array(SHOR_STABS.length).fill(0));
  const syn2Rounds = Array.from({ length: R }, () => new Array(SHOR_STABS.length).fill(0));
  const flagRounds = new Array(R).fill(false);
  /* R83 重测：按 (轮, 尝试) 记录；chosenAtt[r][stab] = 采用的尝试号（-1 = 全部不可用）。
     被跳过的尝试的门**不执行、不注入故障**（条件性重测，不是白跑）。 */
  const synAtt = Array.from({ length: R }, () => Array.from({ length: RT + 1 }, () => new Array(SHOR_STABS.length).fill(0)));
  const syn2Att = Array.from({ length: R }, () => Array.from({ length: RT + 1 }, () => new Array(SHOR_STABS.length).fill(0)));
  const flagAtt = Array.from({ length: R }, () => Array.from({ length: RT + 1 }, () => new Array(SHOR_STABS.length).fill(false)));
  const chosenAtt = Array.from({ length: R }, () => new Array(SHOR_STABS.length).fill(-1));
  const endOfBlock = new Map();
  for (const b of (circ.blocks || [])) if (b.ops.length) endOfBlock.set(b.ops[b.ops.length - 1], b);
  let skippedGates = 0, retried = 0;
  /* 逻辑门在帧里的累积（只含数据比特）。帧判定的对象是「相对理想线路的残差」，
     所以探针点必须把逻辑门这一项扣掉——否则 X_L 本身就会被当成残差
     （pot84 实测：不扣时 disagree=467、perfect=0，因为每个位点的 coset 都被门污染）。
     探针路径不需要这一步：它拿 ref（同一条线路、含同一个门）做比较，天然抵消。 */
  const logicFr = { x: 0, z: 0 };
  let fix = [];
  let wPre = 0, pre = null, frAtFix = { x: 0, z: 0 }, frBeforeFix = { x: 0, z: 0 };
  /* R82 跨轮解码的结果（在 fix 点填，块外可见） */
  let usableR = [], dec = opts.decode || c.decode || 'single', chosen = -1, unsure = false,
      usedRounds = 1, synFinal = null;
  let prevSyn = null, run = 0;
  const need = Math.max(1, Math.min(R, opts.need || c.need || 2));
  const fixLog = [];
  /* 只有真的用 dup 的稳定子类型才有「第二份读数」，否则 syn2 恒 0 会被误判成 flag */
  const dupZ = circ.spec.z === 'dup', dupX = circ.spec.x === 'dup';

  const forced = new Map();
  if (faults) for (const f of faults){
    if (!forced.has(f.gate)) forced.set(f.gate, []);
    forced.get(f.gate).push(f);
  }
  const inject = (q, t, gate) => {
    gnPauli(s, q, t);
    frToggle(fr, q, t);
    fired.push({ gate, q, t, ph: ops[gate] ? ops[gate].ph : '?' });
  };

  for (let i = 0; i < ops.length; i++){
    const o = ops[i];
    /* 条件性重测：该稳定子已取得可用读数 ⟹ 后续尝试的门整体跳过（不执行、不注错） */
    if (o.ph === 'extract' && o.stab >= 0){
      const rr = o.round || 0, aa = o.att || 0;
      if (chosenAtt[rr][o.stab] >= 0 && aa > chosenAtt[rr][o.stab]){ skippedGates++; continue; }
    }
    if (o.op === 'meas'){
      const bit = fsMeasureZ(s, o.q, rng, diag);
      if ((fr.x >> o.q) & 1 && (o.role === 'syn' || o.role === 'flag')) diag.frameFlip++;
      fr.x &= ~(1 << o.q); fr.z &= ~(1 << o.q);
      if (bit) qcApply(s, { op: 'x', q: o.q });   /* 重置 → |0⟩（理想重置） */
      const r = o.round || 0, a = o.att || 0;
      if (o.role === 'syn'){ syn[o.stab] = bit; synRounds[r][o.stab] = bit; synAtt[r][a][o.stab] = bit; }
      else if (o.role === 'syn2'){ syn2[o.stab] = bit; syn2Rounds[r][o.stab] = bit; syn2Att[r][a][o.stab] = bit; }
      else if (o.role === 'cat'){ syn[o.stab] ^= bit; synRounds[r][o.stab] ^= bit; synAtt[r][a][o.stab] ^= bit; }
      else { if (bit){ flags.push(true); flagRounds[r] = true; flagAtt[r][a][o.stab] = true; } }
      /* 块末：判定这次尝试是否可用，可用即采纳（后续尝试随后会被跳过） */
      const blkE = endOfBlock.get(i);
      if (blkE && chosenAtt[blkE.round][blkE.stab] < 0){
        const g = SHOR_STABS[blkE.stab];
        const isDup = (g.k === 'z' && dupZ) || (g.k === 'x' && dupX);
        const isCat = g.k === 'z' ? circ.spec.z === 'cat' : circ.spec.x === 'cat';
        let ok = true;
        if (isDup) ok = synAtt[blkE.round][blkE.att][blkE.stab] === syn2Att[blkE.round][blkE.att][blkE.stab];
        if (isCat && flagAtt[blkE.round][blkE.att][blkE.stab]) ok = false;
        if (ok){ chosenAtt[blkE.round][blkE.stab] = blkE.att; if (blkE.att > 0) retried++; }
      }
      continue;
    }
    if (o.op === 'fixr'){
      /* ---- 跨轮联合解码（R82）----
         可用轮：dup 两份读数不一致、或猫态验证位为 1 ⟹ 该轮不可信。
         single    = 只在最后一轮修正一次（R81 口径；其余轮白测，只增加故障机会）
         immediate = 每轮都按该轮综合征直接修正（假综合征 ⟹ 误修，引入新错误）
         repeat    = 连续 need 轮综合征完全相同才修正（真错误会持续显示，
                     一次性的假综合征不会）⟹ 既不累积也不误修
         修正在这里落到态矢 + 帧上（修正门本身按理想处理，不注入故障） */
      const r = o.round || 0;
      /* 该轮是否可用 = 每个稳定子都取得了可信读数（重测后仍不可信 ⟹ 该轮不可用）。
         retry=0 时与 R82 的「flagRounds || dup 不一致」逐位等价。 */
      let bad = false;
      for (let i = 0; i < SHOR_STABS.length; i++) if (chosenAtt[r][i] < 0){ bad = true; break; }
      usableR.push(!bad);
      if (r === 0){ frBeforeFix = { x: fr.x & FS_DATA_MASK, z: fr.z & FS_DATA_MASK }; wPre = fsMinWeight(frBeforeFix); }
      let fixR = [];
      if (dec === 'single'){
        if (r === R - 1) fixR = shorDecode(synRounds[r]);
      } else if (dec === 'immediate'){
        if (!bad) fixR = shorDecode(synRounds[r]);
      } else {   /* repeat */
        const sR = synRounds[r];
        /* 不可信的轮**完全不参与**一致性判断（既不能促成也不能打断连续段）——
           早先让 bad 轮把 run 重置为 1 并把它自己的（不可信）综合征当基准，是错的。 */
        if (bad){ prevSyn = null; run = 0; }
        else if (prevSyn && sR.join('') === prevSyn.join('')) run++;
        else { run = 1; prevSyn = sR.slice(); }
        if (!bad && run >= need){
          fixR = shorDecode(sR);
          prevSyn = null; run = 0;
        }
      }
      for (const e of fixR){ qcApply(s, { op: e.t, q: e.q }); frToggle(fr, e.q, e.t); }
      fixLog.push({ round: r, syn: synRounds[r].slice(), usable: !bad, fix: fixR.slice() });
      continue;
    }
    if (o.op === 'fix'){
      /* 探针取样点：所有轮修正已完成、解码之前（码空间仍完好定义） */
      fix = [];   /* 修正已在每轮末 fixr 做过；这里只取探针 */
      /* 扣掉逻辑门在帧里的贡献：之后的帧 = 「相对理想线路的残差」 */
      fr.x ^= logicFr.x; fr.z ^= logicFr.z;

      for (const e of fix){ qcApply(s, { op: e.t, q: e.q }); frToggle(fr, e.q, e.t); }
      frAtFix = { x: fr.x & FS_DATA_MASK, z: fr.z & FS_DATA_MASK };
      /* 修正后、解码前的末态探针（判定口径的取样点：此时码空间仍完好定义） */
      const synErr = [];
      let mixed = false;
      for (const g of SHOR_STABS){
        const xm = g.k === 'x' ? maskOf(g.qs) : 0;
        const zm = g.k === 'z' ? maskOf(g.qs) : 0;
        const e = fsExpect(s, xm, zm);
        if (e < -0.5) synErr.push(1);
        else if (e > 0.5) synErr.push(0);
        else { synErr.push(-1); mixed = true; }
      }
      pre = {
        synErr, mixed,
        XL: fsExpect(s, LXL.x, LXL.z),
        ZL: fsExpect(s, LZL.x, LZL.z),
        YL: fsExpect(s, LYL.x, LYL.z),
      };
      continue;
    }
    /* id 门只为产生错误机会（R80 的 idle 口径），态矢上没有操作 */
    if (o.op !== 'id'){ qcApply(s, o); frGate(fr, o); }
    if ((o.ph === 'logic' || o.ph === 'logicTail') && o.op !== 'id'){
      if (o.op === 'x') logicFr.x ^= 1 << o.q;
      else if (o.op === 'z') logicFr.z ^= 1 << o.q;
      else if (o.op === 'y'){ logicFr.x ^= 1 << o.q; logicFr.z ^= 1 << o.q; }
    }
    if (faults){
      const list = forced.get(i);
      if (list) for (const f of list) inject(f.q, f.t, i);
    } else if (rng && p > 0 && o.ph !== 'prep' && o.ph !== 'unlogic' &&
      (noisyAll || o.ph === 'extract' || (noisyLogic && (o.ph === 'logic' || o.ph === 'logicTail')))){
      for (const q of gnTouched(o)){
        const t = gnSampleError(spectrum, p, rng);
        if (t) inject(q, t, i);
      }
    }
  }

  const th = cfg.theta / 2, ph = cfg.phi;
  const alpha = [Math.cos(th), 0];
  const beta = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph)];
  const F = qcRhoFidelity(qcQubitRho(s, 0), alpha, beta);
  /* dup 的 flag = 两份读数不一致（不是测量位，是比对结果） */
  const dupFlag = SHOR_STABS.map((g, i) => {
    if (g.k === 'z' && !dupZ) return false;
    if (g.k === 'x' && !dupX) return false;
    return syn[i] !== syn2[i];
  });
  const anyFlag = flags.some(Boolean) || dupFlag.some(Boolean);
  return {
    syn, syn2, dupFlag, flags, fix, state: s, F, pre,
    frame: { x: fr.x & FS_DATA_MASK, z: fr.z & FS_DATA_MASK },
    /* wPre：提取结束、修正之前的错误权重（「一个故障污染了几个数据比特」）
       wRes：修正之后、解码之前的残差权重（码该处理的东西）
       wPost：解码之后的帧权重 —— 只作诊断：解码线路会把权重 1 摊回 3~5，
               拿它当「残差大小」会严重误导（这是个容易踩的坑，留字段备查） */
    cosetFinal: cosetDecoded(decodeMaps(circ), { x: fr.x & FS_DATA_MASK, z: fr.z & FS_DATA_MASK }),
    synRounds, flagRounds, usableRounds: usableR.filter(Boolean).length, usableR, fixLog,
    chosenAtt, skippedGates, retried,
    /* 「重测后仍无可信读数」的轮：这才是真正需要丢弃的比例（R82 的丢弃率把它高估了） */
    noGoodRounds: usableR.filter(v => !v).length,
    synFinal, chosenRound: chosen, unsure, usedRounds, decode: dec, rounds: R, need,
    wPre, wRes: fsMinWeight(frAtFix),
    wPost: fsPopc((fr.x | fr.z) & FS_DATA_MASK),
    frAtFix, frBeforeFix,
    fired, diag, flagged: anyFlag,
  };
}

/* ---------- 分类：末态探针 + 参考态 → 陪集 ---------- */
function fsSignOf(v, ref){
  if (Math.abs(ref) < 0.2) return 0;      /* 该分量在参考态上不可观测 */
  return (v * ref >= 0) ? 1 : -1;
}
export function fsClass(pre, ref, F){
  if (!pre || pre.mixed) return { coset: -2, cls: 'mixed' };
  /* 残差 ∉ N(S)（有稳定子期望为 −1）分两种：F=1 说明**只有规范比特**出错、
     逻辑比特完好（码空间的「位置」偏了但 q0 仍是目标纯态）；F<1 才是逻辑信息受损。
     这一区分很重要：单轮里大量「outside」其实是前者（本轮输出正确，下一轮才需要处理）。 */
  if (pre.synErr.some(b => b === 1)){
    const f = F == null ? 0 : F;
    return { coset: -1, cls: f > 1 - 1e-9 ? 'gauge' : 'outside' };
  }
  const sX = fsSignOf(pre.XL, ref.XL);
  const sZ = fsSignOf(pre.ZL, ref.ZL);
  const sY = fsSignOf(pre.YL, ref.YL);
  let coset = 0;
  if (sZ === -1 && sY === -1 && sX === 1) coset = 1;        /* X_L */
  else if (sX === -1 && sY === -1 && sZ === 1) coset = 2;   /* Z_L */
  else if (sX === -1 && sZ === -1 && sY === 1) coset = 3;   /* Y_L */
  else if (sX === -1 || sZ === -1 || sY === -1) coset = 1;  /* 兜底（不该走到） */
  return { coset, cls: coset === 0 ? 'perfect' : 'logic', sX, sY, sZ };
}

const fsREF_CACHE = new Map();
export function fsRef(circ){
  const key = `${circ.kind}|${circ.cfg.theta}|${circ.cfg.phi}|${circ.nq}|` +
    `${circ.stats ? circ.stats.logic : 'none'}|${circ.stats ? (circ.stats.cycles || 1) : 1}|` +
    `${circ.stats && circ.stats.trailingLogic ? 1 : 0}`;
  let r = fsREF_CACHE.get(key);
  if (!r){
    const run = fsExec(circ, { faults: [] });
    r = { XL: run.pre.XL, ZL: run.pre.ZL, YL: run.pre.YL, F: run.F, mixed: run.pre.mixed,
          synErr: run.pre.synErr.slice(),
          /* 理想末态：含逻辑门时保真度必须用它算 |⟨ref|ψ⟩|²——
             逻辑门把态翻到 |1_L⟩，用 |0_L⟩ 的解析参数会得到 F≈0（这是个陷阱）。 */
          state: { n: run.state.n, dim: run.state.dim,
            re: Float64Array.from(run.state.re), im: Float64Array.from(run.state.im) } };
    fsREF_CACHE.set(key, r);
  }
  return r;
}

/* |⟨a|b⟩|²（纯态保真度） */
function stateFidelity(a, b){
  let ar = 0, ai = 0;
  const n = Math.min(a.dim || a.re.length, b.dim || b.re.length);
  for (let i = 0; i < n; i++){
    ar += a.re[i] * b.re[i] + a.im[i] * b.im[i];
    ai += a.re[i] * b.im[i] - a.im[i] * b.re[i];
  }
  return ar * ar + ai * ai;
}

/* ---------- 帧残差 → 陪集（与探针独立的一条路径） ---------- */
const FS_STAB_LIST = (() => {
  const gens = SHOR_STABS.map(g => ({ xm: g.k === 'x' ? maskOf(g.qs) : 0, zm: g.k === 'z' ? maskOf(g.qs) : 0 }));
  const list = [];
  for (let m = 0; m < 256; m++){
    let x = 0, z = 0;
    for (let b = 0; b < 8; b++) if (m & (1 << b)){ x ^= gens[b].xm; z ^= gens[b].zm; }
    list.push({ x, z });
  }
  return list;
})();
const FS_STAB_SPAN = new Set(FS_STAB_LIST.map(v => v.x * 512 + v.z));
function inStab(v){ return FS_STAB_SPAN.has(v.x * 512 + v.z); }
export function fsFrameCoset(v){
  if (!v.x && !v.z) return 0;
  if (inStab(v)) return 0;
  const cands = [LXL, LZL, LYL];
  for (let i = 0; i < 3; i++) if (inStab({ x: v.x ^ cands[i].x, z: v.z ^ cands[i].z })) return i + 1;
  return -1;
}
/* 最小权重代表元：帧只是**代表元**，S 内的元素物理上不可见。
   X₀X₁X₂X₃X₄X₅（一个稳定子）帧权重是 6，但「错了几个比特」是 0 —— 不取最小
   代表元会把「无害的稳定子」报成权重 6（本轮踩过的坑，pot81 抓出）。 */
export function fsMinWeight(v){
  let best = fsPopc(v.x | v.z);
  for (const g of FS_STAB_LIST){
    const w = fsPopc((v.x ^ g.x) | (v.z ^ g.z));
    if (w < best) best = w;
  }
  return best;
}

/* ---------- 单次运行 ---------- */
export function fsRun(kind = 'std', cfg = {}, faults = null, seed = 1){
  const circ = fsCircuit(kind, cfg);
  const ref = fsRef(circ);
  /* 枚举时必须给 rng：猫态的单个 ancilla 读数是真随机的（只有奇偶确定） */
  const rng = mulberry32(seed);
  const r = fsExec(circ, { faults, rng, p: 0, spectrum: cfg.spectrum, noisyPhase: cfg.noisyPhase,
    decode: cfg.decode, need: cfg.need });
  /* 含逻辑门时保真度改用 |⟨ref|ψ⟩|²：逻辑门把态翻到 |1_L⟩，解析的 alpha/beta 只对
     「没有逻辑门」的参考态成立（logic==='none' 时保持原口径，R81–R83 逐位不变）。 */
  const hasLogic = (circ.stats && circ.stats.logic && circ.stats.logic !== 'none');
  const F = hasLogic ? stateFidelity(ref.state, r.state) : r.F;
  const cl = fsClass(r.pre, ref, F);
  return { ...r, F, Fref: r.F, ...cl, ref };
}

/* ============================================================================
 * 精确单故障枚举
 * ========================================================================== */
export function fsFirstOrder(kind = 'std', cfg = {}){
  const c = { ...FS_DEFAULTS, ...cfg };
  const circ = fsCircuit(kind, c);
  const ref = fsRef(circ);
  const sites = fsFaultSites(circ);
  const blank = () => ({ n: 0, perfect: 0, outside: 0, logic: 0, flagged: 0, gauge: 0, mixed: 0, wMax: 0, wSum: 0 });
  const byPhase = {};
  const byStabKind = { z: blank(), x: blank() };
  const wHist = {}, wHistPre = {};
  const rows = [];
  let perfect = 0, outside = 0, logical = 0, flagged = 0, gauge = 0, mixed = 0, disagree = 0;
  let wMax = 0, wMaxSite = null, wSumRes = 0;

  for (const site of sites){
    const r = fsExec(circ, { faults: [{ gate: site.gate, q: site.q, t: site.t }], rng: mulberry32(12345),
      decode: c.decode, need: c.need });
    const cl = fsClass(r.pre, ref, r.F);
    /* 分类口径用**解码后**的残差帧陪集：它覆盖全部阶段（含解码段自身的故障，
       那些故障在探针取样点之后）。残差 ∈ S ⟺ F=1，与 F 判据一致。 */
    const cos = r.cosetFinal;
    const bucket = r.flagged ? 'flagged'
      : (cos === 0 ? 'perfect' : cos === -1 ? (r.F > 1 - 1e-9 ? 'gauge' : 'outside') : 'logic');
    /* 交叉校验：修正前已发生的故障（encode/extract），探针与帧必须同判 */
    if (site.ph !== 'decode' && (fsFrameCoset(r.frAtFix) !== cl.coset || cl.coset !== cos)) disagree++;
    if (bucket === 'perfect') perfect++;
    else if (bucket === 'logic') logical++;
    else if (bucket === 'gauge') gauge++;
    else if (bucket === 'mixed') mixed++;
    else if (bucket === 'flagged') flagged++;
    else outside++;
    const ph = site.ph;
    byPhase[ph] = byPhase[ph] || blank();
    byPhase[ph].n++; byPhase[ph][bucket]++;
    const sk = site.stab >= 0 ? SHOR_STABS[site.stab].k : null;
    if (sk){ byStabKind[sk].n++; byStabKind[sk][bucket]++; }
    if (bucket !== 'perfect'){
      wHist[r.wRes] = (wHist[r.wRes] || 0) + 1;
      wHistPre[r.wPre] = (wHistPre[r.wPre] || 0) + 1;
      wSumRes += r.wRes;
      if (r.wRes > wMax){ wMax = r.wRes; wMaxSite = site; }
    }
    /* 分相位的传播画像（提取段最重要：它就是「一个 ancilla 故障污染几个比特」） */
    if (ph === 'extract'){
      if (r.wPre > byPhase[ph].wMax) byPhase[ph].wMax = r.wPre;
      byPhase[ph].wSum += r.wPre;
    }
    if (sk){
      if (r.wPre > byStabKind[sk].wMax) byStabKind[sk].wMax = r.wPre;
      byStabKind[sk].wSum += r.wPre;
    }
    rows.push({ ...site, bucket, coset: cos, probeCoset: cl.coset, wPre: r.wPre, wRes: r.wRes, wPost: r.wPost, F: r.F, flags: r.flags, dupFlag: r.dupFlag });
  }

  const specW = { depolar: { x: 1 / 3, y: 1 / 3, z: 1 / 3 }, x: { x: 1, y: 0, z: 0 }, z: { x: 0, y: 0, z: 1 } }[c.spectrum]
    || { x: 1 / 3, y: 1 / 3, z: 1 / 3 };
  let wLogic = 0, wOutside = 0, wFlagged = 0;
  let exLogic = 0, exOutside = 0, exFlagged = 0;
  for (const row of rows){
    const w = specW[row.t] || 0;
    const isEx = row.ph === 'extract';
    if (row.bucket === 'logic'){ wLogic += w; if (isEx) exLogic += w; }
    else if (row.bucket === 'outside'){ wOutside += w; if (isEx) exOutside += w; }
    else if (row.bucket === 'flagged'){ wFlagged += w; if (isEx) exFlagged += w; }
  }

  return {
    kind, p: c.p, spectrum: c.spectrum, sites: sites.length, rows,
    perfect, outside, logic: logical, flagged, gauge, mixed, disagree,
    wHist, wHistPre, wMax, wMaxSite,
    wMean: wSumRes / Math.max(1, sites.length - perfect),
    byPhase, byStabKind,
    /* 两个口径：*（全阶段含 encode/decode）与 *ext（只提取段，页面主表用） */
    PL1: wLogic * c.p, outside1: wOutside * c.p, flagged1: wFlagged * c.p,
    PL1ext: exLogic * c.p, harm1ext: exOutside * c.p, det1ext: exFlagged * c.p,
    stats: circ.stats,
  };
}

/* ============================================================================
 * MC：按 p 在每个门的每个触及比特上采样
 * ========================================================================== */
/* 流式累加器（R98 P2）：step(count) 分帧；result() 出当前统计。 */
export function fsStream(kind = 'std', cfg = {}){
  const c = { ...FS_DEFAULTS, ...(typeof kind === 'string' ? { kind } : kind), ...cfg };
  const circ = fsCircuit(c.kind, c);
  const ref = fsRef(circ);
  const rng = mulberry32(c.seed);
  const acc = { perfect: 0, outside: 0, logic: 0, flagged: 0, gauge: 0, mixed: 0 };
  let n = 0, wSum = 0, flips = 0, random = 0, faultSum = 0, unsureN = 0, usedSum = 0, noGoodN = 0, retrySum = 0, skipSum = 0;
  const wHist = {};
  function one(){
    const r = fsExec(circ, { rng, p: c.p, spectrum: c.spectrum, noisyPhase: c.noisyPhase,
      noisyLogic: c.noisyLogic, decode: c.decode, need: c.need });
    const cl = fsClass(r.pre, ref, r.F);
    const cos = r.cosetFinal;
    const bucket = r.flagged ? 'flagged'
      : (cos === 0 ? 'perfect' : cos === -1 ? (r.F > 1 - 1e-9 ? 'gauge' : 'outside') : 'logic');
    acc[bucket]++;
    if (!r.flagged && bucket !== 'perfect'){ wHist[r.wRes] = (wHist[r.wRes] || 0) + 1; wSum += r.wRes; }
    flips += r.diag.frameFlip; random += r.diag.random;
    faultSum += r.fired.length;
    if (r.unsure) unsureN++;
    usedSum += r.usedRounds;
    noGoodN += r.noGoodRounds; retrySum += r.retried; skipSum += r.skippedGates;
    n++;
  }
  return {
    get total(){ return Math.max(1, c.trials | 0); },
    get n(){ return n; },
    step(count){ for (let k = 0, m = Math.max(0, count | 0); k < m; k++) one(); },
    result(){
      const nn = Math.max(1, n);
      return {
        kind: c.kind, p: c.p, spectrum: c.spectrum, trials: n, ...acc,
        PL: acc.logic / nn,
        harmful: (acc.logic + acc.outside) / nn,
        /* 条件于「未被判不可信」的样本：cat/dup 的 flag 率高，只看 PL 会把「信息少一轮」
           当成失败。两个率一起看才公平（页面 HUD 两个都显示）。 */
        PLgiven: acc.flagged >= n ? null : acc.logic / (n - acc.flagged),
        gaugeRate: acc.gauge / nn,
        residual: acc.outside / nn,
        discard: acc.flagged / nn,
        wMean: wSum / Math.max(1, n - acc.perfect - acc.flagged),
        wHist, meanFaults: faultSum / nn, frameFlips: flips, randomMeas: random,
        unsureRate: unsureN / nn, acceptRate: 1 - unsureN / nn,
        /* R83：真正「重测后仍无可信读数」的轮比例（这才是必须丢弃的），
           与 discard（触发过自检的轮比例）对照，可量化 R82 的高估幅度。 */
        noGoodRate: noGoodN / nn / Math.max(1, (circ.rounds || 1) * (circ.stats ? (circ.stats.cycles || 1) : 1)),
        meanRetried: retrySum / nn, meanSkipped: skipSum / nn,
        meanUsedRounds: usedSum / nn, rounds: circ.rounds, decode: c.decode,
        stats: circ.stats,
      };
    },
  };
}

/* 一次性全批：同一 rng 消耗序 ⟹ 数值与流式逐位一致 */
export function fsEnsemble(kind = 'std', cfg = {}){
  const s = fsStream(kind, cfg);
  s.step(s.total);
  return s.result();
}

/* ============================================================================
 * 四种线路对照（页面主表）
 *   主口径是**提取段**（编码/解码按理想）：那是本轮唯一在变的部分。
 *   同时给出全阶段数字，便于看出「编码器自己也不容错」这条共同下限。
 * ========================================================================== */
export function fsCompare(cfg = {}){
  const rows = [];
  for (const kind of Object.keys(FS_KINDS)){
    const fo = fsFirstOrder(kind, cfg);
    const e = fo.byPhase.extract || { n: 0, perfect: 0, gauge: 0, outside: 0, logic: 0, flagged: 0, wMax: 0, wSum: 0 };
    /* 一阶率直接用 fsFirstOrder 的**谱加权**结果（它已按 depolar=x/y/z 各 1/3、
       x 谱只 x、z 谱只 z 加权过）；早先在这里又硬写 /3，只有 depolar 碰巧对。 */
    rows.push({
      kind, label: FS_KINDS[kind].label, desc: FS_KINDS[kind].desc,
      nq: fo.stats.nq, ancillas: fo.stats.ancillas, gates: fo.stats.gates,
      cnots: fo.stats.cnots, meas: fo.stats.meas,
      /* 提取段（主口径） */
      sites: e.n, perfect: e.perfect, gauge: e.gauge, outside: e.outside,
      logic: e.logic, flagged: e.flagged,
      wMax: e.wMax, wMean: e.wSum / Math.max(1, e.n),
      /* 一阶率（每个位点概率 p/3；线性展开只在 M·p ≪ 1 时可信，页面会标注） */
      PL1: fo.PL1ext, detect1: fo.det1ext, harm1: fo.harm1ext,
      /* 全阶段（含 encode/decode，四种线路里这段是同一份代码） */
      allSites: fo.sites, allLogic: fo.logic, allOutside: fo.outside,
      allFlagged: fo.flagged, allGauge: fo.gauge,
      disagree: fo.disagree,
    });
  }
  return rows;
}

/* 传播画像：每个线路在提取段「一个故障污染几个数据比特」的直方图 */
export function fsPropagation(cfg = {}){
  const out = {};
  for (const kind of Object.keys(FS_KINDS)){
    const fo = fsFirstOrder(kind, cfg);
    const hist = {};
    for (const r of fo.rows){
      if (r.ph !== 'extract') continue;
      hist[r.wPre] = (hist[r.wPre] || 0) + 1;
    }
    out[kind] = { hist, n: fo.byPhase.extract.n, wMax: fo.byPhase.extract.wMax };
  }
  return out;
}

/* ============================================================================
 * 页面用：一个「语义相同」的最坏位点，四种线路可比
 *   位点 = X 类第一个提取块里、**第一道 ancilla→数据 CNOT 之后**，ancilla 吃一个 X。
 *   这是事实①的最小实例：标准线路上它把 X 顺下去污染多个数据比特，且对读数不可见。
 *   返回该故障的传播集合（供扇出图），以及「按权重最坏」的位点（供 HUD）。
 * ========================================================================== */
export function fsProbeWorst(kind = 'std', cfg = {}){
  const circ = fsCircuit(kind, cfg);
  const blk = circ.blocks.find(b => b.kind === 'x');
  let gate = -1, anc = -1, target = -1;
  for (const idx of blk.ops){
    const o = circ.ops[idx];
    if (o.op !== 'cnot') continue;
    const c = o.c ?? o.q1, t = o.t ?? o.q2;
    if (c >= A0 && t < 9){ gate = idx; anc = c; target = t; break; }
  }
  if (gate < 0) return null;
  const run = fsRun(kind, cfg, [{ gate, q: anc, t: 'x' }], 1234);
  /* 只跑这一次故障（**不再**内部全量枚举——页面已有 fsFirstOrder 的结果，
     在这里重复跑会让页面枚举成本翻倍；「最坏位点」由调用方从 fo.rows 取） */
  return {
    kind, gate, anc, target,
    label: `X 类首块首道 CNOT 后 · ancilla q${anc} 吃 X（打在 q${target} 之前）`,
    xMask: run.frBeforeFix.x, zMask: run.frBeforeFix.z,
    dataMask: (run.frBeforeFix.x | run.frBeforeFix.z) & FS_DATA_MASK,
    wPre: run.wPre, wRes: run.wRes, coset: run.coset, cls: run.cls,
    F: run.F, flagged: run.flagged, syn: run.syn.slice(),
  };
}

/* ============================================================================
 * R82 多轮提取 + 跨轮联合解码：扫描 / 伪阈值 / 斜率 / 组合对照
 * ========================================================================== */

/* P_L(p) 扫描（MC 每点）。伪阈值与斜率都从这条曲线上取，不在别处另算一套。 */
export function rdSweep(kind = 'std', cfg = {}){
  const c = { ...FS_DEFAULTS, ...(typeof kind === 'string' ? { kind } : kind), ...cfg };
  const ps = c.ps || [0.002, 0.005, 0.01, 0.02, 0.04, 0.07, 0.1, 0.15, 0.2];
  const out = { kind: c.kind, rounds: c.rounds, decode: c.decode, need: c.need,
    trials: c.trials, seed: c.seed, p: [], PL: [], discard: [], unsure: [],
    meanFaults: [], meanUsedRounds: [] };
  for (const p of ps){
    const e = fsEnsemble(c.kind, { ...c, p, trials: c.trials, seed: c.seed });
    out.p.push(p); out.PL.push(e.PL); out.discard.push(e.discard);
    out.unsure.push(e.unsureRate); out.meanFaults.push(e.meanFaults);
    out.meanUsedRounds.push(e.meanUsedRounds);
  }
  return out;
}

/* 伪阈值：P_L(p) = p 的交叉点（网格上变号 + 双对数线性插值）。
   ⚠ 这是**伪阈值**不是阈值：码距固定为 3，加轮数不加码距 ⟹ 不存在真阈值
   （真阈值需要码族：不同码距的码在同一 p 下 P_L 随距离下降）。 */
export function rdPseudoThreshold(sw){
  if (!sw || !sw.p.length) return null;
  let cross = null;
  for (let i = 1; i < sw.p.length; i++){
    const f0 = sw.PL[i - 1] - sw.p[i - 1], f1 = sw.PL[i] - sw.p[i];
    if (f0 < 0 && f1 >= 0){
      /* 双对数线性插值：ln P_L 与 ln p 之间线性 ⟹ 解 P_L = p */
      const l0 = Math.log(sw.p[i - 1]), l1 = Math.log(sw.p[i]);
      const g0 = Math.log(Math.max(1e-12, sw.PL[i - 1])), g1 = Math.log(Math.max(1e-12, sw.PL[i]));
      /* 在 p 上插值 h(p) = ln PL(p) − ln p，求 h=0 */
      const h0 = g0 - l0, h1 = g1 - l1;
      const t = h0 / (h0 - h1);
      cross = Math.exp(l0 + t * (l1 - l0));
      break;
    }
  }
  return cross;
}

/* 小 p 区的 log-log 斜率：P_L ∝ p^α。α≈1 表示「单个故障就能逻辑失败」（不容错），
   α≈2 表示「要两个故障才逻辑失败」（容错）——这是本轮最硬的一条数字。 */
export function rdSlope(sw, i0 = 0, i1 = 2){
  if (!sw || sw.p.length <= i1) return null;
  const p0 = sw.p[i0], p1 = sw.p[i1];
  const q0 = Math.max(1e-9, sw.PL[i0]), q1 = Math.max(1e-9, sw.PL[i1]);
  return Math.log(q1 / q0) / Math.log(p1 / p0);
}

/* 组合对照：轮数 × 解码器（可再乘线路方案） */
export function rdCompare(cfg = {}){
  const base = { ...FS_DEFAULTS, ...cfg };
  const rows = [];
  const kinds = cfg.kinds || [base.kind || 'std'];
  const roundsList = cfg.roundsList || [1, 2, 3];
  const decodes = cfg.decodes || ['single', 'immediate', 'repeat'];
  for (const kind of kinds) for (const rounds of roundsList) for (const decode of decodes){
    if (decode === 'repeat' && rounds < (base.need || 2)) continue;   /* 轮数不足时 repeat 永远达不成一致 */
    const c = { ...base, kind, rounds, decode };
    const sw = rdSweep(kind, { ...c, ps: cfg.ps });
    rows.push({
      kind, rounds, decode, need: c.need,
      PL: sw.PL, p: sw.p,
      PLat: sw.PL[cfg.pIdx || 2], pAt: sw.p[cfg.pIdx || 2],
      pseudo: rdPseudoThreshold(sw), slope: rdSlope(sw),
      unsure: sw.unsure[cfg.pIdx || 2], meanUsed: sw.meanUsedRounds[cfg.pIdx || 2],
      trials: sw.trials,
    });
  }
  return rows;
}

/* ============================================================================
 * R84 循环 EC + 逻辑线路：门错误的拦截率 / P_L 随周期数
 * ========================================================================== */

/* 逻辑门上的单故障「救回率」——门后有 EC vs 门后无 EC（trailingLogic）。
   ⚠ 必须用 immediate：repeat 要连续 need 轮一致才修，而门错误只出现在门之后的周期，
   单周期内等不到确认（见 pot84 D）。 */
export function cyInterception(cfg = {}){
  const base = { ...FS_DEFAULTS, ...cfg };
  const out = {};
  for (const where of ['mid', 'tail']){
    const c = { ...base, logic: base.logic === 'none' ? 'xl' : base.logic,
      /* 中间门只在 t>0 插 ⟹ 至少要 2 个周期；tail 变体在末尾再插一个 */
      cycles: Math.max(2, base.cycles | 0 || 2),
      trailingLogic: where === 'tail', decode: 'immediate' };
    const circ = fsCircuit(c.kind, c);
    const sites = fsFaultSites(circ).filter(x => x.ph === (where === 'tail' ? 'logicTail' : 'logic'));
    const acc = { n: 0, perfect: 0, gauge: 0, outside: 0, logic: 0, flagged: 0 };
    for (const st of sites){
      const r = fsRun(c.kind, c, [{ gate: st.gate, q: st.q, t: st.t }], 1);
      acc.n++;
      if (r.flagged) acc.flagged++;
      else if (r.coset === 0) acc.perfect++;
      else if (r.coset === -1) { if (r.F > 1 - 1e-9) acc.gauge++; else acc.outside++; }
      else acc.logic++;
    }
    acc.rescue = acc.n ? (acc.perfect + acc.gauge) / acc.n : null;
    out[where] = acc;
  }
  return out;
}

/* P_L 随周期数（MC 每个 T 一次）。cycle 之间插逻辑门，noisyLogic 决定门段是否注错。 */
export function cySweepCycles(cfg = {}){
  const base = { ...FS_DEFAULTS, ...cfg };
  const Ts = cfg.Ts || [1, 2, 3, 4];
  const out = { T: [], PL: [], logic: [], faults: [], noGood: [], gates: [], trials: base.trials || 400 };
  for (const T of Ts){
    const e = fsEnsemble(base.kind, { ...base, cycles: T, trials: base.trials || 400 });
    out.T.push(T); out.PL.push(e.PL); out.logic.push(e.logic);
    out.faults.push(e.meanFaults); out.noGood.push(e.noGoodRate);
    out.gates.push((fsCircuit(base.kind, { ...base, cycles: T }).stats.gates));
  }
  return out;
}
