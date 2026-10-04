/**
 * 结局图鉴 · 深夜台词连播（批次 CY-137）：把熬过的夜按书架顺序一册一册过。
 * 纯阅读口径——不计数、不写档：深夜事件只记「看过」，重读不另记；
 * 那一夜差一步出口的那句照旧摆在书页末尾，第三学期的批注只在第三学期及以后显示。
 */
import { clsx } from "clsx";
import { X } from "lucide-react";
import { FROG_CHARACTERS, type FrogCharacterId } from "@/data/characters";
import type { NightEvent } from "@/data/nightEvents";
import { RichInline } from "@/components/common/RichText";

interface NightBingeOverlayProps {
  book: NightEvent;
  /** 天气夜特装章（雨夜/雷夜/雾夜/阴天夜/晴夜/巡逻夜/五夜终章；常规夜不传） */
  badge?: string;
  /** 连播进度章：连播 x/n */
  queueLabel?: string;
  /** 第三学期的批注（正文之后的一行） */
  thirdNote?: string;
  onNext?: () => void;
  nextLabel?: string;
  onClose: () => void;
  /** 自动翻页（批次 CY-138）：开着时每册约十二秒翻下一册，顶部有一根读完进度条 */
  auto?: boolean;
  onToggleAuto?: () => void;
}

export function NightBingeOverlay({
  book,
  badge,
  queueLabel,
  thirdNote,
  onNext,
  nextLabel = "下一夜 ▸",
  onClose,
  auto,
  onToggleAuto,
}: NightBingeOverlayProps) {
  const choices = book.choices ?? (book.choice ? [book.choice] : []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`深夜台词：${book.title}`}
        className="anim-fade-up relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-lg"
      >
        {/* 自动翻页的进度条：一册读完走满一格，读完就翻下一册 */}
        {auto && onNext && (
          <div aria-hidden className="absolute inset-x-0 top-0 z-10 h-0.5 bg-border/40">
            <div key={`read-${book.id}`} className="anim-read-progress h-full bg-primary" />
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="关掉这一册（连播整串停）"
          className="absolute right-3 top-3 z-10 rounded-full border border-border bg-card p-2 text-card-foreground shadow-md transition-shadow duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
        >
          <X size={14} />
        </button>

        {/* 头部：夜名 + 地点时刻 + 特装章 + 连播进度 */}
        <div className="flex min-h-[76px] items-center gap-3 border-b border-dashed border-border bg-background/60 px-5 py-4">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              {badge && (
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-primary">
                  {badge}
                </span>
              )}
              {queueLabel && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                  {queueLabel}
                </span>
              )}
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                重读 · 不另记
              </span>
            </p>
            <h3 className="mt-1.5 truncate text-lg font-bold text-card-foreground">{book.title}</h3>
            <p className="mt-0.5 font-mono text-xs tracking-widest text-muted-foreground">{book.place}</p>
          </div>
        </div>

        {/* 正文：那一夜的台词全录 */}
        <div className="max-h-[52vh] space-y-4 overflow-y-auto px-5 pb-5 pt-4">
          {book.nodes.map((node) => {
            const name =
              node.speakerId === "narration"
                ? "夜白"
                : FROG_CHARACTERS[node.speakerId as FrogCharacterId]?.displayName ?? "某只蛙";
            return (
              <div key={node.id}>
                <p className="text-sm leading-relaxed">
                  <span
                    className={
                      node.speakerId === "narration"
                        ? "mr-2 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground"
                        : "mr-2 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-primary"
                    }
                  >
                    {name}
                  </span>
                  <span className="text-card-foreground">
                    <RichInline text={node.text} />
                  </span>
                </p>
                {node.innerVoice && (
                  <p className="mt-1 border-l-2 border-primary/40 pl-3 text-xs italic leading-relaxed text-muted-foreground">
                    （内心）<RichInline text={node.innerVoice} />
                  </p>
                )}
              </div>
            );
          })}
          {choices.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
              <p className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">那一夜差一步出口</p>
              {choices.map((item) => (
                <p key={item.id} className="mt-1.5 text-sm font-bold leading-relaxed text-card-foreground">
                  <RichInline text={item.text} />
                </p>
              ))}
            </div>
          )}
          {thirdNote && (
            <p className="border-t border-dashed border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              <span className="mr-2 font-mono text-[10px] font-bold tracking-widest">第三学期</span>
              {thirdNote}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-dashed border-border px-5 py-4">
          {onNext && onToggleAuto && (
            <button
              type="button"
              onClick={onToggleAuto}
              aria-pressed={Boolean(auto)}
              title="开着就一册一册自己翻；关掉就手动点下一夜"
              className={clsx(
                "shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                auto
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              {auto ? "自动 · 开着" : "自动下一册"}
            </button>
          )}
          <button
            type="button"
            onClick={onNext ?? onClose}
            autoFocus
            aria-label={onNext ? `收尾：${nextLabel}` : "收尾：合上书架"}
            className="flex-1 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
          >
            {onNext ? nextLabel : "合上书架"}
          </button>
        </div>
      </div>
    </div>
  );
}
