// 成就目标提示卡（批次 Q, 批次 R 轮换升级）：主线面板下方的窄条卡——取清单序前 3 枚
// 未解锁成就作目标池, 每 6 秒自动轮换展示（悬停暂停, 页点指示）, 附解锁进度计数与稀有标记;
// 整卡点击打开成就墙。全部解锁后自动消失。颜色全部 token 类。
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AchievementDef } from "@/lib/achievements";

interface GoalHintCardProps {
  list: AchievementDef[];
  /** 已解锁成就映射（键存在即已解锁, 值结构不关心） */
  unlockedMap: Record<string, unknown>;
  onOpenWall: () => void;
}

/** 轮换池大小与轮换间隔 */
const POOL_SIZE = 3;
const ROTATE_MS = 6000;

export function GoalHintCard({ list, unlockedMap, onOpenWall }: GoalHintCardProps) {
  const locked = list.filter((a) => !unlockedMap[a.id]);
  const pool = locked.slice(0, POOL_SIZE);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (pool.length <= 1 || paused) return;
    const timer = window.setInterval(() => setIdx((i) => (i + 1) % pool.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [pool.length, paused]);

  if (locked.length === 0) return null; // 全成就达成, 不再提示
  const safeIdx = idx % pool.length;
  const goal = pool[safeIdx];
  const unlockedCount = list.length - locked.length;
  const GoalIcon = goal.icon;

  return (
    <section
      aria-label="成就目标提示"
      className="mx-auto w-full max-w-screen-2xl px-4 pt-2 animate-in fade-in duration-700"
    >
      <button
        type="button"
        onClick={onOpenWall}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        aria-label={`成就目标 ${goal.name}, 点击打开成就墙`}
        title={`每 ${ROTATE_MS / 1000} 秒轮换展示最近 ${pool.length} 个未解锁目标（悬停暂停）· 点击打开成就墙查看全部`}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-left shadow-md transition hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
      >
        {/* key 换目标即重挂载, 图标与文案带上浮淡入 */}
        <span key={goal.id} className="flex min-w-0 flex-1 items-center gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary">
            <GoalIcon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-mono text-[10px] font-bold tracking-[0.3em] text-primary">
                成就目标 · NEXT GOALS
              </span>
              <span className="rounded-full border border-border bg-background px-1.5 py-px font-mono text-[9px] tabular-nums text-muted-foreground">
                已解锁 {unlockedCount}/{list.length}
              </span>
              {locked.length > pool.length && (
                <span className="font-mono text-[9px] tabular-nums text-muted-foreground/70">
                  还有 {locked.length - pool.length} 个目标排队中
                </span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-card-foreground">
              {goal.name}
              {goal.rare && (
                <span className="rounded-sm border border-primary/50 bg-primary/10 px-1 py-px font-mono text-[9px] font-bold tracking-widest text-primary">
                  RARE
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-[10px] leading-relaxed text-muted-foreground">{goal.desc}</span>
          </span>
        </span>
        {pool.length > 1 && (
          <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
            {pool.map((a, i) => (
              <span
                key={a.id}
                className={`h-1 rounded-full transition-all duration-300 ${i === safeIdx ? "w-3 bg-primary" : "w-1 bg-border"}`}
              />
            ))}
          </span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </section>
  );
}
