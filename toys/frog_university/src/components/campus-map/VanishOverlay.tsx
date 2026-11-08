/**
 * 校园地图 · 消迹（批次 CF「消迹」）
 * 你说过的一句真话，从档案里没了。不是你删的——某天你翻档案，那一栏是空的。
 * 计数还在（真话 X 条），内容没了：像它没被写过，但你知道它发生过。
 * 发现 → 三处追问（行政楼 / 那只蛙 / 深夜的池子）→ 三种选择（补录 / 不补 / 再问一次）→ 落定。
 * 落点：被记录是负担——但被忘记更冷。
 */
import { useState } from "react";
import { FileMinus } from "lucide-react";
import { clsx } from "clsx";
import { VANISH_ASKS, VANISH_OUTCOMES } from "@/data/vanishes";
import { RichText } from "@/components/common/RichText";

interface VanishOverlayProps {
  /** 被抽走的那一句（真话罐里的原文） */
  text: string;
  /** 发现那一天 */
  day: number;
  /** 罐里现在有多少句（计数不回滚——事实发生过） */
  jarCount: number;
  /** 追问那只蛙的名字 */
  speakerName: string;
  /** 选择（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (response: "filed" | "letgo" | "insist") => void;
  /** 收下 */
  onClose: () => void;
}

export function VanishOverlay({ text, day, jarCount, speakerName, onRespond, onClose }: VanishOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "respond" | "outcome" | "done">("find");
  const [looked, setLooked] = useState<string[]>([]);
  const [choice, setChoice] = useState<"filed" | "letgo" | "insist" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="消迹"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FileMinus size={13} aria-hidden />
            档案缺失
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "少了一行"
              : stage === "ask"
                ? "你去问"
                : stage === "respond"
                  ? "三种选择"
                  : stage === "outcome"
                    ? choice === "filed"
                      ? "驳回"
                      : choice === "letgo"
                        ? "未申请"
                        : "继续问"
                    : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 真话 {jarCount} 条
          </p>

          {stage === "find" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你翻档案的时候，发现少了一行。是这一句：
              </p>
              <RichText className="mt-3 rounded-xl border border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground line-through decoration-border decoration-2" text={text} />
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                计数还是 {jarCount} 条——事实发生过，记录没了。像它没被写过。被抽走的，恰恰是最能证明你的那一行。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                不是你删的。你翻开之前，那一栏就已经空了。档案照写：该蛙档案有缺失。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  去问
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你去问了。三处都问了，答案长得都不像答案。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {VANISH_ASKS.map((item, index) => {
                  const key = ["office", "frog", "lake"][index] ?? "office";
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
                        {seen ? " · 问过了" : ""}
                      </span>
                      {seen && (
                        <>
                          <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                            {key === "frog" ? speakerName : item.line}
                          </p>
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
                三种选择。没有正确的——只有你要不要认。
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
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">补录</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    自己写申请，把那句真话原样抄一遍，交上去。被注意值 +1——伸手就要留名。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("letgo");
                    onRespond("letgo");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不补</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    不写申请。不是算了——是你开始想，那一行到底是为谁存在的。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("insist");
                    onRespond("insist");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">再问一次</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    顶着它的说法又去一次。这次它们让你坐下了。被注意值 +2。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={VANISH_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={VANISH_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={VANISH_OUTCOMES[choice].filing} />
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                旧皮上那一行还在——上学期的那一页也在。只有本周目的报告里，那一栏是空的。被记录是负担——被忘记更冷。
              </p>
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
                柜子照旧。墙上照旧。那句话还在你身上——只是不在纸上了。
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
