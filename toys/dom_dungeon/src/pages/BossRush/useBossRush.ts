import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

/* ------------------------------------------------------------------ *
 * Boss Rush（boss-rush.md）：薄版战斗 hook。
 * 主模式 useDungeon 与 8 层推进 / 路线 / 每日 / 多标签页耦合过深，
 * 整 hook 复用不可行；这里重写「单挑 Boss」的最小战斗内核，
 * 但敌人定义、Boss 技能表、台词、词条池、三选一生成、角色战斗数值、
 * 音效全部从现有数据层（dungeonData / seedGen / sfx / dungeonSave）取，
 * 没有第二套词条或敌人定义。
 *
 * 与主模式互不污染：不计入今日挑战 / 排行榜 / 通关数 / 碎片经济，
 * 祭坛永久升级只影响这里的开局数值。
 * ------------------------------------------------------------------ */

import { buildMods, type CombatMods } from "@/pages/Dungeon/useDungeon"
import { genRelicChoices } from "@/lib/seedGen"
import { playSfx } from "@/lib/sfx"
import {
  BOSS_AD_SKILLS,
  BOSS_CRASH_ATTACK_MULT,
  BOSS_CRASH_DODGE_BONUS,
  BOSS_CRASH_SKILLS,
  ENEMY_DEFS,
  MAX_RELIC_SLOTS,
  PAID_REVIVE_HP_RATIO,
  bossLineKey,
  findBossLine,
  findCharacter,
  getRandomSeed,
  type BossSkill,
  type BossSpawnSpec,
  type CharacterId,
  type CharacterSkin,
  type DungeonCharacter,
  type EnemyKind,
  type Relic,
} from "@/lib/dungeonData"
import {
  RUSH_UPGRADES,
  finishRushRun,
  getEquippedSkin,
  loadDungeonSave,
  purchaseRushUpgrade,
  rushUpgradeDef,
  type DungeonSave,
  type RushUpgradeKey,
} from "@/lib/dungeonSave"

/* ---------------- 战斗常量（与主模式同口径的手感参数） ---------------- */

const TICK_MS = 100
/** 伤害弹字存续 */
const POP_LIFE_MS = 800
/** 顿帧：暴击 100ms / 斩杀 140ms，两次至少隔 400ms；低配 50ms */
const HIT_STOP_CRIT_MS = 100
const HIT_STOP_KILL_MS = 140
const HIT_STOP_GAP_MS = 400
const HIT_STOP_LOW_MS = 50
/** 完美闪避窗：敌人前摇最后 200ms 内闪 */
const PERFECT_DODGE_WINDOW_MS = 200
const PERFECT_DODGE_HEAL = 3
/** 刺客闪避后攻速 +25% 持续 2 秒 */
const DODGE_HASTE_MS = 2000
const DODGE_HASTE_MULT = 0.8
/** 游侠主动：1.5 秒无敌 + 攻速 +30% */
const RANGER_STEP_MS = 1500
/** 战士主动：2 秒双重打击 */
const DOUBLE_STRIKE_MS = 2000
/** 战士被动：满 5 层必暴 */
const LISTEN_STACKS_MAX = 5
/** 法师主动：+10 护盾 */
const MAGE_SHIELD_GAIN = 10
/** 窃贼主动：6 伤害 + 吸 6 */
const COOKIE_ACTIVE_DAMAGE = 6
const COOKIE_ACTIVE_HEAL = 6
const COOKIE_HEAL_ON_KILL = 3
/** 僧侣：每 8 击追加 8 固定伤 / 主动 3 秒攻速 +60% */
const SYNC_STACKS_MAX = 8
const SYNC_STRIKE_DAMAGE = 8
const MULTITHREAD_MS = 3000
const MULTITHREAD_HASTE_MULT = 1.6
/** 内核之影：低血 <40% 攻速 +30%；主动冻结全场 2 秒 */
const ROOT_HP_RATIO = 0.4
const FREEZE_MS = 2000
/** 切目标防误触 */
const LOCK_SWITCH_MS = 500
/** 波次缩放：同一 Boss 池循环，每循环一轮 hp ×1.35、攻击 ×1.15 */
const RUSH_HP_MULT_PER_CYCLE = 1.35
const RUSH_ATK_MULT_PER_CYCLE = 1.15
/** Boss 池循环顺序：奇数波小 Boss，偶数波大 Boss */
const RUSH_BOSS_CYCLE: string[] = ["boss-fullscreen", "boss-crash"]
/** 新 Boss 进层短休：登场后这么久才开始出手 */
const WAVE_REST_MS = 1500

/**
 * 击杀第 N 波掉的祭坛币：1 + floor(N/2) + floor(N/6)²
 * 前期近似每 2 波多 1 枚，6 波起平方项抬头——越深的波掉得越猛，
 * 冲高纪录的回报加速拉开（w6=5 / w12=11 / w18=19 / w30=41）。
 */
export function rushCoinDrop(wave: number): number {
  const deep = Math.floor(wave / 6)
  return 1 + Math.floor(wave / 2) + deep * deep
}

/* ---------------- 状态类型（View 层按这些渲染） ---------------- */

export type RushPopKind = "dmg" | "crit" | "heal" | "shield" | "dodge" | "miss"

export type RushPop = {
  id: number
  kind: RushPopKind
  amount: number
  crit: boolean
  at: number
  /** "player" = 玩家身上，"boss" = Boss 卡，其余 = 小怪 uid */
  uid: string
}

export type RushEnemy = {
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
  nextAttackAt: number
  /** 前摇结束时间，0 = 没在蓄力 */
  telegraphUntil: number
  telegraphMs: number
  /** 刚被打到（闪白窗，View 用） */
  hitAt: number
  closing: boolean
  closedAt: number
  /** Boss 技能召唤出来的小怪 */
  minion: boolean
  spawnSkillId: string | null
  /** 这只小怪活着时玩家攻击下降比例（弹窗雨） */
  attackCutPct: number
}

export type RushPendingSkill = {
  id: string
  name: string
  desc: string
  counter: string
  telegraphUntil: number
  dodgeable: boolean
  damage: number
  clickLabel: string | null
}

export type RushBoss = {
  defId: string
  name: string
  trait: string
  maxHp: number
  hp: number
  attack: number
  defense: number
  attackIntervalMs: number
  phase: number
  skills: { id: string; nextReadyAt: number }[]
  pending: RushPendingSkill | null
  /** 崩溃阶段 2 起：玩家攻速减半 */
  speedCut: boolean
  /** 崩溃阶段 3 起：Boss 攻击 ×2、玩家闪避 +20% */
  attackDouble: boolean
  dodgeBonus: number
}

export type RushPhase = "fighting" | "relic" | "settle"

export type RushSettle = {
  kind: "dead" | "retreat"
  cause: string
  newRecord: boolean
}

export type RushState = {
  seed: string
  phase: RushPhase
  wave: number
  kills: number
  runCoins: number
  /** 最近一次跳字：金额 + 时刻（View 显「+N」） */
  coinPulse: { amount: number; at: number } | null
  /** 游戏时间（顿帧时冻结） */
  now: number
  wallAt: number
  characterId: CharacterId
  characterName: string
  characterIsShade: boolean
  relics: Relic[]
  mods: CombatMods
  player: {
    hp: number
    maxHp: number
    shield: number
    nextAutoAt: number
    activeReadyAt: number
    dodgeReadyAt: number
    /** 闪避无敌窗截止 */
    dodgeUntil: number
    immuneUntil: number
    critNext: boolean
    listenerStacks: number
    hitCount: number
    dodgeHasteUntil: number
    rangerHasteUntil: number
    multithreadUntil: number
    doubleStrikeUntil: number
    lockedUid: string
    lastLockAt: number
    /** 顿帧剩余毫秒（墙钟递减，归零才恢复游戏时间） */
    hitStopLeftMs: number
    hitStopSeq: number
    pendingHitSfx: "kill" | null
    lastHitStopAt: number
  }
  /** 回滚备份剩余复活次数 */
  revivePool: number
  /** 内核之影主动：冻结截止 */
  freezeUntil: number
  /** 强制跳转（ad-redirect）的攻速减半窗截止 */
  speedCutUntil: number
  /** 小怪在场的玩家攻击削减比例（弹窗雨） */
  attackCutPct: number
  boss: RushBoss
  /** Boss 本体的普攻节奏（与技能循环分开计时） */
  bossNextAttackAt: number
  bossTelegraphUntil: number
  enemies: RushEnemy[]
  pops: RushPop[]
  banner: { text: string; seq: number } | null
  bannerSeq: number
  bossLine: { key: string; text: string; seq: number } | null
  bossLineSeq: number
  choices: Relic[] | null
  settle: RushSettle | null
  popSeq: number
  lowSpec: boolean
}

/* ---------------- 纯函数小件 ---------------- */

function bossSkillTable(defId: string, phase: number): BossSkill[] {
  const table = defId === "boss-crash" ? BOSS_CRASH_SKILLS : BOSS_AD_SKILLS
  return table[phase] ?? table[1] ?? []
}

function rushCycle(wave: number): number {
  return Math.floor((wave - 1) / RUSH_BOSS_CYCLE.length)
}

function rushBossDefId(wave: number): string {
  return RUSH_BOSS_CYCLE[(wave - 1) % RUSH_BOSS_CYCLE.length]
}

function bossPhaseOf(defId: string, ratio: number): number {
  if (defId === "boss-crash") {
    if (ratio > 0.72) return 1
    return ratio > 0.32 ? 2 : 3
  }
  return ratio > 0.5 ? 1 : 2
}

function makeBoss(wave: number, now: number): RushBoss {
  const defId = rushBossDefId(wave)
  const def = ENEMY_DEFS[defId]
  const cycle = rushCycle(wave)
  const hp = Math.round(def.hp * Math.pow(RUSH_HP_MULT_PER_CYCLE, cycle))
  const attack = def.attack * Math.pow(RUSH_ATK_MULT_PER_CYCLE, cycle)
  return {
    defId,
    name: def.displayName,
    trait: def.trait,
    maxHp: hp,
    hp,
    attack,
    defense: def.defense,
    attackIntervalMs: def.attackIntervalMs,
    phase: 1,
    skills: bossSkillTable(defId, 1).map((skill) => ({
      id: skill.id,
      nextReadyAt: now + WAVE_REST_MS + skill.cdMs,
    })),
    pending: null,
    speedCut: false,
    attackDouble: false,
    dodgeBonus: 0,
  }
}

function makeMinion(spec: BossSpawnSpec, skillId: string, index: number, now: number): RushEnemy {
  const def = ENEMY_DEFS[spec.defId]
  return {
    uid: `m-${spec.defId}-${now}-${index}`,
    defId: spec.defId,
    displayName: spec.label || def.displayName,
    trait: def.trait,
    kind: "normal",
    maxHp: spec.hp,
    hp: spec.hp,
    attack: spec.attack,
    attackIntervalMs: def.attackIntervalMs,
    defense: def.defense,
    nextAttackAt: now + def.attackIntervalMs,
    telegraphUntil: 0,
    telegraphMs: 700,
    hitAt: 0,
    closing: false,
    closedAt: 0,
    minion: true,
    spawnSkillId: skillId,
    attackCutPct: 0,
  }
}

function effectiveAttackInterval(s: RushState): number {
  let ms = s.mods.attackIntervalMs
  if (s.boss.speedCut || s.now < s.speedCutUntil) ms *= 2
  if (s.player.multithreadUntil > s.now) ms /= MULTITHREAD_HASTE_MULT
  if (s.player.rangerHasteUntil > s.now) ms /= 1.3
  if (s.player.dodgeHasteUntil > s.now) ms *= DODGE_HASTE_MULT
  if (s.characterIsShade && s.player.maxHp > 0 && s.player.hp / s.player.maxHp < ROOT_HP_RATIO) {
    ms /= 1.3
  }
  return Math.max(150, ms)
}

function cloneState(prev: RushState): RushState {
  return {
    ...prev,
    player: { ...prev.player },
    boss: {
      ...prev.boss,
      skills: prev.boss.skills.map((skill) => ({ ...skill })),
      pending: prev.boss.pending ? { ...prev.boss.pending } : null,
    },
    enemies: prev.enemies.map((enemy) => ({ ...enemy })),
    pops: prev.pops.map((pop) => ({ ...pop })),
  }
}

function pushPop(s: RushState, kind: RushPopKind, amount: number, crit: boolean, uid: string) {
  s.pops = [...s.pops, { id: ++s.popSeq, kind, amount, crit, at: s.now, uid }]
  if (s.pops.length > 24) s.pops = s.pops.slice(-24)
}

function pushBanner(s: RushState, text: string) {
  s.bannerSeq += 1
  s.banner = { text, seq: s.bannerSeq }
}

function setBossLine(
  s: RushState,
  defId: string,
  trigger: "enter" | "phase" | "skill" | "defeat",
  opts?: { phase?: number; skillId?: string },
) {
  const entry = findBossLine(defId, trigger, opts)
  if (!entry) return
  s.bossLineSeq += 1
  s.bossLine = { key: bossLineKey(entry), text: entry.text, seq: s.bossLineSeq }
}

/* ---------------- 玩家出手 ---------------- */

function damageEnemy(s: RushState, target: RushEnemy, rawDamage: number, canCrit: boolean): boolean {
  let damage = rawDamage
  let crit = false
  const forcedCrit = s.player.critNext
  if (canCrit && (Math.random() < s.mods.critChance || forcedCrit)) {
    crit = true
    damage = Math.round(damage * s.mods.critMult)
  }
  if (forcedCrit) s.player.critNext = false
  /* 脚本战士被动：监听叠层，满 5 层下一击必暴 */
  if (s.characterId === "script-warrior" && !crit) {
    if (s.player.listenerStacks >= LISTEN_STACKS_MAX) {
      crit = true
      damage = Math.round(rawDamage * s.mods.critMult)
      s.player.listenerStacks = 0
    } else {
      s.player.listenerStacks += 1
    }
  }
  const penDefense = Math.round(target.defense * (1 - Math.min(1, s.mods.penetration)))
  damage = Math.max(1, damage - penDefense)
  target.hp -= damage
  target.hitAt = s.now
  const killed = target.hp <= 0
  pushPop(s, crit ? "crit" : "dmg", damage, crit, target.uid)
  if (crit) playSfx("crit")
  else playSfx("hit")
  /* 顿帧：暴击 / 斩杀触发；击杀音压到解冻瞬间补播（与主模式同构） */
  if (
    (crit || killed) &&
    s.now - s.player.lastHitStopAt >= HIT_STOP_GAP_MS &&
    s.player.hitStopLeftMs <= 0
  ) {
    s.player.hitStopSeq += 1
    s.player.lastHitStopAt = s.now
    s.player.hitStopLeftMs = s.lowSpec
      ? HIT_STOP_LOW_MS
      : crit
        ? HIT_STOP_CRIT_MS
        : HIT_STOP_KILL_MS
    if (killed) s.player.pendingHitSfx = "kill"
    playSfx("hitstop")
  } else if (killed) {
    playSfx("kill")
  }
  return killed
}

function onEnemyKilled(s: RushState, enemy: RushEnemy) {
  enemy.closing = true
  enemy.closedAt = s.now
  const heal =
    (s.mods.healOnKill ?? 0) + (s.characterId === "cookie-thief" ? COOKIE_HEAL_ON_KILL : 0)
  if (heal > 0) {
    s.player.hp = Math.min(s.player.maxHp, s.player.hp + heal)
    pushPop(s, "heal", heal, false, "player")
  }
}

function activeTarget(s: RushState): RushEnemy | null {
  const alive = s.enemies.filter((enemy) => !enemy.closing)
  if (alive.length === 0) return null
  return alive.find((enemy) => enemy.uid === s.player.lockedUid) ?? alive[0]
}

function playerAttackOnce(s: RushState, target: RushEnemy | null, isDouble: boolean): void {
  /* 工作僧侣被动：每 8 次命中追加一次固定伤 */
  if (target && s.characterId === "worker-monk") {
    s.player.hitCount += 1
    if (s.player.hitCount >= SYNC_STACKS_MAX) {
      s.player.hitCount = 0
      const killed = damageEnemy(s, target, SYNC_STRIKE_DAMAGE, false)
      if (killed) onEnemyKilled(s, target)
    }
  }
  if (!target) return
  const cut = 1 - s.attackCutPct
  let damage = Math.max(1, Math.round((s.mods.baseAttack + s.mods.attackFlat) * s.mods.attackMult * cut))
  /* 事件连击：窗口内自动攻击变双重打击 */
  if (s.player.doubleStrikeUntil > s.now && !isDouble) {
    const killed = damageEnemy(s, target, damage, true)
    if (killed) onEnemyKilled(s, target)
    playerAttackOnce(s, target, true)
    return
  }
  /* 斩杀词条：血量掉到阈值直接带走 */
  if (s.mods.executeAll > 0 && target.hp / target.maxHp <= s.mods.executeThreshold) {
    damage = Math.round(damage * (1 + (s.mods.executeBonus ?? 0)))
    target.hp = 0
    target.hitAt = s.now
    pushPop(s, "crit", damage, true, target.uid)
    playSfx("kill")
    onEnemyKilled(s, target)
    return
  }
  const killed = damageEnemy(s, target, damage, true)
  if (!killed && Math.random() < s.mods.doubleAttackChance) {
    damageEnemy(s, target, Math.max(1, Math.round(damage * 0.5)), true)
  }
  if (killed) onEnemyKilled(s, target)
}

/* ---------------- 玩家受击 ---------------- */

function hurtPlayer(s: RushState, rawDamage: number, cause: string) {
  let damage = Math.max(1, Math.round(rawDamage * (1 - (s.mods.damageReduction ?? 0))))
  if (s.player.shield > 0) {
    const absorb = Math.min(s.player.shield, damage)
    s.player.shield -= absorb
    damage -= absorb
    if (absorb > 0) pushPop(s, "shield", absorb, false, "player")
    if (s.player.shield <= 0 && s.mods.shieldBreakDamage > 0) {
      /* 缓存法师被动 / 伪元素词条：护盾破碎炸当前目标 */
      const target = activeTarget(s)
      if (target) {
        const killed = damageEnemy(s, target, s.mods.shieldBreakDamage, false)
        if (killed) onEnemyKilled(s, target)
      }
    }
  }
  if (damage <= 0) return
  s.player.hp -= damage
  pushPop(s, "dmg", damage, false, "player")
  if (s.player.hp <= 0) {
    /* 回滚备份：每级一次原地复活（祭坛永久升级专属通道） */
    if (s.revivePool > 0) {
      s.revivePool -= 1
      s.player.hp = Math.ceil(s.player.maxHp * PAID_REVIVE_HP_RATIO)
      pushBanner(s, `❤ 回滚备份触发：原地复活（本局还剩 ${s.revivePool} 次）`)
      playSfx("deathWard")
      return
    }
    die(s, `被第 ${s.wave} 波 · ${s.boss.name} 的「${cause}」放倒`)
  }
}

/* ---------------- 死亡 / 波次清空（纯状态迁移；写档在 hook 的 effect 里做一次性结算） ---------------- */

function die(s: RushState, cause: string) {
  s.phase = "settle"
  s.settle = { kind: "dead", cause, newRecord: false }
  s.choices = null
  playSfx("lose")
}

function waveCleared(s: RushState) {
  s.kills += 1
  const gain = rushCoinDrop(s.wave)
  s.runCoins += gain
  s.coinPulse = { amount: gain, at: s.now }
  setBossLine(s, s.boss.defId, "defeat")
  playSfx("coin")
  s.phase = "relic"
  s.choices = genRelicChoices(s.seed, `rush:relic:${s.wave}`, s.relics, 3, Math.min(s.wave, 8))
}

/* ---------------- Boss 技能引擎 ---------------- */

function applySkillEffect(s: RushState, skill: BossSkill) {
  if (skill.damage) {
    const dodged = s.player.dodgeUntil > s.now || s.player.immuneUntil > s.now
    const autoDodge = Math.random() < s.mods.dodgeChance + s.boss.dodgeBonus
    if (dodged || autoDodge) {
      pushPop(s, dodged ? "dodge" : "miss", skill.damage, false, "player")
      playSfx("dodge")
    } else {
      hurtPlayer(s, skill.damage, skill.name)
    }
  }
  if (skill.spawn) {
    for (let i = 0; i < skill.spawn.count; i += 1) {
      const minion = makeMinion(skill.spawn, skill.id, i, s.now)
      minion.attackCutPct = skill.playerAttackCut ?? 0
      s.enemies.push(minion)
    }
    pushBanner(s, `${s.boss.name} 放出「${skill.name}」：${skill.desc}`)
  }
  if (skill.speedCutMs) {
    /* 强制跳转：玩家攻速减半（按时窗） */
    s.speedCutUntil = s.now + skill.speedCutMs
    pushBanner(s, `「${skill.name}」：你的攻速减半 ${Math.round(skill.speedCutMs / 1000)} 秒`)
  }
  if (skill.clearShield) {
    s.player.shield = 0
    pushPop(s, "shield", 0, false, "player")
    pushBanner(s, `${s.boss.name}「${skill.name}」：护盾被清空`)
  }
  if (skill.forceRetarget) {
    const minions = s.enemies.filter((enemy) => !enemy.closing && enemy.minion)
    if (minions.length > 0) {
      s.player.lockedUid = minions[0].uid
      playSfx("switch")
      pushBanner(s, `${s.boss.name}「${skill.name}」：锁定目标被打乱`)
    }
  }
  if (skill.regenIfAlive) {
    const minions = s.enemies.filter(
      (enemy) =>
        !enemy.closing &&
        enemy.minion &&
        (skill.spawn ? enemy.spawnSkillId === skill.id : true),
    )
    if (minions.length > 0) {
      s.boss.hp = Math.min(s.boss.maxHp, s.boss.hp + skill.regenIfAlive)
      pushPop(s, "heal", skill.regenIfAlive, false, "boss")
      pushBanner(s, `小怪没清掉，${s.boss.name}回了 ${skill.regenIfAlive} 血`)
    }
  }
  setBossLine(s, s.boss.defId, "skill", { skillId: skill.id })
}

function tickBossSkills(s: RushState) {
  const boss = s.boss
  if (boss.pending) {
    if (s.now >= boss.pending.telegraphUntil) {
      const skill = bossSkillTable(boss.defId, boss.phase).find((item) => item.id === boss.pending?.id)
      const pending = boss.pending
      boss.pending = null
      if (skill) applySkillEffect(s, skill)
      /* 强制观看没点掉：蓄力伤害照常落地 */
      if (pending.clickLabel && skill?.damage && s.player.dodgeUntil < s.now) {
        /* 已在 applySkillEffect 内结算 */
      }
    }
    return
  }
  /* 冻结期（内核之影主动）：整个技能循环停摆 */
  if (s.freezeUntil > s.now) return
  const table = bossSkillTable(boss.defId, boss.phase)
  for (let i = 0; i < boss.skills.length; i += 1) {
    const runtime = boss.skills[i]
    if (s.now < runtime.nextReadyAt) continue
    const skill = table.find((item) => item.id === runtime.id)
    if (!skill) continue
    boss.pending = {
      id: skill.id,
      name: skill.name,
      desc: skill.desc,
      counter: skill.counter,
      telegraphUntil: s.now + skill.telegraphMs,
      dodgeable: skill.dodgeable ?? false,
      damage: skill.damage ?? 0,
      clickLabel: skill.clickLabel ?? null,
    }
    break
  }
}

function cooldownBossSkills(s: RushState, phase: number) {
  s.boss.skills = bossSkillTable(s.boss.defId, phase).map((skill) => ({
    id: skill.id,
    nextReadyAt: s.now + 1200 + skill.cdMs,
  }))
}

/* ---------------- 波间流程 ---------------- */

function enterNextWave(s: RushState) {
  const character = findCharacter(s.characterId)
  if (!character) return
  const beforeMax = s.player.maxHp
  const mods = buildMods(character, s.relics, s.wave + 1)
  const save = loadDungeonSave()
  const upgrades = save.rushUpgrades ?? { battery: 0, overclock: 0, rollback: 0 }
  mods.maxHp += upgrades.battery * 10
  mods.baseAttack += upgrades.overclock * 2
  s.mods = mods
  /* 上限成长部分折算成回血；另吃词条的每层回血 */
  s.player.hp = Math.min(
    mods.maxHp,
    s.player.hp + (mods.maxHp - beforeMax) + (mods.healPerFloor ?? 0),
  )
  s.player.maxHp = mods.maxHp
  s.player.shield = Math.min(mods.shieldMax, s.player.shield)
  s.wave += 1
  s.enemies = []
  s.boss = makeBoss(s.wave, s.now)
  s.bossNextAttackAt = s.now + s.boss.attackIntervalMs + WAVE_REST_MS
  s.bossTelegraphUntil = 0
  s.player.lockedUid = "boss"
  s.freezeUntil = 0
  s.speedCutUntil = 0
  s.choices = null
  s.phase = "fighting"
  setBossLine(s, s.boss.defId, "enter")
  pushBanner(
    s,
    `第 ${s.wave} 波 · ${s.boss.name} 登场（血量 ${s.boss.maxHp}）`,
  )
}

/* ---------------- advance 主循环 ---------------- */

function advance(prev: RushState): RushState {
  if (prev.phase !== "fighting") return prev
  const s = cloneState(prev)
  const wall = Date.now()
  const delta = Math.max(0, Math.min(500, wall - s.wallAt))
  s.wallAt = wall

  /* 顿帧：游戏时间冻住、墙钟照走（与主模式 shiftRunTime 暂停顺延同构） */
  if (s.player.hitStopLeftMs > 0) {
    s.player.hitStopLeftMs = Math.max(0, s.player.hitStopLeftMs - delta)
    if (s.player.hitStopLeftMs === 0 && s.player.pendingHitSfx) {
      playSfx(s.player.pendingHitSfx)
      s.player.pendingHitSfx = null
    }
    return s
  }
  s.now += delta

  const frozen = s.freezeUntil > s.now
  /* 强制跳转时窗自然结束 */
  if (s.boss.speedCut && s.now >= s.speedCutUntil) s.speedCutUntil = 0

  /* 玩家自动攻击 */
  if (s.now >= s.player.nextAutoAt) {
    const target = activeTarget(s)
    /* uid="boss" 时打 Boss 本体：把 Boss 映射成临时敌人再结算 */
    if (s.player.lockedUid === "boss" || s.enemies.filter((e) => !e.closing).length === 0) {
      const bossAsEnemy: RushEnemy = {
        uid: "boss",
        defId: s.boss.defId,
        displayName: s.boss.name,
        trait: s.boss.trait,
        kind: s.boss.defId === "boss-crash" ? "bigboss" : "boss",
        maxHp: s.boss.maxHp,
        hp: s.boss.hp,
        attack: s.boss.attack,
        attackIntervalMs: s.boss.attackIntervalMs,
        defense: s.boss.defense,
        nextAttackAt: 0,
        telegraphUntil: 0,
        telegraphMs: 0,
        hitAt: 0,
        closing: false,
        closedAt: 0,
        minion: false,
        spawnSkillId: null,
        attackCutPct: 0,
      }
      playerAttackOnce(s, bossAsEnemy, false)
      s.boss.hp = bossAsEnemy.hp
    } else {
      playerAttackOnce(s, target, false)
    }
    s.player.nextAutoAt = s.now + effectiveAttackInterval(s)
  }

  /* 召唤小怪出手 */
  for (const enemy of s.enemies) {
    if (enemy.closing || frozen) continue
    if (enemy.telegraphUntil > 0) {
      if (s.now >= enemy.telegraphUntil) {
        enemy.telegraphUntil = 0
        hurtPlayer(s, enemy.attack, enemy.displayName)
        enemy.nextAttackAt = s.now + enemy.attackIntervalMs
      }
    } else if (s.now >= enemy.nextAttackAt) {
      enemy.telegraphUntil = s.now + enemy.telegraphMs
    }
  }

  /* Boss 本体普攻（红圈前摇 → 落地） */
  if (!frozen && s.phase === "fighting") {
    if (s.bossTelegraphUntil > 0) {
      if (s.now >= s.bossTelegraphUntil) {
        s.bossTelegraphUntil = 0
        hurtPlayer(
          s,
          Math.round(s.boss.attack * (s.boss.attackDouble ? BOSS_CRASH_ATTACK_MULT : 1)),
          s.boss.name,
        )
        s.bossNextAttackAt = s.now + s.boss.attackIntervalMs
      }
    } else if (s.now >= s.bossNextAttackAt) {
      s.bossTelegraphUntil = s.now + 900
    }
    tickBossSkills(s)
  }

  /* 小怪尸体清场 */
  s.enemies = s.enemies.filter((enemy) => !enemy.closing || s.now - enemy.closedAt < 520)
  /* 弹窗雨等小怪在场时的玩家攻减 */
  s.attackCutPct = s.enemies.reduce(
    (max, enemy) => (enemy.closing ? max : Math.max(max, enemy.attackCutPct)),
    0,
  )

  if (s.phase !== "fighting") return s

  /* Boss 死亡 → 波次清空 */
  if (s.boss.hp <= 0) {
    waveCleared(s)
    return s
  }

  /* Boss 阶段推进 */
  const phaseNow = bossPhaseOf(s.boss.defId, s.boss.hp / s.boss.maxHp)
  if (phaseNow !== s.boss.phase) {
    s.boss.phase = phaseNow
    cooldownBossSkills(s, phaseNow)
    s.boss.pending = null
    s.boss.speedCut = s.boss.defId === "boss-crash" && phaseNow >= 2
    s.boss.attackDouble = s.boss.defId === "boss-crash" && phaseNow >= 3
    s.boss.dodgeBonus = s.boss.defId === "boss-crash" && phaseNow >= 3 ? BOSS_CRASH_DODGE_BONUS : 0
    pushBanner(s, `${s.boss.name} 进入第 ${phaseNow} 阶段！`)
    setBossLine(s, s.boss.defId, "phase", { phase: phaseNow })
    playSfx("comboBreak")
  }

  return s
}

/* ---------------- 局初始化 ---------------- */

function createRush(
  character: DungeonCharacter,
  lowSpec: boolean,
  seed: string,
): RushState {
  const save = loadDungeonSave()
  const upgrades = save.rushUpgrades ?? { battery: 0, overclock: 0, rollback: 0 }
  const mods = buildMods(character, [], 1)
  /* 祭坛永久升级只在这里生效：备用电池 + 生命上限、超频核心 + 攻击 */
  mods.maxHp += upgrades.battery * 10
  mods.baseAttack += upgrades.overclock * 2
  const now = 1000
  const boss = makeBoss(1, now)
  return {
    seed,
    phase: "fighting",
    wave: 1,
    kills: 0,
    runCoins: 0,
    coinPulse: null,
    now,
    wallAt: Date.now(),
    characterId: character.id,
    characterName: character.displayName,
    characterIsShade: character.id === "kernel-shade",
    relics: [],
    mods,
    player: {
      hp: mods.maxHp,
      maxHp: mods.maxHp,
      shield: mods.startShield,
      nextAutoAt: now + Math.max(150, mods.attackIntervalMs),
      activeReadyAt: now,
      dodgeReadyAt: now,
      dodgeUntil: 0,
      immuneUntil: 0,
      critNext: false,
      listenerStacks: 0,
      hitCount: 0,
      dodgeHasteUntil: 0,
      rangerHasteUntil: 0,
      multithreadUntil: 0,
      doubleStrikeUntil: 0,
      lockedUid: "boss",
      lastLockAt: 0,
      hitStopLeftMs: 0,
      hitStopSeq: 0,
      pendingHitSfx: null,
      lastHitStopAt: 0,
    },
    revivePool: upgrades.rollback,
    freezeUntil: 0,
    speedCutUntil: 0,
    attackCutPct: 0,
    boss,
    bossNextAttackAt: now + boss.attackIntervalMs + WAVE_REST_MS,
    bossTelegraphUntil: 0,
    enemies: [],
    pops: [],
    banner: null,
    bannerSeq: 0,
    bossLine: null,
    bossLineSeq: 0,
    choices: null,
    settle: null,
    popSeq: 0,
    lowSpec,
  }
}

/* ---------------- Hook 本体 ---------------- */

export function useBossRush() {
  const navigate = useNavigate()

  /* 沿用上次出战角色：没有上次就用已解锁的第一个 */
  const character = useMemo<DungeonCharacter>(() => {
    const save = loadDungeonSave()
    const last = findCharacter(save.lastCharacterId)
    if (last) return last
    const firstUnlocked =
      save.unlockedCharacters
        .map((id) => findCharacter(id))
        .find((item): item is DungeonCharacter => item !== null) ?? null
    return firstUnlocked ?? findCharacter("tab-assassin")!
  }, [])
  const skin = useMemo<CharacterSkin>(() => getEquippedSkin(character.id), [character.id])
  const lowSpec = useMemo(() => loadDungeonSave().settings.lowSpec, [])

  const [run, setRun] = useState<RushState>(() =>
    createRush(character, lowSpec, getRandomSeed()),
  )
  const [altarOpen, setAltarOpen] = useState(false)
  const [save, setSave] = useState<DungeonSave>(() => loadDungeonSave())
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | null>(null)
  /** 一局只写一次档（StrictMode 下 effect 双跑靠 ref 挡住） */
  const settledRunRef = useRef(false)

  const pushPurchaseNotice = useCallback((text: string) => {
    setPurchaseNotice(text)
    if (typeof window === "undefined") return
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setPurchaseNotice(null), 2600)
  }, [])

  /* 100ms 战斗 tick */
  useEffect(() => {
    const timer = window.setInterval(() => {
      setRun((prev) => advance(prev))
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  /* 进结算：一次性写祭坛存档 + 刷纪录 */
  useEffect(() => {
    if (run.phase !== "settle" || !run.settle) return
    if (settledRunRef.current) return
    settledRunRef.current = true
    const { newRecord } = finishRushRun({
      wave: run.wave,
      kills: run.kills,
      coins: run.runCoins,
      characterId: run.characterId,
      characterName: run.characterName,
    })
    setSave(loadDungeonSave())
    setRun((prev) =>
      prev.settle ? { ...prev, settle: { ...prev.settle, newRecord } } : prev,
    )
  }, [run.phase, run.settle, run.wave, run.kills, run.runCoins, run.characterId, run.characterName])

  /* ---------------- 操作 ---------------- */

  const useActiveSkill = useCallback(() => {
    setRun((prev) => {
      if (prev.phase !== "fighting" || prev.now < prev.player.activeReadyAt) return prev
      const s = cloneState(prev)
      s.player.activeReadyAt = s.now + s.mods.activeCooldownMs
      playSfx("skill")
      const hitBoss = (damage: number) => {
        const bossAsEnemy = tempBossEnemy(s)
        const killed = damageEnemy(s, bossAsEnemy, damage, false)
        s.boss.hp = bossAsEnemy.hp
        return killed
      }
      switch (s.characterId) {
        case "tab-assassin": {
          const killed = hitBoss(Math.round(8 * s.mods.activeDamageMult))
          /* 关闭标签：击杀则冷却归零 */
          if (killed) s.player.activeReadyAt = s.now
          break
        }
        case "cache-mage": {
          const before = s.player.shield
          s.player.shield = Math.min(s.mods.shieldMax, s.player.shield + MAGE_SHIELD_GAIN)
          pushPop(s, "shield", s.player.shield - before, false, "player")
          playSfx("activate")
          break
        }
        case "script-warrior": {
          s.player.doubleStrikeUntil = s.now + DOUBLE_STRIKE_MS
          break
        }
        case "incognito-ranger": {
          s.player.immuneUntil = s.now + RANGER_STEP_MS
          s.player.rangerHasteUntil = s.now + RANGER_STEP_MS
          break
        }
        case "cookie-thief": {
          hitBoss(Math.round(COOKIE_ACTIVE_DAMAGE * s.mods.activeDamageMult))
          s.player.hp = Math.min(s.player.maxHp, s.player.hp + COOKIE_ACTIVE_HEAL)
          pushPop(s, "heal", COOKIE_ACTIVE_HEAL, false, "player")
          break
        }
        case "worker-monk": {
          s.player.multithreadUntil = s.now + MULTITHREAD_MS
          break
        }
        case "kernel-shade": {
          s.freezeUntil = s.now + FREEZE_MS
          for (const enemy of s.enemies) enemy.telegraphUntil = 0
          s.boss.pending = null
          s.bossTelegraphUntil = 0
          break
        }
      }
      if (s.phase === "fighting" && s.boss.hp <= 0) waveCleared(s)
      return s
    })
  }, [])

  const useDodgeSkill = useCallback(() => {
    setRun((prev) => {
      if (prev.phase !== "fighting" || prev.now < prev.player.dodgeReadyAt) return prev
      const s = cloneState(prev)
      s.player.dodgeUntil = s.now + s.mods.dodgeWindowMs
      s.player.dodgeReadyAt = s.now + s.mods.dodgeCooldownMs
      playSfx("dodge")
      /* 完美闪避：任意出手（Boss 或小怪）前摇最后 200ms 内闪 */
      const perfect =
        (s.bossTelegraphUntil > 0 && s.bossTelegraphUntil - s.now <= PERFECT_DODGE_WINDOW_MS) ||
        s.enemies.some(
          (enemy) =>
            !enemy.closing &&
            enemy.telegraphUntil > 0 &&
            enemy.telegraphUntil - s.now <= PERFECT_DODGE_WINDOW_MS,
        )
      if (perfect) {
        s.player.hp = Math.min(s.player.maxHp, s.player.hp + PERFECT_DODGE_HEAL)
        s.player.critNext = true
        pushPop(s, "heal", PERFECT_DODGE_HEAL, false, "player")
        playSfx("perfect")
      }
      if (s.characterId === "tab-assassin") s.player.dodgeHasteUntil = s.now + DODGE_HASTE_MS
      if (s.characterId === "incognito-ranger") s.player.critNext = true
      return s
    })
  }, [])

  const lockEnemy = useCallback((uid: string) => {
    setRun((prev) => {
      if (prev.phase !== "fighting" || prev.now - prev.player.lastLockAt < LOCK_SWITCH_MS) return prev
      const s = cloneState(prev)
      s.player.lockedUid = uid
      s.player.lastLockAt = s.now
      playSfx("switch")
      return s
    })
  }, [])

  /** 强制观看：点掉 Boss 蓄力中的「跳过」按钮 */
  const dismissBossClick = useCallback(() => {
    setRun((prev) => {
      if (!prev.boss.pending?.clickLabel) return prev
      const s = cloneState(prev)
      s.boss.pending = null
      playSfx("close")
      pushBanner(s, "已跳过广告")
      return s
    })
  }, [])

  /** 三选一确认（满 6 时带替换目标） */
  const pickChoice = useCallback((relic: Relic, replaceId?: string) => {
    setRun((prev) => {
      if (prev.phase !== "relic" || !prev.choices) return prev
      const s = cloneState(prev)
      let relics = s.relics
      if (relics.length >= MAX_RELIC_SLOTS && replaceId) {
        relics = relics.map((item) => (item.id === replaceId ? relic : item))
      } else if (relics.length < MAX_RELIC_SLOTS) {
        relics = [...relics, relic]
      } else {
        return prev
      }
      s.relics = relics
      playSfx("pick")
      enterNextWave(s)
      return s
    })
  }, [])

  const skipChoice = useCallback(() => {
    setRun((prev) => {
      if (prev.phase !== "relic") return prev
      const s = cloneState(prev)
      enterNextWave(s)
      return s
    })
  }, [])

  /** 收手：随时撤退，祭坛币全额入账（写档在结算 effect 里统一做） */
  const retreat = useCallback(() => {
    setRun((prev) => {
      if (prev.phase === "settle") return prev
      const s = cloneState(prev)
      s.phase = "settle"
      s.settle = { kind: "retreat", cause: "见好就收，祭坛币全额入账", newRecord: false }
      s.choices = null
      return s
    })
  }, [])

  /** 再来一局：零摩擦重开（新种子、空词条，祭坛升级自然生效） */
  const restart = useCallback(() => {
    settledRunRef.current = false
    setSave(loadDungeonSave())
    setAltarOpen(false)
    setRun(createRush(character, lowSpec, getRandomSeed()))
  }, [character, lowSpec])

  const goHome = useCallback(() => navigate("/"), [navigate])
  const openAltar = useCallback(() => setAltarOpen(true), [])
  const closeAltar = useCallback(() => setAltarOpen(false), [])

  const buyUpgrade = useCallback(
    (key: RushUpgradeKey) => {
      const result = purchaseRushUpgrade(key)
      pushPurchaseNotice(result.message)
      if (result.ok) {
        playSfx("coin")
        setSave(result.save)
      } else {
        playSfx("comboBreak")
      }
    },
    [pushPurchaseNotice],
  )

  /* 键盘：空格 = 主动技，Shift = 闪避 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault()
        useActiveSkill()
      } else if (event.key === "Shift") {
        useDodgeSkill()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [useActiveSkill, useDodgeSkill])

  /* 滑动闪避：战斗区 pointer 水平位移 >40px（与主模式同阈值） */
  const swipeStartRef = useRef<number | null>(null)
  const battlePointerDown = useCallback((x: number) => {
    swipeStartRef.current = x
  }, [])
  const battlePointerUp = useCallback(
    (x: number) => {
      if (swipeStartRef.current !== null && Math.abs(x - swipeStartRef.current) > 40) {
        useDodgeSkill()
      }
      swipeStartRef.current = null
    },
    [useDodgeSkill],
  )

  /* ---------------- HUD 派生 ---------------- */

  const cycle = rushCycle(run.wave)
  const hpRatio = Math.max(0, Math.min(1, run.boss.hp / run.boss.maxHp))
  const relicFull = run.relics.length >= MAX_RELIC_SLOTS
  const upgrades = save.rushUpgrades ?? { battery: 0, overclock: 0, rollback: 0 }

  return {
    /* 运行 */
    phase: run.phase,
    wave: run.wave,
    kills: run.kills,
    runCoins: run.runCoins,
    coinPulse: run.coinPulse,
    now: run.now,
    /* 角色 */
    character,
    skin,
    characterNote: "沿用上次出战角色 · 想换去首页换",
    /* 战斗实体 */
    player: run.player,
    boss: run.boss,
    hpRatio,
    enemies: run.enemies,
    pops: run.pops.filter((pop) => run.now - pop.at < POP_LIFE_MS),
    banner: run.banner,
    bossLine: run.bossLine,
    /* HUD 数值 */
    cycle,
    hpMultText: `×${Math.pow(RUSH_HP_MULT_PER_CYCLE, cycle).toFixed(2)}`,
    activeLeftMs: Math.max(0, run.player.activeReadyAt - run.now),
    activeCdMs: run.mods.activeCooldownMs,
    dodgeLeftMs: Math.max(0, run.player.dodgeReadyAt - run.now),
    dodgeCdMs: run.mods.dodgeCooldownMs,
    hitStopHeld: run.player.hitStopLeftMs > 0,
    hitStopSeq: run.player.hitStopSeq,
    frozen: run.freezeUntil > run.now,
    pendingSkill: run.boss.pending,
    bossTelegraphActive: run.bossTelegraphUntil > 0,
    attackCutPct: run.attackCutPct,
    attackIntervalMs: effectiveAttackInterval(run),
    /* 词条 */
    relics: run.relics,
    relicFull,
    maxRelicSlots: MAX_RELIC_SLOTS,
    choices: run.choices,
    /* 结算 / 祭坛 */
    settle: run.settle,
    altarOpen,
    save,
    coins: save.rushCoins ?? 0,
    upgrades,
    bestWave: save.rushBest?.wave ?? 0,
    rushHistory: save.rushHistory ?? [],
    purchaseNotice,
    upgradeDefs: RUSH_UPGRADES,
    upgradeDefOf: rushUpgradeDef,
    lowSpec,
    /* 操作 */
    useActiveSkill,
    useDodgeSkill,
    lockEnemy,
    dismissBossClick,
    pickChoice,
    skipChoice,
    retreat,
    restart,
    goHome,
    openAltar,
    closeAltar,
    buyUpgrade,
    battlePointerDown,
    battlePointerUp,
  }
}

/** Boss 本体的临时敌人视图（伤害统一走 damageEnemy 通道） */
function tempBossEnemy(s: RushState): RushEnemy {
  return {
    uid: "boss",
    defId: s.boss.defId,
    displayName: s.boss.name,
    trait: s.boss.trait,
    kind: s.boss.defId === "boss-crash" ? "bigboss" : "boss",
    maxHp: s.boss.maxHp,
    hp: s.boss.hp,
    attack: s.boss.attack,
    attackIntervalMs: s.boss.attackIntervalMs,
    defense: s.boss.defense,
    nextAttackAt: 0,
    telegraphUntil: 0,
    telegraphMs: 0,
    hitAt: 0,
    closing: false,
    closedAt: 0,
    minion: false,
    spawnSkillId: null,
    attackCutPct: 0,
  }
}
