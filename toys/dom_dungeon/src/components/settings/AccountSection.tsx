import { CircleUserRound, Wallet } from "lucide-react"

import { RhAccountMenu } from "@/components/rh/RhAccountMenu"
import type { RhAccountInfo } from "@/lib/platform"

type AccountSectionProps = {
  account: RhAccountInfo | null
  ready: boolean
  onAccountChange: (account: RhAccountInfo | null) => void
}

export function AccountSection({
  account,
  ready,
  onAccountChange,
}: AccountSectionProps) {
  const loggedIn = account !== null

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">
        账号
      </p>
      <h2 className="mt-1 font-display text-xl font-bold">
        {loggedIn ? "已登录" : "还没登录"}
      </h2>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary"
          >
            <CircleUserRound className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {!ready
                ? "正在确认登录状态…"
                : loggedIn
                  ? account.displayName
                  : "未登录，去登录"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {loggedIn
                ? "战绩、碎片和解锁进度跟着这个账号走"
                : "登录后战绩与碎片会跟账号绑定，换设备也能接着玩"}
            </span>
            {loggedIn && account.walletBalance !== undefined ? (
              <span className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <Wallet className="h-3 w-3 text-primary" />
                {account.walletBalance}
              </span>
            ) : null}
          </span>
        </span>

        <RhAccountMenu onAccountChange={onAccountChange} />
      </div>
    </section>
  )
}
