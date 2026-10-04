/**
 * 幕尾结算卡：本幕「蛙言蛙语」金句 + 本幕沉默值变化 + 印象分档位 + 下一幕 / 回地图
 */
import { Quote } from "lucide-react";
import { impressionTierOf } from "@/lib/impression";
import type { UsePlayReturn } from "@/pages/Play/usePlay";

interface ActSummaryCardProps {
  summary: NonNullable<UsePlayReturn["summary"]>;
  /** 当前印象分（0-100） */
  impressionPercent: number;
  onContinue: () => void;
  onBackMap: () => void;
}

export function ActSummaryCard({ summary, impressionPercent, onContinue, onBackMap }: ActSummaryCardProps) {
  const tierLabel = impressionTierOf(impressionPercent).label;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-foreground/45 p-5 backdrop-blur-sm">
      <div className="w-full max-w-md animate-in rounded-3xl border border-border bg-card p-5 text-center shadow-2xl fade-in zoom-in-95 duration-500 sm:p-7">
        <span className="inline-block rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground">
          第 {summary.actIndex} 幕 · 完
        </span>

        <p className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground">
          <Quote size={13} />
          蛙言蛙语
        </p>
        <p className="mt-2 text-2xl font-black tracking-tight leading-snug text-card-foreground">「{summary.quote}」</p>
        {summary.quoteByName && (
          <p className="mt-2 text-sm text-muted-foreground">—— {summary.quoteByName}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <p className="inline-block rounded-full bg-muted px-4 py-1.5 text-xs font-bold text-muted-foreground">
            本幕沉默值 {summary.gain > 0 ? `+${summary.gain}` : "±0"}
          </p>
          <p
            className="inline-block rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-bold text-primary"
            title="印象分：公开场合里的你表演得有多像样（0-100）"
          >
            印象分 {impressionPercent} · {tierLabel}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onContinue}
            className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
          >
            {summary.nextActTitle ? `下一幕 · ${summary.nextActTitle}` : "继续"}
          </button>
          <button
            type="button"
            onClick={onBackMap}
            className="rounded-full border border-border bg-card px-5 py-3 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
          >
            回地图（进度已存）
          </button>
        </div>
      </div>
    </div>
  );
}
