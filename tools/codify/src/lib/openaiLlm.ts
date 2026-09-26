// OpenAI 兼容大模型 Provider：让本工具脱离 RunningHub 平台后仍能正常生成纪要。
//
// 设计意图（见 providers.ts 头注释）：原平台把 LLM 通道绑定到 RunningHub 计费代理
// （runtime: cloud，经 PocketBase /api/llm/* 转发）。自托管 / fork 后只需按 LlmProvider
// 契约注册一个外部实现即可生效——本文件就是这个实现。
//
// 它直接请求任意「OpenAI 兼容」的 /v1/chat/completions 接口：
//   - OpenAI 官方（api.openai.com/v1）
//   - 本地推理服务（Ollama / LM Studio / vLLM，监听本机端口并开启 CORS）
//   - 任意自托管网关（One API、LiteLLM、OpenRouter 等）
//
// 浏览器直连第三方接口存在 CORS 限制——OpenAI 官方接口不允许浏览器跨域调用，
// 因此「官方直连」需经用户自建的 CORS 代理 / 网关；本地推理服务与大多数网关默认允许跨域，
// 可直接填本地地址。这条约束与平台时代一致（平台也是服务端代发），并非本实现引入。

import type { LlmProvider } from "@/lib/providers"
import { getProviderConfig } from "@/lib/providers"
import type { LlmCallResult, LlmMessage, LlmModelInfo } from "@/lib/llm"

const DEFAULT_BASE_URL = "https://api.openai.com/v1"
const DEFAULT_MODEL = "gpt-4o-mini"
const DEFAULT_TEMPERATURE = 0.3
// 非流式一次性取回：本地小模型很快，云端可能数十秒；留足余量避免误杀长稿。
const CHAT_TIMEOUT_MS = 180_000

function toOpenAiMessages(messages: LlmMessage[]): { role: string; content: string }[] {
  return messages.map((m) => {
    let content: string
    if (typeof m.content === "string") {
      content = m.content
    } else {
      // 多模态分段（图）在纯文本纪要管线里不会出现；只抽取文本部分拼接。
      content = m.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n")
    }
    return { role: m.role, content }
  })
}

export const openaiCompatibleLlm: LlmProvider = {
  meta: {
    id: "openai-compatible",
    name: "OpenAI 兼容接口",
    kind: "llm",
    runtime: "cloud",
    description:
      "直接请求任意 OpenAI 兼容的 /v1/chat/completions：OpenAI 官方、本地 Ollama/LM Studio、One API/LiteLLM 等网关都可用。浏览器直连官方接口受 CORS 限制，需经自建代理或网关；本地推理服务默认允许跨域。模型名（如 gpt-4o-mini、deepseek-chat、本地 llama3）填在上方「AI 模型」里",
    configSchema: [
      {
        key: "baseUrl",
        label: "接口地址",
        type: "string",
        default: DEFAULT_BASE_URL,
        placeholder: "https://api.openai.com/v1 或 http://127.0.0.1:8000/v1",
        help: "必须以 /v1 结尾（或该网关的 chat/completions 前缀）。本地服务需开启 CORS",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        default: "",
        placeholder: "留空 = 不发 Authorization（部分本地服务不需要）",
        help: "本地无需鉴权的服务可留空；密钥只存本机 localStorage，随备份导出时默认剔除",
      },
      {
        key: "temperature",
        label: "温度",
        type: "number",
        default: DEFAULT_TEMPERATURE,
        min: 0,
        max: 2,
        step: 0.1,
      },
    ],
  },
  supported: () => true,
  // 模型名来自全局「AI 模型」设置（或各 Agent 单独指定的模型），不在这里二次配置，
  // 避免两处模型输入相互打架；config.model 仅作终极兜底（全局为空时）。
  chat(model: string, messages: LlmMessage[], _page: string): Promise<LlmCallResult> {
    const cfg = getProviderConfig("llm", "openai-compatible")
    const baseUrl = (typeof cfg.baseUrl === "string" && cfg.baseUrl.trim()) || DEFAULT_BASE_URL
    const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey.trim() : ""
    const temperature =
      typeof cfg.temperature === "number" && cfg.temperature >= 0 && cfg.temperature <= 2
        ? cfg.temperature
        : DEFAULT_TEMPERATURE
    const effectiveModel = model && model.trim() ? model.trim() : DEFAULT_MODEL

    const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS)

    return fetch(url, {
      method: "POST",
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model: effectiveModel,
        messages: toOpenAiMessages(messages),
        temperature,
      }),
    })
      .then(async (res): Promise<LlmCallResult> => {
        window.clearTimeout(timer)
        const data = (await res.json().catch(() => null)) as
          | { choices?: { message?: { content?: string } }[]; usage?: unknown; error?: { message?: string } }
          | null
        if (!res.ok) {
          const msg = data?.error?.message || `HTTP ${res.status}`
          return { ok: false, status: "failed", text: "", error: msg }
        }
        const text = data?.choices?.[0]?.message?.content ?? ""
        return {
          ok: text.length > 0,
          status: text.length > 0 ? "success" : "failed",
          text,
          error: text.length > 0 ? undefined : "empty_response",
          model: effectiveModel,
          ...(data?.usage ? { usage: data.usage } : {}),
        }
      })
      .catch((err: unknown): LlmCallResult => {
        window.clearTimeout(timer)
        const aborted = err instanceof DOMException && err.name === "AbortError"
        return {
          ok: false,
          status: "failed",
          text: "",
          error: aborted ? "timeout" : "network",
        }
      })
  },
  // 连接测试 / 模型下拉清单：返回当前配置指向的接口说明里不会触发真实计费；
  // 这里只回显全局 AI 模型名，让设置面板的「可用模型」与下拉一致（真实连通性在首次生成时验证）。
  listModels(): Promise<LlmModelInfo[]> {
    const cfg = getProviderConfig("llm", "openai-compatible")
    const model =
      (typeof cfg.model === "string" && cfg.model.trim()) ||
      DEFAULT_MODEL
    return Promise.resolve([
      {
        model,
        rh_model_id: model,
        max_tokens: 0,
        timeout_s: Math.round(CHAT_TIMEOUT_MS / 1000),
        supports_temperature: true,
      },
    ])
  },
}
