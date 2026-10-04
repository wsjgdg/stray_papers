/**
 * 校园地图 · 档案清点（批次 AS「另一些日子」之一）
 * 本学期由种子派生的某一天，有人来清点档案柜。你的那一页被翻动过——不是你翻的。
 * 清点的蛙没有看你，看的是编号。你被数过了——像清点物资，结论照例是「在柜」。
 */
import { ClipboardList } from "lucide-react";

interface InventoryOverlayProps {
  /** 清点过了（落档 + 收浮层） */
  onAck: () => void;
}

export function InventoryOverlay({ onAck }: InventoryOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="档案清点"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <ClipboardList size={13} aria-hidden />
            档案室 · 年度清点
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">今天有人来清点档案柜</h2>

          <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
            你的那一页被翻动过——不是你翻的。清点单上写着：在柜。在柜多少页，清点单没写——
            多出来的那几页是谁的，它也没写。
          </p>
          <p className="mt-2 text-sm leading-relaxed text-card-foreground">
            清点的蛙戴着袖套，动作很快。它没有看你——它看的是编号。翻到你那一页的时候它停了半秒，
            大概是因为编号顺延得不对，也可能什么都不是。
          </p>
          <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
            清点完它走了。柜子里每一样东西都在原位。你也是——你被数过了，也在原位。
          </p>
          <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
            该蛙被清点。结论：在柜。
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
