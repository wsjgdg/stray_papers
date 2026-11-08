/**
 * 沉默可以被听见（批次 AK）：不是读心，是字面意义上的听见。
 * 沉默值第一次进入中档时（每学期一次），灰灰（躺在操场听见安静的那只）隔着一段距离说了三句话。
 * 沉默不是没有声音——它是一种只有特定角色能听得见的声音。
 */
import { useEffect, useState } from "react";

const LINES: Array<{ by: string; text: string }> = [
  { by: "灰灰", text: "你刚才沉默了。" },
  { by: "你", text: "你怎么知道？" },
  { by: "灰灰", text: "因为你沉默的时候，声音很大。" },
];

export function SilenceHeardOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (shown >= LINES.length) return;
    const timer = window.setTimeout(() => setShown((prev) => prev + 1), 1600);
    return () => window.clearTimeout(timer);
  }, [shown]);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-foreground/60 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-label="沉默被听见了"
    >
      <div className="anim-fade-up w-full max-w-md rounded-2xl border border-border bg-card/95 p-5 shadow-xl">
        <p className="text-center text-[10px] font-bold tracking-widest text-muted-foreground">这一段，档案没有收</p>
        <div className="mt-4 space-y-3">
          {LINES.slice(0, shown).map((item, i) => (
            <p
              key={i}
              className={item.by === "你" ? "text-right text-sm leading-relaxed text-muted-foreground" : "text-sm leading-relaxed text-card-foreground"}
            >
              <span className="mr-1.5 text-xs font-bold tracking-widest text-primary">{item.by}：</span>
              「{item.text}」
            </p>
          ))}
        </div>
        {shown >= LINES.length && (
          <p className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-center text-xs leading-relaxed text-muted-foreground">
            沉默不是没有声音。它是一种只有特定角色能听得见的声音。
          </p>
        )}
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onDismiss}
            aria-label="不说话，收下这一段"
            title="不说话，收下这一段"
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
          >
            ……（收下）
          </button>
        </div>
      </div>
    </div>
  );
}
