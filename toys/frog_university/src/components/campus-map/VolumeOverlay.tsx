/**
 * 校园地图 · 结卷（批次 BP「结卷」）
 * 合订：学期末，档案室要求每学期结卷一次——这一学期的事不再一页一页地放，订成一本。
 *   「结卷的意思是：这一学期的事不再一页一页地放。以后查起来快——查得快，忘得也快。」
 * 目录：卷首有目录。目录上的每一行都能翻到对应的页。
 *   你的学期被检索了——检索过的学期，比经历过的短。
 * 页脚：卷末一页是统计。页脚不写感想，页脚只写数量——数量是这学期留给时间的全部。
 * 卷脊：标签贴上卷脊，写着学期号和编号，没有名字。
 *   名字在卷内第一页的第一行。卷脊上只有编号：制度记得你做过什么，不记得你是谁——
 *   它连名字都省了，因为名字不参与检索。
 */
import { useState } from "react";
import { BookMarked } from "lucide-react";

interface VolumeCounts {
  /** 会议（列席 + 执笔） */
  meetings: number;
  /** 交接结论 */
  handovers: number;
  /** 值班 */
  shifts: number;
  /** 帮带 */
  mentorings: number;
  /** 互查 */
  audits: number;
  /** 迎检 */
  inspections: number;
  /** 看柜 */
  duties: number;
  /** 基准取样 */
  baselines: number;
  /** 核对不符档案 */
  misalignments: number;
  /** 真话 */
  truths: number;
  /** 已收录结局 */
  endings: number;
}

interface VolumeOverlayProps {
  /** 本卷目录的计数（来自存档既有记录） */
  counts: VolumeCounts;
  /** 档案行的天数 */
  day: number;
  /** 结卷完了（落档 + 收浮层） */
  onAck: () => void;
}

export function VolumeOverlay({ counts, day, onAck }: VolumeOverlayProps) {
  const [step, setStep] = useState(0);

  const rows: { label: string; count: number }[] = [
    { label: "会议", count: counts.meetings },
    { label: "交接结论", count: counts.handovers },
    { label: "值班", count: counts.shifts },
    { label: "帮带", count: counts.mentorings },
    { label: "互查", count: counts.audits },
    { label: "受检", count: counts.inspections },
    { label: "看柜", count: counts.duties },
    { label: "取样", count: counts.baselines },
    { label: "核对", count: counts.misalignments },
    { label: "真话", count: counts.truths },
    { label: "收录结局", count: counts.endings },
  ];
  const total = rows.reduce((sum, item) => sum + item.count, 0);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="结卷"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <BookMarked size={13} aria-hidden />
            档案室 · 结卷
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {step === 0 ? "结卷通知" : step === 1 ? "目录" : step === 2 ? "页脚" : "卷脊"}
          </h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                通知贴在柜门上：本学期档案结卷。你把自己的那份抽出来——档案室要求每学期结卷一次，卷脊贴标签。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                结卷的意思是：这一学期的事不再一页一页地放，订成一本。以后查起来快——查得快，忘得也快。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  开始合订
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">卷首有目录。目录上的行是这样的：</p>
              <div className="mt-2 rounded-xl border border-dashed border-border bg-background/60 p-3">
                {rows.map((item) => (
                  <p
                    key={item.label}
                    className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
                  >
                    {item.label}——{item.count}
                  </p>
                ))}
              </div>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                每一行都能翻到对应的页。你的学期被检索了——检索过的学期，比经历过的短。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  继续
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">卷末一页是统计：</p>
              <p className="mt-2 rounded-xl border border-dashed border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed tracking-wider text-card-foreground">
                本卷共 {total} 行记录 · 真话 {counts.truths} 条 · 已收录结局 {counts.endings} 部
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                页脚不写感想。页脚只写数量——数量是这学期留给时间的全部。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  继续
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你把标签贴上卷脊。标签上写着学期号和编号——没有名字。
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该学期档案结卷一册。卷内 {total} 行。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                名字在卷内第一页的第一行。卷脊上只有编号：制度记得你做过什么，不记得你是谁——
                它连名字都省了，因为名字不参与检索。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onAck}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收好
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
