import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  BOSS_AD_BODY_HP,
  BOSS_AD_BUTTON_HP,
  BOSS_AD_BUTTONS,
  BOSS_AD_LIMIT_MS,
  BOSS_AD_PENALTY,
  BOSS_CRASH_ATTACK_MULT,
  BOSS_CRASH_DODGE_BONUS,
  BOSS_CRASH_LIMIT_MS,
  BOSS_CRASH_PHASE2_AT,
  BOSS_CRASH_PHASE3_AT,
  BOSS_CRASH_PHASE_LABEL,
  BOSS_CRASH_POPUP_DAMAGE,
  BOSS_CRASH_SPEED_CUT,
  CODEX_FIX_COST_FRAGMENTS,
  CODEX_FIX_EPIC_CORES,
  DUNGEON_CHARACTERS,
  ENEMY_DEFS,
  characterClearsRemaining,
  getCharacterSkins,
  getCharacterStatEntries,
  getDailyDateKey,
  getRelicPoolBySchool,
  getSkinById,
  isCharacterVisible,
  resolveSkin,
  type CharacterId,
  type EnemyDef,
  type Relic,
  type RelicRarity,
  type RelicSchoolKey,
  type SkinStyle,
} from "@/lib/dungeonData"
import {
  equipSkin,
  loadDungeonSave,
  purchaseCodexEntry,
  unlockCharacterDual,
  unlockSkinDual,
  type CurrencyKind,
  type DungeonSave,
} from "@/lib/dungeonSave"
import { achievementStates } from "@/lib/economy"
import { achievementProgressLabel } from "@/lib/achievements"

export type CodexTab = "characters" | "relics" | "enemies" | "bosses" | "achievements"

const TAB_ORDER: CodexTab[] = [
  "characters",
  "relics",
  "enemies",
  "bosses",
  "achievements",
]

export const CODEX_TABS: { id: CodexTab; label: string; hint: string }[] = [
  { id: "characters", label: "角色", hint: "可操作角色与主动技" },
  { id: "relics", label: "词条", hint: "战斗词条与流派 combo" },
  { id: "enemies", label: "敌人", hint: "普通敌人档案" },
  { id: "bosses", label: "Boss", hint: "层主机制拆解" },
  { id: "achievements", label: "成就", hint: "挑战目标与货币奖励" },
]

export type CodexTabProgress = {
  id: CodexTab
  label: string
  hint: string
  lit: number
  total: number
}

/** 角色卡里的一行皮肤圆点：一个圆点 = 一套外观 */
export type CodexSkinEntry = {
  id: string
  displayName: string
  desc: string
  cost: number
  /** 核心价（> 0 = 双路线外观，碎片或核心任选一条买断） */
  coreCost: number
  unlocked: boolean
  equipped: boolean
  /** 碎片路线够不够 */
  affordable: boolean
  /** 碎片还差多少（0 = 够） */
  shortfall: number
  /** 核心路线够不够（coreCost=0 时恒为 false） */
  coreAffordable: boolean
  /** 核心还差多少（coreCost=0 时为 0） */
  coreShortfall: number
  /** 圆点填充（该套配色） */
  dot: string
  /** 选中圆点的强调色描边 */
  border: string
  ring: string
}

export type CodexCharacterEntry = {
  id: CharacterId
  displayName: string
  roleLabel: string
  tagline: string
  passive: string
  activeName: string
  activeDesc: string
  cooldown: string
  /** 角色数值（统一从 dungeonData 取，和首页卡一致） */
  stats: { label: string; value: string }[]
  unlocked: boolean
  /** 隐藏角色是否已达到露面条件；未露面只渲染「？？？」锁定卡 */
  visible: boolean
  /** 距离露面还差几次通关（0 = 已露面） */
  clearsRemaining: number
  fragmentCost: number
  affordable: boolean
  /** 碎片还差多少（0 = 够） */
  shortfall: number
  /** 核心买断价（0 = 不支持核心路线） */
  coreCost: number
  coreAffordable: boolean
  /** 核心还差多少（coreCost=0 时为 0） */
  coreShortfall: number
  progressRatio: number
  justUnlocked: boolean
  /** 未解锁的角色不显示皮肤行（空数组） */
  skins: CodexSkinEntry[]
  equippedSkinId: string
  /** 当前外观的卡面配色（卡面底色 / 强调色跟着变） */
  skinStyle: SkinStyle
}

/** 待确认的外观购买：点买断按钮后先弹一次确认，记下走的是哪条路线 */
export type PendingSkin = {
  characterId: CharacterId
  skinId: string
  displayName: string
  /** 本路线的单价 */
  price: number
  currency: CurrencyKind
}

/** 待确认的角色购买：点价格按钮后先弹一次确认，记下走的是哪条路线 */
export type PendingChar = {
  characterId: CharacterId
  displayName: string
  /** 本路线的单价 */
  price: number
  currency: CurrencyKind
}

/** 词条三态：seen 实战见过 / purchased 购买补全 / 其余为未解锁 */
export type CodexRelicEntry = Relic & {
  seen: boolean
  purchased: boolean
  /** 补全单价（common/rare 收碎片，epic 只收核心） */
  fixPrice: number
  fixCurrency: CurrencyKind
  /** 未收集且余额够才允许补全 */
  canFix: boolean
  /** 还差多少（0 = 够） */
  fixShortfall: number
}

export type CodexRelicGroup = {
  school: RelicSchoolKey
  label: string
  relics: CodexRelicEntry[]
  seenCount: number
}

export type CodexEnemyEntry = EnemyDef & { defeated: boolean }

export type CodexBossPhase = {
  label: string
  detail: string
}

export type CodexBossEntry = {
  id: string
  displayName: string
  floorLabel: string
  trait: string
  hp: number
  attack: number
  limitLabel: string
  phases: CodexBossPhase[]
  defeated: boolean
}

export type CodexAchievementEntry = {
  id: string
  name: string
  desc: string
  reward: { fragments: number; cores: number; seeds: number }
  unlocked: boolean
  /** 能量化进度的给「x / y」，一次性目标为 null */
  progress: string | null
}

function shiftTab(current: CodexTab, delta: number): CodexTab {
  const index = TAB_ORDER.indexOf(current)
  if (index < 0) return TAB_ORDER[0]
  const next = (index + delta + TAB_ORDER.length) % TAB_ORDER.length
  return TAB_ORDER[next]
}

function seconds(ms: number): string {
  return `${Math.round(ms / 1000)} 秒`
}

export function useCodex() {
  const navigate = useNavigate()
  const [save, setSave] = useState<DungeonSave>(() => loadDungeonSave())
  const [activeTab, setActiveTab] = useState<CodexTab>("characters")
  const [notice, setNotice] = useState<string | null>(null)
  const [flashCharacterId, setFlashCharacterId] =
    useState<CharacterId | null>(null)
  const [pendingSkin, setPendingSkin] = useState<PendingSkin | null>(null)
  const [pendingChar, setPendingChar] = useState<PendingChar | null>(null)
  const noticeTimer = useRef<number | null>(null)

  const pushNotice = useCallback((text: string) => {
    setNotice(text)
    if (typeof window !== "undefined") {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
      noticeTimer.current = window.setTimeout(() => setNotice(null), 2600)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  /* 键盘 ← → 切页签（含成就页签） */
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true
      if (typing) return

      if (ev.key === "ArrowRight") {
        ev.preventDefault()
        setActiveTab((prev) => shiftTab(prev, 1))
      } else if (ev.key === "ArrowLeft") {
        ev.preventDefault()
        setActiveTab((prev) => shiftTab(prev, -1))
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const unlockedSet = useMemo(
    () => new Set<string>(save.unlockedCharacters),
    [save.unlockedCharacters],
  )
  const seenRelicSet = useMemo(
    () => new Set(save.seenRelicIds),
    [save.seenRelicIds],
  )
  const purchasedRelicSet = useMemo(
    () => new Set(save.purchasedCodexIds),
    [save.purchasedCodexIds],
  )
  const defeatedEnemySet = useMemo(
    () => new Set(save.defeatedEnemyIds),
    [save.defeatedEnemyIds],
  )
  const defeatedBossSet = useMemo(
    () => new Set(save.defeatedBossIds),
    [save.defeatedBossIds],
  )
  const unlockedSkinSet = useMemo(
    () => new Set(save.unlockedSkinIds),
    [save.unlockedSkinIds],
  )

  const characters: CodexCharacterEntry[] = useMemo(
    () =>
      DUNGEON_CHARACTERS.map((item) => {
        const totalClears = save.runTally.cleared
        const unlocked = unlockedSet.has(item.id)
        const visible = unlocked || isCharacterVisible(item, totalClears)
        const clearsRemaining = unlocked
          ? 0
          : characterClearsRemaining(item, totalClears)
        const cost = Math.max(0, item.fragmentCost)
        const coreCost = Math.max(0, item.coreCost)
        const equippedSkin = resolveSkin(item.id, save.equippedSkins[item.id])
        const skins: CodexSkinEntry[] = unlocked
          ? getCharacterSkins(item.id).map((skin) => {
              const skinUnlocked = unlockedSkinSet.has(skin.id)
              const skinEntry: CodexSkinEntry = {
                id: skin.id,
                displayName: skin.displayName,
                desc: skin.desc,
                cost: skin.cost,
                coreCost: skin.coreCost,
                unlocked: skinUnlocked,
                equipped: skin.id === equippedSkin.id,
                affordable: !skinUnlocked && save.fragments >= skin.cost,
                shortfall: skinUnlocked
                  ? 0
                  : Math.max(0, skin.cost - save.fragments),
                coreAffordable:
                  !skinUnlocked && skin.coreCost > 0 && save.cores >= skin.coreCost,
                coreShortfall:
                  skinUnlocked || skin.coreCost <= 0
                    ? 0
                    : Math.max(0, skin.coreCost - save.cores),
                dot: skin.style.dot,
                border: skin.style.border,
                ring: skin.style.ring,
              }
              return skinEntry
            })
          : []
        const entry: CodexCharacterEntry = {
          id: item.id,
          displayName: item.displayName,
          roleLabel: item.roleLabel,
          tagline: item.tagline,
          passive: item.passive,
          activeName: item.activeName,
          activeDesc: item.activeDesc,
          cooldown: item.cooldown,
          stats: getCharacterStatEntries(item.id),
          unlocked,
          visible,
          clearsRemaining,
          fragmentCost: cost,
          affordable: !unlocked && save.fragments >= cost,
          shortfall: unlocked ? 0 : Math.max(0, cost - save.fragments),
          coreCost,
          coreAffordable: !unlocked && coreCost > 0 && save.cores >= coreCost,
          coreShortfall:
            unlocked || coreCost <= 0 ? 0 : Math.max(0, coreCost - save.cores),
          progressRatio: cost > 0 ? Math.min(1, save.fragments / cost) : 1,
          justUnlocked: flashCharacterId === item.id,
          skins,
          equippedSkinId: equippedSkin.id,
          skinStyle: equippedSkin.style,
        }
        return entry
      }),
    [
      unlockedSet,
      unlockedSkinSet,
      save.fragments,
      save.cores,
      save.equippedSkins,
      save.runTally.cleared,
      flashCharacterId,
    ],
  )

  const relicGroups: CodexRelicGroup[] = useMemo(
    () =>
      getRelicPoolBySchool().map((group) => {
        const relics: CodexRelicEntry[] = group.relics.map((relic) => {
          const seen = seenRelicSet.has(relic.id)
          const purchased = !seen && purchasedRelicSet.has(relic.id)
          const fixCurrency: CurrencyKind = relic.rarity === "epic" ? "cores" : "fragments"
          const fixPrice =
            relic.rarity === "epic" ? CODEX_FIX_EPIC_CORES : CODEX_FIX_COST_FRAGMENTS
          const balance = fixCurrency === "cores" ? save.cores : save.fragments
          const fixShortfall = seen ? 0 : Math.max(0, fixPrice - balance)
          const entry: CodexRelicEntry = {
            ...relic,
            seen,
            purchased,
            fixPrice,
            fixCurrency,
            canFix: !seen && !purchased && fixShortfall === 0,
            fixShortfall,
          }
          return entry
        })
        const entry: CodexRelicGroup = {
          school: group.school,
          label: group.label,
          relics: relics,
          seenCount: relics.filter((relic) => relic.seen).length,
        }
        return entry
      }),
    [seenRelicSet, purchasedRelicSet, save.fragments, save.cores],
  )

  const enemies: CodexEnemyEntry[] = useMemo(
    () =>
      Object.values(ENEMY_DEFS)
        .filter((def) => def.kind === "normal")
        .map((def) => ({ ...def, defeated: defeatedEnemySet.has(def.id) })),
    [defeatedEnemySet],
  )

  const bosses: CodexBossEntry[] = useMemo(() => {
    const list: CodexBossEntry[] = []
    const ad = ENEMY_DEFS["boss-fullscreen"]
    if (ad) {
      list.push({
        id: ad.id,
        displayName: ad.displayName,
        floorLabel: "第 4 层 · 小 Boss",
        trait: ad.trait,
        hp: BOSS_AD_BODY_HP,
        attack: ad.attack,
        limitLabel: `限时 ${seconds(BOSS_AD_LIMIT_MS)}`,
        phases: [
          {
            label: "阶段 1 · 四个关闭按钮",
            detail: `${BOSS_AD_BUTTONS} 个假关闭按钮，每个 ${BOSS_AD_BUTTON_HP} 血，全点掉本体才现身。`,
          },
          {
            label: "阶段 2 · 本体铺满整屏",
            detail: `本体 ${BOSS_AD_BODY_HP} 血，边打边读秒。`,
          },
          {
            label: "超时 · 再盖一次",
            detail: `倒计时归零会扣你 ${BOSS_AD_PENALTY} 点血并重新计时。`,
          },
        ],
        defeated: defeatedBossSet.has(ad.id),
      })
    }

    const crash = ENEMY_DEFS["boss-crash"]
    if (crash) {
      list.push({
        id: crash.id,
        displayName: crash.displayName,
        floorLabel: "第 8 层 · 大 Boss",
        trait: crash.trait,
        hp: crash.hp,
        attack: crash.attack,
        limitLabel: `限时 ${seconds(BOSS_CRASH_LIMIT_MS)} · 超时直接判负`,
        phases: [
          {
            label: BOSS_CRASH_PHASE_LABEL[0],
            detail: `血量高于 ${BOSS_CRASH_PHASE2_AT} 时，它每次攻击额外多掉你 ${BOSS_CRASH_POPUP_DAMAGE} 点血。`,
          },
          {
            label: BOSS_CRASH_PHASE_LABEL[1],
            detail: `血量掉到 ${BOSS_CRASH_PHASE3_AT} 以上时开始重定向，你的攻速只剩 ${Math.round(
              (1 - BOSS_CRASH_SPEED_CUT) * 100,
            )}%。`,
          },
          {
            label: BOSS_CRASH_PHASE_LABEL[2],
            detail: `血量低于 ${BOSS_CRASH_PHASE3_AT} 后攻击翻 ${BOSS_CRASH_ATTACK_MULT} 倍，但你的闪避率 +${Math.round(
              BOSS_CRASH_DODGE_BONUS * 100,
            )}%。`,
          },
        ],
        defeated: defeatedBossSet.has(crash.id),
      })
    }

    return list
  }, [defeatedBossSet])

  const achievements: CodexAchievementEntry[] = useMemo(() => {
    const todayKey = getDailyDateKey()
    return achievementStates(save).map(({ def, unlocked }) => ({
      id: def.id,
      name: def.name,
      desc: def.desc,
      reward: def.reward,
      unlocked,
      progress: unlocked ? null : achievementProgressLabel(save, def.id, todayKey),
    }))
  }, [save])

  const tabProgress: CodexTabProgress[] = useMemo(() => {
    const relicSeen = relicGroups.reduce((sum, group) => sum + group.seenCount, 0)
    const relicTotal = relicGroups.reduce(
      (sum, group) => sum + group.relics.length,
      0,
    )
    const litByTab: Record<CodexTab, { lit: number; total: number }> = {
      characters: {
        lit: characters.filter((item) => item.unlocked).length,
        total: characters.length,
      },
      relics: { lit: relicSeen, total: relicTotal },
      enemies: {
        lit: enemies.filter((item) => item.defeated).length,
        total: enemies.length,
      },
      bosses: {
        lit: bosses.filter((item) => item.defeated).length,
        total: bosses.length,
      },
      achievements: {
        lit: achievements.filter((item) => item.unlocked).length,
        total: achievements.length,
      },
    }
    return CODEX_TABS.map((tab) => ({ ...tab, ...litByTab[tab.id] }))
  }, [characters, relicGroups, enemies, bosses, achievements])

  /* 收集总览只统计角色 + 词条 + 敌人 + Boss，成就单独看自己的页签 */
  const totalCount = useMemo(
    () =>
      characters.length +
      relicGroups.reduce((sum, group) => sum + group.relics.length, 0) +
      enemies.length +
      bosses.length,
    [characters, relicGroups, enemies, bosses],
  )

  const litCount = useMemo(
    () =>
      tabProgress
        .filter((tab) => tab.id !== "achievements")
        .reduce((sum, tab) => sum + tab.lit, 0),
    [tabProgress],
  )

  /** 还没露面的隐藏角色不进底部「还差 N 条」催促文案（收集总览的分母仍照常把 7 个角色全算上） */
  const hiddenPendingCount = useMemo(
    () => characters.filter((item) => !item.visible).length,
    [characters],
  )

  const activeProgress =
    tabProgress.find((tab) => tab.id === activeTab) ?? tabProgress[0]

  const selectTab = useCallback((tab: CodexTab) => {
    setActiveTab(tab)
  }, [])

  const goHome = useCallback(() => {
    navigate("/")
  }, [navigate])

  /** 点角色价格按钮：余额够弹确认（记下走碎片还是核心路线），不够给一句还差多少的提示 */
  const requestCharBuy = useCallback(
    (characterId: CharacterId, currency: CurrencyKind) => {
      const character = DUNGEON_CHARACTERS.find(
        (item) => item.id === characterId,
      )
      if (!character) return
      if (!isCharacterVisible(character, save.runTally.cleared)) return
      if (currency === "cores") {
        if (character.coreCost <= 0) return
        if (save.cores < character.coreCost) {
          pushNotice(
            `「${character.displayName}」还差 ${character.coreCost - save.cores} 个核心`,
          )
          return
        }
      } else if (save.fragments < character.fragmentCost) {
        pushNotice(
          `「${character.displayName}」还差 ${character.fragmentCost - save.fragments} 个碎片`,
        )
        return
      }
      setPendingChar({
        characterId,
        displayName: character.displayName,
        price:
          currency === "cores" ? character.coreCost : character.fragmentCost,
        currency,
      })
    },
    [pushNotice, save.cores, save.fragments, save.runTally.cleared],
  )

  const confirmChar = useCallback(() => {
    if (!pendingChar) return
    const result = unlockCharacterDual(
      pendingChar.characterId,
      pendingChar.currency,
    )
    setSave(result.save)
    setPendingChar(null)
    if (result.ok) {
      setFlashCharacterId(pendingChar.characterId)
      pushNotice(`${pendingChar.displayName} ${result.message}`)
    } else {
      pushNotice(result.message)
    }
  }, [pendingChar, pushNotice])

  const cancelChar = useCallback(() => {
    setPendingChar(null)
  }, [])

  /** 点皮肤圆点：已解锁直接换上；未解锁给一句还差多少的提示 */
  const tapSkin = useCallback(
    (characterId: CharacterId, skinId: string) => {
      const character = DUNGEON_CHARACTERS.find((item) => item.id === characterId)
      const skin = getSkinById(skinId)
      if (!character || !skin) return

      if (save.unlockedSkinIds.includes(skinId)) {
        const result = equipSkin(characterId, skinId)
        setSave(result.save)
        pushNotice(`${character.displayName} ${result.message}`)
        return
      }

      if (save.fragments < skin.cost) {
        pushNotice(`「${skin.displayName}」还差 ${skin.cost - save.fragments} 个碎片`)
      }
    },
    [pushNotice, save.fragments, save.unlockedSkinIds],
  )

  /** 点买断按钮：余额够弹确认（记下走碎片还是核心路线），不够给一句提示 */
  const requestSkinBuy = useCallback(
    (characterId: CharacterId, skinId: string, currency: CurrencyKind) => {
      const skin = getSkinById(skinId)
      if (!skin) return
      if (currency === "cores") {
        if (skin.coreCost <= 0) return
        if (save.cores < skin.coreCost) {
          pushNotice(`「${skin.displayName}」还差 ${skin.coreCost - save.cores} 个核心`)
          return
        }
      } else if (save.fragments < skin.cost) {
        pushNotice(`「${skin.displayName}」还差 ${skin.cost - save.fragments} 个碎片`)
        return
      }
      setPendingSkin({
        characterId,
        skinId,
        displayName: skin.displayName,
        price: currency === "cores" ? skin.coreCost : skin.cost,
        currency,
      })
    },
    [pushNotice, save.cores, save.fragments],
  )

  const confirmSkin = useCallback(() => {
    if (!pendingSkin) return
    const character = DUNGEON_CHARACTERS.find(
      (item) => item.id === pendingSkin.characterId,
    )
    const result = unlockSkinDual(
      pendingSkin.characterId,
      pendingSkin.skinId,
      pendingSkin.currency,
    )
    setSave(result.save)
    setPendingSkin(null)
    pushNotice(`${character?.displayName ?? "角色"} ${result.message}`)
  }, [pendingSkin, pushNotice])

  const cancelSkin = useCallback(() => {
    setPendingSkin(null)
  }, [])

  /** 图鉴补全：未见词条花碎片（epic 只收核心）解锁详情 */
  const fixRelic = useCallback(
    (relicId: string, rarity: RelicRarity) => {
      const result = purchaseCodexEntry(relicId, rarity)
      setSave(result.save)
      pushNotice(result.message)
    },
    [pushNotice],
  )

  return {
    activeTab: activeTab,
    activeProgress: activeProgress,
    characters: characters,
    relicGroups: relicGroups,
    enemies: enemies,
    bosses: bosses,
    achievements: achievements,
    tabProgress: tabProgress,
    totalCount: totalCount,
    litCount: litCount,
    hiddenPendingCount: hiddenPendingCount,
    fragments: save.fragments,
    cores: save.cores,
    seeds: save.seedTokens,
    notice: notice,
    pendingSkin: pendingSkin,
    pendingChar: pendingChar,
    selectTab: selectTab,
    goHome: goHome,
    tapSkin: tapSkin,
    requestSkinBuy: requestSkinBuy,
    confirmSkin: confirmSkin,
    cancelSkin: cancelSkin,
    requestCharBuy: requestCharBuy,
    confirmChar: confirmChar,
    cancelChar: cancelChar,
    fixRelic: fixRelic,
  }
}
