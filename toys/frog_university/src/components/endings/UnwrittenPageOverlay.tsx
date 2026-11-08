/**
 * 结局图鉴 · 未编目的一页（全收集限定 · 第四面）
 * 全收集后，档案柜最里面那页没有编号的纸可以写下去了：
 * 没有学期、没有日历、没有数值——只有一张纸。写下的内容独立存档（不进任何学期档案），
 * 下次打开还在；写完就是整个游戏的终点，剩下的以玩家的版本为准。
 */
import { useEffect, useState } from "react";
import { loadUnwrittenPage, saveUnwrittenPage } from "@/lib/gameSave";

/** 档案的回应（批次 AA）：这一页上玩家写的每一句，档案都回一句——它读得懂「记得」和「不记得」的关系 */
function systemReplyFor(text: string): string {
  const t = text.trim();
  if (!t) return "";
  if (/不记得|忘了|没记住|忘掉/.test(t)) return "档案记得。这一页，是它唯一没有编目的地方。";
  if (/记得|记住|难忘|留下/.test(t)) return "档案不记得。所以它把这一页原样封存——连同你写的这句。";
  if (/空白|空着|空/.test(t)) return "空白已登记。年度清点以「在柜」一笔带过，账面不许留白。";
  if (/好人|善良|不好|坏人/.test(t)) return "「好人」不在栏目里。已按「其他」归档。";
  if (/沉默|不说话|没说/.test(t)) return "沉默有编号。这一页没有。";
  return "内容已收。归档时它先读了一遍——然后照抄，不加批语。";
}

export function UnwrittenPageOverlay({ onClose }: { onClose: () => void }) {
  const [pageText, setPageText] = useState(() => loadUnwrittenPage());
  const [filled, setFilled] = useState(() => loadUnwrittenPage().trim().length > 0);

  /* Esc 合上卷宗（写在 textarea 里也生效） */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleChange = (next: string) => {
    setPageText(next);
    saveUnwrittenPage(next);
    setFilled(next.trim().length > 0);
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-foreground/90 px-4 py-10">
      <div className="mx-auto flex min-h-full max-w-2xl items-start justify-center">
        <div className="anim-fade-up my-auto relative w-full rounded-2xl bg-card p-6 shadow-2xl sm:p-10">
          {/* 纸面：没有编号、没有学期、没有格子——只有纸本身 */}
          <p className="text-center text-[10px] font-bold tracking-widest text-muted-foreground">档案室</p>
          <h2 className="mt-2 text-center text-lg font-bold tracking-widest text-card-foreground">没有编号的一页</h2>
          <textarea
            value={pageText}
            onChange={(event) => handleChange(event.target.value)}
            aria-label="写下这一页的内容"
            spellCheck={false}
            placeholder={
              filled
                ? undefined
                : "这一页留白。不是它漏了——是它的栏目里没有格子可填。内容以当事蛙的版本为准，不设归还期限。"
            }
            className="mt-6 min-h-[280px] w-full resize-none rounded-xl border border-border bg-background/60 p-4 text-sm leading-relaxed text-card-foreground shadow-inner placeholder:text-muted-foreground/70 focus:border-primary/60 focus:outline-none"
          />
          {/* 写过之后：终点就在这一页；档案会回一句——按你写的，它读得懂 */}
          {filled && (
            <div className="anim-fade-up mt-4 space-y-2">
              <div className="rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground">档案的回应</p>
                <p className="mt-1 text-xs leading-relaxed text-card-foreground">{systemReplyFor(pageText)}</p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                游戏到这里就结束——档案写不动的那一页，内容以你的版本为准。
              </p>
            </div>
          )}
          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {filled ? "写下的内容会留在这里，下次打开还在。" : "想到什么写什么，留白也可以。"}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              合上卷宗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
