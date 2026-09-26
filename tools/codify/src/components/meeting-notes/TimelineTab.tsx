import { useEffect, useMemo, useState } from "react"
import { CalendarDays, CheckCircle2, Columns2, GitBranch, ListTodo, Loader2, Milestone, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { contentStamp, type Meeting } from "@/lib/store"

interface TimelineTabProps {
  meetings: Meeting[]
  selectedId: string
  evolutionCache: Record<string, { text: string; at: number }>
  evolutionBusy: boolean
  evolutionError: string
  onGenerateEvolution: (tag: string) => void
  onJump: (meetingId: string) => void
}

interface SeriesGroup {
  tag: string
  meetings: Meeting[] // 按日期升序
}

const UNTAGGED = "（未打标）"

function fmtEvolutionTime(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── 议题 diff：同名/包含关系的议题配对，要点做归一化集合比对 ──
function normPoint(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase()
}

interface TopicDiff {
  topicA: string
  topicB: string
  same: string[]
  onlyA: string[]
  onlyB: string[]
}

function diffTopics(a: Meeting, b: Meeting): TopicDiff[] {
  const at = a.outline?.topics ?? []
  const bt = b.outline?.topics ?? []
  const out: TopicDiff[] = []
  const usedB = new Set<number>()
  for (const ta of at) {
    const na = normPoint(ta.topic)
    let best = -1
    bt.forEach((tb, j) => {
      if (usedB.has(j) || best >= 0) return
      const nb = normPoint(tb.topic)
      if (na && nb && (na === nb || na.includes(nb) || nb.includes(na))) best = j
    })
    if (best >= 0) {
      usedB.add(best)
      const tb = bt[best]
      const setB = new Set(tb.points.map(normPoint))
      const setA = new Set(ta.points.map(normPoint))
      out.push({
        topicA: ta.topic,
        topicB: tb.topic,
        same: ta.points.filter((p) => setB.has(normPoint(p))),
        onlyA: ta.points.filter((p) => !setB.has(normPoint(p))),
        onlyB: tb.points.filter((p) => !setA.has(normPoint(p))),
      })
    } else {
      out.push({ topicA: ta.topic, topicB: "", same: [], onlyA: ta.points, onlyB: [] })
    }
  }
  bt.forEach((tb, j) => {
    if (!usedB.has(j)) out.push({ topicA: "", topicB: tb.topic, same: [], onlyA: [], onlyB: tb.points })
  })
  return out
}

function DiffPanel({ a, b, onClose }: { a: Meeting; b: Meeting; onClose: () => void }) {
  const diffs = diffTopics(a, b)
  const hasOutline = (a.outline?.topics.length ?? 0) > 0 || (b.outline?.topics.length ?? 0) > 0
  const changed = diffs.reduce((n, d) => n + d.onlyA.length + d.onlyB.length + (d.topicA && d.topicB ? 0 : 1), 0)
  return (
    <div className="rounded-[var(--radius-lg)] border border-primary/30 bg-primary/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
          <Columns2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">《{a.title}》</span>
          <span className="shrink-0 text-muted-foreground cjk-latin">{a.date}</span>
          <span className="shrink-0 text-muted-foreground">→</span>
          <span className="truncate">《{b.title}》</span>
          <span className="shrink-0 text-muted-foreground cjk-latin">{b.date}</span>
        </p>
        <button
          onClick={onClose}
          aria-label="退出对比"
          className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {!hasOutline ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          两场会都还没有议题纪要——先生成摘要，再来对比结论变化
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground cjk-latin">
            配对了 {diffs.filter((d) => d.topicA && d.topicB).length} 组同名议题，{changed} 处结论变化
          </p>
          <div className="mt-2.5 space-y-3">
            {diffs.map((d, i) => (
              <div key={i}>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  {d.topicB || d.topicA}
                  {!d.topicB ? (
                    <span className="rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] font-normal text-muted-foreground">
                      仅前一场有此议题
                    </span>
                  ) : null}
                  {!d.topicA ? (
                    <span className="rounded-[var(--radius-pill)] bg-primary/10 px-1.5 py-px text-[10px] font-normal text-primary">
                      新出现的议题
                    </span>
                  ) : null}
                </p>
                <ul className="mt-1 space-y-0.5 pl-1">
                  {d.onlyB.map((p, j) => (
                    <li key={`b${j}`} className="rounded-[var(--radius-sm)] bg-primary/5 px-1.5 py-0.5 text-[11px] leading-relaxed text-foreground/90">
                      <span className="mr-1 text-[10px] font-medium text-primary">新增</span>
                      {p}
                    </li>
                  ))}
                  {d.onlyA.map((p, j) => (
                    <li key={`a${j}`} className="px-1.5 py-0.5 text-[11px] leading-relaxed text-muted-foreground line-through decoration-muted-foreground/40">
                      <span className="mr-1 text-[10px] no-underline opacity-70">已被替换</span>
                      {p}
                    </li>
                  ))}
                  {d.same.map((p, j) => (
                    <li key={`s${j}`} className="px-1.5 py-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      <span className="mr-1 text-[10px] opacity-70">一致</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// 系列时间线：同一标签的会议按时间排成一条线，看议题怎么演进、决议怎么累积。
// 系列 = 标签（一场会可属多个系列）；没打标签的会议归入「未打标」组。
export function TimelineTab({
  meetings,
  selectedId,
  evolutionCache,
  evolutionBusy,
  evolutionError,
  onGenerateEvolution,
  onJump,
}: TimelineTabProps) {
  const series = useMemo<SeriesGroup[]>(() => {
    const byTag = new Map<string, Meeting[]>()
    for (const m of meetings) {
      // 显式 seriesId 优先成系列（预留字段）；否则按标签归组；都没有归「未打标」
      const sid = typeof m.seriesId === "string" ? m.seriesId.trim() : ""
      const keys = sid ? [sid] : m.tags.length > 0 ? m.tags : [UNTAGGED]
      for (const t of keys) {
        const list = byTag.get(t) ?? []
        list.push(m)
        byTag.set(t, list)
      }
    }
    return [...byTag.entries()]
      .map(([tag, list]) => ({
        tag,
        meetings: [...list].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt),
      }))
      .sort((a, b) => {
        // 有会议的标签系列在前，按系列内最近活动降序；「未打标」永远垫底
        if (a.tag === UNTAGGED) return 1
        if (b.tag === UNTAGGED) return -1
        const la = a.meetings[a.meetings.length - 1]
        const lb = b.meetings[b.meetings.length - 1]
        return lb.date.localeCompare(la.date)
      })
  }, [meetings])

  const selected = meetings.find((m) => m.id === selectedId)
  const preferred = selected
    ? (typeof selected.seriesId === "string" && selected.seriesId.trim()
        ? selected.seriesId.trim()
        : selected.tags[0]) || ""
    : ""
  const [activeTag, setActiveTag] = useState("")
  // 对比模式：选两场会，并排 diff 同一议题的结论变化
  const [compareMode, setCompareMode] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])

  // 切换会议时跟随其第一个标签（用户手动选过系列则尊重手动选择）
  useEffect(() => {
    setActiveTag("")
    setCompareMode(false)
    setCompareIds([])
  }, [selectedId])

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 2
          ? [prev[1], id]
          : [...prev, id],
    )
  }

  const current =
    series.find((s) => s.tag === (activeTag || preferred)) ??
    series.find((s) => s.meetings.length >= 2) ??
    series[0]

  if (series.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-primary/10 text-primary">
          <Milestone className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">还没有会议可以排时间线</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
            新建会议并生成纪要后，这里会按系列展示每场会的脉络
          </p>
        </div>
      </div>
    )
  }

  if (!current) return null

  // 议题演进：系列内每场会的议题按时间排开
  const topicFlow = current.meetings
    .map((m) => ({
      meeting: m,
      topics: (m.outline?.topics ?? []).map((t) => t.topic),
    }))
    .filter((x) => x.topics.length > 0)

  const totalDecisions = current.meetings.reduce((n, m) => n + m.decisions.length, 0)
  const totalOpenActions = current.meetings.reduce(
    (n, m) => n + m.actions.filter((a) => a.status !== "done" && a.status !== "cancelled").length,
    0,
  )

  const comparePair =
    compareIds.length === 2
      ? compareIds
          .map((id) => current.meetings.find((m) => m.id === id))
          .filter((m): m is Meeting => Boolean(m))
          .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
      : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 py-1 pr-2">
        <div>
          <h2 className="flex items-center gap-2 font-[var(--font-display)] text-base font-semibold tracking-tight text-foreground">
            <GitBranch className="h-4 w-4 text-primary" />
            系列时间线
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            同一标签的会议按时间排成一条线；给会议打标签（顶栏日期旁）即可归入系列
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {series.map((s) => (
            <button
              key={s.tag}
              onClick={() => setActiveTag(s.tag)}
              className={cn(
                "rounded-[var(--radius-pill)] border px-2.5 py-1 text-xs transition-colors cjk-latin",
                s.tag === current.tag
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {s.tag}
              <span className="ml-1 text-[10px] opacity-70 tabular-nums">{s.meetings.length}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground cjk-latin tabular-nums">
            《{current.tag}》系列共 {current.meetings.length} 场 · 累计 {totalDecisions} 条决议 ·{" "}
            {totalOpenActions} 条行动项未完成
          </p>
          {current.meetings.length >= 2 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onGenerateEvolution(current.tag)}
                disabled={evolutionBusy}
                title="AI 通读系列历次会议的摘要与议题，梳理「主线何时提出 → 怎么变化 → 当前结论」的演进脉络（调用 AI，会先请你确认）"
                className="h-7 gap-1.5 rounded-[var(--radius-md)] text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
              >
                {evolutionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {evolutionCache[current.tag] ? "重新生成演进脉络" : "生成演进脉络"}
              </Button>
              <Button
                variant={compareMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setCompareMode((v) => !v)
                  setCompareIds([])
                }}
                className={cn(
                  "h-7 gap-1.5 rounded-[var(--radius-md)] text-xs",
                  compareMode
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-muted-foreground hover:border-primary/40 hover:text-primary",
                )}
              >
                <Columns2 className="h-3.5 w-3.5" />
                {compareMode ? "退出对比" : "对比两场会"}
              </Button>
            </div>
          ) : null}
        </div>

        {evolutionError ? (
          <p className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {evolutionError}
          </p>
        ) : null}

        {evolutionCache[current.tag] ? (
          <section className="rounded-[var(--radius-lg)] border border-primary/25 bg-primary/[0.03] p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                「{current.tag}」演进脉络
                {current.meetings.some((m) => contentStamp(m) > evolutionCache[current.tag].at) ? (
                  <span
                    className="rounded-[var(--radius-pill)] border border-destructive/40 bg-destructive/5 px-1.5 py-px text-[10px] font-normal text-destructive"
                    title="生成之后系列里有会议的转写或纪要更新过，这份脉络可能已过时——建议重新生成"
                  >
                    可能过时
                  </span>
                ) : null}
              </h3>
              <span className="text-[10px] text-muted-foreground cjk-latin tabular-nums">
                生成于 {fmtEvolutionTime(evolutionCache[current.tag].at)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">
              {evolutionCache[current.tag].text}
            </p>
          </section>
        ) : null}

        {compareMode ? (
          <p className="text-[11px] text-muted-foreground">
            {comparePair
              ? "对比结果如下；再点其他会议卡可换对比对象"
              : `依次点选两场会议（已选 ${compareIds.length}/2），并排看同一议题的结论变化`}
          </p>
        ) : null}

        {comparePair ? <DiffPanel a={comparePair[0]} b={comparePair[1]} onClose={() => setCompareIds([])} /> : null}

        <ol className="relative space-y-3 border-l border-border pl-5">
          {current.meetings.map((m) => {
            const isCurrent = m.id === selectedId
            const open = m.actions.filter((a) => a.status !== "done" && a.status !== "cancelled").length
            const inCompare = compareIds.includes(m.id)
            return (
              <li key={m.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[26px] top-3 h-2.5 w-2.5 rounded-full border-2 border-background",
                    isCurrent || inCompare ? "bg-primary" : "bg-border",
                  )}
                />
                <button
                  onClick={() => (compareMode ? toggleCompare(m.id) : onJump(m.id))}
                  className={cn(
                    "w-full rounded-[var(--radius-lg)] border bg-background p-3.5 text-left transition-shadow hover:shadow-[var(--elev-ring)]",
                    inCompare ? "border-primary shadow-[var(--focus-ring)]" : isCurrent ? "border-primary/40" : "border-border",
                  )}
                >
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground cjk-latin tabular-nums">
                      <CalendarDays className="h-3 w-3" />
                      {m.date}
                    </span>
                    <span className="text-sm font-semibold tracking-tight text-foreground">
                      {m.title}
                    </span>
                    {isCurrent ? (
                      <span className="rounded-[var(--radius-pill)] bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
                        当前会议
                      </span>
                    ) : null}
                  </p>
                  {m.brief?.content ? (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/85">
                      {m.brief.content}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-muted-foreground">未生成纪要</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {(m.outline?.topics ?? []).slice(0, 4).map((t) => (
                      <span
                        key={t.topic}
                        className="rounded-[var(--radius-pill)] bg-muted px-2 py-px text-[10px] text-muted-foreground"
                      >
                        {t.topic}
                      </span>
                    ))}
                    {m.decisions.length > 0 ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground cjk-latin tabular-nums">
                        <CheckCircle2 className="h-3 w-3" />
                        {m.decisions.length} 决议
                      </span>
                    ) : null}
                    {open > 0 ? (
                      <span className="flex items-center gap-1 text-[11px] text-primary cjk-latin tabular-nums">
                        <ListTodo className="h-3 w-3" />
                        {open} 待办
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            )
          })}
        </ol>

        {topicFlow.length > 1 ? (
          <section className="rounded-[var(--radius-lg)] border border-border bg-background p-4">
            <h3 className="text-xs font-semibold text-muted-foreground">
              议题演进 <span className="font-normal">· 系列内各场会议的议题按时间排开</span>
            </h3>
            <ul className="mt-2.5 space-y-2">
              {topicFlow.map(({ meeting, topics }) => (
                <li key={meeting.id} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 text-muted-foreground cjk-latin tabular-nums">
                    {meeting.date}
                  </span>
                  <span className="min-w-0 flex-1">
                    {topics.map((t, i) => (
                      <span key={t} className="text-foreground/85">
                        {i > 0 ? <span className="mx-1 text-muted-foreground/50">/</span> : null}
                        {t}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
