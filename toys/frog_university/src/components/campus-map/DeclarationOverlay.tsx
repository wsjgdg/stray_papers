/**
 * 校园地图 · 申报（批次 DG「申报」）
 * 行政楼的公告栏贴出一张《个人物品申报通知》。申报自愿。
 * 三种处理：全报 / 少报一样 / 空报——没有正确的，
 * 只有你的抽屉在制度里最后是什么样子。
 */
import { useState } from "react";
import { Inbox } from "lucide-react";
import {
  DECLARATION_DISCOVERY,
  DECLARATION_DONE,
  DECLARATION_NOTICE,
  DECLARATION_OUTCOMES,
  declarationItemsOf,
} from "@/data/declaration";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface DeclarationOverlayProps {
  /** 张贴那一天 */
  day: number;
  /** 存档（抽屉里的清单按它派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "full" | "short" | "empty") => void;
  /** 收下 */
  onClose: () => void;
}

export function DeclarationOverlay({ day, save, onRespond, onClose }: DeclarationOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"full" | "short" | "empty" | null>(null);
  const items = declarationItemsOf(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="申报"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Inbox size={13} aria-hidden />
            行政楼 · 个人物品申报
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "你说什么，它们记什么"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "full"
                    ? "在册"
                    : choice === "short"
                      ? "视同无此物"
                      : "死角"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 第 {save.playthrough} 学期
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={DECLARATION_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《个人物品申报通知》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={DECLARATION_NOTICE} />
                <p className="mt-2 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                  你的抽屉里（按你记的）：
                </p>
                <div className="mt-1 divide-y divide-border rounded-lg border border-border bg-card">
                  {items.map((item) => (
                    <div key={item} className="px-2 py-1.5 text-xs leading-relaxed text-card-foreground">
                      {item}
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
                  领一张表
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有你的抽屉在制度里最后是什么样子。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("full");
                    onRespond("full");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">全报</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    一张一张列在表上。被注意值 +1——记下跟拿走是两种效力，它们只登记第一种。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("short");
                    onRespond("short");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    少报一样
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    留一件不写。被注意值 +2——「视同无此物」：制度替你把「有它」取消了。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("empty");
                    onRespond("empty");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">空报</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    交一张空表回去。沉默值 +1——焚化室是它没有编号的门，你的抽屉是它没有编号的柜。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={DECLARATION_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={DECLARATION_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={DECLARATION_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={DECLARATION_DONE} />
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
