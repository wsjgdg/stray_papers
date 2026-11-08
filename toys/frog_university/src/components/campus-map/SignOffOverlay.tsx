/**
 * 校园地图 · 会签（批次 BX「会签」）
 * 说明流转到各部门——每个部门加自己的评语，制度不核对内容，只核对有这份说明。
 * 落点：制度不核对内容，只核对有这份说明；评语栏填的不是评语，是「有这份说明」这一件事。
 */
import { useState } from "react";
import { FileSignature } from "lucide-react";
import { clsx } from "clsx";
import { RichText } from "@/components/common/RichText";

/** 会签评语：部门 + 评语（种子派生，同一颗种子同一批） */
export interface SignOffItem {
  dept: string;
  comment: string;
}

interface SignOffOverlayProps {
  /** 会签发生在第几天 */
  day: number;
  /** 各部门的会签评语（种子派生，同一颗种子同一批） */
  items: SignOffItem[];
  /** 会签完成（落档 + 收浮层） */
  onAck: () => void;
}

export function SignOffOverlay({ day, items, onAck }: SignOffOverlayProps) {
  const [step, setStep] = useState(0);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="会签"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FileSignature size={13} aria-hidden />
            学工办 · 会签
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {step === 0 ? "传阅" : "评语"}
          </h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                说明在各部门之间流转起来了。传阅单上贴着签收栏——每过一个部门，签收栏就多一行。
                传阅单抬头写着第 {day} 天。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你数了数，一共去了 {items.length} 个部门。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                制度不追问内容，只核对有这份说明——评语栏填的不是评语，是「有这份说明」这一件事。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看评语
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                评语回来了。一个部门一行，评语栏填的不是评语，是「有这份说明」这一件事。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {items.map((item) => (
                  <div
                    key={item.dept}
                    className="rounded-xl border border-dashed border-border bg-background/60 p-3"
                  >
                    <RichText className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground" text={item.dept} />
                    <p className={clsx("mt-1 text-sm leading-relaxed text-card-foreground")}>{item.comment}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                制度不核对内容，只核对有这份说明——评语栏填的不是评语，是「有这份说明」这一件事。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onAck}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收下
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
