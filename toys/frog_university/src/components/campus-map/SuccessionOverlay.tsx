/**
 * 校园地图 · 接任（批次 CR「接任」）
 * 《工作交接单》的接办人一栏空了。行政楼把它退回来，附一张《接办人登记表》——
 * 空栏要填，填谁原来不归你管，现在归你管了。
 * 三种填法：填一个名字 / 交给系统 / 填回你自己——没有正确的，只有栏里最后是谁。
 */
import { useState } from "react";
import { UserPlus } from "lucide-react";
import {
  SUCCESSION_DISCOVERY,
  SUCCESSION_DONE,
  SUCCESSION_NOTICE,
  SUCCESSION_OUTCOMES,
  type SuccessionCandidate,
} from "@/data/succession";
import { RichText } from "@/components/common/RichText";

interface SuccessionOverlayProps {
  /** 登记那一天 */
  day: number;
  /** 行政楼门口打盹的那只（填名时用） */
  candidate: SuccessionCandidate;
  /** 填法（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "name" | "blank" | "self", frog?: string) => void;
  /** 收下 */
  onClose: () => void;
}

export function SuccessionOverlay({ day, candidate, onRespond, onClose }: SuccessionOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"name" | "blank" | "self" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="接任"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <UserPlus size={13} aria-hidden />
            接办人登记表
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "那一栏还空着"
              : stage === "ask"
                ? "填谁"
                : stage === "outcome"
                  ? choice === "name"
                    ? "交接完成"
                    : choice === "blank"
                      ? "待指派"
                      : "循环受理"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 经办人：学号 036
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={SUCCESSION_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《接办人登记表》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={SUCCESSION_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  接办人：＿＿＿＿＿＿＿＿（空置中。填写人：由经办人本人担任。）
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看笔在哪儿
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种填法。没有正确的——只有栏里最后是谁。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("name");
                    onRespond("name", candidate.name);
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    填一个名字
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    行政楼门口打盹的那只——{candidate.name}。{candidate.note}
                    被注意值 +1——你第一次决定让谁被处理。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("blank");
                    onRespond("blank");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">交给系统</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    「由系统指派。」沉默值 +1——空栏会在某个你不在场的下午，被一只你没听说过的蛙填上。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("self");
                    onRespond("self");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">填回你自己</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    学号 036。被注意值 +2——你交出去的班，你自己接了回来。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={SUCCESSION_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={SUCCESSION_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={SUCCESSION_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={SUCCESSION_DONE} />
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
