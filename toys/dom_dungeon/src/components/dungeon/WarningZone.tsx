import { AlertTriangle, Ban, MousePointerClick, Snowflake, Timer, Zap } from "lucide-react"

import type {
  BossClickPrompt,
  BossPendingSkill,
  CaptchaChallenge,
  EnemyInstance,
} from "@/pages/Dungeon/useDungeon"
import { cn } from "@/lib/utils"

type WarningZoneProps = {
  now: number
  /** 低配模式：不做红圈脉冲与全屏闪烁 */
  lowSpec: boolean
  enemies: EnemyInstance[]
  /** 第 6 层：中央浮出的图案题 */
  challenge: CaptchaChallenge | null
  /** Boss 正在蓄力的技能（前摇期间的红圈 / 警告） */
  bossPending: BossPendingSkill | null
  /** Boss「强制观看」限时跳过按钮 */
  bossClick: BossClickPrompt | null
  bossFlash: boolean
  bossSpeedCut: boolean
  overtime: boolean
  floorTimeLeft: number
  floorTimeLimit: number
  paused: boolean
  /** 内核之影主动技「任务管理器」：全场敌人冻结正生效 */
  frozen: boolean
  /** 冻结剩余毫秒，用于倒数 */
  freezeLeftMs: number
  /** S7 异步觉醒阻塞期：玩家无法攻击与闪避（relic-redesign.md B·S7） */
  blockActive: boolean
  /** 阻塞剩余毫秒，HUD 显「阻塞中 X.Xs」 */
  blockLeftMs: number
  onPickSymbol: (symbol: string) => void
  onBossSkip: () => void
}

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1)
}

/** 当前正在起前摇的敌人（红圈警告） */
function telegraphing(enemies: EnemyInstance[], now: number): EnemyInstance[] {
  return enemies.filter(
    (enemy) => !enemy.closing && enemy.telegraphUntil > now,
  )
}

export function WarningZone({
  now,
  lowSpec,
  enemies,
  challenge,
  bossPending,
  bossClick,
  bossFlash,
  bossSpeedCut,
  overtime,
  floorTimeLeft,
  floorTimeLimit,
  paused,
  frozen,
  freezeLeftMs,
  blockActive,
  blockLeftMs,
  onPickSymbol,
  onBossSkip,
}: WarningZoneProps) {
  const incoming = telegraphing(enemies, now)
  const timeRatio =
    floorTimeLimit > 0
      ? Math.max(0, Math.min(1, floorTimeLeft / floorTimeLimit))
      : 0
  const urgent = floorTimeLimit > 0 && floorTimeLeft <= 5000
  const challengeLeft = challenge ? challenge.expiresAt - now : 0
  const challengeRatio =
    challenge && challenge.expiresAt > challenge.startedAt
      ? Math.max(
          0,
          Math.min(
            1,
            (challenge.expiresAt - now) /
              (challenge.expiresAt - challenge.startedAt),
          ),
        )
      : 0
  const skipLeft = bossClick ? bossClick.expiresAt - now : 0

  return (
    <section
      aria-label="警告区"
      className="relative flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-md"
    >
      {/* Boss 全屏闪烁：只在低配模式外出现 */}
      {bossFlash && !lowSpec ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse rounded-lg bg-destructive/20"
        />
      ) : null}

      {/* 层限时 */}
      {floorTimeLimit > 0 ? (
        <div className="flex items-center gap-2">
          <Timer
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              urgent || overtime ? "text-destructive" : "text-primary",
            )}
          />
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {overtime ? "已超时" : "本层限时"}
          </span>
          <span
            className={cn(
              "shrink-0 font-mono text-xs font-bold tabular-nums",
              urgent || overtime ? "text-destructive" : "text-foreground",
            )}
          >
            {seconds(floorTimeLeft)}s
          </span>
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
            <span
              className={cn(
                "block h-full rounded-full transition-[width] duration-150",
                urgent || overtime ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${Math.round(timeRatio * 100)}%` }}
            />
          </span>
        </div>
      ) : null}

      {overtime ? (
        <p className="flex items-center gap-1.5 rounded-sm border border-destructive/60 bg-destructive/10 px-2 py-1.5 font-mono text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          超时了，本层敌人攻击 +50%，还能打
        </p>
      ) : null}

      {bossSpeedCut ? (
        <p className="rounded-sm border border-destructive/60 bg-destructive/10 px-2 py-1.5 font-mono text-xs text-destructive">
          强制跳转中 · 你的攻速减半
        </p>
      ) : null}

      {/* 内核之影「任务管理器」：冻结生效中的青蓝色提示 */}
      {frozen ? (
        <p className="flex items-center gap-1.5 rounded-sm border border-sys-script/60 bg-sys-script/10 px-2 py-1.5 font-mono text-xs text-sys-script">
          <Snowflake
            className={cn("h-3.5 w-3.5 shrink-0", !lowSpec && "motion-safe:animate-pulse-soft")}
          />
          敌人已冻结 · 全场停止出手
          <span className="ml-auto tabular-nums">{seconds(freezeLeftMs)}s</span>
        </p>
      ) : null}

      {/* S7 异步觉醒的阻塞窗口：自己暂时无法攻击与闪避（sys-script 青色，relic-redesign.md B·S7） */}
      {blockActive ? (
        <p className="flex items-center gap-1.5 rounded-sm border border-sys-script/60 bg-sys-script/10 px-2 py-1.5 font-mono text-xs text-sys-script">
          <Ban
            className={cn("h-3.5 w-3.5 shrink-0", !lowSpec && "motion-safe:animate-pulse-soft")}
          />
          阻塞中 · 暂时无法攻击与闪避
          <span className="ml-auto tabular-nums">{seconds(blockLeftMs)}s</span>
        </p>
      ) : null}

      {/* 敌人前摇红圈 */}
      {incoming.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-destructive/60 bg-destructive/10 px-2 py-1.5">
          <span
            aria-hidden
            className={cn(
              "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-destructive",
              !lowSpec && "animate-ping",
            )}
          />
          <span className="font-mono text-xs font-bold text-destructive">
            出手前摇
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {incoming.map((enemy) => enemy.displayName).join(" / ")} 正在蓄力，
            点闪避可躲掉这次
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-destructive">
            {seconds(Math.max(...incoming.map((enemy) => enemy.telegraphUntil - now)))}s
          </span>
        </div>
      ) : null}

      {/* Boss 技能前摇 */}
      {bossPending ? (
        <div className="rounded-sm border border-destructive/60 bg-destructive/10 px-2 py-1.5">
          <p className="flex items-center gap-1.5 font-mono text-xs font-bold text-destructive">
            <Zap className="h-3.5 w-3.5 shrink-0" />
            Boss 蓄力 · {bossPending.name}
            <span className="ml-auto tabular-nums">
              {seconds(bossPending.telegraphUntil - now)}s
            </span>
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {bossPending.desc}
          </p>
          <p className="mt-0.5 font-mono text-xs text-primary">
            应对：{bossPending.counter}
          </p>
        </div>
      ) : null}

      {/* 强制观看：限时跳过按钮 */}
      {bossClick ? (
        <button
          type="button"
          onClick={onBossSkip}
          className="flex items-center gap-2 rounded-sm border border-primary/60 bg-primary/10 px-2.5 py-2 text-left transition hover:bg-primary/20 focus-visible:outline-none focus-visible:shadow-focus"
        >
          <MousePointerClick className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-display text-sm font-bold text-primary">
            {bossClick.label}
          </span>
          <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-primary">
            {seconds(skipLeft)}s
          </span>
        </button>
      ) : null}

      {/* 第 6 层：中央图案题 */}
      {challenge ? (
        <div
          className={cn(
            "rounded-md border p-2.5",
            challenge.result === "hit"
              ? "border-primary bg-primary/10"
              : challenge.result === "miss"
                ? "border-destructive bg-destructive/10"
                : "border-dashed border-primary/60 bg-background/60",
          )}
        >
          {challenge.result === "pending" ? (
            <>
              <p className="font-mono text-xs text-primary">
                点中高亮的那个图案破防 · {seconds(challengeLeft)}s
              </p>
              <span
                aria-hidden
                className="mt-1.5 block h-1 overflow-hidden rounded-full bg-foreground/10"
              >
                <span
                  className="block h-full rounded-full bg-primary transition-[width] duration-100"
                  style={{ width: `${Math.round(challengeRatio * 100)}%` }}
                />
              </span>
              <div className="mt-2 flex items-center justify-center gap-3">
                {challenge.options.map((symbol) => (
                  <button
                    key={`captcha-${symbol}`}
                    type="button"
                    onClick={() => onPickSymbol(symbol)}
                    aria-label={`选择图案 ${symbol}`}
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-md border font-mono text-lg transition focus-visible:outline-none focus-visible:shadow-focus",
                      symbol === challenge.answer
                        ? "border-primary bg-primary/20 text-primary shadow-md"
                        : "border-border bg-card text-muted-foreground hover:border-primary/60",
                    )}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p
              className={cn(
                "font-mono text-xs font-bold",
                challenge.result === "hit" ? "text-primary" : "text-destructive",
              )}
            >
              {challenge.result === "hit"
                ? "点对了 · 全体敌人破防 3 秒，受到伤害 +50%"
                : "点错 / 超时 · 全体敌人下次攻击 +100%"}
            </p>
          )}
        </div>
      ) : null}

      {!paused &&
      !frozen &&
      incoming.length === 0 &&
      !challenge &&
      !bossPending &&
      !bossClick &&
      !overtime ? (
        <p className="font-mono text-xs text-muted-foreground">
          暂无警告 · 自动攻击中，敌人出手前会先亮红圈
        </p>
      ) : null}

      {paused ? (
        <p className="rounded-sm border border-primary/50 bg-primary/10 px-2 py-1.5 font-mono text-xs text-primary">
          已暂停 · 计时与敌人全部停手
        </p>
      ) : null}
    </section>
  )
}
