// 文本处理 Worker：正则解析 / 清洗 / 指纹 / 相似度 / 大 JSON 序列化 / 存储层压缩解压——纯计算重活全部离主线程。
// 单实例复用（客户端持有，绝不逐任务起停 Worker，起停开销远大于任务本身）。
//
// 协议：{ reqId, kind, payload } → { reqId, ok, result? , error? }
// 客户端对每个请求设 500ms 超时：正则灾难性回溯 / 输入病态时宁可回退主线程同步兜底，
// 也不让调用方无限等待；连续超时则弃用 Worker（见 textWorkerClient）。

import { cleanTranscript } from "@/lib/clean"
import { verifyFidelity } from "@/lib/fidelity"
import { compressActiveSync, decompressSyncOnly, type CompressedChunk } from "@/lib/compression"
import { findDuplicate, parseTranscriptLines, textSimilarity, transcriptFingerprint, type DedupCandidate } from "@/lib/textPure"

type Task =
  | { reqId: number; kind: "parse"; payload: { text: string } }
  | { reqId: number; kind: "clean"; payload: { text: string } }
  | { reqId: number; kind: "fingerprint"; payload: { text: string } }
  | { reqId: number; kind: "similarity"; payload: { a: string; b: string } }
  | { reqId: number; kind: "dedupScan"; payload: { raw: string; candidates: DedupCandidate[] } }
  | { reqId: number; kind: "fidelity"; payload: { original: string; polished: string } }
  | { reqId: number; kind: "jsonStringify"; payload: { value: unknown; pretty?: number } }
  | { reqId: number; kind: "jsonParse"; payload: { text: string } }
  | { reqId: number; kind: "compressActive"; payload: { bytes: Uint8Array } }
  | { reqId: number; kind: "decompressChunk"; payload: { chunk: CompressedChunk } }

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Task>) => void) | null
  postMessage: (msg: unknown) => void
}

function compute(msg: Task): unknown {
  switch (msg.kind) {
    case "parse":
      return parseTranscriptLines(msg.payload.text)
    case "clean":
      return cleanTranscript(msg.payload.text)
    case "fingerprint":
      return transcriptFingerprint(msg.payload.text)
    case "similarity":
      return textSimilarity(msg.payload.a, msg.payload.b)
    case "dedupScan":
      return findDuplicate(msg.payload.raw, msg.payload.candidates)
    case "fidelity":
      return verifyFidelity(msg.payload.original, msg.payload.polished)
    case "jsonStringify":
      return msg.payload.pretty
        ? JSON.stringify(msg.payload.value, null, msg.payload.pretty)
        : JSON.stringify(msg.payload.value)
    case "jsonParse":
      return JSON.parse(msg.payload.text)
    case "compressActive":
      return compressActiveSync(msg.payload.bytes)
    case "decompressChunk": {
      const out = decompressSyncOnly(msg.payload.chunk)
      if (!out) throw new Error("zstd 分片不走 Worker 同步解压")
      return out
    }
  }
}

ctx.onmessage = (e) => {
  const msg = e.data
  try {
    ctx.postMessage({ reqId: msg.reqId, ok: true, result: compute(msg) })
  } catch (err) {
    ctx.postMessage({ reqId: msg.reqId, ok: false, error: String((err as Error)?.message ?? err) })
  }
}
