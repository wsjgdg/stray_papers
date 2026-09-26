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

interface UseSpeechRecognitionOptions {
  onFinalText: (text: string) => void
  /**
   * 每次启动识别时动态取上下文文本（热词表），透传给支持上下文注入的识别引擎
   * （Whisper 系当 initial_prompt 做热词偏置）；浏览器识别没有注入口会如实忽略。
   * 用回调而非值：历史档案随时在变，启动那一刻现算才新鲜。
   */
  getContextText?: () => string
}

export function useSpeechRecognition({ onFinalText, getContextText }: UseSpeechRecognitionOptions) {
  const [provider, setProvider] = useState<AsrProvider | null>(() => getActiveAsr())
  const supported = Boolean(provider)

  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [error, setError] = useState("")

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
    const session = active.startStream(
      {
        onPartial: (text) => setInterim(text),
        onFinal: (seg) => onFinalRef.current(seg.text),
        onError: (message) => setError(message),
        onIdle: () => setInterim(""),
        onStopped: () => {
          sessionRef.current = null
          setListening(false)
          setInterim("")
        },
      },
      getProviderConfig("asr", active.meta.id),
      { contextText: getContextRef.current?.() || undefined },
    )
    if (!session) return
    sessionRef.current = session
    setListening(true)
  }, [])

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
    start,
    stop,
    providerName: provider?.meta.name ?? "",
    providerRuntime: provider?.meta.runtime ?? "local",
  }
}
