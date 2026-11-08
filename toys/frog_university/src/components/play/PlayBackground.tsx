/**
 * 场景背景：教室 / 图书馆 / 食堂窗口 / 操场黄昏 / 社团活动室 / 湖边夜景 / 自习楼凌晨 / 学工办窗口
 * 全部 SVG 自绘，颜色只用主题 CSS 变量，三套主题下自动换装。
 */
import type { BuildingId } from "@/data/storylines";

type SceneProps = { buildingId: BuildingId };

export function PlayBackground({ buildingId }: SceneProps) {
  return (
    <div className="absolute inset-0" aria-hidden>
      <svg
        viewBox="0 0 800 450"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        role="presentation"
      >
        {buildingId === "teaching" && <ClassroomScene />}
        {buildingId === "library" && <LibraryScene />}
        {buildingId === "canteen" && <CanteenScene />}
        {buildingId === "field" && <FieldScene />}
        {buildingId === "club" && <ClubScene />}
        {buildingId === "lake" && <LakeScene />}
        {buildingId === "study" && <StudyScene />}
        {buildingId === "admin" && <AdminScene />}
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background/70 to-transparent" />
    </div>
  );
}

/* ---------- 教室（开学第一课） ---------- */

function ClassroomScene() {
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--secondary)" />
      <rect x="0" y="352" width="800" height="98" fill="var(--map-wood)" opacity="0.32" />
      {/* 黑板 */}
      <rect x="176" y="56" width="448" height="176" rx="12" fill="var(--frog-ink)" />
      <rect x="168" y="48" width="464" height="192" rx="14" fill="none" stroke="var(--map-wood)" strokeWidth="9" />
      <text x="400" y="122" textAnchor="middle" fontSize="32" fontWeight="700" fill="var(--frog-eye)">
        开学第一课
      </text>
      <text x="400" y="168" textAnchor="middle" fontSize="20" fill="var(--frog-eye)" opacity="0.75">
        蛙生是马拉松，赢在起跑线
      </text>
      <path d="M232 196 q14 -12 28 0" stroke="var(--frog-eye)" strokeWidth="2.4" fill="none" opacity="0.6" />
      {/* 窗户 */}
      <Window x={56} />
      <Window x={676} />
      {/* 课桌 */}
      <Desk x={110} y={306} />
      <Desk x={350} y={306} />
      <Desk x={590} y={306} />
      <Desk x={230} y={376} />
      <Desk x={470} y={376} />
      {/* 吊灯 */}
      <path d="M400 0 L400 26" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.5" />
      <ellipse cx="400" cy="34" rx="30" ry="10" fill="var(--frog-badge)" />
      <ellipse cx="400" cy="52" rx="120" ry="34" fill="var(--frog-badge)" opacity="0.16" />
    </g>
  );
}

function Window({ x }: { x: number }) {
  return (
    <g>
      <rect x={x} y="72" width="112" height="138" rx="10" fill="var(--map-water)" />
      <ellipse cx={x + 34} cy="112" rx="26" ry="12" fill="var(--frog-eye)" />
      <ellipse cx={x + 70} cy="132" rx="30" ry="13" fill="var(--frog-eye)" opacity="0.85" />
      <path d={`M${x} 141 h112 M${x + 56} 72 v138`} stroke="var(--frog-eye)" strokeWidth="6" />
      <rect x={x} y="72" width="112" height="138" rx="10" fill="none" stroke="var(--frog-eye)" strokeWidth="6" />
      <rect x={x - 8} y="210" width="128" height="10" rx="5" fill="var(--frog-belly)" />
    </g>
  );
}

function Desk({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="96" height="14" rx="6" fill="var(--map-wood)" />
      <rect x={x + 8} y={y + 14} width="10" height="42" rx="4" fill="var(--map-wood)" opacity="0.8" />
      <rect x={x + 78} y={y + 14} width="10" height="42" rx="4" fill="var(--map-wood)" opacity="0.8" />
    </g>
  );
}

/* ---------- 图书馆（卷王养成计划） ---------- */

function LibraryScene() {
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--secondary)" />
      <rect x="0" y="368" width="800" height="82" fill="var(--map-wood)" opacity="0.28" />
      <Bookshelf x={44} />
      <Bookshelf x={610} />
      {/* 凌晨三点的钟 */}
      <circle cx="400" cy="86" r="40" fill="var(--frog-eye)" stroke="var(--frog-ink)" strokeWidth="5" />
      <path d="M400 86 L400 60" stroke="var(--frog-ink)" strokeWidth="4" strokeLinecap="round" />
      <path d="M400 86 L422 98" stroke="var(--frog-ink)" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="400" cy="86" r="3.4" fill="var(--frog-ink)" />
      <text x="400" y="152" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--frog-ink)" opacity="0.55">
        连续在馆 47 小时
      </text>
      {/* 阅览桌与台灯 */}
      <rect x="280" y="268" width="240" height="18" rx="8" fill="var(--map-wood)" />
      <rect x="296" y="286" width="12" height="74" rx="5" fill="var(--map-wood)" opacity="0.8" />
      <rect x="492" y="286" width="12" height="74" rx="5" fill="var(--map-wood)" opacity="0.8" />
      <path d="M400 268 L400 226" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.6" />
      <path d="M376 226 L424 226 L412 204 L388 204 Z" fill="var(--frog-badge)" />
      <ellipse cx="400" cy="238" rx="92" ry="26" fill="var(--frog-badge)" opacity="0.28" />
      <rect x="330" y="250" width="34" height="18" rx="4" fill="var(--frog-matcha)" />
      <rect x="436" y="250" width="34" height="18" rx="4" fill="var(--frog-berry)" />
    </g>
  );
}

function Bookshelf({ x }: { x: number }) {
  const rows = [96, 168, 240, 312];
  const spineColors = ["var(--frog-matcha)", "var(--frog-berry)", "var(--map-water)", "var(--frog-bow)", "var(--frog-badge)"];
  return (
    <g>
      <rect x={x} y="64" width="146" height="286" rx="10" fill="var(--map-wood)" />
      {rows.map((rowY) => (
        <g key={rowY}>
          {Array.from({ length: 9 }).map((_, i) => (
            <rect
              key={i}
              x={x + 10 + i * 14}
              y={rowY - 4}
              width="10"
              height="46"
              rx="2.5"
              fill={spineColors[(i + rowY) % spineColors.length]}
            />
          ))}
          <rect x={x + 4} y={rowY + 44} width="138" height="8" rx="4" fill="var(--frog-ink)" opacity="0.18" />
        </g>
      ))}
    </g>
  );
}

/* ---------- 食堂窗口（已老实食堂） ---------- */

function CanteenScene() {
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--secondary)" />
      <path d="M0 60 h800 M0 130 h800 M0 200 h800 M120 0 v260 M280 0 v260 M440 0 v260 M600 0 v260" stroke="var(--border)" strokeWidth="2" opacity="0.6" />
      {/* 菜单灯箱 */}
      <rect x="248" y="34" width="304" height="104" rx="12" fill="var(--frog-ink)" />
      <text x="400" y="72" textAnchor="middle" fontSize="17" fill="var(--frog-eye)" opacity="0.75">
        今日菜单
      </text>
      <text x="400" y="116" textAnchor="middle" fontSize="34" fontWeight="700" fill="var(--frog-eye)">
        已老实
      </text>
      {/* 吊灯 */}
      <path d="M160 0 V96 M640 0 V96" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.5" />
      <ellipse cx="160" cy="106" rx="34" ry="12" fill="var(--frog-badge)" />
      <ellipse cx="640" cy="106" rx="34" ry="12" fill="var(--frog-badge)" />
      {/* 打饭台 */}
      <rect x="0" y="238" width="800" height="18" rx="6" fill="var(--frog-glass)" />
      <rect x="0" y="256" width="800" height="66" rx="8" fill="var(--map-wood)" />
      <rect x="0" y="256" width="800" height="12" fill="var(--frog-belly)" />
      {/* 菜盘 */}
      <Tray x={210} color="var(--frog-bow)" />
      <Tray x={380} color="var(--frog-matcha)" />
      <Tray x={550} color="var(--frog-badge)" />
      {/* 蒸汽 */}
      <path d="M232 214 q10 -14 0 -28 q-10 -14 0 -28" stroke="var(--frog-eye)" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M402 218 q-10 -14 0 -28 q10 -14 0 -28" stroke="var(--frog-eye)" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.65" />
      <path d="M572 214 q10 -14 0 -28 q-10 -14 0 -28" stroke="var(--frog-eye)" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.72" />
      <rect x="0" y="382" width="800" height="68" fill="var(--map-road)" opacity="0.4" />
    </g>
  );
}

function Tray({ x, color }: { x: number; color: string }) {
  return (
    <g>
      <rect x={x} y="222" width="120" height="34" rx="8" fill={color} />
      <ellipse cx={x + 38} cy="230" rx="22" ry="8" fill="var(--frog-belly)" opacity="0.8" />
      <ellipse cx={x + 82} cy="230" rx="16" ry="7" fill="var(--frog-eye)" opacity="0.75" />
    </g>
  );
}

/* ---------- 操场黄昏（草坪躺平辩论） ---------- */

function FieldScene() {
  return (
    <g>
      <defs>
        <linearGradient id="play-sky-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bow)" />
          <stop offset="0.55" stopColor="var(--frog-blush)" />
          <stop offset="1" stopColor="var(--frog-belly)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#play-sky-dusk)" />
      <circle cx="400" cy="196" r="52" fill="var(--frog-bow)" />
      <circle cx="400" cy="196" r="70" fill="var(--frog-bow)" opacity="0.25" />
      <ellipse cx="150" cy="110" rx="66" ry="18" fill="var(--frog-eye)" opacity="0.85" />
      <ellipse cx="640" cy="150" rx="80" ry="20" fill="var(--frog-eye)" opacity="0.8" />
      <path d="M210 190 q9 -8 18 0 M232 196 q9 -8 18 0" stroke="var(--frog-ink)" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.55" />
      {/* 跑道 */}
      <rect x="0" y="300" width="800" height="84" fill="var(--map-road)" />
      <path d="M0 330 h800 M0 358 h800" stroke="var(--frog-eye)" strokeWidth="3" strokeDasharray="26 20" opacity="0.8" />
      {/* 草坪 */}
      <rect x="0" y="384" width="800" height="66" fill="var(--map-grass)" />
      <path d="M60 440 q6 -20 12 0 M120 448 q6 -20 12 0 M700 442 q6 -20 12 0 M640 450 q6 -20 12 0" stroke="var(--map-leaf)" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* 远处球门 */}
      <path d="M96 300 v-52 M156 300 v-52 M96 252 h60" stroke="var(--frog-eye)" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.9" />
      {/* 记分牌 */}
      <rect x="612" y="204" width="120" height="52" rx="10" fill="var(--frog-ink)" opacity="0.85" />
      <text x="672" y="238" textAnchor="middle" fontSize="19" fontWeight="700" fill="var(--frog-eye)">
        40 圈
      </text>
      <rect x="664" y="256" width="16" height="46" fill="var(--frog-ink)" opacity="0.7" />
    </g>
  );
}

/* ---------- 社团活动室（抽象社团招新） ---------- */

function ClubScene() {
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--secondary)" />
      <rect x="0" y="366" width="800" height="84" fill="var(--map-wood)" opacity="0.3" />
      {/* 横幅 */}
      <path d="M150 30 Q400 66 650 30" stroke="var(--frog-ink)" strokeWidth="3" fill="none" opacity="0.4" />
      <rect x="184" y="40" width="432" height="76" rx="16" fill="var(--frog-berry)" />
      <text x="400" y="90" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--frog-eye)">
        抽象社团招新！
      </text>
      {/* 三角彩旗 */}
      <path d="M40 12 L66 12 L53 44 Z" fill="var(--frog-matcha)" />
      <path d="M120 22 L146 22 L133 54 Z" fill="var(--map-water)" />
      <path d="M660 22 L686 22 L673 54 Z" fill="var(--frog-bow)" />
      <path d="M736 12 L762 12 L749 44 Z" fill="var(--frog-matcha)" />
      {/* 气球 */}
      <Balloon x={86} y={188} color="var(--frog-matcha)" />
      <Balloon x={714} y={176} color="var(--frog-bow)" />
      <Balloon x={766} y={236} color="var(--map-water)" />
      {/* 海报墙 */}
      <rect x="62" y="216" width="216" height="140" rx="12" fill="var(--frog-belly)" />
      <rect x="84" y="238" width="82" height="58" rx="6" fill="var(--frog-matcha)" transform="rotate(-5 125 267)" />
      <rect x="176" y="244" width="82" height="58" rx="6" fill="var(--frog-bow)" transform="rotate(4 217 273)" />
      <rect x="98" y="308" width="140" height="12" rx="6" fill="var(--frog-ink)" opacity="0.2" />
      <text x="170" y="344" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
        每周团建 朋友圈管够
      </text>
      {/* 报名桌 */}
      <rect x="540" y="296" width="190" height="16" rx="7" fill="var(--map-wood)" />
      <rect x="554" y="312" width="12" height="56" rx="5" fill="var(--map-wood)" opacity="0.8" />
      <rect x="704" y="312" width="12" height="56" rx="5" fill="var(--map-wood)" opacity="0.8" />
      <rect x="586" y="272" width="66" height="26" rx="4" fill="var(--frog-eye)" transform="rotate(-3 619 285)" />
      <path d="M596 284 h40" stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.5" />
    </g>
  );
}

function Balloon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <ellipse cx={x} cy={y} rx="24" ry="30" fill={color} />
      <path d={`M${x} ${y + 30} q6 22 -4 44`} stroke="var(--frog-ink)" strokeWidth="2" fill="none" opacity="0.5" />
    </g>
  );
}

/* ---------- 湖边夜景（蛙生的意义） ---------- */

function LakeScene() {
  return (
    <g>
      <defs>
        <linearGradient id="play-sky-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#play-sky-night)" />
      {/* 星星 */}
      {[
        [70, 52, 2.2], [150, 110, 1.6], [240, 40, 2], [330, 96, 1.5], [420, 56, 2.4],
        [500, 120, 1.6], [640, 46, 2], [720, 100, 1.7], [770, 40, 1.4], [280, 150, 1.4],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="var(--frog-eye)" opacity="0.9" />
      ))}
      {/* 月亮 */}
      <circle cx="560" cy="96" r="58" fill="var(--frog-belly)" opacity="0.16" />
      <circle cx="560" cy="96" r="38" fill="var(--frog-belly)" />
      {/* 远处教学楼：一扇不肯灭的灯 */}
      <rect x="668" y="196" width="96" height="74" rx="6" fill="var(--frog-ink)" opacity="0.92" />
      <rect x="712" y="216" width="13" height="17" rx="2" fill="var(--frog-badge)" />
      {/* 树影 */}
      <path d="M0 268 Q120 226 250 262 Q400 296 800 258 L800 280 L0 280 Z" fill="var(--map-leaf)" opacity="0.3" />
      {/* 湖面 */}
      <rect x="0" y="272" width="800" height="178" fill="var(--map-water)" />
      <rect x="0" y="272" width="800" height="178" fill="var(--frog-ink)" opacity="0.32" />
      <ellipse cx="560" cy="322" rx="56" ry="13" fill="var(--frog-belly)" opacity="0.55" />
      <ellipse cx="560" cy="338" rx="34" ry="8" fill="var(--frog-belly)" opacity="0.7" />
      <path d="M80 316 q30 8 60 0 M150 356 q30 8 60 0 M420 372 q30 8 60 0 M640 396 q30 8 60 0" stroke="var(--frog-eye)" strokeWidth="2.6" fill="none" opacity="0.35" />
      {/* 芦苇 */}
      <path d="M52 430 q4 -66 -8 -96 M78 434 q2 -60 16 -88 M700 432 q-4 -62 10 -92 M728 436 q-2 -56 -18 -84" stroke="var(--map-wood)" strokeWidth="4" fill="none" strokeLinecap="round" />
      <ellipse cx="44" cy="330" rx="7" ry="18" fill="var(--map-wood)" transform="rotate(-8 44 330)" />
      <ellipse cx="94" cy="344" rx="7" ry="17" fill="var(--map-wood)" transform="rotate(9 94 344)" />
      <ellipse cx="710" cy="338" rx="7" ry="17" fill="var(--map-wood)" transform="rotate(7 710 338)" />
    </g>
  );
}

/* ---------- 自习楼凌晨（上岸第一剑） ---------- */

function StudyScene() {
  return (
    <g>
      <defs>
        <linearGradient id="play-sky-study" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-zzaizai-deep)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#play-sky-study)" />
      {/* 窗外的月亮 */}
      <circle cx="140" cy="60" r="26" fill="var(--frog-belly)" opacity="0.85" />
      <circle cx="140" cy="60" r="40" fill="var(--frog-belly)" opacity="0.16" />
      {/* 高处的窗：一格亮着，其余都睡了 */}
      {[304, 366, 428, 490].map((wx, i) => (
        <rect
          key={wx}
          x={wx}
          y="46"
          width="46"
          height="56"
          rx="5"
          fill={i === 1 ? "var(--frog-badge)" : "var(--frog-ink)"}
          opacity={i === 1 ? 0.95 : 0.55}
        />
      ))}
      <rect x="304" y="46" width="232" height="56" rx="5" fill="none" stroke="var(--frog-ink)" strokeWidth="5" opacity="0.7" />
      {/* 墙钟：四点零二 */}
      <circle cx="640" cy="92" r="36" fill="var(--frog-eye)" stroke="var(--frog-ink)" strokeWidth="5" />
      <path d="M640 92 L640 70" stroke="var(--frog-ink)" strokeWidth="4" strokeLinecap="round" />
      <path d="M640 92 L658 100" stroke="var(--frog-ink)" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="640" cy="92" r="3.2" fill="var(--frog-ink)" />
      <text x="640" y="154" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--frog-eye)" opacity="0.6">
        再背一遍就睡
      </text>
      {/* 一整面储物柜：一人一格，毕业那天都要清空 */}
      <LockerWall />
      {/* 长桌与台灯光锥 */}
      <rect x="300" y="252" width="440" height="20" rx="9" fill="var(--map-wood)" />
      <rect x="318" y="272" width="14" height="94" rx="6" fill="var(--map-wood)" opacity="0.8" />
      <rect x="708" y="272" width="14" height="94" rx="6" fill="var(--map-wood)" opacity="0.8" />
      <path d="M540 244 L488 168 L592 168 Z" fill="var(--frog-badge)" opacity="0.2" />
      <path d="M540 252 L540 216" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.6" />
      <path d="M516 216 L564 216 L552 192 L528 192 Z" fill="var(--frog-badge)" />
      <ellipse cx="540" cy="228" rx="72" ry="18" fill="var(--frog-badge)" opacity="0.25" />
      {/* 书堆 */}
      <rect x="352" y="240" width="52" height="12" rx="3" fill="var(--frog-berry)" />
      <rect x="356" y="228" width="44" height="12" rx="3" fill="var(--frog-matcha)" />
      <rect x="360" y="216" width="36" height="12" rx="3" fill="var(--frog-bow)" />
      {/* 凉透的保温杯 */}
      <rect x="614" y="230" width="18" height="22" rx="4" fill="var(--frog-apron)" stroke="var(--frog-bag)" strokeWidth="2" />
      {/* 地面 */}
      <rect x="0" y="368" width="800" height="82" fill="var(--map-wood)" opacity="0.3" />
    </g>
  );
}

function LockerWall() {
  const rows = [110, 200, 290];
  return (
    <g>
      <rect x="64" y="96" width="152" height="288" rx="10" fill="var(--map-wood)" opacity="0.9" />
      {rows.map((y, i) => (
        <g key={y}>
          <rect x="76" y={y} width="128" height="80" rx="6" fill="var(--frog-zzaizai)" />
          <rect x="76" y={y} width="128" height="80" rx="6" fill="none" stroke="var(--frog-zzaizai-deep)" strokeWidth="3" />
          <rect x="138" y={y + 8} width="4" height="64" rx="2" fill="var(--frog-zzaizai-deep)" />
          <path d={`M90 ${y + 22} h32 M90 ${y + 30} h32`} stroke="var(--frog-ink)" strokeWidth="2" opacity="0.35" />
          <circle cx="186" cy={y + 40} r="4" fill="var(--frog-ink)" opacity="0.5" />
          {/* 中格贴着一张写了自己名字的便利贴 */}
          {i === 1 && (
            <g transform={`rotate(-4 118 ${y + 58})`}>
              <rect x="100" y={y + 46} width="36" height="24" rx="2" fill="var(--frog-bow)" />
              <path d={`M107 ${y + 56} h22 M107 ${y + 62} h15`} stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.7" />
            </g>
          )}
        </g>
      ))}
    </g>
  );
}

/* ---------- 学工办窗口（最终解释权） ---------- */

function AdminScene() {
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--secondary)" />
      <rect x="0" y="376" width="800" height="74" fill="var(--map-wood)" opacity="0.3" />
      {/* 窗外：楼顶的旗杆还立着 */}
      <rect x="70" y="86" width="170" height="176" rx="10" fill="var(--map-water)" opacity="0.65" />
      <rect x="70" y="86" width="170" height="176" rx="10" fill="none" stroke="var(--frog-ink)" strokeWidth="6" />
      <rect x="140" y="110" width="5" height="126" rx="2.5" fill="var(--map-wood)" />
      <polygon points="145,110 189,124 145,138" fill="var(--frog-berry)" />
      <rect x="62" y="258" width="186" height="12" rx="6" fill="var(--frog-belly)" />
      {/* 公告栏：通知盖着通知，最上面是第三版措辞 */}
      <rect x="292" y="100" width="200" height="168" rx="10" fill="var(--map-wood)" />
      <rect x="302" y="110" width="180" height="148" rx="6" fill="var(--frog-belly)" />
      <rect x="316" y="124" width="70" height="92" rx="3" fill="var(--frog-glass)" transform="rotate(-3 351 170)" />
      <rect x="398" y="126" width="70" height="92" rx="3" fill="var(--frog-badge)" transform="rotate(4 433 172)" />
      <text
        x="433"
        y="152"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="var(--frog-ink)"
        opacity="0.7"
        transform="rotate(4 433 172)"
      >
        温馨提示
      </text>
      <path d="M322 236 h152 M322 246 h120" stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.25" />
      {/* 盖章窗口：玻璃后永远有一只蛙 */}
      <rect x="536" y="90" width="216" height="196" rx="12" fill="var(--frog-glass)" opacity="0.75" />
      <rect x="536" y="90" width="216" height="196" rx="12" fill="none" stroke="var(--frog-ink)" strokeWidth="6" />
      <circle cx="644" cy="172" r="40" fill="none" stroke="var(--frog-ink)" strokeWidth="5" opacity="0.5" />
      <path d="M604 172 h80" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.5" />
      {/* 台面：待盖章的通知与红章 */}
      <rect x="512" y="286" width="260" height="18" rx="8" fill="var(--map-wood)" />
      <rect x="524" y="304" width="12" height="62" rx="5" fill="var(--map-wood)" opacity="0.8" />
      <rect x="748" y="304" width="12" height="62" rx="5" fill="var(--map-wood)" opacity="0.8" />
      <rect x="566" y="262" width="76" height="22" rx="3" fill="var(--frog-belly)" transform="rotate(-3 604 273)" />
      <circle cx="676" cy="270" r="15" fill="none" stroke="var(--frog-berry-deep)" strokeWidth="3" />
      <circle cx="676" cy="270" r="8" fill="none" stroke="var(--frog-berry-deep)" strokeWidth="2" opacity="0.8" />
    </g>
  );
}
