import { BookOpen } from "lucide-react"

type CodexFooterProps = {
  litCount: number
  totalCount: number
  /** 还没露面的隐藏角色：不进「还差 N 条」催促文案 */
  hiddenPending: number
  onGoHome: () => void
}

export function CodexFooter({
  litCount,
  totalCount,
  hiddenPending,
  onGoHome,
}: CodexFooterProps) {
  const remaining = Math.max(0, totalCount - litCount - hiddenPending)

  return (
    <footer className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dashed border-border bg-card p-5 text-card-foreground shadow-md">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary"
          >
            <BookOpen className="h-4 w-4" />
          </span>
          <div>
            <p className="font-display text-base font-bold">
              继续玩，就能点亮更多条目
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              还差 {remaining} 条没点亮：多打几局带词条，把第 4 层和第 8
              层都清一遍。
              {hiddenPending > 0
                ? "通关攒够了次数，图鉴里还会有神秘角色现身。"
                : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onGoHome}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-primary/50 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:shadow-focus"
        >
          回首页开一局
        </button>
      </div>
    </footer>
  )
}
