import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  CloudSaveError,
  applyCloudSave,
  compareSaveFreshness,
  fetchCloudSave,
  formatBackupTime,
  markLocalBackup,
  pushCloudSave,
  type CloudSaveRow,
} from "@/lib/cloudSave"
import {
  clearDungeonSave,
  loadDungeonSave,
  writeDungeonSave,
  type DungeonSave,
  type DungeonSettings,
  type PlayMode,
} from "@/lib/dungeonSave"
import type { RhAccountInfo } from "@/lib/platform"
import { playSfx } from "@/lib/sfx"
import { applyUiTheme } from "@/lib/uiTheme"
import { APP_VERSION } from "@/lib/appMeta"

export { APP_VERSION }

/** 清档流程：正常 → 二次确认 → 清完给一次反馈 */
export type ClearStep = "idle" | "confirm" | "done"

/** 云存档当前在忙什么：拉取 / 备份 / 恢复 */
export type CloudBusy = "idle" | "loading" | "backup" | "restore"

/** 恢复流程：正常 → 二次确认 */
export type RestoreStep = "idle" | "confirm"

/** 冲突提示条要展示的云端那份摘要 */
export type CloudConflict = {
  fragments: number
  bestFloor: number
}

export function useSettings() {
  const navigate = useNavigate()
  const [save, setSave] = useState<DungeonSave>(() => loadDungeonSave())
  const [clearStep, setClearStep] = useState<ClearStep>("idle")
  const [notice, setNotice] = useState<string | null>(null)
  const [account, setAccount] = useState<RhAccountInfo | null>(null)
  const [accountReady, setAccountReady] = useState(false)

  const [cloudRow, setCloudRow] = useState<CloudSaveRow | null>(null)
  const [cloudBusy, setCloudBusy] = useState<CloudBusy>("idle")
  const [restoreStep, setRestoreStep] = useState<RestoreStep>("idle")
  const [conflict, setConflict] = useState<CloudConflict | null>(null)
  const [conflictHidden, setConflictHidden] = useState(false)

  const noticeTimer = useRef<number | null>(null)
  const clearTimer = useRef<number | null>(null)

  const pushNotice = useCallback((text: string) => {
    setNotice(text)
    if (typeof window === "undefined") return
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3200)
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current)
    }
  }, [])

  const syncAccount = useCallback((info: RhAccountInfo | null) => {
    setAccount(info)
    setAccountReady(true)
  }, [])

  /* 登录态一变就拉一次云端那份进度，顺便判定要不要出冲突提示条 */
  const accountId = account?.userId ?? ""
  useEffect(() => {
    if (!accountId) {
      setCloudRow(null)
      setConflict(null)
      setConflictHidden(false)
      setCloudBusy("idle")
      return
    }

    let cancelled = false
    setCloudBusy("loading")
    fetchCloudSave()
      .then((row) => {
        if (cancelled) return
        setCloudRow(row)
        setCloudBusy("idle")
        if (!row) {
          setConflict(null)
          return
        }
        const local = loadDungeonSave()
        const cloudHasProgress = row.best_floor > 0 || row.fragments > 0
        const localEmpty = local.bestFloor === 0
        const cloudNewer = compareSaveFreshness(local, row) === "cloud"
        if (cloudHasProgress && (localEmpty || cloudNewer)) {
          setConflict({ fragments: row.fragments, bestFloor: row.best_floor })
          setConflictHidden(false)
          return
        }
        setConflict(null)
      })
      .catch(() => {
        if (cancelled) return
        setCloudRow(null)
        setCloudBusy("idle")
      })

    return () => {
      cancelled = true
    }
  }, [accountId])

  /** 开关改动立刻落盘；关音效时不放提示音，开音效时放一声确认 */
  const toggleSetting = useCallback(
    (key: keyof DungeonSettings) => {
      const current = loadDungeonSave()
      const nextSettings: DungeonSettings = {
        ...current.settings,
        [key]: !current.settings[key],
      }
      const saved = writeDungeonSave({ ...current, settings: nextSettings })
      setSave(saved)

      if (key === "sound") {
        if (nextSettings.sound) playSfx("pick")
        pushNotice(nextSettings.sound ? "音效已打开" : "音效已关闭")
        return
      }

      if (key === "tips") {
        pushNotice(
          nextSettings.tips
            ? "教程提示已打开，战斗中会在屏幕上方弹操作提醒"
            : "教程提示已关闭，老手模式",
        )
        return
      }

      if (key === "combatFooter") {
        pushNotice(
          nextSettings.combatFooter
            ? "战斗信息条已打开，底部恢复显示日志与统计"
            : "战斗信息条已关闭，界面更干净，随时可以再打开",
        )
        return
      }

      pushNotice(
        nextSettings.lowSpec
          ? "低配模式已打开，多余特效与动画都关掉了"
          : "低配模式已关闭",
      )
    },
    [pushNotice],
  )

  /** 音量滑条：拖动过程中只落盘不提示，松手时放一声试听音当反馈 */
  const setVolume = useCallback((value: number) => {
    const current = loadDungeonSave()
    const nextSettings: DungeonSettings = {
      ...current.settings,
      volume: Math.min(100, Math.max(0, Math.round(value))),
    }
    setSave(writeDungeonSave({ ...current, settings: nextSettings }))
  }, [])

  const previewVolume = useCallback(() => {
    playSfx("pick")
  }, [])

  /** 操作模式：选完立刻落盘，下一局生效 */
  const setPlayMode = useCallback(
    (mode: PlayMode) => {
      const current = loadDungeonSave()
      if (current.settings.playMode === mode) return
      const nextSettings: DungeonSettings = {
        ...current.settings,
        playMode: mode,
      }
      setSave(writeDungeonSave({ ...current, settings: nextSettings }))
      playSfx("pick")
      pushNotice(
        mode === "casual"
          ? "休闲模式已选：特殊互动失败不受罚，下一局生效"
          : mode === "hardcore"
            ? "硬核模式已选：失败惩罚 ×1.5，为老玩家准备，下一局生效"
            : "标准模式已选：平衡体验，下一局生效",
      )
    },
    [pushNotice],
  )

  /** 内存显示形态（ui-pack.md 一）：格子 / 条，选完立刻落盘，下一屏顶栏生效 */
  const setMemoryDisplay = useCallback(
    (mode: DungeonSettings["memoryDisplay"]) => {
      const current = loadDungeonSave()
      if (current.settings.memoryDisplay === mode) return
      const nextSettings: DungeonSettings = {
        ...current.settings,
        memoryDisplay: mode,
      }
      setSave(writeDungeonSave({ ...current, settings: nextSettings }))
      playSfx("pick")
      pushNotice(
        mode === "cells"
          ? "内存改为格子显示：一格一点，花掉一格看得见"
          : "内存改为条显示：数字读数，一眼看余量",
      )
    },
    [pushNotice],
  )

  /** 外观（ui-appearance.md）：改完立刻落盘 + 全站即时换肤（写 <html> data-*） */
  const setTheme = useCallback(
    (theme: DungeonSettings["theme"]) => {
      const current = loadDungeonSave()
      if (current.settings.theme === theme) return
      const nextSettings: DungeonSettings = { ...current.settings, theme }
      setSave(writeDungeonSave({ ...current, settings: nextSettings }))
      applyUiTheme(theme, nextSettings.accent)
      playSfx("pick")
      pushNotice(theme === "light" ? "已切换浅色模式" : "已切换深色模式")
    },
    [pushNotice],
  )

  const setAccent = useCallback(
    (accent: DungeonSettings["accent"]) => {
      const current = loadDungeonSave()
      if (current.settings.accent === accent) return
      const nextSettings: DungeonSettings = { ...current.settings, accent }
      setSave(writeDungeonSave({ ...current, settings: nextSettings }))
      applyUiTheme(nextSettings.theme, accent)
      playSfx("pick")
    },
    [],
  )

  /* ---------------- 云存档 ---------------- */

  /** 自动备份开关：同样立刻写进本地存档 */
  const toggleAutoBackup = useCallback(() => {
    const current = loadDungeonSave()
    const nextSettings: DungeonSettings = {
      ...current.settings,
      autoBackup: !current.settings.autoBackup,
    }
    const saved = writeDungeonSave({ ...current, settings: nextSettings })
    setSave(saved)
    pushNotice(
      nextSettings.autoBackup
        ? "自动备份已打开，每局结束都会存一份到云端"
        : "自动备份已关闭，需要手动点备份",
    )
  }, [pushNotice])

  const backupNow = useCallback(async () => {
    const current = loadDungeonSave()
    setCloudBusy("backup")
    try {
      const row = await pushCloudSave(current)
      setSave(markLocalBackup(current))
      setCloudRow(row)
      setConflict(null)
      setConflictHidden(true)
      pushNotice("进度已备份到云端")
    } catch (err) {
      pushNotice(
        err instanceof CloudSaveError
          ? err.message
          : "备份没成功，本地进度一点没动",
      )
    } finally {
      setCloudBusy("idle")
    }
  }, [pushNotice])

  const requestRestore = useCallback(() => {
    setRestoreStep("confirm")
  }, [])

  const cancelRestore = useCallback(() => {
    setRestoreStep("idle")
  }, [])

  const confirmRestore = useCallback(async () => {
    setRestoreStep("idle")
    setCloudBusy("restore")
    try {
      const row = cloudRow ?? (await fetchCloudSave())
      if (!row) {
        pushNotice("云端还没有备份，先点「立即备份到云端」")
        return
      }
      const restored = applyCloudSave(row)
      /* 覆盖本地后立刻把视图数据也换掉：碎片 / 最深层数 / 开关一起刷新 */
      setSave(restored)
      setCloudRow(row)
      setConflict(null)
      setConflictHidden(true)
      pushNotice("已用云端进度覆盖本地，下面的数据也刷新了")
    } catch (err) {
      pushNotice(
        err instanceof CloudSaveError
          ? err.message
          : "恢复没成功，本地进度保持原样",
      )
    } finally {
      setCloudBusy("idle")
    }
  }, [cloudRow, pushNotice])

  const dismissConflict = useCallback(() => {
    setConflictHidden(true)
  }, [])

  /* ---------------- 清档 ---------------- */

  const requestClear = useCallback(() => {
    setClearStep("confirm")
  }, [])

  const cancelClear = useCallback(() => {
    setClearStep("idle")
  }, [])

  const confirmClear = useCallback(() => {
    /* 只清本机：整条存档（含上次备份时间）一起抹掉，云端那份留着 */
    const fresh = clearDungeonSave()
    setSave(fresh)
    setRestoreStep("idle")
    setClearStep("done")
    pushNotice("本地存档已清空，碎片与解锁进度都回到起点")
    if (typeof window !== "undefined") {
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current)
      clearTimer.current = window.setTimeout(() => setClearStep("idle"), 4200)
    }
  }, [pushNotice])

  const dismissClear = useCallback(() => {
    setClearStep("idle")
  }, [])

  const goHome = useCallback(() => {
    navigate("/")
  }, [navigate])

  const goDungeon = useCallback(() => {
    navigate("/dungeon")
  }, [navigate])

  return {
    /* 设置值 */
    settings: save.settings,
    fragments: save.fragments,
    bestFloor: save.bestFloor,
    unlockedCount: save.unlockedCharacters.length,
    version: APP_VERSION,
    languageLabel: "简体中文",

    /* 账号 */
    account,
    accountReady,
    loggedIn: account !== null,
    syncAccount,

    /* 云存档 */
    autoBackup: save.settings.autoBackup,
    lastBackupText: formatBackupTime(save.cloudBackupAt),
    hasCloudBackup: cloudRow !== null,
    cloudBusy,
    restoreStep,
    conflict: conflictHidden ? null : conflict,
    toggleAutoBackup,
    backupNow,
    requestRestore,
    cancelRestore,
    confirmRestore,
    dismissConflict,

    /* 清档 */
    clearStep,
    requestClear,
    cancelClear,
    confirmClear,
    dismissClear,

    /* 反馈 */
    notice,

    /* 操作 */
    toggleSetting,
    setVolume,
    previewVolume,
    setPlayMode,
    setMemoryDisplay,
    setTheme,
    setAccent,
    goHome,
    goDungeon,
  }
}
