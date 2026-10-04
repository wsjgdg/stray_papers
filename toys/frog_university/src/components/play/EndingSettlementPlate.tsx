/**
 * 结局结算画面（批次 CY-124 起，CY-125 铺满十线，CY-137 三十格全部升为专属定格）：
 * 印章 + 档位名 + 认定依据（累计沉默值落进哪一档）+ 一行档案判词 + 一幅三格小定格。
 * 定格来源：三十个结局全部按结局 id 手绘专属画面（行政楼/医务室 CY-124 起，其余八线 CY-137），
 * 复用下方意象零件库取件（零件同名可跨线复用）；settlement.art 的意象三连保留作兜底。
 * 配色只用主题变量（hsl(var(--*)) / var(--frog-*)，口径同 CgArt）。
 */
import { useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { Ending } from "@/data/storylines";
import { ImageDown } from "lucide-react";
import { clsx } from "clsx";
import { capturePng } from "@/lib/exportPng";

/* ---------- 意象零件库：每个零件画一格（以 cx,cy 为中心，约 84×90 的格内） ---------- */

interface MotifProps {
  cx: number;
  cy: number;
}

const MOTIFS: Record<string, (p: MotifProps) => ReactElement> = {
  /** 一张纸：几行字，最底下一行是红的 */
  paper: ({ cx, cy }) => (
    <g>
      <rect x={cx - 24} y={cy - 32} width="48" height="64" rx="2" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
      <rect x={cx - 15} y={cy - 20} width="30" height="4" rx="2" fill="var(--frog-ink)" opacity="0.35" />
      <rect x={cx - 15} y={cy - 10} width="24" height="4" rx="2" fill="var(--frog-ink)" opacity="0.25" />
      <rect x={cx - 15} y={cy} width="28" height="4" rx="2" fill="var(--frog-ink)" opacity="0.25" />
      <rect x={cx - 15} y={cy + 12} width="18" height="5" rx="2" fill="hsl(var(--destructive))" opacity="0.6" />
    </g>
  ),
  /** 一摞材料：三层，层层错开 */
  stack: ({ cx, cy }) => (
    <g>
      <rect x={cx - 27} y={cy - 24} width="52" height="13" rx="2" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.3" />
      <rect x={cx - 24} y={cy - 7} width="52" height="13" rx="2" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.3" />
      <rect x={cx - 26} y={cy + 10} width="52" height="13" rx="2" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.3" />
      <rect x={cx - 14} y={cy + 14} width="24" height="4" rx="2" fill="var(--frog-ink)" opacity="0.25" />
    </g>
  ),
  /** 柱状图：年报的数据，最后一根是主色 */
  bars: ({ cx, cy }) => (
    <g>
      <line x1={cx - 28} y1={cy + 26} x2={cx + 28} y2={cy + 26} stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="2" />
      <rect x={cx - 24} y={cy + 2} width="10" height="24" rx="1" fill="var(--frog-ink)" opacity="0.3" />
      <rect x={cx - 9} y={cy - 12} width="10" height="38" rx="1" fill="var(--frog-ink)" opacity="0.3" />
      <rect x={cx + 6} y={cy - 4} width="10" height="30" rx="1" fill="var(--frog-ink)" opacity="0.3" />
      <rect x={cx + 20} y={cy - 24} width="10" height="50" rx="1" fill="hsl(var(--primary))" opacity="0.75" />
    </g>
  ),
  /** 方章：盖下去的那枚 */
  stamp: ({ cx, cy }) => (
    <g transform={`rotate(-7 ${cx} ${cy})`}>
      <rect x={cx - 20} y={cy - 20} width="40" height="40" rx="4" fill="none" stroke="hsl(var(--destructive))" strokeOpacity="0.75" strokeWidth="3" />
      <rect x={cx - 11} y={cy - 11} width="22" height="22" rx="2" fill="hsl(var(--destructive))" opacity="0.25" />
      <rect x={cx - 6} y={cy + 22} width="12" height="10" rx="2" fill="var(--frog-ink)" opacity="0.4" />
    </g>
  ),
  /** 钟：几点都有人等 */
  clock: ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy} r="24" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.45" strokeWidth="2" />
      <line x1={cx} y1={cy} x2={cx} y2={cy - 14} stroke="var(--frog-ink)" strokeOpacity="0.6" strokeWidth="2" />
      <line x1={cx} y1={cy} x2={cx + 10} y2={cy + 6} stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="2" />
      <circle cx={cx} cy={cy} r="2" fill="var(--frog-ink)" opacity="0.6" />
    </g>
  ),
  /** 一盏灯：留到最后的那盏 */
  lamp: ({ cx, cy }) => (
    <g>
      <path d={`M ${cx - 20} ${cy - 8} A 20 20 0 0 1 ${cx + 20} ${cy - 8} Z`} fill="var(--frog-badge)" stroke="var(--frog-ink)" strokeOpacity="0.4" />
      <line x1={cx} y1={cy - 28} x2={cx} y2={cy - 34} stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="2" />
      <path d={`M ${cx - 16} ${cy - 6} L ${cx + 16} ${cy - 6} L ${cx + 26} ${cy + 28} L ${cx - 26} ${cy + 28} Z`} fill="hsl(var(--primary))" opacity="0.14" />
      <line x1={cx - 28} y1={cy + 30} x2={cx + 28} y2={cy + 30} stroke="var(--frog-ink)" strokeOpacity="0.35" strokeWidth="2" />
    </g>
  ),
  /** 绿应急灯：十一点零五，一天不落 */
  lampGreen: ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy - 12} r="16" fill="var(--frog-matcha)" opacity="0.3" />
      <rect x={cx - 14} y={cy - 22} width="28" height="18" rx="6" fill="var(--frog-matcha)" stroke="var(--frog-ink)" strokeOpacity="0.4" />
      <path d={`M ${cx - 12} ${cy} L ${cx + 12} ${cy} L ${cx + 22} ${cy + 28} L ${cx - 22} ${cy + 28} Z`} fill="var(--frog-matcha)" opacity="0.18" />
      <line x1={cx - 26} y1={cy + 30} x2={cx + 26} y2={cy + 30} stroke="var(--frog-ink)" strokeOpacity="0.35" strokeWidth="2" />
    </g>
  ),
  /** 格子表：值班表 / 排期表，第一格总有安排 */
  grid: ({ cx, cy }) => (
    <g>
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2].map((c) => (
          <rect
            key={`${r}-${c}`}
            x={cx - 27 + c * 19}
            y={cy - 28 + r * 15}
            width="17"
            height="13"
            rx="2"
            fill={r === 0 && c === 0 ? "hsl(var(--primary))" : "hsl(var(--card))"}
            fillOpacity={r === 0 && c === 0 ? 0.55 : 1}
            stroke="var(--frog-ink)"
            strokeOpacity="0.3"
          />
        )),
      )}
    </g>
  ),
  /** 便利贴：抄走的那张 */
  sticky: ({ cx, cy }) => (
    <g transform={`rotate(5 ${cx} ${cy})`}>
      <rect x={cx - 22} y={cy - 22} width="44" height="44" rx="2" fill="var(--frog-badge)" stroke="var(--frog-ink)" strokeOpacity="0.35" />
      <rect x={cx - 14} y={cy - 10} width="28" height="4" rx="2" fill="var(--frog-ink)" opacity="0.4" />
      <rect x={cx - 14} y={cy} width="20" height="4" rx="2" fill="var(--frog-ink)" opacity="0.3" />
      <path d={`M ${cx + 22} ${cy + 12} L ${cx + 22} ${cy + 22} L ${cx + 12} ${cy + 22} Z`} fill="var(--frog-ink)" opacity="0.15" />
    </g>
  ),
  /** 抽屉：最底下那格 */
  drawer: ({ cx, cy }) => (
    <g>
      <rect x={cx - 28} y={cy - 26} width="56" height="54" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
      <line x1={cx - 28} y1={cy - 8} x2={cx + 28} y2={cy - 8} stroke="var(--frog-ink)" strokeOpacity="0.25" />
      <rect x={cx - 24} y={cy + 2} width="48" height="20" rx="2" fill="hsl(var(--muted))" stroke="var(--frog-ink)" strokeOpacity="0.3" />
      <circle cx={cx} cy={cy + 12} r="3" fill="var(--frog-ink)" opacity="0.5" />
    </g>
  ),
  /** 手机：发送键悬过的那块屏 */
  phone: ({ cx, cy }) => (
    <g>
      <rect x={cx - 18} y={cy - 30} width="36" height="60" rx="6" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.4" />
      <rect x={cx - 6} y={cy - 26} width="12" height="3" rx="1.5" fill="var(--frog-ink)" opacity="0.3" />
      <rect x={cx - 12} y={cy - 16} width="24" height="4" rx="2" fill="var(--frog-ink)" opacity="0.3" />
      <rect x={cx - 12} y={cy - 6} width="18" height="4" rx="2" fill="var(--frog-ink)" opacity="0.22" />
      <rect x={cx - 12} y={cy + 6} width="22" height="4" rx="2" fill="var(--frog-ink)" opacity="0.22" />
      <circle cx={cx + 8} cy={cy + 18} r="6" fill="hsl(var(--primary))" opacity="0.55" />
    </g>
  ),
  /** 厚本子：账本 / 档案册 */
  book: ({ cx, cy }) => (
    <g>
      <rect x={cx - 22} y={cy - 28} width="44" height="56" rx="3" fill="var(--frog-khaki)" stroke="var(--frog-ink)" strokeOpacity="0.4" />
      <line x1={cx - 14} y1={cy - 28} x2={cx - 14} y2={cy + 28} stroke="var(--frog-ink)" strokeOpacity="0.3" strokeWidth="2" />
      <rect x={cx - 6} y={cy - 16} width="20" height="4" rx="2" fill="var(--frog-ink)" opacity="0.35" />
      <rect x={cx - 6} y={cy - 6} width="14" height="4" rx="2" fill="var(--frog-ink)" opacity="0.25" />
      <rect x={cx + 18} y={cy - 24} width="6" height="48" rx="1" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.25" />
    </g>
  ),
  /** 笔：描深了一遍的那支 */
  pen: ({ cx, cy }) => (
    <g transform={`rotate(38 ${cx} ${cy})`}>
      <rect x={cx - 4} y={cy - 30} width="8" height="46" rx="3" fill="hsl(var(--primary))" opacity="0.75" />
      <path d={`M ${cx - 4} ${cy + 16} L ${cx + 4} ${cy + 16} L ${cx} ${cy + 28} Z`} fill="var(--frog-ink)" opacity="0.65" />
      <rect x={cx - 4} y={cy - 22} width="8" height="4" fill="var(--frog-ink)" opacity="0.3" />
    </g>
  ),
  /** 手环：把休息记成自律的那只 */
  wristband: ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy} r="22" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.7" strokeWidth="7" />
      <rect x={cx - 10} y={cy - 30} width="20" height="16" rx="4" fill="var(--frog-ink)" opacity="0.75" />
      <rect x={cx - 6} y={cy - 25} width="12" height="3" rx="1.5" fill="var(--frog-matcha)" opacity="0.9" />
    </g>
  ),
  /** 一撮草：那块最暗的 / 那块压平的 */
  grass: ({ cx, cy }) => (
    <g>
      <line x1={cx - 30} y1={cy + 26} x2={cx + 30} y2={cy + 26} stroke="var(--frog-ink)" strokeOpacity="0.3" strokeWidth="2" />
      <path d={`M ${cx - 18} ${cy + 26} Q ${cx - 20} ${cy - 4} ${cx - 10} ${cy - 16}`} fill="none" stroke="var(--frog-matcha-deep)" strokeWidth="3" strokeLinecap="round" />
      <path d={`M ${cx - 2} ${cy + 26} Q ${cx - 2} ${cy - 8} ${cx + 2} ${cy - 22}`} fill="none" stroke="var(--frog-matcha)" strokeWidth="3" strokeLinecap="round" />
      <path d={`M ${cx + 12} ${cy + 26} Q ${cx + 14} ${cy} ${cx + 22} ${cy - 12}`} fill="none" stroke="var(--frog-matcha-deep)" strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  /** 长条子：病假条 / 借书条，带骑缝虚线 */
  slip: ({ cx, cy }) => (
    <g>
      <rect x={cx - 14} y={cy - 32} width="28" height="64" rx="2" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
      <line x1={cx - 14} y1={cy + 10} x2={cx + 14} y2={cy + 10} stroke="var(--frog-ink)" strokeOpacity="0.3" strokeDasharray="3 3" />
      <rect x={cx - 8} y={cy - 22} width="16" height="4" rx="2" fill="var(--frog-ink)" opacity="0.3" />
      <rect x={cx - 8} y={cy - 12} width="12" height="4" rx="2" fill="var(--frog-ink)" opacity="0.22" />
      <rect x={cx - 7} y={cy + 16} width="14" height="12" rx="2" fill="none" stroke="hsl(var(--destructive))" strokeOpacity="0.65" strokeWidth="2" />
    </g>
  ),
  /** 计时器：三十分钟，响第一声就起身 */
  timer: ({ cx, cy }) => (
    <g>
      <rect x={cx - 7} y={cy - 32} width="14" height="7" rx="2" fill="var(--frog-ink)" opacity="0.5" />
      <circle cx={cx} cy={cy + 2} r="24" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.45" strokeWidth="2" />
      <line x1={cx} y1={cy + 2} x2={cx} y2={cy - 12} stroke="hsl(var(--destructive))" strokeOpacity="0.7" strokeWidth="2" />
      <line x1={cx} y1={cy + 2} x2={cx + 12} y2={cy + 8} stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="2" />
      <circle cx={cx} cy={cy + 2} r="2.5" fill="var(--frog-ink)" opacity="0.6" />
    </g>
  ),
  /** 体温计：三十六度五 */
  thermometer: ({ cx, cy }) => (
    <g>
      <rect x={cx - 6} y={cy - 34} width="12" height="48" rx="6" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.4" />
      <circle cx={cx} cy={cy + 20} r="10" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.4" />
      <circle cx={cx} cy={cy + 20} r="6" fill="hsl(var(--destructive))" opacity="0.7" />
      <rect x={cx - 2.5} y={cy - 12} width="5" height="28" rx="2.5" fill="hsl(var(--destructive))" opacity="0.7" />
      <line x1={cx + 8} y1={cy - 20} x2={cx + 14} y2={cy - 20} stroke="var(--frog-ink)" strokeOpacity="0.35" strokeWidth="2" />
      <line x1={cx + 8} y1={cy - 10} x2={cx + 14} y2={cy - 10} stroke="var(--frog-ink)" strokeOpacity="0.35" strokeWidth="2" />
      <line x1={cx + 8} y1={cy} x2={cx + 14} y2={cy} stroke="var(--frog-ink)" strokeOpacity="0.35" strokeWidth="2" />
    </g>
  ),
  /** 横幅：八点挂好的那种 */
  banner: ({ cx, cy }) => (
    <g>
      <line x1={cx - 30} y1={cy - 26} x2={cx - 30} y2={cy + 30} stroke="var(--frog-ink)" strokeOpacity="0.45" strokeWidth="3" />
      <line x1={cx + 30} y1={cy - 26} x2={cx + 30} y2={cy + 30} stroke="var(--frog-ink)" strokeOpacity="0.45" strokeWidth="3" />
      <rect x={cx - 30} y={cy - 18} width="60" height="26" rx="2" fill="hsl(var(--destructive))" opacity="0.55" />
      <rect x={cx - 20} y={cy - 9} width="40" height="4" rx="2" fill="hsl(var(--card))" opacity="0.85" />
      <rect x={cx - 14} y={cy - 1} width="28" height="4" rx="2" fill="hsl(var(--card))" opacity="0.6" />
    </g>
  ),
  /** 湖面月色：那晚唯一完整记得的 */
  moonLake: ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy - 16} r="13" fill="var(--frog-badge)" stroke="var(--frog-ink)" strokeOpacity="0.3" />
      <circle cx={cx + 5} cy={cy - 19} r="10" fill="hsl(var(--muted))" opacity="0.55" />
      <path d={`M ${cx - 28} ${cy + 10} Q ${cx - 14} ${cy + 4} ${cx} ${cy + 10} T ${cx + 28} ${cy + 10}`} fill="none" stroke="var(--frog-bluegray)" strokeOpacity="0.7" strokeWidth="2.5" />
      <path d={`M ${cx - 24} ${cy + 22} Q ${cx - 10} ${cy + 16} ${cx + 4} ${cy + 22} T ${cx + 26} ${cy + 22}`} fill="none" stroke="var(--frog-bluegray)" strokeOpacity="0.45" strokeWidth="2.5" />
    </g>
  ),
  /** 玉米：烫手的那部分 */
  corn: ({ cx, cy }) => (
    <g transform={`rotate(-12 ${cx} ${cy})`}>
      <ellipse cx={cx} cy={cy} rx="13" ry="26" fill="var(--frog-badge)" stroke="var(--frog-ink)" strokeOpacity="0.35" />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2].map((c) => (
          <circle key={`${r}-${c}`} cx={cx - 6 + c * 6} cy={cy - 15 + r * 10} r="1.8" fill="var(--frog-ink)" opacity="0.3" />
        )),
      )}
      <path d={`M ${cx - 13} ${cy + 8} Q ${cx - 24} ${cy + 18} ${cx - 14} ${cy + 30}`} fill="none" stroke="var(--frog-matcha-deep)" strokeWidth="3" strokeLinecap="round" />
      <path d={`M ${cx + 13} ${cy + 8} Q ${cx + 24} ${cy + 18} ${cx + 14} ${cy + 30}`} fill="none" stroke="var(--frog-matcha)" strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  /** 手电：开着最亮一档 */
  flashlight: ({ cx, cy }) => (
    <g transform={`rotate(-24 ${cx} ${cy})`}>
      <rect x={cx - 9} y={cy - 14} width="18" height="42" rx="4" fill="var(--frog-bluegray)" stroke="var(--frog-ink)" strokeOpacity="0.4" />
      <rect x={cx - 12} y={cy - 24} width="24" height="12" rx="3" fill="var(--frog-bluegray-deep)" stroke="var(--frog-ink)" strokeOpacity="0.4" />
      <path d={`M ${cx - 10} ${cy - 26} L ${cx + 10} ${cy - 26} L ${cx + 20} ${cy - 42} L ${cx - 20} ${cy - 42} Z`} fill="var(--frog-badge)" opacity="0.5" />
    </g>
  ),
  /** 封箱：请勿拆封 */
  box: ({ cx, cy }) => (
    <g>
      <rect x={cx - 28} y={cy - 20} width="56" height="44" rx="3" fill="var(--frog-khaki)" stroke="var(--frog-ink)" strokeOpacity="0.4" />
      <rect x={cx - 4} y={cy - 20} width="8" height="44" fill="var(--frog-ink)" opacity="0.18" />
      <rect x={cx - 28} y={cy - 6} width="56" height="14" fill="hsl(var(--card))" opacity="0.8" />
      <rect x={cx - 18} y={cy - 1} width="36" height="4" rx="2" fill="var(--frog-ink)" opacity="0.35" />
    </g>
  ),
  /** 餐盘摞：没动过的那摞 */
  tray: ({ cx, cy }) => (
    <g>
      <rect x={cx - 26} y={cy + 8} width="52" height="8" rx="3" fill="var(--frog-bluegray)" stroke="var(--frog-ink)" strokeOpacity="0.35" />
      <rect x={cx - 24} y={cy - 4} width="52" height="8" rx="3" fill="var(--frog-bluegray)" stroke="var(--frog-ink)" strokeOpacity="0.35" transform={`rotate(-2 ${cx} ${cy})`} />
      <rect x={cx - 26} y={cy - 16} width="52" height="8" rx="3" fill="var(--frog-bluegray)" stroke="var(--frog-ink)" strokeOpacity="0.35" transform={`rotate(1.5 ${cx} ${cy})`} />
      <path d={`M ${cx - 8} ${cy - 24} Q ${cx - 4} ${cy - 30} ${cx - 8} ${cy - 36}`} fill="none" stroke="var(--frog-ink)" strokeOpacity="0.2" strokeWidth="2" />
      <path d={`M ${cx + 4} ${cy - 24} Q ${cx + 8} ${cy - 31} ${cx + 4} ${cy - 38}`} fill="none" stroke="var(--frog-ink)" strokeOpacity="0.2" strokeWidth="2" />
    </g>
  ),
  /** 勺与锅：打勺的位置 */
  ladle: ({ cx, cy }) => (
    <g>
      <path d={`M ${cx - 26} ${cy + 2} A 26 20 0 0 0 ${cx + 26} ${cy + 2} Z`} fill="var(--frog-bluegray)" stroke="var(--frog-ink)" strokeOpacity="0.4" />
      <line x1={cx - 30} y1={cy + 2} x2={cx + 30} y2={cy + 2} stroke="var(--frog-ink)" strokeOpacity="0.5" strokeWidth="3" />
      <line x1={cx + 6} y1={cy - 4} x2={cx + 22} y2={cy - 28} stroke="var(--frog-ink)" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
      <path d={`M ${cx - 2} ${cy - 6} A 9 9 0 0 0 ${cx + 14} ${cy - 6} Z`} fill="var(--frog-badge)" stroke="var(--frog-ink)" strokeOpacity="0.4" transform={`rotate(-18 ${cx + 6} ${cy - 6})`} />
      <path d={`M ${cx - 14} ${cy + 22} L ${cx + 14} ${cy + 22}`} stroke="var(--frog-ink)" strokeOpacity="0.3" strokeWidth="2" />
    </g>
  ),
  /** 相片：相册名半分钟就定好了 */
  photo: ({ cx, cy }) => (
    <g transform={`rotate(-4 ${cx} ${cy})`}>
      <rect x={cx - 24} y={cy - 26} width="48" height="56" rx="2" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
      <rect x={cx - 19} y={cy - 21} width="38" height="34" rx="1" fill="hsl(var(--muted))" opacity="0.7" />
      <circle cx={cx - 8} cy={cy - 12} r="4" fill="var(--frog-badge)" />
      <path d={`M ${cx - 19} ${cy + 13} L ${cx - 6} ${cy - 2} L ${cx + 4} ${cy + 8} L ${cx + 12} ${cy + 1} L ${cx + 19} ${cy + 13} Z`} fill="var(--frog-matcha)" opacity="0.7" />
      <rect x={cx - 12} y={cy + 19} width="24" height="4" rx="2" fill="var(--frog-ink)" opacity="0.3" />
    </g>
  ),
  /** 倒计时牌：永远差六天 */
  countdown: ({ cx, cy }) => (
    <g>
      <rect x={cx - 26} y={cy - 24} width="52" height="44" rx="3" fill="var(--frog-ink)" opacity="0.82" />
      <line x1={cx - 26} y1={cy - 2} x2={cx + 26} y2={cy - 2} stroke="hsl(var(--card))" strokeOpacity="0.5" strokeWidth="2" />
      <rect x={cx - 18} y={cy - 17} width="14" height="11" rx="1" fill="hsl(var(--card))" opacity="0.85" />
      <rect x={cx + 4} y={cy - 17} width="14" height="11" rx="1" fill="hsl(var(--card))" opacity="0.85" />
      <rect x={cx - 18} y={cy + 4} width="14" height="11" rx="1" fill="hsl(var(--card))" opacity="0.5" />
      <rect x={cx + 4} y={cy + 4} width="14" height="11" rx="1" fill="hsl(var(--card))" opacity="0.5" />
      <rect x={cx - 10} y={cy + 22} width="20" height="6" rx="2" fill="var(--frog-ink)" opacity="0.5" />
    </g>
  ),
};

/* ---------- 行政楼线三档专属定格（批次 CY-124，按结局 id 手绘） ---------- */

function BureauArt({ endingId }: { endingId: string }) {
  if (endingId === "xg-e1") {
    return (
      <svg viewBox="0 0 320 110" className="h-28 w-full" role="img" aria-label="定格：被截图挂上墙的通知，旁边是走了十一小时的钟">
        <rect x="8" y="6" width="304" height="98" rx="10" fill="hsl(var(--muted))" opacity="0.35" />
        <line x1="8" y1="55" x2="312" y2="55" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        <line x1="112" y1="6" x2="112" y2="104" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        <line x1="214" y1="6" x2="214" y2="104" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        <circle cx="58" cy="55" r="20" fill="none" stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="2" />
        <line x1="58" y1="55" x2="58" y2="40" stroke="var(--frog-ink)" strokeOpacity="0.6" strokeWidth="2" />
        <line x1="58" y1="55" x2="48" y2="61" stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="2" />
        <rect x="122" y="16" width="80" height="68" rx="2" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
        <rect x="148" y="10" width="28" height="9" rx="2" fill="hsl(var(--primary))" opacity="0.35" transform="rotate(-4 162 14)" />
        <rect x="132" y="30" width="60" height="4" rx="2" fill="var(--frog-ink)" opacity="0.35" />
        <rect x="132" y="40" width="52" height="4" rx="2" fill="var(--frog-ink)" opacity="0.25" />
        <rect x="132" y="50" width="56" height="4" rx="2" fill="var(--frog-ink)" opacity="0.25" />
        <rect x="132" y="62" width="34" height="5" rx="2" fill="hsl(var(--destructive))" opacity="0.65" />
        <rect x="230" y="24" width="62" height="46" rx="8" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
        <path d="M242 68 L237 82 L254 68 Z" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
        <rect x="240" y="36" width="42" height="4" rx="2" fill="var(--frog-ink)" opacity="0.35" />
        <rect x="240" y="46" width="34" height="4" rx="2" fill="var(--frog-ink)" opacity="0.25" />
        <circle cx="282" cy="60" r="4" fill="hsl(var(--primary))" opacity="0.6" />
      </svg>
    );
  }
  if (endingId === "xg-e2") {
    return (
      <svg viewBox="0 0 320 110" className="h-28 w-full" role="img" aria-label="定格：钥匙绳上的一排小章，和一份折角的七百字检讨">
        <rect x="8" y="6" width="304" height="98" rx="10" fill="hsl(var(--muted))" opacity="0.35" />
        <path d="M58 12 C 68 40, 52 70, 64 100" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" opacity="0.75" />
        <circle cx="58" cy="13" r="7" fill="none" stroke="var(--frog-ink)" strokeOpacity="0.5" strokeWidth="2" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line x1={61 + i * 2} y1={30 + i * 17} x2={80 + i * 3} y2={34 + i * 17} stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="1.5" />
            <rect x={80 + i * 3} y={29 + i * 17} width="14" height="11" rx="2" fill="var(--frog-badge)" stroke="var(--frog-ink)" strokeOpacity="0.4" />
          </g>
        ))}
        <rect x="150" y="22" width="96" height="66" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
        <path d="M224 22 L246 44" stroke="var(--frog-ink)" strokeOpacity="0.3" strokeWidth="1.5" fill="none" />
        <path d="M224 22 L246 22 L246 44 Z" fill="hsl(var(--muted))" opacity="0.7" />
        <rect x="162" y="36" width="52" height="4" rx="2" fill="var(--frog-ink)" opacity="0.3" />
        <rect x="162" y="46" width="64" height="4" rx="2" fill="var(--frog-ink)" opacity="0.22" />
        <rect x="162" y="56" width="58" height="4" rx="2" fill="var(--frog-ink)" opacity="0.22" />
        <rect x="162" y="66" width="40" height="4" rx="2" fill="var(--frog-ink)" opacity="0.22" />
        <rect x="212" y="60" width="22" height="18" rx="3" fill="none" stroke="hsl(var(--destructive))" strokeOpacity="0.7" strokeWidth="2" transform="rotate(-8 223 69)" />
        <rect x="266" y="64" width="28" height="28" rx="2" fill="var(--frog-badge)" opacity="0.85" transform="rotate(6 280 78)" />
        <rect x="272" y="72" width="16" height="3" rx="1.5" fill="var(--frog-ink)" opacity="0.4" transform="rotate(6 280 78)" />
        <rect x="272" y="79" width="12" height="3" rx="1.5" fill="var(--frog-ink)" opacity="0.3" transform="rotate(6 280 78)" />
      </svg>
    );
  }
  if (endingId === "xg-e3") {
    return (
      <svg viewBox="0 0 320 110" className="h-28 w-full" role="img" aria-label="定格：落款行、磨掉漆的章柄，和一块干着的印泥">
        <rect x="8" y="6" width="304" height="98" rx="10" fill="hsl(var(--muted))" opacity="0.35" />
        <rect x="34" y="14" width="180" height="84" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
        <rect x="48" y="28" width="120" height="4" rx="2" fill="var(--frog-ink)" opacity="0.25" />
        <rect x="48" y="38" width="146" height="4" rx="2" fill="var(--frog-ink)" opacity="0.25" />
        <rect x="48" y="48" width="138" height="4" rx="2" fill="var(--frog-ink)" opacity="0.25" />
        <rect x="48" y="64" width="152" height="6" rx="3" fill="hsl(var(--primary))" opacity="0.8" />
        <rect x="48" y="82" width="44" height="5" rx="2" fill="var(--frog-ink)" opacity="0.5" />
        <circle cx="262" cy="36" r="17" fill="none" stroke="hsl(var(--destructive))" strokeOpacity="0.75" strokeWidth="3" />
        <rect x="256" y="52" width="12" height="20" rx="3" fill="var(--frog-ink)" opacity="0.45" />
        <rect x="252" y="70" width="20" height="8" rx="2" fill="var(--frog-ink)" opacity="0.65" />
        <circle cx="262" cy="92" r="9" fill="none" stroke="var(--frog-ink)" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    );
  }
  /* ---------- 医务室线三档（CY-131）：口径同行政线三档——按结局手绘专属定格 ---------- */
  if (endingId === "yj-e1") {
    return (
      <svg viewBox="0 0 320 110" className="h-28 w-full" role="img" aria-label="定格：一张空着的条子，签发人栏已经盖好了章">
        <rect x="8" y="6" width="304" height="98" rx="10" fill="hsl(var(--muted))" opacity="0.35" />
        <line x1="8" y1="55" x2="312" y2="55" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        <line x1="112" y1="6" x2="112" y2="104" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        <line x1="214" y1="6" x2="214" y2="104" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        {/* 空白条子：事由栏空着，签发人栏盖好章 */}
        <g transform="rotate(-2 160 55)">
          <rect x="108" y="18" width="104" height="74" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.4" />
          <text x="118" y="32" fontSize="8" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
            事由栏
          </text>
          {/* 事由栏：空着——栏窄，写小一点，挤得下 */}
          <rect x="118" y="38" width="84" height="14" rx="2" fill="var(--frog-mianmian)" opacity="0.4" />
          <path d="M118 38 h84 M118 52 h84" stroke="var(--frog-ink)" strokeOpacity="0.25" strokeWidth="1" />
          <text x="118" y="66" fontSize="7" fill="var(--frog-ink)" opacity="0.45">
            有效期
          </text>
          <text x="118" y="82" fontSize="7" fill="var(--frog-ink)" opacity="0.45">
            签发人
          </text>
          {/* 签发人栏的章：已经盖好了 */}
          <circle cx="196" cy="80" r="10" fill="none" stroke="hsl(var(--destructive))" strokeOpacity="0.8" strokeWidth="2.4" />
          <path d="M191 80 h10 M196 75 v10" stroke="hsl(var(--destructive))" strokeOpacity="0.7" strokeWidth="1.6" />
        </g>
        {/* 窗边那把椅子：朝着窗，靠背是暖的 */}
        <g>
          <rect x="30" y="30" width="34" height="44" rx="6" fill="var(--frog-mianmian)" opacity="0.75" />
          <rect x="30" y="60" width="46" height="10" rx="4" fill="var(--frog-mianmian-deep)" opacity="0.7" />
          <path d="M40 70 v20 M62 70 v20" stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="3" strokeLinecap="round" />
        </g>
        {/* 窗光 */}
        <path d="M272 16 L312 16 L312 46 Z" fill="var(--frog-badge)" opacity="0.18" />
      </svg>
    );
  }
  if (endingId === "yj-e2") {
    return (
      <svg viewBox="0 0 320 110" className="h-28 w-full" role="img" aria-label="定格：计时器走完三十分钟，折成一样大小的条子按时归队">
        <rect x="8" y="6" width="304" height="98" rx="10" fill="hsl(var(--muted))" opacity="0.35" />
        <line x1="8" y1="55" x2="312" y2="55" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        <line x1="112" y1="6" x2="112" y2="104" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        <line x1="214" y1="6" x2="214" y2="104" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        {/* 计时器：三十分钟，响了就起 */}
        <g>
          <rect x="26" y="38" width="58" height="34" rx="6" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.4" />
          <text x="55" y="60" textAnchor="middle" fontSize="14" fontWeight="800" fill="hsl(var(--destructive))" opacity="0.85">
            30
          </text>
          <rect x="26" y="34" width="58" height="6" rx="3" fill="var(--frog-ink)" opacity="0.2" />
        </g>
        {/* 抽屉里的条子：折成一样大小，编号连着号 */}
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={`slip-${i}`}>
            <rect x={124 + i * 26} y={34 + (i % 2) * 6} width="22" height="30" rx="2" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.3" />
            <path d={`M${128 + i * 26} ${42 + (i % 2) * 6} h14 M${128 + i * 26} ${49 + (i % 2) * 6} h10`} stroke="var(--frog-ink)" strokeOpacity="0.28" strokeWidth="1.4" />
          </g>
        ))}
        {/* 登记册：名字排成一列，间距均匀——像在出勤 */}
        <g>
          <rect x="122" y="72" width="160" height="26" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={`row-${i}`} x={130 + i * 25} y={80} width="3" height="10" rx="1.5" fill="var(--frog-ink)" opacity={0.55 - i * 0.05} />
          ))}
        </g>
        {/* 按时归队的勾 */}
        <circle cx="292" cy="85" r="10" fill="none" stroke="hsl(var(--destructive))" strokeOpacity="0.75" strokeWidth="2.4" />
        <path d="M287 85 l4 4 7-8" stroke="hsl(var(--destructive))" strokeOpacity="0.7" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (endingId === "yj-e3") {
    return (
      <svg viewBox="0 0 320 110" className="h-28 w-full" role="img" aria-label="定格：登记台的另一侧——体温计、落章，和磨砂玻璃上的四个字">
        <rect x="8" y="6" width="304" height="98" rx="10" fill="hsl(var(--muted))" opacity="0.35" />
        <line x1="8" y1="55" x2="312" y2="55" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        <line x1="112" y1="6" x2="112" y2="104" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        <line x1="214" y1="6" x2="214" y2="104" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.15" />
        {/* 电子体温计：三十六度五 */}
        <g>
          <rect x="26" y="44" width="70" height="26" rx="13" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.4" />
          <text x="61" y="61" textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--frog-ink)" opacity="0.75">
            36.5
          </text>
          <rect x="96" y="54" width="14" height="6" rx="3" fill="var(--frog-mianmian-deep)" opacity="0.7" />
        </g>
        {/* 登记表：章盖在数字和「发热」中间 */}
        <g>
          <rect x="128" y="24" width="104" height="62" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
          <text x="138" y="38" fontSize="7" fill="var(--frog-ink)" opacity="0.5">
            症状栏
          </text>
          <text x="176" y="58" fontSize="10" fontWeight="800" fill="var(--frog-ink)" opacity="0.75">
            发热
          </text>
          <circle cx="160" cy="54" r="9" fill="none" stroke="hsl(var(--destructive))" strokeOpacity="0.75" strokeWidth="2.2" />
          <path d="M156 54 h8 M160 50 v8" stroke="hsl(var(--destructive))" strokeOpacity="0.65" strokeWidth="1.5" />
        </g>
        {/* 磨砂玻璃：先登记 */}
        <g>
          <rect x="244" y="20" width="58" height="70" rx="4" fill="var(--frog-bluegray)" opacity="0.4" />
          <rect x="244" y="20" width="58" height="70" rx="4" fill="none" stroke="var(--frog-ink)" strokeOpacity="0.25" strokeWidth="1.5" />
          <text x="273" y="48" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-ink)" opacity="0.55">
            先
          </text>
          <text x="273" y="66" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-ink)" opacity="0.55">
            登记
          </text>
        </g>
      </svg>
    );
  }
  /* ---------- 批次 CY-137：其余八线三档全部升为专属定格——按结局 id 手绘，零件可复用 ---------- */
  return bureauFor(endingId);
}

/** 十线专属定格共用的三分画框：底、两道分格线，画芯交给各结局 */
function BureauFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 320 110" className="h-28 w-full" role="img" aria-label={`定格：${label}`}>
      <rect x="8" y="6" width="304" height="98" rx="10" fill="hsl(var(--muted))" opacity="0.35" />
      <line x1="112" y1="12" x2="112" y2="98" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.12" />
      <line x1="208" y1="12" x2="208" y2="98" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.12" />
      {children}
    </svg>
  );
}

function bureauFor(endingId: string): ReactElement | null {
  switch (endingId) {
    /* ---------- 食堂 ---------- */
    case "cn-e1":
      /* 合理损耗：锅底那圈水垢、日期栏空着的报修单、比学号还早的科目 */
      return (
        <BureauFrame label="食堂·合理损耗：锅底水垢的圈、日期栏空着的报修单、账上比学号还早的科目">
          <MOTIFS.ladle cx={60} cy={58} />
          <g>
            <rect x="128" y="26" width="96" height="58" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="136" y="40" fontSize="7" fill="var(--frog-ink)" opacity="0.5">报修单</text>
            <path d="M136 50 h72" stroke="var(--frog-ink)" strokeWidth="1.3" opacity="0.28" />
            <rect x="136" y="58" width="30" height="13" rx="2" fill="none" stroke="var(--frog-ink)" strokeOpacity="0.4" strokeDasharray="3 3" />
            <text x="142" y="68" fontSize="7" fill="var(--frog-ink)" opacity="0.45">日期</text>
            <path d="M172 66 h44" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.2" />
          </g>
          <MOTIFS.book cx={260} cy={56} />
        </BureauFrame>
      );
    case "cn-e2":
      /* 十一次：「已老实」的计数、没动过的那摞饭 */
      return (
        <BureauFrame label="食堂·十一次：已老实的计数画在灶边、没动过的那摞饭、收餐台的账">
          <MOTIFS.tray cx={60} cy={56} />
          <g>
            <rect x="128" y="30" width="96" height="50" rx="4" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="138" y="44" fontSize="8" fontWeight="800" fill="var(--frog-ink)" opacity="0.75">已老实 × 11</text>
            <path d="M138 56 h14 M138 63 h14 M145 54 v12" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.4" />
            <path d="M158 56 h14 M158 63 h14 M165 54 v12" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.4" />
            <path d="M178 54 v12" stroke="hsl(var(--primary))" strokeWidth="2.2" opacity="0.7" />
          </g>
          <MOTIFS.paper cx={260} cy={55} />
        </BureauFrame>
      );
    case "cn-e3":
      /* 正面朝外：勺位有名字了、报修单写成「习惯」 */
      return (
        <BureauFrame label="食堂·正面朝外：打勺的位置有了名字、事由栏那两个字写歪了没人改">
          <g>
            <rect x="30" y="34" width="60" height="42" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <path d="M38 62 q10 -18 20 0" stroke="var(--frog-khaki-deep)" strokeWidth="4" fill="none" strokeLinecap="round" />
            <rect x="34" y="80" width="52" height="12" rx="2" fill="var(--frog-badge)" opacity="0.85" />
            <text x="60" y="89" textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--frog-ink)" opacity="0.75">
              打勺 · 有人
            </text>
          </g>
          <g>
            <rect x="128" y="26" width="96" height="58" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="136" y="40" fontSize="7" fill="var(--frog-ink)" opacity="0.5">事由栏</text>
            <text x="150" y="66" fontSize="11" fontWeight="800" fill="hsl(var(--destructive))" opacity="0.75">习惯</text>
            <circle cx="166" cy="61" r="10" fill="none" stroke="hsl(var(--destructive))" strokeOpacity="0.5" strokeWidth="1.6" />
          </g>
          <MOTIFS.lamp cx={260} cy={55} />
        </BureauFrame>
      );
    /* ---------- 社团 ---------- */
    case "cb-e1":
      /* 四舍五入：年报的柱子、附录里三项齐全的那条 */
      return (
        <BureauFrame label="社团·四舍五入：满意度年报的柱子、附录里编号日期结果三项齐全的那条、已回访的章">
          <MOTIFS.bars cx={60} cy={55} />
          <g>
            <rect x="128" y="24" width="100" height="62" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="136" y="38" fontSize="7" fill="var(--frog-ink)" opacity="0.5">附录</text>
            <path d="M136 48 h80 M136 58 h72 M136 68 h64" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.24" />
            <circle cx="212" cy="72" r="8" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.7" strokeWidth="1.8" />
            <path d="M208 72 h8 M212 68 v8" stroke="hsl(var(--primary))" strokeOpacity="0.6" strokeWidth="1.4" />
          </g>
          <MOTIFS.stamp cx={260} cy={55} />
        </BureauFrame>
      );
    case "cb-e2":
      /* 七分钟：只发图不配字的那条、打字框里删掉的那行 */
      return (
        <BureauFrame label="社团·七分钟：只发图不配字的那条、打字框里删掉的那行、零点四十的发送时间">
          <MOTIFS.phone cx={60} cy={55} />
          <g>
            <rect x="128" y="34" width="96" height="30" rx="6" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <line x1="140" y1="49" x2="206" y2="49" stroke="var(--frog-ink)" strokeOpacity="0.5" strokeWidth="1.4" />
            <text x="136" y="76" fontSize="7" fill="var(--frog-ink)" opacity="0.45">打字框 · 已清空</text>
            <circle cx="228" cy="49" r="7" fill="hsl(var(--primary))" opacity="0.7" />
          </g>
          <MOTIFS.clock cx={260} cy={55} />
        </BureauFrame>
      );
    case "cb-e3":
      /* 先发我看：值班表第一格、被还回去的三百字、换新的灯管 */
      return (
        <BureauFrame label="社团·先发我看：值班表永远的第一格、被当面还回去的三百字、上任第一周换的灯管">
          <MOTIFS.grid cx={60} cy={55} />
          <g>
            <rect x="128" y="24" width="96" height="62" rx="6" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <path d="M140 38 h60 M140 48 h52 M140 58 h66" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.22" />
            <path d="M206 34 h8 v40 h-8 z" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.6" strokeWidth="1.6" strokeDasharray="4 3" />
            <text x="176" y="80" fontSize="7" fill="var(--frog-ink)" opacity="0.45">撤回 · 当面还了</text>
          </g>
          <MOTIFS.lamp cx={260} cy={55} />
        </BureauFrame>
      );
    /* ---------- 宿舍 ---------- */
    case "ss-e1":
      /* 二十三点零五：六十行的签到表、23:05、绿应急灯 */
      return (
        <BureauFrame label="宿舍·二十三点零五：六十行行行等同一个词的签到表、23:05 的电子屏、绿应急灯">
          <g>
            <rect x="30" y="20" width="60" height="70" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <path key={`r-${i}`} d={`M38 ${28 + i * 9} h44`} stroke="var(--frog-ink)" strokeWidth="1" opacity="0.22" />
            ))}
            <text x="60" y="86" fontSize="7" fill="var(--frog-ink)" opacity="0.45" textAnchor="middle">六十行</text>
          </g>
          <g>
            <rect x="132" y="36" width="88" height="38" rx="8" fill="var(--frog-ink)" opacity="0.85" />
            <text x="176" y="60" textAnchor="middle" fontSize="15" fontWeight="800" fill="hsl(var(--card))" opacity="0.9">
              23:05
            </text>
          </g>
          <MOTIFS.lampGreen cx={260} cy={55} />
        </BureauFrame>
      );
    case "ss-e2":
      /* 合格：五张贴纸睡在抽屉最里面 */
      return (
        <BureauFrame label="宿舍·合格：五张贴纸睡在抽屉最里面、最底下那张没人知道是谁的">
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={`s-${i}`} transform={`rotate(${-14 + i * 7} ${40 + i * 9} ${52 + i * 3})`}>
              <rect x={32 + i * 9} y={30 + i * 3} width="40" height="26" rx="2" fill="var(--frog-badge)" opacity={i === 4 ? 0.95 : 0.8} stroke="var(--frog-ink)" strokeOpacity="0.3" />
              <text x={52 + i * 9} y={46 + i * 3} fontSize="7" fontWeight="700" fill="var(--frog-ink)" opacity="0.7" textAnchor="middle">
                合格
              </text>
            </g>
          ))}
          <MOTIFS.drawer cx={160} cy={55} />
          <MOTIFS.lampGreen cx={260} cy={55} />
        </BureauFrame>
      );
    case "ss-e3":
      /* 替你填的人：「正常」那一钩、六楼没人查 */
      return (
        <BureauFrame label="宿舍·替你填的人：「正常」收尾那一钩分毫不差、六楼的门牌没人查">
          <g>
            <rect x="30" y="30" width="60" height="50" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="60" y="58" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--frog-ink)" opacity="0.75">正常</text>
            <path d="M62 62 q8 6 14 2" stroke="hsl(var(--primary))" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.8" />
          </g>
          <g>
            <rect x="138" y="34" width="76" height="42" rx="4" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.4" />
            <text x="176" y="60" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--frog-ink)" opacity="0.7">6F</text>
          </g>
          <MOTIFS.lampGreen cx={260} cy={55} />
        </BureauFrame>
      );
    /* ---------- 草坪 ---------- */
    case "fl-e1":
      /* 恢复时长：1500 分钟进年报、记成自律 */
      return (
        <BureauFrame label="草坪·恢复时长：手环上的 1500 分钟进了年报、评的是自律、他的下午归了他自己的账">
          <MOTIFS.wristband cx={60} cy={55} />
          <MOTIFS.bars cx={160} cy={55} />
          <MOTIFS.grass cx={260} cy={58} />
        </BureauFrame>
      );
    case "fl-e2":
      /* 先看表：那格空白改了名、到点就起误差两分钟 */
      return (
        <BureauFrame label="草坪·先看表：那格空白改名叫结构化发呆、到点就起误差不超过两分钟">
          <MOTIFS.grid cx={60} cy={55} />
          <g>
            <rect x="128" y="30" width="96" height="50" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="176" y="50" fontSize="9" fontWeight="800" fill="var(--frog-ink)" opacity="0.75" textAnchor="middle">
              结构化发呆
            </text>
            <path d="M140 60 h72" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.2" />
          </g>
          <MOTIFS.grass cx={260} cy={58} />
        </BureauFrame>
      );
    case "fl-e3":
      /* 四十分钟：记录上六个字、草坪中央那块最暗的没有了 */
      return (
        <BureauFrame label="草坪·四十分钟：记录上只有思想状态良好六个字、草坪正中央那块最暗的草没有了">
          <MOTIFS.paper cx={60} cy={55} />
          <MOTIFS.clock cx={160} cy={55} />
          <g>
            <MOTIFS.grass cx={260} cy={58} />
            <ellipse cx="260" cy="56" rx="16" ry="8" fill="hsl(var(--card))" opacity="0.55" />
          </g>
        </BureauFrame>
      );
    /* ---------- 湖边 ---------- */
    case "lk-e1":
      /* 新横幅：八点挂好、锅底的水垢没人刷 */
      return (
        <BureauFrame label="湖边·新横幅：八点挂好的横幅、锅底那圈没人刷的水垢、湖面月色照旧">
          <MOTIFS.banner cx={60} cy={50} />
          <MOTIFS.moonLake cx={160} cy={55} />
          <g>
            <path d="M228 60 q32 -26 64 0" fill="none" stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="2" />
            <ellipse cx="260" cy="60" rx="26" ry="6" fill="hsl(var(--card))" opacity="0.6" />
            <ellipse cx="260" cy="60" rx="18" ry="3.4" fill="none" stroke="var(--frog-ink)" strokeOpacity="0.3" strokeDasharray="3 3" />
          </g>
        </BureauFrame>
      );
    case "lk-e2":
      /* 记不全：说了一半咽了一半、最先忘的是玉米烫手的那部分 */
      return (
        <BureauFrame label="湖边·记不全：说了一半咽了一半的那句、最先忘掉的是玉米烫手的那部分">
          <MOTIFS.moonLake cx={60} cy={55} />
          <g>
            <rect x="128" y="28" width="96" height="54" rx="8" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <path d="M138 42 h60 M138 52 h48" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.3" />
            <path d="M138 62 h26" stroke="hsl(var(--primary))" strokeWidth="1.6" opacity="0.55" />
            <text x="138" y="78" fontSize="7" fill="var(--frog-ink)" opacity="0.45">发了一半 · 剩的咽了</text>
          </g>
          <MOTIFS.corn cx={260} cy={58} />
        </BureauFrame>
      );
    case "lk-e3":
      /* 带上简历：字条改了词、十点清场、湖不说话 */
      return (
        <BureauFrame label="湖边·带上简历：字条上那句被划掉改成带上简历、十点清场、湖不说话">
          <g>
            <rect x="30" y="28" width="60" height="54" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="60" y="50" fontSize="7" fill="var(--frog-ink)" opacity="0.5" textAnchor="middle">带上你自己</text>
            <path d="M40 50 h40" stroke="hsl(var(--destructive))" strokeWidth="1.6" opacity="0.7" />
            <text x="60" y="70" fontSize="7" fontWeight="800" fill="var(--frog-ink)" opacity="0.75" textAnchor="middle">带上简历</text>
          </g>
          <MOTIFS.flashlight cx={160} cy={55} />
          <MOTIFS.moonLake cx={260} cy={55} />
        </BureauFrame>
      );
    /* ---------- 图书馆 ---------- */
    case "rk-e1":
      /* 首次外借：四年首次进年度报告、报表没有「读完」这一栏 */
      return (
        <BureauFrame label="图书馆·首次外借：四年来的首次外借进了年度报告、封面是暖的、报表没有读完这一栏">
          <MOTIFS.book cx={60} cy={55} />
          <MOTIFS.slip cx={160} cy={55} />
          <g>
            <line x1="234" y1="78" x2="288" y2="78" stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="2" />
            <rect x="240" y="58" width="9" height="20" rx="1" fill="var(--frog-ink)" opacity="0.3" />
            <rect x="254" y="48" width="9" height="30" rx="1" fill="var(--frog-ink)" opacity="0.3" />
            <rect x="268" y="36" width="9" height="42" rx="1" fill="hsl(var(--primary))" opacity="0.75" />
            <rect x="282" y="58" width="9" height="20" rx="1" fill="none" stroke="var(--frog-ink)" strokeOpacity="0.35" strokeDasharray="3 3" />
          </g>
        </BureauFrame>
      );
    case "rk-e2":
      /* 备用时段：每一格都有用途、只有「回家」没占上一格 */
      return (
        <BureauFrame label="图书馆·备用时段：表上每格都有用途、哭有备注栏、只有回家没占上一格">
          <g>
            {[0, 1, 2].map((r) =>
              [0, 1, 2, 3].map((c) => (
                <rect
                  key={`${r}-${c}`}
                  x={32 + c * 15}
                  y={30 + r * 15}
                  width="13"
                  height="13"
                  rx="2"
                  fill={r === 2 && c === 3 ? "none" : "hsl(var(--card))"}
                  stroke="var(--frog-ink)"
                  strokeOpacity={r === 2 && c === 3 ? 0.45 : 0.3}
                  strokeDasharray={r === 2 && c === 3 ? "3 3" : undefined}
                />
              )),
            )}
            <text x="60" y="84" fontSize="7" fill="var(--frog-ink)" opacity="0.5" textAnchor="middle">回家 · 没排上</text>
          </g>
          <MOTIFS.paper cx={160} cy={55} />
          <MOTIFS.clock cx={260} cy={55} />
        </BureauFrame>
      );
    case "rk-e3":
      /* 脚印：相册名半分钟定好、规划表压回箱底 */
      return (
        <BureauFrame label="图书馆·脚印：相册名半分钟就定好、规划表压平后塞回箱子最底下">
          <MOTIFS.photo cx={60} cy={55} />
          <MOTIFS.box cx={160} cy={55} />
          <MOTIFS.grid cx={260} cy={55} />
        </BureauFrame>
      );
    /* ---------- 自习楼 ---------- */
    case "zz-e1":
      /* 第二张便利贴：贴上了储物柜、「明年做」三个字补在后面 */
      return (
        <BureauFrame label="自习楼·第二张便利贴：那句话贴上了储物柜、后面补着明年做三个字、铅笔印描深了一遍">
          <MOTIFS.countdown cx={60} cy={55} />
          <g transform={`rotate(5 160 55)`}>
            <rect x="132" y="30" width="56" height="50" rx="2" fill="var(--frog-badge)" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="160" y="50" fontSize="9" fontWeight="800" fill="var(--frog-ink)" opacity="0.8" textAnchor="middle">明年做</text>
            <path d="M142 60 h36 M142 68 h28" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.25" />
          </g>
          <MOTIFS.pen cx={260} cy={58} />
        </BureauFrame>
      );
    case "zz-e2":
      /* 失物招领：抽屉里七张便利贴，写着别的名字 */
      return (
        <BureauFrame label="自习楼·失物招领：抽屉里还有七张写着别的名字的便利贴、桌角那行铅笔字还没被看见">
          <g>
            <MOTIFS.drawer cx={60} cy={55} />
            {[0, 1, 2].map((i) => (
              <rect key={`n-${i}`} x={40 + i * 14} y={44 + i * 4} width="12" height="9" rx="1" fill="var(--frog-badge)" opacity="0.8" />
            ))}
          </g>
          <g transform={`rotate(-4 160 52)`}>
            <rect x="132" y="28" width="56" height="46" rx="2" fill="var(--frog-badge)" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="160" y="46" fontSize="8" fontWeight="700" fill="var(--frog-ink)" opacity="0.7" textAnchor="middle">别的名字</text>
            <path d="M142 56 h36" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.25" />
          </g>
          <MOTIFS.lamp cx={260} cy={55} />
        </BureauFrame>
      );
    case "zz-e3":
      /* 23:30-23:40：排期表新增的一栏、第七分钟拿起了手机 */
      return (
        <BureauFrame label="自习楼·23:30-23:40：排期表新增的那一栏备注发呆、第七分钟拿起了手机、那栏没删">
          <g>
            <rect x="30" y="28" width="60" height="54" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <path d="M38 42 h44 M38 52 h44 M38 62 h44" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.24" />
            <text x="60" y="76" fontSize="6.5" fontWeight="800" fill="hsl(var(--primary))" opacity="0.85" textAnchor="middle">23:30–23:40 发呆</text>
          </g>
          <MOTIFS.phone cx={160} cy={55} />
          <MOTIFS.clock cx={260} cy={55} />
        </BureauFrame>
      );
    /* ---------- 教学楼 ---------- */
    case "fc-e1":
      /* 状况良好：页脚的批注、逐条记的分 */
      return (
        <BureauFrame label="教学楼·状况良好：规划表页脚批着态度真实心理状况良好、你没配合的那些年逐条记了分">
          <MOTIFS.book cx={60} cy={55} />
          <MOTIFS.paper cx={160} cy={55} />
          <g>
            <rect x="228" y="34" width="64" height="42" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="260" y="52" fontSize="7" fontWeight="700" fill="hsl(var(--primary))" opacity="0.85" textAnchor="middle">状况良好</text>
            <path d="M236 60 h48" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.2" />
          </g>
        </BureauFrame>
      );
    case "fc-e2":
      /* 第四十一场：模板两份轮着用、第 41 场的记录 */
      return (
        <BureauFrame label="教学楼·第四十一场：心得模板存了两份轮着用、第 41 场的记录、你连教蛙省事都教得很熟练">
          <MOTIFS.stack cx={60} cy={55} />
          <MOTIFS.stamp cx={160} cy={55} />
          <g>
            <rect x="228" y="34" width="64" height="42" rx="8" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="260" y="52" fontSize="10" fontWeight="800" fill="var(--frog-ink)" opacity="0.75" textAnchor="middle">41</text>
            <path d="M238 60 h44" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.2" />
          </g>
        </BureauFrame>
      );
    case "fc-e3":
      /* 细则第三条：四年请勿拆封、新增的一条是你提的 */
      return (
        <BureauFrame label="教学楼·细则第三条：表箱贴着四年请勿拆封、细则新增的那一条是你提的">
          <MOTIFS.box cx={60} cy={55} />
          <g>
            <rect x="128" y="28" width="96" height="54" rx="3" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <text x="136" y="42" fontSize="7" fill="var(--frog-ink)" opacity="0.5">细则 · 第三条</text>
            <text x="150" y="62" fontSize="8.5" fontWeight="800" fill="hsl(var(--primary))" opacity="0.85">讲座一场 0.2 分</text>
            <path d="M136 70 h80" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.2" />
          </g>
          <MOTIFS.stack cx={260} cy={55} />
        </BureauFrame>
      );
    default:
      return null;
  }
}

/* ---------- 意象三连：按 settlement.art 从零件库取件拼装 ---------- */

function MotifArt({ art, label }: { art: [string, string, string]; label: string }) {
  const xs = [60, 160, 260];
  return (
    <svg viewBox="0 0 320 110" className="h-28 w-full" role="img" aria-label={`定格：${label}`}>
      <rect x="8" y="6" width="304" height="98" rx="10" fill="hsl(var(--muted))" opacity="0.35" />
      <line x1="112" y1="12" x2="112" y2="98" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.12" />
      <line x1="208" y1="12" x2="208" y2="98" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.12" />
      {art.map((key, i) => {
        const Motif = MOTIFS[key];
        if (!Motif) return null;
        return <Motif key={`${key}-${i}`} cx={xs[i]} cy={55} />;
      })}
    </svg>
  );
}

function SettlementArt({ ending }: { ending: Pick<Ending, "id" | "title" | "settlement"> }) {
  const bureau = BureauArt({ endingId: ending.id });
  if (bureau) return bureau;
  const art = ending.settlement?.art;
  if (!art) return null;
  return <MotifArt art={art} label={`${ending.title}的结算意象`} />;
}

interface EndingSettlementPlateProps {
  /** 只需结算相关字段：结局卡传整个 Ending，图鉴档案页按详情拼一份同形的 */
  ending: Pick<Ending, "id" | "title" | "minSilence" | "maxSilence" | "settlement">;
  /** 全程累计沉默值（结局卡口径），写进「认定依据」；图鉴里没有对局，缺省只记区间 */
  totalSilence?: number;
  /** 静止章（批次 CY-140）：整册打包誊纸时用——印章一挂就是盖好的，不走落章动画 */
  staticStamp?: boolean;
}

export function EndingSettlementPlate({ ending, totalSilence, staticStamp }: EndingSettlementPlateProps) {
  const settlement = ending.settlement;
  /* 存这张处置单（批次 CY-138）：把结算画面整块誊成一张图——档位、认定依据、定格、判词、印章都在纸上 */
  const plateRef = useRef<HTMLDivElement | null>(null);
  const [exportState, setExportState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const exportPlate = async () => {
    const node = plateRef.current;
    if (!node || exportState === "busy" || !settlement) return;
    setExportState("busy");
    const holder = document.createElement("div");
    holder.className = "w-[620px] max-w-[86vw] rounded-3xl border border-border bg-card p-8";
    holder.setAttribute("style", "position:fixed;left:-10000px;top:0;z-index:-1;");
    const head = document.createElement("p");
    head.className = "mb-4 text-xs font-bold text-primary";
    head.textContent = "结局档案 · 结算画面";
    holder.appendChild(head);
    const clone = node.cloneNode(true) as HTMLElement;
    /* 印章的入场动画在克隆体里会从头播——誊纸上它必须是盖好的那枚 */
    clone.querySelectorAll(".anim-stamp").forEach((el) => el.classList.remove("anim-stamp"));
    holder.appendChild(clone);
    document.body.appendChild(holder);
    const ok = await capturePng(holder, `奶蛙大学·结算《${ending.title}》.png`);
    holder.remove();
    setExportState(ok ? "done" : "failed");
    window.setTimeout(() => setExportState("idle"), ok ? 2000 : 2500);
  };
  if (!settlement) return null;
  const band =
    ending.maxSilence !== undefined
      ? `沉默值 ${ending.minSilence ?? 0}–${ending.maxSilence}`
      : `沉默值 ${ending.minSilence ?? 0} 及以上`;
  return (
    <div ref={plateRef} className="mt-4 overflow-hidden rounded-2xl border border-border bg-background/60 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-border px-4 py-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
          {settlement.tierName} · 结算画面
        </span>
        <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
          认定依据：{band}
          {totalSilence !== undefined ? ` · 你 ${totalSilence}` : ""}
        </span>
        <button
          type="button"
          data-export-ui="1"
          onClick={exportPlate}
          disabled={exportState === "busy"}
          title="把这张结算处置单誊成一张图存下来"
          className={clsx(
            "ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
            exportState === "done"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <ImageDown size={11} aria-hidden />
          {exportState === "busy"
            ? "正在誊…"
            : exportState === "done"
              ? "存好了"
              : exportState === "failed"
                ? "没存上"
                : "存图"}
        </button>
      </div>
      <SettlementArt ending={ending} />
      <div className="relative border-t border-dashed border-border px-4 py-3">
        <span
          aria-hidden
          className={clsx(
            "absolute right-3 top-2 inline-block -rotate-6 rounded border-2 border-destructive/70 px-2 py-0.5 text-sm font-black tracking-[0.3em] text-destructive/80",
            !staticStamp && "anim-stamp",
          )}
          style={staticStamp ? undefined : { animationDelay: "1200ms" }}
        >
          {settlement.stamp}
        </span>
        <p className="pr-24 text-xs leading-relaxed text-muted-foreground">{settlement.caption}</p>
      </div>
    </div>
  );
}
