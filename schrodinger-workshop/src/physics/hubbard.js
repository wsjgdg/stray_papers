/* ============================================================================
 * hubbard.js — R73 二次量子化：一维格点费米-哈伯德（固定粒子数基，纯 CPU）
 *
 *   H = −t Σ_{i,σ} (c†_{iσ} c_{i+1,σ} + h.c.) + U Σ_i n_{i↑} n_{i↓} + Σ_i μ_i (n_{i↑}+n_{i↓})
 *
 * 【外场 μ_i】R139 加入：局域势**只进对角项**，不改变基与 CSR 跃迁表 ⟹ 画势时无
 * 需重建扇区（重建 L=10 要 286ms，而 hbSetField 只要 1ms）。矩阵元
 *   ⟨k|Σμ_i n_i|k⟩ = Σ_{i∈mask↑_a} μ_i + Σ_{i∈mask↓_b} μ_i = φ↑[a] + φ↓[b]
 * 先按**单自旋扇区**算 φ（O(dim_spin·L)），再在双自旋索引上做一次加法（O(dim)），
 * 避免 matvec 内循环里每次重算。均匀 μ 只平移能量：ψ 逐位不变、E→E+μN（pot139）。
 *
 * 【基与维度】自旋分部门：↑ 与 ↓ 各自固定粒子数 ⟹ 基 = C(L,N↑)·C(L,N↓)，
 * 而非 2^(2L)。每格每自旋占据数 0/1 —— **同自旋两费米子不能同格点**是基构造
 * 的结构性事实（不是相互作用）；U 只惩罚 ↑↓ 同格（双占）。这正是二次量子化
 * 语言与 R72 实空间反对称化的对应：R72 的对角线恒零 = 这里的「同格 0/1」。
 *
 * 【Jordan–Wigner 符号】最近邻跃迁 c†_{i+1}c_i 的符号 = (−1)^{popcount(mask
 * & ((1<<min(i,i+1))−1))}：沿格点次序把 c_i 移过左侧占据算符的相位。省略它
 * 会得到「硬核玻色子」而非费米子（pot73 用 2 格点解析解与稠密对角化双重校验）。
 *
 * 【存储】跃迁表用 **CSR**（offsets+targets+signs，nnz≈dim×4~8）而非「每态固定
 * 槽位」——后者要 4(L−1) 槽、L=10 时 11MB 且 matvec 满槽扫描；CSR 紧凑且循环
 * 只走真实非零。
 *
 * 【积分器】
 *   - 基态：Lanczos（全重正交、三对角 Jacobi），分帧驱动 `HbGsTask.step(n)`；
 *     固定 (N↑,N↓) 扇区内的最低态。
 *   - 实时：**Krylov 指数** exp(−iHdt)ψ（m 步 Lanczos + 三对角本征分解），
 *     酉到机器精度（pot73 对照 Taylor 参考量化截断）。
 *   - 电荷能隙：Δ=E(N↑+1,N↓)+E(N↑−1,N↓)−2E(N↑,N↓)（两次额外 Lanczos）。
 *
 * 【纠缠熵】半链切分：ρ_L 在 (k↑_L,k↓_L) 上**块对角** ⟹ 逐块 SVD（L=8 每块
 * ≤36×36，L=10 ≤100×100），S=Σ_blocks −Σλlnλ。不做全 2^L 对角化（L=10 是
 * 1024 维，全矩阵 Jacobi 不可行）；块分解精确，因粒子数守恒按块封闭。
 *
 * 【诚实限制】
 *   1. 自旋ful 维度是 C(L,N↑)·C(L,N↓)：L=12 半满 924²=854k（matvec ~0.2s，
 *      只适合离线），本页实际 L=8（4900）/L=10（63504）。README 里
 *      「L=20/N=10 ⟹ 184756」是**单自旋**估计，不适用双自旋。
 *   2. 开边界（跨边界绕行符号不在本轮）。
 *   3. 粒子数固定：μ_i 是**局域势**（每格一个，可在页面上涂），不是化学势——
 *      没有 μN 项就不存在粒子数涨落。
 *   4. Krylov 截断 O(dt^{m+1})，pot73 与 Taylor 参考对账。
 * ========================================================================== */

import { EdLanczosTask, edKrylovExp } from './edbase.js';

/* 稠密三对角的本征分解：Ritz 与 Krylov 共用（40 个 sweep 足够，见 _extract 注释） */
const hbEig = T => jacobiEigen(T, 40);

/* ---------- 基构造 ---------- */
export function popcount(x){
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}
/* 单自旋扇区：所有 popcount=N 的 L 位掩码（升序）+ 掩码→索引查找表 */
export function hbBasis(L, N){
  const size = 1 << L;
  const masks = [];
  for (let m = 0; m < size; m++) if (popcount(m) === N) masks.push(m);
  const index = new Int32Array(size).fill(-1);
  masks.forEach((m, i) => { index[m] = i; });
  return { L, N, dim: masks.length, masks: Int32Array.from(masks), index };
}

/* 双自旋扇区：CSR 跃迁表 + 对角 U 表（↑掩码 & ↓掩码 的 popcount） */
export function hbSector(L, Nup, Ndn){
  const bu = hbBasis(L, Nup), bd = hbBasis(L, Ndn);
  const du = bu.dim, dd = bd.dim, dim = du * dd;
  const diagU = new Uint8Array(dim);
  for (let a = 0; a < du; a++){
    const mu = bu.masks[a];
    for (let b = 0; b < dd; b++) diagU[a * dd + b] = popcount(mu & bd.masks[b]);
  }
  /* 【JW 符号】= 把 c_j 移到 c_i 位置时跨过的占据数：**严格介于 i 与 j 之间**的占据位。
     旧版写「低于 min(i,j) 的占据数」——那是最近邻跃迁的等价写法（两者相差一个对角
     规范变换 G，谱完全不变：pot140 用稠密低端谱逐项对账 worst 5e-15），但对任意 (i,j)
     的 c†_i c_j 给出非物理符号：ρ_ij 不再正定（n(k) 出现负值）、J_i 随占据奇偶翻正负。
     改用标准串后：自由费米子基态**精确等于** Slater 行列式（⟨·⟩=1.000000000000），
     n(k) 恢复费米海形状（≥0、Σ=N）。三处 hopOne（扇区 / ρ / 键关联）必须同一约定。 */
  /* 每态跃迁（↑ 与 ↓）：先数再填（CSR 两遍） */
  const hopOne = (mask, i, j) => {
    const bi = 1 << i, bj = 1 << j;
    if (!(mask & bj) || (mask & bi)) return null;
    const lo = Math.min(i, j), hi = Math.max(i, j);
    const mid = ((1 << hi) - 1) ^ ((1 << (lo + 1)) - 1);
    return [mask ^ bi ^ bj, (popcount(mask & mid) % 2) ? -1 : 1];
  };
  /* CSR 两遍构建：先数每态的跃迁数、再回填。
     旧版用 tmp 数组收集 [stateIdx,target,sign] 三元组：L=12 半满要 push 1000 万个数组
     （≈1 GB RSS、4.8 s）。两遍法把内存降到 targets+signs，构建也快一倍。 */
  const offsets = new Int32Array(dim + 1);
  const bond = L - 1;
  for (let a = 0; a < du; a++){
    const mu = bu.masks[a];
    for (let b = 0; b < dd; b++){
      const k = a * dd + b, md = bd.masks[b];
      let c = 0;
      for (let s = 0; s < bond; s++){
        const i0 = s, i1 = s + 1;
        const b0 = 1 << i0, b1 = 1 << i1;
        /* 方向 1：c†_{i0} c_{i1}（i1 占、i0 空） */
        if ((mu & b1) && !(mu & b0)) c++;
        if ((md & b1) && !(md & b0)) c++;
        /* 方向 2：c†_{i1} c_{i0} */
        if ((mu & b0) && !(mu & b1)) c++;
        if ((md & b0) && !(md & b1)) c++;
      }
      offsets[k + 1] = c;
    }
  }
  for (let k = 0; k < dim; k++) offsets[k + 1] += offsets[k];
  const nnz = offsets[dim];
  const targets = new Int32Array(nnz), signs = new Int8Array(nnz);
  const cursor = Int32Array.from(offsets.subarray(0, dim));
  for (let a = 0; a < du; a++){
    const mu = bu.masks[a];
    for (let b = 0; b < dd; b++){
      const k = a * dd + b, md = bd.masks[b];
      let p = cursor[k];
      for (let s = 0; s < bond; s++){
        for (let dir = 0; dir < 2; dir++){
          const i = dir ? s + 1 : s, j = dir ? s : s + 1;
          const hu = hopOne(mu, i, j);
          if (hu){ targets[p] = bu.index[hu[0]] * dd + b; signs[p] = hu[1]; p++; }
          const hd = hopOne(md, i, j);
          if (hd){ targets[p] = a * dd + bd.index[hd[0]]; signs[p] = hd[1]; p++; }
        }
      }
    }
  }
  /* diagPot：外场 Σμ_i(n_i↑+n_i↓) 的对角量（hbSetField 填充，默认全零） */
  const diagPot = new Float64Array(dim);
  return { L, Nup, Ndn, du, dd, dim, bu, bd, diagU, diagPot, offsets, targets, signs, nnz };
}

/* ---------- 外场：把 μ_i 烘进对角项 ----------
   mu 可为 null（清场）或长度 L 的数组。**不重建跃迁表**，只重写 diagPot。 */
export function hbSetField(sec, mu){
  const { L, du, dd, diagPot, bu, bd } = sec;
  if (!mu){
    diagPot.fill(0); sec.field = null;
    return diagPot;
  }
  if (mu.length !== L) throw new Error('hbSetField: mu 长度须为 L');
  /* 单自旋扇区上的 φ = Σ_{i∈mask} μ_i：按位迭代，O(占据数) 而非 O(L) */
  const phi = (basis, out) => {
    for (let k = 0; k < basis.dim; k++){
      let m = basis.masks[k], s = 0;
      while (m){ const bit = m & -m; s += mu[31 - Math.clz32(bit)]; m ^= bit; }
      out[k] = s;
    }
  };
  const fu = new Float64Array(du), fd = new Float64Array(dd);
  phi(bu, fu); phi(bd, fd);
  for (let a = 0; a < du; a++){
    const base = a * dd, va = fu[a];
    for (let b = 0; b < dd; b++) diagPot[base + b] = va + fd[b];
  }
  sec.field = Float64Array.from(mu);
  return diagPot;
}

/* 初态：按每格占据码（0=空 1=↑ 2=↓ 3=↑↓）建乘积态 */
export function hbProductFromPattern(sec, pattern){
  const up = [], dn = [];
  for (let i = 0; i < sec.L; i++){
    const c = pattern[i] | 0;
    if (c & 1) up.push(i);
    if (c & 2) dn.push(i);
  }
  /* 图案必须落在扇区里：粒子数不符时 bu.index 查不到（-1）⟹ 写进 re[-1] 被丢弃、
     得到一个**全零向量**（画面上表现为「什么都没了」）。这里直接说清楚，不静默。 */
  if (up.length !== sec.Nup || dn.length !== sec.Ndn){
    throw new Error(`hbProductFromPattern: 图案粒子数 (${up.length},${dn.length}) 与扇区 (${sec.Nup},${sec.Ndn}) 不符`);
  }
  const w = hbInitProduct(sec, up, dn);
  return Object.assign(w, { nUp: up.length, nDn: dn.length });
}

/* ---------- H·ψ（re/im 分离；H 实对称 ⟹ 两通道同一算子） ---------- */
export function hbMatvec(sec, re, im, outRe, outIm, t, U){
  const { dim, offsets, targets, signs, diagU, diagPot } = sec;
  for (let k = 0; k < dim; k++){
    const d = U * diagU[k] + diagPot[k];
    let sr = d * re[k], si = d * im[k];
    for (let p = offsets[k]; p < offsets[k + 1]; p++){
      const c = -t * signs[p], tg = targets[p];
      sr += c * re[tg]; si += c * im[tg];
    }
    outRe[k] = sr; outIm[k] = si;
  }
}
export function hbNorm(re, im){
  let n = 0;
  for (let k = 0; k < re.length; k++) n += re[k] * re[k] + im[k] * im[k];
  return n;
}
export function hbDot(ar, ai, br, bi){
  let s = 0;
  for (let k = 0; k < ar.length; k++) s += ar[k] * br[k] + ai[k] * bi[k];
  return s;
}
export function hbEnergy(sec, re, im, t, U){
  const hr = new Float64Array(re.length), hi = new Float64Array(im.length);
  hbMatvec(sec, re, im, hr, hi, t, U);
  return hbDot(re, im, hr, hi);
}

/* ---------- 测量：逐格占据 / 双占 ---------- */
export function hbMeasure(sec, re, im){
  const { L, bu, bd, dd } = sec;
  const nU = new Float64Array(L), nD = new Float64Array(L), nT = new Float64Array(L);
  const dbl = new Float64Array(L);   /* 逐格 ⟨n_i↑ n_i↓⟩（与 Dtot 独立求和，可互校） */
  let Dtot = 0;
  for (let a = 0; a < bu.dim; a++){
    const mu = bu.masks[a];
    for (let b = 0; b < bd.dim; b++){
      const k = a * dd + b;
      const p = re[k] * re[k] + im[k] * im[k];
      if (p < 1e-30) continue;
      const md = bd.masks[b];
      const both = mu & md;
      Dtot += p * popcount(both);
      for (let i = 0; i < L; i++){
        if (mu & (1 << i)) nU[i] += p;
        if (md & (1 << i)) nD[i] += p;
      }
      let bm = both;   /* 双占逐格累加：只走同时被两自旋占据的位 */
      while (bm){ const bit = bm & -bm; dbl[31 - Math.clz32(bit)] += p; bm ^= bit; }
    }
  }
  for (let i = 0; i < L; i++) nT[i] = nU[i] + nD[i];
  return { nU, nD, nT, dbl, Dtot };
}

/* ---------- 实对称 Jacobi 对角化（循环法，标准旋转；返回本征值/本征向量） ----------
   旋转公式：τ=(a_qq−a_pp)/(2a_pq)、t=sgn(τ)/(|τ|+√(1+τ²))、c=1/√(1+t²)、s=tc；
   对 k≠p,q 更新行列并写回对称位置，然后**显式置零** a_pq（不置零则 off() 不收敛）。 */
export function jacobiEigen(Ain, maxSweep = 50){
  const n = Ain.length;
  const A = Ain.map(r => Float64Array.from(r));
  const V = [];
  for (let i = 0; i < n; i++){ const v = new Float64Array(n); v[i] = 1; V.push(v); }
  const off = () => {
    let s = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += A[i][j] * A[i][j];
    return Math.sqrt(s);
  };
  for (let sweep = 0; sweep < maxSweep; sweep++){
    if (off() < 1e-13) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++){
      const apq = A[p][q];
      if (Math.abs(apq) < 1e-16) continue;
      const tau = (A[q][q] - A[p][p]) / (2 * apq);
      const tS = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + tS * tS), s = tS * c;
      for (let k = 0; k < n; k++){
        if (k === p || k === q) continue;
        const akp = A[k][p], akq = A[k][q];
        A[k][p] = c * akp - s * akq; A[p][k] = A[k][p];
        A[k][q] = s * akp + c * akq; A[q][k] = A[k][q];
      }
      A[p][p] -= tS * apq; A[q][q] += tS * apq;
      A[p][q] = 0; A[q][p] = 0;
      for (let k = 0; k < n; k++){
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { val: Float64Array.from({ length: n }, (_, i) => A[i][i]), vec: V };
}

/* ---------- Lanczos 基态（分帧任务；全重正交） ---------- */
/* 基态任务 = 公共 Lanczos 内核（edbase.js）+ 本页的 matvec / Ritz 解法。
   参数与行为逐位保留：实模式（H 实对称 + 实种子 ⟹ Krylov 基虚部恒 0，只存实部，
   内存减半 ⟹ L=12 同内存下 m 从 52 翻到 110）、**两遍 Gram–Schmidt**（Lanczos 基失
   正交通常是小规模 ED 的头号精度杀手）、按内存预算裁 m 并暴露 mMax / mCapped。
   公共内核另外给出 residual（多一次 matvec），页面与测试可直接读。 */
export class HbGsTask extends EdLanczosTask {
  constructor(sec, t, U, opts = {}){
    super(sec.dim, (re, im, outR, outI) => hbMatvec(sec, re, im, outR, outI, t, U),
      { maxMemMB: 640, ...opts, fullOrtho: true, eig: hbEig });
    this.sec = sec; this.t = t; this.U = U;
  }
  step(n = 1){ super.step(n); return { iter: this.iter, done: this.done, energy: this.energy }; }
}

/* ---------- Krylov 指数：exp(−iH·dt)ψ（m 步 Lanczos + 三对角本征分解） ---------- */
export function hbKrylovExp(sec, re, im, t, U, dt, m = 12){
  /* 实现搬进 edbase.js（与自旋链页共用）：归一化 → m 步三项递推 → 三对角本征分解 →
     ψ' = Σ_j c_j V_j，c_j = Σ_k V[j][k]·V[0][k]·e^{−iλ_k dt}。 */
  return edKrylovExp(sec.dim, (ar, ai, br, bi) => hbMatvec(sec, ar, ai, br, bi, t, U), re, im, dt, m, hbEig);
}

/* ---------- 对称矩阵**特征值**（Householder 三对角化 + 隐式 QL，O(n³/3)） ----------
   熵只需要 Gram 的谱、不需要特征向量，所以走「只求值」路径：比 jacobiEigen（每个 sweep
   都 O(n³)、要 40 个 sweep）快一到两个数量级——这是 L=12 静态档能做出来的前提
   （n=400 的块从 21 s 降到秒级；L=10 中心切点 401 ms → 十几毫秒）。
   算法：EISPACK tred2（不累积变换）+ tql2（不累积特征向量）。返回**未排序**的特征值。 */
export function symEigVals(Ain){
  const n = Ain.length;
  const A = Array.from({ length: n }, (_, i) => Float64Array.from(Ain[i]));
  const d = new Float64Array(n), e = new Float64Array(n);
  const v = new Float64Array(n), w = new Float64Array(n);
  /* Householder：逐列把次对角以下清零，相似变换 P A P 保持谱 */
  for (let k = 0; k < n - 2; k++){
    let norm = 0;
    for (let i = k + 1; i < n; i++) norm += A[i][k] * A[i][k];
    norm = Math.sqrt(norm);
    d[k] = A[k][k];
    if (norm === 0){ e[k] = 0; continue; }
    const alpha = A[k + 1][k] >= 0 ? -norm : norm;
    e[k] = alpha;
    v.fill(0, k + 1, n);
    v[k + 1] = 1;
    const den = A[k + 1][k] - alpha;
    for (let i = k + 2; i < n; i++) v[i] = A[i][k] / den;
    let vv = 0;
    for (let i = k + 1; i < n; i++) vv += v[i] * v[i];
    for (let i = k + 1; i < n; i++){
      let acc = 0;
      const Ai = A[i];
      for (let j = k + 1; j < n; j++) acc += Ai[j] * v[j];
      w[i] = acc;
    }
    let vw = 0;
    for (let i = k + 1; i < n; i++) vw += v[i] * w[i];
    const c1 = 2 / vv, c2 = c1 * c1 * vw;
    for (let i = k + 1; i < n; i++){
      const vi = v[i], wi = w[i];
      for (let j = i; j < n; j++){
        const delta = c1 * (vi * w[j] + wi * v[j]) - c2 * vi * v[j];
        const s2 = A[i][j] - delta;
        A[i][j] = s2; A[j][i] = s2;
      }
    }
  }
  if (n >= 2){
    d[n - 2] = A[n - 2][n - 2];
    e[n - 2] = A[n - 1][n - 2];
  }
  d[n - 1] = A[n - 1][n - 1];
  e[n - 1] = 0;
  /* 隐式位移 QL（tql2，只求值）。deflation 判据必须带**矩阵量级**的绝对底：
     只看 |d[m]|+|d[m+1]| 时，零本征值处的 dd=0 ⟹ 判据永真不成立（秩亏 Gram 会死循环到迭代上限）。 */
  let anorm = 0;
  for (let i = 0; i < n; i++) anorm = Math.max(anorm, Math.abs(d[i]), Math.abs(e[i]));
  if (!Number.isFinite(anorm)) throw new Error('symEigVals: 矩阵含 NaN/Inf（多半是态向量与扇区不匹配）');
  const absTol = 1e-16 * (anorm || 1);
  for (let l = 0; l < n; l++){
    let iter = 0, m = l;
    for (;;){
      for (m = l; m < n - 1; m++){
        /* 相对判据 + 绝对底：Gram 是**秩亏**的（Schmidt 块的秩 ≤ 较小侧维数），
           严格判据 |e|+dd===dd 在秩亏块上永不清零 ⟹ 会耗尽迭代次数。 */
        const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
        if (Math.abs(e[m]) <= 1e-16 * dd + absTol) break;
      }
      if (m === l) break;
      if (iter++ === 200) throw new Error('symEigVals: 200 次 QL 迭代未收敛');
      let g = (d[l + 1] - d[l]) / (2 * e[l]);
      let r = Math.hypot(g, 1);
      g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
      let s = 1, c = 1, p = 0;
      let broke = false;
      for (let i = m - 1; i >= l; i--){
        const f = s * e[i], b = c * e[i];
        r = Math.hypot(f, g); e[i + 1] = r;
        if (r === 0){ d[i + 1] -= p; e[m] = 0; broke = true; break; }
        s = f / r; c = g / r; g = d[i + 1] - p;
        r = (d[i] - g) * s + 2 * c * b;
        p = s * r; d[i + 1] = g + p; g = c * r - b;
      }
      if (broke) continue;
      d[l] -= p; e[l] = g; e[m] = 0;
    }
  }
  return d;
}

/* ---------- 纠缠熵（任意切点，块对角 Schmidt 分解） ----------
   切点 cut 把链分成左 cut 格 / 右 L−cut 格。对 (k↑_L,k↓_L) 每个块：
   A[row=(lU,lD)][col=(rU,rD)]=ψ（Schmidt 矩阵），谱 = √(A A† 的本征值)。
   复矩阵的实嵌入 [[Re,−Im],[Im,Re]] 让每个本征值出现**两次**（排序后隔一取）。
   **取较小的一侧**：cut 偏离中心时对面块更小，AA† 与 A†A 非零谱相同 ⟹ 用
   n=min(nL,nR) 的 Gram 矩阵，靠边切点由数百毫秒降到亚毫秒级（S(x) 剖面靠这条）。
   cut=0 或 L 时有一侧为空 ⟹ S=0。 */
export function hbEntropyAt(sec, re, im, cut){
  const { L, bu, bd, dd } = sec;
  if (!(cut > 0 && cut < L)) return { S: 0, spectrum: [], sum: 0 };
  const lowMask = (1 << cut) - 1;
  const blocks = new Map();
  for (let a = 0; a < bu.dim; a++){
    const mu = bu.masks[a], ml = mu & lowMask, mr = mu >> cut;
    for (let b = 0; b < bd.dim; b++){
      const k = a * dd + b;
      const p = re[k] * re[k] + im[k] * im[k];
      if (p < 1e-28) continue;
      const md = bd.masks[b], mdl = md & lowMask, mdr = md >> cut;
      const key = popcount(ml) + ',' + popcount(mdl);
      let blk = blocks.get(key);
      if (!blk){ blk = { lu: new Map(), ld: new Map(), ru: new Map(), rd: new Map(), entries: [] }; blocks.set(key, blk); }
      if (!blk.lu.has(ml)) blk.lu.set(ml, blk.lu.size);
      if (!blk.ld.has(mdl)) blk.ld.set(mdl, blk.ld.size);
      if (!blk.ru.has(mr)) blk.ru.set(mr, blk.ru.size);
      if (!blk.rd.has(mdr)) blk.rd.set(mdr, blk.rd.size);
      blk.entries.push([ml, mdl, mr, mdr, re[k], im[k]]);
    }
  }
  let S = 0;
  let spectrum = [];
  for (const blk of blocks.values()){
    const Lu = blk.lu.size, Ld = blk.ld.size, Ru = blk.ru.size, Rd = blk.rd.size;
    const nL = Lu * Ld, nR = Ru * Rd;
    /* 只在非零行/列上建稠密块（nL,nR ≤ C(L/2,·)²，L=10 时 ≤100） */
    const Ar = Array.from({ length: nL }, () => new Float64Array(nR));
    const Ai = Array.from({ length: nL }, () => new Float64Array(nR));
    for (const [ml, mdl, mr, mdr, ar, ai] of blk.entries){
      Ar[blk.lu.get(ml) * Ld + blk.ld.get(mdl)][blk.ru.get(mr) * Rd + blk.rd.get(mdr)] = ar;
      Ai[blk.lu.get(ml) * Ld + blk.ld.get(mdl)][blk.ru.get(mr) * Rd + blk.rd.get(mdr)] = ai;
    }
    /* Gram 取较小一侧：nL ≤ nR 用 A A†（行×行），否则用 A†A（列×列）。
       两者非零谱完全相同 ⟹ S 不变，cost 从 O(nL²·nR) 降到 O(n²·max(nL,nR))。 */
    const left = nL <= nR;
    const n = left ? nL : nR;
    const n2 = 2 * n;
    const M = Array.from({ length: n2 }, () => new Float64Array(n2));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
      let rr = 0, ri = 0;
      if (left){
        for (let c = 0; c < nR; c++){
          rr += Ar[i][c] * Ar[j][c] + Ai[i][c] * Ai[j][c];
          ri += Ai[i][c] * Ar[j][c] - Ar[i][c] * Ai[j][c];
        }
      } else {
        for (let c = 0; c < nL; c++){
          rr += Ar[c][i] * Ar[c][j] + Ai[c][i] * Ai[c][j];
          ri += Ar[c][i] * Ai[c][j] - Ai[c][i] * Ar[c][j];
        }
      }
      M[i][j] = rr; M[i][j + n] = -ri; M[i + n][j] = ri; M[i + n][j + n] = rr;
    }
    const val = symEigVals(M);
    /* 只求特征值（不需要特征向量）⟹ symEigVals；实嵌入 [[Re,−Im],[Im,Re]] 的
       本征值 = ρ 的每个本征值**各二重**（不是折半！
       首版 val/2 再取前 nL：乘积态会得 Σλ=0.5、S=0.347 而非 0）。排序后隔一取
       即得物理谱；物理简并（自旋 SU(2)）会给出 4 重，隔一后仍恰为 2 重 ✓。 */
    const vals = Array.from(val).sort((a, b) => b - a);
    for (let i = 0; i < vals.length; i += 2){
      const lam = vals[i];
      if (lam > 1e-13){ S -= lam * Math.log(lam); spectrum.push(lam); }
    }
  }
  spectrum.sort((a, b) => b - a);
  return { S, spectrum: spectrum.slice(0, 12), sum: spectrum.reduce((a, b) => a + b, 0) };
}
/* 半链熵 = cut=L/2 的特例（L 偶数） */
export function hbEntropy(sec, re, im){ return hbEntropyAt(sec, re, im, sec.L >> 1); }
/* 整条剖面 S(x)：x=0 与 x=L 没有切分 ⟹ S=0。L=8 全扫 ~40ms、L=10 ~0.6s ⟹ 页面渐进填充 */
export function hbEntropyProfile(sec, re, im){
  const L = sec.L, out = new Float64Array(L + 1);
  for (let c = 1; c < L; c++) out[c] = hbEntropyAt(sec, re, im, c).S;
  return out;
}

/* ---------- 密度关联 ⟨n_i n_j⟩（对角观测量，无需跳跃，O(dim·(N↑+N↓)²)） ----------
   n_i = n_i↑+n_i↓ ∈ {0,1,2} ⟹ 对单个基底态 n_i n_j = cnt_i·cnt_j（i≠j），
   多体效应全在求和权重里。注意 ⟨n_i²⟩ = n_i + 2⟨n_i↑n_i↓⟩ ≠ n_i（与单粒子 ρ_ii 的区别）。 */
export function hbDensityCorr(sec, re, im){
  const { L, bu, bd, dd } = sec;
  const C = new Float64Array(L * L);
  const cnt = new Int32Array(L);
  for (let a = 0; a < bu.dim; a++){
    const mu = bu.masks[a];
    for (let b = 0; b < bd.dim; b++){
      const k = a * dd + b;
      const p = re[k] * re[k] + im[k] * im[k];
      if (p < 1e-30) continue;
      const md = bd.masks[b];
      let nn = 0;
      for (let i = 0; i < L; i++){
        const c = ((mu >> i) & 1) + ((md >> i) & 1);
        cnt[i] = c;
        if (c) nn++;
      }
      for (let i = 0; i < L; i++){
        const ci = cnt[i];
        if (!ci) continue;
        C[i * L + i] += p * ci * ci;
        for (let j = i + 1; j < L; j++){
          if (!cnt[j]) continue;
          const v = p * ci * cnt[j];
          C[i * L + j] += v; C[j * L + i] += v;
        }
      }
      void nn;
    }
  }
  return C;
}

/* ---------- 动量分布 n(k_m) = (1/L)Σ_ij e^{ik(i−j)}ρ_ij，k = 2πm/L ----------
   求和规则 Σ_m n(k_m) = Σ_i ρ_ii = N（测试用这条钉归一）。 */
export function hbMomentumDist(rho, L, m){
  const { Cr, Ci } = rho;
  const k = 2 * Math.PI * m / L;
  let s = 0;
  for (let i = 0; i < L; i++){
    for (let j = 0; j < L; j++){
      const th = k * (i - j), c = Math.cos(th), sn = Math.sin(th);
      s += c * Cr[i][j] - sn * Ci[i][j];
    }
  }
  return s / L;
}

/* ---------- 单粒子密度矩阵 ρ_ij = Σ_σ ⟨c†_{iσ} c_{jσ}⟩（复；对角 = n_i） ----------
   约定：Cr/Ci 表示 ρ_ij = ⟨c†_i c_j⟩（**不是**转置），ρ† = ρ ⟹ Cr 对称、Ci 反对称；
   pot140 用「独立实现参考值 + 厄米性 + U=0 自由费米子解析式」三重校验这条约定。 */
export function hbCorrelation(sec, re, im){
  const { L, bu, bd, dd } = sec;
  const Cr = Array.from({ length: L }, () => new Float64Array(L));
  const Ci = Array.from({ length: L }, () => new Float64Array(L));
  const hopOne = (mask, i, j) => {
    const bi = 1 << i, bj = 1 << j;
    if (!(mask & bj) || (mask & bi)) return null;
    const lo = Math.min(i, j), hi = Math.max(i, j);
    const mid = ((1 << hi) - 1) ^ ((1 << (lo + 1)) - 1);
    return [mask ^ bi ^ bj, (popcount(mask & mid) % 2) ? -1 : 1];
  };
  for (let a = 0; a < bu.dim; a++){
    const mu = bu.masks[a];
    for (let b = 0; b < bd.dim; b++){
      const k = a * dd + b;
      const pr = re[k], pi = im[k], p = pr * pr + pi * pi;
      if (p < 1e-30) continue;
      const md = bd.masks[b];
      for (let i = 0; i < L; i++){
        if (mu & (1 << i)) Cr[i][i] += p;
        if (md & (1 << i)) Cr[i][i] += p;
      }
      for (let i = 0; i < L; i++) for (let j = 0; j < L; j++){
        if (i === j) continue;
        const hu = hopOne(mu, i, j);
        if (hu){
          const k2 = bu.index[hu[0]] * dd + b;
          /* ⟨n|c†_i c_j|m⟩ = sign ⟹ 贡献 ψ*_n ψ_m·sign */
          const sg = hu[1] * 1;
          Cr[i][j] += (pr * re[k2] + pi * im[k2]) * sg;
          Ci[i][j] += (pr * im[k2] - pi * re[k2]) * sg;
        }
        const hd = hopOne(md, i, j);
        if (hd){
          const k2 = a * dd + bd.index[hd[0]];
          const sg = hd[1] * 1;
          Cr[i][j] += (pr * re[k2] + pi * im[k2]) * sg;
          Ci[i][j] += (pr * im[k2] - pi * re[k2]) * sg;
        }
      }
    }
  }
  return { Cr, Ci };
}

/* ---------- 初态 ---------- */
/* 指定格点集合上的单一乘积态（左半链填充等） */
export function hbInitProduct(sec, sitesU, sitesD){
  const { bu, bd } = sec;
  let mu = 0, md = 0;
  for (const i of sitesU) mu |= 1 << i;
  for (const i of sitesD) md |= 1 << i;
  const a = bu.index[mu], b = bd.index[md];
  const re = new Float64Array(sec.dim), im = new Float64Array(sec.dim);
  if (a < 0 || b < 0) return { re, im, ok: false };
  re[a * sec.dd + b] = 1;
  return { re, im, ok: true };
}

/* ---------- 预设 ---------- */
export const HB_PRESETS = {
  mott: {
    name: '莫特绝缘体',
    text: '半满（N↑=N↓=L/2）基态：U=0 是金属（双占 D>0、占据均匀）；U≫t 时电荷涨落冻结、每格恰好一个电子（D→0）成为**莫特绝缘体**——不是能带填充，而是相互作用把电荷冻住。拖 U/t 看 D 与占据剖面；「算能隙」额外解 (N↑±1,N↓) 两个扇区给电荷能隙 Δ=E(+1)+E(−1)−2E(0)。**同自旋两费米子不能同格**是基构造的结构性事实（每格每自旋 0/1），U 只惩罚 ↑↓ 同格。',
  },
  quench: {
    name: '猝变纠缠增长',
    text: '初态 = **奈尔态**（↑ 偶格、↓ 奇格；乘积态 ⟹ S(0)=0，无相干项 ⟹ ⟨H⟩=0），t=0 起按当前 U 自由演化：局域相互作用把定域态迅速「弄脏」，半链纠缠熵 S(t) 从 0 **近似线性增长**、在 t~L/2 后饱和——纠缠不是瞬间建立的，而是由准空穴对沿链传播逐点生成（面板给早窗 t≤L/3 的拟合斜率；1D 可积/非可积的对数 vs 线性之争本轮只作定性展示，斜率随 U/t 变化）。**注意**：用 U=0 基态当初态时 S(0)≈1.5 且几乎立即饱和（小系统有效维度耗尽），演示不出线性段——这是换奈尔态的原因。',
  },
};

/* ---------- 最近邻键关联 J_i = Σ_σ Re⟨c†_{i+1} c_i⟩（L−1 个；动能分布） ----------
   只算键（而非全 L² 矩阵）：成本 dim×(L−1)×2，L=10 半满 63504 维 ~30–50ms，
   可每 20 帧刷新；全关联矩阵是 O(dim·L²)，L=10 会到 0.3s，本页不提供（诚实标注）。 */
export function hbBondCorr(sec, re, im, t){
  const { L, bu, bd, dd } = sec;
  const out = new Float64Array(Math.max(0, L - 1));
  const hopOne = (mask, i, j) => {
    const bi = 1 << i, bj = 1 << j;
    if (!(mask & bj) || (mask & bi)) return null;
    const lo = Math.min(i, j), hi = Math.max(i, j);
    const mid = ((1 << hi) - 1) ^ ((1 << (lo + 1)) - 1);
    return [mask ^ bi ^ bj, (popcount(mask & mid) % 2) ? -1 : 1];
  };
  for (let a = 0; a < bu.dim; a++){
    const mu = bu.masks[a];
    for (let b = 0; b < bd.dim; b++){
      const k = a * dd + b;
      const pr = re[k], pi = im[k], p = pr * pr + pi * pi;
      if (p < 1e-30) continue;
      const md = bd.masks[b];
      for (let s = 0; s < L - 1; s++){
        const hu = hopOne(mu, s, s + 1);
        if (hu){
          const k2 = bu.index[hu[0]] * dd + b;
          out[s] += (pr * re[k2] + pi * im[k2]) * hu[1];
        }
        const hd = hopOne(md, s, s + 1);
        if (hd){
          const k2 = a * dd + bd.index[hd[0]];
          out[s] += (pr * re[k2] + pi * im[k2]) * hd[1];
        }
      }
    }
  }
  /* 关联 J 的符号约定：⟨c†_{i+1}c_i⟩ 的实部；乘 −t 即该键的动能贡献 */
  return out;
}

/* ---------- 残差 ‖Hψ − Eψ‖（收敛自检：L=12 静态档靠它说真话） ---------- */
export function hbResidual(sec, re, im, t, U){
  const dim = sec.dim;
  const hr = new Float64Array(dim), hi = new Float64Array(dim);
  hbMatvec(sec, re, im, hr, hi, t, U);
  const E = hbEnergy(sec, re, im, t, U);
  let s = 0;
  for (let k = 0; k < dim; k++){
    const dr = hr[k] - E * re[k], di = hi[k] - E * im[k];
    s += dr * dr + di * di;
  }
  return Math.sqrt(s);
}

/* ---------- 淬变跑者：从乘积态出发按 exp(−iHt) 走，按时间采 S/D/E ----------
   页面「从初态演化」与 U/t 扫描共用同一条代码路径（一处物理，不会被两套实现拉偏）。
   `uOf(t)` 给协议用（U 随时间走）；`muOf(t)` 返回逐格 μ（也用于协议）。
   采样开销：S 走 hbEntropy（L=8 一次 ~50ms、L=10 ~140ms、L=12 ~2.8s）⟹ 采样间隔
   默认 0.5，L≥12 时调用方应把 sample 调大或关掉 S。 */
export class HbQuenchRun {
  constructor(sec, re, im, opts = {}){
    this.sec = sec;
    this.re = Float64Array.from(re); this.im = Float64Array.from(im);
    this.t = opts.t ?? 1; this.dt = opts.dt ?? 0.1;
    this.tMax = opts.tMax ?? 10; this.sample = opts.sample ?? 0.5;
    this.U = opts.U ?? 4; this.uOf = opts.uOf || null; this.muOf = opts.muOf || null;
    this.mK = opts.mKrylov ?? 10;
    this.tcur = 0; this.nextT = this.sample; this.done = false;
    this.records = []; this.uNow = this.U; this.steps = 0;
    /* 先把 t=0 的初态记进去：淬变曲线必须包含起点（否则第一点已经是走了一步之后，
       像「奈尔态 D(0)=0.13」这种读数会莫名其妙） */
    this.records.push(this.measure());
  }
  step(n = 1){
    for (let k = 0; k < n && !this.done; k++){
      const U = this.uOf ? this.uOf(this.tcur) : this.U;
      if (this.muOf) hbSetField(this.sec, this.muOf(this.tcur));
      const o = hbKrylovExp(this.sec, this.re, this.im, this.t, U, this.dt, this.mK);
      this.re = o.re; this.im = o.im;
      this.tcur += this.dt; this.steps++; this.uNow = U;
      if (this.tcur + 1e-9 >= this.nextT){
        this.records.push(this.measure());
        this.nextT += this.sample;
      }
      if (this.tcur >= this.tMax - 1e-9)this.done = true;
    }
    return { done: this.done, t: this.tcur, samples: this.records.length };
  }
  measure(){
    const m = hbMeasure(this.sec, this.re, this.im);
    return {
      t: this.tcur, U: this.uNow, D: m.Dtot,
      E: hbEnergy(this.sec, this.re, this.im, this.t, this.uNow),
      S: hbEntropy(this.sec, this.re, this.im).S,
    };
  }
}

/* ---------- U/t 扫描：每个 U 先解基态（给 S_gs/D_gs），再从奈尔态淬变（给 S 饱和值/早窗斜率） ----------
   分片执行（step(budgetMs)），页面在帧里推 ⟹ 扫描期间 UI 不冻。
   诚实口径：早窗斜率 t≤L/3 的线性拟合（小系统很快饱和）；S_sat 取最后 25% 窗口均值。 */
export class HbScanTask {
  constructor(sec, opts = {}){
    this.sec = sec;
    this.Us = opts.Us ?? [0, 1, 2, 3, 4, 6, 8];
    this.dt = opts.dt ?? 0.1;
    this.tMax = opts.tMax ?? 10;
    this.sample = opts.sample ?? 0.5;
    this.mK = opts.mKrylov ?? 10;
    this.gsM = opts.gsM ?? 60;
    this.gsMaxMemMB = opts.gsMaxMemMB ?? 640;
    this.idx = 0; this.phase = 'gs'; this.run = null; this.gs = null;
    this.results = []; this.done = this.Us.length === 0; this.ms = 0;
    this.pattern = opts.pattern || Int8Array.from({ length: sec.L }, (_, i) => (i % 2 === 0 ? 1 : 2));
  }
  get progress(){ return { idx: this.idx, n: this.Us.length, phase: this.phase, done: this.done }; }
  step(budgetMs = 20){
    const t0 = Date.now();
    while (!this.done && Date.now() - t0 < budgetMs){
      const U = this.Us[this.idx];
      if (this.phase === 'gs'){
        if (!this.gs){
          this.gs = new HbGsTask(this.sec, 1, U, { m: this.gsM, maxMemMB: this.gsMaxMemMB });
        }
        this.gs.step(4);
        if (this.gs.done){
          const w = { re: this.gs.re, im: this.gs.im };
          const mm = hbMeasure(this.sec, w.re, w.im);
          this.gsVals = {
            E: hbEnergy(this.sec, w.re, w.im, 1, U),
            D: mm.Dtot,
            S: hbEntropy(this.sec, w.re, w.im).S,
            res: hbResidual(this.sec, w.re, w.im, 1, U),
            m: this.gs.iter, mCapped: this.gs.mCapped,
          };
          const prod = hbProductFromPattern(this.sec, this.pattern);
          this.run = new HbQuenchRun(this.sec, prod.re, prod.im,
            { U, dt: this.dt, tMax: this.tMax, sample: this.sample, mKrylov: this.mK });
          this.phase = 'quench';
        }
      } else {
        this.run.step(1);
        if (this.run.done){
          this.results.push(this.reduce(U));
          this.gs = null; this.run = null; this.phase = 'gs'; this.idx++;
          if (this.idx >= this.Us.length) this.done = true;
        }
      }
    }
    return this.progress;
  }
  reduce(U){
    const rec = this.run.records;
    const L = this.sec.L;
    const tMax = rec.length ? rec[rec.length - 1].t : 0;
    const tail = rec.filter(r => r.t >= tMax * 0.75);
    const Ssat = tail.reduce((a, r) => a + r.S, 0) / Math.max(1, tail.length);
    const win = rec.filter(r => r.t <= L / 3);
    let slope = 0;
    if (win.length > 2){
      const n = win.length;
      const mx = win.reduce((a, r) => a + r.t, 0) / n, my = win.reduce((a, r) => a + r.S, 0) / n;
      let sxy = 0, sxx = 0;
      for (const r of win){ sxy += (r.t - mx) * (r.S - my); sxx += (r.t - mx) ** 2; }
      slope = sxx > 0 ? sxy / sxx : 0;
    }
    return {
      U, Ssat, slope,
      D: rec.length ? rec[rec.length - 1].D : NaN,
      E: rec.length ? rec[rec.length - 1].E : NaN,
      curve: rec.map(r => [r.t, r.S]),
      Sgs: this.gsVals.S, Dgs: this.gsVals.D, Egs: this.gsVals.E,
      res: this.gsVals.res, m: this.gsVals.m, mCapped: this.gsVals.mCapped,
    };
  }
}
