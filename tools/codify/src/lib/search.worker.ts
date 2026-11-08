/// 检索 Worker：索引构建与查询全部在独立线程执行——
/// 搜索框逐键触发查询时，主线程只负责收发消息，输入永不因检索卡顿。
///
/// 协议（主线程 → Worker）：
/// - { type: "sync", docs: SearchDoc[] }    增量同步：只发内容戳变化过的文档
/// - { type: "remove", ids: string[] }      删除文档
/// - { type: "search", reqId: number, tokens: string[] }
/// （Worker → 主线程）：
/// - { type: "ready" }
/// - { type: "synced", count: number }
/// - { type: "result", reqId: number, hits: SearchHit[] }

import {
  createIndex,
  indexRemove,
  indexUpsert,
  runSearch,
  type SearchDoc,
  type SearchHit,
} from "@/lib/searchCore"

type MainMessage =
  | { type: "sync"; docs: SearchDoc[] }
  | { type: "remove"; ids: string[] }
  | { type: "search"; reqId: number; tokens: string[] }

type WorkerMessage =
  | { type: "ready" }
  | { type: "synced"; count: number }
  | { type: "result"; reqId: number; hits: SearchHit[] }

// 结构化类型代替 DedicatedWorkerGlobalScope（避免为单个文件引入 webworker lib）
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<MainMessage>) => void) | null
  postMessage: (msg: WorkerMessage) => void
}

const idx = createIndex()

ctx.onmessage = (e) => {
  const msg = e.data
  switch (msg.type) {
    case "sync": {
      for (const doc of msg.docs) indexUpsert(idx, doc)
      ctx.postMessage({ type: "synced", count: msg.docs.length })
      break
    }
    case "remove": {
      for (const id of msg.ids) indexRemove(idx, id)
      ctx.postMessage({ type: "synced", count: 0 })
      break
    }
    case "search": {
      const hits = runSearch(idx, msg.tokens)
      ctx.postMessage({ type: "result", reqId: msg.reqId, hits })
      break
    }
  }
}

ctx.postMessage({ type: "ready" })
