// 本地 Whisper ASR Provider：让本应用脱离浏览器厂商的云端识别（Chrome / Edge 会把音频发到 Google 服务器，
// 在中国大陆等网络环境下常因无法访问而报「network」错误），改走用户自托管的 Whisper HTTP 服务。
//
// 协议：OpenAI 兼容的 /v1/audio/transcriptions（与本项目「大模型」走 OpenAI 兼容接口的风格一致）。
// 任意暴露该端点的自托管服务都可用，例如 faster-whisper-server（pip install faster-whisper-server 或 docker 起一个）。
// 服务需开启 CORS（允许本应用所在 origin，开发期通常为 http://localhost:<port>），否则浏览器会拦截请求。
//
// 实时转写策略：用 MediaRecorder 按 chunkSeconds 切段，每段独立发服务器识别后作为一句定稿回填。
// 这是「近似实时」而非逐字流式——Whisper 不支持 token 级流式，且每段独立识别会丢失跨段上下文；
// 对会议记录够用，但长句可能被切在段边界。批量转写（上传音频文件）则整段发送，上下文完整。

import {
  getProviderConfig,
  type AsrProvider,
  type AsrSegment,
  type AsrTranscriptSegment,
} from "@/lib/providers"

const DEFAULT_BASE_URL = "http://localhost:8000"
const DEFAULT_MODEL = "base"
const DEFAULT_LANG = "zh"
const DEFAULT_CHUNK_SEC = 4
const TRANSCRIBE_PATH = "/v1/audio/transcriptions"

// 选一个 MediaRecorder 支持的 mime（优先带 opus 的 webm，几乎被所有 Whisper 服务解码）
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ""
}

// 把 OpenAI 兼容 /v1/audio/transcriptions 的响应规整成统一段落数组（verbose_json 带时间戳，普通 json 只有整段文本）
function parseSegments(data: unknown): AsrTranscriptSegment[] {
  if (!data || typeof data !== "object") return []
  const d = data as {
    text?: string
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
  if (typeof d.text === "string" && d.text.trim()) {
    return [{ text: d.text.trim() }]
  }
  return []
}

// 把一段音频 blob 发给 Whisper 服务，返回段落（verbose_json 时带时间戳）
async function transcribeBlob(
  blob: Blob,
  opts: { baseUrl: string; apiKey: string; model: string; language: string; signal?: AbortSignal },
): Promise<AsrTranscriptSegment[]> {
  const url = `${opts.baseUrl.replace(/\/$/, "")}${TRANSCRIBE_PATH}`
  const fd = new FormData()
  fd.append("file", blob, "audio.webm")
  fd.append("model", opts.model)
  if (opts.language) fd.append("language", opts.language)
  fd.append("response_format", "verbose_json")
  const headers: Record<string, string> = {}
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`
  const res = await fetch(url, { method: "POST", body: fd, headers, signal: opts.signal })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      if (j?.error?.message) detail = j.error.message
    } catch {
      // 忽略响应体解析失败，保留状态码
    }
    throw new Error(detail)
  }
  return parseSegments(await res.json().catch(() => null))
}

export const whisperAsr: AsrProvider = {
  meta: {
    id: "local-whisper",
    name: "本地 Whisper（自托管）",
    kind: "asr",
    runtime: "local",
    description:
      "走你自托管的 Whisper 服务（OpenAI 兼容 /v1/audio/transcriptions），音频不离开你的机器与你的服务，离线可用、免费。需自行运行服务，例如 faster-whisper-server（pip install faster-whisper-server 或 docker 起一个），并开启 CORS 允许本应用访问。模型与语言在下方配置",
    configSchema: [
      {
        key: "baseUrl",
        label: "服务地址",
        type: "string",
        default: DEFAULT_BASE_URL,
        placeholder: "http://localhost:8000",
        help: "自托管 Whisper 服务的基址；需暴露 /v1/audio/transcriptions 且开启 CORS（允许本应用 origin）",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        default: "",
        placeholder: "本地服务一般留空",
        help: "本地服务通常不需要；若前面挂了带鉴权的网关则填入 Bearer",
      },
      {
        key: "model",
        label: "模型",
        type: "string",
        default: DEFAULT_MODEL,
        placeholder: "base / small / ...",
        help: "Whisper 模型名，取决于你部署的服务（base / small / medium 等）",
      },
      {
        key: "language",
        label: "语言",
        type: "string",
        default: DEFAULT_LANG,
        placeholder: "zh / en / 留空自动检测",
        help: "语言代码；留空让模型自动检测（略慢但更稳）",
      },
      {
        key: "chunkSeconds",
        label: "实时分段(秒)",
        type: "number",
        default: DEFAULT_CHUNK_SEC,
        min: 2,
        max: 15,
        step: 1,
        help: "实时转写每录满 N 秒发一次服务识别；越小越接近实时，但请求更频繁",
      },
    ],
  },
  supported: () =>
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined",
  transcribe(audio, opts) {
    const cfg = getProviderConfig("asr", whisperAsr.meta.id)
    const baseUrl =
      typeof cfg.baseUrl === "string" && cfg.baseUrl.trim() ? cfg.baseUrl.trim() : DEFAULT_BASE_URL
    const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey.trim() : ""
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
        throw new Error(`本地 Whisper 转写失败：${msg}——请确认服务已启动且开启 CORS`)
      })
  },
  startStream(handlers, config, _opts) {
    const baseUrl =
      typeof config.baseUrl === "string" && config.baseUrl.trim() ? config.baseUrl.trim() : DEFAULT_BASE_URL
    const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : ""
    const model = typeof config.model === "string" && config.model.trim() ? config.model.trim() : DEFAULT_MODEL
    const language =
      typeof config.language === "string" && config.language.trim() ? config.language.trim() : DEFAULT_LANG
    const chunkSec =
      typeof config.chunkSeconds === "number" && config.chunkSeconds >= 2 && config.chunkSeconds <= 15
        ? config.chunkSeconds
        : DEFAULT_CHUNK_SEC

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
          handlers.onError(`本地 Whisper 识别失败：${msg}——请确认服务已启动且开启 CORS`)
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
