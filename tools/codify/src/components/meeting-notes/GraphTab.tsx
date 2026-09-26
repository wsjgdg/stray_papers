import { useEffect, useMemo, useState } from "react"
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Network,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Meeting } from "@/lib/store"
import {
  buildGraph,
  evolutionChain,
  queryNodes,
  relationsOf,
  type GraphNodeKind,
} from "@/lib/graph"
import {
  buildAliasMap,
  exclusionKey,
  loadAliasRules,
  loadExclusions,
  saveAliasRules,
  saveExclusions,
  suggestMerges,
  type AliasRule,
  type MergeSuggestion,
} from "@/lib/entityResolution"

interface GraphTabProps {
  meetings: Meeting[]
  entitiesBusy: boolean
  onJumpMeeting: (meetingId: string) => void
  onExtractEntities: (meetingId: string) => void
}

const KIND_FILTERS: { key: GraphNodeKind | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "person", label: "人物" },
  { key: "series", label: "系列" },
  { key: "entity", label: "项目/客户" },
  { key: "meeting", label: "会议" },
]

const KIND_LABELS: Record<GraphNodeKind, string> = {
  person: "人物",
  series: "系列",
  meeting: "会议",
  decision: "决议",
  action: "行动项",
  entity: "实体",
}

const KIND_ICON: Record<GraphNodeKind, string> = {
  person: "👤",
  series: "🗂",
  meeting: "📅",
  decision: "⚖️",
  action: "☑️",
  entity: "🏷",
}

// 知识图谱页：本地免费层实时编译（说话人/负责人/系列/决议/行动项/跟进边），
// AI 实体补全为显式付费开关。查询直接走结构——「关于定价的所有决策」返回演进链，不是搜文档。
export function GraphTab({ meetings, entitiesBusy, onJumpMeeting, onExtractEntities }: GraphTabProps) {
  // ── 实体消解：别名规则与「不是同一人」排除对，都由用户确认后持久化 ──
  const [aliasRules, setAliasRules] = useState<AliasRule[]>(loadAliasRules)
  const [exclusions, setExclusions] = useState<string[]>(loadExclusions)
  const [showMerge, setShowMerge] = useState(false)
  const aliasMap = useMemo(() => buildAliasMap(aliasRules), [aliasRules])
  const graph = useMemo(() => buildGraph(meetings, aliasMap), [meetings, aliasMap])
  const mergeSuggestions = useMemo(
    () => suggestMerges(meetings, aliasMap, exclusions),
    [meetings, aliasMap, exclusions],
  )

  const applyMerge = (s: MergeSuggestion) => {
    const next = [...aliasRules.filter((r) => r.alias !== s.a), { alias: s.a, canonical: s.b }]
    setAliasRules(next)
    saveAliasRules(next)
  }
  const markDistinct = (s: MergeSuggestion) => {
    const key = exclusionKey(s.a, s.b)
    if (exclusions.includes(key)) return
    const next = [...exclusions, key]
    setExclusions(next)
    saveExclusions(next)
  }
  const removeAlias = (alias: string) => {
    const next = aliasRules.filter((r) => r.alias !== alias)
    setAliasRules(next)
    saveAliasRules(next)
  }
  const removeExclusion = (key: string) => {
    const next = exclusions.filter((k) => k !== key)
    setExclusions(next)
    saveExclusions(next)
  }

  const [query, setQuery] = useState("")
  const [kindFilter, setKindFilter] = useState<GraphNodeKind | "all">("all")
  const [selectedId, setSelectedId] = useState<string>("")

  const hits = useMemo(
    () =>
      queryNodes(graph, query, kindFilter === "all" ? undefined : [kindFilter]).slice(0, 60),
    [graph, query, kindFilter],
  )

  const chain = useMemo(() => evolutionChain(graph, query, meetings), [graph, query, meetings])

  // 默认选中：度数最高的人物（没有则第一个命中）
  useEffect(() => {
    if (selectedId && graph.nodeById.has(selectedId)) return
    const firstPerson = hits.find((h) => h.node.kind === "person") ?? hits[0]
    setSelectedId(firstPerson?.node.id ?? "")
  }, [hits, graph, selectedId])

  const selected = selectedId ? graph.nodeById.get(selectedId) : undefined
  const relations = selected ? relationsOf(graph, selected.id) : []

  if (meetings.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-primary/10 text-primary">
          <Network className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">还没有可编译的知识</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
            创建会议并生成纪要后，人物、系列、决议、行动项会自动编译成结构化图谱
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 font-[var(--font-display)] text-base font-semibold tracking-tight text-foreground">
          <Network className="h-4 w-4 text-primary" />
          知识图谱
          <span className="text-xs font-normal text-muted-foreground cjk-latin tabular-nums">
            {graph.nodes.length} 个节点 · {graph.edges.length} 条关系 · 本机实时编译，不花钱
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          搜一个词（如「定价」或人名）：下方直接给出结构化的演进链与关系网，不是文档检索
        </p>
        {/* 移动端主动降级：图谱是重交互视图，小屏提示改用问答而不是硬做全功能 */}
        <p className="mt-1.5 rounded-[var(--radius-md)] border border-border bg-muted/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground md:hidden">
          图谱的缩放与点选交互建议在桌面端使用；手机上可先用「问答」检索同样的信息
        </p>
      </div>

      {/* ── 人物实体归并：机器只出候选（称谓模式 / 名称包含），合并必须由你确认 ── */}
      {mergeSuggestions.length > 0 || aliasRules.length > 0 || exclusions.length > 0 ? (
        <section className="shrink-0 rounded-[var(--radius-md)] border border-border bg-card/50">
          <button
            onClick={() => setShowMerge((v) => !v)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {showMerge ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Users className="h-3.5 w-3.5" />
            人物实体归并
            {mergeSuggestions.length > 0 ? (
              <span className="rounded-[var(--radius-pill)] bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary cjk-latin tabular-nums">
                {mergeSuggestions.length} 条建议
              </span>
            ) : null}
            {aliasRules.length > 0 ? (
              <span className="rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground cjk-latin tabular-nums">
                已归并 {aliasRules.length}
              </span>
            ) : null}
          </button>
          {showMerge ? (
            <div className="space-y-2.5 border-t border-border px-3 py-2.5">
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                「张三 / 张总 / 老张」是不是同一个人？机器按称谓模式与名称包含给出候选，
                <span className="text-foreground/80">只有你点「归并」才生效</span>；同一场会议里各自发言过的两个人不会出现在建议里
              </p>

              {mergeSuggestions.length > 0 ? (
                <ul className="space-y-1">
                  {mergeSuggestions.slice(0, 10).map((s) => (
                    <li
                      key={`${s.a}→${s.b}`}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-md)] border border-border bg-background px-2.5 py-1.5"
                    >
                      <span className="text-[12px] font-medium text-foreground">
                        {s.a} <span className="text-muted-foreground">↔</span> {s.b}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title={s.reason}>
                        {s.reason}
                      </span>
                      <button
                        onClick={() => applyMerge(s)}
                        className="rounded-[var(--radius-pill)] border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/15"
                        title={`归并后「${s.a}」的关系全部挂到「${s.b}」名下，节点上会标注 aka`}
                      >
                        归并为「{s.b}」
                      </button>
                      <button
                        onClick={() => markDistinct(s)}
                        className="rounded-[var(--radius-pill)] border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                        title="标记为不同的人，之后不再建议"
                      >
                        不是同一人
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[10px] text-muted-foreground/75">当前没有待处理的归并建议</p>
              )}

              {aliasRules.length > 0 ? (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground">已归并规则</p>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {aliasRules.map((r) => (
                      <li
                        key={r.alias}
                        className="flex items-center gap-1 rounded-[var(--radius-pill)] border border-border bg-background px-2 py-0.5 text-[10px] text-foreground/85"
                      >
                        {r.alias} → {r.canonical}
                        <button
                          onClick={() => removeAlias(r.alias)}
                          aria-label={`撤销归并 ${r.alias}`}
                          className="rounded-full p-px text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {exclusions.length > 0 ? (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground">
                    已标记「不是同一人」（{exclusions.length} 对）
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {exclusions.map((k) => (
                      <li
                        key={k}
                        className="flex items-center gap-1 rounded-[var(--radius-pill)] border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {k}
                        <button
                          onClick={() => removeExclusion(k)}
                          aria-label={`恢复对 ${k} 的建议`}
                          title="撤销后这对名字会重新参与建议"
                          className="rounded-full p-px transition-colors hover:text-foreground"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="查实体或关键词：人名 / 项目 / 定价 / 上线…"
            className="h-8 w-full rounded-[var(--radius-md)] border border-border bg-background pl-8 pr-8 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)]"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              aria-label="清除查询"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-[var(--radius-md)] border border-border bg-background p-0.5">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setKindFilter(f.key)}
              className={cn(
                "rounded-[var(--radius-sm)] px-2 py-1 text-[11px] transition-colors",
                kindFilter === f.key
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {chain.length > 0 ? (
        <div className="shrink-0 rounded-[var(--radius-lg)] border border-primary/25 bg-primary/[0.03] px-4 py-3">
          <p className="text-xs font-medium text-foreground">
            「{query}」演进链
            <span className="ml-1.5 font-normal text-muted-foreground cjk-latin tabular-nums">
              {chain.length} 个节点，按时间排列
            </span>
          </p>
          <ol className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
            {chain.map((ev, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[12px] leading-relaxed">
                <span className="shrink-0 text-[10px] text-muted-foreground cjk-latin tabular-nums">{ev.date}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-[var(--radius-pill)] px-1.5 py-px text-[10px]",
                    ev.kind === "decision"
                      ? "bg-primary/10 text-primary"
                      : ev.kind === "digest"
                        ? "bg-muted text-foreground/70"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {ev.kind === "decision" ? "决议" : ev.kind === "digest" ? "跟进" : "行动项"}
                </span>
                <span className="min-w-0 flex-1 text-foreground/85">{ev.label}</span>
                <button
                  onClick={() => onJumpMeeting(ev.meetingId)}
                  className="shrink-0 text-[10px] text-primary transition-opacity hover:opacity-75"
                >
                  《{ev.meetingTitle}》
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex w-60 shrink-0 flex-col rounded-[var(--radius-lg)] border border-border bg-card/40">
          <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground cjk-latin tabular-nums">
            {query || kindFilter !== "all" ? `匹配 ${hits.length} 个实体` : `按关系数排序 · 前 ${hits.length} 个`}
          </p>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
            {hits.map((h) => (
              <li key={h.node.id}>
                <button
                  onClick={() => setSelectedId(h.node.id)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors",
                    selectedId === h.node.id ? "bg-primary/10" : "hover:bg-background/70",
                  )}
                >
                  <span className="shrink-0 text-[11px]">{KIND_ICON[h.node.kind]}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{h.node.label}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground cjk-latin tabular-nums">{h.degree}</span>
                </button>
              </li>
            ))}
            {hits.length === 0 ? (
              <li className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                没有匹配的实体
              </li>
            ) : null}
          </ul>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-background p-4">
          {!selected ? (
            <p className="py-10 text-center text-xs text-muted-foreground">点左侧实体查看它的关系网</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg">{KIND_ICON[selected.kind]}</span>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">{selected.label}</h3>
                <span className="rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                  {KIND_LABELS[selected.kind]}
                </span>
                {selected.meta ? (
                  <span className="text-[11px] text-muted-foreground cjk-latin">{selected.meta}</span>
                ) : null}
                {selected.kind === "meeting" ? (
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onJumpMeeting(selected.id.slice("meeting:".length))}
                      className="h-7 gap-1 rounded-[var(--radius-sm)] text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
                    >
                      <CalendarDays className="h-3 w-3" />
                      打开会议
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={entitiesBusy}
                      onClick={() => onExtractEntities(selected.id.slice("meeting:".length))}
                      title="AI 抽取转写里提到的人物 / 项目 / 客户实体并入图谱（付费调用，会先请你确认）"
                      className="h-7 gap-1 rounded-[var(--radius-sm)] text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
                    >
                      {entitiesBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      AI 补全实体
                    </Button>
                  </div>
                ) : null}
              </div>

              <ul className="mt-3 space-y-1">
                {relations.map((r, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-xs leading-relaxed">
                    <span className="w-24 shrink-0 text-right text-[10px] text-muted-foreground">{r.rel}</span>
                    <span className="text-muted-foreground/50">→</span>
                    <button
                      onClick={() => {
                        if (r.other.kind === "meeting") onJumpMeeting(r.other.id.slice("meeting:".length))
                        else setSelectedId(r.other.id)
                      }}
                      className={cn(
                        "min-w-0 flex-1 truncate rounded-[var(--radius-sm)] px-1 py-0.5 text-left transition-colors",
                        r.other.kind === "meeting"
                          ? "text-primary hover:bg-primary/5"
                          : "text-foreground/85 hover:bg-muted/60",
                      )}
                    >
                      {KIND_ICON[r.other.kind]} {r.other.label}
                      {r.other.meta ? (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">{r.other.meta}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
                {relations.length === 0 ? (
                  <li className="py-6 text-center text-[11px] text-muted-foreground">这个实体还没有关系记录</li>
                ) : null}
              </ul>

              {selected.kind === "person" ? (
                <p className="mt-3 flex items-center gap-1.5 text-[10px] leading-relaxed text-muted-foreground/80">
                  <Users className="h-3 w-3 shrink-0" />
                  人物来自转写说话人标注、行动项负责人与 AI 实体补全；同名自动合并为同一节点
                </p>
              ) : null}
              {selected.kind === "series" ? (
                <p className="mt-3 flex items-center gap-1.5 text-[10px] leading-relaxed text-muted-foreground/80">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  系列来自会议标签（或显式系列标识）；点系列下的会议可跳转，时间线页可看演进与对比
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
