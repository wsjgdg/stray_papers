// 领域 hook · 生成主管线：从 useMeetingNotes 整段迁出，行为不变。
// 清洗（本地规则，免费）→ 摘要与抽取两个独立任务（可整跑也可单独重跑）。
// 立场：付费操作绝不允许双跑（同会议同任务并发锁）；用户改过的层永不覆盖（editedByUser）；
// FRAME 两步管线（事实提取→摘要组织）失败时静默回退一次成稿，登录/余额错误照样上抛。

import { useCallback, useRef, useState } from "react"
import {
  composeSummaryFromFacts,
  extractFacts,
  extractItems,
  generateSummary,
  llmErrorMessage,
  type ChainResult,
  type SummaryResult,
} from "@/lib/ai"
import { isOpenStatus, type AppSettings, type Meeting, type MeetingFact, type MeetingTemplate } from "@/lib/store"
import type { AgentRole } from "@/lib/agents"
import { getActiveLlm } from "@/lib/providers"
import { beginOp, endOp } from "@/lib/oplog"
import { cleanTask } from "@/lib/textWorkerClient"
import { buildIssueDrafts, dispatchWorkflowEvent } from "@/lib/workflows"
import { journalPatch } from "@/lib/eventJournal"
import type { useCostConfirm } from "@/hooks/useCostConfirm"

const PRICE_TEXT =
  "将调用 AI 生成会议纪要（默认走「事实提取 → 摘要组织」两步，可在设置里改回一步成稿），按实际 token 扣费，具体费用以 RunningHub 为准"

// 生成管线的任务开关：摘要与抽取可整跑也可单独重跑
export interface GenParts {
  summary?: boolean
  extract?: boolean
}

export interface UseGenerationDeps {
  meetings: Meeting[]
  setMeetings: React.Dispatch<React.SetStateAction<Meeting[]>>
  // 会议数据实时快照（facade 持有）：AI 结果写入前取「变更前状态」记事件日志差异，
  // 闭包里的 meetings 在 await 之后可能已过时，日志的 prev 必须尽量新
  meetingsRef: React.MutableRefObject<Meeting[]>
  settings: AppSettings
  templates: MeetingTemplate[]
  // 生成完成后跳到对应页签（只会跳「纪要」或「行动项」）
  setActiveTab: (tab: "summary" | "actions") => void
  agentModel: (role: AgentRole) => string
  agentPrompt: (role: AgentRole) => string | undefined
  agentReviewThreshold: (role: AgentRole) => number
  logAiCall: (
    kind: string,
    meeting: { id: string; title: string } | null,
    preferred: string,
    res: ChainResult<unknown>,
  ) => void
  pushActivity: (kind: string, meetingTitle: string, detail: string) => void
  costConfirm: ReturnType<typeof useCostConfirm>
  // 存储域的立即落盘（串行入队并等待写入确认）：付费产出生成后立即持久化，
  // 与 lib/oplog.ts 的意图标记配合构成「先写意图，再写结果」的崩溃安全写入
  flushPersist: () => Promise<void>
}

export function useGeneration(deps: UseGenerationDeps) {
  const {
    meetings,
    setMeetings,
    meetingsRef,
    settings,
    templates,
    setActiveTab,
    agentModel,
    agentPrompt,
    agentReviewThreshold,
    logAiCall,
    pushActivity,
    costConfirm,
    flushPersist,
  } = deps

  const [genBusy, setGenBusy] = useState<GenParts>({})
  const [genError, setGenError] = useState("")
  const [genNotice, setGenNotice] = useState("")
  const generating = Boolean(genBusy.summary || genBusy.extract)

  // 并发锁：同一会议同一任务在跑时，重复触发直接忽略——付费操作绝不允许双跑
  const runningRef = useRef<Set<string>>(new Set())

  const runParts = useCallback(
    async (id: string, parts: GenParts) => {
      const m = meetings.find((x) => x.id === id)
      if (!m || !m.transcript.trim()) return
      const wantSummary = Boolean(parts.summary) && !runningRef.current.has(`${id}:summary`)
      const wantExtract = Boolean(parts.extract) && !runningRef.current.has(`${id}:extract`)
      if (!wantSummary && !wantExtract) return
      if (wantSummary) runningRef.current.add(`${id}:summary`)
      if (wantExtract) runningRef.current.add(`${id}:extract`)
      // 崩溃安全「先写意图」：付费操作开始前同步写 localStorage 意图标记，
      // 结果确认落盘后清除；中途崩溃/关页，下次启动扫描到残留标记挂恢复提示
      const opId = beginOp(
        wantSummary && wantExtract ? "生成纪要" : wantSummary ? "生成摘要" : "抽取行动项",
        id,
        m.title,
      )
      // 调用溯源：记录本次走的 LLM 服务商与耗时，写进事件日志
      const startedAt = Date.now()
      const llmId = getActiveLlm().meta.id
      const elapsed = () => `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`
      setGenError("")
      setGenNotice("")
      setGenBusy((prev) => ({
        ...prev,
        ...(wantSummary ? { summary: true } : {}),
        ...(wantExtract ? { extract: true } : {}),
      }))

      // 前置清洗：独立步骤，产物（清洗稿）随会议保存；摘要与抽取只吃清洗稿。
      // 每次生成都重算，所以改清洗规则后重跑任意下游任务即用上新规则。
      const raw = m.transcript
      const { cleaned, report } = await cleanTask(raw)
      // 事件日志：清洗稿是大文本，只记「发生了什么」级别的差异（长度），不支持回滚
      const cleanPatch: Partial<Meeting> = { cleaned, cleanReport: { ...report, at: Date.now() } }
      journalPatch(id, meetingsRef.current.find((x) => x.id === id), cleanPatch, "文本清洗")
      setMeetings((prev) =>
        prev.map((cur) => (cur.id === id ? { ...cur, ...cleanPatch } : cur)),
      )

      const notices: string[] = []
      if (report.changedLines > 0) {
        notices.push(
          `已清洗文本：统一 ${report.timestamps} 处时间戳、${report.speakers} 处说话人标记${
            report.slips > 0 ? `、修正 ${report.slips} 处口误改口（标注「已修正」）` : ""
          }，共修正 ${report.changedLines} 行`,
        )
      }
      let anyFailed = false
      let summaryDone = false
      const tasks: Promise<void>[] = []

      if (wantSummary) {
        const sumModel = agentModel("summary")
        const sumPrompt = agentPrompt("summary")
        const guidance = templates.find((t) => t.id === m.meetingKind)?.guidance ?? ""
        // 用户的会中随手记：AI 对齐增强的原料（保留人的主动性，优先呼应）
        const userNotes = (m.notes ?? [])
          .map((n) => `- ${n.elapsedLabel ? `[${n.elapsedLabel}] ` : ""}${n.text}`)
          .join("\n")
          .slice(0, 2000)
        // 同系列历史上下文（自动构建，随档案积累越来越厚）：
        // 最近 3 场同系列会议的摘要 + 未结行动项，让本场纪要能呼应延续性
        let seriesContext = ""
        const sid = typeof m.seriesId === "string" ? m.seriesId.trim() : ""
        const kin = meetings.filter(
          (x) =>
            x.id !== m.id &&
            ((sid && x.seriesId === sid) ||
              (!sid && x.tags.length > 0 && x.tags.some((t) => m.tags.includes(t)))) &&
            (x.brief?.content || x.actions.some((a) => isOpenStatus(a.status) && a.content.trim())),
        )
        if (kin.length > 0) {
          seriesContext = kin
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 3)
            .map((p) => {
              const bits = [`【${p.date}】《${p.title}》`]
              if (p.brief?.content) bits.push(`摘要：${p.brief.content}`)
              const open = p.actions
                .filter((a) => isOpenStatus(a.status) && a.content.trim())
                .slice(0, 5)
                .map((a) => `${a.content}${a.assignee ? `（@${a.assignee}）` : ""}`)
              if (open.length > 0) bits.push(`未结行动项：${open.join("；")}`)
              return bits.join("\n")
            })
            .join("\n\n")
            .slice(0, 1500)
        }
        // FRAME 管线（设置可关）：先提取带原文支撑的原子事实（机器逐条核验 source_quote），
        // 再由事实聚类组织摘要——模型组织阶段只见事实清单不见全文，杜绝跨议题串台与编造。
        // 事实太少（短会/纯闲聊）或提取失败时回退一次成稿路径，不让管线反而降低可用性。
        const frameOn = settings.frameSummary !== false
        const persona = settings.summaryPersona ?? "neutral"
        tasks.push(
          (async () => {
        let facts: MeetingFact[] = []
        let factsDiscarded = 0
        let factsModel = ""
        let factsFellBack = false
        let factsCallFailed: string | null = null
        let usedFallback = false
        let res: ChainResult<SummaryResult>
        if (frameOn) {
          try {
            const fRes = await extractFacts(m.title, cleaned, sumModel, {
              ...(sumPrompt ? { agentPrompt: sumPrompt } : {}),
            })
            logAiCall("facts", m, sumModel, fRes)
            facts = fRes.data.facts
            factsDiscarded = fRes.data.discarded
            factsModel = fRes.usedModel
            factsFellBack = fRes.fellBack
          } catch (e) {
            // 提取阶段调用失败（登录/余额错误照样上抛，其余静默回退一次成稿）
            const msg = e instanceof Error ? e.message : "unknown"
            if (msg === "rh_login_required" || msg === "insufficient_balance") throw e
            facts = []
            factsCallFailed = msg
          }
        }
        if (facts.length >= 3) {
          res = await composeSummaryFromFacts(m.title, m.date, facts, sumModel, guidance, {
            ...(userNotes ? { userNotes } : {}),
            ...(seriesContext ? { seriesContext } : {}),
            ...(sumPrompt ? { agentPrompt: sumPrompt } : {}),
            persona,
          })
        } else {
          usedFallback = true
          res = await generateSummary(m.title, m.date, cleaned, sumModel, guidance, {
            ...(userNotes ? { userNotes } : {}),
            ...(seriesContext ? { seriesContext } : {}),
            ...(sumPrompt ? { agentPrompt: sumPrompt } : {}),
            persona,
          })
        }
        return { res, facts, factsDiscarded, factsModel, factsFellBack, factsCallFailed, usedFallback }
          })()
            .then(({ res, facts, factsDiscarded, factsModel, factsFellBack, factsCallFailed, usedFallback }) => {
              summaryDone = true
              logAiCall("summary", m, sumModel, res)
              const now = Date.now()
              // 补丁在 updater 外用实时快照算好（用户改过的摘要层不被覆盖），
              // 先记事件日志差异再应用——updater 保持纯函数（StrictMode 双调用无副作用）
              const live = meetingsRef.current.find((x) => x.id === id) ?? m
              const brief = live.brief?.editedByUser
                ? live.brief
                : {
                    content: res.data.brief,
                    model: res.usedModel,
                    editedByUser: false,
                    generatedAt: now,
                  }
              const outline = live.outline?.editedByUser
                ? live.outline
                : {
                    topics: res.data.topics,
                    model: res.usedModel,
                    editedByUser: false,
                    generatedAt: now,
                  }
              const sumPatch: Partial<Meeting> = {
                brief,
                outline,
                // 事实层随会议保存（中间产物独立可查）；回退时清掉旧事实避免误导
                ...(facts.length > 0
                  ? { facts, factsAt: now, factsModel, factsFallback: false }
                  : { facts: undefined, factsAt: undefined, factsModel: undefined, factsFallback: usedFallback }),
              }
              journalPatch(id, live, sumPatch, "生成摘要")
              setMeetings((prev) =>
                prev.map((cur) => (cur.id === id ? { ...cur, ...sumPatch, updatedAt: now } : cur)),
              )
              if (m.brief?.editedByUser || m.outline?.editedByUser) {
                notices.push("你手动改过的摘要已保留，未被覆盖")
              }
              // FRAME 两步式真正走通（composeSummaryFromFacts）：事实 ≥3 条且均为模型成功产出
              if (facts.length >= 3) {
                notices.push(
                  `摘要按 FRAME 管线生成：提取 ${facts.length} 条带原文支撑的事实${
                    factsDiscarded > 0 ? `（另丢弃 ${factsDiscarded} 条无支撑/重复）` : ""
                  }，议题要点均可回溯到事实清单${
                    factsFellBack ? `（事实提取首选模型失败，已改用 ${factsModel}）` : ""
                  }`,
                )
              } else if (frameOn) {
                // 回退到整段归纳：区分「调用失败 / 校验丢弃 / 内容本就无事实 / 仅 1-2 条」四种成因，避免黑盒
                if (factsCallFailed) {
                  notices.push(
                    `事实提取模型调用失败（${llmErrorMessage(factsCallFailed)}），摘要已回退为整段归纳生成（不影响行动项抽取）`,
                  )
                } else if (factsDiscarded > 0) {
                  notices.push(
                    `事实提取返回的内容未通过本地校验（${factsDiscarded} 条支撑句无法在原文命中），本场无足够可引用事实，摘要已用整段归纳生成（不影响行动项抽取）`,
                  )
                } else if (facts.length > 0) {
                  notices.push(`事实提取仅得 ${facts.length} 条、不足 3 条，摘要已用整段归纳生成`)
                } else {
                  notices.push(
                    "本场无可提取的显著事实（寒暄/闲聊或未识别到决定/承诺/数字），摘要已按整段归纳生成（不影响行动项抽取）",
                  )
                }
              }
              if (res.fellBack) notices.push(`首选模型失败，摘要已改用 ${res.usedModel} 生成（重新生成会先从首选模型重试）`)
              pushActivity(
                "生成摘要",
                m.title,
                `${facts.length > 0 ? `事实 ${facts.length} 条 + ` : ""}模型 ${res.usedModel}${res.fellBack ? "（降级）" : ""} · 耗时 ${elapsed()} · 服务商 ${llmId}`,
              )
            })
            .catch((e) => {
              anyFailed = true
              setGenError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
            })
            .finally(() => {
              runningRef.current.delete(`${id}:summary`)
              setGenBusy((prev) => ({ ...prev, summary: false }))
            }),
        )
      }

      if (wantExtract) {
        const extModel = agentModel("extract")
        const extPrompt = agentPrompt("extract")
        tasks.push(
          extractItems(m.title, cleaned, {
            model: extModel,
            minConfidence: settings.minConfidence,
            reviewThreshold: agentReviewThreshold("extract"),
            rawTranscript: raw,
            ...(extPrompt ? { agentPrompt: extPrompt } : {}),
          })
            .then((res) => {
              logAiCall("extract", m, extModel, res)
              // 补丁在 updater 外用实时快照算好，先记事件日志（条目级差异，可回滚）再应用
              const live = meetingsRef.current.find((x) => x.id === id) ?? m
              // 行动项/决议：保留用户改过的条目，新条目按内容去重后合并
              const keptActions = live.actions.filter((a) => a.editedByUser)
              const keptContents = new Set(keptActions.map((a) => a.content))
              const freshActions = res.data.actions.filter((a) => !keptContents.has(a.content))
              const keptDecisions = live.decisions.filter((d) => d.editedByUser)
              const keptDecisionContents = new Set(keptDecisions.map((d) => d.content))
              const freshDecisions = res.data.decisions.filter(
                (d) => !keptDecisionContents.has(d.content),
              )
              // 待确认队列以本次抽取为准（重新抽取即重建）；用户已采纳过的同内容条目不再扣
              const freshPending = res.data.pending.filter((a) => !keptContents.has(a.content))
              const extPatch: Partial<Meeting> = {
                actions: [...keptActions, ...freshActions],
                decisions: [...keptDecisions, ...freshDecisions],
                pendingActions: freshPending,
                extractedAt: Date.now(), // 漂移感知：抽取结果的新鲜度基准
              }
              journalPatch(id, live, extPatch, "抽取行动项")
              setMeetings((prev) =>
                prev.map((cur) =>
                  cur.id === id ? { ...cur, ...extPatch, updatedAt: Date.now() } : cur,
                ),
              )
              if (res.data.pending.length > 0) {
                notices.push(
                  `抽取 Agent 对 ${res.data.pending.length} 条把握不足，已扣进行动项页「待确认」队列——你采纳前不进正式清单、不计入任何统计`,
                )
              }
              if (res.data.discarded > 0) {
                notices.push(`已丢弃 ${res.data.discarded} 条无原文支撑或置信度不足的结论`)
              }
              // 工作流自动消费：抽取完成即备好 Issue 草稿包 / 决策日志素材（免费本地，导出入口在跟进中心 → 工作流）
              if (res.data.actions.length > 0) {
                notices.push(`已自动备好 ${res.data.actions.length} 份 Issue 草稿（跟进中心 → 工作流，一键导出）`)
                void dispatchWorkflowEvent({
                  kind: "actions-extracted",
                  meetingId: id,
                  meetingTitle: m.title,
                  drafts: buildIssueDrafts([{ ...m, actions: res.data.actions }]),
                })
              }
              if (res.data.decisions.length > 0) {
                void dispatchWorkflowEvent({
                  kind: "decisions-recorded",
                  meetingId: id,
                  meetingTitle: m.title,
                  count: res.data.decisions.length,
                })
              }
              if (res.fellBack) notices.push(`首选模型失败，行动项已改用 ${res.usedModel} 抽取（重新生成会先从首选模型重试）`)
              pushActivity(
                "抽取行动项",
                m.title,
                `新增 ${res.data.actions.length} 条行动项、${res.data.decisions.length} 条决议，待确认 ${res.data.pending.length} 条，丢弃 ${res.data.discarded} 条 · 耗时 ${elapsed()} · 服务商 ${llmId}`,
              )
            })
            .catch((e) => {
              anyFailed = true
              setGenError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
            })
            .finally(() => {
              runningRef.current.delete(`${id}:extract`)
              setGenBusy((prev) => ({ ...prev, extract: false }))
            }),
        )
      }

      await Promise.all(tasks)
      // 崩溃安全「再写结果」：立即落盘（flushPersist 内部先等一拍让 React 提交结果
      // setState，再串行入队等待写入确认），部分成功（一成一败）也照样持久化已成部分；
      // 写入确认后清除意图标记——此后崩溃不再有丢失窗口
      await flushPersist()
      endOp(opId)
      if (!anyFailed) {
        // 主动提示（免费）：历史还有未结行动项时，提醒做一次跟进消化
        const othersOpen = meetings
          .filter((x) => x.id !== id)
          .reduce((n, x) => n + x.actions.filter((a) => isOpenStatus(a.status) && a.content.trim()).length, 0)
        if (othersOpen > 0 && (parts.summary || parts.extract)) {
          notices.push(`历史会议还有 ${othersOpen} 条未结行动项，可在纪要页做「上期行动项跟进」消化`)
        }
        setGenNotice(notices.join("；"))
        if (summaryDone) setActiveTab("summary")
        else setActiveTab("actions")
      }
    },
    [meetings, settings, templates, pushActivity, logAiCall, agentModel, agentPrompt, agentReviewThreshold, setMeetings, meetingsRef, setActiveTab, flushPersist],
  )

  const generateFor = useCallback(
    (id: string) => {
      costConfirm.runWithCostConfirm(() => {
        void runParts(id, { summary: true, extract: true })
      }, PRICE_TEXT)
    },
    [costConfirm, runParts],
  )

  // 单独重跑摘要（不动行动项）
  const generateSummaryFor = useCallback(
    (id: string) => {
      costConfirm.runWithCostConfirm(() => {
        void runParts(id, { summary: true })
      }, PRICE_TEXT)
    },
    [costConfirm, runParts],
  )

  // 单独重跑行动项抽取（不动摘要）
  const generateActionsFor = useCallback(
    (id: string) => {
      costConfirm.runWithCostConfirm(() => {
        void runParts(id, { extract: true })
      }, PRICE_TEXT)
    },
    [costConfirm, runParts],
  )

  return {
    genBusy,
    genError,
    genNotice,
    setGenError,
    setGenNotice,
    generating,
    generateFor,
    generateSummaryFor,
    generateActionsFor,
  }
}
