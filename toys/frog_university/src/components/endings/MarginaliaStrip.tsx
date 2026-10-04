/**
 * 页边手迹合集（批次 CY-36）：你在各页结局页边写下的字，跨线汇成一页。
 * 点标题翻回原文；「全部抄一份」把整页手迹按档案格式复制到剪贴板——
 * 官方文本不许改，但你写的这些，本来就该带走。
 */
import { useRef, useState } from "react";
import { ClipboardCopy, ImageDown } from "lucide-react";
import { clsx } from "clsx";
import type { StorylineId } from "@/data/storylines";
import { capturePng } from "@/lib/exportPng";

interface MarginaliaStripProps {
  notes: Array<{ lineId: StorylineId; lineTitle: string; endingId: string; title: string; note: string }>;
  /** 点标题：翻回写批注的那页原文 */
  onOpen: (lineId: StorylineId, endingId: string) => void;
}

export function MarginaliaStrip({ notes, onOpen }: MarginaliaStripProps) {
  const [copied, setCopied] = useState(false);
  /* 手迹存图（批次 CY-39）：整张纸连字带标题一起拍下来 */
  const sheetRef = useRef<HTMLElement | null>(null);
  const [shotState, setShotState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  if (notes.length === 0) return null;

  const exportSheet = async () => {
    const node = sheetRef.current;
    if (!node || shotState === "busy") return;
    setShotState("busy");
    const ok = await capturePng(node, `奶蛙大学·页边手迹-${notes.length}行.png`);
    setShotState(ok ? "done" : "failed");
    window.setTimeout(() => setShotState("idle"), ok ? 2000 : 2500);
  };

  /** 全部抄一份（批次 CY-36）：按档案誊抄格式进剪贴板；这台设备不让复制就如实说 */
  const copyAll = async () => {
    const text = [
      "页边手迹 · 奶蛙大学档案誊抄件",
      `（共 ${notes.length} 行，均为你在结局页边亲笔所留）`,
      "",
      ...notes.map((item) => `《${item.title}》（${item.lineTitle}）—— ${item.note}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      ref={sheetRef}
      aria-label="页边手迹合集"
      className="anim-fade-up mt-4 rounded-3xl border border-border bg-card p-5 shadow-md"
    >
      <h4 className="flex flex-wrap items-center gap-2">
        <span className="text-base font-bold text-primary" aria-hidden>
          ✎
        </span>
        <span className="text-sm font-bold text-card-foreground">页边手迹</span>
        <span className="text-xs text-muted-foreground">你在各页结局页边留下的字，都在这张纸上</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{notes.length} 行</span>
        {/* 手迹存图（批次 CY-39）：这张纸原样存成图片 */}
        <button
          type="button"
          data-export-ui="1"
          onClick={exportSheet}
          disabled={shotState === "busy"}
          title="把这张手迹纸存成图片"
          className={clsx(
            "ml-auto inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
            shotState === "done"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background/70 text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <ImageDown size={11} aria-hidden />
          {shotState === "busy" ? "正在画…" : shotState === "done" ? "存好了" : shotState === "failed" ? "不让存" : "存成图"}
        </button>
        <button
          type="button"
          data-export-ui="1"
          onClick={copyAll}
          title="按档案誊抄格式复制全部手迹，粘到哪都行"
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
            copied
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background/70 text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <ClipboardCopy size={11} aria-hidden />
          {copied ? "已抄好，去粘吧" : "全部抄一份"}
        </button>
      </h4>
      <ul className="mt-3 flex flex-col gap-2">
        {notes.map((item) => (
          <li
            key={item.endingId}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-2xl border border-border bg-background/60 px-3.5 py-2.5"
          >
            <span aria-hidden className="text-xs text-primary">
              ✎
            </span>
            <button
              type="button"
              onClick={() => onOpen(item.lineId, item.endingId)}
              title={`翻回原文：《${item.title}》`}
              className="text-sm font-bold text-card-foreground transition-colors duration-200 hover:text-primary focus-visible:shadow-focus focus-visible:rounded focus-visible:outline-none"
            >
              《{item.title}》
            </button>
            <span className="text-[10px] font-bold text-muted-foreground">{item.lineTitle}</span>
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground" style={{ fontStyle: "italic" }}>
              {item.note}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
