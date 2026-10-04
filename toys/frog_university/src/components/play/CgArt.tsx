/**
 * CG 定格画面（批次 B2 + D1 + D2 + D3 + D4 + D5 + 表现层切片二）：三十三张全屏定格的分层绘制（天空/远景/中景/道具/光效）。
 * 全部 SVG 自绘、零外链；颜色只引用主题 CSS 变量（--frog-* / --map-* 为完整 hsl 值，
 * token 三元组一律经 hsl(var(--token)) 引用），三套主题自动换装。
 * 剪影态（图鉴未解锁）由 dim 档降饱和处理，画面本身不写死暗色。
 */
import type { ReactElement } from "react";
import { clsx } from "clsx";

interface CgArtProps {
  id: string;
  /** 图鉴未解锁的剪影态：整幅去饱和压暗，只留轮廓 */
  dim?: boolean;
  className?: string;
}

/** 按注册表渲染对应画面；id 未注册时给一个中性定格（不崩） */
export function CgArt({ id, dim = false, className }: CgArtProps) {
  const Scene = CG_ART[id] ?? CgFallback;
  return (
    <div
      aria-hidden
      className={clsx("relative h-full w-full overflow-hidden", dim && "saturate-0 opacity-40", className)}
    >
      <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <Scene />
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-foreground/25 to-transparent" />
    </div>
  );
}

/* ---------- 1. cg-plan-sheet 课桌上的规划表 ---------- */

function CgPlanSheet() {
  return (
    <g>
      {/* 远景：虚化的黑板与窗光 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="40" y="0" width="360" height="210" rx="18" fill="var(--frog-ink)" opacity="0.5" />
      <rect x="620" y="0" width="180" height="230" rx="14" fill="var(--map-water)" opacity="0.4" />
      <path d="M600 0 L800 190 L800 0 Z" fill="var(--frog-belly)" opacity="0.5" />
      <path d="M640 0 L790 160 L790 0 Z" fill="hsl(var(--primary))" opacity="0.1" />
      {/* 中景：课桌面 */}
      <path d="M0 230 L800 218 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 262 L800 250 L800 266 L0 278 Z" fill="var(--frog-ink)" opacity="0.1" />
      <path d="M0 372 L800 356 L800 374 L0 390 Z" fill="var(--frog-ink)" opacity="0.08" />
      {/* 道具：规划表 */}
      <g transform="rotate(-3 400 330)">
        <rect x="210" y="228" width="400" height="204" rx="6" fill="var(--frog-belly)" />
        <rect x="210" y="228" width="400" height="204" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="2.5" opacity="0.35" />
        <text x="410" y="264" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--frog-ink)">
          大学四年规划表
        </text>
        <path d="M262 282 h296 M262 282 v150 M558 282 v150" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.4" fill="none" />
        {[
          [306, "大一 · 绩点"],
          [342, "大二 · 竞赛"],
          [378, "大三 · 实习"],
          [414, "大四 · 上岸"],
        ].map(([y, label]) => (
          <g key={y}>
            <text x="276" y={Number(y) + 16} fontSize="13" fill="var(--frog-ink)" opacity="0.62">
              {label}
            </text>
            <rect x="392" y={Number(y) - 4} width="150" height="24" rx="3" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.4" />
          </g>
        ))}
        <text x="392" y="446" fontSize="12" fill="var(--frog-ink)" opacity="0.5">
          最下面一行小字：本表将随个人档案保存四年
        </text>
        {/* 目标栏的留白 */}
        <rect x="546" y="292" width="112" height="34" rx="3" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" opacity="0.7" strokeDasharray="7 5" />
      </g>
      {/* 道具：笔与别家填满的表一角 */}
      <g transform="rotate(14 604 392)">
        <rect x="580" y="386" width="150" height="12" rx="5" fill="var(--frog-zzaizai)" />
        <path d="M730 386 l20 6 l-20 6 Z" fill="var(--frog-ink)" />
      </g>
      <rect x="30" y="352" width="132" height="86" rx="5" fill="var(--frog-belly)" opacity="0.94" transform="rotate(6 96 395)" />
      <path d="M42 372 h104 M42 388 h104 M42 404 h104 M42 420 h72" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.45" transform="rotate(6 96 395)" />
      <path d="M46 372 q26 18 52 0 q26 18 52 0" stroke="hsl(var(--primary))" strokeWidth="2.4" fill="none" opacity="0.75" transform="rotate(6 96 395)" />
      {/* 光效：顶灯与桌面反光 */}
      <ellipse cx="400" cy="212" rx="230" ry="30" fill="var(--frog-badge)" opacity="0.16" />
      <path d="M232 300 q60 22 130 12" stroke="var(--frog-eye)" strokeWidth="10" fill="none" opacity="0.14" strokeLinecap="round" />
    </g>
  );
}

/* ---------- 2. cg-library-window 凌晨图书馆窗 ---------- */

function CgLibraryWindow() {
  return (
    <g>
      {/* 天空：凌晨外景 */}
      <defs>
        <linearGradient id="cg-sky-3am" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      <rect x="118" y="36" width="564" height="238" rx="8" fill="url(#cg-sky-3am)" />
      {[
        [190, 88, 2.2], [280, 60, 1.6], [372, 100, 2], [470, 66, 1.5], [560, 92, 2.4],
        [640, 74, 1.7], [300, 140, 1.4], [520, 150, 1.8],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="var(--frog-eye)" opacity="0.85" />
      ))}
      {/* 远景：一扇不肯灭的灯 */}
      <rect x="570" y="150" width="96" height="124" rx="5" fill="var(--frog-ink)" opacity="0.9" />
      <rect x="596" y="172" width="15" height="20" rx="2" fill="var(--frog-badge)" />
      <rect x="596" y="206" width="15" height="20" rx="2" fill="var(--frog-ink)" opacity="0.6" />
      <rect x="628" y="172" width="15" height="20" rx="2" fill="var(--frog-ink)" opacity="0.6" />
      {/* 中景：窗框与拉到底的窗帘 */}
      <rect x="118" y="36" width="564" height="238" rx="8" fill="none" stroke="hsl(var(--primary))" strokeWidth="8" opacity="0.55" />
      <path d="M400 36 v238 M118 155 h564" stroke="hsl(var(--primary))" strokeWidth="6" opacity="0.5" />
      <path d="M118 36 q70 250 132 238 q-14 -238 -36 -238 Z" fill="var(--frog-zzaizai)" opacity="0.88" />
      <path d="M682 36 q-70 250 -132 238 q14 -238 36 -238 Z" fill="var(--frog-zzaizai)" opacity="0.88" />
      <path d="M232 36 q10 118 8 238 M656 36 q-10 118 -8 238" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.3" fill="none" />
      {/* 道具：书堆 / 台灯 / 计划表 / 杯子 */}
      <rect x="0" y="274" width="800" height="176" fill="var(--map-wood)" />
      <path d="M0 322 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.18" />
      <g>
        <rect x="150" y="204" width="112" height="22" rx="4" fill="var(--frog-berry)" />
        <rect x="156" y="182" width="100" height="22" rx="4" fill="var(--frog-khaki)" />
        <rect x="162" y="160" width="88" height="22" rx="4" fill="var(--frog-matcha)" />
        <rect x="168" y="138" width="76" height="22" rx="4" fill="var(--frog-bluegray)" />
        <path d="M172 149 h60 M166 171 h66 M160 193 h72" stroke="var(--frog-eye)" strokeWidth="3" opacity="0.8" />
      </g>
      <g>
        <path d="M330 148 h56 l-8 96 h-40 Z" fill="var(--frog-eye)" opacity="0.9" />
        <ellipse cx="358" cy="148" rx="28" ry="10" fill="hsl(var(--primary))" opacity="0.85" />
        <ellipse cx="358" cy="238" rx="26" ry="7" fill="hsl(var(--primary))" opacity="0.7" />
        <ellipse cx="358" cy="176" rx="86" ry="58" fill="var(--frog-badge)" opacity="0.28" />
      </g>
      <g transform="rotate(-4 500 232)">
        <rect x="420" y="188" width="150" height="86" rx="5" fill="var(--frog-belly)" />
        <path d="M434 206 h122 M434 224 h122 M434 242 h122 M434 260 h86" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.4" />
        <rect x="434" y="198" width="26" height="9" rx="2" fill="hsl(var(--primary))" opacity="0.7" />
        <text x="530" y="254" textAnchor="end" fontSize="11" fill="var(--frog-ink)" opacity="0.55">
          哭（15min，备用）
        </text>
      </g>
      <g>
        <ellipse cx="660" cy="238" rx="30" ry="16" fill="var(--frog-eye)" />
        <path d="M676 226 q30 -34 12 -52" stroke="var(--frog-eye)" strokeWidth="6" fill="none" opacity="0.4" />
        <ellipse cx="656" cy="232" rx="6" ry="4" fill="var(--frog-mouth)" opacity="0.5" />
      </g>
      {/* 光效：整屋长明灯 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-badge)" opacity="0.05" />
      <ellipse cx="400" cy="24" rx="180" ry="14" fill="var(--frog-badge)" opacity="0.3" />
    </g>
  );
}

/* ---------- 2b. cg-thirty-one-grids 卷王的一天（图书馆线第二幕） ---------- */

function CgThirtyOneGrids() {
  /* 三十一格（CY-129）：她打印给你的那张表——三十一格从睁眼排到熄灯，
     周五那格写「聚餐（不建议，损耗 2h）」；表头不是姓名，是学号。
     旁边是她自己的小旗：连续在馆 47h，边角用胶带补过。 */
  return (
    <g>
      {/* 背景：凌晨的阅览区，最里面那盏灯 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      <rect x="0" y="0" width="800" height="300" fill="var(--frog-ink)" opacity="0.28" />
      {/* 凌晨的窗：外面是黑的 */}
      <rect x="560" y="34" width="204" height="196" rx="6" fill="var(--frog-ink)" opacity="0.6" />
      <rect x="560" y="34" width="204" height="196" rx="6" fill="none" stroke="hsl(var(--primary))" strokeWidth="6" opacity="0.4" />
      <path d="M662 34 v196 M560 132 h204" stroke="hsl(var(--primary))" strokeWidth="4" opacity="0.35" />
      {/* 桌面 */}
      <path d="M0 300 L800 288 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 300 L800 288 L800 302 L0 314 Z" fill="hsl(var(--background))" opacity="0.35" />
      {/* 那张打印的表：三十一格 */}
      <g transform="rotate(-2 372 372)">
        <rect x="240" y="320" width="264" height="118" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.98" />
        {/* 表头：不是姓名，是学号 */}
        <text x="252" y="338" fontSize="9.5" fontWeight="700" fill="var(--frog-ink)" opacity="0.8">
          学号 036
        </text>
        <path d="M240 344 h264" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.3" />
        {/* 网格：五列三行，最后一格是周五晚上 */}
        {[0, 1, 2, 3, 4].map((col) => (
          <g key={`col-${col}`}>
            {[0, 1, 2].map((row) => {
              const gx = 248 + col * 51;
              const gy = 350 + row * 24;
              const isFriday = col === 4 && row === 1;
              return (
                <g key={`cell-${col}-${row}`}>
                  <rect
                    x={gx}
                    y={gy}
                    width="44"
                    height="18"
                    rx="2"
                    fill={isFriday ? "var(--frog-bow)" : "hsl(var(--muted))"}
                    opacity={isFriday ? 0.28 : 0.5}
                  />
                  <rect x={gx} y={gy} width="44" height="18" rx="2" fill="none" stroke="var(--frog-ink)" strokeWidth="0.8" opacity="0.25" />
                </g>
              );
            })}
          </g>
        ))}
        {/* 周五那格：聚餐（不建议，损耗 2h） */}
        <text x="592" y="404" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="var(--frog-bow-deep)" opacity="0.9">
          损耗 2h
        </text>
        {/* 底下一行小字：本表仅供参考 */}
        <text x="372" y="432" textAnchor="middle" fontSize="7.5" fill="var(--frog-bluegray-deep)" opacity="0.7">
          本表仅供参考，请结合个人实际调整
        </text>
      </g>
      {/* 抹抹的手臂：刚把表递过去，笔还悬在下一张上 */}
      <path d="M548 268 Q520 300 500 336" stroke="var(--frog-matcha-deep)" strokeWidth="13" fill="none" strokeLinecap="round" opacity="0.9" />
      {/* 她的小旗：连续在馆 47h，边角用胶带补过 */}
      <g transform="rotate(-6 660 250)">
        <path d="M646 236 L646 300" stroke="var(--frog-ink)" strokeWidth="2.6" strokeLinecap="round" opacity="0.6" />
        <path d="M646 236 L712 244 L646 268 Z" fill="var(--frog-matcha)" opacity="0.92" />
        <path d="M646 236 L712 244 L646 268 Z" fill="none" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.35" />
        <text x="668" y="256" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--frog-ink)" opacity="0.8">
          连续在馆
        </text>
        <text x="668" y="266" textAnchor="middle" fontSize="9" fontWeight="800" fill="var(--frog-ink)" opacity="0.85">
          47h
        </text>
        {/* 胶带补过的角 */}
        <path d="M700 242 l12 8 -8 4 z" fill="var(--frog-belly)" opacity="0.9" />
      </g>
      {/* 凌晨的光：只照亮桌面一小圈 */}
      <ellipse cx="400" cy="372" rx="250" ry="60" fill="var(--frog-badge)" opacity="0.07" />
    </g>
  );
}

/* ---------- 3. cg-canteen-spoon 食堂窗口的勺 ---------- */

function CgCanteenSpoon() {
  return (
    <g>
      {/* 中景：窗口瓷砖墙与打菜台 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      <rect x="0" y="0" width="800" height="264" fill="hsl(var(--secondary))" />
      {[
        [0, 0], [96, 0], [192, 0], [288, 0], [384, 0], [480, 0], [576, 0], [672, 0], [768, 0],
      ].map(([x], i) => (
        <g key={i}>
          <rect x={x + 6} y="8" width="84" height="60" rx="8" fill="var(--frog-eye)" opacity="0.32" />
          <rect x={x + 6} y="76" width="84" height="60" rx="8" fill="var(--frog-eye)" opacity="0.26" />
          <rect x={x + 6} y="144" width="84" height="60" rx="8" fill="var(--frog-eye)" opacity="0.32" />
          <rect x={x + 6} y="212" width="84" height="52" rx="8" fill="var(--frog-eye)" opacity="0.26" />
        </g>
      ))}
      {/* 远景：菜单牌（措辞刚换过） */}
      <g transform="rotate(-1.5 520 88)">
        <rect x="392" y="42" width="260" height="96" rx="8" fill="var(--frog-ink)" opacity="0.9" />
        <text x="522" y="82" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--frog-belly)">
          今日供应 · 元气煲
        </text>
        <text x="522" y="112" textAnchor="middle" fontSize="13" fill="var(--frog-belly)" opacity="0.6">
          （上周它还叫「奋斗煲」）
        </text>
      </g>
      {/* 窗口与不锈钢台面 */}
      <rect x="0" y="264" width="800" height="26" fill="hsl(var(--primary))" opacity="0.28" />
      <rect x="0" y="290" width="800" height="160" fill="var(--frog-bluegray)" opacity="0.55" />
      <rect x="0" y="290" width="800" height="14" rx="6" fill="var(--frog-eye)" opacity="0.6" />
      {/* 道具：菜盆与手勺 */}
      <g>
        <ellipse cx="272" cy="346" rx="112" ry="40" fill="var(--frog-bluegray)" />
        <ellipse cx="272" cy="336" rx="112" ry="36" fill="hsl(var(--background))" opacity="0.72" />
        <ellipse cx="272" cy="338" rx="94" ry="27" fill="var(--frog-khaki)" />
        <ellipse cx="272" cy="342" rx="94" ry="24" fill="var(--frog-matcha-deep)" opacity="0.55" />
      </g>
      <g transform="rotate(-24 470 300)">
        <rect x="452" y="296" width="24" height="150" rx="10" fill="var(--map-wood)" />
        <ellipse cx="464" cy="452" rx="42" ry="26" fill="var(--frog-khaki-deep)" />
        <ellipse cx="464" cy="444" rx="30" ry="16" fill="var(--frog-khaki)" />
        <path d="M440 440 q24 12 48 0" stroke="var(--frog-ink)" strokeWidth="2.5" fill="none" opacity="0.4" />
      </g>
      <path d="M470 452 q-26 -50 -8 -96" stroke="var(--frog-eye)" strokeWidth="5" fill="none" opacity="0.3" />
      {/* 道具：窗口玻璃上的公示 */}
      <g transform="rotate(1.5 130 368)">
        <rect x="36" y="330" width="196" height="72" rx="6" fill="var(--frog-belly)" opacity="0.94" />
        <text x="134" y="360" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--frog-ink)">
          量以公示为准
        </text>
        <text x="134" y="386" textAnchor="middle" fontSize="11.5" fill="var(--frog-ink)" opacity="0.6">
          加了算打错
        </text>
      </g>
      {/* 光效：汤面蒸汽 */}
      <path d="M212 306 q-14 -34 8 -56 q22 -20 10 -46 M300 300 q16 -30 -6 -52 q-20 -18 -8 -42 M386 312 q10 -26 -8 -44" stroke="var(--frog-eye)" strokeWidth="9" fill="none" opacity="0.3" strokeLinecap="round" />
      <ellipse cx="272" cy="392" rx="150" ry="18" fill="var(--frog-ink)" opacity="0.1" />
    </g>
  );
}

/* ---------- 4. cg-club-stage 招新舞台 ---------- */

function CgClubStage() {
  return (
    <g>
      {/* 远景：活动室顶棚与灯 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      <rect x="0" y="0" width="800" height="96" fill="hsl(var(--secondary))" />
      {[110, 320, 530, 730].map((x, i) => (
        <g key={i}>
          <path d={`M${x} 0 v24`} stroke="var(--frog-ink)" strokeWidth="3" opacity="0.4" />
          <ellipse cx={x} cy="34" rx="34" ry="10" fill="var(--frog-badge)" />
          <ellipse cx={x} cy="52" rx="120" ry="40" fill="var(--frog-badge)" opacity="0.14" />
        </g>
      ))}
      {/* 道具：全校同款横幅 */}
      <g>
        <path d="M60 78 L740 62" stroke="hsl(var(--primary))" strokeWidth="4" opacity="0.7" />
        <rect x="128" y="66" width="544" height="66" rx="10" fill="hsl(var(--primary))" />
        <text x="400" y="110" textAnchor="middle" fontSize="27" fontWeight="700" fill="hsl(var(--primary-foreground))">
          加入我们，做最真实的自己！
        </text>
        <text x="400" y="146" textAnchor="middle" fontSize="11.5" fill="hsl(var(--primary))" opacity="0.85">
          社团联合会统一印发 · 第 07 版
        </text>
      </g>
      {/* 中景：招新桌与立牌 */}
      <rect x="0" y="336" width="800" height="114" fill="var(--map-wood)" opacity="0.5" />
      <g>
        <rect x="64" y="286" width="200" height="18" rx="7" fill="var(--map-wood)" />
        <rect x="80" y="304" width="14" height="70" fill="var(--map-wood)" opacity="0.85" />
        <rect x="234" y="304" width="14" height="70" fill="var(--map-wood)" opacity="0.85" />
        <rect x="70" y="258" width="188" height="30" rx="8" fill="var(--frog-berry)" />
        <text x="164" y="280" textAnchor="middle" fontSize="16" fontWeight="700" fill="hsl(var(--background))">
          抽象文化研究社
        </text>
      </g>
      <g>
        <rect x="560" y="286" width="200" height="18" rx="7" fill="var(--map-wood)" />
        <rect x="576" y="304" width="14" height="70" fill="var(--map-wood)" opacity="0.85" />
        <rect x="730" y="304" width="14" height="70" fill="var(--map-wood)" opacity="0.85" />
        <rect x="566" y="258" width="188" height="30" rx="8" fill="var(--frog-matcha)" />
        <text x="660" y="280" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--frog-ink)">
          表演快乐研究部
        </text>
      </g>
      {/* 道具：小愿景小白板（23/30） */}
      <g transform="rotate(2 400 268)">
        <rect x="312" y="196" width="176" height="120" rx="9" fill="var(--frog-eye)" stroke="var(--map-wood)" strokeWidth="7" />
        <text x="400" y="240" textAnchor="middle" fontSize="17" fill="var(--frog-ink)">
          今日新进
        </text>
        <text x="400" y="288" textAnchor="middle" fontSize="34" fontWeight="700" fill="hsl(var(--primary))">
          23/30
        </text>
        <path d="M352 306 q48 14 96 0" stroke="hsl(var(--primary))" strokeWidth="3" fill="none" opacity="0.5" />
      </g>
      {/* 光效：彩旗与鼓点光斑 */}
      {[
        "M0 96 L34 128 L68 96 Z", "M68 96 L102 130 L136 96 Z", "M640 92 L676 124 L712 92 Z",
        "M712 92 L748 126 L784 92 Z", "M136 96 L170 126 L204 96 Z",
      ].map((d, i) => (
        <path key={i} d={d} fill={i % 2 ? "var(--frog-berry)" : "var(--frog-matcha)"} opacity="0.75" />
      ))}
      <path d="M0 96 Q400 128 800 92" stroke="hsl(var(--primary))" strokeWidth="3" fill="none" opacity="0.4" />
      <ellipse cx="400" cy="322" rx="250" ry="26" fill="hsl(var(--primary))" opacity="0.07" />
    </g>
  );
}

/* ---------- 5. cg-field-dusk 操场黄昏 ---------- */

function CgFieldDusk() {
  return (
    <g>
      {/* 天空：黄昏渐变 */}
      <defs>
        <linearGradient id="cg-sky-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bow)" />
          <stop offset="0.55" stopColor="var(--frog-blush)" />
          <stop offset="1" stopColor="var(--frog-belly)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-sky-dusk)" />
      {/* 远景：落日与云 */}
      <circle cx="596" cy="140" r="56" fill="hsl(var(--background))" opacity="0.65" />
      <circle cx="596" cy="140" r="42" fill="hsl(var(--background))" />
      <ellipse cx="180" cy="106" rx="70" ry="16" fill="var(--frog-eye)" opacity="0.7" />
      <ellipse cx="700" cy="88" rx="56" ry="13" fill="var(--frog-eye)" opacity="0.6" />
      <path d="M120 150 q10 -8 20 0 M286 96 q9 -8 18 0" stroke="var(--frog-ink)" strokeWidth="2.4" fill="none" opacity="0.4" />
      {/* 远景：教学楼与球门剪影 */}
      <rect x="40" y="176" width="128" height="92" rx="6" fill="var(--frog-ink)" opacity="0.35" />
      <rect x="66" y="196" width="16" height="22" rx="2" fill="var(--frog-badge)" opacity="0.8" />
      <rect x="640" y="216" width="112" height="52" rx="5" fill="var(--frog-ink)" opacity="0.28" />
      <path d="M320 236 h96 v24 h-96 Z" fill="none" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.35" />
      <path d="M312 236 v52 M424 236 v52" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.35" />
      {/* 中景：跑道 */}
      <rect x="0" y="268" width="800" height="92" fill="var(--map-road)" />
      <path d="M0 300 h800 M0 330 h800" stroke="hsl(var(--background))" strokeWidth="3" strokeDasharray="28 22" opacity="0.8" />
      {/* 道具：草坪上压了一下午的那块草 + 躺影 */}
      <rect x="0" y="360" width="800" height="90" fill="var(--map-grass)" />
      <ellipse cx="400" cy="398" rx="118" ry="34" fill="var(--map-grass-deep)" />
      <g opacity="0.9">
        <ellipse cx="386" cy="398" rx="46" ry="18" fill="var(--frog-ink)" opacity="0.42" />
        <circle cx="336" cy="392" r="15" fill="var(--frog-ink)" opacity="0.42" />
        <circle cx="438" cy="394" r="13" fill="var(--frog-ink)" opacity="0.42" />
        <path d="M348 402 q-22 16 -30 30 M424 404 q24 14 34 28" stroke="var(--frog-ink)" strokeWidth="9" strokeLinecap="round" fill="none" opacity="0.42" />
      </g>
      <path d="M60 436 q6 -20 12 0 M140 444 q6 -20 12 0 M672 440 q6 -20 12 0 M736 448 q6 -20 12 0" stroke="var(--map-leaf)" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* 光效：路灯先亮一盏与长影 */}
      <path d="M96 268 v-96" stroke="var(--frog-ink)" strokeWidth="5" opacity="0.4" />
      <ellipse cx="96" cy="168" rx="13" ry="7" fill="var(--frog-badge)" opacity="0.85" />
      <ellipse cx="96" cy="196" rx="64" ry="34" fill="var(--frog-badge)" opacity="0.16" />
      <path d="M368 424 L288 450 M408 424 L466 450" stroke="var(--frog-ink)" strokeWidth="7" opacity="0.16" strokeLinecap="round" />
    </g>
  );
}

/* ---------- 6. cg-locker-notes 储物柜便利贴 ---------- */

function CgLockerNotes() {
  return (
    <g>
      {/* 远景：自习楼走廊 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="52" fill="var(--frog-ink)" opacity="0.12" />
      <rect x="0" y="388" width="800" height="62" fill="var(--map-wood)" opacity="0.45" />
      {/* 中景：一排储物柜 */}
      {[
        [40, "var(--frog-zzaizai)"], [212, "var(--frog-bluegray)"], [384, "var(--frog-zzaizai)"],
        [556, "var(--frog-bluegray)"], [728, "var(--frog-zzaizai)"],
      ].map(([x, tone], i) => (
        <g key={i}>
          <rect x={Number(x)} y="64" width="158" height="324" rx="10" fill={tone as string} opacity="0.9" />
          <rect x={Number(x) + 12} y="84" width="134" height="128" rx="6" fill="hsl(var(--background))" opacity="0.14" />
          <rect x={Number(x) + 12} y="228" width="134" height="128" rx="6" fill="hsl(var(--background))" opacity="0.14" />
          <rect x={Number(x) + 58} y="206" width="42" height="10" rx="5" fill="var(--frog-ink)" opacity="0.4" />
          <rect x={Number(x) + 58} y="350" width="42" height="10" rx="5" fill="var(--frog-ink)" opacity="0.4" />
        </g>
      ))}
      {/* 道具：便利贴（换了三茬，颜色深浅不同） */}
      {[
        [66, 118, "var(--frog-belly)", 0.95, -4], [126, 250, "var(--frog-badge)", 0.8, 3],
        [96, 322, "var(--frog-blush)", 0.55, -2], [240, 132, "var(--frog-belly)", 0.95, 2],
        [298, 262, "var(--frog-badge)", 0.7, -3], [414, 122, "var(--frog-belly)", 0.92, 3],
        [474, 254, "var(--frog-blush)", 0.62, -2], [590, 140, "var(--frog-belly)", 0.95, -3],
        [650, 268, "var(--frog-badge)", 0.78, 2], [740, 128, "var(--frog-belly)", 0.9, 2],
      ].map(([x, y, fill, opacity, rot], i) => (
        <g key={i} transform={`rotate(${rot} ${x} ${y})`}>
          <rect x={Number(x)} y={Number(y)} width="54" height="54" rx="4" fill={fill as string} opacity={opacity as number} />
          <path d={`M${Number(x) + 8} ${Number(y) + 38} q18 -14 38 -2`} stroke="var(--frog-ink)" strokeWidth="2.2" fill="none" opacity="0.4" />
        </g>
      ))}
      <text x="76" y="164" fontSize="10.5" fill="var(--frog-ink)" opacity="0.5" transform="rotate(-4 76 164)">
        占座
      </text>
      <text x="424" y="168" fontSize="10.5" fill="var(--frog-ink)" opacity="0.5" transform="rotate(3 424 168)">
        求拼桌
      </text>
      {/* 道具：半截书脊缠着透明胶 */}
      <g transform="rotate(3 312 428)">
        <rect x="252" y="404" width="130" height="44" rx="7" fill="var(--frog-bag)" />
        <rect x="268" y="404" width="26" height="44" fill="hsl(var(--background))" opacity="0.28" />
        <rect x="252" y="416" width="130" height="14" rx="3" fill="hsl(var(--background))" opacity="0.5" />
        <text x="292" y="428" fontSize="10.5" fill="hsl(var(--background))" opacity="0.85">
          考研政治 · 第 3 年
        </text>
      </g>
      {/* 光效：走廊尽头一盏灯 */}
      <path d="M760 52 v40" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.3" />
      <ellipse cx="760" cy="98" rx="120" ry="46" fill="var(--frog-badge)" opacity="0.2" />
      <path d="M92 64 q60 260 120 320" stroke="hsl(var(--background))" strokeWidth="26" fill="none" opacity="0.07" />
    </g>
  );
}

/* ---------- 7. cg-stamp-window 盖章窗口 ---------- */

function CgStampWindow() {
  return (
    <g>
      {/* 中景：学工办走廊与窗口 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      <rect x="0" y="0" width="800" height="320" fill="hsl(var(--secondary))" />
      {/* 远景：叫号屏黑着 */}
      <rect x="560" y="34" width="196" height="60" rx="8" fill="var(--frog-ink)" opacity="0.85" />
      <text x="658" y="72" textAnchor="middle" fontSize="15" fill="var(--frog-eye)" opacity="0.35">
        请取号（屏没亮）
      </text>
      {/* 窗口玻璃与 A4 告示 */}
      <g>
        <rect x="150" y="52" width="360" height="244" rx="10" fill="var(--map-water)" opacity="0.35" />
        <rect x="150" y="52" width="360" height="244" rx="10" fill="none" stroke="var(--frog-ink)" strokeWidth="7" opacity="0.6" />
        <path d="M330 52 v244" stroke="var(--frog-ink)" strokeWidth="5" opacity="0.45" />
        <g transform="rotate(-1.6 232 148)">
          <rect x="168" y="86" width="130" height="150" rx="4" fill="var(--frog-belly)" />
          <text x="233" y="116" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-ink)">
            办理时间
          </text>
          <text x="233" y="142" textAnchor="middle" fontSize="14" fontWeight="700" fill="hsl(var(--primary))">
            14:00-17:00
          </text>
          <path d="M182 158 h102 M182 176 h102 M182 194 h76" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.4" />
          <g transform="rotate(-14 282 214)">
            <circle cx="282" cy="214" r="16" fill="none" stroke="hsl(var(--destructive))" strokeWidth="3" opacity="0.75" />
            <text x="282" y="219" textAnchor="middle" fontSize="10" fill="hsl(var(--destructive))" opacity="0.8">
              章
            </text>
          </g>
        </g>
        <text x="233" y="256" textAnchor="middle" fontSize="10.5" fill="var(--frog-ink)" opacity="0.5">
          （纸的颜色比窗框旧）
        </text>
      </g>
      {/* 窗口里的工位 */}
      <rect x="0" y="320" width="800" height="26" fill="hsl(var(--primary))" opacity="0.24" />
      <rect x="0" y="346" width="800" height="104" fill="var(--frog-bluegray)" opacity="0.4" />
      <rect x="0" y="346" width="800" height="12" rx="6" fill="hsl(var(--background))" opacity="0.55" />
      {/* 道具：桌面材料与电话 */}
      <g>
        <rect x="420" y="378" width="150" height="58" rx="4" fill="var(--frog-belly)" />
        <path d="M434 394 h122 M434 408 h122 M434 422 h92" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.4" />
        <rect x="600" y="382" width="64" height="40" rx="8" fill="var(--frog-ink)" opacity="0.8" />
        <path d="M622 378 q14 -22 28 -2" stroke="var(--frog-ink)" strokeWidth="4" fill="none" opacity="0.5" />
      </g>
      {/* 道具：队伍靠眼神维持秩序（两只蛙的背影） */}
      <g opacity="0.9">
        <ellipse cx="84" cy="404" rx="34" ry="40" fill="var(--frog-matcha)" />
        <ellipse cx="84" cy="382" rx="25" ry="19" fill="var(--frog-matcha-deep)" />
        <ellipse cx="180" cy="414" rx="30" ry="36" fill="var(--frog-khaki)" />
        <ellipse cx="180" cy="392" rx="22" ry="17" fill="var(--frog-khaki-deep)" />
      </g>
      {/* 光效：日光灯与地砖反光 */}
      {[140, 400, 660].map((x, i) => (
        <rect key={i} x={x - 60} y="10" width="120" height="9" rx="4" fill="var(--frog-badge)" opacity="0.7" />
      ))}
      <path d="M60 434 h120 M420 436 h110 M640 434 h110" stroke="hsl(var(--background))" strokeWidth="4" opacity="0.25" />
    </g>
  );
}

/* ---------- 8. cg-lake-moon 湖面月色 ---------- */

function CgLakeMoon() {
  return (
    <g>
      {/* 天空：夜 */}
      <defs>
        <linearGradient id="cg-sky-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" />
        </linearGradient>
        <linearGradient id="cg-water-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bluegray)" />
          <stop offset="1" stopColor="var(--frog-ink)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-sky-lake)" />
      {[
        [76, 62, 2], [170, 108, 1.5], [262, 44, 1.9], [352, 96, 1.4], [452, 58, 2.2],
        [540, 118, 1.5], [660, 48, 2], [730, 108, 1.6], [310, 152, 1.3],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="var(--frog-eye)" opacity="0.85" />
      ))}
      {/* 远景：月亮与一盏灯 */}
      <circle cx="576" cy="104" r="62" fill="var(--frog-belly)" opacity="0.14" />
      <circle cx="576" cy="104" r="40" fill="var(--frog-belly)" />
      <circle cx="562" cy="94" r="7" fill="var(--frog-belly)" opacity="0.7" />
      <rect x="60" y="196" width="92" height="72" rx="5" fill="var(--frog-ink)" opacity="0.92" />
      <rect x="88" y="214" width="13" height="17" rx="2" fill="var(--frog-badge)" />
      <path d="M0 262 Q160 224 320 254 Q520 286 800 250 L800 272 L0 272 Z" fill="var(--map-leaf)" opacity="0.28" />
      {/* 湖面 */}
      <rect x="0" y="268" width="800" height="182" fill="url(#cg-water-lake)" />
      <ellipse cx="576" cy="308" rx="60" ry="13" fill="var(--frog-belly)" opacity="0.5" />
      <ellipse cx="576" cy="326" rx="38" ry="8" fill="var(--frog-belly)" opacity="0.66" />
      <ellipse cx="576" cy="344" rx="22" ry="5" fill="var(--frog-belly)" opacity="0.5" />
      <path d="M96 314 q30 8 60 0 M188 356 q30 8 60 0 M420 372 q30 8 60 0 M642 396 q30 8 60 0 M300 408 q26 7 52 0" stroke="var(--frog-eye)" strokeWidth="2.6" fill="none" opacity="0.35" />
      {/* 中景：五只蛙剪影围坐 */}
      <g>
        <ellipse cx="238" cy="266" rx="30" ry="20" fill="var(--frog-ink)" />
        <circle cx="216" cy="248" r="11" fill="var(--frog-ink)" />
        <ellipse cx="316" cy="270" rx="28" ry="19" fill="var(--frog-ink)" />
        <circle cx="336" cy="252" r="10" fill="var(--frog-ink)" />
        <ellipse cx="398" cy="274" rx="32" ry="21" fill="var(--frog-ink)" />
        <circle cx="398" cy="252" r="12" fill="var(--frog-ink)" />
        <ellipse cx="480" cy="270" rx="27" ry="18" fill="var(--frog-ink)" />
        <circle cx="460" cy="252" r="10" fill="var(--frog-ink)" />
        <ellipse cx="548" cy="266" rx="29" ry="19" fill="var(--frog-ink)" />
        <circle cx="568" cy="249" r="11" fill="var(--frog-ink)" />
        <path d="M238 268 h56 M316 272 h56 M398 276 h56 M480 272 h48" stroke="var(--frog-eye)" strokeWidth="1.6" opacity="0.2" fill="none" />
      </g>
      {/* 光效：夜风把月色吹皱 */}
      <path d="M150 286 q40 10 80 2 M640 292 q44 10 88 2 M210 330 q36 9 72 1 M540 352 q40 9 80 1" stroke="var(--frog-belly)" strokeWidth="2" fill="none" opacity="0.2" />
      <path d="M700 120 q34 -18 62 -4" stroke="var(--frog-eye)" strokeWidth="2.4" fill="none" opacity="0.3" />
      <path d="M52 140 q40 -22 74 -6" stroke="var(--frog-eye)" strokeWidth="2" fill="none" opacity="0.2" />
    </g>
  );
}

/* ---------- 9. cg-ceremony-hall 礼堂的灯 ---------- */

function CgCeremonyHall() {
  return (
    <g>
      {/* 远景：穹顶与横梁 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.94" />
      <path d="M0 0 h800 v64 q-400 44 -800 0 Z" fill="var(--frog-ink)" />
      <path d="M120 30 q280 40 560 0" stroke="var(--frog-bluegray)" strokeWidth="3" fill="none" opacity="0.4" />
      {/* 横幅：「青春风采」 */}
      <g transform="rotate(-0.8 400 96)">
        <rect x="216" y="62" width="368" height="62" rx="9" fill="var(--frog-berry)" />
        <text x="400" y="104" textAnchor="middle" fontSize="27" fontWeight="700" fill="hsl(var(--background))">
          青春风采
        </text>
        <path d="M216 124 l-22 40 M584 124 l22 40" stroke="var(--frog-berry)" strokeWidth="4" opacity="0.7" />
      </g>
      {/* 中景：主席台与聚光灯 */}
      <rect x="252" y="196" width="296" height="24" rx="6" fill="var(--map-wood)" opacity="0.9" />
      <rect x="268" y="220" width="264" height="10" rx="4" fill="var(--frog-badge)" opacity="0.5" />
      {[
        [300, "var(--frog-matcha)"], [360, "var(--frog-berry)"], [424, "var(--frog-khaki)"],
        [488, "var(--frog-bluegray)"],
      ].map(([x, tone], i) => (
        <g key={i}>
          <ellipse cx={Number(x)} cy="184" rx="19" ry="13" fill={tone as string} />
          <ellipse cx={Number(x)} cy="204" rx="24" ry="16" fill={tone as string} opacity="0.9" />
          <path d={`M${Number(x) - 10} 210 q10 12 20 0`} stroke="var(--frog-ink)" strokeWidth="2" fill="none" opacity="0.4" />
        </g>
      ))}
      {/* 道具：话筒与讲台 */}
      <path d="M520 208 q10 -26 26 -30" stroke="var(--frog-eye)" strokeWidth="4" fill="none" opacity="0.7" />
      <circle cx="548" cy="174" r="6" fill="var(--frog-eye)" opacity="0.75" />
      <rect x="588" y="150" width="56" height="70" rx="6" fill="var(--map-wood)" opacity="0.85" />
      {/* 光效：两束追光 */}
      <path d="M120 96 L214 260 L286 260 Z" fill="var(--frog-badge)" opacity="0.14" />
      <path d="M680 96 L560 260 L488 260 Z" fill="var(--frog-badge)" opacity="0.14" />
      {/* 观众席：成排的背影与举起的手 */}
      <rect x="0" y="330" width="800" height="120" fill="var(--frog-ink)" opacity="0.55" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => {
        const x = 42 + i * 74;
        const lift = i === 3 || i === 5 || i === 8;
        return (
          <g key={i}>
            <ellipse cx={x} cy="368" rx="26" ry="17" fill="var(--frog-bluegray)" opacity="0.8" />
            <circle cx={x} cy="350" r="12" fill="var(--frog-bluegray)" opacity="0.9" />
            {lift && <path d={`M${x + 14} 344 l18 -26`} stroke="var(--frog-bluegray)" strokeWidth="7" strokeLinecap="round" opacity="0.85" />}
          </g>
        );
      })}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
        const x = 16 + i * 70;
        return (
          <g key={i}>
            <ellipse cx={x} cy="418" rx="30" ry="20" fill="var(--frog-bluegray)" opacity="0.55" />
            <circle cx={x} cy="396" r="13" fill="var(--frog-bluegray)" opacity="0.6" />
          </g>
        );
      })}
      {/* 光效：掌声最响的三秒（相机闪光） */}
      {[[196, 336], [470, 328], [636, 344]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="7" fill="var(--frog-eye)" opacity="0.9" />
          <circle cx={x} cy={y} r="18" fill="var(--frog-eye)" opacity="0.25" />
          <circle cx={x} cy={y} r="32" fill="var(--frog-eye)" opacity="0.1" />
        </g>
      ))}
      <ellipse cx="400" cy="288" rx="330" ry="34" fill="var(--frog-badge)" opacity="0.1" />
    </g>
  );
}

/* ---------- 10. cg-countdown-board 教室后墙的倒计时牌 ---------- */

function CgCountdownBoard() {
  return (
    <g>
      {/* 远景：教室后墙与侧边公告 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      <rect x="0" y="0" width="800" height="330" fill="hsl(var(--secondary))" />
      <rect x="40" y="52" width="152" height="100" rx="6" fill="var(--frog-belly)" opacity="0.92" />
      <path d="M56 76 h120 M56 94 h120 M56 112 h88" stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.3" />
      <g transform="rotate(2 684 118)">
        <rect x="620" y="62" width="128" height="112" rx="6" fill="var(--frog-berry)" opacity="0.85" />
        <text x="684" y="102" textAnchor="middle" fontSize="13" fill="hsl(var(--background))" opacity="0.85">
          综合测评
        </text>
        <text x="684" y="124" textAnchor="middle" fontSize="11" fill="hsl(var(--background))" opacity="0.7">
          实施细则（试行）
        </text>
      </g>
      <rect x="0" y="392" width="800" height="58" fill="var(--map-wood)" opacity="0.5" />
      {/* 中景：倒计时牌 */}
      <g transform="rotate(-1.2 400 210)">
        <rect x="188" y="76" width="424" height="244" rx="10" fill="var(--frog-bag)" />
        <rect x="188" y="76" width="424" height="244" rx="10" fill="none" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.28" />
        <text x="400" y="112" textAnchor="middle" fontSize="19" fontWeight="700" fill="var(--frog-ink)">
          距考研
        </text>
        {/* 一格一格贴上去的日历格（最上面那格今早撕掉了） */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
          const x = 224 + i * 30;
          if (i !== 0) {
            return <rect key={i} x={x} y="130" width="26" height="22" rx="3" fill="var(--frog-belly)" opacity="0.85" />;
          }
          return (
            <g key={i}>
              <path d="M224 130 h26 v20 q-13 7 -26 1 Z" fill="var(--frog-belly)" opacity="0.22" />
              <path d="M224 149 q13 9 26 3" stroke="var(--frog-ink)" strokeWidth="1.8" strokeDasharray="3.5 3" fill="none" opacity="0.55" />
              <path d="M229 133 q10 10 18 7 l-5 9 q-9 2 -14 -7 Z" fill="var(--frog-belly)" opacity="0.92" />
              <circle cx="232" cy="137" r="2.2" fill="hsl(var(--primary))" opacity="0.55" />
            </g>
          );
        })}
        {/* 大数字：打印的，一格一格贴上去 */}
        <text x="392" y="230" textAnchor="middle" fontSize="84" fontWeight="700" fill="hsl(var(--primary))" letterSpacing="6">
          1298
        </text>
        <text x="572" y="228" fontSize="22" fill="var(--frog-ink)" opacity="0.75">
          天
        </text>
        <text x="400" y="298" textAnchor="middle" fontSize="11.5" fill="var(--frog-ink)" opacity="0.55">
          最下面一行小字：由学习委员每日更新
        </text>
      </g>
      {/* 道具：撕下来的那格落在地上 */}
      <g transform="rotate(9 486 360)">
        <rect x="462" y="350" width="48" height="20" rx="3" fill="var(--frog-belly)" opacity="0.85" />
        <path d="M470 360 h32" stroke="hsl(var(--primary))" strokeWidth="2" opacity="0.5" />
      </g>
      {/* 光效：教室日光灯 */}
      {[150, 400, 650].map((x, i) => (
        <rect key={i} x={x - 56} y="18" width="112" height="8" rx="4" fill="var(--frog-badge)" opacity="0.6" />
      ))}
      <ellipse cx="400" cy="336" rx="300" ry="34" fill="var(--frog-badge)" opacity="0.08" />
    </g>
  );
}

/* ---------- 11. cg-seat-cups 占座水杯阵 ---------- */

function CgSeatCups() {
  const cups: Array<[number, string, number]> = [
    [92, "var(--frog-matcha)", -2],
    [190, "var(--frog-berry)", 1.5],
    [288, "var(--frog-khaki)", -1.5],
    [386, "var(--frog-bluegray)", 2],
    [484, "var(--frog-matcha-deep)", -1],
    [582, "var(--frog-zzaizai)", 1],
  ];
  return (
    <g>
      {/* 远景：书架与闭馆前的长桌区 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      {[64, 200, 336, 472, 608, 744].map((x, i) => (
        <g key={i}>
          <rect x={x - 7} y="30" width="14" height="196" fill="var(--map-wood)" opacity="0.72" />
          <path d={`M${x - 7} 78 h86 M${x - 7} 124 h86 M${x - 7} 170 h86`} stroke="var(--map-wood)" strokeWidth="6" opacity="0.55" />
        </g>
      ))}
      {/* 中景：长桌 */}
      <path d="M0 268 L800 250 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 300 L800 282 L800 296 L0 314 Z" fill="var(--frog-ink)" opacity="0.1" />
      {/* 道具：保温杯阵（每只底下压着便利贴） */}
      {cups.map(([x, tone, rot], i) => (
        <g key={i} transform={`rotate(${rot} ${x} 250)`}>
          <g transform={`rotate(-3 ${x} 344)`}>
            <rect x={x - 34} y="318" width="68" height="52" rx="3" fill="var(--frog-badge)" opacity="0.92" />
            <path d={`M${x - 24} 338 h44 M${x - 24} 350 h44 M${x - 24} 362 h30`} stroke="var(--frog-ink)" strokeWidth="2" opacity="0.4" />
          </g>
          <path d={`M${x - 30} 334 h60`} stroke="var(--frog-ink)" strokeWidth="2.2" opacity="0.28" />
          <path d={`M${x + 22} 252 q24 4 21 27 q-2 17 -21 19`} stroke="var(--frog-ink)" strokeWidth="5" fill="none" opacity="0.45" />
          <rect x={x - 24} y="228" width="48" height="98" rx="9" fill={tone} />
          <rect x={x - 24} y="228" width="48" height="98" rx="9" fill="none" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.24" />
          <rect x={x - 28} y="214" width="56" height="17" rx="7" fill="var(--frog-ink)" opacity="0.82" />
        </g>
      ))}
      {/* 最边上那只（抹抹的）：水是昨晚接的，凉透了，连一圈水汽都没剩下 */}
      <g transform="rotate(-2 694 252)">
        <g transform="rotate(-5 694 346)">
          <rect x="658" y="322" width="72" height="50" rx="3" fill="var(--frog-blush)" opacity="0.9" />
          <path d="M668 340 q24 -14 50 -2" stroke="var(--frog-ink)" strokeWidth="2.6" fill="none" opacity="0.55" />
        </g>
        <rect x="668" y="228" width="52" height="98" rx="9" fill="var(--frog-bluegray)" opacity="0.92" />
        <rect x="668" y="228" width="52" height="98" rx="9" fill="none" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.3" />
        <rect x="663" y="214" width="62" height="17" rx="7" fill="var(--frog-ink)" opacity="0.85" />
      </g>
      {/* 光效：顶灯与杯影 */}
      {[140, 400, 660].map((x, i) => (
        <rect key={i} x={x - 52} y="10" width="104" height="8" rx="4" fill="var(--frog-badge)" opacity="0.55" />
      ))}
      {cups.map(([x], i) => (
        <ellipse key={`s${i}`} cx={Number(x)} cy="336" rx="34" ry="7" fill="var(--frog-ink)" opacity="0.14" />
      ))}
      <ellipse cx="694" cy="340" rx="36" ry="8" fill="var(--frog-ink)" opacity="0.16" />
    </g>
  );
}

/* ---------- 12. cg-closing-countdown 图书馆闭馆倒计时 ---------- */

function CgClosingCountdown() {
  return (
    <g>
      {/* 远景：地下二层，没有窗 */}
      <defs>
        <linearGradient id="cg-hall-b2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-hall-b2)" />
      {/* 远景：两排书架夹出走廊 */}
      {[0, 1].map((side) => {
        const baseX = side === 0 ? 36 : 560;
        return (
          <g key={side}>
            <rect x={baseX} y="52" width="204" height="272" rx="6" fill="var(--frog-ink)" opacity="0.82" />
            {[0, 1, 2, 3, 4].map((row) => (
              <g key={row}>
                <rect x={baseX + 12} y={72 + row * 52} width="180" height="8" rx="3" fill="var(--frog-bluegray)" opacity="0.5" />
                {[0, 1, 2, 3, 4, 5].map((book) => (
                  <rect
                    key={book}
                    x={baseX + 16 + book * 29}
                    y={52 + row * 52}
                    width="22"
                    height="24"
                    rx="2"
                    fill={[side === 0 ? "var(--frog-matcha)" : "var(--frog-berry)", "var(--frog-khaki)", side === 0 ? "var(--frog-berry)" : "var(--frog-matcha)", "var(--frog-bluegray)", "var(--frog-khaki-deep)", "var(--frog-zzaizai)"][book]}
                    opacity="0.75"
                  />
                ))}
              </g>
            ))}
          </g>
        );
      })}
      {/* 中景：走廊尽头的电子屏 */}
      <g>
        <rect x="288" y="142" width="224" height="94" rx="10" fill="var(--frog-ink)" />
        <rect x="288" y="142" width="224" height="94" rx="10" fill="none" stroke="var(--frog-ink)" strokeWidth="7" />
        <text x="400" y="174" textAnchor="middle" fontSize="14" fill="var(--frog-eye)" opacity="0.75">
          距离闭馆还有
        </text>
        <text x="400" y="216" textAnchor="middle" fontSize="36" fontWeight="700" fill="var(--frog-berry)" letterSpacing="2">
          01:58:00
        </text>
        <ellipse cx="400" cy="196" rx="152" ry="42" fill="var(--frog-berry)" opacity="0.14" />
      </g>
      {/* 地面：反着红光的地砖 */}
      <rect x="0" y="324" width="800" height="126" fill="var(--frog-ink)" opacity="0.6" />
      <path d="M320 336 h160 M306 354 h188 M292 374 h216 M336 396 h128" stroke="var(--frog-berry)" strokeWidth="3" fill="none" opacity="0.12" />
      <path d="M0 324 h800" stroke="var(--frog-bluegray)" strokeWidth="3" opacity="0.35" />
      {/* 道具：没抬头的蛙（背影） */}
      <g>
        <ellipse cx="648" cy="392" rx="34" ry="26" fill="var(--frog-khaki)" opacity="0.9" />
        <circle cx="648" cy="360" r="16" fill="var(--frog-khaki-deep)" />
        <ellipse cx="588" cy="398" rx="28" ry="22" fill="var(--frog-matcha)" opacity="0.85" />
        <circle cx="588" cy="368" r="14" fill="var(--frog-matcha-deep)" />
      </g>
      {/* 光效：顶灯一排 */}
      {[170, 400, 630].map((x, i) => (
        <ellipse key={i} cx={x} cy="26" rx="52" ry="10" fill="var(--frog-badge)" opacity="0.35" />
      ))}
      <path d="M400 30 v96" stroke="var(--frog-badge)" strokeWidth="60" opacity="0.05" strokeLinecap="round" />
    </g>
  );
}

/* ---------- 13. cg-canteen-closing 打烊的操作台 ---------- */

function CgCanteenClosing() {
  return (
    <g>
      {/* 背景：后厨深夜，砖缝与渐暗的墙 */}
      <defs>
        <linearGradient id="cg-kitchen-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-kitchen-night)" />
      <path d="M0 118 h800 M0 206 h800 M0 294 h800" stroke="var(--frog-bluegray-deep)" strokeWidth="2" opacity="0.3" fill="none" />
      {[64, 224, 384, 544, 704].map((x) => (
        <path
          key={x}
          d={`M${x} 0 V118 M${x + 80} 118 V206 M${x} 206 V294 M${x + 80} 294 V384`}
          stroke="var(--frog-bluegray-deep)"
          strokeWidth="2"
          opacity="0.2"
          fill="none"
        />
      ))}
      {/* 远景：排风罩剪影与暗下去的菜单屏 */}
      <path d="M84 0 L372 0 L344 96 L112 96 Z" fill="var(--frog-ink)" opacity="0.88" />
      <rect x="430" y="44" width="230" height="88" rx="8" fill="var(--frog-ink)" opacity="0.85" />
      <text x="545" y="84" textAnchor="middle" fontSize="17" fill="var(--frog-berry)" opacity="0.7">
        今日菜品 · 元气煲
      </text>
      <text x="545" y="112" textAnchor="middle" fontSize="13" fill="var(--frog-berry)" opacity="0.45">
        开饭时间 11:0
      </text>
      {/* 光效：自接线的一盏灯，锥形光落在台面 */}
      <path d="M300 96 v18" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.6" />
      <rect x="284" y="114" width="32" height="10" rx="3" fill="var(--frog-ink)" />
      <ellipse cx="300" cy="126" rx="14" ry="6" fill="var(--frog-badge)" />
      <path d="M300 132 L430 384 L170 384 Z" fill="hsl(var(--primary))" opacity="0.1" />
      <ellipse cx="300" cy="384" rx="140" ry="16" fill="var(--frog-badge)" opacity="0.16" />
      {/* 中景：操作台与洗碗池 */}
      <rect x="0" y="384" width="800" height="66" fill="var(--frog-bluegray-deep)" />
      <path d="M0 384 h800" stroke="var(--frog-cream)" strokeWidth="2.5" opacity="0.2" />
      <rect x="118" y="320" width="368" height="64" rx="8" fill="var(--frog-glass)" opacity="0.5" />
      <path d="M150 336 q44 28 88 0 Z" fill="var(--frog-ink)" opacity="0.5" />
      {/* 道具：大锅与余下的蒸汽 */}
      <ellipse cx="596" cy="330" rx="88" ry="26" fill="var(--frog-ink)" opacity="0.72" />
      <ellipse cx="596" cy="322" rx="72" ry="16" fill="var(--frog-matcha-deep)" opacity="0.5" />
      <path d="M510 318 q86 -24 172 0" stroke="var(--frog-cream)" strokeWidth="3" fill="none" opacity="0.18" />
      <path d="M560 296 q10 -22 -6 -40 M600 292 q14 -20 -2 -38" stroke="var(--frog-cream)" strokeWidth="3" fill="none" opacity="0.22" strokeLinecap="round" />
      {/* 道具：三层扣好盖的饭盒 */}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="228" y={346 - i * 32} width="152" height="30" rx="6" fill="var(--frog-cream)" />
          <rect x="228" y={346 - i * 32} width="152" height="30" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.35" />
          <rect x="236" y={340 - i * 32} width="136" height="6" rx="3" fill="var(--frog-belly)" opacity="0.7" />
        </g>
      ))}
      {/* 道具：配电箱与压在底下的报修单 */}
      <rect x="672" y="118" width="112" height="86" rx="6" fill="var(--frog-ink)" opacity="0.8" />
      <rect x="688" y="134" width="26" height="18" rx="3" fill="var(--frog-bluegray)" opacity="0.6" />
      <path d="M688 168 h80 M688 182 h58" stroke="var(--frog-cream)" strokeWidth="2" opacity="0.28" />
      <g transform="rotate(7 738 217)">
        <rect x="706" y="196" width="64" height="42" rx="3" fill="var(--frog-belly)" />
        <path d="M714 206 h48 M714 214 h48 M714 222 h34" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.4" fill="none" />
        <text x="738" y="216" textAnchor="middle" fontSize="10" fill="var(--frog-ink)" opacity="0.62">
          事由：维护
        </text>
      </g>
      {/* 光效：灶台余温与灯口的一点暖 */}
      <ellipse cx="596" cy="372" rx="120" ry="10" fill="var(--frog-badge)" opacity="0.1" />
      <ellipse cx="300" cy="128" rx="40" ry="14" fill="var(--frog-badge)" opacity="0.2" />
    </g>
  );
}

/* ---------- 14. cg-club-desk 招新桌的台账 ---------- */

function CgClubDesk() {
  return (
    <g>
      {/* 背景：收摊后的活动中心走廊 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="212" fill="var(--frog-bluegray)" opacity="0.45" />
      {/* 远景：卷边横幅与收好的笑脸袋 */}
      <path d="M40 40 q170 -18 340 -6 q180 10 340 -14" stroke="var(--frog-zzaizai)" strokeWidth="26" fill="none" opacity="0.5" />
      <path d="M64 78 q150 40 300 28 q170 -14 320 22" stroke="var(--frog-zzaizai)" strokeWidth="4" fill="none" opacity="0.35" />
      <text x="400" y="48" textAnchor="middle" fontSize="19" fill="var(--frog-ink)" opacity="0.45">
        做最真实的自己
      </text>
      {[560, 644, 716].map((x) => (
        <path
          key={x}
          d={`M${x} 176 q24 -28 48 0 q-12 40 -24 40 q-12 0 -24 -40 Z`}
          fill="var(--frog-cream)"
          opacity="0.55"
        />
      ))}
      <ellipse cx="120" cy="58" rx="70" ry="14" fill="var(--frog-badge)" opacity="0.22" />
      {/* 中景：桌面 */}
      <path d="M0 268 L800 250 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 306 L800 288" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.14" />
      {/* 道具：台账册子（翻开，带正字计数） */}
      <g transform="rotate(-4 250 340)">
        <rect x="148" y="284" width="204" height="112" rx="5" fill="var(--frog-belly)" />
        <path d="M250 284 v112" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.4" />
        <text x="250" y="304" textAnchor="middle" fontSize="11" fill="var(--frog-ink)" opacity="0.6">
          招新话术使用台账（内部）
        </text>
        <text x="196" y="328" fontSize="12" fill="var(--frog-ink)" opacity="0.68">
          骨骼清奇
        </text>
        <text x="296" y="328" fontSize="12" fill="var(--frog-ink)" opacity="0.68">
          效果佳
        </text>
        {/* 正字：六组多一笔 */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i} stroke="hsl(var(--primary))" strokeWidth="2.2" opacity="0.75" strokeLinecap="round" fill="none">
            <path d={`M${158 + i * 18} 336 h12 M${160 + i * 18} 342 h12 M${158 + i * 18} 348 h12 M${160 + i * 18} 354 h12 M${164 + i * 18} 336 v18`} />
          </g>
        ))}
        <path d="M266 336 v10" stroke="hsl(var(--primary))" strokeWidth="2.2" opacity="0.75" strokeLinecap="round" />
        <path d="M186 372 h128" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.25" />
      </g>
      {/* 道具：一沓报名表与别在纸箱上的便利贴 */}
      <g transform="rotate(3 470 356)">
        <rect x="396" y="300" width="150" height="104" rx="5" fill="var(--frog-cream)" />
        <rect x="400" y="292" width="150" height="104" rx="5" fill="var(--frog-belly)" />
        <path d="M414 314 h122 M414 332 h122 M414 350 h122 M414 368 h84" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.35" fill="none" />
        <rect x="414" y="304" width="52" height="9" rx="2" fill="hsl(var(--primary))" opacity="0.55" />
      </g>
      <g transform="rotate(-6 596 402)">
        <rect x="566" y="382" width="60" height="38" rx="3" fill="var(--frog-badge)" opacity="0.9" />
        <text x="596" y="398" textAnchor="middle" fontSize="10" fill="var(--frog-ink)" opacity="0.72">
          综测差 0.5
        </text>
        <text x="596" y="412" textAnchor="middle" fontSize="9" fill="var(--frog-ink)" opacity="0.6">
          差一点都不行
        </text>
      </g>
      {/* 道具：卷边海报与那枚章 */}
      <g transform="rotate(4 680 320)">
        <rect x="612" y="252" width="152" height="140" rx="6" fill="var(--frog-belly)" />
        <path d="M612 252 q22 -14 8 -18 M764 392 q-20 12 -6 18" stroke="var(--frog-ink)" strokeWidth="2.4" fill="none" opacity="0.4" />
        <path d="M624 272 q60 -10 128 0" stroke="var(--frog-ink)" strokeWidth="3" fill="none" opacity="0.3" />
        <path d="M626 292 h124 M626 308 h124 M626 324 h92" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.24" fill="none" />
        <circle cx="726" cy="356" r="24" fill="none" stroke="var(--frog-berry)" strokeWidth="3" opacity="0.8" />
        <text x="726" y="352" textAnchor="middle" fontSize="9" fill="var(--frog-berry)" opacity="0.9">
          联合会
        </text>
        <text x="726" y="364" textAnchor="middle" fontSize="8" fill="var(--frog-berry)" opacity="0.8">
          审核通过
        </text>
        <text x="726" y="374" textAnchor="middle" fontSize="7" fill="var(--frog-berry)" opacity="0.7">
          第 3 稿
        </text>
      </g>
      {/* 光效：头顶最后一盏冷灯，桌面一点暖 */}
      <ellipse cx="400" cy="30" rx="180" ry="14" fill="var(--frog-badge)" opacity="0.18" />
      <ellipse cx="300" cy="400" rx="180" ry="20" fill="hsl(var(--primary))" opacity="0.07" />
    </g>
  );
}

/* ---------- 15. cg-club-grid 官号的九宫格 ---------- */

function CgClubGrid() {
  const tiles: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ];
  return (
    <g>
      {/* 背景：熄灯的宿舍，窗外夜色 */}
      <defs>
        <linearGradient id="cg-grid-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray-deep)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-grid-night)" />
      <rect x="56" y="36" width="188" height="156" rx="10" fill="var(--frog-bluegray-deep)" opacity="0.7" />
      {[
        [118, 92, 9],
        [152, 70, 5],
        [96, 126, 4],
        [182, 118, 6],
      ].map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="var(--frog-eye)" opacity="0.45" />
      ))}
      <rect x="646" y="40" width="104" height="148" rx="8" fill="var(--frog-ink)" opacity="0.78" />
      {/* 远景：一床没叠的被 */}
      <path d="M0 392 q200 -34 400 -14 q220 20 400 4 L800 450 L0 450 Z" fill="var(--frog-bluegray)" opacity="0.55" />
      {/* 中景：手机与屏幕 */}
      <g transform="rotate(-3 400 238)">
        <rect x="266" y="60" width="268" height="334" rx="30" fill="var(--frog-ink)" />
        <rect x="278" y="72" width="244" height="310" rx="22" fill="var(--frog-cream)" opacity="0.94" />
        <text x="400" y="100" textAnchor="middle" fontSize="13" fill="var(--frog-ink)" opacity="0.7">
          抽象文化研究社（官号）
        </text>
        {/* 道具：九张图，一格一格 */}
        {tiles.map(([col, row]) => {
          const x = 296 + col * 74;
          const y = 112 + row * 72;
          return (
            <g key={`${col}-${row}`}>
              <rect x={x} y={y} width="66" height="66" rx="6" fill="var(--frog-belly)" opacity="0.9" />
              <rect x={x} y={y} width="66" height="66" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.25" />
            </g>
          );
        })}
        {/* 九张图的内容：横幅 / 笑脸 / 值班表 / 气球 / 烧烤架 / 走廊灯 / 大合照 / 报名表 / 剪影 */}
        <path d="M300 140 q28 -10 58 0" stroke="var(--frog-zzaizai)" strokeWidth="7" fill="none" opacity="0.8" />
        <circle cx="406" cy="138" r="13" fill="var(--frog-matcha)" opacity="0.85" />
        <circle cx="401" cy="134" r="1.8" fill="var(--frog-ink)" />
        <circle cx="411" cy="134" r="1.8" fill="var(--frog-ink)" />
        <path d="M400 142 q6 6 12 0" stroke="var(--frog-ink)" strokeWidth="1.6" fill="none" />
        <g stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.5" fill="none">
          <path d="M488 126 h44 M488 136 h44 M488 146 h30 M488 156 h44" />
        </g>
        <circle cx="324" cy="220" r="12" fill="var(--frog-berry)" opacity="0.7" />
        <path d="M324 232 q-4 12 2 18" stroke="var(--frog-ink)" strokeWidth="1.4" fill="none" opacity="0.6" />
        <g stroke="var(--frog-khaki-deep)" strokeWidth="2.6" opacity="0.85" strokeLinecap="round" fill="none">
          <path d="M382 200 v26 M396 196 v30 M410 200 v26" />
          <path d="M376 224 h40" />
        </g>
        <path d="M466 196 L500 244 L434 244 Z" fill="var(--frog-badge)" opacity="0.5" />
        <circle cx="466" cy="196" r="5" fill="var(--frog-badge)" />
        {[316, 332, 348, 364].map((cx) => (
          <circle key={cx} cx={cx} cy="290" r="7" fill="var(--frog-matcha)" opacity="0.8" />
        ))}
        <path d="M312 296 q40 -8 80 0" stroke="var(--frog-ink)" strokeWidth="2" fill="none" opacity="0.4" />
        <g stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.45" fill="none">
          <path d="M400 276 h52 M400 288 h52 M400 300 h34" />
          <rect x="396" y="272" width="60" height="34" rx="2" opacity="0.4" />
        </g>
        <path d="M484 322 q14 -20 28 0 q-8 22 -14 22 q-6 0 -14 -22 Z" fill="var(--frog-cream)" opacity="0.9" />
        {/* 配文框：空着 */}
        <rect x="296" y="338" width="208" height="28" rx="5" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.3" strokeDasharray="5 4" />
        <text x="400" y="356" textAnchor="middle" fontSize="10" fill="var(--frog-ink)" opacity="0.4">
          （配文一栏，一个字没有）
        </text>
        {/* 点赞行 */}
        <path d="M306 382 q-7 -8 0 -13 q6 -4 10 2 q4 -6 10 -2 q7 5 0 13 q-10 8 -10 8 q0 0 -10 -8 Z" fill="var(--frog-berry)" opacity="0.85" />
        <text x="330" y="388" fontSize="11" fill="var(--frog-ink)" opacity="0.62">
          134
        </text>
      </g>
      {/* 光效：屏幕的光落在被子上 */}
      <ellipse cx="400" cy="416" rx="170" ry="26" fill="hsl(var(--primary))" opacity="0.08" />
      <ellipse cx="400" cy="60" rx="150" ry="16" fill="hsl(var(--primary))" opacity="0.06" />
    </g>
  );
}

/** 未注册 id 的兜底：一张干净的幕布，不闪不崩 */
function CgFallback() {
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <ellipse cx="400" cy="230" rx="200" ry="80" fill="hsl(var(--primary))" opacity="0.12" />
    </g>
  );
}

/* ---------- 16. cg-lawn-lamps 坏灯之间 ---------- */

function CgLawnLamps() {
  return (
    <g>
      {/* 夜空：压暗的底 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.42" />
      {/* 远景：教学楼与零星亮着的窗 */}
      <rect x="40" y="150" width="150" height="118" rx="6" fill="var(--frog-ink)" opacity="0.5" />
      <rect x="64" y="170" width="16" height="22" rx="2" fill="hsl(var(--background))" opacity="0.5" />
      <rect x="96" y="170" width="16" height="22" rx="2" fill="hsl(var(--background))" opacity="0.18" />
      <rect x="128" y="204" width="16" height="22" rx="2" fill="hsl(var(--background))" opacity="0.4" />
      <rect x="620" y="170" width="140" height="98" rx="5" fill="var(--frog-ink)" opacity="0.46" />
      <rect x="648" y="192" width="14" height="20" rx="2" fill="hsl(var(--background))" opacity="0.45" />
      <rect x="680" y="192" width="14" height="20" rx="2" fill="hsl(var(--background))" opacity="0.16" />
      {/* 中景：夜里的跑道 */}
      <rect x="0" y="268" width="800" height="92" fill="var(--map-road)" />
      <rect x="0" y="268" width="800" height="92" fill="var(--frog-ink)" opacity="0.32" />
      <path d="M0 300 h800 M0 330 h800" stroke="hsl(var(--background))" strokeWidth="2.6" strokeDasharray="26 24" opacity="0.35" />
      {/* 跑道上戴耳机的影子 */}
      <g opacity="0.62">
        <circle cx="208" cy="296" r="10" fill="var(--frog-ink)" />
        <ellipse cx="208" cy="314" rx="15" ry="12" fill="var(--frog-ink)" />
        <path d="M198 292 q-10 -8 -14 2 M218 292 q10 -8 14 2" stroke="var(--frog-ink)" strokeWidth="2.6" fill="none" />
        <circle cx="612" cy="322" r="9" fill="var(--frog-ink)" />
        <ellipse cx="612" cy="338" rx="13" ry="11" fill="var(--frog-ink)" />
        <path d="M603 318 q-9 -7 -12 2 M621 318 q9 -7 12 2" stroke="var(--frog-ink)" strokeWidth="2.4" fill="none" />
      </g>
      {/* 草坪：夜色下更深一层 */}
      <rect x="0" y="360" width="800" height="90" fill="var(--map-grass)" />
      <rect x="0" y="360" width="800" height="90" fill="var(--frog-ink)" opacity="0.36" />
      <path d="M60 436 q6 -20 12 0 M700 442 q6 -20 12 0 M756 448 q6 -20 12 0" stroke="var(--map-leaf)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" />
      {/* 两盏坏灯：灯杆还在，灯头是黑的 */}
      <g>
        <path d="M118 366 v-104" stroke="var(--frog-ink)" strokeWidth="5" opacity="0.55" />
        <rect x="102" y="252" width="32" height="14" rx="4" fill="var(--frog-ink)" opacity="0.6" />
        <path d="M118 252 v-14" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.4" />
        <path d="M676 366 v-96" stroke="var(--frog-ink)" strokeWidth="5" opacity="0.55" />
        <rect x="660" y="260" width="32" height="14" rx="4" fill="var(--frog-ink)" opacity="0.6" />
        <path d="M676 260 v-14" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.4" />
      </g>
      {/* 坏灯之间：最暗的那块草与压痕 */}
      <ellipse cx="398" cy="402" rx="180" ry="46" fill="var(--frog-ink)" opacity="0.3" />
      <ellipse cx="398" cy="402" rx="128" ry="34" fill="var(--map-grass-deep)" opacity="0.85" />
      <g opacity="0.9">
        <ellipse cx="392" cy="404" rx="48" ry="18" fill="var(--frog-ink)" opacity="0.4" />
        <circle cx="338" cy="398" r="15" fill="var(--frog-ink)" opacity="0.4" />
        <circle cx="446" cy="400" r="13" fill="var(--frog-ink)" opacity="0.4" />
        <path d="M350 410 q-24 14 -32 28 M432 412 q26 12 34 26" stroke="var(--frog-ink)" strokeWidth="9" strokeLinecap="round" fill="none" opacity="0.4" />
      </g>
      {/* 光效：更远处一盏还亮着的灯，衬出坏灯之间的暗 */}
      <path d="M748 366 v-88" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.4" />
      <ellipse cx="748" cy="274" rx="12" ry="6" fill="var(--frog-badge)" opacity="0.8" />
      <ellipse cx="730" cy="300" rx="52" ry="26" fill="var(--frog-badge)" opacity="0.14" />
    </g>
  );
}

/* ---------- 17. cg-soda-grass 两根草茎 ---------- */

function CgSodaGrass() {
  return (
    <g>
      {/* 天空：入夜的渐变 */}
      <defs>
        <linearGradient id="cg-sky-soda" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="var(--frog-bow)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--frog-belly)" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-sky-soda)" />
      <circle cx="664" cy="92" r="34" fill="hsl(var(--background))" opacity="0.5" />
      <circle cx="664" cy="92" r="24" fill="hsl(var(--background))" />
      {/* 远景：教学楼一格一格的灯 */}
      <rect x="120" y="150" width="560" height="128" rx="8" fill="var(--frog-ink)" opacity="0.5" />
      {[
        [152, 170], [196, 170], [284, 170], [372, 170], [460, 170], [548, 170], [636, 170],
        [152, 210], [240, 210], [328, 210], [504, 210], [592, 210], [636, 210],
        [196, 248], [284, 248], [372, 248], [548, 248],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="24" height="26" rx="2" fill="hsl(var(--background))" opacity={i % 3 === 0 ? 0.55 : i % 3 === 1 ? 0.34 : 0.2} />
      ))}
      {/* 中景：草坪 */}
      <rect x="0" y="298" width="800" height="152" fill="var(--map-grass)" />
      <rect x="0" y="298" width="800" height="152" fill="var(--frog-ink)" opacity="0.28" />
      {/* 道具：两只空汽水瓶，歪着插在草里 */}
      <g transform="rotate(-9 348 396)">
        <rect x="332" y="330" width="34" height="76" rx="10" fill="hsl(var(--background))" opacity="0.4" />
        <rect x="340" y="306" width="18" height="30" rx="6" fill="hsl(var(--background))" opacity="0.32" />
        <rect x="340" y="298" width="18" height="10" rx="3" fill="var(--frog-bow)" opacity="0.75" />
        <rect x="336" y="352" width="26" height="3.5" rx="1.5" fill="var(--frog-ink)" opacity="0.25" />
      </g>
      <g transform="rotate(7 452 400)">
        <rect x="436" y="336" width="34" height="74" rx="10" fill="hsl(var(--background))" opacity="0.4" />
        <rect x="444" y="312" width="18" height="30" rx="6" fill="hsl(var(--background))" opacity="0.32" />
        <rect x="444" y="304" width="18" height="10" rx="3" fill="var(--frog-bluegray)" opacity="0.9" />
        <rect x="440" y="358" width="26" height="3.5" rx="1.5" fill="var(--frog-ink)" opacity="0.25" />
      </g>
      {/* 草茎：歪歪的，谁也不扶谁 */}
      <g stroke="var(--map-leaf)" strokeWidth="3.4" fill="none" strokeLinecap="round" opacity="0.85">
        <path d="M300 440 q4 -34 12 -52" />
        <path d="M340 448 q14 -30 8 -58" />
        <path d="M470 444 q-10 -30 -6 -54" />
        <path d="M512 446 q6 -32 16 -48" />
        <path d="M620 452 q-4 -26 4 -40" />
      </g>
      <g stroke="var(--map-leaf)" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.6">
        <path d="M308 404 q14 -6 26 -2 M466 402 q-14 -8 -26 -4" />
      </g>
      {/* 光效：两瓶之间的夜露微光 */}
      <ellipse cx="400" cy="428" rx="150" ry="22" fill="hsl(var(--primary))" opacity="0.07" />
    </g>
  );
}

/* ---------- 18. cg-schedule-paper 修订第 9 版 ---------- */

function CgSchedulePaper() {
  const rows: Array<[string, string]> = [
    ["6:40", "起"],
    ["6:42", "烧水"],
    ["6:50", "出门"],
    ["7:20", "背单词"],
    ["9:00", "数学"],
    ["11:30", "午饭 · 错峰"],
    ["13:00", "英语"],
    ["15:30", "政治"],
    ["18:00", "晚饭"],
    ["19:00", "真题"],
    ["23:30-23:40", "发呆"],
  ];
  return (
    <g>
      {/* 背景：柜门内侧 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.14" />
      <rect x="0" y="0" width="800" height="56" fill="var(--frog-ink)" opacity="0.16" />
      <rect x="0" y="394" width="800" height="56" fill="var(--map-wood)" opacity="0.35" />
      {[64, 244, 424, 604].map((x, i) => (
        <g key={i}>
          <rect x={x} y="72" width="132" height="306" rx="10" fill="var(--frog-bluegray)" opacity="0.5" />
          <rect x={x + 18} y="120" width="96" height="10" rx="5" fill="var(--frog-ink)" opacity="0.28" />
          <rect x={x + 18} y="140" width="96" height="10" rx="5" fill="var(--frog-ink)" opacity="0.28" />
          <rect x={x + 18} y="160" width="96" height="10" rx="5" fill="var(--frog-ink)" opacity="0.28" />
        </g>
      ))}
      {/* 道具：那张打印纸 */}
      <g transform="rotate(-2 400 236)">
        <rect x="196" y="86" width="408" height="304" rx="6" fill="var(--frog-belly)" />
        <rect x="196" y="86" width="408" height="304" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.3" />
        <text x="400" y="122" textAnchor="middle" fontSize="19" fontWeight="700" fill="var(--frog-ink)">
          作息表（修订第 9 版）
        </text>
        <path d="M222 136 h356" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.35" />
        <text x="604" y="152" fontSize="10" fill="var(--frog-ink)" opacity="0.5">备注</text>
        {rows.map(([time, item], i) => (
          <g key={i}>
            <text x="222" y={158 + i * 21} fontSize="12" fill="var(--frog-ink)" opacity="0.85">{time}</text>
            <text x="300" y={158 + i * 21} fontSize="12" fill="var(--frog-ink)" opacity="0.85">{item}</text>
            <rect x="560" y={148 + i * 21} width="44" height="12" rx="2" fill="none" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.3" />
            <path d={`M222 ${152 + i * 21} h356`} stroke="var(--frog-ink)" strokeWidth="0.6" opacity="0.14" />
          </g>
        ))}
        {/* 四个角的针孔，与旧版针孔错位 */}
        {[
          [206, 96, 0.55], [594, 96, 0.55], [206, 380, 0.55], [594, 380, 0.55],
          [216, 110, 0.3], [584, 110, 0.3], [216, 366, 0.3], [584, 366, 0.3],
        ].map(([x, y, o], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="var(--frog-ink)" opacity={o as number} />
        ))}
      </g>
      {/* 光效：走廊光从左侧扫过 */}
      <path d="M92 64 q60 260 120 320" stroke="hsl(var(--background))" strokeWidth="26" fill="none" opacity="0.07" />
    </g>
  );
}

/* ---------- 19. cg-402-night 402 的窗 ---------- */

function Cg402Night() {
  return (
    <g>
      {/* 夜空 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.5" />
      <circle cx="128" cy="86" r="4" fill="hsl(var(--background))" opacity="0.5" />
      <circle cx="216" cy="56" r="3" fill="hsl(var(--background))" opacity="0.4" />
      <circle cx="704" cy="72" r="3.4" fill="hsl(var(--background))" opacity="0.45" />
      {/* 中景：教学区的老楼，整栋黑着 */}
      <rect x="150" y="70" width="500" height="330" rx="8" fill="var(--frog-ink)" opacity="0.72" />
      <rect x="150" y="70" width="500" height="330" rx="8" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.4" />
      {[
        [196, 110], [280, 110], [364, 110], [448, 110], [532, 110],
        [196, 176], [364, 176], [448, 176], [532, 176],
        [196, 242], [280, 242], [448, 242], [532, 242],
        [196, 308], [280, 308], [364, 308], [448, 308], [532, 308],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="48" height="44" rx="4" fill="var(--frog-ink)" opacity="0.55" />
      ))}
      {/* 402 那格：亮着 */}
      <rect x="596" y="176" width="30" height="44" rx="4" fill="var(--frog-badge)" opacity="0.18" />
      <rect x="596" y="176" width="48" height="44" rx="4" fill="var(--frog-badge)" opacity="0.55" />
      <ellipse cx="620" cy="198" rx="86" ry="60" fill="var(--frog-badge)" opacity="0.1" />
      {/* 玻璃上从里头擦出来的那块干净的方 */}
      <rect x="604" y="200" width="30" height="16" rx="2" fill="hsl(var(--background))" opacity="0.5" />
      {/* 楼里隐约的桌与灯 */}
      <g opacity="0.4">
        <path d="M600 212 v-8 M604 212 v-10 M608 212 v-6" stroke="var(--frog-ink)" strokeWidth="1.6" />
      </g>
      {/* 前景：路沿与灯光洒下的地面 */}
      <rect x="0" y="400" width="800" height="50" fill="var(--map-road)" />
      <rect x="0" y="400" width="800" height="50" fill="var(--frog-ink)" opacity="0.4" />
      <path d="M596 400 L560 450 L700 450 L644 400 Z" fill="var(--frog-badge)" opacity="0.1" />
      {/* 光效：老楼的檐角 */}
      <path d="M150 70 h500" stroke="hsl(var(--background))" strokeWidth="2" opacity="0.2" />
    </g>
  );
}

/* ---------- 20. cg-survey-stack 回收十一份 ---------- */

function CgSurveyStack() {
  return (
    <g>
      {/* 背景：学工办室内 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="52" fill="var(--frog-ink)" opacity="0.1" />
      {/* 远景：黑着的叫号屏与玻璃窗 */}
      <rect x="70" y="40" width="180" height="56" rx="8" fill="var(--frog-ink)" opacity="0.85" />
      <text x="160" y="76" textAnchor="middle" fontSize="14" fill="var(--frog-eye)" opacity="0.35">
        请取号（屏没亮）
      </text>
      <rect x="596" y="44" width="168" height="196" rx="10" fill="var(--map-water)" opacity="0.4" />
      <rect x="596" y="44" width="168" height="196" rx="10" fill="none" stroke="var(--frog-ink)" strokeWidth="5" opacity="0.4" />
      <rect x="648" y="96" width="52" height="34" rx="3" fill="var(--frog-ink)" opacity="0.28" />
      <rect x="648" y="96" width="26" height="34" rx="3" fill="var(--frog-badge)" opacity="0.2" />
      {/* 中景：桌面 */}
      <path d="M0 306 L800 296 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 344 L800 336 L800 348 L0 356 Z" fill="var(--frog-ink)" opacity="0.12" />
      {/* 道具：回收的一沓调查表 */}
      <rect x="252" y="122" width="300" height="212" rx="4" fill="var(--frog-ink)" opacity="0.16" />
      <rect x="244" y="114" width="308" height="214" rx="4" fill="var(--frog-belly)" />
      <rect x="244" y="114" width="308" height="214" rx="4" fill="none" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.3" />
      <text x="398" y="148" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--frog-ink)">
        服务满意度调查
      </text>
      <path d="M268 160 h260" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.3" />
      <text x="272" y="188" fontSize="11.5" fill="var(--frog-ink)" opacity="0.6">
        对学工办的服务是否满意
      </text>
      <rect x="272" y="198" width="252" height="42" rx="3" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.4" />
      <text x="398" y="227" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--frog-ink)">
        收到
      </text>
      <text x="272" y="268" fontSize="11" fill="var(--frog-ink)" opacity="0.5">
        发出去三百份 · 收回来十一份
      </text>
      <text x="272" y="292" fontSize="11" fill="var(--frog-ink)" opacity="0.5">
        十份的空格里 · 写的都是这两个字
      </text>
      {/* 回收率的小字 */}
      <rect x="466" y="252" width="80" height="20" rx="10" fill="hsl(var(--primary))" opacity="0.12" />
      <text x="506" y="266" textAnchor="middle" fontSize="11" fontWeight="700" fill="hsl(var(--primary))" opacity="0.9">
        回收率 3.7%
      </text>
      {/* 散落的回收表，角上都写着「收到」 */}
      <g transform="rotate(7 637 368)">
        <rect x="576" y="330" width="122" height="76" rx="4" fill="var(--frog-belly)" />
        <rect x="576" y="330" width="122" height="76" rx="4" fill="none" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.3" />
        <text x="637" y="374" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
          收到
        </text>
      </g>
      <g transform="rotate(-6 149 370)">
        <rect x="88" y="332" width="122" height="76" rx="4" fill="var(--frog-belly)" />
        <rect x="88" y="332" width="122" height="76" rx="4" fill="none" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.3" />
        <text x="149" y="376" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
          收到
        </text>
      </g>
      {/* 光效：日光灯与桌面反光 */}
      {[150, 420, 660].map((x, i) => (
        <rect key={i} x={x - 58} y="8" width="116" height="8" rx="4" fill="var(--frog-badge)" opacity="0.65" />
      ))}
      <path d="M60 424 h150 M620 428 h130" stroke="hsl(var(--background))" strokeWidth="4" opacity="0.22" />
    </g>
  );
}

/* ---------- 21. cg-review-templates 七百字的三种写法 ---------- */

function CgReviewTemplates() {
  return (
    <g>
      {/* 夜 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.5" />
      <circle cx="112" cy="66" r="2.4" fill="hsl(var(--background))" opacity="0.45" />
      <circle cx="220" cy="46" r="2" fill="hsl(var(--background))" opacity="0.4" />
      <circle cx="700" cy="58" r="2.6" fill="hsl(var(--background))" opacity="0.4" />
      {/* 远景：行政楼，学工办那格灯已经灭了 */}
      <rect x="120" y="66" width="560" height="316" rx="8" fill="var(--frog-ink)" opacity="0.72" />
      <rect x="120" y="66" width="560" height="316" rx="8" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.4" />
      {[
        [196, 106], [280, 106], [364, 106], [448, 106], [532, 106],
        [196, 172], [280, 172], [448, 172], [532, 172],
        [196, 238], [364, 238], [448, 238], [532, 238],
        [196, 304], [280, 304], [448, 304], [532, 304],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="48" height="44" rx="4" fill="var(--frog-ink)" opacity="0.55" />
      ))}
      {/* 364,304 那格：灯已灭，只剩玻璃柜反着的一点光 */}
      <rect x="364" y="304" width="48" height="44" rx="4" fill="var(--frog-eye)" opacity="0.07" />
      <rect x="380" y="318" width="16" height="16" rx="2" fill="hsl(var(--background))" opacity="0.1" />
      {/* 中景：手机屏幕上翻出的三份检讨 */}
      <rect x="176" y="92" width="448" height="292" rx="26" fill="var(--frog-ink)" />
      <rect x="190" y="104" width="420" height="268" rx="18" fill="var(--frog-bluegray)" opacity="0.92" />
      <text x="214" y="126" fontSize="10" fill="var(--frog-ink)" opacity="0.5">
        23:48
      </text>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${214 + i * 132}, 136)`}>
          <rect x="0" y="0" width="118" height="164" rx="5" fill="var(--frog-belly)" />
          <rect x="0" y="0" width="118" height="164" rx="5" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.3" />
          <text x="59" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-ink)">
            认错（{["快版", "慢版", "中速版"][i]}）
          </text>
          <path d="M14 34 h90" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.3" />
          {Array.from({ length: 8 }).map((_, r) => (
            <path
              key={r}
              d={`M14 ${50 + r * 13} h${[90, 74, 86, 62, 88, 70, 84, 58][r]}`}
              stroke="var(--frog-ink)"
              strokeWidth="1.2"
              opacity="0.22"
            />
          ))}
          <text x="59" y="156" textAnchor="middle" fontSize="9" fill="var(--frog-ink)" opacity="0.5">
            {["712 字", "706 字", "698 字"][i]}
          </text>
        </g>
      ))}
      <ellipse cx="400" cy="220" rx="270" ry="160" fill="var(--frog-badge)" opacity="0.07" />
      {/* 前景：楼梯口的台阶与她 */}
      <rect x="0" y="398" width="800" height="52" fill="var(--map-road)" />
      <rect x="0" y="398" width="800" height="52" fill="var(--frog-ink)" opacity="0.35" />
      <g>
        <ellipse cx="648" cy="404" rx="30" ry="34" fill="var(--frog-gege)" opacity="0.92" />
        <circle cx="648" cy="366" r="15" fill="var(--frog-gege-deep)" />
        <rect x="672" y="382" width="16" height="24" rx="3" fill="var(--frog-ink)" />
        <rect x="676" y="386" width="9" height="15" rx="2" fill="var(--frog-badge)" opacity="0.5" />
      </g>
      {/* 光效：台阶声控灯 */}
      <path d="M120 400 h130 M300 404 h110" stroke="var(--frog-badge)" strokeWidth="5" opacity="0.14" />
    </g>
  );
}

/* ---------- 22. cg-phones-down 屏幕朝下 ---------- */

function CgPhonesDown() {
  return (
    <g>
      {/* 夜空 */}
      <defs>
        <linearGradient id="cg-sky-phones" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" />
        </linearGradient>
        <linearGradient id="cg-water-phones" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bluegray)" />
          <stop offset="1" stopColor="var(--frog-ink)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-sky-phones)" />
      {[
        [90, 58, 2], [188, 96, 1.5], [286, 48, 1.9], [420, 92, 1.4], [520, 54, 2],
        [688, 46, 1.8], [744, 110, 1.5], [330, 130, 1.3],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="var(--frog-eye)" opacity="0.85" />
      ))}
      {/* 远景：月亮与对岸的楼 */}
      <circle cx="612" cy="92" r="56" fill="var(--frog-belly)" opacity="0.14" />
      <circle cx="612" cy="92" r="36" fill="var(--frog-belly)" />
      <circle cx="600" cy="84" r="6" fill="var(--frog-belly)" opacity="0.7" />
      <rect x="668" y="150" width="86" height="66" rx="5" fill="var(--frog-ink)" opacity="0.92" />
      <rect x="694" y="168" width="12" height="15" rx="2" fill="var(--frog-badge)" opacity="0.5" />
      <path d="M0 216 Q170 190 340 210 Q560 232 800 208 L800 228 L0 228 Z" fill="var(--map-leaf)" opacity="0.3" />
      {/* 湖面 */}
      <rect x="0" y="222" width="800" height="140" fill="url(#cg-water-phones)" />
      <ellipse cx="612" cy="258" rx="52" ry="11" fill="var(--frog-belly)" opacity="0.5" />
      <ellipse cx="612" cy="274" rx="32" ry="7" fill="var(--frog-belly)" opacity="0.66" />
      <path
        d="M110 268 q30 8 60 0 M240 306 q30 8 60 0 M470 322 q30 8 60 0 M690 336 q26 7 52 0"
        stroke="var(--frog-eye)"
        strokeWidth="2.4"
        fill="none"
        opacity="0.35"
      />
      {/* 远景：围坐的蛙剪影，都没说话 */}
      <g opacity="0.9">
        <ellipse cx="120" cy="224" rx="22" ry="14" fill="var(--frog-ink)" />
        <circle cx="104" cy="212" r="8" fill="var(--frog-ink)" />
        <ellipse cx="178" cy="226" rx="20" ry="13" fill="var(--frog-ink)" />
        <circle cx="196" cy="214" r="7" fill="var(--frog-ink)" />
        <ellipse cx="246" cy="228" rx="21" ry="14" fill="var(--frog-ink)" />
        <circle cx="246" cy="212" r="8" fill="var(--frog-ink)" />
      </g>
      {/* 中景：湖边的石头台面 */}
      <path d="M0 362 L800 344 L800 450 L0 450 Z" fill="var(--frog-bluegray-deep)" />
      <path d="M0 372 L800 356 L800 368 L0 384 Z" fill="hsl(var(--background))" opacity="0.08" />
      <ellipse cx="640" cy="404" rx="120" ry="26" fill="var(--frog-ink)" opacity="0.3" />
      {/* 道具：摞在石头上的手机，屏幕全朝下 */}
      <g>
        <rect x="322" y="330" width="150" height="60" rx="12" fill="var(--frog-ink)" opacity="0.85" />
        <rect x="334" y="318" width="150" height="60" rx="12" fill="var(--frog-ink)" opacity="0.9" />
        <rect x="326" y="306" width="146" height="58" rx="12" fill="var(--frog-ink)" opacity="0.95" />
        <rect x="318" y="294" width="152" height="60" rx="13" fill="var(--frog-ink)" />
        <rect x="318" y="294" width="152" height="60" rx="13" fill="none" stroke="hsl(var(--background))" strokeWidth="1.4" opacity="0.14" />
        <circle cx="342" cy="312" r="5" fill="var(--frog-eye)" opacity="0.35" />
        <circle cx="342" cy="328" r="5" fill="var(--frog-eye)" opacity="0.35" />
        <rect x="436" y="300" width="22" height="6" rx="3" fill="var(--frog-eye)" opacity="0.2" />
        <path d="M322 300 q60 8 118 0" stroke="var(--frog-belly)" strokeWidth="2.4" fill="none" opacity="0.22" />
      </g>
      {/* 一台美颜手机（莓莓的），今晚一次没用 */}
      <rect x="502" y="322" width="106" height="56" rx="10" fill="var(--frog-ink)" opacity="0.92" />
      <circle cx="524" cy="338" r="4" fill="var(--frog-berry-deep)" opacity="0.6" />
      {/* 光效：月色洒在石头上 */}
      <path d="M180 396 q90 12 180 6 M560 420 q80 10 160 4" stroke="var(--frog-belly)" strokeWidth="3" fill="none" opacity="0.12" />
    </g>
  );
}

/* ---------- 23. cg-corn-pot 锅里的玉米 ---------- */

function CgCornPot() {
  return (
    <g>
      {/* 夜空 */}
      <defs>
        <linearGradient id="cg-sky-corn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-sky-corn)" />
      {[
        [70, 52, 1.8], [168, 84, 1.4], [300, 40, 2], [420, 74, 1.5], [560, 44, 1.8],
        [668, 88, 1.4], [742, 54, 2.2], [506, 120, 1.3],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="var(--frog-eye)" opacity="0.85" />
      ))}
      {/* 远景：月亮与湖面 */}
      <circle cx="152" cy="84" r="50" fill="var(--frog-belly)" opacity="0.12" />
      <circle cx="152" cy="84" r="32" fill="var(--frog-belly)" opacity="0.92" />
      <circle cx="142" cy="78" r="5" fill="var(--frog-belly)" opacity="0.7" />
      <path d="M0 244 Q200 220 400 238 Q620 256 800 232 L800 250 L0 250 Z" fill="var(--map-leaf)" opacity="0.28" />
      <rect x="0" y="248" width="800" height="120" fill="var(--frog-bluegray)" opacity="0.5" />
      <ellipse cx="152" cy="284" rx="46" ry="10" fill="var(--frog-belly)" opacity="0.45" />
      <ellipse cx="152" cy="298" rx="28" ry="6" fill="var(--frog-belly)" opacity="0.6" />
      <path
        d="M560 292 q30 8 60 0 M680 318 q28 7 56 0 M420 306 q28 7 56 0"
        stroke="var(--frog-eye)"
        strokeWidth="2.2"
        fill="none"
        opacity="0.3"
      />
      {/* 中景：湖边的草地与石头 */}
      <path d="M0 344 L800 332 L800 450 L0 450 Z" fill="var(--map-grass)" />
      <path d="M0 344 L800 332 L800 450 L0 450 Z" fill="var(--frog-ink)" opacity="0.3" />
      <ellipse cx="392" cy="418" rx="230" ry="40" fill="var(--frog-bluegray-deep)" opacity="0.5" />
      {/* 道具：酒精炉与锅 */}
      <g>
        <rect x="352" y="326" width="96" height="42" rx="9" fill="var(--frog-ink)" opacity="0.85" />
        <ellipse cx="400" cy="330" rx="26" ry="12" fill="hsl(var(--primary))" opacity="0.55" />
        <ellipse cx="400" cy="328" rx="14" ry="8" fill="var(--frog-badge)" opacity="0.7" />
        <ellipse cx="400" cy="288" rx="98" ry="30" fill="var(--frog-ink)" opacity="0.95" />
        <rect x="302" y="262" width="196" height="28" rx="12" fill="var(--frog-ink)" opacity="0.95" />
        {/* 锅口沿的水垢圈 */}
        <path d="M316 268 q84 18 168 0" stroke="var(--frog-cream)" strokeWidth="3" fill="none" opacity="0.4" strokeDasharray="10 6" />
        <path d="M330 296 q70 20 140 0" stroke="var(--frog-cream)" strokeWidth="2.4" fill="none" opacity="0.28" />
        {/* 玉米 */}
        <g>
          <rect x="356" y="212" width="22" height="58" rx="9" fill="var(--frog-khaki)" transform="rotate(-7 367 241)" />
          {[0, 1, 2, 3].map((k) => (
            <circle key={k} cx={362 + k * 4} cy={226 + k * 10} r="1.8" fill="var(--frog-cream)" opacity="0.55" />
          ))}
          <rect x="392" y="206" width="22" height="62" rx="9" fill="var(--frog-khaki)" />
          {[0, 1, 2, 3].map((k) => (
            <circle key={k} cx={398 + k * 4} cy={220 + k * 11} r="1.8" fill="var(--frog-cream)" opacity="0.55" />
          ))}
          <rect x="428" y="216" width="20" height="54" rx="8" fill="var(--frog-khaki)" transform="rotate(8 438 243)" />
          {[0, 1, 2, 3].map((k) => (
            <circle key={k} cx={434 + k * 4} cy={230 + k * 9} r="1.7" fill="var(--frog-cream)" opacity="0.55" />
          ))}
        </g>
        {/* 蒸汽 */}
        <path d="M372 196 q-10 -22 6 -40 q14 -16 4 -34" stroke="var(--frog-belly)" strokeWidth="3" fill="none" opacity="0.2" />
        <path d="M412 192 q10 -24 -6 -42 q-12 -14 -4 -30" stroke="var(--frog-belly)" strokeWidth="3" fill="none" opacity="0.16" />
        <path d="M446 204 q14 -18 2 -34" stroke="var(--frog-belly)" strokeWidth="2.6" fill="none" opacity="0.18" />
      </g>
      {/* 剪影：蹲着的干饭叔，拨火 */}
      <g>
        <ellipse cx="568" cy="392" rx="44" ry="36" fill="var(--frog-ink)" />
        <circle cx="568" cy="344" r="17" fill="var(--frog-ink)" />
        <path d="M528 380 q-34 -8 -58 -26" stroke="var(--frog-ink)" strokeWidth="9" fill="none" opacity="0.9" strokeLinecap="round" />
        <circle cx="568" cy="340" r="6" fill="var(--frog-eye)" opacity="0.25" />
      </g>
      {/* 光效：炉火的光圈与火星 */}
      <ellipse cx="400" cy="330" rx="150" ry="64" fill="hsl(var(--primary))" opacity="0.12" />
      <ellipse cx="400" cy="330" rx="220" ry="100" fill="hsl(var(--primary))" opacity="0.06" />
      <circle cx="352" cy="300" r="2.4" fill="var(--frog-badge)" opacity="0.7" />
      <circle cx="452" cy="292" r="2" fill="var(--frog-badge)" opacity="0.6" />
      <circle cx="430" cy="316" r="1.8" fill="var(--frog-badge)" opacity="0.55" />
    </g>
  );
}

/* ---------- 24. cg-sign-sheet 六十个正常 ---------- */

function CgSignSheet() {
  return (
    <g>
      {/* 宿舍房间的暗夜 */}
      <defs>
        <linearGradient id="cg-room-sign" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray-deep)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-room-sign)" />
      {/* 门缝漏进的一点走廊光 */}
      <polygon points="0,0 150,0 78,450 0,450" fill="var(--frog-cream)" opacity="0.07" />
      {/* 桌面 */}
      <rect x="0" y="330" width="800" height="120" fill="var(--frog-cream-deep)" opacity="0.18" />
      <path d="M0 330 L800 330 L800 336 L0 336 Z" fill="var(--frog-cream)" opacity="0.14" />
      {/* 手电的一格光，斜着落在表上 */}
      <polygon points="150,0 300,0 560,330 330,330" fill="var(--frog-cream)" opacity="0.09" />
      {/* 签到表主体：微微倾斜的一叠 A4 */}
      <g transform="rotate(-4 400 230)">
        <rect x="252" y="146" width="306" height="214" rx="4" fill="var(--frog-bluegray)" opacity="0.45" />
        <rect x="240" y="134" width="316" height="218" rx="4" fill="hsl(var(--background))" />
        {/* 表头 */}
        <path d="M240 134 h316 v22 a4 4 0 0 1 -4 4 h-308 a4 4 0 0 1 -4 -4 Z" fill="var(--frog-cream)" />
        <text x="398" y="150" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-ink)" opacity="0.75">
          学生就寝情况登记表
        </text>
        {/* 六十行里的一栏：行线 + 房间号 + 「正常」 */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => {
          const y = 172 + row * 21;
          return (
            <g key={`sr-${row}`}>
              <line x1="254" y1={y} x2="542" y2={y} stroke="var(--frog-ink)" strokeWidth="0.8" opacity="0.22" />
              <text x="264" y={y - 4} fontSize="9.5" fill="var(--frog-ink)" opacity="0.5">{`60${row + 2}`}</text>
              <text x="322" y={y - 4} fontSize="9" fill="var(--frog-ink)" opacity="0.34">————————</text>
              <text x="486" y={y - 3} fontSize="10.5" fontWeight="700" fill="var(--frog-ink)" opacity="0.72">正常</text>
            </g>
          );
        })}
        {/* 那一钩的弧度：收尾笔锋 */}
        <path d="M520 302 q6 4 10 -2" stroke="var(--frog-ink)" strokeWidth="1.4" fill="none" opacity="0.5" />
      </g>
      {/* 一支笔，斜放在桌上 */}
      <g transform="rotate(14 648 288)">
        <rect x="596" y="282" width="92" height="11" rx="5" fill="var(--frog-berry)" />
        <rect x="672" y="282" width="16" height="11" rx="5" fill="var(--frog-berry-deep)" />
        <polygon points="596,282 582,287.5 596,293" fill="var(--frog-ink)" />
      </g>
      {/* 格格的爪：按住纸角，递表的那只 */}
      <g>
        <path d="M800 412 Q696 372 604 330" stroke="var(--frog-gege)" strokeWidth="36" fill="none" strokeLinecap="round" />
        <ellipse cx="596" cy="326" rx="34" ry="27" fill="var(--frog-gege)" />
        <circle cx="596" cy="296" r="21" fill="var(--frog-gege)" />
        <circle cx="589" cy="292" r="3.2" fill="var(--frog-eye)" />
        <circle cx="603" cy="292" r="3.2" fill="var(--frog-eye)" />
        <ellipse cx="584" cy="303" rx="6.5" ry="4" fill="var(--frog-blush)" opacity="0.55" />
        <ellipse cx="608" cy="303" rx="6.5" ry="4" fill="var(--frog-blush)" opacity="0.55" />
        <path d="M588 306 q8 6 16 0" stroke="var(--frog-mouth)" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.7" />
        {/* 工牌一角 */}
        <rect x="620" y="316" width="26" height="18" rx="3" fill="var(--frog-badge)" opacity="0.9" transform="rotate(-12 633 325)" />
      </g>
      {/* 奶白的爪：接住纸角的另一只 */}
      <ellipse cx="212" cy="352" rx="30" ry="22" fill="var(--frog-cream)" transform="rotate(-14 212 352)" />
      {/* 光效：表纸在光里泛白的那一小块 */}
      <ellipse cx="400" cy="240" rx="180" ry="90" fill="var(--frog-cream)" opacity="0.05" />
    </g>
  );
}

/* ---------- 25. cg-green-lamp 绿色应急灯 ---------- */

function CgGreenLamp() {
  return (
    <g>
      {/* 走廊深夜 */}
      <defs>
        <linearGradient id="cg-hall-lamp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" />
        </linearGradient>
        <radialGradient id="cg-lamp-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-matcha)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--frog-matcha)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-hall-lamp)" />
      {/* 走廊透视线与地面 */}
      <path d="M118 36 L54 322" stroke="var(--frog-cream)" strokeWidth="2" opacity="0.12" fill="none" />
      <path d="M682 36 L746 322" stroke="var(--frog-cream)" strokeWidth="2" opacity="0.12" fill="none" />
      <path d="M54 322 L746 322 L800 450 L0 450 Z" fill="var(--frog-ink)" opacity="0.42" />
      <path d="M54 322 L746 322" stroke="var(--frog-cream)" strokeWidth="1.5" opacity="0.1" fill="none" />
      {/* 走廊尽头的窗：窗外整栋楼黑着 */}
      <rect x="358" y="64" width="84" height="64" rx="4" fill="var(--frog-ink)" opacity="0.85" />
      <path d="M400 64 L400 128 M358 96 L442 96" stroke="var(--frog-cream)" strokeWidth="2" opacity="0.1" fill="none" />
      {/* 两侧的房门：都黑着，门缝不透光 */}
      <g>
        <rect x="34" y="146" width="36" height="116" rx="3" fill="var(--frog-ink)" opacity="0.8" />
        <rect x="82" y="158" width="26" height="88" rx="3" fill="var(--frog-ink)" opacity="0.72" />
        <rect x="116" y="166" width="18" height="62" rx="3" fill="var(--frog-ink)" opacity="0.6" />
        <rect x="730" y="146" width="36" height="116" rx="3" fill="var(--frog-ink)" opacity="0.8" />
        <rect x="692" y="158" width="26" height="88" rx="3" fill="var(--frog-ink)" opacity="0.72" />
        <rect x="666" y="166" width="18" height="62" rx="3" fill="var(--frog-ink)" opacity="0.6" />
      </g>
      {/* 绿应急灯：每层楼角一盏 */}
      <rect x="660" y="66" width="8" height="24" rx="4" fill="var(--frog-ink)" opacity="0.85" />
      <rect x="612" y="86" width="82" height="30" rx="7" fill="var(--frog-bluegray-deep)" />
      <rect x="618" y="92" width="70" height="18" rx="5" fill="var(--frog-matcha)" />
      {/* 灯上的奔跑小人 */}
      <g opacity="0.8">
        <circle cx="646" cy="99" r="2.6" fill="var(--frog-ink)" />
        <path d="M646 101 l-4 6 M646 101 l3 5 M649 99 l4 -2" stroke="var(--frog-ink)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>
      <path d="M700 97 h-12 M700 105 h-12" stroke="var(--frog-ink)" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      {/* 绿光：光圈、光锥与被染绿的墙面 */}
      <circle cx="653" cy="101" r="98" fill="url(#cg-lamp-glow)" />
      <polygon points="622,116 696,116 700,450 470,450" fill="var(--frog-matcha)" opacity="0.1" />
      <rect x="520" y="50" width="280" height="280" fill="var(--frog-matcha)" opacity="0.07" />
      {/* 地面的绿反光 */}
      <ellipse cx="600" cy="368" rx="210" ry="46" fill="var(--frog-matcha)" opacity="0.12" />
      <ellipse cx="380" cy="398" rx="150" ry="30" fill="var(--frog-matcha)" opacity="0.07" />
      {/* 剪影：靠墙站着的两只蛙——绿光里同一个颜色 */}
      <g>
        <ellipse cx="256" cy="390" rx="40" ry="32" fill="var(--frog-ink)" />
        <circle cx="256" cy="348" r="16" fill="var(--frog-ink)" />
        <circle cx="250" cy="345" r="3.2" fill="var(--frog-eye)" opacity="0.28" />
        <circle cx="262" cy="345" r="3.2" fill="var(--frog-eye)" opacity="0.28" />
      </g>
      <g>
        <ellipse cx="336" cy="394" rx="34" ry="28" fill="var(--frog-ink)" />
        <circle cx="336" cy="358" r="13.5" fill="var(--frog-ink)" />
        <circle cx="331" cy="356" r="2.8" fill="var(--frog-eye)" opacity="0.28" />
        <circle cx="341" cy="356" r="2.8" fill="var(--frog-eye)" opacity="0.28" />
      </g>
      {/* 剪影上的一层绿，把两只蛙染成同一个颜色 */}
      <ellipse cx="296" cy="366" rx="130" ry="80" fill="var(--frog-matcha)" opacity="0.1" />
    </g>
  );
}

/* ---------- 26. cg-power-cut 二十三点整（楼外整栋窗一排排黑掉） ---------- */

function CgPowerCut() {
  return (
    <g>
      <defs>
        <linearGradient id="cg-power-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-power-sky)" />
      {/* 夜空：月牙、薄云与几粒星 */}
      <path d="M676 46 a22 22 0 1 0 12 40 a17 17 0 1 1 -12 -40 Z" fill="var(--frog-belly)" opacity="0.78" />
      <ellipse cx="600" cy="92" rx="40" ry="8" fill="var(--frog-bluegray)" opacity="0.4" />
      <ellipse cx="180" cy="60" rx="46" ry="7" fill="var(--frog-bluegray)" opacity="0.3" />
      {[
        [120, 44],
        [214, 82],
        [322, 36],
        [486, 58],
        [88, 118],
        [546, 32],
      ].map(([sx, sy], i) => (
        <circle key={`star-${i}`} cx={sx} cy={sy} r="1.8" fill="var(--frog-belly)" opacity="0.5" />
      ))}
      {/* 宿舍楼主楼：整面窗格，绝大多数已经黑了 */}
      <rect x="118" y="94" width="566" height="306" rx="6" fill="var(--frog-bluegray-deep)" />
      <rect x="118" y="94" width="566" height="18" rx="6" fill="var(--frog-bluegray)" opacity="0.5" />
      {[
        [0, 6],
        [1, 2],
        [3, 5],
      ].map(([row, col]) => (
        <rect key={`lit-${row}-${col}`} x={140 + Number(col) * 68} y={122 + Number(row) * 56} width="46" height="34" rx="3" fill="var(--frog-badge)" opacity="0.82" />
      ))}
      {/* 正在黑掉的那一格：比别的暗一档 */}
      <rect x={140 + 4 * 68} y={122 + 2 * 56} width="46" height="34" rx="3" fill="var(--frog-badge)" opacity="0.28" />
      {/* 楼顶水塔 */}
      <rect x="606" y="62" width="34" height="32" rx="4" fill="var(--frog-ink)" opacity="0.75" />
      <path d="M612 62 v-10 h22 v10" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.75" fill="none" />
      {/* 楼门与门灯：入口那一格是暖的 */}
      <rect x="362" y="336" width="82" height="64" rx="4" fill="var(--frog-ink)" opacity="0.85" />
      <rect x="372" y="348" width="62" height="52" rx="3" fill="var(--frog-badge)" opacity="0.4" />
      <ellipse cx="403" cy="356" rx="26" ry="10" fill="var(--frog-badge)" opacity="0.55" />
      <text x="403" y="330" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-cream)" opacity="0.6">
        宿舍楼
      </text>
      {/* 地面：路、路灯、树影 */}
      <path d="M0 400 L800 400 L800 450 L0 450 Z" fill="var(--frog-ink)" opacity="0.7" />
      <path d="M0 430 h800" stroke="var(--frog-cream)" strokeWidth="2" opacity="0.07" />
      <rect x="66" y="300" width="7" height="102" rx="3" fill="var(--frog-ink)" opacity="0.85" />
      <circle cx="69" cy="296" r="10" fill="var(--frog-badge)" opacity="0.7" />
      <ellipse cx="88" cy="412" rx="60" ry="12" fill="var(--frog-badge)" opacity="0.12" />
      <ellipse cx="716" cy="404" rx="46" ry="34" fill="var(--frog-ink)" opacity="0.6" />
      {/* 楼下仰头看的一只蛙剪影 */}
      <g>
        <ellipse cx="252" cy="416" rx="26" ry="21" fill="var(--frog-ink)" />
        <circle cx="252" cy="388" r="11" fill="var(--frog-ink)" />
        <circle cx="248" cy="386" r="2.3" fill="var(--frog-eye)" opacity="0.25" />
        <circle cx="256" cy="386" r="2.3" fill="var(--frog-eye)" opacity="0.25" />
      </g>
    </g>
  );
}

/* ---------- 27. cg-curtain-light 帘子里的光（床帘缝一格光 + 灰灰剪影） ---------- */

function CgCurtainLight() {
  return (
    <g>
      <defs>
        <linearGradient id="cg-curtain-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray-deep)" />
        </linearGradient>
        <radialGradient id="cg-curtain-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="hsl(var(--background))" stopOpacity="0.32" />
          <stop offset="1" stopColor="hsl(var(--background))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-curtain-dark)" />
      {/* 门缝漏进来的一点走廊残光 */}
      <polygon points="0,0 110,0 58,450 0,450" fill="var(--frog-cream)" opacity="0.05" />
      {/* 上铺床沿与枕头 */}
      <rect x="140" y="330" width="530" height="18" rx="6" fill="var(--frog-ink)" opacity="0.85" />
      <rect x="150" y="348" width="510" height="102" fill="var(--frog-ink)" opacity="0.4" />
      <rect x="166" y="300" width="70" height="32" rx="10" fill="var(--frog-bluegray-deep)" opacity="0.7" />
      {/* 床帘横杆与滑环 */}
      <rect x="140" y="96" width="530" height="9" rx="4.5" fill="var(--frog-ink)" opacity="0.9" />
      {[160, 208, 256, 304, 352, 448, 496, 544, 592, 640].map((rx) => (
        <circle key={`cring-${rx}`} cx={rx} cy="102" r="4" fill="var(--frog-bluegray-deep)" opacity="0.85" />
      ))}
      {/* 帘缝里的一格光：光芯 + 光晕 + 落到床沿的斜光 */}
      <ellipse cx="400" cy="220" rx="180" ry="150" fill="url(#cg-curtain-glow)" />
      <polygon points="376,104 424,104 486,332 316,332" fill="hsl(var(--background))" opacity="0.08" />
      <rect x="384" y="104" width="32" height="228" fill="hsl(var(--background))" opacity="0.22" />
      {/* 灰灰剪影：盘腿坐在光后面，手机屏幕是唯一的灯 */}
      <g>
        <ellipse cx="400" cy="252" rx="50" ry="44" fill="var(--frog-ink)" />
        <circle cx="400" cy="192" r="22" fill="var(--frog-ink)" />
        {/* 手机屏幕 */}
        <rect x="391" y="224" width="18" height="30" rx="3" fill="hsl(var(--background))" opacity="0.95" />
        {/* 剪影轮廓上的一圈冷光 */}
        <path d="M362 236 q-6 -22 10 -38 M438 236 q6 -22 -10 -38" stroke="hsl(var(--background))" strokeWidth="2.4" fill="none" opacity="0.35" />
        {/* 黑眼圈的痕迹，比夜色深一点 */}
        <path d="M388 190 q6 4 12 0 M398 190 q6 4 12 0" stroke="var(--frog-bag)" strokeWidth="1.8" fill="none" opacity="0.4" />
      </g>
      {/* 左右两片帘布：把光裁成一道缝 */}
      <path d="M150 104 h226 q-8 56 2 112 q-10 60 2 114 h-230 Z" fill="var(--frog-berry-deep)" opacity="0.94" />
      <path d="M424 104 h226 q-8 56 2 112 q-10 60 2 114 h-230 Z" fill="var(--frog-berry-deep)" opacity="0.94" />
      <path d="M186 104 q-6 56 0 114 q-6 58 0 112 M226 104 q-6 56 0 114 q-6 58 0 112 M266 104 q-6 56 0 114 q-6 58 0 112 M306 104 q-6 56 0 114 q-6 58 0 112 M462 104 q-6 56 0 114 q-6 58 0 112 M504 104 q-6 56 0 114 q-6 58 0 112 M546 104 q-6 56 0 114 q-6 58 0 112 M588 104 q-6 56 0 114 q-6 58 0 112" stroke="var(--frog-ink)" strokeWidth="2.5" opacity="0.28" fill="none" />
      {/* 缝边被光镀亮的一线 */}
      <path d="M376 104 v228 M424 104 v228" stroke="hsl(var(--background))" strokeWidth="2" opacity="0.5" />
      {/* 床架上挂着的耳机线剪影 */}
      <path d="M668 120 q10 40 -6 76" stroke="var(--frog-ink)" strokeWidth="3" fill="none" opacity="0.6" />
    </g>
  );
}

/* ---------- 28. cg-score-sticker 评分贴「合格」特写（印刷章、角卷着） ---------- */

function CgScoreSticker() {
  return (
    <g>
      <defs>
        <linearGradient id="cg-door-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bluegray-deep)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-door-face)" />
      {/* 门板漆面与木纹 */}
      <path d="M60 40 h680 M60 96 h680" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.16" fill="none" />
      <path d="M120 150 q30 60 6 130 M700 170 q-24 70 4 140" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.1" fill="none" />
      {/* 走廊光从左上来 */}
      <polygon points="0,0 200,0 60,450 0,450" fill="hsl(var(--background))" opacity="0.07" />
      {/* 门牌 604 */}
      <g transform="rotate(-2 132 66)">
        <rect x="86" y="44" width="94" height="44" rx="6" fill="var(--frog-badge)" opacity="0.92" />
        <text x="133" y="76" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--frog-ink)" opacity="0.85">
          604
        </text>
      </g>
      {/* 评分贴：右下角卷起来的那张 */}
      <g transform="rotate(-2 400 250)">
        <path d="M236 160 h330 v130 l-40 40 h-290 Z" fill="hsl(var(--background))" />
        {/* 卷起的角：纸的背面 + 投影 */}
        <path d="M566 290 l-40 40 q34 -2 40 -40 Z" fill="var(--frog-cream-deep)" />
        <path d="M566 290 q-2 40 -42 42 l4 6 q46 -4 44 -46 Z" fill="var(--frog-ink)" opacity="0.22" />
        {/* 印刷表头 */}
        <text x="264" y="196" fontSize="17" fontWeight="700" fill="var(--frog-ink)" opacity="0.82">
          宿舍卫生检查评分贴
        </text>
        <path d="M264 208 h250" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.3" />
        <text x="264" y="232" fontSize="12" fill="var(--frog-ink)" opacity="0.55">
          第 9 周 · 604 · 学自委存档联
        </text>
        <text x="264" y="296" fontSize="11" fill="var(--frog-ink)" opacity="0.4">
          本贴复印无效 · 撕下后不补发
        </text>
        {/* 印刷章：合格 */}
        <g transform="rotate(-7 480 252)">
          <circle cx="480" cy="252" r="52" fill="none" stroke="var(--frog-berry-deep)" strokeWidth="5" opacity="0.85" />
          <circle cx="480" cy="252" r="41" fill="none" stroke="var(--frog-berry-deep)" strokeWidth="1.8" opacity="0.7" strokeDasharray="5 3" />
          <text x="480" y="264" textAnchor="middle" fontSize="32" fontWeight="700" fill="var(--frog-berry-deep)" opacity="0.88">
            合格
          </text>
          <text x="480" y="292" textAnchor="middle" fontSize="9" fill="var(--frog-berry-deep)" opacity="0.6">
            学生自查
          </text>
        </g>
      </g>
      {/* 帘缝外的一点夜色反在门上 */}
      <ellipse cx="620" cy="120" rx="120" ry="60" fill="var(--frog-cream)" opacity="0.05" />
    </g>
  );
}

/* ---------- 29. cg-alarm-1105 十一点零五（桌上闹钟特写，一只手刚按掉） ---------- */

function CgAlarm1105() {
  return (
    <g>
      <defs>
        <linearGradient id="cg-alarm-room" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bluegray)" />
          <stop offset="1" stopColor="var(--frog-cream-deep)" />
        </linearGradient>
        <radialGradient id="cg-alarm-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-berry)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--frog-berry)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-alarm-room)" />
      {/* 背景：天还没全亮的窗与床角 */}
      <rect x="600" y="40" width="170" height="150" rx="8" fill="var(--frog-ink)" opacity="0.55" />
      <rect x="600" y="40" width="170" height="150" rx="8" fill="none" stroke="var(--map-wood)" strokeWidth="6" opacity="0.5" />
      <ellipse cx="120" cy="80" rx="150" ry="90" fill="var(--frog-belly)" opacity="0.35" />
      {/* 桌面 */}
      <path d="M0 296 L800 282 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 336 L800 322 L800 334 L0 348 Z" fill="var(--frog-ink)" opacity="0.1" />
      <path d="M60 406 q140 -10 280 0 M480 396 q120 -8 240 0" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.12" fill="none" />
      {/* 闹钟：双铃、顶钮（刚被按下去）、11:05 的针 */}
      <circle cx="340" cy="212" r="128" fill="url(#cg-alarm-glow)" />
      <g>
        <circle cx="286" cy="106" r="26" fill="var(--frog-berry-deep)" />
        <circle cx="394" cy="106" r="26" fill="var(--frog-berry-deep)" />
        <circle cx="286" cy="106" r="14" fill="var(--frog-berry)" opacity="0.9" />
        <circle cx="394" cy="106" r="14" fill="var(--frog-berry)" opacity="0.9" />
        <rect x="330" y="84" width="20" height="16" rx="4" fill="var(--frog-berry-deep)" />
        <rect x="314" y="308" width="16" height="18" rx="4" fill="var(--frog-berry-deep)" />
        <rect x="350" y="308" width="16" height="18" rx="4" fill="var(--frog-berry-deep)" />
        <circle cx="340" cy="206" r="104" fill="var(--frog-berry)" />
        <circle cx="340" cy="206" r="88" fill="hsl(var(--background))" />
        {/* 刻度与数字 */}
        {[
          [340, 122],
          [424, 206],
          [340, 290],
          [256, 206],
        ].map(([tx, ty]) => (
          <circle key={`tick-${tx}-${ty}`} cx={tx} cy={ty} r="4" fill="var(--frog-ink)" opacity="0.55" />
        ))}
        {[
          [388, 142, "1"],
          [414, 240, "4"],
          [292, 268, "7"],
          [264, 168, "10"],
        ].map(([tx, ty, tn]) => (
          <text key={`num-${tn}`} x={tx} y={ty} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--frog-ink)" opacity="0.5">
            {tn}
          </text>
        ))}
        <text x="340" y="170" textAnchor="middle" fontSize="10" fill="var(--frog-ink)" opacity="0.4">
          蛙鸣牌
        </text>
        {/* 11:05：时针指 11，分针指 1 */}
        <path d="M340 206 L314 166" stroke="var(--frog-ink)" strokeWidth="7" strokeLinecap="round" />
        <path d="M340 206 L379 142" stroke="var(--frog-ink)" strokeWidth="5" strokeLinecap="round" />
        <path d="M340 206 L413 250" stroke="var(--frog-berry-deep)" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
        <circle cx="340" cy="206" r="6" fill="var(--frog-ink)" />
      </g>
      {/* 刚停下的震动摇弧 */}
      <path d="M212 120 q-16 14 -14 34 M468 120 q16 14 14 34" stroke="var(--frog-ink)" strokeWidth="2.6" fill="none" opacity="0.3" strokeLinecap="round" />
      <path d="M196 96 q-22 20 -20 48 M484 96 q22 20 20 48" stroke="var(--frog-ink)" strokeWidth="2.2" fill="none" opacity="0.16" strokeLinecap="round" />
      {/* 刚按掉的那只手：从桌沿伸过来，指节还搭在顶钮上 */}
      <g>
        <path d="M800 470 Q660 330 416 116" stroke="var(--frog-cream)" strokeWidth="40" fill="none" strokeLinecap="round" />
        <ellipse cx="402" cy="104" rx="30" ry="22" fill="var(--frog-cream)" transform="rotate(-38 402 104)" />
        <ellipse cx="382" cy="86" rx="8" ry="6" fill="var(--frog-cream-deep)" transform="rotate(-38 382 86)" />
        <ellipse cx="398" cy="78" rx="8" ry="6" fill="var(--frog-cream-deep)" transform="rotate(-38 398 78)" />
        <ellipse cx="366" cy="112" rx="9" ry="6" fill="var(--frog-blush)" opacity="0.6" transform="rotate(-38 366 112)" />
      </g>
      {/* 桌上的水杯与一页便签 */}
      <rect x="556" y="252" width="52" height="52" rx="7" fill="var(--frog-belly)" opacity="0.95" />
      <path d="M562 268 h40" stroke="var(--frog-matcha-deep)" strokeWidth="3" opacity="0.7" />
      <g transform="rotate(6 686 292)">
        <rect x="650" y="268" width="72" height="66" rx="3" fill="var(--frog-badge)" opacity="0.75" />
        <path d="M660 284 h52 M660 296 h52 M660 308 h34" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.35" />
      </g>
      {/* 天光落在桌沿的一线 */}
      <path d="M0 296 L800 282" stroke="hsl(var(--background))" strokeWidth="3" opacity="0.35" />
    </g>
  );
}

/* ---------- 30. cg-dawn-dorm 天亮之后（宿舍线 ED 定格；线级 endingCg，不进收集册） ---------- */

function CgDawnDorm() {
  return (
    <g>
      {/* 黎明：天光把夜色从走廊一端推到另一端 */}
      <defs>
        <linearGradient id="cg-dawn-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-cream)" />
          <stop offset="1" stopColor="var(--frog-bluegray)" />
        </linearGradient>
        <linearGradient id="cg-dawn-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--frog-cream)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--frog-cream)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-dawn-sky)" />
      {/* 走廊透视线（与断电同构，只是亮了） */}
      <path d="M118 36 L54 322" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.14" fill="none" />
      <path d="M682 36 L746 322" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.14" fill="none" />
      <path d="M54 322 L746 322 L800 450 L0 450 Z" fill="var(--frog-bluegray)" opacity="0.5" />
      {/* 尽头的窗：窗外天亮了 */}
      <rect x="358" y="64" width="84" height="64" rx="4" fill="var(--frog-cream-deep)" />
      <path d="M400 64 L400 128 M358 96 L442 96" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.18" fill="none" />
      <path d="M370 58 L376 46 M398 58 L404 46 M426 58 L432 46" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.14" />
      {/* 房门：门缝有一线晨光 */}
      <rect x="34" y="146" width="36" height="116" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.85" />
      <rect x="82" y="158" width="26" height="88" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.72" />
      <rect x="116" y="166" width="18" height="62" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.6" />
      <rect x="730" y="146" width="36" height="116" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.85" />
      <rect x="692" y="158" width="26" height="88" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.72" />
      <rect x="666" y="166" width="18" height="62" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.6" />
      {/* 晨光从窗里铺进来的光锥与地面反光 */}
      <polygon points="366,128 434,128 560,322 240,322" fill="url(#cg-dawn-beam)" opacity="0.7" />
      <ellipse cx="400" cy="348" rx="230" ry="40" fill="var(--frog-cream)" opacity="0.28" />
      {/* 绿应急灯：还亮着，绿光在天光里淡了一层 */}
      <rect x="612" y="86" width="82" height="30" rx="7" fill="var(--frog-bluegray-deep)" opacity="0.9" />
      <rect x="618" y="92" width="70" height="18" rx="5" fill="var(--frog-matcha)" opacity="0.85" />
      <circle cx="653" cy="101" r="62" fill="var(--frog-matcha)" opacity="0.12" />
      {/* 墙上那个空长方形：评分贴收走了，颜色比四周浅一块 */}
      <rect x="470" y="196" width="66" height="88" rx="2" fill="var(--frog-cream)" opacity="0.5" />
      <path d="M474 200 h58" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.1" />
      {/* 剪影：一只蛙靠在窗前，看着天光那一头 */}
      <g>
        <ellipse cx="300" cy="392" rx="38" ry="30" fill="var(--frog-ink)" opacity="0.92" />
        <circle cx="300" cy="352" r="15" fill="var(--frog-ink)" opacity="0.92" />
        <path d="M300 366 q-6 14 -2 24 M300 366 q6 14 2 24" stroke="var(--frog-ink)" strokeWidth="5" strokeLinecap="round" opacity="0.92" fill="none" />
        <circle cx="294" cy="350" r="2.8" fill="var(--frog-eye)" opacity="0.3" />
        <circle cx="306" cy="350" r="2.8" fill="var(--frog-eye)" opacity="0.3" />
      </g>
      {/* 晨光把剪影也镀上薄薄一层亮边 */}
      <path d="M284 386 q-2 -22 0 -32" stroke="var(--frog-cream)" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" fill="none" />
      <path d="M288 342 q12 -8 24 0" stroke="var(--frog-cream)" strokeWidth="2" strokeLinecap="round" opacity="0.35" fill="none" />
      <ellipse cx="400" cy="300" rx="330" ry="36" fill="var(--frog-cream)" opacity="0.08" />
    </g>
  );
}

/* ---------- 31. cg-thirty-min 内耗那格（计划表特写：周三 21:00 写着「内耗（30min，含复盘）」） ---------- */

/** 计划表的格子内容：没被红笔圈住的格子全是密密麻麻的行程，用两三道笔画示意 */
const THIRTY_MIN_ROWS = ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"];

function CgThirtyMin() {
  return (
    <g>
      {/* 背景：自习桌的木纹面，台灯从左上角打下来 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--map-wood)" opacity="0.55" />
      <path d="M0 96 h800 M0 210 h800 M0 330 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.1" fill="none" />
      <polygon points="0,0 340,0 210,450 0,450" fill="var(--frog-badge)" opacity="0.1" />
      <ellipse cx="120" cy="120" rx="150" ry="110" fill="var(--frog-badge)" opacity="0.12" />

      {/* 道具：摊开的那一页计划表（活页本，左边一圈装订环） */}
      <g transform="rotate(-1.4 400 240)">
        <rect x="150" y="66" width="508" height="326" rx="8" fill="var(--frog-ink)" opacity="0.16" />
        <rect x="142" y="58" width="508" height="326" rx="8" fill="var(--frog-belly)" />
        {/* 装订环 */}
        {[96, 130, 164, 198, 232, 266, 300, 334].map((cy) => (
          <circle key={`ring-${cy}`} cx="158" cy={cy} r="5" fill="none" stroke="var(--frog-bluegray-deep)" strokeWidth="2.4" opacity="0.8" />
        ))}
        {/* 表头 */}
        <text x="420" y="94" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--frog-ink)" opacity="0.85">
          第四周 · 个人时间规划表
        </text>
        <path d="M196 108 h400" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.3" />
        {/* 列头：一 二 三 四 五 六 日（周三在第三列） */}
        {["一", "二", "三", "四", "五", "六", "日"].map((d, i) => (
          <text key={`col-${i}`} x={238 + i * 62} y="126" textAnchor="middle" fontSize="11" fontWeight={i === 2 ? 700 : 400} fill="var(--frog-ink)" opacity={i === 2 ? 0.85 : 0.5}>
            {d}
          </text>
        ))}
        <path d="M220 134 h404" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.35" />
        {/* 网格与格子内容：只有周三 21:00 那格是字 */}
        {THIRTY_MIN_ROWS.map((time, r) => (
          <g key={`row-${r}`}>
            <text x="212" y={154 + r * 30} fontSize="10.5" fill="var(--frog-ink)" opacity="0.7">
              {time}
            </text>
            {[0, 1, 2, 3, 4, 5, 6].map((c) => {
              const cx = 238 + c * 62;
              const cy = 148 + r * 30;
              const hit = r === 4 && c === 2;
              return (
                <g key={`cell-${r}-${c}`}>
                  {hit ? (
                    <g>
                      {/* 内耗那格：红笔圈住，格里的字比所有格子都具体 */}
                      <rect x={cx - 27} y={cy - 3} width="58" height="27" rx="3" fill="var(--frog-berry)" opacity="0.08" />
                      <rect x={cx - 27} y={cy - 3} width="58" height="27" rx="3" fill="none" stroke="var(--frog-berry-deep)" strokeWidth="2.2" opacity="0.9" />
                      <text x={cx + 2} y={cy + 10} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--frog-berry-deep)" opacity="0.95">
                        内耗
                      </text>
                      <text x={cx + 2} y={cy + 21} textAnchor="middle" fontSize="8" fill="var(--frog-berry-deep)" opacity="0.85">
                        （30min，含复盘）
                      </text>
                    </g>
                  ) : (
                    /* 其余格子：行程密到没有缝，只有笔画没有字 */
                    <g opacity={r % 2 === 0 ? 0.4 : 0.32}>
                      <path d={`M${cx - 20} ${cy + 8} h${34 + (r * 7 + c * 5) % 14}`} stroke="var(--frog-ink)" strokeWidth="3.4" strokeLinecap="round" />
                      <path d={`M${cx - 20} ${cy + 16} h${22 + (r * 5 + c * 3) % 16}`} stroke="var(--frog-ink)" strokeWidth="3.4" strokeLinecap="round" />
                    </g>
                  )}
                  <rect x={cx - 29} y={cy - 4} width="62" height="29" rx="2" fill="none" stroke="var(--frog-ink)" strokeWidth="0.7" opacity="0.16" />
                </g>
              );
            })}
          </g>
        ))}
        {/* 页脚一行小字：备注栏全是空的 */}
        <text x="588" y="118" fontSize="9" fill="var(--frog-ink)" opacity="0.4">
          备注
        </text>
        <rect x="574" y="124" width="50" height="252" rx="2" fill="none" stroke="var(--frog-ink)" strokeWidth="0.9" opacity="0.2" />
      </g>

      {/* 道具：搁在纸角的红笔，笔帽刚拔下来放在旁边 */}
      <g transform="rotate(24 660 396)">
        <rect x="612" y="388" width="96" height="9" rx="4.5" fill="var(--frog-berry-deep)" />
        <rect x="700" y="386" width="16" height="13" rx="5" fill="var(--frog-berry)" />
        <rect x="612" y="390" width="30" height="5" rx="2.5" fill="hsl(var(--background))" opacity="0.4" />
      </g>
      <ellipse cx="730" cy="418" rx="17" ry="6" fill="var(--frog-berry-deep)" opacity="0.5" />
      {/* 光效：台灯把周三那一列照得比别处亮一点 */}
      <path d="M282 40 q54 200 30 360" stroke="hsl(var(--background))" strokeWidth="20" fill="none" opacity="0.08" />
    </g>
  );
}

/* ---------- 32. cg-red-circles 两列分数（草稿纸两列对比，红笔圈着） ---------- */

/** 两列分数：左列是上一次，右列是这一次；红笔圈的是不该掉的那几格 */
const RED_CIRCLES_LEFT = ["61", "88", "73", "92", "55", "84", "79", "67"];
const RED_CIRCLES_RIGHT = ["94", "90", "97", "88", "93", "99", "91", "96"];

function CgRedCircles() {
  return (
    <g>
      {/* 背景：深一点的桌面，只有一盏灯 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--map-wood)" opacity="0.42" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.16" />
      <ellipse cx="400" cy="120" rx="280" ry="150" fill="var(--frog-badge)" opacity="0.12" />
      <polygon points="0,0 250,0 130,450 0,450" fill="hsl(var(--background))" opacity="0.06" />

      {/* 道具：对折过又展开的草稿纸 */}
      <g transform="rotate(1.8 400 240)">
        <rect x="168" y="72" width="468" height="322" rx="6" fill="var(--frog-ink)" opacity="0.18" />
        <rect x="160" y="64" width="468" height="322" rx="6" fill="var(--frog-belly)" />
        {/* 中缝折痕 */}
        <path d="M394 64 v322" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.1" />
        {/* 两列的列头 */}
        <text x="278" y="102" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
          上次
        </text>
        <text x="522" y="102" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
          这次
        </text>
        <path d="M216 114 h124 M460 114 h124" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.3" />
        {/* 两列分数：高低不平，红笔圈住落差 */}
        {RED_CIRCLES_LEFT.map((num, i) => {
          const ly = 142 + i * 32;
          return (
            <g key={`lc-${i}`}>
              <text x="278" y={ly} textAnchor="middle" fontSize="21" fontWeight="700" fill="var(--frog-ink)" opacity="0.82">
                {num}
              </text>
              <text x="522" y={ly} textAnchor="middle" fontSize="21" fontWeight="700" fill="var(--frog-ink)" opacity="0.82">
                {RED_CIRCLES_RIGHT[i]}
              </text>
              {/* 圈：左边圈住掉下来的两格，右边圈住一次不该扣分的 */}
              {i === 0 && <ellipse cx="278" cy={ly - 7} rx="30" ry="17" fill="none" stroke="var(--frog-berry-deep)" strokeWidth="2.6" opacity="0.9" transform={`rotate(-4 278 ${ly - 7})`} />}
              {i === 4 && <ellipse cx="278" cy={ly - 7} rx="30" ry="17" fill="none" stroke="var(--frog-berry-deep)" strokeWidth="2.6" opacity="0.9" transform={`rotate(3 278 ${ly - 7})`} />}
              {i === 3 && <ellipse cx="522" cy={ly - 7} rx="30" ry="17" fill="none" stroke="var(--frog-berry-deep)" strokeWidth="2.2" opacity="0.8" transform={`rotate(-3 522 ${ly - 7})`} />}
              {/* 落差箭头与红笔小字 */}
              {i === 0 && (
                <g>
                  <path d={`M306 ${ly - 4} Q400 ${ly - 26} 494 ${ly - 2}`} stroke="var(--frog-berry-deep)" strokeWidth="1.8" fill="none" opacity="0.75" strokeDasharray="5 4" />
                  <text x="400" y={ly - 34} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-berry-deep)" opacity="0.85">
                    +33
                  </text>
                </g>
              )}
              {i === 4 && (
                <text x="560" y={ly + 4} fontSize="10.5" fill="var(--frog-berry-deep)" opacity="0.8">
                  这不该错
                </text>
              )}
              {i === 3 && (
                <text x="562" y={ly + 4} fontSize="10.5" fill="var(--frog-berry-deep)" opacity="0.8">
                  差 1.5
                </text>
              )}
            </g>
          );
        })}
        {/* 页脚：撕纸边的毛边 */}
        <path d="M160 386 l24 8 l30 -10 l26 12 l34 -9 l28 10 l36 -11 l30 9 l38 -10 l32 9 l38 -9 l30 8 l34 -8 l40 9 l28 -9 l32 6" stroke="var(--frog-ink)" strokeWidth="1.6" fill="none" opacity="0.25" />
      </g>

      {/* 道具：横躺在纸下的红笔，笔杆被捏得发亮 */}
      <g transform="rotate(-9 400 412)">
        <rect x="252" y="404" width="270" height="10" rx="5" fill="var(--frog-berry-deep)" />
        <rect x="252" y="406" width="270" height="3" rx="1.5" fill="hsl(var(--background))" opacity="0.35" />
        <rect x="516" y="402" width="18" height="14" rx="6" fill="var(--frog-berry)" />
      </g>
      {/* 光效：灯从正上打下来，两列分数谁也躲不开 */}
      <ellipse cx="400" cy="60" rx="220" ry="46" fill="var(--frog-badge)" opacity="0.14" />
    </g>
  );
}

/* ---------- 33. cg-17-windows 十七扇窗（图书馆侧面亮窗，线级结局定格） ---------- */

/** 亮着的十七扇窗：5 行 × 8 列的窗格里，这 17 个序号还亮着 */
const WINDOWS_LIT = [3, 5, 8, 10, 13, 16, 18, 21, 23, 26, 29, 31, 33, 35, 37, 38, 39];

function Cg17Windows() {
  return (
    <g>
      <defs>
        <linearGradient id="cg-windows-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray-deep)" />
        </linearGradient>
        <radialGradient id="cg-windows-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-windows-sky)" />
      {/* 夜空：月牙、薄云、几粒星 */}
      <path d="M694 44 a24 24 0 1 0 14 42 a19 19 0 1 1 -14 -42 Z" fill="var(--frog-belly)" opacity="0.78" />
      <ellipse cx="560" cy="86" rx="46" ry="8" fill="var(--frog-bluegray)" opacity="0.35" />
      <ellipse cx="210" cy="54" rx="52" ry="7" fill="var(--frog-bluegray)" opacity="0.28" />
      {[
        [116, 40],
        [252, 78],
        [352, 34],
        [488, 62],
        [84, 116],
        [636, 30],
        [420, 88],
      ].map(([sx, sy], i) => (
        <circle key={`star-${i}`} cx={sx} cy={sy} r="1.8" fill="var(--frog-belly)" opacity="0.5" />
      ))}

      {/* 图书馆侧楼：整面窗格，闭馆后只剩十七扇还亮着 */}
      <rect x="90" y="96" width="620" height="312" rx="6" fill="var(--frog-bluegray-deep)" />
      <rect x="90" y="96" width="620" height="20" rx="6" fill="var(--frog-bluegray)" opacity="0.5" />
      {WINDOWS_LIT.map((lit) => {
        const row = Math.floor(lit / 8);
        const col = lit % 8;
        const wx = 119 + col * 74;
        const wy = 126 + row * 54;
        const variant = lit % 3;
        return (
          <g key={`lit-${lit}`}>
            {/* 窗里的暖光 */}
            <rect x={wx} y={wy} width="44" height="30" rx="2" fill="var(--frog-badge)" opacity="0.75" />
            <ellipse cx={wx + 22} cy={wy + 15} rx="30" ry="16" fill="url(#cg-windows-glow)" opacity="0.4" />
            {/* 每一扇后面都有一只在做题的蛙：头与肩的剪影，偶尔是桌角的书堆 */}
            {variant === 2 ? (
              <g opacity="0.75">
                <rect x={wx + 8} y={wy + 19} width="12" height="4" rx="1" fill="var(--frog-ink)" />
                <rect x={wx + 22} y={wy + 20} width="14" height="4" rx="1" fill="var(--frog-ink)" />
              </g>
            ) : (
              <g opacity="0.72">
                <ellipse cx={wx + 22} cy={wy + 24} rx="7.5" ry="5.5" fill="var(--frog-ink)" />
                <circle cx={wx + 22} cy={wy + 15} r="4.2" fill="var(--frog-ink)" />
              </g>
            )}
            <rect x={wx} y={wy} width="44" height="30" rx="2" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.55" />
          </g>
        );
      })}
      {/* 暗着的窗格：比夜色深一点 */}
      {[0, 1, 2, 4, 6, 7, 9, 11, 12, 14, 15, 17, 19, 20, 22, 24, 25, 27, 28, 30, 32, 34, 36].map((idx) => {
        const row = Math.floor(idx / 8);
        const col = idx % 8;
        return (
          <rect
            key={`dark-${idx}`}
            x={119 + col * 74}
            y={126 + row * 54}
            width="44"
            height="30"
            rx="2"
            fill="var(--frog-ink)"
            opacity="0.85"
          />
        );
      })}
      {/* 楼底的门与台阶：门口的灯是整栋楼最后一盏公共的灯 */}
      <rect x="372" y="356" width="56" height="52" rx="3" fill="var(--frog-ink)" opacity="0.9" />
      <rect x="380" y="364" width="40" height="44" rx="2" fill="var(--frog-badge)" opacity="0.4" />
      <rect x="356" y="404" width="88" height="5" rx="2.5" fill="var(--frog-khaki-deep)" opacity="0.9" />
      <text x="400" y="350" textAnchor="middle" fontSize="11" fill="var(--frog-cream)" opacity="0.55">
        图书馆
      </text>

      {/* 地面：路、路灯、树影 */}
      <path d="M0 408 L800 408 L800 450 L0 450 Z" fill="var(--frog-ink)" opacity="0.72" />
      <path d="M0 432 h800" stroke="var(--frog-cream)" strokeWidth="2" opacity="0.07" />
      <rect x="726" y="312" width="7" height="98" rx="3" fill="var(--frog-ink)" opacity="0.85" />
      <circle cx="729" cy="306" r="10" fill="var(--frog-badge)" opacity="0.7" />
      <ellipse cx="712" cy="424" rx="52" ry="10" fill="var(--frog-badge)" opacity="0.12" />
      <ellipse cx="60" cy="416" rx="44" ry="26" fill="var(--frog-ink)" opacity="0.6" />

      {/* 走出图书馆又回头的那只：包还没放下来，仰着头在数 */}
      <g>
        <ellipse cx="196" cy="428" rx="46" ry="8" fill="var(--frog-ink)" opacity="0.2" />
        <ellipse cx="196" cy="408" rx="21" ry="18" fill="var(--frog-ink)" />
        {/* 仰头：头抬高一点，眼睛朝着十七扇亮窗 */}
        <circle cx="196" cy="382" r="12" fill="var(--frog-ink)" />
        <circle cx="192" cy="379" r="2.4" fill="var(--frog-belly)" opacity="0.5" />
        <circle cx="201" cy="379" r="2.4" fill="var(--frog-belly)" opacity="0.5" />
        <rect x="216" y="398" width="24" height="30" rx="8" fill="var(--frog-bag)" opacity="0.95" />
        <path d="M178 414 q-7 7 -12 13" stroke="var(--frog-ink)" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
      {/* 光效：十七扇窗的光落在草地上，连成一小片暖 */}
      <ellipse cx="300" cy="438" rx="180" ry="9" fill="var(--frog-badge)" opacity="0.08" />
    </g>
  );
}


/* ---------- 34. cg-menu-board 元气煲（食堂线）---------- */

function CgMenuBoard() {
  return (
    <g>
      {/* 背景虚化的窗口与蒸汽 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" opacity="0.5" />
      <path d="M120 450 q30 -70 8 -128 q-16 -44 12 -92" stroke="hsl(var(--background))" strokeWidth="26" opacity="0.16" fill="none" />
      <path d="M690 450 q-26 -80 6 -150 q22 -46 -6 -96" stroke="hsl(var(--background))" strokeWidth="22" opacity="0.14" fill="none" />
      {/* 菜单牌：红底金字，占满中景 */}
      <g>
        <rect x="150" y="86" width="500" height="230" rx="10" fill="var(--frog-berry-deep)" />
        <rect x="162" y="98" width="476" height="206" rx="6" fill="none" stroke="var(--frog-badge)" strokeWidth="4" opacity="0.8" />
        <text x="400" y="212" textAnchor="middle" fontSize="96" fontWeight="800" fill="var(--frog-badge)" letterSpacing="18">
          元气煲
        </text>
        {/* 角落撕掉一半的旧名贴纸：「奋斗煲」只剩一半 */}
        <g>
          <rect x="562" y="286" width="104" height="34" rx="3" fill="var(--frog-cream)" />
          <path d="M562 286 L666 286 L614 320 Z" fill="var(--frog-cream-deep)" opacity="0.55" />
          <text x="646" y="310" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
            煲
          </text>
          <path d="M562 286 L622 320 L578 320 Z" fill="var(--frog-berry-deep)" opacity="0.75" />
          <path d="M666 286 l-14 34 l-6 -34 Z" fill="var(--frog-cream-deep)" opacity="0.5" />
        </g>
        {/* 牌下挂绳与挂钩 */}
        <path d="M250 86 L250 60 M550 86 L550 60" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.5" />
        <rect x="238" y="52" width="24" height="8" rx="3" fill="var(--frog-ink)" opacity="0.5" />
        <rect x="538" y="52" width="24" height="8" rx="3" fill="var(--frog-ink)" opacity="0.5" />
      </g>
      {/* 牌下的窗口台面与队伍的模糊背影 */}
      <rect x="0" y="330" width="800" height="120" fill="var(--frog-ink)" opacity="0.35" />
      {[88, 216, 330, 636, 742].map((x, i) => (
        <g key={`q-${i}`} opacity="0.5">
          <ellipse cx={x} cy={368 + (i % 2) * 14} rx="30" ry="22" fill="var(--frog-bluegray-deep)" />
          <circle cx={x} cy={344 + (i % 2) * 14} r="14" fill="var(--frog-bluegray-deep)" />
        </g>
      ))}
      {/* 红光把队伍染成同一个颜色 */}
      <rect x="0" y="316" width="800" height="134" fill="var(--frog-berry)" opacity="0.1" />
    </g>
  );
}

/* ---------- 35. cg-half-bowl 半格饭盆（食堂线）---------- */

function CgHalfBowl() {
  return (
    <g>
      {/* 后厨的一盏灯从斜上方照过来，桌面被照出一块亮区 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.35" />
      <ellipse cx="430" cy="210" rx="300" ry="180" fill="var(--frog-badge)" opacity="0.08" />
      {/* 木桌面 */}
      <path d="M0 190 L800 168 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 232 L800 214" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.12" fill="none" />
      <path d="M0 356 L800 344" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.1" fill="none" />
      {/* 他那只饭盆：往你这边推了半格，还在亮区外沿 */}
      <g>
        <ellipse cx="322" cy="268" rx="86" ry="34" fill="var(--frog-cream-deep)" />
        <ellipse cx="322" cy="258" rx="86" ry="32" fill="var(--frog-cream)" />
        <ellipse cx="322" cy="258" rx="68" ry="24" fill="var(--frog-berry)" opacity="0.4" />
        <ellipse cx="322" cy="256" rx="52" ry="16" fill="var(--frog-berry-deep)" opacity="0.35" />
        {/* 盆里的饭已经见底 */}
        <path d="M282 252 q40 14 80 0" stroke="var(--frog-cream-deep)" strokeWidth="5" fill="none" opacity="0.5" />
      </g>
      {/* 你那只饭盆：满的，两盆之间空着半格 */}
      <g>
        <ellipse cx="556" cy="252" rx="92" ry="36" fill="var(--frog-cream-deep)" />
        <ellipse cx="556" cy="242" rx="92" ry="34" fill="var(--frog-cream)" />
        <ellipse cx="556" cy="240" rx="74" ry="26" fill="hsl(var(--background))" opacity="0.9" />
        <path d="M496 232 q30 -12 60 -8 q34 4 58 14" stroke="var(--frog-berry)" strokeWidth="4" fill="none" opacity="0.5" />
        <ellipse cx="556" cy="244" rx="30" ry="10" fill="var(--frog-matcha)" opacity="0.4" />
      </g>
      {/* 半格的空档：桌面上两道水痕之间没有饭粒 */}
      <rect x="408" y="246" width="56" height="34" rx="4" fill="var(--frog-ink)" opacity="0.06" />
      {/* 锅底还剩两口 */}
      <g>
        <ellipse cx="180" cy="392" rx="120" ry="34" fill="var(--frog-bluegray-deep)" />
        <ellipse cx="180" cy="384" rx="120" ry="32" fill="var(--frog-bluegray)" />
        <ellipse cx="180" cy="386" rx="92" ry="22" fill="var(--frog-ink)" opacity="0.5" />
        {/* 锅壁上挂着的两撮 */}
        <ellipse cx="150" cy="380" rx="16" ry="7" fill="var(--frog-cream)" opacity="0.75" />
        <ellipse cx="214" cy="384" rx="13" ry="6" fill="var(--frog-cream)" opacity="0.6" />
      </g>
      {/* 一缕蒸汽 */}
      <path d="M322 240 q14 -22 -2 -44 q-14 -20 4 -42" stroke="hsl(var(--background))" strokeWidth="7" opacity="0.16" fill="none" />
      {/* 他的筷子搭在盆沿 */}
      <path d="M244 236 L342 250" stroke="var(--map-wood)" strokeWidth="5" strokeLinecap="round" opacity="0.85" />
      <path d="M248 242 L346 256" stroke="var(--map-wood)" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
    </g>
  );
}

/* ---------- 36. cg-lamp-off 最后一盏灯（食堂线 ED 定格，线级 endingCg，不进收集册）---------- */

function CgLampOff() {
  return (
    <g>
      {/* 后厨角落：灯刚灭的那一瞬 */}
      <defs>
        <linearGradient id="cg-lamoff-room" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bluegray-deep)" />
          <stop offset="1" stopColor="var(--frog-ink)" />
        </linearGradient>
        <radialGradient id="cg-lamoff-ghost" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-lamoff-room)" />
      {/* 三根管子：线从配电箱底下走，绕过它们 */}
      <path d="M0 120 h180 q10 0 10 10 v60 q0 10 10 10 h96" stroke="var(--frog-bluegray)" strokeWidth="16" opacity="0.5" fill="none" />
      <path d="M0 210 h230 q10 0 10 -10 v-40" stroke="var(--frog-bluegray)" strokeWidth="13" opacity="0.4" fill="none" />
      <path d="M0 296 h206 q10 0 10 -12 v-70 q0 -12 10 -12 h110" stroke="var(--frog-bluegray)" strokeWidth="18" opacity="0.45" fill="none" />
      {/* 配电箱 */}
      <rect x="316" y="236" width="64" height="88" rx="4" fill="var(--frog-bluegray-deep)" />
      <rect x="324" y="244" width="48" height="72" rx="2" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.5" />
      <circle cx="348" cy="280" r="5" fill="var(--frog-ink)" opacity="0.6" />
      {/* 灯泡悬在池子上方，已经暗了；残光正在散 */}
      <path d="M520 60 v64" stroke="var(--frog-ink)" strokeWidth="2.5" opacity="0.6" />
      <path d="M508 132 q12 -14 24 0 l-4 18 q-8 8 -16 0 Z" fill="var(--frog-cream)" opacity="0.6" />
      <circle cx="520" cy="142" r="74" fill="url(#cg-lamoff-ghost)" opacity="0.55" />
      {/* 拉线开关：一只手停在半空，线还在晃 */}
      <g>
        <path d="M600 96 q20 6 22 30 q2 18 -14 28" stroke="var(--frog-ink)" strokeWidth="3" fill="none" opacity="0.65" />
        <ellipse cx="608" cy="158" rx="15" ry="11" fill="var(--frog-bluegray)" opacity="0.9" />
        <circle cx="604" cy="152" r="3" fill="var(--frog-eye)" opacity="0.35" />
      </g>
      {/* 照过的地方只剩轮廓：洗碗池 / 灶台边 / 那摞饭盒 */}
      <g opacity="0.55">
        <rect x="430" y="268" width="180" height="66" rx="4" fill="var(--frog-bluegray-deep)" />
        <ellipse cx="520" cy="268" rx="86" ry="10" fill="var(--frog-bluegray)" opacity="0.7" />
        <path d="M470 262 q24 -12 48 0" stroke="var(--frog-cream)" strokeWidth="2" opacity="0.3" fill="none" />
        <rect x="430" y="334" width="180" height="10" rx="3" fill="var(--map-wood)" opacity="0.7" />
      </g>
      <g opacity="0.5">
        {[0, 1, 2].map((n) => (
          <g key={`box-${n}`}>
            <rect x="648" y={318 - n * 22} width="76" height="20" rx="3" fill="var(--frog-bluegray-deep)" />
            <rect x="652" y={322 - n * 22} width="68" height="4" rx="2" fill="var(--frog-cream)" opacity="0.3" />
          </g>
        ))}
      </g>
      {/* 地面上那圈正在退掉的暖光 */}
      <ellipse cx="520" cy="416" rx="200" ry="26" fill="var(--frog-badge)" opacity="0.07" />
    </g>
  );
}


/* ---------- 37. cg-balloon-43 剩余四十三（社团线）---------- */

function CgBalloon43() {
  return (
    <g>
      {/* 走廊尽头：坏灯管一闪一闪 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.28" />
      <rect x="120" y="36" width="180" height="9" rx="4" fill="hsl(var(--background))" opacity="0.9" />
      <ellipse cx="210" cy="66" rx="120" ry="22" fill="hsl(var(--background))" opacity="0.2" />
      <rect x="430" y="36" width="180" height="9" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.7" />
      {/* 打气的手与半只气球：刚爆掉一只，皮还挂着 */}
      <g>
        <path d="M330 148 q-18 22 -6 44 q10 18 32 14" stroke="var(--frog-bluegray-deep)" strokeWidth="12" strokeLinecap="round" fill="none" opacity="0.9" />
        <ellipse cx="368" cy="206" rx="17" ry="14" fill="var(--frog-bluegray)" opacity="0.95" />
        <path d="M382 196 L412 184 L398 206 Z" fill="var(--frog-berry)" opacity="0.8" />
      </g>
      {/* 纸箱：「迎新晚会布置（剩余 43 个）」 */}
      <g>
        <rect x="210" y="250" width="300" height="160" rx="6" fill="var(--map-wood)" />
        <rect x="210" y="250" width="300" height="160" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="2.5" opacity="0.35" />
        <rect x="234" y="272" width="252" height="74" rx="3" fill="var(--frog-cream)" opacity="0.95" />
        <text x="360" y="302" textAnchor="middle" fontSize="23" fontWeight="700" fill="var(--frog-ink)">
          迎新晚会布置
        </text>
        <text x="360" y="332" textAnchor="middle" fontSize="28" fontWeight="800" fill="var(--frog-berry-deep)">
          剩余 43 个
        </text>
        {/* 箱里打爆的气球皮：叠着，颜色都褪了 */}
        {[0, 1, 2, 3].map((i) => (
          <path key={`skin-${i}`} d={`M${248 + i * 34} 404 q12 -14 24 0`} stroke="var(--frog-berry)" strokeWidth="3" fill="none" opacity={0.5 - i * 0.08} />
        ))}
      </g>
      {/* 地上又一只刚爆的 */}
      <path d="M560 414 q10 -14 22 -2 q8 8 -4 12" stroke="var(--frog-berry)" strokeWidth="4" fill="none" opacity="0.6" />
      {/* 一只没爆的靠在箱边 */}
      <ellipse cx="552" cy="396" rx="22" ry="27" fill="var(--frog-berry)" opacity="0.75" />
      <path d="M552 423 q3 10 0 18" stroke="var(--frog-ink)" strokeWidth="2" fill="none" opacity="0.4" />
    </g>
  );
}

/* ---------- 38. cg-eval-menu 下拉菜单（社团线）---------- */

function CgEvalMenu() {
  return (
    <g>
      {/* 桌上的评价表：俯视微斜 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.12" />
      <g transform="rotate(-2.5 400 240)">
        <rect x="128" y="70" width="544" height="320" rx="8" fill="var(--frog-cream)" />
        <rect x="128" y="70" width="544" height="320" rx="8" fill="none" stroke="var(--frog-ink)" strokeWidth="2.5" opacity="0.3" />
        <rect x="152" y="92" width="200" height="10" rx="4" fill="var(--frog-ink)" opacity="0.55" />
        <text x="366" y="102" fontSize="14" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
          部门评价表
        </text>
        <path d="M152 124 h496" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.25" />
        {/* 评语一栏：情绪稳定，能有效带动部门氛围，本学期值班全勤 */}
        <text x="156" y="152" fontSize="13" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
          评语：
        </text>
        <text x="196" y="152" fontSize="14" fontWeight="600" fill="var(--frog-ink)">
          情绪稳定，能有效带动部门氛围，本学期值班全勤。
        </text>
        <path d="M152 168 h496" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.18" />
        {/* 改进方向：一个被展开的下拉菜单 */}
        <text x="156" y="204" fontSize="13" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
          改进方向：
        </text>
        <g>
          <rect x="264" y="186" width="180" height="30" rx="4" fill="hsl(var(--background))" opacity="0.85" />
          <rect x="264" y="186" width="180" height="30" rx="4" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.4" />
          <text x="276" y="207" fontSize="14" fontWeight="600" fill="var(--frog-ink)">
            沟通技巧
          </text>
          <path d="M424 196 l8 9 l8 -9" stroke="var(--frog-ink)" strokeWidth="2.4" fill="none" opacity="0.6" />
          {/* 展开的选项列表：三个 */}
          <g>
            <rect x="264" y="216" width="180" height="28" rx="3" fill="hsl(var(--background))" opacity="0.95" />
            <text x="276" y="236" fontSize="13.5" fontWeight="500" fill="var(--frog-ink)" opacity="0.55">
              无
            </text>
            <rect x="264" y="244" width="180" height="28" rx="3" fill="hsl(var(--primary))" opacity="0.16" />
            <text x="276" y="264" fontSize="13.5" fontWeight="600" fill="hsl(var(--primary))">
              沟通技巧
            </text>
            <rect x="264" y="272" width="180" height="28" rx="3" fill="hsl(var(--background))" opacity="0.95" />
            <text x="276" y="292" fontSize="13.5" fontWeight="500" fill="var(--frog-ink)" opacity="0.55">
              时间管理
            </text>
          </g>
        </g>
        <path d="M152 318 h496" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.18" />
        {/* 落款与「已阅读确认」勾选框 */}
        <text x="156" y="344" fontSize="12" fontWeight="600" fill="var(--frog-ink)" opacity="0.5">
          总务处备案 · 学期末
        </text>
        <rect x="560" y="330" width="18" height="18" rx="3" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.45" />
        <path d="M563 340 l4 6 l9 -12" stroke="var(--frog-berry)" strokeWidth="2.6" fill="none" opacity="0.8" />
      </g>
      {/* 桌沿一支没盖帽的红笔 */}
      <g transform="rotate(6 640 380)">
        <rect x="596" y="372" width="120" height="9" rx="4.5" fill="var(--frog-berry-deep)" />
        <rect x="596" y="372" width="14" height="9" rx="4.5" fill="var(--frog-cream-deep)" />
      </g>
    </g>
  );
}

/* ---------- 39. cg-ten-minutes 没人回去开（社团线 ED 定格，线级 endingCg，不进收集册）---------- */

function CgTenMinutes() {
  return (
    <g>
      {/* 灯灭到一半的活动室：黑着的那一半更黑 */}
      <defs>
        <linearGradient id="cg-tenmin-room" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray-deep)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-tenmin-room)" />
      {/* 天花灯管：一半亮一半灭（十一点前的第一次） */}
      {[
        [90, true],
        [270, false],
        [450, false],
        [640, true],
      ].map(([x, on], i) => (
        <g key={`tube2-${i}`}>
          <rect x={Number(x)} y="30" width="130" height="8" rx="4" fill={on ? "hsl(var(--background))" : "var(--frog-bluegray-deep)"} opacity={on ? 0.9 : 0.55} />
          {on && <ellipse cx={Number(x) + 65} cy="56" rx="96" ry="18" fill="hsl(var(--background))" opacity="0.12" />}
        </g>
      ))}
      {/* 窗外夜色与一点路灯光斜进来 */}
      <rect x="604" y="92" width="130" height="128" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.85" />
      <path d="M604 156 h130 M669 92 v128" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.5" fill="none" />
      <polygon points="614,220 700,220 780,450 480,450" fill="var(--frog-badge)" opacity="0.05" />
      {/* 投影幕：黑着，残影还在 */}
      <rect x="180" y="80" width="380" height="176" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.5" />
      <path d="M180 168 h380" stroke="hsl(var(--background))" strokeWidth="1.6" opacity="0.06" fill="none" />
      {/* 长桌：空着，桌上只有一只没收走的杯子 */}
      <rect x="120" y="316" width="560" height="11" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.75" />
      <rect x="128" y="327" width="544" height="18" rx="2" fill="var(--frog-bluegray-deep)" opacity="0.6" />
      <g>
        <rect x="472" y="300" width="24" height="17" rx="2.5" fill="var(--frog-cream)" opacity="0.5" />
        <path d="M472 300 q-6 -10 0 -18" stroke="hsl(var(--background))" strokeWidth="2" opacity="0.12" fill="none" />
      </g>
      {/* 走廊那头：应急指示牌的绿光（全楼没排班的安静里，它是唯一自己亮着的） */}
      <rect x="736" y="196" width="34" height="20" rx="3" fill="var(--frog-matcha)" opacity="0.8" />
      <circle cx="753" cy="206" r="30" fill="var(--frog-matcha)" opacity="0.1" />
      {/* 地面：一点被路灯照过的余光 */}
      <ellipse cx="640" cy="410" rx="180" ry="26" fill="var(--frog-badge)" opacity="0.06" />
    </g>
  );
}


/* ---------- 40. cg-report-page 体检报告（操场线）---------- */

function CgReportPage() {
  return (
    <g>
      {/* 草坪上摊开的手：屏幕停在体检报告那一页 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-berry)" opacity="0.1" />
      {/* 手机（屏幕占中，微斜） */}
      <g transform="rotate(-3 400 230)">
        <rect x="238" y="76" width="324" height="330" rx="26" fill="var(--frog-ink)" />
        <rect x="252" y="90" width="296" height="302" rx="18" fill="hsl(var(--background))" />
        {/* 体检报告页 */}
        <rect x="268" y="112" width="264" height="26" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.5" />
        <text x="400" y="131" textAnchor="middle" fontSize="16" fontWeight="700" fill="hsl(var(--background))">
          健康体检报告（复查）
        </text>
        <path d="M272 152 h256" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.2" />
        {[168, 190, 212, 234, 256].map((y, i) => (
          <g key={`row-${i}`}>
            <rect x="272" y={y} width="86" height="9" rx="3" fill="var(--frog-ink)" opacity="0.28" />
            <rect x="380" y={y} width="60" height="9" rx="3" fill="var(--frog-ink)" opacity="0.16" />
            <rect x="456" y={y} width={i === 2 ? 72 : 52} height="9" rx="3" fill={i === 2 ? "var(--frog-berry)" : "var(--frog-matcha-deep)"} opacity="0.6" />
          </g>
        ))}
        {/* 压着的那条辅导员消息：红点三天没点 */}
        <g>
          <rect x="268" y="282" width="264" height="86" rx="10" fill="var(--frog-cream-deep)" />
          <circle cx="292" cy="304" r="13" fill="var(--frog-berry)" opacity="0.85" />
          <path d="M292 312 q-6 6 -12 4" stroke="var(--frog-berry)" strokeWidth="2" fill="none" opacity="0.4" />
          <rect x="316" y="296" width="150" height="9" rx="3" fill="var(--frog-ink)" opacity="0.5" />
          <rect x="316" y="314" width="196" height="9" rx="3" fill="var(--frog-ink)" opacity="0.32" />
          <rect x="316" y="332" width="120" height="9" rx="3" fill="var(--frog-ink)" opacity="0.32" />
          {/* 红点徽标：3 */}
          <circle cx="522" cy="292" r="11" fill="var(--frog-berry)" />
          <text x="522" y="297" textAnchor="middle" fontSize="13" fontWeight="800" fill="hsl(var(--background))">
            3
          </text>
        </g>
        {/* 底栏时间：今天 18:47 */}
        <rect x="268" y="374" width="264" height="8" rx="4" fill="var(--frog-ink)" opacity="0.12" />
      </g>
      {/* 草从手机边冒出来两撮 */}
      <path d="M188 448 l6 -26 M204 448 l-4 -32 M222 448 l4 -20" stroke="var(--map-grass-deep)" strokeWidth="4" opacity="0.65" />
      <path d="M596 448 l-6 -26 M580 448 l4 -32 M562 448 l-4 -20" stroke="var(--map-grass-deep)" strokeWidth="4" opacity="0.65" />
      {/* 指尖按在屏幕边缘 */}
      <ellipse cx="560" cy="404" rx="34" ry="16" fill="var(--frog-bluegray-deep)" opacity="0.9" transform="rotate(-16 560 404)" />
    </g>
  );
}

/* ---------- 41. cg-two-bottles 两瓶汽水（操场线）---------- */

function CgTwoBottles() {
  return (
    <g>
      {/* 第二天傍晚：草坪边，两瓶汽水并排立着 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-berry)" opacity="0.08" />
      <ellipse cx="400" cy="210" rx="320" ry="150" fill="var(--frog-badge)" opacity="0.08" />
      {/* 草地 */}
      <path d="M0 286 L800 268 L800 450 L0 450 Z" fill="var(--map-grass)" />
      <path d="M0 330 L800 316" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.1" fill="none" />
      {/* 两瓶汽水：一满一空 */}
      <g>
        {/* 满的那瓶（他的） */}
        <g transform="rotate(-2 330 320)">
          <rect x="296" y="238" width="68" height="168" rx="20" fill="var(--frog-matcha)" opacity="0.85" />
          <rect x="296" y="238" width="68" height="168" rx="20" fill="none" stroke="var(--frog-matcha-deep)" strokeWidth="2.5" opacity="0.7" />
          <rect x="308" y="196" width="44" height="44" rx="6" fill="var(--frog-matcha-deep)" opacity="0.9" />
          <rect x="322" y="188" width="16" height="10" rx="4" fill="var(--frog-ink)" opacity="0.5" />
          <rect x="306" y="292" width="48" height="60" rx="4" fill="var(--frog-cream)" opacity="0.9" />
          <text x="330" y="316" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
            汽水
          </text>
          <path d="M316 328 h28 M318 338 h24" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.3" fill="none" />
        </g>
        {/* 空的那瓶（你的，已开） */}
        <g transform="rotate(3 470 330)">
          <rect x="436" y="252" width="68" height="150" rx="20" fill="var(--frog-berry)" opacity="0.8" />
          <rect x="436" y="252" width="68" height="150" rx="20" fill="none" stroke="var(--frog-berry-deep)" strokeWidth="2.5" opacity="0.7" />
          <rect x="448" y="216" width="44" height="40" rx="6" fill="var(--frog-berry-deep)" opacity="0.9" />
          {/* 瓶盖已拧开，斜搭在瓶边 */}
          <circle cx="516" cy="230" r="12" fill="var(--frog-cream)" opacity="0.9" />
          <path d="M508 224 h16 M508 230 h16" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.3" fill="none" />
          <rect x="446" y="300" width="48" height="58" rx="4" fill="var(--frog-cream)" opacity="0.85" />
          <text x="470" y="324" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
            汽水
          </text>
          {/* 瓶口一缕气 */}
          <path d="M470 214 q10 -16 -2 -32 q-10 -14 2 -28" stroke="hsl(var(--background))" strokeWidth="6" opacity="0.18" fill="none" />
        </g>
      </g>
      {/* 垫着的外套：一件是他的，一件多出来的——你的那件 */}
      <g>
        <rect x="188" y="392" width="150" height="40" rx="12" fill="var(--frog-bluegray-deep)" />
        <path d="M198 396 q28 -14 56 0" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.3" fill="none" />
        <rect x="356" y="398" width="150" height="40" rx="12" fill="var(--frog-bluegray)" opacity="0.9" />
        <path d="M366 402 q28 -14 56 0" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.3" fill="none" />
        {/* 第二件比第一件新一点，领口还立着 */}
        <path d="M430 398 l8 -12 l8 12" stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.4" fill="none" />
      </g>
      {/* 远处跑道上一圈影子 */}
      <g opacity="0.4">
        <ellipse cx="680" cy="128" rx="18" ry="13" fill="var(--frog-bluegray-deep)" />
        <circle cx="680" cy="112" r="9" fill="var(--frog-bluegray-deep)" />
      </g>
    </g>
  );
}

/* ---------- 42. cg-chorus 合唱（操场线 ED 定格，线级 endingCg，不进收集册）---------- */

function CgChorus() {
  return (
    <g>
      {/* 天亮前的草坪：两块并排的人形压痕 */}
      <defs>
        <linearGradient id="cg-chorus-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bluegray)" />
          <stop offset="1" stopColor="var(--frog-cream)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-chorus-sky)" />
      {/* 贴地视角：草叶从画面两侧冒出来，中景是草坪 */}
      <path d="M0 296 L800 282 L800 450 L0 450 Z" fill="var(--map-grass)" />
      <path d="M0 296 L800 282" stroke="hsl(var(--background))" strokeWidth="2.5" opacity="0.3" fill="none" />
      {/* 两块并排的人形压痕：一大一小，压得很实 */}
      <g>
        <ellipse cx="330" cy="376" rx="96" ry="22" fill="var(--frog-ink)" opacity="0.3" />
        <ellipse cx="330" cy="372" rx="78" ry="16" fill="var(--frog-ink)" opacity="0.18" />
        <ellipse cx="520" cy="382" rx="86" ry="20" fill="var(--frog-ink)" opacity="0.26" />
        <ellipse cx="520" cy="378" rx="70" ry="14" fill="var(--frog-ink)" opacity="0.16" />
      </g>
      {/* 压痕之间的草还立着两撮，像没被唱完的休止符 */}
      <path d="M412 392 l5 -26 M424 394 l-3 -34 M436 392 l4 -22" stroke="var(--map-grass-deep)" strokeWidth="4" opacity="0.7" />
      <path d="M620 396 l-5 -24 M608 398 l3 -32 M596 396 l-4 -20" stroke="var(--map-grass-deep)" strokeWidth="4" opacity="0.7" />
      {/* 天边那两盏坏灯的剪影：一盏换新了，一盏还黑着 */}
      <g opacity="0.85">
        <path d="M170 296 L170 180" stroke="var(--frog-ink)" strokeWidth="5" opacity="0.7" />
        <rect x="148" y="168" width="44" height="11" rx="5" fill="var(--frog-badge)" opacity="0.85" />
        <circle cx="170" cy="196" r="40" fill="var(--frog-badge)" opacity="0.14" />
        <path d="M636 296 L636 184" stroke="var(--frog-ink)" strokeWidth="5" opacity="0.7" />
        <rect x="614" y="172" width="44" height="11" rx="5" fill="var(--frog-ink)" opacity="0.75" />
      </g>
      {/* 天光落在两块压痕上，把它们连成同一行 */}
      <ellipse cx="424" cy="380" rx="260" ry="40" fill="var(--frog-cream)" opacity="0.16" />
      <ellipse cx="400" cy="220" rx="330" ry="60" fill="var(--frog-cream)" opacity="0.1" />
    </g>
  );
}


/* ---------- 43. cg-melatonin 两板褪黑素（自习楼线）---------- */

function CgMelatonin() {
  return (
    <g>
      {/* 储物柜半开：柜内被走廊灯照到一角 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.2" />
      {/* 柜体 */}
      <g>
        <rect x="150" y="56" width="500" height="330" rx="10" fill="var(--frog-bluegray-deep)" />
        <rect x="170" y="76" width="460" height="290" rx="6" fill="var(--frog-bluegray)" opacity="0.55" />
        <path d="M170 220 h460" stroke="var(--frog-ink)" strokeWidth="2.5" opacity="0.3" fill="none" />
        <circle cx="606" cy="148" r="5" fill="var(--frog-ink)" opacity="0.55" />
        <circle cx="606" cy="292" r="5" fill="var(--frog-ink)" opacity="0.55" />
      </g>
      {/* 半开的柜门（向左撇出） */}
      <g transform="rotate(-14 170 76)">
        <rect x="176" y="76" width="454" height="290" rx="6" fill="var(--frog-bluegray)" opacity="0.92" />
        <rect x="176" y="76" width="454" height="290" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.35" />
        <circle cx="600" cy="220" r="5" fill="var(--frog-ink)" opacity="0.55" />
        {/* 门内侧贴着的便利贴两张 */}
        <rect x="230" y="130" width="66" height="52" rx="3" fill="var(--frog-cream)" opacity="0.9" />
        <path d="M238 142 h50 M238 154 h50 M238 166 h34" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.28" fill="none" />
        <rect x="230" y="196" width="66" height="52" rx="3" fill="var(--frog-cream)" opacity="0.8" />
        <path d="M238 208 h50 M238 220 h38" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.24" fill="none" />
      </g>
      {/* 柜内：一只枕头（中间压出一个窝）+ 两板褪黑素 + 一摞草稿纸 */}
      <g>
        <ellipse cx="452" cy="300" rx="130" ry="42" fill="hsl(var(--background))" opacity="0.14" />
        <ellipse cx="452" cy="292" rx="112" ry="34" fill="var(--frog-cream)" />
        <ellipse cx="452" cy="288" rx="52" ry="16" fill="var(--frog-cream-deep)" opacity="0.85" />
        {/* 两板褪黑素：银色铝箔 */}
        <g transform="rotate(-8 352 262)">
          <rect x="316" y="244" width="72" height="34" rx="4" fill="var(--frog-bluegray)" opacity="0.95" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={`pill-${i}`} cx={330 + i * 11} cy="261" r="6" fill="hsl(var(--background))" opacity="0.5" />
          ))}
        </g>
        <g transform="rotate(5 352 306)">
          <rect x="322" y="290" width="72" height="34" rx="4" fill="var(--frog-bluegray)" opacity="0.8" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={`pill2-${i}`} cx={336 + i * 11} cy="307" r="6" fill="hsl(var(--background))" opacity="0.42" />
          ))}
        </g>
        {/* 一摞草稿纸，最上面一张写着半个公式 */}
        <g transform="rotate(-2 470 332)">
          <rect x="420" y="312" width="128" height="34" rx="2" fill="var(--frog-cream)" />
          <rect x="418" y="318" width="132" height="34" rx="2" fill="var(--frog-cream)" opacity="0.9" />
          <path d="M430 336 h64 M510 336 h28" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.4" fill="none" />
          <path d="M438 330 q10 -12 20 0" stroke="var(--frog-ink)" strokeWidth="1.6" fill="none" opacity="0.35" />
        </g>
      </g>
      {/* 走廊灯的光从柜口斜进来 */}
      <polygon points="170,76 330,76 470,386 170,386" fill="var(--frog-badge)" opacity="0.1" />
    </g>
  );
}

/* ---------- 44. cg-folded-paper 对折的纸（自习楼线）---------- */

function CgFoldedPaper() {
  return (
    <g>
      {/* 凌晨一点四十：桌上摊开的书旁，一张刚合上的对折的纸 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.3" />
      {/* 桌面 */}
      <path d="M0 246 L800 226 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 290 L800 274" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.12" fill="none" />
      {/* 对折的纸：折痕两道，刚被折回去 */}
      <g transform="rotate(-4 400 330)">
        <rect x="292" y="288" width="216" height="96" rx="3" fill="var(--frog-cream)" />
        <path d="M292 312 h216 M292 352 h216" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.16" fill="none" />
        {/* 折痕：中线一道更深的 */}
        <path d="M400 288 v96" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.14" fill="none" />
        {/* 露出的字迹一角：一个被划掉的名字 */}
        <g opacity="0.75">
          <text x="352" y="342" fontSize="16" fontWeight="600" fill="var(--frog-ink)">
            报
          </text>
          <path d="M344 330 h22" stroke="var(--frog-berry)" strokeWidth="2.6" opacity="0.75" />
          <text x="428" y="342" fontSize="16" fontWeight="600" fill="var(--frog-ink)" opacity="0.55">
            名
          </text>
        </g>
      </g>
      {/* 书包夹层：拉链半开，露出一角 */}
      <g transform="rotate(4 600 300)">
        <rect x="520" y="240" width="180" height="130" rx="14" fill="var(--frog-bluegray-deep)" />
        <rect x="536" y="256" width="148" height="98" rx="10" fill="var(--frog-bluegray)" opacity="0.8" />
        <path d="M536 256 L684 354" stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.3" fill="none" />
        {/* 拉链头 */}
        <rect x="660" y="336" width="14" height="20" rx="4" fill="var(--frog-cream)" opacity="0.9" />
        <circle cx="667" cy="352" r="3" fill="var(--frog-ink)" opacity="0.5" />
      </g>
      {/* 手正把最后一道折痕压平 */}
      <ellipse cx="270" cy="398" rx="44" ry="18" fill="var(--frog-bluegray-deep)" opacity="0.9" transform="rotate(-10 270 398)" />
      <ellipse cx="228" cy="390" rx="18" ry="10" fill="var(--frog-bluegray)" opacity="0.9" transform="rotate(-10 228 390)" />
      {/* 桌角的水杯与秒针表盘的反光 */}
      <g>
        <rect x="96" y="330" width="34" height="44" rx="8" fill="var(--frog-bluegray-deep)" opacity="0.9" />
        <path d="M113 330 v-6" stroke="var(--frog-matcha)" strokeWidth="3" opacity="0.7" />
      </g>
    </g>
  );
}

/* ---------- 45. cg-locked-answer 不敢拆的答案（自习楼线 ED 定格，线级 endingCg，不进收集册）---------- */

function CgLockedAnswer() {
  return (
    <g>
      {/* 储物柜全开：最里面一张折了三折的纸，手停在半空 */}
      <defs>
        <linearGradient id="cg-lockans-room" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bluegray-deep)" />
          <stop offset="1" stopColor="var(--frog-ink)" />
        </linearGradient>
        <radialGradient id="cg-lockans-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-lockans-room)" />
      {/* 柜体占中，柜门向左全开 */}
      <g>
        <rect x="230" y="40" width="340" height="380" rx="10" fill="var(--frog-bluegray-deep)" opacity="0.9" />
        <rect x="252" y="62" width="296" height="336" rx="6" fill="var(--frog-ink)" opacity="0.5" />
        <circle cx="522" cy="236" r="5" fill="var(--frog-ink)" opacity="0.6" />
        {/* 柜内光：从背后透出的一点 */}
        <ellipse cx="400" cy="230" rx="150" ry="140" fill="url(#cg-lockans-glow)" opacity="0.5" />
      </g>
      {/* 全开的柜门 */}
      <g transform="rotate(-72 230 40)">
        <rect x="236" y="62" width="288" height="336" rx="6" fill="var(--frog-bluegray)" opacity="0.85" />
        <circle cx="506" cy="230" r="5" fill="var(--frog-ink)" opacity="0.5" />
        {/* 门内侧贴的便利贴：写着两遍同一句话 */}
        <rect x="280" y="120" width="76" height="58" rx="3" fill="var(--frog-cream)" opacity="0.85" />
        <path d="M288 136 h60 M288 150 h60 M288 164 h40" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.26" fill="none" />
        <rect x="280" y="192" width="76" height="58" rx="3" fill="var(--frog-cream)" opacity="0.7" />
        <path d="M288 208 h60 M288 222 h40" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.2" fill="none" />
      </g>
      {/* 最里面：折了三折的纸，折痕三道 */}
      <g transform="rotate(-6 400 250)">
        <rect x="330" y="216" width="140" height="68" rx="2.5" fill="var(--frog-cream)" />
        <path d="M330 238 h140 M330 262 h140" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.2" fill="none" />
        {/* 折起的棱 */}
        <path d="M330 238 L326 244 L330 250" stroke="var(--frog-ink)" strokeWidth="1.4" fill="none" opacity="0.18" />
        <path d="M330 262 L334 268 L330 274" stroke="var(--frog-ink)" strokeWidth="1.4" fill="none" opacity="0.18" />
        {/* 纸上一角字迹 */}
        <text x="352" y="258" fontSize="13" fontWeight="600" fill="var(--frog-ink)" opacity="0.55">
          上岸
        </text>
      </g>
      {/* 一只手停在半空：伸了一半，没碰到 */}
      <g>
        <path d="M120 300 q64 -30 130 -18" stroke="var(--frog-bluegray)" strokeWidth="26" strokeLinecap="round" fill="none" opacity="0.95" />
        <ellipse cx="256" cy="280" rx="22" ry="15" fill="var(--frog-bluegray)" opacity="0.95" transform="rotate(-10 256 280)" />
        <ellipse cx="278" cy="272" rx="10" ry="8" fill="var(--frog-bluegray-deep)" opacity="0.9" transform="rotate(-10 278 272)" />
      </g>
      {/* 柜门边缘的一线光落在手背上 */}
      <path d="M120 296 q64 -28 128 -17" stroke="var(--frog-cream)" strokeWidth="3" fill="none" opacity="0.28" />
    </g>
  );
}


/* ---------- 46. cg-badge-note 实习期倒计时（行政楼线）---------- */

function CgBadgeNote() {
  return (
    <g>
      {/* 工牌翻过来：背面夹着一张对折的小纸条，边角磨得发圆 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.1" />
      {/* 工牌占中（背面朝上） */}
      <g transform="rotate(-3 400 230)">
        <rect x="248" y="80" width="304" height="300" rx="16" fill="var(--frog-cream-deep)" />
        <rect x="248" y="80" width="304" height="300" rx="16" fill="none" stroke="var(--frog-ink)" strokeWidth="2.5" opacity="0.3" />
        {/* 挂绳孔 */}
        <rect x="384" y="92" width="32" height="16" rx="8" fill="var(--frog-ink)" opacity="0.4" />
        {/* 工牌背面的小字：姓名栏朝下、实习期栏朝上 */}
        <text x="400" y="140" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
          实习期
        </text>
        <path d="M300 158 h200" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.2" fill="none" />
        {/* 背面夹着的对折纸条：边角磨圆 */}
        <g transform="rotate(4 400 250)">
          <rect x="322" y="196" width="156" height="112" rx="10" fill="var(--frog-cream)" />
          {/* 对折的折痕 */}
          <path d="M400 196 v112" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.12" fill="none" />
          {/* 纸条上的字：一行日期 + 一行小字 */}
          <text x="400" y="234" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--frog-ink)" opacity="0.8">
            六月三十日
          </text>
          <path d="M348 252 h104" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.22" fill="none" />
          <text x="400" y="276" textAnchor="middle" fontSize="12" fontWeight="500" fill="var(--frog-ink)" opacity="0.5">
            还有
          </text>
        </g>
        {/* 磨圆的纸角：一小块更浅 */}
        <path d="M470 296 q12 6 8 14" stroke="var(--frog-cream-deep)" strokeWidth="3" fill="none" opacity="0.6" />
      </g>
      {/* 一只手捏着工牌边缘 */}
      <ellipse cx="540" cy="384" rx="52" ry="20" fill="var(--frog-bluegray)" opacity="0.9" transform="rotate(-12 540 384)" />
      <ellipse cx="590" cy="370" rx="16" ry="9" fill="var(--frog-bluegray-deep)" opacity="0.9" transform="rotate(-12 590 370)" />
      {/* 桌面 */}
      <path d="M0 402 L800 388 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 428 L800 416" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.1" fill="none" />
    </g>
  );
}

/* ---------- 47. cg-seven-versions 温馨提示（行政楼线）---------- */

function CgSevenVersions() {
  return (
    <g>
      {/* 七稿并排：措辞一遍比一遍软 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.1" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const x = 60 + i * 98;
        const tilt = (i - 3) * 1.2;
        const isLast = i === 6;
        return (
          <g key={`ver-${i}`} transform={`rotate(${tilt} ${x + 40} 230)`} opacity={isLast ? 1 : 0.9 - i * 0.02}>
            <rect x={x} y={140 - (i % 2) * 10} width="80" height="200" rx="3" fill="var(--frog-cream)" />
            {/* 版本号 */}
            <text x={x + 40} y={164 - (i % 2) * 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-ink)" opacity="0.4">
              第{i + 1}稿
            </text>
            <path d={`M${x + 10} ${176 - (i % 2) * 10} h60`} stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.25" fill="none" />
            {/* 正文行数逐稿变少（改短了），最后一稿加粗 */}
            {[0, 1, 2].map((r) => (
              <path
                key={`row-${r}`}
                d={`M${x + 10} ${196 + r * 18 - (i % 2) * 10} h${isLast ? 60 : r < 2 ? 60 - i * 4 : 0}`}
                stroke={isLast ? "var(--frog-berry)" : "var(--frog-ink)"}
                strokeWidth={isLast ? 2.2 : 1.6}
                opacity={isLast ? 0.75 : 0.3}
                fill="none"
              />
            ))}
          </g>
        );
      })}
      {/* 第七稿下划线上的批注：这份最稳 */}
      <g transform="rotate(-2 668 356)">
        <rect x="608" y="344" width="122" height="26" rx="3" fill="var(--frog-matcha)" opacity="0.2" />
        <text x="669" y="362" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-matcha-deep)">
          这份最稳
        </text>
      </g>
      {/* 便签边角的输入法候选第一位 */}
      <g>
        <rect x="56" y="382" width="200" height="40" rx="6" fill="hsl(var(--background))" opacity="0.9" />
        <rect x="56" y="382" width="200" height="40" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.2" />
        <text x="68" y="408" fontSize="14" fontWeight="700" fill="var(--frog-ink)">
          温馨提示：
        </text>
        <text x="150" y="408" fontSize="12" fill="var(--frog-ink)" opacity="0.4">
          1
        </text>
      </g>
    </g>
  );
}

/* ---------- 48. cg-final-clause 最终解释权（行政楼线 ED 定格，线级 endingCg，不进收集册）---------- */

function CgFinalClause() {
  return (
    <g>
      {/* 多年后的公告栏：贴满通知，每张右下角都有那行小字 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.12" />
      {/* 公告栏框 */}
      <rect x="60" y="48" width="680" height="330" rx="8" fill="var(--frog-bluegray-deep)" opacity="0.85" />
      <rect x="74" y="62" width="652" height="302" rx="4" fill="var(--frog-bluegray)" opacity="0.4" />
      {/* 六张通知：三上三下，右下角那行小字一致 */}
      {[
        [96, 78],
        [288, 78],
        [480, 78],
        [96, 244],
        [288, 244],
        [480, 244],
      ].map(([x, y], i) => (
        <g key={`notice-${i}`} transform={`rotate(${(i % 3 - 1) * 1.4} ${x + 90} ${y + 60})`}>
          <rect x={x} y={y} width="180" height="148" rx="3" fill="var(--frog-cream)" opacity={0.88 - i * 0.03} />
          <rect x={x + 12} y={y + 12} width="120" height="9" rx="2" fill="var(--frog-berry)" opacity="0.5" />
          <path d={`M${x + 12} ${y + 34} h156 M${x + 12} ${y + 48} h156 M${x + 12} ${y + 62} h110`} stroke="var(--frog-ink)" strokeWidth="2" opacity="0.24" fill="none" />
          {/* 右下角那行小字：最终解释权归学工办所有 */}
          <text x={x + 168} y={y + 132} textAnchor="end" fontSize="8.5" fontWeight="600" fill="var(--frog-ink)" opacity="0.5">
            最终解释权归学工办所有
          </text>
        </g>
      ))}
      {/* 第四张（右下角第一张）的字迹是主角的：更生一些 */}
      <g transform="rotate(0.6 570 308)">
        <text x="648" y="376" textAnchor="end" fontSize="9" fontWeight="700" fill="var(--frog-ink)" opacity="0.62">
          最终解释权归学工办所有
        </text>
        <path d="M556 380 h100" stroke="var(--frog-ink)" strokeWidth="0.8" opacity="0.16" fill="none" />
      </g>
      {/* 公告栏玻璃反光一道 */}
      <path d="M120 70 L220 380" stroke="hsl(var(--background))" strokeWidth="18" opacity="0.05" fill="none" />
    </g>
  );
}


/* ---------- 49. cg-flyer-half 撕剩的半张（教学楼线）---------- */

function CgFlyerHalf() {
  return (
    <g>
      {/* 电线杆特写：上一届撕剩的半张海报 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-badge)" opacity="0.08" />
      {/* 电线杆占中偏右，杆上一层层旧贴纸的残角 */}
      <g>
        <rect x="486" y="20" width="64" height="430" fill="var(--frog-bluegray-deep)" opacity="0.9" />
        <path d="M486 120 h64 M486 250 h64" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.2" fill="none" />
        {/* 最底下的旧贴纸残角：三小片 */}
        <g opacity="0.5">
          <path d="M470 380 l26 -8 l4 18 l-26 6 Z" fill="var(--frog-cream-deep)" />
          <path d="M478 402 l22 -6 l3 14 l-20 5 Z" fill="var(--frog-cream)" />
        </g>
      </g>
      {/* 撕剩的半张海报（左边完整右边缺） */}
      <g transform="rotate(-2 420 200)">
        <rect x="240" y="120" width="216" height="180" rx="2" fill="var(--frog-cream)" />
        {/* 撕口的锯齿边缘 */}
        <path d="M456 120 l-6 14 l7 12 l-8 14 l6 12 l-9 14 l7 14 l-8 14 l5 14 l-9 14 l7 14 l-8 14 l9 12 l-6 8 L440 300 Z" fill="hsl(var(--secondary))" />
        {/* 完整的半边：标题与日期 */}
        <rect x="256" y="140" width="150" height="12" rx="3" fill="var(--frog-ink)" opacity="0.6" />
        <path d="M256 168 h150 M256 182 h150 M256 196 h120" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.28" fill="none" />
        <rect x="256" y="214" width="80" height="10" rx="3" fill="var(--frog-berry)" opacity="0.5" />
        <text x="340" y="248" fontSize="26" fontWeight="800" fill="var(--frog-berry-deep)">
          还有 87 天
        </text>
        {/* 落款：学生会 宣 */}
        <text x="286" y="284" fontSize="10" fontWeight="600" fill="var(--frog-ink)" opacity="0.45">
          学习部 宣
        </text>
        {/* 撕剩的边角胶带 */}
        <rect x="252" y="116" width="40" height="10" rx="2" fill="var(--frog-cream-deep)" opacity="0.7" />
      </g>
      {/* 被风吹起的撕下那半张，贴在杆根 */}
      <g transform="rotate(24 600 380)">
        <path d="M560 344 l36 -8 l30 6 l-8 18 l-34 6 l-26 -8 Z" fill="var(--frog-cream)" opacity="0.8" />
        <path d="M572 352 h24" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.3" fill="none" />
      </g>
      {/* 横幅的影子投在杆上 */}
      <rect x="486" y="52" width="64" height="40" fill="var(--frog-berry)" opacity="0.12" />
    </g>
  );
}

/* ---------- 50. cg-timeline-flag 时间轴的尽头（教学楼线）---------- */

function CgTimelineFlag() {
  return (
    <g>
      {/* 投影特写：一条横轴，四段，尽头一面小旗 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.18" />
      {/* 投影幕微斜 */}
      <g transform="rotate(-2 400 220)">
        <rect x="120" y="90" width="560" height="260" rx="6" fill="hsl(var(--background))" />
        <rect x="120" y="90" width="560" height="260" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.25" />
        <text x="400" y="132" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--frog-ink)">
          大学四年时间轴
        </text>
        {/* 四段：大一绩点 / 大二进组 / 大三分流 / 大四秋招 */}
        {[
          ["大一", "绩点", 208],
          ["大二", "进组", 336],
          ["大三", "分流", 464],
          ["大四", "秋招", 592],
        ].map(([y1, y2, x], i) => (
          <g key={`seg-${x}`}>
            <rect x={Number(x) - 56} y="162" width="112" height="76" rx="5" fill="var(--frog-bluegray-deep)" opacity={0.65 - i * 0.04} />
            <text x={Number(x)} y="192" textAnchor="middle" fontSize="17" fontWeight="700" fill="hsl(var(--background))">
              {y1}
            </text>
            <text x={Number(x)} y="218" textAnchor="middle" fontSize="13" fontWeight="600" fill="hsl(var(--background))" opacity="0.85">
              {y2}
            </text>
          </g>
        ))}
        {/* 横轴贯穿 */}
        <path d="M152 266 h520" stroke="var(--frog-ink)" strokeWidth="3.5" opacity="0.5" />
        {[208, 336, 464, 592].map((x) => (
          <path key={`tick-${x}`} d={`M${x} 258 v16`} stroke="var(--frog-ink)" strokeWidth="2.5" opacity="0.4" />
        ))}
        {/* 尽头一面小旗 */}
        <g>
          <path d="M672 266 v-38" stroke="var(--frog-berry-deep)" strokeWidth="4.5" />
          <path d="M672 228 l38 12 l-38 12 Z" fill="var(--frog-berry)" />
          <text x="696" y="286" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--frog-ink)" opacity="0.4">
            终点
          </text>
        </g>
      </g>
      {/* 台下第一排的蛙影抬头看 */}
      <g opacity="0.75">
        <ellipse cx="256" cy="410" rx="30" ry="22" fill="var(--frog-bluegray-deep)" />
        <circle cx="256" cy="380" r="14" fill="var(--frog-bluegray-deep)" />
        <ellipse cx="520" cy="416" rx="28" ry="20" fill="var(--frog-bluegray-deep)" />
        <circle cx="520" cy="388" r="13" fill="var(--frog-bluegray-deep)" />
      </g>
      {/* 投影仪的光锥 */}
      <polygon points="120,350 680,350 760,450 40,450" fill="hsl(var(--background))" opacity="0.05" />
    </g>
  );
}

/* ---------- 51. cg-same-sheet 还是那张表（教学楼线 ED 定格，线级 endingCg，不进收集册）---------- */

function CgSameSheet() {
  return (
    <g>
      {/* 多年后迎新日：桌子换了位置，表还是那张表 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-badge)" opacity="0.1" />
      {/* 迎新日的太阳光从斜上方进来 */}
      <polygon points="0,0 800,0 800,120 0,180" fill="hsl(var(--background))" opacity="0.12" />
      {/* 桌面（换了位置的：比第一课的更靠边，桌腿只有三只有垫） */}
      <path d="M0 250 L800 226 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 296 L800 276" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.12" fill="none" />
      <path d="M0 386 L800 372" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.1" fill="none" />
      {/* 那张规划表：边角也卷了 */}
      <g transform="rotate(2 410 320)">
        <rect x="230" y="228" width="360" height="186" rx="4" fill="var(--frog-cream)" />
        <rect x="230" y="228" width="360" height="186" rx="4" fill="none" stroke="var(--frog-ink)" strokeWidth="2.5" opacity="0.3" />
        <text x="410" y="262" textAnchor="middle" fontSize="21" fontWeight="700" fill="var(--frog-ink)">
          大学四年规划表
        </text>
        <path d="M258 280 h304 M258 280 v120 M562 280 v120" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.4" fill="none" />
        {/* 表内那行目标栏的字迹：随便过过，反正没人看 */}
        <g opacity="0.62">
          <text x="272" y="312" fontSize="12" fontWeight="600" fill="var(--frog-ink)">
            目标：
          </text>
          <text x="316" y="312" fontSize="13.5" fontWeight="600" fill="var(--frog-ink)">
            随便过过，反正没人看
          </text>
        </g>
        {/* 页脚批注：态度真实，心理状况良好 */}
        <text x="272" y="392" fontSize="10.5" fontWeight="600" fill="var(--frog-berry-deep)" opacity="0.75">
          批注：态度真实，心理状况良好
        </text>
        {/* 边角卷起 */}
        <path d="M590 404 q16 -6 10 -18 q-6 -10 -14 -2" fill="var(--frog-cream-deep)" opacity="0.85" />
      </g>
      {/* 桌边一只新蛙的影子（还没坐下的那种） */}
      <ellipse cx="150" cy="404" rx="34" ry="12" fill="var(--frog-ink)" opacity="0.18" />
      {/* 一枚章立着，还没落 */}
      <g>
        <rect x="628" y="238" width="22" height="30" rx="3" fill="var(--frog-cream-deep)" />
        <ellipse cx="639" cy="236" rx="13" ry="5" fill="var(--frog-berry)" opacity="0.75" />
        <ellipse cx="639" cy="272" rx="14" ry="4" fill="var(--frog-ink)" opacity="0.2" />
      </g>
    </g>
  );
}


/* ---------- 52. cg-old-phone 二十年没换（湖边线）---------- */

function CgOldPhone() {
  return (
    <g>
      {/* 老年机特写：屏幕裂了半边，摞在手机堆顶上 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" opacity="0.22" />
      {/* 石头 */}
      <path d="M0 322 L800 300 L800 450 L0 450 Z" fill="var(--frog-bluegray-deep)" />
      <ellipse cx="430" cy="336" rx="260" ry="30" fill="hsl(var(--background))" opacity="0.1" />
      {/* 底下的手机堆：几台叠着，屏幕全朝下 */}
      {[0, 1, 2, 3].map((i) => (
        <g key={`under-${i}`} transform={`rotate(${(i - 1.5) * 5} 400 ${316 - i * 9})`}>
          <rect x={330 - i * 3} y={306 - i * 9} width={140 + i * 4} height="7" rx="2.5" fill="var(--frog-ink)" opacity="0.85" />
        </g>
      ))}
      {/* 顶上那台老年机：屏幕裂了半边，铃声旋钮 */}
      <g transform="rotate(-4 400 250)">
        <rect x="308" y="196" width="184" height="96" rx="10" fill="var(--frog-cream-deep)" />
        <rect x="318" y="206" width="164" height="76" rx="7" fill="var(--frog-bluegray)" opacity="0.85" />
        {/* 裂纹：半边屏幕三道 */}
        <path d="M402 208 l-14 22 l10 16 l-8 18" stroke="var(--frog-ink)" strokeWidth="2" fill="none" opacity="0.55" />
        <path d="M428 210 l-10 18 l8 14" stroke="var(--frog-ink)" strokeWidth="1.8" fill="none" opacity="0.4" />
        <path d="M446 206 l-6 40" stroke="var(--frog-ink)" strokeWidth="1.6" fill="none" opacity="0.3" />
        {/* 老年机的大按键：三个实体键 */}
        <g>
          <rect x="330" y="288" width="34" height="16" rx="4" fill="var(--frog-cream-deep)" />
          <rect x="372" y="288" width="34" height="16" rx="4" fill="var(--frog-cream-deep)" />
          <rect x="414" y="288" width="34" height="16" rx="4" fill="var(--frog-cream-deep)" />
        </g>
        {/* 屏幕上的出厂时钟：二十年没换过 */}
        <text x="360" y="236" fontSize="17" fontWeight="700" fill="hsl(var(--background))" opacity="0.75">
          22:05
        </text>
        <path d="M330 250 h44" stroke="hsl(var(--background))" strokeWidth="1.6" opacity="0.16" fill="none" />
      </g>
      {/* 草叶从石头缝里冒出来 */}
      <path d="M150 448 l6 -26 M164 448 l-4 -34 M180 448 l4 -22" stroke="var(--map-grass-deep)" strokeWidth="4" opacity="0.6" />
      <path d="M666 448 l-6 -26 M652 448 l4 -34 M638 448 l-4 -22" stroke="var(--map-grass-deep)" strokeWidth="4" opacity="0.6" />
      {/* 月光落在裂纹上 */}
      <path d="M402 208 l-14 22 l10 16" stroke="hsl(var(--background))" strokeWidth="1.6" fill="none" opacity="0.2" />
    </g>
  );
}

/* ---------- 53. cg-far-light 还剩一扇灯（湖边线）---------- */

function CgFarLight() {
  return (
    <g>
      {/* 湖面上望过去：远处教学楼只剩一扇灯亮着 */}
      <defs>
        <linearGradient id="cg-farlight-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray-deep)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-farlight-sky)" />
      {/* 月亮偏西 */}
      <circle cx="120" cy="96" r="22" fill="hsl(var(--background))" opacity="0.7" />
      <circle cx="120" cy="96" r="44" fill="hsl(var(--background))" opacity="0.08" />
      {/* 远处教学楼：一整排窗全黑，只剩一扇亮 */}
      <g>
        <rect x="520" y="150" width="200" height="130" rx="4" fill="var(--frog-ink)" opacity="0.9" />
        <rect x="536" y="164" width="168" height="14" rx="2" fill="hsl(var(--background))" opacity="0.06" />
        {[
          [544, 192],
          [584, 192],
          [624, 192],
          [664, 192],
          [544, 226],
          [584, 226],
          [624, 226],
          [664, 226],
        ].map(([wx, wy], i) => (
          <g key={`win-${i}`}>
            <rect x={wx} y={wy} width="18" height="16" rx="1.5" fill="hsl(var(--background))" opacity="0.08" />
          </g>
        ))}
        {/* 唯一亮着的那扇：三楼右数第二格 */}
        <rect x="624" y="226" width="18" height="16" rx="1.5" fill="var(--frog-badge)" opacity="0.9" />
        <ellipse cx="633" cy="234" rx="30" ry="20" fill="var(--frog-badge)" opacity="0.2" />
        {/* 里面一只蛙的剪影 */}
        <ellipse cx="633" cy="236" rx="6" ry="5" fill="var(--frog-ink)" opacity="0.7" />
      </g>
      {/* 湖面把这扇灯照出来 */}
      <rect x="0" y="280" width="800" height="170" fill="var(--frog-bluegray-deep)" opacity="0.95" />
      <path d="M0 280 h800" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.24" fill="none" />
      <path d="M620 296 q14 4 26 0 q12 -4 26 0 M614 314 q18 5 32 0 q14 -5 30 0 M606 336 q20 6 36 0 q16 -6 34 0" stroke="var(--frog-badge)" strokeWidth="3" opacity="0.22" fill="none" />
      {/* 岸边两撮草与一只空位 */}
      <path d="M120 448 l6 -26 M134 448 l-4 -34 M150 448 l4 -22" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.7" />
      <path d="M700 448 l-6 -26 M686 448 l4 -34 M672 448 l-4 -22" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.7" />
    </g>
  );
}

/* ---------- 54. cg-only-the-lake 只剩湖（湖边线 ED 定格，线级 endingCg，不进收集册）---------- */

function CgOnlyTheLake() {
  return (
    <g>
      {/* 散场后的湖边：岸上空着，锅空了，手机没人拿，天光里的湖 */}
      <defs>
        <linearGradient id="cg-onlylake-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bluegray)" />
          <stop offset="1" stopColor="var(--frog-cream)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-onlylake-sky)" />
      {/* 天光里的湖面 */}
      <rect x="0" y="196" width="800" height="150" fill="var(--frog-bluegray)" opacity="0.8" />
      <path d="M0 196 h800" stroke="hsl(var(--background))" strokeWidth="2.5" opacity="0.3" fill="none" />
      {[212, 232, 252, 276, 304].map((y, i) => (
        <path key={`wave-${i}`} d={`M${90 + i * 36} ${y} q32 -5 64 0 q32 5 64 0`} stroke="hsl(var(--background))" strokeWidth="2.4" opacity="0.18" fill="none" />
      ))}
      {/* 岸线：五个坐过的位置，压痕还在 */}
      <path d="M0 346 q200 -14 400 -8 q220 6 400 0 v104 h-800 Z" fill="var(--map-grass)" opacity="0.6" />
      <path d="M0 346 q200 -14 400 -8" stroke="hsl(var(--background))" strokeWidth="2.5" opacity="0.28" fill="none" />
      {/* 五块人形压痕：一排，最边上一块更浅 */}
      {[180, 280, 400, 520, 630].map((x, i) => (
        <g key={`mark-${i}`}>
          <ellipse cx={x} cy={382 - (i === 4 ? 6 : 0)} rx={46 - (i === 4 ? 8 : 0)} ry={10} fill="var(--frog-ink)" opacity={i === 4 ? 0.18 : 0.3} />
        </g>
      ))}
      {/* 空了的锅还在炉上，手机还摞在石头上没人拿 */}
      <g>
        <ellipse cx="386" cy="352" rx="44" ry="12" fill="var(--frog-bluegray-deep)" opacity="0.9" />
        <ellipse cx="386" cy="349" rx="44" ry="11" fill="hsl(var(--background))" opacity="0.3" />
        <path d="M440 356 v-14" stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.5" />
      </g>
      <g>
        {[0, 1, 2, 3].map((i) => (
          <g key={`phone-${i}`} transform={`rotate(${(i - 1.5) * 6} 620 ${340 - i * 7})`}>
            <rect x={604 - i} y={332 - i * 7} width={34 + i} height="6" rx="2" fill="var(--frog-ink)" opacity="0.8" />
          </g>
        ))}
        <ellipse cx="620" cy="348" rx="38" ry="8" fill="var(--frog-ink)" opacity="0.75" />
      </g>
      {/* 天边的横幅剪影：第二天新横幅照挂 */}
      <g opacity="0.3">
        <path d="M80 130 q300 -12 640 0 l-3 40 q-320 -10 -634 0 Z" fill="var(--frog-berry-deep)" />
        <text x="400" y="158" textAnchor="middle" fontSize="16" fontWeight="700" fill="hsl(var(--background))" opacity="0.55">
          欢迎新蛙入学——从这里开始，成为更好的蛙。
        </text>
      </g>
    </g>
  );
}

/* ---------- 医务室线《病假条》（成就 CG 扩容批次）：对照表、白床与帘、理由抽屉 ---------- */

function CgSymptomChart() {
  /* 对照表（CY-129）：医务室第一幕——五栏对照表挂在登记台上方，
     每栏底下印一行小字（小字是医务室自己的注脚，不是给填表的蛙看的）；
     「其他」那栏底下没有小字，只有一条空白，比整张表都新。 */
  const columns: Array<[string, string]> = [
    ["发热", "以体温计为准，数字说话"],
    ["咳嗽", "听得见，免证明"],
    ["肚子疼", "查不了，放行"],
    ["头晕", "先坐，再说"],
    ["其他", ""],
  ];
  return (
    <g>
      {/* 背景：薄荷绿的墙，台面上方的光 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-mianmian)" opacity="0.2" />
      <rect x="0" y="0" width="800" height="320" fill="var(--frog-belly)" opacity="0.28" />
      {/* 对照表：五栏，最大的那张纸 */}
      <g transform="rotate(-1.2 400 168)">
        <rect x="150" y="58" width="500" height="220" rx="6" fill="var(--frog-belly)" />
        <rect x="150" y="58" width="500" height="220" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.4" />
        <text x="400" y="86" textAnchor="middle" fontSize="19" fontWeight="700" fill="var(--frog-ink)" opacity="0.85">
          常见症状对照表
        </text>
        {columns.map(([name, note], i) => {
          const x = 172 + i * 96;
          const isOther = i === 4;
          return (
            <g key={name}>
              {/* 栏目名 */}
              <rect x={x} y="100" width="84" height="26" rx="3" fill={isOther ? "var(--frog-mianmian)" : "hsl(var(--card))"} opacity={isOther ? 0.7 : 0.9} />
              <text x={x + 42} y="118" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-ink)" opacity="0.85">
                {name}
              </text>
              {/* 栏下小字：医务室自己的注脚；「其他」只有空白 */}
              {note ? (
                <>
                  {[note.slice(0, 6), note.slice(6)].map((seg, j) =>
                    seg ? (
                      <text key={`note-${j}`} x={x + 42} y={152 + j * 15} textAnchor="middle" fontSize="9.5" fill="var(--frog-bluegray-deep)" opacity="0.72">
                        {seg}
                      </text>
                    ) : null,
                  )}
                </>
              ) : (
                /* 「其他」：一条空白，比整张表都新——像反复贴过很多次，每一次都比上一次宽一点 */
                <>
                  <rect x={x - 4} y="130" width="92" height="58" rx="2" fill="var(--frog-mianmian)" opacity="0.55" />
                  <rect x={x - 2} y="136" width="88" height="46" rx="2" fill="none" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.18" strokeDasharray="3 3" />
                  <path d={`M${x - 4} 188 h92`} stroke="var(--frog-mianmian-deep)" strokeWidth="2" opacity="0.5" />
                </>
              )}
              {/* 分栏线 */}
              {i < 4 && <path d={`M${x + 90} 100 v158`} stroke="var(--frog-ink)" strokeWidth="1" opacity="0.18" />}
            </g>
          );
        })}
        {/* 表角贴痕：反复贴过的样子 */}
        <path d="M150 58 l16 0 0 12" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.25" fill="none" />
        <path d="M650 278 l-16 0 0 -12" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.25" fill="none" />
      </g>
      {/* 登记台与队：台面在表下方，队里的蛙剪影 */}
      <path d="M0 320 L800 308 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 320 L800 308 L800 322 L0 334 Z" fill="hsl(var(--background))" opacity="0.35" />
      {[110, 230, 350, 470].map((x, i) => (
        <g key={`queue-${i}`} opacity={0.42 - i * 0.05}>
          <ellipse cx={x} cy={396 - i * 6} rx={40 - i * 4} ry={44 - i * 4} fill="var(--frog-mianmian-deep)" />
          <circle cx={x} cy={330 - i * 6} r={22 - i * 2} fill="var(--frog-mianmian-deep)" />
        </g>
      ))}
      {/* 台面上压着的登记表：症状栏那格是空的 */}
      <g transform="rotate(-3 596 386)">
        <rect x="552" y="358" width="88" height="56" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.95" />
        <text x="596" y="374" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
          症状栏
        </text>
        <path d="M562 384 h68 M562 396 h52" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.3" />
      </g>
    </g>
  );
}

function CgInfirmaryBed() {
  return (
    <g>
      {/* 背景：薄荷绿的墙，下午的光从左边斜进来 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-mianmian)" opacity="0.22" />
      <rect x="0" y="330" width="800" height="120" fill="var(--frog-mianmian-deep)" opacity="0.3" />
      <polygon points="0,0 300,0 180,450 0,450" fill="var(--frog-badge)" opacity="0.12" />
      {/* 后墙的红十字 */}
      <g transform="translate(640 84)">
        <circle r="40" fill="var(--frog-belly)" opacity="0.9" />
        <path d="M-7 -22 h14 v15 h15 v14 h-15 v15 h-14 v-15 h-15 v-14 h15 z" fill="var(--frog-bow)" opacity="0.8" />
      </g>
      {/* 浅绿帘：拉上一半，褶子垂到地 */}
      <rect x="296" y="36" width="180" height="8" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.7" />
      <path d="M300 44 q18 180 0 366 h-44 q16 -186 0 -366 z" fill="var(--frog-mianmian)" opacity="0.85" />
      <path d="M256 44 q14 182 0 366 h-30 q12 -184 0 -366 z" fill="var(--frog-mianmian-deep)" opacity="0.5" />
      {/* 白床：床垫、枕头、叠好的毯子 */}
      <rect x="330" y="252" width="420" height="58" rx="14" fill="var(--frog-belly)" />
      <rect x="336" y="238" width="150" height="34" rx="14" fill="hsl(var(--card))" />
      <rect x="560" y="228" width="180" height="48" rx="10" fill="var(--frog-mianmian)" opacity="0.75" />
      <rect x="340" y="310" width="404" height="16" rx="8" fill="var(--frog-bluegray)" opacity="0.65" />
      <rect x="356" y="326" width="14" height="60" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.7" />
      <rect x="716" y="326" width="14" height="60" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.7" />
      {/* 床头柜与计时器：三十分钟，响了就起 */}
      <rect x="120" y="280" width="110" height="106" rx="10" fill="var(--map-wood)" />
      <circle cx="175" cy="246" r="30" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.95" />
      <path d="M175 246 v-16 M175 246 l11 7" stroke="var(--frog-bow)" strokeWidth="3.4" strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => (
        <circle
          key={`bed-tick-${i}`}
          cx={175 + Math.round(23 * Math.cos((i * Math.PI) / 2))}
          cy={246 + Math.round(23 * Math.sin((i * Math.PI) / 2))}
          r="2"
          fill="var(--frog-ink)"
          opacity="0.5"
        />
      ))}
      {/* 帘缝的光带：落在床沿 */}
      <polygon points="300,60 340,60 470,450 380,450" fill="var(--frog-badge)" opacity="0.14" />
    </g>
  );
}

function CgReasonDrawer() {
  /* 抽屉里的条子：三排五列，折成一样大小，微微错开角度 */
  const slips: Array<[number, number, number]> = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      slips.push([240 + c * 68 + ((r * 13) % 9), 146 + r * 44, ((r + c) % 3) - 1]);
    }
  }
  return (
    <g>
      {/* 背景：医务室的墙与柜台 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-mianmian)" opacity="0.2" />
      <rect x="0" y="340" width="800" height="110" fill="var(--map-wood)" opacity="0.75" />
      {/* 抽屉本体：拉开的样子，落影在柜台上 */}
      <rect x="210" y="120" width="420" height="250" rx="12" fill="var(--frog-ink)" opacity="0.14" />
      <rect x="200" y="110" width="420" height="250" rx="12" fill="var(--map-wood)" />
      <rect x="222" y="132" width="376" height="150" rx="8" fill="var(--frog-ink)" opacity="0.3" />
      {slips.map(([x, y, rot], i) => (
        <g key={`slip-${i}`} transform={`rotate(${rot * 1.6} ${x + 26} ${y + 18})`}>
          <rect x={x} y={y} width="52" height="36" rx="3" fill="var(--frog-belly)" opacity="0.96" />
          <path
            d={`M${x + 7} ${y + 12} h30 M${x + 7} ${y + 20} h38 M${x + 7} ${y + 28} h22`}
            stroke="var(--frog-bluegray)"
            strokeWidth="2"
            opacity="0.55"
            strokeLinecap="round"
          />
          <circle cx={x + 42} cy={y + 27} r="5.5" fill="none" stroke="var(--frog-bow)" strokeWidth="1.8" opacity="0.65" />
        </g>
      ))}
      {/* 抽屉面：标签写着《本学期收到的理由》，把手让摸得发亮 */}
      <g transform="rotate(-1.5 355 319)">
        <rect x="250" y="298" width="210" height="42" rx="5" fill="var(--frog-belly)" />
        <rect x="250" y="298" width="210" height="42" rx="5" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.35" />
        <text x="355" y="325" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--frog-ink)" opacity="0.85">
          本学期收到的理由
        </text>
      </g>
      <rect x="500" y="312" width="86" height="14" rx="7" fill="var(--frog-bluegray-deep)" opacity="0.85" />
      <ellipse cx="543" cy="316" rx="30" ry="3.4" fill="var(--frog-belly)" opacity="0.5" />
    </g>
  );
}

function CgLakeStones() {
  /* 五块石头（批次 CY-112）：湖边夜谈的座位谱系——四块有主，一块搭布留给火 */
  return (
    <g>
      <defs>
        <linearGradient id="cg-night-lake2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="0.55" stopColor="var(--frog-bluegray)" />
          <stop offset="1" stopColor="var(--frog-ink)" />
        </linearGradient>
        <radialGradient id="cg-fire-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 夜与湖 */}
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-night-lake2)" />
      <circle cx="640" cy="76" r="34" fill="var(--frog-belly)" opacity="0.9" />
      <ellipse cx="640" cy="196" rx="42" ry="8" fill="var(--frog-belly)" opacity="0.3" />
      <ellipse cx="600" cy="222" rx="26" ry="5" fill="var(--frog-belly)" opacity="0.2" />
      {/* 岸坡 */}
      <path d="M0 300 Q200 258 400 282 Q600 306 800 276 L800 450 L0 450 Z" fill="var(--frog-ink)" opacity="0.85" />
      <path d="M0 316 Q200 276 400 298 Q600 320 800 292 L800 450 L0 450 Z" fill="var(--map-wood)" opacity="0.35" />
      {/* 火光 */}
      <circle cx="400" cy="344" r="120" fill="url(#cg-fire-glow)" />
      {/* 酒精炉与锅 */}
      <rect x="384" y="340" width="32" height="16" rx="4" fill="var(--frog-bluegray-deep)" />
      <path d="M392 336 Q400 318 408 336" fill="none" stroke="var(--frog-badge)" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
      <ellipse cx="400" cy="330" rx="26" ry="9" fill="var(--frog-bluegray-deep)" />
      <ellipse cx="400" cy="326" rx="26" ry="9" fill="var(--frog-bluegray)" />
      {/* 五块石头围一圈：磨亮的石面 + 各自坐法的磨痕 */}
      {[
        { x: 236, y: 330, rx: 54, ry: 26, wear: [[-14, -6, 22], [12, -4, 16]] },
        { x: 330, y: 396, rx: 50, ry: 24, wear: [[-8, -7, 30]] },
        { x: 486, y: 392, rx: 52, ry: 25, wear: [[-16, -5, 18], [6, -6, 18]] },
        { x: 566, y: 326, rx: 48, ry: 23, wear: [[-6, -6, 26]] },
      ].map((stone, i) => (
        <g key={`stone-${i}`}>
          <ellipse cx={stone.x} cy={stone.y + 6} rx={stone.rx} ry={stone.ry * 0.6} fill="var(--frog-ink)" opacity="0.5" />
          <ellipse cx={stone.x} cy={stone.y} rx={stone.rx} ry={stone.ry} fill="var(--frog-bluegray)" />
          <ellipse cx={stone.x} cy={stone.y - 4} rx={stone.rx * 0.82} ry={stone.ry * 0.6} fill="var(--frog-belly)" opacity="0.22" />
          {stone.wear.map(([wx, wy, ww], j) => (
            <ellipse
              key={`wear-${i}-${j}`}
              cx={stone.x + wx}
              cy={stone.y + wy}
              rx={ww}
              ry={4}
              fill="var(--frog-belly)"
              opacity="0.4"
            />
          ))}
        </g>
      ))}
      {/* 看火的位置：搭白布的第五块石头，离锅最近，没有蛙坐 */}
      <g>
        <ellipse cx="400" cy="416" rx="56" ry="26" fill="var(--frog-ink)" opacity="0.5" />
        <ellipse cx="400" cy="410" rx="54" ry="26" fill="var(--frog-bluegray)" />
        <path d="M352 404 Q400 386 448 404 Q452 420 440 424 Q400 412 360 424 Q348 420 352 404 Z" fill="var(--frog-belly)" opacity="0.92" />
        <path d="M360 424 L356 434 M380 419 L378 430 M420 419 L422 430 M440 424 L444 434" stroke="var(--frog-belly)" strokeWidth="5" strokeLinecap="round" opacity="0.85" />
      </g>
    </g>
  );
}

function CgStubWall() {
  /* 存根墙（批次 CY-111）：理由按大小排，大的在上、小的在下；最小的「累」钉在最前面 */
  const rows: Array<{ y: number; w: number; h: number; count: number }> = [
    { y: 96, w: 92, h: 56, count: 6 },
    { y: 168, w: 76, h: 48, count: 7 },
    { y: 232, w: 62, h: 40, count: 8 },
    { y: 288, w: 50, h: 34, count: 9 },
  ];
  const stubs: Array<{ x: number; y: number; w: number; h: number; rot: number }> = [];
  rows.forEach((row, rowIndex) => {
    const gap = (640 - row.count * row.w) / (row.count + 1);
    for (let i = 0; i < row.count; i++) {
      stubs.push({
        x: 80 + gap * (i + 1) + row.w * i,
        y: row.y + ((rowIndex + i) % 3) * 2,
        w: row.w,
        h: row.h,
        rot: ((rowIndex * 7 + i * 5) % 5) - 2,
      });
    }
  });
  return (
    <g>
      {/* 背景：医务室的墙与台子 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-mianmian)" opacity="0.18" />
      <rect x="0" y="356" width="800" height="94" fill="var(--map-wood)" opacity="0.7" />
      {/* 软木板：钉存根的那面墙 */}
      <rect x="64" y="72" width="672" height="272" rx="10" fill="var(--frog-ink)" opacity="0.12" />
      <rect x="58" y="66" width="672" height="272" rx="10" fill="var(--map-wood)" />
      <rect x="58" y="66" width="672" height="272" rx="10" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.35" />
      {/* 存根：一行比一行小 */}
      {stubs.map((stub, i) => (
        <g key={`stub-${i}`} transform={`rotate(${stub.rot * 0.9} ${stub.x + stub.w / 2} ${stub.y + stub.h / 2})`}>
          <rect x={stub.x} y={stub.y} width={stub.w} height={stub.h} rx="3" fill="var(--frog-belly)" opacity="0.96" />
          <path
            d={`M${stub.x + 8} ${stub.y + stub.h * 0.42} h${stub.w - 20} M${stub.x + 8} ${stub.y + stub.h * 0.62} h${stub.w - 30}`}
            stroke="var(--frog-bluegray)"
            strokeWidth="2"
            opacity="0.5"
            strokeLinecap="round"
          />
          {/* 图钉 */}
          <circle cx={stub.x + stub.w / 2} cy={stub.y + 4} r="2.6" fill="var(--frog-bluegray-deep)" opacity="0.8" />
        </g>
      ))}
      {/* 最小的一张：三指宽，事由栏一个「累」字，钉在整面墙最前面（左上首钉位） */}
      <g transform="rotate(-1.6 104 92)">
        <rect x="76" y="84" width="56" height="40" rx="3" fill="var(--frog-belly)" />
        <rect x="76" y="84" width="56" height="40" rx="3" fill="none" stroke="var(--primary)" strokeWidth="2" opacity="0.75" />
        <text x="104" y="112" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--frog-ink)" opacity="0.85">
          累
        </text>
        <circle cx="104" cy="88" r="3" fill="var(--primary)" opacity="0.9" />
      </g>
      {/* 墙脚小牌：存根回收登记 */}
      <g transform="rotate(-1 620 330)">
        <rect x="556" y="316" width="150" height="30" rx="4" fill="var(--frog-belly)" />
        <rect x="556" y="316" width="150" height="30" rx="4" fill="none" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.3" />
        <text x="631" y="336" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-ink)" opacity="0.75">
          存根回收登记
        </text>
      </g>
    </g>
  );
}

function CgSecondForm() {
  /* 第二份（CY-129）：放假前三天的里间——棉棉在填第二份《关于调整登记表格式的申请》，
     第一份的回执压在台历底下（表式无前例），附件栏夹着那份小字爬出栏外的理由复印件。
     两份之间事由栏一字未改；改的只有附件栏。 */
  return (
    <g>
      {/* 背景：医务室里间的墙，西斜的太阳照进来 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-mianmian)" opacity="0.2" />
      <rect x="0" y="0" width="800" height="318" fill="var(--frog-belly)" opacity="0.35" />
      {/* 右窗：放假前三天，太阳往西边斜 */}
      <rect x="596" y="30" width="172" height="176" rx="6" fill="var(--frog-badge)" opacity="0.16" />
      <rect x="596" y="30" width="172" height="176" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="6" opacity="0.5" />
      <path d="M682 30 v176 M596 118 h172" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.4" />
      {/* 斜光：从窗里铺到桌面 */}
      <polygon points="596,206 768,206 660,450 500,450" fill="var(--frog-badge)" opacity="0.1" />
      {/* 左侧门上的磨砂玻璃：「先登记」四个字 */}
      <rect x="24" y="60" width="150" height="230" rx="8" fill="var(--frog-bluegray)" opacity="0.4" />
      <rect x="24" y="60" width="150" height="230" rx="8" fill="none" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.3" />
      <text x="99" y="96" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
        先登记
      </text>
      {/* 里间的桌子 */}
      <path d="M0 318 L800 308 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 318 L800 308 L800 322 L0 332 Z" fill="hsl(var(--background))" opacity="0.35" />
      {/* 棉棉：坐在桌后，白大褂，名牌 + 挂绳，手按着纸角 */}
      <g>
        <ellipse cx="180" cy="272" rx="56" ry="60" fill="var(--frog-mianmian)" />
        <circle cx="180" cy="180" r="34" fill="var(--frog-mianmian)" />
        <circle cx="192" cy="176" r="3.4" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="168" cy="176" r="3.4" fill="var(--frog-ink)" opacity="0.85" />
        <path d="M172 192 q8 5 16 0" stroke="var(--frog-ink)" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.6" />
        {/* 白大褂的翻领：从下巴垂下的两条白边 */}
        <path d="M152 212 L172 252 M208 212 L188 252" stroke="var(--frog-belly)" strokeWidth="10" strokeLinecap="round" opacity="0.95" />
        {/* 胸牌与挂绳 */}
        <path d="M166 226 L180 250 L194 226" stroke="var(--frog-ink)" strokeWidth="2.4" fill="none" opacity="0.55" />
        <rect x="166" y="248" width="28" height="36" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.95" />
        <path d="M172 258 h16 M172 266 h12" stroke="var(--frog-mianmian-deep)" strokeWidth="2" opacity="0.8" />
        {/* 手：按住第二份申请的纸角 */}
        <path d="M232 250 Q282 276 318 316" stroke="var(--frog-mianmian-deep)" strokeWidth="13" fill="none" strokeLinecap="round" />
      </g>
      {/* 桌面正中：第二份《关于调整登记表格式的申请》 */}
      <g transform="rotate(-2 396 374)">
        <rect x="300" y="330" width="196" height="98" rx="3" fill="var(--frog-ink)" opacity="0.14" />
        <rect x="296" y="326" width="196" height="98" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.98" />
        <text x="394" y="344" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--frog-ink)" opacity="0.8">
          关于调整登记表格式的申请
        </text>
        {/* 事由栏：四个字，字很小 */}
        <path d="M310 354 h168 M310 354 v16 M478 354 v16" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.35" fill="none" />
        <text x="320" y="366" fontSize="9" fontWeight="700" fill="var(--frog-ink)" opacity="0.75">
          蛙的话多
        </text>
        {/* 附件栏：写着「理由原件复印件一页」，字小得贴着边 */}
        <path d="M310 376 h168 M310 376 v16 M478 376 v16" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.35" fill="none" />
        <text x="320" y="388" fontSize="8.5" fill="var(--frog-bluegray-deep)" opacity="0.8">
          理由原件复印件一页
        </text>
        {/* 附件复印件压在表的下沿：小字爬出栏外，伸到装订线，第七行只有一半 */}
        <g transform="translate(320 392)">
          <rect x="0" y="0" width="88" height="26" rx="1" fill="hsl(var(--card))" opacity="0.9" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={`line-${i}`} d={`M4 ${4 + i * 3.6} h${64 - (i % 3) * 6}`} stroke="var(--frog-ink)" strokeWidth="0.9" opacity="0.45" strokeLinecap="round" />
          ))}
          {/* 第七行只写了一半 */}
          <path d="M4 25.6 h26" stroke="var(--frog-ink)" strokeWidth="0.9" opacity="0.45" strokeLinecap="round" />
          {/* 装订线：小字一直伸到它上面 */}
          <path d="M84 0 v26" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.5" strokeDasharray="2 2" />
        </g>
      </g>
      {/* 台历：回执角露在外面——圆章 + 「表式无前例」五个字 */}
      <g transform="rotate(2 556 356)">
        <rect x="516" y="330" width="80" height="58" rx="4" fill="var(--frog-cream)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.95" />
        <rect x="516" y="330" width="80" height="16" rx="4" fill="var(--frog-bow)" opacity="0.55" />
        {/* 回执角：从台历底下露出 */}
        <g transform="rotate(-4 596 396)">
          <rect x="560" y="374" width="54" height="26" rx="2" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.95" />
          <circle cx="572" cy="387" r="7" fill="none" stroke="var(--frog-bow)" strokeWidth="1.6" opacity="0.8" />
          <path d="M567 387 h10 M572 382 v10" stroke="var(--frog-bow)" strokeWidth="1.2" opacity="0.7" />
          <text x="594" y="390" fontSize="6.5" fontWeight="700" fill="var(--frog-ink)" opacity="0.75">
            表式无前例
          </text>
        </g>
      </g>
      {/* 「待发」文件盘：第二份睡在最上面 */}
      <g>
        <rect x="648" y="356" width="110" height="44" rx="4" fill="var(--frog-ink)" opacity="0.18" />
        <rect x="652" y="360" width="102" height="36" rx="3" fill="var(--frog-khaki)" opacity="0.9" />
        <rect x="656" y="356" width="94" height="8" rx="2" fill="var(--frog-belly)" opacity="0.95" />
        <text x="703" y="382" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
          待发
        </text>
      </g>
      {/* 脚边纸箱：旧册子与对照表的旧版本 */}
      <g>
        <rect x="60" y="380" width="180" height="66" rx="4" fill="var(--frog-khaki-deep)" opacity="0.85" />
        <path d="M60 380 h180 M60 380 v66 M240 380 v66" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.35" />
        <path d="M150 380 v66" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.3" />
        {/* 旧册子的书脊露在箱口 */}
        <rect x="70" y="368" width="34" height="16" rx="2" fill="var(--frog-belly)" opacity="0.9" />
        <rect x="108" y="366" width="30" height="18" rx="2" fill="var(--frog-cream)" opacity="0.9" />
        <rect x="142" y="370" width="26" height="14" rx="2" fill="var(--frog-belly)" opacity="0.85" />
        <path d="M76 374 h22 M114 372 h18 M148 376 h14" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.3" />
      </g>
      {/* 桌角计时器：翻回了三十分钟 */}
      <g>
        <rect x="486" y="296" width="46" height="30" rx="4" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.9" />
        <text x="509" y="316" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--frog-bow)" opacity="0.9">
          30
        </text>
      </g>
    </g>
  );
}

function CgLastPage() {
  /* 最后一页（CY-132）：期末最后一天的收工——登记册翻到最后一页，从第一页往回数；
     「待发」盘里第二份还睡在最上面，台历翻到最后一页，回执角还压在底下。
     新学期的表还没印。她数的不是蛙，是那一栏每学期宽一点的那一点。 */
  return (
    <g>
      {/* 背景：医务室里间，期末最后一天的天色 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-mianmian)" opacity="0.18" />
      <rect x="0" y="0" width="800" height="320" fill="var(--frog-belly)" opacity="0.3" />
      {/* 右窗：太阳压得很低，影子拉长 */}
      <rect x="596" y="36" width="168" height="168" rx="6" fill="var(--frog-badge)" opacity="0.14" />
      <rect x="596" y="36" width="168" height="168" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="6" opacity="0.5" />
      <path d="M680 36 v168 M596 120 h168" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.4" />
      <polygon points="596,204 764,204 640,450 480,450" fill="var(--frog-badge)" opacity="0.09" />
      {/* 左侧磨砂玻璃门：先登记 */}
      <rect x="24" y="64" width="146" height="226" rx="8" fill="var(--frog-bluegray)" opacity="0.38" />
      <rect x="24" y="64" width="146" height="226" rx="8" fill="none" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.3" />
      <text x="97" y="98" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--frog-ink)" opacity="0.58">
        先登记
      </text>
      {/* 桌面 */}
      <path d="M0 320 L800 310 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 320 L800 310 L800 324 L0 334 Z" fill="hsl(var(--background))" opacity="0.35" />
      {/* 登记册：翻到最后一页，从第一页往回数 */}
      <g transform="rotate(-1.6 330 380)">
        <rect x="212" y="330" width="236" height="96" rx="4" fill="var(--frog-khaki)" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.95" />
        <rect x="222" y="340" width="216" height="76" rx="2" fill="var(--frog-belly)" opacity="0.95" />
        {/* 往回数留下的行：一行一页脚小点 */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={`row-${i}`}>
            <path d={`M232 ${352 + i * 11} h${168 - (i % 4) * 22}`} stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.28" strokeLinecap="round" />
            <circle cx={396} cy={352 + i * 11} r="1.6" fill="var(--frog-ink)" opacity="0.4" />
          </g>
        ))}
        {/* 最后一页的页脚：一个没写字的点名 */}
        <circle cx="396" cy="418" r="3" fill="var(--frog-bow)" opacity="0.8" />
      </g>
      {/* 棉棉：站在桌后，手还搭在册子上，笔搁着 */}
      <g>
        <ellipse cx="140" cy="276" rx="54" ry="58" fill="var(--frog-mianmian)" />
        <circle cx="140" cy="186" r="32" fill="var(--frog-mianmian)" />
        <circle cx="152" cy="182" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="128" cy="182" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <path d="M132 198 q8 5 16 0" stroke="var(--frog-ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
        <path d="M116 216 L134 252 M164 216 L146 252" stroke="var(--frog-belly)" strokeWidth="9" strokeLinecap="round" opacity="0.95" />
        <path d="M136 226 L140 248 L144 226" stroke="var(--frog-ink)" strokeWidth="2.2" fill="none" opacity="0.5" />
        <rect x="128" y="246" width="24" height="32" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.5" opacity="0.95" />
        {/* 手搭在册子边上 */}
        <path d="M188 250 Q222 292 246 340" stroke="var(--frog-mianmian-deep)" strokeWidth="12" fill="none" strokeLinecap="round" />
      </g>
      {/* 「待发」盘：第二份还睡在最上面，盘盖刚合上 */}
      <g>
        <rect x="500" y="360" width="120" height="46" rx="4" fill="var(--frog-ink)" opacity="0.18" />
        <rect x="504" y="364" width="112" height="38" rx="3" fill="var(--frog-khaki)" opacity="0.9" />
        <rect x="510" y="360" width="100" height="9" rx="2" fill="var(--frog-belly)" opacity="0.95" />
        <text x="560" y="388" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
          待发
        </text>
      </g>
      {/* 台历：翻到最后一页，回执角还压在底下 */}
      <g transform="rotate(2 660 350)">
        <rect x="632" y="326" width="64" height="58" rx="4" fill="var(--frog-cream)" stroke="var(--frog-ink)" strokeWidth="1.5" opacity="0.95" />
        <rect x="632" y="326" width="64" height="14" rx="4" fill="var(--frog-bow)" opacity="0.5" />
        <text x="664" y="358" textAnchor="middle" fontSize="8" fill="var(--frog-ink)" opacity="0.55">
          期末
        </text>
        <g transform="rotate(-5 690 392)">
          <rect x="672" y="380" width="44" height="22" rx="2" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.1" opacity="0.95" />
          <circle cx="682" cy="391" r="6" fill="none" stroke="var(--frog-bow)" strokeWidth="1.4" opacity="0.75" />
          <path d="M678 391 h8 M682 387 v8" stroke="var(--frog-bow)" strokeWidth="1" opacity="0.65" />
        </g>
      </g>
      {/* 笔搁在册子上——数完了 */}
      <g transform="rotate(24 470 352)">
        <rect x="462" y="346" width="6" height="34" rx="3" fill="hsl(var(--primary))" opacity="0.8" />
        <path d="M462 378 L468 378 L465 388 Z" fill="var(--frog-ink)" opacity="0.7" />
      </g>
    </g>
  );
}

/* ---------- CY-133：六集番外的开场定格（不进 CG_SCENES——番外属于好感名册，不算剧情定格分母） ---------- */

function CgSideMomo() {
  /* 零点一分：凌晨三点五十的图书馆只剩她那盏台灯；
     文件袋最里层抽出一张大一的成绩单，差两分——课堂讨论，参与分。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      <rect x="0" y="0" width="800" height="300" fill="var(--frog-ink)" opacity="0.3" />
      <rect x="580" y="36" width="180" height="190" rx="6" fill="var(--frog-ink)" opacity="0.62" />
      <rect x="580" y="36" width="180" height="190" rx="6" fill="none" stroke="hsl(var(--primary))" strokeWidth="6" opacity="0.4" />
      <path d="M0 300 L800 290 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 300 L800 290 L800 304 L0 314 Z" fill="hsl(var(--background))" opacity="0.35" />
      {/* 台灯：整层楼只剩这一盏 */}
      <path d="M168 150 L214 196" stroke="var(--frog-ink)" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
      <path d="M196 136 q40 -22 66 14 l-62 34 z" fill="var(--frog-ink)" opacity="0.85" />
      <ellipse cx="238" cy="216" rx="70" ry="16" fill="var(--frog-badge)" opacity="0.16" />
      {/* 抹抹：递成绩单的手停在半空 */}
      <g>
        <ellipse cx="150" cy="268" rx="52" ry="56" fill="var(--frog-matcha)" />
        <circle cx="150" cy="184" r="31" fill="var(--frog-matcha)" />
        <circle cx="162" cy="180" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="138" cy="180" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <path d="M142 196 q8 5 16 0" stroke="var(--frog-ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
        <path d="M126 214 q10 -12 24 -8" stroke="var(--frog-matcha-deep)" strokeWidth="9" fill="none" strokeLinecap="round" />
        {/* 递出的手 */}
        <path d="M196 244 Q250 262 296 288" stroke="var(--frog-matcha-deep)" strokeWidth="12" fill="none" strokeLinecap="round" />
      </g>
      {/* 成绩单：大一的，折痕横一道竖一道，边角磨圆 */}
      <g transform="rotate(-3 420 352)">
        <rect x="336" y="300" width="176" height="106" rx="4" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.97" />
        <path d="M336 340 h176 M336 384 h176" stroke="var(--frog-ink)" strokeWidth="1.1" opacity="0.22" />
        <path d="M424 300 v106" stroke="var(--frog-ink)" strokeWidth="1.1" opacity="0.22" />
        <text x="348" y="322" fontSize="9" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
          成绩单 · 大一
        </text>
        <text x="348" y="356" fontSize="11" fontWeight="800" fill="var(--frog-ink)" opacity="0.85">
          3.9
        </text>
        <path d="M348 366 h96 M348 378 h78" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.28" />
        <rect x="452" y="366" width="52" height="14" rx="2" fill="var(--frog-bow)" opacity="0.22" />
        <text x="478" y="377" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="var(--frog-bow-deep)" opacity="0.9">
          差两分
        </text>
      </g>
      {/* 文件袋：最里层空了一格 */}
      <g transform="rotate(2 640 372)">
        <rect x="576" y="322" width="130" height="94" rx="6" fill="var(--frog-khaki)" opacity="0.85" />
        <path d="M576 322 L706 322 L706 416 L576 416 Z" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.3" />
        <path d="M640 322 v94" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.2" strokeDasharray="4 4" />
      </g>
    </g>
  );
}

function CgSideMeimei() {
  /* 草稿箱：傍晚六点的社团活动中心空了，她坐在舞台边上；
     手机亮了又灭——草稿箱右上角 47，点开那篇三行的。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-berry)" opacity="0.14" />
      <rect x="0" y="0" width="800" height="320" fill="var(--frog-berry)" opacity="0.2" />
      {/* 舞台边沿：傍晚空场 */}
      <path d="M0 320 L800 310 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 320 L800 310 L800 324 L0 334 Z" fill="hsl(var(--background))" opacity="0.3" />
      {/* 舞台的灯：一半亮着 */}
      <rect x="60" y="40" width="640" height="10" rx="5" fill="var(--frog-ink)" opacity="0.2" />
      <ellipse cx="220" cy="52" rx="90" ry="12" fill="var(--frog-badge)" opacity="0.14" />
      <ellipse cx="560" cy="52" rx="90" ry="12" fill="var(--frog-ink)" opacity="0.35" />
      {/* 莓莓：坐在舞台边，腿收上舞台，手机递过来 */}
      <g>
        <ellipse cx="200" cy="252" rx="54" ry="56" fill="var(--frog-berry)" />
        <circle cx="200" cy="168" r="32" fill="var(--frog-berry)" />
        <circle cx="212" cy="164" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="188" cy="164" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        {/* 头上的蝴蝶结 */}
        <path d="M232 148 q16 -10 22 2 q-14 6 -22 -2 z" fill="var(--frog-bow)" opacity="0.9" />
        {/* 永远上扬的嘴角：这次笑得比平时小一点 */}
        <path d="M192 180 q9 4 18 0" stroke="var(--frog-ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
        <path d="M246 240 Q300 270 348 300" stroke="var(--frog-berry-deep)" strokeWidth="12" fill="none" strokeLinecap="round" />
      </g>
      {/* 手机屏幕：草稿箱 47 */}
      <g transform="rotate(-4 480 366)">
        <rect x="428" y="300" width="104" height="132" rx="10" fill="var(--frog-ink)" opacity="0.8" />
        <rect x="434" y="306" width="92" height="120" rx="6" fill="hsl(var(--card))" opacity="0.95" />
        <text x="480" y="324" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
          草稿箱
        </text>
        <text x="514" y="322" fontSize="10" fontWeight="800" fill="var(--frog-berry-deep)" opacity="0.9">
          47
        </text>
        {[0, 1, 2, 3].map((i) => (
          <path key={`draft-${i}`} d={`M442 ${340 + i * 14} h${64 - (i % 3) * 10}`} stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.3" strokeLinecap="round" />
        ))}
        {/* 点开的那篇：三行 */}
        <rect x="442" y="396" width="76" height="24" rx="2" fill="var(--frog-berry)" opacity="0.2" />
        <path d="M446 404 h56 M446 411 h48 M446 418 h38" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.45" strokeLinecap="round" />
      </g>
      {/* 发送键的位置：她比划过的那一下 */}
      <circle cx="516" cy="392" r="12" fill="none" stroke="var(--frog-bow)" strokeWidth="1.6" opacity="0.5" strokeDasharray="3 3" />
    </g>
  );
}

function CgSideHuihui() {
  /* 接住：黄昏的草坪，他难得坐起来了，抱着膝盖；
     远处跑道还在，太阳落到操场边上。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.2" />
      <rect x="0" y="0" width="800" height="260" fill="var(--frog-badge)" opacity="0.14" />
      {/* 太阳落到操场边上 */}
      <circle cx="700" cy="216" r="34" fill="var(--frog-badge)" opacity="0.35" />
      <polygon points="0,260 800,252 800,450 0,450" fill="var(--frog-matcha)" opacity="0.4" />
      {/* 远处跑道：绊倒的那一段 */}
      <path d="M0 300 L800 294 L800 322 L0 328 Z" fill="var(--frog-bluegray-deep)" opacity="0.4" />
      <path d="M120 302 h96 M300 301 h96 M480 300 h96" stroke="hsl(var(--background))" strokeWidth="2" opacity="0.25" strokeDasharray="14 10" />
      {/* 草坪 */}
      <path d="M0 322 L800 316 L800 450 L0 450 Z" fill="var(--frog-matcha-deep)" opacity="0.5" />
      {/* 灰灰：坐着的姿势（难得），抱着膝盖 */}
      <g>
        <ellipse cx="260" cy="330" rx="52" ry="50" fill="var(--frog-bluegray)" />
        <circle cx="260" cy="252" r="30" fill="var(--frog-bluegray)" />
        <circle cx="270" cy="248" r="3" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="250" cy="248" r="3" fill="var(--frog-ink)" opacity="0.85" />
        {/* 黑眼圈 */}
        <path d="M262 258 q8 4 14 0 M244 258 q8 4 12 0" stroke="var(--frog-ink)" strokeWidth="1.6" fill="none" opacity="0.4" />
        {/* 抱膝的手臂 */}
        <path d="M216 306 Q240 276 262 296 Q282 316 304 336" stroke="var(--frog-bluegray-deep)" strokeWidth="12" fill="none" strokeLinecap="round" />
      </g>
      {/* 旁边的空位：他拍过的地方 */}
      <ellipse cx="380" cy="386" rx="46" ry="10" fill="var(--frog-matcha-deep)" opacity="0.5" />
      {/* 拔的那根草，在手里转 */}
      <path d="M296 330 q14 -6 26 4" stroke="var(--frog-matcha-deep)" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.8" />
      <circle cx="330" cy="336" r="2.4" fill="var(--frog-matcha-deep)" opacity="0.8" />
    </g>
  );
}

function CgSideGanfanshu() {
  /* 不吃饭的名单：打烊的食堂只开半边灯，他从抽屉里拿出那本薄账——
     记的是谁来过、饭没吃完；谁三天没来。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-apron)" opacity="0.18" />
      <rect x="0" y="0" width="800" height="320" fill="var(--frog-ink)" opacity="0.26" />
      {/* 半边灯 */}
      <rect x="0" y="0" width="420" height="450" fill="var(--frog-badge)" opacity="0.1" />
      <path d="M120 46 h120" stroke="var(--frog-ink)" strokeWidth="6" opacity="0.35" />
      <path d="M150 60 q30 16 60 0" stroke="var(--frog-badge)" strokeWidth="10" fill="none" strokeLinecap="round" opacity="0.4" />
      {/* 台面 */}
      <path d="M0 320 L800 310 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 320 L800 310 L800 324 L0 334 Z" fill="hsl(var(--background))" opacity="0.3" />
      {/* 抽屉拉开 */}
      <g>
        <rect x="96" y="332" width="150" height="70" rx="4" fill="var(--frog-ink)" opacity="0.22" />
        <rect x="102" y="338" width="138" height="58" rx="3" fill="var(--map-wood)" opacity="0.9" />
        <path d="M171 396 v-14" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.4" />
      </g>
      {/* 干饭叔：抹布搭在肩上，另一只手端汤锅 */}
      <g>
        <ellipse cx="392" cy="268" rx="58" ry="60" fill="var(--frog-apron)" />
        <circle cx="392" cy="180" r="33" fill="var(--frog-apron)" />
        <circle cx="404" cy="176" r="3.4" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="380" cy="176" r="3.4" fill="var(--frog-ink)" opacity="0.85" />
        <path d="M384 192 q8 4 16 0" stroke="var(--frog-ink)" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.55" />
        {/* 围裙 */}
        <path d="M356 236 h72 v46 q-36 12 -72 0 z" fill="var(--frog-cream)" opacity="0.9" />
        <path d="M380 236 h40 v14 h-40 z" fill="var(--frog-cream-deep)" opacity="0.5" />
        {/* 抹布搭肩 */}
        <path d="M344 226 q-18 -10 -12 -28" stroke="var(--frog-cream)" strokeWidth="9" fill="none" strokeLinecap="round" opacity="0.9" />
        {/* 汤锅 */}
        <path d="M468 232 q40 -10 74 8 q-8 26 -40 28 q-32 2 -34 -36 z" fill="var(--frog-khaki-deep)" opacity="0.9" />
        <path d="M470 232 q40 -10 74 8" stroke="var(--frog-ink)" strokeWidth="2.4" fill="none" opacity="0.4" />
      </g>
      {/* 薄账本：名字 + 日期，最后一页那行小字 */}
      <g transform="rotate(-2 604 372)">
        <rect x="528" y="322" width="152" height="100" rx="3" fill="var(--frog-khaki)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.95" />
        <path d="M528 322 v100" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.35" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={`row-${i}`}>
            <path d={`M542 ${340 + i * 14} h34`} stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.4" strokeLinecap="round" />
            <path d={`M588 ${340 + i * 14} h${30 - (i % 2) * 8}`} stroke="var(--frog-bluegray-deep)" strokeWidth="1.2" opacity="0.32" strokeLinecap="round" />
          </g>
        ))}
        <text x="542" y="412" fontSize="6.5" fill="var(--frog-ink)" opacity="0.55">
          此本记满，说明硬撑的蛙太多
        </text>
      </g>
    </g>
  );
}

function CgSideZaizai() {
  /* 差六天：自习楼四楼凌晨四点，倒计时牌停在「差六天」——它从来没从六天开始倒数过。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      <rect x="0" y="0" width="800" height="300" fill="var(--frog-ink)" opacity="0.34" />
      {/* 那一格灯 */}
      <rect x="330" y="0" width="140" height="8" rx="4" fill="var(--frog-badge)" opacity="0.4" />
      <polygon points="330,8 470,8 560,300 240,300" fill="var(--frog-badge)" opacity="0.08" />
      {/* 桌面 */}
      <path d="M0 300 L800 292 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 300 L800 292 L800 306 L0 314 Z" fill="hsl(var(--background))" opacity="0.35" />
      {/* 再再：笔还在走，没抬头 */}
      <g>
        <ellipse cx="196" cy="272" rx="52" ry="56" fill="var(--frog-zzaizai)" />
        <circle cx="196" cy="188" r="31" fill="var(--frog-zzaizai)" />
        <circle cx="208" cy="184" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="184" cy="184" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        {/* 厚眼袋 */}
        <path d="M200 194 q9 4 14 0 M182 194 q7 4 12 0" stroke="var(--frog-ink)" strokeWidth="1.6" fill="none" opacity="0.45" />
        {/* 书包立在两脚中间 */}
        <rect x="236" y="300" width="46" height="66" rx="8" fill="var(--frog-bag)" opacity="0.9" />
        <path d="M244 318 h30 M244 332 h22" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.3" />
      </g>
      {/* 倒计时牌：差六天 */}
      <g transform="rotate(-2 470 352)">
        <rect x="404" y="304" width="132" height="96" rx="4" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.95" />
        <rect x="404" y="304" width="132" height="20" rx="4" fill="var(--frog-zzaizai)" opacity="0.7" />
        <text x="470" y="352" textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--frog-ink)" opacity="0.85">
          差六天
        </text>
        <path d="M420 372 h100 M420 384 h80" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.25" />
      </g>
      {/* 草稿纸：一个字的半边，橡皮的痕迹比笔画重 */}
      <g transform="rotate(3 636 380)">
        <rect x="572" y="330" width="128" height="94" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.95" />
        <path d="M586 356 h44" stroke="var(--frog-ink)" strokeWidth="2.6" opacity="0.5" strokeLinecap="round" />
        <path d="M582 348 q22 -10 52 -4 q-24 8 -52 4 z" fill="hsl(var(--muted))" opacity="0.85" />
        <path d="M586 386 h64 M586 398 h48" stroke="var(--frog-ink)" strokeWidth="1.3" opacity="0.22" />
      </g>
      {/* 保温杯：空了，还是做了拧盖的动作 */}
      <g>
        <rect x="512" y="308" width="30" height="46" rx="6" fill="var(--frog-cream)" opacity="0.9" />
        <rect x="512" y="304" width="30" height="10" rx="5" fill="var(--frog-zzaizai-deep)" opacity="0.8" />
      </g>
    </g>
  );
}

function CgSideGege() {
  /* 原文：晚上十点的学工办，归档这一盏灯；一摞表格边缘对齐、章盖在同一个角度；
     铅笔原文写在纸质表的背面——铅笔不会覆盖，只会越来越淡。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-gege)" opacity="0.16" />
      <rect x="0" y="0" width="800" height="320" fill="var(--frog-ink)" opacity="0.3" />
      {/* 归档灯 */}
      <rect x="300" y="30" width="200" height="8" rx="4" fill="var(--frog-badge)" opacity="0.35" />
      <polygon points="300,38 500,38 580,320 220,320" fill="var(--frog-badge)" opacity="0.07" />
      {/* 桌面 */}
      <path d="M0 320 L800 310 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 320 L800 310 L800 324 L0 334 Z" fill="hsl(var(--background))" opacity="0.32" />
      {/* 格格：工牌翻过来扣在桌上，收着当天的表 */}
      <g>
        <ellipse cx="176" cy="272" rx="54" ry="58" fill="var(--frog-gege)" />
        <circle cx="176" cy="186" r="32" fill="var(--frog-gege)" />
        <circle cx="188" cy="182" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="164" cy="182" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <path d="M168 198 q8 4 16 0" stroke="var(--frog-ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
        <path d="M160 218 L174 250 M192 218 L178 250" stroke="var(--frog-gege-deep)" strokeWidth="9" strokeLinecap="round" opacity="0.9" />
        <path d="M226 252 Q268 292 306 330" stroke="var(--frog-gege-deep)" strokeWidth="12" fill="none" strokeLinecap="round" />
      </g>
      {/* 一摞表格：边缘对齐，章盖在同一角度 */}
      <g transform="rotate(-2 420 380)">
        {[0, 1, 2, 3].map((i) => (
          <g key={`sheet-${i}`}>
            <rect x={352 - i * 3} y={318 - i * 5} width="150" height="104" rx="2" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.92" />
          </g>
        ))}
        <circle cx="474" cy="400" r="11" fill="none" stroke="hsl(var(--destructive))" strokeOpacity="0.7" strokeWidth="2.2" />
        <path d="M469 400 h10 M474 395 v10" stroke="hsl(var(--destructive))" strokeOpacity="0.6" strokeWidth="1.5" />
      </g>
      {/* 翻过来的那张：背面有铅笔写的原文，很淡 */}
      <g transform="rotate(3 620 374)">
        <rect x="556" y="324" width="128" height="98" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.9" />
        <path d="M568 344 h96" stroke="var(--frog-ink)" strokeWidth="0.2" opacity="0" />
        {/* 铅笔原文：很淡的七个字 */}
        <path d="M570 352 h84" stroke="var(--frog-ink)" strokeWidth="1.3" opacity="0.18" strokeLinecap="round" />
        <path d="M570 366 h70" stroke="var(--frog-ink)" strokeWidth="1.3" opacity="0.15" strokeLinecap="round" />
        <text x="570" y="342" fontSize="7" fill="var(--frog-ink)" opacity="0.45">
          原文 · 七个字
        </text>
        {/* 透明胶揭过的两道痕 */}
        <path d="M560 388 h40 M560 396 h28" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.12" strokeLinecap="round" />
      </g>
    </g>
  );
}

/* ---------- CY-134：三集专属番外的开场定格（同口径：不进 CG_SCENES——专属档属于名册附页） ---------- */

function CgSideGegeExclusive() {
  /* 补发：月末最后一个周五 21:30，学工办只剩归档这一盏灯；
     文件柜一格一个月、标签朝外，最底那格比别的都厚——抽出来放在桌上，没打开。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-gege)" opacity="0.16" />
      <rect x="0" y="0" width="800" height="320" fill="var(--frog-ink)" opacity="0.34" />
      {/* 归档灯：只照半张桌 */}
      <rect x="250" y="34" width="150" height="8" rx="4" fill="var(--frog-badge)" opacity="0.3" />
      <polygon points="250,42 400,42 460,320 190,320" fill="var(--frog-badge)" opacity="0.07" />
      {/* 桌面 */}
      <path d="M0 320 L800 310 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 320 L800 310 L800 324 L0 334 Z" fill="hsl(var(--background))" opacity="0.32" />
      {/* 文件柜：一格一个月，最底一格最厚 */}
      <g>
        <rect x="486" y="92" width="252" height="220" rx="8" fill="var(--frog-khaki)" opacity="0.68" />
        <rect x="486" y="92" width="252" height="220" rx="8" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.35" />
        {["第四个月", "第三个月", "第二个月", "第一个月"].map((label, i) => (
          <g key={`cell-${i}`}>
            <rect x="502" y={106 + i * 50} width="220" height="38" rx="3" fill="var(--frog-belly)" opacity={i === 3 ? 1 : 0.5} stroke="var(--frog-ink)" strokeWidth="1.2" strokeOpacity="0.28" />
            <text x="512" y={130 + i * 50} fontSize="9" fontWeight="700" fill="var(--frog-ink)" opacity={i === 3 ? 0.85 : 0.4}>
              {label}
            </text>
          </g>
        ))}
      </g>
      {/* 格格：抽出来的那格按在桌上，没打开 */}
      <g>
        <ellipse cx="150" cy="272" rx="52" ry="56" fill="var(--frog-gege)" />
        <circle cx="150" cy="186" r="31" fill="var(--frog-gege)" />
        <circle cx="162" cy="182" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="138" cy="182" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <path d="M142 198 q8 4 16 0" stroke="var(--frog-ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
        <path d="M200 254 Q248 288 296 318" stroke="var(--frog-gege-deep)" strokeWidth="12" fill="none" strokeLinecap="round" />
      </g>
      {/* 桌上那格：开学第一个月的，比哪格都厚 */}
      <g transform="rotate(-2 420 378)">
        <rect x="318" y="330" width="150" height="94" rx="4" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.97" />
        <rect x="318" y="412" width="150" height="12" rx="3" fill="var(--frog-khaki-deep)" opacity="0.5" />
        <text x="330" y="352" fontSize="9" fontWeight="700" fill="var(--frog-ink)" opacity="0.75">
          开学第一个月
        </text>
        <path d="M330 368 h118 M330 382 h94" stroke="var(--frog-ink)" strokeWidth="1.3" opacity="0.26" />
        {/* 标签朝外 */}
        <rect x="452" y="336" width="12" height="26" rx="2" fill="var(--frog-khaki-deep)" opacity="0.75" />
      </g>
    </g>
  );
}

function CgSideMomoExclusive() {
  /* 空一次：下午两点半的图书馆，人最少的一小时；
     第十四版计划表一格一格——只有一格空着，排进去的是「空」。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--card))" />
      {/* 下午的光：从右边的大窗进来 */}
      <rect x="556" y="30" width="206" height="252" rx="6" fill="var(--frog-badge)" opacity="0.24" />
      <rect x="556" y="30" width="206" height="252" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.22" />
      <path d="M659 30 v252 M556 156 h206" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.18" />
      <polygon points="556,282 762,282 800,450 380,450" fill="var(--frog-badge)" opacity="0.09" />
      {/* 长桌 */}
      <path d="M0 300 L800 292 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 300 L800 292 L800 306 L0 314 Z" fill="hsl(var(--background))" opacity="0.35" />
      {/* 抹抹：白天的图书馆，眼镜留在脸上，爪停在表的边角 */}
      <g>
        <ellipse cx="150" cy="264" rx="52" ry="56" fill="var(--frog-matcha)" />
        <circle cx="150" cy="180" r="31" fill="var(--frog-matcha)" />
        <circle cx="162" cy="176" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="138" cy="176" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <path d="M142 192 q8 5 16 0" stroke="var(--frog-ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
        {/* 眼镜：白天戴着 */}
        <circle cx="138" cy="176" r="7" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.55" />
        <circle cx="162" cy="176" r="7" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.55" />
        <path d="M198 250 Q246 280 292 306" stroke="var(--frog-matcha-deep)" strokeWidth="12" fill="none" strokeLinecap="round" />
      </g>
      {/* 第十四版计划表：一格一格，只有一格空着 */}
      <g transform="rotate(-2 470 374)">
        <rect x="348" y="314" width="212" height="118" rx="4" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.97" />
        <text x="358" y="330" fontSize="8" fontWeight="700" fill="var(--frog-ink)" opacity="0.55">
          计划表 · 第十四版
        </text>
        {[0, 1, 2, 3].map((i) => (
          <g key={`row-${i}`}>
            {i === 1 ? (
              /* 空着的那格：不是没填，是排进去的「空」 */
              <rect x="358" y={342 + i * 20} width="54" height="14" rx="2" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.6" opacity="0.75" />
            ) : (
              <path d={`M358 ${349 + i * 20} h${152 - (i % 3) * 18}`} stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.3" strokeLinecap="round" />
            )}
            <path d={`M426 ${342 + i * 20} h122`} stroke="var(--frog-ink)" strokeWidth="1.1" opacity="0.2" strokeDasharray="3 4" />
          </g>
        ))}
        {/* 钢笔：笔帽没拧上 */}
        <g transform="rotate(18 610 400)">
          <rect x="604" y="386" width="5" height="30" rx="2.5" fill="var(--frog-ink)" opacity="0.7" />
        </g>
      </g>
    </g>
  );
}

function CgSideMeimeiExclusive() {
  /* 原图：晚上十点四十的宿舍楼道口，声控灯亮一半；
     手机扣在膝盖上——相册里那个叫「原图」的文件夹，213 张，一张没删过。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-berry)" opacity="0.12" />
      <rect x="0" y="0" width="800" height="300" fill="var(--frog-ink)" opacity="0.4" />
      {/* 声控灯：亮一半 */}
      <rect x="392" y="40" width="22" height="10" rx="5" fill="var(--frog-badge)" opacity="0.4" />
      <ellipse cx="403" cy="58" rx="120" ry="14" fill="var(--frog-badge)" opacity="0.16" />
      {/* 台阶：一级一级往下 */}
      {[0, 1, 2].map((i) => (
        <g key={`step-${i}`}>
          <rect x="0" y={298 + i * 51} width="800" height="52" fill="var(--map-wood)" opacity={0.9 - i * 0.14} />
          <path d={`M0 ${298 + i * 51} h800`} stroke="var(--frog-ink)" strokeWidth="2" opacity="0.2" />
        </g>
      ))}
      {/* 莓莓：坐在最下面那级，手机扣着，蝴蝶结没戴 */}
      <g>
        <ellipse cx="196" cy="330" rx="52" ry="54" fill="var(--frog-berry)" />
        <circle cx="196" cy="248" r="31" fill="var(--frog-berry)" />
        <circle cx="208" cy="244" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="184" cy="244" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        {/* 没戴蝴蝶结的笑：歪了一点点 */}
        <path d="M188 260 q10 6 20 -1" stroke="var(--frog-ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.62" />
        {/* 手机扣在膝盖上 */}
        <rect x="176" y="356" width="46" height="30" rx="5" fill="var(--frog-ink)" opacity="0.8" transform="rotate(-6 199 371)" />
      </g>
      {/* 两张并排的：同一秒，一张修过，一张原图 */}
      <g transform="rotate(-3 430 386)">
        <rect x="352" y="344" width="118" height="86" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.95" />
        <text x="362" y="362" fontSize="8" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
          发出去的
        </text>
        <circle cx="410" cy="392" r="17" fill="var(--frog-berry)" opacity="0.55" />
        <path d="M396 392 q14 8 28 0" stroke="var(--frog-ink)" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.5" />
      </g>
      <g transform="rotate(3 580 392)">
        <rect x="512" y="348" width="118" height="86" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.92" />
        <text x="522" y="366" fontSize="8" fontWeight="700" fill="var(--frog-ink)" opacity="0.6">
          原图
        </text>
        <circle cx="570" cy="396" r="17" fill="var(--frog-berry)" opacity="0.4" />
        {/* 同一秒：睫毛上还挂着点东西，笑没摆好 */}
        <path d="M556 396 q16 4 28 2" stroke="var(--frog-ink)" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.5" />
        <circle cx="584" cy="386" r="1.8" fill="var(--frog-sweat)" opacity="0.8" />
      </g>
      {/* 那张糊的：哭着拍的，糊得只剩颜色 */}
      <g transform="rotate(-7 700 414)">
        <rect x="656" y="384" width="86" height="62" rx="3" fill="var(--frog-berry)" opacity="0.28" stroke="var(--frog-ink)" strokeWidth="1.2" strokeDasharray="4 3" />
        <path d="M668 408 h40 M676 420 h28" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.18" strokeLinecap="round" />
      </g>
    </g>
  );
}

function CgSideHuihuiExclusive() {
  /* 配速：傍晚六点五十的操场看台第三排，跑道灯亮一半；
     他把表从手腕上退下来递给你——有一条记录，还没结束。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-bluegray)" opacity="0.18" />
      <rect x="0" y="0" width="800" height="270" fill="var(--frog-ink)" opacity="0.32" />
      {/* 操场灯：亮一半 */}
      <rect x="120" y="34" width="10" height="90" rx="5" fill="var(--frog-ink)" opacity="0.5" />
      <path d="M100 60 q30 -8 44 10 l-52 24 z" fill="var(--frog-ink)" opacity="0.8" />
      <polygon points="126,64 210,70 250,270 90,270" fill="var(--frog-badge)" opacity="0.07" />
      {/* 跑道： lane 线 */}
      <path d="M0 396 L800 390 L800 450 L0 450 Z" fill="var(--frog-bluegray-deep)" opacity="0.55" />
      <path d="M40 414 h720 M60 432 h700" stroke="hsl(var(--background))" strokeWidth="2.5" opacity="0.28" strokeDasharray="26 16" />
      {/* 看台：三级，第三排坐着灰灰 */}
      {[0, 1, 2].map((i) => (
        <g key={`bleacher-${i}`}>
          <rect x="0" y={270 + i * 42} width="800" height="42" fill="var(--map-wood)" opacity={0.9 - i * 0.12} />
          <path d={`M0 ${270 + i * 42} h800`} stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.24" />
        </g>
      ))}
      {/* 远处跑道上有人在跑：跑得很匀，不看表 */}
      <g opacity="0.6">
        <ellipse cx="620" cy="416" rx="14" ry="12" fill="var(--frog-cream-deep)" />
        <circle cx="624" cy="404" r="7" fill="var(--frog-cream-deep)" />
      </g>
      {/* 灰灰：坐着的，手枕在脑后，把表递出来 */}
      <g>
        <ellipse cx="188" cy="336" rx="52" ry="54" fill="var(--frog-bluegray)" />
        <circle cx="188" cy="252" r="31" fill="var(--frog-bluegray)" />
        <circle cx="200" cy="248" r="3.2" fill="var(--frog-ink)" opacity="0.8" />
        <circle cx="176" cy="248" r="3.2" fill="var(--frog-ink)" opacity="0.8" />
        {/* 眼神里全是留白：嘴角是平的 */}
        <path d="M180 264 q8 2 16 0" stroke="var(--frog-ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
        {/* 手枕在脑后 */}
        <path d="M214 236 q20 -8 34 2" stroke="var(--frog-bluegray-deep)" strokeWidth="9" fill="none" strokeLinecap="round" />
        {/* 递表的手 */}
        <path d="M234 316 Q282 332 326 348" stroke="var(--frog-bluegray-deep)" strokeWidth="12" fill="none" strokeLinecap="round" />
      </g>
      {/* 那块表：屏幕朝外——配速 4:58，最后一段 0 步 */}
      <g transform="rotate(-8 380 350)">
        <rect x="336" y="326" width="88" height="52" rx="10" fill="var(--frog-ink)" opacity="0.85" />
        <rect x="342" y="332" width="76" height="40" rx="6" fill="hsl(var(--card))" opacity="0.95" />
        <text x="352" y="350" fontSize="11" fontWeight="800" fill="var(--frog-bluegray-deep)" opacity="0.95">
          4:58
        </text>
        <text x="352" y="364" fontSize="7" fontWeight="700" fill="var(--frog-ink)" opacity="0.55">
          0 步 · 未结束
        </text>
      </g>
      {/* 换下来的那根表带：叠好压在鞋盒里 */}
      <g transform="rotate(6 700 396)">
        <rect x="660" y="378" width="76" height="30" rx="6" fill="var(--frog-khaki)" opacity="0.7" />
        <path d="M664 392 h66" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.28" />
        <text x="698" y="374" fontSize="7" fontWeight="700" fill="var(--frog-ink)" opacity="0.45" textAnchor="middle">
          旧表带
        </text>
      </g>
    </g>
  );
}

function CgSideZaizaiExclusive() {
  /* 签到：凌晨四点半，自习楼楼下的台阶还凉着；
     他的手机停在解锁页面——壁纸是妈妈拍的那张书桌，桌上什么都齐，就是没有蛙。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-zzaizai)" opacity="0.2" />
      <rect x="0" y="0" width="800" height="280" fill="var(--frog-ink)" opacity="0.42" />
      {/* 自习楼：四楼的灯还亮着一格 */}
      <rect x="60" y="36" width="250" height="180" rx="4" fill="var(--frog-ink)" opacity="0.5" />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={`floor-${i}`}
          x={76}
          y={52 + i * 42}
          width="218"
          height="30"
          rx="2"
          fill="hsl(var(--background))"
          opacity={i === 3 ? 0.6 : 0.12}
        />
      ))}
      {/* 台阶：一级一级往下，凉意贴着地 */}
      {[0, 1, 2].map((i) => (
        <g key={`step-${i}`}>
          <rect x="0" y={286 + i * 54} width="800" height="54" fill="var(--frog-bluegray-deep)" opacity={0.5 - i * 0.08} />
          <path d={`M0 ${286 + i * 54} h800`} stroke="var(--frog-ink)" strokeWidth="2" opacity="0.22" />
        </g>
      ))}
      <path d="M60 440 q140 -10 300 -6 M520 442 q120 -6 240 -10" stroke="hsl(var(--background))" strokeWidth="1.6" opacity="0.12" strokeLinecap="round" />
      {/* 再再：蹲在最下面那级，厚眼袋，手机递过来 */}
      <g>
        <ellipse cx="196" cy="352" rx="50" ry="44" fill="var(--frog-zzaizai)" />
        <circle cx="196" cy="278" r="30" fill="var(--frog-zzaizai)" />
        <circle cx="208" cy="274" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="184" cy="274" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        {/* 厚眼袋：两道卧痕 */}
        <path d="M200 280 q7 4 13 0 M176 280 q7 4 13 0" stroke="var(--frog-ink)" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.55" />
        {/* 手机递过来：屏幕上是那张书桌 */}
        <g transform="rotate(-6 320 342)">
          <rect x="276" y="306" width="88" height="128" rx="10" fill="var(--frog-ink)" opacity="0.85" />
          <rect x="282" y="312" width="76" height="116" rx="6" fill="hsl(var(--card))" opacity="0.96" />
          {/* 壁纸：书桌照片——台灯、一摞书、笔筒，没有蛙 */}
          <rect x="288" y="352" width="64" height="8" rx="2" fill="var(--map-wood)" opacity="0.85" />
          <path d="M292 352 l10 -16 l10 16 z" fill="var(--frog-badge)" opacity="0.7" />
          <rect x="318" y="332" width="22" height="20" rx="1.5" fill="var(--frog-khaki-deep)" opacity="0.8" />
          <rect x="320" y="324" width="18" height="8" rx="1.5" fill="var(--frog-cream-deep)" opacity="0.8" />
          <text x="320" y="330" fontSize="6" fontWeight="700" fill="var(--frog-ink)" opacity="0.6" textAnchor="middle">
            签到
          </text>
          <path d="M290 346 h58" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.2" />
        </g>
      </g>
      {/* 凌晨的风：把台阶上的凉意往下送了一段 */}
      <path d="M560 300 q40 14 90 8 M620 330 q46 10 96 4" stroke="hsl(var(--background))" strokeWidth="2" opacity="0.16" strokeLinecap="round" fill="none" />
    </g>
  );
}

function CgSideGanfanshuExclusive() {
  /* 牌子：打烊的食堂只开半边灯；他把「已老实」摘下来翻过来——
     背面刻着两个字，笔画很浅，二十年前刻的：阿饭。 */
  return (
    <g>
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-khaki)" opacity="0.14" />
      <rect x="0" y="0" width="800" height="300" fill="var(--frog-ink)" opacity="0.3" />
      {/* 半边灯 */}
      <rect x="80" y="34" width="150" height="8" rx="4" fill="var(--frog-badge)" opacity="0.35" />
      <ellipse cx="155" cy="52" rx="110" ry="14" fill="var(--frog-badge)" opacity="0.14" />
      <rect x="560" y="34" width="150" height="8" rx="4" fill="var(--frog-ink)" opacity="0.3" />
      {/* 窗口台面 */}
      <path d="M0 300 L800 292 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 300 L800 292 L800 306 L0 314 Z" fill="hsl(var(--background))" opacity="0.32" />
      {/* 挂回去的牌子：正面朝外 */}
      <g transform="rotate(-2 640 150)">
        <path d="M614 108 v-26 M666 108 v-26" stroke="var(--frog-ink)" strokeWidth="2.4" opacity="0.5" />
        <rect x="592" y="108" width="96" height="62" rx="6" fill="var(--frog-cream)" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.95" />
        <text x="640" y="146" textAnchor="middle" fontSize="17" fontWeight="800" fill="var(--frog-ink)" opacity="0.8">
          已老实
        </text>
      </g>
      {/* 干饭叔：站在灯绳边，围裙搭回钩上 */}
      <g>
        <ellipse cx="176" cy="266" rx="56" ry="58" fill="var(--frog-khaki)" />
        <circle cx="176" cy="182" r="31" fill="var(--frog-khaki)" />
        <circle cx="188" cy="178" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="164" cy="178" r="3.2" fill="var(--frog-ink)" opacity="0.85" />
        <path d="M168 194 q8 4 16 0" stroke="var(--frog-ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
        {/* 翻牌子的手 */}
        <path d="M226 250 Q270 284 312 310" stroke="var(--frog-khaki-deep)" strokeWidth="12" fill="none" strokeLinecap="round" />
      </g>
      {/* 翻过来的那块：背面「阿饭」，笔画很浅 */}
      <g transform="rotate(4 460 372)">
        <rect x="352" y="318" width="196" height="110" rx="6" fill="var(--frog-cream)" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.95" />
        <path d="M352 330 h196" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.14" />
        <text x="392" y="392" fontSize="30" fontWeight="800" fill="var(--frog-ink)" opacity="0.34" letterSpacing="4">
          阿饭
        </text>
        <text x="536" y="340" fontSize="7" fontWeight="700" fill="var(--frog-ink)" opacity="0.5" textAnchor="end">
          刻的 · 二十年
        </text>
        {/* 背面下半截还空着 */}
        <path d="M372 412 h150" stroke="var(--frog-ink)" strokeWidth="1.2" opacity="0.12" strokeDasharray="6 5" />
      </g>
      {/* 凳子与围裙 */}
      <g>
        <rect x="652" y="356" width="88" height="14" rx="4" fill="var(--map-wood)" opacity="0.85" />
        <path d="M662 370 v44 M730 370 v44" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.3" />
        <rect x="600" y="150" width="46" height="66" rx="8" fill="var(--frog-cream)" opacity="0.5" />
      </g>
    </g>
  );
}

function CgFourGlows() {
  /* 四道光（批次 CY-113）：开学第一夜的宿舍——四张床帘，四道漏出来的光，谁也没跟旁边的蛙说话 */
  const bunks: Array<{ x: number; slits: Array<{ y: number; h: number; color: string; glow: number }> }> = [
    {
      x: 70,
      slits: [
        { y: 118, h: 66, color: "var(--frog-belly)", glow: 0.5 },
        { y: 288, h: 70, color: "var(--frog-badge)", glow: 0.55 },
      ],
    },
    {
      x: 470,
      slits: [
        { y: 118, h: 66, color: "var(--frog-sweat)", glow: 0.42 },
        { y: 288, h: 70, color: "var(--frog-belly)", glow: 0.38 },
      ],
    },
  ];
  return (
    <g>
      <defs>
        <linearGradient id="cg-dorm-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" />
          <stop offset="1" stopColor="var(--frog-bluegray-deep)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* 夜里的宿舍 */}
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-dorm-night)" />
      <rect x="0" y="384" width="800" height="66" fill="var(--map-wood)" opacity="0.32" />
      {/* 窗与月：唯一不属于四张床的光 */}
      <rect x="352" y="46" width="96" height="120" rx="6" fill="var(--frog-bluegray)" opacity="0.3" />
      <path d="M400 46 V166 M352 106 H448" stroke="var(--frog-ink)" strokeWidth="5" opacity="0.7" />
      <circle cx="384" cy="78" r="14" fill="var(--frog-belly)" opacity="0.75" />
      {bunks.map((bunk, bi) => (
        <g key={`bunk-${bi}`}>
          {/* 上下两格的床架与床帘 */}
          {[96, 266].map((top, ti) => (
            <g key={`tier-${bi}-${ti}`}>
              <rect x={bunk.x - 12} y={top - 14} width="14" height={ti === 0 ? 300 : 130} rx="4" fill="var(--frog-bluegray-deep)" opacity="0.9" />
              <rect x={bunk.x + 258} y={top - 14} width="14" height={ti === 0 ? 300 : 130} rx="4" fill="var(--frog-bluegray-deep)" opacity="0.9" />
              <rect x={bunk.x} y={top} width="258" height="100" rx="6" fill="var(--frog-bluegray)" opacity="0.4" />
              <path
                d={`M${bunk.x + 18} ${top} q10 50 0 100 M${bunk.x + 240} ${top} q-10 50 0 100`}
                stroke="var(--frog-ink)"
                strokeWidth="3"
                fill="none"
                opacity="0.35"
              />
            </g>
          ))}
          <rect x={bunk.x} y={210} width="258" height="10" rx="4" fill="var(--frog-bluegray-deep)" />
          {/* 帘缝里的光：一道一色，各有各的远处 */}
          {bunk.slits.map((slit, si) => (
            <g key={`slit-${bi}-${si}`}>
              <ellipse cx={bunk.x + 129} cy={slit.y + slit.h / 2} rx="120" ry="58" fill={slit.color} opacity={slit.glow * 0.22} />
              <rect x={bunk.x + 121} y={slit.y} width="16" height={slit.h} rx="8" fill={slit.color} opacity={slit.glow + 0.35} />
              <rect x={bunk.x + 126} y={slit.y + 8} width="6" height={slit.h - 16} rx="3" fill="var(--frog-belly)" opacity="0.8" />
            </g>
          ))}
        </g>
      ))}
      {/* 地上的四双拖鞋：床帘里唯一探出来的东西 */}
      {[110, 300, 500, 690].map((tx, i) => (
        <g key={`slipper-${i}`} opacity="0.75">
          <ellipse cx={tx} cy={412} rx="17" ry="8" fill="var(--frog-belly)" opacity="0.5" />
          <ellipse cx={tx + 22} cy={416} rx="17" ry="8" fill="var(--frog-belly)" opacity="0.5" />
        </g>
      ))}
    </g>
  );
}

function CgTwoLists() {
  /* 两张名单（批次 CY-113）：公告栏上初测的红圈还没褪，补测合格已经贴了上来——旧公告不撕，留着当进步 */
  const rowsLeft = [0, 1, 2, 3, 4, 5, 6];
  const rowsRight = [0, 1, 2, 3, 4, 5];
  const circled = [1, 3, 5];
  return (
    <g>
      {/* 公告栏的墙与木板 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-mianmian)" opacity="0.16" />
      <rect x="0" y="378" width="800" height="72" fill="var(--map-wood)" opacity="0.55" />
      <rect x="64" y="40" width="672" height="330" rx="10" fill="var(--frog-ink)" opacity="0.12" />
      <rect x="58" y="34" width="672" height="330" rx="10" fill="var(--map-wood)" />
      <rect x="58" y="34" width="672" height="330" rx="10" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.35" />
      {/* 左：初测名单（旧一点，红圈在号上） */}
      <g transform="rotate(-0.8 244 200)">
        <rect x="128" y="66" width="232" height="276" rx="4" fill="var(--frog-cream)" />
        <rect x="128" y="66" width="232" height="276" rx="4" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.3" />
        <rect x="152" y="86" width="184" height="24" rx="3" fill="var(--frog-bluegray)" opacity="0.5" />
        <text x="244" y="103" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--frog-ink)" opacity="0.8">
          五十米初测名单
        </text>
        {rowsLeft.map((r) => (
          <g key={`l-${r}`}>
            <rect x="152" y={128 + r * 28} width="52" height="10" rx="5" fill="var(--frog-bluegray-deep)" opacity="0.45" />
            <rect x="216" y={128 + r * 28} width="88" height="10" rx="5" fill="var(--frog-bluegray-deep)" opacity="0.3" />
            {circled.includes(r) && (
              <ellipse cx="244" cy={133 + r * 28} rx="34" ry="12" fill="none" stroke="var(--frog-mouth)" strokeWidth="2.6" opacity="0.85" transform={`rotate(${-4 + r * 3} 244 ${133 + r * 28})`} />
            )}
          </g>
        ))}
        {/* 图钉 */}
        <circle cx="244" cy="74" r="4" fill="var(--frog-mouth)" opacity="0.9" />
      </g>
      {/* 右：补测合格名单（新贴的，纸更白，胶带还没压平） */}
      <g transform="rotate(1.1 552 210)">
        <rect x="442" y="88" width="216" height="248" rx="4" fill="var(--frog-belly)" />
        <rect x="442" y="88" width="216" height="248" rx="4" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.25" />
        <rect x="464" y="106" width="172" height="24" rx="3" fill="var(--frog-matcha)" opacity="0.55" />
        <text x="550" y="123" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--frog-ink)" opacity="0.8">
          补测合格名单
        </text>
        {rowsRight.map((r) => (
          <g key={`r-${r}`}>
            <rect x="464" y={148 + r * 26} width="48" height="9" rx="4.5" fill="var(--frog-bluegray-deep)" opacity="0.4" />
            <rect x="524" y={148 + r * 26} width="80" height="9" rx="4.5" fill="var(--frog-bluegray-deep)" opacity="0.26" />
          </g>
        ))}
        {/* 新贴的胶带：两角还没压平 */}
        <rect x="428" y="80" width="46" height="14" rx="2" fill="var(--frog-belly)" opacity="0.85" transform="rotate(-18 451 87)" />
        <rect x="628" y="80" width="46" height="14" rx="2" fill="var(--frog-belly)" opacity="0.85" transform="rotate(16 651 87)" />
      </g>
      {/* 两张纸中间那道栏板缝：他的号在两边都出现过 */}
      <path d="M398 44 V356" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.25" />
    </g>
  );
}

function CgOldPot() {
  /* 锅沿的年轮（批次 CY-114）：一口比干饭叔来得还早一年的锅——措辞换了几十轮，锅只记这一圈 */
  return (
    <g>
      <defs>
        <linearGradient id="cg-pot-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-bluegray)" />
          <stop offset="0.5" stopColor="var(--frog-bluegray-deep)" />
          <stop offset="1" stopColor="var(--frog-ink)" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="cg-pot-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-cream)" />
          <stop offset="1" stopColor="var(--frog-cream-deep)" />
        </linearGradient>
      </defs>
      {/* 后厨的墙与操作台 */}
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-pot-wall)" />
      <path d="M0 120 H800 M0 200 H800" stroke="var(--frog-bluegray)" strokeWidth="2" opacity="0.25" />
      <rect x="0" y="330" width="800" height="120" fill="var(--map-wood)" opacity="0.65" />
      <rect x="0" y="330" width="800" height="10" fill="var(--frog-ink)" opacity="0.18" />
      {/* 蒸汽：三缕，越往上越淡 */}
      <path d="M330 130 Q316 96 334 66 Q346 44 336 22" fill="none" stroke="var(--frog-belly)" strokeWidth="10" strokeLinecap="round" opacity="0.5" />
      <path d="M400 118 Q388 82 406 52 Q418 32 410 14" fill="none" stroke="var(--frog-belly)" strokeWidth="12" strokeLinecap="round" opacity="0.42" />
      <path d="M472 130 Q458 98 476 70 Q486 50 478 30" fill="none" stroke="var(--frog-belly)" strokeWidth="9" strokeLinecap="round" opacity="0.35" />
      {/* 锅身 */}
      <ellipse cx="400" cy="392" rx="250" ry="26" fill="var(--frog-ink)" opacity="0.22" />
      <path d="M170 210 Q170 380 400 380 Q630 380 630 210 Z" fill="url(#cg-pot-steel)" />
      <path d="M206 224 Q214 340 340 362" fill="none" stroke="var(--frog-belly)" strokeWidth="10" strokeLinecap="round" opacity="0.16" />
      {/* 锅沿：外圈不锈钢，内圈那层浅亮的环——二十年的勺刮出来的年轮 */}
      <ellipse cx="400" cy="210" rx="234" ry="58" fill="var(--frog-bluegray-deep)" />
      <ellipse cx="400" cy="206" rx="234" ry="58" fill="var(--frog-bluegray)" />
      <ellipse cx="400" cy="206" rx="234" ry="58" fill="none" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.3" />
      <ellipse cx="400" cy="206" rx="216" ry="50" fill="none" stroke="var(--frog-belly)" strokeWidth="7" opacity="0.75" />
      <ellipse cx="400" cy="206" rx="204" ry="45" fill="none" stroke="var(--frog-belly)" strokeWidth="4" opacity="0.5" />
      <ellipse cx="400" cy="206" rx="226" ry="54" fill="none" stroke="var(--frog-belly)" strokeWidth="3" opacity="0.35" />
      {/* 磨得最深的一段：右手落勺的位置，环在这里亮得发白 */}
      <path d="M560 236 Q610 224 622 206" fill="none" stroke="var(--frog-belly)" strokeWidth="10" strokeLinecap="round" opacity="0.95" />
      {/* 锅里的汤面 */}
      <ellipse cx="400" cy="208" rx="196" ry="42" fill="var(--frog-khaki)" opacity="0.85" />
      <ellipse cx="352" cy="200" rx="46" ry="10" fill="var(--frog-belly)" opacity="0.3" />
      <circle cx="470" cy="216" r="7" fill="var(--frog-matcha)" opacity="0.8" />
      <circle cx="430" cy="222" r="5" fill="var(--frog-matcha-deep)" opacity="0.7" />
      <circle cx="336" cy="220" r="6" fill="var(--frog-badge)" opacity="0.85" />
      {/* 手勺搭在锅沿：勺柄朝着右手位，磨痕最亮的那段正好在它底下 */}
      <g>
        <rect x="586" y="120" width="16" height="112" rx="8" fill="var(--frog-bluegray-deep)" transform="rotate(24 594 176)" />
        <ellipse cx="562" cy="196" rx="34" ry="22" fill="var(--frog-bluegray-deep)" transform="rotate(24 562 196)" />
        <ellipse cx="560" cy="192" rx="26" ry="15" fill="var(--frog-belly)" opacity="0.55" transform="rotate(24 560 192)" />
      </g>
      {/* 窗口的公示表一角：锅在表外面活了很多年 */}
      <g transform="rotate(-2 96 96)">
        <rect x="40" y="40" width="112" height="150" rx="4" fill="var(--frog-belly)" opacity="0.92" />
        <rect x="54" y="58" width="84" height="8" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.5" />
        <rect x="54" y="78" width="84" height="6" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.3" />
        <rect x="54" y="94" width="84" height="6" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.3" />
        <rect x="54" y="110" width="60" height="6" rx="3" fill="var(--frog-bluegray-deep)" opacity="0.3" />
        <circle cx="128" cy="164" r="16" fill="none" stroke="var(--frog-mouth)" strokeWidth="2.6" opacity="0.7" />
      </g>
    </g>
  );
}

function CgApronShelf() {
  /* 那条围裙（批次 CY-115）：储藏间架子上一条叠得方方正正的旧围裙——没扔，也没给人，在等尺寸合适的蛙 */
  return (
    <g>
      <defs>
        <linearGradient id="cg-store-dim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="var(--frog-bluegray-deep)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--frog-ink)" stopOpacity="0.65" />
        </linearGradient>
        <linearGradient id="cg-window-ray" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* 储藏间：墙、地、高处的小窗 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-cream-deep)" />
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-store-dim)" />
      <rect x="0" y="386" width="800" height="64" fill="var(--frog-ink)" opacity="0.4" />
      <rect x="560" y="30" width="150" height="74" rx="6" fill="var(--frog-bluegray)" opacity="0.55" />
      <path d="M635 30 V104 M560 67 H710" stroke="var(--frog-ink)" strokeWidth="5" opacity="0.6" />
      {/* 小窗斜下来的光柱，正落在围裙那格 */}
      <path d="M575 104 L330 300 L470 300 L700 104 Z" fill="url(#cg-window-ray)" />
      {[
        [392, 176, 3], [430, 150, 2.4], [468, 196, 2], [500, 160, 2.6], [540, 210, 2.2], [575, 180, 1.8],
      ].map(([dx, dy, r], i) => (
        <circle key={`dust-${i}`} cx={dx} cy={dy} r={r} fill="var(--frog-belly)" opacity="0.5" />
      ))}
      {/* 两层木架 */}
      <rect x="180" y="150" width="380" height="14" rx="3" fill="var(--map-wood)" />
      <rect x="180" y="296" width="380" height="16" rx="3" fill="var(--map-wood)" />
      <rect x="192" y="164" width="12" height="132" fill="var(--frog-ink)" opacity="0.5" />
      <rect x="536" y="164" width="12" height="132" fill="var(--frog-ink)" opacity="0.5" />
      {/* 上层：摞着的饭盒与一把旧手勺（明天的量，一只不差） */}
      <g opacity="0.9">
        <rect x="222" y="126" width="96" height="12" rx="4" fill="var(--frog-bluegray)" />
        <rect x="222" y="114" width="96" height="12" rx="4" fill="var(--frog-bluegray-deep)" />
        <rect x="222" y="102" width="96" height="12" rx="4" fill="var(--frog-bluegray)" />
        <path d="M356 118 q30 -6 52 10" fill="none" stroke="var(--frog-bluegray-deep)" strokeWidth="7" strokeLinecap="round" />
        <ellipse cx="346" cy="126" rx="24" ry="13" fill="var(--frog-bluegray-deep)" />
        <ellipse cx="344" cy="123" rx="17" ry="8" fill="var(--frog-belly)" opacity="0.4" />
      </g>
      {/* 下层主角：叠得方方正正的白围裙，带子垂出架沿，磨毛的尾梢 */}
      <g>
        <ellipse cx="420" cy="292" rx="120" ry="10" fill="var(--frog-ink)" opacity="0.28" />
        <rect x="316" y="228" width="208" height="26" rx="6" fill="var(--frog-apron)" />
        <rect x="322" y="204" width="196" height="26" rx="6" fill="var(--frog-belly)" />
        <rect x="330" y="182" width="180" height="24" rx="6" fill="var(--frog-apron)" />
        <path d="M330 240 H510 M336 216 H504" stroke="var(--frog-apron-line)" strokeWidth="2" opacity="0.55" />
        {/* 口袋的缝线：只有常摸口袋的手知道它在哪 */}
        <rect x="372" y="188" width="52" height="14" rx="3" fill="none" stroke="var(--frog-apron-line)" strokeWidth="2" opacity="0.7" />
        {/* 带子：一条搭在架沿垂下来，尾梢磨毛 */}
        <path d="M524 236 Q556 244 552 282 Q550 306 566 316" fill="none" stroke="var(--frog-apron-line)" strokeWidth="6" strokeLinecap="round" />
        <path d="M566 316 l10 8 M566 316 l12 2 M566 316 l8 12" stroke="var(--frog-apron-line)" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
        <path d="M316 240 Q292 250 296 276" fill="none" stroke="var(--frog-apron-line)" strokeWidth="5" strokeLinecap="round" opacity="0.85" />
      </g>
      {/* 架子边的旧挂钩：空着的那一枚，谁也没说要挂什么 */}
      <path d="M600 250 q14 0 14 14 q0 12 -12 12" fill="none" stroke="var(--frog-ink)" strokeWidth="6" strokeLinecap="round" opacity="0.6" />
    </g>
  );
}

function CgExamWall() {
  /* 没落款的那张（批次 CY-118）：考场楼门口一张记号笔现写的调整表——真正干活的通知，最不正式 */
  const rows: Array<[string, string]> = [
    ["一考场", "教三 201"],
    ["二考场", "教三 305"],
    ["三考场", "教一 102"],
    ["四考场", "教一 阶梯"],
    ["五考场", "实验楼 B1"],
  ];
  return (
    <g>
      <defs>
        <linearGradient id="cg-morning-wall" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.35" />
          <stop offset="0.55" stopColor="var(--frog-cream)" />
          <stop offset="1" stopColor="var(--frog-cream-deep)" />
        </linearGradient>
      </defs>
      {/* 清晨的楼门墙与横幅一角 */}
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-morning-wall)" />
      <path d="M0 396 H800 V450 H0 Z" fill="var(--map-wood)" opacity="0.5" />
      <rect x="470" y="24" width="330" height="44" rx="6" fill="var(--frog-bow)" opacity="0.75" />
      <text x="640" y="53" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--frog-belly)" letterSpacing="6">
        诚信考试
      </text>
      {/* 那张纸：被风掀起一角，胶带压得很牢 */}
      <g transform="rotate(-0.7 330 240)">
        <rect x="152" y="96" width="356" height="292" rx="4" fill="var(--frog-ink)" opacity="0.12" />
        <rect x="146" y="90" width="356" height="292" rx="4" fill="var(--frog-belly)" />
        <path d="M502 90 L470 90 Q498 108 502 128 Z" fill="var(--frog-cream-deep)" />
        <path d="M470 90 Q498 108 502 128" fill="none" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.3" />
        {/* 四角胶带 */}
        <rect x="132" y="82" width="52" height="16" rx="2" fill="var(--frog-badge)" opacity="0.85" transform="rotate(-16 158 90)" />
        <rect x="468" y="82" width="52" height="16" rx="2" fill="var(--frog-badge)" opacity="0.85" transform="rotate(14 494 90)" />
        <rect x="132" y="366" width="52" height="16" rx="2" fill="var(--frog-badge)" opacity="0.85" transform="rotate(12 158 374)" />
        <rect x="468" y="366" width="52" height="16" rx="2" fill="var(--frog-badge)" opacity="0.85" transform="rotate(-12 494 374)" />
        {/* 标题：记号笔，笔画压得重 */}
        <text x="324" y="138" textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--frog-ink)" opacity="0.9">
          考场调整表
        </text>
        <path d="M212 152 H436" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.75" strokeLinecap="round" />
        {/* 五行号码：左边划掉的旧考场，右边现写的新教室 */}
        {rows.map(([from, to], i) => (
          <g key={`row-${i}`}>
            <text x="204" y={192 + i * 34} fontSize="17" fontWeight="600" fill="var(--frog-bluegray-deep)" opacity="0.75">
              {from}
            </text>
            <path d={`M${252 + from.length * 6} ${186 + i * 34} h${28 + i}`} stroke="var(--frog-mouth)" strokeWidth="2.4" opacity="0.65" strokeLinecap="round" />
            <path d={`M296 ${186 + i * 34} q14 -6 26 0`} fill="none" stroke="var(--frog-ink)" strokeWidth="2.6" opacity="0.8" strokeLinecap="round" />
            <path d={`M318 ${182 + i * 34} l8 4 l-8 4`} fill="none" stroke="var(--frog-ink)" strokeWidth="2.6" opacity="0.8" strokeLinecap="round" />
            <text x="336" y={192 + i * 34} fontSize="18" fontWeight="800" fill="var(--frog-ink)" opacity="0.92">
              {to}
            </text>
          </g>
        ))}
        {/* 落款那一栏：空的。只有一道没人填过的横线 */}
        <path d="M356 356 H478" stroke="var(--frog-bluegray-deep)" strokeWidth="2" opacity="0.45" strokeLinecap="round" />
      </g>
      {/* 墙根：赶考的蛙影，一只指着表 */}
      <g opacity="0.55">
        <ellipse cx="614" cy="436" rx="44" ry="9" fill="var(--frog-ink)" opacity="0.3" />
        <path d="M600 436 q0 -44 14 -44 q14 0 14 44 Z" fill="var(--frog-bluegray-deep)" />
        <circle cx="614" cy="382" r="15" fill="var(--frog-bluegray-deep)" />
        <path d="M624 400 q26 -14 34 -36" fill="none" stroke="var(--frog-bluegray-deep)" strokeWidth="7" strokeLinecap="round" />
      </g>
      <ellipse cx="700" cy="440" rx="36" ry="8" fill="var(--frog-ink)" opacity="0.22" />
      <path d="M690 440 q0 -38 12 -38 q12 0 12 38 Z" fill="var(--frog-bluegray)" opacity="0.6" />
      <circle cx="702" cy="394" r="12" fill="var(--frog-bluegray)" opacity="0.6" />
    </g>
  );
}

/* ---------- 批次 CY-121：四线第三幕各一张 ---------- */

function CgTenSeconds() {
  /* 正题的十秒：出考场先躺十秒——两盏坏灯之间，草上一个躺平的蛙 */
  return (
    <g>
      <defs>
        <linearGradient id="cg-morning-field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-belly)" stopOpacity="0.5" />
          <stop offset="0.6" stopColor="hsl(var(--background))" stopOpacity="0.2" />
          <stop offset="1" stopColor="var(--frog-bluegray)" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      {/* 清晨的天 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-morning-field)" />
      <circle cx="150" cy="88" r="30" fill="var(--frog-badge)" opacity="0.5" />
      <circle cx="150" cy="88" r="20" fill="var(--frog-badge)" opacity="0.75" />
      {/* 远景：教学楼 */}
      <rect x="470" y="120" width="290" height="130" rx="6" fill="var(--frog-ink)" opacity="0.42" />
      {[
        [498, 142], [546, 142], [594, 142], [642, 142], [690, 142],
        [498, 186], [594, 186], [690, 186],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="26" height="24" rx="2" fill="hsl(var(--background))" opacity={i % 3 === 0 ? 0.4 : 0.2} />
      ))}
      {/* 中景：跑道 */}
      <rect x="0" y="250" width="800" height="66" fill="var(--map-road)" />
      <path d="M0 282 h800" stroke="hsl(var(--background))" strokeWidth="2.4" strokeDasharray="24 22" opacity="0.35" />
      {/* 草坪 */}
      <rect x="0" y="316" width="800" height="134" fill="var(--map-grass)" />
      <rect x="0" y="316" width="800" height="134" fill="var(--frog-ink)" opacity="0.14" />
      {/* 两盏坏灯：灯罩空着 */}
      {[
        { x: 120, lean: -3 },
        { x: 668, lean: 3 },
      ].map((lamp, i) => (
        <g key={`lamp-${i}`} transform={`rotate(${lamp.lean} ${lamp.x} 420)`}>
          <rect x={lamp.x - 4} y="238" width="8" height="184" rx="3" fill="var(--frog-ink)" opacity="0.66" />
          <path d={`M${lamp.x - 20} 238 Q${lamp.x} 224 ${lamp.x + 20} 238 L${lamp.x + 13} 246 L${lamp.x - 13} 246 Z`} fill="var(--frog-ink)" opacity="0.72" />
        </g>
      ))}
      {/* 躺着的蛙：大字，草上一个压痕 */}
      <ellipse cx="400" cy="392" rx="150" ry="30" fill="var(--frog-ink)" opacity="0.16" />
      <g>
        <ellipse cx="400" cy="382" rx="72" ry="30" fill="var(--frog-bluegray)" />
        <ellipse cx="400" cy="388" rx="52" ry="18" fill="var(--frog-belly)" opacity="0.55" />
        <circle cx="316" cy="378" r="24" fill="var(--frog-bluegray)" />
        <path d="M304 374 q6 5 12 0 M322 374 q6 5 12 0" stroke="var(--frog-ink)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M462 366 L508 348 M466 396 L512 404 M344 402 L318 424 M356 360 L336 336" stroke="var(--frog-bluegray)" strokeWidth="13" strokeLinecap="round" />
      </g>
      {/* 光效：早晨的斜光落在压痕上 */}
      <path d="M0 316 L280 450 L0 450 Z" fill="var(--frog-badge)" opacity="0.08" />
    </g>
  );
}

function CgRowSixtyOne() {
  /* 第六十一行：六十行「正常」进了系统，第六十一行进她自己的本子 */
  return (
    <g>
      <defs>
        <radialGradient id="cg-desk-lamp61" cx="0.5" cy="0.36" r="0.62">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--frog-badge)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 夜里的 601 */}
      <rect x="0" y="0" width="800" height="450" fill="var(--frog-ink)" />
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-desk-lamp61)" />
      {/* 桌面 */}
      <rect x="60" y="240" width="680" height="210" rx="8" fill="var(--map-wood)" />
      <rect x="60" y="240" width="680" height="10" rx="4" fill="var(--frog-ink)" opacity="0.3" />
      {/* 摊开的本子：左页六十行，行行「正常」；右页只有一行 */}
      <g transform="rotate(-2 400 330)">
        <rect x="130" y="252" width="290" height="176" rx="4" fill="hsl(var(--background))" />
        <rect x="424" y="252" width="290" height="176" rx="4" fill="hsl(var(--background))" />
        <rect x="418" y="252" width="10" height="176" fill="var(--frog-ink)" opacity="0.16" />
        {Array.from({ length: 12 }).map((_, row) => (
          <g key={`l61-${row}`}>
            <path d={`M146 ${268 + row * 13.5} h258`} stroke="var(--frog-ink)" strokeWidth="0.8" opacity="0.22" />
            <text x={382} y={272 + row * 13.5} fontSize="9" fill="var(--frog-ink)" opacity="0.66" textAnchor="end">正常</text>
          </g>
        ))}
        <path d="M440 268 h258" stroke="var(--frog-ink)" strokeWidth="0.8" opacity="0.22" />
        <text x="452" y="272" fontSize="9" fill="var(--frog-ink)" opacity="0.45">昨晚</text>
        <ellipse cx="656" cy="268" rx="36" ry="10" fill="hsl(var(--primary))" opacity="0.24" />
        <text x={682} y={272} fontSize="10" fontWeight="700" fill="var(--frog-ink)" opacity="0.9" textAnchor="end">正常</text>
        {Array.from({ length: 11 }).map((_, row) => (
          <path key={`r61-${row}`} d={`M440 ${281.5 + row * 13.5} h258`} stroke="var(--frog-ink)" strokeWidth="0.8" opacity="0.14" />
        ))}
      </g>
      {/* 笔：笔帽合着，搁在本子右边 */}
      <g transform="rotate(8 726 396)">
        <rect x="700" y="392" width="72" height="8" rx="4" fill="var(--frog-bluegray-deep)" />
        <rect x="700" y="392" width="18" height="8" rx="4" fill="var(--frog-ink)" opacity="0.7" />
      </g>
      {/* 铁盒与半截粉笔 */}
      <rect x="84" y="352" width="40" height="26" rx="4" fill="var(--frog-bluegray-deep)" opacity="0.9" />
      <rect x="90" y="346" width="6" height="10" rx="2" fill="var(--frog-belly)" />
      <rect x="100" y="348" width="5" height="8" rx="2" fill="var(--frog-belly)" opacity="0.8" />
      <rect x="109" y="347" width="6" height="9" rx="2" fill="var(--frog-belly)" opacity="0.9" />
      {/* 光效：灯圈之外，桌面沉进暗处 */}
      <ellipse cx="420" cy="300" rx="230" ry="90" fill="var(--frog-badge)" opacity="0.07" />
    </g>
  );
}

function CgMarkedPresent() {
  /* 已到：作息表十二月页，备注格空了十一版之后的头两个字 */
  return (
    <g>
      <defs>
        <linearGradient id="cg-study-present" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--frog-ink)" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* 深夜自习楼底 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-study-present)" />
      {/* 柜门与四个针孔 */}
      <rect x="150" y="30" width="500" height="400" rx="6" fill="var(--map-wood)" opacity="0.9" />
      {[
        [168, 48], [632, 48], [168, 412], [632, 412],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="var(--frog-ink)" opacity="0.7" />
      ))}
      {/* 表纸 */}
      <rect x="190" y="62" width="420" height="330" rx="3" fill="hsl(var(--background))" />
      <text x="400" y="94" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--frog-ink)">作息表（修订第 12 版）· 十二月</text>
      {/* 栏格：时间 / 事项 / 备注 */}
      <path d="M210 110 h380 M210 110 v262 M330 110 v262 M470 110 v262" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.3" />
      {Array.from({ length: 8 }).map((_, row) => (
        <path key={`mp-${row}`} d={`M210 ${142 + row * 30} h380`} stroke="var(--frog-ink)" strokeWidth="0.9" opacity="0.24" />
      ))}
      <text x="270" y="130" textAnchor="middle" fontSize="10" fill="var(--frog-ink)" opacity="0.5">时间</text>
      <text x="400" y="130" textAnchor="middle" fontSize="10" fill="var(--frog-ink)" opacity="0.5">事项</text>
      <text x="540" y="130" textAnchor="middle" fontSize="10" fill="var(--frog-ink)" opacity="0.5">备注</text>
      {/* 常规栏：备注全空 */}
      <text x="222" y="162" fontSize="11" fill="var(--frog-ink)" opacity="0.62">6:40-6:42</text>
      <text x="342" y="162" fontSize="11" fill="var(--frog-ink)" opacity="0.62">起 · 烧水</text>
      <text x="222" y="192" fontSize="11" fill="var(--frog-ink)" opacity="0.62">8:00-11:30</text>
      <text x="342" y="192" fontSize="11" fill="var(--frog-ink)" opacity="0.62">数学 · 一轮</text>
      <text x="222" y="222" fontSize="11" fill="var(--frog-ink)" opacity="0.62">23:30-23:40</text>
      <text x="342" y="222" fontSize="11" fill="var(--frog-ink)" opacity="0.62">发呆</text>
      {/* 考试那两行：备注格里的头两个字 */}
      <rect x="472" y="242" width="116" height="26" fill="hsl(var(--primary))" opacity="0.16" />
      <text x="222" y="260" fontSize="11" fontWeight="700" fill="var(--frog-ink)">12.21-12.22</text>
      <text x="342" y="260" fontSize="11" fontWeight="700" fill="var(--frog-ink)">考试</text>
      <text x="530" y="261" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-ink)">已到</text>
      {/* 笔尖刚离开格子 */}
      <g transform="rotate(34 600 236)">
        <rect x="588" y="196" width="12" height="66" rx="4" fill="var(--frog-bluegray-deep)" />
        <path d="M588 262 L594 276 L600 262 Z" fill="var(--frog-ink)" />
      </g>
      {/* 光效：半盏灯的暖圈 */}
      <ellipse cx="440" cy="250" rx="260" ry="150" fill="var(--frog-badge)" opacity="0.07" />
    </g>
  );
}

function CgLakeBreakfast() {
  /* 第七只碗：五只蛙来了，七只碗摆着——多出的两只搁在最外侧 */
  return (
    <g>
      <defs>
        <linearGradient id="cg-morning-canteen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-badge)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--frog-cream)" stopOpacity="0.18" />
        </linearGradient>
        <radialGradient id="cg-steam-glow" cx="0.5" cy="0.4" r="0.5">
          <stop offset="0" stopColor="hsl(var(--background))" stopOpacity="0.5" />
          <stop offset="1" stopColor="hsl(var(--background))" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 清晨的食堂 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-morning-canteen)" />
      {/* 窗口框 */}
      <rect x="90" y="40" width="620" height="220" rx="8" fill="var(--frog-ink)" opacity="0.3" />
      <rect x="106" y="56" width="588" height="188" rx="4" fill="var(--frog-cream)" opacity="0.35" />
      {/* 窗口里的大锅与热气 */}
      <ellipse cx="400" cy="212" rx="86" ry="26" fill="var(--frog-bluegray-deep)" />
      <ellipse cx="400" cy="204" rx="86" ry="26" fill="var(--frog-bluegray)" />
      <ellipse cx="400" cy="204" rx="64" ry="18" fill="var(--frog-cream)" opacity="0.65" />
      <circle cx="400" cy="150" r="110" fill="url(#cg-steam-glow)" />
      {[
        "M356 186 q-10 -26 4 -44 q12 -16 2 -34",
        "M400 178 q-10 -28 4 -48 q12 -18 2 -36",
        "M444 186 q-10 -26 4 -44 q12 -16 2 -34",
      ].map((d, i) => (
        <path key={`steam-${i}`} d={d} fill="none" stroke="hsl(var(--background))" strokeWidth="4" strokeLinecap="round" opacity={0.5 - i * 0.08} />
      ))}
      {/* 台面 */}
      <rect x="0" y="300" width="800" height="150" fill="var(--map-wood)" />
      <rect x="0" y="300" width="800" height="12" rx="4" fill="var(--frog-ink)" opacity="0.24" />
      {/* 七只碗：五只成排，两只单摆在最外侧，底下垫一圈微光 */}
      {[
        { x: 180, glow: false }, { x: 268, glow: false }, { x: 356, glow: false },
        { x: 444, glow: false }, { x: 532, glow: false },
        { x: 646, glow: true }, { x: 716, glow: true },
      ].map((bowl, i) => (
        <g key={`bowl-${i}`}>
          {bowl.glow && <ellipse cx={bowl.x} cy={366} rx="42" ry="12" fill="hsl(var(--primary))" opacity="0.2" />}
          <ellipse cx={bowl.x} cy={364} rx="34" ry="9" fill="var(--frog-ink)" opacity="0.28" />
          <path d={`M${bowl.x - 32} 340 Q${bowl.x} 384 ${bowl.x + 32} 340 Z`} fill="var(--frog-belly)" />
          <ellipse cx={bowl.x} cy={340} rx="32" ry="9" fill="hsl(var(--background))" opacity="0.92" />
          <ellipse cx={bowl.x} cy={341} rx="24" ry="6" fill="var(--frog-cream)" opacity="0.9" />
          {bowl.glow && (
            <path d={`M${bowl.x - 6} 326 q-5 -12 2 -20 M${bowl.x + 6} 326 q-5 -12 2 -20`} fill="none" stroke="hsl(var(--background))" strokeWidth="2.6" strokeLinecap="round" opacity="0.55" />
          )}
        </g>
      ))}
      {/* 保温柜：柜门一格，指示灯还亮着 */}
      <rect x="40" y="316" width="86" height="96" rx="6" fill="var(--frog-bluegray-deep)" />
      <rect x="52" y="330" width="62" height="42" rx="3" fill="var(--frog-badge)" opacity="0.5" />
      <circle cx="83" cy="392" r="5" fill="var(--frog-badge)" />
      {/* 光效：晨光从窗口斜进来 */}
      <path d="M800 0 L560 0 L800 240 Z" fill="var(--frog-badge)" opacity="0.1" />
    </g>
  );
}

function CgSixtyPoints() {
  /* 正好六十：夜里的草坪，躺平的蛙把查分页面举在肚皮上方——欠的两分，还清了 */
  return (
    <g>
      <defs>
        <linearGradient id="cg-sixty-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--frog-ink)" stopOpacity="0.66" />
          <stop offset="1" stopColor="var(--frog-ink)" stopOpacity="0.42" />
        </linearGradient>
        <radialGradient id="cg-sixty-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="hsl(var(--background))" stopOpacity="0.34" />
          <stop offset="1" stopColor="hsl(var(--background))" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 夜晚的草坪（俯视） */}
      <rect x="0" y="0" width="800" height="450" fill="var(--map-grass)" />
      <rect x="0" y="0" width="800" height="450" fill="url(#cg-sixty-night)" />
      {[58, 128, 96, 700, 752, 664].map((x, i) => (
        <path
          key={`sixty-tuft-${i}`}
          d={`M${x} ${64 + (i % 3) * 140} q6 -14 2 -26 M${x + 11} ${68 + (i % 3) * 140} q-5 -13 0 -24`}
          fill="none"
          stroke="var(--frog-ink)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.3"
        />
      ))}
      {/* 压了三年的那块草：人形压痕 */}
      <ellipse cx="410" cy="252" rx="290" ry="165" fill="var(--frog-ink)" opacity="0.16" />
      {/* 后腿（屈着） */}
      <ellipse cx="212" cy="146" rx="58" ry="34" transform="rotate(-28 212 146)" fill="var(--frog-bluegray)" stroke="var(--frog-ink)" strokeWidth="3" />
      <ellipse cx="212" cy="362" rx="58" ry="34" transform="rotate(28 212 362)" fill="var(--frog-bluegray)" stroke="var(--frog-ink)" strokeWidth="3" />
      {/* 身体与肚皮 */}
      <ellipse cx="392" cy="254" rx="176" ry="118" fill="var(--frog-bluegray)" stroke="var(--frog-ink)" strokeWidth="3" />
      <ellipse cx="382" cy="257" rx="122" ry="86" fill="var(--frog-belly)" />
      {/* 屏幕的光洒在肚皮上 */}
      <ellipse cx="380" cy="252" rx="215" ry="190" fill="url(#cg-sixty-glow)" />
      {/* 外套卷垫在脑后 */}
      <ellipse cx="646" cy="238" rx="86" ry="30" fill="var(--frog-badge)" opacity="0.55" />
      {/* 手臂举着手机 */}
      {[
        "M508 188 Q478 160 452 154",
        "M510 330 Q480 352 452 352",
      ].map((d, i) => (
        <g key={`sixty-arm-${i}`}>
          <path d={d} fill="none" stroke="var(--frog-ink)" strokeWidth="30" strokeLinecap="round" />
          <path d={d} fill="none" stroke="var(--frog-bluegray)" strokeWidth="23" strokeLinecap="round" />
        </g>
      ))}
      {/* 手机：查分页面，屏幕朝上 */}
      <g transform="rotate(-6 380 250)">
        <rect x="300" y="115" width="160" height="270" rx="18" fill="var(--frog-ink)" />
        <rect x="308" y="123" width="144" height="254" rx="12" fill="hsl(var(--background))" />
        <rect x="360" y="128" width="40" height="5" rx="2.5" fill="var(--frog-ink)" opacity="0.3" />
        <text x="380" y="159" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--frog-ink)">成绩查询</text>
        <path d="M320 170 h120" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.2" />
        <text x="322" y="190" fontSize="9.5" fill="var(--frog-ink)" opacity="0.55">课程</text>
        <text x="322" y="207" fontSize="11" fontWeight="600" fill="var(--frog-ink)">《大学生心理健康》</text>
        <text x="322" y="228" fontSize="9.5" fill="var(--frog-ink)" opacity="0.55">类型</text>
        <text x="356" y="228" fontSize="11" fill="var(--frog-ink)">补考</text>
        {/* 成绩格：正好六十 */}
        <rect x="320" y="242" width="120" height="78" rx="8" fill="hsl(var(--primary))" opacity="0.12" />
        <text x="329" y="258" fontSize="9" fill="var(--frog-ink)" opacity="0.5">成绩</text>
        <text x="380" y="306" textAnchor="middle" fontSize="54" fontWeight="800" fill="hsl(var(--primary))">60</text>
        {/* 备注栏：空的 */}
        <text x="322" y="344" fontSize="9.5" fill="var(--frog-ink)" opacity="0.55">备注</text>
        <path d="M356 348 h84" stroke="var(--frog-ink)" strokeWidth="1" opacity="0.14" />
        <text x="380" y="368" textAnchor="middle" fontSize="8" fill="var(--frog-ink)" opacity="0.35">查分系统 · 22:00</text>
      </g>
      {/* 头（俯视：闭着的眼，松下来的嘴） */}
      <circle cx="628" cy="170" r="80" fill="var(--frog-bluegray)" stroke="var(--frog-ink)" strokeWidth="3" />
      <circle cx="598" cy="118" r="23" fill="var(--frog-bluegray)" stroke="var(--frog-ink)" strokeWidth="2.5" />
      <circle cx="664" cy="130" r="23" fill="var(--frog-bluegray)" stroke="var(--frog-ink)" strokeWidth="2.5" />
      <path d="M588 118 q10 9 20 0" fill="none" stroke="var(--frog-ink)" strokeWidth="3" strokeLinecap="round" />
      <path d="M654 130 q10 9 20 0" fill="none" stroke="var(--frog-ink)" strokeWidth="3" strokeLinecap="round" />
      <path d="M598 200 q30 16 62 -6" fill="none" stroke="var(--frog-ink)" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

/* ---------- cg-first-draft 第一版（行政楼线第四幕《带教》，批次 CY-126） ---------- */

function CgFirstDraft() {
  /* 第一版：期末最后一天的里间，两只淡紫色的蛙隔着一张桌子——
     「过时不候」四个字被划掉之前，在这张桌上活了一上午。教的那只，也是被教过的。 */
  return (
    <g>
      {/* 背景：里间的墙与午后的窗 */}
      <rect x="0" y="0" width="800" height="450" fill="hsl(var(--secondary))" />
      <rect x="0" y="0" width="800" height="316" fill="hsl(var(--card))" opacity="0.55" />
      {/* 右上的窗：期末最后一天的太阳斜进来 */}
      <rect x="606" y="36" width="164" height="168" rx="6" fill="var(--map-water)" opacity="0.45" />
      <rect x="606" y="36" width="164" height="168" rx="6" fill="none" stroke="var(--frog-ink)" strokeWidth="6" opacity="0.5" />
      <path d="M688 36 v168 M606 120 h164" stroke="var(--frog-ink)" strokeWidth="4" opacity="0.4" />
      {/* 左墙：文件柜与挂钟，指针停在四点五十 */}
      <rect x="26" y="118" width="76" height="198" rx="4" fill="var(--frog-ink)" opacity="0.28" />
      <path d="M34 168 h60 M34 218 h60 M34 268 h60" stroke="hsl(var(--background))" strokeWidth="2" opacity="0.3" />
      <circle cx="330" cy="76" r="30" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="3" opacity="0.85" />
      <path d="M330 76 L330 56" stroke="var(--frog-ink)" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      <path d="M330 76 L316 88" stroke="var(--frog-ink)" strokeWidth="2.4" strokeLinecap="round" opacity="0.6" />
      {/* 里间的桌子 */}
      <path d="M0 316 L800 306 L800 450 L0 450 Z" fill="var(--map-wood)" />
      <path d="M0 316 L800 306 L800 320 L0 330 Z" fill="hsl(var(--background))" opacity="0.4" />
      {/* 格格：坐桌子这头，工牌挂在前胸，手伸向那张初稿 */}
      <g>
        <ellipse cx="186" cy="286" rx="54" ry="58" fill="var(--frog-gege)" />
        <circle cx="186" cy="196" r="33" fill="var(--frog-gege)" />
        <circle cx="198" cy="192" r="3.4" fill="var(--frog-ink)" opacity="0.85" />
        <circle cx="174" cy="192" r="3.4" fill="var(--frog-ink)" opacity="0.85" />
        <path d="M178 208 q8 5 16 0" stroke="var(--frog-ink)" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.6" />
        {/* 工牌：挂绳 + 大一拍的照片 */}
        <path d="M170 226 L186 252 L202 226" stroke="var(--frog-ink)" strokeWidth="2.4" fill="none" opacity="0.55" />
        <rect x="172" y="250" width="28" height="36" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.95" />
        <rect x="177" y="255" width="18" height="14" rx="1" fill="var(--frog-gege-deep)" opacity="0.55" />
        <path d="M177 275 h18 M177 280 h12" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.4" />
      </g>
      {/* 大一的实习生：坐桌子那头，更小一号，笔握得很紧 */}
      <g>
        <ellipse cx="612" cy="292" rx="42" ry="48" fill="var(--frog-gege)" opacity="0.82" />
        <circle cx="612" cy="222" r="26" fill="var(--frog-gege)" opacity="0.88" />
        <circle cx="602" cy="219" r="3" fill="var(--frog-ink)" opacity="0.8" />
        <circle cx="621" cy="219" r="3" fill="var(--frog-ink)" opacity="0.8" />
        <path d="M605 232 q7 4 14 0" stroke="var(--frog-ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.55" />
      </g>
      {/* 桌上正中：那张第一版——原话被划掉，译文写在旁边 */}
      <g transform="rotate(-2 372 372)">
        <rect x="308" y="326" width="132" height="102" rx="3" fill="var(--frog-ink)" opacity="0.14" />
        <rect x="304" y="322" width="132" height="102" rx="3" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.98" />
        <text x="370" y="345" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--frog-ink)" opacity="0.85">
          寒假值班通知
        </text>
        <path d="M318 358 h104 M318 370 h96" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.35" />
        <text x="370" y="400" textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--frog-ink)" opacity="0.8">
          过时不候
        </text>
        <path d="M330 395 h80" stroke="var(--frog-mouth)" strokeWidth="2.6" opacity="0.75" strokeLinecap="round" />
        <text x="370" y="416" textAnchor="middle" fontSize="10.5" fill="var(--frog-bluegray-deep)" opacity="0.7">
          值班安排调整
        </text>
      </g>
      {/* 格格的手与笔：正落在那道划痕上 */}
      <path d="M226 262 Q280 300 322 368" stroke="var(--frog-gege-deep)" strokeWidth="13" fill="none" strokeLinecap="round" />
      <g transform="rotate(38 330 378)">
        <rect x="326" y="356" width="7" height="40" rx="3" fill="hsl(var(--primary))" opacity="0.85" />
        <path d="M326 394 L333 394 L329.5 404 Z" fill="var(--frog-ink)" opacity="0.75" />
      </g>
      {/* 实习生的新笔记本：封皮还是新的，反着光 */}
      <g transform="rotate(3 588 384)">
        <rect x="540" y="352" width="96" height="64" rx="3" fill="var(--frog-bluegray)" opacity="0.55" />
        <rect x="540" y="352" width="96" height="64" rx="3" fill="none" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.45" />
        <path d="M548 408 L600 356 L620 356 L560 414 Z" fill="hsl(var(--background))" opacity="0.35" />
        <path d="M556 372 h64 M556 386 h52" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.35" />
      </g>
      <path d="M600 306 Q604 320 596 330 M616 308 Q620 322 612 332" stroke="var(--frog-gege-deep)" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.85" />
      {/* 橡皮屑：拢成一小堆，像连弄脏桌子都要先打报告 */}
      <circle cx="536" cy="424" r="2.6" fill="var(--frog-ink)" opacity="0.35" />
      <circle cx="543" cy="428" r="2" fill="var(--frog-ink)" opacity="0.3" />
      <circle cx="529" cy="429" r="1.8" fill="var(--frog-ink)" opacity="0.28" />
      {/* 桌角左手边：座机与「三个必接」便签 */}
      <rect x="42" y="346" width="86" height="46" rx="9" fill="var(--frog-ink)" opacity="0.78" />
      <path d="M56 342 q28 -20 58 -2" stroke="var(--frog-ink)" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.6" />
      <g transform="rotate(-5 168 366)">
        <rect x="142" y="342" width="54" height="48" rx="2" fill="var(--frog-badge)" stroke="var(--frog-ink)" strokeWidth="1.4" opacity="0.95" />
        <text x="169" y="363" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-ink)" opacity="0.75">
          三个
        </text>
        <text x="169" y="378" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--frog-ink)" opacity="0.75">
          必接
        </text>
      </g>
      {/* 桌角右手边：模板文件夹，比带教来得早；旁边一杯凉透的茶 */}
      <g transform="rotate(2 496 352)">
        <rect x="452" y="322" width="92" height="60" rx="3" fill="var(--frog-khaki)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.95" />
        <rect x="460" y="330" width="44" height="16" rx="2" fill="var(--frog-belly)" opacity="0.9" />
        <text x="482" y="342" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--frog-ink)" opacity="0.7">
          模板
        </text>
        <path d="M462 358 h72 M462 370 h56" stroke="var(--frog-ink)" strokeWidth="1.8" opacity="0.3" />
      </g>
      <rect x="700" y="352" width="30" height="32" rx="4" fill="var(--frog-belly)" stroke="var(--frog-ink)" strokeWidth="1.6" opacity="0.9" />
      <path d="M730 360 q12 4 0 16" stroke="var(--frog-ink)" strokeWidth="2.4" fill="none" opacity="0.5" />
      {/* 光效：窗里斜进来的下午，正好落在两张纸的中间 */}
      <path d="M640 36 L800 36 L800 450 L356 450 Z" fill="var(--frog-badge)" opacity="0.07" />
      <path d="M0 436 h120 M660 440 h120" stroke="hsl(var(--background))" strokeWidth="4" opacity="0.18" />
    </g>
  );
}

const CG_ART: Record<string, () => ReactElement> = {
  "cg-plan-sheet": CgPlanSheet,
  "cg-library-window": CgLibraryWindow,
  "cg-thirty-one-grids": CgThirtyOneGrids,
  "cg-canteen-spoon": CgCanteenSpoon,
  "cg-club-stage": CgClubStage,
  "cg-field-dusk": CgFieldDusk,
  "cg-locker-notes": CgLockerNotes,
  "cg-stamp-window": CgStampWindow,
  "cg-lake-moon": CgLakeMoon,
  "cg-ceremony-hall": CgCeremonyHall,
  "cg-countdown-board": CgCountdownBoard,
  "cg-seat-cups": CgSeatCups,
  "cg-closing-countdown": CgClosingCountdown,
  "cg-canteen-closing": CgCanteenClosing,
  "cg-club-desk": CgClubDesk,
  "cg-club-grid": CgClubGrid,
  "cg-lawn-lamps": CgLawnLamps,
  "cg-soda-grass": CgSodaGrass,
  "cg-schedule-paper": CgSchedulePaper,
  "cg-402-night": Cg402Night,
  "cg-survey-stack": CgSurveyStack,
  "cg-review-templates": CgReviewTemplates,
  "cg-phones-down": CgPhonesDown,
  "cg-corn-pot": CgCornPot,
  "cg-sign-sheet": CgSignSheet,
  "cg-green-lamp": CgGreenLamp,
  "cg-power-cut": CgPowerCut,
  "cg-curtain-light": CgCurtainLight,
  "cg-score-sticker": CgScoreSticker,
  "cg-alarm-1105": CgAlarm1105,
  "cg-dawn-dorm": CgDawnDorm,
  "cg-thirty-min": CgThirtyMin,
  "cg-red-circles": CgRedCircles,
  "cg-17-windows": Cg17Windows,
  "cg-menu-board": CgMenuBoard,
  "cg-half-bowl": CgHalfBowl,
  "cg-lamp-off": CgLampOff,
  "cg-balloon-43": CgBalloon43,
  "cg-eval-menu": CgEvalMenu,
  "cg-ten-minutes": CgTenMinutes,
  "cg-report-page": CgReportPage,
  "cg-two-bottles": CgTwoBottles,
  "cg-chorus": CgChorus,
  "cg-melatonin": CgMelatonin,
  "cg-folded-paper": CgFoldedPaper,
  "cg-locked-answer": CgLockedAnswer,
  "cg-badge-note": CgBadgeNote,
  "cg-seven-versions": CgSevenVersions,
  "cg-final-clause": CgFinalClause,
  "cg-flyer-half": CgFlyerHalf,
  "cg-timeline-flag": CgTimelineFlag,
  "cg-same-sheet": CgSameSheet,
  "cg-old-phone": CgOldPhone,
  "cg-far-light": CgFarLight,
  "cg-only-the-lake": CgOnlyTheLake,
  /* 医务室线《病假条》（成就 CG 扩容批次） */
  "cg-infirmary-bed": CgInfirmaryBed,
  "cg-symptom-chart": CgSymptomChart,
  "cg-reason-drawer": CgReasonDrawer,
  "cg-stub-wall": CgStubWall,
  "cg-second-form": CgSecondForm,
  "cg-last-page": CgLastPage,
  "cg-side-momo": CgSideMomo,
  "cg-side-meimei": CgSideMeimei,
  "cg-side-huihui": CgSideHuihui,
  "cg-side-ganfanshu": CgSideGanfanshu,
  "cg-side-zaizai": CgSideZaizai,
  "cg-side-gege": CgSideGege,
  "cg-side-gege-x": CgSideGegeExclusive,
  "cg-side-momo-x": CgSideMomoExclusive,
  "cg-side-meimei-x": CgSideMeimeiExclusive,
  "cg-side-huihui-x": CgSideHuihuiExclusive,
  "cg-side-zaizai-x": CgSideZaizaiExclusive,
  "cg-side-ganfanshu-x": CgSideGanfanshuExclusive,
  "cg-lake-stones": CgLakeStones,
  /* 教学楼线《开学第一课》扩写（批次 CY-113） */
  "cg-four-glows": CgFourGlows,
  "cg-two-lists": CgTwoLists,
  /* 食堂线《已老实食堂》扩写（批次 CY-114） */
  "cg-old-pot": CgOldPot,
  "cg-folded-apron": CgApronShelf,
  /* 行政楼线《最终解释权》扩写（批次 CY-118） */
  "cg-exam-wall": CgExamWall,
  /* 四线第三幕扩写（批次 CY-121） */
  "cg-ten-seconds": CgTenSeconds,
  "cg-row-sixty-one": CgRowSixtyOne,
  "cg-marked-present": CgMarkedPresent,
  "cg-lake-breakfast": CgLakeBreakfast,
  /* 操场线补考出分（批次 CY-122） */
  "cg-sixty-points": CgSixtyPoints,
  /* 行政楼线第四幕《带教》（批次 CY-126） */
  "cg-first-draft": CgFirstDraft,
};
