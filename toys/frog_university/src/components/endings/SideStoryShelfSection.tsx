/**
 * 结局图鉴 · 名册附页 · 番外合集（批次 CY-134，CY-135 扩重读）
 * 六集树洞档番外 + 四集专属档番外，各成一格：开场定格当封面，收档状态读「讲过的番外」。
 * 未解锁只留剪影与解锁条件（树洞档 55%；专属档先听完树洞那集、再到真心蛙友档 85%）——不剧透。
 * 收过档的这一格给「重读」按钮：图鉴里是纯重读，不计数、不写档（档案只记一次）；重读完在封面盖一枚章。
 * 番外的定格不进剧情定格册的分母，这里只当附页插图。
 */
import { useState } from "react";
import { clsx } from "clsx";
import { BookMarked, ImageDown, Lock, Play, RotateCcw } from "lucide-react";
import { RichText } from "@/components/common/RichText";
import { FROG_BY_CHARACTER } from "@/components/frog/Frog";
import { FROG_CHARACTERS } from "@/data/characters";
import { CgArt } from "@/components/play/CgArt";
import type { FrogCharacterId } from "@/data/characters";
import { EXCLUSIVE_SIDE_STORIES, SIDE_STORIES } from "@/data/sideStories";
import type { GameSaveData } from "@/lib/gameSave";
import { TREE_HOLE_THRESHOLD, TRUE_FRIEND_THRESHOLD, affinityPercent } from "@/lib/affinity";
import { exportSideStoryPaper } from "@/lib/endingPaper";

type Episode = (typeof SIDE_STORIES)[number];

export interface EpisodeCard {
  story: Episode;
  /** 档位：树洞档随名册开门；专属档压箱底，还要先听完树洞那一集 */
  tier: "tree-hole" | "exclusive";
  /** 蛙当前的坦诚度（决定这一格是开还是锁） */
  percent: number;
  unlocked: boolean;
  seen: boolean;
  /** 解锁条件那句话（锁着的格子才显示） */
  lockLine: string;
}

export function buildShelf(save: GameSaveData): EpisodeCard[] {
  const seenIds = save.sideStoriesSeen;
  const treeHoleIdOf = (frogId: FrogCharacterId) => SIDE_STORIES.find((s) => s.frogId === frogId);
  const cards: EpisodeCard[] = [];
  for (const story of SIDE_STORIES) {
    const percent = affinityPercent(story.frogId, save.affinity[story.frogId] ?? 0);
    const unlocked = percent >= TREE_HOLE_THRESHOLD;
    cards.push({
      story,
      tier: "tree-hole",
      percent,
      unlocked,
      seen: seenIds.includes(story.id),
      lockLine: `到树洞档（${TREE_HOLE_THRESHOLD}%），它才肯讲这一件。现在是 ${percent}%。`,
    });
  }
  for (const story of EXCLUSIVE_SIDE_STORIES) {
    const percent = affinityPercent(story.frogId, save.affinity[story.frogId] ?? 0);
    const treeHole = treeHoleIdOf(story.frogId);
    const treeHoleSeen = treeHole ? seenIds.includes(treeHole.id) : true;
    const unlocked = percent >= TRUE_FRIEND_THRESHOLD && treeHoleSeen;
    cards.push({
      story,
      tier: "exclusive",
      percent,
      unlocked,
      seen: seenIds.includes(story.id),
      lockLine: treeHoleSeen
        ? `到真心蛙友档（${TRUE_FRIEND_THRESHOLD}%）才肯讲的压箱底。现在是 ${percent}%。`
        : `先听完《${treeHole?.title ?? "树洞那一集"}》，再到真心蛙友档（${TRUE_FRIEND_THRESHOLD}%）。`,
    });
  }
  return cards;
}

interface SideStoryShelfSectionProps {
  save: GameSaveData;
  /** 点开重读（图鉴里是纯重读：已收档的才给按钮，不计数不写档） */
  onReplay: (storyId: string) => void;
  /** 拼成合集（批次 CY-141 起走屏幕外舞台，合集带开场定格封面）；状态由图鉴 Logic 持有 */
  onAlbum: () => void;
  albumState?: "idle" | "busy" | "done" | "failed";
  /** 连播已收档：按「树洞档 → 专属档、名册蛙序」一集接一集重读（至少两集才亮） */
  onBinge: () => void;
  /** 刚重读完的那一集——卡片上盖一枚章（tick 变化即重放） */
  freshStamp?: { storyId: string; tick: number } | null;
}

export function SideStoryShelfSection({ save, onReplay, onAlbum, albumState = "idle", onBinge, freshStamp }: SideStoryShelfSectionProps) {
  const cards = buildShelf(save);
  const seenCount = cards.filter((card) => card.seen).length;
  const allCollected = cards.length > 0 && seenCount === cards.length;
  const stampTick = freshStamp?.tick ?? 0;

  /* 打包存图（批次 CY-137）：把收过档的番外一集誊一页附页图——档案只记一次，纸可以多印 */
  const [exportState, setExportState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const exportBatch = async () => {
    if (exportState === "busy") return;
    setExportState("busy");
    const seenCards = cards.filter((card) => card.seen);
    let allOk = true;
    for (const card of seenCards) {
      const ok = await exportSideStoryPaper({
        frogName: FROG_CHARACTERS[card.story.frogId].displayName,
        tierLabel: card.tier === "exclusive" ? "真心蛙友 · 专属番外" : "树洞 · 番外",
        title: card.story.title,
        place: card.story.place,
        archive: card.story.archive,
      });
      if (!ok) allOk = false;
      /* 页间留一口气，别让下载挤成一团 */
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    setExportState(allOk ? "done" : "failed");
    window.setTimeout(() => setExportState("idle"), allOk ? 2000 : 2500);
  };

  return (
    <section
      aria-label="名册附页番外合集"
      className="anim-fade-up rounded-3xl border border-border bg-card p-6 shadow-md md:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-black tracking-tight text-card-foreground">
            <BookMarked size={18} className="text-primary" aria-hidden />
            名册附页 · 番外合集
          </h3>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-muted-foreground">
            树洞档的蛙讲一件没跟别人讲过的事，真心蛙友档的蛙讲压箱底的那件。图在名册附页里当插图，不进剧情定格册的册子。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {seenCount >= 1 && (
            <button
              type="button"
              data-export-ui="1"
              onClick={onAlbum}
              disabled={albumState === "busy"}
              title="收过档的番外拼进同一页，封面带开场定格"
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
                albumState === "done"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              <BookMarked size={12} aria-hidden />
              {albumState === "busy"
                ? "正在拼…"
                : albumState === "done"
                  ? "拼好了"
                  : albumState === "failed"
                    ? "没拼上"
                    : "拼成合集"}
            </button>
          )}
          {seenCount >= 1 && (
            <button
              type="button"
              data-export-ui="1"
              onClick={exportBatch}
              disabled={exportState === "busy"}
              title="收过档的番外，一集誊一页附页图存下来"
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
                exportState === "done"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              <ImageDown size={12} aria-hidden />
              {exportState === "busy"
                ? `正在誊 ${seenCount} 页…`
                : exportState === "done"
                  ? "都存好了"
                  : exportState === "failed"
                    ? "有几页没存上"
                    : "打包存图"}
            </button>
          )}
          {seenCount >= 2 && (
            <button
              type="button"
              onClick={onBinge}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors duration-200 hover:bg-primary/20 focus-visible:shadow-focus focus-visible:outline-none"
            >
              <Play size={12} aria-hidden />
              连播已收档（{seenCount} 集）
            </button>
          )}
          <span
            className={clsx(
              "rounded-full px-3 py-1.5 text-xs font-bold",
              allCollected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
            )}
          >
            收档 {seenCount}/{cards.length}
          </span>
        </div>
      </header>

      {allCollected && (
        <p className="anim-fade-up mt-4 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-card-foreground">
          <span className="font-bold text-primary">附页记满了。</span>
          <RichText
            className="mt-1 text-sm leading-relaxed text-muted-foreground"
            text="名册里的蛙，把没跟别的蛙讲过的那一件，都讲给了你。档案只记一次——这一页，就是那一次。"
          />
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card, index) => {
          const Sprite = FROG_BY_CHARACTER[card.story.frogId];
          const stamped = freshStamp?.storyId === card.story.id;
          return (
            <article
              key={card.story.id}
              aria-label={`番外${card.seen ? "已收档" : "未收档"}：${card.story.title}`}
              className={clsx(
                "anim-fade-up group relative overflow-hidden rounded-2xl border transition-all duration-200",
                card.unlocked
                  ? card.seen
                    ? "border-primary/40 bg-card shadow-md hover:shadow-lg"
                    : "border-border bg-card shadow-md hover:shadow-lg"
                  : "border-dashed border-border bg-background/50",
              )}
              style={{ animationDelay: `${Math.min(index * 60, 480)}ms` }}
            >
              {/* 封面：开场定格；没解锁只留剪影，不剧透 */}
              <div className="relative aspect-[16/9] w-full border-b border-border/60">
                {card.unlocked ? (
                  card.story.cg && <CgArt id={card.story.cg} />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted/40 text-muted-foreground/70">
                    <Lock size={18} aria-hidden />
                    <span className="font-mono text-xs font-bold tracking-widest">未解锁 · 剪影</span>
                  </div>
                )}
                <span
                  className={clsx(
                    "absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-bold shadow-sm",
                    card.tier === "exclusive" ? "bg-primary text-primary-foreground" : "bg-card/90 text-primary",
                  )}
                >
                  {card.tier === "exclusive" ? "专属档" : "树洞档"}
                </span>
                {/* 重读完盖一枚章：不另记，档案只记一次 */}
                {stamped && (
                  <span
                    key={`stamp-${stampTick}`}
                    aria-hidden
                    className="anim-stamp absolute right-3 top-3 rounded-md border-2 border-primary/70 bg-card/90 px-2 py-1 text-[10px] font-black tracking-widest text-primary"
                  >
                    重读 · 不另记
                  </span>
                )}
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="flex min-w-0 items-center gap-2 text-sm font-black tracking-tight text-card-foreground">
                    {Sprite && <Sprite size={28} />}
                    <span className="truncate">{card.story.title}</span>
                  </h4>
                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      card.seen ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {card.seen ? "已收档" : card.unlocked ? "还没听" : "未解锁"}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                  {card.story.place}
                </p>
                {card.seen ? (
                  <RichText className="mt-2 text-xs leading-relaxed text-muted-foreground" text={card.story.archive} />
                ) : card.unlocked ? (
                  <RichText className="mt-2 text-xs leading-relaxed text-card-foreground" text={card.story.hint} />
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground/70">{card.lockLine}</p>
                )}
                {card.seen && (
                  <button
                    type="button"
                    onClick={() => onReplay(card.story.id)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    <RotateCcw size={12} aria-hidden />
                    重读《{card.story.title}》
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        第一遍的名册里听——那里才算收档；这里的重读不计数、不写档。专属档那四集都要先听完各自树洞档那一集才成立，顺序不乱。
      </p>
    </section>
  );
}
