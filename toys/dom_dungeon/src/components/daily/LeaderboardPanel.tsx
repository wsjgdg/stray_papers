import { useState } from "react"
import { AlertTriangle, CalendarRange, RefreshCw, Trophy } from "lucide-react"

import type { LeaderboardState } from "@/pages/Daily/useDaily"
import {
  formatScoreDuration,
  scoreGradeOf,
  scoreGradeTextClass,
  type DailyScoreRow,
} from "@/lib/dailyScore"
import { DUNGEON_CHARACTERS, findCharacter, type CharacterId } from "@/lib/dungeonData"

type LeaderboardPanelProps = {
  boardState: LeaderboardState
  boardRows: DailyScoreRow[]
  boardLimit: number
  myRank: number | null
  loggedIn: boolean
  weeklyState: LeaderboardState
  weeklyRows: DailyScoreRow[]
  onReload: () => void
}

/** 名次称号徽章：1 冠军 / 2-3 前三 / 4-10 前十 */
function titleBadgeOf(rank: number): string | null {
  if (rank === 1) return "每日冠军"
  if (rank <= 3) return "每日前三"
  if (rank <= 10) return "每日前十"
  return null
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) return "border-primary/60 bg-primary/15 text-primary"
  if (rank <= 3) return "border-border bg-secondary/70 text-secondary-foreground"
  return "border-border bg-secondary/40 text-muted-foreground"
}

/** 角色简称：直接吃行上的 character id，旧记录没有就不显示 */
function characterTagOf(row: DailyScoreRow): string | null {
  if (!row.character) return null
  return findCharacter(row.character as CharacterId)?.roleLabel ?? null
}

function ScoreRow({
  row,
  rank,
  isMine,
}: {
  row: DailyScoreRow
  rank: number
  isMine: boolean
}) {
  const isTop = rank <= 3
  const title = titleBadgeOf(rank)
  const characterTag = characterTagOf(row)
  const total = row.total_score ?? row.build_score
  return (
    <li
      className={[
        "flex items-center gap-3 rounded-lg border p-3 transition",
        isTop ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30",
        isMine ? "ring-1 ring-primary" : "",
      ].join(" ")}
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-xs font-bold ${rankBadgeClass(rank)}`}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-display text-sm font-bold">
          <span className="truncate">{row.player_name || "无名标签"}</span>
          {title ? (
            <span className="shrink-0 rounded-sm border border-primary/50 px-1 font-mono text-xs text-primary">
              {title}
            </span>
          ) : null}
          {characterTag ? (
            <span className="hidden shrink-0 rounded-sm border border-border px-1 font-mono text-xs text-muted-foreground sm:inline">
              {characterTag}
            </span>
          ) : null}
          {isMine ? (
            <span className="shrink-0 rounded-sm border border-border px-1 font-mono text-xs text-muted-foreground">
              我
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
          <span>
            第 {row.floor} 层{row.cleared ? " · 已通关" : ""}
          </span>
          <span>{formatScoreDuration(row.duration_ms)}</span>
          <span>血量 {row.hp_left}</span>
          <span>
            评分{" "}
            <span
              className={`font-bold ${scoreGradeTextClass(scoreGradeOf(Number(total)))}`}
            >
              {scoreGradeOf(Number(total))}
            </span>{" "}
            {Number(total).toFixed(1)}
          </span>
        </p>
      </div>
    </li>
  )
}

/* 日榜 / 周榜共用的列渲染 */
function BoardList({
  rows,
  myRank,
}: {
  rows: DailyScoreRow[]
  myRank?: number | null
}) {
  return (
    <ol className="space-y-2">
      {rows.map((row, index) => (
        <ScoreRow
          key={row.id}
          row={row}
          rank={index + 1}
          isMine={Boolean(myRank) && myRank === index + 1}
        />
      ))}
    </ol>
  )
}

function LoadingSkeleton() {
  return (
    <ul className="space-y-2" aria-label="排行榜加载中">
      {[0, 1, 2, 3, 4].map((index) => (
        <li
          key={index}
          className="flex items-center gap-3 rounded-lg border border-border bg-secondary/20 p-3"
        >
          <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-secondary" />
          <span className="h-3 flex-1 animate-pulse rounded-sm bg-secondary" />
          <span className="h-3 w-16 animate-pulse rounded-sm bg-secondary" />
        </li>
      ))}
    </ul>
  )
}

/**
 * 排行榜：今日 / 每周两个页签；今日榜支持按角色过滤（旧记录没带角色，只在「全部」显示）。
 * 并列名次已按同一套规则排序，同层同用时更快者在前。
 */
export function LeaderboardPanel({
  boardState,
  boardRows,
  boardLimit,
  myRank,
  loggedIn,
  weeklyState,
  weeklyRows,
  onReload,
}: LeaderboardPanelProps) {
  const [tab, setTab] = useState<"daily" | "weekly">("daily")
  const [characterFilter, setCharacterFilter] = useState<string | null>(null)

  const dailyRows = characterFilter
    ? boardRows.filter((row) => row.character === characterFilter)
    : boardRows
  /* 出现过的角色才给过滤按钮，避免一排永远为空的按钮 */
  const seenCharacters = DUNGEON_CHARACTERS.filter((character) =>
    boardRows.some((row) => row.character === character.id),
  )

  const activeState = tab === "daily" ? boardState : weeklyState
  const activeRows = tab === "daily" ? dailyRows : weeklyRows

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-md">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary"
        >
          <Trophy className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">
            {tab === "daily" ? "今日排行榜" : "每周排行榜"}
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            {tab === "daily"
              ? `前 ${boardLimit} 名 · 层数 → 用时 → 血量 → 评分`
              : "近 7 天滚动 · 每人取最好一次"}
          </p>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
      </div>

      {/* 页签：今日 / 每周 */}
      <div className="mt-4 flex gap-1 rounded-md border border-border bg-secondary/30 p-1">
        {(
          [
            { key: "daily", label: "今日榜" },
            { key: "weekly", label: "每周榜" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={
              tab === item.key
                ? "flex-1 rounded-sm bg-primary px-3 py-1.5 font-mono text-xs font-bold text-primary-foreground"
                : "flex-1 rounded-sm px-3 py-1.5 font-mono text-xs text-muted-foreground transition hover:text-primary"
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 角色过滤只作用于今日榜 */}
      {tab === "daily" && seenCharacters.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCharacterFilter(null)}
            className={
              characterFilter === null
                ? "rounded-full border border-primary/60 bg-primary/15 px-2.5 py-1 font-mono text-xs font-bold text-primary"
                : "rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary"
            }
          >
            全部角色
          </button>
          {seenCharacters.map((character) => (
            <button
              key={character.id}
              type="button"
              onClick={() => setCharacterFilter(character.id)}
              className={
                characterFilter === character.id
                  ? "rounded-full border border-primary/60 bg-primary/15 px-2.5 py-1 font-mono text-xs font-bold text-primary"
                  : "rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary"
              }
            >
              {character.displayName}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex-1">
        {activeState === "loading" ? <LoadingSkeleton /> : null}

        {activeState === "empty" ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30 p-6 text-center">
            <p className="font-display text-base font-bold">
              {tab === "daily"
                ? "今天还没有人上榜，你可以是第一个"
                : "这周还没有人上榜，你可以是第一个"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              打完一局就会自动出现在这里。
            </p>
          </div>
        ) : null}

        {activeState === "error" ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="mt-2 text-sm text-destructive">
              排行榜暂时没加载出来，可能是网络抖了一下。
            </p>
            <button
              type="button"
              onClick={onReload}
              className="mt-3 inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重新加载
            </button>
          </div>
        ) : null}

        {activeState === "ready" && characterFilter && dailyRows.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              这个角色今天还没人上榜。
            </p>
          </div>
        ) : null}

        {activeState === "ready" &&
        (!characterFilter || dailyRows.length > 0) ? (
          <BoardList rows={activeRows} myRank={tab === "daily" ? myRank : null} />
        ) : null}
      </div>

      {/* 赛季占位：S1 进行中，赛季皮肤等结算时上线 */}
      <p className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/30 p-3 font-mono text-xs text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
        S1 赛季进行中 · 赛季奖励在赛季结束时统一结算
      </p>

      {!loggedIn ? (
        <p className="mt-3 rounded-lg border border-dashed border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
          你现在是游客：成绩只存在本机。点右上角头像登录后，成绩才能上榜。
        </p>
      ) : tab === "daily" && myRank ? (
        <p className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-3 font-mono text-xs text-primary">
          你当前排在第 {myRank} 名
        </p>
      ) : tab === "daily" ? (
        <p className="mt-3 rounded-lg border border-dashed border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
          你还没进今日榜：打完一局今日挑战就会自动上榜。
        </p>
      ) : null}
    </section>
  )
}
