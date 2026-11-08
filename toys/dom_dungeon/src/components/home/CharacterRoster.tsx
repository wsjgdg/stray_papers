import { MousePointerClick, Play } from "lucide-react"

import { CharacterCard } from "@/components/home/CharacterCard"
import type { RosterEntry } from "@/pages/Home/useHome"
import type {
  CharacterId,
  CharacterSkin,
  DungeonCharacter,
} from "@/lib/dungeonData"

type CharacterRosterProps = {
  roster: RosterEntry[]
  activeIndex: number
  isUnlocked: (id: CharacterId) => boolean
  fragmentsNeeded: (character: DungeonCharacter) => number
  coresNeeded: (character: DungeonCharacter) => number
  skinFor: (id: CharacterId) => CharacterSkin
  onHighlight: (id: CharacterId) => void
  onStart: (id: CharacterId) => void
  onBuy: (id: CharacterId, currency: "fragments" | "cores") => void
  showHint: boolean
}

export function CharacterRoster({
  roster,
  activeIndex,
  isUnlocked,
  fragmentsNeeded,
  coresNeeded,
  skinFor,
  onHighlight,
  onStart,
  onBuy,
  showHint,
}: CharacterRosterProps) {
  /* 高亮位若落到隐藏角色（异常兜底），回退到第一个已露面角色，绝不泄露隐藏角色信息 */
  const activeEntry =
    roster[activeIndex]?.visible === true
      ? roster[activeIndex]
      : (roster.find((entry) => entry.visible) ?? roster[0])
  const active = activeEntry?.character

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold">选一个开局角色</h2>
          <p className="text-sm text-muted-foreground">
            每局只带一个角色进场，技能冷却越短，节奏越快。
          </p>
        </div>
        <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <kbd className="rounded-sm border border-border px-1.5 py-0.5">←</kbd>
          <kbd className="rounded-sm border border-border px-1.5 py-0.5">→</kbd>
          切换
          <kbd className="ml-2 rounded-sm border border-border px-1.5 py-0.5">
            Enter
          </kbd>
          开局
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {roster.map((entry, index) => (
          <CharacterCard
            key={entry.character.id}
            character={entry.character}
            visible={entry.visible}
            clearsRemaining={entry.clearsRemaining}
            unlocked={isUnlocked(entry.character.id)}
            fragmentsNeeded={fragmentsNeeded(entry.character)}
            coresNeeded={coresNeeded(entry.character)}
            skin={skinFor(entry.character.id)}
            highlighted={index === activeIndex && entry.visible}
            onHighlight={() => onHighlight(entry.character.id)}
            onStart={() => onStart(entry.character.id)}
            onBuy={(currency) => onBuy(entry.character.id, currency)}
          />
        ))}
      </div>

      {active && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onStart(active.id)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
          >
            <Play className="h-4 w-4" />
            以「{active.displayName}」进入地牢
          </button>
          <p className="font-mono text-xs text-muted-foreground">
            {active.tagline}
          </p>
        </div>
      )}

      {showHint && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 px-3 py-2 font-mono text-xs text-primary">
          <MousePointerClick className="h-3.5 w-3.5" />
          点角色卡直接开始，不需要注册
        </p>
      )}
    </section>
  )
}
