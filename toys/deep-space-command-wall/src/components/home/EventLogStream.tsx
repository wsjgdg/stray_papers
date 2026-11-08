import { useEffect, useRef } from "react";
import type { LogEntry, MissionLevel } from "@/pages/Home/useHome";

interface EventLogStreamProps {
  logEntries: LogEntry[];
  alarmActive: boolean;
  onAckAlarm: () => void;
}

const LEVEL_DOT: Record<MissionLevel, string> = {
  nominal: "bg-primary/70",
  caution: "bg-foreground",
  critical: "bg-destructive animate-pulse",
};

const LEVEL_TEXT: Record<MissionLevel, string> = {
  nominal: "text-secondary-foreground",
  caution: "text-foreground font-medium",
  critical: "text-destructive font-medium",
};

export function EventLogStream({ logEntries, alarmActive, onAckAlarm }: EventLogStreamProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logEntries.length]);

  // 只对最新一条进行中的警报行提供处置按钮
  let lastAlarmId = -1;
  for (const entry of logEntries) {
    if (entry.system === "ALARM" && entry.level !== "nominal") lastAlarmId = entry.id;
  }

  return (
    <section aria-label="事件日志" className="flex h-full min-h-80 flex-col rounded-lg border border-border bg-card shadow-lg">
      <div className="flex min-h-12 shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-medium text-card-foreground">事件日志</h2>
        <p className="font-mono text-xs tracking-widest text-muted-foreground">EVENT LOG · LIVE FEED</p>
      </div>
      {/* 日志流每秒多条, 不做 aria-live（读屏会被刷屏）; 警报走 HomePage 的独立断言级播报区 */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {logEntries.length === 0 && (
          <p className="animate-pulse py-4 text-center font-mono text-xs text-muted-foreground">等待遥测事件 ...</p>
        )}
        {logEntries.map((entry) => (
          <div
            key={entry.id}
            className={`animate-in fade-in slide-in-from-bottom-1 flex items-start gap-2 rounded-md border px-2 py-1.5 font-mono text-xs duration-300 ${
              entry.id === lastAlarmId && alarmActive
                ? "border-destructive/50 bg-destructive/10"
                : "border-transparent bg-secondary/40"
            } ${entry.id === logEntries[logEntries.length - 1].id ? "log-row-flash" : ""}`}
          >
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[entry.level]}`} />
            <span className="shrink-0 tabular-nums text-muted-foreground">{entry.stamp}</span>
            <span className="shrink-0 rounded-sm border border-border px-1 text-primary">{entry.system}</span>
            <span className={`min-w-0 flex-1 break-all font-sans ${LEVEL_TEXT[entry.level]}`}>{entry.message}</span>
            {entry.id === lastAlarmId && alarmActive && (
              <button
                type="button"
                onClick={onAckAlarm}
                aria-label="处置确认该警报"
                title="处置 ACK · 立即解除警报"
                className="shrink-0 rounded-sm border border-destructive/60 bg-destructive/10 px-1.5 py-0.5 font-bold tracking-wider text-destructive transition hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring"
              >
                处置 ACK
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
