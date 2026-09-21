/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Primary OpenAI-compatible chat completions base URL, e.g. https://api.agnes-ai.cn/v1 */
  readonly AI_BASE_URL?: string
  /** API key for the primary endpoint */
  readonly AI_API_KEY?: string
  /** Model name used for chat/agent calls */
  readonly AI_MODEL?: string
  /** Fallback provider base URL (used automatically if the primary fails) */
  readonly AI_FALLBACK_BASE_URL?: string
  /** Fallback provider API key */
  readonly AI_FALLBACK_API_KEY?: string
  /** Fallback provider model name */
  readonly AI_FALLBACK_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
