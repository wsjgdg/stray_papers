/**
 * 校园地图 · 迎检（批次 BL「迎检」）
 * 迎检：上级检查组进驻，你的柜子在重点名册上——不是你重要，是这一格留的记录最多。
 * 轮查：互查名单是倒着排的——你翻过它的柜子，它翻你的。检查记录一栏只写「无异常」：
 *   它翻到哪一页、在哪一行停过，记录不写——检查记录只写结论。
 * 查阅申请：你想看那行意见，填了一张查阅申请——回复「不予受理。申请查阅本人档案，属于越权」。
 *   理由一栏写了什么，都改变不了那行批注——「不予受理」不读理由。
 *   档案里写你的是别人。写你的那一栏，轮不到你自己看。（也可以不填：那行意见你没看到，以后也不会看到。）
 * 检查意见：柜门上贴一张条：档案完整，无异常。下面一行小字——
 *   「无异常是指档案没有异常，不是指你。」完整，不等于没错；只是没有一格能装下「错」。
 */
import { useState } from "react";
import { ScanSearch } from "lucide-react";

interface InspectionOverlayProps {
  /** 查你档案的那只（互查名单倒着排——你翻过它的柜子） */
  checkerName: string;
  /** 档案行的天数 */
  day: number;
  /** 受检完了（落档口径：有没有申请过查阅本人档案——申请过，不予受理也归档） */
  onAck: (applied: boolean) => void;
}

export function InspectionOverlay({ checkerName, day, onAck }: InspectionOverlayProps) {
  const [step, setStep] = useState(0);
  const [reason, setReason] = useState("本人档案");

  /** 阶段：0 迎检通知 · 1 轮查 · 2 查阅申请（填/不填）· 3 退件 · 4/5 检查意见 */
  const title =
    step === 0 ? "迎检通知" : step === 1 ? "轮查" : step === 2 ? "查阅申请" : step === 3 ? "退件" : "检查意见";

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="迎检"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <ScanSearch size={13} aria-hidden />
            档案室 · 检查组
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">{title}</h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                通知贴在柜门上：上级检查组本周进驻，抽查档案。重点名册上一行是你的柜子。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                不是你重要——是这一格留的记录最多。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                「留的记录最多」的意思：你说过的话、你签过的章、你按过的结论，都在里面。
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
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                下午，检查组开柜。查你档案的那只，上周的互查名单上有它——你翻过它的柜子。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                {checkerName}翻了一下午。检查记录一栏只写了一个词：无异常。
                它翻到哪一页、在哪一行停过，记录不写——检查记录只写结论。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                互查名单是倒着排的：你查过它，它查你。柜子对着柜子，没有蛙问过柜子愿不愿意。
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
                你想看那行意见——它查完之后的档案里，有没有你的名字以外的字。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">你填了一张查阅申请。理由一栏：</p>
              <input
                type="text"
                value={reason}
                maxLength={24}
                onChange={(event) => setReason(event.target.value)}
                placeholder="本人档案"
                className="mt-3 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:shadow-focus"
              />
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                最多二十四字。也可以不填——那行意见你没看到，以后也不会看到。
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  不填了
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  填申请
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                第二天，申请被退回来。理由一栏你写的是：{reason.trim() || "本人档案"}。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                批注一行：<span className="font-bold">不予受理。申请查阅本人档案，属于越权。</span>
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                理由一栏写了什么，都改变不了那行批注——「不予受理」不读理由。档案里写你的是别人。
                写你的那一栏，轮不到你自己看。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  继续
                </button>
              </div>
            </>
          )}

          {(step === 4 || step === 5) && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                检查组走之前，在你的柜门上贴了一张条：<span className="font-bold">档案完整，无异常。</span>
              </p>
              {step === 4 && (
                <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                  你没有申请。那行意见你没看到——以后也不会看到。
                </p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                条的下面还有一行小字：无异常是指档案没有异常——不是指你。
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙档案受检。检查意见：无异常。
                {step === 5 ? "查阅本人档案，未予受理（越权）。" : ""}
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你是档案最完整的那只。完整，不等于没错——只是没有一格能装下「错」。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAck(step === 5)}
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
