import { useMemo, useState } from "react"
import { CornerDownLeft, GitMerge, History, Quote, Scale, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { textSimilarity, type Meeting, type SourceAnchor } from "@/lib/store"

interface DecisionsTabProps {
  meetings: Meeting[]
  /** 跳到来源会议的转写页并定位出处（有锚点则精确选中引用片段） */
  onOpenSource: (meetingId: string, anchor?: SourceAnchor) => void
  onMarkSuperseded: (
    meetingId: string,
    decisionId: string,
    successor: { meetingId: string; decisionId: string },
  ) => void
  onClearSuperseded: (meetingId: string, decisionId: string) => void
}

interface DecisionEntry {
  meetingId: string
  meetingTitle: string
  date: string
  tags: string[]
  decisionId: string
  content: string
  sourceQuote: string
  anchor?: SourceAnchor
  supersededBy?: { meetingId: string; decisionId: string; at: number }
}

interface DecisionCluster {
  rep: DecisionEntry // 最新一条为代表 = 「稳定结论」
  members: DecisionEntry[] // 更早的重申记录（按时间降序）
  meetingCount: number
}

// 相同结论反复重申 → 合并为一条「稳定结论」（本地相似度聚类，免费、实时计算永不漂移）
const MERGE_SIMILARITY = 0.85
// 相似度落在这个区间 = 内容相关但结论变了 → 提示「疑似被取代」，由用户确认后标记
const SUPERSEDE_HINT_MIN = 0.55

// 决议跨会议视图（记忆生命周期的「合并 / 过时」阶段）：
// - 可检索：内容 / 来源会议 / 原文引用全文过滤
// - 可聚合：按月时间线 + 「稳定结论」合并视图
// - 可过时：被新决议取代的旧决议标记降级，默认不再作为有效知识展示（仍可翻出核对）
export function DecisionsTab({ meetings, onOpenSource, onMarkSuperseded, onClearSuperseded }: DecisionsTabProps) {
  const [query, setQuery] = useState("")
  const [tagFilter, setTagFilter] = useState("")
  const [view, setView] = useState<"stable" | "timeline">("stable")
  const [showSuperseded, setShowSuperseded] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const all = useMemo<DecisionEntry[]>(() => {
    const out: DecisionEntry[] = []
    for (const m of meetings) {
      for (const d of m.decisions) {
        if (!d.content.trim()) continue
        out.push({
          meetingId: m.id,
          meetingTitle: m.title,
          date: m.date,
          tags: m.tags,
          decisionId: d.id,
          content: d.content,
          sourceQuote: d.sourceQuote,
          ...(typeof d.sourceLine === "number"
            ? { anchor: { line: d.sourceLine, start: d.sourceStart, end: d.sourceEnd } }
            : {}),
          ...(d.supersededBy ? { supersededBy: d.supersededBy } : {}),
        })
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date))
  }, [meetings])

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of all) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  }, [all])

  // 过滤（检索 + 标签）；被取代的默认隐藏，开关可翻出
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((e) => {
      if (!showSuperseded && e.supersededBy) return false
      if (tagFilter && !e.tags.includes(tagFilter)) return false
      if (!q) return true
      return `${e.content} ${e.meetingTitle} ${e.sourceQuote}`.toLowerCase().includes(q)
    })
  }, [all, query, tagFilter, showSuperseded])

  // 稳定结论聚类：贪心，最新一条当代表，相似度 ≥0.85 的旧条目归并进来
  const clusters = useMemo<DecisionCluster[]>(() => {
    const out: DecisionCluster[] = []
    for (const e of filtered) {
      const hit = out.find(
        (c) =>
          c.rep.meetingId !== e.meetingId &&
          textSimilarity(c.rep.content.slice(0, 300), e.content.slice(0, 300)) >= MERGE_SIMILARITY,
      )
      if (hit) {
        hit.members.push(e)
      } else {
        out.push({ rep: e, members: [], meetingCount: 1 })
      }
    }
    for (const c of out) {
      c.meetingCount = new Set([c.rep.meetingId, ...c.members.map((m) => m.meetingId)]).size
    }
    return out.sort((a, b) => b.members.length - a.members.length || b.rep.date.localeCompare(a.rep.date))
  }, [filtered])

  // 「疑似被取代」提示：更晚的另一场会议里有相似（0.55-0.85）但不相同的决议 → 结论可能变了
  const supersedeHints = useMemo(() => {
    const hints = new Map<string, DecisionEntry>()
    const active = all.filter((e) => !e.supersededBy)
    for (const older of active) {
      let best: DecisionEntry | null = null
      let bestSim = 0
      for (const newer of active) {
        if (newer.meetingId === older.meetingId) continue
        if (newer.date <= older.date) continue
        const sim = textSimilarity(older.content.slice(0, 300), newer.content.slice(0, 300))
        if (sim >= SUPERSEDE_HINT_MIN && sim < MERGE_SIMILARITY && sim > bestSim) {
          bestSim = sim
          best = newer
        }
      }
      if (best) hints.set(`${older.meetingId}:${older.decisionId}`, best)
    }
    return hints
  }, [all])

  const supersededCount = all.filter((e) => e.supersededBy).length
  const mergedCount = clusters.reduce((n, c) => n + c.members.length, 0)

  const rowMeta = (e: DecisionEntry) => (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        onClick={() => onOpenSource(e.meetingId, e.anchor)}
        className="inline-flex min-w-0 items-center gap-1 text-[11px] text-primary transition-opacity hover:opacity-75"
        title={e.anchor ? "跳到来源会议转写页并选中出处片段" : "跳到来源会议"}
      >
        <CornerDownLeft className="h-3 w-3 shrink-0" />
        <span className="truncate">《{e.meetingTitle}》</span>
      </button>
      <span className="text-[11px] text-muted-foreground cjk-latin tabular-nums">{e.date}</span>
      {e.tags.map((t) => (
        <span key={t} className="rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
          {t}
        </span>
      ))}
      {e.supersededBy ? (
        <span className="flex items-center gap-1">
          <span className="rounded-[var(--radius-pill)] border border-border bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
            已被取代
          </span>
          <button
            onClick={() => onOpenSource(e.supersededBy!.meetingId)}
            className="text-[10px] text-primary transition-opacity hover:opacity-75"
          >
            查看新决议
          </button>
          <button
            onClick={() => onClearSuperseded(e.meetingId, e.decisionId)}
            className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            撤销标记
          </button>
        </span>
      ) : null}
    </div>
  )

  const supersedeHintRow = (e: DecisionEntry) => {
    const key = `${e.meetingId}:${e.decisionId}`
    if (e.supersededBy || dismissed.has(key)) return null
    const successor = supersedeHints.get(key)
    if (!successor) return null
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-muted/40 px-2 py-1.5">
        <span className="text-[10px] leading-relaxed text-muted-foreground">
          疑似已被《{successor.meetingTitle}》（{successor.date}）的新决议更新：「{successor.content.slice(0, 30)}
          {successor.content.length > 30 ? "…" : ""}」
        </span>
        <button
          onClick={() =>
            onMarkSuperseded(e.meetingId, e.decisionId, {
              meetingId: successor.meetingId,
              decisionId: successor.decisionId,
            })
          }
          className="shrink-0 rounded-[var(--radius-pill)] bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          标记被取代
        </button>
        <button
          onClick={() => setDismissed((prev) => new Set(prev).add(key))}
          className="shrink-0 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          忽略
        </button>
      </div>
    )
  }

  if (all.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-primary/10 text-primary">
          <Scale className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">还没有记录在案的决议</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
            生成纪要时会自动抽取「达成的决定」并附原文引用，全部会议的决议会汇总到这里；反复重申的会合并为稳定结论，被推翻的会标记「已被取代」
          </p>
        </div>
      </div>
    )
  }

  const monthGroups = (() => {
    const map = new Map<string, DecisionEntry[]>()
    for (const e of filtered) {
      const key = e.date.slice(0, 7) || "未知日期"
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  })()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 py-1 pr-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-[var(--font-display)] text-base font-semibold tracking-tight text-foreground">
              决议档案
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground cjk-latin tabular-nums">
              共 {all.length} 条 · 来自 {new Set(all.map((e) => e.meetingId)).size} 场会
              {mergedCount > 0 ? ` · ${mergedCount} 条重复重申已合并` : ""}
              {supersededCount > 0 ? ` · ${supersededCount} 条已被取代` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 rounded-[var(--radius-md)] border border-border bg-background p-0.5">
            {(
              [
                { key: "stable", label: "稳定结论", icon: GitMerge },
                { key: "timeline", label: "按月时间线", icon: History },
              ] as const
            ).map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={cn(
                  "flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] transition-colors",
                  view === v.key
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <v.icon className="h-3 w-3" />
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜决议内容、来源会议、原文引用…（如：定价）"
              className="h-8 w-full rounded-[var(--radius-md)] border border-border bg-background pl-8 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)]"
            />
          </div>
          {supersededCount > 0 ? (
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={showSuperseded}
                onChange={(e) => setShowSuperseded(e.target.checked)}
                className="accent-[hsl(var(--primary))]"
              />
              显示已被取代（{supersededCount}）
            </label>
          ) : null}
        </div>

        {tagOptions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {tagOptions.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? "" : t)}
                className={cn(
                  "rounded-[var(--radius-pill)] border px-2 py-0.5 text-[10px] transition-colors",
                  tagFilter === t
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            没有匹配的决议；换个关键词，或勾选「显示已被取代」
          </p>
        ) : view === "stable" ? (
          <ul className="space-y-2">
            {clusters.map((c) => (
              <li
                key={`${c.rep.meetingId}-${c.rep.decisionId}`}
                className={cn(
                  "rounded-[var(--radius-lg)] border bg-background px-3.5 py-3 transition-shadow hover:shadow-[var(--elev-ring)]",
                  c.rep.supersededBy ? "border-border opacity-60" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={cn(
                      "min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground",
                      c.rep.supersededBy && "line-through decoration-muted-foreground/50",
                    )}
                  >
                    {c.rep.content}
                  </p>
                  {c.members.length > 0 ? (
                    <span
                      className="shrink-0 rounded-[var(--radius-pill)] bg-primary/10 px-2 py-px text-[10px] font-medium text-primary cjk-latin tabular-nums"
                      title="同一结论在多场会议中被重申——已合并为一条稳定结论，无需逐场翻查"
                    >
                      稳定结论 · {c.meetingCount} 场会重申 {c.members.length + 1} 次
                    </span>
                  ) : null}
                </div>
                {rowMeta(c.rep)}
                {supersedeHintRow(c.rep)}
                {c.members.length > 0 ? (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer select-none text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                      历史重申记录（{c.members.length} 条）
                    </summary>
                    <ul className="mt-1 space-y-1 border-l border-border pl-3">
                      {c.members.map((m) => (
                        <li key={`${m.meetingId}-${m.decisionId}`} className="text-[11px] leading-relaxed text-muted-foreground">
                          <span className="cjk-latin tabular-nums">{m.date}</span> 《{m.meetingTitle}》：{m.content}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {c.rep.sourceQuote ? (
                  <p className="mt-1.5 flex items-start gap-1.5 pl-1 text-[11px] leading-relaxed text-muted-foreground">
                    <Quote className="mt-px h-3 w-3 shrink-0 text-primary/60" />
                    <span className="line-clamp-2">{c.rep.sourceQuote}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          monthGroups.map(([month, entries], gi) => (
            <details key={month} open={gi < 2}>
              <summary className="mb-2 flex cursor-pointer select-none items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                <span className="cjk-latin tabular-nums">{month}</span>
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{entries.length} 条</span>
                {gi >= 2 ? (
                  <span className="text-[10px] font-normal text-muted-foreground/70">较早月份已折叠，点开查看</span>
                ) : null}
              </summary>
              <ul className="space-y-1.5">
                {entries.map((e) => (
                  <li
                    key={`${e.meetingId}-${e.decisionId}`}
                    className={cn(
                      "rounded-[var(--radius-md)] border border-border bg-background px-3 py-2.5 transition-shadow hover:shadow-[var(--elev-ring)]",
                      e.supersededBy && "opacity-60",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[13px] font-medium leading-snug text-foreground",
                        e.supersededBy && "line-through decoration-muted-foreground/50",
                      )}
                    >
                      {e.content}
                    </p>
                    {rowMeta(e)}
                    {supersedeHintRow(e)}
                    {e.sourceQuote ? (
                      <p className="mt-1.5 flex items-start gap-1.5 pl-1 text-[11px] leading-relaxed text-muted-foreground">
                        <Quote className="mt-px h-3 w-3 shrink-0 text-primary/60" />
                        <span className="line-clamp-2">{e.sourceQuote}</span>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}

        <p className="pb-2 text-[10px] leading-relaxed text-muted-foreground/70">
          稳定结论 = 跨会议相似度 ≥85% 的决议自动归并（取最新一条为代表）；「疑似被取代」由相似度 55%–85% 的更晚决议触发，
          仅提示不自动改——是否取代由你确认。所有计算都在本机完成，免费且实时。
        </p>
      </div>
    </div>
  )
}
