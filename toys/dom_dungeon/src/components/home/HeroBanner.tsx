import { ArrowRight, Sparkles } from "lucide-react"

type HeroBannerProps = {
  dailyShortCode: string
  dailyCleared: boolean
  /** 趣味包 v4：击败过管理员后永久点亮，标题旁挂低调 DEV 徽标 */
  devMode?: boolean
  onStartDaily: () => void
}

const RULES = [
  { label: "层数", value: "8 层一局" },
  { label: "操作", value: "自动战斗 + 1 个手动技" },
  { label: "节奏", value: "一局 1~3 分钟" },
  { label: "存档", value: "死亡只丢当局" },
]

export function HeroBanner({
  dailyShortCode,
  dailyCleared,
  devMode = false,
  onStartDaily,
}: HeroBannerProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            roguelike · 一屏完成
          </p>
          <h1 className="mt-2 flex flex-wrap items-center gap-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            每一层标签，都是一间地牢
            {devMode ? (
              <span
                title="开发者模式 · 你击败过管理员"
                className="inline-flex shrink-0 items-center rounded-sm border border-sys-style/60 bg-sys-style/10 px-1.5 py-0.5 font-mono text-xs font-bold text-sys-style"
              >
                DEV
              </span>
            ) : null}
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            每层只做一个选择：三选一拿到新词条，然后看着角色自己把弹窗、广告和
            404 一个个清掉。第 4 层小 Boss，第 8 层大 Boss，撑过去就算通关。
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-xs text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              游客也能直接开打
            </span>
            <span className="rounded-sm border border-border px-2 py-1 font-mono text-xs text-muted-foreground">
              不卖数值 · 只解锁新角色与新词条
            </span>
          </div>
        </div>

        <div className="flex h-full flex-col rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            今日挑战
          </p>
          <p className="mt-2 font-display text-xl font-bold">
            种子 {dailyShortCode}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            全球同一套地牢，谁的打法更稳一看就知道。
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {dailyCleared ? "今日已通关，明天再来" : "今日还没通关"}
          </p>

          <button
            type="button"
            onClick={onStartDaily}
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
          >
            用今日种子开局
            <ArrowRight className="h-4 w-4" />
          </button>

          <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3">
            {RULES.map((rule) => (
              <div key={rule.label}>
                <dt className="font-mono text-xs text-muted-foreground">
                  {rule.label}
                </dt>
                <dd className="text-sm font-medium">{rule.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
