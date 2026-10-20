/* ============================================================================
 * measure.js — 投影测量原语（R68：公理体系唯一空缺的「非酉操作」）
 *
 * 数学契约（与 probSplit / spinSum 同级的「引擎层测量原语」——本文件只做
 * 示性投影、归一化与伯努利采样，不含任何物理模型；app.js 负责读回/上传）：
 *
 *   二值测量（von Neumann 投影公理，理想位置测量）：
 *     投影算符 Π_S = 1_S(x)（区域 S 的示性函数，S = x 向或 y 向条带）。
 *     测得「在 S 内」的概率   p = ⟨ψ|Π_S|ψ⟩ = Σ_{i∈S}|ψ_i|²；
 *     坍缩态                  ψ' = Π_S ψ/√p（命中）/ (1−Π_S)ψ/√(1−p)（未命中）。
 *   幂等性：Π_S² = Π_S ⟹ 对已坍缩态重复同一测量，p=1（或 0）、态不变
 *     （机器精度；残余来自 float32 纹理往返与归一化舍入）。
 *   与 R69 的关系：退相干 T₂ 的「纯退相位」通道复用这里的读回/上传路径，
 *     投影算符推广到密度矩阵（环境指针）——本文件是那条通道的第一步。
 *
 * 单位与布局：buf 为引擎 psiA 的 CPU 镜像（Float32Array，格点交错
 * (re,im[,re2,im2])，ch = pairs*2）；mask 与格点一一对应（Uint8Array）。
 * ==========================================================================*/

/* 条带掩膜：axis 'x' ⟹ 保留 lo≤x/g<hi 的整列；'y' ⟹ 保留 lo≤y/g<hi 的整行。
   世界坐标口径与 probSplit(xSplit) 一致（0..1）。 */
export function bandMask(g, axis, lo, hi){
  const mask = new Uint8Array(g*g);
  const i0 = Math.max(0, Math.min(g, Math.floor(lo*g)));
  const i1 = Math.max(0, Math.min(g, Math.ceil(hi*g)));
  if (i1 <= i0) return mask;
  if (axis === 'x'){
    for (let y = 0; y < g; y++)
      for (let x = i0; x < i1; x++) mask[y*g + x] = 1;
  } else {
    for (let y = i0; y < i1; y++)
      for (let x = 0; x < g; x++) mask[y*g + x] = 1;
  }
  return mask;
}

/* 单点全分量密度 Σ|ψ_c|²（ch=2 标量 / ch=4 双分量——RG32F 采样得
   (r,g,0,1)，只对真实存在的 ch 个通道求和）。 */
export function densityAt(buf, i, ch){
  let s = 0;
  for (let c = 0; c < ch; c++){ const v = buf[i + c]; s += v*v; }
  return s;
}

/* 带内/总概率（不改场）：pIn = Σ_{i∈S}|ψ_i|² / Σ|ψ_i|²。 */
export function bandProb(buf, ch, mask){
  let sIn = 0, sAll = 0;
  const n = mask.length;
  for (let i = 0; i < n; i++){
    const p = densityAt(buf, i*ch, ch);
    sAll += p;
    if (mask[i]) sIn += p;
  }
  return { pIn: sAll > 0 ? sIn/sAll : 0, sIn, P: sAll };
}

/* 就地投影：hit=true 保留带内、清零带外；hit=false 反之。返回保留侧概率
   （归一化前）——von Neumann 的 p 或 1−p。注意：现场会被改写。 */
export function projectBand(buf, ch, mask, hit){
  let keep = 0, drop = 0;
  const n = mask.length;
  for (let i = 0; i < n; i++){
    const inside = mask[i] === 1;
    const keepThis = inside === hit;
    if (keepThis) keep += densityAt(buf, i*ch, ch);
    else {
      drop += densityAt(buf, i*ch, ch);
      const j = i*ch;
      for (let c = 0; c < ch; c++) buf[j + c] = 0;
    }
  }
  return { keep, drop, pKeep: (keep + drop) > 0 ? keep/(keep + drop) : 0 };
}

/* 整体归一化到 Σ|ψ|²=1（坍缩后概率不再为 1，必须重标度）。 */
export function normalizeBuf(buf, ch){
  let s = 0;
  for (let i = 0; i < buf.length; i += ch) s += densityAt(buf, i, ch);
  if (s <= 0) return 0;
  const f = 1/Math.sqrt(s);
  for (let i = 0; i < buf.length; i++) buf[i] *= f;
  return 1;
}

/* 逐分量最大残差（按峰值归一化）：|ψ_a−ψ_b|∞ / max|ψ_b|。
   幂等验证用：对同一投影算符，ψ₂−ψ₁ 应 ≤ float32 往返量级。 */
export function maxResidual(a, b, ch){
  let mx = 0, pk = 0;
  for (let i = 0; i < a.length; i++){
    const d = Math.abs(a[i] - b[i]);
    if (d > mx) mx = d;
    const p = Math.abs(b[i]);
    if (p > pk) pk = p;
  }
  return pk > 0 ? mx/pk : mx;
}

/* 伯努利采样（概率 p 命中）。rng 可注入：单测传确定性序列，
   浏览器传 Math.random。 */
export function bernoulli(p, rng){
  const r = rng || Math.random;
  return r() < p;
}
