import { ShieldCheck } from "lucide-react"

import type { CodexEnemyEntry } from "@/pages/Codex/useCodex"

const ENEMY_GLYPH: Record<string, string> = {
  popup: "▣",
  ad: "▶",
  notfound: "404",
  captcha: "◯",
  leak: "▤",
}

type EnemyCodexPanelProps = {
  enemies: CodexEnemyEntry[]
  defeatedCount: number
  /** 一个都还没击退时给个「去战斗」出口 */
  onGoHome?: () => void
}

export function EnemyCodexPanel({
  enemies,
  defeatedCount,
  onGoHome,
}: EnemyCodexPanelProps) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          敌人档案
        </h2>
        <p className="font-mono text-xs text-muted-foreground">
          已击退{" "}
          <span className="font-bold text-primary">{defeatedCount}</span> /{" "}
          {enemies.length}
        </p>
      </div>

      {defeatedCount === 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card p-4 text-card-foreground">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">暂无击杀记录</span>
            <span className="block text-xs text-muted-foreground">
              第 1 层的弹窗怪就是第一个对手，打倒它们会记在这里
            </span>
          </span>
          {onGoHome ? (
            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
            >
              开始游戏
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {enemies.map((enemy) => (
          <article
            key={enemy.id}
            className={`flex h-full flex-col rounded-lg border bg-card p-4 text-card-foreground shadow-md ${
              enemy.defeated ? "border-primary/40" : "border-border"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-md border font-mono text-sm font-bold ${
                  enemy.defeated
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-dashed border-border bg-muted text-muted-foreground"
                }`}
              >
                {ENEMY_GLYPH[enemy.id] ?? "▢"}
              </span>
              <div className="min-w-0">
                <h3 className="truncate font-display text-base font-bold">
                  {enemy.displayName}
                </h3>
                <p className="font-mono text-xs text-muted-foreground">
                  生命 {enemy.hp} · 攻击 {enemy.attack}
                </p>
              </div>
            </div>

            <p className="mt-3 flex-1 text-sm text-muted-foreground">
              {enemy.trait}
            </p>

            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              {enemy.defeated ? (
                <span className="inline-flex items-center gap-1 rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                  <ShieldCheck className="h-3 w-3" />
                  已击败
                </span>
              ) : (
                <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  还没交过手
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
