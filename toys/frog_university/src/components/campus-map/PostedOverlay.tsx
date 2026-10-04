/**
 * 校园地图 · 署名启事（批次 AR「你的位置」之一）
 * 本学期由种子派生的某一天，公告栏贴了一张署名是你的启事——你没写过。
 * 档案里也没有这一行：它不记录它没安排的事。
 * 你做的没被记，别人用你的名字做的也没被记——在流程里，这两件事是同一件。
 */
import { ScrollText } from "lucide-react";
import type { PostedDoc } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface PostedOverlayProps {
  /** 启事（种子派生：同一颗种子同一张） */
  doc: PostedDoc;
  /** 看过了（落档 + 收浮层） */
  onAck: () => void;
}

export function PostedOverlay({ doc, onAck }: PostedOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="公告栏 · 署名启事"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <ScrollText size={13} aria-hidden />
            公告栏 · 已张贴
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">这张启事署名是你</h2>

          <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
            <RichText className="text-xs font-bold tracking-widest text-primary" text={doc.title} />
            <p className="mt-2 text-sm leading-relaxed text-card-foreground">
              落款：该蛙。
              <span className="mt-1 block text-xs text-muted-foreground">{doc.footer}</span>
            </p>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-card-foreground">你没写过。</p>
          <p className="mt-2 text-sm leading-relaxed text-card-foreground">
            你确认了一下字迹——像你的，又不全是：档案里存着你的字，这一笔像是从档案里描的。
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            你去找学工办问。窗口说：公告是流程里的一环，署名是流程的一部分。流程没有「是谁写的」这一栏。
          </p>
          <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
            档案里也没有这一行——它不记录它没安排的事。你做的没被记，别人用你的名字做的也没被记：
            在流程里，这两件事是同一件。
          </p>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onAck}
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
