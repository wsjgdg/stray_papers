// 语义核心（纯函数，无 DOM / Worker / transformers 依赖，主线程与推理 Worker 共用）：
// 检索文本分段采样、向量运算、BGE 模型约定。
//
// 分段策略（语义分块，chunk2）：一场会议 ≤ 21 段向量——
// - 1 段「信息密集头部」：标题/日期/标签/一句话摘要/议题要点/决议/行动项/随手记（纪要的浓缩层）；
// - ≤20 段转写语义块：按话题边界切分（段落空行 / 时间戳大间隔 / 说话人轮换），
//   块间保留 ~70 字重叠——检索命中的块是语义完整的讨论单元，不会「检索到半句话」；
//   超量时等距采样（保首尾），两小时的会也全覆盖而不是只看开头。
// 检索打分 = 查询向量与会议各段向量余弦的最大值（max-pool）：命中任意一段即算相关。
//
// 块大小的诚实说明：目标 512-1024 token 的通用语义分块建议在这里受模型上下文约束——
// bge-small-zh 上下文只有 512 token（中文 1 字 ≈ 1 token），所以块上限取 ~480 字，
// 目标 ~420 字；重叠 70 字落在建议的 50-100 token 区间内。
//
// 模型约定（BAAI BGE 系列）：查询侧加官方检索指令前缀、文档侧不加；CLS 池化 + L2 归一化。

export const SEMANTIC_MODEL_ID = "bge-small-zh-v1.5"
export const VECTOR_DIM = 512
export const QUERY_INSTRUCTION = "为这个句子生成表示以用于检索相关文章："

// 向量库记录的分段方案标签：分段算法升级时改变该标签，Worker 水合时跳过旧方案的
// 记录（等同换模型的失效语义）——下次增量同步自动按新方案重建，无需用户手动操作
export const SEGMENT_SCHEMA_TAG = `${SEMANTIC_MODEL_ID}@chunk2`

// 每段字符上限：bge-small 上下文 512 token，中文 1 字 ≈ 1 token。
// 头部信息段沿用 300 字（浓缩层，信息密度高）；转写语义块目标 420 / 硬上限 480。
const SEGMENT_CHARS = 300
const CHUNK_TARGET = 420
const CHUNK_MAX = 480
// 块间重叠：上一块结尾的一句话（≤70 字）带进下一块开头——话题跨块讨论时两侧都能命中
const CHUNK_OVERLAP = 70
// 时间戳间隔超过该秒数视为话题边界（长时间停顿后大概率换了议题）
const GAP_SECONDS = 120
// 转写采样段数上限：20 段语义块，等距采样覆盖整场；
// 一场会全量建索引 ≈ 6-9s（WASM 单线程，后台执行），WebGPU 设备快一个数量级
const MAX_TRANSCRIPT_SEGMENTS = 20

// buildSegments 的结构化输入（Meeting 结构上满足；避免 Worker 打包进 store 的依赖链）
export interface SemanticSource {
  title: string
  date: string
  tags: string[]
  transcript: string
  brief?: { content: string } | null
  outline?: { topics: { topic: string; points: string[] }[] } | null
  actions?: { content: string; assignee: string }[]
  decisions?: { content: string }[]
  notes?: { text: string }[]
}

export function buildHeadText(m: SemanticSource): string {
  const parts: string[] = [`${m.title}（${m.date}）`]
  if (m.tags.length > 0) parts.push(`标签：${m.tags.join("、")}`)
  if (m.brief?.content.trim()) parts.push(`摘要：${m.brief.content.trim()}`)
  for (const t of m.outline?.topics ?? []) {
    parts.push(`议题：${t.topic}`, ...t.points.map((p) => `- ${p}`))
  }
  for (const d of m.decisions ?? []) if (d.content.trim()) parts.push(`决议：${d.content.trim()}`)
  for (const a of m.actions ?? []) {
    if (!a.content.trim()) continue
    parts.push(`行动项：${a.content.trim()}${a.assignee ? `（负责人：${a.assignee}）` : ""}`)
  }
  for (const n of m.notes ?? []) if (n.text.trim()) parts.push(`随手记：${n.text.trim()}`)
  return parts.join("\n").slice(0, SEGMENT_CHARS)
}

// ── 语义分块 ──

// 行首时间戳：[03:25] / [00:01:23] / 03:25 等常见转写格式
const TS_RE = /^\s*\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*/
// 行首说话人标记（与 clean.ts / speakers.ts 同口径的宽松版）
const SPK_RE = /^\s*(?:\[[^\]]*\]\s*)?([^:：[\]\n]{1,12})[:：]/

interface ParsedLine {
  text: string
  ts: number | null // 绝对秒（时:分:秒 折算），无时间戳为 null
  speaker: string
}

function parseLine(raw: string): ParsedLine {
  const text = raw.trim()
  let ts: number | null = null
  const tm = TS_RE.exec(text)
  if (tm) {
    ts = tm[3] !== undefined ? +tm[1] * 3600 + +tm[2] * 60 + +tm[3] : +tm[1] * 60 + +tm[2]
  }
  let speaker = ""
  const sm = SPK_RE.exec(text)
  if (sm) speaker = sm[1].trim()
  return { text, ts, speaker }
}

// 句子边界硬切：单行超过块上限时按句读切，绝不把一个句子拦腰截断
function splitLongLine(line: string): string[] {
  if (line.length <= CHUNK_MAX) return [line]
  const parts = line.split(/(?<=[。！？；?!;\n])/)
  const out: string[] = []
  let cur = ""
  for (const p of parts) {
    if (cur.length + p.length > CHUNK_MAX && cur) {
      out.push(cur)
      cur = p
    } else {
      cur += p
    }
  }
  if (cur) out.push(cur)
  return out
}

// 从块结尾取重叠尾巴：最后一句（或最后 ~CHUNK_OVERLAP 字），带进下一块开头
function overlapTail(chunk: string): string {
  const tail = chunk.slice(-CHUNK_OVERLAP * 2)
  const cut = tail.search(/[。！？；?!;\n]/)
  if (cut >= 0 && tail.length - cut - 1 <= CHUNK_OVERLAP) {
    return tail.slice(cut + 1).trim()
  }
  return tail.slice(-CHUNK_OVERLAP).replace(/^[^\s。！？；，、]*[,，、\s]/, "").trim()
}

// 转写稿按话题边界切成语义块（无段数上限版）：
// 边界信号 = 段落空行（补标点整理按话题分段产生）> 时间戳大间隔（≥120s）> 说话人轮换；
// 块长达到目标区间后只在强边界断开，短讨论不会被切碎。
// 索引与问答召回共用本函数——Worker 段号与主线程重建的块一一对应（segIdx 对齐的前提）。
export function chunkTranscriptSemantic(transcript: string): string[] {
  const chunks: string[] = []
  let cur: string[] = []
  let curLen = 0
  let prevTs: number | null = null
  let prevSpeaker = ""

  const flush = () => {
    if (curLen === 0) return
    const text = cur.join("\n")
    chunks.push(text)
    const tail = overlapTail(text)
    cur = tail ? [tail] : []
    curLen = cur.reduce((n, l) => n + l.length, 0)
  }

  for (const raw of transcript.split("\n")) {
    if (!raw.trim()) {
      // 段落空行 = 整理稿的话题边界：已有内容且不算太短就断块
      if (curLen >= 120) flush()
      continue
    }
    const parsed = parseLine(raw)
    const gap = parsed.ts !== null && prevTs !== null ? parsed.ts - prevTs : null
    // 强边界：时间戳大间隔，或块已达目标长度后遇到说话人轮换
    const strongBoundary =
      (gap !== null && gap >= GAP_SECONDS) ||
      (curLen >= CHUNK_TARGET && parsed.speaker !== "" && parsed.speaker !== prevSpeaker)
    if (strongBoundary && curLen >= 120) flush()

    // 单行超长（无换行的整段粘贴）：按句读硬切逐段入块
    for (const piece of splitLongLine(parsed.text)) {
      if (curLen > 0 && curLen + piece.length + 1 > CHUNK_MAX) flush()
      cur.push(piece)
      curLen += piece.length + 1
    }
    if (parsed.ts !== null) prevTs = parsed.ts
    if (parsed.speaker) prevSpeaker = parsed.speaker
  }
  flush()
  return chunks.filter((c) => c.trim().length > 0)
}

// 索引用的采样版：语义分块后若超量，等距采样并保首尾——覆盖整场而非只看开头
export function sampleTranscriptSegments(transcript: string): string[] {
  const segs = chunkTranscriptSemantic(transcript)
  if (segs.length <= MAX_TRANSCRIPT_SEGMENTS) return segs
  const out: string[] = []
  const stride = (segs.length - 1) / (MAX_TRANSCRIPT_SEGMENTS - 1)
  for (let i = 0; i < MAX_TRANSCRIPT_SEGMENTS; i++) {
    out.push(segs[Math.round(i * stride)])
  }
  return out
}

export function buildSegments(m: SemanticSource): string[] {
  const segs = [buildHeadText(m), ...sampleTranscriptSegments(m.transcript)]
  return segs.filter((s) => s.trim().length > 0)
}

// 归一化向量的余弦 = 点积；取会议各段的最大值
export function cosineMax(query: Float32Array, vectors: Float32Array[]): number {
  let best = -1
  for (const v of vectors) {
    let dot = 0
    const n = Math.min(query.length, v.length)
    for (let i = 0; i < n; i++) dot += query[i] * v[i]
    if (dot > best) best = dot
  }
  return best
}
