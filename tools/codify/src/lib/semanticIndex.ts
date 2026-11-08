// 语义索引契约与本地实现。
//
// 形态：会议保存时把「标题/摘要/议题/决议/行动项 + 转写节选」分段向量化，
// 存入浏览器 IndexedDB（推理与向量库都在 Web Worker 内），检索走本地向量余弦——
// 全程本地、数据不出机器、零调用费用。
//
// 实现分层：
// - 本文件：SemanticIndex 契约 + localSemanticIndex（桥接 embeddingClient）；
// - embeddingClient.ts：Worker 生命周期、增量同步（内容戳脏标记）、状态广播、
//   EmbeddingProvider 能力位注册（providers.ts 的 EMBEDDING_PROVIDERS）；
// - embedding.worker.ts：Transformers.js 推理（WebGPU q4f16 / WASM-SIMD q8 双后端）、
//   bge-small-zh-v1.5 向量模型、独立向量库 meeting-notes-vectors；
// - semanticCore.ts：分段采样与向量运算（纯函数，两侧共用）。
//
// 未启用 / 未就绪时 supported() === false，消费方回退既有关键词检索 + LLM 语义找会路线。

import {
  getSemanticStatus,
  rebuildSemanticIndex,
  removeSemanticDocs,
  semanticSearch,
  upsertSemanticText,
} from "@/lib/embeddingClient"

export interface SemanticHit {
  meetingId: string
  score: number // 0-1，越大越相关
}

export interface SemanticIndex {
  /** 索引是否可用（embedding provider 已注册且存储可写）；false 时其余方法都是 no-op */
  supported: () => boolean
  /** 写入 / 更新一场会议的向量（文本建议为 摘要 + 议题 + 转写节选 拼接） */
  upsert: (meetingId: string, text: string) => Promise<void>
  remove: (meetingId: string) => Promise<void>
  /** 语义检索：返回相关度降序的会议命中 */
  search: (query: string, topK?: number) => Promise<SemanticHit[]>
  clear: () => Promise<void>
}

// 空实现：所有查询返回空、所有写入 no-op——本地推理不可用时的安全缺省
export const nullSemanticIndex: SemanticIndex = {
  supported: () => false,
  upsert: async () => {},
  remove: async () => {},
  search: async () => [],
  clear: async () => {},
}

export const localSemanticIndex: SemanticIndex = {
  supported: () => getSemanticStatus().state === "ready",
  upsert: async (meetingId, text) => {
    upsertSemanticText(meetingId, text)
  },
  remove: async (meetingId) => {
    removeSemanticDocs([meetingId])
  },
  search: (query, topK = 8) => semanticSearch(query, topK),
  // 全量清空 = 以空清单重建（Worker 清库后无事可同步）
  clear: async () => {
    rebuildSemanticIndex([])
  },
}

let activeIndex: SemanticIndex = localSemanticIndex

/** 注册语义索引实现（默认已注册本地推理版；fork / 自托管可覆盖，以最后一次为准） */
export function registerSemanticIndex(index: SemanticIndex): void {
  activeIndex = index
}

export function getSemanticIndex(): SemanticIndex {
  return activeIndex
}
