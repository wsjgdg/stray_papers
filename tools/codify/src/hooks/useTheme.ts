// 深浅色主题：浅色 / 深色 / 跟随系统 三态循环。
// 选择持久化在 localStorage（与 index.html 里的首帧脚本共用同一个 key），
// 生效方式是在 <html> 上切换 .dark class，颜色全部走 index.css 的 token。

import { useCallback, useEffect, useState } from "react"

export type ThemeMode = "light" | "dark" | "system"

export const THEME_KEY = "meeting-notes-theme-v1"

const MODES: ThemeMode[] = ["light", "dark", "system"]

export const THEME_LABELS: Record<ThemeMode, string> = {
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
}

function loadMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === "light" || v === "dark" || v === "system") return v
  } catch {
    // 隐私模式等场景读不到，退回跟随系统
  }
  return "system"
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(loadMode)

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, mode)
    } catch {
      // 写不进去也不影响本次会话生效
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const dark = mode === "dark" || (mode === "system" && mq.matches)
      document.documentElement.classList.toggle("dark", dark)
    }
    apply()
    // 跟随系统时，系统切换深浅色要实时响应
    if (mode !== "system") return
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [mode])

  const cycle = useCallback(() => {
    setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length])
  }, [])

  return { mode, cycle }
}
