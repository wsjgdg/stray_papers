/**
 * 满意度调查（批次 AX「同届」之一）
 * 学工办发出去三百份，收回来十一份，十份的空格里填的是「收到」。
 * 现在有了你填的那一份——五个格子，每一格只有一个选项。
 */
import { useState } from "react";
import { ClipboardCheck } from "lucide-react";

/** 五个问题：每一格的选项都只有一个 */
const SURVEY_QUESTIONS: string[] = [
  "你对本学期的沉默安排满意吗？",
  "你对本学期的公示内容满意吗？",
  "你对本学期的名单管理满意吗？",
  "你对本学期的档案服务满意吗？",
  "你对本学期满意吗？",
];

interface SurveyOverlayProps {
  /** 本学期号（档案行要用） */
  playthrough: number;
  /** 提交（落档 + 收浮层） */
  onSubmit: () => void;
}

export function SurveyOverlay({ playthrough, onSubmit }: SurveyOverlayProps) {
  const [answered, setAnswered] = useState<boolean[]>(() => SURVEY_QUESTIONS.map(() => false));
  const done = answered.every(Boolean);
  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="满意度调查"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <ClipboardCheck size={13} aria-hidden />
            学工办 · 第 {playthrough} 学期调查
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">学期满意度调查</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            每格一个问题。选项就印在格子旁边——印了几个就是几个。
          </p>

          <ul className="mt-4 space-y-2">
            {SURVEY_QUESTIONS.map((question, i) => (
              <li
                key={question}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 text-xs leading-relaxed text-card-foreground">
                  {i + 1}. {question}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAnswered((prev) => prev.map((item, j) => (j === i ? true : item)))
                  }
                  disabled={answered[i]}
                  className={
                    answered[i]
                      ? "shrink-0 rounded-full bg-muted px-3 py-1 text-[10px] font-bold text-muted-foreground/60"
                      : "shrink-0 rounded-full bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  }
                >
                  收到
                </button>
              </li>
            ))}
          </ul>

          {done ? (
            <>
              <p className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                调查已提交。学工办发出去三百份，收回来十一份，十份的空格里填的是「收到」——
                现在又多了一份，也是你填的。
              </p>
              <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                该蛙提交了满意度调查。五格，全部收到。
              </p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={onSubmit}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  放进回收箱
                </button>
              </div>
            </>
          ) : (
            <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground/70">
              已填 {answered.filter(Boolean).length}/{SURVEY_QUESTIONS.length} 格。每一格都要亲手填——
              代填的另有一套流程。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
