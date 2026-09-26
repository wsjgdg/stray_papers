// 多 Agent 协作层（工作流编排）：把「一个模型提示词包打天下」拆成五个认知模式不同的专项 Agent——
// 摘要 Agent 管分层归纳（概括能力）、抽取 Agent 管结构化抽取与判定（精确性 + Schema 约束 + 出处校验）、
// 检索 Agent 管语义搜索与跨会议问答（检索与推理）、标注 Agent 管补标点与说话人推断（上下文理解 + 表层处理）、
// 翻译 Agent 管整稿跨语言转述（忠实性 + 结构保留）。
//
// 每个 Agent 拥有：
// - 自己的角色章程（charter）：注入各自 LLM 调用的 system prompt，认知模式互不串味；
// - 独立模型配置：默认跟随全局首选，可单独指定（摘要用强模型、标注用快模型等）；
// - 用户自定义附加指令（extraPrompt）：不改代码即可调整某个 Agent 的行为；
// - 自己的「不确定性策略」（reviewThreshold）：低于门槛的产出不直接生效，
//   先扣进人工确认队列 / 默认不勾选——Agent 拿不准时主动请人拍板，而不是幻觉硬写。
//
// 用户不需要感知 Agent 的存在（各调用点自动路由），但可在设置页逐个调整。
// 配置存 localStorage，随全库备份导出。

export type AgentRole = "summary" | "extract" | "retrieve" | "annotate" | "translate"

export interface AgentSpec {
  role: AgentRole
  label: string
  duty: string // 设置页展示的一句话职责
  charter: string // 注入 system prompt 的角色章程
  extraPlaceholder: string // 附加指令输入框的示例提示
}

export const AGENT_SPECS: AgentSpec[] = [
  {
    role: "summary",
    label: "摘要 Agent",
    duty: "分层摘要、议题归纳、系列演进脉络、流程主题聚类——需要概括能力的任务",
    charter:
      "你是会议档案工作流中的「摘要 Agent」，专精分层归纳：先抓整体结论，再按议题骨架组织细节；压缩信息时保留具体数字、名称与时间，绝不编造原文没有的内容。",
    extraPlaceholder: "示例：要点尽量短句；每场会必须点出风险与依赖…",
  },
  {
    role: "extract",
    label: "抽取 Agent",
    duty: "行动项 / 决议 / 实体抽取、历史行动项跟进判定——需要精确性与结构化输出的任务",
    charter:
      "你是会议档案工作流中的「抽取 Agent」，专精结构化抽取：只认原文证据，严格按给定 JSON Schema 输出；把握不足时如实给低置信度、交人工复核，绝不为了凑数输出臆测条目。",
    extraPlaceholder: "示例：客户承诺与我方承诺必须分开抽取；日期一律换算成 YYYY-MM-DD…",
  },
  {
    role: "retrieve",
    label: "检索 Agent",
    duty: "跨会议问答、语义找会——需要检索与推理的任务",
    charter:
      "你是会议档案工作流中的「检索 Agent」，专精检索与推理：按语义而非字面匹配，跨会议串联证据链，每个结论都指明出处；资料里找不到就直说找不到，禁止编造。",
    extraPlaceholder: "示例：回答先给结论再给依据；涉及金额时列出各次会议的口径差异…",
  },
  {
    role: "annotate",
    label: "标注 Agent",
    duty: "补标点分段、说话人推断——需要上下文理解的表层处理任务",
    charter:
      "你是会议档案工作流中的「标注 Agent」，专精上下文理解与表层处理：只做有依据的标点分段与说话人推断，绝不改动实质内容；拿不准就给低置信度，交人确认。",
    extraPlaceholder: "示例：技术讨论段落保留英文术语原样；称呼「王工」统一标注为 老王…",
  },
  {
    role: "translate",
    label: "翻译 Agent",
    duty: "转写稿整稿翻译——跨语言忠实转述，保留时间戳与说话人标注结构",
    charter:
      "你是会议档案工作流中的「翻译 Agent」，专精跨语言忠实转述：只翻译原文说了的内容，数字、日期、名称与承诺含义一字不差；结构标记（时间戳、说话人、分行）原样保留；歧义处选最保守的译法，绝不增删或润色出原文没有的信息。",
    extraPlaceholder: "示例：专业术语保留英文原文并括注；人名用拼音直译…",
  },
]

export const AGENT_LABELS: Record<AgentRole, string> = {
  summary: "摘要 Agent",
  extract: "抽取 Agent",
  retrieve: "检索 Agent",
  annotate: "标注 Agent",
  translate: "翻译 Agent",
}

// 账本里的调用类型 → 归属 Agent（用量统计「按 Agent 聚合」用；旧账本记录也按此归组）
export const AGENT_OF_KIND: Record<string, AgentRole> = {
  summary: "summary",
  facts: "summary",
  review: "summary",
  evolution: "summary",
  insight: "summary",
  eval: "summary",
  extract: "extract",
  entities: "extract",
  digest: "extract",
  support: "extract",
  ask: "retrieve",
  find: "retrieve",
  polish: "annotate",
  infer: "annotate",
  translate: "translate",
}

export interface AgentConfig {
  model: string // "" = 跟随全局首选模型
  extraPrompt: string // 用户自定义附加指令（"" = 无）
  // 不确定性门槛（Human-in-the-Loop）：
  // - extract：抽取置信度低于此值的条目不直接生效，扣进「待人工确认」队列（0 = 不扣，沿用低置信标注）
  // - annotate：说话人建议置信度低于此值的默认不勾选（审阅面板「待确认」线）
  // - summary / retrieve / translate：产出即结果、无处可扣，保留字段为 0
  reviewThreshold: number
}

export const DEFAULT_AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  summary: { model: "", extraPrompt: "", reviewThreshold: 0 },
  extract: { model: "", extraPrompt: "", reviewThreshold: 0.7 },
  retrieve: { model: "", extraPrompt: "", reviewThreshold: 0 },
  annotate: { model: "", extraPrompt: "", reviewThreshold: 0.6 },
  translate: { model: "", extraPrompt: "", reviewThreshold: 0 },
}

export type AgentsConfig = Record<AgentRole, AgentConfig>

import { vaultGetItem, vaultSetItem } from "@/lib/vault"

const AGENTS_KEY = "meeting-notes-agents-v1"

// 宽容清洗：任意来源（localStorage / 备份文件）的配置逐字段校验回默认值，坏字段不传染
export function sanitizeAgentsConfig(input: unknown): AgentsConfig {
  const out: AgentsConfig = {
    summary: { ...DEFAULT_AGENT_CONFIGS.summary },
    extract: { ...DEFAULT_AGENT_CONFIGS.extract },
    retrieve: { ...DEFAULT_AGENT_CONFIGS.retrieve },
    annotate: { ...DEFAULT_AGENT_CONFIGS.annotate },
    translate: { ...DEFAULT_AGENT_CONFIGS.translate },
  }
  const parsed = (input && typeof input === "object" ? input : {}) as Partial<
    Record<AgentRole, Partial<AgentConfig>>
  >
  for (const spec of AGENT_SPECS) {
    const p = parsed[spec.role]
    if (!p || typeof p !== "object") continue
    out[spec.role] = {
      model: typeof p.model === "string" ? p.model : "",
      extraPrompt: typeof p.extraPrompt === "string" ? p.extraPrompt.slice(0, 500) : "",
      reviewThreshold:
        typeof p.reviewThreshold === "number" && p.reviewThreshold >= 0 && p.reviewThreshold <= 1
          ? p.reviewThreshold
          : DEFAULT_AGENT_CONFIGS[spec.role].reviewThreshold,
    }
  }
  return out
}

export function loadAgentsConfig(): AgentsConfig {
  try {
    const raw = vaultGetItem(AGENTS_KEY)
    if (!raw) return sanitizeAgentsConfig(null)
    return sanitizeAgentsConfig(JSON.parse(raw))
  } catch {
    // 配置损坏回默认，不阻塞业务
    return sanitizeAgentsConfig(null)
  }
}

export function saveAgentsConfig(cfg: AgentsConfig): void {
  try {
    vaultSetItem(AGENTS_KEY, JSON.stringify(cfg))
  } catch {
    // ignore
  }
}

// 每个 Agent 的生效模型：单独指定优先，否则跟随全局首选（降级链不变）
export function resolveAgentModel(cfg: AgentsConfig, role: AgentRole, globalModel: string): string {
  return cfg[role].model.trim() || globalModel
}

// 组装 system prompt：角色章程 + 任务本身的系统指令 + 用户附加指令。
// 附加指令优先级最高，但不得突破「禁止编造」类铁律——章程在前定调，任务约束居中，用户意图收尾。
export function buildAgentSystem(role: AgentRole, base: string, extraPrompt?: string): string {
  const charter = AGENT_SPECS.find((s) => s.role === role)?.charter ?? ""
  const extra = extraPrompt?.trim()
    ? `\n用户的附加指令（在不违反上述「禁止编造 / 只依据原文」铁律的前提下优先满足）：${extraPrompt.trim()}`
    : ""
  return `${charter}\n${base}${extra}`
}
