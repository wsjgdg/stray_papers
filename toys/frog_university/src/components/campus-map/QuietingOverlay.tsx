/**
 * 校园地图 · 传染（批次 CM「传染」）
 * 沉默不是你一个人的事。你沉默得够久，校园会开始安静——
 * 不是因为你，是因为安静本身会学：别的蛙看见你沉默没事，它们也开始沉默。
 * 发现 → 三件你注意到的事 → 三种选择（继续 / 说一句话 / 不承认）→ 落定。
 * 落点：你不是最后一个沉默的——你是第一个。
 */
import { useState } from "react";
import { VolumeX } from "lucide-react";
import { QUIETING_DISCOVERY, QUIETING_OUTCOMES, QUIETING_SIGNS, quietingEchoOf } from "@/data/quieting";
import { RichText } from "@/components/common/RichText";

interface QuietingOverlayProps {
  /** 注意到那一天 */
  day: number;
  /** 上一学期也很安静（开学就还在安静） */
  carried: boolean;
  /** 选择（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (response: "keep" | "speak" | "deny") => void;
  /** 收下 */
  onClose: () => void;
}

export function QuietingOverlay({ day, carried, onRespond, onClose }: QuietingOverlayProps) {
  const [stage, setStage] = useState<"find" | "respond" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"keep" | "speak" | "deny" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="传染"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <VolumeX size={13} aria-hidden />
            校园安静程度 · 变化
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "这学期更安静了"
              : stage === "respond"
                ? "三种选择"
                : stage === "outcome"
                  ? choice === "keep"
                    ? "未作回应"
                    : choice === "speak"
                      ? "高声"
                      : "不承认"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={QUIETING_DISCOVERY} />
              {carried && (
                <p className="mt-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                  {quietingEchoOf()}
                </p>
              )}
              <div className="mt-3 flex flex-col gap-1.5">
                {QUIETING_SIGNS.map((item) => (
                  <p
                    key={item.place}
                    className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-2 text-[12px] leading-relaxed text-card-foreground"
                  >
                    <span className="mr-1.5 font-mono text-[10px] font-bold tracking-widest text-primary">{item.place}</span>
                    {item.line}
                  </p>
                ))}
              </div>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                不是你的错。但每只蛙都能感到：这学期的教室比上学期安静。安静是从哪里开始的，它们不知道——你知道。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("respond")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  ……
                </button>
              </div>
            </>
          )}

          {stage === "respond" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种选择。没有正确的——只有你要不要认下这个开头。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("keep");
                    onRespond("keep");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">继续</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    什么都不做，继续沉默。沉默值 +1——安静会自己学。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("speak");
                    onRespond("speak");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">说一句话</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    去食堂窗口大声说一句「多加一勺」。被注意值 +2——打破要被记录。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("deny");
                    onRespond("deny");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不承认</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    「跟我没关系。」被注意值 +1——否认要先承认存在需要否认的事。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={QUIETING_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={QUIETING_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={QUIETING_OUTCOMES[choice].filing} />
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
                校园照旧。灯照旧亮着。下一只看见这些的蛙，会以为一直就是这样。
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
