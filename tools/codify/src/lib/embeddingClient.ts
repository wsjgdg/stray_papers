// 推理客户端（主线程侧）：Worker 懒启动、增量同步、状态广播、Provider 能力位注册。
//
// 设计要点：
// - 懒加载：只有用户启用「本地语义检索」才创建 Worker——ORT 运行时（~14MB wasm）与
//   模型权重（~24MB q8）都是按需加载，不启用语义功能的应用启动路径零额外开销；
// - 增量同步：客户端镜像 Worker 向量库的内容戳（stamp），只把脏会议的检索分段发过去；
//   分段文本也只对脏会议构建（全量构建分段本身有主线程成本）；
// - Worker 挂了 / 模型加载失败：状态置 error，所有消费方回退既有路线
//   （关键词检索 + 付费 LLM 语义找会），功能降级不致命。

import { registerEmbeddingProvider } from "@/lib/providers"
import { buildSegments } from "@/lib/semanticCore"
import { contentStamp, type Meeting } from "@/lib/store"

export type SemanticBackend = "webgpu" | "wasm"

export interface SemanticStatus {
  state: "off" | "loading" | "ready" | "error"
  backend?: SemanticBackend
  dtype?: string
  model?: string
  docs?: number // 已建向量的会议数（覆盖率分子）
  segments?: number // 向量段总数
  index?: "hnsw" | "building" | "brute" // 向量检索结构：HNSW 图 / 渐进建图中 / 小库精确扫描
  error?: string
}

export interface SemanticHit {
  meetingId: string
  score: number // 余弦相似度 0-1
}

// 段级命中（RAG 召回用）：segIdx 对应 buildSegments 输出的段号（0 = 信息密集头部）
export interface SemanticSegmentHit {
  meetingId: string
  segIdx: number
  score: number
}

type StatusListener = (s: SemanticStatus) => void
type ProgressListener = (done: number, total: number) => void

type OutMsg =
  | { type: "status"; status: SemanticStatus }
  | { type: "stamps"; entries: [string, number][] }
  | { type: "progress"; done: number; total: number }
  | { type: "result"; reqId: number; hits: SemanticHit[] }
  | { type: "segResult"; reqId: number; hits: SemanticSegmentHit[] }
  | { type: "embedded"; reqId: number; vectors: number[][] }

let worker: Worker | null = null
let broken = false
let currentStatus: SemanticStatus = { state: "off" }
const stampMirror = new Map<string, number>()
const statusListeners = new Set<StatusListener>()
const progressListeners = new Set<ProgressListener>()
const pendingResults = new Map<number, (hits: SemanticHit[]) => void>()
const pendingSegResults = new Map<number, (hits: SemanticSegmentHit[]) => void>()
const pendingEmbeds = new Map<number, (vecs: number[][]) => void>()
let nextReqId = 1
let initWaiters: ((s: SemanticStatus) => void)[] = []
let providerRegistered = false

export function getSemanticStatus(): SemanticStatus {
  return currentStatus
}

export function onSemanticStatus(cb: StatusListener): () => void {
  statusListeners.add(cb)
  return () => statusListeners.delete(cb)
}

export function onSemanticProgress(cb: ProgressListener): () => void {
  progressListeners.add(cb)
  return () => progressListeners.delete(cb)
}

function setStatus(s: SemanticStatus): void {
  currentStatus = s
  for (const cb of statusListeners) cb(s)
  if (s.state === "ready") {
    for (const w of initWaiters) w(s)
    initWaiters = []
    registerProviderOnce()
  }
  if (s.state === "error") {
    for (const w of initWaiters) w(s)
    initWaiters = []
  }
}

function ensureWorker(): Worker | null {
  if (broken) return null
  if (worker) return worker
  try {
    if (typeof Worker === "undefined") {
      broken = true
      return null
    }
    worker = new Worker(new URL("./embedding.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<OutMsg>) => {
      const msg = e.data
      switch (msg.type) {
        case "status":
          setStatus(msg.status)
          break
        case "stamps": {
          stampMirror.clear()
          for (const [id, stamp] of msg.entries) stampMirror.set(id, stamp)
          break
        }
        case "progress":
          for (const cb of progressListeners) cb(msg.done, msg.total)
          break
        case "result": {
          const resolve = pendingResults.get(msg.reqId)
          if (resolve) {
            pendingResults.delete(msg.reqId)
            resolve(msg.hits)
          }
          break
        }
        case "segResult": {
          const resolve = pendingSegResults.get(msg.reqId)
          if (resolve) {
            pendingSegResults.delete(msg.reqId)
            resolve(msg.hits)
          }
          break
        }
        case "embedded": {
          const resolve = pendingEmbeds.get(msg.reqId)
          if (resolve) {
            pendingEmbeds.delete(msg.reqId)
            resolve(msg.vectors)
          }
          break
        }
      }
    }
    worker.onerror = () => {
      broken = true
      worker?.terminate()
      worker = null
      for (const [, resolve] of pendingResults) resolve([])
      pendingResults.clear()
      for (const [, resolve] of pendingSegResults) resolve([])
      pendingSegResults.clear()
      for (const [, resolve] of pendingEmbeds) resolve([])
      pendingEmbeds.clear()
      setStatus({ state: "error", error: "语义推理线程异常退出" })
    }
    return worker
  } catch {
    broken = true
    return null
  }
}

// 启动推理线程并等初始化完成（模型加载 + 向量库回填）。重复调用幂等。
export function initSemantic(basePath: string = import.meta.env.BASE_URL): Promise<SemanticStatus> {
  if (currentStatus.state === "ready" || currentStatus.state === "loading") {
    return currentStatus.state === "ready"
      ? Promise.resolve(currentStatus)
      : new Promise((resolve) => initWaiters.push(resolve))
  }
  const w = ensureWorker()
  if (!w) {
    const s: SemanticStatus = { state: "error", error: "当前浏览器不支持 Web Worker" }
    setStatus(s)
    return Promise.resolve(s)
  }
  const p = new Promise<SemanticStatus>((resolve) => initWaiters.push(resolve))
  w.postMessage({ type: "init", basePath })
  return p
}

export function stampOfMeeting(m: Meeting): number {
  return Math.max(m.updatedAt, contentStamp(m))
}

// 增量同步：只发内容戳变化过的会议；分段文本也只对脏会议构建。
// 删除的会议（镜像里有、meetings 里没有）一并通知 Worker 清理。
export function syncSemanticMeetings(meetings: Meeting[]): void {
  const w = worker
  if (!w || currentStatus.state !== "ready") return
  const live = new Set<string>()
  const dirty: { id: string; stamp: number; segments: string[] }[] = []
  for (const m of meetings) {
    live.add(m.id)
    const stamp = stampOfMeeting(m)
    if (stampMirror.get(m.id) === stamp) continue
    stampMirror.set(m.id, stamp) // 乐观更新，Worker 的 stamps 回执最终对齐
    dirty.push({ id: m.id, stamp, segments: buildSegments(m) })
  }
  const removed: string[] = []
  for (const id of stampMirror.keys()) {
    if (!live.has(id)) {
      removed.push(id)
      stampMirror.delete(id)
    }
  }
  if (removed.length > 0) w.postMessage({ type: "remove", ids: removed })
  if (dirty.length > 0) w.postMessage({ type: "sync", docs: dirty })
}

export function removeSemanticDocs(ids: string[]): void {
  for (const id of ids) stampMirror.delete(id)
  if (worker && currentStatus.state === "ready" && ids.length > 0) {
    worker.postMessage({ type: "remove", ids })
  }
}

// 全量重建：清空向量库后重新同步（换模型 / 用户手动触发）
export function rebuildSemanticIndex(meetings: Meeting[]): void {
  const w = worker
  if (!w || currentStatus.state !== "ready") return
  stampMirror.clear()
  w.postMessage({ type: "clear" })
  const docs = meetings.map((m) => ({
    id: m.id,
    stamp: stampOfMeeting(m),
    segments: buildSegments(m),
  }))
  for (const d of docs) stampMirror.set(d.id, d.stamp)
  w.postMessage({ type: "sync", docs })
}

export function semanticSearch(query: string, topK = 8): Promise<SemanticHit[]> {
  if (!worker || currentStatus.state !== "ready" || !query.trim()) return Promise.resolve([])
  return new Promise((resolve) => {
    const reqId = nextReqId++
    pendingResults.set(reqId, resolve)
    worker?.postMessage({ type: "search", reqId, query: query.trim(), topK })
  })
}

// 段级语义检索（RAG 管线「召回」阶段用）：返回最相关的文本段命中，
// 调用方用 buildSegments 重建段文本（同一纯函数、同一分段方案，segIdx 一一对应）
export function semanticSearchSegments(query: string, topK = 50): Promise<SemanticSegmentHit[]> {
  if (!worker || currentStatus.state !== "ready" || !query.trim()) return Promise.resolve([])
  return new Promise((resolve) => {
    const reqId = nextReqId++
    pendingSegResults.set(reqId, resolve)
    worker?.postMessage({ type: "searchSegments", reqId, query: query.trim(), topK })
  })
}

// 通用文本向量化（EmbeddingProvider 能力位的实现通道）
export function embedTexts(texts: string[]): Promise<number[][]> {
  if (!worker || currentStatus.state !== "ready" || texts.length === 0) {
    return Promise.resolve([])
  }
  return new Promise((resolve) => {
    const reqId = nextReqId++
    pendingEmbeds.set(reqId, resolve)
    worker?.postMessage({ type: "embed", reqId, texts })
  })
}

// 单文档语义索引写入（semanticIndex 契约的 upsert 通道：整段文本当一个分段）
export function upsertSemanticText(meetingId: string, text: string): void {
  const w = worker
  if (!w || currentStatus.state !== "ready") return
  const stamp = Date.now()
  stampMirror.set(meetingId, stamp)
  w.postMessage({ type: "sync", docs: [{ id: meetingId, stamp, segments: [text.slice(0, 400)] }] })
}

// ── Provider 能力位注册：就绪后把本地实现挂进 EMBEDDING_PROVIDERS，
// getActiveEmbedder() 的消费方（语义索引升级路线）自动拿到本地通道 ──
function registerProviderOnce(): void {
  if (providerRegistered) return
  providerRegistered = true
  registerEmbeddingProvider({
    meta: {
      id: "local-web-embedding",
      name: "本地向量模型（bge-small-zh）",
      kind: "embed",
      runtime: "local",
      description:
        "浏览器内推理的中文向量模型：WebGPU 可用时走 GPU（q4f16 量化），否则 WASM-SIMD CPU 回退（q8 量化）；数据不出机器、零调用费用",
      configSchema: [],
    },
    supported: () => getSemanticStatus().state === "ready",
    embed: async (texts) => embedTexts(texts),
  })
}
