import {
  RELIC_RARITY_LABEL,
  RELIC_RARITY_STYLE,
  RELIC_SCHOOL_STYLE,
  type RelicRarity,
} from "@/lib/dungeonData"
import type { CodexRelicGroup } from "@/pages/Codex/useCodex"

type RelicCodexPanelProps = {
  groups: CodexRelicGroup[]
  seenCount: number
  totalCount: number
  /** 未见词条花货币补全详情（common/rare 碎片，epic 核心） */
  onFix: (relicId: string, rarity: RelicRarity) => void
  /** 一条都还没收集时给个「去战斗」出口 */
  onGoHome?: () => void
}

const FIX_ICONS: Record<"fragments" | "cores", string> = {
  fragments: "💰",
  cores: "🔷",
}
const FIX_CURRENCY_LABEL: Record<"fragments" | "cores", string> = {
  fragments: "碎片",
  cores: "核心",
}

export function RelicCodexPanel({
  groups,
  seenCount,
  totalCount,
  onFix,
  onGoHome,
}: RelicCodexPanelProps) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          词条档案
        </h2>
        <p className="font-mono text-xs text-muted-foreground">
          本页签收集进度{" "}
          <span className="font-bold text-primary">{seenCount}</span> / {totalCount}
        </p>
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        没见过的词条也能补全：common / rare 花 50💰，epic 花 2🔷；补全不算实战收集。
      </p>

      {seenCount === 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card p-4 text-card-foreground">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">暂无收集记录</span>
            <span className="block text-xs text-muted-foreground">
              去战斗里过一层就有三选一，拿过的词条会收进这里
            </span>
          </span>
          {onGoHome ? (
            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
            >
              开始游戏
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-4">
        {groups.map((group) => {
          const style = RELIC_SCHOOL_STYLE[group.school]
          return (
            <article
              key={group.school}
              className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-md"
            >
              <div
                className={`flex items-center justify-between gap-3 border-l-4 ${style.ring} px-4 py-3`}
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 rounded-full ${style.dot}`}
                  />
                  <h3 className="font-display text-base font-bold">
                    {group.label}
                  </h3>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {group.seenCount} / {group.relics.length}
                </span>
              </div>

              <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.relics.map((relic) => {
                  const locked = !relic.seen && !relic.purchased
                  return (
                    <li
                      key={relic.id}
                      className={`rounded-md border border-border bg-background/40 p-3 transition ${
                        locked ? "opacity-80" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {relic.code}
                        </span>
                        <p className="truncate font-display text-sm font-bold">
                          {locked ? "？？？" : relic.name}
                        </p>
                        {locked ? (
                          <span className="ml-auto shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            未解锁
                          </span>
                        ) : relic.purchased ? (
                          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                            补全
                          </span>
                        ) : (
                          <span
                            className={`ml-auto shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-xs ${
                              RELIC_RARITY_STYLE[relic.rarity]
                            }`}
                          >
                            {RELIC_RARITY_LABEL[relic.rarity]}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {locked
                          ? "在地牢里选到它，或花货币补全，效果就会亮出来。"
                          : relic.desc}
                      </p>

                      {locked ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={!relic.canFix}
                            onClick={() => onFix(relic.id, relic.rarity)}
                            className={`inline-flex items-center rounded-md border px-2 py-1 font-mono text-xs transition focus-visible:outline-none focus-visible:shadow-focus ${
                              relic.canFix
                                ? "border-primary/50 text-primary hover:bg-primary/10"
                                : "cursor-not-allowed border-border text-muted-foreground/70"
                            }`}
                          >
                            补全 {relic.fixPrice}
                            {FIX_ICONS[relic.fixCurrency]}
                          </button>
                          {relic.fixShortfall > 0 ? (
                            <span className="font-mono text-xs text-muted-foreground">
                              还差 {relic.fixShortfall} {FIX_CURRENCY_LABEL[relic.fixCurrency]}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </article>
          )
        })}
      </div>
    </section>
  )
}
