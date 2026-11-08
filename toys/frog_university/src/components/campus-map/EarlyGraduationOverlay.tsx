/**
 * 校园地图 · 申请毕业（批次 AP「校园是活的系统」之三）
 * 提前毕业：不是打通结局，是主动申请——毕业不必等十条线走完。
 * 申请之后直接跳毕业典礼；但成绩单上会写「该蛙未完成全部课程」，
 * 毕业证上会写「准予毕业」。图鉴里多一个结局：《提前》。
 * 提前毕业 = 你选择了结束，但学校仍然给你发证。
 */
import { useState } from "react";
import { GraduationCap } from "lucide-react";

interface EarlyGraduationOverlayProps {
  /** 本学期已完成的常规线数 */
  doneCount: number;
  /** 常规线总数 */
  total: number;
  /** 确认递交：落档并跳图鉴（典礼已经布置好了） */
  onConfirm: () => boolean;
  onClose: () => void;
}

export function EarlyGraduationOverlay({ doneCount, total, onConfirm, onClose }: EarlyGraduationOverlayProps) {
  const [armed, setArmed] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="申请毕业"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <GraduationCap size={13} aria-hidden />
            教务处窗口 · 毕业申请
          </p>

          {armed ? (
            <>
              <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">递上去就结档了</h2>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                受理之后不需要再等任何一节课——礼堂的灯立刻亮。学校照发证；但成绩单上会写：
                <span className="font-bold text-primary">该蛙未完成全部课程。</span>
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setArmed(false)}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  再修修
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onConfirm();
                  }}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  递交申请
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">毕业不必等走完</h2>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你可以现在申请毕业。申请之后，这学期就此结档，直接跳到毕业典礼——
                礼堂的灯为你亮，七只蛙已经上台。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                本学期已完成 {doneCount}/{total} 条剧情线。成绩单上会如实写：
                该蛙未完成全部课程。毕业证上会写：准予毕业。这两张纸装订在同一卷里。
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  再走几条线
                </button>
                <button
                  type="button"
                  onClick={() => setArmed(true)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  我想现在毕业
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
