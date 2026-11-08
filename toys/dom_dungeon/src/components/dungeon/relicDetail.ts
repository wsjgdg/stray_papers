/**
 * 三选一卡片的「详细解释 + 具体数值」。
 *
 * 所有数字都从现有数据层现算，不写死：
 * - 角色基础值 / 每层成长走 `CHARACTER_COMBAT` + `scaleCombatForFloor`
 * - 「拿到这条之后」的数值走战斗引擎自己的 `buildMods`（词条 + 被动一起汇总）
 * 这样详情面板跟实际战斗结算用的是同一套公式，不会各说各话。
 * 机制型词条（改变战斗规则的那批）不做假数值对比，统一标「改变战斗机制」。
 */

import {
  CHARACTER_COMBAT,
  RELIC_RISK_LABEL,
  getRelicComboProgress,
  scaleCombatForFloor,
  type DungeonCharacter,
  type Relic,
  type RelicEffect,
} from "@/lib/dungeonData"
import { buildMods } from "@/pages/Dungeon/useDungeon"

/** 机制型效果字段：出现任何一个 = 这条词条改变战斗规则，而不是简单加减数值 */
const MECHANISM_EFFECT_KEYS: string[] = [
  "bounceCount",
  "bounceRatio",
  "bounceMemoryCost",
  "closureEcho",
  "tripleOnHurt",
  "throttleGain",
  "chainCrit",
  "blockActiveMs",
  "decoyAfterDodge",
  "responsiveRefactor",
  "enemySlowMs",
  "shieldSplit",
  "shieldAttackBonus",
  "darkTheme",
  "stealMemoryOnCrit",
  "fourthHitCrit",
  "memoryGainFourthHit",
  "overflowTransfer",
  "pierceRatio",
  "pierceMemoryCost",
  "reviveMemoryCost",
  "rerollForceRare",
  "memoryMaxDelta",
  "memoryMaxPerFloorDelta",
  "storageHealPool",
  "killMemoryGain",
  "minionDeathMemory",
  "deathWardClearMinions",
  "offlineWindowMs",
  "offlineCooldownMs",
  "freeRerollOnce",
]

function isMechanismRelic(effect: RelicEffect): boolean {
  return Object.keys(effect).some((key) => MECHANISM_EFFECT_KEYS.includes(key))
}

export type RelicDetailFact = { label: string; value: string }

export type RelicDetail = {
  /** 一句话效果，直接用词条本身的描述 */
  headline: string
  /** 具体数值：当前值 → 拿到后的值 */
  facts: RelicDetailFact[]
  /** 触发条件 / 归属 / 乘区说明 */
  notes: string[]
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} 秒`
}

function perSecond(intervalMs: number): string {
  if (intervalMs <= 0) return "—"
  return `${(1000 / intervalMs).toFixed(2)} 次/秒`
}

export function buildRelicDetail(
  relic: Relic,
  character: DungeonCharacter,
  relics: Relic[],
  floor: number,
): RelicDetail {
  const owned = relics.filter((item) => item.id !== relic.id)
  const before = buildMods(character, owned, floor)
  const after = buildMods(character, [...owned, relic], floor)
  const combat = scaleCombatForFloor(CHARACTER_COMBAT[character.id], floor)
  const effect = relic.effect

  const facts: RelicDetailFact[] = []
  const notes: string[] = []

  /* 内存与风险：v4 起每条词条都先交代这两项 */
  facts.push(
    {
      label: "内存",
      value:
        relic.memoryCost !== undefined && relic.memoryCost > 0
          ? `消 ${relic.memoryCost}`
          : relic.memoryCost !== undefined && relic.memoryCost < 0
            ? `产 ${-relic.memoryCost}`
            : "无",
    },
    { label: "风险", value: RELIC_RISK_LABEL[relic.risk] },
  )

  if (isMechanismRelic(effect)) {
    facts.push({ label: "机制", value: "改变战斗机制" })
    notes.push(
      "这是一条机制型词条：它改变的是战斗规则本身（配合内存的消耗与产出），面板上的数值对比只覆盖其中能用数字表达的部分。",
    )
  }

  if (effect.memoryMaxDelta !== undefined || effect.memoryMaxPerFloorDelta !== undefined) {
    facts.push(
      { label: "当前内存上限", value: `${before.memoryMax} 点` },
      { label: "拿到后内存上限", value: `${after.memoryMax} 点` },
    )
    notes.push(
      "内存上限会被压掉的词条是高风险高收益：产出更强，但余额更容易见底。",
    )
  }

  const attackNow = Math.max(
    1,
    Math.round((before.baseAttack + before.attackFlat) * before.attackMult),
  )
  const attackAfter = Math.max(
    1,
    Math.round((after.baseAttack + after.attackFlat) * after.attackMult),
  )

  if (effect.attackIntervalMult !== undefined) {
    facts.push(
      { label: "基础攻击间隔", value: `${combat.attackIntervalMs} 毫秒` },
      { label: "当前攻速", value: perSecond(before.attackIntervalMs) },
      { label: "拿到后攻速", value: perSecond(after.attackIntervalMs) },
    )
    notes.push(
      "攻速走乘区：所有攻速修正相乘后一起作用在攻击间隔上，不跟别的加成相加。这条只改出手频率，单次伤害不变。",
    )
  }

  if (
    effect.followupChance !== undefined ||
    effect.followupRatio !== undefined
  ) {
    const chance = effect.followupChance ?? 0
    const ratio = effect.followupRatio ?? 0.5
    facts.push(
      { label: "触发概率", value: pct(chance) },
      { label: "追加伤害", value: `本次攻击的 ${pct(ratio)}` },
      { label: "长期输出提升", value: `约 ${pct(chance * ratio)}` },
    )
    notes.push(
      "追加的那一下算一次独立攻击：照常判定暴击、照常累计命中次数，伤害打在当前锁定的敌人身上。",
    )
  }

  if (effect.activeCooldownMult !== undefined) {
    facts.push(
      { label: "当前主动技冷却", value: seconds(before.activeCooldownMs) },
      { label: "拿到后冷却", value: seconds(after.activeCooldownMs) },
    )
    notes.push("冷却走乘区：多个冷却修正相乘后，一起作用在角色基础冷却上。")
  }

  if (effect.activeDamageMult !== undefined) {
    facts.push({
      label: "主动技伤害倍率",
      value: `×${after.activeDamageMult.toFixed(1)}`,
    })
    notes.push("主动技的伤害单独乘这一档，不影响自动攻击。")
  }

  if (effect.critAfterHits !== undefined) {
    facts.push({
      label: "需要的连续命中",
      value: `${Math.round(effect.critAfterHits)} 次`,
    })
    notes.push("命中次数按自动攻击累加，攒满后下一击必定暴击，计数清零重新攒。")
  }

  if (effect.startShield !== undefined) {
    facts.push(
      { label: "当前每层开局护盾", value: `${before.startShield} 点` },
      { label: "拿到后每层开局护盾", value: `${after.startShield} 点` },
    )
    notes.push("每层开始自动补到这个点数，不跨层累积；跟护盾上限是两回事。")
  }

  if (effect.dodgeWindowBonusMs !== undefined) {
    facts.push(
      { label: "当前无敌窗口", value: seconds(before.dodgeWindowMs) },
      { label: "拿到后无敌窗口", value: seconds(after.dodgeWindowMs) },
    )
    notes.push(
      "只加在主动闪避按钮上：按下闪避后这段时间内完全免伤，跟闪避率的高低无关。",
    )
  }

  if (effect.lowHpReduction !== undefined) {
    facts.push(
      { label: "触发阈值", value: `生命 ≤ ${pct(effect.lowHpThreshold ?? 0)}` },
      { label: "减伤", value: pct(effect.lowHpReduction) },
    )
    notes.push("只对真正落到生命上的伤害生效，被护盾吃掉的伤害不参与减伤计算。")
  }

  if (effect.hurtDodgeChance !== undefined) {
    facts.push(
      { label: "常驻闪避", value: pct(after.dodgeChance) },
      { label: "受击后额外", value: `+${pct(effect.hurtDodgeChance)}` },
      { label: "加成持续", value: seconds(effect.hurtDodgeMs ?? 0) },
    )
    notes.push("触发条件是掉血之后；加成的闪避率跟常驻闪避相加，窗口过了就还原。")
  }

  if (effect.shieldBreakDamage !== undefined) {
    facts.push(
      { label: "角色自带同类效果", value: `${combat.shieldBreakDamage} 点` },
      { label: "当前护盾破碎伤害", value: `${before.shieldBreakDamage} 点` },
      { label: "拿到后护盾破碎伤害", value: `${after.shieldBreakDamage} 点` },
    )
    notes.push(
      "触发条件是护盾被打空的那一刻；伤害记在当前锁定的敌人身上，按不暴击的普通伤害结算，并跟角色自带的同类效果相加。",
    )
  }

  if (effect.shieldMaxMult !== undefined) {
    facts.push(
      { label: "当前护盾上限", value: `${before.shieldMax} 点` },
      { label: "拿到后护盾上限", value: `${after.shieldMax} 点` },
    )
    notes.push("护盾上限走乘区，只改上限；每层开局补的护盾值不变。")
  }

  if (effect.attackMult !== undefined) {
    facts.push(
      { label: "当前单次攻击", value: `约 ${attackNow} 点` },
      { label: "拿到后单次攻击", value: `约 ${attackAfter} 点` },
    )
    notes.push(
      "攻击力走乘区：（基础攻击 + 固定加成）× 百分比加成，自动攻击和主动技共用这个基数。",
    )
  }

  if (effect.critChance !== undefined) {
    facts.push(
      { label: "当前暴击率", value: pct(before.critChance) },
      { label: "拿到后暴击率", value: pct(after.critChance) },
    )
    notes.push("暴击率跟角色基础值相加，有上限封顶；跟暴击伤害各算各的。")
  }

  if (effect.critMult !== undefined) {
    facts.push(
      { label: "当前暴击伤害", value: pct(before.critMult) },
      { label: "拿到后暴击伤害", value: pct(after.critMult) },
    )
    notes.push("暴击伤害是加算：直接加到角色基础倍率上，不是相乘。")
  }

  if (effect.killBonusMult !== undefined) {
    facts.push({ label: "下一击增伤", value: `+${pct(effect.killBonusMult)}` })
    notes.push("触发条件是击杀敌人之后，只作用在紧接的那一击上，打完就消耗掉。")
  }

  if (effect.penetration !== undefined) {
    facts.push(
      { label: "当前穿透", value: pct(before.penetration) },
      { label: "拿到后穿透", value: pct(after.penetration) },
    )
    notes.push("按比例削减敌人防御，多个穿透来源相加，最多削到 100%。")
  }

  if (effect.reviveChance !== undefined) {
    facts.push(
      { label: "复活概率", value: pct(effect.reviveChance) },
      {
        label: "复活后生命",
        value: pct(effect.reviveHpRatio ?? after.reviveHpRatio),
      },
    )
    notes.push(
      "被动保底：生命归零那一刻先判必死豁免类效果，都没接住才轮到这次概率复活。复活要现场扣内存，余额不够就跳不了这一段。",
    )
  }

  if (effect.rerollPerFloor !== undefined) {
    facts.push({
      label: "每层刷新次数",
      value: `+${Math.round(effect.rerollPerFloor)} 次`,
    })
    notes.push("跟每层的基础刷新次数相加，跨层不累积。")
  }

  if (effect.enemyIntervalMult !== undefined) {
    facts.push({
      label: "敌人攻击间隔",
      value: `×${effect.enemyIntervalMult.toFixed(2)}`,
    })
    notes.push("走乘区：敌人两次攻击之间的等待变长，等于全场敌人的输出一起下降。")
  }

  if (effect.healPerFloor !== undefined) {
    facts.push({
      label: "每层回复",
      value: `${Math.round(effect.healPerFloor)} 点`,
    })
    notes.push("清完一层、进入下一层时结算，回复量按当前生命上限封顶。")
  }

  if (effect.fragmentMult !== undefined) {
    facts.push({ label: "碎片获取", value: `+${pct(effect.fragmentMult)}` })
    notes.push("击杀敌人拿到的碎片按这个比例加成，结算时向下取整，每次至少 1 点。")
  }

  if (effect.bonusPickRounds !== undefined) {
    facts.push({
      label: "额外三选一",
      value: `+${Math.round(effect.bonusPickRounds)} 轮`,
    })
    notes.push("开局多一次三选一机会，只在本局有效。")
  }

  if (effect.attackPerFloorMult !== undefined) {
    const steps = Math.max(0, floor - 1)
    facts.push(
      { label: "每层攻击加成", value: `+${pct(after.attackPerFloorMult)}` },
      {
        label: `到第 ${floor} 层累计`,
        value: `+${pct(after.attackPerFloorMult * steps)}`,
      },
    )
    notes.push("按层数线性叠加，本层立刻生效；再拿到同一条会继续往上累加。")
  }

  if (effect.healOnKill !== undefined) {
    facts.push({
      label: "每次击杀回复",
      value: `${Math.round(effect.healOnKill)} 点`,
    })
    notes.push("普通敌人和 Boss 都算，回复量按当前生命上限封顶。")
  }

  if (effect.deathWardPerFloors !== undefined) {
    facts.push({ label: "攒免死", value: "每 3 层补 1 次" })
    notes.push(
      "触发时以三成生命站起来；跟「满血复活」这类效果分开计数，一次只消耗一层。",
    )
  }

  if (effect.crossSchool !== undefined) {
    facts.push({ label: "顶替效果", value: "每条流派 combo 少 1 件" })
    notes.push(
      "跨域顶替：持有它时，每条流派 combo 都视为少 1 件要求，缺哪个补哪个。代价是内存上限下降。",
    )
  }

  if (effect.extraChoiceCount !== undefined) {
    facts.push({
      label: "三选一选项",
      value: `+${Math.round(effect.extraChoiceCount)} 张`,
    })
    notes.push("本局每次三选一都会多摆一张卡，更容易凑到想要的系。")
  }

  const combo = getRelicComboProgress(owned, relic)
  if (combo) {
    facts.push({
      label: "流派进度",
      value:
        combo.remain === 0
          ? `选它点亮【${combo.combo.name}】`
          : `凑【${combo.combo.name}】还差 ${combo.remain} 件`,
    })
  }

  return { headline: relic.desc, facts, notes }
}
