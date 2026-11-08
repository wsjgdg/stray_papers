/**
 * 校园日历 · 期末周横幅：距期末 X 天 + 期末特别篇预告。
 */
import { Moon } from "lucide-react";

interface FinalWeekBannerProps {
  daysLeft: number;
  /** 进场错拍（批次 CH）：0 = 与页面同拍 */
  enterDelay?: number;
}

export function FinalWeekBanner({ daysLeft, enterDelay = 0 }: FinalWeekBannerProps) {
  return (
    <section
      aria-label="期末周提示"
      className="anim-fade-up mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 shadow-md"
      style={{ animationDelay: `${enterDelay}ms` }}
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
        <Moon size={13} />
        期末周
      </span>
      <p className="text-sm font-bold text-primary">
        {daysLeft > 0 ? `距期末 ${daysLeft} 天` : "期末考试就在今天"}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        深夜事件换成了期末特别篇：通宵自习室、占座、走廊背书。天黑得也比平时早一点。
      </p>
    </section>
  );
}
