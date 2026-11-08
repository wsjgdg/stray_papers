import { Check, Download, ImageIcon, TriangleAlert } from "lucide-react"

import type { ShareStatus } from "@/pages/Result/useResult"
import { cn } from "@/lib/utils"

type ShareImagePanelProps = {
  shareStatus: ShareStatus
  onSave: () => void
}

export function ShareImagePanel({ shareStatus, onSave }: ShareImagePanelProps) {
  const saved = shareStatus === "saved"
  const failed = shareStatus === "failed"

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <ImageIcon className="h-4 w-4 text-primary" />
        分享图
      </h2>

      <p className="mt-2 text-xs text-muted-foreground">
        竖版长图，一张就能说清这局：角色、层数、死因、词条、羁绊、碎片和种子码都在上面。
      </p>

      <button
        type="button"
        onClick={onSave}
        className={cn(
          "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition hover:scale-105 focus-visible:outline-none focus-visible:shadow-focus",
          saved
            ? "border-primary/60 bg-primary/10 text-primary"
            : "border-primary/60 bg-background/40 text-primary hover:bg-primary/10",
        )}
      >
        {saved ? (
          <Check className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {saved ? "已保存到下载目录" : "保存分享图"}
      </button>

      {failed ? (
        <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-destructive">
          <TriangleAlert className="h-3.5 w-3.5" />
          这次没画出来，再点一次就好
        </p>
      ) : (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          点一下就生成 PNG 并开始下载，不占云端空间。
        </p>
      )}
    </section>
  )
}
