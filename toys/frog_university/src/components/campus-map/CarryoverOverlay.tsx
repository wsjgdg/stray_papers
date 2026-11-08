/**
 * 校园地图 · 结转（批次 DT「结转」）
 * 学期真的结束了。哪些跟着你走，哪些留在这个学期？
 * 三种处理：照单 / 全带走 / 全交出——没有正确的，
 * 只有你的小宇宙最后跟着哪一册走。
 */
import { useState } from "react";
import { ArrowRightCircle } from "lucide-react";
import { CARRYOVER_DISCOVERY, CARRYOVER_DONE, CARRYOVER_NOTICE, CARRYOVER_OUTCOMES } from "@/data/carryover";
import { RichText } from "@/components/common/RichText";

interface CarryoverOverlayProps {
  /** 递单那一天 */
  day: number;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "follow" | "pocket" | "surrender") => void;
  /** 收下 */
  onClose: () => void;
}

export function CarryoverOverlay({ day, onRespond, onClose }: CarryoverOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"follow" | "pocket" | "surrender" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="结转"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <ArrowRightCircle size={13} aria-hidden />
            档案室 · 移交清单
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "学期真的结束了"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "follow"
                    ? "照单办结"
                    : choice === "pocket"
                      ? "全带走"
                      : "全交出"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 清单分两栏
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={CARRYOVER_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《移交清单》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={CARRYOVER_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  在册事项：（随卷宗结转） · 非在册事项：（空栏待定）
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看那两个栏
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有你的小宇宙最后跟着哪一册走。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("follow");
                    onRespond("follow");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">照单</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    该结转的结转，个人的留着。被注意值 +1——两样都办完了：一份跟着你走，一份留在这个学期。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("pocket");
                    onRespond("pocket");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">全带走</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    该结转的你也收了。被注意值 +2——你的抽屉从此比别的抽屉重：里面装的是一整个学期的下落。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("surrender");
                    onRespond("surrender");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">全交出</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    编外宇宙进了制度。沉默值 +1——你的抽屉空了：这栋楼第一次完整地拥有了你名下的一切。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={CARRYOVER_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={CARRYOVER_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={CARRYOVER_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={CARRYOVER_DONE} />
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
