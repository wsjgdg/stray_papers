import { Pause, Play, RotateCcw, LogOut, BookOpen } from "lucide-react"

type PauseOverlayProps = {
  floor: number
  floorTotal: number
  seed: string
  onResume: () => void
  onRestart: () => void
  onExit: () => void
  onHelp: () => void
}

export function PauseOverlay({
  floor,
  floorTotal,
  seed,
  onResume,
  onRestart,
  onExit,
  onHelp,
}: PauseOverlayProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-card-foreground shadow-md">
        <p className="flex items-center gap-2 font-display text-2xl font-bold">
          <Pause className="h-5 w-5 text-primary" />
          已暂停
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          第 {floor} / {floorTotal} 层 · 种子 {seed}
        </p>
        <p className="mt-3 rounded-sm border border-dashed border-border px-2 py-1.5 font-mono text-xs text-muted-foreground">
          计时、前摇和敌人出手都停住了，回来接着打。
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="flex items-center justify-center gap-2 rounded-md border border-primary bg-primary px-3 py-2 font-display text-sm font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
          >
            <Play className="h-4 w-4" />
            继续战斗
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重开一局
          </button>
          <button
            type="button"
            onClick={onHelp}
            className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            <BookOpen className="h-3.5 w-3.5" />
            玩法说明
          </button>
          <button
            type="button"
            onClick={onExit}
            className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 font-mono text-xs text-muted-foreground transition hover:border-destructive/60 hover:text-destructive focus-visible:outline-none focus-visible:shadow-focus"
          >
            <LogOut className="h-3.5 w-3.5" />
            离开地牢
          </button>
        </div>
      </div>
    </div>
  )
}
