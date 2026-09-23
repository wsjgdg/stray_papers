import { ChevronDown, Copy, Skull, Trophy } from "lucide-react"

import type { DungeonRunRecord } from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

type LastRunFooterProps = {
  lastRun: DungeonRunRecord | null
  open: boolean
  copiedSeed: string | null
  onToggle: () => void
  onCopySeed: (seed: string) => void
}

export function LastRunFooter({
  lastRun,
  open,
  copiedSeed,
  onToggle,
  onCopySeed,
}: LastRunFooterProps) {
  return (
    <footer className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-8">
      <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md">
        {!lastRun ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              还没有战绩，先打一局就会记在这里。
            </p>
            <span className="font-mono text-xs text-muted-foreground">
              死亡只丢当局，不删档不掉装备
            </span>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="flex w-full flex-wrap items-center gap-3 text-left focus-visible:outline-none focus-visible:shadow-focus"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                <Skull className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-xs text-muted-foreground">
                  最近一局
                </span>
                <span className="block truncate text-sm font-semibold">
                  {lastRun.characterName} · 到达第 {lastRun.floor} 层 ·{" "}
                  {lastRun.cause}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-xs text-primary">
                {open ? "收起详情" : "展开详情"}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition",
                    open && "rotate-180",
                  )}
                />
              </span>
            </button>

            {open && (
              <div className="mt-4 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                <dl className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="font-mono text-xs text-muted-foreground">
                      角色
                    </dt>
                    <dd className="text-sm font-medium">
                      {lastRun.characterName}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="font-mono text-xs text-muted-foreground">
                      到达层数
                    </dt>
                    <dd className="flex items-center gap-1 text-sm font-medium">
                      <Trophy className="h-3.5 w-3.5 text-primary" />第{" "}
                      {lastRun.floor} 层
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="font-mono text-xs text-muted-foreground">
                      结束原因
                    </dt>
                    <dd className="text-sm font-medium">{lastRun.cause}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="font-mono text-xs text-muted-foreground">
                      时间
                    </dt>
                    <dd className="font-mono text-sm">{lastRun.endedAt}</dd>
                  </div>
                </dl>

                <div className="rounded-md border border-dashed border-border p-3">
                  <p className="font-mono text-xs text-muted-foreground">
                    当局词条
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {lastRun.relics.map((relic) => (
                      <span
                        key={relic}
                        className="rounded-sm bg-foreground/5 px-2 py-1 font-mono text-xs"
                      >
                        {relic}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-primary">
                      {lastRun.seed}
                    </span>
                    <button
                      type="button"
                      onClick={() => onCopySeed(lastRun.seed)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono text-xs transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedSeed === lastRun.seed ? "已复制" : "复制种子码"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </footer>
  )
}
