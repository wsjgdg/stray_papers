/**
 * 结局图鉴 · 名册附页合集舞台（批次 CY-141）：合集带开场定格封面——图是画出来的，
 * 所以整本合集改走屏幕外舞台：封面页 → 目录页 → 双栏合集（每集封面 + 档案行）→ 页脚口径。
 * 舞台挂载后等两帧再交出画布，走统一盖章导出通道；口径不变：档案只记一次，合集是重印的。
 */
import { useEffect, useRef } from "react";
import { RichText } from "@/components/common/RichText";
import { FROG_BY_CHARACTER } from "@/components/frog/Frog";
import { CgArt } from "@/components/play/CgArt";
import type { GameSaveData } from "@/lib/gameSave";
import { buildShelf } from "@/components/endings/SideStoryShelfSection";

interface SideStoryAlbumStageProps {
  save: GameSaveData;
  /** 渲染完成后把这个节点交给调用方走统一盖章导出通道 */
  onCapture: (node: HTMLDivElement) => void;
}

export function SideStoryAlbumStage({ save, onCapture }: SideStoryAlbumStageProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cards = buildShelf(save).filter((card) => card.seen);
  const total = buildShelf(save).length;
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (ref.current) onCapture(ref.current);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [onCapture]);

  return (
    <div ref={ref} className="w-[860px] rounded-3xl border border-border bg-card p-8">
      {/* 封面页 */}
      <div className="rounded-3xl border border-primary/30 bg-primary/5 px-8 py-8 text-center">
        <p className="text-xs font-bold tracking-[0.3em] text-primary">名 册 附 页</p>
        <h2 className="mt-3 text-3xl font-bold text-card-foreground">番外合集</h2>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          名册里的蛙，把没跟别的蛙讲过的那件，讲给了你——这一版带每集的开场定格。
        </p>
        <p className="mt-2 font-mono text-xs tracking-widest text-muted-foreground">
          收档 {cards.length}/{total} · 重印 · 不另记
        </p>
      </div>
      {/* 目录页 */}
      <div className="mt-6 rounded-3xl border border-dashed border-border px-6 py-5">
        <p className="text-xs font-bold tracking-widest text-primary">目 录</p>
        <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {cards.map((card, index) => (
            <li key={card.story.id} className="flex items-baseline gap-2 text-xs leading-relaxed">
              <span className="font-mono text-[10px] font-bold text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-bold text-card-foreground">《{card.story.title}》</span>
              <span className="text-muted-foreground">
                {card.tier === "exclusive" ? "专属档" : "树洞档"}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {/* 合集：一集一格，开场定格当封面 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card) => {
          const Sprite = FROG_BY_CHARACTER[card.story.frogId];
          return (
            <div key={card.story.id} className="overflow-hidden rounded-2xl border border-border">
              {card.story.cg && (
                <div className="aspect-[16/9] w-full border-b border-border/60">
                  <CgArt id={card.story.cg} />
                </div>
              )}
              <div className="p-4">
                <p className="text-[10px] font-bold text-primary">
                  名册附页 · {card.tier === "exclusive" ? "真心蛙友 · 专属番外" : "树洞 · 番外"}
                </p>
                <p className="mt-1 flex items-center gap-2 text-base font-bold text-card-foreground">
                  {Sprite && <Sprite size={22} />}
                  <span>《{card.story.title}》</span>
                </p>
                <p className="mt-0.5 font-mono text-[10px] tracking-widest text-muted-foreground">{card.story.place}</p>
                <RichText className="mt-2 text-xs leading-relaxed text-card-foreground" text={card.story.archive} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-6 border-t border-border pt-3 text-[10px] font-bold tracking-widest text-muted-foreground">
        档案只记一次——这本合集是重印的，不另记。
      </p>
    </div>
  );
}
