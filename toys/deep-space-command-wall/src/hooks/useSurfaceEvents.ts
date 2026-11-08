// 天体表面专属事件子 hook（从 useHome 遥测主循环渐进拆出）：
// 月球微陨石雨（LUNA-9）/ 欧罗巴冰裂隙喷发（EUROPA-1）/ 泰坦甲烷浓雾（TTN-1）三套独立状态机,
// 含 HUD 横幅 state、干预脉冲（采样回退 / 钻取中断）、动作锁与成就判定。
// 遥测降额 / 回放录制 / 主视口遮罩仍由 useHome 读返回的 ref 与 state 消费；
// 火星沙尘暴 / 金星酸雾在 useStorm, 金星生存窗口与热管理留在 useHome。
import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { playAlarmBeep, playFogClear, playFogRollIn } from "@/lib/missionAudio";
import {
  EUROPA_FRESH_ICE_COMM,
  EUROPA_SEISMIC_RISE_COMM,
  EUROPA_VENT_ERUPT_COMM,
  MOON_METEOR_CLEAR_COMM,
  MOON_METEOR_HIT_COMM,
  MOON_METEOR_INBOUND_COMM,
  TITAN_FOG_CLEAR_COMM,
  TITAN_FOG_ROLLIN_COMM,
  type CommLine,
} from "@/lib/commScript";
import type { CareerCounters } from "@/lib/dscSave";
import type { MissionDef, MissionId } from "@/lib/missions";

type MeteorPhase = "idle" | "warn" | "active";
type GeyserPhase = "idle" | "seismic" | "erupt" | "freshIce";
type FogPhase = "idle" | "rising" | "peak" | "falling";

type LogLevel = "nominal" | "caution" | "critical";

// ---- 月球微陨石雨（LUNA-9） ----
const METEOR_FIRST_MIN = 24; // 着陆后首场陨石雨最早延迟（秒）
const METEOR_FIRST_SPAN = 30; // 首次延迟随机浮动
const METEOR_NEXT_MIN = 95; // 过境后下一场最早间隔
const METEOR_NEXT_SPAN = 120; // 下一场间隔随机浮动
const METEOR_WARN_S = 8; // 来袭前警报 + HUD 横幅预警时长
const METEOR_ACTIVE_MIN = 15; // 事件持续 15–25s
const METEOR_ACTIVE_SPAN = 11;
const METEOR_ROLL_EVERY = 3; // 近失弹判定间隔（秒）
const METEOR_HIT_CHANCE = 0.35; // 行驶/采样中命中概率（静止状态减半）

// ---- 欧罗巴冰裂隙喷发（EUROPA-1） ----
const GEYSER_FIRST_MIN = 22; // 着陆后首场喷发最早延迟（秒）
const GEYSER_FIRST_SPAN = 26;
const GEYSER_NEXT_MIN = 90; // 结束后下一场最早间隔
const GEYSER_NEXT_SPAN = 120;
const GEYSER_SEISMIC_S = 6; // 地震读数爬升预警时长
const GEYSER_ERUPT_MIN = 12; // 喷发持续 12–18s
const GEYSER_ERUPT_SPAN = 7;
const GEYSER_FRESH_S = 30; // 新鲜冰晶限时高采样窗口
const GEYSER_ROLL_EVERY = 3; // 喷发期采样中断判定间隔（秒）
const GEYSER_INTERRUPT_CHANCE = 0.4; // 采样进行中被中断概率

// ---- 泰坦甲烷浓雾（TTN-1） ----
const FOG_FIRST_MIN = 26; // 着陆后首场浓雾最早延迟（秒）
const FOG_FIRST_SPAN = 28; // 首次延迟随机浮动
const FOG_NEXT_MIN = 100; // 消散后下一场最早间隔
const FOG_NEXT_SPAN = 120; // 下一场间隔随机浮动
const FOG_TOTAL_MIN = 40; // 单场浓雾总时长下限（秒, 含起雾/消散过渡）
const FOG_TOTAL_SPAN = 30; // 总时长随机浮动（40–70s）
const FOG_RISE_S = 8; // 起雾过渡（雾浓度 0→1）
const FOG_FALL_S = 10; // 消散过渡（雾浓度 1→0）
/** 达到该浓度视为「浓雾中」（作业计数 / 遥感遮蔽 / 状态灯）; useHome 样品入册判定也消费 */
export const FOG_FULL_LEVEL = 0.5;

/** advanceSurfaceEvents 每 tick 的调用上下文（全部来自 useHome 主循环, 逐拍传入避免闭包过期） */
export interface SurfaceTickContext {
  /** 任务运行秒（T+ 游戏时钟） */
  t: number;
  mission: MissionDef;
  /** 当前是否已着陆 */
  landed: boolean;
  /** 回放中冻结事件演进 */
  replaying: boolean;
  /** 每日挑战「恶劣天象」倍率（无挑战恒 1） */
  weatherMult: number;
}

export interface UseSurfaceEventsOptions {
  pushLog: (system: string, message: string, level: LogLevel) => void;
  commQueueRef: MutableRefObject<CommLine[]>;
  /** 浓雾作业秒数计入生涯（fogTimeS） */
  careerRef: MutableRefObject<CareerCounters>;
  scheduleSave: () => void;
  unlockAchievement: (id: string) => void;
  /** 陨石命中震屏（震屏通道与硬着陆/危机共用, 留在 useHome） */
  setShaking: (shaking: boolean) => void;
  shakeTimerRef: MutableRefObject<number | null>;
  /** 巡视车动作镜像（机械臂作业 / 行驶中: 陨石命中率与喷发中断判定消费） */
  roverThermalRef: MutableRefObject<{ armActive: boolean; moving: boolean }>;
}

export function useSurfaceEvents(opts: UseSurfaceEventsOptions) {
  // opts 每渲染刷新到 ref：全部回调保持稳定引用（主循环每 tick 消费）
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // ---- View 消费的状态 ----
  const [meteorBanner, setMeteorBanner] = useState<{ phase: "warn" | "active"; remainS: number } | null>(null);
  // 近失命中 1.5s 动作锁（并入 evacLock 强制停车通道）
  const [meteorLockActive, setMeteorLockActive] = useState(false);
  // 命中脉冲计数 → useRover 采样进度扣 30%
  const [armSetbackPulse, setArmSetbackPulse] = useState(0);
  const [cryoVentBanner, setCryoVentBanner] = useState<{ phase: "seismic" | "erupt" | "freshIce"; remainS: number; vents: number } | null>(null);
  // 喷发中断脉冲计数 → useRover 钻取作废 + 样品舱保护锁 3s
  const [interruptPulse, setInterruptPulse] = useState(0);
  // 新鲜冰晶窗口（期间完成的采样必得 S 级报告）
  const [freshIceActive, setFreshIceActive] = useState(false);
  const [fogLevel, setFogLevel] = useState(0);
  const [fogBanner, setFogBanner] = useState<{ phase: "warn" | "active"; remainS: number } | null>(null);
  const [fogActive, setFogActive] = useState(false);

  // ---- 月球微陨石雨状态机（仅 LUNA-9; ref 真值 + HUD 横幅 state 镜像） ----
  const meteorPhaseRef = useRef<MeteorPhase>("idle");
  const meteorStageEndRef = useRef(0);
  const meteorNextRollRef = useRef(0);
  const meteorHitsRef = useRef(0);
  const nextMeteorAtRef = useRef(Number.POSITIVE_INFINITY);
  const meteorLockTimerRef = useRef<number | null>(null);
  // ---- 欧罗巴冰裂隙喷发状态机（仅 EUROPA-1） ----
  const geyserPhaseRef = useRef<GeyserPhase>("idle");
  const geyserStageEndRef = useRef(0);
  const geyserNextRollRef = useRef(0);
  const geyserVentsRef = useRef(1);
  const nextGeyserAtRef = useRef(Number.POSITIVE_INFINITY);
  // ---- 泰坦甲烷浓雾状态机（仅 TTN-1; ref 真值 + HUD 横幅 state 镜像） ----
  const fogPhaseRef = useRef<FogPhase>("idle");
  const fogLevelRef = useRef(0);
  const fogStageEndRef = useRef(0);
  const fogPeakEndRef = useRef(0);
  const nextFogAtRef = useRef(Number.POSITIVE_INFINITY);
  const fogFullRef = useRef(false); // 本场是否达到过满浓度（「雾岸行者」完整经历判定）
  const fogSampledRef = useRef(0); // 本场浓雾中采回的样品件数（>0 且完整经历 → 解锁成就）

  /** 着陆时排程当前天体首场表面事件（随机延迟; 每日挑战「恶劣天象」= 调度间隔减半） */
  const scheduleFirstSurfaceEvents = useCallback((t: number, missionId: MissionId, weatherMult: number) => {
    if (missionId === "luna9") {
      nextMeteorAtRef.current = t + Math.floor((METEOR_FIRST_MIN + Math.random() * METEOR_FIRST_SPAN) / weatherMult);
    } else if (missionId === "europa1") {
      nextGeyserAtRef.current = t + Math.floor((GEYSER_FIRST_MIN + Math.random() * GEYSER_FIRST_SPAN) / weatherMult);
    } else if (missionId === "titan1") {
      nextFogAtRef.current = t + Math.floor((FOG_FIRST_MIN + Math.random() * FOG_FIRST_SPAN) / weatherMult);
    }
  }, []);

  /** 表面作业链「立即排程」: 空闲时下一拍即触发; 返回事件名（进行中/非本天体返回 null, 由调用方判定播报） */
  const surfaceEventSoon = useCallback((missionId: MissionId, t: number): string | null => {
    if (missionId === "luna9" && meteorPhaseRef.current === "idle") {
      nextMeteorAtRef.current = t + 1;
      return "微陨石雨窗口";
    }
    if (missionId === "europa1" && geyserPhaseRef.current === "idle") {
      nextGeyserAtRef.current = t + 1;
      return "冰裂隙喷发窗口";
    }
    if (missionId === "titan1" && fogPhaseRef.current === "idle") {
      nextFogAtRef.current = t + 1;
      return "甲烷浓雾过境";
    }
    return null;
  }, []);

  /** 切任务全量复位（三套状态机 + 横幅 + 干预锁 + 本场计数全部归零） */
  const resetSurfaceEvents = useCallback(() => {
    meteorPhaseRef.current = "idle";
    meteorStageEndRef.current = 0;
    meteorNextRollRef.current = 0;
    meteorHitsRef.current = 0;
    nextMeteorAtRef.current = Number.POSITIVE_INFINITY;
    if (meteorLockTimerRef.current !== null) {
      window.clearTimeout(meteorLockTimerRef.current);
      meteorLockTimerRef.current = null;
    }
    setMeteorBanner(null);
    setMeteorLockActive(false);
    geyserPhaseRef.current = "idle";
    geyserStageEndRef.current = 0;
    geyserNextRollRef.current = 0;
    geyserVentsRef.current = 1;
    nextGeyserAtRef.current = Number.POSITIVE_INFINITY;
    setCryoVentBanner(null);
    setFreshIceActive(false);
    fogPhaseRef.current = "idle";
    fogLevelRef.current = 0;
    fogStageEndRef.current = 0;
    fogPeakEndRef.current = 0;
    nextFogAtRef.current = Number.POSITIVE_INFINITY;
    fogFullRef.current = false;
    fogSampledRef.current = 0;
    setFogLevel(0);
    setFogBanner(null);
    setFogActive(false);
  }, []);

  /** 表面事件状态机（三选一按 mission.id 生效; 回放中冻结）——主循环每 tick 调用一次 */
  const advanceSurfaceEvents = useCallback((ctx: SurfaceTickContext) => {
    const { t, mission: m, weatherMult } = ctx;
    const o = optsRef.current;
    const { pushLog, commQueueRef, unlockAchievement } = o;
    if (!ctx.landed || ctx.replaying) return;

    // ---- 月球微陨石雨（增强 E; 仅 LUNA-9, 独立调度器, 不进 pendingGlobal） ----
    if (m.id === "luna9") {
      if (meteorPhaseRef.current === "idle") {
        if (t >= nextMeteorAtRef.current) {
          // 前兆: 来袭前 8s 警报讯 + HUD 横幅（对齐既有风暴预警通道）
          meteorPhaseRef.current = "warn";
          meteorStageEndRef.current = t + METEOR_WARN_S;
          meteorHitsRef.current = 0;
          setMeteorBanner({ phase: "warn", remainS: METEOR_WARN_S });
          commQueueRef.current.push(...MOON_METEOR_INBOUND_COMM);
          pushLog("METEOR", "微陨石雨来袭警报——8 秒后进入撞击窗口, 巡视车规避机动准备（静止状态可降低命中率）", "caution");
          playAlarmBeep("caution");
        }
      } else if (meteorPhaseRef.current === "warn") {
        const remain = meteorStageEndRef.current - t;
        if (remain <= 0) {
          const dur = METEOR_ACTIVE_MIN + Math.floor(Math.random() * METEOR_ACTIVE_SPAN);
          meteorPhaseRef.current = "active";
          meteorStageEndRef.current = t + dur;
          meteorNextRollRef.current = t + METEOR_ROLL_EVERY;
          setMeteorBanner({ phase: "active", remainS: dur });
          pushLog("METEOR", `微陨石雨进入撞击窗口——预计持续 ${dur} 秒, 巡视车附近持续监测到近失撞击信号`, "caution");
        } else {
          setMeteorBanner({ phase: "warn", remainS: remain });
        }
      } else {
        const remain = meteorStageEndRef.current - t;
        // 近失弹判定: 每 3s 掷一次——行驶/采样中 35% 命中, 静止状态命中率减半
        if (t >= meteorNextRollRef.current) {
          meteorNextRollRef.current = t + METEOR_ROLL_EVERY;
          const busy = o.roverThermalRef.current.moving || o.roverThermalRef.current.armActive;
          const chance = busy ? METEOR_HIT_CHANCE : METEOR_HIT_CHANCE / 2;
          if (Math.random() < chance) {
            meteorHitsRef.current += 1;
            // 命中: 采样进度扣 30%（脉冲下发 useRover）+ 1.5s 动作锁（并入 evacLock 通道）+ 震屏 + 播报
            setArmSetbackPulse((v) => v + 1);
            setMeteorLockActive(true);
            if (meteorLockTimerRef.current !== null) window.clearTimeout(meteorLockTimerRef.current);
            meteorLockTimerRef.current = window.setTimeout(() => {
              setMeteorLockActive(false);
              meteorLockTimerRef.current = null;
            }, 1500);
            o.setShaking(true);
            if (o.shakeTimerRef.current !== null) window.clearTimeout(o.shakeTimerRef.current);
            o.shakeTimerRef.current = window.setTimeout(() => o.setShaking(false), 650);
            commQueueRef.current.push(...MOON_METEOR_HIT_COMM);
            pushLog("METEOR", `微陨石近失命中巡视车（本场第 ${meteorHitsRef.current} 次）——机动短暂锁定 1.5 秒, 采样进度受损`, "critical");
          }
        }
        if (remain <= 0) {
          // 事件结束: 重排下一场（恶劣天象修饰间隔减半）+ 解除播报 + 「陨石雨行者」零命中判定
          meteorPhaseRef.current = "idle";
          nextMeteorAtRef.current = t + Math.floor((METEOR_NEXT_MIN + Math.random() * METEOR_NEXT_SPAN) / weatherMult);
          setMeteorBanner(null);
          commQueueRef.current.push(...MOON_METEOR_CLEAR_COMM);
          pushLog("METEOR", `微陨石雨过境, 月面环境恢复平静（本场累计命中 ${meteorHitsRef.current} 次）`, "nominal");
          if (meteorHitsRef.current === 0) unlockAchievement("moon_meteor_walker");
        } else {
          setMeteorBanner({ phase: "active", remainS: remain });
        }
      }
    }

    // ---- 欧罗巴冰裂隙喷发（增强 F; 仅 EUROPA-1, 地震预警 → 喷发 → 新鲜冰晶正反馈窗口） ----
    if (m.id === "europa1") {
      if (geyserPhaseRef.current === "idle") {
        if (t >= nextGeyserAtRef.current) {
          geyserPhaseRef.current = "seismic";
          geyserStageEndRef.current = t + GEYSER_SEISMIC_S;
          geyserVentsRef.current = Math.random() < 0.5 ? 1 : 2; // 随机 1–2 个喷发点
          setCryoVentBanner({ phase: "seismic", remainS: GEYSER_SEISMIC_S, vents: geyserVentsRef.current });
          commQueueRef.current.push(...EUROPA_SEISMIC_RISE_COMM);
          pushLog("CRYO", "冰震读数快速爬升——冰裂隙喷发在即, 钻取作业随时可能被打断", "caution");
          playAlarmBeep("caution");
        }
      } else if (geyserPhaseRef.current === "seismic") {
        const remain = geyserStageEndRef.current - t;
        if (remain <= 0) {
          const dur = GEYSER_ERUPT_MIN + Math.floor(Math.random() * GEYSER_ERUPT_SPAN);
          geyserPhaseRef.current = "erupt";
          geyserStageEndRef.current = t + dur;
          geyserNextRollRef.current = t + GEYSER_ROLL_EVERY;
          setCryoVentBanner({ phase: "erupt", remainS: dur, vents: geyserVentsRef.current });
          commQueueRef.current.push(...EUROPA_VENT_ERUPT_COMM);
          pushLog("CRYO", `冰裂隙喷发! ${geyserVentsRef.current} 个喷发点羽流冲天, 预计持续 ${dur} 秒——喷发结束后新鲜冰晶是最高价值采样窗口`, "caution");
        } else {
          setCryoVentBanner({ phase: "seismic", remainS: remain, vents: geyserVentsRef.current });
        }
      } else if (geyserPhaseRef.current === "erupt") {
        const remain = geyserStageEndRef.current - t;
        // 喷发期间中断判定: 每 3s 掷一次, 采样进行中 40% 概率中断钻取 + 样品舱保护锁 3s
        if (t >= geyserNextRollRef.current) {
          geyserNextRollRef.current = t + GEYSER_ROLL_EVERY;
          if (o.roverThermalRef.current.armActive && Math.random() < GEYSER_INTERRUPT_CHANCE) {
            setInterruptPulse((v) => v + 1);
            pushLog("CRYO", "喷发震波袭扰车体——钻取中断, 样品舱进入 3 秒保护锁定", "caution");
          }
        }
        if (remain <= 0) {
          // 正反馈: 喷发转入新鲜冰晶窗口——期间完成的采样必得 S 级（走既有样品分级通道）
          geyserPhaseRef.current = "freshIce";
          geyserStageEndRef.current = t + GEYSER_FRESH_S;
          setFreshIceActive(true);
          setCryoVentBanner({ phase: "freshIce", remainS: GEYSER_FRESH_S, vents: geyserVentsRef.current });
          commQueueRef.current.push(...EUROPA_FRESH_ICE_COMM);
          pushLog("CRYO", `新鲜冰晶窗口开启（${GEYSER_FRESH_S} 秒）——窗口内完成的采样必得 S 级科学评级`, "nominal");
        } else {
          setCryoVentBanner({ phase: "erupt", remainS: remain, vents: geyserVentsRef.current });
        }
      } else {
        const remain = geyserStageEndRef.current - t;
        if (remain <= 0) {
          geyserPhaseRef.current = "idle";
          nextGeyserAtRef.current = t + Math.floor((GEYSER_NEXT_MIN + Math.random() * GEYSER_NEXT_SPAN) / weatherMult);
          setFreshIceActive(false);
          setCryoVentBanner(null);
          pushLog("CRYO", "新鲜冰晶窗口关闭, 冰面升华回归本底——等待下一次冰震活动", "nominal");
        } else {
          setCryoVentBanner({ phase: "freshIce", remainS: remain, vents: geyserVentsRef.current });
        }
      }
    }

    // ---- 泰坦甲烷浓雾（增强 I; 仅 TTN-1, 起雾 → 满雾 → 消散三段过渡, 不进 pendingGlobal） ----
    if (m.id === "titan1") {
      if (fogPhaseRef.current === "idle") {
        if (t >= nextFogAtRef.current) {
          const total = FOG_TOTAL_MIN + Math.floor(Math.random() * FOG_TOTAL_SPAN);
          fogPhaseRef.current = "rising";
          fogStageEndRef.current = t + FOG_RISE_S;
          // 满雾相位终点 = 起雾时刻 + 总时长 - 消散过渡（保底 8s 满雾作业窗口）
          fogPeakEndRef.current = t + Math.max(FOG_RISE_S + 8, total - FOG_FALL_S);
          fogFullRef.current = false;
          fogSampledRef.current = 0;
          setFogBanner({ phase: "warn", remainS: fogPeakEndRef.current + FOG_FALL_S - t });
          commQueueRef.current.push(...TITAN_FOG_ROLLIN_COMM);
          pushLog("MET", `甲烷浓雾逼近——低层大气温湿度骤升, 预计 ${total} 秒内雾情过境, 光学遥感即将失效`, "caution");
          playAlarmBeep("caution");
          playFogRollIn();
        }
      } else if (fogPhaseRef.current === "rising") {
        fogLevelRef.current = Math.min(1, fogLevelRef.current + 1 / FOG_RISE_S);
        if (t >= fogStageEndRef.current) {
          fogPhaseRef.current = "peak";
          fogLevelRef.current = 1;
          fogFullRef.current = true;
          setFogBanner({ phase: "active", remainS: Math.max(0, fogPeakEndRef.current + FOG_FALL_S - t) });
          pushLog("MET", "浓雾笼罩着陆区——能见度不足百米, 巡视车转雷达导航, 雾中采样点遥感预测失效", "caution");
        } else {
          setFogBanner({ phase: "warn", remainS: Math.max(0, fogPeakEndRef.current + FOG_FALL_S - t) });
        }
      } else if (fogPhaseRef.current === "peak") {
        if (t >= fogPeakEndRef.current) {
          fogPhaseRef.current = "falling";
          fogStageEndRef.current = t + FOG_FALL_S;
          setFogBanner({ phase: "active", remainS: FOG_FALL_S });
        } else {
          setFogBanner({ phase: "active", remainS: Math.max(0, fogPeakEndRef.current + FOG_FALL_S - t) });
        }
      } else {
        fogLevelRef.current = Math.max(0, fogLevelRef.current - 1 / FOG_FALL_S);
        const remain = fogStageEndRef.current - t;
        if (remain <= 0) {
          // 雾情过境: 重排下一场（恶劣天象修饰间隔减半）+ 解除播报 + 「雾岸行者」判定
          fogPhaseRef.current = "idle";
          fogLevelRef.current = 0;
          nextFogAtRef.current = t + Math.floor((FOG_NEXT_MIN + Math.random() * FOG_NEXT_SPAN) / weatherMult);
          setFogLevel(0);
          setFogActive(false);
          setFogBanner(null);
          commQueueRef.current.push(...TITAN_FOG_CLEAR_COMM);
          pushLog("MET", `甲烷浓雾消散, 能见度回升到公里级（本场雾中采回样品 ${fogSampledRef.current} 件）`, "nominal");
          playFogClear();
          if (fogFullRef.current && fogSampledRef.current > 0) unlockAchievement("titan_fog_walker");
          o.scheduleSave(); // 雾中作业秒数随雾情结束落盘（避免逐秒写档）
        } else {
          setFogBanner({ phase: "active", remainS: remain });
        }
      }
      // 雾浓度镜像到 state（主视口遮罩 / 雷达 / 巡视车画面消费）+ 浓雾作业秒数计入生涯
      if (fogPhaseRef.current !== "idle") {
        setFogLevel(fogLevelRef.current);
        setFogActive(fogLevelRef.current >= FOG_FULL_LEVEL);
        if (fogLevelRef.current >= FOG_FULL_LEVEL) {
          o.careerRef.current.fogTimeS += 1;
        }
      }
    }
  }, []);

  return {
    meteorBanner,
    meteorLockActive,
    armSetbackPulse,
    cryoVentBanner,
    interruptPulse,
    freshIceActive,
    fogLevel,
    fogBanner,
    fogActive,
    meteorPhaseRef,
    meteorStageEndRef,
    meteorNextRollRef,
    meteorHitsRef,
    nextMeteorAtRef,
    meteorLockTimerRef,
    geyserPhaseRef,
    geyserStageEndRef,
    geyserNextRollRef,
    geyserVentsRef,
    nextGeyserAtRef,
    fogPhaseRef,
    fogLevelRef,
    fogStageEndRef,
    fogPeakEndRef,
    nextFogAtRef,
    fogFullRef,
    fogSampledRef,
    advanceSurfaceEvents,
    scheduleFirstSurfaceEvents,
    surfaceEventSoon,
    resetSurfaceEvents,
  };
}
