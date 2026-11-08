import { useEffect } from "react"

import { cn } from "@/lib/utils"

type CacheBoxOverlayProps = {
  /** 各格存量（左侧紧凑排列，长度 ≤total；缺位 = 空格） */
  slots: number[]
  total: number
  /** 本层剩余免费存入次数 */
  depositLeft: number
  canDeposit: boolean
  canBurn: boolean
  /** 每格存入量 / 取出门票 / 清空额外奖励 */
  per: number
  takeCost: number
  burnBonus: number
  /** 当前内存余额（顶栏口径，向上取整） */
  memory: number
  /** 低配模式：浮层不做入场动效 */
  lowSpec?: boolean
  onDeposit: () => void
  onTake: (slotIdx: number) => void
  onBurn: () => void
  onDismiss: () => void
}

/**
 * 缓存电池盒浮层（core-experience-pack2.md 二，Shop 骨架窄版）：
 * 三格槽位（每格「取出」钮）+ 底部「存入 / 清空」。键盘 1/2/3 = 取对应槽，Esc 合上。
 */
export function CacheBoxOverlay({
  slots,
  total,
  depositLeft,
  canDeposit,
  canBurn,
  per,
  takeCost,
  burnBonus,
  memory,
  lowSpec = false,
  onDeposit,
  onTake,
  onBurn,
  onDismiss,
}: CacheBoxOverlayProps) {
  /* 浮层打开时键盘由它接管：数字 1/2/3 取对应槽，Esc 合上（同款惯例） */
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true
      if (typing) return
      if (ev.key === "Escape") {
        ev.preventDefault()
        onDismiss()
        return
      }
      const index = Number.parseInt(ev.key, 10)
      if (Number.isFinite(index) && index >= 1 && index <= total) {
        ev.preventDefault()
        if ((slots[index - 1] ?? 0) > 0) onTake(index - 1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onDismiss, onTake, slots, total])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="缓存电池"
        className={cn(
          "max-h-full w-full max-w-sm animate-in overflow-y-auto rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md",
          !lowSpec && "fade-in slide-in-from-bottom-4 duration-300",
        )}
      >
        <p className="font-mono text-xs text-sys-cache">缓存电池 · 本层蓄水池 · 换层清空</p>
        <h2 className="mt-1 font-display text-lg font-bold sm:text-xl">电池盒</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          攒进盒里的内存随时取回，还能让余额短暂超过上限——但取出每次花 {takeCost} 内存门票。
        </p>

        <ul className="mt-4 grid grid-cols-3 gap-2">
          {Array.from({ length: total }, (_, index) => {
            const stored = slots[index] ?? 0
            const filled = stored > 0
            return (
              <li
                key={index}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-md border p-2.5",
                  filled
                    ? "border-sys-cache/60 bg-sys-cache/10"
                    : "border-dashed border-border bg-background/40",
                )}
              >
                <span
                  className={cn(
                    "font-mono text-lg font-bold tabular-nums",
                    filled ? "text-sys-cache" : "text-muted-foreground/50",
                  )}
                >
                  {filled ? stored : "—"}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  槽 {index + 1}
                  <span className="ml-1 opacity-70">[{index + 1}]</span>
                </span>
                <button
                  type="button"
                  onClick={() => onTake(index)}
                  disabled={!filled}
                  title={filled ? `取回 ${stored} 内存（门票 ${takeCost}，可超限）` : "空槽"}
                  className={cn(
                    "w-full rounded-sm border px-1 py-1 font-mono text-[10px] transition touch-manipulation focus-visible:outline-none focus-visible:shadow-focus",
                    filled
                      ? "border-sys-cache/60 text-sys-cache hover:bg-sys-cache/10"
                      : "cursor-not-allowed border-border text-muted-foreground/50",
                  )}
                >
                  取出 −{takeCost}内存
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-3 rounded-md border border-border bg-background/40 px-3 py-2 font-mono text-xs text-muted-foreground">
          当前内存 <span className="font-bold text-foreground tabular-nums">{memory}</span> ·
          键盘 <span className="text-sys-cache">1 / 2 / 3</span> = 取对应槽
        </div>

        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onDeposit}
            disabled={!canDeposit}
            title={
              canDeposit
                ? `从内存搬 ${per} 进电池盒（免费）`
                : depositLeft <= 0
                  ? "本层存入次数已用完 · 换层回满"
                  : slots.length >= total
                    ? "电池盒已满"
                    : `内存余额不足 ${per}`
            }
            className={cn(
              "flex-1 rounded-sm border px-2.5 py-2 font-mono text-xs font-bold transition touch-manipulation focus-visible:outline-none focus-visible:shadow-focus",
              canDeposit
                ? "border-sys-cache bg-sys-cache/10 text-sys-cache hover:bg-sys-cache/20"
                : "cursor-not-allowed border-border text-muted-foreground/50",
            )}
          >
            存入 {per}（本层剩 {depositLeft}）
          </button>
          <button
            type="button"
            onClick={onBurn}
            disabled={!canBurn}
            title={canBurn ? `倒空全部存量，换额外 +${burnBonus} 内存（可超限）` : "盒里没东西可清空"}
            className={cn(
              "flex-1 rounded-sm border px-2.5 py-2 font-mono text-xs font-bold transition touch-manipulation focus-visible:outline-none focus-visible:shadow-focus",
              canBurn
                ? "border-sys-network/70 bg-sys-network/10 text-sys-network hover:bg-sys-network/20"
                : "cursor-not-allowed border-border text-muted-foreground/50",
            )}
          >
            清空 +{burnBonus}
          </button>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 w-full rounded-sm border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
        >
          合上电池盒
        </button>
      </div>
    </div>
  )
}
