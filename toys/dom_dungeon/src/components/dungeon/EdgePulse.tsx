import { cn } from "@/lib/utils"

type EdgePulseProps = {
  /** 内存 4 区间：卡顿黄弱呼吸 / 阻塞红强呼吸，充裕与稳定不渲染 */
  zone: "abundant" | "normal" | "tense" | "exhausted"
  /** 低配模式：保留静态警戒描边、关掉呼吸动画（页面传入） */
  lowSpec?: boolean
}

/**
 * 屏幕边缘脉冲（ui-pack.md 一）：内存吃紧时整个屏幕边缘进入警戒色，
 * 把「内存快没了」从一个小数字升级成全身感知。纯氛围蒙层，不挡任何操作。
 * 呼吸复用 animate-pulse-soft（reduced-motion 下全局关闭动画）。
 */
export function EdgePulse({ zone, lowSpec = false }: EdgePulseProps) {
  if (zone !== "tense" && zone !== "exhausted") return null
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 z-40",
        zone === "exhausted" ? "edge-danger" : "edge-tense",
        !lowSpec && "animate-pulse-soft",
      )}
    />
  )
}
