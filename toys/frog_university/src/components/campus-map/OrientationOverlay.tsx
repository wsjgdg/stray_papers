/**
 * 校园地图 · 迎新（批次 BT「迎新」）
 * 报到：窗口后面是你，递表来的是一只新蛙——没有名字，报到处先给编号。
 *   它把一张表递过来：入学登记表。栏目你都背得出——你填过同一张。
 * 第一行：表的第一页是空的。新档案要有第一行，谁来写？窗口后面是你。
 *   你写下了它的第一行。档案不修改第一行——它要带着这一行走完整个学期。
 * 指路：它问：「哪里能不填表？」你想了想，指了指湖的方向。它去了。
 *   三天后你看见它，它坐在湖边登记处，事由一栏写着：散步。
 *   你以为你给它指了条路——你指的只是另一张表。
 * 编号：名册上多了一行：第 7 号。你不是最后一号了——制度有了下一个你。
 *   它填的表、写的行、按的章，都会变成别人的档案——像你一样。
 */
import { useState } from "react";
import { UserPlus } from "lucide-react";

interface OrientationOverlayProps {
  /** 档案行的天数 */
  day: number;
  /** 迎新完了（落档口径：你替它写的第一行） */
  onAck: (note: string) => void;
}

export function OrientationOverlay({ day, onAck }: OrientationOverlayProps) {
  const [step, setStep] = useState(0);
  const [note, setNote] = useState("");

  /** 阶段：0 报到 · 1 第一行 · 2 写下 · 3 指路 · 4 编号 */
  const title = step === 0 ? "报到处" : step === 1 ? "入学登记表" : step === 2 ? "第一行" : step === 3 ? "指路" : "编号";

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="迎新"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <UserPlus size={13} aria-hidden />
            学工办 · 报到处
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">{title}</h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                窗口来了一个新蛙。没有名字——报到处先给编号。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                它把一张表递过来：入学登记表。栏目你都背得出——你填过同一张。
                交两份，存档四年；「字要写清楚」，最上面一行这样写着。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你收下表。窗口不判断，窗口只负责收——但这一张，你收得很慢。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收表
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                表的第一页是空的。新档案要有第一行——新档案的第一行，由窗口后面的蛙写。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">谁来写？窗口后面是你。</p>
              <input
                type="text"
                value={note}
                maxLength={24}
                onChange={(event) => setNote(event.target.value)}
                placeholder="该蛙……"
                className="mt-3 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:shadow-focus"
              />
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">最多二十四字。这一行不修改——它带着这一行走完整个学期。</p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  写下
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你写下了它的第一行：{note.trim() || "该蛙到校。其他人员。"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">档案不修改第一行。它要带着这一行走完整个学期。</p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你想起自己档案的第一行——上面写的是什么，你已经想不起来了。
                你只记得当时也有一只蛙替你收表。它写得慢不慢，你不记得了。
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
                它收好回执，问了一句：「哪里能不填表？」
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你想了想，指了指湖的方向。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">它去了。</p>
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
                三天后你看见它。它坐在湖边登记处，事由一栏写着：散步。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你以为你给它指了条路。<span className="font-bold">你指的只是另一张表。</span>
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，新蛙到校（第 7 号）。第一行由该蛙代写
                {note.trim() ? `：${note.trim()}` : "。"}
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                名册上多了一行。你不是最后一号了——制度有了下一个你。
                它填的表、写的行、按的章，都会变成别的档案——像你一样。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAck(note)}
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
