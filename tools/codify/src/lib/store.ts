// 数据层：个人单机，全部数据存浏览器 localStorage，零外部依赖。
// 整个存储是一个 JSON 对象，方便用户导出备份。

import { loadProvidersConfig, sanitizeProvidersConfig, type ProvidersConfig } from "@/lib/providers"
import { loadAgentsConfig, type AgentsConfig } from "@/lib/agents"
import { vaultGetItem, vaultSetItem } from "@/lib/vault"

export interface NoteLayer {
  content: string
  model: string
  editedByUser: boolean
  generatedAt: number
}

// 整稿译文层（翻译 Agent 产物）：独立副本，不覆盖转写原文——可对照查看 / 复制 / 清除。
// 转写稿在翻译后又被改动时，UI 按 generatedAt 与 transcriptUpdatedAt 对比标记「可能过时」。
export interface TranslationLayer {
  text: string
  lang: string // 目标语言代码（见 providers.ts 的 TRANSLATE_LANGUAGES）
  engine: string // 实际产出引擎（模型 id / 外部翻译引擎 id），账本之外的就地溯源
  generatedAt: number
}

export interface OutlineTopic {
  topic: string
  points: string[]
  factIds?: string[] // 本议题要点引用的事实编号（FRAME 管线的可追溯锚，旧数据没有）
}

export interface OutlineLayer {
  topics: OutlineTopic[]
  model: string
  editedByUser: boolean
  generatedAt: number
}

// ── 事实层（FRAME 管线的中间产物）──
// 摘要不直接「读全文写总结」，而是先提取原子事实（每条带原文支撑句，机器校验），
// 再按语义聚类成议题、由事实组织成摘要——每一步可验证，事实列表本身有独立价值。
export interface MeetingFact {
  id: string // f1、f2…（本场内编号，议题要点按它回溯）
  statement: string // 一句话原子陈述（含具体数字/名称/时间）
  speaker: string // 说出这条事实的人（原文没标就留空）
  segId: number // 来自规则粗分段的段编号（聚类的时间锚）
  sourceQuote: string // 原文支撑句（逐字摘录，已机器校验）
  salience: number // 0-1 显著度（模型给分，排序用）
}

// 摘要读者视角（SCOPE）：同一场会，写给不同人的摘要信息权重不同
export type SummaryPersona = "neutral" | "owner" | "observer"

export interface MeetingAction {
  id: string
  content: string
  assignee: string
  dueDate: string // yyyy-mm-dd 或空
  // 生命周期：提出(open) → 进行中(doing) → 阻塞(blocked) → 完成(done) / 取消(cancelled)
  // 改派 = 改 assignee（条目会打 editedByUser）；旧数据只有 open/done，天然兼容
  status: "open" | "doing" | "blocked" | "done" | "cancelled"
  sourceQuote: string
  editedByUser: boolean
  createdAt?: number // 提出时刻：截止日视图用它算「多少天没动」；旧数据回退用会议创建时间
  confidence?: number // 0-1，AI 抽取时模型给出；手动添加的条目没有
  sourceLine?: number // 1-based 行号：sourceQuote 在转写原文中的位置（机器对账回填，点击可跳回原文）
  sourceStart?: number // 引用在原文中的字符偏移（含），有则定位时精确选中引用本身而非整行
  sourceEnd?: number // 字符偏移（不含）
  // 锚点对账的扩展：「引用存在」≠「引用支撑结论」。LLM judge 对 source_quote 与结论
  // 的语义支撑度分级——weak / none 的条目在 UI 上醒目标注，提示用户优先核对。
  // 按需触发（行动项页「支撑核验」），结果随条目持久化；旧数据 / 未核验条目没有此字段
  support?: SupportStrength
}

// 引用支撑强度：strong 引用直接陈述结论 / weak 只是话题相关或要素缺失 / none 无关或矛盾
export interface SupportStrength {
  level: "strong" | "weak" | "none"
  reason: string // 判定理由（审查器给出，展示在徽标 tooltip）
  at: number // 判定时刻（转写稿之后又改过 → UI 提示可能过时）
  model: string // 判定用的模型
}

// 行动项状态的展示元数据（标签 + 徽标配色），行动项页 / 截止日页 / 导出共用
export const ACTION_STATUSES: {
  value: MeetingAction["status"]
  label: string
  pill: string
  open: boolean // 是否算「未完成」（截止日汇总、角标计数的口径）
}[] = [
  { value: "open", label: "提出", pill: "border-border bg-muted text-muted-foreground", open: true },
  { value: "doing", label: "进行中", pill: "border-primary/30 bg-primary/5 text-primary", open: true },
  { value: "blocked", label: "阻塞", pill: "border-destructive/30 bg-destructive/5 text-destructive", open: true },
  { value: "done", label: "完成", pill: "border-border bg-muted text-muted-foreground/70", open: false },
  { value: "cancelled", label: "取消", pill: "border-border bg-muted text-muted-foreground/50", open: false },
]

export function isOpenStatus(status: MeetingAction["status"]): boolean {
  return ACTION_STATUSES.find((s) => s.value === status)?.open ?? status === "open"
}

export function actionStatusLabel(status: MeetingAction["status"]): string {
  return ACTION_STATUSES.find((s) => s.value === status)?.label ?? status
}

export interface MeetingDecision {
  id: string
  content: string
  sourceQuote: string
  editedByUser: boolean
  sourceLine?: number
  sourceStart?: number
  sourceEnd?: number
  // 被后续会议的新决议取代（记忆生命周期的「过时」阶段）：
  // 标记后默认不再作为有效知识出现，但保留可查——遗忘是降级，不是删除
  supersededBy?: { meetingId: string; decisionId: string; at: number }
}

// 点击出处引用时的定位目标：优先字符级，降级到行级（无时间戳纯文本也能「点回原文附近」）
export interface SourceAnchor {
  line: number
  start?: number
  end?: number
}

// 清洗中间产物的统计（清洗本身是本地规则，随时可重算）
export interface CleanStats {
  changedLines: number
  timestamps: number
  speakers: number
  slips?: number // 口误自我纠正处数（旧数据没有此字段，展示时按 0 处理）
  at: number
}

// 会中随手记：用户自己在会议进行中写下的轻量批注——保留人的主动性，
// 个人洞察始终在流程中心；会后生成纪要时 AI 把随手记与转写内容对齐增强
// （优先呼应用户标记的重点），而不是完全替代用户产出纪要。
export interface MeetingNote {
  id: string
  at: number // 挂钟时刻
  elapsedLabel?: string // 录音中的相对时间标签（如 03:25），与转写行时间戳同轴
  text: string
}

// 跟进消化产生的「行动项 ↔ 后续会议」链接：图谱里的事实边
// （行动项 A 在会议 C 中被跟进：完成 / 有进展 / 被阻塞 / 未提及）
export interface DigestLink {
  actionId: string
  ownerId: string // 行动项所属会议
  verdict: "done" | "progress" | "blocked" | "unmentioned"
  evidence: string
  at: number
}

// 实体（人物 / 项目 / 客户）：本地层从说话人与负责人自动来；
// AI 补全是显式付费开关（每场会一次），结果存这里供图谱消费
export interface EntityRef {
  name: string
  type: "person" | "project" | "client" | "other"
}

export interface Meeting {
  id: string
  title: string
  date: string // yyyy-mm-dd
  tags: string[]
  meetingKind?: string // 会议模板 id（内置或自定义）：摘要组织视角按模板 guidance 注入，缺省为通用
  transcript: string
  createdAt: number
  updatedAt: number
  brief: NoteLayer | null
  outline: OutlineLayer | null
  actions: MeetingAction[]
  decisions: MeetingDecision[]
  // 待人工确认队列（Human-in-the-Loop）：抽取 Agent 置信度不足直接生效门槛的条目扣在这里，
  // 不计入任何统计 / 导出 / 图谱，用户在行动项页逐条采纳或放弃后才进入 actions
  pendingActions?: MeetingAction[]
  cleaned?: string // 清洗稿（中间产物）：摘要与抽取基于它生成
  cleanReport?: CleanStats
  // 事实层（FRAME 管线中间产物）：摘要先提取带原文支撑的原子事实，再按事实聚类组织议题；
  // 每条事实机器校验过 source_quote，列表本身可独立查阅（纪要页「事实层」面板）
  facts?: MeetingFact[]
  factsAt?: number // 事实层生成时刻（漂移感知：转写稿后改过则标记可能过时）
  factsModel?: string // 提取事实用的模型
  factsFallback?: boolean // 事实太少/提取失败，本次摘要回退了一次成稿路径
  notes?: MeetingNote[] // 会中随手记（用户批注，随会议保存、随备份导出）
  // 归档（记忆生命周期的「归档」阶段）：低产出会议收进归档区，列表默认不显示；
  // 归档 ≠ 删除——全文仍在本地、仍可搜索问答，只是不再占据注意力
  archived?: boolean
  archivedAt?: number
  // 评估集（golden set）成员：调提示词/换模型后在「评估台」一键重跑这些会议，
  // 人工四维打分对比历史运行——固定考卷才能衡量质量变化（见 lib/evalRun.ts）
  golden?: boolean
  digestLinks?: DigestLink[] // 本场会消化过的历史行动项跟进链接（图谱事实边）
  entities?: EntityRef[] // AI 补全的实体（显式付费触发；本地实体从说话人/负责人实时算，不落盘）
  // ── 漂移感知用的源头时间戳 ──
  transcriptUpdatedAt?: number // 转写稿最后一次实质变更（编辑/整理/标注/还原都算）
  extractedAt?: number // 行动项/决议最后一次抽取完成的时刻
  // 「补标点分段」前的原稿快照：整理是覆盖式写入，留一份可一键还原；
  // 用户手动编辑转写稿后即作废（快照过时，还原反而会丢新编辑）
  prePolish?: string
  // 整稿译文（翻译是旁路产物：只新增这一层，转写原文永不被译文覆盖）
  translation?: TranslationLayer
  // 显式系列 id（预留字段）：同一项目 / 例会的连续会议可归入一个系列，
  // 时间线视图优先按它分组；尚无 UI 写入，缺省时系列 = 第一个标签。
  // 导入 / 导出的 JSON 会原样携带，外部工具（脚本、MCP 桥）可先行赋值。
  seriesId?: string
  // 会议创建时的时区（如 Asia/Shanghai）；截止日判断始终按当前设备时区，此字段供追溯与提示
  tz?: string
  // 实时转写的绝对时间锚点：按下「实时转写」的时刻。
  // 行内时间戳是录音相对时间（第 N 分钟），只在单场内有意义；
  // 跨会议检索 / 问答 / 导出用这个锚点换算绝对时间。
  recStartedAt?: number
}

// 系列归属：显式 seriesId 优先，否则用第一个标签兜底；都没有返回空串（时间线归「未打标」组）
export function seriesKeyOf(m: Meeting): string {
  const sid = typeof m.seriesId === "string" ? m.seriesId.trim() : ""
  return sid || m.tags[0] || ""
}

export interface QaRecord {
  id: string
  question: string
  answer: string
  createdAt: number
  // 自路由标记：structured = 规则分类器判定为结构化事实查询，本地直答（零费用，未调用模型）；
  // rag / 缺省 = 走了完整 RAG 管线（缺省兼容旧记录）
  route?: "structured" | "rag"
  // 引用核验（RAG 路线）：答案里「」引文与原文逐字对账的命中率——机器可算的忠实度信号
  citations?: { total: number; verified: number }
  // 检索口径说明（进了上下文的会议数与重排方式），UI 悬停可查「答案基于什么选出」
  retrievalNote?: string
}

export interface StoreData {
  meetings: Meeting[]
  qaHistory: QaRecord[]
}

const STORAGE_KEY = "meeting-notes-store-v1"

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
}

export function loadStore(): StoreData {
  try {
    const raw = vaultGetItem(STORAGE_KEY)
    if (!raw) return { meetings: [], qaHistory: [] }
    const data = JSON.parse(raw) as Partial<StoreData>
    return {
      meetings: Array.isArray(data.meetings) ? data.meetings : [],
      qaHistory: Array.isArray(data.qaHistory) ? data.qaHistory : [],
    }
  } catch {
    return { meetings: [], qaHistory: [] }
  }
}

export function saveStore(data: StoreData): boolean {
  try {
    vaultSetItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    // 配额满时写入失败——必须让上层知道并提醒用户备份，绝不静默吞掉
    return false
  }
}

export function todayStr(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

// 截止日相对今天的天数差：<0 已逾期，0 今天到期，>0 还剩 N 天；
// 非法/空日期返回 null。按本地零点比较，不受时区偏移影响。
export function dueDayOffset(due: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null
  const dueTime = new Date(`${due}T00:00:00`).getTime()
  const todayTime = new Date(`${todayStr()}T00:00:00`).getTime()
  if (Number.isNaN(dueTime)) return null
  return Math.round((dueTime - todayTime) / 86_400_000)
}

export function createMeeting(title: string, date: string): Meeting {
  const now = Date.now()
  return {
    id: newId(),
    title: title.trim() || "未命名会议",
    date: date || todayStr(),
    tags: [],
    transcript: "",
    createdAt: now,
    updatedAt: now,
    brief: null,
    outline: null,
    actions: [],
    decisions: [],
    ...(currentTz() ? { tz: currentTz() } : {}),
  }
}

// 会议创建时的时区（如 Asia/Shanghai）：截止日的「今天/逾期」按用户设备当前时区判断，
// 异地创建的会议带上原始时区标记，导出与界面提示都如实注明判断口径。
export function currentTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ""
  } catch {
    return ""
  }
}

// ── 纯文本计算已抽到 textPure.ts（Worker 与主线程共用），此处原样再导出保持兼容 ──
export {
  parseTranscriptLines,
  textSimilarity,
  transcriptFingerprint,
  findDuplicate,
  type TranscriptLine,
  type DedupCandidate,
  type DedupResult,
} from "@/lib/textPure"

export function buildMarkdown(m: Meeting): string {
  const lines: string[] = []
  // YAML frontmatter：兼容 Obsidian / Logseq 等笔记工具
  lines.push("---")
  lines.push(`title: ${JSON.stringify(m.title)}`)
  lines.push(`date: ${m.date}`)
  if (m.recStartedAt) {
    lines.push(`recorded_at: ${JSON.stringify(new Date(m.recStartedAt).toISOString())}`)
  }
  if (m.tz) {
    lines.push(`timezone: ${JSON.stringify(m.tz)}`)
  }
  lines.push(`tags: [${m.tags.map((t) => JSON.stringify(t)).join(", ")}]`)
  lines.push(`model: ${JSON.stringify(m.brief?.model ?? m.outline?.model ?? "")}`)
  lines.push("---")
  lines.push("")
  lines.push(`# ${m.title}`)
  lines.push("")
  lines.push(`日期：${m.date}`)
  if (m.tags.length > 0) lines.push(`标签：${m.tags.join("、")}`)
  lines.push("")

  if (m.brief && m.brief.content.trim()) {
    lines.push("## 一句话摘要")
    lines.push("")
    lines.push(m.brief.content.trim())
    lines.push("")
  }

  if (m.outline && m.outline.topics.length > 0) {
    lines.push("## 议题纪要")
    lines.push("")
    m.outline.topics.forEach((t, i) => {
      lines.push(`### ${i + 1}. ${t.topic}`)
      t.points.forEach((p) => lines.push(`- ${p}`))
      lines.push("")
    })
  }

  if (m.actions.length > 0) {
    lines.push("## 行动项")
    lines.push("")
    m.actions.forEach((a) => {
      const meta = [
        a.assignee && `负责人：${a.assignee}`,
        a.dueDate && `截止：${a.dueDate}`,
        `状态：${actionStatusLabel(a.status)}`,
      ]
        .filter(Boolean)
        .join("　")
      const box = a.status === "done" ? "x" : a.status === "cancelled" ? "-" : " "
      lines.push(`- [${box}] ${a.content}${meta ? `（${meta}）` : ""}`)
    })
    lines.push("")
  }

  if (m.decisions.length > 0) {
    lines.push("## 决议")
    lines.push("")
    m.decisions.forEach((d) => lines.push(`- ${d.content}`))
    lines.push("")
  }

  if (m.notes && m.notes.length > 0) {
    lines.push("## 我的随手记")
    lines.push("")
    m.notes.forEach((n) => {
      lines.push(`- ${n.elapsedLabel ? `[${n.elapsedLabel}] ` : ""}${n.text}`)
    })
    lines.push("")
  }

  if (m.transcript.trim()) {
    lines.push("## 转写全文")
    lines.push("")
    lines.push(m.transcript.trim())
    lines.push("")
  }

  return lines.join("\n")
}

export function downloadMarkdown(m: Meeting): void {
  const blob = new Blob([buildMarkdown(m)], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${m.date}-${m.title}.md`.replace(/[\\/:*?"<>|\s]+/g, "-")
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── 模型与降级链 ──
// 首选模型失败（超时/服务异常）时按顺序降级，登录/余额类错误不降级。
// 默认指向 gpt-4o-mini，可用 .env 的 VITE_LLM_MODEL 覆盖（默认 LLM 走 Agnes）。
export const DEFAULT_MODEL = import.meta.env.VITE_LLM_MODEL ?? "agnes-2.5-flash"
export const MODEL_FALLBACK_CHAIN = ["agnes-2.5-pro", "agnes-2.0-flash"]

// ── 会议模板：摘要的「组织视角」提示语，用户可改可加可从满意的会议提取 ──
// 内置五套作为默认值（general/weekly/review/client/oneonone），内置模板可编辑、可恢复默认；
// 自定义模板（含「从这场会提取」生成的）可删。Meeting.meetingKind 存模板 id。
export interface MeetingTemplate {
  id: string
  label: string
  guidance: string // 注入摘要提示词的「会议类型提示」正文
  builtin: boolean
  createdAt?: number
}

export const DEFAULT_MEETING_TEMPLATES: MeetingTemplate[] = [
  { id: "general", label: "通用会议", builtin: true, guidance: "" },
  {
    id: "weekly",
    label: "周会 / 例会",
    builtin: true,
    guidance:
      "这是周会/例会：议题优先按「进展 / 阻塞 / 下周计划」组织，每个人的汇报进展、承诺与风险都要落进要点",
  },
  {
    id: "review",
    label: "评审会",
    builtin: true,
    guidance:
      "这是评审会：议题优先按「评审对象 / 评审结论（通过、否决、暂缓）/ 待修改问题」组织，结论必须明确写进要点",
  },
  {
    id: "client",
    label: "客户沟通",
    builtin: true,
    guidance:
      "这是客户沟通会：议题优先按「客户提出的需求 / 我方答复与承诺 / 跟进事项」组织，给客户的承诺必须原样落进要点，不得弱化",
  },
  {
    id: "oneonone",
    label: "一对一",
    builtin: true,
    guidance: "这是一对一沟通：议题优先按「讨论的话题 / 达成的共识 / 成长与跟进事项」组织",
  },
]

// 兼容旧引用：内置模板的 id/label 清单
export const MEETING_KINDS = DEFAULT_MEETING_TEMPLATES.map((t) => ({ id: t.id, label: t.label }))

const TEMPLATES_KEY = "meeting-notes-templates-v1"

export function loadTemplates(): MeetingTemplate[] {
  try {
    const raw = vaultGetItem(TEMPLATES_KEY)
    if (!raw) return DEFAULT_MEETING_TEMPLATES.map((t) => ({ ...t }))
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return DEFAULT_MEETING_TEMPLATES.map((t) => ({ ...t }))
    const valid = list
      .filter(
        (t): t is MeetingTemplate =>
          !!t && typeof t === "object" && typeof (t as MeetingTemplate).id === "string" &&
          typeof (t as MeetingTemplate).label === "string",
      )
      .map((t) => ({
        id: t.id,
        label: t.label.slice(0, 20) || "未命名模板",
        guidance: typeof t.guidance === "string" ? t.guidance : "",
        builtin: Boolean(t.builtin),
        ...(typeof t.createdAt === "number" ? { createdAt: t.createdAt } : {}),
      }))
    // 内置模板缺了就补回（升级新增内置模板的场景）
    for (const def of DEFAULT_MEETING_TEMPLATES) {
      if (!valid.some((t) => t.id === def.id)) valid.unshift({ ...def })
    }
    return valid
  } catch {
    return DEFAULT_MEETING_TEMPLATES.map((t) => ({ ...t }))
  }
}

export function saveTemplates(list: MeetingTemplate[]): void {
  try {
    vaultSetItem(TEMPLATES_KEY, JSON.stringify(list))
  } catch {
    // 静默失败，不阻塞交互
  }
}

// ── 用户设置（外置可调，改设置不用改代码）──
export interface AppSettings {
  model: string // 首选生成模型
  minConfidence: number // 行动项置信度阈值，低于此值直接丢弃
  lastBackupAt?: number // 上次导出备份的时刻，用于「太久没备份」提醒
  // 摘要读者视角（SCOPE）：同一场会按「写给谁」调整信息权重——
  // neutral 均衡记录 / owner 负责人视角（突出分给我的任务与截止）/ observer 旁观者视角（突出决定了什么）
  summaryPersona?: SummaryPersona
  // 事实级摘要（FRAME 管线）：先提取带原文支撑的事实、再聚类组织成摘要（两次调用）；
  // 关闭则回到「一次调用直接成稿」。长会议更稳、幻觉更少，费用约为原来的 1.5-2 倍
  frameSummary?: boolean
  // 本地语义检索（WebGPU/WASM 推理 + 向量索引）：默认关闭——首次启用要加载
  // ~40MB 运行时与模型资产并全量建索引，必须用户显式开启
  semanticEnabled?: boolean
}

const SETTINGS_KEY = "meeting-notes-settings-v1"

export const DEFAULT_SETTINGS: AppSettings = {
  model: DEFAULT_MODEL,
  minConfidence: 0.4,
  summaryPersona: "neutral",
  frameSummary: true,
  semanticEnabled: false,
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const s = JSON.parse(raw) as Partial<AppSettings>
    const persona = s.summaryPersona
    return {
      model: typeof s.model === "string" && s.model ? s.model : DEFAULT_SETTINGS.model,
      minConfidence:
        typeof s.minConfidence === "number" && s.minConfidence >= 0 && s.minConfidence <= 1
          ? s.minConfidence
          : DEFAULT_SETTINGS.minConfidence,
      ...(typeof s.lastBackupAt === "number" ? { lastBackupAt: s.lastBackupAt } : {}),
      summaryPersona:
        persona === "owner" || persona === "observer" || persona === "neutral" ? persona : "neutral",
      frameSummary: s.frameSummary !== false, // 缺省开启；只有显式 false 才关闭
      semanticEnabled: s.semanticEnabled === true,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // 静默失败，不阻塞交互
  }
}

// ── 轻量事件日志（append-only，用于追溯「这条纪要哪来的」）──
export interface ActivityEvent {
  id: string
  at: number
  kind: string // 生成 / 问答 / 删除会议 / 导出备份 / 导入备份
  meetingTitle: string
  detail: string
}

const ACTIVITY_KEY = "meeting-notes-activity-v1"
const ACTIVITY_CAP = 100

export function loadActivity(): ActivityEvent[] {
  try {
    const raw = vaultGetItem(ACTIVITY_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as unknown
    return Array.isArray(list) ? (list as ActivityEvent[]).slice(0, ACTIVITY_CAP) : []
  } catch {
    return []
  }
}

export function saveActivity(events: ActivityEvent[]): void {
  try {
    vaultSetItem(ACTIVITY_KEY, JSON.stringify(events.slice(0, ACTIVITY_CAP)))
  } catch {
    // 静默失败
  }
}

export function makeActivity(kind: string, meetingTitle: string, detail: string): ActivityEvent {
  return { id: newId(), at: Date.now(), kind, meetingTitle, detail }
}

// ── 存储安全：浏览器可能在存储压力下清理本站数据，申请「持久化存储」降低被自动清理的概率 ──
// 申请结果由浏览器决定（可能拒绝）；无痕模式下始终不可靠，退出即清空。
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { storage?: { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> } }
    if (!nav.storage?.persist) return false
    if (await nav.storage.persisted?.()) return true
    return Boolean(await nav.storage.persist())
  } catch {
    return false
  }
}

// ── 全库备份：导出 / 导入一个 JSON 文件，数据可搬不被锁死 ──
// 版本兼容策略（旧备份永远打得开）——两条腿走路：
// 1. 迁移注册表（schemaMigrations.ts）：结构性变更（字段改名/删除/语义变化）
//    必须注册 migrate_vN_to_vN+1，导入时从备份自带 version 起链式迁移到当前版。
//    不写「万能解析器」硬吃结构差异——那是技术债的开始；
// 2. 宽容解析（下方 validateBackupObject）：只兜「新增可选字段」这类
//    天然兼容的差异与迁移后的残留噪音（缺失回退默认值、多余忽略、非法丢弃）。
//    它是最后防线，不是结构演进的主通道。
// 导出恒带 app 标记与 version；version 更高（未来版本导出的）不迁移、照常宽容尝试读取。
import { applyMigrationChain, SCHEMA_VERSION } from "@/lib/schemaMigrations"

export const BACKUP_VERSION = SCHEMA_VERSION
// 本工具能读懂的备份版本上限；导入时若文件声明的最低可读版本高于它，明确拒绝而不是带病解析
export const APP_VERSION = SCHEMA_VERSION

// 备份载荷构造（纯函数）：导出与 Worker 序列化共用
export function buildBackupPayload(
  data: StoreData,
  opts?: { includeSecrets?: boolean },
): Record<string, unknown> {
  const includeSecrets = Boolean(opts?.includeSecrets)
  return {
    app: "meeting-notes",
    version: BACKUP_VERSION,
    minReaderVersion: 1,
    // 密钥策略显式落盘：默认剔除 Provider 配置里的 password 类字段，
    // 分享备份文件不会泄露密钥；勾选「包含密钥」导出时此标记为 included
    secrets: includeSecrets ? ("included" as const) : ("excluded" as const),
    exportedAt: new Date().toISOString(),
    meetings: data.meetings,
    qaHistory: data.qaHistory,
    // 服务商配置一并带走（按上面的密钥策略脱敏）：换设备导入后 Provider 设置恢复
    providers: sanitizeProvidersConfig(loadProvidersConfig(), includeSecrets),
    // Agent 编排配置一并带走（无密钥，恒可安全分享）：换设备导入后分工设置恢复
    agents: loadAgentsConfig(),
  }
}

// 文本文件下载（导出路径共用）
export function downloadTextFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportAllJson(data: StoreData, opts?: { includeSecrets?: boolean }): void {
  downloadTextFile(
    `meeting-notes-backup-${todayStr()}.json`,
    JSON.stringify(buildBackupPayload(data, opts), null, 2),
    "application/json",
  )
}

// 版本闸门（对象版）：已解析的备份对象直接判定，大文件避免二次 JSON.parse
export function backupVersionIssueOf(raw: unknown): string | null {
  const r = raw as { minReaderVersion?: number; version?: number } | null
  if (r && typeof r === "object" && typeof r.minReaderVersion === "number" && r.minReaderVersion > APP_VERSION) {
    return `这份备份由更新版本导出（要求最低可读版本 ${r.minReaderVersion}，当前 ${APP_VERSION}），请升级后再导入`
  }
  return null
}

// 导入前的版本闸门：文件声明的最低可读版本高于本工具 → 返回明确拒绝原因；
// 其余情况（含未来版本导出的宽容读取）返回 null 放行。
export function backupVersionIssue(text: string): string | null {
  try {
    return backupVersionIssueOf(JSON.parse(text))
  } catch {
    return null // 解析失败交给 parseBackupJson 报「格式不对」
  }
}

// 导入采用「合并」策略：本地已存在的会议不动（避免覆盖更新的修改），只补缺失的。
export interface BackupPayload extends StoreData {
  providers?: ProvidersConfig
  agents?: AgentsConfig
}

// 备份对象校验：先走 schema 迁移链（结构变更的正规通道），再做宽容字段解析（最后防线）。
// 带 app 标记但不是本工具的 / 结构完全对不上的拒绝；version 不做上限拦截。
// 与 JSON.parse 拆开——大备份的解析可以走 Worker，校验+迁移留在主线程（轻量字段检查）。
export function validateBackupObject(raw: unknown): BackupPayload | null {
  try {
    if (!raw || typeof raw !== "object") return null
    const tagged = raw as { app?: string }
    if (tagged.app !== undefined && tagged.app !== "meeting-notes") return null
    // 迁移链：从载荷声明的 version 升到当前版（纯函数、不抛异常；
    // 链断开时停在断点版并已由 applyMigrationChain 记日志，剩余差异由下方宽容解析兜住）
    const migrated = applyMigrationChain(raw as Record<string, unknown>)
    const obj = migrated.obj as Partial<StoreData> & {
      app?: string
      version?: number
      providers?: ProvidersConfig
      agents?: AgentsConfig
    }
    if (!Array.isArray(obj.meetings)) return null
    const meetings = obj.meetings
      .filter((m): m is Meeting => !!m && typeof m === "object" && typeof (m as Meeting).id === "string")
      .map((m) => ({
        ...createMeeting(m.title ?? "", m.date ?? ""),
        ...m,
        id: m.id,
        title: typeof m.title === "string" ? m.title : "未命名会议",
        date: typeof m.date === "string" && m.date ? m.date : todayStr(),
        tags: Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === "string") : [],
        transcript: typeof m.transcript === "string" ? m.transcript : "",
        createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.now(),
        updatedAt: typeof m.updatedAt === "number" ? m.updatedAt : Date.now(),
        brief: m.brief && typeof m.brief === "object" ? m.brief : null,
        outline: m.outline && typeof m.outline === "object" ? m.outline : null,
        actions: Array.isArray(m.actions) ? m.actions : [],
        decisions: Array.isArray(m.decisions) ? m.decisions : [],
      }))
    const qaHistory = Array.isArray(obj.qaHistory)
      ? obj.qaHistory.filter((r): r is QaRecord => !!r && typeof r === "object" && typeof (r as QaRecord).id === "string")
      : []
    const providers =
      obj.providers && typeof obj.providers === "object" ? obj.providers : undefined
    const agents = obj.agents && typeof obj.agents === "object" ? obj.agents : undefined
    return {
      meetings,
      qaHistory,
      ...(providers ? { providers } : {}),
      ...(agents ? { agents } : {}),
    }
  } catch {
    return null
  }
}

export function parseBackupJson(text: string): BackupPayload | null {
  try {
    return validateBackupObject(JSON.parse(text))
  } catch {
    return null
  }
}

// 全库导出为一份 Markdown 合集：每场会议一段（各自带 YAML frontmatter），
// 任何文本编辑器 / 笔记软件都能直接读——导出即存储的天然形态。
export function exportAllMarkdown(data: StoreData): void {
  const sorted = [...data.meetings].sort((a, b) => b.date.localeCompare(a.date))
  const body = sorted.map((m) => buildMarkdown(m)).join("\n\n")
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `meeting-notes-all-${todayStr()}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 跨会议行动项清单导出：Markdown checkbox 格式（Obsidian / 任何笔记软件可直接勾选），
// 按会议分组，带负责人 / 截止日 / 逾期标注；这是行动项通向外部工具的统一交换格式。
export function downloadActionsMarkdown(meetings: Meeting[]): void {
  const lines: string[] = []
  lines.push("---")
  lines.push(`title: "行动项清单"`)
  lines.push(`exported_at: ${new Date().toISOString()}`)
  lines.push("---")
  lines.push("")
  lines.push("# 行动项清单")
  lines.push("")
  const withOpen = meetings.filter((m) => m.actions.some((a) => isOpenStatus(a.status) && a.content.trim()))
  if (withOpen.length === 0) {
    lines.push("当前没有未完成的行动项。")
  } else {
    const total = withOpen.reduce((n, m) => n + m.actions.filter((a) => isOpenStatus(a.status) && a.content.trim()).length, 0)
    lines.push(`共 ${total} 条未完成，来自 ${withOpen.length} 场会议。`)
    lines.push("")
    for (const m of withOpen) {
      lines.push(`## 《${m.title}》（${m.date}）`)
      lines.push("")
      for (const a of m.actions) {
        if (!isOpenStatus(a.status) || !a.content.trim()) continue
        const meta = [
          a.assignee && `负责人：${a.assignee}`,
          a.dueDate && `截止：${a.dueDate}`,
          a.status !== "open" && `状态：${actionStatusLabel(a.status)}`,
        ]
          .filter(Boolean)
          .join("　")
        const off = dueDayOffset(a.dueDate)
        const urgent = off !== null && off < 0 ? `　**已逾期 ${-off} 天**` : off === 0 ? "　**今天到期**" : ""
        lines.push(`- [ ] ${a.content}${meta ? `（${meta}）` : ""}${urgent}`)
      }
      lines.push("")
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `meeting-actions-${todayStr()}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 转写指纹 / 相似度 / 行解析已移至 textPure.ts（见文件上方再导出）

// ── 导入冲突处理：同一场会议（同 id，或标题+日期相同）再次导入时的三种策略 ──
export type ImportConflictStrategy = "merge" | "replace" | "copy"

function mergeActions(local: MeetingAction[], incoming: MeetingAction[]): MeetingAction[] {
  // 本地手动改过的条目最优先；其余按 content 去重取并集
  const out: MeetingAction[] = []
  const seen = new Set<string>()
  for (const a of [...local.filter((x) => x.editedByUser), ...local, ...incoming]) {
    const key = a.content.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

function mergeDecisions(local: MeetingDecision[], incoming: MeetingDecision[]): MeetingDecision[] {
  const out: MeetingDecision[] = []
  const seen = new Set<string>()
  for (const d of [...local.filter((x) => x.editedByUser), ...local, ...incoming]) {
    const key = d.content.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(d)
  }
  return out
}

// 合并导入：以本地条目为身份（id / 标题 / 日期不变），正文类字段取更新时间较新的一侧，
// 行动项与决议按内容去重取并集（本地手改过的优先）。
export function mergeMeetings(local: Meeting, incoming: Meeting): Meeting {
  const base = incoming.updatedAt > local.updatedAt ? incoming : local
  return {
    ...base,
    id: local.id,
    title: local.title,
    date: local.date,
    tags: [...new Set([...local.tags, ...incoming.tags])],
    actions: mergeActions(local.actions, incoming.actions),
    decisions: mergeDecisions(local.decisions, incoming.decisions),
    updatedAt: Date.now(),
  }
}

// ── 漂移感知信任：底层数据变了，基于旧数据的派生结论自动降信，不伪装成新鲜事实 ──

// 一场会议的「内容指纹时刻」：任一派生源（转写 / 摘要 / 抽取）最近一次变更时间。
// 比它旧的派生产物（问答答案、演进脉络等）应标记「可能过时」。
export function contentStamp(m: Meeting): number {
  return Math.max(
    m.transcriptUpdatedAt ?? 0,
    m.brief?.generatedAt ?? 0,
    m.outline?.generatedAt ?? 0,
    m.extractedAt ?? 0,
  )
}

// ── 漂移感知：按「出处引用存活率」判定，而不是「转写改没改过」──
// 改一两个错别字时，结论的 source_quote 仍逐字存在于原文，不该标「可能过时」；
// 只有引用缺失比例超过阈值（发生了实质改写）才降级结论。
// 阈值取 30%：低于它视为局部润色，高于它说明生成依据已大面积失效。
const STALE_MISSING_RATIO = 0.3

// 引用在当前生效文本（清洗稿优先，与生成管线同源）中的缺失比例；无可核对引用时视为全部缺失
function quoteMissingRatio(quotes: string[], m: Meeting): number {
  const real = quotes.filter((q) => q.trim())
  if (real.length === 0) return 1
  const text = m.cleaned || m.transcript
  const missing = real.filter((q) => !text.includes(q)).length
  return missing / real.length
}

// 摘要层是否过时：生成之后转写稿有实质改动（用户手改过的层是用户资产，不算漂移）
export function layerStale(
  m: Meeting,
  layer: { generatedAt: number; editedByUser: boolean } | null | undefined,
): boolean {
  if (!layer || layer.editedByUser) return false
  const t = m.transcriptUpdatedAt ?? 0
  if (!(t > 0 && t > layer.generatedAt)) return false
  // 转写确实变过：再看事实层引用的存活率，引用都还在 = 小修小补，不标过时
  return quoteMissingRatio((m.facts ?? []).map((f) => f.sourceQuote), m) >= STALE_MISSING_RATIO
}

// 抽取结果是否过时：抽取之后转写稿有实质改动（未确认条目的引用缺失率超阈值）
export function extractionStale(m: Meeting): boolean {
  if (!m.extractedAt) return false
  const t = m.transcriptUpdatedAt ?? 0
  if (t === 0 || t <= m.extractedAt) return false
  const uneditedQuotes = [
    ...m.actions.filter((a) => !a.editedByUser).map((a) => a.sourceQuote),
    ...m.decisions.filter((d) => !d.editedByUser).map((d) => d.sourceQuote),
  ]
  if (uneditedQuotes.length === 0) return false // 全部条目已被用户确认过，以人工版本为准
  return quoteMissingRatio(uneditedQuotes, m) >= STALE_MISSING_RATIO
}

// ── 信息量画像（记忆巩固的分级依据，纯本地规则、免费、实时计算不落盘）──
// 区分「高产出会议」（有决议/行动项/议题结构）与「低产出会议」（纯同步、无产出）：
// 后者是归档建议的对象——保留摘要与可检索性，把全文让出注意力。
export interface InfoProfile {
  score: number
  level: "high" | "medium" | "low"
  reasons: string[]
}

export function meetingInfoProfile(m: Meeting): InfoProfile {
  const reasons: string[] = []
  let score = 0
  if (m.decisions.length > 0) {
    score += 3
    reasons.push(`${m.decisions.length} 条决议`)
  }
  const acts = m.actions.filter((a) => a.content.trim())
  const open = acts.filter((a) => isOpenStatus(a.status)).length
  if (acts.length > 0) {
    score += 2
    reasons.push(`${acts.length} 条行动项${open > 0 ? `（${open} 条未完成）` : ""}`)
  }
  const topics = m.outline?.topics.length ?? 0
  if (topics > 0) {
    score += 2
    reasons.push(`${topics} 个议题`)
  }
  const notes = m.notes?.length ?? 0
  if (notes > 0) {
    score += 1
    reasons.push(`${notes} 条随手记`)
  }
  if (m.transcript.trim().length >= 2000) {
    score += 1
    reasons.push("转写超 2000 字")
  }
  const empty = m.transcript.trim().length < 20
  const level: InfoProfile["level"] = empty || score <= 1 ? "low" : score >= 4 ? "high" : "medium"
  return { score, level, reasons: reasons.length > 0 ? reasons : ["无决议 / 行动项产出"] }
}
