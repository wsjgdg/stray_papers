import type { MissionLevel, TelemetryMetric } from "@/pages/Home/useHome";
import { Sparkline } from "@/components/home/Sparkline";

interface TelemetryPanelProps {
  metric: TelemetryMetric;
  alarmLevel: MissionLevel;
  lit: boolean;
  onOpen: (key: string) => void;
}

const ALARM_BORDER: Record<MissionLevel, string> = {
  nominal: "border-border",
  caution: "border-foreground/70 animate-pulse",
  critical: "border-destructive animate-pulse",
};

const ALARM_CHIP: Record<Exclude<MissionLevel, "nominal">, { text: string; cls: string }> = {
  caution: { text: "CAUTION", cls: "border-foreground/60 text-foreground" },
  critical: { text: "CRITICAL", cls: "border-destructive text-destructive" },
};

export function TelemetryPanel({ metric, alarmLevel, lit, onOpen }: TelemetryPanelProps) {
  const alarmed = alarmLevel !== "nominal";
  // 扫描线错峰：按指标 key 派生固定 delay, 避免 16 块面板同帧齐扫
  const scanDelay = ((metric.key.charCodeAt(0) + metric.key.length) % 7) * 1.1;
  return (
    <button
      type="button"
      onClick={() => onOpen(metric.key)}
      className={`group relative flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card p-4 text-left shadow-lg transition-all duration-500 hover:-translate-y-1 hover:border-primary/60 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${ALARM_BORDER[alarmLevel]} ${
        lit ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      {lit && (
        <span
          className="telemetry-scan pointer-events-none absolute inset-x-0 top-0 h-14"
          style={{ animationDelay: `${scanDelay}s` }}
          aria-hidden="true"
        />
      )}
      <div className="flex min-h-6 shrink-0 items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-card-foreground">{metric.label}</p>
          <p className="font-mono text-xs tracking-widest text-muted-foreground">{metric.labelEn}</p>
        </div>
        {alarmed && (
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-xs tracking-wider ${ALARM_CHIP[alarmLevel as Exclude<MissionLevel, "nominal">].cls}`}
          >
            {ALARM_CHIP[alarmLevel as Exclude<MissionLevel, "nominal">].text}
          </span>
        )}
      </div>

      <div className="mt-2 shrink-0">
        <p className="font-mono text-2xl font-bold tabular-nums leading-tight text-primary">
          {metric.display}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{metric.unit}</span>
        </p>
      </div>

      <div className="mt-auto pt-2 opacity-80 transition-opacity group-hover:opacity-100">
        <Sparkline series={metric.series} />
      </div>
    </button>
  );
}
