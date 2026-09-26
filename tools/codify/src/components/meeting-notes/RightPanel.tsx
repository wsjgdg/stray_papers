// 右栏 · 上下文面板：辅助信息容器，不承载核心内容。
// 内容随中栏状态动态变化——
//   阅读摘要时：本场标签 / 系列 / 关联会议 / 最近动态
//   核对原文时：说话人列表 / 议题锚点 / 清洗统计
//   行动项相关页：按人 / 按时间 / 按主题的分组统计
// 可折叠（父级控制），让用户阅读长文时把屏幕完全留给内容。

import { useMemo } from "react"
import {
  CalendarClock,
  Link2,
  ListTodo,
  PanelRightClose,
  Sparkles,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  isOpenStatus,
  parseTranscriptLines,
  seriesKeyOf,
  type ActivityEvent,
  type Meeting,
} from "@/lib/store"
import type { TabKey, RelatedMeetingHint, WorkloadEntry } from "@/hooks/useMeetingNotes"

interface RightPanelProps {
  meeting: Meeting | null
  activeTab: TabKey
  relatedMeetings: RelatedMeetingHint[]
  workload: WorkloadEntry[]
  activity: ActivityEvent[]
  dueCounts: { overdue: number; today: number; total: number }
  meetingCount: number
  allTags: string[]
  onJumpMeeting: (id: string) => void
  onCollapse: () => void
}

const LOW_CONFIDENCE = 0.75

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon?: typeof Users
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-border/60 px-3.5 py-3 last:border-b-0">
      <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function fmtAgo(at: number): string {
  const diff = Date.now() - at
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "刚刚"
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(at).toLocaleDateString("zh-CN")
}

function ActivitySection({ activity }: { activity: ActivityEvent[] }) {
  return (
    <Section title="最近动态" icon={Sparkles}>
      {activity.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">暂无操作记录</p>
      ) : (
        <ul className="space-y-1.5">
          {activity.slice(0, 5).map((e) => (
            <li key={e.id} className="text-[11px] leading-snug">
              <p className="text-foreground/85">
                <span className="font-medium">{e.kind}</span>
                {e.meetingTitle ? ` · ${e.meetingTitle}` : ""}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground cjk-latin">{fmtAgo(e.at)}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function RightPanel({
  meeting,
  activeTab,
  relatedMeetings,
  workload,
  activity,
  dueCounts,
  meetingCount,
  allTags,
  onJumpMeeting,
  onCollapse,
}: RightPanelProps) {
  // 说话人列表：从当前生效文本（清洗稿优先）实时统计，零成本
  const speakers = useMemo(() => {
    if (!meeting) return []
    const text = meeting.cleaned || meeting.transcript
    if (!text.trim()) return []
    const counts = new Map<string, number>()
    for (const l of parseTranscriptLines(text)) {
      const name = l.speaker.trim()
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [meeting])

  const transcriptScope = activeTab === "transcript"
  const actionScope = activeTab === "actions" || activeTab === "decisions" || activeTab === "due"
  // 时间线 / 图谱 / 问答是跨会议的全局视图：右栏不再显示单场会议上下文，改为档案级信息
  const globalScope = activeTab === "timeline" || activeTab === "graph" || activeTab === "qa"

  const openActions = meeting ? meeting.actions.filter((a) => isOpenStatus(a.status)).length : 0
  const lowConf = meeting
    ? meeting.actions.filter(
        (a) => typeof a.confidence === "number" && a.confidence < LOW_CONFIDENCE && !a.editedByUser && isOpenStatus(a.status),
      ).length
    : 0

  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-l border-border bg-card max-lg:hidden">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 px-3.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          上下文
        </span>
        <button
          onClick={onCollapse}
          aria-label="收起右侧面板"
          title="收起右侧面板（阅读长文时把屏幕留给内容）"
          className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {meeting && !globalScope ? (
          <>
            <Section title="本场会议">
              <dl className="space-y-1.5 text-[11px]">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">日期</dt>
                  <dd className="text-foreground cjk-latin tabular-nums">{meeting.date}</dd>
                </div>
                {seriesKeyOf(meeting) ? (
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">系列</dt>
                    <dd className="truncate text-foreground">{seriesKeyOf(meeting)}</dd>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">未完成行动项</dt>
                  <dd className="text-foreground cjk-latin tabular-nums">{openActions}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">决议</dt>
                  <dd className="text-foreground cjk-latin tabular-nums">{meeting.decisions.length}</dd>
                </div>
                {lowConf > 0 ? (
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">待核对</dt>
                    <dd className="font-medium text-amber-600 cjk-latin tabular-nums dark:text-amber-500">
                      {lowConf} 条低置信
                    </dd>
                  </div>
                ) : null}
              </dl>
              {meeting.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {meeting.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </Section>

            {transcriptScope && speakers.length > 0 ? (
              <Section title={`说话人 · ${speakers.length}`} icon={Users}>
                <ul className="space-y-1">
                  {speakers.map(([name, n]) => (
                    <li key={name} className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="min-w-0 truncate text-foreground/90">{name}</span>
                      <span className="shrink-0 text-muted-foreground cjk-latin tabular-nums">{n} 行</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {transcriptScope && (meeting.outline?.topics.length ?? 0) > 0 ? (
              <Section title="议题锚点" icon={ListTodo}>
                <ol className="space-y-1">
                  {(meeting.outline?.topics ?? []).map((t, i) => (
                    <li key={i} className="flex items-baseline gap-1.5 text-[11px] leading-snug">
                      <span className="shrink-0 text-muted-foreground cjk-latin tabular-nums">{i + 1}.</span>
                      <span className="min-w-0 text-foreground/85">{t.topic}</span>
                    </li>
                  ))}
                </ol>
                {meeting.cleanReport ? (
                  <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground cjk-latin tabular-nums">
                    清洗：改写 {meeting.cleanReport.changedLines} 行 · 时间戳 {meeting.cleanReport.timestamps} · 说话人标记 {meeting.cleanReport.speakers}
                  </p>
                ) : null}
              </Section>
            ) : null}

            {!transcriptScope && relatedMeetings.length > 0 ? (
              <Section title="可能相关的会议" icon={Link2}>
                <ul className="space-y-1.5">
                  {relatedMeetings.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => onJumpMeeting(r.id)}
                        className="w-full rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-muted"
                      >
                        <span className="block truncate text-[11px] font-medium text-foreground/90">
                          {r.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {r.reasons[0] ?? r.date}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {actionScope ? (
              <Section title="按人分布（全部会议）" icon={Users}>
                {workload.length === 0 ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    还没有带负责人的行动项
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {workload.slice(0, 6).map((w) => (
                      <li key={w.name} className="text-[11px]">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-foreground/90">{w.name}</span>
                          <span className="shrink-0 text-muted-foreground cjk-latin tabular-nums">
                            未完成 {w.items.length} / 共 {w.total}
                          </span>
                        </div>
                        <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className="bg-emerald-500/80"
                            style={{ width: `${w.total ? (w.done / w.total) * 100 : 0}%` }}
                          />
                          {w.overdue > 0 ? (
                            <span
                              className="bg-destructive/80"
                              style={{ width: `${w.total ? (w.overdue / w.total) * 100 : 0}%` }}
                            />
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {dueCounts.total > 0 ? (
                  <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-muted-foreground cjk-latin tabular-nums">
                    <CalendarClock className="h-3 w-3 shrink-0" />
                    未完成 {dueCounts.total}
                    {dueCounts.overdue > 0 ? (
                      <span className="font-medium text-destructive"> · 逾期 {dueCounts.overdue}</span>
                    ) : null}
                    {dueCounts.today > 0 ? (
                      <span className="font-medium text-amber-600 dark:text-amber-500"> · 今天 {dueCounts.today}</span>
                    ) : null}
                  </p>
                ) : null}
              </Section>
            ) : null}

            <ActivitySection activity={activity} />
          </>
        ) : (
          <>
            <Section title="档案概览">
              <dl className="space-y-1.5 text-[11px]">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">会议总数</dt>
                  <dd className="text-foreground cjk-latin tabular-nums">{meetingCount}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">标签</dt>
                  <dd className="text-foreground cjk-latin tabular-nums">{allTags.length}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">未完成行动项</dt>
                  <dd className={cn("cjk-latin tabular-nums", dueCounts.overdue > 0 ? "font-medium text-destructive" : "text-foreground")}>
                    {dueCounts.total}
                    {dueCounts.overdue > 0 ? `（逾期 ${dueCounts.overdue}）` : ""}
                  </dd>
                </div>
                {workload.length > 0 ? (
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">负责人</dt>
                    <dd className="text-foreground cjk-latin tabular-nums">{workload.length} 人</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground">
                {globalScope
                  ? "时间线 / 图谱 / 问答是跨会议的全局视图，这里显示档案级信息；回到某场会议的页签可查看它的上下文"
                  : "选中一场会议后，这里会显示它的上下文：关联会议、说话人、行动项分布"}
              </p>
            </Section>
            {globalScope && workload.length > 0 ? (
              <Section title="按人分布" icon={Users}>
                <ul className="space-y-1.5">
                  {workload.slice(0, 6).map((w) => (
                    <li key={w.name} className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="min-w-0 truncate text-foreground/90">{w.name}</span>
                      <span className="shrink-0 text-muted-foreground cjk-latin tabular-nums">
                        未完成 {w.items.length} / 共 {w.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            <ActivitySection activity={activity} />
          </>
        )}
      </div>
    </aside>
  )
}
