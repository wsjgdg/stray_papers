/**
 * 奶蛙大学 · 矢量奶蛙组件库
 * 全部原创扁平手绘风（SVG），配色走 CSS 变量，三套主题下自动协调。
 * 公共特征：圆滚滚身体、两只大眼睛、腮红、扁平奶fufu。
 * 表现层切片新增：pose 姿势三变体（stand/lean/hold）与查寝装备预设 FrogGeGePatrol，均为纯增补。
 */
import { clsx } from "clsx";
import type { ComponentType } from "react";
import type { FrogCharacterId } from "@/data/characters";

/**
 * 表情随沉默值渐变：笑 → 微笑 → 僵住 → 沉默。
 * 批次 D1 表情差分补四档：soft（眉眼放松）/ blush（红温脸红）/ teary（眼眶含泪）/ sparkle（眼睛亮起），
 * 只由剧本标注与好感档位选用，不进沉默值分档口径。
 */
export type FrogExpression =
  | "laugh"
  | "smile"
  | "frozen"
  | "silent"
  | "soft"
  | "blush"
  | "teary"
  | "sparkle";

export type FrogAccessory = "glasses" | "bow" | "apron" | "eyebags" | "ahoge" | "backpack" | "thermos" | "lanyard";

/**
 * 立绘姿势变体（《熄灯之后》表现层切片）：
 * stand=标准站姿（缺省，与既有立绘完全一致）/ lean=探头倚靠（身体倾斜塌肩）/ hold=环抱（双臂抱在身前）/ lie=平躺（操场线专用，身体横置肚皮微朝上）。
 */
export type FrogPose = "stand" | "lean" | "hold" | "lie";

export interface FrogPalette {
  body: string;
  bodyDeep: string;
  belly: string;
  blush: string;
}

/** 五套角色配色（值全部是 CSS 变量引用） */
export const FROG_PALETTES = {
  cream: {
    body: "var(--frog-cream)",
    bodyDeep: "var(--frog-cream-deep)",
    belly: "var(--frog-belly)",
    blush: "var(--frog-blush)",
  },
  matcha: {
    body: "var(--frog-matcha)",
    bodyDeep: "var(--frog-matcha-deep)",
    belly: "var(--frog-belly)",
    blush: "var(--frog-blush)",
  },
  berry: {
    body: "var(--frog-berry)",
    bodyDeep: "var(--frog-berry-deep)",
    belly: "var(--frog-belly)",
    blush: "var(--frog-blush)",
  },
  bluegray: {
    body: "var(--frog-bluegray)",
    bodyDeep: "var(--frog-bluegray-deep)",
    belly: "var(--frog-belly)",
    blush: "var(--frog-blush)",
  },
  khaki: {
    body: "var(--frog-khaki)",
    bodyDeep: "var(--frog-khaki-deep)",
    belly: "var(--frog-belly)",
    blush: "var(--frog-blush)",
  },
  zzaizai: {
    body: "var(--frog-zzaizai)",
    bodyDeep: "var(--frog-zzaizai-deep)",
    belly: "var(--frog-belly)",
    blush: "var(--frog-blush)",
  },
  gege: {
    body: "var(--frog-gege)",
    bodyDeep: "var(--frog-gege-deep)",
    belly: "var(--frog-belly)",
    blush: "var(--frog-blush)",
  },
  mianmian: {
    body: "var(--frog-mianmian)",
    bodyDeep: "var(--frog-mianmian-deep)",
    belly: "var(--frog-belly)",
    blush: "var(--frog-blush)",
  },
} satisfies Record<string, FrogPalette>;

export type FrogPaletteName = keyof typeof FROG_PALETTES;

export interface FrogProps {
  palette?: FrogPalette;
  accessories?: FrogAccessory[];
  expression?: FrogExpression;
  /** 立绘姿势：stand=标准（缺省）/ lean=倚靠塌肩 / hold=双臂环抱 / lie=平躺 */
  pose?: FrogPose;
  /** 查寝装备（手电 + 签到板 + 工牌）：仅供 FrogGeGePatrol 预设内部使用 */
  patrolGear?: boolean;
  /** 显示宽度（px），高度按 112/120 比例 */
  size?: number;
  className?: string;
  /** 轻微上下漂浮的待机动效 */
  floaty?: boolean;
}

/** 沉默值 → 表情分档（0 笑 / 1-2 微笑 / 3-4 僵住 / 5+ 沉默） */
export function expressionForSilence(value: number): FrogExpression {
  if (value <= 0) return "laugh";
  if (value <= 2) return "smile";
  if (value <= 4) return "frozen";
  return "silent";
}

export function Frog({
  palette = FROG_PALETTES.cream,
  accessories = [],
  expression = "smile",
  pose = "stand",
  patrolGear = false,
  size = 96,
  className,
  floaty = false,
}: FrogProps) {
  const has = (part: FrogAccessory) => accessories.includes(part);
  const eyeClosed = expression === "silent";
  const squint = expression === "frozen";
  /* lean：整只身体绕脚底转 7 度，肩膀跟着塌下去；lie：绕脚底转 84 度横置躺平，肚皮微朝上；stand 保持原样零差分 */
  const leaning = pose === "lean";
  const lying = pose === "lie";
  const bodyTransform = leaning ? "rotate(7 60 104)" : lying ? "rotate(84 60 104)" : undefined;

  return (
    <svg
      viewBox="0 0 120 112"
      width={size}
      height={(size * 112) / 120}
      className={clsx(floaty && "anim-float", className)}
      role="img"
      aria-label="一只奶蛙"
    >
      {/* 地面投影：躺平时压扁拉长一截 */}
      <ellipse cx={lying ? 62 : 60} cy={lying ? 104 : 105} rx={lying ? 46 : 33} ry={lying ? 4 : 5.5} fill="var(--frog-shadow)" />
      <g transform={bodyTransform}>
      {/* 后脚 */}
      {/* 后脚 */}
      <ellipse cx="33" cy="95" rx="13" ry="8" fill={palette.bodyDeep} />
      <ellipse cx="87" cy="95" rx="13" ry="8" fill={palette.bodyDeep} />
      {/* 圆滚滚身体 */}
      <ellipse cx="60" cy="66" rx="42" ry="38" fill={palette.body} />
      {/* 奶fufu肚皮 */}
      <ellipse cx="60" cy="80" rx="26" ry="20" fill={palette.belly} />
      {/* 查寝装备 · 签到板：贴在身前，hold 时正好落在环抱的双臂里 */}
      {patrolGear && (
        <g>
          <rect x="43" y="60" width="34" height="46" rx="4" fill="var(--map-wood)" stroke="var(--frog-bag)" strokeWidth="1.8" />
          <rect x="47" y="67" width="26" height="33" rx="2" fill="var(--frog-belly)" />
          <path d="M51 75 h18 M51 82 h18 M51 89 h12" stroke="var(--frog-ink)" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" fill="none" />
          <rect x="54" y="55" width="12" height="8" rx="3" fill="var(--frog-bag)" />
        </g>
      )}
      {/* 前手：stand/lean 垂在身侧（lean 塌肩下垂），lie 摊开放平（草接住的那双手），hold 换成环抱的双臂 */}
      {pose !== "hold" && (
        <g>
          <ellipse
            cx={lying ? 30 : 20}
            cy={lying ? 78 : leaning ? 85 : 80}
            rx={lying ? 11 : 8}
            ry={lying ? 8 : 11}
            fill={palette.body}
            transform={lying ? "rotate(96 30 78)" : leaning ? "rotate(28 20 85)" : "rotate(16 20 80)"}
          />
          <ellipse
            cx={lying ? 90 : 100}
            cy={lying ? 78 : leaning ? 85 : 80}
            rx={lying ? 11 : 8}
            ry={lying ? 8 : 11}
            fill={palette.body}
            transform={lying ? "rotate(-96 90 78)" : leaning ? "rotate(-28 100 85)" : "rotate(-16 100 80)"}
          />
        </g>
      )}
      {pose === "hold" && (
        <g>
          {/* 双臂环抱：两条前臂在肚皮前交叠，抱住枕头或签到板 */}
          <path d="M22 74 Q42 97 64 92" stroke={palette.body} strokeWidth="13" fill="none" strokeLinecap="round" />
          <path d="M98 74 Q78 97 56 92" stroke={palette.body} strokeWidth="13" fill="none" strokeLinecap="round" />
          <ellipse cx="64" cy="92" rx="9" ry="7" fill={palette.bodyDeep} />
          <ellipse cx="56" cy="92" rx="9" ry="7" fill={palette.bodyDeep} />
        </g>
      )}

      {/* 大眼睛 */}
      {!eyeClosed && (
        <g>
          <circle cx="36" cy="30" r="15" fill="var(--frog-eye)" />
          <circle cx="84" cy="30" r="15" fill="var(--frog-eye)" />
          {squint ? (
            <g>
              <path d="M21 30 a15 15 0 0 1 30 0 Z" fill={palette.body} stroke="var(--frog-ink)" strokeWidth="1.6" />
              <path d="M69 30 a15 15 0 0 1 30 0 Z" fill={palette.body} stroke="var(--frog-ink)" strokeWidth="1.6" />
              <circle cx="36" cy="35" r="5" fill="var(--frog-ink)" />
              <circle cx="84" cy="35" r="5" fill="var(--frog-ink)" />
            </g>
          ) : (
            <g>
              <circle cx="38" cy="31" r="6.5" fill="var(--frog-ink)" />
              <circle cx="86" cy="31" r="6.5" fill="var(--frog-ink)" />
              <circle cx="40.2" cy="28.4" r="2.3" fill="var(--frog-eye)" />
              <circle cx="88.2" cy="28.4" r="2.3" fill="var(--frog-eye)" />
            </g>
          )}
        </g>
      )}
      {/* 沉默：闭眼 + 一滴冷汗 */}
      {eyeClosed && (
        <g>
          <g stroke="var(--frog-ink)" strokeWidth="3" fill="none" strokeLinecap="round">
            <path d="M26 32 q10 -9 20 0" />
            <path d="M74 32 q10 -9 20 0" />
          </g>
          <path d="M97 18 q5 7 0 11 q-5 -4 0 -11" fill="var(--frog-sweat)" />
        </g>
      )}

      {/* 批次 D1 表情差分（小增补，全自绘 SVG，零外链） */}
      {/* soft：眉眼放松——上眼睑压低一档，留一道松下来的眼皮线 */}
      {!eyeClosed && expression === "soft" && (
        <g>
          <path d="M23.3 22 A15 15 0 0 1 48.7 22 Z" fill={palette.body} opacity="0.92" />
          <path d="M71.3 22 A15 15 0 0 1 96.7 22 Z" fill={palette.body} opacity="0.92" />
          <path d="M25 24.5 q11 -5.5 22 -1.2" stroke="var(--frog-ink)" strokeWidth="1.8" fill="none" opacity="0.45" strokeLinecap="round" />
          <path d="M73 24.5 q11 -5.5 22 -1.2" stroke="var(--frog-ink)" strokeWidth="1.8" fill="none" opacity="0.45" strokeLinecap="round" />
        </g>
      )}
      {/* teary：眼眶含泪——下眼睑一条水线 + 眼角各挂一滴没掉下来的泪 */}
      {!eyeClosed && expression === "teary" && (
        <g>
          <g stroke="var(--frog-sweat)" strokeWidth="2.4" fill="none" opacity="0.95" strokeLinecap="round">
            <path d="M27 41 q9 3.5 18 0" />
            <path d="M75 41 q9 3.5 18 0" />
          </g>
          <path d="M21.5 35 q5 8 0 13 q-5 -5 0 -13 Z" fill="var(--frog-sweat)" opacity="0.9" />
          <path d="M98.5 35 q-5 8 0 13 q5 -5 0 -13 Z" fill="var(--frog-sweat)" opacity="0.9" />
        </g>
      )}
      {/* sparkle：眼睛亮起——瞳孔里多一颗大高光 + 眼侧两粒星 */}
      {!eyeClosed && expression === "sparkle" && (
        <g fill="var(--frog-eye)" opacity="0.95">
          <circle cx="40.5" cy="28.2" r="3.4" />
          <circle cx="88.5" cy="28.2" r="3.4" />
          <circle cx="35.6" cy="34" r="1.7" opacity="0.85" />
          <circle cx="83.6" cy="34" r="1.7" opacity="0.85" />
          <path d="M17 7.5 L18.3 10.7 L21.5 12 L18.3 13.3 L17 16.5 L15.7 13.3 L12.5 12 L15.7 10.7 Z" />
          <path d="M104 9.4 L105 11.8 L107.4 13 L105 14.2 L104 16.6 L103 14.2 L100.6 13 L103 11.8 Z" />
        </g>
      )}

      {/* 腮红 */}
      <ellipse cx="28" cy="60" rx="8" ry="5" fill={palette.blush} opacity="0.85" />
      <ellipse cx="92" cy="60" rx="8" ry="5" fill={palette.blush} opacity="0.85" />
      {/* blush：红温——腮红烧过界 + 鬓角两道热气 */}
      {expression === "blush" && (
        <g>
          <ellipse cx="27" cy="62" rx="12" ry="7.5" fill={palette.blush} opacity="0.95" />
          <ellipse cx="93" cy="62" rx="12" ry="7.5" fill={palette.blush} opacity="0.95" />
          <g stroke={palette.blush} strokeWidth="2.4" fill="none" opacity="0.8" strokeLinecap="round">
            <path d="M12 50 q-4 -6 -1 -11" />
            <path d="M18 44 q-3 -5 -1 -9" />
            <path d="M108 50 q4 -6 1 -11" />
            <path d="M102 44 q3 -5 1 -9" />
          </g>
        </g>
      )}

      {/* 嘴 */}
      {expression === "laugh" && (
        <g>
          <path d="M44 70 Q60 94 76 70 Q60 79 44 70 Z" fill="var(--frog-mouth)" />
          <ellipse cx="60" cy="80" rx="7" ry="3.6" fill={palette.bodyDeep} opacity="0.9" />
        </g>
      )}
      {expression === "smile" && (
        <path d="M47 73 Q60 84 73 73" stroke="var(--frog-ink)" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      )}
      {expression === "frozen" && (
        <path d="M50 77 L70 77" stroke="var(--frog-ink)" strokeWidth="3" strokeLinecap="round" />
      )}
      {expression === "silent" && (
        <path d="M54 80 L66 80" stroke="var(--frog-ink)" strokeWidth="2.6" strokeLinecap="round" />
      )}
      {/* 批次 D1 表情差分嘴形 */}
      {expression === "soft" && (
        <path d="M50 73 Q60 80 70 73" stroke="var(--frog-ink)" strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
      {expression === "blush" && (
        <path d="M48 78 Q54 74 60 78 Q66 82 72 78" stroke="var(--frog-ink)" strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
      {expression === "teary" && (
        <path d="M51 78 Q56 81 60 79 Q64 77 69 80" stroke="var(--frog-ink)" strokeWidth="2.8" fill="none" strokeLinecap="round" />
      )}
      {expression === "sparkle" && (
        <path d="M48 72 Q60 88 72 72 Q60 79 48 72 Z" fill="var(--frog-mouth)" />
      )}

      {/* 配件 */}
      {has("ahoge") && (
        <path d="M60 28 Q54 12 70 14" stroke="var(--frog-ink)" strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
      {has("glasses") && (
        <g fill="var(--frog-glass)" stroke="var(--frog-ink)" strokeWidth="3">
          <circle cx="36" cy="30" r="17.5" />
          <circle cx="84" cy="30" r="17.5" />
          <path d="M53.5 27 Q60 23 66.5 27" fill="none" />
          <path d="M18.5 30 L11 33" fill="none" />
          <path d="M101.5 30 L109 33" fill="none" />
        </g>
      )}
      {has("eyebags") && (
        <g stroke="var(--frog-bag)" strokeWidth="2.4" fill="none" strokeLinecap="round">
          <path d="M27 42 q9 5 18 0" />
          <path d="M75 42 q9 5 18 0" />
        </g>
      )}
      {has("bow") && (
        <g transform="translate(90 13) rotate(12)">
          <path d="M0 0 L-13 -7 L-13 9 Z" fill="var(--frog-bow)" />
          <path d="M0 0 L13 -7 L13 9 Z" fill="var(--frog-bow)" />
          <circle cx="0" cy="0" r="4.5" fill="var(--frog-bow-deep)" />
        </g>
      )}
      {has("apron") && (
        <g>
          <path
            d="M46 54 L48 66 M74 54 L72 66"
            stroke="var(--frog-apron-line)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M38 64 Q60 72 82 64 L80 92 Q60 99 40 92 Z"
            fill="var(--frog-apron)"
            stroke="var(--frog-apron-line)"
            strokeWidth="2"
          />
          <path d="M50 76 Q60 81 70 76" stroke="var(--frog-apron-line)" strokeWidth="2" fill="none" strokeLinecap="round" />
          {/* 工牌 */}
          <g transform="translate(72 79)">
            <path d="M-9 -15 L0 -4 M9 -15 L0 -4" stroke="var(--frog-ink)" strokeWidth="1.5" fill="none" />
            <rect
              x="-7"
              y="-6"
              width="14"
              height="16"
              rx="2.5"
              fill="var(--frog-badge)"
              stroke="var(--frog-apron-line)"
              strokeWidth="1.5"
            />
            <path d="M-4 -1 h8 M-4 3 h8 M-4 7 h5" stroke="var(--frog-ink)" strokeWidth="1.4" strokeLinecap="round" />
          </g>
          {/* 手勺 */}
          <g transform="translate(106 64) rotate(18)">
            <ellipse cx="0" cy="-8" rx="7" ry="9" fill="var(--map-wood)" />
            <rect x="-2.4" y="0" width="4.8" height="24" rx="2.4" fill="var(--map-wood)" />
          </g>
        </g>
      )}
      {has("backpack") && (
        <g>
          {/* 旧书包：从脑后探出的一角 + 胸前的两条背带 */}
          <rect x="5" y="3" width="24" height="22" rx="8" fill="var(--map-wood)" stroke="var(--frog-bag)" strokeWidth="1.6" />
          <path d="M11 14 h12" stroke="var(--frog-bag)" strokeWidth="2" strokeLinecap="round" />
          <rect x="22" y="19" width="7" height="6" rx="2" fill="var(--frog-bag)" />
          <path d="M45 45 C 45 51 44 56 43 61" stroke="var(--frog-bag)" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M75 45 C 75 51 76 56 77 61" stroke="var(--frog-bag)" strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      )}
      {has("thermos") && (
        <g>
          {/* 保温杯：握在左手里，杯身早就不冒热气了 */}
          <rect x="93" y="60" width="17" height="27" rx="5" fill="var(--frog-apron)" stroke="var(--frog-bag)" strokeWidth="2" />
          <rect x="91.5" y="54" width="20" height="9" rx="4" fill="var(--frog-bag)" />
          <path d="M97 74 h9" stroke="var(--frog-bag)" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
        </g>
      )}
      {has("lanyard") && (
        <g>
          {/* 学生工牌挂绳 + 胸卡：工牌是学生的，职责是老师的 */}
          <path d="M40 47 C 46 52 52 55 57 58" stroke="var(--frog-bag)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M80 47 C 74 52 68 55 63 58" stroke="var(--frog-bag)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <rect x="48" y="53" width="24" height="18" rx="3" fill="var(--frog-badge)" stroke="var(--frog-bag)" strokeWidth="1.6" />
          <circle cx="56" cy="60" r="3.4" fill="var(--frog-apron)" stroke="var(--frog-apron-line)" strokeWidth="1.2" />
          <path d="M62 58 h6 M62 62 h6 M53 66 h15" stroke="var(--frog-ink)" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
        </g>
      )}
      {/* 查寝装备 · 手电：握在右爪里，一格光斜向下探 */}
      {patrolGear && (
        <g transform="translate(98 72) rotate(56)">
          <rect x="-5" y="-4.5" width="17" height="9" rx="3.5" fill="var(--frog-bag)" />
          <rect x="12" y="-3.5" width="5" height="7" rx="1.5" fill="var(--frog-bag)" opacity="0.85" />
          <polygon points="17,-3 33,-8 33,8 17,3" fill="hsl(var(--background))" opacity="0.6" />
        </g>
      )}
      {/* 查寝装备 · 工牌：挂绳垂下来，夹在签到板角上 */}
      {patrolGear && (
        <g>
          <path d="M47 42 L45 54" stroke="var(--frog-bag)" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="35" y="52" width="18" height="14" rx="2.5" fill="var(--frog-badge)" stroke="var(--frog-bag)" strokeWidth="1.4" />
          <text x="44" y="62.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="var(--frog-ink)">
            查寝
          </text>
        </g>
      )}
      </g>
    </svg>
  );
}

/* ---------- 角色预设（人设严格对齐剧本档案；v2 扩充后七只） ---------- */

type CharacterFrogProps = Omit<FrogProps, "palette" | "accessories">;

/** 奶白（主角=玩家）：普通奶白肤色，「普通得发光」 */
export function FrogNaiBai({ expression = "smile", ...rest }: CharacterFrogProps) {
  return <Frog palette={FROG_PALETTES.cream} accessories={[]} expression={expression} {...rest} />;
}

/** 抹抹（抹茶蛙）：圆眼镜 + 头顶呆毛，绩点 4.0 卷王学神 */
export function FrogMoMo({ expression = "smile", ...rest }: CharacterFrogProps) {
  return <Frog palette={FROG_PALETTES.matcha} accessories={["glasses", "ahoge"]} expression={expression} {...rest} />;
}

/** 莓莓（草莓蛙）：头上小蝴蝶结，社牛微笑面具 */
export function FrogMeiMei({ expression = "laugh", ...rest }: CharacterFrogProps) {
  return <Frog palette={FROG_PALETTES.berry} accessories={["bow"]} expression={expression} {...rest} />;
}

/** 灰灰（忧郁蛙）：黑眼圈 + 塌肩，躺平哲学家 */
export function FrogHuiHui({ expression = "silent", ...rest }: CharacterFrogProps) {
  return <Frog palette={FROG_PALETTES.bluegray} accessories={["eyebags"]} expression={expression} {...rest} />;
}

/** 干饭叔（社畜蛙）：食堂围裙 + 工牌 + 手勺，呆滞眼神 */
export function FrogGanFanShu({ expression = "frozen", ...rest }: CharacterFrogProps) {
  return <Frog palette={FROG_PALETTES.khaki} accessories={["apron"]} expression={expression} {...rest} />;
}

/** 再再（考研二战蛙）：深蓝紫低饱和 + 厚眼袋 + 塞满书的旧书包 + 保温杯，常驻自习楼 */
export function FrogZaiZai({ expression = "frozen", ...rest }: CharacterFrogProps) {
  return (
    <Frog
      palette={FROG_PALETTES.zzaizai}
      accessories={["eyebags", "backpack", "thermos"]}
      expression={expression}
      {...rest}
    />
  );
}

/** 格格（辅导员助理蛙）：淡紫薰衣草 + 学生工牌挂绳，夹在学生与制度之间 */
export function FrogGeGe({ expression = "smile", ...rest }: CharacterFrogProps) {
  return <Frog palette={FROG_PALETTES.gege} accessories={["lanyard"]} expression={expression} {...rest} />;
}

/** 格格查寝装扮（《熄灯之后》表现层切片）：手电 + 签到板 + 查寝工牌；pose 可叠加 stand/lean/hold */
export function FrogGeGePatrol({ expression = "smile", ...rest }: CharacterFrogProps) {
  return <Frog palette={FROG_PALETTES.gege} accessories={[]} expression={expression} {...rest} patrolGear />;
}

/** 棉棉（医务室老师蛙）：医用薄荷绿 + 教师工牌挂绳，白大褂下唯一的一点颜色 */
export function FrogMianMian({ expression = "smile", ...rest }: CharacterFrogProps) {
  return <Frog palette={FROG_PALETTES.mianmian} accessories={["lanyard"]} expression={expression} {...rest} />;
}

/** 角色档案 id → 对应矢量奶蛙组件 */
export const FROG_BY_CHARACTER: Record<FrogCharacterId, ComponentType<CharacterFrogProps>> = {
  naiBai: FrogNaiBai,
  moMo: FrogMoMo,
  meiMei: FrogMeiMei,
  huiHui: FrogHuiHui,
  ganFanShu: FrogGanFanShu,
  zaiZai: FrogZaiZai,
  geGe: FrogGeGe,
  mianMian: FrogMianMian,
};
