/**
 * 结局图鉴 · 岔路册区块（批次 C2：54 条支路升级为流程图）
 * 全游戏 18 处分岔、54 条支路：每处分岔画一张小图——分岔节点在上、支路卡扇形展开，
 * 节点与支路卡之间用 SVG 扇形连线（已走实线、未走虚线），小屏自动堆叠。
 * 已走支路：填充 + 勾标 + 选项文案 + 收束语 + 学期小标；未走支路：虚线卡 + 低透明度文案，
 * 已完成线的未走支路可「去走」（把续播幕指到分岔所在幕再进线）。
 * 空态也把全虚线图照画——不是空白，是「一张还没动笔的流程图」。
 * 语气与真话罐一致：克制，不哭腔。跨周目保留，开新档清不掉。
 */
import { Check, CircleDashed, Flag, GitBranch, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StorylineId } from "@/data/storylines";
import type {
  BranchLineGroup,
  BranchNextPick,
  BranchPointGroup,
  BranchSlot,
} from "@/pages/Endings/useEndings";
import { RichText } from "@/components/common/RichText";

interface BranchSectionProps {
  groups: BranchLineGroup[];
  walked: number;
  total: number;
  complete: boolean;
  /** 下一条可走的岔路（已完成线里挑的行进坐标；null = 暂时没有能直接去走的） */
  next: BranchNextPick | null;
  /** 教材（批次 BF）：按支路 key 判断是否被录入《新生手册》的岔路参考 */
  isTextbook?: (key: string) => boolean;
  onGo: () => void;
  /** 去走指定线上的某一处分岔（Logic 层只对已完成线生效；View 层只给已完成线的支路渲染可点态） */
  onGoAt: (lineId: StorylineId, actIndex: number) => void;
}

/** 单条支路卡：已走 = 填充 + 勾标 + 收束语 + 学期小标；未走 = 虚线 + 低透明度 + 可选「去走」 */
function BranchRouteCard({
  slot,
  lineCompleted,
  lineId,
  lineTitle,
  actTitle,
  actIndex,
  textbook,
  onGoAt,
}: {
  slot: BranchSlot;
  lineCompleted: boolean;
  lineId: StorylineId;
  lineTitle: string;
  actTitle: string;
  actIndex: number;
  textbook?: boolean;
  onGoAt: (lineId: StorylineId, actIndex: number) => void;
}) {
  if (slot.walked) {
    return (
      <article className="relative h-full rounded-2xl border border-primary/40 bg-primary/10 p-4 shadow-sm">
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
          <Check size={11} aria-hidden />
          第 {slot.semester} 学期
        </span>
        <RichText className="pr-14 text-sm font-bold leading-snug text-card-foreground" text={slot.choiceText} />
        {slot.coda && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">—— {slot.coda}</p>
        )}
        {/* 教材（批次 BF「教材」）：你的答案成了下一届的默认——上一届多数蛙选了它 */}
        {textbook && (
          <p className="mt-2 rounded-lg border border-dashed border-primary/40 bg-background/60 px-2 py-1.5 text-[10px] leading-relaxed text-primary/80">
            已录入《新生手册》· 岔路参考：下一届遇到这一格，会先看到你的答案。
          </p>
        )}
      </article>
    );
  }
  return (
    <article className="h-full rounded-2xl border border-dashed border-border bg-muted/30 p-4">
      <RichText className="text-sm font-medium leading-snug text-card-foreground/60" text={slot.choiceText} />
      {lineCompleted ? (
        <button
          type="button"
          onClick={() => onGoAt(lineId, actIndex)}
          aria-label={`去走 ${lineTitle} · ${actTitle}：${slot.choiceText}`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors duration-200 hover:bg-primary/20 focus-visible:shadow-focus focus-visible:outline-none"
        >
          <GitBranch size={13} aria-hidden />
          去走
        </button>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CircleDashed size={13} aria-hidden />
          这条线走完后开放
        </p>
      )}
    </article>
  );
}

/** 一处分岔的小流程图：节点在上、扇形连线居中、支路卡 grid 展开（小屏自动堆叠） */
function BranchPointFlow({
  point,
  pointIndex,
  lineId,
  lineTitle,
  lineCompleted,
  isNext,
  isTextbook,
  onGoAt,
}: {
  point: BranchPointGroup;
  pointIndex: number;
  lineId: StorylineId;
  lineTitle: string;
  lineCompleted: boolean;
  isNext: boolean;
  isTextbook?: (key: string) => boolean;
  onGoAt: (lineId: StorylineId, actIndex: number) => void;
}) {
  const anyWalked = point.slots.some((slot) => slot.walked);
  const routeCount = point.slots.length;
  /* 扇形连线：按支路数把 300 宽画布等分，第 i 条支路落在 (i + 0.5) / n 处 */
  const routeX = (i: number) => Math.round(((i + 0.5) / routeCount) * 300);

  return (
    <div className="mt-6">
      {/* 分岔节点 */}
      <div className="flex justify-center">
        <div
          className={cn(
            "inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border px-4 py-1.5 text-center text-xs font-bold",
            isNext
              ? "border-primary bg-primary/10 text-primary shadow-sm"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          <span>
            第 {pointIndex + 1} 处分岔 · {point.actTitle}
          </span>
          {isNext && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
              <Flag size={11} aria-hidden />
              下一处还没走的
            </span>
          )}
        </div>
      </div>
      {/* 节点下来的主干竖线 */}
      <div aria-hidden className="flex justify-center">
        <div className={cn("h-4 w-px", anyWalked ? "bg-primary/60" : "bg-border")} />
      </div>
      {/* 节点到支路卡的扇形连线（小屏堆叠时收起，改用每卡上方短竖线） */}
      <svg
        aria-hidden
        viewBox="0 0 300 24"
        preserveAspectRatio="none"
        fill="none"
        className="hidden h-6 w-full md:block"
      >
        {point.slots.map((slot, i) => (
          <path
            key={slot.choiceId}
            d={`M150 0 C150 12 ${routeX(i)} 12 ${routeX(i)} 24`}
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={slot.walked ? undefined : "3 4"}
            className={slot.walked ? "text-primary" : "text-border"}
          />
        ))}
      </svg>
      {/* 支路卡扇形展开 */}
      <ul className="grid gap-3 md:grid-cols-3">
        {point.slots.map((slot) => (
          <li key={slot.choiceId} className="min-w-0">
            <div aria-hidden className={cn("mx-auto mb-2 h-3 w-px md:hidden", slot.walked ? "bg-primary/60" : "bg-border")} />
            <BranchRouteCard
              slot={slot}
              lineCompleted={lineCompleted}
              lineId={lineId}
              lineTitle={lineTitle}
              actTitle={point.actTitle}
              actIndex={point.actIndex}
              textbook={isTextbook?.(`${lineId}:${point.actIndex}:${slot.choiceId}`)}
              onGoAt={onGoAt}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BranchSection({ groups, walked, total, complete, next, isTextbook, onGo, onGoAt }: BranchSectionProps) {
  const missing = Math.max(0, total - walked);

  return (
    <section
      aria-label="岔路册"
      className="anim-fade-up rounded-3xl border border-border bg-card p-6 shadow-md md:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-black tracking-tight text-card-foreground">
            <GitBranch size={18} className="text-primary" aria-hidden />
            岔路册
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            每条线里真分岔出去的路，画成流程图：实线是你走过的，虚线是还没走的。开新档也清不掉。
          </p>
        </div>
        <span
          className={
            walked > 0
              ? "rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
              : "rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground"
          }
        >
          {walked}/{total} 条
        </span>
      </header>

      {walked === 0 && (
        <p className="mt-5 rounded-2xl border border-dashed border-border bg-muted/40 px-5 py-4 text-center text-sm leading-relaxed text-muted-foreground">
          这张流程图还没动笔。每处分岔都画好了，等你挑一条路走——走一条，图上就亮一条。
        </p>
      )}

      <div className="mt-6 flex flex-col gap-8">
        {groups.map((group) => {
          const isNextLine = next !== null && next.lineId === group.lineId;
          return (
            <div
              key={group.lineId}
              className={cn(
                "rounded-2xl border border-border bg-background/40 p-4 md:p-5",
                !group.completed && "saturate-50 opacity-80",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="flex items-baseline gap-2 text-sm font-bold text-card-foreground">
                  {group.lineTitle}
                  <span
                    className={
                      group.walked > 0
                        ? "rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary"
                        : "rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground"
                    }
                  >
                    {group.walked}/{group.total}
                  </span>
                </p>
                {!group.completed && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <CircleDashed size={13} aria-hidden />
                    先把这条线走完，支路才亮
                  </span>
                )}
              </div>
              {group.points.map((point, pointIndex) => (
                <BranchPointFlow
                  key={`${pointIndex}-${point.actTitle}`}
                  point={point}
                  pointIndex={pointIndex}
                  lineId={group.lineId}
                  lineTitle={group.lineTitle}
                  lineCompleted={group.completed}
                  isNext={isNextLine && next !== null && next.actIndex === point.actIndex}
                  isTextbook={isTextbook}
                  onGoAt={onGoAt}
                />
              ))}
            </div>
          );
        })}
      </div>

      {walked > 0 && missing > 0 && (
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          还没走过的岔路，还有 {missing} 条。换个学期，换条路走。
        </p>
      )}

      {next && !complete && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4">
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-card-foreground">
            下一处还没走的：{next.lineTitle} · {next.actTitle}
            <span className="text-muted-foreground">
              。进去后从这一幕接着放，快进到抉择口换条路。
            </span>
          </p>
          <button
            type="button"
            onClick={onGo}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
          >
            <GitBranch size={14} aria-hidden />
            去走这条岔路
          </button>
        </div>
      )}

      {complete && (
        <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
            <Sparkles size={13} />
            册满
          </p>
          <p className="mt-3 text-base leading-relaxed text-card-foreground">
            五十四条岔路，你全部走过一遍。每一遍，档案都记得。
          </p>
        </div>
      )}
    </section>
  );
}
