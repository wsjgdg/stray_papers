/**
 * 《标签地牢》每日挑战成绩（离线降级）。
 * 纯函数（Build 评分 / 排序 / 去重判定）+ 本地成绩读写，不依赖任何服务端。
 */

import {
  DUNGEON_RUN_FLOORS,
  getActiveBondDefs,
  type Relic,
  type RelicRarity,
} from "@/lib/dungeonData"
import type { RhJwtPayload } from "@/lib/platform"
// 离线降级：以下原平台能力在本地构建中降级为无操作（无服务端、不登录、不弹计费）。
function getApiBase(): string {
  return ""
}
function getAuthHeaders(): Record<string, string> {
  return {}
}
function getSessionPayload(): RhJwtPayload | null {
  return null
}

/** 榜单长度：只取前 50 条 */
export const DAILY_LEADERBOARD_LIMIT = 50

/** PB 记录：字段名与后端 100% 一致（snake_case），不做 camelCase 转换 */
export type DailyScoreRow = {
  id: string
  date_key: string
  seed: string
  player_id: string
  player_name: string
  floor: number
  cleared: boolean
  duration_ms: number
  hp_left: number
  /** Build 维度分（0~100，新公式；旧记录是老的稀有度加权口径） */
  build_score: number
  /** 综合评分（0~100，五维加权）；旧记录没有 */
  total_score?: number
  /** 本局使用的角色 id；旧记录没有 */
  character?: string
  /** 服务端校验标记："suspect" = 数据可疑（不进榜、不出幽灵） */
  flag?: string
  /** 逐层剩余血量百分比（最多 8 个）；旧记录没有这个字段 */
  path?: number[]
}

/** 幽灵对照：榜上别人那一条的逐层轨迹 */
export type DailyGhost = {
  playerName: string
  /** 对方到达的层数 */
  floor: number
  /** 对方每层打完时的剩余血量百分比（最多 8 个） */
  path: number[]
}

/** 待上报的一条成绩（前端 camelCase） */
export type DailyScoreInput = {
  dateKey: string
  seed: string
  playerId: string
  playerName: string
  floor: number
  cleared: boolean
  durationMs: number
  hpLeft: number
  /** Build 维度分（0~100） */
  buildScore: number
  /** 综合评分（五维加权总分） */
  totalScore: number
  /** 本局使用的角色 id */
  character: string
  /** 本局逐层剩余血量百分比（只有每日挑战才带） */
  path?: number[]
}

export type SubmitDailyScoreResult = {
  ok: boolean
  improved: boolean
  message: string
}

/* ------------------------------------------------------------------ *
 * 纯函数
 * ------------------------------------------------------------------ */

const RARITY_WEIGHT: Record<RelicRarity, number> = {
  common: 2,
  rare: 5,
  epic: 9,
}

/** 点亮一条流派 combo 的额外加成（旧口径，保留给历史数据参考） */
const BOND_BONUS = 6

/** Build 评分（旧口径：稀有度加权 + combo 加成）；新代码用 computeRunScore */
export function computeBuildScore(relics: Relic[]): number {
  const relicScore = relics.reduce(
    (sum, relic) => sum + (RARITY_WEIGHT[relic.rarity] ?? 0),
    0,
  )
  const bondScore = getActiveBondDefs(relics).length * BOND_BONUS
  return Math.max(0, Math.round(relicScore + bondScore))
}

/* ------------------------------------------------------------------ *
 * Build 综合评分 v3（《Build 评分公式》定稿：六维加权 + 各维附加加成）
 *   层数 30% · 生命 15% · 内存 15% · 词条 15% · 羁绊 15% · 用时 10%
 *   每维 = 基础分 + 条件加成，夹 0~100；总分七级 SSS/SS/S/A/B/C/D
 * ------------------------------------------------------------------ */

export type RunScoreInput = {
  floor: number
  maxHp: number
  hpLeft: number
  /** 内存效率 = 净产出/总产出（0~1） */
  memoryRatio: number
  /** 内存耗尽次数（进入耗尽区 <15% 计 1 次；0 = 从未耗尽） */
  memoryOutages: number
  /** 内存崩溃触发次数（低内存卡顿 ≥12 秒锁攻击） */
  memoryCrashes: number
  /** 持有词条数（≥6 按 6 计数量分） */
  relicCount: number
  /** 稀有度加成合计（普通 +3 / 稀有 +6 / 史诗 +10 每张） */
  relicRarityBonus: number
  /** 羁绊分（3 件流派 +15 / 4 件流派 +25 / 四系均衡 +20，已夹上限） */
  bondScore: number
  cleared: boolean
  durationMs: number
}

export type ScoreGrade = "SSS" | "SS" | "S" | "A" | "B" | "C" | "D"

export type RunScorePart = {
  /** 基础分 + 加成后夹 0~100 的最终原始分 */
  raw: number
  /** 条件加成数值（0 表示没触发加成） */
  bonus: number
  /** 加成说明（如「内存从未耗尽 +15」），无加成为 null */
  bonusNote: string | null
  weight: number
  weighted: number
}

export type RunScoreResult = {
  parts: {
    floor: RunScorePart
    hp: RunScorePart
    memory: RunScorePart
    relic: RunScorePart
    bond: RunScorePart
    time: RunScorePart
  }
  total: number
  grade: ScoreGrade
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const clamp100 = (value: number) => Math.max(0, Math.min(100, value))

/* 各维稀有度加成单价（《Build 评分公式》二·4） */
const RARITY_SCORE_BONUS: Record<RelicRarity, number> = {
  common: 3,
  rare: 6,
  epic: 10,
}

/** 词条稀有度加成：每张按稀有度累加（普通 3 / 稀有 6 / 史诗 10） */
export function relicRarityBonusOf(relics: Relic[]): number {
  return relics.reduce((sum, relic) => sum + RARITY_SCORE_BONUS[relic.rarity], 0)
}

/**
 * 羁绊分：3 件流派的 combo 每个 +15、4 件流派每个 +25；
 * 四个系各至少 1 条词条再 +20（均衡之力）。上限 100。
 * （用户规则里的 3 系/5 系按本作 combo 的实际件数分档映射。）
 */
export function bondScoreOf(
  bonds: { relicIds: string[] }[],
  schoolCounts: Record<string, number>,
): number {
  let score = 0
  bonds.forEach((bond) => {
    score += bond.relicIds.length >= 4 ? 25 : 15
  })
  const balanced = ["script", "style", "network", "cache"].every(
    (school) => (schoolCounts[school] ?? 0) >= 1,
  )
  if (balanced) score += 20
  return Math.min(100, score)
}

/** 综合评分 v3：六维各 0~100（含条件加成）× 权重，总分再定七级 */
export function computeRunScore(input: RunScoreInput): RunScoreResult {
  const maxHp = Math.max(1, input.maxHp)

  /* 层数分 = (层 / 8) × 100，通关满分 */
  const floorBase = clamp01(input.floor / 8) * 100

  /* 生命分 = (剩余 / 上限) × 100；无伤 +20、>80% +10、<20% -10 */
  const hpRatio = clamp01(input.hpLeft / maxHp)
  const hpBase = hpRatio * 100
  let hpBonus = 0
  let hpNote: string | null = null
  if (input.hpLeft >= maxHp) {
    hpBonus = 20
    hpNote = "无伤通关 +20"
  } else if (hpRatio > 0.8) {
    hpBonus = 10
    hpNote = "生命 > 80% +10"
  } else if (hpRatio < 0.2) {
    hpBonus = -10
    hpNote = "生命 < 20% -10"
  }

  /* 内存分 = 净产出/总产出 × 100；从未耗尽 +15 / <3 次 +5 / >10 次 -15；崩溃 -20 */
  const memoryBase = clamp01(input.memoryRatio) * 100
  let memoryBonus = 0
  const memoryNotes: string[] = []
  if (input.memoryOutages === 0) {
    memoryBonus += 15
    memoryNotes.push("内存从未耗尽 +15")
  } else if (input.memoryOutages < 3) {
    memoryBonus += 5
    memoryNotes.push(`耗尽 ${input.memoryOutages} 次 +5`)
  } else if (input.memoryOutages > 10) {
    memoryBonus -= 15
    memoryNotes.push(`耗尽 ${input.memoryOutages} 次 -15`)
  }
  if (input.memoryCrashes > 0) {
    memoryBonus -= 20
    memoryNotes.push(`内存崩溃 -20`)
  }

  /* 词条分 = min(数量,6)/6 × 60 + 稀有度加成 */
  const relicBase = clamp01(Math.min(input.relicCount, 6) / 6) * 60
  const relicBonus = Math.max(0, input.relicRarityBonus)

  /* 羁绊分 = 外部算好的 combo 加权分（无附加条件） */
  const bondBase = clamp100(input.bondScore)

  /* 用时分 = max(0, 100 − (秒 − 60) × 0.5)；2 分钟内通关 +20 / 3 分钟内 +10 / 超 5 分钟 -20 */
  const seconds = Math.max(0, input.durationMs / 1000)
  const timeBase = Math.max(0, Math.min(100, 100 - Math.max(0, seconds - 60) * 0.5))
  let timeBonus = 0
  let timeNote: string | null = null
  if (seconds > 300) {
    timeBonus = -20
    timeNote = "超过 5 分钟 -20"
  } else if (input.cleared && seconds <= 120) {
    timeBonus = 20
    timeNote = "2 分钟内通关 +20"
  } else if (input.cleared && seconds <= 180) {
    timeBonus = 10
    timeNote = "3 分钟内通关 +10"
  }

  const part = (
    base: number,
    bonus: number,
    bonusNote: string | null,
    weight: number,
  ): RunScorePart => {
    const raw = clamp100(base + bonus)
    return {
      raw: Math.round(raw * 10) / 10,
      bonus,
      bonusNote,
      weight,
      weighted: Math.round(raw * weight * 10) / 10,
    }
  }

  const parts = {
    floor: part(floorBase, 0, null, 0.3),
    hp: part(hpBase, hpBonus, hpNote, 0.15),
    memory: part(
      memoryBase,
      memoryBonus,
      memoryNotes.length > 0 ? memoryNotes.join(" · ") : null,
      0.15,
    ),
    relic: part(
      relicBase,
      relicBonus,
      relicBonus > 0 ? `稀有度加成 +${relicBonus}` : null,
      0.15,
    ),
    bond: part(bondBase, 0, null, 0.15),
    time: part(timeBase, timeBonus, timeNote, 0.1),
  }
  const total =
    Math.round(
      (parts.floor.weighted +
        parts.hp.weighted +
        parts.memory.weighted +
        parts.relic.weighted +
        parts.bond.weighted +
        parts.time.weighted) *
        10,
    ) / 10

  const grade = scoreGradeOf(total)
  return { parts, total, grade }
}

/** 总分反查评级（榜单 / 历史行只有综合分数时用） */
export function scoreGradeOf(total: number): ScoreGrade {
  return total >= 95
    ? "SSS"
    : total >= 90
      ? "SS"
      : total >= 85
        ? "S"
        : total >= 75
          ? "A"
          : total >= 60
            ? "B"
            : total >= 40
              ? "C"
              : "D"
}

/** 定级展示色（结算 / 榜单共用，全部走已入库 token 类；SSS 用三色渐变近似彩虹） */
export function scoreGradeTextClass(grade: ScoreGrade): string {
  switch (grade) {
    case "SSS":
      return "bg-gradient-to-r from-sys-script via-sys-style to-sys-network bg-clip-text text-transparent"
    case "SS":
    case "S":
      return "text-sys-style"
    case "A":
      return "text-sys-script"
    case "B":
      return "text-sys-cache"
    case "C":
      return "text-sys-network"
    default:
      return "text-muted-foreground"
  }
}

/* ------------------------------------------------------------------ *
 * Build 诊断（《Build 评分公式》七）：从六维结果 + 局面生成短诊断
 * ------------------------------------------------------------------ */

export type ScoreDiagnosis = {
  level: "good" | "warn"
  text: string
}

export function buildScoreDiagnostics(
  score: RunScoreResult,
  ctx: { floor: number; cleared: boolean; relicCount: number; durationMs: number },
): ScoreDiagnosis[] {
  const list: ScoreDiagnosis[] = []
  const seconds = ctx.durationMs / 1000

  if (score.parts.floor.raw >= 75) list.push({ level: "good", text: "层数优秀" })
  else list.push({ level: "warn", text: "层数是核心，优先通关" })

  if (score.parts.hp.raw >= 60) list.push({ level: "good", text: "生命管理优秀" })
  else list.push({ level: "warn", text: "生存能力不足，考虑保命词条" })

  if (score.parts.memory.raw >= 60) list.push({ level: "good", text: "内存效率优秀" })
  else list.push({ level: "warn", text: "内存管理差，考虑内存产出词条" })

  if (ctx.relicCount >= 4) list.push({ level: "good", text: "Build 成型度高" })
  else list.push({ level: "warn", text: "Build 未成型，优先三选一" })

  if (score.parts.bond.raw >= 25) list.push({ level: "good", text: "羁绊激活良好" })
  else list.push({ level: "warn", text: "缺乏 Combo，考虑凑羁绊" })

  if (seconds < 90 && ctx.floor < 5 && !ctx.cleared)
    list.push({ level: "warn", text: "速通失败，优先生存" })
  else if (score.parts.time.raw < 40)
    list.push({ level: "warn", text: "输出不足，考虑攻击词条" })
  else list.push({ level: "good", text: "用时合理" })

  return list
}

/** 诊断行里第一条问题给一句总建议（全绿时返回 null） */
export function buildScoreAdvice(diagnosis: ScoreDiagnosis[]): string | null {
  const firstWarn = diagnosis.find((item) => item.level === "warn")
  return firstWarn ? `下局优先：${firstWarn.text}` : null
}

/** 榜单排序：层数 → 用时 → 剩余血量 → 综合分（旧记录回退 Build 分）；提交先后交给后端排序稳定兜底 */
export function compareDailyScores(a: DailyScoreRow, b: DailyScoreRow): number {
  if (a.floor !== b.floor) return b.floor - a.floor
  if (a.duration_ms !== b.duration_ms) return a.duration_ms - b.duration_ms
  if (a.hp_left !== b.hp_left) return b.hp_left - a.hp_left
  const aTotal = a.total_score ?? a.build_score
  const bTotal = b.total_score ?? b.build_score
  return bTotal - aTotal
}

/** 同一玩家同一天同种子：按榜单优先级逐级比较，更好才覆盖 */
export function isBetterDailyScore(
  next: DailyScoreInput,
  prev: DailyScoreRow,
): boolean {
  if (next.floor !== prev.floor) return next.floor > prev.floor
  if (next.durationMs !== prev.duration_ms) return next.durationMs < prev.duration_ms
  if (next.hpLeft !== prev.hp_left) return next.hpLeft > prev.hp_left
  const prevTotal = prev.total_score ?? prev.build_score
  return next.totalScore > prevTotal
}

/** 用时展示：90 秒 / 2 分 05 秒 */
export function formatScoreDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds} 秒`
  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`
}

/** 当前玩家 id（离线返回空串） */
export function getRhPlayerId(): string {
  return getSessionPayload()?.sub ?? ""
}

/** 当前玩家名（取不到就回占位名） */
export function getRhPlayerName(): string {
  const payload = getSessionPayload()
  const name =
    payload?.nickName || payload?.user_name || payload?.username || payload?.mobile
  return name && name.trim().length > 0 ? name.trim() : "无名标签"
}

/* ------------------------------------------------------------------ *
 * 网络（走相对路径，离线，无服务端）
 * ------------------------------------------------------------------ */

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/** 逐层轨迹：只留 0~100 的整数，最多 8 个；旧记录 / 脏数据一律收敛成空数组 */
function normalizePath(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => typeof item === "number" && Number.isFinite(item))
    .slice(0, DUNGEON_RUN_FLOORS.length)
    .map((item) => Math.max(0, Math.min(100, Math.round(item))))
}

function normalizeRow(raw: unknown): DailyScoreRow | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === "string" ? row.id : ""
  if (!id) return null
  return {
    id,
    date_key: typeof row.date_key === "string" ? row.date_key : "",
    seed: typeof row.seed === "string" ? row.seed : "",
    player_id: typeof row.player_id === "string" ? row.player_id : "",
    player_name: typeof row.player_name === "string" ? row.player_name : "",
    floor: toNumber(row.floor),
    cleared: row.cleared === true,
    duration_ms: toNumber(row.duration_ms),
    hp_left: toNumber(row.hp_left),
    build_score: toNumber(row.build_score),
    total_score:
      typeof row.total_score === "number" && Number.isFinite(row.total_score)
        ? row.total_score
        : undefined,
    character: typeof row.character === "string" && row.character ? row.character : undefined,
    flag: typeof row.flag === "string" && row.flag ? row.flag : undefined,
    path: normalizePath(row.path),
  }
}

function toPayload(input: DailyScoreInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    date_key: input.dateKey,
    seed: input.seed,
    player_id: input.playerId,
    player_name: input.playerName,
    floor: input.floor,
    cleared: input.cleared,
    duration_ms: input.durationMs,
    hp_left: input.hpLeft,
    build_score: input.buildScore,
    total_score: input.totalScore,
    character: input.character,
  }
  /* 没有轨迹就不写这个字段，别把空数组塞进榜里 */
  const path = normalizePath(input.path)
  if (path.length > 0) payload.path = path
  return payload
}

async function readItems(res: Response): Promise<DailyScoreRow[]> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { items?: unknown }
  if (!Array.isArray(data?.items)) return []
  return data.items
    .map(normalizeRow)
    .filter((row): row is DailyScoreRow => row !== null)
}

/** 可疑记录不进榜、不出幽灵（服务端只标记不拦截，客户端负责过滤） */
function dropSuspect(rows: DailyScoreRow[]): DailyScoreRow[] {
  return rows.filter((row) => row.flag !== "suspect")
}

async function fetchRows(params: URLSearchParams): Promise<DailyScoreRow[]> {
  try {
    const res = await fetch(
      `${getApiBase()}/api/daily_scores?${params.toString()}`,
      { headers: { ...getAuthHeaders() } },
    )
    return readItems(res)
  } catch {
    // 离线 / 服务端不可用：排行榜降级为空，UI 显示「还没有人上榜」。
    return []
  }
}

/** 今日榜单：后端按多字段排序取前 50，前端再按同一规则兜底排一次 */
export async function fetchDailyLeaderboard(
  dateKey: string,
  seed: string,
): Promise<DailyScoreRow[]> {
  const params = new URLSearchParams({
    date_key: dateKey,
    seed,
    perPage: "200",
    sort: "-floor,duration_ms,-hp_left,-total_score,created",
  })
  const rows = dropSuspect(await fetchRows(params))
  return rows.sort(compareDailyScores).slice(0, DAILY_LEADERBOARD_LIMIT)
}

/**
 * 每周榜：过去 7 个 date_key 各拉一批，每人只留最好一条，再按榜单规则排。
 * 单日失败按空日处理，不拖垮整周。
 */
export async function fetchWeeklyLeaderboard(
  dateKeys: string[],
): Promise<DailyScoreRow[]> {
  const batches = await Promise.all(
    dateKeys.map((dateKey) =>
      fetchRows(
        new URLSearchParams({ date_key: dateKey, perPage: "200" }),
      ).catch(() => [] as DailyScoreRow[]),
    ),
  )
  const bestByPlayer = new Map<string, DailyScoreRow>()
  dropSuspect(batches.flat()).forEach((row) => {
    if (!row.player_id) return
    const prev = bestByPlayer.get(row.player_id)
    if (!prev || compareDailyScores(row, prev) < 0) bestByPlayer.set(row.player_id, row)
  })
  return [...bestByPlayer.values()]
    .sort(compareDailyScores)
    .slice(0, DAILY_LEADERBOARD_LIMIT)
}

/**
 * 幽灵对照：按「今天 + 今日种子」拉一条别人的成绩当幽灵。
 * 排除自己（未登录时无从排除，就取榜上第一条），按榜单同一套规则排序。
 * 没登录 / 今天还没别人的成绩 / 网络失败 —— 一律返回 null，不抛错、不提示。
 */
export async function fetchDailyGhost(
  dateKey: string,
  seed: string,
): Promise<DailyGhost | null> {
  try {
    const playerId = getRhPlayerId()
    const rows = await fetchDailyLeaderboard(dateKey, seed)
    const rival = rows.find(
      (row) =>
        row.player_id !== playerId && (row.path?.length ?? 0) > 0,
    )
    if (!rival) return null
    return {
      playerName: rival.player_name || "无名标签",
      floor: Math.max(0, Math.round(rival.floor)),
      path: normalizePath(rival.path),
    }
  } catch {
    return null
  }
}

/** 某玩家今日已上报的记录（用于同人同种子去重） */
async function fetchPlayerScores(
  dateKey: string,
  seed: string,
  playerId: string,
): Promise<DailyScoreRow[]> {
  const params = new URLSearchParams({
    date_key: dateKey,
    seed,
    player_id: playerId,
    perPage: "50",
  })
  const res = await fetch(
    `${getApiBase()}/api/daily_scores?${params.toString()}`,
    { headers: { ...getAuthHeaders() } },
  )
  return readItems(res)
}

async function postScore(payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/daily_scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

async function patchScore(
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/daily_scores/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

async function deleteScore(id: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/daily_scores/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

/** 同一玩家同一天同种子只留一条：更好的覆盖旧记录，多出来的清掉 */
async function dropDuplicateScores(
  rows: DailyScoreRow[],
  keepId: string,
): Promise<void> {
  const extras = rows.filter((row) => row.id !== keepId)
  await Promise.all(extras.map((row) => deleteScore(row.id).catch(() => undefined)))
}

/**
 * 上报一局成绩。未登录 / 网络异常都只回一句提示，不抛错——
 * 结算页据此给轻提示，绝不打断结算。
 */
export async function submitDailyScore(
  input: DailyScoreInput,
): Promise<SubmitDailyScoreResult> {
  if (!input.playerId) {
    return { ok: false, improved: false, message: "登录后成绩才能上榜" }
  }
  try {
    const existingAll = await fetchPlayerScores(
      input.dateKey,
      input.seed,
      input.playerId,
    )
    /* 之前被打成可疑的旧记录不参与"更好才覆盖"判定，直接重开一条 */
    const existing = dropSuspect(existingAll)
    const best = existing.length > 0 ? [...existing].sort(compareDailyScores)[0] : null

    if (best && !isBetterDailyScore(input, best)) {
      await dropDuplicateScores(existing, best.id)
      return { ok: true, improved: false, message: "今天榜上已有更好的成绩" }
    }

    const payload = toPayload(input)
    if (best) {
      await patchScore(best.id, payload)
      await dropDuplicateScores(existing, best.id)
    } else {
      await postScore(payload)
      await dropDuplicateScores(existingAll, "")
    }
    return { ok: true, improved: true, message: "成绩已上榜" }
  } catch {
    return { ok: false, improved: false, message: "成绩暂时没能上榜，不影响这局结算" }
  }
}
