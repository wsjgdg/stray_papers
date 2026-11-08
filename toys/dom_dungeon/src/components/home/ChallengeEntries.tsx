import { BookOpen, CalendarDays, Gauge, Volume2, VolumeX, Zap } from "lucide-react"

import type { DungeonSettings } from "@/lib/dungeonSave"

type ChallengeEntriesProps = {
  dailyShortCode: string
  dailyCleared: boolean
  unlockedCount: number
  totalCount: number
  settings: DungeonSettings
  /** Boss Rush 入口：祭坛币余额 + 个人最深波数 */
  rushCoins: number
  rushBestWave: number
  onStartDaily: () => void
  onOpenBossRush: () => void
  onOpenCodex: () => void
  onOpenSettings: () => void
}

export function ChallengeEntries({
  dailyShortCode,
  dailyCleared,
  unlockedCount,
  totalCount,
  settings,
  rushCoins,
  rushBestWave,
  onStartDaily,
  onOpenBossRush,
  onOpenCodex,
  onOpenSettings,
}: ChallengeEntriesProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="mb-3 font-display text-xl font-bold">今天还能做点别的</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="flex h-full flex-col rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md">
          <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            今日挑战
          </p>
          <p className="mt-2 font-display text-xl font-bold">
            种子 {dailyShortCode}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {dailyCleared
              ? "今天已经通关，明天换新种子"
              : "每天固定一套地牢，通关能拿额外碎片"}
          </p>
          <button
            type="button"
            onClick={onStartDaily}
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-md border border-primary/50 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:shadow-focus"
          >
            {dailyCleared ? "再打一次今日种子" : "进入今日挑战"}
          </button>
        </article>

        <article className="flex h-full flex-col rounded-lg border border-primary/40 bg-card p-4 text-card-foreground shadow-md">
          <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-primary" />
            Boss Rush
          </p>
          <p className="mt-2 font-display text-xl font-bold">
            ⚡ Boss Rush
            <span className="ml-2 rounded-md border border-primary/50 bg-primary/10 px-2 py-0.5 text-sm font-bold text-primary tabular-nums">
              祭坛币 {rushCoins}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {rushBestWave > 0
              ? `个人纪录 ${rushBestWave} 波。无尽连战攒祭坛币，换祭坛永久升级`
              : "无尽连战单挑 Boss，攒祭坛币换永久升级；不计入今日挑战"}
          </p>
          <button
            type="button"
            onClick={onOpenBossRush}
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:shadow-focus"
          >
            进入 Boss Rush
          </button>
        </article>

        <article className="flex h-full flex-col rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md">
          <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" />
            图鉴
          </p>
          <p className="mt-2 font-display text-xl font-bold">
            已解锁 {unlockedCount} / {totalCount}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            角色、词条、敌人档案都收在这里，碎片也在图鉴里花。
          </p>
          <button
            type="button"
            onClick={onOpenCodex}
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            打开图鉴
          </button>
        </article>

        <article className="flex h-full flex-col rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md">
          <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" />
            设置
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 font-display text-xl font-bold">
            <span className="inline-flex items-center gap-1">
              {settings.sound ? (
                <Volume2 className="h-4 w-4 text-primary" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
              音效 {settings.sound ? "开" : "关"}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            低配模式 {settings.lowSpec ? "已打开" : "已关闭"}，老设备上会更省电。
          </p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            调整设置
          </button>
        </article>
      </div>
    </section>
  )
}
