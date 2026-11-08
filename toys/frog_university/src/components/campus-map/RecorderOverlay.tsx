/**
 * 校园地图 · 批阅者（批次 CL「批阅者」）
 * 你的档案上每一行批语都是它写的。落款不是名字，是编号：记录员 014。
 * 发现 → 三处可查（名册 / 档案室 / 你的档案）→ 三种选择（留条 / 等 / 不动）→ 落定。
 * 落点：它知道你的一切——字面意义上的一切。你知道它的编号。
 */
import { useState } from "react";
import { PenTool } from "lucide-react";
import { clsx } from "clsx";
import {
  RECORDER_ASKS,
  RECORDER_DISCOVERY,
  RECORDER_ID,
  RECORDER_NOTE_TEXT,
  RECORDER_OUTCOMES,
  RECORDER_REPLY_TEXT,
  recorderEchoOf,
} from "@/data/recorder";
import { RichText } from "@/components/common/RichText";

interface RecorderOverlayProps {
  /** 找到那一天 */
  day: number;
  /** 上一周目留过条（玻璃板下还压着） */
  noteLeft: boolean;
  /** 选择（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (response: "note" | "wait" | "still") => void;
  /** 收下 */
  onClose: () => void;
}

export function RecorderOverlay({ day, noteLeft, onRespond, onClose }: RecorderOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "respond" | "outcome" | "done">("find");
  const [looked, setLooked] = useState<string[]>([]);
  const [choice, setChoice] = useState<"note" | "wait" | "still" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="批阅者"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <PenTool size={13} aria-hidden />
            记录员 {RECORDER_ID}
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "落款"
              : stage === "ask"
                ? "你去找它"
                : stage === "respond"
                  ? "三种选择"
                  : stage === "outcome"
                    ? choice === "note"
                      ? "不必"
                      : choice === "wait"
                        ? "墨迹未干"
                        : "原样"
                    : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 档案室
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={RECORDER_DISCOVERY} />
              {noteLeft && (
                <p className="mt-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                  {recorderEchoOf()}
                </p>
              )}
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你翻过档案，才会注意到落款。注意到了，就没法当没看见。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  去找它
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你去查了。三处都查了，答案长得都不像答案。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {RECORDER_ASKS.map((item, index) => {
                  const key = ["roster", "room", "mine"][index] ?? "roster";
                  const seen = looked.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={seen}
                      onClick={() => setLooked((prev) => [...prev, key])}
                      className={clsx(
                        "rounded-xl border p-3 text-left transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                        seen
                          ? "border-border bg-muted/40"
                          : "border-dashed border-border bg-background/60 hover:border-primary/50 hover:bg-primary/5",
                      )}
                    >
                      <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                        {item.place}
                        {seen ? " · 查过了" : ""}
                      </span>
                      {seen && (
                        <>
                          <RichText className="mt-1 text-sm leading-relaxed text-card-foreground" text={item.line} />
                          <RichText className="mt-1 text-xs leading-relaxed text-muted-foreground" text={item.note} />
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("respond")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  够了
                </button>
              </div>
            </>
          )}

          {stage === "respond" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种选择。没有正确的——只有你要不要把它找出来。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("note");
                    onRespond("note");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">留一张条</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    压在它桌上的杯子底下。沉默值 +1——开口就有代价，哪怕是对着一张空椅子。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("wait");
                    onRespond("wait");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">等</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    坐在那把温着的椅子上等一个下午。沉默值 +1。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("still");
                    onRespond("still");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不动</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    合上档案，放回原格。批语照旧会写。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={RECORDER_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={RECORDER_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={RECORDER_OUTCOMES[choice].filing} />
              {choice === "note" && (
                <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground">
                  条上的字：{RECORDER_NOTE_TEXT}
                  <span className="ml-2 font-mono text-[11px] tracking-widest text-primary">回条：{RECORDER_REPLY_TEXT}</span>
                </p>
              )}
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
                档案室照旧。杯子照旧冒热气。落款照旧是 {RECORDER_ID}。
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
