/**
 * 立绘站位：按出场蛙数自动排布，说话者亮、其他人暗半透明。
 * 批次 B2 演出：说话者切换滑入/淡入（0.22s，key 驱动重播）；真心话段落立绘轻微再放大。
 * 注视（批次 AY）：第四面墙本来就不存在——被注意值攒满后，立绘跟着你的鼠标看；
 * 玩家可以点住一只蛙注视它（它问你、它不自在、它回看你）；点击舞台它眨一下眼。
 */
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { FROG_CHARACTERS, type FrogCharacterId } from "@/data/characters";
import { FROG_BY_CHARACTER, FrogGeGePatrol, type FrogExpression, type FrogPose } from "@/components/frog/Frog";

/** 不同出场人数下的站位尺寸（px），主角始终站中间偏左第一顺位 */
const SIZE_PLANS: Record<number, number[]> = {
  1: [180],
  2: [150, 172],
  3: [138, 162, 138],
  4: [126, 144, 144, 126],
  5: [112, 130, 146, 130, 112],
};

/** 入场动画播完即摘（之后交给 transition 平滑接管） */
const ENTER_STAMP_MS = 260;

/** 眨眼动画播完即摘（批次 AY） */
const BLINK_MS = 220;

interface DialogueStageProps {
  castIds: FrogCharacterId[];
  activeSpeakerId: FrogCharacterId | null;
  /** 表情差分（批次 D1）：说话蛙的表情（标注/沉默值/坦诚度档位的结果）；null = 维持角色预设默认 */
  speakerExpression?: FrogExpression | null;
  /** 真心话段落：说话者立绘轻微放大（背景降饱和由父层做） */
  heartActive?: boolean;
  /** 姿势差分（批次 J）：说话蛙的姿势（stand/lean/hold）；只作用于说话蛙 */
  activePose?: FrogPose;
  /** 服装差分（批次 J）：说话蛙显示查寝装备（仅格格生效） */
  activeGear?: boolean;
  /** 沉默的物理空间（批次 AK，0-4）：沉默值越高，立绘越模糊——
   *  一档轮廓还在 / 二档表情看不清 / 三档只剩颜色块 / 四档只剩位置 */
  silenceStage?: number;
  /** 被注视（批次 AY）：归一化鼠标位置（-1~1）——立绘朝它那边微微转过去 */
  gaze?: { x: number; y: number } | null;
  /** 眨眼（批次 AY）：时间戳变化触发一次眨眼 */
  blinkStamp?: number;
  /** 正被玩家注视的蛙（批次 AY） */
  staringId?: FrogCharacterId | null;
  /** 注视切换（批次 AY）：点住一只蛙开始注视；行政楼的窗口会挡开 */
  onStare?: (id: FrogCharacterId) => void;
  /** 编目（批次 BS）：被否认/自行降级的蛙——位置还在，蛙不在了；自行降级的那格会闪。
   *  label（批次 CC）：离校的蛙用「学籍变动」替换默认角标 */
  blanks?: { id: FrogCharacterId; tier: "footnote" | "demoted"; label?: string }[];
}

export function DialogueStage({
  castIds,
  activeSpeakerId,
  speakerExpression = null,
  heartActive = false,
  activePose = "stand",
  activeGear = false,
  silenceStage = 0,
  gaze = null,
  blinkStamp = 0,
  staringId = null,
  onStare,
  blanks = [],
}: DialogueStageProps) {
  /** 说话者切换时给新说话者一个入场动画窗口（0.22s），超时摘掉 */
  const [enterStamp, setEnterStamp] = useState<{ id: FrogCharacterId; stamp: number } | null>(null);
  /** 眨眼窗口（批次 AY）：blinkStamp 变化 → 播 0.22s → 摘 */
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    if (!activeSpeakerId) return;
    setEnterStamp({ id: activeSpeakerId, stamp: Date.now() });
    const timer = window.setTimeout(() => setEnterStamp(null), ENTER_STAMP_MS);
    return () => window.clearTimeout(timer);
  }, [activeSpeakerId]);

  useEffect(() => {
    if (!blinkStamp) return;
    setBlinking(true);
    const timer = window.setTimeout(() => setBlinking(false), BLINK_MS);
    return () => window.clearTimeout(timer);
  }, [blinkStamp]);

  if (castIds.length === 0) return null;
  const sizes = SIZE_PLANS[castIds.length] ?? SIZE_PLANS[3];

  return (
    <div className="flex w-full items-end justify-center" aria-hidden>
      {castIds.map((id, i) => {
        const isActive = id === activeSpeakerId;
        /* 编目（批次 BS）：被否认/自行降级的蛙——背景不变，位置变成空白 */
        const blank = blanks.find((item) => item.id === id);
        if (blank) {
          return (
            <div
              key={id}
              className={clsx(
                "relative flex flex-col items-center",
                i > 0 && (castIds.length > 3 ? "ml-5" : "ml-16"),
              )}
              aria-label={blank.label ?? (blank.tier === "demoted" ? "该条目自行申请降级" : "非编目")}
            >
              <span
                className={clsx(
                  "absolute -top-9 whitespace-nowrap rounded-full border border-dashed px-3 py-1 text-xs font-bold shadow-sm",
                  blank.tier === "demoted"
                    ? "animate-pulse border-destructive/40 bg-destructive/5 text-destructive"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {blank.label ?? (blank.tier === "demoted" ? "（自行降级）" : "（空白）")}
              </span>
              <div
                className={clsx(
                  "h-40 w-16 rounded-2xl border border-dashed",
                  blank.tier === "demoted"
                    ? "animate-pulse border-destructive/30 bg-muted/20"
                    : "border-border bg-muted/30",
                  "sm:h-56 sm:w-20",
                )}
              />
            </div>
          );
        }
        /* 服装差分（批次 J）：查寝装备只在格格、且只在她说话的那一行出现 */
        const FrogSprite =
          isActive && activeGear && id === "geGe" ? FrogGeGePatrol : FROG_BY_CHARACTER[id];
        if (!FrogSprite) return null;
        const entering = enterStamp?.id === id;
        /* 被注视（批次 AY）：名单在列之后，它开始看屏幕——朝鼠标那边微微转过去 */
        const gazeStyle =
          gaze && isActive
            ? { transform: `translate(${(gaze.x * 7).toFixed(1)}px, ${(gaze.y * 4).toFixed(1)}px)` }
            : undefined;
        return (
          <div
            key={id}
            className={clsx(
              "relative flex flex-col items-center transition-transform duration-500 ease-out",
              i > 0 && (castIds.length > 3 ? "ml-5" : "ml-16"),
              entering && "nw-enter-frog",
            )}
            style={gazeStyle}
            onClick={
              onStare
                ? (clickEvent) => {
                    clickEvent.stopPropagation();
                    onStare(id);
                  }
                : undefined
            }
          >
            <span
              className={clsx(
                "absolute -top-9 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold shadow-sm transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground opacity-100"
                  : "border border-border bg-card text-card-foreground opacity-0",
              )}
            >
              {FROG_CHARACTERS[id].displayName}
            </span>
            <div
              className={clsx(
                "origin-bottom transition-all duration-700 ease-out",
                isActive ? "opacity-100" : "opacity-35",
                /* 高亮放大；真心话段落再补一档轻微放大（同一只 transform，transition 平滑过档） */
                isActive
                  ? heartActive
                    ? "scale-125"
                    : "scale-110"
                  : "scale-95",
                /* 被注视中的蛙（批次 AY）：亮一点——它知道你在看 */
                staringId === id && "brightness-110",
                /* 眨眼（批次 AY）：你点一下，它眨一下 */
                blinking && isActive && "nw-blink",
                /* 沉默的物理空间（批次 AK）：沉默值越高，立绘越模糊——不是消失，是边缘变淡 */
                silenceStage === 1 && "blur-[0.5px] saturate-95",
                silenceStage === 2 && "blur-[1.3px] saturate-75",
                silenceStage === 3 && "blur-[2.6px] saturate-50",
                silenceStage >= 4 && "blur-[4.5px] saturate-30",
              )}
              /* 四档「只剩位置」：透明度一并压下来（内联避免与既有 opacity 类冲突） */
              style={silenceStage >= 4 ? { opacity: isActive ? 0.7 : 0.25 } : undefined}
            >
              <FrogSprite
                size={sizes[i] ?? 140}
                floaty={isActive}
                /* 表情差分（批次 D1）：只给说话蛙应用，非说话蛙维持各自预设默认 */
                expression={isActive ? (speakerExpression ?? undefined) : undefined}
                /* 姿势差分（批次 J）：只给说话蛙应用 */
                pose={isActive ? activePose : "stand"}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
