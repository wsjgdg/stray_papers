/**
 * 校园地图 · 团体分裂（批次 CA「团体」）
 * 分裂不是你挑拨的，是它们自己的问题。分裂之后，两边都会来找你，要你站队。
 * 不站队 → 两边都不再信任你；站队 → 另一边永久关闭。
 */
import { useState } from "react";
import { GitBranch } from "lucide-react";
import { FROG_CHARACTERS, type FrogCharacterId } from "@/data/characters";
import type { FactionMeta } from "@/data/factions";
import { RichText } from "@/components/common/RichText";

interface FactionSplitOverlayProps {
  /** 哪个团体裂了 */
  meta: FactionMeta;
  /** 裂的那一天 */
  day: number;
  /** 你在这边——引子用内部说法；旁观用外面的样子 */
  joined: boolean;
  /** 站队（落档在地图侧；浮层留在原地展示回执） */
  onPick: (side: FrogCharacterId | "none") => void;
  /** 收下 */
  onClose: () => void;
}

export function FactionSplitOverlay({ meta, day, joined, onPick, onClose }: FactionSplitOverlayProps) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<FrogCharacterId | "none" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="团体分裂"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <GitBranch size={13} aria-hidden />
            《{meta.title}》
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {step === 0 ? "它们裂了" : step === 1 ? "两边都来找你" : "站了"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 第 {step + 1}/3 步
          </p>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                {joined ? meta.splitLeadInside : meta.splitLeadOutside}
              </p>
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={meta.splitCondition} />
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                不是你挑拨的——你只是路过。这件事从头到尾都是它们自己的问题。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  来的是两只
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                两边都来找你了。都在等一个说法——不是道歉，是站队。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {meta.members.map((member, index) => (
                  <button
                    key={member.frogId}
                    type="button"
                    onClick={() => {
                      setPicked(member.frogId);
                      onPick(member.frogId);
                      setStep(2);
                    }}
                    className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                      这边——{FROG_CHARACTERS[member.frogId]?.displayName ?? member.frogId}
                      {index === 0 ? "（先来的那只）" : "（后到的那只）"}
                    </span>
                    <RichText className="mt-1 text-sm leading-relaxed text-card-foreground" text={member.sideLine} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPicked("none");
                  onPick("none");
                  setStep(2);
                }}
                className="mt-3 w-full rounded-xl border border-border bg-muted/40 p-3 text-left transition-colors duration-200 hover:bg-muted focus-visible:shadow-focus focus-visible:outline-none"
              >
                <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                  两边都不站
                </span>
                <RichText className="mt-1 text-sm leading-relaxed text-card-foreground" text={meta.sideCost} />
              </button>
            </>
          )}

          {step === 2 && picked !== null && (
            <>
              {picked === "none" ? (
                <>
                  <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={meta.sideCost} />
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    档案照写：该蛙未站队。两边各记了一笔——被注意值 +2。它们没有再提过这件事。
                  </p>
                </>
              ) : (
                <>
                  <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={meta.sideClosed} />
                  <p className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm leading-relaxed text-card-foreground">
                    档案照写：该蛙站了《{meta.title}》的
                    {FROG_CHARACTERS[picked]?.displayName ?? picked}那边。另一边的线，从此没有你的事——这一栏不会清零。
                  </p>
                </>
              )}
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你第一次站了队。站队和旁观不一样：旁观只是不知道；站队是把别的事，让给了别人。
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
