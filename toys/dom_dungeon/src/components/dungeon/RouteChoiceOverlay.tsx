import { Compass } from "lucide-react"

import {
  ROUTE_TYPES,
  type RouteEntry,
  type RouteId,
  type RouteRisk,
} from "@/lib/dungeonData"
import { routeCompText, routeRiskOf } from "@/lib/seedGen"
import { cn } from "@/lib/utils"

type RouteChoiceOverlayProps = {
  /** 选完要进入的层数 */
  nextFloor: number
  choices: RouteEntry[]
  /** 低配模式：浮层不做多余动效 */
  lowSpec?: boolean
  onPick: (routeId: RouteId) => void
}

const RISK_LABEL: Record<RouteRisk, string> = {
  low: "低风险",
  mid: "中风险",
  high: "高风险",
}

/* low=常规描边 / mid=网络黄 / high=警报红（dungeon-route.md 三） */
const RISK_STYLE: Record<RouteRisk, string> = {
  low: "border-border text-muted-foreground",
  mid: "border-sys-network/60 bg-sys-network/10 text-sys-network",
  high: "border-destructive/60 bg-destructive/10 text-destructive",
}

export function RouteChoiceOverlay({
  nextFloor,
  choices,
  lowSpec = false,
  onPick,
}: RouteChoiceOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="路线选择"
        className={cn(
          "max-h-full w-full max-w-3xl animate-in overflow-y-auto rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg sm:p-5",
          !lowSpec && "fade-in slide-in-from-bottom-4 duration-300",
        )}
      >
        <div className="text-center">
          <p className="flex items-center justify-center gap-1.5 font-mono text-xs text-primary">
            <Compass className="h-3.5 w-3.5" />
            路口 · 前往第 {nextFloor} 层
          </p>
          <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
            选一条路走
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            不同的路决定你遇到什么敌人、拿到什么奖励。
          </p>
        </div>

        <ul
          className={cn(
            "mt-4 grid gap-3",
            choices.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
          )}
        >
          {choices.map((entry) => {
            const type = ROUTE_TYPES[entry.routeId]
            const risk = routeRiskOf(entry, type)
            const compText = routeCompText(entry)
            return (
              <li key={entry.routeId} className="flex h-full flex-col">
                <button
                  type="button"
                  onClick={() => onPick(entry.routeId)}
                  className={cn(
                    "flex h-full flex-col items-start rounded-md border border-border bg-background/40 p-3.5 text-left shadow-md transition hover:-translate-y-0.5 hover:border-primary/70 hover:shadow-lg focus-visible:outline-none focus-visible:shadow-focus",
                    !lowSpec &&
                      "animate-in fade-in slide-in-from-bottom-2 duration-300",
                  )}
                >
                  <span
                    aria-hidden
                    className="text-3xl leading-none"
                  >
                    {type.icon}
                  </span>
                  <span className="mt-2 font-display text-base font-bold">
                    {type.name}
                  </span>
                  <span
                    className={cn(
                      "mt-1 inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs",
                      RISK_STYLE[risk],
                    )}
                  >
                    {RISK_LABEL[risk]}
                  </span>
                  <span className="mt-3 min-h-14 border-t border-dashed border-border pt-2 font-mono text-xs leading-relaxed text-muted-foreground">
                    <span className="text-foreground/80">敌人</span> ·{" "}
                    {compText !== "" ? compText : type.enemyText}
                    <br />
                    <span className="text-foreground/80">奖励</span> ·{" "}
                    {entry.shardReward
                      ? `碎片 +${entry.shardReward}`
                      : entry.memoryReward
                        ? `内存 +${entry.memoryReward}`
                        : entry.relicFloor
                          ? entry.relicFloor === "epic"
                            ? "必出史诗词条"
                            : "必出稀有词条"
                          : type.rewardText}
                  </span>
                  {/* 深化包·路线叙事：一句话氛围，斜体小字，不参与选中态 */}
                  <span className="mt-2 block font-mono text-xs italic leading-relaxed text-muted-foreground/80">
                    {type.lore}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
