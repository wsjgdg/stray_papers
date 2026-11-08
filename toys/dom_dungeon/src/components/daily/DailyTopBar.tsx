import { ArrowLeft, CalendarDays } from "lucide-react"

import { CurrencyBar } from "@/components/shared/CurrencyBar"
import { RhAccountMenu } from "@/components/rh/RhAccountMenu"
import { Button } from "@/components/ui/button"
import type { RhAccountInfo } from "@/lib/platform"

type DailyTopBarProps = {
  dateLabel: string
  myRank: number | null
  fragments: number
  cores: number
  seeds: number
  onGoHome: () => void
  onAccountChange: (account: RhAccountInfo | null) => void
}

export function DailyTopBar({
  dateLabel,
  myRank,
  fragments,
  cores,
  seeds,
  onGoHome,
  onAccountChange,
}: DailyTopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onGoHome}
          className="gap-1 focus-visible:shadow-focus"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">返回首页</span>
        </Button>

        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary"
        >
          <CalendarDays className="h-4 w-4" />
        </span>

        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold tracking-tight">
            每日挑战
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {dateLabel} · 全球同种子
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <CurrencyBar
            fragments={fragments}
            cores={cores}
            seeds={seeds}
            className="hidden md:flex"
          />
          <span className="hidden items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-xs text-muted-foreground sm:inline-flex">
            我的名次
            <span className="font-bold text-primary">
              {myRank ? `#${myRank}` : "—"}
            </span>
          </span>
          <RhAccountMenu onAccountChange={onAccountChange} />
        </div>
      </div>
    </header>
  )
}
