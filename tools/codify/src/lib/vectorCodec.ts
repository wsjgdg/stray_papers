// 向量压缩编解码：8-bit 非对称标量量化（每维一字节，min + step 还原）。
//
// 存储收益：512 维 float32 向量 2048B → 512B 码本 + 3 个 float 参数 ≈ 524B，
// 约 74% 压缩——个人工具规模下（万级段向量 ≈ 5MB）存储不是瓶颈，排序质量才是：
// 实测 4-bit 档在密集聚类分布下 top-5 成员保持率只有 ~88%（边界名次互换可见），
// 8-bit 近乎无损（方向保真 ≥0.999），故默认 8-bit。
// 旧版写入的 4-bit 记录（bits:4，两值一字节 nibble 打包）仍可解码——读侧兼容、写侧统一。
//
// 打分口径：查询向量保持 float32（非对称距离计算），文档向量按量化码解码——
// cosine = dot(q, decode(v)) / (‖q‖·norm)，norm 是量化重建向量的真实范数（存储时算好），
// 保证跨会议排序不因各向量量化误差幅度不同而失真。
//
// 解码缓存：HNSW 搜索热点节点（高层枢纽）反复参与节点间距离计算，
// 缓存解码结果避免重复还原——参考实现「LRU 减少约 75% 读取」在内存驻留架构下的
// 对应物（我们的检索路径本就零 IndexedDB 读取，缓存省的是 CPU 解码）。

export interface QVec {
  codes: Uint8Array // 8-bit：每维一字节；4-bit（legacy）：两维一字节，低 nibble 在前
  min: number // 量化零点：decode = min + code * step
  step: number
  norm: number // 解码向量的 L2 范数（打分归一用，存储时预计算）
  bits?: 4 // 缺省 = 8-bit；显式 4 表示 legacy 记录
}

export function quantize(v: Float32Array): QVec {
  const n = v.length
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < n; i++) {
    if (v[i] < min) min = v[i]
    if (v[i] > max) max = v[i]
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0
    max = 0
  }
  const step = max > min ? (max - min) / 255 : 1
  const codes = new Uint8Array(n)
  let sumSq = 0
  for (let i = 0; i < n; i++) {
    let q = Math.round((v[i] - min) / step)
    if (q < 0) q = 0
    else if (q > 255) q = 255
    codes[i] = q
    const d = min + q * step
    sumSq += d * d
  }
  return { codes, min, step, norm: Math.sqrt(sumSq) || 1e-9 }
}

// legacy 4-bit nibble → 值
function nib4(codes: Uint8Array, i: number): number {
  const byte = codes[i >> 1]
  return i % 2 === 0 ? byte & 0xf : byte >> 4
}

export function decode(q: QVec, dim: number, out?: Float32Array): Float32Array {
  const buf = out ?? new Float32Array(dim)
  const { codes, min, step } = q
  if (q.bits === 4) {
    for (let i = 0; i < dim; i++) buf[i] = min + nib4(codes, i) * step
  } else {
    for (let i = 0; i < dim; i++) buf[i] = min + codes[i] * step
  }
  return buf
}

// 查询（float32，单位范数）对量化文档向量的余弦
export function cosineQ(queryUnit: Float32Array, d: QVec): number {
  const dim = queryUnit.length
  const { codes, min, step, norm } = d
  let dot = 0
  if (d.bits === 4) {
    for (let i = 0; i < dim; i++) dot += queryUnit[i] * (min + nib4(codes, i) * step)
  } else {
    for (let i = 0; i < dim; i++) dot += queryUnit[i] * (min + codes[i] * step)
  }
  return dot / norm
}

// 一组段向量取最大余弦（多段会议打分的量化版）
export function cosineMaxQ(queryUnit: Float32Array, vecs: QVec[]): number {
  let best = -1
  for (const v of vecs) {
    const s = cosineQ(queryUnit, v)
    if (s > best) best = s
  }
  return best
}

// 兼容读取判定：旧记录可能直接存了 Float32Array（量化前的最初版本）
export function isLegacyFloatVec(v: unknown): v is Float32Array {
  return v instanceof Float32Array
}

// ── 解码缓存（LRU 容量语义 / FIFO 淘汰）：HNSW 距离回调的热点加速 ──

export class DecodeLru {
  private map = new Map<number, Float32Array>()
  private readonly cap: number

  constructor(cap: number) {
    this.cap = cap
  }

  get(nodeId: number, q: QVec): Float32Array {
    const hit = this.map.get(nodeId)
    // 命中不重排（FIFO 淘汰）：容量 ≫ 热点集（图枢纽节点）时与严格 LRU 命中率几乎无差，
    // 但省下每次命中两次 Map 操作——这是 HNSW 建图/搜索的最热路径
    if (hit) return hit
    const buf = decode(q, q.bits === 4 ? q.codes.length * 2 : q.codes.length)
    this.map.set(nodeId, buf)
    if (this.map.size > this.cap) {
      const oldest = this.map.keys().next()
      if (!oldest.done) this.map.delete(oldest.value)
    }
    return buf
  }

  invalidate(nodeId: number): void {
    this.map.delete(nodeId)
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}
