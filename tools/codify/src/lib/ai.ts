// AI 层：摘要 / 行动项决议抽取 / 跨会议问答。
// 走当前生效的 LLM Provider（默认 OpenAI 兼容接口，设置中可换模型）；
// 模型失败时由 Provider 侧返回错误，消费方据此提示用户检查接口 / 模型名。
// 抽取结果强制 source_quote 校验：无原文支撑的结论直接丢弃。

import { listLlmModels, type LlmMessage } from "@/lib/llm"
import { getActiveLlm } from "@/lib/providers"
import { buildAgentSystem } from "@/lib/agents"
import { normalizeUsage, type TokenUsage } from "@/lib/usageLog"
import { segmentTranscript } from "@/lib/clean"
import type { SpeakerSuggestion } from "@/lib/speakers"
import {
  DEFAULT_MODEL,
  MODEL_FALLBACK_CHAIN,
  newId,
  type EntityRef,
  type Meeting,
  type MeetingAction,
  type MeetingDecision,
  type MeetingFact,
  type OutlineTopic,
  type SummaryPersona,
} from "@/lib/store"

export { listLlmModels }
export const LLM_MODEL = DEFAULT_MODEL
const PAGE = "meeting-notes"

const errorMessages: Record<string, string> = {
  timeout: "AI 生成超时（可能服务器繁忙或网络慢），请稍后重试",
  not_found: "请求未能到达 AI，请检查网络后重试",
  rh_login_required: "请先登录 RunningHub 后再生成",
  insufficient_balance: "RunningHub 账户余额不足，请充值后重试",
  network: "网络错误：无法连接你填写的 AI 接口，请检查接口地址、CORS 与网络后重试",
  empty_response: "AI 接口返回了空内容，请确认模型名是否正确（如 gpt-4o-mini）后重试",
}

export function llmErrorMessage(err?: string): string {
  if (!err) return "生成失败，请重试"
  return errorMessages[err] || err
}

// 降级链：首选模型 → 默认模型 → 备选模型（去重保序）
export function modelChain(preferred?: string): string[] {
  const chain = [preferred || DEFAULT_MODEL, DEFAULT_MODEL, ...MODEL_FALLBACK_CHAIN]
  return [...new Set(chain)]
}

// 转写文本上限：1M 上下文足够，但控制在 ~12 万字内兼顾费用与速度
const TRANSCRIPT_CHAR_CAP = 120_000

function clipTranscript(transcript: string): string {
  if (transcript.length <= TRANSCRIPT_CHAR_CAP) return transcript
  return transcript.slice(0, TRANSCRIPT_CHAR_CAP) + "\n……（后文过长已截断）"
}

// 从模型回复里稳健地抠出 JSON 对象（容忍 ```json 围栏与前后废话）
function parseJsonObject(text: string): Record<string, unknown> | null {
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()
  const start = s.indexOf("{")
  const end = s.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(s.slice(start, end + 1))
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// 引用校验：归一化空白与常见标点后做子串匹配；
// 长引用退化为前 24 字匹配，避免模型转写时轻微改写导致误杀。
const STRIP_ALL_RE = /[\s“”"‘’'《》〈〉【】\[\]（）()。，,、；;：:！!？?…—\-–]+/g
const STRIP_ONE_RE = /[\s“”"‘’'《》〈〉【】\[\]（）()。，,、；;：:！!？?…—\-–]/

function normalizeForMatch(s: string): string {
  return s.replace(STRIP_ALL_RE, "")
}

export function quoteSupported(quote: string, transcript: string): boolean {
  const q = normalizeForMatch(quote)
  if (!q) return false
  const t = normalizeForMatch(transcript)
  if (t.includes(q)) return true
  if (q.length > 24) return t.includes(q.slice(0, 24))
  return false
}

// 出处锚点：归一化索引映射——每个归一化后字符记录它在原文中的行号（0-based）与原始字符偏移，
// 引用命中后机器回填精确锚点（行 + 字符区间），UI 点击即选中原文对应片段，不靠肉眼比对。
export interface NormalizedMap {
  text: string
  lines: number[]
  rawOf: number[] // 归一化字符 i 对应的原文字符偏移
}

export function buildNormalizedMap(transcript: string): NormalizedMap {
  let text = ""
  const lines: number[] = []
  const rawOf: number[] = []
  let line = 0
  let offset = 0
  for (const ch of transcript) {
    if (ch === "\n") {
      line++
      offset += ch.length
      continue
    }
    if (STRIP_ONE_RE.test(ch)) {
      offset += ch.length
      continue
    }
    text += ch
    lines.push(line)
    rawOf.push(offset)
    offset += ch.length
  }
  return { text, lines, rawOf }
}

export interface QuoteAnchor {
  line: number // 1-based
  start: number // 原文字符偏移（含）
  end: number // 原文字符偏移（不含）
}

// 返回引用在原文中的精确锚点；找不到（理论上校验通过的都能找到）返回 undefined
export function locateQuote(quote: string, map: NormalizedMap): QuoteAnchor | undefined {
  const q = normalizeForMatch(quote)
  if (!q) return undefined
  let idx = map.text.indexOf(q)
  let len = q.length
  if (idx < 0 && q.length > 24) {
    idx = map.text.indexOf(q.slice(0, 24))
    len = 24
  }
  if (idx < 0) return undefined
  const endIdx = Math.min(idx + len - 1, map.text.length - 1)
  return {
    line: (map.lines[idx] ?? 0) + 1,
    start: map.rawOf[idx] ?? 0,
    end: (map.rawOf[endIdx] ?? 0) + 1,
  }
}

export interface ChainAttempt {
  model: string
  error: string // timeout / not_found / bad_json / …（降级原因记录，供账本聚合）
}

export interface ChainResult<T> {
  data: T
  usedModel: string
  fellBack: boolean // 是否降级到了备选模型（告知用户，不静默）
  durationMs: number // 整条链从第一次尝试到拿到结果的耗时
  attempts: ChainAttempt[] // 失败尝试明细（成功那次不在内）
  tokens?: TokenUsage // 后端回传了用量才有；不回传不猜
}

// 沿降级链依次尝试，直到成功或链耗尽。
// 登录 / 余额错误立即抛出（换模型无意义）；其余错误换下一个模型重试。
// 每次调用产出可观测数据（耗时 / 失败原因 / token 用量），由调用方写入账本；
// 整条链耗尽 / 鉴权失败的调用经 failureRecorder 记一条 ok:false 账本条目——
// 成功率 = 账本里 ok 的占比，失败不记就永远算不出真实成功率。
export interface AiFailureInfo {
  kind: string
  preferred?: string
  failReasons: string[]
  durationMs: number
}

let failureRecorder: ((info: AiFailureInfo) => void) | null = null

export function setAiFailureRecorder(fn: ((info: AiFailureInfo) => void) | null): void {
  failureRecorder = fn
}

function chainFail(
  kind: string,
  preferred: string | undefined,
  reasons: string[],
  startedAt: number,
): never {
  failureRecorder?.({ kind, preferred, failReasons: reasons, durationMs: Date.now() - startedAt })
  throw new Error(reasons[reasons.length - 1] ?? "timeout")
}

async function callWithChain<T>(
  kind: string,
  messages: LlmMessage[],
  preferred: string | undefined,
  parse: (text: string) => T | null,
): Promise<ChainResult<T>> {
  const chain = modelChain(preferred)
  const attempts: ChainAttempt[] = []
  const startedAt = Date.now()
  // 调用点统一走 Provider 注册表：当前生效的 LLM 实现（平台环境为 RunningHub 授权计费通道）
  const llm = getActiveLlm()
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i]
    const r = await llm.chat(model, messages, PAGE)
    if (r.needsLogin || r.error === "rh_login_required") chainFail(kind, preferred, ["rh_login_required"], startedAt)
    if (r.error === "insufficient_balance") chainFail(kind, preferred, ["insufficient_balance"], startedAt)
    if (r.ok && r.status === "success") {
      const data = parse(r.text)
      if (data !== null) {
        const tokens = normalizeUsage(r.usage)
        return {
          data,
          usedModel: model,
          fellBack: i > 0,
          durationMs: Date.now() - startedAt,
          attempts,
          ...(tokens ? { tokens } : {}),
        }
      }
      attempts.push({ model, error: "bad_json" })
    } else {
      attempts.push({ model, error: r.error || "timeout" })
    }
  }
  chainFail(kind, preferred, attempts.map((a) => a.error), startedAt)
}

export interface SummaryResult {
  brief: string
  topics: OutlineTopic[]
}

// 读者视角指令（SCOPE）：内容选择前先明确「这份摘要写给谁」，据此调整信息权重。
// neutral 不加指令，保持均衡记录。
const PERSONA_DIRECTIVES: Record<Exclude<SummaryPersona, "neutral">, string> = {
  owner:
    "\n读者视角：这份摘要写给执行负责人本人。要点优先呈现「分配给我的任务、我做出的承诺、我需要盯的截止日与依赖」，其次才是团队层面的决定；与我不直接相关的背景讨论可以压缩。",
  observer:
    "\n读者视角：这份摘要写给未参会的旁观者。要点优先呈现「会议决定了什么、为什么这样决定、有哪些结论与风险」，让没在场的人能快速跟上；执行层的琐碎细节可以压缩。",
}

function personaDirective(persona?: SummaryPersona): string {
  return persona && persona !== "neutral" ? PERSONA_DIRECTIVES[persona] : ""
}

// 分层摘要：brief（一句话）+ outline（分议题要点）。detailed 层直接用带时间戳原文，不调模型。
// guidance 为会议模板的「组织视角」提示语（用户在模板里可改可加，见 store.ts 的 MeetingTemplate），
// 为空则按会议实际讨论顺序组织。
// extra.userNotes：用户的会中随手记——归纳时优先呼应（保留人的主动性，AI 对齐增强而非替代）；
// extra.seriesContext：同系列历史会议概况——只用于理解延续性，结论必须以本场转写为准；
// extra.agentPrompt：摘要 Agent 的用户附加指令（设置页可调，注入 system prompt）。
// 长文本议题分段走「规则 + LLM 混合」：规则层先按停顿空行 / 说话人切换 / 时间戳跳跃粗切成
// 带编号的候选段，LLM 只判断「每段属于哪个议题」，不从全文自己找边界——更稳、更好排查。
export async function generateSummary(
  title: string,
  date: string,
  transcript: string,
  model?: string,
  guidance?: string,
  extra?: {
    userNotes?: string
    seriesContext?: string
    agentPrompt?: string
    persona?: SummaryPersona
  },
): Promise<ChainResult<SummaryResult>> {
  const clipped = clipTranscript(transcript)
  const segments = segmentTranscript(clipped)
  const useSegments = segments.length > 1
  const kindLine = guidance && guidance.trim() ? `\n会议类型提示：${guidance.trim()}。` : ""
  const personaLine = personaDirective(extra?.persona)
  const notesBlock = extra?.userNotes
    ? `\n\n用户会中随手记（用户亲自标记的重点，归纳议题与要点时优先呼应、把它们落进对应议题；随手记与转写冲突时以转写为准，禁止只凭随手记编造转写里没有的内容）：\n${extra.userNotes}`
    : ""
  const ctxBlock = extra?.seriesContext
    ? `\n\n同系列历史会议背景（仅用于理解延续性，可在要点措辞里呼应与往期的衔接；本场结论必须全部以本场转写为准）：\n${extra.seriesContext}`
    : ""

  const userContent = useSegments
    ? `会议标题：${title}\n会议日期：${date}${kindLine}${personaLine}${ctxBlock}${notesBlock}\n\n转写原文已按规则预切分为 ${segments.length} 个候选段（以【段N】标记）。请判断每段所属议题，归并后生成两层摘要，返回 JSON：\n{\n  "brief": "一句话概括这场会议（50 字以内，必须有信息量，禁止空话）",\n  "outline": [\n    { "topic": "议题名称", "segment_ids": [该议题覆盖的段编号], "points": ["该议题下的关键讨论点或结论", "..."] }\n  ]\n}\n要求：把候选段归并为 2-6 个议题，讨论同一件事的相邻段合并进同一议题；每个议题 2-5 个要点；要点保留原文中的具体数字、名称、时间；只依据给定段落内容，禁止编造。\n\n${segments.map((s) => `【段${s.id}】\n${s.text}`).join("\n\n")}`
    : `会议标题：${title}\n会议日期：${date}${kindLine}${personaLine}${ctxBlock}${notesBlock}\n\n转写原文：\n${clipped}\n\n请生成两层摘要，返回 JSON：\n{\n  "brief": "一句话概括这场会议（50 字以内，必须有信息量，禁止空话）",\n  "outline": [\n    { "topic": "议题名称", "points": ["该议题下的关键讨论点或结论", "..."] }\n  ]\n}\n要求：outline 按会议实际讨论顺序分 2-6 个议题；每个议题 2-5 个要点；要点保留原文中的具体数字、名称、时间。`

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "summary",
        "你是严谨的会议纪要助手。只依据用户提供的转写原文进行归纳，禁止编造原文中不存在的信息。输出必须是合法 JSON，不要输出 JSON 以外的任何文字。",
        extra?.agentPrompt,
      ),
    },
    { role: "user", content: userContent },
  ]
  return callWithChain("summary", messages, model, (text) => {
    const obj = parseJsonObject(text)
    if (!obj) return null
    const brief = typeof obj.brief === "string" ? obj.brief.trim() : ""
    const rawOutline = Array.isArray(obj.outline) ? obj.outline : []
    const topics: OutlineTopic[] = rawOutline
      .map((t) => {
        const item = t as Record<string, unknown>
        const topic = typeof item.topic === "string" ? item.topic.trim() : ""
        const points = Array.isArray(item.points)
          ? item.points.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim())
          : []
        return { topic: topic || "议题", points }
      })
      .filter((t) => t.points.length > 0)
    if (!brief && topics.length === 0) return null
    return { brief, topics }
  })
}

// ── FRAME 管线：事实提取 → 主题聚类 → 分层生成 ──
// 摘要不直接「读全文写总结」，而是先把转写分解成原子事实（每条独立、带原文支撑句），
// 再按语义把事实聚类成议题，最后只从每簇事实组织该议题的要点。
// 每一步机器可校验：事实必须过 source_quote 校验（无原文支撑直接丢弃），
// 议题要点只允许引用给定的事实编号——杜绝跨议题「串台」与凭空编造。
// 中间产物（事实列表）随会议保存，本身可独立查阅。

export interface FactExtraction {
  facts: MeetingFact[]
  discarded: number // 无原文支撑 / 校验失败被丢弃的条数
}

const FACT_CAP = 160 // 单场会事实上限（超出按显著度截断，控组织阶段上下文）

// 阶段一：提取显著事实。输入是规则粗分段后的候选段（带【段N】编号），
// 模型只从给定段落里抽原子陈述 + 逐字摘录支撑句；本地按 quoteSupported 逐条核验。
export async function extractFacts(
  title: string,
  transcript: string,
  model?: string,
  opts?: { agentPrompt?: string },
): Promise<ChainResult<FactExtraction>> {
  const clipped = clipTranscript(transcript)
  const segments = segmentTranscript(clipped)
  const segBlock =
    segments.length > 1
      ? segments.map((s) => `【段${s.id}】\n${s.text}`).join("\n\n")
      : `【段1】\n${clipped}`

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "extract",
        "你是会议事实提取器。把转写分解为「原子事实」：每条只陈述一件独立可核验的事（决定、承诺、数字、时间、结论、分歧），保留具体名称与数值，不用代词指代关键实体。每条必须附 source_quote（从原文逐字摘录的支撑句）。只提取原文真实出现的内容，禁止推断、禁止合并两件事、禁止输出评论。寒暄、口头禅、重复发言不是事实。输出必须是合法 JSON，不要输出 JSON 以外的任何文字。",
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `会议标题：${title}\n\n转写原文（已按规则预切分为候选段，以【段N】标记）：\n${segBlock}\n\n请提取显著事实，返回 JSON：\n{\n  "facts": [\n    { "statement": "一句话原子事实（含具体数字/名称/时间）", "speaker": "说出这条事实的人（原文没标就留空字符串）", "seg_id": 所属段编号数字, "source_quote": "原文支撑句（逐字摘录）", "salience": 0.0到1.0 }\n  ]\n}\n要求：salience 表示这条事实对纪要的重要性（关键决定/承诺给高分，背景细节给低分）；最多 ${FACT_CAP} 条，按 salience 降序；没有值得记录的事实就返回空数组。`,
    },
  ]

  return callWithChain("facts", messages, model, (text) => {
    const obj = parseJsonObject(text)
    if (!obj) return null
    const raw = Array.isArray(obj.facts) ? obj.facts : []
    const facts: MeetingFact[] = []
    const seen = new Set<string>()
    let discarded = 0
    for (const f of raw) {
      const item = f as Record<string, unknown>
      const statement = typeof item.statement === "string" ? item.statement.trim().slice(0, 160) : ""
      const quote = typeof item.source_quote === "string" ? item.source_quote.trim() : ""
      const segId = typeof item.seg_id === "number" ? item.seg_id : Number(item.seg_id)
      const salience =
        typeof item.salience === "number" ? Math.min(1, Math.max(0, item.salience)) : 0.5
      // 机器校验：陈述非空、段编号合法、支撑句能在原文命中；不满足直接丢弃
      if (!statement || !Number.isInteger(segId) || segId < 1 || segId > segments.length) {
        discarded++
        continue
      }
      if (!quoteSupported(quote, clipped)) {
        discarded++
        continue
      }
      const key = normalizeForMatch(statement).slice(0, 40)
      if (seen.has(key)) {
        discarded++
        continue
      }
      seen.add(key)
      facts.push({
        id: `f${facts.length + 1}`,
        statement,
        speaker: typeof item.speaker === "string" ? item.speaker.trim().slice(0, 12) : "",
        segId,
        sourceQuote: quote.slice(0, 200),
        salience: Math.round(salience * 100) / 100,
      })
      if (facts.length >= FACT_CAP) break
    }
    facts.sort((a, b) => b.salience - a.salience)
    // 空数组是合法结果（这场会确实没有可记录的事实）——但要和「解析失败」区分开
    return { facts, discarded }
  })
}

// 阶段二 + 三：把已核验的事实聚类成议题并组织摘要。
// 模型只见到事实清单（不见全文），每个议题必须列出引用的事实编号；
// 本地校验编号真实存在，要点数量与议题数量收敛到既有口径（2-6 议题、每议题 2-5 要点）。
export async function composeSummaryFromFacts(
  title: string,
  date: string,
  facts: MeetingFact[],
  model?: string,
  guidance?: string,
  extra?: {
    userNotes?: string
    seriesContext?: string
    agentPrompt?: string
    persona?: SummaryPersona
  },
): Promise<ChainResult<SummaryResult>> {
  const kindLine = guidance && guidance.trim() ? `\n会议类型提示：${guidance.trim()}。` : ""
  const personaLine = personaDirective(extra?.persona)
  const notesBlock = extra?.userNotes
    ? `\n\n用户会中随手记（用户亲自标记的重点，组织议题时优先呼应；与事实冲突时以事实为准）：\n${extra.userNotes}`
    : ""
  const ctxBlock = extra?.seriesContext
    ? `\n\n同系列历史会议背景（仅用于理解延续性；本场结论必须全部以给定事实为准）：\n${extra.seriesContext}`
    : ""
  const factBlock = facts
    .map(
      (f) =>
        `${f.id}. ${f.statement}${f.speaker ? `（${f.speaker}）` : ""}［显著度 ${f.salience}｜段 ${f.segId}］`,
    )
    .join("\n")

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "summary",
        "你是会议纪要组织器。输入是从转写中提取并已核验的原子事实清单，任务：按语义把事实聚类成议题，再为每个议题组织要点。铁律：每个要点只能来自其议题引用的事实，禁止引入清单外的任何信息，禁止编造；每个议题必须列出 fact_ids（引用的事实编号）；同一事实原则上只归入一个议题。输出必须是合法 JSON，不要输出 JSON 以外的任何文字。",
        extra?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `会议标题：${title}\n会议日期：${date}${kindLine}${personaLine}${ctxBlock}${notesBlock}\n\n已核验的事实清单：\n${factBlock}\n\n请把事实聚类成议题并生成两层摘要，返回 JSON：\n{\n  "brief": "一句话概括这场会议（50 字以内，必须有信息量，禁止空话）",\n  "outline": [\n    { "topic": "议题名称", "fact_ids": ["该议题引用的事实编号"], "points": ["该议题下的要点", "..."] }\n  ]\n}\n要求：聚类成 2-6 个议题，语义相近的事实归入同一议题，议题按会议实际讨论顺序排列；每个议题 2-5 个要点；要点保留事实中的具体数字、名称、时间。`,
    },
  ]

  const validIds = new Set(facts.map((f) => f.id))
  return callWithChain("summary", messages, model, (text) => {
    const obj = parseJsonObject(text)
    if (!obj) return null
    const brief = typeof obj.brief === "string" ? obj.brief.trim() : ""
    const rawOutline = Array.isArray(obj.outline) ? obj.outline : []
    const topics: OutlineTopic[] = rawOutline
      .map((t) => {
        const item = t as Record<string, unknown>
        const topic = typeof item.topic === "string" ? item.topic.trim() : ""
        const points = Array.isArray(item.points)
          ? item.points
              .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
              .map((p) => p.trim())
              .slice(0, 5)
          : []
        // 事实编号机器校验：只保留清单里真实存在的引用
        const factIds = Array.isArray(item.fact_ids)
          ? [
              ...new Set(
                item.fact_ids
                  .filter((x): x is string => typeof x === "string" && validIds.has(x.trim()))
                  .map((x) => x.trim()),
              ),
            ]
          : []
        return { topic: topic || "议题", points, ...(factIds.length > 0 ? { factIds } : {}) }
      })
      .filter((t) => t.points.length > 0)
      .slice(0, 6)
    if (!brief && topics.length === 0) return null
    return { brief, topics }
  })
}

// ── 双模型交叉审查 ──
// 第二个模型（降级链里与生成模型不同的那个；链太短则同模型换审查角色提示词）
// 对照转写原文审查摘要稿，把问题分类为：结构性（组织混乱）/ 遗漏（关键信息缺失）/
// 无关（掺了原文没有或不相干的内容）/ 事实性（与原文矛盾），每条给出可操作的修正建议，
// 并附上一份修正稿。审查结果只是建议——用户在纪要页看到问题清单后决定是否采纳，绝不自动覆盖。

export type ReviewIssueType = "structure" | "omission" | "irrelevant" | "factual"

export interface ReviewIssue {
  type: ReviewIssueType
  detail: string // 问题描述（指向摘要里的具体内容）
  fix: string // 可操作的修正建议
}

export interface SummaryReview {
  issues: ReviewIssue[]
  revised: SummaryResult | null // 修正稿（模型认为无需修正时为 null）
  reviewerModel: string
}

// 审查模型选择：优先降级链里与生成模型不同的第一个模型（真正的「第二意见」）；
// 链里只有一个模型时退回同模型（靠审查角色提示词区分视角，如实标注）
export function pickReviewerModel(generatorModel: string, preferred?: string): string {
  const chain = modelChain(preferred)
  return chain.find((m) => m !== generatorModel) ?? chain[0]
}

export async function reviewSummary(
  title: string,
  transcript: string,
  draft: SummaryResult,
  reviewerModel: string,
  opts?: { agentPrompt?: string },
): Promise<ChainResult<SummaryReview>> {
  const draftBlock = [
    `一句话摘要：${draft.brief || "（无）"}`,
    ...draft.topics.map(
      (t, i) => `${i + 1}. ${t.topic}\n${t.points.map((p) => `   - ${p}`).join("\n")}`,
    ),
  ].join("\n")

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "summary",
        "你是严格的会议纪要审查器。对照转写原文审查另一份摘要稿，找出四类问题：structure（议题组织混乱、归类不当）、omission（原文中的关键决定/承诺/数字被漏掉）、irrelevant（摘要里有原文不存在或不相干的内容）、factual（摘要与原文明确矛盾）。每条问题必须指明摘要里的具体位置并给出可操作的修正建议；摘要整体合格就返回空 issues，不要为了凑数硬挑刺。然后给出修正稿（无问题时为 null）。只依据给定原文，禁止编造。输出必须是合法 JSON，不要输出 JSON 以外的任何文字。",
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `会议标题：${title}\n\n转写原文：\n${clipTranscript(transcript)}\n\n待审查的摘要稿：\n${draftBlock}\n\n请审查并返回 JSON：\n{\n  "issues": [\n    { "type": "structure|omission|irrelevant|factual", "detail": "问题描述（指明摘要里的具体内容，60 字内）", "fix": "修正建议（40 字内）" }\n  ],\n  "revised": {\n    "brief": "修正后的一句话摘要",\n    "outline": [ { "topic": "议题名称", "points": ["要点"] } ]\n  }\n}\n要求：issues 最多 8 条，按严重程度降序；摘要无需修正时 issues 返回空数组、revised 返回 null。`,
    },
  ]

  return callWithChain("review", messages, reviewerModel, (text) => {
    const obj = parseJsonObject(text)
    if (!obj) return null
    const validTypes = new Set<ReviewIssueType>(["structure", "omission", "irrelevant", "factual"])
    const rawIssues = Array.isArray(obj.issues) ? obj.issues : []
    const issues: ReviewIssue[] = []
    for (const it of rawIssues) {
      const item = it as Record<string, unknown>
      const rawType = typeof item.type === "string" ? item.type : ""
      const detail = typeof item.detail === "string" ? item.detail.trim().slice(0, 120) : ""
      const fix = typeof item.fix === "string" ? item.fix.trim().slice(0, 80) : ""
      const type = validTypes.has(rawType as ReviewIssueType) ? (rawType as ReviewIssueType) : null
      if (!type || !detail) continue
      issues.push({ type, detail, fix })
      if (issues.length >= 8) break
    }
    let revised: SummaryResult | null = null
    const r = obj.revised as Record<string, unknown> | null
    if (r && typeof r === "object") {
      const brief = typeof r.brief === "string" ? r.brief.trim() : ""
      const rawOutline = Array.isArray(r.outline) ? r.outline : []
      const topics: OutlineTopic[] = rawOutline
        .map((t) => {
          const item = t as Record<string, unknown>
          const topic = typeof item.topic === "string" ? item.topic.trim() : ""
          const points = Array.isArray(item.points)
            ? item.points
                .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
                .map((p) => p.trim())
                .slice(0, 5)
            : []
          return { topic: topic || "议题", points }
        })
        .filter((t) => t.points.length > 0)
        .slice(0, 6)
      if (brief || topics.length > 0) revised = { brief, topics }
    }
    // 既没问题也没修正稿 = 解析出了空壳，视为失败让链重试
    if (issues.length === 0 && revised === null && rawIssues.length === 0 && obj.revised === undefined) {
      return null
    }
    return { issues, revised, reviewerModel }
  }).then((res) => ({ ...res, data: { ...res.data, reviewerModel: res.usedModel } }))
}

export interface ExtractResult {
  actions: MeetingAction[]
  decisions: MeetingDecision[]
  // Human-in-the-Loop：置信度落在 [minConfidence, reviewThreshold) 的行动项不直接生效，
  // 扣进「待人工确认」队列由用户拍板——Agent 拿不准时主动暂停请求确认，而不是幻觉硬写
  pending: MeetingAction[]
  discarded: number
}

// 行动项 + 决议抽取，每条必须带 source_quote，无原文支撑直接丢弃；
// 置信度分流：< minConfidence 丢弃、[minConfidence, reviewThreshold) 进待确认队列、≥ reviewThreshold 直接采纳。
// 保留下来的条目带上 confidence 供 UI 标注。
// transcript 传清洗稿（LLM 看清洗稿），rawTranscript 传用户原文——出处锚点定位回原文，
// 因为界面展示的是原文；清洗不改行数，行号锚点在两边一致。
export async function extractItems(
  title: string,
  transcript: string,
  opts?: {
    model?: string
    minConfidence?: number
    reviewThreshold?: number
    rawTranscript?: string
    agentPrompt?: string
  },
): Promise<ChainResult<ExtractResult>> {
  const minConfidence = opts?.minConfidence ?? 0.4
  const reviewThreshold = opts?.reviewThreshold ?? 0
  const raw = opts?.rawTranscript ?? transcript
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "extract",
        "你是严谨的会议行动项抽取器。只依据转写原文抽取，每条结论必须附 source_quote（从原文中逐字摘录的支撑句）。找不到原文支撑的条目宁可不输出。把握不足的条目如实给低 confidence，交人工复核，不要为了凑数硬给高分。输出必须是合法 JSON，不要输出 JSON 以外的任何文字。",
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `会议标题：${title}\n\n转写原文：\n${clipTranscript(transcript)}\n\n请抽取行动项和决议，返回 JSON：\n{\n  "actions": [\n    { "content": "要做的事（动词开头，一句话）", "assignee": "负责人姓名，原文没提就留空字符串", "due_date": "YYYY-MM-DD，原文没提就留空字符串", "source_quote": "原文支撑句（逐字摘录）", "confidence": 0.0到1.0 }\n  ],\n  "decisions": [\n    { "content": "达成的决定（一句话）", "source_quote": "原文支撑句（逐字摘录）" }\n  ]\n}\n要求：只抽真实存在的承诺与决定，不要把一般性讨论当行动项；没有就返回空数组。`,
    },
  ]
  return callWithChain("extract", messages, opts?.model, (text) => {
    const obj = parseJsonObject(text)
    if (!obj) return null
    const rawActions = Array.isArray(obj.actions) ? obj.actions : []
    const rawDecisions = Array.isArray(obj.decisions) ? obj.decisions : []
    const actions: MeetingAction[] = []
    const pending: MeetingAction[] = []
    const decisions: MeetingDecision[] = []
    let discarded = 0
    // 锚点优先定位回用户原文（字符级）；清洗稿上找到的引用若原文没有（清洗改写过），
    // 降级用清洗稿定位取行号（行数一致，行号仍指回原文正确行）——不放弃可追溯性。
    const rawMap = buildNormalizedMap(raw)
    const cleanMap = raw !== transcript ? buildNormalizedMap(transcript) : null

    const anchorFor = (quote: string): { line: number; start?: number; end?: number } | null => {
      const inRaw = locateQuote(quote, rawMap)
      if (inRaw) return inRaw
      if (cleanMap) {
        const inClean = locateQuote(quote, cleanMap)
        if (inClean) return { line: inClean.line }
      }
      return null
    }

    for (const a of rawActions) {
      const item = a as Record<string, unknown>
      const content = typeof item.content === "string" ? item.content.trim() : ""
      const quote = typeof item.source_quote === "string" ? item.source_quote.trim() : ""
      if (!content || !quoteSupported(quote, transcript)) {
        discarded++
        continue
      }
      const conf = typeof item.confidence === "number" ? item.confidence : undefined
      if (conf !== undefined && conf < minConfidence) {
        discarded++
        continue
      }
      const anchor = anchorFor(quote)
      const action: MeetingAction = {
        id: newId(),
        content,
        assignee: typeof item.assignee === "string" ? item.assignee.trim() : "",
        dueDate: typeof item.due_date === "string" ? item.due_date.trim() : "",
        status: "open",
        sourceQuote: quote,
        editedByUser: false,
        createdAt: Date.now(),
        ...(conf !== undefined ? { confidence: Math.round(conf * 100) / 100 } : {}),
        ...(anchor ? { sourceLine: anchor.line } : {}),
        ...(anchor?.start !== undefined && anchor.end !== undefined
          ? { sourceStart: anchor.start, sourceEnd: anchor.end }
          : {}),
      }
      // 置信度不足以直接生效、又没低到该丢弃 → 扣进待确认队列（Agent 主动请人拍板）
      if (conf !== undefined && reviewThreshold > minConfidence && conf < reviewThreshold) {
        pending.push(action)
      } else {
        actions.push(action)
      }
    }

    for (const d of rawDecisions) {
      const item = d as Record<string, unknown>
      const content = typeof item.content === "string" ? item.content.trim() : ""
      const quote = typeof item.source_quote === "string" ? item.source_quote.trim() : ""
      if (!content || !quoteSupported(quote, transcript)) {
        discarded++
        continue
      }
      const anchor = anchorFor(quote)
      decisions.push({
        id: newId(),
        content,
        sourceQuote: quote,
        editedByUser: false,
        ...(anchor ? { sourceLine: anchor.line } : {}),
        ...(anchor?.start !== undefined && anchor.end !== undefined
          ? { sourceStart: anchor.start, sourceEnd: anchor.end }
          : {}),
      })
    }

    return { actions, decisions, pending, discarded }
  })
}

// ── 锚点对账的扩展：引用支撑强度审查（LLM judge）──
// source_quote 机器校验解决的是「引用存在」，但「引用存在」≠「引用支撑结论」——
// 模型可能给行动项挂一句真实存在却撑不起结论的原文。这一步让第二个判定角色
// 逐条给「强支撑 / 弱支撑 / 无支撑」三级评分：弱/无支撑的条目在 UI 上醒目标注，
// 提示用户优先核对。判定结果只是标注，不自动删改任何条目。
export type SupportLevel = "strong" | "weak" | "none"

export interface SupportVerdict {
  ref: number // items 里的编号（0-based），机器校验用
  level: SupportLevel
  reason: string // 判定理由（≤40 字）
}

const SUPPORT_ITEM_CAP = 50 // 单次审查条数上限（控上下文与费用）

export async function judgeSupportStrength(
  title: string,
  transcript: string,
  items: { content: string; sourceQuote: string }[],
  model?: string,
  opts?: { agentPrompt?: string },
): Promise<ChainResult<SupportVerdict[]>> {
  const capped = items.slice(0, SUPPORT_ITEM_CAP)
  const numbered = capped
    .map((it, i) => `${i}. 结论：${it.content}\n   引用：「${it.sourceQuote}」`)
    .join("\n")
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "extract",
        "你是引用支撑强度审查器。对每条会议结论，判断它附带的原文引用（source_quote）是否在语义上真正支撑该结论——「引用在原文里存在」不等于「引用支撑结论」。三级判定：strong = 引用直接陈述了同一件事，结论中的动作与关键要素（负责人/时间/对象）都能在引用或其紧邻上下文中找到依据；weak = 引用只是话题相关、部分要素缺失，或结论添加了引用中没有的信息；none = 引用与结论无关、或语义相反。宁可判 weak 不要虚给 strong。只依据给定原文判定，禁止编造。输出必须是合法 JSON，不要输出 JSON 以外的任何文字。",
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `会议标题：${title}\n\n转写原文：\n${clipTranscript(transcript)}\n\n待审查的结论与引用（编号清单）：\n${numbered}\n\n返回 JSON：\n{\n  "results": [\n    { "ref": 编号数字, "level": "strong|weak|none", "reason": "判定理由（30 字内，指出缺失或矛盾的要素）" }\n  ]\n}\n要求：对清单里每一条都给出判定，一条不漏；reason 要具体（如「引用只谈背景，未提负责人」），不要空话。`,
    },
  ]
  return callWithChain("support", messages, model, (text) => {
    const obj = parseJsonObject(text)
    if (!obj) return null
    const raw = Array.isArray(obj.results) ? obj.results : []
    const validLevels = new Set<SupportLevel>(["strong", "weak", "none"])
    const seen = new Set<number>()
    const out: SupportVerdict[] = []
    for (const r of raw) {
      const item = r as Record<string, unknown>
      const ref = typeof item.ref === "number" ? item.ref : Number(item.ref)
      const level = typeof item.level === "string" ? item.level : ""
      // 机器校验：编号必须在清单内、等级必须在枚举内、同一编号只认第一条
      if (!Number.isInteger(ref) || ref < 0 || ref >= capped.length || seen.has(ref)) continue
      if (!validLevels.has(level as SupportLevel)) continue
      seen.add(ref)
      out.push({
        ref,
        level: level as SupportLevel,
        reason: typeof item.reason === "string" ? item.reason.trim().slice(0, 40) : "",
      })
    }
    // 一条都没校验通过 = 解析出了空壳，视为失败让链重试
    return out.length > 0 ? out : null
  })
}

// 跨会议问答：把会议资料拼成上下文，答案必须标注来源会议。
// 两种上下文来源：
// - opts.contextBlocks（RAG 管线）：召回→重排后胜出的会议块（结构化头部 + 相关转写片段），
//   大档案下只带真正相关的会议进上下文（见 ragPipeline.ts）；
// - 缺省（小档案全库直塞）：所有会议的摘要 + 转写节选，80k 字符预算内按序拼装。
// scopeLabel 非空 = 系列内问答：会议按时间升序给出，并明确要求沿时间线回答演进类问题。
// 消息构造独立成函数：poll-first 与流式两条路径共用同一份提示词，口径一致。
function buildAskMessages(
  question: string,
  meetings: Meeting[],
  opts?: {
    scopeLabel?: string
    agentPrompt?: string
    contextBlocks?: string[] | null
  },
): LlmMessage[] {
  const scoped = Boolean(opts?.scopeLabel)
  let blocks: string[]
  if (opts?.contextBlocks && opts.contextBlocks.length > 0) {
    blocks = opts.contextBlocks
  } else {
    const ordered = scoped
      ? [...meetings].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
      : meetings
    blocks = []
    let budget = 80_000
    for (const m of ordered) {
      if (budget <= 0) break
      // 实时转写的会议带绝对时间锚点：行内时间戳只是录音相对时间，跨会议检索靠它定位「几点开的会」
      const recAt = m.recStartedAt
        ? ` · 录音始于 ${new Date(m.recStartedAt).toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : ""
      const parts: string[] = [`《${m.title}》（${m.date}${recAt}）`]
      if (m.brief?.content) parts.push(`摘要：${m.brief.content}`)
      if (m.outline?.topics.length) {
        parts.push(
          "议题：" + m.outline.topics.map((t) => `${t.topic}（${t.points.join("；")}）`).join("；"),
        )
      }
      if (m.actions.length) {
        parts.push("行动项：" + m.actions.map((a) => `${a.content}${a.assignee ? `@${a.assignee}` : ""}`).join("；"))
      }
      const transcriptClip = (m.cleaned || m.transcript).slice(0, Math.max(0, Math.min(6000, budget)))
      if (transcriptClip.trim()) parts.push(`转写节选：\n${transcriptClip}`)
      const block = parts.join("\n")
      blocks.push(block)
      budget -= block.length
    }
  }

  // 引用级压缩契约：结论逐条附「最短支撑句」——机器会对账引文是否逐字存在于资料
  //（ragPipeline.verifyCitations），改写过的引文会被标记，所以必须原文摘录
  const citationRule =
    "引用要求（重要）：答案里每条关键结论后面紧跟它的支撑依据，格式：（依据：「原文支撑句」《会议标题》）。" +
    "「」里必须是资料中逐字存在的那一句话——只摘支撑该结论的最短句子（不超过 60 字），" +
    "禁止整段照抄转写，禁止改写、拼接或补全引文；来自摘要/行动项/决议等结构化资料的结论，引文摘自对应字段原文。" +
    "资料里找不到支撑的推测不要写。"

  return [
    {
      role: "system",
      content: buildAgentSystem(
        "retrieve",
        scoped
          ? `你是项目系列会议的问答助手。资料是同一系列（项目/例会）的历次会议，已按时间升序排列。回答演进类问题时沿时间线组织（何时提出、如何变化、当前状态），只依据提供的资料，资料里没有答案就直说找不到，禁止编造。${citationRule}用简洁中文回答。`
          : `你是个人会议档案问答助手。只依据提供的会议资料回答，资料里没有答案就直说找不到，禁止编造。${citationRule}用简洁中文回答。`,
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: scoped
        ? `以下是「${opts?.scopeLabel}」系列的全部会议资料（按时间先后排列）：\n\n${blocks.join("\n\n---\n\n")}\n\n问题：${question}`
        : `以下是与问题最相关的会议资料：\n\n${blocks.join("\n\n---\n\n")}\n\n问题：${question}`,
    },
  ]
}

export async function askAcrossMeetings(
  question: string,
  meetings: Meeting[],
  model?: string,
  opts?: { scopeLabel?: string; agentPrompt?: string; contextBlocks?: string[] | null },
): Promise<ChainResult<string>> {
  const messages = buildAskMessages(question, meetings, opts)
  return callWithChain("ask", messages, model, (text) => {
    const answer = (text || "").trim()
    return answer ? answer : null
  })
}

// ── 流式问答（渲染层「薄」的另一半）──
// 当前生效的 LLM Provider 支持 chatStream 时逐块透传（增量解析器从断点续parse，块完成即挂载）；
// 不支持（平台 poll-first 通道）时整段一次 yield——上层渲染口径完全一致，只是没有逐字效果。
export function llmSupportsStream(): boolean {
  return typeof getActiveLlm().chatStream === "function"
}

export async function* askAcrossMeetingsStream(
  question: string,
  meetings: Meeting[],
  model?: string,
  opts?: { scopeLabel?: string; agentPrompt?: string; contextBlocks?: string[] | null },
): AsyncGenerator<string> {
  const llm = getActiveLlm()
  if (llm.chatStream) {
    const messages = buildAskMessages(question, meetings, opts)
    for await (const piece of llm.chatStream(model || DEFAULT_MODEL, messages, PAGE)) {
      if (piece) yield piece
    }
    return
  }
  const res = await askAcrossMeetings(question, meetings, model, opts)
  yield res.data
}

// 转写整理：只补标点、修明显错别字、按话题分段，严禁增删改写实质内容；
// 时间戳与说话人标记原样保留。供实时转写后的粗稿一键整理成可读文本。
// opts.hotwords：历史会议积累的专有名词词表（人名/项目/产品）——浏览器识别引擎没有
// 热词注入口，同音错别字在整理阶段按词表校正，等效于「事后热词偏置」。
export async function polishTranscript(
  transcript: string,
  model?: string,
  opts?: { agentPrompt?: string; hotwords?: string[] },
): Promise<ChainResult<string>> {
  const glossary =
    opts?.hotwords && opts.hotwords.length > 0
      ? `\n专有名词词表（来自历史会议，修正同音错别字时优先采用这些写法；词表外的内容照常只修明显错别字）：${opts.hotwords.join("、")}`
      : ""
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "annotate",
        `你是会议转写整理器。任务：给转写文本补全标点、修正明显的同音错别字、按话题变化分段（段与段之间空一行）。铁律：严禁增删或改写任何实质内容，严禁编造，严禁总结或润色措辞；每行开头的时间戳（如 [03:25]）和说话人标记（如 老王：）必须原样保留。直接输出整理后的全文，不要输出任何解释、前言或代码围栏。${glossary}`,
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `请整理以下会议转写文本：\n\n${clipTranscript(transcript)}`,
    },
  ]
  return callWithChain("polish", messages, model, (text) => {
    const out = (text || "").trim()
    return out ? out : null
  })
}

// ── 整稿翻译 ──
// 把转写稿完整翻译成目标语言（展示名，如「英语」）。与补标点整理同一条铁律口径：
// 只做声明的变换，结构标记原样保留——时间戳、说话人标注、分行分段都不许动，
// 数字 / 日期 / 承诺含义必须与原文一致。
// 长稿按行分块逐块翻译（每块独立走模型降级链），避免单次输出超 max_tokens 被截断；
// 块间进度经 onProgress 抛出供 UI 展示。热词表注入提示词，专有名词译法全稿统一。
const TRANSLATE_CHUNK_CHARS = 6_000

export function splitTranslateChunks(text: string): string[] {
  const chunks: string[] = []
  let cur: string[] = []
  let len = 0
  for (const line of text.split("\n")) {
    // 到达块上限就先收块（单行超长也独立成块，不切断行——行是时间戳/说话人结构的最小单元）
    if (cur.length > 0 && len + line.length + 1 > TRANSLATE_CHUNK_CHARS) {
      chunks.push(cur.join("\n"))
      cur = []
      len = 0
    }
    cur.push(line)
    len += line.length + 1
  }
  if (cur.length > 0) chunks.push(cur.join("\n"))
  return chunks
}

// token 用量跨块求和（字段全缺省时维持 undefined，不造假账）
function mergeTokens(a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage | undefined {
  if (!b) return a
  if (!a) return { ...b }
  const sum = (x?: number, y?: number): number | undefined =>
    x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0)
  const input = sum(a.input, b.input)
  const output = sum(a.output, b.output)
  const total = sum(a.total, b.total)
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  }
}

export async function translateTranscript(
  transcript: string,
  targetLang: string,
  model?: string,
  opts?: {
    agentPrompt?: string
    hotwords?: string[]
    onProgress?: (doneChunks: number, totalChunks: number) => void
  },
): Promise<ChainResult<string>> {
  const chunks = splitTranslateChunks(clipTranscript(transcript))
  const glossary =
    opts?.hotwords && opts.hotwords.length > 0
      ? `\n专有名词词表（来自历史会议，全稿译法保持一致；没有通用译名的保留原文写法）：${opts.hotwords.join("、")}`
      : ""
  const system = buildAgentSystem(
    "translate",
    `你是会议转写翻译器。把用户给出的会议转写翻译成${targetLang}。铁律：只翻译、不总结、不润色、不增删任何实质内容；每行开头的时间戳（如 [03:25]）与说话人标记（如 老王：）连同名字原样保留；保持原有换行与分段结构；数字、日期、金额、承诺内容必须与原文一致。直接输出译文全文，不要输出任何解释、前言或代码围栏。${glossary}`,
    opts?.agentPrompt,
  )

  const startedAt = Date.now()
  const attempts: ChainAttempt[] = []
  const parts: string[] = []
  let usedModel = ""
  let fellBack = false
  let tokens: TokenUsage | undefined
  for (let i = 0; i < chunks.length; i++) {
    const messages: LlmMessage[] = [
      { role: "system", content: system },
      { role: "user", content: `请把以下会议转写翻译成${targetLang}：\n\n${chunks[i]}` },
    ]
    const r = await callWithChain("translate", messages, model, (text) => {
      const out = (text || "").trim()
      return out ? out : null
    })
    parts.push(r.data)
    attempts.push(...r.attempts)
    if (r.fellBack) fellBack = true
    usedModel = r.usedModel
    tokens = mergeTokens(tokens, r.tokens)
    opts?.onProgress?.(i + 1, chunks.length)
  }
  return {
    data: parts.join("\n"),
    usedModel,
    fellBack,
    durationMs: Date.now() - startedAt,
    attempts,
    ...(tokens ? { tokens } : {}),
  }
}

// 语义找会：两段式混合检索（Khoj 式「粗筛 + 精排」架构）——
// 第一段本地免费粗筛：查询词在标题/摘要/议题/转写节选里的命中加权 + 新近度，取前 24 场候选，
// 会议再多也不会撑爆上下文；第二段 LLM 语义精排：从候选里按语义挑相关会议并给理由。
// 与全文检索互补——搜「定价」能命中只谈过「价格策略」的会议；模型只从给定清单里挑编号，挑不出就返回空。
export interface RelatedMeeting {
  meetingId: string
  title: string
  date: string
  reason: string
}

const FIND_CANDIDATE_CAP = 24

function prescoreForQuery(m: Meeting, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const title = m.title.toLowerCase()
  const brief = (m.brief?.content ?? "").toLowerCase()
  const topics = (m.outline?.topics ?? [])
    .flatMap((t) => [t.topic, ...t.points])
    .join(" ")
    .toLowerCase()
  const clip = (m.cleaned || m.transcript).slice(0, 20_000).toLowerCase()
  let score = 0
  for (const tok of tokens) {
    if (title.includes(tok)) score += 6
    if (brief.includes(tok)) score += 4
    if (topics.includes(tok)) score += 3
    if (clip.includes(tok)) score += 1
  }
  // 新近度轻微加权：同分时新会靠前（不喧宾夺主）
  score += Math.max(0, 1 - (Date.now() - m.updatedAt) / (365 * 86_400_000)) * 0.5
  return score
}

export async function findRelatedMeetings(
  query: string,
  meetings: Meeting[],
  model?: string,
  opts?: { agentPrompt?: string },
): Promise<ChainResult<RelatedMeeting[]>> {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const candidates =
    meetings.length <= FIND_CANDIDATE_CAP
      ? meetings
      : meetings
          .map((m) => ({ m, score: prescoreForQuery(m, tokens) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, FIND_CANDIDATE_CAP)
          .map((x) => x.m)

  const blocks: string[] = []
  candidates.forEach((m, i) => {
    const parts: string[] = [`【${i}】《${m.title}》（${m.date}）`]
    if (m.brief?.content) parts.push(`摘要：${m.brief.content}`)
    if (m.outline?.topics.length) {
      parts.push(
        "议题：" + m.outline.topics.map((t) => `${t.topic}（${t.points.join("；")}）`).join("；"),
      )
    }
    const clip = (m.cleaned || m.transcript).slice(0, 800)
    if (clip.trim()) parts.push(`转写节选：${clip.replace(/\n+/g, " ")}`)
    blocks.push(parts.join("\n"))
  })

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "retrieve",
        "你是个人会议档案的语义检索器。判断哪些会议与查询相关——按语义匹配而非字面匹配（例如查询「定价」应命中讨论「价格策略」「怎么收费」的会议）。只能从给定清单里选择，禁止编造清单外的会议。输出必须是合法 JSON，不要输出 JSON 以外的任何文字。",
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `会议清单：\n\n${blocks.join("\n\n")}\n\n查询：${query}\n\n返回 JSON：\n{\n  "results": [\n    { "index": 会议编号数字, "reason": "一句话说明为什么相关（30 字内，引用会议里的具体内容）" }\n  ]\n}\n要求：最多返回 8 条，按相关度降序；确实没有相关会议就返回空数组。`,
    },
  ]
  return callWithChain("find", messages, model, (text) => {
    const obj = parseJsonObject(text)
    if (!obj) return null
    const raw = Array.isArray(obj.results) ? obj.results : []
    const out: RelatedMeeting[] = []
    for (const r of raw) {
      const item = r as Record<string, unknown>
      const idx = typeof item.index === "number" ? item.index : Number(item.index)
      const m = candidates[idx]
      if (!Number.isInteger(idx) || !m) continue
      out.push({
        meetingId: m.id,
        title: m.title,
        date: m.date,
        reason: typeof item.reason === "string" ? item.reason.trim().slice(0, 60) : "",
      })
      if (out.length >= 8) break
    }
    return out
  })
}

// 说话人推断（LLM 层）：给未标注行推断最可能的说话人。
// 只输出建议（行号 + 名字 + 置信度 + 理由），不碰原文——采纳与写入由用户在审阅面板决定。
// 机器校验：行号必须在未标注清单内、名字去冒号截断、置信度收敛到 0-1，越界条目直接丢弃。
export async function inferSpeakers(
  transcript: string,
  unlabeledLines: number[],
  knownSpeakers: string[],
  model?: string,
  opts?: { agentPrompt?: string },
): Promise<ChainResult<SpeakerSuggestion[]>> {
  const allowed = new Set(unlabeledLines)
  const numbered = clipTranscript(transcript)
    .split("\n")
    .map((l, i) => `${i + 1}| ${l}`)
    .join("\n")

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "annotate",
        "你是会议转写的说话人推断器。依据上下文线索（称呼语与应答关系、自称、汇报顺序、话题延续、语气）推断指定行最可能的说话人。优先使用已知说话人名单中的名字；名单外的人只有在线索非常明确时才用。拿不准就给低置信度，禁止编造对话内容。输出必须是合法 JSON，不要输出 JSON 以外的任何文字。",
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `已知说话人：${knownSpeakers.length > 0 ? knownSpeakers.join("、") : "（暂无，转写稿还没有任何标注）"}\n需要推断的行号（1-based，只处理这些行）：${unlabeledLines.join(", ")}\n\n带行号的转写全文：\n${numbered}\n\n返回 JSON：\n{\n  "suggestions": [\n    { "line": 行号数字, "speaker": "说话人名字（≤12 字）", "confidence": 0.0到1.0, "reason": "判断依据（20 字内）" }\n  ]\n}\n要求：只返回需要推断的行；每一行最多一条建议；确实无法判断的行可以不返回。`,
    },
  ]
  return callWithChain("infer", messages, model, (text) => {
    const obj = parseJsonObject(text)
    if (!obj) return null
    const raw = Array.isArray(obj.suggestions) ? obj.suggestions : []
    const out: SpeakerSuggestion[] = []
    const seen = new Set<number>()
    for (const s of raw) {
      const item = s as Record<string, unknown>
      const line = typeof item.line === "number" ? item.line : Number(item.line)
      const speaker =
        typeof item.speaker === "string"
          ? item.speaker.replace(/[:：\[\]【】]/g, "").trim().slice(0, 12)
          : ""
      const conf = typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : 0
      if (!Number.isInteger(line) || !allowed.has(line) || !speaker || seen.has(line)) continue
      seen.add(line)
      out.push({
        line,
        speaker,
        confidence: Math.round(conf * 100) / 100,
        source: "ai",
        reason: typeof item.reason === "string" ? item.reason.trim().slice(0, 30) : "",
      })
    }
    return out.sort((a, b) => a.line - b.line)
  })
}

// 高频行动项主题聚类（流程洞察）：把全部行动项按语义归堆，
// 反复出现的同类事项（「补充文档」「同步给 X」）往往指向流程漏洞。
// 只返回机器可校验的结构：主题名 + 成员条目编号 + 一句流程改进建议；编号越界的成员直接丢弃。
export interface ActionTheme {
  name: string
  count: number // 该主题下的行动项条数
  meetings: number // 覆盖的会议数（跨会重复 = 流程信号更强）
  examples: string[] // 最多 3 条示例原文
  insight: string // 一句话流程改进建议
}

export interface ActionEntry {
  content: string
  meetingTitle: string
  status: string
}

const THEME_ENTRY_CAP = 300

export async function analyzeActionThemes(
  entries: ActionEntry[],
  model?: string,
  opts?: { agentPrompt?: string },
): Promise<ChainResult<ActionTheme[]>> {
  const capped = entries.slice(0, THEME_ENTRY_CAP)
  const numbered = capped.map((e, i) => `${i}. ${e.content}（《${e.meetingTitle}》，${e.status}）`).join("\n")

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "summary",
        "你是团队协作流程分析器。把语义相近的行动项聚成主题——判断标准是「做的是同一类事」，不是字面相同（如「补充接口文档」「把文档补齐」「更新说明文档」属于同一主题）。跨会议反复出现的主题优先输出，那通常意味着流程有漏洞。只依据给定条目，禁止编造。输出必须是合法 JSON，不要输出 JSON 以外的任何文字。",
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `以下是全部行动项（编号. 内容（来源会议，状态））：\n${numbered}\n\n返回 JSON：\n{\n  "themes": [\n    { "name": "主题名（8 字内，如：文档补齐）", "action_indices": [条目编号], "insight": "一句话流程改进建议（40 字内，指出为什么这类事总在发生、怎么让它不再变成行动项）" }\n  ]\n}\n要求：每个主题至少 2 条语义相近的行动项；最多 6 个主题，按条数降序；单条孤例不要成主题；没有可聚类的就返回空数组。`,
    },
  ]
  return callWithChain("insight", messages, model, (text) => {
    const obj = parseJsonObject(text)
    if (!obj) return null
    const raw = Array.isArray(obj.themes) ? obj.themes : []
    const out: ActionTheme[] = []
    for (const t of raw) {
      const item = t as Record<string, unknown>
      const name = typeof item.name === "string" ? item.name.trim().slice(0, 12) : ""
      const rawIdx = Array.isArray(item.action_indices) ? item.action_indices : []
      const idx = [
        ...new Set(
          rawIdx
            .map((x) => (typeof x === "number" ? x : Number(x)))
            .filter((n) => Number.isInteger(n) && n >= 0 && n < capped.length),
        ),
      ]
      if (!name || idx.length < 2) continue
      const meetingSet = new Set(idx.map((n) => capped[n].meetingTitle))
      out.push({
        name,
        count: idx.length,
        meetings: meetingSet.size,
        examples: idx.slice(0, 3).map((n) => capped[n].content),
        insight: typeof item.insight === "string" ? item.insight.trim().slice(0, 80) : "",
      })
      if (out.length >= 6) break
    }
    return out.sort((a, b) => b.count - a.count || b.meetings - a.meetings)
  })
}

// ── 主动消化层：新会议产生后，把历史未结行动项拿来逐条对照 ──
// LLM 只做语义判定（这场会有没有跟进它、跟进成什么状态），
// 「疑似遗忘」由本地规则判（未提及 且 已逾期或 ≥14 天没动）——语义归模型、纪律归代码。
// 产出全是建议：状态更新要用户在面板里勾选采纳才写入（写入即打手改标记，重新抽取不覆盖）。
export type CarryoverVerdict = "done" | "progress" | "blocked" | "unmentioned"

export interface CarryoverItem {
  ref: number // past 清单里的编号（0-based），机器校验用
  verdict: CarryoverVerdict
  evidence: string // 原文依据摘录（≤60 字；unmentioned 为空）
}

export interface CarryoverEntry {
  content: string
  assignee: string
  fromTitle: string
}

export async function trackCarryoverActions(
  newTranscript: string,
  past: CarryoverEntry[],
  model?: string,
  opts?: { agentPrompt?: string },
): Promise<ChainResult<CarryoverItem[]>> {
  const numbered = past.map((p, i) => `${i}. ${p.content}${p.assignee ? `（负责人：${p.assignee}）` : ""}（来自《${p.fromTitle}》）`).join("\n")
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "extract",
        "你是会议行动项跟踪器。判断「历史未结行动项」在新会议内容里是否被跟进：明确说完成/上线/交付/不用再做了 → done；提到在做/有进展/部分完成 → progress；提到卡住/等人/延期受阻 → blocked；整场会议没提到 → unmentioned。判定必须有原文依据（evidence 逐字摘录），拿不准就 unmentioned，禁止脑补。输出必须是合法 JSON，不要输出 JSON 以外的任何文字。",
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `历史未结行动项（编号清单）：\n${numbered}\n\n新会议内容：\n${clipTranscript(newTranscript)}\n\n返回 JSON：\n{\n  "items": [\n    { "ref": 编号数字, "verdict": "done|progress|blocked|unmentioned", "evidence": "原文摘录（40 字内，unmentioned 留空字符串）" }\n  ]\n}\n要求：对清单里每一条都给出判定，一条不漏。`,
    },
  ]
  return callWithChain("digest", messages, model, (text) => {
    const obj = parseJsonObject(text)
    if (!obj) return null
    const raw = Array.isArray(obj.items) ? obj.items : []
    const valid: CarryoverVerdict[] = ["done", "progress", "blocked", "unmentioned"]
    const out: CarryoverItem[] = []
    const seen = new Set<number>()
    for (const it of raw) {
      const item = it as Record<string, unknown>
      const ref = typeof item.ref === "number" ? item.ref : Number(item.ref)
      const verdict = typeof item.verdict === "string" ? item.verdict : ""
      if (!Number.isInteger(ref) || ref < 0 || ref >= past.length || seen.has(ref)) continue
      if (!valid.includes(verdict as CarryoverVerdict)) continue
      seen.add(ref)
      out.push({
        ref,
        verdict: verdict as CarryoverVerdict,
        evidence: typeof item.evidence === "string" ? item.evidence.trim().slice(0, 60) : "",
      })
    }
    return out
  })
}

// ── 知识演进脉络：一个系列（同标签/同 seriesId）的历次会议按时间给 LLM，
// 产出「某主线何时提出 → 怎么变化 → 当前结论」的演进叙述（纯文本，非 JSON）──
export interface EvolutionMeeting {
  date: string
  title: string
  brief: string
  topics: { topic: string; points: string[] }[]
}

export async function generateTopicEvolution(
  seriesLabel: string,
  series: EvolutionMeeting[],
  model?: string,
  opts?: { agentPrompt?: string },
): Promise<ChainResult<string>> {
  const blocks = series.map(
    (m) =>
      `【${m.date}】《${m.title}》\n摘要：${m.brief || "（无）"}\n议题：${
        m.topics.map((t) => `${t.topic}（${t.points.join("；")}）`).join("；") || "（无）"
      }`,
  )
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "summary",
        "你是项目知识演进分析师。依据按时间排列的历次会议摘要与议题，梳理这个系列的演进脉络：找出反复出现的主线，每条主线写清「何时提出 → 中间怎么变化（转向、加码、搁置）→ 当前状态/最新结论」，引用日期与具体结论；只出现一次、没有后续的话题不必单列。只依据给定资料，禁止编造。直接输出纯文本（可用小标题与短段落），不要 JSON、不要代码围栏。",
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `系列：${seriesLabel}（共 ${series.length} 场，按时间先后排列）\n\n${blocks.join("\n\n")}\n\n请输出这个系列的演进脉络（400 字以内）。`,
    },
  ]
  return callWithChain("evolution", messages, model, (text) => {
    const out = (text || "").trim()
    return out ? out : null
  })
}

// ── 实体抽取（图谱增强层，显式付费开关）：人物 / 项目 / 客户 ──
// 本地图谱已从说话人与行动项负责人拿到「确定的人」；这一步补的是转写里提到、
// 但没出现在标注结构里的实体（客户名、项目代号、系统名）。机器校验：类型必须在枚举内、
// 名字去重截断，越界条目直接丢弃。
export async function extractEntities(
  title: string,
  transcript: string,
  model?: string,
  opts?: { agentPrompt?: string },
): Promise<ChainResult<EntityRef[]>> {
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: buildAgentSystem(
        "extract",
        "你是会议实体抽取器。从转写里找出被提到的人物、项目（含产品/系统/功能代号）、客户或外部组织。只抽转写中真实出现的名字，禁止推断暗示的实体；同一个人物用最常见的称呼，不要输出代词（他/她/我们）。输出必须是合法 JSON，不要输出 JSON 以外的任何文字。",
        opts?.agentPrompt,
      ),
    },
    {
      role: "user",
      content: `会议标题：${title}\n\n转写原文：\n${clipTranscript(transcript)}\n\n返回 JSON：\n{\n  "entities": [\n    { "name": "实体名（≤20 字）", "type": "person|project|client|other" }\n  ]\n}\n要求：最多 30 个，按出现频次降序；没有就返回空数组。`,
    },
  ]
  return callWithChain("entities", messages, model, (text) => {
    const obj = parseJsonObject(text)
    if (!obj) return null
    const raw = Array.isArray(obj.entities) ? obj.entities : []
    const validTypes = new Set(["person", "project", "client", "other"])
    const seen = new Set<string>()
    const out: EntityRef[] = []
    for (const e of raw) {
      const item = e as Record<string, unknown>
      const name = typeof item.name === "string" ? item.name.trim().slice(0, 20) : ""
      const type = typeof item.type === "string" ? item.type : "other"
      if (!name || !validTypes.has(type) || seen.has(name)) continue
      seen.add(name)
      out.push({ name, type: type as EntityRef["type"] })
      if (out.length >= 30) break
    }
    return out
  })
}
