/**
 * 校园地图 · 误投（批次 CS「误投」）
 * 你的信格里躺着一张《处分决定书》：抬头是你的学号，事由写的事你没干过。
 * 三种处理：去更正 / 不吭声 / 原样退回——没有正确的，只有你把自己放在哪一栏。
 */
import { useState } from "react";
import { MailWarning } from "lucide-react";
import {
  MISDELIVERY_DONE,
  MISDELIVERY_DISCOVERY,
  MISDELIVERY_NOTICE_HELP,
  MISDELIVERY_OUTCOMES,
  misdeliveryNoticeOf,
} from "@/data/misdelivery";
import { RichText } from "@/components/common/RichText";

interface MisdeliveryOverlayProps {
  /** 送达那一天 */
  day: number;
  /** 存档种子（决定书的事由与事发时间按它派生） */
  seed: number;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "correct" | "carry" | "return") => void;
  /** 收下 */
  onClose: () => void;
}

export function MisdeliveryOverlay({ day, seed, onRespond, onClose }: MisdeliveryOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"correct" | "carry" | "return" | null>(null);
  const notice = misdeliveryNoticeOf(seed);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="误投"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <MailWarning size={13} aria-hidden />
            学工办 · 送达
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "信格里有你的名字"
              : stage === "ask"
                ? "三日内"
                : stage === "outcome"
                  ? choice === "correct"
                    ? "确属误投"
                    : choice === "carry"
                      ? "已入档"
                      : "退回人栏照登"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={MISDELIVERY_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《处分决定书》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={MISDELIVERY_NOTICE_HELP} />
                <p className="mt-2 rounded-lg border border-border bg-card p-2 text-sm leading-relaxed text-card-foreground">
                  事由（{notice.when}）：{notice.violation}
                </p>
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  当事蛙：学号 036。如无异议，自送达之日起生效。
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  再读一遍事由
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三日内。三种处理。没有正确的——只有你把自己放在哪一栏。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("correct");
                    onRespond("correct");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">去更正</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    「这不是我的。」被注意值 +2——你洗干净自己的方式，是签收了别人的事。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("carry");
                    onRespond("carry");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不吭声</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    折好收进抽屉。沉默值 +1——处分按编号落档，落在你的名下。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("return");
                    onRespond("return");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">原样退回</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    理由一栏写「无」。被注意值 +1——退回也是收发动作，收发要留痕。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={MISDELIVERY_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={MISDELIVERY_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={MISDELIVERY_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={MISDELIVERY_DONE} />
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
