"use client";

import { useEffect, useRef } from "react";
import { clock, effect, frameLoop, init, surface, type FrameLoopHandle } from "vgpu";
import phaseField from "@/lib/gpu/phase-field.wgsl";

/**
 * GPU-accelerated phase-diagram field rendered with vgpu / WebGPU.
 * Mounts a fullscreen canvas and runs a WebGPU render loop entirely on the
 * client. SSR-safe: all vgpu work happens inside useEffect after mount.
 */
export function GpuPhaseField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let loop: FrameLoopHandle | undefined;
    let gpu: Awaited<ReturnType<typeof init>> | undefined;

    void (async () => {
      gpu = await init();
      if (disposed) {
        gpu.dispose();
        return;
      }

      const canvasSurface = surface(gpu, canvas, { dpr: [1, 2] });
      const fx = effect(gpu, phaseField, {
        label: "phase-field",
        set: { params: { time: 0, texel: canvasSurface.texelSize } },
      });

      canvasSurface.onResize(() => {
        fx.set({ params: { texel: canvasSurface.texelSize } });
      });

      const time = clock(gpu);
      loop = frameLoop(gpu, (frame) => {
        fx.set({ params: { time: time.time } });
        frame.pass(canvasSurface, fx);
      });
    })();

    return () => {
      disposed = true;
      loop?.stop();
      gpu?.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
