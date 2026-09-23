import { Copy, Sparkles } from "lucide-react"

import { RELIC_SCHOOL_STYLE, type Relic } from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

type MirrorOverlayProps = {
  relics: Relic[]
  /** 低配模式：浮层不做多余动效 */
  lowSpec?: boolean
  onCopy: (relicId: string) => void
  onSkip: () => void
}

/** 镜像空间：选 1 个已有词条复制一份，代价是内存上限 -2（dungeon-route.md 三） */
export function MirrorOverlay({
  relics,
  lowSpec = false,
  onCopy,
  onSkip,
}: MirrorOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="镜像复制"
        className={cn(
          "max-h-full w-full max-w-xl animate-in overflow-y-auto rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg sm:p-5",
          !lowSpec && "fade-in slide-in-from-bottom-4 duration-300",
        )}
      >
        <p className="flex items-center gap-1.5 font-mono text-xs text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          镜像空间 · 挑一面镜子照
        </p>
        <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
          复制 1 个已有词条
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          复制后这份效果叠加倍增，代价是内存上限永久 -2。不照镜子也能走。
        </p>

        {relics.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-border p-4 text-center font-mono text-xs text-muted-foreground">
            身上没词条，镜子照了个空。
          </p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {relics.map((relic) => {
              const style = RELIC_SCHOOL_STYLE[relic.school]
              return (
                <li key={relic.id}>
                  <button
                    type="button"
                    onClick={() => onCopy(relic.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md border bg-background/40 p-3 text-left shadow-md transition hover:-translate-y-0.5 hover:border-primary/70 hover:shadow-lg focus-visible:outline-none focus-visible:shadow-focus",
                      style.ring,
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", style.dot)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm font-bold">
                        {relic.name}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {relic.desc}
                      </span>
                      <span className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-primary">
                        <Copy className="h-3 w-3" />
                        复制 · 内存上限 -2
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-end border-t border-border pt-3">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-sm border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            都不复制，继续前进
          </button>
        </div>
      </div>
    </div>
  )
}
