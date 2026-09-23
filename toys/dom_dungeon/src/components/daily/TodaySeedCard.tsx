import { CalendarDays, Check, Copy, Dices, Heart, Play, Timer, Swords } from "lucide-react"

type TodaySeedCardProps = {
  dateLabel: string
  dailySeed: string
  dailyShortCode: string
  copied: boolean
  /** 今日轮换角色（产品话术，如「标签刺客」/「随机角色 · 缓存法师」/「自选角色」） */
  characterLabel: string
  /** 今日诅咒（产品话术，如「诅咒 · 内存泄漏」/「今日无诅咒」） */
  curseLabel: string
  relicPoolSize: number
  routePoolSize: number
  enemyPoolSize: number
  /** 剩余次数（含重试） */
  attemptsLeft: number
  attemptsTotal: number
  /** 正式那次已用完、还剩重试机会 */
  canRetry: boolean
  /** 两次都用完 */
  dailyDone: boolean
  /** 距 0 点倒计时 HH:MM:SS */
  countdownLabel: string
  onCopySeed: () => void
  onStartRun: () => void
}

export function TodaySeedCard({
  dateLabel,
  dailySeed,
  dailyShortCode,
  copied,
  characterLabel,
  curseLabel,
  relicPoolSize,
  routePoolSize,
  enemyPoolSize,
  attemptsLeft,
  attemptsTotal,
  canRetry,
  dailyDone,
  countdownLabel,
  onCopySeed,
  onStartRun,
}: TodaySeedCardProps) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-md">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary"
        >
          <CalendarDays className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold">今日挑战</h2>
          <p className="font-mono text-xs text-muted-foreground">{dateLabel}</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-xs tabular-nums text-muted-foreground">
          <Timer className="h-3.5 w-3.5" aria-hidden />
          {countdownLabel} 后刷新
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-border bg-secondary/40 p-4">
        <p className="font-mono text-xs text-muted-foreground">今日种子码</p>
        <p className="mt-1 break-all font-mono text-2xl font-bold tracking-tight text-primary">
          {dailySeed}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          简称 {dailyShortCode} · 全服统一，每日 0 点刷新
        </p>
      </div>

      {/* 开局前规则预览：今天玩什么角色、带什么诅咒、从哪些池子里抽 */}
      <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
        <p className="font-mono text-xs text-muted-foreground">今日规则</p>
        <ul className="mt-2 flex flex-col gap-1.5 font-mono text-xs">
          <li className="flex items-center gap-2">
            <Dices className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span>角色：{characterLabel}</span>
          </li>
          <li className="flex items-center gap-2">
            <Heart className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
            <span>{curseLabel}</span>
          </li>
          <li className="flex items-center gap-2">
            <Swords className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span>
              今日池子：词条 {relicPoolSize} 选 · 路线 {routePoolSize} 选 · 敌人 {enemyPoolSize} 档
            </span>
          </li>
        </ul>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {dailyDone
          ? "今天两次机会都用掉了；明天 0 点换新种子，全服重新开打。"
          : canRetry
            ? `正式那次已打完，还剩 1 次重试——只有打出更好成绩才会覆盖榜上记录。剩 ${attemptsLeft}/${attemptsTotal} 次。`
            : `全服同种子，所有人打的是同一局；每天 ${attemptsTotal} 次机会（正式 1 + 重试 1），只取最好一次上榜。`}
      </p>

      <div className="mt-auto flex flex-col gap-2 pt-4 sm:flex-row">
        <button
          type="button"
          onClick={onStartRun}
          disabled={dailyDone}
          className={
            dailyDone
              ? "inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-md border border-border bg-foreground/5 px-4 py-2.5 text-sm font-semibold text-muted-foreground"
              : "inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
          }
        >
          {!dailyDone ? <Play className="h-4 w-4" /> : null}
          {dailyDone
            ? "今日挑战已完成，明天 0 点刷新"
            : canRetry
              ? "再试一次（更好成绩才覆盖）"
              : "开始今日挑战"}
        </button>
        <button
          type="button"
          onClick={onCopySeed}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
    </section>
  )
}
