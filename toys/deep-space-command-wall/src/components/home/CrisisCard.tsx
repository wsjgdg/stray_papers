// 航行突发事件卡：转移/制动段弹出的二选一处置卡, 倒计时归零自动执行默认预案。
// 挂在主视口内（absolute）, 红边脉冲强调; 颜色全部 token 类。
import { AlertTriangle } from "lucide-react";
import type { CrisisEvent } from "@/lib/crisisEvents";

interface CrisisCardProps {
  event: CrisisEvent;
  /** 剩余决策秒数 */
  remainS: number;
  /** 决策总时长（倒计时条比例用） */
  totalS: number;
  /** 三连危机链：当前环序号 / 总环数（单发事件为空） */
  chainPos?: number;
  chainLen?: number;
  onChoose: (idx: 0 | 1) => void;
}

export function CrisisCard({ event, remainS, totalS, chainPos, chainLen, onChoose }: CrisisCardProps) {
  const urgent = remainS <= 4;
  return (
    <div className="pointer-events-auto absolute inset-x-4 bottom-4 z-40 mx-auto max-w-xl animate-in fade-in slide-in-from-bottom-6 duration-300">
      <div
        className={`overflow-hidden rounded-lg border-2 bg-card/95 shadow-xl backdrop-blur ${
          urgent ? "border-destructive" : "border-destructive/60"
        } ${urgent ? "countdown-urgent" : ""}`}
        role="alertdialog"
        aria-label={`突发事件: ${event.title}`}
      >
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="font-display text-sm font-bold text-destructive">突发事件 · {event.title}</p>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground">{event.titleEn}</p>
          {chainPos && chainLen ? (
            <span
              className="countdown-urgent rounded-sm border border-destructive bg-destructive px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-destructive-foreground"
              title={`连锁故障第 ${chainPos} 环, 共 ${chainLen} 环, 全环明智处置解锁稀有成就`}
            >
              危机链 {chainPos}/{chainLen}
            </span>
          ) : null}
          <span
            className={`ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
              urgent
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-destructive/50 bg-destructive/10 text-destructive"
            }`}
          >
            决策 T-{remainS}s
          </span>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm leading-relaxed text-card-foreground">{event.desc}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {event.options.map((opt, i) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => onChoose(i as 0 | 1)}
                className={`rounded-md border px-3 py-2 text-left text-sm font-medium shadow-sm transition active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                  i === 0
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border-border bg-background text-card-foreground hover:border-primary/60 hover:text-primary"
                }`}
              >
                <span className="mr-1.5 font-mono text-xs tracking-widest opacity-70">{i === 0 ? "A" : "B"}</span>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${urgent ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${Math.max(0, Math.min(100, (remainS / totalS) * 100))}%`, transitionTimingFunction: "linear" }}
            />
          </div>
          <p className="mt-1.5 text-center font-mono text-[10px] tracking-widest text-muted-foreground">
            超时未决 → 自动执行 A 预案
          </p>
        </div>
      </div>
    </div>
  );
}
