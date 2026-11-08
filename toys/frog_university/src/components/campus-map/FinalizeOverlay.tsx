/**
 * 校园地图 · 定稿（批次 DA「定稿」）
 * 交班前的学期清点——表上列着这学期发生在你身上的每一件事。
 * 三种处理：逐行签字 / 指出一处 / 拒签——没有正确的，只有这个学期最后停在哪一栏。
 */
import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import {
  FINALIZE_DONE,
  FINALIZE_DISCOVERY,
  FINALIZE_NOTICE,
  FINALIZE_OUTCOMES,
  finalizeLinesOf,
} from "@/data/finalize";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface FinalizeOverlayProps {
  /** 清点那一天 */
  day: number;
  /** 存档（清点表从各册记录派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "sign" | "dispute" | "refuse") => void;
  /** 收下 */
  onClose: () => void;
}

export function FinalizeOverlay({ day, save, onRespond, onClose }: FinalizeOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"sign" | "dispute" | "refuse" | null>(null);
  const lines = finalizeLinesOf(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="定稿"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <ClipboardCheck size={13} aria-hidden />
            档案室 · 学期清点
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "交班之前，先清点"
              : stage === "ask"
                ? "逐行核对"
                : stage === "outcome"
                  ? choice === "sign"
                    ? "已定稿"
                    : choice === "dispute"
                      ? "更正一枚"
                      : "待定稿"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 第 {save.playthrough} 学期
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={FINALIZE_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《学期清点表》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={FINALIZE_NOTICE} />
                <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
                  {lines.map((line) => (
                    <div key={line.label} className="flex items-baseline gap-2 px-2 py-1.5">
                      <span className="shrink-0 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                        {line.label}
                      </span>
                      <span className="text-right text-xs leading-relaxed text-card-foreground">
                        {line.result}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  拿起笔
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有这个学期最后停在哪一栏。
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
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    逐行签字
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    每行都属实——不是公道，是准确。被注意值 +1——原来「过去了」是一种手续。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("dispute");
                    onRespond("dispute");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    指出一处
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    只指最轻的那一处。被注意值 +2——你要回一个字，整张表重走一遍。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("refuse");
                    onRespond("refuse");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">拒签</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    把表推回去。沉默值 +1——悬着的学期不结转，它归你。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={FINALIZE_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={FINALIZE_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={FINALIZE_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={FINALIZE_DONE} />
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
