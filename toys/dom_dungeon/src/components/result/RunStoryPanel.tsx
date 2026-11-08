import { ScrollText } from "lucide-react"

import { cn } from "@/lib/utils"

type RunStoryPanelProps = {
  /** 引擎记录的本局关键节点（每条一句中文）；旧存档为 undefined */
  story?: string[]
  seed: string
  durationLabel: string
  /** 低配模式：跳过逐条点亮，直接显示 */
  lowSpec?: boolean
}

/** 逐条点亮节奏与评分面板一致（220ms 一条，延迟封顶 ~2200ms） */
const REVEAL_STEP_MS = 220
const REVEAL_CAP_MS = 2200

export function RunStoryPanel({
  story,
  seed,
  durationLabel,
  lowSpec,
}: RunStoryPanelProps) {
  if (!story || story.length === 0) return null

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <ScrollText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          本局故事
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          {story.length} 个瞬间
        </span>
      </div>

      <ol className="mt-3 flex flex-col gap-2">
        {story.map((line, index) => (
          <li
            key={`story-${index}`}
            className={cn(
              "flex items-start gap-2.5 text-sm leading-relaxed",
              !lowSpec && "animate-in fade-in slide-in-from-bottom-2 duration-300",
            )}
            style={
              lowSpec
                ? undefined
                : {
                    animationDelay: `${Math.min(
                      index * REVEAL_STEP_MS,
                      REVEAL_CAP_MS,
                    )}ms`,
                  }
            }
          >
            <span
              aria-hidden
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            />
            <span className="min-w-0 text-card-foreground">{line}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
        种子 {seed} · 用时 {durationLabel}
      </p>
    </section>
  )
}
