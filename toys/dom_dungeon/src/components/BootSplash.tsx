import { useEffect, useState } from "react"

import { APP_VERSION } from "@/lib/appMeta"

/** 最少停留时间：再快也让 logo 被看清一眼 */
const MIN_VISIBLE_MS = 700
/** 淡出时长 */
const FADE_MS = 340

/**
 * 启动页：应用首次挂载时盖在最上层，短暂停留后淡出。
 * 只在应用启动时出现一次，路由之间切换不会再触发。
 */
export function BootSplash() {
  const [progressed, setProgressed] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    const growTimer = window.setTimeout(() => setProgressed(true), 30)
    const leaveTimer = window.setTimeout(() => setLeaving(true), MIN_VISIBLE_MS)
    const goneTimer = window.setTimeout(
      () => setMounted(false),
      MIN_VISIBLE_MS + FADE_MS,
    )
    return () => {
      window.clearTimeout(growTimer)
      window.clearTimeout(leaveTimer)
      window.clearTimeout(goneTimer)
    }
  }, [])

  if (!mounted) return null

  return (
    <div
      aria-hidden={leaving}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-background transition-opacity duration-300 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <span className="font-mono text-[11px] tracking-[0.42em] text-muted-foreground">
          DOM DUNGEON
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          标签地牢
        </h1>
      </div>

      <div className="h-1 w-44 overflow-hidden rounded-sm bg-muted">
        <div
          className={`h-full rounded-sm bg-primary transition-[width] duration-700 ease-out ${
            progressed ? "w-full" : "w-[8%]"
          }`}
        />
      </div>

      <span className="font-mono text-xs text-muted-foreground">
        版本 v{APP_VERSION}
      </span>
    </div>
  )
}
