/**
 * 《标签地牢》数值体检脚本 v4（一次性核对用，不参与构建）
 *
 * 与 v3 版的关键区别：所有层配置、角色、敌人、词条、combo 全部直接 import
 * 真实数据（src/lib/dungeonData.ts），不再手抄——v4 词条池 44→30、
 * BondDef 重构、精英倍率与 Boss 常量都从源头读，表改了脚本自动跟着变。
 *
 * 口径说明（与 .rh/balance.md「v4 机制词条」段对齐）：
 *   - v4 词条是机制词条，绝大多数不提供裸属性 → 本脚本第 1/2 段是
 *     「机制全不计」的基线（第 3 层以前无词条、之后仅可模拟段进 DPS）。
 *   - 内存经济不进逐帧模拟：第 3 段按「标准 5 敌层 / 每分钟」做收支台账；
 *     第 4 段核对 M4+N7+M3+G1 同持时的内存上限曲线（夹逼 [3,20]）。
 *   - 无法蒙特卡洛的机制（弹射/穿透/链爆/三连/分裂/残影/暗黑视野…）
 *     的人工判据清单在 balance.md，本脚本只负责可判定部分。
 *
 * 单位约定：
 *   敌人每次伤害 = 攻击力 × 精英倍率，DPS = 伤害 ÷ 攻击间隔
 *   玩家每次伤害 = 攻击力 × 暴击期望 + 固定追加，再减敌人护甲（最低 1）
 */

import {
  CHARACTER_COMBAT,
  DUNGEON_RUN_FLOORS,
  ENEMY_DEFS,
  RELIC_POOL,
  BOND_DEFS,
  ELITE_HP_MULT,
  ELITE_ATTACK_MULT,
  AD_SHIELD_REGEN_MS,
  AD_SHIELD_REGEN_AMOUNT,
  LEAK_REGEN_MS,
  LEAK_REGEN_AMOUNT,
  LEAK_SHIELD_REFRESH_MS,
  LEAK_SHIELD_REFRESH_AMOUNT,
  CAPTCHA_BREAK_MS,
  CAPTCHA_CHALLENGE_INTERVAL_MS,
  CAPTCHA_BREAK_DAMAGE_MULT,
  MEMORY_BASE_MAX,
  MEMORY_MAX_CAP,
  MEMORY_MIN_CAP,
  memoryBaseMaxForFloor,
  BOSS_AD_BODY_HP,
  BOSS_CRASH_MAX_HP,
  scaleCombatForFloor,
} from "../src/lib/dungeonData.ts"

/* ---------------- 引擎侧常量（未导出，核对自 useDungeon.ts） ---------------- */
const DARK_HP_MULT = 0.5

/* ---------------- 玩家基线（无机制段） ---------------- */
/** 第 8 层前玩家可拿到 7 个词条；v4 里只有 M4 提供裸攻击成长。
    基线取「抽 1 张内存泄漏」的温和档：攻击 ×(1+5%×(层-1))。 */
const BASELINE_M4 = true
/** 验证码：点对率 0.7 是唯一经验参数，其余由引擎常量推 */
const CAPTCHA_HIT_RATE = 0.7
const BREAK_COVER = (CAPTCHA_BREAK_MS / CAPTCHA_CHALLENGE_INTERVAL_MS) * CAPTCHA_HIT_RATE
const GUARD_DMG_MULT = BREAK_COVER * CAPTCHA_BREAK_DAMAGE_MULT + (1 - BREAK_COVER) * 0.2

function eff(spec) {
  return {
    hp: spec.hp + (spec.shield ?? 0),
    attack: spec.elite ? Math.max(1, Math.round(spec.attack * ELITE_ATTACK_MULT)) : spec.attack,
    eliteHpMult: spec.elite ? ELITE_HP_MULT : 1,
  }
}

function floorSeconds(charId, f) {
  const c = scaleCombatForFloor(CHARACTER_COMBAT[charId], f.floor)
  const crit = 1 + c.critChance * (c.critMult - 1)
  const m4 = BASELINE_M4 ? 1 + 0.05 * (f.floor - 1) : 1
  const speed = 1000 / c.attackIntervalMs
  let sec = 0
  for (const spec of f.enemies) {
    const e = eff(spec)
    const def = ENEMY_DEFS[spec.defId]
    const perHit = Math.max(1, c.attack * m4 * crit - def.defense) * (spec.guard ? GUARD_DMG_MULT : 1)
    let regen = 0
    if (spec.regen)
      regen = LEAK_REGEN_AMOUNT / (LEAK_REGEN_MS / 1000) + LEAK_SHIELD_REFRESH_AMOUNT / (LEAK_SHIELD_REFRESH_MS / 1000)
    else if (spec.shield) regen = AD_SHIELD_REGEN_AMOUNT / (AD_SHIELD_REGEN_MS / 1000)
    const net = perHit * speed - regen
    /* 精英倍率只作用于本体血，护盾不加倍 */
    sec += net > 0 ? (spec.hp * e.eliteHpMult + (spec.shield ?? 0)) / net : Infinity
  }
  return sec
}

function enemyDps(f) {
  let d = 0
  for (const spec of f.enemies) {
    const e = eff(spec)
    d += (e.attack * 1000) / ENEMY_DEFS[spec.defId].attackIntervalMs
  }
  return d
}

function playerEhp(charId, floor) {
  const c = scaleCombatForFloor(CHARACTER_COMBAT[charId], floor)
  return c.maxHp + c.startShield
}

const chars = Object.keys(CHARACTER_COMBAT)

console.log("=== 一、每层目标耗时（基线：机制全不计 + 温和档 M4；含精英倍率）===")
console.log("层 | 限时 |" + chars.map((c) => c.padStart(14)).join("") + "  | 判定")
for (const f of DUNGEON_RUN_FLOORS) {
  const vals = chars.map((c) => floorSeconds(c, f))
  const row = vals.map((v) => (!isFinite(v) || v > 99 ? "      ∞" : v.toFixed(1)).padStart(14))
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const limit = f.timeLimitMs / 1000
  const tag = avg > limit ? "超时!" : avg > limit * 0.85 ? "贴线" : "ok"
  console.log(`${f.floor}  | ${String(limit).padStart(4)} |${row.join("")}  | ${tag}`)
}

console.log("\n=== 二、生存压力（敌人 DPS 含精英倍率与限流前基线；含玩家闪避）===")
console.log("层 | 敌人DPS |" + chars.map((c) => (c + "生存s").padStart(15)).join(""))
for (const f of DUNGEON_RUN_FLOORS) {
  const ed = enemyDps(f)
  const row = chars
    .map((c) => {
      const dodge = CHARACTER_COMBAT[c].dodgeChance
      return (playerEhp(c, f.floor) / (ed * (1 - dodge))).toFixed(1).padStart(15)
    })
    .join("")
  console.log(`${f.floor}  | ${ed.toFixed(2).padStart(7)} |${row}`)
}

/* ---------------- 三、内存经济收支台账 ---------------- */
console.log("\n=== 三、内存经济（标准 5 敌层 ≈ 12 秒；按每分钟折算）===")
const ATTACKS_PER_SEC = 1.8 // 基线攻速档（角色 1.5~2.2 的中位）
const CRIT_RATE = 0.1
const MIN = 60
const atkPerMin = ATTACKS_PER_SEC * MIN
const killPerMin = 5 / (12 / MIN) // 5 敌/12 秒 → 25 杀/分（理论上限，层间衔接不满）
const rows = [
  ["产出·击杀基础（普通+1 计入，v2）", killPerMin * 1],
  ["产出·N1 请求拦截（暴击偷 1）", atkPerMin * CRIT_RATE],
  ["产出·N2 缓存命中（第 4 击 +2）", (atkPerMin / 4) * 2],
  ["产出·M5 垃圾回收（击杀 +1）", killPerMin],
  ["消耗·S1 弹射（每击 1，需≥2 敌）", atkPerMin * (4 / 5)],
  ["消耗·S1+S2 弹射流（3 跳×1，combo 后 0）", atkPerMin * (4 / 5) * 3],
  ["消耗·S6 链爆（3 内存/5 击）", (atkPerMin / 5) * 3],
  ["消耗·N4 穿透（每次有后排的攻击 1）", atkPerMin * (4 / 5)],
  ["消耗·S4 三连（2 内存/受击一次 ≈10 击）", (atkPerMin / 10) * 2],
  ["消耗·S7 异步觉醒（4 内存/主动一次）", (MIN / 5) * 4],
]
console.log("项目 | 每分钟收支")
for (const [k, v] of rows) console.log(`${k.padEnd(34)} | ${v.toFixed(1)}`)
console.log(
  "结论（v2）：战斗中不回复，回满只发生在进层（8→12 随层成长，夹逼 [3,20]）。",
)
console.log(
  "      层内收支全看击杀/碎片/词条：不足即不触发（trySpendMemory 原子检查），",
)
console.log(
  "      并叠加 4 区间惩罚与卡顿累积（<15% 阻塞主动技与闪避，≥8s 掉血，≥12s 崩溃）。",
)

/* ---------------- 四、内存上限曲线（占用者同持场景） ---------------- */
console.log("\n=== 四、内存上限曲线：N7(-3)+M3(-1)+G1(-2)+M4(每层-1)，夹逼 [3,20] ===")
console.log("引擎公式：min(20, max(3, 8+⌊层/2⌋ + 固定delta - 1×层号))（useDungeon buildMods memoryMax）")
for (let floor = 1; floor <= 8; floor++) {
  const max = Math.min(
    MEMORY_MAX_CAP,
    Math.max(MEMORY_MIN_CAP, memoryBaseMaxForFloor(floor) - 3 - 1 - 2 - 1 * floor),
  )
  const dead = max < 4 ? " ← S7(4)/N5(5)/M6(4) 全部封存" : ""
  console.log(`第 ${floor} 层上限 = ${max}${dead}`)
}

/* ---------------- 五、暗黑模式对 Boss 层时限的影响 ---------------- */
console.log("\n=== 五、C7 暗黑模式：Boss 血减半（含按钮）对限时层的换算 ===")
console.log(`第 4 层：按钮 ${4}×${30} + 本体 ${BOSS_AD_BODY_HP} → 暗黑 ${4}×15 + ${Math.round(BOSS_AD_BODY_HP * DARK_HP_MULT)}（限时 20s）`)
console.log(`第 8 层：${BOSS_CRASH_MAX_HP} → ${Math.round(BOSS_CRASH_MAX_HP * DARK_HP_MULT)}；阶段阈值 223/100 为绝对血量 → 减半后开局即阶段 2（玩家攻速减半段 55 血）`)

/* ---------------- 六、v4 词条池与 combo 总表 ---------------- */
console.log("\n=== 六、30 词条内存成本速查（消耗>0 / 产出<0 / 无=0）===")
for (const r of RELIC_POOL) {
  const cost = r.memoryCost ?? 0
  const parts = Object.entries(r.effect)
    .filter(([k]) => k.endsWith("MemoryCost") || k === "memoryMaxDelta" || k === "memoryMaxPerFloorDelta" || k === "memoryGainFourthHit")
    .map(([k, v]) => `${k}:${v}`)
  console.log(
    `${r.code.padEnd(3)} ${r.name.padEnd(10)} ${r.rarity.padEnd(6)} 风险${r.risk.padEnd(5)} 卡面内存${String(cost).padStart(3)} ${parts.join(" ")}`,
  )
}
console.log(`\n共 ${RELIC_POOL.length} 条 / ${BOND_DEFS.length} 流派 combo：`)
for (const b of BOND_DEFS) console.log(`  ${b.name}：${b.relicIds.join(" + ")}`)
