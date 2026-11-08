import { ArrowLeft, CalendarClock } from "lucide-react"

type DailyFooterProps = {
  onGoHome: () => void
}

export function DailyFooter({ onGoHome }: DailyFooterProps) {
  return (
    <footer className="mt-10 border-t border-border bg-card/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          每日挑战只比当天，明天换新种子，榜单也从零开始。
        </p>
        <button
          type="button"
          onClick={onGoHome}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus sm:ml-auto"
        >
          <ArrowLeft className="h-4 w-4" />
          回首页
        </button>
      </div>
    </footer>
  )
}
