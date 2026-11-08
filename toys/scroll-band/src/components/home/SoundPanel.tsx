import { useEffect, useRef, useState } from "react";
import type { useHome } from "@/pages/Home/useHome";
import { loadVoiceVol, saveVoiceVol } from "@/lib/voiceVolume";

// 「听感」面板：全局混音三条推子（主音量 = 空间面板同款 fx.vol / 音乐 / 语音）
// + 挑战判定延迟校准——节拍器哒哒配对按键实测中位差，跨设备把「听到即命中」对齐
export function SoundPanel(p: ReturnType<typeof useHome>) {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState(loadVoiceVol);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      const t = e.target as HTMLElement | null;
      if (t && t.tagName !== "BUTTON" && t.tagName !== "INPUT") e.stopPropagation();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const active = p.fx.vol !== 0.45 || p.musicVol !== 1 || voice !== 1 || p.calibMs !== 0;

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`听感：主音量 ${Math.round(p.fx.vol * 100)}%，音乐 ${Math.round(p.musicVol * 100)}%，语音 ${Math.round(voice * 100)}%，判定补偿 ${p.calibMs} 毫秒`}
        className={
          active
            ? "border border-primary bg-primary/10 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
            : "border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
        }
      >
        听感
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="听感调节：混音推子与判定校准"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-3 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:w-72"
        >
          <label className="mb-2.5 block">
            <span className="flex items-baseline justify-between">
              <span>
                主音量 <span className="text-[10px] text-muted-foreground">总输出</span>
              </span>
              <span className="text-muted-foreground">{Math.round(p.fx.vol * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(p.fx.vol * 100)}
              onChange={(e) => p.onSetFx("vol", Number(e.target.value) / 100)}
              aria-label="主音量滑杆"
              className="mt-1 w-full accent-primary"
            />
          </label>
          <label className="mb-2.5 block">
            <span className="flex items-baseline justify-between">
              <span>
                音乐 <span className="text-[10px] text-muted-foreground">琴/鼓/循环伴奏</span>
              </span>
              <span className="text-muted-foreground">{Math.round(p.musicVol * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(p.musicVol * 100)}
              onChange={(e) => p.onSetMusicVol(Number(e.target.value) / 100)}
              aria-label="音乐音量滑杆"
              className="mt-1 w-full accent-primary"
            />
          </label>
          <label className="mb-2.5 block">
            <span className="flex items-baseline justify-between">
              <span>
                语音 <span className="text-[10px] text-muted-foreground">指挥朗读</span>
              </span>
              <span className="text-muted-foreground">{Math.round(voice * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(voice * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setVoice(v);
                saveVoiceVol(v);
              }}
              aria-label="语音朗读音量滑杆"
              className="mt-1 w-full accent-primary"
            />
          </label>

          <div className="mt-3 border-t border-border pt-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs">判定校准</span>
              <span className="text-[10px] text-muted-foreground">
                当前补偿 {p.calibMs > 0 ? "+" : ""}
                {p.calibMs}ms · 声卡延迟 {p.engineLatencyMs}ms
              </span>
            </div>
            {p.calibRunning ? (
              <>
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  听到「哒」就按——空格 / J / F 或下面大按钮都行（共 8 拍，取中位数）
                </p>
                <button
                  type="button"
                  onPointerDown={() => p.onCalibTap()}
                  className="mt-1.5 w-full border border-primary bg-primary/10 px-3 py-3 text-center font-mono text-sm text-primary focus-visible:shadow-[var(--focus-ring)]"
                >
                  哒！按这里（{p.calibTaps.length}/8）
                </button>
                <button
                  type="button"
                  onClick={() => p.onCalibAbort()}
                  className="mt-1.5 w-full border border-border px-2 py-0.5 text-center text-[10px] text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
                >
                  中止
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => p.onCalibStart()}
                disabled={p.allMuted}
                title={p.allMuted ? "全局静音中听不见节拍器，先解除静音" : undefined}
                className="mt-1.5 w-full border border-primary px-2 py-1 text-center text-xs text-primary hover:bg-primary/10 disabled:border-border disabled:text-muted-foreground focus-visible:shadow-[var(--focus-ring)]"
              >
                ▶ 开始校准（听 8 次「哒」）
              </button>
            )}
            <label className="mt-2 block">
              <span className="flex items-baseline justify-between">
                <span className="text-[10px] text-muted-foreground">手动微调（-100 ~ +200ms）</span>
              </span>
              <input
                type="range"
                min={-100}
                max={200}
                step={5}
                value={p.calibMs}
                onChange={(e) => p.onSetCalibMs(Number(e.target.value))}
                aria-label="判定补偿微调"
                className="mt-0.5 w-full accent-primary"
              />
            </label>
            <div className="text-[10px] leading-relaxed text-muted-foreground">
              觉得「明明踩中却判早/晚」就校准一下：蓝牙耳机器常需 +100ms 上下；校准只影响判定，不动画面与声音。
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
