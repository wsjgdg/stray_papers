// 检索客户端：Worker 生命周期 + 增量同步 + 主线程降级。
//
// - 文档按内容戳（stamp）做脏标记，只把新增/变化的文档发给 Worker——已有索引不动；
// - 查询走 reqId 应答匹配，调用方自行丢弃过期响应（输入防抖期间可能有多发在途）；
// - Worker 不可用（老浏览器 / 特殊运行环境）时自动降级：同一套 searchCore 在主线程
//   维护镜像索引，行为与 Worker 模式完全一致，只是不再隔离卡顿。

import {
  createIndex,
  indexRemove,
  indexUpsert,
  runSearch,
  type SearchDoc,
  type SearchHit,
} from "@/lib/searchCore"

// ── Worker 通道 ──

type WorkerInbound =
  | { type: "ready" }
  | { type: "synced"; count: number }
  | { type: "result"; reqId: number; hits: SearchHit[] }

let worker: Worker | null = null
let workerBroken = false
const pending = new Map<number, (hits: SearchHit[]) => void>()
let nextReqId = 1

function ensureWorker(): Worker | null {
  if (workerBroken) return null
  if (worker) return worker
  try {
    if (typeof Worker === "undefined") {
      workerBroken = true
      return null
    }
    worker = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<WorkerInbound>) => {
      const msg = e.data
      if (msg.type === "result") {
        const resolve = pending.get(msg.reqId)
        if (resolve) {
          pending.delete(msg.reqId)
          resolve(msg.hits)
        }
      }
    }
    worker.onerror = () => {
      // Worker 挂了：在途请求全部按空结果放行，后续走主线程降级
      workerBroken = true
      worker?.terminate()
      worker = null
      for (const [, resolve] of pending) resolve([])
      pending.clear()
    }
    return worker
  } catch {
    workerBroken = true
    return null
  }
}

// ── 主线程降级镜像（仅 Worker 不可用时启用，避免双份索引内存） ──

let fallbackIndex: ReturnType<typeof createIndex> | null = null

// ── 增量同步：脏标记比对，只发变化过的文档 ──

const sentStamps = new Map<string, number>()
// 最近一次全量文档：Worker 中途挂掉时用它立即重建主线程镜像，不等下一次会议变更
let lastDocs: SearchDoc[] = []

export function syncSearchDocs(docs: SearchDoc[]): void {
  lastDocs = docs
  const live = new Set<string>()
  const changed: SearchDoc[] = []
  for (const d of docs) {
    live.add(d.id)
    if (sentStamps.get(d.id) !== d.stamp) {
      changed.push(d)
      sentStamps.set(d.id, d.stamp)
    }
  }
  const removed: string[] = []
  for (const id of sentStamps.keys()) {
    if (!live.has(id)) {
      removed.push(id)
      sentStamps.delete(id)
    }
  }
  if (changed.length === 0 && removed.length === 0) return

  const w = ensureWorker()
  if (w) {
    if (changed.length > 0) w.postMessage({ type: "sync", docs: changed })
    if (removed.length > 0) w.postMessage({ type: "remove", ids: removed })
  }
  if (fallbackIndex) {
    for (const d of changed) indexUpsert(fallbackIndex, d)
    for (const id of removed) indexRemove(fallbackIndex, id)
  } else if (!w) {
    // Worker 不可用：首次遇到变更时建立主线程镜像索引
    fallbackIndex = createIndex()
    for (const d of docs) indexUpsert(fallbackIndex, d)
  }
}

export function dropSearchDocs(ids: Iterable<string>): void {
  const list = [...ids]
  for (const id of list) sentStamps.delete(id)
  const w = ensureWorker()
  if (w && list.length > 0) w.postMessage({ type: "remove", ids: list })
  if (fallbackIndex) for (const id of list) indexRemove(fallbackIndex, id)
}

// ── 查询 ──

export function searchDocsAsync(tokens: string[]): Promise<SearchHit[]> {
  const clean = tokens.map((t) => t.trim().toLowerCase()).filter(Boolean)
  if (clean.length === 0) return Promise.resolve([])
  const w = ensureWorker()
  if (w) {
    return new Promise<SearchHit[]>((resolve) => {
      const reqId = nextReqId++
      pending.set(reqId, resolve)
      w.postMessage({ type: "search", reqId, tokens: clean })
    })
  }
  if (!fallbackIndex) {
    fallbackIndex = createIndex()
    for (const d of lastDocs) indexUpsert(fallbackIndex, d)
  }
  return Promise.resolve(runSearch(fallbackIndex, clean))
}
