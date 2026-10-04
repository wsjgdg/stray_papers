/**
 * 校园地图 · 合档（批次 CV「合档」）
 * 你的卷宗和另一卷重号了。按规程，重号合并为一宗——已经合了，那宗里有你，也有它。
 * 三种处理：申请拆卷 / 不管它 / 去认识它——没有正确的，只有那宗纸最后装着什么。
 */
import { useState } from "react";
import { FolderSymlink } from "lucide-react";
import {
  MERGER_DONE,
  MERGER_DISCOVERY,
  MERGER_NOTICE,
  MERGER_OUTCOMES,
  type MergerCounterpart,
} from "@/data/merger";
import { RichText } from "@/components/common/RichText";

interface MergerOverlayProps {
  /** 通知那一天 */
  day: number;
  /** 重号的另一只 */
  counterpart: MergerCounterpart;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "split" | "carry" | "meet", frog?: string) => void;
  /** 收下 */
  onClose: () => void;
}

export function MergerOverlay({ day, counterpart, onRespond, onClose }: MergerOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"split" | "carry" | "meet" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="合档"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FolderSymlink size={13} aria-hidden />
            档案室 · 合并通知
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "重号了"
              : stage === "ask"
                ? "那宗里有你，也有它"
                : stage === "outcome"
                  ? choice === "split"
                    ? "同意拆分"
                    : choice === "carry"
                      ? "按期结转"
                      : "合宗继续"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 对方：{counterpart.name}
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={MERGER_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《合并通知书》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={MERGER_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  当事蛙：学号 036 · {counterpart.name}。名册备注：{counterpart.note}
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看那宗纸
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有那宗纸最后装着什么。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("split");
                    onRespond("split", counterpart.name);
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    申请拆卷
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    理由一栏：重号系误装，应予分立。被注意值 +1——分开是可以的，分开过这件事留了下来。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("carry");
                    onRespond("carry");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不管它</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    沉默值 +1——混排继续。你们是这栋楼里离得最近的陌生蛙。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("meet");
                    onRespond("meet", counterpart.name);
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    去认识它
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    按名册找到它。被注意值 +2——档案室把你们当成了同一只蛙。你们没有纠正它。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={MERGER_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={MERGER_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={MERGER_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={MERGER_DONE} />
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
