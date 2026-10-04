/**
 * 校园地图 · 同名（批次 DR「同名」）
 * 登记簿备注栏多了一行。字迹不是你的——是同一栏的简称，也写了那一串字。
 * 三种处理：认下 / 让给它 / 换个名——没有正确的，
 * 只有那个词最后装几个意思。
 */
import { useState } from "react";
import { Copy } from "lucide-react";
import {
  SAME_NAME_DISCOVERY,
  SAME_NAME_DONE,
  SAME_NAME_NOTICE,
  SAME_NAME_OUTCOMES,
  sameNamePeerOf,
} from "@/data/sameName";
import { RichText } from "@/components/common/RichText";
interface SameNameOverlayProps {
  /** 发现那一天 */
  day: number;
  /** 学期种子（用你名字的那一只按它派生） */
  seed: number;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "keep" | "give" | "change") => void;
  /** 收下 */
  onClose: () => void;
}

export function SameNameOverlay({ day, seed, onRespond, onClose }: SameNameOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"keep" | "give" | "change" | null>(null);
  const peer = sameNamePeerOf(seed);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="同名"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Copy size={13} aria-hidden />
            登记簿 · 备注栏
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "你的词被用了一次"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "keep"
                    ? "同名认下"
                    : choice === "give"
                      ? "让渡"
                      : "分名"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 使用者：{peer}
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={SAME_NAME_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《同名说明》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={SAME_NAME_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  备注栏：同一栏写了两次 · 另一栏的使用者：{peer}
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  合上簿子
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有那个词最后装几个意思。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("keep");
                    onRespond("keep");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">认下</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    一栏写了两遍。被注意值 +1——它不知道你的意思，但它用了你的词：这跟它自己起一个，是两件事。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("give");
                    onRespond("give");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">让给它</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    划掉自己那行。被注意值 +2——一个词从今天起只属于一只蛙，不是制度划的，是你让的。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("change");
                    onRespond("change");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">换个名</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    原词归它，新词归你。沉默值 +1——你们用同一栋楼的纸，写两个不同的词。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={SAME_NAME_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={SAME_NAME_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={SAME_NAME_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={SAME_NAME_DONE} />
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
