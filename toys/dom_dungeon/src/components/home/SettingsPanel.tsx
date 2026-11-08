import { Keyboard, Volume2, VolumeX, X, Zap } from "lucide-react"

import type { DungeonSettings } from "@/lib/dungeonSave"
import { cn } from "@/lib/utils"

type SettingsPanelProps = {
  open: boolean
  settings: DungeonSettings
  onToggle: (key: keyof DungeonSettings) => void
  onClose: () => void
}

const KEYMAP = [
  { keys: "← →", desc: "切换高亮的角色卡" },
  { keys: "Enter", desc: "用当前角色进入地牢" },
  { keys: "Esc", desc: "关掉这个面板" },
]

export function SettingsPanel({
  open,
  settings,
  onToggle,
  onClose,
}: SettingsPanelProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-md"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">设置</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            className="grid h-8 w-8 place-items-center rounded-md border border-border transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <button
            type="button"
            onClick={() => onToggle("sound")}
            aria-pressed={settings.sound}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-border p-3 text-left transition hover:border-primary/50 focus-visible:outline-none focus-visible:shadow-focus"
          >
            <span className="flex items-center gap-2">
              {settings.sound ? (
                <Volume2 className="h-4 w-4 text-primary" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
              <span>
                <span className="block text-sm font-semibold">音效</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  攻击与技能命中时的提示音
                </span>
              </span>
            </span>
            <span
              className={cn(
                "rounded-sm px-2 py-1 font-mono text-xs",
                settings.sound
                  ? "bg-primary/15 text-primary"
                  : "bg-foreground/5 text-muted-foreground",
              )}
            >
              {settings.sound ? "开" : "关"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onToggle("lowSpec")}
            aria-pressed={settings.lowSpec}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-border p-3 text-left transition hover:border-primary/50 focus-visible:outline-none focus-visible:shadow-focus"
          >
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span>
                <span className="block text-sm font-semibold">低配模式</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  关掉发光与粒子，只留必要动效
                </span>
              </span>
            </span>
            <span
              className={cn(
                "rounded-sm px-2 py-1 font-mono text-xs",
                settings.lowSpec
                  ? "bg-primary/15 text-primary"
                  : "bg-foreground/5 text-muted-foreground",
              )}
            >
              {settings.lowSpec ? "开" : "关"}
            </span>
          </button>
        </div>

        <div className="mt-4 rounded-md border border-dashed border-border p-3">
          <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Keyboard className="h-3.5 w-3.5" />
            键盘操作
          </p>
          <ul className="mt-2 space-y-1">
            {KEYMAP.map((item) => (
              <li
                key={item.keys}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <kbd className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-foreground">
                  {item.keys}
                </kbd>
                {item.desc}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
        >
          知道了
        </button>
      </div>
    </div>
  )
}
