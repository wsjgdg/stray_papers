/**
 * 倒带回响（批次 AT「时间机器」之一）
 * 倒带不是读档：场景回到之前，但角色保留了记忆——
 * 「你刚才不是这么说的。」「你怎么知道？」「因为我记得。」
 * 你改了剧情，但角色记得原来的版本。
 */
import { Rewind } from "lucide-react";

interface RewindEchoOverlayProps {
  onClose: () => void;
}

export function RewindEchoOverlay({ onClose }: RewindEchoOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[55] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="倒带回响"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Rewind size={13} aria-hidden />
            倒带 · 本幕开头
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-widest text-card-foreground">这一段被倒了回去</h2>

          <div className="mt-4 space-y-2.5">
            <p className="rounded-xl border border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground">
              「你刚才不是这么说的。」
            </p>
            <p className="rounded-xl border border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground">
              「你怎么知道？」
            </p>
            <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm font-bold leading-relaxed text-primary">
              「因为我记得。」
            </p>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            倒带不是读档：场景回到之前，数值没有倒——发生过的事，都记着。你改了剧情，
            但角色记得原来的版本。档案里多一行：该蛙倒带。原来的版本，有人记得。
          </p>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              从头再走这一幕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
