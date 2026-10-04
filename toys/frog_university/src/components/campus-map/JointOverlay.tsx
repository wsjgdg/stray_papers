/**
 * 校园地图 · 联名（批次 DO「联名」）
 * 它来找你。有一份说明，需要两个名字。
 * 三种处理：签 / 不签 / 改一处——没有正确的，
 * 只有那页纸最后装着几个名字。
 */
import { useState } from "react";
import { PenLine } from "lucide-react";
import { JOINT_DISCOVERY, JOINT_DONE, JOINT_NOTICE, JOINT_OUTCOMES } from "@/data/joint";
import { RichText } from "@/components/common/RichText";

interface JointOverlayProps {
  /** 递单那一天 */
  day: number;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "sign" | "hold" | "edit") => void;
  /** 收下 */
  onClose: () => void;
}

export function JointOverlay({ day, onRespond, onClose }: JointOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"sign" | "hold" | "edit" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="联名"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <PenLine size={13} aria-hidden />
            联名说明 · 一栏已签
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "有一栏是空的"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "sign"
                    ? "两个名字"
                    : choice === "hold"
                      ? "空栏"
                      : "改了措辞"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 调阅人栏：不予告知
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={JOINT_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《联名说明》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={JOINT_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  调阅人栏：已签（不予告知） · 知悉栏：（空）
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  接过那页纸
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有那页纸最后装着几个名字。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("sign");
                    onRespond("sign");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">签</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    这是你们第一次在同一页纸上出现。被注意值 +1——它替你瞒的事，你替它认了。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("hold");
                    onRespond("hold");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不签</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    空栏留置。沉默值 +1——两份纸都缺一个名字，缺的那只蛙，你们都知道是谁。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("edit");
                    onRespond("edit");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">改一处</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    把它的措辞改成你的。被注意值 +2——它写的说明，用你的话归了档。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={JOINT_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={JOINT_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={JOINT_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={JOINT_DONE} />
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
