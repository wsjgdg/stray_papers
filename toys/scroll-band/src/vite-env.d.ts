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
  /**
   * Azure Speech resource key (for the optional cloud TTS engine).
   * Unlike the chat key, this one is read at runtime in the browser bundle — fine for a
   * personal, zero-backend app, but do not commit a production key you care about.
   */
  readonly AI_SPEECH_KEY?: string
  /** Azure Speech resource region, e.g. eastasia / westus2 */
  readonly AI_SPEECH_REGION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
