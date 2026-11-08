"use client";

import { useEffect, useRef, useState } from "react";
import {
  clock,
  effect,
  frameLoop,
  init,
  surface,
  type Effect,
  type FrameLoopHandle,
} from "vgpu";
import scatter from "@/lib/gpu/efficiency-scatter.wgsl";

const MAX_POINTS = 512;
const PAD = 0.08;

type EfficiencyRecord = {
  efficiencyValue: number;
  year: number | null;
  certified: boolean;
  material: { name: string };
};

type Status = "loading" | "ready" | "empty" | "error" | "unsupported";

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

/**
 * Builds a fixed-length `array<vec4f, 512>` payload from efficiency records.
 * Each entry: [normYear, normEff, effHue, weight]. Unused slots are zeroed so
 * the shader's `i < count` guard and the zeroed buffer match.
 */
function buildPoints(records: EfficiencyRecord[]): {
  points: number[][];
  count: number;
  yearRange: [number, number];
  effRange: [number, number];
} {
  const years = records.map((r) => r.year).filter((y): y is number => y != null);
  const effs = records.map((r) => r.efficiencyValue);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 1;
  const minEff = effs.length ? Math.min(...effs) : 0;
  const maxEff = effs.length ? Math.max(...effs) : 100;
  const yearSpan = maxYear - minYear || 1;
  const effSpan = maxEff - minEff || 1;

  const span = 1 - 2 * PAD;
  const points: number[][] = Array.from({ length: MAX_POINTS }, () => [0, 0, 0, 0]);
  const count = Math.min(records.length, MAX_POINTS);

  for (let i = 0; i < count; i++) {
    const r = records[i];
    const nx = r.year == null ? 0.5 : PAD + ((r.year - minYear) / yearSpan) * span;
    const ny = PAD + ((r.efficiencyValue - minEff) / effSpan) * span;
    const effHue = clamp01((r.efficiencyValue - minEff) / effSpan);
    const weight = r.certified ? 1.0 : 0.4;
    points[i] = [nx, ny, effHue, weight];
  }

  return { points, count, yearRange: [minYear, maxYear], effRange: [minEff, maxEff] };
}

export function GpuEfficiencyScatter({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<{ count: number; yearRange: [number, number]; effRange: [number, number] }>({
    count: 0,
    yearRange: [0, 0],
    effRange: [0, 0],
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nav = navigator as Navigator & { gpu?: unknown };
    if (typeof navigator === "undefined" || !nav.gpu) {
      setStatus("unsupported");
      return;
    }

    let disposed = false;
    let loop: FrameLoopHandle | undefined;
    let gpu: Awaited<ReturnType<typeof init>> | undefined;
    let fx: Effect | undefined;

    void (async () => {
      try {
        gpu = await init();
        if (disposed) {
          gpu.dispose();
          return;
        }

        const canvasSurface = surface(gpu, canvas, { dpr: [1, 2] });
        fx = effect(gpu, scatter, {
          label: "efficiency-scatter",
          set: { params: { time: 0, count: 0, texel: canvasSurface.texelSize } },
        });

        canvasSurface.onResize(() => {
          fx?.set({ params: { texel: canvasSurface.texelSize } });
        });

        const time = clock(gpu);
        loop = frameLoop(gpu, (frame) => {
          fx?.set({ params: { time: time.time } });
          if (fx) frame.pass(canvasSurface, fx);
        });

        const res = await fetch("/api/efficiency");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { records?: EfficiencyRecord[] };
        const records = json.records ?? [];
        if (disposed) return;

        if (records.length === 0) {
          setStatus("empty");
          return;
        }

        const { points, count, yearRange, effRange } = buildPoints(records);
        fx.set({ params: { count, texel: canvasSurface.texelSize }, points });
        setMeta({ count, yearRange, effRange });
        setStatus("ready");
      } catch (err) {
        console.error("[gpu-efficiency-scatter]", err);
        if (!disposed) setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      loop?.stop();
      gpu?.dispose();
    };
  }, []);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      {status === "loading" && <Overlay>Loading efficiency data…</Overlay>}
      {status === "empty" && <Overlay>No efficiency records yet.</Overlay>}
      {status === "error" && <Overlay>WebGPU render failed (see console).</Overlay>}
      {status === "unsupported" && <Overlay>WebGPU not available in this browser.</Overlay>}
      {status === "ready" && (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            font: "12px/1.4 ui-monospace, monospace",
            color: "rgba(230,237,243,0.7)",
            background: "rgba(15,22,38,0.55)",
            padding: "6px 10px",
            borderRadius: 6,
            pointerEvents: "none",
          }}
        >
          {meta.count} points · year {meta.yearRange[0]}–{meta.yearRange[1]} · eff{" "}
          {meta.effRange[0].toFixed(0)}–{meta.effRange[1].toFixed(0)}%
        </div>
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        font: "14px/1.5 ui-monospace, monospace",
        color: "rgba(230,237,243,0.75)",
        background: "rgba(15,22,38,0.6)",
      }}
    >
      {children}
    </div>
  );
}
