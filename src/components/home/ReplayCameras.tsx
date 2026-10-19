// 回放多机位布局：CAM-2 遥测仪表位 / CAM-3 雷达链路位 / CAM-4 事件日志位。
// 各机位共用同一回放快照数据（p.metrics / p.stationList / p.logEntries 在回放中即快照下发值）。
import { EventLogStream } from "@/components/home/EventLogStream";
import { RadarScope } from "@/components/home/RadarScope";
import { TelemetryPanel } from "@/components/home/TelemetryPanel";
import type { GroundStation, LogEntry, TelemetryMetric } from "@/pages/Home/useHome";

interface ReplayCamTelemetryProps {
  metrics: TelemetryMetric[];
  phaseLabelEn: string;
  onOpenMetric: (key: string) => void;
}

function bigReadout(metric: TelemetryMetric | undefined) {
  if (!metric) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3 shadow-md">
      <p className="text-xs text-muted-foreground">
        {metric.label} <span className="font-mono tracking-widest">{metric.labelEn}</span>
      </p>
      <p className="font-mono text-4xl font-bold tabular-nums leading-tight text-primary lg:text-5xl">
        {metric.display}
        <span className="ml-1.5 text-sm font-normal text-muted-foreground">{metric.unit}</span>
      </p>
    </div>
  );
}

/** CAM-2 遥测仪表位：高度/速度大字读数 + 全指标网格放大 */
export function ReplayCamTelemetry({ metrics, phaseLabelEn, onOpenMetric }: ReplayCamTelemetryProps) {
  const alt = metrics.find((m) => m.key === "altitude");
  const vel = metrics.find((m) => m.key === "velocity");
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <header className="flex shrink-0 items-baseline justify-between">
        <h2 className="text-sm font-medium text-card-foreground">
          CAM-2 <span className="text-primary">·</span> 遥测仪表位
        </h2>
        <p className="font-mono text-xs tracking-widest text-muted-foreground">TELEMETRY GRID · {phaseLabelEn}</p>
      </header>
      <div className="grid shrink-0 grid-cols-2 gap-3">
        {bigReadout(alt)}
        {bigReadout(vel)}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {metrics.map((metric) => (
          <TelemetryPanel key={metric.key} metric={metric} alarmLevel="nominal" lit onOpen={onOpenMetric} />
        ))}
      </div>
    </div>
  );
}

interface ReplayCamRadarProps {
  metrics: TelemetryMetric[];
  stationList: GroundStation[];
}

function linkReadout(metric: TelemetryMetric | undefined) {
  if (!metric) return null;
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 shadow-sm">
      <p className="font-mono text-xs tracking-widest text-muted-foreground">{metric.labelEn}</p>
      <p className="font-mono text-xl font-bold tabular-nums leading-tight text-primary">
        {metric.display}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{metric.unit}</span>
      </p>
    </div>
  );
}

/** CAM-3 雷达位：雷达扫描放大 + 地月链路与地面站状态 */
export function ReplayCamRadar({ metrics, stationList }: ReplayCamRadarProps) {
  const sig = metrics.find((m) => m.key === "signal");
  const delay = metrics.find((m) => m.key === "lightDelay");
  return (
    <div className="flex h-full flex-col items-center gap-3 overflow-y-auto p-4">
      <header className="flex w-full shrink-0 items-baseline justify-between">
        <h2 className="text-sm font-medium text-card-foreground">
          CAM-3 <span className="text-primary">·</span> 雷达链路位
        </h2>
        <p className="font-mono text-xs tracking-widest text-muted-foreground">RADAR SWEEP · EARTH–MOON LINK</p>
      </header>
      <div className="h-48 w-48 shrink-0 lg:h-64 lg:w-64">
        <RadarScope />
      </div>
      <div className="grid w-full max-w-lg shrink-0 grid-cols-2 gap-2">
        {linkReadout(sig)}
        {linkReadout(delay)}
      </div>
      <ul className="w-full max-w-lg shrink-0 space-y-1.5">
        {stationList.map((station) => (
          <li
            key={station.stationKey}
            className="flex items-center justify-between rounded-md border border-border bg-background/70 px-3 py-1.5 font-mono text-xs shadow-sm"
          >
            <span className="text-card-foreground">
              {station.stationName} <span className="text-muted-foreground">· {station.code}</span>
            </span>
            {station.online ? (
              <span className="tabular-nums text-primary">
                在线 · {station.linkRate.toFixed(0)} Mbps
              </span>
            ) : (
              <span className="text-muted-foreground">离线 · NO LOCK</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ReplayCamLogProps {
  logEntries: LogEntry[];
}

/** CAM-4 事件日志位：日志流放大（回放进度处按帧截断重现） */
export function ReplayCamLog({ logEntries }: ReplayCamLogProps) {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <header className="flex shrink-0 items-baseline justify-between px-1">
        <h2 className="text-sm font-medium text-card-foreground">
          CAM-4 <span className="text-primary">·</span> 事件日志位
        </h2>
        <p className="font-mono text-xs tracking-widest text-muted-foreground">EVENT LOG · REPLAY TIMELINE</p>
      </header>
      <div className="min-h-0 flex-1">
        <EventLogStream logEntries={logEntries} alarmActive={false} onAckAlarm={() => undefined} />
      </div>
    </div>
  );
}
