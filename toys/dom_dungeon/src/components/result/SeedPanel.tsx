import { Check, Copy, Share2 } from "lucide-react"

import { cn } from "@/lib/utils"

type SeedPanelProps = {
  seed: string
  copiedSeed: string | null
  onCopySeed: () => void
  /** 构筑码（build-code.md 三）：null = 本局没有可分享的词条列表，整块隐藏 */
  buildCode?: string | null
  copiedBuild?: string | null
  onCopyBuild?: () => void
  onStartNewRun: () => void
}

export function SeedPanel({
  seed,
  copiedSeed,
  onCopySeed,
  buildCode = null,
  copiedBuild = null,
  onCopyBuild,
  onStartNewRun,
}: SeedPanelProps) {
  const copied = copiedSeed !== null && copiedSeed === seed
  const copiedBuildNow = copiedBuild !== null && copiedBuild === buildCode

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Share2 className="h-4 w-4 text-primary" />
        本局种子码
      </h2>

      <p className="mt-3 break-all rounded-md border border-primary/50 bg-primary/10 px-3 py-3 text-center font-mono text-2xl font-bold tracking-tight text-primary">
        {seed || "—"}
      </p>

      <p className="mt-2 text-xs text-muted-foreground">
        别人把这串码输进地牢入口，就能玩到跟你一模一样的一局。
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onCopySeed}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:shadow-focus",
            copied
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border hover:border-primary/50 hover:text-primary",
          )}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "已复制" : "复制种子码"}
        </button>
        <button
          type="button"
          onClick={onStartNewRun}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
        >
          用同角色开新种子
        </button>
      </div>

      {buildCode ? (
        <div className="mt-4 border-t border-dashed border-border pt-3">
          <p className="font-mono text-xs text-muted-foreground">
            构筑码 · 带上这身词条开局
          </p>
          <p className="mt-2 break-all rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-center font-mono text-sm font-bold tracking-tight text-primary">
            {buildCode}
          </p>
          <button
            type="button"
            onClick={onCopyBuild}
            className={cn(
              "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:shadow-focus",
              copiedBuildNow
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border hover:border-primary/50 hover:text-primary",
            )}
          >
            {copiedBuildNow ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copiedBuildNow ? "已复制" : "复制构筑码"}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            好友把这串码贴进地牢入口，就能用你的角色 + 前 3 条词条抢跑开局。
          </p>
        </div>
      ) : null}
    </section>
  )
}
