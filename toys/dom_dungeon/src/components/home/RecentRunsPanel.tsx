import { History } from "lucide-react"

import { scoreGradeTextClass, type RunScoreResult } from "@/lib/dailyScore"
import type { DungeonRunRecord } from "@/lib/dungeonData"

type RecentRunEntry = {
  record: DungeonRunRecord
  score: RunScoreResult
}

type RecentRunsPanelProps = {
  runs: RecentRunEntry[]
}

const MAX_ROWS = 10

/** 趋势柱的底色：与评级同色系（SSS 用三色渐变近似彩虹） */
function gradeBarClass(grade: RunScoreResult["grade"]): string {
  switch (grade) {
    case "SSS":
      return "bg-gradient-to-t from-sys-script via-sys-style to-sys-network"
    case "SS":
    case "S":
      return "bg-sys-style"
    case "A":
      return "bg-sys-script"
    case "B":
      return "bg-sys-cache"
    case "C":
      return "bg-sys-network"
    default:
      return "bg-muted-foreground/60"
  }
}

function formatDate(endedAt: string): string {
  /* ISO 字符串 → MM-DD；异常值直接显示占位 */
  return /^\d{4}-\d{2}-\d{2}/.test(endedAt) ? endedAt.slice(5, 10) : "--/--"
}

function formatDurationLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds} 秒`
}

/**
 * 历史战绩（《Build 评分公式》八）：最近 10 局逐局评级 + 评分趋势柱。
 * 分数在这里按当前公式现算，老战绩的评分会随着公式一起更新。
 */
export function RecentRunsPanel({ runs }: RecentRunsPanelProps) {
  if (runs.length === 0) return null

  const rows = runs.slice(0, MAX_ROWS)
  const bestScore = rows.reduce(
    (best, entry) => (entry.score.total > best.score.total ? entry : best),
    rows[0],
  )
  const deepest = Math.max(...rows.map((entry) => entry.record.floor))
  const fastestClear = rows
    .filter((entry) => entry.record.cleared)
    .reduce<number | null>(
      (fastest, entry) =>
        fastest === null || (entry.record.durationMs ?? 0) < fastest
          ? entry.record.durationMs ?? 0
          : fastest,
      null,
    )
  /* 趋势柱：按时间正序（存档里最新在前，倒过来就是老→新） */
  const trend = [...rows].reverse()

  return (
    <section className="animate-in fade-in rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-md sm:p-5">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <h2 className="font-display text-lg font-bold">历史战绩</h2>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
        <span>
          最佳评分{" "}
          <span className={`font-bold ${scoreGradeTextClass(bestScore.score.grade)}`}>
            {bestScore.score.grade} {bestScore.score.total.toFixed(1)}
          </span>
        </span>
        <span>最深第 {deepest} 层</span>
        {fastestClear !== null ? (
          <span>最快通关 {formatDurationLabel(fastestClear)}</span>
        ) : null}
      </div>

      {/* 评分趋势：最近 10 局（老 → 新），柱高 = 综合分 */}
      <div
        className="mt-3 flex h-12 items-end gap-1.5"
        aria-label="最近 10 局评分趋势"
      >
        {trend.map((entry) => (
          <div
            key={`${entry.record.seed}:${entry.record.endedAt}`}
            title={`${formatDate(entry.record.endedAt)} · 第 ${entry.record.floor} 层 · ${entry.score.grade} ${entry.score.total.toFixed(1)}`}
            className={`flex-1 rounded-t-sm ${gradeBarClass(entry.score.grade)}`}
            style={{ height: `${Math.max(8, entry.score.total)}%` }}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-col divide-y divide-border">
        {rows.map((entry) => (
          <li
            key={`${entry.record.seed}:${entry.record.endedAt}`}
            className="flex items-center gap-3 py-1.5 font-mono text-xs"
          >
            <span className="w-11 shrink-0 text-muted-foreground">
              {formatDate(entry.record.endedAt)}
            </span>
            <span className="w-14 shrink-0">第 {entry.record.floor} 层</span>
            <span
              className={`w-9 shrink-0 text-center text-sm font-bold ${scoreGradeTextClass(
                entry.score.grade,
              )}`}
            >
              {entry.score.grade}
            </span>
            <span className="w-12 shrink-0 tabular-nums text-card-foreground">
              {entry.score.total.toFixed(1)}
            </span>
            <span className="ml-auto shrink-0 text-muted-foreground">
              {entry.record.seed.slice(0, 4)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
