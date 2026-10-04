/**
 * 校园地图 · 记性（批次 DK「记性」）
 * 本学期开展记性核对一次。记性不是记忆——记性核对是把
 * 你记得的事，跟档案对一遍。
 * 三种处理：照实核 / 只说一件 / 不核——没有正确的，
 * 只有差异那一栏最后记成什么样。
 */
import { useState } from "react";
import { Brain } from "lucide-react";
import {
  MEMORY_DISCOVERY,
  MEMORY_DONE,
  MEMORY_NOTICE,
  MEMORY_OUTCOMES,
  memoryItemCountOf,
} from "@/data/memory";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface MemoryOverlayProps {
  /** 张贴那一天 */
  day: number;
  /** 存档（核对项数按它派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "all" | "one" | "none") => void;
  /** 收下 */
  onClose: () => void;
}

export function MemoryOverlay({ day, save, onRespond, onClose }: MemoryOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"all" | "one" | "none" | null>(null);
  const items = memoryItemCountOf(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="记性"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Brain size={13} aria-hidden />
            档案室 · 记性核对
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "它第一次承认可能记错"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "all"
                    ? `差异 ${items} 处`
                    : choice === "one"
                      ? "空栏一栏"
                      : "未核对"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 核对项数 {items}
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={MEMORY_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《记性核对单》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={MEMORY_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  本学期事项 {items} 项 · 核对方式：自述对读
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  接过核对单
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有差异那一栏最后记成什么样。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("all");
                    onRespond("all");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">照实核</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    把你记得的都说了。被注意值 +1——它第一次承认它可能记错，那个地方叫差异。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("one");
                    onRespond("one");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    只说一件
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    你记得最清楚的那一件。被注意值 +2——空栏是「这一栏留着，等你补」。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("none");
                    onRespond("none");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不核</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    你的记性是你的。沉默值 +1——页边是它没占的地方，你的记性也是。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={MEMORY_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={MEMORY_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={MEMORY_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={MEMORY_DONE} />
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
