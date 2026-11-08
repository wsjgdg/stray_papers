import { Gift } from "lucide-react"

import type { SettleItem } from "@/lib/economy"

type MilestoneRewardsPanelProps = {
  items: SettleItem[]
}

/**
 * 本局里程碑收益明细：每日首胜 / 每日挑战 / 首次 Boss 核心 / 通关种子 /
 * 榜单名次奖励。都已直接进货币余额，这里只列一行行来源说明；
 * 通关奖励与局内掉落由本页碎片滚动面板负责，本面板不重复列。
 */
export function MilestoneRewardsPanel({ items }: MilestoneRewardsPanelProps) {
  if (items.length === 0) return null

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5">
      <div className="flex items-center gap-2">
        <Gift className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <h2 className="font-display text-lg font-bold">里程碑奖励</h2>
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        这一局新拿到的里程碑：直发的已存进货币余额，带信封标记的去首页信箱领
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item, index) => (
          <li
            key={`${item.label}-${index}`}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-btn border border-border bg-background/40 px-3 py-2"
          >
            <span className="flex flex-wrap items-center gap-2 font-mono text-sm text-card-foreground">
              {item.label}
              {item.mail ? (
                <span className="rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] text-primary">
                  已放入奖励信箱
                </span>
              ) : null}
            </span>
            <span className="flex items-center gap-2.5 font-mono text-sm font-semibold tabular-nums">
              {item.fragments ? (
                <span className="text-sys-network" title="碎片">
                  +{item.fragments} 💰
                </span>
              ) : null}
              {item.cores ? (
                <span className="text-sys-script" title="核心">
                  +{item.cores} 🔷
                </span>
              ) : null}
              {item.seeds ? (
                <span className="text-sys-cache" title="种子">
                  +{item.seeds} 🌱
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
