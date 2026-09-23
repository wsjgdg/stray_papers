import { useEffect, useState } from "react"

/** 首页底部每 5 秒轮换一条小提示，纯氛围文案，不影响任何玩法 */
const TIPS = [
  "点开就玩，3 分钟一局",
  "死了立刻重来，不删档",
  "每日种子全服一致",
  "把种子码发给朋友，挑战同一局",
]

export function RotatingTips() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((prev) => (prev + 1) % TIPS.length),
      5000,
    )
    return () => window.clearInterval(timer)
  }, [])

  return (
    <p
      key={index}
      className="animate-in fade-in duration-500 text-center font-mono text-xs text-muted-foreground"
    >
      · {TIPS[index]} ·
    </p>
  )
}
