import { useEffect, useRef, useState } from "react";
import type { useHome } from "@/pages/Home/useHome";

// 「无障碍」面板：色盲友好配色 / 纯视觉节奏模式 / 画布轨迹文字描述导出。
// 三项都记在本地；纯视觉模式只静音挑战击符声与练习节拍器，判定与计分完全不变。
export function AccessPanel(p: ReturnType<typeof useHome>) {
  const [open, setOpen] = useState(false);
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

  const active = p.cbMode || p.visualOnly;

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`无障碍：色盲配色${p.cbMode ? "开" : "关"}，纯视觉节奏${p.visualOnly ? "开" : "关"}`}
        className={
          active
            ? "border border-primary bg-primary/10 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
            : "border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
        }
      >
        无障碍
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="无障碍选项：配色、纯视觉节奏与轨迹文字描述"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-3 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:w-80"
        >
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={p.cbMode}
              onChange={(e) => p.onSetCbMode(e.target.checked)}
              aria-label="色盲友好配色开关"
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="text-xs">色盲友好配色</span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                音级颜色换成红绿色盲也能分辨的色盘（并给每个音级加明暗差兜底），Miss
                红闪与判定字换成不混色的朱红；作曲线、琴键、下落块全部同步。
              </span>
            </span>
          </label>
          <label className="mt-2.5 flex items-start gap-2 border-t border-border pt-2.5">
            <input
              type="checkbox"
              checked={p.visualOnly}
              onChange={(e) => p.onSetVisualOnly(e.target.checked)}
              aria-label="纯视觉节奏模式开关"
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="text-xs">纯视觉节奏模式</span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                完全靠看打挑战：击符声与练习节拍器静音，判定线增亮加粗、Miss
                轨道闪加强、判定文字放大。判定与计分规则完全不变，听不见也公平。
              </span>
            </span>
          </label>
          <div className="mt-2.5 border-t border-border pt-2.5">
            <button
              type="button"
              onClick={p.onExportCanvasText}
              className="w-full border border-primary px-2 py-1 text-center text-xs text-primary hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
            >
              导出画布轨迹文字描述
            </button>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              把画布上的线与锚点翻译成「线 1：8 个音，D4 → A4，音域
              D4–A4，走向总体上行」这样的中文，直接复制进剪贴板，能交给屏幕朗读念出来；剪贴板被拦时自动存成
              txt 文件。
            </p>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            另外，作曲模式的「单击落锚点」本就是拖拽画线的替代——不方便按住拖动的话，单击也能把音符一个个摆上画布。
          </p>
        </div>
      )}
    </span>
  );
}
