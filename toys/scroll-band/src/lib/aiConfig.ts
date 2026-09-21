// Standalone AI configuration (primary + fallback providers).
//
// Defaults point at Agnes AI. If a request to the primary fails, the call
// automatically degrades to the BigModel fallback. Every value is overridable
// via AI_* env vars (see .env.example). When no API key is present, calls
// return { ok:false } (never throw) so the UI degrades gracefully.
//
//   AI_BASE_URL=https://api.agnes-ai.cn/v1
//   AI_API_KEY=sk-...
//   AI_MODEL=agnes-2.5-flash
//   AI_FALLBACK_BASE_URL=https://open.bigmodel.cn/api/paas/v4
//   AI_FALLBACK_API_KEY=
//   AI_FALLBACK_MODEL=glm-4.7-flash

export interface ChatOptions {
  signal?: AbortSignal
  temperature?: number
  max_tokens?: number
}

interface Provider {
  base: string
  key: string
  model: string
}

const PRIMARY: Provider = {
  base: (import.meta.env.AI_BASE_URL ?? "https://api.agnes-ai.cn/v1").trim(),
  key: (import.meta.env.AI_API_KEY ?? "").trim(),
  model: (import.meta.env.AI_MODEL ?? "agnes-2.5-flash").trim(),
}

const FALLBACK: Provider = {
  base: (import.meta.env.AI_FALLBACK_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4").trim(),
  key: (import.meta.env.AI_FALLBACK_API_KEY ?? "").trim(),
  model: (import.meta.env.AI_FALLBACK_MODEL ?? "glm-4.7-flash").trim(),
}

export const aiBaseUrl = PRIMARY.base
export const aiModel = PRIMARY.model
/** True when the primary provider has a usable key. */
export const aiEnabled = Boolean(PRIMARY.base && PRIMARY.key)
/** True when a fallback provider key is configured. */
export const aiFallbackEnabled = Boolean(FALLBACK.base && FALLBACK.key)

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ChatResult {
  ok: boolean
  text: string
  error?: string
  status?: number
  /** Which provider served the response. */
  provider?: "primary" | "fallback"
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function complete(p: Provider, messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
  const url = `${p.base.replace(/\/+$/, "")}/chat/completions`
  // Retry only on HTTP 429 (rate limit) with linear backoff. Shared by both
  // primary and fallback because chat() routes every call through here.
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${p.key}`,
        },
        body: JSON.stringify({
          model: p.model,
          messages,
          temperature: opts?.temperature,
          max_tokens: opts?.max_tokens,
        }),
        signal: opts?.signal,
      })
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
        }
        const msg = data?.choices?.[0]?.message
        // Reasoning models (e.g. glm-4.7-flash) may leave content empty and put
        // the answer in reasoning_content; fall back so we never return blank.
        const text = (msg?.content?.trim() || msg?.reasoning_content?.trim() || "").trim()
        return { ok: true, text }
      }
      if (res.status === 429 && attempt < maxAttempts) {
        await sleep(500 * attempt)
        continue
      }
      return { ok: false, text: "", error: `HTTP ${res.status}`, status: res.status }
    } catch (e) {
      const err = e as { name?: string }
      if (err?.name === "AbortError") return { ok: false, text: "", error: "aborted" }
      return { ok: false, text: "", error: String((e as Error)?.message || e) }
    }
  }
  return { ok: false, text: "", error: "retry_exhausted" }
}

/**
 * Single-shot chat completion with automatic primary→fallback degradation.
 * Never throws; returns { ok:false } so callers can degrade gracefully.
 */
export async function chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
  if (!aiEnabled) {
    return { ok: false, text: "", error: "ai_not_configured" }
  }
  const primary = await complete(PRIMARY, messages, opts)
  if (primary.ok) return { ...primary, provider: "primary" }
  if (aiFallbackEnabled) {
    const fb = await complete(FALLBACK, messages, opts)
    if (fb.ok) return { ...fb, provider: "fallback" }
  }
  return primary
}
