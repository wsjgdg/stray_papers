/**
 * 校园地图 · 已结（批次 CG「已结」）
 * 你在档案柜最里面找到一份卷：编号 035——橡皮蛙的。封面写着「该生已毕业」，日期是下学期末。
 * 它还在上课。它什么都没变——除了档案里的日期。
 * 发现 → 三处可查（行政楼 / 档案室 / 它本人）→ 三种选择（添注 / 不动 / 替它记上）→ 落定。
 * 落点：档案比蛙先毕业。
 */
import { useState } from "react";
import { FileCheck2 } from "lucide-react";
import { clsx } from "clsx";
import {
  FINISHED_ASKS,
  FINISHED_COVER,
  FINISHED_OUTCOMES,
  FINISHED_ROWS,
  RUBBER_FROG_ID,
  finishedEchoOf,
} from "@/data/finished";
import { RichText } from "@/components/common/RichText";

interface FinishedOverlayProps {
  /** 找到那一天 */
  day: number;
  /** 上一周目代注过的那一行（有 = 卷面外还贴着你的字） */
  annotate: string | null;
  /** 选择（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (response: "annotate" | "still" | "note") => void;
  /** 收下 */
  onClose: () => void;
}

export function FinishedOverlay({ day, annotate, onRespond, onClose }: FinishedOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "respond" | "outcome" | "done">("find");
  const [looked, setLooked] = useState<string[]>([]);
  const [choice, setChoice] = useState<"annotate" | "still" | "note" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="已结"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FileCheck2 size={13} aria-hidden />
            卷宗 · 编号 {RUBBER_FROG_ID}
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "已结"
              : stage === "ask"
                ? "你去查"
                : stage === "respond"
                  ? "三种选择"
                  : stage === "outcome"
                    ? choice === "annotate"
                      ? "不予受理"
                      : choice === "still"
                        ? "未动"
                        : "记上了"
                    : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 档案柜最里面
          </p>

          {stage === "find" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你在档案柜最里面找到一份卷。编号 {RUBBER_FROG_ID}——橡皮蛙的。封面盖着章：
              </p>
              <p className="mt-3 rounded-xl border border-border bg-background/60 p-3 text-center">
                <span className="inline-block border-2 border-primary/50 px-3 py-1 text-base font-bold tracking-widest text-primary">
                  {FINISHED_COVER.stamp}
                </span>
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                归档日期：{FINISHED_COVER.dateLabel}。
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {FINISHED_ROWS.map((row) => (
                  <p
                    key={row.slice(0, 8)}
                    className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-2 text-[12px] leading-relaxed text-card-foreground"
                  >
                    {row}
                  </p>
                ))}
              </div>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                {annotate ? finishedEchoOf(annotate) : "它还在上课。它什么都没变——除了档案里的日期。档案比蛙先毕业。"}
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  去查
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
                {FINISHED_ASKS.map((item, index) => {
                  const key = ["office", "room", "frog"][index] ?? "office";
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
                三种选择。没有正确的——只有你认不认这份卷。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("annotate");
                    onRespond("annotate");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">添注</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    在已结的卷上添一行：该蛙还在教室里。被注意值 +1——伸手就要留名。
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
                    放回原处。放得很正，像它还在等那一天。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("note");
                    onRespond("note");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">替它记上</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    把它一直没被记过的那三个字记进备注栏。沉默值 +1——你替它开口了一次。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={FINISHED_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={FINISHED_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={FINISHED_OUTCOMES[choice].filing} />
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
                柜门合上。第三排的它还在写字。你的档案还开着——你见过已结的卷，才知道自己的还开着。
              </p>
              <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                （那卷还在柜子里。日期还没到。）
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
