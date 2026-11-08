import { memo, useEffect, useMemo, useRef, useState } from "react"
import { Archive, ArchiveRestore, Check, Plus, Search, Sparkles, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { isOpenStatus, todayStr, type Meeting } from "@/lib/store"
import { countChipLines, type Chip } from "@/lib/textMeasure"
import type { ListSort } from "@/hooks/useMeetingNotes"
import type { RelatedMeeting } from "@/lib/ai"

interface MeetingListProps {
  meetings: Meeting[]
  totalCount: number
  selectedId: string
  searchText: string
  searchHasFuzzy?: boolean // 本轮结果是否含模糊（拼写容错）命中
  allTags: string[]
  tagFilter: string
  showArchived: boolean
  archivedCount: number
  archiveCandidateCount: number
  listSort: ListSort
  onListSortChange: (v: ListSort) => void
  onToggleShowArchived: (v: boolean) => void
  onToggleArchive: (id: string) => void
  findBusy: boolean
  findResults: RelatedMeeting[] | null
  findQuery: string
  onSemanticFind: () => void
  onClearFind: () => void
  onTagFilterChange: (tag: string) => void
  onSearchChange: (v: string) => void
  onSelect: (id: string) => void
  onCreate: (title: string, date: string) => void
  onRemove: (id: string) => void
}

// 智能排序切换器：无搜索时四种口径任选；搜索激活时命中分排序（相关性）天然接管
const SORT_OPTIONS: { value: ListSort; label: string; title: string }[] = [
  { value: "time", label: "时间", title: "按会议日期倒序（默认）" },
  { value: "open", label: "待办", title: "未完成行动项多的排前面——会后跟进的主视图" },
  { value: "review", label: "待核对", title: "低置信 + 待确认条目多的排前面——AI 产出等你拍板的会议优先" },
  { value: "updated", label: "最近改", title: "按最近修改时间倒序" },
]

// ── 虚拟滚动行高模型（几百场会议的性能口径）──
// 行高 = 固定部分（内边距 + 单行截断的标题）+ 元信息行折行数 × 行高。
// 折行数用 canvas measureText 在 DOM 外预先算好（模拟 flex-wrap 贪心换行），
// 滚动过程零 DOM 测量、零重排；测量偏差最多让滚动条高度差几个像素，
// 真实布局仍由 CSS 完成，不会重叠或截断。
const VIRTUAL_MIN = 60 // 超过这个场数才启用虚拟滚动；小列表整渲染（少一层机制少一分风险）
const OVERSCAN = 6 // 视口上下各多渲染的行数，快滚不露白
const ROW_FIXED_H = 16 + 20 + 2 + 2 // py-2 上下 + 标题行 leading-5 + mt-0.5 + 行间 space-y-0.5
const META_LINE_H = 17 // 11px 文本 / 10px 芯片的一行
const META_MAX_W = 244 // 280 侧栏 - 列表 px-2 - 卡片 px-2.5
const META_GAP_X = 6 // gap-x-1.5
const FONT_11 = "11px system-ui, -apple-system, sans-serif"
const FONT_10 = "10px system-ui, -apple-system, sans-serif"

// 行高缓存（静态数据绑定）：行高只依赖会议自身字段（日期/纪要标记/待办数/标签芯片折行），
// 会议对象是不可变更新——WeakMap 按对象身份缓存，未变化的行零重算（canvas measureText
// 是列表重渲染的大头），编辑中的会议换了新对象自动失效，旧对象被 GC 顺手回收
const rowHeightCache = new WeakMap<Meeting, number>()

function rowHeight(m: Meeting): number {
  const cached = rowHeightCache.get(m)
  if (cached !== undefined) return cached
  const openCount = m.actions.filter((a) => isOpenStatus(a.status)).length
  const chips: Chip[] = [{ text: m.date, font: FONT_11, padX: 0 }]
  if (m.brief) chips.push({ text: "已生成纪要", font: FONT_11, padX: 0 })
  if (openCount > 0) chips.push({ text: `${openCount} 待办`, font: FONT_10, padX: 12 })
  for (const t of m.tags) chips.push({ text: t, font: FONT_10, padX: 12 })
  const h = ROW_FIXED_H + countChipLines(chips, META_GAP_X, META_MAX_W) * META_LINE_H
  rowHeightCache.set(m, h)
  return h
}

// 搜索输入框：击键状态留在组件内部（memo 化），200ms 防抖后才通知外部——
// 逐键输入只重渲染这个输入框，不触发全页面重渲染；清空立即生效。
// 快捷键 `/`（壳 Provider 广播 mn:focus-search）聚焦到这里；Esc 清空并失焦。
const SearchBox = memo(function SearchBox({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [local, setLocal] = useState(value)
  // 我们最近一次通知出去的值：parent 回流的 value 若等于它，说明是自己防抖通知的回声，
  // 不能当外部改写处理——否则会把防抖窗口内新击的键冲掉（经典的受控防抖竞态）
  const [notified, setNotified] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // 真实的外部改写（如「清除搜索与筛选」按钮）：渲染期对齐（React 官方 prop → state 同步模式）
  if (value !== notified) {
    setNotified(value)
    setLocal(value)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  // 全局 `/` 快捷键：聚焦并全选（直接输入即替换旧查询）
  useEffect(() => {
    const focus = () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener("mn:focus-search", focus)
    return () => window.removeEventListener("mn:focus-search", focus)
  }, [])
  const handleChange = (v: string) => {
    setLocal(v)
    if (timer.current) clearTimeout(timer.current)
    if (v.trim() === "") {
      setNotified("")
      onChange("") // 清空立即生效
      return
    }
    timer.current = setTimeout(() => {
      setNotified(v)
      onChange(v)
    }, 200)
  }
  return (
    <Input
      ref={inputRef}
      value={local}
      onChange={(e) => handleChange(e.target.value)}
      onKeyDown={(e) => {
        // Esc 返回：清空搜索并交还焦点（不冒泡给全局处理器）
        if (e.key === "Escape") {
          e.stopPropagation()
          if (local) {
            handleChange("")
          } else {
            inputRef.current?.blur()
          }
        }
      }}
      placeholder="搜索标题、全文、行动项（空格分隔多关键词）…"
      className="h-8 rounded-[var(--radius-md)] border-border bg-background pl-8 text-xs"
    />
  )
})

export function MeetingList({
  meetings,
  totalCount,
  selectedId,
  searchText,
  searchHasFuzzy,
  allTags,
  tagFilter,
  showArchived,
  archivedCount,
  archiveCandidateCount,
  listSort,
  onListSortChange,
  onToggleShowArchived,
  onToggleArchive,
  findBusy,
  findResults,
  findQuery,
  onSemanticFind,
  onClearFind,
  onTagFilterChange,
  onSearchChange,
  onSelect,
  onCreate,
  onRemove,
}: MeetingListProps) {
  const [creating, setCreating] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftDate, setDraftDate] = useState(todayStr())
  const [confirmDeleteId, setConfirmDeleteId] = useState("")

  // ── 虚拟滚动：只渲染视口 ± OVERSCAN 行，上下用等高占位撑住滚动条 ──
  const virtual = meetings.length > VIRTUAL_MIN
  const heights = useMemo(() => (virtual ? meetings.map(rowHeight) : null), [virtual, meetings])
  const prefix = useMemo(() => {
    if (!heights) return null
    const p: number[] = new Array(heights.length + 1)
    p[0] = 0
    for (let i = 0; i < heights.length; i++) p[i + 1] = p[i] + heights[i]
    return p
  }, [heights])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [vpTop, setVpTop] = useState(0)
  const [vpH, setVpH] = useState(600)

  useEffect(() => {
    if (!virtual) return
    const el = scrollRef.current
    if (!el) return
    setVpH(el.clientHeight)
    const ro = new ResizeObserver(() => setVpH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [virtual])

  let vStart = 0
  let vEnd = meetings.length
  let vTopPad = 0
  let vBottomPad = 0
  if (virtual && prefix && meetings.length > 0) {
    // 二分找第一个底边超过视口顶部的行
    let lo = 0
    let hi = meetings.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (prefix[mid + 1] <= vpTop) lo = mid + 1
      else hi = mid
    }
    // 二分找第一个顶边达到视口底部的行
    let lo2 = lo
    let hi2 = meetings.length
    const bottomEdge = vpTop + vpH
    while (lo2 < hi2) {
      const mid = (lo2 + hi2) >> 1
      if (prefix[mid + 1] < bottomEdge) lo2 = mid + 1
      else hi2 = mid
    }
    vStart = Math.max(0, lo - OVERSCAN)
    vEnd = Math.min(meetings.length, lo2 + OVERSCAN)
    vTopPad = prefix[vStart]
    vBottomPad = prefix[meetings.length] - prefix[vEnd]
  }

  // 从问答 / 决议档案等处跳转进来时，把选中会议滚进视口（虚拟窗口外也要能找到）
  useEffect(() => {
    if (!virtual || !prefix || !selectedId) return
    const idx = meetings.findIndex((m) => m.id === selectedId)
    const el = scrollRef.current
    if (idx < 0 || !el) return
    if (prefix[idx] < el.scrollTop || prefix[idx + 1] > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, prefix[idx] - el.clientHeight / 3)
    }
  }, [virtual, prefix, selectedId, meetings])

  const submitCreate = () => {
    if (!draftTitle.trim()) return
    onCreate(draftTitle, draftDate)
    setDraftTitle("")
    setDraftDate(todayStr())
    setCreating(false)
  }

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-card">
      <div className="space-y-2.5 p-3.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <SearchBox value={searchText} onChange={onSearchChange} />
        </div>
        {searchHasFuzzy && meetings.length > 0 ? (
          <p className="text-[10px] leading-none text-muted-foreground">
            结果含近似匹配（已容忍拼写偏差）
          </p>
        ) : null}
        {totalCount > 1 ? (
          // 智能排序切换器：搜索时相关性排序接管，切换器整行降为提示态
          <div className="flex items-center gap-1" role="group" aria-label="列表排序方式">
            <span className="text-[10px] text-muted-foreground/70">排序</span>
            {searchText.trim() ? (
              <span
                className="rounded-[var(--radius-pill)] border border-primary/40 bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
                title="搜索激活时按命中相关度排序；清空搜索后恢复下方选择的口径"
              >
                相关性
              </span>
            ) : null}
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onListSortChange(opt.value)}
                disabled={Boolean(searchText.trim())}
                title={opt.title}
                className={cn(
                  "rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px] transition-colors disabled:cursor-default disabled:opacity-40",
                  listSort === opt.value && !searchText.trim()
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}
        {allTags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => onTagFilterChange(tagFilter === t ? "" : t)}
                className={cn(
                  "rounded-[var(--radius-pill)] border px-2 py-0.5 text-[10px] transition-colors",
                  tagFilter === t
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
                title={tagFilter === t ? "取消标签筛选" : `只看带「${t}」标签的会议`}
              >
                {t}
              </button>
            ))}
            {tagFilter ? (
              <button
                onClick={() => onTagFilterChange("")}
                className="flex items-center gap-0.5 rounded-[var(--radius-pill)] px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-2.5 w-2.5" />
                清除
              </button>
            ) : null}
          </div>
        ) : null}
        {creating ? (
          <div className="space-y-2 rounded-[var(--radius-md)] border border-border bg-background p-2.5">
            <Input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate()
                if (e.key === "Escape") setCreating(false)
              }}
              placeholder="会议标题，如：产品周会"
              className="h-8 rounded-[var(--radius-sm)] text-xs"
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="h-7 flex-1 rounded-[var(--radius-sm)] border border-input bg-background px-2 text-xs text-muted-foreground outline-none focus-visible:border-primary"
              />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setCreating(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1 rounded-[var(--radius-sm)] bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90"
                disabled={!draftTitle.trim()}
                onClick={submitCreate}
              >
                <Check className="h-3.5 w-3.5" />
                创建
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full gap-1.5 rounded-[var(--radius-md)] border-dashed border-border text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            新建会议
          </Button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={virtual ? (e) => setVpTop(e.currentTarget.scrollTop) : undefined}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        {meetings.length === 0 ? (
          searchText.trim() || tagFilter ? (
            <div className="px-2 py-8 text-center">
              <p className="text-xs leading-relaxed text-muted-foreground">
                没有匹配的会议
              </p>
              <button
                onClick={() => {
                  onSearchChange("")
                  onTagFilterChange("")
                }}
                className="mt-2 text-xs font-medium text-primary transition-opacity hover:opacity-75"
              >
                清除搜索与筛选
              </button>
            </div>
          ) : (
            <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted-foreground">
              还没有会议记录，点上方「新建会议」开始
            </p>
          )
        ) : (
          <>
            {vTopPad > 0 ? <div style={{ height: vTopPad }} aria-hidden /> : null}
            <ul className="space-y-0.5">
            {meetings.slice(vStart, vEnd).map((m) => {
              const openCount = m.actions.filter((a) => isOpenStatus(a.status)).length
              const active = m.id === selectedId
              return (
                <li key={m.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    data-meeting-row={m.id}
                    onClick={() => onSelect(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onSelect(m.id)
                    }}
                    className={cn(
                      "group relative flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] px-2.5 py-2 transition-colors duration-150",
                      active ? "bg-background shadow-[var(--elev-ring)]" : "hover:bg-background/60",
                    )}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-[13px] leading-5",
                          active ? "font-semibold text-foreground" : "font-medium text-foreground/90",
                          m.archived && "opacity-60",
                        )}
                      >
                        {m.archived ? (
                          <span className="mr-1 rounded-[var(--radius-pill)] bg-muted px-1 py-px align-middle text-[9px] font-normal text-muted-foreground">
                            已归档
                          </span>
                        ) : null}
                        {m.title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="cjk-latin tabular-nums">{m.date}</span>
                        {m.brief ? <span className="text-primary">已生成纪要</span> : null}
                        {openCount > 0 ? (
                          <span className="rounded-[var(--radius-pill)] bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary cjk-latin tabular-nums">
                            {openCount} 待办
                          </span>
                        ) : null}
                        {m.tags.map((t) => (
                          <span
                            key={t}
                            className={cn(
                              "rounded-[var(--radius-pill)] px-1.5 py-px text-[10px]",
                              tagFilter === t
                                ? "bg-primary/10 font-medium text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {t}
                          </span>
                        ))}
                      </p>
                    </div>
                    {confirmDeleteId === m.id ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemove(m.id)
                          setConfirmDeleteId("")
                        }}
                        title="删除会先以随机字节覆写这场会议的本地记录再移除；浏览器不保证物理扇区即时擦除，共享设备请在设置里开启档案加密"
                        className="mt-0.5 shrink-0 rounded-[var(--radius-sm)] bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground"
                      >
                        删除
                      </button>
                    ) : (
                      <span className="mt-0.5 hidden shrink-0 items-center gap-0.5 group-hover:flex">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleArchive(m.id)
                          }}
                          className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label={m.archived ? `取消归档 ${m.title}` : `归档 ${m.title}`}
                          title={
                            m.archived
                              ? "取消归档，恢复到活跃列表"
                              : "归档：从列表收起但数据保留，仍可搜索 / 问答 / 导出"
                          }
                        >
                          {m.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDeleteId(m.id)
                            window.setTimeout(() => setConfirmDeleteId((cur) => (cur === m.id ? "" : cur)), 3000)
                          }}
                          className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`删除 ${m.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
            {vBottomPad > 0 ? <div style={{ height: vBottomPad }} aria-hidden /> : null}
          </>
        )}

        {searchText.trim() ? (
          findResults !== null && findQuery === searchText.trim() ? (
            <div className="mt-2 border-t border-border pt-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="flex items-center gap-1 text-[10px] font-medium text-primary">
                  <Sparkles className="h-3 w-3" />
                  语义相关（AI 补充关键词找不到的）
                </p>
                <button
                  onClick={onClearFind}
                  aria-label="清除语义结果"
                  className="rounded-[var(--radius-sm)] p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              {findResults.filter((r) => !meetings.some((m) => m.id === r.meetingId)).length === 0 ? (
                <p className="px-2 pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  上方关键词结果已覆盖全部语义相关的会议
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {findResults
                    .filter((r) => !meetings.some((m) => m.id === r.meetingId))
                    .map((r) => (
                      <li key={r.meetingId}>
                        <button
                          onClick={() => onSelect(r.meetingId)}
                          className="w-full rounded-[var(--radius-md)] px-2.5 py-1.5 text-left transition-colors hover:bg-background/60"
                        >
                          <p className="flex items-baseline gap-1.5">
                            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/90">
                              {r.title}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground cjk-latin tabular-nums">
                              {r.date}
                            </span>
                          </p>
                          {r.reason ? (
                            <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                              {r.reason}
                            </p>
                          ) : null}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ) : (
            <button
              onClick={onSemanticFind}
              disabled={findBusy}
              className="mt-1.5 flex w-full items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-border px-2.5 py-2 text-left text-[11px] leading-relaxed text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
            >
              <Sparkles className="h-3 w-3 shrink-0" />
              {findBusy
                ? "AI 正在按语义比对每场会议…"
                : `没找到想要的？让 AI 按语义找「${searchText.trim()}」（调用模型，会先请你确认）`}
            </button>
          )
        ) : null}
      </div>

      <div className="shrink-0 space-y-1 border-t border-border px-3.5 py-2">
        {archivedCount > 0 || archiveCandidateCount > 0 ? (
          <button
            onClick={() => onToggleShowArchived(!showArchived)}
            className="block w-full text-left text-[10px] leading-relaxed text-muted-foreground/90 transition-colors hover:text-primary"
          >
            {showArchived
              ? `正在显示归档 · 点此只看活跃会议`
              : `归档区 ${archivedCount} 场${archiveCandidateCount > 0 ? ` · 另有 ${archiveCandidateCount} 场低产出会议可归档（悬停会议点归档图标）` : ""} · 点此查看`}
          </button>
        ) : null}
        <p className="text-[10px] leading-relaxed text-muted-foreground/80 cjk-latin tabular-nums">
          {searchText.trim() || tagFilter
            ? `匹配 ${meetings.length} / ${totalCount} 场会议`
            : `共 ${totalCount} 场会议`}{" "}
          · 数据只存在本机浏览器
        </p>
      </div>
    </aside>
  )
}
