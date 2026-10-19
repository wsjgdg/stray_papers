import { Flame } from "lucide-react";

interface LaunchControlProps {
  flightActive: boolean;
  coverOpen: boolean;
  onToggleCover: () => void;
  onIgnite: () => void;
  countdownText: string;
  phaseLabel: string;
  missionCode: string;
}

export function LaunchControl({ flightActive, coverOpen, onToggleCover, onIgnite, countdownText, phaseLabel, missionCode }: LaunchControlProps) {
  if (flightActive) {
    return (
      <div className="pointer-events-none rounded-lg border border-primary/60 bg-card/90 px-5 py-3 shadow-lg backdrop-blur">
        <p className="font-mono text-xs tracking-widest text-muted-foreground">LAUNCH SEQUENCE · COMPLETE</p>
        <p className="mt-1 font-display text-lg font-bold text-primary">
          点火完成 <span className="ml-2 rounded-full border border-primary bg-primary/10 px-2 py-0.5 font-mono text-xs tracking-widest">{phaseLabel}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto w-72 max-w-full rounded-lg border border-primary/60 bg-card/95 p-4 shadow-xl backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-xs tracking-widest text-muted-foreground">LAUNCH SEQUENCE</p>
        <p className="font-mono text-sm font-bold tabular-nums text-primary">{countdownText}</p>
      </div>
      <p className="mt-1 font-display text-base font-bold text-card-foreground">点火发射 · {missionCode}</p>

      <div className="relative mt-3 h-16">
        <button
          type="button"
          onClick={onIgnite}
          disabled={!coverOpen}
          aria-label="点火发射"
          className={`absolute inset-0 flex items-center justify-center gap-2 rounded-md bg-primary font-display text-lg font-bold tracking-widest text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40 ${
            coverOpen ? "ignite-armed" : ""
          }`}
        >
          <Flame className={`h-5 w-5 ${coverOpen ? "animate-pulse" : ""}`} aria-hidden="true" />
          点火 IGNITE
        </button>

        <button
          type="button"
          onClick={onToggleCover}
          aria-label={coverOpen ? "合上安全盖" : "掀开安全盖"}
          aria-expanded={coverOpen}
          style={{
            transform: coverOpen ? "perspective(360px) rotateX(-112deg)" : "perspective(360px) rotateX(0deg)",
            transformOrigin: "top center",
            backfaceVisibility: "hidden",
          }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-0.5 rounded-md border-2 border-primary bg-secondary text-secondary-foreground shadow-md transition-transform duration-500 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="font-mono text-xs font-bold tracking-widest text-primary">SAFETY COVER</span>
          <span className="text-xs text-secondary-foreground">{coverOpen ? "点击合上安全盖" : "点击掀开安全盖"}</span>
        </button>
      </div>

      <p className={`mt-2 font-mono text-xs tracking-wider ${coverOpen ? "text-primary" : "text-muted-foreground"}`}>
        {coverOpen ? "安全盖已打开 — 等待点火指令" : "第一步: 掀开安全盖 · 第二步: 按下点火"}
      </p>
    </div>
  );
}
