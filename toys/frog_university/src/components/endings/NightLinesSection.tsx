/**
 * 结局图鉴 · 深夜台词书架（批次 CY-102；CY-103 检索；CY-105 天气夜分册）
 * 遇过的深夜事件各成一册：那一夜的全部台词、差一点说出口的那句、上学期的补记，都排在架上。
 * 书架不编目——柜子只认「真熬过的夜」：没遇过的夜，这里也替它空着。
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, MoonStar, Play } from "lucide-react";
import { ALL_NIGHT_EVENTS } from "@/data/nightEvents";
import { FROG_CHARACTERS } from "@/data/characters";
import type { FrogCharacterId } from "@/data/characters";
import type { GameSaveData } from "@/lib/gameSave";

/** 天气夜特辑（批次 CY-105）：按天气分册——雨夜两册，别的夜一册（连播弹层的特装章同用这张表） */
export const WEATHER_NIGHT_LABEL: Record<string, string> = {
  "night-rain-door": "雨夜",
  "night-rain-thunder": "雷夜",
  "night-fog-figure": "雾夜",
  "night-cloudy-gray": "阴天夜",
  "night-sunny-moon": "晴夜",
  "night-weather-patrol": "巡逻夜",
  "night-weather-final": "五夜终章",
};

interface NightLinesSectionProps {
  save: GameSaveData;
  /** 连播已熬过的夜（批次 CY-137）：把书架当前的册序排成一串，一册一册翻——纯阅读，不计数不写档 */
  onBinge?: (ids: string[]) => void;
}

export function NightLinesSection({ save, onBinge }: NightLinesSectionProps) {
  const seen = new Set(save.seenNightEvents ?? []);
  const books = ALL_NIGHT_EVENTS.filter((item) => seen.has(item.id));
  const [openId, setOpenId] = useState<string | null>(null);
  /* 全文检索（批次 CY-103）：只记得半句台词时，从架上把它捞出来 */
  const [query, setQuery] = useState("");
  const q = query.trim();
  const hit = (book: (typeof ALL_NIGHT_EVENTS)[number]) =>
    book.title.includes(q) ||
    book.place.includes(q) ||
    book.nodes.some((node) => node.text.includes(q) || (node.innerVoice ?? "").includes(q)) ||
    (book.choices ?? (book.choice ? [book.choice] : [])).some((item) => item.text.includes(q));
  const shown = q ? books.filter(hit) : books;
  /* 分册（批次 CY-105）：天气夜住特装区，其余按常规夜排 */
  const weatherBooks = shown.filter((book) => WEATHER_NIGHT_LABEL[book.id]);
  const otherBooks = shown.filter((book) => !WEATHER_NIGHT_LABEL[book.id]);
  if (books.length === 0) return null;

  const renderBook = (book: (typeof ALL_NIGHT_EVENTS)[number]) => {
    const open = openId === book.id;
    const badge = WEATHER_NIGHT_LABEL[book.id];
    return (
      <div key={book.id} className="overflow-hidden rounded-xl border border-dashed border-border bg-background/40">
        <button
          type="button"
          onClick={() => setOpenId(open ? null : book.id)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-muted/40 focus-visible:shadow-focus focus-visible:outline-none"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            {open ? (
              <ChevronDown size={14} aria-hidden className="shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight size={14} aria-hidden className="shrink-0 text-muted-foreground" />
            )}
            {badge && (
              <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-primary">
                {badge}
              </span>
            )}
            <span className="truncate text-sm font-bold text-card-foreground">{book.title}</span>
          </span>
          <span className="shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">
            {book.place}
          </span>
        </button>
        {open && (
          <div className="anim-fade-up space-y-3 border-t border-dashed border-border px-4 py-3">
            {book.nodes.map((node) => (
              <p key={node.id} className="text-sm leading-relaxed">
                <span className="mr-2 font-mono text-[10px] font-bold tracking-widest text-primary">
                  {node.speakerId === "narration"
                    ? "夜白"
                    : FROG_CHARACTERS[node.speakerId as FrogCharacterId]?.displayName ?? "某只蛙"}
                </span>
                <span className="text-card-foreground">{node.text}</span>
                {node.innerVoice && (
                  <span className="mt-1 block text-xs italic leading-relaxed text-muted-foreground">
                    （内心）{node.innerVoice}
                  </span>
                )}
              </p>
            ))}
            {(book.choices ?? (book.choice ? [book.choice] : [])).map((item) => (
              <p key={item.id} className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed">
                <span className="mr-2 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                  那一夜差一步出口
                </span>
                <span className="font-bold text-card-foreground">{item.text}</span>
              </p>
            ))}
            {(save.playthrough ?? 1) >= 3 && book.thirdNote && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="mr-2 font-mono text-[10px] font-bold tracking-widest">第三学期</span>
                {book.thirdNote}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      aria-label="深夜台词书架"
      className="anim-fade-up rounded-3xl border border-border bg-card p-5 shadow-md"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground">
          <MoonStar size={13} aria-hidden className="text-primary" />
          深夜 · 台词书架
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onBinge && shown.length >= 2 && (
            <button
              type="button"
              onClick={() => onBinge([...weatherBooks, ...otherBooks].map((book) => book.id))}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors duration-200 hover:bg-primary/20 focus-visible:shadow-focus focus-visible:outline-none"
            >
              <Play size={11} aria-hidden />
              连播已熬过的夜（{shown.length} 册）
            </button>
          )}
          <span className="rounded-full border border-border bg-background/60 px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
            收 {books.length} 册
          </span>
        </div>
      </header>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        你熬过的每一个夜都成了一册。翻开哪册，那一夜说过的话都在——包括你咽回去的那句：
        它没进任何档案，但书架替它留着位置。
      </p>

      <div className="mt-3">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="查一句台词、一只蛙、一个夜——"
          aria-label="搜索深夜台词"
          className="w-full rounded-xl border border-dashed border-border bg-background/60 px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus-visible:shadow-focus focus-visible:outline-none"
        />
      </div>
      {q && (
        <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
          {shown.length > 0 ? `翻到 ${shown.length} 册` : "架上没有这句——也许那夜你没去。"}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {weatherBooks.length > 0 && (
          <p className="pt-1 font-mono text-[10px] font-bold tracking-widest text-primary">
            天气夜 · 特装版 {weatherBooks.length} 册
          </p>
        )}
        {weatherBooks.map(renderBook)}
        {otherBooks.length > 0 && (
          <p className="pt-2 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
            常规夜 {otherBooks.length} 册
          </p>
        )}
        {otherBooks.map(renderBook)}
      </div>
      {books.length < ALL_NIGHT_EVENTS.length && (
        <p className="mt-3 font-mono text-[10px] tracking-widest text-muted-foreground">
          架上还空着 {ALL_NIGHT_EVENTS.length - books.length} 册——柜子不催，夜会替它填。
        </p>
      )}
    </section>
  );
}
