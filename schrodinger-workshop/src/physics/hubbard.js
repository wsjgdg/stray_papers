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
  /* 每态跃迁（↑ 与 ↓）：先数再填（CSR 两遍） */
  const hopOne = (mask, i, j) => {
    const bi = 1 << i, bj = 1 << j;
    if (!(mask & bj) || (mask & bi)) return null;
    const lo = Math.min(i, j);
    const sign = (popcount(mask & (lo ? (1 << lo) - 1 : 0)) % 2) ? -1 : 1;
    return [mask ^ bi ^ bj, sign];
  };
  const offsets = new Int32Array(dim + 1);
  const tmp = [];   /* [stateIdx, target, sign] */
  for (let a = 0; a < du; a++) for (let b = 0; b < dd; b++){
    const k = a * dd + b;
    const mu = bu.masks[a], md = bd.masks[b];
    for (let s = 0; s < L - 1; s++){
      /* 每个键要**两个方向**：hopOne(mask,i,j) 实现 c†_i c_j（j 占、i 空），
         只写单向会让 H 非厄米（R73 首版即此：2 格点解析解全错、Lanczos NaN）。 */
      for (const [i, j] of [[s, s + 1], [s + 1, s]]){
        const hu = hopOne(mu, i, j);
        if (hu){ tmp.push([k, bu.index[hu[0]] * dd + b, hu[1]]); }
        const hd = hopOne(md, i, j);
        if (hd){ tmp.push([k, a * dd + bd.index[hd[0]], hd[1]]); }
      }
    }
  }
  const nnz = tmp.length;
  const targets = new Int32Array(nnz), signs = new Int8Array(nnz);
  for (const [k, tg, sg] of tmp){ offsets[k + 1]++; }
  for (let k = 0; k < dim; k++) offsets[k + 1] += offsets[k];
  const cursor = Int32Array.from(offsets.subarray(0, dim));
  for (const [k, tg, sg] of tmp){ targets[cursor[k]] = tg; signs[cursor[k]] = sg; cursor[k]++; }
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
export class HbGsTask {
  constructor(sec, t, U, opts = {}){
    this.sec = sec; this.t = t; this.U = U; this.m = opts.m ?? 80;
    const dim = sec.dim;
    const re = new Float64Array(dim), im = new Float64Array(dim);
    let s = opts.seed ?? 12345;
    for (let k = 0; k < dim; k++){ s = (s * 16807) % 2147483647; re[k] = (s / 2147483647) - 0.5; }
    const nn = Math.sqrt(hbNorm(re, im));
    for (let k = 0; k < dim; k++) re[k] /= nn;
    this.re = re; this.im = im;
    this.V = []; this.alpha = []; this.beta = [];
    this.iter = 0; this.done = false; this.energy = NaN;
  }
  step(n = 1){
    const { sec, t, U, m } = this;
    const dim = sec.dim;
    for (let it = 0; it < n && !this.done; it++){
      const vr = this.iter === 0 ? Float64Array.from(this.re) : this._nextR;
      const vi = this.iter === 0 ? Float64Array.from(this.im) : this._nextI;
      this.V.push([vr, vi]);
      /* w 必须**每步新分配**：若复用同一个缓冲，下一轮的 matvec 输出会覆盖
         上一轮存下的基向量（别名），多步调用时 beta 爆炸成 1e14/NaN——逐步
         调用因每次新建缓冲而掩盖（R73 首版即此）。 */
      const wR = new Float64Array(dim), wI = new Float64Array(dim);
      hbMatvec(sec, vr, vi, wR, wI, t, U);
      const a = hbDot(vr, vi, wR, wI);
      this.alpha.push(a);
      const prev = this.V.length > 1 ? this.V[this.V.length - 2] : null;
      const bprev = this.beta.length ? this.beta[this.beta.length - 1] : 0;
      for (let k = 0; k < dim; k++){
        wR[k] -= a * vr[k]; wI[k] -= a * vi[k];
        if (prev){ wR[k] -= bprev * prev[0][k]; wI[k] -= bprev * prev[1][k]; }
      }
      /* 两遍 Gram–Schmidt（Lanczos 基失正交通常是小规模 ED 的头号精度杀手） */
      for (let pass = 0; pass < 2; pass++){
        for (const [vjR, vjI] of this.V){
          const c = hbDot(vjR, vjI, wR, wI);
          if (c === 0) continue;
          for (let k = 0; k < dim; k++){ wR[k] -= c * vjR[k]; wI[k] -= c * vjI[k]; }
        }
      }
      const nb = Math.sqrt(hbNorm(wR, wI));
      this.beta.push(nb);
      this.iter++;
      if (nb < 1e-12 || this.iter >= m){
        this.done = true;
        this._extract();
      } else {
        for (let k = 0; k < dim; k++){ wR[k] /= nb; wI[k] /= nb; }
        this._nextR = wR; this._nextI = wI;
      }
    }
    return { iter: this.iter, done: this.done, energy: this.energy };
  }
  _extract(){
    const m = this.alpha.length;
    const T = [];
    for (let i = 0; i < m; i++){ T.push(new Float64Array(m)); T[i][i] = this.alpha[i]; }
    for (let i = 0; i + 1 < m; i++){ T[i][i + 1] = this.beta[i]; T[i + 1][i] = this.beta[i]; }
    const { val, vec } = jacobiEigen(T, 40);
    let imin = 0;
    for (let i = 1; i < m; i++) if (val[i] < val[imin]) imin = i;
    this.energy = val[imin];
    const dim = this.sec.dim;
    const re = new Float64Array(dim), im = new Float64Array(dim);
    for (let j = 0; j < m; j++){
      const c = vec[j][imin];
      if (c === 0) continue;
      const [vjR, vjI] = this.V[j];
      for (let k = 0; k < dim; k++){ re[k] += c * vjR[k]; im[k] += c * vjI[k]; }
    }
    const nn = Math.sqrt(hbNorm(re, im));
    for (let k = 0; k < dim; k++){ re[k] /= nn; im[k] /= nn; }
    this.re = re; this.im = im;
  }
}

/* ---------- Krylov 指数：exp(−iH·dt)ψ（m 步 Lanczos + 三对角本征分解） ---------- */
export function hbKrylovExp(sec, re, im, t, U, dt, m = 12){
  const dim = sec.dim;
  const nrm = Math.sqrt(hbNorm(re, im));
  if (nrm < 1e-300) return { re: Float64Array.from(re), im: Float64Array.from(im) };
  let curR = Float64Array.from(re, v => v / nrm), curI = Float64Array.from(im, v => v / nrm);
  const Vs = [], Ws = [], alpha = [], beta = [];
  const tmpR = new Float64Array(dim), tmpI = new Float64Array(dim);
  let steps = 0;
  for (let j = 0; j < m; j++){
    Vs.push(curR); Ws.push(curI);
    hbMatvec(sec, curR, curI, tmpR, tmpI, t, U);
    const a = hbDot(curR, curI, tmpR, tmpI);
    alpha.push(a);
    const prevR = j > 0 ? Vs[j - 1] : null, prevI = j > 0 ? Ws[j - 1] : null;
    const bprev = beta.length ? beta[beta.length - 1] : 0;
    for (let k = 0; k < dim; k++){
      tmpR[k] -= a * curR[k]; tmpI[k] -= a * curI[k];
      if (prevR){ tmpR[k] -= bprev * prevR[k]; tmpI[k] -= bprev * prevI[k]; }
    }
    const nb = Math.sqrt(hbNorm(tmpR, tmpI));
    steps = j + 1;
    if (nb < 1e-13) break;                 /* 不变子空间 */
    beta.push(nb);
    curR = new Float64Array(dim); curI = new Float64Array(dim);
    for (let k = 0; k < dim; k++){ curR[k] = tmpR[k] / nb; curI[k] = tmpI[k] / nb; }
  }
  const T = [];
  for (let i = 0; i < steps; i++){ T.push(new Float64Array(steps)); T[i][i] = alpha[i]; }
  for (let i = 0; i + 1 < steps; i++){ T[i][i + 1] = beta[i]; T[i + 1][i] = beta[i]; }
  const { val, vec } = jacobiEigen(T, 40);
  /* c_j = Σ_k V[j][k]·V[0][k]·e^{−iλ_k dt}：V[0][k]=⟨u_k|v_0⟩ 是初态在第 k 个
     本征矢上的投影——漏掉它系数不构成正交变换，范数会指数爆炸（R73 首版
     50 步涨到 1e53，Taylor 对照 maxdiff 2.3）。 */
  const cr = new Float64Array(steps), ci = new Float64Array(steps);
  for (let k = 0; k < steps; k++){
    const ph = -val[k] * dt, cp = Math.cos(ph), sp = Math.sin(ph);
    const w0 = vec[0][k];
    for (let j = 0; j < steps; j++){ const vjk = vec[j][k] * w0; cr[j] += vjk * cp; ci[j] += vjk * sp; }
  }
  const outR = new Float64Array(dim), outI = new Float64Array(dim);
  for (let j = 0; j < steps; j++){
    const wr = nrm * cr[j], wi = nrm * ci[j];
    const vr = Vs[j], vi = Ws[j];
    for (let k = 0; k < dim; k++){
      outR[k] += wr * vr[k] - wi * vi[k];
      outI[k] += wr * vi[k] + wi * vr[k];
    }
  }
  return { re: outR, im: outI };
}

/* ---------- 纠缠熵（半链，块对角 SVD；L 偶数） ----------
   对 (k↑_L,k↓_L) 每个块：A[row=(lU,lD)][col=(rU,rD)]=ψ；
   ρ=A A† → 实对称嵌入 [[Re,−Im],[Im,Re]]（本征值各二重）→ Jacobi；
   取前 nL 个本征值（重复项自然成对，前 nL 即唯一谱）⟹ Σλ=1。 */
export function hbEntropy(sec, re, im){
  const { L, bu, bd, dd } = sec;
  const half = L >> 1, lowMask = (1 << half) - 1;
  const blocks = new Map();
  for (let a = 0; a < bu.dim; a++){
    const mu = bu.masks[a], ml = mu & lowMask, mr = mu >> half;
    for (let b = 0; b < bd.dim; b++){
      const k = a * dd + b;
      const p = re[k] * re[k] + im[k] * im[k];
      if (p < 1e-28) continue;
      const md = bd.masks[b], mdl = md & lowMask, mdr = md >> half;
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
    const n2 = 2 * nL;
    const M = Array.from({ length: n2 }, () => new Float64Array(n2));
    for (let i = 0; i < nL; i++) for (let j = 0; j < nL; j++){
      let rr = 0, ri = 0;
      for (let c = 0; c < nR; c++){
        rr += Ar[i][c] * Ar[j][c] + Ai[i][c] * Ai[j][c];
        ri += Ai[i][c] * Ar[j][c] - Ar[i][c] * Ai[j][c];
      }
      M[i][j] = rr; M[i][j + nL] = -ri; M[i + nL][j] = ri; M[i + nL][j + nL] = rr;
    }
    const { val } = jacobiEigen(M, 40);
    /* 实嵌入 [[Re,−Im],[Im,Re]] 的本征值 = ρ 的每个本征值**各二重**（不是折半！
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

/* ---------- 关联矩阵 C_ij = Σ_σ ⟨c†_{iσ} c_{jσ}⟩（复；对角 = n_i） ---------- */
export function hbCorrelation(sec, re, im){
  const { L, bu, bd, dd } = sec;
  const Cr = Array.from({ length: L }, () => new Float64Array(L));
  const Ci = Array.from({ length: L }, () => new Float64Array(L));
  const hopOne = (mask, i, j) => {
    const bi = 1 << i, bj = 1 << j;
    if (!(mask & bj) || (mask & bi)) return null;
    const lo = Math.min(i, j);
    const sign = (popcount(mask & (lo ? (1 << lo) - 1 : 0)) % 2) ? -1 : 1;
    return [mask ^ bi ^ bj, sign];
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
    const lo = Math.min(i, j);
    const sign = (popcount(mask & (lo ? (1 << lo) - 1 : 0)) % 2) ? -1 : 1;
    return [mask ^ bi ^ bj, sign];
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
