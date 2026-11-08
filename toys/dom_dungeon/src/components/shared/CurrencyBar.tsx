/**
 * 三货币余额栏：碎片💰 / 核心🔷 / 种子🌱。
 * 首页顶栏、图鉴顶栏、每日页用；数值由页面自己的存档 state 传入，保持同步。
 */

type CurrencyBarProps = {
  fragments: number
  cores: number
  seeds: number
  className?: string
}

const ITEMS = [
  { key: "fragments", icon: "💰", label: "碎片" },
  { key: "cores", icon: "🔷", label: "核心" },
  { key: "seeds", icon: "🌱", label: "种子" },
] as const

export function CurrencyBar({ fragments, cores, seeds, className }: CurrencyBarProps) {
  const values: Record<(typeof ITEMS)[number]["key"], number> = {
    fragments,
    cores,
    seeds,
  }
  return (
    <div
      className={`flex items-center gap-2 font-mono text-sm ${className ?? ""}`}
      aria-label="货币余额"
    >
      {ITEMS.map((item) => (
        <span
          key={item.key}
          title={`${item.label}：${values[item.key]}`}
          className="flex items-center gap-1 rounded-btn border border-white/10 bg-white/5 px-2 py-0.5 tabular-nums text-foreground/90"
        >
          <span aria-hidden>{item.icon}</span>
          {values[item.key]}
        </span>
      ))}
    </div>
  )
}
