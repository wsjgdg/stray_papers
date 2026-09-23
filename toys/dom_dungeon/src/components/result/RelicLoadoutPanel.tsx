import { Link2, Package } from "lucide-react"

import {
  MAX_RELIC_SLOTS,
  RELIC_SCHOOL_STYLE,
  type BondDef,
  type Relic,
  type RelicSchool,
} from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

type RelicLoadoutPanelProps = {
  relics: Relic[]
  /** 本局点亮的流派 combo */
  bonds: BondDef[]
  schoolSummary: { school: RelicSchool; label: string; count: number }[]
}

export function RelicLoadoutPanel({
  relics,
  bonds,
  schoolSummary,
}: RelicLoadoutPanelProps) {
  const emptySlots = Math.max(0, MAX_RELIC_SLOTS - relics.length)

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Package className="h-4 w-4 text-primary" />
          本局词条
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          {relics.length} / {MAX_RELIC_SLOTS} 槽
        </span>
      </div>

      {relics.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
          本局没有拿到任何词条 —— 下一局过层时的三选一亮卡，随便拿一个都比空手强。
        </p>
      ) : (
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {relics.map((relic) => (
          <li
            key={relic.id}
            className={cn(
              "rounded-md border px-2.5 py-2 transition hover:scale-105",
              RELIC_SCHOOL_STYLE[relic.school].chip,
            )}
          >
            <p className="truncate font-mono text-xs font-bold">{relic.name}</p>
            <p className="mt-0.5 truncate text-xs opacity-80">{relic.desc}</p>
          </li>
        ))}
        {Array.from({ length: emptySlots }).map((_, index) => (
          <li
            key={`empty-${index}`}
            className="grid place-items-center rounded-md border border-dashed border-border px-2.5 py-2 font-mono text-xs text-muted-foreground"
          >
            空槽
          </li>
        ))}
      </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {schoolSummary.map((item) => (
          <span
            key={item.school}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background/40 px-2 py-1 font-mono text-xs text-muted-foreground"
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                item.count > 0
                  ? RELIC_SCHOOL_STYLE[item.school].dot
                  : "bg-muted-foreground",
              )}
            />
            {item.label} {item.count}
          </span>
        ))}
      </div>

      {bonds.length > 0 ? (
        <div className="mt-4 space-y-2">
          {bonds.map((bond) => (
            <div
              key={bond.id}
              className="flex items-start gap-2 rounded-md border border-primary/50 bg-primary/5 p-3"
            >
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold text-primary">
                  流派点亮 · {bond.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{bond.desc}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          这局没凑齐流派 combo —— 集齐同一流派的全部词条就会点亮，持有「跨域」可顶替缺的 1 件。
        </p>
      )}
    </section>
  )
}
