import { memo, useEffect, useState } from "react"
import { Ghost } from "lucide-react"

import type { DailyGhost } from "@/lib/dailyScore"
import { cn } from "@/lib/utils"

type GhostTrackProps = {
  /** 拉不到幽灵时传 null：整个组件什么都不渲染 */
  ghost: DailyGhost | null
  /** 自己当前层数 */
  floor: number
  floorTotal: number
  /** 本局是否已经反超过幽灵（每局只提示一次） */
  beaten: boolean
  /** 低配模式：不做浮字动效 */
  lowSpec?: boolean
}

/** 反超浮字停留时长，到点淡出 */
const BEAT_VISIBLE_MS = 2200

/**
 * 幽灵对照条（只在每日挑战里出现）。
 * 纯显示：不参与伤害 / 血量 / 掉落 / 结算的任何计算，也不吃点击。
 * perf-experience-pack.md C：props 全为原始值 / 稳定引用（ghost 只在拉取时换引用），
 * memo 掉掉战斗 10Hz tick 的无谓重渲染。
 */
export const GhostTrack = memo(function GhostTrack({
  ghost,
  floor,
  floorTotal,
  beaten,
  lowSpec = false,
}: GhostTrackProps) {
  const [beatVisible, setBeatVisible] = useState(false)

  useEffect(() => {
    if (!beaten) return
    setBeatVisible(true)
    if (typeof window === "undefined") return
    const timer = window.setTimeout(() => setBeatVisible(false), BEAT_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [beaten])

  if (!ghost) return null

  const path = ghost.path.slice(0, floorTotal)
  const ghostFloor = Math.min(floorTotal, Math.max(0, ghost.floor))
  /* 幽灵走到哪、自己走到哪，取小的那个 */
  const shownFloor = Math.max(1, Math.min(floor, ghostFloor))
  const hpIndex = Math.min(shownFloor, path.length) - 1
  const shownHp = hpIndex >= 0 ? path[hpIndex] : 0
  /* 只填到自己当前层数为止，幽灵没走到的层不填 */
  const filledUpTo = Math.min(floor, ghostFloor, path.length)

  return (
    <div className="pointer-events-none relative mt-2 rounded-sm border border-primary/20 bg-primary/5 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Ghost className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
        <span className="truncate font-mono text-xs text-muted-foreground">
          幽灵 · 第 {shownFloor} 层 · 剩{" "}
          <span className="font-bold text-primary/80">{shownHp}%</span> 血
        </span>
        <span className="ml-auto hidden shrink-0 truncate font-mono text-xs text-muted-foreground/80 sm:inline">
          {ghost.playerName}
        </span>
      </div>

      <ol className="mt-1 flex items-center gap-1" aria-hidden>
        {Array.from({ length: floorTotal }, (_, i) => {
          const reached = i + 1 <= filledUpTo
          const hp = path[i]
          return (
            <li
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                !lowSpec && "transition",
                reached
                  ? cn("bg-primary/50", hp !== undefined && hp <= 30 && "opacity-40")
                  : "bg-foreground/10",
              )}
            />
          )
        })}
      </ol>

      {beatVisible ? (
        <p
          className={cn(
            "absolute -top-3 right-2 font-mono text-xs font-bold text-primary",
            !lowSpec && "animate-in fade-in slide-in-from-bottom-4 duration-500",
          )}
        >
          超过幽灵
        </p>
      ) : null}
    </div>
  )
})
