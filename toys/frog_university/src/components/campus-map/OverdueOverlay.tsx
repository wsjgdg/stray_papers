/**
 * 校园地图 · 催办（批次 DF「催办」）
 * 你名下有一件事挂了很久。催办不是催你——催办是这件事自己不再等你。
 * 三种处理：办结 / 申请延期 / 逾期挂失——没有正确的，
 * 只有那件事最后不再等你的方式。
 */
import { useState } from "react";
import { Clock } from "lucide-react";
import {
  OVERDUE_DISCOVERY,
  OVERDUE_DONE,
  OVERDUE_NOTICE,
  OVERDUE_OUTCOMES,
  overdueItemOf,
} from "@/data/overdue";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface OverdueOverlayProps {
  /** 递单那一天 */
  day: number;
  /** 存档（挂账的那一件按它派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "settle" | "extend" | "lose") => void;
  /** 收下 */
  onClose: () => void;
}

export function OverdueOverlay({ day, save, onRespond, onClose }: OverdueOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"settle" | "extend" | "lose" | null>(null);
  const item = overdueItemOf(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="催办"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Clock size={13} aria-hidden />
            档案室 · 催办通知
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "这件事不再等你了"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "settle"
                    ? "已销账"
                    : choice === "extend"
                      ? "重新计期"
                      : "转入失物"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 第 {save.playthrough} 学期
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={OVERDUE_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《催办通知》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={OVERDUE_NOTICE} />
                <p className="mt-2 rounded-lg border border-border bg-card p-2 text-sm leading-relaxed text-card-foreground">
                  挂账事项：{item.label}
                  <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{item.hint}</span>
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看处理方式
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有那件事最后不再等你的方式。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("settle");
                    onRespond("settle");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">办结</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    把那张纸交上去，销账。被注意值 +1——挂账的东西销了账，就跟没挂过一样。区别只有你记得。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("extend");
                    onRespond("extend");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    申请延期
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    理由栏写「再等一学期」。被注意值 +2——它不问为什么，它只问「还要等多久」。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("lose");
                    onRespond("lose");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    逾期挂失
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    你没办。沉默值 +1——失物不添麻烦：它们只是不在，但你还在。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={OVERDUE_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={OVERDUE_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={OVERDUE_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={OVERDUE_DONE} />
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
