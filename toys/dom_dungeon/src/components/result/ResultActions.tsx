import { Home, RotateCcw } from "lucide-react"

type ResultActionsProps = {
  characterName: string
  durationLabel: string
  bestFloor: number
  floor: number
  onStartNewRun: () => void
  onGoHome: () => void
}

export function ResultActions({
  characterName,
  durationLabel,
  bestFloor,
  floor,
  onStartNewRun,
  onGoHome,
}: ResultActionsProps) {
  const isBest = floor > 0 && floor >= bestFloor

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onStartNewRun}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:scale-105 hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
        >
          <RotateCcw className="h-4 w-4" />
          用 {characterName} 再来一局
        </button>
        <button
          type="button"
          onClick={onGoHome}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
        >
          <Home className="h-4 w-4" />
          回首页
        </button>
      </div>

      <p className="mt-3 text-center font-mono text-xs text-muted-foreground">
        本局用时 {durationLabel} · 历史最深 {bestFloor} 层
        {isBest ? " · 这局就是你的新纪录" : ""}
      </p>
    </div>
  )
}
