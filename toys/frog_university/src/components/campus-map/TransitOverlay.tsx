/**
 * 校园地图 · 转递（批次 CW「转递」）
 * 你的卷宗被点名转递了——离柜一趟，途经的部门都可以依职权调阅，免于登记。
 * 三种送法：让它们送 / 自己送 / 申请封缄——没有正确的，只有你的纸在路上被谁看过。
 */
import { useState } from "react";
import { Send } from "lucide-react";
import {
  TRANSIT_DONE,
  TRANSIT_DISCOVERY,
  TRANSIT_NOTICE,
  TRANSIT_OUTCOMES,
  transitDestinationOf,
} from "@/data/transit";
import { RichText } from "@/components/common/RichText";

interface TransitOverlayProps {
  /** 通知那一天 */
  day: number;
  /** 存档种子（去向与事由按它派生） */
  seed: number;
  /** 送法（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "send" | "self" | "seal") => void;
  /** 收下 */
  onClose: () => void;
}

export function TransitOverlay({ day, seed, onRespond, onClose }: TransitOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"send" | "self" | "seal" | null>(null);
  const dest = transitDestinationOf(seed);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="转递"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Send size={13} aria-hidden />
            档案室 · 转递通知
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "你的卷宗要出门了"
              : stage === "ask"
                ? "三种送法"
                : stage === "outcome"
                  ? choice === "send"
                    ? "转递办结"
                    : choice === "self"
                      ? "本人押送"
                      : "封缄启封"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 送往：{dest.office}
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={TRANSIT_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《转递通知》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={TRANSIT_NOTICE} />
                <p className="mt-2 rounded-lg border border-border bg-card p-2 text-sm leading-relaxed text-card-foreground">
                  去向：{dest.office}。事由：{dest.reason}。复核完毕退回原柜。
                </p>
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  注意：转递途中的调阅免于登记。
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看注意事项
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种送法。没有正确的——只有你的纸在路上被谁看过。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("send");
                    onRespond("send");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    让它们送
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    指定转递员，按规程。被注意值 +1——你的纸出了一趟远门，回来时你分不出它有没有变重。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("self");
                    onRespond("self");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">自己送</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    亲手抱着它穿过校园。被注意值 +2——你送的是「我在意」这件事本身，全校园都看见了。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("seal");
                    onRespond("seal");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    申请封缄
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    封条编号登记，途中不得启封。沉默值 +1——但封条本身就是公告，每个部门都多看了一眼。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={TRANSIT_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={TRANSIT_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={TRANSIT_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={TRANSIT_DONE} />
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
