import { Crosshair } from "lucide-react"

import { cn } from "@/lib/utils"

type AutoAttackBadgeProps = {
  /** 刚刚出手过：图标亮一下 */
  autoAttacking: boolean
  /** 距离下一次自动攻击还有多久 */
  nextAttackInMs: number
  /** 当前锁定目标的名字（没有目标就是 null） */
  targetName: string | null
  /** 低配模式：不做脉冲动画 */
  lowSpec: boolean
  paused: boolean
}

export function AutoAttackBadge({
  autoAttacking,
  nextAttackInMs,
  targetName,
  lowSpec,
  paused,
}: AutoAttackBadgeProps) {
  return (
    <div
      aria-label="自动攻击指示"
      className="pointer-events-none fixed bottom-20 right-3 z-30 flex flex-col items-end gap-1 sm:bottom-24 sm:right-4"
    >
      <span
        className={cn(
          "grid h-11 w-11 place-items-center rounded-full border shadow-md",
          paused
            ? "border-border bg-card text-muted-foreground"
            : autoAttacking
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground",
          !lowSpec && !paused && autoAttacking && "animate-pulse",
        )}
      >
        <Crosshair className="h-5 w-5" />
      </span>
      <span className="rounded-sm border border-border bg-card px-1.5 py-0.5 font-mono text-xs text-muted-foreground shadow-md">
        {paused
          ? "已暂停"
          : targetName
            ? `自动攻击 · ${(Math.max(0, nextAttackInMs) / 1000).toFixed(1)}s`
            : "没有目标"}
      </span>
      {targetName ? (
        <span className="max-w-40 truncate rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary shadow-md">
          已锁定：{targetName}
        </span>
      ) : null}
    </div>
  )
}
