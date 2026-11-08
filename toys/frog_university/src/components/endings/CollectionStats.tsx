import { useRef, useState } from "react";
import { clsx } from "clsx";
import { ImageDown, Trophy } from "lucide-react";
import { capturePng } from "@/lib/exportPng";

interface CollectionStatsProps {
  collectedCount: number;
  totalCount: number;
  lineSummaries: Array<{ title: string; count: number; total: number }>;
  allCollected: boolean;
  /** 个人痕迹（批次 CY-36）：钉过心的页数，0 则不显示 */
  pinnedCount?: number;
  /** 个人痕迹（批次 CY-36）：写过页边批注的行数，0 则不显示 */
  noteCount?: number;
}

/** 顶部统计区：已收集大数字 + 进度条 + 各线小计 + 全收集彩蛋 */
export function CollectionStats({
  collectedCount,
  totalCount,
  lineSummaries,
  allCollected,
  pinnedCount = 0,
  noteCount = 0,
}: CollectionStatsProps) {
  const percent = totalCount > 0 ? Math.round((collectedCount / totalCount) * 100) : 0;
  /* 统计存图（批次 CY-41）：整块统计誊成一张盖了蛙校印章的图 */
  const statsRef = useRef<HTMLElement | null>(null);
  const [shotState, setShotState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const exportShot = async () => {
    const node = statsRef.current;
    if (!node || shotState === "busy") return;
    setShotState("busy");
    const ok = await capturePng(node, "奶蛙大学·收集统计.png");
    setShotState(ok ? "done" : "failed");
    window.setTimeout(() => setShotState("idle"), ok ? 2000 : 2500);
  };

  return (
    <section
      ref={statsRef}
      aria-label="收集统计"
      className="rounded-3xl border border-border bg-card p-6 shadow-md md:p-8"
    >
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          data-export-ui="1"
          onClick={exportShot}
          disabled={shotState === "busy"}
          title="把这块收集统计存成一张图"
          className={clsx(
            "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
            shotState === "done"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background/70 text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <ImageDown size={11} aria-hidden />
          {shotState === "busy" ? "正在画…" : shotState === "done" ? "存好了" : shotState === "failed" ? "这台设备不让存" : "存成图"}
        </button>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">已收集的结局</p>
          <p className="mt-2 flex items-baseline gap-2 font-bold leading-none">
            <span className="ds-display text-6xl text-primary">{collectedCount}</span>
            <span className="text-2xl text-muted-foreground">/ {totalCount}</span>
          </p>
          <div
            className="mt-4 h-2 w-52 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={collectedCount}
            aria-valuemin={0}
            aria-valuemax={totalCount}
            aria-label="结局收集进度"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">进度 {percent}%</p>
          {/* 个人痕迹（批次 CY-36）：图鉴不止收结局，也收你在它身上留下的动作 */}
          {(pinnedCount > 0 || noteCount > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {pinnedCount > 0 && (
                <span
                  className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary"
                  title="你钉过心的结局页——它们在图鉴里排最前"
                >
                  钉心 {pinnedCount} 页
                </span>
              )}
              {noteCount > 0 && (
                <span
                  className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                  title="你在结局页边写下的批注——手迹合集在下面的筛选区里"
                >
                  手迹 {noteCount} 行
                </span>
              )}
            </div>
          )}
        </div>

        <ul className="flex max-w-md flex-wrap gap-2" aria-label="各线小计">
          {lineSummaries.map((item) => (
            <li
              key={item.title}
              className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              {item.title}
              <span
                className={clsx(
                  "ml-1.5 font-bold",
                  item.count > 0 ? "text-primary" : "text-muted-foreground",
                )}
              >
                {item.count}/{item.total}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {allCollected && (
        <div className="mt-7 rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
            <Trophy size={13} />
            全收集
          </p>
          <p className="mt-3 text-base leading-relaxed text-card-foreground">
            {totalCount} 种沉默你都集齐了。图鉴会记得，蛙不会。
          </p>
        </div>
      )}
    </section>
  );
}
