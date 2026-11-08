import { CalendarCheck, Target } from "lucide-react"

type TodayStatsPanelProps = {
  /** 今天是否已经下过地牢（按日期键判断，换天自动重置） */
  playedToday: boolean
  /** 今天到达的最深层数 */
  todayBestFloor: number
  /** 本机累计打完的局数 */
  total: number
  /** 本机累计通关的局数 */
  cleared: number
  /** 通关率百分比；一局都没打完时为 null */
  clearRate: number | null
}

export function TodayStatsPanel({
  playedToday,
  todayBestFloor,
  total,
  cleared,
  clearRate,
}: TodayStatsPanelProps) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md sm:grid-cols-2">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
          <CalendarCheck className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-mono text-xs text-muted-foreground">
            今日最佳
          </span>
          <span className="block truncate text-sm font-semibold">
            {playedToday ? `第 ${todayBestFloor} 层` : "今天还没下过地牢"}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
          <Target className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-xs text-muted-foreground">
            通关率
          </span>
          <span className="block truncate text-sm font-semibold">
            {clearRate === null
              ? "还没打完一局"
              : `${clearRate}% · ${cleared}/${total} 局通关`}
          </span>
        </span>
        {clearRate !== null && (
          <span className="hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-foreground/10 sm:block">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${clearRate}%` }}
            />
          </span>
        )}
      </div>
    </div>
  )
}
