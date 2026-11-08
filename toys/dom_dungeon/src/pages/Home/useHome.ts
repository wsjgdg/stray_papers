import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { parseSeedCode } from "@/lib/rng"

import {
  CHARACTER_COMBAT,
  DUNGEON_CHARACTERS,
  characterClearsRemaining,
  findCharacter,
  getActiveBondDefs,
  getDailyDateKey,
  getDailySeed,
  getDailyShortCode,
  getRandomSeed,
  getRelicSchoolCounts,
  isCharacterVisible,
  parseBuildCode,
  findRelic,
  resolveRunRelics,
  resolveSkin,
  type CharacterId,
  type CharacterSkin,
  type DungeonCharacter,
} from "@/lib/dungeonData"
import {
  bondScoreOf,
  computeRunScore,
  relicRarityBonusOf,
} from "@/lib/dailyScore"
import {
  claimMailItem,
  countUnclaimedMail,
  loadDungeonSave,
  unlockCharacterDual,
  writeDungeonSave,
  type DungeonSave,
  type DungeonSettings,
} from "@/lib/dungeonSave"

export type RosterEntry = {
  character: DungeonCharacter
  visible: boolean
  clearsRemaining: number
}

/** 种子码校验失败时的统一提示（seed-system.md 九） */
const SEED_FORMAT_ERROR = "种子码格式错误，请输入 8 位十六进制。例：A7F2-3C9D"
/** 构筑码校验失败时的统一提示（build-code.md 一） */
const BUILD_FORMAT_ERROR = "构筑码格式错误，应以 B 开头。例：B-C-S1K4P9"

export function useHome() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [save, setSave] = useState<DungeonSave>(() => loadDungeonSave())
  const [activeIndex, setActiveIndex] = useState(() => {
    const remembered = loadDungeonSave().lastCharacterId
    const found = DUNGEON_CHARACTERS.findIndex((item) => item.id === remembered)
    return found >= 0 ? found : 0
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [runDetailOpen, setRunDetailOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [entryReady, setEntryReady] = useState(false)
  const [entryCharacterId, setEntryCharacterId] = useState<CharacterId | null>(null)
  const [entrySeed, setEntrySeed] = useState("")
  const [entryDaily, setEntryDaily] = useState(false)
  const [copiedSeed, setCopiedSeed] = useState<string | null>(null)
  const [recordBanner, setRecordBanner] = useState<string | null>(null)
  /** 入口面板里手输种子码的校验错误（null = 合法或未输入） */
  const [entrySeedError, setEntrySeedError] = useState<string | null>(null)
  /** 入口面板的构筑码（build-code.md 二）：可选，随输随校验 */
  const [entryBuild, setEntryBuild] = useState("")
  const [entryBuildError, setEntryBuildError] = useState<string | null>(null)
  /** 好友分享链接带来的种子码（?seed=XXXX-XXXX），只预填不自动开局 */
  const [friendSeed, setFriendSeed] = useState<string | null>(null)

  const noticeTimer = useRef<number | null>(null)
  const recordTimer = useRef<number | null>(null)

  const pushNotice = useCallback((text: string) => {
    setNotice(text)
    if (typeof window === "undefined") return
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3400)
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
      if (recordTimer.current !== null) window.clearTimeout(recordTimer.current)
    }
  }, [])

  /* 从结算回首页：只要今天的最深层数比上次弹横幅时更高，就弹一次「新纪录」（约 2.4s 淡出，同一天同一层数不重复弹） */
  useEffect(() => {
    const today = getDailyDateKey()
    const tally = save.runTally
    const seen = save.recordBannerSeen
    if (
      tally.todayKey === today &&
      tally.todayBestFloor > 0 &&
      tally.todayBestFloor > (seen.dateKey === today ? seen.floor : 0)
    ) {
      setRecordBanner(`🎉 新纪录！今天打到了第 ${tally.todayBestFloor} 层`)
      setSave((prev) =>
        writeDungeonSave({
          ...prev,
          recordBannerSeen: { dateKey: today, floor: tally.todayBestFloor },
        }),
      )
      recordTimer.current = window.setTimeout(
        () => setRecordBanner(null),
        2400,
      )
    }
    // 只在进场瞬间判定一次，横幅弹不弹由存档里的 seen 决定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patchSave = useCallback((patch: Partial<DungeonSave>) => {
    setSave((prev) => writeDungeonSave({ ...prev, ...patch }))
  }, [])

  /* 分享链接进来：认种子码就挂横幅邀请挑战，坏值直接忽略（不打扰） */
  useEffect(() => {
    const parsed = parseSeedCode(searchParams.get("seed") ?? "")
    if (parsed) setFriendSeed(parsed)
    // 只在进场瞬间读一次，之后用户关掉横幅就不再弹回
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 累计通关数决定隐藏角色是否露面（业务全部在 Logic 算，View 只消费派生字段） */
  const totalClears = save.runTally.cleared

  const roster = useMemo<RosterEntry[]>(
    () =>
      DUNGEON_CHARACTERS.map((character) => ({
        character,
        visible: isCharacterVisible(character, totalClears),
        clearsRemaining: characterClearsRemaining(character, totalClears),
      })),
    [totalClears],
  )

  /* 选中位永远落在已露面角色上；隐藏角色不参与高亮 */
  const activeCharacter = useMemo(() => {
    const base = DUNGEON_CHARACTERS[activeIndex] ?? DUNGEON_CHARACTERS[0]
    if (isCharacterVisible(base, totalClears)) return base
    return (
      DUNGEON_CHARACTERS.find((item) => isCharacterVisible(item, totalClears)) ??
      base
    )
  }, [activeIndex, totalClears])

  const isUnlocked = useCallback(
    (id: CharacterId) => save.unlockedCharacters.includes(id),
    [save.unlockedCharacters],
  )

  const fragmentsNeeded = useCallback(
    (character: DungeonCharacter) =>
      Math.max(character.fragmentCost - save.fragments, 0),
    [save.fragments],
  )

  const coresNeeded = useCallback(
    (character: DungeonCharacter) =>
      Math.max(character.coreCost - save.cores, 0),
    [save.cores],
  )

  /* 跨页统一取色：读存档 + 回退默认那套，和图鉴 / 地牢 / 结算保持同一套外观 */
  const skinFor = useCallback(
    (id: CharacterId): CharacterSkin => resolveSkin(id, save.equippedSkins[id]),
    [save.equippedSkins],
  )

  /* 双路线购买：碎片或核心任选，内部已校验通关数，成功即回写最新存档 */
  const purchaseCharacter = useCallback(
    (id: CharacterId, currency: "fragments" | "cores") => {
      const result = unlockCharacterDual(id, currency)
      setSave(result.save)
      pushNotice(result.message)
    },
    [pushNotice],
  )

  const startRun = useCallback(
    (characterId: CharacterId, options?: { daily?: boolean; seed?: string }) => {
      const character = findCharacter(characterId)
      if (!character) return
      if (!isCharacterVisible(character, save.runTally.cleared)) {
        const remaining = characterClearsRemaining(
          character,
          save.runTally.cleared,
        )
        pushNotice(`这个角色还没现身，再去通关 ${remaining} 次就会露面`)
        return
      }
      if (!save.unlockedCharacters.includes(characterId)) {
        const need = Math.max(character.fragmentCost - save.fragments, 0)
        pushNotice(
          character.coreCost > 0
            ? `${character.displayName}还没解锁，可用 ${character.fragmentCost} 碎片或 ${character.coreCost} 核心买断，也可去图鉴购买`
            : `${character.displayName}还没解锁，还需 ${need} 个碎片；图鉴与每日挑战都能赚碎片`,
        )
        return
      }
      const daily = Boolean(options?.daily)
      /* 每日挑战锁死今日种子；普通局允许带着好友种子进 */
      const seed = daily
        ? getDailySeed()
        : (parseSeedCode(options?.seed ?? "") ?? getRandomSeed())
      setEntryCharacterId(characterId)
      setEntrySeed(seed)
      setEntryDaily(daily)
      setEntrySeedError(null)
      setEntryReady(true)
      patchSave({ lastCharacterId: characterId, hintSeen: true })
      pushNotice(
        daily
          ? "今日挑战已就绪 · 用今日种子从第 1 层开始"
          : "地牢入口已就绪 · 点「进入地牢」开打",
      )
    },
    [
      patchSave,
      pushNotice,
      save.fragments,
      save.runTally.cleared,
      save.unlockedCharacters,
    ],
  )

  /* 今日挑战已经有独立一页（种子 / 最好成绩 / 排行榜），首页只负责跳过去 */
  const startDailyChallenge = useCallback(() => {
    navigate("/daily")
  }, [navigate])

  /* Boss Rush：零摩擦无尽连战，进去直接开打 */
  const openBossRush = useCallback(() => {
    navigate("/boss-rush")
  }, [navigate])

  const confirmActiveCharacter = useCallback(() => {
    startRun(activeCharacter.id)
  }, [activeCharacter.id, startRun])

  const moveActive = useCallback(
    (delta: number) => {
      setActiveIndex((prev) => {
        const visibleIndices: number[] = []
        DUNGEON_CHARACTERS.forEach((item, index) => {
          if (isCharacterVisible(item, totalClears)) visibleIndices.push(index)
        })
        if (visibleIndices.length === 0) return prev
        const current = visibleIndices.indexOf(prev)
        if (current >= 0) {
          const next =
            (current + delta + visibleIndices.length) % visibleIndices.length
          return visibleIndices[next]
        }
        /* 当前位置是隐藏角色：向前找第一个已露面角色 */
        const forward =
          visibleIndices.find((index) => index > prev) ?? visibleIndices[0]
        return forward
      })
    },
    [totalClears],
  )

  const highlightCharacter = useCallback(
    (id: CharacterId) => {
      const found = DUNGEON_CHARACTERS.findIndex((item) => item.id === id)
      if (found < 0) return
      if (!isCharacterVisible(DUNGEON_CHARACTERS[found], totalClears)) return
      setActiveIndex(found)
    },
    [totalClears],
  )

  /* 入口面板手输种子：随输随校验，非法只显示提示、不吞输入 */
  const changeEntrySeed = useCallback((text: string) => {
    if (entryDaily) return
    const cleaned = text.toUpperCase().slice(0, 9)
    setEntrySeed(cleaned)
    setEntrySeedError(
      parseSeedCode(cleaned) === null
        ? SEED_FORMAT_ERROR
        : null,
    )
  }, [entryDaily])

  /* 入口面板手输构筑码：随输随校验，非法只提示、不吞输入（build-code.md 二） */
  const changeEntryBuild = useCallback(
    (text: string) => {
      if (entryDaily) return
      const cleaned = text.toUpperCase().replace(/\s+/g, "").slice(0, 16)
      setEntryBuild(cleaned)
      if (!cleaned) {
        setEntryBuildError(null)
        return
      }
      setEntryBuildError(
        parseBuildCode(cleaned) === null ? BUILD_FORMAT_ERROR : null,
      )
    },
    [entryDaily],
  )

  /** 构筑码合法时的「会带走什么」预览（进局前就看清，不玩盲盒） */
  const buildPreview = useMemo(() => {
    if (!entryBuild) return null
    const parsed = parseBuildCode(entryBuild)
    if (!parsed) return null
    const names = parsed.relicIds
      .map((id) => findRelic(id)?.name)
      .filter(Boolean)
      .join(" / ")
    return `${findCharacter(parsed.characterId)?.displayName ?? "分享角色"} · 开局带走：${names}`
  }, [entryBuild])

  const startWithFriendSeed = useCallback(() => {
    if (!friendSeed) return
    startRun(activeCharacter.id, { seed: friendSeed })
    setFriendSeed(null)
    pushNotice(`已带上好友种子 ${friendSeed}`)
  }, [activeCharacter.id, friendSeed, pushNotice, startRun])

  const dismissFriendSeed = useCallback(() => {
    setFriendSeed(null)
  }, [])

  const enterDungeon = useCallback(() => {
    if (!entryCharacterId) return
    const selected = findCharacter(entryCharacterId)
    let charId: CharacterId = entryCharacterId
    const stillUsable =
      selected &&
      isCharacterVisible(selected, save.runTally.cleared) &&
      save.unlockedCharacters.includes(entryCharacterId)
    if (!stillUsable) {
      const fallback = DUNGEON_CHARACTERS.find(
        (item) =>
          isCharacterVisible(item, save.runTally.cleared) &&
          save.unlockedCharacters.includes(item.id),
      )
      if (!fallback) {
        pushNotice("当前角色已不可用，先去图鉴解锁一个能上场的角色")
        setEntryReady(false)
        return
      }
      pushNotice(
        `${selected?.displayName ?? "该角色"}已不可用，已切换为${fallback.displayName}`,
      )
      charId = fallback.id
    }
    /* 普通局临出发再校验一次种子码（手输可能还没触发校验） */
    let seedToUse = entrySeed
    if (!entryDaily) {
      const parsed = parseSeedCode(entrySeed)
      if (!parsed) {
        setEntrySeedError(SEED_FORMAT_ERROR)
        pushNotice(SEED_FORMAT_ERROR)
        return
      }
      seedToUse = parsed
    }
    /* 构筑码随局带上（build-code.md 二）：分享角色临时上场，隐藏角色不随码现身 */
    let buildToUse: string | null = null
    if (!entryDaily && entryBuild) {
      const parsedBuild = parseBuildCode(entryBuild)
      if (!parsedBuild) {
        setEntryBuildError(BUILD_FORMAT_ERROR)
        pushNotice(BUILD_FORMAT_ERROR)
        return
      }
      const shared = findCharacter(parsedBuild.characterId)
      if (shared && !isCharacterVisible(shared, save.runTally.cleared)) {
        pushNotice(`${shared.displayName} 还没现身，构筑照常带上、角色用你自己的`)
      } else if (shared && shared.id !== charId) {
        charId = shared.id
        pushNotice(`带着分享角色 ${shared.displayName} 出发`)
      }
      buildToUse = entryBuild
    }
    const params = new URLSearchParams({
      char: charId,
      seed: seedToUse,
    })
    if (entryDaily) params.set("daily", "1")
    if (buildToUse) params.set("build", buildToUse)
    navigate(`/dungeon?${params.toString()}`)
  }, [
    entryBuild,
    entryCharacterId,
    entryDaily,
    entrySeed,
    navigate,
    pushNotice,
    save.runTally.cleared,
    save.unlockedCharacters,
  ])

  const leaveEntry = useCallback(() => {
    setEntryReady(false)
    setEntryCharacterId(null)
    setEntrySeed("")
    setEntryDaily(false)
    setEntrySeedError(null)
    setEntryBuild("")
    setEntryBuildError(null)
    pushNotice("已回到选人界面")
  }, [pushNotice])

  const toggleSetting = useCallback(
    (key: keyof DungeonSettings) => {
      const next: DungeonSettings = {
        ...save.settings,
        [key]: !save.settings[key],
      }
      patchSave({ settings: next })
      pushNotice(
        key === "sound"
          ? next.sound
            ? "音效已打开"
            : "音效已关闭"
          : next.lowSpec
            ? "低配模式已打开，动效会收敛"
            : "低配模式已关闭",
      )
    },
    [patchSave, pushNotice, save.settings],
  )

  const copySeed = useCallback(
    async (seed: string) => {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(seed)
          setCopiedSeed(seed)
          pushNotice(`种子码 ${seed} 已复制`)
          return
        }
        throw new Error("clipboard unavailable")
      } catch {
        setCopiedSeed(null)
        pushNotice("复制没成功，长按种子码手动选中即可")
      }
    },
    [pushNotice],
  )

  const openCodex = useCallback(() => {
    navigate("/codex")
  }, [navigate])

  /* 奖励信箱：领一封 → 三种货币直接入账（claimMailItem 内部已写档） */
  const claimMail = useCallback(
    (id: string) => {
      const { save: next, claimed, mail } = claimMailItem(id)
      setSave(next)
      if (!claimed || !mail) return
      const parts = [
        mail.fragments > 0 ? `${mail.fragments} 💰` : "",
        mail.cores > 0 ? `${mail.cores} 🔷` : "",
        mail.seeds > 0 ? `${mail.seeds} 🌱` : "",
      ].filter(Boolean)
      pushNotice(
        parts.length > 0
          ? `已领取：${parts.join(" + ")}`
          : "已领取，感谢参与今天的挑战",
      )
    },
    [pushNotice],
  )

  /* 设置已经独立成一页，首页只负责跳过去 */
  const openSettings = useCallback(() => {
    navigate("/settings")
  }, [navigate])

  /* 性能与体验包（perf-experience-pack.md B1）：挂载后空闲预取战斗分包——
     用户点进地牢时分包已在缓存里，跳转零等待。模块路径解析到与 App.tsx
     lazy 导入相同的 chunk；预取失败静默（加载失败由 Suspense/lazy 自己兜底）。 */
  useEffect(() => {
    const prefetch = () => {
      void import("@/pages/Dungeon/index.tsx").catch(() => {})
    }
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number },
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }
    let idleId = 0
    let timerId = 0
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleId = idleWindow.requestIdleCallback(() => prefetch(), { timeout: 3000 })
    } else {
      timerId = window.setTimeout(prefetch, 1500)
    }
    return () => {
      if (idleId > 0) idleWindow.cancelIdleCallback?.(idleId)
      if (timerId > 0) window.clearTimeout(timerId)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true

      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        if (typing) return
        ev.preventDefault()
        moveActive(ev.key === "ArrowRight" ? 1 : -1)
        return
      }

      if (ev.key === "Enter") {
        if (typing || settingsOpen || runDetailOpen) return
        const tag = target?.tagName
        if (tag === "BUTTON" || tag === "A") return
        ev.preventDefault()
        startRun(activeCharacter.id)
        return
      }

      if (ev.key === "Escape") {
        if (settingsOpen) {
          setSettingsOpen(false)
          return
        }
        if (runDetailOpen) {
          setRunDetailOpen(false)
          return
        }
        if (helpOpen) {
          setHelpOpen(false)
          return
        }
        if (entryReady) setEntryReady(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    activeCharacter.id,
    entryReady,
    moveActive,
    runDetailOpen,
    settingsOpen,
    helpOpen,
    startRun,
  ])

  const dailySeed = useMemo(() => getDailySeed(), [])
  const dailyShortCode = useMemo(() => getDailyShortCode(), [])

  /* 首页底部：今日最佳层数 + 累计通关率，都只算本机战绩 */
  const dailyDateKey = useMemo(() => getDailyDateKey(), [])
  const todayStats = useMemo(() => {
    const tally = save.runTally
    const playedToday = tally.todayKey === dailyDateKey
    return {
      playedToday,
      todayBestFloor: playedToday ? tally.todayBestFloor : 0,
      total: tally.total,
      cleared: tally.cleared,
      clearRate:
        tally.total > 0
          ? Math.round((tally.cleared / tally.total) * 100)
          : null,
    }
  }, [dailyDateKey, save.runTally])

  const lastRun = save.lastRun
  const dailyCleared = Boolean(
    lastRun && lastRun.seed === dailySeed && lastRun.floor >= 8,
  )
  const entryCharacter = findCharacter(entryCharacterId)

  /* 历史战绩：最近 20 局逐局按同一套评分公式回算（历史面板 + 评分趋势用） */
  const recentRuns = useMemo(
    () =>
      save.runHistory.map((record) => {
        const relics = resolveRunRelics(record)
        const score = computeRunScore({
          floor: record.floor,
          maxHp:
            record.maxHp ?? CHARACTER_COMBAT[record.characterId]?.maxHp ?? 80,
          hpLeft: record.hpLeft ?? 0,
          memoryRatio: record.memoryEff?.ratio ?? 0,
          memoryOutages: record.memoryOutages ?? 0,
          memoryCrashes: record.memoryCrashes ?? 0,
          relicCount: relics.length,
          relicRarityBonus: relicRarityBonusOf(relics),
          bondScore: bondScoreOf(
            getActiveBondDefs(relics),
            getRelicSchoolCounts(relics),
          ),
          cleared: record.cleared ?? record.floor >= 8,
          durationMs: record.durationMs ?? 0,
        })
        return { record, score }
      }),
    [save.runHistory],
  )

  return {
    recentRuns,
    characters: DUNGEON_CHARACTERS,
    roster,
    totalClears,
    activeIndex,
    activeCharacter,
    fragments: save.fragments,
    cores: save.cores,
    seeds: save.seedTokens,
    /* 奖励信箱：名次奖励信 + 一键领取 */
    mailItems: save.mailItems,
    mailUnclaimed: countUnclaimedMail(save),
    titlesTaken: save.titlesTaken,
    claimMail,
    unlockedCharacters: save.unlockedCharacters,
    isUnlocked,
    fragmentsNeeded,
    coresNeeded,
    purchaseCharacter,
    skinFor,
    settings: save.settings,
    hintSeen: save.hintSeen,
    dailySeed,
    dailyShortCode,
    dailyCleared,
    todayStats,
    devMode: save.runTally.devMode,
    lastRun,
    notice,
    recordBanner,
    copiedSeed,
    entryReady,
    entryCharacter,
    entrySeed,
    entrySeedError,
    /* 构筑码（build-code.md 二）：入口面板可选输入 + 合法预览 */
    entryBuild,
    entryBuildError,
    buildPreview,
    changeEntryBuild,
    entryDaily,
    friendSeed,
    changeEntrySeed,
    startWithFriendSeed,
    dismissFriendSeed,
    settingsOpen,
    runDetailOpen,
    setSettingsOpen,
    setRunDetailOpen,
    helpOpen,
    setHelpOpen,
    highlightCharacter,
    confirmActiveCharacter,
    startRun,
    startDailyChallenge,
    openBossRush,
    rushCoins: save.rushCoins ?? 0,
    rushBestWave: save.rushBest?.wave ?? 0,
    enterDungeon,
    leaveEntry,
    toggleSetting,
    copySeed,
    openCodex,
    openSettings,
  }
}
