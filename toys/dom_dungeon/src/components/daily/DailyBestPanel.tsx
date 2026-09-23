import { Trophy } from "lucide-react"

import { formatScoreDuration } from "@/lib/dailyScore"
import type { DailyBestRecord } from "@/lib/dungeonSave"

type DailyBestPanelProps = {
  bestToday: DailyBestRecord | null
  floorTotal: number
}

export function DailyBestPanel({ bestToday, floorTotal }: DailyBestPanelProps) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-md">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-secondary/60 text-muted-foreground"
        >
          <Trophy className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold">今日最好成绩</h2>
          <p className="font-mono text-xs text-muted-foreground">本机记录 · 不用登录</p>
        </div>
      </div>

      {bestToday ? (
        <>
          <p className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-display text-2xl font-bold text-primary">
              {bestToday.floor} / {floorTotal}
            </span>
            <span
              className={
                bestToday.cleared
                  ? "rounded-sm border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary"
                  : "rounded-sm border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground"
              }
            >
              {bestToday.cleared ? "已通关" : "倒在半路"}
            </span>
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border bg-secondary/40 p-2">
              <dt className="font-mono text-xs text-muted-foreground">用时</dt>
              <dd className="mt-1 font-display text-sm font-bold">
                {formatScoreDuration(bestToday.durationMs)}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-secondary/40 p-2">
              <dt className="font-mono text-xs text-muted-foreground">剩余血量</dt>
              <dd className="mt-1 font-display text-sm font-bold">
                {bestToday.hpLeft}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-secondary/40 p-2">
              <dt className="font-mono text-xs text-muted-foreground">Build 评分</dt>
              <dd className="mt-1 font-display text-sm font-bold text-primary">
                {bestToday.buildScore}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            今天再打一局，更好的一局会自动顶掉它。
          </p>
        </>
      ) : (
        <div className="mt-4 flex flex-1 flex-col justify-center rounded-lg border border-dashed border-border bg-secondary/30 p-4">
          <p className="font-display text-base font-bold">今天还没挑战过</p>
          <p className="mt-1 text-sm text-muted-foreground">
            第一局就是你的起点，先打完 8 层试试水。
          </p>
        </div>
      )}
    </section>
  )
}
