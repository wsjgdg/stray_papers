// 每日挑战弹层：展示当日确定性挑战（天体 + 1–2 条修饰条件）、完成状态与生涯连击,
// 底部「开始挑战」按钮切到当日天体并挂上修饰。结构对齐生涯统计弹层（全屏遮罩 + zoom-in 卡片）,
// ESC 链由 useHome 统一接管。纯展示组件, 快照与动作全部来自 Logic 层 props。
import { CalendarCheck, Flame, Trophy, Play, BadgeCheck } from "lucide-react";
import { MISSIONS } from "@/lib/missions";
import type { DailyChallengeSnap } from "@/pages/Home/useHome";
import { Button } from "@/components/ui/button";

interface DailyChallengeProps {
  open: boolean;
  /** 打开弹层瞬间由 Logic 层构建的当日挑战快照（关闭态为 null） */
  snap: DailyChallengeSnap | null;
  onClose: () => void;
  /** 开始今日挑战: 切换到当日天体 + 挂修饰条件 */
  onStart: () => void;
}

/** 统计小格（对齐生涯统计 StatTile: 数值 primary 强调） */
function DailyTile({ label, value, sub, delayMs }: { label: string; value: string; sub?: string; delayMs: number }) {
  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className="ach-card-in flex flex-col gap-0.5 rounded-md border border-border bg-background p-3 shadow-sm"
    >
      <p className="font-mono text-xs tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono text-xl font-bold tabular-nums text-primary">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function DailyChallenge({ open, snap, onClose, onStart }: DailyChallengeProps) {
  if (!open || !snap) return null;
  const mission = MISSIONS[snap.info.missionId];
  const disabled = snap.doneToday || snap.inProgress || !snap.canStart;
  const reason = snap.doneToday
    ? "今日挑战已完成 —— 连击已入账, 明天同一时刻换新挑战。"
    : snap.inProgress
      ? "每日挑战进行中 —— 完成当日天体的着陆与配额条件即结算。"
      : !snap.canStart
        ? "仅在待发射状态可开始 —— 着陆前 / 任务回放中不可切换挑战。"
        : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col animate-in fade-in zoom-in-95 rounded-lg border border-primary/40 bg-card p-6 shadow-xl duration-300"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="每日挑战"
      >
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-md">
              <CalendarCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold text-card-foreground">
                每日挑战 <span className="text-primary">·</span> DAILY
              </h2>
              <p className="mt-0.5 font-mono text-xs tracking-widest text-muted-foreground">
                {snap.info.dateKey} · SEED {snap.info.seed} · 全天同一套条件
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="border-border font-mono focus-visible:shadow-focus">
            关闭 ESC
          </Button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {/* 今日天体 */}
          <section
            aria-label="今日天体"
            className="flex items-center gap-3 rounded-lg border border-primary/30 bg-background/50 p-4 shadow-sm"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary/10 font-display text-sm font-bold text-primary shadow-md">
              {mission.badge}
            </span>
            <div className="min-w-0">
              <p className="font-mono text-lg font-bold tracking-widest text-primary">{mission.code}</p>
              <p className="text-xs text-muted-foreground">{mission.title}</p>
            </div>
            {snap.doneToday && (
              <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2 py-1 font-mono text-xs font-bold text-primary">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                今日已完成
              </span>
            )}
          </section>

          {/* 修饰条件 */}
          <section aria-label="今日修饰条件" className="mt-4">
            <p className="mb-2 font-mono text-xs tracking-widest text-muted-foreground">今日条件 · MODIFIERS</p>
            <div className="space-y-2">
              {snap.info.modifiers.map((mod) => (
                <div
                  key={mod.id}
                  className="rounded-md border border-border bg-background px-3 py-2 shadow-sm"
                >
                  <p className="font-mono text-sm font-bold text-card-foreground">
                    {mod.name} <span className="text-xs tracking-widest text-primary">{mod.en}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{mod.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 生涯连击 */}
          <section aria-label="挑战生涯数据" className="mt-4">
            <p className="mb-2 font-mono text-xs tracking-widest text-muted-foreground">挑战生涯 · STREAK</p>
            <div className="grid grid-cols-3 gap-2">
              <DailyTile label="累计完成" value={`${snap.completions}`} delayMs={0} />
              <DailyTile label="当前连击" value={`${snap.streak}`} sub="连续天数" delayMs={60} />
              <DailyTile label="历史最佳" value={`${snap.bestStreak}`} sub="最长连击" delayMs={120} />
            </div>
          </section>

          {/* 达标说明 */}
          <p className="mt-3 flex items-start gap-2 rounded-md border border-dashed border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
            <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            达标条件：驾驶当日天体完成软着陆, 并满足全部修饰条件（金星须在生存窗口内撤离）。中途失败或切换任务视为放弃, 不影响已有连击。
          </p>
        </div>

        <div className="mt-4 flex shrink-0 items-center gap-3">
          <Button
            onClick={onStart}
            disabled={disabled}
            className="flex-1 gap-2 bg-primary font-mono tracking-widest text-primary-foreground shadow-md focus-visible:shadow-focus hover:bg-primary/90 disabled:opacity-50"
          >
            {snap.doneToday ? (
              <>
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                今日已完成 ✓
              </>
            ) : snap.inProgress ? (
              <>
                <Trophy className="h-4 w-4" aria-hidden="true" />
                挑战进行中
              </>
            ) : (
              <>
                <Play className="h-4 w-4" aria-hidden="true" />
                开始挑战
              </>
            )}
          </Button>
        </div>
        {reason && <p className="mt-2 shrink-0 text-center text-xs text-muted-foreground">{reason}</p>}
      </div>
    </div>
  );
}
