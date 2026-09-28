import { useEffect, useMemo, useRef, useState } from "react"
import {
  Bell,
  Compass,
  Copy,
  Download,
  History,
  Languages,
  Loader2,
  Mic,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  ShieldCheck,
  Sparkles,
  Square,
  TriangleAlert,
  Type,
  Upload,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  downloadBlob,
  parseTranscriptLines,
  todayStr,
  type Meeting,
  type SourceAnchor,
} from "@/lib/store"
import type { FidelityIssue, FidelityReport } from "@/lib/fidelity"
import { parseLinesTask } from "@/lib/textWorkerClient"
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition"
import { loadRecording } from "@/lib/recordingStore"
import { decodeToWav, splitWavChunks, CLOUD_TRANSCRIBE_CHUNK_BYTES } from "@/lib/audioConvert"
import {
  TRANSLATE_LANGUAGES,
  getActiveTranslate,
  getAsrBatchProvider,
  getAsrBatchProviders,
  getProviderConfig,
  type AsrProvider,
  type AsrTranscriptSegment,
} from "@/lib/providers"
import { translateLangLabel } from "@/lib/translate"
import { buildContextPrompt } from "@/lib/hotwords"
import { inspectNewLines, type LiveInsight } from "@/lib/liveInsights"
import type { SpeakerSuggestion } from "@/lib/speakers"
import type { PreMeetingBriefing } from "@/lib/workflows"
import { PreMeetingBrief } from "@/components/meeting-notes/PreMeetingBrief"
import { cn } from "@/lib/utils"

interface TranscriptTabProps {
  meeting: Meeting
  summaryBusy: boolean
  extractBusy: boolean
  genError: string
  polishing: boolean
  polishNotice: string
  /** 逐块保真校验报告（页面已按当前会议过滤；null = 本次会话没跑过整理） */
  fidelity: FidelityReport | null
  onDismissFidelity: () => void
  speakerSuggestions: SpeakerSuggestion[] | null
  suggestBusy: boolean
  /** 标注 Agent 的「待确认」门槛：置信度低于此值的说话人建议默认不勾选（设置页可调） */
  annotateReviewThreshold?: number
  pastDecisions: { content: string; title: string; date: string }[]
  locateTarget?: SourceAnchor | null
  onLocateClose?: () => void
  duplicateWarning?: { id: string; title: string; percent: number } | null
  onJumpToDuplicate?: (id: string) => void
  /** 会前简报（工作流③）：转写为空时展示，自动从档案拉取同系列遗留事项 */
  preBriefing?: PreMeetingBriefing | null
  onJumpMeeting?: (id: string) => void
  /** 动态热词表（历史会议专有名词）：启动识别时按需现算，注入支持上下文偏置的识别引擎 */
  getHotwords: () => string[]
  onTranscriptChange: (text: string) => void
  onRecordingStart: (at: number) => void
  onPolishTranscript: () => void
  onUndoPolish: () => void
  /** 整稿翻译：走「翻译」服务商通道；译文存独立副本层 meeting.translation，不覆盖原文 */
  translating: boolean
  translateProgress: { done: number; total: number } | null
  translateNotice: string
  onTranslate: (targetLang: string) => void
  onClearTranslation: () => void
  onSuggestSpeakers: () => void
  onApplySpeakers: (accepted: SpeakerSuggestion[]) => void
  onCancelSuggest: () => void
  onAddNote: (text: string, elapsedLabel?: string) => void
  onRemoveNote: (noteId: string) => void
  onGenerate: () => void
}

const SAMPLE = `支持「[00:01:23] 说话人：内容」或「说话人：内容」格式，例如：

[00:00:12] 我：今天主要对齐一下 Q4 的定价方案。
[00:01:05] 老王：我建议专业版定在每月 99 元，先跑三个月看转化。
[00:02:40] 我：可以，那小李这周五之前出一版定价页文案。`

// 两句定稿之间静音超过这个时长，自动空一行分段（下游议题分段把空行当硬边界）
const PARAGRAPH_GAP_MS = 8_000

// 录音已进行时长 → [MM:SS] / [H:MM:SS]，与转写行格式和清洗规则一致
function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function TranscriptTab({
  meeting,
  summaryBusy,
  extractBusy,
  genError,
  polishing,
  polishNotice,
  fidelity,
  onDismissFidelity,
  speakerSuggestions,
  suggestBusy,
  annotateReviewThreshold = 0.6,
  pastDecisions,
  locateTarget,
  onLocateClose,
  duplicateWarning,
  onJumpToDuplicate,
  preBriefing,
  onJumpMeeting,
  getHotwords,
  onTranscriptChange,
  onRecordingStart,
  onPolishTranscript,
  onUndoPolish,
  translating,
  translateProgress,
  translateNotice,
  onTranslate,
  onClearTranslation,
  onSuggestSpeakers,
  onApplySpeakers,
  onCancelSuggest,
  onAddNote,
  onRemoveNote,
  onGenerate,
}: TranscriptTabProps) {
  const charCount = meeting.transcript.length
  const generating = summaryBusy || extractBusy
  const canGenerate = meeting.transcript.trim().length >= 20 && !generating
  const canPolish = meeting.transcript.trim().length >= 20 && !polishing && !generating
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── 整稿翻译（旁路产物：译文存 meeting.translation 独立副本层，不覆盖转写原文）──
  // 引擎与默认目标语言来自「设置 → 服务商 → 翻译」；每次翻译前可临时改语言
  const translateProvider = useMemo(() => getActiveTranslate(), [])
  const [targetLang, setTargetLang] = useState<string>(() => {
    const p = getActiveTranslate()
    const cfg = p ? getProviderConfig("translate", p.meta.id) : {}
    return typeof cfg.targetLang === "string" && cfg.targetLang ? cfg.targetLang : "en"
  })
  const canTranslate =
    Boolean(translateProvider) && meeting.transcript.trim().length >= 20 && !translating && !generating
  const [translationOpen, setTranslationOpen] = useState(true)
  const [copiedTip, setCopiedTip] = useState(false)
  const translationStale = Boolean(
    meeting.translation &&
      meeting.transcriptUpdatedAt &&
      meeting.translation.generatedAt < meeting.transcriptUpdatedAt,
  )

  const copyTranslation = () => {
    if (!meeting.translation) return
    void navigator.clipboard
      .writeText(meeting.translation.text)
      .then(() => {
        setCopiedTip(true)
        setTimeout(() => setCopiedTip(false), 1500)
      })
      .catch(() => {
        // 剪贴板权限被拒等场景静默失败，用户仍可选中面板文本手动复制
      })
  }

  // 全局快捷键 E（壳 Provider 广播）：跳到转写页签后聚焦编辑器，全键盘流「选中会议 → E 开写」
  useEffect(() => {
    const focus = () => textareaRef.current?.focus()
    window.addEventListener("mn:focus-transcript", focus)
    return () => window.removeEventListener("mn:focus-transcript", focus)
  }, [])

  // 说话人（手动标注：浏览器识别不区分人声，点选当前说话人后再开口）
  const [speakers, setSpeakers] = useState<string[]>(["我"])
  const [currentSpeaker, setCurrentSpeaker] = useState("我")
  const [addingSpeaker, setAddingSpeaker] = useState(false)
  const [newSpeaker, setNewSpeaker] = useState("")

  const addSpeaker = () => {
    const name = newSpeaker.trim().slice(0, 12)
    if (!name) return
    if (!speakers.includes(name)) setSpeakers((prev) => [...prev, name])
    setCurrentSpeaker(name)
    setNewSpeaker("")
    setAddingSpeaker(false)
    // 在批量重标栏里新增名字时，直接把选中的行标成新名字
    if (sel) relabelSpeaker(name)
  }

  // 录音起点与上一句定稿时刻：用于生成时间戳与静音分段
  const recStartRef = useRef(0)
  const lastFinalRef = useRef(0)

  // 麦克风实时转写：每句定稿加上「[时间戳] 说话人：」前缀后作为新的一行追加
  const speech = useSpeechRecognition({
    onFinalText: (text) => {
      const now = Date.now()
      const gap = lastFinalRef.current > 0 && now - lastFinalRef.current >= PARAGRAPH_GAP_MS
      lastFinalRef.current = now
      const line = `[${fmtElapsed(now - recStartRef.current)}] ${currentSpeaker}：${text}`
      const cur = meeting.transcript.replace(/\s+$/, "")
      onTranscriptChange(cur.trim() ? `${cur}${gap ? "\n\n" : "\n"}${line}` : line)
    },
    // 热词偏置：启动那一刻从历史档案现算专有名词词表，透传给支持上下文注入的识别引擎
    // （Whisper 系当 initial_prompt；浏览器识别引擎没有注入口，会如实忽略）
    getContextText: () => buildContextPrompt(getHotwords()),
    // 保底录音关联到本会议：停止后分段落盘，刷新 / 重开会议仍可下载 / 整段重转
    meetingId: meeting.id,
  })
  const stopSpeech = speech.stop
  const startSpeech = () => {
    const at = Date.now()
    recStartRef.current = at
    lastFinalRef.current = 0
    // 会中助手：只对录音期间新写入的行做检查
    checkedLinesRef.current = meeting.transcript.split("\n").length
    insightSeenRef.current = new Set()
    setLiveInsights([])
    // 记录绝对时间锚点：行内时间戳是录音相对时间，跨会议检索靠它换算
    onRecordingStart(at)
    speech.start()
  }
  // 切换会议时停止录音，避免把话写进另一场会议；说话人回到默认
  useEffect(() => {
    stopSpeech()
    setCurrentSpeaker("我")
    setLiveInsights([])
    insightSeenRef.current = new Set()
  }, [meeting.id, stopSpeech])

  // ── 会中助手（实时洞察）：录音期间对新增行跑本地规则（免费、高精度、只提醒不改稿）——
  // 无主任务 / 疑似离题 / 历史决议呼应；1.2s 防抖，检查进度按行号推进，同一信号只提醒一次
  const [liveInsights, setLiveInsights] = useState<LiveInsight[]>([])
  const checkedLinesRef = useRef(0)
  const insightSeenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!speech.listening) return
    const timer = setTimeout(() => {
      const lines = meeting.transcript.split("\n")
      if (lines.length <= checkedLinesRef.current) return
      const fresh = inspectNewLines(
        lines,
        checkedLinesRef.current,
        { title: meeting.title, tags: meeting.tags, pastDecisions },
        insightSeenRef.current,
      )
      checkedLinesRef.current = lines.length
      if (fresh.length > 0) {
        setLiveInsights((prev) => [...fresh, ...prev].slice(0, 8))
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [meeting.transcript, meeting.title, meeting.tags, pastDecisions, speech.listening])

  // ── 会中随手记：录音中记的带相对时间戳（与转写行同轴），非录音时记挂钟时间 ──
  const [noteDraft, setNoteDraft] = useState("")
  const submitNote = () => {
    const t = noteDraft.trim()
    if (!t) return
    const label =
      speech.listening && recStartRef.current > 0
        ? fmtElapsed(Date.now() - recStartRef.current)
        : undefined
    onAddNote(t, label)
    setNoteDraft("")
  }

  // ── 说话人批量重标：选中一段文本 → 一次性把覆盖到的行改成指定说话人 ──
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null)

  const updateSel = () => {
    const ta = textareaRef.current
    if (!ta) return
    const s = ta.selectionStart
    const e = ta.selectionEnd
    setSel(e > s ? { start: s, end: e } : null)
  }

  // 选区覆盖到的非空行数
  const selLineCount = useMemo(() => {
    if (!sel) return 0
    let pos = 0
    let count = 0
    for (const l of meeting.transcript.split("\n")) {
      const start = pos
      const end = pos + l.length
      pos = end + 1
      if (l.trim() && start < sel.end && end > sel.start) count++
    }
    return count
  }, [sel, meeting.transcript])

  const relabelSpeaker = (name: string) => {
    if (!sel) return
    const parsed = parseTranscriptLines(meeting.transcript)
    let pos = 0
    const next = meeting.transcript.split("\n").map((raw, i) => {
      const start = pos
      const end = pos + raw.length
      pos = end + 1
      if (!raw.trim() || start >= sel.end || end <= sel.start) return raw
      const l = parsed[i]
      // 保留原时间戳；原有说话人标记换成新的；没有标记的行直接加前缀
      const text = (l.speaker ? l.text : l.text.trim()) || raw.trim()
      return l.time ? `[${l.time}] ${name}：${text}` : `${name}：${text}`
    })
    onTranscriptChange(next.join("\n"))
    setSel(null)
    textareaRef.current?.blur()
  }

  // 本地识别信息（纯计算不调 AI）：行数、说话人数、未标注行数。
  // 大转写稿的逐行正则解析走文本 Worker（阈值以下同步零开销）；
  // stale-while-revalidate：新结果到达前保留旧值，统计行不闪变
  const [stats, setStats] = useState({ lines: 0, speakers: 0, unlabeled: 0 })
  useEffect(() => {
    let stale = false
    void parseLinesTask(meeting.transcript).then((parsed) => {
      if (stale) return
      const nonEmpty = parsed.filter((l) => l.raw.trim()).length
      const speakers = new Set(parsed.map((l) => l.speaker).filter(Boolean))
      const unlabeled = parsed.filter((l) => !l.speaker && l.text.trim()).length
      setStats({ lines: nonEmpty, speakers: speakers.size, unlabeled })
    })
    return () => {
      stale = true
    }
  }, [meeting.transcript])

  const transcriptLines = useMemo(() => meeting.transcript.split("\n"), [meeting.transcript])

  // 智能标注审阅面板：高置信度默认勾选，「待确认」默认不勾——写入永远由用户拍板
  const [checkedLines, setCheckedLines] = useState<Record<number, boolean>>({})
  useEffect(() => {
    if (!speakerSuggestions) return
    const init: Record<number, boolean> = {}
    for (const s of speakerSuggestions) init[s.line] = s.confidence >= annotateReviewThreshold
    setCheckedLines(init)
  }, [speakerSuggestions, annotateReviewThreshold])
  const acceptedCount = speakerSuggestions
    ? speakerSuggestions.filter((s) => checkedLines[s.line]).length
    : 0
  const canSuggest =
    meeting.transcript.trim().length >= 20 &&
    !generating &&
    !polishing &&
    !suggestBusy &&
    !speech.listening

  // ── 音频文件转写（预留能力位）：只有注册了批量转写实现的 ASR Provider 存在时，
  // 上传入口才整体出现；本环境没有可注册的实现，所以正常情况下这里不渲染任何东西 ──
  const batchAsr = useMemo(() => getAsrBatchProvider(), [])
  const batchProviders = useMemo(() => getAsrBatchProviders(), [])
  const [retransEngineId, setRetransEngineId] = useState<string>(batchAsr?.meta.id ?? "")
  const selectedEngine = useMemo(
    () => batchProviders.find((p) => p.meta.id === retransEngineId) ?? batchAsr ?? null,
    [batchProviders, retransEngineId, batchAsr],
  )
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [transcribeError, setTranscribeError] = useState("")

  const handleAudioFile = async (
    file: Blob | null | undefined,
    engine?: AsrProvider | null,
    opts?: { replace?: boolean },
  ) => {
    const eng = engine ?? getAsrBatchProvider()
    if (!file || !eng?.transcribe || uploading) return
    setUploading(true)
    setTranscribeError("")
    try {
      const cfg = getProviderConfig("asr", eng.meta.id)
      // 仅当用户显式设置了语言才下发；否则交给引擎各自的默认（SenseVoice 默认 auto 自动检测，
      // Whisper 默认 zh），不要在这里强制成 zh-CN 而丢失自动语言识别能力。
      const language = typeof cfg.lang === "string" && cfg.lang.trim() ? cfg.lang.trim() : undefined
      const contextText = buildContextPrompt(getHotwords())
      let segs: AsrTranscriptSegment[] = []
      if (eng.meta.runtime === "cloud") {
        // 云接口单请求体积上限远小于整段 WAV：先解成 16k 单声道 WAV，再按体积切片逐片发送，
        // 各片时间戳按切片偏移回加，拼回完整带时间轴的转写（3 小时录音不会再被一个巨型 POST 打爆）。
        const wav = await decodeToWav(file, 16000).catch(() => null)
        const source = wav ?? file
        if (wav && source !== file) {
          const chunks = await splitWavChunks(wav, CLOUD_TRANSCRIBE_CHUNK_BYTES)
          let offsetMs = 0
          const bytesPerSec = 16000 * 2
          for (let i = 0; i < chunks.length; i++) {
            const c = chunks[i]
            const cSegs = await eng.transcribe(c, { language, contextText })
            for (const s of cSegs) {
              segs.push({
                text: s.text,
                speaker: s.speaker,
                startMs: (s.startMs ?? 0) + offsetMs,
                endMs: (s.endMs ?? 0) + offsetMs,
              })
            }
            offsetMs += Math.round(((c.size - 44) / bytesPerSec) * 1000)
          }
        } else {
          segs = await eng.transcribe(source, { language, contextText })
        }
      } else {
        // 本地 Whisper 等服务可直接吃 webm/opus 源文件，无需解码成 WAV。
        segs = await eng.transcribe(file, { language, contextText })
      }
      const lines = segs
        .filter((s) => s.text.trim())
        .map((s) => {
          const ts = s.startMs != null ? `[${fmtElapsed(s.startMs)}] ` : ""
          const sp = s.speaker ? `${s.speaker}：` : ""
          return `${ts}${sp}${s.text.trim()}`
        })
      if (lines.length > 0) {
        if (opts?.replace) {
          // 整段重转：本次是对整场录音重新识别，结果应整段替换旧转写稿，而非追加（否则重复）
          onTranscriptChange(lines.join("\n"))
        } else {
          const cur = meeting.transcript.replace(/\s+$/, "")
          onTranscriptChange(cur.trim() ? `${cur}\n${lines.join("\n")}` : lines.join("\n"))
        }
      }
    } catch (err) {
      // 把失败错误显示出来，避免静默失败（如本地 Whisper 未启动、云 API Key 无效、网络错误、切片超限）
      setTranscribeError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
      if (audioInputRef.current) audioInputRef.current.value = ""
    }
  }

  // 出处定位：有字符级锚点就精确选中引用片段，否则降级选中整行；浏览器自动滚动到选区
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta || !locateTarget) return
    if (typeof locateTarget.start === "number" && typeof locateTarget.end === "number") {
      ta.focus({ preventScroll: false })
      ta.setSelectionRange(locateTarget.start, Math.max(locateTarget.end, locateTarget.start + 1))
      return
    }
    const lines = meeting.transcript.split("\n")
    if (locateTarget.line < 1 || locateTarget.line > lines.length) return
    let start = 0
    for (let i = 0; i < locateTarget.line - 1; i++) start += lines[i].length + 1
    const end = start + lines[locateTarget.line - 1].length
    ta.focus({ preventScroll: false })
    ta.setSelectionRange(start, Math.max(end, start + 1))
  }, [locateTarget, meeting.transcript])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-display)] text-base font-semibold tracking-tight text-foreground">
            转写文本
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            粘贴录音转写稿，或点「实时转写」边说边记——自动带时间戳、标注说话人、静音处分段。
            <span className="text-destructive/80">实时转写的音频会传给浏览器厂商的服务器识别，并非纯本机处理</span>
          </p>
        </div>
        <span className="shrink-0 text-right text-xs text-muted-foreground cjk-latin tabular-nums">
          {charCount > 0 ? (
            <>
              {charCount.toLocaleString()} 字 · {stats.lines} 行
              {stats.speakers > 0 ? (
                <span className="mt-0.5 block text-[11px]">识别到 {stats.speakers} 位说话人</span>
              ) : null}
              {stats.unlabeled > 0 ? (
                <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                  {stats.unlabeled} 行未标注说话人
                </span>
              ) : null}
              {meeting.recStartedAt ? (
                <span className="mt-0.5 block text-[11px]">
                  录音始于{" "}
                  {new Date(meeting.recStartedAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </>
          ) : (
            ""
          )}
        </span>
      </div>

      {duplicateWarning ? (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive/90">
          <span className="flex min-w-0 items-start gap-1.5">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {duplicateWarning.percent >= 100
                ? `检测到《${duplicateWarning.title}》的转写文本与本条完全相同，可能是重复粘贴`
                : `本条与《${duplicateWarning.title}》内容约 ${duplicateWarning.percent}% 相似，可能是同一场会议的不同版本`}
            </span>
          </span>
          <button
            onClick={() => onJumpToDuplicate?.(duplicateWarning.id)}
            className="shrink-0 font-medium underline underline-offset-2 transition-opacity hover:opacity-75"
          >
            查看那场会议
          </button>
        </div>
      ) : null}

      {locateTarget ? (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground/85">
          <span className="cjk-latin">
            已定位到出处原文（第 {locateTarget.line} 行
            {typeof locateTarget.start === "number" ? "，已精确选中引用片段" : "，已选中高亮"}）
          </span>
          <button
            onClick={onLocateClose}
            aria-label="关闭定位"
            className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {preBriefing && meeting.transcript.trim().length < 20 && !speech.listening ? (
        <PreMeetingBrief briefing={preBriefing} onJumpMeeting={(id) => onJumpMeeting?.(id)} />
      ) : null}

      {meeting.cleaned && meeting.cleanReport ? (
        <details className="shrink-0 rounded-[var(--radius-md)] border border-border bg-card/60 px-3 py-2">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
            <Wand2 className="h-3.5 w-3.5 shrink-0 text-primary/70" />
            <span className="cjk-latin">
              已生成清洗稿 · 统一 {meeting.cleanReport.timestamps} 处时间戳、
              {meeting.cleanReport.speakers} 处说话人标记
              {(meeting.cleanReport.slips ?? 0) > 0
                ? `、修正 ${meeting.cleanReport.slips} 处口误改口（标注「已修正」）`
                : ""}
              ，修正 {meeting.cleanReport.changedLines} 行
            </span>
            {meeting.transcriptUpdatedAt && meeting.transcriptUpdatedAt > meeting.cleanReport.at ? (
              <span className="text-[11px] text-destructive/85">（转写稿后来改过，此清洗稿已过时——下次生成时会重新清洗）</span>
            ) : (
              <span className="text-[11px] text-muted-foreground/70">（摘要与行动项均基于清洗稿生成，点此查看）</span>
            )}
          </summary>
          <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-border pt-2 font-[var(--font-body)] text-[12px] leading-relaxed text-foreground/80">
            {meeting.cleaned}
          </pre>
        </details>
      ) : null}

      {speech.listening ? (
        <div className="shrink-0 rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="flex items-center gap-2 text-xs font-medium text-destructive">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
            正在聆听{speech.providerName ? `（引擎：${speech.providerName}）` : ""}，每句话自动带上时间戳写入下方文本框，停顿够久会自动分段…
          </p>
          <p className="mt-1 flex items-start gap-1.5 pl-4 text-[11px] leading-relaxed text-destructive/75">
            <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
            音频正上传至浏览器厂商的服务器识别；本应用另开一路本地采集作保底，停止后会保留整场原始录音供你下载（不上传），涉密会议请改用粘贴文本录入
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-4">
            <span className="text-[11px] text-muted-foreground">现在谁在说：</span>
            {speakers.map((s) => (
              <button
                key={s}
                onClick={() => setCurrentSpeaker(s)}
                className={cn(
                  "rounded-[var(--radius-pill)] border px-2 py-0.5 text-[11px] transition-colors",
                  s === currentSpeaker
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
            {addingSpeaker ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newSpeaker}
                  onChange={(e) => setNewSpeaker(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addSpeaker()
                    if (e.key === "Escape") setAddingSpeaker(false)
                  }}
                  placeholder="名字"
                  maxLength={12}
                  className="h-6 w-20 rounded-[var(--radius-pill)] border border-primary bg-background px-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                <button
                  onClick={addSpeaker}
                  className="rounded-[var(--radius-pill)] bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  确定
                </button>
              </span>
            ) : (
              <button
                onClick={() => setAddingSpeaker(true)}
                className="flex items-center gap-0.5 rounded-[var(--radius-pill)] border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                说话人
              </button>
            )}
          </div>
          {speech.interim ? (
            <p className="mt-1.5 pl-4 text-xs italic leading-relaxed text-muted-foreground">{speech.interim}</p>
          ) : null}
        </div>
      ) : null}

      {speech.listening ? (
        <div className="shrink-0 rounded-[var(--radius-md)] border border-border bg-card/60 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Bell className="h-3 w-3 shrink-0 text-primary/70" />
            会中助手 · 本机规则实时检查（免费）：无主任务 / 疑似离题 / 历史决议呼应——只在有把握时提醒，绝不改动转写内容
          </p>
          {liveInsights.length === 0 ? (
            <p className="mt-1 pl-[18px] text-[11px] text-muted-foreground/70">
              正在旁听，暂无提醒…
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {liveInsights.map((ins) => {
                const Icon =
                  ins.kind === "assignee" ? UserPlus : ins.kind === "drift" ? Compass : History
                return (
                  <li
                    key={ins.id}
                    className="flex items-start gap-1.5 rounded-[var(--radius-sm)] bg-background px-2 py-1.5"
                  >
                    <Icon
                      className={cn(
                        "mt-px h-3 w-3 shrink-0",
                        ins.kind === "assignee"
                          ? "text-primary"
                          : ins.kind === "echo"
                            ? "text-foreground/70"
                            : "text-muted-foreground",
                      )}
                    />
                    <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-foreground/85">
                      {ins.text}
                    </span>
                    <button
                      onClick={() => setLiveInsights((prev) => prev.filter((x) => x.id !== ins.id))}
                      aria-label="忽略这条提醒"
                      className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      {speech.error ? (
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <span>{speech.error}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-3">
        <textarea
          ref={textareaRef}
          value={meeting.transcript}
          onChange={(e) => {
            setSel(null)
            if (speakerSuggestions) onCancelSuggest() // 行号会随编辑漂移，建议面板即刻失效
            onTranscriptChange(e.target.value)
          }}
          onMouseUp={updateSel}
          onKeyUp={updateSel}
          placeholder={SAMPLE}
          spellCheck={false}
          className="min-h-0 w-full flex-1 resize-none rounded-[var(--radius-lg)] border border-border bg-background p-4 text-sm leading-relaxed text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)]"
        />

        <aside className="hidden w-56 shrink-0 flex-col rounded-[var(--radius-lg)] border border-border bg-card/40 lg:flex">
          <MyNotes
            meeting={meeting}
            noteDraft={noteDraft}
            setNoteDraft={setNoteDraft}
            submitNote={submitNote}
            onRemoveNote={onRemoveNote}
          />
        </aside>
      </div>

      {/* 窄屏没有侧栏，随手记折叠成一块，入口不能丢 */}
      <details className="shrink-0 rounded-[var(--radius-md)] border border-border bg-card/40 lg:hidden">
        <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground">
          <Pencil className="h-3 w-3 text-primary" />
          我的随手记
          {meeting.notes && meeting.notes.length > 0 ? (
            <span className="rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground cjk-latin tabular-nums">
              {meeting.notes.length}
            </span>
          ) : null}
        </summary>
        <div className="flex max-h-64 flex-col border-t border-border">
          <MyNotes
            meeting={meeting}
            noteDraft={noteDraft}
            setNoteDraft={setNoteDraft}
            submitNote={submitNote}
            onRemoveNote={onRemoveNote}
            compact
          />
        </div>
      </details>

      {sel && selLineCount > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
          <span className="text-foreground/85 cjk-latin">
            已选中 {selLineCount} 行，重新标为：
          </span>
          {speakers.map((s) => (
            <button
              key={s}
              onClick={() => relabelSpeaker(s)}
              className={cn(
                "rounded-[var(--radius-pill)] border px-2 py-0.5 text-[11px] transition-colors",
                s === currentSpeaker
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
          {addingSpeaker ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                value={newSpeaker}
                onChange={(e) => setNewSpeaker(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addSpeaker()
                  if (e.key === "Escape") setAddingSpeaker(false)
                }}
                placeholder="名字"
                maxLength={12}
                className="h-6 w-20 rounded-[var(--radius-pill)] border border-primary bg-background px-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/60"
              />
              <button
                onClick={addSpeaker}
                className="rounded-[var(--radius-pill)] bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
              >
                确定
              </button>
            </span>
          ) : (
            <button
              onClick={() => setAddingSpeaker(true)}
              className="flex items-center gap-0.5 rounded-[var(--radius-pill)] border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              新名字
            </button>
          )}
          <button
            onClick={() => setSel(null)}
            className="ml-auto shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="取消选择"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {speakerSuggestions !== null ? (
        <div className="shrink-0 rounded-[var(--radius-md)] border border-primary/25 bg-primary/5 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Users className="h-3.5 w-3.5 text-primary" />
              说话人标注建议
              {suggestBusy ? (
                <span className="flex items-center gap-1 font-normal text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  AI 正在推断剩余行…
                </span>
              ) : null}
            </p>
            <button
              onClick={onCancelSuggest}
              aria-label="关闭标注建议"
              className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {speakerSuggestions.length === 0 && !suggestBusy ? (
            <p className="mt-1.5 pl-5 text-[11px] text-muted-foreground">
              没有找到可推断的未标注行
            </p>
          ) : (
            <>
              <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
                依据称呼应答与上下文推断，低置信度的标「待确认」且默认不勾选——只有你勾选的行才会写入
              </p>
              <ul className="mt-2 max-h-52 space-y-0.5 overflow-y-auto pl-5 pr-1">
                {speakerSuggestions.map((s) => {
                  const raw = (transcriptLines[s.line - 1] ?? "").trim()
                  const low = s.confidence < annotateReviewThreshold
                  return (
                    <li key={s.line}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 transition-colors hover:bg-background/60">
                        <input
                          type="checkbox"
                          checked={Boolean(checkedLines[s.line])}
                          onChange={(e) =>
                            setCheckedLines((prev) => ({ ...prev, [s.line]: e.target.checked }))
                          }
                          className="mt-1 accent-[hsl(var(--primary))]"
                        />
                        <span className="shrink-0 text-[10px] text-muted-foreground/70 cjk-latin tabular-nums">
                          {s.line} 行
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/70">
                          {raw.slice(0, 42)}
                          {raw.length > 42 ? "…" : ""}
                        </span>
                        <span className="shrink-0 text-[11px] font-medium text-primary">
                          {s.speaker}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/70">
                          {s.source === "rule" ? "规则" : "AI"}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px] cjk-latin tabular-nums",
                            low
                              ? "border-destructive/30 bg-destructive/5 text-destructive"
                              : "border-border bg-muted text-muted-foreground",
                          )}
                          title={s.reason || undefined}
                        >
                          {low ? "待确认" : `${Math.round(s.confidence * 100)}%`}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-2 flex items-center justify-end gap-2 pl-5">
                <span className="mr-auto text-[11px] text-muted-foreground cjk-latin">
                  已选 {acceptedCount} 行
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancelSuggest}
                  className="h-7 rounded-[var(--radius-sm)] text-xs text-muted-foreground hover:text-foreground"
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  disabled={acceptedCount === 0}
                  onClick={() =>
                    onApplySpeakers(speakerSuggestions.filter((s) => checkedLines[s.line]))
                  }
                  className="h-7 rounded-[var(--radius-sm)] bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                >
                  写入选中的 {acceptedCount} 行
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {polishNotice || meeting.prePolish !== undefined ? (
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
          <span className="min-w-0">
            {polishNotice || "上一次批量修改（整理 / 智能标注）前的原稿还留着，随时可还原"}
          </span>
          {meeting.prePolish !== undefined ? (
            <button
              onClick={onUndoPolish}
              className="shrink-0 font-medium underline underline-offset-2 transition-opacity hover:opacity-75"
            >
              还原修改前原稿
            </button>
          ) : null}
        </div>
      ) : null}

      {fidelity ? <FidelityPanel report={fidelity} onDismiss={onDismissFidelity} /> : null}

      {translateNotice ? (
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
          <span className="min-w-0">{translateNotice}</span>
          {meeting.translation ? (
            <button
              onClick={() => setTranslationOpen(true)}
              className="shrink-0 font-medium underline underline-offset-2 transition-opacity hover:opacity-75"
            >
              查看译文
            </button>
          ) : null}
        </div>
      ) : null}

      {meeting.translation ? (
        <div className="shrink-0 rounded-[var(--radius-md)] border border-border bg-background">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs">
            <Languages className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="font-medium text-foreground">
              整稿译文 · {translateLangLabel(meeting.translation.lang)}
            </span>
            <span className="text-muted-foreground">
              引擎 {meeting.translation.engine} ·{" "}
              {new Date(meeting.translation.generatedAt).toLocaleString("zh-CN", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {translationStale ? (
              <span className="flex items-center gap-1 text-destructive">
                <TriangleAlert className="h-3 w-3" />
                转写稿在翻译后有过改动，译文可能过时
              </span>
            ) : null}
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={copyTranslation}
                className="h-6 gap-1 rounded-[var(--radius-sm)] px-2 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
              >
                <Copy className="h-3 w-3" />
                {copiedTip ? "已复制" : "复制译文"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTranslationOpen((v) => !v)}
                className="h-6 rounded-[var(--radius-sm)] px-2 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
              >
                {translationOpen ? "收起" : "展开"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onClearTranslation}
                title="清除译文副本（转写原文不受影响）"
                className="h-6 rounded-[var(--radius-sm)] px-2 text-[11px] text-destructive/80 hover:border-destructive/40 hover:text-destructive"
              >
                清除
              </Button>
            </div>
          </div>
          {translationOpen ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-border px-3 py-2 font-sans text-xs leading-relaxed text-foreground/85">
              {meeting.translation.text}
            </pre>
          ) : null}
        </div>
      ) : null}

      {generating ? (
        <div className="space-y-1.5 rounded-[var(--radius-md)] border border-primary/25 bg-primary/5 px-3 py-2.5">
          <p className="flex items-center gap-2 text-xs text-foreground/85">
            <Loader2 className={summaryBusy ? "h-3.5 w-3.5 animate-spin text-primary" : "hidden"} />
            {summaryBusy ? "正在生成一句话摘要与分议题纪要…" : "摘要已完成"}
          </p>
          <p className="flex items-center gap-2 text-xs text-foreground/85">
            <Loader2 className={extractBusy ? "h-3.5 w-3.5 animate-spin text-primary" : "hidden"} />
            {extractBusy ? "正在抽取行动项与决议（逐条核对原文引用）…" : "行动项抽取已完成"}
          </p>
          <p className="text-[11px] text-muted-foreground">两路并行处理，长会议约需半分钟，可以停留在本页等待</p>
        </div>
      ) : null}

      {genError ? (
        <p className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {genError}
        </p>
      ) : null}
      {transcribeError ? (
        <p className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {transcribeError}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="hidden text-xs text-muted-foreground sm:block">
          {speech.supported
            ? "生成内容：一句话摘要 · 分议题纪要 · 行动项 · 决议（每条结论机器校验原文出处，可点击跳回）"
            : "当前浏览器不支持实时语音转写（需 Chrome / Edge）；粘贴文本、AI 纪要、补标点、问答、朗读纪要等其余功能在本浏览器完全可用"}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {batchProviders.length > 1 ? (
            <Select value={retransEngineId} onValueChange={(v) => setRetransEngineId(v)}>
              <SelectTrigger
                className="h-8 w-auto min-w-[9rem] gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
                title="选择整段重转 / 上传音频使用的识别引擎"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {batchProviders.map((p) => (
                  <SelectItem key={p.meta.id} value={p.meta.id}>
                    {p.meta.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {batchAsr ? (
            <>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={(e) => void handleAudioFile(e.target.files?.[0], selectedEngine)}
              />
              <Button
                variant="outline"
                onClick={() => audioInputRef.current?.click()}
                disabled={uploading || generating || polishing}
                title={`上传音频文件离线转写（引擎：${batchAsr.meta.name}）`}
                className="gap-1.5 rounded-[var(--radius-md)] px-3.5 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span className="hidden md:inline">{uploading ? "转写中…" : "上传音频"}</span>
              </Button>
            </>
          ) : null}
          {speech.recording ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  const r = speech.recording
                  if (!r) return
                  void loadRecording(r.id).then((res) => {
                    if (!res) return
                    const ext = res.meta.mime.includes("mp4")
                      ? "mp4"
                      : res.meta.mime.includes("ogg")
                        ? "ogg"
                        : "webm"
                    downloadBlob(`meeting-recording-${todayStr()}.${ext}`, res.blob)
                  })
                }}
                title="下载整场原始录音（含 Web Speech 断点期间的声音）；默认暂存 1 天后自动清除，可点「长期保存」留存"
                className="gap-1.5 rounded-[var(--radius-md)] px-3.5 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
              >
                <Download className="h-4 w-4" />
                <span className="hidden md:inline">下载录音</span>
              </Button>
              {batchAsr ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    const r = speech.recording
                    if (!r) return
                    void loadRecording(r.id).then((res) => {
                      if (!res) return
                      void handleAudioFile(res.blob, selectedEngine, { replace: true })
                    })
                  }}
                  disabled={uploading}
                  title="把整场原始录音交给所选引擎重新整段转写（云引擎会先解码成 16k 单声道 WAV）"
                  className="gap-1.5 rounded-[var(--radius-md)] px-3.5 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="hidden md:inline">{uploading ? "重转中…" : "整段重转"}</span>
                </Button>
              ) : null}
              {speech.recording.kind === "temp" ? (
                <Button
                  variant="outline"
                  onClick={() => void speech.markRecordingPermanent()}
                  title="转为长期保存：取消 1 天自动清除，永久留在本机（仍可下载 / 重转 / 丢弃）"
                  className="gap-1.5 rounded-[var(--radius-md)] px-3.5 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
                >
                  <Save className="h-4 w-4" />
                  <span className="hidden md:inline">长期保存</span>
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => void speech.discardRecording()}
                title="丢弃本段录音（从本机删除，不可恢复）"
                className="gap-1.5 rounded-[var(--radius-md)] px-3.5 text-sm font-medium text-muted-foreground hover:border-destructive/40 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden md:inline">丢弃</span>
              </Button>
            </>
          ) : null}
          <Button
            variant="outline"
            onClick={onSuggestSpeakers}
            disabled={!canSuggest}
            title={
              stats.unlabeled > 0
                ? `为 ${stats.unlabeled} 行未标注对话推断说话人：先跑本地规则（免费），剩余行经你确认后由 AI 依据上下文推断；结果先进审阅面板，勾选后才写入`
                : "没有未标注说话人的行"
            }
            className="gap-1.5 rounded-[var(--radius-md)] px-3.5 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            {suggestBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            <span className="hidden md:inline">{suggestBusy ? "推断中…" : "智能标注"}</span>
          </Button>
          <Button
            variant="outline"
            onClick={onPolishTranscript}
            disabled={!canPolish || speech.listening}
            title={
              speech.listening
                ? "录音进行中，停止转写后再整理"
                : "AI 为转写文本补全标点、按话题分段，不增删改内容；整理前会留原稿快照，可一键还原"
            }
            className="gap-1.5 rounded-[var(--radius-md)] px-3.5 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            {polishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Type className="h-4 w-4" />}
            {polishing ? "整理中…" : "补标点分段"}
          </Button>
          {translateProvider ? (
            <div className="flex items-center gap-1">
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                disabled={translating}
                aria-label="翻译目标语言"
                title="翻译目标语言（默认语言在「设置 → 服务商 → 翻译」里配置）"
                className="h-9 rounded-[var(--radius-md)] border border-border bg-background px-1.5 text-xs text-muted-foreground outline-none focus-visible:border-primary"
              >
                {TRANSLATE_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                onClick={() => onTranslate(targetLang)}
                disabled={!canTranslate || speech.listening}
                title={
                  speech.listening
                    ? "录音进行中，停止转写后再翻译"
                    : `把整份转写翻译成${translateLangLabel(targetLang)}：译文是独立副本（保留时间戳与说话人标注），原稿不动，可复制 / 清除`
                }
                className="gap-1.5 rounded-[var(--radius-md)] px-3.5 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
              >
                {translating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                <span className="hidden md:inline">
                  {translating
                    ? translateProgress
                      ? `翻译中 ${translateProgress.done}/${translateProgress.total}…`
                      : "翻译中…"
                    : "翻译"}
                </span>
              </Button>
            </div>
          ) : null}
          <Button
            variant={speech.listening ? "destructive" : "outline"}
            onClick={speech.listening ? stopSpeech : startSpeech}
            disabled={!speech.supported}
            title={
              speech.supported
                ? speech.listening
                  ? "停止实时转写"
                  : "开始实时转写：麦克风说话，自动变成文字（音频会传给浏览器厂商的服务器识别，敏感内容请改用粘贴）"
                : "当前浏览器不支持实时语音转写，请改用 Chrome 或 Edge；粘贴文本、AI 纪要、问答、朗读等其余功能在本浏览器完全可用"
            }
            className="gap-1.5 rounded-[var(--radius-md)] px-3.5 text-sm font-medium"
          >
            {speech.listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {speech.listening ? "停止转写" : "实时转写"}
          </Button>
          <Button
            onClick={onGenerate}
            disabled={!canGenerate}
            className="gap-1.5 rounded-[var(--radius-md)] bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[var(--elev-ring)] transition-shadow hover:bg-primary/90 hover:shadow-[var(--focus-ring)] disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                生成中…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                生成纪要与行动项
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// 逐块保真校验面板：整理稿与原文的机器对账结果。
// 立场：不假装 AI 一定听话——每一块的差异都摊开给用户看，可疑块标红而非静默接受；
// 通过时也只说「机器对账通过」，不替模型打包票。
const FIDELITY_KIND_META: Record<FidelityIssue["kind"], { label: string; cls: string }> = {
  unaligned: { label: "对不上原文", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  insert: { label: "疑似加字", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  delete: { label: "疑似丢字", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  rewrite: { label: "疑似改写", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  minor: { label: "零星增删", cls: "border-border bg-muted text-muted-foreground" },
  overall: { label: "整体对账", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
}

function FidelityPanel({ report, onDismiss }: { report: FidelityReport; onDismiss: () => void }) {
  const clean = report.flagged === 0
  return (
    <div
      className={cn(
        "shrink-0 rounded-[var(--radius-md)] border px-3 py-2.5",
        clean ? "border-primary/25 bg-primary/5" : "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              clean ? "text-primary" : "text-destructive",
            )}
          >
            {clean ? <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> : <ShieldAlert className="h-3.5 w-3.5 shrink-0" />}
            逐块保真校验{clean ? "通过" : `发现 ${report.flagged} 处疑似改动`}
            <span className="font-normal text-muted-foreground cjk-latin tabular-nums">
              · 共比对 {report.chunks} 块
              {report.typoFixes > 0 ? ` · 放行 ${report.typoFixes} 处疑似错别字修正` : ""}
            </span>
          </p>
          <p className="mt-1 pl-5 text-[11px] leading-relaxed text-muted-foreground">
            {clean
              ? "整理稿与原文逐块字符级对账：只发现标点、分段与错别字修正级别的差异，没有丢词、加词或改写。"
              : "机器把整理稿与原文按字符级对齐，只允许标点、分段和小步错别字修正；下列差异超出允许范围，请对照原文核实，必要时还原原稿。"}
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="关闭保真校验面板"
          className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {report.issues.length > 0 ? (
        <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pl-5 pr-1">
          {report.issues.map((iss, i) => {
            const meta = FIDELITY_KIND_META[iss.kind]
            return (
              <li
                key={i}
                className="rounded-[var(--radius-sm)] border border-border bg-background px-2.5 py-2"
              >
                <p className="flex items-baseline gap-1.5 text-[11px] leading-relaxed">
                  <span
                    className={cn(
                      "shrink-0 rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px]",
                      meta.cls,
                    )}
                  >
                    {meta.label}
                  </span>
                  {iss.line > 0 ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground/70 cjk-latin tabular-nums">
                      第 {iss.line} 行
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 text-foreground/85">{iss.detail}</span>
                </p>
                {iss.origSnippet || iss.polishedSnippet ? (
                  <div className="mt-1 space-y-0.5 border-l-2 border-border pl-2">
                    {iss.origSnippet ? (
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        <span className="text-muted-foreground/70">原文：</span>
                        {iss.origSnippet}
                      </p>
                    ) : null}
                    {iss.polishedSnippet ? (
                      <p className="text-[10px] leading-relaxed text-foreground/70">
                        <span className="text-muted-foreground/70">整理稿：</span>
                        {iss.polishedSnippet}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

// 随手记面板本体：宽屏侧栏与窄屏折叠块共用一份实现
function MyNotes({
  meeting,
  noteDraft,
  setNoteDraft,
  submitNote,
  onRemoveNote,
  compact,
}: {
  meeting: Meeting
  noteDraft: string
  setNoteDraft: (v: string) => void
  submitNote: () => void
  onRemoveNote: (noteId: string) => void
  compact?: boolean
}) {
  return (
    <>
      {compact ? null : (
        <div className="border-b border-border px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Pencil className="h-3 w-3 text-primary" />
            我的随手记
            {meeting.notes && meeting.notes.length > 0 ? (
              <span className="ml-auto rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] font-normal text-muted-foreground cjk-latin tabular-nums">
                {meeting.notes.length}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            会中记下你认为重要的点；生成纪要时 AI 会优先呼应你的批注，而不是完全替你总结
          </p>
        </div>
      )}
      <div className="border-b border-border p-2">
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submitNote()
            }
          }}
          rows={2}
          maxLength={200}
          placeholder="随手记一笔，Enter 保存…"
          className="w-full resize-none rounded-[var(--radius-md)] border border-border bg-background p-2 text-[11px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)]"
        />
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {(meeting.notes ?? []).length === 0 ? (
          <li className="px-1 py-2 text-center text-[10px] leading-relaxed text-muted-foreground/70">
            还没有批注
            <br />
            录音时记下的会带相对时间戳，与转写行同轴
          </li>
        ) : (
          (meeting.notes ?? []).map((n) => (
            <li
              key={n.id}
              className="group/note rounded-[var(--radius-md)] border border-border bg-background px-2 py-1.5"
            >
              <p className="flex items-baseline gap-1.5">
                <span className="shrink-0 text-[9px] text-primary/80 cjk-latin tabular-nums">
                  {n.elapsedLabel ??
                    new Date(n.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground/85">
                  {n.text}
                </span>
                <button
                  onClick={() => onRemoveNote(n.id)}
                  aria-label="删除这条随手记"
                  className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground/50 opacity-0 transition-all hover:text-destructive group-hover/note:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </p>
            </li>
          ))
        )}
      </ul>
    </>
  )
}
