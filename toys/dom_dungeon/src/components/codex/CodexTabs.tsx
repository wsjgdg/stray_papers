import type { CodexTabProgress } from "@/pages/Codex/useCodex"

type CodexTabsProps = {
  tabs: CodexTabProgress[]
  activeTab: CodexTabProgress["id"]
  onSelect: (tab: CodexTabProgress["id"]) => void
}

export function CodexTabs({ tabs, activeTab, onSelect }: CodexTabsProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6">
      <div
        role="tablist"
        aria-label="图鉴分类"
        className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-2 text-card-foreground shadow-md"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(tab.id)}
              className={`flex min-w-32 flex-1 flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition focus-visible:outline-none focus-visible:shadow-focus ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <span className="font-display text-base font-bold">
                {tab.label}
              </span>
              <span className="font-mono text-xs">
                {tab.lit}/{tab.total} · {tab.hint}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        点击切换分类，也可以用键盘 ← → 翻页
      </p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        💰碎片、🔷核心、🌱种子是三种互不兑换的货币：碎片靠日常产出，核心靠里程碑，种子是通关的稀缺奖励。
      </p>
    </div>
  )
}
