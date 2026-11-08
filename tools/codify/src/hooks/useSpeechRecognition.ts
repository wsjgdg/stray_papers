// 实时语音转写 hook：通过 Provider 注册表取当前生效的 ASR 实现（默认浏览器本机识别），
// 管理聆听 / 预听文字 / 错误三个 UI 状态；识别出的每句定稿通过 onFinalText 抛出。
// 纯本机交互，不调用任何付费 AI；换识别引擎在「设置 → 服务商」里切换，无需改代码。

import { useCallback, useEffect, useRef, useState } from "react"
import {
  getActiveAsr,
  getProviderConfig,
  type AsrProvider,
  type AsrStream,
} from "@/lib/providers"
import {
  deleteRecording,
  latestRecordingForMeeting,
  pruneExpiredRecordings,
  saveRecordingPermanent,
  type RecordingKind,
} from "@/lib/recordingStore"

interface UseSpeechRecognitionOptions {
  onFinalText: (text: string) => void
  /**
   * 每次启动识别时动态取上下文文本（热词表），透传给支持上下文注入的识别引擎
   * （Whisper 系当 initial_prompt 做热词偏置）；浏览器识别没有注入口会如实忽略。
   * 用回调而非值：历史档案随时在变，启动那一刻现算才新鲜。
   */
  getContextText?: () => string
  /**
   * 当前会议 id：把保底录音关联到会议，并在挂载时从 IndexedDB 恢复最近一段已落盘的录音
   * （刷新 / 重开会议后「下载 / 整段重转 / 长期保存 / 丢弃」按钮仍可用）。
   */
  meetingId?: string
}

export function useSpeechRecognition({
  onFinalText,
  getContextText,
  meetingId,
}: UseSpeechRecognitionOptions) {
  const [provider, setProvider] = useState<AsrProvider | null>(() => getActiveAsr())
  const supported = Boolean(provider)

  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [error, setError] = useState("")
  // 整场原始录音（保底）：Web Speech 断点期间的声音由并行采集兜底，停止后分段落盘到 IndexedDB；
  // 这里只持有 recordingId + mime + 临时/长期标记，完整音频按需从 IDB 拼回（不驻内存，抗数小时大体积）
  const [recording, setRecording] = useState<{
    id: string
    mimeType: string
    kind: RecordingKind
  } | null>(null)

  const sessionRef = useRef<AsrStream | null>(null)
  const onFinalRef = useRef(onFinalText)
  onFinalRef.current = onFinalText
  // 热词上下文回调存 ref：start() 是稳定回调，调用时取最新实现（在 effect 里同步，避免渲染期写 ref）
  const getContextRef = useRef(getContextText)
  useEffect(() => {
    getContextRef.current = getContextText
  })

  const stop = useCallback(() => {
    setListening(false)
    setInterim("")
    sessionRef.current?.stop()
    sessionRef.current = null
  }, [])

  const start = useCallback(() => {
    // 每次启动都重新解析 active provider：设置里刚切换的引擎立即生效
    const active = getActiveAsr()
    setProvider(active)
    if (!active || sessionRef.current) return
    setError("")
    setInterim("")
    // 新一轮识别：清空上一场的录音状态（旧分片在 IDB 按 24h 过期 / 手动丢弃清理）
    setRecording(null)
    // 本场保底录音的唯一 id（无 crypto 时退化为时间戳+随机串，均唯一）
    const recordingId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `rec-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const session = active.startStream(
      {
        onPartial: (text) => setInterim(text),
        onFinal: (seg) => onFinalRef.current(seg.text),
        onError: (message) => setError(message),
        onIdle: () => setInterim(""),
        onRecordingSaved: (id, mimeType) => {
          setRecording({ id, mimeType, kind: "temp" })
        },
        onStopped: () => {
          sessionRef.current = null
          setListening(false)
          setInterim("")
        },
      },
      getProviderConfig("asr", active.meta.id),
      {
        contextText: getContextRef.current?.() || undefined,
        recordingId,
        meetingId,
      },
    )
    if (!session) return
    sessionRef.current = session
    setListening(true)
  }, [meetingId])

  // 丢弃当前录音：从 IndexedDB 删除并清空状态（不可恢复）
  const discardRecording = useCallback(async () => {
    const r = recording
    if (r) {
      try {
        await deleteRecording(r.id)
      } catch {
        // 删除失败不阻塞：仍清空状态，UI 不再显示
      }
    }
    setRecording(null)
  }, [recording])

  // 转长期保存：取消 1 天自动清除
  const markRecordingPermanent = useCallback(async () => {
    const r = recording
    if (!r || r.kind === "permanent") return
    try {
      await saveRecordingPermanent(r.id)
      setRecording({ ...r, kind: "permanent" })
    } catch {
      // 持久化失败：保留 temp 状态，UI 可重试
    }
  }, [recording])

  // 挂载时清理过期临时录音，并恢复本会议最近一段已落盘的录音（刷新 / 重开会议后按钮仍可用）
  useEffect(() => {
    let cancelled = false
    void pruneExpiredRecordings().catch(() => {})
    if (meetingId) {
      void latestRecordingForMeeting(meetingId)
        .then((meta) => {
          if (!cancelled && meta && meta.finalized) {
            setRecording({ id: meta.id, mimeType: meta.mime, kind: meta.kind })
          }
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [meetingId])

  // 卸载时彻底停止，避免麦克风指示灯常亮
  useEffect(
    () => () => {
      sessionRef.current?.stop()
      sessionRef.current = null
    },
    [],
  )

  return {
    supported,
    listening,
    interim,
    error,
    recording,
    start,
    stop,
    discardRecording,
    markRecordingPermanent,
    providerName: provider?.meta.name ?? "",
    providerRuntime: provider?.meta.runtime ?? "local",
  }
}
