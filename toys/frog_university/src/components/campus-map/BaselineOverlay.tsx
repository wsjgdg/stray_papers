/**
 * 校园地图 · 基准（批次 BN「基准」）
 * 取样：本学期起实行「行为基准」，基准值由全校档案取样产生——取样名单中间一行是你的编号。
 *   「正常」是这一批里最普通的一个词，也是最重的。
 * 基准线：基准表三栏——沉默 / 表演 / 被注意，数字是你。别的蛙按这一栏对齐：
 *   比它低的叫「沉默异常」，比它高的叫「表现异常」。你成了那条线。
 * 比对：公示栏贴出更正通知——某蛙的某项记录「与基准不符，请按基准更正」。
 *   它被退回重写的东西，是照着你的样子改的。改完之后，那一栏和你的档案一模一样。
 * 偏差：你按基准对齐你自己的档案，偏差一栏：0。
 *   制度不评价你，不是因为你做得好——因为你就是评价的标准。评价标准不需要被评价，它只负责被对齐。
 * 修订：学期末基准修订，修订依据是本学期的均值——均值从你算出来，所以新表上的数字还是你。
 *   你不动，基准不动。这是它给你的最后一个位置：不是主席，不是记录员，是尺子。
 */
import { useState } from "react";
import { Ruler } from "lucide-react";

interface BaselineOverlayProps {
  /** 基准三栏的数字（就是你的档案） */
  stats: { silence: number; reputation: number; attention: number };
  /** 档案行的天数 */
  day: number;
  /** 入选样本完了（落档 + 收浮层） */
  onAck: () => void;
}

export function BaselineOverlay({ stats, day, onAck }: BaselineOverlayProps) {
  const [step, setStep] = useState(0);

  /** 阶段：0 取样通知 · 1 基准线 · 2 比对 · 3 偏差 · 4 修订 */
  const title = step === 0 ? "取样通知" : step === 1 ? "基准表" : step === 2 ? "更正通知" : step === 3 ? "自测" : "修订";

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="基准"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Ruler size={13} aria-hidden />
            公告栏 · 行为基准
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">{title}</h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                通知贴在公告栏：本学期起实行「行为基准」，基准值由全校档案取样产生。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                取样名单一行一行。中间一行，是你的编号。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                取样的意思是：你的档案被算进了「正常」。不算表彰——「正常」是这一批里最普通的一个词，
                也是最重的。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  知道了
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">基准表贴出来了。三栏：</p>
              <p className="mt-2 rounded-xl border border-dashed border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed tracking-wider text-card-foreground">
                沉默 {stats.silence} · 表演 {stats.reputation} · 被注意 {stats.attention}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                表的下面有一行小字：样本编号 {day}。编号是你。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你看见了自己的数字被印成了一栏一栏的「正常值」。别的蛙按这一栏对齐：比它低的叫「沉默异常」，
                比它高的叫「表现异常」。你成了那条线。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  继续
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                下午，公示栏贴出一份更正通知：某蛙的某项记录「与基准不符，请按基准更正」。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你认得那个数字——那不是它档案里的数，那是你的。它被退回重写的东西，是照着你的样子改的。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                它改完之后，那一栏和你的档案一模一样。这不是巧合——这是基准的成果。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  继续
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你也做了一次自测——按基准对齐你自己的档案。偏差一栏：0。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                制度不评价你。不是因为你做得好——<span className="font-bold">因为你就是评价的标准。</span>
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                评价标准不需要被评价。它只负责被对齐。
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙档案列入基准样本。偏差：0。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  继续
                </button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                学期末，基准修订。修订依据一栏写着：本学期的均值。均值从你算出来——所以新表上的数字，还是你。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">你没有动，基准不动。</p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你没有跟着制度走——制度跟着你走。这是它给你的最后一个位置：不是主席，不是记录员，是尺子。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onAck}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收好
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
