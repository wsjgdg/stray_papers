// 滚动乐团 · LLM 调用层（本地 OpenAI 兼容实现，零 RunningHub 依赖）
//
// 原 VibeX 版走 PocketBase /api/llm/chat|poll 异步任务路由；现改为直接调用
// 任意 OpenAI 兼容的 /chat/completions 端点（见 lib/aiConfig.ts）。未配置
// AI_BASE_URL / AI_API_KEY 时优雅降级，返回 ai_not_configured。
import { aiEnabled, chat, type ChatMessage } from "./aiConfig"

export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export interface LlmMessage {
  role: "system" | "user" | "assistant"
  content: string | LlmContentPart[]
}

export interface LlmCallOptions {
  messages: LlmMessage[]
  page?: string
  max_tokens?: number
  temperature?: number
  signal?: AbortSignal
  request_id?: string
}

export interface LlmCallResult {
  ok: boolean
  status: "success" | "failed" | "running" | "pending" | "not_found"
  text: string
  error?: string
  model?: string
  usage?: unknown
  needsLogin?: boolean
}

export interface LlmModelInfo {
  model: string
  rh_model_id: string
  max_tokens: number
  timeout_s: number
  supports_temperature: boolean
}

const NOT_CONFIGURED: LlmCallResult = {
  ok: false,
  status: "failed",
  text: "",
  error: "ai_not_configured",
}

// 把 LlmMessage 归一成 OpenAI 兼容的纯文本消息。
function toChatMessages(messages: LlmMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((p) => (p.type === "text" ? p.text : "[image]")).join("\n"),
  }))
}

export async function callLlmWithFallback(modelName: string, opts: LlmCallOptions): Promise<LlmCallResult> {
  if (!aiEnabled) return NOT_CONFIGURED
  const r = await chat(toChatMessages(opts.messages), {
    signal: opts.signal,
    temperature: opts.temperature,
    max_tokens: opts.max_tokens,
  })
  if (!r.ok) {
    return { ok: false, status: "failed", text: "", error: r.error || "ai_error" }
  }
  return {
    ok: true,
    status: "success",
    text: r.text,
    model: modelName,
  }
}

export async function listLlmModels(): Promise<LlmModelInfo[]> {
  if (!aiEnabled) return []
  return [
    {
      model: (import.meta.env.AI_MODEL || "default").trim() || "default",
      rh_model_id: "",
      max_tokens: 4096,
      timeout_s: 60,
      supports_temperature: true,
    },
  ]
}
