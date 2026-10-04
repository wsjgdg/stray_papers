/**
 * 校园地图 · 用途（批次 BR「用途」）
 * 申报：「沉默用途申报表」发下来——你的沉默值 N 点，用途一栏必填。
 * 不予受理：你填「无」。受理窗口的蛙看了一眼，盖章：不予受理。
 *   理由一栏印着：沉默不存在「无用途」这一项——沉默的用途是它的属性。
 *   理由写了什么都不改变批注——「不予受理」不读理由。
 * 名目：这一次，表格背面印着可选的名目，只有三个：备考／情绪／其他人员——和报名表一样，没有第四个。
 *   受理之后名目印上去：沉默值还是那些沉默值，只是从此它有名字了——有名字的东西，才好扣。
 * 结转：学期末，没用完的沉默按名目结转，最多十点——发放一次即清零。
 *   用不完不是你的，是名目里的余额。你的沉默成了预算。
 */
import { useState } from "react";
import { Tags } from "lucide-react";

interface SilenceBudgetOverlayProps {
  /** 当前沉默值（申报表上印着） */
  silence: number;
  /** 按名目算好的结转余额（最多十点） */
  carry: number;
  /** 档案行的天数 */
  day: number;
  /** 申报完了（落档口径：选了哪个名目） */
  onAck: (purpose: "study" | "mood" | "other") => void;
}

const PURPOSE_LABELS = { study: "备考", mood: "情绪", other: "其他人员" } as const;

export function SilenceBudgetOverlay({ silence, carry, day, onAck }: SilenceBudgetOverlayProps) {
  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState<keyof typeof PURPOSE_LABELS | null>(null);

  /** 阶段：0 申报表 · 1 不予受理 · 2 选名目 · 3 受理 · 4 结转 */
  const title = step === 0 ? "申报表" : step === 1 ? "不予受理" : step === 2 ? "名目" : step === 3 ? "受理" : "结转";

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="沉默用途申报"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Tags size={13} aria-hidden />
            学工办 · 受理窗口
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">{title}</h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                申报表发下来了。抬头印着：沉默用途申报表。第一栏已经填好了你的沉默值：{silence} 点。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">用途一栏必填。</p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                以前沉默是你的——不说话，不用交代。从这一学期起，沉默也要报用途：
                「没有用途的沉默是浪费。浪费是异常。」
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  填表
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">你填了「无」。</p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                受理窗口的蛙看了一眼，盖章：不予受理。理由一栏印着：
                <span className="font-bold">沉默不存在「无用途」这一项——沉默的用途是它的属性。</span>
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                理由一栏写了什么都不改变批注——「不予受理」不读理由。
                表收回去，要求重填。重填的表背面印着可选的名目。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  重填
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                表格背面印着可选的名目。只有三个——和报名表一样，没有第四个。
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {(Object.keys(PURPOSE_LABELS) as (keyof typeof PURPOSE_LABELS)[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setPurpose(key);
                      setStep(3);
                    }}
                    className="rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    {PURPOSE_LABELS[key]}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && purpose && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                受理了。名目印在沉默值旁边：{silence} 点，用途：{PURPOSE_LABELS[purpose]}。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                沉默值还是那些沉默值。只是从此它有名字了——<span className="font-bold">有名字的东西，才好扣。</span>
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                「备考」的意思是这一季的沉默都在为一件事攒着；「情绪」的意思是这一季的沉默都有出处；
                「其他人员」的意思是：不属于前两类的沉默，归这一类——其他人员，永远收得下。
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

          {step === 4 && purpose && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                学期末，没用完的沉默按名目结转——最多结转十点，发放一次即清零。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                用不完不是你的，是名目里的余额。<span className="font-bold">你的沉默成了预算。</span>
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙申报沉默用途：{PURPOSE_LABELS[purpose]}。受理。可结转 {carry} 点。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAck(purpose)}
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
