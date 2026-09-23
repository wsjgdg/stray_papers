import { Coins, Droplet, MemoryStick, Skull, Sparkles } from "lucide-react"

import {
  MAX_RELIC_SLOTS,
  RELIC_RARITY_LABEL,
  RELIC_RARITY_STYLE,
  RELIC_SCHOOL_LABEL,
  RELIC_SCHOOL_STYLE,
  type Relic,
} from "@/lib/dungeonData"
import type { AltarType } from "@/lib/seedGen"
import { cn } from "@/lib/utils"
import type { AltarCost } from "@/pages/Dungeon/useDungeon"

type AltarOverlayProps = {
  /** 祭坛 4 型（seed-system.md 六）：词条 / 生命 / 内存（诅咒型不走浮层，事件里直接给） */
  altarType: AltarType
  /** 词条祭坛悬着的史诗词条（其余类型为 null） */
  offer: Relic | null
  /** 本局已带词条，槽满时用来挑一个丢掉 */
  relics: Relic[]
  /** 槽满且代价已付：先挑一个丢掉的待定词条 */
  pendingRelic: Relic | null
  /** 已经付过的代价，用来高亮选中的那个按钮 */
  cost: AltarCost | null
  /** 血祭会扣掉的血量（引擎已算好：向上取整、至少 1、不会致死） */
  bloodToll: number
  /** 生命祭坛的碎片价 */
  lifeCost: number
  /** 内存祭坛折掉的生命 */
  memoryHpCost: number
  /** 本局临时碎片余额 */
  shards: number
  playerHp: number
  playerMaxHp: number
  /** 低配模式：浮层不做多余动效 */
  lowSpec?: boolean
  onChooseCost: (cost: AltarCost) => void
  onReplace: (slotId: string) => void
  onLeave: () => void
}

/** 各型祭坛的标题与一句话描述 */
const ALTAR_HEADLINE: Record<AltarType, { title: string; sub: string }> = {
  relic: {
    title: "一座石台立在路边",
    sub: "石台上悬着一个发光的词条，拿它得先付点代价，也可以转身就走。",
  },
  life: {
    title: "台座刻着「以碎片换生机」",
    sub: "把局内碎片放进凹槽，石台会还你一口血，血量不多但很实在。",
  },
  memory: {
    title: "台座刻着「以血肉换空间」",
    sub: "献一点血，本局的内存上限永久抬高一截，后面每层都受用。",
  },
  curse: {
    title: "一座阴冷的石台立在路边",
    sub: "白拿一个史诗词条，代价是一个诅咒。",
  },
}

export function AltarOverlay({
  altarType,
  offer,
  relics,
  pendingRelic,
  cost,
  bloodToll,
  lifeCost,
  memoryHpCost,
  shards,
  playerHp,
  playerMaxHp,
  lowSpec = false,
  onChooseCost,
  onReplace,
  onLeave,
}: AltarOverlayProps) {
  const locked = cost !== null
  const replacing = pendingRelic !== null
  const headline = ALTAR_HEADLINE[altarType]
  const canPayLife = shards >= lifeCost

  /* 词条卡（仅词条祭坛有） */
  const schoolStyle = offer ? RELIC_SCHOOL_STYLE[offer.school] : null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="局内祭坛"
        className={cn(
          "relative max-h-full w-full max-w-2xl animate-in overflow-y-auto rounded-lg border border-border bg-gradient-to-b from-card via-card to-background p-4 text-card-foreground shadow-md sm:p-5",
          !lowSpec && "fade-in slide-in-from-bottom-4 duration-300",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-destructive/10 blur-3xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl"
        />

        <div className="relative">
          <p className="flex items-center gap-1.5 font-mono text-xs text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            局内祭坛 · 撞上一座，先看清代价
          </p>
          <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
            {replacing && offer
              ? "词条位满了，先挑一个丢掉"
              : headline.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {replacing && offer
              ? `付过代价了，选一个旧词条换下去，新的「${offer.name}」才装得进来。`
              : headline.sub}
          </p>

          <div
            aria-hidden
            className="mt-3 h-1.5 rounded-full border border-dashed border-border"
          />

          {/* 词条祭坛：悬着的史诗卡 */}
          {offer && schoolStyle ? (
            <div className="relative mx-auto mt-4 w-full max-w-md">
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -inset-3 rounded-2xl bg-destructive/15 blur-2xl",
                  !lowSpec && "animate-pulse",
                )}
              />
              <div
                className={cn(
                  "relative rounded-lg border-2 bg-background/70 p-4 shadow-md",
                  schoolStyle.ring,
                )}
              >
                <span className="flex flex-wrap items-center gap-1.5">
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
                    {RELIC_SCHOOL_LABEL[offer.school]}
                  </span>
                  <span
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 font-mono text-xs",
                      RELIC_RARITY_STYLE[offer.rarity],
                    )}
                  >
                    {RELIC_RARITY_LABEL[offer.rarity]}
                  </span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {offer.code}
                  </span>
                </span>

                <span className="mt-2 block font-display text-2xl font-bold tracking-tight">
                  {offer.name}
                </span>
                <span className="mt-1 block font-mono text-xs text-muted-foreground">
                  {offer.desc}
                </span>
                <span className="mt-2 block font-mono text-xs text-muted-foreground">
                  本局词条：{replacing ? relics.length : relics.length + 1} /{" "}
                  {MAX_RELIC_SLOTS}
                </span>
              </div>
            </div>
          ) : null}

          {/* 生命 / 内存祭坛：回报预览条 */}
          {!replacing && altarType !== "relic" ? (
            <div className="relative mx-auto mt-4 w-full max-w-md">
              <div className="flex items-center gap-3 rounded-lg border-2 border-primary/40 bg-background/70 p-4 shadow-md">
                {altarType === "life" ? (
                  <Droplet className="h-8 w-8 shrink-0 text-primary" />
                ) : (
                  <MemoryStick className="h-8 w-8 shrink-0 text-primary" />
                )}
                <span>
                  <span className="block font-display text-lg font-bold">
                    {altarType === "life" ? "回报 · 生命 +30" : "回报 · 内存上限 +2"}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {altarType === "life"
                      ? "献出本局碎片换一口血，回血不吃上限溢出。"
                      : "献一点血（至少留 1 点），此后每层内存上限都高 2。"}
                  </span>
                </span>
              </div>
            </div>
          ) : null}

          {replacing && offer ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {relics.map((relic) => {
                const style = RELIC_SCHOOL_STYLE[relic.school]
                return (
                  <li key={relic.id}>
                    <button
                      type="button"
                      onClick={() => onReplace(relic.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border border-border bg-background/40 p-3 text-left transition hover:border-destructive/60 focus-visible:outline-none focus-visible:shadow-focus",
                        !lowSpec && "hover:-translate-y-1 hover:shadow-md",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          style.dot,
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block font-display text-sm font-bold">
                          {relic.name}
                        </span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {relic.desc}
                        </span>
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                        丢掉
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {altarType === "relic" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onChooseCost("blood")}
                      disabled={locked}
                      className={cn(
                        "flex h-full flex-col gap-1 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:shadow-focus",
                        cost === "blood"
                          ? "border-destructive bg-destructive/15 shadow-md"
                          : locked
                            ? "cursor-not-allowed border-border bg-foreground/5 opacity-50"
                            : "border-border bg-background/40 hover:border-destructive/60 hover:shadow-md",
                        !lowSpec && !locked && "hover:-translate-y-1",
                      )}
                    >
                      <span className="flex items-center gap-1.5 font-display text-base font-bold">
                        <Droplet className="h-4 w-4 text-destructive" />
                        血祭
                        {cost === "blood" ? (
                          <span className="ml-auto font-mono text-xs text-destructive">
                            已选
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        立刻献出 {bloodToll} 点血（现在 {playerHp} / {playerMaxHp}）。
                        不会把人扣死，最多扣到剩 1 血。
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onChooseCost("curse")}
                      disabled={locked}
                      className={cn(
                        "flex h-full flex-col gap-1 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:shadow-focus",
                        cost === "curse"
                          ? "border-destructive bg-destructive/15 shadow-md"
                          : locked
                            ? "cursor-not-allowed border-border bg-foreground/5 opacity-50"
                            : "border-border bg-background/40 hover:border-destructive/60 hover:shadow-md",
                        !lowSpec && !locked && "hover:-translate-y-1",
                      )}
                    >
                      <span className="flex items-center gap-1.5 font-display text-base font-bold">
                        <Skull className="h-4 w-4 text-destructive" />
                        诅咒
                        {cost === "curse" ? (
                          <span className="ml-auto font-mono text-xs text-destructive">
                            已选
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        背一个诅咒，下一层敌人攻击 +30%，打完那一层自动散掉。
                      </span>
                    </button>
                  </>
                ) : null}

                {altarType === "life" ? (
                  <button
                    type="button"
                    onClick={() => onChooseCost("shard")}
                    disabled={locked || !canPayLife}
                    className={cn(
                      "flex h-full flex-col gap-1 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:shadow-focus sm:col-span-2",
                      cost === "shard"
                        ? "border-primary bg-primary/15 shadow-md"
                        : locked || !canPayLife
                          ? "cursor-not-allowed border-border bg-foreground/5 opacity-50"
                          : "border-border bg-background/40 hover:border-primary/60 hover:shadow-md",
                      !lowSpec && !locked && canPayLife && "hover:-translate-y-1",
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-display text-base font-bold">
                      <Coins className="h-4 w-4 text-primary" />
                      投进 {lifeCost} 枚碎片
                      {cost === "shard" ? (
                        <span className="ml-auto font-mono text-xs text-primary">
                          已献
                        </span>
                      ) : (
                        <span className="ml-auto font-mono text-xs text-muted-foreground">
                          余额 {shards}
                          {!canPayLife ? ` · 还差 ${lifeCost - shards}` : ""}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      碎片是本局捡的，花掉不心疼；换回来的血直接进血条。
                    </span>
                  </button>
                ) : null}

                {altarType === "memory" ? (
                  <button
                    type="button"
                    onClick={() => onChooseCost("hp")}
                    disabled={locked}
                    className={cn(
                      "flex h-full flex-col gap-1 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:shadow-focus sm:col-span-2",
                      cost === "hp"
                        ? "border-destructive bg-destructive/15 shadow-md"
                        : locked
                          ? "cursor-not-allowed border-border bg-foreground/5 opacity-50"
                          : "border-border bg-background/40 hover:border-destructive/60 hover:shadow-md",
                      !lowSpec && !locked && "hover:-translate-y-1",
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-display text-base font-bold">
                      <Droplet className="h-4 w-4 text-destructive" />
                      献出 {memoryHpCost} 点血
                      {cost === "hp" ? (
                        <span className="ml-auto font-mono text-xs text-destructive">
                          已献
                        </span>
                      ) : (
                        <span className="ml-auto font-mono text-xs text-muted-foreground">
                          现在 {playerHp} / {playerMaxHp}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      至少给你留 1 点血，不会把人献死；上限提升此后每层都算。
                    </span>
                  </button>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <p className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  不想付代价就直接走，什么也不会发生。
                </p>
                <button
                  type="button"
                  onClick={onLeave}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-primary/60 bg-primary/10 px-3 py-1.5 font-mono text-xs font-bold text-primary transition hover:border-primary focus-visible:outline-none focus-visible:shadow-focus"
                >
                  不献祭，离开
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
