/**
 * 结局图鉴 · 词义册（批次 AV「语言本身」之一）
 * 同一个词，在不同角色嘴里意思不同——「已老实」在食堂是顺从，在行政楼是合格，
 * 在湖边是投降，在深夜约谈室是证据。收集够了，可以说一次：词义作为武器。
 */
import { useState } from "react";
import { ImageDown, Languages } from "lucide-react";
import { clsx } from "clsx";
import { RichText } from "@/components/common/RichText";
import { exportWordBookPaper } from "@/lib/endingPaper";

/** 一条释义：同一句话在哪个场合、是什么意思 */
interface WordDef {
  id: string;
  place: string;
  meaning: string;
  text: string;
  /** 说出去之后的反应（收集满四条才能说） */
  reaction: string;
  /** 还没收集到时的条件提示（不剧透释义） */
  hint: string;
}

const WORD_DEFS: WordDef[] = [
  {
    id: "canteen",
    place: "食堂",
    meaning: "顺从",
    text: "勺背刮锅边的那一下：表示有分寸，不会多给。在食堂，「已老实」是一种打饭的手势。",
    reaction: "你对着最近的一个窗口说了。勺背在锅边刮了一下——有分寸，不会多给。你们都听懂了：这句是排给你的。",
    hint: "在打饭的窗口听一次",
  },
  {
    id: "administration",
    place: "行政楼",
    meaning: "合格",
    text: "评价贴最高等级的再往上一级——没有更高一级了。在行政楼，「已老实」是一枚章。",
    reaction: "窗口后面的蛙停了一下，在单子上写了一个字。你没有被追问——合格的话不需要追问。行政楼沉默了。",
    hint: "在学工办的窗口听一次",
  },
  {
    id: "lake",
    place: "湖边",
    meaning: "投降",
    text: "不是向谁投降，是向那句「那你是谁」投降。在湖边，「已老实」是把最后一句也咽回去。",
    reaction: "湖边没有窗口。你说给湖听。勺子停了半秒——那半秒不是食堂的，是湖的。湖记住了，湖不归档。",
    hint: "在湖边的夜谈听一次",
  },
  {
    id: "night",
    place: "约谈室",
    meaning: "证据",
    text: "你说过的每一句都摊开在桌上。在约谈室，「已老实」是结案陈词。",
    reaction: "你说给名单听。从这一刻起，这句话在档案里的颜色不一样了——它从陈述变成了结案。",
    hint: "在深夜的约谈里听一次",
  },
];

interface WordSectionProps {
  /** 已收集到的释义 id（按完成线与约谈记录派生） */
  collected: string[];
  /** 本学期是否已经说过一次 */
  wordSaid: boolean;
  /** 说一次（落档；每学期一次） */
  onSay: () => boolean;
}

export function WordSection({ collected, wordSaid, onSay }: WordSectionProps) {
  const [saidDef, setSaidDef] = useState<string | null>(null);
  const [saidError, setSaidError] = useState(false);
  /* 存图（批次 CY-143）：把翻到的那几条释义誊成一页词卡——一条没翻到时不给按 */
  const [exportState, setExportState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const exportWordBook = async () => {
    if (exportState === "busy" || collected.length === 0) return;
    setExportState("busy");
    const entries = WORD_DEFS.filter((item) => collected.includes(item.id)).map((item) => ({
      place: item.place,
      meaning: item.meaning,
      text: item.text,
    }));
    const ok = await exportWordBookPaper(entries, Math.max(0, WORD_DEFS.length - entries.length), wordSaid);
    setExportState(ok ? "done" : "failed");
    window.setTimeout(() => setExportState("idle"), ok ? 2000 : 2500);
  };
  const complete = collected.length >= WORD_DEFS.length;
  const said = WORD_DEFS.find((item) => item.id === saidDef) ?? null;
  return (
    <section aria-label="词义册" className="rounded-3xl border border-border bg-card p-5 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground">
          <Languages size={14} aria-hidden />
          词义册 · 同一个词
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {collected.length >= 1 && (
            <button
              type="button"
              data-export-ui="1"
              onClick={exportWordBook}
              disabled={exportState === "busy"}
              title="翻到的那几条释义誊成一页词卡"
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
                exportState === "done"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              <ImageDown size={12} aria-hidden />
              {exportState === "busy"
                ? "正在誊…"
                : exportState === "done"
                  ? "存好了"
                  : exportState === "failed"
                    ? "没存上"
                    : "存图"}
            </button>
          )}
          <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
          {collected.length}/{WORD_DEFS.length}
        </span>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        「已老实」不是一个词——是四句不同的话。它在每个场合是什么意思，要在那个场合听过才知道。
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {WORD_DEFS.map((def) => {
          const got = collected.includes(def.id);
          return (
            <li
              key={def.id}
              className={clsx(
                "rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                got ? "border-primary/40 bg-primary/5" : "border-dashed border-border bg-card/60",
              )}
            >
              <p className="flex items-center justify-between gap-2">
                <span className={clsx("text-sm font-bold", got ? "text-primary" : "text-muted-foreground")}>
                  {got ? `「已老实」· ${def.place}` : def.place}
                </span>
                {got && (
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {def.meaning}
                  </span>
                )}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {got ? def.text : `释义未收集：${def.hint}。`}
              </p>
            </li>
          );
        })}
      </ul>

      {/* 说一次（批次 AV）：这不是对话选项——这是词义作为武器 */}
      {complete && !wordSaid && !said && (
        <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-bold text-primary">四个释义都齐了。现在可以说一次。</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            词还是那个词——释义由你挑。这不是对话选项，这是词义作为武器。每学期只能说一次。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {WORD_DEFS.map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => {
                  if (!onSay()) {
                    setSaidError(true);
                    return;
                  }
                  setSaidDef(def.id);
                }}
                className="rounded-full border border-primary/40 bg-card px-3.5 py-1.5 text-xs font-bold text-primary transition-colors duration-200 hover:bg-primary/10 focus-visible:shadow-focus focus-visible:outline-none"
              >
                用{def.place}的释义说
              </button>
            ))}
          </div>
          {saidError && (
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              本学期已经说过了——说过的话不收回，学期照常。
            </p>
          )}
        </div>
      )}
      {said && (
        <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-bold text-primary">你说了。用词：{said.meaning}（{said.place}）</p>
          <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={said.reaction} />
          <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
            该蛙用「已老实」回应了一次。用词：{said.meaning}（{said.place}）。
          </p>
        </div>
      )}
      {complete && wordSaid && !said && (
        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          本学期说过了。释义还在册子里——学期不会重置你听懂的东西。
        </p>
      )}
      {!complete && (
        <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground/70">
          收集满四条释义，可以说一次——用哪个场合的意思，由你决定。
        </p>
      )}
    </section>
  );
}
