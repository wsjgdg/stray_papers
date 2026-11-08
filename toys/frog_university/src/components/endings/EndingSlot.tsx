import { clsx } from "clsx";
import { Pin } from "lucide-react";
import { FROG_BY_CHARACTER } from "@/components/frog/Frog";
import type { EndingSlotData } from "@/pages/Endings/useEndings";

interface EndingSlotProps {
  slot: EndingSlotData;
  /** 本槽位展示的奶蛙（湖边三档轮换不同蛙） */
  frogId: keyof typeof FROG_BY_CHARACTER;
  /** 三周目档案（playthrough ≥ 3）：已解锁结局挂「免检」小角标 */
  exempt?: boolean;
  /** 编目（批次 BS）：该蛙被否认/自行降级——槽位标题降级为脚注，编号还在 */
  degraded?: boolean;
  /** 进场延迟（毫秒）：与分组卡一起错拍落下 */
  delayMs?: number;
  /** 钉心收藏（批次 CY-34）：钉过心的结局页排到线内最前 */
  favorited?: boolean;
  /** 钉心翻转（缺省则不画图钉钮） */
  onToggleFavorite?: (endingId: string) => void;
  /** 写过页边批注（批次 CY-35）：有小角标提示这一页留过字 */
  hasNote?: boolean;
  onOpen: (endingId: string) => void;
}

/** 单个结局槽位：未解锁=剪影+??+条件提示；已解锁=标题可点开全文 */
export function EndingSlot({
  slot,
  frogId,
  exempt = false,
  degraded = false,
  delayMs = 0,
  favorited = false,
  onToggleFavorite,
  hasNote = false,
  onOpen,
}: EndingSlotProps) {
  const FrogAvatar = FROG_BY_CHARACTER[frogId];

  /* 已撕（批次 AD）：内容从图鉴消失——只剩撕口和一枚章。撕掉的那一半在玩家手里。 */
  if (slot.torn) {
    return (
      <div
        aria-label="已撕的档案页"
        className="anim-fade-up flex items-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 px-3.5 py-3"
        style={{ animationDelay: `${delayMs}ms` }}
      >
        <span className="shrink-0 saturate-0 opacity-30" aria-hidden>
          <FrogAvatar size={34} expression="silent" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-muted-foreground/60">（撕掉了）</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            这一页的内容从图鉴里消失了。撕口是平的——另一半在你手里。
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-destructive/40 px-2 py-0.5 font-mono text-[10px] font-bold text-destructive">
          已撕
        </span>
      </div>
    );
  }

  if (!slot.unlocked) {
    return (
      <div
        className="anim-fade-up flex items-center gap-3 rounded-2xl border border-dashed border-border bg-background/60 px-3.5 py-3"
        style={{ animationDelay: `${delayMs}ms` }}
      >
        <span className="shrink-0 saturate-0 opacity-40" aria-hidden>
          {degraded ? (
            <span className="block h-[34px] w-[34px] rounded-xl border border-dashed border-border bg-muted/40" />
          ) : (
            <FrogAvatar size={34} expression="silent" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-muted-foreground">??</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {slot.hint}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "anim-fade-up flex w-full items-center gap-2 rounded-2xl border bg-background/70 py-3 pl-3.5 pr-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        favorited ? "border-primary/50 bg-primary/5" : degraded ? "border-dashed border-border" : "border-border",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <button
        type="button"
        onClick={() => onOpen(slot.ending.id)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:shadow-focus focus-visible:rounded-2xl focus-visible:outline-none"
      >
        <span className="shrink-0" aria-hidden>
          {degraded ? (
            <span className="block h-[34px] w-[34px] rounded-xl border border-dashed border-border bg-muted/40" />
          ) : (
            <FrogAvatar size={34} expression="smile" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={clsx(
              "block truncate text-sm font-bold text-foreground",
              degraded && "text-muted-foreground line-through decoration-muted-foreground/40",
            )}
          >
            {degraded ? "（该条目已降级为非编目）" : slot.ending.title}
            {/* 页边写过字（批次 CY-35）：留过笔迹的页有个小笔尖记号 */}
            {hasNote && (
              <span
                className="ml-1.5 align-middle text-primary"
                title="这一页的页边写过一行批注"
                aria-label="写过页边批注"
              >
                ✎
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {degraded ? "原文以脚注保留——点开还能看，但已降级。" : slot.tierLabel}
          </span>
        </span>
        {exempt && (
          <span
            className="shrink-0 rounded-full border border-dashed border-border bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground"
            title="第三学期起免于统计"
          >
            免检
          </span>
        )}
        <span className="shrink-0 text-xs font-bold text-primary">回看</span>
      </button>
      {/* 钉心收藏（批次 CY-34）：钉过的心把这一页顶到线内最前 */}
      {onToggleFavorite && (
        <button
          type="button"
          onClick={() => onToggleFavorite(slot.ending.id)}
          aria-pressed={favorited}
          aria-label={favorited ? `取消收藏结局「${slot.ending.title}」` : `收藏结局「${slot.ending.title}」，置顶到线内最前`}
          title={favorited ? "已钉心——再点取下" : "钉一颗心——这一页排到线内最前"}
          className={clsx(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
            favorited
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <Pin size={12} className={favorited ? "fill-current" : undefined} aria-hidden />
        </button>
      )}
    </div>
  );
}
