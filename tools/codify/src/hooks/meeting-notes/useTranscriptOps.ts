// 领域 hook · 转写操作：从 useMeetingNotes 整段迁出，行为不变。
// 转写稿是用户的原始资产，本域的所有操作围绕「改动可追溯、AI 整理可回滚」：
// - setTranscript：手动编辑即作废整理快照与保真报告；连续击键攒成修正会话，
//   静默 2s 后结算进修正事件日志（字符级画像：替换≈同音错字、删除≈丢词）——转录质量的自动度量原料
// - 补标点整理（付费，先过成本确认）：LLM 只许动标点分段，逐块保真校验机器对账，
//   口误改口走本地规则，写入前留原稿快照可一键还原
// - 整稿翻译（付费，先过成本确认）：走「翻译」服务商通道（默认大模型引擎），
//   译文存独立副本层 meeting.translation，转写原文永不被覆盖
// - 会中随手记：用户批注随会议保存，生成摘要时作为「优先呼应」原料注入
// - 重复会议检测：与既有会议相似度 ≥85% 时提示（本地免费，文本 Worker 扫描）

import { useCallback, useEffect, useRef, useState } from "react"
import { llmErrorMessage, polishTranscript } from "@/lib/ai"
import { correctSlips } from "@/lib/clean"
import { recordEditEvent } from "@/lib/editLog"
import type { FidelityReport } from "@/lib/fidelity"
import { getActiveLlm } from "@/lib/providers"
import { translateLangLabel, translateViaProvider } from "@/lib/translate"
import { beginOp, endOp } from "@/lib/oplog"
import { journalPatch } from "@/lib/eventJournal"
import { newId, type Meeting } from "@/lib/store"
import { dedupScanTask, fidelityTask } from "@/lib/textWorkerClient"
import type { AgentRole } from "@/lib/agents"
import type { ChainResult } from "@/lib/ai"
import type { useCostConfirm } from "@/hooks/useCostConfirm"

const POLISH_PRICE_TEXT = "将调用 AI 为转写文本补标点并分段，按实际 token 扣费，具体费用以 RunningHub 为准"
const TRANSLATE_PRICE_TEXT = "将调用翻译引擎把整份转写译成目标语言，按实际 token 扣费，具体费用以 RunningHub 为准"

// ── 质量信号采集 helper（模块级纯逻辑，供 setTranscript 的修正会话结算用）──

// 转写稿行首说话人标注（与 hotwords 同口径）：修正会话结算时统计标注改动量
const EDIT_SPEAKER_RE = /^[ \t]*(?:\[[^\]]*\][ \t]*)?([^:：[\]\n]{1,12})[:：]/gm

function speakerMultiset(text: string): Map<string, number> {
  const map = new Map<string, number>()
  EDIT_SPEAKER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = EDIT_SPEAKER_RE.exec(text)) !== null) {
    const name = m[1].trim()
    if (name) map.set(name, (map.get(name) ?? 0) + 1)
  }
  return map
}

function speakerDiffCount(before: string, after: string): number {
  const a = speakerMultiset(before)
  const b = speakerMultiset(after)
  let diff = 0
  for (const [k, v] of a) diff += Math.abs(v - (b.get(k) ?? 0))
  for (const [k, v] of b) if (!a.has(k)) diff += v
  return diff
}

function countNonEmptyLines(text: string): number {
  let n = 0
  for (const l of text.split("\n")) if (l.trim()) n++
  return n
}

// 结算一次转写编辑会话：纯追加（实时转写定稿 / 粘贴新内容）不算修正，直接丢弃；
// 内容字符有增删改时复用保真校验的对齐引擎做字符级画像（替换≈同音错字、删除≈丢词），
// 连同断句 / 说话人标注变化一起写入修正事件日志——转录质量的自动度量原料
async function recordTranscriptEditSession(
  meeting: { id: string; title: string; meetingKind?: string },
  before: string,
  after: string,
): Promise<void> {
  const strip = (s: string): string => s.replace(/\s+/g, "")
  const nb = strip(before)
  const na = strip(after)
  if (na.startsWith(nb) && na.length > nb.length) return // 纯追加 = 录入，不是修正
  const linesDelta = Math.abs(countNonEmptyLines(after) - countNonEmptyLines(before))
  const speakersChanged = speakerDiffCount(before, after)
  if (nb === na) {
    // 内容字符完全一致：只动了标点 / 空白 / 断句 / 说话人标注
    recordEditEvent(meeting, {
      target: "transcript",
      profile: { inserts: 0, deletes: 0, subs: 0, punctOnly: true, linesDelta, speakersChanged },
    })
    return
  }
  const report = await fidelityTask(before, after)
  recordEditEvent(meeting, {
    target: "transcript",
    profile: {
      inserts: report.insertChars,
      deletes: report.deleteChars,
      subs: report.subChars,
      punctOnly: false,
      linesDelta,
      speakersChanged,
    },
  })
}

export interface UseTranscriptOpsDeps {
  meetings: Meeting[]
  selected: Meeting | null
  // 会议数据 ref 由 facade 持有：修正会话结算时取最新会议（避免闭包过期）
  meetingsRef: React.MutableRefObject<Meeting[]>
  setMeetings: React.Dispatch<React.SetStateAction<Meeting[]>>
  patchMeeting: (id: string, patch: Partial<Meeting>) => void
  setGenError: (v: string) => void
  // 热词来自 facade（历史会议专有名词，注入整理提示词校正写法）
  getHotwords: () => string[]
  agentModel: (role: AgentRole) => string
  agentPrompt: (role: AgentRole) => string | undefined
  logAiCall: (
    kind: string,
    meeting: { id: string; title: string } | null,
    preferred: string,
    res: ChainResult<unknown>,
  ) => void
  pushActivity: (kind: string, meetingTitle: string, detail: string) => void
  costConfirm: ReturnType<typeof useCostConfirm>
  // 存储域的立即落盘：AI 整理结果确认后马上持久化（配合 lib/oplog.ts 意图标记）
  flushPersist: () => Promise<void>
}

export function useTranscriptOps(deps: UseTranscriptOpsDeps) {
  const {
    meetings,
    selected,
    meetingsRef,
    setMeetings,
    patchMeeting,
    setGenError,
    getHotwords,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    costConfirm,
    flushPersist,
  } = deps

  const [polishing, setPolishing] = useState(false)
  const [polishNotice, setPolishNotice] = useState("")
  // 逐块保真校验报告：补标点分段后，整理稿与原文逐块字符级对账，机器抓出静默改写
  // （meetingId 绑定当前会议；转写稿再被编辑 / 还原 / 切换会议即作废）
  const [polishFidelity, setPolishFidelity] = useState<(FidelityReport & { meetingId: string }) | null>(null)

  // 转写修正会话：连续击键攒成一次会话，静默 2s 后结算进修正事件日志
  // （质量信号的原料）；会话起点存快照，结算时用最终文本做字符级画像
  const transcriptSessionsRef = useRef(
    new Map<string, { before: string; timer: ReturnType<typeof setTimeout> }>(),
  )

  const setTranscript = useCallback(
    // 手动改动转写稿即作废「整理前原稿」快照（快照已过时，还原反而丢新编辑）；
    // 保真校验报告针对的是上一次整理结果，手改后同样作废
    (id: string, transcript: string) => {
      setPolishFidelity((prev) => (prev && prev.meetingId === id ? null : prev))
      patchMeeting(id, { transcript, prePolish: undefined })
      // 质量信号采集：纯追加（实时转写 / 粘贴）会在结算时被识别并跳过，只记真正的修正
      const sessions = transcriptSessionsRef.current
      const existing = sessions.get(id)
      if (existing) clearTimeout(existing.timer)
      const before = existing?.before ?? meetingsRef.current.find((x) => x.id === id)?.transcript ?? ""
      const timer = setTimeout(() => {
        sessions.delete(id)
        const m = meetingsRef.current.find((x) => x.id === id)
        if (!m) return
        void recordTranscriptEditSession(
          { id: m.id, title: m.title, ...(m.meetingKind ? { meetingKind: m.meetingKind } : {}) },
          before,
          transcript,
        )
      }, 2000)
      sessions.set(id, { before, timer })
    },
    [patchMeeting, meetingsRef],
  )

  // ── 会中随手记：用户自己的批注，随会议保存；生成摘要时作为「优先呼应」的原料注入 ──
  const addNote = useCallback(
    (id: string, text: string, elapsedLabel?: string) => {
      const t = text.trim().slice(0, 200)
      if (!t) return
      // 补丁在 updater 外用实时快照算好，先记事件日志（条目级差异）再应用
      const live = meetingsRef.current.find((m) => m.id === id)
      if (!live) return
      const notes = [
        ...(live.notes ?? []),
        { id: newId(), at: Date.now(), text: t, ...(elapsedLabel ? { elapsedLabel } : {}) },
      ]
      journalPatch(id, live, { notes })
      setMeetings((prev) =>
        prev.map((m) => (m.id === id ? { ...m, notes, updatedAt: Date.now() } : m)),
      )
    },
    [setMeetings, meetingsRef],
  )

  const removeNote = useCallback(
    (id: string, noteId: string) => {
      const live = meetingsRef.current.find((m) => m.id === id)
      if (!live) return
      const notes = (live.notes ?? []).filter((n) => n.id !== noteId)
      journalPatch(id, live, { notes })
      setMeetings((prev) =>
        prev.map((m) => (m.id === id ? { ...m, notes, updatedAt: Date.now() } : m)),
      )
    },
    [setMeetings, meetingsRef],
  )

  // 实时转写开始时记录绝对时间锚点（行内时间戳是相对时间，跨会议检索靠它换算）
  const setRecStartedAt = useCallback(
    (id: string, at: number) => patchMeeting(id, { recStartedAt: at }),
    [patchMeeting],
  )

  const polishRunningRef = useRef(false)

  const runPolish = useCallback(
    async (id: string) => {
      const m = meetings.find((x) => x.id === id)
      if (!m || m.transcript.trim().length < 20) return
      if (polishRunningRef.current) return // 并发锁：整理中重复点击直接忽略
      polishRunningRef.current = true
      const startedAt = Date.now()
      const llmId = getActiveLlm().meta.id
      setPolishing(true)
      setPolishNotice("")
      setPolishFidelity(null)
      setGenError("")
      // 崩溃安全「先写意图」：付费整理开始前写 localStorage 意图标记（lib/oplog.ts）
      const opId = beginOp("整理转写", id, m.title)
      try {
        const annModel = agentModel("annotate")
        const annPrompt = agentPrompt("annotate")
        const hotwords = getHotwords()
        const res = await polishTranscript(m.transcript, annModel, {
          ...(annPrompt ? { agentPrompt: annPrompt } : {}),
          ...(hotwords.length > 0 ? { hotwords } : {}),
        })
        logAiCall("polish", m, annModel, res)
        // 逐块保真校验（本地机器对账，免费）：整理提示词禁止改写，但 LLM 仍可能静默
        // 丢词/加词/改措辞——对模型原始输出（口误规则修正前）与原文做字符级对齐，
        // 只放行标点/分段/小步错别字替换，其余标记「疑似改写」交用户对照，不静默接受。
        const fidelity = await fidelityTask(m.transcript, res.data)
        setPolishFidelity({ ...fidelity, meetingId: id })
        // 口误自我纠正（本地规则、免费）：整理提示词禁止 LLM 改写内容，
        // 「X——不，还是Y」这类显式改口由规则层处理——输出 Y 并标注（已修正）
        let slipCount = 0
        const polished = res.data
          .split("\n")
          .map((l) => {
            const r = correctSlips(l)
            slipCount += r.count
            return r.text
          })
          .join("\n")
        // 整理是覆盖式写入：先留原稿快照，不满意可一键还原
        patchMeeting(id, { transcript: polished, prePolish: m.transcript })
        // 崩溃安全「再写结果」：整理稿立即落盘（flushPersist 内部先等一拍让 React
        // 提交 setState，再串行入队等待写入确认）——覆盖式写入绝不等防抖窗口
        await flushPersist()
        const fidelityNote =
          fidelity.flagged > 0
            ? `；⚠️ 保真校验发现 ${fidelity.flagged} 处疑似内容改动（丢词/加词/改写），详见下方校验面板，可一键还原`
            : `；逐块保真校验通过（${fidelity.chunks} 块全部对上原文${fidelity.typoFixes > 0 ? `，放行 ${fidelity.typoFixes} 处疑似错别字修正` : ""}）`
        setPolishNotice(
          `${
            res.fellBack
              ? `首选模型失败，已改用 ${res.usedModel} 整理（重跑会先从首选模型重试）；已补全标点并按话题分段，请核对内容`
              : "已补全标点并按话题分段，内容未做增删，请核对"
          }${hotwords.length > 0 ? `；专有名词已按 ${hotwords.length} 个历史热词校正写法` : ""}${
            slipCount > 0 ? `；修正 ${slipCount} 处口误改口（标注「已修正」）` : ""
          }${fidelityNote}`,
        )
        pushActivity(
          "整理转写",
          m.title,
          `补标点分段，模型 ${res.usedModel}${res.fellBack ? "（降级）" : ""} · 保真校验 ${fidelity.flagged > 0 ? `发现 ${fidelity.flagged} 处疑似改动` : `通过（${fidelity.chunks} 块）`} · 耗时 ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s · 服务商 ${llmId}`,
        )
      } catch (e) {
        setGenError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
      } finally {
        // 成功路径此时结果已确认落盘；失败路径没有产出——两种情况都清标记。
        // 进程在中途被杀则 finally 不会执行，标记残留，下次启动挂恢复提示
        endOp(opId)
        polishRunningRef.current = false
        setPolishing(false)
      }
    },
    [meetings, agentModel, agentPrompt, patchMeeting, pushActivity, logAiCall, getHotwords, setGenError, flushPersist],
  )

  const polishTranscriptFor = useCallback(
    (id: string) => {
      costConfirm.runWithCostConfirm(() => {
        void runPolish(id)
      }, POLISH_PRICE_TEXT)
    },
    [costConfirm, runPolish],
  )

  // 关闭保真校验面板（只收起展示，转写稿与快照不受影响）
  const dismissPolishFidelity = useCallback(() => setPolishFidelity(null), [])

  // 一键还原整理前的原稿（快照存在时可用）
  const undoPolish = useCallback(
    (id: string) => {
      const m = meetings.find((x) => x.id === id)
      if (!m || m.prePolish === undefined) return
      // 质量信号：还原 = 用户对整理稿整体不满意的强信号
      recordEditEvent(m, { target: "polish-undo" })
      patchMeeting(id, { transcript: m.prePolish, prePolish: undefined })
      setPolishNotice("")
      setPolishFidelity(null) // 整理稿已回滚，校验报告随之作废
    },
    [meetings, patchMeeting],
  )

  // ── 整稿翻译：走「翻译」服务商通道（设置页可换引擎），译文存独立副本层 ──
  const [translating, setTranslating] = useState(false)
  const [translateProgress, setTranslateProgress] = useState<{ done: number; total: number } | null>(null)
  const [translateNotice, setTranslateNotice] = useState("")
  const translateRunningRef = useRef(false)

  const runTranslate = useCallback(
    async (id: string, targetLang: string) => {
      const m = meetings.find((x) => x.id === id)
      if (!m || m.transcript.trim().length < 20) return
      if (translateRunningRef.current) return // 并发锁：翻译中重复点击直接忽略
      translateRunningRef.current = true
      const startedAt = Date.now()
      setTranslating(true)
      setTranslateNotice("")
      setTranslateProgress(null)
      setGenError("")
      // 崩溃安全「先写意图」（口径同补标点整理）
      const opId = beginOp("翻译转写", id, m.title)
      try {
        const model = agentModel("translate")
        const prompt = agentPrompt("translate")
        const hotwords = getHotwords()
        const outcome = await translateViaProvider(m.transcript, {
          targetLang,
          model,
          ...(prompt ? { agentPrompt: prompt } : {}),
          ...(hotwords.length > 0 ? { hotwords } : {}),
          onProgress: (done, total) => setTranslateProgress({ done, total }),
        })
        if (!outcome.text.trim()) throw new Error("empty_translation")
        // 记账本：与其他 AI 调用同口径（模型 / 降级 / 耗时 / token），按翻译 Agent 聚合
        logAiCall("translate", m, model, {
          data: outcome.text,
          usedModel: outcome.engine,
          fellBack: outcome.fellBack,
          durationMs: outcome.durationMs,
          attempts: outcome.attempts,
          ...(outcome.tokens ? { tokens: outcome.tokens } : {}),
        })
        patchMeeting(id, {
          translation: {
            text: outcome.text,
            lang: targetLang,
            engine: outcome.engine,
            generatedAt: Date.now(),
          },
        })
        // 旁路产物也立即落盘：长稿翻译成本高，进程被杀不该丢译文
        await flushPersist()
        setTranslateNotice(
          `已翻译为${translateLangLabel(targetLang)}（引擎 ${outcome.engine}${
            outcome.fellBack ? "，部分分块发生过模型降级" : ""
          }）；译文是独立副本，原转写稿未改动`,
        )
        pushActivity(
          "翻译转写",
          m.title,
          `→ ${translateLangLabel(targetLang)} · 引擎 ${outcome.engine}${outcome.fellBack ? "（降级）" : ""} · 耗时 ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`,
        )
      } catch (e) {
        const reason = e instanceof Error ? e.message : "unknown"
        setGenError(
          reason === "no_translate_provider"
            ? "当前没有可用的翻译引擎，请在「设置 → 服务商 → 翻译」里检查"
            : reason === "empty_translation"
              ? "翻译引擎返回了空译文，请稍后重试"
              : llmErrorMessage(reason),
        )
      } finally {
        endOp(opId)
        translateRunningRef.current = false
        setTranslating(false)
        setTranslateProgress(null)
      }
    },
    [meetings, agentModel, agentPrompt, getHotwords, logAiCall, patchMeeting, pushActivity, setGenError, flushPersist],
  )

  const translateTranscriptFor = useCallback(
    (id: string, targetLang: string) => {
      costConfirm.runWithCostConfirm(() => {
        void runTranslate(id, targetLang)
      }, TRANSLATE_PRICE_TEXT)
    },
    [costConfirm, runTranslate],
  )

  // 清除译文副本（转写原文不受影响）
  const clearTranslation = useCallback(
    (id: string) => {
      patchMeeting(id, { translation: undefined })
      setTranslateNotice("")
    },
    [patchMeeting],
  )

  // ── 重复会议检测：粘贴进来的转写与既有某场会议高度相似时提示，避免同一场会存两份 ──
  // 同一场会议的修订版 / 清洗前后版（相似度 ≥85%）也会被抓住，percent 供 UI 展示。
  // 相似度是 O(长度) 的重计算，输入停顿 600ms 后才跑，且两侧各截前 2 万字。
  const [duplicateWarning, setDuplicateWarning] = useState<{
    id: string
    title: string
    percent: number
  } | null>(null)

  useEffect(() => {
    if (!selected || selected.transcript.trim().length < 20) {
      setDuplicateWarning(null)
      return
    }
    let stale = false
    const timer = setTimeout(() => {
      void (async () => {
        const raw = selected.transcript
        // 长度比例预筛在主线程做（廉价），指纹 + 8-gram 相似度扫描整体走文本 Worker——
        // 一次往返完成，避免 N 个候选 N 次请求；500ms 超时自动回退主线程同步
        const candidates = meetings
          .filter((m) => {
            if (m.id === selected.id || m.transcript.trim().length < 20) return false
            const ratio = m.transcript.length / raw.length
            return ratio >= 0.5 && ratio <= 2
          })
          .map((m) => ({ id: m.id, title: m.title, transcript: m.transcript.slice(0, 20_000) }))
        const hit = await dedupScanTask(raw, candidates)
        if (stale) return
        setDuplicateWarning(hit)
      })()
    }, 600)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [meetings, selected])

  return {
    // 转写编辑与修正会话
    setTranscript,
    addNote,
    removeNote,
    setRecStartedAt,
    // 补标点整理 + 保真校验
    polishing,
    polishNotice,
    setPolishNotice,
    polishFidelity,
    setPolishFidelity,
    polishTranscriptFor,
    dismissPolishFidelity,
    undoPolish,
    // 整稿翻译
    translating,
    translateProgress,
    translateNotice,
    setTranslateNotice,
    translateTranscriptFor,
    clearTranslation,
    // 重复会议检测
    duplicateWarning,
  }
}
