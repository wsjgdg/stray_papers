import { useEffect, useState } from "react"
import { Shield, Timer, X } from "lucide-react"

import { BossCloneWindow } from "@/components/dungeon/BossCloneWindow"
import {
  BossSkillList,
  type BossPassiveRow,
  type BossSkillRow,
} from "@/components/dungeon/BossSkillList"
import { SkillBar, type SkillBarProps } from "@/components/dungeon/SkillBar"
import { CLONE_CAST_MS } from "@/pages/Dungeon/useDungeon"
import type {
  BossClickPrompt,
  BossLine,
  BossPendingSkill,
  DamagePop,
  EnemyInstance,
} from "@/pages/Dungeon/useDungeon"
import { cn } from "@/lib/utils"

type BossAdOverlayProps = {
  boss: EnemyInstance
  /** 当前那句台词（只做气氛），null 时不占内容 */
  line: BossLine | null
  lockedButtonId: string | null
  countdownMs: number
  countdownTotal: number
  now: number
  hitFlashMs: number
  pops: DamagePop[]
  /** 低配模式：关掉伤害飘字与按钮抖动 */
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
  /** 拟物化战斗包（skeuo-boss-pack.md 一）：阶段 2 本体弱点 × 状态；null = 不渲染 */
  weak: { slot: number; cooling: boolean; ratio: number } | null
  /** 点中弱点 ×：固定 15 伤 + 冷却 1.2s + 跳下一锚点（引擎守卫无效点击） */
  onWeakHit: () => void
  /** 浏览器特性包 v1（browser-powers-pack.md 一）：分身读条状态；null = 没在读 */
  clone: { tapsLeft: number; castRatio: number } | null
  /** 分身窗口里点 ×（3 下归零 = 打断 + Boss 眩晕 2.5 秒） */
  onTapClone: () => void
  onLockButton: (buttonId: string) => void
  onBossSkip: () => void
}

/* 弱点 × 的 6 个锚点（占本体区域百分比，散布在本体血条四周、含左上/右下对角位；
   槽位随命中次数进位，坐标表只在这里定义一份） */
const WEAK_SLOT_PCT: { left: string; top: string }[] = [
  { left: "8%", top: "10%" },
  { left: "80%", top: "8%" },
  { left: "42%", top: "4%" },
  { left: "6%", top: "64%" },
  { left: "78%", top: "66%" },
  { left: "44%", top: "38%" },
]

function popText(pop: DamagePop): string {
  if (pop.kind === "dodge") return "闪避"
  if (pop.kind === "immune") return "免疫"
  if (pop.kind === "shield") return "护盾"
  if (pop.kind === "heal") return `+${pop.amount}`
  if (pop.kind === "hurt") return `-${pop.amount}`
  if (pop.kind === "execute") return "斩杀"
  if (pop.kind === "weak") return "弱"
  /* 批次 B 机制飘字（与 TabEnemyStrip 同一套文案，relic-redesign.md B·S1/C2/C3） */
  if (pop.kind === "bounce") return "弹射"
  if (pop.kind === "decoy") return "残影诱饵"
  if (pop.kind === "refactor") return "响应式重构"
  if (pop.kind === "shard") return `自动 +${pop.amount}`
  return String(pop.amount)
}

export function BossAdOverlay({
  boss,
  line,
  lockedButtonId,
  countdownMs,
  countdownTotal,
  now,
  hitFlashMs,
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
  weak,
  onWeakHit,
  clone,
  onTapClone,
  onLockButton,
  onBossSkip,
}: BossAdOverlayProps) {
  /* 分身小窗的开合只活在组件内：读条结束（clone 变 null）自动收起 */
  const [cloneOpen, setCloneOpen] = useState(false)
  useEffect(() => {
    if (!clone) setCloneOpen(false)
  }, [clone])
  const cloneSecsLeft = clone
    ? Math.ceil((clone.castRatio * CLONE_CAST_MS) / 1000)
    : 0
  const openButtons = boss.buttons.filter((button) => !button.closed)
  const hpRatio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0
  const bodyRatio =
    boss.boss && boss.boss.bodyMaxHp > 0
      ? boss.boss.bodyHp / boss.boss.bodyMaxHp
      : 0
  const timeRatio =
    countdownTotal > 0 ? Math.max(0, Math.min(1, countdownMs / countdownTotal)) : 0
  const urgent = countdownMs <= 5000
  const phase = boss.boss?.phase ?? 1
  const phaseLabel = phase === 1 ? "阶段 1 · 四个关闭按钮" : "阶段 2 · 本体暴露"

  return (
    <>
    <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-background/95 p-3 backdrop-blur-sm sm:items-center">
      <div className="relative flex h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-lg border-2 border-destructive/60 bg-card p-3 text-card-foreground shadow-md sm:h-auto sm:p-4">
        {/* 出场故障（规范·故障艺术克制使用）：扫描线扫过 0.5s 即消失，低配/减弱动效下不出现 */}
        {!lowSpec ? (
          <span aria-hidden className="boss-scanlines pointer-events-none absolute inset-0 z-10 rounded-lg" />
        ) : null}
        {/* 浏览器特性包 v1（browser-powers-pack.md 一）：迷你标签条——主标签 + 分身标签芯片
            （组件内自绘，不碰普通层 TabBar）；读条中点分身标签弹出分身小窗 */}
        {clone ? (
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              aria-label="切回主标签"
              onClick={() => setCloneOpen(false)}
              className={cn(
                "rounded-t-sm border border-border px-2 py-1 font-mono text-xs transition focus-visible:outline-none focus-visible:shadow-focus",
                cloneOpen
                  ? "bg-background/40 text-muted-foreground"
                  : "bg-card text-card-foreground",
              )}
            >
              广告战 ▍
            </button>
            <button
              type="button"
              aria-label={`切到分身窗口打断大招，还有 ${cloneSecsLeft} 秒读满`}
              onClick={() => setCloneOpen(true)}
              className={cn(
                "relative overflow-hidden rounded-t-sm border-2 border-destructive px-2 py-1 font-mono text-xs text-destructive transition focus-visible:outline-none focus-visible:shadow-focus",
                cloneOpen ? "bg-destructive/10" : "bg-card",
                !lowSpec && "motion-safe:animate-pulse-soft hover:brightness-125",
              )}
            >
              <span
                className={cn(
                  "mr-1 inline-block h-1.5 w-1.5 rounded-full bg-destructive align-middle",
                  !lowSpec && "motion-safe:animate-pulse",
                )}
              />
              分身.exe
              <span className="ml-1 tabular-nums">{cloneSecsLeft}s</span>
              {/* 芯片底部的读条细条：越接近放完填得越满 */}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-0.5 bg-destructive"
                style={{
                  width: `${Math.round((1 - clone.castRatio) * 100)}%`,
                }}
              />
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-sm bg-destructive/15 px-1.5 py-0.5 font-mono text-xs text-destructive">
            小 Boss
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

        <p className="font-mono text-xs text-primary">{phaseLabel}</p>

        <div className="relative rounded-md border border-dashed border-destructive/50 p-3">
          {/* 拟物化战斗包（skeuo-boss-pack.md 一）：垃圾弹窗审美的小关闭 ×——
              destructive 描边、微倾、呼吸脉冲；点中=固定 15 伤，每点中一次跳下一锚点；
              本体 ≤30% 血缩小一档（纯视觉），冷却中置灰无效（低配不脉冲、换位数直接跳变） */}
          {weak ? (
            <button
              type="button"
              aria-label="点中广告本体上的关闭 ×（弱点）"
              disabled={weak.cooling}
              onClick={onWeakHit}
              className={cn(
                "absolute z-10 grid h-5 w-5 -rotate-6 place-items-center rounded-sm border-2 border-destructive bg-card font-mono text-xs font-bold leading-none text-destructive active:scale-90",
                weak.ratio <= 0.3 && "h-3.5 w-3.5",
                weak.cooling
                  ? "cursor-not-allowed opacity-40"
                  : !lowSpec &&
                    "motion-safe:animate-pulse-soft hover:brightness-125",
              )}
              style={{
                left: WEAK_SLOT_PCT[weak.slot % WEAK_SLOT_PCT.length].left,
                top: WEAK_SLOT_PCT[weak.slot % WEAK_SLOT_PCT.length].top,
                transition: lowSpec
                  ? "none"
                  : "left 240ms ease, top 240ms ease, transform 100ms ease",
              }}
            >
              ×
            </button>
          ) : null}
          {phase === 1 ? (
            <>
              <p className="font-mono text-xs text-muted-foreground">
                点一下关闭按钮锁定它，再用空格关掉；还剩 {openButtons.length} 个没关。
                全部关掉本体才会露出来。
              </p>

              <div className="mt-3 flex flex-col gap-2">
                {boss.buttons.map((button) => {
                  const ratio = button.maxHp > 0 ? button.hp / button.maxHp : 0
                  const locked = button.id === lockedButtonId && !button.closed
                  const flashing =
                    !button.closed &&
                    boss.hitAt > 0 &&
                    now - boss.hitAt < hitFlashMs &&
                    locked
                  return (
                    <button
                      key={button.id}
                      type="button"
                      disabled={button.closed}
                      onClick={() => onLockButton(button.id)}
                      aria-pressed={locked}
                      className={cn(
                        "relative flex items-center gap-2 overflow-hidden rounded-md border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:shadow-focus",
                        button.closed
                          ? "border-border bg-foreground/5 text-muted-foreground opacity-60"
                          : locked
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-destructive/50 hover:border-primary/60",
                        !lowSpec && flashing && "animate-bounce",
                      )}
                    >
                      <X className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-sm font-bold">
                          {button.label}
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-foreground/10">
                          <span
                            className="block h-full rounded-full bg-destructive transition-[width] duration-150"
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                          />
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {button.closed
                          ? "已关闭"
                          : `${button.hp} / ${button.maxHp}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="font-mono text-xs text-muted-foreground">
                按钮都关掉了，本体只剩一具空壳。自动攻击已经在打它了。
              </p>
              <div>
                <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                  <span>本体血量</span>
                  <span>
                    {boss.boss?.bodyHp ?? 0} / {boss.boss?.bodyMaxHp ?? 0}
                  </span>
                </div>
                <span className="mt-1 block h-2.5 overflow-hidden rounded-full bg-foreground/10">
                  <span
                    className="block h-full rounded-full bg-destructive transition-[width] duration-150"
                    style={{ width: `${Math.round(bodyRatio * 100)}%` }}
                  />
                </span>
              </div>
            </div>
          )}
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
          <span className="font-mono text-xs text-muted-foreground">
            总血 {Math.round(hpRatio * 100)}%
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
                    "absolute top-16 animate-in fade-in slide-in-from-bottom-4 font-mono text-sm font-bold duration-500",
                    pop.kind === "weak"
                      ? "text-sys-network text-2xl"
                      : pop.kind === "heal" || pop.kind === "hit"
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

      {/* 浏览器特性包 v1（browser-powers-pack.md 一）：分身小窗盖在 Boss 面板（z-40）之上；
          读满或被打断时 bossClone 变 null → 卸载即输入恢复 */}
      {clone && cloneOpen ? (
        <BossCloneWindow
          ratio={clone.castRatio}
          hpPercent={Math.round((playerHp / Math.max(1, playerMaxHp)) * 100)}
          tapsLeft={clone.tapsLeft}
          lowSpec={lowSpec}
          onTap={onTapClone}
        />
      ) : null}
    </>
  )
}
