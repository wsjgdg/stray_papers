/**
 * 校园地图 · 交班（批次 CP「交班」）
 * 学期末，行政楼的蛙拿着《工作交接单》在门口等你——你不是毕业生，你是经办人。
 * 交接单上列着你这学期经办过的每一类公务（从存档派生）。
 * 三种选择：照单交 / 少交一项 / 多交一项——没有正确的，只有你交出去的是什么。
 */
import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { SHIFT_DISCOVERY, SHIFT_OUTCOMES } from "@/data/shiftHandover";
import { RichText } from "@/components/common/RichText";

interface ShiftHandoverOverlayProps {
  /** 交接那一天 */
  day: number;
  /** 本学期经办的事项数（从存档派生） */
  items: number;
  /** 选择（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (response: "sign" | "omit" | "extra", items: number) => void;
  /** 收下 */
  onClose: () => void;
}

export function ShiftHandoverOverlay({ day, items, onRespond, onClose }: ShiftHandoverOverlayProps) {
  const [stage, setStage] = useState<"find" | "respond" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"sign" | "omit" | "extra" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="交班"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <ClipboardList size={13} aria-hidden />
            工作交接单
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "要交了"
              : stage === "respond"
                ? "三种交法"
                : stage === "outcome"
                  ? choice === "sign"
                    ? "已核签"
                    : choice === "omit"
                      ? "缺一项"
                      : "予以收录"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 经手 {items} 项
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={SHIFT_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《工作交接单》</p>
                <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                  经办人：学号 036。经手事项：
                  <span className="font-bold text-primary">{items}</span> 项（值班、执笔、报告、递件、
                  其他——具体名目见附件）。移交方式：逐项核签。
                </p>
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  接办人：（下一学期填。填谁，不归你管。）
                </p>
              </div>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你接过别人的班，接过很多次——现在轮到你把自己的交出去。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("respond")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看单子
                </button>
              </div>
            </>
          )}

          {stage === "respond" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种交法。没有正确的——只有你交出去的是什么。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("sign");
                    onRespond("sign", items);
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">照单交</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    逐项核对，逐项签。被注意值 +1——交清楚的好经办，被记了一笔好。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("omit");
                    onRespond("omit", items);
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">少交一项</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    有一项你不写。沉默值 +1——缺的那一项，一直归你管。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("extra");
                    onRespond("extra", items);
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">多交一项</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    主动写上一件没人知道你做过的事。被注意值 +2——它们最记主动申报。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={SHIFT_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={SHIFT_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={SHIFT_OUTCOMES[choice].filing} />
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("done")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收下回执
                </button>
              </div>
            </>
          )}

          {stage === "done" && (
            <>
              <p className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground">
                门要关了。交接单压在桌上，接办人那一栏还空着——它会一直空着，直到下一学期的某一只
                把它填上。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
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
