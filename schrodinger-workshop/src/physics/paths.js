/* ============================================================================
 * paths.js — R74 费曼路径求和（自由粒子 · 单缝 / 双缝）
 *
 * 单位制：m=1, ħ=1，且取「以 x 为参数、速度 v_x=1」⟹ 每段飞行时间 T=X。
 *   于是 p=mv=1、λ=2π/k=2π。所有相位都以这个单位制算，页面坐标即世界坐标。
 *
 * 一条路径（单段，从 (0,ya) 到 (X,yb)）用模态展开参数化：
 *   y(τ) = ya + Δy·τ + Σ_n a_n sin(nπτ),  τ = x/X ∈ [0,1]
 * 代入 S=(m/2)∫(ẋ²+ẏ²)dt 得
 *   S = X/2 + Δy²/(2X) + Σ_n a_n² n²π²/(4X)
 * 第一项对所有路径相同（可丢），第二项是直线路径的相对作用量，第三项是
 * 波折的「超出作用量」。∫δ'² 的交叉项因 δ(0)=δ(1)=0 而恒为零——这是模态
 * 展开能给出闭式相位的根据。
 *
 * 关键结构（本模块的核心恒等式，pot74 逐项验证）：
 *   模求和因子 C(X) = Σ_{路径} e^{i·Σ_n a_n²n²π²/(4X)} 只依赖 X，与端点无关
 *   ⟹ 单段振幅 = e^{iΔy²/(2X)}·C(X)。故
 *   **截断模态只改变整体归一化，不改变条纹位置/间距/包络**；绝对幅度的
 *   X 标度不是物理的（等权平测度截断的固有性质，不是数值误差，见文件末）。
 *
 * 与解析传播子的关系：
 *   K(X,Δy) = (2πiX)^{-1/2} e^{iΔy²/(2X)}（1D 自由传播子，m=ħ=1）
 *   路径和 = C(X)·√(2πiX)·K ⟹ 逐点只差一个复常数（页面 HUD 实时显示该比值
 *   的起伏，量级 1e-15）。
 * ========================================================================== */

export const PI_LAMBDA = 2 * Math.PI;   /* m=ħ=1、v_x=1 ⟹ 波长 2π */

export const PI_DEFAULTS = {
  L1: 160,        /* 源 → 屏 */
  L2: 400,        /* 屏 → 探测面 */
  ys: 0,          /* 源横向位置（世界坐标，页面里再平移到画布中心） */
  d: 40,          /* 缝间距 */
  w: 6,           /* 缝宽 */
  modes: 1,       /* 模态数（1 或 2；对条纹无影响，只影响归一） */
  K: 48,          /* 每个模态的采样区间数（2K+1 个取值） */
  W: 26,          /* 一阶模态最大波折幅度（θ_n 幅度 = W/n） */
  nxi: 5,         /* 缝宽方向的求积点数 */
  nY: 241,        /* 剖面采样点数 */
  yFov: 200,      /* 剖面纵向半宽（世界单位；= 画布可见半高） */
  openA: true, openB: true,
  coherent: true, /* true=幅度相加；false=强度相加（可区分路径） */
};

/* ---------- 单段：相位与模态系数 ---------- */
export function piModeCoef(X, n){ return n * n * Math.PI * Math.PI / (4 * X); }

/* 相对作用量（已去掉公共的 X/2）：Δy²/(2X) + Σ a_n²n²π²/(4X) */
export function piSegmentPhase(X, dy, amps){
  let ph = dy * dy / (2 * X);
  for (let i = 0; i < amps.length; i++){
    const n = i + 1;
    ph += n * n * Math.PI * Math.PI * amps[i] * amps[i] / (4 * X);
  }
  return ph;
}

/* 直线路径的相对作用量 */
export function piStraightPhase(X, dy){ return dy * dy / (2 * X); }

/* ---------- 模态族的等权求和 ---------- */
/* 嵌套循环（不用因式分解）：这正是「逐条路径相加」的字面实现，
   pot74 用它和 1D 乘积对照，证明 C(X) 的因式分解成立。 */
export function piModeSum(X, opts = {}){
  const K = opts.K ?? PI_DEFAULTS.K;
  const W = opts.W ?? PI_DEFAULTS.W;
  const modes = Math.max(1, Math.min(2, opts.modes ?? PI_DEFAULTS.modes));
  const cs = [];
  for (let n = 1; n <= modes; n++) cs.push(piModeCoef(X, n));
  /* 中点法则：每个模态取 2K 个等距样本（a=(i+½)h−A, h=A/K），不含端点。
     端点法则（含 a=±A）在端点处有半个区间误差，实测收敛是 O(h)；中点法则
     实测 O(h²)（K 加倍误差降 4×，见 pot74 A2）。步长 h 同时作为「测度因子」
     的参考尺度（sum·h ≈ ∫da）。 */
  let re = 0, im = 0, count = 0;
  const rec = (n, ph) => {
    if (n === modes){ re += Math.cos(ph); im += Math.sin(ph); count++; return; }
    const c = cs[n], A = W / (n + 1), h = A / K;
    for (let i = 0; i < 2 * K; i++){
      const a = -A + (i + 0.5) * h;
      rec(n + 1, ph + c * a * a);
    }
  };
  rec(0, 0);
  return { re, im, count, mag: Math.hypot(re, im), h: W / K };
}

/* 单模态求和（因式分解的一侧） */
export function piModeSum1D(X, n, opts = {}){
  const K = opts.K ?? PI_DEFAULTS.K, W = opts.W ?? PI_DEFAULTS.W;
  const c = piModeCoef(X, n), A = W / n, h = A / K;
  let re = 0, im = 0;
  for (let i = 0; i < 2 * K; i++){
    const a = -A + (i + 0.5) * h, ph = c * a * a;
    re += Math.cos(ph); im += Math.sin(ph);
  }
  return { re, im, count: 2 * K, mag: Math.hypot(re, im), h };
}

/* ---------- 单段振幅（含端点几何相位） ---------- */
export function piSegmentAmp(X, dy, opts = {}){
  const C = piModeSum(X, opts);
  const ph = piStraightPhase(X, dy);
  const cp = Math.cos(ph), sp = Math.sin(ph);
  return { re: cp * C.re - sp * C.im, im: sp * C.re + cp * C.im, mag: C.mag };
}

/* ---------- 解析传播子（对照） ---------- */
/* K = (2πiX)^{-1/2} e^{iΔy²/2X}；实部/虚部显式展开，避免复数库 */
export function piAnalyticSegment(X, dy){
  const ph = piStraightPhase(X, dy);
  const pref = 1 / Math.sqrt(2 * Math.PI * X);
  /* (2πiX)^{-1/2} = pref·e^{-iπ/4} */
  const c = Math.SQRT1_2 * pref;
  const cr = Math.cos(ph), ci = Math.sin(ph);
  return { re: c * (cr + ci), im: c * (ci - cr) };
}

/* ---------- 缝位置 ---------- */
export function piSlits(cfg = {}){
  const c = { ...PI_DEFAULTS, ...cfg };
  const out = [];
  if (c.openA) out.push(+c.d / 2);
  if (c.openB) out.push(-c.d / 2);
  return out;
}

/* ξ 求积点数：跨缝相位变化 ≈ (|Y|/L₂)·w（源曲率项同量级），要求每样本的相位步
   ≤0.5 rad 才不混叠。w=20、yFov=293、L₂=400 时需要 30 点；首版固定 nxi=7 时
   相位步 2.07 rad，单缝剖面被混叠出两个假暗纹（pot74 C3 抓到）。 */
export function piNxiFor(w, L2, ymax, base = PI_DEFAULTS.nxi){
  const need = Math.ceil(w * Math.max(1, Math.abs(ymax)) / (0.5 * Math.max(1e-9, L2)));
  return Math.max(base, need);
}

/* ξ 求积点（中点法） */
export function piXiSamples(w, n){
  const out = [];
  for (let i = 0; i < n; i++) out.push(-w / 2 + w * (i + 0.5) / n);
  return out;
}

/* ---------- 探测点振幅 ---------- */
/* 返回：
 *   raw   路径求和（未归一）
 *   an    解析传播子（同一 ξ 求积）
 *   scale raw/an 的复比值（应逐点恒定）
 *   per   各缝单独振幅（相干/非相干用）
 */
export function piAmpAt(Y, cfg = {}){
  const c = { ...PI_DEFAULTS, ...cfg };
  const C1 = piModeSum(c.L1, c), C2 = piModeSum(c.L2, c);
  const slits = piSlits(c);
  const xi = piXiSamples(c.w, piNxiFor(c.w, c.L2, Math.abs(Y), Math.max(1, c.nxi | 0)));
  let re = 0, im = 0, anRe = 0, anIm = 0;
  const per = [];
  for (const s of slits){
    let sr = 0, si = 0, ar = 0, ai = 0;
    for (const dx of xi){
      const x = s + dx;
      const ph = piStraightPhase(c.L1, x - c.ys) + piStraightPhase(c.L2, Y - x);
      sr += Math.cos(ph); si += Math.sin(ph);
      const k1 = piAnalyticSegment(c.L1, x - c.ys), k2 = piAnalyticSegment(c.L2, Y - x);
      /* (a+bi)(c+di) */
      ar += k1.re * k2.re - k1.im * k2.im;
      ai += k1.re * k2.im + k1.im * k2.re;
    }
    const n = xi.length;
    /* 路径和：几何相位 × C1·C2，逐缝。(gr+i·gi)(a+ib)(c+id) 的实部是
       gr·ac − gi·bc − gr·bd − gi·ad —— 第四项是 **−**gr·bd（首版写成 +，
       逐缝振幅的相位因此偏 1.24 rad；剖面走的是 piProfile 里的另一条正确展开，
       所以只有 pot74 的干涉项恒等式把它抓出来）。 */
    const gr = sr / n, gi = si / n;
    const pr = gr * C1.re * C2.re - gi * C1.im * C2.re - gr * C1.im * C2.im - gi * C1.re * C2.im;
    const pi2 = gr * C1.re * C2.im + gr * C1.im * C2.re + gi * C1.re * C2.re - gi * C1.im * C2.im;
    per.push({ slit: s, re: pr, im: pi2, mag: Math.hypot(pr, pi2) });
    re += pr; im += pi2;
    anRe += ar / n; anIm += ai / n;
  }
  return { raw: { re, im, mag: Math.hypot(re, im) }, an: { re: anRe, im: anIm, mag: Math.hypot(anRe, anIm) }, per };
}

/* 单点强度（相干/非相干按 cfg.coherent 选） */
export function piIntensity(Y, cfg = {}){
  const A = piAmpAt(Y, cfg);
  if (cfg.coherent === false){
    let I = 0;
    for (const p of A.per) I += p.mag * p.mag;
    return I;
  }
  return A.raw.mag * A.raw.mag;
}

/* ---------- 剖面 ---------- */
/* 用同一模态常数 C1·C2（已验证与显式逐路径求和一致到 1e-14），
   所以 241 个探测点的剖面是 O(nY·nSlit·nxi) 而不是 O(nY·K²...) */
export function piProfile(cfg = {}){
  const c = { ...PI_DEFAULTS, ...cfg };
  const C1 = piModeSum(c.L1, c), C2 = piModeSum(c.L2, c);
  const slits = piSlits(c);
  const xi = piXiSamples(c.w, piNxiFor(c.w, c.L2, c.yFov, Math.max(1, c.nxi | 0)));
  const n = c.nY | 0;
  const yMin = -c.yFov, yMax = c.yFov;   /* 剖面覆盖画布可见的纵向范围 */
  const Ys = new Float64Array(n), Ip = new Float64Array(n), Ia = new Float64Array(n), Ii = new Float64Array(n);
  for (let k = 0; k < n; k++){
    const Y = yMin + (yMax - yMin) * k / (n - 1);
    Ys[k] = Y;
    let re = 0, im = 0, ar = 0, ai = 0, incoh = 0, anIncoh = 0;
    for (const s of slits){
      let sr = 0, si = 0, kr = 0, ki = 0;
      for (const dx of xi){
        const x = s + dx;
        const ph = piStraightPhase(c.L1, x - c.ys) + piStraightPhase(c.L2, Y - x);
        sr += Math.cos(ph); si += Math.sin(ph);
        const k1 = piAnalyticSegment(c.L1, x - c.ys), k2 = piAnalyticSegment(c.L2, Y - x);
        kr += k1.re * k2.re - k1.im * k2.im;
        ki += k1.re * k2.im + k1.im * k2.re;
      }
      const m = xi.length;
      const gr = sr / m, gi = si / m;
      const pr = (gr * C1.re - gi * C1.im) * C2.re - (gr * C1.im + gi * C1.re) * C2.im;
      const pii = (gr * C1.re - gi * C1.im) * C2.im + (gr * C1.im + gi * C1.re) * C2.re;
      re += pr; im += pii;
      incoh += pr * pr + pii * pii;
      anIncoh += (kr * kr + ki * ki) / (m * m);
      ar += kr / m; ai += ki / m;
    }
    Ip[k] = c.coherent === false ? incoh : re * re + im * im;
    /* 非相干时对照也换成「各缝强度相加」，否则比值不是常数（那是模式差异，
       不是数值误差，HUD 的「比值起伏」会误报） */
    Ia[k] = c.coherent === false ? anIncoh : ar * ar + ai * ai;
    Ii[k] = incoh;
  }
  /* 归一 + 比值起伏（验证「只差一个常数」） */
  const mp = Math.max(...Ip), ma = Math.max(...Ia);
  let sMin = Infinity, sMax = -Infinity, sSum = 0;
  for (let k = 0; k < n; k++){
    if (Ia[k] > 1e-30 * ma && Ip[k] > 1e-30 * mp){
      const r = Ip[k] / Ia[k];
      if (r < sMin) sMin = r;
      if (r > sMax) sMax = r;
      sSum += r;
    }
  }
  const sMean = sSum / Math.max(1, n);
  return {
    Y: Ys, path: Float64Array.from(Ip, v => v / mp), an: Float64Array.from(Ia, v => v / ma),
    raw: Ip, iAn: Ia, incoh: Ii,
    scale: { min: sMin, max: sMax, mean: sMean, spread: (sMax - sMin) / Math.max(sMean, 1e-300) },
    maxPath: mp, maxAn: ma,
  };
}

/* ---------- 可视化：路径折线 ---------- */
/* 单段：y(τ) = ya + Δy·τ + Σ a_n sin(nπτ) */
export function piPolyline(xa, ya, xb, yb, amps, N = 28){
  const pts = [];
  for (let i = 0; i <= N; i++){
    const t = i / N;
    let y = ya + (yb - ya) * t;
    for (let n = 0; n < amps.length; n++) y += amps[n] * Math.sin((n + 1) * Math.PI * t);
    pts.push([xa + (xb - xa) * t, y]);
  }
  return pts;
}

/* 取一组「能代表整个族」的路径样本（画图用）：两段各在 [-W,W] 上取 nA 个
   等距值 f，构成 nA² 的**子网格**（族本身是 2K×2K 的完整网格，画图只抽子集）。
   注意两段都要有波折——只给段 1 加波折会让画面撒谎（求和时两段都有 C(X)）。 */
export function piPathSamples(Y, cfg = {}, nA = 7){
  const c = { ...PI_DEFAULTS, ...cfg };
  const slits = piSlits(c);
  const xi = piXiSamples(c.w, Math.max(1, c.nxi | 0));
  const frac = [];
  for (let i = 0; i < nA; i++) frac.push(-1 + 2 * i / (nA - 1));
  const out = [];
  for (const s of slits){
    for (const dx of xi){
      const x = s + dx;
      for (const f1 of frac){
        for (const f2 of frac){
          const seg1 = [f1 * c.W];
          const seg2 = [f2 * c.W];
          if (c.modes > 1){ seg1.push(f2 * c.W / 2); seg2.push(f1 * c.W / 2); }
          const ph = piSegmentPhase(c.L1, x - c.ys, seg1) + piSegmentPhase(c.L2, Y - x, seg2);
          out.push({ slit: s, xi: x, seg1, seg2, phase: ph });
        }
      }
    }
  }
  return out;
}

/* ---------- 数值参考（验证用，页面不用） ---------- */
/* 细网格 Simpson 求 ∫_{-A}^{A} e^{i c a²} da，作为模态和的独立真值 */
export function piFresnelRef(A, cCoef, N = 20001){
  const h = 2 * A / N;
  let re = 0, im = 0, wsum = 0;
  for (let i = 0; i <= N; i++){
    const a = -A + i * h;
    const w = (i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2);
    const ph = cCoef * a * a;
    re += w * Math.cos(ph); im += w * Math.sin(ph); wsum += w;
  }
  re *= h / 3; im *= h / 3; wsum *= h / 3;
  return { re, im, len: wsum };
}

/* ---------- 派生量 ---------- */
export function piFringeSpacing(cfg = {}){
  const c = { ...PI_DEFAULTS, ...cfg };
  return c.d > 1e-9 ? PI_LAMBDA * c.L2 / c.d : Infinity;   /* λL₂/d */
}
export function piEnvelopeZero(cfg = {}){
  const c = { ...PI_DEFAULTS, ...cfg };
  return c.w > 1e-9 ? PI_LAMBDA * c.L2 / c.w : Infinity;   /* 单缝第一零点 λL₂/w */
}


/* 条纹计数与对比度：数**内部局部极小**（暗纹），深度按两侧较浅的极大算。
   为什么不用「内部极大」：单缝包络的中心极大是真极大，但它是单调下降的起点、
   不是振荡——数极大就会把单缝算成 1 条（pot74 首版的实测）。
   数极小则天然区分：单调包络没有内部极小，双缝每两条明纹之间必有一个。
   返回 {count（暗纹数）, contrast（平均深度）, peaks}。 */
export function piFringes(prof){
  const n = prof.path.length;
  const dips = [];
  for (let k = 3; k < n - 3; k++){
    const v = prof.path[k];
    if (!(v <= prof.path[k - 1] && v < prof.path[k + 1])) continue;
    let j = k;
    while (j > 0 && prof.path[j - 1] >= prof.path[j]) j--;
    const lmax = prof.path[j];
    j = k;
    while (j < n - 1 && prof.path[j + 1] >= prof.path[j]) j++;
    const rmax = prof.path[j];
    const shallow = Math.min(lmax, rmax);
    if (shallow < 1e-9) continue;
    const depth = (shallow - v) / shallow;
    if (depth < 0.15) continue;
    dips.push({ Y: prof.Y[k], I: v, contrast: (shallow - v) / (shallow + v), depth });
  }
  const contrast = dips.length ? dips.reduce((a, d) => a + d.contrast, 0) / dips.length : 0;
  return { count: dips.length, contrast, dips };
}

export const PI_PRESETS = {
  double: { name: '双缝', text: '两条缝各贡献一个振幅，路径族在此处**分岔**：同一探测点有两条「路径束」，它们的几何相位差 = k·δ（δ 为光程差）⟹ 明暗条纹。逐条路径看相位是乱的，但**沿每条缝**求和后只剩两个宏观振幅——这正是「路径求和 ⟹ 传播子」的可视化。', cfg: { openA: true, openB: true, coherent: true, d: 48, w: 8 } },
  single: { name: '单缝', text: '关掉一条缝、并把留下的那条移到轴上（d=0 ⟹ 光束居中）：干涉消失，只剩**单缝衍射包络**（缝宽 w 的 sinc²），远场第一暗纹在 λL₂/w。这一步是「哪条路」信息的判据——只剩一条路时没有第二个振幅可加。', cfg: { openA: true, openB: false, coherent: true, d: 0, w: 20 } },
  incoherent: { name: '可区分', text: '两条缝都开，但**不做幅度相加**（强度相加——等价于「测量了粒子走哪条缝」）。条纹立刻消失，回到两个单缝包络的叠加。这是 R72「可区分性 ε」在路径语言里的同一条物理。', cfg: { openA: true, openB: true, coherent: false, d: 48, w: 8 } },
};

/* ---------- 可视化：一阶模态扫描的累积和（Cornu 型螺旋） ----------
   只扫 a₁（a₂=0），因为二维族（模态数 2）的累积曲线是二维稠密走线，
   看不出螺旋结构；一维扫描才有「越转越快、收敛到极限点」的经典图像。
   返回归一化到 (2K) 的累积点列，页面直接画。 */
export function piSpiral(X, opts = {}){
  const K = opts.K ?? PI_DEFAULTS.K, W = opts.W ?? PI_DEFAULTS.W;
  const c = piModeCoef(X, 1), A = W, h = A / K;
  const pts = [[0, 0]];
  let re = 0, im = 0;
  for (let i = 0; i < 2 * K; i++){
    const a = -A + (i + 0.5) * h, ph = c * a * a;
    re += Math.cos(ph); im += Math.sin(ph);
    pts.push([re, im]);
  }
  return { pts, total: { re, im, mag: Math.hypot(re, im) }, count: 2 * K, len: 2 * K, h };
}
