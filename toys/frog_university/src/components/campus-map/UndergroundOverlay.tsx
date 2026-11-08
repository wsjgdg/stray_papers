/**
 * 校园地图 · 地下组织（批次 CD「地下」）
 * 没有名字、没有固定成员、没有固定地点。加入之后，你的所有选择都变成双面的：
 * 表面上你在上课、吃饭、躺草坪；暗地里你在帮某个蛙改档案、传消息、藏东西。
 * 被发现的风险永远存在——不是数值，是具体的人。被发现之后不是结局。
 */
import { useState } from "react";
import { DoorClosed, DoorOpen, FileWarning } from "lucide-react";
import { clsx } from "clsx";
import { FROG_CHARACTERS, type FrogCharacterId } from "@/data/characters";
import type { UndergroundJob } from "@/lib/gameSave";
import {
  UNDERGROUND_EXPOSE_BODY,
  UNDERGROUND_EXPOSE_LEAD,
  UNDERGROUND_EXPOSE_NOTE,
  UNDERGROUND_JOIN_NOTE,
  UNDERGROUND_SERVICE_DONE,
  UNDERGROUND_SERVICE_LABEL,
  UNDERGROUND_SERVICE_REFUSED,
  undergroundAskOf,
  type UndergroundServiceKind,
} from "@/data/underground";
import { RichText } from "@/components/common/RichText";

interface UndergroundOverlayProps {
  /** 这一层是哪一面 */
  mode: "join" | "job" | "expose";
  /** 发生在第几天 */
  day: number;
  /** 托付：帮哪只、办哪件（job 模式用） */
  favor: { frogId: FrogCharacterId; kind: UndergroundServiceKind } | null;
  /** 两面的账（job 模式展示：加入之后你做的每一件正常的事都长出了另一面） */
  jobs: UndergroundJob[];
  /** 帮它办 / 这次不帮（落档在地图侧；浮层留在原地展示回执） */
  onDecide: (doIt: boolean) => void;
  /** 收下 */
  onClose: () => void;
}

export function UndergroundOverlay({ mode, day, favor, jobs, onDecide, onClose }: UndergroundOverlayProps) {
  const [decided, setDecided] = useState<boolean | null>(null);
  const [exposeStep, setExposeStep] = useState(0);

  const frogName = favor ? (FROG_CHARACTERS[favor.frogId]?.displayName ?? "在册的一只") : "";

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="地下组织"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            {mode === "expose" ? <FileWarning size={13} aria-hidden /> : mode === "job" ? <DoorClosed size={13} aria-hidden /> : <DoorOpen size={13} aria-hidden />}
            {mode === "expose" ? "行政楼 · 叫住了你" : mode === "job" ? "没有名字的地方 · 托付" : "没有名字的地方"}
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {mode === "expose" ? (exposeStep === 0 ? "你最近……" : "不再联系") : mode === "job" ? (decided === null ? "托付" : "办完了") : "坐下"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 深夜
          </p>

          {mode === "join" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={UNDERGROUND_JOIN_NOTE} />
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                档案照写：——（没有这一栏。这就是它不在的原因。）
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

          {mode === "job" && favor && (
            <>
              {decided === null && (
                <>
                  <p className="mt-4">
                    <span className="inline-flex rounded-full border border-primary/40 bg-primary/5 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-primary">
                      {UNDERGROUND_SERVICE_LABEL[favor.kind]}
                    </span>
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                    {undergroundAskOf(favor.kind, frogName)}
                  </p>
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    帮它办：它记下了（好感 +4），你做的事不进任何一栏（表演分 +2、沉默 +1）。
                    <br />
                    这次不帮：它们没说什么——但它记住了（好感 −2）。这扇门一学期只开一次。
                  </p>
                  {jobs.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      <p className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                        两面的账 · {jobs.length} 条
                      </p>
                      {jobs.slice(-4).map((item, index) => (
                        <p
                          key={`${item.semester}-${item.day}-${item.kind}-${index}`}
                          className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
                        >
                          {item.surface}
                          <span className="mt-1 block font-mono text-[10px] tracking-wider">{item.underneath}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="mt-5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDecided(false);
                        onDecide(false);
                      }}
                      className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      这次不帮
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDecided(true);
                        onDecide(true);
                      }}
                      className={clsx(
                        "rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none",
                      )}
                    >
                      帮它办
                    </button>
                  </div>
                </>
              )}
              {decided !== null && (
                <>
                  <p className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm leading-relaxed text-card-foreground">
                    {decided ? (UNDERGROUND_SERVICE_DONE[favor.kind] ?? "") : (UNDERGROUND_SERVICE_REFUSED[favor.kind] ?? "")}
                  </p>
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    {decided ? `${frogName}记下了（好感 +4）。` : `${frogName}记住了（好感 −2）。`}
                    档案照写：——（没有这一栏。）
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
            </>
          )}

          {mode === "expose" && (
            <>
              {exposeStep === 0 && (
                <>
                  <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={UNDERGROUND_EXPOSE_LEAD} />
                  <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={UNDERGROUND_EXPOSE_BODY} />
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    不是数值，是具体的人。被发现的风险永远存在——这一次，是行政楼先开的口。
                  </p>
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setExposeStep(1)}
                      className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      收下那张表
                    </button>
                  </div>
                </>
              )}
              {exposeStep === 1 && (
                <>
                  <RichText className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm leading-relaxed text-card-foreground" text={UNDERGROUND_EXPOSE_NOTE} />
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    档案照写：该蛙曾参与非正式档案活动。
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
