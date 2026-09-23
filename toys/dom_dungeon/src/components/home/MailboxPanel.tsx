import { useState } from "react"
import { ChevronDown, ChevronUp, Inbox, MailOpen } from "lucide-react"

import type { MailItem } from "@/lib/dungeonSave"

type MailboxPanelProps = {
  mailItems: MailItem[]
  unclaimed: number
  onClaim: (id: string) => void
}

function rewardText(mail: MailItem): string {
  const parts = [
    mail.fragments > 0 ? `+${mail.fragments} 💰` : "",
    mail.cores > 0 ? `+${mail.cores} 🔷` : "",
    mail.seeds > 0 ? `+${mail.seeds} 🌱` : "",
  ].filter(Boolean)
  return parts.length > 0 ? parts.join("  ") : "感谢参与"
}

function mailTitle(mail: MailItem): string {
  const kindLabel = mail.kind === "weekly" ? "周榜奖励" : "名次奖励"
  const rankPart = mail.rank > 0 ? ` · 第 ${mail.rank} 名` : ""
  const titlePart = mail.title ? ` · 称号「${mail.title}」` : ""
  return `${kindLabel}${rankPart}${titlePart}`
}

/**
 * 奖励信箱：每日 / 每周名次奖励先进箱再手领，7 天没领的自动过期。
 * 有未领的信时默认展开并高亮，没有就收着一行。
 */
export function MailboxPanel({ mailItems, unclaimed, onClaim }: MailboxPanelProps) {
  const [open, setOpen] = useState(unclaimed > 0)

  if (mailItems.length === 0) return null

  /* 最近的信排前面 */
  const sorted = [...mailItems].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-left text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
      >
        <Inbox className="h-4 w-4 shrink-0" aria-hidden />
        奖励信箱
        {unclaimed > 0 ? (
          <span className="rounded-full bg-destructive px-1.5 py-0.5 font-mono text-xs font-bold text-destructive-foreground">
            {unclaimed} 封未领
          </span>
        ) : null}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0" aria-hidden />
      </button>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-md">
      <div className="flex items-center gap-2">
        <Inbox className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <h2 className="font-display text-base font-bold">奖励信箱</h2>
        {unclaimed > 0 ? (
          <span className="rounded-full bg-destructive px-1.5 py-0.5 font-mono text-xs font-bold text-destructive-foreground">
            {unclaimed} 封未领
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
        >
          收起
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        每日 / 每周名次奖励先进箱再领取，7 天没领会过期
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {sorted.map((mail) => (
          <li
            key={mail.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-btn border border-border bg-background/40 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-sm text-card-foreground">
                {mailTitle(mail)}
                <span className="ml-2 text-xs text-muted-foreground">{mail.dateKey}</span>
              </p>
              <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-primary">
                {rewardText(mail)}
              </p>
            </div>
            {mail.takenAt ? (
              <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <MailOpen className="h-3.5 w-3.5" aria-hidden />
                已领取
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onClaim(mail.id)}
                className="rounded-btn bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus"
              >
                领取
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
