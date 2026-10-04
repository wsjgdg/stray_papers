/**
 * 校园地图 · 总目（批次 DS「总目」）
 * 学期末，档案室把本学期所有「没占的地方」汇总成《非在册事项总目》。
 * 三种处理：装订 / 抽走一页 / 不装订——没有正确的，
 * 只有这一册总目最后合不合上。
 */
import { useState } from "react";
import { BookOpen } from "lucide-react";
import {
  CATALOG_DISCOVERY,
  CATALOG_DONE,
  CATALOG_NOTICE,
  CATALOG_OUTCOMES,
  catalogLinesOf,
} from "@/data/catalog";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface CatalogOverlayProps {
  /** 编目那一天 */
  day: number;
  /** 存档（总目从各册记录派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "bind" | "extract" | "loose") => void;
  /** 收下 */
  onClose: () => void;
}

export function CatalogOverlay({ day, save, onRespond, onClose }: CatalogOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"bind" | "extract" | "loose" | null>(null);
  const lines = catalogLinesOf(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="总目"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <BookOpen size={13} aria-hidden />
            档案室 · 非在册事项总目
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "这学期你留下的地方"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "bind"
                    ? "装订成册"
                    : choice === "extract"
                      ? "缺页一页"
                      : "散页退还"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 第 {save.playthrough} 学期
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={CATALOG_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《非在册事项总目》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={CATALOG_NOTICE} />
                <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
                  {lines.map((line) => (
                    <div key={line.label} className="flex items-baseline gap-2 px-2 py-1.5">
                      <span className="shrink-0 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                        {line.label}
                      </span>
                      <span className="text-right text-xs leading-relaxed text-card-foreground">{line.state}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  合上总目
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有这一册总目最后合不合上。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("bind");
                    onRespond("bind");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">装订</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    合订陈列。被注意值 +1——总目只陈列不处置：翻到的蛙看见的是一行行状态，没有内容。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("extract");
                    onRespond("extract");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    抽走一页
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    最不想让蛙看见的那页。被注意值 +2——被抽走的那页成了总目的编外，总目比别册薄了一页。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("loose");
                    onRespond("loose");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不装订</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    散页退还。沉默值 +1——散页跟你的那些纸一样，要你自己收。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={CATALOG_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={CATALOG_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={CATALOG_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={CATALOG_DONE} />
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
