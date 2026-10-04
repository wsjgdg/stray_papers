/**
 * 校园地图 · 交接（批次 BH「交接」）
 * 移交单：原记录员已离任，接任——你。离任原因一栏是空的；你签收的是位置，不是它。
 * 抽屉：上一只蛙积压的未归档档案，每一份都在等一个结论。结论只有两个选项——
 *   「属实」／「不予认定」。「存疑」不在流程里：你试过那两个字，笔停了一下，还是只能填这两个。
 * 属实：那份从此是它的档案——不是它的说法，是档案的说法。核销：像没有发生过一样。
 * 制度不问你懂不懂，只问你签不签。上一只蛙的抽屉是满的，满的全是核销——它没有认定过谁。现在轮到你填了。
 */
import { useState } from "react";
import { Archive } from "lucide-react";

export interface HandoverItem {
  /** 这份档案是关于哪只蛙的 */
  frogName: string;
  /** 事项（档案腔） */
  text: string;
  /** 收文日期 */
  day: number;
}

interface HandoverOverlayProps {
  /** 抽屉里积压的档案（种子派生，三份） */
  items: HandoverItem[];
  /** 档案行的天数 */
  day: number;
  /** 三份的结论一次签完（顺序与 items 一致） */
  onAck: (verdicts: ("confirmed" | "denied")[]) => void;
}

const FILE_COUNT = 3;

export function HandoverOverlay({ items, day, onAck }: HandoverOverlayProps) {
  const [step, setStep] = useState(0);
  const [verdicts, setVerdicts] = useState<("confirmed" | "denied")[]>([]);
  const files = items.slice(0, FILE_COUNT);
  while (files.length < FILE_COUNT) {
    files.push({ frogName: "在册的一只", text: "在自习楼的窗户边站了很久。窗外的操场没有开灯。", day });
  }

  /** 阶段：0 移交单 · 1 抽屉 · 2~4 逐份过档 · 5~7 逐份结论 · 8 收尾 */
  const isFileStep = step >= 2 && step < 2 + FILE_COUNT;
  const isResultStep = step >= 2 + FILE_COUNT && step < 2 + FILE_COUNT * 2;
  const fileIndex = Math.min(FILE_COUNT - 1, step - 2);
  const resultIndex = Math.min(FILE_COUNT - 1, step - 2 - FILE_COUNT);
  const current = files[isFileStep ? fileIndex : resultIndex] ?? files[0];
  const currentVerdict = verdicts[resultIndex];
  const confirmedCount = verdicts.filter((item) => item === "confirmed").length;
  const deniedCount = verdicts.filter((item) => item === "denied").length;
  const wrapped = step >= 2 + FILE_COUNT * 2;

  const title = step === 0 ? "移交单" : step === 1 ? "抽屉" : isFileStep ? "待核档案" : isResultStep ? "已核" : "接任";

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="交接"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Archive size={13} aria-hidden />
            档案室 · 记录员座
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">{title}</h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                门口贴着一张移交单。上面写着：原记录员，已离任。离任原因一栏是空的。接任——你。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                移交清单：档案 37 份 · 划痕 11 处 · 补记 6 句。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你签收的是位置，不是它。它去哪儿了，单子上没有这一栏——离任原因本来也是空的。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  签收
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                办公室的桌子后面有一个抽屉。抽屉里积着没归档的档案——每一份都在等一个结论。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                三份。收文日期都是过去的，经手一栏都空着：上一只蛙没来得及写，也可能是不想写。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                「结论」只有两个选项：属实，不予认定。「存疑」不在流程里——你试过那两个字，笔停了一下，还是只能填这两个。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  开始处理
                </button>
              </div>
            </>
          )}

          {isFileStep && current && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                第 {fileIndex + 1} 份。收文日期：第 {current.day} 天。事项：该蛙{current.text}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                涉及人员：{current.frogName}。经手：记录员（空白）。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                空白就是没处理。现在它归你了。
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setVerdicts((prev) => {
                      const next = [...prev];
                      next[fileIndex] = "denied";
                      return next;
                    });
                    setStep(2 + FILE_COUNT + fileIndex);
                  }}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  不予认定
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVerdicts((prev) => {
                      const next = [...prev];
                      next[fileIndex] = "confirmed";
                      return next;
                    });
                    setStep(2 + FILE_COUNT + fileIndex);
                  }}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  属实
                </button>
              </div>
            </>
          )}

          {isResultStep && current && (
            <>
              {currentVerdict === "confirmed" ? (
                <>
                  <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                    你按下了结论。那一栏填上了：经认定，属实。档案合上，进了柜子——从此那是它的档案：不是它的说法，是档案的说法。
                  </p>
                  <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                    档案：第 {day} 天，记录员（你）认定：属实。{current.frogName}的行为记录归档。
                  </p>
                </>
              ) : (
                <>
                  <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                    你按下了不予认定。那份进了一个标着「已核销」的盒子——它没有变成谁的档案，就像没有发生过一样。归档的方式是取消。
                  </p>
                  <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                    档案：第 {day} 天，记录员（你）认定：不予认定。该卷核销。
                  </p>
                </>
              )}
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(resultIndex < FILE_COUNT - 1 ? 2 + resultIndex + 1 : 2 + FILE_COUNT * 2)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  {resultIndex < FILE_COUNT - 1 ? "下一份" : "继续"}
                </button>
              </div>
            </>
          )}

          {wrapped && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三份都处理完了。抽屉空了一半——剩下的那些，上一只蛙自己处理过了：每一份都是「不予认定」。一整抽屉的核销。
                它记录了所有人，它没有认定过谁。
              </p>
              {confirmedCount > 0 && (
                <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                  认定属实的那只后来在校道上遇见你。它说：「都写完了？」没等你答，它走了。
                </p>
              )}
              {deniedCount > 0 && (
                <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                  不予认定的那只说：「谢了。」——你没有帮它什么。你没有改变任何事实，你只是按了一下。
                </p>
              )}
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">周报里提了一句：新任记录员上手很快。</p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙接任记录员。积压事项已核：属实 {confirmedCount} 份，核销 {deniedCount} 份。
              </p>
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                制度不问你懂不懂，只问你签不签。现在所有等你结论的档案都经过你的手——办公室的门一直开着。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                上一只蛙的抽屉是满的，满的全是核销。现在轮到你填了。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAck(verdicts)}
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
