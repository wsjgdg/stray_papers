import { useState, type CSSProperties } from "react"

import {
  POPUP_JAM_X_TAPS,
  type ScreenJam,
} from "@/pages/Dungeon/useDungeon"
import { cn } from "@/lib/utils"

type ScreenJamWindowProps = {
  /** 引擎侧的糊屏弹窗（id 变 = 重新挂载重播飞入） */
  jam: ScreenJam
  /** 距爆炸剩余比例 1→0，画底部倒计时细条 */
  ratio: number
  /** 按主动技按钮实测 rect 换算的 fixed 定位（右下锚点） */
  anchor: { right: number; bottom: number }
  lowSpec: boolean
  /** 拖甩成功：uid = 松手在敌人卡上（糊脸砸人）；null = 甩出屏幕（碎片 +2） */
  onFling: (uid: string | null) => void
  /** 点一下 × */
  onTapX: () => void
  /** 恶意弹窗假「立即领取」点击（skeuo-boss-pack.md 二；引擎每窗只骗一次） */
  onClaim?: () => void
}

/** 松手/悬停点下是哪个敌人卡（跳过弹窗自己——elementsFromPoint 顶层永远是弹窗） */
function enemyUidUnder(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const card = el.closest?.("[data-enemy-uid]")
    const uid = card?.getAttribute("data-enemy-uid")
    if (uid) return uid
  }
  return null
}

/** 拖出多远算甩成功（px） */
const FLING_DIST_PX = 150

/** 恶意弹窗 × 的 6 个锚点（占窗口百分比：标题栏右/左、正文四角；
 *  槽位 = (POPUP_JAM_X_TAPS − xLeft) % 6，每点一下跳下一格，零引擎字段） */
const JAM_X_SLOTS: { left: string; top: string }[] = [
  { left: "84%", top: "12%" },
  { left: "6%", top: "12%" },
  { left: "6%", top: "44%" },
  { left: "84%", top: "44%" },
  { left: "6%", top: "76%" },
  { left: "84%", top: "76%" },
]

/**
 * 糊屏弹窗（popup-jam-pack.md 二）：垃圾广告窗口物理盖住主动技按钮。
 * 拖离 ≥150px 松手 = 甩出；点 × 三下 = 关掉；不动 8 秒 = 引擎侧爆炸。
 * 全部 pointer 事件 stopPropagation——战斗区的滑动闪避靠 pointer 判定（假按钮同款教训）。
 * 恶意变体（skeuo-boss-pack.md 二）：× 每点一下跳锚点（200ms 位移，低配跳变）、
 * 假「立即领取」变成可点的陷阱。
 */
export function ScreenJamWindow({
  jam,
  ratio,
  anchor,
  lowSpec,
  onFling,
  onTapX,
  onClaim,
}: ScreenJamWindowProps) {
  const [drag, setDrag] = useState({ dx: 0, dy: 0 })
  const [entered, setEntered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<{ x0: number; y0: number } | null>(null)
  /** 拖拽中指针下压着的敌人卡（悬停提示「砸它一脸」） */
  const [overUid, setOverUid] = useState<string | null>(null)
  /** 上当次数（>0 时窗口抖一下，低配不抖；key 重挂载重播） */
  const [shakeSeq, setShakeSeq] = useState(0)

  const malicious = !!jam.malicious
  const slot = malicious
    ? ((POPUP_JAM_X_TAPS - jam.xLeft) % JAM_X_SLOTS.length +
        JAM_X_SLOTS.length) %
      JAM_X_SLOTS.length
    : 0

  const closeX = (cls?: string, style?: CSSProperties) => (
    <button
      type="button"
      aria-label={`关闭弹窗，还要点 ${jam.xLeft} 下`}
      onPointerDown={(ev) => ev.stopPropagation()}
      onPointerUp={(ev) => ev.stopPropagation()}
      onClick={(ev) => {
        ev.stopPropagation()
        onTapX()
      }}
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-destructive font-mono text-xs font-bold text-destructive transition active:scale-90",
        cls,
      )}
      style={style}
    >
      ×{jam.xLeft}
    </button>
  )

  return (
    <div
      className="pointer-events-none fixed z-40"
      style={{ right: anchor.right, bottom: anchor.bottom }}
    >
      <div
        role="dialog"
        aria-label="垃圾广告弹窗：拖出屏幕甩掉，或点右上角 × 三下关掉"
        className={cn(
          "pointer-events-auto relative w-56 cursor-grab touch-none select-none rounded-md border-2 border-destructive bg-card p-2 text-card-foreground shadow-glow-red",
          dragging && "cursor-grabbing",
          !lowSpec && !entered && "jam-in",
        )}
        style={{
          transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(-1deg)`,
          transition: dragging
            ? "none"
            : "transform 240ms cubic-bezier(0.2, 1.4, 0.4, 1)",
        }}
        onAnimationEnd={() => setEntered(true)}
        onPointerDown={(ev) => {
          ev.stopPropagation()
          ev.currentTarget.setPointerCapture?.(ev.pointerId)
          setStart({ x0: ev.clientX, y0: ev.clientY })
          setDragging(true)
        }}
        onPointerMove={(ev) => {
          ev.stopPropagation()
          if (!start) return
          setDrag({ dx: ev.clientX - start.x0, dy: ev.clientY - start.y0 })
          setOverUid(enemyUidUnder(ev.clientX, ev.clientY))
        }}
        onPointerUp={(ev) => {
          ev.stopPropagation()
          const moved = Math.hypot(drag.dx, drag.dy)
          setDragging(false)
          setStart(null)
          setOverUid(null)
          if (moved >= FLING_DIST_PX) {
            /* 松手在敌人卡上 = 糊脸砸人；空处 = 甩出屏幕换碎片（ui-arsenal-pack.md 一） */
            onFling(enemyUidUnder(ev.clientX, ev.clientY))
            return
          }
          setDrag({ dx: 0, dy: 0 })
        }}
        onPointerCancel={() => {
          setDragging(false)
          setStart(null)
          setOverUid(null)
          setDrag({ dx: 0, dy: 0 })
        }}
      >
        {/* 上当抖动包一层内容壳：抖动 transform 不与拖拽 transform 互踩 */}
        <div
          key={shakeSeq}
          className={cn(shakeSeq > 0 && !lowSpec && "trap-shake")}
        >
          {/* 标题栏（恶意弹窗的 × 不在这里，在下面的瞬移锚点层） */}
          <div className="flex items-center justify-between gap-2 border-b border-border pb-1">
            <span className="truncate font-mono text-xs font-bold text-destructive">
              ⚠ 您已被选中.exe
            </span>
            {!malicious ? closeX() : null}
          </div>

          {/* 正文：经典垃圾广告话术 + 假按钮（恶意时是能点的陷阱） */}
          <p className="pt-1.5 text-center font-mono text-xs leading-snug">
            恭喜！您是
            <span className="font-bold text-destructive"> 1,000,000 </span>
            位访客！
          </p>
          {malicious ? (
            <button
              type="button"
              aria-label="立即领取——它根本不是领东西的按钮"
              onPointerDown={(ev) => ev.stopPropagation()}
              onPointerUp={(ev) => ev.stopPropagation()}
              onClick={(ev) => {
                ev.stopPropagation()
                if (jam.claimTrapUsed) return
                onClaim?.()
                if (!lowSpec) setShakeSeq((seq) => seq + 1)
              }}
              className="mx-auto mt-1.5 block w-fit rounded-sm bg-destructive px-2 py-0.5 font-mono text-xs font-bold text-destructive-foreground transition hover:brightness-125 hover:shadow-glow-red active:scale-95"
            >
              立即领取 →
            </button>
          ) : (
            <span className="pointer-events-none mx-auto mt-1.5 block w-fit rounded-sm bg-destructive px-2 py-0.5 font-mono text-xs font-bold text-destructive-foreground">
              立即领取 →
            </span>
          )}
          <p
            className={cn(
              "mt-1.5 text-center font-mono text-[10px]",
              dragging && overUid
                ? "font-bold text-primary"
                : "text-muted-foreground",
            )}
          >
            {dragging && overUid
              ? "松手砸它一脸！"
              : "本窗口正在占用你的技能按钮"}
          </p>

          {/* 爆炸倒计时细条 */}
          <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-muted">
            <div
              className="h-full bg-destructive transition-[width] duration-200 ease-linear"
              style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
            />
          </div>
        </div>

        {/* 恶意弹窗的 ×：挂在锚点层，每点一下跳下一格（200ms 位移，低配跳变） */}
        {malicious
          ? closeX("absolute z-10", {
              left: JAM_X_SLOTS[slot].left,
              top: JAM_X_SLOTS[slot].top,
              transition: lowSpec
                ? "none"
                : "left 200ms ease, top 200ms ease, transform 100ms ease",
            })
          : null}
      </div>
    </div>
  )
}
