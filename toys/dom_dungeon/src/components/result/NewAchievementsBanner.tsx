import { Trophy } from "lucide-react"

import { cn } from "@/lib/utils"
import type { AchievementDef } from "@/lib/achievements"

type NewAchievementsBannerProps = {
  /** 本局新达成的成就（结算 + 查榜后合并的清单） */
  achievements: AchievementDef[]
  /** 低配模式：关掉入场动画，只留静态横幅 */
  lowSpec?: boolean
}

/** 金色横幅：列出本局新达成的成就与三货币奖励；没有新成就整块不渲染。 */
export function NewAchievementsBanner({
  achievements,
  lowSpec,
}: NewAchievementsBannerProps) {
  if (achievements.length === 0) return null

  return (
    <section
      aria-label="新达成成就"
      className={cn(
        "rounded-2xl border border-sys-network/40 bg-sys-network/10 p-4 text-card-foreground shadow-glow-gold lg:col-span-2",
        !lowSpec && "animate-in fade-in slide-in-from-top-4 duration-500",
      )}
    >
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 shrink-0 text-sys-network" aria-hidden />
        <h2 className="font-display text-lg font-bold text-sys-network">
          🏆 新成就
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          奖励已入账
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {achievements.map((def) => (
          <li
            key={def.id}
            className="rounded-btn border border-sys-network/30 bg-background/60 px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="font-display text-sm font-bold text-foreground">
                {def.name}
              </span>
              <span className="flex items-center gap-2.5 font-mono text-xs font-semibold tabular-nums">
                {def.reward.fragments > 0 ? (
                  <span className="text-sys-network" title="碎片">
                    +{def.reward.fragments} 💰
                  </span>
                ) : null}
                {def.reward.cores > 0 ? (
                  <span className="text-sys-script" title="核心">
                    +{def.reward.cores} 🔷
                  </span>
                ) : null}
                {def.reward.seeds > 0 ? (
                  <span className="text-sys-cache" title="种子">
                    +{def.reward.seeds} 🌱
                  </span>
                ) : null}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{def.desc}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
