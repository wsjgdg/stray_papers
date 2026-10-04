/**
 * 校园地图 · 回单（批次 CQ「回单」）
 * 你签过字的单子，回来了。行政楼的蛙拿着《核对通知》在窗口等你——
 * 问的是上学期那份交接。三种应对：照认 / 指单 / 补圆——没有正确的，只有你交出去的版本。
 */
import { useState } from "react";
import { FileSearch } from "lucide-react";
import {
  TESTIMONY_DONE,
  TESTIMONY_DISCOVERY,
  TESTIMONY_LABEL,
  TESTIMONY_NOTICE,
  TESTIMONY_OUTCOMES,
  type ShiftResponse,
} from "@/data/testimony";
import { RichText } from "@/components/common/RichText";

interface TestimonyOverlayProps {
  /** 核对那一天 */
  day: number;
  /** 回单的事由：上学期哪种交法惹的 */
  about: ShiftResponse;
  /** 应对（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (response: "confirm" | "point" | "smooth") => void;
  /** 收下 */
  onClose: () => void;
}

export function TestimonyOverlay({ day, about, onRespond, onClose }: TestimonyOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"confirm" | "point" | "smooth" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="回单"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FileSearch size={13} aria-hidden />
            {TESTIMONY_LABEL}
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "签过的单子回来了"
              : stage === "ask"
                ? "请经办人说明"
                : stage === "outcome"
                  ? choice === "confirm"
                    ? "已认责"
                    : choice === "point"
                      ? "移交原单"
                      : "予以采纳"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 经办人：学号 036
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={TESTIMONY_DISCOVERY[about]} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《核对通知》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={TESTIMONY_NOTICE[about].item} />
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={TESTIMONY_NOTICE[about].question} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  答复方式：经办人自述，签字为凭。说明内容核对无误后归档。
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看问的是哪一项
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种说明。没有正确的——只有你交出去的那个版本。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("confirm");
                    onRespond("confirm");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">照认</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    「是我经手的。」把它认下来。被注意值 +1——纰漏落到你名下，纸面上从此有了着落。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("point");
                    onRespond("point");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">指单</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    「单子上就是这么写的。」把话停在这一句。沉默值 +1——剩下的让单子说。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("smooth");
                    onRespond("smooth");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">补圆</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    当场圆一个说法。被注意值 +2——它们最记会把纸面写平的。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={TESTIMONY_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={TESTIMONY_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={TESTIMONY_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={TESTIMONY_DONE} />
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
