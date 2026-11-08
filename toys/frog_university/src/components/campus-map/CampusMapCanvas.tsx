import { useState } from "react";
import { clsx } from "clsx";
import { REGULAR_LINE_IDS, type BuildingId, type StorylineMeta } from "@/data/storylinesMeta";
import type { BuildingTile, NightSpotState } from "@/pages/CampusMap/useCampusMap";
import { RichText } from "@/components/common/RichText";

interface CampusMapCanvasProps {
  tiles: BuildingTile[];
  hoverBuilding: BuildingId | null;
  onHoverChange: (buildingId: BuildingId | null) => void;
  onOpen: (line: StorylineMeta) => void;
  /** 深夜入口状态：今晚有事件 / 当日已触发（不渲染）/ 全部看完（置灰） */
  nightState: NightSpotState;
  /** 今晚的深夜事件标题（入口浮层用） */
  tonightTitle: string;
  onOpenNight: () => void;
  /** 已认定的蛙所在建筑（地图上挂「认定」徽章；null = 未认定，批次 C1） */
  lockedBuilding: BuildingId | null;
  /** 维修中的楼（批次 AP）：门锁着，贴告示——不提前通知，到了门口才知道；null = 今天不修 */
  maintenanceBuilding?: BuildingId | null;
  /** 场景腐烂（批次 BD）：按楼查褪色等级（1=有点褪色 2=快想不起来自己了） */
  decayOf?: (buildingId: BuildingId) => 0 | 1 | 2;
  /** 还剩几段夜里的事没经历过（批次 CY-32）：入口浮层的进度感 */
  nightRemaining?: number;
  /** 雾天（批次 CY-90）：建筑轮廓随雾呼吸隐现，悬停的那栋照常清晰 */
  foggy?: boolean;
}

const MAP_WIDTH = 820;
const MAP_HEIGHT = 560;

/** 深夜入口在平面图上的落点（食堂与操场之间的小空地） */
const NIGHT_SPOT_X = 388;
const NIGHT_SPOT_Y = 344;

const ROAD_PATHS = [
  "M150 214 L148 326",
  "M192 386 C 240 400 268 418 288 440",
  "M212 182 C 320 130 430 118 498 138",
  "M566 178 C 590 210 604 240 608 272",
  "M384 460 C 450 486 520 486 562 478",
  "M628 362 C 638 396 642 420 640 446",
  /* 自习楼支路：从教学楼-食堂的纵向路中段分叉向西 */
  "M148 268 C 122 272 100 280 82 292",
  /* 行政楼支路：从图书馆-社团的纵向路中段分叉向东北 */
  "M590 208 C 630 190 656 172 686 158",
  /* 医务室支路（第十条线）：从教学楼-图书馆的横向路北段向南接一小段 */
  "M390 128 L392 166",
];

/** 建筑角标三态：已完成 / 进行中 / 未解锁（未开始不挂角标） */
function StateBadge({ state }: { state: BuildingTile["state"] }) {
  if (state === "completed") {
    return (
      <g transform="translate(46 -46)">
        <circle r="13" fill="var(--primary)" />
        <path
          d="M-5.5 0.5 L-1.5 5 L6 -5"
          stroke="var(--frog-eye)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }
  if (state === "progress") {
    return (
      <g transform="translate(46 -46)">
        <circle r="13" fill="var(--frog-belly)" stroke="var(--primary)" strokeWidth="3" />
        <circle r="4.5" fill="var(--primary)" />
      </g>
    );
  }
  if (state === "locked") {
    return (
      <g transform="translate(46 -46)">
        <circle r="13" fill="var(--frog-apron)" stroke="var(--frog-apron-line)" strokeWidth="2" />
        <rect x="-5" y="-1.5" width="10" height="8" rx="2" fill="var(--frog-bag)" />
        <path d="M-3.5 -1.5 v-2.5 a3.5 3.5 0 0 1 7 0 v2.5" stroke="var(--frog-bag)" strokeWidth="2" fill="none" />
      </g>
    );
  }
  return null;
}

/** 路线认定徽章：本学期认定的蛙所在建筑，左上角挂一枚「认」字小圆标（与右上角进度角标错开） */
function RouteBadge() {
  return (
    <g transform="translate(-46 -46)">
      <circle r="13" fill="var(--primary)" stroke="var(--card)" strokeWidth="2.5" />
      <text y="4.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-belly)">
        认
      </text>
    </g>
  );
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="-2" width="6" height="14" rx="3" fill="var(--map-wood)" />
      <circle cx="0" cy="-12" r="12" fill="var(--map-leaf)" />
      <circle cx="-9" cy="-6" r="8" fill="var(--map-leaf)" />
      <circle cx="9" cy="-6" r="8" fill="var(--map-leaf)" />
    </g>
  );
}

/** 十座建筑的矢量形象（各绑定一只奶蛙的主题色） */
function BuildingShape({ id }: { id: BuildingId }) {
  switch (id) {
    case "teaching":
      return (
        <g>
          <rect x="-58" y="-34" width="116" height="68" rx="8" fill="var(--frog-cream)" />
          <rect x="-62" y="-44" width="124" height="14" rx="7" fill="var(--frog-cream-deep)" />
          {[-42, -16, 10].map((wx) => (
            <rect key={`tw-${wx}`} x={wx} y="-18" width="14" height="14" rx="3" fill="var(--frog-belly)" />
          ))}
          <rect x="-44" y="8" width="14" height="14" rx="3" fill="var(--frog-belly)" />
          <rect x="30" y="8" width="14" height="14" rx="3" fill="var(--frog-belly)" />
          <rect x="-12" y="12" width="24" height="22" rx="4" fill="var(--map-wood)" />
        </g>
      );
    case "library":
      return (
        <g>
          <polygon points="-64,-22 64,-22 0,-50" fill="var(--frog-matcha-deep)" />
          <rect x="-56" y="-22" width="112" height="44" rx="4" fill="var(--frog-matcha)" />
          {[-42, -15, 12, 39].map((cx) => (
            <rect key={`lc-${cx}`} x={cx} y="-14" width="9" height="28" rx="2" fill="var(--frog-belly)" />
          ))}
          <rect x="-62" y="22" width="124" height="10" rx="5" fill="var(--frog-matcha-deep)" />
        </g>
      );
    case "canteen":
      return (
        <g>
          <rect x="-54" y="-26" width="108" height="52" rx="8" fill="var(--frog-khaki)" />
          <rect x="-58" y="-34" width="116" height="12" rx="6" fill="var(--frog-berry-deep)" />
          {[-46, -23, 0, 23, 46].map((cx) => (
            <circle key={`cs-${cx}`} cx={cx} cy="-22" r="5" fill="var(--frog-berry-deep)" />
          ))}
          <rect x="-44" y="2" width="16" height="12" rx="3" fill="var(--frog-belly)" />
          <rect x="28" y="2" width="16" height="12" rx="3" fill="var(--frog-belly)" />
          <rect x="-12" y="4" width="24" height="22" rx="4" fill="var(--map-wood)" />
          <path d="M-30 -40 q4 -6 0 -12" stroke="var(--frog-apron)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.9" />
          <path d="M30 -40 q-4 -6 0 -12" stroke="var(--frog-apron)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.9" />
        </g>
      );
    case "field":
      return (
        <g>
          <ellipse rx="74" ry="42" fill="var(--frog-berry-deep)" />
          <ellipse rx="54" ry="26" fill="var(--map-grass)" />
          <ellipse rx="64" ry="34" fill="none" stroke="var(--frog-belly)" strokeWidth="2" strokeDasharray="9 7" />
        </g>
      );
    case "club":
      return (
        <g>
          <path d="M-70 -44 L-52 -22" stroke="var(--frog-ink)" strokeWidth="1.5" fill="none" />
          <circle cx="-72" cy="-48" r="9" fill="var(--frog-berry)" />
          <path d="M68 -48 L52 -24" stroke="var(--frog-ink)" strokeWidth="1.5" fill="none" />
          <circle cx="70" cy="-52" r="8" fill="var(--frog-matcha)" />
          <rect x="-52" y="-28" width="104" height="56" rx="10" fill="var(--frog-bluegray)" />
          <path d="M0 -28 L0 -50" stroke="var(--frog-ink)" strokeWidth="3" />
          <polygon points="0,-50 24,-44 0,-38" fill="var(--frog-berry)" />
          {[-32, 0, 32].map((cx) => (
            <rect key={`cw-${cx}`} x={cx - 8} y="-16" width="16" height="14" rx="3" fill="var(--frog-belly)" />
          ))}
          <rect x="-12" y="8" width="24" height="20" rx="4" fill="var(--map-wood)" />
        </g>
      );
    case "lake":
      return (
        <g>
          <rect x="-44" y="-4" width="88" height="14" rx="5" fill="var(--map-wood)" />
          <rect x="-34" y="8" width="7" height="16" rx="3" fill="var(--map-wood)" />
          <rect x="27" y="8" width="7" height="16" rx="3" fill="var(--map-wood)" />
          <rect x="-2" y="-34" width="4" height="30" rx="2" fill="var(--map-wood)" />
          <circle cx="0" cy="-40" r="8" fill="var(--frog-badge)" stroke="var(--map-wood)" strokeWidth="2" />
        </g>
      );
    case "study":
      return (
        <g>
          {/* 自习楼：瘦高一栋，四层窗格里总有几格亮着 */}
          <rect x="-34" y="-58" width="68" height="104" rx="8" fill="var(--frog-zzaizai)" />
          <rect x="-38" y="-66" width="76" height="12" rx="6" fill="var(--frog-zzaizai-deep)" />
          <circle cx="0" cy="-70" r="4" fill="var(--frog-bow)" />
          {[-48, -30, -12, 6].map((wy, row) =>
            [-25, -7, 11].map((wx, col) => {
              const lit = (row * 3 + col) % 4 === 1;
              return (
                <rect
                  key={`sw-${wy}-${wx}`}
                  x={wx}
                  y={wy}
                  width="13"
                  height="11"
                  rx="2.5"
                  fill={lit ? "var(--frog-badge)" : "var(--frog-belly)"}
                  opacity={lit ? 1 : 0.55}
                />
              );
            }),
          )}
          <rect x="-10" y="24" width="20" height="22" rx="4" fill="var(--map-wood)" />
        </g>
      );
    case "admin":
      return (
        <g>
          {/* 行政楼：方正一栋，楼顶旗杆 + 一扇盖章窗口 */}
          <rect x="-2" y="-66" width="4" height="24" rx="2" fill="var(--map-wood)" />
          <polygon points="2,-66 26,-59 2,-52" fill="var(--frog-berry)" />
          <rect x="-52" y="-36" width="104" height="76" rx="6" fill="var(--frog-gege)" />
          <rect x="-56" y="-44" width="112" height="12" rx="6" fill="var(--frog-gege-deep)" />
          {[-26, -4].map((wy) =>
            [-40, -14, 12].map((wx) => (
              <rect
                key={`aw-${wy}-${wx}`}
                x={wx}
                y={wy}
                width="18"
                height="14"
                rx="2.5"
                fill="var(--frog-belly)"
              />
            )),
          )}
          <rect x="6" y="14" width="30" height="24" rx="3" fill="var(--frog-belly)" stroke="var(--frog-bag)" strokeWidth="2" />
          <circle cx="21" cy="24" r="5.5" fill="var(--frog-bow)" />
          <path d="M12 33 h18" stroke="var(--frog-bag)" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="-28" y="14" width="22" height="26" rx="3" fill="var(--map-wood)" />
        </g>
      );
    case "dorm":
      return (
        <g>
          {/* 宿舍楼：六层楼一栋，窗格都暗着，只留楼角一盏绿应急灯 */}
          <rect x="-44" y="-48" width="88" height="94" rx="6" fill="var(--frog-bluegray)" />
          <rect x="-48" y="-56" width="96" height="12" rx="6" fill="var(--frog-bluegray-deep)" />
          <circle cx="0" cy="-60" r="3.5" fill="var(--frog-bow)" />
          {[-34, -14, 6, 26].map((wy, row) =>
            [-28, -6, 16].map((wx, col) => {
              const lamp = row === 0 && col === 2;
              return (
                <rect
                  key={`dw-${wy}-${wx}`}
                  x={wx}
                  y={wy}
                  width="14"
                  height="12"
                  rx="2.5"
                  fill={lamp ? "var(--frog-matcha)" : "var(--frog-belly)"}
                  opacity={lamp ? 0.95 : 0.6}
                />
              );
            }),
          )}
          <rect x="-11" y="20" width="22" height="26" rx="4" fill="var(--map-wood)" />
        </g>
      );
    case "infirmary":
      return (
        <g>
          {/* 医务室（第十条线）：矮平房一栋，屋顶红十字，两扇薄荷绿的窗 */}
          <rect x="-42" y="-30" width="84" height="66" rx="8" fill="var(--frog-mianmian)" />
          <rect x="-46" y="-38" width="92" height="12" rx="6" fill="var(--frog-mianmian-deep)" />
          <rect x="-9" y="-54" width="18" height="16" rx="4" fill="var(--frog-belly)" />
          <path d="M0 -51 v10 M-5 -46 h10" stroke="var(--frog-bow)" strokeWidth="3.4" strokeLinecap="round" />
          {[-30, 12].map((wx) => (
            <rect
              key={`ifw-${wx}`}
              x={wx}
              y="-14"
              width="18"
              height="18"
              rx="3"
              fill="var(--frog-belly)"
              opacity="0.92"
            />
          ))}
          <rect x="-9" y="8" width="18" height="28" rx="3" fill="var(--map-wood)" />
        </g>
      );
    default:
      return null;
  }
}

/** 深夜入口：灯柱上的月亮标 + 轻微发光；全部看完后置灰 */
function NightSpot({
  done,
  onOpen,
  onHoverChange,
}: {
  done: boolean;
  onOpen: () => void;
  onHoverChange: (hovering: boolean) => void;
}) {
  return (
    <g transform={`translate(${NIGHT_SPOT_X} ${NIGHT_SPOT_Y})`}>
      <g
        className={clsx("map-building", done ? "map-locked" : "night-spot-glow")}
        tabIndex={0}
        role="button"
        aria-label={done ? "深夜事件：都看过了" : "深夜事件：今晚有一段没看过的小场景"}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        onFocus={() => onHoverChange(true)}
        onBlur={() => onHoverChange(false)}
        onClick={() => {
          if (done) return;
          onOpen();
        }}
        onKeyDown={(keyboardEvent) => {
          if (done) return;
          if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
            keyboardEvent.preventDefault();
            onOpen();
          }
        }}
      >
        <circle r="27" fill="var(--primary)" opacity={done ? 0.06 : 0.14} />
        <rect x="-3" y="0" width="6" height="22" rx="3" fill="var(--map-wood)" />
        <circle
          cy="-13"
          r="15"
          fill="var(--frog-badge)"
          opacity={done ? 0.5 : 1}
          stroke="var(--map-wood)"
          strokeWidth="2.5"
        />
        <circle cx="4" cy="-16" r="7.5" fill="var(--frog-belly)" opacity={done ? 0.5 : 0.95} />
        {!done && <circle cx="19" cy="-24" r="2.2" fill="var(--frog-belly)" className="anim-float" />}
        <rect
          x={-((done ? 4 : 2) * 8 + 12)}
          y="45"
          width={(done ? 4 : 2) * 16 + 24}
          height="24"
          rx="12"
          fill="var(--card)"
          stroke="var(--border)"
          strokeWidth="1.5"
          filter="url(#labelShadow)"
        />
        <text
          y="62"
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
          stroke="var(--frog-belly)"
          strokeWidth="3.5"
          paintOrder="stroke"
          strokeLinejoin="round"
          className={done ? "fill-muted-foreground" : "fill-card-foreground"}
        >
          {done ? "都看过了" : "深夜"}
        </text>
      </g>
    </g>
  );
}

/** 手绘风校园平面图：八个建筑点位 + 树路云湖装饰 + 深夜入口 */
export function CampusMapCanvas({
  tiles,
  hoverBuilding,
  onHoverChange,
  onOpen,
  nightState,
  tonightTitle,
  onOpenNight,
  lockedBuilding,
  maintenanceBuilding = null,
  decayOf,
  nightRemaining,
  foggy = false,
}: CampusMapCanvasProps) {
  const [nightHover, setNightHover] = useState(false);
  const hoverTile = tiles.find((tile) => tile.building.id === hoverBuilding) ?? null;
  const tooltipBelow = hoverTile ? hoverTile.building.y < 140 : false;

  return (
    <div className="relative w-max min-w-full">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="h-auto w-full min-w-[560px] select-none sm:min-w-0"
        role="img"
        aria-label="奶蛙大学手绘校园平面图"
      >
        {/* 名牌落影（批次 CO 修）：轻投影让牌子从地图上「立」起来 */}
        <defs>
          <filter id="labelShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="var(--foreground)" floodOpacity="0.18" />
          </filter>
        </defs>
        {/* 草坪底 */}
        <rect x="6" y="6" width="808" height="548" rx="28" fill="var(--map-grass)" />
        <rect
          x="22"
          y="22"
          width="776"
          height="516"
          rx="22"
          fill="none"
          stroke="var(--map-grass-deep)"
          strokeWidth="3"
          strokeDasharray="2 12"
          strokeLinecap="round"
        />

        {/* 湖 */}
        <path
          d="M548 430 C 556 398 706 396 718 438 C 728 476 688 512 626 514 C 566 516 540 468 548 430 Z"
          fill="var(--map-water)"
        />
        <path d="M576 452 q14 8 28 0" stroke="var(--map-water-deep)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M622 470 q14 8 28 0" stroke="var(--map-water-deep)" strokeWidth="3" fill="none" strokeLinecap="round" />

        {/* 道路（底色 + 手绘虚线中线） */}
        <g fill="none" strokeLinecap="round">
          {ROAD_PATHS.map((d) => (
            <path key={`road-${d}`} d={d} stroke="var(--map-road)" strokeWidth="20" />
          ))}
          {ROAD_PATHS.map((d) => (
            <path key={`dash-${d}`} d={d} stroke="var(--frog-belly)" strokeWidth="2" strokeDasharray="10 12" opacity="0.8" />
          ))}
        </g>

        {/* 树 + 花 */}
        <Tree x={66} y={96} />
        <Tree x={232} y={66} s={0.85} />
        <Tree x={724} y={74} />
        <Tree x={766} y={236} s={0.9} />
        <Tree x={84} y={486} s={0.9} />
        <Tree x={210} y={516} s={0.8} />
        <Tree x={430} y={84} s={0.75} />
        <Tree x={770} y={336} s={0.8} />
        {[
          [300, 96],
          [470, 230],
          [250, 244],
          [86, 176],
          [420, 318],
          [360, 180],
        ].map(([fx, fy]) => (
          <circle key={`flower-${fx}-${fy}`} cx={fx} cy={fy} r="3.4" fill="var(--frog-berry)" opacity="0.8" />
        ))}

        {/* 云（缓慢飘动） */}
        <g className="anim-drift" opacity="0.95">
          <g transform="translate(150 46)">
            <ellipse rx="34" ry="14" fill="var(--map-cloud)" />
            <ellipse cx="-18" cy="6" rx="20" ry="10" fill="var(--map-cloud)" />
            <ellipse cx="18" cy="6" rx="22" ry="11" fill="var(--map-cloud)" />
          </g>
          <g transform="translate(520 34)">
            <ellipse rx="28" ry="12" fill="var(--map-cloud)" />
            <ellipse cx="16" cy="5" rx="18" ry="9" fill="var(--map-cloud)" />
          </g>
        </g>

        {/* 十座建筑（外层定位 / 内层 hover 缩放，避免 CSS transform 覆盖定位导致抖动） */}
        {tiles.map((tile, tileIndex) => {
          const locked = tile.state === "locked";
          const routed = lockedBuilding === tile.building.id;
          const maint = maintenanceBuilding === tile.building.id;
          /* 场景腐烂（批次 BD）：你不来的楼会自己褪色——地图上一眼看得出来 */
          const decay = decayOf?.(tile.building.id) ?? 0;
          return (
            <g key={tile.building.id} transform={`translate(${tile.building.x} ${tile.building.y})`}>
              <g
                className={clsx("map-building", foggy && `fog-breathe-${tileIndex % 3}`, locked && "map-locked", decay >= 1 && "saturate-[.65]", decay >= 2 && "saturate-[.4]")}
                tabIndex={0}
                role="button"
                aria-label={`${tile.building.label}${tile.line ? `：${tile.line.title}` : ""}${routed ? "（路线认定）" : ""}${maint ? "（维修中 · 门锁着）" : ""}${decay >= 2 ? "（褪色 · 快想不起来自己了）" : decay >= 1 ? "（有点褪色）" : ""}`}
                onMouseEnter={() => onHoverChange(tile.building.id)}
                onMouseLeave={() => onHoverChange(null)}
                onFocus={() => onHoverChange(tile.building.id)}
                onBlur={() => onHoverChange(null)}
                onClick={() => {
                  if (tile.line) onOpen(tile.line);
                }}
                onKeyDown={(keyboardEvent) => {
                  if (!tile.line) return;
                  if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                    keyboardEvent.preventDefault();
                    onOpen(tile.line);
                  }
                }}
              >
                <g opacity={maint ? 0.45 : decay >= 2 ? 0.72 : 1}>
                  <BuildingShape id={tile.building.id} />
                </g>
                {maint && (
                  <g transform="translate(0 -22) rotate(-6)" opacity="0.96">
                    <rect x="-32" y="-11" width="64" height="22" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.5" />
                    <text y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-ink)">
                      维修中
                    </text>
                  </g>
                )}
                <StateBadge state={tile.state} />
                {routed && <RouteBadge />}
                {/* 标签底牌（批次 CO 修：实心名牌——实心底 + 描边 + 落影，三主题下都钉得住） */}
                <rect
                  x={-(tile.building.label.length * 8 + 12)}
                  y="45"
                  width={tile.building.label.length * 16 + 24}
                  height="24"
                  rx="12"
                  fill="var(--card)"
                  stroke="var(--border)"
                  strokeWidth="1.5"
                  filter="url(#labelShadow)"
                />
                <text
                  y="62"
                  textAnchor="middle"
                  fontSize="16"
                  fontWeight="700"
                  stroke="var(--frog-belly)"
                  strokeWidth="3.5"
                  paintOrder="stroke"
                  strokeLinejoin="round"
                  className="fill-card-foreground"
                >
                  {tile.building.label}
                </text>
                {/* 结局收集角标（批次 CY-33）：收齐过至少一页才挂牌，没开始收集不打扰画面 */}
                {tile.lineProgress && !locked && tile.lineProgress.collected > 0 && (
                  <g transform="translate(0 84)">
                    <rect x="-34" y="-10" width="68" height="17" rx="8.5" fill="var(--card)" stroke="var(--border)" strokeWidth="1" opacity="0.94" />
                    <text y="2.5" textAnchor="middle" fontSize="10" fontWeight="700" className="fill-muted-foreground">
                      结局 {tile.lineProgress.collected}/{tile.lineProgress.total}
                    </text>
                  </g>
                )}
              </g>
            </g>
          );
        })}

        {/* 深夜入口（今晚有事件或已全部看完时出现；当日已触发则不渲染） */}
        {nightState !== "hidden" && (
          <NightSpot
            done={nightState === "done"}
            onOpen={onOpenNight}
            onHoverChange={setNightHover}
          />
        )}
      </svg>

      {/* hover 剧情线浮层（HTML，方便中文换行） */}
      {hoverTile?.line && (
        <div
          className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 rounded-2xl border border-border bg-card px-4 py-3 text-center shadow-xl"
          style={{
            left: `${(hoverTile.building.x / MAP_WIDTH) * 100}%`,
            top: tooltipBelow
              ? `calc(${(hoverTile.building.y / MAP_HEIGHT) * 100}% + 46px)`
              : `calc(${(hoverTile.building.y / MAP_HEIGHT) * 100}% - 74px)`,
          }}
        >
          <p className="text-sm font-bold text-card-foreground">《{hoverTile.line.title}》</p>
          {/* 剧情线完成度（批次 CY-33）：这一栋楼的结局图鉴收到哪一步了 */}
          {hoverTile.lineProgress && hoverTile.lineProgress.total > 0 && (
            <div className="mt-1.5 flex items-center justify-center gap-2">
              <span className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((hoverTile.lineProgress.collected / hoverTile.lineProgress.total) * 100)}%` }}
                />
              </span>
              <span className="text-[10px] font-bold text-muted-foreground">
                结局 {hoverTile.lineProgress.collected}/{hoverTile.lineProgress.total}
              </span>
            </div>
          )}
          {maintenanceBuilding === hoverTile.building.id && (
            <p className="mt-0.5 text-xs font-bold text-destructive">维修中 · 门锁着，今天进不去</p>
          )}
          {hoverTile.state === "locked" && (
            <p className="mt-0.5 text-xs font-bold text-primary">
              未解锁 · 完成{REGULAR_LINE_IDS.length}条常规线后开启
            </p>
          )}
          <RichText className="mt-1 text-xs leading-relaxed text-muted-foreground" text={hoverTile.line.intro} />
        </div>
      )}

      {/* 深夜入口浮层 */}
      {nightHover && nightState !== "hidden" && (
        <div
          className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 rounded-2xl border border-border bg-card px-4 py-3 text-center shadow-xl"
          style={{
            left: `${(NIGHT_SPOT_X / MAP_WIDTH) * 100}%`,
            top: `calc(${(NIGHT_SPOT_Y / MAP_HEIGHT) * 100}% + 46px)`,
          }}
        >
          {nightState === "done" ? (
            <>
              <p className="text-sm font-bold text-card-foreground">深夜事件 · 都看过了</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                夜里还是会有灯亮着，只是不再叫你了。一段都没落下。
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-card-foreground">《{tonightTitle}》</p>
              <p className="mt-0.5 text-xs font-bold text-primary">今晚 · 一段夜里才会发生的小场景</p>
              {/* 还剩几段（批次 CY-32）：夜也有一条能数完的路 */}
              {typeof nightRemaining === "number" && nightRemaining > 0 && (
                <p className="mt-1 text-[10px] font-bold text-muted-foreground/80">
                  这样的夜，还有 {nightRemaining} 段没经历过
                </p>
              )}
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                看完一段深夜事件，沉默值可能 ±1，说出口的真话会进罐子。
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
