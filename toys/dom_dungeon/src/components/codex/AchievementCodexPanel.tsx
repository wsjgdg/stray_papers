import { Trophy } from "lucide-react"

import { cn } from "@/lib/utils"
import type { CodexAchievementEntry } from "@/pages/Codex/useCodex"

type AchievementCodexPanelProps = {
  achievements: CodexAchievementEntry[]
  unlockedCount: number
  totalCount: number
}

const REWARD_ICONS = [
  { key: "fragments", icon: "💰", label: "碎片" },
  { key: "cores", icon: "🔷", label: "核心" },
  { key: "seeds", icon: "🌱", label: "种子" },
] as const

export function AchievementCodexPanel({
  achievements,
  unlockedCount,
  totalCount,
}: AchievementCodexPanelProps) {
  const percent =
    totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          成就档案
        </h2>
        <p className="font-mono text-xs text-muted-foreground">
          达成一条，三种货币一次到账
        </p>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-md">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          成就进度
        </p>
        <p className="mt-1 font-display text-3xl font-bold tracking-tight">
          <span className="text-primary">{unlockedCount}</span>
          <span className="text-muted-foreground"> / {totalCount}</span>
          <span className="ml-2 text-base font-semibold text-muted-foreground">
            已达成
          </span>
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {achievements.map((item) => {
          const rewards = REWARD_ICONS.filter(
            (reward) => item.reward[reward.key] > 0,
          )
          return (
            <li
              key={item.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-4 shadow-md transition",
                item.unlocked
                  ? "border-sys-network/50 bg-sys-network/5 text-card-foreground shadow-glow-gold"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full border",
                  item.unlocked
                    ? "border-sys-network/60 bg-sys-network/15 text-sys-network shadow-glow-gold"
                    : "border-border bg-foreground/5",
                )}
              >
                {item.unlocked ? (
                  <Trophy className="h-5 w-5" />
                ) : (
                  <LockGlyph />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    className={cn(
                      "font-display text-base font-bold",
                      item.unlocked ? "text-sys-network" : "text-foreground/70",
                    )}
                  >
                    {item.name}
                  </h3>
                  {item.unlocked ? (
                    <span className="rounded-sm border border-sys-network/50 px-1.5 py-0.5 font-mono text-xs text-sys-network">
                      已达成
                    </span>
                  ) : item.progress ? (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs">
                      {item.progress}
                    </span>
                  ) : (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs">
                      未达成
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm">{item.desc}</p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 font-mono text-xs">
                {rewards.map((reward) => (
                  <span
                    key={reward.key}
                    title={`${reward.label} +${item.reward[reward.key]}`}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 tabular-nums",
                      item.unlocked
                        ? "border-sys-network/40 text-foreground/90"
                        : "border-border",
                    )}
                  >
                    <span aria-hidden>{reward.icon}</span>
                    {item.reward[reward.key]}
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function LockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
