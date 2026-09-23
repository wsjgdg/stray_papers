import { Recycle, Skull, Trash2, Undo2 } from "lucide-react"

import {
  CURSE_DEFS,
  RELIC_SCHOOL_STYLE,
  type CurseId,
  type Relic,
} from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

type RemoveTarget =
  | { kind: "relic"; id: string }
  | { kind: "curse"; id: CurseId }

type RecycleBinOverlayProps = {
  relics: Relic[]
  curses: CurseId[]
  /** recycle = 回收站路线（丢 1 个送内存）；shop = 商店清理服务（花过碎片的） */
  mode: "recycle" | "shop"
  /** 低配模式：浮层不做多余动效 */
  lowSpec?: boolean
  onRemove: (target: RemoveTarget) => void
  onSkip: () => void
}

export function RecycleBinOverlay({
  relics,
  curses,
  mode,
  lowSpec = false,
  onRemove,
  onSkip,
}: RecycleBinOverlayProps) {
  const empty = relics.length === 0 && curses.length === 0

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="回收站"
        className={cn(
          "max-h-full w-full max-w-xl animate-in overflow-y-auto rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg sm:p-5",
          !lowSpec && "fade-in slide-in-from-bottom-4 duration-300",
        )}
      >
        <p className="flex items-center gap-1.5 font-mono text-xs text-primary">
          <Recycle className="h-3.5 w-3.5" />
          {mode === "recycle" ? "回收站 · 没有敌人" : "清理服务 · 已付款"}
        </p>
        <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
          {mode === "recycle"
            ? "挑一个东西丢掉"
            : "挑一个东西永久清掉"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "recycle"
            ? "丢掉 1 个词条或诅咒，腾出手脚（内存 +10）。不丢也能走，只是没奖励。"
            : "词条和诅咒都能清，一次清 1 个，清完回商店。"}
        </p>

        {empty ? (
          <p className="mt-4 rounded-md border border-dashed border-border p-4 text-center font-mono text-xs text-muted-foreground">
            你身上干干净净，没什么可丢的。
          </p>
        ) : (
          <>
            {relics.length > 0 && (
              <section className="mt-4">
                <h3 className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <Trash2 className="h-3.5 w-3.5" />
                  词条（{relics.length}）
                </h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {relics.map((relic) => {
                    const style = RELIC_SCHOOL_STYLE[relic.school]
                    return (
                      <li key={relic.id}>
                        <button
                          type="button"
                          onClick={() => onRemove({ kind: "relic", id: relic.id })}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md border bg-background/40 p-2.5 text-left shadow-md transition hover:-translate-y-0.5 hover:border-destructive/70 hover:shadow-lg focus-visible:outline-none focus-visible:shadow-focus",
                            style.chip,
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-display text-sm font-bold text-foreground">
                              {relic.name}
                            </span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {relic.code} · {relic.desc}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {curses.length > 0 && (
              <section className="mt-4">
                <h3 className="flex items-center gap-1.5 font-mono text-xs text-destructive">
                  <Skull className="h-3.5 w-3.5" />
                  诅咒（{curses.length}）
                </h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {curses.map((curseId) => {
                    const curse = CURSE_DEFS[curseId]
                    return (
                      <li key={curse.id}>
                        <button
                          type="button"
                          onClick={() =>
                            onRemove({ kind: "curse", id: curseId })
                          }
                          className="flex w-full items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2.5 text-left shadow-md transition hover:-translate-y-0.5 hover:border-destructive hover:shadow-lg focus-visible:outline-none focus-visible:shadow-focus"
                        >
                          <Skull className="h-4 w-4 shrink-0 text-destructive" />
                          <span className="min-w-0">
                            <span className="block truncate font-display text-sm font-bold text-destructive">
                              {curse.name}
                            </span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {curse.desc}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </>
        )}

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-1.5 rounded-sm border border-primary/60 bg-primary/10 px-3 py-1.5 font-mono text-xs font-bold text-primary transition hover:border-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            <Undo2 className="h-3.5 w-3.5" />
            {mode === "recycle" ? "什么都不丢，继续前进" : "返回商店"}
          </button>
        </div>
      </div>
    </div>
  )
}
