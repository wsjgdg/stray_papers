import { useEffect, useRef } from "react";
import type { ReplayTimelineState } from "@/pages/Home/useHome";

// 分享链接自动回放底部时间轴（访客只读演出与挑战「分享演奏」回放共用同一条通道）：
// 播放头实时跟随；点击/拖拽（pointer events 触屏可拖）seek 到任意时刻续播，暂停态落点即下次起播点。
// 播放中播放头由本组件 rAF 直写 DOM（不经父级 setState，避免高频整页重渲染拖慢画面）。
function fmtClock(sec: number): string {
  const v = Math.max(0, Math.floor(sec));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

export function ReplayTimeline({
  timeline,
  getTime,
  onSeek,
  onToggle,
}: {
  timeline: ReplayTimelineState;
  getTime: () => number;
  onSeek: (t: number) => void;
  onToggle: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const curRef = useRef<HTMLSpanElement | null>(null);
  const dispRef = useRef(timeline.time);
  const totalRef = useRef(timeline.total);
  totalRef.current = timeline.total;

  const seekFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    onSeek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * timeline.total);
  };
  const apply = (t: number) => {
    dispRef.current = t;
    const pct = totalRef.current > 0 ? Math.min(100, Math.max(0, (t / totalRef.current) * 100)) : 0;
    if (fillRef.current) fillRef.current.style.width = `${pct}%`;
    if (knobRef.current) knobRef.current.style.left = `${pct}%`;
    if (curRef.current) curRef.current.textContent = fmtClock(t);
  };
  // Logic 侧 time 变化（起播/暂停/seek/播完）时同步一次锚点
  useEffect(() => {
    apply(timeline.time);
  }, [timeline.time]);
  // 播放中：rAF 自取引擎时钟直写，不经 setState
  useEffect(() => {
    if (!timeline.playing) return;
    let raf = 0;
    const tick = () => {
      if (!draggingRef.current) {
        const t = Math.max(0, getTime());
        if (Math.abs(t - dispRef.current) >= 0.02) apply(t);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [timeline.playing, getTime]);

  const pct =
    timeline.total > 0
      ? Math.min(100, Math.max(0, (dispRef.current / timeline.total) * 100))
      : 0;
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-3 z-30 flex justify-center px-4">
      <div className="flex w-full max-w-2xl items-center gap-3 border border-primary/40 bg-card/90 px-3 py-2 font-mono text-xs text-card-foreground shadow-md backdrop-blur">
        <button
          type="button"
          onClick={onToggle}
          aria-label={timeline.playing ? "暂停回放" : "继续回放"}
          title={timeline.playing ? "暂停" : "继续（暂停中 seek 后从这里播）"}
          className="shrink-0 border border-primary bg-primary px-2.5 py-1 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
        >
          {timeline.playing ? "⏸" : "⏵"}
        </button>
        <span ref={curRef} className="w-9 shrink-0 tabular-nums text-muted-foreground">
          {fmtClock(dispRef.current)}
        </span>
        <div
          ref={trackRef}
          role="slider"
          aria-label="回放时间轴：拖拽或点按跳到任意时刻"
          aria-valuemin={0}
          aria-valuemax={Math.round(timeline.total)}
          aria-valuenow={Math.round(timeline.time)}
          className="relative h-6 flex-1 cursor-pointer touch-none"
          onPointerDown={(e) => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) seekFromX(e.clientX);
          }}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
        >
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
          <div
            ref={fillRef}
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
          <div
            ref={knobRef}
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow"
            style={{ left: `${pct}%` }}
          />
        </div>
        <span className="w-9 shrink-0 tabular-nums text-muted-foreground">
          {fmtClock(timeline.total)}
        </span>
        <span className="hidden shrink-0 text-muted-foreground sm:inline">
          {timeline.playing ? "回放中" : "已暂停"}
        </span>
      </div>
    </div>
  );
}
