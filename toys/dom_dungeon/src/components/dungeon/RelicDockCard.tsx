import { memo, useEffect, useState, type CSSProperties } from "react"
import { Bookmark } from "lucide-react"

import {
  DockRings,
  PerkBadges,
  useAnchorDrag,
} from "@/components/dungeon/FloatingAction"
import {
  RELIC_SCHOOL_LABEL,
  RELIC_SCHOOL_STYLE,
  type RelicSchool,
} from "@/lib/dungeonData"
import {
  anchorRenderBox,
  type Anchor,
  type DockConfig,
  type DockModule,
  type HudPerkId,
} from "@/pages/Dungeon/useDungeon"
import { cn } from "@/lib/utils"

const SCHOOL_ORDER: RelicSchool[] = ["script", "style", "network", "cache"]

export type RelicDockCardProps = {
  /** 非 default 才有值（default 态不渲染本卡，保持顶栏内嵌现状） */
  anchor: Anchor
  dock: DockConfig
  lowSpec: boolean
  perkIds: HudPerkId[]
  schoolCounts: Record<RelicSchool, number>
  relicTotal: number
  relicSlots: number
  onDock: (module: DockModule, anchor: Anchor) => void
}

/** HUD 构筑包·词条栏浮动小卡：顶栏词条行的轻量只读副本，整卡可拖（同 12px 守卫）。
 *  perf-experience-pack.md C：dock 为 state 引用、perkIds 由 View 按 dock 稳定化、
 *  schoolCounts 是 useMemo、onDock 是 [] 依赖的 useCallback——memo 后战斗 tick 不再重渲染 */
export const RelicDockCard = memo(function RelicDockCard({
  anchor,
  dock,
  lowSpec,
  perkIds,
  schoolCounts,
  relicTotal,
  relicSlots,
  onDock,
}: RelicDockCardProps) {
  const { dragPos, handlers } = useAnchorDrag((picked) => {
    if (picked) onDock("relic", picked)
  })
  const dragging = dragPos !== null

  /* 窗口尺寸变化时锚点重算（锚点坐标是视口百分比） */
  const [, setWinTick] = useState(0)
  useEffect(() => {
    const onResize = () => setWinTick((tick) => tick + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const box = anchorRenderBox(anchor)
  const rootStyle: CSSProperties = {
    left: dragging ? dragPos.x : box.left,
    top: dragging ? dragPos.y : box.top,
    zIndex: 45,
  }

  return (
    <div
      role="note"
      aria-label="词条栏浮卡 · 按住可拖到屏幕边缘换收益"
      title="词条栏浮卡 · 按住拖到屏幕边缘可换收益（拖上已占用位置 = 互换）"
      className={cn(
        "fixed touch-none",
        !dragging &&
          !lowSpec &&
          "motion-safe:transition-[left,top] motion-safe:duration-[280ms]",
        dragging && "-translate-x-1/2 -translate-y-1/2",
      )}
      style={rootStyle}
      {...handlers}
    >
      <DockRings dock={dock} dragging={dragging} pointer={dragPos} />
      <PerkBadges module="relic" perkIds={perkIds} />
      <div className="flex flex-col gap-1 rounded-md border border-border bg-card p-1.5 text-card-foreground shadow-md">
        <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <Bookmark aria-hidden className="h-3 w-3 text-primary" />
          词条
        </span>
        <ol className="flex items-center gap-1.5" aria-label="四系词条数">
          {SCHOOL_ORDER.map((school) => {
            const count = schoolCounts[school]
            return (
              <li
                key={school}
                title={`${RELIC_SCHOOL_LABEL[school]}系词条 ${count} 个`}
                className="flex items-center gap-0.5 font-mono text-xs text-muted-foreground"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    count > 0 ? RELIC_SCHOOL_STYLE[school].dot : "bg-muted-foreground",
                  )}
                />
                {count}
              </li>
            )
          })}
        </ol>
        <p className="font-mono text-xs text-muted-foreground">
          {relicTotal} / {relicSlots} 槽
        </p>
      </div>
    </div>
  )
})
