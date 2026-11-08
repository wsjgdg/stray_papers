/**
 * 种子驱动程序化生成器（规格 .rh/pages/seed-system.md 三~五、八）
 *
 * 纯函数：所有输入显式传入（种子 / 层数 / 玩家状态），不读全局。
 * 每个生成物用独立子流（streamFor(种子, 固定键)），玩家路径分叉不影响其他分支内容。
 * 战斗实时随机（暴击 / 闪避 / 掉落位置）不归这里，留在引擎的 Math.random。
 */
import {
  BOSS_AD_SKILLS,
  BOSS_CRASH_SKILLS,
  CURSE_DEFS,
  RELIC_POOL,
  CRISIS_ORDER,
  type BossSkill,
  type CrisisId,
  type CurseId,
  type FloorEnemySpec,
  type Relic,
  type RelicRarity,
  type RelicSchoolKey,
  type RouteEntry,
  type RouteId,
  type RouteRisk,
  type RouteType,
  ROUTE_TYPES,
} from "./dungeonData"
import {
  float0911,
  pick,
  pickWeighted,
  pickWeightedMany,
  rollInt,
  shuffleSeeded,
  streamFor,
} from "./rng"

/* ---------------- 敌人标签（展示 + 少数机制映射） ---------------- */

export type EnemyTagId =
  | "autoplay"
  | "uncloseable"
  | "accel"
  | "shield-regen"
  | "popup-bomb"
  | "stealth"
  | "enrage"
  | "dodge"
  | "lifesteal"
  | "pattern"
  | "break-def"
  | "attack"
  | "regen"
  | "leak"
  /* 深化包（deepening-pack.md 三）：可引爆的病毒标签 */
  | "virus"

export const ENEMY_TAG_DEFS: Record<EnemyTagId, { name: string; desc: string }> = {
  autoplay: { name: "自动播放", desc: "不请自来的老熟人" },
  uncloseable: { name: "无法关闭", desc: "多点几下才关得掉" },
  accel: { name: "加速", desc: "出手间隔缩短" },
  "shield-regen": { name: "护盾刷新", desc: "带盾且会补盾" },
  "popup-bomb": { name: "弹窗轰炸", desc: "看着就烦" },
  stealth: { name: "隐身", desc: "这层敌人会随机隐身" },
  enrage: { name: "狂暴", desc: "攻击更高" },
  dodge: { name: "闪避", desc: "身法诡谲" },
  lifesteal: { name: "吸血", desc: "越打越来劲" },
  pattern: { name: "图案", desc: "点对图案才能破防" },
  "break-def": { name: "破防", desc: "装甲薄弱处被盯上" },
  attack: { name: "攻击", desc: "输出型选手" },
  regen: { name: "回血", desc: "会自己回血" },
  leak: { name: "泄漏", desc: "越打越大" },
  virus: { name: "病毒", desc: "引爆它，让邻居的标签变异" },
}

/** 变异后的反转效果（敌人卡变异角标 title 用；数值实现见 useDungeon 病毒段） */
export const TAG_MUTATION_HINTS: Partial<Record<EnemyTagId, string>> = {
  accel: "变异：出手间隔 ×1.4（加速反噬为减速）",
  "shield-regen": "变异：不再补盾",
  regen: "变异：不再回血，每 2 秒自噬 5% 上限血",
  lifesteal: "变异：出手后自伤出手量 20%",
  dodge: "变异：不再闪避，受伤 +30%",
  enrage: "变异：攻击跌到 60%",
  attack: "变异：攻击跌到 60%",
  stealth: "变异：永久现形，受伤 +20%",
  leak: "变异：不再成长，每 3 秒掉 3 血",
  pattern: "变异：护甲脱落（破防消失）",
  "break-def": "变异：护甲脱落（破防消失）",
  autoplay: "变异：标签被病毒吃掉（脱落）",
  uncloseable: "变异：标签被病毒吃掉（脱落）",
  "popup-bomb": "变异：标签被病毒吃掉（脱落）",
}

/* ---------------- 数值档（seed-system.md 四） ---------------- */

/** 每种敌人的数值档：base 取现行层配置的 baked 值，tierFloor = 档所属层 */
export const ENEMY_TIERS: Record<
  string,
  { hp: number; attack: number; tierFloor: number }
> = {
  popup: { hp: 60, attack: 3, tierFloor: 2 },
  ad: { hp: 50, attack: 4, tierFloor: 3 },
  notfound: { hp: 45, attack: 6, tierFloor: 5 },
  captcha: { hp: 60, attack: 5, tierFloor: 6 },
  leak: { hp: 80, attack: 11, tierFloor: 7 },
}

/** 每层可选敌人类型池（行号 = 进入层；第 1/4/8 层固定不进生成） */
export const FLOOR_ENEMY_POOL: Record<number, string[]> = {
  2: ["popup"],
  3: ["popup", "ad"],
  5: ["ad", "notfound", "captcha"],
  6: ["notfound", "captcha", "leak"],
  7: ["captcha", "leak"],
}

/** 每层可选标签池 */
export const FLOOR_TAG_POOL: Record<number, EnemyTagId[]> = {
  2: ["autoplay", "uncloseable"],
  3: ["autoplay", "uncloseable", "accel", "shield-regen", "popup-bomb"],
  5: ["autoplay", "stealth", "enrage", "dodge", "lifesteal", "virus"],
  6: ["pattern", "break-def", "attack", "shield-regen", "virus"],
  7: ["regen", "shield-regen", "attack", "leak", "virus"],
}

/* ---------------- 进入路线池与路线奖励（seed-system.md 三） ---------------- */

/** 行号 = 进入的层。第 4 层（小 Boss）与第 8 层（大 Boss）固定，不走路线选择。 */
export const ENTER_ROUTE_POOL: Record<number, RouteId[]> = {
  2: ["ad-canyon", "cache-abyss", "data-mine", "unknown-zone"],
  3: ["ad-canyon", "cache-abyss", "data-mine", "unknown-zone", "twin-pages"],
  5: ["cache-abyss", "recycle-bin", "crash-edge", "unknown-zone", "twin-pages"],
  /* 全路线池：双面回廊不进（core-experience-pack.md 一：只加在 after-L2/L4/L6 三行） */
  6: (Object.keys(ROUTE_TYPES) as RouteId[]).filter((id) => id !== "twin-pages"),
  7: ["data-mine", "recycle-bin", "crash-edge", "firewall", "twin-pages"],
}

/** 路线常量奖励：ad-canyon 碎片随层缓涨，data-mine 高层翻倍 */
export function routeRewardForFloor(routeId: RouteId, floor: number): Partial<RouteEntry> {
  switch (routeId) {
    case "ad-canyon":
      return { shardReward: 10 + floor * 5 }
    case "cache-abyss":
      return { memoryReward: Math.min(8, 1 + floor) }
    case "data-mine":
      return { shardReward: floor >= 6 ? 80 : 40 }
    case "captcha-maze":
      return { relicFloor: "rare" }
    case "crash-edge":
      return { relicFloor: "epic" }
    case "firewall":
      return { slotReward: true }
    case "time-rift":
      return { rerollReward: true }
    default:
      return {}
  }
}

/* ---------------- 敌人组合生成 ---------------- */

function float0911Round(base: number, mult: number): number {
  return Math.max(1, Math.round(base * mult))
}

function genTagsFor(rng: () => number, floor: number): EnemyTagId[] {
  const pool = FLOOR_TAG_POOL[floor] ?? []
  if (pool.length === 0) return []
  const max = floor >= 5 ? 3 : floor >= 3 ? 2 : 1
  const count = rollInt(rng, 1, Math.min(max, pool.length))
  const picked: EnemyTagId[] = []
  for (let i = 0; i < count; i++) {
    const tag = pick(rng, pool)
    if (picked.includes(tag)) continue
    /* 合理性：stealth + dodge 同敌只留先到的一个 */
    if (tag === "dodge" && picked.includes("stealth")) continue
    if (tag === "stealth" && picked.includes("dodge")) {
      picked.splice(picked.indexOf("dodge"), 1)
    }
    /* 护盾/回血类同敌至多 1 个 */
    if (
      (tag === "shield-regen" || tag === "regen") &&
      picked.some((t) => t === "shield-regen" || t === "regen")
    ) {
      continue
    }
    picked.push(tag)
  }
  return picked
}

/**
 * 按「种子 + 层 + 路线」生成敌人组（含标签与路线修正 baked）。
 * 无战斗路线（回收站 / 未知区域）返回空组。
 * enemyPool：每日挑战的敌人档位子池（undefined = 全池；过滤后为空自动回退全池）。
 */
export function genFloorEnemies(
  seed: string,
  floor: number,
  routeId: RouteId,
  enemyPool?: string[],
): FloorEnemySpec[] {
  if (routeId === "recycle-bin" || routeId === "unknown-zone") return []
  const fullPool = FLOOR_ENEMY_POOL[floor]
  if (!fullPool || fullPool.length === 0) return []
  let pool = fullPool
  if (enemyPool && enemyPool.length > 0) {
    const filtered = fullPool.filter((id) => enemyPool.includes(id))
    if (filtered.length > 0) pool = filtered
  }
  const rng = streamFor(seed, `enemies:${floor}:${routeId}`)

  /* 双面回廊（core-experience-pack.md 一）：固定成对广告（正面 + 背面），hp ×1.6 */
  if (routeId === "twin-pages") {
    const tier = ENEMY_TIERS.ad
    const scale = 1 + Math.max(0, floor - tier.tierFloor) * 0.08
    const hp = float0911Round(tier.hp, scale * float0911(rng) * 1.6)
    const attack = float0911Round(tier.attack, scale * float0911(rng))
    return [
      { defId: "ad", hp, attack, twin: "front" },
      { defId: "ad", hp, attack, twin: "back" },
    ]
  }

  /* 数量：1~3 为主，第 5 层起允许 4 */
  const count = floor >= 5 ? 1 + rollInt(rng, 1, 3) : 1 + rollInt(rng, 1, 2)

  const specs: FloorEnemySpec[] = []
  for (let i = 0; i < count; i++) {
    let defId = pick(rng, pool)
    /* 泄漏档太肉，不给 4 个 */
    if (defId === "leak" && count >= 4) defId = pick(rng, pool.filter((id) => id !== "leak"))
    const tier = ENEMY_TIERS[defId] ?? ENEMY_TIERS.popup
    const scale = 1 + Math.max(0, floor - tier.tierFloor) * 0.08
    let hp = float0911Round(tier.hp, scale * float0911(rng))
    let attack = float0911Round(tier.attack, scale * float0911(rng))
    const tags = genTagsFor(rng, floor)

    const spec: FloorEnemySpec = { defId, hp, attack }
    if (defId === "captcha") spec.guard = true
    /* 标签机制：能 baked 的全 baked 进数值，展示型留给卡面 */
    if (tags.includes("enrage")) attack = Math.max(1, Math.round(attack * 1.3))
    if (tags.includes("shield-regen")) spec.shield = spec.shield ?? 20
    if (tags.includes("pattern") && defId !== "captcha") spec.guard = true
    if (tags.includes("regen") && defId === "leak") spec.regen = true

    /* 路线修正 baked（dungeon-route.md 三，引擎不再二次乘区） */
    if (routeId === "crash-edge") {
      hp = Math.max(1, Math.round(hp * 0.8))
      attack = Math.max(1, Math.round(attack * 1.3))
    }
    if (routeId === "firewall") {
      attack = Math.max(1, Math.round(attack * 1.5))
      spec.shield = 20
    }
    if (routeId === "cache-abyss") {
      spec.shield = defId === "ad" ? 40 : defId === "captcha" ? 50 : Math.max(spec.shield ?? 0, 30)
    }
    spec.hp = hp
    spec.attack = attack
    spec.tags = tags
    specs.push(spec)
  }

  /* 缓存深渊：敌人少而带盾，多于 2 个时截断（老档节奏） */
  if (routeId === "cache-abyss" && specs.length > 2) specs.length = 2

  /* L7 数据矿脉：必出 1 个精英（现行契约保留） */
  if (floor === 7 && routeId === "data-mine" && specs.length > 0) {
    specs[0].elite = true
    specs[0].shield = specs[0].shield ?? 15
    specs[0].regen = true
  }
  return specs
}

/* ---------------- 路线选项生成 ---------------- */

export type RouteChoiceContext = {
  /** 当前血量比例（低血 → 恢复系路线权重 ×2） */
  hpRatio: number
  /** 已带词条的系别计数（Build 修正） */
  schoolCounts: Partial<Record<RelicSchoolKey, number>>
  /** 上一层走过的路线（防重复） */
  prevRouteId: RouteId | null
}

/** 每日池过滤（undefined = 全池；过滤后候选不足自动回退全池） */
export type GenPools = { routePool?: RouteId[]; enemyPool?: string[] }

/** 整局携带的每日池（挂在 RunState 上，各生成点消费） */
export type DailyPools = GenPools & { relicPool?: string[] }

/** 生成进入 targetFloor 的 2~3 条路线（流键 routes:{N}） */
export function genRouteOptions(
  seed: string,
  targetFloor: number,
  ctx: RouteChoiceContext,
  pools?: GenPools,
): RouteEntry[] {
  const fullPool = ENTER_ROUTE_POOL[targetFloor]
  if (!fullPool) return []
  let pool = fullPool
  if (pools?.routePool && pools.routePool.length > 0) {
    const filtered = fullPool.filter((id) => pools.routePool!.includes(id))
    if (filtered.length >= 2) pool = filtered
  }
  const rng = streamFor(seed, `routes:${targetFloor}`)

  const candidates = pool.filter((id) => id !== ctx.prevRouteId)
  const source = candidates.length >= 2 ? candidates : pool
  const take = Math.min(3, source.length)

  const weights = source.map((routeId) => {
    let weight = 1
    if (ctx.hpRatio < 0.4 && (routeId === "recycle-bin" || routeId === "cache-abyss" || routeId === "unknown-zone")) {
      weight *= 2
    }
    const n = ctx.schoolCounts.network ?? 0
    const m = ctx.schoolCounts.cache ?? 0
    const s = ctx.schoolCounts.script ?? 0
    if (n >= 2 && routeId === "cache-abyss") weight *= 2
    if (m >= 2 && routeId === "data-mine") weight *= 2
    if (s >= 3 && routeId === "crash-edge") weight *= 2
    return { item: routeId, weight }
  })

  const chosen = pickWeightedMany(rng, weights, take)
  return chosen.map((routeId) => ({
    routeId,
    enemyComp: genFloorEnemies(seed, targetFloor, routeId, pools?.enemyPool),
    ...routeRewardForFloor(routeId, targetFloor),
  }))
}

/* ---------------- 路线卡面动态预览 ---------------- */

/** 卡面敌人简述：从生成的敌组动态拼（「弹窗×2 · 404×1」） */
export function routeCompText(entry: RouteEntry): string {
  if (entry.enemyComp.length === 0) return ""
  const counts = new Map<string, number>()
  entry.enemyComp.forEach((spec) => {
    counts.set(spec.defId, (counts.get(spec.defId) ?? 0) + 1)
  })
  return [...counts.entries()].map(([defId, n]) => `${ENEMY_DISPLAY[defId] ?? defId}×${n}`).join(" · ")
}

const ENEMY_DISPLAY: Record<string, string> = {
  popup: "弹窗",
  ad: "广告",
  notfound: "404",
  captcha: "验证码",
  leak: "内存泄漏",
}

/** 风险徽章：从生成结果推算（覆盖 ROUTE_TYPES 的静态 risk） */
export function routeRiskOf(entry: RouteEntry, type: RouteType): RouteRisk {
  /* 双面回廊固定 high：成对机制本身重，不按 2 敌组的普通推算降档 */
  if (entry.enemyComp.length === 0 || entry.routeId === "twin-pages") return type.risk
  const hasElite = entry.enemyComp.some((spec) => spec.elite)
  const hasShield = entry.enemyComp.some((spec) => (spec.shield ?? 0) > 0)
  const hasGuard = entry.enemyComp.some((spec) => spec.guard)
  if (entry.enemyComp.length >= 3 || hasElite) return "high"
  if (entry.enemyComp.length === 2 || hasShield || hasGuard) return "mid"
  return "low"
}

/* ---------------- 三选一程序化（seed-system.md 五） ---------------- */

/** 稀有度按层权重（普通 / 稀有 / 史诗） */
export function relicRarityWeights(
  floor: number,
): { item: RelicRarity; weight: number }[] {
  if (floor <= 3) {
    return [
      { item: "common", weight: 60 },
      { item: "rare", weight: 30 },
      { item: "epic", weight: 10 },
    ]
  }
  if (floor <= 6) {
    return [
      { item: "common", weight: 50 },
      { item: "rare", weight: 35 },
      { item: "epic", weight: 15 },
    ]
  }
  return [
    { item: "common", weight: 40 },
    { item: "rare", weight: 40 },
    { item: "epic", weight: 20 },
  ]
}

/**
 * 三选一生成（流键由调用方拼好传入，保证同层多次刷新各走各的子流）。
 * 每张卡先按层权重定稀有度再按系别去重抽样；rarityFloor = 路线保底。
 */
export function genRelicChoices(
  seed: string,
  key: string,
  owned: Relic[],
  count: number,
  floor: number,
  rarityFloor?: "rare" | "epic",
  relicPool?: string[],
): Relic[] {
  const rng = streamFor(seed, key)
  const ownedIds = new Set(owned.map((relic) => relic.id))
  /* 每日挑战的词条子池（undefined = 全池；过滤后为空自动回退全池） */
  const basePool =
    relicPool && relicPool.length > 0
      ? RELIC_POOL.filter((relic) => relicPool.includes(relic.id))
      : RELIC_POOL
  const effectiveBase = basePool.length > 0 ? basePool : RELIC_POOL
  const pool = effectiveBase.filter((relic) => !ownedIds.has(relic.id))
  const source = pool.length >= count ? pool : effectiveBase
  const weights = relicRarityWeights(floor)

  const picked: Relic[] = []
  const usedSchools = new Set<RelicSchoolKey>()
  const usedIds = new Set<string>()

  const rarityPool = (rarity: RelicRarity, schoolsFree: boolean): Relic[] => {
    const base = source.filter((relic) => relic.rarity === rarity && !usedIds.has(relic.id))
    if (!schoolsFree) return base
    const filtered = base.filter((relic) => !usedSchools.has(relic.school))
    return filtered.length > 0 ? filtered : base
  }
  const anyPool = (): Relic[] => {
    const free = source.filter((relic) => !usedIds.has(relic.id))
    return free.length > 0 ? shuffleSeeded(rng, free) : []
  }

  for (let i = 0; i < count; i++) {
    /* 最后一张承担路线保底 */
    const forceIndex = rarityFloor && i === count - 1
    const rarity = forceIndex ? rarityFloor : pickWeighted(rng, weights)
    let hit = rarityPool(rarity, true)[0]
    /* 该稀有度池被掏空 → 同权重降级重选一次 */
    if (!hit) {
      const alt = pickWeighted(rng, weights.filter((w) => w.item !== rarity))
      hit = rarityPool(alt, true)[0] ?? rarityPool(rarity, false)[0]
    }
    if (!hit) {
      const rest = anyPool()
      hit = rest[0]
    }
    if (!hit) break
    picked.push(hit)
    usedIds.add(hit.id)
    usedSchools.add(hit.school)
  }

  /* 路线保底校验：稀有度没落在保底档 → 换掉最后一张（与旧通道同口径） */
  if (rarityFloor) {
    const ok =
      rarityFloor === "epic"
        ? picked.some((relic) => relic.rarity === "epic")
        : picked.some((relic) => relic.rarity !== "common")
    if (!ok) {
      const wanted = rarityFloor
      const fresh = effectiveBase.filter(
        (relic) => relic.rarity === wanted && !ownedIds.has(relic.id) && !usedIds.has(relic.id),
      )
      const fallback =
        fresh.length > 0 ? fresh : effectiveBase.filter((relic) => relic.rarity === wanted)
      let lucky = fallback.length > 0 ? pick(rng, fallback) : undefined
      if (!lucky && wanted === "epic") {
        const rareFallback = effectiveBase.filter(
          (relic) => relic.rarity === "rare" && !ownedIds.has(relic.id),
        )
        lucky = rareFallback.length > 0 ? pick(rng, rareFallback) : undefined
      }
      if (lucky) {
        if (picked.length > 0) picked[picked.length - 1] = lucky
        else picked.push(lucky)
      }
    }
  }
  return picked
}

/* ---------------- Boss 技能序列（seed-system.md 八） ---------------- */

/** 全部 Boss 技能定义字典（id → 定义），阶段表由种子从权重池抽取组装 */
export const BOSS_SKILL_DEFS: Record<string, BossSkill> = {}

Object.values(BOSS_AD_SKILLS).forEach((phase) =>
  phase.forEach((skill) => {
    BOSS_SKILL_DEFS[skill.id] = skill
  }),
)
Object.values(BOSS_CRASH_SKILLS).forEach((phase) =>
  phase.forEach((skill) => {
    BOSS_SKILL_DEFS[skill.id] = skill
  }),
)

/**
 * 技能池权重（对齐用户定稿表：轰炸 30 / 强驻观看 25 / 倒计时 25 / 全屏闪烁 20）。
 * 表里的「倒计时」引擎侧由两条现有技能承担：强制观看本身就是 20 秒倒计时逼看，
 * 跳转劫持补一个「限时不点就中招」的机制——两者合占倒计时位（redirect 取 25），
 * 弹窗回响以 10 的低权重保留作多样性彩蛋。
 */
const AD_SKILL_WEIGHTS: { item: string; weight: number }[] = [
  { item: "ad-bomb", weight: 30 },
  { item: "ad-force-watch", weight: 25 },
  { item: "ad-redirect", weight: 25 },
  { item: "ad-flash", weight: 20 },
  { item: "ad-echo", weight: 10 },
  /* 浏览器特性包 v1：分身窗口（机制重、给中等权重，轮转随种子可复现） */
  { item: "ad-tabsync", weight: 15 },
]

const CRASH_SKILL_WEIGHTS: { item: string; weight: number }[] = [
  { item: "crash-rain", weight: 25 },
  { item: "crash-retarget", weight: 25 },
  { item: "crash-clear", weight: 20 },
  { item: "crash-pulse", weight: 20 },
  { item: "crash-final", weight: 10 },
]

const CRASH_FINAL = "crash-final"

/** 生成某 Boss 的阶段技能表（流键 boss:{kind}:{阶段}；崩溃第三阶段必含最终崩溃） */
export function genBossSkills(
  seed: string,
  kind: "ad" | "crash",
): Record<number, BossSkill[]> {
  const out: Record<number, BossSkill[]> = {}
  const phases = kind === "ad" ? 2 : 3
  const weights = kind === "ad" ? AD_SKILL_WEIGHTS : CRASH_SKILL_WEIGHTS
  for (let phase = 1; phase <= phases; phase += 1) {
    const rng = streamFor(seed, `boss:${kind}:${phase}`)
    const isFinalPhase = kind === "crash" && phase === 3
    let chosen: string[]
    if (isFinalPhase) {
      const rest = pickWeightedMany(
        rng,
        weights.filter((w) => w.item !== CRASH_FINAL),
        2,
      )
      chosen = [CRASH_FINAL, ...rest]
      /* 顺序也随种子 */
      chosen = shuffleSeeded(rng, chosen)
    } else {
      chosen = pickWeightedMany(rng, weights, 3)
    }
    out[phase] = chosen
      .map((id) => BOSS_SKILL_DEFS[id])
      .filter(Boolean)
  }
  return out
}

/* ---------------- 未知区域事件 / 祭坛 / 诅咒 ---------------- */

/** crisis = 代价事件（fun-pack.md 三）：没有正确答案的三选一 */
export type UnknownEvent =
  | "shop"
  | "altar"
  | "chest"
  | "trap"
  | "elite"
  | "crisis"
  | "empty"

/** 未知区域事件 roll：20 / 18 / 15 / 12 / 12 / 19 / 4（fun-pack.md 三调档） */
export function genUnknownEvent(seed: string, floor: number): UnknownEvent {
  const rng = streamFor(seed, `event:${floor}`)
  return pickWeighted<UnknownEvent>(rng, [
    { item: "shop", weight: 20 },
    { item: "altar", weight: 18 },
    { item: "chest", weight: 15 },
    { item: "trap", weight: 12 },
    { item: "elite", weight: 12 },
    { item: "crisis", weight: 19 },
    { item: "empty", weight: 4 },
  ])
}

/** 代价事件 roll：5 个事件等权，独立子流不与 genUnknownEvent 串流 */
export function genCrisis(seed: string, floor: number): CrisisId {
  const rng = streamFor(seed, `event:${floor}:crisis`)
  return pick(rng, CRISIS_ORDER)
}

export type AltarType = "relic" | "life" | "memory" | "curse"

/** 祭坛类型 roll：词条 40 / 生命 25 / 内存 20 / 诅咒 15 */
export function genAltarType(seed: string, floor: number): AltarType {
  const rng = streamFor(seed, `altar:${floor}`)
  return pickWeighted<AltarType>(rng, [
    { item: "relic", weight: 40 },
    { item: "life", weight: 25 },
    { item: "memory", weight: 20 },
    { item: "curse", weight: 15 },
  ])
}

/** 诅咒祭坛给的随机诅咒 */
export function genCurse(seed: string, floor: number): CurseId {
  const rng = streamFor(seed, `event:${floor}:curse`)
  return pick(
    rng,
    Object.keys(CURSE_DEFS) as CurseId[],
  )
}
