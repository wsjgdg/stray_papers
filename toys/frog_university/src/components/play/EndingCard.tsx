/**
 * 结局卡：普通线的结局独白 / 湖边隐藏线的全篇大结局
 * 大结局按沉默值三档展示湖边夜谈五蛙的不同表情；
 * 全员真话达成时叠加收束徽标，并标注离真心最近的一只蛙。
 */
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ScrollText, Stamp } from "lucide-react";
import { loadTheme } from "@/lib/gameSave";
import { playSe } from "@/lib/audio";
import { CgArt } from "@/components/play/CgArt";
import { EndingSettlementPlate } from "@/components/play/EndingSettlementPlate";
import { FROG_BY_CHARACTER, type FrogExpression } from "@/components/frog/Frog";
import { REGULAR_LINE_IDS, storylineById, type Ending } from "@/data/storylines";
import type { EndingPlate } from "@/data/scenePlates";
import { bulletinReviewOf, impressionTierOf } from "@/lib/impression";
import type { ClosestFrog } from "@/pages/Play/usePlay";
import { RichText } from "@/components/common/RichText";

/** 湖边夜谈的五蛙同框（大结局立绘按它取，不随新扩线增员） */
const LAKE_CAST_IDS = storylineById("lake")?.castIds ?? [];

/** 三档结局对应的五蛙表情 */
const FINALE_EXPRESSIONS: FrogExpression[][] = [
  ["laugh", "laugh", "smile", "smile", "laugh"],
  ["smile", "frozen", "smile", "silent", "frozen"],
  ["silent", "silent", "frozen", "silent", "silent"],
];

/** 结算音三连（批次 CY-127）：按档位索引取——真话档 / 转述档 / 沉默档 */
const SETTLE_SE_BY_TIER = ["se-settle-truth", "se-settle-relay", "se-settle-silence"] as const;

/** 学期序号转中文小标（大结局徽标与档案补记共用） */
const SEMESTER_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
function semesterLabel(playthrough: number): string {
  const n = Math.max(1, Math.round(playthrough));
  return n <= SEMESTER_NUMERALS.length ? `第${SEMESTER_NUMERALS[n - 1]}学期` : `第 ${n} 学期`;
}

/** 档案注意记录三档（被注意值 0–2 / 3–7 / 8+；三档通用，不按结局分岔） */
const ATTENTION_RECORD_LINES = [
  "档案里没有你额外的事——两页纸就写完了。",
  "收发登记上，你的名字出现过；没排上号。",
  "有一叠摘录按日期排好，页脚编了号，最上面一页是你的学号。",
] as const;

function attentionRecordOf(attention: number): string {
  if (attention >= 8) return ATTENTION_RECORD_LINES[2];
  if (attention >= 3) return ATTENTION_RECORD_LINES[1];
  return ATTENTION_RECORD_LINES[0];
}

interface EndingCardProps {
  ending: Ending;
  endingTier: number;
  isFinale: boolean;
  totalSilence: number;
  doneCount: number;
  lakeUnlocked: boolean;
  /** 当前第几个学期（大结局徽标与档案补记共用；不再写死「第一学期」） */
  playthrough: number;
  /** 二周目档案补记（Ending.plus；playthrough ≥ 2 才传入） */
  plusText?: string;
  /** 三周目免检批注（Ending.thirdNote；playthrough ≥ 3 才传入，排在档案补记之下） */
  thirdNoteText?: string;
  /** 岔路收束：本学期在这条线上走过的支路收束语（为空则不显示区块） */
  branchCodas?: string[];
  /** 湖边全员真话收束段已播放 */
  finaleCoda?: boolean;
  /** 离真心最近的一只 NPC 蛙 */
  closestFrog?: ClosestFrog | null;
  /** 印象分（0-100）：公示栏评语按它分五档 */
  impressionPercent: number;
  /** 被注意值：按 0–2 / 3–7 / 8+ 三档追加「档案注意记录」（结局分档不受它影响） */
  attention: number;
  /** 结局定格（批次 J）：线级结局 CG（Script.endingCg）；缺省 = 该线未配，不显示 ED 块 */
  endingCg?: string;
  /** 片尾文案（批次 K）：按线查表，与 endingCg 同时配齐才显示 ED 块 */
  endingPlate?: EndingPlate;
  /** 蛙的生物学（批次 AH）：这一学期的生物学台账——「声音」/ 冬眠次数 / 蜕皮层数 */
  biologyLedger?: { calls: number; hibernations: number; molts: number };
  /** 已收（批次 AW）：这份结局之前就解锁过——重复提交不另起一格，柜子只说「已收到」 */
  repeatSeen?: boolean;
  /** 替它走这一趟（批次 BC）：本学期替某只蛙走的这条线——档案上写的还是你的名字 */
  substituteName?: string | null;
  /** 冬眠（批次 AH）：结局之后的出口——不参与；数值照清，档案写「该蛙冬眠期间无记录」 */
  onHibernate?: () => void;
  /** 蜕一层皮（批次 AH）：结局之后的出口——数值清空，旧皮留柜（可穿回） */
  onShedSkin?: () => void;
  onBackMap: () => void;
  onBackHome: () => void;
}

export function EndingCard({
  ending,
  endingTier,
  isFinale,
  totalSilence,
  doneCount,
  lakeUnlocked,
  playthrough,
  plusText,
  thirdNoteText,
  branchCodas,
  finaleCoda = false,
  closestFrog = null,
  impressionPercent,
  attention,
  endingCg,
  endingPlate,
  biologyLedger,
  repeatSeen = false,
  substituteName = null,
  onHibernate,
  onShedSkin,
  onBackMap,
  onBackHome,
}: EndingCardProps) {
  const tier = Math.min(Math.max(endingTier, 0), 2);
  const isBureauEnding = ending.id.startsWith("xg-");
  /* 落章（批次 CY-80）：卡滑进来半秒后，右上角盖下这一学期的结办章——盖章声同一拍 */
  const [themeId] = useState(() => loadTheme());
  useEffect(() => {
    const timer = window.setTimeout(() => {
      playSe(themeId === "cream" ? "se-stamp-cream" : themeId === "candy" ? "se-stamp-candy" : "se-stamp-paper");
    }, 700);
    /* 结算音（批次 CY-127，CY-128 校成同拍）：处置单红章动画 1200ms 落定，档位音与它同一毫秒起——
       口径对齐 700ms 办结章（音画同拍），三种收档声按档位取 */
    let settleTimer: number | undefined;
    if (ending.settlement) {
      settleTimer = window.setTimeout(() => {
        playSe(SETTLE_SE_BY_TIER[tier]);
      }, 1200);
    }
    return () => {
      window.clearTimeout(timer);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
    };
  }, [themeId, tier, ending.settlement]);
  const expressions = FINALE_EXPRESSIONS[tier];
  const impressionLabel = impressionTierOf(impressionPercent).label;
  const bulletinReview = bulletinReviewOf(impressionPercent);

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-background/90 p-5 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center">
        <div className="relative w-full max-w-xl animate-in rounded-3xl border border-border bg-card p-5 text-center shadow-2xl fade-in slide-in-from-bottom-4 duration-500 sm:p-8">
          {/* 结办章（批次 CY-80）：线完结盖「办结」，全篇完结盖「礼成」——卡站稳那一刻落章 */}
          <span
            aria-hidden
            className="anim-stamp pointer-events-none absolute right-4 top-4 z-10 inline-block rounded border-2 border-destructive/70 px-2.5 py-1 text-sm font-bold tracking-widest text-destructive"
            style={{ animationDelay: "700ms" }}
          >
            {isFinale ? "礼成" : "办结"}
          </span>
          {isFinale ? (
            <div>
              <div className="mb-4 flex items-end justify-center" aria-hidden>
                {LAKE_CAST_IDS.map((characterId, i) => {
                  const FrogSprite = FROG_BY_CHARACTER[characterId];
                  if (!FrogSprite) return null;
                  return <FrogSprite key={characterId} size={i === 2 ? 84 : 64} expression={expressions[i]} />;
                })}
              </div>
              <span className="inline-block rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground">
                全篇完结 · 奶蛙大学 {semesterLabel(playthrough)}
              </span>
              {finaleCoda && (
                <p className="mt-3 inline-block rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground">
                  全员真话达成 · 原来我们都在装，谢谢你没有拆穿
                </p>
              )}
            </div>
          ) : (
            <div>
              <span className="inline-block rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground">
                剧情线完结
              </span>
              {!lakeUnlocked && (
                <p className="mt-3 text-xs font-bold text-muted-foreground">
                  常规线进度 {doneCount}/{REGULAR_LINE_IDS.length} —— 集齐{REGULAR_LINE_IDS.length}
                  条常规线，湖边夜谈就会醒过来
                </p>
              )}
            </div>
          )}

          {/* 结局名升为全场最重的一行（批次 CY-78）：这一屏其余都是按语，只有它=title */}
          <h2 className="mt-5 text-3xl font-black tracking-tight text-card-foreground">{ending.title}</h2>
          {/* 结算画面（批次 CY-124）：配了 settlement 的结局才有——目前行政楼线三档 */}
          <EndingSettlementPlate ending={ending} totalSilence={totalSilence} />
          {/* 批次 W 结局排版：行政楼结局走公文格式（抬头 / 文号 / 首行缩进 / 落款）；
              沉默越高的档位字距行距越稀疏——档案把那学期写薄了 */}
          {isBureauEnding ? (
            <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4 text-left">
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground">
                奶蛙大学学工处 · 内部文件
              </p>
              <p className="mt-1 font-mono text-[10px] font-bold tracking-widest text-muted-foreground/80">
                卷号 {ending.id} · 归档于第 {playthrough} 学期
              </p>
              <RichText className="mt-3 indent-8 text-base leading-loose tracking-[0.04em] text-muted-foreground" text={ending.text} />
              <p className="mt-4 text-right text-[10px] font-bold tracking-widest text-muted-foreground">
                学工处 · 第 {playthrough} 学期 · 结
              </p>
            </div>
          ) : (
            <RichText
              className={clsx(
                "mt-4 text-left text-base text-muted-foreground",
                tier >= 2 ? "leading-loose tracking-[0.05em]" : tier === 0 ? "leading-relaxed" : "leading-loose",
              )}
              text={ending.text}
            />
          )}

          {branchCodas && branchCodas.length > 0 && (
            <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-4 text-left">
              <p className="text-xs font-bold tracking-widest text-muted-foreground">这学期你走过的岔路</p>
              <ul className="mt-2 space-y-1.5">
                {branchCodas.map((coda, i) => (
                  <li key={`${i}-${coda.slice(0, 6)}`} className="text-sm leading-relaxed text-card-foreground">
                    · {coda}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 档案注意记录：被注意值三档（0–2 / 3–7 / 8+），档案腔小字，与结局分档无关 */}
          <div className="mt-4 text-left">
            <p className="text-xs font-bold tracking-widest text-muted-foreground">档案注意记录</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {attentionRecordOf(attention)}
            </p>
          </div>

          <p className="mt-6 inline-block rounded-full bg-muted px-4 py-1.5 text-xs font-bold text-muted-foreground">
            全程累计沉默值 {totalSilence}
          </p>
          {closestFrog && (
            <p className="mt-3 text-xs font-bold text-muted-foreground">
              离真心最近的蛙：{closestFrog.name} · {closestFrog.tierLabel}（{closestFrog.percent}%）
            </p>
          )}

          <div className="mt-6 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 text-left">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-primary">
              <ScrollText size={13} />
              校园公示栏 · 印象分 {impressionPercent} · {impressionLabel}
            </p>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-card-foreground">「{bulletinReview}」</p>
          </div>

          {plusText && (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-left">
              <p className="text-xs font-bold tracking-widest text-muted-foreground">
                {semesterLabel(playthrough)} · 档案补记
              </p>
              <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={plusText} />
            </div>
          )}

          {thirdNoteText && (
            <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4 text-left">
              <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground">
                <Stamp size={13} aria-hidden />
                第三学期 · 免检批注
              </p>
              <RichText className="mt-2 text-sm leading-relaxed text-muted-foreground" text={thirdNoteText} />
            </div>
          )}

          {/* 已收（批次 AW）：重复提交的结局不再另起一格——连你的重复都是流程的一部分 */}
          {repeatSeen && (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-background/60 p-3 text-left">
              <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground">
                <Stamp size={13} aria-hidden />
                已收到
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                这份结局之前就交过。重复提交按「已收」计，不再另起一格——你重复走过的路，柜子不再数。
                连你的重复，都是流程的一部分。
              </p>
            </div>
          )}

          {/* 替它走这一趟（批次 BC「替换」）：你走了别人的路，档案写你的名字 */}
          {substituteName && (
            <div className="mt-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-3 text-left">
              <p className="text-xs font-bold tracking-widest text-primary">代走 · 已办</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                这一趟是替{substituteName}走的。它的名字在备注里，你的名字在署名处——剧情照走，档案照记，
                档案上写的是你的名字。{substituteName}自己的那条线，这一学期换了一种走法——它走的时候，替的是谁？
              </p>
            </div>
          )}

          {/* ED（批次 J 起，批次 K 按线查表）：线级结局定格 + 收尾 staff；endingCg 与文案表都配齐才显示 */}
          {endingCg && endingPlate && (
            <div className="mt-6 rounded-2xl border border-border bg-background/60 p-4 text-left">
              <CgArt id={endingCg} className="overflow-hidden rounded-xl" />
              <RichText className="mt-3 text-center text-sm font-bold tracking-widest text-card-foreground" text={endingPlate.label} />
              <div className="mt-2 space-y-0.5 text-center text-[11px] leading-relaxed text-muted-foreground">
                {endingPlate.staff.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* 蛙的生物学（批次 AH）：结局之后的两个出口——不是读档，也不是开新档：
              冬眠把这一学期挂进柜子背面（档案记「无记录」），蜕皮把这一层蜕下来（旧皮可以穿回） */}
          {onHibernate && onShedSkin && (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-background/60 p-4 text-left">
              <p className="text-xs font-bold tracking-widest text-muted-foreground">蛙的生物学 · 学期出口</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                这个学期归档了。你还可以选择不参与：把这一学期挂起来（冬眠），或者把这一层蜕下来（旧皮会留在柜子里）。
              </p>
              {biologyLedger && (
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground/80">
                  声音 {biologyLedger.calls} · 冬眠 {biologyLedger.hibernations} 次 · 蜕皮 {biologyLedger.molts} 层
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onHibernate}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  冬眠——跳过一学期
                </button>
                <button
                  type="button"
                  onClick={onShedSkin}
                  className="rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  蜕一层皮——旧皮留柜
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {isFinale ? (
              <button
                type="button"
                onClick={onBackHome}
                className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
              >
                回标题画面
              </button>
            ) : (
              <button
                type="button"
                onClick={onBackMap}
                className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
              >
                回校园地图
              </button>
            )}
            <button
              type="button"
              onClick={isFinale ? onBackMap : onBackHome}
              className="rounded-full border border-border bg-card px-5 py-3 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
            >
              {isFinale ? "再去校园逛逛" : "回标题画面"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
