import { cn } from "@/lib/utils"
import { ALLY_DEFS, type AllyKind } from "@/pages/Dungeon/useDungeon"

/** 内核包 v1（kernel-tabs.md）：标签栏的一页展示数据（主标签 id=0 在首位） */
export type TabViewItem = {
  id: number
  label: string
  /** 页内存活敌人数（台前 = 主战场，后台 = 半速骚扰你的那批） */
  aliveCount: number
  frozen: boolean
  isFront: boolean
  /** 核心体验包 v2：援军页（有值则芯片图标代替存活红点） */
  ally?: AllyKind | null
}

type TabBarProps = {
  tabs: TabViewItem[]
  activeTabId: number
  canOpen: boolean
  openCost: number
  onOpen: () => void
  onSwitch: (id: number) => void
  onFreeze: (id: number) => void
  onClose: (id: number) => void
  /** 内核包 v2：任务管理器入口（每层一次，用过后本层变灰） */
  taskmgr?: { available: boolean; used: boolean; cost: number; onOpen: () => void }
  /** 核心体验包 v2：援军召唤入口（页满/非战斗置灰；内存不足点了给横幅） */
  reinforce?: { available: boolean; cost: number; onOpen: () => void }
}

/**
 * 浏览器标签栏：主标签（层名）+ 每张额外页芯片（存活点数 / ❄ 冻结 / × 关闭）
 * + 「+ 新页」按钮。仅普通层战斗中由页面挂载；点标签 = 把那页拿到台前。
 */
export function TabBar(p: TabBarProps) {
  return (
    <div
      aria-label="标签页栏"
      className="flex touch-manipulation items-stretch gap-1.5 overflow-x-auto pb-0.5"
    >
      {p.tabs.map((tab) => {
        const isMain = tab.id === 0
        const inBackground = !tab.isFront
        return (
          <div
            key={tab.id}
            className={cn(
              "flex shrink-0 items-stretch overflow-hidden rounded-md border text-xs transition",
              tab.isFront
                ? "border-primary/60 bg-primary/10 shadow-glow-cyan"
                : "border-border bg-card/80",
              tab.frozen && "opacity-70",
            )}
          >
            {/* 页签本体：点它切页（冻结页由引擎挡下并提示「先解冻」） */}
            <button
              type="button"
              onClick={() => p.onSwitch(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 font-mono font-bold touch-manipulation transition active:scale-95 focus-visible:outline-none focus-visible:shadow-focus",
                tab.isFront ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  tab.isFront ? "bg-sys-cache" : "bg-sys-network",
                )}
                title={tab.isFront ? "台前" : "后台（半速出手）"}
              />
              <span className="max-w-[7.5rem] truncate">
                {isMain ? tab.label : `${tab.label}${tab.frozen ? " ❄" : ""}`}
              </span>
              {tab.ally ? (
                /* 核心体验包 v2：援军芯片 ⚡/🎨/💾 代替存活红点（冻结态显 ❄ 同款） */
                <span
                  aria-label={`援军 · ${ALLY_DEFS[tab.ally].name}`}
                  title={`${ALLY_DEFS[tab.ally].name}：${ALLY_DEFS[tab.ally].effect}${tab.frozen ? "（已冻结 · 效果停摆）" : ""}`}
                  className={cn("text-[10px] leading-none", tab.frozen && "opacity-50")}
                >
                  {ALLY_DEFS[tab.ally].icon}
                </span>
              ) : (
                <span className="flex items-center gap-0.5" aria-label={`存活 ${tab.aliveCount}`}>
                  {tab.aliveCount > 0 ? (
                    Array.from({ length: Math.min(tab.aliveCount, 4) }).map((_, i) => (
                      <span key={i} className="inline-block h-1 w-1 rounded-[2px] bg-destructive/80" />
                    ))
                  ) : (
                    <span className="text-[10px] font-normal opacity-60">空</span>
                  )}
                </span>
              )}
            </button>
            {/* 额外页的后台控件：冻结切换 / 强关（主标签没有，台前页本身也不能操作自己） */}
            {!isMain && inBackground ? (
              <span className="flex items-center border-l border-border/60">
                <button
                  type="button"
                  onClick={() => p.onFreeze(tab.id)}
                  title={tab.frozen ? "解冻：恢复出手、恢复会崩" : "冻结：停手、不崩、维持费减半"}
                  className={cn(
                    "px-1.5 py-1.5 font-mono leading-none touch-manipulation transition active:scale-90 focus-visible:outline-none",
                    tab.frozen ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.frozen ? "❄→" : "❄"}
                </button>
                <button
                  type="button"
                  onClick={() => p.onClose(tab.id)}
                  title="强行关闭：敌人消失，碎片只折五成"
                  className="px-1.5 py-1.5 font-mono leading-none text-destructive/80 touch-manipulation transition hover:text-destructive active:scale-90 focus-visible:outline-none"
                >
                  ×
                </button>
              </span>
            ) : null}
          </div>
        )
      })}
      <button
        type="button"
        onClick={p.onOpen}
        disabled={!p.canOpen}
        title={p.canOpen ? "花内存开一张后台战场" : "内存不够或页已满"}
        className={cn(
          "shrink-0 rounded-md border border-dashed px-2.5 py-1.5 font-mono text-xs touch-manipulation transition active:scale-95 focus-visible:outline-none",
          p.canOpen
            ? "border-primary/50 text-primary hover:bg-primary/10"
            : "border-border text-muted-foreground/50",
        )}
      >
        + 新页 {p.openCost} 内存
      </button>
      {p.taskmgr ? (
        <button
          type="button"
          onClick={p.taskmgr.onOpen}
          disabled={!p.taskmgr.available}
          title={
            p.taskmgr.used
              ? "这一层的任务管理器已经用过了"
              : `暂停战斗，挑一个进程动手（花 ${p.taskmgr.cost} 内存，每层一次）`
          }
          className={cn(
            "shrink-0 rounded-md border px-2.5 py-1.5 font-mono text-xs touch-manipulation transition active:scale-95 focus-visible:outline-none",
            p.taskmgr.available
              ? "border-sys-network/60 text-sys-network hover:bg-sys-network/10"
              : "border-border text-muted-foreground/50",
          )}
        >
          {p.taskmgr.used ? "⚙ 已处理" : `⚙ 任务 ${p.taskmgr.cost}内存`}
        </button>
      ) : null}
      {/* 核心体验包 v2：援军召唤入口（与 taskmgr 入口同风格小钮；页满/非战斗置灰） */}
      {p.reinforce ? (
        <button
          type="button"
          onClick={p.reinforce.onOpen}
          disabled={!p.reinforce.available}
          title={
            p.reinforce.available
              ? `花 ${p.reinforce.cost} 内存开一张空页，住一个光环型友军（三选一）`
              : "页已满或当前不可召唤援军"
          }
          className={cn(
            "shrink-0 rounded-md border px-2.5 py-1.5 font-mono text-xs touch-manipulation transition active:scale-95 focus-visible:outline-none",
            p.reinforce.available
              ? "border-sys-cache/60 text-sys-cache hover:bg-sys-cache/10"
              : "border-border text-muted-foreground/50",
          )}
        >
          🤝 援军 {p.reinforce.cost}内存
        </button>
      ) : null}
    </div>
  )
}
