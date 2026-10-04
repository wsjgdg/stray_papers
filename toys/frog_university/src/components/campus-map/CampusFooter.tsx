import { clsx } from "clsx";
import { Link } from "react-router-dom";
import { ArrowLeftRight, BookUser, CalendarDays, Coins, FileSignature, GraduationCap, HandCoins } from "lucide-react";

interface CampusFooterProps {
  doneCount: number;
  total: number;
  lakeUnlocked: boolean;
  /** 十条线（九常规 + 湖边）全部完成：页脚亮出毕业典礼提示 */
  graduateReady?: boolean;
  /** 被注意值攒到 8：学工办的名单上有了你的名字（克制的一行，常显） */
  attentionOnList?: boolean;
  /** 今日校园公告（批次 H3 每局差异层）：随档与天派生，同一局同一天恒定 */
  bulletin?: string;
  /** 本学期天气性格的一句闲话（每局不同，挂公告栏边上） */
  weatherBiasHint?: string;
  /** 账台（批次 AJ / AL / AO）：借沉默（带利息）/ 替人背档案 / 申请重置 / 消耗沉默 */
  loanOut?: number;
  carriedCount?: number;
  resetsCount?: number;
  spentCount?: number;
  onOpenBorrow?: () => void;
  onOpenCarry?: () => void;
  onOpenReset?: () => void;
  onOpenSpend?: () => void;
  /** 换位申请（批次 BC「替换」）：与某只蛙交换位置一学期——你体验了别人的档案，但你的档案还在 */
  swapsCount?: number;
  onOpenSwap?: () => void;
  /** 课表（批次 AP「校园是活的系统」之一）：学校替你排的——你只能决定去不去 */
  todayClassLabel?: string;
  classHandled?: boolean;
  skipsCount?: number;
  onOpenSchedule?: () => void;
  /** 申请毕业（批次 AP）：提前毕业——本学期走过两条线即可申请；全通后入口消失 */
  canApplyGraduation?: boolean;
  onOpenGraduate?: () => void;
  /** 签收（批次 AR「你的位置」之一）：收发室有一份东西等你——不签的东西不会被扔掉，只会被处理 */
  canSignPackage?: boolean;
  onOpenPackage?: () => void;
}

/** 底部进度：已完成 x/N（常规线数）+ 湖边隐藏线提示 + 全通毕业典礼提示 */
export function CampusFooter({
  doneCount,
  total,
  lakeUnlocked,
  graduateReady = false,
  attentionOnList = false,
  bulletin,
  weatherBiasHint,
  loanOut = 0,
  carriedCount = 0,
  resetsCount = 0,
  spentCount = 0,
  onOpenBorrow,
  onOpenCarry,
  onOpenReset,
  onOpenSpend,
  swapsCount = 0,
  onOpenSwap,
  todayClassLabel,
  classHandled = false,
  skipsCount = 0,
  onOpenSchedule,
  canApplyGraduation = false,
  onOpenGraduate,
  canSignPackage = false,
  onOpenPackage,
}: CampusFooterProps) {
  return (
    <footer className="border-t border-border bg-card/60 py-5">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 text-center">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
          <span className="text-sm font-bold text-card-foreground">
            剧情进度：已完成 {doneCount}/{total}
          </span>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: total }).map((_, index) => (
              <span
                key={index}
                className={clsx("h-2.5 w-6 rounded-full transition-colors duration-300", index < doneCount ? "bg-primary" : "bg-muted")}
              />
            ))}
          </div>
        </div>
        {/* 课表与毕业（批次 AP）+ 签收（批次 AR）：课表是学校替你排的；毕业不必等走完；收发室有你的一份 */}
        {(onOpenSchedule || (canApplyGraduation && onOpenGraduate) || (canSignPackage && onOpenPackage)) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onOpenSchedule && (
              <button
                type="button"
                onClick={onOpenSchedule}
                aria-label="本周课表"
                title="课表是学校替你排的——沉默值高的排自习，说真话多的排讨论，表演分高的排展示，被盯上的排约谈。你只能决定去不去。"
                className={clsx(
                  /* 今日课没办时 chip 亮主色（批次 CY-88）：页脚里唯一在催你的那一枚 */
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                  todayClassLabel && !classHandled
                    ? "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-card-foreground",
                )}
              >
                <CalendarDays size={12} aria-hidden />
                {todayClassLabel
                  ? `今日课 · ${todayClassLabel}${classHandled ? "（已办）" : ""}`
                  : "本周课表"}
                {skipsCount > 0 ? ` · 已逃 ${skipsCount} 次` : ""}
              </button>
            )}
            {canApplyGraduation && onOpenGraduate && (
              <button
                type="button"
                onClick={onOpenGraduate}
                aria-label="申请毕业"
                title="提前毕业：不必等十条线走完——申请后直接进毕业典礼；但成绩单上会写「该蛙未完成全部课程」。学校照发证。"
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors duration-200 hover:bg-primary/20 focus-visible:shadow-focus focus-visible:outline-none"
              >
                <GraduationCap size={12} aria-hidden />
                申请毕业
              </button>
            )}
            {canSignPackage && onOpenPackage && (
              <button
                type="button"
                onClick={onOpenPackage}
                aria-label="签收"
                title="收发室有一份东西等你：收件人一栏写的是你的名字。不签也行——不签的东西不会被扔掉，只会被处理。"
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors duration-200 hover:bg-primary/20 focus-visible:shadow-focus focus-visible:outline-none"
              >
                <FileSignature size={12} aria-hidden />
                签收 · 有一份东西等你
              </button>
            )}
          </div>
        )}
        {/* 账台（批次 AJ / AL / AO / BC）：流程里没有的那一栏——借沉默（带利息）/ 替人背档案 / 申请重置 / 消耗沉默 / 换位申请 */}
        {(onOpenBorrow || onOpenCarry || onOpenReset || onOpenSpend || onOpenSwap) && (
          <div className="anim-fade-up mt-1 flex flex-wrap items-center justify-center gap-2">
            {onOpenBorrow && (
              <button
                type="button"
                onClick={onOpenBorrow}
                aria-label="借沉默"
                title={loanOut > 0 ? `出借中 ${loanOut} 点：下一次深夜事件连本带息还回来` : "借沉默：当场扣，下一次深夜事件连本带息还"}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
              >
                <Coins size={12} aria-hidden />
                借沉默{loanOut > 0 ? ` · ${loanOut} 点在路上` : ""}
              </button>
            )}
            {onOpenCarry && (
              <button
                type="button"
                onClick={onOpenCarry}
                aria-label="替人背档案"
                title="替人背档案：把别人的记录认到自己名下——被注意值 +2，他从此不进档"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
              >
                <BookUser size={12} aria-hidden />
                替人背档案{carriedCount > 0 ? ` · 已背 ${carriedCount} 份` : ""}
              </button>
            )}
            {onOpenReset && (
              <button
                type="button"
                onClick={onOpenReset}
                aria-label="申请重置"
                title={resetsCount > 0 ? `已被重置 ${resetsCount} 次：名单先知道，档案留一行` : "申请重置：把自己从名单上拿下来——盖章收 3 点沉默"}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
              >
                <FileSignature size={12} aria-hidden />
                申请重置{resetsCount > 0 ? ` · 已重置 ${resetsCount} 次` : ""}
              </button>
            )}
            {onOpenSpend && (
              <button
                type="button"
                onClick={onOpenSpend}
                aria-label="消耗沉默"
                title="消耗沉默：把攒下的沉默交出去——沉默 −3，名单上那一笔淡一点（被注意值 −2）。记录员不问原因"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
              >
                <HandCoins size={12} aria-hidden />
                消耗沉默{spentCount > 0 ? ` · 累计 ${spentCount} 点` : ""}
              </button>
            )}
            {onOpenSwap && (
              <button
                type="button"
                onClick={onOpenSwap}
                aria-label="换位申请"
                title="换位申请：与某只蛙交换位置一学期——它走你的线，你走它的线；数值各记各的。你体验了别人的档案，但你的档案还在。"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
              >
                <ArrowLeftRight size={12} aria-hidden />
                换位申请{swapsCount > 0 ? ` · 换过 ${swapsCount} 次` : ""}
              </button>
            )}
          </div>
        )}
        {bulletin && (
          <p
            key={bulletin}
            className="anim-fade-up max-w-3xl rounded-lg border border-dashed border-border bg-background/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
          >
            {bulletin}
            {weatherBiasHint && (
              <span className="mt-1 block text-[11px] text-muted-foreground/70">
                （公告栏边上有人补了一句：{weatherBiasHint}。）
              </span>
            )}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {lakeUnlocked
            ? "常规线全通：湖边的灯已经亮了，去湖边找「蛙生的意义」"
            : `湖边隐藏线：完成全部 ${total} 条常规线后解锁`}
        </p>
        {attentionOnList && (
          <p className="anim-fade-up text-xs font-bold text-primary">学工办的名单更新了，上面有你的名字。</p>
        )}
        {graduateReady && (
          <Link
            to="/endings"
            className="anim-fade-up mt-1 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-bold text-primary shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
          >
            <GraduationCap size={14} aria-hidden />
            十条线都走完了。结局图鉴的顶部，礼堂的灯为你亮着——毕业典礼随时开始。
          </Link>
        )}
      </div>
    </footer>
  );
}
