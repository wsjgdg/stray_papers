/**
 * 校园地图 · 被读（批次 CY「被读」）
 * 有人读了你的档案。按规程，调阅不通报当事人——所以这张知会单按规定不应当存在。
 * 三种处理：签收回执 / 申请查明 / 装作没看见——没有正确的，只有你让这件事停在哪一层。
 */
import { useState } from "react";
import { BookOpenCheck } from "lucide-react";
import {
  BERREAD_DONE,
  BERREAD_DISCOVERY,
  BERREAD_NOTICE,
  BERREAD_OUTCOMES,
} from "@/data/beread";
import { RichText } from "@/components/common/RichText";

interface BereadOverlayProps {
  /** 知会那一天 */
  day: number;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "ack" | "seek" | "hold") => void;
  /** 收下 */
  onClose: () => void;
}

export function BereadOverlay({ day, onRespond, onClose }: BereadOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"ack" | "seek" | "hold" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="被读"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <BookOpenCheck size={13} aria-hidden />
            调阅知会 · 非正规文书
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "有人读了你的档案"
              : stage === "ask"
                ? "三日内"
                : stage === "outcome"
                  ? choice === "ack"
                    ? "已知悉"
                    : choice === "seek"
                      ? "转上级审批"
                      : "按未送达处理"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={BERREAD_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《调阅知会》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={BERREAD_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  本单不设存根编号——按规定，它不该有编号。
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  接过来
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三日内。三种处理。没有正确的——只有你让这件事停在哪一层。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("ack");
                    onRespond("ack");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    签收回执
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    「已知悉。」被注意值 +1——签收的蛙很多，问的少。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("seek");
                    onRespond("seek");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    申请查明
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    填《调阅人查明申请》。被注意值 +2——追查本身就是一次更深的被读。
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
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    装作没看见
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    折起来，收进抽屉。沉默值 +1——三个动作里最轻的一个，落进抽屉的时候最响。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={BERREAD_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={BERREAD_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={BERREAD_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={BERREAD_DONE} />
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
