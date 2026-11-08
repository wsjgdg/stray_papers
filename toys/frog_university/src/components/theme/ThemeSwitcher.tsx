/**
 * 三主题切换器（全站复用）：三态即时切换 + localStorage 持久化 + 刷新还原。
 * 主题变量定义在全局样式的 [data-theme] 分组里，body 上挂 data-theme。
 */
import { clsx } from "clsx";
import { THEME_OPTIONS, type ThemeId } from "@/lib/gameSave";

interface ThemeSwitcherProps {
  theme: ThemeId;
  onSwitch: (themeId: ThemeId) => void;
  /** 顶栏紧凑模式：用短名 */
  compact?: boolean;
  className?: string;
}

export function ThemeSwitcher({ theme, onSwitch, compact = false, className }: ThemeSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="切换视觉主题"
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm",
        compact ? "text-xs" : "text-sm",
        className,
      )}
    >
      {THEME_OPTIONS.map((option) => {
        const active = option.id === theme;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            title={option.hint}
            onClick={() => onSwitch(option.id)}
            className={clsx(
              "rounded-full px-3 py-1.5 font-medium transition-colors duration-200 outline-none focus-visible:shadow-focus",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              compact && "px-2 py-1 sm:px-2.5 sm:py-1",
            )}
          >
            {compact ? option.short : option.label}
          </button>
        );
      })}
    </div>
  );
}
