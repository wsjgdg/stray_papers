import type { GroundStation } from "@/pages/Home/useHome";

interface GroundStationBarProps {
  stationList: GroundStation[];
  /** 链路标题（地月链路 / 地火链路） */
  linkZh: string;
  linkEn: string;
  missionCode: string;
  missionTitle: string;
  /** 气动黑障区：信号中断, 全链路 LOSS OF SIGNAL */
  signalLoss: boolean;
  /** 火星沙尘暴进行中：显示 DUST STORM 徽标（链路速率已在 Logic 层压降） */
  dustStorm: boolean;
  /** 全球级沙尘暴：GLOBAL STORM 徽标（红色描边, 比 DUST STORM 更醒目） */
  globalStorm: boolean;
}

export function GroundStationBar({ stationList, linkZh, linkEn, missionCode, missionTitle, signalLoss, dustStorm, globalStorm }: GroundStationBarProps) {
  return (
    <footer className="border-t border-border bg-card/50">
      {/* 链路数据流光带：正常时 primary 流动, 黑障/全球风暴时变红停流 */}
      <div
        className={`h-0.5 w-full ${signalLoss || globalStorm ? "link-flow-line-dead" : "link-flow-line"}`}
        aria-hidden="true"
      />
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
        <div className="shrink-0">
          <p className="text-sm font-medium text-foreground">{linkZh}</p>
          <p className="font-mono text-xs tracking-widest text-muted-foreground">{linkEn}</p>
        </div>
        {stationList.map((station) => (
          <div
            key={station.stationKey}
            className={`flex items-center gap-3 rounded-lg border bg-background/60 px-4 py-2 shadow-sm transition-shadow hover:shadow-md ${
              signalLoss || globalStorm ? "border-destructive/60" : "border-border"
            }`}
          >
            <span className="relative flex h-2.5 w-2.5">
              {!signalLoss && station.online && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  signalLoss
                    ? "animate-pulse bg-destructive"
                    : station.online
                      ? "bg-primary"
                      : "bg-muted-foreground/40"
                }`}
              />
            </span>
            <div className="leading-tight">
              <p className="text-sm text-foreground">
                {station.stationName}
                <span className="ml-2 font-mono text-xs text-muted-foreground">{station.code}</span>
              </p>
              <p className="font-mono text-xs tabular-nums">
                {signalLoss ? (
                  <span className="animate-pulse font-bold tracking-widest text-destructive">LOSS OF SIGNAL</span>
                ) : station.online ? (
                  <span className="text-primary">ONLINE · {station.linkRate.toFixed(0)} Mbps</span>
                ) : (
                  <span className="text-muted-foreground">STANDBY · 等待过境</span>
                )}
              </p>
            </div>
          </div>
        ))}
        {signalLoss && (
          <span className="animate-pulse rounded-full border border-destructive bg-destructive/10 px-3 py-1 font-mono text-xs font-bold tracking-widest text-destructive shadow-sm">
            黑障区 · 信号中断
          </span>
        )}
        {globalStorm && !signalLoss && (
          <span className="animate-pulse rounded-full border-2 border-destructive bg-destructive/15 px-3 py-1 font-mono text-xs font-bold tracking-widest text-destructive shadow-md">
            GLOBAL STORM · 全球沙尘暴 · 链路濒危
          </span>
        )}
        {dustStorm && !globalStorm && !signalLoss && (
          <span className="animate-pulse rounded-full border border-destructive bg-destructive/10 px-3 py-1 font-mono text-xs font-bold tracking-widest text-destructive shadow-sm">
            DUST STORM · 沙尘暴 · 链路降速
          </span>
        )}
        <p className="ml-auto hidden font-mono text-xs tracking-widest text-muted-foreground lg:block">
          MISSION CONTROL · {missionCode} {missionTitle} · 模拟遥测演示
        </p>
      </div>
    </footer>
  );
}
