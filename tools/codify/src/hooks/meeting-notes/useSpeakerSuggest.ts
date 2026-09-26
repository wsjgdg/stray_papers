// 领域 hook · 说话人智能标注：从 useMeetingNotes 整段迁出，行为不变。
// 本地规则先跑（免费），剩余未标注行经计费确认后交 LLM 推断；
// 产出只是「建议」，用户在审阅面板勾选后才写入转写稿，低置信度默认不勾选。

import { useCallback, useRef, useState } from "react"
import { inferSpeakers, llmErrorMessage } from "@/lib/ai"
import { parseLinesTask } from "@/lib/textWorkerClient"
import {
  ruleInferSpeakers,
  unlabeledLineNumbers,
  type SpeakerSuggestion,
} from "@/lib/speakers"
import type { Meeting } from "@/lib/store"
import type { AgentRole } from "@/lib/agents"
import type { ChainResult } from "@/lib/ai"
import type { useCostConfirm } from "@/hooks/useCostConfirm"

const SPEAKER_PRICE_TEXT =
  "本地规则找不到的行，将调用 AI 依据上下文推断说话人，按实际 token 扣费，具体费用以 RunningHub 为准"

export interface UseSpeakerSuggestDeps {
  meetings: Meeting[]
  agentModel: (role: AgentRole) => string
  agentPrompt: (role: AgentRole) => string | undefined
  logAiCall: (
    kind: string,
    meeting: { id: string; title: string } | null,
    preferred: string,
    res: ChainResult<unknown>,
  ) => void
  pushActivity: (kind: string, meetingTitle: string, detail: string) => void
  setGenError: (v: string) => void
  setPolishNotice: (v: string) => void
  patchMeeting: (id: string, patch: Partial<Meeting>) => void
  costConfirm: ReturnType<typeof useCostConfirm>
}

export function useSpeakerSuggest(deps: UseSpeakerSuggestDeps) {
  const {
    meetings,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    setGenError,
    setPolishNotice,
    patchMeeting,
    costConfirm,
  } = deps

  const [speakerSuggestions, setSpeakerSuggestions] = useState<SpeakerSuggestion[] | null>(null)
  const [suggestBusy, setSuggestBusy] = useState(false)
  const suggestRunningRef = useRef(false)

  const runLlmSpeakerPart = useCallback(
    async (id: string, rest: number[], ruleOnes: SpeakerSuggestion[]) => {
      const m = meetings.find((x) => x.id === id)
      if (!m) return
      if (suggestRunningRef.current) return
      suggestRunningRef.current = true
      setSuggestBusy(true)
      try {
        const knownLines = await parseLinesTask(m.transcript)
        const known = [...new Set(knownLines.map((l) => l.speaker).filter(Boolean))]
        const startedAt = Date.now()
        const annModel = agentModel("annotate")
        const annPrompt = agentPrompt("annotate")
        const res = await inferSpeakers(m.transcript, rest, known, annModel, {
          ...(annPrompt ? { agentPrompt: annPrompt } : {}),
        })
        logAiCall("infer", m, annModel, res)
        setSpeakerSuggestions((prev) => {
          const base = prev ?? ruleOnes
          const have = new Set(base.map((s) => s.line))
          const merged = [...base, ...res.data.filter((s) => !have.has(s.line))]
          return merged.sort((a, b) => a.line - b.line)
        })
        pushActivity(
          "智能标注",
          m.title,
          `AI 推断 ${res.data.length} 行说话人${res.fellBack ? `（降级到 ${res.usedModel}）` : ""} · 耗时 ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`,
        )
      } catch (e) {
        setGenError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
      } finally {
        suggestRunningRef.current = false
        setSuggestBusy(false)
      }
    },
    [meetings, agentModel, agentPrompt, pushActivity, logAiCall, setGenError],
  )

  const suggestSpeakersFor = useCallback(
    (id: string) => {
      const m = meetings.find((x) => x.id === id)
      if (!m) return
      const unlabeled = unlabeledLineNumbers(m.transcript)
      if (unlabeled.length === 0) {
        setSpeakerSuggestions([])
        return
      }
      setGenError("")
      // 第一步：本地规则（免费、即时）——自我介绍、称呼语应答
      const ruleOnes = ruleInferSpeakers(m.transcript)
      setSpeakerSuggestions(ruleOnes)
      const covered = new Set(ruleOnes.map((s) => s.line))
      const rest = unlabeled.filter((l) => !covered.has(l))
      if (rest.length === 0) return
      // 第二步：剩余行走 LLM（计费，先弹确认）
      costConfirm.runWithCostConfirm(() => {
        void runLlmSpeakerPart(id, rest, ruleOnes)
      }, SPEAKER_PRICE_TEXT)
    },
    [meetings, costConfirm, runLlmSpeakerPart, setGenError],
  )

  // 采纳勾选的建议：给对应行加「说话人：」前缀（保留已有时间戳）；
  // 覆盖前留原稿快照，可一键还原；期间用户已手动标注的行自动跳过
  const applySpeakerSuggestions = useCallback(
    (id: string, accepted: SpeakerSuggestion[]) => {
      const m = meetings.find((x) => x.id === id)
      setSpeakerSuggestions(null)
      if (!m || accepted.length === 0) return
      void (async () => {
        const lines = m.transcript.split("\n")
        const parsed = await parseLinesTask(m.transcript)
        let applied = 0
        for (const s of accepted) {
          const idx = s.line - 1
          const l = parsed[idx]
          if (!l || l.speaker || idx >= lines.length) continue
          const name = s.speaker.replace(/[:：]/g, "").trim().slice(0, 12)
          if (!name) continue
          const text = (l.text || lines[idx]).trim()
          if (!text) continue
          lines[idx] = l.time ? `[${l.time}] ${name}：${text}` : `${name}：${text}`
          applied++
        }
        if (applied === 0) return
        patchMeeting(id, { transcript: lines.join("\n"), prePolish: m.transcript })
        setPolishNotice(`已为 ${applied} 行写入说话人标记`)
        pushActivity("智能标注", m.title, `采纳 ${applied} 条建议写入说话人标记`)
      })()
    },
    [meetings, patchMeeting, pushActivity, setPolishNotice],
  )

  const cancelSpeakerSuggest = useCallback(() => setSpeakerSuggestions(null), [])

  return {
    speakerSuggestions,
    suggestBusy,
    suggestSpeakersFor,
    applySpeakerSuggestions,
    cancelSpeakerSuggest,
  }
}
