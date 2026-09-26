// 云端 ASR Provider：SiliconFlow 的 FunAudioLLM/SenseVoiceSmall（亦可换 TeleAI/TeleSpeechASR）。
// 走 SiliconFlow 的 OpenAI 兼容 /v1/audio/transcriptions 接口，浏览器直连其国内节点，
// 在中国大陆网络下可达（不同于浏览器自带识别把音频发到 Google 服务器那种不可达场景）。
// 需要 API Key：默认从 .env 的 VITE_SILICONFLOW_API_KEY 注入（亦可在设置页填写，存于 localStorage）。
// 本协议与本地 Whisper Provider 同源（/v1/audio/transcriptions），故解析逻辑可复用。
//
// 实时转写策略同 Whisper：MediaRecorder 按 chunkSeconds 切段，每段独立发云端识别后作为一句定稿回填。

import {
  getProviderConfig,
  type AsrProvider,
  type AsrSegment,
  type AsrTranscriptSegment,
} from "@/lib/providers"

const DEFAULT_BASE_URL = import.meta.env.VITE_SILICONFLOW_BASE_URL ?? "https://api.siliconflow.com/v1"
const DEFAULT_API_KEY = import.meta.env.VITE_SILICONFLOW_API_KEY ?? ""
const DEFAULT_MODEL = "FunAudioLLM/SenseVoiceSmall"
const DEFAULT_LANG = "auto"
const DEFAULT_CHUNK_SEC = 4
const TRANSCRIBE_PATH = "/audio/transcriptions"

// 选一个 MediaRecorder 支持的 mime（优先带 opus 的 webm，云端服务一般都能解码）
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ""
}

// 把 /v1/audio/transcriptions 的响应规整成统一段落数组（SenseVoice 直接返回 {text}；
// 若返回 verbose_json 带 segments 也兼容）
function parseSegments(data: unknown): AsrTranscriptSegment[] {
  if (!data || typeof data !== "object") return []
  const d = data as {
    text?: string
    transcript?: string
    segments?: Array<{ text?: string; start?: number; end?: number }>
  }
  if (Array.isArray(d.segments) && d.segments.length > 0) {
    return d.segments
      .map((s) => ({
        text: (s.text ?? "").trim(),
        startMs: typeof s.start === "number" ? Math.round(s.start * 1000) : undefined,
        endMs: typeof s.end === "number" ? Math.round(s.end * 1000) : undefined,
      }))
      .filter((s) => s.text)
  }
  const text = typeof d.text === "string" ? d.text.trim() : typeof d.transcript === "string" ? d.transcript.trim() : ""
  if (text) return [{ text }]
  return []
}

// 把一段音频 blob 发给 SiliconFlow 服务，返回段落
async function transcribeBlob(
  blob: Blob,
  opts: { baseUrl: string; apiKey: string; model: string; language: string; signal?: AbortSignal },
): Promise<AsrTranscriptSegment[]> {
  if (!opts.apiKey) {
    throw new Error("缺少 SiliconFlow API Key：请在 .env 设置 VITE_SILICONFLOW_API_KEY，或在设置 → 服务商 → 语音识别 → 云端 SenseVoice 填写")
  }
  const url = `${opts.baseUrl.replace(/\/$/, "")}${TRANSCRIBE_PATH}`
  const fd = new FormData()
  fd.append("file", blob, "audio.webm")
  fd.append("model", opts.model)
  if (opts.language && opts.language !== "auto") fd.append("language", opts.language)
  const headers: Record<string, string> = { Authorization: `Bearer ${opts.apiKey}` }
  const res = await fetch(url, { method: "POST", body: fd, headers, signal: opts.signal })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const j = (await res.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null
      if (j?.error?.message) detail = j.error.message
      else if (j?.message) detail = j.message
    } catch {
      // 忽略响应体解析失败，保留状态码
    }
    if (res.status === 401) detail = "SiliconFlow API Key 无效或未配置（401）"
    throw new Error(detail)
  }
  return parseSegments(await res.json().catch(() => null))
}

export const senseVoiceAsr: AsrProvider = {
  meta: {
    id: "cloud-sensevoice",
    name: "云端 SenseVoice (SiliconFlow)",
    kind: "asr",
    runtime: "cloud",
    description:
      "走 SiliconFlow 的云端语音识别（默认 FunAudioLLM/SenseVoiceSmall，对中文及方言友好），浏览器直连其国内节点、无需自托管。需要 SiliconFlow API Key（.env 的 VITE_SILICONFLOW_API_KEY 或设置页填写）。实时转写为近似实时（按段切分识别）。",
    configSchema: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        default: DEFAULT_API_KEY,
        placeholder: "sk-... (SiliconFlow)",
        help: "SiliconFlow API Key；填入 .env 的 VITE_SILICONFLOW_API_KEY 后此处自动预填，也可直接在设置页填写（存于浏览器本地）",
      },
      {
        key: "model",
        label: "模型",
        type: "string",
        default: DEFAULT_MODEL,
        placeholder: "FunAudioLLM/SenseVoiceSmall",
        help: "SiliconFlow 语音识别模型；可用 FunAudioLLM/SenseVoiceSmall 或 TeleAI/TeleSpeechASR",
      },
      {
        key: "language",
        label: "语言",
        type: "string",
        default: DEFAULT_LANG,
        placeholder: "auto / zh / en",
        help: "语言代码；auto 由模型自动检测（SenseVoice 对中文及多方言友好），留 auto 即可",
      },
      {
        key: "baseUrl",
        label: "服务地址",
        type: "string",
        default: DEFAULT_BASE_URL,
        placeholder: "https://api.siliconflow.com/v1",
        help: "SiliconFlow 兼容接口基址；一般无需改动",
      },
      {
        key: "chunkSeconds",
        label: "实时分段(秒)",
        type: "number",
        default: DEFAULT_CHUNK_SEC,
        min: 2,
        max: 15,
        step: 1,
        help: "实时转写每录满 N 秒发一次云端识别；越小越接近实时，但请求更频繁",
      },
    ],
  },
  supported: () =>
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined",
  transcribe(audio, opts) {
    const cfg = getProviderConfig("asr", senseVoiceAsr.meta.id)
    const baseUrl =
      typeof cfg.baseUrl === "string" && cfg.baseUrl.trim() ? cfg.baseUrl.trim() : DEFAULT_BASE_URL
    const apiKey = typeof cfg.apiKey === "string" && cfg.apiKey.trim() ? cfg.apiKey.trim() : DEFAULT_API_KEY
    const model = typeof cfg.model === "string" && cfg.model.trim() ? cfg.model.trim() : DEFAULT_MODEL
    const language =
      (typeof opts?.language === "string" && opts.language.trim()) ||
      (typeof cfg.language === "string" && cfg.language.trim()) ||
      DEFAULT_LANG
    return transcribeBlob(audio, { baseUrl, apiKey, model, language, signal: opts?.signal })
      .then((segs) =>
        segs.map((s) => ({
          text: s.text,
          speaker: s.speaker,
          startMs: s.startMs,
          endMs: s.endMs,
        })),
      )
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`云端 SenseVoice 转写失败：${msg}`)
      })
  },
  startStream(handlers, config, _opts) {
    const baseUrl =
      typeof config.baseUrl === "string" && config.baseUrl.trim() ? config.baseUrl.trim() : DEFAULT_BASE_URL
    const apiKey = typeof config.apiKey === "string" && config.apiKey.trim() ? config.apiKey.trim() : DEFAULT_API_KEY
    const model = typeof config.model === "string" && config.model.trim() ? config.model.trim() : DEFAULT_MODEL
    const language =
      typeof config.language === "string" && config.language.trim() ? config.language.trim() : DEFAULT_LANG
    const chunkSec =
      typeof config.chunkSeconds === "number" && config.chunkSeconds >= 2 && config.chunkSeconds <= 15
        ? config.chunkSeconds
        : DEFAULT_CHUNK_SEC

    if (!apiKey) {
      handlers.onError(
        "缺少 SiliconFlow API Key：请在 .env 设置 VITE_SILICONFLOW_API_KEY，或在设置 → 服务商 → 语音识别 → 云端 SenseVoice 填写",
      )
      handlers.onStopped()
      return null
    }

    let stream: MediaStream | null = null
    let recorder: MediaRecorder | null = null
    let stopped = false
    const recStart = performance.now()
    let chunkStart = recStart

    const stopAll = () => {
      if (stopped) return
      stopped = true
      try {
        recorder?.stop()
      } catch {
        // 已停止
      }
      stream?.getTracks().forEach((t) => t.stop())
      handlers.onStopped()
    }

    const sendChunk = (blob: Blob) => {
      if (blob.size === 0 || stopped) return
      const startMs = Math.max(0, Math.round(chunkStart - recStart))
      const endMs = Math.max(0, Math.round(performance.now() - recStart))
      chunkStart = performance.now()
      transcribeBlob(blob, { baseUrl, apiKey, model, language })
        .then((segs) => {
          for (const s of segs) {
            const seg: AsrSegment = {
              text: s.text,
              startMs: s.startMs != null ? startMs + s.startMs : startMs,
              endMs: s.endMs != null ? startMs + s.endMs : endMs,
            }
            handlers.onFinal(seg)
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          handlers.onError(`云端 SenseVoice 识别失败：${msg}`)
        })
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const mime = pickMimeType()
        try {
          recorder = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s)
        } catch {
          recorder = new MediaRecorder(s)
        }
        recorder.ondataavailable = (e: BlobEvent) => {
          if (e.data && e.data.size > 0) sendChunk(e.data)
        }
        recorder.onerror = () => {
          handlers.onError("本地录音失败，请检查麦克风权限后重试")
        }
        recorder.onstop = () => {
          // 停止后 MediaRecorder 会再触发一次 dataavailable（收尾段），已由上面的 handler 发出
        }
        recorder.start(chunkSec * 1000)
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "麦克风权限被拒绝，请在浏览器地址栏的权限设置里允许麦克风后重试"
            : err instanceof Error
              ? err.message
              : "无法访问麦克风"
        handlers.onError(msg)
        // 麦克风拿不到：复位聆听态，避免按钮卡在「停止」却无服务
        stopped = true
        handlers.onStopped()
      })

    return {
      stop: stopAll,
    }
  },
}
