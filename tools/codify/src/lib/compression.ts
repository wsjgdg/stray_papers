// 存储层压缩：分层编解码策略。
//
// - 活跃会议 → LZ4：压缩/解压极快（压缩比约 65-74%），适合逐键防抖的高频写入场景；
// - 归档会议 → Zstd（wasm）：压缩比更高（约 85%），归档是低频一次性操作，值得花更多 CPU；
// - Zstd wasm 加载失败时退回 fflate deflate（level 9），仍显著优于不压缩；
// - 压不动的（已压缩内容 / 极小分片）直接存 raw，不做负优化。
//
// 每个分片自带 codec 标记：解压只认标记、与会议当前归档状态无关——
// 会议后来解除归档时旧 Zstd 分片照常可读，下次重写才换回 LZ4。

import { compress as lz4Compress, decompress as lz4Decompress } from "lz4js"
import { deflateSync, inflateSync } from "fflate"

export type Codec = "raw" | "lz4" | "zstd" | "deflate"
export type Tier = "active" | "archive"

// 小于该字节数的分片不压缩：帧头开销可能吃掉全部收益
const MIN_COMPRESS_BYTES = 512

// 归档层 Zstd 压缩级别：归档低频发生，用高级别换更高压缩比
const ZSTD_ARCHIVE_LEVEL = 19

type ZstdModule = typeof import("@bokuweb/zstd-wasm")

let zstdPromise: Promise<ZstdModule | null> | null = null

// 懒加载 Zstd wasm：只在第一次归档压缩 / 解压 Zstd 分片时付出加载成本；失败缓存 null 走降级
async function getZstd(): Promise<ZstdModule | null> {
  if (!zstdPromise) {
    zstdPromise = import("@bokuweb/zstd-wasm")
      .then(async (m) => {
        await m.init()
        return m
      })
      .catch(() => null)
  }
  return zstdPromise
}

export interface CompressedChunk {
  codec: Codec
  data: Uint8Array
}

// ── 同步编解码核心：LZ4 / deflate / raw（主线程兜底与 Worker 计算共用同一份实现）──
// Zstd 需要异步加载 wasm 且只服务低频的归档读写，留在主线程异步路径，不进 Worker。

export function compressActiveSync(bytes: Uint8Array): CompressedChunk {
  if (bytes.byteLength < MIN_COMPRESS_BYTES) return { codec: "raw", data: bytes }
  try {
    const out = lz4Compress(bytes)
    if (out.byteLength < bytes.byteLength) return { codec: "lz4", data: out }
  } catch {
    // 压缩失败不致命：退回原文存储
  }
  return { codec: "raw", data: bytes }
}

// zstd 返回 null：调用方需改走异步 wasm 路径（decompressBytes）
export function decompressSyncOnly(chunk: CompressedChunk): Uint8Array | null {
  switch (chunk.codec) {
    case "raw":
      return chunk.data
    case "lz4":
      return lz4Decompress(chunk.data)
    case "deflate":
      return inflateSync(chunk.data)
    case "zstd":
      return null
  }
}

export async function compressBytes(bytes: Uint8Array, tier: Tier): Promise<CompressedChunk> {
  if (tier !== "archive") return compressActiveSync(bytes)
  if (bytes.byteLength < MIN_COMPRESS_BYTES) return { codec: "raw", data: bytes }
  try {
    const zstd = await getZstd()
    if (zstd) {
      const out = zstd.compress(bytes, ZSTD_ARCHIVE_LEVEL)
      return out.byteLength < bytes.byteLength
        ? { codec: "zstd", data: out }
        : { codec: "raw", data: bytes }
    }
    // Zstd 不可用（wasm 加载失败）→ deflate 高压缩档兜底
    const out = deflateSync(bytes, { level: 9 })
    return out.byteLength < bytes.byteLength
      ? { codec: "deflate", data: out }
      : { codec: "raw", data: bytes }
  } catch {
    // 压缩失败不致命：退回原文存储
  }
  return { codec: "raw", data: bytes }
}

export async function decompressBytes(chunk: CompressedChunk): Promise<Uint8Array> {
  if (chunk.codec !== "zstd") return decompressSyncOnly(chunk) ?? chunk.data
  const zstd = await getZstd()
  if (!zstd) throw new Error("Zstd 解码器加载失败，无法读取归档压缩数据")
  return zstd.decompress(chunk.data)
}
