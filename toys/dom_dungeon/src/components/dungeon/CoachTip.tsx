import { memo, useEffect, useState } from "react"

type CoachTipProps = {
  tip: { text: string; seq: number } | null
  /** 暂停时浮字先收起来，回到战斗再按当前内容展示 */
  paused: boolean
  lowSpec: boolean
}

/** 屏幕上方居中的教学浮字：每句话停留约 2.2 秒自动收起，不拦截点击。
 *  perf-experience-pack.md C：props 全为原始值 / 稳定引用（coachTip 仅在推送时换引用），
 *  memo 掉掉战斗 10Hz tick 的无谓重渲染 */
export const CoachTip = memo(function CoachTip({
  tip,
  paused,
  lowSpec,
}: CoachTipProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!tip) {
      setVisible(false)
      return
    }
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), 2200)
    return () => window.clearTimeout(timer)
  }, [tip?.seq, tip])

  if (!tip || !visible || paused) return null

  return (
    <div
      role="status"
      key={tip.seq}
      className={`pointer-events-none fixed left-1/2 top-16 z-30 w-max max-w-[92vw] -translate-x-1/2 sm:top-20 ${
        lowSpec ? "" : "animate-in fade-in slide-in-from-top-4 duration-300"
      }`}
    >
      <p className="rounded-md border border-primary/50 bg-background/90 px-4 py-2 text-center font-mono text-xs text-primary shadow-md backdrop-blur sm:text-sm">
        {tip.text}
      </p>
    </div>
  )
})
