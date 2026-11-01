import { useEffect, useRef } from "react";
import type { Engine } from "@/audio/engine";

export type ScopeMode = "hybrid" | "wave" | "vector";

/* ---------------------- oscilloscope + spectrum ---------------------- */

export function Scope({
  analyser,
  playing,
  mode = "hybrid",
}: {
  analyser: AnalyserNode | null;
  playing: boolean;
  mode?: ScopeMode;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    if (!c) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const freq = new Uint8Array(new ArrayBuffer(analyser ? analyser.frequencyBinCount : 1024));
    const time = new Uint8Array(new ArrayBuffer(analyser ? analyser.fftSize : 2048));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(80, rect.width);
      h = Math.max(40, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const BARS = 52;
    let phase = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      phase += 0.02;
      const curMode = modeRef.current;

      c.clearRect(0, 0, w, h);

      // CRT Graticule / Grid
      c.strokeStyle = curMode === "wave" ? "rgba(242,160,61,0.09)" : "rgba(95,211,196,0.075)";
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 1; i < 8; i++) {
        const x = Math.round((w / 8) * i) + 0.5;
        c.moveTo(x, 0);
        c.lineTo(x, h);
      }
      for (let i = 1; i < 4; i++) {
        const y = Math.round((h / 4) * i) + 0.5;
        c.moveTo(0, y);
        c.lineTo(w, y);
      }
      c.stroke();

      if (curMode === "vector") {
        // Goniometer radar circle & diagonals
        const r = Math.min(w, h) * 0.42;
        const cx = w / 2;
        const cy = h / 2;
        c.strokeStyle = "rgba(95,211,196,0.12)";
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.moveTo(cx - r, cy);
        c.lineTo(cx + r, cy);
        c.moveTo(cx, cy - r);
        c.lineTo(cx, cy + r);
        // 45 deg diagonals
        const d = r * 0.707;
        c.moveTo(cx - d, cy - d);
        c.lineTo(cx + d, cy + d);
        c.moveTo(cx - d, cy + d);
        c.lineTo(cx + d, cy - d);
        c.stroke();
      }

      if (analyser) {
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(time);

        if (curMode === "hybrid") {
          // Spectrum bars (log-ish spacing)
          const bw = w / BARS;
          for (let i = 0; i < BARS; i++) {
            const lo = Math.floor(Math.pow(i / BARS, 1.85) * (freq.length * 0.62));
            const hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / BARS, 1.85) * (freq.length * 0.62)));
            let sum = 0;
            for (let j = lo; j < hi; j++) sum += freq[j];
            const v = sum / (hi - lo) / 255;
            const bh = Math.max(1, v * h * 0.66);
            const g = c.createLinearGradient(0, h, 0, h - bh);
            g.addColorStop(0, "rgba(95,211,196,0.55)");
            g.addColorStop(0.65, "rgba(143,209,79,0.45)");
            g.addColorStop(1, "rgba(242,160,61,0.8)");
            c.fillStyle = g;
            c.fillRect(i * bw + 0.8, h - bh, bw - 1.6, bh);
          }

          // Waveform overlay
          c.beginPath();
          const n = time.length;
          const stride = Math.max(1, Math.floor(n / Math.max(60, w)));
          for (let i = 0; i < n; i += stride) {
            const x = (i / n) * w;
            const y = h * 0.44 + ((time[i] - 128) / 128) * h * 0.36;
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.strokeStyle = playingRef.current ? "#f2a03d" : "rgba(242,160,61,0.5)";
          c.lineWidth = 1.6;
          c.shadowColor = "rgba(242,160,61,0.85)";
          c.shadowBlur = 9;
          c.stroke();
          c.shadowBlur = 0;
        } else if (curMode === "wave") {
          // Pure Phosphor CRT Oscilloscope with zero-crossing trigger
          const n = time.length;
          let startIdx = 0;
          for (let i = 0; i < n / 2; i++) {
            if (time[i] < 128 && time[i + 1] >= 128) {
              startIdx = i;
              break;
            }
          }
          const span = Math.min(n - startIdx, Math.floor(n * 0.5));
          c.beginPath();
          for (let i = 0; i < span; i++) {
            const x = (i / span) * w;
            const y = h * 0.5 + ((time[startIdx + i] - 128) / 128) * h * 0.42;
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.strokeStyle = "#5fd3c4";
          c.lineWidth = 2.2;
          c.shadowColor = "rgba(95,211,196,0.95)";
          c.shadowBlur = 12;
          c.stroke();
          c.shadowBlur = 0;
        } else if (curMode === "vector") {
          // Goniometer / Lissajous XY phase plot
          const cx = w / 2;
          const cy = h / 2;
          const r = Math.min(w, h) * 0.4;
          const n = time.length;
          const stride = 2;
          c.beginPath();
          for (let i = 0; i < n - 8; i += stride) {
            const chL = (time[i] - 128) / 128;
            const chR = (time[i + 4] - 128) / 128; // decorrelated phase offset
            const x = cx + (chL - chR) * r * 0.9;
            const y = cy - (chL + chR) * r * 0.9;
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.strokeStyle = "#c08be8";
          c.lineWidth = 1.6;
          c.shadowColor = "rgba(192,139,232,0.85)";
          c.shadowBlur = 8;
          c.stroke();
          c.shadowBlur = 0;
        }
      } else {
        // standby trace
        c.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const y = h * 0.44 + Math.sin(x * 0.035 + phase) * h * 0.045 * Math.sin(phase * 0.4);
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.strokeStyle = "rgba(95,211,196,0.45)";
        c.lineWidth = 1.4;
        c.shadowColor = "rgba(95,211,196,0.6)";
        c.shadowBlur = 8;
        c.stroke();
        c.shadowBlur = 0;
      }

      // baseline
      c.strokeStyle = "rgba(233,229,220,0.12)";
      c.beginPath();
      c.moveTo(0, h * 0.44 + 0.5);
      c.lineTo(w, h * 0.44 + 0.5);
      c.stroke();
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser]);

  return <canvas ref={ref} className="block h-full w-full" aria-hidden />;
}

/* ---------------------------- dBFS readout ---------------------------- */

export function DbReadout({ engine, recording }: { engine: Engine | null; recording: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const recRef = useRef(recording);
  recRef.current = recording;

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let hold = -Infinity;
    let holdAt = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 90) return;
      last = now;
      const el = ref.current;
      if (!el) return;
      if (recRef.current) {
        el.textContent = "● REC";
        el.style.color = "#ff6f59";
        return;
      }
      const { peak } = engine ? engine.readLevel() : { peak: 0 };
      const db = 20 * Math.log10(Math.max(1e-6, peak));
      if (db >= hold || now - holdAt > 1200) {
        hold = db;
        holdAt = now;
      }
      el.textContent = hold < -59 ? "−∞ dBFS" : `${hold.toFixed(1)} dBFS`;
      el.style.color = hold > -1 ? "#ff6f59" : hold > -8 ? "#f2a03d" : "#8b929e";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return <span ref={ref} className="digits text-[9px] text-muted">−∞ dBFS</span>;
}

/* ----------------------------- level meter ----------------------------- */

const SEGMENTS = 14;

export function Meter({ engine, label }: { engine: Engine | null; label: string }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const peakRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const lvl = engine ? engine.readLevel() : { rms: 0, peak: 0 };
      const db = 20 * Math.log10(Math.max(1e-5, lvl.rms * 2.4));
      const norm = Math.max(0, Math.min(1, (db + 48) / 48));
      smooth = norm > smooth ? norm : smooth * 0.88 + norm * 0.12;
      peakRef.current = Math.max(smooth, peakRef.current - 0.006);
      const lit = Math.round(smooth * SEGMENTS);
      const peakIdx = Math.round(peakRef.current * SEGMENTS) - 1;
      for (let i = 0; i < SEGMENTS; i++) {
        const el = refs.current[i];
        if (!el) continue;
        const on = i < lit || i === peakIdx;
        el.style.opacity = on ? "1" : "0.13";
        el.style.boxShadow = on ? `0 0 6px ${el.dataset.c}` : "none";
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-full flex-col-reverse justify-between gap-[2px] py-[2px]">
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const color = i > SEGMENTS - 3 ? "#ff6f59" : i > SEGMENTS - 6 ? "#f2a03d" : "#5fd3c4";
          return (
            <div
              key={i}
              data-c={color}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="h-[3px] w-4 rounded-[1px] transition-opacity duration-75"
              style={{ background: color, opacity: 0.13 }}
            />
          );
        })}
      </div>
      <span className="label rotate-180 [writing-mode:vertical-rl]">{label}</span>
    </div>
  );
}
