/* 薛定谔内核：iħ∂ψ/∂t = −ħ²/2m ∇²ψ + V(x)ψ
   重构前 index.html 的物理实现原样迁移——GLSL 片段与预设逐一对应。 */
import { PhysicsKernel, registerKernel, linearSpectrum } from './kernel.js';
import { gaussianWave } from './gaussian.js';
import { rectangularBarrierModel } from './barrier.js';
import { mathieuBands, mathieuQ, mathieuParamToE, energyToMathieuParam, sturmEigenvalue, mathieuTridiag } from './mathieu.js';

/* ============================================================================
 * R62 光学晶格 + Bloch 能带：复振幅虚时间弛漾（CPU）
 *
 * lattice 预设（V=V₀sin²(πx/a) 沿 x）的 Bloch 态由本节的 CPU 弛漾构造：
 *   · 2D 网格 n×n，x 向 twisted 循环边界（Bloch 定理 ψ(x+L)=e^{iθ}ψ(x)，
 *     θ=uTwistX=k·a），y 向 Dirichlet（晶格沿 x，横向不参与能带）
 *   · **PR-ADI（Peaceman-Rachford，势置 x 侧）**：流 ∂τψ=−(H−μ)ψ=(A'+B')ψ，
 *     A'=uK·D_x−(V−μ)（twisted 循环 + 势 + 移位）、B'=uK·D_y，aa=uK·τ/2：
 *       (I − aa·D_x + aa·w)u* = (I + aa·D_y)ψ
 *       (I − aa·D_y)u'        = (I + aa·D_x − aa·w)u*   （w=(V−μ)/uK）
 *     V 只依赖 x ⟹ [A',B']=0 严格成立（[D_x,D_y]=0、[V,D_y]=0）⟹
 *     PR 局部误差的交换子泵浦项 [[A,B],A+B] 原理性消除（选型第四轮，
 *     见 _relaxOnceC docstring）；势收进三对角对角（Cayley 形式）⟹
 *     **无位置相关指数乘子**。选型记录（实测教训，四轮）见 _relaxOnceC。
 *   · x 向 (I − aa·D_x + aa·w_x) 是**循环三对角**（twisted 角元 e^{∓iθ}
 *     + 逐点对角）⟹ Sherman-Morrison：A=B+u·v^T，B 为**实**三对角
 *     （αβ=a² 与 θ、w 无关，见下），两次实三对角 Thomas + 秩 1 修正；
 *     对角含 aa·w_x（随 μ 每步变）⟹ Thomas 系数逐行重算（O(n)）
 *   · y 向 (I − aa·D_y) 是 Dirichlet 实三对角，主对角 1+2aa 固定
 *     ⟹ Thomas 系数任务级一次缓存（triCp）
 *   · band2 弛漾每步对 band1 收敛态做复 Gram-Schmidt 投影（虚时间流总趋向
 *     全局基态，投影保持与低带正交 ⟹ 收敛到带 2；宇称在 BZ 内不存在，投影
 *     是唯一与 k 无关的通用激发手段）
 *   · 能量口径：2 阶 Rayleigh 商（与 ADI 同算子自洽；4 阶一阶差型仅记录
 *     info.energy4，对齐 GPU HUD 口径）
 *   · 收敛：|Δμ|<1e-8·|μ| 连续 4 步（μ 冻结 ⟺ 固定点；残差型判据不可达，
 *     见 LAT_MU_TOL 与 _relaxOnceC 的选型记录）；上限 LAT_MAX_STEPS 步
 * ========================================================================== */
const LAT_TAU = 5.0;              /* 虚时间步长：线性弛漾不动点与 τ 无关
                                     （Hψ=μψ 是 τ 无关的特征方程），大 τ 只加快趋近
                                     ——GP 的 τ=1 是为非线性项对角步稳定，此处不适用。
                                     实测 τ=1 时间隙 ΔE≈0.005 的带 2 激发需数千步，
                                     τ=5 后 ~300 步收敛 */
const LAT_MAX_STEPS = 1500;
const LAT_STABLE_N = 4;           /* μ 连续冻结次数 */
const LAT_MU_TOL = 1e-8;          /* μ 相对冻结阈值 |Δμ|<TOL·|μ| */

/* x 向 twisted wrap 采样表（任务级缓存，O(n) 内存换循环零分支）：
   ±1/±2 texel 越界 ⟹ wrap 对端 × e^{∓ikθ}（Bloch 定理，与 TPL_EVOLVE 的 S()
   逐字同语义：ψ_{-1}=e^{−iθ}ψ_{n−1}、ψ_n=e^{+iθ}ψ_0）。 */
function makeWrapX(n, theta){
  const m1 = new Int32Array(n), m2 = new Int32Array(n);
  const p1 = new Int32Array(n), p2 = new Int32Array(n);
  const m1c = new Float64Array(n), m1s = new Float64Array(n);
  const m2c = new Float64Array(n), m2s = new Float64Array(n);
  const p1c = new Float64Array(n), p1s = new Float64Array(n);
  const p2c = new Float64Array(n), p2s = new Float64Array(n);
  const c1 = Math.cos(theta), s1 = Math.sin(theta);
  const c2 = Math.cos(2*theta), s2 = Math.sin(2*theta);
  for (let x = 0; x < n; x++){
    if (x - 1 >= 0){ m1[x] = x-1; m1c[x] = 1; m1s[x] = 0; }
    else if (x === 0){ m1[x] = n-1; m1c[x] = c1; m1s[x] = -s1; }
    else { m1[x] = 0; m1c[x] = 1; m1s[x] = 0; }              /* x=−1 已在上面，此处不可达 */
    if (x - 2 >= 0){ m2[x] = x-2; m2c[x] = 1; m2s[x] = 0; }
    else if (x === 0){ m2[x] = n-2; m2c[x] = c2; m2s[x] = -s2; }
    else if (x === 1){ m2[x] = n-1; m2c[x] = c1; m2s[x] = -s1; }
    else { m2[x] = 0; m2c[x] = 1; m2s[x] = 0; }
    if (x + 1 < n){ p1[x] = x+1; p1c[x] = 1; p1s[x] = 0; }
    else if (x === n-1){ p1[x] = 0; p1c[x] = c1; p1s[x] = s1; }
    else { p1[x] = n-1; p1c[x] = 1; p1s[x] = 0; }
    if (x + 2 < n){ p2[x] = x+2; p2c[x] = 1; p2s[x] = 0; }
    else if (x === n-1){ p2[x] = 1; p2c[x] = c2; p2s[x] = s2; }
    else if (x === n-2){ p2[x] = 0; p2c[x] = c1; p2s[x] = s1; }
    else { p2[x] = n-1; p2c[x] = 1; p2s[x] = 0; }
  }
  return { m1, m2, p1, p2, m1c, m1s, m2c, m2s, p1c, p1s, p2c, p2s };
}

/* 实三对角 Thomas 前向系数缓存（B 矩阵固定 ⟹ cp 只算一次）：
   主对角 d[0]=dFirst、d[1..n−2]=1+2a、d[n−1]=dLast，次对角 −a。
   返回 { cp, m }（m_i = d_i − a·cp_{i−1} 分母，递推 −lo·dp = +a·dp
   因 lo=−a）。用途：① y 向 Dirichlet 版 d 全 1+2a（势置 x 侧后步 2
   系数固定 ⟹ 任务级一次）；② 历史上 x 向 twisted SM 的 B 固定系数版
   （dFirst=2a、dLast=1+2a−a²，势置 x 侧后改由 cycTriSMrow 逐行重算）。 */
function triCp(n, a, dFirst, dLast){
  const cp = new Float64Array(n), m = new Float64Array(n);
  m[0] = dFirst; cp[0] = -a/dFirst;
  for (let i = 1; i < n; i++){
    const d = (i === n-1) ? dLast : 1 + 2*a;
    m[i] = d + a*cp[i-1];
    cp[i] = (i < n-1) ? -a/m[i] : 0;
  }
  return { cp, m };
}

/* PR 步 2 的列三对角求解（复 rhs → 复 out），Thomas 系数 cp/m 由调用方
   预计算（势置 x 侧后 y 向矩阵 (I − aa·D_y) 系数固定 ⟹ 任务级一次，
   triCp(n, aa, 1+2aa, 1+2aa) 生成；主对角 1+2aa、次对角 −aa、Dirichlet）：
   (I − aa·D_y)·x = rhs。前向 dp 原地覆盖 rhs。 */
function triSolveCW(rhsRe, rhsIm, outRe, outIm, n, a, cp, m){
  rhsRe[0] /= m[0]; rhsIm[0] /= m[0];
  for (let i = 1; i < n; i++){
    rhsRe[i] = (rhsRe[i] + a*rhsRe[i-1])/m[i];
    rhsIm[i] = (rhsIm[i] + a*rhsIm[i-1])/m[i];
  }
  outRe[n-1] = rhsRe[n-1]; outIm[n-1] = rhsIm[n-1];
  for (let i = n-2; i >= 0; i--){
    outRe[i] = rhsRe[i] - cp[i]*outRe[i+1];
    outIm[i] = rhsIm[i] - cp[i]*outIm[i+1];
  }
}

/* x 向 twisted 循环三对角 Sherman-Morrison 求解（单行，rhs 在 re/im，解写回）：
   A = I − a·D_cyc(θ) + diag(g) = B + u·v^T（g[x]=aa·w_x，势置 x 侧安排）：
     B 实三对角，主对角 b[0]=d[0]−1、b[i]=d[i]（1≤i≤n−2）、
     b[n−1]=d[n−1]−a²（uv^T 修正 αβ=a² 与 θ、g 无关；d[x]=1+2a+g[x]
     为 A 的对角，调用方每步算一次 O(n)）；
     u = (1,0,…,0,β)、v = (1,0,…,0,α)，α=−a·e^{−iθ}、β=−a·e^{+iθ}
     （uv^T 恢复 A 的 [0][n−1]=α、[n−1][0]=β，主对角 [0][0]+=1、
      [n−1][n−1]+=a² ⟹ 恰为 A ⟹ 分解恒等；g=0 退化为旧固定系数版）。
   g 随 μ 每步变 ⟹ Thomas 系数逐行重算（O(n)，与两次消元同阶；
   cp/m 缓冲调用方提供、行间复用）。z = B⁻¹u、y = B⁻¹rhs（前向原地 +
   回代原地，i 递减顺序安全）；x = y − z·(v^Ty)/(1+v^Tz)，
   v^Tw = w[0] + α·w[n−1]。
   θ=0 退化：α=β=−a，同公式（无分支）。 */
function cycTriSMrow(re, im, n, a, theta, d, cp, m, zr, zi, yr, yi){
  const ac = Math.cos(theta), as = Math.sin(theta);
  const betaR = -a*ac, betaI = -a*as;              /* β=−a·e^{+iθ} */
  const alR = -a*ac, alI = a*as;                   /* α=−a·e^{−iθ} */
  /* B 的 Thomas 前向系数（主对角逐点 d[x]，端点按 SM 分解调整） */
  m[0] = d[0] - 1; cp[0] = -a/m[0];
  for (let i = 1; i < n-1; i++){
    m[i] = d[i] + a*cp[i-1];
    cp[i] = -a/m[i];
  }
  m[n-1] = d[n-1] - a*a + a*cp[n-2];
  /* z = B⁻¹u：u=(1,0,…,0,β) */
  zr[0] = 1/m[0]; zi[0] = 0;
  for (let i = 1; i < n; i++){
    const ur = (i === n-1) ? betaR : 0, ui = (i === n-1) ? betaI : 0;
    zr[i] = (ur + a*zr[i-1])/m[i];
    zi[i] = (ui + a*zi[i-1])/m[i];
  }
  for (let i = n-2; i >= 0; i--){
    zr[i] -= cp[i]*zr[i+1]; zi[i] -= cp[i]*zi[i+1];
  }
  /* y = B⁻¹rhs */
  yr[0] = re[0]/m[0]; yi[0] = im[0]/m[0];
  for (let i = 1; i < n; i++){
    yr[i] = (re[i] + a*yr[i-1])/m[i];
    yi[i] = (im[i] + a*yi[i-1])/m[i];
  }
  for (let i = n-2; i >= 0; i--){
    yr[i] -= cp[i]*yr[i+1]; yi[i] -= cp[i]*yi[i+1];
  }
  /* 秩 1 修正：s = (v^Ty)/(1+v^Tz) */
  const vyR = yr[0] + (alR*yr[n-1] - alI*yi[n-1]);
  const vyI = yi[0] + (alR*yi[n-1] + alI*yr[n-1]);
  const vzR = zr[0] + (alR*zr[n-1] - alI*zi[n-1]);
  const vzI = zi[0] + (alR*zi[n-1] + alI*zr[n-1]);
  const dR = 1 + vzR, dI = vzI, dn = dR*dR + dI*dI;
  const sR = (vyR*dR + vyI*dI)/dn, sI = (vyI*dR - vyR*dI)/dn;
  for (let i = 0; i < n; i++){
    re[i] = yr[i] - (sR*zr[i] - sI*zi[i]);
    im[i] = yi[i] - (sR*zi[i] + sI*zr[i]);
  }
}

/* Bloch 弛漾初态（**无横向包络**的纯 Bloch 形式 × y 向 Dirichlet 基模）：
     band1 = sin(π(y+1)/(n+1))·e^{ikx}              （Bloch u=1 平面波）
     band2 = sin(π(y+1)/(n+1))·sin(2πx/a)·e^{ikx}   （±G 谐波调制）
   **选型记录（实测教训，第五轮——初态的晶体动量纯度）**：
   ① 旧版用高斯包络 G(x)G(y)（σ=48 世界 px）：包络在晶体动量空间的宽度
     Δk≈1/σ_texel 与超晶格的动量间隔 2π/n 同量级（n=64 时 σ_texel=12 ⟹
     Δk=0.083 vs 间隔 0.098）⟹ 初态**泄漏到相邻晶体动量块**；
   ② twisted 超晶格哈密顿量按 j mod h（h=256/a_w，周期数）分块，块 r 的
     态对应约化晶体动量 k_r；**不同块的能带交织排序**：块 1 的带 1
     （0.0493）远低于块 0 的带 2（0.3426）⟹ 带 2 弛漾被相邻 k 的带 1
     捕获（实测收敛到 0.0505，正确值 0.3437），而对账用的 numpy 参考
     （eigvalsh 第二特征值）也是同一个错误值 ⟹ 双方"一致"掩盖了物理错误；
   ③ 无包络的纯 Bloch 初态的动量支撑是精确的 δ（band1: j=0；band2: j=±h）
     ⟹ 完全落在块 0；y 用 Dirichlet 精确基模 sin(π(y+1)/(n+1))（旧 sin(π(y+.5)/n)
     非本征态）⟹ x/y 分离，2D 本征值 = E_x(带,k) + Ey0 精确；
   ④ 即便初态纯净，**每步浮点噪声仍会向块外注入 ~1e-16 分量**，而虚时间流
     按 e^{+ΔE·τ·steps} 指数放大最低能块 ⟹ 带 2 仍在 ~20 步后崩塌（实测
     步10 E=0.344 正确 → 步20 泄漏 → 收敛到 0.0494）⟹ 必须**每步投影回
     块 0**（见 _blockProject0C）。加投影后：band1 6 步、band2 9 步收敛到
     块 0 本征值（原 273/1603 步且错误）⟹ 物理正确且加速 30–180×。 */
function fillLatticeIC(re, im, o){
  const n = o.grid, s = 256/n;
  const a = o.a, k = (o.theta || 0)/a;
  const band = o.band || 1;
  /* x 向调制（band1 无；band2 为 ±G 谐波）；y 向 Dirichlet 精确基模 */
  for (let y = 0; y < n; y++){
    const yb = Math.sin(Math.PI*(y + 1)/(n + 1));
    for (let x = 0; x < n; x++){
      const xw = (x + 0.5)*s;
      let amp = yb;
      if (band === 2) amp *= Math.sin(2*Math.PI*xw/a);
      const ph = k*xw;
      const i = y*n + x;
      re[i] = amp*Math.cos(ph); im[i] = amp*Math.sin(ph);
    }
  }
}

/* y 向 Dirichlet 基模投影：ψ[y,x] → (Σ_y ŷb[y]·ψ[y,x])·ŷb[y]（ŷb 已归一化）。
   **必要性（第五轮下半场实测）**：y 的第一激发只需 Ey1−Ey0≈3.5e-3（n=64），
   比 x 的带间能隙（~0.26）便宜两个量级 ⟹ 虚时间流**宁可激发 y 也不把 x 升到
   带 2**；且该态（x 带1 ⊗ y 激发）与带 1 参考态（x 带1 ⊗ y 基模）**因 y 正交而
   躲过 Gram-Schmidt** ⟹ 带 2 弛漾稳定收敛到 E=0.05056765 = 0.0458993(x 带1)
   + 0.0046685(y 第一激发)（逐位吻合），与正确值 0.31099 差 0.26。
   投影后 y 恒为基模 ⟹ 唯一可及的低能态只剩 x 带 1（被 GS 移除）⟹ 流被迫升到
   带 2；同时总能量严格 = E_x(带,k) + Ey0，与「Mathieu 解析 + Ey0」的对照口径
   精确一致（无横向污染的额外解释负担）。 */
function projY0C(re, im, n, yb){
  for (let x = 0; x < n; x++){
    let cr = 0, ci = 0;
    for (let y = 0; y < n; y++){
      const i = y*n + x, w = yb[y];
      cr += w*re[i]; ci += w*im[i];
    }
    for (let y = 0; y < n; y++){
      const i = y*n + x, w = yb[y];
      re[i] = cr*w; im[i] = ci*w;
    }
  }
}

/* 晶体动量块投影 P₀ = (1/h)·Σ_{m=0}^{h−1} e^{+iθm/h}·T_{a_t}^m
   （T_{a_t} = 沿 x 右移一个晶格周期 a_t 格点的平移算子，twisted 边界）。
   原理：块 r 的态在 T_{a_t} 下的本征值为 e^{−i(θ+2πr)/h} ⟹ 上述加权平均
   对块 0 给出 1、对其余块给出 (1/h)Σ_m e^{−i2πrm/h}=0 ⟹ 精确投影。
   实现为 h 遍 O(N) 加权累加（直接按 off=m·a_t 索引，无需移位缓冲）：
   源下标 x−off<0 时回绕并乘 e^{−iθ}（twisted BC ψ(u)=e^{−iθ}ψ(u+n)）。
   必要性见 fillLatticeIC ④——无此投影带 2 弛漾必然崩塌到相邻 k 的带 1。 */
function blockProject0C(re, im, outR, outI, n, aTexel, h, theta){
  const N = n*n;
  const cw = Math.cos(theta/h), sw = Math.sin(theta/h);   /* e^{iθ/h} */
  const cmR = Math.cos(theta), cmI = -Math.sin(theta);    /* e^{−iθ}（左边界回绕） */
  for (let i = 0; i < N; i++){ outR[i] = 0; outI[i] = 0; }
  let wR = 1, wI = 0;                                     /* e^{iθm/h} 迭代乘 */
  for (let m = 0; m < h; m++){
    const off = (m*aTexel) % n;
    for (let y = 0; y < n; y++){
      const row = y*n;
      for (let x = 0; x < n; x++){
        let src = x - off;
        let phR = 1, phI = 0;
        if (src < 0){ src += n; phR = cmR; phI = cmI; }
        const i = row + x, j = row + src;
        /* out += w_m · (ph · ψ[src]) */
        const vr = phR*re[j] - phI*im[j], vi = phR*im[j] + phI*re[j];
        outR[i] += wR*vr - wI*vi;
        outI[i] += wR*vi + wI*vr;
      }
    }
    const nwR = wR*cw - wI*sw, nwI = wR*sw + wI*cw;
    wR = nwR; wI = nwI;
  }
  const inv = 1/h;
  for (let i = 0; i < N; i++){ re[i] = outR[i]*inv; im[i] = outI[i]*inv; }
}

/* R62 光学晶格势重画（presets.build 与 enterLattice 共用——单源真值）：
   V=V₀sin²(πx/a)（世界 px），vGray=round(v·127+128)，shader 解码
   (gray−128)/127 ⟹ 与 CPU 弛漾的 round(v·127)/127 同源（R51 口径）。
   paint.state 提供 latV0/latA（app.loadPreset 已透传 state）。 */
function drawLatticeV(paint){
  const st = paint.state;
  const V0 = st.latV0, a = st.latA;
  const img = paint.vctx.getImageData(0, 0, 256, 256);
  for (let x = 0; x < 256; x++){
    const sn = Math.sin(Math.PI*x/a);
    const v = V0*sn*sn;
    const g = Math.round(Math.max(-1, Math.min(1, v))*127 + 128);
    for (let y = 0; y < 256; y++){
      const i = (y*256 + x)*4;
      img.data[i] = g; img.data[i+1] = g; img.data[i+2] = g; img.data[i+3] = 255;
    }
  }
  paint.vctx.putImageData(img, 0, 0);
}

/* 对称三对角矩阵的 QL 隐式位移本征分解（Numerical Recipes tqli 口径）。
   d=对角、e=次对角（e[0] 占位不用）；返回 vals 升序 + vecs（列优先，n×n）。
   **为什么 R67 不用 linearSpectrum 求有限深阱**（两条都是实测教训）：
   ① V=−V₀ 使 H 不定，而 shift-invert 的 CG 解 (H+ε)x=b 要求正定——虽然可以先
      整体抬 +V₀ 绕过，但那是权宜；
   ② 2D 谱会把 y 向的高阶横向模一起算进来：实测 128²、V₀=0.15、a=48 时前 10 个
      Ritz 值全部落在 −0.143…−0.123（间距就是横向模间距 0.9e-3、1.5e-3…），
      与 1D 束缚态的 −0.143/−0.124/−0.093/−0.051/−0.0047 完全对不上（最坏
      偏差 2815%）——**「2D 谱 = 1D 谱 + 横向基模」只在「每个 n_x 只取 n_y=1」
      时成立**，而谱求解器不知道要挑这些态。直接解 1D 截面对角化同时避开两点，
      且快三个数量级（128 点 ~3ms vs 2D 的 10.8s）。 */
function tridiagEig(d, e, n){
  const dd = Float64Array.from(d), ee = new Float64Array(n);
  for (let i = 1; i < n; i++) ee[i] = e[i];
  const z = new Float64Array(n*n);
  for (let i = 0; i < n; i++) z[i*n + i] = 1;
  for (let l = 0; l < n; l++){
    let iter = 0, m;
    do {
      for (m = l; m < n - 1; m++){
        const t = Math.abs(dd[m]) + Math.abs(dd[m+1]);
        if (Math.abs(ee[m+1]) + t === t) break;
      }
      if (m !== l){
        if (iter++ === 40) break;
        let g = (dd[l+1] - dd[l])/(2*ee[l+1]);
        let r = Math.hypot(g, 1);
        g = dd[m] - dd[l] + ee[l+1]/(g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
        let ss = 1, cc = 1, pp = 0;
        for (let i = m - 1; i >= l; i--){
          let f = ss*ee[i+1], b = cc*ee[i+1];
          r = Math.hypot(f, g);
          ee[i+2] = r;
          if (r === 0){ dd[i+1] -= pp; ee[m+1] = 0; break; }
          ss = f/r; cc = g/r;
          g = dd[i+1] - pp;
          r = (dd[i] - g)*ss + 2*cc*b;
          pp = ss*r;
          dd[i+1] = g + pp;
          g = cc*r - b;
          for (let k = 0; k < n; k++){
            f = z[k*n + i + 1];
            z[k*n + i + 1] = ss*z[k*n + i] + cc*f;
            z[k*n + i]     = cc*z[k*n + i] - ss*f;
          }
        }
        if (r === 0 && m !== l) continue;
        dd[l] -= pp; ee[l+1] = g; ee[m+1] = 0;
      }
    } while (m !== l);
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => dd[a] - dd[b]);
  const vals = new Float64Array(n);
  const vecs = new Float64Array(n*n);
  for (let j = 0; j < n; j++){
    vals[j] = dd[idx[j]];
    for (let k = 0; k < n; k++) vecs[j*n + k] = z[k*n + idx[j]];
  }
  return { vals, vecs };
}

/* ---------- R67 一维势谱：双势垒 + 有限深方阱 ---------- */

/* 双垒几何（世界 px）：两片宽 bw 的墙夹出中间的阱，整体以 x=128 对称。
   中央阱的准束缚能级 ≈ (nπ/gap)²·uK ⟹ 透射谱在 E 扫过这些值时出现
   T→1 的共振峰（Ramsauer–Townsend），垒间驻波被「共振透射」。 */
function drawDBarrier(paint){
  const st = paint.state;
  const V0 = (st.dV0 === undefined ? 0.2 : st.dV0);
  const bw = (st.dBw === undefined ? 4 : st.dBw);
  const gap = (st.dGap === undefined ? 28 : st.dGap);
  const x1 = 128 - gap/2 - bw, x2 = 128 + gap/2;
  paint.vctx.globalCompositeOperation = 'source-over';
  paint.vctx.fillStyle = paint.vGray(0);
  paint.vctx.fillRect(0, 0, 256, 256);
  paint.vctx.fillStyle = paint.vGray(V0);
  paint.vctx.fillRect(x1, 0, bw, 256);
  paint.vctx.fillRect(x2, 0, bw, 256);
}

/* 有限深方阱（沿 y 均匀，只依赖 x）：阱内 V=−V₀、阱外 0，宽 a（世界 px）。
   束缚态 E<0；阱越浅/越窄束缚态越少（1D 超越方程的解数 = ⌊2z₀/π⌋+1，
   z₀=(a/2)√(V₀/uK)）。沿 y 均匀是刻意的：这样 2D 谱 = 1D 谱 + 横向基模，
   可以拿 1D 解析解做硬对照（与 R62 Mathieu 同法）。 */
function drawFWell(paint){
  const st = paint.state;
  const V0 = (st.fV0 === undefined ? 0.15 : st.fV0);
  const a = (st.fWa === undefined ? 48 : st.fWa);
  paint.vctx.globalCompositeOperation = 'source-over';
  paint.vctx.fillStyle = paint.vGray(0);
  paint.vctx.fillRect(0, 0, 256, 256);
  paint.vctx.fillStyle = paint.vGray(-V0);
  paint.vctx.fillRect(128 - a/2, 0, a, 256);
}

/* y 向 Dirichlet 基模（归一化）：n 点网格、边界外恒 0 ⟹ 基模 sin(π(y+1)/(n+1))。
   （旧版 sin(π(y+0.5)/n) 非本征态；正确分母是 n+1 而非 n） */
function makeYBase(n){
  const yb = new Float64Array(n);
  let ss = 0;
  for (let y = 0; y < n; y++){ yb[y] = Math.sin(Math.PI*(y + 1)/(n + 1)); ss += yb[y]*yb[y]; }
  const inv = 1/Math.sqrt(ss);
  for (let y = 0; y < n; y++) yb[y] *= inv;
  return yb;
}

/* ==========================================================================
 * R64 量子弹球：腔体几何 + 硬壁势绘制 + Lanczos 谱求解
 *
 * 腔外画 V=1.0（vGray 满量程）当硬壁：E~1e-3 时 κ=√(2m(V−E))≈1.41 texel⁻¹，
 * 墙厚 ≥8 texel ⟹ 外泄 e^{−11}≈1e-5（可忽略，但不是真无限深——如实标注）。
 * 腔内 V=0。逐像素 256²（与 harmonic/drive 预设同法，~5ms）。
 *
 * 形状（腔心 (128,128)）：
 *   stadium —— 跑道：|dx|≤a 的矩形 × |dy|≤r，两端半径 r 的半圆（a=56,r=44）；
 *              外加**偏心小凸起**（半径 7，中心 (158,146)），破坏 x/y 反射对称。
 *              没有凸起时 stadium 的谱会按四个不可约表示分裂成多条独立序列，
 *              低能 ⟨r⟩ 被系统性拉低（伪可积），这是对称性守恒量的物理后果；
 *   circle  —— 圆腔 R=46（可积：能量 + 角动量，谱含大量简并）。
 * ========================================================================== */
const BILLIARD_GEO = {
  stadium: { a: 56, r: 44, bumpX: 30, bumpY: 18, bumpR: 7 },
  circle:  { R: 46 },
};

/* 腔内判据（px,py 为 texel 中心坐标 0..256） */
function billiardInside(px, py, kind){
  const dx = Math.abs(px - 128), dy = Math.abs(py - 128);
  if (kind === 'circle'){
    const R = BILLIARD_GEO.circle.R;
    return dx*dx + dy*dy <= R*R;
  }
  const g = BILLIARD_GEO.stadium;
  const inStad = (dx <= g.a) ? (dy <= g.r)
                             : ((dx - g.a)*(dx - g.a) + dy*dy <= g.r*g.r);
  if (!inStad) return false;
  const bx = px - (128 + g.bumpX), by = py - (128 + g.bumpY);
  return bx*bx + by*by > g.bumpR*g.bumpR;      /* 凸起是腔内的势岛 */
}

/* 硬壁势绘制（presets.build 与形状下拉共用，单源真值） */
function drawBilliardV(paint, kind){
  const img = paint.vctx.getImageData(0, 0, 256, 256);
  const gOut = Math.round(1.0*127 + 128);      /* V=1 墙 */
  const gIn  = Math.round(0.0*127 + 128);      /* V=0 腔内 */
  for (let y = 0; y < 256; y++){
    for (let x = 0; x < 256; x++){
      const i = (y*256 + x)*4;
      const g = billiardInside(x + 0.5, y + 0.5, kind) ? gIn : gOut;
      img.data[i] = g; img.data[i+1] = g; img.data[i+2] = g; img.data[i+3] = 255;
    }
  }
  paint.vctx.putImageData(img, 0, 0);
}

/* 最近邻间距比 ⟨r⟩（Oganesyan-Huse）：r_i=min(s_i,s_{i−1})/max(s_i,s_{i−1})。
   Poisson 0.386 / GOE 0.5307 / GUE 0.5996。间距为 0（简并）时该 r 记 0。 */
function meanR(evals){
  const n = evals.length;
  if (n < 4) return { r: NaN, n: 0 };
  const s = [];
  for (let i = 1; i < n; i++) s.push(evals[i] - evals[i-1]);
  const rs = [];
  for (let i = 1; i < s.length; i++){
    const a = Math.abs(s[i-1]), b = Math.abs(s[i]);
    const mx = Math.max(a, b);
    rs.push(mx > 1e-14 ? Math.min(a, b)/mx : 0);
  }
  if (!rs.length) return { r: NaN, n: 0 };
  return { r: rs.reduce((x, y) => x + y, 0)/rs.length, n: rs.length };
}

class SchrodingerKernel extends PhysicsKernel {
  constructor(){
    super();
    this.id = 'schrodinger';
    this.name = '薛定谔';
    this.equation = '<b>SCHRÖDINGER WORKSHOP</b> · <i>i</i>ħ ∂ψ/∂t = −ħ²/2m ∇²ψ + V(x)ψ';
    this.pairs = 1;
    /* R62：场景模式（presets 的 build 设置）+ Bloch 弛漾任务态 */
    this._mode = 'free';
    this._relaxTask = null;
    this._band1Ref = null;
    this._lastRelax = null;
  }

  makeWave(grid, p){
    /* R62 lattice 模式：高斯×平面波初态（自动弛漾交给面板/扫描器显式触发，
       默认演示晶格中波包的色散与散射——与 GP gs 预设的「进预设即弛漾」区分） */
    if (this._mode === 'lattice'){
      this._relaxTask = null;
      const o = {
        grid, m: p.m, v0: p.latV0, a: p.latA, theta: p.twistX || 0,
      };
      const N = grid*grid;
      const re = new Float64Array(N), im = new Float64Array(N);
      fillLatticeIC(re, im, o);
      let sum = 0;
      for (let i = 0; i < N; i++) sum += re[i]*re[i] + im[i]*im[i];
      const data = new Float32Array(N*2);
      for (let i = 0; i < N; i++){ data[i*2] = re[i]; data[i*2+1] = im[i]; }
      return { data, sum };
    }
    return gaussianWave(grid, p);
  }

  /* ---------- R62 Bloch 弛漾（虚时间，复振幅）---------- */
  get relaxPending(){ return this._relaxTask !== null; }

  /* 进入晶格场景并按当前 latV0/latA 重画势（面板滑块 / 扫描网格切换后恢复用）。
     与 presets().lattice.build 同源（drawLatticeV 单源真值）；丢弃进行中的弛漾
     任务（晶格已变，旧任务无意义）。不走 loadPreset——那条路径会用预设 params
     把 latV0/latA/twistX 打回默认值，与「拖滑块调参」的语义冲突。 */
  enterLattice(paint){
    this._mode = 'lattice';
    this._relaxTask = null;
    this._band1Ref = null;
    drawLatticeV(paint);
  }

  /* 建弛漾任务。opts：{grid, m, v0, a, theta, band(1|2)}。
     band2 以 this._band1Ref（band1 上次收敛态）为投影参考；无参考时先跑
     band1（调用方负责次序，扫描器每点先 1 后 2）。
     **晶体动量块投影前提**：a_t=a·n/256（texel）与 h=256/a（超晶格内的周期数）
     须为整数——默认 a=32 ⟹ h=8、a_t∈{8,16,32}（n=64/128/256）✓。不整除时
     （用户把 a 滑块调到非 256 的约数）关闭块投影（t.blockOff=true）⟹ 带 1 仍
     正确收敛（它是全局基态），带 2 会崩塌到相邻 k 的带 1 ⟹ 如实标记
     info.blockProj=false（面板/扫描据此提示，不静默给出错误数值）。 */
  startRelax(opts){
    const n = opts.grid, N = n*n;
    const thetaB = opts.theta || 0, m = opts.m, V0 = opts.v0, a = opts.a;
    const uK = 0.5/m;
    const aTexelR = a*n/256, hR = 256/a;
    const blockOff = !(Math.abs(aTexelR - Math.round(aTexelR)) < 1e-9 && Math.abs(hR - Math.round(hR)) < 1e-9 && n % Math.round(hR) === 0);
    const aTexel = Math.round(aTexelR), h = Math.round(hR);
    /* **Bloch 相位的两种口径（第五轮教训，实测 θ≠0 带 2 崩塌）**：
       twistX（opts.theta）= θ_B = **每晶格周期**的 Bloch 相位 k·a（∈[0,π] 覆盖
       简约 BZ，面板滑块语义）；twisted BC 的相位是**跨越整个网格**（含 h 个周期）
       累积的总相位 θ_BC = h·θ_B（makeWrapX / 块投影 / 能量算子的 wrap 相位全部
       用它）。初态的平面波相位用晶体动量 k = θ_B/a（世界 px⁻¹），即 e^{ikx_w}——
       与 θ_BC 差 h 倍；旧版把两者混用（IC 取 k=θ_BC/a）⟹ θ≠0 时初态的动量
       支撑不在块 0 ⟹ 带 2 崩塌到相邻 k 的带 1（θ=0 时 h 倍差被 0 吸收故侥幸
       正确——这正是 pot62 只在 θ=0 才算对的带 2 的原因）。 */
    const theta = h*thetaB;              /* θ_BC：twisted BC 总相位 */
    /* CN 半步参数 aa=uK·τ/2（m 依赖！旧版硬编码 0.25·τ 仅对 m=1 成立：
       m≠1 时动能步与对角步尺度不一致 ⟹ 有效算子漂移。Nyquist 处
       (1−aaκ)/(1+aaκ)，aaκ_max=2uK·... 见 _relaxOnceC 注释） */
    const aa = uK*LAT_TAU/2;
    /* V 生产纹理逐字镜像：v=V₀sin²(πx_w/a)（x_w 世界 px），vGray=round(v·127+128)，
       shader 解码 (gray−128)/127 ⟹ V=round(v·127)/127（R51 量化镜像同款） */
    const V = new Float64Array(N);
    const s = 256/n;
    for (let y = 0; y < n; y++){
      for (let x = 0; x < n; x++){
        const xw = (x + 0.5)*s;
        const sn = Math.sin(Math.PI*xw/a);
        const v = V0*sn*sn;
        V[y*n+x] = Math.round(Math.max(-1, Math.min(1, v))*127)/127;
      }
    }
    const band = opts.band || 1;
    const re = new Float64Array(N), im = new Float64Array(N);
    fillLatticeIC(re, im, { grid: n, m, v0: V0, a, theta: thetaB, band });   /* 初态用 θ_B（k=θ_B/a） */
    const t = {
      n, N, re, im, V, m, uK: 0.5/m, theta, thetaB, band,                   /* theta=θ_BC（BC/投影），thetaB=θ_B（Bloch 相位） */
      steps: 0, stable: 0, prev: NaN, mu: 0, finished: false, diverged: false,
      wx: makeWrapX(n, theta),
      zr: new Float64Array(n), zi: new Float64Array(n),
      yr: new Float64Array(n), yi: new Float64Array(n),
      t1r: new Float64Array(N), t1i: new Float64Array(N),
      w: new Float64Array(n),           /* PR 移位 w[x]=(V(x)−μ)/uK（每步重算；V 仅依赖 x ⟹ 长度 n） */
      d1: new Float64Array(n),          /* 步1 x 向对角 d[x]=1+2aa+aa·w[x]（每步重算） */
      /* 晶体动量块投影（band2 正确性必需，见 fillLatticeIC ④）
         + y 向 Dirichlet 基模投影（见 projY0C 注释） */
      aTexel, h, blockOff: !!blockOff,
      yb: makeYBase(n),                     /* 归一化 Dirichlet y 基模 */
      bR: blockOff ? null : new Float64Array(N), bI: blockOff ? null : new Float64Array(N),
      ref: (band === 2) ? this._band1Ref : null,
      info: null,
    };
    if (!blockOff) blockProject0C(re, im, t.bR, t.bI, n, aTexel, h, theta);   /* 初态块纯化（浮点 IC 亦有噪声） */
    /* Thomas 系数缓存（势置 x 侧安排）：
       x 向 twisted SM 的对角含 aa·w_x（随 μ 每步变）⟹ 不缓存，
       cycTriSMrow 内逐行重算（cpX/mX 作行间复用 scratch）；
       y 向 (I − aa·D_y) 系数固定 ⟹ triCp 任务级一次。 */
    t.cpX = new Float64Array(n); t.mX = new Float64Array(n);
    const cY = triCp(n, aa, 1 + 2*aa, 1 + 2*aa);
    t.cpY = cY.cp; t.mY = cY.m;
    this._relaxTask = t;
    return t;
  }

  /* 单步虚时间流（PR-ADI，Peaceman-Rachford，**势置 x 侧**安排）：
     流 ∂τψ=−(H−μ)ψ=(A'+B')ψ，A'=uK·D_x−(V−μ)（twisted 循环 + 势 + 移位）、
     B'=uK·D_y（Dirichlet 动能），aa=uK·τ/2：
       (I − aa·D_x + aa·w)u* = (I + aa·D_y)ψ
       (I − aa·D_y)u'        = (I + aa·D_x − aa·w)u*     （w=(V−μ)/uK）
     两步均为精确三对角/循环三对角求解 ⟹ 无位置相关指数乘子。
     **选型记录（实测教训，四轮）**：
     ① 旧方案 D(τ/2)·CN_y(τ)·CN_x(τ)·D(τ/2)（指数对角乘子
       e^{(μ−V)τ/2}）——乘子傅里叶谱在倒格矢 κ_m=2−2cos(2πm/8) 处有
       J_m(τV₀/2) 分量（V₀=0.3 时 J_2(0.75)=0.066），每步向这些频率
       注入功率而 CN 仅以 |f(κ_m)|<1 阻尼 ⟹ 稳态垃圾：实测垃圾
       |junk|=2.1e-2 钉死在 κ=2.0（倒格矢 m=2，j=16/48 双峰），能量
       误差 4.66e-4（gap 的 20%），μ 爬行不冻结；V₀=0.1 时
       J_2(0.125)=0.002（小 34×）垃圾仅 8e-6 故侥幸工作。指数子步
       细分无效（谱耦合随指数相乘线性叠加）。
     ② 残差型收敛判据 ‖(H−μ)ψ‖/‖Hψ‖<1e-9 原理上不可达（旧方案固定点
       含注入垃圾 ⟹ 残差钉 ~6e-2；numpy 17 位复核确认非计算 bug）。
     ③ PR 移位在 B 内安排（(I−aa·D_x)u*=(I+aa·D_y−aa·w)ψ /
       (I−aa·D_y+aa·w)u'=(I+aa·D_x)u*）——固定点正确、V₀=0.1 全案例
       收敛；但 V₀=0.3 深晶格 err 在 ~1e-4 处反弹、res 爆炸（1536 步
       上限不收敛）。numpy 独立复现同款病态 ⟹ 非实现 bug；固定点
       稳定性实验（精确基态 + μ=λ₁，20 步 junk 仅 2e-15→2e-14）与
       冻结 μ 实验（IC 出发 junk 0.87→0.08 后反弹）排除 μ 反馈回路
       ⟹ **映射瞬态泵浦**：PR 局部误差项 [[A,B],A+B]，其中
       [A,B]=−uK·[D_x,V]≠0（势在 B 与 D_x 不交换），深晶格
       [D_x,V] 幅度 ×3 ⟹ 泵浦 ×9；叠加 Cayley 对高能模欠阻尼
       （λ~2 时 |f|=0.667/步 vs 精确流 e^{−9.4}）。
     ④ **势置 x 侧**（本轮安排）：V 只依赖 x ⟹ [A',B']=0 严格成立
       （[D_x,D_y]=0、[V,D_y]=0）⟹ 交换子泵浦项原理性消除。numpy
       独立验证：固定点 junk 1.2e-14；V₀=0.3 IC 收敛 err
       3.1e-3→3.7e-11@599 步单调无地板；V₀=0.1 err 2.9e-15@599 步；
       冻结 μ 亦单调收敛。 */
  _relaxOnceC(t){
    const n = t.n, N = t.N, re = t.re, im = t.im, V = t.V, wx = t.wx;
    const t1r = t.t1r, t1i = t.t1i, w = t.w, d1 = t.d1;
    const aa = t.uK*LAT_TAU/2;         /* aa=uK·τ/2：须含 m（uK=0.5/m；
       旧版硬编码 0.25τ 仅 m=1 正确 ⟹ 动能步与移位步尺度失配） */
    /* w[x]=(V(x)−μ)/uK（V 仅依赖 x ⟹ 长度 n）；势置 x 侧：w 只经步1
       对角 d1 与步2 rhs 进入，不再出现在步1 fill */
    const iuK = 1/t.uK;
    for (let x = 0; x < n; x++) w[x] = (V[x] - t.mu)*iuK;
    for (let x = 0; x < n; x++) d1[x] = 1 + 2*aa + aa*w[x];
    /* PR 步 1：rhs = (I + aa·D_y)ψ → t1r/t1i（y 向 Dirichlet stencil，无势项；
       写 t1 与读 re/im 不别名） */
    for (let y = 0; y < n; y++){
      const row = y*n;
      for (let x = 0; x < n; x++){
        const i = row + x;
        const ym = y > 0 ? i - n : -1, yp = y < n-1 ? i + n : -1;
        const lr = (ym >= 0 ? re[ym] : 0) + (yp >= 0 ? re[yp] : 0) - 2*re[i];
        const li = (ym >= 0 ? im[ym] : 0) + (yp >= 0 ? im[yp] : 0) - 2*im[i];
        t1r[i] = re[i] + aa*lr;
        t1i[i] = im[i] + aa*li;
      }
    }
    /* x 向 twisted 循环 SM 求解：(I − aa·D_x + aa·w_x)u* = rhs（逐行；
       对角 d1 随 μ 每步变 ⟹ cycTriSMrow 内逐行重算 Thomas 系数） */
    for (let y = 0; y < n; y++){
      const row = y*n;
      cycTriSMrow(t1r.subarray(row, row + n), t1i.subarray(row, row + n), n, aa, t.theta, d1, t.cpX, t.mX, t.zr, t.zi, t.yr, t.yi);
    }
    /* PR 步 2：rhs = (I + aa·D_x − aa·w)u*（twisted apply 于 t1r/t1i 中的 u*）
       → 列缓冲 yr/yi，解 (I − aa·D_y)u' = rhs（列三对角，**固定系数**
       1+2aa，任务级缓存）→ 写回 re/im */
    for (let x = 0; x < n; x++){
      const wxr = w[x];
      for (let y = 0; y < n; y++){
        const i = y*n + x;
        const m1 = y*n + wx.m1[x], p1 = y*n + wx.p1[x];
        const lr = (t1r[m1]*wx.m1c[x] - t1i[m1]*wx.m1s[x]) + (t1r[p1]*wx.p1c[x] - t1i[p1]*wx.p1s[x]) - 2*t1r[i];
        const li = (t1r[m1]*wx.m1s[x] + t1i[m1]*wx.m1c[x]) + (t1r[p1]*wx.p1s[x] + t1i[p1]*wx.p1c[x]) - 2*t1i[i];
        t.yr[y] = t1r[i] + aa*lr - aa*wxr*t1r[i];
        t.yi[y] = t1i[i] + aa*li - aa*wxr*t1i[i];
      }
      triSolveCW(t.yr, t.yi, t.zr, t.zi, n, aa, t.cpY, t.mY);
      for (let y = 0; y < n; y++){ re[y*n + x] = t.zr[y]; im[y*n + x] = t.zi[y]; }
    }
    let ss = 0;
    for (let i = 0; i < N; i++) ss += re[i]*re[i] + im[i]*im[i];
    if (!(ss > 0) || !isFinite(ss)){ t.finished = true; t.diverged = true; return; }
    const inv = 1/Math.sqrt(ss);
    for (let i = 0; i < N; i++){ re[i] *= inv; im[i] *= inv; }
    /* 晶体动量块投影（每步）：清除 PR 步/归一化向块外注入的 ~1e-16 噪声——
       不清除则带 2 必崩塌到相邻 k 的带 1（见 fillLatticeIC ④实测：步10 正确
       E=0.344 → 步20 泄漏 → 收敛到错误的 0.0494）。成本 O(h·N)（h=256/a=8），
       与 PR 步同阶。blockOff（a_t 非整数）时跳过 ⟹ 带 2 结果不可信（info 标记）。 */
    if (!t.blockOff){
      blockProject0C(re, im, t.bR, t.bI, n, t.aTexel, t.h, t.theta);
      let sb = 0;
      for (let i = 0; i < N; i++) sb += re[i]*re[i] + im[i]*im[i];
      if (!(sb > 1e-30) || !isFinite(sb)){ t.finished = true; t.diverged = true; return; }
      const ib = 1/Math.sqrt(sb);
      for (let i = 0; i < N; i++){ re[i] *= ib; im[i] *= ib; }
    }
    /* y 向基模投影（每步）：封死「宁可激发 y 也不升带」的逃逸通道（projY0C 注释）。
       与块投影同价 O(N)——两个投影一起把弛漾严格限制在「块 0 ⊗ y 基模」子空间，
       该子空间内最低态 = x 带 1、次低 = x 带 2 ⟹ GS 移除带 1 后必收敛带 2。 */
    projY0C(re, im, n, t.yb);
    let sy = 0;
    for (let i = 0; i < N; i++) sy += re[i]*re[i] + im[i]*im[i];
    if (!(sy > 1e-30) || !isFinite(sy)){ t.finished = true; t.diverged = true; return; }
    const iy = 1/Math.sqrt(sy);
    for (let i = 0; i < N; i++){ re[i] *= iy; im[i] *= iy; }
    t.mu = this._energyOfC(t);
    if (!isFinite(t.mu)){ t.finished = true; t.diverged = true; return; }
    /* band2 每步复 Gram-Schmidt 投影（虚时间流总趋向全局基态 ⟹ 必须保持与
       带 1 正交才能收敛到带 2；BZ 内无宇称量子数，投影是通用手段） */
    if (t.band === 2 && t.ref){
      let ir = 0, ii = 0;
      for (let i = 0; i < N; i++){
        ir += t.ref.re[i]*re[i] + t.ref.im[i]*im[i];
        ii += t.ref.re[i]*im[i] - t.ref.im[i]*re[i];
      }
      for (let i = 0; i < N; i++){
        const pr = ir*t.ref.re[i] - ii*t.ref.im[i];
        const pi = ir*t.ref.im[i] + ii*t.ref.re[i];
        re[i] -= pr; im[i] -= pi;
      }
      let ss2 = 0;
      for (let i = 0; i < N; i++) ss2 += re[i]*re[i] + im[i]*im[i];
      if (ss2 > 1e-30){
        const inv2 = 1/Math.sqrt(ss2);
        for (let i = 0; i < N; i++){ re[i] *= inv2; im[i] *= inv2; }
        t.mu = this._energyOfC(t);
        if (!isFinite(t.mu)){ t.finished = true; t.diverged = true; return; }
      } else { t.finished = true; t.diverged = true; return; }
    }
    /* 收敛判据：μ 相对冻结 |Δμ|<LAT_MU_TOL·|μ| 连续 LAT_STABLE_N 步。
       **选型记录（实测教训）**：
       ① 残差型 ‖(H−μ)ψ‖/‖Hψ‖<1e-9 原理上不可达：旧方案（指数对角乘子）
       固定点含倒格矢注入垃圾 ⟹ 残差钉 ~6e-2（numpy 17 位复核确认非
       计算 bug）；PR 修复注入源后残差应大幅下降（pot62 复核）。
       ② μ 冻结即固定点判据：μ_n−μ_{n−1}=|c₂|²·gap·(1−e^{−2gapτ})，
       阈值 1e-8·|μ| 触发时残余带污染 |c₂|²≲2e-6 ⟹ 能量偏差 ≲1e-8。
       ③ m=2 案例的旧「误触发」实为能量公式 bug 期（|lapψ|² 型）的假象，
       非判据本身缺陷；aa=uK·τ/2 修复 m 依赖后复测通过（pot62）。 */
    if (isFinite(t.prev) && Math.abs(t.mu - t.prev) < LAT_MU_TOL*Math.abs(t.mu)) t.stable++;
    else t.stable = 0;
    t.prev = t.mu;
    if (t.stable >= LAT_STABLE_N) t.finished = true;
  }

  /* ⟨H⟩（归一化态，**Rayleigh 商**，2 阶 twisted x + Dirichlet y——与 ADI 的
     stencil 逐字同算子 ⟹ 自洽）。**选型记录（实测教训，两轮）**：
     ① 初版抄 GPU 的 0.25·|lapψ|² 型——但那是**一阶差分** dxp 的模方
     （|∂xψ|²，离散 Green 恒等式 ⟺ Rayleigh 商），对**二阶** lap 取模方得到
     E² 量级的量，实测 μ=0.0410 **低于**离散 H 最低特征值 0.0459（Rayleigh
     商不可能低于 λ_min）⟹ 判明口径错误；
     ② 4 阶 stencil 版在细周期晶格（a=16@64² = 4 格点/周期）近 Nyquist 失准，
     μ 虚高 16.04 vs 0.051，对角步正反馈 448 步不收敛。
     正解：2 阶 Rayleigh 商 ΣRe(ψ*·(−lapψ))·uK + ΣV|ψ|²（twisted 循环的离散
     Green 边界项精确抵消，与 gp 实场版 _energyOf 逐式同构）。GPU HUD 的
     4 阶一阶差口径由 _energyOfC4 单独记录（info.energy4）。 */
  _energyOfC(t){
    const n = t.n, N = t.N, re = t.re, im = t.im, V = t.V, uK = t.uK, wx = t.wx;
    let Traw = 0, Vp = 0;
    for (let y = 0; y < n; y++){
      const row = y*n;
      for (let x = 0; x < n; x++){
        const i = row + x;
        const m1 = row + wx.m1[x], p1 = row + wx.p1[x];
        const ym = y > 0 ? i - n : -1, yp = y < n-1 ? i + n : -1;
        const lxr = (re[m1]*wx.m1c[x] - im[m1]*wx.m1s[x]) + (re[p1]*wx.p1c[x] - im[p1]*wx.p1s[x]) - 2*re[i];
        const lxi = (re[m1]*wx.m1s[x] + im[m1]*wx.m1c[x]) + (re[p1]*wx.p1s[x] + im[p1]*wx.p1c[x]) - 2*im[i];
        const lyr = (ym >= 0 ? re[ym] : 0) + (yp >= 0 ? re[yp] : 0) - 2*re[i];
        const lyi = (ym >= 0 ? im[ym] : 0) + (yp >= 0 ? im[yp] : 0) - 2*im[i];
        Traw -= re[i]*(lxr + lyr) + im[i]*(lxi + lyi);   /* −Re(ψ*·lapψ) */
        Vp += V[i]*(re[i]*re[i] + im[i]*im[i]);
      }
    }
    return uK*Traw + Vp;
  }

  /* 本征方程相对残差 ‖(H−μ)ψ‖/‖Hψ‖（2 阶 twisted x + Dirichlet y，与
     _energyOfC 逐式同算子）。H 厄米 ⟹ Σ|Hψ|²=⟨ψ|H²|ψ⟩，故该比值即
     ⟨ψ|(H−μ)²|ψ⟩/⟨ψ|H²|ψ⟩ 的平方根——标准特征残差口径。 */
  _residualC(t){
    const n = t.n, re = t.re, im = t.im, V = t.V, uK = t.uK, wx = t.wx, mu = t.mu;
    let hn = 0, rn = 0;
    for (let y = 0; y < n; y++){
      const row = y*n;
      for (let x = 0; x < n; x++){
        const i = row + x;
        const m1 = row + wx.m1[x], p1 = row + wx.p1[x];
        const ym = y > 0 ? i - n : -1, yp = y < n-1 ? i + n : -1;
        const lxr = (re[m1]*wx.m1c[x] - im[m1]*wx.m1s[x]) + (re[p1]*wx.p1c[x] - im[p1]*wx.p1s[x]) - 2*re[i];
        const lxi = (re[m1]*wx.m1s[x] + im[m1]*wx.m1c[x]) + (re[p1]*wx.p1s[x] + im[p1]*wx.p1c[x]) - 2*im[i];
        const lyr = (ym >= 0 ? re[ym] : 0) + (yp >= 0 ? re[yp] : 0) - 2*re[i];
        const lyi = (ym >= 0 ? im[ym] : 0) + (yp >= 0 ? im[yp] : 0) - 2*im[i];
        /* Hψ = −uK·lapψ + Vψ（−lap = 邻居和 − 2中心，twisted 相位同 lap） */
        const hr = -uK*(lxr + lyr) + V[i]*re[i];
        const hi = -uK*(lxi + lyi) + V[i]*im[i];
        const rr = hr - mu*re[i], ri = hi - mu*im[i];
        hn += hr*hr + hi*hi;
        rn += rr*rr + ri*ri;
      }
    }
    if (!(hn > 0) || !isFinite(hn)) return Infinity;
    const r = Math.sqrt(rn/hn);
    return isFinite(r) ? r : Infinity;
  }

  /* 4 阶**一阶差分** ⟨H⟩（GPU TPL_REDUCE 同口径：0.25(|dxp|²+|dyp|²)+ΣVp，
     dxp=[f−2−8f−1+8f+1−f+2]/6，x 向 twisted wrap ±2、y 向 Dirichlet）——仅
     记录用（info.energy4）。与 GPU 的已知差：GPU 界外 CLAMP_TO_EDGE 而此处
     twisted wrap，Bloch 态边界 |ψ|≠0 ⟹ 差 ~边界层份额（cdp62 阈值说明）。 */
  _energyOfC4(t){
    const n = t.n, re = t.re, im = t.im, V = t.V, uK = t.uK, wx = t.wx;
    let T = 0, Vp = 0;
    for (let y = 0; y < n; y++){
      const row = y*n;
      const y0 = y - 2, y1 = y - 1, y3 = y + 1, y4 = y + 2;
      for (let x = 0; x < n; x++){
        const i = row + x;
        const m2 = row + wx.m2[x], m1 = row + wx.m1[x], p1 = row + wx.p1[x], p2 = row + wx.p2[x];
        const dxr = (re[m2]*wx.m2c[x] - im[m2]*wx.m2s[x]) - 8*(re[m1]*wx.m1c[x] - im[m1]*wx.m1s[x])
                  + 8*(re[p1]*wx.p1c[x] - im[p1]*wx.p1s[x]) - (re[p2]*wx.p2c[x] - im[p2]*wx.p2s[x]);
        const dxi = (re[m2]*wx.m2s[x] + im[m2]*wx.m2c[x]) - 8*(re[m1]*wx.m1s[x] + im[m1]*wx.m1c[x])
                  + 8*(re[p1]*wx.p1s[x] + im[p1]*wx.p1c[x]) - (re[p2]*wx.p2s[x] + im[p2]*wx.p2c[x]);
        const q2 = y0 >= 0 ? y0*n + x : -1, q1 = y1 >= 0 ? y1*n + x : -1;
        const q3 = y3 < n ? y3*n + x : -1, q4 = y4 < n ? y4*n + x : -1;
        const dyr = (q2 >= 0 ? re[q2] : 0) - 8*(q1 >= 0 ? re[q1] : 0) + 8*(q3 >= 0 ? re[q3] : 0) - (q4 >= 0 ? re[q4] : 0);
        const dyi = (q2 >= 0 ? im[q2] : 0) - 8*(q1 >= 0 ? im[q1] : 0) + 8*(q3 >= 0 ? im[q3] : 0) - (q4 >= 0 ? im[q4] : 0);
        T += 0.25*(dxr*dxr + dxi*dxi + dyr*dyr + dyi*dyi);
        Vp += V[i]*(re[i]*re[i] + im[i]*im[i]);
      }
    }
    return uK*T + Vp;
  }

  _relaxSnapshotC(t){
    const N = t.N;
    const data = new Float32Array(N*2);
    for (let i = 0; i < N; i++){ data[i*2] = t.re[i]; data[i*2+1] = t.im[i]; }
    return { data, done: false };
  }

  _relaxFinalizeC(t){
    const N = t.N;
    const data = new Float32Array(N*2);
    for (let i = 0; i < N; i++){ data[i*2] = t.re[i]; data[i*2+1] = t.im[i]; }
    /* band1 收敛态留档 ⟹ 紧随的 band2 任务以它为投影参考 */
    if (t.band === 1 && !t.diverged) this._band1Ref = { re: t.re.slice(), im: t.im.slice() };
    const info = {
      steps: t.steps, converged: t.stable >= LAT_STABLE_N && !t.diverged,
      diverged: !!t.diverged, energy: t.mu, res: this._residualC(t),
      energy4: this._energyOfC4(t),
      band: t.band, theta: t.thetaB, thetaBC: t.theta,
      /* 晶体动量块投影是否生效：false ⟹ 带 2 数值不可信（a_t 非整数，
         带 2 会崩塌到相邻 k 的带 1），调用方须如实提示而非静默使用 */
      blockProj: !t.blockOff,
    };
    this._lastRelax = info;
    this._relaxTask = null;
    return { data, done: true, info };
  }

  /* 分帧推进（引擎每帧调用，契约同 GP relaxStep）：返回 {data, done, info} 或 null */
  relaxStep(budget){
    const t = this._relaxTask;
    if (!t) return null;
    for (let k = 0; k < budget && !t.finished; k++){
      t.steps++;
      this._relaxOnceC(t);
    }
    if (t.finished || t.steps >= LAT_MAX_STEPS) return this._relaxFinalizeC(t);
    return this._relaxSnapshotC(t);
  }

  shaders(){
    return {
      localH: 'V*c',                                   /* H·c 的局部部分：势能项 */
      density: 'dot(psi.xy,psi.xy)',                   /* |ψ|²（RG32F：zw=(0,1) 不参与） */
      kinetic: '0.25*(dot(dxp,dxp)+dot(dyp,dyp))',     /* |∇ψ|²/2m，m 经 uK=1/2m 折算 */
      potential: 'V*p',                                /* 势能密度 */
    };
  }

  /* URL 参数扩展（内核私有，如 NLS ?g=）。AB 螺线管参数（?abSols= / ?abX&abY&abPhi）
     在 R54 迁往引擎级 app.js applyABParams——abSols 是引擎状态，全 2D 内核可用，
     不再局限于薛定谔内核。执行时序：loadPreset → initWave → applyParams/applyABParams，
     均在 frame() 主循环启动之前，首帧即以目标参数演化。 */
  applyParams(qp, state){
    /* 薛定谔内核暂无私有 URL 参数（保留扩展点；AB 已迁引擎级） */
  }

  /* ---------- R63 Landau 半经典模型（HUD 读数 + LandauScanner 叠图共用，单源真值）----------
     均匀 B_z（Landau 规范 A=(−B·y,0,0)，q=1）+ 紧束缚带
     E(k)=−(1/m)(cos(k_x+B·y)+cos k_y)（uK=1/2m）的半经典回旋：
       θ̇=(B/m)·sinφ,  φ̇=−(B/m)·sinθ,  守恒量 H=−(cosθ+cosφ)
     （θ=k_x+B·y、φ=k_y；(0,0) 稳定平衡 ⟹ 小振幅 T₀=2πm/B=2π/ω_c，即连续统
     Landau 回旋周期）。大振幅时非谐（类单摆）拉长周期——这正是「连续统公式
     只在小轨道极限成立」的晶格修正，诚实标注而非隐藏。
     周期闭式（两步代换 w=sin(θ/2)、w=s·sinα 去掉端点 1/√ 奇性，被积函数在
     [0,π/2] 光滑；与 scipy ODE 实测 10 点全部吻合到 1e-5，见 worklog R63）：
       T(θ₀) = (4m/B)∫₀^{π/2} dα / √((1−s²sin²α)(1−s²cos²α)),  s=sin(θ₀/2)
     复合 Simpson N=256 求积（光滑被积 ⟹ ~1e-13；单次调用 ~512 次 flop，
     HUD 每帧刷新成本可忽略）。 */
  landauModel(state){
    const B = Math.abs(state.bOrb || 0), m = state.m;
    if (!B) return null;
    /* **单位口径**：lastWave = [fx, fy, kx, ky]，fx/fy 是**分数坐标**（0..1，
       gaussianWave 内部 cx=fx·grid）——旧版直接把 fy 当 texel 用，θ₀ 随 B
       差一个 grid 因子（B=0.05、fy=0.5 时 θ₀ 由 6.4 误算成 0.325）。现统一
       折到 texel 中心（y_c = fy·grid，texel y 的中心在 y+0.5，与 shader 的
       yT=vUv.y/uTexel.y 同口径）。 */
    const w = state.lastWave;
    const kx = w ? (w[2] || 0) : 0;
    const yc = w ? w[1]*state.grid + 0.5 : state.grid/2;
    /* 轨道振幅 θ₀ = k_x + B·y_c（φ₀=k_y≈0 时 y_c 是轨道**上端**：θ̇=(B/m)sinφ
       在 φ=0 处为 0 ⟹ y 取极值）。轨道 y 向展开 = [y_c−2θ₀/B, y_c]（波包
       有限尺寸使实际轨迹略宽，Ehrenfest 修正见 worklog R63）。 */
    const th0 = Math.abs(kx + B*yc);
    const T0 = 2*Math.PI*m/B;                       /* 连续统/谐振极限 T₀ */
    /* θ₀ ≥ π ⟹ 轨道跨越 θ=±π（sinθ 的零点 = 布里渊边界），闭式的推导前提
       （θ 在 (−π,π) 内做单摆式振荡）失效：θ₀→π⁻ 时 T 对数发散，越过 π 后
       公式给的是另一支的「假周期」（s=sin(θ₀/2) 回落，T 反而变小）。如实
       置 valid=false 并让 T/ratio 为 NaN，由 HUD/扫描器标注近似失效——不静默
       返回一个看似合理的错数。 */
    const valid = th0 < Math.PI - 1e-9;
    const T = valid ? this._landauPeriod(B, m, th0) : NaN;   /* 晶格半经典（含非谐） */
    return {
      B, m, kx, yc, th0, wc: B/m, T0, T, ratio: valid ? T/T0 : NaN, valid,
      yLo: yc - 2*th0/B, yHi: yc,                   /* 半经典轨道 y 向包络（texel） */
      rOrb: 2*th0/B,                                /* y 向全展（撞壁判据用） */
    };
  }

  _landauPeriod(B, m, th0){
    /* T(θ₀) = (4m/B)∫₀^{π/2} dα/√((1−s²sin²α)(1−s²cos²α))，复合 Simpson */
    const s = Math.sin(0.5*th0), s2 = s*s;
    const N = 256, h = Math.PI/2/N;
    const f = a => 1/Math.sqrt((1 - s2*Math.sin(a)*Math.sin(a))*(1 - s2*Math.cos(a)*Math.cos(a)));
    let sum = f(0) + f(Math.PI/2);
    for (let i = 1; i < N; i++) sum += (i % 2 ? 4 : 2)*f(i*h);
    return 4*m*sum*h/3/B;
  }

  /* 重画 R67 两座势（滑块改参数后由 app 调用；与 presets 的 build 同源） */
  paintDb(paint){ drawDBarrier(paint); }
  paintFw(paint){ drawFWell(paint); }

  /* ---------- R67 一维势谱：双垒共振（离散 TMM）+ 有限深阱（超越方程） ---------- */

  /* 离散转移矩阵：与 GPU 的 5 点 stencil 在 1D 截面上**同一递推**
       ψ_{n+1} = (2 − (E−V_n)/uK)·ψ_n − ψ_{n−1}
     与连续 TMM 的唯一差别是色散关系 E=2uK(1−cos k)（格点口径，不是 k²/2m）。
     取两个基解（入射 e^{+ikn} 与 e^{−ikn}）线性叠加，右端只剩出射波 ⟹ 解出 r、t，
     T=|t|²。势按 8 位纹理同口径量化（round(V·127)/127），否则与 GPU 差一个
     ~0.4% 的高度偏差。 */
  dbTmm(E, opts){
    const m = opts.m || 1, uK = 0.5/m;
    const n = opts.n || 256;
    if (!(E > 0) || E >= 4*uK) return { T: 0, k: 0 };
    const k = Math.acos(1 - E/(2*uK));
    const v0q = Math.round(Math.max(0, Math.min(1, opts.v0))*127)/127;
    const bw = opts.bw, gap = opts.gap;
    const x1 = 128 - gap/2 - bw, x2 = 128 + gap/2, x3 = x2 + bw;
    const V = new Float64Array(n);
    for (let i = 0; i < n; i++){
      const wx = i + 0.5;
      V[i] = ((wx >= x1 && wx < x1 + bw) || (wx >= x2 && wx < x3)) ? v0q : 0;
    }
    /* 索引约定：arr[0]=ψ_{−1}、arr[1]=ψ_0、…、arr[n+2]=ψ_{n+1} */
    const ar = new Float64Array(n + 3), ai = new Float64Array(n + 3);
    const br = new Float64Array(n + 3), bi = new Float64Array(n + 3);
    ar[0] = Math.cos(k); ai[0] = -Math.sin(k);     /* e^{−ik n} */
    ar[1] = 1; ai[1] = 0;
    br[0] = Math.cos(k); bi[0] = Math.sin(k);      /* e^{+ik n} */
    br[1] = 1; bi[1] = 0;
    /* 循环上界必须是 n（含 i=n）：右端匹配要同时用 ψ_N=arr[n+1] 与
       ψ_{N+1}=arr[n+2]，只算到 i=n−1 会让 arr[n+2] 恒为 0 ⟹ numer 恒等于
       −A_N e^{ik} ⟹ 无势时 T 也归零（R67 初版即踩到，靠「v0=0 应 T=1」
       这条对照抓出）。 */
    for (let i = 0; i <= n; i++){
      const vv = (i < n) ? V[i] : 0;
      const c = 2 - (E - vv)/uK;
      ar[i + 2] = c*ar[i + 1] - ar[i];
      ai[i + 2] = c*ai[i + 1] - ai[i];
      br[i + 2] = c*br[i + 1] - br[i];
      bi[i + 2] = c*bi[i + 1] - bi[i];
    }
    /* 右端：A_N + r·B_N = t·e^{ikN}；A_{N+1} + r·B_{N+1} = t·e^{ik(N+1)}
       ⟹ r = (A_{N+1} − A_N e^{ik}) / (B_N e^{ik} − B_{N+1}) */
    const ck = Math.cos(k), sk = Math.sin(k);
    const aNr = ar[n + 1], aNi = ai[n + 1], aN1r = ar[n + 2], aN1i = ai[n + 2];
    const bNr = br[n + 1], bNi = bi[n + 1], bN1r = br[n + 2], bN1i = bi[n + 2];
    /* numer = A_{N+1} − A_N·e^{ik} */
    const nur = aN1r - (aNr*ck - aNi*sk), nui = aN1i - (aNr*sk + aNi*ck);
    /* denom = B_N·e^{ik} − B_{N+1} */
    const der = (bNr*ck - bNi*sk) - bN1r, dei = (bNr*sk + bNi*ck) - bN1i;
    const dd = der*der + dei*dei;
    if (!(dd > 0)) return { T: 0, k };
    const rr = (nur*der + nui*dei)/dd, ri = (nui*der - nur*dei)/dd;
    /* t = (A_N + r B_N)·e^{−ikN} */
    const tr0 = aNr + (rr*bNr - ri*bNi), ti0 = aNi + (rr*bNi + ri*bNr);
    const ph = -k*n, cp = Math.cos(ph), sp = Math.sin(ph);
    const tr = tr0*cp - ti0*sp, ti = tr0*sp + ti0*cp;
    return { T: tr*tr + ti*ti, k, r: Math.hypot(rr, ri) };
  }

  /* 扫 E 出 T(E) 曲线 + 定位共振峰。
     **峰宽的实测口径**：对称双垒的共振全宽 Γ ≈ 2E·√(T_单垒)，而 T_单垒 ≈
     4e^{−2κb} 随垒厚指数下降。默认 b=4（薄垒）时 Γ/E ~ 1e-2，8000 点网格
     （步长 2.6e-5）能画出峰形；把 b 调到 8 时 Γ/E ~ 1e-5，第一个峰窄到
     1e-7 —— 20 万点细扫都只能踩到肩部（实测记录在 worklog）。因此：
     · 曲线用 8000 点均匀网格（画「背景透射」与可分辨的峰）；
     · 峰检测 = 局部极大（T>0.5）+ 近邻合并（间距 < 6e-3 视为同一个）+
       三分细化（把峰顶 T 逼到 1）；
     · 明显窄到分辨不出的低能峰不假装找到，面板如实标注「未分辨」。
     单垒对照：gap=0 时两片墙相邻 ⟹ 等价于宽 2b 的单垒（这条口径写进 hint，
     否则会误以为「单垒也有峰」）。 */
  dbCurve(opts){
    const o = Object.assign({ v0: 0.2, bw: 4, gap: 28, n: 256, m: 1, nE: 8000 }, opts);
    const uK = 0.5/o.m;
    const Emax = Math.min(o.v0*1.05, 4*uK*0.995);
    const pts = [];
    for (let i = 0; i < o.nE; i++){
      const E = 2e-4 + (Emax - 2e-4)*i/(o.nE - 1);
      pts.push({ E, T: this.dbTmm(E, o).T });
    }
    const raw = [];
    for (let i = 1; i < pts.length - 1; i++){
      if (pts[i].T > 0.5 && pts[i].T >= pts[i-1].T && pts[i].T > pts[i+1].T) raw.push(pts[i]);
    }
    const merged = [];
    for (const p of raw){
      const last = merged[merged.length - 1];
      if (last && p.E - last.E < 6e-3){ if (p.T > last.T) merged[merged.length - 1] = p; }
      else merged.push(p);
    }
    /* 三分细化：峰顶多半落在两个采样点之间 */
    const Tof = E => this.dbTmm(E, o).T;
    const step = (Emax - 2e-4)/(o.nE - 1);
    const peaks = merged.map(p => {
      let lo = p.E - step, hi = p.E + step;
      for (let k = 0; k < 60; k++){
        const m1 = lo + (hi - lo)/3, m2 = hi - (hi - lo)/3;
        if (Tof(m1) < Tof(m2)) lo = m1; else hi = m2;
      }
      const E = 0.5*(lo + hi);
      return { E, T: Tof(E) };
    });
    /* 中央阱的准束缚能级估计（**无限深阱**口径）：(nπ/gap)²·uK。
       有限高垒会把它整体压低 ~20%（波函数渗入垒区），故只作量级参考，
       面板明确标注「无限深阱估计」。 */
    const est = [];
    for (let n = 1; n <= 10; n++){
      const E = uK*Math.pow(n*Math.PI/o.gap, 2);
      if (E < Emax) est.push({ n, E });
    }
    return { pts, peaks, est, Emax, uK };
  }

  /* 波包谱卷积后的透射率（**与 GPU 实测可比的量**）。
     TMM 的 T(E) 是**单色平面波**的透射率：共振峰 T=1、宽 Γ≈2E√(T_单垒)。
     有限宽波包在 k 空间有 σ_k=1/(√2σ_x) 的展宽 ⟹ ΔE=sin(k)·σ_k，默认
     σ=14、E=0.078 时 ΔE≈0.020 而 Γ≈0.002，**峰被稀释 10 倍**。所以
     GPU 实测的 T 不该与单点 TMM 直接比（实测 0.009–0.13 vs 单色 1.0），
     而应与 ∫T(E(k))·G(k−k₀)dk 比——这正是 R29 矩垒扫描的 Δk 卷积口径。
     高斯加权、±3σ、41 点。 */
  dbConvT(E0, sigma, opts){
    const uK = 0.5/(opts.m || 1);
    const sk = 1/(Math.SQRT2*Math.max(1e-6, sigma));
    const k0 = Math.acos(Math.max(-1, Math.min(1, 1 - E0/(2*uK))));
    const N = 41;
    let num = 0, den = 0;
    for (let i = 0; i < N; i++){
      const dk = (i - (N - 1)/2)*(6*sk/(N - 1));
      const k = k0 + dk;
      if (k <= 1e-6 || k >= Math.PI - 1e-6) continue;
      const E = 2*uK*(1 - Math.cos(k));
      const w = Math.exp(-0.5*(dk/sk)*(dk/sk));
      num += w*this.dbTmm(E, opts).T;
      den += w;
    }
    return den > 0 ? num/den : 0;
  }

  /* 有限深方阱的 1D 束缚态（超越方程，连续口径）：
       偶：z·sin z − √(z₀²−z²)·cos z = 0
       奇：z·cos z + √(z₀²−z²)·sin z = 0
     z = k·a/2、z₀ = (a/2)√(V₀/uK)，E = 4uK z²/a² − V₀。
     写成这两个整函数形式（而非 z·tan z = …）是为了避开 tan/cot 的极点，
     可以在 (0,z₀) 上直接扫符号变化 + 二分。 */
  fwellLevels(opts){
    const o = Object.assign({ v0: 0.15, a: 48, n: 128, m: 1 }, opts);
    const uK = 0.5/o.m;
    const s = 256/o.n;
    /* 阱宽用**实际阱内格点数**（不是 a/s 的连续值）：势纹理的判据是
       |(i+0.5)s−128| < a/2，边界那一个格点进不进会差 ~4% 的宽度 ⟹ 差 ~8% 的
       能级。与 fwellSpectrum 的 V 构造逐字同口径，对照才有意义。 */
    let nIn = 0;
    for (let i = 0; i < o.n; i++) if (Math.abs((i + 0.5)*s - 128) < o.a/2) nIn++;
    /* **单位口径**：aG 必须是**格点数**（不是世界 px）——uK=0.5/m 是格距=1 的
       动能系数，z₀=(a/2)√(V₀/uK) 里的 a 与它同单位。写成 nIn*s（世界 px）会
       差一个 s=256/n 倍（n=128 时能级差 4 倍、束缚态数从 5 变 9）。 */
    const aG = nIn;
    const v0q = Math.round(Math.max(0, Math.min(1, o.v0))*127)/127;
    const z0 = (aG/2)*Math.sqrt(v0q/uK);
    const fE = z => z*Math.sin(z) - Math.sqrt(Math.max(0, z0*z0 - z*z))*Math.cos(z);
    const fO = z => z*Math.cos(z) + Math.sqrt(Math.max(0, z0*z0 - z*z))*Math.sin(z);
    const roots = [];
    const M = 4000;
    const scan = (f, parity) => {
      let pz = 1e-9, prev = f(pz);
      for (let i = 1; i <= M; i++){
        const z = z0*i/M, cur = f(z);
        if (prev === 0 || (prev < 0) !== (cur < 0)){
          let lo = pz, hi = z;
          const flo = prev;
          for (let t = 0; t < 64; t++){
            const mid = 0.5*(lo + hi);
            if ((flo < 0) !== (f(mid) < 0)) hi = mid; else lo = mid;
          }
          const zr = 0.5*(lo + hi);
          roots.push({ z: zr, E: 4*uK*zr*zr/(aG*aG) - v0q, parity });
        }
        prev = cur; pz = z;
      }
    };
    scan(fE, 'even'); scan(fO, 'odd');
    roots.sort((p, q) => p.E - q.E);
    return { roots, z0, aG, nIn, v0q, uK,
             nBound: roots.length };
  }

  /* 有限深阱的**离散色散**超越方程（与连续版对照用，面板不显示）。
     连续版用 k²/2m 与 κ²/2m；格点上是 E_in = 2uK(1−cos k)、|E| = 2uK(cosh κ−1)，
     两者在 k~0.5 时差 ~2%（绝对 ~3e-3），对**最浅的束缚态**（|E|~7e-3）就是
     40%+ 的相对偏差。这个版本用离散色散重解同一个匹配条件：
       偶：k·sin(k a/2) − κ·cos(k a/2) = 0
       奇：k·cos(k a/2) + κ·sin(k a/2) = 0
     若它与数值对角化的偏差落到 <1%，就证明「连续 vs 数值」的差确实只是色散
     修正，而不是求解器的 bug（R67 的归因实验）。 */
  fwellLevelsDisc(opts){
    const o = Object.assign({ v0: 0.15, a: 48, n: 128, m: 1 }, opts);
    const uK = 0.5/o.m, s = 256/o.n;
    let nIn = 0;
    for (let i = 0; i < o.n; i++) if (Math.abs((i + 0.5)*s - 128) < o.a/2) nIn++;
    const aG = nIn;
    const v0q = Math.round(Math.max(0, Math.min(1, o.v0))*127)/127;
    const f = (E, parity) => {
      const Ei = E + v0q;
      if (!(Ei > 0) || Ei >= 2*uK) return NaN;
      const k = Math.acos(1 - Ei/(2*uK));
      const kap = Math.acosh(Math.max(1, 1 + Math.abs(E)/(2*uK)));
      const t = k*aG/2;
      return parity === 'even' ? k*Math.sin(t) - kap*Math.cos(t)
                               : k*Math.cos(t) + kap*Math.sin(t);
    };
    const roots = [];
    const M = 20000;
    const eLo = -v0q + v0q*1e-4, eHi = -v0q*1e-4;
    for (const parity of ['even', 'odd']){
      let pE = eLo, pf = f(eLo, parity);
      for (let i = 1; i <= M; i++){
        const E = eLo + (eHi - eLo)*i/M;
        const cur = f(E, parity);
        if (isFinite(pf) && isFinite(cur) && ((pf < 0) !== (cur < 0))){
          let lo = pE, hi = E;
          const flo = pf;
          for (let t = 0; t < 64; t++){
            const mid = 0.5*(lo + hi);
            const fm = f(mid, parity);
            if (((flo < 0) !== (fm < 0))) hi = mid; else lo = mid;
          }
          roots.push({ E: 0.5*(lo + hi), parity });
        }
        pE = E; pf = cur;
      }
    }
    roots.sort((p, q) => p.E - q.E);
    return { roots, aG, nIn, v0q, uK };
  }

  /* 有限深阱的束缚态谱：**沿 x 的 1D 截面精确对角化**，与超越方程逐项对照。
     y 向取 Dirichlet 基模（势沿 y 均匀 ⟹ 横向是精确的可分离因子），把 1D 本征
     向量乘上它再展开成 2D，供「显示本征态」使用。
     返回 { evals, evecs(全长 grid²), ms, nIn, aG }。 */
  fwellSpectrum(opts){
    const o = Object.assign({ grid: 128, m: 1, nev: 6 }, opts);
    const g = o.grid, m = o.m, uK = 0.5/m, s = 256/g;
    const v0q = Math.round(Math.max(0, Math.min(1, o.v0))*127)/127;
    const d = new Float64Array(g), e = new Float64Array(g);
    let nIn = 0;
    for (let x = 0; x < g; x++){
      const wx = (x + 0.5)*s;
      const inW = Math.abs(wx - 128) < o.a/2;
      if (inW) nIn++;
      d[x] = 2*uK + (inW ? -v0q : 0);      /* 1D 5 点 stencil 的对角元 */
      e[x] = -uK;                          /* 次对角 */
    }
    e[0] = 0;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const { vals, vecs } = tridiagEig(d, e, g);
    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    const nev = Math.min(o.nev, g);
    const evals = Array.from(vals.subarray(0, nev));
    /* y 向基模（与 makeYBase 同式：sin(π(y+1)/(g+1)) 归一化） */
    const yb = new Float64Array(g);
    let ss = 0;
    for (let y = 0; y < g; y++){ yb[y] = Math.sin(Math.PI*(y + 1)/(g + 1)); ss += yb[y]*yb[y]; }
    const inv = 1/Math.sqrt(ss);
    for (let y = 0; y < g; y++) yb[y] *= inv;
    const evecs = [];
    for (let j = 0; j < nev; j++){
      const full = new Float64Array(g*g);
      for (let y = 0; y < g; y++){
        const wy = yb[y];
        for (let x = 0; x < g; x++) full[y*g + x] = vecs[j*g + x]*wy;
      }
      evecs.push(full);
    }
    return { evals, evecs, ms, nIn, aG: nIn*s, nc: g };
  }

  /* ---------- R64 量子弹球：谱求解（引擎层 linearSpectrum 的包装） ----------
     opts: { grid, m, kind } 或 { grid, m, V, vCut, nev, eps }
     求解器已下沉到 kernel.js（R65 的 GP 双阱 ΔE 也要用，放在内核里会导致
     「非薛定谔内核拿不到」——R65 首次实现即踩到，静默返回 null）。
     弹球走解析几何 inside；其余走 V 数组。返回 { evals, evecs(全长), resid,
     mK, cgAvg, nc, ms, meanR }。 */
  spectrum(opts){
    const n = opts.grid || 128, m = opts.m;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let r;
    if (opts.V){
      r = linearSpectrum({ n, m, V: opts.V, vCut: opts.vCut, nev: opts.nev, eps: opts.eps });
    } else {
      const kind = opts.kind === 'circle' ? 'circle' : 'stadium';
      const S = 256/n;
      r = linearSpectrum({ n, m, nev: opts.nev, eps: opts.eps,
        inside: (x, y) => billiardInside(x*S, y*S, kind) });
    }
    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return Object.assign(r, { ms, meanR: meanR(r.evals), evals: r.evals });
  }

  /* 势场重画（形状下拉 / 预设共用入口；与 drawBilliardV 单源） */
  paintBilliard(paint){
    drawBilliardV(paint, paint.state.billKind === 'circle' ? 'circle' : 'stadium');
  }

  /* R62 Bloch 能带的解析模型（HUD「E → 最近能级」与 BlochScanner 叠图共用，
     单源真值）。返回 mathieuBands 全字段 + 横向基模能量 ey0。
     **口径说明（与实测对账的前提，见 worklog R62「解析对照的口径」）**：
       实测 E = E_x(带,k) + ey0（2D 可分离 + 每步 y 基模投影 ⟹ 严格成立）；
       ey0 = uK·(2−2cos(π/(grid+1)))（Dirichlet y 基模）。
       连续谱对照的有效质量为 m·(grid/256)² ⟹ **只有 grid=256 时 mathieuBands
       的 (m, a) 才与离散系统同一物理系统**；其余网格下二者是不同系统（差
       80%~500%），扫描/HUD 均按 grid=256 口径给出（BlochScanner 强制 256）。 */
  blochModel(state){
    const o = { m: state.m, a: state.latA, V0: state.latV0, kN: 65 };
    const B = mathieuBands(o);
    const ey0 = (0.5/state.m)*(2 - 2*Math.cos(Math.PI/(state.grid + 1)));
    return Object.assign(B, {
      ey0, q: mathieuQ(o), m: o.m, a: o.a, V0: o.V0,
      /* 带 1/2 的「可比对账曲线」= 解析带 + 横向基模能量 */
      ref1: B.band1.map(v => v + ey0), ref2: B.band2.map(v => v + ey0),
    });
  }

  /* 解析能级阶梯（HUD「E → 最近能级」对照）：仅 box/harmonic 两预设返回，
     其余 null（HUD 隐藏该区）。单位与引擎一致：格点（texel）单位、ℏ=1、
     m=state.m。两个势场的解析谱：
       box（世界边界 Dirichlet，格点边长 g）：E(nx,ny)=c·(nx²+ny²)，
         c=(0.5/m)·(π/g)²（离散本征值 2sin²(nπ/2g)/m 的小 n 极限，n≪g 时
         与连续谱一致；预设波包 k≈0.12 ⟹ n≈10，截断误差 O((nπ/g)⁴)≈2e-6 可忽略）；
       harmonic（V=2.2e-5·d²，d 为势场画布像素）：画布恒 256² 且按世界坐标
         采样 ⟹ 格点坐标 V=2.2e-5·(256/g)²·r²，ℏω=√(4.4e-5/m)·256/g，
         E(n)=(n+½)·ℏω（n=nx+ny，2D 各向同性简并）。
     注意：波包是本征态的叠加，⟨E⟩ 与最近能级的差属正常（非守恒量偏差）；
     用户笔刷改动势场后解析模型不再精确——该区仅作预设势场的参照。 */
  energyLevels(state){
    const g = state.grid, m = state.m;
    const fmtE = v => Math.abs(v) < 1e-3 ? v.toExponential(2) : v.toFixed(6);
    if (state.preset === 'box'){
      const c = 0.5/m * Math.pow(Math.PI/g, 2);
      const E = (nx, ny) => c*(nx*nx + ny*ny);
      return {
        kind: '无限深方阱',
        param: 'c=' + fmtE(c),
        nearest(e){
          const tgt = e/c;
          let best = null;
          for (let nx = 1; nx <= 80 && nx*nx <= tgt + 0.25; nx++){
            const r2 = tgt - nx*nx;
            if (r2 < 0.25) break;
            const ny0 = Math.max(1, Math.round(Math.sqrt(r2)));
            for (let d = -1; d <= 1; d++){
              const ny = ny0 + d; if (ny < 1) continue;
              const ev = E(nx, ny), err = Math.abs(ev - e);
              if (!best || err < best._err) best = { label: '(' + nx + ',' + ny + ')', e: ev, d: ev - e, _err: err };
            }
          }
          return best;
        },
      };
    }
    if (state.preset === 'harmonic'){
      const w = Math.sqrt(4.4e-5/m) * 256/g;      /* ℏω（格点单位） */
      const E = n => (n + 0.5)*w;
      return {
        kind: '谐振子势',
        param: 'ℏω=' + fmtE(w),
        nearest(e){
          const n = Math.max(0, Math.round(e/w - 0.5));
          return { label: '' + n, e: E(n), d: E(n) - e };
        },
      };
    }
    if (state.preset === 'lattice'){
      /* R62 Mathieu 能带模型（mathieu.js，scipy 对账锚点）：HUD 显示当前
         k=θ/a 的带 1/带 2 位置与 BZ 边界 gap。k 网格线性插值（kN=65）。 */
      const B = this.blochModel(state);
      const o = { m, a: state.latA, V0: state.latV0 };
      const q = B.q;
      const k = (state.twistX || 0)/o.a;
      const f = Math.max(0, Math.min(1, k/B.kMax))*(B.kN - 1);
      const i0 = Math.floor(f), i1 = Math.min(B.kN - 1, i0 + 1), fr = f - i0;
      const lerp = arr => arr[i0]*(1 - fr) + arr[i1]*fr;
      return {
        kind: '光学晶格 Mathieu',
        param: 'V₀=' + fmtE(o.V0) + ' · a=' + o.a + ' · q=' + fmtE(q) + ' · gap=' + fmtE(B.gap.width),
        nearest(e){
          /* ref1/ref2 = 解析带 + 横向基模能量 ey0 ⟹ 与实测 ⟨E⟩ 同口径可比 */
          const e1 = lerp(B.ref1), e2 = lerp(B.ref2);
          const d1 = e1 - e, d2 = e2 - e;
          return Math.abs(d1) <= Math.abs(d2)
            ? { label: '带1', e: e1, d: d1 }
            : { label: '带2', e: e2, d: d2 };
        },
      };
    }
    return null;
  }

  /* 透射率扫描的解析模型（契约第 6 项；引擎「透射率扫描」工具的理论曲线）。
   实现抽取到 barrier.js（与 Pauli 内核共用——B=0 时两内核的矩垒透射逐字
   一致）；推导与数值约定见该文件头部注释。 */
  transmissionModel(state){
    return rectangularBarrierModel(state.m);
  }

  presets(){
    const self = this;
    /* R62 光学晶格：V=V₀sin²(πx/a)（a=32 世界 px ⟹ 8 周期）；势重画实现提到
       模块级 drawLatticeV（presets.build 与 enterLattice 共用，单源真值）。 */
    const P = {
      free:     { name:'自由传播',     text:'高斯波包在无势场中飞行。色相保持纯净，但波包随时间自然扩散——不确定性原理的直接可视化。',
                  build(){} , wave:[0.18,0.5,0.09,0] },
      barrier:  { name:'方势垒隧穿',   text:'波包撞上高于自身能量的势垒：大部分概率幅被反射形成驻波图样，一小部分密度隧穿到墙后。纯量子效应。',
                  build(paint){ paint.vctx.fillStyle = paint.vGray(0.02); paint.vctx.fillRect(120,30,16,196); }, wave:[0.10,0.5,0.09,0] },
      slits:    { name:'双缝干涉',     text:'物质波穿过双缝后自我干涉：两列概率幅叠加，远处逐渐长出明暗相间的干涉条纹。每个粒子抵达屏幕的位置由 |ψ|² 决定。',
                  build(paint){ paint.vctx.fillStyle = paint.vGray(0.05); paint.vctx.fillRect(112,0,12,256);
                                paint.vctx.fillStyle = paint.vGray(0);   paint.vctx.fillRect(112,80,12,24); paint.vctx.fillRect(112,136,12,24); }, wave:[0.06,0.5,0.10,0] },
      ab:       { name:'AB 效应',      text:'双缝之间放置若干根无限细螺线管（点空白添加新管、点已有环选中分别调 Φ、Delete 删除，上限 8 根）：磁场 B 被完全约束在各管内，管外 B=0——但矢势 A≠0。从两缝出发、分别绕过螺线管两侧的两条路径包围不同磁通，获得附加相位差 Δφ=Φ，屏幕上的干涉条纹整体平移，而粒子从未进入有磁场的区域。这就是 Aharonov-Bohm 效应：相位由矢势决定，不由力决定。Φ=π 时明暗条纹互换；把 Φ 滑回 0 即回归标准双缝；多管时各管磁通按矢势可加性线性叠加。',
                  build(paint){ paint.vctx.fillStyle = paint.vGray(0.05); paint.vctx.fillRect(112,0,12,256);
                                paint.vctx.fillStyle = paint.vGray(0);   paint.vctx.fillRect(112,80,12,24); paint.vctx.fillRect(112,136,12,24); },
                  wave:[0.06,0.46875,0.20,0],
                  params:{ abSols:[[0.56,0.46875,Math.PI]], abSel:0, sigma:30 } },
      harmonic: { name:'谐振子势',     text:'V = ½mω²r² 抛物势阱中的波包周期性呼吸、振荡，逐步逼近能量本征态。这是量子版本的小球滚碗底。',
                  build(paint){ const img = paint.vctx.getImageData(0,0,256,256);
                                for(let y=0;y<256;y++) for(let x=0;x<256;x++){ const d2=(x-128)*(x-128)+(y-128)*(y-128);
                                  const v = Math.min(1, 2.2e-5*d2); const g = Math.round((v+1)/2*255); const i=(y*256+x)*4;
                                  img.data[i]=g; img.data[i+1]=g; img.data[i+2]=g; img.data[i+3]=255; }
                                paint.vctx.putImageData(img,0,0); }, wave:[0.5,0.40,0.0,0.035] },
      drive:    { name:'行波驱动',     text:'谐振子势阱上叠加 x 方向行波外场 V_d = A·cos(2πx−ωt)。驱动力的时间平均为零，波包却被周期性地推拉：质心围绕阱心做受迫振荡——含时外场（AC Stark 位移的行波版）的直接可视化。切到「均匀 AC Stark」模式则只整体调制能级，密度图样保持对称。',
                  build(paint){ const img = paint.vctx.getImageData(0,0,256,256);
                                for(let y=0;y<256;y++) for(let x=0;x<256;x++){ const d2=(x-128)*(x-128)+(y-128)*(y-128);
                                  const v = Math.min(1, 2.2e-5*d2); const g = Math.round((v+1)/2*255); const i=(y*256+x)*4;
                                  img.data[i]=g; img.data[i+1]=g; img.data[i+2]=g; img.data[i+3]=255; }
                                paint.vctx.putImageData(img,0,0); }, wave:[0.5,0.5,0,0],
                  params:{ driveAmp:0.05, driveOmega:0.05, driveMode:1, sigma:8 } },
      scatter:  { name:'圆形散射体',   text:'高速波包遭遇圆柱势垒：迎头部分全反射，边缘发生衍射，几何阴影区后方浮现衍射尾波。',
                  build(paint){ paint.vctx.fillStyle = paint.vGray(0.5); paint.vctx.beginPath(); paint.vctx.arc(128,128,24,0,7); paint.vctx.fill(); }, wave:[0.10,0.5,0.14,0] },
      box:      { name:'无限深方阱',   text:'四壁为无限高势墙（世界边界）的盒子。波包斜向入射，往复弹跳并与自身发生干涉。',
                  build(){} , wave:[0.5,0.5,0.12,0.10] },
      /* R64 量子弹球：腔外 V=1.0 高势当硬壁（E~1e-3 时外泄 e^{−11}≈1e-5）。
         stadium 额外带一个偏心小凸起（半径 7）破坏 x/y 反射对称——否则谱会
         按四个不可约表示裂成多条独立序列，低能 ⟨r⟩ 被系统性拉低（见面板说明）。 */
      billiard: { name:'量子弹球（stadium）', text:'跑道形硬壁腔（矩形 2a×2r + 两端半圆）+ 一个偏心小凸起。Bunimovich 证明这类腔的经典动力学是**混沌**的（正 Lyapunov 指数）：相邻轨道指数分离。量子侧的两个签名：① 能级互相**排斥**（⟨r⟩→0.53，GOE）而不是随机遇合；② 高激发态出现 **scar**——沿不稳定周期轨道增强的密度脊。点「求谱」用 Lanczos 解前若干个本征态，再选带序号把该本征态画到场上。凸起的作用是破坏 x/y 反射对称：没有它时谱按四个不可约表示分裂，低能区会假装成可积系统（这是对称性守恒量的物理后果，不是数值问题）。',
                  build(paint){ drawBilliardV(paint, 'stadium'); },
                  wave:[0.5,0.5,0.06,0.04], params:{ billKind:'stadium', sigma:8 } },
      billiardC:{ name:'量子弹球（圆形）', text:'圆形硬壁腔——**可积**系统的标准例子（能量 + 角动量两个守恒量）。谱是若干独立角动量序列的叠加、含大量简并（m≠0 的 Bessel 零点二重简并），能级间距服从 Poisson 分布 ⟹ ⟨r⟩ 明显低于混沌腔。把它与 stadium 的 ⟨r⟩ 对照，就是「经典混沌如何写进量子谱」的最直接演示。注意：简并子空间里 Lanczos 给出的本征向量是任意正交组合，能量仍准到 1e-8，但图样不保证是实的角动量本征态。',
                  build(paint){ drawBilliardV(paint, 'circle'); },
                  wave:[0.5,0.5,0.06,0.04], params:{ billKind:'circle', sigma:8 } },
      lattice:  { name:'光学晶格',       text:'V=V₀sin²(πx/a) 周期势（默认 V₀=0.1、a=32 世界 px，8 个周期）——原子在光场驻波中的标准模型。Bloch 定理：周期势中本征态满足 ψ(x+a)=e^{ika}ψ(x)，准动量 k 只在简约布里渊区 [0,π/a] 内独立，能量分成能带，带间是能隙（gap）。「Bloch 相位 θ」滑块直接设定 θ=k·a（0→π 覆盖整个简约 BZ；GPU 边界按 e^{±iθ} wrap 携带——总相位是 h·θ，h=网格内周期数）；平面波初态在晶格中演化时能带色散与散射清晰可见。「Bloch 弛漾」按钮做 CPU 虚时间流（PR-ADI + twisted 循环三对角 + 晶体动量块投影），收敛到当前 (k, 带) 的精确本征态——带 2 以带 1 收敛态作 Gram-Schmidt 投影。「Bloch 能带扫描」逐 k 测两带 ⟨E⟩，叠图 1D Mathieu 解析谱（含横向基模能量）：V₀/a 滑块改变晶格深度与周期，能隙随之宽窄。',
                  build(paint){ self._mode = 'lattice'; drawLatticeV(paint); }, wave:[0.5,0.5,0.30,0],
                  params:{ latV0:0.1, latA:32, twistX:0, latBand:1 } },
      /* R67 一维势谱两座势：双垒（共振透射）与有限深阱（束缚态计数）。
         两者都是「沿 y 均匀」的 1D 势——2D 谱 = 1D 谱 + 横向基模，可拿 1D
         解析解做硬对照（Mathieu/弹球同法）。 */
      dbarrier:{ name:'双势垒共振', text:'两片方墙夹出一个中央阱（默认墙宽 4、阱宽 28、高 0.2）。经典粒子只要 E<V₀ 就必被反射；量子波包在**特定能量**下却能近乎全透射——中央阱里形成的准束缚驻波与两侧倏逝波相位匹配（Ramsauer–Townsend 共振），峰位≈阱的准束缚能级 (nπ/gap)²·uK。点「求 T(E)」用**离散转移矩阵**（与 GPU 同一 5 点递推，色散 E=2uK(1−cos k)）一次算出整条曲线并标出共振峰；「实测当前 k」跑一次真实波包演化，把 GPU 的 T 叠到曲线上对照。单垒对照：去掉一片墙（把阱宽调到 0）曲线就单调无峰。', 
                  build(paint){ drawDBarrier(paint); }, wave:[0.18,0.5,0.55,0], params:{ dV0:0.2, dBw:4, dGap:28, sigma:14 } },
      fwell:    { name:'有限深方阱', text:'深 V₀、宽 a 的一维方阱（沿 y 均匀）。与无限深阱的关键差别：**束缚态数有限**——只有 E<0 的态被束缚，且解由超越方程 z·tan z=√(z₀²−z²)（偶）/ −z·cot z=√(z₀²−z²)（奇）给出，z₀=(a/2)√(V₀/uK)。阱越浅或越窄，能级越少、越往上越稀疏。点「求束缚态」沿 x 做 **1D 三对角精确对角化**（QL 隐含移位），与教科书连续解逐项对照并把选中态画到场上。为什么不套用 R64 的 2D 谱求解器：「2D 谱 = 1D 谱 + 横向基模」只在每个 n_x 都取 n_y=1 时成立，而谱求解器不知道要挑这些态——实测 128²/V₀=0.15/a=48 的前 10 个 Ritz 值全挤在基态附近（横向模间距 ~1e-3），与 1D 的 5 个束缚态最坏差 2815%。',
                  build(paint){ drawFWell(paint); }, wave:[0.5,0.5,0,0], params:{ fV0:0.15, fWa:48, sigma:10 } },
    };
    /* R63 修复（R62 遗留）：_mode 是 makeWave 的场景开关，此前**只有** lattice
       的 build 会置 'lattice' 且从不复位——从晶格切回任意其它预设后，makeWave
       仍走 Bloch 平面波初态：初态忽略 fx/fy/kx/ky ⟹ 拖拽发射完全失效、Landau
       扫描的自定义发射几何也拿不到高斯包（静默错误，画面仍「正常」）。
       此处统一包装：除 lattice 外所有预设的 build 先把 _mode 归 'free'。
       集中一处，避免 8 个 build 各自漏写。 */
    for (const key in P){
      if (key === 'lattice') continue;
      const b = P[key].build;
      P[key].build = (paint) => {
        self._mode = 'free';
        /* R66 反向守卫：NLS 的暗孤子预设借 twistX 开 x 周期边界（1e-9），
           切回薛定谔的非 lattice 预设时必须归零，否则波包会 x 向绕回。 */
        if (paint && paint.state) paint.state.twistX = 0;
        if (b) b(paint);
      };
    }
    return P;
  }
}

registerKernel(new SchrodingerKernel());
