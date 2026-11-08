import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import {
  AD_SHIELD_PAUSE_MS,
  AD_SHIELD_REGEN_AMOUNT,
  AD_SHIELD_REGEN_MS,
  AD_SURVIVOR_HASTE,
  BOND_DEFS,
  BOSS_AD_BUTTONS,
  BOSS_AD_BUTTON_HP,
  BOSS_AD_BUTTON_LABELS,
  BOSS_AD_PASSIVE,
  BOSS_AD_URGENT_MS,
  BOSS_CRASH_ATTACK_MULT,
  BOSS_CRASH_DODGE_BONUS,
  BOSS_CRASH_PHASE2_AT,
  BOSS_CRASH_PHASE3_AT,
  BOSS_CRASH_PASSIVE,
  BOSS_CRASH_PHASE_LABEL,
  BOSS_CRASH_POPUP_DAMAGE,
  BOSS_CRASH_SPEED_CUT,
  CAPTCHA_BREAK_DAMAGE_MULT,
  CAPTCHA_BREAK_MS,
  CAPTCHA_CHALLENGE_INTERVAL_MS,
  CAPTCHA_CHALLENGE_WINDOW_MS,
  CAPTCHA_FAIL_ATTACK_MULT,
  CAPTCHA_OPTION_COUNT,
  CAPTCHA_SYMBOLS,
  CHARACTER_COMBAT,
  DODGE_WINDOW_MS,
  DUNGEON_CHARACTERS,
  DUNGEON_RUN_FLOORS,
  ELITE_ATTACK_MULT,
  ELITE_HP_MULT,
  ENEMY_DEFS,
  HIDDEN_BONUS_MULT,
  HIDDEN_DURATION_MS,
  HIDDEN_INTERVAL_MS,
  IDLE_HEAL_AFTER_MS,
  LEAK_LOW_HP_RATIO,
  LEAK_LOW_HP_REGEN_MULT,
  LEAK_PAUSE_MS,
  LEAK_REGEN_AMOUNT,
  LEAK_REGEN_MS,
  LEAK_SHIELD_REFRESH_AMOUNT,
  LEAK_SHIELD_REFRESH_MS,
  MAX_RELIC_SLOTS,
  MEMORY_ABUNDANT_HASTE_MULT,
  MEMORY_ABUNDANT_RATIO,
  MEMORY_COMBO_CLICK_COST,
  MEMORY_DRAG_CLOSE_COST,
  MEMORY_DODGE_COST,
  MEMORY_EXHAUSTED_RATIO,
  MEMORY_EXHAUSTED_SPEED_MULT,
  MEMORY_KILL_BIG_BOSS,
  MEMORY_KILL_ELITE,
  MEMORY_KILL_MINI_BOSS,
  MEMORY_KILL_NORMAL,
  MEMORY_MAX_CAP,
  MEMORY_MIN_CAP,
  MEMORY_SHARD_GAIN,
  MEMORY_STALL_CRASH_AT_MS,
  MEMORY_STALL_CRASH_LOCK_MS,
  MEMORY_STALL_DODGE_CD_AT_MS,
  MEMORY_STALL_DODGE_CD_BONUS_MS,
  MEMORY_STALL_DRAIN_AT_MS,
  MEMORY_STALL_DRAIN_HP,
  MEMORY_STALL_HASTE_AT_MS,
  MEMORY_STALL_HASTE_MULT,
  MEMORY_TENSE_DODGE_CD_BONUS_MS,
  MEMORY_TENSE_RATIO,
  MEMORY_TENSE_SPEED_MULT,
  memoryBaseMaxForFloor,
  memoryEfficiencyOf,
  OVERTIME_ATTACK_MULT,
  PAID_REROLL_COST,
  PAID_REVIVE_COST,
  PAID_REVIVE_HP_RATIO,
  RELIC_POOL,
  RELIC_SKIP_HEAL,
  SKIP_HEAL_UPGRADE_AMOUNT,
  SKIP_HEAL_UPGRADE_COST,
  TELEGRAPH_DEFAULT_MS,
  clearBonusForDailyClears,
  CRISIS_DEFS,
  HIDDEN_FLOOR_DEFS,
  RELIC_CONFLICTS,
  findCharacter,
  pickEnemyLine,
  getActiveBondDefs,
  getCharacterSkins,
  getDailyDateKey,
  getDailyMeta,
  getDailySeed,
  getFloorConfig,
  getRandomSeed,
  getRelicSchoolCounts,
  rollEliteShards,
  rollFloorKillShards,
  bossLineKey,
  findBossLine,
  isCharacterId,
  isCharacterVisible,
  findRelic,
  BUILD_IMPORT_MAX,
  parseBuildCode,
  scaleCombatForFloor,
  FLOOR_CLEAR_HEAL,
  FLOOR_TIME_LIMIT_MS,
  CURSE_DEFS,
  ROUTE_TYPES,
  type BossLineEntry,
  type BossSkill,
  type ConflictId,
  type CrisisId,
  type CurseId,
  type HiddenFloorId,
  type DungeonCharacter,
  type DungeonRunRecord,
  type EnemyKind,
  type FloorEnemySpec,
  type RouteEntry,
  type RouteId,
  type FloorConfig,
  type Relic,
  type RelicEffect,
  type RelicRarity,
  type RelicSchoolKey,
} from "@/lib/dungeonData"
import {
  ENEMY_TAG_DEFS,
  genAltarType,
  genBossSkills,
  genCrisis,
  genCurse,
  genRelicChoices,
  genRouteOptions,
  genUnknownEvent,
  type AltarType,
  type DailyPools,
  type RouteChoiceContext,
} from "@/lib/seedGen"
import { float0911, hashString, parseSeedCode, pick, rollInt, streamFor } from "@/lib/rng"
import { bumpClearsToday } from "@/lib/economy"
import { fetchDailyGhost, type DailyGhost } from "@/lib/dailyScore"
import {
  bumpDailyRun,
  dropJunkFiles,
  getEquippedSkin,
  loadDungeonSave,
  normalizePlayMode,
  recordDefeatedBosses,
  recordDefeatedEnemies,
  recordSeenRelics,
  writeDungeonSave,
  type PlayMode,
} from "@/lib/dungeonSave"
import {
  playComboStackSfx,
  playSfx,
  startChargeTone,
  stopChargeTone,
} from "@/lib/sfx"

const TICK_MS = 100
const POP_LIFETIME_MS = 800
const HIT_FLASH_MS = 220
const CLOSE_ANIM_MS = 520
const BASE_CHOICE_COUNT = 3
const BASE_REROLL_PER_FLOOR = 1

/* 本局临时碎片掉落见 dungeonData：普通随层数档 / 精英 8~12 / Boss 20、40，M2 词条仍乘算 */
const SHARD_PULSE_MS = 420

/* 商店定价（10 件固定货架见 SHOP_CATALOG） */
const SHOP_HEAL_AMOUNT = 30
const SHOP_MEMORY_AMOUNT = 10
const SHOP_REROLL_GAIN = 1
const SHOP_MEMCAP_GAIN = 2
const SHOP_SLOT_GAIN = 1

/* 祭坛代价 */
const ALTAR_BLOOD_RATIO = 0.3
const CURSE_ATTACK_MULT = 1.3

/* 角色被动 / 主动技时长与倍率 */
/** 标签刺客「无痕切换」：闪避后攻速 +25%，持续 2 秒 */
const DODGE_HASTE_MS = 2000
const DODGE_HASTE_MULT = 0.8
/** 无痕游侠「无痕步」：1.5 秒无敌 + 攻速 +30% */
const RANGER_STEP_MS = 1500
const RANGER_STEP_MULT = 1 / 1.3
/** 脚本战士「事件连击」：2 秒内自动攻击变双重打击 */
const DOUBLE_STRIKE_MS = 2000
/** 脚本战士「监听叠加」：满 5 层下次攻击必暴 */
const LISTEN_STACKS_MAX = 5
/** 缓存法师「缓存护盾」：+10 护盾 */
const MAGE_SHIELD_GAIN = 10
/** 缓存法师：护盾存在时攻击 +15% */
const MAGE_SHIELD_ATTACK_MULT = 1.15
/** 饼干窃贼被动「饼罐子」：每关掉一个敌人汲取 3 点生命 */
const COOKIE_HEAL_ON_KILL = 3
/** 饼干窃贼主动技「投掷饼干」：6 点伤害并汲取 6 点生命 */
const COOKIE_ACTIVE_DAMAGE = 6
const COOKIE_ACTIVE_HEAL = 6
/** 工作僧侣被动「后台同步」：每 8 次普通攻击追加一次固定 8 点伤害（不吃暴击） */
const SYNC_STACKS_MAX = 8
const SYNC_STRIKE_DAMAGE = 8
/** 工作僧侣主动技「多线程执行」：3 秒攻速 +60% */
const MULTITHREAD_MS = 3000
const MULTITHREAD_HASTE_MULT = 1.6
/** 内核之影被动「根权限」：血量低于 40% 上限时攻速 +30% */
const ROOT_HP_RATIO = 0.4
const ROOT_HASTE_MULT = 1.3
/** 内核之影主动技「任务管理器」：冻结全场敌人 2 秒 */
const FREEZE_MS = 2000

/* ---------------- 批次一·关键帧交互（手动切锁 / 滑动闪避 / 蓄力 / 点击连击） ---------------- */
/** 切换锁定目标防误触窗口：点击与 ←→ 共用 */
const LOCK_SWITCH_MS = 500
/** 完美闪避判据：任一敌人前摇最后这个毫秒数内闪避 */
const PERFECT_DODGE_WINDOW_MS = 200
/** 完美闪避回血 */
const PERFECT_DODGE_HEAL = 3
/** 完美闪避白闪持续时间（低配不显示全屏白闪，只留数值反馈） */
const PERFECT_FLASH_MS = 180
/** 点击连击：每层攻速加成 / 无点击清零时长 / 上限 / 每秒最多有效点击 */
const CLICK_COMBO_SPEED_PER = 0.05
const CLICK_COMBO_DECAY_MS = 2000
const CLICK_COMBO_MAX = 10
/** 持有「事件监听」词条时点击连击上限 +5 */
const CLICK_COMBO_MAX_BOOSTED = 15
const CLICK_COMBO_EVENT_LISTENER_ID = "event-listener"
const CLICK_TAP_MAX_PER_SEC = 5
/** 手动点击的固定追加伤害（不吃暴击、不触发命中词条） */
const CLICK_TAP_DAMAGE = 1
/** 主动技长按蓄力：达到这个时长才算开始蓄力，否则视为点按立即释放 */
const CHARGE_MIN_MS = 300
/** 蓄力封顶时长：0~2 秒伤害系数 100%→200% 线性 */
const CHARGE_MAX_MS = 2000

/* ---------------- 批次二·战场点按型机制（拖拽关闭 / 弹窗 × / 验证码强化 / 碎片拾取） ---------------- */
/** 拖拽关闭：血量低于这个比例才出标记 */
const DRAG_CLOSE_HP_RATIO = 0.3
/** 弹窗 × 的可点窗口时长 */
const POPUP_X_WINDOW_MS = 1500
/** 只有这几层的弹窗敌人右上角出 ×（Boss 阶段 1 生成的另算） */
const POPUP_X_FLOORS = [1, 2]
/* ---------------- 弹窗干扰包（popup-jam-pack.md）：糊屏弹窗 ---------------- */
/** 弹窗敌人上场后第一个糊屏弹窗的延迟 */
const POPUP_JAM_FIRST_MS = 3500
/** 同一只弹窗敌人再吐糊屏弹窗的间隔 */
const POPUP_JAM_INTERVAL_MS = 9000
/** 糊屏弹窗从糊上到爆炸的时长 */
const POPUP_JAM_EXPLODE_MS = 8000
/** 点几下 × 能关掉（恶意变体的 × 槽位也算它：slot = (TAPS − xLeft) % 6） */
export const POPUP_JAM_X_TAPS = 3
/** 甩出屏幕的碎片奖励 */
const POPUP_JAM_ESCAPE_SHARDS = 2
/** 到点爆炸的伤害（陷阱类不致死，最低 1 血；休闲免罚） */
const POPUP_JAM_BURST_DMG = 8
/* ---------------- UI 武器包（ui-arsenal-pack.md） ---------------- */
/** 甩弹窗砸敌人的固定伤害（弹窗敌人吃双倍的「以彼之道」） */
const JAM_THROW_DMG = 12
/* ---------------- 拟物化战斗包（skeuo-boss-pack.md） ---------------- */
/** 广告 Boss 本体弱点 × 命中的固定伤害（固定值通道，同 JAM_THROW_DMG 口径，不吃攻击面板） */
const AD_WEAK_DMG = 15
/** 弱点 × 命中后的冷却 */
const AD_WEAK_CD_MS = 1200
/** 弱点 × 在本体血条四周的锚点数（每命中一次进位换位置） */
const AD_WEAK_SLOTS = 6
/** 糊屏弹窗是恶意变体的概率（%），按 seed:jam:层:弹窗id 哈希判定，确定性可复现 */
const JAM_MALICE_CHANCE = 40
/** 恶意弹窗假「立即领取」上当后爆炸倒计时的延长 */
const JAM_TRAP_EXT_MS = 2000
/* ---------------- 浏览器特性包 v1（browser-powers-pack.md 一）：分身窗口 ---------------- */
/** 分身标签读条时长：期间主战场照常跑，不切过去就读满 */
export const CLONE_CAST_MS = 7000
/** 打断读条需要的连点数 */
export const CLONE_TAPS = 3
/** 打断成功后 Boss 眩晕时长（走既有 bossStunUntil 通道） */
export const CLONE_STUN_MS = 2500
/** 读满的跨窗口大招伤害：不可闪避、可致死，休闲走 qtePenaltyMult 归零 */
export const CLONE_BURST_DMG = 20
/** 地址栏「清理缓存」的内存门票 */
const CACHE_CLEAR_COST = 3
/** 碎片点：同屏最多存在数 / 不点自动入账时长 / 自动入账比例（向下取整） */
const SHARD_DOT_MAX = 5
const SHARD_DOT_LIFE_MS = 3000
const SHARD_AUTO_CREDIT_RATIO = 0.8

/* ---------------- 词条手动触发（v4 起只剩节流 / 离线模式两个通道） ---------------- */
/** 离线模式·主动触发无敌时长 */
const OFFLINE_IMMUNE_MS = 3000
/** 离线模式·触发后的冷却（v4：不再按层限次，改 10 秒冷却） */
const OFFLINE_READY_CD_MS = 10000
/** 节流·手动激活后的免疫时长（v3 的 5 秒触发冷却已删，批次 B 改资源层叠层） */
const THROTTLE_IMMUNE_MS = 2000

/* ---------------- 机制型词条重设计 v4 · 批次 B 数值（relic-redesign.md） ---------------- */
/** C7 暗黑模式：全体敌人血量倍率（含后续生成的小兵与 Boss 血量） */
const DARK_HP_MULT = 0.5
/** S5 节流：积 1 层所需毫秒 / 层数上限（HUD 显层数） */
const THROTTLE_STACK_MS = 5000
const THROTTLE_STACK_MAX = 3
/** S4 防抖：受击后的三连窗口时长 / 三连一次的内存消耗 */
const DEBOUNCE_WINDOW_MS = 1000
const TRIPLE_MEMORY_COST = 2
/** C2 z-index 残影诱饵：持续时间 / 敌人打错目标概率（trySpendMemory(1) 已在闪避成功处扣） */
const DECOY_MS = 2000
const DECOY_MISS_CHANCE = 0.6
/** S6 Promise 链：链式暴击的内存消耗 / 每人伤害倍率（阈值 = mods.chainCrit = 5） */
const CHAIN_CRIT_MEMORY_COST = 3
const CHAIN_CRIT_RATIO = 1.5
/** C3 媒体查询·响应式重构：内存消耗 / 回血量（每层限 1 次） */
const REFACTOR_MEMORY_COST = 3
const REFACTOR_HEAL = 20
/** C5 伪元素·护盾分裂：内存消耗 / 飞行时长 / 小护盾爆炸伤害 */
const SPLIT_MEMORY_COST = 2
const MINI_SHIELD_FLY_MS = 600
/** 低配：不播飞行动画，300ms 后直接结算爆炸 */
const MINI_SHIELD_LOW_SPEC_MS = 300
/** 小护盾到达目标时的爆炸伤害 */
const MINI_SHIELD_DAMAGE = 8
/** S7 异步觉醒：内存消耗（不足则正常释放、不吃翻倍不加阻塞） */
const ASYNC_AWAKEN_MEMORY_COST = 4
/** S3 闭包：主动技后残像的延时毫秒 */
const CLOSURE_ECHO_MS = 1500
/** 可主动触发的词条 id（词条栏据此渲染可触发角标） */
const MANUAL_TRIGGER_RELICS = ["throttle", "offline-mode"] as const

/* ---------------- 机制型词条重设计 v4 · 批次 C 数值（relic-redesign.md B·N/M/G 与 C 节） ---------------- */
/** N2 缓存命中：同一目标连续攻击的第 N 击必定暴击（按 4 的倍数循环，切目标重计） */
const CACHE_HIT_EVERY = 4
/** N6 超时重试：每次重试的内存消耗（金色按钮独立通道，不占免费/付费刷新次数） */
const TIMEOUT_RETRY_MEMORY_COST = 3
/** G2 热更新：每局 1 次免费手动刷新的内存消耗 */
const HOT_RELOAD_MEMORY_COST = 2
/** M7 离线模式：触发的内存消耗（无敌 3 秒 / 禁攻 / 10 秒 CD 沿用上方 v3 常量，与规格一致） */
const OFFLINE_MEMORY_COST = 3
/** M6 Service Worker 免死：触发的内存消耗（不足则不触发免死） */
const DEATH_WARD_MEMORY_COST = 4
/** M1 本地存储：存储池封顶值 */
const STORAGE_POOL_MAX = 20
/** combo·护盾流：小护盾爆炸伤害倍率（8 → 16，效果点在 advance 的小护盾爆炸处） */
const COMBO_SHIELD_MINI_MULT = 2
/** combo·内存流：击杀额外内存（效果点在 buildMods 并入 killMemoryGain；v2 起回复通道已废） */
const COMBO_MEMORY_KILL_GAIN = 1
/** combo·经济流：碎片获取额外倍率（效果点在 buildMods 并入 fragmentMult） */
const COMBO_ECONOMY_FRAGMENT_BONUS = 0.5
/** combo·斩杀流：链式暴击内存耗 3 → 1（效果点在 playerAttack 的链式暴击处） */
const COMBO_EXECUTE_CHAIN_COST = 1
/** combo·保命流：断点续传复活概率 0.3 → 0.6（效果点在 buildMods 的 reviveChance） */
const COMBO_GUARD_REVIVE_CHANCE = 0.6
/** combo·暗黑流：暴击对血量低于该比例的普通敌人直接斩杀（效果点在 hitEnemy） */
const COMBO_DARK_EXECUTE_RATIO = 0.15
/** combo·穿透流：穿透位伤害 0.3 → 0.5（免内存效果同条，效果点在 buildMods + playerAttack） */
const COMBO_PIERCE_RATIO = 0.5

/* ---------------- 批次二收尾·Boss QTE ---------------- */
/** 强制观看 QTE：窗口与需要点次数 */
const QTE_WATCH_WINDOW_MS = 1500
const QTE_WATCH_TAPS = 5
/** 强制观看成功：Boss 眩晕时长（技能蓄力 / 出手暂停） */
const QTE_WATCH_STUN_MS = 2000
/** 强制观看失败：扣血 */
const QTE_WATCH_FAIL_DAMAGE = 10
/** 强制跳转 QTE：窗口与需要左滑次数 */
const QTE_REDIRECT_WINDOW_MS = 1500
const QTE_REDIRECT_SWIPES = 3
/** 强制跳转失败：攻速减半时长 */
const QTE_REDIRECT_CUT_MS = 3000
/** 弹窗雨 QTE：窗口（弹窗存续 = 整个窗口）、需点 × 数、成功回血、失败攻击下降与持续 */
const QTE_RAIN_WINDOW_MS = 2000
const QTE_RAIN_CLICKS = 3
const QTE_RAIN_HEAL = 5
const QTE_RAIN_FAIL_CUT = 0.2
const QTE_RAIN_FAIL_CUT_MS = 3000
/** 最终崩溃 QTE：长按时长、失败扣血 */
const QTE_CRASH_HOLD_MS = 2000
const QTE_CRASH_FAIL_DAMAGE = 25
/** 硬核模式失败惩罚倍率与附加加罚生效的最深层数 */
const HARDCORE_PENALTY_MULT = 1.5
const HARDCORE_EXTRA_FROM_FLOOR = 4
/** 四个 QTE 技能 id（结算路径据此改接 QTE 结果，其余技能不动） */
const QTE_SKILL_WATCH = "ad-force-watch"
const QTE_SKILL_REDIRECT = "ad-redirect"
const QTE_SKILL_RAIN = "crash-rain"
const QTE_SKILL_CRASH = "crash-final"

/** 浮层可能落地的层：第 2 层起，避开第 4 / 8 层 Boss 层 */

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

export type Phase = "fighting" | "overlay" | "relic" | "route" | "dead" | "victory"

/** 局内浮层：商店 / 祭坛 / 回收站，同一时刻只会开一个 */
export type OverlayKind =
  | "none"
  | "shop"
  | "altar"
  | "recycle"
  | "mirror"
  | "crisis"
  | "hidden"
  | "taskmgr"
  /* 核心体验包 v2（core-experience-pack2.md）：援军三选一 / 缓存电池盒 */
  | "allyPick"
  | "cache"

/* 路线系统商店：10 件固定货架（dungeon-route.md 五） */
export type ShopItemKind =
  | "relic-common"
  | "relic-rare"
  | "relic-epic"
  | "heal"
  | "memory"
  | "reroll"
  | "remove"
  | "memcap"
  | "slot"
  | "seed"
  | "defrag"

export type ShopItem = {
  id: string
  kind: ShopItemKind
  title: string
  desc: string
  price: number
  /** 词条商品才有 */
  relic: Relic | null
  bought: boolean
}

/** 祭坛的代价：血债 / 诅咒 / 碎片（生命祭坛） / 生命（内存祭坛） */
export type AltarCost = "blood" | "curse" | "shard" | "hp"

/** 祭坛四型的献祭与回报常量（seed-system.md 六） */
const ALTAR_LIFE_SHARD_COST = 15
const ALTAR_LIFE_HEAL_AMOUNT = 30
const ALTAR_MEMORY_HP_COST = 20
const ALTAR_MEMORY_CAP_GAIN = 2

export type PopKind =
  | "hit"
  | "crit"
  | "shield"
  | "dodge"
  | "heal"
  | "hurt"
  | "immune"
  | "execute"
  | "shard"
  /* 批次 B 新增（六色六制的扩展，色板见各 View 的 popTone）：
     - bounce 弹射=电光紫（sys-style，与「弹射」词条机制语义无关，只是配色扩展）
     - decoy 残影诱饵=次文字灰（规范·闪避灰同族）
     - refactor 响应式重构=电光紫（sys-style） */
  | "bounce"
  | "decoy"
  | "refactor"
  /* 拟物化战斗包（skeuo-boss-pack.md 一）：广告 Boss 弱点 × 命中=金色放大「弱」，
     与 execute 紫同级的专属通道 */
  | "weak"

export type DamagePop = {
  id: number
  kind: PopKind
  amount: number
  crit: boolean
  at: number
  x: number
}

/* ---- 故障手感包（glitch-feel-pack.md）：角色攻击轨迹 ---- */
export type AttackFxKind =
  /** 标签刺客：利落斜斩线横切目标卡 */
  | "slash"
  /** 缓存法师：以自身为中心的能量脉冲环 */
  | "pulse"
  /** 脚本战士：金色光柱劈落 */
  | "strike"
  /** 无痕游侠：横贯卡片的弹道火线 */
  | "tracer"
  /** 饼干窃贼：洒一排碎屑 */
  | "crumb"
  /** 工作僧侣：边框同步环扩散 */
  | "sync"
  /** 内核之影：暗影闪落 */
  | "shade"

export type AttackFx = {
  id: number
  kind: AttackFxKind
  /** null = 以玩家自身为中心（法师脉冲）；字符串 = 目标敌人 uid */
  uid: string | null
  at: number
  /** 暴击 / 斩杀的那一条：更粗、带外发光 */
  big: boolean
}

/** 攻击特效存续时长（View 按 now 过滤，过期随 tick 剪枝） */
const ATTACK_FX_LIFE_MS = 450
/** 每角色的攻击轨迹（打击辨识度） */
const ATTACK_FX_BY_CHARACTER: Record<string, AttackFxKind> = {
  "tab-assassin": "slash",
  "cache-mage": "pulse",
  "script-warrior": "strike",
  "incognito-ranger": "tracer",
  "cookie-thief": "crumb",
  "worker-monk": "sync",
  "kernel-shade": "shade",
}
/** 顿帧时长（glitch-feel-pack.md 一）：暴击 100ms / 斩杀 140ms；两次之间最少隔 400ms */
const HIT_STOP_CRIT_MS = 100
const HIT_STOP_KILL_MS = 140
const HIT_STOP_GAP_MS = 400
/** 内存错位（glitch-feel-pack.md 四）：时长与碎片代价 */
const MEM_FAKE_MS = 6000
const MEM_FAKE_FRAG_COST = 2

/** 碎片点：击杀后掉在标签条里、可点击全额入账的金色小圆点 */
export type ShardDot = {
  id: number
  /** 横向位置（相对标签条 0~100 百分比） */
  x: number
  amount: number
  /** 不点击的自动入账时间 */
  expireAt: number
  /** 404 假奖励（fun-pack.md 一·骗局B）：点它扣血，到期静默消失 */
  fake?: boolean
}

/** 页面故障三型（fun-pack.md 二）：反色 / 乱码 / 按钮漂移 */
export type GlitchKind = "invert" | "scramble" | "drift"

/** 假按钮：战斗中浮在战斗区的仿技能按钮，点了扣血（fun-pack.md 二） */
export type FakeButton = { id: number; xPct: number; yPct: number; until: number }

/** 糊屏弹窗（popup-jam-pack.md 一）：物理糊在主动技按钮上的垃圾窗口 */
export type ScreenJam = {
  id: number
  /** 还要点几下 × 才关掉 */
  xLeft: number
  spawnAt: number
  explodeAt: number
  /** 拟物化战斗包（skeuo-boss-pack.md 二）：恶意变体——× 瞬移 + 假按钮是陷阱 */
  malicious?: boolean
  /** 假「立即领取」本窗已骗过（每窗最多骗一次，缺省 = 没骗过） */
  claimTrapUsed?: boolean
}

/** HUD 顶部横幅：拖拽 / × 关闭、验证码成败等一次性短提示（与教学浮字独立） */
export type Banner = { text: string; seq: number }

export type BossButton = {
  id: string
  label: string
  maxHp: number
  hp: number
  closed: boolean
}

/** 第 6 层验证码：屏幕中央浮出 3 个图案，1.5 秒内点中高亮的那个 */
export type CaptchaChallenge = {
  options: string[]
  answer: string
  startedAt: number
  expiresAt: number
  result: "pending" | "hit" | "miss"
  resultUntil: number
}

/** Boss 正在蓄力的技能（前摇期间给玩家红圈 / 警告） */
export type BossPendingSkill = {
  id: string
  name: string
  desc: string
  counter: string
  telegraphUntil: number
  dodgeable: boolean
  damage: number
  clickLabel: string | null
  clickWindowMs: number
}

/** Boss 技能的冷却计时 */
export type BossSkillRuntime = {
  id: string
  nextReadyAt: number
}

/** Boss 阶段状态（小 Boss 用 bodyHp，大 Boss 用血量阈值推阶段） */
export type BossState = {
  phase: number
  bodyHp: number
  bodyMaxHp: number
  /** 阶段 2 起：玩家攻速减半 */
  speedCut: boolean
  /** 阶段 3 起：敌人攻击翻倍 */
  attackDouble: boolean
  /** 阶段 3 起：玩家闪避 +20% */
  dodgeBonus: number
  /** 技能表按阶段重建，记下当前装的是哪一阶段 */
  skillsPhase: number
  /** 本局种子的阶段技能序列（进层时烘焙；null = 旧档兜底，按默认表跑） */
  seq: Record<number, BossSkill[]> | null
  skills: BossSkillRuntime[]
  /** 正在前摇的技能 */
  pending: BossPendingSkill | null
}

/** Boss 强制观看：屏幕变暗后出现的限时跳过按钮 */
export type BossClickPrompt = {
  label: string
  skillId: string
  expiresAt: number
}

/** Boss 当前正在说的那句台词（只做气氛，不进战斗日志、不参与任何数值） */
export type BossLine = {
  /** 去重用：同一句已经在显示时不再重复设置 */
  key: string
  text: string
  /** 每次换句 +1，View 拿它当 key 触发淡入 */
  seq: number
}

/** Boss QTE 的操作类型 */
export type QteKind = "tap" | "swipe" | "clicks" | "press"

/** 弹窗雨 QTE 里散落的带 × 弹窗（随机位置，点掉计进度） */
export type QtePopup = { id: number; x: number; y: number }

/**
 * 一次 Boss QTE 的进行状态（放在 RunState 里持久化，View 据此渲染中央大字提示）。
 * 权威倒计时走 React 侧独立墙钟（rAF），这里只存离散进度与结算所需的数据。
 */
export type QteState = {
  kind: QteKind
  skillId: string
  /** 中央大字提示，如「快速点击！」 */
  title: string
  /** 目标次数（press 类型表示长按毫秒） */
  target: number
  /** tap / swipe / clicks 已完成的次数 */
  progress: number
  /** 本 QTE 总窗口（毫秒），倒计时环按它画 */
  totalMs: number
  /** 弹窗雨专用：散落的 × */
  popups?: QtePopup[]
  /** 失败时的惩罚伤害（crash-final / watch 用），casual 下不结算 */
  failDamage: number
  /** press 专用：玩家当前正按住（进度环由 React 侧墙钟驱动，这里只标记按住状态） */
  pressing?: boolean
}

export type EnemyInstance = {
  uid: string
  defId: string
  displayName: string
  trait: string
  kind: EnemyKind
  maxHp: number
  hp: number
  attack: number
  attackIntervalMs: number
  defense: number
  /** 站位序号（-1 = Boss 技能召唤出来的小怪） */
  slot: number
  /** 出手节奏倍率（第 3 层左侧倒下后右侧 +20%） */
  intervalMult: number
  /** 到点开始前摇（红圈警告） */
  nextAttackAt: number
  /** 前摇结束时间，0 = 没在蓄力 */
  telegraphUntil: number
  /** 前摇时长（毫秒） */
  telegraphMs: number
  /** 这一击的额外倍率（隐身结束 +50% / 验证码点错 +100%） */
  pendingAttackMult: number
  /** 隐身刚结束，下一击要加成的标记 */
  hiddenBonusPending: boolean
  hitAt: number
  closing: boolean
  closedAt: number
  shield: number
  /** 补盾 / 回血时的停手截止时间 */
  pausedUntil: number
  hiddenUntil: number
  regenEveryMs: number
  regenAmount: number
  regenNextAt: number
  /** 刚回完血：身体变绿 */
  regenFlashUntil: number
  shieldRegenEveryMs: number
  shieldRegenAmount: number
  shieldRegenNextAt: number
  /** 验证码敌人：破防前只吃两成伤害 */
  guarded: boolean
  /** 破防截止时间（点对图案后 3 秒，受伤 +50%） */
  brokenUntil: number
  /** Boss 技能召唤出来的小怪 */
  minion: boolean
  /** 精英敌人：金色徽标、血量 1.8×、攻击 1.25×、专属 8~12 掉落 */
  elite: boolean
  spawnSkillId: string | null
  /** 击杀这只小怪额外掉多少碎片 */
  killShards: number
  /** 这只小怪活着时玩家攻击下降的比例 */
  attackCut: number
  buttons: BossButton[]
  boss: BossState | null
  /** 弹窗 × 可点窗口截止（now + 1.5 秒），0 = 不显示 × */
  popupXUntil: number
  /** C4 过渡动画：被玩家攻击挂上的「攻速减半」截止（走 enemyInterval 通道），0 = 无 */
  attackSlowUntil: number
  /** 验证码迷宫：点错过一次，攻击永久 ×2（防叠爆） */
  enraged: boolean
  /** 时间裂隙：这只敌人到点未死则反噬玩家，0 = 非裂隙层 */
  riftDeadline: number
  /** 种子生成的标签（展示用；机制已在进层 / baked 阶段处理） */
  tags: string[]
  /* ---- 深化包（deepening-pack.md 三）：病毒与变异，全可选 ---- */
  /** 这只敌人携带病毒标签（可花 2 内存引爆） */
  virusTag?: boolean
  /** 已被病毒感染的标签（效果反转） */
  mutatedTagIds?: string[]
  /** 变异带来的受伤倍率（默认 1，所有普通扣血入口统一乘） */
  incomingDamageMult?: number
  /** regen 变异：下一次自噬掉血时刻（每 2 秒掉 5% 上限血） */
  mutRegenNextAt?: number
  /** leak 变异：下一次漏碎掉血时刻（每 3 秒掉 3 血） */
  mutLeakNextAt?: number
  /* ---- 趣味包 v1（fun-pack.md 一）：台词与骗局，全是气氛字段 ---- */
  /** 当前气泡台词（now < lineUntil 时 View 显示） */
  lineText?: string
  lineUntil?: number
  /** 语气：出场嘲讽 / 残血求饶（决定气泡配色） */
  lineKind?: "taunt" | "whine"
  /** 残血台词只说一次 */
  lowHpLineShown?: boolean
  /** 弹窗假投降：到点自爆的截止时间，0 = 没在投降 */
  surrenderUntil?: number
  /* ---- 弹窗干扰包（popup-jam-pack.md）---- */
  /** 弹窗敌人下一次吐糊屏弹窗的时刻（缺省 = 这只不吐：召唤物/管理员/404 假弹窗等） */
  jamNextAt?: number
  /* ---- 拟物化战斗包（skeuo-boss-pack.md 一）：广告 Boss 弱点 ×，全可选零迁移 ---- */
  /** 弱点 × 冷却到点时刻（仅广告 Boss 阶段 2 有意义；缺省 = 从没点中过） */
  weakCdUntil?: number
  /** 弱点 × 当前锚点槽位（0~5，每命中一次进位；缺省 = 初始位） */
  weakSlot?: number
  /* ---- 趣味包 v4（fun-pack4.md）：影子与管理员 ---- */
  /** 这只敌人是玩家影子（模仿原局 Build 的出手形态） */
  shadow?: boolean
  shadowStyle?: "haste" | "burst" | "regen"
  /** 击杀赏金（碎片） */
  shadowBounty?: number
  /** burst 形态：下一次蓄力重打的时刻 */
  shadowEchoNextAt?: number
  /** 这只敌人是管理员（血条 999、攻击即致死） */
  admin?: boolean
  /** 管理员 66% / 33% 阈值台词已说过 */
  adminTaunt1?: boolean
  adminTaunt2?: boolean
  /* ---- UI 包 v1（ui-pack.md 二）---- */
  /** 刚被弹射链命中（0.5s 内紫描边，弹射轨迹感），0 = 没有 */
  bounceFlashUntil?: number
  /* ---- 内核包 v1（kernel-tabs.md）---- */
  /** 后台页半速出手的到点时刻（额外页与被换下台前的主标签用；台前页走 nextAttackAt） */
  bgNextAttackAt?: number
  /* ---- 表现包：被暴击时金色粒子窗（纯装饰） ---- */
  critFlashUntil?: number
  /* ---- 核心体验包 v1（core-experience-pack.md）：全部可选，旧档零迁移 ---- */
  /** 双面回廊：成对广告的正面 / 背面标记 */
  twin?: "front" | "back"
  /** 背面广告下一次跨页重击的时刻（仅 twin==="back" 有） */
  twinBurstNextAt?: number
  /** 背面本周期内被玩家打过（到点重击被「打断」而非落伤害，结算后清除） */
  twinHitThisCycle?: boolean
  /** 另一半已死、本只已吃过一次狂暴（幂等锁） */
  twinRaged?: boolean
  /** 弹窗下一次跳进后台标签页的时刻（popup 且非 minion） */
  jumpNextAt?: number
  /** 跳转落地后的攻击强化到点时刻 */
  jumpBuffUntil?: number
  /** 泄漏已累计偷走的内存点数（击杀全额吐回） */
  stolenMem?: number
  /** 泄漏下一次偷内存的时刻（leak 系敌人） */
  leakStealNextAt?: number
  /** 泄漏溢出攻击翻倍的一次性横幅已弹 */
  leakOverflowShown?: boolean
}

/** C5 伪元素：护盾破碎分裂出的小护盾单位（自动追踪最近存活敌人，到达爆炸） */
export type MiniShield = {
  id: number
  bornAt: number
  /** 到达（爆炸）时间：低配直接 0.3 秒后结算，正常 0.6 秒飞行 */
  arriveAt: number
  /** 追踪目标（每 tick 重锁最近存活敌人），null = 场上暂无目标 */
  targetUid: string | null
  /** 0~1 飞行进度，View 用青色光点沿标签条摆放 */
  progress: number
}

/**
 * 内核包 v1（kernel-tabs.md）：一张后台额外标签页。
 * 台前页 = state.enemies（activeTabId 标记它是哪一页）；后台页在 advance 里
 * 做「维持费 → 崩溃判定 → 半速出手」，切页时与台前敌组互换，战斗代码零改动。
 */
export type TabPage = {
  id: number
  enemies: EnemyInstance[]
  /** 该页最后一次台前时玩家的锁定（切回时还原） */
  lockedUid: string | null
  frozen: boolean
  crashed: boolean
  /** 下一次维持费扣点时刻（未冻结 6s / 冻结 12s 一跳） */
  drainNextAt: number
  /** 下一次崩溃投定点（仅未冻结额外页掷，8s 一跳） */
  crashNextAt: number
  /** 核心体验包 v2：援军页（enemies 恒空，住一个光环型友军；维持费/崩溃全短路） */
  ally?: AllyKind
  /** 援军计时钟（sprite 出手 / bug 产内存；guard 无计时）。进 shiftRunTime，存在才 sh */
  allyNextAt?: number
}

/** 核心体验包 v2：三种光环型援军（不造新战斗单位，固定展示顺序 sprite→guard→bug） */
export type AllyKind = "sprite" | "guard" | "bug"

export type CombatMods = {
  baseAttack: number
  attackFlat: number
  attackMult: number
  critChance: number
  critMult: number
  critAfterHits: number
  followupChance: number
  followupRatio: number
  doubleAttackChance: number
  maxHp: number
  damageReduction: number
  lowHpReduction: number
  lowHpThreshold: number
  dodgeChance: number
  dodgeWindowMs: number
  dodgeCooldownMs: number
  activeCooldownMs: number
  activeDamageMult: number
  attackIntervalMs: number
  hurtHasteMs: number
  enemyIntervalMult: number
  penetration: number
  executeAll: number
  executeBonus: number
  executeThreshold: number
  killBonusMult: number
  startShield: number
  shieldMax: number
  shieldBreakDamage: number
  healPerFloor: number
  healOnKill: number
  idleHealPerSec: number
  hurtDodgeChance: number
  hurtDodgeMs: number
  firstHitImmunePerFloor: number
  immuneEveryMs: number
  attackPerFloorMult: number
  fragmentMult: number
  bonusPickRounds: number
  rerollPerFloor: number
  extraChoiceCount: number
  reviveChance: number
  reviveHpRatio: number
  reviveFullOnce: number
  deathWardPerFloors: number
  /** 内存上限（v2：基础上限 8 + 每 2 层 +1，限流 / Cookie / 跨域 / 内存泄漏会压低，夹逼 [3,20]） */
  memoryMax: number
  /** 主动技内存成本（角色定，v2「所有操作都有成本」） */
  skillMemoryCost: number
  /* ---- 批次 B：脚本系 / 样式系机制字段（数值权威 .rh/pages/relic-redesign.md B 节） ---- */
  /** S1/S2 弹射：总跳数（事件监听 1 + 回调地狱 +2），0 = 不弹 */
  bounceJumps: number
  /** S1/S2：第一跳相对本次普攻伤害的比例（0.5） */
  bounceFirstRatio: number
  /** S2：第一跳之后每跳的递减系数（持回调地狱 0.7，否则 1） */
  bounceStepRatio: number
  /** S1/S2：每跳内存耗（弹射流 combo 在批次 C 把它降为 0） */
  bounceMemoryCost: number
  /** S3 闭包：>0 = 主动技后留 1.5 秒残像再打一次 */
  closureEcho: number
  /** S4 防抖：>0 = 受击后 1 秒内下次普攻三连 */
  tripleOnHurt: number
  /** S5 节流：>0 = 每 5 秒积 1 层（上限 3），手动消耗 1 层挡伤 */
  throttleGain: number
  /** S6 Promise 链：连续命中达到这个数后，下次普攻转链式暴击（0 = 关） */
  chainCrit: number
  /** S7 异步觉醒：>0 = 主动技释放后的阻塞毫秒（×2 已并进 activeDamageMult） */
  blockActiveMs: number
  /** C2 z-index：>0 = 闪避后残影诱饵，数值同时是残影的内存耗（1） */
  decoyAfterDodge: number
  /** C3 媒体查询：>0 = 每层首破 30% 血响应式重构 */
  responsiveRefactor: number
  /** C4 过渡动画：闪避后这个毫秒窗口内普攻命中挂敌人攻速减半，0 = 关 */
  enemySlowMs: number
  /** C5 伪元素：护盾破碎分裂出的小护盾个数 */
  shieldSplit: number
  /** C5/M5：小护盾死亡回多少内存（统一走 gainMemory 接口） */
  minionDeathMemory: number
  /** C6 层叠上下文：护盾存在时的攻击加成比例 */
  shieldAttackBonus: number
  /** C7 暗黑模式：全体敌人血量减半 + 非锁定目标轮廓化 */
  darkTheme: boolean
  /* ---- 批次 C：网络系 / 缓存系 / 通用系机制字段 + combo 效果（数值权威 .rh/pages/relic-redesign.md） ---- */
  /** N1 请求拦截：暴击偷多少内存（hitEnemy 的 crit 分支结算） */
  stealMemoryOnCrit: number
  /** N2 缓存命中：>0 = 同目标连续第 4 击必定暴击 */
  fourthHitCrit: number
  /** N2 缓存命中：第 4 击回多少内存 */
  memoryGainFourthHit: number
  /** N3 重定向：>0 = 击杀溢出伤害转移下一个敌人（≤1 跳） */
  overflowTransfer: number
  /** N4 CDN 加速：穿透位伤害比例（穿透流 combo 升到 0.5），0 = 无穿透 */
  pierceRatio: number
  /** N4 CDN 加速：每次普攻穿透的内存耗（穿透流 combo 降为 0，trySpendMemory 对 0 放行） */
  pierceMemoryCost: number
  /** N5 断点续传：复活的内存门槛（不足必失败） */
  reviveMemoryCost: number
  /** N6 超时重试：>0 = 重试结果必出稀有以上 */
  rerollForceRare: number
  /** M1 本地存储：每层结束存入存储池的血量 */
  storageHealPool: number
  /** M2 Session：v2 起进层回满使「层末清零」天然无效，字段与代价一并移除（词条保留纯收益） */
  /** M5 垃圾回收：击杀回多少内存 */
  killMemoryGain: number
  /** M6 Service Worker：>0 = 免死触发时清空场上全部普通召唤物 */
  deathWardClearMinions: number
  /** G2 热更新：>0 = 每局 1 次不耗次数的三选一刷新 */
  freeRerollOnce: number
  /** S6/斩杀流 combo：链式暴击的内存耗（默认 3，combo 降为 1） */
  chainCritMemoryCost: number
  /** C5/护盾流 combo：小护盾爆炸伤害（默认 8，combo 翻倍到 16） */
  miniShieldDamage: number
  /** 暗黑流 combo：暴击对血量低于该比例的普通敌人直接斩杀，0 = 关 */
  darkExecuteCritRatio: number
  /** 断网诅咒：主动技封存 */
  blockedByCurse: boolean
  /* ---- 词条打架（fun-pack3.md 一）：同时持有冲突对时的变异效果 ---- */
  /** 已触发的冲突 id（View 徽标用） */
  conflicts: ConflictId[]
  /** 监听债：弹射跳数 ×2 */
  conflictBounceDouble: number
  /** 监听债：每跳反噬自己的概率（伤害 ×25% 回身） */
  conflictBounceBackPct: number
  /** 黑箱拦截：每次暴击自扣的血 */
  conflictCritBackHp: number
  /** 觉醒续命：断点续传复活成功瞬间自动轰一发双倍主动技 */
  conflictAwakenEcho: boolean
}

export type RunState = {
  character: DungeonCharacter
  seed: string
  floor: number
  phase: Phase
  startedAt: number
  now: number
  playerHp: number
  playerMaxHp: number
  shield: number
  combo: number
  /** S6 Promise 链：连续命中计数（每次玩家普攻命中 +1，玩家实掉血清零；受击豁免类免疫不清） */
  hitStreak: number
  critNext: boolean
  /** 手动点击连击层数（独立于事件连击，每层 +5% 攻速，2 秒不点清零） */
  clickCombo: number
  /** 点击连击清零时间点：超过此刻仍无点击则归零 */
  clickComboExpireAt: number
  /** 本次点击计窗起始（限每秒最多 5 次有效点击） */
  clickTapWindowStart: number
  /** 本计窗内已经生效的点击次数 */
  clickTapCount: number
  /** 最近一次切锁时间：点击与 ←→ 共用的 0.5 秒防误触 */
  lastLockAt: number
  /** 完美闪避白闪截止时间（低配不显示） */
  perfectFlashUntil: number
  /** 最近一次滑动闪避的方向（-1 左 / 0 非滑动 / 1 右）：残影用 */
  dodgeDir: number
  /** 教学：本局是否已点过敌人（首次点击教切目标） */
  coachClickTargetDone: boolean
  enemies: EnemyInstance[]
  lockedUid: string | null
  lockedButtonId: string | null
  nextAutoAt: number
  /** 禅模式（ui-pack.md v3 一）：顶栏二级信息折叠 = true（undefined 也算折叠，默认吃加成）；折叠时攻速 +5% */
  uiZen?: boolean
  /** 内存历史曲线（ui-pack.md v3 二）：250ms 采样点（上限 48 个），换层清空 */
  memoryHist?: number[]
  /** 下一个采样时刻（毫秒时间戳） */
  memoryHistNextAt?: number
  /** 多标签页（kernel-tabs.md）：额外战斗页；台前 = state.enemies（activeTabId 标记是哪页） */
  tabs?: TabPage[]
  /** 台前页 id（0 = 主标签） */
  activeTabId?: number
  /** 主标签被换到后台时暂存的敌组与锁定 */
  mainBackup?: { enemies: EnemyInstance[]; lockedUid: string | null } | null
  /** 切页防误触截止时刻 */
  tabSwitchLockUntil?: number
  /** 下一页分配的 id */
  nextTabPageId?: number
  /** 清层门槛提示是否已说过（台前清完但额外页还有活口时提醒一次，换层重置） */
  tabGateNagShown?: boolean
  /* ---- 核心体验包 v2（core-experience-pack2.md）：缓存电池 ---- */
  /** 缓存槽存量（长度 ≤3，每格 1~CACHE_PER；换层清空——缓存是本层工具，不带走） */
  cacheSlots?: number[]
  /** 本层剩余免费存入次数（进层回满点重置为 CACHE_DEPOSIT_PER_FLOOR） */
  cacheDepositLeft?: number
  /* ---- 内核包 v2（任务管理器）---- */
  /** 已用过任务管理器的层号（每层一次） */
  taskmgrUsedFloor?: number
  /** 「优化进程」攻速加成截止时刻 */
  taskHasteUntil?: number
  /* ---- 深化包（deepening-pack.md 一/二）：全可选，旧存档零迁移 ---- */
  /** 内存碎片（0~8）：进层回满时实际水位 = 上限 − 碎片；≥5 常驻攻速 -10% */
  memFrags?: number
  /** 本局碎片峰值（结算） */
  maxFrags?: number
  /** 下一次碎片积累的时刻（每 25 秒战斗时间 +1；超频爆发期暂停推进） */
  memFragNextAt?: number
  /** 本局整理次数（任务管理器 / 回收站 / 商店三通道合计） */
  memDefragCount?: number
  /** 超频爆发结束时刻，0 = 没有 */
  ocUntil?: number
  /** 超频惩罚（过热卡顿）结束时刻，0 = 没有 */
  ocPenaltyUntil?: number
  /** 已用过超频的层号（每层一次，换层重置） */
  ocUsedFloor?: number
  /** 本局超频使用次数（结算） */
  ocCount?: number
  /** 上一次病毒引爆时刻（500ms 防误触） */
  lastDetonateAt?: number
  /** 超频首次使用教学是否已弹 */
  coachOcDone?: boolean
  /** 病毒标签教学是否已弹（首次有携带者的层弹一次） */
  coachVirusDone?: boolean
  /* ---- 表现包：屏幕震动（暴击 4px / 穿透 2px / 斩杀 6px）---- */
  /** 第几次震动：View 用它交替类名让动画能连续重放 */
  shakeSeq?: number
  /** 震动幅度（px）与截止时刻 */
  shakePx?: number
  shakeUntil?: number
  /** 主动技释放特写（表现包·纯装饰）：截止时刻 + 是否蓄力满档（金色加强版） */
  skillFocusUntil?: number
  skillFocusChargeFull?: boolean
  /** 最近一次自动攻击落地的时间，右下角指示图标用它闪烁 */
  lastAttackAt: number
  activeReadyAt: number
  dodgeReadyAt: number
  dodgeUntil: number
  immuneReadyAt: number
  hurtHasteUntil: number
  hurtDodgeUntil: number
  /** 标签刺客被动「无痕切换」：闪避后攻速提升的截止时间 */
  dodgeHasteUntil: number
  /** 无痕游侠主动技「无痕步」：攻速提升的截止时间 */
  activeHasteUntil: number
  /** 脚本战士主动技「事件连击」：双重打击的截止时间 */
  doubleStrikeUntil: number
  /** 脚本战士被动「监听叠加」：当前层数 */
  listenStacks: number
  /** 工作僧侣被动「后台同步」：当前计数（每 8 次普攻追加一次固定伤害） */
  syncStacks: number
  /** 工作僧侣主动技「多线程执行」：攻速 +60% 的截止时间 */
  multithreadUntil: number
  /** 内核之影主动技「任务管理器」：全场敌人冻结的截止时间 */
  freezeUntil: number
  firstHitImmuneUsed: boolean
  nextHitBonus: number
  deathWards: number
  wardsGranted: number
  reviveFullUsed: boolean
  reviveCount: number
  freePickQueue: number
  rerollsLeft: number
  lastActionAt: number
  nextIdleHealAt: number
  hiddenEveryMs: number
  hiddenNextAt: number
  /** 暂停：整个战斗循环冻结 */
  paused: boolean
  /** 暂停开始时间（恢复时把各种计时往后推） */
  pauseStartedAt: number
  /** 进层准备闸（用户反馈）：进层即暂停，点「开始战斗」才开战，计时整体平移 */
  readyFloor?: boolean
  /** 层限时超时：本层全体敌人攻击 +50%，不直接判负 */
  overtime: boolean
  /** 第 6 层图案题的出题节奏 */
  challengeEveryMs: number
  challengeNextAt: number
  challenge: CaptchaChallenge | null
  /** Boss 强制观看：屏幕变暗后出现的限时跳过按钮 */
  bossClick: BossClickPrompt | null
  /** Boss 技能把玩家攻速减半的截止时间 */
  bossSpeedCutUntil: number
  /** Boss 技能的全屏闪烁提示 */
  bossFlashUntil: number
  /** Boss 当前那句台词（出场 / 进阶段 / 放技能 / 告急 / 被击败） */
  bossLine: BossLine | null
  /** 换句计数，只用来给 View 当 key 触发淡入 */
  bossLineSeq: number
  /** 第 4 层通关：下一次三选一必带 1 个稀有词条 */
  forceRareChoice: boolean
  relics: Relic[]
  choices: Relic[]
  pendingRelic: Relic | null
  relicPickIndex: number
  pops: DamagePop[]
  log: string[]
  /** 教学浮字开关：进局时读一次设置里的「教程提示」 */
  coachOn: boolean
  /** 当前教学浮字：View 按 seq 短暂展示，引擎不负责让它消失 */
  coachTip: { text: string; seq: number } | null
  coachHitDone: boolean
  coachSkillDone: boolean
  coachDangerDone: boolean
  coachHiddenDone: boolean
  /** 主动技是否进过冷却：用来抓「第一次冷却完毕」这个教学时机 */
  activeWasCooling: boolean
  cause: string
  kills: number
  damageDealt: number
  /** 图鉴：本局已经关掉的敌人 / Boss 的 defId（去重，供写档用） */
  defeatedIds: string[]
  /** 幽灵对照：每层打完时的剩余血量百分比（最多 8 个），只影响显示 */
  path: number[]
  /** 本局临时碎片：只在本局有效，结算时按 1:1 折算 */
  shards: number
  /** 最近一次拿到碎片的时间，HUD 用它让数字跳一下 */
  shardPulseAt: number
  /** 手动拾取：当前掉在标签条里、等待点击的碎片点 */
  shardDots: ShardDot[]
  /** 碎片点自增 id */
  shardSeq: number
  /** 拖拽关闭：本层是否已经用过（每层限 1 次） */
  dragCloseUsed: boolean
  /** HUD 横幅：拖拽 / × 关闭、验证码成败等一次性提示 */
  banner: Banner | null
  /** 教学：本局是否已提示过「点击 × 关闭弹窗」 */
  coachPopupXDone: boolean
  /** 通用手动无敌窗口的截止（离线模式 / 节流共用），0 = 无 */
  manualImmuneUntil: number
  /* v4·S5：节流改「资源层叠层」（throttleLayers 见下），v3 的 throttleReadyAt 冷却字段已删 */
  /** 离线模式·下次可触发的时间（10 秒冷却），0 = 随时可触发 */
  offlineReadyAt: number
  /** 攻击锁定截止（离线模式离线期间不攻击），0 = 无 */
  attackLockedUntil: number
  /** 内存：当前余额（v2 允许 0.5 的碎片产出小数，展示向上取整） */
  memory: number
  /** 内存：当前上限（随层成长 + 词条修正，由 buildMods 夹逼 [3,20] 算出） */
  maxMemory: number
  /** 卡顿累积：连续处于紧张/耗尽的起始时间，0 = 不在低内存区（v2 卡顿惩罚计时） */
  memStallSince: number
  /** 卡顿累积：每秒扣血的下一个结算时间点（持续 ≥8 秒后启用） */
  memStallDrainNextAt: number
  /** 结算：本局内存总产出（击杀/碎片/词条，不含进层回满）与总消耗 */
  memoryGained: number
  memorySpent: number
  /** Build 评分：进入内存耗尽区（<15%）的次数，离开后再进才计新的一次 */
  memoryOutages: number
  /** Build 评分：当前是否身处耗尽区（边缘计数用） */
  memOutageActive: boolean
  /** Build 评分：内存崩溃（低内存卡顿 ≥12 秒锁攻）触发次数 */
  memoryCrashes: number
  /** 教学：本局是否已提示过「内存不足」 */
  coachMemoryShortDone: boolean
  /** 教学：本局是否已提示过「词条可主动触发」 */
  coachRelicTriggerDone: boolean
  /** 教学：路线选择第一次出现时教一次 */
  coachRouteDone: boolean
  /** 教学：第一次见到诅咒时教一次怎么清 */
  coachCurseDone: boolean
  /* ---- 批次 B：脚本系 / 样式系机制状态（数值权威 .rh/pages/relic-redesign.md B 节） ---- */
  /** S3 闭包：主动技后挂的残像（到点重放一次同倍率主动技效果），null = 无 */
  closureEcho: { uid: string; charge: number; awakened: boolean; until: number } | null
  /** S4 防抖：受击后三连击窗口的截止，0 = 无 */
  debounceUntil: number
  /** S7 异步觉醒：阻塞（不能攻击与闪避）的截止，0 = 无 */
  blockUntil: number
  /** C2 z-index：闪避残影诱饵的截止，0 = 无 */
  decoyUntil: number
  /** C4 过渡动画：闪避后「普攻命中挂敌人攻速减半」窗口的截止，0 = 无 */
  transitionUntil: number
  /** S5 节流：当前层数（上限 3，手动触发消耗 1 层） */
  throttleLayers: number
  /** S5 节流：下一次积层的时刻（每 5 秒 1 层，每层重置） */
  throttleNextAt: number
  /** C3 媒体查询：本层是否已重构过（每层限 1 次） */
  refactorUsedThisFloor: boolean
  /** C5 伪元素：场上飞行中的小护盾 */
  miniShields: MiniShield[]
  /** 低配模式开关（进局读一次设置）：C5 小护盾不飞直接结算用 */
  lowSpec: boolean
  /* ---- 批次 C：网络系 / 缓存系 / 通用系机制状态（数值权威 .rh/pages/relic-redesign.md） ---- */
  /** N2 缓存命中：最近连续攻击的目标 uid（换目标即重计，按 uid 比对天然清零） */
  cacheHitUid: string | null
  /** N2 缓存命中：在当前目标上的连续攻击计数（每满 4 必暴 + 回内存） */
  cacheHits: number
  /** N5 断点续传：本局机会是否已消耗（每次致死尝试即消耗，掷中与否都不再来） */
  resumeUsedThisRun: boolean
  /** N6 超时重试：本层金色重试是否已用（进新层重置） */
  timeoutRetryUsedThisFloor: boolean
  /** G2 热更新：本局那次耗内存免费刷新是否已用 */
  hotReloadUsedThisRun: boolean
  /** M1 本地存储：待下一层开始生效的回血池（层末存入、进层清零，封顶 STORAGE_POOL_MAX） */
  storagePool: number
  /** 教学：N5 复活 / M6 免死各自首触教学一次 */
  coachResumeDone: boolean
  coachWardDone: boolean
  /** 当前进行中的 Boss QTE（null = 无） */
  qte: QteState | null
  /** 每开一个新 QTE +1，React 侧据它起独立墙钟倒计时 */
  qteSeq: number
  /** 教学：本局是否已提示过「QTE 要来了」 */
  coachQteDone: boolean
  /** Boss 眩晕截止（QTE 成功让 Boss 停技能 / 停手），0 = 无 */
  bossStunUntil: number
  /** QTE 失败造成的玩家攻击下降的截止与比例 */
  qteAttackCutUntil: number
  qteAttackCutRatio: number
  /** 本局操作模式：休闲 / 标准 / 硬核（进局时从设置读入） */
  playMode: PlayMode
  /** 无伤通关判定：任何一次实打实的掉血（护盾没全吸收）都置位 */
  tookDamage: boolean
  /** 付费刷新（−15 局内碎片）本层是否已用，进新层重置 */
  floorPaidRerollUsed: boolean
  /** 付费复活（−30 局内碎片）每局限 1 次 */
  paidReviveUsed: boolean
  /** 进入死亡态的时间：付费复活用它把暂停期间的计时整体后移 */
  deadAt: number
  /** 本局固定商店落点（第 5 层后一次） */
  shopFloors: number[]
  shopSeq: number
  overlayKind: OverlayKind
  shopStock: ShopItem[]
  altarOffer: Relic | null
  altarCost: AltarCost | null
  altarPendingRelic: Relic | null
  /** 祭坛四型（seed-system.md 六）：词条 / 生命 / 内存 / 诅咒 */
  altarType: AltarType
  /** 诅咒只压一层：记下要受影响的那层，打完自动散（祭坛血债通道，与路线诅咒系统无关） */
  cursedFloor: number | null
  /* ---- 路线系统（dungeon-route.md） ---- */
  /** phase === "route" 时展示的路线卡（池固定，直接全列） */
  routeChoices: RouteEntry[]
  /** 当前所在层的来路；第 1 / 8 层与事件过层为 null */
  activeRouteId: RouteId | null
  /** 当前层的池条目（层末奖励查它，避免反查池） */
  activeEntry: RouteEntry | null
  /** 走过的路线足迹（结算页展示） */
  routeLog: { floor: number; routeId: RouteId }[]
  /** 六诅咒，同名不叠加，不跨局 */
  curses: CurseId[]
  /** 每日挑战：本局携带的今日池子（undefined = 全池随机局） */
  dailyPools?: DailyPools
  /** 商店/防火墙给的词条槽加成 */
  bonusSlots: number
  /** 商店买的内存上限 */
  bonusMemoryCap: number
  /** 每次镜像复制 -2 上限 */
  mirrorCapPenalty: number
  /** 时间裂隙/商店买的永久每层刷新加成 */
  bonusReroll: number
  /** 本层三选一史诗保底（崩溃边缘路线），消费后置回 */
  forceEpicChoice: boolean
  /** 双面回廊：本层双面敌人的真实死亡时刻（2s 内双杀判定同步击杀用） */
  twinDeaths?: number[]
  /** 回收面板打开时的来路：shop=买完清理服务回商店，recycle=回收站路线本身 */
  pendingRemoveMode: "recycle" | "shop" | null
  /** 缓存深渊：已「碎盾回内存」过的敌人，按 uid 去重 */
  shieldBlessedUids: string[]
  /** 蓝屏诅咒：下一次卡顿的结算时间（enterFloor 设起点），0 = 无 */
  bluescreenNextAt: number
  /** 镜像空间：本层清空后是否还欠一次「镜像复制」面板 */
  mirrorPending: boolean
  /** 本层商店关掉之后接三选一还是接选路 */
  overlayReturn: "relic" | "route"
  bossDeadline: number
  bossLimitMs: number
  bossTimeoutPenalty: number
  bossTimeoutFails: boolean
  /* ---- 趣味包 v1（fun-pack.md） ---- */
  /** 本局故事线（结算页 RunStoryPanel 消费，进 DungeonRunRecord.story） */
  story: string[]
  /** 血量首次跌破 20% 的故事只写一次 */
  storyLowHpShown: boolean
  /** 首次页面故障的故事只写一次 */
  storyGlitchShown: boolean
  /** 当前页面故障（now < glitchUntil 生效），null = 页面正常 */
  glitchKind: GlitchKind | null
  glitchUntil: number
  /** 已武装未发作的故障（到 glitchArmedAt 发作） */
  glitchArmedAt: number
  glitchArmedKind: GlitchKind | null
  /** 本局发作过的故障次数（日志与故事用） */
  glitchCount: number
  /* ---- 故障手感包（glitch-feel-pack.md）：全部可选，旧档零迁移 ---- */
  /** 顿帧：冻结整个模拟到该墙钟（0/缺省 = 未冻结；恢复时全部计时器平移） */
  hitStopUntil?: number
  /** 顿帧触发计数（View 按它重挂载一次冲击闪光） */
  hitStopSeq?: number
  /** 顿帧压住的爆发音（冻结到点那一帧补播，「静止然后爆发」） */
  pendingHitSfx?: "crit" | "hit" | null
  /** 上一次顿帧触发时刻（最小间隔去重） */
  lastHitStopAt?: number
  /** 角色攻击轨迹（短命记录，View 按 uid 挂敌人卡 / 自身位） */
  fx?: AttackFx[]
  /** 内存错位生效到该墙钟（缺省 = 没有）：HUD 数字是假的，管理员/泄漏被迷惑 */
  memFakeUntil?: number
  /* ---- 弹窗干扰包（popup-jam-pack.md）：糊屏弹窗 ---- */
  /** 当前糊在主动技按钮上的弹窗（缺省/null = 没糊）；同期最多 1 个 */
  screenJam?: ScreenJam | null
  /** 第一次被糊脸的故事只写一次 */
  storyJamShown?: boolean
  /* ---- 浏览器特性包 v1（browser-powers-pack.md 一）：分身窗口 ad-tabsync ---- */
  /** 分身读条完成墙钟（undefined = 没在读）；读条期间主战场照常跑 */
  bossCloneCastUntil?: number
  /** 打断还差的连点数 */
  bossCloneTaps?: number
  /* ---- UI 武器包（ui-arsenal-pack.md）---- */
  /** 本层是否已「清理缓存」（进层复位） */
  floorCacheCleared?: boolean
  /** 第一次清缓存的故事只写一次 */
  storyCacheShown?: boolean
  /** 场上假按钮（null = 没有） */
  fakeButton: FakeButton | null
  fakeButtonSeq: number
  /** 下一颗假按钮的生成时间（崩溃 Boss 阶段 2+ 周期刷） */
  fakeButtonArmedAt: number
  /** 404 假奖励每层限 1 次（enterFloor 重置） */
  fakeShardUsedFloor: boolean
  /** 当前打开的代价事件（overlayKind === "crisis" 时有值） */
  crisisEvent: CrisisId | null
  /** 崩溃弹窗「无视它」：下一场普通战斗 +1 弹窗并武装假按钮 */
  crisisExtraPopup: boolean
  /** 内存溢出「转嫁」：下一场战斗全体敌人开局 +20 护盾 */
  crisisEnemyShield: boolean
  /** 内存溢出「立即清空」：下一场战斗进场回满后再砍半 */
  crisisMemoryHalf: boolean
  /** 404「追进去」：下一场普通战斗 +1 精英 */
  crisisEliteNext: boolean
  /** 缓存污染「留着」：接下来 N 场战斗开层 -8 血 */
  crisisTaxFloors: number
  /** 404「重定向」：下一次路线选择重摇 */
  crisisRerollRoute: boolean
  /** crisis 事件的故障后遗症（invert/scramble）在下一次进层发作 */
  crisisGlitchNext: GlitchKind | null
  /** 缓存污染「隔离」：被封条 id 与被封剩余场数（>0 期间生效） */
  quarantinedRelicId: string | null
  quarantineFloorsLeft: number
  /* ---- 趣味包 v2（fun-pack2.md）：UI 武器 / 敌人适应 / 元叙事 ---- */
  /** 盲战：血条数字被遮住换攻击 +30%（跨层保持，玩家自己开关） */
  blindCombat: boolean
  /** 崩溃 Boss 阶段 2 抢走的技能按钮（true 期间主动技不可用，点战斗区的目标找回） */
  skillSnatched: boolean
  snatchXPct: number
  snatchYPct: number
  /** 适应计数器：弹射命中 / 暴击命中 / 主动技释放 */
  learnBounceHits: number
  learnCritHits: number
  learnSkillUses: number
  /** 敌人已适应（一局永久）：弹射衰减 / 暴击护甲 / 技能抗性 */
  adaptBounce: boolean
  adaptCrit: boolean
  adaptSkill: boolean
  /** 挂机吐槽已在哪几层说过（每层一次） */
  idleNagShownFloors: number[]
  /* ---- 隐藏裂隙与词条打架（fun-pack3.md） ---- */
  /** 清场后冒出的裂隙（overlayKind === "hidden" 时有值） */
  hiddenOffer: HiddenFloorId | null
  /** 正在裂隙内的额外战斗（finalize 见它结束战斗、按 hiddenReturn 续流程） */
  hiddenActive: HiddenFloorId | null
  /** 裂隙打完之后要续上的原流程 */
  hiddenReturn: "shop" | "relic"
  /** 本层是否没掉过血（4 层广告地狱条件） */
  noDamageFloor: boolean
  /** 裂隙只在哪几层给过机会（每层至多一次） */
  hiddenOfferedFloors: number[]
  /** 离线决堤：无敌泄漏的扣血时刻（0 = 没有） */
  offlineBreachEndAt: number
  /** 进局时本机连续同一种子局数（含本局，宿命裂隙条件） */
  seedStreak: number
  /* ---- 影子与管理员（fun-pack4.md） ---- */
  /** 本局是否已出过影子（一局至多一个） */
  shadowDoneThisRun: boolean
  /** 影子来源对局记录（null = 本机没有可参照的历史局） */
  shadowSource: DungeonRunRecord | null
  /** 拿到资格：第 8 层清场时管理员降临（不定格胜利，先打） */
  adminPending: boolean
  /** 正在与管理员战斗 */
  adminActive: boolean
  /** 本局击败管理员（写进 record.adminDefeated → devMode 落档） */
  adminWon: boolean
  /** 管理员禁用中的词条（复用 lockedRelicId 通道；到期恢复） */
  adminLockId: string | null
  adminLockUntil: number
  /** 管理员下一次篡改（词条 / 内存 / 血三选一） */
  adminTamperNextAt: number
  /** 本局进过死亡处理的次数（「死过」判定，fun-pack4.md 二） */
  deathsThisRun: number
  /* ---- HUD 构筑包（hud-forge-pack.md）：六锚点拖拽站位，跨层保留、新局重置、不进存档 ---- */
  /** 三模块（主动技钮 / 闪避钮 / 词条栏浮卡）当前停靠位；缺省 default = 嵌回原有位置 */
  dock?: DockConfig
  /** 缓存复用（relic 贴顶角）下一次 +1 内存的结算时刻；regen 不生效时不存在（存在才 sh） */
  hudRegenNextAt?: number
  mods: CombatMods
}

/* ------------------------------------------------------------------ *
 * HUD 构筑包（hud-forge-pack.md）：锚点定义 + 相邻收益单一事实源 + 拖拽动作
 * ------------------------------------------------------------------ */

/** 六锚点：四角 + 左右侧中（内存条固定 = 顶部参考点，不参与拖拽） */
export type Anchor = "TL" | "TR" | "ML" | "MR" | "BL" | "BR"
export type DockSlot = Anchor | "default"
export type DockModule = "skill" | "dodge" | "relic"
export type DockConfig = Record<DockModule, DockSlot>
export type HudPerkId = "power" | "regen" | "stealth" | "coord" | "wire"

/** 锚点视口百分比坐标（右侧锚点仍按左缘起算，View 用 anchorRenderBox 夹防溢出） */
export const HUD_ANCHOR_PCT: Record<Anchor, { xPct: number; yPct: number }> = {
  TL: { xPct: 4, yPct: 16 },
  TR: { xPct: 84, yPct: 16 },
  ML: { xPct: 2, yPct: 40 },
  MR: { xPct: 84, yPct: 40 },
  BL: { xPct: 2, yPct: 62 },
  BR: { xPct: 84, yPct: 62 },
}
export const HUD_ALL_ANCHORS: Anchor[] = ["TL", "TR", "ML", "MR", "BL", "BR"]
export const HUD_DEFAULT_DOCK: DockConfig = {
  skill: "default",
  dodge: "default",
  relic: "default",
}
/** 松手点距锚点中心 36px 内才算吸附 */
export const HUD_SNAP_PX = 36
/* 收益数值（.rh/balance.md 同步记录） */
const HUD_REGEN_MS = 6000
const HUD_SKILL_COST_MULT = 0.8
const HUD_STEALTH_TELEGRAPH = 1.15
const HUD_DODGE_CD_MULT = 0.9
const HUD_SKILL_DMG_MULT = 1.08
export const HUD_PERK_NAME: Record<HudPerkId, string> = {
  power: "供电短路",
  regen: "缓存复用",
  stealth: "隐蔽",
  coord: "镜像联动",
  wire: "有线驱动",
}
/* 有线驱动的邻接表 */
const HUD_ADJ_PAIRS: [Anchor, Anchor][] = [
  ["TL", "ML"],
  ["TR", "MR"],
  ["ML", "BL"],
  ["MR", "BR"],
  ["TL", "TR"],
  ["BL", "BR"],
]

export type HudPerks = {
  skillCostMult: number
  memRegen: boolean
  stealthMult: number
  dodgeCdMult: number
  skillDmgMult: number
  active: HudPerkId[]
}

/** 构筑收益单一事实源：每次在 hook / advance 现算，无缓存字段 */
export function hudPerks(dock?: DockConfig | null): HudPerks {
  const d = dock ?? HUD_DEFAULT_DOCK
  const skillUp = d.skill === "TL" || d.skill === "TR"
  const relicUp = d.relic === "TL" || d.relic === "TR"
  const relicDown = d.relic === "BL" || d.relic === "BR"
  const sameLeft =
    (d.skill === "ML" && d.dodge === "BL") ||
    (d.skill === "BL" && d.dodge === "ML")
  const sameRight =
    (d.skill === "MR" && d.dodge === "BR") ||
    (d.skill === "BR" && d.dodge === "MR")
  const adjacent = HUD_ADJ_PAIRS.some(
    ([a, b]) => (d.skill === a && d.relic === b) || (d.skill === b && d.relic === a),
  )
  const active: HudPerkId[] = []
  if (skillUp) active.push("power")
  if (relicUp) active.push("regen")
  if (relicDown) active.push("stealth")
  if (sameLeft || sameRight) active.push("coord")
  if (adjacent) active.push("wire")
  return {
    skillCostMult: skillUp ? HUD_SKILL_COST_MULT : 1,
    memRegen: relicUp,
    stealthMult: relicDown ? HUD_STEALTH_TELEGRAPH : 1,
    dodgeCdMult: sameLeft || sameRight ? HUD_DODGE_CD_MULT : 1,
    skillDmgMult: adjacent ? HUD_SKILL_DMG_MULT : 1,
    active,
  }
}

/** 前摇统一口径：普通敌起圈、Boss 蓄力、WarningZone 红圈读的都是这条延长后的值 */
function telegraphMsFor(state: RunState, baseMs: number): number {
  return Math.round(baseMs * hudPerks(state.dock).stealthMult)
}

/** 锚点的渲染左上角（px）：右侧锚点夹住防小屏溢出，与按钮 72px 宽同源 */
export function anchorRenderBox(a: Anchor): { left: number; top: number } {
  const w = window.innerWidth
  const pct = HUD_ANCHOR_PCT[a]
  const rawX = (pct.xPct / 100) * w
  const left = pct.xPct > 50 ? Math.min(rawX, w - 76) : Math.max(0, rawX)
  return { left, top: (pct.yPct / 100) * window.innerHeight }
}

/** 松手点 → 36px 内最近的锚点（无 = null） */
export function anchorAtPoint(x: number, y: number): Anchor | null {
  let best: Anchor | null = null
  let bestDist = HUD_SNAP_PX
  HUD_ALL_ANCHORS.forEach((a) => {
    const box = anchorRenderBox(a)
    const dist = Math.hypot(x - (box.left + 36), y - (box.top + 36))
    if (dist <= bestDist) {
      bestDist = dist
      best = a
    }
  })
  return best
}

/** 拖拽落锚：拖上已被占的锚点 = 两模块互换（永远无失败分支）；
 *  active 集合新增的 id 各报一次「收益激活」（只报新增，不刷屏） */
function dragDock(prev: RunState, module: DockModule, anchor: Anchor): RunState {
  if (prev.phase !== "fighting" || prev.paused) return prev
  const dock: DockConfig = { ...(prev.dock ?? HUD_DEFAULT_DOCK) }
  if (dock[module] === anchor) return prev
  const from = dock[module]
  const occupant = (Object.keys(dock) as DockModule[]).find(
    (item) => item !== module && dock[item] === anchor,
  )
  const before = hudPerks(dock).active
  dock[module] = anchor
  if (occupant) dock[occupant] = from
  const perks = hudPerks(dock)
  const next: RunState = { ...prev, dock }
  /* 缓存复用开启即起钟、关闭即清字段（不生效不计时） */
  if (perks.memRegen && prev.hudRegenNextAt === undefined)
    next.hudRegenNextAt = prev.now + HUD_REGEN_MS
  if (!perks.memRegen && prev.hudRegenNextAt !== undefined)
    next.hudRegenNextAt = undefined
  const added = perks.active.filter((id) => !before.includes(id))
  playSfx("pick")
  if (added.length > 0)
    pushBanner(
      next,
      `收益激活 · ${added.map((id) => HUD_PERK_NAME[id]).join(" · ")}`,
    )
  return next
}

/* ------------------------------------------------------------------ *
 * 纯函数：数值汇总
 * ------------------------------------------------------------------ */

const MULT_KEYS: (keyof RelicEffect)[] = [
  "attackMult",
  "attackIntervalMult",
  "enemyIntervalMult",
  "activeCooldownMult",
  "dodgeCooldownMult",
  "shieldMaxMult",
  "activeDamageMult",
]

function mergeEffect(target: RelicEffect, extra: RelicEffect) {
  const keys = Object.keys(extra) as (keyof RelicEffect)[]
  keys.forEach((key) => {
    const value = extra[key]
    if (typeof value !== "number") return
    const current = target[key]
    if (MULT_KEYS.includes(key)) {
      target[key] = (typeof current === "number" ? current : 1) * value
    } else {
      target[key] = (typeof current === "number" ? current : 0) + value
    }
  })
}

/**
 * 全部词条 / 角色被动收敛成一张修正值表，战斗引擎只读这张表。
 * 流派 combo 的战斗效果不在这里合并（v4 起 combo 不是数值词条）——
 * 激活点见 dungeonData 的 comboEffects 清单，批次 B/C 逐条接入。
 */
/** 路线系统的局级修正（诅咒 / 商店买入 / 镜像代价），有 RunState 之后统一从 state 取 */
export function extrasOf(state: RunState): ModsExtras {
  return {
    curses: state.curses,
    bonusMemoryCap: state.bonusMemoryCap,
    mirrorCapPenalty: state.mirrorCapPenalty,
    lockedRelicId:
      state.quarantineFloorsLeft > 0
        ? state.quarantinedRelicId
        : state.adminLockId,
    blindCombat: state.blindCombat,
  }
}

export type ModsExtras = {
  curses: CurseId[]
  bonusMemoryCap: number
  mirrorCapPenalty: number
  /** 缓存污染·隔离（fun-pack.md 三）：这场战斗里被禁用的词条 id */
  lockedRelicId: string | null
  /** 盲战（fun-pack2.md 一）：遮住自己血条，攻击 ×1.3 */
  blindCombat: boolean
}

const NO_EXTRAS: ModsExtras = {
  curses: [],
  bonusMemoryCap: 0,
  mirrorCapPenalty: 0,
  lockedRelicId: null,
  blindCombat: false,
}

export function buildMods(
  character: DungeonCharacter,
  relics: Relic[],
  floor = 1,
  extras: ModsExtras = NO_EXTRAS,
): CombatMods {
  /* 局内成长：每清一层 生命 +5 / 攻击 +0.5 / 护盾 +1（仅护盾角色）、主动技冷却 -0.1 秒 */
  const combat = scaleCombatForFloor(CHARACTER_COMBAT[character.id], floor)
  const agg: RelicEffect = {}
  relics.forEach((relic) => {
    /* 缓存污染·隔离（fun-pack.md 三）：被隔离的那场战斗里这条词条完全失效 */
    if (extras.lockedRelicId && relic.id === extras.lockedRelicId) return
    mergeEffect(agg, relic.effect)
  })

  /* 均衡之力：全属性 +10% */
  const all = 1 + (agg.allStatsMult ?? 0)

  /* 批次 C（relic-redesign.md C 节）：先算点亮的流派 combo 集合，
     下面逐条覆盖对应数值——8 条效果点各自标在字段注释处 */
  const comboIds = new Set(getActiveBondDefs(relics).map((bond) => bond.id))

  /* 词条打架（fun-pack3.md 一）：同时持有冲突对 → 变异效果（收益加码 + 持续反噬） */
  const ownedIds = new Set(relics.map((relic) => relic.id))
  const conflictIds = (Object.keys(RELIC_CONFLICTS) as ConflictId[]).filter(
    (id) => RELIC_CONFLICTS[id].requires.every((relicId) => ownedIds.has(relicId)),
  )

  const mods: CombatMods = {
    baseAttack: combat.attack,
    attackFlat: agg.attackFlat ?? 0,
    /* 盲战（fun-pack2.md 一）：看不到血条的人出手更狠 */
    attackMult:
      (1 + (agg.attackMult ?? 0)) * all * (extras.blindCombat ? 1.3 : 1),
    critChance: Math.min(0.8, (combat.critChance + (agg.critChance ?? 0)) * all),
    /* 黑箱拦截（fun-pack3.md 一）：暴击电流回身的代价是暴伤加码 */
    critMult:
      combat.critMult + (agg.critMult ?? 0) + (conflictIds.includes("dark-leak") ? 0.5 : 0),
    critAfterHits: Math.round(agg.critAfterHits ?? 0),
    followupChance: agg.followupChance ?? 0,
    followupRatio: agg.followupRatio ?? 0.5,
    doubleAttackChance: agg.doubleAttackChance ?? 0,
    maxHp: Math.round((combat.maxHp + (agg.maxHpFlat ?? 0)) * all),
    damageReduction: agg.damageReduction ?? 0,
    lowHpReduction: agg.lowHpReduction ?? 0,
    lowHpThreshold: agg.lowHpThreshold ?? 0,
    dodgeChance: Math.min(0.6, combat.dodgeChance + (agg.dodgeChance ?? 0)),
    dodgeWindowMs: DODGE_WINDOW_MS + (agg.dodgeWindowBonusMs ?? 0),
    dodgeCooldownMs: Math.round(
      combat.dodgeCooldownMs * (agg.dodgeCooldownMult ?? 1),
    ),
    activeCooldownMs: Math.round(
      combat.activeCooldownMs * (agg.activeCooldownMult ?? 1),
    ),
    activeDamageMult: agg.activeDamageMult ?? 1,
    /* 限速诅咒：最后乘区 ×1.15（dungeon-route.md 四） */
    attackIntervalMs: Math.round(
      combat.attackIntervalMs *
        (agg.attackIntervalMult ?? 1) *
        (extras.curses.includes("curse-throttle") ? 1.15 : 1),
    ),
    hurtHasteMs: agg.hurtHasteMs ?? 0,
    enemyIntervalMult: (agg.enemyIntervalMult ?? 1) * all,
    penetration: Math.min(1, agg.penetration ?? 0),
    executeAll: agg.executeAll ?? 0,
    executeBonus: agg.executeBonus ?? 0,
    executeThreshold: 0.3,
    killBonusMult: agg.killBonusMult ?? 0,
    startShield: combat.startShield + (agg.startShield ?? 0),
    shieldMax: Math.max(
      1,
      Math.round(combat.shieldMax * (agg.shieldMaxMult ?? 1)),
    ),
    /* 缓存法师被动「伪元素爆炸」+ 词条「伪元素」都打当前敌人 */
    shieldBreakDamage:
      combat.shieldBreakDamage + (agg.shieldBreakDamage ?? 0),
    healPerFloor: agg.healPerFloor ?? 0,
    healOnKill: agg.healOnKill ?? 0,
    idleHealPerSec: agg.idleHealPerSec ?? 0,
    hurtDodgeChance: agg.hurtDodgeChance ?? 0,
    hurtDodgeMs: agg.hurtDodgeMs ?? 0,
    firstHitImmunePerFloor: agg.firstHitImmunePerFloor ?? 0,
    immuneEveryMs: agg.immuneEveryMs ?? 0,
    attackPerFloorMult: agg.attackPerFloorMult ?? 0,
    /* combo·经济流（v2）：Session 的清零代价随进层回满废除后，
       该 combo 的兑现改为「碎片获取额外 +50%」，保住流派的经济定位 */
    fragmentMult:
      (agg.fragmentMult ?? 0) +
      (comboIds.has("combo-economy") ? COMBO_ECONOMY_FRAGMENT_BONUS : 0),
    bonusPickRounds: agg.bonusPickRounds ?? 0,
    rerollPerFloor: agg.rerollPerFloor ?? 0,
    extraChoiceCount: agg.extraChoiceCount ?? 0,
    /* combo·保命流（C 节·5）：断点续传在场时复活概率 0.3 → 0.6；
       跨域顶替掉 N5（原概率 0）时不白送复活，只有概率真实存在才提档 */
    reviveChance:
      comboIds.has("combo-guard") && (agg.reviveChance ?? 0) > 0
        ? COMBO_GUARD_REVIVE_CHANCE
        : (agg.reviveChance ?? 0),
    reviveHpRatio: agg.reviveHpRatio ?? 0.3,
    reviveFullOnce: agg.reviveFullOnce ?? 0,
    deathWardPerFloors: agg.deathWardPerFloors ?? 0,
    /* 内存上限（v2）：基础上限随层成长（8→12），词条 delta 叠加后夹逼 [3,20]——
       规格「上限 < 3 锁定为 3」「任何加成不超过 20」 */
    memoryMax: Math.min(
      MEMORY_MAX_CAP,
      Math.max(
        MEMORY_MIN_CAP,
        memoryBaseMaxForFloor(floor) +
          (agg.memoryMaxDelta ?? 0) +
          (agg.memoryMaxPerFloorDelta ?? 0) * floor +
          /* 浏览器特性包 v1（browser-powers-pack.md 二）：首页磁盘清理换的永久上限
             （前 2 次各 +1，终身 +2），与限流/诅咒压低通道合流、夹逼区间不变 */
          Math.min(loadDungeonSave().diskRewardedCleanups ?? 0, 2) +
          extras.bonusMemoryCap -
          extras.mirrorCapPenalty,
      ),
    ),
    /* 主动技内存成本：角色定值，透传给 useActiveSkill 扣费 */
    skillMemoryCost: combat.skillMemoryCost,
    /* ---- 批次 B：机制字段接线 ---- */
    /* S1/S2 弹射语义按词条 id 判定：mergeEffect 的加和只适用于「跳数」，
       bounceRatio（S1 首跳 50% vs S2 递减 0.7）与 bounceMemoryCost（每跳 1）
       语义不同不能相加，所以这里只认 id；回调地狱单拿也按首跳 50% 处理。
       弹射流 combo（弹射 3 跳且不耗内存）在批次 C 覆盖这两个值。 */
    bounceJumps: comboIds.has("combo-bounce")
      ? /* combo·弹射流（C 节·1）：弹射固定 3 跳（跨域顶替 S1/S2 时也保 3 跳） */
        3
      : (relics.some((r) => r.id === "event-listener") ? 1 : 0) +
        (relics.some((r) => r.id === "callback-hell") ? 2 : 0),
    bounceFirstRatio:
      relics.some((r) => r.id === "event-listener" || r.id === "callback-hell")
        ? 0.5
        : 0,
    bounceStepRatio: relics.some((r) => r.id === "callback-hell") ? 0.7 : 1,
    bounceMemoryCost: comboIds.has("combo-bounce")
      ? /* combo·弹射流（C 节·1）：弹射不耗内存（覆盖 S2 的每跳扣费；trySpendMemory 对 0 放行） */
        0
      : relics.some((r) => r.id === "event-listener" || r.id === "callback-hell")
        ? 1
        : 0,
    closureEcho: agg.closureEcho ?? 0,
    tripleOnHurt: agg.tripleOnHurt ?? 0,
    throttleGain: agg.throttleGain ?? 0,
    chainCrit: agg.chainCrit ?? 0,
    blockActiveMs: agg.blockActiveMs ?? 0,
    decoyAfterDodge: agg.decoyAfterDodge ?? 0,
    responsiveRefactor: agg.responsiveRefactor ?? 0,
    enemySlowMs: agg.enemySlowMs ?? 0,
    shieldSplit: agg.shieldSplit ?? 0,
    /* 批次 C 交接修正（relic-redesign.md B·C5/M5）：C5 与 M5 的数据各带
       minionDeathMemory: 2，同持时 mergeEffect 会加和成 4。规格语义是
       「小护盾死亡回 2」——产出恒 2，改按在场判定、不读加和值。
       护盾流 combo（C1+C5+M5+C6）本就同带两条，产出仍是 2（该 combo 的强化只有伤害 ×2）；
       接线为 C5 在场即产 2，M5 只管击杀（killMemoryGain） */
    minionDeathMemory: relics.some(
      (r) => r.id === "pseudo-element" || r.id === "garbage-collect",
    )
      ? 2
      : 0,
    shieldAttackBonus: agg.shieldAttackBonus ?? 0,
    darkTheme: (agg.darkTheme ?? 0) > 0,
    /* ---- 批次 C：网络系 / 缓存系 / 通用系 + combo 效果覆盖 ---- */
    /** N1 请求拦截：暴击偷内存（hitEnemy 的 crit 分支结算） */
    stealMemoryOnCrit: agg.stealMemoryOnCrit ?? 0,
    /** N2 缓存命中（playerAttack 顶部按 uid 连续计数结算） */
    fourthHitCrit: agg.fourthHitCrit ?? 0,
    memoryGainFourthHit: agg.memoryGainFourthHit ?? 0,
    /** N3 重定向（hitEnemy 击杀处溢出转移，≤1 跳） */
    overflowTransfer: agg.overflowTransfer ?? 0,
    /* combo·穿透流（C 节·8）：穿透不耗内存且穿透位伤害 0.3 → 0.5；
       只在 N4 真实在场提供穿透时生效（跨域顶替 N4 时不白送穿透本体） */
    pierceRatio:
      comboIds.has("combo-pierce") && (agg.pierceRatio ?? 0) > 0
        ? COMBO_PIERCE_RATIO
        : (agg.pierceRatio ?? 0),
    pierceMemoryCost:
      comboIds.has("combo-pierce") && (agg.pierceRatio ?? 0) > 0
        ? 0
        : (agg.pierceMemoryCost ?? 0),
    /** N5 断点续传：复活内存门槛（tryReviveOrDie 处原子扣） */
    reviveMemoryCost: agg.reviveMemoryCost ?? 0,
    /** N6 超时重试：必出稀有以上（timeoutRetryChoices 走 pickRelicChoices 的保底通道） */
    rerollForceRare: agg.rerollForceRare ?? 0,
    /** M1 本地存储：层末入池量（finalize 存、enterFloor 生效清零） */
    storageHealPool: agg.storageHealPool ?? 0,
    /** M5 垃圾回收：击杀回内存（killEnemy 处结算） */
    /* v2：combo·内存流不再减半回复（通道已废），改为击杀额外 +1（与垃圾回收叠加） */
    killMemoryGain:
      (agg.killMemoryGain ?? 0) +
      (comboIds.has("combo-memory") ? COMBO_MEMORY_KILL_GAIN : 0),
    /** M6 Service Worker：免死触发时清场普通召唤物（tryReviveOrDie 处结算） */
    deathWardClearMinions: agg.deathWardClearMinions ?? 0,
    /** G2 热更新：每局 1 次不耗次数的刷新（hotReloadReroll 处结算） */
    freeRerollOnce: agg.freeRerollOnce ?? 0,
    /* combo·斩杀流（C 节·4）：链式暴击内存耗 3 → 1。效果点：playerAttack 链式暴击分支 */
    chainCritMemoryCost: comboIds.has("combo-execute")
      ? COMBO_EXECUTE_CHAIN_COST
      : CHAIN_CRIT_MEMORY_COST,
    /* combo·护盾流（C 节·2）：小护盾爆炸伤害 8 → 16。效果点：advance 的小护盾爆炸 */
    miniShieldDamage: comboIds.has("combo-shield")
      ? MINI_SHIELD_DAMAGE * COMBO_SHIELD_MINI_MULT
      : MINI_SHIELD_DAMAGE,
    /* combo·暗黑流（C 节·7）：暴击对血量 <15% 的普通敌人直接斩杀。
       效果点：hitEnemy 的暴击分支；Boss 不吃（与 executeAll 同理，防跳阶段） */
    blockedByCurse: extras.curses.includes("curse-offline"),
    darkExecuteCritRatio: comboIds.has("combo-dark")
      ? COMBO_DARK_EXECUTE_RATIO
      : 0,
    /* ---- 词条打架（fun-pack3.md 一）：效果点见 tryBounce / playerAttack /
       triggerRelic(offline) / tryReviveOrDie ---- */
    conflicts: conflictIds,
    conflictBounceDouble: conflictIds.includes("listener-debt") ? 1 : 0,
    conflictBounceBackPct: conflictIds.includes("listener-debt") ? 0.3 : 0,
    conflictCritBackHp: conflictIds.includes("dark-leak") ? CONFLICT_CRIT_BACK_HP : 0,
    conflictAwakenEcho: conflictIds.includes("awaken-transfer"),
  }
  /* C1 Flex 布局：startShield 的「每层」语义由 enterFloor 保证——
     每进一层都会把护盾置为 min(shieldMax, startShield)（v3 既有行为），
     持有 flex-layout（startShield +5）时即「每层开始 +5 护盾」。 */

  return mods
}

/* ------------------------------------------------------------------ *
 * 纯函数：敌人与局内状态
 * ------------------------------------------------------------------ */

function cloneEnemy(enemy: EnemyInstance): EnemyInstance {
  return {
    ...enemy,
    buttons: enemy.buttons.map((button) => ({ ...button })),
    boss: enemy.boss
      ? {
          ...enemy.boss,
          skills: enemy.boss.skills.map((skill) => ({ ...skill })),
          pending: enemy.boss.pending ? { ...enemy.boss.pending } : null,
        }
      : null,
  }
}

/** 第 6 层：中央随机浮出 3 个图案，其中一个高亮当答案 */
function makeChallenge(now: number): CaptchaChallenge {
  const pool = [...CAPTCHA_SYMBOLS].sort(() => Math.random() - 0.5)
  const options = pool.slice(0, Math.max(2, CAPTCHA_OPTION_COUNT))
  const answer = options[Math.floor(Math.random() * options.length)] ?? options[0]
  return {
    options,
    answer,
    startedAt: now,
    expiresAt: now + CAPTCHA_CHALLENGE_WINDOW_MS,
    result: "pending",
    resultUntil: 0,
  }
}

type EnemySeed = {
  defId: string
  hp: number
  attack: number
  shield?: number
  guarded?: boolean
  regen?: boolean
  now: number
  /** 站位序号（-1 = Boss 技能召唤出来的小怪） */
  slot: number
  attackMult?: number
  /** 第一次出手（起前摇）的时间 */
  startAt: number
  telegraphMs: number
  minion?: boolean
  /** 精英敌人：血量 / 攻击按 ELITE_* 倍率放大 */
  elite?: boolean
  spawnSkillId?: string | null
  killShards?: number
  attackCut?: number
  /** C7 暗黑模式：生成即血量减半（含 Boss 与后续召唤物，relic-redesign.md B·C7） */
  darkTheme?: boolean
  /** 种子生成的标签（EnemyTagId 字符串形态） */
  tags?: string[]
  /** 双面回廊：成对广告的正面 / 背面标记 */
  twin?: "front" | "back"
}

let enemySeq = 0

function makeEnemy(seed: EnemySeed): EnemyInstance {
  const def = ENEMY_DEFS[seed.defId] ?? ENEMY_DEFS.popup
  const isAdBoss = def.id === "boss-fullscreen"
  const isCrashBoss = def.id === "boss-crash"
  const now = seed.now
  const attackMult = seed.attackMult ?? 1
  /* C7 暗黑模式：一切血量减半在此统一处理（含 Boss 本体与按钮），
     放在精英倍率之前，两者可叠（relic-redesign.md B·C7「Boss 也减半——规格如此」） */
  const darkHp = seed.darkTheme
    ? Math.max(1, Math.round(seed.hp * DARK_HP_MULT))
    : seed.hp
  /* 精英敌人：血量 ×1.8、攻击 ×1.25（取整） */
  const elite = Boolean(seed.elite)
  const eliteHp = elite
    ? Math.max(1, Math.round(darkHp * ELITE_HP_MULT))
    : darkHp
  const eliteAttack = elite
    ? Math.max(1, Math.round(seed.attack * ELITE_ATTACK_MULT))
    : seed.attack

  /* C7 暗黑模式：小 Boss 阶段 1 的按钮血也减半（Boss 整体减半的一部分） */
  const buttonHp = seed.darkTheme
    ? Math.max(1, Math.round(BOSS_AD_BUTTON_HP * DARK_HP_MULT))
    : BOSS_AD_BUTTON_HP
  const buttons: BossButton[] = isAdBoss
    ? Array.from({ length: BOSS_AD_BUTTONS }, (_, i) => ({
        id: `${def.id}-btn-${i}`,
        label: BOSS_AD_BUTTON_LABELS[i] ?? "关闭 ×",
        maxHp: buttonHp,
        hp: buttonHp,
        closed: false,
      }))
    : []
  const buttonTotal = buttons.reduce((sum, button) => sum + button.hp, 0)
  const bodyHp = isAdBoss ? eliteHp : 0

  const boss: BossState | null =
    isAdBoss || isCrashBoss
      ? {
          phase: 1,
          bodyHp,
          bodyMaxHp: bodyHp,
          speedCut: false,
          attackDouble: false,
          dodgeBonus: 0,
          skillsPhase: 0,
          seq: null,
          skills: [],
          pending: null,
        }
      : null

  const totalHp = isAdBoss ? buttonTotal + bodyHp : eliteHp
  const shield = seed.shield ?? 0

  /* 第 3 层带盾广告每 3 秒补 5 护盾；第 7 层内存泄漏每 3 秒刷 10 护盾 */
  let shieldRegenEveryMs = 0
  let shieldRegenAmount = 0
  if (def.id === "ad" && shield > 0) {
    shieldRegenEveryMs = AD_SHIELD_REGEN_MS
    shieldRegenAmount = AD_SHIELD_REGEN_AMOUNT
  } else if (def.id === "leak") {
    shieldRegenEveryMs = LEAK_SHIELD_REFRESH_MS
    shieldRegenAmount = LEAK_SHIELD_REFRESH_AMOUNT
  }

  enemySeq += 1

  return {
    uid: `${def.id}-${seed.slot}-${enemySeq}-${Math.round(now)}`,
    defId: def.id,
    displayName: def.displayName,
    trait: def.trait,
    kind: def.kind,
    maxHp: totalHp,
    hp: totalHp,
    attack: Math.max(1, Math.round(eliteAttack * attackMult)),
    attackIntervalMs: def.attackIntervalMs,
    defense: def.defense,
    slot: seed.slot,
    intervalMult: 1,
    nextAttackAt: seed.startAt,
    telegraphUntil: 0,
    telegraphMs: Math.max(0, seed.telegraphMs),
    pendingAttackMult: 1,
    hiddenBonusPending: false,
    hitAt: 0,
    closing: false,
    closedAt: 0,
    shield,
    pausedUntil: 0,
    hiddenUntil: 0,
    regenEveryMs: seed.regen ? LEAK_REGEN_MS : 0,
    regenAmount: seed.regen ? LEAK_REGEN_AMOUNT : 0,
    regenNextAt: seed.regen ? now + LEAK_REGEN_MS : 0,
    regenFlashUntil: 0,
    shieldRegenEveryMs,
    shieldRegenAmount,
    shieldRegenNextAt: shieldRegenEveryMs > 0 ? now + shieldRegenEveryMs : 0,
    guarded: Boolean(seed.guarded),
    brokenUntil: 0,
    minion: Boolean(seed.minion),
    elite,
    spawnSkillId: seed.spawnSkillId ?? null,
    killShards: seed.killShards ?? def.killShards ?? 0,
    attackCut: seed.attackCut ?? 0,
    buttons,
    boss,
    popupXUntil: 0,
    attackSlowUntil: 0,
    enraged: false,
    riftDeadline: 0,
    tags: seed.tags ?? [],
    virusTag: (seed.tags ?? []).includes("virus"),
    /* 弹窗干扰包：只有「正主」弹窗敌会吐糊屏弹窗（Boss 召唤的小弹窗不吐） */
    jamNextAt:
      def.id === "popup" && !seed.minion ? now + POPUP_JAM_FIRST_MS : undefined,
    /* ---- 核心体验包 v1：三块机制的初始计时 ---- */
    twin: seed.twin,
    twinBurstNextAt:
      seed.twin === "back" ? now + TWIN_BURST_MS : undefined,
    /* 跳转弹窗：与糊屏弹窗同一批「正主」弹窗敌（boss minion 不参与） */
    jumpNextAt:
      def.id === "popup" && !seed.minion ? now + JUMP_INTERVAL_MS : undefined,
    /* leak 偷内存：leak 系（含精英 / 强化档，按 defId 判定） */
    leakStealNextAt: def.id === "leak" ? now + LEAK_STEAL_MS : undefined,
  }
}

function createEnemies(
  config: FloorConfig,
  now: number,
  attackMult = 1,
  /** C7 暗黑模式：本层敌人（含 Boss）生成即血量减半 */
  darkTheme = false,
): EnemyInstance[] {
  const stagger = config.staggerMs > 0 ? config.staggerMs : 350
  const list = config.enemies.map((spec, index) =>
    makeEnemy({
      defId: spec.defId,
      hp: spec.hp,
      attack: spec.attack,
      shield: spec.shield ?? 0,
      guarded: Boolean(spec.guard),
      regen: Boolean(spec.regen),
      elite: Boolean(spec.elite),
      now,
      slot: index,
      attackMult,
      startAt: now + 1400 + index * stagger,
      telegraphMs: config.telegraphMs,
      darkTheme,
      tags: spec.tags,
      twin: spec.twin,
    }),
  )
  /* 深化包：每层病毒携带者最多 1 个（保留列表最前一个，其余剥掉病毒） */
  let virusSeen = false
  list.forEach((enemy) => {
    if (!enemy.tags.includes("virus")) return
    if (virusSeen) {
      enemy.tags = enemy.tags.filter((tag) => tag !== "virus")
      enemy.virusTag = false
      return
    }
    virusSeen = true
  })
  return list
}

let popSeq = 0

function pushPop(
  state: RunState,
  kind: PopKind,
  amount: number,
  crit = false,
) {
  popSeq += 1
  state.pops = [
    ...state.pops,
    {
      id: popSeq,
      kind,
      amount,
      crit,
      at: state.now,
      x: 10 + Math.random() * 76,
    },
  ]
}

let fxSeq = 0

/** 攻击轨迹特效（glitch-feel-pack.md 二）：只挂短命记录，渲染全部在 View */
function pushFx(
  state: RunState,
  kind: AttackFxKind,
  uid: string | null,
  big: boolean,
) {
  fxSeq += 1
  state.fx = [...(state.fx ?? []), { id: fxSeq, kind, uid, at: state.now, big }].filter(
    (item) => state.now - item.at < ATTACK_FX_LIFE_MS,
  )
}

function pushLog(state: RunState, text: string) {
  state.log = [text, ...state.log].slice(0, 5)
}

/** 教学浮字：只在设置允许时挂上，seq 递增供 View 重新触发一次淡入 */
function pushTip(state: RunState, text: string) {
  if (!state.coachOn) return
  const seq = (state.coachTip?.seq ?? 0) + 1
  state.coachTip = { text, seq }
}

function healPlayer(state: RunState, amount: number) {
  if (amount <= 0) return
  const before = state.playerHp
  state.playerHp = Math.min(state.playerMaxHp, state.playerHp + amount)
  const gained = state.playerHp - before
  if (gained > 0) pushPop(state, "heal", gained)
}

function aliveEnemies(state: RunState): EnemyInstance[] {
  return state.enemies.filter((enemy) => !enemy.closing)
}

/** 隐身中的敌人不能被锁定 / 被自动攻击 */
function visibleEnemies(state: RunState): EnemyInstance[] {
  const visible = state.enemies.filter(
    (enemy) => !enemy.closing && enemy.hiddenUntil <= state.now,
  )
  return visible.length > 0 ? visible : aliveEnemies(state)
}

function currentTarget(state: RunState): EnemyInstance | null {
  const alive = visibleEnemies(state)
  if (alive.length === 0) return null
  const locked = alive.find((enemy) => enemy.uid === state.lockedUid)
  return locked ?? alive[0]
}

function activeBoss(state: RunState): EnemyInstance | null {
  return (
    state.enemies.find(
      (enemy) =>
        !enemy.closing && (enemy.kind === "boss" || enemy.kind === "bigboss"),
    ) ?? null
  )
}

/** Boss 台词只做气氛：同一句已经在显示时不重复设置，免得刷屏 */
function setBossLine(
  state: RunState,
  boss: EnemyInstance | null,
  entry: BossLineEntry | null,
) {
  if (!boss || !entry) return
  const key = bossLineKey(entry)
  if (state.bossLine?.key === key) return
  state.bossLineSeq += 1
  state.bossLine = { key, text: entry.text, seq: state.bossLineSeq }
}

/** 大 Boss 阶段 3：玩家闪避 +20% */
function bossDodgeBonus(state: RunState): number {
  const boss = activeBoss(state)
  return boss?.boss?.dodgeBonus ?? 0
}

/** 小 Boss：按钮关完进阶段 2；大 Boss：按血量推进三阶段 */
function syncBoss(state: RunState) {
  state.enemies.forEach((enemy) => {
    if (!enemy.boss || enemy.closing) return

    if (enemy.defId === "boss-fullscreen") {
      if (enemy.boss.phase === 1) {
        const open = enemy.buttons.filter((button) => !button.closed)
        if (open.length === 0) {
          enemy.boss.phase = 2
          enemy.hp = enemy.boss.bodyHp
          pushLog(state, "四个关闭按钮都点掉了 · 广告本体暴露")
          setBossLine(state, enemy, findBossLine(enemy.defId, "phase", { phase: 2 }))
        } else {
          enemy.hp = open.reduce((sum, b) => sum + b.hp, 0) + enemy.boss.bodyHp
        }
      } else {
        enemy.hp = enemy.boss.bodyHp
      }
      return
    }

    let phase = 1
    if (enemy.hp <= BOSS_CRASH_PHASE3_AT) phase = 3
    else if (enemy.hp <= BOSS_CRASH_PHASE2_AT) phase = 2
    /* Boss 回血不倒退阶段，免得刚进的阶段又被吐回去 */
    if (phase < enemy.boss.phase) phase = enemy.boss.phase
    if (phase !== enemy.boss.phase) {
      enemy.boss.phase = phase
      pushLog(state, `${enemy.displayName} 进入${BOSS_CRASH_PHASE_LABEL[phase - 1]}`)
      setBossLine(state, enemy, findBossLine(enemy.defId, "phase", { phase }))
      /* 趣味包（fun-pack.md 二）：崩溃 Boss 越急，页面越坏——阶段 2 乱码、阶段 3 反色+漂移 */
      if (enemy.defId === "boss-crash") {
        if (phase === 2) {
          fireGlitch(state, "scramble")
          /* 抢按钮（fun-pack2.md 一）：崩溃把主动技按钮抓到战斗区里乱窜 */
          if (!state.skillSnatched) {
            state.skillSnatched = true
            state.snatchXPct = 12 + Math.random() * 68
            state.snatchYPct = 18 + Math.random() * 48
            pushBanner(state, "崩溃 Boss 抢走了你的技能按钮！")
            pushStory(state, "技能按钮被崩溃 Boss 抢走了，得点回来")
            playSfx("comboBreak")
          }
        }
        if (phase === 3) {
          fireGlitch(state, "invert")
          armGlitch(state, "drift", state.now + 2000)
        }
        /* 阶段 2 起假按钮开始周期性冒头 */
        if (!state.lowSpec && phase >= 2) {
          state.fakeButtonArmedAt = Math.max(state.fakeButtonArmedAt, state.now + 3000)
        }
      }
    }
    enemy.boss.speedCut = phase >= 2
    enemy.boss.attackDouble = phase >= 3
    enemy.boss.dodgeBonus = phase >= 3 ? BOSS_CRASH_DODGE_BONUS : 0
  })
}

/* ------------------------------------------------------------------ *
 * Boss 技能表：按阶段装表、走冷却、前摇落地
 * ------------------------------------------------------------------ */

/* 本局种子的 Boss 阶段技能序列（seed-system.md 八）：模块级缓存，不进 RunState */
const bossSkillCache = new Map<string, Record<number, BossSkill[]>>()

function genBossSeqCached(
  seed: string,
  kind: "ad" | "crash",
): Record<number, BossSkill[]> {
  const key = `${seed}:${kind}`
  let seq = bossSkillCache.get(key)
  if (!seq) {
    seq = genBossSkills(seed, kind)
    bossSkillCache.set(key, seq)
  }
  return seq
}

/** 给进层的 Boss 烘焙本局种子的技能序列 */
function bakeBossSkills(state: RunState) {
  state.enemies.forEach((enemy) => {
    if (!enemy.boss || enemy.boss.seq) return
    if (enemy.defId === "boss-fullscreen") {
      enemy.boss.seq = genBossSeqCached(state.seed, "ad")
    } else if (enemy.defId === "boss-crash") {
      enemy.boss.seq = genBossSeqCached(state.seed, "crash")
    }
  })
}

function bossSkillTable(boss: EnemyInstance): BossSkill[] {
  if (!boss.boss) return []
  const seq = boss.boss.seq
  if (!seq) return []
  return seq[boss.boss.phase] ?? seq[1] ?? []
}

function findBossSkill(boss: EnemyInstance | null, id: string): BossSkill | null {
  if (!boss) return null
  return bossSkillTable(boss).find((skill) => skill.id === id) ?? null
}

/** 阶段一变就换一整套技能表（都从「下一拍」开始跑） */
function syncBossSkills(state: RunState, boss: EnemyInstance) {
  const bossState = boss.boss
  if (!bossState) return
  if (bossState.skillsPhase === bossState.phase) return
  bossState.skillsPhase = bossState.phase
  const table = bossSkillTable(boss)
  const lead = bossState.phase <= 1 ? 1600 : 900
  bossState.skills = table.map((def, index) => ({
    id: def.id,
    nextReadyAt: state.now + lead + index * 700,
  }))
  bossState.pending = null
}

/** 生成小怪：Boss 技能召唤出来的，击杀掉碎片 */
function spawnMinions(state: RunState, boss: EnemyInstance, def: BossSkill) {
  const spawn = def.spawn
  if (!spawn) return
  const now = state.now
  const cursed = state.cursedFloor === state.floor
  const fresh: EnemyInstance[] = []
  /* 第 4 层广告 Boss 阶段 1 冒出的弹窗：右上角也亮 × */
  const popupX =
    spawn.defId === "popup" &&
    boss.defId === "boss-fullscreen" &&
    boss.boss?.phase === 1
  for (let i = 0; i < spawn.count; i += 1) {
    const startAt = now + 1200 + i * 300
    const minion = makeEnemy({
      defId: spawn.defId,
      hp: spawn.hp,
      attack: spawn.attack,
      now,
      slot: -1,
      attackMult: cursed ? CURSE_ATTACK_MULT : 1,
      startAt,
      telegraphMs: TELEGRAPH_DEFAULT_MS,
      minion: true,
      spawnSkillId: def.id,
      killShards: def.killShards ?? 0,
      attackCut: def.playerAttackCut ?? 0,
      /* C7 暗黑模式：Boss 技能后续生成的召唤物同样血量减半（relic-redesign.md B·C7「含后续生成」） */
      darkTheme: state.mods.darkTheme,
    })
    if (popupX) {
      minion.popupXUntil = startAt + POPUP_X_WINDOW_MS
    }
    fresh.push(minion)
  }
  state.enemies = [...state.enemies, ...fresh]
  pushLog(state, `${boss.displayName} · ${def.name}，冒出 ${spawn.count} 个${spawn.label}`)
}

/* ---------------- 批次二收尾·Boss QTE 结算引擎 ---------------- */

/** 一个 QTE 技能的规格（由技能 id 推出） */
type QteSpec = {
  kind: QteKind
  title: string
  target: number
  totalMs: number
  failDamage: number
  popups?: boolean
}

/** 4 个升级为 QTE 的 Boss 技能；其余技能返回 null 走原结算 */
function qteSpecForSkill(skillId: string): QteSpec | null {
  switch (skillId) {
    case QTE_SKILL_WATCH:
      return {
        kind: "tap",
        title: "快速点击！",
        target: QTE_WATCH_TAPS,
        totalMs: QTE_WATCH_WINDOW_MS,
        failDamage: QTE_WATCH_FAIL_DAMAGE,
      }
    case QTE_SKILL_REDIRECT:
      return {
        kind: "swipe",
        title: "向左滑动！",
        target: QTE_REDIRECT_SWIPES,
        totalMs: QTE_REDIRECT_WINDOW_MS,
        failDamage: 0,
      }
    case QTE_SKILL_RAIN:
      return {
        kind: "clicks",
        title: "点掉弹窗！",
        target: QTE_RAIN_CLICKS,
        totalMs: QTE_RAIN_WINDOW_MS,
        failDamage: 0,
        popups: true,
      }
    case QTE_SKILL_CRASH:
      return {
        kind: "press",
        title: "长按屏幕！",
        target: QTE_CRASH_HOLD_MS,
        totalMs: QTE_CRASH_HOLD_MS,
        failDamage: QTE_CRASH_FAIL_DAMAGE,
      }
    default:
      return null
  }
}

/** 弹窗雨：随机位置散落 count 个带 × 的弹窗 */
function makeQtePopups(count: number): QtePopup[] {
  const popups: QtePopup[] = []
  for (let i = 0; i < count; i += 1) {
    popups.push({
      id: i + 1,
      x: 12 + Math.random() * 72,
      y: 22 + Math.random() * 44,
    })
  }
  return popups
}

/** 打开一次 QTE：只挂状态 + 起警报音，不结算（结算等玩家应对结果） */
function openBossQte(state: RunState, def: BossSkill, spec: QteSpec) {
  state.qte = {
    kind: spec.kind,
    skillId: def.id,
    title: spec.title,
    target: spec.target,
    progress: 0,
    totalMs: spec.totalMs,
    popups: spec.popups ? makeQtePopups(spec.target) : undefined,
    failDamage: spec.failDamage,
  }
  state.qteSeq += 1
  state.bossFlashUntil = state.now + 420
  playSfx("qteAlert")
  pushLog(state, `${def.name} · 关键帧应对！${spec.title}`)
  if (!state.coachQteDone) {
    state.coachQteDone = true
    pushTip(state, "Boss 关键帧操作来了 · 按屏幕中央提示快速应对")
  }
}

/** 失败惩罚倍率：休闲 0（视为成功，不罚）、标准 1、硬核 1.5 */
function qtePenaltyMult(mode: PlayMode): number {
  if (mode === "casual") return 0
  if (mode === "hardcore") return HARDCORE_PENALTY_MULT
  return 1
}

/** 硬核附加加罚（仅第 4 层起）：解除眩晕 / 冻结，让全体敌人立刻补一次出手 */
function hardcoreFailExtra(state: RunState) {
  if (state.playMode !== "hardcore") return
  if (state.floor < HARDCORE_EXTRA_FROM_FLOOR) return
  state.bossStunUntil = 0
  state.freezeUntil = 0
  const now = state.now
  state.enemies = state.enemies.map((enemy) => {
    if (enemy.closing) return enemy
    return { ...enemy, telegraphUntil: now }
  })
  pushLog(state, "硬核加罚 · 敌人立刻出手补了一刀")
}

/** QTE 结算：奖励三档通用，惩罚按模式；休闲下失败只提示不罚 */
function resolveBossQte(prev: RunState, result: "success" | "fail"): RunState {
  if (!prev.qte) return prev
  const qte = prev.qte
  const state: RunState = { ...prev, qte: { ...qte } }
  const skillId = qte.skillId
  const casual = state.playMode === "casual"
  state.qte = null

  /* 休闲模式：失败视为不奖不罚，只展示提示、不留惩罚 */
  if (result === "fail" && casual) {
    playSfx("qteFail")
    pushBanner(state, "应对失败（休闲模式无惩罚）")
    pushLog(state, "休闲模式 · 这次没应对上，但没有惩罚")
    return state
  }

  if (result === "success") {
    playSfx("qteHit")
    pushBanner(state, "完美应对！")
    switch (skillId) {
      case QTE_SKILL_WATCH:
        state.bossStunUntil = state.now + QTE_WATCH_STUN_MS
        pushLog(state, "完美应对 · 强制观看被打断，Boss 眩晕 2 秒")
        break
      case QTE_SKILL_REDIRECT:
        pushLog(state, "完美应对 · 强制跳转被取消，攻速没减")
        break
      case QTE_SKILL_RAIN:
        healPlayer(state, QTE_RAIN_HEAL)
        state.qteAttackCutUntil = 0
        state.qteAttackCutRatio = 0
        pushLog(state, `完美应对 · 清屏弹窗雨，回了 ${QTE_RAIN_HEAL} 点血`)
        break
      case QTE_SKILL_CRASH:
        pushLog(state, "完美应对 · 稳住了崩溃页面，免疫了这一下")
        break
    }
    return state
  }

  /* 失败（标准 / 硬核）：应用惩罚，伤害 / 时长按模式倍率 */
  playSfx("qteFail")
  pushBanner(state, "应对失败")
  const mult = qtePenaltyMult(state.playMode)
  const boss = activeBoss(state)
  switch (skillId) {
    case QTE_SKILL_WATCH: {
      const dmg = Math.max(1, Math.round(QTE_WATCH_FAIL_DAMAGE * mult))
      if (boss) hurtPlayer(state, boss, dmg)
      else state.playerHp = Math.max(0, state.playerHp - dmg)
      pushLog(state, `没点掉强制观看 · 挨了 ${dmg} 点`)
      break
    }
    case QTE_SKILL_REDIRECT: {
      const ms = Math.round(QTE_REDIRECT_CUT_MS * mult)
      state.bossSpeedCutUntil = state.now + ms
      pushLog(state, `没扛住强制跳转 · 攻速减半 ${Math.round(ms / 1000)} 秒`)
      break
    }
    case QTE_SKILL_RAIN: {
      const ms = Math.round(QTE_RAIN_FAIL_CUT_MS * mult)
      state.qteAttackCutRatio = QTE_RAIN_FAIL_CUT
      state.qteAttackCutUntil = state.now + ms
      pushLog(state, "弹窗没点完 · 玩家攻击下降 20%")
      break
    }
    case QTE_SKILL_CRASH: {
      const dmg = Math.max(1, Math.round(QTE_CRASH_FAIL_DAMAGE * mult))
      if (boss) hurtPlayer(state, boss, dmg)
      else state.playerHp = Math.max(0, state.playerHp - dmg)
      pushLog(state, `没扛住最终崩溃 · 屏幕炸了扣 ${dmg} 点`)
      break
    }
  }
  hardcoreFailExtra(state)
  return state
}

/* ---- QTE 计进度的三类玩家操作（press 类走 React 侧墙钟，不在这） ---- */

/** tap：快连点跳过按钮 */
export function qteTap(prev: RunState): RunState {
  const q = prev.qte
  if (!q || prev.phase !== "fighting" || prev.paused) return prev
  if (q.kind !== "tap" || q.progress >= q.target) return prev
  const next: RunState = { ...prev, qte: { ...q, progress: q.progress + 1 } }
  playSfx("pick")
  if (next.qte && next.qte.progress >= next.qte.target) {
    return resolveBossQte(next, "success")
  }
  return next
}

/** swipe：向左滑动 */
export function qteSwipeLeft(prev: RunState): RunState {
  const q = prev.qte
  if (!q || prev.phase !== "fighting" || prev.paused) return prev
  if (q.kind !== "swipe" || q.progress >= q.target) return prev
  const next: RunState = { ...prev, qte: { ...q, progress: q.progress + 1 } }
  playSfx("dodge")
  if (next.qte && next.qte.progress >= next.qte.target) {
    return resolveBossQte(next, "success")
  }
  return next
}

/** clicks：点掉某个弹窗的 × */
export function qtePopupClick(prev: RunState, popupId: number): RunState {
  const q = prev.qte
  if (!q || prev.phase !== "fighting" || prev.paused) return prev
  if (q.kind !== "clicks" || !q.popups) return prev
  const remaining = q.popups.filter((popup) => popup.id !== popupId)
  if (remaining.length === q.popups.length) return prev
  playSfx("close")
  const clicked = q.target - remaining.length
  const next: RunState = {
    ...prev,
    qte: { ...q, popups: remaining, progress: clicked },
  }
  if (remaining.length === 0) {
    return resolveBossQte(next, "success")
  }
  return next
}

/** press：开始按住（最终崩溃 QTE）。只标记按住，实际长按时长走 React 侧墙钟 */
export function qtePressStart(prev: RunState): RunState {
  const q = prev.qte
  if (!q || prev.phase !== "fighting" || prev.paused) return prev
  if (q.kind !== "press") return prev
  return { ...prev, qte: { ...q, pressing: true } }
}

/** press：松手或按满。heldMs = 本次实际按住时长，按满 target(=2 秒) 成功免疫，窗口内松手 = 失败结算 */
export function qtePressEnd(prev: RunState, heldMs: number): RunState {
  const q = prev.qte
  if (!q || q.kind !== "press" || !q.pressing) return prev
  const cleared: RunState = { ...prev, qte: { ...q, pressing: false } }
  if (heldMs >= q.target) return resolveBossQte(cleared, "success")
  return resolveBossQte(cleared, "fail")
}

/** QTE 窗口耗尽仍未完成 → 失败结算（与 press 松手失败同一条路径，模式倍率在 resolveBossQte 里） */
export function qteTimeout(prev: RunState): RunState {
  if (!prev.qte || prev.phase !== "fighting") return prev
  return resolveBossQte(prev, "fail")
}

/** 前摇走完，技能真正落地 */
function resolveBossSkill(
  state: RunState,
  boss: EnemyInstance,
  pending: BossPendingSkill,
) {
  const def = findBossSkill(boss, pending.id)
  if (!def) return
  const now = state.now
  /* 放技能时换一句台词（只做气氛，技能效果本身一点不改） */
  setBossLine(state, boss, findBossLine(boss.defId, "skill", { skillId: def.id }))

  /* 批次二收尾·4 个 Boss 技能升级为 QTE：把结算交给玩家关键帧操作，其余技能照旧 */
  const qteSpec = qteSpecForSkill(def.id)
  if (qteSpec) {
    openBossQte(state, def, qteSpec)
    return
  }

  /* 强制观看：先给一个限时跳过按钮，点不掉才挨打 */
  if (def.clickLabel) {
    state.bossClick = {
      label: def.clickLabel,
      skillId: def.id,
      expiresAt: now + (def.clickWindowMs ?? 1500),
    }
    state.bossFlashUntil = now + 420
    pushLog(state, `${def.name} · 屏幕暗了，${def.clickLabel}（1.5 秒）`)
    return
  }

  if (def.spawn) {
    /* 上一批没清掉 → 本体回血 */
    const leftover = state.enemies.filter(
      (item) =>
        !item.closing && item.minion && item.spawnSkillId === def.id,
    )
    if (def.regenIfAlive && leftover.length > 0 && boss.boss) {
      healBoss(state, boss, def.regenIfAlive)
      pushLog(
        state,
        `${def.name} 没清干净 · ${boss.displayName} 回了 ${def.regenIfAlive} 血`,
      )
    }
    spawnMinions(state, boss, def)
  } else if (def.regenIfAlive && boss.boss) {
    const leftover = state.enemies.filter((item) => !item.closing && item.minion)
    if (leftover.length > 0) {
      healBoss(state, boss, def.regenIfAlive)
      pushLog(
        state,
        `${def.name} · 小怪还在，${boss.displayName} 回了 ${def.regenIfAlive} 血`,
      )
    }
  }

  if (def.damage) {
    state.bossFlashUntil = now + 480
    hurtPlayer(state, boss, def.damage)
  }
  if (def.speedCutMs) {
    state.bossSpeedCutUntil = now + def.speedCutMs
    pushLog(state, `${def.name} · 你的攻速减半 ${Math.round(def.speedCutMs / 1000)} 秒`)
  }
  /* 浏览器特性包 v1（browser-powers-pack.md 一）：分身窗口开始读条。
     主战场照常跑（自动攻击/敌人出手/计时全不暂停）——注意力就是代价 */
  if (def.id === "ad-tabsync") {
    state.bossCloneCastUntil = now + CLONE_CAST_MS
    state.bossCloneTaps = CLONE_TAPS
    playSfx("jamIn")
    pushBanner(state, "广告分身在新窗口开始读条了！")
    pushLog(state, "多标签同步 · 标签栏冒出分身，切过去连点 3 下打断它")
  }
  if (def.clearShield && state.shield > 0) {
    state.shield = 0
    pushLog(state, `${def.name} · 护盾被清空`)
  }
  if (def.forceRetarget) {
    state.lockedUid = null
    retarget(state)
    pushLog(state, `${def.name} · 锁定目标被切走了`)
  }
}

function healBoss(state: RunState, boss: EnemyInstance, amount: number) {
  if (!boss.boss) return
  if (boss.defId === "boss-fullscreen") {
    boss.boss.bodyHp = Math.min(boss.boss.bodyMaxHp, boss.boss.bodyHp + amount)
  } else {
    boss.hp = Math.min(boss.maxHp, boss.hp + amount)
    boss.boss.bodyHp = boss.hp
  }
  syncBoss(state)
}

/** 每帧推进 Boss 技能：装表 → 到点起前摇 → 前摇落地 */
function advanceBossSkills(state: RunState, now: number) {
  /* 「任务管理器」冻结中：Boss 也不起新前摇、不放技能 */
  if (state.freezeUntil > now) return
  /* Boss QTE 成功造成的眩晕：这段时间 Boss 不蓄力、不放技能 */
  if (state.bossStunUntil > now) return
  const boss = activeBoss(state)
  if (!boss || boss.closing || !boss.boss) return
  const bossState = boss.boss
  syncBossSkills(state, boss)

  const pending = bossState.pending
  if (pending) {
    if (now >= pending.telegraphUntil) {
      bossState.pending = null
      resolveBossSkill(state, boss, pending)
    }
    return
  }

  const ready = bossState.skills.find((skill) => now >= skill.nextReadyAt)
  if (!ready) return
  const def = bossSkillTable(boss).find((skill) => skill.id === ready.id)
  if (!def) return

  /* HUD 构筑包·隐蔽：Boss 蓄力也走前摇统一口径（WarningZone 读 telegraphUntil 同源） */
  const tMs = telegraphMsFor(state, def.telegraphMs)
  ready.nextReadyAt = now + tMs + def.cdMs
  bossState.pending = {
    id: def.id,
    name: def.name,
    desc: def.desc,
    counter: def.counter,
    telegraphUntil: now + tMs,
    dodgeable: Boolean(def.dodgeable),
    damage: def.damage ?? 0,
    clickLabel: def.clickLabel ?? null,
    clickWindowMs: def.clickWindowMs ?? 0,
  }
  if (def.telegraphMs > 0) {
    pushLog(state, `${def.name} 正在蓄力 · ${def.counter}`)
  }
}

/** 强制观看没点掉：落地成伤害 */
function expireBossClick(state: RunState, now: number) {
  const prompt = state.bossClick
  if (!prompt || now < prompt.expiresAt) return
  const boss = activeBoss(state)
  const def = findBossSkill(boss, prompt.skillId)
  state.bossClick = null
  if (boss && def) {
    pushLog(state, `没点掉「${prompt.label}」· 挨了一下`)
    hurtPlayer(state, boss, def.damage ?? 6)
  }
}

/** 碎片入账（局内余额）：付费三件套 / 结算都读同一个 shards */
function creditShards(state: RunState, amount: number) {
  if (amount <= 0) return
  state.shards += amount
  state.shardPulseAt = state.now
}

/** 掉落一枚碎片点：同屏超过上限时，最旧的那枚立即全额入账腾位 */
function dropShardDot(state: RunState, enemy: EnemyInstance, amount: number) {
  const alive = state.enemies.filter((item) => !item.closing).length
  const total = Math.max(1, alive + 1)
  const idx = enemy.slot >= 0 ? enemy.slot % total : total - 1
  const x = Math.min(88, Math.max(6, ((idx + 0.5) / total) * 100))
  state.shardDots = [...state.shardDots]
  while (state.shardDots.length >= SHARD_DOT_MAX) {
    const oldest = state.shardDots.shift()
    if (oldest) creditShards(state, oldest.amount)
  }
  state.shardSeq += 1
  state.shardDots.push({
    id: state.shardSeq,
    x,
    amount,
    expireAt: state.now + SHARD_DOT_LIFE_MS,
  })
}

/** 叠一层点击连击（补刀与碎片拾取共用）：续上衰减计时、限上限 */
function bumpClickCombo(state: RunState) {
  const hasEventListener = state.relics.some(
    (relic) => relic.id === CLICK_COMBO_EVENT_LISTENER_ID,
  )
  const cap = clickEnemyTapCap(hasEventListener)
  if (state.clickCombo < cap) {
    state.clickCombo += 1
    state.clickComboExpireAt = state.now + CLICK_COMBO_DECAY_MS
    if (state.clickCombo >= cap) playSfx("comboMax")
    else playComboStackSfx(state.clickCombo)
  } else {
    state.clickComboExpireAt = state.now + CLICK_COMBO_DECAY_MS
  }
}

/** HUD 横幅：与教学浮字相互独立，无论是否开教学都显示 */
function pushBanner(state: RunState, text: string) {
  const seq = (state.banner?.seq ?? 0) + 1
  state.banner = { text, seq }
}

/* ------------------------------------------------------------------ *
 * 深化包（deepening-pack.md）：内存碎片 / 内存超频 / 病毒传染变异
 * ------------------------------------------------------------------ */

/* 碎片（一）：战斗时间每 25 秒 +1，上限 8；≥5 时常驻攻速 -10% */
const MEM_FRAG_INTERVAL_MS = 25000
const MEM_FRAG_MAX = 8
const MEM_FRAG_HEAVY_AT = 5
const MEM_FRAG_HEAVY_INTERVAL_MULT = 1.1
/** 卡顿/耗尽区强行放主动技也攒碎片（内存低于此比例） */
const MEM_FRAG_SKILL_RATIO = 0.4
/* 超频（二）：8 秒爆发 → 10 秒过热卡顿，每层一次 */
const OC_BURST_MS = 8000
const OC_PENALTY_MS = 10000
const OC_MEM_COST = 3
const OC_MIN_MEM = 6
const OC_HASTE_MULT = 1.2
const OC_PENALTY_FRAGS = 3
/* 病毒（三）：引爆参数与变异计时 */
const DETONATE_LOCK_MS = 500
const VIRUS_DETONATE_MEM_COST = 2
const VIRUS_DETONATE_DAMAGE = 40
const MUT_REGEN_MS = 2000
const MUT_REGEN_HP_PCT = 0.05
const MUT_LEAK_MS = 3000
const MUT_LEAK_HP = 3
const MUT_LIFESTEAL_SELF_RATIO = 0.2
/** 有反转效果的标签 */
const MUTABLE_EFFECT_TAGS: readonly string[] = [
  "accel",
  "shield-regen",
  "regen",
  "lifesteal",
  "dodge",
  "enrage",
  "attack",
  "stealth",
  "leak",
]
/** 无对应反转、被病毒直接吃掉的标签（mutation 时从 tags 脱落） */
const MUTABLE_DROP_TAGS: readonly string[] = [
  "autoplay",
  "uncloseable",
  "popup-bomb",
  "pattern",
  "break-def",
]

/** +N 碎片（上限 8），峰值记给结算 */
function addMemFrag(state: RunState, amount: number) {
  const cur = state.memFrags ?? 0
  const next = Math.min(MEM_FRAG_MAX, cur + amount)
  if (next === cur) return
  state.memFrags = next
  if (next > (state.maxFrags ?? 0)) state.maxFrags = next
}

/** 整理：碎片清零并计一次（任务管理器 / 回收站 / 商店三通道共用） */
function clearMemFrags(state: RunState) {
  if ((state.memFrags ?? 0) === 0) return
  state.memFrags = 0
  state.memDefragCount = (state.memDefragCount ?? 0) + 1
}

/** 这只敌人此刻身上还能被病毒传染的标签（未变异、非病毒本身） */
function mutableTagsOf(enemy: EnemyInstance): string[] {
  return enemy.tags.filter(
    (tag) =>
      tag !== "virus" &&
      !(enemy.mutatedTagIds ?? []).includes(tag) &&
      (MUTABLE_EFFECT_TAGS.includes(tag) || MUTABLE_DROP_TAGS.includes(tag)),
  )
}

/** 病毒传染落地：标签进变异集，效果当场反转（全部走既有乘区 / 计时器） */
function applyVirusMutation(
  state: RunState,
  enemy: EnemyInstance,
  tag: string,
) {
  const now = state.now
  enemy.mutatedTagIds = [...(enemy.mutatedTagIds ?? []), tag]
  const hurt = (mult: number) => {
    enemy.incomingDamageMult = (enemy.incomingDamageMult ?? 1) * mult
  }
  switch (tag) {
    case "accel":
      /* intervalMult 越小出手越快：×1.4 = 加速反噬成减速 */
      enemy.intervalMult *= 1.4
      break
    case "shield-regen":
      enemy.shieldRegenEveryMs = 0
      enemy.shieldRegenAmount = 0
      enemy.shieldRegenNextAt = 0
      break
    case "regen":
      enemy.regenEveryMs = 0
      enemy.mutRegenNextAt = now + MUT_REGEN_MS
      break
    case "lifesteal":
      /* 本体无吸血机制：变异 = 出手后自伤出手量 20%，挂在出手落地处 */
      break
    case "dodge":
      hurt(1.3)
      break
    case "enrage":
    case "attack":
      enemy.attack = Math.max(1, Math.round(enemy.attack * 0.6))
      break
    case "stealth":
      /* 永久现形：隐身通道的候选筛选会跳过它，这里先解掉当前隐身 */
      enemy.hiddenUntil = 0
      hurt(1.2)
      break
    case "leak":
      enemy.regenEveryMs = 0
      enemy.shieldRegenEveryMs = 0
      enemy.shieldRegenAmount = 0
      enemy.shieldRegenNextAt = 0
      enemy.mutLeakNextAt = now + MUT_LEAK_MS
      break
    default:
      /* autoplay / uncloseable / popup-bomb / pattern / break-def：被病毒吃掉 */
      enemy.tags = enemy.tags.filter((item) => item !== tag)
      if (tag === "pattern") enemy.guarded = false
      break
  }
}

/** lifesteal 变异：出手落地后自扣出手量 20%（挂在敌人两次出手落地处） */
function virusSelfBite(state: RunState, enemy: EnemyInstance, raw: number) {
  if (!(enemy.mutatedTagIds ?? []).includes("lifesteal")) return
  const bite = Math.max(1, Math.round(raw * MUT_LIFESTEAL_SELF_RATIO))
  enemy.hp = Math.max(0, enemy.hp - bite)
  if (enemy.hp <= 0) killEnemy(state, enemy)
}

/** 路线叙事（四）：lore + 层内机制钩子预告。必须进层之后调用（enterFloor 会清横幅） */
function applyRouteNarrative(
  state: RunState,
  routeId: RouteId,
  entry: RouteEntry,
) {
  const type = ROUTE_TYPES[routeId]
  if (!type) return
  const hooks: string[] = []
  if (routeId === "crash-edge")
    hooks.push("异常会啃内存：这层进层水位要低一截。")
  if (routeId === "recycle-bin") hooks.push("顺手把内存碎片也整理干净。")
  if (routeId === "captcha-maze") hooks.push("随时可能被要求证明你是人类。")
  if (routeId === "time-rift") hooks.push("每个进程头顶都有倒计时，到点血债血偿。")
  if (routeId === "firewall") hooks.push("那边的护盾会一直一直补。")
  if (entry.enemyComp?.some((spec) => spec.tags?.includes("virus")))
    hooks.push("🦠 有个带病毒的进程——引爆它，让它在同伴之间发疯。")
  const text = `${type.lore}${hooks.length > 0 ? " " + hooks.join(" ") : ""}`
  /* 已有事件横幅（未知区域）时不抢屏，叙事进 log */
  if (!state.banner) pushBanner(state, text)
  pushLog(state, `${type.icon} ${text}`)
}

/* ------------------------------------------------------------------ *
 * 趣味包 v1（fun-pack.md）：故事线 / 页面故障 / 假按钮
 * ------------------------------------------------------------------ */

/** 本局故事：自动带层前缀，超 24 条丢最旧的中段（开头与结尾永远保留） */
function pushStory(state: RunState, text: string) {
  const line = `第 ${state.floor} 层 · ${text}`
  if (state.story.length >= 24) {
    state.story = [...state.story.slice(0, 1), ...state.story.slice(2), line]
    return
  }
  state.story = [...state.story, line]
}

/** 敌人台词气泡存续时长 */
const ENEMY_LINE_MS = 1800
/** 弹窗假投降：窗口时长与自爆伤害（casual 归零、硬核 ×1.5） */
const SURRENDER_MS = 2500
const SURRENDER_DAMAGE = 8
const SURRENDER_TRICK_SHARDS = 3
/** 404 假奖励点：点它扣的血 */
const FAKE_REWARD_DAMAGE = 5
/** 假按钮：点它扣的血 / 存在时长 / 崩溃 Boss 阶段 2+ 的刷新周期 */
const FAKE_BUTTON_DAMAGE = 8
const FAKE_BUTTON_MS = 4500
const FAKE_BUTTON_INTERVAL_MS = 8000
/** 内存溢出「转嫁」给敌人的开局护盾 / 缓存污染「留着」的开层扣血 */
const CRISIS_ENEMY_SHIELD = 20
const CRISIS_TAX_HP = 8
/** 各故障持续时长 */
const GLITCH_DUR_MS: Record<GlitchKind, number> = {
  invert: 5000,
  scramble: 6000,
  drift: 6000,
}
const GLITCH_LABEL: Record<GlitchKind, string> = {
  invert: "颜色反转",
  scramble: "页面乱码",
  drift: "按钮漂移",
}
/** 楼层随机小故障的候选（轮流出，不重样） */
const GLITCH_MINOR_KINDS: GlitchKind[] = ["invert", "scramble", "drift"]

/* ---- 趣味包 v2 常数（fun-pack2.md） ---- */
/** 强行跳层：本层普通敌人全部消失的代价 */
const FLOOR_SKIP_COST_HP = 30
/** 敌人适应触发阈值（进非 Boss 层 ≥3 时检查） */
const ADAPT_BOUNCE_AT = 8
const ADAPT_CRIT_AT = 18
const ADAPT_SKILL_AT = 5
/** 适应后的削弱系数：弹射伤害 ×0.5 / 暴伤超出 1 的部分减半 / 主动技伤害 ×0.6 */
const ADAPT_BOUNCE_MULT = 0.5
const ADAPT_SKILL_MULT = 0.6
/** 挂机吐槽阈值（远大于 3s 空闲回复通道，只吐槽不惩罚） */
const IDLE_NAG_AFTER_MS = 25000
/** 通关 meta 尾句（随机一句进故事） */
const VICTORY_META_LINES = [
  "恭喜。但你真的赢了吗？",
  "屏幕安静了。可它不会一直安静。",
  "你通关了游戏。游戏在记着你。",
]

/* ---- 第三批常数（fun-pack3.md） ---- */
/** 黑箱拦截：每次暴击自扣的血（夹 1 血——词条反噬不致死） */
const CONFLICT_CRIT_BACK_HP = 5
/** 监听债：反噬回身的伤害比例 */
const CONFLICT_BOUNCE_BACK_RATIO = 0.25
/** 离线决堤：无敌结束时泄漏扣血（夹 1 血） */
const CONFLICT_OFFLINE_BREACH_HP = 20
/** 羁绊试炼：打赢的基础碎片报酬 */
const HIDDEN_BOND_TRIAL_SHARDS = 50
/** 宿命：打赢的碎片报酬 */
const HIDDEN_FATE_SHARDS = 80

/* ---- 第四批常数（fun-pack4.md） ---- */
/** 影子遭遇概率：普通局 / 每日挑战局（流 shadow:{floor}） */
const SHADOW_CHANCE_NORMAL = 0.12
const SHADOW_CHANCE_DAILY = 0.25
/** 影子面板：基础血 = 60 + 层×8 + 原局词条数×10（再吃精英倍率）；攻 = 3 + 层 */
const SHADOW_HP_BASE = 60
const SHADOW_HP_PER_FLOOR = 8
const SHADOW_HP_PER_RELIC = 10
const SHADOW_ATK_BASE = 3
/** 影子出手形态（按原局第一个词条流派，fun-pack4.md 一表） */
const SHADOW_STYLE_BY_SCHOOL: Record<string, "haste" | "burst" | "regen"> = {
  script: "haste",
  style: "regen",
  network: "burst",
  cache: "burst",
  general: "haste",
}
/** burst 形态：每 5s 一发 ×2.5 蓄力重击 */
const SHADOW_BURST_EVERY_MS = 5000
const SHADOW_BURST_MULT = 2.5
/** regen 形态：每 8s 自修 */
const SHADOW_REGEN_EVERY_MS = 8000
const SHADOW_REGEN_AMOUNT = 15
/** haste 形态：出手节奏 */
const SHADOW_HASTE_INTERVAL_MULT = 0.7
/** 影子赏金保底 / 被夺走的本局碎片比例 */
const SHADOW_MIN_BOUNTY = 8
const SHADOW_TAKE_PCT = 0.1
/** 影子外观候选池（普通敌人） */
const SHADOW_DEFS = ["popup", "ad", "notfound", "leak", "captcha"]
/** 管理员（fun-pack4.md 二）：资格 / 面板 / 篡改 */
const ADMIN_STREAK = 10
const ADMIN_HP = 999
const ADMIN_ATTACK = 9999
const ADMIN_ATTACK_INTERVAL_MS = 2600
const ADMIN_TAMPER_EVERY_MS = 7000
const ADMIN_LOCK_MS = 6000
const ADMIN_MEMORY_TAMPER = 3
const ADMIN_HP_TAMPER = 15
const ADMIN_WIN_SHARDS = 100

/** 立即发作一次页面故障（进层 / Boss 阶段切换 / 事件后遗症都走这里） */
function fireGlitch(state: RunState, kind: GlitchKind) {
  state.glitchKind = kind
  state.glitchUntil = state.now + GLITCH_DUR_MS[kind]
  state.glitchCount += 1
  pushLog(state, `页面出故障了 · ${GLITCH_LABEL[kind]}（${Math.round(GLITCH_DUR_MS[kind] / 1000)} 秒）`)
  playSfx("comboBreak")
  if (state.coachOn) {
    pushTip(state, "故障是地牢干的，不是你的手机——撑过去就好")
  }
  if (!state.storyGlitchShown) {
    state.storyGlitchShown = true
    pushStory(state, `页面开始坏掉：${GLITCH_LABEL[kind]}`)
  }
}

/** 把一次故障武装到未来某刻（advance 到点发作；进层时先武装，制造「突然坏掉」） */
function armGlitch(state: RunState, kind: GlitchKind, at: number) {
  state.glitchArmedAt = at
  state.glitchArmedKind = kind
}

/** 生成一颗假按钮（低配不生成：视觉分不出的假按钮不该存在） */
function spawnFakeButton(state: RunState) {
  if (state.lowSpec || state.fakeButton) return
  state.fakeButtonSeq += 1
  state.fakeButton = {
    id: state.fakeButtonSeq,
    xPct: 10 + Math.random() * 72,
    yPct: 16 + Math.random() * 52,
    until: state.now + FAKE_BUTTON_MS,
  }
  state.fakeButtonArmedAt = state.now + FAKE_BUTTON_INTERVAL_MS
  pushLog(state, "页面上多了一个按钮——看起来不太对劲")
}

/** 点击假按钮：扣血（陷阱类永不致死，最低 1 血；casual 免罚） */
function tapFakeButton(state: RunState): RunState {
  if (state.phase !== "fighting" || !state.fakeButton) return state
  const next: RunState = { ...state, pops: [...state.pops] }
  next.fakeButton = null
  next.fakeButtonArmedAt = next.now + FAKE_BUTTON_INTERVAL_MS
  const dmg = Math.round(FAKE_BUTTON_DAMAGE * qtePenaltyMult(next.playMode))
  if (dmg > 0) {
    next.playerHp = Math.max(1, next.playerHp - dmg)
    next.tookDamage = true
    pushPop(next, "hurt", dmg)
    playSfx("hit")
  }
  pushBanner(next, "假按钮！是个陷阱")
  pushStory(next, "手滑点了个假按钮，被电了一下")
  return next
}

/* ---- 趣味包 v2（fun-pack2.md 一）：UI 变武器（主动操作，代价照常扣血、夹 1 血） ---- */

/** 盲战开关：开 = 攻击 ×1.3（buildMods extras 生效），View 把自己的血条数字遮掉 */
function toggleBlindCombat(state: RunState): RunState {
  if (state.phase !== "fighting") return state
  const next: RunState = { ...state, pops: [...state.pops] }
  next.blindCombat = !next.blindCombat
  next.mods = buildMods(next.character, next.relics, next.floor, extrasOf(next))
  playSfx("switch")
  if (next.blindCombat) {
    pushBanner(next, "盲战：血条收起，攻击 +30%")
    pushStory(next, "关掉了血条——看不见伤，才打得狠")
  } else {
    pushBanner(next, "重新睁眼 · 攻击加成没了")
  }
  return next
}

/** 强行跳层：本层普通敌人原地散场（不算击杀 / 碎片 / 内存），-30 血买路；Boss 层跳不掉 */
function forceSkipFloor(state: RunState): RunState {
  if (state.phase !== "fighting") return state
  const hasBoss = state.enemies.some(
    (enemy) =>
      !enemy.closing && (enemy.kind === "boss" || enemy.kind === "bigboss"),
  )
  if (hasBoss) {
    pushBanner(state, "这层的主角跑不掉")
    return state
  }
  if (state.enemies.every((enemy) => enemy.closing)) return state
  const next: RunState = {
    ...state,
    enemies: [...state.enemies],
    pops: [...state.pops],
  }
  next.enemies = next.enemies.filter((enemy) => enemy.closing)
  if (next.lockedUid !== null) next.lockedUid = null
  next.playerHp = Math.max(1, next.playerHp - FLOOR_SKIP_COST_HP)
  pushPop(next, "hurt", FLOOR_SKIP_COST_HP)
  playSfx("hit")
  pushBanner(next, `强行跳层 · -${FLOOR_SKIP_COST_HP} 血买路`)
  pushLog(next, "你按下了层数按钮——敌人原地散场，代价直接从血里扣")
  pushStory(next, `硬闯下一层，被门电掉 ${FLOOR_SKIP_COST_HP} 血`)
  return next
}

/** 找回被崩溃 Boss 抢走的技能按钮 */
function recoverSkillButton(state: RunState): RunState {
  if (state.phase !== "fighting" || !state.skillSnatched) return state
  const next: RunState = { ...state, pops: [...state.pops] }
  next.skillSnatched = false
  pushBanner(next, "按钮抢回来了！")
  pushLog(next, "你在战斗区角落里揪住了自己的技能按钮")
  pushStory(next, "把被抢的技能按钮点了回来")
  playSfx("pick")
  return next
}

/** 拖拽关闭 / 弹窗 × 共用的即时击杀：计入击杀与图鉴，不播死亡动画、不掉碎片 */
function instantCloseEnemy(state: RunState, enemy: EnemyInstance) {
  if (enemy.closing) return
  state.kills += 1
  /* v2：拖拽 / × 关闭同样计一次普通击杀，回基础 1 内存（拖拽的 3 费是买「即时 + 免前摇」） */
  gainMemory(state, MEMORY_KILL_NORMAL)
  if (!state.defeatedIds.includes(enemy.defId)) {
    state.defeatedIds = [...state.defeatedIds, enemy.defId]
  }
  if (enemy.kind === "boss" || enemy.kind === "bigboss") {
    setBossLine(state, enemy, findBossLine(enemy.defId, "defeat"))
  }
  /* 直接从标签条移除，绕开 closing + CLOSE_ANIM_MS 的淡出动画 */
  state.enemies = state.enemies.filter((item) => item.uid !== enemy.uid)
  if (state.lockedUid === enemy.uid) state.lockedUid = null
  playSfx("close")
}

/** 拖拽关闭：血量 <30% 的普通敌人，每层限 1 次，向上 / 向左拖出即直接击杀 */
function dragCloseEnemy(state: RunState, uid: string): RunState {
  if (state.phase !== "fighting" || state.paused) return state
  if (state.dragCloseUsed) return state
  const enemy = state.enemies.find((item) => item.uid === uid)
  if (
    !enemy ||
    enemy.closing ||
    enemy.minion ||
    enemy.kind !== "normal" ||
    enemy.maxHp <= 0 ||
    enemy.hp / enemy.maxHp >= DRAG_CLOSE_HP_RATIO
  ) {
    return state
  }
  const next: RunState = {
    ...state,
    enemies: state.enemies.map(cloneEnemy),
    shardDots: [...state.shardDots],
    pops: [...state.pops],
    lastActionAt: state.now,
    dragCloseUsed: true,
  }
  /* v2：拖拽关闭内存费 3，余额不足则拖不动（不吃每层 1 次的机会） */
  if (trySpendMemory(next, MEMORY_DRAG_CLOSE_COST) === null) return state
  const target = next.enemies.find((item) => item.uid === uid)
  if (!target) return state
  instantCloseEnemy(next, target)
  pushBanner(next, "标签已关闭")
  return next
}

/** 弹窗 ×：窗口内点右上角 × 直接击杀弹窗本体，不计拖拽次数 */
function dismissPopupEnemy(state: RunState, uid: string): RunState {
  if (state.phase !== "fighting" || state.paused) return state
  const enemy = state.enemies.find(
    (item) => item.uid === uid && item.defId === "popup",
  )
  if (!enemy || enemy.closing || enemy.popupXUntil <= state.now) return state
  const next: RunState = {
    ...state,
    enemies: state.enemies.map(cloneEnemy),
    shardDots: [...state.shardDots],
    pops: [...state.pops],
    lastActionAt: state.now,
  }
  const target = next.enemies.find((item) => item.uid === uid)
  if (!target) return state
  instantCloseEnemy(next, target)
  pushBanner(next, "弹窗已关闭")
  return next
}

/** 点击碎片点：全额入账 + 叠一层点击连击 */
function pickShardDot(state: RunState, dotId: number): RunState {
  if (state.phase !== "fighting" || state.paused) return state
  const dot = state.shardDots.find((item) => item.id === dotId)
  if (!dot) return state
  const next: RunState = {
    ...state,
    shardDots: state.shardDots.filter((item) => item.id !== dotId),
    enemies: state.enemies.map(cloneEnemy),
    lastActionAt: state.now,
    clickCombo: state.clickCombo,
    clickComboExpireAt: state.clickComboExpireAt,
  }
  /* 骗局 B：点中 404 的假奖励——扣血（陷阱类最低 1 血，casual 免罚），不入账不叠连击 */
  if (dot.fake) {
    const dmg = Math.round(FAKE_REWARD_DAMAGE * qtePenaltyMult(next.playMode))
    if (dmg > 0) {
      next.playerHp = Math.max(1, next.playerHp - dmg)
      next.tookDamage = true
      pushPop(next, "hurt", dmg)
      playSfx("hit")
    } else {
      pushPop(next, "immune", 0)
    }
    pushBanner(next, "404：那是假的")
    pushLog(next, "404 的假奖励：点下去才发现是坑")
    pushStory(next, "点了 404 递过来的「奖励」，是假的")
    return next
  }
  creditShards(next, dot.amount)
  /* v2：拾取碎片同时回 0.5 内存（HUD 余额向上取整展示） */
  gainMemory(next, MEMORY_SHARD_GAIN)
  bumpClickCombo(next)
  playSfx("coin")
  return next
}

function killEnemy(state: RunState, enemy: EnemyInstance) {
  if (enemy.closing) return
  enemy.closing = true
  enemy.closedAt = state.now
  state.kills += 1
  /* 图鉴：记下这个 defId，切到新数组让副作用能感知到变化 */
  if (!state.defeatedIds.includes(enemy.defId)) {
    state.defeatedIds = [...state.defeatedIds, enemy.defId]
  }
  /* 本局临时碎片：Boss / 召唤小怪走固定掉落 → 精英 8~12 → 普通随层数档；M2 词条乘算
     批次二：不再直接入账，改掉落金色碎片点，点击全额 / 3 秒不点自动入账八成 */
  const shardBase =
    enemy.killShards > 0
      ? enemy.killShards
      : enemy.elite
        ? rollEliteShards()
        : rollFloorKillShards(state.floor)
  /* 广告峡谷：本层掉落翻倍（dungeon-route.md 三·1） */
  const routeDropMult = state.activeRouteId === "ad-canyon" ? 2 : 1
  const gained = Math.max(
    1,
    Math.floor(shardBase * (1 + state.mods.fragmentMult) * routeDropMult),
  )
  dropShardDot(state, enemy, gained)
  pushLog(state, `${enemy.displayName} 标签已关闭 · 掉出 ${gained} 碎片，点它拾取`)
  /* 影子赏金（fun-pack4.md 一）：摸回原局随身碎片的一成 */
  if (enemy.shadow) {
    const bounty = enemy.shadowBounty ?? SHADOW_MIN_BOUNTY
    creditShards(state, bounty)
    pushPop(state, "shard", bounty)
    pushBanner(state, "影子散了")
    pushLog(state, `从影子里摸回 ${bounty} 碎片（原局随身碎片的 10%）`)
    pushStory(state, `我打赢了自己的影子，摸回了它揣着的 ${bounty} 枚碎片`)
  }
  /* 管理员遗言（fun-pack4.md 二） */
  if (enemy.admin) {
    pushLog(state, "管理员：「这局……我就当没发生过。」")
  }
  /* ---- 双面回廊（core-experience-pack.md 一）：真实死亡时刻 + 同步击杀 + 另一半狂暴 ----
     关页 / 崩溃的尸体不进 killEnemy，天然不算同步击杀（狂暴在关页路径单独触发） */
  if (enemy.twin) {
    state.twinDeaths = [...(state.twinDeaths ?? []), state.now]
    const deaths = state.twinDeaths
    const prev = deaths.length >= 2 ? deaths[deaths.length - 2] : null
    if (prev !== null && state.now - prev <= TWIN_SYNC_MS) {
      creditShards(state, TWIN_SYNC_SHARDS)
      pushPop(state, "shard", TWIN_SYNC_SHARDS)
      state.forceEpicChoice = true
      pushBanner(state, "同步击杀 · 数据核心被撕开")
      pushLog(
        state,
        `正反两面同时倒下 · 数据核心被撕开，${TWIN_SYNC_SHARDS} 碎片直接入账，下一次三选一保底史诗`,
      )
    }
    rageTwinPartner(state, enemy)
  }
  /* ---- leak 吐回（core-experience-pack.md 三）：只有真实击杀才吐，关页 / 崩溃不吐 ---- */
  if (enemy.defId === "leak" && (enemy.stolenMem ?? 0) > 0) {
    const spewBack = enemy.stolenMem ?? 0
    gainMemory(state, spewBack)
    pushBanner(state, "泄漏崩解 · 内存吐回来了")
    pushLog(state, `这只泄漏偷走的 ${spewBack} 点内存全部回流`)
  }
  /* 趣味包·骗局 A（fun-pack.md 一）：在它「投降」窗口里动手 = 识破，额外掉碎片 */
  if (enemy.surrenderUntil && enemy.surrenderUntil > state.now) {
    enemy.surrenderUntil = 0
    dropShardDot(state, enemy, SURRENDER_TRICK_SHARDS)
    pushLog(state, `你识破了 ${enemy.displayName} 的假投降 · 额外掉 ${SURRENDER_TRICK_SHARDS} 碎片`)
    pushStory(state, `${enemy.displayName} 想假投降，被我提前关掉了`)
  }
  /* 趣味包·敌人遗言（fun-pack.md 一）：普通敌人死亡句只进战斗日志（管理员有专属遗言，不串词） */
  if (enemy.kind === "normal" && !enemy.admin) {
    const deathLine = pickEnemyLine(enemy.defId, "death", enemy.uid)
    if (deathLine) pushLog(state, `${enemy.displayName}：「${deathLine}」`)
  }
  /* Boss 倒下时补最后一句台词（只做气氛，不进战斗日志） */
  if (enemy.kind === "boss" || enemy.kind === "bigboss") {
    setBossLine(state, enemy, findBossLine(enemy.defId, "defeat"))
    /* QTE 进行中 Boss 先被打死：直接取消这次 QTE，不奖不罚 */
    if (state.qte) {
      state.qte = null
      pushLog(state, "关键帧应对随 Boss 倒下取消了")
    }
  }
  playSfx("kill")
  if (state.mods.healOnKill > 0) healPlayer(state, state.mods.healOnKill)
  /* v2 击杀基础产出（规格「所有击杀都有回报」）：普通 +1 / 精英 +2 / 小 Boss +4 /
     大 Boss +6；Boss 召唤的小怪不吃（防刷屏farm），与 M5 垃圾回收叠加 */
  const killTierGain = enemy.minion
    ? 0
    : enemy.kind === "bigboss"
      ? MEMORY_KILL_BIG_BOSS
      : enemy.kind === "boss"
        ? MEMORY_KILL_MINI_BOSS
        : enemy.elite
          ? MEMORY_KILL_ELITE
          : MEMORY_KILL_NORMAL
  if (killTierGain > 0) gainMemory(state, killTierGain)
  /* M5 垃圾回收（relic-redesign.md B·M5）：击杀回内存（纯被动，小护盾死亡 +2
     走 advance 的 minionDeathMemory 通道，批次 C 已按在场判定修正为恒 2） */
  if (state.mods.killMemoryGain > 0)
    gainMemory(state, state.mods.killMemoryGain)
  /* 饼干窃贼被动「饼罐子」：角色固定汲取，与词条 healOnKill 并列叠加 */
  if (state.character.id === "cookie-thief") {
    healPlayer(state, COOKIE_HEAL_ON_KILL)
    pushLog(state, `饼罐子 · 从 ${enemy.displayName} 的罐子里摸回 ${COOKIE_HEAL_ON_KILL} 点生命`)
  }
  if (state.mods.killBonusMult > 0) state.nextHitBonus = state.mods.killBonusMult
}

function hitEnemy(
  state: RunState,
  enemy: EnemyInstance,
  amount: number,
  crit: boolean,
  /** N3 重定向转移来的伤害：true 时不再触发二次溢出转移（≤1 跳，relic-redesign.md B·N3） */
  fromTransfer = false,
) {
  if (enemy.closing) return

  /* 敌人适应计数（fun-pack2.md 二）：吃一次暴击记一笔 */
  if (crit) state.learnCritHits += 1

  /* 双面回廊（core-experience-pack.md 一）：背面本周期被打过 → 下次跨页重击被「打断」 */
  if (enemy.twin === "back") enemy.twinHitThisCycle = true

  let incoming = amount
  const broken = enemy.brokenUntil > state.now
  if (broken) {
    /* 点对图案破防 3 秒：受到的伤害 +50% */
    incoming *= CAPTCHA_BREAK_DAMAGE_MULT
  } else if (enemy.guarded) {
    /* 没破防的验证码敌人只吃两成伤害 */
    incoming = Math.max(1, Math.round(incoming * 0.2))
  }

  const defense = enemy.defense * (1 - state.mods.penetration)
  let damage = Math.max(1, Math.round(incoming - defense))

  /* 秒杀：普通敌人血量低于阈值直接带走（Boss 不吃这条，免得跳过阶段；管理员不吃，999 血要打满） */
  if (
    state.mods.executeAll > 0 &&
    enemy.kind === "normal" &&
    !enemy.admin &&
    enemy.maxHp > 0 &&
    enemy.hp <= enemy.maxHp * state.mods.executeAll
  ) {
    damage = Math.max(damage, enemy.shield + enemy.hp)
    pushLog(state, `秒杀 · ${enemy.displayName} 血量见底，直接被带走`)
  }

  /* 敌人护盾先扛伤害 */
  if (enemy.shield > 0) {
    const absorbed = Math.min(enemy.shield, damage)
    enemy.shield -= absorbed
    damage -= absorbed
    if (enemy.shield <= 0 && absorbed > 0) {
      pushLog(state, `${enemy.displayName} 的护盾碎了`)
      /* 缓存深渊：碎盾回内存，每只敌人只给一次（dungeon-route.md 三·2） */
      if (
        state.activeRouteId === "cache-abyss" &&
        !state.shieldBlessedUids.includes(enemy.uid)
      ) {
        state.shieldBlessedUids = [...state.shieldBlessedUids, enemy.uid]
        gainMemory(state, CACHE_SHIELD_BLESS_MEMORY)
        pushLog(state, `缓存深渊 · 碎盾泄出内存 +${CACHE_SHIELD_BLESS_MEMORY}`)
      }
    }
  }

  if (damage <= 0) {
    enemy.hitAt = state.now
    pushPop(state, "shield", 0)
    return
  }

  /* N1 请求拦截（relic-redesign.md B·N1）：玩家攻击暴击偷内存——挂在一切伤害落地处，
     覆盖普攻 / 三连击 / 链式暴击 / Boss 阶段按钮（它们都以 crit=true 走这里；弹射 / 小护盾为非暴击不产） */
  if (crit && state.mods.stealMemoryOnCrit > 0) {
    gainMemory(state, state.mods.stealMemoryOnCrit)
  }

  if (enemy.defId === "boss-fullscreen" && enemy.boss) {
    if (enemy.boss.phase === 1) {
      const button =
        enemy.buttons.find(
          (item) => item.id === state.lockedButtonId && !item.closed,
        ) ?? enemy.buttons.find((item) => !item.closed)
      if (!button) return
      button.hp = Math.max(0, button.hp - damage)
      if (button.hp <= 0) {
        button.closed = true
        pushLog(state, `${button.label} 被点掉了`)
      }
    } else {
      enemy.boss.bodyHp = Math.max(0, enemy.boss.bodyHp - damage)
      enemy.hp = enemy.boss.bodyHp
    }
    syncBoss(state)
  } else {
    /* N3 重定向（relic-redesign.md B·N3）：记下扣血前的剩余血量，击杀时算溢出伤害 */
    const hpBefore = enemy.hp
    /* 深化包·变异受伤收口：一切对普通敌人的伤害统一乘变异倍率（默认 1） */
    damage = Math.max(1, Math.round(damage * (enemy.incomingDamageMult ?? 1)))
    enemy.hp = Math.max(0, enemy.hp - damage)
    syncBoss(state)
    /* combo·暗黑流（C 节·7）：暴击打完仍存活、且血量低于 15% 上限的普通敌人直接斩杀。
       Boss 与阶段按钮不吃（同 executeAll 防跳阶段的理由）；飘字复用既有「斩杀」紫 */
    if (
      crit &&
      state.mods.darkExecuteCritRatio > 0 &&
      enemy.kind === "normal" &&
      !enemy.admin &&
      enemy.hp > 0 &&
      enemy.maxHp > 0 &&
      enemy.hp <= enemy.maxHp * state.mods.darkExecuteCritRatio
    ) {
      pushPop(state, "execute", 0, false)
      pushLog(state, `暗黑流 · ${enemy.displayName} 在暗影里被暴击直接斩杀`)
      enemy.hp = 0
      killEnemy(state, enemy)
      return
    }
    if (enemy.hp <= 0) {
      const overflow = Math.max(0, damage - hpBefore)
      killEnemy(state, enemy)
      /* N3 重定向：击杀溢出（伤害 − 剩余血）转移到标签条顺序里的下一个存活敌人，
         最多一跳——转移伤害本身再击杀也不再二次转移（fromTransfer=true） */
      if (
        overflow > 0 &&
        state.mods.overflowTransfer > 0 &&
        enemy.kind === "normal" &&
        !fromTransfer
      ) {
        const alive = aliveEnemies(state)
        const slotOf = (item: EnemyInstance) =>
          item.slot >= 0 ? item.slot : Number.MAX_SAFE_INTEGER
        const nextTarget =
          alive.find((item) => slotOf(item) > slotOf(enemy)) ?? alive[0]
        if (nextTarget) {
          pushLog(
            state,
            `重定向 · 溢出 ${overflow} 点伤害转到 ${nextTarget.displayName}`,
          )
          hitEnemy(state, nextTarget, overflow, false, true)
        }
      }
    }
  }

  enemy.hitAt = state.now
  state.damageDealt += damage
  const killNow = enemy.hp <= 0
  pushPop(state, crit ? "crit" : "hit", damage, crit)
  /* ---- 顿帧（glitch-feel-pack.md 一）：暴击/斩杀瞬间冻 0.1 秒，
     闷响立刻响、金暴击音压住留到解冻那一帧——「静止然后爆发」 ---- */
  const canHitStop =
    (crit || killNow) &&
    !(state.hitStopUntil && state.now < state.hitStopUntil) &&
    state.now - (state.lastHitStopAt ?? 0) >= HIT_STOP_GAP_MS
  if (canHitStop) {
    state.hitStopSeq = (state.hitStopSeq ?? 0) + 1
    state.lastHitStopAt = state.now
    state.pendingHitSfx = crit ? "crit" : "hit"
    state.hitStopUntil =
      state.now +
      (state.lowSpec
        ? 50
        : killNow
          ? HIT_STOP_KILL_MS
          : HIT_STOP_CRIT_MS)
    playSfx("hitstop")
  } else {
    playSfx(crit ? "crit" : "hit")
  }
  /* 角色攻击轨迹（glitch-feel-pack.md 二）：法师以自身为中心，其余挂目标卡 */
  pushFx(
    state,
    ATTACK_FX_BY_CHARACTER[state.character.id] ?? "slash",
    state.character.id === "cache-mage" ? null : enemy.uid,
    crit || killNow,
  )
  /* 表现包：暴击挂金色粒子窗 + 4px 震屏（低配由 View 降级） */
  if (crit) {
    enemy.critFlashUntil = state.now + CRIT_BURST_MS
    triggerShake(state, 4)
  }

  /* 管理员 meta 台词（fun-pack4.md 二）：血量过阈值各说一句，不蹭普通敌人台词池 */
  if (enemy.admin && enemy.hp > 0 && enemy.maxHp > 0) {
    const adminRatio = enemy.hp / enemy.maxHp
    if (adminRatio <= 0.66 && !enemy.adminTaunt1) {
      enemy.adminTaunt1 = true
      enemy.lineText = "你太完美了。我只好亲自来。"
      enemy.lineUntil = state.now + 2400
      enemy.lineKind = "taunt"
      pushLog(state, `管理员：「${enemy.lineText}」`)
    } else if (adminRatio <= 0.33 && !enemy.adminTaunt2) {
      enemy.adminTaunt2 = true
      enemy.lineText = "删了你，这局的记录也就没了。"
      enemy.lineUntil = state.now + 2400
      enemy.lineKind = "whine"
      pushLog(state, `管理员：「${enemy.lineText}」`)
    }
  }

  /* ---- 趣味包（fun-pack.md 一）：残血台词 + 两个骗局，只打存活的普通敌人（非召唤物） ---- */
  if (
    enemy.kind === "normal" &&
    !enemy.minion &&
    !enemy.admin &&
    enemy.hp > 0 &&
    enemy.maxHp > 0 &&
    enemy.boss === null
  ) {
    const hpRatio = enemy.hp / enemy.maxHp
    if (!enemy.lowHpLineShown && hpRatio <= 0.3) {
      enemy.lowHpLineShown = true
      const whine = pickEnemyLine(enemy.defId, "lowhp", enemy.uid)
      if (whine) {
        enemy.lineText = whine
        enemy.lineKind = "whine"
        enemy.lineUntil = state.now + ENEMY_LINE_MS
      }
      /* 骗局 B：404 掉一枚假奖励点（每层 1 次；低配不生成——视觉分不出就不该有） */
      if (
        enemy.defId === "notfound" &&
        !enemy.elite &&
        !state.fakeShardUsedFloor &&
        !state.lowSpec
      ) {
        state.fakeShardUsedFloor = true
        const total = Math.max(1, visibleEnemies(state).length)
        const slotIdx = enemy.slot >= 0 ? enemy.slot % total : total - 1
        state.shardSeq += 1
        state.shardDots = [
          ...state.shardDots,
          {
            id: state.shardSeq,
            x: Math.min(88, Math.max(6, ((slotIdx + 0.5) / total) * 100)),
            amount: 0,
            expireAt: state.now + SHARD_DOT_LIFE_MS,
            fake: true,
          },
        ]
      }
    }
    /* 骗局 A：弹窗残血假投降——停手举白旗，2.5 秒后自爆（fun-pack.md 一·A） */
    if (
      enemy.defId === "popup" &&
      !enemy.elite &&
      hpRatio <= 0.25 &&
      !enemy.surrenderUntil
    ) {
      enemy.surrenderUntil = state.now + SURRENDER_MS
      enemy.pausedUntil = enemy.surrenderUntil
      enemy.telegraphUntil = 0
      enemy.lineText = "我投降！咱们谈谈！"
      enemy.lineKind = "whine"
      enemy.lineUntil = enemy.surrenderUntil
    }
  }

  if (enemy.hp <= 0 && !enemy.closing) killEnemy(state, enemy)
}

/** 敌人攻击玩家的伤害（含前摇挂的倍率、层限时超时、大 Boss 阶段加成） */
function enemyAttackAmount(state: RunState, enemy: EnemyInstance): number {
  let amount = enemy.attack * enemy.pendingAttackMult
  if (enemy.boss?.attackDouble) amount *= BOSS_CRASH_ATTACK_MULT
  if (enemy.boss?.phase === 1 && enemy.defId === "boss-crash") {
    amount += BOSS_CRASH_POPUP_DAMAGE
  }
  /* 层限时超时：本层全体敌人攻击 +50%，不直接判负 */
  if (state.overtime) amount *= OVERTIME_ATTACK_MULT
  /* 跳转弹窗（core-experience-pack.md 二）：落地 3 秒强化窗，前后台同一乘区 */
  if (enemy.jumpBuffUntil && state.now < enemy.jumpBuffUntil) {
    amount *= JUMP_BUFF_MULT
  }
  /* leak 偷内存（core-experience-pack.md 三）：每偷 1 点 +5%，偷满溢出改吃固定 ×2 */
  if (enemy.defId === "leak") {
    const stolen = enemy.stolenMem ?? 0
    if (stolen > 0) amount *= stolen >= LEAK_OVERFLOW_AT ? 2 : 1 + 0.05 * stolen
  }
  /* 核心体验包 v2：样式守卫在场（未冻结未崩溃的援军页）→ 全场敌攻 −15%。
     台前/后台通道都从这里取值，天然全覆盖；与跳转 ×1.3、泄漏成长等既有乘区并列相乘 */
  if (hasActiveGuard(state)) amount *= 1 - GUARD_REDUCE
  return Math.max(1, Math.round(amount))
}

/**
 * 敌人两次出手之间的间隔（含词条减速与第 3 层右侧的提速）。
 * C4 过渡动画：被玩家攻击挂上 attackSlowUntil 时间隔翻倍 = 攻速减半
 * （relic-redesign.md B·C4「挂现有 telegraph/interval 通道」——这里走 interval 通道，
 * 来源是「过渡动画」词条，与限流 N7 的 enemyIntervalMult 各走各的乘数）。
 */
function enemyInterval(state: RunState, enemy: EnemyInstance): number {
  let mult = state.mods.enemyIntervalMult / Math.max(0.1, enemy.intervalMult)
  if (enemy.attackSlowUntil > state.now) mult *= 2
  return Math.max(400, Math.round(enemy.attackIntervalMs * mult))
}

function tryReviveOrDie(state: RunState, enemy: EnemyInstance) {
  /* 一切血尽处理都算「死过」——管理员的无死连击资格判定（fun-pack4.md 二） */
  state.deathsThisRun += 1

  /* 永恒（缓存 ×5）：死亡时满血复活一次 */
  if (state.mods.reviveFullOnce > 0 && !state.reviveFullUsed) {
    state.reviveFullUsed = true
    state.reviveCount += 1
    state.playerHp = state.playerMaxHp
    pushPop(state, "heal", state.playerMaxHp)
    pushLog(state, "永恒 · 满血复活一次")
    pushStory(state, "死过一次，被「永恒」满血拽了回来")
    return
  }

  /* M6 Service Worker（relic-redesign.md B·M6）：每 3 层攒下的免死次数，
     致死时若有次数则触发：trySpendMemory(4) 原子扣费（规格定稿「触发耗 4，
     不足则不触发免死」——扣不动就不消耗次数、也不清场，继续往下走断点续传/死亡）
     触发效果：免死回 1 血 + 清空场上全部普通召唤物（deathWardClearMinions） */
  if (state.deathWards > 0) {
    if (trySpendMemory(state, DEATH_WARD_MEMORY_COST) !== null) {
      state.deathWards -= 1
      state.reviveCount += 1
      state.playerHp = 1
      pushPop(state, "heal", 1)
      playSfx("deathWard")
      pushLog(state, "Service Worker · 后台接管，免死一次回 1 血")
      pushStory(state, "Service Worker 从 death 手里抢回 1 点血")
      if (state.mods.deathWardClearMinions > 0) {
        const minions = state.enemies.filter(
          (item) => item.minion && !item.closing,
        )
        minions.forEach((minion) => killEnemy(state, minion))
        if (minions.length > 0)
          pushLog(state, `Service Worker · 清掉了场上 ${minions.length} 个召唤小怪`)
      }
      if (!state.coachWardDone) {
        state.coachWardDone = true
        pushTip(state, "Service Worker 免死 · 回 1 血并清场，之后继续打")
      }
      return
    }
    pushLog(state, "Service Worker · 内存不足，这次免死没触发")
  }

  /* N5 断点续传（relic-redesign.md B·N5，v4 改纯被动自动概率）：每局 1 次，
     先 trySpendMemory(5)（不足必失败、不掷概率），再掷 mods.reviveChance
     （概率值已由 buildMods 合入：基础 0.3，保命流 combo 提档为 0.6）。
     本局机会按「尝试」计：掷输也算消耗，下次致死不再触发（「每局 1 次」字面语义）。
     随机源沿用引擎既有 Math.random（既有验证码 / 掉落等同源，本引擎无可复现随机序列）。 */
  if (
    state.mods.reviveChance > 0 &&
    !state.resumeUsedThisRun &&
    trySpendMemory(state, state.mods.reviveMemoryCost) !== null
  ) {
    state.resumeUsedThisRun = true
    if (Math.random() < state.mods.reviveChance) {
      state.reviveCount += 1
      state.playerHp = Math.max(
        1,
        Math.round(state.playerMaxHp * state.mods.reviveHpRatio),
      )
      pushPop(state, "heal", state.playerHp)
      pushBanner(state, "断点续传")
      pushLog(state, "断点续传 · 从三成血接着跑")
      pushStory(state, "断点续传 · 三成血接着跑")
      /* 觉醒续命（fun-pack3.md 一）：复活瞬间免费轰一发双倍主动技
         （applyActiveEffect 函数声明提升，可直接前向引用；不吃觉醒阻塞，刚活过来就该爽） */
      if (state.mods.conflictAwakenEcho) {
        pushBanner(state, "觉醒续命 · 复活自动轰出双倍主动技！")
        pushLog(state, "觉醒续命 · 断点续传与异步觉醒在尸体上撞出了火花")
        pushStory(state, "死而复生的瞬间，自动轰出了一发双倍主动技")
        applyActiveEffect(state, 1, true, false, currentTarget(state))
      }
      if (!state.coachResumeDone) {
        state.coachResumeDone = true
        pushTip(state, "断点续传 · 刚才那下没死成，30% 血接着跑")
      }
      return
    }
    pushLog(state, "断点续传 · 没续上，这一局就到这里")
  }

  state.phase = "dead"
  state.deadAt = state.now
  /* v2：血尽时若正处于耗尽区，死因改记「内存溢出」（结算页显示内存管理失败） */
  state.cause =
    memoryZoneOf(state) === "exhausted"
      ? `内存溢出 · 第 ${state.floor} 层内存见底时被${enemy.displayName}耗死了（内存管理失败）`
      : `被第 ${state.floor} 层的${enemy.displayName}耗死了`
  /* 影子夺宝（fun-pack4.md 一）：致死一击来自影子 → 它抱起你一成碎片跑了 */
  if (enemy.shadow && state.shards > 0) {
    const taken = Math.floor(state.shards * SHADOW_TAKE_PCT)
    if (taken > 0) {
      state.shards -= taken
      pushLog(state, `${enemy.displayName} 抱起你的 ${taken} 枚碎片跑了`)
      pushStory(state, "影子偷走了我一成碎片，我没来得及追")
    }
  }
  playSfx("lose")
}

/** 闪避成功：结算角色被动（标签刺客提速 / 无痕游侠必暴） */
function noteDodge(state: RunState, enemy: EnemyInstance) {
  const id = state.character.id
  let extra = ""
  if (id === "tab-assassin") {
    state.dodgeHasteUntil = state.now + DODGE_HASTE_MS
    extra = " · 无痕切换：攻速 +25%"
  } else if (id === "incognito-ranger") {
    state.critNext = true
    extra = " · 必暴一击：下击必暴"
  }
  pushPop(state, "dodge", 0)
  pushLog(state, `闪掉了 ${enemy.displayName} 的一击${extra}`)
  playSfx("dodge")
}

function hurtPlayer(state: RunState, enemy: EnemyInstance, raw: number) {
  if (state.phase !== "fighting") return
  const now = state.now

  /* 闪避按钮：短暂无敌窗口 */
  if (now < state.dodgeUntil) {
    noteDodge(state, enemy)
    return
  }

  /* C2 z-index 残影诱饵：闪避成功留下的残影期间，敌人 60% 概率改打残影（miss）。
     诱饵判定先于一切减免——它就是「改打别处」（relic-redesign.md B·C2） */
  if (now < state.decoyUntil && Math.random() < DECOY_MISS_CHANCE) {
    pushPop(state, "decoy", 0)
    return
  }

  /* 手动无敌窗口（节流激活 / 离线模式激活）：这段时间完全免疫，护盾也不掉 */
  if (now < state.manualImmuneUntil) {
    pushPop(state, "immune", 0)
    return
  }

  /* 绝对防御：每层首次受伤免疫 */
  if (state.mods.firstHitImmunePerFloor > 0 && !state.firstHitImmuneUsed) {
    state.firstHitImmuneUsed = true
    pushPop(state, "immune", 0)
    pushLog(state, "绝对防御 · 本层第一次伤害免了")
    return
  }

  /* 闪避率：常驻 + 过渡动画 + Boss 阶段 3 */
  let chance = state.mods.dodgeChance
  if (state.mods.hurtDodgeChance > 0 && now < state.hurtDodgeUntil) {
    chance += state.mods.hurtDodgeChance
  }
  chance += bossDodgeBonus(state)
  if (chance > 0 && Math.random() < chance) {
    noteDodge(state, enemy)
    return
  }

  let amount = raw
  const ratio = state.playerMaxHp > 0 ? state.playerHp / state.playerMaxHp : 1
  if (state.mods.lowHpReduction > 0 && ratio <= state.mods.lowHpThreshold) {
    amount *= 1 - state.mods.lowHpReduction
  }
  amount = Math.max(1, Math.round(amount - state.mods.damageReduction))

  /* 护盾：按点数吸收伤害，破盾时触发「伪元素」反伤 */
  if (state.shield > 0) {
    const absorbed = Math.min(state.shield, amount)
    state.shield -= absorbed
    amount -= absorbed
    pushPop(state, "shield", absorbed)
    pushLog(state, `缓存护盾吃下 ${absorbed} 点伤害`)
    if (state.shield <= 0 && state.mods.shieldBreakDamage > 0) {
      const target = currentTarget(state)
      if (target) {
        pushLog(state, `伪元素 · 护盾碎片溅到 ${target.displayName} 身上`)
        hitEnemy(state, target, state.mods.shieldBreakDamage, false)
      }
    }
    /* C5 伪元素：护盾破碎瞬间分裂小护盾（内存不足则不分裂，不扣费）。
       「被敌人攻击打爆」与「到达即爆」在小护盾没有独立受击目标的前提下同一路径：
       到达时间一律爆炸结算（relic-redesign.md B·C5 简化，写死注释见 advance 的 miniShields 段） */
    if (state.shield <= 0 && state.mods.shieldSplit > 0) {
      spawnMiniShields(state)
    }
    if (amount <= 0) return
  }

  state.playerHp = Math.max(0, state.playerHp - amount)
  /* 实打实掉了一格血（护盾没全吸收）：本局不再算无伤 */
  state.tookDamage = true
  /* 趣味包·故事：血量首次跌破 20% 记一笔 */
  if (
    !state.storyLowHpShown &&
    state.playerHp > 0 &&
    state.playerMaxHp > 0 &&
    state.playerHp / state.playerMaxHp <= 0.2
  ) {
    state.storyLowHpShown = true
    pushStory(state, "血量跌破了两成，喘了口气继续跑")
  }
  /* 数据矿脉：挨一拳被偷一把碎片（夹 0，闪避/免疫不触发，dungeon-route.md 三·6） */
  if (state.activeRouteId === "data-mine" && state.shards > 0) {
    const stolen = Math.min(state.shards, DATA_MINE_STEAL_SHARDS)
    state.shards -= stolen
    pushLog(state, `数据矿脉 · 挨打时被偷走 ${stolen} 碎片`)
  }
  /* S6 Promise 链：连续命中「受击清零」按实打实掉血判定（闪避 / 免疫 / 护盾全吸收不清，
     relic-redesign.md B·S6 的「连续命中」语义即按此实现） */
  state.hitStreak = 0
  /* S4 防抖：受击后 1 秒内下一次普攻可转三连击（内存结算在普攻出手时才做，不足则普攻照旧） */
  if (state.mods.tripleOnHurt > 0) {
    state.debounceUntil = now + DEBOUNCE_WINDOW_MS
  }
  if (state.mods.hurtDodgeMs > 0) state.hurtDodgeUntil = now + state.mods.hurtDodgeMs
  if (state.mods.hurtHasteMs > 0) state.hurtHasteUntil = now + state.mods.hurtHasteMs
  pushPop(state, "hurt", amount)

  /* 第一次实实在在挨血：教一次闪避 */
  if (!state.coachHitDone) {
    state.coachHitDone = true
    pushTip(state, "挨到伤害了 · 按 Shift 闪避，能躲开大部分出手")
  }

  /* C3 媒体查询：每层首次跌破 30% 血自动「响应式重构」（每层限 1 次，内存不足则不触发）。
     放在死亡判定之前——重构回的 20 血能把濒死这一下救回来，视为血量「跌破」而非「归零」。
     清除的负面状态清单（本引擎内的玩家侧负面通道）：
     - bossSpeedCutUntil：强制跳转 / 无限重定向造成的攻速减半
     - qteAttackCutUntil / qteAttackCutRatio：弹窗雨 QTE 失败造成的攻击下降
     不清除：祭坛诅咒（cursedFloor，按层的祭坛代价，不属于战斗中负面）、
     层限时超时（overtime，层规则不是状态）。
     hurtHasteUntil / hurtDodgeUntil 为受击补偿性增益，不算负面。 */
  if (
    state.mods.responsiveRefactor > 0 &&
    !state.refactorUsedThisFloor &&
    state.playerHp > 0 &&
    state.playerMaxHp > 0 &&
    state.playerHp <= Math.ceil(state.playerMaxHp * 0.3)
  ) {
    if (trySpendMemory(state, REFACTOR_MEMORY_COST)) {
      state.refactorUsedThisFloor = true
      state.bossSpeedCutUntil = 0
      state.qteAttackCutUntil = 0
      state.qteAttackCutRatio = 0
      healPlayer(state, REFACTOR_HEAL)
      pushPop(state, "refactor", 0)
      playSfx("refactor")
      pushLog(
        state,
        `响应式重构 · 负面效果清空，回 ${REFACTOR_HEAL} 点生命（本层仅此一次）`,
      )
    }
  }

  if (state.playerHp <= 0) tryReviveOrDie(state, enemy)
}

/** 禅模式（ui-pack.md v3 一）：顶栏二级信息折叠时攻速 +5%（信息越少越专注） */
const ZEN_HASTE_DIV = 1.05
/** 内存历史曲线（ui-pack.md v3 二）：采样间隔与窗口上限（48 × 250ms ≈ 12 秒） */
const MEMORY_HIST_SAMPLE_MS = 250
const MEMORY_HIST_MAX = 48

/* ---- 内核包 v1（kernel-tabs.md）：多标签页 ---- */
/** 新开一个额外标签页的内存花费 / 额外页上限 */
const TAB_OPEN_COST_MEMORY = 4
const TAB_MAX_EXTRA = 3
/** 维持费：未冻结每 6 秒 −1 内存，冻结减半（12 秒 −1） */
const TAB_MAINTAIN_MS = 6000
const TAB_MAINTAIN_FROZEN_MS = 12000
/** 崩溃：未冻结额外页每 8 秒掷 6%（主标签不崩——它崩了等于整层白丢，太阴间） */
const TAB_CRASH_EVERY_MS = 8000
const TAB_CRASH_CHANCE = 0.06
/** 后台页半速出手：间隔 = 正常出手间隔 ×2；单帧落后超过这个值不追打 */
const TAB_BG_INTERVAL_MULT = 2
const TAB_BG_CATCHUP_GUARD_MS = 2000
/** 切页防误触 */
const TAB_SWITCH_LOCK_MS = 350
/** 强关额外页：页内存活敌人按正常掉落折算后 ×50% 直接入账 */
const TAB_CLOSE_SHARD_RATIO = 0.5
/** 额外页内每个敌人独立 25% 概率是精英 */
const TAB_ELITE_CHANCE = 0.25

/* ---- 核心体验包 v2（core-experience-pack2.md）一：援军召唤（Aura 型友军） ---- */
/** 召唤援军：花 8 内存开一张空页（与开页同门槛：普通层战斗中、页未满） */
const ALLY_COST = 8
/** 脚本精灵：每 3 秒对台前血量最低的非隐身存活敌补固定 6 伤害（走 hitEnemy 通道） */
const ALLY_STRIKE_MS = 3000
const ALLY_STRIKE_DMG = 6
/** 精灵没有目标时顺延一步再找 */
const ALLY_STRIKE_RETRY_MS = 1000
/** 样式守卫：存在（未冻结未崩溃）期间全场敌人攻击 −15%（enemyAttackAmount 统一乘区） */
const GUARD_REDUCE = 0.15
/** 缓存虫：每 5 秒 +1 内存（夹到上限） */
const ALLY_MEM_MS = 5000

/* ---- 核心体验包 v2（core-experience-pack2.md）二：缓存电池（层内超限蓄水池） ---- */
/** 每格存入量 / 每层免费存入次数 / 取出门票 / 清空额外奖励 / 槽位数 */
const CACHE_PER = 5
const CACHE_DEPOSIT_PER_FLOOR = 2
const CACHE_TAKE_COST = 1
const CACHE_BURN_BONUS = 2
const CACHE_MAX_SLOTS = 3

/* ---- 核心体验包 v1（core-experience-pack.md）：双面回廊 / 跳转弹窗 / leak 偷内存 ---- */
/** 双面回廊：背面跨页重击的间隔与伤害（不吃闪避与护盾，休闲模式归零） */
const TWIN_BURST_MS = 8000
const TWIN_BURST_DMG = 18
/** 同步击杀判定窗口（两次真实死亡间隔） */
const TWIN_SYNC_MS = 2000
/** 任一半死亡后另一半的攻击倍率（一次性） */
const TWIN_RAGE_MULT = 1.5
/** 同步击杀的直入碎片 */
const TWIN_SYNC_SHARDS = 60
/** 跳转弹窗：跳点间隔 / 落地强化窗 / 强化倍率 / 无落点时的顺延 */
const JUMP_INTERVAL_MS = 8000
const JUMP_BUFF_MS = 3000
const JUMP_BUFF_MULT = 1.3
const JUMP_RETRY_MS = 2000
/** leak 偷内存：偷取间隔 / 溢出阈值（偷满后攻击乘区从线性改吃固定 ×2） */
const LEAK_STEAL_MS = 3000
const LEAK_OVERFLOW_AT = 6

/* ---- 内核包 v2（任务管理器）：每层一次的暂停决策 ---- */
/** 打开任务管理器的内存花费（不操作也会付掉这次门票） */
const TASKMGR_OPEN_COST_MEMORY = 2
/** 「结束任务」只对血量 ≤25% 的进程生效 */
const TASKMGR_END_HP_RATIO = 0.25
/** 「限制」：目标出手间隔翻倍（intervalMult 越小越慢，÷2） */
const TASKMGR_THROTTLE_DIV = 2
/** 「优化进程」：8 秒攻速 +15% */
const TASKMGR_BOOST_MS = 8000
const TASKMGR_BOOST_HASTE_DIV = 1.15
/** 「回收后台」：直接 +2 内存 */
const TASKMGR_RECLAIM_MEMORY = 2

/* ---- 表现包（动作与场景设计）：手动斩杀与屏幕震动 ---- */
/** 血骷髅：血量 ≤20% 的普通敌人挂可点标记，3 内存当场关闭 */
const EXECUTE_HP_RATIO = 0.2
const EXECUTE_MEMORY_COST = 3
/** 暴击金色粒子窗时长 / 屏幕震动时长 */
const CRIT_BURST_MS = 600
const SHAKE_MS = 160
/** 主动技释放特写演出时长 / 蓄力到该倍率算「满档」升级金色特写 */
const SKILL_FOCUS_MS = 420
const SKILL_FOCUS_CHARGE_FULL = 1.75

/** 实际攻速间隔：防抖翻倍 / 无痕切换 +25% / 无痕步 +30% / 大 Boss 阶段 2 攻速减半 */
function effectiveAttackInterval(state: RunState): number {
  let ms = state.mods.attackIntervalMs
  /* 禅模式（ui-pack.md v3 一）：折叠 = 默认态就有 +5%，展开回到基准 */
  if (state.uiZen !== false) ms /= ZEN_HASTE_DIV
  /* 内核包 v2：任务管理器「优化进程」8 秒攻速 +15% */
  if (state.now < (state.taskHasteUntil ?? 0)) ms /= TASKMGR_BOOST_HASTE_DIV
  /* 受击加速（v3 遗留的正向补偿通道）。v4 起完美闪避不再给攻速：
     「防抖」词条改走三连击机制（relic-redesign.md B·S4），perfectHasteUntil 通道已删 */
  if (state.now < state.hurtHasteUntil) ms *= 0.5
  if (state.now < state.dodgeHasteUntil) ms *= DODGE_HASTE_MULT
  if (state.now < state.activeHasteUntil) ms *= RANGER_STEP_MULT
  /* 工作僧侣主动技「多线程执行」：3 秒内攻速 +60% */
  if (state.now < state.multithreadUntil) ms /= MULTITHREAD_HASTE_MULT
  /* 内核之影被动「根权限」：血量低于 40% 上限时攻速 +30% */
  if (
    state.character.id === "kernel-shade" &&
    state.playerMaxHp > 0 &&
    state.playerHp < state.playerMaxHp * ROOT_HP_RATIO
  ) {
    ms /= ROOT_HASTE_MULT
  }
  const boss = activeBoss(state)
  if (boss?.boss?.speedCut) ms /= BOSS_CRASH_SPEED_CUT
  /* 强制跳转 / 无限重定向：玩家攻速减半 */
  if (state.now < state.bossSpeedCutUntil) ms /= BOSS_CRASH_SPEED_CUT
  /* 手动点击连击：每层 +5% 攻速，与上面所有加成合流进最终间隔 */
  if (state.clickCombo > 0) ms /= 1 + state.clickCombo * CLICK_COMBO_SPEED_PER
  /* v2 内存区间惩罚：充裕 +5% / 卡顿 -10% / 阻塞 -30%；
     低内存持续 ≥3 秒再 -5%（卡顿累积，回到 ≥40% 由 advance 清零）。
     深化包·超频爆发期按「稳定」处理：区间惩罚与卡顿累积一并跳过，改吃独立乘区 +20% 攻速 */
  if (state.now < (state.ocUntil ?? 0)) {
    ms /= OC_HASTE_MULT
  } else {
    const memZone = memoryZoneOf(state)
    if (memZone === "abundant") ms /= MEMORY_ABUNDANT_HASTE_MULT
    if (memZone === "tense") ms /= MEMORY_TENSE_SPEED_MULT
    if (memZone === "exhausted") ms /= MEMORY_EXHAUSTED_SPEED_MULT
    if (
      state.memStallSince > 0 &&
      state.now - state.memStallSince >= MEMORY_STALL_HASTE_AT_MS
    )
      ms /= MEMORY_STALL_HASTE_MULT
  }
  /* 深化包·碎片 ≥5：长期不整理的代价，常驻攻速 -10% */
  if ((state.memFrags ?? 0) >= MEM_FRAG_HEAVY_AT)
    ms *= MEM_FRAG_HEAVY_INTERVAL_MULT
  return Math.max(140, Math.round(ms))
}

/**
 * S1/S2 事件监听 / 回调地狱弹射（relic-redesign.md B·S1/S2）：
 * 玩家普攻命中后弹下一个存活敌人——标签条顺序里当前目标之后的第一个存活敌人；
 * 第一跳伤害 = 本次普攻伤害 × bounceFirstRatio(0.5)，之后每跳 ×bounceStepRatio(0.7) 递减；
 * 每跳各扣 bounceMemoryCost 内存（原子结算，不足则该跳起弹射终止、不扣费）。
 * 弹射流 combo（批次 C）会把 bounceMemoryCost 降为 0——trySpendMemory 对 0 直接放行。
 * 只有普攻触发：链式暴击（S6）与闭包回响（S3）都不弹（避免全体伤害再乘弹射的爆炸组合）。
 */
function tryBounce(state: RunState, from: EnemyInstance, baseDamage: number) {
  /* 监听债（fun-pack3.md 一）：两条弹射词条同场时跳数翻倍——但回调链随时会断 */
  const jumps =
    state.mods.bounceJumps * (state.mods.conflictBounceDouble > 0 ? 2 : 1)
  if (jumps <= 0) return
  /* 弹射衰减（fun-pack2.md 二）：敌人适应后学会躲第二下 */
  let damage =
    baseDamage *
    state.mods.bounceFirstRatio *
    (state.adaptBounce ? ADAPT_BOUNCE_MULT : 1)
  for (let jump = 0; jump < jumps; jump += 1) {
    const next = aliveEnemies(state).find((item) => item.uid !== from.uid)
    if (!next) return
    if (trySpendMemory(state, state.mods.bounceMemoryCost) === null) return
    damage = Math.max(1, Math.round(damage))
    hitEnemy(state, next, damage, false)
    state.learnBounceHits += 1
    /* 弹射轨迹感（ui-pack.md 二）：被链到的敌人 0.5 秒紫描边 */
    next.bounceFlashUntil = state.now + 500
    pushPop(state, "bounce", 0)
    playSfx("bounce")
    /* 监听债反噬：每跳 30% 概率断线，这一跳的伤害有 25% 弹回自己身上（夹 1 血） */
    if (
      state.mods.conflictBounceBackPct > 0 &&
      Math.random() < state.mods.conflictBounceBackPct
    ) {
      const back = Math.max(1, Math.round(damage * CONFLICT_BOUNCE_BACK_RATIO))
      state.playerHp = Math.max(1, state.playerHp - back)
      state.tookDamage = true
      pushPop(state, "hurt", back)
      playSfx("hit")
    }
    damage *= state.mods.bounceStepRatio
  }
}

/** C5 最近存活敌人：按标签条 slot 距离排序（Boss 召唤物 slot=-1 视作排在最右） */
function nearestAliveEnemy(
  state: RunState,
  fromSlot: number,
): EnemyInstance | null {
  const alive = aliveEnemies(state)
  if (alive.length === 0) return null
  const slotOf = (e: EnemyInstance) => (e.slot >= 0 ? e.slot : alive.length)
  return alive.reduce((best, e) =>
    Math.abs(slotOf(e) - fromSlot) < Math.abs(slotOf(best) - fromSlot)
      ? e
      : best,
  )
}

let miniShieldSeq = 0

/**
 * C5 伪元素（relic-redesign.md B·C5）：护盾破碎瞬间 trySpendMemory(2) 成功
 * → 分裂 shieldSplit 个小护盾自动追踪最近存活敌人，到达爆炸（每个 8 伤）。
 * 「被敌人攻击打爆」与「到达即爆」合并：小护盾没有独立受击目标（敌人只打玩家），
 * 一切消亡路径都是到期爆炸。低配不飞：0.3 秒后直接结算。
 * 小护盾消亡统一走 gainMemory(mods.minionDeathMemory)，给 M5 垃圾回收留接口。
 */
function spawnMiniShields(state: RunState) {
  if (trySpendMemory(state, SPLIT_MEMORY_COST) === null) return
  const fromSlot = currentTarget(state)?.slot ?? 0
  const count = state.mods.shieldSplit
  const flyMs = state.lowSpec ? MINI_SHIELD_LOW_SPEC_MS : MINI_SHIELD_FLY_MS
  const target = nearestAliveEnemy(state, fromSlot)
  const fresh: MiniShield[] = []
  for (let i = 0; i < count; i += 1) {
    miniShieldSeq += 1
    fresh.push({
      id: miniShieldSeq,
      bornAt: state.now,
      arriveAt: state.now + flyMs,
      targetUid: target?.uid ?? null,
      progress: 0,
    })
  }
  state.miniShields = [...state.miniShields, ...fresh]
  playSfx("split")
  pushLog(state, `伪元素 · 护盾碎片分裂出 ${count} 个小护盾`)
}

function playerAttack(state: RunState, mult: number) {
  const enemy = currentTarget(state)
  if (!enemy) return
  state.lastAttackAt = state.now

  /* N2 缓存命中（relic-redesign.md B·N2）：对同一目标连续攻击计数，
     每满 4 的第 N 击必定暴击 + 回内存；切锁定目标（uid 变化）自动从 1 重计。
     链式暴击 / 闭包等全体伤害同样经 playerAttack 出手，所以都计入连击数 */
  if (state.cacheHitUid === enemy.uid) state.cacheHits += 1
  else {
    state.cacheHitUid = enemy.uid
    state.cacheHits = 1
  }
  const fourthHit =
    state.mods.fourthHitCrit > 0 && state.cacheHits % CACHE_HIT_EVERY === 0
  if (fourthHit && state.mods.memoryGainFourthHit > 0)
    gainMemory(state, state.mods.memoryGainFourthHit)

  const floorBonus =
    1 + state.mods.attackPerFloorMult * Math.max(0, state.floor - 1)
  let amount =
    (state.mods.baseAttack + state.mods.attackFlat) *
    state.mods.attackMult *
    floorBonus
  amount += state.combo * 0.5
  amount *= mult
  /* 缓存法师：护盾还在的时候攻击 +15% */
  if (state.character.id === "cache-mage" && state.shield > 0) {
    amount *= MAGE_SHIELD_ATTACK_MULT
  }
  /* C6 层叠上下文：护盾存在时攻击 +20%（relic-redesign.md B·C6，与缓存法师被动并列乘算） */
  if (state.shield > 0 && state.mods.shieldAttackBonus > 0) {
    amount *= 1 + state.mods.shieldAttackBonus
  }

  /* Boss 技能召唤的小怪没清掉：玩家攻击下降（弹窗雨 -20%） */
  let cut = state.enemies.reduce(
    (max, item) =>
      !item.closing && item.attackCut > 0
        ? Math.max(max, item.attackCut)
        : max,
    0,
  )
  /* 弹窗雨 QTE 失败：这段时间玩家攻击下降 */
  if (state.now < state.qteAttackCutUntil) {
    cut = Math.max(cut, state.qteAttackCutRatio)
  }
  if (cut > 0) amount *= 1 - cut

  const hpRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1
  if (hpRatio <= state.mods.executeThreshold) amount += state.mods.executeBonus

  if (state.nextHitBonus > 0) {
    amount *= 1 + state.nextHitBonus
    state.nextHitBonus = 0
  }

  /* S6 Promise 链（relic-redesign.md B·S6）：连续命中满阈值后，这次普攻转链式暴击——
     对全体存活敌人造成 150% 普攻伤害，trySpendMemory 成功才转；
     内存耗 = mods.chainCritMemoryCost（默认 3，combo·斩杀流 C 节·4 降为 1，效果点在此处）；
     不足则普通普攻且不清计数（下次内存够了还能转）。判定放在暴击结算之前：
     链式伤害是固定 150% 倍率，crit=true 只是走金色飘字显示，不另乘暴伤，critNext 留给普通一击。 */
  const chainThreshold = state.mods.chainCrit
  if (chainThreshold > 0 && state.hitStreak >= chainThreshold) {
    if (trySpendMemory(state, state.mods.chainCritMemoryCost) !== null) {
      state.hitStreak = 0
      playSfx("chainCrit")
      const chainDamage = Math.max(1, Math.round(amount * CHAIN_CRIT_RATIO))
      const targets = aliveEnemies(state)
      pushLog(
        state,
        `Promise 链 · 链式暴击扫过 ${targets.length} 个敌人（${Math.round(
          CHAIN_CRIT_RATIO * 100,
        )}% 伤害）`,
      )
      targets.forEach((target) => hitEnemy(state, target, chainDamage, true))
      return
    }
  }

  let crit = false
  if (state.critNext) {
    crit = true
    state.critNext = false
  } else if (fourthHit) {
    /* N2 缓存命中：同目标第 4 击（每满 4 循环）必定暴击 */
    crit = true
  } else if (Math.random() < state.mods.critChance) {
    crit = true
  }

  /* 暴击护甲（fun-pack2.md 二）：适应后暴伤只吃一半加成 */
  const effCritMult =
    crit && state.adaptCrit
      ? 1 + (state.mods.critMult - 1) * 0.5
      : crit
        ? state.mods.critMult
        : 1
  const final = Math.max(1, Math.round(amount * effCritMult))
  hitEnemy(state, enemy, final, crit)

  /* 黑箱拦截（fun-pack3.md 一）：每暴击一次电流回身（夹 1 血，词条反噬不致死） */
  if (crit && state.mods.conflictCritBackHp > 0) {
    state.playerHp = Math.max(1, state.playerHp - state.mods.conflictCritBackHp)
    state.tookDamage = true
    pushPop(state, "hurt", state.mods.conflictCritBackHp)
    playSfx("hit")
  }

  /* S6 计数：每次普攻命中 +1（双重打击 / 追击等算独立一次出手）；受击清零见 hurtPlayer */
  state.hitStreak += 1

  /* C4 过渡动画（relic-redesign.md B·C4）：闪避后 2 秒窗口内普攻命中，
     被击敌人攻速减半（interval 通道，effect 见 enemyInterval 的 attackSlowUntil 分支；
     重复命中刷新持续时间） */
  if (
    state.mods.enemySlowMs > 0 &&
    state.now < state.transitionUntil &&
    !enemy.closing
  ) {
    enemy.attackSlowUntil = Math.max(
      enemy.attackSlowUntil,
      state.now + state.mods.enemySlowMs,
    )
  }

  /* S1/S2 事件监听 / 回调地狱：命中后弹射下一个存活敌人（链式暴击与闭包不弹） */
  tryBounce(state, enemy, final)

  /* N4 CDN 加速（relic-redesign.md B·N4）：普攻命中后对锁定目标「后面」的敌人
     （标签条 slot 顺序，Boss 召唤物 slot=-1 视作排最右）各造成穿透位伤害；
     一次出手只扣一次 pierceMemoryCost，扣不动则整次穿透不触发。
     combo·穿透流（C 节·8）把 pierceRatio 提到 0.5、pierceMemoryCost 降为 0
     （trySpendMemory 对 0 放行 = 免费），两个数值都在 buildMods 覆盖，效果点在此处 */
  if (state.mods.pierceRatio > 0 && !enemy.closing) {
    const slotOfPierce = (item: EnemyInstance) =>
      item.slot >= 0 ? item.slot : Number.MAX_SAFE_INTEGER
    const behind = aliveEnemies(state).filter(
      (item) => item.uid !== enemy.uid && slotOfPierce(item) > slotOfPierce(enemy),
    )
    if (
      behind.length > 0 &&
      trySpendMemory(state, state.mods.pierceMemoryCost) !== null
    ) {
      const pierceDamage = Math.max(
        1,
        Math.round(final * state.mods.pierceRatio),
      )
      behind.forEach((item) => hitEnemy(state, item, pierceDamage, false))
      playSfx("pierce")
      /* 表现包：穿透贯穿感 = 2px 轻微震屏 */
      triggerShake(state, 2)
    }
  }

  /* 脚本战士被动「监听叠加」：每次命中叠 1 层，满 5 层下次攻击必暴并清空 */
  if (state.character.id === "script-warrior") {
    state.listenStacks += 1
    if (state.listenStacks >= LISTEN_STACKS_MAX) {
      state.listenStacks = 0
      state.critNext = true
      pushLog(state, "监听叠加 · 满 5 层，下一击必定暴击")
    }
  }

  /* 工作僧侣被动「后台同步」：每 8 次普通攻击追加一次固定 8 点伤害（不吃暴击） */
  if (state.character.id === "worker-monk") {
    state.syncStacks += 1
    if (state.syncStacks >= SYNC_STACKS_MAX) {
      state.syncStacks = 0
      const syncTarget = currentTarget(state)
      if (syncTarget) {
        pushLog(state, `后台同步 · 第 ${SYNC_STACKS_MAX} 次攻击补上 ${SYNC_STRIKE_DAMAGE} 点固定伤害`)
        hitEnemy(state, syncTarget, SYNC_STRIKE_DAMAGE, false)
      }
    }
  }
}

function retarget(state: RunState) {
  const alive = visibleEnemies(state)
  if (alive.length === 0) return
  if (!alive.some((enemy) => enemy.uid === state.lockedUid)) {
    state.lockedUid = alive[0].uid
  }
  const target = alive.find((enemy) => enemy.uid === state.lockedUid)
  if (target && target.kind === "boss" && target.boss?.phase === 1) {
    const open = target.buttons.filter((button) => !button.closed)
    if (open.length > 0 && !open.some((b) => b.id === state.lockedButtonId)) {
      state.lockedButtonId = open[0].id
    }
  }
}

/**
 * 三选一（seed-system.md 五）：稀有度按层权重、系别去重、排除已持有、
 * rare/epic 保底通道全部改走种子流。key 由各通道拼好传入，
 * 保证「同种子同层同通道 → 内容一致」，与玩家是否刷过卡无关。
 */
function pickRelicChoices(
  state: RunState,
  key: string,
  owned: Relic[],
  count: number,
  rarityFloor: "rare" | "epic" | undefined = undefined,
): Relic[] {
  return genRelicChoices(
    state.seed,
    key,
    owned,
    count,
    state.floor,
    rarityFloor,
    state.dailyPools?.relicPool,
  )
}

function openRelicPhase(state: RunState) {
  const forceRare = state.forceRareChoice
  const forceEpic = state.forceEpicChoice
  state.phase = "relic"
  state.forceRareChoice = false
  state.forceEpicChoice = false
  state.rerollsLeft =
    BASE_REROLL_PER_FLOOR + state.mods.rerollPerFloor + state.bonusReroll
  state.choices = pickRelicChoices(
    state,
    `relic:${state.floor}:open`,
    state.relics,
    BASE_CHOICE_COUNT + state.mods.extraChoiceCount,
    forceEpic ? "epic" : forceRare ? "rare" : undefined,
  )
  state.pendingRelic = null
  state.relicPickIndex = 0
  pushLog(
    state,
    forceEpic
      ? "本层清空 · 路线保底：必出 1 个史诗词条"
      : forceRare
        ? "本层清空 · 必掉 1 个稀有词条，挑一个带走"
        : "本层清空 · 选一个词条带走",
  )
}

/* ------------------------------------------------------------------ *
 * 纯函数：路线选择（dungeon-route.md 一）
 * 三选一结束 → phase "route" → 选路 → 战斗层 enterFloor / 事件房就地处理
 * ------------------------------------------------------------------ */

/** 事件房（回收站/商店/祭坛/宝箱/陷阱/空）过层：打完不弹三选一，直接选下一层的路 */
function passEventFloor(state: RunState): RunState {
  const cleared: RunState = {
    ...state,
    activeRouteId: null,
    activeEntry: null,
    routeChoices: [],
  }
  if (cleared.floor >= 7) {
    /* 第 7 层是事件房：下一层就是固定 Boss */
    return enterFloor(cleared, 8)
  }
  return rollRouteChoices(cleared)
}

/** 词条系别计数（路线 Build 修正用，seed-system.md 三） */
function relicSchoolCounts(
  relics: Relic[],
): Partial<Record<RelicSchoolKey, number>> {
  const counts: Partial<Record<RelicSchoolKey, number>> = {}
  relics.forEach((relic) => {
    counts[relic.school] = (counts[relic.school] ?? 0) + 1
  })
  return counts
}

/** 进选路阶段：路线选项按种子生成（seed-system.md 三）。第 4/8 层 Boss 固定，跳过选路直接进层。镜像层先弹复制面板再选路 */
function rollRouteChoices(state: RunState): RunState {
  if (state.mirrorPending) {
    const mirror: RunState = {
      ...state,
      mirrorPending: false,
      phase: "overlay",
      overlayKind: "mirror",
      overlayReturn: "route",
      pops: [...state.pops],
    }
    pushLog(mirror, "镜像空间 · 选 1 个已有词条复制一份（内存上限 -2）")
    return mirror
  }
  const targetFloor = state.floor + 1
  /* 固定 Boss 层红线：打完第 3 层直奔小 Boss、打完第 7 层直奔大 Boss，不选路 */
  if (targetFloor === 4 || targetFloor >= DUNGEON_RUN_FLOORS.length) {
    const cleared: RunState = {
      ...state,
      routeChoices: [],
      activeRouteId: null,
      activeEntry: null,
      overlayKind: "none",
      pops: [...state.pops],
    }
    return enterFloor(cleared, DUNGEON_RUN_FLOORS.length === targetFloor ? 8 : 4)
  }
  const ctx: RouteChoiceContext = {
    hpRatio:
      state.playerMaxHp > 0 ? state.playerHp / state.playerMaxHp : 1,
    schoolCounts: relicSchoolCounts(state.relics),
    prevRouteId:
      state.routeLog.length > 0
        ? state.routeLog[state.routeLog.length - 1].routeId
        : null,
  }
  /* 404「重定向」（fun-pack.md 三）：本层路线换一个子流重摇一次 */
  const rerollRoute = state.crisisRerollRoute
  const next: RunState = {
    ...state,
    phase: "route",
    routeChoices: genRouteOptions(
      rerollRoute ? `${state.seed}:reroute` : state.seed,
      targetFloor,
      ctx,
      state.dailyPools,
    ),
    crisisRerollRoute: false,
    overlayKind: "none",
    shopStock: [],
    altarOffer: null,
    altarCost: null,
    altarPendingRelic: null,
    altarType: "relic",
    pops: [...state.pops],
  }
  pushLog(next, `三选一结束 · 选一条路去第 ${state.floor + 1} 层`)
  if (rerollRoute) pushLog(next, "404 的重定向生效 · 这一层的路被重新摇过")
  if (!next.coachRouteDone) {
    next.coachRouteDone = true
    pushTip(next, "不同的路决定敌人和奖励，按你的流派选")
  }
  return next
}

/** 镜像复制：复制选中的词条（id 加后缀防 key 冲突），内存上限 -2；buildMods 按 effect 聚合天然翻倍 */
function applyMirrorCopy(state: RunState, relicId: string): RunState {
  if (state.overlayKind !== "mirror") return state
  const src = state.relics.find((relic) => relic.id === relicId)
  if (!src) return state
  const copy: Relic = { ...src, id: `${src.id}-copy2`, code: `${src.code}·影` }
  const relics = [...state.relics, copy]
  const next: RunState = { ...state, relics }
  next.mirrorCapPenalty += MIRROR_CAP_PENALTY
  next.mods = buildMods(next.character, relics, next.floor, extrasOf(next))
  pushLog(next, `镜像复制 · 多了一份「${src.name}」，内存上限 -2`)
  playSfx("pick")
  return rollRouteChoices({ ...next, overlayKind: "none" })
}

/** 镜像面板「不复制」：什么都不拿，直接选路 */
function skipMirror(state: RunState): RunState {
  if (state.overlayKind !== "mirror") return state
  pushLog(state, "镜像空间 · 没碰那面镜子")
  return rollRouteChoices({ ...state, overlayKind: "none" })
}

const UNKNOWN_CHEST_SHARDS = 30
const UNKNOWN_TRAP_DAMAGE = 20
const RECYCLE_MEMORY_GAIN = 10

function applyUnknownEvent(state: RunState, floor: number): RunState {
  /* 事件 roll 走种子流 event:{N}（seed-system.md 六） */
  const ev = genUnknownEvent(state.seed, floor)
  const next: RunState = {
    ...state,
    floor,
    activeRouteId: "unknown-zone",
    activeEntry: null,
    pops: [...state.pops],
  }
  if (ev === "shop") {
    pushBanner(next, "未知区域 · 一台自动售货机哐当作响")
    openShop(next, "route")
    return next
  }
  if (ev === "altar") {
    /* 祭坛 4 型按种子 roll（seed-system.md 六）：词条 40 / 生命 25 / 内存 20 / 诅咒 15。
       诅咒祭坛 = 免费史诗词条 + 随机 1 个诅咒（原 50% 通道并入类型 roll） */
    const altarType = genAltarType(next.seed, floor)
    if (altarType === "curse") {
      const epic = pickShopRelicByRarity(
        next,
        "epic",
        streamFor(next.seed, `event:${floor}:relic`),
      )
      if (epic && next.relics.length < relicSlotCap(next)) {
        next.relics = [...next.relics, epic]
        next.mods = buildMods(
          next.character,
          next.relics,
          next.floor,
          extrasOf(next),
        )
        pushBanner(next, `诅咒祭坛 · 白拿史诗词条「${epic.name}」`)
        pushLog(next, `诅咒祭坛 · 收下「${epic.name}」`)
      }
      const curse = genCurse(next.seed, floor)
      if (!next.curses.includes(curse)) {
        next.curses = [...next.curses, curse]
        next.mods = buildMods(
          next.character,
          next.relics,
          next.floor,
          extrasOf(next),
        )
        pushLog(next, `诅咒祭坛 · 代价：诅咒「${CURSE_DEFS[curse].name}」`)
        if (!next.coachCurseDone) {
          next.coachCurseDone = true
          pushTip(next, "诅咒可以在回收站或商店清掉")
        }
      }
      return passEventFloor(next)
    }
    openAltar(next, "route", altarType)
    return next
  }
  if (ev === "crisis") {
    /* 代价事件（fun-pack.md 三）：三选一全带代价，选完才过层 */
    const crisisId = genCrisis(next.seed, floor)
    next.phase = "overlay"
    next.overlayKind = "crisis"
    next.crisisEvent = crisisId
    playSfx("suspense")
    pushLog(next, `${CRISIS_DEFS[crisisId].title} · 这里没有不疼的选项`)
    return next
  }
  if (ev === "chest") {
    pushBanner(next, `捡到一个未加密的宝箱 · 碎片 +${UNKNOWN_CHEST_SHARDS}`)
    creditShards(next, UNKNOWN_CHEST_SHARDS)
    playSfx("pick")
    return passEventFloor(next)
  }
  if (ev === "trap") {
    next.playerHp = Math.max(1, next.playerHp - UNKNOWN_TRAP_DAMAGE)
    pushPop(next, "hurt", UNKNOWN_TRAP_DAMAGE)
    pushBanner(next, `陷阱！数据尖刺扎穿了你 · 生命 -${UNKNOWN_TRAP_DAMAGE}`)
    playSfx("hit")
    return passEventFloor(next)
  }
  if (ev === "elite") {
    pushBanner(next, "未知区域 · 一个精英敌人从阴影里跳了出来")
    return enterFloor(next, floor, {
      routeId: "unknown-zone",
      enemyComp: [{ defId: "notfound", hp: 45, attack: 6, elite: true }],
    })
  }
  pushBanner(next, "这里什么都没有，安静得可疑")
  return passEventFloor(next)
}

/* ------------------------------------------------------------------ *
 * 代价事件结算（fun-pack.md 三）：没有正确答案的三选一
 * ------------------------------------------------------------------ */

/** 随机挑一个持有词条的 id（丢失 / 隔离共用；镜像复制的 id 自带 -copy 后缀天然区分） */
function pickRandomRelicId(state: RunState): string | null {
  if (state.relics.length === 0) return null
  const src = state.relics[Math.floor(Math.random() * state.relics.length)]
  return src?.id ?? null
}

function rebuildMods(state: RunState) {
  state.mods = buildMods(
    state.character,
    state.relics,
    state.floor,
    extrasOf(state),
  )
}

/**
 * 选项结算。扣血类一律保底 1 血——事件屏不该判死刑（与陷阱同一约定）；
 * 「下一场才生效」的代价（追加敌人 / 护盾 / 内存砍半 / 税）走 crisis* 标记，enterFloor 消费。
 */
function applyCrisisChoice(state: RunState, optionIndex: number): RunState {
  if (
    state.phase !== "overlay" ||
    state.overlayKind !== "crisis" ||
    !state.crisisEvent
  ) {
    return state
  }
  const def = CRISIS_DEFS[state.crisisEvent]
  const option = def.options[optionIndex]
  if (!option) return state

  const next: RunState = { ...state, pops: [...state.pops] }
  const loseHp = (amount: number) => {
    if (next.playerHp <= 1) return
    const real = Math.min(next.playerHp - 1, amount)
    next.playerHp = Math.max(1, next.playerHp - amount)
    if (real > 0) pushPop(next, "hurt", real)
    if (real > 0) {
      next.tookDamage = true
      /* 本层无伤判定作废（广告地狱裂隙条件，fun-pack3.md 二） */
      next.noDamageFloor = false
    }
  }
  const loseRandomRelic = () => {
    const id = pickRandomRelicId(next)
    if (!id) {
      pushLog(next, "翻了半天，你身上根本没有词条可丢")
      return
    }
    const name = next.relics.find((relic) => relic.id === id)?.name ?? "词条"
    next.relics = next.relics.filter((relic) => relic.id !== id)
    pushLog(next, `「${name}」没了`)
    rebuildMods(next)
  }

  switch (state.crisisEvent) {
    case "crash-popup": {
      if (optionIndex === 0) {
        loseHp(15)
        pushLog(next, "强行关闭崩溃弹窗，被它临死抓了一口")
      } else if (optionIndex === 1) {
        next.crisisExtraPopup = true
        pushLog(next, "无视了崩溃弹窗 · 它开始叫人，页面还会多出假按钮")
      } else {
        loseRandomRelic()
        next.bonusMemoryCap += 1
        rebuildMods(next)
        pushLog(next, "注册表大扫除 · 内存上限 +1")
      }
      break
    }
    case "mem-overflow": {
      if (optionIndex === 0) {
        next.crisisMemoryHalf = true
        pushLog(next, "一键清空 · 下一场进场时内存只剩一半")
      } else if (optionIndex === 1) {
        next.bonusMemoryCap += 2
        loseHp(25)
        rebuildMods(next)
        pushLog(next, "强行扩容 · 内存上限 +2，电费是 25 点血")
      } else {
        next.crisisEnemyShield = true
        pushLog(next, "内存的账转嫁给了下一场的敌人")
      }
      break
    }
    case "bluescreen": {
      if (optionIndex === 0) {
        const target = Math.ceil(next.playerMaxHp * 0.6)
        if (next.playerHp < target) {
          pushPop(next, "heal", target - next.playerHp)
          next.playerHp = target
        }
        loseRandomRelic()
        pushLog(next, "强制重启 · 血回了六成，代价是随机一条词条")
      } else if (optionIndex === 1) {
        loseHp(35)
        next.forceRareChoice = true
        next.crisisGlitchNext = "invert"
        pushLog(next, "原地等完了蓝屏 · 下层三选一必出稀有以上")
      } else {
        const curse = genCurse(next.seed, next.floor)
        if (!next.curses.includes(curse)) {
          next.curses = [...next.curses, curse]
          rebuildMods(next)
        }
        creditShards(next, 40)
        pushLog(next, "锅甩出去了 · +40 碎片，随机背上一个诅咒")
      }
      break
    }
    case "err404": {
      if (optionIndex === 0) {
        next.crisisEliteNext = true
        pushLog(next, "决定追进死胡同 · 下一场有个硬茬")
      } else if (optionIndex === 1) {
        pushLog(next, "404 只是个走丢的页面，放它走了")
      } else {
        next.crisisRerollRoute = true
        pushLog(next, "点了 404 的重定向 · 下一次选路会重新摇")
      }
      break
    }
    case "cache-pollute": {
      if (optionIndex === 0) {
        const lost = next.shards
        next.shards = 0
        pushLog(next, `缓存大扫除 · 口袋里 ${lost} 碎片全没了`)
      } else if (optionIndex === 1) {
        next.crisisTaxFloors = 2
        next.crisisGlitchNext = "scramble"
        pushLog(next, "决定带着污染走 · 接下来两场每场开层 -8 血")
      } else {
        const id = pickRandomRelicId(next)
        if (id) {
          const name = next.relics.find((relic) => relic.id === id)?.name ?? "词条"
          next.quarantinedRelicId = id
          next.quarantineFloorsLeft = 2
          pushLog(next, `「${name}」被贴了封条 · 下一场战斗停用`)
        } else {
          pushLog(next, "翻遍词条全是干净的，这次污染白担心了")
        }
        rebuildMods(next)
      }
      break
    }
  }

  pushBanner(next, `${def.title} · ${option.label}`)
  pushLog(next, `${def.title} · 选了「${option.label}」`)
  pushStory(next, `${def.title}：选了「${option.label}」`)
  playSfx("pick")
  next.overlayKind = "none"
  next.crisisEvent = null
  return passEventFloor(next)
}

/** 选路：战斗路线进层；回收站开面板；未知区域就地 roll 事件 */
function applyRouteChoice(state: RunState, routeId: RouteId): RunState {
  if (state.phase !== "route") return state
  const entry = state.routeChoices.find((item) => item.routeId === routeId)
  if (!entry) return state
  const floor = state.floor + 1
  const type = ROUTE_TYPES[routeId]

  const base: RunState = {
    ...state,
    routeChoices: [],
    routeLog: [...state.routeLog, { floor, routeId }],
    pops: [...state.pops],
  }
  pushLog(base, `取道「${type.name}」· 前往第 ${floor} 层`)

  /* 进层即到账的两类奖励（碎片在层末 finalize、内存在 enterFloor） */
  if (entry.slotReward) {
    base.bonusSlots += 1
    pushLog(base, `「${type.name}」核心奖励 · 词条槽位 +1，现在能带 ${relicSlotCap(base)} 个`)
  }
  if (entry.rerollReward) {
    base.bonusReroll += 1
    pushLog(base, "「时间裂隙」奖励 · 此后每层三选一刷新次数 +1")
  }

  if (routeId === "recycle-bin") {
    const next: RunState = {
      ...base,
      floor,
      phase: "overlay",
      overlayKind: "recycle",
      pendingRemoveMode: "recycle",
      activeRouteId: routeId,
      activeEntry: entry,
    }
    pushLog(next, "回收站 · 没有敌人，挑一个东西丢掉")
    /* 深化包：回收站进层顺手整理内存，碎片清零（免费通道） */
    if ((next.memFrags ?? 0) > 0) {
      clearMemFrags(next)
      pushLog(next, "回收站 · 顺手整理内存，碎片清零")
    }
    applyRouteNarrative(next, routeId, entry)
    return next
  }
  if (routeId === "unknown-zone") {
    const unknown = applyUnknownEvent(base, floor)
    applyRouteNarrative(unknown, routeId, entry)
    return unknown
  }
  const entered = enterFloor(base, floor, entry)
  applyRouteNarrative(entered, routeId, entry)
  return entered
}

/** 回收站面板选定要丢的东西：词条或诅咒都行 */
function applyRemoveChoice(
  state: RunState,
  target: { kind: "relic"; id: string } | { kind: "curse"; id: CurseId },
): RunState {
  if (state.phase !== "overlay" || state.overlayKind !== "recycle") return state
  if (!state.pendingRemoveMode) return state

  let next: RunState
  if (target.kind === "relic") {
    const removed = state.relics.find((relic) => relic.id === target.id)
    if (!removed) return state
    const relics = state.relics.filter((relic) => relic.id !== target.id)
    next = { ...state, relics, pops: [...state.pops] }
    next.mods = buildMods(next.character, relics, next.floor, extrasOf(next))
    pushLog(next, `回收站 · 丢掉了词条「${removed.name}」`)
  } else {
    if (!state.curses.includes(target.id)) return state
    next = {
      ...state,
      curses: state.curses.filter((curse) => curse !== target.id),
      pops: [...state.pops],
    }
    next.mods = buildMods(
      next.character,
      next.relics,
      next.floor,
      extrasOf(next),
    )
    pushLog(next, `回收站 · 清除了诅咒「${CURSE_DEFS[target.id].name}」`)
  }
  playSfx("pick")

  if (next.pendingRemoveMode === "shop") {
    /* 商店清理服务：丢掉就回商店，不送内存 */
    return { ...next, overlayKind: "shop", pendingRemoveMode: null }
  }
  /* 回收站路线本身：丢完内存 +10，过层选路 */
  gainMemory(next, RECYCLE_MEMORY_GAIN)
  pushLog(next, `回收站 · 腾出手脚，内存 +${RECYCLE_MEMORY_GAIN}`)
  next.pendingRemoveMode = null
  return passEventFloor(next)
}

/** 回收站面板「跳过」：商店来路回商店；回收站来路直接过层（不拿内存奖励） */
function skipRemovePanel(state: RunState): RunState {
  if (state.phase !== "overlay" || state.overlayKind !== "recycle") return state
  if (state.pendingRemoveMode === "shop") {
    return { ...state, overlayKind: "shop", pendingRemoveMode: null }
  }
  const next = { ...state, pendingRemoveMode: null }
  pushLog(next, "回收站 · 什么都没丢，转身离开")
  return passEventFloor(next)
}

/* ------------------------------------------------------------------ *
 * 纯函数：局内浮层（商店 / 祭坛 / 回收站）
 * ------------------------------------------------------------------ */

/** 路线系统：祭坛落点只来自未知区域事件；商店固定第 5 层后一次（dungeon-route.md 一/四/五） */
function planOverlays(): { shopFloors: number[]; altarFloor: number | null } {
  return { shopFloors: [5], altarFloor: null }
}

/* 种子货架（seed-system.md 七）：槽 1/2 固定，槽 3/4 随机词条，槽 5 随机功能件 */
const SHOP_UTILITY: {
  kind: ShopItemKind
  title: string
  desc: string
  price: number
}[] = [
  { kind: "reroll", title: "刷新次数 +1", desc: "本层三选一多刷一次", price: 15 },
  { kind: "remove", title: "清理服务", desc: "移除 1 个词条或诅咒", price: 40 },
  { kind: "memcap", title: "内存上限 +2", desc: "此后每层内存上限都高 2", price: 50 },
  { kind: "slot", title: "词条槽位 +1", desc: "能带的词条多一格", price: 100 },
]

/** 商店 / 祭坛的随机词条：抽样走调用方传入的种子流（seed-system.md 五/七） */
function pickShopRelicByRarity(
  state: RunState,
  rarity: RelicRarity,
  rng: () => number,
): Relic | null {
  const ownedIds = new Set(state.relics.map((relic) => relic.id))
  const fresh = RELIC_POOL.filter(
    (relic) => relic.rarity === rarity && !ownedIds.has(relic.id),
  )
  const source =
    fresh.length > 0
      ? fresh
      : RELIC_POOL.filter((relic) => relic.rarity === rarity)
  if (source.length === 0) return null
  return source[Math.floor(rng() * source.length)]
}

/** 5 格种子货架（流键 shop:{层}）：同种子同层货架一致 */
function makeShopStock(state: RunState, seq: number): ShopItem[] {
  const rng = streamFor(state.seed, `shop:${state.floor}`)
  const mk = (
    kind: ShopItemKind,
    title: string,
    desc: string,
    price: number,
    relic: Relic | null = null,
  ): ShopItem => ({
    id: `shop-${seq}-${kind}`,
    kind,
    title,
    desc,
    price,
    relic,
    bought: false,
  })
  const stock: ShopItem[] = [
    mk("heal", "急救包", "回复 30 点生命", 20),
    mk("memory", "内存条 ×10", "内存立刻 +10", 15),
    /* 深化包·固定第 3 格：磁盘整理服务（有碎片才值得买，View 按碎片数置灰） */
    mk("defrag", "磁盘整理服务", "清光全部内存碎片", 20),
  ]
  /* 槽 3：普通 60 / 稀有 40；槽 4：稀有 70 / 史诗 30 */
  const r3: RelicRarity = rng() < 0.6 ? "common" : "rare"
  stock.push(
    mk(
      r3 === "common" ? "relic-common" : "relic-rare",
      r3 === "common" ? "随机普通词条" : "随机稀有词条",
      "货架上摆着一个词条",
      r3 === "common" ? 30 : 60,
      pickShopRelicByRarity(state, r3, rng),
    ),
  )
  const r4: RelicRarity = rng() < 0.7 ? "rare" : "epic"
  stock.push(
    mk(
      r4 === "rare" ? "relic-rare" : "relic-epic",
      r4 === "rare" ? "随机稀有词条" : "随机史诗词条",
      "货架上摆着一个词条",
      r4 === "rare" ? 60 : 120,
      pickShopRelicByRarity(state, r4, rng),
    ),
  )
  /* 槽 5：功能件等权 */
  const util = SHOP_UTILITY[Math.floor(rng() * SHOP_UTILITY.length)]
  stock.push(mk(util.kind, util.title, util.desc, util.price))
  /* id 带槽位号：槽 3/4 可能同为稀有词条，避免 key 撞车 */
  return stock.map((item, index) => ({
    ...item,
    id: `shop-${seq}-${index}-${item.kind}`,
  }))
}

/** returnTo：关掉商店后接三选一（层末固定商店）还是接选路（未知区域事件商店） */
function openShop(state: RunState, returnTo: "relic" | "route") {
  state.phase = "overlay"
  state.overlayKind = "shop"
  state.overlayReturn = returnTo
  state.shopSeq += 1
  state.shopStock = makeShopStock(state, state.shopSeq)
  pushLog(state, "路上捡到一台没人管的自动售货机")
}

/** 关掉浮层后的去向：层末固定商店接三选一；未知区域事件房直接接选路 */
function openRelicAfterOverlay(state: RunState): RunState {
  const next: RunState = {
    ...state,
    overlayKind: "none",
    shopStock: [],
    altarOffer: null,
    altarCost: null,
    altarPendingRelic: null,
    altarType: "relic",
  }
  if (next.overlayReturn === "route") return rollRouteChoices(next)
  openRelicPhase(next)
  return next
}

function applyShopBuy(state: RunState, itemId: string): RunState {
  if (state.phase !== "overlay" || state.overlayKind !== "shop") return state
  const item = state.shopStock.find((entry) => entry.id === itemId)
  if (!item || item.bought) return state
  if (state.shards < item.price) return state
  if (item.kind === "heal" && state.playerHp >= state.playerMaxHp) return state
  /* 深化包：没碎片时买整理没意义，直接挡掉（View 侧同步置灰） */
  if (item.kind === "defrag" && (state.memFrags ?? 0) <= 0) return state
  const relicShop =
    item.kind === "relic-common" ||
    item.kind === "relic-rare" ||
    item.kind === "relic-epic"
  if (relicShop && (!item.relic || state.relics.length >= relicSlotCap(state))) {
    return state
  }

  const next: RunState = {
    ...state,
    shards: state.shards - item.price,
    pops: [...state.pops],
    shopStock: state.shopStock.map((entry) =>
      entry.id === itemId ? { ...entry, bought: true } : entry,
    ),
  }

  if (item.kind === "heal") {
    healPlayer(next, SHOP_HEAL_AMOUNT)
    pushLog(next, `买下急救包 · 回复 ${SHOP_HEAL_AMOUNT} 点血`)
  } else if (item.kind === "memory") {
    gainMemory(next, SHOP_MEMORY_AMOUNT)
    pushLog(next, `买下内存条 · 内存 +${SHOP_MEMORY_AMOUNT}`)
  } else if (item.kind === "defrag") {
    clearMemFrags(next)
    pushLog(next, "买下磁盘整理服务 · 内存碎片清零")
    playSfx("memoryGain")
  } else if (item.kind === "reroll") {
    next.rerollsLeft += SHOP_REROLL_GAIN
    pushLog(next, "买下刷新券 · 本层三选多多刷一次")
  } else if (item.kind === "remove") {
    next.overlayKind = "recycle"
    next.pendingRemoveMode = "shop"
    pushLog(next, "清理服务启动 · 挑一个丢掉")
    playSfx("pick")
    return next
  } else if (item.kind === "memcap") {
    next.bonusMemoryCap += SHOP_MEMCAP_GAIN
    next.mods = buildMods(next.character, next.relics, next.floor, extrasOf(next))
    pushLog(next, `内存上限 +${SHOP_MEMCAP_GAIN}（永久）`)
  } else if (item.kind === "slot") {
    next.bonusSlots += SHOP_SLOT_GAIN
    pushLog(next, `词条槽位 +${SHOP_SLOT_GAIN} · 现在能带 ${relicSlotCap(next)} 个`)
  } else if (item.kind === "seed") {
    next.bonusReroll += 1
    pushLog(next, "刷新次数 +1（永久）· 此后每层三选一都多刷一次")
  } else if (item.relic) {
    const relics = [...next.relics, item.relic]
    next.relics = relics
    /* 商店买的词条走同一套羁绊判定 */
    next.mods = buildMods(next.character, relics, next.floor, extrasOf(next))
    pushLog(next, `买下词条「${item.relic.name}」`)
  }
  playSfx("pick")
  return next
}

/** 词条槽上限：基础槽 + 商店/防火墙买入的加成槽 */
function relicSlotCap(state: RunState): number {
  return MAX_RELIC_SLOTS + state.bonusSlots
}

function pickAltarRelic(state: RunState): Relic | null {
  const rng = streamFor(state.seed, `altar:${state.floor}:offer`)
  const ownedIds = new Set(state.relics.map((relic) => relic.id))
  const fresh = RELIC_POOL.filter(
    (relic) => relic.rarity === "epic" && !ownedIds.has(relic.id),
  )
  if (fresh.length > 0) {
    return fresh[Math.floor(rng() * fresh.length)]
  }
  const epics = RELIC_POOL.filter((relic) => relic.rarity === "epic")
  if (epics.length === 0) return null
  return epics[Math.floor(rng() * epics.length)]
}

/** 祭坛 4 型（seed-system.md 六）：词条献血拿史诗 / 生命花碎片回血 / 内存折生命提上限 / 诅咒白拿 */
function openAltar(
  state: RunState,
  returnTo: "relic" | "route" = "relic",
  type: AltarType = "relic",
) {
  state.phase = "overlay"
  state.overlayKind = "altar"
  playSfx("mystery")
  state.overlayReturn = returnTo
  state.altarType = type
  state.altarOffer = type === "relic" ? pickAltarRelic(state) : null
  state.altarCost = null
  state.altarPendingRelic = null
  pushLog(
    state,
    type === "life"
      ? "一座石台立在路边 · 台座刻着「以碎片换生机」"
      : type === "memory"
        ? "一座石台立在路边 · 台座刻着「以血肉换空间」"
        : "一座石台立在路边 · 上面悬着个发光的词条",
  )
}

/** 付出代价：立刻扣血或背一个只压下一层的诅咒，然后给词条 */
function applyAltarCost(state: RunState, cost: AltarCost): RunState {
  if (state.phase !== "overlay" || state.overlayKind !== "altar") return state
  if (state.altarCost !== null) return state
  if (cost === "shard" && state.shards < ALTAR_LIFE_SHARD_COST) return state

  const next: RunState = {
    ...state,
    altarCost: cost,
    pops: [...state.pops],
  }

  /* 生命祭坛：碎片换血，不走词条通道（seed-system.md 六） */
  if (cost === "shard") {
    next.shards -= ALTAR_LIFE_SHARD_COST
    healPlayer(next, ALTAR_LIFE_HEAL_AMOUNT)
    pushLog(next, `生命祭坛 · 献出 ${ALTAR_LIFE_SHARD_COST} 碎片，回复 ${ALTAR_LIFE_HEAL_AMOUNT} 点血`)
    playSfx("pick")
    return openRelicAfterOverlay(next)
  }

  /* 内存祭坛：生命换内存上限（至少留 1 血） */
  if (cost === "hp") {
    next.playerHp = Math.max(1, next.playerHp - ALTAR_MEMORY_HP_COST)
    pushPop(next, "hurt", ALTAR_MEMORY_HP_COST)
    next.bonusMemoryCap += ALTAR_MEMORY_CAP_GAIN
    next.mods = buildMods(next.character, next.relics, next.floor, extrasOf(next))
    pushLog(next, `内存祭坛 · 献出 ${ALTAR_MEMORY_HP_COST} 点血，内存上限 +${ALTAR_MEMORY_CAP_GAIN}`)
    playSfx("pick")
    return openRelicAfterOverlay(next)
  }

  if (cost === "blood") {
    if (!state.altarOffer) return state
    const toll = Math.max(1, Math.ceil(next.playerHp * ALTAR_BLOOD_RATIO))
    next.playerHp = Math.max(1, next.playerHp - toll)
    pushPop(next, "hurt", toll)
    pushLog(next, `血祭 · 献出 ${toll} 点血`)
  } else {
    next.cursedFloor = next.floor + 1
    pushLog(next, "诅咒缠上了下一层 · 敌人攻击 +30%")
  }
  playSfx("pick")

  const offer = next.altarOffer
  if (!offer) return next

  if (next.relics.length < relicSlotCap(next)) {
    const relics = [...next.relics, offer]
    next.relics = relics
    next.mods = buildMods(next.character, relics, next.floor, extrasOf(next))
    return openRelicAfterOverlay(next)
  }

  /* 词条槽满了：先让玩家挑一个丢掉，挑完才拿到新的 */
  next.altarPendingRelic = offer
  return next
}

function applyAltarSwap(state: RunState, slotId: string): RunState {
  if (state.phase !== "overlay" || state.overlayKind !== "altar") return state
  const incoming = state.altarPendingRelic
  if (!incoming) return state
  const relics = state.relics.map((relic) =>
    relic.id === slotId ? incoming : relic,
  )
  playSfx("pick")
  return openRelicAfterOverlay({
    ...state,
    relics,
    mods: buildMods(state.character, relics, state.floor, extrasOf(state)),
    altarPendingRelic: null,
  })
}

function finalize(state: RunState): RunState {
  retarget(state)
  if (state.phase !== "fighting") return state
  if (aliveEnemies(state).length > 0) return state

  /* 内核包 v1（kernel-tabs.md）：台前清完不算清层——额外标签页里还有活敌人就不结算，
     玩家必须「打空 / 关闭（50% 折算）/ 等崩」三选一处理掉 */
  if (
    (state.tabs ?? []).some((tab) =>
      tab.enemies.some((enemy) => !enemy.closing),
    )
  ) {
    if (!state.tabGateNagShown) {
      state.tabGateNagShown = true
      pushLog(state, "别的标签页还有活敌 · 切过去打空，或点 × 关掉（碎片对折）")
      pushTip(state, "别的标签页还有活敌 · 切过去打完或关掉才算清层")
      playSfx("hit")
    }
    return state
  }
  state.tabGateNagShown = false

  /* 裂隙内的额外战斗刚打完（fun-pack3.md 二）：发报酬、续上被裂隙打断的原流程。
     不走层末结算（回血 / 路线奖励在进裂隙前那一次已经发过） */
  if (state.hiddenActive) {
    const riftId = state.hiddenActive
    const resume = state.hiddenReturn
    state.hiddenActive = null
    playSfx("win")
    if (riftId === "ad-hell") {
      state.forceEpicChoice = true
      pushLog(state, "广告地狱清空 · 下一个三选一必出史诗")
    }
    if (riftId === "bond-trial") {
      creditShards(state, HIDDEN_BOND_TRIAL_SHARDS)
      pushLog(state, `羁绊试炼通过 · 碎片 +${HIDDEN_BOND_TRIAL_SHARDS}`)
    }
    if (riftId === "fate") {
      creditShards(state, HIDDEN_FATE_SHARDS)
      pushLog(state, `你打赢了上几局的自己 · 碎片 +${HIDDEN_FATE_SHARDS}`)
    }
    pushStory(state, "从裂隙里爬了出来，带着一身收获")
    if (resume === "shop") openShop(state, "relic")
    else openRelicPhase(state)
    return state
  }

  /* 幽灵对照：记下这层打完时的剩余血量百分比（最多 8 个，只影响显示） */
  if (state.path.length < DUNGEON_RUN_FLOORS.length) {
    const ratio = state.playerMaxHp > 0 ? state.playerHp / state.playerMaxHp : 0
    state.path.push(Math.max(0, Math.min(100, Math.round(ratio * 100))))
  }

  /* M1 本地存储（relic-redesign.md B·M1）：层结束结算时「不进即时回血」的 10 血写入存储池，
     下一层开始生效（enterFloor 处到账清零）。与既有层间回血通道互斥：
     FLOOR_CLEAR_HEAL + healPerFloor 照常当场回（M1 不碰它们），M1 的 10 是独立量、只走池。
     跨局池不保留 = storagePool 随 RunState 新建归 0。封顶 STORAGE_POOL_MAX */
  if (state.mods.storageHealPool > 0) {
    state.storagePool = Math.min(
      STORAGE_POOL_MAX,
      state.storagePool + state.mods.storageHealPool,
    )
    pushPop(state, "heal", state.mods.storageHealPool)
    pushLog(
      state,
      `本地存储 · ${state.mods.storageHealPool} 血存入存储池 → 下层开始时生效`,
    )
  }

  healPlayer(state, state.mods.healPerFloor + FLOOR_CLEAR_HEAL)

  /* M2 Session 的「层末 memory 清零」代价已随 v2 移除：
     进层回满（enterFloor）本就把囤积收益归零，这条惩罚变成纯负无意义，
     Session 词条保留「碎片 +30%」纯收益，经济流 combo 的抵消叙事一并作废 */

  /* 诅咒只压一层，这层打完就散 */
  state.cursedFloor = null

  /* 路线层末奖励（dungeon-route.md）：碎片当场到账，稀有度保底写进本层三选一 */
  const entry = state.activeEntry
  if (entry?.shardReward) {
    creditShards(state, entry.shardReward)
    pushLog(state, `路线奖励 · 「${ROUTE_TYPES[entry.routeId].name}」结算碎片 +${entry.shardReward}`)
  }
  if (entry?.relicFloor === "rare") state.forceRareChoice = true
  if (entry?.relicFloor === "epic") state.forceEpicChoice = true

  /* 本局故事：每层清空记一笔（通关那层单独在 victory 分支收尾） */
  if (state.floor < DUNGEON_RUN_FLOORS.length) {
    const hpPct =
      state.playerMaxHp > 0
        ? Math.round((state.playerHp / state.playerMaxHp) * 100)
        : 0
    pushStory(state, `清空了这里，血还剩 ${hpPct}%`)
  }

  if (state.floor >= DUNGEON_RUN_FLOORS.length) {
    /* 管理员降临（fun-pack4.md 二）：有资格就先过它这一关，胜利结算押后 */
    if (state.adminPending) {
      startAdminBattle(state)
      return state
    }
    if (state.adminActive) {
      state.adminActive = false
      state.adminWon = true
      creditShards(state, ADMIN_WIN_SHARDS)
      pushLog(state, `管理员倒台 · 碎片 +${ADMIN_WIN_SHARDS}`)
      pushBanner(state, "开发者模式已解锁")
      pushStory(state, "管理员消失了。屏幕角落亮起了一枚 DEV 徽标")
    }
    state.phase = "victory"
    state.bossDeadline = 0
    pushLog(state, "第 8 层清空 · 地牢打穿了")
    pushStory(state, "一路把第 8 层的崩溃页面关掉了，地牢打穿了")
    /* 元叙事尾句（fun-pack2.md 三）：随机留一句「不对劲」的恭喜 */
    pushStory(
      state,
      VICTORY_META_LINES[Math.floor(Math.random() * VICTORY_META_LINES.length)],
    )
    playSfx("win")
    return state
  }

  /* 隐藏裂隙（fun-pack3.md 二）：条件达成时清场后冒出一道 rift，先问去不去 */
  if (
    state.floor < DUNGEON_RUN_FLOORS.length &&
    !state.hiddenOfferedFloors.includes(state.floor)
  ) {
    const offer = hiddenOfferFor(state)
    if (offer) {
      state.hiddenOfferedFloors = [...state.hiddenOfferedFloors, state.floor]
      state.hiddenOffer = offer
      state.phase = "overlay"
      state.overlayKind = "hidden"
      pushLog(state, `墙上裂开一道缝：${HIDDEN_FLOOR_DEFS[offer].name}`)
      pushStory(state, "打完这层，墙上多了一道发光的裂隙")
      playSfx("pick")
      return state
    }
  }

  /* 第 5 层后固定一次商店（未知区域之外唯一的商店落点），关掉后再弹三选一 */
  if (state.shopFloors.includes(state.floor)) {
    openShop(state, "relic")
    return state
  }

  openRelicPhase(state)
  return state
}

/** 清场后这道裂隙给不给（fun-pack3.md 二）：4 层无伤 / 6 层 3 羁绊 / 7 层同种子第 3 局 */
function hiddenOfferFor(state: RunState): HiddenFloorId | null {
  if (state.floor === 4 && state.noDamageFloor) return "ad-hell"
  if (state.floor === 6 && getActiveBondDefs(state.relics).length >= 3) {
    return "bond-trial"
  }
  if (state.floor === 7 && state.seedStreak >= 3) return "fate"
  return null
}

/** 走进裂隙：换敌组开一场额外战斗，打完按 hiddenReturn 续原流程 */
function enterHiddenBattle(state: RunState): RunState {
  if (
    state.phase !== "overlay" ||
    state.overlayKind !== "hidden" ||
    !state.hiddenOffer
  ) {
    return state
  }
  const id = state.hiddenOffer
  const next: RunState = {
    ...state,
    enemies: [],
    pops: [...state.pops],
    shardDots: state.shardDots.map((dot) => ({ ...dot })),
  }
  next.hiddenOffer = null
  next.hiddenActive = id
  next.hiddenReturn = state.shopFloors.includes(state.floor) ? "shop" : "relic"
  next.overlayKind = "none"
  next.phase = "fighting"
  next.lockedUid = null
  const now = next.now
  const darkTheme = next.mods.darkTheme
  if (id === "ad-hell") {
    next.enemies = [0, 1, 2, 3].map((slot) =>
      makeEnemy({
        defId: "ad",
        hp: 70 + next.floor * 4,
        attack: 5,
        now,
        slot,
        startAt: now + 600 + slot * 700,
        telegraphMs: 600,
        darkTheme,
      }),
    )
    pushBanner(next, "广告地狱：全是广告，永远关不完")
  } else if (id === "bond-trial") {
    next.enemies = [
      { defId: "ad", hp: 85, attack: 6 },
      { defId: "captcha", hp: 95, attack: 7 },
      { defId: "leak", hp: 120, attack: 9 },
    ].map((spec, slot) =>
      makeEnemy({
        ...spec,
        elite: true,
        now,
        slot,
        startAt: now + 600 + slot * 800,
        telegraphMs: 600,
        darkTheme,
      }),
    )
    pushBanner(next, "羁绊试炼：三个精英，也是组团来的")
  } else {
    const shadowHp = Math.max(120, Math.round(next.playerMaxHp * 1.2))
    const shadow = makeEnemy({
      defId: "notfound",
      hp: shadowHp,
      attack: 6,
      elite: true,
      now,
      slot: 0,
      startAt: now + 800,
      telegraphMs: 600,
      darkTheme,
    })
    shadow.displayName = "上几局的你"
    next.enemies = [shadow]
    pushBanner(next, "宿命：对面站着一个熟悉的背影")
  }
  pushLog(next, `你走进了裂隙：${HIDDEN_FLOOR_DEFS[id].name}`)
  pushStory(next, `走进了「${HIDDEN_FLOOR_DEFS[id].name}」裂隙`)
  return next
}

/** 不搭理裂隙：直接续原流程 */
/** 影子来源记录（fun-pack4.md 一）：普通局取上一局；每日挑战按种子流从历史里挑一局 */
function shadowSourceFor(
  seed: string,
  history: DungeonRunRecord[],
): DungeonRunRecord | null {
  if (history.length === 0) return null
  if (seed !== getDailySeed()) return history[0]
  const rng = streamFor(seed, "shadow:pick")
  return history[
    Math.min(history.length - 1, Math.floor(float0911(rng) * history.length))
  ]
}

/** 管理员降临（fun-pack4.md 二）：胜利结算前插一场 999 血的隐藏 Boss 战 */
function startAdminBattle(state: RunState): RunState {
  state.adminPending = false
  state.adminActive = true
  state.adminTamperNextAt = state.now + ADMIN_TAMPER_EVERY_MS
  state.bossDeadline = 0
  state.lockedUid = null
  state.lockedButtonId = null
  const admin = makeEnemy({
    defId: "popup",
    hp: ADMIN_HP,
    attack: ADMIN_ATTACK,
    now: state.now,
    slot: 0,
    startAt: state.now + 2000,
    telegraphMs: 900,
  })
  admin.displayName = "管理员"
  admin.attackIntervalMs = ADMIN_ATTACK_INTERVAL_MS
  admin.admin = true
  admin.lineText = "你的对局太完美了。修正，或者被修正。"
  admin.lineUntil = state.now + 2800
  admin.lineKind = "taunt"
  state.enemies = [admin]
  pushBanner(state, "管理员已介入")
  pushLog(
    state,
    "屏幕暗了 · 管理员降临（血 999 · 挨到必死 · 靠护盾和无敌打）",
  )
  pushStory(state, "屏幕暗了下去。管理员亲自下场了")
  playSfx("comboBreak")
  return state
}

function rejectHiddenRift(state: RunState): RunState {
  if (state.phase !== "overlay" || state.overlayKind !== "hidden") return state
  const next: RunState = { ...state, pops: [...state.pops] }
  next.hiddenOffer = null
  next.overlayKind = "none"
  if (next.shopFloors.includes(next.floor)) openShop(next, "relic")
  else openRelicPhase(next)
  return next
}

/** 路线战斗层的合成配置：标签动态化，战斗参数走普通层档（dungeon-route.md 一） */
function routeFloorConfig(floor: number, routeId: RouteId, comp: FloorEnemySpec[]): FloorConfig {
  const t = ROUTE_TYPES[routeId]
  return {
    floor,
    label: `第 ${floor} 层 · ${t.name}`,
    shortLabel: t.name,
    note: `${t.enemyText} · ${t.rewardText}`,
    isBoss: false,
    bossKind: "none",
    enemies: comp,
    timeLimitMs: FLOOR_TIME_LIMIT_MS,
    timeoutPenalty: 0,
    timeoutFails: false,
    timeoutAttackMult: OVERTIME_ATTACK_MULT,
    telegraphMs: 600,
    staggerMs: 0,
    /* 隐身标签：本层随机隐身复用第 5 层 404 的隐身通道（seed-system.md 四） */
    hiddenEveryMs: comp.some((spec) => spec.tags?.includes("stealth"))
      ? HIDDEN_INTERVAL_MS
      : 0,
  }
}

function enterFloor(state: RunState, floor: number, entry?: RouteEntry): RunState {
  /* 契约·末层固定 Boss：第 8 层不走路线——第 7 层池的战斗路线到 Boss 层时
     敌人配置回落固定档（路线足迹 / 到账奖励 / 层内机制照常保留） */
  const route = entry && floor < DUNGEON_RUN_FLOORS.length ? entry : undefined
  /* 广告轰炸诅咒：战斗层敌人 +1（最低档弹窗） */
  let routeComp = route?.enemyComp ?? []
  if (route && state.curses.includes("curse-ad-bomb") && routeComp.length > 0) {
    routeComp = [...routeComp, { defId: "popup", hp: 60, attack: 3 }]
  }
  const config = route
    ? routeFloorConfig(floor, route.routeId, routeComp)
    : getFloorConfig(floor)
  const now = state.now
  const mods = state.mods
  /* 祭坛的诅咒只压这一层：本层敌人攻击 +30% */
  const cursed = state.cursedFloor === floor
  const enemies = createEnemies(
    config,
    now,
    cursed ? CURSE_ATTACK_MULT : 1,
    state.mods.darkTheme,
  )
  const first = enemies[0]

  /* ---- 第四批（fun-pack4.md 一）：玩家影子——低概率进层时「另一个你」来串门 ---- */
  let shadowAdded = false
  if (
    floor >= 3 &&
    !config.isBoss &&
    !state.shadowDoneThisRun &&
    state.shadowSource
  ) {
    const shadowRng = streamFor(state.seed, `shadow:${floor}`)
    const isDailyFloor = state.seed === getDailySeed()
    const shadowChance = isDailyFloor ? SHADOW_CHANCE_DAILY : SHADOW_CHANCE_NORMAL
    if (float0911(shadowRng) < shadowChance) {
      const src = state.shadowSource
      const srcRelicIds = src.relicIds ?? []
      const shadow = makeEnemy({
        defId: pick(shadowRng, SHADOW_DEFS),
        hp:
          SHADOW_HP_BASE +
          floor * SHADOW_HP_PER_FLOOR +
          srcRelicIds.length * SHADOW_HP_PER_RELIC,
        attack: SHADOW_ATK_BASE + floor,
        now,
        slot: enemies.length,
        startAt: now + 1200,
        telegraphMs: 700,
        elite: true,
        darkTheme: state.mods.darkTheme,
      })
      shadow.displayName = isDailyFloor
        ? `当日挑战者 · ${src.characterName}`
        : "上局自己的影子"
      shadow.shadow = true
      shadow.shadowBounty = Math.max(
        SHADOW_MIN_BOUNTY,
        Math.round((src.reward ?? 30) * 0.1),
      )
      const srcSchool = RELIC_POOL.find(
        (item) => item.id === srcRelicIds[0],
      )?.school
      const style = SHADOW_STYLE_BY_SCHOOL[srcSchool ?? "general"] ?? "burst"
      shadow.shadowStyle = style
      if (style === "haste") shadow.intervalMult = SHADOW_HASTE_INTERVAL_MULT
      if (style === "burst") shadow.shadowEchoNextAt = now + SHADOW_BURST_EVERY_MS
      if (style === "regen") {
        shadow.regenEveryMs = SHADOW_REGEN_EVERY_MS
        shadow.regenAmount = SHADOW_REGEN_AMOUNT
        shadow.regenNextAt = now + SHADOW_REGEN_EVERY_MS
      }
      shadow.lineText = isDailyFloor
        ? "你的走位，我逐帧看过。"
        : "你上一局的 Build，我原样搬来了。"
      shadow.lineUntil = now + 2400
      shadow.lineKind = "taunt"
      enemies.push(shadow)
      shadowAdded = true
    }
  }

  /* Service Worker：每 3 层补 1 次免死 */
  let wardsGranted = state.wardsGranted
  let deathWards = state.deathWards
  if (mods.deathWardPerFloors > 0) {
    const target = Math.floor(floor / 3)
    while (wardsGranted < target) {
      wardsGranted += 1
      deathWards += 1
    }
  }

  /* 局内成长：每清一层 生命 +5（上限跟着涨，多出来的那截直接补成血） */
  const grownMaxHp = mods.maxHp
  const grownHp = Math.min(
    grownMaxHp,
    state.playerHp + Math.max(0, grownMaxHp - state.playerMaxHp),
  )

  const next: RunState = {
    ...state,
    floor,
    phase: "fighting",
    enemies,
    playerHp: grownHp,
    playerMaxHp: grownMaxHp,
    lockedUid: first?.uid ?? null,
    lockedButtonId: first?.buttons[0]?.id ?? null,
    combo: 0,
    hitStreak: 0,
    critNext: false,
    shield: Math.min(mods.shieldMax, mods.startShield),
    nextAutoAt: now + mods.attackIntervalMs,
    memoryHist: [],
    memoryHistNextAt: 0,
    /* 内核包 v1：换层时额外页必为空（清层门槛保证正常路径已空，这里是防御性重置） */
    tabs: [],
    activeTabId: 0,
    mainBackup: null,
    tabSwitchLockUntil: 0,
    nextTabPageId: 1,
    tabGateNagShown: false,
    /* 核心体验包 v1：双面同步击杀的死亡时刻随层清空 */
    twinDeaths: [],
    lastAttackAt: 0,
    activeReadyAt: now,
    dodgeReadyAt: now,
    dodgeUntil: 0,
    immuneReadyAt: now + mods.immuneEveryMs,
    hurtHasteUntil: 0,
    manualImmuneUntil: 0,
    /* 批次 B 机制窗口：全部按层重置（节流层每层重新积，闭包残像 / 小护盾不带入下一层） */
    closureEcho: null,
    debounceUntil: 0,
    blockUntil: 0,
    decoyUntil: 0,
    transitionUntil: 0,
    throttleLayers: 0,
    throttleNextAt: now + THROTTLE_STACK_MS,
    refactorUsedThisFloor: false,
    miniShields: [],
    /* 批次 C 机制状态：N2 连击计数与 N6 金色重试每层重置；
       N5 断点续传 / G2 热刷新 / M1 存储池是局级（走 ...state 带入，不在这里清） */
    cacheHitUid: null,
    cacheHits: 0,
    timeoutRetryUsedThisFloor: false,
    qte: null,
    bossStunUntil: 0,
    qteAttackCutUntil: 0,
    qteAttackCutRatio: 0,
    hurtDodgeUntil: 0,
    dodgeHasteUntil: 0,
    activeHasteUntil: 0,
    doubleStrikeUntil: 0,
    listenStacks: 0,
    syncStacks: 0,
    multithreadUntil: 0,
    freezeUntil: 0,
    attackLockedUntil: 0,
    /* 内存（v2）：进层回满到新上限（回满不是累加，避免囤积）；卡顿计时器逐层清零。
       深化包·碎片：实际回到的水位 = 上限 − 碎片（上限本身不动，结算/显示不受干扰） */
    maxMemory: mods.memoryMax,
    memory: Math.max(3, Math.min(mods.memoryMax, mods.memoryMax - (state.memFrags ?? 0))),
    /* 核心体验包 v2·缓存电池：与进层回满同处重置——缓存是本层工具，换层不带走 */
    cacheSlots: [],
    cacheDepositLeft: CACHE_DEPOSIT_PER_FLOOR,
    memStallSince: 0,
    memStallDrainNextAt: 0,
    /* 深化包·超频：每层一次，换层清零重置（碎片与碎片钟是局级，随 ...state 带入） */
    ocUntil: 0,
    ocPenaltyUntil: 0,
    ocUsedFloor: 0,
    firstHitImmuneUsed: false,
    nextHitBonus: 0,
    wardsGranted,
    deathWards,
    defeatedIds: [],
    pops: [],
    shardDots: [],
    dragCloseUsed: false,
    banner: null,
    choices: [],
    pendingRelic: null,
    relicPickIndex: 0,
    rerollsLeft: 0,
    floorPaidRerollUsed: false,
    bossDeadline: config.timeLimitMs > 0 ? now + config.timeLimitMs : 0,
    bossLimitMs: config.timeLimitMs,
    bossTimeoutPenalty: config.timeoutPenalty,
    bossTimeoutFails: config.timeoutFails,
    hiddenEveryMs: config.hiddenEveryMs,
    hiddenNextAt: config.hiddenEveryMs > 0 ? now + config.hiddenEveryMs : 0,
    paused: true,
    readyFloor: true,
    pauseStartedAt: Date.now(),
    overtime: false,
    /* 验证码挑战环：跟着验证码迷宫路线走（原第 6 层硬编码废除） */
    challengeEveryMs:
      entry?.routeId === "captcha-maze" ? CAPTCHA_CHALLENGE_INTERVAL_MS : 0,
    challengeNextAt:
      entry?.routeId === "captcha-maze" ? now + CAPTCHA_CHALLENGE_INTERVAL_MS : 0,
    challenge: null,
    bossClick: null,
    bossSpeedCutUntil: 0,
    bossFlashUntil: 0,
    bossLine: null,
    bossLineSeq: state.bossLineSeq,
    forceRareChoice: false,
    forceEpicChoice: false,
    /* 路线系统：进层结算来路与层内状态 */
    activeRouteId: entry?.routeId ?? null,
    activeEntry: entry ?? null,
    shieldBlessedUids: [],
    /* 蓝屏诅咒：本层卡顿周期起点（无诅咒时不跑） */
    bluescreenNextAt: state.curses.includes("curse-bluescreen") ? now + 10000 : 0,
    /* 镜像空间：清空后欠一次复制面板 */
    mirrorPending: entry?.routeId === "mirror-space" && state.relics.length > 0,
    lastActionAt: now,
    nextIdleHealAt: now + IDLE_HEAL_AFTER_MS,
    log: [
      cursed
        ? `${config.label} 开始 · 诅咒生效，敌人攻击 +30%`
        : `${config.label} 开始 · ${config.note}`,
    ],
  }

  /* 影子进层记账（fun-pack4.md 一：一局至多一个） */
  if (shadowAdded) {
    next.shadowDoneThisRun = true
    const shadowEnemy = next.enemies.find((enemy) => enemy.shadow)
    if (shadowEnemy) {
      pushLog(next, `${shadowEnemy.displayName} 从墙上的影子里走了出来`)
      pushStory(next, "这层遇到了另一个我")
    }
  }

  /* Boss 出场台词（只有 Boss 层有） */
  const bossEnemy = next.enemies.find(
    (enemy) => enemy.kind === "boss" || enemy.kind === "bigboss",
  )
  if (bossEnemy) {
    setBossLine(next, bossEnemy, findBossLine(bossEnemy.defId, "enter"))
  }

  /* 上一层没来得及点的碎片点：换层时全额入账，别白白丢掉 */
  const leftover = state.shardDots.reduce((sum, dot) => sum + dot.amount, 0)
  if (leftover > 0) {
    creditShards(next, leftover)
  }

  /* M1 本地存储池进层生效（relic-redesign.md B·M1）：层末攒下的血此刻到账、池清零 */
  if (next.storagePool > 0) {
    const pooled = next.storagePool
    healPlayer(next, pooled)
    next.storagePool = 0
    pushLog(next, `存储池 · 本地存储的 ${pooled} 点生命到账`)
  }

  /* 弹窗 ×：第 1、2 层的弹窗在「开始出手」那一刻亮 ×，存在 1.5 秒 */
  if (POPUP_X_FLOORS.includes(floor)) {
    next.enemies.forEach((enemy) => {
      if (enemy.defId === "popup") {
        enemy.popupXUntil = enemy.nextAttackAt + POPUP_X_WINDOW_MS
      }
    })
  }

  /* C7 暗黑模式：入场即生效，每层进层提示一次视野受限（低频切换音走 sfx 合成） */
  if (next.mods.darkTheme) {
    pushBanner(next, "暗黑模式：只能看清当前目标")
    playSfx("darkToggle")
  }

  /* ---- 路线系统：进层后处理（dungeon-route.md 三/四） ---- */

  /* 病毒诅咒：开层扣 10 血（留 1 血下限） */
  if (next.curses.includes("curse-virus") && next.playerHp > 1) {
    next.playerHp = Math.max(1, next.playerHp - 10)
    pushPop(next, "hurt", 10)
    pushLog(next, "病毒 · 开层被啃了 10 点血")
  }

  /* 内存泄漏诅咒：进层回满后再扣 2；深化包：漏的不只是内存，还有碎片 */
  if (next.curses.includes("curse-mem-leak")) {
    next.memory = Math.max(0, next.memory - 2)
    addMemFrag(next, 1)
    pushLog(next, "内存泄漏 · 开层漏掉 2 格内存，又崩出一块碎片")
  }

  /* 深化包·崩溃边缘：异常啃内存，进层即 +2 碎片 */
  if (entry?.routeId === "crash-edge") {
    addMemFrag(next, 2)
    pushLog(next, "崩溃边缘 · 异常碎片扎进了内存（+2 碎片）")
  }

  /* 深化包·病毒教学：本层有携带者时弹一次 */
  if (
    !next.coachVirusDone &&
    next.enemies.some((enemy) => enemy.tags.includes("virus"))
  ) {
    next.coachVirusDone = true
    pushTip(
      next,
      "点敌人卡上的🦠病毒标签，花 2 内存引爆——传染会让邻居的标签反噬它自己",
    )
  }

  /* 缓存深渊：层内内存补给（进层已回满，这条当层到账） */
  if (entry?.memoryReward) {
    gainMemory(next, entry.memoryReward)
    pushLog(next, `路线补给 · 缓存深渊回内存 +${entry.memoryReward}`)
  }

  /* 防火墙：护盾每 3 秒按时补满（复用第 3 层广告补盾通道） */
  if (entry?.routeId === "firewall") {
    next.enemies.forEach((enemy) => {
      enemy.shieldRegenEveryMs = FIREWALL_SHIELD_REGEN_MS
      enemy.shieldRegenAmount = FIREWALL_SHIELD_REGEN_AMOUNT
      enemy.shieldRegenNextAt = now + FIREWALL_SHIELD_REGEN_MS
    })
  }

  /* 时间裂隙：每个敌人 15 秒倒计时，到点未死反噬玩家（tick 内结算） */
  if (entry?.routeId === "time-rift") {
    next.enemies.forEach((enemy) => {
      enemy.riftDeadline = now + TIME_RIFT_MS
    })
    pushLog(next, "时间裂隙 · 每个敌人身上挂了 15 秒倒计时，别让它们拖到点")
  }

  /* 双面回廊（core-experience-pack.md 一）：进层免费开一张后台标签页藏背面广告
     ——只有这条路免 4 内存花费与页满门槛，其余内核标签页规则一律不变 */
  if (entry?.routeId === "twin-pages") {
    const backList = next.enemies.filter((enemy) => enemy.twin === "back")
    if (backList.length > 0) {
      const parked = parkTabEnemies(next, backList)
      const tabId = next.nextTabPageId ?? 1
      next.nextTabPageId = tabId + 1
      next.tabs = [
        ...(next.tabs ?? []),
        {
          id: tabId,
          enemies: parked,
          lockedUid: parked[0]?.uid ?? null,
          frozen: false,
          crashed: false,
          drainNextAt: now + TAB_MAINTAIN_MS,
          crashNextAt: now + TAB_CRASH_EVERY_MS,
        },
      ]
      next.enemies = next.enemies.filter((enemy) => enemy.twin !== "back")
      retarget(next)
      pushBanner(next, "背面广告躲进了后台标签页")
      pushLog(next, "双面回廊 · 背面广告躲在后台标签页读条，切过去打它可以打断")
    }
  }

  /* 镜像空间：敌人抄你的套路出手——每个词条全体敌人攻速 +8%（封顶 3 条） */
  if (entry?.routeId === "mirror-space" && next.relics.length > 0) {
    const mirrored = Math.min(next.relics.length, 3)
    const haste = 1 + MIRROR_HASTE_PER_RELIC * mirrored
    next.enemies.forEach((enemy) => {
      enemy.intervalMult *= haste
    })
    pushLog(next, `镜像空间 · 敌人学了你 ${mirrored} 张卡的打法，出手更快了`)
  }

  /* 种子标签的机制映射（seed-system.md 四）：加速 ×0.85、护盾刷新按周期补盾。
     狂暴 / 图案 / 回血 / 护盾底数已在生成时 baked 进数值，这里只补运行时的两条 */
  if (routeComp.length > 0) {
    next.enemies.forEach((enemy) => {
      const tags = routeComp[enemy.slot]?.tags
      if (!tags || enemy.kind === "boss") return
      if (tags.includes("accel")) enemy.intervalMult *= TAG_ACCEL_MULT
      if (tags.includes("shield-regen") && enemy.shieldRegenEveryMs <= 0) {
        enemy.shieldRegenEveryMs = TAG_SHIELD_REGEN_MS
        enemy.shieldRegenAmount = TAG_SHIELD_REGEN_AMOUNT
        enemy.shieldRegenNextAt = now + TAG_SHIELD_REGEN_MS
      }
    })
  }

  /* ---- 趣味包 v1（fun-pack.md）：进层接线 ---- */

  /* 危机故障后遗症（蓝屏等待→反色 / 污染留着→乱码）：开场即发作 */
  if (next.crisisGlitchNext) {
    const crisisGlitch = next.crisisGlitchNext
    next.crisisGlitchNext = null
    fireGlitch(next, crisisGlitch)
  }

  /* 崩溃弹窗「无视它」：这场战斗 +1 弹窗，并给假按钮定基线 */
  if (next.crisisExtraPopup) {
    next.crisisExtraPopup = false
    if (!config.isBoss) {
      next.enemies = [
        ...next.enemies,
        makeEnemy({
          defId: "popup",
          hp: 60,
          attack: 3,
          now,
          slot: next.enemies.length,
          startAt: now + 600,
          telegraphMs: 600,
          darkTheme: mods.darkTheme,
        }),
      ]
      pushLog(next, "崩溃弹窗叫来的兄弟：又挤进来一个弹窗")
    } else {
      pushLog(next, "弹窗想跟进来，但 Boss 层不接待")
    }
    if (!next.lowSpec) next.fakeButtonArmedAt = now + 5000
  }

  /* 404「追进去」：这场战斗 +1 精英 404 */
  if (next.crisisEliteNext) {
    next.crisisEliteNext = false
    if (!config.isBoss) {
      next.enemies = [
        ...next.enemies,
        makeEnemy({
          defId: "notfound",
          hp: 50,
          attack: 5,
          elite: true,
          now,
          slot: next.enemies.length,
          startAt: now + 800,
          telegraphMs: 600,
          darkTheme: mods.darkTheme,
        }),
      ]
      pushLog(next, "死胡同的尽头：一只镇场子的精英 404")
    } else {
      pushLog(next, "追 404 追到了 Boss 层，精英没跟来")
    }
  }

  /* 内存溢出「立即清空」：进层回满后再砍半 */
  if (next.crisisMemoryHalf) {
    next.crisisMemoryHalf = false
    next.memory = Math.max(1, Math.ceil(next.memory / 2))
    pushLog(next, "内存清空的代价：这层进场时只剩一半")
  }

  /* 内存溢出「转嫁」：普通敌人开局带 20 护盾 */
  if (next.crisisEnemyShield) {
    next.crisisEnemyShield = false
    next.enemies.forEach((enemy) => {
      if (enemy.kind === "normal") enemy.shield += CRISIS_ENEMY_SHIELD
    })
    pushLog(next, "内存的账转嫁给了敌人：它们开局带着 20 护盾")
  }

  /* 缓存污染「留着」：开层啃一口血 */
  if (next.crisisTaxFloors > 0) {
    next.crisisTaxFloors -= 1
    if (next.playerHp > 1) {
      next.playerHp = Math.max(1, next.playerHp - CRISIS_TAX_HP)
      pushPop(next, "hurt", CRISIS_TAX_HP)
      pushLog(next, `缓存污染在啃血 · 开层 -${CRISIS_TAX_HP}`)
    }
  }

  /* 缓存污染「隔离」：封条到期与数值回算（隔离生效判定见 extrasOf） */
  if (next.quarantineFloorsLeft > 0) {
    next.quarantineFloorsLeft -= 1
    if (next.quarantineFloorsLeft === 0) {
      next.quarantinedRelicId = null
      pushLog(next, "隔离期满 · 被封条解封回来")
    }
    next.mods = buildMods(next.character, next.relics, floor, extrasOf(next))
    next.playerMaxHp = next.mods.maxHp
    next.playerHp = Math.min(next.playerHp, next.playerMaxHp)
  }

  /* 404 假奖励点每层重新给一次机会；上一场的故障与武装不跨场 */
  next.fakeShardUsedFloor = false
  /* 本层无伤判定重新起算（广告地狱裂隙条件，fun-pack3.md 二） */
  next.noDamageFloor = true
  next.glitchKind = null
  next.glitchUntil = 0
  next.glitchArmedKind = null
  next.glitchArmedAt = 0
  /* 糊屏弹窗不跨层（新层重新进场重新吐） */
  next.screenJam = null
  /* 清缓存每层重新给一次（ui-arsenal-pack.md 二） */
  next.floorCacheCleared = false
  /* 技能按钮被抢不跨层（没找回就随这场战斗一起结束了） */
  next.skillSnatched = false

  /* 敌人适应检查（fun-pack2.md 二）：第 3 层起的普通战斗进层时看打法统计，
     同一打法用多了敌人就学会应对（一局永久，banner + 故事各记一笔） */
  if (floor >= 3 && !config.isBoss) {
    const adaptHits: string[] = []
    if (!next.adaptBounce && next.learnBounceHits >= ADAPT_BOUNCE_AT) {
      next.adaptBounce = true
      adaptHits.push("弹射衰减")
    }
    if (!next.adaptCrit && next.learnCritHits >= ADAPT_CRIT_AT) {
      next.adaptCrit = true
      adaptHits.push("暴击护甲")
    }
    if (!next.adaptSkill && next.learnSkillUses >= ADAPT_SKILL_AT) {
      next.adaptSkill = true
      adaptHits.push("技能抗性")
    }
    if (adaptHits.length > 0) {
      pushBanner(next, `敌人适应了：${adaptHits.join(" · ")}`)
      pushLog(next, `敌人开始针对你的打法：${adaptHits.join("、")}（本局持续生效）`)
      pushStory(next, `敌人适应了你的打法：${adaptHits.join("、")}`)
    }
  }

  /* 第 2~7 层普通战斗：种子流 30% 概率在开战后 4~9 秒武装一次小故障 */
  if (floor >= 2 && floor <= 7 && !config.isBoss) {
    const glitchRng = streamFor(state.seed, `glitch:${floor}`)
    if (float0911(glitchRng) < 0.3) {
      armGlitch(
        next,
        pick(glitchRng, GLITCH_MINOR_KINDS),
        now + rollInt(glitchRng, 4000, 9000),
      )
    }
  }

  /* 崩溃 Boss 层：假按钮周期基线（真正冒头要等阶段 2，判定在 advance） */
  if (bossEnemy?.defId === "boss-crash" && !next.lowSpec) {
    next.fakeButtonArmedAt = now + FAKE_BUTTON_INTERVAL_MS
  }

  /* 普通敌人开场台词（嘲讽气泡）；Boss 走它自己的台词通道 */
  next.enemies.forEach((enemy) => {
    if (enemy.kind !== "normal") return
    const spawnLine = pickEnemyLine(enemy.defId, "spawn", enemy.uid)
    if (spawnLine) {
      enemy.lineText = spawnLine
      enemy.lineKind = "taunt"
      enemy.lineUntil = now + ENEMY_LINE_MS
    }
  })
  if (bossEnemy) {
    pushStory(next, `「${bossEnemy.displayName}」拦在路中间`)
  }

  /* Boss 阶段技能序列按本局种子烘焙（seed-system.md 八） */
  bakeBossSkills(next)

  return next
}

/* 防火墙补盾 / 镜像抄套路 / 时间裂隙 / 蓝屏（dungeon-route.md 三/四） */
const FIREWALL_SHIELD_REGEN_MS = 3000
const FIREWALL_SHIELD_REGEN_AMOUNT = 20

/* 敌人标签机制档（seed-system.md 四）：加速出手间隔 / 护盾刷新节奏 */
const TAG_ACCEL_MULT = 0.85
const TAG_SHIELD_REGEN_MS = 5000
const TAG_SHIELD_REGEN_AMOUNT = 10
const MIRROR_HASTE_PER_RELIC = 0.08
const CACHE_SHIELD_BLESS_MEMORY = 2
const DATA_MINE_STEAL_SHARDS = 5
const TIME_RIFT_MS = 15000
const TIME_RIFT_PENALTY_HP = 30
const BLUESCREEN_PERIOD_MS = 10000
const BLUESCREEN_LOCK_MS = 1000
const MIRROR_CAP_PENALTY = 2

/** 宿命裂隙条件（fun-pack3.md 二）：从最近战绩往回数，连续多少局用了这个种子（含本局） */
function seedStreakOf(seed: string, history: { seed: string }[]): number {
  let streak = 0
  for (const row of history) {
    if (row.seed === seed) streak += 1
    else break
  }
  return streak + 1
}

function createInitialRun(
  character: DungeonCharacter,
  seed: string,
  now: number,
  coachOn: boolean,
  playMode: PlayMode,
  lowSpec: boolean,
  daily?: { curses: CurseId[]; pools: DailyPools },
  seedStreak = 1,
  shadowSource: DungeonRunRecord | null = null,
  adminPending = false,
  /** 构筑码导入（build-code.md 二）：开局直接进词条栏的前 3 条 */
  importedRelicIds: string[] = [],
): RunState {
  const importedRelics = importedRelicIds
    .map((id) => findRelic(id))
    .filter((relic): relic is Relic => relic !== null)
    .slice(0, BUILD_IMPORT_MAX)
  const mods = buildMods(character, importedRelics, 1)
  /* 商店 / 祭坛的落点进局时一次排定 */
  const overlayPlan = planOverlays()
  const base: RunState = {
    character,
    seed,
    floor: 1,
    phase: "fighting",
    startedAt: now,
    now,
    playerHp: mods.maxHp,
    playerMaxHp: mods.maxHp,
    shield: mods.startShield,
    combo: 0,
    hitStreak: 0,
    critNext: false,
    clickCombo: 0,
    clickComboExpireAt: 0,
    clickTapWindowStart: 0,
    clickTapCount: 0,
    lastLockAt: 0,
    /* 深化包初始值：碎片 0 起步，碎片钟从本局战斗开始计（进层不重置） */
    memFrags: 0,
    maxFrags: 0,
    memFragNextAt: now + MEM_FRAG_INTERVAL_MS,
    memDefragCount: 0,
    ocUntil: 0,
    ocPenaltyUntil: 0,
    ocUsedFloor: 0,
    ocCount: 0,
    lastDetonateAt: 0,
    coachOcDone: false,
    coachVirusDone: false,
    perfectFlashUntil: 0,
    dodgeDir: 0,
    coachClickTargetDone: false,
    enemies: [],
    lockedUid: null,
    lockedButtonId: null,
    nextAutoAt: now + mods.attackIntervalMs,
    memoryHist: [],
    memoryHistNextAt: 0,
    /* HUD 构筑包：新局重置为全 default（跨层保留靠 RunState 本体存活，不进存档） */
    dock: { ...HUD_DEFAULT_DOCK },
    /* 内核包 v1：多标签页字段初始化（全部可选字段，旧存档零迁移） */
    tabs: [],
    activeTabId: 0,
    mainBackup: null,
    tabSwitchLockUntil: 0,
    nextTabPageId: 1,
    tabGateNagShown: false,
    lastAttackAt: 0,
    activeReadyAt: now,
    dodgeReadyAt: now,
    dodgeUntil: 0,
    immuneReadyAt: now,
    hurtHasteUntil: 0,
    hurtDodgeUntil: 0,
    dodgeHasteUntil: 0,
    activeHasteUntil: 0,
    doubleStrikeUntil: 0,
    listenStacks: 0,
    syncStacks: 0,
    multithreadUntil: 0,
    freezeUntil: 0,
    firstHitImmuneUsed: false,
    nextHitBonus: 0,
    deathWards: 0,
    wardsGranted: 0,
    reviveFullUsed: false,
    reviveCount: 0,
    freePickQueue: 0,
    rerollsLeft: 0,
    lastActionAt: now,
    nextIdleHealAt: now + IDLE_HEAL_AFTER_MS,
    hiddenEveryMs: 0,
    hiddenNextAt: 0,
    paused: true,
    readyFloor: true,
    pauseStartedAt: Date.now(),
    overtime: false,
    challengeEveryMs: 0,
    challengeNextAt: 0,
    challenge: null,
    bossClick: null,
    bossSpeedCutUntil: 0,
    bossFlashUntil: 0,
    bossLine: null,
    bossLineSeq: 0,
    forceRareChoice: false,
    relics: importedRelics,
    choices: [],
    pendingRelic: null,
    relicPickIndex: 0,
    pops: [],
    log: [],
    /* 开场教学：进第 1 层就先讲清「自动攻击 + 两个键」，seq=1 供 View 触发首次淡入 */
    coachOn,
    coachTip: coachOn
      ? { text: "自动攻击一直开着 · 空格放主动技，Shift 闪避", seq: 1 }
      : null,
    coachHitDone: false,
    coachSkillDone: false,
    coachDangerDone: false,
    coachHiddenDone: false,
    activeWasCooling: false,
    cause: "",
    kills: 0,
    damageDealt: 0,
    defeatedIds: [],
    path: [],
    shards: 0,
    shardPulseAt: 0,
    shardDots: [],
    shardSeq: 0,
    dragCloseUsed: false,
    banner: null,
    coachPopupXDone: false,
    manualImmuneUntil: 0,
    offlineReadyAt: 0,
    attackLockedUntil: 0,
    memory: mods.memoryMax,
    maxMemory: mods.memoryMax,
    /* 核心体验包 v2·缓存电池：进局初值（enterFloor(…, 1) 会再按层重置一遍） */
    cacheSlots: [],
    cacheDepositLeft: CACHE_DEPOSIT_PER_FLOOR,
    memStallSince: 0,
    memStallDrainNextAt: 0,
    memoryGained: 0,
    memorySpent: 0,
    memoryOutages: 0,
    memOutageActive: false,
    memoryCrashes: 0,
    coachMemoryShortDone: false,
    coachRelicTriggerDone: false,
    coachRouteDone: false,
    coachCurseDone: false,
    /* 批次 B 机制状态：进局初值（enterFloor(…, 1) 会再按层重置一遍） */
    closureEcho: null,
    debounceUntil: 0,
    blockUntil: 0,
    decoyUntil: 0,
    transitionUntil: 0,
    throttleLayers: 0,
    throttleNextAt: now + THROTTLE_STACK_MS,
    refactorUsedThisFloor: false,
    miniShields: [],
    /* 批次 C 机制状态：进局初值（N2/N6 由 enterFloor(…, 1) 再按层重置一遍） */
    cacheHitUid: null,
    cacheHits: 0,
    resumeUsedThisRun: false,
    timeoutRetryUsedThisFloor: false,
    hotReloadUsedThisRun: false,
    storagePool: 0,
    coachResumeDone: false,
    coachWardDone: false,
    lowSpec,
    qte: null,
    qteSeq: 0,
    coachQteDone: false,
    bossStunUntil: 0,
    qteAttackCutUntil: 0,
    qteAttackCutRatio: 0,
    playMode,
    tookDamage: false,
    floorPaidRerollUsed: false,
    paidReviveUsed: false,
    deadAt: 0,
    shopFloors: overlayPlan.shopFloors,
    shopSeq: 0,
    overlayKind: "none",
    shopStock: [],
    altarOffer: null,
    altarCost: null,
    altarPendingRelic: null,
    altarType: "relic",
    cursedFloor: null,
    routeChoices: [],
    activeRouteId: null,
    activeEntry: null,
    routeLog: [],
    /* 每日挑战：开局就带上今日诅咒（六诅咒机制沿用，L1 起生效） */
    curses: daily ? daily.curses : [],
    dailyPools: daily ? daily.pools : undefined,
    bonusSlots: 0,
    bonusMemoryCap: 0,
    mirrorCapPenalty: 0,
    bonusReroll: 0,
    forceEpicChoice: false,
    pendingRemoveMode: null,
    shieldBlessedUids: [],
    bluescreenNextAt: 0,
    mirrorPending: false,
    overlayReturn: "relic",
    bossDeadline: 0,
    bossLimitMs: 0,
    bossTimeoutPenalty: 0,
    bossTimeoutFails: false,
    /* 趣味包 v1 初值（fun-pack.md） */
    story: [],
    storyLowHpShown: false,
    storyGlitchShown: false,
    glitchKind: null,
    glitchUntil: 0,
    glitchArmedAt: 0,
    glitchArmedKind: null,
    glitchCount: 0,
    screenJam: null,
    fakeButton: null,
    fakeButtonSeq: 0,
    fakeButtonArmedAt: 0,
    fakeShardUsedFloor: false,
    crisisEvent: null,
    crisisExtraPopup: false,
    crisisEnemyShield: false,
    crisisMemoryHalf: false,
    crisisEliteNext: false,
    crisisTaxFloors: 0,
    crisisRerollRoute: false,
    crisisGlitchNext: null,
    quarantinedRelicId: null,
    quarantineFloorsLeft: 0,
    /* 趣味包 v2 初值（fun-pack2.md） */
    blindCombat: false,
    skillSnatched: false,
    snatchXPct: 50,
    snatchYPct: 40,
    learnBounceHits: 0,
    learnCritHits: 0,
    learnSkillUses: 0,
    adaptBounce: false,
    adaptCrit: false,
    adaptSkill: false,
    idleNagShownFloors: [],
    /* 第三批初值（fun-pack3.md） */
    hiddenOffer: null,
    hiddenActive: null,
    hiddenReturn: "relic",
    noDamageFloor: true,
    hiddenOfferedFloors: [],
    offlineBreachEndAt: 0,
    seedStreak,
    /* 第四批初值（fun-pack4.md） */
    shadowDoneThisRun: false,
    shadowSource,
    adminPending,
    adminActive: false,
    adminWon: false,
    adminLockId: null,
    adminLockUntil: 0,
    adminTamperNextAt: 0,
    deathsThisRun: 0,
    mods,
  }
  pushStory(base, `你带着${character.displayName}推门进了地牢`)
  const started = enterFloor(base, 1)
  /* 种子彩蛋（fun-pack2.md 三）：DEAD-0000 开局一句 meta 话 + 一次反色
     （武装要放在 enterFloor 之后——enterFloor 会清掉上一场的故障武装） */
  if (seed.toUpperCase() === "DEAD-0000") {
    pushStory(started, "你找到了。但你不该来。")
    armGlitch(started, "invert", started.now + 1200)
  }
  /* 管理员（fun-pack4.md 二）：连续 10 局无死通关，或开发者彩蛋种子 */
  if (adminPending) {
    pushStory(
      started,
      seed.toUpperCase() === "ROOT-0000"
        ? "root 权限已被注意到。管理员在第 8 层等你。"
        : "你已经连续很久没死过了。有人开始注意你了。",
    )
  }
  return started
}

/* ------------------------------------------------------------------ *
 * 纯函数：一帧推进
 * ------------------------------------------------------------------ */

function advance(prev: RunState, now: number): RunState {
  /* 暂停：整个战斗冻结，连 now 都不往前走 */
  if (prev.paused) return prev

  /* ---- 顿帧（glitch-feel-pack.md 一）：暴击/斩杀把整个模拟冻结 0.1 秒（微暂停同款语义）。
     到点后全部计时器按冻结时长平移（与暂停恢复同构），并补播压住的爆发音 ---- */
  if (prev.hitStopUntil && prev.hitStopUntil > 0) {
    if (now < prev.hitStopUntil) return prev
    const frozen = Math.max(0, prev.hitStopUntil - prev.now)
    const resumed = shiftRunTime({ ...prev, hitStopUntil: 0 }, frozen)
    if (resumed.pendingHitSfx) playSfx(resumed.pendingHitSfx)
    prev = { ...resumed, pendingHitSfx: null }
  }

  if (prev.phase !== "fighting") {
    const pops = prev.pops.filter((pop) => now - pop.at < POP_LIFETIME_MS)
    if (pops.length === prev.pops.length) return prev
    return { ...prev, now, pops }
  }

  const state: RunState = {
    ...prev,
    now,
    enemies: prev.enemies.map(cloneEnemy),
    pops: prev.pops.filter((pop) => now - pop.at < POP_LIFETIME_MS),
    /* 攻击轨迹短命记录随 tick 剪枝（glitch-feel-pack.md 二） */
    fx: (prev.fx ?? []).filter((item) => now - item.at < ATTACK_FX_LIFE_MS),
    shardDots: prev.shardDots.map((dot) => ({ ...dot })),
    miniShields: prev.miniShields.map((mini) => ({ ...mini })),
    /* 内核包 v1：后台页帧初克隆，处理只碰新对象 */
    tabs: prev.tabs
      ? prev.tabs.map((tab) => ({ ...tab, enemies: tab.enemies.map(cloneEnemy) }))
      : prev.tabs,
    mainBackup: prev.mainBackup
      ? {
          ...prev.mainBackup,
          enemies: prev.mainBackup.enemies.map(cloneEnemy),
        }
      : prev.mainBackup,
  }

  /* 内存历史曲线（ui-pack.md v3 二）：每 250ms 采一个点，滚动窗口 ≈12 秒 */
  if (now >= (state.memoryHistNextAt ?? 0)) {
    state.memoryHistNextAt = now + MEMORY_HIST_SAMPLE_MS
    const hist = (state.memoryHist ?? []).concat(Math.ceil(state.memory))
    state.memoryHist =
      hist.length > MEMORY_HIST_MAX ? hist.slice(hist.length - MEMORY_HIST_MAX) : hist
  }

  /* HUD 构筑包·缓存复用（hud-forge-pack.md 二）：词条栏贴顶角 → 每 6 秒 +1 内存
     （夹上限走 gainMemory 统一通道；开启/清理由 dragDock 管字段） */
  if (state.hudRegenNextAt !== undefined && now >= state.hudRegenNextAt) {
    gainMemory(state, 1)
    state.hudRegenNextAt = now + HUD_REGEN_MS
  }

  /* 内核包 v1（kernel-tabs.md）：后台页维持费 / 崩溃 / 半速出手 */
  processTabPages(state, now)

  /* 核心体验包 v1：台前组的跨页重击 / 跳转弹窗 / leak 偷内存 */
  processTwinBurstGroup(state, state.enemies, now)
  if (state.phase === "fighting" && tabSystemActive(state)) {
    processPopupJumps(state, now)
  }
  if (state.phase === "fighting") {
    processLeakStealGroup(state, state.enemies, now)
  }

  /* 切走标签页再回来时不做长时间补帧，避免瞬间结算一堆伤害 */
  if (now - state.nextAutoAt > 2000) state.nextAutoAt = now
  state.enemies.forEach((enemy) => {
    if (now - enemy.nextAttackAt > 2000) {
      enemy.nextAttackAt = now + Math.round(enemy.attackIntervalMs * 0.5)
    }
    if (enemy.telegraphUntil > 0 && now - enemy.telegraphUntil > 2000) {
      enemy.telegraphUntil = 0
    }
  })

  /* 点击连击：2 秒内没有新点击就清零（只在真的从有到无时提示一次） */
  if (state.clickCombo > 0 && now >= state.clickComboExpireAt) {
    state.clickCombo = 0
    pushLog(state, "连击中断 · 攻速加成回到起点")
    playSfx("comboBreak")
  }

  /* 碎片点：3 秒没点自动入账八成（向下取整），灰色飘字 */
  if (state.shardDots.length > 0) {
    const keep: ShardDot[] = []
    for (const dot of state.shardDots) {
      if (now >= dot.expireAt) {
        /* 404 假奖励点：到期静默消失，不入账不飘字（骗局 B 的「上当才有反馈」） */
        if (dot.fake) continue
        const credited = Math.floor(dot.amount * SHARD_AUTO_CREDIT_RATIO)
        if (credited > 0) creditShards(state, credited)
        pushPop(state, "shard", credited)
      } else {
        keep.push(dot)
      }
    }
    state.shardDots = keep
  }

  /* C5 伪元素·小护盾（relic-redesign.md B·C5）：每 tick 推进飞行进度并跟踪最近
     存活敌人；到期在目标身上爆炸（8 点），并走 gainMemory(minionDeathMemory) 产内存
     —— 小护盾死亡统一走这条通道，给 M5 词条留接口（relicData minionDeathMemory: 2） */
  if (state.miniShields.length > 0) {
    const keepMini: MiniShield[] = []
    const fromSlot = currentTarget(state)?.slot ?? 0
    for (const mini of state.miniShields) {
      let target =
        state.enemies.find(
          (enemy) => enemy.uid === mini.targetUid && !enemy.closing,
        ) ?? null
      if (!target) {
        target = nearestAliveEnemy(state, fromSlot)
        mini.targetUid = target?.uid ?? null
      }
      const span = Math.max(1, mini.arriveAt - mini.bornAt)
      mini.progress = Math.min(1, (now - mini.bornAt) / span)
      if (now >= mini.arriveAt) {
        if (target) {
          /* combo·护盾流（C 节·2）：伤害值 = mods.miniShieldDamage（默认 8，点亮后 16，数值在 buildMods） */
          hitEnemy(state, target, state.mods.miniShieldDamage, false)
          pushPop(state, "hit", state.mods.miniShieldDamage)
        }
        gainMemory(state, state.mods.minionDeathMemory)
      } else {
        keepMini.push(mini)
      }
    }
    state.miniShields = keepMini
  }

  /* S3 闭包回响（relic-redesign.md B·S3）：到点在同一目标上重放主动技效果；
     目标已被关掉则回响落空（残像消散） */
  if (state.closureEcho && now >= state.closureEcho.until) {
    const echo = state.closureEcho
    state.closureEcho = null
    const echoTarget = state.enemies.find(
      (enemy) => enemy.uid === echo.uid && !enemy.closing,
    )
    if (echoTarget) {
      applyActiveEffect(state, echo.charge, echo.awakened, true, echoTarget)
      playSfx("skill")
    } else {
      pushLog(state, "闭包 · 目标已被关掉，残像落空")
    }
  }

  /* S5 节流积层（relic-redesign.md B·S5）：每 5 秒积 1 层、上限 3，层数 HUD 显示；
     满层时不再叠、只把下一层时间往后推（层数每层开局清零见 enterFloor） */
  if (state.mods.throttleGain > 0 && now >= state.throttleNextAt) {
    if (state.throttleLayers < THROTTLE_STACK_MAX) {
      state.throttleLayers += 1
      if (state.throttleLayers === 1)
        pushLog(state, "节流 · 攒下 1 层节流层，可在词条栏点它挡伤害")
    }
    state.throttleNextAt = now + THROTTLE_STACK_MS
  }

  /* 教学：第一次有弹窗 × 亮出来时教一次「点 × 关闭弹窗」 */
  if (
    !state.coachPopupXDone &&
    state.enemies.some(
      (enemy) =>
        !enemy.closing &&
        enemy.popupXUntil > now &&
        enemy.nextAttackAt <= now,
    )
  ) {
    state.coachPopupXDone = true
    pushTip(state, "点弹窗右上角的 × 可直接关掉它")
  }

  /* 教学：第一次有词条可主动触发时教一次（一局一次） */
  if (!state.coachRelicTriggerDone && anyRelicTriggerReady(state, now)) {
    state.coachRelicTriggerDone = true
    pushTip(state, "词条栏亮起的词条可主动触发 · 点它激活")
  }

  /* 层限时：普通层 20 秒，超时后本层全体敌人攻击 +50%，不直接判负。
     裂隙内的额外战斗不受层限时约束（fun-pack3.md 二） */
  if (
    !state.overtime &&
    !state.hiddenActive &&
    state.bossDeadline > 0 &&
    !state.bossTimeoutFails &&
    state.bossTimeoutPenalty <= 0 &&
    now >= state.bossDeadline
  ) {
    state.overtime = true
    state.bossDeadline = 0
    pushLog(state, "本层超时 · 全体敌人攻击 +50%，先把它们关掉")
    playSfx("hit")
  }

  /* 第 7 层：内存泄漏每 5 秒回 10 血；血量低于三成时回血频率翻倍 */
  state.enemies.forEach((enemy) => {
    if (enemy.closing || enemy.regenEveryMs <= 0) return
    const low = enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= LEAK_LOW_HP_RATIO
    const interval = Math.max(
      400,
      Math.round(enemy.regenEveryMs / (low ? LEAK_LOW_HP_REGEN_MULT : 1)),
    )
    if (now - enemy.regenNextAt > 4000) enemy.regenNextAt = now + interval
    let guard = 0
    while (now >= enemy.regenNextAt && guard < 10) {
      guard += 1
      enemy.regenNextAt += interval
      if (enemy.hp <= 0 || enemy.hp >= enemy.maxHp) continue
      /* 故障手感包（glitch-feel-pack.md 四）：错位期间泄漏读的是假状态——
         「回血」反噬成等量掉血，血尽走正常击杀通道 */
      if (now < (state.memFakeUntil ?? 0) && enemy.defId === "leak") {
        enemy.hp = Math.max(0, enemy.hp - enemy.regenAmount)
        if (enemy.hp <= 0) {
          killEnemy(state, enemy)
          break
        }
        pushLog(
          state,
          `${enemy.displayName} 吸了口假数据 · 把 ${enemy.regenAmount} 血漏给了别人`,
        )
        continue
      }
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.regenAmount)
      enemy.regenFlashUntil = now + 600
      pushLog(state, `${enemy.displayName} 又漏回 ${enemy.regenAmount} 点血`)
    }
  })

  /* 第 3 / 7 层：定时补护盾，补盾时停手 0.5 秒 */
  state.enemies.forEach((enemy) => {
    if (enemy.closing || enemy.shieldRegenEveryMs <= 0) return
    if (now < enemy.shieldRegenNextAt) return
    if (now - enemy.shieldRegenNextAt > 4000) {
      enemy.shieldRegenNextAt = now + enemy.shieldRegenEveryMs
      return
    }
    enemy.shieldRegenNextAt = now + enemy.shieldRegenEveryMs
    enemy.shield += enemy.shieldRegenAmount
    enemy.pausedUntil = now + Math.max(AD_SHIELD_PAUSE_MS, LEAK_PAUSE_MS)
    enemy.telegraphUntil = 0
    pushLog(state, `${enemy.displayName} 补了 ${enemy.shieldRegenAmount} 点护盾`)
  })

  /* 深化包·变异自噬：regen 变异每 2 秒掉 5% 上限血；leak 变异每 3 秒掉 3 血 */
  state.enemies.forEach((enemy) => {
    if (enemy.closing || enemy.hp <= 0) return
    const mutated = enemy.mutatedTagIds ?? []
    const mutRegenAt = enemy.mutRegenNextAt ?? 0
    if (mutated.includes("regen") && mutRegenAt > 0 && now >= mutRegenAt) {
      enemy.mutRegenNextAt = now + MUT_REGEN_MS
      const drain = Math.max(1, Math.round(enemy.maxHp * MUT_REGEN_HP_PCT))
      enemy.hp = Math.max(0, enemy.hp - drain)
      if (enemy.hp <= 0) killEnemy(state, enemy)
    }
    if (enemy.closing || enemy.hp <= 0) return
    const mutLeakAt = enemy.mutLeakNextAt ?? 0
    if (mutated.includes("leak") && mutLeakAt > 0 && now >= mutLeakAt) {
      enemy.mutLeakNextAt = now + MUT_LEAK_MS
      enemy.hp = Math.max(0, enemy.hp - MUT_LEAK_HP)
      if (enemy.hp <= 0) killEnemy(state, enemy)
    }
  })

  /* 第 3 层：左侧广告倒下后，右侧攻速 +20% */
  if (
    state.enemies.some(
      (enemy) => enemy.defId === "ad" && enemy.slot === 0 && enemy.closing,
    )
  ) {
    state.enemies.forEach((enemy) => {
      if (
        enemy.defId !== "ad" ||
        enemy.slot !== 1 ||
        enemy.closing ||
        enemy.intervalMult >= AD_SURVIVOR_HASTE
      ) {
        return
      }
      enemy.intervalMult = AD_SURVIVOR_HASTE
      pushLog(state, `${enemy.displayName} 攻速 +20%`)
    })
  }

  /* 第 5 层：每 4 秒随机一个敌人隐身 2 秒 */
  if (state.hiddenEveryMs > 0 && now >= state.hiddenNextAt) {
    /* 深化包：stealth 变异的敌人永久现形（不进隐身候选） */
    const candidates = state.enemies.filter(
      (enemy) =>
        !enemy.closing &&
        enemy.hiddenUntil <= now &&
        !(enemy.mutatedTagIds ?? []).includes("stealth"),
    )
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)]
      pick.hiddenUntil = now + HIDDEN_DURATION_MS
      pick.telegraphUntil = 0
      pushLog(state, `${pick.displayName} 隐身了 2 秒`)
      if (!state.coachHiddenDone) {
        state.coachHiddenDone = true
        pushTip(state, "目标隐身了 · 按 ← → 换个目标打")
      }
    }
    state.hiddenNextAt = now + state.hiddenEveryMs
  }

  /* 教学：第一次主动技冷却完毕 */
  if (
    !state.coachSkillDone &&
    state.activeWasCooling &&
    now >= state.activeReadyAt
  ) {
    state.coachSkillDone = true
    pushTip(state, "主动技已就绪 · 按空格放")
  }

  /* 教学：第一次血量跌破 30% */
  if (
    !state.coachDangerDone &&
    state.playerHp > 0 &&
    state.playerMaxHp > 0 &&
    state.playerHp <= Math.ceil(state.playerMaxHp * 0.3)
  ) {
    state.coachDangerDone = true
    pushTip(state, "生命值危险 · 优先点残血，Shift 拖一下节奏")
  }

  /* 第 6 层：每 4 秒浮出 3 个图案，1.5 秒内点中高亮那个才破防 */
  if (state.challenge) {
    if (
      state.challenge.result === "pending" &&
      now >= state.challenge.expiresAt
    ) {
      state.challenge = {
        ...state.challenge,
        result: "miss",
        resultUntil: now + 700,
      }
      failChallenge(state)
    } else if (
      state.challenge.result !== "pending" &&
      now >= state.challenge.resultUntil
    ) {
      state.challenge = null
    }
  }
  if (
    state.challengeEveryMs > 0 &&
    !state.challenge &&
    now >= state.challengeNextAt
  ) {
    state.challenge = makeChallenge(now)
    state.challengeNextAt = now + state.challengeEveryMs
  }

  syncBoss(state)
  advanceBossSkills(state, now)
  expireBossClick(state, now)

  /* 离线模式：无操作 3 秒后每秒自动回血 */
  if (state.mods.idleHealPerSec > 0) {
    if (now - state.lastActionAt < IDLE_HEAL_AFTER_MS) {
      state.nextIdleHealAt = state.lastActionAt + IDLE_HEAL_AFTER_MS
    } else if (now >= state.nextIdleHealAt) {
      const ticks = Math.min(4, Math.floor((now - state.nextIdleHealAt) / 1000) + 1)
      state.nextIdleHealAt += ticks * 1000
      healPlayer(state, state.mods.idleHealPerSec * ticks)
    }
  }

  /* 深化包·碎片积累：战斗时间每 25 秒 +1（进层不重置——长期不整理的具象）。
     超频爆发期碎片钟冻结顺延，不攒碎片 */
  {
    const fragClock = state.memFragNextAt ?? 0
    if (now < (state.ocUntil ?? 0)) {
      state.memFragNextAt = fragClock + Math.max(0, now - prev.now)
    } else if (fragClock > 0 && now >= fragClock) {
      addMemFrag(state, 1)
      state.memFragNextAt = now + MEM_FRAG_INTERVAL_MS
    }
    /* 超频爆发到点 → 进入过热惩罚期：瞬间 +3 碎片 + 断连闷响 */
    const ocEnd = state.ocUntil ?? 0
    if (ocEnd > 0 && prev.now < ocEnd && now >= ocEnd) {
      addMemFrag(state, OC_PENALTY_FRAGS)
      playSfx("comboBreak")
      pushLog(state, "超频过热 · 接下来 10 秒更卡，还崩出 3 块碎片")
    }
  }

  /* 内存（v2）：战斗中不再回复，回复只来自「进层回满 + 击杀 / 碎片 / 词条产出」。
     这里只做 4 区间惩罚：持续处于紧张/耗尽时卡顿累积（回到 ≥40% 清零） */
  if (state.maxMemory > 0) {
    /* Build 评分计数：每次「进入」耗尽区记 1 次耗尽（离开后再进才计新的一次） */
    const exhaustedNow = memoryZoneOf(state) === "exhausted"
    if (exhaustedNow && !state.memOutageActive) {
      state.memOutageActive = true
      state.memoryOutages += 1
    } else if (!exhaustedNow) {
      state.memOutageActive = false
    }
    const ocBurstActive = now < (state.ocUntil ?? 0)
    const lowZone = state.memory / state.maxMemory < MEMORY_TENSE_RATIO
    if (!lowZone) {
      state.memStallSince = 0
      state.memStallDrainNextAt = 0
    } else if (ocBurstActive) {
      /* 超频爆发期卡顿累积冻结（过热解除后照常走） */
    } else {
      if (state.memStallSince === 0) {
        state.memStallSince = now
        state.memStallDrainNextAt = 0
      }
      const stalledMs = now - state.memStallSince
      /* ≥8 秒：每秒扣 1 血，不触发词条联动伤害通道；血量归零死因记「内存溢出」 */
      if (stalledMs >= MEMORY_STALL_DRAIN_AT_MS) {
        if (state.memStallDrainNextAt === 0) state.memStallDrainNextAt = now + 1000
        while (state.phase === "fighting" && now >= state.memStallDrainNextAt) {
          state.memStallDrainNextAt += 1000
          state.playerHp = Math.max(0, state.playerHp - MEMORY_STALL_DRAIN_HP)
          pushPop(state, "hurt", MEMORY_STALL_DRAIN_HP)
          if (state.playerHp <= 0) {
            state.phase = "dead"
            state.deadAt = now
            state.cause = `内存溢出 · 第 ${state.floor} 层长期低内存把血耗干了（内存管理失败）`
            playSfx("lose")
          }
        }
      }
      /* ≥12 秒：崩溃，无法攻击 2 秒；崩溃后计时清零重新累积（避免永久循环锁死） */
      if (state.phase === "fighting" && stalledMs >= MEMORY_STALL_CRASH_AT_MS) {
        state.attackLockedUntil = Math.max(
          state.attackLockedUntil,
          now + MEMORY_STALL_CRASH_LOCK_MS,
        )
        state.memStallSince = 0
        state.memoryCrashes += 1
        pushLog(state, "内存崩溃 · 2 秒内无法攻击，管管内存！")
        playSfx("comboBreak")
      }
    }
  }

  /* 蓝屏诅咒：每 10 秒卡 1 秒（复用崩溃锁攻通道，不弹崩溃文案） */
  if (
    state.phase === "fighting" &&
    state.bluescreenNextAt > 0 &&
    now >= state.bluescreenNextAt &&
    now >= state.attackLockedUntil
  ) {
    state.attackLockedUntil = now + BLUESCREEN_LOCK_MS
    state.bluescreenNextAt = now + BLUESCREEN_PERIOD_MS
    pushLog(state, "蓝屏 · 卡了一下，1 秒内出不了手")
    playSfx("comboBreak")
  }

  /* ---- 趣味包 v1（fun-pack.md 二）：页面故障到点发作 / 到期收场 ---- */
  if (state.glitchArmedKind && now >= state.glitchArmedAt) {
    const armedKind = state.glitchArmedKind
    state.glitchArmedKind = null
    state.glitchArmedAt = 0
    fireGlitch(state, armedKind)
  }
  if (state.glitchKind && now > state.glitchUntil) state.glitchKind = null

  /* ---- 第四批（fun-pack4.md 二）：管理员篡改——每 7 秒动你的词条 / 内存 / 血。
     故障手感包：内存错位期间它读到的是假数字，这一拍篡改落空（时刻顺延，解除后照常） ---- */
  if (
    state.adminActive &&
    now >= state.adminTamperNextAt &&
    now >= (state.memFakeUntil ?? 0)
  ) {
    state.adminTamperNextAt = now + ADMIN_TAMPER_EVERY_MS
    const lockable = state.relics.filter(
      (item) =>
        !(state.quarantineFloorsLeft > 0 && item.id === state.quarantinedRelicId),
    )
    const tamperRoll = Math.random()
    if (tamperRoll < 0.4 && lockable.length > 0) {
      const victim = lockable[Math.floor(Math.random() * lockable.length)]
      state.adminLockId = victim.id
      state.adminLockUntil = now + ADMIN_LOCK_MS
      state.mods = buildMods(
        state.character,
        state.relics,
        state.floor,
        extrasOf(state),
      )
      pushBanner(state, `管理员禁用了「${victim.name}」`)
      pushLog(state, `管理员篡改 · 你的「${victim.name}」被停权 6 秒`)
    } else if (tamperRoll < 0.7 && state.memory >= ADMIN_MEMORY_TAMPER) {
      state.memory -= ADMIN_MEMORY_TAMPER
      state.memorySpent += ADMIN_MEMORY_TAMPER
      pushBanner(state, "管理员删了你一段内存")
      pushLog(state, `管理员篡改 · 内存 -${ADMIN_MEMORY_TAMPER}`)
    } else {
      state.playerHp = Math.max(1, state.playerHp - ADMIN_HP_TAMPER)
      state.tookDamage = true
      state.noDamageFloor = false
      pushPop(state, "hurt", ADMIN_HP_TAMPER)
      pushBanner(state, "管理员改写了你的血条")
      pushLog(state, `管理员篡改 · 血条被直接划掉 ${ADMIN_HP_TAMPER} 点`)
    }
    playSfx("hit")
  }
  /* 管理员的词条停权到点自动恢复 */
  if (
    state.adminLockId &&
    state.adminLockUntil > 0 &&
    now >= state.adminLockUntil
  ) {
    const freed = state.relics.find((item) => item.id === state.adminLockId)
    state.adminLockId = null
    state.adminLockUntil = 0
    state.mods = buildMods(
      state.character,
      state.relics,
      state.floor,
      extrasOf(state),
    )
    if (freed) pushLog(state, `「${freed.name}」恢复了权限`)
  }
  /* ---- 第四批（fun-pack4.md 一）：影子爆发——network/cache 系影子每 5 秒蓄一发自家 Build 的重击 ---- */
  state.enemies.forEach((enemy) => {
    if (!enemy.shadow || enemy.closing || enemy.shadowStyle !== "burst") return
    if (now >= (enemy.shadowEchoNextAt ?? 0)) {
      enemy.shadowEchoNextAt = now + SHADOW_BURST_EVERY_MS
      enemy.pendingAttackMult = SHADOW_BURST_MULT
      pushLog(state, `${enemy.displayName} 复刻了原局的那套爆发 · 这下格外重`)
    }
  })

  /* ---- 第三批（fun-pack3.md 一）：离线决堤——无敌到点泄漏扣血（夹 1 血） ---- */
  if (state.offlineBreachEndAt > 0 && now >= state.offlineBreachEndAt) {
    state.offlineBreachEndAt = 0
    state.playerHp = Math.max(1, state.playerHp - CONFLICT_OFFLINE_BREACH_HP)
    state.tookDamage = true
    pushPop(state, "hurt", CONFLICT_OFFLINE_BREACH_HP)
    pushBanner(state, `离线决堤 · 泄漏扣 ${CONFLICT_OFFLINE_BREACH_HP} 血`)
    playSfx("hit")
  }

  /* ---- 趣味包 v2（fun-pack2.md 三）：挂机吐槽——战斗里长时间没操作，页面会说话 ---- */
  if (
    now - state.lastActionAt >= IDLE_NAG_AFTER_MS &&
    !state.idleNagShownFloors.includes(state.floor)
  ) {
    state.idleNagShownFloors = [...state.idleNagShownFloors, state.floor]
    pushBanner(state, "你在等什么？")
    pushStory(state, "场上还有敌人，我稍微偷了会儿懒")
  }

  /* ---- 趣味包 v1（fun-pack.md 二）：假按钮——崩溃 Boss 阶段 2+ 周期性冒头 ---- */
  const crashBossAlive = state.enemies.find(
    (enemy) => enemy.defId === "boss-crash" && !enemy.closing && enemy.boss,
  )
  if (
    crashBossAlive &&
    (crashBossAlive.boss?.phase ?? 0) >= 2 &&
    !state.lowSpec &&
    !state.fakeButton &&
    now >= state.fakeButtonArmedAt
  ) {
    spawnFakeButton(state)
  }
  if (state.fakeButton && now > state.fakeButton.until) state.fakeButton = null

  /* ---- 弹窗干扰包（popup-jam-pack.md 一）：弹窗敌人吐「糊屏弹窗」盖住主动技按钮 ---- */
  if (!state.screenJam && !state.adminActive && !state.skillSnatched) {
    const jammer = state.enemies.find(
      (enemy) =>
        enemy.defId === "popup" &&
        !enemy.closing &&
        enemy.hiddenUntil <= now &&
        enemy.jamNextAt !== undefined &&
        now >= enemy.jamNextAt,
    )
    if (jammer) {
      const jamId = Math.floor(now)
      state.screenJam = {
        id: jamId,
        xLeft: POPUP_JAM_X_TAPS,
        spawnAt: now,
        explodeAt: now + POPUP_JAM_EXPLODE_MS,
        /* 拟物化战斗包（skeuo-boss-pack.md 二）：seed 哈希 40% 出恶意变体，
           id 自增语义天然每窗 salt 不同，每日挑战可复现 */
        malicious:
          Math.abs(hashString(`${state.seed}:jam:${state.floor}:${jamId}`)) %
            100 <
          JAM_MALICE_CHANCE,
      }
      jammer.jamNextAt = now + POPUP_JAM_INTERVAL_MS
      playSfx("jamIn")
      pushBanner(state, "弹窗糊住了技能按钮！甩出屏幕或点 × 关掉")
      pushLog(state, "弹窗敌人甩出一个广告窗口，盖在了你的技能按钮上")
      if (!state.storyJamShown) {
        state.storyJamShown = true
        pushStory(state, "一个广告弹窗糊在了我的技能按钮上")
      }
    }
  }
  if (state.screenJam && now >= state.screenJam.explodeAt) {
    /* 超调 >2 秒（浮层往返等长静默）静默消失不补炸，回来就被炸太冤 */
    const overshoot = now - state.screenJam.explodeAt
    state.screenJam = null
    if (overshoot <= 2000) {
      const dmg = Math.round(POPUP_JAM_BURST_DMG * qtePenaltyMult(state.playMode))
      if (dmg > 0) {
        state.playerHp = Math.max(1, state.playerHp - dmg)
        state.tookDamage = true
        pushPop(state, "hurt", dmg)
      }
      playSfx("jamBurst")
      pushBanner(state, "弹窗炸了 · 这就是不关广告的下场")
    }
  }

  /* ---- 弹窗干扰包（popup-jam-pack.md 一）：弹窗敌人吐「糊屏弹窗」盖住主动技按钮 ---- */
  if (!state.screenJam && !state.adminActive && !state.skillSnatched) {
    const jammer = state.enemies.find(
      (enemy) =>
        enemy.defId === "popup" &&
        !enemy.closing &&
        enemy.hiddenUntil <= now &&
        enemy.jamNextAt !== undefined &&
        now >= enemy.jamNextAt,
    )
    if (jammer) {
      const jamId = Math.floor(now)
      state.screenJam = {
        id: jamId,
        xLeft: POPUP_JAM_X_TAPS,
        spawnAt: now,
        explodeAt: now + POPUP_JAM_EXPLODE_MS,
        /* 拟物化战斗包（skeuo-boss-pack.md 二）：seed 哈希 40% 出恶意变体，
           id 自增语义天然每窗 salt 不同，每日挑战可复现 */
        malicious:
          Math.abs(hashString(`${state.seed}:jam:${state.floor}:${jamId}`)) %
            100 <
          JAM_MALICE_CHANCE,
      }
      jammer.jamNextAt = now + POPUP_JAM_INTERVAL_MS
      playSfx("jamIn")
      pushBanner(state, "弹窗糊住了技能按钮！甩出屏幕或点 × 关掉")
      pushLog(state, "弹窗敌人甩出一个广告窗口，盖在了你的技能按钮上")
      if (!state.storyJamShown) {
        state.storyJamShown = true
        pushStory(state, "一个广告弹窗糊在了我的技能按钮上")
      }
    }
  }
  if (state.screenJam && now >= state.screenJam.explodeAt) {
    /* 超调 >2 秒（浮层往返等长静默）静默消失不补炸，回来就被炸太冤 */
    const overshoot = now - state.screenJam.explodeAt
    state.screenJam = null
    if (overshoot <= 2000) {
      const dmg = Math.round(POPUP_JAM_BURST_DMG * qtePenaltyMult(state.playMode))
      if (dmg > 0) {
        state.playerHp = Math.max(1, state.playerHp - dmg)
        state.tookDamage = true
        pushPop(state, "hurt", dmg)
      }
      playSfx("jamBurst")
      pushBanner(state, "弹窗炸了 · 这就是不关广告的下场")
    }
  }

  /* ---- 浏览器特性包 v1（browser-powers-pack.md 一）：分身读条完成判定 ---- */
  if (state.bossCloneCastUntil && now >= state.bossCloneCastUntil) {
    const cloneAlive =
      state.phase === "fighting" &&
      state.enemies.some(
        (enemy) =>
          enemy.defId === "boss-fullscreen" &&
          !enemy.closing &&
          (enemy.boss?.bodyHp ?? enemy.hp) > 0,
      )
    /* 读满或被 Boss 带着消失：字段一律清掉；本体没了就静默（不补幽灵伤害） */
    state.bossCloneCastUntil = undefined
    state.bossCloneTaps = undefined
    if (cloneAlive) {
      /* 跨窗口大招：不可闪避、可致死；休闲走 qtePenaltyMult 归零 */
      const dmg = Math.round(CLONE_BURST_DMG * qtePenaltyMult(state.playMode))
      if (dmg > 0) {
        state.playerHp = Math.max(0, state.playerHp - dmg)
        state.tookDamage = true
        pushPop(state, "hurt", dmg)
      }
      playSfx("jamBurst")
      pushBanner(state, "分身放完了跨窗口大招")
      pushLog(state, "你没切进分身窗口——它读满了大招，糊了你一脸")
      if (state.playerHp <= 0) {
        state.phase = "dead"
        state.deadAt = now
        state.cause = "广告分身 · 跨窗口大招把血耗干了"
        playSfx("lose")
      }
    }
  }

  /* ---- 趣味包 v1（fun-pack.md 一·骗局A）：弹窗假投降到期自爆 ---- */
  state.enemies.forEach((enemy) => {
    if (!enemy.surrenderUntil || enemy.closing || now < enemy.surrenderUntil) return
    enemy.surrenderUntil = 0
    /* 自爆：最低 1 血（陷阱类永不致死）、不算击杀、不掉碎片 */
    const dmg = Math.round(SURRENDER_DAMAGE * qtePenaltyMult(state.playMode))
    state.enemies = state.enemies.filter((item) => item.uid !== enemy.uid)
    if (state.lockedUid === enemy.uid) state.lockedUid = null
    pushLog(state, `${enemy.displayName} 说好投降，当场自爆了！`)
    pushBanner(state, "假投降 · 自爆")
    pushStory(state, "一个弹窗假装投降，在我面前爆了")
    if (dmg > 0) {
      state.playerHp = Math.max(1, state.playerHp - dmg)
      state.tookDamage = true
      pushPop(state, "hurt", dmg)
      playSfx("hit")
    } else {
      pushPop(state, "immune", 0)
    }
  })

  /* 时间裂隙：敌人 15 秒倒计时到点仍未死 → 反噬玩家 30 血并重置该敌人倒计时 */
  if (state.phase === "fighting" && state.activeRouteId === "time-rift") {
    state.enemies.forEach((enemy) => {
      if (state.phase !== "fighting") return
      if (enemy.closing || enemy.riftDeadline <= 0 || now < enemy.riftDeadline)
        return
      state.playerHp = Math.max(0, state.playerHp - TIME_RIFT_PENALTY_HP)
      pushPop(state, "hurt", TIME_RIFT_PENALTY_HP)
      playSfx("hit")
      if (state.playerHp <= 0) {
        state.phase = "dead"
        state.deadAt = now
        state.cause = "时间裂隙 · 敌人拖到点，反噬把血耗干了"
        playSfx("lose")
        return
      }
      pushBanner(
        state,
        `${enemy.displayName} 拖到了时间点 · 生命 -${TIME_RIFT_PENALTY_HP}`,
      )
      enemy.riftDeadline = now + TIME_RIFT_MS
    })
  }

  /* 玩家自动攻击（离线模式的离线窗口内锁攻击；S7 异步觉醒阻塞期同样锁攻击） */
  let guard = 0
  while (
    state.phase === "fighting" &&
    now >= state.nextAutoAt &&
    guard < 40 &&
    now >= state.attackLockedUntil &&
    now >= state.blockUntil
  ) {
    guard += 1
    if (!currentTarget(state)) break

    /* S4 防抖（relic-redesign.md B·S4）：受击后 1 秒窗口内的下一次普攻变三连
       （3 段常规普攻、各自可暴击），开火时 trySpendMemory(2) 原子扣费；
       内存不足 → 本次照旧单段普攻，窗口保留到自然过期 */
    if (
      state.mods.tripleOnHurt > 0 &&
      state.now < state.debounceUntil
    ) {
      if (trySpendMemory(state, TRIPLE_MEMORY_COST) !== null) {
        state.debounceUntil = 0
        playSfx("triple")
        pushLog(state, "防抖 · 补上了！三连击")
        for (let triple = 0; triple < 3; triple += 1) {
          playerAttack(state, 1)
          if (state.phase !== "fighting" || !currentTarget(state)) break
        }
      } else {
        playerAttack(state, 1)
      }
    } else {
      playerAttack(state, 1)
    }
    if (state.phase !== "fighting") break

    /* 事件连击：2 秒内每次自动攻击再补一刀（双重打击） */
    if (now < state.doubleStrikeUntil && currentTarget(state)) {
      state.combo += 1
      playerAttack(state, 1)
      if (state.phase !== "fighting") break
    }

    if (
      state.mods.doubleAttackChance > 0 &&
      Math.random() < state.mods.doubleAttackChance
    ) {
      state.combo += 1
      playerAttack(state, 1)
    }
    if (
      state.phase === "fighting" &&
      state.mods.followupChance > 0 &&
      Math.random() < state.mods.followupChance
    ) {
      state.combo += 1
      playerAttack(state, state.mods.followupRatio)
    }

    /* v4：连续命中计数（hitStreak）已改由 playerAttack 维护（S6 Promise 链语义：
       每次普攻命中 +1、受击清零，见 hurtPlayer）；
       v3 的「Promise 链·下一击必定暴击」（critAfterHits→critNext）旧通道随词条池废弃 */

    state.nextAutoAt += effectiveAttackInterval(state)
    if (aliveEnemies(state).length === 0) break
  }

  /* 隐身刚结束的敌人：记下「下一击 +50%」，赶在出手判定之前 */
  state.enemies.forEach((enemy) => {
    if (enemy.closing) return
    if (enemy.hiddenUntil > 0 && enemy.hiddenUntil <= now) {
      enemy.hiddenUntil = 0
      enemy.hiddenBonusPending = true
    }
  })

  /* 敌人出手：先亮红圈前摇，前摇走完才落地，中间留反应窗口 */
  state.enemies.forEach((enemy) => {
    if (enemy.closing) return

    /* 内核之影「任务管理器」冻结中：不攻击也不起前摇（召唤小怪同样冻结） */
    if (state.freezeUntil > now) {
      enemy.telegraphUntil = 0
      return
    }

    /* Boss QTE 眩晕中：只有 Boss 停手，小怪照常 */
    if (state.bossStunUntil > now && (enemy.kind === "boss" || enemy.kind === "bigboss")) {
      enemy.telegraphUntil = 0
      return
    }

    /* 补盾 / 回血时停手，蓄力也取消 */
    if (enemy.pausedUntil > now) {
      enemy.telegraphUntil = 0
      return
    }

    /* 隐身期间不出手 */
    if (enemy.hiddenUntil > now) {
      enemy.telegraphUntil = 0
      return
    }

    /* 隐身刚结束：下一击 +50% */
    if (enemy.hiddenBonusPending) {
      enemy.hiddenBonusPending = false
      enemy.pendingAttackMult = Math.max(
        enemy.pendingAttackMult,
        HIDDEN_BONUS_MULT,
      )
    }

    /* 前摇走完 → 落地 */
    if (enemy.telegraphUntil > 0) {
      if (now < enemy.telegraphUntil) return
      const raw = enemyAttackAmount(state, enemy)
      enemy.telegraphUntil = 0
      enemy.pendingAttackMult = 1
      enemy.nextAttackAt = now + enemyInterval(state, enemy)
      hurtPlayer(state, enemy, raw)
      virusSelfBite(state, enemy, raw)
      return
    }

    /* 到点 → 起前摇（HUD 构筑包·隐蔽：统一走 telegraphMsFor） */
    if (now >= enemy.nextAttackAt) {
      if (enemy.telegraphMs > 0) {
        enemy.telegraphUntil = now + telegraphMsFor(state, enemy.telegraphMs)
      } else {
        const raw = enemyAttackAmount(state, enemy)
        enemy.pendingAttackMult = 1
        enemy.nextAttackAt = now + enemyInterval(state, enemy)
        hurtPlayer(state, enemy, raw)
        virusSelfBite(state, enemy, raw)
      }
    }
  })

  /* Boss 限时 */
  const boss = activeBoss(state)
  if (boss && state.bossDeadline > 0 && now >= state.bossDeadline) {
    if (state.bossTimeoutFails) {
      state.phase = "dead"
      state.deadAt = state.now
      state.cause = "第 8 层的崩溃页面拖到超时，屏幕全白了"
      playSfx("lose")
    } else {
      pushLog(state, "倒计时归零 · 全屏广告又盖了一次")
      hurtPlayer(state, boss, state.bossTimeoutPenalty)
      state.bossDeadline = now + state.bossLimitMs
    }
  }

  /* 广告 Boss 倒计时告急：只剩 5 秒时喊一句（不碰倒计时本身） */
  if (boss && boss.defId === "boss-fullscreen" && state.bossDeadline > 0) {
    const left = state.bossDeadline - now
    if (left > 0 && left <= BOSS_AD_URGENT_MS) {
      setBossLine(state, boss, findBossLine(boss.defId, "urgent"))
    }
  }

  state.enemies = state.enemies.filter(
    (enemy) => !enemy.closing || now - enemy.closedAt < CLOSE_ANIM_MS,
  )

  return finalize(state)
}

/* ------------------------------------------------------------------ *
 * 纯函数：玩家操作
 * ------------------------------------------------------------------ */

/**
 * 主动技效果本体：useActiveSkill（真实释放）与 S3 闭包回响（到点重放）共用。
 * - awakened：S7 异步觉醒「内存已付」态。持有 async-awaken（blockActiveMs>0）但内存不足时
 *   本次伤害类倍率按 100% 结算（×2 已并进 activeDamageMult，这里 ÷2 拉回——倍率来源
 *   只有词条这一个 ×2，relic-redesign.md B·S7「不足则正常释放、不吃翻倍不加阻塞」）。
 * - echo：闭包回响专用——不触发二次闭包（调用方保证）、不吃释放时点专属红利
 *   （如标签刺客击杀回冷却），伤害按调用传入的同一 charge/awakened 计算 =「同倍率」。
 */
function applyActiveEffect(
  next: RunState,
  charge: number,
  awakened: boolean,
  echo: boolean,
  target: EnemyInstance | null,
) {
  const powerMult = next.mods.activeDamageMult
  const power =
    next.mods.blockActiveMs > 0 && !awakened ? powerMult / 2 : powerMult
  /* 技能抗性（fun-pack2.md 二）：敌人适应后主动技伤害打折（echo 重放同样吃这条）。
     HUD 构筑包·有线驱动：技与词条栏相邻 → 技伤 ×1.08，同乘区并列 */
  const skillAdapt =
    (next.adaptSkill ? ADAPT_SKILL_MULT : 1) * hudPerks(next.dock).skillDmgMult
  const id = next.character.id
  if (id === "tab-assassin") {
    /* 关闭标签：8 点伤害，击杀则冷却立即归零（回响不回冷却）；长按蓄力按系数放大 */
    const damage = Math.max(1, Math.round(8 * power * charge * skillAdapt))
    if (target) {
      hitEnemy(next, target, damage, false)
      if (echo) {
        pushLog(next, `闭包回响 · 关闭标签的余劲又拍在 ${target.displayName} 身上`)
      } else if (target.hp <= 0 || target.closing) {
        next.activeReadyAt = next.now
        pushLog(next, `关闭标签 · ${target.displayName} 被关掉，冷却立即归零`)
      } else {
        pushLog(next, `关闭标签 · 对锁定目标造成 ${damage} 点伤害`)
      }
    }
  } else if (id === "cache-mage") {
    /* 缓存护盾：+10 护盾，上限 30（回响也再补一段） */
    next.shield = Math.min(next.mods.shieldMax, next.shield + MAGE_SHIELD_GAIN)
    pushLog(next, `缓存护盾 · 护盾补到 ${next.shield} / ${next.mods.shieldMax}`)
  } else if (id === "script-warrior") {
    /* 事件连击：2 秒内自动攻击变双重打击（回响刷新窗口） */
    next.doubleStrikeUntil = next.now + DOUBLE_STRIKE_MS
    pushLog(next, "事件连击 · 2 秒内自动攻击变成双重打击")
  } else if (id === "cookie-thief") {
    /* 投掷饼干：6 点伤害并汲取 6 点生命（回响按「重放效果」语义连汲取一起重放） */
    const damage = Math.max(
      1,
      Math.round(COOKIE_ACTIVE_DAMAGE * power * charge * skillAdapt),
    )
    if (target) {
      hitEnemy(next, target, damage, false)
      pushLog(next, `投掷饼干 · 对锁定目标造成 ${damage} 点伤害`)
    }
    healPlayer(next, Math.round(COOKIE_ACTIVE_HEAL * charge))
  } else if (id === "worker-monk") {
    /* 多线程执行：3 秒攻速 +60%（回响刷新窗口） */
    next.multithreadUntil = next.now + MULTITHREAD_MS
    pushLog(next, "多线程执行 · 3 秒内攻速 +60%")
  } else if (id === "kernel-shade") {
    /* 任务管理器：冻结全场敌人 2 秒，清空已有的前摇红圈（Boss 蓄力也打断） */
    next.freezeUntil = next.now + FREEZE_MS
    next.enemies.forEach((enemy) => {
      if (!enemy.closing) enemy.telegraphUntil = 0
    })
    const bossEnemy = activeBoss(next)
    if (bossEnemy?.boss) bossEnemy.boss.pending = null
    pushLog(next, "任务管理器 · 全场敌人冻结 2 秒，前摇全部清空")
  } else {
    /* 无痕步：1.5 秒无敌 + 攻速 +30%（回响刷新窗口） */
    next.dodgeUntil = next.now + RANGER_STEP_MS
    next.activeHasteUntil = next.now + RANGER_STEP_MS
    pushLog(next, "无痕步 · 1.5 秒无敌，攻速 +30%")
  }
}

function useActiveSkill(
  state: RunState,
  chargeMult = 1,
  /** 故障打击（glitch-feel-pack.md 三）：强制以该敌人为目标，隐身也照砸 */
  forceUid: string | null = null,
): RunState {
  if (state.phase !== "fighting" || state.now < state.activeReadyAt) return state
  /* 断网诅咒：主动技整体封存（不消耗内存、不进冷却） */
  if (state.curses.includes("curse-offline")) {
    pushBanner(state, "断网中 · 主动技不可用")
    return state
  }
  /* 技能按钮被崩溃 Boss 抢走（fun-pack2.md 一）：先在战斗区点回来 */
  if (state.skillSnatched) {
    pushBanner(state, "技能按钮被崩溃吞了 · 点屏幕上那个乱窜的小按钮找回")
    return state
  }
  /* 弹窗干扰包（popup-jam-pack.md）：技能钮被广告窗物理糊住——先甩掉或点 × */
  if (state.screenJam) {
    pushBanner(state, "技能钮被弹窗糊住了 · 拖出屏幕甩掉，或点 × 三下")
    return state
  }
  /* 浏览器特性包 v1（browser-powers-pack.md 一）：分身读条期间键盘被分身窗抢走
     （与糊屏弹窗同款口径：View 盖住战斗区 + 这里拦键盘路径） */
  if (state.bossCloneCastUntil && state.now < state.bossCloneCastUntil) {
    pushBanner(state, "分身窗口抢走了键盘 · 快切过去砸那个 ×")
    return state
  }
  /* 离线模式的离线窗口内不能出手 */
  if (state.now < state.attackLockedUntil) return state
  /* S7 异步觉醒阻塞期：主动技属于攻击，也被阻塞（relic-redesign.md B·S7） */
  if (state.now < state.blockUntil) return state
  /* 故障打击：强制目标只要没倒就行（隐身也照砸），否则照常校验可见目标 */
  const forced = forceUid
    ? (state.enemies.find(
        (item) => item.uid === forceUid && !item.closing,
      ) ?? null)
    : null
  if (!forced && !currentTarget(state)) return state
  /* v2 耗尽区（<15%）：阻塞态，主动技与闪避都被锁死 */
  if (memoryZoneOf(state) === "exhausted") {
    if (!state.coachMemoryShortDone) {
      state.coachMemoryShortDone = true
      pushTip(state, "内存耗尽 · 主动技和闪避被阻塞，先击杀回内存")
    }
    return state
  }
  /* 长按蓄力倍率：100%~200%，只缩放主动技里「吃不准就保持原样」以外的伤害类效果 */
  const charge = Math.max(1, Math.min(2, chargeMult))

  const next: RunState = {
    ...state,
    enemies: state.enemies.map(cloneEnemy),
    pops: [...state.pops],
    activeReadyAt: state.now + state.mods.activeCooldownMs,
    activeWasCooling: true,
    lastActionAt: state.now,
    closureEcho: state.closureEcho,
  }

  /* v2「所有操作都有成本」：主动技按角色扣内存，余额不足则整个技能不出、不吃冷却。
     深化包·超频爆发期：主动技内存费减半（向上取整）。
     HUD 构筑包·供电短路：技钮贴上角（贴住内存条）→ 技费 ×0.8（向上取整、最低 1） */
  const ocBurstNow = state.now < (state.ocUntil ?? 0)
  const skillCostBase = ocBurstNow
    ? Math.ceil(next.mods.skillMemoryCost / 2)
    : next.mods.skillMemoryCost
  const skillCost = Math.max(
    1,
    Math.ceil(skillCostBase * hudPerks(state.dock).skillCostMult),
  )
  if (trySpendMemory(next, skillCost) === null) return state
  /* 深化包·碎片：卡顿/耗尽区（内存 <40%）强行放主动技也崩出一块碎片 */
  if (
    state.maxMemory > 0 &&
    state.memory / state.maxMemory < MEM_FRAG_SKILL_RATIO
  )
    addMemFrag(next, 1)
  /* 敌人适应计数（fun-pack2.md 二）：成功释放一次记一笔 */
  next.learnSkillUses += 1

  /* S7 异步觉醒（relic-redesign.md B·S7）：释放时 trySpendMemory(4)。
     内存不足的语义 = 本次主动技正常释放、不吃 ×2、不加阻塞（原子扣费不触发不扣） */
  const awakenMs = next.mods.blockActiveMs
  let awakened = false
  if (awakenMs > 0) {
    awakened = trySpendMemory(next, ASYNC_AWAKEN_MEMORY_COST) !== null
  }

  const strikeTarget = forced
    ? (next.enemies.find((item) => item.uid === forced.uid) ?? null)
    : currentTarget(next)
  applyActiveEffect(next, charge, awakened, false, strikeTarget)

  if (awakened) {
    next.blockUntil = next.now + awakenMs
    pushLog(
      next,
      `异步觉醒 · 伤害翻倍，释放后 ${(awakenMs / 1000).toFixed(0)} 秒内无法攻击与闪避`,
    )
  }

  /* S3 闭包（relic-redesign.md B·S3）：主动技后在当前目标位置挂 1.5 秒残像，
     到点在【同一目标】上重放一次主动技效果（同倍率、同觉醒态，不触发二次闭包） */
  if (next.mods.closureEcho > 0) {
    next.closureEcho = {
      uid: strikeTarget?.uid ?? "",
      charge,
      awakened,
      until: next.now + CLOSURE_ECHO_MS,
    }
  }

  /* 表现包·释放特写：黑边+技能名定格 0.42s，蓄力 ≥87% 升金色加强版（纯装饰不吃判定） */
  next.skillFocusUntil = next.now + SKILL_FOCUS_MS
  next.skillFocusChargeFull = charge >= SKILL_FOCUS_CHARGE_FULL
  playSfx("skill")
  playSfx("skillFocus")
  return finalize(next)
}

/** 故障打击（glitch-feel-pack.md 三）：把技能按钮拖到某只敌人身上松手——
 *  主动技无视隐身砸它脸上（照常扣内存费与冷却），并把自动攻击锁定切过去。
 *  故障有价：这次操作崩出记忆碎片 +1。 */
function glitchStrike(prev: RunState, uid: string): RunState {
  if (prev.phase !== "fighting" || prev.paused) return prev
  const target = prev.enemies.find(
    (item) => item.uid === uid && !item.closing,
  )
  if (!target) return prev
  const after = useActiveSkill({ ...prev, lockedUid: uid }, 1, uid)
  /* 未成功释放（冷却中 / 内存不足 / 被封锁）：useActiveSkill 原样回传，冷却线不会前进 */
  if (after.activeReadyAt <= prev.activeReadyAt) return prev
  addMemFrag(after, 1)
  playSfx("glitchHit")
  pushBanner(after, "故障打击 · 技能无视隐身")
  pushLog(
    after,
    target.hiddenUntil > after.now
      ? `故障打击 · ${target.displayName} 躲在隐身里也被砸中了（碎片 +1）`
      : `故障打击 · ${target.displayName} 被技能按钮直接砸中（碎片 +1）`,
  )
  if (!after.storyGlitchShown) {
    after.storyGlitchShown = true
    pushStory(after, "我把技能按钮拖了过去——屏幕坏了一下，敌人跟着倒了")
  }
  return after
}

/** 内存错位（glitch-feel-pack.md 四）：故意让内存条显示错位 6 秒——
 *  管理员的篡改读不到真状态、内存泄漏把血回反。代价：记忆碎片 +2。 */
function fakeMemoryRead(prev: RunState): RunState {
  if (prev.phase !== "fighting" || prev.paused) return prev
  if (prev.memFakeUntil && prev.now < prev.memFakeUntil) return prev
  const next: RunState = { ...prev }
  addMemFrag(next, MEM_FAKE_FRAG_COST)
  next.memFakeUntil = prev.now + MEM_FAKE_MS
  playSfx("memFake")
  pushBanner(next, "内存条错位了 · 它们读到的都是假数字")
  pushLog(
    next,
    `内存错位 ${MEM_FAKE_MS / 1000} 秒 · 管理员篡改与泄漏回血会读假状态（碎片 +${MEM_FAKE_FRAG_COST}）`,
  )
  if (!next.storyGlitchShown) {
    next.storyGlitchShown = true
    pushStory(next, "我把内存条的数字挪了位，读取我状态的家伙全被骗了")
  }
  return next
}

/**
 * 甩开糊屏弹窗：松手在空处 = 甩出屏幕（碎片 +2）；
 * 松手在敌人卡上（uid）= 糊脸砸人（ui-arsenal-pack.md 一）：固定 12 伤，弹窗敌人翻倍。
 */
function flingScreenJam(prev: RunState, uid: string | null = null): RunState {
  if (prev.phase !== "fighting" || !prev.screenJam) return prev
  const next: RunState = {
    ...prev,
    pops: [...prev.pops],
  }
  next.screenJam = null
  if (uid) {
    const target = next.enemies.find(
      (item) => item.uid === uid && !item.closing && item.hp > 0,
    )
    if (target) {
      /* 以彼之道还施彼身：糊弹窗的鼻祖吃双倍 */
      const base = target.defId === "popup" ? JAM_THROW_DMG * 2 : JAM_THROW_DMG
      const dmg = Math.max(
        1,
        Math.round(base * (target.incomingDamageMult ?? 1)),
      )
      next.enemies = next.enemies.map(cloneEnemy)
      const victim = next.enemies.find((item) => item.uid === uid)
      if (victim) {
        victim.hp = Math.max(0, victim.hp - dmg)
        playSfx("jamEscape")
        pushPop(next, "hit", dmg)
        pushBanner(next, `弹窗糊了它一脸 · -${dmg}`)
        pushLog(
          next,
          `你把广告窗砸回「${victim.displayName}」脸上，${dmg} 点伤害`,
        )
        if (!next.storyJamShown) {
          next.storyJamShown = true
          pushStory(next, "我把糊我屏的弹窗原样糊回了它脸上")
        }
        if (victim.hp <= 0) killEnemy(next, victim)
        return next
      }
    }
    /* 目标已死/不存在：回落到甩出口径 */
  }
  next.shards = prev.shards + POPUP_JAM_ESCAPE_SHARDS
  next.shardPulseAt = next.now
  playSfx("jamEscape")
  pushBanner(next, `甩出去了！弹窗糊不住你 · 碎片 +${POPUP_JAM_ESCAPE_SHARDS}`)
  pushLog(
    next,
    `你把广告窗拖出了屏幕，顺手摸走 ${POPUP_JAM_ESCAPE_SHARDS} 碎片`,
  )
  pushStory(next, "我把糊脸的弹窗整个甩出了屏幕")
  return next
}

/** 点 ×（popup-jam-pack.md 一·解法 2）：三下关掉、无奖励——省下的时间都在没打怪 */
function tapScreenJamX(prev: RunState): RunState {
  if (prev.phase !== "fighting" || !prev.screenJam) return prev
  const xLeft = prev.screenJam.xLeft - 1
  if (xLeft > 0) {
    const next: RunState = { ...prev, screenJam: { ...prev.screenJam, xLeft } }
    playSfx("close")
    /* 拟物化战斗包（skeuo-boss-pack.md 二）：恶意弹窗的 × 每点一下跳下一锚点
       （View 按槽位瞬移），给一句不刷屏的提示——只在 xLeft 变的那两下各一次 */
    if (prev.screenJam.malicious) {
      pushBanner(next, "× 刚才跳走了")
    }
    return next
  }
  const next: RunState = { ...prev }
  next.screenJam = null
  playSfx("close")
  pushBanner(next, "关掉了 · 什么也没掉下来")
  return next
}

/** 恶意糊屏弹窗的假「立即领取」（skeuo-boss-pack.md 二）：点了 = 上当，
 *  爆炸倒计时 +2 秒、每窗最多骗一次（再点无效）——其余口径全不变 */
function jamTrapClaimed(prev: RunState): RunState {
  if (prev.phase !== "fighting" || !prev.screenJam) return prev
  if (!prev.screenJam.malicious || prev.screenJam.claimTrapUsed) return prev
  const next: RunState = {
    ...prev,
    screenJam: {
      ...prev.screenJam,
      explodeAt: prev.screenJam.explodeAt + JAM_TRAP_EXT_MS,
      claimTrapUsed: true,
    },
  }
  playSfx("trapClick")
  pushBanner(next, "恶意弹窗把关闭钮又藏起来了 · 倒计时延长")
  pushLog(next, "你点了「立即领取」——它根本不是领东西的按钮")
  return next
}

/** 浏览器特性包 v1（browser-powers-pack.md 一）：分身窗口里连点 × 打断读条；
 *  3 下归零 = 打断成功，清字段 + 走既有 bossStunUntil 通道眩晕 Boss 2.5 秒 */
function tapBossClone(prev: RunState): RunState {
  if (prev.phase !== "fighting") return prev
  if (!prev.bossCloneCastUntil || prev.now >= prev.bossCloneCastUntil) return prev
  const tapsLeft = (prev.bossCloneTaps ?? 0) - 1
  if (tapsLeft > 0) {
    playSfx("close")
    return { ...prev, bossCloneTaps: tapsLeft }
  }
  const next: RunState = {
    ...prev,
    bossCloneCastUntil: undefined,
    bossCloneTaps: undefined,
    bossStunUntil: prev.now + CLONE_STUN_MS,
  }
  playSfx("qteHit")
  pushBanner(next, "分窗口被砸停了 · Boss 眩晕 2.5 秒")
  pushLog(next, "你在分身窗口里狂点 ×，大招读到一半被砸断了")
  return next
}

/** 点中广告 Boss 本体上的弱点 ×（skeuo-boss-pack.md 一）：
 *  固定伤害走本体通道 + 冷却 1.2s + 槽位进位换位置；无效点击静默 return
 *  （× 置灰已是反馈，不弹横幅） */
function hitAdWeakSpot(prev: RunState): RunState {
  if (prev.phase !== "fighting" || prev.paused) return prev
  const found = prev.enemies.find(
    (enemy) =>
      enemy.defId === "boss-fullscreen" &&
      !enemy.closing &&
      enemy.boss?.phase === 2 &&
      enemy.boss.bodyHp > 0,
  )
  if (!found) return prev
  if ((found.weakCdUntil ?? 0) > prev.now) return prev
  const next: RunState = { ...prev }
  next.enemies = prev.enemies.map(cloneEnemy)
  const boss = next.enemies.find((enemy) => enemy.uid === found.uid)
  if (!boss || !boss.boss) return prev
  boss.boss.bodyHp = Math.max(0, boss.boss.bodyHp - AD_WEAK_DMG)
  boss.hp = boss.boss.bodyHp
  boss.weakCdUntil = prev.now + AD_WEAK_CD_MS
  boss.weakSlot = ((boss.weakSlot ?? 0) + 1) % AD_WEAK_SLOTS
  syncBoss(next)
  pushPop(next, "weak", AD_WEAK_DMG)
  playSfx("weakHit")
  pushLog(next, `你戳中了广告本体上的小 × —— 它疼得换了一个位置（-${AD_WEAK_DMG}）`)
  /* 血量见底的击杀走既有通道（碎片/台词/结算全正常，不新增死亡分支） */
  if (boss.hp <= 0 && !boss.closing) killEnemy(next, boss)
  return next
}

/**
 * 地址栏「清理缓存」（ui-arsenal-pack.md 二）：花 3 内存，本层所有敌人的
 * 护盾当场清零、回血与补盾通道当场关停——反「赖皮层」的确定性解法。
 * Boss 层 / 管理员层禁用（View 置灰，引擎静默守卫）。
 */
function clearCache(prev: RunState): RunState {
  if (prev.phase !== "fighting" || prev.floorCacheCleared) return prev
  if (
    prev.adminActive ||
    prev.enemies.some((enemy) => enemy.kind === "boss" || enemy.kind === "bigboss")
  ) {
    return prev
  }
  const next: RunState = {
    ...prev,
    pops: [...prev.pops],
    enemies: prev.enemies.map(cloneEnemy),
  }
  if (trySpendMemory(next, CACHE_CLEAR_COST) === null) {
    pushBanner(next, `内存不足 · 清理缓存要 ${CACHE_CLEAR_COST} 内存`)
    return next
  }
  next.floorCacheCleared = true
  let cleared = 0
  next.enemies.forEach((enemy) => {
    if (enemy.closing || enemy.hp <= 0) return
    if (enemy.shield > 0 || enemy.regenEveryMs > 0 || enemy.shieldRegenEveryMs > 0) {
      cleared += 1
    }
    enemy.shield = 0
    enemy.regenEveryMs = 0
    enemy.regenNextAt = 0
    enemy.shieldRegenEveryMs = 0
    enemy.shieldRegenNextAt = 0
  })
  playSfx("refactor")
  pushBanner(next, "缓存已清理 · 护盾与回血当场失效")
  pushLog(
    next,
    cleared > 0
      ? `清理缓存 · ${cleared} 个敌人的护盾/回血被当场拔线`
      : "清理缓存 · 这层的敌人本来就不藏东西",
  )
  if (cleared > 0 && !next.storyCacheShown) {
    next.storyCacheShown = true
    pushStory(next, "我清了缓存，那些赖皮的护盾和回血全被拔了线")
  }
  return next
}

/** 是否存在「前摇最后 0.2 秒内」的敌人：命中则本次闪避算完美闪避 */
function isPerfectDodgeWindow(state: RunState): boolean {
  const now = state.now
  return state.enemies.some(
    (enemy) =>
      !enemy.closing &&
      enemy.telegraphUntil > now &&
      enemy.telegraphUntil - now <= PERFECT_DODGE_WINDOW_MS,
  )
}

function useDodgeSkill(state: RunState, dir = 0): RunState {
  if (state.phase !== "fighting" || state.now < state.dodgeReadyAt) return state
  /* S7 异步觉醒阻塞期：闪避也被阻塞（relic-redesign.md B·S7「无法攻击与闪避」） */
  if (state.now < state.blockUntil) return state
  /* v2 耗尽区（<15%）：闪避被锁死 */
  if (memoryZoneOf(state) === "exhausted") {
    if (!state.coachMemoryShortDone) {
      state.coachMemoryShortDone = true
      pushTip(state, "内存耗尽 · 主动技和闪避被阻塞，先击杀回内存")
    }
    return state
  }
  /* v2 闪避基础费 1 内存；冷却惩罚：卡顿区 +0.5s，卡顿累积 ≥5s 再 +1s */
  const memZone = memoryZoneOf(state)
  let dodgeCdBonus =
    memZone === "tense" ? MEMORY_TENSE_DODGE_CD_BONUS_MS : 0
  if (
    state.memStallSince > 0 &&
    state.now - state.memStallSince >= MEMORY_STALL_DODGE_CD_AT_MS
  )
    dodgeCdBonus += MEMORY_STALL_DODGE_CD_BONUS_MS
  const perfect = isPerfectDodgeWindow(state)
  const next: RunState = {
    ...state,
    enemies: state.enemies.map(cloneEnemy),
    pops: [...state.pops],
    /* HUD 构筑包·镜像联动：技闪同侧 → 闪 CD ×0.9（与 mods.dodgeCooldownMult 并列乘区） */
    dodgeReadyAt:
      state.now +
      state.mods.dodgeCooldownMs * hudPerks(state.dock).dodgeCdMult +
      dodgeCdBonus,
    dodgeUntil: state.now + state.mods.dodgeWindowMs,
    lastActionAt: state.now,
    dodgeDir: dir,
  }
  if (trySpendMemory(next, MEMORY_DODGE_COST) === null) return state
  if (perfect) {
    /* 完美闪避：回血 + 下次攻击必暴击 + 白闪（低配不铺全屏白闪，只留数值/音效）。
       v4：v3 的「防抖→完美闪避攻速加成」通道（perfectHasteUntil）已删——
       防抖词条改为「受击后三连」语义（relic-redesign.md B·S4） */
    next.critNext = true
    next.perfectFlashUntil = state.now + PERFECT_FLASH_MS
    healPlayer(next, PERFECT_DODGE_HEAL)
    pushLog(next, "完美闪避！· 回 3 生命，下一击必定暴击")
    playSfx("perfect")
  } else {
    pushLog(next, "闪避 · 短暂无敌，能挡掉一次伤害")
    playSfx("dodge")
  }

  /* C2 z-index 残影诱饵（relic-redesign.md B·C2）：v2 起残影费并入闪避基础费
     （1/次，上面已扣），闪避成功即布 2 秒残影（hurtPlayer 里敌人 60% 打空） */
  if (next.mods.decoyAfterDodge > 0) {
    next.decoyUntil = next.now + DECOY_MS
    pushLog(next, "z-index · 布下残影诱饵，2 秒内敌人可能打错目标")
  }
  /* C4 过渡动画（relic-redesign.md B·C4）：记下闪避后 2 秒的过渡窗口，
     窗口内的玩家攻击命中会给该敌人攻速减半（enemy.attackSlowUntil，见 playerAttack） */
  if (next.mods.enemySlowMs > 0) {
    next.transitionUntil = next.now + next.mods.enemySlowMs
  }
  return next
}

function ownsRelic(state: RunState, relicId: string): boolean {
  return state.relics.some((relic) => relic.id === relicId)
}

/**
 * 内存原子消耗（机制词条的统一通道）：余额够才扣，不够则整个效果不触发、
 * 不扣费，并在本局首次时浮教学字。调用方必须先浅拷贝 state 再传入草稿。
 * 返回值：成功返回同一 state（已扣费）；余额不足返回 null（调用方放弃该效果）。
 * 批次 B/C 的消耗点（弹射 / 穿透 / 链式暴击 / 复活…）统一走这里。
 */
/** 内存 4 区间：流畅 / 稳定 / 卡顿 / 阻塞（HUD 配色、攻速惩罚与操作闸门统一以此为准） */
export type MemoryZone = "abundant" | "normal" | "tense" | "exhausted"

export function trySpendMemory(
  state: RunState,
  amount: number,
): RunState | null {
  if (amount <= 0) return state
  if (state.memory < amount) {
    if (!state.coachMemoryShortDone) {
      state.coachMemoryShortDone = true
      pushTip(state, "内存不足 · 该效果未触发")
    }
    return null
  }
  state.memory -= amount
  /* 结算用：总消耗计全部实际扣费（含 0.5 的手动补刀） */
  state.memorySpent += amount
  playSfx("memorySpend")
  return state
}

/** 内存产出（击杀 / 碎片 / 词条的统一通道）；进层回满不走这里、不计入总产出 */
export function gainMemory(state: RunState, amount: number) {
  if (amount <= 0 || state.maxMemory <= 0) return
  const before = state.memory
  /* 核心体验包 v2·超上限兼容：余额已在上限之上（缓存取出）时产出保持不动，
     夹逼只作用于「上限之下」的回升——不能让捡内存把超额部分倒扣回去 */
  state.memory = Math.max(state.memory, Math.min(state.maxMemory, state.memory + amount))
  /* 结算用：总产出不计层间回满（规格效率公式），截断到上限的部分也不算 */
  state.memoryGained += state.memory - before
  if (state.memory > before) playSfx("memoryGain")
}

/** v2 内存 4 区间（内存状态机唯一判定处，HUD / 攻速 / 操作闸门共用） */
export function memoryZoneOf(state: RunState): MemoryZone {
  if (state.maxMemory <= 0) return "abundant"
  /* 核心体验包 v2·缓存取出可超限：区间判定夹到上限（超额期间天然是充裕），扣减照常从真实值扣 */
  const ratio = Math.min(state.memory, state.maxMemory) / state.maxMemory
  /* 深化包·超频爆发期：忽略全部区间，一律按「稳定」处理 */
  if (state.now < (state.ocUntil ?? 0)) return "normal"
  /* 深化包·超频过热期：强制按「卡顿」处理，与真实区间取更严者 */
  if (state.now < (state.ocPenaltyUntil ?? 0)) {
    if (ratio < MEMORY_EXHAUSTED_RATIO) return "exhausted"
    return "tense"
  }
  if (ratio >= MEMORY_ABUNDANT_RATIO) return "abundant"
  if (ratio >= MEMORY_TENSE_RATIO) return "normal"
  if (ratio >= MEMORY_EXHAUSTED_RATIO) return "tense"
  return "exhausted"
}

/** 词条可触发状态：供词条栏角标与首次教学共用 */
export type RelicTriggerStatus = "ready" | "cooldown" | "used"

export function relicTriggerStatus(
  state: RunState,
  relicId: string,
  now: number,
): RelicTriggerStatus | null {
  if (!ownsRelic(state, relicId)) return null
  switch (relicId) {
    case "throttle":
      /* v4·S5：节流不再是「5 秒冷却」，而是资源层——有层就能触发；
         免疫期（激活生效中）视为 cooldown */
      if (now < state.manualImmuneUntil) return "cooldown"
      if (state.throttleLayers > 0) return "ready"
      return "cooldown"
    case "offline-mode":
      return now < state.offlineReadyAt ? "cooldown" : "ready"
    default:
      return null
  }
}

/** 词条栏里此刻是否有「可触发」项（首次教学用） */
function anyRelicTriggerReady(state: RunState, now: number): boolean {
  return MANUAL_TRIGGER_RELICS.some(
    (id) => relicTriggerStatus(state, id, now) === "ready",
  )
}

/**
 * 词条手动触发（v4 起只剩两个通道）：
 * - 节流：沿用 v3 的 2 秒免疫行为（资源层叠层改写放批次 B）
 * - 离线模式：3 秒无敌但期间不能出手（攻击锁定），10 秒冷却
 * 断点续传 / 垃圾回收在 v4 改为纯被动词条，不再出现在可触发列表。
 */
function triggerRelic(state: RunState, relicId: string): RunState {
  if (state.phase !== "fighting" || state.paused) return state
  if (!ownsRelic(state, relicId)) return state
  /* 节流例外：无层点击时要给「还没有节流层」提示（relic-redesign.md B·S5），
     不能被通用 ready 判定提前挡掉；其余词条仍按 ready 才响应 */
  if (relicId !== "throttle" && relicTriggerStatus(state, relicId, state.now) !== "ready")
    return state

  if (relicId === "throttle") {
    /* v4·S5：节流改为资源层——每 5 秒积 1 层（advance 里结算，上限 3）；
       手动触发消耗 1 层换 2 秒免疫（复用 manualImmuneUntil 通道）。
       v3 的「5 秒自动冷却」语义已删（不再写 throttleReadyAt） */
    if (state.throttleLayers <= 0) {
      if (state.now - state.lastActionAt < 400) return state
      const warned: RunState = { ...state, lastActionAt: state.now }
      pushBanner(warned, "还没有节流层")
      return warned
    }
    if (relicTriggerStatus(state, relicId, state.now) !== "ready") return state
    const next: RunState = {
      ...state,
      lastActionAt: state.now,
      throttleLayers: state.throttleLayers - 1,
      manualImmuneUntil: state.now + THROTTLE_IMMUNE_MS,
    }
    pushBanner(next, "节流 已激活")
    pushLog(next, `节流 · 消耗 1 层，2 秒内挡下伤害（剩余 ${next.throttleLayers} 层）`)
    playSfx("activate")
    return next
  }

  if (relicId === "offline-mode") {
    /* M7 离线模式（relic-redesign.md B·M7，批次 C 核对）：v3 通道与规格一致——
       3 秒无敌（OFFLINE_IMMUNE_MS）+ 期间攻击锁定（attackLockedUntil）+ 10 秒 CD
       （OFFLINE_READY_CD_MS）；批次 C 补 trySpendMemory(3) 消耗，不足不可触发 */
    const next: RunState = { ...state, lastActionAt: state.now }
    if (trySpendMemory(next, OFFLINE_MEMORY_COST) === null) {
      pushBanner(next, "离线模式 · 内存不足")
      return next
    }
    next.manualImmuneUntil = state.now + OFFLINE_IMMUNE_MS
    next.attackLockedUntil = state.now + OFFLINE_IMMUNE_MS
    next.offlineReadyAt = state.now + OFFLINE_READY_CD_MS
    /* 离线决堤（fun-pack3.md 一）：内存泄漏在场时无敌随内存余量延长，
       内存越满拖得越久——但到点必「决堤」扣 20 血（advance 结算，夹 1 血） */
    if (next.mods.conflicts.includes("offline-breach")) {
      const ratio =
        next.maxMemory > 0 ? Math.min(1, next.memory / next.maxMemory) : 0
      const extendedMs = Math.round(
        OFFLINE_IMMUNE_MS * (1 + ratio) + OFFLINE_IMMUNE_MS * 0.5,
      )
      next.manualImmuneUntil = state.now + extendedMs
      next.attackLockedUntil = state.now + extendedMs
      next.offlineBreachEndAt = state.now + extendedMs
      pushLog(
        next,
        `离线决堤 · 内存余量把无敌拖到 ${(extendedMs / 1000).toFixed(1)} 秒，结束时泄漏 -${CONFLICT_OFFLINE_BREACH_HP} 血`,
      )
    }
    pushBanner(next, "离线模式 已激活")
    pushLog(next, "离线模式 · 3 秒无敌，离线期间无法出手")
    playSfx("activate")
    return next
  }

  return state
}

function shiftTarget(state: RunState, delta: number): RunState {
  if (state.phase !== "fighting") return state
  /* 与点击切锁共用的 0.5 秒防误触 */
  if (state.now - state.lastLockAt < LOCK_SWITCH_MS) return state
  const alive = visibleEnemies(state)
  if (alive.length === 0) return state

  const boss = activeBoss(state)
  if (alive.length === 1 && boss && boss.boss?.phase === 1) {
    const open = boss.buttons.filter((button) => !button.closed)
    if (open.length <= 1) return state
    const index = open.findIndex((button) => button.id === state.lockedButtonId)
    const nextButton = open[(index + delta + open.length) % open.length]
    return {
      ...state,
      lockedUid: boss.uid,
      lockedButtonId: nextButton.id,
      lastActionAt: state.now,
      lastLockAt: state.now,
    }
  }

  const index = alive.findIndex((enemy) => enemy.uid === state.lockedUid)
  const nextEnemy = alive[(index + delta + alive.length) % alive.length]
  return {
    ...state,
    lockedUid: nextEnemy.uid,
    lockedButtonId:
      nextEnemy.kind === "boss"
        ? (nextEnemy.buttons.find((button) => !button.closed)?.id ?? null)
        : null,
    lastActionAt: state.now,
    lastLockAt: state.now,
  }
}

/* ---- 内核包 v1（kernel-tabs.md）：多标签页 ---- */

/** 系统开放窗口：普通层战斗中（Boss 层 / 裂隙 / 管理员期间不开页，场上出现 Boss 也收起标签栏） */
function tabSystemActive(state: RunState): boolean {
  if (state.phase !== "fighting") return false
  if (state.hiddenActive || state.adminActive) return false
  if (getFloorConfig(state.floor).isBoss) return false
  return !state.enemies.some(
    (enemy) =>
      !enemy.closing && (enemy.kind === "boss" || enemy.kind === "bigboss"),
  )
}

/** 页内敌人：1~2 个普通敌人，血量/攻击照抄本层配置，每个独立 25% 概率精英 */
function makeTabEnemies(state: RunState, now: number): EnemyInstance[] {
  const cfg = getFloorConfig(state.floor)
  const count = Math.random() < 0.6 ? 2 : 1
  const list: EnemyInstance[] = []
  for (let index = 0; index < count; index += 1) {
    const spec = cfg.enemies[Math.floor(Math.random() * cfg.enemies.length)]
    if (!spec) continue
    const enemy = makeEnemy({
      defId: spec.defId,
      hp: spec.hp,
      attack: spec.attack,
      shield: spec.shield ?? 0,
      now,
      slot: index,
      startAt: now + 1200 + index * 400,
      telegraphMs: cfg.telegraphMs,
      elite: Math.random() < TAB_ELITE_CHANCE,
      darkTheme: state.mods.darkTheme,
    })
    enemy.bgNextAttackAt =
      now + Math.max(400, enemyInterval(state, enemy) * TAB_BG_INTERVAL_MULT)
    list.push(enemy)
  }
  return list
}

/** 新开标签页：花 4 内存刷后台战场。Boss 层等窗口外 / 页满 / 内存不足都不动 */
function openTabPage(prev: RunState): RunState {
  if (!tabSystemActive(prev)) return prev
  if ((prev.tabs?.length ?? 0) >= TAB_MAX_EXTRA) return prev
  const state: RunState = { ...prev }
  if (trySpendMemory(state, TAB_OPEN_COST_MEMORY) === null) return prev
  const id = state.nextTabPageId ?? 1
  state.nextTabPageId = id + 1
  const enemies = makeTabEnemies(state, state.now)
  state.tabs = [
    ...(state.tabs ?? []),
    {
      id,
      enemies,
      lockedUid: enemies[0]?.uid ?? null,
      frozen: false,
      crashed: false,
      drainNextAt: state.now + TAB_MAINTAIN_MS,
      crashNextAt: state.now + TAB_CRASH_EVERY_MS,
    },
  ]
  playSfx("pick")
  pushLog(state, `新建标签页 ${id} · 后台战场开张（每 6 秒吃 1 内存）`)
  return state
}

/** 从台前换到后台：清掉前摇，挂上后台半速出手通道 */
function parkTabEnemies(state: RunState, list: EnemyInstance[]): EnemyInstance[] {
  return list.map((enemy) => ({
    ...cloneEnemy(enemy),
    telegraphUntil: 0,
    bgNextAttackAt:
      state.now + Math.max(400, enemyInterval(state, enemy) * TAB_BG_INTERVAL_MULT),
  }))
}

/** 换回台前：交回正常出手通道（nextAttackAt 由补帧守卫自然重置） */
function frontTabEnemies(list: EnemyInstance[]): EnemyInstance[] {
  return list.map((enemy) => ({ ...cloneEnemy(enemy), bgNextAttackAt: undefined }))
}

/** 切换标签：台前敌组与目标页记录互换（含各自 lockedUid）。0.35 秒防误触；冻结页要先解冻 */
function switchTabPage(prev: RunState, id: number): RunState {
  if (prev.phase !== "fighting") return prev
  if ((prev.tabs?.length ?? 0) === 0) return prev
  const current = prev.activeTabId ?? 0
  if (id === current) return prev
  if (prev.now < (prev.tabSwitchLockUntil ?? 0)) return prev
  const target = id === 0 ? null : prev.tabs!.find((tab) => tab.id === id)
  if (id !== 0 && !target) return prev
  if (id === 0 && !prev.mainBackup) return prev
  if (target?.frozen) {
    const nag: RunState = { ...prev }
    pushTip(nag, "这个标签页冻着 · 解冻后才能打它")
    return nag
  }
  const state: RunState = { ...prev }
  /* 1) 当前台前换到后台（主标签存进 mainBackup，额外页写回自己的记录） */
  if (current === 0) {
    state.mainBackup = {
      enemies: parkTabEnemies(state, state.enemies),
      lockedUid: state.lockedUid,
    }
  } else {
    state.tabs = prev.tabs!.map((tab) =>
      tab.id === current
        ? {
            ...tab,
            enemies: parkTabEnemies(state, state.enemies),
            lockedUid: state.lockedUid,
          }
        : tab,
    )
  }
  /* 2) 目标页拿到台前 */
  if (id === 0) {
    const backup = state.mainBackup!
    state.enemies = frontTabEnemies(backup.enemies)
    state.lockedUid = backup.lockedUid
    state.mainBackup = null
  } else {
    state.enemies = frontTabEnemies(target!.enemies)
    state.lockedUid = target!.lockedUid
    state.tabs = (state.tabs ?? prev.tabs!).map((tab) =>
      tab.id === id ? { ...tab, lockedUid: null } : tab,
    )
  }
  state.activeTabId = id
  state.tabSwitchLockUntil = prev.now + TAB_SWITCH_LOCK_MS
  state.lastActionAt = prev.now
  retarget(state)
  playSfx("pick")
  pushLog(state, id === 0 ? "切回主标签" : `切到标签页 ${id} · 页里的敌人半速出手`)
  return state
}

/** 冻结 / 解冻：只作用于后台页。冻结 = 停手 + 不崩 + 维持费减半；解冻才能再打它 */
function freezeTabPage(prev: RunState, id: number): RunState {
  if (prev.phase !== "fighting") return prev
  const tab = (prev.tabs ?? []).find((item) => item.id === id)
  if (!tab || id === (prev.activeTabId ?? 0)) return prev
  const state: RunState = {
    ...prev,
    tabs: prev.tabs!.map((item) =>
      item.id === id ? { ...item, frozen: !item.frozen } : item,
    ),
    lastActionAt: prev.now,
  }
  playSfx("pick")
  pushLog(
    state,
    tab.frozen
      ? `标签页 ${id} 解冻 · 恢复出手，也恢复会崩`
      : `标签页 ${id} 已冻结 · 暂停出手、不会崩、维持费减半`,
  )
  return state
}

/** 关闭后台页：页内敌人直接消失（不触发死亡动画与击杀词条），碎片收益按 50% 折算入账 */
function closeTabPage(prev: RunState, id: number): RunState {
  if (prev.phase !== "fighting") return prev
  const tab = (prev.tabs ?? []).find((item) => item.id === id)
  if (!tab || id === (prev.activeTabId ?? 0)) return prev
  /* 核心体验包 v2：关援军页 = 援军下线（页里本来就没敌人，无任何折算） */
  if (tab.ally) {
    const state: RunState = { ...prev }
    state.tabs = prev.tabs!.filter((item) => item.id !== id)
    state.lastActionAt = prev.now
    playSfx("close")
    pushBanner(state, "援军下线")
    pushLog(state, `${ALLY_DEFS[tab.ally].icon} 援军下线 · 标签页 ${id} 释放`)
    return state
  }
  const state: RunState = { ...prev }
  /* 期望掉落 = 每只存活敌人按正常击杀口径（精英/普通随层、M2 词条乘算）折一遍 */
  let expected = 0
  for (const enemy of tab.enemies) {
    if (enemy.closing) continue
    const shardBase =
      enemy.killShards > 0
        ? enemy.killShards
        : enemy.elite
          ? rollEliteShards()
          : rollFloorKillShards(state.floor)
    expected += Math.max(1, Math.floor(shardBase * (1 + state.mods.fragmentMult)))
  }
  const credited = Math.floor(expected * TAB_CLOSE_SHARD_RATIO)
  state.tabs = prev.tabs!.filter((item) => item.id !== id)
  if (credited > 0) {
    creditShards(state, credited)
    pushPop(state, "shard", credited)
  }
  /* 核心体验包 v1：强关含双面敌人的页 → 50% 折算照常、不算同步击杀，另一半狂暴 */
  const twinVictim = tab.enemies.find((e) => e.twin && !e.closing)
  if (twinVictim) rageTwinPartner(state, twinVictim)
  state.lastActionAt = prev.now
  playSfx("close")
  pushLog(state, `强行关闭标签页 ${id} · 折回 ${credited} 碎片（50% 折算）`)
  return state
}

/** 后台页敌人半速出手：真实掉血、可被闪避 / 无敌挡；补帧守卫落后 >2 秒不追打 */
function hitFromBackgroundPages(
  state: RunState,
  enemies: EnemyInstance[],
  now: number,
) {
  for (const enemy of enemies) {
    if (enemy.closing) continue
    const interval = Math.max(
      400,
      Math.round(enemyInterval(state, enemy) * TAB_BG_INTERVAL_MULT),
    )
    if (enemy.bgNextAttackAt == null) {
      enemy.bgNextAttackAt = now + interval
      continue
    }
    if (now - enemy.bgNextAttackAt > TAB_BG_CATCHUP_GUARD_MS) {
      enemy.bgNextAttackAt = now + Math.round(interval * 0.5)
      continue
    }
    let guard = 0
    while (now >= enemy.bgNextAttackAt && guard < 5) {
      guard += 1
      enemy.bgNextAttackAt += interval
      hurtPlayer(state, enemy, enemyAttackAmount(state, enemy))
      if (state.phase !== "fighting") return
    }
  }
}

/**
 * 后台页一帧处理（在 advance 里、tabs 已克隆后调用）：
 * 维持费 → 崩溃判定 → 半速出手。主标签被换到后台时只半速出手、不吃维持费也不崩
 * （主标签崩掉等于整层白丢，规格简化版刻意不给这条）。
 */
function processTabPages(state: RunState, now: number) {
  const tabs = state.tabs
  if (tabs && tabs.length > 0) {
    const keep: TabPage[] = []
    for (const tab of tabs) {
      if (tab.crashed) continue
      /* 核心体验包 v2：援军页短路——不吃维持费、不掷崩溃、无半速出手（页里没敌人）；
         未冻结时结算援军计时；冻结 = 效果停摆，解冻恢复（冻结钮天然复用） */
      if (tab.ally) {
        if (!tab.frozen && state.phase === "fighting") {
          processAllyEffect(state, tab, now)
        }
        keep.push(tab)
        continue
      }
      /* 维持费：未冻结 6 秒 −1、冻结 12 秒 −1，扣到 0 为止 */
      const interval = tab.frozen ? TAB_MAINTAIN_FROZEN_MS : TAB_MAINTAIN_MS
      let drain = tab.drainNextAt
      if (now - drain > TAB_BG_CATCHUP_GUARD_MS) drain = now + interval
      let drainGuard = 0
      while (now >= drain && drainGuard < 8) {
        drainGuard += 1
        drain += interval
        if (state.memory > 0) {
          state.memory = Math.max(0, state.memory - 1)
          state.memorySpent += 1
        }
      }
      tab.drainNextAt = drain
      /* 崩溃：敌人全消失、碎片 0、页释放 */
      if (!tab.frozen) {
        let crash = tab.crashNextAt
        if (now - crash > TAB_BG_CATCHUP_GUARD_MS) crash = now + TAB_CRASH_EVERY_MS
        let crashGuard = 0
        let crashed = false
        while (now >= crash && crashGuard < 4) {
          crashGuard += 1
          crash += TAB_CRASH_EVERY_MS
          if (Math.random() < TAB_CRASH_CHANCE) {
            crashed = true
            break
          }
        }
        tab.crashNextAt = crash
        if (crashed) {
          pushLog(state, `标签页 ${tab.id} 崩溃了 · 页里的敌人全没了，碎片 0`)
          playSfx("hit")
          /* 核心体验包 v1：背面被崩掉不算同步击杀，但另一半照样狂暴（规格一） */
          const twinVictim = tab.enemies.find((e) => e.twin && !e.closing)
          if (twinVictim) rageTwinPartner(state, twinVictim)
          continue
        }
      }
      /* 核心体验包 v1：后台页里的背面跨页重击与 leak 偷内存（冻结页全部不动） */
      if (!tab.frozen) {
        processTwinBurstGroup(state, tab.enemies, now)
        if (state.phase === "fighting") {
          processLeakStealGroup(state, tab.enemies, now)
        }
      }
      hitFromBackgroundPages(state, tab.enemies, now)
      keep.push(tab)
    }
    state.tabs = keep
  }
  /* 主标签在后台（玩家切去额外页了）：半速出手、不维持、不崩 */
  if (
    state.activeTabId &&
    state.activeTabId !== 0 &&
    state.mainBackup
  ) {
    processTwinBurstGroup(state, state.mainBackup.enemies, now)
    if (state.phase === "fighting") {
      processLeakStealGroup(state, state.mainBackup.enemies, now)
    }
    hitFromBackgroundPages(state, state.mainBackup.enemies, now)
  }
}

/* ---- 核心体验包 v2（core-experience-pack2.md）一：援军召唤（Aura 型友军，不造新战斗单位） ---- */

/** 三种援军的展示数据（View 卡片与芯片图标共用；固定展示顺序 sprite→guard→bug） */
export const ALLY_DEFS: Record<AllyKind, { icon: string; name: string; effect: string }> = {
  sprite: {
    icon: "⚡",
    name: "脚本精灵",
    effect: "每 3 秒对台前血量最低的非隐身敌人补 6 点伤害",
  },
  guard: {
    icon: "🎨",
    name: "样式守卫",
    effect: "在场期间全场敌人攻击 −15%",
  },
  bug: {
    icon: "💾",
    name: "缓存虫",
    effect: "每 5 秒 +1 内存（夹到上限）",
  },
}

/** 开援军面板 / 召唤的门槛（与 openTabPage 同口径）：普通层战斗中、非 Boss/管理员层、页未满 */
function canReinforce(state: RunState): boolean {
  return tabSystemActive(state) && (state.tabs?.length ?? 0) < TAB_MAX_EXTRA
}

/** 样式守卫是否在场（未冻结未崩溃的 guard 援军页）——enemyAttackAmount 的统一减伤乘区 */
function hasActiveGuard(state: RunState): boolean {
  return (state.tabs ?? []).some(
    (tab) => tab.ally === "guard" && !tab.frozen && !tab.crashed,
  )
}

/** 打开援军三选一浮层（打开即暂停战斗，与任务管理器同款语义）；内存不足直接给横幅不白开面板 */
function openAllyPick(prev: RunState): RunState {
  if (!canReinforce(prev)) return prev
  if (prev.memory < ALLY_COST) {
    const warned: RunState = { ...prev }
    pushBanner(warned, `内存不足 · 召唤援军要 ${ALLY_COST} 内存`)
    return warned
  }
  playSfx("pick")
  return {
    ...prev,
    phase: "overlay",
    overlayKind: "allyPick",
    lastActionAt: prev.now,
  }
}

/** 合上援军面板（不召唤）：没花钱，随时能再开 */
function dismissAllyPick(prev: RunState): RunState {
  if (prev.phase !== "overlay" || prev.overlayKind !== "allyPick") return prev
  playSfx("close")
  return {
    ...prev,
    phase: "fighting",
    overlayKind: "none",
    lastActionAt: prev.now,
  }
}

/**
 * 召唤援军：花 8 内存开一张空页住一个光环型友军。
 * 浮层内调用 → 引擎再校验一遍余额/页位，失败横幅不关面板；成功收口回战斗。
 * drainNextAt/crashNextAt 置位但永不结算（processTabPages 对 ally 页短路）。
 */
function summonAlly(prev: RunState, kind: AllyKind): RunState {
  if (prev.phase === "overlay" && prev.overlayKind === "allyPick") {
    /* 面板开着时战斗冻结、层情不变：只需复查页位 */
    if ((prev.tabs?.length ?? 0) >= TAB_MAX_EXTRA) return prev
  } else if (!canReinforce(prev)) {
    return prev
  }
  const state: RunState = { ...prev, pops: [...prev.pops] }
  if (trySpendMemory(state, ALLY_COST) === null) {
    pushBanner(state, `内存不足 · 召唤援军要 ${ALLY_COST} 内存`)
    return state
  }
  const id = state.nextTabPageId ?? 1
  state.nextTabPageId = id + 1
  const def = ALLY_DEFS[kind]
  state.tabs = [
    ...(state.tabs ?? []),
    {
      id,
      enemies: [],
      lockedUid: null,
      frozen: false,
      crashed: false,
      drainNextAt: state.now + TAB_MAINTAIN_MS,
      crashNextAt: state.now + TAB_CRASH_EVERY_MS,
      ally: kind,
      allyNextAt:
        kind === "guard"
          ? undefined
          : state.now + (kind === "sprite" ? ALLY_STRIKE_MS : ALLY_MEM_MS),
    },
  ]
  if (state.phase === "overlay") {
    state.phase = "fighting"
    state.overlayKind = "none"
  }
  state.lastActionAt = state.now
  playSfx("activate")
  pushBanner(state, `援军已就位 · 标签页 ${id}`)
  pushLog(state, `${def.icon} ${def.name}住进标签页 ${id} · ${def.effect}`)
  return state
}

/**
 * 援军计时结算（在 processTabPages 里、tabs 已克隆后调用；guard 纯被动不走这里）。
 * 补帧守卫与标签页同款：落后 >2 秒（长时间冻结后解冻等）直接推下一轮不追结。
 */
function processAllyEffect(state: RunState, tab: TabPage, now: number) {
  if (tab.ally === "guard") return
  const interval = tab.ally === "sprite" ? ALLY_STRIKE_MS : ALLY_MEM_MS
  let next = tab.allyNextAt ?? now + interval
  if (now - next > TAB_BG_CATCHUP_GUARD_MS) {
    tab.allyNextAt = now + interval
    return
  }
  let guard = 0
  while (now >= next && guard < 4) {
    guard += 1
    if (tab.ally === "bug") {
      next += ALLY_MEM_MS
      /* 夹到上限走 gainMemory 正常通道；音效用 pick（memorySpend 的反向轻音） */
      gainMemory(state, 1)
      playSfx("pick")
      continue
    }
    /* 脚本精灵：台前血量最低的非隐身存活敌（并列取列表序靠前者，零随机）；无目标顺延 1s 不打 */
    let target: EnemyInstance | null = null
    for (const enemy of state.enemies) {
      if (enemy.closing || enemy.hp <= 0 || enemy.hiddenUntil > state.now) continue
      if (!target || enemy.hp < target.hp) target = enemy
    }
    if (!target) {
      next = now + ALLY_STRIKE_RETRY_MS
      break
    }
    next += ALLY_STRIKE_MS
    tab.allyNextAt = next
    /* 与砸弹窗口径：固定 6 伤害、乘该敌 incomingDamageMult（hitEnemy 变异受伤收口内置）、
       走 hitEnemy 固定伤害通道 + 飘字；击杀走正常 killEnemy 全通道 */
    hitEnemy(state, target, ALLY_STRIKE_DMG, false)
    if (state.phase !== "fighting") break
  }
  tab.allyNextAt = next
}

/* ---- 核心体验包 v2（core-experience-pack2.md）二：缓存电池（层内超限蓄水池） ---- */

/** 打开缓存电池盒浮层（战斗中随时可开，打开即暂停战斗——与免费暂停同款语义） */
function openCacheBox(prev: RunState): RunState {
  if (prev.phase !== "fighting") return prev
  playSfx("pick")
  return {
    ...prev,
    phase: "overlay",
    overlayKind: "cache",
    lastActionAt: prev.now,
  }
}

/** 合上缓存电池盒 */
function dismissCacheBox(prev: RunState): RunState {
  if (prev.phase !== "overlay" || prev.overlayKind !== "cache") return prev
  playSfx("close")
  return {
    ...prev,
    phase: "fighting",
    overlayKind: "none",
    lastActionAt: prev.now,
  }
}

/**
 * 存入缓存：免费、每层 2 次、每格存 5。
 * 刻意不走 trySpendMemory——存入是搬运不是消耗，不计结算消耗、不响扣费音（走 pick）。
 */
function cacheDeposit(prev: RunState): RunState {
  if (prev.phase !== "overlay" || prev.overlayKind !== "cache") return prev
  if ((prev.cacheDepositLeft ?? 0) <= 0) return prev
  if ((prev.cacheSlots ?? []).length >= CACHE_MAX_SLOTS) return prev
  if (prev.memory < CACHE_PER) return prev
  const state: RunState = { ...prev }
  state.memory = prev.memory - CACHE_PER
  state.cacheSlots = [...(prev.cacheSlots ?? []), CACHE_PER]
  state.cacheDepositLeft = (prev.cacheDepositLeft ?? 0) - 1
  playSfx("pick")
  pushBanner(state, "存入缓存 5")
  pushLog(state, `存入缓存 5 · 本层还剩 ${(prev.cacheDepositLeft ?? 0) - 1} 次`)
  return state
}

/** 取出缓存：花 1 内存门票（trySpendMemory 正常扣费口径），数字加回内存且允许超上限 */
function cacheTake(prev: RunState, slotIdx: number): RunState {
  if (prev.phase !== "overlay" || prev.overlayKind !== "cache") return prev
  const slots = prev.cacheSlots ?? []
  const stored = slots[slotIdx] ?? 0
  if (stored <= 0) return prev
  const state: RunState = { ...prev }
  if (trySpendMemory(state, CACHE_TAKE_COST) === null) return state
  state.cacheSlots = slots.filter((_, index) => index !== slotIdx)
  /* 超限是新语义：不设 min(max)。区间判定与显示各自夹上限，维持费/偷内存照常从真实值扣 */
  state.memory = state.memory + stored
  playSfx("coin")
  pushBanner(state, `缓存取出 +${stored} · 可超限`)
  pushLog(state, `缓存取出 +${stored}（门票 ${CACHE_TAKE_COST} 内存）· 余额可短暂超过上限`)
  return state
}

/** 清空缓存：全格存量不返还，换一次性额外内存奖励（同样可超限） */
function cacheBurn(prev: RunState): RunState {
  if (prev.phase !== "overlay" || prev.overlayKind !== "cache") return prev
  const slots = (prev.cacheSlots ?? []).filter((value) => value > 0)
  if (slots.length === 0) return prev
  const state: RunState = { ...prev }
  state.cacheSlots = []
  state.memory = state.memory + CACHE_BURN_BONUS
  playSfx("close")
  pushBanner(state, `缓存清空 · 额外 +${CACHE_BURN_BONUS}`)
  pushLog(state, `缓存清空 · ${slots.length} 格存量换 ${CACHE_BURN_BONUS} 点额外内存（可超限）`)
  return state
}

/* ---- 核心体验包 v1（core-experience-pack.md）：双面回廊 / 跳转弹窗 / leak 偷内存 ---- */

/** 双面回廊：e 是不是 dead 的存活另一半（且没吃过狂暴）；是则返回狂暴后的新对象 */
function tryTwinRage(
  deadTwin: "front" | "back" | undefined,
  e: EnemyInstance,
): EnemyInstance | null {
  if (!deadTwin) return null
  const want = deadTwin === "back" ? "front" : "back"
  if (e.twin !== want || e.closing || e.twinRaged) return null
  return {
    ...e,
    attack: Math.max(1, Math.round(e.attack * TWIN_RAGE_MULT)),
    twinRaged: true,
  }
}

/**
 * 双面回廊：任一半死 → 另一半一次性攻击 ×1.5 + 横幅（幂等，靠 twinRaged 锁）。
 * 与 hitEnemy 同款「就地换组内对象」语义；搜索顺序：前台 → 后台页 → 主标签备份。
 */
function rageTwinPartner(state: RunState, dead: EnemyInstance) {
  if (!dead.twin) return
  let raged = false
  const one = (e: EnemyInstance): EnemyInstance => {
    const next = tryTwinRage(dead.twin, e)
    if (next) raged = true
    return next ?? e
  }
  state.enemies = state.enemies.map(one)
  if (!raged) {
    for (const tab of state.tabs ?? []) {
      if (raged) break
      tab.enemies = tab.enemies.map(one)
    }
  }
  if (!raged && state.mainBackup) {
    state.mainBackup.enemies = state.mainBackup.enemies.map(one)
  }
  if (raged) {
    pushBanner(state, "另一半狂暴了 · 攻击 +50%")
    pushLog(state, "双面广告失去了另一半 · 剩下的这只攻击 +50%")
  }
}

/**
 * 双面回廊：背面广告的跨页重击（前台 / 后台页 / 主备份三条通道共用）。
 * 不吃闪避与护盾（直落血条，与 Boss 分身爆发同口径）；休闲模式经 qtePenaltyMult 归零。
 * 本周期被玩家打过 → 打断：无伤 + 关闭音，只清旗不再落伤。
 */
function processTwinBurstGroup(
  state: RunState,
  enemies: EnemyInstance[],
  now: number,
) {
  for (const enemy of enemies) {
    if (enemy.closing) continue
    if (enemy.twin !== "back" || enemy.twinBurstNextAt == null) continue
    /* 补帧守卫：单帧落后 >2 秒不追打，直接推到下一轮 */
    if (now - enemy.twinBurstNextAt > TAB_BG_CATCHUP_GUARD_MS) {
      enemy.twinBurstNextAt = now + TWIN_BURST_MS
      enemy.twinHitThisCycle = false
      continue
    }
    let guard = 0
    while (now >= enemy.twinBurstNextAt && guard < 5) {
      guard += 1
      enemy.twinBurstNextAt += TWIN_BURST_MS
      if (enemy.twinHitThisCycle) {
        enemy.twinHitThisCycle = false
        playSfx("close")
        pushBanner(state, "背面的读条被你打断")
        pushLog(state, "你打断了背面广告的跨页蓄力 · 这次重击被撤回")
        continue
      }
      enemy.twinHitThisCycle = false
      const dmg = Math.round(TWIN_BURST_DMG * qtePenaltyMult(state.playMode))
      if (dmg > 0) {
        state.playerHp = Math.max(0, state.playerHp - dmg)
        state.tookDamage = true
        pushPop(state, "hurt", dmg)
        playSfx("jamBurst")
        pushBanner(state, "背面跨页重击")
        pushLog(state, `背面广告隔着标签页砸了过来 · 生命 -${dmg}（这一下闪不掉）`)
        if (state.playerHp <= 0) {
          state.phase = "dead"
          state.deadAt = now
          state.cause = "双面回廊 · 被背面广告的跨页重击耗干了"
          playSfx("lose")
          return
        }
      }
    }
  }
}

/**
 * leak 偷内存：每 3 秒从玩家真实可用内存里偷 1 点（不足按实际扣、归零为止），
 * stolenMem 恒 +1（攻击成长不停）。内存错位窗口 HUD 数字是假的，但 state.memory
 * 本身就是真值，按真值扣天然只偷真钱。击杀吐回在 killEnemy。
 */
function processLeakStealGroup(
  state: RunState,
  enemies: EnemyInstance[],
  now: number,
) {
  for (const enemy of enemies) {
    if (enemy.closing) continue
    if (enemy.defId !== "leak" || enemy.leakStealNextAt == null) continue
    if (now - enemy.leakStealNextAt > TAB_BG_CATCHUP_GUARD_MS) {
      enemy.leakStealNextAt = now + LEAK_STEAL_MS
      continue
    }
    let guard = 0
    while (now >= enemy.leakStealNextAt && guard < 5) {
      guard += 1
      enemy.leakStealNextAt += LEAK_STEAL_MS
      if (state.memory > 0) {
        state.memory = Math.max(0, state.memory - 1)
        state.memorySpent += 1
        playSfx("memorySpend")
      }
      enemy.stolenMem = (enemy.stolenMem ?? 0) + 1
      if ((enemy.stolenMem ?? 0) >= LEAK_OVERFLOW_AT && !enemy.leakOverflowShown) {
        enemy.leakOverflowShown = true
        pushBanner(state, "内存泄漏 · 溢出！攻击翻倍")
        pushLog(state, `${enemy.displayName} 吃撑了 · 偷到的内存溢出，攻击翻倍`)
      }
    }
  }
}

/**
 * 跳转弹窗：每 8 秒把一个到点的「正主」弹窗挪进 id 最小的未冻结未崩溃后台页。
 * 没有可落后台页 → 顺延 2 秒。落地 3 秒攻击 ×1.3（enemyAttackAmount 统一乘区）。
 * 三个来源：台前组、后台页、主标签备份；冻结页永不作落点。
 */
function processPopupJumps(state: RunState, now: number) {
  const landing = (enemy: EnemyInstance, target: TabPage) => {
    enemy.jumpNextAt = now + JUMP_INTERVAL_MS
    enemy.jumpBuffUntil = now + JUMP_BUFF_MS
    enemy.telegraphUntil = 0
    enemy.bgNextAttackAt =
      now +
      Math.max(
        400,
        Math.round(enemyInterval(state, enemy) * TAB_BG_INTERVAL_MULT),
      )
    target.enemies = [...target.enemies, enemy]
    if (target.lockedUid === enemy.uid) target.lockedUid = null
    playSfx("pick")
    pushLog(state, `一个弹窗跳进了标签页 ${target.id}`)
  }
  const pickTarget = (exclude?: TabPage) =>
    (state.tabs ?? [])
      .filter((tab) => tab !== exclude && !tab.frozen && !tab.crashed)
      .sort((a, b) => a.id - b.id)[0]

  /* 台前组：新鲜到点的弹窗摘出来找落点；落后 >2 秒只重置钟 */
  const movers: EnemyInstance[] = []
  const stay = state.enemies.filter((enemy) => {
    if (enemy.jumpNextAt == null || enemy.closing) return true
    if (now < enemy.jumpNextAt) return true
    if (now - enemy.jumpNextAt > TAB_BG_CATCHUP_GUARD_MS) {
      enemy.jumpNextAt = now + JUMP_INTERVAL_MS
      return true
    }
    movers.push(enemy)
    return false
  })
  if (movers.length > 0) {
    state.enemies = stay
    retarget(state)
  }
  for (const mover of movers) {
    const target = pickTarget()
    if (target) landing(mover, target)
    else mover.jumpNextAt = now + JUMP_RETRY_MS
  }

  /* 后台页之间：冻结 / 崩溃页不作落点；自己所在页排除 */
  for (const tab of state.tabs ?? []) {
    const due: EnemyInstance[] = []
    tab.enemies = tab.enemies.filter((enemy) => {
      if (enemy.jumpNextAt == null || enemy.closing || now < enemy.jumpNextAt) {
        return true
      }
      if (now - enemy.jumpNextAt > TAB_BG_CATCHUP_GUARD_MS) {
        enemy.jumpNextAt = now + JUMP_INTERVAL_MS
        return true
      }
      due.push(enemy)
      return false
    })
    if (due.length > 0) {
      if (tab.lockedUid && !tab.enemies.some((e) => e.uid === tab.lockedUid)) {
        tab.lockedUid = null
      }
      for (const mover of due) {
        const target = pickTarget(tab)
        if (target) landing(mover, target)
        else mover.jumpNextAt = now + JUMP_RETRY_MS
      }
    }
  }

  /* 主标签备份 */
  if (state.mainBackup) {
    const backupDue: EnemyInstance[] = []
    state.mainBackup.enemies = state.mainBackup.enemies.filter((enemy) => {
      if (enemy.jumpNextAt == null || enemy.closing || now < enemy.jumpNextAt) {
        return true
      }
      if (now - enemy.jumpNextAt > TAB_BG_CATCHUP_GUARD_MS) {
        enemy.jumpNextAt = now + JUMP_INTERVAL_MS
        return true
      }
      backupDue.push(enemy)
      return false
    })
    for (const mover of backupDue) {
      const target = pickTarget()
      if (target) landing(mover, target)
      else mover.jumpNextAt = now + JUMP_RETRY_MS
    }
  }
}

/* ---- 内核包 v2（任务管理器）：浏览器最标志性的窗口变成玩家每层一次的决策 ---- */

/** 操作类型：结束残血进程 / 限制出手 / 优化自己攻速 / 回收后台内存 */
export type TaskActionKind = "end" | "throttle" | "boost" | "reclaim" | "defrag"

function taskmgrAvailable(state: RunState): boolean {
  return (
    tabSystemActive(state) &&
    (state.taskmgrUsedFloor ?? 0) !== state.floor &&
    state.memory >= TASKMGR_OPEN_COST_MEMORY
  )
}

/** 打开任务管理器：普通层战斗、本层没用过、花 2 内存；打开即暂停战斗 */
function openTaskManager(prev: RunState): RunState {
  if (!taskmgrAvailable(prev)) return prev
  const state: RunState = { ...prev }
  if (trySpendMemory(state, TASKMGR_OPEN_COST_MEMORY) === null) return prev
  state.phase = "overlay"
  state.overlayKind = "taskmgr"
  playSfx("taskmgrOpen")
  pushLog(state, "任务管理器 · 战斗暂停，挑一个进程动手")
  return state
}

/** 直接合上（不选操作）：门票内存不退，但本层的次数还在，攒够 2 内存能再开 */
function dismissTaskManager(prev: RunState): RunState {
  if (prev.phase !== "overlay" || prev.overlayKind !== "taskmgr") return prev
  playSfx("close")
  return {
    ...prev,
    phase: "fighting",
    overlayKind: "none",
    lastActionAt: prev.now,
  }
}

/** 执行一条进程操作并合上管理器：选完 = 本层次数用掉 */
function applyTaskAction(
  prev: RunState,
  kind: TaskActionKind,
  uid: string | null,
): RunState {
  if (prev.phase !== "overlay" || prev.overlayKind !== "taskmgr") return prev
  const state: RunState = {
    ...prev,
    enemies: prev.enemies.map(cloneEnemy),
    pops: [...prev.pops],
  }
  const finish = () => {
    state.taskmgrUsedFloor = prev.floor
    state.phase = "fighting"
    state.overlayKind = "none"
    state.lastActionAt = state.now
  }
  if (kind === "boost") {
    state.taskHasteUntil = state.now + TASKMGR_BOOST_MS
    finish()
    playSfx("taskBoost")
    pushLog(state, "优化「攻击.exe」· 8 秒内出手快 15%")
    return state
  }
  if (kind === "reclaim") {
    gainMemory(state, TASKMGR_RECLAIM_MEMORY)
    finish()
    pushLog(state, `回收后台进程 · 内存 +${TASKMGR_RECLAIM_MEMORY}`)
    return state
  }
  /* 深化包·磁盘整理：清空全部碎片，占用本层唯一一次动手机会（与其它操作互斥） */
  if (kind === "defrag") {
    if ((state.memFrags ?? 0) <= 0) return prev
    clearMemFrags(state)
    finish()
    playSfx("memoryGain")
    pushLog(state, "磁盘整理 · 碎片清零，下次进层回满的水位更高了")
    return state
  }
  const enemy = state.enemies.find(
    (item) => item.uid === uid && !item.closing,
  )
  if (!enemy) return prev
  if (kind === "end") {
    if (
      enemy.maxHp <= 0 ||
      enemy.hp / enemy.maxHp > TASKMGR_END_HP_RATIO
    ) {
      const nag: RunState = { ...prev }
      pushTip(nag, "结束任务只对残血（≤25%）进程有效")
      return nag
    }
    /* 走正常击杀通道：掉落、台词、词条联动全照常；专属闷响叠在击杀音上做「回收感」 */
    killEnemy(state, enemy)
    playSfx("taskEnd")
    finish()
    pushLog(state, `结束进程「${enemy.displayName}」· 当场回收`)
    return state
  }
  /* throttle：intervalMult 越小出手越慢，除以 2 = 间隔翻倍（本层永久） */
  enemy.intervalMult = Math.max(
    0.05,
    enemy.intervalMult / TASKMGR_THROTTLE_DIV,
  )
  finish()
  playSfx("taskThrottle")
  pushLog(state, `限制「${enemy.displayName}」· 本层出手速度减半`)
  return state
}

/* ---- 表现包（动作与场景设计）：震屏 + 手动斩杀 ---- */

/** 屏幕震动：seq 递增让 View 交替动画类名，连续触发也能重放 */
function triggerShake(state: RunState, px: number) {
  state.shakeSeq = (state.shakeSeq ?? 0) + 1
  state.shakePx = px
  state.shakeUntil = state.now + SHAKE_MS
}

/** 手动斩杀：血骷髅标记（普通敌人 ≤20% 血）点击，3 内存当场关闭 */
function executeEnemy(prev: RunState, uid: string): RunState {
  if (prev.phase !== "fighting") return prev
  const state: RunState = { ...prev, enemies: prev.enemies.map(cloneEnemy) }
  const enemy = state.enemies.find((item) => item.uid === uid && !item.closing)
  if (!enemy || enemy.kind === "boss" || enemy.kind === "bigboss" || enemy.admin)
    return prev
  if (
    enemy.maxHp <= 0 ||
    enemy.hp / enemy.maxHp > EXECUTE_HP_RATIO
  ) {
    return prev
  }
  if (trySpendMemory(state, EXECUTE_MEMORY_COST) === null) return prev
  killEnemy(state, enemy)
  playSfx("execute")
  triggerShake(state, 6)
  pushLog(state, `斩杀执行 · 强行关闭「${enemy.displayName}」`)
  return state
}

/** 内存超频入口是否可用：战斗中、本层没用过、内存 ≥6 且不在耗尽区（QTE 期间禁用） */
function overclockAvailable(state: RunState): boolean {
  return (
    state.phase === "fighting" &&
    !state.paused &&
    !state.qte &&
    (state.ocUsedFloor ?? 0) !== state.floor &&
    state.memory >= OC_MIN_MEM &&
    state.memory / Math.max(1, state.maxMemory) >= MEMORY_EXHAUSTED_RATIO
  )
}

/**
 * 内存超频（深化包二）：立即 -3 内存，换 8 秒爆发（区间惩罚与卡顿全按稳定处理、
 * 攻速 +20%、主动技内存费减半），随后 10 秒过热惩罚（强制卡顿区 + 崩出 3 块碎片）。
 * 每层一次；爆发/惩罚的收尾结算挂在 advance 的跨点检测上。
 */
function useOverclock(prev: RunState): RunState {
  if (!overclockAvailable(prev)) return prev
  const state: RunState = { ...prev, pops: [...prev.pops] }
  if (trySpendMemory(state, OC_MEM_COST) === null) return prev
  state.ocUsedFloor = prev.floor
  state.ocUntil = state.now + OC_BURST_MS
  state.ocPenaltyUntil = state.now + OC_BURST_MS + OC_PENALTY_MS
  state.ocCount = (state.ocCount ?? 0) + 1
  playSfx("activate")
  pushBanner(state, "⚡ 内存超频 · 8 秒火力全开")
  pushLog(state, "内存超频 · 8 秒火力全开，之后有 10 秒过热")
  if (!state.coachOcDone) {
    state.coachOcDone = true
    pushTip(state, "超频透支之后会更卡 · 挑决战前用")
  }
  return state
}

/**
 * 病毒引爆（深化包三）：花 2 内存对携带者造成 40 点固定伤害，
 * 并把相邻存活敌人的 1 个可变异标签传染反转。非阻塞、无确认、500ms 防误触。
 */
function detonateVirus(prev: RunState, uid: string): RunState {
  if (prev.phase !== "fighting" || prev.paused || prev.qte) return prev
  if (prev.now - (prev.lastDetonateAt ?? 0) < DETONATE_LOCK_MS) return prev
  if (!prev.enemies.some((item) => item.uid === uid && !item.closing && item.tags.includes("virus")))
    return prev
  const state: RunState = {
    ...prev,
    enemies: prev.enemies.map(cloneEnemy),
    pops: [...prev.pops],
  }
  const carrier = state.enemies.find(
    (item) => item.uid === uid && !item.closing && item.tags.includes("virus"),
  )
  if (!carrier) return prev
  if (trySpendMemory(state, VIRUS_DETONATE_MEM_COST) === null) {
    pushBanner(state, `内存不足 · 引爆要 ${VIRUS_DETONATE_MEM_COST} 内存`)
    return state
  }
  state.lastDetonateAt = state.now
  /* 1) 携带者吃 40 固定伤（不吃暴击与词条加伤；受伤乘区照常收口） */
  const dmg = Math.max(
    1,
    Math.round(VIRUS_DETONATE_DAMAGE * (carrier.incomingDamageMult ?? 1)),
  )
  carrier.hp = Math.max(0, carrier.hp - dmg)
  pushPop(state, "hit", dmg)
  pushLog(state, `🦠 病毒引爆 · 「${carrier.displayName}」受到 ${dmg} 点伤害`)
  if (carrier.hp <= 0) killEnemy(state, carrier)
  /* 2) 相邻存活敌人（列表前后各 1 位，跳过已死 / 管理员 / Boss）随机感染 1 个标签 */
  const alive = (e: EnemyInstance) =>
    !e.closing && e.hp > 0 && !e.admin && e.kind !== "boss" && e.kind !== "bigboss"
  const index = state.enemies.findIndex((item) => item.uid === uid)
  const pool = [state.enemies[index - 1], state.enemies[index + 1]].filter(
    (e): e is EnemyInstance => Boolean(e) && alive(e as EnemyInstance),
  )
  const spreadable = pool.filter((e) => mutableTagsOf(e).length > 0)
  if (spreadable.length === 0) {
    pushLog(state, "病毒扑了个空 · 附近没有可传染的目标")
    return state
  }
  const victim =
    spreadable[Math.floor(Math.random() * spreadable.length)]
  const options = mutableTagsOf(victim)
  const tag = options[Math.floor(Math.random() * options.length)]
  applyVirusMutation(state, victim, tag)
  const tagName = ENEMY_TAG_DEFS[tag as keyof typeof ENEMY_TAG_DEFS]?.name ?? tag
  pushLog(
    state,
    `病毒顺着数据线爬进「${victim.displayName}」：「${tagName}」变异了`,
  )
  return state
}

/**
 * 点击敌人：点非锁定目标 → 切锁（0.5 秒防误触，与 ←→ 共用）；
 * 点当前锁定目标 → 手动追加 1 点固定伤害（不吃暴击、不触发命中词条）+ 叠 1 层点击连击。
 */
function clickEnemyTapCap(hasEventListener: boolean): number {
  return hasEventListener ? CLICK_COMBO_MAX_BOOSTED : CLICK_COMBO_MAX
}

function lockEnemy(state: RunState, uid: string): RunState {
  if (state.phase !== "fighting") return state
  const enemy = state.enemies.find(
    (item) => item.uid === uid && !item.closing && item.hiddenUntil <= state.now,
  )
  if (!enemy) return state

  /* 点的是别的敌人：切锁，走 0.5 秒防误触 */
  if (enemy.uid !== state.lockedUid) {
    if (state.now - state.lastLockAt < LOCK_SWITCH_MS) return state
    const next: RunState = {
      ...state,
      lockedUid: uid,
      lockedButtonId:
        enemy.kind === "boss"
          ? (enemy.buttons.find((button) => !button.closed)?.id ?? null)
          : null,
      lastActionAt: state.now,
      lastLockAt: state.now,
    }
    if (!next.coachClickTargetDone) {
      next.coachClickTargetDone = true
      pushTip(next, "点击敌人可切换目标，点已锁定的敌人则是手动补刀")
    }
    playSfx("switch")
    return next
  }

  /* 点的就是当前锁定目标：手动补刀 + 叠点击连击，每秒最多 5 次有效 */
  let windowStart = state.clickTapWindowStart
  let tapCount = state.clickTapCount
  if (state.now - windowStart >= 1000) {
    windowStart = state.now
    tapCount = 0
  }
  if (tapCount >= CLICK_TAP_MAX_PER_SEC) return state
  tapCount += 1

  const hasEventListener = state.relics.some(
    (relic) => relic.id === CLICK_COMBO_EVENT_LISTENER_ID,
  )
  const cap = clickEnemyTapCap(hasEventListener)

  const next: RunState = {
    ...state,
    enemies: state.enemies.map(cloneEnemy),
    pops: [...state.pops],
    lastActionAt: state.now,
    clickTapWindowStart: windowStart,
    clickTapCount: tapCount,
  }
  /* v2「所有操作都有成本」：每次手动补刀扣 0.5 内存，不足则这一下无效（不扣费、不叠连击） */
  if (trySpendMemory(next, MEMORY_COMBO_CLICK_COST) === null) return state
  const target = next.enemies.find((item) => item.uid === uid)
  if (target) {
    /* 1 点固定伤害：直接结算，不经 playerAttack，故不吃暴击 / 不触发监听 / 不同步词条 */
    hitEnemy(next, target, CLICK_TAP_DAMAGE, false)
    if (next.phase !== "fighting") return next
    if (next.clickCombo < cap) {
      const before = next.clickCombo
      next.clickCombo = before + 1
      next.clickComboExpireAt = state.now + CLICK_COMBO_DECAY_MS
      if (next.clickCombo >= cap) {
        playSfx("comboMax")
      } else {
        playComboStackSfx(next.clickCombo)
      }
    } else {
      /* 已在上限：续上衰减计时，不叠更高 */
      next.clickComboExpireAt = state.now + CLICK_COMBO_DECAY_MS
    }
  }
  return next
}

function lockBossButton(state: RunState, buttonId: string): RunState {
  const boss = activeBoss(state)
  if (!boss || boss.closing || boss.boss?.phase !== 1) return state
  if (!boss.buttons.some((button) => button.id === buttonId && !button.closed)) {
    return state
  }
  return {
    ...state,
    lockedUid: boss.uid,
    lockedButtonId: buttonId,
    lastActionAt: state.now,
  }
}

/** 第 6 层：点对图案 → 全体敌人破防 3 秒，受到的伤害 +50% */
function succeedChallenge(state: RunState) {
  const until = state.now + CAPTCHA_BREAK_MS
  /* 批次二：不再只破「带盾」的验证码敌人，全体非倒下敌人都吃这一破防 */
  state.enemies.forEach((enemy) => {
    if (enemy.closing) return
    enemy.brokenUntil = until
  })
  pushLog(state, "图案点对了 · 全体敌人破防 3 秒，受伤 +50%")
  pushBanner(state, "验证通过！破防 3 秒")
  playSfx("perfect")
}

/** 第 6 层：点错或超时 → 全体敌人下一次攻击 +100%；休闲模式按密度表降级为可选、不罚 */
function failChallenge(state: RunState) {
  if (state.playMode === "casual") {
    pushLog(state, "休闲模式 · 验证没过，但没有惩罚")
    pushBanner(state, "验证失败（休闲模式无惩罚）")
    return
  }
  /* 验证码迷宫路线：点错直接狂暴（攻击永久 ×2，每只只爆一次）；其余场合维持下一击 +100% */
  if (state.activeRouteId === "captcha-maze") {
    state.enemies.forEach((enemy) => {
      if (enemy.closing || enemy.enraged) return
      enemy.enraged = true
      enemy.attack *= 2
    })
    pushLog(state, "图案点错了 · 敌人狂暴，攻击翻倍！")
  } else {
    state.enemies.forEach((enemy) => {
      if (enemy.closing) return
      enemy.pendingAttackMult = Math.max(
        enemy.pendingAttackMult,
        CAPTCHA_FAIL_ATTACK_MULT,
      )
    })
    pushLog(state, "图案点错了 · 全体敌人下一击 +100%")
  }
  pushBanner(state, "验证失败！敌人狂暴")
  playSfx("hit")
}

/** 第 6 层：点屏幕中央的图案 */
function applyChallengePick(state: RunState, symbol: string): RunState {
  if (state.phase !== "fighting" || !state.challenge) return state
  if (state.challenge.result !== "pending") return state

  const now = state.now
  const hit = symbol === state.challenge.answer
  const next: RunState = {
    ...state,
    enemies: state.enemies.map(cloneEnemy),
    pops: [...state.pops],
    challenge: {
      ...state.challenge,
      result: hit ? "hit" : "miss",
      resultUntil: now + 700,
    },
    lastActionAt: now,
  }
  if (hit) succeedChallenge(next)
  else failChallenge(next)
  return next
}

/** Boss 强制观看：点掉跳过按钮，这一下躲过去 */
function applyBossSkip(state: RunState): RunState {
  if (state.phase !== "fighting" || !state.bossClick) return state
  const next: RunState = {
    ...state,
    pops: [...state.pops],
    bossClick: null,
    lastActionAt: state.now,
  }
  pushLog(next, "点掉了跳过按钮 · 这次躲过去了")
  playSfx("pick")
  return next
}

/* ------------------------------------------------------------------ *
 * 暂停：冻结战斗，恢复时把各种计时整体往后推
 * ------------------------------------------------------------------ */

function shiftRunTime(state: RunState, delta: number): RunState {
  if (delta <= 0) return state
  const sh = (value: number) => (value > 0 ? value + delta : value)

  const enemies = state.enemies.map((enemy) => {
    const next = cloneEnemy(enemy)
    next.nextAttackAt = sh(next.nextAttackAt)
    next.telegraphUntil = sh(next.telegraphUntil)
    next.regenNextAt = sh(next.regenNextAt)
    next.regenFlashUntil = sh(next.regenFlashUntil)
    next.shieldRegenNextAt = sh(next.shieldRegenNextAt)
    next.pausedUntil = sh(next.pausedUntil)
    next.hiddenUntil = sh(next.hiddenUntil)
    next.brokenUntil = sh(next.brokenUntil)
    next.hitAt = sh(next.hitAt)
    next.closedAt = sh(next.closedAt)
    /* C4 过渡动画给敌人挂的攻速减半窗口也随暂停顺延 */
    next.attackSlowUntil = sh(next.attackSlowUntil)
    /* 弹窗干扰包：吐糊屏弹窗的计时器也随暂停/顿帧顺延 */
    if (next.jamNextAt) next.jamNextAt = sh(next.jamNextAt)
    /* 拟物化战斗包：弱点 × 冷却钟同款——存在才 sh */
    if (next.weakCdUntil) next.weakCdUntil = sh(next.weakCdUntil)
    /* 核心体验包 v1：跨页重击 / 跳转 / 落地强化 / 偷内存四个计时钟同款 */
    if (next.twinBurstNextAt) next.twinBurstNextAt = sh(next.twinBurstNextAt)
    if (next.jumpNextAt) next.jumpNextAt = sh(next.jumpNextAt)
    if (next.jumpBuffUntil) next.jumpBuffUntil = sh(next.jumpBuffUntil)
    if (next.leakStealNextAt) next.leakStealNextAt = sh(next.leakStealNextAt)
    if (next.boss) {
      next.boss.skills = next.boss.skills.map((skill) => ({
        ...skill,
        nextReadyAt: sh(skill.nextReadyAt),
      }))
      if (next.boss.pending) {
        next.boss.pending = {
          ...next.boss.pending,
          telegraphUntil: sh(next.boss.pending.telegraphUntil),
        }
      }
    }
    return next
  })

  return {
    ...state,
    now: state.now + delta,
    startedAt: sh(state.startedAt),
    lastActionAt: sh(state.lastActionAt),
    lastAttackAt: sh(state.lastAttackAt),
    nextAutoAt: sh(state.nextAutoAt),
    activeReadyAt: sh(state.activeReadyAt),
    dodgeReadyAt: sh(state.dodgeReadyAt),
    dodgeUntil: sh(state.dodgeUntil),
    immuneReadyAt: sh(state.immuneReadyAt),
    hurtHasteUntil: sh(state.hurtHasteUntil),
    hurtDodgeUntil: sh(state.hurtDodgeUntil),
    dodgeHasteUntil: sh(state.dodgeHasteUntil),
    activeHasteUntil: sh(state.activeHasteUntil),
    doubleStrikeUntil: sh(state.doubleStrikeUntil),
    multithreadUntil: sh(state.multithreadUntil),
    freezeUntil: sh(state.freezeUntil),
    /* 深化包：超频爆发/惩罚与碎片钟随暂停冻结顺延（0 = 没有该窗口，保持 0） */
    ocUntil: sh(state.ocUntil ?? 0),
    ocPenaltyUntil: sh(state.ocPenaltyUntil ?? 0),
    memFragNextAt: sh(state.memFragNextAt ?? 0),
    nextIdleHealAt: sh(state.nextIdleHealAt),
    /* v2：卡顿累积计时器是时间戳，暂停冻结要跟着顺延（0 = 不在累积期，保持 0） */
    memStallSince: state.memStallSince === 0 ? 0 : sh(state.memStallSince),
    memStallDrainNextAt:
      state.memStallDrainNextAt === 0 ? 0 : sh(state.memStallDrainNextAt),
    offlineReadyAt: sh(state.offlineReadyAt),
    attackLockedUntil: sh(state.attackLockedUntil),
    hiddenNextAt: sh(state.hiddenNextAt),
    bossDeadline: sh(state.bossDeadline),
    challengeNextAt: sh(state.challengeNextAt),
    bossSpeedCutUntil: sh(state.bossSpeedCutUntil),
    bossFlashUntil: sh(state.bossFlashUntil),
    bossStunUntil: sh(state.bossStunUntil),
    /* 浏览器特性包 v1：分身读条的钟随冻结顺延（存在才 sh） */
    bossCloneCastUntil:
      state.bossCloneCastUntil === undefined
        ? undefined
        : sh(state.bossCloneCastUntil),
    /* HUD 构筑包·缓存复用钟随冻结/暂停顺延（存在才 sh） */
    hudRegenNextAt:
      state.hudRegenNextAt === undefined ? undefined : sh(state.hudRegenNextAt),
    qteAttackCutUntil: sh(state.qteAttackCutUntil),
    shardPulseAt: sh(state.shardPulseAt),
    /* 批次 B 新机制的时间戳：暂停时一并冻结顺延（relic-redesign.md 通用要求） */
    debounceUntil: sh(state.debounceUntil),
    blockUntil: sh(state.blockUntil),
    decoyUntil: sh(state.decoyUntil),
    transitionUntil: sh(state.transitionUntil),
    throttleNextAt: sh(state.throttleNextAt),
    closureEcho: state.closureEcho
      ? { ...state.closureEcho, until: sh(state.closureEcho.until) }
      : null,
    miniShields: state.miniShields.map((mini) => ({
      ...mini,
      bornAt: sh(mini.bornAt),
      arriveAt: sh(mini.arriveAt),
    })),
    challenge: state.challenge
      ? {
          ...state.challenge,
          startedAt: sh(state.challenge.startedAt),
          expiresAt: sh(state.challenge.expiresAt),
          resultUntil: sh(state.challenge.resultUntil),
        }
      : null,
    bossClick: state.bossClick
      ? { ...state.bossClick, expiresAt: sh(state.bossClick.expiresAt) }
      : null,
    pops: state.pops.map((pop) => ({ ...pop, at: pop.at + delta })),
    /* 弹窗干扰包：糊屏弹窗的存在与爆炸时刻随冻结顺延（超调 >2s 会在 advance 里静默消失） */
    screenJam: state.screenJam
      ? {
          ...state.screenJam,
          spawnAt: sh(state.screenJam.spawnAt),
          explodeAt: sh(state.screenJam.explodeAt),
        }
      : null,
    /* 核心体验包 v2：援军计时钟随暂停/顿帧顺延（存在才 sh；其余标签页计时走补帧守卫旧口径） */
    tabs: state.tabs?.some((tab) => tab.allyNextAt)
      ? state.tabs.map((tab) =>
          tab.allyNextAt ? { ...tab, allyNextAt: sh(tab.allyNextAt) } : tab,
        )
      : state.tabs,
    enemies,
  }
}

function setPaused(state: RunState, paused: boolean): RunState {
  if (state.phase !== "fighting") return state
  if (paused === state.paused) return state
  if (paused) {
    return { ...state, paused: true, pauseStartedAt: Date.now() }
  }
  const delta = Math.max(0, Date.now() - state.pauseStartedAt)
  return shiftRunTime({ ...state, paused: false, pauseStartedAt: 0 }, delta)
}

function rerollChoices(state: RunState): RunState {
  if (state.phase !== "relic" || state.rerollsLeft <= 0) return state
  return {
    ...state,
    choices: pickRelicChoices(
      state,
      `relic:${state.floor}:free${state.rerollsLeft}`,
      state.relics,
      BASE_CHOICE_COUNT + state.mods.extraChoiceCount,
    ),
    relicPickIndex: 0,
    pendingRelic: null,
    rerollsLeft: state.rerollsLeft - 1,
  }
}

/** 付费刷新：−15 局内碎片重抽三选一，每层限 1 次，效果与免费刷新相同 */
function paidRerollChoices(state: RunState): RunState {
  if (state.phase !== "relic") return state
  if (state.floorPaidRerollUsed || state.shards < PAID_REROLL_COST) return state
  const choices = pickRelicChoices(
    state,
    `relic:${state.floor}:paid`,
    state.relics,
    BASE_CHOICE_COUNT + state.mods.extraChoiceCount,
  )
  const next: RunState = {
    ...state,
    shards: state.shards - PAID_REROLL_COST,
    choices,
    relicPickIndex: 0,
    pendingRelic: null,
    floorPaidRerollUsed: true,
    pops: [...state.pops],
  }
  pushLog(next, `付费刷新 · 花掉 ${PAID_REROLL_COST} 碎片重抽三选一`)
  playSfx("pick")
  return next
}

/** 选完词条：Cookie 会给一次额外三选一，否则进下一层 */
/** 批次 B 教学：刚拿到的词条需要一句机制讲解（拿到即教、一局通常各只拿一次）。
 * 说明：不额外加去重 flag——重复拿到同名机制词条本身极罕见（词条池去重 + 换词条才复现）。 */
function teachNewMechanicRelic(next: RunState, picked: Relic) {
  switch (picked.id) {
    case "event-listener":
      pushTip(next, "事件监听 · 普攻命中后弹射下一个敌人，每次弹射耗 1 内存")
      break
    case "callback-hell":
      pushTip(next, "回调地狱 · 弹射再多跳 2 次，每跳伤害递减、每跳都要内存")
      break
    case "promise-chain":
      pushTip(next, "Promise 链 · 连续命中 5 次后，下一发普攻横扫全场（耗 3 内存）")
      break
    default:
      break
  }
}

function finishRelicPick(
  state: RunState,
  relics: Relic[],
  picked: Relic,
): RunState {
  /* 选完就进下一层，修正值表按下一层的成长重算 */
  const mods = buildMods(state.character, relics, state.floor + 1, extrasOf(state))
  playSfx("pick")
  const gained = picked.effect.bonusPickRounds ?? 0
  const queue = state.freePickQueue + gained

  if (queue > 0) {
      const next: RunState = {
    ...state,
    relics,
    mods,
    freePickQueue: queue - 1,
    pendingRelic: null,
    relicPickIndex: 0,
    phase: "relic",
    choices: pickRelicChoices(
      state,
      `relic:${state.floor}:extra${queue}`,
      relics,
      BASE_CHOICE_COUNT + mods.extraChoiceCount,
    ),
    rerollsLeft: BASE_REROLL_PER_FLOOR + mods.rerollPerFloor + state.bonusReroll,
  }
  pushLog(next, "Cookie · 本层多给一次三选一")
  teachNewMechanicRelic(next, picked)
  return next
  }

  /* 三选一走完：不直接进层，先选去下一层的路 */
  const routed = rollRouteChoices({ ...state, relics, mods })
  teachNewMechanicRelic(routed, picked)
  return routed
}

function applyRelicChoice(state: RunState, relic: Relic): RunState {
  if (state.phase !== "relic") return state

  if (state.relics.length < relicSlotCap(state)) {
    return finishRelicPick(state, [...state.relics, relic], relic)
  }

  if (!state.pendingRelic) return { ...state, pendingRelic: relic }
  return state
}

function applyRelicReplace(state: RunState, slotId: string): RunState {
  if (state.phase !== "relic" || !state.pendingRelic) return state
  const incoming = state.pendingRelic
  const relics = state.relics.map((relic) =>
    relic.id === slotId ? incoming : relic,
  )
  return finishRelicPick({ ...state, pendingRelic: null }, relics, incoming)
}

/** 跳过三选一：回 15 生命（可花 10 碎片升到 25），不拿词条，直接进下一层 */
function skipRelicPhase(state: RunState, upgrade: boolean): RunState {
  if (state.phase !== "relic" || state.pendingRelic) return state
  if (upgrade && state.shards < SKIP_HEAL_UPGRADE_COST) return state
  const next: RunState = {
    ...state,
    pops: [...state.pops],
    freePickQueue: 0,
    pendingRelic: null,
    relicPickIndex: 0,
  }
  const amount = upgrade ? SKIP_HEAL_UPGRADE_AMOUNT : RELIC_SKIP_HEAL
  if (upgrade) {
    next.shards = state.shards - SKIP_HEAL_UPGRADE_COST
    pushLog(
      next,
      `跳过这层词条 · 花 ${SKIP_HEAL_UPGRADE_COST} 碎片升级回复，回 ${amount} 点生命`,
    )
  } else {
    pushLog(next, `跳过这层词条 · 回复 ${amount} 点生命`)
  }
  healPlayer(next, amount)
  playSfx("pick")
  /* M4 内存泄漏（批次 C）：memoryMax 的「每层 -1」按层号在 buildMods 里算，
     跳过直接进层时也要按新层重建修正表，否则本层上限不降 */
  const mods = buildMods(state.character, state.relics, next.floor + 1, extrasOf(state))
  return rollRouteChoices({ ...next, mods })
}

/**
 * N6 超时重试（relic-redesign.md B·N6，批次 C）：金色刷新按钮的独立通道——
 * trySpendMemory(3)（不足不触发并提示），每层 1 次，不占免费 / 付费刷新次数；
 * 结果必出稀有以上：复用 pickRelicChoices 的 forceRare 保底通道
 * （三张里没有任何稀有+时随机塞一张，即「至少 1 张 rare+」）。
 */
function timeoutRetryChoices(state: RunState): RunState {
  if (state.phase !== "relic" || state.pendingRelic) return state
  if (!ownsRelic(state, "timeout-retry")) return state
  if (state.timeoutRetryUsedThisFloor) return state
  const next: RunState = { ...state, pops: [...state.pops] }
  if (trySpendMemory(next, TIMEOUT_RETRY_MEMORY_COST) === null) {
    pushBanner(next, "超时重试 · 内存不足")
    return next
  }
  next.choices = pickRelicChoices(
    next,
    `relic:${next.floor}:retry`,
    next.relics,
    BASE_CHOICE_COUNT + next.mods.extraChoiceCount,
    next.mods.rerollForceRare > 0 ? "rare" : undefined,
  )
  next.relicPickIndex = 0
  next.pendingRelic = null
  next.timeoutRetryUsedThisFloor = true
  pushLog(
    next,
    `超时重试 · 花 ${TIMEOUT_RETRY_MEMORY_COST} 内存重抽，本次必出稀有以上`,
  )
  playSfx("activate")
  return next
}

/**
 * G2 热更新（relic-redesign.md B·G2，批次 C）：每局 1 次的手动刷新，
 * trySpendMemory(2)（不足不触发并提示），不占免费 / 付费刷新次数账。
 */
function hotReloadReroll(state: RunState): RunState {
  if (state.phase !== "relic" || state.pendingRelic) return state
  if (!ownsRelic(state, "hot-reload")) return state
  if (state.mods.freeRerollOnce <= 0) return state
  if (state.hotReloadUsedThisRun) return state
  const next: RunState = { ...state, pops: [...state.pops] }
  if (trySpendMemory(next, HOT_RELOAD_MEMORY_COST) === null) {
    pushBanner(next, "热更新刷新 · 内存不足")
    return next
  }
  next.choices = pickRelicChoices(
    next,
    `relic:${next.floor}:hot`,
    next.relics,
    BASE_CHOICE_COUNT + next.mods.extraChoiceCount,
  )
  next.relicPickIndex = 0
  next.pendingRelic = null
  next.hotReloadUsedThisRun = true
  pushLog(
    next,
    `热更新 · 花 ${HOT_RELOAD_MEMORY_COST} 内存刷新一次（不占刷新次数）`,
  )
  playSfx("pick")
  return next
}

/** 碎片复活：−30 局内碎片、回复 40% 上限血、回到当前层接着打（超时惩罚不清掉） */
function reviveWithShards(state: RunState): RunState {
  if (state.phase !== "dead") return state
  if (state.paidReviveUsed || state.shards < PAID_REVIVE_COST) return state
  const reviveHp = Math.max(
    1,
    Math.round(state.playerMaxHp * PAID_REVIVE_HP_RATIO),
  )
  /* 死亡浮层停留的这段时间按「暂停」处理：各种计时整体后移，不白挨打 */
  const timedOutDeadline =
    state.bossDeadline > 0 && state.bossDeadline <= state.now
  const base: RunState = {
    ...state,
    phase: "fighting",
    shards: state.shards - PAID_REVIVE_COST,
    playerHp: reviveHp,
    paidReviveUsed: true,
    cause: "",
    pops: [...state.pops],
    log: [...state.log],
  }
  const shifted = shiftRunTime(base, Math.max(0, base.now - base.deadAt))
  const next: RunState = timedOutDeadline
    ? { ...shifted, bossDeadline: Math.min(shifted.bossDeadline, shifted.now) }
    : shifted
  pushPop(next, "heal", reviveHp)
  pushLog(
    next,
    `碎片复活 · 花掉 ${PAID_REVIVE_COST} 碎片，带着 ${Math.round(PAID_REVIVE_HP_RATIO * 100)}% 的血回来了`,
  )
  playSfx("skill")
  return next
}

/* ------------------------------------------------------------------ *
 * Hook
 * ------------------------------------------------------------------ */

export function useDungeon() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [copiedSeed, setCopiedSeed] = useState<string | null>(null)
  const copyTimer = useRef<number | null>(null)
  const recorded = useRef(false)
  /** 付费复活要回写的「局终写档前」存档快照 */
  const savedBeforeRef = useRef<ReturnType<typeof loadDungeonSave> | null>(null)
  /** 局终奖励总额：写档那一刻算好，View 直接展示（含当日递减的通关奖励） */
  const [endReward, setEndReward] = useState<number | null>(null)
  /** 第 8 层通关解锁的外观名（没解锁到就是 null） */
  const [victorySkin, setVictorySkin] = useState<string | null>(null)

  /* 低配模式：进本局时读一次存档开关，打开就关掉多余特效与动画 */
  const [lowSpec] = useState(() => loadDungeonSave().settings.lowSpec)
  /* 元叙事（fun-pack2.md 三）：进局时读一次本机倒下次数，本局死亡 +1 显示 */
  const [deathsSoFar] = useState(() => loadDungeonSave().runTally.deaths)
  /* 教学浮字开关：和 lowSpec 一样进页时读一次，改设置下一局生效 */
  const [tipsOn] = useState(() => loadDungeonSave().settings.tips !== false)
  /* 操作模式：进局读一次（休闲 / 标准 / 硬核），改模式要重开局才生效 */
  const [modeOn] = useState(() =>
    normalizePlayMode(loadDungeonSave().settings.playMode),
  )

  const entry = useMemo(() => {
    const save = loadDungeonSave()
    const fromUrl = searchParams.get("char")
    let characterId = isCharacterId(fromUrl)
      ? fromUrl
      : (save.lastCharacterId ?? DUNGEON_CHARACTERS[0].id)
    /* 种子码统一走 parseSeedCode 规范化：坏值回退随机，保证进局必是 XXXX-XXXX */
    const seedParam = searchParams.get("seed")
    const seed = parseSeedCode(seedParam ?? "") ?? getRandomSeed()
    /* 每日挑战局：按今日轮换锁角色（fixed/random 有值，pick 自选不锁） */
    const dailyMeta = seed === getDailySeed() ? getDailyMeta() : null
    if (dailyMeta?.fixedCharacterId) characterId = dailyMeta.fixedCharacterId
    /* 构筑码进场（build-code.md 二）：分享角色临时上场（隐藏角色不随码现身）、
       构筑前 3 条随局开局；每日挑战局忽略构筑码 */
    let importedRelicIds: string[] = []
    if (!dailyMeta) {
      const build = parseBuildCode(searchParams.get("build") ?? "")
      if (build) {
        const shared = findCharacter(build.characterId)
        if (shared && isCharacterVisible(shared, save.runTally.cleared)) {
          characterId = shared.id
        }
        importedRelicIds = build.relicIds
      }
    }
    const character = findCharacter(characterId) ?? DUNGEON_CHARACTERS[0]
    return { character, seed, dailyMeta, importedRelicIds }
    // 只在首次挂载时读一次入口参数
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [run, setRun] = useState<RunState>(() => {
    const saveOnEntry = loadDungeonSave()
    return createInitialRun(
      entry.character,
      entry.seed,
      Date.now(),
      tipsOn,
      modeOn,
      lowSpec,
      entry.dailyMeta
        ? {
            /* 今日诅咒进本即生效；今日池子挂进本局，三选一 / 路线 / 敌人都从池里抽 */
            curses:
              entry.dailyMeta.curseId === "none"
                ? []
                : [entry.dailyMeta.curseId],
            pools: {
              routePool: entry.dailyMeta.routePool,
              enemyPool: entry.dailyMeta.enemyPool,
              relicPool: entry.dailyMeta.relicPool,
            },
          }
        : undefined,
      /* 宿命裂隙（fun-pack3.md 二）：连续第几局用同一个种子 */
      seedStreakOf(entry.seed, saveOnEntry.runHistory),
      /* 影子来源（fun-pack4.md 一）：普通局 = 上一局；每日局按流挑一局 */
      shadowSourceFor(entry.seed, saveOnEntry.runHistory),
      /* 管理员资格（fun-pack4.md 二）：连续 10 局无死通关（解锁过 DEV 就不再召），
         或开发者彩蛋种子 ROOT-0000 */
      entry.seed.toUpperCase() === "ROOT-0000" ||
        (saveOnEntry.runTally.deathlessStreak >= ADMIN_STREAK &&
          !saveOnEntry.runTally.devMode),
      /* 构筑码导入的开局词条（build-code.md 二） */
      entry.importedRelicIds,
    )
  })
  const runRef = useRef(run)
  runRef.current = run

  /* ---- 批次一交互：主动技长按蓄力 / 滑动闪避 / 点击补刀（React 侧手势） ---- */
  const SWIPE_THRESHOLD_PX = 40
  const MOVE_CANCEL_PX = 12
  const [skillCharging, setSkillCharging] = useState(false)
  const [chargeRatio, setChargeRatio] = useState(0)
  const chargeRef = useRef<{
    wallStart: number
    holdTimer: number | null
    raf: number | null
    charging: boolean
    canceled: boolean
    /** 漂移拖拽中（glitch-feel-pack.md 三）：按钮化成幽灵跟手，松手判定落点 */
    dragging: boolean
    startX: number
    startY: number
  }>({
    wallStart: 0,
    holdTimer: null,
    raf: null,
    charging: false,
    canceled: false,
    dragging: false,
    startX: 0,
    startY: 0,
  })
  /* 漂移拖拽的幽灵位置（null = 不在拖） */
  const [skillDragPos, setSkillDragPos] = useState<{
    x: number
    y: number
  } | null>(null)
  /* 蓄力中挡闪避时「蓄力中无法闪避」一局只提示一次 */
  const chargeDodgeWarnedRef = useRef(false)
  /* 正在拖拽某个敌人：拖拽期间闪避一律无效（复用蓄力禁闪语义） */
  const enemyDragActiveRef = useRef(false)
  const swipeRef = useRef<{
    active: boolean
    startX: number
    startY: number
    fired: boolean
  }>({ active: false, startX: 0, startY: 0, fired: false })

  const cancelCharge = useCallback(() => {
    const c = chargeRef.current
    if (c.holdTimer != null) {
      window.clearTimeout(c.holdTimer)
      c.holdTimer = null
    }
    if (c.raf != null) {
      window.cancelAnimationFrame(c.raf)
      c.raf = null
    }
    if (c.charging) stopChargeTone()
    c.charging = false
    c.canceled = false
    /* 漂移拖拽一并收场（异常路径兜底：正常松手走 chargeEnd 的拖拽分支） */
    c.dragging = false
    setSkillDragPos(null)
    setSkillCharging(false)
    setChargeRatio(0)
  }, [])

  /** 长按主动技按钮 / 按住空格：起计时器，够 0.3 秒再进入蓄力 */
  const chargeStart = useCallback((x = 0, y = 0) => {
    const s = runRef.current
    if (s.phase !== "fighting" || s.paused) return
    if (s.now < s.activeReadyAt) return
    const c = chargeRef.current
    if (c.holdTimer != null || c.charging) return
    c.wallStart = Date.now()
    c.canceled = false
    c.startX = x
    c.startY = y
    chargeDodgeWarnedRef.current = false
    c.holdTimer = window.setTimeout(() => {
      c.holdTimer = null
      c.charging = true
      setSkillCharging(true)
      startChargeTone()
      const step = () => {
        const elapsed = Math.min(CHARGE_MAX_MS, Date.now() - c.wallStart)
        setChargeRatio(elapsed / CHARGE_MAX_MS)
        c.raf = window.requestAnimationFrame(step)
      }
      c.raf = window.requestAnimationFrame(step)
    }, CHARGE_MIN_MS)
  }, [])

  /** 蓄力期间手指大幅移动：战斗区来源照旧「划开取消」；
   *  按钮来源升级为漂移拖拽（glitch-feel-pack.md 三）——蓄力取消、幽灵按钮跟手 */
  const chargeMove = useCallback(
    (x: number, y: number, fromButton = false) => {
      const c = chargeRef.current
      if (c.dragging) {
        setSkillDragPos({ x, y })
        return
      }
      if (c.holdTimer == null && !c.charging) return
      const moved = Math.hypot(x - c.startX, y - c.startY)
      if (moved > MOVE_CANCEL_PX) {
        if (fromButton) {
          cancelCharge()
          c.dragging = true
          setSkillDragPos({ x, y })
        } else {
          c.canceled = true
          cancelCharge()
        }
      }
    },
    [cancelCharge],
  )

  /** 松手 / 松开空格：未满 0.3 秒 = 点按立即释放（100%），否则按蓄力时长释放；
   *  拖拽松手（带坐标，HUD 构筑包收编原漂移拖拽）：
   *  36px 内锚点 = dragDock 吸附；落敌人卡 = 故障打击（原机制保留）；空处 = 弹回原位（构筑不变） */
  const chargeEnd = useCallback((x?: number, y?: number) => {
    const c = chargeRef.current
    if (c.dragging) {
      c.dragging = false
      setSkillDragPos(null)
      if (x != null && y != null) {
        const anchor = anchorAtPoint(x, y)
        if (anchor) {
          setRun((prev) => dragDock(prev, "skill", anchor))
          return
        }
        const under = document.elementFromPoint(x, y)
        const card = under?.closest?.("[data-enemy-uid]") ?? null
        const uid = card?.getAttribute("data-enemy-uid")
        if (uid) {
          setRun((prev) => glitchStrike(prev, uid))
          return
        }
      }
      /* 空处松手 = 弹回原位：dock 不变、无惩罚（View 侧 280ms 过渡回位） */
      return
    }
    if (c.canceled) {
      cancelCharge()
      return
    }
    if (c.holdTimer != null) {
      window.clearTimeout(c.holdTimer)
      c.holdTimer = null
      setRun((prev) => useActiveSkill(prev, 1))
      return
    }
    if (c.charging) {
      const elapsed = Math.min(CHARGE_MAX_MS, Date.now() - c.wallStart)
      const mult = 1 + elapsed / CHARGE_MAX_MS
      if (c.raf != null) {
        window.cancelAnimationFrame(c.raf)
        c.raf = null
      }
      stopChargeTone()
      c.charging = false
      setSkillCharging(false)
      setChargeRatio(0)
      setRun((prev) => useActiveSkill(prev, mult))
    }
  }, [cancelCharge])

  /* ---- 闪避：按钮 / Shift / 滑动统一入口；蓄力中禁闪避并轻提示 ---- */
  const tryDodge = useCallback((dir = 0) => {
    if (enemyDragActiveRef.current) return
    if (chargeRef.current.charging || chargeRef.current.dragging) {
      if (!chargeDodgeWarnedRef.current) {
        chargeDodgeWarnedRef.current = true
        const dragging = chargeRef.current.dragging
        setRun((prev) => {
          const next = { ...prev }
          pushTip(
            next,
            dragging
              ? "拖着技能按钮时闪不了 · 松手落定才能躲"
              : "蓄力中无法闪避 · 松手释放后才能躲",
          )
          return next
        })
      }
      return
    }
    setRun((prev) => useDodgeSkill(prev, dir))
  }, [])

  /* ---- 战斗区水平滑动 = 闪避（点技能/闪避按钮的指针不算滑动） ---- */
  const isButtonPointer = (node: EventTarget | null): boolean => {
    if (!(node instanceof Element)) return false
    return node.closest("[data-skill-button],[data-dodge-button]") !== null
  }
  const battlePointerDown = useCallback((ev: ReactPointerEvent) => {
    if (isButtonPointer(ev.target)) return
    swipeRef.current = {
      active: true,
      startX: ev.clientX,
      startY: ev.clientY,
      fired: false,
    }
  }, [])
  const battlePointerMove = useCallback(
    (ev: ReactPointerEvent) => {
      if (chargeRef.current.charging) {
        chargeMove(ev.clientX, ev.clientY)
      }
      const sw = swipeRef.current
      if (!sw.active || sw.fired) return
      const dx = ev.clientX - sw.startX
      const dy = ev.clientY - sw.startY
      if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
        sw.fired = true
        /* 强制跳转 QTE 进行中：左滑计 QTE 进度，不触发闪避 */
        const q = runRef.current.qte
        if (dx < 0 && q && q.kind === "swipe") {
          setRun((prev) => qteSwipeLeft(prev))
          return
        }
        tryDodge(dx > 0 ? 1 : -1)
      }
    },
    [chargeMove, tryDodge],
  )
  const battlePointerUp = useCallback(() => {
    swipeRef.current.active = false
  }, [])

  /* ---- 批次二收尾·QTE：独立墙钟倒计时（100ms tick 之外）+ 长按进度 ---- */
  const [qteElapsedMs, setQteElapsedMs] = useState(0)
  const [qtePressing, setQtePressing] = useState(false)
  const [qtePressRatio, setQtePressRatio] = useState(0)
  const qteWallRef = useRef<{
    wallStart: number
    totalMs: number
    raf: number | null
    fired: boolean
  }>({ wallStart: 0, totalMs: 0, raf: null, fired: false })
  const qtePressRef = useRef<{
    wallStart: number
    targetMs: number
    raf: number | null
    done: boolean
  }>({ wallStart: 0, targetMs: 0, raf: null, done: true })

  /* 每次开新 QTE（qteSeq+1）起一个墙钟 rAF：更新倒计时、暂停冻结、到点判失败 */
  useEffect(() => {
    const w = qteWallRef.current
    if (w.raf != null) {
      window.cancelAnimationFrame(w.raf)
      w.raf = null
    }
    if (!run.qte) {
      setQteElapsedMs(0)
      return
    }
    w.wallStart = Date.now()
    w.totalMs = run.qte.totalMs
    w.fired = false
    setQteElapsedMs(0)
    let last = Date.now()
    const step = () => {
      const nowMs = Date.now()
      if (runRef.current.paused) {
        /* 暂停期间冻结倒计时：锚点顺延，不判超时 */
        w.wallStart += nowMs - last
        last = nowMs
        w.raf = window.requestAnimationFrame(step)
        return
      }
      last = nowMs
      const elapsed = nowMs - w.wallStart
      if (elapsed >= w.totalMs) {
        setQteElapsedMs(w.totalMs)
        if (!w.fired) {
          w.fired = true
          setRun((prev) => qteTimeout(prev))
        }
        w.raf = null
        return
      }
      setQteElapsedMs(elapsed)
      w.raf = window.requestAnimationFrame(step)
    }
    w.raf = window.requestAnimationFrame(step)
    return () => {
      const cur = qteWallRef.current
      if (cur.raf != null) {
        window.cancelAnimationFrame(cur.raf)
        cur.raf = null
      }
    }
    // qteSeq 每开一个新 QTE 恰好 +1，用它当唯一触发键
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.qteSeq])

  /* QTE 被外部取消（Boss 先死等）：长按的本地状态一起收掉 */
  useEffect(() => {
    if (run.qte) return
    const pr = qtePressRef.current
    if (pr.raf != null) {
      window.cancelAnimationFrame(pr.raf)
      pr.raf = null
    }
    pr.done = true
    setQtePressing(false)
    setQtePressRatio(0)
  }, [run.qte])

  const finishQtePress = useCallback((heldMs: number) => {
    const pr = qtePressRef.current
    if (pr.done) return
    pr.done = true
    if (pr.raf != null) {
      window.cancelAnimationFrame(pr.raf)
      pr.raf = null
    }
    setQtePressing(false)
    setQtePressRatio(0)
    setRun((prev) => qtePressEnd(prev, heldMs))
  }, [])

  /** press 类 QTE：按屏 / 按住空格起长按，rAF 推进度，按满自动成功 */
  const handleQtePressStart = useCallback(() => {
    const s = runRef.current
    if (!s.qte || s.qte.kind !== "press") return
    if (s.phase !== "fighting" || s.paused) return
    const pr = qtePressRef.current
    if (pr.raf != null || !pr.done) return
    pr.done = false
    pr.wallStart = Date.now()
    pr.targetMs = s.qte.target
    setQtePressing(true)
    setQtePressRatio(0)
    setRun((prev) => qtePressStart(prev))
    let last = Date.now()
    const step = () => {
      const nowMs = Date.now()
      if (runRef.current.paused) {
        pr.wallStart += nowMs - last
        last = nowMs
        pr.raf = window.requestAnimationFrame(step)
        return
      }
      last = nowMs
      const held = nowMs - pr.wallStart
      setQtePressRatio(Math.min(1, held / pr.targetMs))
      if (held >= pr.targetMs) {
        finishQtePress(held)
        return
      }
      pr.raf = window.requestAnimationFrame(step)
    }
    pr.raf = window.requestAnimationFrame(step)
  }, [finishQtePress])

  /** press 类 QTE：松手 / 松开空格；窗口内松手即失败结算 */
  const handleQtePressEnd = useCallback(() => {
    const pr = qtePressRef.current
    if (pr.done) return
    finishQtePress(Date.now() - pr.wallStart)
  }, [finishQtePress])

  const handleQteTap = useCallback(() => {
    setRun((prev) => qteTap(prev))
  }, [])

  const handleQtePopupClick = useCallback((popupId: number) => {
    setRun((prev) => qtePopupClick(prev, popupId))
  }, [])

  /** 键盘等价：弹窗雨 QTE 按空格 = 点掉最左边一个 × */
  const handleQtePopupKey = useCallback(() => {
    setRun((prev) => {
      const firstPopup = prev.qte?.popups?.[0]
      if (!firstPopup) return prev
      return qtePopupClick(prev, firstPopup.id)
    })
  }, [])


  /* ---- 幽灵对照：只在带今日种子进图时拉一次，普通开局什么都不做 ---- */
  const dailySeed = useMemo(() => getDailySeed(), [])
  /* 内存显示形态（ui-pack.md 一）：开局读一次设置，改设置下一局生效 */
  const memoryDisplay = useMemo(
    () => loadDungeonSave().settings.memoryDisplay,
    [],
  )
  /* 战斗信息条开关（ui-pack.md v2 三）：局内 × 可关，写档跨局记住 */
  const [combatFooter, setCombatFooter] = useState(
    () => loadDungeonSave().settings.combatFooter,
  )
  const toggleCombatFooter = useCallback(() => {
    const current = loadDungeonSave()
    const next = !current.settings.combatFooter
    writeDungeonSave({
      ...current,
      settings: { ...current.settings, combatFooter: next },
    })
    setCombatFooter(next)
    playSfx("pick")
  }, [])
  /* 每日挑战计数：带着今日种子进本这一刻 +1（中途退出也算；正式 1 + 重试 1 共两次，上限在每日页拦） */
  const dailyBumpedRef = useRef(false)
  useEffect(() => {
    if (entry.seed !== dailySeed || dailyBumpedRef.current) return
    dailyBumpedRef.current = true
    bumpDailyRun(getDailyDateKey())
  }, [dailySeed, entry.seed])
  const [ghost, setGhost] = useState<DailyGhost | null>(null)
  const [ghostBeaten, setGhostBeaten] = useState(false)
  const ghostBeatenRef = useRef(false)

  useEffect(() => {
    if (entry.seed !== dailySeed) return
    let alive = true
    /* 拉不到（没登录 / 榜上还没有别人 / 网络失败）一律静默：ghost 保持 null */
    fetchDailyGhost(getDailyDateKey(), entry.seed).then((found) => {
      if (alive && found) setGhost(found)
    })
    return () => {
      alive = false
    }
  }, [dailySeed, entry.seed])

  /* 反超幽灵：第一次超过时提示一次，每局只一次；幽灵通关了就不提示 */
  useEffect(() => {
    if (!ghost || ghostBeatenRef.current) return
    if (ghost.floor >= DUNGEON_RUN_FLOORS.length) return
    if (run.floor <= ghost.floor) return
    ghostBeatenRef.current = true
    setGhostBeaten(true)
    playSfx("pick")
  }, [ghost, run.floor])

  /* 战斗循环：卸载时一定清掉定时器 */
  useEffect(() => {
    const timer = window.setInterval(() => {
      setRun((prev) => advance(prev, Date.now()))
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    }
  }, [])

  /* 一局结束：把种子码与战绩写进本地存档 */
  useEffect(() => {
    if (run.phase !== "dead" && run.phase !== "victory") return
    if (recorded.current) return
    recorded.current = true

    const cleared = run.phase === "victory"
    const reachedFloor = cleared ? DUNGEON_RUN_FLOORS.length : run.floor
    /* 写档前快照：付费复活要整份写回，等真正局终再重新记一笔 */
    const saveBefore = loadDungeonSave()
    savedBeforeRef.current = saveBefore
    /* 本局没花掉的临时碎片按 1:1 折算进结算奖励 */
    let reward = run.shards
    let save = saveBefore
    if (cleared) {
      /* 通关奖励：先记当日通关数，再按新值取递减档（60/30/15/其余 5） */
      save = bumpClearsToday(getDailyDateKey())
      reward += clearBonusForDailyClears(save.clearsToday.count)
    }
    /* v2 内存效率结算：(产出-消耗)/产出（产出不计层间回满），评级换额外碎片 */
    const memoryEff = memoryEfficiencyOf(run.memoryGained, run.memorySpent)
    reward += memoryEff.bonus
    setEndReward(reward)
    const record: DungeonRunRecord = {
      characterId: run.character.id,
      characterName: run.character.displayName,
      floor: reachedFloor,
      cause: cleared
        ? "通关：把第 8 层的崩溃页面关掉了"
        : run.cause || "倒在了地牢里",
      seed: run.seed,
      relics: run.relics.map((relic) => relic.name),
      endedAt: new Date().toISOString(),
      relicIds: run.relics.map((relic) => relic.id),
      cleared,
      kills: run.kills,
      damageDealt: run.damageDealt,
      reward,
      durationMs: Math.max(0, run.now - run.startedAt),
      hpLeft: Math.max(0, Math.round(run.playerHp)),
      maxHp: Math.max(1, Math.round(run.playerMaxHp)),
      /* 无伤通关：全程没掉过一滴血且通关（成就系统用） */
      noDamage: cleared && !run.tookDamage,
      /* 硬核操作模式的局：给战绩卡一个小标记，不影响评分 */
      hardcore: run.playMode === "hardcore" ? true : undefined,
      /* 幽灵对照：逐层轨迹随战绩一起留给结算页上报（只有每日挑战会被报上去） */
      path: run.path.slice(0, DUNGEON_RUN_FLOORS.length),
      /* v2 内存效率：结算页展示评级与产出/消耗明细 */
      memoryEff,
      memoryGained: Math.round(run.memoryGained * 2) / 2,
      memorySpent: Math.round(run.memorySpent * 2) / 2,
      /* Build 评分（内存维度加成条件）：耗尽次数 / 崩溃次数 */
      memoryOutages: run.memoryOutages,
      memoryCrashes: run.memoryCrashes,
      /* 深化包：碎片峰值 / 整理次数 / 超频次数（结算卡小字行，旧档缺失整行不显） */
      maxFrags: run.maxFrags ?? 0,
      defrags: run.memDefragCount ?? 0,
      overclocks: run.ocCount ?? 0,
      /* 本局故事（fun-pack.md 四）：结算页 RunStoryPanel 消费，旧档无此字段 */
      story: run.story.length > 0 ? [...run.story] : undefined,
      /* 管理员资格链（fun-pack4.md 二）：本局死没死过 / 有没有掀翻管理员 */
      died: run.deathsThisRun > 0 || run.phase === "dead",
      adminDefeated: run.adminWon ? true : undefined,
    }
    /* 第 8 层通关奖励：解锁该角色下一套还没拿到的外观 */
    let unlockedSkinIds = save.unlockedSkinIds
    if (cleared) {
      const owned = new Set(save.unlockedSkinIds)
      const fresh = getCharacterSkins(run.character.id).find(
        (skin) => !owned.has(skin.id),
      )
      if (fresh) {
        unlockedSkinIds = [...save.unlockedSkinIds, fresh.id]
        setVictorySkin(fresh.displayName)
      }
    }
    writeDungeonSave({
      ...save,
      lastRun: record,
      /* 历史战绩：最新的排最前，只留 20 局（首页历史面板与评分趋势用） */
      runHistory: [record, ...save.runHistory].slice(0, 20),
      lastCharacterId: run.character.id,
      fragments: save.fragments + reward,
      hintSeen: true,
      bestFloor: Math.max(save.bestFloor, reachedFloor),
      unlockedSkinIds,
    })
    /* 浏览器特性包 v1（browser-powers-pack.md 二）：往浏览器里真的落垃圾文件
       （胜 2 负 1、场上上限 4、内容按本局 seed 派生、配额满静默跳过） */
    dropJunkFiles(run.seed, cleared)
  }, [run])

  /* 图鉴：本局带过的词条标记为「见过」（选中即记，重开一局也不会丢） */
  useEffect(() => {
    if (run.relics.length === 0) return
    recordSeenRelics(run.relics.map((relic) => relic.id))
  }, [run.relics])

  /* 图鉴：关掉的敌人 / Boss 分开记进存档 */
  useEffect(() => {
    if (run.defeatedIds.length === 0) return
    const enemyIds: string[] = []
    const bossIds: string[] = []
    run.defeatedIds.forEach((defId) => {
      const def = ENEMY_DEFS[defId]
      if (def && def.kind === "normal") {
        enemyIds.push(defId)
      } else {
        bossIds.push(defId)
      }
    })
    if (enemyIds.length > 0) recordDefeatedEnemies(enemyIds)
    if (bossIds.length > 0) recordDefeatedBosses(bossIds)
  }, [run.defeatedIds])

  /* 键盘：按住空格蓄力 / Shift 闪避 / 左右切换锁定 */
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true
      if (typing) return

      /* 三选一浮层打开时键盘交给浮层自己接管，这里只管战斗中 */
      const s = runRef.current
      const space = ev.key === " " || ev.code === "Space"

      /* 进层准备闸：空格 = 开始战斗（不启动蓄力、不放技能） */
      if (space && s.readyFloor && s.phase === "fighting" && !ev.repeat) {
        ev.preventDefault()
        pressFloorStart()
        return
      }

      /* QTE 进行中：键盘给 QTE 让位（tap/press/clicks=空格，swipe=←），其余技能期键盘照旧 */
      if (s.qte && s.phase === "fighting" && !s.paused && !ev.repeat) {
        if (s.qte.kind === "tap" && space) {
          ev.preventDefault()
          handleQteTap()
          return
        }
        if (s.qte.kind === "press" && space) {
          ev.preventDefault()
          handleQtePressStart()
          return
        }
        if (s.qte.kind === "clicks" && space) {
          ev.preventDefault()
          handleQtePopupKey()
          return
        }
        if (s.qte.kind === "swipe" && ev.key === "ArrowLeft") {
          ev.preventDefault()
          setRun((prev) => qteSwipeLeft(prev))
          return
        }
      }

      if (space) {
        ev.preventDefault()
        if (ev.repeat) return
        chargeStart()
        return
      }

      if (ev.key === "Shift") {
        ev.preventDefault()
        tryDodge(0)
        return
      }

      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        const delta = ev.key === "ArrowRight" ? 1 : -1
        ev.preventDefault()
        setRun((prev) =>
          prev.phase === "fighting" ? shiftTarget(prev, delta) : prev,
        )
      }
    }

    const onKeyUp = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true
      if (typing) return
      if (ev.key === " " || ev.code === "Space") {
        ev.preventDefault()
        /* 长按 QTE 进行中：这次松手交给 QTE，蓄力侧本就未启动、chargeEnd 空转无害 */
        handleQtePressEnd()
        chargeEnd()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [
    chargeStart,
    chargeEnd,
    tryDodge,
    handleQteTap,
    handleQtePressStart,
    handleQtePressEnd,
    handleQtePopupKey,
  ])

  const pressDodge = useCallback(() => {
    tryDodge(0)
  }, [tryDodge])

  const shiftLock = useCallback((delta: number) => {
    setRun((prev) => shiftTarget(prev, delta))
  }, [])

  /** 禅模式（ui-pack.md v3 一）：折叠 ⇄ 展开顶栏二级信息；折叠吃攻速 +5%，展开回到基准 */
  const toggleTopDetails = useCallback(() => {
    setRun((prev) => ({ ...prev, uiZen: prev.uiZen === false ? true : false }))
    playSfx("pick")
  }, [])

  /* ---- 内核包 v1（kernel-tabs.md）：开页 / 切页 / 冻结 / 关闭 ---- */
  const openTab = useCallback(() => {
    setRun((prev) => openTabPage(prev))
  }, [])
  const switchTab = useCallback((id: number) => {
    setRun((prev) => switchTabPage(prev, id))
  }, [])
  const freezeTab = useCallback((id: number) => {
    setRun((prev) => freezeTabPage(prev, id))
  }, [])
  const closeTab = useCallback((id: number) => {
    setRun((prev) => closeTabPage(prev, id))
  }, [])

  /* ---- 核心体验包 v2（core-experience-pack2.md）一：援军召唤 ---- */
  const openAllyPickPanel = useCallback(() => {
    setRun((prev) => openAllyPick(prev))
  }, [])
  const dismissAllyPickPanel = useCallback(() => {
    setRun((prev) => dismissAllyPick(prev))
  }, [])
  const summonAllyAt = useCallback((kind: AllyKind) => {
    setRun((prev) => summonAlly(prev, kind))
  }, [])

  /* ---- 核心体验包 v2（core-experience-pack2.md）二：缓存电池 ---- */
  const openCacheBoxPanel = useCallback(() => {
    setRun((prev) => openCacheBox(prev))
  }, [])
  const dismissCacheBoxPanel = useCallback(() => {
    setRun((prev) => dismissCacheBox(prev))
  }, [])
  const cacheDepositAction = useCallback(() => {
    setRun((prev) => cacheDeposit(prev))
  }, [])
  const cacheTakeSlot = useCallback((slotIdx: number) => {
    setRun((prev) => cacheTake(prev, slotIdx))
  }, [])
  const cacheBurnAll = useCallback(() => {
    setRun((prev) => cacheBurn(prev))
  }, [])

  /* ---- 内核包 v2（任务管理器）：打开 / 关闭 / 执行操作 ---- */
  const openTaskMgr = useCallback(() => {
    setRun((prev) => openTaskManager(prev))
  }, [])
  const dismissTaskMgr = useCallback(() => {
    setRun((prev) => dismissTaskManager(prev))
  }, [])
  const applyTask = useCallback((kind: TaskActionKind, uid: string | null) => {
    setRun((prev) => applyTaskAction(prev, kind, uid))
  }, [])

  /* ---- 深化包：内存超频 / 病毒引爆 ---- */
  const runOverclock = useCallback(() => {
    setRun((prev) => useOverclock(prev))
  }, [])
  const detonateVirusAt = useCallback((uid: string) => {
    setRun((prev) => detonateVirus(prev, uid))
  }, [])

  /* ---- 表现包：手动斩杀（血骷髅点击）---- */
  const executeTarget = useCallback((uid: string) => {
    setRun((prev) => executeEnemy(prev, uid))
  }, [])

  /** 点击敌人：切锁 / 点已锁定目标补刀（lockEnemy 内统一处理 0.5s 防误触与连击） */
  const lockTarget = useCallback((uid: string) => {
    setRun((prev) => lockEnemy(prev, uid))
  }, [])

  /** 拖拽关闭：标签条里向上 / 向左拖出残血普通敌人 */
  const dragCloseTarget = useCallback((uid: string) => {
    setRun((prev) => dragCloseEnemy(prev, uid))
  }, [])

  /** 弹窗 ×：点掉窗口期内的弹窗本体 */
  const dismissPopup = useCallback((uid: string) => {
    setRun((prev) => dismissPopupEnemy(prev, uid))
  }, [])

  /** 点击碎片点：全额入账 + 叠点击连击 */
  const pickShard = useCallback((dotId: number) => {
    setRun((prev) => pickShardDot(prev, dotId))
  }, [])

  /** 标签条正在拖拽敌人时置位，期间禁用闪避 */
  const setEnemyDragging = useCallback((active: boolean) => {
    enemyDragActiveRef.current = active
  }, [])

  /** 机制 9：点词条栏的「可触发」词条手动激活 */
  const triggerRelicCard = useCallback((relicId: string) => {
    setRun((prev) => triggerRelic(prev, relicId))
  }, [])

  const lockButton = useCallback((buttonId: string) => {
    setRun((prev) => lockBossButton(prev, buttonId))
  }, [])

  const pickChallengeSymbol = useCallback((symbol: string) => {
    setRun((prev) => applyChallengePick(prev, symbol))
  }, [])

  const pressBossSkip = useCallback(() => {
    setRun((prev) => applyBossSkip(prev))
  }, [])

  const pressPause = useCallback(() => {
    /* 准备闸期间暂停键无效：Ready 浮层就是唯一模态 */
    setRun((prev) => (prev.readyFloor ? prev : setPaused(prev, !prev.paused)))
  }, [])

  /** 准备闸 → 开战：清旗标后走暂停恢复同款通道，冻结时长整体平移所有计时 */
  const pressFloorStart = useCallback(() => {
    setRun((prev) => {
      if (!prev.readyFloor || prev.phase !== "fighting") return prev
      playSfx("pick")
      return setPaused({ ...prev, readyFloor: false }, false)
    })
  }, [])

  const selectRelic = useCallback((relic: Relic) => {
    setRun((prev) => applyRelicChoice(prev, relic))
  }, [])

  const replaceRelic = useCallback((slotId: string) => {
    setRun((prev) => applyRelicReplace(prev, slotId))
  }, [])

  const cancelReplace = useCallback(() => {
    setRun((prev) =>
      prev.phase === "relic" ? { ...prev, pendingRelic: null } : prev,
    )
  }, [])

  const reroll = useCallback(() => {
    setRun((prev) => rerollChoices(prev))
  }, [])

  const paidReroll = useCallback(() => {
    setRun((prev) => paidRerollChoices(prev))
  }, [])

  /** 批次 C·N6：金色「超时重试」按钮（耗 3 内存，每层 1 次，必出稀有以上） */
  const timeoutRetry = useCallback(() => {
    setRun((prev) => timeoutRetryChoices(prev))
  }, [])

  /** 批次 C·G2：热更新刷新（耗 2 内存，每局 1 次，不占刷新次数） */
  const hotReloadRefresh = useCallback(() => {
    setRun((prev) => hotReloadReroll(prev))
  }, [])

  const skipRelic = useCallback((upgrade = false) => {
    setRun((prev) => skipRelicPhase(prev, upgrade))
  }, [])

  /** 付费复活：先把刚写的局终存档整份回退，真正局终时再重写一笔 */
  const paidRevive = useCallback(() => {
    if (recorded.current) {
      if (savedBeforeRef.current) writeDungeonSave(savedBeforeRef.current)
      recorded.current = false
      savedBeforeRef.current = null
    }
    setEndReward(null)
    setRun((prev) => reviveWithShards(prev))
  }, [])

  /* ---- 局内浮层：商店 / 祭坛 ---- */

  const buyShopItem = useCallback((itemId: string) => {
    setRun((prev) => applyShopBuy(prev, itemId))
  }, [])

  const pickRoute = useCallback((routeId: RouteId) => {
    setRun((prev) => applyRouteChoice(prev, routeId))
    playSfx("pageFlip")
  }, [])

  const removeTarget = useCallback(
    (target: { kind: "relic"; id: string } | { kind: "curse"; id: CurseId }) => {
      setRun((prev) => applyRemoveChoice(prev, target))
    },
    [],
  )

  const skipRemove = useCallback(() => {
    setRun((prev) => skipRemovePanel(prev))
  }, [])

  /** 镜像复制面板：复制选中的词条 */
  const copyMirrorRelic = useCallback((relicId: string) => {
    setRun((prev) => applyMirrorCopy(prev, relicId))
  }, [])

  /** 镜像复制面板：不复制直接走 */
  const skipMirrorPanel = useCallback(() => {
    setRun((prev) => skipMirror(prev))
  }, [])

  const leaveShop = useCallback(() => {
    setRun((prev) =>
      prev.phase === "overlay" && prev.overlayKind === "shop"
        ? openRelicAfterOverlay(prev)
        : prev,
    )
  }, [])

  const chooseAltarCost = useCallback((cost: AltarCost) => {
    setRun((prev) => applyAltarCost(prev, cost))
  }, [])

  const replaceAltarRelic = useCallback((slotId: string) => {
    setRun((prev) => applyAltarSwap(prev, slotId))
  }, [])

  const leaveAltar = useCallback(() => {
    setRun((prev) =>
      prev.phase === "overlay" && prev.overlayKind === "altar"
        ? openRelicAfterOverlay(prev)
        : prev,
    )
  }, [])

  /* ---- 趣味包（fun-pack.md）：代价事件选项 / 假按钮点击 ---- */

  const chooseCrisis = useCallback((optionIndex: number) => {
    setRun((prev) => applyCrisisChoice(prev, optionIndex))
  }, [])

  const hitFakeButton = useCallback(() => {
    setRun((prev) => tapFakeButton(prev))
  }, [])

  /* ---- 趣味包 v2（fun-pack2.md 一）：UI 变武器 ---- */
  const toggleBlind = useCallback(() => {
    setRun((prev) => toggleBlindCombat(prev))
  }, [])

  const forceSkip = useCallback(() => {
    setRun((prev) => forceSkipFloor(prev))
  }, [])

  const recoverSkill = useCallback(() => {
    setRun((prev) => recoverSkillButton(prev))
  }, [])

  /* ---- 第三批（fun-pack3.md）：隐藏裂隙 ---- */
  const enterHidden = useCallback(() => {
    setRun((prev) => enterHiddenBattle(prev))
  }, [])

  const rejectHidden = useCallback(() => {
    setRun((prev) => rejectHiddenRift(prev))
  }, [])

  const restart = useCallback(() => {
    recorded.current = false
    savedBeforeRef.current = null
    setEndReward(null)
    setVictorySkin(null)
    setRun((prev) =>
      createInitialRun(
        prev.character,
        getRandomSeed(),
        Date.now(),
        tipsOn,
        modeOn,
        lowSpec,
      ),
    )
  }, [])

  const exitToHome = useCallback(() => {
    navigate("/")
  }, [navigate])

  const viewResult = useCallback(() => {
    navigate("/result")
  }, [navigate])

  const copySeed = useCallback(async (seed: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(seed)
        setCopiedSeed(seed)
        if (typeof window !== "undefined") {
          if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
          copyTimer.current = window.setTimeout(() => setCopiedSeed(null), 2400)
        }
        return
      }
      throw new Error("clipboard unavailable")
    } catch {
      setCopiedSeed(null)
    }
  }, [])

  /* 派生值 */
  const config = getFloorConfig(run.floor)
  /* 路线层：标题跟着所选路线动态化（第 1 / 8 固定层不走这条） */
  const activeRouteType = run.activeRouteId
    ? ROUTE_TYPES[run.activeRouteId]
    : null
  const now = run.now
  const activeCooldownLeft = Math.max(0, run.activeReadyAt - now)
  const dodgeCooldownLeft = Math.max(0, run.dodgeReadyAt - now)
  const activeCooldownRatio =
    run.mods.activeCooldownMs > 0
      ? Math.min(1, activeCooldownLeft / run.mods.activeCooldownMs)
      : 0
  /* HUD 构筑包·镜像联动：冷却扇形分母与 useDodgeSkill 实际使用的 CD 同口径 */
  const hudDodgeCdMs = run.mods.dodgeCooldownMs * hudPerks(run.dock).dodgeCdMult
  const dodgeCooldownRatio =
    hudDodgeCdMs > 0 ? Math.min(1, dodgeCooldownLeft / hudDodgeCdMs) : 0

  /* 点击连击上限：持有「事件监听」词条时 +5 */
  const clickComboMax = run.relics.some(
    (relic) => relic.id === CLICK_COMBO_EVENT_LISTENER_ID,
  )
    ? CLICK_COMBO_MAX_BOOSTED
    : CLICK_COMBO_MAX
  const clickComboActive = run.clickCombo >= 3
  const clickComboFull = run.clickCombo >= clickComboMax

  /* 词条栏里可手动触发词条的状态（v4 起只剩节流 / 离线模式） */
  const relicTriggers: Record<
    string,
    { name: string; status: RelicTriggerStatus; label: string }
  > = {}
  run.relics.forEach((relic) => {
    const status = relicTriggerStatus(run, relic.id, now)
    if (!status) return
    let label = status === "ready" ? "可触发" : "冷却中"
    /* v4·S5 节流：label 显示资源层数（HUD 层数），生效中 / 无层分开提示 */
    if (relic.id === "throttle") {
      if (status === "ready") label = `可用 ×${run.throttleLayers}`
      else if (now < run.manualImmuneUntil) label = "生效中"
      else label = "无层"
    }
    relicTriggers[relic.id] = { name: relic.name, status, label }
  })

  const schoolCounts = useMemo(
    () => getRelicSchoolCounts(run.relics),
    [run.relics],
  )
  const bonds = useMemo(() => getActiveBondDefs(run.relics), [run.relics])

  /* 外观：只在角色变化时读一次存档，100ms 的战斗 tick 里绝不碰 localStorage */
  const equippedSkin = useMemo(
    () => getEquippedSkin(run.character.id),
    [run.character.id],
  )

  const boss = activeBoss(run)
  const bossCountdownMs =
    boss && run.bossDeadline > 0 ? Math.max(0, run.bossDeadline - now) : 0

  /* Boss 当前阶段的技能表：冷却剩余 + 是否正在前摇 */
  const bossSkills = boss?.boss
    ? (bossSkillTable(boss)).map((def) => {
        const runtime = boss.boss?.skills.find((item) => item.id === def.id)
        return {
          ...def,
          cooldownLeft: runtime
            ? Math.max(0, runtime.nextReadyAt - now)
            : def.cdMs,
          active: boss.boss?.pending?.id === def.id,
        }
      })
    : []
  const bossPassive =
    boss?.defId === "boss-fullscreen"
      ? BOSS_AD_PASSIVE
      : boss?.boss
        ? (BOSS_CRASH_PASSIVE[boss.boss.phase] ?? null)
        : null

  /* Boss 技能召唤出来、还没清掉的小怪 */
  const minions = run.enemies.filter((enemy) => enemy.minion && !enemy.closing)

  const cleared = run.phase === "victory"
  /* 局终奖励：写档那一刻算好的缓存值；没写档前只报局内碎片（通关奖励写档时才进） */
  const reward = endReward ?? run.shards

  /* 性能与体验包（perf-experience-pack.md B2）：结算浮层一出现就预取结算页分包
     （ref 守卫每局只预取一次），点「查看结算」零等待；预取失败静默。 */
  const resultPrefetchedRef = useRef(false)
  useEffect(() => {
    if (resultPrefetchedRef.current) return
    if (run.phase !== "dead" && run.phase !== "victory") return
    resultPrefetchedRef.current = true
    void import("@/pages/Result/index.tsx").catch(() => {})
  }, [run.phase])

  /* 性能与体验包（perf-experience-pack.md C）：dragDock 引用稳定化
     （setRun 恒定、依赖数组如实为空；行为与内联箭头完全一致），
     这是 RelicDockCard 挂 React.memo 生效的前置条件。 */
  const dragDockStable = useCallback(
    (module: DockModule, anchor: Anchor) =>
      setRun((prev) => dragDock(prev, module, anchor)),
    [],
  )

  return {
    /* 静态信息 */
    character: run.character,
    skinStyle: equippedSkin.style,
    skinName: equippedSkin.displayName,
    seed: run.seed,
    /* 种子码本身就是短格式（XXXX-XXXX），顶栏直接全显 */
    shortSeed: run.seed,
    copiedSeed,
    floor: run.floor,
    floorTotal: DUNGEON_RUN_FLOORS.length,
    floorLabel: activeRouteType
      ? `第 ${run.floor} 层 · ${activeRouteType.name}`
      : config.label,
    floorShort: activeRouteType ? activeRouteType.name : config.shortLabel,
    floorNote: activeRouteType
      ? `${activeRouteType.enemyText} · ${activeRouteType.rewardText}`
      : config.note,
    isBossFloor: config.isBoss,
    floors: DUNGEON_RUN_FLOORS,

    /* 战斗数值 */
    phase: run.phase,
    playerHp: run.playerHp,
    playerMaxHp: run.playerMaxHp,
    hpRatio: run.playerMaxHp > 0 ? run.playerHp / run.playerMaxHp : 0,
    lowHp: run.playerHp <= Math.ceil(run.playerMaxHp * 0.3),
    shield: run.shield,
    shieldMax: run.mods.shieldMax,
    combo: run.combo,
    /* 手动点击连击（独立于事件连击） */
    clickCombo: run.clickCombo,
    clickComboMax,
    clickComboActive,
    clickComboFull,
    perfectFlash: run.phase === "fighting" && now < run.perfectFlashUntil,
    dodgeDir: run.dodgeDir,
    enemies: run.enemies,
    lockedUid: run.lockedUid,
    lockedButtonId: run.lockedButtonId,
    pops: run.pops,
    /* 手动拾取的碎片点 / 拖拽关闭额度 / HUD 横幅 */
    shardDots: run.shardDots,
    dragCloseUsed: run.dragCloseUsed,
    banner: run.banner,
    /* ---- 趣味包（fun-pack.md）：代价事件 / 页面故障 / 假按钮 ---- */
    crisis: run.crisisEvent ? CRISIS_DEFS[run.crisisEvent] : null,
    chooseCrisis,
    glitchKind:
      run.phase === "fighting" && now < run.glitchUntil ? run.glitchKind : null,
    fakeButton: run.phase === "fighting" ? run.fakeButton : null,
    hitFakeButton,
    /* ---- 趣味包 v2（fun-pack2.md）：UI 武器 / 敌人适应 / 元叙事 ---- */
    blindCombat: run.blindCombat,
    toggleBlind,
    forceSkip,
    /* 抢按钮：被抢态 + 乱窜目标位置（仅战斗中给 View） */
    skillSnatched: run.phase === "fighting" && run.skillSnatched,
    snatchPos: { xPct: run.snatchXPct, yPct: run.snatchYPct },
    recoverSkill,
    /* 敌人适应角标（TabEnemyStrip 用） */
    adaptions: {
      bounce: run.adaptBounce,
      crit: run.adaptCrit,
      skill: run.adaptSkill,
    },
    /* 元叙事：本机累计倒下次数（本次死亡发生在落盘前，死亡时 +1） */
    deathCount: deathsSoFar + (run.phase === "dead" ? 1 : 0),
    /* ---- 第三批（fun-pack3.md）：隐藏裂隙 / 词条打架 ---- */
    hiddenOffer: run.hiddenOffer ? HIDDEN_FLOOR_DEFS[run.hiddenOffer] : null,
    hiddenActive: run.hiddenActive,
    enterHidden,
    rejectHidden,
    /* 打架中的词条对（顶栏徽标用） */
    relicConflicts: run.mods.conflicts.map((id) => RELIC_CONFLICTS[id]),
    /* ---- 第四批（fun-pack4.md）：影子与管理员（敌人本体走 enemies 的 e.shadow / e.admin） ---- */
    adminActive: run.adminActive,
    shadowInPlay:
      run.phase === "fighting" &&
      run.enemies.some((enemy) => enemy.shadow && !enemy.closing),
    /* ---- 内核包 v1（kernel-tabs.md）：多标签页（tabsView 为 null = 非普通层战斗，不渲染标签栏） ---- */
    activeTabId: run.activeTabId ?? 0,
    tabOpenCost: TAB_OPEN_COST_MEMORY,
    canOpenTab:
      tabSystemActive(run) &&
      (run.tabs?.length ?? 0) < TAB_MAX_EXTRA &&
      run.memory >= TAB_OPEN_COST_MEMORY,
    tabsView: tabSystemActive(run)
      ? [
          {
            id: 0,
            label: activeRouteType ? activeRouteType.name : config.shortLabel,
            aliveCount: aliveEnemies(run).length,
            frozen: false,
            isFront: (run.activeTabId ?? 0) === 0,
          },
          ...(run.tabs ?? []).map((tab) => ({
            id: tab.id,
            label: `新标签 ${tab.id}`,
            aliveCount: tab.enemies.filter((enemy) => !enemy.closing).length,
            frozen: tab.frozen,
            isFront: (run.activeTabId ?? 0) === tab.id,
            /* 核心体验包 v2：援军页芯片图标（null = 普通战斗页） */
            ally: tab.ally ?? null,
          })),
        ]
      : null,
    openTabPage: openTab,
    switchTabPage: switchTab,
    freezeTabPage: freezeTab,
    closeTabPage: closeTab,
    /* ---- 核心体验包 v2（core-experience-pack2.md）一：援军召唤的 HUD 接线 ---- */
    allyCost: ALLY_COST,
    allyPickOpen: run.phase === "overlay" && run.overlayKind === "allyPick",
    reinforceAvailable: canReinforce(run),
    openAllyPick: openAllyPickPanel,
    dismissAllyPick: dismissAllyPickPanel,
    summonAlly: summonAllyAt,
    /* ---- 内核包 v2（任务管理器）---- */
    taskmgrOpen: run.phase === "overlay" && run.overlayKind === "taskmgr",
    taskmgrAvailable: taskmgrAvailable(run),
    taskmgrUsed: (run.taskmgrUsedFloor ?? 0) === run.floor,
    taskmgrOpenCost: TASKMGR_OPEN_COST_MEMORY,
    /* 浮层内快照（打开即暂停战斗，静态列表就是当下战场） */
    taskmgrEnemies:
      run.phase === "overlay" && run.overlayKind === "taskmgr"
        ? run.enemies
            .filter((enemy) => !enemy.closing)
            .map((enemy) => ({
              uid: enemy.uid,
              name: enemy.displayName,
              hp: Math.max(0, Math.round(enemy.hp)),
              maxHp: Math.max(1, Math.round(enemy.maxHp)),
              attack: enemy.attack,
              canEnd:
                enemy.maxHp > 0 &&
                enemy.hp / enemy.maxHp <= TASKMGR_END_HP_RATIO,
            }))
        : [],
    openTaskManager: openTaskMgr,
    dismissTaskManager: dismissTaskMgr,
    applyTaskAction: applyTask,
    /* ---- 深化包：超频 / 病毒引爆回调 ---- */
    overclock: runOverclock,
    detonateVirus: detonateVirusAt,
    /* ---- 表现包：手动斩杀 + 屏幕震动 ---- */
    executeEnemy: executeTarget,
    shake:
      run.phase === "fighting" && (run.shakeUntil ?? 0) > now
        ? { px: run.shakePx ?? 4, alt: (run.shakeSeq ?? 0) % 2 === 1 }
        : null,
    /* 表现包：主动技释放特写（黑边 + 技能名定格），非战斗期不出现 */
    skillFocus:
      run.phase === "fighting" && (run.skillFocusUntil ?? 0) > now
        ? { chargeFull: run.skillFocusChargeFull === true }
        : null,
    /* 词条手动触发：可触发项状态 + 通用无敌窗口是否生效 */
    relicTriggers,
    manualImmuneActive: run.phase === "fighting" && now < run.manualImmuneUntil,
    timeoutRetryHeld: run.relics.some((relic) => relic.id === "timeout-retry"),
    /* 批次 C：金色超时重试按钮的可用态（持有 + 本层未用 + 内存够 3） */
    timeoutRetryLeft:
      run.phase === "relic" &&
      run.relics.some((relic) => relic.id === "timeout-retry") &&
      !run.timeoutRetryUsedThisFloor,
    timeoutRetryAffordable: run.memory >= TIMEOUT_RETRY_MEMORY_COST,
    timeoutRetryCost: TIMEOUT_RETRY_MEMORY_COST,
    timeoutRetry,
    /* 批次 C：G2 热更新刷新按钮的可用态（持有 + 本局未用 + 内存够 2） */
    hotReloadHeld: run.relics.some((relic) => relic.id === "hot-reload"),
    hotReloadUsed: run.hotReloadUsedThisRun,
    hotReloadAffordable: run.memory >= HOT_RELOAD_MEMORY_COST,
    hotReloadCost: HOT_RELOAD_MEMORY_COST,
    hotReloadRefresh,
    lowSpec,
    /* 路线系统 */
    routeChoices: run.routeChoices,
    activeRouteId: run.activeRouteId,
    routeLog: run.routeLog,
    curses: run.curses,
    curseBlockedSkill: run.mods.blockedByCurse,
    pendingRemoveMode: run.pendingRemoveMode,
    log: run.log,
    coachTip: run.coachTip,
    kills: run.kills,
    damageDealt: run.damageDealt,
    now,
    hitFlashMs: HIT_FLASH_MS,
    dodgeActive: run.phase === "fighting" && now < run.dodgeUntil,
    hasteActive: run.phase === "fighting" && now < run.hurtHasteUntil,

    /* 批次 B 机制可见状态（View 接线，relic-redesign.md）：
       - throttleLayers：S5 节流层数（词条栏 label 也用它）
       - blockActive/blockLeftMs：S7 异步觉醒阻塞期（WarningZone 显「阻塞中 X.Xs」）
       - decoyActive：C2 残影诱饵生效中（CharacterPanel 残影与 TabEnemyStrip 共用）
       - miniShields：C5 分裂小护盾飞行列表（TabEnemyStrip 青色光点）
       - darkTheme：C7 暗黑模式（目标卡剪影）
       - closureEchoUid：S3 闭包残像挂在哪个目标卡上 */
    throttleLayers: run.throttleLayers,
    blockActive: run.phase === "fighting" && now < run.blockUntil,
    blockLeftMs: Math.max(0, run.blockUntil - now),
    decoyActive: run.phase === "fighting" && now < run.decoyUntil,
    miniShields: run.miniShields,
    darkTheme: run.mods.darkTheme,
    closureEchoUid: run.closureEcho?.uid ?? null,
    /* 角色被动 / 主动技的可见状态 */
    dodgeHasteActive: run.phase === "fighting" && now < run.dodgeHasteUntil,
    doubleStrikeActive:
      run.phase === "fighting" && now < run.doubleStrikeUntil,
    listenStacks: run.listenStacks,
    listenStacksMax: LISTEN_STACKS_MAX,
    syncStacks: run.syncStacks,
    syncStacksMax: SYNC_STACKS_MAX,
    multithreadActive: run.phase === "fighting" && now < run.multithreadUntil,
    rootActive:
      run.phase === "fighting" &&
      run.character.id === "kernel-shade" &&
      run.playerMaxHp > 0 &&
      run.playerHp < run.playerMaxHp * ROOT_HP_RATIO,
    freezeActive: run.phase === "fighting" && now < run.freezeUntil,
    freezeLeftMs: Math.max(0, run.freezeUntil - now),
    deathWards: run.deathWards,
    reviveCount: run.reviveCount,
    cursed: run.cursedFloor !== null,
    cursedFloor: run.cursedFloor,

    /* 内存资源（v2）：余额向上取整展示 / 当前上限 / 4 区间 / 是否阻塞态（耗尽区） */
    memory: Math.ceil(run.memory),
    memoryMax: run.maxMemory,
    memoryZone: memoryZoneOf(run),
    memoryLow: memoryZoneOf(run) === "exhausted",
    /* ---- 核心体验包 v2（core-experience-pack2.md）二：缓存电池的 HUD 接线 ---- */
    /** 超出上限的读数（顶栏「+N」金角标；区间与格子条按夹逼值显示） */
    memoryOverflow: Math.max(0, Math.ceil(run.memory) - run.maxMemory),
    /** 缓存盒快照：存量槽 / 本层剩余存入次数 / 底钮可用态 */
    cacheView: {
      slots: run.cacheSlots ?? [],
      depositLeft: run.cacheDepositLeft ?? 0,
      canDeposit:
        (run.cacheDepositLeft ?? 0) > 0 &&
        (run.cacheSlots ?? []).length < CACHE_MAX_SLOTS &&
        run.memory >= CACHE_PER,
      canBurn: (run.cacheSlots ?? []).some((value) => value > 0),
    },
    cachePer: CACHE_PER,
    cacheTakeCost: CACHE_TAKE_COST,
    cacheBurnBonus: CACHE_BURN_BONUS,
    cacheSlotsTotal: CACHE_MAX_SLOTS,
    cacheOpen: run.phase === "overlay" && run.overlayKind === "cache",
    /** 顶栏缓存芯片：战斗中与缓存盒开着时都挂着 */
    cacheChipVisible:
      run.phase === "fighting" ||
      (run.phase === "overlay" && run.overlayKind === "cache"),
    openCacheBox: openCacheBoxPanel,
    dismissCacheBox: dismissCacheBoxPanel,
    cacheDeposit: cacheDepositAction,
    cacheTake: cacheTakeSlot,
    cacheBurn: cacheBurnAll,
    /* ---- 深化包（deepening-pack.md）：碎片与超频的 HUD 状态 ---- */
    /** 当前碎片数（0~8）：内存条右侧徽标 */
    memFrags: run.memFrags ?? 0,
    /** 下次进层回满的实际水位（碎片 >0 时低于上限） */
    memoryRefill: Math.max(
      3,
      Math.min(run.maxMemory, run.maxMemory - (run.memFrags ?? 0)),
    ),
    overclockReady: overclockAvailable(run),
    overclockActive: run.phase === "fighting" && now < (run.ocUntil ?? 0),
    overclockLeftMs: Math.max(0, (run.ocUntil ?? 0) - now),
    overclockHot:
      run.phase === "fighting" &&
      now >= (run.ocUntil ?? 0) &&
      now < (run.ocPenaltyUntil ?? 0),
    overclockHotLeftMs: Math.max(0, (run.ocPenaltyUntil ?? 0) - now),
    /* ---- UI 包 v1（ui-pack.md）：格子/条切换 + 斩杀线 ---- */
    memoryDisplay,
    /* ---- UI 包 v2（ui-pack2.md）：底部信息条可关闭 ---- */
    combatFooter,
    toggleCombatFooter,
    /* ---- UI 包 v3（ui-pack3.md）：禅模式折叠态 + 内存历史曲线 ---- */
    topDetailsExpanded: run.uiZen === false,
    toggleTopDetails,
    memoryHist: run.memoryHist ?? [],
    executeMarkRatio:
      run.mods.executeAll > 0 || run.mods.darkExecuteCritRatio > 0
        ? Math.max(run.mods.executeAll, run.mods.darkExecuteCritRatio)
        : null,

    /* 本局临时碎片：局内余额，死亡作废，可用于付费刷新 / 升级回复 / 复活 */
    shards: run.shards,
    shardPulse: run.shardPulseAt > 0 && now - run.shardPulseAt < SHARD_PULSE_MS,
    paidRerollCost: PAID_REROLL_COST,
    paidRerollUsed: run.floorPaidRerollUsed,
    skipUpgradeCost: SKIP_HEAL_UPGRADE_COST,
    skipUpgradeAmount: SKIP_HEAL_UPGRADE_AMOUNT,
    paidReviveCost: PAID_REVIVE_COST,
    paidReviveUsed: run.paidReviveUsed,
    canPaidRevive:
      run.phase === "dead" &&
      !run.paidReviveUsed &&
      run.shards >= PAID_REVIVE_COST,

    /* 幽灵对照：普通开局恒为 null，页面与以前完全一致 */
    ghost: run.seed === dailySeed ? ghost : null,
    ghostBeaten,

    /* 局内浮层 */
    overlayKind: run.overlayKind,
    shopStock: run.shopStock,
    altarOffer: run.altarOffer,
    altarCost: run.altarCost,
    altarPendingRelic: run.altarPendingRelic,
    altarType: run.altarType,
    altarLifeCost: ALTAR_LIFE_SHARD_COST,
    altarMemoryHpCost: ALTAR_MEMORY_HP_COST,
    bloodToll: Math.max(1, Math.ceil(run.playerHp * ALTAR_BLOOD_RATIO)),
    relicSlotsFull: run.relics.length >= relicSlotCap(run),

    /* 技能 */
    activeName: run.character.activeName,
    activeDesc: run.character.activeDesc,
    activeCooldownLeft,
    activeCooldownRatio,
    activeReady: run.phase === "fighting" && activeCooldownLeft <= 0,
    dodgeCooldownLeft,
    dodgeCooldownRatio,
    dodgeReady: run.phase === "fighting" && dodgeCooldownLeft <= 0,
    /* 长按蓄力：进度环 + 是否蓄力中（供技能按钮渲染 conic 进度） */
    skillCharging,
    chargeRatio,
    chargeFull: chargeRatio >= 1,

    /* ---- HUD 构筑包（hud-forge-pack.md）---- */
    /** 三模块停靠位（缺省全 default） */
    dock: run.dock ?? HUD_DEFAULT_DOCK,
    /** 当前激活的构筑收益（顶栏「构筑：…」行 + 模块角徽标） */
    hudActivePerks: hudPerks(run.dock).active.map((id) => ({
      id,
      name: HUD_PERK_NAME[id],
    })),
    /** 拖拽落锚：占位互换、pick 音、新收益横幅（View 侧手势达 12px 守卫后调用）
     *  perf-experience-pack.md C：改用上方 useCallback 稳定引用，行为不变 */
    dragDock: dragDockStable,

    /* 词条 */
    relics: run.relics,
    relicSlots: relicSlotCap(run),
    schoolCounts,
    bonds,
    bondPool: BOND_DEFS,
    choices: run.choices,
    pendingRelic: run.pendingRelic,
    relicPickIndex: run.relicPickIndex,
    rerollsLeft: run.rerollsLeft,

    /* Boss */
    boss: boss ?? null,
    bossCountdownMs,
    bossCountdownTotal: run.bossLimitMs,
    bossSkills,
    bossPassive,
    bossPending: boss?.boss?.pending ?? null,
    bossClick: run.bossClick,
    bossStun: run.phase === "fighting" && now < run.bossStunUntil,
    bossFlash: run.phase === "fighting" && now < run.bossFlashUntil,
    bossSpeedCut: run.phase === "fighting" && now < run.bossSpeedCutUntil,
    bossLine: run.bossLine,
    minions,

    /* 批次二收尾·Boss QTE（View 据此渲染中央覆盖层与倒计时环） */
    qte: run.qte,
    qteSeq: run.qteSeq,
    qteElapsedMs,
    qtePressing,
    qtePressRatio,
    playMode: run.playMode,
    qteTap: handleQteTap,
    qtePopupClick: handleQtePopupClick,
    qtePressStart: handleQtePressStart,
    qtePressEnd: handleQtePressEnd,

    /* 通用战斗规则：暂停 / 层限时 / 敌人前摇 / 验证码题 */
    paused: run.paused,
    /** 进层准备闸：Ready 浮层显示态（点「开始战斗」或按空格开战） */
    readyFloor: run.phase === "fighting" && run.readyFloor === true,
    overtime: run.overtime,
    floorTimeLimit: config.timeLimitMs,
    floorTimeLeft: run.bossDeadline > 0 ? Math.max(0, run.bossDeadline - now) : 0,
    challenge: run.challenge,
    autoAttacking: run.phase === "fighting" && now - run.lastAttackAt < 420,
    nextAttackInMs: Math.max(0, run.nextAutoAt - now),

    /* 第 8 层通关解锁的外观 */
    victorySkin,

    /* 结束态 */
    cause: run.cause,
    cleared,
    reward,

    /* 操作 */
    pressActiveStart: chargeStart,
    /* 按钮来源的 move 带 fromButton 标记：划出按钮 = 漂移拖拽（战斗区来源维持旧「划开取消」） */
    pressActiveMove: (x: number, y: number) => chargeMove(x, y, true),
    pressActiveEnd: chargeEnd,
    /* ---- 故障手感包（glitch-feel-pack.md）---- */
    /** 漂移拖拽中的幽灵按钮位置（null = 不在拖） */
    skillDragPos,
    /** 点 HUD 内存徽章触发：错位 6 秒迷惑管理员与泄漏（碎片 +2） */
    fakeMemoryRead: () => setRun(fakeMemoryRead),
    /** 内存错位进行态：HUD 数字换成抖动的假值 */
    memFakeActive: run.phase === "fighting" && now < (run.memFakeUntil ?? 0),
    /** 角色攻击轨迹（View 按 uid 挂敌人卡 / null 挂角色面板） */
    attackFx: run.phase === "fighting" ? (run.fx ?? []) : [],
    /** 顿帧冻结中：战斗区整块提亮定格（低配不挂） */
    hitStopHeld:
      run.phase === "fighting" && !!run.hitStopUntil && run.now < run.hitStopUntil,
    /** 顿帧冲击闪光的重挂载键 */
    hitStopKey: run.hitStopSeq ?? 0,
    /* ---- 弹窗干扰包（popup-jam-pack.md）---- */
    /** 当前糊在主动技按钮上的弹窗（仅战斗中给 View） */
    screenJam: run.phase === "fighting" ? (run.screenJam ?? null) : null,
    /** 距爆炸剩余比例 1→0（View 倒计时细条） */
    screenJamRatio: run.screenJam
      ? Math.max(
          0,
          (run.screenJam.explodeAt - now) / POPUP_JAM_EXPLODE_MS,
        )
      : 1,
    /** 拖甩成功：uid = 松手落在敌人卡上 = 糊脸砸人；null = 甩出屏幕（碎片 +2） */
    flingScreenJam: (uid: string | null) =>
      setRun((prev) => flingScreenJam(prev, uid)),
    /** 点一下 ×（三下关掉、无奖励；恶意弹窗的 × 每点一下跳锚点） */
    tapScreenJamX: () => setRun(tapScreenJamX),
    /** 拟物化战斗包（skeuo-boss-pack.md 二）：恶意弹窗假「立即领取」点击（只骗一次） */
    onJamClaim: () => setRun(jamTrapClaimed),
    /* ---- 拟物化战斗包（skeuo-boss-pack.md 一）：广告 Boss 弱点 × ---- */
    /** 弱点 × 的 View 状态（槽位/冷却中/本体血量比）；非广告 Boss 阶段 2 = null */
    bossWeak:
      run.phase === "fighting" &&
      boss?.defId === "boss-fullscreen" &&
      boss.boss?.phase === 2 &&
      boss.boss.bodyHp > 0
        ? {
            slot: boss.weakSlot ?? 0,
            cooling: now < (boss.weakCdUntil ?? 0),
            ratio:
              boss.boss.bodyMaxHp > 0
                ? boss.boss.bodyHp / boss.boss.bodyMaxHp
                : 0,
          }
        : null,
    /** 点中弱点 ×：固定 15 伤 + 冷却 1.2s + 跳下一锚点 */
    hitAdWeakSpot: () => setRun(hitAdWeakSpot),
    /* ---- 浏览器特性包 v1（browser-powers-pack.md 一）：分身窗口 ---- */
    /** 分身读条 View 状态（没在读 / Boss 没了 = null）；tapsLeft=还差连点，castRatio=剩余/7000（1→0） */
    bossClone:
      run.phase === "fighting" &&
      boss?.defId === "boss-fullscreen" &&
      run.bossCloneCastUntil !== undefined &&
      run.bossCloneCastUntil > now
        ? {
            tapsLeft: run.bossCloneTaps ?? 0,
            castRatio: Math.max(
              0,
              Math.min(1, (run.bossCloneCastUntil - now) / CLONE_CAST_MS),
            ),
          }
        : null,
    /** 分身窗口里点一下 ×（3 下归零 = 打断 + Boss 眩晕 2.5 秒；引擎守卫无效点击） */
    tapBossClone: () => setRun(tapBossClone),
    /* ---- UI 武器包（ui-arsenal-pack.md）---- */
    /** 地址栏「清理缓存」：本层 1 次、3 内存，拔光敌人护盾与回血 */
    clearCache: () => setRun(clearCache),
    cacheCleared: !!run.floorCacheCleared,
    canClearCache:
      run.phase === "fighting" &&
      !run.floorCacheCleared &&
      !run.adminActive &&
      !run.enemies.some(
        (enemy) => enemy.kind === "boss" || enemy.kind === "bigboss",
      ),
    pressDodge,
    shiftLock,
    lockTarget,
    dragCloseTarget,
    dismissPopup,
    pickShard,
    setEnemyDragging,
    triggerRelicCard,
    battlePointerDown,
    battlePointerMove,
    battlePointerUp,
    lockButton,
    pickChallengeSymbol,
    pressBossSkip,
    pressPause,
    pressFloorStart,
    selectRelic,
    replaceRelic,
    cancelReplace,
    reroll,
    paidReroll,
    skipRelic,
    paidRevive,
    buyShopItem,
    leaveShop,
    pickRoute,
    removeTarget,
    skipRemove,
    copyMirrorRelic,
    skipMirrorPanel,
    chooseAltarCost,
    replaceAltarRelic,
    leaveAltar,
    restart,
    exitToHome,
    viewResult,
    copySeed,
  }
}
