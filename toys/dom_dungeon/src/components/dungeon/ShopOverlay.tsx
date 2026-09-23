import { useState } from "react"
import {
  Cpu,
  Gem,
  Heart,
  Layers,
  MemoryStick,
  PackageOpen,
  RefreshCw,
  Sparkles,
  Star,
  Store,
  Trash2,
  Wrench,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { ShopItem, ShopItemKind } from "@/pages/Dungeon/useDungeon"

type ShopOverlayProps = {
  /** 本局临时碎片余额 */
  shards: number
  stock: ShopItem[]
  playerHp: number
  playerMaxHp: number
  /** 词条槽已满，词条商品买不了 */
  relicSlotsFull: boolean
  /** 深化包：当前内存碎片数（0 时整理服务置灰） */
  memFrags: number
  /** 低配模式：浮层不做多余动效 */
  lowSpec?: boolean
  onBuy: (itemId: string) => void
  onLeave: () => void
}

/* 种子货架（seed-system.md 七）：固定件 + 槽位随种子生成的词条件 */
const KIND_ICON: Record<ShopItemKind, typeof Sparkles> = {
  "relic-common": Sparkles,
  "relic-rare": Sparkles,
  "relic-epic": Star,
  heal: Heart,
  memory: Cpu,
  reroll: RefreshCw,
  remove: Trash2,
  memcap: MemoryStick,
  slot: Layers,
  seed: RefreshCw,
  defrag: Wrench,
}

function blockedReason(
  item: ShopItem,
  fullHp: boolean,
  relicSlotsFull: boolean,
  memFrags: number,
): string | null {
  const relicShop = item.kind.startsWith("relic-")
  if (item.kind === "heal" && fullHp) return "血是满的"
  /* 深化包：没有碎片时整理服务没有意义 */
  if (item.kind === "defrag" && memFrags <= 0) return "没有碎片可整理"
  if (relicShop && relicSlotsFull) return "词条位已满"
  if (relicShop && !item.relic) return "已售罄"
  return null
}

export function ShopOverlay({
  shards,
  stock,
  playerHp,
  playerMaxHp,
  relicSlotsFull,
  memFrags,
  lowSpec = false,
  onBuy,
  onLeave,
}: ShopOverlayProps) {
  const fullHp = playerHp >= playerMaxHp
  /* 表现包：购买先进确认弹窗，点「确认」才真正扣碎片 */
  const [pending, setPending] = useState<ShopItem | null>(null)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="局内商店"
        className={cn(
          "max-h-full w-full max-w-2xl animate-in overflow-y-auto rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md sm:p-5",
          /* 表现包·场景切换：商店从右侧滑入 */
          !lowSpec && "fade-in slide-in-from-right-8 duration-300",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-mono text-xs text-primary">
              <Store className="h-3.5 w-3.5" />
              局内商店 · 只在本局开张
            </p>
            <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
              路上捡到一台没人管的自动售货机
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              本局攒的临时碎片在这儿花掉，没花完的结算时按 1:1 折算。
            </p>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-primary/60 bg-primary/10 px-2.5 py-1.5 font-mono text-sm font-bold text-primary">
            <Gem className="h-4 w-4" />
            <span className="tabular-nums">{shards}</span>
            <span className="font-normal opacity-80">碎片</span>
          </span>
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {stock.map((item) => {
            const Icon = KIND_ICON[item.kind]
            const missing = Math.max(0, item.price - shards)
            const blocked = blockedReason(item, fullHp, relicSlotsFull, memFrags)
            const label = item.bought
              ? "已购买"
              : blocked
                ? blocked
                : missing > 0
                  ? `还差 ${missing}`
                  : "买下"
            const canBuy = !item.bought && !blocked && missing === 0

            return (
              <li
                key={item.id}
                className={cn(
                  "relative flex min-h-full items-start gap-3 rounded-md border p-3 transition",
                  canBuy
                    ? "border-border bg-background/40 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md"
                    : "border-border bg-foreground/5 opacity-60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-sm border",
                    canBuy
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-foreground/5 text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-sm font-bold">
                      {item.title}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-bold text-primary">
                      <Gem className="h-3 w-3" />
                      <span className="tabular-nums">{item.price}</span>
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {item.desc}
                    {item.relic ? ` · ${item.relic.code}` : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPending(item)}
                    disabled={!canBuy}
                    className={cn(
                      "mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-xs transition focus-visible:outline-none focus-visible:shadow-focus",
                      canBuy
                        ? "border-primary bg-primary text-primary-foreground hover:opacity-90"
                        : "cursor-not-allowed border-border bg-foreground/5 text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>

        <div
          aria-hidden
          className="mt-3 h-1.5 rounded-full border border-dashed border-border"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <PackageOpen className="h-3.5 w-3.5" />
            一件不买也能走，碎片留着一样算。
          </p>
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex items-center gap-1.5 rounded-sm border border-primary/60 bg-primary/10 px-3 py-1.5 font-mono text-xs font-bold text-primary transition hover:border-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            离开
          </button>
        </div>
      </div>

      {/* 购买确认弹窗（表现包）：写清花多少、买什么，确认才扣 */}
      {pending ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background/80 p-3 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="确认购买"
            className={cn(
              "w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 rounded-lg border border-primary/50 bg-card p-4 text-card-foreground shadow-md duration-200",
            )}
          >
            <p className="font-display text-lg font-bold">{pending.title}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {pending.desc}
            </p>
            <p className="mt-3 rounded-md border border-border bg-background/40 px-3 py-2 font-mono text-sm">
              花费{" "}
              <span className="font-bold text-primary tabular-nums">
                {pending.price}
              </span>{" "}
              碎片，当前余额 <span className="tabular-nums">{shards}</span>
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex-1 rounded-sm border border-border px-3 py-2 font-mono text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-none"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = pending
                  setPending(null)
                  onBuy(target.id)
                }}
                className="flex-1 rounded-sm border border-primary bg-primary px-3 py-2 font-mono text-xs font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
              >
                确认购买
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
