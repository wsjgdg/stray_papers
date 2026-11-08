/**
 * 调阅记录（批次 CI「行政化」；原「回想」）：不做成滚动列表，做成档案调阅记录——
 * 每一句你读过的话，都有一条调阅记录（带档案行号）。
 * 你说过的真话，用正常字体；你表演的话，用灰色斜体；你沉默的地方，是空白行，只有行号。
 * 调阅记录可以「打印」——打印出来是一张长长的纸；你可以归档（收好）或销毁（那段就没了，
 * 但销毁本身会被记录：柜子里多一张「已销毁」）。
 * 被涂改的历史（批次 Z）：真话正常字体、表演灰色斜体、沉默一行空白。
 */
import { useRef, useState } from "react";
import { ChevronUp, FileText, Heart, History, Image, Printer, Scissors, Search } from "lucide-react";
import { clsx } from "clsx";
import { OverlayShell } from "./OverlayShell";
import { displayNameOf, loadGameSave } from "@/lib/gameSave";
import type { BacklogEntry } from "@/pages/Play/usePlay";

interface HistoryOverlayProps {
  backlog: BacklogEntry[];
  /** 销毁（落档 + 清空当次记录；销毁本身会被档案记一笔） */
  onShred: () => void;
  /** 已销毁的批次数（档案里的「已销毁」行） */
  shredCount: number;
  onClose: () => void;
}

function BacklogRow({ entry, lineNo }: { entry: BacklogEntry; lineNo: number }) {
  const isNarration = entry.kind === "narration";
  const no = String(lineNo).padStart(3, "0");
  /* 被涂改的历史（批次 Z / CI）：真话正常字体、表演灰色斜体、沉默是空白行——只有行号 */
  if (entry.kind === "choice") {
    if (entry.register === "silence") {
      return (
        <li className="rounded-2xl border border-border bg-background/30 px-4 py-3" aria-label="沉默">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground/40">行 {no}</p>
          <p className="mt-1 min-h-6" aria-hidden />
        </li>
      );
    }
    const isTruth = entry.register === "truth";
    return (
      <li
        className={clsx(
          "rounded-2xl border px-4 py-3",
          isTruth ? "border-primary/40 bg-primary/5" : "border-border bg-background/30",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground/50">行 {no}</span>
          <span
            className={clsx(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest",
              isTruth ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {isTruth ? "真话" : "表演"}
          </span>
          <span className="text-xs text-muted-foreground">奶白</span>
        </div>
        <p
          className={clsx(
            "mt-2 text-sm leading-relaxed",
            isTruth ? "text-card-foreground" : "italic text-muted-foreground/70",
          )}
        >
          {entry.text}
        </p>
      </li>
    );
  }
  return (
    <li
      className={clsx(
        "rounded-2xl border px-4 py-3",
        entry.heart ? "border-primary/40 bg-primary/5" : "border-border bg-background/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground/50">行 {no}</span>
        <span
          className={clsx(
            "shrink-0 rounded-full px-3 py-0.5 text-xs font-bold",
            isNarration ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
          )}
        >
          {entry.speakerName}
        </span>
        {entry.heart && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
            <Heart size={10} className="fill-primary-foreground" aria-hidden />
            真心话
          </span>
        )}
        {entry.remember && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/40 bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            <History size={10} aria-hidden />
            上学期
          </span>
        )}
        {entry.cgTitle && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
            <Image size={10} aria-hidden />
            CG · {entry.cgTitle}
          </span>
        )}
      </div>
      <p
        className={clsx(
          "mt-2 text-sm leading-relaxed",
          isNarration ? "text-muted-foreground" : "text-card-foreground",
        )}
      >
        {entry.text || <span className="text-muted-foreground">……</span>}
      </p>
      {entry.innerVoice && (
        <p className="mt-1.5 border-l-2 border-primary/40 pl-3 text-xs leading-relaxed text-muted-foreground">
          <span className="font-bold text-primary">内心 </span>
          {entry.innerVoice}
        </p>
      )}
    </li>
  );
}

/** 全屏调阅记录：最新在上；「回到最新」滚回列表顶部；可打印 → 归档或销毁（批次 CI） */
export function HistoryOverlay({ backlog, onShred, shredCount, onClose }: HistoryOverlayProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reversed = [...backlog].reverse();
  /* 检索（批次 CY-29）：档案太长时按关键词查——说话人名 / 台词 / 内心 / CG 名都算命中，行号照原样保留 */
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const lines = reversed.map((entry, index) => ({ entry, lineNo: backlog.length - index }));
  const shown = q
    ? lines.filter(({ entry }) =>
        `${entry.speakerName} ${entry.text} ${entry.innerVoice ?? ""} ${entry.cgTitle ?? ""}`
          .toLowerCase()
          .includes(q),
      )
    : lines;
  /* 打印（批次 CI）：打印出来是一张长长的纸——归档（收好）或销毁（那段就没了） */
  const [printOpen, setPrintOpen] = useState(false);
  const [shredDone, setShredDone] = useState<number | null>(null);

  return (
    <OverlayShell
      title="调阅记录"
      subtitle="每一句你读过的话，都有一条调阅记录。选项不会进档案，说出口的才算数。沉默是空白行——只有行号。"
      onClose={onClose}
      sizeClass="max-w-3xl"
    >
      {printOpen ? (
        /* 打印件：一张长长的纸 */
        <div className="anim-fade-up rounded-2xl border border-border bg-background/70 p-5">
          <p className="text-center font-mono text-[11px] font-bold tracking-widest text-primary">
            奶蛙大学 · 调阅记录打印件
          </p>
          <p className="mt-1 text-center font-mono text-[10px] tracking-widest text-muted-foreground">
            共 {backlog.length} 行 · 学号 036 · {displayNameOf(loadGameSave())}
          </p>
          <div className="mt-4 max-h-[52vh] overflow-y-auto rounded-xl border border-dashed border-border bg-card/60 p-4">
            <ul className="space-y-1.5">
              {backlog.map((entry, index) => (
                <li
                  key={`${index}-${entry.text.slice(0, 10)}`}
                  className="font-mono text-[11px] leading-relaxed text-muted-foreground"
                >
                  <span className="mr-2 text-muted-foreground/50">{String(index + 1).padStart(3, "0")}</span>
                  {entry.kind === "choice" && entry.register === "silence" ? (
                    <span className="text-muted-foreground/30">（空白行）</span>
                  ) : (
                    <span className={clsx(entry.register === "performance" && "italic")}>{entry.text}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {shredDone !== null ? (
            <p className="anim-fade-up mt-4 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-3 text-center text-xs leading-relaxed text-destructive">
              已销毁 {shredDone} 条。柜子里多了一张「已销毁」——销毁不是没发生，是换了一种在。
            </p>
          ) : (
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-muted-foreground">
                归档：收好，记录保留。销毁：这一段就没了——但销毁本身会被档案记一笔（沉默 +2）。
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setPrintOpen(false)}
                  className="rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  归档
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onShred();
                    setShredDone(backlog.length);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <Scissors size={12} aria-hidden />
                  销毁
                </button>
              </div>
            </div>
          )}
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              收下
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-muted-foreground">
              {q
                ? `查出 ${shown.length} / ${lines.length} 行`
                : `最新在最上面 · 共 ${reversed.length} 行${shredCount > 0 ? ` · 档案里已有 ${shredCount} 条「已销毁」` : ""}`}
            </span>
            {/* 检索框（批次 CY-29）：按关键词查调阅记录，行号照原样 */}
            <div className="relative min-w-0 flex-1 sm:max-w-52">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="查一句话"
                aria-label="按说话人名、台词或 CG 名检索调阅记录"
                className="w-full rounded-full border border-border bg-background py-1.5 pl-7 pr-3 text-xs font-bold text-card-foreground placeholder:text-muted-foreground/60 focus-visible:shadow-focus focus-visible:outline-none"
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setPrintOpen(true)}
                disabled={reversed.length === 0}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold shadow-sm transition-shadow duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                  reversed.length === 0
                    ? "cursor-not-allowed bg-muted text-muted-foreground/50 shadow-none"
                    : "bg-card text-card-foreground hover:shadow-md",
                )}
              >
                <Printer size={13} aria-hidden />
                打印
              </button>
              <button
                type="button"
                onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
              >
                <ChevronUp size={13} aria-hidden />
                回到最新
              </button>
            </div>
          </div>
          <div ref={scrollRef}>
            {reversed.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                这学期还没说过几句话，调阅记录是空的。
              </p>
            ) : shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                档案里没有含「{query.trim()}」的记录——换个词，或清空搜索框看全部。
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {shown.map(({ entry, lineNo }) => (
                  <BacklogRow
                    key={`${lineNo}-${entry.speakerName}-${entry.text.slice(0, 12)}`}
                    entry={entry}
                    lineNo={lineNo}
                  />
                ))}
              </ul>
            )}
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] leading-relaxed text-muted-foreground/60">
            <FileText size={11} aria-hidden />
            打印出来是一张长长的纸——归档，或者销毁。
          </p>
        </>
      )}
    </OverlayShell>
  );
}
