type DailyHeroProps = {
  dateLabel: string
  shortCode: string
}

export function DailyHero({ dateLabel, shortCode }: DailyHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-md sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="relative">
        <p className="inline-flex items-center gap-2 rounded-sm border border-dashed border-primary/50 px-2 py-1 font-mono text-xs text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {dateLabel} · 今日固定种子
        </p>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          今天所有人打的是<span className="text-primary">同一局</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          每日挑战每天换一套固定的地牢：种子 <span className="font-mono">{shortCode}</span>{" "}
          不可更换，8 层打完或倒下都算一局，成绩会进今日排行榜。
        </p>
      </div>
    </section>
  )
}
