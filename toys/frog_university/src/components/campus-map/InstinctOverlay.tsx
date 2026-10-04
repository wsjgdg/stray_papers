/**
 * 本能发作（批次 CE「发作」）
 * 这些不是玩家选的，是蛙的身体自己选的。玩家能做的，只是在发作之后决定怎么面对。
 * - 鸣叫：安静下来的那一幕结束之后，你叫了一声——没有选项，没有预警；不是「要不要叫」，是「叫了之后怎么办」。
 * - 冬眠：学期末，不可抗拒地睡去；不是「要不要冬眠」，是「醒来之后发现错过了什么」。
 * - 蜕皮：打完一个结局，身体自己蜕——旧皮入柜，新皮是空的；不是「要不要蜕皮」，是「蜕完之后看着旧皮」。
 */
import { useState } from "react";
import { Moon, RefreshCw, Volume2 } from "lucide-react";
import { clsx } from "clsx";

interface InstinctOverlayProps {
  /** 发作的是哪一种 */
  mode: "croak" | "sleep" | "wake" | "molt";
  /** 叫了之后怎么办：解释 / 沉默（落档在正片侧；浮层留在原地展示落定） */
  onCroakAck: (mode: "explain" | "silent") => void;
  /** 睡去（冬眠已发生，这一层只是把它变成可感的） */
  onSleepAck: () => void;
  /** 收下（醒来 / 蜕完） */
  onClose: () => void;
  /** 错过的事（wake 模式：醒来之后才发现错过了什么） */
  missed: string[];
  /** 旧皮上写着的那一行（molt 模式） */
  moltNote: string;
}

export function InstinctOverlay({ mode, onCroakAck, onSleepAck, onClose, missed, moltNote }: InstinctOverlayProps) {
  const [croakAck, setCroakAck] = useState<"explain" | "silent" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="本能"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            {mode === "croak" ? <Volume2 size={13} aria-hidden /> : mode === "molt" ? <RefreshCw size={13} aria-hidden /> : <Moon size={13} aria-hidden />}
            本能
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {mode === "croak"
              ? croakAck
                ? croakAck === "explain"
                  ? "解释了"
                  : "沉默"
                : "你叫了一声"
              : mode === "sleep"
                ? "你困了"
                : mode === "wake"
                  ? "你醒了"
                  : "你蜕了"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            不是你选的。是身体自己选的。
          </p>

          {mode === "croak" && croakAck === null && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                （你没有开口。你叫了一声。声音不大，整间屋子都听见了。）
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                周围的蛙都看了过来。没有人说话。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                解释（表演分 +1——圆得体面，它们看回去了）／沉默（沉默 +1、被注意值 +1——档案照写：该蛙无故鸣叫）。
              </p>
              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCroakAck("silent");
                    onCroakAck("silent");
                  }}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
                >
                  沉默
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCroakAck("explain");
                    onCroakAck("explain");
                  }}
                  className={clsx(
                    "rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none",
                  )}
                >
                  解释
                </button>
              </div>
            </>
          )}

          {mode === "croak" && croakAck !== null && (
            <>
              <p className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm leading-relaxed text-card-foreground">
                {croakAck === "explain"
                  ? "你解释了。解释得体面——它们看回去了。档案照写：该蛙鸣叫一声，已说明。"
                  : "你没有解释。它们看了一会儿，看回去了。档案照写：该蛙无故鸣叫。"}
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                不是「要不要叫」——叫已经叫了。是「叫了之后怎么办」。
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

          {mode === "sleep" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你困了。不是累——是到了时候。眼皮压下来的时候，没有任何一个选项可以选。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                档案照写：该蛙冬眠期间无记录。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onSleepAck}
                  className={clsx(
                    "rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none",
                  )}
                >
                  睡去
                </button>
              </div>
            </>
          )}

          {mode === "wake" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你醒了。世界已经变了——有些事发生在你睡着的时候。
              </p>
              {missed.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {missed.map((item, index) => (
                    <p
                      key={`${index}-${item.slice(0, 8)}`}
                      className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-2 text-[12px] leading-relaxed text-card-foreground"
                    >
                      {item}
                    </p>
                  ))}
                </div>
              )}
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                档案照写：该蛙冬眠期间无记录。不是「要不要冬眠」——是醒来之后发现错过了什么。
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

          {mode === "molt" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你蜕了一层皮。不是你想的——是身体自己选的。打完那个结局之后，皮自己松了。
              </p>
              {moltNote && (
                <p className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3 font-mono text-[12px] leading-relaxed text-card-foreground">
                  旧皮上写着：{moltNote}
                </p>
              )}
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                旧皮留在柜子里。新皮是空的。档案照写：该蛙已蜕皮，旧皮在柜。不是「要不要蜕」——是蜕完之后看着旧皮。
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
