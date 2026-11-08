import { useEffect, useRef, useState } from "react";
import type { useHome } from "@/pages/Home/useHome";

// 「变形」下拉：对选中的线/锚点一键出变体。每个动作即时生效、可 Ctrl+Z 撤销。
const OPS: { label: string; op: Parameters<ReturnType<typeof useHome>["onDeform"]>[0]; hint: string }[] = [
  { label: "逆行", op: "retrograde", hint: "时间轴倒转，最后一个音变第一个" },
  { label: "倒影", op: "mirror", hint: "音高以首音为轴上下翻转" },
  { label: "加密", op: "densify", hint: "每两个音之间插入经过音" },
  { label: "稀疏", op: "sparse", hint: "删掉偶数位置的音" },
];

export function DeformMenu(p: ReturnType<typeof useHome>) {
  const [open, setOpen] = useState(false);
  const [copyMode, setCopyMode] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const target = p.deformTarget;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      const t = e.target as HTMLElement | null;
      if (t && t.tagName !== "BUTTON") e.stopPropagation();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!target}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`乐句变形器：${target ? `对${target.label}做变形` : "先选中一条线或锚点"}`}
        title="选中一条线后一键出变体：逆行/倒影/加密/稀疏/移调/节奏缩放"
        className={
          open
            ? "border border-primary bg-primary/10 px-2 py-0.5 text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
            : "border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
        }
      >
        变形
      </button>
      {open && target && (
        <div
          role="menu"
          aria-label={`乐句变形：对${target.label}做变体`}
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-2.5 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:w-64"
        >
          <p className="mb-1.5 text-[10px] tracking-widest text-muted-foreground">
            正在变形：{target.label}（每步可 Ctrl+Z 反悔）
          </p>
          <label className="mb-2 flex items-start gap-2 border border-border p-1.5">
            <input
              type="checkbox"
              checked={copyMode}
              onChange={(e) => setCopyMode(e.target.checked)}
              aria-label="生成变体副本：变形作用在新副本上，原线保留"
              className="mt-0.5 accent-primary"
            />
            <span className="text-[10px] leading-snug text-muted-foreground">
              <span className="block text-xs text-card-foreground">生成变体副本</span>
              勾上后原线保留，变形结果往右错开一格放成新线——一条线连着点，能生出一排变体
            </span>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {OPS.filter(() => target.isStroke).map((o) => (
              <button
                key={o.op}
                type="button"
                onClick={() => p.onDeform(o.op, copyMode)}
                title={o.hint}
                className="border border-border px-2 py-1 text-left text-xs hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                <span className="block font-bold">{o.label}</span>
                <span className="block text-[10px] leading-snug text-muted-foreground">{o.hint}</span>
              </button>
            ))}
          </div>
          <p className="mb-1 mt-2 text-[10px] tracking-widest text-muted-foreground">移调（沿音阶移动，永不出调）</p>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { label: "上一步", op: "stepUp" },
                { label: "下一步", op: "stepDown" },
                { label: "升八度", op: "octaveUp" },
                { label: "降八度", op: "octaveDown" },
              ] as const
            ).map((o) => (
              <button
                key={o.op}
                type="button"
                onClick={() => p.onDeform(o.op, copyMode)}
                className="border border-border px-1 py-1 text-center text-[11px] hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                {o.label}
              </button>
            ))}
          </div>
          {target.isStroke && (
            <>
              <p className="mb-1 mt-2 text-[10px] tracking-widest text-muted-foreground">节奏缩放</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => p.onDeform("speedUp", copyMode)}
                  className="border border-border px-2 py-1 text-center text-xs hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                >
                  快 2×（循环减半）
                </button>
                <button
                  type="button"
                  onClick={() => p.onDeform("slowDown", copyMode)}
                  className="border border-border px-2 py-1 text-center text-xs hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                >
                  慢 2×（循环加倍）
                </button>
              </div>
            </>
          )}
          {!target.isStroke && (
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              锚点只有一个音：移调可用，倒影/逆行/加密/稀疏对线才生效。
            </p>
          )}
        </div>
      )}
    </span>
  );
}
