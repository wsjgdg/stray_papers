import { memo } from "react"
import { Keyboard, Link2, Terminal, X } from "lucide-react"

import { cn } from "@/lib/utils"

type BattleFooterProps = {
  log: string[]
  kills: number
  damageDealt: number
  combo: number
  bondCount: number
  /** 可关闭 UI（ui-pack.md v2 三）：× 一键隐藏整条，代价是日志与统计不再显示 */
  onHide: () => void
}

const KEYMAP = [
  { keys: "空格", desc: "主动技" },
  { keys: "Shift", desc: "闪避" },
  { keys: "← →", desc: "切换锁定" },
  { keys: "R", desc: "刷新词条" },
]

/** perf-experience-pack.md C：log 数组仅在有新日志时换引用、其余为事件才变的数值、
 *  onHide 是 hook 里的 useCallback——memo 后普通战斗 tick 不再重渲染整条信息栏 */
export const BattleFooter = memo(function BattleFooter({
  log,
  kills,
  damageDealt,
  combo,
  bondCount,
  onHide,
}: BattleFooterProps) {
  /* 连击两档放大（ui-pack.md 二）：≥5 一档、≥10 再大，token 字号不做逐帧缩放 */
  const comboSize =
    combo >= 10 ? "text-xl" : combo >= 5 ? "text-sm" : "text-xs"
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      <ul className="flex shrink-0 items-center gap-3 overflow-x-auto">
        {KEYMAP.map((item) => (
          <li
            key={item.keys}
            className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted-foreground"
          >
            <kbd className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-foreground">
              {item.keys}
            </kbd>
            {item.desc}
          </li>
        ))}
      </ul>

      <p className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden font-mono text-xs text-muted-foreground">
        <Terminal className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate">{log[0] ?? "地牢很安静，等着你出手。"}</span>
      </p>

      <p className="flex shrink-0 items-center gap-3 font-mono text-xs text-muted-foreground">
        {bondCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-primary">
            <Link2 className="h-3.5 w-3.5" />
            流派 {bondCount}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <Keyboard className="h-3.5 w-3.5" />
          连击{' '}
          <span
            className={cn(
              "inline-block font-bold tabular-nums transition-all",
              comboSize,
              combo >= 10 && "text-primary",
            )}
          >
            {combo}
          </span>
        </span>
        <span>关掉 {kills}</span>
        <span className="text-primary">伤害 {damageDealt}</span>
      </p>

      <button
        type="button"
        onClick={onHide}
        aria-label="关闭战斗信息条"
        title="关闭后不再显示日志与统计，可在设置页「战斗信息条」重新打开"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-border text-muted-foreground transition hover:border-destructive/60 hover:text-destructive focus-visible:outline-none focus-visible:shadow-focus"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
})
