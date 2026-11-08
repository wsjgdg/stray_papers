/**
 * 校园地图 · 校园广播（批次 AQ「校园的声音」之一）
 * 你说过的一句真话，今天上了广播——播音员念的是公共版本：语气平，语速匀，
 * 跟你当初说出口的时候不一样。没有指名，但你知道在说谁。
 * 传话（批次 AJ）联动：同一句在走廊里传过几手，广播稿就比第 N 手更短——
 * 档案柜里收的是原文，广播念的是它认为合适的版本。
 */
import { Radio } from "lucide-react";

interface BroadcastOverlayProps {
  /** 广播稿（原文或被传话剪短的版本） */
  trimmed: string;
  /** 这句话之前在走廊里传过几手（0 = 第一次出走廊） */
  relays: number;
  onClose: () => void;
}

export function BroadcastOverlay({ trimmed, relays, onClose }: BroadcastOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="校园广播"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Radio size={13} aria-hidden />
            校园广播 · 今晨播报
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">广播念了一段话</h2>

          <blockquote className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground">
            「{trimmed}」
          </blockquote>

          {relays > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              走廊里传到第 {relays} 手的那句，今天上了广播。广播稿比第 {relays} 手更短。
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-card-foreground">
            播音员念的是公共版本：语气平，语速匀，跟你当初说出口的时候不一样。没有指名。但你知道在说谁。
          </p>
          <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
            档案里多了一行：该蛙的一句真话被转播（内容照实，措辞照改）。
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            广播不收回应。它只念一遍，然后翻下一页。
          </p>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              关掉
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
