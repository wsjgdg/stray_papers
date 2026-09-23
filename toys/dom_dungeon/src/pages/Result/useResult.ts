import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  CHARACTER_COMBAT,
  DEMO_RUN,
  DUNGEON_CHARACTERS,
  DUNGEON_RUN_FLOORS,
  RELIC_SCHOOL_LABEL,
  findCharacter,
  getActiveBondDefs,
  getCharacterStatEntries,
  getDailyDateKey,
  getDailySeed,
  getRandomSeed,
  getRelicSchoolCounts,
  encodeBuildCode,
  resolveRunRelics,
  type CharacterId,
  type RelicSchool,
} from "@/lib/dungeonData"
import {
  bondScoreOf,
  buildScoreAdvice,
  buildScoreDiagnostics,
  computeRunScore,
  fetchDailyLeaderboard,
  getRhPlayerId,
  getRhPlayerName,
  relicRarityBonusOf,
  submitDailyScore,
  type RunScoreResult,
} from "@/lib/dailyScore"
import {
  applyGradeRewards,
  applyRankRewards,
  settleEndgameRewards,
  type SettleItem,
} from "@/lib/economy"
import type { AchievementDef } from "@/lib/achievements"
import {
  getEquippedSkin,
  loadDungeonSave,
  recordDailyBest,
  unlockCharacterDual,
  type DungeonSave,
} from "@/lib/dungeonSave"
import { markLocalBackup, pushCloudSave } from "@/lib/cloudSave"
import {
  buildShareFileName,
  downloadShareImage,
  renderRunShareImage,
} from "@/pages/Result/shareCanvas"

const RANGER_ID: CharacterId = "incognito-ranger"
const COUNT_UP_MS = 900
const SHARE_RESET_MS = 2600
const NOTICE_MS = 3200

const SCHOOL_ORDER: RelicSchool[] = ["script", "style", "network", "cache"]

export type ShareStatus = "idle" | "saved" | "failed"

export function formatRunDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds} 秒`
  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`
}

export function useResult() {
  const navigate = useNavigate()
  const [save, setSave] = useState<DungeonSave>(() => loadDungeonSave())
  const [runRecord] = useState(() => loadDungeonSave().lastRun)
  const [earnedFragments, setEarnedFragments] = useState(0)
  const [copiedSeed, setCopiedSeed] = useState<string | null>(null)
  const [copiedBuild, setCopiedBuild] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle")
  const [notice, setNotice] = useState<string | null>(null)
  /* 本局里程碑收益明细 + 新达成成就（结算发放 / 榜单名次奖励合并进来） */
  const [settleItems, setSettleItems] = useState<SettleItem[]>([])
  const [newAchievements, setNewAchievements] = useState<AchievementDef[]>([])

  const noticeTimer = useRef<number | null>(null)
  const copyTimer = useRef<number | null>(null)
  const buildCopyTimer = useRef<number | null>(null)
  const shareTimer = useRef<number | null>(null)

  const pushNotice = useCallback((text: string) => {
    setNotice(text)
    if (typeof window === "undefined") return
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
      if (buildCopyTimer.current !== null)
        window.clearTimeout(buildCopyTimer.current)
      if (shareTimer.current !== null) window.clearTimeout(shareTimer.current)
    }
  }, [])

  /* 派生：本局战绩 */
  const floorTotal = DUNGEON_RUN_FLOORS.length
  const floor = runRecord?.floor ?? 0
  const cleared = runRecord
    ? (runRecord.cleared ?? runRecord.floor >= floorTotal)
    : false
  const character = findCharacter(runRecord?.characterId)
  /* 跨页统一取色：和首页 / 地牢穿同一套外观（只按角色 id 读一次存档） */
  const skinCharacterId =
    runRecord?.characterId ?? save.lastCharacterId ?? DUNGEON_CHARACTERS[0].id
  const equippedSkin = useMemo(
    () => getEquippedSkin(skinCharacterId),
    [skinCharacterId],
  )
  const characterName =
    runRecord?.characterName ?? character?.displayName ?? "无名标签"
  const roleLabel = character?.roleLabel ?? "未知"
  /* 角色数值统一从 dungeonData 取，和首页卡 / 图鉴卡同源 */
  const characterStats = character ? getCharacterStatEntries(character.id) : []
  const cause = runRecord?.cause ?? "还没打完一局，先回地牢打一场吧。"
  const seed = runRecord?.seed ?? ""
  const kills = runRecord?.kills ?? 0
  const damageDealt = runRecord?.damageDealt ?? 0
  const reward = runRecord?.reward ?? (cleared ? 20 : floor * 2)
  const durationMs = runRecord?.durationMs ?? 0
  const durationLabel = durationMs > 0 ? formatRunDuration(durationMs) : "—"

  const relics = useMemo(() => resolveRunRelics(runRecord), [runRecord])
  /* 构筑码（build-code.md 三）：本局存了词条列表才可分享；旧战绩没存就不出按钮 */
  const buildCode = useMemo(() => {
    if (!runRecord || !runRecord.relicIds || runRecord.relicIds.length === 0)
      return null
    return encodeBuildCode(runRecord.characterId, runRecord.relicIds)
  }, [runRecord])
  const schoolCounts = useMemo(() => getRelicSchoolCounts(relics), [relics])
  /* v4：结算页展示点亮的流派 combo（集齐集合内全部词条，跨域可顶替 1 件） */
  const bonds = useMemo(() => getActiveBondDefs(relics), [relics])
  const schoolSummary = useMemo(
    () =>
      SCHOOL_ORDER.map((school) => ({
        school,
        label: RELIC_SCHOOL_LABEL[school],
        count: schoolCounts[school],
      })),
    [schoolCounts],
  )

  /* 一次性结算发放：每日首胜 / 每日挑战 / 首次 Boss 核心 / 通关种子 / 成就。
     内部用 lastSettledAt 幂等（刷新 / StrictMode 双调用都不会重发），
     本机战绩统计也已并进去（不再单独 recordRunTally）。 */
  const settleOnceRef = useRef(false)
  useEffect(() => {
    if (settleOnceRef.current) return
    settleOnceRef.current = true
    if (!runRecord) return
    if (runRecord.seed === DEMO_RUN.seed) return
    const result = settleEndgameRewards(runRecord, getDailyDateKey())
    if (!result) return
    setSave(result.save)
    setSettleItems(result.items)
    setNewAchievements(result.achievements)
  }, [runRecord])

  /* 综合评分 v3（《Build 评分公式》六维）：每一局都算，结算页都展示；
     等级加成奖励普通模式与每日挑战都发（applyGradeRewards 里按局幂等） */
  const runScore: RunScoreResult | null = useMemo(() => {
    if (!runRecord) return null
    return computeRunScore({
      floor,
      maxHp: runRecord.maxHp ?? CHARACTER_COMBAT[runRecord.characterId]?.maxHp ?? 80,
      hpLeft: runRecord.hpLeft ?? 0,
      memoryRatio: runRecord.memoryEff?.ratio ?? 0,
      memoryOutages: runRecord.memoryOutages ?? 0,
      memoryCrashes: runRecord.memoryCrashes ?? 0,
      relicCount: relics.length,
      relicRarityBonus: relicRarityBonusOf(relics),
      bondScore: bondScoreOf(bonds, schoolCounts),
      cleared,
      durationMs,
    })
  }, [
    bonds,
    cleared,
    durationMs,
    floor,
    relics,
    runRecord,
    schoolCounts,
  ])

  /* Build 诊断（结算页：绿勾 / 黄警告逐条 + 一句总建议） */
  const scoreDiagnosis = useMemo(
    () =>
      runScore
        ? buildScoreDiagnostics(runScore, {
            floor,
            cleared,
            relicCount: relics.length,
            durationMs,
          })
        : null,
    [cleared, durationMs, floor, relics.length, runScore],
  )
  const scoreAdvice = scoreDiagnosis ? buildScoreAdvice(scoreDiagnosis) : null

  /* 评分等级加成：SSS~C 一次性发碎片/核心/种子，每局只发一次（示例战绩不发） */
  const gradeRewardedRef = useRef(false)
  useEffect(() => {
    if (gradeRewardedRef.current) return
    if (!runRecord || !runScore) return
    if (runRecord.seed === DEMO_RUN.seed) return
    gradeRewardedRef.current = true
    const graded = applyGradeRewards(
      runScore.grade,
      `${runRecord.seed}:${runRecord.endedAt}`,
    )
    if (!graded) return
    setSave(graded.save)
    setSettleItems((prev) => [...prev, ...graded.items])
  }, [runRecord, runScore])

  /* 今日挑战：本局是不是当天固定种子那一局 */
  const dailyReport = useMemo(() => {
    if (!runRecord || runRecord.seed !== getDailySeed()) return null
    return {
      dateKey: getDailyDateKey(),
      seed: runRecord.seed,
      floor,
      cleared,
      durationMs,
      hpLeft: runRecord.hpLeft ?? 0,
      /* build_score 列存 Build 维度（词条 + 羁绊两维平均，0~100），综合分单独一列 */
      buildScore: runScore
        ? Math.round((runScore.parts.relic.raw + runScore.parts.bond.raw) / 2)
        : 0,
      totalScore: runScore?.total ?? 0,
      character: runRecord.characterId,
    }
  }, [cleared, durationMs, floor, runRecord, runScore])

  /* 今日挑战结算：本地记一份最好成绩；已登录再顺手把成绩报上排行榜。
     上报成功后查一次当日榜算出自己的名次：名次奖励写成信放进奖励信箱
     （结算明细里标「已放入奖励信箱」，首页领取），成就照常即时入账；
     上报失败只给一句轻提示，查榜失败静默，绝不打断结算。 */
  const dailyReported = useRef(false)
  useEffect(() => {
    if (!dailyReport || dailyReported.current) return
    dailyReported.current = true
    recordDailyBest({ ...dailyReport, at: new Date().toISOString() })
    const playerId = getRhPlayerId()
    if (!playerId) return
    submitDailyScore({
      ...dailyReport,
      playerId,
      playerName: getRhPlayerName(),
      /* 幽灵对照：把自己的逐层轨迹一起报上去，榜上的人才有幽灵可看 */
      path: runRecord?.path,
    })
      .then(async (result) => {
        if (!result.ok) {
          pushNotice(result.message)
          return
        }
        try {
          /* 榜单本身已按 compareDailyScores 排好，行号 +1 即名次 */
          const rows = await fetchDailyLeaderboard(
            dailyReport.dateKey,
            dailyReport.seed,
          )
          const rowIndex = rows.findIndex((row) => row.player_id === playerId)
          if (rowIndex < 0) return
          const ranked = applyRankRewards(rowIndex + 1, dailyReport.dateKey)
          if (!ranked) return
          setSave(ranked.save)
          setSettleItems((prev) => [...prev, ...ranked.items])
          setNewAchievements((prev) => [...prev, ...ranked.achievements])
          if (ranked.items.some((item) => item.mail)) {
            pushNotice(`今日第 ${rowIndex + 1} 名，奖励已放进奖励信箱`)
          }
        } catch {
          /* 查榜失败：静默跳过，不影响这局结算 */
        }
      })
      .catch(() => {
        pushNotice("成绩暂时没能上榜，不影响这局结算")
      })
  }, [dailyReport, pushNotice, runRecord])

  /* 结算时静默备份一次云存档：已登录 + 自动备份开着才做。
     失败只吞掉，不弹提示、不打断结算。 */
  const cloudBackupDone = useRef(false)
  useEffect(() => {
    if (cloudBackupDone.current) return
    cloudBackupDone.current = true
    const current = loadDungeonSave()
    if (!current.settings.autoBackup) return
    if (!getRhPlayerId()) return
    pushCloudSave(current)
      .then(() => {
        markLocalBackup(loadDungeonSave())
      })
      .catch(() => undefined)
  }, [])

  /* 碎片滚动动画：0 → 本局碎片，进度条跟着一起推进 */
  useEffect(() => {
    if (reward <= 0) {
      setEarnedFragments(0)
      return
    }
    if (typeof window === "undefined") {
      setEarnedFragments(reward)
      return
    }
    let raf = 0
    const startedAt = performance.now()
    const step = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / COUNT_UP_MS)
      const eased = 1 - Math.pow(1 - progress, 3)
      setEarnedFragments(Math.round(eased * reward))
      if (progress < 1) raf = window.requestAnimationFrame(step)
    }
    raf = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(raf)
  }, [reward])

  /* 派生：碎片与解锁（价格跟着角色数据走，现在隐藏角色是 500 碎片） */
  const ranger = findCharacter(RANGER_ID)
  const unlockCost = ranger?.fragmentCost ?? 0
  const rangerName = ranger?.displayName ?? "无痕游侠"
  const rangerUnlocked = save.unlockedCharacters.includes(RANGER_ID)
  const fragmentsNeeded = Math.max(0, unlockCost - save.fragments)
  const canUnlock = !rangerUnlocked && fragmentsNeeded === 0
  const fragmentsBefore = Math.max(0, save.fragments - reward)
  const animatedTotal = Math.min(save.fragments, fragmentsBefore + earnedFragments)
  const progressRatio = unlockCost > 0 ? Math.min(1, animatedTotal / unlockCost) : 1

  /* 操作 */
  const copySeed = useCallback(async () => {
    if (!seed) return
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(seed)
        setCopiedSeed(seed)
        if (typeof window !== "undefined") {
          if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
          copyTimer.current = window.setTimeout(() => setCopiedSeed(null), SHARE_RESET_MS)
        }
        pushNotice(`种子码 ${seed} 已复制`)
        return
      }
      throw new Error("clipboard unavailable")
    } catch {
      setCopiedSeed(null)
      pushNotice("复制没成功，长按种子码手动选中即可")
    }
  }, [pushNotice, seed])

  /* 复制构筑码（build-code.md 三）：好友贴进地牢入口即可带着这身构筑开局 */
  const copyBuild = useCallback(async () => {
    if (!buildCode) return
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(buildCode)
        setCopiedBuild(buildCode)
        if (typeof window !== "undefined") {
          if (buildCopyTimer.current !== null)
            window.clearTimeout(buildCopyTimer.current)
          buildCopyTimer.current = window.setTimeout(
            () => setCopiedBuild(null),
            SHARE_RESET_MS,
          )
        }
        pushNotice(`构筑码 ${buildCode} 已复制，发给好友让他带伤开局`)
        return
      }
      throw new Error("clipboard unavailable")
    } catch {
      setCopiedBuild(null)
      pushNotice("复制没成功，长按构筑码手动选中即可")
    }
  }, [buildCode, pushNotice])

  /* 解锁走双路线购买入口：自动按角色数据扣碎片、写解锁名单 */
  const unlockRanger = useCallback(() => {
    const result = unlockCharacterDual(RANGER_ID, "fragments")
    setSave(result.save)
    pushNotice(result.ok ? `${rangerName}已解锁，回首页就能选他上场` : result.message)
  }, [pushNotice, rangerName])

  const startNewRun = useCallback(() => {
    const characterId =
      runRecord?.characterId ?? save.lastCharacterId ?? DUNGEON_CHARACTERS[0].id
    const params = new URLSearchParams({
      char: characterId,
      seed: getRandomSeed(),
    })
    navigate(`/dungeon?${params.toString()}`)
  }, [navigate, runRecord, save.lastCharacterId])

  const goHome = useCallback(() => {
    navigate("/")
  }, [navigate])

  const saveShareImage = useCallback(() => {
    const dataUrl = renderRunShareImage({
      characterName,
      roleLabel,
      cleared,
      floor,
      floorTotal,
      cause,
      kills,
      damageDealt,
      reward,
      seed,
      durationLabel,
      bestFloor: save.bestFloor,
      relics: relics.map((relic) => ({ name: relic.name, school: relic.school })),
      bonds: bonds.map((bond) => ({ name: bond.name, desc: bond.desc })),
    })

    if (!dataUrl) {
      setShareStatus("failed")
      pushNotice("分享图没画出来，再点一次试试")
      return
    }

    downloadShareImage(dataUrl, buildShareFileName(seed))
    setShareStatus("saved")
    pushNotice("分享图已保存，去下载目录看看")
    if (typeof window !== "undefined") {
      if (shareTimer.current !== null) window.clearTimeout(shareTimer.current)
      shareTimer.current = window.setTimeout(
        () => setShareStatus("idle"),
        SHARE_RESET_MS,
      )
    }
  }, [
    save.bestFloor,
    bonds,
    cause,
    characterName,
    cleared,
    damageDealt,
    durationLabel,
    floor,
    floorTotal,
    kills,
    pushNotice,
    relics,
    reward,
    roleLabel,
    seed,
  ])

  return {
    /* 战绩 */
    hasRun: Boolean(runRecord),
    characterName,
    roleLabel,
    characterStats,
    skinStyle: equippedSkin.style,
    skinName: equippedSkin.displayName,
    cleared,
    floor,
    floorTotal,
    cause,
    seed,
    kills,
    damageDealt,
    reward,
    durationLabel,
    bestFloor: save.bestFloor,
    /* v2 内存效率：旧存档可能没有，组件按可选处理 */
    memoryEff: runRecord?.memoryEff,
    memoryGained: runRecord?.memoryGained,
    memorySpent: runRecord?.memorySpent,
    /* 深化包：碎片峰值 / 整理 / 超频战绩（旧存档没有 → 整行不显） */
    maxFrags: runRecord?.maxFrags,
    defrags: runRecord?.defrags,
    overclocks: runRecord?.overclocks,
    /* 本局故事（fun-pack.md 四）：旧存档没有 → RunStoryPanel 不渲染 */
    story: runRecord?.story,
    /* 综合评分 v3：每一局都有，结算页据此展开六维明细 + 诊断 */
    runScore,
    scoreDiagnosis,
    scoreAdvice,
    relics,
    bonds,
    schoolSummary,
    earnedFragments,

    /* 货币与结算发放 */
    fragments: save.fragments,
    cores: save.cores,
    seeds: save.seedTokens,
    settleItems,
    newAchievements,
    lowSpec: save.settings.lowSpec,

    /* 碎片与解锁 */
    animatedTotal,
    progressRatio,
    unlockCost,
    rangerName,
    rangerUnlocked,
    fragmentsNeeded,
    canUnlock,

    /* 交互状态 */
    copiedSeed,
    copiedBuild,
    buildCode,
    shareStatus,
    notice,

    /* 操作 */
    copySeed,
    copyBuild,
    unlockRanger,
    saveShareImage,
    startNewRun,
    goHome,
  }
}
