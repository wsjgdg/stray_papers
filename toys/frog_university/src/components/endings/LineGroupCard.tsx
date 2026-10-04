import { clsx } from "clsx";
import { FROG_BY_CHARACTER } from "@/components/frog/Frog";
import { REGULAR_LINE_IDS } from "@/data/storylines";
import type { FrogCharacterId } from "@/data/characters";
import { EndingSlot } from "@/components/endings/EndingSlot";
import type { EndingLineGroup } from "@/pages/Endings/useEndings";

interface LineGroupCardProps {
  group: EndingLineGroup;
  /** 三周目档案（playthrough ≥ 3）：已解锁槽位带「免检」角标 */
  thirdVisit?: boolean;
  /** 编目（批次 BS）：被否认/自行降级的蛙——本学期的口径；它出现的位置变成空白，编号还在 */
  degradedFrogs?: FrogCharacterId[];
  /** 进场延迟（毫秒）：图鉴整页按分组错拍落下 */
  enterDelay?: number;
  /** 钉心收藏（批次 CY-34）：结局 id → 是否钉心 */
  favorites?: Record<string, boolean>;
  /** 钉心翻转 */
  onToggleFavorite?: (endingId: string) => void;
  /** 页边批注（批次 CY-35）：结局 id → 写过的那行字（有值则槽位挂笔尖记号） */
  notes?: Record<string, string>;
  onOpenEnding: (endingId: string) => void;
}

/** 各线分组卡：主蛙头像 + 线名 + 结局槽位，全收齐亮标记 */
export function LineGroupCard({
  group,
  thirdVisit = false,
  degradedFrogs = [],
  enterDelay = 0,
  favorites,
  onToggleFavorite,
  notes,
  onOpenEnding,
}: LineGroupCardProps) {
  const { meta, frogIds, slots } = group;
  const multiFrog = frogIds.length > 1;
  const headExpression = group.complete ? "laugh" : group.collectedCount > 0 ? "smile" : "silent";
  const degraded = frogIds.some((frogId) => degradedFrogs.includes(frogId));

  return (
    <article
      className={clsx(
        "anim-fade-up flex h-full flex-col rounded-3xl border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        degraded ? "border-dashed border-border" : "border-border",
      )}
      style={{ animationDelay: `${enterDelay}ms` }}
    >
      <header className="flex items-center gap-3.5">
        <span className="flex shrink-0 items-end gap-1" aria-hidden>
          {frogIds.map((frogId) => {
            const FrogAvatar = FROG_BY_CHARACTER[frogId];
            if (degradedFrogs.includes(frogId)) {
              return (
                <span
                  key={frogId}
                  className="block rounded-xl border border-dashed border-border bg-muted/40"
                  style={{ width: multiFrog ? 24 : 46, height: multiFrog ? 24 : 46 }}
                  aria-label="非编目"
                />
              );
            }
            return <FrogAvatar key={frogId} size={multiFrog ? 24 : 46} expression={headExpression} />;
          })}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={clsx("truncate text-lg font-bold text-card-foreground", degraded && "opacity-70")}>
            {meta.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {degraded && <span className="font-mono tracking-widest">非编目 · </span>}
            {meta.hidden ? "隐藏线 · " : ""}
            {group.collectedCount}/{group.totalCount} 已收录
          </p>
        </div>
        {group.complete ? (
          <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
            本线收齐
          </span>
        ) : meta.hidden && !group.lineOpen ? (
          <span className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
            未开放
          </span>
        ) : null}
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-2.5">
        {slots.map((slot, index) => (
          <EndingSlot
            key={slot.ending.id}
            slot={slot}
            frogId={frogIds[index % frogIds.length] ?? "naiBai"}
            exempt={thirdVisit}
            degraded={degradedFrogs.includes(frogIds[index % frogIds.length] ?? "naiBai")}
            delayMs={enterDelay + index * 60}
            favorited={favorites?.[slot.ending.id] === true}
            onToggleFavorite={onToggleFavorite}
            hasNote={Boolean(notes?.[slot.ending.id])}
            onOpen={onOpenEnding}
          />
        ))}
        {slots.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-muted/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
            这条线的结局还没开场。等剧本在窗口贴出来，这里会一格格亮起来。
          </p>
        )}
      </div>

      {meta.hidden && !group.lineOpen && (
        <p
          className={clsx(
            "mt-3 rounded-2xl bg-muted/60 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground",
          )}
        >
          这条线要 {REGULAR_LINE_IDS.length} 条常规线全部走完才会开放。
        </p>
      )}
    </article>
  );
}
