import { useEffect, useRef, useState } from "react";
import type { ResizeMode } from "@/pages/Home/useHome";

// 拖手柄改循环时长松手后的音符处理方式选择条（Logic resizePick 浮出）：
// 按比例缩放 = 现行几何语义（音符按新旧时长比值等比映射）；重复填充 = 原音符相对位置不变、
// 按原长重复铺满新时长。勾选「记住」持久 so-resize-mode-v1；关闭/不作答 = 默认按比例。
export function ResizeModeBar({
  from,
  to,
  onPick,
  onCancel,
}: {
  from: number;
  to: number;
  onPick: (mode: ResizeMode, remember: boolean) => void;
  onCancel: () => void;
}) {
  const [remember, setRemember] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const beats = (n: number) => String(Math.round(n * 100) / 100);

  // 浮层内的按下全部吞掉（捕获层），避免点选择条顺手在画布上起一条草稿线；
  // 只停 pointerdown 传播，不影响按钮/勾选框自身的 click
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) e.stopPropagation();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label="改循环长度后线内音符的处理方式"
      className="fixed bottom-16 left-1/2 z-40 w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 border border-border bg-card p-2 text-card-foreground shadow-lg backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-xs text-muted-foreground">
          循环 <span className="font-mono text-primary">{beats(from)}</span> →{" "}
          <span className="font-mono text-primary">{beats(to)}</span> 拍 · 线里的音符怎么排？
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="关闭，按默认的比例缩放处理"
          className="shrink-0 border border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
        >
          ×
        </button>
      </div>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => onPick("scale", remember)}
          title="音符时间位置按新旧时长比值等比映射"
          className="flex-1 border border-primary bg-primary px-2 py-1 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
        >
          按比例缩放
          <span className="ml-1 opacity-70">默认</span>
        </button>
        <button
          type="button"
          onClick={() => onPick("repeat", remember)}
          title="保持原音符相对位置，整段按原长重复铺满新时长，超出截断"
          className="flex-1 border border-border px-2 py-1 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
        >
          重复填充
        </button>
      </div>
      <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="accent-primary"
        />
        记住我的选择（下次不再问）
      </label>
    </div>
  );
}
