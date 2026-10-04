/**
 * 结局图鉴 · 医务室四张卡（批次 CY-133）
 * 把《病假条》里的四条真话各做成一张收藏卡：说出口的那句在前，收束语在背面。
 * 数据从剧本现解析（INFIRMARY_SCRIPT 里 silenceDelta ≤ 0 的选项），不手抄——改剧本卡片跟着变。
 * 收藏态读真话罐（addTruth 存的是选项原文），四张全收给专属判词。纯展示、零数值语义。
 */
import { useState } from "react";
import { clsx } from "clsx";
import { IdCard, ImageDown, Sparkles } from "lucide-react";
import { RichText } from "@/components/common/RichText";
import { INFIRMARY_SCRIPT } from "@/data/scripts/infirmary";
import { exportTruthCardAlbum, exportTruthCardPaper } from "@/lib/endingPaper";
import { playSfx } from "@/lib/audio";
import type { Choice } from "@/data/storylines";

/** 卡片序号 → 每张的主题章（纯装饰，不参与分档；随剧本真话选项数走，CY-132 第五幕加到第五张） */
const CARD_STAMPS = ["撑不住", "退了几只", "存根去哪儿", "蛙的话多", "收工的数"] as const;

/** 从剧本现解析四条真话：医务室线 silenceDelta ≤ 0 的选项，按幕序 */
function truthChoicesOf(): Choice[] {
  const out: Choice[] = [];
  for (const act of INFIRMARY_SCRIPT.acts) {
    for (const scene of act.scenes) {
      for (const choice of scene.choices ?? []) {
        if (choice.silenceDelta <= 0) out.push(choice);
      }
    }
  }
  return out;
}

interface TruthCardsSectionProps {
  /** 真话罐里的原文集合（跨周目保留；addTruth 按文案幂等去重） */
  jar: string[];
}

export function TruthCardsSection({ jar }: TruthCardsSectionProps) {
  const truths = truthChoicesOf();
  const jarSet = new Set(jar);
  const collected = truths.filter((choice) => jarSet.has(choice.text));
  const allCollected = truths.length > 0 && collected.length === truths.length;
  const [flipped, setFlipped] = useState<string | null>(null);

  /* 打包存图（批次 CY-138）：把说出口的那句誊成一张卡——说几张誊几张，没说的空着不誊 */
  const [exportState, setExportState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const exportBatch = async () => {
    if (exportState === "busy" || collected.length === 0) return;
    setExportState("busy");
    let allOk = true;
    for (const choice of collected) {
      const cardIndex = truths.findIndex((item) => item.id === choice.id) + 1;
      const ok = await exportTruthCardPaper({
        index: cardIndex,
        stamp: CARD_STAMPS[cardIndex - 1] ?? "收藏卡",
        text: choice.text,
        coda: choice.coda ?? "",
      });
      if (!ok) allOk = false;
      /* 页间留一口气，别让下载挤成一团 */
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    setExportState(allOk ? "done" : "failed");
    window.setTimeout(() => setExportState("idle"), allOk ? 2000 : 2500);
  };

  /* 拼成一本（批次 CY-140）：说出口的那几句拼进同一页——一本小册，一次下载 */
  const [albumState, setAlbumState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const exportAlbum = async () => {
    if (albumState === "busy" || collected.length === 0) return;
    setAlbumState("busy");
    const items = collected.map((choice) => {
      const cardIndex = truths.findIndex((item) => item.id === choice.id) + 1;
      return {
        index: cardIndex,
        stamp: CARD_STAMPS[cardIndex - 1] ?? "收藏卡",
        text: choice.text,
        coda: choice.coda ?? "",
      };
    });
    const ok = await exportTruthCardAlbum(items, truths.length);
    setAlbumState(ok ? "done" : "failed");
    window.setTimeout(() => setAlbumState("idle"), ok ? 2000 : 2500);
  };

  return (
    <section
      aria-label="医务室真话收藏卡"
      className="anim-fade-up rounded-3xl border border-border bg-card p-6 shadow-md md:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-black tracking-tight text-card-foreground">
            <IdCard size={18} className="text-primary" aria-hidden />
            医务室 · 收藏卡
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            《病假条》里说出口的真话，表上没有它们的栏。说一次，就有一张卡——不退，不编号，也不盖章。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {collected.length >= 1 && (
            <button
              type="button"
              data-export-ui="1"
              onClick={exportAlbum}
              disabled={albumState === "busy"}
              title="说出口的那几句拼进同一页，一本小册一次下载"
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
                albumState === "done"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              <IdCard size={12} aria-hidden />
              {albumState === "busy"
                ? "正在拼…"
                : albumState === "done"
                  ? "拼好了"
                  : albumState === "failed"
                    ? "没拼上"
                    : "拼成一本"}
            </button>
          )}
          {collected.length >= 1 && (
            <button
              type="button"
              data-export-ui="1"
              onClick={exportBatch}
              disabled={exportState === "busy"}
              title="说出口的那几句，一句誊一张卡存下来"
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
                exportState === "done"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              <ImageDown size={12} aria-hidden />
              {exportState === "busy"
                ? `正在誊 ${collected.length} 张…`
                : exportState === "done"
                  ? "都存好了"
                  : exportState === "failed"
                    ? "有几张没存上"
                    : "打包存图"}
            </button>
          )}
          <span
            className={clsx(
              "rounded-full px-3 py-1.5 text-xs font-bold",
              allCollected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
            )}
          >
            {collected.length}/{truths.length}
          </span>
        </div>
      </header>

      {allCollected && (
        <p className="anim-fade-up mt-4 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-card-foreground">
          <span className="font-bold text-primary">都齐了。</span>
          <RichText
            className="mt-1 text-sm leading-relaxed text-muted-foreground"
            text="这几句话不进册子，也不进台账。它们在你这儿——这间医务室里，只有你都说过。"
          />
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {truths.map((choice, index) => {
          const got = jarSet.has(choice.text);
          const isFlipped = flipped === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              onClick={() => {
                if (!got) return;
                playSfx("flip");
                setFlipped((prev) => (prev === choice.id ? null : choice.id));
              }}
              aria-label={got ? `收藏卡：${CARD_STAMPS[index]}（点开看收束语）` : `还没说出口的那句（第 ${index + 1} 张）`}
              className={clsx(
                "group relative flex min-h-32 flex-col overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200",
                got
                  ? "border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card shadow-md hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
                  : "border-dashed border-border bg-background/60",
              )}
            >
              {/* 卡角：序号与主题章 */}
              <div className="flex items-start justify-between gap-2">
                <span
                  className={clsx(
                    "rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-widest",
                    got ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  第 {index + 1} 张
                </span>
                <span className={clsx("text-xs font-bold", got ? "text-primary" : "text-muted-foreground/60")}>
                  {got ? CARD_STAMPS[index] : "？？？？"}
                </span>
              </div>

              {/* 卡面：真话原文；背面：收束语——翻面有一口气（key 换面重挂，入场 nw-flip-in） */}
              <div
                key={got ? (isFlipped ? "back" : "front") : "empty"}
                className="anim-flip-in mt-3 flex flex-1 flex-col"
              >
                {!got ? (
                  <>
                    <p className="flex items-center text-sm leading-relaxed text-muted-foreground/70">
                      还没说出口。走到那一句，说一次，卡就来了。
                    </p>
                    <p className="mt-auto pt-2 text-[10px] font-bold text-muted-foreground/60">没收 · 等一句话</p>
                  </>
                ) : isFlipped ? (
                  <>
                    <p className="text-sm font-bold leading-relaxed text-card-foreground">
                      <RichText text={choice.coda ?? "——"} />
                    </p>
                    <p className="mt-auto pt-2 text-[10px] font-bold text-muted-foreground">
                      背面 · 收束语 · 点一下翻回去
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold leading-relaxed text-card-foreground">
                      <RichText text={choice.text} />
                    </p>
                    <p className="mt-auto pt-2 text-[10px] font-bold text-primary/80">正面 · 点一下看收束语</p>
                  </>
                )}
              </div>

              {allCollected && got && (
                <Sparkles size={14} className="pointer-events-none absolute right-3 bottom-3 text-primary/40" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        卡片存在真话罐里：跨学期保留，重开一学期也不会收回。说出口的那一句才是卡——选了别的，这一张就还空着。
      </p>
    </section>
  );
}
