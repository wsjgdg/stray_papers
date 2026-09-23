import { MonitorX, Shield, Timer } from "lucide-react"

import {
  BossSkillList,
  type BossPassiveRow,
  type BossSkillRow,
} from "@/components/dungeon/BossSkillList"
import { SkillBar, type SkillBarProps } from "@/components/dungeon/SkillBar"
import {
  BOSS_CRASH_ATTACK_MULT,
  BOSS_CRASH_DODGE_BONUS,
  BOSS_CRASH_PHASE2_AT,
  BOSS_CRASH_PHASE3_AT,
  BOSS_CRASH_PHASE_LABEL,
  BOSS_CRASH_POPUP_DAMAGE,
  BOSS_CRASH_SPEED_CUT,
} from "@/lib/dungeonData"
import type {
  BossClickPrompt,
  BossLine,
  BossPendingSkill,
  DamagePop,
  EnemyInstance,
} from "@/pages/Dungeon/useDungeon"
import { cn } from "@/lib/utils"

type BossCrashOverlayProps = {
  boss: EnemyInstance
  /** 当前那句台词（只做气氛），null 时不占内容 */
  line: BossLine | null
  countdownMs: number
  countdownTotal: number
  now: number
  pops: DamagePop[]
  /** 低配模式：关掉伤害飘字与蓝屏闪烁 */
  lowSpec?: boolean
  playerHp: number
  playerMaxHp: number
  shield: number
  skill: SkillBarProps
  /** 当前阶段的技能表 */
  skills: BossSkillRow[]
  passive: BossPassiveRow | null
  pending: BossPendingSkill | null
  click: BossClickPrompt | null
  minions: EnemyInstance[]
  overtime: boolean
  onBossSkip: () => void
}

const PHASE_DETAIL = [
  `无限弹窗 · 每次攻击额外掉你 ${BOSS_CRASH_POPUP_DAMAGE} 血`,
  `无限重定向 · 你的攻速减半（×${BOSS_CRASH_SPEED_CUT}）`,
  `蓝屏闪烁 · 敌人攻击 ×${BOSS_CRASH_ATTACK_MULT}，但你的闪避 +${Math.round(
    BOSS_CRASH_DODGE_BONUS * 100,
  )}%`,
]

const PHASE_MARKS = [BOSS_CRASH_PHASE2_AT, BOSS_CRASH_PHASE3_AT, 0]

function popText(pop: DamagePop): string {
  if (pop.kind === "dodge") return "闪避"
  if (pop.kind === "immune") return "免疫"
  if (pop.kind === "shield") return "护盾"
  if (pop.kind === "heal") return `+${pop.amount}`
  if (pop.kind === "hurt") return `-${pop.amount}`
  if (pop.kind === "execute") return "斩杀"
  /* 批次 B 机制飘字（与 TabEnemyStrip 同一套文案，relic-redesign.md B·S1/C2/C3） */
  if (pop.kind === "bounce") return "弹射"
  if (pop.kind === "decoy") return "残影诱饵"
  if (pop.kind === "refactor") return "响应式重构"
  if (pop.kind === "shard") return `自动 +${pop.amount}`
  return String(pop.amount)
}

export function BossCrashOverlay({
  boss,
  line,
  countdownMs,
  countdownTotal,
  now,
  pops,
  lowSpec = false,
  playerHp,
  playerMaxHp,
  shield,
  skill,
  skills,
  passive,
  pending,
  click,
  minions,
  overtime,
  onBossSkip,
}: BossCrashOverlayProps) {
  const phase = boss.boss?.phase ?? 1
  const hpRatio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0
  const timeRatio =
    countdownTotal > 0 ? Math.max(0, Math.min(1, countdownMs / countdownTotal)) : 0
  const urgent = countdownMs <= 8000
  const flashing =
    !lowSpec && phase === 3 && Math.floor(now / 320) % 2 === 0

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-background/95 p-3 backdrop-blur-sm sm:items-center">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-200",
          flashing ? "bg-primary/20 opacity-100" : "bg-primary/5 opacity-0",
        )}
      />

      <div className="relative flex h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-lg border-2 border-primary/60 bg-card p-3 text-card-foreground shadow-md sm:h-auto sm:p-4">
        {/* 出场故障（规范·故障艺术克制使用）：扫描线扫过 0.5s 即消失，低配/减弱动效下不出现 */}
        {!lowSpec ? (
          <span aria-hidden className="boss-scanlines pointer-events-none absolute inset-0 z-10 rounded-lg" />
        ) : null}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-sm bg-destructive/15 px-1.5 py-0.5 font-mono text-xs text-destructive">
            <MonitorX className="h-3 w-3" />
            大 Boss
          </span>
          <span
            data-text={boss.displayName}
            className={cn(
              "truncate font-display text-base font-bold",
              !lowSpec && "glitch-rgb",
            )}
          >
            {boss.displayName}
          </span>
          <span
            className={cn(
              "ml-auto inline-flex shrink-0 items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-xs",
              urgent
                ? "border-destructive/60 bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground",
            )}
          >
            <Timer className="h-3 w-3" />
            {(Math.max(0, countdownMs) / 1000).toFixed(1)}s
          </span>
        </div>

        <p className="min-h-5 font-mono text-xs italic text-primary">
          {line ? (
            <span
              key={line.seq}
              className={cn(!lowSpec && "inline-block animate-in fade-in duration-300")}
            >
              “{line.text}”
            </span>
          ) : null}
        </p>

        <div className="relative h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-150",
              urgent ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${Math.round(timeRatio * 100)}%` }}
          />
        </div>

        <ol className="flex items-center gap-1.5" aria-label="Boss 阶段">
          {BOSS_CRASH_PHASE_LABEL.map((label, index) => {
            const step = index + 1
            return (
              <li
                key={label}
                className={cn(
                  "flex-1 rounded-sm border px-1.5 py-1 text-center font-mono text-xs",
                  step === phase
                    ? "border-primary bg-primary/10 text-primary"
                    : step < phase
                      ? "border-primary/40 bg-primary/5 text-muted-foreground line-through"
                      : "border-border text-muted-foreground",
                )}
              >
                {label}
              </li>
            )
          })}
        </ol>

        <div className="rounded-md border border-dashed border-primary/50 p-3">
          <p className="font-mono text-xs text-primary">{PHASE_DETAIL[phase - 1]}</p>

          <div className="mt-3">
            <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
              <span>崩溃页面血量</span>
              <span className="font-bold text-foreground">
                {boss.hp} / {boss.maxHp}
              </span>
            </div>
            <span className="relative mt-1 block h-3 overflow-hidden rounded-full bg-foreground/10">
              <span
                className={cn(
                  "block h-full rounded-full transition-[width] duration-150",
                  phase === 3 ? "bg-destructive" : "bg-primary",
                )}
                style={{ width: `${Math.round(hpRatio * 100)}%` }}
              />
              {PHASE_MARKS.slice(0, 2).map((mark) => (
                <span
                  key={mark}
                  aria-hidden
                  className="absolute top-0 h-full w-px bg-background/70"
                  style={{
                    left: `${Math.round((mark / Math.max(1, boss.maxHp)) * 100)}%`,
                  }}
                />
              ))}
            </span>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              阶段线：{BOSS_CRASH_PHASE2_AT} / {BOSS_CRASH_PHASE3_AT} · 限时{" "}
              {Math.round(countdownTotal / 1000)} 秒，超时直接判负
            </p>
          </div>
        </div>

        <BossSkillList
          skills={skills}
          passive={passive}
          pending={pending}
          click={click}
          minions={minions}
          overtime={overtime}
          now={now}
          lowSpec={lowSpec}
          onBossSkip={onBossSkip}
        />

        <div className="flex items-center gap-2 rounded-md border border-border bg-background/50 px-3 py-2">
          <span className="font-mono text-xs text-muted-foreground">生命</span>
          <span className="font-mono text-sm font-bold">
            {playerHp}
            <span className="text-muted-foreground"> / {playerMaxHp}</span>
          </span>
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <Shield className={cn("h-3.5 w-3.5", shield > 0 && "text-primary")} />
            护盾 {shield}
          </span>
        </div>

        <SkillBar {...skill} />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {lowSpec
            ? null
            : pops.map((pop) => (
                <span
                  key={pop.id}
                  className={cn(
                    "absolute top-20 animate-in fade-in slide-in-from-bottom-4 font-mono text-sm font-bold duration-500",
                    pop.kind === "heal" || pop.kind === "hit"
                      ? "text-primary"
                      : "text-destructive",
                  )}
                  style={{ left: `${pop.x}%` }}
                >
                  {popText(pop)}
                </span>
              ))}
        </div>
      </div>
    </div>
  )
}
