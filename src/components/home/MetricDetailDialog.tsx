import type { LogEntry, TelemetryMetric } from "@/pages/Home/useHome";
import { Sparkline } from "@/components/home/Sparkline";
import { Button } from "@/components/ui/button";

interface MetricDetailDialogProps {
  metric: TelemetryMetric | null;
  logEntries: LogEntry[];
  onClose: () => void;
}

export function MetricDetailDialog({ metric, logEntries, onClose }: MetricDetailDialogProps) {
  if (!metric) return null;
  const series = metric.series;
  let min = series[0] ?? 0;
  let max = series[0] ?? 0;
  for (const v of series) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const recent = logEntries.slice(-8).reverse();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto animate-in fade-in zoom-in-95 rounded-lg border border-primary/40 bg-card p-4 shadow-xl duration-300 sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${metric.label} 详情`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-card-foreground">
              {metric.label}
              <span className="ml-2 font-mono text-sm font-normal tracking-widest text-muted-foreground">
                {metric.labelEn}
              </span>
            </h2>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-primary">
              {metric.display}
              <span className="ml-1 text-sm font-normal text-muted-foreground">{metric.unit}</span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-border font-mono focus-visible:shadow-focus"
          >
            关闭 ESC
          </Button>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background/50 p-4">
          <p className="mb-2 font-mono text-xs tracking-widest text-muted-foreground">近 60 秒走势 · TREND</p>
          <Sparkline series={series} big />
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-xs">
            <div className="rounded-md bg-secondary/60 px-3 py-2">
              <p className="text-muted-foreground">MIN</p>
              <p className="tabular-nums text-card-foreground">{min.toFixed(metric.decimals)}</p>
            </div>
            <div className="rounded-md bg-secondary/60 px-3 py-2">
              <p className="text-muted-foreground">MAX</p>
              <p className="tabular-nums text-card-foreground">{max.toFixed(metric.decimals)}</p>
            </div>
            <div className="rounded-md bg-secondary/60 px-3 py-2">
              <p className="text-muted-foreground">NOW</p>
              <p className="tabular-nums text-primary">{metric.display}</p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 font-mono text-xs tracking-widest text-muted-foreground">最近事件 · RECENT EVENTS</p>
          <div className="space-y-1.5">
            {recent.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 rounded-md bg-secondary/40 px-3 py-1.5 font-mono text-xs">
                <span className="shrink-0 tabular-nums text-muted-foreground">{entry.stamp}</span>
                <span className="shrink-0 rounded-sm border border-border px-1 text-primary">{entry.system}</span>
                <span className="min-w-0 break-all font-sans text-secondary-foreground">{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
