import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SettingsSliderRowProps = {
  icon: ReactNode
  label: string
  description: string
  value: number
  /** 关掉音效时整行置灰，拖动无效 */
  disabled?: boolean
  onChange: (value: number) => void
  /** 松手时回调一次，用来放一声试听音 */
  onCommit: () => void
}

export function SettingsSliderRow({
  icon,
  label,
  description,
  value,
  disabled = false,
  onChange,
  onCommit,
}: SettingsSliderRowProps) {
  return (
    <div
      className={cn(
        "rounded-md border p-3 transition",
        disabled ? "border-border opacity-50" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-md border",
              disabled
                ? "border-border bg-muted text-muted-foreground"
                : "border-primary/40 bg-primary/10 text-primary",
            )}
          >
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{label}</span>
            <span className="block text-xs text-muted-foreground">
              {description}
            </span>
          </span>
        </span>
        <span className="shrink-0 font-mono text-sm font-bold text-primary">
          {value}%
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={disabled ? undefined : onCommit}
        onKeyUp={disabled ? undefined : onCommit}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-foreground/10 accent-primary disabled:cursor-not-allowed"
      />
      <div className="mt-1 flex justify-between font-mono text-xs text-muted-foreground">
        <span>静音</span>
        <span>最大</span>
      </div>
    </div>
  )
}
