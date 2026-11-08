// 领域 hook · 洞察系列：从 useMeetingNotes 整段迁出，行为不变。
// 四个「档案的主动消费方式」，共同立场：全部是建议，采纳才写入；付费调用先过成本确认。
// - useThemes：流程洞察——行动项语义聚类，发现「总在打转」的高频主题
// - useDigest：跟进消化——历史未结行动项在新会议里被跟进成什么状态（含疑似遗忘标记）
// - useEvolution：演进脉络——一个系列的历次会议梳理「主线何时提出 → 怎么变化 → 当前结论」
// - useEntities：实体抽取——图谱付费增强层，转写里提到但没进结构化标注的实体

import { useCallback, useMemo, useRef, useState } from "react"
import {
  analyzeActionThemes,
  extractEntities,
  generateTopicEvolution,
  llmErrorMessage,
  trackCarryoverActions,
  type ActionEntry,
  type ActionTheme,
} from "@/lib/ai"
import { dueDayOffset, isOpenStatus, type Meeting } from "@/lib/store"
import type { AgentRole } from "@/lib/agents"
import type { ChainResult } from "@/lib/ai"
import type { useCostConfirm } from "@/hooks/useCostConfirm"

const THEME_PRICE_TEXT =
  "将调用 AI 对全部行动项做语义聚类、发现反复出现的流程问题，按实际 token 扣费，具体费用以 RunningHub 为准"
const DIGEST_PRICE_TEXT =
  "将调用 AI 对照本场会议内容，逐条判定历史未结行动项的跟进状态，按实际 token 扣费，具体费用以 RunningHub 为准"
const EVOLUTION_PRICE_TEXT =
  "将调用 AI 梳理该系列历次会议的知识演进脉络，按实际 token 扣费，具体费用以 RunningHub 为准"
const ENTITIES_PRICE_TEXT =
  "将调用 AI 抽取转写中提到的人物 / 项目 / 客户实体，按实际 token 扣费，具体费用以 RunningHub 为准"

// 跟进消化面板的一行：历史未结行动项在本场会议里的判定结果（建议制，采纳才写入）
export interface DigestRow {
  actionId: string
  ownerId: string // 行动项所属会议 id
  content: string
  assignee: string
  fromTitle: string
  verdict: "done" | "progress" | "blocked" | "unmentioned"
  evidence: string
  suspectedForgotten: boolean // 未提及 且（已逾期 或 ≥14 天没动）
  applyStatus?: "done" | "doing" | "blocked" // 采纳后写入的状态；unmentioned 不改状态
}

// 四个 hook 共享的依赖形状
interface InsightDeps {
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

// ── 流程洞察 ──

export function useThemes(deps: InsightDeps) {
  const { meetings, agentModel, agentPrompt, logAiCall, pushActivity, costConfirm } = deps

  const [themeReport, setThemeReport] = useState<{ themes: ActionTheme[]; at: number } | null>(null)
  const [themesBusy, setThemesBusy] = useState(false)
  const [themesError, setThemesError] = useState("")
  const themesRunningRef = useRef(false)

  const runThemes = useCallback(async () => {
    if (themesRunningRef.current) return
    const entries: ActionEntry[] = []
    const sorted = [...meetings].sort((a, b) => b.date.localeCompare(a.date))
    for (const m of sorted) {
      for (const a of m.actions) {
        if (!a.content.trim() || a.status === "cancelled") continue
        entries.push({
          content: a.content,
          meetingTitle: m.title,
          status: a.status === "done" ? "已完成" : a.status === "blocked" ? "阻塞" : a.status === "doing" ? "进行中" : "待办",
        })
      }
    }
    if (entries.length < 2) {
      setThemesError("行动项太少（至少 2 条），还聚不出主题")
      return
    }
    themesRunningRef.current = true
    setThemesBusy(true)
    setThemesError("")
    try {
      const sumModel = agentModel("summary")
      const sumPrompt = agentPrompt("summary")
      const res = await analyzeActionThemes(entries, sumModel, {
        ...(sumPrompt ? { agentPrompt: sumPrompt } : {}),
      })
      logAiCall("insight", null, sumModel, res)
      setThemeReport({ themes: res.data, at: Date.now() })
      pushActivity(
        "流程洞察",
        "",
        `${entries.length} 条行动项聚出 ${res.data.length} 个高频主题 · 模型 ${res.usedModel}${res.fellBack ? "（降级）" : ""}`,
      )
    } catch (e) {
      setThemesError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
    } finally {
      themesRunningRef.current = false
      setThemesBusy(false)
    }
  }, [meetings, agentModel, agentPrompt, pushActivity, logAiCall])

  const analyzeThemes = useCallback(() => {
    costConfirm.runWithCostConfirm(() => {
      void runThemes()
    }, THEME_PRICE_TEXT)
  }, [costConfirm, runThemes])

  return { themeReport, themesBusy, themesError, analyzeThemes }
}

// ── 跟进消化 ──

export interface UseDigestDeps extends InsightDeps {
  selected: Meeting | null
  setMeetings: React.Dispatch<React.SetStateAction<Meeting[]>>
  patchMeeting: (id: string, patch: Partial<Meeting>) => void
  setGenNotice: (v: string) => void
}

export function useDigest(deps: UseDigestDeps) {
  const {
    meetings,
    selected,
    setMeetings,
    patchMeeting,
    setGenNotice,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    costConfirm,
  } = deps

  const [digestReport, setDigestReport] = useState<DigestRow[] | null>(null)
  const [digestBusy, setDigestBusy] = useState(false)
  const [digestError, setDigestError] = useState("")
  const digestRunningRef = useRef(false)

  const pastOpenCount = useMemo(() => {
    if (!selected) return 0
    return meetings
      .filter((m) => m.id !== selected.id)
      .reduce((n, m) => n + m.actions.filter((a) => isOpenStatus(a.status) && a.content.trim()).length, 0)
  }, [meetings, selected])

  const runDigest = useCallback(
    async (id: string) => {
      const m = meetings.find((x) => x.id === id)
      if (!m || digestRunningRef.current) return
      const past: {
        actionId: string
        ownerId: string
        content: string
        assignee: string
        fromTitle: string
        dueDate: string
        createdAt: number
      }[] = []
      for (const other of meetings) {
        if (other.id === id) continue
        for (const a of other.actions) {
          if (!isOpenStatus(a.status) || !a.content.trim()) continue
          past.push({
            actionId: a.id,
            ownerId: other.id,
            content: a.content,
            assignee: a.assignee,
            fromTitle: other.title,
            dueDate: a.dueDate,
            createdAt: a.createdAt ?? other.createdAt,
          })
        }
      }
      if (past.length === 0) {
        setDigestError("历史会议里没有未结行动项，无需消化")
        return
      }
      // 新的排前面，上限 40 条控制费用
      past.sort((x, y) => y.createdAt - x.createdAt)
      const capped = past.slice(0, 40)
      digestRunningRef.current = true
      setDigestBusy(true)
      setDigestError("")
      try {
        const extModel = agentModel("extract")
        const extPrompt = agentPrompt("extract")
        const res = await trackCarryoverActions(
          m.cleaned || m.transcript,
          capped.map((p) => ({ content: p.content, assignee: p.assignee, fromTitle: p.fromTitle })),
          extModel,
          { ...(extPrompt ? { agentPrompt: extPrompt } : {}) },
        )
        logAiCall("digest", m, extModel, res)
        const byRef = new Map(res.data.map((v) => [v.ref, v]))
        const rows: DigestRow[] = capped.map((p, i) => {
          const v = byRef.get(i)
          const verdict = v?.verdict ?? "unmentioned"
          const off = dueDayOffset(p.dueDate)
          const ageDays = Math.floor((Date.now() - p.createdAt) / 86_400_000)
          const suspectedForgotten = verdict === "unmentioned" && ((off !== null && off < 0) || ageDays >= 14)
          const applyStatus =
            verdict === "done" ? "done" : verdict === "progress" ? "doing" : verdict === "blocked" ? "blocked" : undefined
          return {
            actionId: p.actionId,
            ownerId: p.ownerId,
            content: p.content,
            assignee: p.assignee,
            fromTitle: p.fromTitle,
            verdict,
            evidence: v?.evidence ?? "",
            suspectedForgotten,
            ...(applyStatus ? { applyStatus } : {}),
          }
        })
        setDigestReport(rows)
        // 消化结果落盘为图谱事实边：「历史行动项在本场会被跟进成什么状态」
        patchMeeting(id, {
          digestLinks: rows.map((r) => ({
            actionId: r.actionId,
            ownerId: r.ownerId,
            verdict: r.verdict,
            evidence: r.evidence,
            at: Date.now(),
          })),
        })
        pushActivity(
          "跟进消化",
          m.title,
          `对照 ${capped.length} 条历史未结：${rows.filter((r) => r.verdict !== "unmentioned").length} 条有跟进、${rows.filter((r) => r.suspectedForgotten).length} 条疑似遗忘`,
        )
      } catch (e) {
        setDigestError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
      } finally {
        digestRunningRef.current = false
        setDigestBusy(false)
      }
    },
    [meetings, agentModel, agentPrompt, patchMeeting, pushActivity, logAiCall],
  )

  const digestFor = useCallback(
    (id: string) => {
      costConfirm.runWithCostConfirm(() => {
        void runDigest(id)
      }, DIGEST_PRICE_TEXT)
    },
    [costConfirm, runDigest],
  )

  const applyDigest = useCallback(
    (accepted: DigestRow[]) => {
      const withStatus = accepted.filter((r) => r.applyStatus)
      setDigestReport(null)
      if (withStatus.length === 0) return
      setMeetings((prev) =>
        prev.map((m) => {
          let changed = false
          const actions = m.actions.map((a) => {
            const row = withStatus.find((r) => r.actionId === a.id && r.ownerId === m.id)
            if (!row?.applyStatus) return a
            changed = true
            return { ...a, status: row.applyStatus, editedByUser: true }
          })
          return changed ? { ...m, actions, updatedAt: Date.now() } : m
        }),
      )
      setGenNotice(`跟进消化已应用：${withStatus.length} 条行动项状态已更新（打手改标记，重新抽取不覆盖）`)
      pushActivity("跟进消化", "", `采纳 ${withStatus.length} 条状态更新`)
    },
    [setMeetings, setGenNotice, pushActivity],
  )

  const clearDigest = useCallback(() => {
    setDigestReport(null)
    setDigestError("")
  }, [])

  return { digestReport, digestBusy, digestError, pastOpenCount, digestFor, applyDigest, clearDigest }
}

// ── 演进脉络 ──

export function useEvolution(deps: InsightDeps) {
  const { meetings, agentModel, agentPrompt, logAiCall, pushActivity, costConfirm } = deps

  const [evolutionCache, setEvolutionCache] = useState<Record<string, { text: string; at: number }>>({})
  const [evolutionBusy, setEvolutionBusy] = useState(false)
  const [evolutionError, setEvolutionError] = useState("")
  const evolutionRunningRef = useRef(false)

  const runEvolution = useCallback(
    async (tag: string) => {
      if (evolutionRunningRef.current || !tag) return
      const series = meetings
        .filter(
          (m) =>
            (typeof m.seriesId === "string" && m.seriesId.trim() === tag) ||
            (!(typeof m.seriesId === "string" && m.seriesId.trim()) && m.tags.includes(tag)),
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
      const entries = series
        .filter((m) => m.brief?.content || (m.outline?.topics.length ?? 0) > 0)
        .map((m) => ({
          date: m.date,
          title: m.title,
          brief: m.brief?.content ?? "",
          topics: (m.outline?.topics ?? []).map((t) => ({ topic: t.topic, points: t.points })),
        }))
      if (entries.length < 2) {
        setEvolutionError("这个系列至少要有两场已生成纪要的会议，才能梳理演进脉络")
        return
      }
      evolutionRunningRef.current = true
      setEvolutionBusy(true)
      setEvolutionError("")
      try {
        const sumModel = agentModel("summary")
        const sumPrompt = agentPrompt("summary")
        const res = await generateTopicEvolution(tag, entries, sumModel, {
          ...(sumPrompt ? { agentPrompt: sumPrompt } : {}),
        })
        logAiCall("evolution", null, sumModel, res)
        setEvolutionCache((prev) => ({ ...prev, [tag]: { text: res.data, at: Date.now() } }))
        pushActivity("演进脉络", `系列「${tag}」`, `${entries.length} 场会议 · 模型 ${res.usedModel}${res.fellBack ? "（降级）" : ""}`)
      } catch (e) {
        setEvolutionError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
      } finally {
        evolutionRunningRef.current = false
        setEvolutionBusy(false)
      }
    },
    [meetings, agentModel, agentPrompt, pushActivity, logAiCall],
  )

  const evolutionFor = useCallback(
    (tag: string) => {
      costConfirm.runWithCostConfirm(() => {
        void runEvolution(tag)
      }, EVOLUTION_PRICE_TEXT)
    },
    [costConfirm, runEvolution],
  )

  return { evolutionCache, evolutionBusy, evolutionError, evolutionFor }
}

// ── 实体抽取（图谱付费增强层）──

export interface UseEntitiesDeps extends InsightDeps {
  patchMeeting: (id: string, patch: Partial<Meeting>) => void
  setGenError: (v: string) => void
}

export function useEntities(deps: UseEntitiesDeps) {
  const { meetings, agentModel, agentPrompt, patchMeeting, setGenError, logAiCall, pushActivity, costConfirm } = deps

  const [entitiesBusy, setEntitiesBusy] = useState(false)
  const entitiesRunningRef = useRef(false)

  const runEntities = useCallback(
    async (id: string) => {
      const m = meetings.find((x) => x.id === id)
      if (!m || entitiesRunningRef.current) return
      if ((m.cleaned || m.transcript).trim().length < 20) return
      entitiesRunningRef.current = true
      setEntitiesBusy(true)
      setGenError("")
      try {
        const extModel = agentModel("extract")
        const extPrompt = agentPrompt("extract")
        const res = await extractEntities(m.title, m.cleaned || m.transcript, extModel, {
          ...(extPrompt ? { agentPrompt: extPrompt } : {}),
        })
        logAiCall("entities", m, extModel, res)
        const merged = [...(m.entities ?? [])]
        const seen = new Set(merged.map((e) => e.name))
        let added = 0
        for (const e of res.data) {
          if (seen.has(e.name)) continue
          seen.add(e.name)
          merged.push(e)
          added++
        }
        patchMeeting(id, { entities: merged })
        pushActivity(
          "实体抽取",
          m.title,
          `新增 ${added} 个实体（人物/项目/客户）· 模型 ${res.usedModel}${res.fellBack ? "（降级）" : ""}`,
        )
      } catch (e) {
        setGenError(llmErrorMessage(e instanceof Error ? e.message : "unknown"))
      } finally {
        entitiesRunningRef.current = false
        setEntitiesBusy(false)
      }
    },
    [meetings, agentModel, agentPrompt, patchMeeting, pushActivity, logAiCall, setGenError],
  )

  const extractEntitiesFor = useCallback(
    (id: string) => {
      costConfirm.runWithCostConfirm(() => {
        void runEntities(id)
      }, ENTITIES_PRICE_TEXT)
    },
    [costConfirm, runEntities],
  )

  return { entitiesBusy, extractEntitiesFor }
}
