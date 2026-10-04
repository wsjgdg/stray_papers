/**
 * 校园地图 · 帮带（批次 BJ「帮带」）
 * 帮带通知：本学期起，窗口配帮带一名——帮带不计入编制，帮带是义务。跟学内容一栏只有一个词：流程。
 * 第一课：它带着一个本子，问「这一份，盖还是退」。你说「窗口不判断」——它把这句话记进本子。
 *   本子的格式和你的档案一模一样：同一栏目的名称，同一种排版，连「经手」后面的冒号都对齐。
 *   它不是在记你说话，它是在抄格式。
 * 代值：它替你值了半天班——排班表那一格写的还是你的名字。处理单上：签章「格式相符」，退件「格式不符」。
 *   它学会的第一个词是格式。它退件的时候笔迹很稳——它练过。
 * 出师：它转正了。推荐人一栏写着你的名字——你没写过推荐，那一栏的字是它照着你的笔迹描的。
 *   值班表明天那一格写的是它的名字。你的调任通知写着「另行安排」——移交单上空白的那一栏，现在是你。
 */
import { useState } from "react";
import { BookOpen } from "lucide-react";

interface MentoringOverlayProps {
  /** 帮带是哪只 */
  apprenticeName: string;
  /** 档案行的天数 */
  day: number;
  /** 帮带完了（落档 + 收浮层） */
  onAck: () => void;
}

export function MentoringOverlay({ apprenticeName, day, onAck }: MentoringOverlayProps) {
  const [step, setStep] = useState(0);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="帮带"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <BookOpen size={13} aria-hidden />
            学工办 · 窗口
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {step === 0 ? "帮带通知" : step === 1 ? "第一课" : step === 2 ? "代值" : "出师"}
          </h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                窗口旁边贴出一张通知：本学期起，窗口配帮带一名。帮带——{apprenticeName}。
                帮带不计入编制，帮带是义务。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                通知的最后一行写着：帮带自上岗之日起跟学。跟学内容：流程。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                跟学内容一栏只有一个词。不是「业务」，不是「态度」——是「流程」。
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
                {apprenticeName}第一次坐到你旁边。它带着一个本子，翻到第一页。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">它问：「这一份，盖还是退？」</p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">你说：「窗口不判断。」</p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                它把这句话记进本子。你看了一眼——本子的格式和你的档案一模一样：同一栏目的名称，同一种排版，
                连「经手」后面的冒号都对齐。它不是在记你说话，它是在抄格式。
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
                周四下午，它替你值了半天班。排班表那一格写的还是你的名字——它坐你的位置，档案照样记在你头上。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你回来的时候看了一眼处理单：签章一份，理由栏写「格式相符」；退件一份，理由栏写「格式不符」。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                它学会的第一个词是格式。它退件的时候笔迹很稳——不是第一次写「格式」这两个字了。它练过。
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
                学期末，它转正了。转正表上的推荐人一栏写着你的名字——你没写过推荐。
                那一栏的字，是它照着你的笔迹描的。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                值班表明天那一格写的是它的名字。加粗。整栏只有这一个。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你的调任通知贴在窗口旁边，上面写着：另行安排。没有具体安排——「另行安排」的意思是：之后不用来了。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你想起那张移交单：原记录员，已离任；离任原因一栏是空的。现在那一栏写的是你。你也是空着走的。
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙完成帮带。新任记录员已就位。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                它学会了你的格式。它现在坐在窗口——「窗口不判断，窗口只负责收。」它知道这句话是谁教的。
                它不会问你去哪儿了，就像你没问过上一只。
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
