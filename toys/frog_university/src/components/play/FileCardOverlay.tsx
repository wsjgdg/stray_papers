/**
 * 文件卡片（批次 AY「注视」之一：挡开）
 * 行政楼的窗口不看脸——你试图注视窗口后面的人，它把你的视线物理地挡回纸面上。
 * 你被允许看什么，是被规定的。
 */
import { FileText } from "lucide-react";

interface FileCardOverlayProps {
  onClose: () => void;
}

export function FileCardOverlay({ onClose }: FileCardOverlayProps) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-background/85 p-5 backdrop-blur-sm"
      role="presentation"
>
      <div
        role="dialog"
        aria-label="文件"
        className="anim-fade-up my-auto w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
          <FileText size={13} aria-hidden />
          学工办 · 待阅文件
        </p>
        <p className="mt-3 text-sm font-bold leading-relaxed text-card-foreground">「别看我，看文件。」</p>

        <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
          <p className="text-xs font-bold text-primary">温馨提示：关于查阅档案的通知</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            查阅档案请先取号。取号请先核对身份。核对身份请出示证件。出示证件请先查阅档案。
          </p>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          你试图看窗口后面的人。它把你的视线挡了回来——不生气，也不解释，只把文件又推近了一点。
        </p>
        <p className="mt-2 text-[10px] font-bold leading-relaxed text-primary">
          你被允许看什么，是被规定的。
        </p>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
          >
            看完了
          </button>
        </div>
      </div>
    </div>
  );
}
