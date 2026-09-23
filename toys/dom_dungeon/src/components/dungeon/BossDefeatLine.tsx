import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { BossLine } from "@/pages/Dungeon/useDungeon"

/** 被击败台词的去重 key（`bossLineKey` 对 defeat 触发返回的就是 trigger 本身） */
const DEFEAT_LINE_KEY = "defeat"
/** 停留时长：够玩家看清一行字，又不至于压住下面的三选一 */
const HOLD_MS = 1200
/** 淡出时长 */
const FADE_MS = 320

type BossDefeatLineProps = {
  /** 当前这句台词 */
  line: BossLine | null
  /** Boss 面板是否还挂在屏幕上：还挂着就由面板显示，这里绝不重复显示 */
  panelMounted: boolean
  lowSpec: boolean
}

/**
 * Boss 被击败台词的收尾浮层。
 *
 * Boss 一倒下，同一次 tick 里本层就判清并翻到三选一 / 结算，Boss 面板随即卸载，
 * 面板里那句「被击败」只存在一帧。这里把这一类台词提到页面层级再显示一次：
 * 只读台词、只做展示，不拦截点击、不碰任何战斗状态与计时。
 */
export function BossDefeatLine(p: BossDefeatLineProps) {
  /* 面板已卸载 + 当前正好是「被击败」那句 → 才轮到本浮层接管 */
  const active = !p.panelMounted && p.line?.key === DEFEAT_LINE_KEY ? p.line : null
  const [shown, setShown] = useState<BossLine | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!active) {
      setShown(null)
      setLeaving(false)
      return
    }
    setShown(active)
    setLeaving(false)
    const hold = window.setTimeout(() => setLeaving(true), HOLD_MS)
    const drop = window.setTimeout(
      () => setShown(null),
      p.lowSpec ? HOLD_MS : HOLD_MS + FADE_MS,
    )
    return () => {
      window.clearTimeout(hold)
      window.clearTimeout(drop)
    }
  }, [active, p.lowSpec])

  if (!shown) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4 sm:top-24"
    >
      <p
        key={shown.seq}
        className={cn(
          "max-w-lg rounded-md border border-primary/40 bg-card/90 px-4 py-2 text-center font-mono text-sm italic text-primary shadow-lg backdrop-blur",
          !p.lowSpec && "transition-opacity duration-300",
          !p.lowSpec && (leaving ? "opacity-0" : "opacity-100"),
          !p.lowSpec && "animate-in fade-in",
        )}
      >
        “{shown.text}”
      </p>
    </div>
  )
}
