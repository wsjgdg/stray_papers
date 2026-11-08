/**
 * 《标签地牢》本地存档。
 * 纯 localStorage，读写全部 try/catch 兜底，SSR / 首帧安全。
 */

import { hashString } from "@/lib/rng"
import {
  CODEX_FIX_COST_FRAGMENTS,
  CODEX_FIX_EPIC_CORES,
  DEFAULT_UNLOCKED_IDS,
  DEFAULT_UNLOCKED_SKIN_IDS,
  DEMO_RUN,
  characterClearsRemaining,
  findCharacter,
  findRelic,
  getSkinById,
  isCharacterId,
  resolveSkin,
  type CharacterId,
  type CharacterSkin,
  type DungeonRunRecord,
  type RelicRarity,
} from "@/lib/dungeonData"

const STORAGE_KEY = "tag-dungeon:save:v1"

/** 三档操作模式：只影响惩罚侧，奖励（完美闪避 / 蓄力 / 连击）三档通用 */
export type PlayMode = "casual" | "standard" | "hardcore"

/** 合法操作模式集合，normalize 与设置页共用 */
export const PLAY_MODES: PlayMode[] = ["casual", "standard", "hardcore"]

/** 归一化任意输入到合法模式，缺省 / 非法一律回落 standard */
export function normalizePlayMode(value: unknown): PlayMode {
  return value === "casual" || value === "hardcore" || value === "standard"
    ? value
    : "standard"
}

export type DungeonSettings = {
  sound: boolean
  lowSpec: boolean
  /** 云存档：每局结束自动备份一次（登录后才有意义） */
  autoBackup: boolean
  /** 音效音量 0–100，合成音按这个比例缩放 */
  volume: number
  /** 战斗中的教学浮字提示（首次挨打、技能就绪这类，一局各只弹一次） */
  tips: boolean
  /** 操作模式：休闲 / 标准（默认）/ 硬核 */
  playMode: PlayMode
  /** 内存显示形态：格子（默认）/ 条（ui-pack.md 一） */
  memoryDisplay: "cells" | "bar"
  /** 底部战斗信息条（快捷键 / 日志 / 统计）是否显示（ui-pack.md v2 三，默认显示） */
  combatFooter: boolean
  /** 深浅色模式（ui-appearance.md，默认深色 = 视觉规范主形象） */
  theme: "dark" | "light"
  /** 强调配色（ui-appearance.md，默认霓虹青；四系词条色是信息编码不随它变） */
  accent: "cyan" | "purple" | "green" | "amber"
}

/** 每日挑战：某一天（dateKey）本机打过的最好一局 */
export type DailyBestRecord = {
  dateKey: string
  seed: string
  floor: number
  cleared: boolean
  durationMs: number
  hpLeft: number
  buildScore: number
  at: string
}

/** 本机战绩统计：今日最佳层数 + 累计通关率（只在本机算，不联网） */
export type RunTally = {
  /** todayBestFloor 属于哪一天（日期键），换天就把今日最佳重新算 */
  todayKey: string
  /** 今天到达的最深层数（0 = 今天还没打过） */
  todayBestFloor: number
  /** 本机累计打完的局数 */
  total: number
  /** 本机累计通关（打完第 8 层）的局数 */
  cleared: number
  /** 本机累计倒下（未通关结束）的局数，元叙事文案用（fun-pack2.md 三） */
  deaths: number
  /** 连续「通关且没死过」的局数；达标召唤管理员（fun-pack4.md 二） */
  deathlessStreak: number
  /** 击败过管理员 → 开发者模式徽章（fun-pack4.md 二） */
  devMode: boolean
}

export type DungeonSave = {
  fragments: number
  unlockedCharacters: CharacterId[]
  lastRun: DungeonRunRecord | null
  lastCharacterId: CharacterId | null
  settings: DungeonSettings
  hintSeen: boolean
  /** 历史最深层数（结算页只读展示） */
  bestFloor: number
  /** 图鉴：带过 / 见过的词条 id */
  seenRelicIds: string[]
  /** 图鉴：击败过的普通敌人 id */
  defeatedEnemyIds: string[]
  /** 图鉴：击败过的 Boss id */
  defeatedBossIds: string[]
  /** 每日挑战：按日期键存的今日最好成绩（不依赖网络） */
  dailyBest: Record<string, DailyBestRecord>
  /** 云存档：上次备份成功的时间（ISO 字符串），从没备份过为 null */
  cloudBackupAt: string | null
  /** 已解锁的角色外观 id（默认那套一开始就有） */
  unlockedSkinIds: string[]
  /** 每个角色当前穿的外观 id（缺省 = 默认那套） */
  equippedSkins: Partial<Record<CharacterId, string>>
  /** 首页展示：今日最佳层数 + 累计通关率 */
  runTally: RunTally
  /** 首页「新纪录」横幅已为哪一天的哪一层弹过（弹过就不再弹） */
  recordBannerSeen: { dateKey: string; floor: number }
  /** 核心🔷余额：只来自一次性里程碑，不可刷 */
  cores: number
  /** 种子🌱余额：通关与硬核奖励（和「种子码」是两回事） */
  seedTokens: number
  /** 已发过核心奖励的一次性 Boss 里程碑（boss id） */
  coreMilestones: string[]
  /** 各角色是否通关过（成就：四角色各通关 1 次） */
  clearedCharacterIds: string[]
  /** 花货币补全过详情的词条 id（不算收集进度） */
  purchasedCodexIds: string[]
  /** 已达成成就 id */
  unlockedAchievements: string[]
  /** 打过每日挑战的日期键（连续天数成就用，只留最近 40 天） */
  dailyPlayDates: string[]
  /**
   * 每日挑战已入场次数（dateKey → 次数）。种子驱动改造后每天只许 1 次：
   * 进地牢那一刻就计（中途退出也算用完），明日 0 点换种子重新放开。
   */
  dailyRunsByDate: Record<string, number>
  /** 当日通关次数（通关奖励递减） */
  clearsToday: { dateKey: string; count: number }
  /** 每日首胜奖励发在哪一天（一天一次） */
  firstWinTakenDate: string
  /** 每日挑战完成奖励发在哪一天（一天一次） */
  dailyRewardDate: string
  /** 已发的按日期去重的榜单奖励标记：`<dateKey>:core` / `<dateKey>:seed` */
  rankRewardsTaken: string[]
  /** 结算页已按哪一局的 endedAt 发过里程碑奖励（防刷新重发） */
  lastSettledAt: string
  /** 奖励信箱：榜单奖励以信件形式入账，7 天未领自动过期 */
  mailItems: MailItem[]
  /** 已获得的称号 id（每日冠军 / 每日前三 / 每日前十） */
  titlesTaken: string[]
  /** 历史战绩（最近 20 局，首页历史面板与评分趋势用） */
  runHistory: DungeonRunRecord[]
  /** 综合评分加成已为哪一局发过（`${seed}:${endedAt}`，防刷新重发） */
  gradeRewardedRun: string
  /* ---- Boss Rush（boss-rush.md）：全部可选、零迁移，旧存档读出来是 undefined ---- */
  /** 祭坛币余额（Boss Rush 专属货币，只在祭坛花，不碰碎片/核心/种子三货币） */
  rushCoins?: number
  /** 祭坛永久升级等级（只影响 Boss Rush 局） */
  rushUpgrades?: RushUpgrades
  /** 历史最深：到达波数 + 累计击败 Boss 数 */
  rushBest?: RushBest
  /** Boss Rush 最近 10 局 */
  rushHistory?: RushRunRecord[]
  /* ---- 浏览器特性包 v1（browser-powers-pack.md 二）：真实垃圾文件，全部可选、零迁移 ---- */
  /** 垃圾文件键的自增序号（存档只存计数器，文件本体是独立 localStorage 键、永不进云 payload） */
  junkSeq?: number
  /** 已兑现奖励的磁盘清理数（每次 +1 永久内存上限，终身上限 2） */
  diskRewardedCleanups?: number
}

/* ------------------------------------------------------------------ *
 * Boss Rush（boss-rush.md）：祭坛币 / 永久升级 / 纪录
 * 与主模式互不污染：不进碎片经济、不计通关数。
 * ------------------------------------------------------------------ */

export type RushUpgradeKey = "battery" | "overclock" | "rollback"

export type RushUpgrades = Record<RushUpgradeKey, number>

export type RushBest = { wave: number; kills: number }

export type RushRunRecord = {
  wave: number
  kills: number
  coins: number
  characterId: CharacterId
  characterName: string
  endedAt: string
}

export type RushUpgradeDef = {
  key: RushUpgradeKey
  emoji: string
  name: string
  /** 每级效果一句话 */
  perLevel: string
  /** Infinity = 可无限购买 */
  maxLevel: number
  /** 买下一级的价格（按当前等级） */
  costOf: (level: number) => number
}

/** 首发三条永久升级（价格随等级递增） */
export const RUSH_UPGRADES: RushUpgradeDef[] = [
  {
    key: "battery",
    emoji: "🛡",
    name: "备用电池",
    perLevel: "每级开局生命上限 +10",
    maxLevel: 10,
    costOf: (level) => level + 1,
  },
  {
    key: "overclock",
    emoji: "⚔",
    name: "超频核心",
    perLevel: "每级开局攻击 +2",
    maxLevel: 10,
    costOf: (level) => (level + 1) * 2,
  },
  {
    key: "rollback",
    emoji: "❤",
    name: "回滚备份",
    perLevel: "每级每局第一次死亡原地复活一次（最多 3 级）",
    maxLevel: 3,
    costOf: (level) => (level + 1) * 3,
  },
]

export function rushUpgradeDef(key: RushUpgradeKey): RushUpgradeDef {
  return RUSH_UPGRADES.find((item) => item.key === key) ?? RUSH_UPGRADES[0]
}

/** 花祭坛币买一级：钱不够 / 已满级只回消息，不写档 */
export function purchaseRushUpgrade(
  key: RushUpgradeKey,
): { ok: boolean; message: string; save: DungeonSave } {
  const current = loadDungeonSave()
  const def = rushUpgradeDef(key)
  const level = current.rushUpgrades?.[key] ?? 0
  const coins = current.rushCoins ?? 0
  if (level >= def.maxLevel) {
    return { ok: false, message: `${def.name}已满级`, save: current }
  }
  const cost = def.costOf(level)
  if (coins < cost) {
    return { ok: false, message: `祭坛币不足，还差 ${cost - coins}`, save: current }
  }
  const next: DungeonSave = {
    ...current,
    rushCoins: coins - cost,
    rushUpgrades: {
      battery: current.rushUpgrades?.battery ?? 0,
      overclock: current.rushUpgrades?.overclock ?? 0,
      rollback: current.rushUpgrades?.rollback ?? 0,
      [key]: level + 1,
    },
  }
  return { ok: true, message: `${def.emoji} ${def.name}升到 Lv.${level + 1}`, save: writeDungeonSave(next) }
}

/**
 * Boss Rush 一局结算写档：祭坛币全额入账（收手 / 死亡都一样）、
 * 刷历史最深、历史留最近 10 局。返回 newRecord = 波数超过旧纪录。
 */
export function finishRushRun(entry: {
  wave: number
  kills: number
  coins: number
  characterId: CharacterId
  characterName: string
}): { save: DungeonSave; newRecord: boolean } {
  const current = loadDungeonSave()
  const prevBest = current.rushBest ?? { wave: 0, kills: 0 }
  const newRecord = entry.wave > prevBest.wave
  const record: RushRunRecord = {
    wave: entry.wave,
    kills: entry.kills,
    coins: entry.coins,
    characterId: entry.characterId,
    characterName: entry.characterName,
    endedAt: new Date().toISOString(),
  }
  const next: DungeonSave = {
    ...current,
    rushCoins: (current.rushCoins ?? 0) + entry.coins,
    rushBest: {
      wave: Math.max(prevBest.wave, entry.wave),
      kills: prevBest.kills + entry.kills,
    },
    rushHistory: [record, ...(current.rushHistory ?? [])].slice(0, 10),
  }
  return { save: writeDungeonSave(next), newRecord }
}

/** 一封信件：名次奖励 + 称号，takenAt 为空 = 未领取 */
export type MailItem = {
  /** 去重键：`daily:<dateKey>` / `weekly:<weekKey>` */
  id: string
  /** 发信当天（YYYY-MM-DD）；周榜信记当周任意日，用于 7 天过期 */
  dateKey: string
  kind: "daily" | "weekly"
  rank: number
  /** 称号名（空 = 无名次称号） */
  title: string
  fragments: number
  cores: number
  seeds: number
  takenAt: string
}

export function createDefaultSave(): DungeonSave {
  return {
    fragments: 12,
    unlockedCharacters: [...DEFAULT_UNLOCKED_IDS],
    lastRun: DEMO_RUN,
    lastCharacterId: null,
    settings: { sound: true, lowSpec: false, autoBackup: true, volume: 80, tips: true, playMode: "standard", memoryDisplay: "cells", combatFooter: true, theme: "dark", accent: "cyan" },
    hintSeen: false,
    bestFloor: 0,
    seenRelicIds: [],
    defeatedEnemyIds: [],
    defeatedBossIds: [],
    dailyBest: {},
    cloudBackupAt: null,
    unlockedSkinIds: [...DEFAULT_UNLOCKED_SKIN_IDS],
    equippedSkins: {},
    runTally: {
      todayKey: "",
      todayBestFloor: 0,
      total: 0,
      cleared: 0,
      deaths: 0,
      deathlessStreak: 0,
      devMode: false,
    },
    recordBannerSeen: { dateKey: "", floor: 0 },
    cores: 0,
    seedTokens: 0,
    coreMilestones: [],
    clearedCharacterIds: [],
    purchasedCodexIds: [],
    unlockedAchievements: [],
    dailyPlayDates: [],
    dailyRunsByDate: {},
    clearsToday: { dateKey: "", count: 0 },
    firstWinTakenDate: "",
    dailyRewardDate: "",
    rankRewardsTaken: [],
    lastSettledAt: "",
    mailItems: [],
    titlesTaken: [],
    runHistory: [],
    gradeRewardedRun: "",
  }
}

/** 每日最好成绩的归一化：字段类型不对就整条丢弃 */
function normalizeDailyBest(value: unknown): Record<string, DailyBestRecord> {
  if (!value || typeof value !== "object") return {}
  const result: Record<string, DailyBestRecord> = {}
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (!entry || typeof entry !== "object") return
    const row = entry as Partial<DailyBestRecord>
    if (typeof row.dateKey !== "string" || row.dateKey.length === 0) return
    result[key] = {
      dateKey: row.dateKey,
      seed: typeof row.seed === "string" ? row.seed : "",
      floor: typeof row.floor === "number" && row.floor >= 0 ? Math.floor(row.floor) : 0,
      cleared: row.cleared === true,
      durationMs:
        typeof row.durationMs === "number" && row.durationMs >= 0
          ? Math.floor(row.durationMs)
          : 0,
      hpLeft: typeof row.hpLeft === "number" && row.hpLeft >= 0 ? Math.floor(row.hpLeft) : 0,
      buildScore:
        typeof row.buildScore === "number" && row.buildScore >= 0
          ? Math.floor(row.buildScore)
          : 0,
      at: typeof row.at === "string" ? row.at : "",
    }
  })
  return result
}

/** 战绩统计归一化：数字字段必须是非负整数，通关数不能超过总局数 */
function normalizeRunTally(value: unknown): RunTally {
  const fallback: RunTally = {
    todayKey: "",
    todayBestFloor: 0,
    total: 0,
    cleared: 0,
    deaths: 0,
    deathlessStreak: 0,
    devMode: false,
  }
  if (!value || typeof value !== "object") return fallback
  const row = value as Partial<RunTally>
  const total =
    typeof row.total === "number" && row.total >= 0 ? Math.floor(row.total) : 0
  const cleared =
    typeof row.cleared === "number" && row.cleared >= 0
      ? Math.floor(row.cleared)
      : 0
  return {
    todayKey: typeof row.todayKey === "string" ? row.todayKey : "",
    todayBestFloor:
      typeof row.todayBestFloor === "number" && row.todayBestFloor >= 0
        ? Math.floor(row.todayBestFloor)
        : 0,
    total,
    cleared: Math.min(cleared, total),
    deaths:
      typeof row.deaths === "number" && row.deaths >= 0
        ? Math.floor(row.deaths)
        : 0,
    deathlessStreak:
      typeof row.deathlessStreak === "number" && row.deathlessStreak >= 0
        ? Math.floor(row.deathlessStreak)
        : 0,
    devMode: row.devMode === true,
  }
}

/** 只保留最近 N 天，避免存档无限膨胀 */
const DAILY_BEST_KEEP = 14

function pruneDailyBest(
  best: Record<string, DailyBestRecord>,
): Record<string, DailyBestRecord> {
  const keys = Object.keys(best).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  const kept: Record<string, DailyBestRecord> = {}
  keys.slice(0, DAILY_BEST_KEEP).forEach((key) => {
    const entry = best[key]
    if (entry) kept[key] = entry
  })
  return kept
}

/** 本机记录今天的更好一局：层数更高，或层数相同用时更短才覆盖 */
export function recordDailyBest(entry: DailyBestRecord): DungeonSave {
  const current = loadDungeonSave()
  const previous = current.dailyBest[entry.dateKey]
  const better =
    !previous ||
    entry.floor > previous.floor ||
    (entry.floor === previous.floor && entry.durationMs < previous.durationMs)
  if (!better) return current
  const next: Record<string, DailyBestRecord> = {
    ...current.dailyBest,
    [entry.dateKey]: entry,
  }
  return writeDungeonSave({ ...current, dailyBest: pruneDailyBest(next) })
}

/** 每局结算记一笔：总局数 +1、通关再 +1、没通关则倒下计数 +1，顺带刷新今日最佳层数；
 *  连续无死通关数与开发者模式按 fun-pack4.md 二更新 */
export function recordRunTally(entry: {
  dateKey: string
  floor: number
  cleared: boolean
  /** 本局进过死亡处理（含复活成功）；旧调用方不传按未通关视为死 */
  died?: boolean
  /** 本局击败了管理员 → 永久点亮 devMode */
  devModeUnlock?: boolean
}): DungeonSave {
  const current = loadDungeonSave()
  const previous = current.runTally
  const sameDay = previous.todayKey === entry.dateKey
  const todayBestFloor = sameDay
    ? Math.max(previous.todayBestFloor, entry.floor)
    : entry.floor
  const died = entry.died ?? !entry.cleared
  return writeDungeonSave({
    ...current,
    runTally: {
      todayKey: entry.dateKey,
      todayBestFloor,
      total: previous.total + 1,
      cleared: previous.cleared + (entry.cleared ? 1 : 0),
      deaths: previous.deaths + (entry.cleared ? 0 : 1),
      deathlessStreak:
        entry.cleared && !died ? previous.deathlessStreak + 1 : 0,
      devMode: previous.devMode || entry.devModeUnlock === true,
    },
  })
}

/** 存档里的 id 集合统一按「非空字符串 + 去重」归一化，坏数据直接丢弃 */
function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids = value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  )
  return Array.from(new Set(ids))
}

function mergeIdList(base: string[], extra: string[]): string[] {
  return Array.from(new Set([...base, ...extra]))
}

/** 词条 id 列表归一化：顺手滤掉已不在词条池里的旧 id（v4 词条池整池替换的兼容层） */
function normalizeRelicIdList(value: unknown): string[] {
  return normalizeIdList(value).filter((id) => findRelic(id) !== null)
}

/** 外观 id 列表：只认库里真有的外观，坏数据丢弃 */
function normalizeSkinIdList(value: unknown): string[] {
  return normalizeIdList(value).filter((id) => getSkinById(id) !== null)
}

/** 已穿外观：角色 id 与外观 id 必须对得上，对不上就丢（读时再回退默认那套） */
function normalizeEquippedSkins(
  value: unknown,
): Partial<Record<CharacterId, string>> {
  if (!value || typeof value !== "object") return {}
  const result: Partial<Record<CharacterId, string>> = {}
  Object.entries(value as Record<string, unknown>).forEach(
    ([characterId, skinId]) => {
      if (!isCharacterId(characterId)) return
      const skin = getSkinById(typeof skinId === "string" ? skinId : null)
      if (!skin || skin.characterId !== characterId) return
      result[characterId] = skin.id
    },
  )
  return result
}

function readStored(): Partial<DungeonSave> | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    return parsed as Partial<DungeonSave>
  } catch {
    return null
  }
}

/**
 * 把任意来源的存档对象归一化成一份完整存档。
 * localStorage 里读出来的、云端 payload 拉回来的都走这里，坏字段一律回落默认值。
 */
export function normalizeDungeonSave(
  raw: Partial<DungeonSave> | null | undefined,
): DungeonSave {
  const fallback = createDefaultSave()
  if (!raw || typeof raw !== "object") return fallback
  const stored = raw

  const unlocked = Array.isArray(stored.unlockedCharacters)
    ? stored.unlockedCharacters.filter(isCharacterId)
    : []
  const mergedUnlocked = Array.from(
    new Set<CharacterId>([...DEFAULT_UNLOCKED_IDS, ...unlocked]),
  )

  const storedSettings =
    stored.settings && typeof stored.settings === "object"
      ? stored.settings
      : null

  return {
    fragments:
      typeof stored.fragments === "number" && stored.fragments >= 0
        ? Math.floor(stored.fragments)
        : fallback.fragments,
    unlockedCharacters: mergedUnlocked,
    lastRun: stored.lastRun ?? fallback.lastRun,
    lastCharacterId: isCharacterId(stored.lastCharacterId)
      ? stored.lastCharacterId
      : fallback.lastCharacterId,
    settings: {
      sound:
        typeof storedSettings?.sound === "boolean"
          ? storedSettings.sound
          : fallback.settings.sound,
      lowSpec:
        typeof storedSettings?.lowSpec === "boolean"
          ? storedSettings.lowSpec
          : fallback.settings.lowSpec,
      autoBackup:
        typeof storedSettings?.autoBackup === "boolean"
          ? storedSettings.autoBackup
          : fallback.settings.autoBackup,
      volume:
        typeof storedSettings?.volume === "number"
          ? Math.min(100, Math.max(0, Math.floor(storedSettings.volume)))
          : fallback.settings.volume,
      tips:
        typeof storedSettings?.tips === "boolean"
          ? storedSettings.tips
          : fallback.settings.tips,
      playMode: normalizePlayMode(storedSettings?.playMode),
      memoryDisplay:
        storedSettings?.memoryDisplay === "bar" ? "bar" : "cells",
      combatFooter:
        typeof storedSettings?.combatFooter === "boolean"
          ? storedSettings.combatFooter
          : true,
      theme:
        storedSettings?.theme === "light" ? "light" : "dark",
      accent:
        storedSettings?.accent === "purple" ||
        storedSettings?.accent === "green" ||
        storedSettings?.accent === "amber"
          ? storedSettings.accent
          : "cyan",
    },
    hintSeen: stored.hintSeen === true,
    bestFloor:
      typeof stored.bestFloor === "number" && stored.bestFloor >= 0
        ? Math.floor(stored.bestFloor)
        : fallback.bestFloor,
    seenRelicIds: normalizeRelicIdList(stored.seenRelicIds),
    defeatedEnemyIds: normalizeIdList(stored.defeatedEnemyIds),
    defeatedBossIds: normalizeIdList(stored.defeatedBossIds),
    dailyBest: normalizeDailyBest(stored.dailyBest),
    cloudBackupAt:
      typeof stored.cloudBackupAt === "string" && stored.cloudBackupAt.length > 0
        ? stored.cloudBackupAt
        : null,
    /* 旧存档没有这两个字段：默认那套永远算已解锁，已穿外观缺省走默认 */
    unlockedSkinIds: mergeIdList(
      DEFAULT_UNLOCKED_SKIN_IDS,
      normalizeSkinIdList(stored.unlockedSkinIds),
    ),
    equippedSkins: normalizeEquippedSkins(stored.equippedSkins),
    runTally: normalizeRunTally(stored.runTally),
    recordBannerSeen:
      stored.recordBannerSeen && typeof stored.recordBannerSeen === "object"
        ? {
            dateKey:
              typeof stored.recordBannerSeen.dateKey === "string"
                ? stored.recordBannerSeen.dateKey
                : "",
            floor:
              typeof stored.recordBannerSeen.floor === "number" &&
              stored.recordBannerSeen.floor >= 0
                ? Math.floor(stored.recordBannerSeen.floor)
                : 0,
          }
        : fallback.recordBannerSeen,
    /* 货币系统（v2 字段）：旧存档没有一律回落 0 / 空 */
    cores:
      typeof stored.cores === "number" && stored.cores >= 0
        ? Math.floor(stored.cores)
        : 0,
    seedTokens:
      typeof stored.seedTokens === "number" && stored.seedTokens >= 0
        ? Math.floor(stored.seedTokens)
        : 0,
    coreMilestones: normalizeIdList(stored.coreMilestones),
    clearedCharacterIds: normalizeIdList(stored.clearedCharacterIds).filter(
      isCharacterId,
    ),
    purchasedCodexIds: normalizeRelicIdList(stored.purchasedCodexIds),
    unlockedAchievements: normalizeIdList(stored.unlockedAchievements),
    dailyPlayDates: normalizeIdList(stored.dailyPlayDates)
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
      .slice(0, 40),
    /* 每日挑战入场计数：脏数据丢 0，键按日期降序只留最近 40 天 */
    dailyRunsByDate: (() => {
      const source =
        stored.dailyRunsByDate && typeof stored.dailyRunsByDate === "object"
          ? stored.dailyRunsByDate
          : {}
      const result: Record<string, number> = {}
      Object.keys(source)
        .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
        .slice(0, 40)
        .forEach((key) => {
          const raw = (source as Record<string, unknown>)[key]
          if (typeof raw === "number" && raw > 0) {
            result[key] = Math.floor(raw)
          }
        })
      return result
    })(),
    clearsToday:
      stored.clearsToday && typeof stored.clearsToday === "object"
        ? {
            dateKey:
              typeof stored.clearsToday.dateKey === "string"
                ? stored.clearsToday.dateKey
                : "",
            count:
              typeof stored.clearsToday.count === "number" &&
              stored.clearsToday.count >= 0
                ? Math.floor(stored.clearsToday.count)
                : 0,
          }
        : fallback.clearsToday,
    firstWinTakenDate:
      typeof stored.firstWinTakenDate === "string"
        ? stored.firstWinTakenDate
        : "",
    dailyRewardDate:
      typeof stored.dailyRewardDate === "string" ? stored.dailyRewardDate : "",
    rankRewardsTaken: normalizeIdList(stored.rankRewardsTaken),
    lastSettledAt:
      typeof stored.lastSettledAt === "string" ? stored.lastSettledAt : "",
    /* 奖励信箱：脏条目丢弃；7 天前的信（无论领没领）自动过期 */
    mailItems: (() => {
      const cutoff = (() => {
        const d = new Date()
        d.setDate(d.getDate() - 7)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, "0")
        const day = String(d.getDate()).padStart(2, "0")
        return `${y}-${m}-${day}`
      })()
      const source = Array.isArray(stored.mailItems) ? stored.mailItems : []
      const seen = new Set<string>()
      const result: MailItem[] = []
      source.forEach((raw) => {
        if (!raw || typeof raw !== "object") return
        const row = raw as Partial<MailItem>
        if (typeof row.id !== "string" || !row.id || seen.has(row.id)) return
        if (typeof row.dateKey !== "string" || !row.dateKey) return
        if (row.dateKey < cutoff) return
        seen.add(row.id)
        result.push({
          id: row.id,
          dateKey: row.dateKey,
          kind: row.kind === "weekly" ? "weekly" : "daily",
          rank:
            typeof row.rank === "number" && row.rank >= 1
              ? Math.floor(row.rank)
              : 0,
          title: typeof row.title === "string" ? row.title : "",
          fragments:
            typeof row.fragments === "number" && row.fragments >= 0
              ? Math.floor(row.fragments)
              : 0,
          cores:
            typeof row.cores === "number" && row.cores >= 0
              ? Math.floor(row.cores)
              : 0,
          seeds:
            typeof row.seeds === "number" && row.seeds >= 0
              ? Math.floor(row.seeds)
              : 0,
          takenAt: typeof row.takenAt === "string" ? row.takenAt : "",
        })
      })
      return result
    })(),
    titlesTaken: normalizeIdList(stored.titlesTaken),
    /* 历史战绩：只收字段完整的行，最多留 20 局 */
    runHistory: (() => {
      const source = Array.isArray(stored.runHistory) ? stored.runHistory : []
      const result: DungeonRunRecord[] = []
      source.forEach((entry) => {
        if (!entry || typeof entry !== "object") return
        const row = entry as Partial<DungeonRunRecord>
        if (typeof row.seed !== "string" || typeof row.endedAt !== "string") return
        if (typeof row.floor !== "number" || row.floor < 0) return
        result.push(row as DungeonRunRecord)
      })
      return result.slice(0, 20)
    })(),
    gradeRewardedRun:
      typeof stored.gradeRewardedRun === "string" ? stored.gradeRewardedRun : "",
    /* Boss Rush 可选字段（零迁移）：脏值 / 缺省一律回落 undefined，读取侧按 0 / 默认 */
    rushCoins:
      typeof stored.rushCoins === "number" && stored.rushCoins >= 0
        ? Math.floor(stored.rushCoins)
        : undefined,
    rushUpgrades: (() => {
      const raw =
        stored.rushUpgrades && typeof stored.rushUpgrades === "object"
          ? stored.rushUpgrades
          : null
      if (!raw) return undefined
      const level = (value: unknown) =>
        typeof value === "number" && value >= 0 ? Math.floor(value) : 0
      return {
        battery: level((raw as Partial<RushUpgrades>).battery),
        overclock: level((raw as Partial<RushUpgrades>).overclock),
        rollback: Math.min(3, level((raw as Partial<RushUpgrades>).rollback)),
      }
    })(),
    rushBest: (() => {
      const raw =
        stored.rushBest && typeof stored.rushBest === "object"
          ? stored.rushBest
          : null
      if (!raw) return undefined
      const num = (value: unknown) =>
        typeof value === "number" && value >= 0 ? Math.floor(value) : 0
      return { wave: num((raw as Partial<RushBest>).wave), kills: num((raw as Partial<RushBest>).kills) }
    })(),
    rushHistory: Array.isArray(stored.rushHistory)
      ? stored.rushHistory
          .filter(
            (entry) =>
              entry &&
              typeof entry === "object" &&
              typeof entry.wave === "number" &&
              typeof entry.coins === "number",
          )
          .slice(0, 10)
      : undefined,
    /* 浏览器特性包 v1（零迁移）：垃圾文件序号与已兑现奖励的清理数，脏值一律回落 undefined */
    junkSeq:
      typeof stored.junkSeq === "number" && stored.junkSeq >= 0
        ? Math.floor(stored.junkSeq)
        : undefined,
    diskRewardedCleanups:
      typeof stored.diskRewardedCleanups === "number" &&
      stored.diskRewardedCleanups >= 0
        ? Math.min(JUNK_REWARD_MAX, Math.floor(stored.diskRewardedCleanups))
        : undefined,
  }
}

export function loadDungeonSave(): DungeonSave {
  return normalizeDungeonSave(readStored())
}

export function writeDungeonSave(next: DungeonSave): DungeonSave {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // 隐私模式 / 存储配额满：静默降级为纯内存存档
    }
  }
  return next
}

/** 清档只清本机：整条存档（含「上次备份时间」这类云存档痕迹）一起抹掉，云端那份不动 */
export function clearDungeonSave(): DungeonSave {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // 忽略
    }
  }
  return createDefaultSave()
}

/* ------------------------------------------------------------------ *
 * 浏览器特性包 v1（browser-powers-pack.md 二）：真实「垃圾文件」经济
 * 键空间 tag-dungeon:junk:v1:<seq> 与存档本体完全分开：
 * - 文件内容按本局 seed 的 hashString 派生（8~15k 字符、零 Math.random，可复现）；
 * - 每局结算落 1~2 个（胜 2 负 1），场上上限 4 个，超限不再新增；
 * - 全部 try/catch 静默（配额满就跳过，永不影响结算）；
 * - 垃圾键永不进云存档 payload（云 payload = 存档 JSON 本体，这里只借 save.junkSeq 一个计数器）。
 * ------------------------------------------------------------------ */

const JUNK_KEY_PREFIX = "tag-dungeon:junk:v1:"
/** 只删这个前缀族（比 JUNK_KEY_PREFIX 更宽的硬校验线），绝不碰存档本体 */
const JUNK_KEY_FAMILY = "tag-dungeon:junk:"
/** 场上垃圾文件上限（超限则新的不再落盘，旧的留在原地） */
const JUNK_ON_FIELD_MAX = 4
/** 单文件内容长度下限 / 浮动区间（字符数，×2 ≈ 字节数） */
const JUNK_LEN_BASE = 8000
const JUNK_LEN_RANGE = 7000
/** 可兑现「+1 永久内存上限」奖励的清理次数（终身） */
export const JUNK_REWARD_MAX = 2

/** 12 位基块：两个哈希拼 12 字符（seed + 序号 + 块号，全确定性） */
function junkBlock(seed: string, seq: number, index: number): string {
  const a = hashString(`${seed}:junk:${seq}:${index * 2}`).toString(36)
  const b = hashString(`${seed}:junk:${seq}:${index * 2 + 1}`).toString(36)
  return (a + b).padEnd(12, "0").slice(0, 12)
}

/** 按 seed 派生的确定性长串（8~15k 字符，同 seed 同序号永远同内容） */
function junkContent(seed: string, seq: number): string {
  const total =
    JUNK_LEN_BASE + (hashString(`${seed}:junk:${seq}:size`) % JUNK_LEN_RANGE)
  let text = ""
  let index = 0
  while (text.length < total) {
    text += junkBlock(seed, seq, index)
    index += 1
  }
  return text.slice(0, total)
}

function junkSeqOf(key: string): number {
  return Number(key.slice(JUNK_KEY_PREFIX.length)) || 0
}

/** 场上垃圾文件清单（按序号升序 = 最旧在前）；bytes ≈ 字符数 × 2 */
export function listJunkFiles(): { key: string; bytes: number }[] {
  const out: { key: string; bytes: number }[] = []
  if (typeof window === "undefined") return out
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (!key || !key.startsWith(JUNK_KEY_PREFIX)) continue
      const value = window.localStorage.getItem(key) ?? ""
      out.push({ key, bytes: value.length * 2 })
    }
  } catch {
    /* 隐私模式 / 读失败：当作没有垃圾 */
  }
  return out.sort((a, b) => junkSeqOf(a.key) - junkSeqOf(b.key))
}

/** 场上垃圾文件总字节数（面板读数用） */
export function totalJunkBytes(): number {
  return listJunkFiles().reduce((sum, file) => sum + file.bytes, 0)
}

/** 每局结算落盘垃圾文件：胜 2 负 1、场上上限 4、配额满静默跳过 */
export function dropJunkFiles(seed: string, cleared: boolean): void {
  if (typeof window === "undefined") return
  try {
    const save = loadDungeonSave()
    const free = JUNK_ON_FIELD_MAX - listJunkFiles().length
    if (free <= 0) return
    const wanted = Math.min(cleared ? 2 : 1, free)
    const startSeq = save.junkSeq ?? 0
    let written = 0
    for (let i = 0; i < wanted; i += 1) {
      try {
        window.localStorage.setItem(
          `${JUNK_KEY_PREFIX}${startSeq + i + 1}`,
          junkContent(seed, startSeq + i + 1),
        )
        written += 1
      } catch {
        /* 配额满：这颗跳过，不影响结算 */
      }
    }
    if (written > 0) {
      writeDungeonSave({ ...save, junkSeq: startSeq + written })
    }
  } catch {
    /* 整体静默：垃圾经济永不影响结算 */
  }
}

/** 首页磁盘清理：真删键、真回收字节；前 2 次各兑现 +1 永久内存上限。
 *  硬校验只动 tag-dungeon:junk: 前缀，绝不碰 tag-dungeon:save:v1 本体 */
export function cleanJunkFiles(): {
  removed: number
  bytes: number
  rewarded: boolean
} {
  const result = { removed: 0, bytes: 0, rewarded: false }
  if (typeof window === "undefined") return result
  listJunkFiles().forEach((file) => {
    if (!file.key.startsWith(JUNK_KEY_FAMILY)) return
    try {
      window.localStorage.removeItem(file.key)
      result.removed += 1
      result.bytes += file.bytes
    } catch {
      /* 删不掉的留在原地 */
    }
  })
  if (result.removed > 0) {
    const save = loadDungeonSave()
    const used = save.diskRewardedCleanups ?? 0
    if (used < JUNK_REWARD_MAX) {
      writeDungeonSave({ ...save, diskRewardedCleanups: used + 1 })
      result.rewarded = true
    }
  }
  return result
}

/* ------------------------------------------------------------------ *
 * 图鉴：进度记录 + 碎片解锁
 * 全部先读回当前存档再合并写回，避免覆盖别处刚写进去的字段。
 * ------------------------------------------------------------------ */

/** 本局带过 / 见过的词条 → seenRelicIds */
export function recordSeenRelics(relicIds: string[]): DungeonSave {
  const current = loadDungeonSave()
  const merged = mergeIdList(current.seenRelicIds, normalizeIdList(relicIds))
  if (merged.length === current.seenRelicIds.length) return current
  return writeDungeonSave({ ...current, seenRelicIds: merged })
}

/** 清掉的普通敌人 → defeatedEnemyIds */
export function recordDefeatedEnemies(enemyIds: string[]): DungeonSave {
  const current = loadDungeonSave()
  const merged = mergeIdList(
    current.defeatedEnemyIds,
    normalizeIdList(enemyIds),
  )
  if (merged.length === current.defeatedEnemyIds.length) return current
  return writeDungeonSave({ ...current, defeatedEnemyIds: merged })
}

/** 击败的 Boss → defeatedBossIds */
export function recordDefeatedBosses(bossIds: string[]): DungeonSave {
  const current = loadDungeonSave()
  const merged = mergeIdList(current.defeatedBossIds, normalizeIdList(bossIds))
  if (merged.length === current.defeatedBossIds.length) return current
  return writeDungeonSave({ ...current, defeatedBossIds: merged })
}

export type UnlockCharacterResult = {
  ok: boolean
  save: DungeonSave
  message: string
}

/** 花碎片解锁角色：碎片不够或已解锁时不写档，只回一句提示 */
export function unlockCharacter(
  characterId: CharacterId,
  cost: number,
): UnlockCharacterResult {
  const current = loadDungeonSave()

  if (current.unlockedCharacters.includes(characterId)) {
    return { ok: false, save: current, message: "这个角色已经在你队伍里了" }
  }

  const price = Math.max(0, Math.floor(cost))
  if (current.fragments < price) {
    return {
      ok: false,
      save: current,
      message: `还差 ${price - current.fragments} 个碎片`,
    }
  }

  const next = writeDungeonSave({
    ...current,
    fragments: current.fragments - price,
    unlockedCharacters: Array.from(
      new Set<CharacterId>([...current.unlockedCharacters, characterId]),
    ),
  })

  return { ok: true, save: next, message: "解锁成功，回首页就能选他上场" }
}

/* ------------------------------------------------------------------ *
 * 角色外观：跨页统一取值 + 解锁 / 换装
 * ------------------------------------------------------------------ */

/**
 * 跨页统一取色入口：首页角色卡 / 地牢角色面板 / 结算战绩卡都调它。
 * 读存档 + 回退默认那套，保证同一角色在不同页面穿的是同一套外观。
 */
export function getEquippedSkin(characterId: CharacterId): CharacterSkin {
  const current = loadDungeonSave()
  return resolveSkin(characterId, current.equippedSkins[characterId])
}

export type SkinActionResult = {
  ok: boolean
  save: DungeonSave
  message: string
}

/** 已解锁的外观直接换上 */
export function equipSkin(
  characterId: CharacterId,
  skinId: string,
): SkinActionResult {
  const current = loadDungeonSave()
  const skin = getSkinById(skinId)
  if (!skin || skin.characterId !== characterId) {
    return { ok: false, save: current, message: "没找到这套外观" }
  }
  if (!current.unlockedCharacters.includes(characterId)) {
    return { ok: false, save: current, message: "先解锁这个角色，再谈换装" }
  }
  if (!current.unlockedSkinIds.includes(skinId)) {
    return { ok: false, save: current, message: "这套外观还没解锁" }
  }
  if (current.equippedSkins[characterId] === skinId) {
    return { ok: true, save: current, message: `已经穿着「${skin.displayName}」了` }
  }
  const equippedSkins: Partial<Record<CharacterId, string>> = {
    ...current.equippedSkins,
  }
  equippedSkins[characterId] = skinId
  const next = writeDungeonSave({ ...current, equippedSkins })
  return { ok: true, save: next, message: `换上了「${skin.displayName}」` }
}

/** 花碎片解锁外观并立刻换上：碎片不够或已解锁时不重复扣费 */
export function unlockSkin(
  characterId: CharacterId,
  skinId: string,
  cost: number,
): SkinActionResult {
  const current = loadDungeonSave()
  const skin = getSkinById(skinId)
  if (!skin || skin.characterId !== characterId) {
    return { ok: false, save: current, message: "没找到这套外观" }
  }
  if (!current.unlockedCharacters.includes(characterId)) {
    return { ok: false, save: current, message: "先解锁这个角色，再谈换装" }
  }
  if (current.unlockedSkinIds.includes(skinId)) {
    return equipSkin(characterId, skinId)
  }

  const price = Math.max(0, Math.floor(cost))
  if (current.fragments < price) {
    return {
      ok: false,
      save: current,
      message: `还差 ${price - current.fragments} 个碎片`,
    }
  }

  const equippedSkins: Partial<Record<CharacterId, string>> = {
    ...current.equippedSkins,
  }
  equippedSkins[characterId] = skinId
  const next = writeDungeonSave({
    ...current,
    fragments: current.fragments - price,
    unlockedSkinIds: Array.from(new Set([...current.unlockedSkinIds, skinId])),
    equippedSkins,
  })
  return { ok: true, save: next, message: `解锁并换上「${skin.displayName}」` }
}

/* ------------------------------------------------------------------ *
 * 货币系统 v2：核心 / 种子 / 每日去重 / 双路线购买 / 图鉴补全
 * 见 .rh/economy-spec.md —— 三种货币互不兑换，全部写档走这里。
 * ------------------------------------------------------------------ */

export type CurrencyKind = "fragments" | "cores"

export type RewardDelta = {
  fragments?: number
  cores?: number
  seeds?: number
}

/** 三种货币一起加（结算里程碑 / 成就奖励用），负数一律忽略 */
export function grantRewards(
  base: DungeonSave,
  delta: RewardDelta,
): DungeonSave {
  return writeDungeonSave({
    ...base,
    fragments: base.fragments + Math.max(0, Math.floor(delta.fragments ?? 0)),
    cores: base.cores + Math.max(0, Math.floor(delta.cores ?? 0)),
    seedTokens:
      base.seedTokens + Math.max(0, Math.floor(delta.seeds ?? 0)),
  })
}

/**
 * 进入一局每日挑战：当日计数 +1（进本那一刻调用，中途退出也占掉今天的名额）。
 * 返回最新存档，调用方把返回值并进自己的 state 即可。
 */
export function bumpDailyRun(dateKey: string): DungeonSave {
  const current = loadDungeonSave()
  return writeDungeonSave({
    ...current,
    dailyRunsByDate: {
      ...current.dailyRunsByDate,
      [dateKey]: (current.dailyRunsByDate[dateKey] ?? 0) + 1,
    },
  })
}

/**
 * 往奖励信箱放一封信：同 id 已存在则原样返回（名次奖励一天只发一次）。
 * 称号一并登记进 titlesTaken（去重）。
 */
export function grantMailItem(
  base: DungeonSave,
  mail: MailItem,
): { save: DungeonSave; isNew: boolean } {
  if (base.mailItems.some((item) => item.id === mail.id)) {
    return { save: base, isNew: false }
  }
  const titlesTaken =
    mail.title && !base.titlesTaken.includes(mail.title)
      ? [...base.titlesTaken, mail.title]
      : base.titlesTaken
  const save = writeDungeonSave({
    ...base,
    mailItems: [...base.mailItems, mail],
    titlesTaken,
  })
  return { save, isNew: true }
}

/** 信箱里还没领的信数量（首页红点用） */
export function countUnclaimedMail(save: DungeonSave): number {
  return save.mailItems.filter((item) => !item.takenAt).length
}

/** 领取一封信：奖励直接入账，标记 takenAt；已领 / 不存在返回 claimed=false */
export function claimMailItem(
  id: string,
): { save: DungeonSave; claimed: boolean; mail: MailItem | null } {
  const current = loadDungeonSave()
  const mail = current.mailItems.find((item) => item.id === id)
  if (!mail || mail.takenAt) return { save: current, claimed: false, mail: null }
  const save = grantRewards(
    {
      ...current,
      mailItems: current.mailItems.map((item) =>
        item.id === id
          ? { ...item, takenAt: new Date().toISOString() }
          : item,
      ),
    },
    { fragments: mail.fragments, cores: mail.cores, seeds: mail.seeds },
  )
  return { save, claimed: true, mail }
}

/** 打过一局每日挑战：记一天日期键（连续天数成就用，重复打同一天不叠） */
export function recordDailyPlayDate(dateKey: string): DungeonSave {
  const current = loadDungeonSave()
  if (current.dailyPlayDates.includes(dateKey)) return current
  const dates = Array.from(new Set([...current.dailyPlayDates, dateKey]))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, 40)
  return writeDungeonSave({ ...current, dailyPlayDates: dates })
}

/** 通关时先记一笔当日通关次数（奖励递减按第 N 次取档） */
export function bumpClearsToday(dateKey: string): DungeonSave {
  const current = loadDungeonSave()
  const sameDay = current.clearsToday.dateKey === dateKey
  return writeDungeonSave({
    ...current,
    clearsToday: {
      dateKey,
      count: (sameDay ? current.clearsToday.count : 0) + 1,
    },
  })
}

/** 每日首胜（当天第一次通关）领一次；领过返回原存档并带 claimed=false */
export function claimFirstWinBonus(
  dateKey: string,
): { save: DungeonSave; claimed: boolean } {
  const current = loadDungeonSave()
  if (current.firstWinTakenDate === dateKey) {
    return { save: current, claimed: false }
  }
  const next = writeDungeonSave({ ...current, firstWinTakenDate: dateKey })
  return { save: next, claimed: true }
}

/** 每日挑战完成奖励一天一次 */
export function claimDailyChallengeReward(
  dateKey: string,
): { save: DungeonSave; claimed: boolean } {
  const current = loadDungeonSave()
  if (current.dailyRewardDate === dateKey) {
    return { save: current, claimed: false }
  }
  const next = writeDungeonSave({ ...current, dailyRewardDate: dateKey })
  return { save: next, claimed: true }
}

/** 记一笔「哪个角色通关过」（成就：四角色各通关 1 次） */
export function recordClearedCharacter(
  characterId: CharacterId,
): DungeonSave {
  const current = loadDungeonSave()
  if (current.clearedCharacterIds.includes(characterId)) return current
  return writeDungeonSave({
    ...current,
    clearedCharacterIds: Array.from(
      new Set([...current.clearedCharacterIds, characterId]),
    ),
  })
}

export type DualPurchaseResult = {
  ok: boolean
  save: DungeonSave
  message: string
}

/**
 * 双路线解锁角色：碎片买 fragmentCost，或核心买 coreCost（隐藏角色两条任选）。
 * 带 requiresClears 的隐藏角色要先够格（累计通关数），够格前拒绝购买。
 */
export function unlockCharacterDual(
  characterId: CharacterId,
  currency: CurrencyKind,
): DualPurchaseResult {
  const current = loadDungeonSave()
  if (current.unlockedCharacters.includes(characterId)) {
    return { ok: false, save: current, message: "这个角色已经在你队伍里了" }
  }
  const character = findCharacter(characterId)
  if (!character) return { ok: false, save: current, message: "没有这个角色" }
  if (character.requiresClears > 0) {
    const remaining = characterClearsRemaining(character, current.runTally.cleared)
    if (remaining > 0) {
      return {
        ok: false,
        save: current,
        message: `还差 ${remaining} 次通关才能遇见这个角色`,
      }
    }
  }
  if (currency === "cores") {
    if (character.coreCost <= 0) {
      return { ok: false, save: current, message: "这个角色不支持核心购买" }
    }
    if (current.cores < character.coreCost) {
      return {
        ok: false,
        save: current,
        message: `还差 ${character.coreCost - current.cores} 个核心`,
      }
    }
    const next = writeDungeonSave({
      ...current,
      cores: current.cores - character.coreCost,
      unlockedCharacters: Array.from(
        new Set<CharacterId>([...current.unlockedCharacters, characterId]),
      ),
    })
    return { ok: true, save: next, message: "解锁成功，回首页就能选他上场" }
  }
  if (current.fragments < character.fragmentCost) {
    return {
      ok: false,
      save: current,
      message: `还差 ${character.fragmentCost - current.fragments} 个碎片`,
    }
  }
  const next = writeDungeonSave({
    ...current,
    fragments: current.fragments - character.fragmentCost,
    unlockedCharacters: Array.from(
      new Set<CharacterId>([...current.unlockedCharacters, characterId]),
    ),
  })
  return { ok: true, save: next, message: "解锁成功，回首页就能选他上场" }
}

/** 双路线解锁外观：碎片买断或核心买断（极夜皮肤带核心价） */
export function unlockSkinDual(
  characterId: CharacterId,
  skinId: string,
  currency: CurrencyKind,
): DualPurchaseResult {
  const current = loadDungeonSave()
  const skin = getSkinById(skinId)
  if (!skin || skin.characterId !== characterId) {
    return { ok: false, save: current, message: "没找到这套外观" }
  }
  if (!current.unlockedCharacters.includes(characterId)) {
    return { ok: false, save: current, message: "先解锁这个角色，再谈换装" }
  }
  if (current.unlockedSkinIds.includes(skinId)) {
    return equipSkin(characterId, skinId)
  }
  if (currency === "cores") {
    if (skin.coreCost <= 0) {
      return { ok: false, save: current, message: "这套外观不支持核心购买" }
    }
    if (current.cores < skin.coreCost) {
      return {
        ok: false,
        save: current,
        message: `还差 ${skin.coreCost - current.cores} 个核心`,
      }
    }
    const equippedSkins: Partial<Record<CharacterId, string>> = {
      ...current.equippedSkins,
    }
    equippedSkins[characterId] = skinId
    const next = writeDungeonSave({
      ...current,
      cores: current.cores - skin.coreCost,
      unlockedSkinIds: Array.from(new Set([...current.unlockedSkinIds, skinId])),
      equippedSkins,
    })
    return { ok: true, save: next, message: `解锁并换上「${skin.displayName}」` }
  }
  if (current.fragments < skin.cost) {
    return {
      ok: false,
      save: current,
      message: `还差 ${skin.cost - current.fragments} 个碎片`,
    }
  }
  const equippedSkins: Partial<Record<CharacterId, string>> = {
    ...current.equippedSkins,
  }
  equippedSkins[characterId] = skinId
  const next = writeDungeonSave({
    ...current,
    fragments: current.fragments - skin.cost,
    unlockedSkinIds: Array.from(new Set([...current.unlockedSkinIds, skinId])),
    equippedSkins,
  })
  return { ok: true, save: next, message: `解锁并换上「${skin.displayName}」` }
}

/** 图鉴补全：未见过的词条花货币解锁详情（epic 只收核心） */
export function purchaseCodexEntry(
  relicId: string,
  rarity: RelicRarity,
): DualPurchaseResult {
  const current = loadDungeonSave()
  if (current.purchasedCodexIds.includes(relicId)) {
    return { ok: true, save: current, message: "这条词条已经补全过了" }
  }
  if (rarity === "epic") {
    if (current.cores < CODEX_FIX_EPIC_CORES) {
      return {
        ok: false,
        save: current,
        message: `还差 ${CODEX_FIX_EPIC_CORES - current.cores} 个核心`,
      }
    }
    return {
      ok: true,
      save: writeDungeonSave({
        ...current,
        cores: current.cores - CODEX_FIX_EPIC_CORES,
        purchasedCodexIds: [
          ...current.purchasedCodexIds,
          relicId,
        ],
      }),
      message: `花 ${CODEX_FIX_EPIC_CORES} 核心补全了这条史诗词条`,
    }
  }
  if (current.fragments < CODEX_FIX_COST_FRAGMENTS) {
    return {
      ok: false,
      save: current,
      message: `还差 ${CODEX_FIX_COST_FRAGMENTS - current.fragments} 个碎片`,
    }
  }
  return {
    ok: true,
    save: writeDungeonSave({
      ...current,
      fragments: current.fragments - CODEX_FIX_COST_FRAGMENTS,
      purchasedCodexIds: [...current.purchasedCodexIds, relicId],
    }),
    message: `花 ${CODEX_FIX_COST_FRAGMENTS} 碎片补全了这条词条`,
  }
}
