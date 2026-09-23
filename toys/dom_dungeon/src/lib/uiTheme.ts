import { loadDungeonSave, type DungeonSettings } from "@/lib/dungeonSave"

/**
 * 外观换肤（ui-appearance.md）：主题与强调色都只写到 <html> 的 data-* 上，
 * index.css 用属性选择器覆盖 token，组件零改动。
 * 默认值（深色 / 霓虹青）用「擦属性」表示，保持 :root 基准生效。
 */
export function applyUiTheme(
  theme: DungeonSettings["theme"],
  accent: DungeonSettings["accent"],
): void {
  const root = document.documentElement
  if (theme === "light") root.dataset.theme = "light"
  else delete root.dataset.theme
  if (accent === "cyan") delete root.dataset.accent
  else root.dataset.accent = accent
}

/** 启动时按本地存档应用一次（App 入口 import 即执行，刷新 / 换页表现一致） */
export function applyUiThemeFromSave(): void {
  const { theme, accent } = loadDungeonSave().settings
  applyUiTheme(theme, accent)
}

applyUiThemeFromSave()
