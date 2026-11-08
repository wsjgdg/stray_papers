/**
 * 校园地图 · 扉页（批次 DM「扉页」）
 * 档案室换了卷宗封皮。扉页上有一行字——制度自己，写在它没占的地方。
 * 三种处理：照读 / 折起来 / 撕掉——没有正确的，
 * 只有那一页话最后长成什么样。
 */
import { useState } from "react";
import { Quote } from "lucide-react";
import {
  FLYLEAF_DISCOVERY,
  FLYLEAF_DONE,
  FLYLEAF_NOTICE,
  FLYLEAF_OUTCOMES,
} from "@/data/flyleaf";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface FlyleafOverlayProps {
  /** 换封那一天 */
  day: number;
  /** 存档 */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "read" | "fold" | "tear") => void;
  /** 收下 */
  onClose: () => void;
}

export function FlyleafOverlay({ day, save, onRespond, onClose }: FlyleafOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"read" | "fold" | "tear" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="扉页"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Quote size={13} aria-hidden />
            卷宗 · 扉页
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "封二上有一行字"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "read"
                    ? "读过了"
                    : choice === "fold"
                      ? "折痕一道"
                      : "缺角"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 第 {save.playthrough} 学期
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={FLYLEAF_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">扉页</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={FLYLEAF_NOTICE} />
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  翻开这一宗
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有那一页话最后长成什么样。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("read");
                    onRespond("read");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">照读</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    一行字，读完了。被注意值 +1——它第一次自己写一句，挑的话是给你的。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("fold");
                    onRespond("fold");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">折起来</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    折痕是回执。被注意值 +2——你的折痕跟它的那行字，成了这一宗唯一一处两蛙共同写过的地方。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("tear");
                    onRespond("tear");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">撕掉</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    封皮缺了一角。沉默值 +1——缺的那页你带走了，缺的这件事它留着。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={FLYLEAF_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={FLYLEAF_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={FLYLEAF_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={FLYLEAF_DONE} />
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
