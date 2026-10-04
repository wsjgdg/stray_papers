/**
 * 档案柜使用说明（批次 AW「流程的说明书」之一）
 * 八条条款，收编玩家已经做过的每一件事——不是为了禁止，
 * 是为了证明流程早就允许了。你做过的每一件事，这里早就允许了。
 */
import { BookOpen, ScrollText } from "lucide-react";

/** 八条条款：每一条背后都是玩家已经做过的一件事 */
const MANUAL_CLAUSES: string[] = [
  "一、本柜按学期归档。当事人可以翻阅、对比、复印，但不能调整顺序——你的学期按发生的顺序排列，跟你怎么过的无关。",
  "二、正文不可修改。当事人如有异议，可以在空白处补记一句（六十字以内）：档案照收，不加批语，下一学期会有蛙照着念。",
  "三、页面的破损不影响效力。划掉的字、撕掉的那一半、缺掉的页，一律按「已阅」处理。",
  "四、复印件与原件效力等同。带走可以，原件不缺页。",
  "五、抹除记录需经窗口办理；抹除这个动作本身会占一格。",
  "六、本柜不设锁——它用流程。合上、打开、再合上，次数照记，柜子不问为什么。",
  "七、提前毕业按惯例受理。未完成课程按「无」计，不另补考；申请那一栏签过字就算数。",
  "八、本说明最终解释权归档案室所有。需要解释的都写进了前面七条——你做过的每一件事，这里早就允许了。",
];

interface CabinetManualOverlayProps {
  onClose: () => void;
}

export function CabinetManualOverlay({ onClose }: CabinetManualOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="档案柜使用说明"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <ScrollText size={13} aria-hidden />
            档案室 · 柜内公示
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">档案柜使用说明</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            夹在第一页的下面。它一直在——你翻到这一页才看见它。
          </p>

          <ol className="mt-4 space-y-2.5">
            {MANUAL_CLAUSES.map((clause) => (
              <li
                key={clause.slice(0, 6)}
                className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-card-foreground"
              >
                {clause}
              </li>
            ))}
          </ol>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs font-bold leading-relaxed text-primary">
            <BookOpen size={13} aria-hidden />
            你做过的每一件事，这里早就允许了。
          </p>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              放回原处
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
