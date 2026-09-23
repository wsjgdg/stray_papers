import { ArrowLeft, BookOpen } from "lucide-react"

import { RhAccountMenu } from "@/components/rh/RhAccountMenu"
import { CurrencyBar } from "@/components/shared/CurrencyBar"
import { Button } from "@/components/ui/button"

type CodexTopBarProps = {
  litCount: number
  totalCount: number
  fragments: number
  cores: number
  seeds: number
  onGoHome: () => void
}

export function CodexTopBar({
  litCount,
  totalCount,
  fragments,
  cores,
  seeds,
  onGoHome,
}: CodexTopBarProps) {
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
          <BookOpen className="h-4 w-4" />
        </span>

        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold tracking-tight">
            图鉴
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            角色 · 词条 · 敌人 · Boss · 成就全档案
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <CurrencyBar
            fragments={fragments}
            cores={cores}
            seeds={seeds}
            className="hidden md:flex"
          />
          <span className="hidden items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-xs text-muted-foreground sm:inline-flex md:hidden">
            💰{fragments}
          </span>
          <span className="hidden items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-xs text-muted-foreground lg:inline-flex">
            点亮
            <span className="font-bold text-primary">
              {litCount}
              <span className="text-muted-foreground">/{totalCount}</span>
            </span>
          </span>
          <RhAccountMenu />
        </div>
      </div>
    </header>
  )
}
