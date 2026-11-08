// 云端 ASR Provider：SiliconFlow 的 FunAudioLLM/SenseVoiceSmall（亦可换 TeleAI/TeleSpeechASR）。
// 走 SiliconFlow 的 OpenAI 兼容 /v1/audio/transcriptions 接口，浏览器直连其国内节点，
// 在中国大陆网络下可达（不同于浏览器自带识别把音频发到 Google 服务器那种不可达场景）。
// 需要 API Key：默认从 .env 的 VITE_SILICONFLOW_API_KEY 注入（亦可在设置页填写，存于 localStorage）。
// 本协议与本地 Whisper Provider 同源（/v1/audio/transcriptions），故解析逻辑可复用。
//
// 实时转写策略：用 Web Audio（AudioContext + ScriptProcessor）直接采集单声道 PCM，
// 每片重采样到 16kHz 单声道 16bit 并封装为标准 WAV（44 字节 RIFF 头）后再发云端识别。
// 之所以不走 MediaRecorder(webm/opus)：opus 切片后续片段缺首部，服务端转码会 500；
// 而 SiliconFlow 官方明确推荐 16kHz 单声道 WAV，WAV 是带自描述头的完整文件，逐片发送均合法。

import {
  getProviderConfig,
  type AsrProvider,
  type AsrSegment,
  type AsrTranscriptSegment,
} from "@/lib/providers"

const DEFAULT_BASE_URL = import.meta.env.VITE_SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1"
const DEFAULT_API_KEY = import.meta.env.VITE_SILICONFLOW_API_KEY ?? ""
const DEFAULT_MODEL = "FunAudioLLM/SenseVoiceSmall"
const DEFAULT_LANG = "auto"
const DEFAULT_CHUNK_SEC = 4
const TRANSCRIBE_PATH = "/audio/transcriptions"

// 把若干 Float32 帧（单声道）拼接成一个连续的 Float32Array
function concatFloat32(chunks: Float32Array[]): Float32Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

// 单声道线性插值重采样（inRate → outRate）。要求输入已是单声道。
function resampleMono(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate || inRate <= 0 || outRate <= 0) return input
  const ratio = inRate / outRate
  const outLen = Math.max(0, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    const a = input[idx] ?? 0
    const b = input[idx + 1] ?? 0
    out[i] = a + (b - a) * frac
  }
  return out
}

// 把单声道 16bit PCM 样本封装成标准 WAV（RIFF/WAVE，16kHz，单声道，16bit）。
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2
  const numChannels = 1
  const blockAlign = bytesPerSample * numChannels
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  // RIFF chunk
  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  // fmt sub-chunk
  writeString(12, "fmt ")
  view.setUint32(16, 16, true) // PCM fmt chunk size
  view.setUint16(20, 1, true) // audio format = PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  // data sub-chunk
  writeString(36, "data")
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i]
    if (s > 1) s = 1
    else if (s < -1) s = -1
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([view], { type: "audio/wav" })
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
  opts: { baseUrl: string; apiKey: string; model: string; language: string; signal?: AbortSignal; fileName?: string },
): Promise<AsrTranscriptSegment[]> {
  if (!opts.apiKey) {
    throw new Error("缺少 SiliconFlow API Key：请在 .env 设置 VITE_SILICONFLOW_API_KEY，或在设置 → 服务商 → 语音识别 → 云端 SenseVoice 填写")
  }
  const url = `${opts.baseUrl.replace(/\/$/, "")}${TRANSCRIBE_PATH}`
  const fd = new FormData()
  fd.append("file", blob, opts.fileName ?? "audio.wav")
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
    if (res.status === 401) detail = "SiliconFlow API Key 无效或被吊销（401）"
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
        placeholder: "https://api.siliconflow.cn/v1",
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
    (typeof AudioContext !== "undefined" ||
      typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined") &&
    typeof ScriptProcessorNode !== "undefined",
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
    const fileName =
      typeof File !== "undefined" && audio instanceof File && audio.name ? audio.name : "audio.wav"
    return transcribeBlob(audio, { baseUrl, apiKey, model, language, signal: opts?.signal, fileName })
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
  startStream(handlers, config) {
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
    let audioCtx: AudioContext | null = null
    let processor: ScriptProcessorNode | null = null
    let flushTimer: ReturnType<typeof setInterval> | null = null
    let stopped = false
    // 累积的单声道 PCM 帧（audioCtx.sampleRate 下的 Float32），每到 chunkSec 封一片 WAV 发云端
    const monoChunks: Float32Array[] = []
    let sampleRate = 0
    const recStart = performance.now()
    let chunkStart = recStart

    const stopAll = () => {
      if (stopped) return
      stopped = true
      if (flushTimer != null) {
        clearInterval(flushTimer)
        flushTimer = null
      }
      // 收尾：把残余 PCM 也发一次，避免最后几秒语音丢失
      flushChunk(true)
      try {
        processor?.disconnect()
      } catch {
        // 已断开
      }
      try {
        void audioCtx?.close()
      } catch {
        // 已关闭
      }
      stream?.getTracks().forEach((t) => t.stop())
      handlers.onStopped()
    }

    const flushChunk = (final = false) => {
      if (stopped && !final) return
      if (monoChunks.length === 0) return
      const merged = concatFloat32(monoChunks)
      monoChunks.length = 0
      if (merged.length === 0) return
      const resampled = resampleMono(merged, sampleRate, 16000)
      if (resampled.length === 0) return
      const wav = encodeWav(resampled, 16000)
      if (wav.size === 0) return
      const startMs = Math.max(0, Math.round(chunkStart - recStart))
      const endMs = Math.max(0, Math.round(performance.now() - recStart))
      chunkStart = performance.now()
      transcribeBlob(wav, { baseUrl, apiKey, model, language, fileName: "audio.wav" })
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
      .getUserMedia({ audio: { channelCount: 1 } })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const Ctx: typeof AudioContext =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioCtx = new Ctx()
        sampleRate = audioCtx.sampleRate
        const source = audioCtx.createMediaStreamSource(s)
        // ScriptProcessor 在主线程采集；输出接到 destination 才会触发 onaudioprocess（不写输出即静音，无回声）
        processor = audioCtx.createScriptProcessor(4096, 1, 1)
        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          if (stopped) return
          const input = e.inputBuffer.getChannelData(0)
          // 拷贝：该 buffer 会被复用
          monoChunks.push(new Float32Array(input))
        }
        source.connect(processor)
        processor.connect(audioCtx.destination)
        void audioCtx.resume().catch(() => {
          // 自动播放策略：用户已点击聆听按钮，resume 通常无需等待
        })
        chunkStart = performance.now()
        flushTimer = setInterval(() => flushChunk(false), Math.max(1, chunkSec) * 1000)
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
