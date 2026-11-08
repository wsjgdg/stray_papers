/* ============================================================================
 * edbase.js — 模型无关的「精确对角化」内核（哈伯德页与自旋链页共用）
 *
 * 背景：R73 的哈伯德页与 R144 的自旋链页是同一族机器——固定量子数扇区上的
 * 位掩码基 + CSR matvec + Lanczos 基态 + Krylov 指数演化 + Schmidt 熵。
 * 两个页面各自写了一份（hubbard.js 882 行 / spin.js 531 行），其中约 300 行
 * 是**只认 matvec 回调**的部分，与「电子 or 自旋」无关。本模块把它们提出来，
 * 模型侧只留「基怎么建、H 怎么作用、观测量怎么算」。
 *
 * 共用三件：
 *   1. EdLanczosTask —— 实对称 Lanczos 基态求解（可选两遍 Gram–Schmidt）。
 *      H 实对称 + 实种子 ⟹ Krylov 基虚部恒 0 ⟹ 只存实部（内存减半，m 翻倍）。
 *      内存预算裁 m，并把裁掉的实情暴露给调用方（mMax / mCapped）。
 *   2. edKrylovExp —— exp(−iH·dt)ψ 的 m 步 Krylov 实现（三对角本征分解）。
 *   3. edGramEntropy —— 由系数矩阵 A（行 = 左块构型、列 = 右块构型）算
 *      Schmidt 谱与纠缠熵：取较小一侧 Gram（AA† 或 A†A），复矩阵用实嵌入。
 *
 * 契约（两个模型都必须满足，否则数值不成立）：
 *   - matvec(reIn, imIn, reOut, imOut) 作用于**实对称** H（非厄米不适用本内核）；
 *   - eig(T) 返回 { val, vec }：val[i] 是第 i 个本征值，vec[j][i] 是第 j 个分量；
 *   - dim 与向量长度一致（调用方保证）。
 * ========================================================================== */

export function edPopcount(x){
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0F0F0F0F;
  return (x * 0x01010101) >> 24;
}

/* 实内积 / 范数平方：两个模型传进来的 im 在「实对称 H + 实种子」下恒为 0，
   这里仍按复数写，方便将来接复数厄米模型；求和顺序固定（逐位可复现）。 */
export function edDot(ar, ai, br, bi){
  let s = 0;
  for (let k = 0; k < ar.length; k++) s += ar[k] * br[k] + ai[k] * bi[k];
  return s;
}
export function edNorm(re, im){
  let s = 0;
  for (let k = 0; k < re.length; k++) s += re[k] * re[k] + im[k] * im[k];
  return s;
}

export class EdLanczosTask {
  /** @param {number} dim 向量长度
   *  @param {(reIn,imIn,reOut,imOut)=>void} matvec 实对称 H 的作用
   *  @param {{m?:number,maxMemMB?:number,seed?:number,fullOrtho?:boolean,
   *           eig?:(T:Float64Array[])=>{val:number[],vec:number[][]}}} opts */
  constructor(dim, matvec, opts = {}){
    this.dim = dim;
    this.matvec = matvec;
    const want = opts.m ?? 80;
    const budget = (opts.maxMemMB ?? 640) * 1048576;
    this.mMax = Math.max(8, Math.floor(budget / (dim * 8)));
    this.m = Math.min(want, this.mMax);
    this.mCapped = this.m < want;
    /* 两遍 Gram–Schmidt：Lanczos 基失正交通常是小规模 ED 的头号精度杀手。
       哈伯德页需要（U=0 金属极限、L=10/12 长链），自旋链页的三项递推已足够，
       关掉可省 O(m²·dim)（L=16 约 0.5 s）。 */
    this.fullOrtho = opts.fullOrtho === true;
    this.eig = opts.eig || null;

    const re = new Float64Array(dim), im = new Float64Array(dim);
    let s = opts.seed ?? 12345;
    for (let k = 0; k < dim; k++){ s = (s * 16807) % 2147483647; re[k] = (s / 2147483647) - 0.5; }
    const nn = Math.sqrt(edNorm(re, im));
    for (let k = 0; k < dim; k++) re[k] /= nn;
    this.re = re; this.im = im;
    this.zeroI = new Float64Array(dim);       /* 实模式下的虚部占位（不参与运算） */
    this.V = []; this.alpha = []; this.beta = []; this.iter = 0; this.done = false;
    this.energy = NaN; this.residual = null;
  }

  step(n = 1){
    const dim = this.dim;
    for (let it = 0; it < n && !this.done; it++){
      const vr = this.iter === 0 ? Float64Array.from(this.re) : this._nextR;
      const vi = this.zeroI;
      this.V.push([vr, vi]);
      /* w 必须**每步新分配**：复用同一个缓冲会让下一轮 matvec 输出覆盖上一轮
         存下的基向量（别名）⟹ beta 爆炸成 1e14/NaN；逐步调用每次新建缓冲会
         掩盖这个 bug（R73 首版即此）。 */
      const wR = new Float64Array(dim), wI = new Float64Array(dim);
      this.matvec(vr, vi, wR, wI);
      const a = edDot(vr, vi, wR, wI);
      this.alpha.push(a);
      const prev = this.V.length > 1 ? this.V[this.V.length - 2] : null;
      const bprev = this.beta.length ? this.beta[this.beta.length - 1] : 0;
      for (let k = 0; k < dim; k++){
        wR[k] -= a * vr[k]; wI[k] -= a * vi[k];
        if (prev){ wR[k] -= bprev * prev[0][k]; wI[k] -= bprev * prev[1][k]; }
      }
      if (this.fullOrtho){
        for (let pass = 0; pass < 2; pass++){
          for (const [vjR, vjI] of this.V){
            const c = edDot(vjR, vjI, wR, wI);
            if (c === 0) continue;
            for (let k = 0; k < dim; k++){ wR[k] -= c * vjR[k]; wI[k] -= c * vjI[k]; }
          }
        }
      }
      const nb = Math.sqrt(edNorm(wR, wI));
      this.beta.push(nb);
      this.iter++;
      if (nb < 1e-12 || this.iter >= this.m){
        this.done = true;
        this._extract();
      } else {
        for (let k = 0; k < dim; k++) wR[k] /= nb;
        this._nextR = wR;
      }
    }
    return { iter: this.iter, done: this.done, energy: this.energy };
  }

  _extract(){
    const m = this.alpha.length;
    const T = [];
    for (let i = 0; i < m; i++){ T.push(new Float64Array(m)); T[i][i] = this.alpha[i]; }
    for (let i = 0; i + 1 < m; i++){ T[i][i + 1] = this.beta[i]; T[i + 1][i] = this.beta[i]; }
    const { val, vec } = this.eig(T);
    let imin = 0;
    for (let i = 1; i < m; i++) if (val[i] < val[imin]) imin = i;
    this.energy = val[imin];
    const dim = this.dim;
    const re = new Float64Array(dim);
    for (let j = 0; j < m; j++){
      const c = vec[j][imin];
      if (c === 0) continue;
      const vjR = this.V[j][0];
      for (let k = 0; k < dim; k++) re[k] += c * vjR[k];
    }
    const nn = Math.sqrt(edNorm(re, this.zeroI));
    for (let k = 0; k < dim; k++) re[k] /= nn;
    this.re = re;
    this.im = new Float64Array(dim);          /* 实模式：虚部恒 0（下游仍拿到合法数组） */
    /* 残差 ‖Hψ − Eψ‖：多一次 matvec（dim 级的零头），但把「解到底准不准」交给调用方 */
    const wR = new Float64Array(dim), wI = new Float64Array(dim);
    this.matvec(re, this.im, wR, wI);
    let s = 0;
    for (let k = 0; k < dim; k++){
      const dr = wR[k] - this.energy * re[k];
      const di = wI[k] - this.energy * this.im[k];
      s += dr * dr + di * di;
    }
    this.residual = Math.sqrt(s);
  }
}

/* ---------- Krylov 指数：exp(−iH·dt)ψ（m 步 Lanczos + 三对角本征分解） ---------- */
export function edKrylovExp(dim, matvec, re, im, dt, m, eig){
  const nrm = Math.sqrt(edNorm(re, im));
  if (nrm < 1e-300) return { re: Float64Array.from(re), im: Float64Array.from(im) };
  let curR = Float64Array.from(re, v => v / nrm), curI = Float64Array.from(im, v => v / nrm);
  const Vs = [], Ws = [], alpha = [], beta = [];
  const tmpR = new Float64Array(dim), tmpI = new Float64Array(dim);
  let steps = 0;
  for (let j = 0; j < m; j++){
    Vs.push(curR); Ws.push(curI);
    matvec(curR, curI, tmpR, tmpI);
    const a = edDot(curR, curI, tmpR, tmpI);
    alpha.push(a);
    const prevR = j > 0 ? Vs[j - 1] : null, prevI = j > 0 ? Ws[j - 1] : null;
    const bprev = beta.length ? beta[beta.length - 1] : 0;
    for (let k = 0; k < dim; k++){
      tmpR[k] -= a * curR[k]; tmpI[k] -= a * curI[k];
      if (prevR){ tmpR[k] -= bprev * prevR[k]; tmpI[k] -= bprev * prevI[k]; }
    }
    const nb = Math.sqrt(edNorm(tmpR, tmpI));
    steps = j + 1;
    if (nb < 1e-13) break;                    /* 不变子空间 */
    beta.push(nb);
    curR = new Float64Array(dim); curI = new Float64Array(dim);
    for (let k = 0; k < dim; k++){ curR[k] = tmpR[k] / nb; curI[k] = tmpI[k] / nb; }
  }
  const T = [];
  for (let i = 0; i < steps; i++){ T.push(new Float64Array(steps)); T[i][i] = alpha[i]; }
  for (let i = 0; i + 1 < steps; i++){ T[i][i + 1] = beta[i]; T[i + 1][i] = beta[i]; }
  const { val, vec } = eig(T);
  /* c_j = Σ_k vec[j][k]·vec[0][k]·e^{−iλ_k dt}：vec[0][k]=⟨u_k|v_0⟩ 是初态在第 k 个
     本征矢上的投影——漏掉它系数不构成正交变换，范数会指数爆炸（R73 首版 50 步
     涨到 1e53，Taylor 对照 maxdiff 2.3）。 */
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

/* ---------- Schmidt 谱 / 纠缠熵（任意切点，取较小一侧 Gram） ----------
   A 是 rows×cols 的行主序系数矩阵（行 = 左块构型、列 = 右块构型）。
   Gram = A A†（rows≤cols）或 A†A（否则），两者非零谱相同 ⟹ 取较小一侧，O(n²·m)。
   复矩阵用实嵌入 [[Re,−Im],[Im,Re]]；本征值各二重 ⟹ 排序后**隔一取**、不折半
   （除以 2 再取前 n 个会让乘积态得到 Σλ=0.5、S=0.347 而不是 0）。 */
export function edGramEntropy(Ar, Ai, rows, cols, symEigVals){
  const byRow = rows <= cols;
  const n = byRow ? rows : cols;
  const m = byRow ? cols : rows;
  const n2 = 2 * n;
  const M = Array.from({ length: n2 }, () => new Float64Array(n2));
  /* 行主序的步长恒为 cols（不是 m！m 在 byRow=false 时是**行数**） */
  const at = (i, c) => (byRow ? i * cols + c : c * cols + i);
  for (let i = 0; i < n; i++){
    for (let j = i; j < n; j++){
      let rr = 0, ri = 0;
      for (let c = 0; c < m; c++){
        const a = at(i, c), b = at(j, c);
        rr += Ar[a] * Ar[b] + Ai[a] * Ai[b];
        ri += Ai[a] * Ar[b] - Ar[a] * Ai[b];
      }
      M[i][j] = rr; M[i][j + n] = -ri; M[i + n][j] = ri; M[i + n][j + n] = rr;
      M[j][i] = rr; M[j][i + n] = -ri; M[j + n][i] = ri; M[j + n][i + n] = rr;
    }
  }
  const vals = Array.from(symEigVals(M)).sort((a, b) => b - a);
  let S = 0;
  const spectrum = [];
  for (let i = 0; i < vals.length; i += 2){
    const lam = vals[i];
    if (lam > 1e-13){ S -= lam * Math.log(lam); spectrum.push(lam); }
  }
  return { S, spectrum: spectrum.slice(0, 12), sum: spectrum.reduce((a, b) => a + b, 0) };
}
