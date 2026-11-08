/**
 * 校园地图 · 顶班（批次 DI「顶班」）
 * 有蛙来找你。它有事，走不开，班次还是那个班次。
 * 三种处理：照办 / 留名 / 不顶——没有正确的，
 * 只有那一天在档案上最后长成什么样。
 */
import { useState } from "react";
import { UserCheck } from "lucide-react";
import {
  SUBSTITUTE_DISCOVERY,
  SUBSTITUTE_DONE,
  SUBSTITUTE_NOTICE,
  SUBSTITUTE_OUTCOMES,
  substitutePeerOf,
} from "@/data/substitute";
import { RichText } from "@/components/common/RichText";

interface SubstituteOverlayProps {
  /** 求顶那一天 */
  day: number;
  /** 学期种子（求顶的那一只按它派生） */
  seed: number;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "serve" | "sign" | "refuse") => void;
  /** 收下 */
  onClose: () => void;
}

export function SubstituteOverlay({ day, seed, onRespond, onClose }: SubstituteOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"serve" | "sign" | "refuse" | null>(null);
  const peer = substitutePeerOf(seed);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="顶班"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <UserCheck size={13} aria-hidden />
            代班委托单
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "能不能帮我顶一天班"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "serve"
                    ? "办了，没名字"
                    : choice === "sign"
                      ? "页边有一行"
                      : "空班"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 委托蛙：{peer}
          </p>

          {stage === "find" && (
            <>
              <RichText
                className="mt-4 text-sm leading-relaxed text-card-foreground"
                text={`${peer}来找你。${SUBSTITUTE_DISCOVERY}`}
              />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《代班委托单》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={SUBSTITUTE_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  委托栏：{peer} · 受托栏：（规程里没有这一栏）
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  接过单子
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有那一天在档案上最后长成什么样。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("serve");
                    onRespond("serve");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">照办</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    照它平时的样子办。被注意值 +1——你办过，但没有人能证明，包括你自己。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("sign");
                    onRespond("sign");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">留名</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    在页边写自己的名字。被注意值 +2——页边那行不算数，但谁也擦不掉。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("refuse");
                    onRespond("refuse");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不顶</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    那一天的班空了。沉默值 +1——档案上没有这一眼，但你有。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={SUBSTITUTE_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={SUBSTITUTE_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={SUBSTITUTE_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={SUBSTITUTE_DONE} />
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
