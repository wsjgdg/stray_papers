import { useEffect, useRef } from "react";
import { tokenHsl } from "@/lib/themeColors";

interface Blip {
  ang: number;
  dist: number;
}

interface RadarScopeProps {
  /** 探测范围倍率（泰坦浓雾期间缩至 0.6: 目标点收缩进内圈 + 虚线雾限环） */
  rangeMult?: number;
}

export function RadarScope({ rangeMult = 1 }: RadarScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rangeMultRef = useRef(rangeMult);

  useEffect(() => {
    rangeMultRef.current = Math.max(0.2, Math.min(1, rangeMult));
  }, [rangeMult]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let size = 0;

    const blips: Blip[] = Array.from({ length: 5 }, () => ({
      ang: Math.random() * Math.PI * 2,
      dist: 0.25 + Math.random() * 0.7,
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = Math.min(canvas.clientWidth, canvas.clientHeight);
      canvas.width = Math.max(1, Math.round(size * dpr));
      canvas.height = Math.max(1, Math.round(size * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const ringColor = tokenHsl("--border");
    const sweepColor = tokenHsl("--primary");
    const blipColor = tokenHsl("--primary", 0.9);
    const tickColor = tokenHsl("--muted-foreground", 0.55);

    const t0 = performance.now();
    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      const c = size / 2;
      const R = c * 0.92;
      const rm = rangeMultRef.current;
      ctx.clearRect(0, 0, size, size);
      if (size <= 0) {
        raf = requestAnimationFrame(draw);
        return;
      }

      // 刻度环
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 1;
      for (const frac of [1, 0.66, 0.33]) {
        ctx.beginPath();
        ctx.arc(c, c, R * frac, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(c - R, c);
      ctx.lineTo(c + R, c);
      ctx.moveTo(c, c - R);
      ctx.lineTo(c, c + R);
      ctx.stroke();

      // 方位刻度
      ctx.strokeStyle = tickColor;
      for (let deg = 0; deg < 360; deg += 15) {
        const a = (deg * Math.PI) / 180;
        const inner = deg % 45 === 0 ? R * 0.9 : R * 0.95;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
        ctx.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
        ctx.stroke();
      }

      // 扫描扇形拖尾
      const sweep = (t * 1.15) % (Math.PI * 2);
      const steps = 26;
      const stepAng = 0.055;
      ctx.fillStyle = sweepColor;
      for (let k = 0; k < steps; k++) {
        ctx.globalAlpha = (1 - k / steps) * 0.14;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, R, sweep - (k + 1) * stepAng, sweep - k * stepAng);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = sweepColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(sweep) * R, c + Math.sin(sweep) * R);
      ctx.stroke();

      // 浓雾探测极限（rangeMult < 1）: 虚线雾限环, 目标点全部收缩进环内
      if (rm < 0.99) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = tickColor;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(c, c, R * rm, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 目标点: 被扫过点亮后余辉衰减（刚被扫到时外圈光晕, 强化"锁定"感）
      ctx.fillStyle = blipColor;
      for (let i = 0; i < blips.length; i++) {
        const b = blips[i];
        let delta = (sweep - b.ang) % (Math.PI * 2);
        if (delta < 0) delta += Math.PI * 2;
        const intensity = Math.exp(-delta * 0.9);
        if (intensity < 0.05) continue;
        const bx = c + Math.cos(b.ang) * R * b.dist * rm;
        const by = c + Math.sin(b.ang) * R * b.dist * rm;
        ctx.globalAlpha = intensity;
        ctx.beginPath();
        ctx.arc(bx, by, 2.6, 0, Math.PI * 2);
        ctx.fill();
        if (intensity > 0.55) {
          ctx.globalAlpha = (intensity - 0.55) * 0.6;
          ctx.beginPath();
          ctx.arc(bx, by, 7, 0, Math.PI * 2);
          ctx.fill();
        }
        // 偶尔刷新一个目标
        if (Math.random() < 0.0008) {
          blips[i] = { ang: Math.random() * Math.PI * 2, dist: 0.25 + Math.random() * 0.7 };
        }
      }

      // 中心点
      ctx.globalAlpha = 1;
      ctx.fillStyle = sweepColor;
      ctx.beginPath();
      ctx.arc(c, c, 2, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
