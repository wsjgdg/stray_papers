/**
 * 校园地图 · 期末公示（批次 AQ「校园的声音」之三）
 * 期末周第一天，公示栏出成绩——档案柜里早就有的三样数字，今天贴到了墙上：
 * 数字旁边盖着章「公示无异议」。没有人对无异议提出异议，包括你。
 * 这学期你是这些数字的当事人：它们比你先被看见。
 */
import { Megaphone } from "lucide-react";

interface NoticeOverlayProps {
  /** 学期号 */
  playthrough: number;
  silenceValue: number;
  /** 表演分（印象分） */
  reputation: number;
  /** 被注意值：≥8 名单在列 */
  attention: number;
  /** 印象分档位称号（顶栏同款） */
  impressionLabel: string;
  onClose: () => void;
}

export function NoticeOverlay({
  playthrough,
  silenceValue,
  reputation,
  attention,
  impressionLabel,
  onClose,
}: NoticeOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="期末公示"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Megaphone size={13} aria-hidden />
            学工办公告栏 · 期末公示
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">成绩已公示</h2>

          <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["沉默值", silenceValue],
                ["表演分", reputation],
                ["被注意值", attention],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-card/60 py-2">
                  {label}
                  {value}
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] font-bold text-muted-foreground">
              第 {playthrough} 学期 · 印象分档位：{impressionLabel} ·{" "}
              {attention >= 8 ? "重点关注名单在列" : "无异常记录"}
            </p>
            <p className="mt-2 text-center font-mono text-[10px] tracking-widest text-primary">☑ 公示无异议</p>
          </div>

          <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
            数字旁边盖着章：公示无异议。没有人对无异议提出异议——包括你。这学期你是这些数字的当事人：
            它们比你先被看见。
          </p>
          <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
            档案里多了一行：期末成绩已公示。公示无异议。
          </p>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              看完了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
