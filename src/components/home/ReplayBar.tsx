import { Pause, Play, StepBack, StepForward, X } from "lucide-react";
import type { ReplaySpeed } from "@/pages/Home/useHome";

interface ReplayBarProps {
  frameIndex: number;
  frameCount: number;
  playing: boolean;
  speed: ReplaySpeed;
  clockText: string;
  phaseLabel: string;
  onTogglePlay: () => void;
  onSeek: (index: number) => void;
  /** 单帧步进（delta = ±1 帧, 一帧 = 0.5s 任务时间; 回放中键盘 ←/→ 等价） */
  onStepFrame: (delta: number) => void;
  onSpeedChange: (speed: ReplaySpeed) => void;
  onExit: () => void;
}

const SPEED_OPTIONS: ReplaySpeed[] = [0.25, 0.5, 1, 2, 4];

function fmtSpan(frames: number): string {
  const total = Math.max(0, Math.round(frames * 0.5));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function ReplayBar({
  frameIndex,
  frameCount,
  playing,
  speed,
  clockText,
  phaseLabel,
  onTogglePlay,
  onSeek,
  onStepFrame,
  onSpeedChange,
  onExit,
}: ReplayBarProps) {
  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 pt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border-2 border-destructive/70 bg-card px-4 py-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
        <span className="animate-pulse rounded-full border border-destructive bg-destructive/10 px-3 py-1 font-mono text-xs font-bold tracking-widest text-destructive shadow-sm">
          REPLAY
        </span>

        <span
          className={`font-mono text-2xl font-bold tabular-nums leading-none tracking-widest text-primary ${
            playing ? "replay-clock-glow" : ""
          }`}
          title="当前帧任务时钟（单帧步进时逐帧刷新）"
        >
          {clockText}
        </span>

        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing ? "暂停回放" : "播放回放"}
          title={playing ? "暂停" : "播放（单帧模式点击后从当前帧按所选倍速继续）"}
          className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
        >
          {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onStepFrame(-1)}
            aria-label="帧退一帧"
            title="帧退（一帧 = 0.5s 任务时间 · 键盘 ←）"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition hover:border-destructive/60 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
          >
            <StepBack className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onStepFrame(1)}
            aria-label="帧进一帧"
            title="帧进（一帧 = 0.5s 任务时间 · 键盘 →）"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition hover:border-destructive/60 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
          >
            <StepForward className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input
            type="range"
            min={0}
            max={Math.max(0, frameCount - 1)}
            step={1}
            value={frameIndex}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="回放时间轴"
            className="h-2 w-full min-w-0 cursor-pointer accent-destructive"
          />
        </div>

        <p className="font-mono text-xs tabular-nums tracking-widest text-muted-foreground">
          帧 {frameCount > 0 ? frameIndex + 1 : 0}/{frameCount} · {fmtSpan(frameIndex)} / {fmtSpan(frameCount)} ·{" "}
          <span className="text-card-foreground">{phaseLabel}</span>
        </p>

        <div className="flex items-center gap-1">
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onSpeedChange(opt)}
              aria-label={`${opt} 倍速回放`}
              className={`rounded-md border px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums shadow-sm transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                speed === opt
                  ? "border-destructive bg-destructive text-destructive-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-destructive/60 hover:text-destructive"
              }`}
            >
              {opt}x
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onExit}
          aria-label="退出回放回到实时"
          title="退出回放 (ESC)"
          className="flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 font-mono text-xs tracking-widest text-muted-foreground shadow-sm transition hover:border-destructive/60 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          退出回放
        </button>
      </div>
    </div>
  );
}
