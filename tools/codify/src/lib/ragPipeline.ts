// RAG 管线（问答主链路）：召回 → 重排 → 上下文构建 → 引用核验。
//
// 「先重排后摘要」的三段式：
// 1. 召回（粗筛，宽口径）：
//    - 向量通道：本地语义索引就绪时走段级检索（semanticSearchSegments，Top-50 段）——
//      段号 segIdx 与主线程 buildSegments 纯函数重建的段文本一一对应（同一分段方案）；
//    - 词面通道：查询词的 CJK bigram / 拉丁词元在「标题/摘要/议题/行动项 + 转写语义块」
//      上的命中密度打分，取前若干场——语义索引未启用时这是唯一通道，管线不断供。
// 2. 重排（精筛）：RRF（Reciprocal Rank Fusion）融合两路排序——只用名次不用原始分，
//    天然免疫「余弦 0.6 和 bigram 命中率 0.4 不可比」的量纲问题；融合后取 Top-5 场会议，
//    每场挑最相关的 ≤2 个转写片段进上下文。
// 3. 生成：只有重排胜出的会议（结构化头部 + 相关片段）进 LLM 上下文——
//    相比旧版「全库直塞 80k 字符」，大档案下 token 消耗降一个数量级，
//    且噪音会议不再稀释注意力（忠实度收益的来源）。
//
// 重排器的诚实说明：这里是**轻量本地重排**（RRF 融合 + 词面密度），不是神经交叉编码器——
// 浏览器内跑 cross-encoder 需要再引入数十 MB 模型资产且每对 query×doc 都要一次前向，
// 与「零费用、离线可用」的产品立场冲突。rerankChunks 是独立纯函数，
// 将来要换交叉编码器 / LLM 精排，替换这一个函数即可，管线其余部分不动。
//
// 引用核验（引用级压缩的机器对账侧）：LLM 被要求给每条结论附「精确支撑句」，
// verifyCitations 把答案里的引文逐条与原文归一化对账（去空白/标点、大小写无关），
// 算出 verbatim 命中率——「引用在原文里存在」由机器核验，不靠人眼扫。

import { getSemanticStatus, semanticSearchSegments } from "@/lib/embeddingClient"
import { buildSegments, chunkTranscriptSemantic } from "@/lib/semanticCore"
import type { Meeting } from "@/lib/store"

// ── 管线参数 ──

const VECTOR_RECALL_TOP = 50 // 向量召回段数（粗筛口径，宁宽勿漏）
const LEXICAL_MEETING_SCAN = 20 // 词面通道做块级扫描的会议数上限（先按头部字段粗排再扫块）
const RERANK_MEETINGS = 5 // 重排后进上下文的会议数
const CHUNKS_PER_MEETING = 2 // 每场会议进上下文的转写片段数
const CHUNK_CONTEXT_CAP = 1600 // 每场会议片段文本的字符预算
const SMALL_ARCHIVE = 5 // ≤ 该场数不做检索筛选：全库直塞（本来就装得下，检索反而可能漏）
const RRF_K = 60 // RRF 平滑常数（经验值：降低头部名次的过度主导）

export interface QaRetrieval {
  /** 进上下文的会议（保持调用方原顺序）；null blocks 时 = 全库直塞口径 */
  selected: Meeting[]
  /** 预构建的上下文块（与 selected 一一对应）；null = 走 buildAskMessages 的默认拼装 */
  blocks: string[] | null
  /** 管线口径说明（进事件日志，用户可审计「答案基于什么选出」） */
  method: string
}

// ── 词法工具 ──

// 查询词元：拉丁/数字词 + CJK 连续段拆 bigram（与 searchCore 的 bigram 通道同思路，
// 这里只做轻量打分不进倒排索引——候选只有几十场，线性扫足够快）
export function lexTokens(query: string): string[] {
  const lower = query.toLowerCase()
  const tokens: string[] = []
  const latin = lower.match(/[a-z0-9]+/g)
  if (latin) tokens.push(...latin)
  for (const run of lower.match(/[一-鿿]+/g) ?? []) {
    if (run.length === 1) tokens.push(run)
    else for (let i = 0; i + 2 <= run.length; i++) tokens.push(run.slice(i, i + 2))
  }
  return [...new Set(tokens)]
}

function lexicalDensity(text: string, tokens: string[]): number {
  if (tokens.length === 0 || !text) return 0
  const lower = text.toLowerCase()
  let hits = 0
  for (const t of tokens) if (lower.includes(t)) hits++
  return hits / tokens.length
}

// 会议头部字段（标题/摘要/议题/行动项/决议）的词面得分——块级扫描前的廉价粗排
function headScore(m: Meeting, tokens: string[]): number {
  const head = [
    m.title,
    m.brief?.content ?? "",
    (m.outline?.topics ?? []).flatMap((t) => [t.topic, ...t.points]).join(" "),
    m.actions.map((a) => `${a.content} ${a.assignee}`).join(" "),
    m.decisions.map((d) => d.content).join(" "),
  ].join("\n")
  // 标题命中权重最高：查询里的词整段出现在标题里几乎必然是「关于这场会」的问题
  return lexicalDensity(head, tokens) * 2 + lexicalDensity(m.title, tokens) * 3
}

// ── RRF 融合 ──

// 多路名次列表融合成单一排序：score(d) = Σ 1/(k + rank_i(d))。
// 只用名次不用分值——两路打分量纲不可比时这是最稳的融合（TREC 验证过的经典做法）。
function rrfFuse(lists: (string[])[], k = RRF_K): Map<string, number> {
  const fused = new Map<string, number>()
  for (const list of lists) {
    list.forEach((key, rank) => {
      fused.set(key, (fused.get(key) ?? 0) + 1 / (k + rank + 1))
    })
  }
  return fused
}

// ── 召回 + 重排主入口 ──

export async function retrieveQaContext(
  question: string,
  meetings: Meeting[],
): Promise<QaRetrieval> {
  if (meetings.length <= SMALL_ARCHIVE) {
    return { selected: meetings, blocks: null, method: `全库直塞（${meetings.length} 场，未做检索筛选）` }
  }
  const tokens = lexTokens(question)

  // ── 通道一：向量段级召回（语义索引就绪时）──
  const segTexts = new Map<string, string[]>() // meetingId → 命中段文本（按相关度降序）
  let vectorRanking: string[] = []
  let vectorUsed = false
  if (getSemanticStatus().state === "ready") {
    const segHits = await semanticSearchSegments(question, VECTOR_RECALL_TOP)
    if (segHits.length > 0) {
      vectorUsed = true
      // 段文本重建：buildSegments 是纯函数，stamp 一致则段号一致（索引与查询两侧同源）；
      // 每场会议只重建一次（内部含转写分块，按命中逐条重算会白扫全文）
      const byId = new Map(meetings.map((m) => [m.id, m]))
      const segCache = new Map<string, string[]>()
      const bestPerMeeting = new Map<string, number>()
      for (const h of segHits) {
        const m = byId.get(h.meetingId)
        if (!m) continue
        let texts = segTexts.get(h.meetingId)
        if (!texts) {
          texts = []
          segTexts.set(h.meetingId, texts)
        }
        if (texts.length < CHUNKS_PER_MEETING + 1) {
          let segs = segCache.get(h.meetingId)
          if (!segs) {
            segs = buildSegments(m)
            segCache.set(h.meetingId, segs)
          }
          const seg = segs[h.segIdx]
          // 头部段（segIdx=0）不进「转写片段」——头部信息本来就会以结构化形式进上下文
          if (seg && h.segIdx > 0 && !texts.some((t) => t === seg)) texts.push(seg)
        }
        const prev = bestPerMeeting.get(h.meetingId) ?? 0
        if (h.score > prev) bestPerMeeting.set(h.meetingId, h.score)
      }
      vectorRanking = [...bestPerMeeting.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
    }
  }

  // ── 通道二：词面召回（永远可用；语义索引未启用时是唯一通道）──
  // 先按头部字段粗排出扫描候选，再对候选做转写语义块的块级打分
  const coarse = meetings
    .map((m) => ({ m, score: headScore(m, tokens) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, LEXICAL_MEETING_SCAN)
  const lexChunks = new Map<string, { text: string; score: number }[]>()
  const lexicalRanking: string[] = []
  for (const { m } of coarse) {
    const chunks = chunkTranscriptSemantic(m.cleaned || m.transcript)
    const scored = chunks
      .map((text) => ({ text, score: lexicalDensity(text, tokens) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
    if (scored.length > 0) {
      lexChunks.set(m.id, scored.slice(0, CHUNKS_PER_MEETING + 1))
      lexicalRanking.push(m.id) // 已按 coarse 得分降序遍历，push 顺序即名次
    } else if (headScore(m, tokens) > 0) {
      lexicalRanking.push(m.id) // 块没命中但头部命中（问「这场会定了什么」类）
    }
  }

  // ── 重排：RRF 融合两路名次 ──
  const fused = rrfFuse([vectorRanking, lexicalRanking].filter((l) => l.length > 0))
  if (fused.size === 0) {
    // 两路都零命中（查询词与档案完全无交集）：退回全库直塞，让 LLM 自己判断「找不到」
    return {
      selected: meetings,
      blocks: null,
      method: `检索零命中，全库直塞（${meetings.length} 场）`,
    }
  }
  const selectedIds = [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, RERANK_MEETINGS)
    .map(([id]) => id)
  const selectedSet = new Set(selectedIds)
  // 上下文顺序保持调用方原顺序（系列问答按时间排列的语义不被重排打乱）
  const selected = meetings.filter((m) => selectedSet.has(m.id))

  // ── 上下文块构建：结构化头部 + 重排胜出的转写片段 ──
  const blocks = selected.map((m) => {
    const parts: string[] = [`《${m.title}》（${m.date}）`]
    if (m.brief?.content) parts.push(`摘要：${m.brief.content}`)
    if (m.outline?.topics.length) {
      parts.push(
        "议题：" + m.outline.topics.map((t) => `${t.topic}（${t.points.join("；")}）`).join("；"),
      )
    }
    if (m.actions.length) {
      parts.push(
        "行动项：" +
          m.actions.map((a) => `${a.content}${a.assignee ? `@${a.assignee}` : ""}`).join("；"),
      )
    }
    if (m.decisions.length) {
      parts.push("决议：" + m.decisions.map((d) => d.content).join("；"))
    }
    // 片段择优：两路通道各自的最佳块，按「与查询的词面密度」统一口径再排一次，
    // 去重（向量段与词面块可能重叠——语义块带重叠尾巴，前缀包含即视为同一内容）
    const pool = [...(segTexts.get(m.id) ?? []).map((text) => ({ text, score: lexicalDensity(text, tokens) })),
      ...(lexChunks.get(m.id) ?? [])]
    const picked: string[] = []
    let budget = CHUNK_CONTEXT_CAP
    for (const c of pool.sort((a, b) => b.score - a.score)) {
      if (picked.length >= CHUNKS_PER_MEETING || budget <= 0) break
      const dup = picked.some(
        (p) => p.startsWith(c.text.slice(0, 60)) || c.text.startsWith(p.slice(0, 60)),
      )
      if (dup) continue
      const clipped = c.text.slice(0, budget)
      picked.push(clipped)
      budget -= clipped.length
    }
    if (picked.length > 0) parts.push(`相关转写片段（检索选出）：\n${picked.join("\n……\n")}`)
    return parts.join("\n")
  })

  const method = [
    vectorUsed ? `向量召回 ${VECTOR_RECALL_TOP} 段` : "语义索引未启用",
    `词面召回 ${lexicalRanking.length} 场`,
    `RRF 重排选 ${selected.length}/${meetings.length} 场`,
  ].join(" + ")
  return { selected, blocks, method }
}

// ── 引用核验（引用级压缩的对账侧）──

// 答案里的引文抽取：「…」 / “…” 两种引号都认，长度 ≥8 才算引用（短词组可能是普通行文）
const QUOTE_RE = /[「“]([^「」“”]{8,120})[」”]/g

export function extractCitedQuotes(answer: string): string[] {
  const out: string[] = []
  for (const m of answer.matchAll(QUOTE_RE)) out.push(m[1])
  return out
}

// 归一化：去全部空白与常见标点、小写化——LLM 摘录时的标点/换行差异不算改写
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s。，、；：？！…—·“”「」『』（）()【《》〉[\].<>]/g, "")
}

// 引用核验：每条引文与「上下文会议」的全部可引文本对账（转写/清洗稿/摘要/议题/行动项/决议），
// 逐字包含即 verified。返回命中率供 UI 展示——弱引用（改写过/编造的）当场现形。
export function verifyCitations(
  answer: string,
  contextMeetings: Meeting[],
): { total: number; verified: number } {
  const quotes = extractCitedQuotes(answer)
  if (quotes.length === 0) return { total: 0, verified: 0 }
  const haystack = normalizeForMatch(
    contextMeetings
      .map((m) =>
        [
          m.cleaned || m.transcript,
          m.transcript,
          m.brief?.content ?? "",
          (m.outline?.topics ?? []).flatMap((t) => [t.topic, ...t.points]).join("\n"),
          m.actions.map((a) => a.content).join("\n"),
          m.decisions.map((d) => d.content).join("\n"),
        ].join("\n"),
      )
      .join("\n"),
  )
  let verified = 0
  for (const q of quotes) {
    if (haystack.includes(normalizeForMatch(q))) verified++
  }
  return { total: quotes.length, verified }
}
