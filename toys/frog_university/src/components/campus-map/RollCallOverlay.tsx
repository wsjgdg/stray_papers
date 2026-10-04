/**
 * 校园地图 · 点名（批次 AQ「校园的声音」之二）
 * 学工办在念名单。念到你的时候，走廊停了一下——应答与不应答都被记录：
 * 应答记「该蛙应答。声音比平时低」；不应答记「该蛙未应答」，被注意值 +1，名单上多一笔。
 * 未应答攒满三次，名单更新——点名不再叫你的名字：没有被点名不是解脱，
 * 名字还在档案里，只是没人再照着它叫。
 */
import { useState } from "react";
import { ListChecks } from "lucide-react";

interface RollCallOverlayProps {
  /** 名单已更新：未应答攒满三——点名不再叫你的名字（这一版没有动作，只有这一行） */
  skipped: boolean;
  /** 本次处理之后，本学期还剩几次名单日 */
  remaining: number;
  onAnswer: () => { answered: number; misses: number } | null;
  onMiss: () => { answered: number; misses: number } | null;
  onClose: () => void;
}

export function RollCallOverlay({ skipped, remaining, onAnswer, onMiss, onClose }: RollCallOverlayProps) {
  const [result, setResult] = useState<"answered" | "missed" | null>(null);
  const left = Math.max(0, remaining - 1);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="点名"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <ListChecks size={13} aria-hidden />
            学工办 · 名单日
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">点名</h2>

          {skipped && result === null ? (
            <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
              名单更新之后，点名不再叫你的名字——这一行被跳过去了，像它本来就是空的。
              没有被点名不是解脱：名字还在档案里，只是没人再照着它叫。
            </p>
          ) : result === "answered" ? (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                应答了。档案里多一行：该蛙应答。声音比平时低。
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {left > 0 ? `点名还会再来——本学期还有 ${left} 次名单日。` : "这是本学期最后一次名单日。"}
              </p>
            </>
          ) : result === "missed" ? (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                没有应答。被注意值 +1，名单上多了一笔。档案里多一行：该蛙未应答。
                没有谁追问——名单替所有人记住了这一下。
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {left > 0
                  ? `本学期还有 ${left} 次名单日。`
                  : "这是本学期最后一次名单日。"}
                未应答攒满三，名单更新：点名不再叫你的名字。
              </p>
            </>
          ) : (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                学工办在念名单。念到你的时候，走廊停了一下。
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (onMiss()) setResult("missed");
                  }}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  不应答
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onAnswer()) setResult("answered");
                  }}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  应答
                </button>
              </div>
            </>
          )}

          {result !== null && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
              >
                关上名单
              </button>
            </div>
          )}
          {skipped && result === null && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
              >
                ……
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
