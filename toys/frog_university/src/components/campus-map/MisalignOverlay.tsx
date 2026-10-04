/**
 * 校园地图 · 不符（批次 BO「不符」）
 * 退回：第 N 号档案退回重写，第三次了——理由一栏每次都是同一行：与基准不符。
 *   你是基准样本，这一份退回到你这里。三次的更正件你都看过：数值对得上，措辞对得上，格式对得上。
 *   对不上的那一栏没有数字。
 * 态度栏：它来找你：「我照着抄了。为什么还不符？」不符的那一栏，栏目名称写着：态度。
 *   数值都对得上。不符的是态度。态度没有数字——但制度说它不符。
 *   制度能核出没有数字的东西，这一栏叫态度。
 * 对质：制度派你去谈——基准样本负责解释基准。你说了那句话，你在会议室里听过它（批次 BG）：
 *   「就按这个来。」说出口的时候你听见了自己的声音。它改了。也可以要求复核——
 *   流程里有这一项，用得少但一直有；复核维持原认定，它还是自己改了，
 *   档案里多一行「该蛙曾要求复核」——流程里没有这一项，它是被记进去的。
 * 全齐：学期末它调走了。柜子里少了一份不齐的，全齐。
 *   全齐的意思是：没有一只蛙说不。柜子齐了——你不觉得这是完成，你觉得这是少了一只。
 */
import { useState } from "react";
import { FileX } from "lucide-react";

interface MisalignOverlayProps {
  /** 不符档案是哪只的（BG 举过手、BI 交过申请的那只） */
  objectorName: string;
  /** 档案行的天数 */
  day: number;
  /** 核完了（落档口径：按基准来，还是要求过复核） */
  onAck: (resolved: "aligned" | "reviewed") => void;
}

export function MisalignOverlay({ objectorName, day, onAck }: MisalignOverlayProps) {
  const [step, setStep] = useState(0);
  const [resolved, setResolved] = useState<"aligned" | "reviewed" | null>(null);

  /** 阶段：0 退回通知 · 1 态度栏 · 2 对质（选择）· 3 按基准来 · 4 复核 · 5 全齐 */
  const title =
    step === 0 ? "退回通知" : step === 1 ? "态度栏" : step === 2 ? "对质" : step === 3 ? "已核" : step === 4 ? "复核" : "全齐";

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="基准不符"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FileX size={13} aria-hidden />
            档案室 · 核对
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">{title}</h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                通知夹在案卷里：第 N 号档案退回重写。第三次了。理由一栏每次都是同一行：与基准不符。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">你是基准样本——这一份退回到你这里。</p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                三次的更正件你都看过：数值对得上，措辞对得上，格式对得上。对不上的那一栏没有数字。
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
                它来找你了。它把档案摊在桌上：「我照着抄了。为什么还不符？」
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">你翻到那一页。不符的那一栏，栏目名称写着：态度。</p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                数值都对得上。不符的是态度。态度没有数字——但制度说它不符。
                制度能核出没有数字的东西，这一栏叫态度。
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
                制度派你去谈——基准样本负责解释基准。桌子两把椅子，你坐了过去。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">{objectorName}看着你：「这一栏怎么改？」</p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">桌上有一支笔。两把椅子之间隔着一张表。</p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setResolved("reviewed");
                    setStep(4);
                  }}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  再核一次
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResolved("aligned");
                    setStep(3);
                  }}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  按基准来
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你说了那句话。你在会议室里听过它——「就按这个来。」
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                说出口的时候你听见了自己的声音。不是制度的声音，是你的：你记得这个调子，
                你在这间屋子的另一边听过它。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                {objectorName}看了你一会儿。然后拿起笔，把那一栏改了。改成什么——改成「正常」。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                两种处理最后都落在「已核」上。区别不在纸面——在你说了哪句话。
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

          {step === 4 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你说：「我再核一次。」流程里有这一项——用得少，但一直有。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                复核三天后回来。复核意见一栏写着：经复核，维持原认定。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                复核没有改那一栏。改的是{objectorName}：它自己拿起笔，把那一栏改成了「正常」。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                档案里多了一行：该蛙曾要求复核。流程里没有这一项——它是被记进去的。
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

          {step === 5 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                学期末，{objectorName}调走了。柜子里少了一份不齐的。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">你清点柜子：每一份都对齐了。全齐。</p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙核对基准不符档案一份。{resolved === "reviewed" ? "曾要求复核。" : ""}已核。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                全齐的意思是：没有一只蛙说不。柜子齐了——你不觉得这是完成，你觉得这是少了一只。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAck(resolved ?? "aligned")}
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
