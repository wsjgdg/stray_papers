/**
 * 校园地图 · 补页（批次 CT「补页」）
 * 档案室的蛙第一次离开柜台来找你：你的卷宗缺了一页，遗失原因——经办失误。
 * 三种补法：照实补述 / 少说一点 / 多写一点——没有正确的，只有补上去的是什么。
 */
import { useState } from "react";
import { FileQuestion } from "lucide-react";
import {
  LOST_PAGE_DONE,
  LOST_PAGE_DISCOVERY,
  LOST_PAGE_NOTICE,
  LOST_PAGE_OUTCOMES,
} from "@/data/lostPage";
import { RichText } from "@/components/common/RichText";

interface LostPageOverlayProps {
  /** 补述那一天 */
  day: number;
  /** 补法（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "faithful" | "sparse" | "extra") => void;
  /** 收下 */
  onClose: () => void;
}

export function LostPageOverlay({ day, onRespond, onClose }: LostPageOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"faithful" | "sparse" | "extra" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="补页"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FileQuestion size={13} aria-hidden />
            缺页通知 · 补述笔录
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "你的卷宗缺了一页"
              : stage === "ask"
                ? "你讲，我记"
                : stage === "outcome"
                  ? choice === "faithful"
                    ? "以补述为准"
                    : choice === "sparse"
                      ? "无补充"
                      : "编号续上"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={LOST_PAGE_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《补述笔录》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={LOST_PAGE_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  记录人：档案室。核对方式：无——原件已不在，无从核对。
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  接过笔
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种补法。没有正确的——只有补上去的是什么。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("faithful");
                    onRespond("faithful");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    照实补述
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    你把记得的讲了。被注意值 +1——你的记性出了这栋楼没人认，在这里，它现在有编号。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("sparse");
                    onRespond("sparse");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    少说一点
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    删减版，结尾一行「当事人确认无补充」。沉默值 +1——缺的那部分，从此不存在。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("extra");
                    onRespond("extra");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    多写一点
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    把一件它从来没记过的事也写上去。被注意值 +2——写上去的，就是发生过的。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={LOST_PAGE_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={LOST_PAGE_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={LOST_PAGE_OUTCOMES[choice].filing} />
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("done")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收下回执
                </button>
              </div>
            </>
          )}

          {stage === "done" && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={LOST_PAGE_DONE} />
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收下
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
