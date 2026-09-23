import type { useBossRush } from "@/pages/BossRush/useBossRush"

/** Boss Rush 顶栏：返回 / 波次 HUD / 祭坛币 / 收手 */
export function RushTopBar(p: ReturnType<typeof useBossRush>) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={p.goHome}
          aria-label="回首页"
          className="rounded-md border border-border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
        >
          ← 首页
        </button>

        <div className="flex items-center gap-2">
          <span className={`rounded-md border px-2.5 py-1 text-sm font-bold ${p.skin.style.chip}`}>
            第 {p.wave} 波
          </span>
          <span className="hidden rounded-md border border-border px-2 py-1 text-xs text-muted-foreground sm:inline">
            循环 {p.cycle + 1} · Boss 血量 {p.hpMultText}
          </span>
        </div>

        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
          <span className={`h-2 w-2 shrink-0 rounded-full ${p.skin.style.dot}`} aria-hidden />
          <span className="truncate font-semibold text-foreground">{p.character.displayName}</span>
        </span>

        <span className="ml-auto flex items-center gap-2">
          <span className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary tabular-nums">
            🪙 {p.coins}
            <span className="ml-1 text-xs font-medium text-primary/70">祭坛币</span>
          </span>
          <button
            type="button"
            onClick={p.openAltar}
            className="rounded-md border border-border px-2.5 py-1 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            ⛩ 祭坛
          </button>
          <button
            type="button"
            onClick={p.retreat}
            disabled={p.phase === "settle"}
            className="rounded-btn border border-primary bg-primary/10 px-3 py-1 text-sm font-bold text-primary transition hover:bg-primary/20 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40"
          >
            🏳 收手
          </button>
        </span>
      </div>
    </header>
  )
}
