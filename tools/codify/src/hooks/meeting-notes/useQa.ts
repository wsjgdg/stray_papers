// 领域 hook · 跨会议问答：检索增强问答（可限定系列）。
// 管线（自路由）：规则分类器判定查询复杂度——
// - 结构化事实查询（谁负责 X / 未完成清单 / 截止日 / 决议 / 状态）→ 本地直答：
//   零费用、毫秒级、直接读行动项与决议字段，不经过模型（qaRouter.classifyQuery）；
// - 其余 → 完整 RAG：召回（向量段级 Top-50 + 词面）→ RRF 重排选 Top-5 场 → LLM 综合
//  （ragPipeline.retrieveQaContext，系列内问答保留全时间线不做筛选）。
// 答案带引用级压缩（每条结论附「最短支撑句」），本地逐字对账（verifyCitations）出命中率。
// 流式通道逐字渲染（增量 Markdown 解析器），poll-first 通道整段到达；
// 问答历史是用户数据——随主库持久化、随备份导出、可单条删除，
// 任一会议内容更新后旧答案标记「可能过时」（漂移感知）。
// 付费调用先过成本确认（本地直答免费不弹）；与语义找会共用一把检索类调用锁。

import { useCallback, useMemo, useState } from "react"
import {
  askAcrossMeetings,
  askAcrossMeetingsStream,
  llmErrorMessage,
  llmSupportsStream,
} from "@/lib/ai"
import type { AgentRole } from "@/lib/agents"
import type { ChainResult } from "@/lib/ai"
import { contentStamp, newId, type Meeting, type QaRecord } from "@/lib/store"
import { getActiveLlm } from "@/lib/providers"
import { recordAiCall } from "@/lib/usageLog"
import { retrieveQaContext, verifyCitations } from "@/lib/ragPipeline"
import { classifyQuery } from "@/lib/qaRouter"
import { createMdParser, flushMd, pushMdChunk, type MdBlock } from "@/lib/incrementalMd"
import type { useCostConfirm } from "@/hooks/useCostConfirm"

const QA_PRICE_TEXT = "将调用 AI 检索你的会议档案并回答，按实际 token 扣费，具体费用以 RunningHub 为准"
const QA_HISTORY_CAP = 20

export interface UseQaDeps {
  meetings: Meeting[]
  // 问答历史由 facade（存储域）持有：随主库持久化、启动装载、随备份导入导出；本 hook 只读写
  qaHistory: QaRecord[]
  setQaHistory: React.Dispatch<React.SetStateAction<QaRecord[]>>
  // 系列限定来自检索域 hook（与语义找会共用同一份逻辑）
  scopeMeetings: (scopeTag: string) => Meeting[]
  // 与语义找会共用一把「检索类调用」锁：同一时刻只跑一个
  askRunningRef: React.MutableRefObject<boolean>
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

export function useQa(deps: UseQaDeps) {
  const {
    meetings,
    qaHistory,
    setQaHistory,
    scopeMeetings,
    askRunningRef,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    costConfirm,
  } = deps

  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState("")
  // 流式回答的增量渲染块：仅当前 LLM 通道支持流式时非 null（poll-first 下恒为 null，走整段渲染）
  const [streamingBlocks, setStreamingBlocks] = useState<MdBlock[] | null>(null)

  const runAsk = useCallback(
    async (question: string, scopeTag = "") => {
      const q = question.trim()
      const scoped = scopeMeetings(scopeTag)
      if (!q || scoped.length === 0) return
      if (askRunningRef.current) return // 并发锁：回答中重复提问直接忽略
      askRunningRef.current = true
      const startedAt = Date.now()
      setAsking(true)
      setAskError("")
      try {
        const retModel = agentModel("retrieve")
        const retPrompt = agentPrompt("retrieve")
        // RAG 检索阶段（先重排后摘要）：全局问答走「召回→RRF 重排→Top-5 进上下文」；
        // 系列内问答保留全时间线（演进类问题需要完整脉络，不做筛选）
        const retrieval = scopeTag
          ? { selected: scoped, blocks: null, method: `系列「${scopeTag}」全时间线（${scoped.length} 场）` }
          : await retrieveQaContext(q, scoped)
        const askOpts = {
          ...(scopeTag ? { scopeLabel: scopeTag } : {}),
          ...(retPrompt ? { agentPrompt: retPrompt } : {}),
          ...(retrieval.blocks ? { contextBlocks: retrieval.blocks } : {}),
        }
        let answer = ""
        if (llmSupportsStream()) {
          // 流式路径：增量解析器驱动，块完成即挂载（逐字渲染、已挂载的块不重解析）；
          // 流式通道没有降级链遥测——账本如实只记模型与耗时，token 不回传不猜
          const parser = createMdParser()
          setStreamingBlocks([])
          for await (const chunk of askAcrossMeetingsStream(q, retrieval.selected, retModel, askOpts)) {
            answer += chunk
            const fresh = pushMdChunk(parser, chunk)
            if (fresh.length > 0) setStreamingBlocks((prev) => [...(prev ?? []), ...fresh])
          }
          const tail = flushMd(parser)
          if (tail.length > 0) setStreamingBlocks((prev) => [...(prev ?? []), ...tail])
          if (!answer.trim()) throw new Error("timeout")
          recordAiCall({
            at: Date.now(),
            kind: "ask",
            agent: "retrieve",
            providerId: getActiveLlm().meta.id,
            model: retModel,
            preferredModel: retModel,
            fellBack: false,
            failReasons: [],
            durationMs: Date.now() - startedAt,
            ok: true,
          })
        } else {
          // poll-first 路径（当前平台通道）：整段到达，降级链 / token 遥测完整
          const res = await askAcrossMeetings(q, retrieval.selected, retModel, askOpts)
          answer = res.data
          logAiCall("ask", null, retModel, res)
        }
        // 引用核验（免费本地）：答案里「」引文与进上下文的会议原文逐字对账
        const citations = verifyCitations(answer, retrieval.selected)
        const record: QaRecord = {
          id: newId(),
          question: scopeTag ? `〔${scopeTag}〕${q}` : q,
          answer,
          createdAt: Date.now(),
          route: "rag",
          ...(citations.total > 0 ? { citations } : {}),
          retrievalNote: retrieval.method,
        }
        setQaHistory((prev) => [record, ...prev].slice(0, QA_HISTORY_CAP))
        pushActivity(
          "问答",
          scopeTag ? `系列「${scopeTag}」` : "",
          `「${q.slice(0, 30)}${q.length > 30 ? "…" : ""}」 · ${retrieval.method}${
            citations.total > 0 ? ` · 引用核验 ${citations.verified}/${citations.total}` : ""
          } · 耗时 ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s · 服务商 ${getActiveLlm().meta.id}`,
        )
      } catch (e) {
        setAskError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
      } finally {
        askRunningRef.current = false
        setAsking(false)
        setStreamingBlocks(null)
      }
    },
    [scopeMeetings, askRunningRef, agentModel, agentPrompt, pushActivity, logAiCall, setQaHistory],
  )

  // 本地直答（自路由的结构化通道）：零费用不弹成本确认，毫秒级返回
  const runStructured = useCallback(
    (question: string, answer: string, kind: string, scopeTag: string) => {
      const q = question.trim()
      const record: QaRecord = {
        id: newId(),
        question: scopeTag ? `〔${scopeTag}〕${q}` : q,
        answer: `${answer}\n\n（结构化直答：来自行动项 / 决议字段，未调用 AI，零费用）`,
        createdAt: Date.now(),
        route: "structured",
        retrievalNote: `规则路由 · ${kind}`,
      }
      setQaHistory((prev) => [record, ...prev].slice(0, QA_HISTORY_CAP))
      pushActivity(
        "问答（本地直答）",
        scopeTag ? `系列「${scopeTag}」` : "",
        `「${q.slice(0, 30)}${q.length > 30 ? "…" : ""}」规则路由命中 ${kind}，未调用模型 · 零费用`,
      )
    },
    [pushActivity, setQaHistory],
  )

  const ask = useCallback(
    (question: string, scopeTag = "") => {
      const q = question.trim()
      if (!q) return
      // 自路由：结构化事实查询本地直答（免费），其余走完整 RAG（付费，先过成本确认）
      const routed = classifyQuery(q, scopeMeetings(scopeTag))
      if (routed.route === "structured") {
        runStructured(q, routed.answer, routed.kind, scopeTag)
        return
      }
      costConfirm.runWithCostConfirm(() => {
        void runAsk(question, scopeTag)
      }, QA_PRICE_TEXT)
    },
    [costConfirm, runAsk, runStructured, scopeMeetings],
  )

  const clearQaHistory = useCallback(() => setQaHistory([]), [setQaHistory])

  // 漂移感知：任一会议的内容指纹（转写/摘要/抽取）晚于问答时刻 → 该答案标记「可能过时」
  const staleQaIds = useMemo(() => {
    const ids = new Set<string>()
    if (meetings.length === 0) return ids
    for (const r of qaHistory) {
      if (meetings.some((m) => contentStamp(m) > r.createdAt)) ids.add(r.id)
    }
    return ids
  }, [meetings, qaHistory])

  // 问答历史也是用户数据：敏感提问可单条删除（全部清空与随备份导出早已支持）
  const removeQaRecord = useCallback((recordId: string) => {
    setQaHistory((prev) => prev.filter((r) => r.id !== recordId))
  }, [setQaHistory])

  return {
    asking,
    askError,
    streamingBlocks,
    ask,
    clearQaHistory,
    staleQaIds,
    removeQaRecord,
  }
}
