import { useEffect, useRef, useState } from "react";
import type { useHome } from "@/pages/Home/useHome";

// 画布下方歌词条（作曲模式）：循环播放时逐字高亮推进——时钟取引擎画布循环相位
// （与 lookahead 排程同源），rAF 自取、只在序号变化时重渲染，不新增定时器；
// 非播放/暂停态整行静态；点整行或「改写」弹小输入框整行改写（按字数重新对齐）；
// × 关闭只收起条子，词仍留在所配对象上（再选中即回来）。
export function LyricStrip(p: ReturnType<typeof useHome>) {
  const pRef = useRef(p);
  pRef.current = p;
  const [activeIdx, setActiveIdx] = useState(-1);
  const [rewriting, setRewriting] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const cur = pRef.current;
      const v = cur.lyricStrip && !cur.lyricStrip.frozen ? cur.getLyricActive() : null;
      const next = v === null ? -1 : v; // 非播放/暂停 = -1（整行静态不高亮）
      setActiveIdx((prev) => (prev === next ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  const strip = p.lyricStrip;
  if (!strip) return null;
  const sep = strip.lang === "zh" ? "" : " ";

  const commit = () => {
    const v = draft.trim();
    if (v) p.onRewriteLyric(v);
    setRewriting(false);
  };

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-2 z-20">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-card/90 px-3 py-2 font-mono text-sm text-card-foreground shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-300">
        <span className="shrink-0 border border-primary/60 bg-primary/10 px-2 py-0.5 text-xs text-primary">
          歌词 · {strip.label}
        </span>
        {rewriting ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <input
              type="text"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setRewriting(false);
              }}
              placeholder="整行改写，回车生效（按字数重新对齐）"
              className="min-w-0 flex-1 border border-primary bg-background px-2 py-1 text-sm text-foreground focus-visible:shadow-[var(--focus-ring)]"
            />
            <button
              type="button"
              onClick={commit}
              className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground hover:opacity-90 focus-visible:shadow-[var(--focus-ring)]"
            >
              改好
            </button>
          </span>
        ) : (
          <>
            <p
              className="min-w-0 flex-1 cursor-pointer leading-relaxed"
              title="点整行可改写"
              onClick={() => {
                setDraft(strip.text);
                setRewriting(true);
              }}
            >
              {strip.words.length === 0 ? (
                <span className="text-muted-foreground">（这条线的词是空的）</span>
              ) : (
                strip.words.map((w, i) => (
                  <span
                    key={`${i}`}
                    className={
                      i === activeIdx && w
                        ? "rounded-sm bg-primary px-0.5 font-bold text-primary-foreground"
                        : ""
                    }
                  >
                    {w}
                    {sep && i < strip.words.length - 1 ? sep : ""}
                  </span>
                ))
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                setDraft(strip.text);
                setRewriting(true);
              }}
              aria-label="整行改写歌词"
              className="shrink-0 border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            >
              改写
            </button>
          </>
        )}
        <button
          type="button"
          onClick={p.onCloseLyricStrip}
          aria-label="关闭歌词条（歌词仍留在这条线上）"
          title="关闭（词留在对象上，再选中即回）"
          className="shrink-0 border border-border px-2 py-0.5 text-muted-foreground hover:border-primary hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
        >
          ×
        </button>
      </div>
    </div>
  );
}
