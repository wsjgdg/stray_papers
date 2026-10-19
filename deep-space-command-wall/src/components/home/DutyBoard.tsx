// 值班指令面板：功勋值 + 值班军衔 + 当前限时指令（进度 / 倒计时条 / 奖励）。
// 指令由 useHome 随机下发, 完成赚功勋升军衔; 颜色全部 token 类。
import { Medal, ScrollText } from "lucide-react";

export interface DutyTaskView {
  desc: string;
  progress: number;
  target: number;
  remainS: number;
  totalS: number;
  reward: number;
  /** 连环任务链：当前环序号 / 总环数 / 全链贯通追加功勋（单条指令为空） */
  chainPos?: number;
  chainLen?: number;
  chainBonus?: number;
}

export interface DutyRankDef {
  min: number;
  name: string;
  en: string;
}

/** 值班军衔阶梯（功勋值门槛, 800 = 值班指挥官成就线） */
export const DUTY_RANKS: DutyRankDef[] = [
  { min: 0, name: "值班学员", en: "CADET" },
  { min: 60, name: "三等值班员", en: "OPERATOR III" },
  { min: 150, name: "二等值班员", en: "OPERATOR II" },
  { min: 300, name: "一等值班员", en: "OPERATOR I" },
  { min: 500, name: "值班指挥官长", en: "CHIEF DUTY" },
  { min: 800, name: "值班指挥官", en: "COMMANDER" },
];

export function dutyRankAt(merit: number): DutyRankDef {
  let rank = DUTY_RANKS[0];
  for (const r of DUTY_RANKS) if (merit >= r.min) rank = r;
  return rank;
}

interface DutyBoardProps {
  merit: number;
  task: DutyTaskView | null;
  doneCount: number;
}

export function DutyBoard({ merit, task, doneCount }: DutyBoardProps) {
  const rank = dutyRankAt(merit);
  const next = DUTY_RANKS.find((r) => r.min > merit);
  const spanPrev = rank.min;
  const spanNext = next ? next.min : rank.min + 1;
  const rankPct = next ? Math.max(2, Math.min(100, ((merit - spanPrev) / (spanNext - spanPrev)) * 100)) : 100;
  return (
    <section
      aria-label="值班指令面板"
      className="mt-4 rounded-lg border border-border bg-card p-3 shadow-md animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-xs tracking-widest text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          DUTY · 值班指令
        </p>
        <span className="rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-primary" title="累计功勋值">
          功勋 {merit}
        </span>
      </div>
      {/* 军衔 + 晋升进度 */}
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-sm">
          <Medal className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-bold text-card-foreground">{rank.name}</p>
            <p className="shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">
              {next ? `下一阶 ${next.min}` : "最高军衔"}
            </p>
          </div>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${rankPct}%` }} />
          </div>
        </div>
      </div>
      {/* 当前指令 */}
      {task ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-medium text-card-foreground">
              {task.chainPos && task.chainLen ? (
                <span
                  className="mr-1.5 inline-block rounded-sm border border-primary bg-primary px-1 py-px font-mono text-[10px] font-bold tracking-widest text-primary-foreground"
                  title={`连环指令第 ${task.chainPos} 环, 共 ${task.chainLen} 环, 全部贯通追加 ${task.chainBonus} 功勋`}
                >
                  CHAIN {task.chainPos}/{task.chainLen}
                </span>
              ) : null}
              {task.desc}
            </p>
            <span
              className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
                task.remainS <= 10
                  ? "countdown-urgent border-destructive bg-destructive text-destructive-foreground"
                  : "border-primary/50 bg-primary/10 text-primary"
              }`}
            >
              T-{task.remainS}s
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, (task.remainS / task.totalS) * 100))}%`, transitionTimingFunction: "linear" }}
              />
            </div>
            <span className="shrink-0 font-mono text-xs tabular-nums text-primary">
              {Math.min(task.progress, task.target)}/{task.target}
            </span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              +{task.reward} 功勋{task.chainPos && task.chainLen && task.chainPos === task.chainLen && task.chainBonus ? ` · 贯通再 +${task.chainBonus}` : ""}
            </span>
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border bg-background/60 px-3 py-2 text-center text-xs text-muted-foreground/70">
          待命中 · 下一条值班指令即将下发{doneCount > 0 ? `（已完成 ${doneCount} 条）` : ""}
        </p>
      )}
    </section>
  );
}
