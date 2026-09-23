import { ArrowLeft, Gauge } from "lucide-react"

import { RhAccountMenu } from "@/components/rh/RhAccountMenu"

type SettingsTopBarProps = {
  onBack: () => void
}

export function SettingsTopBar({ onBack }: SettingsTopBarProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline">返回首页</span>
      </button>

      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary"
      >
        <Gauge className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-display text-lg font-bold tracking-tight">
          设置
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          改完立刻生效并记住
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <RhAccountMenu />
      </div>
    </div>
  )
}
