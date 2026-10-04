/**
 * 好感名册：各蛙立绘头像 + 坦诚度进度条 + 当前关系称呼
 * 沉默值是「你被驯化了多少」，好感是「你还有多少真实连接」。
 * 番外（番外篇批次）：树洞档（55%）的蛙多一行入口——它开始把没说出口的话分你一半。
 * 专属番外（批次 CY-123）：真心蛙友档（85%）且树洞档那集听过之后，再多一行压箱底入口。
 */
import { clsx } from "clsx";
import { Heart, X } from "lucide-react";
import { FROG_BY_CHARACTER } from "@/components/frog/Frog";
import type { FrogCharacterId } from "@/data/characters";
import { exclusiveSideStoryOf, sideStoryOf } from "@/data/sideStories";
import { TREE_HOLE_THRESHOLD, TRUE_FRIEND_THRESHOLD, type AffinityRow } from "@/lib/affinity";
import { RichText } from "@/components/common/RichText";

interface AffinityPanelProps {
  rows: AffinityRow[];
  /** 已讲过的番外 id（按钮口径：第一次听 / 重看） */
  sideStoriesSeen: string[];
  /** storyId 仅专属番外传（树洞档那集按蛙取件，口径不变） */
  onPlaySideStory: (frogId: FrogCharacterId, storyId?: string) => void;
  onClose: () => void;
}

export function AffinityPanel({ rows, sideStoriesSeen, onPlaySideStory, onClose }: AffinityPanelProps) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-foreground/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="好感名册"
    >
      <div className="max-h-[86vh] w-full max-w-lg animate-in overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-lg fade-in zoom-in-95 duration-300">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-2xl font-black tracking-tight text-card-foreground">
              <Heart size={20} className="fill-primary text-primary" />
              好感名册
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              沉默值记录「你被驯化了多少」，好感记录「你还有多少真实连接」。进度条是每只蛙的真话——你已经听到了几成。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭好感名册"
            className="inline-flex shrink-0 items-center rounded-full border border-border bg-background px-2.5 py-1.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          {rows.map((row) => {
            const Sprite = FROG_BY_CHARACTER[row.charId];
            const bestFriend = row.percent >= TRUE_FRIEND_THRESHOLD;
            /* 编目（批次 BS）：被否认/自行降级的蛙——名册里那一行只剩编号，数值那格是空的 */
            const degraded = row.existenceTier === "footnote" || row.existenceTier === "demoted";
            if (degraded) {
              return (
                <div
                  key={row.charId}
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-background/40 p-3"
                >
                  <span
                    className={
                      row.existenceTier === "demoted"
                        ? "block h-[52px] w-[52px] shrink-0 animate-pulse rounded-2xl border border-dashed border-destructive/40 bg-muted/30"
                        : "block h-[52px] w-[52px] shrink-0 rounded-2xl border border-dashed border-border bg-muted/30"
                    }
                    aria-label="非编目"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="font-mono text-sm font-bold text-muted-foreground">
                        第 {row.index} 号 · 非编目
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs font-bold text-muted-foreground">
                        —— · ——
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/60">
                      <div className="h-full w-1/3 rounded-full bg-muted" />
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {row.existenceTier === "demoted"
                        ? "该条目自行申请降级——它自己走的。"
                        : "该条目已降级为非编目。数值那格空着：空着不是没有，是没被记。"}
                    </p>
                  </div>
                </div>
              );
            }
            return (
              <div key={row.charId} className="flex items-center gap-3 rounded-2xl bg-background/60 p-3">
                {Sprite && <Sprite size={52} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="text-sm font-bold text-card-foreground">
                      {row.displayName}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">{row.role}</span>
                    </span>
                    <span
                      className={clsx(
                        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                        bestFriend ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                      )}
                    >
                      {row.tier.label} · {row.percent}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>
                  <RichText className="mt-1.5 text-xs leading-relaxed text-muted-foreground" text={row.blurb} />
                  {/* 番外入口（番外篇批次）：树洞档开讲；棉棉没有番外（她的故事整条线都是） */}
                  {!row.isSelf &&
                    (() => {
                      const story = sideStoryOf(row.charId);
                      if (!story) return null;
                      if (row.percent < TREE_HOLE_THRESHOLD) {
                        return (
                          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/70">
                            到树洞档（{TREE_HOLE_THRESHOLD}%），它会讲一件没跟别人讲过的事。
                          </p>
                        );
                      }
                      const storySeen = sideStoriesSeen.includes(story.id);
                      /* 专属番外（批次 CY-123）：真心蛙友档 + 树洞档那集听过之后才亮的压箱底入口
                         （《补发》正文引用了《原文》的听后感，先听上一集才成立） */
                      const exclusive =
                        row.percent >= TRUE_FRIEND_THRESHOLD && storySeen
                          ? exclusiveSideStoryOf(row.charId)
                          : undefined;
                      const exclusiveSeen = exclusive ? sideStoriesSeen.includes(exclusive.id) : false;
                      return (
                        <>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate text-xs leading-relaxed text-muted-foreground">
                              {story.hint}
                            </span>
                            <button
                              type="button"
                              onClick={() => onPlaySideStory(row.charId)}
                              className={clsx(
                                "shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                                storySeen
                                  ? "border border-border bg-card text-muted-foreground hover:text-card-foreground"
                                  : "bg-primary/10 text-primary hover:bg-primary/20",
                              )}
                            >
                              {storySeen ? `重看《${story.title}》` : `听《${story.title}》`}
                            </button>
                          </div>
                          {exclusive && (
                            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1.5">
                              <span className="min-w-0 flex-1 truncate text-xs leading-relaxed text-muted-foreground">
                                <span className="mr-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                                  专属
                                </span>
                                {exclusive.hint}
                              </span>
                              <button
                                type="button"
                                onClick={() => onPlaySideStory(row.charId, exclusive.id)}
                                className={clsx(
                                  "shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                                  exclusiveSeen
                                    ? "border border-border bg-card text-muted-foreground hover:text-card-foreground"
                                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                                )}
                              >
                                {exclusiveSeen ? `重看《${exclusive.title}》` : `听《${exclusive.title}》`}
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-5 border-t border-dashed border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          真心话藏在某些选项里，说给对应的蛙听，好感才会长。刷重复的梗是刷不出来的——真话只说一次。
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
        >
          收好名册
        </button>
      </div>
    </div>
  );
}
