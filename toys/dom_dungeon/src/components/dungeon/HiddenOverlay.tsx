import { DoorClosed, MoonStar, Sparkles } from "lucide-react"

import type { HiddenFloorDef } from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

type HiddenOverlayProps = {
  /** 清场后冒出的裂隙定义（fun-pack v3 二）：名字 / 出现层 / lore 正文 */
  offer: HiddenFloorDef
  /** 低配模式：浮层不做多余动效 */
  lowSpec?: boolean
  /** 走进裂隙：换敌组开一场额外战斗 */
  onEnter: () => void
  /** 不搭理它：直接续原流程 */
  onReject: () => void
}

/**
 * 隐藏裂隙浮层（fun-pack v3 二/三）：清场条件命中后裂开的神秘入口。
 * 走 primary 霓虹青的发光描边做「神秘感」，刻意区别于 CrisisOverlay 的红色错误感；
 * lore 正文写清条件 / 里面有什么 / 报酬，进不进都由玩家拍板。
 */
export function HiddenOverlay({
  offer,
  lowSpec = false,
  onEnter,
  onReject,
}: HiddenOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={offer.name}
        className={cn(
          "relative max-h-full w-full max-w-xl animate-in overflow-y-auto rounded-lg border border-primary/60 bg-gradient-to-b from-card via-card to-background p-4 text-card-foreground shadow-md ring-1 ring-primary/25 sm:p-5",
          !lowSpec && "fade-in slide-in-from-bottom-4 duration-300",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-primary/15 blur-3xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl"
        />

        <div className="relative">
          <p className="flex items-center gap-1.5 font-mono text-xs text-primary">
            <MoonStar className="h-3.5 w-3.5" />
            隐藏裂隙 · 本不该存在的入口
          </p>
          <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
            第 {offer.afterFloor} 层的墙裂开了 —— {offer.name}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {offer.lore}
          </p>

          <div
            aria-hidden
            className="mt-4 h-1.5 rounded-full border border-dashed border-primary/40"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={onReject}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
            >
              <DoorClosed className="h-3.5 w-3.5" />
              不搭理它
            </button>
            <button
              type="button"
              onClick={onEnter}
              className="inline-flex items-center gap-1.5 rounded-sm border border-primary bg-primary px-3.5 py-1.5 font-mono text-xs font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
            >
              <Sparkles className="h-3.5 w-3.5" />
              走进裂隙
            </button>
          </div>

          <p className="mt-2 text-right font-mono text-xs text-muted-foreground">
            进去是一场额外的硬仗；不进，该拿的照拿。
          </p>
        </div>
      </div>
    </div>
  )
}
