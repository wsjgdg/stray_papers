/**
 * 结局图鉴 · 异常卷宗（批次 AC 起，一百三十来格分章收纳）
 * 柜子里不该有的记录按章收着：柜子自己查出来的 / 别人的档案 / 纸的生命周期 / 两蛙与语言 / 收口……
 * 不挂在 30 的分母里——它们是档案系统的异常输出，由玩家的行为触发。
 * 未解锁时只给一句档案腔条件（不给攻略，只说柜子在等什么）。
 * 默认展开已翻到的章；其余收着，点开章读。
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, FileWarning } from "lucide-react";
import { clsx } from "clsx";
import { HIDDEN_CHAPTERS, hiddenChapterOf } from "@/data/hiddenChapters";
import type { HiddenEnding } from "@/data/storylines";
import { RichText } from "@/components/common/RichText";

interface HiddenEndingCell extends HiddenEnding {
  unlocked: boolean;
  done: string;
}

interface HiddenArchiveSectionProps {
  hiddenEndings: HiddenEndingCell[];
  onOpen: (id: string) => void;
}

export function HiddenArchiveSection({ hiddenEndings, onOpen }: HiddenArchiveSectionProps) {
  const unlockedCount = hiddenEndings.filter((item) => item.unlocked).length;
  const groups = HIDDEN_CHAPTERS.map((chapter) => ({
    key: chapter.key,
    label: chapter.label,
    note: chapter.note,
    cells: hiddenEndings.filter((item) => hiddenChapterOf(item.id) === chapter.key),
  })).filter((chapter) => chapter.cells.length > 0);
  const [openKeys, setOpenKeys] = useState<string[]>(() =>
    groups.filter((chapter) => chapter.cells.some((item) => item.unlocked)).map((chapter) => chapter.key),
  );
  const toggle = (key: string) =>
    setOpenKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));

  return (
    <section aria-label="异常卷宗" className="mt-8 rounded-3xl border border-dashed border-destructive/40 bg-card p-5 shadow-md">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground">
          <FileWarning size={13} aria-hidden />
          异常卷宗 · {unlockedCount}/{hiddenEndings.length}
        </p>
        <span className="rounded-full border border-destructive/30 bg-destructive/5 px-3 py-1 text-[10px] font-bold text-destructive">
          柜子不承认这一区
        </span>
      </header>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        这一区的档案没有编号、没有归档日期。它们按柜子自己的说法分着章——翻到哪章，哪章开；章里每一格都是你办过的一件事。
      </p>

      {groups.map((chapter, chapterIndex) => {
        const isOpen = openKeys.includes(chapter.key);
        const chapterDone = chapter.cells.filter((item) => item.unlocked).length;
        return (
          <div key={chapter.key} className="anim-fade-up mt-3" style={{ animationDelay: `${Math.min(chapterIndex * 70, 700)}ms` }}>
            <button
              type="button"
              onClick={() => toggle(chapter.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-background/40 px-3 py-2 text-left transition-colors duration-200 hover:border-primary/40 focus-visible:shadow-focus focus-visible:outline-none"
            >
              <span className="inline-flex items-center gap-2">
                {isOpen ? (
                  <ChevronDown size={14} aria-hidden className="shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight size={14} aria-hidden className="shrink-0 text-muted-foreground" />
                )}
                <span className="text-xs font-bold tracking-widest text-card-foreground">{chapter.label}</span>
              </span>
              <span
                className={clsx(
                  "shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold",
                  chapterDone > 0 ? "border border-destructive/30 bg-destructive/5 text-destructive" : "bg-muted text-muted-foreground",
                )}
              >
                {chapterDone}/{chapter.cells.length}
              </span>
            </button>
            {isOpen && (
              <>
                <RichText className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground" text={chapter.note} />
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {chapter.cells.map((item, cellIndex) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!item.unlocked}
                      onClick={() => onOpen(item.id)}
                      className={clsx(
                        "anim-fade-up rounded-2xl border p-4 text-left transition-all duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                        item.unlocked
                          ? "border-destructive/40 bg-destructive/5 hover:-translate-y-0.5 hover:shadow-md"
                          : "cursor-default border-border bg-background/40",
                      )}
                      style={{ animationDelay: `${Math.min(cellIndex * 40, 400)}ms` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={clsx(
                            "text-base font-bold",
                            item.unlocked ? "text-card-foreground" : "text-muted-foreground/60",
                          )}
                        >
                          {item.title}
                        </p>
                        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                          {item.done}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {item.unlocked ? "已翻到。点开读。" : item.condition}
                      </p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
        异常卷宗不设归还期限，也不设清退流程——它们就待在柜子里。
      </p>
    </section>
  );
}
