/**
 * 你钉过的（批次 CY-35）：跨线收集所有钉过心的结局页，摆在图鉴最上面一排。
 * 点心取下心（回到各线原位），点标题直接翻全文——喜欢的东西不该埋在筛选后面。
 */
import { useState } from "react";
import { ImageDown, Pin } from "lucide-react";
import { clsx } from "clsx";
import type { StorylineId } from "@/data/storylines";
import { exportEndingPaper } from "@/lib/endingPaper";

interface PinnedEndingsStripProps {
  pinned: Array<{
    lineId: StorylineId;
    lineTitle: string;
    endingId: string;
    title: string;
    tierLabel: string;
    text: string;
    note?: string;
  }>;
  /** 本轮在图鉴里亲手钉过的心（CY-135 收藏动效）：这几枚入场时高亮一次 */
  freshIds?: string[];
  /** 点标题：打开结局全文（Logic 层知道该带哪条线） */
  onOpen: (lineId: StorylineId, endingId: string) => void;
  /** 点心：取下这一枚 */
  onUnpin: (endingId: string) => void;
}

/** 打包存图一次最多誊几页：再多浏览器就要拦多重下载了 */
const BATCH_CAP = 8;

export function PinnedEndingsStrip({ pinned, freshIds, onOpen, onUnpin }: PinnedEndingsStripProps) {
  /* 打包存图（批次 CY-41）：每页誊一份档案复印件走统一盖章通道，一页一张图连发 */
  const [batchState, setBatchState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  if (pinned.length === 0) return null;

  const exportBatch = async () => {
    if (batchState === "busy") return;
    setBatchState("busy");
    let allOk = true;
    for (const item of pinned.slice(0, BATCH_CAP)) {
      const ok = await exportEndingPaper({
        lineTitle: item.lineTitle,
        tierLabel: item.tierLabel,
        title: item.title,
        text: item.text,
        note: item.note,
      });
      if (!ok) allOk = false;
      /* 页间留一口气，别让下载挤成一团 */
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    setBatchState(allOk ? "done" : "failed");
    window.setTimeout(() => setBatchState("idle"), allOk ? 2000 : 2500);
  };
  return (
    <section aria-label="你钉过的结局" className="anim-fade-up mt-5 rounded-3xl border border-primary/40 bg-primary/5 p-5">
      <h4 className="flex flex-wrap items-center gap-2">
        <Pin size={14} className="fill-primary text-primary" aria-hidden />
        <span className="text-sm font-bold text-card-foreground">你钉过的</span>
        <span className="text-xs text-muted-foreground">跨线汇总——这一排全部是你亲手钉过心的结局页</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{pinned.length} 页</span>
        {/* 打包存图（批次 CY-41）：一排钉过心的结局页，一页誊一张档案图 */}
        <button
          type="button"
          data-export-ui="1"
          onClick={exportBatch}
          disabled={batchState === "busy"}
          title={
            pinned.length > BATCH_CAP
              ? `这一排有 ${pinned.length} 页，一次最多誊前 ${BATCH_CAP} 页——剩下的分几次存`
              : "每页誊一张档案图片存下来"
          }
          className={clsx(
            "ml-auto inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
            batchState === "done"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background/70 text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <ImageDown size={11} aria-hidden />
          {batchState === "busy"
            ? `正在誊 ${Math.min(pinned.length, BATCH_CAP)} 页…`
            : batchState === "done"
              ? "都存好了"
              : batchState === "failed"
                ? "有几页没存上"
                : "打包存图"}
        </button>
      </h4>
      <div className="mt-3 flex flex-wrap gap-2">
        {pinned.map((item) => {
          const fresh = freshIds?.includes(item.endingId) ?? false;
          return (
          <span
            key={item.endingId}
            className={clsx(
              "inline-flex items-center gap-1 rounded-full border bg-card py-1 pl-1 pr-2 text-xs font-bold shadow-sm",
              fresh ? "anim-fade-up border-primary/60 bg-primary/10 text-primary" : "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => onUnpin(item.endingId)}
              aria-label={`取下心，不再置顶结局「${item.title}」`}
              title="已钉心——再点取下"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-primary transition-colors duration-200 hover:bg-primary/10 focus-visible:shadow-focus focus-visible:outline-none"
            >
              <Pin size={11} className="fill-current" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onOpen(item.lineId, item.endingId)}
              className={clsx(
                "rounded-full px-1.5 py-0.5 text-card-foreground transition-colors duration-200 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none",
              )}
              title={`翻全文：《${item.title}》`}
            >
              {item.title}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">{item.lineTitle}</span>
            </button>
          </span>
          );
        })}
      </div>
    </section>
  );
}
