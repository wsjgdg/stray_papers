import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  CURSE_DEFS,
  DUNGEON_CHARACTERS,
  DUNGEON_RUN_FLOORS,
  dailyCharacterLabel,
  getDailyDateKey,
  getDailyMeta,
  getDailySeed,
  getDailyShortCode,
} from "@/lib/dungeonData"
import {
  DAILY_LEADERBOARD_LIMIT,
  fetchDailyLeaderboard,
  fetchWeeklyLeaderboard,
  getRhPlayerId,
  type DailyScoreRow,
} from "@/lib/dailyScore"
import { applyRankRewards, applyWeeklyMail } from "@/lib/economy"
import { loadDungeonSave, type DailyBestRecord } from "@/lib/dungeonSave"
import type { RhAccountInfo } from "@/lib/platform"

export type LeaderboardState = "loading" | "ready" | "empty" | "error"

const NOTICE_MS = 3200
const COPY_RESET_MS = 2400

/** 每日次数：正式 1 次 + 免费重试 1 次（重试打出更好成绩才覆盖上榜） */
export const DAILY_ATTEMPTS = 2

/** 距今夜 0 点还剩多少毫秒（每日 0 点换种子） */
function msToNextMidnight(): number {
  const now = new Date()
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  )
  return Math.max(0, next.getTime() - now.getTime())
}

/** 倒计时展示：还有 07:23:45 */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(total / 3600)).padStart(2, "0")
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0")
  const s = String(total % 60).padStart(2, "0")
  return `${h}:${m}:${s}`
}

export function useDaily() {
  const navigate = useNavigate()

  const dateKey = useMemo(() => getDailyDateKey(), [])
  const dailySeed = useMemo(() => getDailySeed(), [])
  const dailyShortCode = useMemo(() => getDailyShortCode(), [])
  const dateLabel = useMemo(() => {
    const parts = dateKey.split("-")
    const month = Number(parts[1])
    const day = Number(parts[2])
    if (!Number.isFinite(month) || !Number.isFinite(day)) return dateKey
    return `${month} 月 ${day} 日`
  }, [dateKey])

  /* 今日规则（全服一致）：轮换角色 / 诅咒 / 三个池子 */
  const dailyMeta = useMemo(() => getDailyMeta(), [])
  const characterLabel = useMemo(() => dailyCharacterLabel(dailyMeta), [dailyMeta])
  const curseLabel = useMemo(
    () =>
      dailyMeta.curseId === "none"
        ? "今日无诅咒"
        : `诅咒 · ${CURSE_DEFS[dailyMeta.curseId].name}`,
    [dailyMeta],
  )

  const save = useMemo(() => loadDungeonSave(), [])
  const [boardState, setBoardState] = useState<LeaderboardState>("loading")
  const [boardRows, setBoardRows] = useState<DailyScoreRow[]>([])
  const [weeklyRows, setWeeklyRows] = useState<DailyScoreRow[]>([])
  const [weeklyState, setWeeklyState] = useState<LeaderboardState>("loading")
  const [reloadKey, setReloadKey] = useState(0)
  const [myPlayerId, setMyPlayerId] = useState(() => getRhPlayerId())
  const [notice, setNotice] = useState<string | null>(null)
  const [copiedSeed, setCopiedSeed] = useState<string | null>(null)
  const [midnightInMs, setMidnightInMs] = useState(() => msToNextMidnight())

  const noticeTimer = useRef<number | null>(null)
  const copyTimer = useRef<number | null>(null)
  const seenPlayerId = useRef(myPlayerId)

  const pushNotice = useCallback((text: string) => {
    setNotice(text)
    if (typeof window === "undefined") return
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    }
  }, [])

  /* 0 点倒计时：每秒走一格，归零后下一分钟的 tick 自然跨过新一天 */
  useEffect(() => {
    const timer = window.setInterval(() => setMidnightInMs(msToNextMidnight()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  /* 日榜：进页 / 手动重试 / 登录后各拉一次 */
  useEffect(() => {
    let cancelled = false
    setBoardState("loading")
    fetchDailyLeaderboard(dateKey, dailySeed)
      .then((rows) => {
        if (cancelled) return
        setBoardRows(rows)
        setBoardState(rows.length > 0 ? "ready" : "empty")
      })
      .catch(() => {
        if (cancelled) return
        setBoardRows([])
        setBoardState("error")
      })
    return () => {
      cancelled = true
    }
  }, [dateKey, dailySeed, reloadKey])

  /* 周榜（近 7 天滚动，每人取最好一条）：拉取失败按空榜处理，不挡日榜 */
  const weeklyDateKeys = useMemo(() => {
    const keys: string[] = []
    for (let i = 0; i < 7; i++) {
      const day = new Date()
      day.setDate(day.getDate() - i)
      keys.push(getDailyDateKey(day))
    }
    return keys
  }, [])
  useEffect(() => {
    let cancelled = false
    setWeeklyState("loading")
    fetchWeeklyLeaderboard(weeklyDateKeys)
      .then((rows) => {
        if (cancelled) return
        setWeeklyRows(rows)
        setWeeklyState(rows.length > 0 ? "ready" : "empty")
      })
      .catch(() => {
        if (cancelled) return
        setWeeklyRows([])
        setWeeklyState("error")
      })
    return () => {
      cancelled = true
    }
  }, [weeklyDateKeys, reloadKey])

  /* 周一进页 = 上周滚动作结算：按我在周榜的名次补发一封周榜奖励信 */
  const weeklyMailDone = useRef(false)
  useEffect(() => {
    if (weeklyMailDone.current) return
    if (weeklyState !== "ready" || !myPlayerId) return
    if (new Date().getDay() !== 1) return
    weeklyMailDone.current = true
    const idx = weeklyRows.findIndex((row) => row.player_id === myPlayerId)
    if (idx < 0) return
    const lastSunday = new Date()
    lastSunday.setDate(lastSunday.getDate() - 1)
    const applied = applyWeeklyMail(idx + 1, getDailyDateKey(lastSunday))
    if (applied.item) pushNotice("周榜奖励已放进奖励信箱")
  }, [myPlayerId, pushNotice, weeklyRows, weeklyState])

  /* 昨天打过但结算页没查到名次（断网 / 秒退）→ 进页补算一次名次发信 */
  const yesterdayKey = useMemo(() => {
    const day = new Date()
    day.setDate(day.getDate() - 1)
    return getDailyDateKey(day)
  }, [])
  const yesterdayBackfilled = useRef(false)
  useEffect(() => {
    if (yesterdayBackfilled.current) return
    if (!myPlayerId) return
    if (!save.dailyBest[yesterdayKey]) return
    if (save.mailItems.some((mail) => mail.id === `daily:${yesterdayKey}`)) return
    yesterdayBackfilled.current = true
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    fetchDailyLeaderboard(yesterdayKey, getDailySeed(yesterday))
      .then((rows) => {
        const idx = rows.findIndex((row) => row.player_id === myPlayerId)
        if (idx < 0) return
        const ranked = applyRankRewards(idx + 1, yesterdayKey)
        if (ranked?.items.some((item) => item.mail)) {
          pushNotice(`昨天第 ${idx + 1} 名，奖励已放进奖励信箱`)
        }
      })
      .catch(() => undefined)
  }, [myPlayerId, pushNotice, save.dailyBest, save.mailItems, yesterdayKey])

  /* 登录态变化（点账号菜单登录成功）→ 重新拉榜单，好让自己那行出现 */
  useEffect(() => {
    if (!myPlayerId || myPlayerId === seenPlayerId.current) return
    seenPlayerId.current = myPlayerId
    setReloadKey((key) => key + 1)
  }, [myPlayerId])

  const handleAccountChange = useCallback((account: RhAccountInfo | null) => {
    setMyPlayerId(account?.userId ?? getRhPlayerId())
  }, [])

  const bestToday: DailyBestRecord | null = save.dailyBest[dateKey] ?? null

  /* 每天正式 1 次 + 重试 1 次：进本那一刻已计数（含中途退出），两次用完才锁 */
  const dailyRunsToday = save.dailyRunsByDate[dateKey] ?? 0
  const dailyAttemptsLeft = Math.max(0, DAILY_ATTEMPTS - dailyRunsToday)
  const dailyDone = dailyRunsToday >= DAILY_ATTEMPTS
  /** 用完正式那次、还剩重试机会 */
  const canRetry = dailyRunsToday === 1

  const myRankIndex = boardRows.findIndex(
    (row) => row.player_id.length > 0 && row.player_id === myPlayerId,
  )
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null
  const loggedIn = myPlayerId.length > 0

  const copySeed = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(dailySeed)
        setCopiedSeed(dailySeed)
        if (typeof window !== "undefined") {
          if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
          copyTimer.current = window.setTimeout(
            () => setCopiedSeed(null),
            COPY_RESET_MS,
          )
        }
        pushNotice(`种子码 ${dailySeed} 已复制`)
        return
      }
      throw new Error("clipboard unavailable")
    } catch {
      setCopiedSeed(null)
      pushNotice("复制没成功，长按种子码手动选中即可")
    }
  }, [dailySeed, pushNotice])

  const startDailyRun = useCallback(() => {
    const current = loadDungeonSave()
    const meta = getDailyMeta()
    /* 双保险：View 已置灰按钮，这里再拦一层（防旧页面 / 快捷进入） */
    if ((current.dailyRunsByDate[getDailyDateKey()] ?? 0) >= DAILY_ATTEMPTS) {
      pushNotice("今天的挑战次数用完了，明天 0 点刷新种子")
      return
    }
    /* 周一~周四固定轮换、周五六随机：轮换日必须用当天指定的角色（未解锁也临时可用） */
    const fixed = meta.fixedCharacterId
    const candidate =
      (fixed
        ? DUNGEON_CHARACTERS.find((item) => item.id === fixed)
        : DUNGEON_CHARACTERS.find(
            (item) =>
              item.id === current.lastCharacterId &&
              current.unlockedCharacters.includes(item.id),
          ) ??
          DUNGEON_CHARACTERS.find((item) =>
            current.unlockedCharacters.includes(item.id),
          )) ?? DUNGEON_CHARACTERS[0]
    const params = new URLSearchParams({
      char: candidate.id,
      seed: dailySeed,
      daily: "1",
    })
    navigate(`/dungeon?${params.toString()}`)
  }, [dailySeed, navigate, pushNotice])

  const goHome = useCallback(() => {
    navigate("/")
  }, [navigate])

  const reloadBoard = useCallback(() => {
    setReloadKey((key) => key + 1)
  }, [])

  return {
    dateKey,
    dateLabel,
    dailySeed,
    dailyShortCode,
    dailyDone,
    /* 今日规则预览 + 次数 + 0 点倒计时 */
    characterLabel,
    curseLabel,
    relicPoolSize: dailyMeta.relicPool.length,
    routePoolSize: dailyMeta.routePool.length,
    enemyPoolSize: dailyMeta.enemyPool.length,
    dailyAttemptsLeft,
    dailyAttemptsTotal: DAILY_ATTEMPTS,
    canRetry,
    countdownLabel: formatCountdown(midnightInMs),
    bestToday,
    floorTotal: DUNGEON_RUN_FLOORS.length,
    boardState,
    boardRows,
    boardLimit: DAILY_LEADERBOARD_LIMIT,
    weeklyState,
    weeklyRows,
    myRank,
    fragments: save.fragments,
    cores: save.cores,
    seeds: save.seedTokens,
    loggedIn,
    notice,
    copiedSeed,
    copySeed,
    startDailyRun,
    goHome,
    reloadBoard,
    handleAccountChange,
  }
}
