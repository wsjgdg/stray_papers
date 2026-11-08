import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SettingsToggleRowProps = {
  icon: ReactNode
  label: string
  description: string
  checked: boolean
  onToggle: () => void
  /** 开启态的补充说明，比如低配模式会关掉哪些东西 */
  activeNote?: string
}

export function SettingsToggleRow({
  icon,
  label,
  description,
  checked,
  onToggle,
  activeNote,
}: SettingsToggleRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border p-3 transition",
        checked ? "border-primary/40 bg-primary/5" : "border-border",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-md border",
            checked
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{label}</span>
          <span className="block text-xs text-muted-foreground">
            {description}
          </span>
          {checked && activeNote ? (
            <span className="mt-1 block font-mono text-xs text-primary">
              {activeNote}
            </span>
          ) : null}
        </span>
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:shadow-focus",
          checked
            ? "border-primary bg-primary"
            : "border-border bg-foreground/10",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute left-1 h-4 w-4 rounded-full bg-background shadow-md transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  )
}
