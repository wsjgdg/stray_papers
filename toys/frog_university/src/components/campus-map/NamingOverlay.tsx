/**
 * 校园地图 · 命名（批次 DQ「命名」）
 * 档案室通知：可为本学期事项申请一个简称——简称是你起的。
 * 三种处理：起一个 / 不起 / 起一个像编号的——没有正确的，
 * 只有那些事最后叫什么。
 */
import { useState } from "react";
import { Tag } from "lucide-react";
import { NAMING_DISCOVERY, NAMING_DONE, NAMING_NOTICE, NAMING_OUTCOMES } from "@/data/naming";
import { RichText } from "@/components/common/RichText";

interface NamingOverlayProps {
  /** 张贴那一天 */
  day: number;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "give" | "hold" | "code") => void;
  /** 收下 */
  onClose: () => void;
}

export function NamingOverlay({ day, onRespond, onClose }: NamingOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"give" | "hold" | "code" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="命名"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Tag size={13} aria-hidden />
            档案室 · 命名申请
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "简称是你起的"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "give"
                    ? "自命名"
                    : choice === "hold"
                      ? "空置"
                      : "似号"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 简称栏：空
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={NAMING_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《命名申请》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={NAMING_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  简称：＿＿＿＿（由当事人自定）
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看那一栏
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有那些事最后叫什么。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("give");
                    onRespond("give");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">起一个</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    两个字。被注意值 +1——它第一次收下一个它不知道意思的名字，它不问意思。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("hold");
                    onRespond("hold");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不起</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    栏空置。沉默值 +1——这栋楼里第二次有一件事永远等着你，它等的只是一个你起的名。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("code");
                    onRespond("code");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    起一个像编号的
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    一串像编号的号。被注意值 +2——你用它的格式藏了你的话：它的世界里多了一个它读不懂的号。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={NAMING_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={NAMING_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={NAMING_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={NAMING_DONE} />
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
