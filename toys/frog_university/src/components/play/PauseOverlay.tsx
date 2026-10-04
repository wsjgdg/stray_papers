/**
 * 暂停浮层（批次 AT「时间机器」之一；批次 CH「行政化」数值印章化）
 * 背景不变，音乐继续——玩家在暂停里查看数值、档案、图鉴与快进记录。
 * 但暂停有代价：暂停太久，它们开始动——不是恢复，是在你暂停的时候，它们自己动了。
 * 你以为你停住了世界，但世界只是等你不在的时候自己走。
 */
import { Activity, BookOpen, Map, Play } from "lucide-react";
import { clsx } from "clsx";
import { loadGameSave } from "@/lib/gameSave";
import { impressionPercent } from "@/lib/impression";
import { Stamp } from "@/components/system/Stamp";
import { displayNameOf } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface PauseOverlayProps {
  /** 已暂停的秒数（Logic 层计时） */
  seconds: number;
  /** 第二学期起数值隐藏（顶栏与侧表显示「——」的同一口径） */
  hideValues: boolean;
  /** 本线标题与幕次（档案摘要一行） */
  lineTitle: string;
  actLabel: string;
  onResume: () => void;
  onGoMap: () => void;
  onGoEndings: () => void;
}

/** 暂停够久之后的渗出：不是恢复，是它们在你不在的时候自己动了 */
const SEEP_LINES: { at: number; text: string }[] = [
  { at: 20, text: "（它抬起了头。）" },
  { at: 45, text: "（它看向了你不在的方向。）" },
  { at: 80, text: "（它在纸上写了一行什么，然后合上了。）" },
];

export function PauseOverlay({
  seconds,
  hideValues,
  lineTitle,
  actLabel,
  onResume,
  onGoMap,
  onGoEndings,
}: PauseOverlayProps) {
  const save = loadGameSave();
  const truthCount = save.truthJar.length;
  const forwardLog = (save.fastForwardLog ?? []).slice(-6);
  const seeped = SEEP_LINES.filter((item) => seconds >= item.at);
  return (
    <div
      className="fixed inset-0 z-[50] overflow-y-auto bg-foreground/80 px-4 py-10 backdrop-blur-[2px]"
      role="dialog"
      aria-label="暂停"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Activity size={13} aria-hidden />
            暂停 · 你不在场
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-widest text-card-foreground">世界没有跟着你停</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            背景不变，音乐继续。你只是不在。你以为你停住了世界——但世界只是等你不在的时候自己走。
          </p>

          <p className="mt-3 font-mono text-[11px] tracking-widest text-primary">已暂停 {seconds} 秒</p>

          {/* 暂停够久，它们开始动——不是恢复，是在你暂停的时候 */}
          {seeped.length > 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground">你不在的这段时间</p>
              <ul className="mt-1.5 space-y-1">
                {seeped.map((item) => (
                  <li key={item.at} className="text-xs leading-relaxed text-muted-foreground">
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 暂停里可以查看所有数值（批次 CH：数值不做成条，做成档案页边上的批注——印章。
             不显示具体数字：盖得越深，说明越多。想知道具体多少？去档案柜里查。 */}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {([
              ["沉默", "默", save.silenceValue, 4, undefined],
              ["表演", "良", impressionPercent(save.reputation), 24, undefined],
              ["陈述", "陈", truthCount, 9, undefined],
              ["注意", "注", save.attention, 1, 4],
            ] as const).map(([label, glyph, value, step, bleedFrom]) => (
              <div key={glyph} className="rounded-xl border border-border bg-background/60 py-2">
                <RichText className="text-[10px] font-bold tracking-widest text-muted-foreground" text={label} />
                <div className="mt-1 flex justify-center">
                  {hideValues ? (
                    <span className="flex h-9 w-9 items-center justify-center font-mono text-xs text-muted-foreground/60">——</span>
                  ) : (
                    <Stamp glyph={glyph} value={value} step={step} bleedFrom={bleedFrom} />
                  )}
                </div>
              </div>
            ))}
          </div>
          {hideValues && (
            <p className="mt-1.5 text-center text-[10px] leading-relaxed text-muted-foreground/70">
              本学期数值以档案为准——档案柜里查。
            </p>
          )}

          {/* 档案摘要与快进记录：中间发生的事被记录在档案里，玩家可以看 */}
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            第 {playthroughOf(save.playthrough)} 学期 · {displayNameOf(save)} · 《{lineTitle}》{actLabel} · 档案柜{" "}
            {(save.dossiers ?? []).length} 份 · 图鉴 {save.unlockedEndings.length} 页
          </p>
          {forwardLog.length > 0 && (
            <div className="mt-2 rounded-xl border border-dashed border-border bg-background/60 p-3">
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground">
                快进记录 · 你不在场的那部分
              </p>
              <ul className="mt-1.5 space-y-1">
                {forwardLog.map((item, i) => (
                  <li key={`${i}-${item}`} className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground/70">
                快进越多，档案越厚，但玩家越薄。
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onGoMap}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
            >
              <Map size={12} aria-hidden />
              回地图
            </button>
            <button
              type="button"
              onClick={onGoEndings}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
            >
              <BookOpen size={12} aria-hidden />
              结局图鉴
            </button>
            <button
              type="button"
              onClick={onResume}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none",
              )}
            >
              <Play size={12} aria-hidden />
              继续
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function playthroughOf(value: number | undefined): number {
  return typeof value === "number" && value >= 1 ? Math.round(value) : 1;
}
