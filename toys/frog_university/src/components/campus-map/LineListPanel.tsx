import { clsx } from "clsx";
import type { BuildingTile } from "@/pages/CampusMap/useCampusMap";
import type { BuildingId, StorylineMeta } from "@/data/storylinesMeta";
import type { LineState } from "@/lib/gameSave";

interface LineListPanelProps {
  tiles: BuildingTile[];
  onOpen: (line: StorylineMeta) => void;
  /** 维修中的楼（批次 AP）：对应条目挂「维修中」角标——门锁着，今天进不去 */
  maintenanceBuilding?: BuildingId | null;
  /** 场景腐烂（批次 BD）：按楼查褪色等级（0=完好 1=有点褪色 2=快想不起来自己了） */
  decayOf?: (buildingId: BuildingId) => 0 | 1 | 2;
  /** 进场错拍（批次 CH）：面板本体与条目按序落定；0 = 与页面同拍 */
  enterDelay?: number;
}

const STATE_META: Record<LineState, { label: string; className: string }> = {
  completed: { label: "已完成", className: "bg-primary/10 text-primary" },
  progress: { label: "进行中", className: "bg-muted text-muted-foreground" },
  ready: { label: "可开始", className: "border border-primary/50 text-primary" },
  locked: { label: "未解锁", className: "border border-dashed border-border text-muted-foreground" },
};

/** 右栏剧情线目录：与地图点位一一对应，点任意一条开卡片弹层 */
export function LineListPanel({ tiles, onOpen, maintenanceBuilding = null, decayOf, enterDelay = 0 }: LineListPanelProps) {
  const withLine = tiles.filter((tile): tile is BuildingTile & { line: StorylineMeta } => Boolean(tile.line));

  return (
    <aside
      className="anim-fade-up rounded-3xl border border-border bg-card p-5 shadow-lg"
      style={{ animationDelay: `${enterDelay}ms` }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-black tracking-tight text-card-foreground">剧情线一览</h2>
        <span className="text-xs text-muted-foreground">点建筑或点这里都能开始</span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {withLine.map((tile, index) => {
          const locked = tile.state === "locked";
          const maint = maintenanceBuilding === tile.building.id;
          const decay = decayOf?.(tile.building.id) ?? 0;
          const meta = STATE_META[tile.state];
          return (
            <button
              key={tile.building.id}
              type="button"
              onClick={() => onOpen(tile.line)}
              className={clsx(
                "anim-fade-up w-full rounded-2xl bg-background/60 p-4 text-left transition-all duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none",
                !locked && "hover:border-primary/60 border border-transparent hover:-translate-y-0.5",
                locked && "cursor-not-allowed opacity-70",
                maint && "opacity-80",
                decay >= 1 && "saturate-[.7]",
                decay >= 2 && "saturate-[.45] opacity-85",
              )}
              style={{ animationDelay: `${Math.min(enterDelay + 80 + index * 55, 900)}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-foreground">《{tile.line.title}》</span>
                {maint ? (
                  <span className="shrink-0 rounded-full border border-destructive/40 bg-destructive/5 px-2.5 py-0.5 text-xs font-bold text-destructive">
                    维修中
                  </span>
                ) : decay >= 1 ? (
                  <span className="shrink-0 rounded-full border border-dashed border-border bg-muted/40 px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                    {decay >= 2 ? "褪色 · 快想不起来自己了" : "有点褪色"}
                  </span>
                ) : (
                  <span className={clsx("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", meta.className)}>
                    {meta.label}
                  </span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {maint
                  ? "门上贴着告示：维修中。不另通知。"
                  : decay >= 2
                    ? "这栋楼有一阵子没被翻开了。它快想不起来自己了——再不来，它就要把自己关了。"
                    : decay >= 1
                      ? "这栋楼有点褪色。你不来的地方，会自己淡下去。"
                      : locked && tile.lockHint
                        ? tile.lockHint
                        : tile.line.intro}
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5 font-bold">{tile.building.label}</span>
                <span>{tile.line.actCount} 幕</span>
                <span className="ml-auto text-primary" aria-hidden>
                  {"★".repeat(tile.line.memeLevel)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
