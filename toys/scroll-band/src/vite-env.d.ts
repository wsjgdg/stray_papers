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
   * 讯飞开放平台（iFlytek）TTS 密钥，用于「讯飞云端」朗读引擎（每日 500 次免费）。
   * 与聊天密钥一样出现在浏览器包里——仅适合自用，别用生产账号。
   */
  readonly AI_XFYUN_APPID?: string
  readonly AI_XFYUN_API_KEY?: string
  readonly AI_XFYUN_API_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
