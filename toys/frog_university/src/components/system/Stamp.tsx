/**
 * 印章（批次 CH/CI「行政化」）：数值不做成条，做成档案页边上的批注——
 * 五档深浅（空白 / 浅灰 / 灰 / 深灰 / 黑），不显示具体数字；想知道多少，去档案柜里查。
 * 被注意值到最高档会渗墨（stamp-bleed）。
 */
import { clsx } from "clsx";

/** 五档样式（0 空白 / 1 浅 / 2 灰 / 3 深 / 4 黑） */
export const STAMP_TIERS: string[] = [
  "border-dashed border-muted-foreground/40 text-transparent",
  "border-muted-foreground/40 text-muted-foreground/40",
  "border-muted-foreground/60 text-muted-foreground/70",
  "border-foreground/70 text-foreground/90",
  "border-foreground text-foreground",
];

export const STAMP_LABELS: string[] = ["空白", "浅", "灰", "深", "黑"];

/** 分档：value ≤ 0 = 空白档；step 为每档步长，最高封顶第 5 档 */
export function stampTierOf(value: number, step: number): number {
  if (value <= 0) return 0;
  return Math.min(4, Math.floor(value / step));
}

interface StampProps {
  /** 章面单字：默 / 良 / 陈 / 注 */
  glyph: string;
  /** 章下的读数来源（换算分档用） */
  value: number;
  /** 每档步长 */
  step: number;
  /** 达到该档位后开始渗墨（默认不开） */
  bleedFrom?: number;
  /** 尺寸 */
  size?: "sm" | "md";
}

export function Stamp({ glyph, value, step, bleedFrom, size = "md" }: StampProps) {
  const tier = stampTierOf(value, step);
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span
        className={clsx(
          "inline-flex items-center justify-center rounded-full border-2 font-bold",
          STAMP_TIERS[tier],
          size === "md" ? "h-9 w-9 text-base" : "h-7 w-7 text-sm",
          bleedFrom !== undefined && tier >= bleedFrom && "stamp-bleed",
        )}
        aria-label={`${glyph} · 印章第 ${tier + 1} 档（${STAMP_LABELS[tier]}）`}
      >
        {glyph}
      </span>
      <span className="font-mono text-[9px] leading-relaxed text-muted-foreground/70">{STAMP_LABELS[tier]}</span>
    </span>
  );
}
