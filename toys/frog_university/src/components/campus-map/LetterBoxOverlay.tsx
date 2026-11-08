/**
 * 校园地图 · 互通（批次 DP「互通」）
 * 它来递了一张表：《信格互通申请》。
 * 三种处理：通 / 不通 / 单向——没有正确的，
 * 只有你的信格最后开几个口。
 */
import { useState } from "react";
import { Inbox } from "lucide-react";
import {
  LETTER_BOX_DISCOVERY,
  LETTER_BOX_DONE,
  LETTER_BOX_NOTICE,
  LETTER_BOX_OUTCOMES,
  letterBoxStateOf,
} from "@/data/letterBox";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface LetterBoxOverlayProps {
  /** 递单那一天 */
  day: number;
  /** 存档（信格现状按它派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "both" | "closed" | "oneway") => void;
  /** 收下 */
  onClose: () => void;
}

export function LetterBoxOverlay({ day, save, onRespond, onClose }: LetterBoxOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"both" | "closed" | "oneway" | null>(null);
  const boxState = letterBoxStateOf(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="互通"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Inbox size={13} aria-hidden />
            信格 · 通道申请
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "通道不进任何一册"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "both"
                    ? "两个口"
                    : choice === "closed"
                      ? "一个口"
                      : "反向口留置"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · {boxState}
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={LETTER_BOX_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《信格互通申请》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={LETTER_BOX_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  你的信格现状：{boxState}
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  接过那张表
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有你的信格最后开几个口。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("both");
                    onRespond("both");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">通</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    双向开通。被注意值 +1——这栋楼里第一次有一种通道，全程都在它看不见的地方。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("closed");
                    onRespond("closed");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不通</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    信格还是只有一个口。沉默值 +1——它等的不是通道：它等的是你说「开」。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("oneway");
                    onRespond("oneway");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">单向</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    它是唯一的出口，你是唯一的进口。被注意值 +2——所有往来的开口都是制度定的；只有一个口，是蛙定的。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={LETTER_BOX_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={LETTER_BOX_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={LETTER_BOX_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={LETTER_BOX_DONE} />
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
