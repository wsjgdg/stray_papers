// 领域 hook · AI 产出的第二意见：从 useMeetingNotes 整段迁出，行为不变。
// 两个独立检查，共同立场是「只建议不自动改」：
// - useSummaryReview：双模型交叉审查——第二个模型对照转写原文审查摘要稿，
//   问题按 结构性/遗漏/无关/事实性 分类并给修正建议 + 修正稿；用户点「采纳」才写入。
// - useSupportCheck：支撑核验——「引用存在」≠「引用支撑结论」，LLM judge 逐条判定
//   source_quote 的语义支撑度（强/弱/无），写回条目 support 字段；弱/无支撑醒目标注，判定权在用户。

import { useCallback, useRef, useState } from "react"
import {
  judgeSupportStrength,
  llmErrorMessage,
  pickReviewerModel,
  reviewSummary,
  type SummaryReview,
  type SummaryResult,
} from "@/lib/ai"
import type { Meeting } from "@/lib/store"
import type { AgentRole } from "@/lib/agents"
import type { ChainResult } from "@/lib/ai"
import type { useCostConfirm } from "@/hooks/useCostConfirm"

const REVIEW_PRICE_TEXT =
  "将调用第二个 AI 模型对照原文交叉审查摘要（费用约为一次摘要生成），按实际 token 扣费，具体费用以 RunningHub 为准"
const SUPPORT_PRICE_TEXT =
  "将调用 AI 逐条审查行动项的原文引用是否真正支撑结论（强/弱/无支撑三级），按实际 token 扣费，具体费用以 RunningHub 为准"

// 支撑核验汇总：一次「引用支撑强度审查」的结果概况（明细写回各行动项的 support 字段）
export interface SupportSummary {
  meetingId: string
  checked: number
  strong: number
  weak: number
  none: number
  model: string
}

// 两个 hook 共享的依赖形状
interface QualityDeps {
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
  costConfirm: ReturnType<typeof useCostConfirm>
}

// ── 双模型交叉审查 ──

export interface UseSummaryReviewDeps extends QualityDeps {
  patchMeeting: (id: string, patch: Partial<Meeting>) => void
  setPolishNotice: (v: string) => void
}

export function useSummaryReview(deps: UseSummaryReviewDeps) {
  const { meetings, agentModel, agentPrompt, logAiCall, pushActivity, costConfirm, patchMeeting, setPolishNotice } = deps

  const [reviewReport, setReviewReport] = useState<(SummaryReview & { meetingId: string }) | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState("")
  const reviewRunningRef = useRef(false)

  const runReview = useCallback(
    async (id: string) => {
      const m = meetings.find((x) => x.id === id)
      if (!m || reviewRunningRef.current) return
      const draft: SummaryResult = {
        brief: m.brief?.content ?? "",
        topics: m.outline?.topics ?? [],
      }
      if (!draft.brief && draft.topics.length === 0) return
      reviewRunningRef.current = true
      setReviewBusy(true)
      setReviewError("")
      const startedAt = Date.now()
      try {
        const genModel = m.brief?.model || m.outline?.model || ""
        const reviewer = pickReviewerModel(genModel, agentModel("summary"))
        const sumPrompt = agentPrompt("summary")
        const res = await reviewSummary(m.title, m.cleaned || m.transcript, draft, reviewer, {
          ...(sumPrompt ? { agentPrompt: sumPrompt } : {}),
        })
        logAiCall("review", m, reviewer, res)
        setReviewReport({ ...res.data, meetingId: id })
        pushActivity(
          "交叉审查",
          m.title,
          `审查模型 ${res.usedModel}${genModel && res.usedModel !== genModel ? "（与生成模型不同）" : "（同模型审查角色）"} · 发现 ${res.data.issues.length} 个问题${res.data.revised ? " · 已附修正稿" : ""} · 耗时 ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`,
        )
      } catch (e) {
        setReviewError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
      } finally {
        reviewRunningRef.current = false
        setReviewBusy(false)
      }
    },
    [meetings, agentModel, agentPrompt, pushActivity, logAiCall],
  )

  const reviewSummaryFor = useCallback(
    (id: string) => {
      costConfirm.runWithCostConfirm(() => {
        void runReview(id)
      }, REVIEW_PRICE_TEXT)
    },
    [costConfirm, runReview],
  )

  // 采纳修正稿：覆盖未被用户手改过的摘要层；手改过的层跳过并如实告知
  const applyReview = useCallback(
    (id: string) => {
      const report = reviewReport
      if (!report || report.meetingId !== id || !report.revised) return
      const m = meetings.find((x) => x.id === id)
      if (!m) return
      const now = Date.now()
      const skipEdited = Boolean(m.brief?.editedByUser) || Boolean(m.outline?.editedByUser)
      patchMeeting(id, {
        ...(m.brief?.editedByUser
          ? {}
          : {
              brief: {
                content: report.revised.brief,
                model: report.reviewerModel,
                editedByUser: false,
                generatedAt: now,
              },
            }),
        ...(m.outline?.editedByUser
          ? {}
          : {
              outline: {
                topics: report.revised.topics,
                model: report.reviewerModel,
                editedByUser: false,
                generatedAt: now,
              },
            }),
      })
      setReviewReport(null)
      setPolishNotice(
        skipEdited
          ? "已采纳修正稿（你手动改过的层保持原样未覆盖）"
          : "已采纳交叉审查的修正稿",
      )
      pushActivity("交叉审查", m.title, "采纳修正稿写入摘要层")
    },
    [reviewReport, meetings, patchMeeting, pushActivity, setPolishNotice],
  )

  const clearReview = useCallback(() => {
    setReviewReport(null)
    setReviewError("")
  }, [])

  return { reviewReport, reviewBusy, reviewError, reviewSummaryFor, applyReview, clearReview }
}

// ── 支撑核验 ──

export interface UseSupportCheckDeps extends QualityDeps {
  setMeetings: React.Dispatch<React.SetStateAction<Meeting[]>>
}

export function useSupportCheck(deps: UseSupportCheckDeps) {
  const { meetings, setMeetings, agentModel, agentPrompt, logAiCall, pushActivity, costConfirm } = deps

  const [supportBusy, setSupportBusy] = useState(false)
  const [supportError, setSupportError] = useState("")
  const [supportSummary, setSupportSummary] = useState<SupportSummary | null>(null)
  const supportRunningRef = useRef(false)

  const runSupportCheck = useCallback(
    async (id: string) => {
      const m = meetings.find((x) => x.id === id)
      if (!m || supportRunningRef.current) return
      // 只核验带原文引用的条目（手动添加、没有 sourceQuote 的条目无从对账）；
      // 用户改过结论的条目也核验——改动是否偏离原文引用，恰恰最需要第二双眼睛
      const targets = m.actions
        .map((a, idx) => ({ a, idx }))
        .filter(({ a }) => a.sourceQuote.trim())
      if (targets.length === 0) {
        setSupportError("没有可核验的条目（AI 抽取且带原文引用的行动项才会被核验）")
        return
      }
      supportRunningRef.current = true
      setSupportBusy(true)
      setSupportError("")
      const startedAt = Date.now()
      try {
        const extModel = agentModel("extract")
        const extPrompt = agentPrompt("extract")
        const res = await judgeSupportStrength(
          m.title,
          m.cleaned || m.transcript,
          targets.slice(0, 50).map(({ a }) => ({ content: a.content, sourceQuote: a.sourceQuote })),
          extModel,
          { ...(extPrompt ? { agentPrompt: extPrompt } : {}) },
        )
        logAiCall("support", m, extModel, res)
        const now = Date.now()
        // 判定结果按行动项 id 归位（ref 是送审清单里的编号）；计数在 updater 外算好，
        // setMeetings 的 updater 必须保持纯函数（StrictMode 下会被双调用）
        const verdictById = new Map<string, (typeof res.data)[number]>()
        targets.slice(0, 50).forEach(({ a }, ref) => {
          const v = res.data.find((x) => x.ref === ref)
          if (v) verdictById.set(a.id, v)
        })
        let strong = 0
        let weak = 0
        let none = 0
        for (const v of verdictById.values()) {
          if (v.level === "strong") strong++
          else if (v.level === "weak") weak++
          else none++
        }
        setMeetings((prev) =>
          prev.map((cur) => {
            if (cur.id !== id) return cur
            const actions = cur.actions.map((a) => {
              const verdict = verdictById.get(a.id)
              if (!verdict) return a
              return {
                ...a,
                support: { level: verdict.level, reason: verdict.reason, at: now, model: res.usedModel },
              }
            })
            return { ...cur, actions, updatedAt: now }
          }),
        )
        setSupportSummary({
          meetingId: id,
          checked: verdictById.size,
          strong,
          weak,
          none,
          model: res.usedModel,
        })
        pushActivity(
          "支撑核验",
          m.title,
          `核验 ${verdictById.size} 条行动项引用：强支撑 ${strong}、弱支撑 ${weak}、无支撑 ${none} · 模型 ${res.usedModel} · 耗时 ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`,
        )
      } catch (e) {
        setSupportError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
      } finally {
        supportRunningRef.current = false
        setSupportBusy(false)
      }
    },
    [meetings, setMeetings, agentModel, agentPrompt, pushActivity, logAiCall],
  )

  const checkSupportFor = useCallback(
    (id: string) => {
      costConfirm.runWithCostConfirm(() => {
        void runSupportCheck(id)
      }, SUPPORT_PRICE_TEXT)
    },
    [costConfirm, runSupportCheck],
  )

  const clearSupportSummary = useCallback(() => {
    setSupportSummary(null)
    setSupportError("")
  }, [])

  return { supportBusy, supportError, supportSummary, checkSupportFor, clearSupportSummary }
}
