/**
 * 校园地图 · 对账（批次 DD「对账」）
 * 台账日。每学期有一天，全部柜子开柜逐项核对。对账不通报当事人。
 * 三种处理：到场 / 问一句 / 不到场——没有正确的，只有差异那一行最后记成了什么。
 */
import { useState } from "react";
import { Scale } from "lucide-react";
import {
  RECONCILIATION_DISCOVERY,
  RECONCILIATION_DONE,
  RECONCILIATION_NOTICE,
  RECONCILIATION_OUTCOMES,
  reconciliationDiscrepancyOf,
} from "@/data/reconciliation";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface ReconciliationOverlayProps {
  /** 张贴那一天 */
  day: number;
  /** 存档（差异那一行按它派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "attend" | "question" | "absent") => void;
  /** 收下 */
  onClose: () => void;
}

export function ReconciliationOverlay({ day, save, onRespond, onClose }: ReconciliationOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"attend" | "question" | "absent" | null>(null);
  const discrepancy = reconciliationDiscrepancyOf(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="对账"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Scale size={13} aria-hidden />
            档案室 · 对账通知
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "对账不通报当事人"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "attend"
                    ? "已补记"
                    : choice === "question"
                      ? "当事人否认"
                      : "未到场"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 第 {save.playthrough} 学期
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={RECONCILIATION_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《对账通知》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={RECONCILIATION_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  口径：对不上的，以台账为准。
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  等对账开始
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有差异那一行最后记成了什么。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("attend");
                    onRespond("attend");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">到场</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    亲眼看它们对账。被注意值 +1——它知道你在看，你也知道它知道。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("question");
                    onRespond("question");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">问一句</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    「这份东西，我没有领过。」被注意值 +2——否认过比存在过更重，它证明有蛙认领过这件事。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("absent");
                    onRespond("absent");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不到场</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    知道也不去。沉默值 +1——不知道，是这栋楼里唯一不会进档案的东西。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 font-mono text-[10px] font-bold tracking-widest text-primary" text={discrepancy} />
              <RichText className="mt-3 text-sm font-bold text-card-foreground" text={RECONCILIATION_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={RECONCILIATION_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={RECONCILIATION_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={RECONCILIATION_DONE} />
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
