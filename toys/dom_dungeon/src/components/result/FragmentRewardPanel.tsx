import { Check, Lock, Sparkles, Unlock } from "lucide-react"

import { cn } from "@/lib/utils"

type FragmentRewardPanelProps = {
  earnedFragments: number
  fragments: number
  animatedTotal: number
  progressRatio: number
  unlockCost: number
  rangerName: string
  rangerUnlocked: boolean
  fragmentsNeeded: number
  canUnlock: boolean
  onUnlock: () => void
}

export function FragmentRewardPanel({
  earnedFragments,
  fragments,
  animatedTotal,
  progressRatio,
  unlockCost,
  rangerName,
  rangerUnlocked,
  fragmentsNeeded,
  canUnlock,
  onUnlock,
}: FragmentRewardPanelProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-muted-foreground">本局赚到</p>
          <p className="font-mono text-4xl font-bold text-primary sm:text-5xl">
            +{earnedFragments}
          </p>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          碎片总数 <span className="text-foreground">{fragments}</span>
        </p>
      </div>

      <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        碎片已存进本地存档，够数就能解锁新角色
      </p>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 font-mono text-xs">
          <span className="text-muted-foreground">
            解锁 {rangerName} · {animatedTotal} / {unlockCost}
          </span>
          <span className={cn(rangerUnlocked ? "text-primary" : "text-muted-foreground")}>
            {rangerUnlocked ? "已解锁" : `还差 ${fragmentsNeeded}`}
          </span>
        </div>
        <div
          aria-hidden
          className="mt-2 h-2.5 w-full overflow-hidden rounded-full border border-border bg-background/60"
        >
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${Math.round(progressRatio * 100)}%` }}
          />
        </div>
      </div>

      {rangerUnlocked ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-primary/50 bg-primary/10 px-3 py-2 font-mono text-xs text-primary">
          <Check className="h-3.5 w-3.5" />
          {rangerName}已解锁，回首页就能选他上场
        </p>
      ) : canUnlock ? (
        <button
          type="button"
          onClick={onUnlock}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition hover:scale-105 hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
        >
          <Unlock className="h-4 w-4" />
          解锁 {rangerName}（花 {unlockCost} 碎片）
        </button>
      ) : (
        <p className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 font-mono text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          再攒 {fragmentsNeeded} 个碎片就能解锁 {rangerName}
        </p>
      )}

      <p className="mt-3 font-mono text-xs text-muted-foreground">
        本局碎片 = 局内击杀掉落 + 通关奖励，已 1:1 存进余额；滚动中的数字只是展示。
      </p>
    </section>
  )
}
