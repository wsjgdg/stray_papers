import { getActiveLlm } from "./providers"

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

// 可用模型清单：委托给当前生效的 LLM Provider（默认 OpenAI 兼容接口）。
// Provider 未实现 listModels 时回退到空数组，settings 面板会退到内置候选（DEFAULT_MODEL + 降级链）。
export async function listLlmModels(): Promise<LlmModelInfo[]> {
  try {
    const llm = getActiveLlm()
    if (typeof llm.listModels === "function") return await llm.listModels()
  } catch {
    // 忽略异常，走下面兜底
  }
  return []
}
