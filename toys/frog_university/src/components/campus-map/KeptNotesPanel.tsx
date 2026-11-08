/**
 * 校园地图 · 挂档（行政宇宙 · 收口）
 * 办完的事，档案上挂一行小字。小字不占编号、不进总目——但它挂着。
 * 面板把本学期挂着的小字一行一行挂出来；超过六行折叠。
 */
import { useState } from "react";
import { Pin } from "lucide-react";
import { keptNotesOf } from "@/data/keptNotes";
import { KeptNotesOverlay } from "./KeptNotesOverlay";
import type { GameSaveData } from "@/lib/gameSave";

interface KeptNotesPanelProps {
  /** 存档 */
  save: GameSaveData;
  /** 进场错拍（批次 CH）：0 = 与页面同拍 */
  enterDelay?: number;
}

const COLLAPSED_COUNT = 6;

export function KeptNotesPanel({ save, enterDelay = 0 }: KeptNotesPanelProps) {
  const [expanded, setExpanded] = useState(false);
  /* 挂档总览（批次 CY-101）：面板是抽屉，摊开是整面——两处同源，不另立账 */
  const [unrolled, setUnrolled] = useState(false);
  const notes = keptNotesOf(save);
  if (notes.length === 0) return null;
  const shown = expanded ? notes : notes.slice(0, COLLAPSED_COUNT);

  return (
    <section
      aria-label="挂档"
      className="anim-fade-up rounded-3xl border border-border bg-card p-5 shadow-lg"
      style={{ animationDelay: `${enterDelay}ms` }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-primary">
          <Pin size={13} aria-hidden />
          挂档
        </p>
        <button
          type="button"
          onClick={() => setUnrolled(true)}
          className="rounded-full border border-dashed border-border bg-background/60 px-3 py-1 font-mono text-[10px] tracking-widest text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
        >
          挂了 {notes.length} 行小字 · 摊开
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        办完的事，档案上挂一行小字。小字不占编号、不进总目——但它们挂着：翻档案都翻得到，开新学期也还挂着。
      </p>
      <ul className="mt-3 divide-y divide-border">
        {shown.map((item) => (
          <li key={item.key} className="flex items-start gap-3 py-2.5">
            <span className="shrink-0 pt-0.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
              {item.label}
            </span>
            <p className="flex-1 text-sm leading-relaxed text-card-foreground">
              {item.note}
              {item.semester !== null && item.day !== null && (
                <span className="mt-1 block font-mono text-[10px] tracking-widest text-muted-foreground">
                  第 {item.semester} 学期 · 第 {item.day} 天挂上
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
      {notes.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-3 w-full rounded-xl border border-dashed border-border bg-background/60 py-2 font-mono text-[10px] font-bold tracking-widest text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
        >
          {expanded ? "收起多余的小字" : `再往下，还挂着 ${notes.length - COLLAPSED_COUNT} 行`}
        </button>
      )}
      {unrolled && <KeptNotesOverlay save={save} onClose={() => setUnrolled(false)} />}
    </section>
  );
}
