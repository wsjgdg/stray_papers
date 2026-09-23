import type { ReactNode } from "react"
import { Hand, MoveLeft, MousePointerClick, Timer, X } from "lucide-react"

import { cn } from "@/lib/utils"
import type { QteState } from "@/pages/Dungeon/useDungeon"

type QteOverlayProps = {
  /** 当前进行中的 QTE（null 由外层挡掉，这里恒非空） */
  qte: QteState
  /** 本次 QTE 已走过的墙钟毫秒（hook 里 rAF 驱动） */
  elapsedMs: number
  /** press 类：当前正按住 */
  pressing: boolean
  /** press 类：长按进度 0~1 */
  pressRatio: number
  lowSpec: boolean
  onTap: () => void
  onPopupClick: (popupId: number) => void
  onPressStart: () => void
  onPressEnd: () => void
}

const RING_R = 54
const RING_C = 2 * Math.PI * RING_R

/** 倒计时环：剩余时间在环上缩，最后 1/4 转警报色 */
function CountdownRing({
  ratio,
  urgent,
  children,
}: {
  ratio: number
  urgent: boolean
  children?: ReactNode
}) {
  const clamped = Math.min(1, Math.max(0, ratio))
  return (
    <div className="relative grid h-32 w-32 place-items-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full">
        <circle
          cx="60"
          cy="60"
          r={RING_R}
          fill="none"
          strokeWidth="7"
          className="stroke-border"
        />
        <circle
          cx="60"
          cy="60"
          r={RING_R}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - clamped)}
          transform="rotate(-90 60 60)"
          className={cn(
            "transition-none",
            urgent ? "stroke-destructive" : "stroke-primary",
          )}
        />
      </svg>
      <div className="relative flex flex-col items-center leading-none">
        {children}
      </div>
    </div>
  )
}

const KIND_HINT: Record<QteState["kind"], string> = {
  tap: "狂点下方按钮（空格也行）",
  swipe: "在战斗区向左滑 · 或按 ← 键",
  clicks: "点掉屏幕上每个弹窗的 ×",
  press: "按住屏幕任意处不放（长按空格等价）",
}

/**
 * Boss QTE 中央大字覆盖层（批次二收尾·机制 8）。
 * 只渲染与转发输入，判定全在引擎 reducer 里；暂停时由外层不渲染。
 */
export function QteOverlay({
  qte,
  elapsedMs,
  pressing,
  pressRatio,
  lowSpec,
  onTap,
  onPopupClick,
  onPressStart,
  onPressEnd,
}: QteOverlayProps) {
  const remainingRatio = 1 - Math.min(1, elapsedMs / qte.totalMs)
  const urgent = remainingRatio <= 0.25
  const progressText =
    qte.kind === "press" ? `${Math.round(pressRatio * 100)}%` : `${qte.progress}/${qte.target}`
  const pressValue = qte.kind === "press" ? pressRatio : remainingRatio

  const pressHandlers =
    qte.kind === "press"
      ? {
          onPointerDown: onPressStart,
          onPointerUp: onPressEnd,
          onPointerCancel: onPressEnd,
          onPointerLeave: onPressEnd,
        }
      : undefined

  return (
    <div
      role="alertdialog"
      aria-label="Boss 关键帧操作"
      {...pressHandlers}
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 px-4",
        qte.kind === "clicks" ? "bg-background/40" : "bg-background/70",
        qte.kind === "press" || qte.kind === "clicks" ? "backdrop-blur-[2px]" : "",
        !lowSpec && "animate-in fade-in-0 duration-150",
        qte.kind === "press"
          ? "cursor-pointer touch-none"
          : qte.kind === "tap"
            ? ""
            : "pointer-events-none",
      )}
    >
      <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
        <Timer className="h-3.5 w-3.5" />
        Boss 关键帧
      </p>
      <h2 className="text-center font-display text-4xl font-bold tracking-tight text-foreground drop-shadow-[0_0_18px_rgba(0,229,255,0.35)] sm:text-5xl">
        {qte.title}
      </h2>

      <CountdownRing ratio={pressValue} urgent={urgent}>
        <span className="font-mono text-2xl font-bold text-foreground tabular-nums">
          {progressText}
        </span>
        <span className="mt-1 font-mono text-xs text-muted-foreground">
          {qte.kind === "press" ? "长按进度" : "剩余时间"}
        </span>
      </CountdownRing>

      <p className="flex items-center gap-1.5 text-center font-mono text-sm text-muted-foreground">
        {qte.kind === "tap" ? (
          <MousePointerClick className="h-4 w-4 text-primary" />
        ) : qte.kind === "swipe" ? (
          <MoveLeft className="h-4 w-4 text-primary" />
        ) : qte.kind === "press" ? (
          <Hand className="h-4 w-4 text-primary" />
        ) : (
          <X className="h-4 w-4 text-primary" />
        )}
        {KIND_HINT[qte.kind]}
      </p>

      {qte.kind === "tap" ? (
        <button
          type="button"
          onPointerDown={(ev) => {
            ev.stopPropagation()
            onTap()
          }}
          className={cn(
            "pointer-events-auto mt-2 select-none rounded-full bg-primary px-10 py-5 font-display text-2xl font-bold text-primary-foreground shadow-md shadow-glow-cyan",
            "focus-visible:outline-none focus-visible:shadow-focus",
            !lowSpec && "active:scale-95 transition-transform duration-100",
          )}
        >
          连点我！
        </button>
      ) : null}

      {qte.kind === "press" ? (
        <div
          aria-hidden
          className={cn(
            "mt-2 h-3 w-64 overflow-hidden rounded-full border border-border bg-muted",
            pressing && "border-primary/60",
          )}
        >
          <div
            className={cn(
              "h-full bg-primary",
              pressRatio >= 1 && "bg-primary",
              !lowSpec && "transition-none",
            )}
            style={{ width: `${Math.round(pressRatio * 100)}%` }}
          />
        </div>
      ) : null}

      {qte.kind === "clicks" && qte.popups
        ? qte.popups.map((popup) => (
            <button
              key={popup.id}
              type="button"
              onPointerDown={(ev) => {
                ev.stopPropagation()
                onPopupClick(popup.id)
              }}
              aria-label="关掉这个弹窗"
              className={cn(
                "pointer-events-auto absolute w-28 select-none rounded-md border border-border bg-card p-2 text-left shadow-md",
                !lowSpec && "animate-in fade-in zoom-in-95 duration-150",
              )}
              style={{
                left: `${popup.x}%`,
                top: `${popup.y}%`,
              }}
            >
              <span className="flex items-center justify-between gap-1">
                <span className="truncate font-mono text-xs text-muted-foreground">
                  popup
                </span>
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-destructive/60 bg-destructive/10 text-destructive">
                  <X className="h-3 w-3" />
                </span>
              </span>
              <span className="mt-1 block font-display text-xs font-bold text-foreground">
                恭喜中奖！
              </span>
            </button>
          ))
        : null}
    </div>
  )
}
