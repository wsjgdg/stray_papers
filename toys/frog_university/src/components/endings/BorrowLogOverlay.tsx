/**
 * 借阅记录（批次 BE「关于你」之三）
 * 有人借走了你的档案。借阅人栏有名字，理由栏空白——流程里没有「为什么借」这一栏。
 * 它看了多久、看到了哪一页，没有记录。你不会知道它读出了什么。
 */
import { BookMarked } from "lucide-react";
import { FROG_CHARACTERS } from "@/data/characters";

interface BorrowLogOverlayProps {
  /** 本学期的借阅蛙 id */
  frog: keyof typeof FROG_CHARACTERS;
  /** 历史借阅（[学期, 蛙名]） */
  history: Array<{ semester: number; name: string }>;
  onClose: () => void;
}

export function BorrowLogOverlay({ frog, history, onClose }: BorrowLogOverlayProps) {
  const name = FROG_CHARACTERS[frog]?.displayName ?? "某只蛙";
  const firstTime = history.length <= 1;
  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="档案借阅记录"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <BookMarked size={13} aria-hidden />
            档案室 · 借阅登记
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {firstTime ? "有人借走了你的档案" : "它又来借了"}
          </h2>

          <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
            {firstTime
              ? `借阅人：${name}。你的档案有读者了。`
              : `借阅人：${name}。它借了不止一次——你档案里的什么，让它一直回来？`}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-card-foreground">
            借阅理由栏：空白。流程里没有「为什么借」这一栏。
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            它看了多久、翻到了哪一页、在哪一行停过——没有记录。借阅不产生批语，不产生笔记：
            它读出了什么，只有它知道。
          </p>

          {history.length > 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground">借阅登记 · {history.length} 条</p>
              <ul className="mt-1.5 space-y-1">
                {history.map((item, i) => (
                  <li key={i} className="font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground">
                    第 {item.semester} 学期 · 借阅人：{item.name} · 理由栏：空白
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
            你的档案在流通。你不会知道它读出了什么。
          </p>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
