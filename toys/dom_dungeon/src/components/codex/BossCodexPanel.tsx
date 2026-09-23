import { Crown, ShieldCheck } from "lucide-react"

import type { CodexBossEntry } from "@/pages/Codex/useCodex"

type BossCodexPanelProps = {
  bosses: CodexBossEntry[]
  defeatedCount: number
}

export function BossCodexPanel({
  bosses,
  defeatedCount,
}: BossCodexPanelProps) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          层主档案
        </h2>
        <p className="font-mono text-xs text-muted-foreground">
          已击败{" "}
          <span className="font-bold text-primary">{defeatedCount}</span> /{" "}
          {bosses.length}
        </p>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {bosses.map((boss) => (
          <article
            key={boss.id}
            className={`flex h-full flex-col rounded-lg border bg-card p-5 text-card-foreground shadow-md ${
              boss.defeated ? "border-primary ring-1 ring-primary/40" : "border-border"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-md border ${
                  boss.defeated
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-dashed border-border bg-muted text-muted-foreground"
                }`}
              >
                <Crown className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-muted-foreground">
                  {boss.floorLabel}
                </p>
                <h3 className="truncate font-display text-lg font-bold">
                  {boss.displayName}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {boss.trait}
                </p>
              </div>
              {boss.defeated ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                  <ShieldCheck className="h-3 w-3" />
                  已击败
                </span>
              ) : (
                <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  未击败
                </span>
              )}
            </div>

            <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
              <div className="flex gap-1">
                <dt>生命</dt>
                <dd className="text-foreground">{boss.hp}</dd>
              </div>
              <div className="flex gap-1">
                <dt>攻击</dt>
                <dd className="text-foreground">{boss.attack}</dd>
              </div>
              <div className="flex gap-1">
                <dt>限制</dt>
                <dd className="text-foreground">{boss.limitLabel}</dd>
              </div>
            </dl>

            <ol className="mt-4 flex-1 space-y-2">
              {boss.phases.map((phase) => (
                <li
                  key={phase.label}
                  className="rounded-md border border-dashed border-border bg-background/40 p-3"
                >
                  <p className="font-mono text-xs text-primary">{phase.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {phase.detail}
                  </p>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  )
}
