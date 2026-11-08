import { Check, Copy, Skull, Trophy } from "lucide-react"

import { CurrencyBar } from "@/components/shared/CurrencyBar"
import { RhAccountMenu } from "@/components/rh/RhAccountMenu"
import { cn } from "@/lib/utils"

type ResultTopBarProps = {
  characterName: string
  cleared: boolean
  floor: number
  floorTotal: number
  seed: string
  copiedSeed: string | null
  /** 账号最新余额（结算发放后实时刷新） */
  fragments: number
  cores: number
  seeds: number
  onCopySeed: () => void
}

export function ResultTopBar({
  characterName,
  cleared,
  floor,
  floorTotal,
  seed,
  copiedSeed,
  fragments,
  cores,
  seeds,
  onCopySeed,
}: ResultTopBarProps) {
  const copied = copiedSeed !== null && copiedSeed === seed

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
      <span
        aria-hidden
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-md border",
          cleared
            ? "border-primary/50 bg-primary/15 text-primary"
            : "border-destructive/60 bg-destructive/15 text-destructive",
        )}
      >
        {cleared ? <Trophy className="h-5 w-5" /> : <Skull className="h-5 w-5" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs text-primary">本局结算</p>
        <h1 className="truncate font-display text-xl font-bold tracking-tight sm:text-2xl">
          {characterName} · 第 {floor} / {floorTotal} 层
        </h1>
      </div>

      <CurrencyBar
        fragments={fragments}
        cores={cores}
        seeds={seeds}
        className="order-last w-full justify-end sm:order-none sm:w-auto"
      />

      <button
        type="button"
        onClick={onCopySeed}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? "已复制" : seed || "无种子"}
      </button>

      <RhAccountMenu />
    </div>
  )
}
