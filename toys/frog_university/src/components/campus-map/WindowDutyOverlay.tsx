/**
 * 校园地图 · 窗口（批次 BI「窗口」）
 * 排班表：你的名字第一次出现在「窗口」那一格——不是强调，是整栏只有这一个。
 * 值班：窗口不判断，窗口只负责收。收表两张；第三份需要盖章——
 *   「申请：把本蛙从名单上移除。」理由一栏：空白。
 * 盖章：章落下去，流程走了。退件：你第一次行使判断——判断在流程里只有一种存在方式：格式不符。
 *   它换了格式回来，措辞更标准、称呼更礼貌，每一处你都挑不出毛病。你只能盖。
 * 下班：还有一只蛙在门口等着没交上表。值班表明天那一格是空白——空白就是没人。
 *   第二天，窗口后面还是你。这一格永远写你。
 */
import { useState } from "react";
import { Inbox } from "lucide-react";

interface WindowDutyOverlayProps {
  /** 两张普通表（窗口不判断，只收） */
  plain: string[];
  /** 交申请的那只蛙（它不知道窗口后面是你） */
  applicantName: string;
  /** 档案行的天数 */
  day: number;
  /** 值班完了（落档口径：那份申请退没退过） */
  onAck: (returned: boolean) => void;
}

const PLAIN_COUNT = 2;

export function WindowDutyOverlay({ plain, applicantName, day, onAck }: WindowDutyOverlayProps) {
  const [step, setStep] = useState(0);
  const [returned, setReturned] = useState(false);

  const sheets = [plain[0] ?? "物品借用单。借用教室的钥匙，用途一栏写的是：开门。", plain[1] ?? "换课申请。理由一栏写的是：时间。"];

  /** 阶段：0 排班表 · 1~2 普通表 · 3 签章决定 · 4 盖了 · 5 退了 · 6 换格式回来 · 7 下班 */
  const title =
    step === 0 ? "排班表" : step <= PLAIN_COUNT ? "收表" : step === 3 ? "签章" : step === 4 || step === 6 ? "已核" : step === 5 ? "退件" : "下班";

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="窗口值班"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Inbox size={13} aria-hidden />
            学工办 · 窗口
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">{title}</h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                排班表贴在窗口旁边。今天上午到下午，「窗口」那一格写的是你的名字——加粗了。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                不是强调。是整栏只有这一个。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                窗口不判断，窗口只负责收。表收进来，放进一个箱子——箱子每周五被搬走。没人知道箱子里去了哪儿，包括你。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  上岗
                </button>
              </div>
            </>
          )}

          {step >= 1 && step <= PLAIN_COUNT && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                第 {step} 份。{sheets[step - 1]}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">窗口不判断。窗口只负责收。</p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收下
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                第三份。这一份需要盖章。
              </p>
              <p className="mt-2 rounded-xl border border-dashed border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed tracking-wider text-card-foreground">
                申请：把本蛙从名单上移除。
                <br />
                申请人：{applicantName}。理由一栏：空白。
              </p>
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                章在你手里。盖了，流程走；不盖，流程停。你签收过位置——现在你拿着章。
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setReturned(true);
                    setStep(5);
                  }}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  退回去
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  盖章
                </button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                章落下去。流程走了。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                理由一栏空着——章替它说了。这一份不需要理由：窗口不判断，窗口只负责收。今天你判断的唯一一次，是没判断。
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，窗口签章一份。名单更新。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(7)}
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
                你把它退了回去。这是你第一次行使判断——而判断在流程里只有一种存在方式：退件单上要写理由。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                理由一栏，你写的是：格式不符。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你没有说「不该」。你也没有说「不好」。你只说了「格式」——制度听得懂的唯一一种反对。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(6)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  继续
                </button>
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                同一件事回来了。措辞更标准，称呼更礼貌，理由一栏填上了：格式已更正。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                每一处你都挑不出毛病。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">你只能盖。</p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                制度不和你争。它改格式。
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，退件一份（理由：格式不符）。更正件签章。名单更新。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(7)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  盖章
                </button>
              </div>
            </>
          )}

          {step === 7 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                值班到下午。窗口合上的时候，门口还有一只蛙在等着，表没交上。它说：「明天再来。」
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你翻到值班表，想看明天那一格写的是谁。那一格是空白的。空白就是没人。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">第二天，窗口后面还是你。这一格永远写你。</p>
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                那只蛙后来在名单更新之后遇见你。它说：「下来了。」不谢，也不问。它以为这是制度的结果——它不知道那一下是你按的。
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙在窗口值班。收表三份，签章一份{returned ? "，退件一份" : ""}。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                值班表上你的名字加粗了。不是强调——是整栏只有这一个。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAck(returned)}
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
