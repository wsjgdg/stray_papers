// 文本 Worker 客户端：单实例复用 + 每请求超时 + 阈值分流 + 主线程同步兜底。
//
// 三条防线保证「Worker 化只赚不亏」：
// 1. 阈值分流：小输入直接在主线程同步算（Worker 往返 + 结构化克隆约 50-100ms，
//    小任务走 Worker 反而亏——0.1ms 的同步计算不值得付这个过路费）；
// 2. 执行超时（500ms）：正则灾难性回溯 / 病态输入让 Worker 卡死时，调用方拿到
//    主线程同步兜底结果，UI 永不悬挂；
// 3. 熔断：连续 3 次超时视为 Worker 不可信，终止并停用，后续全部走同步路径。
//
// 所有 API 返回 Promise，但小任务/降级路径立即以同步结果 resolve——调用方无需关心走了哪条路。

import { cleanTranscript, type CleanResult } from "@/lib/clean"
import { verifyFidelity, type FidelityReport } from "@/lib/fidelity"
import {
  compressActiveSync,
  compressBytes,
  decompressBytes,
  decompressSyncOnly,
  type CompressedChunk,
  type Tier,
} from "@/lib/compression"
import {
  findDuplicate,
  parseTranscriptLines,
  textSimilarity,
  transcriptFingerprint,
  type DedupCandidate,
  type DedupResult,
  type TranscriptLine,
} from "@/lib/textPure"

// 每请求执行超时：超过即回退主线程同步兜底
const TASK_TIMEOUT_MS = 500
// 连续超时熔断阈值
const MAX_CONSECUTIVE_TIMEOUTS = 3

// 各任务的 Worker 分流阈值（UTF-16 字符数粗估字节 ×2）：
// 低于阈值直接同步算，高于才值得付 Worker 往返成本
const PARSE_MIN_CHARS = 32 * 1024 // 行解析：3 万字级别以上
const CLEAN_MIN_CHARS = 16 * 1024 // 清洗：规则多、逐行正则
const FINGERPRINT_MIN_CHARS = 16 * 1024 // 指纹：线性双哈希
const SIMILARITY_MIN_CHARS = 4 * 1024 // 8-gram 集合构建内存开销大，门槛放低
const FIDELITY_MIN_CHARS = 2 * 1024 // 保真校验：逐块 DP，几千字就有感知耗时
const FIDELITY_TIMEOUT_MS = 5000 // 保真校验放宽超时：14 万字实测 ≈240ms，长稿留足余量
const JSON_MIN_CHARS = 50 * 1024 // 大 JSON（≈100KB 字节口径）：序列化/解析
const COMPRESS_MIN_BYTES = 64 * 1024 // 存储层分片压缩/解压：64KB 以上才值得付 Worker 往返
const COMPRESS_TIMEOUT_MS = 4000 // LZ4 是线性算法不存在灾难性回溯，放宽超时只防 Worker 假死

type OutMsg = { reqId: number; ok: true; result: unknown } | { reqId: number; ok: false; error: string }

let worker: Worker | null = null
let broken = false
let consecutiveTimeouts = 0
let nextReqId = 1
const pending = new Map<number, { timer: ReturnType<typeof setTimeout>; deliver: (v: unknown) => void }>()

function ensureWorker(): Worker | null {
  if (broken) return null
  if (worker) return worker
  try {
    if (typeof Worker === "undefined") {
      broken = true
      return null
    }
    worker = new Worker(new URL("./text.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<OutMsg>) => {
      const entry = pending.get(e.data.reqId)
      if (!entry) return // 超时后的迟到应答：直接丢弃
      pending.delete(e.data.reqId)
      clearTimeout(entry.timer)
      consecutiveTimeouts = 0
      if (e.data.ok) entry.deliver(e.data.result)
      else entry.deliver(FAILED)
    }
    worker.onerror = () => {
      broken = true
      worker?.terminate()
      worker = null
      for (const [, entry] of pending) {
        clearTimeout(entry.timer)
        entry.deliver(FAILED)
      }
      pending.clear()
    }
    return worker
  } catch {
    broken = true
    return null
  }
}

// 哨兵：Worker 侧计算失败（异常回传）→ 调用方走同步兜底重算
const FAILED = Symbol("textWorkerFailed")

function runTask<T>(
  kind: string,
  payload: unknown,
  sizeChars: number,
  minChars: number,
  syncFallback: () => T,
  timeoutMs: number = TASK_TIMEOUT_MS,
): Promise<T> {
  if (sizeChars < minChars) return Promise.resolve(syncFallback())
  const w = ensureWorker()
  if (!w) return Promise.resolve(syncFallback())
  return new Promise<T>((resolve) => {
    const reqId = nextReqId++
    const timer = setTimeout(() => {
      pending.delete(reqId)
      consecutiveTimeouts++
      if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS && worker) {
        // 熔断：这个 Worker 不可信（可能正卡在灾难性回溯里），弃用并终止
        broken = true
        worker.terminate()
        worker = null
      }
      resolve(syncFallback())
    }, timeoutMs)
    pending.set(reqId, {
      timer,
      deliver: (v) => resolve(v === FAILED ? syncFallback() : (v as T)),
    })
    w.postMessage({ reqId, kind, payload })
  })
}

// ── 对外任务 API ──

export function parseLinesTask(text: string): Promise<TranscriptLine[]> {
  return runTask("parse", { text }, text.length, PARSE_MIN_CHARS, () => parseTranscriptLines(text))
}

export function cleanTask(text: string): Promise<CleanResult> {
  return runTask("clean", { text }, text.length, CLEAN_MIN_CHARS, () => cleanTranscript(text))
}

export function fingerprintTask(text: string): Promise<string> {
  return runTask("fingerprint", { text }, text.length, FINGERPRINT_MIN_CHARS, () =>
    transcriptFingerprint(text),
  )
}

export function similarityTask(a: string, b: string): Promise<number> {
  const size = Math.max(a.length, b.length)
  return runTask("similarity", { a, b }, size, SIMILARITY_MIN_CHARS, () => textSimilarity(a, b))
}

// 重复检测整套扫描一次往返完成（避免 N 个候选 N 次请求）
export function dedupScanTask(raw: string, candidates: DedupCandidate[]): Promise<DedupResult | null> {
  const size = raw.length + candidates.reduce((n, c) => n + c.transcript.length, 0)
  return runTask("dedupScan", { raw, candidates }, size, SIMILARITY_MIN_CHARS, () =>
    findDuplicate(raw, candidates),
  )
}

// 逐块保真校验：编辑距离 DP 是重活（14 万字 ≈ 240ms），比常规任务放宽超时；
// 超时 / Worker 不可用时回退主线程同步算（宁可短暂卡顿，也不丢失「整理稿被改写」的告警）
export function fidelityTask(original: string, polished: string): Promise<FidelityReport> {
  const size = original.length + polished.length
  return runTask(
    "fidelity",
    { original, polished },
    size,
    FIDELITY_MIN_CHARS,
    () => verifyFidelity(original, polished),
    FIDELITY_TIMEOUT_MS,
  )
}

// 大 JSON：序列化 / 解析（>100KB 字节口径走 Worker；小对象同步零开销）
export function jsonStringifyTask(value: unknown, sizeChars: number, pretty?: number): Promise<string> {
  return runTask("jsonStringify", { value, pretty }, sizeChars, JSON_MIN_CHARS, () =>
    pretty ? JSON.stringify(value, null, pretty) : JSON.stringify(value),
  )
}

// 解析失败（非法 JSON）统一归一为 null——与 parseBackupJson 的调用方语义一致
export function jsonParseTask(text: string): Promise<unknown> {
  return runTask("jsonParse", { text }, text.length, JSON_MIN_CHARS, () => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  })
}

// ── 存储层大分片压缩/解压：LZ4/deflate/raw 走 Worker（主线程只收发字节，
// 结构化克隆 800KB ≈ 1ms，远小于压缩本身）；zstd 归档是低频异步 wasm，留在主线程 ──

export function compressChunkTask(bytes: Uint8Array, tier: Tier): Promise<CompressedChunk> {
  if (tier === "archive") return compressBytes(bytes, tier)
  return runTask(
    "compressActive",
    { bytes },
    bytes.byteLength,
    COMPRESS_MIN_BYTES,
    () => compressActiveSync(bytes),
    COMPRESS_TIMEOUT_MS,
  )
}

export function decompressChunkTask(chunk: CompressedChunk): Promise<Uint8Array> {
  if (chunk.codec === "zstd") return decompressBytes(chunk)
  return runTask(
    "decompressChunk",
    { chunk },
    chunk.data.byteLength,
    COMPRESS_MIN_BYTES,
    () => decompressSyncOnly(chunk) ?? chunk.data,
    COMPRESS_TIMEOUT_MS,
  )
}

// 测试/诊断用：当前是否处于降级状态
export function textWorkerBroken(): boolean {
  return broken
}
