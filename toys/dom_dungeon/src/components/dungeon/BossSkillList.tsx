import { AlertTriangle, MousePointerClick, Skull, Zap } from "lucide-react"

import type { BossSkill } from "@/lib/dungeonData"
import type {
  BossClickPrompt,
  BossPendingSkill,
  EnemyInstance,
} from "@/pages/Dungeon/useDungeon"
import { cn } from "@/lib/utils"

/** 技能表一行：原始技能定义 + 冷却剩余 + 是否正在前摇 */
export type BossSkillRow = BossSkill & {
  cooldownLeft: number
  active: boolean
}

export type BossPassiveRow = {
  name: string
  cdLabel: string
  desc: string
  counter: string
}

type BossSkillListProps = {
  skills: BossSkillRow[]
  passive: BossPassiveRow | null
  pending: BossPendingSkill | null
  click: BossClickPrompt | null
  minions: EnemyInstance[]
  overtime: boolean
  now: number
  lowSpec: boolean
  onBossSkip: () => void
}

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1)
}

export function BossSkillList({
  skills,
  passive,
  pending,
  click,
  minions,
  overtime,
  now,
  lowSpec,
  onBossSkip,
}: BossSkillListProps) {
  return (
    <div className="flex flex-col gap-2">
      {overtime ? (
        <p className="flex items-center gap-1.5 rounded-sm border border-destructive/60 bg-destructive/10 px-2 py-1.5 font-mono text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          限时已过 · Boss 攻击 +50%
        </p>
      ) : null}

      {pending ? (
        <div className="rounded-sm border border-destructive/60 bg-destructive/10 px-2 py-1.5">
          <p className="flex items-center gap-1.5 font-mono text-xs font-bold text-destructive">
            <Zap className="h-3.5 w-3.5 shrink-0" />
            蓄力 · {pending.name}
            <span className="ml-auto tabular-nums">
              {seconds(pending.telegraphUntil - now)}s
            </span>
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {pending.desc}
          </p>
          <p className="mt-0.5 font-mono text-xs text-primary">
            应对：{pending.counter}
          </p>
        </div>
      ) : null}

      {click ? (
        <button
          type="button"
          onClick={onBossSkip}
          className="flex items-center gap-2 rounded-sm border border-primary/60 bg-primary/10 px-2.5 py-2 text-left transition hover:bg-primary/20 focus-visible:outline-none focus-visible:shadow-focus"
        >
          <MousePointerClick className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-display text-sm font-bold text-primary">
            {click.label}
          </span>
          <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-primary">
            {seconds(click.expiresAt - now)}s
          </span>
        </button>
      ) : null}

      {minions.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-1.5">
          <li className="font-mono text-xs text-muted-foreground">召唤物</li>
          {minions.map((minion) => (
            <li
              key={minion.uid}
              className="inline-flex items-center gap-1 rounded-sm border border-destructive/50 bg-destructive/10 px-1.5 py-0.5 font-mono text-xs text-destructive"
            >
              <Skull className="h-3 w-3" />
              {minion.displayName} {minion.hp}/{minion.maxHp}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-hidden rounded-sm border border-border">
        <p className="border-b border-border bg-background/50 px-2 py-1 font-mono text-xs text-muted-foreground">
          当前阶段技能表
        </p>
        <ul className="divide-y divide-border">
          {skills.map((skill) => {
            const ready = skill.cooldownLeft <= 0
            return (
              <li
                key={skill.id}
                className={cn(
                  "flex flex-col gap-0.5 px-2 py-1.5",
                  skill.active ? "bg-destructive/10" : "bg-transparent",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      skill.active
                        ? "bg-destructive"
                        : ready
                          ? "bg-primary"
                          : "bg-muted-foreground",
                      !lowSpec && skill.active && "animate-pulse",
                    )}
                  />
                  <span className="font-display text-xs font-bold">
                    {skill.name}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    冷却 {(skill.cdMs / 1000).toFixed(0)}s · 前摇{" "}
                    {(skill.telegraphMs / 1000).toFixed(1)}s
                  </span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 font-mono text-xs tabular-nums",
                      ready ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {skill.active
                      ? "蓄力中"
                      : ready
                        ? "就绪"
                        : `${seconds(skill.cooldownLeft)}s`}
                  </span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {skill.desc}
                </span>
                <span className="font-mono text-xs text-primary">
                  应对：{skill.counter}
                </span>
              </li>
            )
          })}
        </ul>
        {passive ? (
          <div className="border-t border-border bg-background/40 px-2 py-1.5">
            <p className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
              />
              <span className="font-display text-xs font-bold">
                {passive.name}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {passive.cdLabel}
              </span>
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {passive.desc}
            </p>
            <p className="font-mono text-xs text-primary">
              应对：{passive.counter}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
