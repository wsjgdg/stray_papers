import { CalendarClock } from "lucide-react"
import type { PreMeetingBriefing } from "@/lib/workflows"

interface PreMeetingBriefProps {
  briefing: PreMeetingBriefing
  onJumpMeeting: (id: string) => void
}

// 会前简报（工作流③）：新会议转写还是空的时候，自动从档案拉取同系列历史——
// 上次会议的遗留行动项、最近决议、当前阻塞在开会前就摆在眼前。
// 纯本地实时计算：免费、不落盘、档案一变简报即变（永不漂移）。
export function PreMeetingBrief({ briefing, onJumpMeeting }: PreMeetingBriefProps) {
  if (briefing.empty) {
    return (
      <div className="shrink-0 rounded-[var(--radius-md)] border border-border bg-card/60 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          会前简报 · 自动从档案拉取（免费）
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {briefing.seriesLabel
            ? `档案里还没有「${briefing.seriesLabel}」系列的历史会议——这是第一场。生成纪要后，下一场同系列会议的会前简报会自动带上这场的遗留事项`
            : "给会议打上标签后，这里会在开会前自动汇总同系列历史会议的遗留行动项、最近决议与阻塞项——档案越厚，简报越有料"}
        </p>
      </div>
    )
  }
  return (
    <details open className="shrink-0 rounded-[var(--radius-md)] border border-border bg-card/60 px-3 py-2.5">
      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-1.5 text-xs font-medium text-foreground">
        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary/70" />
        会前简报
        {briefing.seriesLabel ? ` · 系列「${briefing.seriesLabel}」` : ""}
        <span className="font-normal text-muted-foreground">自动从档案拉取（免费）</span>
      </summary>
      <div className="mt-2 space-y-2.5 border-t border-border pt-2">
        {briefing.blocked.length > 0 ? (
          <div>
            <p className="text-[11px] font-medium text-destructive">
              当前阻塞（{briefing.blocked.length}）——开会前先过这些
            </p>
            <ul className="mt-1 space-y-0.5">
              {briefing.blocked.slice(0, 5).map((b, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-muted-foreground">
                  · {b.content}
                  {b.assignee ? `（${b.assignee}）` : ""}
                  {b.fromTitle ? ` — 《${b.fromTitle}》` : ""}
                  {b.stalledDays >= 14 ? ` · ${b.stalledDays} 天没动` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {briefing.meetings.map((m) => (
          <div key={m.id}>
            <p className="flex flex-wrap items-baseline gap-1.5 text-[11px]">
              <button
                onClick={() => onJumpMeeting(m.id)}
                className="font-medium text-primary transition-opacity hover:opacity-75"
                title="打开这场会议"
              >
                《{m.title}》
              </button>
              <span className="text-muted-foreground cjk-latin tabular-nums">{m.date}</span>
            </p>
            {m.brief ? (
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{m.brief}</p>
            ) : null}
            {m.openActions.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {m.openActions.slice(0, 6).map((a, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-muted-foreground">
                    · {a.content}
                    {a.assignee ? `（${a.assignee}）` : ""}
                    {a.dueDate ? (
                      <span className={a.overdue ? "text-destructive" : ""}>
                        {" "}
                        · {a.dueDate}
                        {a.overdue ? " 已逾期" : ""}
                      </span>
                    ) : null}
                    {a.status !== "提出" ? ` · ${a.status}` : ""}
                    {a.stalledDays >= 14 ? " · 久未动" : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {m.decisions.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {m.decisions.map((d, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-muted-foreground/80">
                    ◆ 决议：{d}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        <p className="text-[10px] leading-relaxed text-muted-foreground/70">
          遗留事项自动来自同标签 / 同系列的历史会议；生成摘要时这些上下文也会自动注入提示词，无需重复交代背景
        </p>
      </div>
    </details>
  )
}
