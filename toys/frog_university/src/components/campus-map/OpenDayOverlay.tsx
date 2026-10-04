/**
 * 校园地图 · 开放日（批次 DH「开放日」）
 * 档案室门口贴出一张《开放日公告》。开放日全宗向全体在册蛙开放，
 * 凭学号即可调阅，免于登记，免于通报。
 * 三种处理：查本宗 / 查摘要 / 不去——没有正确的，
 * 只有这一天你把自己放在了哪一个位置上。
 */
import { useState } from "react";
import { DoorOpen } from "lucide-react";
import {
  OPEN_DAY_DISCOVERY,
  OPEN_DAY_DONE,
  OPEN_DAY_NOTICE,
  OPEN_DAY_OUTCOMES,
  openDayPeerOf,
} from "@/data/openDay";
import { RichText } from "@/components/common/RichText";

interface OpenDayOverlayProps {
  /** 张贴那一天 */
  day: number;
  /** 学期种子（摘要里那宗卷宗的主人按它派生） */
  seed: number;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "self" | "others" | "away") => void;
  /** 收下 */
  onClose: () => void;
}

export function OpenDayOverlay({ day, seed, onRespond, onClose }: OpenDayOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"self" | "others" | "away" | null>(null);
  const peer = openDayPeerOf(seed);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="开放日"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <DoorOpen size={13} aria-hidden />
            档案室 · 开放日公告
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "这一天秘密换了主人"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "self"
                    ? "本宗已阅"
                    : choice === "others"
                      ? "摘要已阅"
                      : "闭馆"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 凭学号调阅
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={OPEN_DAY_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《开放日公告》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={OPEN_DAY_NOTICE} />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  注意：非本人卷宗限阅摘要。
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  进档案室
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有这一天你把自己放在了哪一个位置上。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("self");
                    onRespond("self");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">查本宗</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    从第一页翻到最后一页。被注意值 +1——在别人看你之前，你知道你会被看到什么。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("others");
                    onRespond("others");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">查摘要</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    翻别宗的摘要（{peer}）。被注意值 +2——它只会发现那一页被翻得比别的页旧。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("away");
                    onRespond("away");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不去</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    开着的柜门你没进。沉默值 +1——不进也是一种记录：它记在你身上，不记在档案里。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={OPEN_DAY_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={OPEN_DAY_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={OPEN_DAY_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={OPEN_DAY_DONE} />
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
