import { AlertTriangle, TerminalSquare } from "lucide-react"

import type { CrisisEventDef } from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

type CrisisOverlayProps = {
  /** 当前代价事件（fun-pack.md 三）：标题 / 描述 / 三个都带代价的选项 */
  crisis: CrisisEventDef
  /** 低配模式：浮层不做多余动效 */
  lowSpec?: boolean
  /** 选第几个选项（0 / 1 / 2），引擎侧结算代价 */
  onChoose: (optionIndex: number) => void
}

/**
 * 代价事件浮层（fun-pack.md 三）：未知区域撞上的「系统错误」，
 * 5 个事件 × 3 个选项全部有代价。每张选项卡大字写选择、小字写清代价，
 * 点一下立刻结算，没有不疼的选项。
 */
export function CrisisOverlay({
  crisis,
  lowSpec = false,
  onChoose,
}: CrisisOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={crisis.title}
        className={cn(
          "relative max-h-full w-full max-w-2xl animate-in overflow-y-auto rounded-lg border border-destructive/60 bg-gradient-to-b from-card via-card to-background p-4 text-card-foreground shadow-md sm:p-5",
          !lowSpec && "fade-in slide-in-from-bottom-4 duration-300",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-destructive/15 blur-3xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl"
        />

        <div className="relative">
          <p className="flex items-center gap-1.5 font-mono text-xs text-destructive">
            <TerminalSquare className="h-3.5 w-3.5" />
            系统错误 · 这里没有不疼的选项
          </p>
          <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
            {crisis.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{crisis.desc}</p>

          <div
            aria-hidden
            className="mt-3 h-1.5 rounded-full border border-dashed border-border"
          />

          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {crisis.options.map((option, index) => (
              <li key={`${crisis.id}-${index}`}>
                <button
                  type="button"
                  onClick={() => onChoose(index)}
                  className={cn(
                    "flex h-full w-full flex-col gap-1.5 rounded-md border border-border bg-background/40 p-3 text-left transition hover:border-destructive/70 hover:bg-destructive/10 hover:shadow-md focus-visible:outline-none focus-visible:shadow-focus",
                    !lowSpec && "hover:-translate-y-0.5",
                  )}
                >
                  <span className="flex items-center gap-1.5 font-display text-lg font-bold">
                    <AlertTriangle
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-destructive"
                    />
                    {option.label}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {option.detail}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            每一条路都要付出点什么，看清代价再按下去。
          </p>
        </div>
      </div>
    </div>
  )
}
