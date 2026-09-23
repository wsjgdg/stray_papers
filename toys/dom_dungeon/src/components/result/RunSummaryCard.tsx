import { Clock, Cpu, Flame, Skull, Sparkles, Trophy } from "lucide-react"

import type { SkinStyle } from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

type RunSummaryCardProps = {
  characterName: string
  roleLabel: string
  /** 角色数值（和首页卡 / 图鉴卡同源） */
  characterStats: { label: string; value: string }[]
  /** 该角色当前外观的配色（和首页 / 地牢一致） */
  skinStyle: SkinStyle
  skinName: string
  cleared: boolean
  floor: number
  floorTotal: number
  cause: string
  kills: number
  damageDealt: number
  reward: number
  durationLabel: string
  bestFloor: number
  /** v2 内存效率结算（旧存档没有这一项时整行不显示） */
  memoryEff?: { ratio: number; grade: string; bonus: number }
  memoryGained?: number
  memorySpent?: number
  /* ---- 深化包：碎片与超频战绩（旧存档没有时整行不显示） ---- */
  /** 本局内存碎片峰值 */
  maxFrags?: number
  /** 本局整理碎片的次数 */
  defrags?: number
  /** 本局内存超频次数 */
  overclocks?: number
}

export function RunSummaryCard({
  characterName,
  roleLabel,
  characterStats,
  skinStyle,
  skinName,
  cleared,
  floor,
  floorTotal,
  cause,
  kills,
  damageDealt,
  reward,
  durationLabel,
  bestFloor,
  memoryEff,
  memoryGained,
  memorySpent,
  maxFrags,
  defrags,
  overclocks,
}: RunSummaryCardProps) {
  const floorRatio = floorTotal > 0 ? Math.min(1, floor / floorTotal) : 0
  /* 内存效率评级配色：S 金 / A 霓虹青 / B 常规 / C 弱化 / D 警报（全走 token） */
  const gradeClass =
    memoryEff?.grade === "S"
      ? "text-sys-network"
      : memoryEff?.grade === "A"
        ? "text-primary"
        : memoryEff?.grade === "D"
          ? "text-destructive"
          : memoryEff?.grade === "C"
            ? "text-muted-foreground"
            : "text-foreground"

  const stats = [
    { label: "关掉标签", value: String(kills), icon: Skull },
    { label: "总伤害", value: String(damageDealt), icon: Flame },
    { label: "本局碎片", value: `+${reward}`, icon: Sparkles, accent: true },
    { label: "本局用时", value: durationLabel, icon: Clock },
  ]

  return (
    <section
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 rounded-2xl border bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5",
        skinStyle.border,
      )}
    >
      <span
        aria-hidden
        className={cn("mb-3 block h-1 w-full rounded-full", skinStyle.bar)}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            角色定位 · {roleLabel} · 外观{" "}
            <span className={cn("font-bold", skinStyle.accentText)}>
              {skinName}
            </span>
          </p>
          <h2 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {characterName}
          </h2>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs font-bold",
            cleared
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-destructive/60 bg-destructive/15 text-destructive",
          )}
        >
          {cleared ? (
            <Trophy className="h-3.5 w-3.5" />
          ) : (
            <Skull className="h-3.5 w-3.5" />
          )}
          {cleared ? "通关" : "倒下"}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="font-mono text-4xl font-bold tracking-tight sm:text-5xl">
          {floor}
          <span className="text-xl text-muted-foreground"> / {floorTotal}</span>
        </p>
        <p className="pb-1 font-mono text-xs text-muted-foreground">
          到达层数 · 历史最深 {bestFloor} 层
        </p>
      </div>

      <div
        aria-hidden
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-700 ease-out",
            cleared ? skinStyle.bar : "bg-destructive",
          )}
          style={{ width: `${Math.round(floorRatio * 100)}%` }}
        />
      </div>

      {characterStats.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md border border-border bg-background/40 p-3 sm:grid-cols-3 lg:grid-cols-5">
          {characterStats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-baseline justify-between gap-1"
            >
              <dt className="font-mono text-xs text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="font-mono text-xs font-bold">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="mt-3 rounded-md border border-dashed border-border bg-background/40 p-3 text-sm text-muted-foreground">
        {cause}
      </p>

      {memoryEff ? (
        <p
          title="内存效率 =（总产出 − 总消耗）÷ 总产出（产出不含每层回满）· S≥80% 额外 +50 碎片，A +30，B +15，C +5"
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-background/40 p-3 font-mono text-xs"
        >
          <span className="flex items-center gap-1.5 font-bold text-foreground">
            <Cpu className="h-3.5 w-3.5" />
            内存效率
          </span>
          <span className={cn("font-bold", gradeClass)}>
            {memoryEff.grade}（{Math.round(memoryEff.ratio * 100)}%）
          </span>
          <span className="text-muted-foreground">
            产出 {memoryGained ?? 0} · 消耗 {memorySpent ?? 0}
          </span>
          {memoryEff.bonus > 0 ? (
            <span className="font-bold text-primary">
              额外 +{memoryEff.bonus} 碎片
            </span>
          ) : null}
        </p>
      ) : null}

      {/* 深化包：内存管理战绩一行小字（旧档没有这些字段时整行不显） */}
      {maxFrags !== undefined ||
      defrags !== undefined ||
      overclocks !== undefined ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 px-1 font-mono text-xs text-muted-foreground">
          <span>🧩 碎片峰值 {maxFrags ?? 0}</span>
          <span aria-hidden>·</span>
          <span>整理 {defrags ?? 0} 次</span>
          <span aria-hidden>·</span>
          <span>⚡ 超频 {overclocks ?? 0} 次</span>
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-md border border-border bg-background/40 p-3"
          >
            <dt className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <stat.icon className="h-3.5 w-3.5" />
              {stat.label}
            </dt>
            <dd
              className={cn(
                "mt-1 font-mono text-xl font-bold",
                stat.accent ? skinStyle.accentText : "text-foreground",
              )}
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
