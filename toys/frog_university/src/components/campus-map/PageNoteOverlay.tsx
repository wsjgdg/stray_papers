/**
 * 校园地图 · 页边（批次 DJ「页边」）
 * 例行核对的时候，你翻到了那一页。页边多了一个字——「知」。
 * 三种处理：回一个字 / 不动它 / 划掉——没有正确的，
 * 只有页边最后长成什么样子。
 */
import { useState } from "react";
import { PenTool } from "lucide-react";
import {
  PAGE_NOTE_DISCOVERY,
  PAGE_NOTE_DONE,
  PAGE_NOTE_NOTICE,
  PAGE_NOTE_OUTCOMES,
  pageNoteWhereOf,
} from "@/data/pageNote";
import type { GameSaveData } from "@/lib/gameSave";
import { RichInline, RichText } from "@/components/common/RichText";

interface PageNoteOverlayProps {
  /** 发现那一天 */
  day: number;
  /** 存档（那个字落在哪一页按它派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "ack" | "leave" | "cross") => void;
  /** 收下 */
  onClose: () => void;
}

export function PageNoteOverlay({ day, save, onRespond, onClose }: PageNoteOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"ack" | "leave" | "cross" | null>(null);
  const where = pageNoteWhereOf(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="页边"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <PenTool size={13} aria-hidden />
            值班日志 · 页边
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "页边多了一个字"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "ack"
                    ? "两个「知」"
                    : choice === "leave"
                      ? "又一行"
                      : "划痕"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 第 {save.playthrough} 学期
          </p>

          {stage === "find" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                <RichInline text={PAGE_NOTE_DISCOVERY.replace("页边多了一个字。", `多在${where}。`)} />
              </p>
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">页边批注</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={PAGE_NOTE_NOTICE} />
                <p className="mt-2 rounded-lg border border-border bg-card p-2 text-sm leading-relaxed text-card-foreground">
                  {where}，一个字：「知」。
                  <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                    （没有编号，没有日期，没有落款。它只是在那儿。）
                  </span>
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  合上日志
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有页边最后长成什么样子。
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
                    回一个字
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    也写一个「知」。被注意值 +1——最结实的关系，是两个都留了字的页边。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("leave");
                    onRespond("leave");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不动它</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    那个「知」留着。沉默值 +1——这栋楼里有人记得那一天，每多一个「知」，就多一只。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("cross");
                    onRespond("cross");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">划掉</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    你写的是「不要」。被注意值 +2——划痕比字迹重：它证明你读过，而且你不想让它留在那里。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={PAGE_NOTE_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={PAGE_NOTE_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={PAGE_NOTE_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={PAGE_NOTE_DONE} />
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
