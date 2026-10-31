/* ============================================================================
 * spin.js（引擎）— 一维海森堡自旋链（XXZ + 局域场）：精确对角化 / 淬变 / 纠缠
 *
 *   H = Σ_i J [ S^x_i S^x_{i+1} + S^y_i S^y_{i+1} + Δ S^z_i S^z_{i+1} ] − Σ_i bz_i S^z_i
 *
 * 与哈伯德页的关系：哈伯德的「单自旋扇区」就是本页的基（固定 Sᶻ 的 L 位掩码），
 * 所以基构造 / CSR 两遍建表 / Lanczos / 任意切点 Schmidt 熵都沿用同一套做法；
 * 差别只有三条：① 每个跃迁的符号恒为 +J/2（自旋算符在格点上对易，**没有 JW 串**）；
 * ② 对角项是 Ising 的 Δ s_i s_{i+1}（s=±1/2）而不是 U·双占；
 * ③ 断链切分不再需要按粒子数分块（左右两侧各有 2^c / 2^(L−c) 个构型）。
 *
 * 【符号约定】s = ±1/2、S^± = S^x ± iS^y。
 *   J > 0 = 反铁磁（AFM），J < 0 = 铁磁（FM）。Δ=1 是 XXX（SU(2) 对称）、
 *   Δ=0 是 XX（自由费米子）、Δ=−1 以下基态是 FM 极化。
 *
 * 【精确锚点】（pot144 全部逐条对账）
 *   • L=2 解析：Sᶻ=0 扇区 E = −JΔ/4 ± J/2（Δ=1 即 −3J/4 单态、+J/4 三重态 m=0），
 *     全 ↑ 扇区 E = JΔ/4
 *   • XX（Δ=0）开边界半满：E₀ = −J Σ_{m=1..L/2} cos(πm/(L+1))（自由费米子，机器精度）
 *   • XXX 热力学极限：E/N → 1/4 − ln2 = −0.443147（Bethe ansatz）
 *   • 饱和场：h > J(1+Δ) 时基态 = 全极化，E = JΔ(L−1)/4 − hL/2（精确）
 *   • SU(2)：Δ=1 的偶链基态是单态 ⟹ ⟨S²⟩ = 0；Δ≠1 只剩 U(1) ⟹ ⟨S²⟩ > 0
 *   • 临界纠缠：开边界 XXX 半链熵 S ≈ (1/6)ln L + const（c=1）
 * ========================================================================== */

import { EdLanczosTask, edGramEntropy, edKrylovExp } from './edbase.js';

/* 稠密小矩阵的「只求特征值+特征向量」封装：Ritz 与 Krylov 都要它。
   放在这里是因为两个模型各自的稠密解法不同（本页 spJacobi 是满 sweep 的
   Jacobi，哈伯德页 jacobiEigen 的 sweep 上限是 40）。 */
const spEig = T => { const r = spJacobi(T); return { val: r.values, vec: r.vectors }; };

/* ---------- 基：固定 Sᶻ 扇区（L 位掩码，1 = ↑） ---------- */
export function spPopcount(x){
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}
export function spBasis(L, nUp){
  if (!(L > 0 && L <= 22)) throw new Error('spBasis: L 须在 1..22');
  if (!(nUp >= 0 && nUp <= L)) throw new Error('spBasis: nUp 须在 0..L');
  const size = 1 << L;
  const masks = [];
  for (let m = 0; m < size; m++) if (spPopcount(m) === nUp) masks.push(m);
  const index = new Int32Array(size).fill(-1);
  masks.forEach((m, i) => { index[m] = i; });
  return { L, nUp, dim: masks.length, masks: Int32Array.from(masks), index,
    Sz: nUp - L / 2 };
}

/* Reusable local-field objects for the spin-chain sandbox. Profiles add linearly;
   `width` is the half-width in lattice sites. `base` remains the legacy freehand layer. */
export const SP_FIELD_SHAPES = ['gaussian', 'box', 'staggered'];
export function spNormalizeFieldObjects(L, objects, maxObjects = 24){
  if (!Number.isInteger(L) || L < 1 || L > 22 || !Array.isArray(objects) || objects.length > maxObjects){
    throw new RangeError('spNormalizeFieldObjects: invalid chain length or object count');
  }
  const ids = new Set();
  return objects.map((o, i) => {
    if (!o) throw new TypeError(`spNormalizeFieldObjects: invalid field object ${i}`);
    const id = String(o.id ?? `field-${i + 1}`);
    if (!SP_FIELD_SHAPES.includes(o.shape) || !Number.isFinite(o.center) || !Number.isFinite(o.width) ||
        o.width < 0.5 || o.width > 8 || !Number.isFinite(o.amp) || Math.abs(o.amp) > 4 ||
        o.center < 0 || o.center > L - 1){
      throw new TypeError(`spNormalizeFieldObjects: invalid field object ${i}`);
    }
    if (ids.has(id)) throw new TypeError(`spNormalizeFieldObjects: duplicate id ${id}`);
    ids.add(id);
    return { id, shape: o.shape, center: +o.center, width: +o.width, amp: +o.amp };
  });
}
export function spComposeField(L, base = null, objects = []){
  if (!Number.isInteger(L) || L < 1 || L > 22) throw new RangeError('spComposeField: invalid chain length');
  if (base && base.length !== L) throw new RangeError('spComposeField: base field length must equal L');
  const list = spNormalizeFieldObjects(L, objects);
  const field = Float64Array.from({ length: L }, (_, i) => base ? (Number(base[i]) || 0) : 0);
  for (const o of list){
    for (let i = 0; i < L; i++){
      const dx = i - o.center, ad = Math.abs(dx);
      let weight = 0;
      if (o.shape === 'gaussian') weight = Math.exp(-0.5 * (dx / o.width) ** 2);
      else if (ad <= o.width + 1e-12){
        weight = o.shape === 'box' ? 1 : (Math.round(dx) % 2 === 0 ? 1 : -1);
      }
      field[i] += o.amp * weight;
    }
  }
  return field;
}

/* ---------- 扇区：CSR 跃迁表 + 对角表 ----------
   opts = { J = 1, delta = 1, h = 0, field = null }
   h 是**均匀**场（等价于 field 全等），field 是逐格场 bz_i（长度 L）。 */
export function spSector(L, nUp, opts = {}){
  const J = opts.J ?? 1, delta = opts.delta ?? 1, h = opts.h ?? 0;
  const field = opts.field || null;
  if (field && field.length !== L) throw new Error('spSector: field 长度须为 L');
  const basis = spBasis(L, nUp);
  const { dim, masks, index } = basis;
  const bond = L - 1;
  const bz = new Float64Array(L);
  for (let i = 0; i < L; i++) bz[i] = (field ? field[i] : 0) + h;

  /* 对角项：JΔ Σ s_i s_{i+1} − Σ bz_i s_i（s_i = ±1/2 ⟹ 4·s_i s_j = ±1） */
  const diag = new Float64Array(dim);
  const bitS = new Int8Array(L);
  const bondSign = new Int8Array(L);            /* 4·s_i·s_{i+1} ∈ {+1,−1} */
  for (let k = 0; k < dim; k++){
    const m = masks[k];
    let ising = 0, zee = 0;
    for (let i = 0; i < L; i++) bitS[i] = (m >> i) & 1 ? 1 : -1;
    for (let i = 0; i < bond; i++){
      const sg = bitS[i] * bitS[i + 1];
      bondSign[i] = sg;
      ising += sg;
    }
    for (let i = 0; i < L; i++) zee += bz[i] * bitS[i];
    /* Σ s_i s_j = (1/4)Σ sg ；Σ bz_i s_i = (1/2)Σ bz_i bitS_i */
    diag[k] = 0.25 * J * delta * ising - 0.5 * zee;
  }

  /* 跃迁项：(J/2)(S⁺_i S⁻_{i+1} + S⁻_i S⁺_{i+1}) ⟹ 相邻反向时互相连接，幅度 J/2 */
  const offsets = new Int32Array(dim + 1);
  for (let k = 0; k < dim; k++){
    const m = masks[k];
    let c = 0;
    for (let i = 0; i < bond; i++){
      if (((m >> i) & 1) !== ((m >> (i + 1)) & 1)) c++;
    }
    offsets[k + 1] = c;
  }
  for (let k = 0; k < dim; k++) offsets[k + 1] += offsets[k];
  const nnz = offsets[dim];
  const targets = new Int32Array(nnz);
  const cursor = Int32Array.from(offsets.subarray(0, dim));
  for (let k = 0; k < dim; k++){
    const m = masks[k];
    let p = cursor[k];
    for (let i = 0; i < bond; i++){
      if (((m >> i) & 1) !== ((m >> (i + 1)) & 1)){
        const tg = index[m ^ (3 << i)];
        if (tg < 0) throw new Error('spSector: 跃迁目标不在扇区内（内部错误）');
        targets[p++] = tg;
      }
    }
  }
  /* masks/index 同时挂到扇区顶层：观测量与熵的循环里直接解构，少一层属性访问 */
  return { L, nUp, Sz: basis.Sz, basis, dim, masks: basis.masks, index: basis.index,
    J, delta, h, bz, diag, offsets, targets, nnz, hop: 0.5 * J };
}

/* H·ψ（实/虚两通道；H 实对称 ⟹ 同一算子） */
export function spMatvec(sec, re, im, outRe, outIm){
  const { dim, offsets, targets, diag, hop } = sec;
  for (let k = 0; k < dim; k++){
    const d = diag[k];
    let sr = d * re[k], si = d * im[k];
    for (let p = offsets[k]; p < offsets[k + 1]; p++){
      const tg = targets[p];
      sr += hop * re[tg]; si += hop * im[tg];
    }
    outRe[k] = sr; outIm[k] = si;
  }
}
export function spNorm(re, im){
  let n = 0;
  for (let k = 0; k < re.length; k++) n += re[k] * re[k] + im[k] * im[k];
  return n;
}
export function spDot(ar, ai, br, bi){
  let s = 0;
  for (let k = 0; k < ar.length; k++) s += ar[k] * br[k] + ai[k] * bi[k];
  return s;
}
/* ⟨ψ|H|ψ⟩（要求 ‖ψ‖=1） */
export function spEnergy(sec, re, im){
  const tr = new Float64Array(sec.dim), ti = new Float64Array(sec.dim);
  spMatvec(sec, re, im, tr, ti);
  return spDot(re, im, tr, ti);
}
/* 残差 ‖Hψ − Eψ‖：Lanczos 收敛的自检量（页面 HUD 直接显示） */
export function spResidual(sec, re, im, E){
  const tr = new Float64Array(sec.dim), ti = new Float64Array(sec.dim);
  spMatvec(sec, re, im, tr, ti);
  let s = 0;
  for (let k = 0; k < sec.dim; k++){
    const dr = tr[k] - E * re[k], di = ti[k] - E * im[k];
    s += dr * dr + di * di;
  }
  return Math.sqrt(s);
}

/* ---------- 初态 ---------- */
/* spins[i] = +1（↑）或 −1（↓） */
export function spProduct(sec, spins){
  const { L, dim, index } = sec;
  if (!spins || spins.length !== L) throw new Error('spProduct: spins 长度须为 L');
  let mask = 0, nUp = 0;
  for (let i = 0; i < L; i++){
    if (spins[i] > 0){ mask |= 1 << i; nUp++; }
  }
  /* 粒子数与扇区不符 ⟹ index 查到 −1，写进 re[−1] 会被丢弃、得到全零向量。
     和哈伯德页一样：这里直接说清楚，不静默。 */
  if (nUp !== sec.nUp){
    throw new Error(`spProduct: 初态 ↑ 数 ${nUp} 与扇区 nUp=${sec.nUp} 不符`);
  }
  const re = new Float64Array(dim), im = new Float64Array(dim);
  const k = index[mask];
  if (k < 0) throw new Error('spProduct: 初态不在扇区基内（内部错误）');
  re[k] = 1;
  return { re, im };
}
/* 奈尔态：偶数格 ↑、奇数格 ↓（L 奇数时最后一个格按 nUp 补齐） */
export function spNeel(sec){
  const L = sec.L, spins = new Array(L);
  for (let i = 0; i < L; i++) spins[i] = i % 2 === 0 ? 1 : -1;
  let nUp = spins.filter(s => s > 0).length;
  /* 扇区不是半满时，从右端开始把差的位翻掉（保证仍落在扇区里） */
  for (let i = L - 1; i >= 0 && nUp !== sec.nUp; i--){
    if (nUp > sec.nUp && spins[i] > 0){ spins[i] = -1; nUp--; }
    else if (nUp < sec.nUp && spins[i] < 0){ spins[i] = 1; nUp++; }
  }
  return spProduct(sec, spins);
}
/* 全极化（|↑↑…↑⟩ 或 |↓↓…↓⟩） */
export function spPolarized(sec, up = true){
  const spins = new Array(sec.L).fill(up ? 1 : -1);
  return spProduct(sec, spins);
}

/* ---------- 观测量 ----------
   sz[i]   = ⟨S^z_i⟩ ∈ [−1/2, 1/2]
   zz[i][j]= ⟨S^z_i S^z_j⟩（L×L）
   bond[i] = ⟨S_i·S_{i+1}⟩ = ⟨S^z_iS^z_{i+1}⟩ + (1/2)⟨S⁺_iS⁻_{i+1} + h.c.⟩
   S2      = ⟨S²_tot⟩（SU(2) 单态的判据：0）
   代价 O(dim·L²)（L=16 约 3 ms、L=20 约 60 ms）⟹ 页面在基态/暂停时才刷新。 */
export function spMeasure(sec, re, im){
  const { L, dim, masks, index, offsets, targets } = sec;
  const sz = new Float64Array(L);
  const zz = new Float64Array(L * L);
  const bond = new Float64Array(Math.max(0, L - 1));
  let trans = 0;                       /* Σ_{i<j}(⟨S⁺_iS⁻_j⟩ + ⟨S⁻_iS⁺_j⟩) */
  const buf = new Float64Array(dim);
  for (let k = 0; k < dim; k++){
    const m = masks[k];
    const w = re[k] * re[k] + im[k] * im[k];
    if (w < 1e-30) continue;
    for (let i = 0; i < L; i++){
      const si = ((m >> i) & 1) ? 0.5 : -0.5;
      sz[i] += w * si;
      for (let j = i; j < L; j++){
        const sj = ((m >> j) & 1) ? 0.5 : -0.5;
        zz[i * L + j] += w * si * sj;
      }
    }
    /* 横向部分：对所有 (i<j) 且 i↓ j↑ 的态，翻转后得到 ⟨S⁺_i S⁻_j⟩ 的贡献 */
    for (let i = 0; i < L; i++){
      if ((m >> i) & 1) continue;                    /* i 必须 ↓ */
      for (let j = i + 1; j < L; j++){
        if (!((m >> j) & 1)) continue;               /* j 必须 ↑ */
        const tg = index[m ^ (1 << i) ^ (1 << j)];
        if (tg < 0) continue;
        /* ⟨S⁺_i S⁻_j⟩ = Σ_k ψ*_k ψ_{k'}（幅度 1）⟹ 实部对贡献 */
        trans += 2 * (re[k] * re[tg] + im[k] * im[tg]);
      }
    }
  }
  for (let i = 0; i < L; i++) for (let j = 0; j < i; j++) zz[i * L + j] = zz[j * L + i];
  /* 竖直键：⟨S^z_iS^z_j⟩ + (1/2)(⟨S⁺_iS⁻_j⟩+h.c.)，两者都已在上面算过 */
  for (let i = 0; i < L - 1; i++){
    const j = i + 1;
    bond[i] = zz[i * L + j];
    /* 相邻反向态的翻转项：直接从 CSR 里取（幅度 hop=J/2 与物理矩阵元无关） */
    let t = 0;
    for (let k = 0; k < dim; k++){
      const m = masks[k];
      if (((m >> i) & 1) === ((m >> (i + 1)) & 1)) continue;
      for (let p = offsets[k]; p < offsets[k + 1]; p++){
        const tg = targets[p];
        if (tg === index[m ^ (3 << i)]){ t += re[k] * re[tg] + im[k] * im[tg]; break; }
      }
    }
    /* t 是**双向**累加（k 遍历了 ↑↓ 与 ↓↑ 两种朝向）⟹ 物理值 = t/2 */
    bond[i] += 0.5 * t;
  }
  const Sz = sec.Sz;
  /* ⟨S²⟩ = Sᶻ_tot² + L/2 + Σ_{i<j}(⟨S⁺_iS⁻_j⟩+h.c.)   （S² = Σ_ij S_i·S_j 的展开） */
  const S2 = Sz * Sz + L / 2 + trans;
  void buf;
  const mag = sz.reduce((a, b) => a + b, 0);
  return { sz: Array.from(sz), zz, bond: Array.from(bond), S2, Sz, mag, dim };
}

/* ---------- 任意切点的 Schmidt 熵 ----------
   固定 Sᶻ 扇区的基是**左右构型的直积**（mask = 左 c 位 | 右 L−c 位 << c）⟹
   切点 c 的系数矩阵 M[a][b] 就是 ψ 的分块，不需要哈伯德页那种按粒子数分块。
   取较小一侧做 Gram（AA† 与 A†A 非零谱相同），复矩阵用实嵌入 [[Re,−Im],[Im,Re]]。 */
export function spEntropyAt(sec, re, im, cut, symEigVals){
  const { L, dim, masks } = sec;
  if (!(cut > 0 && cut < L)) return { S: 0, spectrum: [], sum: 0 };
  const nL = 1 << cut, nR = 1 << (L - cut);
  /* 【坑】矩阵必须**统一**按 a*nR+b（行 = 左侧构型）建，再在 Gram 里按大小选 AA†/A†A。
     首版在 nL>nR 的分支里换了行主序（b*n+a），折算出的 Gram 取错了元素 ⟹
     切点偏向一侧时 S(x) 不对称（S(x)≠S(L−x)），被 pot144 的反射对称断言抓住。 */
  const Ar = new Float64Array(nL * nR), Ai = new Float64Array(nL * nR);
  for (let k = 0; k < dim; k++){
    const mask = masks[k];
    const o = (mask & (nL - 1)) * nR + (mask >> cut);
    Ar[o] = re[k]; Ai[o] = im[k];
  }
  /* 系数矩阵交给公共内核（edGramEntropy 就是这里原来的实现，见 edbase.js） */
  return edGramEntropy(Ar, Ai, nL, nR, symEigVals);
}
export function spEntropy(sec, re, im, symEigVals){ return spEntropyAt(sec, re, im, sec.L >> 1, symEigVals); }
export function spEntropyProfile(sec, re, im, symEigVals){
  const L = sec.L, out = new Float64Array(L + 1);
  for (let c = 1; c < L; c++) out[c] = spEntropyAt(sec, re, im, c, symEigVals).S;
  return out;
}

/* ---------- 静态结构因子 S^zz(q) ----------
   S(q) = (1/L) Σ_{ij} e^{iq(i−j)}⟨S^z_iS^z_j⟩，q = 2πm/L。
   求和规则：Σ_q S(q) = L/4；q=0 ⟹ S(0) = Sᶻ_tot²/L（精确，Sz 守恒）。 */
export function spStructureFactor(sec, zz){
  const L = sec.L, out = new Float64Array(L);
  for (let m = 0; m < L; m++){
    const q = 2 * Math.PI * m / L;
    let s = 0;
    for (let i = 0; i < L; i++){
      for (let j = 0; j < L; j++) s += Math.cos(q * (i - j)) * zz[i * L + j];
    }
    out[m] = s / L;
  }
  return out;
}

/* ---------- 演化：Krylov 指数 exp(−iH dt)ψ ----------
   实现搬进 edbase.js（与哈伯德页共用）：归一化 → m 步三项递推 → 三对角本征分解 →
   ψ' = Σ_j c_j V_j。本页只提供 matvec 与稠密本征解法。 */
export function spKrylovExp(sec, re, im, dt, m = 12){
  return edKrylovExp(sec.dim, (ar, ai, br, bi) => spMatvec(sec, ar, ai, br, bi), re, im, dt, m, spEig);
}

/* ---------- 稠密参考：spJacobi（L≤10 的整块对角化，测试与「精确谱」用） ---------- */
export function spJacobi(Ain, maxSweep = 60){
  const n = Ain.length;
  const A = Ain.map(r => Float64Array.from(r));
  let V = Array.from({ length: n }, (_, i) => {
    const r = new Float64Array(n); r[i] = 1; return r;
  });
  for (let sweep = 0; sweep < maxSweep; sweep++){
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-26) break;
    for (let p = 0; p < n - 1; p++){
      for (let q = p + 1; q < n; q++){
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-18) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++){
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++){
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++){
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values = Float64Array.from({ length: n }, (_, i) => A[i][i]);
  return { values, vectors: V };
}
/* 稠密 H（测试用）：返回 Float64Array 行主序 n×n */
export function spDense(sec){
  const { dim, offsets, targets, diag, hop } = sec;
  const H = new Float64Array(dim * dim);
  for (let k = 0; k < dim; k++){
    H[k * dim + k] = diag[k];
    for (let p = offsets[k]; p < offsets[k + 1]; p++) H[k * dim + targets[p]] += hop;
  }
  return H;
}
export function spDenseEig(sec){
  const { dim } = sec;
  const H = spDense(sec);
  const A = Array.from({ length: dim }, (_, i) => {
    const r = new Float64Array(dim);
    for (let j = 0; j < dim; j++) r[j] = H[i * dim + j];
    return r;
  });
  const { values, vectors } = spJacobi(A);
  return { values, vectors };
}

/* ---------- 基态：Lanczos（实模式，按内存预算裁 m） ---------- */
/* 基态任务 = 公共 Lanczos + 本页的 matvec / Ritz 解法。
   H 实对称 ⟹ Krylov 基虚部恒 0，公共内核只存实部；`fullOrtho` 关着（三项递推
   已够：L=16 的残差仍在 1e-13），要比哈伯德页省 O(m²·dim)。 */
export class SpGsTask extends EdLanczosTask {
  constructor(sec, opts = {}){
    super(sec.dim, (re, im, outR, outI) => spMatvec(sec, re, im, outR, outI),
      { ...opts, eig: spEig });
    this.sec = sec;
  }
  step(n = 1){ super.step(n); return this; }
}

/* ---------- 预设（页面用；纯数据） ---------- */
export const SP_PRESETS = {
  xxx: { name: 'XXX（Bethe）', text: 'Δ=1、h=0：SU(2) 对称的反铁磁链。基态是**单态**（⟨S²⟩=0），半链纠缠熵按 (1/6)ln L 长（c=1）。E/N → 1/4−ln2。', delta: 1, h: 0, mode: 'gs', nUp: 'half' },
  xx: { name: 'XX（自由费米子）', text: 'Δ=0：Jordan–Wigner 后精确等于无相互作用费米子，E₀ = −JΣcos(πm/(L+1))，机器精度可对账。', delta: 0, h: 0, mode: 'gs', nUp: 'half' },
  xxz: { name: 'XXZ（Δ=0.5）', text: 'Δ=0.5：只剩 U(1)，基态不再是 SU(2) 单态（⟨S²⟩>0），沿 z 的关联更长；能隙随 Δ 打开。', delta: 0.5, h: 0, mode: 'gs', nUp: 'half' },
  ising: { name: 'Ising 极限', text: 'Δ=4：沿 z 的交换能压倒横向翻转 ⟹ 近乎经典的奈尔序、能隙打开、纠缠被压下去。', delta: 4, h: 0, mode: 'gs', nUp: 'half' },
  neel: { name: '奈尔猝变', text: '从奈尔态（S=0 的直积态）淬变到 Δ=1：纠缠熵随时间线性长、随后饱和——与哈伯德页的猝变同一条叙事。', delta: 1, h: 0, mode: 'evo', nUp: 'half' },
  field: { name: '场极化', text: 'h 超过饱和场 J(1+Δ) 后基态是全极化（E = JΔ(L−1)/4 − hL/2，精确）；把 h 拉回饱和场以下看它崩成奈尔序。', delta: 1, h: 2.5, mode: 'gs', nUp: 'half' },
};
