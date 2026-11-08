/**
 * 选项浮层：2-3 个梗选项，每项标注沉默值增量（越识时务越高）
 * 批次 CH「行政化」：选项不做成按钮，做成审批栏——
 *   每一项前面有勾选框；点下去先盖一个章（「已勾」），然后才推进；
 *   审批人一栏写的是你的学号——档案认号不认笔迹。
 *   选项的排列顺序按当前数值排序：沉默值高的时候沉默排第一，印象分占优的时候表演排第一。
 *   玩家会慢慢发现：选项的顺序，就是学校希望你选的那个。
 * 批次 V 沉默等待：个别关键节点（选项带 idle 字段）出现后 30 秒无操作 → 自动走沉默分支。
 *   批次 CH 起通用化：没有 idle 配置的事项同样超时——系统替你勾「沉默」（该事项已超时，由系统默认处理）。
 *   无倒计时、无提示——玩家第一次发现时才意识到：不选择也是一种选择，而且学校真的在等。设置里可关。
 * 批次 AK 沉默的物理空间：沉默值越高，选项越少——
 *   一档（≥5）真话那条先淡出去；二档（≥9）再收一条；三档（≥13）只剩「沉默」。
 *   这不是惩罚，是沉默的终点：选项按沉默增量从低到高依次被收走——说真话的能力最先没了。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { loadGameSave } from "@/lib/gameSave";
import type { Choice } from "@/data/storylines";
import { RichText } from "@/components/common/RichText";

interface ChoiceOverlayProps {
  choices: Choice[];
  /** 三学期玩法规则（批次 AA）：第三学期选项延迟出现（毫秒）——像档案翻页，不能催 */
  delayMs?: number;
  /** 现实行为入档（批次 AF）：玩家在选项前犹豫的秒数——记录员不问选了什么，只问等了多久 */
  onHesitate?: (seconds: number) => void;
  onChoose: (choice: Choice) => void;
  /** 未表态登记（设置里可关）：true 时 30 秒无操作由系统代为处理 */
  idleEnabled?: boolean;
  /** 沉默档位（批次 AK，0-3）：0 = 选项齐全 */
  silenceStage?: number;
  /** 让它替我选（批次 BC「替换」）：你放弃了选择——它替你选，档案仍然记在你头上 */
  onDefer?: () => boolean;
  /** 曾表态淡标（批次 CY-31）：上一学期勾过的选项 id——整条打淡、盖「曾表态」小章，仍可重选 */
  answeredIds?: string[];
}

const IDLE_MS = 30000;

/** 按当前数值排序（批次 CH）：学校希望你选的那个排在前面 */
function orderChoices(choices: Choice[]): Choice[] {
  const save = loadGameSave();
  const silence = save.silenceValue;
  const reputation = save.reputation;
  if (reputation > silence) {
    /* 印象分占优：表演项（沉默增量 ≥2 的识时务选项）排在前，其余照剧本顺序 */
    return [...choices].sort((a, b) => {
      const aPerform = a.silenceDelta >= 2 ? 1 : 0;
      const bPerform = b.silenceDelta >= 2 ? 1 : 0;
      return bPerform - aPerform;
    });
  }
  /* 沉默值高（或两者都为零）：按沉默增量降序——越识时务的越靠前 */
  return [...choices].sort((a, b) => b.silenceDelta - a.silenceDelta);
}

export function ChoiceOverlay({
  choices,
  onChoose,
  idleEnabled = true,
  delayMs = 0,
  onHesitate,
  silenceStage = 0,
  onDefer,
  answeredIds = [],
}: ChoiceOverlayProps) {
  /* 犹豫计时（批次 AF）：选项出现（延迟结束）到玩家点击之间的秒数；≥ 10 秒记进档案 */
  const shownAtRef = useRef<number>(Date.now());
  useEffect(() => {
    if (delayMs === 0) {
      shownAtRef.current = Date.now();
      return;
    }
    const timer = window.setTimeout(() => {
      shownAtRef.current = Date.now();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, choices]);
  /* 沉默 1 级（批次 AA）：10 秒不表态，浮层给出第一层提示——选项开始退色，一行小字浮上来；
     30 秒照旧由系统代为处理，设置里可关 */
  const [wary, setWary] = useState(false);
  useEffect(() => {
    setWary(false);
    if (!idleEnabled) return;
    const timer = window.setTimeout(() => setWary(true), 10000);
    return () => window.clearTimeout(timer);
  }, [choices, idleEnabled]);
  /* 第三学期：选项延迟出现——像档案翻页，不能催；每换一组选项重新开始延迟 */
  const [revealed, setRevealed] = useState(delayMs === 0);
  useEffect(() => {
    if (delayMs === 0) {
      setRevealed(true);
      return;
    }
    setRevealed(false);
    const timer = window.setTimeout(() => setRevealed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, choices]);

  /* 审批顺序（批次 CH）：按当前数值排序——学校希望你选的那个排在前面 */
  const ordered = useMemo(() => orderChoices(choices), [choices]);

  /* 盖章再推进（批次 CH）：点下去先盖一个「已勾」的章，然后才走 */
  const [stampId, setStampId] = useState<string | null>(null);
  const stampTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (stampTimerRef.current !== null) window.clearTimeout(stampTimerRef.current);
    },
    [],
  );
  const approve = (choice: Choice) => {
    if (stampId !== null) return;
    const seconds = Math.round((Date.now() - shownAtRef.current) / 1000);
    if (onHesitate && seconds >= 10) onHesitate(seconds);
    setStampId(choice.id);
    stampTimerRef.current = window.setTimeout(() => onChoose(choice), 450);
  };

  /* 未表态登记（批次 V / CH 通用化）：30 秒无操作——系统替你勾（有 idle 配置走 idle，没有则勾最识时务的那条） */
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!idleEnabled || !revealed) return;
    const idleChoice = choices.find((choice) => choice.idle);
    const autoChoice = idleChoice ?? ordered[0];
    if (!autoChoice) return;
    const reset = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => approve(autoChoice), IDLE_MS);
    };
    reset();
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, idleEnabled, revealed, ordered]);

  /* 超时提示（批次 CH）：系统代勾之后浮层留下回执 */
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!idleEnabled || !revealed) return;
    const timer = window.setTimeout(() => setTimedOut(true), IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [choices, idleEnabled, revealed]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-foreground/50 px-3 py-4 backdrop-blur-sm sm:p-5">
      <div className="w-full max-w-lg animate-in rounded-2xl border border-border bg-card/95 p-4 shadow-xl fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-border pb-2">
          <p className="font-mono text-[11px] font-bold tracking-widest text-primary">事项 · 此时此刻，怎么办</p>
          <p className="shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">审批人：036</p>
        </div>
        {(wary || timedOut) && (
          <p className="mt-2 text-center font-mono text-[10px] tracking-widest text-muted-foreground/70">
            {timedOut ? "该事项已超时，由系统默认处理。" : "……你没动。"}
          </p>
        )}
      </div>
      {/* 沉默的物理空间（批次 AK）：选项按沉默增量从低到高依次被收走——说真话的能力最先没了 */}
      {silenceStage === 1 && (
        <p className="anim-fade-up text-center font-mono text-[10px] tracking-widest text-muted-foreground/70">
          （有一条淡下去了。）
        </p>
      )}
      {silenceStage === 2 && (
        <p className="anim-fade-up text-center font-mono text-[10px] tracking-widest text-muted-foreground/70">
          （选项在收。）
        </p>
      )}
      {silenceStage >= 3 && (
        <p className="anim-fade-up text-center text-[11px] font-bold leading-relaxed text-muted-foreground">
          选项被收走了。剩下的只有沉默。
        </p>
      )}
      {(() => {
        const pair = choices.find((choice) => choice.translatorPair)?.translatorPair;
        if (!pair) return null;
        return (
          <div className="w-full max-w-lg animate-in rounded-2xl border border-border bg-card p-3.5 shadow-xl fade-in slide-in-from-bottom-2 duration-300 sm:p-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground">行政版</p>
                <RichText className="mt-1.5 text-xs leading-relaxed text-muted-foreground" text={pair.officialese} />
              </div>
              <div className="rounded-xl border border-primary/40 bg-background/60 p-3">
                <p className="text-[10px] font-bold tracking-widest text-primary">真实版</p>
                <RichText className="mt-1.5 font-mono text-xs leading-snug text-card-foreground" text={pair.truth} />
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-muted-foreground">
              两边都在。看哪边，是玩家自己决定的事。
            </p>
          </div>
        );
      })()}
      {!revealed ? (
        <p className="rounded-full border border-border bg-card px-4 py-1.5 font-mono text-[10px] tracking-widest text-muted-foreground shadow-md">
          这一页还没翻过去……
        </p>
      ) : null}
      {(() => {
        if (!revealed) return null;
        /* 被收走的选项：按沉默增量从低到高（真话最先没）；至多留沉默增量最高的那一条 */
        const sorted = [...choices].sort((a, b) => a.silenceDelta - b.silenceDelta);
        const keepCount = silenceStage === 1 ? Math.max(choices.length - 1, 1) : 1;
        const ghostIds = new Set<string>(
          silenceStage >= 1 ? sorted.slice(0, sorted.length - keepCount).map((choice) => choice.id) : [],
        );
        const kept = sorted[sorted.length - 1];
        const metaOf = (choice: Choice) =>
          choice.silenceDelta > 0
            ? {
                label: `沉默 +${choice.silenceDelta}`,
                sub: "识时务的选择",
                chip: "bg-primary/10 text-primary",
              }
            : choice.silenceDelta === 0
              ? {
                  label: "沉默 ±0",
                  sub: "真心话出口",
                  chip: "bg-muted text-muted-foreground",
                }
              : {
                  label: `沉默 ${choice.silenceDelta}`,
                  sub: "逆着演的选择",
                  chip: "bg-secondary text-secondary-foreground",
                };

        if (silenceStage >= 3) {
          /* 三档：只剩「沉默」——被收走的那几条只剩位置 */
          return (
            <>
              {[...ghostIds].map((ghostId) => (
                <span
                  key={ghostId}
                  aria-hidden
                  className="h-1 w-full max-w-lg rounded-full bg-muted/70 blur-[1px]"
                />
              ))}
              <button
                type="button"
                onClick={() => approve(kept)}
                className={clsx(
                  "relative w-full max-w-lg animate-in rounded-2xl border bg-card p-4 text-center shadow-sm fade-in slide-in-from-bottom-2 duration-300 transition-all focus-visible:shadow-focus focus-visible:outline-none",
                  stampId === kept.id ? "border-primary bg-primary/5" : "border-primary hover:-translate-y-0.5 hover:shadow-lg",
                )}
              >
                <span className="block text-lg font-bold tracking-[0.3em] text-card-foreground">沉默</span>
                <span className="mt-2 flex items-center justify-center gap-2">
                  <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", metaOf(kept).chip)}>
                    {metaOf(kept).label}
                  </span>
                </span>
                {stampId === kept.id && (
                  <span
                    className="anim-stamp absolute right-3 top-2 inline-block -rotate-12 rounded border-2 border-primary/70 px-2 py-0.5 text-[11px] font-bold tracking-widest text-primary"
                    aria-hidden
                  >
                    已勾
                  </span>
                )}
              </button>
            </>
          );
        }

        return ordered.map((choice, i) => {
          const meta = metaOf(choice);
          const ghost = ghostIds.has(choice.id);
          const stamped = stampId === choice.id;
          /* 曾表态（批次 CY-31）：上一学期在这条上勾过章——淡是淡了，这回想改照样能改 */
          const answered = answeredIds.includes(choice.id);
          return (
            <button
              key={choice.id}
              type="button"
              disabled={ghost || stampId !== null}
              onClick={() => approve(choice)}
              style={{ animationDelay: `${i * 90}ms` }}
              className={clsx(
                "relative w-full max-w-lg animate-in rounded-2xl border bg-card p-3.5 text-left shadow-sm fade-in slide-in-from-bottom-2 duration-300 transition-all focus-visible:shadow-focus focus-visible:outline-none sm:p-4",
                !stamped && "hover:-translate-y-0.5 hover:border-primary hover:shadow-lg",
                stamped && "border-primary bg-primary/5",
                wary && "opacity-80",
                answered && !ghost && !wary && "opacity-60",
                ghost && (silenceStage === 1 ? "pointer-events-none opacity-75 blur-[0.8px]" : "pointer-events-none opacity-55 blur-[1.8px]"),
              )}
            >
              <span className="flex items-start gap-2.5">
                {/* 勾选框（批次 CH）：选项不做成按钮，做成审批栏——点下去先盖章 */}
                <span
                  aria-hidden
                  className={clsx(
                    "mt-1 inline-block h-3.5 w-3.5 shrink-0 border",
                    stamped ? "border-primary bg-primary" : "border-border bg-background",
                  )}
                />
                <span className="block text-base font-bold leading-relaxed text-card-foreground">
                  {choice.text}
                </span>
              </span>
              <span className="mt-2 flex items-center gap-2 pl-6">
                <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", meta.chip)}>
                  {meta.label}
                </span>
                <span className="text-xs text-muted-foreground">{meta.sub}</span>
                {answered && (
                  <span
                    title="上一学期在这一条上盖过章——这一次想改，照样能改"
                    className="ml-auto shrink-0 rounded-full border border-dashed border-muted-foreground/50 px-2 py-0.5 text-[10px] font-bold tracking-widest text-muted-foreground"
                  >
                    曾表态
                  </span>
                )}
              </span>
              {stamped && (
                <span
                  className="anim-stamp absolute right-3 top-2 inline-block -rotate-12 rounded border-2 border-primary/70 px-2 py-0.5 text-[11px] font-bold tracking-widest text-primary"
                  aria-hidden
                >
                  已勾
                </span>
              )}
            </button>
          );
        });
      })()}
      {/* 让它替我选（批次 BC「替换」）：角色可以替玩家做选择——你放弃了选择，档案仍然记在你头上 */}
      {onDefer && revealed && silenceStage < 3 && stampId === null && (
        <button
          type="button"
          onClick={() => onDefer()}
          className="animate-in rounded-full border border-dashed border-border bg-card/80 px-4 py-1.5 text-[11px] font-bold text-muted-foreground shadow-sm fade-in slide-in-from-bottom-2 duration-300 transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
        >
          不选了，让它替我
        </button>
      )}
    </div>
  );
}
