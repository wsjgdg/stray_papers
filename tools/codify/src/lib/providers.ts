// Provider 体系：语音识别（ASR）/ 语音合成（TTS）/ 大模型（LLM）/ 翻译四类能力的统一抽象与注册表。
//
// 设计原则：
// - Provider = 代码里注册的对象，不做动态加载 / 沙箱 / manifest 插件系统；
//   扩展 = 新增一个实现文件 + 注册进列表，设置页按 configSchema 自动渲染表单，UI 零改动。
// - 所有配置项有默认值，老用户无感知；配置存 localStorage，随全库备份导出、导入时恢复。
// - 所有调用点走 getActive*()，不直接 new 具体实现；
//   window.speechSynthesis / new SpeechRecognition() 只允许出现在本文件的实现内部。
// - runtime 标记（local/cloud）驱动 UI 隐私与计费提示，每次调用可溯源。
//
// 平台边界（如实说明）：本运行环境的页面不能直连任意第三方 http(s) 接口，
// 因此「填 baseUrl + apiKey 的 OpenAI-compatible / 云端 Whisper / edge-tts」这类
// 外部 Provider 无法在此环境出货；LLM 绑定平台授权计费通道（runtime: cloud，按 token 计费）。
// 注册表与 configSchema 已按通用契约预留位置——自托管部署或 fork 后按接口注册云端 Provider 即可生效。

import { type LlmCallResult, type LlmMessage, type LlmModelInfo } from "@/lib/llm"
import { openaiCompatibleLlm } from "@/lib/openaiLlm"
import type { TokenUsage } from "@/lib/usageLog"
import { vaultGetItem, vaultSetItem } from "@/lib/vault"

// ── 通用信封 ──

export type ProviderKind = "asr" | "tts" | "llm" | "embed" | "translate"
export type ProviderRuntime = "local" | "cloud"

export interface ConfigField {
  key: string
  label: string
  type: "string" | "password" | "number" | "boolean" | "select"
  required?: boolean
  default?: string | number | boolean
  placeholder?: string
  options?: { label: string; value: string | number }[]
  /** select 专用：选项在运行时通过 TtsProvider.listVoices() 动态获取 */
  dynamic?: "voices"
  help?: string
  min?: number
  max?: number
  step?: number
}

export interface ProviderMeta {
  id: string
  name: string
  kind: ProviderKind
  runtime: ProviderRuntime
  description: string
  configSchema: ConfigField[]
}

export interface ProviderInstanceConfig {
  [key: string]: string | number | boolean | undefined
}

// ── ASR（语音 → 文字）──

export interface AsrSegment {
  text: string
  startMs: number // 相对本次录音起点的毫秒（Web Speech 不提供词级时间，取上一句定稿到本句定稿的区间）
  endMs: number
  /** 自动说话人分离（diarization）预留位：引擎能区分人声时填名字/编号，浏览器识别恒为空（手动点选） */
  speaker?: string
}

/** 批量转写（音频文件上传）的产出段：时间戳与说话人可选，缺省时按纯文本行处理 */
export interface AsrTranscriptSegment {
  text: string
  speaker?: string
  startMs?: number
  endMs?: number
}

export interface AsrStream {
  /** 用户主动停止；停止后不会再触发任何回调 */
  stop: () => void
}

/**
 * 每次启动识别的动态选项（与持久化的 ProviderInstanceConfig 分开：配置是用户设置，
 * 这里是调用方按现场算出来的上下文）。
 * contextText：热词/背景上下文——Whisper 系实现拿它当 initial_prompt 做热词偏置
 * （模型将其视为「刚刚听到的内容」，专有名词识别向词表靠拢）；
 * Web Speech API 没有上下文注入口，浏览器识别实现如实忽略，不假装生效。
 */
export interface AsrStartOptions {
  contextText?: string
}

export interface AsrStreamHandlers {
  /** 未定稿的预听文字（每次给全量，直接替换显示） */
  onPartial: (text: string) => void
  onFinal: (seg: AsrSegment) => void
  /** 面向用户的错误文案（权限 / 网络等致命错误，触发后识别即停止） */
  onError: (message: string) => void
  /** 底层识别每断开一次就触发（可能是静音超时后的自动续接，用于清空预听文字） */
  onIdle?: () => void
  /** 识别彻底停止（用户 stop 或致命错误之后），且不会再自动续接 */
  onStopped: () => void
}

export interface AsrProvider {
  meta: ProviderMeta
  supported: () => boolean
  /** 启动流式识别；不支持或启动失败返回 null（失败原因已通过 onError 抛出） */
  startStream: (
    handlers: AsrStreamHandlers,
    config: ProviderInstanceConfig,
    opts?: AsrStartOptions,
  ) => AsrStream | null
  /**
   * 批量转写（音频文件上传）——可选能力位。
   * 本环境没有可注册的实现（无 ASR 模型、外部 API 不可达），UI 只在
   * getAsrBatchProvider() 非空时才显示上传入口；fork / 自托管实现本方法并注册即自动出现。
   */
  transcribe?: (
    audio: Blob,
    opts?: {
      language?: string
      onProgress?: (ratio: number) => void
      signal?: AbortSignal
      /** 热词/背景上下文（同 AsrStartOptions.contextText，Whisper 系实现当 initial_prompt） */
      contextText?: string
    },
  ) => Promise<AsrTranscriptSegment[]>
}

const ASR_ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "麦克风权限被拒绝，请在浏览器地址栏的权限设置里允许麦克风后重试",
  "service-not-allowed": "浏览器语音服务不可用，请检查网络，或改用 Chrome / Edge 浏览器",
  network: "语音识别网络异常，请检查网络后重试",
}

function webSpeechSupported(): boolean {
  if (typeof window === "undefined") return false
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export const webSpeechAsr: AsrProvider = {
  meta: {
    id: "browser-webspeech",
    name: "浏览器实时识别",
    kind: "asr",
    runtime: "local",
    description:
      "Web Speech API 实时麦克风识别，免费、无需配置；仅 Chrome / Edge 支持。注意：音频由浏览器送到其厂商的语音服务器识别，并非纯本机推理",
    configSchema: [
      {
        key: "lang",
        label: "识别语言",
        type: "select",
        default: "zh-CN",
        options: [
          { label: "中文（普通话）", value: "zh-CN" },
          { label: "中文（粤语）", value: "zh-HK" },
          { label: "英语", value: "en-US" },
          { label: "日语", value: "ja-JP" },
        ],
      },
    ],
  },
  supported: webSpeechSupported,
  // Web Speech API 没有上下文注入口：AsrStartOptions.contextText 到这里被如实忽略
  //（浏览器识别无法做热词偏置；词表改在转写整理阶段由 AI 参照校正，见 lib/hotwords.ts）
  startStream(handlers, config) {
    if (!webSpeechSupported()) return null
    const w = window as unknown as Record<string, new () => unknown>
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new Ctor() as any
    rec.lang = typeof config.lang === "string" && config.lang ? config.lang : "zh-CN"
    rec.continuous = true
    rec.interimResults = true

    // 用户是否还想继续听：浏览器静音超时自动断开时据此静默续接
    let want = true
    let stopped = false
    const startedAt = performance.now()
    let lastFinalMs = 0
    const finish = () => {
      if (stopped) return
      stopped = true
      want = false
      handlers.onStopped()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let partial = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const text = String(result[0]?.transcript ?? "").trim()
        if (!text) continue
        if (result.isFinal) {
          const endMs = Math.round(performance.now() - startedAt)
          handlers.onFinal({ text, startMs: lastFinalMs, endMs })
          lastFinalMs = endMs
        } else {
          partial += text
        }
      }
      if (partial) handlers.onPartial(partial)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const msg = ASR_ERROR_MESSAGES[String(e?.error)]
      if (!msg) return // no-speech / aborted 属正常静默，不打扰用户
      finish()
      handlers.onError(msg)
    }

    rec.onend = () => {
      handlers.onIdle?.()
      if (want) {
        // Chrome 长时间静音会自动断开，用户没点停止就静默续接
        try {
          rec.start()
        } catch {
          finish()
        }
      } else {
        finish()
      }
    }

    try {
      rec.start()
    } catch {
      want = false
      handlers.onError("语音识别启动失败，请刷新页面后重试")
      return null
    }

    return {
      stop: () => {
        if (stopped) return
        want = false
        try {
          rec.stop()
        } catch {
          // 已停止时重复调用会抛错，忽略；onend 不会再来就直接收尾
          finish()
        }
      },
    }
  },
}

// ── TTS（文字 → 语音）──

export interface TtsVoice {
  id: string
  name: string
  language: string
}

/** 合成音频产物（外部 TTS 引擎用）：拿到 Blob 可自行播放 / 下载 / 随备份归档 */
export interface TtsAudio {
  audio: Blob
  mimeType: string
}

export interface TtsSpeakOptions {
  lang?: string
  onEnd?: () => void
}

export interface TtsProvider {
  meta: ProviderMeta
  supported: () => boolean
  listVoices: () => Promise<TtsVoice[]>
  /** 朗读一段文字；重复调用会先取消上一次。音色 / 语速从 config 读取 */
  speak: (text: string, config: ProviderInstanceConfig, opts?: TtsSpeakOptions) => void
  stop: () => void
  speaking: () => boolean
  /**
   * 直接合成音频数据（不经过扬声器）——可选能力位。
   * 云端 TTS（OpenAI-compatible /audio/speech、edge-tts 等）实现这里即可支持
   * 「生成音频文件下载 / 边下边播」；浏览器系统合成拿不到音频数据，不实现。
   */
  synthesize?: (text: string, config: ProviderInstanceConfig) => Promise<TtsAudio>
}

function listBrowserVoices(): Promise<TtsVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve([])
      return
    }
    const collect = () =>
      window.speechSynthesis
        .getVoices()
        .map((v, i) => ({ id: v.voiceURI || `voice-${i}`, name: v.name, language: v.lang }))
    const first = collect()
    if (first.length > 0) {
      resolve(first)
      return
    }
    // Chrome 首次调用时语音表可能还没加载好，等一次 voiceschanged
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve(collect())
    }
    window.speechSynthesis.addEventListener("voiceschanged", finish, { once: true })
    window.setTimeout(finish, 1500)
  })
}

export const browserTts: TtsProvider = {
  meta: {
    id: "browser-synthesis",
    name: "系统语音合成",
    kind: "tts",
    runtime: "local",
    description: "浏览器 speechSynthesis 本机合成，免费；音色取决于操作系统 / 浏览器已安装的语音包",
    configSchema: [
      {
        key: "voiceId",
        label: "音色",
        type: "select",
        dynamic: "voices",
        default: "",
        help: "留空使用系统默认音色；列表来自本机已安装的语音包",
      },
      {
        key: "speed",
        label: "语速",
        type: "number",
        default: 1,
        min: 0.5,
        max: 2,
        step: 0.1,
      },
    ],
  },
  supported: () => typeof window !== "undefined" && "speechSynthesis" in window,
  listVoices: listBrowserVoices,
  speak(text, config, opts) {
    if (!text.trim() || !this.supported()) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = opts?.lang ?? "zh-CN"
    const speed = Number(config.speed)
    if (Number.isFinite(speed) && speed > 0) utter.rate = Math.min(2, Math.max(0.5, speed))
    const voiceId = typeof config.voiceId === "string" ? config.voiceId : ""
    if (voiceId) {
      const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceId)
      if (voice) {
        utter.voice = voice
        utter.lang = voice.lang
      }
    }
    if (opts?.onEnd) {
      const onEnd = opts.onEnd
      utter.onend = () => onEnd()
      utter.onerror = () => onEnd()
    }
    window.speechSynthesis.speak(utter)
  },
  stop() {
    try {
      if (this.supported()) window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
  },
  speaking: () =>
    typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking,
}

// ── LLM ──

export interface LlmProvider {
  meta: ProviderMeta
  supported: () => boolean
  chat: (model: string, messages: LlmMessage[], page: string) => Promise<LlmCallResult>
  /**
   * 流式对话——可选能力位（预留）。平台当前通道为 poll-first（提交 → 轮询整段结果），无流式；
   * 不同引擎的流式协议差异（SSE / WebSocket / chunked）由各 Provider 实现内部归一化，
   * 上层只消费 AsyncIterable<string>。实现并注册后，UI 可点亮逐字渲染 / 打字机预听。
   */
  chatStream?: (model: string, messages: LlmMessage[], page: string) => AsyncIterable<string>
  /**
   * 文本向量化——可选能力位（语义索引的数据源）。
   * 实现并注册后，semanticIndex 可升级为「关键词粗筛 + 向量精排」的本地语义检索；
   * 当前平台通道不提供 embedding，返回缺省即维持 LLM 语义检索路线。
   */
  embed?: (texts: string[], model?: string) => Promise<number[][]>
  /**
   * 费用预估文案——可选能力位。返回如「预计消耗约 ¥0.02」；
   * 不实现则计费确认弹窗维持「按实际 token 扣费」的如实文案。
   */
  estimateCost?: (inputChars: number) => string
  /**
   * 拉取可用模型清单——可选能力位。返回如 [{ model: "gpt-4o-mini", ... }]。
   * listLlmModels() 优先调它；不实现则在 settings 里回退到内置候选（DEFAULT_MODEL + 降级链）。
   * OpenAI 兼容接口不提供模型枚举接口，这里回显当前配置指向的模型名即可。
   */
  listModels?: () => Promise<LlmModelInfo[]>
}

// ── 翻译（文字 → 文字，跨语言）──
// 独立于 LLM 的一类能力：默认实现复用大模型通道（lib/translate.ts 注册），
// 外部翻译引擎（DeepL / 自托管翻译 API 等）实现本契约并注册后即可在设置页切换接管。

/** 翻译支持的常见目标语言（configSchema 的 select 选项与语言名解析共用这一份） */
export const TRANSLATE_LANGUAGES: { label: string; value: string }[] = [
  { label: "英语", value: "en" },
  { label: "简体中文", value: "zh-CN" },
  { label: "繁體中文", value: "zh-TW" },
  { label: "日语", value: "ja" },
  { label: "韩语", value: "ko" },
  { label: "法语", value: "fr" },
  { label: "德语", value: "de" },
  { label: "西班牙语", value: "es" },
]

/** 默认 LLM 翻译引擎的 id：注册表在 lib/translate.ts 加载时填充，配置默认值先指向它 */
export const LLM_TRANSLATE_ID = "llm-translate"

/**
 * 每次翻译调用的动态选项（与持久化 config 分开，口径同 AsrStartOptions）：
 * targetLang 必填（调用方从 UI 取，缺省语言在 config 里）；
 * model / agentPrompt / hotwords 是 LLM 系实现用的上下文，外部引擎可如实忽略；
 * onProgress 供分块实现的进度展示（整块完成数 / 总块数）。
 */
export interface TranslateOptions {
  targetLang: string
  sourceLang?: string // 缺省 = 自动检测源语言
  model?: string
  agentPrompt?: string
  hotwords?: string[]
  onProgress?: (doneChunks: number, totalChunks: number) => void
}

/** 翻译产物：engine 标识实际产出引擎（模型 id / 外部引擎 id）；链信息供调用方记账本 */
export interface TranslateOutcome {
  text: string
  engine: string
  fellBack: boolean
  durationMs: number
  attempts: { model: string; error: string }[]
  tokens?: TokenUsage
}

export interface TranslateProvider {
  meta: ProviderMeta
  supported: () => boolean
  translate: (
    text: string,
    config: ProviderInstanceConfig,
    opts: TranslateOptions,
  ) => Promise<TranslateOutcome>
}

// ── Embedding（文本向量化，语义索引专用能力位）──
// 独立于 LLM：本地 wasm 模型（Transformers.js 类）或云端 embedding API 都可注册。
// 当前环境无实现（模型权重需外部下载 / 第三方 API 不可达），注册表为空——
// 消费方（semanticIndex）必须先判 supported()，为空时自动回退既有检索路线。

export interface EmbeddingProvider {
  meta: ProviderMeta
  supported: () => boolean
  embed: (texts: string[]) => Promise<number[][]>
}

// ── 配置存储：全部有默认值，老数据无感知；随全库备份导出 / 导入恢复 ──

export interface KindConfig {
  active: string
  instances: Record<string, ProviderInstanceConfig>
}

export interface ProvidersConfig {
  asr: KindConfig
  tts: KindConfig
  llm: KindConfig
  embed: KindConfig
  translate: KindConfig
}

const PROVIDERS_KEY = "meeting-notes-providers-v1"

export const DEFAULT_PROVIDERS_CONFIG: ProvidersConfig = {
  asr: { active: webSpeechAsr.meta.id, instances: { [webSpeechAsr.meta.id]: { lang: "zh-CN" } } },
  tts: { active: browserTts.meta.id, instances: { [browserTts.meta.id]: { voiceId: "", speed: 1 } } },
  llm: { active: openaiCompatibleLlm.meta.id, instances: { [openaiCompatibleLlm.meta.id]: {} } },
  embed: { active: "", instances: {} },
  translate: {
    active: LLM_TRANSLATE_ID,
    instances: { [LLM_TRANSLATE_ID]: { targetLang: "en" } },
  },
}

export function loadProvidersConfig(): ProvidersConfig {
  try {
    const raw = vaultGetItem(PROVIDERS_KEY)
    if (!raw) return structuredClone(DEFAULT_PROVIDERS_CONFIG)
    const parsed = JSON.parse(raw) as Partial<ProvidersConfig>
    const merge = (def: KindConfig, got?: Partial<KindConfig>): KindConfig => ({
      active: typeof got?.active === "string" && got.active ? got.active : def.active,
      instances: {
        ...def.instances,
        ...(got?.instances && typeof got.instances === "object" ? got.instances : {}),
      },
    })
    return {
      asr: merge(DEFAULT_PROVIDERS_CONFIG.asr, parsed.asr),
      tts: merge(DEFAULT_PROVIDERS_CONFIG.tts, parsed.tts),
      llm: merge(DEFAULT_PROVIDERS_CONFIG.llm, parsed.llm),
      embed: merge(DEFAULT_PROVIDERS_CONFIG.embed, parsed.embed),
      translate: merge(DEFAULT_PROVIDERS_CONFIG.translate, parsed.translate),
    }
  } catch {
    return structuredClone(DEFAULT_PROVIDERS_CONFIG)
  }
}

export function saveProvidersConfig(cfg: ProvidersConfig): void {
  try {
    vaultSetItem(PROVIDERS_KEY, JSON.stringify(cfg))
  } catch {
    // 静默失败，不阻塞交互
  }
}

export function getProviderConfig(kind: ProviderKind, id: string): ProviderInstanceConfig {
  return loadProvidersConfig()[kind].instances[id] ?? {}
}

// 某配置字段是否为密钥类（password）：轮换卫生只对密钥字段生效
function isSecretField(kind: ProviderKind, id: string, key: string): boolean {
  const all = [...ASR_PROVIDERS, ...TTS_PROVIDERS, ...LLM_PROVIDERS, ...EMBEDDING_PROVIDERS, ...TRANSLATE_PROVIDERS]
  const p = all.find((x) => x.meta.id === id && x.meta.kind === kind)
  return Boolean(p?.meta.configSchema.some((f) => f.key === key && f.type === "password"))
}

// 等长随机串：覆写旧密钥用（可打印 ASCII，避免 JSON 里的控制字符）
function randomScrub(len: number): string {
  const bytes = new Uint8Array(Math.max(1, len))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => String.fromCharCode(33 + (b % 94))).join("")
}

export function setProviderConfigValue(
  kind: ProviderKind,
  id: string,
  key: string,
  value: string | number | boolean,
): void {
  const cfg = loadProvidersConfig()
  const prev = cfg[kind].instances[id]?.[key]
  // 密钥轮换卫生：password 类字段被换成新值前，先用等长随机串把旧值覆盖写一遍，
  // 再写真正的新值——尽力抹掉旧密钥在存储介质上的残留。如实边界：localStorage 的
  // setItem 逻辑上替换整值，物理扇区是否即时擦除由浏览器决定，这是最佳努力；
  // 开启档案加密后旧密钥本就以密文落盘、整 blob 每次用新随机 IV 重加密，残留面进一步收敛。
  if (isSecretField(kind, id, key) && typeof prev === "string" && prev && prev !== value) {
    const scrubbed = structuredClone(cfg)
    scrubbed[kind].instances[id] = { ...(scrubbed[kind].instances[id] ?? {}), [key]: randomScrub(prev.length) }
    saveProvidersConfig(scrubbed)
  }
  cfg[kind].instances[id] = { ...(cfg[kind].instances[id] ?? {}), [key]: value }
  saveProvidersConfig(cfg)
}

export function setActiveProvider(kind: ProviderKind, id: string): void {
  const cfg = loadProvidersConfig()
  cfg[kind].active = id
  saveProvidersConfig(cfg)
}

// 备份导出前的脱敏：password 类配置字段一律剔除（默认路径）。
// 未注册 Provider 的实例配置无法判断哪些字段是密钥——保守整组剔除。
// includeSecrets=true（用户在导出时显式勾选并被告知勿分享）才原样带出。
export function sanitizeProvidersConfig(cfg: ProvidersConfig, includeSecrets: boolean): ProvidersConfig {
  if (includeSecrets) return cfg
  const schemas = new Map<string, ConfigField[]>()
  for (const p of [...ASR_PROVIDERS, ...TTS_PROVIDERS, ...LLM_PROVIDERS, ...EMBEDDING_PROVIDERS, ...TRANSLATE_PROVIDERS]) {
    schemas.set(p.meta.id, p.meta.configSchema)
  }
  const clean = (kc: KindConfig): KindConfig => {
    const instances: Record<string, ProviderInstanceConfig> = {}
    for (const [id, vals] of Object.entries(kc.instances)) {
      const schema = schemas.get(id)
      if (!schema) continue
      const secretKeys = new Set(schema.filter((f) => f.type === "password").map((f) => f.key))
      const kept: ProviderInstanceConfig = {}
      for (const [k, v] of Object.entries(vals)) {
        if (!secretKeys.has(k)) kept[k] = v
      }
      instances[id] = kept
    }
    return { active: kc.active, instances }
  }
  return { asr: clean(cfg.asr), tts: clean(cfg.tts), llm: clean(cfg.llm), embed: clean(cfg.embed), translate: clean(cfg.translate) }
}

// ── 注册表：新增 Provider 时加到对应列表即可；active 指向配置里选中的实现 ──

export const ASR_PROVIDERS: AsrProvider[] = [webSpeechAsr]
export const TTS_PROVIDERS: TtsProvider[] = [browserTts]
export const LLM_PROVIDERS: LlmProvider[] = [openaiCompatibleLlm]
export const EMBEDDING_PROVIDERS: EmbeddingProvider[] = [] // 预留：本地 wasm / 云端 embedding 实现注册处
// 翻译注册表：默认引擎（大模型翻译）在 lib/translate.ts 加载时注册进来——
// 它要复用 ai.ts 的降级链，而 ai.ts 依赖本文件，实现放这里会成环，故走运行时注册（口径同 embedding）
export const TRANSLATE_PROVIDERS: TranslateProvider[] = []

// 运行时注册（本地 Web 推理就绪后由 embeddingClient 调用；按 id 去重，重复注册覆盖旧实现）
export function registerEmbeddingProvider(p: EmbeddingProvider): void {
  const at = EMBEDDING_PROVIDERS.findIndex((x) => x.meta.id === p.meta.id)
  if (at >= 0) EMBEDDING_PROVIDERS[at] = p
  else EMBEDDING_PROVIDERS.push(p)
}

// 运行时注册翻译引擎（lib/translate.ts 的默认实现在模块加载时调用；外部引擎 fork 后同法接入）
export function registerTranslateProvider(p: TranslateProvider): void {
  const at = TRANSLATE_PROVIDERS.findIndex((x) => x.meta.id === p.meta.id)
  if (at >= 0) TRANSLATE_PROVIDERS[at] = p
  else TRANSLATE_PROVIDERS.push(p)
}

function resolveActive<T extends { meta: ProviderMeta; supported: () => boolean }>(
  kind: ProviderKind,
  providers: T[],
): T | null {
  const cfg = loadProvidersConfig()
  const chosen = providers.find((p) => p.meta.id === cfg[kind].active)
  const fallback = providers.find((p) => p.supported())
  const picked = chosen ?? fallback
  return picked && picked.supported() ? picked : null
}

/** 当前生效的 ASR（active 不可用时自动落到第一个可用的；全不可用返回 null） */
export function getActiveAsr(): AsrProvider | null {
  return resolveActive("asr", ASR_PROVIDERS)
}

/** 当前生效的 TTS */
export function getActiveTts(): TtsProvider | null {
  return resolveActive("tts", TTS_PROVIDERS)
}

/**
 * 当前生效的 LLM。本仓库已彻底脱离 VibeX / RunningHub 平台，唯一的 LLM 实现是
 * 用户自有的 OpenAI 兼容接口（openaiCompatibleLlm），不再有平台计费代理。
 */
export function getActiveLlm(): LlmProvider {
  return openaiCompatibleLlm
}

/** 当前生效的 Embedding 实现；注册表为空（本环境常态）返回 null，消费方据此回退 */
export function getActiveEmbedder(): EmbeddingProvider | null {
  const cfg = loadProvidersConfig()
  const chosen = EMBEDDING_PROVIDERS.find((p) => p.meta.id === cfg.embed.active)
  const picked = chosen ?? EMBEDDING_PROVIDERS.find((p) => p.supported())
  return picked && picked.supported() ? picked : null
}

/** 当前生效的翻译引擎；translate.ts 尚未加载 / 无可用实现时返回 null（调用点如实报错） */
export function getActiveTranslate(): TranslateProvider | null {
  return resolveActive("translate", TRANSLATE_PROVIDERS)
}

/** 具备「音频文件批量转写」能力的 ASR；没有实现时返回 null，上传入口整体隐藏 */
export function getAsrBatchProvider(): AsrProvider | null {
  return ASR_PROVIDERS.find((p) => typeof p.transcribe === "function" && p.supported()) ?? null
}

/** 具备「直接合成音频数据」能力的 TTS；没有实现时返回 null（系统合成只能直接播放） */
export function getTtsSynthProvider(): TtsProvider | null {
  return TTS_PROVIDERS.find((p) => typeof p.synthesize === "function" && p.supported()) ?? null
}
