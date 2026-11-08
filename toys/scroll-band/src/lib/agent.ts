// 滚动乐团 · AI 指挥台 Agent 调用层（本地 OpenAI 兼容实现，零 RunningHub 依赖）
//
// 原 VibeX 版走 PocketBase /api/agents/<slug>/run|poll 的异步任务轮询；现改为
// 单次 OpenAI 兼容 /chat/completions 调用。未配置 AI 环境变量时抛出清晰的
// "未配置" 错误，由 ConductorPanel 捕获并展示离线提示。
import { aiEnabled, chat } from "./aiConfig"

export interface AgentUpdate {
  status: "running" | "success" | "failed"
  text: string
  sessionId?: string
  error?: string
}

export interface AgentRunResult {
  sessionId?: string
  finalText: string
}

export interface AgentRunOptions {
  sessionId?: string
  /** 访客已确认超额后走按量付费；本地离线模式忽略。 */
  paidConsent?: boolean
}

/** 免费额度耗尽（保留以便兼容现有 UI 错误分支）。 */
export class AgentPaidConsentRequiredError extends Error {
  readonly code: string
  readonly detail: Record<string, unknown>

  constructor(code: string, message: string, detail: Record<string, unknown> = {}) {
    super(message)
    this.name = "AgentPaidConsentRequiredError"
    this.code = code
    this.detail = detail
  }
}

export function isAgentPaidConsentRequiredError(err: unknown): err is AgentPaidConsentRequiredError {
  return err instanceof AgentPaidConsentRequiredError
}

// 各指挥台 slug 对应的系统提示词；按需扩展。未列出时走通用音乐助手提示。
const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  conductor:
    "你是一位专业的音乐创作指挥。根据用户的描述，给出具体、可执行的编曲/混音/动机发展建议，语言简洁。",
}

export function getAgentsApiBase(): string {
  return import.meta.env.AI_BASE_URL ?? ""
}

/**
 * 跑一轮 agent。本地实现为单次对话调用，结果通过 onUpdate 回调一次性回传终态文本。
 * 签名与原 VibeX 版保持一致，调用方无需改动。
 */
export async function runAgent(
  slug: string,
  input: string,
  onUpdate?: (ev: AgentUpdate) => void,
  sessionIdOrOptions?: string | AgentRunOptions,
): Promise<AgentRunResult> {
  const options: AgentRunOptions =
    typeof sessionIdOrOptions === "string"
      ? { sessionId: sessionIdOrOptions }
      : sessionIdOrOptions || {}
  const sessionId = options.sessionId

  if (!aiEnabled) {
    throw new Error(
      "AI 指挥台未配置：在项目根目录 .env 设置 AI_BASE_URL 与 AI_API_KEY 后即可使用。",
    )
  }

  onUpdate?.({ status: "running", text: "", sessionId })

  const system = AGENT_SYSTEM_PROMPTS[slug] ?? "你是一位音乐创作助手，回答要具体、可执行、简洁。"
  const r = await chat([
    { role: "system", content: system },
    { role: "user", content: input },
  ])

  if (!r.ok) {
    onUpdate?.({ status: "failed", text: "", sessionId, error: r.error || "ai_error" })
    throw new Error(r.error || "AI 请求失败")
  }

  onUpdate?.({ status: "success", text: r.text, sessionId })
  return { sessionId, finalText: r.text }
}
