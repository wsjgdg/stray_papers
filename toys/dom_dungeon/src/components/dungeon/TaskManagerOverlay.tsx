import { Cpu, Gauge, MemoryStick, Skull, Wrench } from "lucide-react"

import type { TaskActionKind } from "@/pages/Dungeon/useDungeon"
import { cn } from "@/lib/utils"

/** 任务管理器里的一行进程（打开浮层时战斗已暂停，快照即当下战场） */
export type TaskMgrEnemyRow = {
  uid: string
  name: string
  hp: number
  maxHp: number
  attack: number
  /** 血量 ≤25% 才能「结束任务」 */
  canEnd: boolean
}

type TaskManagerOverlayProps = {
  enemies: TaskMgrEnemyRow[]
  /** 深化包：当前内存碎片数（0 时磁盘整理置灰） */
  memFrags: number
  /** 每层只能做一次操作（选完即消耗） */
  onAction: (kind: TaskActionKind, uid: string | null) => void
  /** 不选任何操作直接合上（门票内存不退，本层次数还在） */
  onDismiss: () => void
  lowSpec?: boolean
}

/**
 * 任务管理器（内核包 v2）：浏览器最标志性的窗口变成玩家每层一次的决策——
 * 结束残血进程 / 限制敌人出手 / 优化自己的攻击 / 回收后台内存，选一个就合上。
 */
export function TaskManagerOverlay({
  enemies,
  memFrags,
  onAction,
  onDismiss,
  lowSpec = false,
}: TaskManagerOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="任务管理器"
        className={cn(
          "relative max-h-full w-full max-w-2xl animate-in overflow-y-auto rounded-lg border border-primary/50 bg-gradient-to-b from-card via-card to-background p-4 text-card-foreground shadow-md sm:p-5",
          !lowSpec && "fade-in slide-in-from-bottom-4 duration-300",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-primary/10 blur-3xl"
        />

        <div className="relative">
          {/* 开机扫描线：面板展开时自上而下扫一次（低配 / 运动减弱时关闭） */}
          {!lowSpec ? (
            <span
              aria-hidden
              className="taskmgr-scan pointer-events-none absolute inset-x-0 z-10 h-6 bg-gradient-to-b from-primary/25 via-primary/10 to-transparent motion-reduce:hidden"
            />
          ) : null}
          <p className="flex items-center gap-1.5 font-mono text-xs text-primary">
            <Cpu className="h-3.5 w-3.5" />
            任务管理器 · 战斗已暂停，每层只能动手一次
          </p>
          <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
            进程列表
          </h2>

          {/* 敌人进程：结束（仅残血）/ 限制（出手减半，本层永久） */}
          <ul className="mt-3 grid gap-2">
            {enemies.map((row, index) => {
              const ratio = Math.max(0, Math.min(1, row.hp / row.maxHp))
              return (
                <li
                  key={row.uid}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2",
                    /* 进程行错峰入场：每行晚 60ms 从左侧滑入（低配直显） */
                    !lowSpec && "task-row-in",
                  )}
                  style={
                    lowSpec
                      ? undefined
                      : { animationDelay: `${Math.min(index, 8) * 60}ms` }
                  }
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-sm font-bold">
                    {row.name}.exe
                  </span>
                  <span
                    className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted"
                    aria-label={`生命 ${row.hp}/${row.maxHp}`}
                  >
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        ratio <= 0.25 ? "bg-sys-cache" : "bg-destructive/80",
                      )}
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    攻击 {row.attack}
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      disabled={!row.canEnd}
                      onClick={() => onAction("end", row.uid)}
                      title={
                        row.canEnd
                          ? "结束任务：当场击杀，掉落照常"
                          : "血量降到 25% 以下才能结束"
                      }
                      className={cn(
                        "flex items-center gap-1 rounded border px-2 py-1 font-mono text-xs touch-manipulation transition active:scale-95 focus-visible:outline-none",
                        row.canEnd
                          ? "border-destructive/60 text-destructive hover:bg-destructive/10"
                          : "border-border text-muted-foreground/50",
                      )}
                    >
                      <Skull className="h-3 w-3" />
                      结束
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction("throttle", row.uid)}
                      title="限制进程：本层它出手速度减半"
                      className="flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-xs text-muted-foreground touch-manipulation transition hover:border-sys-network hover:text-sys-network active:scale-95 focus-visible:outline-none"
                    >
                      <Gauge className="h-3 w-3" />
                      限制
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>

          {/* 自家进程：优化攻击 / 回收后台 */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onAction("boost", null)}
              className="rounded-md border border-primary/50 bg-primary/5 px-3 py-2 text-left transition hover:bg-primary/15 active:scale-[0.99] focus-visible:outline-none focus-visible:shadow-focus"
            >
              <span className="font-display text-base font-bold text-primary">
                优化「攻击.exe」
              </span>
              <span className="block font-mono text-xs text-muted-foreground">
                8 秒内自己出手快 15%
              </span>
            </button>
            <button
              type="button"
              onClick={() => onAction("reclaim", null)}
              className="rounded-md border border-border px-3 py-2 text-left transition hover:border-sys-cache active:scale-[0.99] focus-visible:outline-none focus-visible:shadow-focus"
            >
              <span className="flex items-center gap-1.5 font-display text-base font-bold">
                <MemoryStick className="h-4 w-4 text-sys-cache" />
                回收后台进程
              </span>
              <span className="block font-mono text-xs text-muted-foreground">
                立刻 +2 内存
              </span>
            </button>
            {/* 深化包第 5 操作：磁盘整理——占用本层唯一一次动手机会，清空全部碎片 */}
            <button
              type="button"
              disabled={memFrags <= 0}
              onClick={() => onAction("defrag", null)}
              title={
                memFrags > 0
                  ? "磁盘整理：清空全部碎片，下次进层回满的水位更高（占用本层动手机会）"
                  : "身上没有碎片，整理无从谈起"
              }
              className={cn(
                "rounded-md border px-3 py-2 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:shadow-focus sm:col-span-2",
                memFrags > 0
                  ? "border-primary/50 bg-primary/5 hover:bg-primary/15"
                  : "cursor-not-allowed border-border opacity-60",
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-1.5 font-display text-base font-bold",
                  memFrags > 0 ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Wrench className="h-4 w-4" />
                磁盘整理 · 清除全部碎片（当前 🧩 ×{memFrags}）
              </span>
              <span className="block font-mono text-xs text-muted-foreground">
                整理后下次进层回满的水位更高；它会占用本层唯一一次动手机会
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="mt-3 w-full rounded-md border border-dashed border-border px-3 py-2 font-mono text-xs text-muted-foreground touch-manipulation transition hover:text-foreground active:scale-[0.99] focus-visible:outline-none"
          >
            只看看，什么都不动（已花的 2 内存不退，本层还能再开）
          </button>
        </div>
      </div>
    </div>
  )
}
