/**
 * 校园地图 · 停课日（批次 AS「另一些日子」之一）
 * 本学期由种子派生的某一天，课表是空的。停课不需要理由——上课才需要排期。
 * 档案里这一天也是空的：没有安排的日子，档案不收。放假不是给你的。
 */
import { PauseCircle } from "lucide-react";

interface HolidayOverlayProps {
  /** 过了这一天（落档 + 收浮层） */
  onAck: () => void;
}

export function HolidayOverlay({ onAck }: HolidayOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="今日停课"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <PauseCircle size={13} aria-hidden />
            教务处 · 临时通知
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">今日停课</h2>

          <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
            今天的课表是空的。公告栏只有一行：今日停课。没有理由栏——停课不需要理由，上课才需要排期。
          </p>
          <p className="mt-2 text-sm leading-relaxed text-card-foreground">
            你把这一天过了一遍：哪都没去，什么都没做。
          </p>
          <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
            档案里这一天也是空的——该蛙无课。无记录。不是你什么都没做，是这一天没有安排：
            没有安排的日子，档案不收。
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            放假不是给你的。没有安排的日子，你在里面不存在。
          </p>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onAck}
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
