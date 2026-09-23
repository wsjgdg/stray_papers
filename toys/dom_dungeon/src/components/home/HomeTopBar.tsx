import { BookOpen, Settings } from "lucide-react"

import { CurrencyBar } from "@/components/shared/CurrencyBar"
import { RhAccountMenu } from "@/components/rh/RhAccountMenu"
import { Button } from "@/components/ui/button"

type HomeTopBarProps = {
  fragments: number
  cores: number
  seeds: number
  onOpenSettings: () => void
  onOpenHelp: () => void
}

export function HomeTopBar({
  fragments,
  cores,
  seeds,
  onOpenSettings,
  onOpenHelp,
}: HomeTopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10 font-mono text-sm font-bold text-primary"
        >
          TD
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold tracking-tight">
            标签地牢
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            浏览器标签就是地牢层
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <CurrencyBar
            fragments={fragments}
            cores={cores}
            seeds={seeds}
            className="hidden sm:flex"
          />
          <span className="font-mono text-xs font-bold text-primary sm:hidden">
            💰{fragments}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenHelp}
            className="gap-1"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">玩法</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="gap-1"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">设置</span>
          </Button>
          <RhAccountMenu />
        </div>
      </div>
    </header>
  )
}
