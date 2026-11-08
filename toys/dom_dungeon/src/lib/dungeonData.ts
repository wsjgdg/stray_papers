/**
 * 《标签地牢》静态数据与纯函数。
 * 全部为前端常量，不依赖后端。
 */

export type CharacterId =
  | "tab-assassin"
  | "cache-mage"
  | "script-warrior"
  | "incognito-ranger"
  | "cookie-thief"
  | "worker-monk"
  | "kernel-shade"

export type DungeonCharacter = {
  id: CharacterId
  displayName: string
  roleLabel: string
  passive: string
  activeName: string
  activeDesc: string
  cooldown: string
  tagline: string
  /** 推荐词条系：三选一弹窗按它标「推荐给 XX」（含「通用」系，故用 RelicSchoolKey） */
  recommendedSchools: RelicSchoolKey[]
  unlockedByDefault: boolean
  fragmentCost: number
  /** > 0 = 允许花核心买断的双路线角色（碎片价或核心价任选其一） */
  coreCost: number
  /** > 0 = 隐藏角色：累计通关满这么多次才在首页 / 图鉴出现 */
  requiresClears: number
}

export type DungeonRunRecord = {
  characterId: CharacterId
  characterName: string
  floor: number
  cause: string
  seed: string
  relics: string[]
  endedAt: string
  /* 结算页需要的补充字段：旧存档里可能没有，读的时候一律按可选处理 */
  relicIds?: string[]
  cleared?: boolean
  kills?: number
  damageDealt?: number
  reward?: number
  durationMs?: number
  /** 结束时剩余血量（每日挑战排行榜用，旧存档里没有） */
  hpLeft?: number
  /** 结束时生命上限（含局内成长；综合评分的生命分用，旧存档里没有） */
  maxHp?: number
  /** 逐层剩余血量百分比（每日挑战的幽灵对照用，旧存档里没有） */
  path?: number[]
  /** 无伤通关：全程没掉过一滴血且通关（成就用，旧存档里没有） */
  noDamage?: boolean
  /** 硬核模式通关标记：这局用的是硬核操作模式（结算页展示，不影响评分） */
  hardcore?: boolean
  /** 内存效率评分（v2 结算）：比值 0~1 + 评级 + 额外碎片（旧存档里没有） */
  memoryEff?: { ratio: number; grade: string; bonus: number }
  /** 本局内存总产出 / 总消耗（结算页展示，产出不计层间回满） */
  memoryGained?: number
  memorySpent?: number
  /** 内存耗尽次数（进入耗尽区计 1 次；Build 评分内存维度加成用，旧存档按 0 处理） */
  memoryOutages?: number
  /** 内存崩溃触发次数（Build 评分内存维度减分用，旧存档按 0 处理） */
  memoryCrashes?: number
  /** 本局故事（fun-pack.md 四）：逐条叙事，结算页 RunStoryPanel 消费；旧存档没有 */
  story?: string[]
  /** 本局进过死亡处理（含复活成功）；管理员资格判定用（fun-pack4.md 二），旧存档没有 */
  died?: boolean
  /** 本局击败了管理员 → 开发者模式（fun-pack4.md 二），旧存档没有 */
  adminDefeated?: boolean
  /* ---- 深化包（deepening-pack.md）：旧存档没有，一律按可选处理 ---- */
  /** 本局内存碎片峰值（结算卡小字行） */
  maxFrags?: number
  /** 本局整理碎片的次数（任务管理器 / 回收站 / 商店三通道合计） */
  defrags?: number
  /** 本局内存超频使用次数 */
  overclocks?: number
}

export const DUNGEON_CHARACTERS: DungeonCharacter[] = [
  {
    id: "tab-assassin",
    displayName: "标签刺客",
    roleLabel: "斩杀",
    passive: "被动 · 无痕切换：闪避成功后攻速 +25%，持续 2 秒。",
    activeName: "关闭标签",
    activeDesc: "对当前敌人造成 8 点伤害；若击杀，冷却立即归零。",
    cooldown: "冷却 2.5 秒",
    tagline: "你点的每一个叉，都是它身上的一道口子。",
    recommendedSchools: ["script", "network"],
    unlockedByDefault: true,
    fragmentCost: 0,
    coreCost: 0,
    requiresClears: 0,
  },
  {
    id: "cache-mage",
    displayName: "缓存法师",
    roleLabel: "护盾",
    passive: "被动 · 伪元素爆炸：护盾破碎时，对当前敌人造成 8 点伤害。",
    activeName: "缓存护盾",
    activeDesc: "获得 10 点护盾，上限 30；护盾存在时攻击 +15%。",
    cooldown: "冷却 3 秒",
    tagline: "东西没丢，只是被它藏进了缓存里。",
    recommendedSchools: ["style", "cache"],
    unlockedByDefault: true,
    fragmentCost: 0,
    coreCost: 0,
    requiresClears: 0,
  },
  {
    id: "script-warrior",
    displayName: "脚本战士",
    roleLabel: "连击",
    passive: "被动 · 监听叠加：每次命中叠 1 层，满 5 层后下次攻击必定暴击并清空。",
    activeName: "事件连击",
    activeDesc: "接下来 2 秒内，自动攻击变为双重打击。",
    cooldown: "冷却 6 秒",
    tagline: "一次点击，三百行代码替你出手。",
    recommendedSchools: ["script", "network"],
    unlockedByDefault: true,
    fragmentCost: 0,
    coreCost: 0,
    requiresClears: 0,
  },
  {
    id: "incognito-ranger",
    displayName: "无痕游侠",
    roleLabel: "潜行",
    passive: "被动 · 必暴一击：闪避后，下次攻击必定暴击。",
    activeName: "无痕步",
    activeDesc: "1.5 秒内无敌，并攻速 +30%。",
    cooldown: "冷却 5 秒",
    tagline: "浏览器记不住你，地牢也追不上你。",
    recommendedSchools: ["network", "style"],
    unlockedByDefault: false,
    fragmentCost: 500,
    coreCost: 0,
    requiresClears: 0,
  },
  {
    id: "cookie-thief",
    displayName: "饼干窃贼",
    roleLabel: "汲取",
    passive: "被动 · 饼罐子：每关掉一个敌人，汲取 3 点生命。",
    activeName: "投掷饼干",
    activeDesc: "对当前敌人扔出饼干：6 点伤害，并汲取 6 点生命。",
    cooldown: "冷却 5 秒",
    tagline: "你的浏览器存了三千块饼干，全归你了。",
    recommendedSchools: ["network", "cache"],
    unlockedByDefault: false,
    fragmentCost: 600,
    coreCost: 0,
    requiresClears: 0,
  },
  {
    id: "worker-monk",
    displayName: "工作僧侣",
    roleLabel: "后台",
    passive: "被动 · 后台同步：每 8 次普通攻击，追加一次 8 点伤害。",
    activeName: "多线程执行",
    activeDesc: "接下来 3 秒，攻速 +60%。",
    cooldown: "冷却 7 秒",
    tagline: "你以为页面停了，其实它在后台替你打坐。",
    recommendedSchools: ["script", "general"],
    unlockedByDefault: false,
    fragmentCost: 800,
    coreCost: 0,
    requiresClears: 0,
  },
  {
    id: "kernel-shade",
    displayName: "内核之影",
    roleLabel: "权限",
    passive: "被动 · 根权限：血量低于 40% 时，攻速 +30%。",
    activeName: "任务管理器",
    activeDesc: "冻结全场敌人 2 秒：前摇清空，2 秒内无法出手。",
    cooldown: "冷却 12 秒",
    tagline: "没有你关不掉的进程——包括它自己。",
    recommendedSchools: ["general", "script"],
    unlockedByDefault: false,
    fragmentCost: 1200,
    coreCost: 25,
    requiresClears: 3,
  },
]

export const DEFAULT_UNLOCKED_IDS: CharacterId[] = DUNGEON_CHARACTERS.filter(
  (item) => item.unlockedByDefault,
).map((item) => item.id)

export const DUNGEON_FLOORS = [
  "1 标签层 · 弹窗",
  "2 弹窗层 · 双弹",
  "3 广告层 · 护盾广告",
  "4 小 Boss · 全屏广告",
  "5 断链层 · 404",
  "6 验证层 · 验证码",
  "7 泄漏层 · 内存泄漏",
  "8 大 Boss · 崩溃页面",
]

export const ENEMY_PREVIEW = ["弹窗", "广告", "404", "加载条", "验证码", "内存泄漏"]

export const BOSS_PREVIEW = ["第 4 层 · 全屏广告", "第 8 层 · 崩溃页面"]

export const DEMO_RUN: DungeonRunRecord = {
  characterId: "tab-assassin",
  characterName: "标签刺客",
  floor: 6,
  cause: "被第 6 层的验证码拖到超时",
  seed: "A11D-E000",
  relics: ["闭包", "请求拦截", "本地存储"],
  endedAt: "示例战绩",
}

export function isCharacterId(value: unknown): value is CharacterId {
  return (
    typeof value === "string" &&
    DUNGEON_CHARACTERS.some((item) => item.id === value)
  )
}

export function findCharacter(
  id: CharacterId | null | undefined,
): DungeonCharacter | null {
  if (!id) return null
  return DUNGEON_CHARACTERS.find((item) => item.id === id) ?? null
}

/* ------------------------------------------------------------------ *
 * 角色外观（皮肤）
 * 每个角色 3 套配色，纯视觉，不改任何战斗数值 / 碎片收益 / 评分。
 * 颜色一律用已烧进 :root 的 token 类组合，禁止硬编码色值。
 * ------------------------------------------------------------------ */

export type SkinVariantKey = "native" | "neon" | "polar"

/** 一套外观的配色 token 类：卡面、强调、血条、按钮、圆点各取所需 */
export type SkinStyle = {
  /** 卡面描边 */
  border: string
  /** 卡面底色微调 */
  surface: string
  /** 强调色文字 */
  accentText: string
  /** 强调小块（徽标 / 标签） */
  chip: string
  /** 血条 / 进度条填充 */
  bar: string
  /** 主动技按钮 */
  action: string
  /** 皮肤圆点填充 */
  dot: string
  /** 选中圆点 / 卡面的强调描边（配合 border-* 用） */
  ring: string
}

export type CharacterSkin = {
  /** 稳定 id：`<角色 id>:<外观键>` */
  id: string
  characterId: CharacterId
  variant: SkinVariantKey
  displayName: string
  desc: string
  /** 碎片价：默认那套为 0 */
  cost: number
  /** 核心价（> 0 = 允许花核心买断的双路线外观） */
  coreCost: number
  style: SkinStyle
}

const SKIN_VARIANTS: {
  key: SkinVariantKey
  displayName: string
  desc: string
  cost: number
  coreCost: number
  style: SkinStyle
}[] = [
  {
    key: "native",
    displayName: "原生",
    desc: "出厂配色，浏览器最本来的样子。",
    cost: 0,
    coreCost: 0,
    style: {
      border: "border-primary/50",
      surface: "bg-primary/5",
      accentText: "text-primary",
      chip: "border-primary/50 bg-primary/10 text-primary",
      bar: "bg-primary",
      action: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
      dot: "bg-primary",
      ring: "ring-primary/40",
    },
  },
  {
    key: "neon",
    displayName: "霓虹",
    desc: "广告灯箱打满整层，走到哪都刺眼。",
    cost: 200,
    coreCost: 0,
    style: {
      border: "border-destructive/50",
      surface: "bg-destructive/5",
      accentText: "text-destructive",
      chip: "border-destructive/50 bg-destructive/10 text-destructive",
      bar: "bg-destructive",
      action:
        "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
      dot: "bg-destructive",
      ring: "ring-destructive/40",
    },
  },
  {
    key: "polar",
    displayName: "极夜",
    desc: "关掉所有灯，只剩一行白字在闪。",
    cost: 400,
    coreCost: 8,
    style: {
      border: "border-foreground/40",
      surface: "bg-foreground/5",
      accentText: "text-foreground",
      chip: "border-foreground/40 bg-foreground/10 text-foreground",
      bar: "bg-foreground",
      action: "border-foreground/60 bg-foreground text-background hover:bg-foreground/90",
      dot: "bg-foreground",
      ring: "ring-foreground/30",
    },
  },
]

export function makeSkinId(
  characterId: CharacterId,
  variant: SkinVariantKey,
): string {
  return `${characterId}:${variant}`
}

/** 某个角色的 3 套外观，顺序固定（默认那套永远第一个） */
export function getCharacterSkins(characterId: CharacterId): CharacterSkin[] {
  return SKIN_VARIANTS.map((variant) => ({
    id: makeSkinId(characterId, variant.key),
    characterId: characterId,
    variant: variant.key,
    displayName: variant.displayName,
    desc: variant.desc,
    cost: variant.cost,
    coreCost: variant.coreCost,
    style: variant.style,
  }))
}

/** 全部角色的全部外观（图鉴统计 / 存档归一化校验用） */
export function getAllCharacterSkins(): CharacterSkin[] {
  return DUNGEON_CHARACTERS.flatMap((character) =>
    getCharacterSkins(character.id),
  )
}

export function getSkinById(
  skinId: string | null | undefined,
): CharacterSkin | null {
  if (!skinId) return null
  return getAllCharacterSkins().find((skin) => skin.id === skinId) ?? null
}

export function getDefaultSkin(characterId: CharacterId): CharacterSkin {
  return getCharacterSkins(characterId)[0]
}

export function getDefaultSkinId(characterId: CharacterId): string {
  return makeSkinId(characterId, "native")
}

/** 该外观确实属于这个角色才认，否则回退默认那套（跨页取色统一走这里） */
export function resolveSkin(
  characterId: CharacterId,
  skinId: string | null | undefined,
): CharacterSkin {
  const skin = getSkinById(skinId)
  if (skin && skin.characterId === characterId) return skin
  return getDefaultSkin(characterId)
}

/** 默认那套人人可用，免费的 */
export const DEFAULT_UNLOCKED_SKIN_IDS: string[] = DUNGEON_CHARACTERS.map(
  (character) => getDefaultSkinId(character.id),
)

function dayStamp(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}${month}${day}`
}

/* 种子驱动（seed-system.md 二）：日种子 = 哈希(版本盐 + 日期 + 赛季盐 + 版本号)，
 * 显示格式统一 XXXX-XXXX。旧 TAG-YYYYMMDD 格式废除；所有 `seed === getDailySeed()` 判定自动跟随。
 * 掺版本号 = 不同版本种子不同，防止跨版本抄作业（每日规则 doc 一）。 */
import { formatSeedCode, hashString, makeRng, pickWeighted, shuffleSeeded, streamFor } from "./rng"
import { APP_VERSION } from "./appMeta"

/** 赛季盐：换赛季改这一处（连同 pb_hooks/daily_guard.pb.js 里的同款常量） */
export const SEASON_SALT = "S1"

export function getDailySeed(date: Date = new Date()): string {
  const hash = hashString(
    `${GEN_SALT_LOCAL}:daily:${dayStamp(date)}:${SEASON_SALT}:${APP_VERSION}`,
  )
  /* 先把哈希过一个确定性抽样再转显示格式：0~1 浮点直接转会被截成 0 */
  const drawn = Math.floor(makeRng(hash)() * 4294967296)
  return formatSeedCode(drawn)
}

/** 与 rng.ts 的 GEN_SALT 同值（rng 里定义，这里引一份常量别名方便日种子拼接） */
const GEN_SALT_LOCAL = "seed-gen-v1"

export function getDailyShortCode(date: Date = new Date()): string {
  return hashString(`short:${getDailySeed(date)}`).toString(36).toUpperCase().slice(-5)
}

/** 每日挑战的日期键，形如 2026-09-21（排行榜按它分组） */
export function getDailyDateKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/* ------------------------------------------------------------------ *
 * 每日挑战规则元数据（每日规则 doc 一）：全服统一、由日种子确定性推得
 * ------------------------------------------------------------------ */

/** 周一~周四固定角色轮换表（getDay：0=周日） */
const WEEKDAY_ROSTER: Partial<Record<number, CharacterId>> = {
  1: "tab-assassin",
  2: "cache-mage",
  3: "script-warrior",
  4: "incognito-ranger",
}

/** 普通敌人档位全集（与 seedGen.ENEMY_TIERS 键保持一致，含 5 档） */
const ENEMY_TIER_IDS = ["popup", "ad", "notfound", "captcha", "leak"]

/** 每日诅咒权重（无 5%） */
const DAILY_CURSE_WEIGHTS: { item: CurseId | "none"; weight: number }[] = [
  { item: "curse-mem-leak", weight: 20 },
  { item: "curse-virus", weight: 20 },
  { item: "curse-ad-bomb", weight: 15 },
  { item: "curse-throttle", weight: 15 },
  { item: "curse-offline", weight: 15 },
  { item: "curse-bluescreen", weight: 10 },
  { item: "none", weight: 5 },
]

export type DailyMeta = {
  /** fixed=周一~周四指定角色；random=周五六全角色随机；pick=周日自选 */
  characterMode: "fixed" | "random" | "pick"
  /** fixed / random 模式下的今日角色；pick 模式为 null（自选） */
  fixedCharacterId: CharacterId | null
  /** 今日全服诅咒（none = 今天没有诅咒） */
  curseId: CurseId | "none"
  /** 今日词条池（30 抽 20，三选一只从这里面出） */
  relicPool: string[]
  /** 今日路线池（10 抽 6） */
  routePool: RouteId[]
  /** 今日敌人池（5 档抽 4；某层交集为空时引擎回退该层原池） */
  enemyPool: string[]
}

/** 今日全服规则：角色轮换 / 诅咒 / 三个池，全部由日种子确定性推得 */
export function getDailyMeta(date: Date = new Date()): DailyMeta {
  const rng = streamFor(getDailySeed(date), "daily-meta")
  const weekday = date.getDay()
  let characterMode: DailyMeta["characterMode"] = "pick"
  let fixedCharacterId: CharacterId | null = null
  if (WEEKDAY_ROSTER[weekday]) {
    characterMode = "fixed"
    fixedCharacterId = WEEKDAY_ROSTER[weekday] ?? null
  } else if (weekday === 5 || weekday === 6) {
    characterMode = "random"
    fixedCharacterId = pickWeighted(
      rng,
      DUNGEON_CHARACTERS.map((character) => ({ item: character.id, weight: 1 })),
    )
  }
  const relicPool = shuffleSeeded(rng, RELIC_POOL.map((relic) => relic.id)).slice(0, 20)
  const routePool = shuffleSeeded(
    rng,
    (Object.keys(ROUTE_TYPES) as RouteId[]),
  ).slice(0, 6)
  const enemyPool = shuffleSeeded(rng, ENEMY_TIER_IDS).slice(0, 4)
  return {
    characterMode,
    fixedCharacterId,
    curseId: pickWeighted(rng, DAILY_CURSE_WEIGHTS),
    relicPool,
    routePool,
    enemyPool,
  }
}

/** 今日角色的展示名（pick 模式回「自选」） */
export function dailyCharacterLabel(meta: DailyMeta): string {
  if (!meta.fixedCharacterId) return "自选角色"
  const character = DUNGEON_CHARACTERS.find((item) => item.id === meta.fixedCharacterId)
  const name = character?.displayName ?? meta.fixedCharacterId
  return meta.characterMode === "random" ? `随机角色 · ${name}` : name
}

/** 普通模式随机种子：32bit 随机 → 统一 XXXX-XXXX 显示格式（seed-system.md 二） */
export function getRandomSeed(): string {
  const numeric =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 4294967296)
  return formatSeedCode(numeric)
}

export function formatFloorLabel(floor: number): string {
  if (floor >= 8) return "第 8 层 · 大 Boss"
  if (floor >= 4) return `第 ${floor} 层`
  return `第 ${floor} 层`
}

/* ================================================================== *
 * 局内战斗数据（地牢页专用，全部前端常量）
 * ================================================================== */

/** 四系 + 通用（跨域可当任意一系用） */
export type RelicSchool = "script" | "style" | "network" | "cache"
export type RelicSchoolKey = RelicSchool | "general"
export type RelicRarity = "common" | "rare" | "epic"

export const RELIC_SCHOOLS: RelicSchool[] = [
  "script",
  "style",
  "network",
  "cache",
]

/**
 * 词条效果字段。战斗引擎只读这张表，所有数值型修正统一在 buildMods 里汇总，
 * 不在各处散落判断。
 *
 * v4 机制字段（批次 A 只落类型与数据，引擎接线在批次 B/C；数值出处见
 * `.rh/pages/relic-redesign.md` 各条目）：
 * - bounceCount/bounceRatio/bounceMemoryCost：弹射跳数 / 每跳伤害衰减 / 每跳内存耗（S1/S2）
 * - closureEcho：主动技后原地留「闭包」再触发一次（S3）
 * - tripleOnHurt：受击后 1 秒内下次攻击三连击（S4，内存耗走 Relic.memoryCost）
 * - throttleGain：每 5 秒积 1 层节流，手动消耗 1 层挡伤（S5）
 * - chainCrit：连续 N 次命中后链式暴击全体 150%（S6）
 * - blockActiveMs：主动技释放后阻塞不能攻击与闪避（S7）
 * - decoyAfterDodge：闪避残影，2 秒内敌人 60% 概率改打残影（C2）
 * - responsiveRefactor：血量首破 30% 清负面+回血，每层 1 次（C3）
 * - enemySlowMs：闪避后我攻击使被击敌人攻速减半的持续（C4）
 * - shieldSplit / minionDeathMemory：护盾破碎分裂弹数 / 小护盾死亡回内存（C5，联动 M5）
 * - shieldAttackBonus：护盾存在时攻击加成（C6）
 * - darkTheme：全体敌人血量减半 + 非锁定目标轮廓化（C7）
 * - stealMemoryOnCrit：暴击偷内存（N1）
 * - fourthHitCrit / memoryGainFourthHit：同目标第 4 击必暴 / 回内存（N2）
 * - overflowTransfer：击杀溢出伤害转移（N3）
 * - pierceRatio / pierceMemoryCost：穿透位伤害比例 / 每次穿透内存耗（N4）
 * - reviveMemoryCost：断点续传自动复活的内存门槛，不足必失败（N5）
 * - rerollForceRare：超时重试后必出稀有以上（N6）
 * - memoryMaxDelta / memoryMaxPerFloorDelta：内存上限修正（N7/M3/G1、M4）
 * - storageHealPool：本地存储池每层存入量，下一层开始生效（M1）
 * - killMemoryGain：击杀回内存（M5，与 v2 击杀基础产出叠加）
 * - deathWardClearMinions：免死触发时清空场上普通小怪（M6）
 * - offlineWindowMs / offlineCooldownMs：离线模式无敌时长与冷却（M7）
 * - freeRerollOnce：每局 1 次不耗次数的三选一刷新（G2）
 */
export type RelicEffect = {
  /* 输出：攻速 / 连击 / 暴击 / 主动技 */
  attackFlat?: number
  attackMult?: number
  attackIntervalMult?: number
  followupChance?: number
  followupRatio?: number
  doubleAttackChance?: number
  critChance?: number
  critMult?: number
  critAfterHits?: number
  hurtHasteMs?: number
  activeCooldownMult?: number
  activeDamageMult?: number
  /* 防御：护盾 / 减伤 / 闪避 / 免疫 */
  maxHpFlat?: number
  damageReduction?: number
  lowHpReduction?: number
  lowHpThreshold?: number
  startShield?: number
  shieldMaxMult?: number
  shieldBreakDamage?: number
  dodgeChance?: number
  dodgeWindowBonusMs?: number
  dodgeCooldownMult?: number
  hurtDodgeChance?: number
  hurtDodgeMs?: number
  firstHitImmunePerFloor?: number
  immuneEveryMs?: number
  /* 敌人侧：攻击间隔 / 穿透 / 斩杀 */
  enemyIntervalMult?: number
  penetration?: number
  killBonusMult?: number
  executeAll?: number
  executeBonus?: number
  /* 回复 / 复活 */
  healPerFloor?: number
  healOnKill?: number
  idleHealPerSec?: number
  reviveChance?: number
  reviveHpRatio?: number
  reviveFullOnce?: number
  deathWardPerFloors?: number
  /* 成长 / 经济 / 选卡 */
  attackPerFloorMult?: number
  fragmentMult?: number
  bonusPickRounds?: number
  rerollPerFloor?: number
  extraChoiceCount?: number
  crossSchool?: number
  allStatsMult?: number
  /* ---- v4 机制字段（批次 A 数据先行，引擎接线批次 B/C） ---- */
  bounceCount?: number
  bounceRatio?: number
  bounceMemoryCost?: number
  closureEcho?: number
  tripleOnHurt?: number
  throttleGain?: number
  chainCrit?: number
  blockActiveMs?: number
  decoyAfterDodge?: number
  responsiveRefactor?: number
  enemySlowMs?: number
  shieldSplit?: number
  shieldAttackBonus?: number
  darkTheme?: number
  stealMemoryOnCrit?: number
  fourthHitCrit?: number
  memoryGainFourthHit?: number
  overflowTransfer?: number
  pierceRatio?: number
  pierceMemoryCost?: number
  reviveMemoryCost?: number
  rerollForceRare?: number
  memoryMaxDelta?: number
  memoryMaxPerFloorDelta?: number
  storageHealPool?: number
  killMemoryGain?: number
  minionDeathMemory?: number
  deathWardClearMinions?: number
  offlineWindowMs?: number
  offlineCooldownMs?: number
  freeRerollOnce?: number
}

export type RelicRisk = "low" | "mid" | "high"

export type Relic = {
  /** 图鉴 / 存档用的稳定 id */
  id: string
  /** 图鉴编号（S1 / C1 / N1 / M1 / G1） */
  code: string
  name: string
  school: RelicSchoolKey
  rarity: RelicRarity
  desc: string
  effect: RelicEffect
  /** 内存成本：>0 = 消耗 X，<0 = 产出 X（描述性），缺省 = 无 */
  memoryCost?: number
  /** 风险等级：三选一卡片「风险 低/中/高」展示用 */
  risk: RelicRisk
}

/** 风险等级文案（卡片 / 详情面板共用） */
export const RELIC_RISK_LABEL: Record<RelicRisk, string> = {
  low: "低",
  mid: "中",
  high: "高",
}

/** 风险配色：低=muted / 中=网络黄 / 高=警报红（全部走既有 token） */
export const RELIC_RISK_STYLE: Record<RelicRisk, string> = {
  low: "text-muted-foreground",
  mid: "text-sys-network",
  high: "text-destructive",
}

/* ---------------- 内存资源（v2 局内唯一资源，规格 .rh/pages/memory-route-redesign.md） ---------------- */

/** 基础上限从 8 起，每 2 层 +1（第 2/4/6/8 层），词条修正后夹逼 [MEMORY_MIN_CAP, MEMORY_MAX_CAP] */
export const MEMORY_BASE_MAX = 8
/** 某层的基础内存上限：8 + ⌊层/2⌋ → 8/9/9/10/10/11/11/12 */
export function memoryBaseMaxForFloor(floor: number): number {
  return MEMORY_BASE_MAX + Math.floor(floor / 2)
}
/** 硬上限 / 硬下限：词条增减都被夹在这个区间（上限为 0 不可能，最低 3） */
export const MEMORY_MAX_CAP = 20
export const MEMORY_MIN_CAP = 3

/** 4 区间：≥70% 充裕（攻速+5%）/ ≥40% 正常 / ≥15% 卡顿（攻速-10%、闪避CD+0.5s）/ <15% 阻塞（攻速-30%、禁主动技与闪避） */
export const MEMORY_ABUNDANT_RATIO = 0.7
export const MEMORY_TENSE_RATIO = 0.4
export const MEMORY_EXHAUSTED_RATIO = 0.15
export const MEMORY_ABUNDANT_HASTE_MULT = 1.05
export const MEMORY_TENSE_SPEED_MULT = 0.9
export const MEMORY_EXHAUSTED_SPEED_MULT = 0.7
export const MEMORY_TENSE_DODGE_CD_BONUS_MS = 500

/** 卡顿累积：持续处于卡顿/阻塞才计时，回到 ≥40% 清零 */
export const MEMORY_STALL_HASTE_AT_MS = 3000
export const MEMORY_STALL_HASTE_MULT = 0.95
export const MEMORY_STALL_DODGE_CD_AT_MS = 5000
export const MEMORY_STALL_DODGE_CD_BONUS_MS = 1000
export const MEMORY_STALL_DRAIN_AT_MS = 8000
export const MEMORY_STALL_DRAIN_HP = 1
export const MEMORY_STALL_CRASH_AT_MS = 12000
export const MEMORY_STALL_CRASH_LOCK_MS = 2000

/** 击杀基础产出：普通 / 精英 / 小 Boss（全屏广告）/ 大 Boss（崩溃页面） */
export const MEMORY_KILL_NORMAL = 1
export const MEMORY_KILL_ELITE = 2
export const MEMORY_KILL_MINI_BOSS = 4
export const MEMORY_KILL_BIG_BOSS = 6

/** 基础行动成本（v2：所有操作都有成本） */
export const MEMORY_DODGE_COST = 1
export const MEMORY_COMBO_CLICK_COST = 0.5
export const MEMORY_DRAG_CLOSE_COST = 3
/** 拾取碎片点的内存产出（+0.5，展示向上取整） */
export const MEMORY_SHARD_GAIN = 0.5

/** 结算内存效率：(总产出-总消耗)/总产出，产出不计层间回满；评级对应额外碎片 */
export const MEMORY_EFFICIENCY_TIERS = [
  { min: 0.8, grade: "S", bonus: 50 },
  { min: 0.6, grade: "A", bonus: 30 },
  { min: 0.4, grade: "B", bonus: 15 },
  { min: 0.2, grade: "C", bonus: 5 },
  { min: 0, grade: "D", bonus: 0 },
] as const

export function memoryEfficiencyOf(gained: number, spent: number): {
  ratio: number
  grade: string
  bonus: number
} {
  if (gained <= 0) return { ratio: 0, grade: "D", bonus: 0 }
  const ratio = Math.min(1, Math.max(0, (gained - spent) / gained))
  const tier =
    MEMORY_EFFICIENCY_TIERS.find((item) => ratio >= item.min) ??
    MEMORY_EFFICIENCY_TIERS[MEMORY_EFFICIENCY_TIERS.length - 1]
  return { ratio, grade: tier.grade, bonus: tier.bonus }
}

export const RELIC_SCHOOL_LABEL: Record<RelicSchoolKey, string> = {
  script: "脚本系",
  style: "样式系",
  network: "网络系",
  cache: "缓存系",
  general: "通用",
}

/** 短名：三选一弹窗里「当前脚本：2/3」用 */
export const RELIC_SCHOOL_SHORT: Record<RelicSchoolKey, string> = {
  script: "脚本",
  style: "样式",
  network: "网络",
  cache: "缓存",
  general: "通用",
}

/** 四系四色 + 通用（规范·配色系统）：脚本=霓虹青 / 样式=电光紫 / 网络=金币黄 / 缓存=回复绿 / 通用=主文字；glow = 选中时的 20px 系别外发光 */
export const RELIC_SCHOOL_STYLE: Record<
  RelicSchoolKey,
  { chip: string; dot: string; ring: string; glow: string }
> = {
  script: {
    chip: "border-sys-script/50 bg-sys-script/10 text-sys-script",
    dot: "bg-sys-script",
    ring: "border-sys-script/60",
    glow: "shadow-[0_0_20px_rgba(0,229,255,0.3)]",
  },
  style: {
    chip: "border-sys-style/50 bg-sys-style/10 text-sys-style",
    dot: "bg-sys-style",
    ring: "border-sys-style/60",
    glow: "shadow-[0_0_20px_rgba(177,78,255,0.3)]",
  },
  network: {
    chip: "border-sys-network/50 bg-sys-network/10 text-sys-network",
    dot: "bg-sys-network",
    ring: "border-sys-network/60",
    glow: "shadow-[0_0_20px_rgba(255,197,61,0.3)]",
  },
  cache: {
    chip: "border-sys-cache/50 bg-sys-cache/10 text-sys-cache",
    dot: "bg-sys-cache",
    ring: "border-sys-cache/60",
    glow: "shadow-[0_0_20px_rgba(46,230,168,0.3)]",
  },
  general: {
    chip: "border-sys-general/40 bg-sys-general/10 text-sys-general",
    dot: "bg-sys-general/70",
    ring: "border-sys-general/40",
    glow: "shadow-[0_0_20px_rgba(230,237,243,0.25)]",
  },
}

export const RELIC_RARITY_LABEL: Record<RelicRarity, string> = {
  common: "普通",
  rare: "稀有",
  epic: "史诗",
}

/** 稀有度（规范·稀有度）：普通=禁用灰 / 稀有=霓虹青微光 / 史诗=电光紫脉冲光 */
export const RELIC_RARITY_STYLE: Record<RelicRarity, string> = {
  common: "border-textDisabled bg-card text-muted-foreground",
  rare: "border-sys-script/50 text-sys-script shadow-[0_0_8px_rgba(0,229,255,0.25)]",
  epic: "border-sys-style/60 text-sys-style shadow-[0_0_16px_rgba(177,78,255,0.35)]",
}

/* ------------------------------------------------------------------ *
 * 词条池 v4：四系各 7 + 通用 2 = 30 条（机制型词条，数值权威见
 * `.rh/pages/relic-redesign.md` B 节；机制引擎接线在批次 B/C）
 * ------------------------------------------------------------------ */

export const RELIC_POOL: Relic[] = [
  /* ---------------- 脚本系（弹射 / 主动技 / 资源层） ---------------- */
  {
    id: "event-listener",
    code: "S1",
    name: "事件监听",
    school: "script",
    rarity: "common",
    desc: "攻击 50% 伤害弹射下一个敌人；每次弹射耗 1 内存。回调地狱在场时弹射 +2 跳，弹射流点亮后弹射不耗内存。",
    risk: "mid",
    memoryCost: 1,
    effect: { bounceCount: 1, bounceRatio: 0.5, bounceMemoryCost: 1 },
  },
  {
    id: "callback-hell",
    code: "S2",
    name: "回调地狱",
    school: "script",
    rarity: "rare",
    desc: "弹射次数 +2，每跳伤害 ×0.7 递减；每跳耗 1 内存。",
    risk: "mid",
    memoryCost: 1,
    effect: { bounceCount: 2, bounceRatio: 0.7, bounceMemoryCost: 1 },
  },
  {
    id: "closure",
    code: "S3",
    name: "闭包",
    school: "script",
    rarity: "common",
    desc: "主动技后原地留「闭包」，1.5 秒后再触发一次主动技效果（同目标同倍率，不吃二次闭包）。",
    risk: "low",
    effect: { closureEcho: 1 },
  },
  {
    id: "debounce",
    code: "S4",
    name: "防抖",
    school: "script",
    rarity: "rare",
    desc: "受击后 1 秒内下次攻击变三连击（3 次普攻，可暴击）；三连击耗 2 内存。",
    risk: "mid",
    memoryCost: 2,
    effect: { tripleOnHurt: 1 },
  },
  {
    id: "throttle",
    code: "S5",
    name: "节流",
    school: "script",
    rarity: "rare",
    desc: "每 5 秒积 1 层节流（上限 3 层）；手动消耗 1 层挡下一次伤害。持有期间：内存上限 -1。",
    risk: "low",
    effect: { throttleGain: 1, memoryMaxDelta: -1 },
  },
  {
    id: "promise-chain",
    code: "S6",
    name: "Promise 链",
    school: "script",
    rarity: "rare",
    desc: "连续命中 5 次后下次攻击变链式暴击：对全体敌人 150% 伤害；耗 3 内存（斩杀流点亮后降为 1）。",
    risk: "high",
    memoryCost: 3,
    effect: { chainCrit: 5 },
  },
  {
    id: "async-awaken",
    code: "S7",
    name: "异步觉醒",
    school: "script",
    rarity: "epic",
    desc: "主动技伤害 ×2，释放后 3 秒「阻塞」：无法攻击与闪避；释放耗 4 内存。",
    risk: "high",
    memoryCost: 4,
    effect: { activeDamageMult: 2, blockActiveMs: 3000 },
  },

  /* ---------------- 样式系（护盾 / 残影 / 视野） ---------------- */
  {
    id: "flex-layout",
    code: "C1",
    name: "Flex 布局",
    school: "style",
    rarity: "common",
    desc: "每层开始 +5 护盾；护盾存在时攻击目标锁定不流失（简化：护盾存在时攻击不丢锁定）。",
    risk: "low",
    effect: { startShield: 5 },
  },
  {
    id: "z-index",
    code: "C2",
    name: "z-index",
    school: "style",
    rarity: "common",
    desc: "闪避后留残影，2 秒内敌人攻击 60% 概率改打残影（miss）；残影耗 1 内存。",
    risk: "mid",
    memoryCost: 1,
    effect: { decoyAfterDodge: 1 },
  },
  {
    id: "media-query",
    code: "C3",
    name: "媒体查询",
    school: "style",
    rarity: "common",
    desc: "血量首次跌破 30% 时自动「响应式重构」：清负面 + 回 20 血，每层 1 次；耗 3 内存（不足则不触发）。",
    risk: "low",
    memoryCost: 3,
    effect: { responsiveRefactor: 1 },
  },
  {
    id: "transition",
    code: "C4",
    name: "过渡动画",
    school: "style",
    rarity: "rare",
    desc: "闪避后 2 秒内，我的攻击使被击敌人攻速减半。",
    risk: "low",
    effect: { enemySlowMs: 2000 },
  },
  {
    id: "pseudo-element",
    code: "C5",
    name: "伪元素",
    school: "style",
    rarity: "rare",
    desc: "护盾破碎时分裂 3 个小护盾单位，自动追踪最近敌人爆炸（每个 8 伤害）；分裂耗 2 内存，小护盾死亡回 2 内存。",
    risk: "mid",
    memoryCost: 2,
    effect: { shieldSplit: 3, minionDeathMemory: 2 },
  },
  {
    id: "stacking-context",
    code: "C6",
    name: "层叠上下文",
    school: "style",
    rarity: "rare",
    desc: "护盾上限 +50%，护盾存在时攻击 +20%。",
    risk: "low",
    effect: { shieldMaxMult: 1.5, shieldAttackBonus: 0.2 },
  },
  {
    id: "dark-theme",
    code: "C7",
    name: "暗黑模式",
    school: "style",
    rarity: "epic",
    desc: "全体敌人血量减半；非当前锁定目标显示为低透明度轮廓（视野受限 —— 这是它的风险）。",
    risk: "high",
    effect: { darkTheme: 1 },
  },

  /* ---------------- 网络系（暴击 / 穿透 / 内存经济） ---------------- */
  {
    id: "request-interceptor",
    code: "N1",
    name: "请求拦截",
    school: "network",
    rarity: "common",
    desc: "暴击时偷 1 内存。",
    risk: "low",
    memoryCost: -1,
    effect: { stealMemoryOnCrit: 1 },
  },
  {
    id: "cache-hit",
    code: "N2",
    name: "缓存命中",
    school: "network",
    rarity: "common",
    desc: "同一目标连续第 4 次攻击必定暴击且回 2 内存；切目标重计。",
    risk: "low",
    memoryCost: -2,
    effect: { fourthHitCrit: 1, memoryGainFourthHit: 2 },
  },
  {
    id: "redirect",
    code: "N3",
    name: "重定向",
    school: "network",
    rarity: "common",
    desc: "击杀溢出伤害转移到下一个敌人（最多一跳）。",
    risk: "low",
    effect: { overflowTransfer: 1 },
  },
  {
    id: "cdn-boost",
    code: "N4",
    name: "CDN 加速",
    school: "network",
    rarity: "rare",
    desc: "攻击穿透，穿透位敌人受 30% 伤害；每次穿透耗 1 内存（穿透流点亮后免费、伤害升到 50%）。",
    risk: "mid",
    memoryCost: 1,
    effect: { pierceRatio: 0.3, pierceMemoryCost: 1 },
  },
  {
    id: "resume-transfer",
    code: "N5",
    name: "断点续传",
    school: "network",
    rarity: "rare",
    desc: "死亡时 30% 概率复活回 30% 血（每局 1 次）；复活耗 5 内存，不足必失败（保命流把概率提到 60%）。",
    risk: "high",
    memoryCost: 5,
    effect: { reviveChance: 0.3, reviveHpRatio: 0.3, reviveMemoryCost: 5 },
  },
  {
    id: "timeout-retry",
    code: "N6",
    name: "超时重试",
    school: "network",
    rarity: "rare",
    desc: "每层可手动重试一次三选一（金色刷新按钮），重试后必出稀有以上；耗 3 内存。",
    risk: "mid",
    memoryCost: 3,
    /* 批次 C 接线：重试走独立的金色「超时重试」按钮（耗 3 内存、每层 1 次、
       必出稀有以上），不再占用普通免费刷新次数——batch A 挂的 rerollPerFloor
       占位通道已删，避免与免费刷新次数混账（relic-redesign.md B·N6） */
    effect: { rerollForceRare: 1 },
  },
  {
    id: "rate-limit",
    code: "N7",
    name: "限流",
    school: "network",
    rarity: "epic",
    desc: "敌人攻击间隔 +30%；内存上限 -3。",
    risk: "low",
    effect: { enemyIntervalMult: 1.3, memoryMaxDelta: -3 },
  },

  /* ---------------- 缓存系（内存 / 存储 / 免死） ---------------- */
  {
    id: "local-storage",
    code: "M1",
    name: "本地存储",
    school: "cache",
    rarity: "common",
    desc: "每层结束把 10 血存入存储池，下一层开始时生效（层间不再直接回复；跨局不保留）。",
    risk: "low",
    effect: { storageHealPool: 10 },
  },
  {
    id: "session",
    code: "M2",
    name: "Session",
    school: "cache",
    rarity: "common",
    desc: "碎片获取 +30%（v2 起进层回满已取代「囤积」玩法，旧的层末清零代价随之移除）。",
    risk: "low",
    effect: { fragmentMult: 0.3 },
  },
  {
    id: "cookie",
    code: "M3",
    name: "Cookie",
    school: "cache",
    rarity: "common",
    desc: "开局多 1 次三选一；占用 1 个内存位（内存上限 -1）。",
    risk: "low",
    effect: { bonusPickRounds: 1, memoryMaxDelta: -1 },
  },
  {
    id: "memory-leak",
    code: "M4",
    name: "内存泄漏",
    school: "cache",
    rarity: "rare",
    desc: "每层攻击 +5%（可叠加）；内存上限每层 -1。",
    risk: "high",
    effect: { attackPerFloorMult: 0.05, memoryMaxPerFloorDelta: -1 },
  },
  {
    id: "garbage-collect",
    code: "M5",
    name: "垃圾回收",
    school: "cache",
    rarity: "rare",
    desc: "纯被动产内存：击杀敌人回 1 内存，小护盾死亡回 2。",
    risk: "low",
    memoryCost: -1,
    effect: { killMemoryGain: 1, minionDeathMemory: 2 },
  },
  {
    id: "service-worker",
    code: "M6",
    name: "Service Worker",
    school: "cache",
    rarity: "rare",
    desc: "每 3 层得 1 次免死，免死时清空场上普通小怪；触发耗 4 内存。",
    risk: "low",
    memoryCost: 4,
    effect: { deathWardPerFloors: 1, deathWardClearMinions: 1 },
  },
  {
    id: "offline-mode",
    code: "M7",
    name: "离线模式",
    school: "cache",
    rarity: "epic",
    desc: "手动触发 3 秒无敌，期间无法攻击；冷却 10 秒；耗 3 内存。",
    risk: "mid",
    memoryCost: 3,
    effect: { offlineWindowMs: 3000, offlineCooldownMs: 10000 },
  },

  /* ---------------- 通用 ---------------- */
  {
    id: "cors",
    code: "G1",
    name: "跨域",
    school: "general",
    rarity: "rare",
    desc: "combo 判定里视为任意一系（可顶替每条流派中的 1 个位置）；占用 2 个内存位（内存上限 -2）。",
    risk: "mid",
    effect: { crossSchool: 1, memoryMaxDelta: -2 },
  },
  {
    id: "hot-reload",
    code: "G2",
    name: "热更新",
    school: "general",
    rarity: "epic",
    desc: "三选一多 1 个选项；每局可手动刷新 1 次不耗次数；刷新耗 2 内存。",
    risk: "low",
    memoryCost: 2,
    effect: { extraChoiceCount: 1, freeRerollOnce: 1 },
  },
]

export const RELIC_POOL_SIZE = RELIC_POOL.length

export function findRelic(id: string): Relic | null {
  return RELIC_POOL.find((relic) => relic.id === id) ?? null
}

export function getRelicsBySchool(school: RelicSchoolKey): Relic[] {
  return RELIC_POOL.filter((relic) => relic.school === school)
}

export function getRelicsByRarity(rarity: RelicRarity): Relic[] {
  return RELIC_POOL.filter((relic) => relic.rarity === rarity)
}

export function getRelicsByCode(code: string): Relic | null {
  return RELIC_POOL.find((relic) => relic.code === code) ?? null
}

/* ---- 构筑码分享（build-code.md 一）：B-<角色字母><词条短码…>，例 B-C-S1K4P9 ---- */
/** 导入端开局带几条词条（导出可含全套 6 条，接收方只带前 3 抢跑） */
export const BUILD_IMPORT_MAX = 3

/** 把一局的角色 + 词条编成可分享的短码；没有词条返回 null（空构筑不值得分享） */
export function encodeBuildCode(
  characterId: CharacterId,
  relicIds: string[],
): string | null {
  const charIndex = DUNGEON_CHARACTERS.findIndex(
    (item) => item.id === characterId,
  )
  const codes = relicIds
    .map((id) => findRelic(id)?.code)
    .filter((code): code is string => Boolean(code))
    .join("")
  if (charIndex < 0 || !codes) return null
  return `B-${String.fromCharCode(65 + charIndex)}-${codes}`
}

/** 解析构筑码：任何一环不认识整码作废；relicIds 已截到开局额度 */
export function parseBuildCode(
  input: string,
): { characterId: CharacterId; relicIds: string[] } | null {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "")
  const match = /^B-([A-G])-([A-Z0-9]{2,12})$/.exec(cleaned)
  if (!match) return null
  const charIndex = match[1].charCodeAt(0) - 65
  const character = DUNGEON_CHARACTERS[charIndex]
  if (!character) return null
  const relicIds: string[] = []
  for (let i = 0; i + 1 < match[2].length + 1; i += 2) {
    const relic = getRelicsByCode(match[2].slice(i, i + 2))
    if (!relic) return null
    relicIds.push(relic.id)
  }
  if (relicIds.length === 0) return null
  return { characterId: character.id, relicIds: relicIds.slice(0, BUILD_IMPORT_MAX) }
}

/** 图鉴用：按系分组，通用放最后 */
export function getRelicPoolBySchool(): {
  school: RelicSchoolKey
  label: string
  relics: Relic[]
}[] {
  const order: RelicSchoolKey[] = [...RELIC_SCHOOLS, "general"]
  return order.map((school) => ({
    school,
    label: RELIC_SCHOOL_LABEL[school],
    relics: getRelicsBySchool(school),
  }))
}

/* ------------------------------------------------------------------ *
 * 流派 combo：8 条（替换旧的 13 条羁绊）。集齐集合内全部词条即点亮；
 * 「跨域」(cors) 在场时每条 combo 视为少 1 件（G1 跨域顶替）。
 * ------------------------------------------------------------------ */

export type BondDef = {
  id: string
  name: string
  /** 集齐这些词条 id 即点亮（跨域可顶替其中 1 个） */
  relicIds: string[]
  desc: string
}

/**
 * comboEffects —— 8 条流派的战斗效果钩子清单。
 * 批次 A 只留空钩子（本注释列表即契约），批次 B/C 在 useDungeon 的
 * buildMods / 战斗引擎里按流派逐条激活：
 * - bounce（弹射流）：弹射 3 跳且弹射不耗内存
 * - shield（护盾流）：分裂小护盾伤害 ×2（分裂本体由 C5 提供）
 * - memory（内存流）：击杀额外 +1 内存（killMemoryGain 通道，v2 起替代已废除的回复减半）
 * - execute（斩杀流）：Promise 链链式暴击内存耗 3 → 1
 * - guard（保命流）：断点续传复活概率 30% → 60%
 * - economy（经济流）：碎片获取额外 +50%（fragmentMult，v2 起取代抵消清零）
 * - dark（暗黑流）：暴击对血量 <15% 的敌人直接斩杀
 * - pierce（穿透流）：穿透不耗内存，穿透位伤害 30% → 50%
 */
export const BOND_DEFS: BondDef[] = [
  {
    id: "combo-bounce",
    name: "弹射流",
    relicIds: ["event-listener", "callback-hell", "cdn-boost"],
    desc: "事件监听 + 回调地狱 + CDN 加速：弹射 3 跳，且弹射不耗内存。",
  },
  {
    id: "combo-shield",
    name: "护盾流",
    relicIds: [
      "flex-layout",
      "pseudo-element",
      "garbage-collect",
      "stacking-context",
    ],
    desc: "Flex 布局 + 伪元素 + 垃圾回收 + 层叠上下文：小护盾伤害 ×2，破碎分裂回血回内存。",
  },
  {
    id: "combo-memory",
    name: "内存流",
    relicIds: [
      "request-interceptor",
      "garbage-collect",
      "memory-leak",
      "service-worker",
    ],
    desc: "请求拦截 + 垃圾回收 + 内存泄漏 + Service Worker：每次击杀额外 +1 内存（与垃圾回收叠加）。",
  },
  {
    id: "combo-execute",
    name: "斩杀流",
    relicIds: ["redirect", "promise-chain", "cache-hit"],
    desc: "重定向 + Promise 链 + 缓存命中：链式暴击的内存耗降为 1。",
  },
  {
    id: "combo-guard",
    name: "保命流",
    relicIds: [
      "resume-transfer",
      "service-worker",
      "offline-mode",
      "throttle",
    ],
    desc: "断点续传 + Service Worker + 离线模式 + 节流：复活概率 30% → 60%。",
  },
  {
    id: "combo-economy",
    name: "经济流",
    relicIds: ["session", "cookie", "hot-reload", "timeout-retry"],
    desc: "Session + Cookie + 热更新 + 超时重试：碎片获取额外 +50%（v2 起取代旧的「抵消清零」效果）。",
  },
  {
    id: "combo-dark",
    name: "暗黑流",
    relicIds: ["dark-theme", "request-interceptor", "redirect"],
    desc: "暗黑模式 + 请求拦截 + 重定向：暴击对血量低于 15% 的敌人直接斩杀。",
  },
  {
    id: "combo-pierce",
    name: "穿透流",
    relicIds: ["cdn-boost", "event-listener", "cache-hit"],
    desc: "CDN 加速 + 事件监听 + 缓存命中：穿透不耗内存，穿透位伤害 30% → 50%。",
  },
]

export function findBond(id: string): BondDef | null {
  return BOND_DEFS.find((bond) => bond.id === id) ?? null
}

/** 「跨域」词条 id：combo 判定里的万能顶替位 */
export const CROSS_SCHOOL_RELIC_ID = "cors"

/**
 * 按系统计词条数量（纯展示用：顶栏 / 结算页的系别计数）。
 * v4 起「跨域」不再顶系计数 —— combo 判定走 getActiveBondDefs。
 */
export function getRelicSchoolCounts(
  relics: Relic[],
): Record<RelicSchool, number> {
  const counts: Record<RelicSchool, number> = {
    script: 0,
    style: 0,
    network: 0,
    cache: 0,
  }
  relics.forEach((relic) => {
    if (relic.school === "general") return
    counts[relic.school] += 1
  })
  return counts
}

/** 本局点亮的流派 combo（跨域在场时每条视为少 1 件要求） */
export function getActiveBondDefs(relics: Relic[]): BondDef[] {
  const owned = new Set(relics.map((relic) => relic.id))
  const wildcard = owned.has(CROSS_SCHOOL_RELIC_ID)
  return BOND_DEFS.filter((bond) => {
    const missing = bond.relicIds.filter((id) => !owned.has(id)).length
    return wildcard ? missing <= 1 : missing === 0
  })
}

export type ComboProgress = {
  combo: BondDef
  /** 集合内已持有的件数（不含用跨域顶替的那一位） */
  have: number
  need: number
  /** 还差几件（已按跨域顶替折算；0 = 已点亮） */
  remain: number
  /** 还缺哪些词条 */
  missing: Relic[]
}

/**
 * 某张候选词条能推进哪条流派：返回它参与的 combo 里最接近点亮的一条
 * （三选一卡片写「【弹射流】还差 1 件」）。不参与任何 combo 时返回 null。
 */
export function getRelicComboProgress(
  relics: Relic[],
  relic: Relic,
): ComboProgress | null {
  const ownedIds = new Set(relics.map((item) => item.id))
  const wildcard = ownedIds.has(CROSS_SCHOOL_RELIC_ID)
  let best: ComboProgress | null = null
  BOND_DEFS.forEach((combo) => {
    if (!combo.relicIds.includes(relic.id)) return
    const missing = combo.relicIds
      .filter((id) => !ownedIds.has(id) && id !== relic.id)
      .map((id) => RELIC_POOL.find((item) => item.id === id))
      .filter((item): item is Relic => item !== null)
    const remain = wildcard ? Math.max(0, missing.length - 1) : missing.length
    const progress: ComboProgress = {
      combo,
      have: combo.relicIds.length - missing.length,
      need: combo.relicIds.length,
      remain,
      missing,
    }
    if (best === null || progress.remain < best.remain) best = progress
  })
  return best
}

/**
 * 把存档里的战绩还原成词条对象。
 * 新存档同时存了 id 与名字；旧存档只有名字，甚至有些名字已经不在词条池里，
 * 这时按缓存系补一个占位词条，保证结算页总能摆满这一行。
 */
export function resolveRunRelics(
  record: Pick<DungeonRunRecord, "relics" | "relicIds"> | null | undefined,
): Relic[] {
  if (!record) return []
  const ids = Array.isArray(record.relicIds) ? record.relicIds : []
  const names = Array.isArray(record.relics) ? record.relics : []
  const total = Math.max(ids.length, names.length)
  const list: Relic[] = []

  for (let index = 0; index < total; index += 1) {
    const id = ids[index]
    const name = names[index]
    const matched =
      (id ? RELIC_POOL.find((item) => item.id === id) : undefined) ??
      (name ? RELIC_POOL.find((item) => item.name === name) : undefined)
    if (matched) {
      list.push(matched)
      continue
    }
    if (name) {
      list.push({
        id: id ?? `legacy-relic-${index}`,
        code: "—",
        name,
        school: "cache",
        rarity: "common",
        desc: "上一版留下的词条。",
        effect: {},
        risk: "low",
      })
    }
  }

  return list.slice(0, MAX_RELIC_SLOTS)
}

/* ------------------------------------------------------------------ *
 * 敌人
 * ------------------------------------------------------------------ */

export type EnemyKind = "normal" | "boss" | "bigboss"

export type EnemyDef = {
  id: string
  displayName: string
  kind: EnemyKind
  hp: number
  attack: number
  attackIntervalMs: number
  /** 防御：被攻击时按点数减伤，可被「穿透」无视一部分 */
  defense: number
  trait: string
  /** 击杀固定掉落碎片（Boss 20 / 40）；普通与精英敌人按层数档与精英规则随机 */
  killShards?: number
}

/**
 * 两个 Boss 的血量与攻击。定义在 ENEMY_DEFS 之前，
 * 让敌人图鉴、层配置、战斗引擎共用同一份，不再各写一遍。
 */
export const BOSS_AD_BODY_HP = 110
export const BOSS_AD_ATTACK = 6
export const BOSS_CRASH_MAX_HP = 310
export const BOSS_CRASH_ATTACK = 6

/* ------------------------------------------------------------------ *
 * 货币系统（见 .rh/economy-spec.md）
 * 碎片💰 日常 / 核心🔷 里程碑 / 种子🌱 稀缺，三者互不兑换。
 * ------------------------------------------------------------------ */

/** 局内击杀掉落：普通 2 起步、每 3 层 +1、再随机 0~1 */
export const SHARD_PER_KILL_BASE = 2
export const SHARD_KILL_STEP_FLOOR = 3
export const SHARD_PER_BOSS_AD = 20
export const SHARD_PER_BOSS_CRASH = 40
/** 精英敌人掉落 8~12 */
export const SHARD_PER_ELITE = 8
export const SHARD_ELITE_RANDOM = 5
/** 精英数值倍率 */
export const ELITE_HP_MULT = 1.8
export const ELITE_ATTACK_MULT = 1.25

/** 本层普通敌人掉多少碎片（2~3 起步，随层数缓涨） */
export function rollFloorKillShards(floor: number): number {
  const tier = Math.floor(Math.max(1, floor) / SHARD_KILL_STEP_FLOOR)
  return SHARD_PER_KILL_BASE + tier + (Math.random() < 0.5 ? 1 : 0)
}

/** 精英敌人掉多少碎片（8~12） */
export function rollEliteShards(): number {
  return SHARD_PER_ELITE + Math.floor(Math.random() * SHARD_ELITE_RANDOM)
}

/** 通关奖励：按「当日第几次通关」递减 60 / 30 / 15 / 5 */
export const CLEAR_BONUS_BY_DAILY_CLEARS = [60, 30, 15]
export const CLEAR_BONUS_MIN = 5
export function clearBonusForDailyClears(count: number): number {
  return CLEAR_BONUS_BY_DAILY_CLEARS[count - 1] ?? CLEAR_BONUS_MIN
}

/** 每日首胜（当天第一次通关）额外碎片 */
export const FIRST_WIN_BONUS = 100
/** 当天打过一局每日挑战的参与奖（名次奖励另走奖励信箱） */
export const DAILY_CHALLENGE_REWARD = 50

/** 首次击杀各层 Boss 的一次性核心奖励（coreMilestones 去重） */
export const BOSS_FIRST_CORE: Record<string, number> = {
  "boss-fullscreen": 1,
  "boss-crash": 2,
}

/** 局内付费：三选一付费刷新（每层限 1 次）/ 跳过回复升级 / 碎片复活（每局限 1 次） */
export const PAID_REROLL_COST = 15
export const SKIP_HEAL_UPGRADE_COST = 10
export const SKIP_HEAL_UPGRADE_AMOUNT = 25
export const PAID_REVIVE_COST = 30
export const PAID_REVIVE_HP_RATIO = 0.4

/** 图鉴补全：未见词条花碎片看详情（epic 词条只收核心） */
export const CODEX_FIX_COST_FRAGMENTS = 50
export const CODEX_FIX_EPIC_CORES = 2

/** 速通成就时限：3 分钟内通关 */
export const SPEEDRUN_LIMIT_MS = 3 * 60 * 1000

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  popup: {
    id: "popup",
    displayName: "弹窗",
    kind: "normal",
    hp: 60,
    attack: 2,
    attackIntervalMs: 2000,
    defense: 0,
    trait: "关不掉的弹窗",
  },
  ad: {
    id: "ad",
    displayName: "广告",
    kind: "normal",
    hp: 50,
    attack: 4,
    attackIntervalMs: 2000,
    defense: 1,
    trait: "自动播放，还带声",
  },
  notfound: {
    id: "notfound",
    displayName: "404",
    kind: "normal",
    hp: 50,
    attack: 5,
    attackIntervalMs: 1800,
    defense: 1,
    trait: "找不到页面",
  },
  captcha: {
    id: "captcha",
    displayName: "验证码",
    kind: "normal",
    hp: 60,
    attack: 6,
    attackIntervalMs: 1800,
    defense: 2,
    trait: "请证明你是人",
  },
  leak: {
    id: "leak",
    displayName: "内存泄漏",
    kind: "normal",
    hp: 130,
    attack: 14,
    attackIntervalMs: 1600,
    defense: 2,
    trait: "越打越大",
  },
  loading: {
    id: "loading",
    displayName: "加载条",
    kind: "normal",
    hp: 40,
    attack: 5,
    attackIntervalMs: 2000,
    defense: 1,
    trait: "卡在 99% 不动",
  },
  "boss-fullscreen": {
    id: "boss-fullscreen",
    displayName: "全屏广告",
    kind: "boss",
    hp: BOSS_AD_BODY_HP,
    attack: BOSS_AD_ATTACK,
    attackIntervalMs: 2000,
    defense: 2,
    trait: "小 Boss · 铺满整屏",
    killShards: SHARD_PER_BOSS_AD,
  },
  "boss-crash": {
    id: "boss-crash",
    displayName: "崩溃页面",
    kind: "bigboss",
    hp: BOSS_CRASH_MAX_HP,
    attack: BOSS_CRASH_ATTACK,
    attackIntervalMs: 2000,
    defense: 4,
    trait: "大 Boss · 弹窗 / 重定向 / 蓝屏",
    killShards: SHARD_PER_BOSS_CRASH,
  },
}

/* ---------------- 第 4 层小 Boss：全屏广告 ---------------- */
export const BOSS_AD_BUTTONS = 4
export const BOSS_AD_BUTTON_HP = 30
export const BOSS_AD_LIMIT_MS = 20000
export const BOSS_AD_PENALTY = 20
export const BOSS_AD_BUTTON_LABELS = [
  "关闭 ×",
  "跳过广告 ×",
  "我知道了 ×",
  "不再显示 ×",
]

/* ---------------- 第 8 层大 Boss：崩溃页面 ---------------- */
export const BOSS_CRASH_PHASE2_AT = 223
export const BOSS_CRASH_PHASE3_AT = 100
export const BOSS_CRASH_LIMIT_MS = 30000
/** 阶段 1 无限弹窗：每次攻击额外掉玩家 5 血 */
export const BOSS_CRASH_POPUP_DAMAGE = 5
/** 阶段 2 无限重定向：玩家攻速减半 */
export const BOSS_CRASH_SPEED_CUT = 0.5
/** 阶段 3 蓝屏：敌人攻击翻倍，但玩家闪避 +20% */
export const BOSS_CRASH_ATTACK_MULT = 2
export const BOSS_CRASH_DODGE_BONUS = 0.2
export const BOSS_CRASH_PHASE_LABEL = [
  "阶段 1 · 无限弹窗",
  "阶段 2 · 无限重定向",
  "阶段 3 · 蓝屏",
]

/* ---------------- 通用战斗规则：前摇与层限时 ---------------- */
/** 没单独配前摇时的兜底值 */
export const TELEGRAPH_DEFAULT_MS = 700
/** 普通层限时 20 秒（第 4 层 20 秒、第 8 层 30 秒） */
export const FLOOR_TIME_LIMIT_MS = 20000
/** 超时后本层全体敌人攻击 +50%，不直接判负 */
export const OVERTIME_ATTACK_MULT = 1.5

/* ---------------- 第 2 层：两个弹窗交替出手 ---------------- */
export const FLOOR2_STAGGER_MS = 900

/* ---------------- 第 3 层：带盾广告 ---------------- */
export const AD_SHIELD_REGEN_MS = 3000
export const AD_SHIELD_REGEN_AMOUNT = 5
/** 补盾时停手 0.5 秒 */
export const AD_SHIELD_PAUSE_MS = 500
/** 左侧死亡后右侧攻速 +20% */
export const AD_SURVIVOR_HASTE = 1.2

/* ---------------- 第 5 层：随机隐身 ---------------- */
export const HIDDEN_DURATION_MS = 2000
export const HIDDEN_INTERVAL_MS = 4000
/** 隐身结束后该敌人下一次攻击 +50% */
export const HIDDEN_BONUS_MULT = 1.5

/* ---------------- 第 6 层：验证码图案 ---------------- */
export const CAPTCHA_SYMBOLS = ["◯", "△", "▢", "✕", "✦", "▣"]
/** 中央浮出的图案个数 */
export const CAPTCHA_OPTION_COUNT = 3
/** 每 4 秒出一次图案题 */
export const CAPTCHA_CHALLENGE_INTERVAL_MS = 4000
/** 玩家要在 1.5 秒内点中高亮图案 */
export const CAPTCHA_CHALLENGE_WINDOW_MS = 1500
/** 点对：全体敌人破防 3 秒 */
export const CAPTCHA_BREAK_MS = 3000
/** 破防期间受伤 +50% */
export const CAPTCHA_BREAK_DAMAGE_MULT = 1.5
/** 点错或超时：全体敌人下一次攻击 +100% */
export const CAPTCHA_FAIL_ATTACK_MULT = 2

/* ---------------- 第 7 层：内存泄漏回血 ---------------- */
export const LEAK_REGEN_MS = 5000
export const LEAK_REGEN_AMOUNT = 5
export const LEAK_SHIELD = 15
/** 每 5 秒刷新 10 护盾 */
export const LEAK_SHIELD_REFRESH_MS = 5000
export const LEAK_SHIELD_REFRESH_AMOUNT = 10
/** 刷新护盾时停手 0.5 秒 */
export const LEAK_PAUSE_MS = 500
/** 血量低于三成时回血频率翻倍 */
export const LEAK_LOW_HP_RATIO = 0.3
export const LEAK_LOW_HP_REGEN_MULT = 2

export type FloorEnemySpec = {
  defId: string
  hp: number
  attack: number
  shield?: number
  /** 第 6 层：需要点对图案才破防 */
  guard?: boolean
  /** 第 7 层：按 LEAK_REGEN_MS / LEAK_REGEN_AMOUNT 周期回血 */
  regen?: boolean
  /** 精英敌人：血量 / 攻击吃精英倍率，金色徽标，掉 8~12 碎片 */
  elite?: boolean
  /** 种子生成的标签（EnemyTagId 的字符串形态，展示 + 少数机制映射） */
  tags?: string[]
  /** 双面回廊（core-experience-pack.md 一）：成对广告的正面 / 背面标记 */
  twin?: "front" | "back"
}

export type FloorBossKind = "none" | "ad" | "crash"

export type FloorConfig = {
  floor: number
  label: string
  shortLabel: string
  note: string
  isBoss: boolean
  bossKind: FloorBossKind
  enemies: FloorEnemySpec[]
  /** 0 = 不限时 */
  timeLimitMs: number
  /** 超时扣玩家多少血（0 = 不扣） */
  timeoutPenalty: number
  /** 超时直接判失败（第 8 层） */
  timeoutFails: boolean
  /** 超时后本层全体敌人攻击倍率（普通层 +50%；Boss 层不吃这条） */
  timeoutAttackMult: number
  /** 敌人出手前的前摇（毫秒）：屏幕上出现红圈警告，留反应时间 */
  telegraphMs: number
  /** 多个敌人依次出手的间隔（毫秒，第 2 层两个弹窗交替用） */
  staggerMs: number
  /** > 0 = 每隔这么久随机让一个敌人隐身 2 秒（第 5 层） */
  hiddenEveryMs: number
}

export const DUNGEON_RUN_FLOORS: FloorConfig[] = [
  {
    floor: 1,
    label: "第 1 层 · 标签层",
    shortLabel: "标签",
    note: "一个弹窗赖在标签条上，先点掉它。限时 20 秒。",
    isBoss: false,
    bossKind: "none",
    enemies: [{ defId: "popup", hp: 60, attack: 4 }],
    timeLimitMs: FLOOR_TIME_LIMIT_MS,
    timeoutPenalty: 0,
    timeoutFails: false,
    timeoutAttackMult: OVERTIME_ATTACK_MULT,
    telegraphMs: 800,
    staggerMs: 0,
    hiddenEveryMs: 0,
  },
  {
    floor: 2,
    label: "第 2 层 · 弹窗层",
    shortLabel: "弹窗",
    note: "两个弹窗交替出手，左边先动、右边 0.9 秒后跟上。",
    isBoss: false,
    bossKind: "none",
    enemies: [
      { defId: "popup", hp: 60, attack: 3 },
      { defId: "popup", hp: 50, attack: 3 },
    ],
    timeLimitMs: FLOOR_TIME_LIMIT_MS,
    timeoutPenalty: 0,
    timeoutFails: false,
    timeoutAttackMult: OVERTIME_ATTACK_MULT,
    telegraphMs: 600,
    staggerMs: FLOOR2_STAGGER_MS,
    hiddenEveryMs: 0,
  },
  {
    floor: 3,
    label: "第 3 层 · 广告层",
    shortLabel: "广告",
    note: `带盾广告每 ${AD_SHIELD_REGEN_MS / 1000} 秒补 ${AD_SHIELD_REGEN_AMOUNT} 点护盾；左边倒下后右边攻速 +20%。`,
    isBoss: false,
    bossKind: "none",
    enemies: [
      { defId: "ad", hp: 50, attack: 4, shield: 5 },
      { defId: "ad", hp: 45, attack: 4 },
    ],
    timeLimitMs: FLOOR_TIME_LIMIT_MS,
    timeoutPenalty: 0,
    timeoutFails: false,
    timeoutAttackMult: OVERTIME_ATTACK_MULT,
    telegraphMs: 600,
    staggerMs: 0,
    hiddenEveryMs: 0,
  },
  {
    floor: 4,
    label: "第 4 层 · 小 Boss",
    shortLabel: "小 Boss",
    note: "四个关闭按钮全点掉，本体才会露出来。限时 20 秒。",
    isBoss: true,
    bossKind: "ad",
    enemies: [{ defId: "boss-fullscreen", hp: BOSS_AD_BODY_HP, attack: BOSS_AD_ATTACK }],
    timeLimitMs: BOSS_AD_LIMIT_MS,
    timeoutPenalty: BOSS_AD_PENALTY,
    timeoutFails: false,
    timeoutAttackMult: 1,
    telegraphMs: 0,
    staggerMs: 0,
    hiddenEveryMs: 0,
  },
  {
    floor: 5,
    label: "第 5 层 · 断链层",
    shortLabel: "404",
    note: "每 4 秒随机一个隐身 2 秒；它隐身结束时下一击 +50%。",
    isBoss: false,
    bossKind: "none",
    enemies: [
      { defId: "notfound", hp: 40, attack: 6, elite: true },
      { defId: "notfound", hp: 45, attack: 6 },
      { defId: "loading", hp: 40, attack: 6 },
    ],
    timeLimitMs: FLOOR_TIME_LIMIT_MS,
    timeoutPenalty: 0,
    timeoutFails: false,
    timeoutAttackMult: OVERTIME_ATTACK_MULT,
    telegraphMs: 700,
    staggerMs: 0,
    hiddenEveryMs: HIDDEN_INTERVAL_MS,
  },
  {
    floor: 6,
    label: "第 6 层 · 验证层",
    shortLabel: "验证码",
    note: "每 4 秒浮出 3 个图案，1.5 秒内点中高亮的那个才破防。",
    isBoss: false,
    bossKind: "none",
    enemies: [
      { defId: "captcha", hp: 60, attack: 5, guard: true },
      { defId: "captcha", hp: 55, attack: 5, guard: true },
      { defId: "captcha", hp: 50, attack: 5, guard: true },
    ],
    timeLimitMs: FLOOR_TIME_LIMIT_MS,
    timeoutPenalty: 0,
    timeoutFails: false,
    timeoutAttackMult: OVERTIME_ATTACK_MULT,
    telegraphMs: 800,
    staggerMs: 0,
    hiddenEveryMs: 0,
  },
  {
    floor: 7,
    label: "第 7 层 · 泄漏层",
    shortLabel: "泄漏",
    note: `每 ${LEAK_SHIELD_REFRESH_MS / 1000} 秒刷 ${LEAK_SHIELD_REFRESH_AMOUNT} 护盾、每 ${LEAK_REGEN_MS / 1000} 秒回 ${LEAK_REGEN_AMOUNT} 血；残血时回血翻倍。`,
    isBoss: false,
    bossKind: "none",
    enemies: [
      { defId: "leak", hp: 80, attack: 11, shield: LEAK_SHIELD, regen: true, elite: true },
    ],
    timeLimitMs: FLOOR_TIME_LIMIT_MS,
    timeoutPenalty: 0,
    timeoutFails: false,
    timeoutAttackMult: OVERTIME_ATTACK_MULT,
    telegraphMs: 1000,
    staggerMs: 0,
    hiddenEveryMs: 0,
  },
  {
    floor: 8,
    label: "第 8 层 · 大 Boss",
    shortLabel: "崩溃",
    note: "弹窗、重定向、蓝屏三个阶段，限时 30 秒，超时直接判负。",
    isBoss: true,
    bossKind: "crash",
    enemies: [{ defId: "boss-crash", hp: BOSS_CRASH_MAX_HP, attack: BOSS_CRASH_ATTACK }],
    timeLimitMs: BOSS_CRASH_LIMIT_MS,
    timeoutPenalty: 0,
    timeoutFails: true,
    timeoutAttackMult: 1,
    telegraphMs: 0,
    staggerMs: 0,
    hiddenEveryMs: 0,
  },
]

/* ---------------- Boss 阶段技能表 ---------------- */

export type BossSpawnSpec = {
  defId: string
  hp: number
  attack: number
  count: number
  label: string
}

export type BossSkill = {
  id: string
  name: string
  /** 冷却（毫秒） */
  cdMs: number
  /** 前摇（毫秒）：先出警告再落地 */
  telegraphMs: number
  desc: string
  /** 玩家应对 */
  counter: string
  /** 未闪避 / 未点掉时扣玩家多少血 */
  damage?: number
  /** 伤害可被闪避规避 */
  dodgeable?: boolean
  /** 生成的小怪 */
  spawn?: BossSpawnSpec
  /** 生成的小怪没清掉时，Boss 回血 */
  regenIfAlive?: number
  /** 玩家攻速减半时长 */
  speedCutMs?: number
  /** 清空玩家护盾 */
  clearShield?: boolean
  /** 强制切换锁定目标 */
  forceRetarget?: boolean
  /** 需要玩家在窗口内点掉的按钮文案（强制观看） */
  clickLabel?: string
  clickWindowMs?: number
  /** 击杀生成的小怪掉多少碎片 */
  killShards?: number
  /** 生成的小怪没清掉时，玩家攻击下降比例 */
  playerAttackCut?: number
}

/** 第 4 层小 Boss · 阶段 1 */
const BOSS_AD_PHASE1: BossSkill[] = [
  {
    id: "ad-bomb",
    name: "弹窗轰炸",
    cdMs: 3000,
    telegraphMs: 500,
    desc: "生成 2 个弹窗，每个 10 血",
    counter: "不关掉则本体回 5 血",
    spawn: { defId: "popup", hp: 10, attack: 3, count: 2, label: "轰炸弹窗" },
    regenIfAlive: 5,
  },
  {
    id: "ad-force-watch",
    name: "强制观看",
    cdMs: 5000,
    telegraphMs: 1000,
    desc: "屏幕变暗，出现跳过按钮",
    counter: "1.5 秒内点掉跳过",
    clickLabel: "跳过广告",
    clickWindowMs: 1500,
    damage: 6,
    dodgeable: true,
  },
]

/** 第 4 层小 Boss · 阶段 2 */
const BOSS_AD_PHASE2: BossSkill[] = [
  {
    id: "ad-flash",
    name: "全屏闪烁",
    cdMs: 4000,
    telegraphMs: 800,
    desc: "全屏红闪",
    counter: "点闪避",
    damage: 8,
    dodgeable: true,
  },
  {
    id: "ad-echo",
    name: "广告回响",
    cdMs: 6000,
    telegraphMs: 1200,
    desc: "召唤 1 个 20 血小广告",
    counter: "优先击杀",
    spawn: { defId: "ad", hp: 20, attack: 4, count: 1, label: "回响广告" },
  },
  {
    id: "ad-redirect",
    name: "强制跳转",
    cdMs: 8000,
    telegraphMs: 1500,
    desc: "玩家攻速减半 3 秒",
    counter: "开主动技爆发",
    speedCutMs: 3000,
  },
  /* 浏览器特性包 v1（browser-powers-pack.md 一）：分身窗口读条放大招 */
  {
    id: "ad-tabsync",
    name: "多标签同步",
    cdMs: 9000,
    telegraphMs: 800,
    desc: "在另一个窗口开分身读大招",
    counter: "点分身标签切过去，连点 3 下打断",
  },
]

export const BOSS_AD_SKILLS: Record<number, BossSkill[]> = {
  1: BOSS_AD_PHASE1,
  2: BOSS_AD_PHASE2,
}

/** 全程被动（不进冷却循环，只在面板上列出） */
export const BOSS_AD_PASSIVE = {
  name: "倒计时",
  cdLabel: "全程",
  desc: `${Math.round(BOSS_AD_LIMIT_MS / 1000)} 秒后全屏扣 ${BOSS_AD_PENALTY} 血`,
  counter: "尽快点完 4 个按钮",
}

/** 第 4 层通关奖励：必掉 1 个稀有词条 + 回复 20 生命 */
export const BOSS_AD_REWARD_HEAL = 20

/** 第 8 层大 Boss · 阶段 1 */
const BOSS_CRASH_PHASE1: BossSkill[] = [
  {
    id: "crash-rain",
    name: "弹窗雨",
    cdMs: 2000,
    telegraphMs: 500,
    desc: "生成 3 个弹窗，每个 5 血",
    counter: "不清则玩家攻击 -20%",
    spawn: { defId: "popup", hp: 5, attack: 3, count: 3, label: "弹窗雨" },
    playerAttackCut: 0.2,
  },
  {
    id: "crash-error",
    name: "错误弹窗",
    cdMs: 5000,
    telegraphMs: 1000,
    desc: "大弹窗，20 血",
    counter: "击杀后掉落 5 碎片",
    spawn: { defId: "popup", hp: 20, attack: 4, count: 1, label: "错误弹窗" },
    killShards: 5,
  },
  {
    id: "crash-warn",
    name: "崩溃预警",
    cdMs: 8000,
    telegraphMs: 1500,
    desc: "全屏红字",
    counter: "点闪避",
    damage: 15,
    dodgeable: true,
  },
]

/** 第 8 层大 Boss · 阶段 2 */
const BOSS_CRASH_PHASE2: BossSkill[] = [
  {
    id: "crash-retarget",
    name: "目标切换",
    cdMs: 3000,
    telegraphMs: 500,
    desc: "强制切换攻击目标",
    counter: "手动点选目标",
    forceRetarget: true,
  },
  {
    id: "crash-clear",
    name: "缓存清空",
    cdMs: 6000,
    telegraphMs: 1000,
    desc: "清除玩家护盾",
    counter: "重新开盾",
    clearShield: true,
  },
  {
    id: "crash-retry",
    name: "超时重试",
    cdMs: 10000,
    telegraphMs: 1500,
    desc: "小怪没清掉，Boss 回 20 血",
    counter: "优先清小怪",
    regenIfAlive: 20,
  },
]

/** 第 8 层大 Boss · 阶段 3 */
const BOSS_CRASH_PHASE3: BossSkill[] = [
  {
    id: "crash-pulse",
    name: "蓝屏脉冲",
    cdMs: 2000,
    telegraphMs: 600,
    desc: "全屏闪烁",
    counter: "点闪避",
    damage: 10,
    dodgeable: true,
  },
  {
    id: "crash-data",
    name: "数据崩溃",
    cdMs: 5000,
    telegraphMs: 1000,
    desc: "召唤 2 个错误图标，每个 10 血",
    counter: "不清则 Boss 回 10 血",
    spawn: { defId: "notfound", hp: 10, attack: 4, count: 2, label: "错误图标" },
    regenIfAlive: 10,
  },
  {
    id: "crash-final",
    name: "最终崩溃",
    cdMs: 8000,
    telegraphMs: 2000,
    desc: "全屏爆炸",
    counter: "开无敌或闪避",
    damage: 25,
    dodgeable: true,
  },
]

export const BOSS_CRASH_SKILLS: Record<number, BossSkill[]> = {
  1: BOSS_CRASH_PHASE1,
  2: BOSS_CRASH_PHASE2,
  3: BOSS_CRASH_PHASE3,
}

/** 全程被动（面板上列出，不进冷却循环） */
export const BOSS_CRASH_PASSIVE: Record<
  number,
  { name: string; cdLabel: string; desc: string; counter: string }
> = {
  2: {
    name: "无限重定向",
    cdLabel: "全程",
    desc: "玩家攻速减半",
    counter: "靠主动技和暴击",
  },
  3: {
    name: "背水一战",
    cdLabel: "全程",
    desc: `Boss 攻击 ×${BOSS_CRASH_ATTACK_MULT}，玩家闪避 +${Math.round(
      BOSS_CRASH_DODGE_BONUS * 100,
    )}%`,
    counter: "高风险高回报",
  },
}

/* ------------------------------------------------------------------ *
 * Boss 台词：只做气氛，不参与任何数值
 * ------------------------------------------------------------------ */

/** 触发时机：出场 / 进入某个阶段 / 释放某个技能 / 倒计时告急 / 被击败 */
export type BossLineTrigger = "enter" | "phase" | "skill" | "urgent" | "defeat"

export type BossLineEntry = {
  trigger: BossLineTrigger
  /** 进阶段台词：对应阶段号 */
  phase?: number
  /** 技能台词：对应技能 id */
  skillId?: string
  text: string
}

/** 广告 Boss 倒计时告急阈值：剩这么多时喊一句 */
export const BOSS_AD_URGENT_MS = 5000

/** 第 4 层小 Boss · 全屏广告 */
export const BOSS_AD_LINES: BossLineEntry[] = [
  { trigger: "enter", text: "先别走啊，看完这 20 秒。" },
  { trigger: "phase", phase: 2, text: "行吧，那就来真的。" },
  { trigger: "skill", skillId: "ad-bomb", text: "关一个，送你两个。" },
  { trigger: "skill", skillId: "ad-force-watch", text: "就 20 秒，真的就 20 秒。" },
  { trigger: "skill", skillId: "ad-redirect", text: "点错了吧？那边更好看。" },
  { trigger: "urgent", text: "还有 5 秒，看完再走。" },
  { trigger: "defeat", text: "本次浏览已结束。" },
]

/** 第 8 层大 Boss · 崩溃页面 */
export const BOSS_CRASH_LINES: BossLineEntry[] = [
  { trigger: "enter", text: "ERROR：页面已停止响应。" },
  { trigger: "phase", phase: 2, text: "你以为你还在这一页？" },
  { trigger: "phase", phase: 3, text: "好了，都别玩了。" },
  { trigger: "skill", skillId: "crash-rain", text: "弹窗是关不完的。" },
  { trigger: "skill", skillId: "crash-warn", text: "正在收集错误报告……" },
  { trigger: "skill", skillId: "crash-clear", text: "你的存档，我收下了。" },
  { trigger: "skill", skillId: "crash-final", text: "（╯°□°）╯︵ ┻━┻" },
  { trigger: "defeat", text: "已恢复。请刷新重试。" },
]

/** 取某个 Boss 的台词表 */
export function bossLineTable(defId: string): BossLineEntry[] {
  if (defId === "boss-fullscreen") return BOSS_AD_LINES
  if (defId === "boss-crash") return BOSS_CRASH_LINES
  return []
}

/** 按触发时机找台词；进阶段带 phase、技能带 skillId */
export function findBossLine(
  defId: string,
  trigger: BossLineTrigger,
  opts?: { phase?: number; skillId?: string },
): BossLineEntry | null {
  const hit = bossLineTable(defId).find(
    (entry) =>
      entry.trigger === trigger &&
      (opts?.phase === undefined || entry.phase === opts.phase) &&
      (opts?.skillId === undefined || entry.skillId === opts.skillId),
  )
  return hit ?? null
}

/** 同一句已经在显示时用它去重，免得刷屏 */
export function bossLineKey(entry: BossLineEntry): string {
  if (entry.trigger === "skill") return `skill:${entry.skillId}`
  if (entry.trigger === "phase") return `phase:${entry.phase}`
  return entry.trigger
}

/* ------------------------------------------------------------------ *
 * 趣味包 v1（fun-pack.md）：敌人台词 / 代价事件 / 乱码化
 * ------------------------------------------------------------------ */

/** 普通敌人台词的三种开口时机（Boss 台词是另一套 bossLineTable，互不相干） */
export type EnemyLineTrigger = "spawn" | "lowhp" | "death"

/** 台词气泡语气：出场是嘲讽、残血是求饶（死亡句只进日志不进气泡） */
export type EnemyLineEntry = {
  trigger: EnemyLineTrigger
  text: string
}

/** 六种普通敌人的台词库（fun-pack.md 一） */
export const ENEMY_LINES: Record<string, EnemyLineEntry[]> = {
  popup: [
    { trigger: "spawn", text: "你关不掉我的。" },
    { trigger: "spawn", text: "每个页面我都得冒个泡。" },
    { trigger: "spawn", text: "就弹一下，真的就一下。" },
    { trigger: "lowhp", text: "等等，我们可以谈谈！" },
    { trigger: "lowhp", text: "关闭我？你确定？" },
    { trigger: "death", text: "下次我开屏就弹……" },
  ],
  ad: [
    { trigger: "spawn", text: "猜你喜欢，不得不喜欢。" },
    { trigger: "spawn", text: "这条广告买一送一。" },
    { trigger: "spawn", text: "点进来就别想出去。" },
    { trigger: "lowhp", text: "再看 5 秒就好！" },
    { trigger: "lowhp", text: "别划走，还有反转！" },
    { trigger: "death", text: "本次投放……已结束。" },
  ],
  notfound: [
    { trigger: "spawn", text: "你要找的东西，在我这里。" },
    { trigger: "spawn", text: "点我拿奖励。" },
    { trigger: "spawn", text: "404：你的血条未找到。" },
    { trigger: "lowhp", text: "左边……宝箱在左边……" },
    { trigger: "lowhp", text: "再给我一次重定向的机会！" },
    { trigger: "death", text: "页面……已找到……" },
  ],
  captcha: [
    { trigger: "spawn", text: "请证明你不是人。" },
    { trigger: "spawn", text: "请点击所有包含红绿灯的图片。" },
    { trigger: "spawn", text: "人机验证，人先死。" },
    { trigger: "lowhp", text: "我不是机器人！" },
    { trigger: "lowhp", text: "下次一定选对……" },
    { trigger: "death", text: "验证失败，永远。" },
  ],
  leak: [
    { trigger: "spawn", text: "我只是占了点小内存。" },
    { trigger: "spawn", text: "再跑一会，就一会。" },
    { trigger: "spawn", text: "你的 8G 内存真好用。" },
    { trigger: "lowhp", text: "GC 呢？GC 在哪？！" },
    { trigger: "lowhp", text: "再给我两格内存！" },
    { trigger: "death", text: "终于……回收了……" },
  ],
  loading: [
    { trigger: "spawn", text: "卡在 99%，惊不惊喜。" },
    { trigger: "spawn", text: "马上就好，别急。" },
    { trigger: "spawn", text: "转圈圈是我的本体。" },
    { trigger: "lowhp", text: "再等一下！真的在加载！" },
    { trigger: "lowhp", text: "我这次真的到 100%……" },
    { trigger: "death", text: "加载完成……是我自己。" },
  ],
}

/**
 * 同一敌人同一时机恒定一句（hash 取模，不同敌人错落开口）。
 * 纯装饰通道：不参与 seed-check、不影响任何数值。
 */
export function pickEnemyLine(
  defId: string,
  trigger: EnemyLineTrigger,
  salt: string,
): string | null {
  const pool = (ENEMY_LINES[defId] ?? []).filter((entry) => entry.trigger === trigger)
  if (pool.length === 0) return null
  const idx = Math.abs(hashString(`${defId}:${trigger}:${salt}`)) % pool.length
  return pool[idx]?.text ?? null
}

/* ---------------- 代价事件（fun-pack.md 三） ---------------- */

export type CrisisId =
  | "crash-popup"
  | "mem-overflow"
  | "bluescreen"
  | "err404"
  | "cache-pollute"

export type CrisisOptionDef = {
  /** 选项按钮文字 */
  label: string
  /** 一行代价说明（永远写清代价，玩家选完不冤枉） */
  detail: string
}

export type CrisisEventDef = {
  id: CrisisId
  /** 弹窗标题，如「致命错误」 */
  title: string
  /** 场景描述 */
  desc: string
  options: [CrisisOptionDef, CrisisOptionDef, CrisisOptionDef]
}

/** 5 个没有正确答案的事件（数值与效果见 fun-pack.md 三 / balance.md） */
export const CRISIS_DEFS: Record<CrisisId, CrisisEventDef> = {
  "crash-popup": {
    id: "crash-popup",
    title: "崩溃弹窗",
    desc: "一个关不掉的东西挡住了去路，右上角的 × 在抖。",
    options: [
      { label: "强行关闭", detail: "它临死抓你一口：生命 -15" },
      { label: "无视它", detail: "它叫来了兄弟：下一场战斗敌人 +1 弹窗，页面还会多出假按钮" },
      { label: "连根删除", detail: "注册表都翻了：随机丢失 1 个词条，内存上限 +1" },
    ],
  },
  "mem-overflow": {
    id: "mem-overflow",
    title: "内存溢出警告",
    desc: "内存条在冒烟。系统问你：要怎么处理这摊烂账？",
    options: [
      { label: "立即清空", detail: "一键轻装：下一场进场时内存只剩一半" },
      { label: "强行扩容", detail: "用电费换：内存上限 +2，生命 -25" },
      { label: "转嫁给敌人", detail: "它们穿防弹衣：下一场战斗全体敌人开局 +20 护盾" },
    ],
  },
  bluescreen: {
    id: "bluescreen",
    title: "蓝屏",
    desc: ":( 你的设备遇到问题。进度条卡在 1%。",
    options: [
      { label: "强制重启", detail: "满血复活的感觉：血回到 60%，随机丢失 1 个词条" },
      { label: "原地等待", detail: "屏幕黑你一脸：生命 -35，但下层三选一必出稀有以上" },
      { label: "甩锅用户", detail: "锅是谁的不重要：+40 碎片，随机背上 1 个诅咒" },
    ],
  },
  err404: {
    id: "err404",
    title: "404 · 页面走丢",
    desc: "一个页面在你面前拐进死胡同。它好像藏着什么。",
    options: [
      { label: "追进去", detail: "死胡同里有硬茬：下一场战斗 +1 个精英敌人" },
      { label: "算了", detail: "什么都没有发生：安全通过" },
      { label: "点它给的重定向", detail: "它说「那边近」：接下来的路线选择重新摇一次" },
    ],
  },
  "cache-pollute": {
    id: "cache-pollute",
    title: "缓存污染",
    desc: "一股脏数据渗进了你的口袋。分分钟的，钱包在变味。",
    options: [
      { label: "清除全部缓存", detail: "钱包大扫除：局内碎片全部清零" },
      { label: "留着它", detail: "慢性中毒：接下来 2 场战斗每场开层 -8 血，页面还会乱码" },
      { label: "隔离感染词条", detail: "刮骨疗毒：随机 1 个词条被贴封条，停用一场战斗" },
    ],
  },
}

/** genCrisis 的等权候选顺序（独立子流取模用） */
export const CRISIS_ORDER: CrisisId[] = [
  "crash-popup",
  "mem-overflow",
  "bluescreen",
  "err404",
  "cache-pollute",
]

/* ---------------- 词条打架（fun-pack2 · 第三批 fun-pack3.md 一） ---------------- */

/**
 * 词条组合冲突：同时持有 requires 两条时触发「变异」——收益加码但带持续反噬。
 * 检测在 buildMods（纯函数），效果点在 useDungeon 引擎各处（数值见 balance.md 趣味包 v3 段）。
 */
export type ConflictId =
  | "listener-debt"
  | "dark-leak"
  | "offline-breach"
  | "awaken-transfer"

export type RelicConflictDef = {
  id: ConflictId
  requires: [string, string]
  /** 徽标名（顶栏 / 顶栏 title 用） */
  name: string
  /** 一句话：变异了什么、代价是什么 */
  desc: string
}

export const RELIC_CONFLICTS: Record<ConflictId, RelicConflictDef> = {
  "listener-debt": {
    id: "listener-debt",
    requires: ["event-listener", "callback-hell"],
    name: "监听债",
    desc: "弹射跳数翻倍，但每跳 30% 概率断线反噬自己（反弹该跳 25% 伤害）。",
  },
  "dark-leak": {
    id: "dark-leak",
    requires: ["dark-theme", "request-interceptor"],
    name: "黑箱拦截",
    desc: "暴伤 +0.5，但每次暴击电流回身，自己 -5 血。",
  },
  "offline-breach": {
    id: "offline-breach",
    requires: ["offline-mode", "memory-leak"],
    name: "离线决堤",
    desc: "离线无敌随内存余量延长（内存越满无敌越久），但无敌结束泄漏 -20 血。",
  },
  "awaken-transfer": {
    id: "awaken-transfer",
    requires: ["async-awaken", "resume-transfer"],
    name: "觉醒续命",
    desc: "断点续传复活成功的瞬间，免费自动轰出一发双倍主动技。",
  },
}

/* ---------------- 隐藏裂隙（fun-pack3.md 二） ---------------- */

/**
 * 隐藏裂隙：达成条件后在该层清场时冒出一道 rift，进去是一场额外战斗。
 * 不进路线系统 / 不改层号（floor 保持整数），奖励与敌组见引擎 enterHiddenBattle。
 */
export type HiddenFloorId = "ad-hell" | "bond-trial" | "fate"

export type HiddenFloorDef = {
  id: HiddenFloorId
  /** 裂隙名 */
  name: string
  /** 出现在哪层清场后（展示文案用） */
  afterFloor: number
  /** Overlay 正文：条件复述 + 里面有什么 + 报酬 */
  lore: string
}

export const HIDDEN_FLOOR_DEFS: Record<HiddenFloorId, HiddenFloorDef> = {
  "ad-hell": {
    id: "ad-hell",
    name: "广告地狱",
    afterFloor: 4,
    lore: "你毫发无伤地走出了小 Boss 层。墙裂开一道缝——里面全是广告，永远关不完的那种。打通它，下一个三选一必出史诗。",
  },
  "bond-trial": {
    id: "bond-trial",
    name: "羁绊试炼",
    afterFloor: 6,
    lore: "你身上的流派多到互相认出了彼此。裂隙里等着的是三个精英——它们也是。打赢奖励一大把碎片。",
  },
  fate: {
    id: "fate",
    name: "宿命",
    afterFloor: 7,
    lore: "同一个种子，第三次踏进这层地牢。裂隙里站着一个熟悉的身影——上几局的你。打赢它，带上它的碎片继续走。",
  },
}

/* ---------------- 乱码化（fun-pack.md 二·scramble） ---------------- */

/** 乱码字符池：只混 ASCII 与制表符，不撑破布局 */
const GLITCH_CHARS = "01#$%&@!?/\\|<>{}<▓▒░>"

/**
 * 把文字打乱成乱码（scramble 故障期间顶栏词条名用它）。
 * bucket 每换一批乱码 +1：同一批内文字稳定，跨批滚动重排。纯函数零副作用。
 */
export function scramblifyText(text: string, bucket: number): string {
  const rng = makeRng(hashString(`scr:${text}:${bucket}`))
  return text
    .split("")
    .map((ch) => {
      if (ch === " " || ch === "·") return ch
      if (rng() < 0.55) {
        return GLITCH_CHARS[Math.floor(rng() * GLITCH_CHARS.length)] ?? ch
      }
      return ch
    })
    .join("")
}

export const MAX_RELIC_SLOTS = 6
export const DODGE_WINDOW_MS = 900
export const IDLE_HEAL_AFTER_MS = 3000

export function getFloorConfig(floor: number): FloorConfig {
  return DUNGEON_RUN_FLOORS[floor - 1] ?? DUNGEON_RUN_FLOORS[0]
}

/* ------------------------------------------------------------------ *
 * 角色战斗数值
 * ------------------------------------------------------------------ */

export type CharacterCombat = {
  maxHp: number
  attack: number
  attackIntervalMs: number
  activeCooldownMs: number
  /** 主动技内存成本（v2 所有操作都有成本）；耗尽区（<15%）无论余额都不能出手 */
  skillMemoryCost: number
  dodgeCooldownMs: number
  /** 每层开局自动补到的护盾值 */
  startShield: number
  /** 护盾上限 */
  shieldMax: number
  critChance: number
  critMult: number
  /** 常驻闪避率 */
  dodgeChance: number
  /** 被动：护盾破碎时对当前敌人造成的伤害（缓存法师 8） */
  shieldBreakDamage: number
  /** 每层自动成长是否含护盾（只有护盾角色吃这条） */
  shieldGrows: boolean
}

export const CHARACTER_COMBAT: Record<CharacterId, CharacterCombat> = {
  "tab-assassin": {
    maxHp: 80,
    attack: 4,
    attackIntervalMs: 500,
    activeCooldownMs: 2500,
    skillMemoryCost: 2,
    dodgeCooldownMs: 2600,
    startShield: 0,
    shieldMax: 12,
    critChance: 0.15,
    critMult: 1.6,
    dodgeChance: 0.1,
    shieldBreakDamage: 0,
    shieldGrows: false,
  },
  "cache-mage": {
    maxHp: 70,
    attack: 6,
    attackIntervalMs: 667,
    activeCooldownMs: 3000,
    skillMemoryCost: 3,
    dodgeCooldownMs: 3000,
    startShield: 12,
    shieldMax: 30,
    critChance: 0.05,
    critMult: 1.5,
    dodgeChance: 0.05,
    shieldBreakDamage: 8,
    shieldGrows: true,
  },
  "script-warrior": {
    maxHp: 90,
    attack: 4,
    attackIntervalMs: 455,
    activeCooldownMs: 6000,
    skillMemoryCost: 4,
    dodgeCooldownMs: 2800,
    startShield: 5,
    shieldMax: 12,
    critChance: 0.08,
    critMult: 1.5,
    dodgeChance: 0.05,
    shieldBreakDamage: 0,
    shieldGrows: true,
  },
  "incognito-ranger": {
    maxHp: 75,
    attack: 5,
    attackIntervalMs: 556,
    activeCooldownMs: 5000,
    skillMemoryCost: 2,
    dodgeCooldownMs: 2200,
    startShield: 0,
    shieldMax: 12,
    critChance: 0.1,
    critMult: 1.6,
    dodgeChance: 0.15,
    shieldBreakDamage: 0,
    shieldGrows: false,
  },
  "cookie-thief": {
    maxHp: 85,
    attack: 5,
    attackIntervalMs: 620,
    activeCooldownMs: 5000,
    skillMemoryCost: 3,
    dodgeCooldownMs: 2600,
    startShield: 0,
    shieldMax: 12,
    critChance: 0.08,
    critMult: 1.5,
    dodgeChance: 0.1,
    shieldBreakDamage: 0,
    shieldGrows: false,
  },
  "worker-monk": {
    maxHp: 75,
    attack: 4,
    attackIntervalMs: 520,
    activeCooldownMs: 7000,
    skillMemoryCost: 4,
    dodgeCooldownMs: 2600,
    startShield: 0,
    shieldMax: 12,
    critChance: 0.1,
    critMult: 1.5,
    dodgeChance: 0.08,
    shieldBreakDamage: 0,
    shieldGrows: false,
  },
  "kernel-shade": {
    maxHp: 95,
    attack: 6,
    attackIntervalMs: 600,
    activeCooldownMs: 12000,
    skillMemoryCost: 6,
    dodgeCooldownMs: 2500,
    startShield: 0,
    shieldMax: 20,
    critChance: 0.12,
    critMult: 1.8,
    dodgeChance: 0.08,
    shieldBreakDamage: 0,
    shieldGrows: false,
  },
}

/* ------------------------------------------------------------------ *
 * 隐藏角色可见性：累计通关数够格才在首页 / 图鉴露面
 * ------------------------------------------------------------------ */

/** 本局入口 / 图鉴 / 首页共用：requireClears 够不够、够格时还差几次 */
export function characterClearsRemaining(
  character: DungeonCharacter,
  totalClears: number,
): number {
  return Math.max(0, character.requiresClears - totalClears)
}

export function isCharacterVisible(
  character: DungeonCharacter,
  totalClears: number,
): boolean {
  return characterClearsRemaining(character, totalClears) === 0
}

/** 隐藏角色露面提示文案（首页 / 图鉴共用，避免两处各写一句） */
export const HIDDEN_CHARACTER_HINT = "通关 3 次后现身 · 1200 碎片或 25 核心买断"

/**
 * 每清一层的基础回血（与「本地存储」等词条叠加）。
 * 没有它时玩家 80 点血扛不住 8 层累计伤害，死亡时刻由累计量而非单层难度决定。
 */
export const FLOOR_CLEAR_HEAL = 7

/** 主动技冷却的下限，防止成长把冷却压到 0 */
export const MIN_ACTIVE_COOLDOWN_MS = 1200

/** 局内成长：每清一层 生命 +5 / 攻击 +0.5 / 护盾 +1（仅护盾角色）/ 主动冷却 -0.1 秒 */
export const FLOOR_GROWTH = {
  hp: 5,
  attack: 0.5,
  shield: 1,
  activeCooldownMs: 100,
}

export function scaleCombatForFloor(
  combat: CharacterCombat,
  floor: number,
): CharacterCombat {
  const steps = Math.max(0, floor - 1)
  const shieldSteps = combat.shieldGrows ? steps * FLOOR_GROWTH.shield : 0
  return {
    ...combat,
    maxHp: combat.maxHp + FLOOR_GROWTH.hp * steps,
    attack: combat.attack + FLOOR_GROWTH.attack * steps,
    startShield: combat.startShield + shieldSteps,
    shieldMax: combat.shieldMax + shieldSteps,
    activeCooldownMs: Math.max(
      MIN_ACTIVE_COOLDOWN_MS,
      combat.activeCooldownMs - FLOOR_GROWTH.activeCooldownMs * steps,
    ),
  }
}

/**
 * 基础 DPS：只算自动攻击（攻击 × 攻速 × 暴击期望），不含主动技、词条与敌人护甲。
 * 直接从 CHARACTER_COMBAT 推导，保证展示值与战斗公式永远一致。
 */
export function getCharacterBaseDps(id: CharacterId): number {
  const combat = CHARACTER_COMBAT[id]
  const critFactor = 1 + combat.critChance * (combat.critMult - 1)
  return combat.attack * (1000 / combat.attackIntervalMs) * critFactor
}

export type CharacterStatEntry = { label: string; value: string }

/**
 * 角色面板 / 首页卡 / 图鉴卡统一从这里取数值，避免各处硬编码。
 */
export function getCharacterStatEntries(
  id: CharacterId,
): CharacterStatEntry[] {
  const combat = CHARACTER_COMBAT[id]
  return [
    { label: "生命", value: String(combat.maxHp) },
    { label: "护盾", value: String(combat.startShield) },
    { label: "攻击", value: String(combat.attack) },
    { label: "攻速", value: `${(1000 / combat.attackIntervalMs).toFixed(1)} 次/秒` },
    { label: "暴击率", value: `${Math.round(combat.critChance * 100)}%` },
    { label: "暴击伤害", value: `${Math.round(combat.critMult * 100)}%` },
    { label: "闪避", value: `${Math.round(combat.dodgeChance * 100)}%` },
    { label: "主动冷却", value: `${(combat.activeCooldownMs / 1000).toFixed(1)} 秒` },
    { label: "基础 DPS", value: `约 ${getCharacterBaseDps(id).toFixed(1)}` },
  ]
}

/** 三选一「跳过并回复 15 生命」的回血量 */
export const RELIC_SKIP_HEAL = 15

/* ================================================================== *
 * 路线系统（dungeon-route.md）
 * 每层打完结束三选一后选路，池下标 i = 「打完第 i+1 层后、进入第 i+2 层」。
 * 池内 enemyComp 是 baked 数值（崩溃边缘等修正已乘进 hp/attack），
 * 引擎不再对 comp 二次乘区（enemyText 卡面只描述类型，不显示数值）。
 * ================================================================== */

export type RouteId =
  | "ad-canyon"
  | "cache-abyss"
  | "captcha-maze"
  | "crash-edge"
  | "unknown-zone"
  | "data-mine"
  | "firewall"
  | "recycle-bin"
  | "mirror-space"
  | "time-rift"
  | "twin-pages"

export type RouteRisk = "low" | "mid" | "high"

export type RouteType = {
  id: RouteId
  name: string
  icon: string
  risk: RouteRisk
  /** 卡片可见：敌人简述 / 奖励简述（具体数值不上卡面） */
  enemyText: string
  rewardText: string
  /** 路线叙事片段（deepening-pack.md 四）：卡底斜体小字 + 选路后的横幅文案 */
  lore: string
}

export const ROUTE_TYPES: Record<RouteId, RouteType> = {
  "ad-canyon": {
    id: "ad-canyon",
    name: "广告峡谷",
    icon: "📺",
    risk: "low",
    enemyText: "广告成群，掉落翻倍",
    rewardText: "碎片大额到账",
    lore: "到处都是推销员，但掉出来的硬币也是真的。",
  },
  "cache-abyss": {
    id: "cache-abyss",
    name: "缓存深渊",
    icon: "💾",
    risk: "low",
    enemyText: "敌人少而带盾，破盾回内存",
    rewardText: "层内内存补给",
    lore: "这里的东西都被删过一遍——包括你的耐心。",
  },
  "captcha-maze": {
    id: "captcha-maze",
    name: "验证码迷宫",
    icon: "🔐",
    risk: "mid",
    enemyText: "验证码连环，点对破防点错狂暴",
    rewardText: "必出稀有词条",
    lore: "证明你是人类。它们最近不太信了。",
  },
  "crash-edge": {
    id: "crash-edge",
    name: "崩溃边缘",
    icon: "💥",
    risk: "high",
    enemyText: "敌人凶狠但脆皮",
    rewardText: "必出史诗词条",
    lore: "警告：检测到大量未处理异常。异常里，似乎有管理员留下的碎片。",
  },
  "unknown-zone": {
    id: "unknown-zone",
    name: "未知区域",
    icon: "❓",
    risk: "mid",
    enemyText: "一切皆有可能",
    rewardText: "看运气",
    lore: "地图在这里是一片空白。空白本身就是提示。",
  },
  "data-mine": {
    id: "data-mine",
    name: "数据矿脉",
    icon: "⛏️",
    risk: "mid",
    enemyText: "敌人挨一拳偷 5 碎片",
    rewardText: "通关大额碎片",
    lore: "矿是挖给你的，账是算你头上的。",
  },
  firewall: {
    id: "firewall",
    name: "防火墙",
    icon: "🧱",
    risk: "high",
    enemyText: "护盾按时回满，出手凶悍",
    rewardText: "词条槽位 +1",
    lore: "墙那边是什么不重要，重要的是它一直在补墙。",
  },
  "recycle-bin": {
    id: "recycle-bin",
    name: "回收站",
    icon: "♻️",
    risk: "low",
    enemyText: "没有敌人",
    rewardText: "免费移除 1 个词条或诅咒",
    lore: "被丢掉的东西都在这。有些不建议细看。",
  },
  "mirror-space": {
    id: "mirror-space",
    name: "镜像空间",
    icon: "🪞",
    risk: "mid",
    enemyText: "敌人学你的套路出手",
    rewardText: "可复制 1 个已有词条",
    lore: "它没有新招数，它全是你。",
  },
  "time-rift": {
    id: "time-rift",
    name: "时间裂隙",
    icon: "⏳",
    risk: "high",
    enemyText: "每个敌人 15 秒内必须清除",
    rewardText: "三选一刷新次数永久 +1",
    lore: "这里的时间是借来的，利息是你的血。",
  },
  "twin-pages": {
    id: "twin-pages",
    name: "双面回廊",
    icon: "🪟",
    risk: "high",
    enemyText: "成对广告：背面躲在后台标签页读条",
    rewardText: "同步击杀：史诗词条+大碎片",
    lore: "广告也有正反两副面孔，背面那张从不排队，直接敲你的后台。",
  },
}

export type RouteEntry = {
  routeId: RouteId
  /** baked 进层敌组（回收站/未知区域留空） */
  enemyComp: FloorEnemySpec[]
  /** 层末到账碎片 */
  shardReward?: number
  /** 层内内存补给（进层到账，受上限） */
  memoryReward?: number
  /** 本层三选一的稀有度保底 */
  relicFloor?: "rare" | "epic"
  /** 进层到账：词条槽 +1 */
  slotReward?: boolean
  /** 进层到账：此后每层三选一刷新 +1 */
  rerollReward?: boolean
}

export const ROUTE_POOLS: RouteEntry[][] = [
  /* 打完第 1 层 → 进第 2 层（2 条） */
  [
    {
      routeId: "ad-canyon",
      enemyComp: [
        { defId: "popup", hp: 60, attack: 3 },
        { defId: "popup", hp: 50, attack: 3 },
      ],
      shardReward: 15,
    },
    {
      routeId: "cache-abyss",
      enemyComp: [{ defId: "popup", hp: 60, attack: 3, shield: 30 }],
      memoryReward: 3,
    },
  ],
  /* 打完第 2 层 → 进第 3 层 */
  [
    {
      routeId: "ad-canyon",
      enemyComp: [
        { defId: "popup", hp: 60, attack: 3 },
        { defId: "popup", hp: 50, attack: 3 },
        { defId: "popup", hp: 50, attack: 3 },
      ],
      shardReward: 20,
    },
    {
      routeId: "cache-abyss",
      enemyComp: [{ defId: "ad", hp: 50, attack: 4, shield: 40 }],
      memoryReward: 4,
    },
    { routeId: "unknown-zone", enemyComp: [] },
    {
      routeId: "twin-pages",
      /* 双面回廊：成对广告（hp ×1.6 baked，attack 不变） */
      enemyComp: [
        { defId: "ad", hp: 80, attack: 4, twin: "front" },
        { defId: "ad", hp: 80, attack: 4, twin: "back" },
      ],
    },
  ],
  /* 打完第 3 层 → 进第 4 层 */
  [
    {
      routeId: "ad-canyon",
      enemyComp: [
        { defId: "ad", hp: 50, attack: 4, shield: 5 },
        { defId: "ad", hp: 45, attack: 4 },
        { defId: "ad", hp: 45, attack: 4 },
      ],
      shardReward: 25,
    },
    {
      routeId: "captcha-maze",
      enemyComp: [
        { defId: "captcha", hp: 60, attack: 5, guard: true },
        { defId: "captcha", hp: 55, attack: 5, guard: true },
      ],
      relicFloor: "rare",
    },
    {
      routeId: "data-mine",
      enemyComp: [
        { defId: "popup", hp: 60, attack: 3 },
        { defId: "popup", hp: 50, attack: 3 },
      ],
      shardReward: 40,
    },
  ],
  /* 打完第 4 层 → 进第 5 层 */
  [
    {
      routeId: "cache-abyss",
      enemyComp: [
        { defId: "ad", hp: 50, attack: 4, shield: 40 },
        { defId: "ad", hp: 45, attack: 4, shield: 40 },
      ],
      memoryReward: 5,
    },
    { routeId: "recycle-bin", enemyComp: [] },
    {
      routeId: "crash-edge",
      /* 404×3 强化档：hp ×0.8 / attack ×1.3 baked（45→36、6→8） */
      enemyComp: [
        { defId: "notfound", hp: 36, attack: 8 },
        { defId: "notfound", hp: 36, attack: 8 },
        { defId: "notfound", hp: 36, attack: 8 },
      ],
      relicFloor: "epic",
    },
    {
      routeId: "twin-pages",
      /* 双面回廊：成对广告（hp ×1.6 baked，attack 不变） */
      enemyComp: [
        { defId: "ad", hp: 80, attack: 4, twin: "front" },
        { defId: "ad", hp: 80, attack: 4, twin: "back" },
      ],
    },
  ],
  /* 打完第 5 层 → 进第 6 层 */
  [
    {
      routeId: "ad-canyon",
      enemyComp: [
        { defId: "notfound", hp: 45, attack: 6 },
        { defId: "notfound", hp: 45, attack: 6 },
        { defId: "notfound", hp: 40, attack: 6 },
        { defId: "notfound", hp: 40, attack: 6 },
      ],
      shardReward: 50,
    },
    {
      routeId: "mirror-space",
      enemyComp: [
        { defId: "notfound", hp: 45, attack: 6 },
        { defId: "notfound", hp: 45, attack: 6 },
      ],
    },
    {
      routeId: "firewall",
      /* 强化 404×2：hp ×0.8（36）/ attack ×1.5（9）+ 20 护盾按时回 */
      enemyComp: [
        { defId: "notfound", hp: 36, attack: 9, shield: 20 },
        { defId: "notfound", hp: 36, attack: 9, shield: 20 },
      ],
      slotReward: true,
    },
  ],
  /* 打完第 6 层 → 进第 7 层 */
  [
    {
      routeId: "captcha-maze",
      enemyComp: [
        { defId: "captcha", hp: 60, attack: 5, guard: true },
        { defId: "captcha", hp: 55, attack: 5, guard: true },
        { defId: "captcha", hp: 50, attack: 5, guard: true },
      ],
      relicFloor: "rare",
    },
    {
      routeId: "time-rift",
      enemyComp: [
        { defId: "captcha", hp: 60, attack: 5, guard: true },
        { defId: "captcha", hp: 55, attack: 5, guard: true },
      ],
      rerollReward: true,
    },
    {
      routeId: "cache-abyss",
      enemyComp: [{ defId: "captcha", hp: 60, attack: 5, guard: true, shield: 50 }],
      memoryReward: 6,
    },
    {
      routeId: "twin-pages",
      /* 双面回廊：成对广告（hp ×1.6 baked，attack 不变） */
      enemyComp: [
        { defId: "ad", hp: 80, attack: 4, twin: "front" },
        { defId: "ad", hp: 80, attack: 4, twin: "back" },
      ],
    },
  ],
  /* 打完第 7 层 → 进第 8 层（固定 Boss 前的最后一段） */
  [
    {
      routeId: "data-mine",
      enemyComp: [
        { defId: "leak", hp: 80, attack: 11, shield: 15, regen: true, elite: true },
      ],
      shardReward: 80,
    },
    { routeId: "recycle-bin", enemyComp: [] },
    {
      routeId: "crash-edge",
      /* 内存泄漏×2 强化档：hp ×0.8（64）/ attack ×1.3（14） */
      enemyComp: [
        { defId: "leak", hp: 64, attack: 14, shield: 15, regen: true },
        { defId: "leak", hp: 64, attack: 14, shield: 15, regen: true },
      ],
      relicFloor: "epic",
    },
  ],
]

export type CurseDef = {
  id: CurseId
  name: string
  desc: string
}

export type CurseId =
  | "curse-mem-leak"
  | "curse-virus"
  | "curse-ad-bomb"
  | "curse-throttle"
  | "curse-offline"
  | "curse-bluescreen"

export const CURSE_DEFS: Record<CurseId, CurseDef> = {
  "curse-mem-leak": {
    id: "curse-mem-leak",
    name: "内存泄漏",
    desc: "每层开始时内存 -2",
  },
  "curse-virus": {
    id: "curse-virus",
    name: "病毒",
    desc: "每层开始时生命 -10",
  },
  "curse-ad-bomb": {
    id: "curse-ad-bomb",
    name: "广告轰炸",
    desc: "战斗层的敌人多 1 个",
  },
  "curse-throttle": {
    id: "curse-throttle",
    name: "限速",
    desc: "攻速 -15%",
  },
  "curse-offline": {
    id: "curse-offline",
    name: "断网",
    desc: "无法使用主动技",
  },
  "curse-bluescreen": {
    id: "curse-bluescreen",
    name: "蓝屏",
    desc: "每 10 秒随机卡顿 1 秒",
  },
}

/** 路线池取数：floorBefore = 刚打完的层（1~7） */
export function getRoutePool(floorBefore: number): RouteEntry[] {
  return ROUTE_POOLS[floorBefore - 1] ?? []
}
