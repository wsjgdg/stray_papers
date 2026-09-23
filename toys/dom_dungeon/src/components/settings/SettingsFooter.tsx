import { HardDrive, ShieldCheck } from "lucide-react"

type SettingsFooterProps = {
  version: string
  fragments: number
  bestFloor: number
  floorTotal: number
}

export function SettingsFooter({
  version,
  fragments,
  bestFloor,
  floorTotal,
}: SettingsFooterProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
      <p className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <HardDrive className="h-3.5 w-3.5" />
        版本 v{version} · 最深 {bestFloor} / {floorTotal} 层 · 碎片 {fragments}
      </p>
      <p className="flex items-center gap-1.5 font-mono text-xs text-primary">
        <ShieldCheck className="h-3.5 w-3.5" />
        本地存档，不删档不卖数值
      </p>
    </div>
  )
}
