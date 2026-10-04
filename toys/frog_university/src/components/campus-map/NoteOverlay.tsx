/**
 * 校园地图 · 便条（批次 CZ「便条」）
 * 你的信格里有一张纸——没有编号，没有抬头，没有落款。字是手写的。
 * 三种处理：回一张 / 收着不回 / 去蹲信格——没有正确的，只有这张纸最后停在谁手里。
 */
import { useState } from "react";
import { PenLine } from "lucide-react";
import { NOTE_DONE, NOTE_DISCOVERY, NOTE_OUTCOMES, NOTE_TEXT } from "@/data/note";
import { RichText } from "@/components/common/RichText";

interface NoteOverlayProps {
  /** 收到那一天 */
  day: number;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "reply" | "keep" | "watch") => void;
  /** 收下 */
  onClose: () => void;
}

export function NoteOverlay({ day, onRespond, onClose }: NoteOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"reply" | "keep" | "watch" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="便条"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <PenLine size={13} aria-hidden />
            信格 · 无编号
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "一张手写的纸"
              : stage === "ask"
                ? "它写了别回信"
                : stage === "outcome"
                  ? choice === "reply"
                    ? "回了"
                    : choice === "keep"
                      ? "收着"
                      : "对了一眼"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={NOTE_DISCOVERY} />
              <div className="mt-3 whitespace-pre-line rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground">
                {NOTE_TEXT}
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  折回去
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                它写了「别回信」。三种处理。没有正确的——只有这张纸最后停在谁手里。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("reply");
                    onRespond("reply");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">回一张</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    想了很久，最后写的是「知道了」。被注意值 +1——这算你先违反的。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("keep");
                    onRespond("keep");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">收着不回</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    和那张知会单放一起。沉默值 +1——把它保持在它最好的形状里。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("watch");
                    onRespond("watch");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    去蹲信格
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    蹲两天。被注意值 +2——你们互相知道对方长什么样了。这件事比档案结实。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={NOTE_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={NOTE_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={NOTE_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={NOTE_DONE} />
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
