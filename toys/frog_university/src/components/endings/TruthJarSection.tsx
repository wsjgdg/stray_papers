/**
 * 结局图鉴 · 真话罐区块
 * 收录玩家跨周目说过的全部真话（沉默值不涨反跌的那些选择），按剧情线分组。
 * 空罐与集齐各有专属文案，语气跟全剧一致：克制，不哭腔。
 * 教材（批次 BF）：罐里的某一句会被制成标语——不带引号，看起来像学校自己说的。
 */
import { useState } from "react";
import { ImageDown, MessagesSquare, Sparkles } from "lucide-react";
import { seedRandom } from "@/lib/calendar";
import { exportTruthJarPaper } from "@/lib/endingPaper";
import type { TruthJarGroup } from "@/lib/impression";

interface TruthJarSectionProps {
  groups: TruthJarGroup[];
  collected: number;
  total: number;
  complete: boolean;
  /** 消迹（批次 CF）：被抽走的句数——计数还在，内容没了 */
  taken?: number;
  /** 天气种子（批次 BF）：同一颗种子同一句被制成标语 */
  seed?: number;
}

export function TruthJarSection({ groups, collected, total, complete, taken = 0, seed = 0 }: TruthJarSectionProps) {
  const filled = groups.filter((group) => group.texts.length > 0);
  const missing = Math.max(0, total - collected);
  /* 标语（批次 BF）：罐中第 N 句被制成标语——你的话成了它的声音 */
  const sloganIndex = Math.floor(seedRandom((Math.round(seed) % 1000000) * 389 + 71) * Math.max(collected, 1));
  let seen = -1;
  const sloganText = (() => {
    for (const group of filled) {
      for (const text of group.texts) {
        seen += 1;
        if (seen === sloganIndex) return text;
      }
    }
    return null;
  })();

  /* 存图（批次 CY-142）：把罐里说出口的真话按线誊成一页罐面——空罐不誊 */
  const [jarExport, setJarExport] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const exportJar = async () => {
    if (jarExport === "busy" || collected <= 0) return;
    setJarExport("busy");
    const ok = await exportTruthJarPaper(
      groups.map((group) => ({ lineTitle: group.lineTitle, texts: group.texts })),
      collected,
      total,
      taken,
    );
    setJarExport(ok ? "done" : "failed");
    window.setTimeout(() => setJarExport("idle"), ok ? 2000 : 2500);
  };

  return (
    <section
      aria-label="真话罐"
      className="anim-fade-up rounded-3xl border border-border bg-card p-6 shadow-md md:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-black tracking-tight text-card-foreground">
            <MessagesSquare size={18} className="text-primary" aria-hidden />
            真话罐
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            沉默值不涨反跌的那些选择，会自动收进这里。开新档也清不掉。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {collected >= 1 && (
            <button
              type="button"
              data-export-ui="1"
              onClick={exportJar}
              disabled={jarExport === "busy"}
              title="罐里说出口的真话按线誊成一页罐面"
              className={
                jarExport === "done"
                  ? "inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"
                  : "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary disabled:cursor-wait"
              }
            >
              <ImageDown size={12} aria-hidden />
              {jarExport === "busy"
                ? "正在誊…"
                : jarExport === "done"
                  ? "存好了"
                  : jarExport === "failed"
                    ? "没存上"
                    : "存图"}
            </button>
          )}
          <span
            className={
              collected > 0
                ? "rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
                : "rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground"
            }
          >
            {collected}/{total} 句
          </span>
        </div>
      </header>

      {collected === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border bg-muted/40 px-5 py-8 text-center text-sm leading-relaxed text-muted-foreground">
          罐子还空着。一条真话都还没有。
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          {filled.map((group) => (
            <div key={group.lineTitle}>
              <p className="flex items-baseline gap-2 text-sm font-bold text-card-foreground">
                {group.lineTitle}
                <span className="text-xs font-medium text-muted-foreground">
                  {group.texts.length}/{group.total}
                </span>
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {group.texts.map((text) => (
                  <li key={text} className="flex flex-col gap-1 text-sm leading-relaxed text-card-foreground/90">
                    <span className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      {text}
                    </span>
                    {text === sloganText && (
                      <span className="ml-3.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-1 text-[10px] leading-relaxed text-primary/80">
                        已制成标语 · 贴在食堂。不带引号——看起来像学校自己说的。你的话成了它的声音。
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {missing > 0 && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              还没说出口的真话，还有 {missing} 句。
            </p>
          )}
          {taken > 0 && (
            <p className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              计数照旧（{collected} 句都在罐里），但有 {taken} 句从档案里没了——不在这个报告里。上学期的那一页还在，旧皮上也在。像它没被写过。
            </p>
          )}
        </div>
      )}

      {complete && (
        <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
            <Sparkles size={13} />
            罐满
          </p>
          <p className="mt-3 text-base leading-relaxed text-card-foreground">
            你把所有真话都说完了。游戏里做不到的事。
          </p>
        </div>
      )}
    </section>
  );
}
