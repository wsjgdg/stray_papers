/**
 * 校园地图 · 互查（批次 BK「互查」）
 * 编组：本学期开展档案互查，你在第三组——小组名单上只有你，不是缺人，是这一组本来就没打算要别的蛙。
 * 同数：翻七份档案，数值三栏（表演 / 沉默 / 被注意）全部和你的档案一样——
 *   一套制度量出来的，都是同一套数字。不是巧合：表格只有一张。
 * 空档：第七份没有内容——上一只记录员的档案。它什么都没写；它离任的原因一栏是空的，它的档案也是空的。
 *   没有东西可查，就没有东西可说。
 * 补评：检查组要求每份都有结论。你在空档的评语栏补一行——学期末归档之后，
 *   它档案里的第一行，是别人替它写的。
 */
import { useState } from "react";
import { FileSearch } from "lucide-react";

interface AuditPage {
  /** 这份档案是哪只蛙的 */
  name: string;
  /** 评语（同一张表格，同一套句式） */
  comment: string;
}

interface AuditOverlayProps {
  /** 六份在册档案（种子派生顺序） */
  pages: AuditPage[];
  /** 数值三栏：全部和你的档案一样——表格只有一张 */
  stats: { silence: number; reputation: number; attention: number };
  /** 档案行的天数 */
  day: number;
  /** 互查完了（落档口径：空档的评语栏补了什么） */
  onAck: (note: string) => void;
}

const PAGE_COUNT = 6;

export function AuditOverlay({ pages, stats, day, onAck }: AuditOverlayProps) {
  const [step, setStep] = useState(0);
  const [note, setNote] = useState("");

  /** 阶段：0 编组 · 1~6 六份逐页翻 · 7 空档 · 8 补评 · 9 收尾 */
  const inPages = step >= 1 && step <= PAGE_COUNT;
  const pageIndex = Math.min(PAGE_COUNT - 1, step - 1);
  const current = pages[pageIndex] ?? pages[0] ?? { name: "在册的一只", comment: "该蛙在册。在册即合规。" };
  const title =
    step === 0
      ? "编组通知"
      : inPages
        ? `第 ${pageIndex + 1} 份`
        : step === 7
          ? "第七份"
          : step === 8
            ? "补评"
            : "收工";

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="档案互查"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FileSearch size={13} aria-hidden />
            档案室 · 互查
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">{title}</h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                通知贴在柜门上：本学期开展档案互查。你在第三组。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                小组名单上只有你。不是缺人——是这一组本来就没打算要别的蛙。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                互查的意思是：柜子对着柜子，蛙对着蛙。查档计入考评，查阅有记录。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  开始查
                </button>
              </div>
            </>
          )}

          {inPages && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                第 {pageIndex + 1} 份。{current.name}。
              </p>
              <p className="mt-2 rounded-xl border border-dashed border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed tracking-wider text-card-foreground">
                表演 {stats.reputation} · 沉默 {stats.silence} · 被注意 {stats.attention}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">评语：{current.comment}</p>
              {step === 2 && (
                <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                  这份的数值栏，和你的档案一样。你没有多想——同一个考评季，数字撞上很正常。
                </p>
              )}
              {step === 4 && (
                <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                  第三份、第四份，还是一样。四份的表格编号不同，栏目的字一模一样。
                </p>
              )}
              {step === 6 && (
                <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                  六份都翻完了。数值栏全部一样。一套制度量出来的，都是同一套数字——不是巧合：表格只有一张。
                </p>
              )}
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  下一份
                </button>
              </div>
            </>
          )}

          {step === 7 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">第七份没有内容。</p>
              <p className="mt-2 rounded-xl border border-dashed border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed tracking-wider text-card-foreground">
                表演 —— · 沉默 —— · 被注意 ——
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                评语栏空白。移交单上写「原记录员，已离任」——它什么都没写。它离任的原因一栏是空的，它的档案也是空的。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                没有东西可查，就没有东西可说。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(8)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  继续
                </button>
              </div>
            </>
          )}

          {step === 8 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                检查组要求：每份都要有结论。这一份也没有例外——评语栏还空着。
              </p>
              <input
                type="text"
                value={note}
                maxLength={40}
                onChange={(event) => setNote(event.target.value)}
                placeholder="该蛙……"
                className="mt-3 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:shadow-focus"
              />
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                最多四十字。你写的那一行，学期末归档——它档案里的第一行，是别人替它写的。
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setStep(9)}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  空着
                </button>
                <button
                  type="button"
                  onClick={() => setStep(9)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  补评
                </button>
              </div>
            </>
          )}

          {step === 9 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                检查完了。七份，每份一页。你把柜门合上——柜门上贴着检查组的意见表，意见栏空着：没有意见。
              </p>
              {note.trim() ? (
                <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                  学期末，你补的那一行会归档——它档案里的第一行，是别人替它写的。
                </p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                  你把评语栏留空。检查组不追究空白——空白是档案自己的事。
                </p>
              )}
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙参与档案互查。查阅六份，空档一份，补评{note.trim() ? "一行" : "空栏"}。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你看见了它们的数值。它们也有一份写着你的——那一份你翻不到。
                互查的意思是：柜子对着柜子，蛙对着蛙，谁也进不去谁的。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAck(note)}
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
