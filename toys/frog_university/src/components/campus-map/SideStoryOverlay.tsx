/**
 * 角色番外播放器（番外篇批次）：树洞档（55%）之后，名册里点开的那一集。
 * 视觉语言照深夜事件弹层但更暖：立绘头部 + 点击推进 + 收尾两支选项（真话 / 沉默）+ 档案行。
 * 数值只在首看结算（Logic 层 finishSideStory 判定），重看时明示「档案上次已经收过了」。
 */
import { useState } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { FROG_BY_CHARACTER } from "@/components/frog/Frog";
import { FROG_CHARACTERS } from "@/data/characters";
import type { SideStory, SideStoryChoice } from "@/data/sideStories";
import { RichInline, RichText } from "@/components/common/RichText";
import { CgArt } from "@/components/play/CgArt";

interface SideStoryOverlayProps {
  story: SideStory;
  /** 头部档位小章（批次 CY-123：专属番外传「真心蛙友 · 专属番外」；缺省树洞档口径） */
  tierLabel?: string;
  /** 进来之前是否已讲过（决定收尾是否计数与提示文案） */
  seen: boolean;
  /** 收尾选项落档（首看计数，重看只记已读） */
  onFinish: (storyId: string, choice: { text: string; silenceDelta: number }) => void;
  onClose: () => void;
  /** 收尾按钮文案（批次 CY-135：图鉴重读传「合上附页」，名册里仍是「放回名册」） */
  closeLabel?: string;
  /** 连播进度章（批次 CY-136）：「连播 2/7」；缺省不显示 */
  queueLabel?: string;
  /** 连播的「下一集」：给了就替换收尾按钮的动作与文案（播完最后一集由调用方自己收） */
  onNext?: () => void;
  /** 下一集按钮的文案（缺省「下一集 ▸」） */
  nextLabel?: string;
}

export function SideStoryOverlay({
  story,
  tierLabel,
  seen,
  onFinish,
  onClose,
  closeLabel = "放回名册",
  queueLabel,
  onNext,
  nextLabel = "下一集 ▸",
}: SideStoryOverlayProps) {
  const [nodeIndex, setNodeIndex] = useState(0);
  const [picked, setPicked] = useState<SideStoryChoice | null>(null);
  const FrogArt = FROG_BY_CHARACTER[story.frogId];
  const frogName = FROG_CHARACTERS[story.frogId].displayName;
  const node = story.nodes[Math.min(nodeIndex, story.nodes.length - 1)];
  const nodesDone = nodeIndex >= story.nodes.length;

  const choose = (choice: SideStoryChoice) => {
    if (picked) return;
    setPicked(choice);
    onFinish(story.id, { text: choice.text, silenceDelta: choice.silenceDelta });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`番外：${story.title}`}
        className="anim-fade-up relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-lg"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭番外（不讲完不计入名册）"
          className="absolute right-3 top-3 z-10 rounded-full border border-border bg-card p-2 text-card-foreground shadow-md transition-shadow duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
        >
          <X size={14} />
        </button>

        {/* 头部：立绘 + 篇名 + 树洞档小章 */}
        <div className="flex items-center gap-4 border-b border-dashed border-border bg-background/60 px-5 py-4">
          {FrogArt && <FrogArt size={56} />}
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                {tierLabel ?? "树洞 · 番外"}
              </span>
              {seen && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                  重看 · 档案已收过
                </span>
              )}
              {queueLabel && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                  {queueLabel}
                </span>
              )}
            </p>
            <h3 className="mt-1.5 truncate text-lg font-bold text-card-foreground">
              {frogName}的《{story.title}》
            </h3>
            <p className="mt-0.5 font-mono text-xs tracking-widest text-muted-foreground">{story.place}</p>
          </div>
        </div>

        {/* 开场定格（批次 CY-133）：这一集的开场画面；番外专属，不进剧情定格分母 */}
        {story.cg && (
          <div className="relative aspect-[16/9] w-full">
            <CgArt id={story.cg} />
          </div>
        )}

        <div className="px-4 pb-5 pt-4 sm:px-6">
          {!nodesDone && !picked && (
            <button
              key={node.id}
              type="button"
              onClick={() => setNodeIndex((prev) => prev + 1)}
              aria-label="点击继续"
              className="anim-fade-up block w-full cursor-pointer rounded-2xl px-1 pb-1 pt-1 text-left focus-visible:shadow-focus focus-visible:outline-none"
            >
              <div className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-3">
                <span
                  className={clsx(
                    "rounded-full px-3 py-1 text-sm font-bold",
                    node.speakerId === "narration"
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {node.speakerId === "narration" ? "旁白" : FROG_CHARACTERS[node.speakerId].displayName}
                </span>
                <span className="font-mono text-xs font-bold text-muted-foreground">
                  第 {nodeIndex + 1} / {story.nodes.length} 段
                </span>
              </div>
              <p
                className={clsx(
                  "min-h-24 pt-3 text-base leading-relaxed",
                  node.speakerId === "narration" ? "text-muted-foreground" : "text-card-foreground",
                )}
              >
                <RichInline text={node.text} />
              </p>
              {node.innerVoice && (
                <p className="border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-bold text-primary">内心 </span>
                  <RichInline text={node.innerVoice} />
                </p>
              )}
              <p className="animate-pulse pt-2 text-right text-xs font-bold text-primary">点击继续 ▾</p>
            </button>
          )}

          {nodesDone && !picked && (
            <div className="anim-fade-up flex flex-col items-center gap-3 py-1">
              <p className="rounded-full bg-muted px-4 py-1.5 text-sm font-bold text-card-foreground">
                ——这一集听到这儿。接不接这句话？
              </p>
              {story.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => choose(choice)}
                  className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="block text-base font-bold leading-relaxed text-card-foreground">
                    <RichInline text={choice.text} />
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        choice.silenceDelta <= 0
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {choice.silenceDelta <= 0 ? "真话 · 收进罐子" : `沉默 +${choice.silenceDelta}`}
                    </span>
                    {seen && (
                      <span className="text-xs text-muted-foreground">重看不计数——档案只收一次</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {picked && (
            <div className="anim-fade-up flex flex-col items-center gap-3 py-1 text-center">
              <p className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground">
                讲完了
              </p>
              <RichText className="text-base font-bold leading-relaxed text-card-foreground" text={picked.coda} />
              <div className="mt-1 w-full rounded-2xl border border-dashed border-border bg-background/60 p-4 text-left">
                <p className="font-mono text-xs font-bold tracking-widest text-muted-foreground">
                  名册附页 · {seen ? "重看一遍，档案不再另记" : "已收入"}
                </p>
                <RichText className="mt-2 text-sm leading-relaxed text-muted-foreground" text={story.archive} />
              </div>
              <button
                type="button"
                onClick={onNext ?? onClose}
                autoFocus
                aria-label={onNext ? `收尾：${nextLabel}` : `收尾：${closeLabel}`}
                className="mt-1 rounded-full bg-primary px-6 py-2 text-sm font-bold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
              >
                {onNext ? nextLabel : closeLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
