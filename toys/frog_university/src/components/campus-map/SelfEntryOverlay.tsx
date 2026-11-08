/**
 * 校园地图 · 自记（批次 DE「自记」）
 * 台账日过了。你想起一件事——一件发生在本学期、它们没记过的事。
 * 三种处理：照格式记 / 不照格式记 / 不记——没有正确的，
 * 只有那张没编号的纸最后要不要个号。
 */
import { useState } from "react";
import { FilePlus } from "lucide-react";
import {
  SELF_ENTRY_DISCOVERY,
  SELF_ENTRY_DONE,
  SELF_ENTRY_NOTICE,
  SELF_ENTRY_OUTCOMES,
  selfEntryTargetOf,
} from "@/data/selfEntry";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface SelfEntryOverlayProps {
  /** 领表那一天 */
  day: number;
  /** 存档（补记的那张纸按它派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "filed" | "retained" | "blank") => void;
  /** 收下 */
  onClose: () => void;
}

export function SelfEntryOverlay({ day, save, onRespond, onClose }: SelfEntryOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"filed" | "retained" | "blank" | null>(null);
  const target = selfEntryTargetOf(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="自记"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FilePlus size={13} aria-hidden />
            档案室 · 自行补记申请
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "给一张纸编号"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "filed"
                    ? "已入卷"
                    : choice === "retained"
                      ? "退回"
                      : "空置"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 第 {save.playthrough} 学期
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={SELF_ENTRY_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《自行补记申请》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={SELF_ENTRY_NOTICE} />
                <p className="mt-2 rounded-lg border border-border bg-card p-2 text-sm leading-relaxed text-card-foreground">
                  补记对象：{target.label}
                  <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{target.hint}</span>
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看格式
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有那张纸最后要不要个号。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("filed");
                    onRespond("filed");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    照格式记
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    自记号 036-ZJ-001。被注意值 +1——你想让它存在，就必得让它可以被看见。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("retained");
                    onRespond("retained");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    不照格式记
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    没有四栏，只有一句真话。被注意值 +2——这栋楼不听不合格式的话。但话在，纸也在。
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
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不记</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    台账空白。沉默值 +1——编号是它们给纸的资格，那张纸不要这个资格。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={SELF_ENTRY_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={SELF_ENTRY_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={SELF_ENTRY_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={SELF_ENTRY_DONE} />
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
