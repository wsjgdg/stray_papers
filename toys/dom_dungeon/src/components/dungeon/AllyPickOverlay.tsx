import { useEffect } from "react"

import { cn } from "@/lib/utils"
import { ALLY_DEFS, type AllyKind } from "@/pages/Dungeon/useDungeon"

/** 四系规范（ui-spec.md 二）：三种援军分别挂脚本 / 样式 / 缓存系别色与图标形状 */
const ALLY_SCHOOL: Record<
  AllyKind,
  { border: string; text: string; hoverGlow: string; shape: string }
> = {
  sprite: {
    border: "border-sys-script/60",
    text: "text-sys-script",
    hoverGlow: "hover:shadow-glow-cyan",
    shape: "rounded-sm",
  },
  guard: {
    border: "border-sys-style/60",
    text: "text-sys-style",
    hoverGlow: "hover:shadow-glow-purple",
    shape: "rounded-lg",
  },
  bug: {
    border: "border-sys-cache/60",
    text: "text-sys-cache",
    hoverGlow: "hover:shadow-glow-green",
    shape: "rounded-full",
  },
}

/* 固定展示顺序（core-experience-pack2.md 一）：精灵 → 守卫 → 缓存虫 */
const ALLY_ORDER: AllyKind[] = ["sprite", "guard", "bug"]

type AllyPickOverlayProps = {
  /** 召唤花费的内存 */
  cost: number
  /** 低配模式：浮层不做入场动效 */
  lowSpec?: boolean
  onSummon: (kind: AllyKind) => void
  onCancel: () => void
}

/**
 * 援军三选一浮层（core-experience-pack2.md 一，沿用 Shop/Altar 浮层骨架）：
 * 点卡召唤（引擎再校验余额/页位，失败横幅不关面板）；Esc / 取消 = 不花一分钱合上。
 */
export function AllyPickOverlay({
  cost,
  lowSpec = false,
  onSummon,
  onCancel,
}: AllyPickOverlayProps) {
  /* 浮层打开时键盘由它接管：Esc 取消（同款惯例） */
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
        onCancel()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="召唤援军"
        className={cn(
          "max-h-full w-full max-w-lg animate-in overflow-y-auto rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md sm:p-5",
          !lowSpec && "fade-in slide-in-from-bottom-4 duration-300",
        )}
      >
        <p className="font-mono text-xs text-primary">援军召唤 · 花内存开一张空页住队友</p>
        <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
          召唤援军（{cost} 内存）
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          援军页不吃维持费、不会崩溃——但也不产出：它是纯粹的光环位，冻结它就停摆，关掉它就下线。
        </p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {ALLY_ORDER.map((kind) => {
            const def = ALLY_DEFS[kind]
            const style = ALLY_SCHOOL[kind]
            return (
              <li key={kind}>
                <button
                  type="button"
                  onClick={() => onSummon(kind)}
                  className={cn(
                    "flex h-full w-full flex-col items-start gap-2 rounded-md border bg-background/40 p-3 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:shadow-focus",
                    style.border,
                    !lowSpec && style.hoverGlow,
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid h-9 w-9 place-items-center border text-lg",
                      style.border,
                      style.shape,
                      style.text,
                    )}
                  >
                    {def.icon}
                  </span>
                  <span className={cn("font-display text-sm font-bold", style.text)}>
                    {def.name}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{def.effect}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
          <p className="font-mono text-xs text-muted-foreground">
            余额不足会被拒（横幅提示），页满了也进不来。
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
