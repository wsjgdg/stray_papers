// 领域 hook · 检索：从 useMeetingNotes 整段迁出，行为不变。
// 三条互补的「找东西」路径 + 索引生命周期：
// - 关键词检索：倒排索引 + trigram 模糊 + 混合打分，查询跑在 Web Worker（searchClient）
// - 语义找会：本地向量索引就绪时免费（embeddingClient），否则走付费 LLM 精排（先过成本确认）
// - 索引同步：文档增量同步（stamp 脏标记）、落盘成功后刷持久化副本、删除会议时清理三套索引
// 语义索引（WebGPU/WASM 本地推理）按设置懒启动；换模型自动失效由 embedding.worker 内部处理。

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { findRelatedMeetings, llmErrorMessage, type RelatedMeeting } from "@/lib/ai"
import type { AgentRole } from "@/lib/agents"
import type { ChainResult } from "@/lib/ai"
import { isOpenStatus, type AppSettings, type Meeting } from "@/lib/store"
import {
  dropFromIndex,
  haystackOf,
  queueIndexPersist,
  searchDocOf,
} from "@/lib/searchIndex"
import { dropSearchDocs, searchDocsAsync, syncSearchDocs } from "@/lib/searchClient"
import type { SearchHit } from "@/lib/searchCore"
import {
  getSemanticStatus,
  initSemantic,
  onSemanticProgress,
  onSemanticStatus,
  rebuildSemanticIndex,
  removeSemanticDocs,
  semanticSearch,
  syncSemanticMeetings,
  type SemanticStatus,
} from "@/lib/embeddingClient"
import type { useCostConfirm } from "@/hooks/useCostConfirm"
import { bumpIndexRebuild } from "@/lib/healthLog"

const FIND_PRICE_TEXT = "将调用 AI 按语义检索你的会议档案，按实际 token 扣费，具体费用以 RunningHub 为准"

// 列表智能排序：时间倒序（会议日期）/ 待办数量 / 待核对（低置信+待确认条目）/ 最近修改。
// 搜索激活时相关性排序天然接管（倒排索引命中分降序），切换器仅作无搜索时的偏好。
// 会话级状态（不进 AppSettings）：排序是轻偏好，刷新回默认不值得为此扩设置契约。
export type ListSort = "time" | "open" | "review" | "updated"

const LOW_CONFIDENCE = 0.7 // 与 ActionsTab 的「待核对」口径一致

function openCountOf(m: Meeting): number {
  return m.actions.reduce((n, a) => n + (isOpenStatus(a.status) && a.content.trim() ? 1 : 0), 0)
}

// 「待核对」权重：待确认队列条目 + 低置信未编辑的未完成条目（AI 产出等人拍板的部分）
function reviewCountOf(m: Meeting): number {
  const pending = m.pendingActions?.length ?? 0
  const lowConf = m.actions.reduce(
    (n, a) =>
      n +
      (isOpenStatus(a.status) && !a.editedByUser && typeof a.confidence === "number" && a.confidence < LOW_CONFIDENCE
        ? 1
        : 0),
    0,
  )
  return pending + lowConf
}

export interface UseRetrievalDeps {
  meetings: Meeting[]
  // 会议数据 ref 由 facade 持有（热词、评估台等域共用）；本 hook 负责保持 .current 同步
  meetingsRef: React.MutableRefObject<Meeting[]>
  // 与问答域共用一把「检索类调用」锁：同一时刻只跑一个（runAsk / runFind 互斥）
  askRunningRef: React.MutableRefObject<boolean>
  booting: boolean
  // 大文本回填完成（存储域阶段 B）：语义索引等它再启动，否则先给占位空转写建一遍向量再返工
  hydrated: boolean
  semanticEnabled: boolean
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>
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

export function useRetrieval(deps: UseRetrievalDeps) {
  const {
    meetings,
    meetingsRef,
    askRunningRef,
    booting,
    hydrated,
    semanticEnabled,
    setSettings,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    costConfirm,
  } = deps

  // ── 列表筛选状态（搜索词 / 标签 / 归档可见性 / 智能排序）──
  const [searchText, setSearchText] = useState("")
  const [tagFilter, setTagFilter] = useState("")
  const [listSort, setListSort] = useState<ListSort>("time")
  // 记忆生命周期：归档会议默认从列表隐藏（仍可搜索/问答/导出——遗忘是降级不是删除）
  const [showArchived, setShowArchived] = useState(false)

  // ── 语义找会状态 ──
  const [finding, setFinding] = useState(false)
  const [findError, setFindError] = useState("")
  const [findResults, setFindResults] = useState<RelatedMeeting[] | null>(null)
  const [findQuery, setFindQuery] = useState("")

  // ── 本地语义检索（WebGPU/WASM 推理，embeddingClient → embedding.worker）──
  const semanticOnRef = useRef(false)
  const [semanticStatus, setSemanticStatus] = useState<SemanticStatus>({ state: "off" })
  const [semanticProgress, setSemanticProgress] = useState<{ done: number; total: number } | null>(null)

  // meetingsRef 由 facade 持有，本 hook 负责同步（原持久化 effect 的第一行）
  useEffect(() => {
    meetingsRef.current = meetings
  }, [meetings, meetingsRef])

  useEffect(() => {
    const offStatus = onSemanticStatus(setSemanticStatus)
    const offProgress = onSemanticProgress((done, total) => {
      setSemanticProgress({ done, total })
      if (done >= total) {
        // 收尾展示一拍再清空，避免进度条一闪而过
        setTimeout(() => setSemanticProgress(null), 1200)
      }
    })
    return () => {
      offStatus()
      offProgress()
    }
  }, [])

  // 启用开关 + 装载完成 + 大文本回填完成 → 懒启动推理线程（模型与 ORT 资产按需加载），
  // 就绪后全量增量同步——等回填是为了不给占位空转写白建一遍向量
  useEffect(() => {
    semanticOnRef.current = semanticEnabled
    if (!semanticEnabled || booting || !hydrated) return
    void initSemantic().then((st) => {
      if (st.state === "ready") syncSemanticMeetings(meetingsRef.current)
    })
  }, [semanticEnabled, booting, hydrated, meetingsRef])

  const setSemanticEnabled = useCallback(
    (v: boolean) => {
      setSettings((s) => ({ ...s, semanticEnabled: v }))
    },
    [setSettings],
  )

  const rebuildSemantic = useCallback(() => {
    // 健康面板指标：手动重建打点（增量同步不算重建，不打点）
    bumpIndexRebuild()
    setSemanticProgress({ done: 0, total: meetingsRef.current.length })
    rebuildSemanticIndex(meetingsRef.current)
  }, [meetingsRef])

  // 主库落盘成功后由 facade 调用：排队后台批量刷检索索引（增量：只处理变化过的会议）
  // + 语义向量增量同步（客户端按内容戳脏检查，只有变化过的会议才会进 Worker 推理）
  const syncIndexesAfterSave = useCallback((saved: Meeting[]) => {
    queueIndexPersist(saved)
    if (semanticOnRef.current && getSemanticStatus().state === "ready") {
      syncSemanticMeetings(saved)
    }
  }, [])

  // 删除会议时三套索引同步失效：内存缓存立即丢弃，倒排索引即时移除，
  // 持久化副本随下一次批量刷盘删除；语义向量库同步清理
  const dropMeetingFromIndexes = useCallback((ids: string[]) => {
    dropFromIndex(ids)
    dropSearchDocs(ids)
    removeSemanticDocs(ids)
  }, [])

  // ── 检索：倒排索引 + trigram 模糊 + 混合打分，查询在 Web Worker 里执行 ──
  // searchResult 带 tokensKey：结果与产生它的查询词绑定，过期结果不参与渲染
  const [searchResult, setSearchResult] = useState<{ tokensKey: string; hits: SearchHit[] } | null>(null)
  const searchSeqRef = useRef(0)

  // 文档增量同步到检索线程（500ms 防抖）：stamp 脏标记，只发新增/变化的会议
  useEffect(() => {
    const timer = setTimeout(() => {
      syncSearchDocs(meetings.map(searchDocOf))
    }, 500)
    return () => clearTimeout(timer)
  }, [meetings])

  // 击键 200ms 防抖后发起 Worker 查询；序号丢弃过期应答（快速输入时多发在途）。
  // 查询词清空时不必清 searchResult：消费端按 tokensKey 校验新鲜度，过期结果不会参与渲染
  useEffect(() => {
    const seq = ++searchSeqRef.current
    const tokens = searchText.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return
    const key = tokens.join(" ")
    const timer = setTimeout(() => {
      void searchDocsAsync(tokens).then((hits) => {
        if (seq === searchSeqRef.current) setSearchResult({ tokensKey: key, hits })
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [searchText])

  // 全库标签清单（按使用频次降序，供列表页筛选）
  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of meetings) {
      for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  }, [meetings])

  const filteredMeetings = useMemo(() => {
    // 归档过滤 → 标签筛选 → 关键词检索，逐层收窄；空格分隔 = 多关键词全部命中才算匹配
    const visible = showArchived ? meetings : meetings.filter((m) => !m.archived)
    const tagged = tagFilter ? visible.filter((m) => m.tags.includes(tagFilter)) : visible
    const tokens = searchText.trim().toLowerCase().split(/\s+/).filter(Boolean)
    // 智能排序（无搜索时生效；搜索时命中分排序 = 「相关性」天然接管）
    const sortMeetings = (list: Meeting[]): Meeting[] => {
      switch (listSort) {
        case "open":
          return [...list].sort(
            (a, b) => openCountOf(b) - openCountOf(a) || b.date.localeCompare(a.date),
          )
        case "review":
          return [...list].sort(
            (a, b) => reviewCountOf(b) - reviewCountOf(a) || b.date.localeCompare(a.date),
          )
        case "updated":
          return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
        case "time":
        default:
          return [...list].sort(
            (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
          )
      }
    }
    if (tokens.length === 0) return sortMeetings(tagged)

    const key = tokens.join(" ")
    if (searchResult && searchResult.tokensKey === key) {
      // 倒排索引结果：混合打分排序（字段权重 + 词频 + 模糊降权），标签/归档过滤后保持序
      const byId = new Map(tagged.map((m) => [m.id, m]))
      const out: Meeting[] = []
      for (const h of searchResult.hits) {
        const m = byId.get(h.id)
        if (m) out.push(m)
      }
      return out
    }
    // 结果在途（防抖 + Worker 往返的百来毫秒）：用增量缓存先做线性兜底，列表不闪空
    return sortMeetings(
      tagged.filter((m) => {
        const haystack = haystackOf(m)
        return tokens.every((tok) => haystack.includes(tok))
      }),
    )
  }, [meetings, searchText, tagFilter, showArchived, searchResult, listSort])

  // 本轮结果里是否有模糊（拼写容错）命中——列表页提示「含近似匹配」
  const searchHasFuzzy = useMemo(() => {
    const tokens = searchText.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0 || !searchResult || searchResult.tokensKey !== tokens.join(" ")) return false
    return searchResult.hits.some((h) => h.fuzzy)
  }, [searchText, searchResult])

  // ── 问答 / 语义找会共用的系列限定：沿时间线回答演进类问题 ──
  const scopeMeetings = useCallback(
    (scopeTag: string): Meeting[] => {
      if (!scopeTag) return meetings
      return meetings.filter(
        (m) => m.tags.includes(scopeTag) || (typeof m.seriesId === "string" && m.seriesId.trim() === scopeTag),
      )
    },
    [meetings],
  )

  // ── 语义找会：LLM 按语义挑出相关会议（含理由），点击直达该会议；可限定系列 ──
  const runFind = useCallback(
    async (query: string, scopeTag = "") => {
      const q = query.trim()
      const scoped = scopeMeetings(scopeTag)
      if (!q || scoped.length === 0) return
      if (askRunningRef.current) return // 与问答共用一把锁：同一时刻只跑一个检索类调用
      askRunningRef.current = true
      const startedAt = Date.now()
      setFinding(true)
      setFindError("")
      setFindResults(null)
      setFindQuery(q)
      try {
        // 本地语义索引就绪 → 免费向量检索（余弦 max-pool），不走付费 LLM 精排
        if (semanticOnRef.current && getSemanticStatus().state === "ready") {
          const hits = await semanticSearch(q, 24)
          const byId = new Map(scoped.map((m) => [m.id, m]))
          const out: RelatedMeeting[] = []
          for (const h of hits) {
            if (out.length >= 8) break
            const m = byId.get(h.meetingId)
            if (!m) continue
            out.push({
              meetingId: m.id,
              title: m.title,
              date: m.date,
              reason: `本地语义匹配 · 相似度 ${(h.score * 100).toFixed(0)}%（免费，未调用模型）`,
            })
          }
          setFindResults(out)
          pushActivity(
            "语义找会",
            "",
            `「${q.slice(0, 30)}${q.length > 30 ? "…" : ""}」本地向量命中 ${out.length} 场 · 耗时 ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s · 零费用`,
          )
          return
        }
        const retModel = agentModel("retrieve")
        const retPrompt = agentPrompt("retrieve")
        const res = await findRelatedMeetings(q, scoped, retModel, {
          ...(retPrompt ? { agentPrompt: retPrompt } : {}),
        })
        logAiCall("find", null, retModel, res)
        setFindResults(res.data)
        pushActivity(
          "语义找会",
          "",
          `「${q.slice(0, 30)}${q.length > 30 ? "…" : ""}」命中 ${res.data.length} 场 · 耗时 ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s · 服务商 ${res.usedModel}${res.fellBack ? "（降级）" : ""}`,
        )
      } catch (e) {
        setFindError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
      } finally {
        askRunningRef.current = false
        setFinding(false)
      }
    },
    [scopeMeetings, askRunningRef, agentModel, agentPrompt, pushActivity, logAiCall],
  )

  const findMeetings = useCallback(
    (query: string, scopeTag = "") => {
      // 本地语义索引就绪时是纯免费路径：不弹计费确认
      if (semanticOnRef.current && getSemanticStatus().state === "ready") {
        void runFind(query, scopeTag)
        return
      }
      costConfirm.runWithCostConfirm(() => {
        void runFind(query, scopeTag)
      }, FIND_PRICE_TEXT)
    },
    [costConfirm, runFind],
  )

  const clearFindResults = useCallback(() => {
    setFindResults(null)
    setFindQuery("")
  }, [])

  return {
    // 列表筛选
    searchText,
    setSearchText,
    tagFilter,
    setTagFilter,
    showArchived,
    setShowArchived,
    listSort,
    setListSort,
    allTags,
    filteredMeetings,
    searchHasFuzzy,
    // 语义索引生命周期
    semanticStatus,
    semanticProgress,
    setSemanticEnabled,
    rebuildSemantic,
    syncIndexesAfterSave,
    dropMeetingFromIndexes,
    // 语义找会
    finding,
    findError,
    findResults,
    findQuery,
    findMeetings,
    clearFindResults,
    // 与问答域共用
    scopeMeetings,
  }
}
