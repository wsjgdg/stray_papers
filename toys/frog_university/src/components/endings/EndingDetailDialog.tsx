/**
 * 结局全文弹层：只对已解锁条目出现，未解锁的不剧透标题与正文。
 * 语言本身（批次 AV）：
 * - 折叠——长正文只露第一句和最后一句；展开才进档案（「该蛙阅读了全部内容」），不展开是你没读；
 * - 划字——正文里可以划掉一个字（同格不重复、每页至多八个）：你在改文本，但文本记得你改了什么。
 */
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import type { EndingDetail } from "@/pages/Endings/useEndings";
import { formatCnDate, getEndingNote, getStruckChars, recordFullRead, setEndingNote, strikeChar, type StruckChar } from "@/lib/gameSave";
import { seedRandom } from "@/lib/calendar";
import { exportEndingPaper } from "@/lib/endingPaper";
import { EndingSettlementPlate } from "@/components/play/EndingSettlementPlate";
import { RichInline } from "@/components/common/RichText";

interface EndingDetailDialogProps {
  detail: EndingDetail | null;
  onClose: () => void;
  /** 撕掉这一页（批次 AD）：传入后已解锁详情底部出现撕的入口（两步确认，防误触） */
  onTear?: (endingId: string) => void;
  /** 批注写 / 擦之后回调（批次 CY-35）：让列表层的笔尖记号跟着刷新 */
  onNoteSaved?: () => void;
}

/** 超过这个字数的结局正文默认折叠：只露第一句和最后一句 */
const FOLD_LIMIT = 100;

/** 只露第一句和最后一句——中间内容被隐藏（折叠不是跳过，是你自己选择不看） */
/** 加粗记号的布尔掩码：按原串索引对齐（划字的记录不挪位），星号本身不渲染；记号不成对时整段按纯文本计 */
function emphasisMask(text: string): boolean[] {
  const markers = (text.match(/\*\*/g) ?? []).length;
  if (markers % 2 !== 0) return new Array(text.length).fill(false);
  const mask: boolean[] = [];
  let bold = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith("**", i)) {
      bold = !bold;
      mask.push(false, false);
      i += 1;
      continue;
    }
    mask.push(bold);
  }
  return mask;
}

function foldText(text: string): string {
  const sentences = text
    .split("。")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (sentences.length < 2) return text;
  return `${sentences[0]}。……${sentences[sentences.length - 1]}。`;
}

/** 结局全文弹层 */
export function EndingDetailDialog({ detail, onClose, onTear, onNoteSaved }: EndingDetailDialogProps) {
  const [tearArmed, setTearArmed] = useState(false);
  /* 折叠（批次 AV）：长正文默认折着；展开 = 你读了，档案会记 */
  const [expanded, setExpanded] = useState(false);
  /** 划掉的字（批次 AV）：当前页已划的 + 正在确认要划的 */
  const [struck, setStruck] = useState<StruckChar[]>([]);
  const [pendingStrike, setPendingStrike] = useState<{ i: number; ch: string } | null>(null);
  /* 页边批注（批次 CY-35）：正在写的 + 已存档的那行（判断有没有改动） */
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  /* 存成图（批次 CY-40）：档案复印件的导出状态 */
  const [shotState, setShotState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  useEffect(() => {
    setTearArmed(false);
    setExpanded(Boolean(detail && detail.text.length <= FOLD_LIMIT));
    setPendingStrike(null);
    setStruck(detail?.endingId ? getStruckChars(detail.endingId) : []);
    const stored = detail?.endingId ? getEndingNote(detail.endingId) : "";
    setNote(stored);
    setSavedNote(stored);
    setNoteSaved(false);
  }, [detail]);
  if (!detail) return null;

  const endingId = detail.endingId ?? "";
  /* 同届的统计（批次 AX）：与该蛙同届、交了同一份结局的蛙——你不会认识它们 */
  const endingHash = endingId.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const peers = 3 + Math.floor(seedRandom(endingHash * 17 + 23) * 40);

  /** 划掉这个字（批次 AV）：文本记得你改了什么——同格不重复，每页至多八个 */
  const doStrike = () => {
    if (!pendingStrike || !endingId) return;
    if (strikeChar(endingId, pendingStrike.i, pendingStrike.ch)) {
      setStruck(getStruckChars(endingId));
    }
    setPendingStrike(null);
  };

  /* 存成图（批次 CY-40；CY-41 誊抄手艺抽到共用模块）：干净档案复印件 + 蛙校印章 */
  const exportShot = async () => {
    if (shotState === "busy" || !endingId) return;
    setShotState("busy");
    const ok = await exportEndingPaper({
      lineTitle: detail.lineTitle,
      tierLabel: detail.tierLabel,
      title: detail.title,
      text: detail.text,
      note: getEndingNote(endingId) || undefined,
    });
    setShotState(ok ? "done" : "failed");
    window.setTimeout(() => setShotState("idle"), ok ? 2000 : 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
      <div
        role="dialog"
        aria-label={`结局全文：${detail.title}`}
        className="anim-fade-up my-auto w-full max-w-lg rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-7"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold text-primary">
              {detail.lineTitle} · {detail.tierLabel}
            </p>
            {/* 结局名升主角（批次 CY-82）：抽屉拉出来先看名字 */}
            <h3 className="mt-2 text-2xl font-black tracking-tight text-card-foreground">{detail.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭结局全文"
            className="rounded-full bg-muted px-3 py-1 text-sm font-bold text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
          >
            ✕
          </button>
        </div>

        {/* 折叠态（批次 AV）：文本在你面前，但你自己选择不看——这不是跳过，是主动选择无知 */}
        {!expanded ? (
          <>
            <p className="mt-5 text-base leading-loose text-muted-foreground">
              <RichInline text={foldText(detail.text)} />
            </p>
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/40 p-3">
              <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                中间的部分折着。不展开，你没读过；展开，档案会记：「该蛙阅读了全部内容。」
              </p>
              <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
                >
                  不展开
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(true);
                    recordFullRead();
                  }}
                  className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  展开全部
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 展开态：档案已记；正文逐字可划（批次 AV）——划掉之后那句话还在，但那个字没了 */}
            <p className="mt-4 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
              档案已记：该蛙阅读了全部内容。
            </p>
            <p className="mt-2 select-text whitespace-pre-line text-base leading-loose text-card-foreground">
              {detail.text.split("").map((ch, i) => {
                if (ch === "*") return null;
                const hit = struck.find((item) => item.i === i);
                const pending = pendingStrike?.i === i;
                return (
                  <span
                    key={i}
                    onClick={() => {
                      if (hit || ch === "\n") return;
                      setPendingStrike({ i, ch });
                    }}
                    className={clsx(
                      endingId && !hit && "cursor-pointer transition-colors duration-150 hover:bg-primary/10",
                      hit && "select-none text-muted-foreground/30 line-through",
                      pending && "bg-primary/20",
                      emphasisMask(detail.text)[i] && "font-bold",
                    )}
                    title={hit ? "已划掉" : "划掉这个字"}
                  >
                    {ch}
                  </span>
                );
              })}
            </p>

            {/* 划字确认（批次 AV）：划掉的关键字会让整句变意思——确认条挡一下手 */}
            {pendingStrike && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2">
                <p className="text-xs leading-relaxed text-card-foreground">
                  划掉「{pendingStrike.ch}」字？那句话还在，但这个字没了。
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingStrike(null)}
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    留着
                  </button>
                  <button
                    type="button"
                    onClick={doStrike}
                    className="rounded-full bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    划掉
                  </button>
                </div>
              </div>
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/70">
              正文里的字可以划掉。划掉的字会进档案——你在改文本，但文本记得你改了什么。
            </p>

            {/* 划掉的档案行（批次 AV）：该蛙于某年某月某日划掉了某字 */}
            {struck.length > 0 && (
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground">这一页的划痕 · {struck.length} 处</p>
                <ul className="mt-1.5 space-y-1">
                  {struck.map((item) => (
                    <li key={item.i} className="font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground">
                      该蛙于 {formatCnDate(item.at)} 划掉了「{item.ch}」字。
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* 结算处置单（批次 CY-128）：档案页也带结算画面——印章、档位、定格与一行判词；无对局口径，认定依据只记区间 */}
        {detail.settlement && (
          <EndingSettlementPlate
            ending={{
              id: endingId,
              title: detail.title,
              minSilence: detail.minSilence,
              maxSilence: detail.maxSilence,
              settlement: detail.settlement,
            }}
          />
        )}

        {/* 同届的统计（批次 AX）：你不是唯一的一个——但制度不提供认识彼此的功能 */}
        {endingId && (
          <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-[10px] leading-relaxed text-muted-foreground">
            与该蛙同届，另有 {peers} 只蛙交了这一份结局。你不会认识它们——统计不提供认识的功能；
            它们的名字在别的柜子里，别的柜子归别的蛙管。
          </p>
        )}

        {detail.plus && (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-left">
            <p className="text-xs font-bold tracking-widest text-muted-foreground">
              第 {detail.plusSemester ?? 2} 学期 · 档案补记
            </p>
            <p className="mt-2 text-sm leading-relaxed text-card-foreground">
              <RichInline text={detail.plus} />
            </p>
          </div>
        )}

        {detail.thirdNote && (
          <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4 text-left">
            <p className="text-xs font-bold tracking-widest text-muted-foreground">
              第三学期 · 免检批注
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              <RichInline text={detail.thirdNote} />
            </p>
          </div>
        )}

        {/* 撕掉这一页（批次 AD）：代价是失去收集进度，得到一道只有你看到的撕口 */}
        {onTear && endingId && (
          <div className="mt-5 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-3">
            {tearArmed ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-destructive">
                  撕掉就放不回去了。这一页会从图鉴消失，柜子会记住这道撕口。
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setTearArmed(false)}
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    再想想
                  </button>
                  <button
                    type="button"
                    onClick={() => onTear(endingId)}
                    className="rounded-full bg-destructive px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    确认撕掉
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
                  这一页档案可以撕掉。撕掉的部分，图鉴不再显示。
                </p>
                <button
                  type="button"
                  onClick={() => setTearArmed(true)}
                  className="shrink-0 rounded-full border border-destructive/40 bg-card px-4 py-1.5 text-xs font-bold text-destructive shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  撕掉这一页
                </button>
              </div>
            )}
          </div>
        )}

        {/* 页边批注（批次 CY-35）：官方文本不许改，页边可以——写下的那行档案原样抄录 */}
        {endingId && (
          <div className="mt-5 rounded-2xl border border-border bg-background/60 p-3.5">
            <label htmlFor="ending-note" className="block text-xs font-bold text-muted-foreground">
              页边批注
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="ending-note"
                type="text"
                value={note}
                maxLength={60}
                onChange={(inputEvent) => {
                  setNote(inputEvent.target.value);
                  setNoteSaved(false);
                }}
                placeholder="关于这一页，写一行……（清空即擦掉）"
                className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus-visible:shadow-focus focus-visible:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setEndingNote(endingId, note);
                  setSavedNote(note.trim());
                  setNoteSaved(true);
                  onNoteSaved?.();
                }}
                disabled={note.trim() === savedNote}
                className="shrink-0 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-default disabled:opacity-40 disabled:hover:scale-100"
              >
                {note.trim() === "" && savedNote !== "" ? "擦掉" : "写下"}
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/70">
              {noteSaved
                ? savedNote
                  ? "写好了。档案原样抄录，没有润色。"
                  : "这一行擦掉了——纸还在，字没了。"
                : "官方文本一个字不许改，页边可以。这一行只有你和档案看得到。"}
            </p>
          </div>
        )}

        <div className="mt-7 flex items-center justify-end gap-2">
          {/* 档案复印件（批次 CY-40）：纸上只有标题正文与页边批注，右下角盖蛙校章 */}
          <button
            type="button"
            data-export-ui="1"
            onClick={exportShot}
            disabled={shotState === "busy"}
            title="把这一页誊成一张档案图片存下来"
            className={clsx(
              "rounded-full border px-4 py-2.5 text-sm font-bold shadow-sm transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
              shotState === "done"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
            )}
          >
            {shotState === "busy" ? "正在誊…" : shotState === "done" ? "誊好了" : shotState === "failed" ? "这台设备不让存" : "存成图"}
          </button>
          <button
            type="button"
            data-export-ui="1"
            onClick={onClose}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
          >
            合上图鉴
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
