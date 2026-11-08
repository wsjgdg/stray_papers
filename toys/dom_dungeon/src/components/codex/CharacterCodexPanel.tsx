import { Lock, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { HIDDEN_CHARACTER_HINT } from "@/lib/dungeonData"
import { cn } from "@/lib/utils"
import type {
  CodexCharacterEntry,
  CodexSkinEntry,
  PendingChar,
  PendingSkin,
} from "@/pages/Codex/useCodex"

type CharacterCodexPanelProps = {
  characters: CodexCharacterEntry[]
  pendingSkin: PendingSkin | null
  pendingChar: PendingChar | null
  onTapSkin: (characterId: CodexCharacterEntry["id"], skinId: string) => void
  onRequestSkinBuy: (
    characterId: CodexCharacterEntry["id"],
    skinId: string,
    currency: "fragments" | "cores",
  ) => void
  onConfirmSkin: () => void
  onCancelSkin: () => void
  onRequestCharBuy: (
    characterId: CodexCharacterEntry["id"],
    currency: "fragments" | "cores",
  ) => void
  onConfirmChar: () => void
  onCancelChar: () => void
}

function SkinChip({
  skin,
  confirming,
  onTap,
  onBuy,
}: {
  skin: CodexSkinEntry
  confirming: boolean
  onTap: () => void
  onBuy: (currency: "fragments" | "cores") => void
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs transition",
        skin.equipped
          ? "border-border bg-foreground/5 text-foreground"
          : "border-border/60",
        confirming && "ring-2 ring-primary",
      )}
    >
      <button
        type="button"
        onClick={onTap}
        aria-pressed={skin.equipped}
        aria-label={`外观 ${skin.displayName}${
          skin.unlocked ? "" : "，未解锁"
        }`}
        title={skin.desc}
        className="inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:shadow-focus"
      >
        <span
          aria-hidden
          className={cn(
            "h-3.5 w-3.5 shrink-0 rounded-full border-2",
            skin.equipped ? cn(skin.border, skin.ring) : "border-transparent",
            skin.dot,
            !skin.unlocked && "opacity-40",
          )}
        />
        <span className={cn(skin.equipped && "font-bold")}>
          {skin.displayName}
        </span>
        {!skin.unlocked ? (
          <Lock className="h-3 w-3 text-muted-foreground" />
        ) : null}
      </button>

      {!skin.unlocked ? (
        <span className="inline-flex items-center gap-1">
          {skin.affordable ? (
            <button
              type="button"
              onClick={() => onBuy("fragments")}
              className="rounded-sm border border-primary/50 px-1.5 py-0.5 text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:shadow-focus"
            >
              {skin.cost}💰
            </button>
          ) : (
            <span
              aria-disabled="true"
              className="cursor-not-allowed rounded-sm border border-border px-1.5 py-0.5 text-muted-foreground/70"
            >
              还差 {skin.shortfall}💰
            </span>
          )}
          {skin.coreCost > 0 ? (
            skin.coreAffordable ? (
              <button
                type="button"
                onClick={() => onBuy("cores")}
                className="rounded-sm border border-primary/50 px-1.5 py-0.5 text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:shadow-focus"
              >
                {skin.coreCost}🔷
              </button>
            ) : (
              <span
                aria-disabled="true"
                className="cursor-not-allowed rounded-sm border border-border px-1.5 py-0.5 text-muted-foreground/70"
              >
                还差 {skin.coreShortfall}🔷
              </span>
            )
          ) : null}
        </span>
      ) : null}
    </span>
  )
}

/** 未露面的隐藏角色：整卡灰态剪影，只有神秘提示，不给购买入口 */
function HiddenCharacterCard({
  character,
}: {
  character: CodexCharacterEntry
}) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-dashed border-border bg-card p-4 text-card-foreground opacity-60 shadow-md">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground"
        >
          <Lock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-bold text-muted-foreground">
              ？？？
            </h3>
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              神秘角色
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {HIDDEN_CHARACTER_HINT}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 p-3">
        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="font-mono text-xs text-muted-foreground">
          还需 {character.clearsRemaining} 次通关才会现身
        </p>
      </div>
    </article>
  )
}

export function CharacterCodexPanel({
  characters,
  pendingSkin,
  pendingChar,
  onTapSkin,
  onRequestSkinBuy,
  onConfirmSkin,
  onCancelSkin,
  onRequestCharBuy,
  onConfirmChar,
  onCancelChar,
}: CharacterCodexPanelProps) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          角色档案
        </h2>
        <p className="font-mono text-xs text-muted-foreground">
          解锁优先花碎片；带🔷价的条目还能用核心买断
        </p>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {characters.map((character) => {
          if (!character.visible) {
            return (
              <HiddenCharacterCard
                key={character.id}
                character={character}
              />
            )
          }
          const locked = !character.unlocked
          const percent = Math.round(character.progressRatio * 100)
          const equippedName =
            character.skins.find((skin) => skin.equipped)?.displayName ?? "原生"
          return (
            <article
              key={character.id}
              className={cn(
                "flex h-full flex-col rounded-lg border bg-card p-4 text-card-foreground shadow-md transition",
                character.justUnlocked
                  ? "border-primary ring-2 ring-primary"
                  : locked
                    ? "border-border"
                    : character.skinStyle.border,
                locked && "opacity-60",
              )}
            >
              {!locked ? (
                <span
                  aria-hidden
                  className={cn(
                    "mb-3 block h-1 w-full rounded-full",
                    character.skinStyle.bar,
                  )}
                />
              ) : null}

              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "grid h-12 w-12 shrink-0 place-items-center rounded-md border font-display text-lg font-bold",
                    locked
                      ? "border-border bg-foreground/5 text-muted-foreground"
                      : character.skinStyle.chip,
                  )}
                >
                  {locked ? (
                    <Lock className="h-5 w-5" />
                  ) : (
                    character.displayName.slice(0, 1)
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-display text-lg font-bold">
                      {character.displayName}
                    </h3>
                    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {character.roleLabel}
                    </span>
                    {character.unlocked ? (
                      <span
                        className={cn(
                          "ml-auto inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-xs",
                          character.skinStyle.chip,
                        )}
                      >
                        <Sparkles className="h-3 w-3" />
                        已解锁
                      </span>
                    ) : (
                      <span className="ml-auto shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        未解锁
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {character.tagline}
                  </p>
                </div>
              </div>

              {locked ? (
                <div className="mt-4 rounded-md border border-dashed border-border p-3">
                  <p className="font-mono text-xs text-muted-foreground">
                    解锁条件 · {character.fragmentCost}💰
                    {character.coreCost > 0
                      ? ` 或 ${character.coreCost}🔷`
                      : ""}
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        character.affordable
                          ? "bg-primary"
                          : "bg-muted-foreground/60",
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {character.affordable
                        ? "碎片够了，随时可以招募"
                        : character.coreAffordable
                          ? "核心够了，也能直接买断"
                          : `碎片进度 ${percent}%`}
                    </span>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {character.affordable ? (
                        <button
                          type="button"
                          onClick={() => onRequestCharBuy(character.id, "fragments")}
                          className="rounded-sm border border-primary/50 bg-primary/10 px-2 py-1 font-mono text-xs text-primary transition hover:bg-primary/20 focus-visible:outline-none focus-visible:shadow-focus"
                        >
                          {character.fragmentCost}💰
                        </button>
                      ) : (
                        <span
                          aria-disabled="true"
                          className="cursor-not-allowed rounded-sm border border-border px-2 py-1 font-mono text-xs text-muted-foreground/70"
                        >
                          还差 {character.shortfall}💰
                        </span>
                      )}
                      {character.coreCost > 0 ? (
                        character.coreAffordable ? (
                          <button
                            type="button"
                            onClick={() => onRequestCharBuy(character.id, "cores")}
                            className="rounded-sm border border-primary/50 bg-primary/10 px-2 py-1 font-mono text-xs text-primary transition hover:bg-primary/20 focus-visible:outline-none focus-visible:shadow-focus"
                          >
                            {character.coreCost}🔷
                          </button>
                        ) : (
                          <span
                            aria-disabled="true"
                            className="cursor-not-allowed rounded-sm border border-border px-2 py-1 font-mono text-xs text-muted-foreground/70"
                          >
                            还差 {character.coreShortfall}🔷
                          </span>
                        )
                      ) : null}
                    </span>
                  </div>

                  {pendingChar?.characterId === character.id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/50 bg-primary/10 p-2">
                      <p className="font-mono text-xs text-foreground">
                        花 {pendingChar.price}{" "}
                        {pendingChar.currency === "cores" ? "核心" : "碎片"}
                        招募「{pendingChar.displayName}」？
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={onConfirmChar}
                        className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        确认
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={onCancelChar}
                      >
                        取消
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <dl className="mt-4 space-y-2 rounded-md border border-border bg-background/40 p-3">
                  <div>
                    <dt
                      className={cn(
                        "font-mono text-xs",
                        character.skinStyle.accentText,
                      )}
                    >
                      {character.activeName} · {character.cooldown}
                    </dt>
                    <dd className="mt-0.5 text-sm text-muted-foreground">
                      {character.activeDesc}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-xs text-muted-foreground">
                      被动
                    </dt>
                    <dd className="mt-0.5 text-sm text-muted-foreground">
                      {character.passive}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-xs text-muted-foreground">
                      数值
                    </dt>
                    <dd className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                      {character.stats.map((stat) => (
                        <span
                          key={stat.label}
                          className="flex items-baseline justify-between gap-1 font-mono text-xs"
                        >
                          <span className="text-muted-foreground">
                            {stat.label}
                          </span>
                          <span className="font-bold">{stat.value}</span>
                        </span>
                      ))}
                    </dd>
                  </div>
                </dl>
              )}

              {!locked ? (
                <div
                  className={cn(
                    "mt-3 rounded-md border border-dashed border-border p-3",
                    character.skinStyle.surface,
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs text-muted-foreground">
                      外观 · 只换配色，不改数值
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      当前{" "}
                      <span
                        className={cn(
                          "font-bold",
                          character.skinStyle.accentText,
                        )}
                      >
                        {equippedName}
                      </span>
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {character.skins.map((skin) => {
                      const confirming =
                        pendingSkin?.characterId === character.id &&
                        pendingSkin?.skinId === skin.id
                      return (
                        <SkinChip
                          key={skin.id}
                          skin={skin}
                          confirming={confirming}
                          onTap={() => onTapSkin(character.id, skin.id)}
                          onBuy={(currency) =>
                            onRequestSkinBuy(character.id, skin.id, currency)
                          }
                        />
                      )
                    })}
                  </div>

                  {pendingSkin?.characterId === character.id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/50 bg-primary/10 p-2">
                      <p className="font-mono text-xs text-foreground">
                        花 {pendingSkin.price}{" "}
                        {pendingSkin.currency === "cores" ? "核心" : "碎片"}
                        解锁「{pendingSkin.displayName}」并换上？
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={onConfirmSkin}
                        className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        确认
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={onCancelSkin}
                      >
                        取消
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
