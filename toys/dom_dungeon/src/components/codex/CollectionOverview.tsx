import type { CodexTabProgress } from "@/pages/Codex/useCodex"

type CollectionOverviewProps = {
  litCount: number
  totalCount: number
  fragments: number
  tabs: CodexTabProgress[]
  activeTab: CodexTabProgress["id"]
  onSelectTab: (tab: CodexTabProgress["id"]) => void
}

export function CollectionOverview({
  litCount,
  totalCount,
  fragments,
  tabs,
  activeTab,
  onSelectTab,
}: CollectionOverviewProps) {
  const ratio = totalCount > 0 ? Math.min(1, litCount / totalCount) : 0
  const percent = Math.round(ratio * 100)

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-6">
      <div className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-md">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              收集总览
            </p>
            <p className="mt-1 font-display text-3xl font-bold tracking-tight">
              <span className="text-primary">{litCount}</span>
              <span className="text-muted-foreground"> / {totalCount}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              已点亮 {percent}% 的地牢档案
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-4 py-3">
            <div className="text-right">
              <p className="font-mono text-xs text-muted-foreground">碎片余额</p>
              <p className="font-display text-2xl font-bold text-primary">
                {fragments}
              </p>
            </div>
            <span
              aria-hidden
              className="grid h-10 w-10 place-items-center rounded-full border border-primary/40 bg-primary/10 font-mono text-sm font-bold text-primary"
            >
              ◆
            </span>
          </div>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tabs.map((tab) => {
            const active = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`rounded-md border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:shadow-focus ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <p className="font-mono text-xs text-muted-foreground">
                  {tab.label}
                </p>
                <p
                  className={`font-display text-lg font-bold ${
                    active ? "text-primary" : ""
                  }`}
                >
                  {tab.lit}
                  <span className="text-sm text-muted-foreground">
                    /{tab.total}
                  </span>
                </p>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
