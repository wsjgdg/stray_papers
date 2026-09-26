// 领域 hook · 评估台（个人 golden set）：从 useMeetingNotes 整段迁出，行为不变。
// 固定的代表性会议 + 完整生产管线重跑 + 自动指标 + 对比判定/四维打分。
// 每次调提示词 / 换模型后跑同一套「考卷」，产出快照与历史运行可比——质量变化可追踪，
// 不靠「感觉变好了」。重跑结果只写评估记录，绝不触碰既有纪要。
//
// 依赖通过参数注入（facade 组合），本 hook 只拥有评估域自己的状态：
// evalBusy / evalProgress / evalError / evalRuns（localStorage 持久化）。

import { useCallback, useMemo, useRef, useState } from "react"
import {
  composeSummaryFromFacts,
  extractFacts,
  extractItems,
  generateSummary,
  llmErrorMessage,
  type ChainResult,
  type SummaryResult,
} from "@/lib/ai"
import { cleanTask } from "@/lib/textWorkerClient"
import { detectOmissions } from "@/lib/omission"
import {
  loadEvalRuns,
  saveEvalRuns,
  type EvalMeetingResult,
  type EvalRun,
  type EvalScores,
} from "@/lib/evalRun"
import { newId, type AppSettings, type Meeting, type MeetingFact, type MeetingTemplate } from "@/lib/store"
import type { AgentRole } from "@/lib/agents"
import type { useCostConfirm } from "@/hooks/useCostConfirm"

export interface UseEvalBenchDeps {
  meetings: Meeting[]
  meetingsRef: { current: Meeting[] }
  setMeetings: React.Dispatch<React.SetStateAction<Meeting[]>>
  agentModel: (role: AgentRole) => string
  agentPrompt: (role: AgentRole) => string | undefined
  templates: MeetingTemplate[]
  settings: AppSettings
  logAiCall: (
    kind: string,
    meeting: { id: string; title: string } | null,
    preferred: string,
    res: ChainResult<unknown>,
  ) => void
  pushActivity: (kind: string, meetingTitle: string, detail: string) => void
  costConfirm: ReturnType<typeof useCostConfirm>
}

// 评估台费用随运行规模变化，文案按需生成
const evalPriceText = (n: number): string =>
  `将按当前提示词与模型，为评估集里的 ${n} 场会议重跑「事实提取 → 摘要组织 → 行动项抽取」（最多 ${n * 3} 次付费调用），按实际 token 扣费，具体费用以 RunningHub 为准；评估产出只写入评估台，不改动既有纪要`

export function useEvalBench(deps: UseEvalBenchDeps) {
  const {
    meetings,
    meetingsRef,
    setMeetings,
    agentModel,
    agentPrompt,
    templates,
    settings,
    logAiCall,
    pushActivity,
    costConfirm,
  } = deps

  const [evalBusy, setEvalBusy] = useState(false)
  const [evalProgress, setEvalProgress] = useState<{ done: number; total: number; title: string } | null>(null)
  const [evalError, setEvalError] = useState("")
  const [evalRuns, setEvalRuns] = useState<EvalRun[]>(loadEvalRuns)
  const evalRunningRef = useRef(false)

  const goldenCount = useMemo(
    () => meetings.filter((m) => m.golden && m.transcript.trim().length >= 20).length,
    [meetings],
  )

  const toggleGolden = useCallback((id: string) => {
    setMeetings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, golden: !m.golden, updatedAt: Date.now() } : m)),
    )
  }, [setMeetings])

  const runEvalBench = useCallback(
    async (label: string, sample = 0) => {
      if (evalRunningRef.current) return
      const all = meetingsRef.current.filter(
        (m) => m.golden && m.transcript.trim().length >= 20,
      )
      if (all.length === 0) {
        setEvalError("评估集里还没有会议——先给几场有代表性的会议打上「评估集」星标")
        return
      }
      // 抽样而非全量：每次小成本跑 2-3 场，多次运行轮换覆盖评估集；sample=0 表示全量
      let targets = all
      if (sample > 0 && sample < all.length) {
        const pool = [...all]
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        targets = pool.slice(0, sample)
      }
      evalRunningRef.current = true
      setEvalBusy(true)
      setEvalError("")
      const startedAt = Date.now()
      const results: EvalMeetingResult[] = []
      try {
        for (let i = 0; i < targets.length; i++) {
          const m = targets[i]
          setEvalProgress({ done: i, total: targets.length, title: m.title })
          // 与生产同口径：模板提示语 + Agent 附加指令 + 置信度门槛 + FRAME 管线（可回退）；
          // 刻意不注入随手记与系列上下文——控制变量，运行间差异才能归因于本次改动
          const sumModel = agentModel("summary")
          const sumPrompt = agentPrompt("summary")
          const extModel = agentModel("extract")
          const extPrompt = agentPrompt("extract")
          const guidance = templates.find((t) => t.id === m.meetingKind)?.guidance ?? ""
          try {
            const cleaned = (await cleanTask(m.transcript)).cleaned
            let facts: MeetingFact[] = []
            let factsDiscarded = 0
            let usedFallback = false
            if (settings.frameSummary !== false) {
              try {
                const fRes = await extractFacts(m.title, cleaned, sumModel, {
                  ...(sumPrompt ? { agentPrompt: sumPrompt } : {}),
                })
                logAiCall("eval", m, sumModel, fRes)
                facts = fRes.data.facts
                factsDiscarded = fRes.data.discarded
              } catch (e) {
                const msg = e instanceof Error ? e.message : "unknown"
                if (msg === "rh_login_required" || msg === "insufficient_balance") throw e
                facts = []
              }
            }
            let res: ChainResult<SummaryResult>
            if (facts.length >= 3) {
              res = await composeSummaryFromFacts(m.title, m.date, facts, sumModel, guidance, {
                ...(sumPrompt ? { agentPrompt: sumPrompt } : {}),
              })
            } else {
              usedFallback = true
              res = await generateSummary(m.title, m.date, cleaned, sumModel, guidance, {
                ...(sumPrompt ? { agentPrompt: sumPrompt } : {}),
              })
            }
            logAiCall("eval", m, sumModel, res)
            const extRes = await extractItems(m.title, cleaned, {
              model: extModel,
              minConfidence: settings.minConfidence,
              rawTranscript: m.transcript,
              ...(extPrompt ? { agentPrompt: extPrompt } : {}),
            })
            logAiCall("eval", m, extModel, extRes)
            // 自动指标（本地规则实时算，免费）：机器能算的不让人打分——
            // 引用校验通过率（忠实度代理）/ 事实引用率与遗漏候选数（覆盖率代理）
            const summaryText = [
              res.data.brief,
              ...res.data.topics.flatMap((t) => [t.topic, ...t.points]),
            ].join("\n")
            const referencedFactIds = res.data.topics.flatMap((t) => t.factIds ?? [])
            const omissionCount = detectOmissions({
              transcript: cleaned,
              summaryText,
              extraTerms: extRes.data.actions
                .map((a) => a.assignee.trim())
                .filter(Boolean)
                .map((token) => ({ token, kind: "person" as const })),
              facts,
              referencedFactIds,
            }).length
            const factTotal = facts.length + factsDiscarded
            results.push({
              meetingId: m.id,
              title: m.title,
              brief: res.data.brief,
              topics: res.data.topics,
              actions: extRes.data.actions.map((a) => ({
                content: a.content,
                assignee: a.assignee,
                dueDate: a.dueDate,
              })),
              factsCount: facts.length,
              discardedCount: factsDiscarded + extRes.data.discarded,
              factsDiscarded,
              usedFallback,
              model: res.usedModel,
              auto: {
                quotePassRate: factTotal > 0 ? facts.length / factTotal : null,
                factReferenceRate: facts.length > 0 ? new Set(referencedFactIds).size / facts.length : null,
                omissionCount,
              },
            })
          } catch (e) {
            const msg = e instanceof Error ? e.message : "unknown"
            // 登录/余额问题整批中止（后面的场次也跑不成）；单场失败记录后继续
            if (msg === "rh_login_required" || msg === "insufficient_balance") throw e
            results.push({
              meetingId: m.id,
              title: m.title,
              brief: "",
              topics: [],
              actions: [],
              factsCount: 0,
              discardedCount: 0,
              usedFallback: false,
              model: "",
              error: llmErrorMessage(msg),
            })
          }
        }
        const run: EvalRun = {
          id: newId(),
          at: Date.now(),
          label: label.trim(),
          preferredModel: settings.model,
          results,
          scores: {},
          ...(targets.length < all.length ? { sampledCount: targets.length, goldenTotal: all.length } : {}),
        }
        setEvalRuns((prev) => {
          const next = [run, ...prev]
          saveEvalRuns(next)
          return next
        })
        pushActivity(
          "评估台",
          `${results.length} 场评估集会议`,
          `${label.trim() || "未标注改动"} · 首选模型 ${settings.model} · 失败 ${results.filter((r) => r.error).length} 场 · 耗时 ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`,
        )
      } catch (e) {
        setEvalError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
      } finally {
        evalRunningRef.current = false
        setEvalBusy(false)
        setEvalProgress(null)
      }
    },
    [meetingsRef, agentModel, agentPrompt, templates, settings, logAiCall, pushActivity],
  )

  const evalBenchFor = useCallback(
    (label: string, sample = 0) => {
      const total = meetingsRef.current.filter(
        (m) => m.golden && m.transcript.trim().length >= 20,
      ).length
      if (total === 0) {
        setEvalError("评估集里还没有会议——先给几场有代表性的会议打上「评估集」星标")
        return
      }
      // 费用文案按实际要跑的场数（抽样时是抽样数）
      const n = sample > 0 ? Math.min(sample, total) : total
      costConfirm.runWithCostConfirm(() => {
        void runEvalBench(label, sample)
      }, evalPriceText(n))
    },
    [costConfirm, meetingsRef, runEvalBench],
  )

  // 打分即存（写入评估记录，随本地档案持久化）
  const saveEvalScores = useCallback((runId: string, meetingId: string, patch: EvalScores) => {
    setEvalRuns((prev) => {
      const next = prev.map((r) =>
        r.id === runId
          ? {
              ...r,
              scores: {
                ...r.scores,
                [meetingId]: { ...r.scores[meetingId], ...patch },
              },
            }
          : r,
      )
      saveEvalRuns(next)
      return next
    })
  }, [])

  const setEvalRunLabel = useCallback((runId: string, label: string) => {
    setEvalRuns((prev) => {
      const next = prev.map((r) => (r.id === runId ? { ...r, label } : r))
      saveEvalRuns(next)
      return next
    })
  }, [])

  const deleteEvalRun = useCallback((runId: string) => {
    setEvalRuns((prev) => {
      const next = prev.filter((r) => r.id !== runId)
      saveEvalRuns(next)
      return next
    })
  }, [])

  return {
    goldenCount,
    toggleGolden,
    evalBusy,
    evalProgress,
    evalError,
    evalRuns,
    evalBenchFor,
    saveEvalScores,
    setEvalRunLabel,
    deleteEvalRun,
  }
}
