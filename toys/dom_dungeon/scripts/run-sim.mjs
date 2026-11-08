/**
 * 《标签地牢》对局模拟器 v5（一次性核对用，不参与构建）
 *
 * 直接 import 真实数据（角色 / v4 词条池 / 8 流派 combo / 每层配置 / 路线池），
 * 按战斗引擎的公式逐层推演，随机三选一 + 路线选择，跑 N 局统计每层死亡率与通关率。
 *
 * ── v5 路线系统适配说明（规格 .rh/pages/dungeon-route.md）──
 * 每层循环改为引擎真实流程：
 *   战斗层清空 → 三选一（含路线稀有度保底）→ 镜像复制 → 从路线池选路 → 进下一层
 * - 路线池 getRoutePool(刚打完的层)；第 1 层开局与第 8 层 Boss 固定，不走路线；
 *   第 7 层池选到战斗路线也只进固定 Boss（引擎 enterFloor 已按契约回落固定配置）。
 * - 事件房（回收站 / 未知区域商店·祭坛·宝箱·陷阱·空）消耗一个层号、不战斗、
 *   不走三选一，处理完从消耗后的层号重新选路。未知区域精英 = 战斗层。
 * - 进模拟的路线机制：镜像抄牌（词条数×8% 敌攻速，封顶 3 条）、防火墙（全体敌人
 *   回盾 20/3s）、时间裂隙（每敌 15 秒倒计时，到点未死玩家 −30 血循环）、
 *   广告轰炸诅咒（战斗路线层敌人 +1 弹窗）、槽位/刷新/稀有度保底奖励。
 * - 进模拟的诅咒机制：限速（玩家攻速 -15%）、断网（主动技失效）、蓝屏（每 10 秒
 *   卡 1 秒 → 玩家 DPS ×10/11）、病毒（进战斗层 -10 血）。内存泄漏诅咒不进模拟。
 * - 不进模拟（偏乐观，同 v4 口径）：碎片经济（广告峡谷掉率 ×2、数据矿脉偷碎片、
 *   各路线 shardReward）、内存经济（缓存深渊补给、祭坛/商店购买）、回收站丢牌决策。
 *
 * ── v4 适配说明（机制型词条重设计，规格 .rh/pages/relic-redesign.md）──
 * 词条池 44→30、BondDef 改为 {id,name,relicIds,desc}（无 effect 字段）。
 *
 * 【进模拟的机制效果（有纯数值等价物）】
 *   N7 限流        enemyIntervalMult 1.3          —— 敌 DPS 直算
 *   C1 Flex 布局   startShield 5（每层开局补盾）  —— 盾条直算
 *   C6 层叠上下文  盾存在时攻击 +20%              —— 逐段结算时按当前盾量开关
 *   M4 内存泄漏    攻击 ×(1+5%×(层-1))            —— 与引擎一致（useDungeon 按 floor-1）
 *   N2 缓存命中    第 4 击必暴                    —— 折算为暴率期望增益 (1-crit)×25%
 *   S3 闭包        主动技等效 ×2                  —— activeDps ×2
 *   S7 异步觉醒    主动 ×2 但 3 秒阻塞            —— activeDps ×2、自动攻击 ×cd/(cd+3s)
 *   C7 暗黑模式    全体敌人血量减半（含 Boss 与按钮）—— 逐段血量减半；
 *                  大 Boss 阶段阈值是绝对血量（223/100），减半后 155 血开局即进
 *                  阶段 2（玩家攻速减半段），本脚本按引擎真实行为分段。
 *   M1 本地存储    每层存 10 血、下层初生效        —— 折算为 healPerFloor +10
 *   N5+保命流      复活 30%→60%（引擎 buildMods 同款规则）
 *   精英敌人       血 ×1.8 攻 ×1.25（v3 已有，此处补齐）
 *
 * 【不进模拟、列人工判据（数值与手算见 .rh/balance.md「v4 机制词条」段）】
 *   S1/S2 弹射、S4 三连击、S6 链式暴击、S5 节流挡伤、C2 残影、C3 响应式重构、
 *   C4 过渡减速、C5 护盾分裂、N3 溢出转移、N4 穿透、M5 击杀回内存、M6 免死、
 *   M7 离线无敌、G1 跨域顶替、G2 多选项、N6 重试、M3 Cookie 多选、M2 碎片
 *   —— 以及全部「内存经济」（回复/消耗/上限压缩，镜像复制的内存上限 -2 同理）。
 *   因此本脚本通关率是「机制全不计」的下界基线，真实通关率 ≥ 本值。
 *
 * 与真实对局的其它差异（模拟偏乐观）：
 *   - 忽略商店 / 祭坛浮层的购买行为（诅咒祭坛的白拿词条 + 诅咒已模拟）
 *   - 忽略 Boss 技能的额外伤害与召唤物
 *   - N5 复活的内存门槛（≥5）按内存充足处理（偏乐观）
 *   - 手动闪避按固定有效率折算，不模拟操作水平
 */

import {
  CHARACTER_COMBAT,
  DUNGEON_CHARACTERS,
  RELIC_POOL,
  DUNGEON_RUN_FLOORS,
  ENEMY_DEFS,
  ROUTE_TYPES,
  getRoutePool,
  CURSE_DEFS,
  FLOOR_TIME_LIMIT_MS,
  OVERTIME_ATTACK_MULT,
  scaleCombatForFloor,
  getActiveBondDefs,
  BOSS_CRASH_PHASE2_AT,
  BOSS_CRASH_PHASE3_AT,
  CAPTCHA_BREAK_MS,
  CAPTCHA_CHALLENGE_INTERVAL_MS,
  CAPTCHA_BREAK_DAMAGE_MULT,
  DODGE_WINDOW_MS,
  FLOOR_CLEAR_HEAL,
  ELITE_HP_MULT,
  ELITE_ATTACK_MULT,
  AD_SHIELD_REGEN_MS,
  AD_SHIELD_REGEN_AMOUNT,
  BOSS_AD_BUTTONS,
  BOSS_AD_BUTTON_HP,
  LEAK_REGEN_MS,
  LEAK_REGEN_AMOUNT,
  LEAK_SHIELD_REFRESH_MS,
  LEAK_SHIELD_REFRESH_AMOUNT,
  MEMORY_BASE_MAX,
  MEMORY_MAX_CAP,
  MEMORY_MIN_CAP,
  memoryBaseMaxForFloor,
} from "../src/lib/dungeonData.ts"

/* ---------------- 从代码同步的机制常量 ---------------- */
const RELIC_SLOTS = 6
const BOSS_FLOOR = DUNGEON_RUN_FLOORS.length
/** 引擎内常量（useDungeon.ts 未导出，数值核对自该文件）：DARK_HP_MULT = 0.5 */
const DARK_HP_MULT = 0.5
/** 路线机制常量（useDungeon.ts 批次 B/C 路线段，数值核对自该文件） */
const MIRROR_HASTE_PER_RELIC = 0.08 // 镜像空间：每词条敌攻速 +8%，封顶 3 条
const FIREWALL_REGEN = 20 / 3 // 防火墙：全体敌人回盾 20/3s
const TIME_RIFT_MS = 15000 // 时间裂隙：每敌 15 秒倒计时
const TIME_RIFT_PENALTY_HP = 30 // 到点未死：玩家 −30 血（无视护盾与闪避）
const BLUESCREEN_DPS_MULT = 10 / 11 // 蓝屏诅咒：每 10 秒卡 1 秒
const CURSE_THROTTLE_INTERVAL = 1.15 // 限速诅咒：玩家攻速 -15%
const CURSE_VIRUS_HP = 10 // 病毒诅咒：进战斗层 -10 血
const AD_BOMB_POPUP = { defId: "popup", hp: 60, attack: 3 } // 广告轰炸：战斗路线层 +1 弹窗
const UNKNOWN_TRAP_DAMAGE = 20 // 未知区域陷阱：-20 血（最低 1）
const CURSE_IDS = Object.keys(CURSE_DEFS)
/** 验证码破防覆盖率 = 破防时长占出题周期的比例 × 点对率。
 * 点对率是唯一凭经验取的参数（真人操作水平），其余全部来自引擎常量。*/
const CAPTCHA_HIT_RATE = 0.7
const BREAK_COVER = (CAPTCHA_BREAK_MS / CAPTCHA_CHALLENGE_INTERVAL_MS) * CAPTCHA_HIT_RATE
/** 手动闪避：窗口固定 DODGE_WINDOW_MS，能挡掉理论覆盖率为「窗口 ÷ 冷却」的伤害。
 * MANUAL_DODGE_USE 是玩家把这理论覆盖率用在刀刃上的比例（唯一经验参数）。*/
const MANUAL_DODGE_USE = 0.5
const AD_SHIELD_RATE = AD_SHIELD_REGEN_AMOUNT / (AD_SHIELD_REGEN_MS / 1000) // 第 3 层补盾
const LEAK_REGEN_RATE = LEAK_REGEN_AMOUNT / (LEAK_REGEN_MS / 1000) // 第 7 层回血
const LEAK_SHIELD_RATE =
  LEAK_SHIELD_REFRESH_AMOUNT / (LEAK_SHIELD_REFRESH_MS / 1000) // 第 7 层补盾
const CRASH_MAX = DUNGEON_RUN_FLOORS[7].enemies[0].hp
const CRASH_P2 = BOSS_CRASH_PHASE2_AT
const CRASH_P3 = BOSS_CRASH_PHASE3_AT
const CRASH_SPEED_CUT = 0.5
const CRASH_ATTACK_MULT = 2
const CRASH_DODGE_BONUS = 0.2

/* —— 临时调参实验（验证后同步回 dungeonData.ts） —— */
const FLOOR_HEAL = Number(process.env.FH ?? FLOOR_CLEAR_HEAL)

const MULT_KEYS = new Set([
  "attackMult",
  "attackIntervalMult",
  "enemyIntervalMult",
  "activeCooldownMult",
  "dodgeCooldownMult",
  "shieldMaxMult",
  "activeDamageMult",
])

function mergeEffect(target, extra) {
  if (!extra) return
  for (const key of Object.keys(extra)) {
    const value = extra[key]
    if (typeof value !== "number") continue
    if (MULT_KEYS.has(key)) {
      target[key] = (typeof target[key] === "number" ? target[key] : 1) * value
    } else {
      target[key] = (target[key] ?? 0) + value
    }
  }
}

/**
 * 精简版 buildMods：只保留影响 DPS / EHP 的字段。
 * v4：BondDef 无 effect，combo 效果按引擎 buildMods 同款规则显式接（保命流复活 0.6；
 * 内存流回复倍率、斩杀流链爆降耗等只影响内存经济 → 只统计不模拟）。
 * v5：curses 数组进参数 —— 限速压攻速、断网废主动（蓝屏/病毒的生效点在 fightFloor /
 * 进层血量处理，不在这里）。
 */
function buildMods(charId, relics, floor, curses = []) {
  const combat = scaleCombatForFloor(CHARACTER_COMBAT[charId], floor)
  const agg = {}
  for (const relic of relics) mergeEffect(agg, relic.effect)
  const ids = new Set(relics.map((r) => r.id))
  const comboIds = new Set(getActiveBondDefs(relics).map((b) => b.id))

  /* v2 内存上限：与引擎同式 —— 基础上限 8+⌊层/2⌋ + delta，夹逼 [3,20]
     （useDungeon.ts buildMods memoryMax，只统计供报告；镜像复制的 -2 不进模拟）*/
  const memoryMax = Math.min(
    MEMORY_MAX_CAP,
    Math.max(
      MEMORY_MIN_CAP,
      memoryBaseMaxForFloor(floor) +
        (agg.memoryMaxDelta ?? 0) +
        (agg.memoryMaxPerFloorDelta ?? 0) * floor,
    ),
  )

  /* 复活：保命流 0.3→0.6（引擎同款）*/
  const reviveChance =
    comboIds.has("combo-guard") && (agg.reviveChance ?? 0) > 0 ? 0.6 : (agg.reviveChance ?? 0)

  /* N2 第 4 击必暴：每 4 击 1 击从「按面板暴率」变 100% → 期望增益 (1-crit)×1/4 */
  const baseCrit = Math.min(0.8, combat.critChance + (agg.critChance ?? 0))
  const critChance = agg.fourthHitCrit
    ? Math.min(0.95, baseCrit + (1 - baseCrit) * 0.25)
    : baseCrit

  /* S7 阻塞：主动放完 3 秒不能攻击 → 自动 DPS 折算 ×cd/(cd+block) */
  const blockMs = agg.blockActiveMs ?? 0
  const activeCdMs = Math.round(combat.activeCooldownMs * (agg.activeCooldownMult ?? 1))
  const blockFactor = blockMs > 0 ? activeCdMs / (activeCdMs + blockMs) : 1

  /* S3 闭包：主动技 1.5s 后再来一次（不吃二次闭包）→ 主动输出 ×2 */
  const activeDmgMult = (agg.activeDamageMult ?? 1) * (ids.has("closure") ? 2 : 1)

  /* M1 本地存储：每层存 10、下层初回 → 折算层回 +10 */
  const healPerFloor = (agg.healPerFloor ?? 0) + (agg.storageHealPool ?? 0)

  const mods = {
    attack:
      (combat.attack + (agg.attackFlat ?? 0)) *
      (1 + (agg.attackMult ?? 0)) *
      (1 + (agg.attackPerFloorMult ?? 0) * Math.max(0, floor - 1)) * // M4
      blockFactor,
    shieldAttackBonus: agg.shieldAttackBonus ?? 0,
    hasShieldAttack: Boolean(agg.shieldAttackBonus),
    intervalMs: combat.attackIntervalMs * (agg.attackIntervalMult ?? 1),
    critChance,
    critMult: combat.critMult + (agg.critMult ?? 0),
    /* 饼干窃贼被动：主动 6 伤 + 吸 6；工作僧侣：每 8 击固定 8 → 每击 +1 */
    hitFlat: charId === "worker-monk" ? 1 : 0,
    killHeal: (agg.healOnKill ?? 0) + (charId === "cookie-thief" ? 3 : 0),
    penetration: Math.min(1, agg.penetration ?? 0),
    maxHp: combat.maxHp + (agg.maxHpFlat ?? 0),
    shield: combat.startShield + (agg.startShield ?? 0),
    dodge: Math.min(0.6, combat.dodgeChance + (agg.dodgeChance ?? 0)),
    dr: agg.damageReduction ?? 0,
    activeCdMs,
    activeDmgMult,
    enemyIntervalMult: agg.enemyIntervalMult ?? 1,
    healPerFloor,
    reviveChance,
    reviveHpRatio: agg.reviveHpRatio ?? 0.3,
    dodgeCdMs: Math.round(combat.dodgeCooldownMs * (agg.dodgeCooldownMult ?? 1)),
    darkTheme: (agg.darkTheme ?? 0) > 0,
    memoryMax,
    memoryRegenMult: comboIds.has("combo-memory") ? 0.5 : 1,
    comboCount: comboIds.size,
    /* v5 诅咒：限速压玩家间隔（引擎 buildMods extras 同款乘区）；断网废主动 */
    noActive: curses.includes("curse-offline"),
  }
  if (curses.includes("curse-throttle")) mods.intervalMs *= CURSE_THROTTLE_INTERVAL
  return mods
}

/** 敌人有效血量（暗黑减半在前、精英倍率在后者，与引擎 makeEnemy 顺序一致） */
function effHp(spec, mods) {
  let hp = spec.hp
  if (mods.darkTheme) hp = Math.max(1, Math.round(hp * DARK_HP_MULT))
  if (spec.elite) hp = Math.max(1, Math.round(hp * ELITE_HP_MULT))
  return hp + (spec.shield ?? 0)
}
function effAttack(spec) {
  return spec.elite ? Math.max(1, Math.round(spec.attack * ELITE_ATTACK_MULT)) : spec.attack
}

/**
 * 玩家对某个护甲的净 DPS。
 * 顺序照引擎来：先做验证码的破防 / 未破防折算，再减护甲，每次伤害下限 1 点。
 * atkMult 用于「盾存在时攻击 +20%」按当前盾量开关（C6）。
 */
function playerDps(mods, defense, speedCut = 1, guarded = false, atkMult = 1) {
  const critFactor = 1 + mods.critChance * (mods.critMult - 1)
  const perHit = mods.attack * atkMult * critFactor + mods.hitFlat
  const pen = defense * (1 - mods.penetration)
  const hitOf = (raw) => Math.max(1, Math.round(raw - pen))
  let avgHit
  if (guarded) {
    const broken = hitOf(perHit * CAPTCHA_BREAK_DAMAGE_MULT)
    const safe = Math.max(1, Math.round(Math.round(perHit * 0.2) - pen))
    avgHit = BREAK_COVER * broken + (1 - BREAK_COVER) * safe
  } else {
    avgHit = hitOf(perHit)
  }
  return avgHit * (1000 / mods.intervalMs) * speedCut
}

/** 主动技折算成额外 DPS（防御向主动按旧口径折算；断网诅咒下直接不能用） */
function activeDps(charId, mods, defense, guarded = false) {
  if (mods.noActive) return 0
  const base = playerDps(mods, defense, 1, guarded)
  const cd = mods.activeCdMs / 1000
  let raw
  switch (charId) {
    case "tab-assassin":
      raw = (8 * mods.activeDmgMult) / cd
      break
    case "script-warrior":
      raw = (base * 2 * mods.activeDmgMult) / cd
      break
    case "incognito-ranger":
      raw = base * 0.3 * (1.5 / cd)
      break
    case "cookie-thief":
      raw = (6 * mods.activeDmgMult) / cd
      break
    case "worker-monk":
      // 主动 3 秒攻速 +60%
      raw = base * ((0.6 * 3) / cd)
      break
    case "cache-mage":
    case "kernel-shade":
    default:
      raw = 0 // 护盾向 / 冻结向主动折算进生存，不计输出
      break
  }
  /* S7 释放后 3 秒阻塞：主动收益被 buildMods 的 blockFactor 反向吃掉了自动段，
     这里不再二次折减 */
  return raw
}

/** 敌人总 DPS（含限流词条的间隔放大；镜像抄牌按 speedMult 放大） */
function enemyDps(specs, mods, speedMult = 1) {
  let total = 0
  for (const spec of specs) {
    const def = ENEMY_DEFS[spec.defId]
    total +=
      (effAttack(spec) * 1000 * speedMult) / (def.attackIntervalMs * mods.enemyIntervalMult)
  }
  return total
}

/**
 * 打一层，返回 { seconds, hpLost, dead }
 * 按敌人逐个击破推演（敌人 DPS 随击杀递减），Boss 层分段处理。
 * opts（v5 路线层修正项）：
 *   speedMult 敌全体出手倍率（镜像抄牌）      regenAll 敌全体每秒回盾（防火墙）
 *   rift     挂时间裂隙倒计时（每 15s 对每个活着的敌人扣玩家 30 血）
 *   pMult    玩家 DPS 折算（蓝屏诅咒 ×10/11）
 */
function fightFloor(charId, mods, floorCfg, floor, hpIn, shieldIn, opts = {}) {
  const speedMult = opts.speedMult ?? 1
  const regenAll = opts.regenAll ?? 0
  const pMult = opts.pMult ?? 1
  let hp = hpIn
  let shield = shieldIn
  let seconds = 0
  /* C6：攻击加成按「当前是否有盾」开关（引擎逐发判定，这里逐段近似）*/
  const atkMult = () => (mods.hasShieldAttack && shield > 0 ? 1 + mods.shieldAttackBonus : 1)

  /**
   * 承受 specs 这些敌人在 secs 秒内的全部攻击。
   * damageReduction 是「每次命中减 N 点」（引擎口径），每次伤害下限 1 点。
   */
  const takeDamage = (specs, secs, attackMult = 1) => {
    let raw = 0
    for (const sp of specs) {
      const def = ENEMY_DEFS[sp.defId]
      const interval = (def.attackIntervalMs * mods.enemyIntervalMult) / 1000
      raw += (secs / interval) * Math.max(1, effAttack(sp) * attackMult - mods.dr)
    }
    const manual = Math.min(0.6, (DODGE_WINDOW_MS / mods.dodgeCdMs) * MANUAL_DODGE_USE)
    const dodgeFactor = 1 - mods.dodge - manual * (1 - mods.dodge)
    const incoming = raw * speedMult * Math.max(0.15, dodgeFactor)
    const absorbed = Math.min(shield, incoming)
    shield -= absorbed
    hp -= incoming - absorbed
  }

  /* Boss 层：第 4 层按钮 + 本体，第 8 层三阶段 */
  if (floorCfg.bossKind === "ad") {
    const buttonHp = mods.darkTheme
      ? Math.max(1, Math.round(BOSS_AD_BUTTON_HP * DARK_HP_MULT))
      : BOSS_AD_BUTTON_HP
    const bodyHp = mods.darkTheme
      ? Math.max(1, Math.round(DUNGEON_RUN_FLOORS[3].enemies[0].hp * DARK_HP_MULT))
      : DUNGEON_RUN_FLOORS[3].enemies[0].hp
    const def = ENEMY_DEFS["boss-fullscreen"].defense
    const buttonDps =
      (playerDps(mods, def, 1, false, atkMult()) + activeDps(charId, mods, def)) * pMult
    const t1 = (BOSS_AD_BUTTONS * buttonHp) / buttonDps
    takeDamage(floorCfg.enemies, t1)
    seconds += t1
    if (hp <= 0) return { seconds, dead: true, hp: 0, shield }
    const t2 =
      bodyHp /
      ((playerDps(mods, def, 1, false, atkMult()) + activeDps(charId, mods, def)) * pMult)
    takeDamage(floorCfg.enemies, t2)
    seconds += t2
    return { seconds, dead: hp <= 0, hp: Math.max(0, hp), shield }
  }

  if (floorCfg.bossKind === "crash") {
    const def = ENEMY_DEFS["boss-crash"].defense
    const dm = mods.darkTheme ? DARK_HP_MULT : 1
    /* 阶段阈值是绝对血量（223/100）。暗黑把上限 310 削到 155 →
       开局即进阶段 2（玩家攻速减半段），阶段 1 段长为 0 —— 按引擎真实行为分段 */
    const maxHp = Math.max(1, Math.round(CRASH_MAX * dm))
    const segs = [
      { hp: Math.max(0, maxHp - Math.max(CRASH_P2, maxHp > CRASH_P2 ? CRASH_P2 : maxHp)), speed: 1, attackMult: 1 },
      {
        hp: Math.max(0, Math.min(maxHp, CRASH_P2) - Math.min(maxHp, CRASH_P3)),
        speed: CRASH_SPEED_CUT,
        attackMult: 1,
      },
      {
        hp: Math.min(maxHp, CRASH_P3),
        speed: 1,
        attackMult: CRASH_ATTACK_MULT,
      },
    ]
    for (const seg of segs) {
      if (seg.hp <= 0) continue
      const dps =
        (playerDps(mods, def, seg.speed, false, atkMult()) +
          activeDps(charId, mods, def) * seg.speed) *
        pMult
      const t = seg.hp / dps
      const savedDodge = mods.dodge
      if (seg.attackMult === CRASH_ATTACK_MULT)
        mods.dodge = Math.min(0.6, mods.dodge + CRASH_DODGE_BONUS)
      takeDamage(floorCfg.enemies, t, seg.attackMult)
      mods.dodge = savedDodge
      seconds += t
      if (hp <= 0) return { seconds, dead: true, hp: 0, shield }
    }
    return { seconds, dead: false, hp, shield }
  }

  /* 普通层（固定普通层 + 路线战斗层）：逐个击破；打第 i 个时，第 i 个之后的敌人也都在出手 */
  const specs = floorCfg.enemies
  let riftT = 0 // 时间裂隙：从进层起计的累计秒数（敌人倒计时与层同时钟）
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]
    const def = ENEMY_DEFS[spec.defId]
    const dps =
      (playerDps(mods, def.defense, 1, spec.guard, atkMult()) +
        activeDps(charId, mods, def.defense, spec.guard)) *
      pMult
    /* 自愈：第 3 层补盾 / 第 7 层回血 + 补盾 / 防火墙全体回盾 */
    let regen = regenAll
    if (spec.regen) regen += LEAK_REGEN_RATE + LEAK_SHIELD_RATE
    else if (spec.shield) regen += AD_SHIELD_RATE
    const net = dps - regen
    if (net <= 0) return { seconds: 999, dead: true, hp: 0, shield, stuck: true }
    const t = effHp(spec, mods) / net
    takeDamage(specs.slice(i), t)
    /* 时间裂隙：跨过 15 秒整点的活着敌人，每个反噬 30 血（无视护盾与闪避） */
    if (opts.rift) {
      const b0 = Math.floor(riftT / 15)
      const b1 = Math.floor((riftT + t - 1e-9) / 15)
      if (b1 > b0) hp -= TIME_RIFT_PENALTY_HP * (b1 - b0) * (specs.length - i)
      riftT += t
    }
    seconds += t
    if (hp <= 0) return { seconds, dead: true, hp: 0, shield }
    hp = Math.min(mods.maxHp, hp + mods.killHeal)
  }
  return { seconds, dead: false, hp, shield }
}

/* —— 模拟价值分 —— *
 * v4 词条是机制词条，一半能折算进本模拟（下表上段），一半只能人工判据
 * （下段 MANUAL_VALUE 是给「老手选牌」用的经验权重，数值出处
 * .rh/balance.md「v4 机制词条」人工判据清单；对基线通关率无影响，只影响选牌方向）。*/
const MANUAL_VALUE = {
  "event-listener": 0.6, // 弹射：多敌层 +25~85% 有效 DPS
  "callback-hell": 0.9, // 弹射 +2 跳
  debounce: 0.4, // 受击触发三连击
  throttle: 0.5, // 挡伤（内存充足时）
  "promise-chain": 0.7, // 链爆 150% 全体
  "z-index": 0.4, // 残影 60% 概率 miss
  "media-query": 0.9, // 每层 20 血（内存门槛）
  transition: 0.3, // 被击敌攻速减半
  "pseudo-element": 0.7, // 分裂弹 3×8 + 死亡回内存
  redirect: 0.4, // 溢出转移
  "cdn-boost": 0.6, // 穿透 30%
  "service-worker": 0.9, // 每 3 层免死 + 清场
  "offline-mode": 0.8, // 手动 3 秒无敌
  cors: 1.4, // combo 万能顶替位
  "hot-reload": 0.8, // 三选一 4 选 1 + 免费刷
  "timeout-retry": 0.6, // 金色重随必稀有
  cookie: 0.5, // 开局多选 1
  session: 0.2, // 纯经济
  "session-clear": 0,
}

/** 一个词条对本套 build 的价值分（模拟可算段 + 人工经验段 + combo 协同） */
function relicScore(relic, mods, owned) {
  const e = relic.effect
  let out = 0
  out += e.enemyIntervalMult ? (1 - 1 / e.enemyIntervalMult) * 2.5 : 0 // N7
  out += e.attackPerFloorMult ? e.attackPerFloorMult * 8 : 0 // M4
  out += e.shieldAttackBonus ? e.shieldAttackBonus * 1.2 : 0 // C6
  out += e.fourthHitCrit ? 0.5 : 0 // N2
  out += e.darkTheme ? 2.4 : 0 // C7 全体血量减半：全场等效 DPS 翻倍量级
  out += e.closureEcho ? 0.6 : 0 // S3
  out += e.activeDamageMult ? (e.activeDamageMult - 1) * 0.4 : 0 // S7（阻塞风险在 desc 侧）
  let sur = 0
  sur += (e.startShield ?? 0) / 20 // C1
  sur += (e.storageHealPool ?? 0) / 18 // M1
  sur += (e.reviveChance ?? 0) * 0.9 // N5
  sur += e.deathWardPerFloors ? 0.7 : 0 // M6
  sur += e.responsiveRefactor ? 0.8 : 0 // C3
  out += MANUAL_VALUE[relic.id] ?? 0
  /* 内存收支惩罚：正消耗（机制燃料）轻微扣分；占上限明显扣分 */
  if (typeof relic.memoryCost === "number" && relic.memoryCost > 0) out -= 0.05 * relic.memoryCost
  if (e.memoryMaxDelta) sur -= Math.abs(e.memoryMaxDelta) * 0.2
  if (e.memoryMaxPerFloorDelta) sur -= Math.abs(e.memoryMaxPerFloorDelta) * 0.3
  if (e.sessionClearMemory) sur -= 0.25
  if (e.blockActiveMs) sur -= 0.2
  if (e.darkTheme) sur -= 0.4 // 视野受限风险
  /* combo 协同：这张牌点亮（或逼近点亮）流派时加价 */
  if (owned) {
    const before = getActiveBondDefs(owned).length
    const after = getActiveBondDefs([...owned, relic]).length
    if (after > before) out += 2.0
  }
  return out + sur * 0.7
}

/** 从词条池抽 3 张不重复的（近似三选一）；v5：路线稀有度保底时按档过滤 */
function drawThree(owned, rng, forceRarity = null) {
  const base = RELIC_POOL.filter((r) => !owned.includes(r.id))
  let pool = base
  if (forceRarity === "epic") pool = base.filter((r) => r.rarity === "epic")
  else if (forceRarity === "rare") pool = base.filter((r) => r.rarity !== "common")
  if (pool.length === 0) pool = base
  const picks = []
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length)
    picks.push(pool[idx])
    pool.splice(idx, 1)
  }
  return picks
}

/* —— v5 路线选择启发式 —— *
 * 基础分是「老手眼里的路线价值」：只进模拟的机制按模拟影响打分，
 * 纯碎片 / 内存经济类路线给保守低分（模拟看不到它们的收益）。*/
const ROUTE_BASE_SCORE = {
  "ad-canyon": 0.35, // 掉率翻倍 → 商店经济（不进模拟，保守给分）
  "cache-abyss": 0.3, // 内存补给（不进模拟）
  "unknown-zone": 0.5, // 大概率跳过一个战斗层，期望高但方差大
  "data-mine": 0.3, // 层末大额碎片（不进模拟）；挨打偷碎片也不进模拟
  "captcha-maze": 0.9, // 稀有三选一
  "crash-edge": 1.1, // 史诗三选一
  firewall: 0.7, // 层内回盾 + 槽位 +1
  "mirror-space": 0.6, // 白嫖复制与敌抄牌攻速共存
  "time-rift": 0.6, // 刷新 +1 但 −30 反噬风险
  "recycle-bin": 0.5, // 跳过一个战斗层
}

function routeScoreOf(routeId, ctx) {
  let s = ROUTE_BASE_SCORE[routeId] ?? 0.2
  if (routeId === "recycle-bin") s += ctx.curses.length > 0 ? 1.2 : 0.3 // 能清诅咒
  if (routeId === "unknown-zone" && ctx.hpRatio < 0.3) s -= 0.5 // 陷阱 20 血 + 精英风险
  if (routeId === "mirror-space") {
    s += ctx.relics.length > 0 ? 0.7 : -0.3 // 没牌可复制时只剩挨打
    s -= 0.15 * Math.min(ctx.relics.length, 3) // 抄牌加速的反噬
  }
  if (routeId === "time-rift" && ctx.hpRatio < 0.4) s -= 0.9 // 30 血反噬可能致死
  /* 高伤高回复路线只在健康时才赌：残血硬进 = 白给（实测老手在 5/6 层死亡率反超新手） */
  if (routeId === "crash-edge" && ctx.hpRatio < 0.6) s -= 1.2
  if (routeId === "firewall" && ctx.hpRatio < 0.6) s -= 0.9
  if (routeId === "crash-edge" && ctx.floorBefore >= 7) s -= 1.0 // Boss 层固定，史诗保底不兑现
  if (routeId === "data-mine" && ctx.floorBefore >= 7) s -= 0.15
  return s
}

/** 按水平选路：new 随机 / normal 60% 选最优 / pro 全按启发式最优 */
function chooseRoute(pool, skill, rng, ctx) {
  if (skill === "new") return pool[Math.floor(rng() * pool.length)]
  const scored = pool
    .map((e) => ({ e, s: routeScoreOf(e.routeId, ctx) }))
    .sort((a, b) => b.s - a.s)
  if (skill === "pro") return scored[0].e
  return rng() < 0.6 ? scored[0].e : pool[Math.floor(rng() * pool.length)]
}

/** 未知区域事件 roll：25 商店 / 20 祭坛 / 20 宝箱 / 15 陷阱 / 15 精英 / 5 空（与引擎同权重） */
function rollUnknown(rng) {
  const r = rng() * 100
  if (r < 25) return "shop"
  if (r < 45) return "altar"
  if (r < 65) return "chest"
  if (r < 80) return "trap"
  if (r < 95) return "elite"
  return "empty"
}

/** 路线战斗层的模拟配置（与引擎 routeFloorConfig 同款战斗参数） */
function routeFloorCfg(entry, curses) {
  const enemies = entry.enemyComp.map((s) => ({ ...s }))
  if (curses.includes("curse-ad-bomb") && enemies.length > 0) enemies.push({ ...AD_BOMB_POPUP })
  return {
    enemies,
    bossKind: "none",
    timeLimitMs: FLOOR_TIME_LIMIT_MS,
    timeoutPenalty: 0,
    timeoutFails: false,
    timeoutAttackMult: OVERTIME_ATTACK_MULT,
  }
}

/** 路线层的 fightFloor 修正项（镜像抄牌 / 防火墙回盾 / 时间裂隙；蓝屏对全层生效） */
function routeFloorOpts(entry, relics, curses) {
  const opts = { pMult: curses.includes("curse-bluescreen") ? BLUESCREEN_DPS_MULT : 1 }
  if (entry.routeId === "mirror-space" && relics.length > 0)
    opts.speedMult = 1 + MIRROR_HASTE_PER_RELIC * Math.min(relics.length, 3)
  if (entry.routeId === "firewall") opts.regenAll = FIREWALL_REGEN
  if (entry.routeId === "time-rift") opts.rift = true
  return opts
}

function bossPlan() {
  return { floor: BOSS_FLOOR, cfg: DUNGEON_RUN_FLOORS[BOSS_FLOOR - 1], routeId: null, opts: {} }
}

/** 简易可复现随机 */
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * 跑一局（v5：按路线池推进）。
 * skill: "new"（随机）| "normal"（60% 选优）| "pro"（全按启发式）
 * 返回 { cleared, maxFloor, totalSeconds, hp, comboLit, curses }
 */
function playRun(charId, skill, rng) {
  let relics = []
  let hp = 0
  let shield = 0
  let totalSeconds = 0
  let maxFloor = 0
  let maxComboLit = 0
  let curses = []
  let relicCap = RELIC_SLOTS
  let hasReroll = false
  let forceRarity = null // 上一个路线 entry 给下一场战斗清层的三选一保底

  /* 下一场战斗的「计划」：层号 + 敌人配置 + 来源路线 + 修正项 */
  let plan = { floor: 1, cfg: DUNGEON_RUN_FLOORS[0], routeId: null, opts: {} }

  for (;;) {
    const floor = plan.floor
    const cfg = plan.cfg
    /* 蓝屏诅咒对所有战斗层生效（引擎 enterFloor 同款起点）；路线层可覆盖 */
    const opts = {
      pMult: curses.includes("curse-bluescreen") ? BLUESCREEN_DPS_MULT : 1,
      ...plan.opts,
    }
    const mods = buildMods(charId, relics, floor, curses)
    dpsByFloor[floor].push(playerDps(mods, 0) * (opts.pMult ?? 1))
    memMaxByFloor[floor].push(mods.memoryMax)

    /* 每层开始回血 / 补盾；病毒诅咒在进战斗层时啃 10 血 */
    const healed =
      floor === 1
        ? mods.maxHp
        : Math.min(mods.maxHp, hp + mods.healPerFloor + FLOOR_HEAL)
    const startHp = curses.includes("curse-virus") ? Math.max(1, healed - CURSE_VIRUS_HP) : healed
    const startShield = mods.shield

    hpInByFloor[floor].push(startHp)
    const result = fightFloor(charId, mods, cfg, floor, startHp, startShield, opts)
    secByFloor[floor].push(Math.min(result.seconds, 60))
    totalSeconds += Math.min(result.seconds, 60)

    /* 超时：timeoutFails 层直接判负，其余按超时惩罚折算 */
    if (result.seconds > cfg.timeLimitMs / 1000) {
      if (cfg.timeoutFails) return { cleared: false, maxFloor, totalSeconds, hp: 0, curses: curses.length }
      /* 超时后引擎是「继续打、全体攻击 +50%」→ 折算成超出段多挨 (mult-1) 的增量
         （闪避折算取常数近似）；固定层按 timeoutPenalty 扣血 */
      const over = result.seconds - cfg.timeLimitMs / 1000
      const extra =
        enemyDps(cfg.enemies, mods, opts.speedMult ?? 1) * over * (cfg.timeoutAttackMult - 1) * 0.8
      hp = Math.max(0, result.hp - (cfg.timeoutPenalty || 0) - extra)
      if (hp <= 0) {
        if (plan.routeId) routeStats[plan.routeId].deaths += 1
        return { cleared: false, maxFloor, totalSeconds, hp: 0, curses: curses.length }
      }
    } else {
      hp = result.hp
    }
    shield = result.shield
    hpOutByFloor[floor].push(hp)

    /* 死亡：复活类词条兜一次（内存门槛 ≥5 按充足处理，偏乐观） */
    if (result.dead || hp <= 0) {
      stuckByFloor[floor].push(result.stuck ? 1 : 0)
      if (mods.reviveChance > 0 && rng() < mods.reviveChance) {
        hp = Math.round(mods.maxHp * mods.reviveHpRatio)
      } else {
        if (plan.routeId) routeStats[plan.routeId].deaths += 1
        return { cleared: false, maxFloor, totalSeconds, hp: 0, curses: curses.length }
      }
    } else if (plan.routeId) {
      routeStats[plan.routeId].wins += 1
    }

    maxFloor = floor
    maxComboLit = Math.max(maxComboLit, mods.comboCount)

    /* 第 8 层打完 = 通关，没有后续三选一与选路 */
    if (floor >= BOSS_FLOOR)
      return { cleared: true, maxFloor: BOSS_FLOOR, totalSeconds, hp, comboLit: maxComboLit, curses: curses.length }

    /* —— 清层后三选一（第 5 层清完商店先开，模拟不购买，忽略）—— */
    let picks = drawThree(relics.map((r) => r.id), rng, forceRarity)
    forceRarity = null
    if (hasReroll && skill !== "new") {
      /* 时间裂隙奖励：三选一多一组候选（去重后按选优逻辑处理） */
      const extraPicks = drawThree(relics.map((r) => r.id), rng, null)
      const seen = new Set(picks)
      for (const p of extraPicks) if (!seen.has(p)) picks.push(p)
    }
    if (picks.length > 0) {
      let chosen
      if (skill === "new") {
        chosen = picks[Math.floor(rng() * picks.length)]
      } else {
        const scored = picks
          .map((r) => ({ r, s: relicScore(r, mods, relics) }))
          .sort((a, b) => b.s - a.s)
        chosen =
          skill === "pro"
            ? scored[0].r
            : scored[rng() < 0.6 ? 0 : Math.floor(rng() * scored.length)].r
      }
      if (relics.length < relicCap) {
        relics.push(chosen)
      } else {
        /* 槽满：pro 换掉最差的，其余随机换 */
        const worst = relics
          .map((r, i) => ({ i, s: relicScore(r, mods, relics.filter((x) => x !== r)) }))
          .sort((a, b) => a.s - b.s)[0]
        relics[skill === "pro" ? worst.i : Math.floor(rng() * relics.length)] = chosen
      }
    }

    /* —— 镜像空间清空后：复制一份最优词条（new 五成照镜子）—— */
    if (plan.routeId === "mirror-space" && relics.length > 0) {
      if (skill === "new" ? rng() < 0.5 : true) {
        const best = relics
          .map((r) => ({ r, s: relicScore(r, mods, relics.filter((x) => x !== r)) }))
          .sort((a, b) => b.s - a.s)[0].r
        relics.push({ ...best, id: `${best.id}-copy2` }) // 内存上限 -2 不进模拟
      }
    }

    /* —— 选路循环：事件房消耗层号后原地再选一次 —— */
    let cur = floor
    for (;;) {
      const pool = getRoutePool(cur)
      const hpRatio = Math.max(0, hp) / Math.max(1, mods.maxHp)
      const entry = chooseRoute(pool, skill, rng, { floorBefore: cur, curses, relics, hpRatio })
      const rs = routeStats[entry.routeId]
      rs.picks += 1
      if (entry.slotReward) relicCap += 1
      if (entry.rerollReward) hasReroll = true
      if (entry.relicFloor) forceRarity = entry.relicFloor
      const consumed = cur + 1 // 选进去的层号

      /* 战斗路线：进层；末层固定 Boss —— 敌人配置回落固定档（与引擎契约一致） */
      if (entry.enemyComp.length > 0) {
        if (consumed >= BOSS_FLOOR) {
          plan = { ...bossPlan(), routeId: entry.routeId }
        } else {
          plan = {
            floor: consumed,
            cfg: routeFloorCfg(entry, curses),
            routeId: entry.routeId,
            opts: routeFloorOpts(entry, relics, curses),
          }
        }
        break
      }

      /* 事件房：消耗层号、不战斗、不走三选一 */
      cur = consumed
      if (entry.routeId === "recycle-bin") {
        rs.events += 1
        /* 回收站吃掉第 8 层名额 → 直接进固定 Boss（与引擎 passEventFloor 一致） */
        if (cur >= BOSS_FLOOR - 1) {
          plan = bossPlan()
          break
        }
        continue // 丢牌决策不模拟，直接过层
      }

      /* 未知区域事件 */
      const ev = rollUnknown(rng)
      if (ev === "elite") {
        /* 精英 = 战斗层，不算事件层 */
        plan = {
          floor: cur,
          cfg: {
            enemies: [{ defId: "notfound", hp: 45, attack: 6, elite: true }],
            bossKind: "none",
            timeLimitMs: FLOOR_TIME_LIMIT_MS,
            timeoutPenalty: 0,
            timeoutFails: false,
            timeoutAttackMult: OVERTIME_ATTACK_MULT,
          },
          routeId: "unknown-zone",
          opts: {},
        }
        break
      }
      rs.events += 1
      if (cur >= BOSS_FLOOR - 1) {
        plan = bossPlan()
        break
      }
      if (ev === "trap") hp = Math.max(1, hp - UNKNOWN_TRAP_DAMAGE)
      if (ev === "altar" && rng() < 0.5) {
        /* 诅咒祭坛：白拿随机史诗 + 吃一个随机诅咒（与引擎同规则） */
        if (relics.length < relicCap) {
          const owned = relics.map((r) => r.id)
          const epicPool = RELIC_POOL.filter((r) => r.rarity === "epic" && !owned.includes(r.id))
          if (epicPool.length > 0) relics.push(epicPool[Math.floor(rng() * epicPool.length)])
        }
        const cid = CURSE_IDS[Math.floor(rng() * CURSE_IDS.length)]
        if (!curses.includes(cid)) curses.push(cid)
      }
      /* 商店 / 宝箱 / 空：购买与碎片不进模拟，直接过层 */
    }
  }
}

/* ---------------- 跑模拟 ---------------- */
const RUNS_PER = Number(process.env.RUNS ?? 1500)
const SKILLS = ["new", "normal", "pro"]
const SKILL_LABEL = { new: "新手", normal: "普通", pro: "老手" }
const CHAR_COUNT = DUNGEON_CHARACTERS.length

console.log(
  `每个角色 × 每种水平 ${RUNS_PER} 局，共 ${RUNS_PER * 3 * CHAR_COUNT} 局（v5：按路线池推进 / 30 机制词条 / 8 流派 combo）\n`,
)

const dpsByFloor = Array.from({ length: 9 }, () => [])
const memMaxByFloor = Array.from({ length: 9 }, () => [])
const hpInByFloor = Array.from({ length: 9 }, () => [])
const hpOutByFloor = Array.from({ length: 9 }, () => [])
const secByFloor = Array.from({ length: 9 }, () => [])
const stuckByFloor = Array.from({ length: 9 }, () => [])
const routeStats = {}
for (const rid of Object.keys(ROUTE_TYPES))
  routeStats[rid] = { picks: 0, wins: 0, deaths: 0, events: 0 }
const bySkill = {}
for (const skill of SKILLS)
  bySkill[skill] = {
    runs: 0,
    cleared: 0,
    floors: 0,
    secs: 0,
    comboLit: 0,
    curseSum: 0,
    deaths: Array(9).fill(0),
  }

let seed = 20260921
for (const char of DUNGEON_CHARACTERS) {
  for (const skill of SKILLS) {
    const rng = makeRng(seed++)
    for (let i = 0; i < RUNS_PER; i++) {
      const res = playRun(char.id, skill, rng)
      const acc = bySkill[skill]
      acc.runs += 1
      acc.floors += res.maxFloor
      acc.secs += res.totalSeconds
      acc.comboLit += res.comboLit ?? 0
      acc.curseSum += res.curses ?? 0
      if (res.cleared) acc.cleared += 1
      else acc.deaths[res.maxFloor + 1] += 1
    }
  }
}

console.log("水平 | 通关率 | 平均层数 | 平均战斗时长 | 平均点亮流派数 | 结束时平均诅咒数")
for (const skill of SKILLS) {
  const a = bySkill[skill]
  console.log(
    `${SKILL_LABEL[skill]} | ${((a.cleared / a.runs) * 100).toFixed(1).padStart(5)}% | ${(
      a.floors / a.runs
    )
      .toFixed(2)
      .padStart(6)} | ${(a.secs / a.runs).toFixed(1)}s | ${(a.comboLit / a.runs).toFixed(2)} | ${(
      a.curseSum / a.runs
    ).toFixed(2)}`,
  )
}

const avgOf = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length)
console.log("\n各层血量收支（第 2~7 层为混合路线内容；机制 DPS 未计入，掉血偏高）")
console.log("层 | 进层血量 | 出层血量 | 净掉血 | 耗时 | 内存上限均值")
for (let floor = 1; floor <= 8; floor++) {
  const ins = hpInByFloor[floor]
  const outs = hpOutByFloor[floor]
  const n = Math.min(ins.length, outs.length)
  const i = ins.slice(0, n).reduce((a, b) => a + b, 0) / Math.max(1, n)
  const o = outs.slice(0, n).reduce((a, b) => a + b, 0) / Math.max(1, n)
  console.log(
    `${floor}  | ${i.toFixed(1).padStart(8)} | ${o.toFixed(1).padStart(8)} | ${(o - i)
      .toFixed(1)
      .padStart(7)} | ${avgOf(secByFloor[floor]).toFixed(1)}s | ${avgOf(
      memMaxByFloor[floor],
    ).toFixed(1)}`,
  )
}

console.log("\n各层死亡原因（stuck = 净 DPS ≤ 0 打不死）")
console.log("层 | 死于打不死 | 死于掉血")
for (let floor = 1; floor <= 8; floor++) {
  const a = stuckByFloor[floor]
  const st = a.reduce((x, y) => x + y, 0)
  console.log(`${floor}  | ${String(st).padStart(10)} | ${String(a.length - st).padStart(8)}`)
}

console.log("\n各层玩家实测裸 DPS（含随机词条可模拟段，不含护甲与机制 DPS）")
console.log("层 | 平均 DPS | 相对第 1 层 | 词条数")
for (let floor = 1; floor <= 8; floor++) {
  const arr = dpsByFloor[floor]
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length
  const base = dpsByFloor[1].reduce((a, b) => a + b, 0) / dpsByFloor[1].length
  console.log(
    `${floor}  | ${avg.toFixed(2).padStart(8)} | ${(avg / base).toFixed(2).padStart(11)} | ${
      floor - 1
    }`,
  )
}

console.log("\n各层死亡率（死在「进入该层后」的占比）")
console.log("层 | 新手 | 普通 | 老手")
for (let floor = 1; floor <= 8; floor++) {
  const row = SKILLS.map((skill) => {
    const a = bySkill[skill]
    const reached = a.runs - a.deaths.slice(1, floor).reduce((x, y) => x + y, 0)
    const died = a.deaths[floor] ?? 0
    return reached > 0 ? `${((died / reached) * 100).toFixed(1)}%`.padStart(6) : "     -"
  })
  console.log(`${floor}  |${row.join(" |")}`)
}

const totalPicks = Object.values(routeStats).reduce((a, r) => a + r.picks, 0)
console.log("\n路线使用统计（picks = 被选次数；赢了/死在该路 = 其战斗层结果；事件层 = 回收站/未知区域过层）")
console.log("路线 | 被选 | 占比 | 清掉该路 | 死在该路 | 事件层")
for (const rid of Object.keys(ROUTE_TYPES)) {
  const r = routeStats[rid]
  if (r.picks === 0) continue
  console.log(
    `${ROUTE_TYPES[rid].name} | ${String(r.picks).padStart(6)} | ${(
      ((r.picks / totalPicks) * 100).toFixed(1) + "%"
    ).padStart(6)} | ${String(r.wins).padStart(6)} | ${String(r.deaths).padStart(6)} | ${String(
      r.events,
    ).padStart(6)}`,
  )
}
