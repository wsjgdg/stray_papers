/**
 * 校园地图 · 账台（批次 AJ / AL / AO）：被记录的社会面——借沉默（带利息）/ 替人背档案 / 申请重置 / 消耗沉默。
 * 这四个动作都不在流程里：流程里没有「借」「替」「忘」「交」这四栏，所以它们发生在窗口边上。
 * 借沉默——当场扣，下一次深夜事件连本带息还（沉默是会生息的）。
 * 替人背档案——把别人的记录认到自己名下：被注意值 +2，他从此不进档。
 * 申请重置——把自己从名单上拿下来：盖章收 3 点沉默，被注意值清零，档案留一行「该蛙已被重置」。
 * 消耗沉默——把攒下的沉默交出去：沉默 −3，名单上那一笔淡一点（被注意值 −2）。记录员不问原因。
 */
import { useState } from "react";
import { ArrowLeftRight, BookUser, Coins, FileSignature, HandCoins } from "lucide-react";
import { seedRandom } from "@/lib/calendar";
import { RichText } from "@/components/common/RichText";

export type LedgerDeskKind = "borrow" | "carry" | "reset" | "spend" | "swap";

/** 出借的口径：借 3 还 4——多出来的 1 点是利息（沉默是会生息的） */
const LOAN_AMOUNT = 3;
const LOAN_REPAY = 4;

/** 出借的蛙（按种子派生，同一局同一天恒定）：三只蛙各有一个要安静的理由 */
const LENDERS: Array<{ name: string; line: string }> = [
  { name: "灰灰", line: "「这周我不想说话。借我三点，下周还你四点——多出来的一点，算利息。」" },
  { name: "再再", line: "「背书要静。借我三点，还你四点。多的那点不是谢礼，是利息——账要能算得清。」" },
  { name: "干饭叔", line: "「窗口排队的声音太吵。借三点，还四点。公示过的量，利息不在里面。」" },
];

/** 来求代签的（按种子派生）：学工办的窗口今天得有人认领 */
const REQUESTERS: Array<{ name: string; line: string }> = [
  { name: "格格", line: "格格把一张单子从窗口推出来：「有一份记录不在名单上，得有人认。你替他背了，你的名单加一笔；他不进档。」" },
  { name: "窗口后面的蛙", line: "学工办窗口今天换了个流程：有一份不在名单上的记录，得有人认领。认领人一栏空着。" },
];

/** 申请重置（批次 AL）：格格把表推过来——把自己从名单上拿下来，要先保证不再说真话 */
const RESET_LINE =
  "格格把一张表从窗口推出来：「要把自己从名单上拿下来，得走一个流程，流程的名字叫重置。填一张表：你保证不再说真话。填完，名单上就没有你了——不是原谅，是格式化。盖章要 3 点沉默。」";

/** 消耗沉默（批次 AO）：窗口后面的蛙收走你的沉默，在单子上画一个数——流程里没有「为什么」这一栏 */
const SPEND_LINE =
  "窗口后面的蛙把你的沉默收走，在单子上画了一个数。没有问为什么——流程里没有「为什么」这一栏。交出去之后，名单上那一笔淡了一点：你终于开口说话了，所以没人再盯着你。";

/** 换位申请（批次 BC）：窗口后面的蛙有一份「位置对调」的表——流程里居然一直有这一栏 */
const SWAP_LINE =
  "窗口后面的蛙从抽屉里翻出一张压得很平的表：「位置对调申请。流程里有这一栏——用得少，但一直有。填了它，这一学期你和某只蛙交换位置：它走你的线，你走它的线。一学期后换回来，档案照记。」";

interface LedgerDeskOverlayProps {
  kind: LedgerDeskKind;
  /** 种子（天气种子 + 天数）：同一局同一天，来找你的总是同一只蛙 */
  seed: number;
  silenceValue: number;
  /** 当前出借中的金额（>0 = 有一笔在路上，不能再借） */
  loanOut: number;
  carriedCount: number;
  /** 今天已经背过一份（每天最多一次） */
  carriedToday: boolean;
  /** 被注意值（批次 AL）：≥8 才在名单上，名单上的蛙才能申请重置 */
  attention: number;
  /** 已被重置的次数（档案在数） */
  resetsCount: number;
  /** 主动消耗沉默的累计点数（批次 AO） */
  spentCount: number;
  /** 今天已经交出过一次（每天最多一次） */
  spentToday: boolean;
  /** 换位申请的累计次数（批次 BC） */
  swapsCount: number;
  onLend: (amount: number, repay: number) => boolean;
  onCarry: () => boolean;
  onReset: () => boolean;
  onSpend: () => boolean;
  /** 换位申请（批次 BC）：与某只蛙交换位置一学期——你体验了别人的档案，但你的档案还在 */
  onSwap: () => boolean;
  onClose: () => void;
}

export function LedgerDeskOverlay({
  kind,
  seed,
  silenceValue,
  loanOut,
  carriedCount,
  carriedToday,
  attention,
  resetsCount,
  spentCount,
  spentToday,
  swapsCount,
  onLend,
  onCarry,
  onReset,
  onSpend,
  onSwap,
  onClose,
}: LedgerDeskOverlayProps) {
  const [result, setResult] = useState<string | null>(null);
  const lender = LENDERS[Math.floor(seedRandom(seed * 41 + 7) * LENDERS.length) % LENDERS.length];
  const requester = REQUESTERS[Math.floor(seedRandom(seed * 59 + 3) * REQUESTERS.length) % REQUESTERS.length];
  const canLend = loanOut <= 0 && silenceValue >= LOAN_AMOUNT;
  const RESET_COST = 3;
  const SPEND_COST = 3;
  const ledgerLine = `已背档案 ${carriedCount} 份 · 已重置 ${resetsCount} 次 · 累计交出 ${spentCount} 点 · 出借中 ${loanOut} 点 · 现有沉默 ${silenceValue}`;

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label={kind === "borrow" ? "借沉默" : kind === "carry" ? "替人背档案" : kind === "reset" ? "申请重置" : "消耗沉默"}
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            {kind === "borrow" ? (
              <Coins size={13} aria-hidden />
            ) : kind === "carry" ? (
              <BookUser size={13} aria-hidden />
            ) : kind === "reset" ? (
              <FileSignature size={13} aria-hidden />
            ) : kind === "swap" ? (
              <ArrowLeftRight size={13} aria-hidden />
            ) : (
              <HandCoins size={13} aria-hidden />
            )}
            学工办窗口边 · 流程里没有的那一栏
          </p>

          {result ? (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={result} />
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  合上台面
                </button>
              </div>
            </>
          ) : kind === "borrow" ? (
            <>
              <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">借沉默</h2>
              {loanOut > 0 ? (
                <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                  你已经借出去一笔：{loanOut} 点在路上。还回来之前，这一栏不再受理第二笔——柜子按「一蛙一账」记账。
                </p>
              ) : !canLend ? (
                <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                  余额不足：沉默值不足 {LOAN_AMOUNT} 点，借不出去。这一格要先攒够你自己的。
                </p>
              ) : (
                <>
                  <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={lender.line} />
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    口径：当场扣 {LOAN_AMOUNT} 点，下一次深夜事件连本带息还 {LOAN_REPAY} 点。到期日写在柜子里；还回来之前，你的沉默值先薄一层。
                  </p>
                </>
              )}
              {!result && canLend && (
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    不借
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!onLend(LOAN_AMOUNT, LOAN_REPAY)) return;
                      setResult(
                        `借出去了。柜子里多了一行：出借沉默 ${LOAN_AMOUNT} 点，利息 1 点，到期日——下一次深夜事件。`,
                      );
                    }}
                    className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    借出去
                  </button>
                </div>
              )}
              {!result && !canLend && (
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    合上台面
                  </button>
                </div>
              )}
            </>
          ) : kind === "carry" ? (
            <>
              <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">替人背档案</h2>
              {carriedToday ? (
                <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                  今天已经背过一份了。柜子一天只办一件不在流程里的事——明天它还会来问。
                </p>
              ) : (
                <>
                  <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={requester.line} />
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    口径：被注意值 +2，名单上多一笔——不是他的，是你的。他从此不进档。这一栏不记次数以外的任何东西。
                  </p>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      不背
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = onCarry();
                        if (next === null) return;
                        setResult(
                          `背了。档案记下一行：该蛙替他背了一份。名单上多了一笔——从此那一笔，两个人分。（已背 ${next} 份）`,
                        );
                      }}
                      className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      背了
                    </button>
                  </div>
                </>
              )}
              {carriedToday && (
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    合上台面
                  </button>
                </div>
              )}
            </>
          ) : kind === "reset" ? (
            <>
              <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">申请重置</h2>
              {attention < 8 ? (
                <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                  你不在名单上。重置是给名单上的蛙办的——名单上的名字才需要被格式化。
                </p>
              ) : silenceValue < RESET_COST ? (
                <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                  余额不足：盖章要 {RESET_COST} 点沉默。你现在的沉默值不够按这个章——先攒够，再来把自己买下来。
                </p>
              ) : (
                <>
                  <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={RESET_LINE} />
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    口径：盖章收 {RESET_COST} 点沉默，被注意值清零，档案里多一行「该蛙已被重置」（这是第 {resetsCount + 1} 次）。
                    名单上的名字没了——但重置的次数，档案也在数。
                  </p>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      再想想
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!onReset()) return;
                        setResult(
                          `申请收下了。名单上没有你了。档案里多了一行：该蛙已被重置（第 ${resetsCount + 1} 次）。重置不是原谅——是格式化。`,
                        );
                      }}
                      className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      盖章
                    </button>
                  </div>
                </>
              )}
              {(attention < 8 || silenceValue < RESET_COST) && (
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    合上台面
                  </button>
                </div>
              )}
            </>
          ) : kind === "spend" ? (
            <>
              <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">消耗沉默</h2>
              {spentToday ? (
                <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                  今天已经交出过一次了。沉默一天只收一笔——明天它还会收。
                </p>
              ) : attention <= 0 ? (
                <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                  名单上那一笔已经很淡了（被注意值归零）。交出去的沉默没有淡的东西可换——攒着吧。
                </p>
              ) : silenceValue < SPEND_COST ? (
                <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                  余额不足：交出去的沉默一次收 {SPEND_COST} 点。你现在攒下的不够交。
                </p>
              ) : (
                <>
                  <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={SPEND_LINE} />
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    口径：沉默值 −{SPEND_COST}，被注意值 −2。攒下的沉默不是存款利息——是你自己的。交出去，场景里的空会淡下去一点。
                  </p>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      再想想
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!onSpend()) return;
                        setResult(
                          `交出去了。沉默值 −${SPEND_COST}，名单上那一笔淡了一点（被注意值 −2）。档案里多了一行：该蛙主动消耗沉默 ${SPEND_COST} 点。记录员不问原因。（累计 ${spentCount + 1} 次）`,
                        );
                      }}
                      className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      交出去
                    </button>
                  </div>
                </>
              )}
              {(spentToday || attention <= 0 || silenceValue < SPEND_COST) && (
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    合上台面
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">换位申请</h2>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={SWAP_LINE} />
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                口径：本学期你与一只蛙交换位置——它走你的线，你走它的线；数值各记各的，档案各写各的。
                换位不是替换：两份档案都还在，只是换了个人翻。
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                >
                  再想想
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!onSwap()) return;
                    setResult(
                      `换位手续办好了。本学期你与一只蛙交换了位置——它走你的线，你走你的线的样子被它看了一遍。一学期后换回来。档案里多了一行：该蛙与某蛙交换过位置。（累计 ${swapsCount + 1} 次）`,
                    );
                  }}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  递表
                </button>
              </div>
            </>
          )}

          <RichText className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground" text={ledgerLine} />
        </div>
      </div>
    </div>
  );
}
