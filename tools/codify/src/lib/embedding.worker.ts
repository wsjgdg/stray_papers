// 推理 Worker：embedding 生成与向量检索全部在独立线程执行，主线程只收发消息。
//
// 后端选择（初始化时一次性判定）：
// - WebGPU：有 GPU 适配器 且 远程优化资产可达（q4f16 权重 + ORT jsep 运行时）时启用，
//   dtype=q4f16（针对 WebGPU 的 4-bit 量化优化档），批量推理优势明显；
// - WASM-SIMD 回退：无 WebGPU 的设备 / 隔离预览（外网不可达）走本地打包资产，
//   dtype=q8（model_quantized.onnx），中小模型上 CPU 推理已足够快。
// 模型权重、分词器、ORT 运行时全部随应用本地分发（public/），常规路径零外部请求。
//
// 向量存储：8-bit 非对称标量量化（vectorCodec）——512 维 float32 段向量 2048B → ~524B，
// 存储与内存占用同降 ~74%；查询侧保持 float32 做非对称距离，排序近乎无损
// （实测会议级 top-5 保持率 ≥98%；4-bit 档实测边界名次互换可见，故不采用，读侧仍兼容旧 4-bit 记录）。
//
// 向量检索：HNSW 近似最近邻（hnsw.ts）替代暴力遍历——节点级索引（每段一个节点），
// 会议得分 = 各段最大余弦；万级节点下查询对数级复杂度。
// - 冷启动：向量从 IndexedDB 回填后分片让出消息循环渐进建图，期间检索走量化暴力扫描
//   （本就毫秒级，正确性无损）；节点数低于门槛（256）时始终暴力精确扫描；
// - 删除 = 墓碑标记，占比超 30% 自动触发重建压缩；
// - LRU 解码缓存加速图内节点间距离（高层枢纽反复参与打分）。
//
// 向量库：独立 IndexedDB「meeting-notes-vectors」（不与主库共享连接，避免版本升级互锁），
// 记录 { meetingId, stamp, model, vectors: QVec[] }；stamp 是内容戳——增量构建的脏标记，
// 未变化的会议直接跳过，不重复推理。增量保存只写脏会议记录，天然比全量快一个数量级。
//
// 协议（主线程 → Worker）：
// - { type:"init", basePath }
// - { type:"sync", docs:[{id, stamp, segments:string[]}] }   只发脏文档
// - { type:"remove", ids } / { type:"clear" }
// - { type:"search", reqId, query, topK }                       会议级命中（max-pool）
// - { type:"searchSegments", reqId, query, topK }                段级命中（RAG 召回用）
// - { type:"embed", reqId, texts }                            通用文本向量化（Provider 能力位）
// （Worker → 主线程）：
// - { type:"status", status } / { type:"stamps", entries } / { type:"progress", done, total }
// - { type:"result", reqId, hits } / { type:"segResult", reqId, hits } / { type:"embedded", reqId, vectors }

import { env, pipeline } from "@huggingface/transformers"
import { QUERY_INSTRUCTION, SEGMENT_SCHEMA_TAG, SEMANTIC_MODEL_ID } from "@/lib/semanticCore"
import { DecodeLru, cosineMaxQ, cosineQ, quantize, type QVec } from "@/lib/vectorCodec"
import { HnswIndex, type HnswScorers } from "@/lib/hnsw"

// 与 lockfile 中 onnxruntime-web 版本保持一致（WebGPU jsep 运行时走 CDN 时才用到）
const ORT_VERSION = "1.31.0-dev.20260914-8d85527a0"
const JSEP_DIST_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`
const REMOTE_MODEL_HOST = "https://hf-mirror.com/"
const EMBED_BATCH = 8
// 低于该节点数不启用 HNSW：暴力扫描本就 <1ms，近似索引没有收益
const HNSW_MIN_NODES = 256
// 墓碑占比超过该值触发图重建压缩
const TOMBSTONE_REBUILD_RATIO = 0.3
// 节点间距离的解码缓存容量（覆盖 HNSW 上层枢纽与热点邻居）
const DECODE_LRU_CAP = 4096

type SemanticState = "off" | "loading" | "ready" | "error"
interface SemanticStatus {
  state: SemanticState
  backend?: "webgpu" | "wasm"
  dtype?: string
  model?: string
  docs?: number
  segments?: number
  index?: "hnsw" | "building" | "brute"
  error?: string
}

type InMsg =
  | { type: "init"; basePath: string }
  | { type: "sync"; docs: { id: string; stamp: number; segments: string[] }[] }
  | { type: "remove"; ids: string[] }
  | { type: "clear" }
  | { type: "search"; reqId: number; query: string; topK: number }
  | { type: "searchSegments"; reqId: number; query: string; topK: number }
  | { type: "embed"; reqId: number; texts: string[] }

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<InMsg>) => void) | null
  postMessage: (msg: unknown) => void
}

// ── 推理管线状态 ──

interface Extractor {
  (texts: string[], opts: { pooling: "cls" | "mean"; normalize: boolean }): Promise<{
    dims: number[]
    data: Float32Array
  }>
}

let extractor: Extractor | null = null
let status: SemanticStatus = { state: "off" }

// meetingId → { stamp, 量化段向量 }
const vecStore = new Map<string, { stamp: number; vectors: QVec[] }>()

// ── HNSW 节点层：节点 = 一段向量，得分聚合到会议 = 各段最大值 ──

let hnsw: HnswIndex | null = null
let hnswBuildDone = false
let buildToken = 0
let nextNodeId = 0
const nodeVec = new Map<number, QVec>()
const nodeMeeting = new Map<number, string>()
// 节点 → 段号（buildSegments 输出顺序）：段级检索返回 segIdx，
// 主线程用同一纯函数重建段文本即可对齐（stamp 一致 = 分段一致）
const nodeSeg = new Map<number, number>()
const meetingNodes = new Map<string, number[]>()
const tombstones = new Set<number>()
const lru = new DecodeLru(DECODE_LRU_CAP)

const hnswScorers: HnswScorers = {
  // 查询（float32 单位向量）→ 节点：直接对量化码做非对称余弦，零解码分配
  queryToNode: (query, nodeId) => {
    const v = nodeVec.get(nodeId)
    return v ? cosineQ(query, v) : -1
  },
  // 节点 → 节点：走 LRU 解码缓存（图构建与收缩的热点路径）
  nodeToNode: (a, b) => {
    const qa = nodeVec.get(a)
    const qb = nodeVec.get(b)
    if (!qa || !qb) return -1
    const va = lru.get(a, qa)
    const vb = lru.get(b, qb)
    let dot = 0
    for (let i = 0; i < va.length; i++) dot += va[i] * vb[i]
    return dot / (qa.norm * qb.norm)
  },
  isDeleted: (nodeId) => tombstones.has(nodeId),
}

// 一场会议的向量组挂进索引：旧节点全部墓碑，新节点顺次入图
function attachMeetingVectors(meetingId: string, qvecs: QVec[]): void {
  for (const nid of meetingNodes.get(meetingId) ?? []) {
    hnsw?.markDeleted(nid)
    tombstones.add(nid)
    nodeVec.delete(nid)
    nodeMeeting.delete(nid)
    nodeSeg.delete(nid)
    lru.invalidate(nid)
  }
  const ids: number[] = []
  qvecs.forEach((qv, segIdx) => {
    const nid = nextNodeId++
    nodeVec.set(nid, qv)
    nodeMeeting.set(nid, meetingId)
    nodeSeg.set(nid, segIdx)
    ids.push(nid)
    hnsw?.add(nid) // add 幂等：建图期间的增量节点不会与渐进构建重复
  })
  if (ids.length > 0) meetingNodes.set(meetingId, ids)
  else meetingNodes.delete(meetingId)
  maybeRebuild()
}

function detachMeeting(meetingId: string): void {
  for (const nid of meetingNodes.get(meetingId) ?? []) {
    hnsw?.markDeleted(nid)
    tombstones.add(nid)
    nodeVec.delete(nid)
    nodeMeeting.delete(nid)
    nodeSeg.delete(nid)
    lru.invalidate(nid)
  }
  meetingNodes.delete(meetingId)
  maybeRebuild()
}

function maybeRebuild(): void {
  if (!hnsw || !hnswBuildDone) return
  if (hnsw.deletedCount() > 64 && hnsw.tombstoneRatio() > TOMBSTONE_REBUILD_RATIO) {
    // 墓碑堆积：换一张干净的图，活节点全量重挂（量化向量就在内存，秒级）
    hnsw = new HnswIndex(hnswScorers, { seed: 0x5eed })
    hnswBuildDone = false
    tombstones.clear()
    lru.clear()
    void ensureHnswBuilt()
  }
}

// 渐进建图：每 200 个节点让出一次消息循环，期间搜索走暴力兜底、应用无感
async function ensureHnswBuilt(): Promise<void> {
  if (hnswBuildDone) return
  const token = ++buildToken
  if (!hnsw) hnsw = new HnswIndex(hnswScorers, { seed: 0x5eed })
  postStatus({ index: "building" })
  const ids = [...nodeVec.keys()]
  for (let i = 0; i < ids.length; i++) {
    if (token !== buildToken) return // 被 clear / 重建取消
    hnsw.add(ids[i])
    if (i % 200 === 199) await new Promise((r) => setTimeout(r, 0))
  }
  if (token !== buildToken) return
  hnswBuildDone = true
  postStatus({ index: hnsw.liveCount() >= HNSW_MIN_NODES ? "hnsw" : "brute" })
}

// ── 向量库（独立 IDB，Worker 内自持） ──

const VDB_NAME = "meeting-notes-vectors"
const VSTORE = "vectors"
let vdb: IDBDatabase | null = null

function openVecDb(): Promise<IDBDatabase | null> {
  if (vdb) return Promise.resolve(vdb)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(VDB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(VSTORE)) {
          req.result.createObjectStore(VSTORE, { keyPath: "meetingId" })
        }
      }
      req.onsuccess = () => {
        vdb = req.result
        vdb.onversionchange = () => vdb?.close()
        resolve(vdb)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

interface VecRecord {
  meetingId: string
  stamp: number
  model: string
  vectors: (QVec | Float32Array)[]
}

// 兼容读取：旧版记录存的是 float32 原始向量，加载时现场量化（下次保存自动落新格式）
function normalizeRecordVectors(vectors: (QVec | Float32Array)[]): QVec[] {
  return vectors.map((v) => (v instanceof Float32Array ? quantize(v) : v))
}

async function hydrateVecStore(): Promise<void> {
  const db = await openVecDb()
  if (!db) return
  const all: VecRecord[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(VSTORE, "readonly")
    const req = tx.objectStore(VSTORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  for (const rec of all) {
    // 换模型或分段方案升级（chunk2 语义分块）后的旧向量不参与检索，待重建覆盖
    if (rec.model !== SEGMENT_SCHEMA_TAG) continue
    const qvecs = normalizeRecordVectors(rec.vectors ?? [])
    vecStore.set(rec.meetingId, { stamp: rec.stamp, vectors: qvecs })
    attachMeetingVectors(rec.meetingId, qvecs)
  }
}

async function persistVecs(
  puts: { meetingId: string; stamp: number; vectors: QVec[] }[],
  deletes: string[],
): Promise<void> {
  const db = await openVecDb()
  if (!db) return
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VSTORE, "readwrite")
    const store = tx.objectStore(VSTORE)
    for (const p of puts) store.put({ ...p, model: SEGMENT_SCHEMA_TAG })
    for (const id of deletes) store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// ── 后端选择 ──

function postStatus(patch?: Partial<SemanticStatus>): void {
  if (patch) status = { ...status, ...patch }
  ctx.postMessage({ type: "status", status })
}

function postStamps(): void {
  const entries: [string, number][] = [...vecStore].map(([id, v]) => [id, v.stamp])
  ctx.postMessage({ type: "stamps", entries })
}

async function probeUrl(url: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

// WebGPU 可用性 = GPU 适配器 + 远程优化资产（jsep 运行时 / q4f16 权重）都就绪。
// 隔离预览等外网不可达环境探测自然失败 → 直接走本地 WASM 路径，绝不半途换配置污染 ORT。
async function webgpuAvailable(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.gpu) return false
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) return false
    return await probeUrl(`${JSEP_DIST_URL}ort-wasm-simd-threaded.jsep.wasm`)
  } catch {
    return false
  }
}

async function initPipeline(basePath: string): Promise<void> {
  status = { state: "loading", model: SEMANTIC_MODEL_ID }
  postStatus()

  // 公共配置：单线程（无跨源隔离时 SharedArrayBuffer 不可用）、不走主线程代理
  const wasmBackend = env.backends.onnx.wasm!
  wasmBackend.numThreads = 1
  wasmBackend.proxy = false
  env.allowLocalModels = true
  env.localModelPath = `${basePath}models/`

  // 1) WebGPU + q4f16：远程资产可达才尝试；失败完整回退，不留半初始化状态
  if (await webgpuAvailable()) {
    try {
      env.allowRemoteModels = true
      env.remoteHost = REMOTE_MODEL_HOST
      wasmBackend.wasmPaths = JSEP_DIST_URL
      const gpuPipeline = (await pipeline("feature-extraction", SEMANTIC_MODEL_ID, {
        device: "webgpu",
        dtype: "q4f16",
      })) as unknown as Extractor
      extractor = gpuPipeline
      postStatus({ backend: "webgpu", dtype: "q4f16" })
      return
    } catch {
      // 落到 WASM 路径（下面重设全部路径配置）
    }
  }

  // 2) WASM-SIMD + q8：全本地资产，离线可用
  env.allowRemoteModels = false
  wasmBackend.wasmPaths = `${basePath}ort/`
  const wasmPipeline = (await pipeline("feature-extraction", SEMANTIC_MODEL_ID, {
    device: "wasm",
    dtype: "q8",
  })) as unknown as Extractor
  extractor = wasmPipeline
  postStatus({ backend: "wasm", dtype: "q8" })
}

// ── 推理 ──

async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (!extractor || texts.length === 0) return []
  const out: Float32Array[] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH)
    const res = await extractor(batch, { pooling: "cls", normalize: true })
    const dim = res.dims[res.dims.length - 1]
    for (let b = 0; b < batch.length; b++) {
      out.push(new Float32Array(res.data.slice(b * dim, (b + 1) * dim)))
    }
  }
  return out
}

async function handleSync(docs: { id: string; stamp: number; segments: string[] }[]): Promise<void> {
  if (!extractor) return
  // Worker 侧再做一次 stamp 脏检查（客户端可能漏判）：已有索引保持不变
  const dirty = docs.filter((d) => {
    const cur = vecStore.get(d.id)
    return !cur || cur.stamp !== d.stamp
  })
  const puts: { meetingId: string; stamp: number; vectors: QVec[] }[] = []
  let done = 0
  for (const doc of dirty) {
    const floats = doc.segments.length > 0 ? await embedTexts(doc.segments) : []
    const qvecs = floats.map(quantize)
    vecStore.set(doc.id, { stamp: doc.stamp, vectors: qvecs })
    attachMeetingVectors(doc.id, qvecs)
    puts.push({ meetingId: doc.id, stamp: doc.stamp, vectors: qvecs })
    done++
    if (done % 4 === 0 || done === dirty.length) {
      // 分批落盘 + 上报进度：中途关页也只丢最后一小批
      await persistVecs(puts.splice(0), [])
      ctx.postMessage({ type: "progress", done, total: dirty.length })
    }
  }
  if (puts.length > 0) await persistVecs(puts, [])
  if (!hnswBuildDone && nodeVec.size > 0) void ensureHnswBuilt()
  refreshCounts()
  postStamps()
}

function refreshCounts(): void {
  let segments = 0
  for (const v of vecStore.values()) segments += v.vectors.length
  postStatus({
    docs: vecStore.size,
    segments,
    ...(hnswBuildDone
      ? { index: (hnsw?.liveCount() ?? 0) >= HNSW_MIN_NODES ? "hnsw" : "brute" }
      : {}),
  })
}

async function handleRemove(ids: string[]): Promise<void> {
  for (const id of ids) {
    vecStore.delete(id)
    detachMeeting(id)
  }
  await persistVecs([], ids)
  refreshCounts()
  postStamps()
}

async function handleClear(): Promise<void> {
  const ids = [...vecStore.keys()]
  vecStore.clear()
  hnsw = null
  hnswBuildDone = false
  buildToken++ // 取消进行中的渐进构建
  nextNodeId = 0
  nodeVec.clear()
  nodeMeeting.clear()
  nodeSeg.clear()
  meetingNodes.clear()
  tombstones.clear()
  lru.clear()
  await persistVecs([], ids)
  refreshCounts()
  postStamps()
}

async function handleSearch(reqId: number, query: string, topK: number): Promise<void> {
  if (!extractor || vecStore.size === 0) {
    ctx.postMessage({ type: "result", reqId, hits: [] })
    return
  }
  // BGE 约定：查询侧加检索指令前缀（文档侧不加）
  const [qvec] = await embedTexts([QUERY_INSTRUCTION + query])
  const scores = new Map<string, number>()

  if (hnswBuildDone && hnsw && hnsw.liveCount() >= HNSW_MIN_NODES) {
    // HNSW 近似最近邻：多取节点候选（一场会多段，节点数 > 会议数），聚合到会议取最大
    const hits = hnsw.search(qvec, Math.max(topK * 6, 48))
    for (const h of hits) {
      const mid = nodeMeeting.get(h.id)
      if (!mid) continue
      const prev = scores.get(mid)
      if (prev === undefined || h.score > prev) scores.set(mid, h.score)
    }
  } else {
    // 建图中 / 小库：量化向量暴力精确扫描（万级节点也只需毫秒级）
    for (const [mid, rec] of vecStore) {
      const s = cosineMaxQ(qvec, rec.vectors)
      if (s > 0) scores.set(mid, s)
    }
  }

  const hits: { meetingId: string; score: number }[] = []
  for (const [meetingId, score] of scores) {
    hits.push({ meetingId, score: Math.round(score * 10000) / 10000 })
  }
  hits.sort((a, b) => b.score - a.score)
  ctx.postMessage({ type: "result", reqId, hits: hits.slice(0, topK) })
}

// 段级检索（RAG 召回用）：不聚合到会议，直接返回最相关的文本段命中。
// 主线程拿 (meetingId, segIdx) 用 buildSegments 纯函数重建段文本——
// stamp 一致则分段一致，无需在向量库里冗余存原文。
async function handleSearchSegments(reqId: number, query: string, topK: number): Promise<void> {
  if (!extractor || vecStore.size === 0) {
    ctx.postMessage({ type: "segResult", reqId, hits: [] })
    return
  }
  const [qvec] = await embedTexts([QUERY_INSTRUCTION + query])
  const hits: { meetingId: string; segIdx: number; score: number }[] = []

  if (hnswBuildDone && hnsw && hnsw.liveCount() >= HNSW_MIN_NODES) {
    // 段级 topK 直接取节点级命中（节点 = 段），多取一倍余量防墓碑占位
    for (const h of hnsw.search(qvec, Math.max(topK * 2, 64)).slice(0, topK * 2)) {
      const mid = nodeMeeting.get(h.id)
      if (!mid) continue
      hits.push({ meetingId: mid, segIdx: nodeSeg.get(h.id) ?? 0, score: Math.round(h.score * 10000) / 10000 })
      if (hits.length >= topK) break
    }
  } else {
    // 建图中 / 小库：暴力精确扫描每段
    for (const [mid, rec] of vecStore) {
      rec.vectors.forEach((v, segIdx) => {
        const s = cosineQ(qvec, v)
        if (s > 0) hits.push({ meetingId: mid, segIdx, score: Math.round(s * 10000) / 10000 })
      })
    }
    hits.sort((a, b) => b.score - a.score)
    hits.splice(topK)
  }
  ctx.postMessage({ type: "segResult", reqId, hits })
}

// ── 消息循环 ──

let initPromise: Promise<void> | null = null

ctx.onmessage = (e) => {
  const msg = e.data
  void (async () => {
    try {
      switch (msg.type) {
        case "init": {
          if (!initPromise) {
            initPromise = (async () => {
              await initPipeline(msg.basePath)
              await hydrateVecStore()
              refreshCounts()
              postStatus({ state: "ready" })
              postStamps()
              // 渐进建 HNSW 图：不阻塞 ready——期间检索走暴力兜底，行为无损
              void ensureHnswBuilt()
            })().catch((err) => {
              initPromise = null // 允许重试
              postStatus({ state: "error", error: String(err?.message ?? err) })
            })
          }
          await initPromise
          break
        }
        case "sync":
          await initPromise
          await handleSync(msg.docs)
          break
        case "remove":
          await initPromise
          await handleRemove(msg.ids)
          break
        case "clear":
          await initPromise
          await handleClear()
          break
        case "search":
          await initPromise
          await handleSearch(msg.reqId, msg.query, msg.topK)
          break
        case "searchSegments":
          await initPromise
          await handleSearchSegments(msg.reqId, msg.query, msg.topK)
          break
        case "embed": {
          await initPromise
          const vectors = extractor ? await embedTexts(msg.texts) : []
          ctx.postMessage({
            type: "embedded",
            reqId: msg.reqId,
            vectors: [...vectors].map((v) => Array.from(v)),
          })
          break
        }
      }
    } catch (err) {
      postStatus({ state: "error", error: String((err as Error)?.message ?? err) })
    }
  })()
}
