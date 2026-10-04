/**
 * 校园地图 · 权利（批次 DC「权利」）
 * 新学期的卷宗里夹着一页——《当事人权利告知书》。
 * 三种处理：签收 / 行使 / 不签——没有正确的，只有你的权利最后停在纸上还是手里。
 */
import { useState } from "react";
import { ScrollText } from "lucide-react";
import {
  RIGHTS_CLAUSES,
  RIGHTS_DISCOVERY,
  RIGHTS_DONE,
  RIGHTS_NOTICE,
  RIGHTS_OUTCOMES,
  hasBereadOfThisSemester,
} from "@/data/rights";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface RightsOverlayProps {
  /** 发现那一天 */
  day: number;
  /** 存档（第三条的注脚按它派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "ack" | "exercise" | "decline") => void;
  /** 收下 */
  onClose: () => void;
}

export function RightsOverlay({ day, save, onRespond, onClose }: RightsOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"ack" | "exercise" | "decline" | null>(null);
  const beread = hasBereadOfThisSemester(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="权利"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <ScrollText size={13} aria-hidden />
            当事人权利告知书
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "这栋楼第一次告诉你"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "ack"
                    ? "已签收"
                    : choice === "exercise"
                      ? "已批复"
                      : "未签收"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 第 {save.playthrough} 学期
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={RIGHTS_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">
                  《当事人权利告知书》
                </p>
                <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
                  {RIGHTS_CLAUSES.map((item) => (
                    <div key={item.clause} className="px-2 py-1.5">
                      <RichText className="text-xs leading-relaxed text-card-foreground" text={item.clause} />
                      {item.note && beread && item.clause.startsWith("三、") && (
                        <RichText className="mt-1 text-[10px] leading-relaxed font-bold text-primary" text={item.note} />
                      )}
                      {item.note && !item.clause.startsWith("三、") && (
                        <RichText className="mt-1 text-[10px] leading-relaxed text-muted-foreground" text={item.note} />
                      )}
                    </div>
                  ))}
                </div>
                <RichText className="mt-2 text-xs leading-relaxed text-muted-foreground" text={RIGHTS_NOTICE} />
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  合上告知书
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有你的权利最后停在纸上还是手里。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("ack");
                    onRespond("ack");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">签收</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    它把你有什么写在了纸上，然后把那张纸收进了柜子。被注意值 +1——权利不改变在办，在办是它们的。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("exercise");
                    onRespond("exercise");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">行使</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    当场填一张申请，按第一条查阅本人卷宗。被注意值 +2——你查阅了自己，也多了一页被查的记录。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("decline");
                    onRespond("decline");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不签</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    放回卷宗。沉默值 +1——你用沉默权的方式，是没签那张写着你有沉默权的纸。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={RIGHTS_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={RIGHTS_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={RIGHTS_OUTCOMES[choice].filing} />
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
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={RIGHTS_DONE} />
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
