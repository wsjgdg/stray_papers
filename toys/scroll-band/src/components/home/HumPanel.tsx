import { useEffect, useRef } from "react";
import type { useHome } from "@/pages/Home/useHome";
import { hzToMidi } from "@/lib/audio/humDetect";
import { usePanelEntrance } from "./usePanelMotion";

// 哼唱转音符面板（作曲模式专属）：大按钮开始/停止 + 实时音高曲线（内部 canvas rAF 直绘，
// 零每帧 setState）+ 贴音阶/对拍子两开关 + 识别摘要 + 「落进画布」主按钮。
// 样式对齐 SynthPanel/MixPanel（border-border bg-card font-mono token 色）。

const CURVE_H = 150; // 画布逻辑高度 px
const WINDOW_SEC = 6; // 录音时滚动窗口

// 曲线配色全部从探针元素的 computed style 采样（token 唯一真源），源码零色值
function cssColor(el: HTMLElement | null): string {
  return el ? window.getComputedStyle(el).color : "rgb(128 128 128)";
}
function withAlpha(color: string, a: number): string {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return color;
  const body = m[1].split(/[,\s]+/).filter(Boolean);
  const [r, g, b] = body;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function HumPanel(p: ReturnType<typeof useHome>) {
  const rootRef = usePanelEntrance<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const primaryRef = useRef<HTMLSpanElement | null>(null);
  const mutedRef = useRef<HTMLSpanElement | null>(null);

  // 实时曲线：rAF 直绘（帧缓冲经 props 传入的 ref 共享，绘制不经任何 setState）
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const wrap = cv.parentElement;
      if (!wrap) return;
      const w = Math.max(80, wrap.clientWidth);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.round(w * dpr);
      const ph = Math.round(CURVE_H * dpr);
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw;
        cv.height = ph;
        cv.style.width = `${w}px`;
        cv.style.height = `${CURVE_H}px`;
      }
      const g = cv.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, CURVE_H);
      const frames = p.humFramesRef.current;
      const primary = cssColor(primaryRef.current);
      const muted = cssColor(mutedRef.current);

      const nowT = performance.now() / 1000;
      const win0 = p.humRecording ? nowT - WINDOW_SEC : frames.length > 0 ? frames[0].t : 0;
      const win1 = p.humRecording ? nowT : frames.length > 0 ? frames[frames.length - 1].t + 0.3 : 1;
      const vis = frames.filter((f) => f.voiced && f.t >= win0 && f.t <= win1);

      // 纵轴音高范围：与画布音区同步（E2–C6），可见音 ±3 半音自动跟随、窗口带缘各留 3 半音余量；
      // 无音时给整个音区参考带
      let mLo = Infinity;
      let mHi = -Infinity;
      for (const f of vis) {
        const m = hzToMidi(f.freqHz);
        if (m < mLo) mLo = m;
        if (m > mHi) mHi = m;
      }
      if (!Number.isFinite(mLo)) {
        mLo = 40;
        mHi = 84;
      } else {
        mLo = Math.max(37, Math.floor(mLo - 3));
        mHi = Math.min(87, Math.ceil(mHi + 3));
        if (mHi - mLo < 12) mHi = mLo + 12;
      }
      const yOf = (m: number): number => CURVE_H - ((m - mLo) / (mHi - mLo)) * CURVE_H;
      const xOf = (t: number): number => ((t - win0) / Math.max(0.3, win1 - win0)) * w;

      // 半音格参考线：每半音细线、八度 C 加重；当前音阶合法音位在高亮列打点
      const semi = p.humScaleSemitones;
      for (let m = mLo; m <= mHi; m += 1) {
        const y = yOf(m);
        const legal = semi.includes(((m - 48) % 12 + 12) % 12);
        g.strokeStyle = legal
          ? withAlpha(muted, 0.45)
          : ((m - 48) % 12 + 12) % 12 === 0
            ? withAlpha(muted, 0.35)
            : withAlpha(muted, 0.12);
        g.beginPath();
        g.moveTo(10, y);
        g.lineTo(w, y);
        g.stroke();
        if (legal) {
          g.fillStyle = withAlpha(primary, 0.7);
          g.beginPath();
          g.arc(5, y, 1.8, 0, Math.PI * 2);
          g.fill();
        }
      }

      if (vis.length < 2) {
        g.fillStyle = withAlpha(muted, 0.9);
        g.font = "12px ui-monospace, monospace";
        g.textAlign = "center";
        g.fillText(
          p.humRecording ? "正在听… 大声哼给你看" : "点下方大按钮，哼一段旋律就会出现在这里",
          w / 2,
          CURVE_H / 2,
        );
        return;
      }
      // 曲线：按 rms 控制不透明度（响亮浓、轻哼淡）
      g.lineWidth = 2;
      for (let i = 1; i < vis.length; i += 1) {
        const a = vis[i - 1];
        const b = vis[i];
        const alpha = 0.25 + 0.75 * Math.min(1, b.rms / 0.25);
        g.strokeStyle = withAlpha(primary, alpha);
        g.beginPath();
        g.moveTo(xOf(a.t), yOf(hzToMidi(a.freqHz)));
        g.lineTo(xOf(b.t), yOf(hzToMidi(b.freqHz)));
        g.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [p.humRecording, p.humFramesRef, p.humScaleSemitones]);

  const toggleCls = (on: boolean): string =>
    on
      ? "border border-primary bg-primary/10 px-2 py-1 text-primary focus-visible:shadow-[var(--focus-ring)]"
      : "border border-border px-2 py-1 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]";

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={p.onCloseHum}
    >
      <div
        data-panel-card
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto border border-border bg-card p-5 font-mono text-xs text-card-foreground shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-2xl font-bold">哼唱转音符</h2>
          <span className="text-muted-foreground">哼一句 · 落一谱</span>
        </div>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          对着话筒哼一段旋律，松手就把它编译成画布上的<span className="text-primary">循环乐句</span>——
          和手画的线同权，可卷帘、可变形、可接龙本棒。<span className="text-primary">戴耳机更准</span>——外放会被话筒听到。
        </p>

        <div data-panel-item className="mt-3 flex flex-col gap-2">
          <div className="relative border border-border bg-background/40">
            <canvas ref={canvasRef} className="block" aria-label="哼唱实时音高曲线：横轴时间、纵轴音高，亮点列是当前音阶合法音位" />
            <span ref={primaryRef} aria-hidden className="pointer-events-none absolute left-0 top-0 text-primary opacity-0" />
            <span ref={mutedRef} aria-hidden className="pointer-events-none absolute left-0 top-0 text-muted-foreground opacity-0" />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={p.humRecording ? p.onHumStop : p.onHumStart}
              className={
                p.humRecording
                  ? "flex flex-1 items-center justify-center gap-2 border border-destructive bg-destructive/10 px-3 py-2.5 text-destructive hover:bg-destructive/20 focus-visible:shadow-[var(--focus-ring)]"
                  : "flex flex-1 items-center justify-center gap-2 border border-primary bg-primary px-3 py-2.5 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              {p.humRecording && (
                <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
              )}
              {p.humRecording ? "停止哼" : "开始哼"}
              {p.humRecording && (
                <span className="min-w-12 text-right tabular-nums">{p.humSeconds.toFixed(1)}s</span>
              )}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" aria-pressed={p.humSnapOn} onClick={p.onToggleHumSnap} className={toggleCls(p.humSnapOn)}>
              贴音阶
            </button>
            <button type="button" aria-pressed={p.humQuantOn} onClick={p.onToggleHumQuant} className={toggleCls(p.humQuantOn)}>
              对拍子
            </button>
            <span className="ml-auto text-muted-foreground">默认都开：落进画布即成规整乐句</span>
          </div>
        </div>

        {p.humError && (
          <div role="alert" className="mt-3 border border-destructive/40 bg-destructive/10 px-2 py-1.5 leading-relaxed text-destructive">
            {p.humError}
          </div>
        )}
        {p.allMuted && (
          <p className="mt-3 border border-border bg-muted px-2 py-1.5 text-muted-foreground">
            当前全局静音：拾音照常，落进画布的循环要取消静音才听得见
          </p>
        )}
        {p.humSummary && (
          <p data-panel-item className="mt-3 border border-primary/40 bg-primary/10 px-2 py-1.5 text-primary">
            识别摘要：约 {p.humSummary.notes} 个音 · {p.humSummary.beats} 拍 · 平均 {p.humSummary.zone}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={p.onHumCommit}
            disabled={!p.humSummary}
            className="border border-primary bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
          >
            落进画布
          </button>
          <button
            type="button"
            onClick={p.onCloseHum}
            className="border border-border px-2 py-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            丢弃
          </button>
          <span className="ml-auto text-muted-foreground">{p.humSummary ? "与手画线同权 · 一步可撤销" : "先哼一段再落谱"}</span>
        </div>
      </div>
    </div>
  );
}
