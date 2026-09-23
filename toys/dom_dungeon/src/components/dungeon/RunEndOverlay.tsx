import { useEffect } from "react"
import { Gem, Home, RotateCcw, ScrollText, Skull, Trophy } from "lucide-react"

import { ROUTE_TYPES, type RouteId } from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

const AUTO_LEAVE_MS = 2600
/** 挂着复活按钮时给足思考时间：等玩家选择，或 8 秒后自动进结算 */
const AUTO_LEAVE_WITH_REVIVE_MS = 8000

type RunEndOverlayProps = {
  cleared: boolean
  cause: string
  floor: number
  floorTotal: number
  seed: string
  reward: number
  reviveCount: number
  /** 元叙事（fun-pack v2）：本机累计倒下次数（含本局），通关时不显示 */
  deathCount: number
  /** 走过的路线足迹（每层的来路），结算页图标串 */
  routeLog: { floor: number; routeId: RouteId }[]
  /** 第 8 层通关解锁的外观名（没解锁到就是 null） */
  unlockedSkin: string | null
  /** 可以花局内碎片原地复活（本局没用过且余额够） */
  canRevive: boolean
  /** 复活价格（局内碎片） */
  reviveCost: number
  onRevive: () => void
  onViewResult: () => void
  onRestart: () => void
  onExit: () => void
}

export function RunEndOverlay({
  cleared,
  cause,
  floor,
  floorTotal,
  seed,
  reward,
  reviveCount,
  deathCount,
  routeLog,
  unlockedSkin,
  canRevive,
  reviveCost,
  onRevive,
  onViewResult,
  onRestart,
  onExit,
}: RunEndOverlayProps) {
  /* 战绩已经写进本地存档，短暂停留后自动进结算页；
     挂着复活按钮时把跳转放慢到 8 秒，等玩家拍板 */
  useEffect(() => {
    const ms = canRevive ? AUTO_LEAVE_WITH_REVIVE_MS : AUTO_LEAVE_MS
    const timer = window.setTimeout(() => onViewResult(), ms)
    return () => window.clearTimeout(timer)
  }, [onViewResult, canRevive])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/90 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={cleared ? "通关" : "本局结束"}
        className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-md duration-300"
      >
        <span
          aria-hidden
          className={cn(
            "grid h-11 w-11 place-items-center rounded-md border",
            cleared
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-destructive/60 bg-destructive/15 text-destructive",
          )}
        >
          {cleared ? (
            <Trophy className="h-5 w-5" />
          ) : (
            <Skull className="h-5 w-5" />
          )}
        </span>

        <h2 className="mt-3 font-display text-2xl font-bold">
          {cleared ? "地牢打穿了" : "标签全灭了"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{cause}</p>

        {/* 元叙事（fun-pack v2）：死亡才出现的小字，通关不打扰 */}
        {!cleared ? (
          <p className="mt-1.5 font-mono text-xs text-muted-foreground">
            {deathCount <= 1
              ? "第一次倒下，不丢人"
              : `这是你第 ${deathCount} 次倒在这里`}
          </p>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-md border border-dashed border-border p-3">
          <div>
            <dt className="font-mono text-xs text-muted-foreground">到达层数</dt>
            <dd className="font-mono text-sm font-bold">
              {floor} / {floorTotal}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-xs text-muted-foreground">本局碎片</dt>
            <dd className="font-mono text-sm font-bold text-primary">+{reward}</dd>
          </div>
        </dl>

        {routeLog.length > 0 ? (
          <div className="mt-3">
            <p className="font-mono text-xs text-muted-foreground">走过的路</p>
            <ul className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {routeLog.map((step) => {
                const type = ROUTE_TYPES[step.routeId]
                return (
                  <li
                    key={`${step.floor}-${step.routeId}`}
                    title={`第 ${step.floor} 层 · ${type.name}`}
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-background/40 px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                  >
                    <span aria-hidden>{type.icon}</span>
                    {type.name}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <p className="mt-3 font-mono text-xs text-muted-foreground">
          本局种子 <span className="text-foreground">{seed}</span> · 战绩已经存好了
        </p>

        {reviveCount > 0 ? (
          <p className="mt-1.5 font-mono text-xs text-primary">
            这一局你被救回来 {reviveCount} 次
          </p>
        ) : null}

        {unlockedSkin ? (
          <p className="mt-1.5 rounded-sm border border-primary/50 bg-primary/10 px-2 py-1 font-mono text-xs text-primary">
            解锁新外观 · {unlockedSkin}
          </p>
        ) : null}

        {canRevive ? (
          <p className="mt-1.5 rounded-sm border border-sys-network/60 bg-sys-network/10 px-2 py-1 font-mono text-xs text-sys-network">
            局内碎片还在 · 可以原地复活再来
          </p>
        ) : null}

        <div
          aria-hidden
          className="mt-4 h-1 w-full overflow-hidden rounded-sm bg-muted"
        >
          <span
            className={cn(
              "block h-full w-full origin-left animate-in zoom-in-50 bg-primary ease-linear",
              canRevive ? "duration-[8s]" : "duration-1000",
            )}
          />
        </div>
        <p className="mt-1.5 font-mono text-xs text-muted-foreground">
          {canRevive ? "复活，或稍后自动进结算…" : "正在打开结算页…"}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {canRevive ? (
            <button
              type="button"
              onClick={onRevive}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-glow-cyan transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
            >
              <Gem className="h-4 w-4" />
              花费 {reviveCost} 碎片原地复活（每局限 1 次）
            </button>
          ) : null}
          <button
            type="button"
            onClick={onViewResult}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
          >
            <ScrollText className="h-4 w-4" />
            {canRevive ? "回结算" : "查看本局结算"}
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onRestart}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
            >
              <RotateCcw className="h-4 w-4" />
              再来一局
            </button>
            <button
              type="button"
              onClick={onExit}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
            >
              <Home className="h-4 w-4" />
              回到首页
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
