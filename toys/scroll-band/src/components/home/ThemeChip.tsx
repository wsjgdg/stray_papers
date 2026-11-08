import { useState } from "react";

// 界面主题 chip：三态循环 跟随系统 → 浅色 → 深色（点按切下一档，选择存本地刷新不丢）。
// 视觉规则全部在 index.css：无手动选择时走系统深浅媒体查询；手动档用 html 上的 data-theme 覆盖。
// 模块加载即回写 data-theme，保证手动档刷新后第一帧就是上次选的深浅色。
type ThemeMode = "auto" | "light" | "dark";

const KEY = "so-theme-mode";
const ORDER: ThemeMode[] = ["auto", "light", "dark"];
const LABEL: Record<ThemeMode, string> = { auto: "自动", light: "浅色", dark: "深色" };
const HINT: Record<ThemeMode, string> = {
  auto: "跟随系统深浅",
  light: "固定浅色",
  dark: "固定深色",
};

function readMode(): ThemeMode {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* 隐私模式读不到就按跟随系统 */
  }
  return "auto";
}

function applyMode(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

// 模块级执行一次：早于 React 首次渲染，避免手动档刷新后闪一下系统主题
applyMode(readMode());

export function ThemeChip() {
  const [mode, setMode] = useState<ThemeMode>(readMode);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
    applyMode(next);
    try {
      if (next === "auto") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      /* 存不下也不影响本次切换 */
    }
  };

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`界面主题：${HINT[mode]}，点击切换下一档`}
      title={`主题：${HINT[mode]}（点击在 跟随系统/浅色/深色 间切换）`}
      className={`min-w-[5.25rem] border px-2 py-0.5 text-center focus-visible:shadow-[var(--focus-ring)] ${
        mode === "auto"
          ? "border-border hover:border-foreground/60 hover:text-card-foreground"
          : "border-primary/60 text-primary"
      }`}
    >
      主题·{LABEL[mode]}
    </button>
  );
}
