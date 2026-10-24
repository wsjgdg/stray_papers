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
import { mulberry32 } from './qcircuit.js';

export const NZ_DEFAULTS = {
  kind: 'relax',                 /* 噪声类型：relax | dephase | depolar */
  n: 1,                          /* 比特数（1 = 单比特 Bloch；2 = Bell 纠缠） */
  tau: 1.0,                      /* 当前通道的时间常数（显示为 T₁ / T₂ / T_dep） */
  theta: Math.PI / 2, phi: 0,    /* 单比特初态 |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩ */
  dt: 0.01, steps: 400,
  side: 'both',                  /* bell: both | q0 */
  nTraj: 240, seed: 7,
};

export const NZ_PRESETS = {
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
export function nzRho(n){
  const dim = 1 << n;
  const r = { n, dim, re: new Float64Array(dim * dim), im: new Float64Array(dim * dim) };
  r.re[0] = 1;
  return r;
}

/* 由纯态 |ψ⟩ 构造 ρ=|ψ⟩⟨ψ|（纯态用 qcNewState 的 {n,dim,re,im} 结构） */
export function nzRhoFromPure(n, re, im){
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
export function nzRhoQubit(theta, phi){
  const dim = 2;
  const r = { n: 1, dim, re: new Float64Array(4), im: new Float64Array(4) };
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  r.re[0] = c * c; r.re[3] = s * s;
  r.re[1] = c * s * Math.cos(phi); r.im[1] = -c * s * Math.sin(phi);
  r.re[2] = r.re[1]; r.im[2] = -r.im[1];
  return r;
}

export function nzCopy(rho, out = null){
  const o = out || { n: rho.n, dim: rho.dim, re: new Float64Array(rho.re.length), im: new Float64Array(rho.im.length) };
  o.re.set(rho.re); o.im.set(rho.im); o.n = rho.n; o.dim = rho.dim;
  return o;
}

export function nzTrace(rho){
  const D = rho.dim;
  let tr = 0, ti = 0;
  for (let i = 0; i < D; i++){ tr += rho.re[i * D + i]; ti += rho.im[i * D + i]; }
  return { re: tr, im: ti };
}

/* 纯度 tr ρ²（=1 纯态，=1/dim 全混合） */
export function nzPurity(rho){
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
export function nzAmpDampKraus(gamma){
  const g = Math.min(1, Math.max(0, gamma)), s = Math.sqrt(1 - g), r = Math.sqrt(g);
  return [k2(NZ_C1, NZ_C0, NZ_C0, [s, 0]), k2(NZ_C0, [r, 0], NZ_C0, NZ_C0)];
}
export function nzPhaseDampKraus(lambda){
  const l = Math.min(1, Math.max(0, lambda));
  const a = Math.sqrt(1 - l / 2), b = Math.sqrt(l / 2);
  return [k2([a, 0], NZ_C0, NZ_C0, [a, 0]), k2([b, 0], NZ_C0, NZ_C0, [-b, 0])];
}
export function nzDepolarKraus(p){
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
export function nzApplyKraus(rho, q, E, out){
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

export function nzKrausOf(kind, param){
  if (kind === 'relax') return nzAmpDampKraus(param);
  if (kind === 'dephase') return nzPhaseDampKraus(param);
  if (kind === 'depolar') return nzDepolarKraus(param);
  return null;
}

/* 对每个比特施加同一通道（页面 Bell 预设的「双侧噪声」） */
export function nzApplyAll(rho, kind, param, out){
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
export function nzBloch(rho, q){
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
export function nzXInfo(rho){
  if (rho.n !== 2) return { xform: false, offmax: NaN };
  const D = 4;
  const off = [rho.re[0 * D + 1], rho.re[0 * D + 2], rho.re[1 * D + 3], rho.re[2 * D + 3],
               rho.im[0 * D + 1], rho.im[0 * D + 2], rho.im[1 * D + 3], rho.im[2 * D + 3]];
  let m = 0;
  for (const v of off) m = Math.max(m, Math.abs(v));
  return { xform: m < 1e-12, offmax: m };
}

export function nzConcurrence(rho){
  if (rho.n !== 2) return { C: NaN, xform: false };
  const D = 4;
  const a = rho.re[0], b = rho.re[1 * D + 1], c = rho.re[2 * D + 2], d = rho.re[3 * D + 3];
  const w = Math.hypot(rho.re[3], rho.im[3]);          /* ρ03 */
  const z = Math.hypot(rho.re[1 * D + 2], rho.im[1 * D + 2]); /* ρ12 */
  const C = 2 * Math.max(0, w - Math.sqrt(Math.max(0, b * c)), z - Math.sqrt(Math.max(0, a * d)));
  return { C, ...nzXInfo(rho) };
}

/* 两比特保真度（对 Bell）⟨Φ⁺|ρ|Φ⁺⟩ */
export function nzBellFidelity(rho){
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

export function nzPauliCorr2(rho, a, b){
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
export function nzStepParam(kind, tau, dt){
  const x = Math.exp(-dt / Math.max(1e-12, tau));
  return 1 - x;
}

/* 解析 Bloch（单比特，初态 θ,φ） */
export function nzBlochExact(kind, tau, t, theta, phi){
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
export function nzConcurrenceExact(kind, tau, t, side){
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
export function nzEsdTime(tau){ return Math.log(3) / 2 * tau; }

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
export function nzStream(cfg = {}){
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

export function nzScan(cfg = {}){
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
export function nzTrajStep(s, q, kind, param, rng){
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

export function nzTrajNew(n){
  const dim = 1 << n;
  const s = { n, dim, re: new Float64Array(dim), im: new Float64Array(dim) };
  s.re[0] = 1;
  return s;
}

/* 单比特初态 |ψ(θ,φ)⟩ 的纯态向量 */
export function nzPureQubit(theta, phi){
  const s = nzTrajNew(1);
  s.re[0] = Math.cos(theta / 2); s.im[0] = 0;
  s.re[1] = Math.sin(theta / 2) * Math.cos(phi);
  s.im[1] = Math.sin(theta / 2) * Math.sin(phi);
  return s;
}

/* 一整组轨迹：返回每条轨迹的 Bloch 点列（页面点云）+ 平均密度矩阵的时间序列
   （与 nzScan 的实线对照：蒙特卡洛平均 ⟹ 密度矩阵，1/√N 收敛）。 */
export function nzTrajEnsemble(cfg = {}){
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
export function trajBloch(s, q){
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
