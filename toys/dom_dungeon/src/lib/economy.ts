/**
 * 《标签地牢》结算发放（见 .rh/economy-spec.md）。
 * 每局只发一次：用 runRecord.endedAt 写进存档 lastSettledAt 防刷新重发。
 * 榜单奖励（名次核心 / 种子、前 10 / 第 1 成就）单独走 applyRankRewards，
 * 因为它要等每日挑战上报 + 查榜拿到名次后才发。
 */

import {
  BOSS_FIRST_CORE,
  DAILY_CHALLENGE_REWARD,
  DEMO_RUN,
  FIRST_WIN_BONUS,
  clearBonusForDailyClears,
  getActiveBondDefs,
  getDailySeed,
  getRelicSchoolCounts,
  resolveRunRelics,
  type DungeonRunRecord,
} from "@/lib/dungeonData"
import {
  bumpClearsToday,
  claimDailyChallengeReward,
  claimFirstWinBonus,
  grantMailItem,
  grantRewards,
  loadDungeonSave,
  recordClearedCharacter,
  recordDailyPlayDate,
  recordRunTally,
  writeDungeonSave,
  type DungeonSave,
} from "@/lib/dungeonSave"
import {
  ACHIEVEMENT_DEFS,
  checkNewAchievements,
  type AchievementDef,
  type AchievementRunContext,
} from "@/lib/achievements"
import type { ScoreGrade } from "@/lib/dailyScore"

export type SettleItem = {
  label: string
  fragments?: number
  cores?: number
  seeds?: number
  /** true = 奖励没有直接入账，而是放进了奖励信箱待领取 */
  mail?: boolean
}

export type SettleResult = {
  save: DungeonSave
  /** 本局里程碑收益明细（结算页列表展示） */
  items: SettleItem[]
  /** 本局新达成的成就（结算页横幅展示） */
  achievements: AchievementDef[]
}

function maxSchoolOf(relics: ReturnType<typeof resolveRunRelics>): number {
  const counts = getRelicSchoolCounts(relics)
  return Math.max(0, counts.script, counts.style, counts.network, counts.cache)
}

/** 本局结算：里程碑碎片 / 核心 / 种子 / 成就一次发齐。已结算或示例战绩返回 null。 */
export function settleEndgameRewards(
  runRecord: DungeonRunRecord,
  dateKey: string,
): SettleResult | null {
  if (runRecord.seed === DEMO_RUN.seed) return null
  const initial = loadDungeonSave()
  if (initial.lastSettledAt === runRecord.endedAt) return null

  const cleared = runRecord.cleared ?? runRecord.floor >= 8
  const isDaily = runRecord.seed === getDailySeed()

  /* 先记战绩 / 角色通关 / 每日打卡，让成就判定能数到本局这一笔 */
  recordRunTally({
    dateKey,
    floor: runRecord.floor,
    cleared,
    /* fun-pack4.md 二：死亡过 = 断掉无死连击；打赢管理员 = 点亮开发者模式 */
    died: runRecord.died ?? !cleared,
    devModeUnlock: runRecord.adminDefeated === true,
  })
  if (cleared) recordClearedCharacter(runRecord.characterId)
  if (isDaily) recordDailyPlayDate(dateKey)

  const items: SettleItem[] = []
  let save = loadDungeonSave()

  /* 每日首胜：当天第一次通关 +100（通关奖励本体在地牢局终已按递减入账） */
  if (cleared) {
    const claim = claimFirstWinBonus(dateKey)
    save = claim.save
    if (claim.claimed) {
      save = grantRewards(save, { fragments: FIRST_WIN_BONUS })
      items.push({ label: "每日首胜", fragments: FIRST_WIN_BONUS })
    }
  }

  /* 每日挑战参与奖：当天打过一局就 +50（名次奖励走奖励信箱） */
  if (isDaily) {
    const claim = claimDailyChallengeReward(dateKey)
    save = claim.save
    if (claim.claimed) {
      save = grantRewards(save, { fragments: DAILY_CHALLENGE_REWARD })
      items.push({ label: "每日挑战参与奖", fragments: DAILY_CHALLENGE_REWARD })
    }
  }

  /* 首次击杀 Boss 的一次性核心（boss 击败记录局终已写档，这里只补发里程碑） */
  const milestones = new Set(save.coreMilestones)
  const bossCores = Object.entries(BOSS_FIRST_CORE).filter(
    ([bossId]) => save.defeatedBossIds.includes(bossId) && !milestones.has(bossId),
  )
  if (bossCores.length > 0) {
    const gained = bossCores.reduce((sum, [, core]) => sum + core, 0)
    save = writeDungeonSave({
      ...save,
      cores: save.cores + gained,
      coreMilestones: Array.from(new Set([...save.coreMilestones, ...bossCores.map(([id]) => id)])),
    })
    items.push({ label: "首次击杀 Boss", cores: gained })
  }

  /* 每次通关 +1 种子 */
  if (cleared) {
    save = grantRewards(save, { seeds: 1 })
    items.push({ label: "通关奖励 · 种子", seeds: 1 })
  }

  /* 成就判定（榜单类成就等查榜后走 applyRankRewards） */
  const relics = resolveRunRelics(runRecord)
  const ctx: AchievementRunContext = {
    cleared,
    characterId: runRecord.characterId,
    durationMs: runRecord.durationMs ?? 0,
    noDamage: runRecord.noDamage === true,
    bondCount: getActiveBondDefs(relics).length,
    maxSchoolCount: maxSchoolOf(relics),
    leaderboardRank: null,
    adminDefeated: runRecord.adminDefeated === true,
  }
  const fresh = checkNewAchievements(save, ctx, dateKey)
  if (fresh.length > 0) {
    save = grantRewards(
      save,
      fresh.reduce(
        (acc, def) => ({
          fragments: acc.fragments + def.reward.fragments,
          cores: acc.cores + def.reward.cores,
          seeds: acc.seeds + def.reward.seeds,
        }),
        { fragments: 0, cores: 0, seeds: 0 },
      ),
    )
    save = writeDungeonSave({
      ...save,
      unlockedAchievements: Array.from(
        new Set([...save.unlockedAchievements, ...fresh.map((def) => def.id)]),
      ),
    })
  }

  save = writeDungeonSave({ ...save, lastSettledAt: runRecord.endedAt })
  return { save, items, achievements: fresh }
}

/**
 * 每日名次奖励表（每日挑战规则：奖励以信件形式进奖励信箱，7 天未领过期）。
 * 并列名次共享同一档奖励。
 */
const DAILY_RANK_TIERS: {
  max: number
  fragments: number
  cores: number
  seeds: number
  title: string
}[] = [
  { max: 1, fragments: 300, cores: 5, seeds: 3, title: "每日冠军" },
  { max: 3, fragments: 200, cores: 3, seeds: 2, title: "每日前三" },
  { max: 10, fragments: 150, cores: 2, seeds: 1, title: "每日前十" },
  { max: 100, fragments: 100, cores: 1, seeds: 0, title: "" },
  { max: 1000, fragments: 80, cores: 0, seeds: 0, title: "" },
]

/** 周榜奖励表：周一 0 点后第一次打开每日页时按周榜名次结算一封 */
const WEEKLY_RANK_TIERS: {
  max: number
  fragments: number
  cores: number
  seeds: number
}[] = [
  { max: 1, fragments: 1000, cores: 15, seeds: 10 },
  { max: 10, fragments: 600, cores: 10, seeds: 5 },
  { max: 100, fragments: 300, cores: 5, seeds: 2 },
  { max: Number.MAX_SAFE_INTEGER, fragments: 100, cores: 1, seeds: 0 },
]

/* 《Build 评分公式》四：综合评分等级 → 一次性加成（叠加在基础结算上） */
const GRADE_REWARDS: Record<ScoreGrade, SettleItem> = {
  SSS: { label: "评分奖励 · SSS", fragments: 200, cores: 3, seeds: 1 },
  SS: { label: "评分奖励 · SS", fragments: 150, cores: 2, seeds: 1 },
  S: { label: "评分奖励 · S", fragments: 100, cores: 2, seeds: 0 },
  A: { label: "评分奖励 · A", fragments: 60, cores: 1, seeds: 0 },
  B: { label: "评分奖励 · B", fragments: 30, cores: 0, seeds: 0 },
  C: { label: "评分奖励 · C", fragments: 10, cores: 0, seeds: 0 },
  D: { label: "评分奖励 · D", fragments: 0, cores: 0, seeds: 0 },
}

/**
 * 综合评分等级奖励：每局只发一次（用 seed+endedAt 幂等，防刷新重发）。
 * D 级无加成返回 null；普通模式与每日挑战都吃这份加成。
 */
export function applyGradeRewards(
  grade: ScoreGrade,
  runKey: string,
): { save: DungeonSave; items: SettleItem[] } | null {
  const current = loadDungeonSave()
  if (current.gradeRewardedRun === runKey) return null
  const tier = GRADE_REWARDS[grade]
  const fragments = tier.fragments ?? 0
  const cores = tier.cores ?? 0
  const seeds = tier.seeds ?? 0
  if (fragments === 0 && cores === 0 && seeds === 0) return null
  const save = grantRewards(current, { fragments, cores, seeds })
  save.gradeRewardedRun = runKey
  writeDungeonSave(save)
  return { save, items: [{ label: tier.label, fragments, cores, seeds }] }
}

/**
 * 每日名次 → 写一封名次奖励信（同一天只写一次），并授予名次称号。
 * 结算页据此提示「已放入奖励信箱」，玩家到首页信箱领取。
 */
export function applyRankRewards(
  rank: number,
  dateKey: string,
): { save: DungeonSave; items: SettleItem[]; achievements: AchievementDef[] } | null {
  const current = loadDungeonSave()
  const items: SettleItem[] = []
  let save = current

  const tier = DAILY_RANK_TIERS.find((row) => rank <= row.max)
  if (tier) {
    const label = tier.title ? `名次奖励 · 第 ${rank} 名（${tier.title}）` : `名次奖励 · 第 ${rank} 名`
    const { save: next, isNew } = grantMailItem(save, {
      id: `daily:${dateKey}`,
      dateKey,
      kind: "daily",
      rank,
      title: tier.title,
      fragments: tier.fragments,
      cores: tier.cores,
      seeds: tier.seeds,
      takenAt: "",
    })
    save = next
    if (isNew) {
      items.push({
        label,
        fragments: tier.fragments,
        cores: tier.cores,
        seeds: tier.seeds,
        mail: true,
      })
    }
  }

  /* 榜单成就：借用一个「只带名次」的判定上下文，其余条件沿用当前存档 */
  const ctx: AchievementRunContext = {
    cleared: true,
    characterId: "",
    durationMs: 0,
    noDamage: false,
    bondCount: 0,
    maxSchoolCount: 0,
    leaderboardRank: rank,
    adminDefeated: false,
  }
  const fresh = checkNewAchievements(save, ctx, dateKey).filter(
    (def) => def.id === "top-10" || def.id === "top-1",
  )
  if (fresh.length > 0) {
    save = grantRewards(
      save,
      fresh.reduce(
        (acc, def) => ({
          fragments: acc.fragments + def.reward.fragments,
          cores: acc.cores + def.reward.cores,
          seeds: acc.seeds + def.reward.seeds,
        }),
        { fragments: 0, cores: 0, seeds: 0 },
      ),
    )
    save = writeDungeonSave({
      ...save,
      unlockedAchievements: Array.from(
        new Set([...save.unlockedAchievements, ...fresh.map((def) => def.id)]),
      ),
    })
  }

  if (items.length === 0 && fresh.length === 0) return null
  return { save, items, achievements: fresh }
}

/**
 * 周榜名次 → 写一封周榜奖励信（weekKey = 上一周周日，一周一封）。
 * 由每日页在「每周一 + 周榜拉到我的名次」时调用；同周重复调用自动去重。
 */
export function applyWeeklyMail(
  rank: number,
  weekKey: string,
): { save: DungeonSave; item: SettleItem | null } {
  const tier = WEEKLY_RANK_TIERS.find((row) => rank <= row.max)
  if (!tier) return { save: loadDungeonSave(), item: null }
  const current = loadDungeonSave()
  const { save, isNew } = grantMailItem(current, {
    id: `weekly:${weekKey}`,
    dateKey: weekKey,
    kind: "weekly",
    rank,
    title: "",
    fragments: tier.fragments,
    cores: tier.cores,
    seeds: tier.seeds,
    takenAt: "",
  })
  if (!isNew) return { save, item: null }
  return {
    save,
    item: {
      label: `周榜奖励 · 第 ${rank} 名`,
      fragments: tier.fragments,
      cores: tier.cores,
      seeds: tier.seeds,
      mail: true,
    },
  }
}

/** 图鉴成就页签的全量列表（成就定义 + 是否达成） */
export function achievementStates(save: DungeonSave): {
  def: AchievementDef
  unlocked: boolean
}[] {
  const unlocked = new Set(save.unlockedAchievements)
  return ACHIEVEMENT_DEFS.map((def) => ({
    def,
    unlocked: unlocked.has(def.id),
  }))
}

/* 地牢局终直接用这两个：通关先记次数，再按第 N 次取通关奖励 */
export { bumpClearsToday, clearBonusForDailyClears }
