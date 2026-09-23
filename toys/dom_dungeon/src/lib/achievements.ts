/**
 * 《标签地牢》成就系统（见 .rh/economy-spec.md）。
 * 纯定义 + 判定：所有奖励发放由 economy.ts 统一执行，这里不动存档。
 */

import {
  DUNGEON_CHARACTERS,
  RELIC_POOL,
  SPEEDRUN_LIMIT_MS,
} from "@/lib/dungeonData"
import type { DungeonSave } from "@/lib/dungeonSave"

export type AchievementReward = {
  fragments: number
  cores: number
  seeds: number
}

export type AchievementDef = {
  id: string
  name: string
  desc: string
  reward: AchievementReward
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: "first-clear",
    name: "首次通关",
    desc: "把第 8 层的崩溃页面关掉一次。",
    reward: { fragments: 100, cores: 3, seeds: 1 },
  },
  {
    id: "no-damage",
    name: "无伤通关",
    desc: "全程一滴血没掉，通关。",
    reward: { fragments: 200, cores: 5, seeds: 1 },
  },
  {
    id: "speedrun-3min",
    name: "3 分钟内通关",
    desc: "从进地牢到通关不超过 3 分钟。",
    reward: { fragments: 150, cores: 3, seeds: 0 },
  },
  {
    id: "same-school-6",
    name: "单局 6 词条同系",
    desc: "一局里凑出 6 个同一系的词条。",
    reward: { fragments: 100, cores: 2, seeds: 0 },
  },
  {
    id: "bonds-3",
    name: "点亮 3 个流派",
    desc: "一局里同时点亮 3 条流派 combo。",
    reward: { fragments: 150, cores: 3, seeds: 0 },
  },
  {
    id: "all-chars-clear",
    name: "四角色各通关 1 次",
    desc: "每个角色都至少通关一遍。",
    reward: { fragments: 300, cores: 5, seeds: 1 },
  },
  {
    id: "clear-10",
    name: "通关 10 次",
    desc: "累计通关 10 局。",
    reward: { fragments: 500, cores: 5, seeds: 2 },
  },
  {
    id: "clear-50",
    name: "通关 50 次",
    desc: "累计通关 50 局。",
    reward: { fragments: 1000, cores: 10, seeds: 5 },
  },
  {
    id: "codex-full",
    name: "词条图鉴全收集",
    desc: "在实战中集齐全部词条（购买补全不算）。",
    reward: { fragments: 300, cores: 5, seeds: 0 },
  },
  {
    id: "daily-streak-7",
    name: "每日挑战连续 7 天",
    desc: "连续 7 天每天至少打一局每日挑战。",
    reward: { fragments: 200, cores: 3, seeds: 1 },
  },
  {
    id: "daily-streak-30",
    name: "每日挑战连续 30 天",
    desc: "连续 30 天每天至少打一局每日挑战。",
    reward: { fragments: 800, cores: 8, seeds: 3 },
  },
  {
    id: "top-10",
    name: "排行榜前 10",
    desc: "当日每日挑战榜单冲进前 10。",
    reward: { fragments: 300, cores: 5, seeds: 2 },
  },
  {
    id: "top-1",
    name: "排行榜第 1",
    desc: "当日每日挑战榜单登顶。",
    reward: { fragments: 500, cores: 10, seeds: 5 },
  },
  {
    id: "admin-slayer",
    name: "掀翻管理员",
    desc: "击败那个来删你档的隐藏 Boss。",
    reward: { fragments: 500, cores: 10, seeds: 3 },
  },
]

/** 本局跑出来的判定条件（结算页组装） */
export type AchievementRunContext = {
  cleared: boolean
  characterId: string
  durationMs: number
  noDamage: boolean
  /** 本局同时点亮的流派 combo 条数 */
  bondCount: number
  /** 本局同一系的词条最大个数 */
  maxSchoolCount: number
  /** 每日挑战榜单名次；没上榜 / 没查到为 null */
  leaderboardRank: number | null
  /** 本局击败了管理员（fun-pack4.md 二 → 成就「掀翻管理员」） */
  adminDefeated: boolean
}

function allCharacterIds(): string[] {
  return DUNGEON_CHARACTERS.map((item) => item.id)
}

function relicCollected(save: DungeonSave): boolean {
  const seen = new Set(save.seenRelicIds)
  return RELIC_POOL.every((relic) => seen.has(relic.id))
}

/** 从今天（todayKey）往前数，每日挑战连续打卡的天数 */
export function dailyStreakDays(dates: string[], todayKey: string): number {
  if (dates.length === 0 || todayKey.length !== 8) return 0
  const set = new Set(dates)
  const year = Number(todayKey.slice(0, 4))
  const month = Number(todayKey.slice(4, 6))
  const day = Number(todayKey.slice(6, 8))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return 0
  }
  let streak = 0
  for (let back = 0; back < 60; back += 1) {
    const probe = new Date(year, month - 1, day - back)
    const m = String(probe.getMonth() + 1).padStart(2, "0")
    const d = String(probe.getDate()).padStart(2, "0")
    const key = `${probe.getFullYear()}${m}${d}`
    if (set.has(key)) streak += 1
    else break
  }
  return streak
}

/** 达成新成就：返回「存档里还没有、本局条件满足」的清单（按定义顺序） */
export function checkNewAchievements(
  save: DungeonSave,
  ctx: AchievementRunContext,
  todayKey: string,
): AchievementDef[] {
  const unlocked = new Set(save.unlockedAchievements)
  const streak = dailyStreakDays(save.dailyPlayDates, todayKey)
  const clearedChars = new Set(save.clearedCharacterIds)

  const holds: Record<string, boolean> = {
    "first-clear": ctx.cleared,
    "no-damage": ctx.noDamage,
    "speedrun-3min": ctx.cleared && ctx.durationMs <= SPEEDRUN_LIMIT_MS,
    "same-school-6": ctx.maxSchoolCount >= 6,
    "bonds-3": ctx.bondCount >= 3,
    "all-chars-clear": allCharacterIds().every((id) => clearedChars.has(id)),
    "clear-10": save.runTally.cleared >= 10,
    "clear-50": save.runTally.cleared >= 50,
    "codex-full": relicCollected(save),
    "daily-streak-7": streak >= 7,
    "daily-streak-30": streak >= 30,
    "top-10": ctx.leaderboardRank !== null && ctx.leaderboardRank <= 10,
    "top-1": ctx.leaderboardRank === 1,
    "admin-slayer": ctx.adminDefeated,
  }

  return ACHIEVEMENT_DEFS.filter((def) => holds[def.id] === true && !unlocked.has(def.id))
}

/** 图鉴成就页签的进度文案：能量化进度的给「x / y」，否则 null */
export function achievementProgressLabel(
  save: DungeonSave,
  defId: string,
  todayKey: string,
): string | null {
  switch (defId) {
    case "clear-10":
      return `${Math.min(save.runTally.cleared, 10)} / 10`
    case "clear-50":
      return `${Math.min(save.runTally.cleared, 50)} / 50`
    case "all-chars-clear":
      return `${save.clearedCharacterIds.length} / ${DUNGEON_CHARACTERS.length}`
    case "codex-full":
      return `${save.seenRelicIds.length} / ${RELIC_POOL.length}`
    case "daily-streak-7":
      return `${Math.min(dailyStreakDays(save.dailyPlayDates, todayKey), 7)} / 7`
    case "daily-streak-30":
      return `${Math.min(dailyStreakDays(save.dailyPlayDates, todayKey), 30)} / 30`
    default:
      return null
  }
}
