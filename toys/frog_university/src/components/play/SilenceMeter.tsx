/**
 * 沉默值可视化：小蛙表情随值渐变（笑 → 微笑 → 僵住 → 沉默），选项后带增量反馈
 */
import { clsx } from "clsx";
import { Frog, type FrogExpression } from "@/components/frog/Frog";

/** 沉默值只走四档基础表情；表情差分新增的四档不进这层口径 */
const TIER_LABEL: Partial<Record<FrogExpression, string>> = {
  laugh: "笑得没心没肺",
  smile: "礼貌营业中",
  frozen: "笑容渐渐消失",
  silent: "彻底沉默",
};

interface SilenceMeterProps {
  value: number;
  expression: FrogExpression;
  gainFlash: { delta: number; stamp: number } | null;
  variant?: "side" | "compact";
  /** 三学期玩法规则（批次 AA）：周目 ≥ 2 数值隐藏——侧表数字显示「——」，档位名照常 */
  hideValues?: boolean;
}

export function SilenceMeter({ value, expression, gainFlash, variant = "side", hideValues = false }: SilenceMeterProps) {
  const flashText =
    gainFlash === null
      ? null
      : gainFlash.delta > 0
        ? `+${gainFlash.delta}`
        : gainFlash.delta === 0
          ? "±0"
          : `${gainFlash.delta}`;

  if (variant === "compact") {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-3 shadow-sm"
        title="沉默值：越配合表演，内心越沉默"
      >
        <Frog size={28} expression={expression} />
        <span className="text-xs font-bold text-card-foreground">{hideValues ? "——" : value}</span>
      </div>
    );
  }

  return (
    <section
      aria-label="沉默值"
      className="relative rounded-2xl border border-border bg-card p-4 shadow-md"
    >
      {flashText && (
        <span className="absolute right-3 top-3 animate-in rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground zoom-in duration-300">
          {flashText}
        </span>
      )}
      <h3 className="text-xs font-bold tracking-widest text-muted-foreground">沉默值</h3>
      <div className="mt-2 flex items-center gap-3">
        <Frog size={72} expression={expression} floaty />
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none text-card-foreground">{hideValues ? "——" : value}</p>
          <p className="mt-1.5 text-sm font-bold text-primary">{TIER_LABEL[expression] ?? "沉默进行中"}</p>
        </div>
      </div>
      <p className="mt-3 border-t border-dashed border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
        越配合表演，内心越沉默。偶尔选「真心话出口」，小蛙会喘口气。
      </p>
      <span className={clsx("hidden", flashText === null && "block")} aria-hidden />
    </section>
  );
}
