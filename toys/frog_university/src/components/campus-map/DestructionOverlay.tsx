/**
 * 校园地图 · 销毁（批次 DB「销毁」）
 * 定稿之后的第一个工作日，焚化室门口贴出一张《销毁清册》。
 * 三种处理：照单焚化 / 申请留存 / 抄一遍再焚化——没有正确的，只有那张纸最后去了哪里。
 */
import { useState } from "react";
import { Flame } from "lucide-react";
import {
  DESTRUCTION_DISCOVERY,
  DESTRUCTION_DONE,
  DESTRUCTION_HEAD,
  DESTRUCTION_OUTCOMES,
  DESTRUCTION_TAIL,
  destructionItemLine,
} from "@/data/destruction";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface DestructionOverlayProps {
  /** 张贴那一天 */
  day: number;
  /** 存档（清册上「你的那一行」按它派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "burn" | "keep" | "copy") => void;
  /** 收下 */
  onClose: () => void;
}

export function DestructionOverlay({ day, save, onRespond, onClose }: DestructionOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"burn" | "keep" | "copy" | null>(null);
  const itemLine = destructionItemLine(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="销毁"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Flame size={13} aria-hidden />
            焚化室 · 销毁清册
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "唯一没有编号的门"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "burn"
                    ? "按清册"
                    : choice === "keep"
                      ? "留存章"
                      : "抄件"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 第 {save.playthrough} 学期
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={DESTRUCTION_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《销毁清册》</p>
                <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
                  {DESTRUCTION_HEAD.map((line) => (
                    <div key={line} className="px-2 py-1.5 text-xs leading-relaxed text-card-foreground">
                      {line}
                    </div>
                  ))}
                  <div className="bg-primary/5 px-2 py-1.5 text-xs leading-relaxed font-bold text-primary">
                    {itemLine}
                  </div>
                  <div className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
                    {DESTRUCTION_TAIL}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  走进焚化室
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有那张纸最后去了哪里。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("burn");
                    onRespond("burn");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    照单焚化
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    按规程走完最后一程。被注意值 +1——作废不是否定，是它完成过它的用途。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("keep");
                    onRespond("keep");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    申请留存
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    理由栏写「本人自愿」。被注意值 +2——救下一页纸，用的办法是给它重新编号。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("copy");
                    onRespond("copy");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    抄一遍再焚化
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    规程没说不能抄。沉默值 +1——抽屉里现在有两张没有编号的纸：一张是别人不写的，一张是你写的。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={DESTRUCTION_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={DESTRUCTION_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={DESTRUCTION_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={DESTRUCTION_DONE} />
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
