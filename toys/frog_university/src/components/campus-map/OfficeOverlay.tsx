/**
 * 校园地图 · 教研室的门（批次 AS「另一些日子」之一）
 * 本学期由种子派生的某一天，你在那扇门前站了一会儿。门一直关着——
 * 但每一份作业、每一次补考、每一条名单，落款都是从这门里出来的。
 * 这所学校里没有老师，只有文件：签字的从来不是你见过的那只。
 */
import { DoorClosed } from "lucide-react";

interface OfficeOverlayProps {
  /** 站过了（落档 + 收浮层） */
  onAck: () => void;
}

export function OfficeOverlay({ onAck }: OfficeOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="教研室的门"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <DoorClosed size={13} aria-hidden />
            教学楼 · 走廊尽头
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">教研室的门</h2>

          <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
            牌子上写着：教研室。门关着。这学期你路过它十一次，每一次都关着。门缝里没有灯光——
            但每一份作业、每一次补考、每一条名单，落款都是从这门里出来的。
          </p>
          <p className="mt-2 text-sm leading-relaxed text-card-foreground">
            你在门口站了一会儿。没有蛙出来，也没有蛙进去。走廊的公告栏贴着本周教研安排：
            周一至周五，教学正常。
          </p>
          <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
            后来你明白了：这所学校里没有老师——只有文件。每一份需要签字的地方，都由这扇空着的门替它签。
            你从来没有见过签字的那只蛙；你见过的每一只蛙，都只是把文件递过来的那一只。
          </p>
          <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
            该蛙于教研室门外停留。门内无记录。
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
