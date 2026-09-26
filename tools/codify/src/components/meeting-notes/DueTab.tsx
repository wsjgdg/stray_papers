import { useMemo, useState } from "react"
import { Bell, CalendarClock, Check, Copy, CornerDownRight, Download, Lightbulb, Loader2, Sparkles, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ACTION_STATUSES, currentTz, dueDayOffset, isOpenStatus, type Meeting, type MeetingAction } from "@/lib/store"
import { buildBlockNotifications, buildIssueDrafts } from "@/lib/workflows"
import type { ActionTheme } from "@/lib/ai"
import type { DueGroup, DueGroupKey, DueItem, WorkloadEntry } from "@/hooks/useMeetingNotes"

interface DueTabProps {
  groups: DueGroup[]
  counts: { overdue: number; today: number; total: number }
  workload: WorkloadEntry[]
  meetings: Meeting[]
  themeReport: { themes: ActionTheme[]; at: number } | null
  themesBusy: boolean
  themesError: string
  onAnalyzeThemes: () => void
  onToggle: (meetingId: string, actionId: string) => void
  onJump: (meetingId: string) => void
  onExportActions: () => void
  onExportIssueDrafts: () => void
  onExportDecisionLog: () => void
}

type DueView = "due" | "people" | "meetings" | "themes" | "flow"

// 相对时间文案：逾期 3 天 / 今天到期 / 剩 2 天
function relLabel(due: string): string {
  const off = dueDayOffset(due)
  if (off === null) return ""
  if (off < 0) return `逾期 ${-off} 天`
  if (off === 0) return "今天到期"
  return `剩 ${off} 天`
}

const GROUP_STYLES: Record<DueGroupKey, { dot: string; label: string; pill: string }> = {
  overdue: {
    dot: "bg-destructive",
    label: "text-destructive",
    pill: "border-destructive/30 bg-destructive/5 text-destructive/85",
  },
  today: {
    dot: "bg-primary",
    label: "text-foreground",
    pill: "border-primary/30 bg-primary/5 text-primary",
  },
  week: {
    dot: "bg-primary/50",
    label: "text-foreground",
    pill: "border-border bg-muted text-muted-foreground",
  },
  later: {
    dot: "bg-border",
    label: "text-muted-foreground",
    pill: "border-border bg-muted text-muted-foreground",
  },
  none: {
    dot: "bg-border",
    label: "text-muted-foreground",
    pill: "border-border bg-muted text-muted-foreground",
  },
}

function DueRow({ item, onToggle, onJump }: { item: DueItem; onToggle: DueTabProps["onToggle"]; onJump: DueTabProps["onJump"] }) {
  const a: MeetingAction = item.action
  const rel = relLabel(a.dueDate)
  const overdue = dueDayOffset(a.dueDate) !== null && (dueDayOffset(a.dueDate) as number) < 0
  const isToday = dueDayOffset(a.dueDate) === 0
  // 「长期未动」维度：提出（或旧数据用会议创建）至今 ≥14 天仍未结束——和刚提出的紧急程度不同
  const ageDays = Math.floor((Date.now() - (a.createdAt ?? item.meeting.createdAt)) / 86_400_000)
  const stalled = ageDays >= 14
  const statusMeta = ACTION_STATUSES.find((s) => s.value === a.status)

  return (
    <li className="rounded-[var(--radius-md)] border border-border bg-background px-3 py-2.5 transition-shadow hover:shadow-[var(--elev-ring)]">
      <div className="flex items-start gap-2.5">
        <button
          onClick={() => onToggle(item.meeting.id, a.id)}
          aria-label="标记完成"
          title="标记完成"
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-input bg-background transition-colors hover:border-primary hover:bg-primary/10"
        />
        <div className="min-w-0 flex-1">
          <p className={cn("text-[13px] font-medium leading-snug text-foreground", a.status === "done" && "line-through")}>
            {a.content}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              onClick={() => onJump(item.meeting.id)}
              className="inline-flex min-w-0 items-center gap-1 text-[11px] text-primary transition-opacity hover:opacity-75"
              title={`跳到《${item.meeting.title}》的行动项`}
            >
              <CornerDownRight className="h-3 w-3 shrink-0" />
              <span className="truncate">《{item.meeting.title}》</span>
            </button>
            {a.assignee ? <span className="text-[11px] text-muted-foreground">负责人 {a.assignee}</span> : null}
            {a.dueDate ? (
              <span className="text-[11px] text-muted-foreground cjk-latin tabular-nums">截止 {a.dueDate}</span>
            ) : null}
            {a.status !== "open" && statusMeta ? (
              <span
                className={cn(
                  "rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px]",
                  statusMeta.pill,
                )}
              >
                {statusMeta.label}
              </span>
            ) : null}
            {stalled ? (
              <span
                className="rounded-[var(--radius-pill)] border border-border bg-muted px-1.5 py-px text-[10px] text-muted-foreground cjk-latin tabular-nums"
                title={`自提出已 ${ageDays} 天没有状态变化，考虑跟进、改派或取消`}
              >
                {ageDays} 天没动
              </span>
            ) : null}
            {rel ? (
              <span
                className={cn(
                  "rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px] cjk-latin tabular-nums",
                  overdue || isToday ? GROUP_STYLES[overdue ? "overdue" : "today"].pill : GROUP_STYLES.week.pill,
                )}
              >
                {rel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  )
}

// 多维度切换器：按时间 / 按人 / 按会议 / 按主题 / 工作流——切换视角不重置筛选条件
const VIEWS: { key: DueView; label: string }[] = [
  { key: "due", label: "按截止日" },
  { key: "people", label: "按人" },
  { key: "meetings", label: "按会议" },
  { key: "themes", label: "流程洞察" },
  { key: "flow", label: "工作流" },
]

function fmtClock(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function DueTab({
  groups,
  counts,
  workload,
  meetings,
  themeReport,
  themesBusy,
  themesError,
  onAnalyzeThemes,
  onToggle,
  onJump,
  onExportActions,
  onExportIssueDrafts,
  onExportDecisionLog,
}: DueTabProps) {
  const [view, setView] = useState<DueView>("due")
  // 「只看未完成」是跨视图的筛选条件：切换视角时保持，不重置上下文
  const [onlyOpen, setOnlyOpen] = useState(true)
  // 工作流视图的物料全部本地实时计算：档案一变草稿即变，不落盘、不漂移、免费
  const issueDrafts = useMemo(() => buildIssueDrafts(meetings), [meetings])
  const notifications = useMemo(() => buildBlockNotifications(meetings), [meetings])
  const decisionCount = useMemo(
    () => meetings.reduce((n, m) => n + m.decisions.filter((d) => d.content.trim()).length, 0),
    [meetings],
  )
  const [copiedId, setCopiedId] = useState("")
  const [copyFailedId, setCopyFailedId] = useState("")

  const copyText = (id: string, text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopiedId(id)
        setCopyFailedId("")
        window.setTimeout(() => setCopiedId((cur) => (cur === id ? "" : cur)), 1500)
      })
      .catch(() => {
        setCopyFailedId(id)
        window.setTimeout(() => setCopyFailedId((cur) => (cur === id ? "" : cur)), 3000)
      })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 py-1 pr-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-[var(--font-display)] text-base font-semibold tracking-tight text-foreground">
              跟进中心
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground cjk-latin tabular-nums">
              全部会议共 {counts.total} 条未完成
              {counts.overdue > 0 ? ` · ${counts.overdue} 条已逾期` : ""}
              {counts.today > 0 ? ` · ${counts.today} 条今天到期` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setOnlyOpen((v) => !v)}
              title="筛选条件在切换视角时保持"
              className={cn(
                "rounded-[var(--radius-pill)] border px-2 py-1 text-[11px] transition-colors",
                onlyOpen
                  ? "border-primary/40 bg-primary/10 font-medium text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              只看未完成
            </button>
            <div className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-border bg-background p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-2 py-1 text-[11px] transition-colors",
                    view === v.key
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onExportActions}
              title="导出跨会议行动项清单（Markdown checkbox 格式，Obsidian 等笔记软件可直接勾选）"
              className="h-8 gap-1.5 rounded-[var(--radius-md)] text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" />
              导出行动项
            </Button>
          </div>
        </div>

        {view === "due" ? (
          counts.total === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-primary/10 text-primary">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">暂时没有待跟进的行动项</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  生成纪要后，所有会议里未完成的行动项会按截止日汇总到这里；带日期的条目会标注逾期与剩余天数
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-[10px] text-muted-foreground/75">
                「逾期 / 今天」按你设备当前时区（{currentTz() || "本机时间"}）计算；≥14 天未结束的条目标注「N 天没动」；异地创建的会议在导出文件中带原始时区标记
              </p>
              {groups.map((g) => {
                const style = GROUP_STYLES[g.key]
                return (
                  <section key={g.key}>
                    <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold tracking-tight">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} />
                      <span className={style.label}>{g.label}</span>
                      <span className="text-xs font-normal text-muted-foreground cjk-latin tabular-nums">{g.items.length} 条</span>
                    </h3>
                    <ul className="space-y-1.5">
                      {g.items.map((item) => (
                        <DueRow key={item.action.id} item={item} onToggle={onToggle} onJump={onJump} />
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          )
        ) : null}

        {view === "people" ? (
          workload.length === 0 ? (
            <p className="py-12 text-center text-xs leading-relaxed text-muted-foreground">
              还没有行动项；生成纪要并给条目填上负责人后，
              <br />
              这里会显示每个人的分配量、完成量、逾期量与卡住时长
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                按负责人聚合全部会议的行动项（「未指定」= 抽取时原文没提到负责人）；逾期多的排前面
              </p>
              {workload.map((w) => (
                <details
                  key={w.name}
                  className="group rounded-[var(--radius-lg)] border border-border bg-background"
                  open={w.overdue > 0}
                >
                  <summary className="flex cursor-pointer select-none flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-2.5">
                    <span className="text-sm font-semibold tracking-tight text-foreground">{w.name}</span>
                    <span className="rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground cjk-latin tabular-nums">
                      未完成 {w.items.length}
                      {w.doing > 0 ? ` · 进行 ${w.doing}` : ""}
                      {w.blocked > 0 ? ` · 阻塞 ${w.blocked}` : ""}
                    </span>
                    <span className="rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground cjk-latin tabular-nums">
                      完成 {w.done} / 共 {w.total}
                    </span>
                    {w.overdue > 0 ? (
                      <span className="rounded-[var(--radius-pill)] border border-destructive/30 bg-destructive/5 px-1.5 py-px text-[10px] font-medium text-destructive cjk-latin tabular-nums">
                        逾期 {w.overdue}
                      </span>
                    ) : null}
                    {w.stalled > 0 ? (
                      <span className="rounded-[var(--radius-pill)] border border-border bg-muted px-1.5 py-px text-[10px] text-muted-foreground cjk-latin tabular-nums" title="提出后 ≥14 天仍未结束">
                        {w.stalled} 条久未动
                      </span>
                    ) : null}
                  </summary>
                  {w.items.length > 0 ? (
                    <ul className="space-y-1.5 border-t border-border px-3.5 py-2.5">
                      {w.items.map((item) => {
                        const rel = relLabel(item.action.dueDate)
                        const off = dueDayOffset(item.action.dueDate)
                        const urgent = off !== null && off <= 0
                        const st = ACTION_STATUSES.find((s) => s.value === item.action.status)
                        const age = Math.floor((Date.now() - (item.action.createdAt ?? item.meeting.createdAt)) / 86_400_000)
                        return (
                          <li key={item.action.id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[12px]">
                            <span className="min-w-0 flex-1 text-foreground/90">{item.action.content}</span>
                            {st && item.action.status !== "open" ? (
                              <span className={cn("rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px]", st.pill)}>
                                {st.label}
                              </span>
                            ) : null}
                            {item.action.dueDate ? (
                              <span className={cn("text-[10px] cjk-latin tabular-nums", urgent ? "text-destructive" : "text-muted-foreground")}>
                                {item.action.dueDate}
                                {rel ? `（${rel}）` : ""}
                              </span>
                            ) : null}
                            {age >= 14 ? (
                              <span className="text-[10px] text-muted-foreground/70 cjk-latin tabular-nums">{age} 天没动</span>
                            ) : null}
                            <button
                              onClick={() => onJump(item.meeting.id)}
                              className="inline-flex items-center gap-0.5 text-[10px] text-primary transition-opacity hover:opacity-75"
                            >
                              <CornerDownRight className="h-2.5 w-2.5" />
                              《{item.meeting.title}》
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="border-t border-border px-3.5 py-2.5 text-[11px] text-muted-foreground">
                      手头没有未完成的事项
                    </p>
                  )}
                </details>
              ))}
            </div>
          )
        ) : null}

        {view === "meetings" ? (
          (() => {
            const rows = [...meetings]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((m) => ({
                m,
                items: m.actions.filter((a) => (onlyOpen ? isOpenStatus(a.status) : a.status !== "cancelled")),
              }))
              .filter((x) => x.items.length > 0)
            if (rows.length === 0) {
              return (
                <p className="py-12 text-center text-xs leading-relaxed text-muted-foreground">
                  {onlyOpen
                    ? "所有会议的行动项都已结束——关掉「只看未完成」可以回顾全部条目"
                    : "还没有任何行动项；生成纪要后这里会按会议聚合展示"}
                </p>
              )
            }
            return (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  每场会议的行动项按抽取顺序排列，最近的会议在前；展开查看明细并直接勾选
                </p>
                {rows.map(({ m, items }) => {
                  const openN = m.actions.filter((a) => isOpenStatus(a.status)).length
                  const hasOverdue = m.actions.some(
                    (a) => isOpenStatus(a.status) && (dueDayOffset(a.dueDate) ?? 1) < 0,
                  )
                  return (
                    <details
                      key={m.id}
                      className="group rounded-[var(--radius-lg)] border border-border bg-background"
                      open={openN > 0}
                    >
                      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-2.5">
                        <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground">
                          {m.title || "未命名会议"}
                        </span>
                        {m.archived ? (
                          <span className="rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                            已归档
                          </span>
                        ) : null}
                        <span className="text-[10px] text-muted-foreground cjk-latin tabular-nums">{m.date}</span>
                        <span
                          className={cn(
                            "rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px] cjk-latin tabular-nums",
                            hasOverdue
                              ? "border-destructive/30 bg-destructive/5 font-medium text-destructive"
                              : "border-border bg-muted text-muted-foreground",
                          )}
                        >
                          {openN > 0 ? `${openN} 项未完成` : "全部结束"}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70 cjk-latin tabular-nums">
                          共 {m.actions.length} 条
                        </span>
                      </summary>
                      <ul className="space-y-1 border-t border-border px-3.5 py-2.5">
                        {items.map((a) => {
                          const off = dueDayOffset(a.dueDate)
                          const done = !isOpenStatus(a.status)
                          const st = ACTION_STATUSES.find((s) => s.value === a.status)
                          return (
                            <li key={a.id} className="flex items-start gap-2.5 py-0.5">
                              <button
                                onClick={() => onToggle(m.id, a.id)}
                                aria-label={done ? "重新打开" : "标记完成"}
                                title={done ? "重新打开" : "标记完成"}
                                className={cn(
                                  "mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition-colors",
                                  done
                                    ? "border-emerald-500/60 bg-emerald-500/15"
                                    : "border-input bg-background hover:border-primary hover:bg-primary/10",
                                )}
                              >
                                {done ? <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" /> : null}
                              </button>
                              <span
                                className={cn(
                                  "min-w-0 flex-1 text-[12px] leading-snug",
                                  done ? "text-muted-foreground line-through" : "text-foreground/90",
                                )}
                              >
                                {a.content}
                              </span>
                              {a.assignee ? (
                                <span className="shrink-0 text-[10px] text-muted-foreground">@{a.assignee}</span>
                              ) : null}
                              {a.dueDate ? (
                                <span
                                  className={cn(
                                    "shrink-0 text-[10px] cjk-latin tabular-nums",
                                    !done && off !== null && off <= 0 ? "font-medium text-destructive" : "text-muted-foreground",
                                  )}
                                >
                                  {a.dueDate}
                                </span>
                              ) : null}
                              {st && a.status !== "open" ? (
                                <span className={cn("shrink-0 rounded-[var(--radius-pill)] border px-1.5 py-px text-[9px]", st.pill)}>
                                  {st.label}
                                </span>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                      <div className="border-t border-border/60 px-3.5 py-1.5">
                        <button
                          onClick={() => onJump(m.id)}
                          className="inline-flex items-center gap-0.5 text-[10px] text-primary transition-opacity hover:opacity-75"
                        >
                          <CornerDownRight className="h-2.5 w-2.5" />
                          打开这场会议的行动项页
                        </button>
                      </div>
                    </details>
                  )
                })}
              </div>
            )
          })()
        ) : null}

        {view === "themes" ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                把全部行动项按语义归类：同一类事跨会议反复出现（「补充文档」「同步给某人」），往往说明流程有漏洞——这件事本该有机制兜住，而不是每次开会都重新指派
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={onAnalyzeThemes}
                disabled={themesBusy}
                className="h-8 shrink-0 gap-1.5 rounded-[var(--radius-md)] text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
              >
                {themesBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {themesBusy ? "分析中…" : themeReport ? "重新分析" : "生成流程洞察"}
              </Button>
            </div>

            {themesError ? (
              <p className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {themesError}
              </p>
            ) : null}

            {themeReport ? (
              themeReport.themes.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  没有发现反复出现的同类行动项——流程挺干净
                </p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {themeReport.themes.map((t) => (
                      <li key={t.name} className="rounded-[var(--radius-lg)] border border-border bg-background p-3.5">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold tracking-tight text-foreground">{t.name}</span>
                          <span className="rounded-[var(--radius-pill)] bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary cjk-latin tabular-nums">
                            {t.count} 次
                          </span>
                          {t.meetings > 1 ? (
                            <span className="rounded-[var(--radius-pill)] border border-destructive/30 bg-destructive/5 px-1.5 py-px text-[10px] text-destructive cjk-latin tabular-nums">
                              跨 {t.meetings} 场会议重复
                            </span>
                          ) : null}
                        </p>
                        <ul className="mt-1.5 space-y-0.5">
                          {t.examples.map((ex, i) => (
                            <li key={i} className="pl-1 text-[11px] leading-relaxed text-muted-foreground">
                              · {ex}
                            </li>
                          ))}
                        </ul>
                        {t.insight ? (
                          <p className="mt-2 rounded-[var(--radius-md)] bg-muted/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-foreground/80">
                            <Lightbulb className="mr-1 inline h-3 w-3 text-primary/70" />
                            {t.insight}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-muted-foreground/70 cjk-latin tabular-nums">
                    生成于 {fmtClock(themeReport.at)}；行动项有增删改后点「重新分析」刷新（调用 AI，会先请你确认）
                  </p>
                </>
              )
            ) : !themesBusy ? (
              <p className="py-8 text-center text-xs leading-relaxed text-muted-foreground">
                点「生成流程洞察」让 AI 把全部行动项聚成高频主题（付费调用，先弹确认）
              </p>
            ) : null}
          </div>
        ) : null}
        {view === "flow" ? (
          <div className="space-y-4">
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <Workflow className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
              会议不是终点，是下游工作的触发器。这里的工作流全部由档案自动供料——本地实时生成、免费、不落盘；
              在线系统（GitHub / Linear / Slack / 飞书）直连受运行环境限制（页面不能直连第三方服务），
              产出的是标准格式草稿，复制 / 下载即达；推送接口已预留，自托管部署注册在线目标后同一批事件自动直推
            </p>

            <section className="rounded-[var(--radius-lg)] border border-border bg-background p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    行动项 → Issue 草稿包
                    <span className="ml-2 text-xs font-normal text-muted-foreground cjk-latin tabular-nums">
                      {issueDrafts.length} 条待建
                    </span>
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    全部未完成行动项自动生成 Issue 草稿：标题即事项，正文自带原文依据（source_quote）、来源会议、
                    负责人、截止与逾期状态——在 GitHub / Linear 建 Issue 时整块粘贴即可，上下文不丢
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExportIssueDrafts}
                  disabled={issueDrafts.length === 0}
                  className="h-8 shrink-0 gap-1.5 rounded-[var(--radius-md)] text-xs text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  导出草稿包
                </Button>
              </div>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-border bg-background p-3.5">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
                <Bell className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                阻塞项 → 通知文案
                <span className="text-xs font-normal text-muted-foreground cjk-latin tabular-nums">
                  {notifications.length} 条阻塞中
                </span>
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                行动项一被标记「阻塞」，这里自动生成给负责人的通知（含卡住天数、截止逾期、来源会议）——复制进
                Slack / 飞书 / 微信即发；webhook 自动直推已在接口层预留
              </p>
              {notifications.length === 0 ? (
                <p className="mt-2.5 py-3 text-center text-[11px] text-muted-foreground/80">
                  当前没有阻塞中的行动项
                </p>
              ) : (
                <ul className="mt-2.5 space-y-1.5">
                  {notifications.map((n) => (
                    <li key={n.actionId} className="rounded-[var(--radius-md)] border border-border bg-card/50 px-3 py-2">
                      <p className="text-[11px] leading-relaxed text-foreground/85">{n.text}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          onClick={() => copyText(n.actionId, n.text)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 text-[10px] transition-colors",
                            copiedId === n.actionId
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
                          )}
                        >
                          {copiedId === n.actionId ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                          {copiedId === n.actionId ? "已复制" : "复制通知"}
                        </button>
                        <button
                          onClick={() => onJump(n.meetingId)}
                          className="inline-flex items-center gap-0.5 text-[10px] text-primary transition-opacity hover:opacity-75"
                        >
                          <CornerDownRight className="h-2.5 w-2.5" />
                          《{n.meetingTitle}》
                        </button>
                        {copyFailedId === n.actionId ? (
                          <span className="text-[10px] text-destructive/85">
                            自动复制失败，请手动选中上方文字复制
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-[var(--radius-lg)] border border-border bg-background p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    决议 → 决策日志
                    <span className="ml-2 text-xs font-normal text-muted-foreground cjk-latin tabular-nums">
                      {decisionCount} 条决议
                    </span>
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    全库决议自动汇编成按时间倒序的决策日志：每条带来源会议、原文依据，被取代的保留原文并标注新决议去向。
                    导出 Markdown 合集时也会自动携带这份日志（decision-log.md），项目文档系统直接消费
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExportDecisionLog}
                  disabled={decisionCount === 0}
                  className="h-8 shrink-0 gap-1.5 rounded-[var(--radius-md)] text-xs text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  导出决策日志
                </Button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}
