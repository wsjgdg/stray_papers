/**
 * 校园地图 · 零点（批次 AU「开口」之一）
 * 沉默值第一次被交到 0 的那一格。空白不是没有：是你把能说的都说出来了。
 * 剩下的那些话，档案收不下，它也没打算收。
 */
import { CircleDot } from "lucide-react";

interface ZeroOverlayProps {
  onClose: () => void;
}

export function ZeroOverlay({ onClose }: ZeroOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="零点"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <CircleDot size={13} aria-hidden />
            档案 · 数值栏
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">沉默值 0</h2>

          <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
            这一格从来没有这么空过——现在它空着。
          </p>
          <p className="mt-2 text-sm leading-relaxed text-card-foreground">
            空白不是没有：是你把能说的都说出来了。剩下的那些话，档案收不下，它也没打算收。
          </p>
          <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
            沉默的物理空间会跟着松下来：场景里的空淡下去，立绘重新变清楚，被收走的选项一条条回来。
            沉默值可以再涨回去——但第一次归零，只有一次。
          </p>
          <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
            该蛙的沉默值归零。经手：本人。
          </p>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
