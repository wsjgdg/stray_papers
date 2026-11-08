import { Check, Info } from "lucide-react"

import {
  RELIC_RARITY_LABEL,
  RELIC_RARITY_STYLE,
  RELIC_SCHOOL_LABEL,
  RELIC_SCHOOL_STYLE,
  type DungeonCharacter,
  type Relic,
} from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

import { buildRelicDetail } from "./relicDetail"

type RelicDetailPanelProps = {
  /** 供卡片的 aria-describedby 引用 */
  panelId: string
  relic: Relic
  character: DungeonCharacter
  relics: Relic[]
  floor: number
  lowSpec: boolean
  /** 窄屏：面板底部给一个「确认选择」，点了才真正选中 */
  showConfirm: boolean
  onConfirm: () => void
}

export function RelicDetailPanel({
  panelId,
  relic,
  character,
  relics,
  floor,
  lowSpec,
  showConfirm,
  onConfirm,
}: RelicDetailPanelProps) {
  const detail = buildRelicDetail(relic, character, relics, floor)
  const schoolStyle = RELIC_SCHOOL_STYLE[relic.school]

  return (
    <div
      id={panelId}
      data-relic-detail
      role="note"
      aria-label={`${relic.name} 详细解释`}
      className={cn(
        "mt-2 w-full rounded-md border border-primary/50 bg-background/70 p-3 text-left",
        lowSpec
          ? ""
          : "animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none",
      )}
    >
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 font-mono text-xs text-primary">
          <Info className="h-3.5 w-3.5" />
          详细解释
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-xs",
            schoolStyle.chip,
          )}
        >
          <span
            aria-hidden
            className={cn("h-1.5 w-1.5 rounded-full", schoolStyle.dot)}
          />
          {RELIC_SCHOOL_LABEL[relic.school]}
        </span>
        <span
          className={cn(
            "rounded-sm border px-1.5 py-0.5 font-mono text-xs",
            RELIC_RARITY_STYLE[relic.rarity],
          )}
        >
          {RELIC_RARITY_LABEL[relic.rarity]}
        </span>
      </p>

      <p className="mt-2 font-display text-sm font-bold text-foreground">
        {detail.headline}
      </p>

      <dl className="mt-2 grid gap-1">
        {detail.facts.map((fact) => (
          <div
            key={fact.label}
            className="flex items-baseline justify-between gap-3 border-b border-border pb-1 last:border-b-0 last:pb-0"
          >
            <dt className="font-mono text-xs text-muted-foreground">
              {fact.label}
            </dt>
            <dd className="shrink-0 font-mono text-xs font-bold text-foreground">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {detail.notes.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {detail.notes.map((note) => (
            <li key={note} className="flex gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/70"
              />
              <span className="leading-relaxed">{note}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {showConfirm ? (
        <button
          type="button"
          onClick={onConfirm}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-primary bg-primary px-3 py-2 font-mono text-xs font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:shadow-focus"
        >
          <Check className="h-3.5 w-3.5" />
          确认选择
        </button>
      ) : null}
    </div>
  )
}
