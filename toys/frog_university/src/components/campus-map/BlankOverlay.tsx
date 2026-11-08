/**
 * 校园地图 · 留白（批次 DU「留白」）
 * 新学期开学，卷宗最后一页是空白的——按规程，留给下一学期。
 * 发现那一幕做成可翻页卷宗：封面 / 区分 / 规程 / 那一页，
 * 四页翻完才出现「翻到那一页」；之后照旧 ask → outcome → done。
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, File } from "lucide-react";
import { BLANK_PAGES, BLANK_DONE, BLANK_OUTCOMES } from "@/data/blank";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface BlankOverlayProps {
  /** 发现那一天 */
  day: number;
  /** 存档 */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "keep" | "write" | "tuck") => void;
  /** 收下 */
  onClose: () => void;
}

const NAV_BUTTON =
  "rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35 focus-visible:shadow-focus focus-visible:outline-none";

export function BlankOverlay({ day, save, onRespond, onClose }: BlankOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"keep" | "write" | "tuck" | null>(null);
  const [page, setPage] = useState(0);
  const current = BLANK_PAGES[page];
  const total = BLANK_PAGES.length;
  const onLast = page >= total - 1;

  /* 卷宗用左右方向键翻页——翻到最后一页之前，方向键跟按钮一个意思 */
  useEffect(() => {
    if (stage !== "find") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
      else if (event.key === "ArrowRight") setPage((p) => Math.min(BLANK_PAGES.length - 1, p + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage]);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="留白"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <File size={13} aria-hidden />
            卷宗 · 末页
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? current.title
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "keep"
                    ? "照留"
                    : choice === "write"
                      ? "一行手书"
                      : "夹了一张"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 第 {save.playthrough} 学期
          </p>

          {stage === "find" && (
            <>
              <div key={page} className="anim-fade-up">
                {current.body !== "" && (
                  <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={current.body} />
                )}
                {current.doc && (
                  <div className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3">
                    <RichText className="font-mono text-[10px] font-bold tracking-widest text-primary" text={current.doc.name} />
                    <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={current.doc.text} />
                  </div>
                )}
                {current.blank && (
                  <div className="mt-4 flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border bg-background/40">
                    <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                      （白的。什么都没有。）
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-dashed border-border pt-3">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className={NAV_BUTTON}
                >
                  <span className="inline-flex items-center gap-0.5">
                    <ChevronLeft size={13} aria-hidden />
                    上一页
                  </span>
                </button>
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  第 {page + 1} 页 / 共 {total} 页
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
                  disabled={onLast}
                  className={NAV_BUTTON}
                >
                  <span className="inline-flex items-center gap-0.5">
                    下一页
                    <ChevronRight size={13} aria-hidden />
                  </span>
                </button>
              </div>
              {onLast && (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStage("ask")}
                    className="anim-stamp-line rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    翻到那一页
                  </button>
                </div>
              )}
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有那一页最后装什么。
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
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">照留</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    合上卷宗。被注意值 +1——白的意思不是没有，是「还没有」：它等着，但不催。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("write");
                    onRespond("write");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">写一句</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    写一行。被注意值 +2——它是这册卷宗里唯一一句不是它说的话。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("tuck");
                    onRespond("tuck");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    夹一张纸
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    不写，夹着。沉默值 +1——同一页两种读法：制度看见的是留白，你看见的是你的纸。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              {/* 那一页最后长什么样：照留是白的；写一句是一行留给自己的空线；夹纸是空白里一张更白的纸 */}
              {choice === "keep" && (
                <div className="anim-fade-up mt-4 flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border bg-background/40">
                  <p className="font-mono text-[10px] tracking-widest text-muted-foreground">（白的。什么都没有。）</p>
                </div>
              )}
              {choice === "write" && (
                <div className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/40 px-4 py-4">
                  <div aria-hidden className="h-px w-full bg-border" />
                  <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">（这一行留给你自己。）</p>
                </div>
              )}
              {choice === "tuck" && (
                <div className="anim-fade-up mt-4 flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border bg-background/40">
                  <div className="-rotate-2 rounded-sm border border-border bg-card px-6 py-4 shadow-sm">
                    <p className="font-mono text-[10px] tracking-widest text-muted-foreground">（里面夹着一张更白的纸。）</p>
                  </div>
                </div>
              )}
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={BLANK_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={BLANK_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={BLANK_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={BLANK_DONE} />
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
