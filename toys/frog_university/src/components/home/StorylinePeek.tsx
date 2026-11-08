import { clsx } from "clsx";
import { buildingById, type StorylineMeta } from "@/data/storylinesMeta";
import { RichText } from "@/components/common/RichText";

interface StorylinePeekProps {
  storylines: StorylineMeta[];
  onOpenMap: () => void;
}

/** 剧情线一览：各条线预告（数量随剧情线注册表自动扩），点击去校园地图开玩 */
export function StorylinePeek({ storylines, onOpenMap }: StorylinePeekProps) {
  const regularCount = storylines.filter((line) => !line.hidden).length;
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-14">
      <div className="anim-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">校园里正在发生</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {regularCount} 条日常剧情线，外加一个没写在校牌上的地方
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenMap}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
        >
          去校园地图
        </button>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {storylines.map((line, index) => {
          const building = buildingById(line.building);
          return (
            <article
              key={line.id}
              className={clsx(
                "anim-fade-up flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-shadow duration-200 hover:shadow-md",
                line.hidden ? "border-dashed border-primary/50" : "border-border",
              )}
              style={{ animationDelay: `${Math.min(index * 70, 630)}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-card-foreground">《{line.title}》</h3>
                {line.hidden && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                    隐藏
                  </span>
                )}
              </div>
              <RichText className="mt-2 text-sm leading-relaxed text-muted-foreground" text={line.intro} />
              <div className="mt-4 flex items-center justify-between gap-2 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                  {building?.label}
                </span>
                <span className="font-bold text-primary" aria-label={`梗浓度 ${line.memeLevel} 星`}>
                  {"★".repeat(line.memeLevel)}
                  <span className="text-muted-foreground/50">{"★".repeat(5 - line.memeLevel)}</span>
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
