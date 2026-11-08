/**
 * 剧情线卡片弹层：线名、简介、梗浓度星级、出场蛙、开始按钮。
 * 缺席（批次 BB）：可以不进入——「今天不去了」按楼给反馈（食堂照常运转但你没有记录 /
 * 卷王会问你今天没来 / 行政楼会记该蛙未到）；主蛙今天没来也是它自己的事。
 * 替换（批次 BC）：可以替本线主蛙走这一趟——你走了别人的路，档案写你的名字。
 */
import { useState } from "react";
import { FROG_BY_CHARACTER } from "@/components/frog/Frog";
import { FROG_CHARACTERS } from "@/data/characters";
import { REGULAR_LINE_IDS, buildingById, type StorylineMeta } from "@/data/storylinesMeta";
import type { LineState } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface StorylineDialogProps {
  line: StorylineMeta | null;
  state: LineState;
  /** 锁定原因（批次 T）：锁定时显示这行档案腔提示，替代开始按钮的置灰 */
  lockHint?: string | null;
  /** 角色不出现（批次 BB）：本线主蛙的缺席说明（今天没来 / 昨天没来）；null = 正常出场 */
  absenteeNote?: string | null;
  /** 玩家不出现（批次 BB）：「今天不去了」——落档后弹反馈文案 */
  onSkipVisit?: () => void;
  /** 替它走这一趟（批次 BC）：成功后照常开始剧情；失败（本学期已替过别的线）返回 false */
  onSubstitute?: () => boolean;
  /** 章节选择（内容扩容批次）：本线是否已走完——走完的线才显示幕选择 */
  completed?: boolean;
  /** 章节选择：直接从指定幕（1 起）开走 */
  onStartAtAct?: (actIndex: number) => void;
  onClose: () => void;
  onStart: () => void;
}

/** 「今天不去了」的按楼反馈（批次 BB）：你在，但你不在场 */
function skipFeedbackOf(building: string): { text: string; archive: string } {
  if (building === "canteen") {
    return {
      text: "食堂照常运转——锅照热，勺照刮，队伍照排。只是今天没有你的记录：你在，但你不在场。",
      archive: "该蛙今日未到：食堂。窗口不问，勺也不停。",
    };
  }
  if (building === "library") {
    return {
      text: "图书馆的灯照常亮到凌晨。卷王抬头看了一次门口——「你今天没来？」这句话它记在心里，没有说出口。",
      archive: "该蛙今日未到：图书馆。灯替它亮着。",
    };
  }
  if (building === "administration") {
    return {
      text: "行政楼的窗口开着。它会记：该蛙未到。记录的方式是照常——名单不因为谁没来就短一行。",
      archive: "该蛙今日未到：行政楼。名单照记。",
    };
  }
  return {
    text: "你站在门口，然后转身走了。这栋楼今天照常——只是你的位置空着：你在，但你不在场。",
    archive: "该蛙今日未到。原因栏空白。",
  };
}

/** 剧情线卡片弹层 */
export function StorylineDialog({
  line,
  state,
  lockHint,
  absenteeNote = null,
  onSkipVisit,
  onSubstitute,
  completed = false,
  onStartAtAct,
  onClose,
  onStart,
}: StorylineDialogProps) {
  /** 今天不去了（批次 BB）：点了之后卡片换成反馈页 */
  const [skipped, setSkipped] = useState<{ text: string; archive: string } | null>(null);
  /** 替它走（批次 BC）：本学期已经替过别的线时按钮给一句说明 */
  const [substituteBlocked, setSubstituteBlocked] = useState(false);
  if (!line) return null;
  const locked = state === "locked";
  const mainFrog = FROG_CHARACTERS[line.castIds[0]]?.displayName ?? "它";

  if (skipped) {
    return (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      >
        <div
          role="dialog"
          aria-label={`今日未到：${buildingById(line.building)?.label ?? ""}`}
          className="anim-fade-up w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-7"
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
            {buildingById(line.building)?.label} · 门口
          </span>
          <h3 className="mt-4 text-xl font-black tracking-tight text-card-foreground">你转身走了</h3>
          <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={skipped.text} />
          <RichText className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground" text={skipped.archive} />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            不出现 = 你在，但你不在场。缺席不扣任何数值——它只让名单上多一行空白。
          </p>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              回地图
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label={`剧情线：${line.title}`}
        className="anim-fade-up w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-7"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
            {buildingById(line.building)?.label}
          </span>
          {line.hidden && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">隐藏剧情线</span>
          )}
        </div>

        <h3 className="mt-4 text-2xl font-black tracking-tight text-card-foreground">《{line.title}》</h3>
        <RichText className="mt-2 text-sm leading-relaxed text-muted-foreground" text={line.intro} />
        {locked && lockHint && (
          <RichText className="mt-3 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground" text={lockHint} />
        )}
        {/* 角色不出现（批次 BB）：缺席的角色也有自己的生活——回来时带着一段只属于它的剧情 */}
        {absenteeNote && (
          <RichText className="mt-3 rounded-xl border border-dashed border-border bg-background/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground" text={absenteeNote} />
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">梗浓度预警</span>
            <span className="text-base font-bold text-primary" aria-label={`梗浓度 ${line.memeLevel} 星`}>
              {"★".repeat(line.memeLevel)}
              <span className="text-muted-foreground/50">{"★".repeat(5 - line.memeLevel)}</span>
            </span>
          </span>
          <span className="text-muted-foreground">共 {line.actCount} 幕</span>
        </div>

        <div className="mt-5 flex items-end justify-around rounded-2xl bg-background/60 px-4 py-3">
          {line.castIds.map((castId) => {
            const FrogArt = FROG_BY_CHARACTER[castId];
            return (
              <div key={castId} className="flex flex-col items-center gap-1">
                <FrogArt size={40} />
                <span className="text-xs font-bold text-muted-foreground">{FROG_CHARACTERS[castId].displayName}</span>
              </div>
            );
          })}
        </div>

        {locked && (
          <p className="mt-4 rounded-2xl bg-primary/10 px-4 py-3 text-xs font-medium leading-relaxed text-primary">
            湖边还没有出现在校牌上。完成其余 {REGULAR_LINE_IDS.length} 条常规线，夜谈的灯才会亮起来。
          </p>
        )}

        {/* 替它走这一趟（批次 BC）：不是换角色，是换位置——你走了别人的路，档案写你的名字 */}
        {!locked && onSubstitute && (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3">
            {substituteBlocked ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                这学期已经在替别人走了。位置一次只能占一个——先走完那一条，再谈换不换。
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                也可以替{mainFrog}走这一趟：剧情照走，档案照记——档案上写的是你的名字。
              </p>
            )}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!onSubstitute()) {
                    setSubstituteBlocked(true);
                    return;
                  }
                  onStart();
                }}
                disabled={locked}
                className="rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary transition-colors duration-200 hover:bg-primary/20 focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-50"
              >
                替{mainFrog}走这一趟
              </button>
            </div>
          </div>
        )}

        {/* 章节选择（内容扩容批次）：走完的线可从任意一幕直接重走——前面的幕不再重演 */}
        {!locked && completed && onStartAtAct && line.actCount > 1 && (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              这条线已经走完了。重走时可以直接从某一幕开始——前面的幕不再重演。
            </p>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              {Array.from({ length: line.actCount }, (_, index) => index + 1).map((actNumber) => (
                <button
                  key={actNumber}
                  type="button"
                  onClick={() => onStartAtAct(actNumber)}
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-card-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
                >
                  第 {actNumber} 幕
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {onSkipVisit && (
            <button
              type="button"
              onClick={() => {
                onSkipVisit();
                setSkipped(skipFeedbackOf(line.building));
              }}
              className="rounded-full border border-border bg-card px-4 py-2.5 text-sm font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
            >
              今天不去了
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-muted px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
          >
            先逛逛
          </button>
          <button
            type="button"
            onClick={onStart}
            disabled={locked}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            开始剧情
          </button>
        </div>
      </div>
    </div>
  );
}
