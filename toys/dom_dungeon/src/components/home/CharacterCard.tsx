import { Ghost, Lock } from "lucide-react"

import {
  HIDDEN_CHARACTER_HINT,
  getCharacterStatEntries,
  type CharacterSkin,
  type DungeonCharacter,
} from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

type CurrencyRoute = "fragments" | "cores"

type CharacterCardProps = {
  character: DungeonCharacter
  visible: boolean
  clearsRemaining: number
  unlocked: boolean
  fragmentsNeeded: number
  coresNeeded: number
  skin: CharacterSkin
  highlighted: boolean
  onHighlight: () => void
  onStart: () => void
  onBuy: (currency: CurrencyRoute) => void
}

export function CharacterCard({
  character,
  visible,
  clearsRemaining,
  unlocked,
  fragmentsNeeded,
  coresNeeded,
  skin,
  highlighted,
  onHighlight,
  onStart,
  onBuy,
}: CharacterCardProps) {
  /* 未露面的隐藏角色：灰态剪影卡，名字打码，整卡不可点不可选，仅聚焦可读 */
  if (!visible) {
    return (
      <div
        tabIndex={0}
        aria-label={`未露面角色，${HIDDEN_CHARACTER_HINT}，还需 ${clearsRemaining} 次通关`}
        className={cn(
          "flex h-full w-full cursor-not-allowed select-none flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4 text-left shadow-inner transition duration-200 focus-visible:outline-none focus-visible:shadow-focus",
        )}
      >
        <span aria-hidden className="block h-1 w-full rounded-full bg-muted-foreground/20" />

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold text-muted-foreground">
              ？？？
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              神秘角色 · 尚未现身
            </p>
          </div>
          <span className="shrink-0 rounded-sm border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            锁定
          </span>
        </div>

        <div className="grid flex-1 place-items-center rounded-md border border-dashed border-border bg-muted py-8 text-muted-foreground">
          <Ghost className="h-8 w-8 opacity-60" />
        </div>

        <div className="mt-auto rounded-md border border-dashed border-border bg-background/40 p-3">
          <p className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            {HIDDEN_CHARACTER_HINT}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            还需 {clearsRemaining} 次通关
          </p>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onMouseEnter={onHighlight}
      onFocus={onHighlight}
      onClick={onStart}
      aria-pressed={highlighted}
      aria-label={
        unlocked
          ? `选择${character.displayName}开局`
          : `查看并购买${character.displayName}`
      }
      className={cn(
        "group relative flex h-full w-full flex-col gap-3 rounded-lg border bg-card p-4 text-left text-card-foreground shadow-md transition duration-200 focus-visible:outline-none focus-visible:shadow-focus",
        highlighted
          ? cn("-translate-y-0.5 ring-2 shadow-lg", skin.style.border, skin.style.ring)
          : cn("border-border hover:-translate-y-0.5", skin.style.border),
        !unlocked && "opacity-95",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "block h-1 w-full rounded-full",
          unlocked ? skin.style.bar : cn(skin.style.bar, "opacity-50"),
        )}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-bold">
            {character.displayName}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {character.roleLabel} · {character.cooldown}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-sm border px-2 py-1 font-mono text-xs",
            highlighted
              ? skin.style.chip
              : "border-border bg-foreground/5 text-muted-foreground",
          )}
        >
          {unlocked ? skin.displayName : "未拥有"}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">{character.passive}</p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md border border-border bg-background/40 p-3 sm:grid-cols-3">
        {getCharacterStatEntries(character.id).map((stat) => (
          <div
            key={stat.label}
            className="flex items-baseline justify-between gap-1"
          >
            <dt className="font-mono text-xs text-muted-foreground">
              {stat.label}
            </dt>
            <dd className="font-mono text-xs font-bold">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div
        className={cn(
          "mt-auto rounded-md border border-dashed border-border p-3",
          skin.style.surface,
        )}
      >
        <p className={cn("font-mono text-xs", skin.style.accentText)}>主动技</p>
        <p className="text-sm font-semibold">{character.activeName}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {character.activeDesc}
        </p>
      </div>

      {unlocked ? (
        <p className="text-center font-mono text-xs text-muted-foreground">
          已加入队伍 · 点击直接开局
        </p>
      ) : (
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">买断：</span>
          <button
            type="button"
            disabled={fragmentsNeeded > 0}
            onClick={(event) => {
              event.stopPropagation()
              onBuy("fragments")
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-mono text-xs font-semibold transition focus-visible:outline-none focus-visible:shadow-focus",
              fragmentsNeeded > 0
                ? "cursor-not-allowed border-border text-muted-foreground"
                : "border-primary text-primary hover:bg-primary/10",
            )}
          >
            {fragmentsNeeded > 0
              ? `还差 ${fragmentsNeeded}💰`
              : `${character.fragmentCost}💰`}
          </button>
          {character.coreCost > 0 && (
            <button
              type="button"
              disabled={coresNeeded > 0}
              onClick={(event) => {
                event.stopPropagation()
                onBuy("cores")
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-mono text-xs font-semibold transition focus-visible:outline-none focus-visible:shadow-focus",
                coresNeeded > 0
                  ? "cursor-not-allowed border-border text-muted-foreground"
                  : "border-primary text-primary hover:bg-primary/10",
              )}
            >
              {coresNeeded > 0
                ? `还差 ${coresNeeded}🔷`
                : `${character.coreCost}🔷`}
            </button>
          )}
        </div>
      )}
    </button>
  )
}
