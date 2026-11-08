import type { ReactNode } from "react"

type SettingsReadonlyRowProps = {
  icon: ReactNode
  label: string
  description: string
  value: string
}

/** 暂时只有一项、不可点的只读行（语言） */
export function SettingsReadonlyRow({
  icon,
  label,
  description,
  value,
}: SettingsReadonlyRowProps) {
  return (
    <div
      aria-disabled
      className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-3"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground"
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

      <span className="shrink-0 rounded-sm bg-foreground/5 px-2 py-1 font-mono text-xs text-muted-foreground">
        {value}
      </span>
    </div>
  )
}
