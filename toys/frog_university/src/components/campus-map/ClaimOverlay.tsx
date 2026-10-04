/**
 * 校园地图 · 认领（批次 DN「认领」）
 * 焚化室门口的告示换成了《失物清单》。制度不查找失物，它只等失物被领。
 * 三种处理：领回 / 不领 / 让它们找——没有正确的，
 * 只有那张纸在两个世界里最后是什么状态。
 */
import { useState } from "react";
import { Undo2 } from "lucide-react";
import {
  CLAIM_DISCOVERY,
  CLAIM_DONE,
  CLAIM_NOTICE,
  CLAIM_OUTCOMES,
  claimItemOf,
} from "@/data/claim";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface ClaimOverlayProps {
  /** 张贴那一天 */
  day: number;
  /** 存档（清单上你的那一行按它派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "return" | "keep" | "wait") => void;
  /** 收下 */
  onClose: () => void;
}

export function ClaimOverlay({ day, save, onRespond, onClose }: ClaimOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"return" | "keep" | "wait" | null>(null);
  const item = claimItemOf(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="认领"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Undo2 size={13} aria-hidden />
            焚化室 · 失物清单
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "制度只登记，不寻找"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "return"
                    ? "已归还"
                    : choice === "keep"
                      ? "不要了"
                      : "空等"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 清单有一行是你的
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={CLAIM_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《失物认领须知》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={CLAIM_NOTICE} />
                <p className="mt-2 rounded-lg border border-border bg-card p-2 text-sm leading-relaxed text-card-foreground">
                  你的那一行：{item.label}
                  <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{item.hint}</span>
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看认领方式
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有那张纸在两个世界里最后是什么状态。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("return");
                    onRespond("return");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">领回</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    填认领单。被注意值 +1——它承认了「找不到」的那一段时间，那段时间里纸一直在你这里。
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
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不领</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    失物留在清单上。沉默值 +1——同一张纸，两个世界：它那边是「不要了」，你这边是「收着」。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("wait");
                    onRespond("wait");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    让它们找
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    找的义务在认领人。被注意值 +2——它只是一直在等一只不会来领的蛙：它等的不是纸，是那只蛙。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={CLAIM_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={CLAIM_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={CLAIM_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={CLAIM_DONE} />
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
