/**
 * 奶蛙大学 · 舞台背景（宿舍线《熄灯之后》+ 图书馆线《卷王养成计划》+ 食堂线《已老实食堂》+ 社团线《抽象社团招新》表现层切片 · 资产层）
 * 17 张分层 SVG 舞台：宿舍线的楼道口 / 走廊 / 宿舍内（两张「断电后」同构图黑场差分），
 * 图书馆线的阅览区 / 借还处 / 公告栏，食堂线的打饭窗口（中午 / 深夜一盏灯 / 打烊）同机位三态差分。
 * 同构图差分读起来是同一个房间：走廊断电后只剩绿应急灯，宿舍断电后只剩床帘缝的一格光；
 * 阅览区「更深」与「凌晨」差分只有三处（台灯数量 / 空座数量 / 窗帘缝），注释逐条标明。
 * 颜色只引用主题 CSS 变量（--frog-* / --map-* 为完整 hsl 值；语义 token 一律 hsl(var(--token))），
 * 白色高光统一走 hsl(var(--background))，三套主题自动换装。
 */
import type { ReactElement } from "react";
import { clsx } from "clsx";
import { StageAmbience } from "@/components/play/StageAmbience";

/** 舞台背景组件：渲染一段 <g> 图层（与 CgArt 同约定，可嵌进任意 800x450 舞台 svg） */
export type StageSceneComponent = () => ReactElement;

/** 按注册表渲染对应舞台；id 未注册时不渲染（不崩）。之上叠一层纯 CSS 微动（批次 W：蒸汽 / 夜灯呼吸 / 波光 / 风线） */
export function StageBackground({ id, className }: { id: string; className?: string }) {
  const Scene = stageBackgroundById(id);
  if (!Scene) return null;
  return (
    <div aria-hidden className={clsx("absolute inset-0 overflow-hidden", className)}>
      <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" className="h-full w-full" role="presentation">
        <Scene />
      </svg>
      <StageAmbience id={id} />
    </div>
  );
}

/* ---------- 走廊：亮灯 / 断电共用同一套几何 ---------- */

/** 六扇门进深参数（u = 沿墙 0 近端 → 1 尽头），左右各三扇 */
const CORRIDOR_DOOR_SPANS: Array<[number, number]> = [
  [0.05, 0.28],
  [0.36, 0.52],
  [0.6, 0.72],
];

/** 走廊侧墙上的一扇门：透视四边形；vTop = 门顶离地高度比例（0.985 时是门缝透光条） */
function corridorDoorPoints(side: "l" | "r", ua: number, ub: number, vTop = 0.8): string {
  const at = (u: number) => {
    const x = 240 * u;
    const yFloor = 450 - 132 * u;
    const yCeil = 84 * u;
    const height = yFloor - yCeil;
    return { x: side === "l" ? x : 800 - x, yTop: yFloor - vTop * height, yBot: yFloor };
  };
  const a = at(ua);
  const b = at(ub);
  const p = (v: { x: number; yTop: number; yBot: number }, top: boolean) => `${v.x},${(top ? v.yTop : v.yBot).toFixed(1)}`;
  return `${p(a, true)} ${p(b, true)} ${p(b, false)} ${p(a, false)}`;
}

function CorridorScene({ powerOut }: { powerOut: boolean }) {
  const out = powerOut;
  return (
    <g>
      <defs>
        <linearGradient id="stage-corridor-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray-deep)" />
        </linearGradient>
        <radialGradient id="stage-lamp-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="hsl(var(--background))" stopOpacity="0.5" />
          <stop offset="1" stopColor="hsl(var(--background))" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="stage-corridor-green" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-matcha)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--frog-matcha)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 墙面基底 */}
      <rect x="0" y="0" width="800" height="450" fill={out ? "url(#stage-corridor-dark)" : "var(--frog-cream-deep)"} />
      {/* 天花 */}
      <polygon points="0,0 800,0 560,84 240,84" fill={out ? "var(--frog-ink)" : "var(--frog-cream)"} opacity={out ? 0.85 : 0.55} />
      {/* 远墙 */}
      <rect x="240" y="84" width="320" height="234" fill={out ? "var(--frog-ink)" : "var(--frog-cream)"} opacity={out ? 0.92 : 0.42} />
      {/* 地面 */}
      <polygon points="0,450 800,450 560,318 240,318" fill={out ? "var(--frog-ink)" : "var(--map-wood)"} opacity={out ? 0.95 : 0.5} />
      {/* 地面进深线 */}
      <path d="M240 318 L560 318" stroke={out ? "var(--frog-cream)" : "var(--frog-ink)"} strokeWidth="2" opacity={out ? 0.08 : 0.25} />
      <path d="M0 450 L240 318 M800 450 L560 318" stroke={out ? "var(--frog-cream)" : "var(--frog-ink)"} strokeWidth="1.6" opacity={out ? 0.07 : 0.18} fill="none" />

      {/* 六扇门（左右各三扇，进深透视；断电后同构图，只熄掉门缝透光） */}
      {(["l", "r"] as const).map((side) =>
        CORRIDOR_DOOR_SPANS.map(([ua, ub], i) => (
          <g key={`door-${side}-${i}`}>
            <polygon
              points={corridorDoorPoints(side, ua, ub)}
              fill={out ? "var(--frog-ink)" : "var(--frog-bluegray-deep)"}
              opacity={out ? 0.85 : 1}
            />
            <polygon
              points={corridorDoorPoints(side, ua, ub)}
              fill="none"
              stroke={out ? "var(--frog-cream)" : "var(--frog-ink)"}
              strokeWidth="1.4"
              opacity={out ? 0.08 : 0.28}
            />
            {!out && (
              <polygon points={corridorDoorPoints(side, ua, ub, 0.985)} fill="hsl(var(--background))" opacity="0.5" />
            )}
          </g>
        )),
      )}

      {/* 尽头的窗：亮灯时能看见对面楼还剩的几格，断电后只剩窗框轮廓 */}
      <g>
        <rect x="352" y="120" width="96" height="104" rx="4" fill="var(--frog-ink)" opacity={out ? 0.95 : 0.85} />
        {!out && (
          <g>
            <rect x="360" y="128" width="80" height="88" rx="2" fill="var(--frog-bluegray)" opacity="0.3" />
            <circle cx="422" cy="142" r="9" fill="var(--frog-belly)" opacity="0.8" />
            {[
              [368, 154],
              [386, 154],
              [404, 172],
              [420, 172],
              [368, 192],
              [404, 192],
            ].map(([wx, wy], i) => (
              <rect key={`cwin-${i}`} x={wx} y={wy} width="8" height="10" fill="var(--frog-badge)" opacity={i % 2 === 0 ? 0.5 : 0.22} />
            ))}
          </g>
        )}
        <path d="M400 120 L400 224 M352 172 L448 172" stroke="var(--frog-cream)" strokeWidth="2.5" opacity={out ? 0.1 : 0.38} fill="none" />
        <rect x="352" y="120" width="96" height="104" rx="4" fill="none" stroke="var(--map-wood)" strokeWidth="4" opacity={out ? 0.3 : 0.85} />
      </g>

      {/* 远墙公告栏（几何两态一致，只差亮度） */}
      <g opacity={out ? 0.35 : 1}>
        <rect x="268" y="142" width="62" height="46" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.85" />
        <rect x="273" y="147" width="52" height="36" rx="2" fill="var(--frog-belly)" opacity="0.92" />
        <path d="M278 156 h42 M278 164 h42 M278 172 h28" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.4" fill="none" />
      </g>

      {/* 亮灯层：三盏吸顶白灯 + 地面灯池 */}
      {!out && (
        <g>
          {[
            [400, 30, 96],
            [400, 58, 66],
            [400, 80, 44],
          ].map(([lx, ly, lw], i) => (
            <g key={`lamp-${i}`}>
              <ellipse cx={lx} cy={Number(ly) + 6} rx={Number(lw)} ry={Number(lw) * 0.5} fill="url(#stage-lamp-glow)" />
              <rect x={Number(lx) - Number(lw) / 2} y={Number(ly) - 4} width={Number(lw)} height="7" rx="3.5" fill="hsl(var(--background))" opacity="0.95" />
            </g>
          ))}
          <ellipse cx="400" cy="392" rx="190" ry="44" fill="hsl(var(--background))" opacity="0.13" />
          <ellipse cx="400" cy="344" rx="130" ry="28" fill="hsl(var(--background))" opacity="0.1" />
          <ellipse cx="400" cy="326" rx="86" ry="16" fill="hsl(var(--background))" opacity="0.08" />
          <ellipse cx="128" cy="438" rx="58" ry="10" fill="hsl(var(--background))" opacity="0.12" />
          <ellipse cx="672" cy="438" rx="58" ry="10" fill="hsl(var(--background))" opacity="0.12" />
        </g>
      )}

      {/* 断电层：绿应急灯接管整条走廊 */}
      {out && (
        <g>
          <circle cx="590" cy="150" r="112" fill="url(#stage-corridor-green)" />
          <rect x="556" y="136" width="68" height="26" rx="6" fill="var(--frog-bluegray-deep)" opacity="0.95" />
          <rect x="562" y="141" width="56" height="16" rx="4" fill="var(--frog-matcha)" />
          <g opacity="0.85">
            <circle cx="586" cy="147" r="2.4" fill="var(--frog-ink)" />
            <path d="M586 149 l-4 5.5 M586 149 l3 4.5 M589 147 l4 -2" stroke="var(--frog-ink)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </g>
          <path d="M604 150 h9 M604 155 h9" stroke="var(--frog-ink)" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" fill="none" />
          {/* 绿光锥与地面反光 */}
          <polygon points="556,164 624,164 676,450 424,450" fill="var(--frog-matcha)" opacity="0.08" />
          <ellipse cx="566" cy="396" rx="180" ry="38" fill="var(--frog-matcha)" opacity="0.1" />
          <ellipse cx="330" cy="422" rx="120" ry="24" fill="var(--frog-matcha)" opacity="0.05" />
          {/* 尽头另一盏应急灯，只剩一点绿意 */}
          <rect x="226" y="150" width="10" height="22" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.9" />
          <rect x="210" y="166" width="42" height="16" rx="4" fill="var(--frog-matcha)" opacity="0.5" />
        </g>
      )}
    </g>
  );
}

function BgCorridor() {
  return <CorridorScene powerOut={false} />;
}

function BgCorridorOut() {
  return <CorridorScene powerOut />;
}

/* ---------- 宿舍内：亮灯 / 断电共用同一套几何 ---------- */

function RoomScene({ powerOut }: { powerOut: boolean }) {
  const out = powerOut;
  return (
    <g>
      <defs>
        <linearGradient id="stage-room-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray-deep)" />
        </linearGradient>
        <radialGradient id="stage-room-lamp" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="stage-room-slit" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="hsl(var(--background))" stopOpacity="0.4" />
          <stop offset="1" stopColor="hsl(var(--background))" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 墙面：亮灯是暖白，断电后是黑场 */}
      <rect x="0" y="0" width="800" height="450" fill={out ? "url(#stage-room-dark)" : "var(--frog-cream-deep)"} />
      {!out && <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.18" />}
      {/* 墙裙 */}
      <path d="M0 300 h800" stroke={out ? "var(--frog-cream)" : "var(--map-wood)"} strokeWidth="3" opacity={out ? 0.06 : 0.4} fill="none" />
      {/* 地面 */}
      <rect x="0" y="366" width="800" height="84" fill={out ? "var(--frog-ink)" : "var(--map-wood)"} opacity={out ? 0.95 : 0.42} />
      <path d="M0 366 h800" stroke={out ? "var(--frog-cream)" : "var(--frog-ink)"} strokeWidth="2" opacity={out ? 0.06 : 0.25} fill="none" />

      {/* 窗外的夜色（几何两态一致：断电后窗里更黑、对面楼的格子全灭） */}
      <g>
        <rect x="596" y="70" width="150" height="128" rx="8" fill="var(--frog-ink)" opacity={out ? 0.96 : 0.85} />
        {!out && (
          <g>
            <circle cx="702" cy="100" r="13" fill="var(--frog-belly)" opacity="0.85" />
            {[
              [610, 96],
              [634, 96],
              [658, 96],
              [610, 122],
              [658, 122],
              [634, 150],
            ].map(([wx, wy], i) => (
              <rect key={`rwin-${i}`} x={wx} y={wy} width="9" height="11" fill="var(--frog-badge)" opacity={i % 3 === 0 ? 0.5 : 0.2} />
            ))}
          </g>
        )}
        <path d="M671 70 L671 198 M596 134 L746 134" stroke="var(--frog-cream)" strokeWidth="3" opacity={out ? 0.08 : 0.4} fill="none" />
        <rect x="596" y="70" width="150" height="128" rx="8" fill="none" stroke="var(--map-wood)" strokeWidth="6" opacity={out ? 0.3 : 0.85} />
      </g>

      {/* 上下铺（左侧）：床架、两级床板、爬梯 */}
      <g>
        <rect x="84" y="108" width="10" height="282" rx="3" fill="var(--frog-bag)" opacity={out ? 0.8 : 1} />
        <rect x="296" y="108" width="10" height="282" rx="3" fill="var(--frog-bag)" opacity={out ? 0.8 : 1} />
        {/* 上铺床板与被褥 */}
        <rect x="90" y="196" width="216" height="12" rx="4" fill="var(--frog-bag)" opacity={out ? 0.8 : 1} />
        <rect x="94" y="172" width="208" height="26" rx="8" fill={out ? "var(--frog-ink)" : "var(--frog-bluegray)"} opacity={out ? 0.9 : 0.9} />
        <rect x="98" y="166" width="52" height="18" rx="7" fill={out ? "var(--frog-ink)" : "var(--frog-belly)"} opacity="0.9" />
        {/* 下铺床板与被褥 */}
        <rect x="90" y="340" width="216" height="12" rx="4" fill="var(--frog-bag)" opacity={out ? 0.8 : 1} />
        <rect x="94" y="316" width="208" height="26" rx="8" fill={out ? "var(--frog-ink)" : "var(--frog-berry)"} opacity="0.85" />
        <rect x="98" y="310" width="52" height="18" rx="7" fill={out ? "var(--frog-ink)" : "var(--frog-belly)"} opacity="0.9" />
        {/* 爬梯 */}
        <path d="M258 200 v132 M286 200 v132 M258 232 h28 M258 268 h28 M258 304 h28" stroke="var(--frog-bag)" strokeWidth="5" opacity={out ? 0.7 : 0.95} fill="none" />
      </g>

      {/* 上铺床帘：横杆 + 左右两片帘布，中间留一道缝（断电后缝里漏出一格光） */}
      <g>
        <rect x="86" y="146" width="222" height="7" rx="3.5" fill="var(--frog-bag)" opacity={out ? 0.8 : 1} />
        {/* 帘缝里透出的光：先铺一层 */}
        <rect x="178" y="153" width="34" height="62" fill={out ? "hsl(var(--background))" : "var(--frog-ink)"} opacity={out ? 0.85 : 0.6} />
        {!out && <rect x="178" y="153" width="34" height="62" fill="var(--frog-bluegray-deep)" opacity="0.5" />}
        {/* 左右帘布（几何不变，断电后压暗） */}
        <path d="M92 153 h86 q-4 32 0 62 h-86 Z" fill={out ? "var(--frog-ink)" : "var(--frog-berry)"} opacity={out ? 0.92 : 0.85} />
        <path d="M212 153 h90 q-4 32 0 62 h-90 Z" fill={out ? "var(--frog-ink)" : "var(--frog-berry)"} opacity={out ? 0.92 : 0.85} />
        <path d="M112 153 q-3 32 0 62 M134 153 q-3 32 0 62 M156 153 q-3 32 0 62 M232 153 q-3 32 0 62 M256 153 q-3 32 0 62 M280 153 q-3 32 0 62" stroke={out ? "var(--frog-bluegray-deep)" : "var(--frog-berry-deep)"} strokeWidth="2" opacity={out ? 0.5 : 0.55} fill="none" />
        {/* 滑环 */}
        {[100, 124, 148, 172, 220, 244, 268, 292].map((rx) => (
          <circle key={`ring-${rx}`} cx={rx} cy="150" r="3.2" fill={out ? "var(--frog-bluegray-deep)" : "var(--frog-bag)"} />
        ))}
        {/* 断电层：缝里那一格光的光晕与落在床沿的光 */}
        {out && (
          <g>
            <ellipse cx="195" cy="184" rx="80" ry="52" fill="url(#stage-room-slit)" />
            <polygon points="178,215 212,215 246,340 150,340" fill="hsl(var(--background))" opacity="0.07" />
          </g>
        )}
      </g>

      {/* 书桌（右前）：桌面、抽屉、桌上的一摞书和杯子 */}
      <g>
        <rect x="452" y="308" width="252" height="14" rx="4" fill={out ? "var(--frog-ink)" : "var(--map-wood)"} opacity={out ? 0.92 : 1} />
        <rect x="466" y="322" width="18" height="66" rx="3" fill={out ? "var(--frog-ink)" : "var(--map-wood)"} opacity={out ? 0.92 : 0.9} />
        <rect x="672" y="322" width="18" height="66" rx="3" fill={out ? "var(--frog-ink)" : "var(--map-wood)"} opacity={out ? 0.92 : 0.9} />
        <rect x="500" y="322" width="150" height="40" rx="3" fill={out ? "var(--frog-ink)" : "var(--map-wood)"} opacity={out ? 0.85 : 0.75} />
        <path d="M575 322 v40" stroke={out ? "var(--frog-cream)" : "var(--frog-ink)"} strokeWidth="1.6" opacity={out ? 0.06 : 0.3} />
        <circle cx="575" cy="342" r="2.6" fill={out ? "var(--frog-cream)" : "var(--frog-ink)"} opacity={out ? 0.15 : 0.45} />
        {/* 桌上：一摞书 + 台灯 + 手机 */}
        <rect x="478" y="286" width="66" height="9" rx="2" fill={out ? "var(--frog-ink)" : "var(--frog-berry-deep)"} opacity="0.9" />
        <rect x="484" y="276" width="54" height="9" rx="2" fill={out ? "var(--frog-ink)" : "var(--frog-matcha-deep)"} opacity="0.9" />
        <rect x="490" y="266" width="42" height="9" rx="2" fill={out ? "var(--frog-ink)" : "var(--frog-bluegray-deep)"} opacity="0.9" />
        <rect x="606" y="266" width="12" height="42" rx="3" fill={out ? "var(--frog-ink)" : "var(--frog-bag)"} />
        <ellipse cx="612" cy="264" rx="10" ry="4" fill={out ? "var(--frog-ink)" : "var(--frog-bag)"} />
        <rect x="596" y="296" width="20" height="4" rx="2" fill={out ? "var(--frog-ink)" : "var(--frog-ink)"} opacity="0.6" />
        {/* 台灯（亮灯层才有光） */}
        <path d="M548 268 l16 -12 M564 256 l16 12" stroke={out ? "var(--frog-ink)" : "var(--frog-bag)"} strokeWidth="5" strokeLinecap="round" opacity="0.9" />
        {!out && <ellipse cx="564" cy="288" rx="46" ry="20" fill="var(--frog-badge)" opacity="0.18" />}
      </g>

      {/* 亮灯层：吸顶暖灯 */}
      {!out && (
        <g>
          <circle cx="400" cy="40" r="120" fill="url(#stage-room-lamp)" />
          <path d="M400 0 L400 26" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.4" />
          <ellipse cx="400" cy="34" rx="34" ry="10" fill="var(--frog-badge)" opacity="0.9" />
          <ellipse cx="400" cy="400" rx="230" ry="40" fill="var(--frog-badge)" opacity="0.08" />
        </g>
      )}

      {/* 断电层：整屋只剩床帘缝的那一格光 */}
      {out && (
        <g>
          {/* 墙上被光扫到的窄条 */}
          <rect x="176" y="216" width="38" height="84" fill="hsl(var(--background))" opacity="0.05" />
          {/* 桌沿接到的一线光 */}
          <rect x="452" y="308" width="90" height="3" fill="hsl(var(--background))" opacity="0.08" />
        </g>
      )}
    </g>
  );
}

function BgRoom() {
  return <RoomScene powerOut={false} />;
}

function BgRoomOut() {
  return <RoomScene powerOut />;
}

/* ---------- 楼道口：暖灯 + 充电宝柜绿灯 + 小黑板 ---------- */

function LobbyScene() {
  return (
    <g>
      <defs>
        <radialGradient id="stage-lobby-warm" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.42" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 暖调墙面与墙裙 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" />
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--primary))" opacity="0.05" />
      <rect x="0" y="302" width="800" height="80" fill="var(--frog-khaki)" opacity="0.5" />
      <path d="M0 302 h800" stroke="var(--map-wood)" strokeWidth="4" opacity="0.5" />
      {/* 地砖 */}
      <rect x="0" y="382" width="800" height="68" fill="var(--frog-cream)" opacity="0.9" />
      <path d="M0 382 h800 M100 382 v68 M240 382 v68 M400 382 v68 M560 382 v68 M700 382 v68 M0 418 h800" stroke="var(--frog-cream-deep)" strokeWidth="2.4" opacity="0.7" fill="none" />

      {/* 玻璃大门（右侧）：门外是夜里的校园 */}
      <g>
        <rect x="562" y="88" width="196" height="294" rx="8" fill="var(--frog-ink)" opacity="0.85" />
        <rect x="574" y="100" width="80" height="270" rx="4" fill="var(--frog-bluegray)" opacity="0.28" />
        <rect x="662" y="100" width="80" height="270" rx="4" fill="var(--frog-bluegray)" opacity="0.28" />
        {/* 门外的路灯与树影 */}
        <circle cx="614" cy="176" r="9" fill="var(--frog-badge)" opacity="0.6" />
        <path d="M614 176 v78" stroke="var(--frog-cream)" strokeWidth="3" opacity="0.16" />
        <ellipse cx="702" cy="240" rx="30" ry="40" fill="var(--frog-ink)" opacity="0.55" />
        <path d="M574 240 h80 M662 240 h80" stroke="var(--frog-cream)" strokeWidth="4" opacity="0.3" />
        <rect x="562" y="88" width="196" height="294" rx="8" fill="none" stroke="var(--map-wood)" strokeWidth="7" opacity="0.85" />
      </g>

      {/* 充电宝柜（左侧）：一柜子格子，几盏绿灯还亮着 */}
      <g>
        <rect x="70" y="150" width="128" height="232" rx="8" fill="var(--frog-bluegray-deep)" />
        <rect x="80" y="162" width="108" height="42" rx="4" fill="var(--frog-ink)" opacity="0.85" />
        <path d="M92 176 h62 M92 188 h44" stroke="hsl(var(--primary))" strokeWidth="3" opacity="0.7" strokeLinecap="round" />
        <circle cx="172" cy="182" r="4" fill="var(--frog-matcha)" opacity="0.9" />
        {/* 借还格子：4 行 5 列，部分亮着绿灯 */}
        {[0, 1, 2, 3].map((row) =>
          [0, 1, 2, 3, 4].map((col) => {
            const cx = 86 + col * 21;
            const cy = 216 + row * 38;
            const lit = (row * 5 + col) % 4 === 1;
            return (
              <g key={`slot-${row}-${col}`}>
                <rect x={cx} y={cy} width="16" height="28" rx="3" fill="var(--frog-ink)" opacity="0.7" />
                {lit && <circle cx={cx + 8} cy={cy + 32} r="2.4" fill="var(--frog-matcha)" />}
              </g>
            );
          }),
        )}
        <rect x="62" y="382" width="144" height="10" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.85" />
      </g>

      {/* 小黑板（中部）：粉笔字今晚的安排 */}
      <g>
        <rect x="256" y="118" width="222" height="150" rx="8" fill="var(--map-wood)" opacity="0.9" />
        <rect x="268" y="130" width="198" height="118" rx="4" fill="var(--frog-ink)" opacity="0.9" />
        <text x="282" y="164" fontSize="19" fontWeight="700" fill="var(--frog-cream)" opacity="0.92">
          今晚 23:00 断电
        </text>
        <text x="282" y="196" fontSize="14" fill="var(--frog-cream)" opacity="0.7">
          周日晚 查寝
        </text>
        <text x="282" y="222" fontSize="13" fill="var(--frog-cream)" opacity="0.5">
          充电宝剩 6 格
        </text>
        <path d="M300 238 q10 -8 20 0" stroke="var(--frog-cream)" strokeWidth="2" opacity="0.4" fill="none" />
        <rect x="262" y="268" width="210" height="10" rx="4" fill="var(--map-wood)" opacity="0.8" />
        <rect x="300" y="262" width="26" height="6" rx="3" fill="hsl(var(--background))" opacity="0.85" />
        <rect x="342" y="262" width="20" height="6" rx="3" fill="var(--frog-berry)" opacity="0.8" />
      </g>

      {/* 消防栓箱（小黑板右侧的墙面上） */}
      <g opacity="0.92">
        <rect x="500" y="150" width="44" height="58" rx="4" fill="var(--frog-berry-deep)" />
        <rect x="508" y="158" width="28" height="42" rx="3" fill="var(--frog-berry)" />
        <path d="M522 164 v30 M514 179 h16" stroke="hsl(var(--background))" strokeWidth="3" opacity="0.7" />
      </g>

      {/* 两盏暖灯：灯罩、光晕、地面光池 */}
      {[
        [340, 26, 150],
        [640, 40, 110],
      ].map(([lx, ly, lr], i) => (
        <g key={`wlamp-${i}`}>
          <circle cx={Number(lx)} cy={Number(ly) + 8} r={Number(lr)} fill="url(#stage-lobby-warm)" />
          <path d={`M${Number(lx)} 0 L${Number(lx)} ${Number(ly)}`} stroke="var(--frog-ink)" strokeWidth="3" opacity="0.4" />
          <path d={`M${Number(lx) - 26} ${Number(ly) + 10} L${Number(lx)} ${Number(ly)} L${Number(lx) + 26} ${Number(ly) + 10} Z`} fill="var(--frog-badge)" opacity="0.95" />
        </g>
      ))}
      <ellipse cx="340" cy="408" rx="200" ry="34" fill="var(--frog-badge)" opacity="0.14" />
      <ellipse cx="660" cy="398" rx="150" ry="26" fill="var(--frog-badge)" opacity="0.1" />
      {/* 门口的迎宾垫 */}
      <rect x="580" y="396" width="160" height="30" rx="6" fill="var(--frog-khaki-deep)" opacity="0.7" />
      <path d="M592 412 h136" stroke="var(--frog-khaki)" strokeWidth="3" opacity="0.6" />
    </g>
  );
}

/* ---------- 图书馆·阅览区：凌晨（hall）/ 更深（late）共用同一套几何 ----------
 * 「更深」差分只有三处，其余几何完全一致（保证两态读起来是同一间阅览室）：
 *   ① 台灯：hall 绿台灯全亮，late 约半数亮（两排各隔一盏熄一盏）；
 *   ② 座位：hall 座位坐满，late 空座变多（桌位比人多，只剩两只还在撑）；
 *   ③ 窗帘：hall 窗帘拉死不透天色，late 中间那扇漏出一线灰蓝。
 * 天花的长条日光灯不属于差分：整晚全亮，这正是「灯亮得像白天」的底。
 */

/** 阅览区灯位：[x, y, scale, 远排]；y 即桌面线（灯座立在桌面上） */
const HALL_LAMPS: Array<[number, number, number, boolean]> = [
  [176, 262, 0.78, true],
  [316, 262, 0.78, true],
  [456, 262, 0.78, true],
  [596, 262, 0.78, true],
  [116, 372, 1.08, false],
  [322, 372, 1.08, false],
  [528, 372, 1.08, false],
  [708, 372, 1.08, false],
];

/** 阅览区座位：[x, y, scale, 远排]；y 即桌面线（蛙坐在桌后，下半身被桌沿挡住） */
const HALL_SEATS: Array<[number, number, number, boolean]> = [
  [244, 262, 0.68, true],
  [386, 262, 0.68, true],
  [528, 262, 0.68, true],
  [216, 372, 1.0, false],
  [424, 372, 1.0, false],
  [620, 372, 1.0, false],
];

/** 阅览区的绿台灯：亮时在桌面上摊开一摊光 */
function HallLamp({ x, y, s, lit }: { x: number; y: number; s: number; lit: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {lit && <ellipse cx="0" cy="5" rx="32" ry="8" fill="url(#stage-hall-glow)" />}
      <ellipse cx="0" cy="0" rx="9" ry="3.2" fill="var(--frog-bag)" />
      <path d="M0 0 v-15" stroke="var(--frog-bag)" strokeWidth="2.6" fill="none" />
      <path d="M-13 -15 L13 -15 L9 -27 L-9 -27 Z" fill="var(--frog-matcha-deep)" />
      <path d="M-13 -15 L13 -15" stroke="var(--frog-matcha)" strokeWidth="1.8" opacity="0.85" fill="none" />
      {lit && <ellipse cx="0" cy="-13" rx="19" ry="5.5" fill="var(--frog-badge)" opacity="0.55" />}
    </g>
  );
}

/** 阅览区座位：空座只留椅背与椅面；有蛙就是一团低头写题的剪影 */
function HallSeat({ x, y, s, occupied }: { x: number; y: number; s: number; occupied: boolean }) {
  if (!occupied) {
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`} opacity="0.9">
        <rect x="-10" y="-34" width="20" height="30" rx="7" fill="var(--frog-bluegray-deep)" opacity="0.65" />
        <rect x="-13" y="-6" width="26" height="7" rx="3.5" fill="var(--frog-ink)" opacity="0.5" />
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="-15" rx="16" ry="14" fill="var(--frog-ink)" opacity="0.8" />
      <circle cx="0" cy="-33" r="9.5" fill="var(--frog-ink)" opacity="0.8" />
      <circle cx="2.6" cy="-32" r="1.6" fill="var(--frog-belly)" opacity="0.4" />
      <rect x="-14" y="-7" width="26" height="4.5" rx="2" fill="var(--frog-ink)" opacity="0.5" />
    </g>
  );
}

function LibraryHallScene({ late }: { late: boolean }) {
  return (
    <g>
      <defs>
        <radialGradient id="stage-hall-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="stage-hall-slit" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-bluegray)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--frog-bluegray)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 墙面与天花：凌晨，但灯亮如白天 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.14" />
      <rect x="0" y="0" width="800" height="66" fill="var(--frog-bluegray-deep)" opacity="0.18" />
      <path d="M0 66 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.14" fill="none" />

      {/* 天花上的长条日光灯：三个整晚全亮 */}
      {[110, 310, 510].map((x) => (
        <g key={`strip-${x}`}>
          <rect x={x} y="16" width="180" height="7" rx="3.5" fill="hsl(var(--background))" opacity="0.9" />
          <ellipse cx={x + 90} cy="36" rx="110" ry="15" fill="url(#stage-hall-glow)" opacity="0.45" />
        </g>
      ))}

      {/* 背墙三扇高窗：窗帘全部拉死（差分③只动中间那扇） */}
      {[
        [46, 216],
        [315, 485],
        [584, 754],
      ].map(([wx, ww], i) => (
        <g key={`win-${i}`}>
          <rect x={wx} y="78" width={ww - wx} height="166" rx="4" fill="var(--frog-ink)" opacity="0.85" />
          <rect x={wx + 6} y="84" width={ww - wx - 12} height="154" rx="2" fill="var(--frog-bluegray-deep)" opacity="0.9" />
          <path
            d={`M${wx + 26} 84 v154 M${wx + 52} 84 v154 M${wx + 78} 84 v154 M${wx + 104} 84 v154 M${wx + 130} 84 v154`}
            stroke="var(--frog-ink)"
            strokeWidth="2"
            opacity="0.3"
            fill="none"
          />
          <rect x={wx - 6} y="72" width={ww - wx + 12} height="6" rx="3" fill="var(--frog-bag)" opacity="0.9" />
          <rect x={wx} y="78" width={ww - wx} height="166" rx="4" fill="none" stroke="var(--map-wood)" strokeWidth="5" opacity="0.85" />
        </g>
      ))}
      {/* late 差分③：中间那扇的窗帘缝，透进一线灰蓝，落到地上是一小块淡蓝 */}
      {late && (
        <g>
          <rect x="392" y="84" width="10" height="154" fill="var(--frog-bluegray)" opacity="0.6" />
          <ellipse cx="397" cy="160" rx="34" ry="86" fill="url(#stage-hall-slit)" />
          <polygon points="390,248 404,248 452,330 330,330" fill="var(--frog-bluegray)" opacity="0.07" />
        </g>
      )}

      {/* 挂钟：整层楼的表精确到五分钟，这块只精确到秒 */}
      <g>
        <circle cx="266" cy="112" r="15" fill="var(--frog-ink)" opacity="0.6" />
        <circle cx="266" cy="112" r="11.5" fill="hsl(var(--background))" opacity="0.16" />
        <path
          d="M266 112 L266 104 M266 112 L271 114"
          stroke="var(--frog-cream)"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.8"
          fill="none"
        />
      </g>

      {/* 地面与进深线 */}
      <rect x="0" y="248" width="800" height="202" fill="var(--map-wood)" opacity="0.5" />
      <path d="M0 248 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.2" fill="none" />
      <path d="M0 312 h800 M0 380 h800" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.12" fill="none" />

      {/* 远排长桌 + 近排长桌，桌上散着的书 */}
      <rect x="110" y="262" width="580" height="9" rx="3" fill="var(--map-wood)" opacity="0.95" />
      <rect x="116" y="271" width="568" height="14" rx="2" fill="var(--map-wood)" opacity="0.72" />
      <rect x="50" y="372" width="700" height="11" rx="3" fill="var(--map-wood)" />
      <rect x="58" y="383" width="684" height="20" rx="2" fill="var(--map-wood)" opacity="0.8" />
      <rect x="132" y="252" width="30" height="6" rx="1.5" fill="var(--frog-berry-deep)" opacity="0.75" />
      <rect x="470" y="250" width="34" height="6" rx="1.5" fill="var(--frog-matcha-deep)" opacity="0.7" />
      <rect x="604" y="362" width="38" height="7" rx="1.5" fill="var(--frog-bluegray-deep)" opacity="0.8" />
      <rect x="250" y="360" width="34" height="7" rx="1.5" fill="var(--frog-berry-deep)" opacity="0.7" />

      {/* 座位与台灯（差分①②都落在这两排上）：late 座位剩两格、台灯隔盏熄 */}
      {HALL_SEATS.map(([x, y, s], i) => (
        <HallSeat key={`seat-${i}`} x={x} y={y} s={s} occupied={late ? i % 3 === 0 : true} />
      ))}
      {HALL_LAMPS.map(([x, y, s], i) => (
        <HallLamp key={`lamp-${i}`} x={x} y={y} s={s} lit={late ? i % 2 === 1 : true} />
      ))}

      {/* 前景压暗一条，把视线收进阅览区 */}
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.16" />
    </g>
  );
}

function BgLibraryHall() {
  return <LibraryHallScene late={false} />;
}

function BgLibraryLate() {
  return <LibraryHallScene late />;
}

/* ---------- 图书馆·借还处：闭馆散场（闸机 / 喇叭 / 身后十七扇亮窗） ---------- */

/** 身后的亮窗：十九格里亮着十七扇（第一行十扇、第二行九扇，两扇已经黑了） */
const EXIT_WINDOWS: boolean[] = [
  true,
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  false,
  true,
  true,
  true,
  true,
];

function BgLibraryExit() {
  return (
    <g>
      <defs>
        <radialGradient id="stage-exit-lamp" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 墙面：闭馆前的借还处，顶灯只剩两盏 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.2" />
      <rect x="0" y="0" width="800" height="70" fill="var(--frog-bluegray-deep)" opacity="0.2" />

      {/* 身后一排亮窗：阅览区还亮着，十九格里亮着十七扇 */}
      <g>
        <rect x="40" y="100" width="720" height="140" rx="6" fill="var(--frog-ink)" opacity="0.88" />
        {EXIT_WINDOWS.map((lit, i) => {
          const row = i < 10 ? 0 : 1;
          const col = row === 0 ? i : i - 10;
          const cx = 74 + col * 66 + (row === 1 ? 16 : 0);
          const cy = 112 + row * 62;
          return (
            <g key={`ewin-${i}`}>
              <rect
                x={cx}
                y={cy}
                width="58"
                height="50"
                rx="3"
                fill={lit ? "var(--frog-badge)" : "var(--frog-bluegray-deep)"}
                opacity={lit ? 0.72 : 0.9}
              />
              <path d={`M${cx + 29} ${cy} v50`} stroke="var(--frog-ink)" strokeWidth="2" opacity="0.35" />
              {lit && <ellipse cx={cx + 29} cy={cy + 25} rx="38" ry="19" fill="url(#stage-exit-lamp)" opacity="0.3" />}
            </g>
          );
        })}
        <rect x="40" y="100" width="720" height="140" rx="6" fill="none" stroke="var(--map-wood)" strokeWidth="6" opacity="0.8" />
      </g>

      {/* 闭馆铃喇叭：挂在梁下，两声之后整层楼的灯开始一排一排灭 */}
      <g>
        <rect x="474" y="0" width="6" height="22" rx="3" fill="var(--frog-bag)" />
        <path d="M474 22 L486 22 L502 52 L458 52 Z" fill="var(--frog-bag)" />
        <ellipse cx="480" cy="52" rx="22" ry="4" fill="var(--frog-ink)" opacity="0.6" />
        <path d="M470 60 q10 7 20 0 M462 68 q18 11 36 0" stroke="var(--frog-cream)" strokeWidth="2.4" fill="none" opacity="0.26" />
      </g>

      {/* 挂牌与闭馆提示 */}
      <g>
        <path d="M368 70 v-12 M446 70 v-12" stroke="var(--frog-bag)" strokeWidth="2.4" opacity="0.8" fill="none" />
        <rect x="350" y="70" width="114" height="36" rx="5" fill="var(--frog-badge)" opacity="0.92" />
        <text x="407" y="94" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--frog-ink)" opacity="0.85">
          借还处
        </text>
        <rect x="560" y="88" width="104" height="26" rx="4" fill="var(--frog-cream)" opacity="0.9" />
        <text x="612" y="105" textAnchor="middle" fontSize="12" fill="var(--frog-ink)" opacity="0.7">
          22:00 闭馆
        </text>
      </g>

      {/* 门禁闸机：两台三叉臂，闭馆后亮着红灯 */}
      {[138, 208].map((gx) => (
        <g key={`gate-${gx}`}>
          <rect x={gx} y="298" width="30" height="76" rx="6" fill="var(--frog-bag)" opacity="0.95" />
          <rect x={gx + 4} y="306" width="22" height="10" rx="3" fill="var(--frog-ink)" opacity="0.7" />
          <circle cx={gx + 15} cy="330" r="3.4" fill="var(--frog-berry-deep)" />
          <path
            d={`M${gx + 15} 330 l24 -12 M${gx + 15} 330 l-2 26 M${gx + 15} 330 l-24 8`}
            stroke="var(--frog-cream)"
            strokeWidth="3.4"
            strokeLinecap="round"
            opacity="0.75"
            fill="none"
          />
        </g>
      ))}

      {/* 借还处柜台：还书口、扫码器、还回来的一摞书 */}
      <g>
        <rect x="286" y="302" width="260" height="13" rx="4" fill="var(--map-wood)" />
        <rect x="296" y="315" width="240" height="58" rx="3" fill="var(--map-wood)" opacity="0.82" />
        <path d="M416 315 v58" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.25" />
        <rect x="452" y="322" width="64" height="10" rx="4" fill="var(--frog-ink)" opacity="0.55" />
        <rect x="318" y="288" width="26" height="16" rx="3" fill="var(--frog-bag)" />
        <circle cx="331" cy="296" r="2.2" fill="var(--frog-matcha)" />
        <rect x="486" y="282" width="44" height="8" rx="2" fill="var(--frog-berry-deep)" opacity="0.85" />
        <rect x="490" y="274" width="38" height="8" rx="2" fill="var(--frog-matcha-deep)" opacity="0.85" />
        <rect x="494" y="266" width="32" height="8" rx="2" fill="var(--frog-bluegray-deep)" opacity="0.85" />
      </g>

      {/* 还书箱：塞到盖子合不上的那种 */}
      <g>
        <rect x="228" y="326" width="46" height="40" rx="5" fill="var(--frog-bag)" opacity="0.92" />
        <rect x="234" y="316" width="30" height="14" rx="2" fill="var(--frog-cream)" opacity="0.9" />
        <rect x="240" y="310" width="22" height="10" rx="2" fill="var(--frog-berry-deep)" opacity="0.85" />
      </g>

      {/* 地面与两盏顶灯的光池 */}
      <rect x="0" y="352" width="800" height="98" fill="var(--map-wood)" opacity="0.55" />
      <path d="M0 352 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.22" fill="none" />
      <path d="M0 402 h800" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.12" fill="none" />
      {[300, 620].map((lx) => (
        <g key={`lamp-${lx}`}>
          <circle cx={lx} cy="30" r="86" fill="url(#stage-exit-lamp)" />
          <rect x={lx - 30} y="26" width="60" height="7" rx="3.5" fill="hsl(var(--background))" opacity="0.9" />
          <ellipse cx={lx} cy="394" rx="120" ry="18" fill="var(--frog-badge)" opacity="0.12" />
        </g>
      ))}

      {/* 前景：收包的蛙影——书塞到一半，眼睛还在看门禁 */}
      <g>
        <ellipse cx="664" cy="406" rx="64" ry="13" fill="var(--frog-ink)" opacity="0.22" />
        <ellipse cx="664" cy="392" rx="27" ry="22" fill="var(--frog-ink)" />
        <circle cx="664" cy="362" r="14" fill="var(--frog-ink)" />
        <circle cx="659" cy="360" r="2.6" fill="var(--frog-belly)" opacity="0.4" />
        <circle cx="669" cy="360" r="2.6" fill="var(--frog-belly)" opacity="0.4" />
        <rect x="682" y="374" width="30" height="38" rx="9" fill="var(--frog-bag)" opacity="0.95" />
        <rect x="676" y="366" width="12" height="18" rx="2" fill="var(--frog-cream)" opacity="0.8" transform="rotate(-14 682 375)" />
        <path d="M652 380 q-8 8 -14 16" stroke="var(--frog-ink)" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
    </g>
  );
}

/* ---------- 图书馆·公告栏：十月傍晚（名单公示 / 举手机的蛙 / 侧光） ---------- */

/** 公示栏前的名单行：名字与学院是笔画，绩点是数字 */
const BOARD_ROWS = ["3.92", "3.87", "4.02", "3.76", "3.95", "3.71", "3.88", "3.83"];

function BgLibraryBoard() {
  return (
    <g>
      <defs>
        <linearGradient id="stage-board-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bluegray)" />
          <stop offset="1" stopColor="var(--frog-khaki)" />
        </linearGradient>
        <radialGradient id="stage-board-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 傍晚的天：西边还剩一点暖 */}
      <rect x="0" y="0" width="800" height="450" fill="url(#stage-board-dusk)" />
      <circle cx="96" cy="60" r="110" fill="url(#stage-board-sun)" />
      <circle cx="96" cy="60" r="15" fill="var(--frog-badge)" opacity="0.75" />
      <ellipse cx="300" cy="44" rx="60" ry="9" fill="hsl(var(--background))" opacity="0.25" />
      <ellipse cx="560" cy="30" rx="44" ry="7" fill="hsl(var(--background))" opacity="0.2" />

      {/* 教学楼外墙与傍晚侧光 */}
      <rect x="0" y="72" width="800" height="290" fill="var(--frog-cream-deep)" />
      <rect x="0" y="72" width="800" height="290" fill="var(--frog-khaki)" opacity="0.3" />
      <path d="M0 72 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.2" fill="none" />
      <polygon points="0,72 190,72 90,362 0,362" fill="var(--frog-badge)" opacity="0.12" />

      {/* 公示栏：玻璃橱窗占中，名单是唯一主角 */}
      <g>
        <rect x="238" y="96" width="324" height="262" rx="10" fill="var(--map-wood)" opacity="0.95" />
        <rect x="252" y="110" width="296" height="234" rx="5" fill="hsl(var(--background))" opacity="0.9" />
        <rect x="264" y="122" width="272" height="34" rx="3" fill="var(--frog-berry)" opacity="0.9" />
        <text x="400" y="145" textAnchor="middle" fontSize="16" fontWeight="700" fill="hsl(var(--background))" opacity="0.95">
          推荐免试研究生名单
        </text>
        <path d="M276 166 h248" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.4" fill="none" />
        {BOARD_ROWS.map((gpa, i) => {
          const ly = 186 + i * 17;
          return (
            <g key={`row-${i}`} opacity={i === 2 ? 0.95 : 0.6}>
              <path d={`M276 ${ly} h64`} stroke="var(--frog-ink)" strokeWidth="4.5" strokeLinecap="round" opacity="0.5" />
              <path d={`M352 ${ly} h84`} stroke="var(--frog-ink)" strokeWidth="4.5" strokeLinecap="round" opacity="0.32" />
              <text x="528" y={ly + 4} fontSize="10" fill="var(--frog-ink)" opacity="0.65">
                {gpa}
              </text>
            </g>
          );
        })}
        <text x="276" y="334" fontSize="10" fill="var(--frog-ink)" opacity="0.55">
          公示期：10 月 20 日 — 10 月 27 日 · 异议请交学工办
        </text>
        <g transform="rotate(-9 500 318)">
          <circle cx="500" cy="318" r="17" fill="none" stroke="var(--frog-berry-deep)" strokeWidth="2.4" opacity="0.8" />
          <text x="500" y="323" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--frog-berry-deep)" opacity="0.85">
            公示
          </text>
        </g>
        <polygon points="252,110 330,110 288,344 252,344" fill="hsl(var(--background))" opacity="0.16" />
      </g>

      {/* 台阶与地面 */}
      <rect x="0" y="362" width="800" height="88" fill="var(--map-road)" opacity="0.9" />
      <path d="M0 362 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.18" fill="none" />
      <rect x="214" y="348" width="372" height="14" rx="3" fill="var(--frog-khaki-deep)" opacity="0.9" />
      <rect x="206" y="334" width="388" height="14" rx="3" fill="var(--frog-khaki)" opacity="0.75" />

      {/* 围观的蛙：傍晚侧光从左来，影子都拖向右 */}
      <g>
        {/* 举着手机拍照的那只：屏幕亮光照亮半边脸 */}
        <g>
          <ellipse cx="172" cy="414" rx="56" ry="8" fill="var(--frog-ink)" opacity="0.16" />
          <ellipse cx="128" cy="398" rx="24" ry="20" fill="var(--frog-bag)" />
          <circle cx="128" cy="368" r="12.5" fill="var(--frog-bag)" />
          <circle cx="124" cy="366" r="2.2" fill="var(--frog-belly)" opacity="0.85" />
          <circle cx="132" cy="366" r="2.2" fill="var(--frog-belly)" opacity="0.85" />
          <path d="M146 386 L166 356" stroke="var(--frog-bag)" strokeWidth="6" strokeLinecap="round" fill="none" />
          <rect x="160" y="342" width="13" height="22" rx="3" fill="var(--frog-ink)" />
          <rect x="162" y="345" width="9" height="16" rx="1.5" fill="hsl(var(--background))" opacity="0.92" />
          <ellipse cx="150" cy="362" rx="17" ry="15" fill="hsl(var(--background))" opacity="0.1" />
        </g>
        {/* 仰着头看名单的那只 */}
        <g>
          <ellipse cx="428" cy="422" rx="46" ry="8" fill="var(--frog-ink)" opacity="0.16" />
          <ellipse cx="386" cy="404" rx="21" ry="18" fill="var(--frog-ink)" opacity="0.75" />
          <circle cx="386" cy="378" r="11" fill="var(--frog-ink)" opacity="0.75" />
          <circle cx="383" cy="376" r="2" fill="var(--frog-belly)" opacity="0.5" />
          <circle cx="390" cy="376" r="2" fill="var(--frog-belly)" opacity="0.5" />
        </g>
        {/* 也在拍的那只：屏幕反着傍晚的光 */}
        <g>
          <ellipse cx="698" cy="416" rx="50" ry="8" fill="var(--frog-ink)" opacity="0.16" />
          <ellipse cx="652" cy="398" rx="23" ry="19" fill="var(--frog-bag)" />
          <circle cx="652" cy="369" r="12" fill="var(--frog-bag)" />
          <circle cx="648" cy="367" r="2.1" fill="var(--frog-belly)" opacity="0.85" />
          <circle cx="656" cy="367" r="2.1" fill="var(--frog-belly)" opacity="0.85" />
          <rect x="620" y="378" width="12" height="20" rx="3" fill="var(--frog-ink)" transform="rotate(-18 626 388)" />
          <rect x="622" y="381" width="8" height="14" rx="1.5" fill="hsl(var(--background))" opacity="0.85" transform="rotate(-18 626 388)" />
        </g>
      </g>
    </g>
  );
}


/* ---------- 食堂·打饭窗口：中午 / 深夜 / 打烊共用同一套几何 ----------
 * 三态只动四样东西：天花灯管的明暗排布、整体暗部、窗口里外有没有队伍、
 * 「已老实」牌子是否翻面。late 与 noon 同机位，closing 是同一间屋子快关完灯。
 */

/** 食堂天花六根灯管：[x, 排号]。noon 全亮；late 只剩窗口那一盏；closing 灭到第三排（排号 ≥3 的黑） */
const CANTEEN_LAMPS: Array<[number, number]> = [
  [96, 1],
  [256, 1],
  [416, 1],
  [576, 1],
  [716, 2],
  [58, 3],
];

function CanteenScene({ mode }: { mode: "noon" | "late" | "closing" }) {
  return (
    <g>
      <defs>
        <radialGradient id="stage-canteen-noonglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="hsl(var(--background))" stopOpacity="0.35" />
          <stop offset="1" stopColor="hsl(var(--background))" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="stage-canteen-lampglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="stage-canteen-nightfall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" stopOpacity="0.78" />
          <stop offset="1" stopColor="var(--frog-ink)" stopOpacity="0.94" />
        </linearGradient>
      </defs>

      {/* 墙面：白天是亮堂的米色，深夜只剩灯锥里那一块能看清 */}
      <rect x="0" y="0" width="800" height="450" fill={mode === "noon" ? "var(--frog-cream-deep)" : "var(--frog-ink)"} />
      {mode === "noon" && <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.1" />}
      {/* 深夜/打烊：整面墙沉进暗里，窗口上方留一块被灯照亮的暖区 */}
      {mode !== "noon" && (
        <g>
          <rect x="0" y="0" width="800" height="450" fill="url(#stage-canteen-nightfall)" />
          <ellipse cx="400" cy="196" rx="250" ry="120" fill="url(#stage-canteen-lampglow)" opacity={mode === "late" ? 0.5 : 0.3} />
        </g>
      )}
      <rect x="0" y="0" width="800" height="54" fill="var(--frog-bluegray-deep)" opacity={mode === "noon" ? 0.16 : 0.5} />
      <path d="M0 54 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.16" fill="none" />

      {/* 天花灯管成排：差分全在这一行——noon 全亮 / late 只剩窗口那盏 / closing 灭到第三排 */}
      {CANTEEN_LAMPS.map(([x, row], i) => {
        const lit = mode === "noon" ? true : mode === "late" ? row === 1 && x === 416 : row >= 3;
        if (!lit && mode === "noon") return null;
        return (
          <g key={`lamp-${i}`}>
            <rect x={x} y="22" width="118" height="7" rx="3.5" fill={lit ? "hsl(var(--background))" : "var(--frog-bluegray-deep)"} opacity={lit ? 0.92 : 0.6} />
            {lit && <ellipse cx={x + 59} cy="44" rx="88" ry="13" fill="url(#stage-canteen-noonglow)" opacity="0.5" />}
          </g>
        );
      })}

      {/* 窗口台面：不锈钢横条，深夜里那盏灯把台面照出一条亮边 */}
      <rect x="0" y="228" width="800" height="14" rx="4" fill={mode === "noon" ? "var(--frog-bluegray)" : "var(--frog-bluegray-deep)"} opacity={mode === "noon" ? 0.9 : 0.85} />
      <rect x="0" y="242" width="800" height="26" rx="2" fill={mode === "noon" ? "hsl(var(--background))" : "var(--frog-bluegray-deep)"} opacity={mode === "noon" ? 0.85 : 0.5} />
      {mode !== "noon" && <rect x="120" y="242" width="560" height="26" fill="var(--frog-badge)" opacity="0.16" />}

      {/* 菜单牌：红底金字「元气煲」（差分：closing 时旁边多了翻过面的「已老实」牌子） */}
      <g>
        <rect x="300" y="66" width="200" height="74" rx="6" fill="var(--frog-berry-deep)" />
        <rect x="308" y="74" width="184" height="58" rx="4" fill="none" stroke="var(--frog-badge)" strokeWidth="2.5" opacity="0.75" />
        <text x="400" y="118" textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--frog-badge)" letterSpacing="6">
          元气煲
        </text>
        {mode === "noon" && (
          <g opacity="0.85">
            <rect x="268" y="88" width="56" height="30" rx="3" fill="var(--frog-cream)" />
            <path d="M268 88 L324 88 L296 118 Z" fill="var(--frog-cream-deep)" opacity="0.5" />
            <text x="296" y="108" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-ink)" opacity="0.55" transform="rotate(-8 296 103)">
              奋斗煲
            </text>
          </g>
        )}
        {mode === "closing" && (
          <g>
            <rect x="528" y="74" width="84" height="58" rx="4" fill="var(--frog-cream)" />
            <text x="570" y="110" textAnchor="middle" fontSize="17" fontWeight="800" fill="var(--frog-ink)" opacity="0.8">
              已老实
            </text>
            <path d="M534 82 h72" stroke="var(--frog-berry)" strokeWidth="2" opacity="0.5" />
          </g>
        )}
      </g>

      {/* 菜品分量公示表：总务处落款三个章（深夜里被灯照亮的那一小块） */}
      <g opacity={mode === "noon" ? 0.95 : 0.6}>
        <rect x="536" y="150" width="104" height="64" rx="3" fill="var(--frog-cream)" />
        <rect x="542" y="156" width="92" height="8" rx="2" fill="var(--frog-berry)" opacity="0.6" />
        <path d="M542 172 h84 M542 182 h84 M542 192 h60" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.28" fill="none" />
        <circle cx="560" cy="202" r="4" fill="var(--frog-berry)" opacity="0.5" />
        <circle cx="572" cy="204" r="4" fill="var(--frog-berry)" opacity="0.4" />
      </g>

      {/* 窗口后面：矮凳与摞好的饭盒（差分：closing 的饭盒扣盖摞三层） */}
      {mode !== "noon" && (
        <g>
          <rect x="356" y="286" width="88" height="10" rx="3" fill="var(--map-wood)" opacity="0.9" />
          <path d="M366 296 L362 342 M434 296 L438 342" stroke="var(--map-wood)" strokeWidth="5" opacity="0.85" />
          <g opacity={mode === "closing" ? 0.95 : 0.5}>
            {[0, 1, 2].map((n) => (
              <g key={`stack-${n}`} opacity={mode === "closing" || n === 0 ? 1 : 0.4}>
                <ellipse cx="400" cy={280 - n * 11} rx="34" ry="8" fill="var(--frog-cream-deep)" />
                <ellipse cx="400" cy={278 - n * 11} rx="34" ry="8" fill="var(--frog-bluegray-deep)" opacity="0.85" />
              </g>
            ))}
          </g>
        </g>
      )}
      {/* 中午的窗口后面：锅与勺的暗示（立绘会占住这里，背景只给台面上一口锅沿） */}
      {mode === "noon" && (
        <g opacity="0.9">
          <ellipse cx="400" cy="238" rx="64" ry="10" fill="var(--frog-bluegray-deep)" />
          <path d="M348 232 h104" stroke="var(--frog-ink)" strokeWidth="2.5" opacity="0.5" />
          <path d="M470 226 L486 210" stroke="var(--frog-cream)" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
        </g>
      )}

      {/* 中午的队伍：两根柱子之间拐过去的蛙影（深夜/打烊散去，只剩长椅那点光） */}
      {mode === "noon" &&
        [150, 258, 566, 648].map((x, i) => (
          <g key={`q-${i}`} opacity={0.5 + (i % 2) * 0.12}>
            <ellipse cx={x} cy="352" rx={i % 2 ? 22 : 26} ry={i % 2 ? 30 : 34} fill="var(--frog-bluegray-deep)" />
            <circle cx={x} cy={318 - (i % 2) * 4} r="12" fill="var(--frog-bluegray-deep)" />
            <ellipse cx={x} cy="392" rx="30" ry="8" fill="var(--frog-ink)" opacity="0.18" />
          </g>
        ))}
      {mode === "noon" && (
        <g>
          <rect x="108" y="120" width="22" height="212" fill="var(--frog-bluegray)" opacity="0.5" />
          <rect x="672" y="120" width="22" height="212" fill="var(--frog-bluegray)" opacity="0.5" />
        </g>
      )}

      {/* 深夜/打烊的长椅：摊着书的蛙影与一点台灯光 */}
      {mode !== "noon" && (
        <g opacity={mode === "late" ? 1 : 0.55}>
          <rect x="60" y="352" width="250" height="9" rx="3" fill="var(--map-wood)" opacity="0.85" />
          <path d="M74 361 v30 M286 361 v30" stroke="var(--map-wood)" strokeWidth="5" opacity="0.8" />
          {[104, 190].map((x, i) => (
            <g key={`bench-${i}`}>
              <ellipse cx={x} cy="344" rx="20" ry="14" fill="var(--frog-bluegray-deep)" />
              <circle cx={x} cy="330" r="9" fill="var(--frog-bluegray-deep)" />
              <rect x={x - 14} y="352" width="28" height="4" rx="1.5" fill="var(--frog-cream)" opacity="0.5" />
            </g>
          ))}
          <path d="M238 332 v-16" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.6" />
          <circle cx="238" cy="314" r="4" fill="var(--frog-badge)" opacity="0.8" />
          <ellipse cx="238" cy="322" rx="26" ry="12" fill="var(--frog-badge)" opacity="0.14" />
        </g>
      )}

      {/* 地面与进深线 */}
      <rect x="0" y="352" width="800" height="98" fill={mode === "noon" ? "var(--map-wood)" : "var(--frog-ink)"} opacity={mode === "noon" ? 0.42 : 0.6} />
      <path d="M0 352 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.18" fill="none" />
      {mode === "noon" && <path d="M0 404 h800" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.1" fill="none" />}

      {/* 打烊的最后一眼：地面上一条被灯照过的余光 */}
      {mode === "closing" && <ellipse cx="400" cy="392" rx="240" ry="26" fill="var(--frog-badge)" opacity="0.08" />}
      {/* 前景压暗一条 */}
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.16" />
    </g>
  );
}

function BgCanteenNoon() {
  return <CanteenScene mode="noon" />;
}

function BgCanteenLate() {
  return <CanteenScene mode="late" />;
}

function BgCanteenClosing() {
  return <CanteenScene mode="closing" />;
}


/* ---------- 社团·五态共用同一套画法：招新舞台 / 走廊尽头 / 复盘会 / 农家乐 / 灯灭 ----------
 * 情绪跨度最大的一条线：白天最热闹的舞台，到一学期里唯一没人管的十分钟。
 * farm 是全剧唯一一张户外场景，天色用十一月的冷调。
 */

/** 舞台的桌子：[x, y, 宽]，招新日成排 */
const CLUB_TABLES: Array<[number, number, number]> = [
  [92, 300, 118],
  [246, 300, 118],
  [436, 300, 118],
  [590, 300, 118],
];

function BgClubStage() {
  return (
    <g>
      <defs>
        <linearGradient id="stage-club-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.2" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* 白天最亮的一面：活动中心外墙与日光 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" />
      <rect x="0" y="0" width="800" height="200" fill="url(#stage-club-sky)" />
      {/* 横幅：迎风招展，「做最真实的自己」是全校同款 */}
      <g>
        <path d="M110 44 q290 -14 580 0 l-8 52 q-282 -12 -564 0 Z" fill="var(--frog-berry)" />
        <text x="400" y="82" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--frog-badge)" letterSpacing="4">
          加入我们，做最真实的自己！
        </text>
        <path d="M110 44 v-26 M690 44 v-26" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.5" />
      </g>
      {/* 音响架与气球拱门 */}
      <g>
        <rect x="30" y="118" width="52" height="120" rx="4" fill="var(--frog-ink)" opacity="0.75" />
        <circle cx="56" cy="132" r="9" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="56" cy="132" r="16" fill="var(--frog-ink)" opacity="0.2" />
      </g>
      {[
        [130, 150, "var(--frog-berry)"],
        [162, 132, "var(--frog-matcha)"],
        [194, 118, "var(--frog-badge)"],
        [610, 118, "var(--frog-berry)"],
        [642, 132, "var(--frog-matcha)"],
        [674, 150, "var(--frog-badge)"],
      ].map(([bx, by, fill], i) => (
        <g key={`balloon-${i}`}>
          <ellipse cx={Number(bx)} cy={Number(by)} rx="13" ry="16" fill={fill as string} opacity="0.9" />
          <path d={`M${Number(bx)} ${Number(by) + 16} q3 14 0 26`} stroke="var(--frog-ink)" strokeWidth="1.6" fill="none" opacity="0.5" />
        </g>
      ))}
      {/* 成排桌子与笑得很标准的蛙 */}
      {CLUB_TABLES.map(([x, y, w], i) => (
        <g key={`table-${i}`}>
          <rect x={x} y={y} width={w} height="10" rx="3" fill="var(--map-wood)" />
          <rect x={x + 6} y={y + 10} width={w - 12} height="18" rx="2" fill="var(--map-wood)" opacity="0.8" />
          <ellipse cx={x + w / 2} cy={y - 22} rx="22" ry="17" fill="var(--frog-bluegray-deep)" opacity="0.9" />
          <circle cx={x + w / 2} cy={y - 42} r="12" fill="var(--frog-bluegray-deep)" opacity="0.9" />
          <path d={`M${x + w / 2 - 5} ${y - 40} q5 6 10 0`} stroke="var(--frog-cream)" strokeWidth="2" fill="none" opacity="0.7" />
        </g>
      ))}
      {/* 报名的队伍：从桌前拐向柱子 */}
      {[130, 232, 560, 668].map((x, i) => (
        <g key={`q-${i}`} opacity={0.42 + (i % 2) * 0.14}>
          <ellipse cx={x} cy="388" rx="24" ry="28" fill="var(--frog-bluegray-deep)" />
          <circle cx={x} cy="352" r="12" fill="var(--frog-bluegray-deep)" />
          <ellipse cx={x} cy="424" rx="30" ry="8" fill="var(--frog-ink)" opacity="0.16" />
        </g>
      ))}
      <rect x="0" y="352" width="800" height="98" fill="var(--map-wood)" opacity="0.4" />
      <path d="M0 352 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.16" fill="none" />
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.14" />
    </g>
  );
}

/** 走廊尽头的坏灯管：[x]，一闪一闪（台词「她打气的节奏跟着灯走」） */
const CLUB_CORRIDOR_TUBES: Array<[number, boolean]> = [
  [150, true],
  [420, false],
  [640, true],
];

function BgClubCorridor() {
  return (
    <g>
      <defs>
        <radialGradient id="stage-club-flicker" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="hsl(var(--background))" stopOpacity="0.5" />
          <stop offset="1" stopColor="hsl(var(--background))" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 傍晚的走廊：活动中心灯亮一半 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.3" />
      {/* 走廊两侧的门与尽头 */}
      {[64, 216, 690].map((x, i) => (
        <g key={`door-${i}`}>
          <rect x={x} y="150" width="46" height="170" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.85" />
          <circle cx={x + 38} cy="238" r="2.5" fill="hsl(var(--background))" opacity="0.4" />
        </g>
      ))}
      <path d="M280 320 L800 320" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.14" fill="none" />
      {/* 坏灯管：两根亮一根黑，亮的那根在闪烁（光晕画两层） */}
      {CLUB_CORRIDOR_TUBES.map(([x, on], i) => (
        <g key={`tube-${i}`}>
          <rect x={x} y="58" width="120" height="7" rx="3.5" fill={on ? "hsl(var(--background))" : "var(--frog-bluegray-deep)"} opacity={on ? 0.95 : 0.6} />
          {on && <ellipse cx={x + 60} cy="82" rx="86" ry="16" fill="url(#stage-club-flicker)" opacity="0.55" />}
        </g>
      ))}
      {/* 走廊尽头的纸箱：迎新晚会布置（剩余 43 个） */}
      <g>
        <rect x="560" y="298" width="128" height="88" rx="4" fill="var(--map-wood)" />
        <rect x="560" y="298" width="128" height="88" rx="4" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.3" />
        <rect x="572" y="312" width="104" height="42" rx="2" fill="var(--frog-cream)" opacity="0.9" />
        <text x="624" y="330" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--frog-ink)" opacity="0.75">
          迎新晚会布置
        </text>
        <text x="624" y="346" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--frog-berry-deep)">
          剩余 43 个
        </text>
      </g>
      {/* 打气的蛙影：低着头，脚下是爆掉的气球皮 */}
      <g>
        <ellipse cx="352" cy="366" rx="30" ry="24" fill="var(--frog-bluegray-deep)" />
        <circle cx="352" cy="334" r="14" fill="var(--frog-bluegray-deep)" />
        <path d="M372 352 L394 336" stroke="var(--frog-ink)" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
        {[398, 414, 428].map((x, i) => (
          <path key={`pop-${i}`} d={`M${x} 388 q6 -8 12 0`} stroke="var(--frog-berry)" strokeWidth="2.5" fill="none" opacity="0.5" />
        ))}
      </g>
      <rect x="0" y="392" width="800" height="58" fill="var(--frog-ink)" opacity="0.2" />
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.16" />
    </g>
  );
}

function BgClubRoom() {
  return (
    <g>
      {/* 复盘会的活动室：灯管、长桌、投影幕 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" />
      <rect x="0" y="0" width="800" height="54" fill="var(--frog-bluegray-deep)" opacity="0.18" />
      {/* 投影幕：九宫格照片（三百张里选了九张） */}
      <g>
        <rect x="196" y="64" width="408" height="190" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.9" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <rect key={`cell-${r}-${c}`} x={224 + c * 122} y={86 + r * 54} width="104" height="40" rx="3" fill="var(--frog-cream)" opacity={r === 0 && c === 2 ? 0.15 : 0.75} />
          )),
        )}
        {/* 激光笔红点落在第三张上 */}
        <circle cx="598" cy="100" r="4" fill="var(--frog-berry)" />
        <circle cx="598" cy="100" r="9" fill="var(--frog-berry)" opacity="0.25" />
        <path d="M760 340 L600 104" stroke="var(--frog-berry)" strokeWidth="2" opacity="0.28" />
      </g>
      {/* 长桌与笔、值班表贴在公告栏 */}
      <rect x="120" y="318" width="560" height="11" rx="3" fill="var(--map-wood)" />
      <rect x="128" y="329" width="544" height="18" rx="2" fill="var(--map-wood)" opacity="0.8" />
      <rect x="0" y="196" width="86" height="112" rx="3" fill="var(--frog-cream)" opacity="0.85" />
      <path d="M8 214 h70 M8 226 h70 M8 238 h48" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.3" fill="none" />
      <text x="43" y="258" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
        值班表
      </text>
      {[214, 292, 470, 608].map((x, i) => (
        <g key={`att-${i}`}>
          <ellipse cx={x} cy="300" rx="24" ry="18" fill="var(--frog-bluegray-deep)" opacity="0.85" />
          <circle cx={x} cy="276" r="11" fill="var(--frog-bluegray-deep)" opacity="0.85" />
        </g>
      ))}
      <rect x="0" y="352" width="800" height="98" fill="var(--map-wood)" opacity="0.42" />
      <path d="M0 352 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.16" fill="none" />
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.14" />
    </g>
  );
}

function BgClubFarm() {
  return (
    <g>
      <defs>
        <linearGradient id="stage-club-skyfarm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bluegray)" />
          <stop offset="1" stopColor="var(--frog-cream-deep)" />
        </linearGradient>
      </defs>
      {/* 十一月的户外：天色冷调，地平线压低 */}
      <rect x="0" y="0" width="800" height="450" fill="url(#stage-club-skyfarm)" />
      <rect x="0" y="262" width="800" height="188" fill="var(--map-grass)" opacity="0.5" />
      <path d="M0 262 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.18" fill="none" />
      {/* 大巴车头（签到码贴在车门上） */}
      <g>
        <rect x="56" y="150" width="210" height="150" rx="14" fill="var(--frog-berry-deep)" opacity="0.9" />
        <rect x="72" y="168" width="120" height="52" rx="6" fill="var(--frog-bluegray-deep)" opacity="0.9" />
        <rect x="200" y="168" width="50" height="52" rx="6" fill="var(--frog-bluegray-deep)" opacity="0.85" />
        <circle cx="96" cy="312" r="16" fill="var(--frog-ink)" opacity="0.8" />
        <circle cx="232" cy="312" r="16" fill="var(--frog-ink)" opacity="0.8" />
        <rect x="96" y="238" width="46" height="30" rx="3" fill="var(--frog-cream)" />
        <path d="M102 246 h34 M102 254 h26 M102 262 h34" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.4" fill="none" />
      </g>
      {/* 烧烤架还没生火 */}
      <g>
        <rect x="520" y="252" width="150" height="14" rx="4" fill="var(--frog-ink)" opacity="0.7" />
        <path d="M536 266 L536 330 M654 266 L654 330" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.7" />
        <path d="M530 258 h130" stroke="var(--frog-cream)" strokeWidth="2" opacity="0.4" />
      </g>
      {/* 门口集合的蛙群：合照的架势，站成两排 */}
      {[384, 424, 464, 508].map((x, i) => (
        <g key={`row1-${i}`}>
          <ellipse cx={x} cy="322" rx="20" ry="15" fill="var(--frog-bluegray-deep)" />
          <circle cx={x} cy="304" r="9.5" fill="var(--frog-bluegray-deep)" />
        </g>
      ))}
      {[404, 444, 486].map((x, i) => (
        <g key={`row2-${i}`} opacity="0.8">
          <ellipse cx={x} cy="352" rx="21" ry="16" fill="var(--frog-bluegray-deep)" />
          <circle cx={x} cy="334" r="10" fill="var(--frog-bluegray-deep)" />
        </g>
      ))}
      {/* 签到码指示牌 */}
      <g>
        <rect x="700" y="248" width="9" height="86" fill="var(--map-wood)" />
        <rect x="668" y="216" width="72" height="40" rx="3" fill="var(--frog-cream)" />
        <rect x="676" y="224" width="30" height="24" rx="2" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.6" />
        <path d="M680 228 h4 M686 228 h4 M692 228 h4 M680 234 h4 M686 234 h4" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.55" />
        <text x="716" y="240" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
          签到
        </text>
      </g>
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.14" />
    </g>
  );
}

function BgClubDark() {
  return (
    <g>
      {/* 黑场：投影幕的残影与窗外一点路灯 */}
      <defs>
        <radialGradient id="stage-club-window" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" />
      {/* 窗：窗外是夜，只有一点路灯光 */}
      <rect x="596" y="76" width="120" height="120" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.8" />
      <path d="M596 136 h120 M656 76 v120" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.5" fill="none" />
      <ellipse cx="656" cy="120" rx="46" ry="42" fill="url(#stage-club-window)" />
      {/* 投影幕残影：断电后显像管还在散最后一点光 */}
      <rect x="196" y="64" width="408" height="190" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.55" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`ghost-${r}-${c}`} x={224 + c * 122} y={86 + r * 54} width="104" height="40" rx="3" fill="hsl(var(--background))" opacity={r === 0 && c === 2 ? 0.05 : 0.09} />
        )),
      )}
      {/* 长桌与凳子的轮廓 */}
      <rect x="120" y="318" width="560" height="11" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.7" />
      {[214, 292, 470, 608].map((x, i) => (
        <g key={`dark-${i}`}>
          <ellipse cx={x} cy="300" rx="24" ry="18" fill="var(--frog-bluegray-deep)" opacity="0.4" />
          <circle cx={x} cy="276" r="11" fill="var(--frog-bluegray-deep)" opacity="0.4" />
        </g>
      ))}
      {/* 地面上唯一一块没被排班的光 */}
      <ellipse cx="656" cy="360" rx="130" ry="34" fill="var(--frog-badge)" opacity="0.05" />
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.4" />
    </g>
  );
}


/* ---------- 操场·两个机位 + 一张夜差分：跑道远景 / 草坪黄昏 / 同机位夜 ----------
 * 黄昏光线是切片一至四没碰过的时段；夜差分与 dusk 同机位，只动三处（天色 / 坏灯 / 远处灯格）。
 */

/** 跑道上的跑步蛙影：全戴耳机，一圈一圈过 */
function LawnRunner({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g opacity="0.55" transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="15" ry="11" fill="var(--frog-bluegray-deep)" />
      <circle cx="0" cy="-16" r="8" fill="var(--frog-bluegray-deep)" />
      <path d="M-8 -18 h16" stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.6" />
      <path d="M-7 -14 q7 5 14 0" stroke="var(--frog-ink)" strokeWidth="1.6" fill="none" opacity="0.45" />
      <ellipse cx="0" cy="8" rx="20" ry="4.5" fill="var(--frog-ink)" opacity="0.16" />
    </g>
  );
}

function BgLawnTrack() {
  return (
    <g>
      {/* 傍晚六点半：天色橙灰渐变，跑道压低地平线 */}
      <defs>
        <linearGradient id="stage-lawn-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-berry)" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="var(--frog-cream-deep)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#stage-lawn-dusk)" />
      {/* 远处教学楼：灯还没亮 */}
      {[64, 150, 236, 540, 626, 712].map((x) => (
        <rect key={`bld-${x}`} x={x} y="128" width="66" height="104" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.5" />
      ))}
      {/* 看台一排 */}
      <g opacity="0.85">
        <path d="M0 300 h240 v-34 h-240 Z" fill="var(--frog-bluegray-deep)" opacity="0.55" />
        <path d="M0 288 h240 M0 274 h240" stroke="hsl(var(--background))" strokeWidth="2.5" opacity="0.25" />
        <path d="M560 300 h240 v-34 h-240 Z" fill="var(--frog-bluegray-deep)" opacity="0.55" />
        <path d="M560 288 h240 M560 274 h240" stroke="hsl(var(--background))" strokeWidth="2.5" opacity="0.25" />
      </g>
      {/* 草坪：跑道内的那片绿 */}
      <rect x="0" y="300" width="800" height="150" fill="var(--map-grass)" opacity="0.55" />
      <path d="M0 300 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.16" fill="none" />
      {/* 跑道：橘色塑胶，跑道上跑步的蛙影一圈一圈 */}
      <rect x="0" y="388" width="800" height="62" fill="var(--frog-berry-deep)" opacity="0.55" />
      <path d="M0 402 h800" stroke="hsl(var(--background))" strokeWidth="3" opacity="0.2" strokeDasharray="26 18" fill="none" />
      <LawnRunner x={120} y={408} />
      <LawnRunner x={392} y={416} s={1.12} />
      <LawnRunner x={664} y={404} />
      {/* 远处草坪正中央：那件被忘在原地的大衣 */}
      <g opacity="0.8">
        <ellipse cx="400" cy="326" rx="26" ry="7" fill="var(--frog-bluegray-deep)" opacity="0.7" />
        <ellipse cx="400" cy="322" rx="22" ry="9" fill="var(--frog-bluegray-deep)" />
        <circle cx="382" cy="316" r="8" fill="var(--frog-bluegray-deep)" />
      </g>
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.14" />
    </g>
  );
}

function LawnDuskScene({ night }: { night: boolean }) {
  return (
    <g>
      <defs>
        <linearGradient id="stage-lawn-close" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? "var(--frog-ink)" : "var(--frog-berry)"} stopOpacity={night ? 1 : 0.3} />
          <stop offset="1" stopColor={night ? "var(--frog-bluegray-deep)" : "var(--frog-cream-deep)"} stopOpacity={night ? 0.9 : 0.85} />
        </linearGradient>
        <radialGradient id="stage-lawn-lampglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#stage-lawn-close)" />
      {/* 远处教学楼：夜差分③——灯一格一格亮起 */}
      {[64, 150, 236, 540, 626, 712].map((x) => (
        <g key={`bld2-${x}`}>
          <rect x={x} y="128" width="66" height="104" rx="4" fill={night ? "var(--frog-ink)" : "var(--frog-bluegray-deep)"} opacity={night ? 0.9 : 0.5} />
          {night && (
            <g>
              <rect x={x + 12} y="140" width="14" height="12" fill="var(--frog-badge)" opacity="0.8" />
              <rect x={x + 36} y="140" width="14" height="12" fill="hsl(var(--background))" opacity="0.1" />
              <rect x={x + 12} y="164" width="14" height="12" fill="hsl(var(--background))" opacity="0.1" />
              <rect x={x + 36} y="164" width="14" height="12" fill="var(--frog-badge)" opacity="0.6" />
              <rect x={x + 12} y="188" width="14" height="12" fill="var(--frog-badge)" opacity="0.7" />
              <rect x={x + 36} y="188" width="14" height="12" fill="var(--frog-badge)" opacity="0.45" />
            </g>
          )}
        </g>
      ))}
      {/* 草坪铺满下半 */}
      <rect x="0" y="252" width="800" height="198" fill={night ? "var(--frog-ink)" : "var(--map-grass)"} opacity={night ? 0.85 : 0.6} />
      <path d="M0 252 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.18" fill="none" />
      {/* 坏灯：两黑一亮（差分②）。夜里好灯的光落在草坪上，坏的黑着 */}
      {[
        [180, true],
        [420, false],
        [640, false],
      ].map(([x, on], i) => (
        <g key={`pole-${i}`}>
          <path d={`M${x} 252 L${x} 96`} stroke="var(--frog-ink)" strokeWidth="4" opacity="0.6" />
          <rect x={Number(x) - 20} y="86" width="40" height="10" rx="4" fill={on ? "hsl(var(--background))" : "var(--frog-bluegray-deep)"} opacity={on ? 0.9 : 0.6} />
          {on && <ellipse cx={Number(x)} cy="120" rx="96" ry="26" fill="url(#stage-lawn-lampglow)" opacity={night ? 0.7 : 0.2} />}
        </g>
      ))}
      {/* 脚边的草与垫着的外套 */}
      <g>
        <path d="M150 448 l6 -18 M164 448 l-4 -22 M180 448 l4 -16" stroke={night ? "var(--frog-bluegray-deep)" : "var(--map-grass-deep)"} strokeWidth="3" opacity="0.6" />
        <path d="M626 448 l-6 -18 M612 448 l4 -22 M596 448 l-4 -16" stroke={night ? "var(--frog-bluegray-deep)" : "var(--map-grass-deep)"} strokeWidth="3" opacity="0.6" />
        <rect x="238" y="404" width="86" height="26" rx="8" fill="var(--frog-bluegray-deep)" opacity="0.9" />
        <path d="M246 404 q18 -10 36 0" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.3" fill="none" />
        {/* 两块并排的人形压痕（差分：夜里被灯照见的同一块） */}
        <ellipse cx="420" cy="430" rx="44" ry="9" fill="var(--frog-ink)" opacity={night ? 0.4 : 0.2} />
        <ellipse cx="510" cy="432" rx="40" ry="8" fill="var(--frog-ink)" opacity={night ? 0.3 : 0.14} />
      </g>
      {/* 跑道边：黄昏有一圈跑步的蛙，夜里只剩远处两三个（差分①） */}
      {!night ? (
        <g>
          <LawnRunner x={96} y={442} s={1.2} />
          <LawnRunner x={716} y={444} s={1.2} />
        </g>
      ) : (
        <g opacity="0.5">
          <LawnRunner x={704} y={444} s={1.1} />
        </g>
      )}
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity={night ? 0.34 : 0.14} />
    </g>
  );
}

function BgLawnDusk() {
  return <LawnDuskScene night={false} />;
}

function BgLawnNight() {
  return <LawnDuskScene night />;
}


/* ---------- 自习楼·四态：大厅下午 / 储物柜区 / 窗边傍晚 / 通宵深夜 ----------
 * 「一天之内的完整夜」：下午四点四十七进楼 → 傍晚天暗 → 深夜。late 与 desk 同机位，
 * 差分只动三处（窗外天色 / 亮灯密度 / 桌上多出一只凉透的保温杯）。
 */

/** 翻页声的人群：坐姿蛙影，快慢两种（快的背政治，慢的算数学） */
function StudyReader({ x, y, s = 1, slow = false }: { x: number; y: number; s?: number; slow?: boolean }) {
  return (
    <g opacity="0.85" transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="17" ry="13" fill="var(--frog-bluegray-deep)" />
      <circle cx="0" cy="-17" r="9.5" fill="var(--frog-bluegray-deep)" />
      {/* 摊开的书与笔 */}
      <rect x={-14} y="4" width="28" height="7" rx="2" fill="var(--frog-cream)" opacity="0.85" />
      <path d="M-8 4 h16" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.3" />
      {slow ? <path d="M10 -6 l6 -10" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.5" /> : null}
      <ellipse cx="0" cy="9" rx="24" ry="5" fill="var(--frog-ink)" opacity="0.16" />
    </g>
  );
}

function BgStudyHall() {
  return (
    <g>
      {/* 下午四点四十七：天光从高窗进来，室内灯也全亮 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.08" />
      <rect x="0" y="0" width="800" height="48" fill="var(--frog-bluegray-deep)" opacity="0.16" />
      {/* 高窗：窗外橘色 */}
      {[92, 332, 572].map((x) => (
        <g key={`hiwin-${x}`}>
          <rect x={x} y="72" width="136" height="92" rx="4" fill="var(--frog-berry)" opacity="0.4" />
          <path d={`M${x} 118 h136 M${x + 68} 72 v92`} stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.3" fill="none" />
          <rect x={x - 6} y="64" width="148" height="6" rx="3" fill="var(--map-wood)" opacity="0.8" />
        </g>
      ))}
      {/* 二十四小时入口的门牌与插座墙 */}
      <g>
        <rect x="4" y="196" width="66" height="26" rx="4" fill="var(--frog-matcha)" opacity="0.9" />
        <text x="37" y="214" textAnchor="middle" fontSize="11" fontWeight="700" fill="hsl(var(--background))">
          24H
        </text>
        <rect x="4" y="234" width="66" height="96" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.85" />
        {/* 插座墙：一格一格 */}
        {[248, 268, 288, 308].map((y) => (
          <g key={`socket-${y}`}>
            <rect x="14" y={y} width="20" height="12" rx="2" fill="var(--frog-cream)" opacity="0.8" />
            <path d={`M20 ${y + 4} h8 M20 ${y + 8} h8`} stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.4" />
          </g>
        ))}
      </g>
      {/* 长桌两排：三种翻页声 */}
      <rect x="120" y="300" width="560" height="10" rx="3" fill="var(--map-wood)" />
      <rect x="128" y="310" width="544" height="16" rx="2" fill="var(--map-wood)" opacity="0.78" />
      <StudyReader x={200} y={292} />
      <StudyReader x={306} y={292} slow />
      <StudyReader x={430} y={292} />
      <StudyReader x={540} y={292} slow />
      <rect x="0" y="352" width="800" height="98" fill="var(--map-wood)" opacity="0.42" />
      <path d="M0 352 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.16" fill="none" />
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.14" />
    </g>
  );
}

function BgStudyLockers() {
  return (
    <g>
      {/* 储物柜阵列：近景机位，其中一格开着半扇 */}
      <defs>
        <radialGradient id="stage-locker-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.16" />
      {/* 柜列：左右两堵，每堵两行 */}
      {([40, 118, 196, 540, 618, 696] as const).map((x, i) => (
        <g key={`locker-${i}`}>
          <rect x={x} y="120" width="70" height="230" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.9" />
          <rect x={x + 6} y="130" width="58" height="210" rx="3" fill="var(--frog-bluegray)" opacity="0.5" />
          <path d={`M${x + 6} 190 h58 M${x + 6} 246 h58`} stroke="var(--frog-ink)" strokeWidth="2" opacity="0.25" fill="none" />
          <circle cx={x + 58} cy="166" r="3.5" fill="var(--frog-ink)" opacity="0.55" />
          <circle cx={x + 58} cy="224" r="3.5" fill="var(--frog-ink)" opacity="0.55" />
        </g>
      ))}
      {/* 开着半扇的那格：枕头 / 两板褪黑素 / 一摞草稿纸 */}
      <g>
        <rect x="330" y="120" width="70" height="230" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.9" />
        {/* 柜门半开（向左撇出 12°） */}
        <g transform="rotate(-12 330 235)">
          <rect x="336" y="130" width="58" height="210" rx="3" fill="var(--frog-bluegray)" opacity="0.9" />
          <circle cx="388" cy="166" r="3.5" fill="var(--frog-ink)" opacity="0.55" />
        </g>
        <ellipse cx="366" cy="292" rx="58" ry="30" fill="url(#stage-locker-glow)" opacity="0.6" />
        {/* 枕头：中间压出一个窝 */}
        <ellipse cx="366" cy="290" rx="44" ry="18" fill="var(--frog-cream)" />
        <ellipse cx="366" cy="288" rx="22" ry="9" fill="var(--frog-cream-deep)" opacity="0.8" />
        {/* 两板褪黑素：银色的，立在枕头边 */}
        <rect x="322" y="256" width="10" height="26" rx="2" fill="var(--frog-bluegray)" opacity="0.95" />
        <rect x="336" y="258" width="10" height="24" rx="2" fill="var(--frog-bluegray)" opacity="0.8" />
        <path d="M324 262 h6 M338 264 h6" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.35" />
        {/* 一摞草稿纸 */}
        <rect x="346" y="306" width="44" height="6" rx="1.5" fill="var(--frog-cream)" />
        <rect x="344" y="312" width="48" height="6" rx="1.5" fill="var(--frog-cream)" opacity="0.85" />
        <rect x="346" y="318" width="46" height="6" rx="1.5" fill="var(--frog-cream)" opacity="0.7" />
      </g>
      <rect x="0" y="352" width="800" height="98" fill="var(--map-wood)" opacity="0.4" />
      <path d="M0 352 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.16" fill="none" />
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.14" />
    </g>
  );
}

function StudyDeskScene({ late }: { late: boolean }) {
  return (
    <g>
      <defs>
        <linearGradient id="stage-study-window" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={late ? "var(--frog-ink)" : "var(--frog-berry)"} stopOpacity={late ? 0.95 : 0.42} />
          <stop offset="1" stopColor={late ? "var(--frog-bluegray-deep)" : "var(--frog-cream-deep)"} stopOpacity={late ? 0.9 : 0.7} />
        </linearGradient>
        <radialGradient id="stage-study-lamp" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 窗边工位：天从橘色褪成灰蓝；深夜全黑 */}
      <rect x="0" y="0" width="800" height="450" fill={late ? "var(--frog-ink)" : "var(--frog-cream-deep)"} />
      <rect x="0" y="0" width="800" height="450" fill="url(#stage-study-window)" opacity={late ? 0.9 : 0.55} />
      {/* 大窗：通宵楼不熄灯，玻璃上映着室内的灯 */}
      <rect x="236" y="64" width="328" height="188" rx="5" fill={late ? "var(--frog-ink)" : "var(--frog-berry)"} opacity={late ? 0.95 : 0.35} />
      <path d="M400 64 v188 M236 158 h328" stroke="var(--frog-ink)" strokeWidth="2.6" opacity="0.32" fill="none" />
      {late && <ellipse cx="400" cy="150" rx="180" ry="70" fill="url(#stage-study-lamp)" opacity="0.35" />}
      {/* 楼道声控灯：亮了又灭 */}
      {[64, 700].map((x) => (
        <g key={`corridor-${x}`}>
          <rect x={x} y="120" width="36" height="7" rx="3.5" fill={late ? "var(--frog-bluegray-deep)" : "hsl(var(--background))"} opacity={late ? 0.6 : 0.9} />
          {!late && <ellipse cx={x + 18} cy="138" rx="26" ry="9" fill="hsl(var(--background))" opacity="0.16" />}
        </g>
      ))}
      {/* 桌面与摊开的书 */}
      <rect x="0" y="276" width="800" height="12" rx="4" fill="var(--map-wood)" />
      <rect x="0" y="288" width="800" height="22" rx="2" fill="var(--map-wood)" opacity="0.82" />
      <rect x="316" y="266" width="150" height="9" rx="2" fill="var(--frog-cream)" opacity="0.9" />
      <path d="M330 270 h122" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.3" fill="none" />
      {/* 差分③：深夜桌上多出一只凉透的保温杯 */}
      {late && (
        <g>
          <rect x="548" y="240" width="30" height="36" rx="6" fill="var(--frog-bluegray-deep)" opacity="0.95" />
          <rect x="554" y="232" width="18" height="9" rx="4" fill="var(--frog-matcha)" opacity="0.8" />
          <path d="M563 276 v0" />
          <ellipse cx="563" cy="278" rx="16" ry="3.5" fill="var(--frog-ink)" opacity="0.2" />
        </g>
      )}
      {/* 人群：傍晚满座，深夜稀座隔盏 */}
      {[168, 292, 428, 560, 676].map((x, i) => (
        <StudyReader key={`dr-${i}`} x={x} y={330} s={1.15} slow={i % 2 === 1} />
      ))}
      {late && (
        <g opacity="0.4">
          <StudyReader x={200} y={392} s={1.3} />
          <StudyReader x={620} y={392} s={1.3} slow />
        </g>
      )}
      {!late &&
        [150, 396, 640].map((x, i) => <StudyReader key={`fr-${i}`} x={x} y={404} s={1.3} slow={i === 1} />)}
      <rect x="0" y="352" width="800" height="98" fill={late ? "var(--frog-ink)" : "var(--map-wood)"} opacity={late ? 0.8 : 0.44} />
      <path d="M0 352 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.18" fill="none" />
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity={late ? 0.3 : 0.14} />
    </g>
  );
}

function BgStudyDesk() {
  return <StudyDeskScene late={false} />;
}

function BgStudyLate() {
  return <StudyDeskScene late />;
}


/* ---------- 行政楼·三态：学工办窗口·下午 / 办公室·晚上 / 办公室·深夜 ----------
 * 制度的中心：窗口排队靠眼神维持秩序，加班只剩一格灯，深夜锁玻璃柜收工。
 * night 与 office 同机位，差分只动三处（一半的灯灭了 / 玻璃柜锁上 / 走廊声控灯）。
 */

function BgAdminWindow() {
  return (
    <g>
      {/* 下午三点二十的学工办走廊：日光灯全亮 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.1" />
      <rect x="0" y="0" width="800" height="46" fill="var(--frog-bluegray-deep)" opacity="0.18" />
      {/* 窗口玻璃与台面：玻璃上贴一张 A4（颜色比别的深——贴久了） */}
      <g>
        <rect x="228" y="128" width="344" height="128" rx="4" fill="var(--frog-bluegray)" opacity="0.35" />
        <path d="M400 128 v128" stroke="var(--frog-ink)" strokeWidth="2.5" opacity="0.2" fill="none" />
        <g transform="rotate(-2 300 176)">
          <rect x="252" y="146" width="96" height="70" rx="2" fill="var(--frog-cream)" opacity="0.92" />
          <rect x="258" y="152" width="84" height="9" rx="2" fill="var(--frog-ink)" opacity="0.55" />
          <path d="M258 170 h84 M258 180 h84 M258 190 h60" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.28" fill="none" />
          <text x="300" y="212" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--frog-berry-deep)">
            办理时间 14:00-17:00
          </text>
        </g>
        {/* 电子叫号屏：黑着 */}
        <rect x="470" y="142" width="120" height="54" rx="4" fill="var(--frog-ink)" opacity="0.85" />
        <rect x="478" y="150" width="104" height="38" rx="2" fill="var(--frog-bluegray-deep)" opacity="0.5" />
        <path d="M492 176 h76" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.4" fill="none" />
      </g>
      {/* 窗口台面 */}
      <rect x="0" y="256" width="800" height="13" rx="4" fill="var(--map-wood)" />
      <rect x="0" y="269" width="800" height="22" rx="2" fill="var(--map-wood)" opacity="0.8" />
      {/* 排队的蛙影：四只，靠眼神维持秩序 */}
      {[112, 194, 284, 372].map((x, i) => (
        <g key={`q-${i}`} opacity={0.5 + (i % 2) * 0.12}>
          <ellipse cx={x} cy={378 + (i % 2) * 10} rx="24" ry="27" fill="var(--frog-bluegray-deep)" />
          <circle cx={x} cy={344 + (i % 2) * 10} r="12" fill="var(--frog-bluegray-deep)" />
          {i === 2 && <rect x={x - 12} y={356 + (i % 2) * 10} width="24" height="30" rx="2" fill="var(--frog-cream)" opacity="0.7" />}
          <ellipse cx={x} cy={416 + (i % 2) * 10} rx="28" ry="7" fill="var(--frog-ink)" opacity="0.14" />
        </g>
      ))}
      {/* 窗口里：桌沿与一枚立着的章（格格立绘会占住这里） */}
      <rect x="0" y="352" width="800" height="98" fill="var(--map-wood)" opacity="0.42" />
      <path d="M0 352 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.16" fill="none" />
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.14" />
    </g>
  );
}

function AdminOfficeScene({ night }: { night: boolean }) {
  return (
    <g>
      <defs>
        <radialGradient id="stage-admin-lamp" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 晚上九点：整栋楼只剩学工办一格灯；深夜那一半也灭了 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" />
      <rect x="0" y="0" width="800" height="450" fill={night ? "var(--frog-bluegray-deep)" : "var(--frog-cream-deep)"} opacity={night ? 0.35 : 0.9} />
      {/* 天花灯管：办公室有四根，night 灭一半（差分①） */}
      {([[120, false], [310, true], [500, false], [680, true]] as Array<[number, boolean]>).map(([x, on], i) => {
        const lit = !night ? true : on;
        return (
          <g key={`tube-${i}`}>
            <rect x={x} y="26" width="120" height="7" rx="3.5" fill={lit ? "hsl(var(--background))" : "var(--frog-bluegray-deep)"} opacity={lit ? 0.9 : 0.55} />
            {lit && <ellipse cx={x + 60} cy="50" rx="88" ry="15" fill="url(#stage-admin-lamp)" opacity={night ? 0.4 : 0.55} />}
          </g>
        );
      })}
      {/* 公告栏玻璃柜：开着（差分②深夜锁上） */}
      <g>
        <rect x="512" y="120" width="180" height="148" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.85" />
        <rect x="524" y="132" width="156" height="124" rx="3" fill="var(--frog-bluegray)" opacity="0.4" />
        {!night ? (
          <g>
            <rect x="540" y="146" width="124" height="94" rx="2" fill="var(--frog-cream)" opacity="0.9" />
            <rect x="548" y="154" width="108" height="8" rx="2" fill="var(--frog-berry)" opacity="0.55" />
            <path d="M548 172 h108 M548 182 h108 M548 192 h72" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.26" fill="none" />
          </g>
        ) : (
          <g>
            {/* 锁上：柜门贴了封条样式的一条 */}
            <rect x="524" y="132" width="156" height="124" rx="3" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.5" />
            <path d="M524 194 h156" stroke="var(--frog-cream)" strokeWidth="3" opacity="0.12" fill="none" />
            <circle cx="672" cy="250" r="3.5" fill="var(--frog-cream)" opacity="0.5" />
          </g>
        )}
      </g>
      {/* 桌面：章按大小排成一排（像收拾一桌餐具） */}
      <rect x="0" y="286" width="800" height="12" rx="4" fill="var(--map-wood)" />
      <rect x="0" y="298" width="800" height="22" rx="2" fill="var(--map-wood)" opacity="0.8" />
      {[196, 244, 288, 328].map((x, i) => (
        <g key={`stamp-${i}`} opacity="0.9">
          <rect x={x} y={276 - (i % 2) * 4} width={16 + i * 2} height={12 + i * 2} rx="3" fill="var(--frog-cream-deep)" />
          <rect x={x + 3} y={280 - (i % 2) * 4} width={10 + i * 2} height="4" rx="2" fill="var(--frog-berry)" opacity="0.7" />
          <ellipse cx={x + 10 + i} cy={272 - (i % 2) * 4} rx={8 + i} ry="4" fill="var(--frog-berry-deep)" opacity="0.8" />
        </g>
      ))}
      {/* 一张凳子（她踩过的那一张） */}
      <g opacity="0.85">
        <rect x="410" y="330" width="76" height="10" rx="3" fill="var(--map-wood)" />
        <path d="M418 340 L414 396 M478 340 L482 396" stroke="var(--map-wood)" strokeWidth="5" />
      </g>
      {/* 走廊声控灯：差分③深夜一段一段亮 */}
      {night &&
        [64, 148, 706, 764].map((x, i) => (
          <g key={`stair-${i}`}>
            <rect x={x} y="210" width="24" height="5" rx="2.5" fill={i % 2 ? "var(--frog-badge)" : "var(--frog-bluegray-deep)"} opacity={i % 2 ? 0.8 : 0.6} />
            {i % 2 === 1 && <ellipse cx={x + 12} cy="224" rx="22" ry="8" fill="var(--frog-badge)" opacity="0.12" />}
          </g>
        ))}
      <rect x="0" y="352" width="800" height="98" fill={night ? "var(--frog-ink)" : "var(--map-wood)"} opacity={night ? 0.82 : 0.44} />
      <path d="M0 352 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.18" fill="none" />
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity={night ? 0.32 : 0.14} />
    </g>
  );
}

function BgAdminOffice() {
  return <AdminOfficeScene night={false} />;
}

function BgAdminNight() {
  return <AdminOfficeScene night />;
}


/* ---------- 教学楼·三态：楼前上午 / 大教室晚上 / 走廊散场 ----------
 * 全剧最短的一条线，但它是开头：第一张规划表、第一个「我等」。
 */

function BgClassGate() {
  return (
    <g>
      {/* 开学第一天：天光很亮，横幅边角卷了 */}
      <defs>
        <linearGradient id="stage-class-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--frog-cream-deep)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#stage-class-sky)" />
      {/* 教学楼立面与柱廊 */}
      {[64, 236, 408, 580].map((x) => (
        <rect key={`col-${x}`} x={x} y="96" width="34" height="204" fill="var(--frog-bluegray-deep)" opacity="0.55" />
      ))}
      <rect x="0" y="88" width="800" height="26" fill="var(--frog-bluegray-deep)" opacity="0.6" />
      {/* 横幅：边角卷了，像挂了很多年 */}
      <g>
        <path d="M118 40 q282 -12 564 0 l-4 46 q-280 -10 -556 0 Z" fill="var(--frog-berry)" />
        <path d="M676 40 q10 -6 8 -18 q-6 -8 -12 2" stroke="var(--frog-berry-deep)" strokeWidth="4" fill="none" opacity="0.8" />
        <text x="400" y="72" textAnchor="middle" fontSize="21" fontWeight="800" fill="var(--frog-badge)" letterSpacing="3">
          欢迎新蛙入学——从这里开始，成为更好的蛙。
        </text>
        <path d="M118 40 v-24 M682 40 v-24" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.5" />
      </g>
      {/* 电线杆：上一届撕剩的半张海报「距四六级考试还有 87 天」 */}
      <g>
        <rect x="690" y="128" width="14" height="272" fill="var(--frog-bluegray-deep)" opacity="0.8" />
        <g transform="rotate(-2 700 190)">
          <rect x="654" y="160" width="86" height="66" rx="2" fill="var(--frog-cream)" opacity="0.9" />
          {/* 撕剩的半张：左半完整右半缺 */}
          <path d="M700 160 L740 160 L740 226 L688 226 Z" fill="var(--frog-cream-deep)" opacity="0.5" />
          <rect x="660" y="168" width="34" height="7" rx="2" fill="var(--frog-ink)" opacity="0.5" />
          <path d="M660 184 h34 M660 196 h34" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.3" fill="none" />
          <text x="668" y="218" fontSize="9.5" fontWeight="800" fill="var(--frog-berry-deep)">
            还有 87 天
          </text>
          {/* 撕口的锯齿 */}
          <path d="M688 160 l4 10 l-3 8 l5 9 l-4 9 l4 9 l-2 11 l6 9" stroke="var(--frog-cream-deep)" strokeWidth="2" fill="none" opacity="0.8" />
        </g>
      </g>
      {/* 交表窗口与队伍 */}
      <rect x="0" y="300" width="800" height="150" fill="var(--map-wood)" opacity="0.4" />
      <path d="M0 300 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.16" fill="none" />
      {[136, 262, 396].map((x, i) => (
        <g key={`que-${i}`} opacity={0.48 + (i % 2) * 0.14}>
          <ellipse cx={x} cy={372 + (i % 2) * 12} rx="25" ry="29" fill="var(--frog-bluegray-deep)" />
          <circle cx={x} cy={338 + (i % 2) * 12} r="12.5" fill="var(--frog-bluegray-deep)" />
          {i === 1 && <rect x={x - 14} y={350 + (i % 2) * 12} width="28" height="34" rx="2" fill="var(--frog-cream)" opacity="0.75" />}
          <ellipse cx={x} cy={412 + (i % 2) * 12} rx="30" ry="7" fill="var(--frog-ink)" opacity="0.14" />
        </g>
      ))}
      {/* 窗口台沿与一枚立着的章 */}
      <g opacity="0.9">
        <rect x="536" y="336" width="190" height="12" rx="4" fill="var(--map-wood)" />
        <rect x="548" y="316" width="18" height="22" rx="3" fill="var(--frog-cream-deep)" />
        <ellipse cx="557" cy="314" rx="11" ry="4" fill="var(--frog-berry)" opacity="0.75" />
      </g>
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.14" />
    </g>
  );
}

function BgClassRoom() {
  return (
    <g>
      {/* 晚上的大教室：投影是台上唯一的光源 */}
      <defs>
        <radialGradient id="stage-class-beam" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="hsl(var(--background))" stopOpacity="0.28" />
          <stop offset="1" stopColor="hsl(var(--background))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray-deep)" opacity="0.5" />
      {/* 投影：《大学四年时间轴》，尽头一面小旗 */}
      <g>
        <rect x="176" y="64" width="448" height="200" rx="5" fill="hsl(var(--background))" opacity="0.85" />
        <text x="400" y="96" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--frog-ink)">
          大学四年时间轴
        </text>
        {/* 四段横轴 */}
        {[
          ["大一 · 绩点", 200],
          ["大二 · 进组", 320],
          ["大三 · 分流", 440],
          ["大四 · 秋招", 560],
        ].map(([label, x]) => (
          <g key={`seg-${x}`}>
            <rect x={Number(x) - 52} y="122" width="104" height="30" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.6" />
            <text x={Number(x)} y="142" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="hsl(var(--background))">
              {label}
            </text>
          </g>
        ))}
        <path d="M200 168 h380" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.4" />
        {/* 尽头一面小旗 */}
        <g>
          <path d="M580 168 v-26" stroke="var(--frog-berry-deep)" strokeWidth="3.5" />
          <path d="M580 142 l26 8 l-26 8 Z" fill="var(--frog-berry)" />
        </g>
      </g>
      {/* 投影光锥打在台下的蛙影上 */}
      <polygon points="196,264 604,264 700,450 100,450" fill="url(#stage-class-beam)" />
      {/* 后墙倒计时牌：距考研 1298 天 */}
      <g>
        <rect x="48" y="300" width="132" height="74" rx="4" fill="var(--frog-cream-deep)" opacity="0.9" />
        <text x="114" y="324" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
          距考研
        </text>
        <text x="114" y="352" textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--frog-berry-deep)">
          1298
        </text>
        <text x="114" y="368" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--frog-ink)" opacity="0.45">
          由学习委员每日更新
        </text>
      </g>
      {/* 台下的蛙影：低头看题 */}
      {[196, 316, 436, 556, 664].map((x, i) => (
        <g key={`aud-${i}`}>
          <ellipse cx={x} cy={386 + (i % 2) * 10} rx="26" ry="20" fill="var(--frog-bluegray-deep)" opacity="0.9" />
          <circle cx={x} cy={360 + (i % 2) * 10} r="12" fill="var(--frog-bluegray-deep)" opacity="0.9" />
          <rect x={x - 16} y={396 + (i % 2) * 10} width="32" height="5" rx="2" fill="var(--frog-cream)" opacity="0.5" />
        </g>
      ))}
      <rect x="0" y="352" width="800" height="98" fill="var(--frog-ink)" opacity="0.5" />
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.3" />
    </g>
  );
}

function BgClassCorridor() {
  return (
    <g>
      {/* 散场的走廊：灯一段一段，办公室的门缝透着光 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.28" />
      {/* 走廊两侧的门与教室门口 */}
      {[52, 200, 342].map((x, i) => (
        <g key={`door-${i}`}>
          <rect x={x} y="132" width="58" height="190" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.85" />
          <rect x={x + 8} y="142" width="42" height="66" rx="2" fill="hsl(var(--background))" opacity="0.14" />
          <circle cx={x + 50} cy="232" r="2.6" fill="hsl(var(--background))" opacity="0.4" />
        </g>
      ))}
      {/* 走廊灯：三段，中间一段正亮 */}
      {[
        [140, true],
        [400, false],
        [660, true],
      ].map(([x, on], i) => (
        <g key={`lamp-${i}`}>
          <rect x={Number(x)} y="52" width="96" height="6" rx="3" fill={on ? "hsl(var(--background))" : "var(--frog-bluegray-deep)"} opacity={on ? 0.92 : 0.6} />
          {on && <ellipse cx={Number(x) + 48} cy="74" rx="70" ry="12" fill="hsl(var(--background))" opacity="0.14" />}
        </g>
      ))}
      {/* 远处辅导员办公室：门缝里透着光 */}
      <g>
        <rect x="636" y="150" width="132" height="180" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.9" />
        <rect x="690" y="154" width="4" height="172" fill="var(--frog-badge)" opacity="0.5" />
        <ellipse cx="694" cy="240" rx="26" ry="76" fill="var(--frog-badge)" opacity="0.1" />
        <rect x="646" y="182" width="70" height="20" rx="2" fill="var(--frog-cream)" opacity="0.75" />
        <text x="681" y="196" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--frog-ink)" opacity="0.55">
          辅导员
        </text>
      </g>
      {/* 走过的蛙影：散场后都朝同一个方向 */}
      {[256, 434].map((x, i) => (
        <g key={`leave-${i}`} opacity="0.6">
          <ellipse cx={x} cy={398 - i * 12} rx="24" ry="28" fill="var(--frog-bluegray-deep)" />
          <circle cx={x} cy={364 - i * 12} r="12" fill="var(--frog-bluegray-deep)" />
          <ellipse cx={x} cy={438 - i * 12} rx="28" ry="6" fill="var(--frog-ink)" opacity="0.12" />
        </g>
      ))}
      <rect x="0" y="352" width="800" height="98" fill="var(--map-wood)" opacity="0.42" />
      <path d="M0 352 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.16" fill="none" />
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.14" />
    </g>
  );
}


/* ---------- 湖边·三态共用一套几何：湖边开场 / 夜深 / 天将亮 ----------
 * 全剧收束的一条线：月亮泡在水里被风吹得一皱一皱，五只蛙把白天的一切放下。
 * mid 与 dawn 都与 shore 同机位，差分各三处（玉米桶 / 月与手机与炉火 / 天光与那扇灯）。
 */

/** 围坐的蛙影：四只（主角来了是五只，立绘由 DialogueStage 提供） */
function LakeFrog({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="26" ry="19" fill="var(--frog-ink)" opacity="0.92" />
      <circle cx="0" cy="-20" r="12" fill="var(--frog-ink)" opacity="0.92" />
      <circle cx="-4" cy="-22" r="2.4" fill="var(--frog-eye)" opacity="0.24" />
      <circle cx="4" cy="-22" r="2.4" fill="var(--frog-eye)" opacity="0.24" />
      <ellipse cx="0" cy="18" rx="30" ry="5" fill="var(--frog-ink)" opacity="0.3" />
    </g>
  );
}

function LakeScene({ stage }: { stage: "shore" | "mid" | "dawn" }) {
  return (
    <g>
      <defs>
        <linearGradient id="stage-lake-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stage === "dawn" ? "var(--frog-bluegray)" : "var(--frog-ink)"} stopOpacity={stage === "dawn" ? 0.9 : 1} />
          <stop offset="1" stopColor={stage === "dawn" ? "var(--frog-cream)" : "var(--frog-bluegray-deep)"} stopOpacity={stage === "dawn" ? 0.9 : 1} />
        </linearGradient>
        <radialGradient id="stage-lake-moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="hsl(var(--background))" stopOpacity="0.5" />
          <stop offset="1" stopColor="hsl(var(--background))" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="stage-lake-fire" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-berry)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--frog-berry)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#stage-lake-sky)" />
      {/* 月亮：差分②往湖心挪（mid 更斜更低） */}
      {[
        [620, 84],
        [568, 122],
        [500, 150],
      ][stage === "shore" ? 0 : stage === "mid" ? 1 : 2] && (
        <g transform={`translate(${[620, 568, 500][stage === "shore" ? 0 : stage === "mid" ? 1 : 2]} ${[84, 122, 150][stage === "shore" ? 0 : stage === "mid" ? 1 : 2]})`}>
          <circle cx="0" cy="0" r="26" fill="hsl(var(--background))" opacity={stage === "dawn" ? 0.35 : 0.8} />
          <circle cx="0" cy="0" r="52" fill="url(#stage-lake-moon)" opacity="0.6" />
          <path d="M-10 6 q8 6 18 2" stroke="var(--frog-cream)" strokeWidth="2.4" fill="none" opacity="0.25" />
        </g>
      )}
      {/* 湖面：月光皱一皱（风把月吹得一皱一皱） */}
      <rect x="0" y="212" width="800" height="130" fill={stage === "dawn" ? "var(--frog-bluegray)" : "var(--frog-bluegray-deep)"} opacity={stage === "dawn" ? 0.7 : 0.9} />
      <path d="M0 212 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.2" fill="none" />
      {[228, 248, 268, 292, 318].map((y, i) => (
        <path
          key={`wave-${i}`}
          d={`M${60 + i * 30} ${y} q30 -5 60 0 q30 5 60 0`}
          stroke="hsl(var(--background))"
          strokeWidth="2"
          opacity={stage === "dawn" ? 0.14 : 0.09}
          fill="none"
        />
      ))}
      {/* 岸线与草地 */}
      <path d="M0 342 q200 -14 400 -8 q220 6 400 0 v116 h-800 Z" fill={stage === "dawn" ? "var(--frog-bluegray-deep)" : "var(--frog-ink)"} opacity={stage === "dawn" ? 0.75 : 0.92} />
      {/* 石头上的手机摞：差分②③都留着它（散场没人拿） */}
      {(stage === "shore" || stage === "mid" || stage === "dawn") && (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <g key={`phone-${i}`} transform={`rotate(${(i - 1.5) * 7} 470 ${332 - i * 7})`}>
              <rect x={452 - i} y={322 - i * 7} width={36 + i} height="6" rx="2" fill={stage === "dawn" ? "var(--frog-bluegray-deep)" : "var(--frog-ink)"} />
            </g>
          ))}
          <ellipse cx="470" cy="340" rx="40" ry="9" fill={stage === "dawn" ? "var(--frog-bluegray-deep)" : "var(--frog-ink)"} opacity="0.85" />
        </g>
      )}
      {/* 锅与酒精炉：差分③锅空了炉火压小 */}
      <g>
        <ellipse cx="386" cy="348" rx="44" ry="13" fill={stage === "dawn" ? "var(--frog-bluegray-deep)" : "var(--frog-bluegray)"} />
        <ellipse cx="386" cy="344" rx="44" ry="12" fill="hsl(var(--background))" opacity="0.22" />
        <ellipse cx="386" cy="346" rx="30" ry="8" fill={stage === "dawn" ? "var(--frog-bluegray-deep)" : "var(--frog-cream-deep)"} opacity="0.8" />
        {stage !== "shore" && (
          <g>
            <path d="M440 352 v-16" stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.6" />
            <circle cx="440" cy="330" r="4" fill={stage === "dawn" ? "var(--frog-berry)" : "var(--frog-matcha)"} opacity={stage === "dawn" ? 0.5 : 0.85} />
            <ellipse cx="440" cy="330" rx="22" ry="12" fill="url(#stage-lake-fire)" opacity={stage === "dawn" ? 0.3 : 0.7} />
          </g>
        )}
      </g>
      {/* 四只蛙剪影围着石头：差分③天光里看清一点轮廓 */}
      <g opacity={stage === "dawn" ? 0.85 : 0.95}>
        <LakeFrog x={196} y={372} />
        <LakeFrog x={286} y={386} s={1.1} />
        <LakeFrog x={602} y={380} s={1.05} />
        <LakeFrog x={690} y={368} s={0.95} />
      </g>
      {/* 差分③：远处教学楼只剩一扇灯（shore 没有、dawn 有一扇） */}
      {stage === "dawn" && (
        <g>
          <rect x="44" y="150" width="56" height="46" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.6" />
          <rect x="60" y="162" width="10" height="12" fill="var(--frog-badge)" opacity="0.85" />
        </g>
      )}
      {stage === "shore" && (
        <g opacity="0.5">
          <rect x="44" y="150" width="56" height="46" rx="3" fill="var(--frog-ink)" opacity="0.8" />
          <rect x="60" y="162" width="10" height="12" fill="var(--frog-ink)" opacity="0.9" />
        </g>
      )}
      <rect x="0" y="430" width="800" height="20" fill="var(--frog-ink)" opacity="0.34" />
    </g>
  );
}

function BgLakeShore() {
  return <LakeScene stage="shore" />;
}

function BgLakeMid() {
  return <LakeScene stage="mid" />;
}

function BgLakeDawn() {
  return <LakeScene stage="dawn" />;
}

/* ---------- 医务室（第十条线《病假条》）：登记台、白床与浅绿帘、墙上红十字、计时器 ---------- */

function BgInfirmary() {
  return (
    <g>
      <defs>
        <linearGradient id="stage-infirmary-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(var(--background))" />
          <stop offset="1" stopColor="var(--frog-mianmian)" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {/* 墙面与地面 */}
      <rect x="0" y="0" width="800" height="450" fill="url(#stage-infirmary-wall)" />
      <rect x="0" y="330" width="800" height="120" fill="var(--frog-mianmian-deep)" opacity="0.3" />
      {/* 后墙红十字：白圆底 + 布纹红 */}
      <g transform="translate(400 92)">
        <circle r="44" fill="hsl(var(--card))" opacity="0.92" />
        <path d="M-8 -25 h16 v17 h17 v16 h-17 v17 h-16 v-17 h-17 v-16 h17 z" fill="var(--frog-bow)" opacity="0.8" />
      </g>
      {/* 左侧窗：下午的光 */}
      <rect x="58" y="96" width="148" height="164" rx="8" fill="hsl(var(--background))" opacity="0.92" />
      <rect x="58" y="96" width="148" height="164" rx="8" fill="none" stroke="var(--frog-mianmian-deep)" strokeWidth="6" />
      <path d="M132 96 v164 M58 178 h148" stroke="var(--frog-mianmian-deep)" strokeWidth="4" />
      {/* 登记台：写字板压着登记表 */}
      <rect x="248" y="248" width="172" height="122" rx="8" fill="var(--map-wood)" />
      <rect x="260" y="236" width="148" height="16" rx="6" fill="var(--frog-mianmian-deep)" />
      <g transform="rotate(-4 322 216)">
        <rect x="292" y="192" width="60" height="46" rx="4" fill="var(--frog-belly)" />
        <path d="M300 204 h44 M300 214 h44 M300 224 h26" stroke="var(--frog-bluegray)" strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* 右侧白床：枕头 + 浅绿帘半拉着 */}
      <rect x="556" y="66" width="10" height="292" rx="4" fill="var(--frog-bluegray)" opacity="0.55" />
      <path d="M561 76 q42 14 82 0 v66 q-40 14 -82 0 z" fill="var(--frog-mianmian)" opacity="0.85" />
      <rect x="498" y="298" width="264" height="66" rx="10" fill="var(--frog-belly)" />
      <rect x="498" y="352" width="264" height="18" rx="8" fill="var(--frog-mianmian-deep)" opacity="0.65" />
      <rect x="514" y="284" width="88" height="26" rx="10" fill="hsl(var(--card))" />
      {/* 床头柜与计时器：三十分钟，响铃就起 */}
      <rect x="452" y="306" width="36" height="64" rx="6" fill="var(--map-wood)" />
      <circle cx="470" cy="294" r="14" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.95" />
      <path d="M470 294 v-7 M470 294 l5 3" stroke="var(--frog-bow)" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

/* ---------- 注册表：id → 舞台组件（接线层按 DialogueLine.bg 取用） ---------- */

export const STAGE_BACKGROUNDS: Record<string, StageSceneComponent> = {
  "bg-dorm-lobby": LobbyScene,
  "bg-dorm-corridor": BgCorridor,
  "bg-dorm-room": BgRoom,
  "bg-dorm-corridor-out": BgCorridorOut,
  "bg-dorm-room-out": BgRoomOut,
  "bg-library-hall": BgLibraryHall,
  "bg-library-late": BgLibraryLate,
  "bg-library-exit": BgLibraryExit,
  "bg-library-board": BgLibraryBoard,
  "bg-canteen-noon": BgCanteenNoon,
  "bg-canteen-late": BgCanteenLate,
  "bg-canteen-closing": BgCanteenClosing,
  "bg-club-stage": BgClubStage,
  "bg-club-corridor": BgClubCorridor,
  "bg-club-room": BgClubRoom,
  "bg-club-farm": BgClubFarm,
  "bg-club-dark": BgClubDark,
  "bg-lawn-track": BgLawnTrack,
  "bg-lawn-dusk": BgLawnDusk,
  "bg-lawn-night": BgLawnNight,
  "bg-study-hall": BgStudyHall,
  "bg-study-lockers": BgStudyLockers,
  "bg-study-desk": BgStudyDesk,
  "bg-study-late": BgStudyLate,
  "bg-admin-window": BgAdminWindow,
  "bg-admin-office": BgAdminOffice,
  "bg-admin-night": BgAdminNight,
  "bg-class-gate": BgClassGate,
  "bg-class-room": BgClassRoom,
  "bg-class-corridor": BgClassCorridor,
  "bg-lake-shore": BgLakeShore,
  "bg-lake-mid": BgLakeMid,
  "bg-lake-dawn": BgLakeDawn,
  /* 医务室（第十条线《病假条》） */
  "bg-infirmary": BgInfirmary,
};

export function stageBackgroundById(id: string): StageSceneComponent | undefined {
  return STAGE_BACKGROUNDS[id];
}
