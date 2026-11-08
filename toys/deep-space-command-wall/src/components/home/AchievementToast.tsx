import type { AchievementDef } from "@/lib/achievements";

interface AchievementToastProps {
  /** 当前弹出的成就（null 不渲染）；key 换 id 重触发 3 秒淡出动画 */
  achievement: AchievementDef | null;
  /** 解锁时所属任务徽标（L9 / A1） */
  missionBadge: string;
}

export function AchievementToast({ achievement, missionBadge }: AchievementToastProps) {
  if (!achievement) return null;
  const Icon = achievement.icon;
  return (
    <div
      key={achievement.id}
      className="pointer-events-none fixed right-4 top-20 z-50 lg:right-6"
      role="status"
      aria-live="polite"
    >
      {/* 外层滑入淡出 + 内层弹性缩放, 两层动画分开避免 transform 冲突 */}
      <div className="animate-achievement-toast">
        <div className="toast-pop flex items-center gap-3 rounded-lg border border-primary/50 bg-card px-4 py-3 shadow-xl">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-md">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-xs tracking-widest text-muted-foreground">成就解锁 · ACHIEVEMENT</p>
            <p className="truncate text-sm font-bold text-card-foreground">{achievement.name}</p>
          </div>
          <span className="shrink-0 rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-primary">
            {missionBadge}
          </span>
        </div>
      </div>
    </div>
  );
}
