/**
 * 校园地图 · 本周课表（批次 AP「校园是活的系统」之一）
 * 课表是学校替你排的：按上一学期的档案派生——沉默值高排自习、真话多排讨论、
 * 表演分高排展示、被盯上排约谈。玩家不能改课表，只能决定去不去。
 * 逃课会被记录；逃课次数多了，教室里坐了一只替你到堂的蛙（批次 AR「你的位置」）——
 * 第一次进课表先看见它，之后它一直在。
 */
import { useState } from "react";
import { BookOpen, CalendarDays, MessagesSquare, Presentation, ScrollText, UserRound } from "lucide-react";
import { clsx } from "clsx";
import {
  CLASS_LABELS,
  CLASS_RULE_LINE,
  classArchiveLine,
  classSceneOf,
  slotCellOf,
  SKIP_ARCHIVE_LINE,
  type ClassKind,
} from "@/lib/schedule";
import { RichText } from "@/components/common/RichText";

interface ClassScheduleOverlayProps {
  /** 整张课表（10 节，随学期存档；旧档可能为空） */
  schedule: string[];
  /** 今天的课型（无课表 / 槽位为空时为 null） */
  kind: ClassKind | null;
  /** 今天是第几节（0-9） */
  slot: number;
  /** 今天已经处理过课（上过或逃过） */
  handled: boolean;
  /** 到堂节数 */
  attended: number;
  /** 逃课次数 */
  skips: number;
  /** 替身还没见过（批次 AR）：逃课满三次之后第一次进课表——先看见它 */
  surrogateDue?: boolean;
  /** 见过替身（批次 AR）：落档，之后它一直在 */
  onSurrogateAck?: () => void;
  /** 今天是停课日（批次 AS）：今日动作区换停课说明——课表是空的，档案不收这一天 */
  holiday?: boolean;
  onAttend: (kind: ClassKind) => boolean;
  onSkip: () => boolean;
  onClose: () => void;
}

/** 课型 → 图标（每种课的图腾：安静 / 开口 / 上台 / 名单） */
const KIND_ICONS: Record<ClassKind, typeof BookOpen> = {
  study: BookOpen,
  talk: MessagesSquare,
  show: Presentation,
  talkwith: ScrollText,
};

/** 上课的数值口径（档案腔一句）：学校把你往哪边推，你就往哪边走一步 */
const KIND_EFFECT: Record<ClassKind, string> = {
  study: "沉默值 +1：安静是排给你的。",
  talk: "沉默值 −1：说出口的那句被记进了讨论纪要。",
  show: "表演分 +1：讲得好，评语是「结构清晰」。",
  talkwith: "被注意值 +1：这一课的意思是，名单先到了。",
};

function isClassKind(value: string | undefined): value is ClassKind {
  return value === "study" || value === "talk" || value === "show" || value === "talkwith";
}

/** 替身前置（批次 AR）：逃课满三次之后第一次进课表——先看见它，看完才见课表 */
function SurrogateNotice({ onAck }: { onAck: () => void }) {
  return (
    <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-primary">
        <UserRound size={13} aria-hidden />
        名单更新 · 出勤
      </p>
      <p className="mt-3 text-sm leading-relaxed text-card-foreground">
        教室里坐了一只蛙。没有名字——点名册上那一行写的是你的名字。它坐得比你还直。
      </p>
      <p className="mt-2 text-sm leading-relaxed text-card-foreground">
        你数了一下：这学期它替你上过的课，比你去过的多。
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        档案没有记它。档案记的是你：该蛙今日到堂。
      </p>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onAck}
          className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
        >
          知道了
        </button>
      </div>
    </div>
  );
}

export function ClassScheduleOverlay({
  schedule,
  kind,
  slot,
  handled,
  attended,
  skips,
  surrogateDue = false,
  onSurrogateAck,
  holiday = false,
  onAttend,
  onSkip,
  onClose,
}: ClassScheduleOverlayProps) {
  const [result, setResult] = useState<string | null>(null);
  /** 替身还没看完就先看替身：看完落档，之后它一直在（本浮层内用本地状态切换） */
  const [surrogateAcked, setSurrogateAcked] = useState(!surrogateDue);
  const emptyRoom = skips >= 3;

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="本周课表"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <CalendarDays size={13} aria-hidden />
            教务处 · 本周课表
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">课表是学校替你排的</h2>
          <RichText className="mt-2 text-xs leading-relaxed text-muted-foreground" text={CLASS_RULE_LINE} />

          {result ? (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={result} />
              <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                {classArchiveLine(kind ?? "study")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{KIND_EFFECT[kind ?? "study"]}</p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  下课
                </button>
              </div>
            </>
          ) : !surrogateAcked ? (
            <>
              <SurrogateNotice
                onAck={() => {
                  setSurrogateAcked(true);
                  onSurrogateAck?.();
                }}
              />
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  合上课表
                </button>
              </div>
            </>
          ) : (
            <>
              {/* 五天 × 上午/下午：课表格子；今天的格子亮着 */}
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <div className="grid grid-cols-[3.2rem_1fr_1fr] text-[10px] font-bold tracking-widest text-muted-foreground">
                  <span className="border-b border-r border-border bg-background/40 px-2 py-1.5" />
                  <span className="border-b border-border bg-background/40 px-2 py-1.5">上午</span>
                  <span className="border-b border-border bg-background/40 px-2 py-1.5">下午</span>
                </div>
                {Array.from({ length: 5 }, (_, row) => {
                  const dayLabel = slotCellOf(row * 2).dayLabel;
                  /* 今天所在行整行点亮（批次 CY-87）：左侧日头先知道今天是谁 */
                  const rowIsToday = kind !== null && slot >= row * 2 && slot < row * 2 + 2;
                  return (
                    <div key={dayLabel} className="grid grid-cols-[3.2rem_1fr_1fr]">
                      <span
                        className={clsx(
                          "border-b border-r border-border px-2 py-2.5 text-[10px] tracking-widest",
                          rowIsToday ? "bg-primary/10 font-black text-primary" : "bg-background/40 font-bold text-muted-foreground",
                        )}
                      >
                        {dayLabel}
                      </span>
                      {[0, 1].map((col) => {
                        const cellSlot = row * 2 + col;
                        const cellValue = schedule[cellSlot];
                        const cellKind = isClassKind(cellValue) ? cellValue : null;
                        const Icon = cellKind ? KIND_ICONS[cellKind] : null;
                        return (
                          <span
                            key={col}
                            className={clsx(
                              "flex items-center gap-1.5 border-b border-border px-2 py-2.5 text-xs font-bold",
                              cellSlot === slot && "bg-primary/10 font-black text-primary",
                              cellSlot !== slot && (cellKind ? "text-muted-foreground" : "text-muted-foreground/40"),
                            )}
                          >
                            {Icon ? <Icon size={12} aria-hidden /> : null}
                            {cellKind ? CLASS_LABELS[cellKind] : "—"}
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* 今日动作：去上课 / 不去（两者都算处理过——一天只有一节）；停课日只有说明（批次 AS） */}
              {kind && (
                <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <p className="text-sm font-black tracking-tight text-primary">
                    {slotCellOf(slot).dayLabel} {slotCellOf(slot).periodLabel} · {holiday ? "停课" : CLASS_LABELS[kind]}
                    {!holiday && emptyRoom ? " · 你的位置" : ""}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {holiday
                      ? "今天的课表是空的——停课不需要理由，上课才需要排期。这一天没有安排，档案不收。"
                      : handled
                        ? "今天的课已经处理过了——上过，或者没去。课表不问你选了哪种。"
                        : "这一节现在就开。你只能决定去不去。"}
                  </p>
                  {!handled && !holiday && (
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!onSkip()) return;
                          setResult(SKIP_ARCHIVE_LINE);
                        }}
                        className="rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
                      >
                        不去
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!onAttend(kind)) return;
                          setResult(classSceneOf(kind, emptyRoom));
                        }}
                        className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                      >
                        去上课
                      </button>
                    </div>
                  )}
                </div>
              )}
              {!kind && (
                <p className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                  课表还没排好。开学的时候它会自己贴出来——学校排课，不需要问你。
                </p>
              )}

              {/* 台账：档案照常在数——逃课满三次之后，记的还是你的名字 */}
              <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">
                到堂 {attended} 节 · 逃课 {skips} 次 · 课表不改，只数你。
                {emptyRoom ? " 教室里坐着替你到堂的那只——档案没换名字。" : ""}
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  合上课表
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
