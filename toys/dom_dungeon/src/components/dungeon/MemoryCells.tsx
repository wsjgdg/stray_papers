import { cn } from "@/lib/utils"

type MemoryCellsProps = {
  /** 当前余额（HUD 侧已向上取整） */
  memory: number
  /** 上限（内存上限浮动，3~20 格） */
  memoryMax: number
  /** 内存 4 区间：点亮色判定与顶栏徽章同源（ui-pack.md 一） */
  memoryZone: "abundant" | "normal" | "tense" | "exhausted"
  /** 核心体验包 v2：缓存取出导致的超上限点数（满格外补「+N」金角标） */
  overflow?: number
}

/** 点亮格四档配色：与 DungeonTopBar 内存徽章的 4 色一一对应 */
const FILLED_BY_ZONE: Record<MemoryCellsProps["memoryZone"], string> = {
  abundant: "bg-primary",
  normal: "bg-foreground/80",
  tense: "bg-sys-network",
  exhausted: "bg-destructive",
}

/**
 * 内存格子条（ui-pack.md 一）：每格 1 点内存，点亮 = 余额、熄灭 = 空闲。
 * 离散读数比连续条更精确：花掉 1 格看得见、耗尽前几格黄/红预警看得见。
 * 纯读数组件，不拦截手势（外层徽章保留 title 说明）。
 */
export function MemoryCells({
  memory,
  memoryMax,
  memoryZone,
  overflow = 0,
}: MemoryCellsProps) {
  const filled = Math.min(memoryMax, Math.max(0, memory))
  return (
    <span
      role="img"
      aria-label={`内存 ${filled}${overflow > 0 ? ` +${overflow}` : ""} / ${memoryMax}`}
      className="flex items-center gap-px"
    >
      {Array.from({ length: memoryMax }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-2.5 w-1 rounded-sm",
            index < filled ? FILLED_BY_ZONE[memoryZone] : "bg-foreground/10",
          )}
        />
      ))}
      {/* 核心体验包 v2：缓存取出的超上限余额——格条夹满后挂金角标 */}
      {overflow > 0 ? (
        <span
          title={`缓存取出超上限 +${overflow}（区间判定与显示夹到上限，扣减从真实值扣）`}
          className="ml-0.5 rounded-sm border border-sys-network/70 bg-sys-network/10 px-0.5 font-mono text-[10px] font-bold leading-4 text-sys-network"
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  )
}
