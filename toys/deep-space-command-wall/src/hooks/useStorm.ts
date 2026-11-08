// 火星沙尘暴 / 金星酸雾天气系统子 hook（从 useHome 渐进拆出）：
// 区域级风暴 30–45s 全生命周期（rising/peak/falling/clearing 相位 + 尘土强度平滑）、
// 全球级升级路径（过境后 25% 卷土重来 / 进行到一半 35% 就地升级）、生存倒计时与倒计时音、
// 电力亏损累计、风暴见证成就计数。遥测降额 / 警报调度 / 状态灯仍由 useHome 读返回的 ref 与 state 消费。
import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { playAlarmBeep, playStormClearingChime, playStormCountdownTick } from "@/lib/missionAudio";
import type { CommLine } from "@/lib/commScript";
import type { MissionDef } from "@/lib/missions";

type StormPhase = "idle" | "rising" | "peak" | "falling" | "clearing";

const STORM_MIN_S = 30; // 沙尘暴持续下限（秒）
const STORM_SPAN_S = 15; // 持续随机浮动（30–45s）
const STORM_FIRST_MIN = 20; // 着陆后首次沙尘暴最早延迟（秒）
const STORM_FIRST_SPAN = 26; // 首次延迟随机浮动
const STORM_NEXT_MIN = 90; // 过境后下一场最早间隔
const STORM_NEXT_SPAN = 121; // 下一场间隔随机浮动
const STORM_ODO_THRESHOLD = 200; // 里程达阈值后每 tick 追加触发概率
const STORM_ODO_CHANCE = 0.03;

const STORM_GLOBAL_MIN_S = 90; // 全球级持续下限（秒）
const STORM_GLOBAL_SPAN_S = 60; // 全球级持续随机浮动（90–150s）
const STORM_RELAY_CHANCE = 0.25; // 区域风暴过境后升级卷土重来的概率
const STORM_RELAY_MIN = 10; // 卷土重来最早延迟（秒）
const STORM_RELAY_SPAN = 10; // 卷土重来延迟随机浮动
const STORM_MIDUPGRADE_CHANCE = 0.35; // 区域风暴进行到一半就地升级的概率
const STORM_POWER_DRAIN_CAP = 16; // 全球风暴期间电力累计亏损上限（百分点）

type LogLevel = "nominal" | "caution" | "critical";

function globalStormStartComm(m: MissionDef): CommLine[] {
  return [
    {
      speaker: m.comm.speakers.bj,
      text: `紧急通告：全球性沙尘暴警报！尘暴已蔓延至整个半球，所有火面活动立即暂停，${m.rover.roverName}进入风暴生存模式——重复，进入风暴生存模式。`,
    },
    {
      speaker: m.comm.speakers.cdre,
      text: `${m.rover.roverName}收到全球风暴警报，已就地停车锚定，机械臂收回，桅杆相机调至避尘位，电池转入生存供电，我们静待风暴过境。`,
    },
  ];
}

function globalStormEndComm(m: MissionDef): CommLine[] {
  return [
    {
      speaker: m.comm.speakers.bj,
      text: `北京通报：全球性沙尘暴主体已过境，轨道成像显示尘带整体东移消散，火面光照持续回升——祝贺你们挺过了这场末日风暴。`,
    },
    {
      speaker: m.comm.speakers.cdre,
      text: `${m.rover.roverName}确认天空逐渐放晴，太阳能翼输出爬升，各系统自检正常，请求解除风暴生存模式，恢复巡视作业。`,
    },
  ];
}

function stormStartComm(m: MissionDef): CommLine[] {
  return [
    {
      speaker: m.comm.speakers.cdre,
      text: `北京，${m.rover.roverName}报告：地平线出现大范围尘幕，沙尘暴正在逼近着陆区，光学导航受限，请求转入沙尘暴应对预案。`,
    },
    {
      speaker: m.comm.speakers.bj,
      text: `北京收到。气象团队确认为区域级沙尘暴过程，光照度将骤降。暂停长距离巡视，注意电池电量与车体热控状态，我们陪你一起等风停。`,
    },
  ];
}

function stormEndComm(m: MissionDef): CommLine[] {
  return [
    {
      speaker: m.comm.speakers.bj,
      text: `北京通报：沙尘暴主体已过境着陆区，天空透明度回升，光照恢复，太阳能翼输出正常攀升。`,
    },
    {
      speaker: m.comm.speakers.cdre,
      text: `${m.rover.roverName}确认光照恢复，车体温度回升中，各系统状态良好，请求恢复巡视作业。`,
    },
  ];
}

/** 金星酸雾锋面袭来（VNS-1 复用区域风暴机制, 文案走硫酸气溶胶语境） */
function acidHazeStartComm(m: MissionDef): CommLine[] {
  return [
    {
      speaker: m.comm.speakers.cdre,
      text: `北京，${m.rover.roverName}报告：地平线涌来赭黄色浓雾，酸雾锋面正逼近着陆区，硫酸气溶胶浓度快速攀升，请求转入酸雾应对预案。`,
    },
    {
      speaker: m.comm.speakers.bj,
      text: `北京收到。中继星确认为区域级酸雾过程，能见度将显著下降。暂停长距离巡视，盯紧耐蚀壳层与热控裕度，我们陪你一起等雾散。`,
    },
  ];
}

/** 金星酸雾锋面过境放晴（不升级全球级, 无卷土重来路径） */
function acidHazeEndComm(m: MissionDef): CommLine[] {
  return [
    {
      speaker: m.comm.speakers.bj,
      text: `北京通报：酸雾锋面已过境着陆区，气溶胶光学深度回落，能见度恢复，中继链路速率回升。`,
    },
    {
      speaker: m.comm.speakers.cdre,
      text: `${m.rover.roverName}确认视野转清，耐蚀壳层自检正常，各系统状态良好，请求恢复巡视作业——倒计时还在走，抓紧。`,
    },
  ];
}

/** advanceStorm 每 tick 的调用上下文（全部来自 useHome 主循环, 逐拍传入避免闭包过期） */
export interface StormTickContext {
  /** 任务运行秒（T+ 游戏时钟） */
  t: number;
  mission: MissionDef;
  /** 当前是否已着陆 */
  landed: boolean;
  /** 回放中冻结天气演进 */
  replaying: boolean;
  /** 巡视车累计里程（≥200m 后每 tick 追加触发概率） */
  roverOdo: number;
  /** 每日挑战「恶劣天象」倍率（无挑战恒 1） */
  weatherMult: number;
  pushLog: (system: string, message: string, level: LogLevel) => void;
  commQueueRef: MutableRefObject<CommLine[]>;
  unlockAchievement: (id: string) => void;
}

export function useStorm() {
  // ---- View 消费的状态 ----
  // 火星沙尘暴（ARES-1 着陆后）：进行中标志 + 强度 0..1（渐变）
  const [dustStormActive, setDustStormActive] = useState(false);
  const [dustIntensity, setDustIntensity] = useState(0);
  // 全球级沙尘暴（区域风暴的升级路径）：CRITICAL 灯 / 巡视车强制停车 / 电力亏损
  const [globalStormActive, setGlobalStormActive] = useState(false);
  // 全球风暴生存倒计时: 距风暴过境的剩余整秒（非全球风暴为 null; 回放不显示）
  const [globalStormRemainS, setGlobalStormRemainS] = useState<number | null>(null);
  // 风暴过境放晴过渡（尘土强度衰减中, 主视口显示放晴横幅; 回放不显示）
  const [stormClearing, setStormClearing] = useState(false);

  // ---- tick / 遥测降额 / 警报调度共享的 ref ----
  const stormPhaseRef = useRef<StormPhase>("idle");
  const stormDurRef = useRef(0);
  const stormElapsedRef = useRef(0);
  const stormFullRef = useRef(false);
  // 会话级完整风暴过境计数（区域级+全球级都算, 跨任务不清空; ≥3 解锁 storm_chaser 彩蛋）
  const stormSeenRef = useRef(0);
  const dustIntensityRef = useRef(0);
  const dustStormActiveRef = useRef(false);
  const nextStormAtRef = useRef(Number.POSITIVE_INFINITY);
  // 全球级风暴状态（ref 供 tick / 遥测降额 / 警报调度读取）
  const globalStormRef = useRef(false);
  const pendingGlobalRef = useRef(false); // 区域风暴过境后已排定的全球级卷土重来
  const midRollRef = useRef(false); // 本场区域风暴是否已掷过就地升级判定
  const stormPowerDrainRef = useRef(0); // 全球风暴期间电力累计亏损

  /** 着陆时排程首场风暴 / 酸雾（随机延迟; 每日挑战「恶劣天象」= 调度间隔减半） */
  const scheduleFirstStorm = useCallback((t: number, weatherMult: number) => {
    nextStormAtRef.current = t + Math.floor((STORM_FIRST_MIN + Math.random() * STORM_FIRST_SPAN) / weatherMult);
  }, []);

  /** 表面作业链「立即排程」: 下一拍即触发（进行中不响应, 由调用方判定） */
  const triggerStormSoon = useCallback((t: number) => {
    nextStormAtRef.current = t + 1;
  }, []);

  /** 切任务全量复位（含全球级升级路径; stormSeenRef 会话级计数不清空） */
  const resetStorm = useCallback(() => {
    stormPhaseRef.current = "idle";
    stormDurRef.current = 0;
    stormElapsedRef.current = 0;
    stormFullRef.current = false;
    dustIntensityRef.current = 0;
    dustStormActiveRef.current = false;
    globalStormRef.current = false;
    pendingGlobalRef.current = false;
    midRollRef.current = false;
    stormPowerDrainRef.current = 0;
    nextStormAtRef.current = Number.POSITIVE_INFINITY;
    setDustIntensity(0);
    setDustStormActive(false);
    setGlobalStormActive(false);
    setGlobalStormRemainS(null);
    setStormClearing(false);
  }, []);

  /** 沙尘暴 / 酸雾状态机（ARES-1 或 VNS-1 着陆后; 回放中冻结; 区域级 30–45s;
   *  金星酸雾复用同一状态机, 但不走全球级升级路径）——主循环每 tick 调用一次 */
  const advanceStorm = useCallback((ctx: StormTickContext) => {
    const { t, mission: m, roverOdo, weatherMult, pushLog, commQueueRef, unlockAchievement } = ctx;
    if (!((m.id === "ares1" || m.id === "venus1") && ctx.landed && !ctx.replaying)) return;
    if (stormPhaseRef.current === "idle") {
      // 每日挑战「恶劣天象」: 里程触发概率翻倍
      const odoBoost = roverOdo >= STORM_ODO_THRESHOLD ? STORM_ODO_CHANCE * weatherMult : 0;
      if (t >= nextStormAtRef.current || Math.random() < odoBoost) {
        const asGlobal = pendingGlobalRef.current;
        pendingGlobalRef.current = false;
        stormPhaseRef.current = "rising";
        stormDurRef.current = asGlobal
          ? STORM_GLOBAL_MIN_S + Math.random() * STORM_GLOBAL_SPAN_S
          : STORM_MIN_S + Math.random() * STORM_SPAN_S;
        stormElapsedRef.current = 0;
        stormFullRef.current = false;
        midRollRef.current = false;
        dustStormActiveRef.current = true;
        setDustStormActive(true);
        if (asGlobal) {
          globalStormRef.current = true;
          setGlobalStormActive(true);
          setGlobalStormRemainS(Math.ceil(stormDurRef.current));
          pushLog("WEATHER", "全球性沙尘暴警报, 所有火面活动暂停, 祝融号进入风暴生存模式", "critical");
          commQueueRef.current = [...globalStormStartComm(m)];
          playAlarmBeep("critical");
        } else if (m.id === "venus1") {
          pushLog("WEATHER", "酸雾锋面逼近着陆区, 硫酸气溶胶光学深度攀升, 能见度受限, 金面作业转入酸雾应对预案", "caution");
          commQueueRef.current = [...acidHazeStartComm(m)];
        } else {
          pushLog("WEATHER", "沙尘暴逼近, 光学导航受限, 光照度骤降, 火面作业转入沙尘暴应对预案", "caution");
          commQueueRef.current = [...stormStartComm(m)];
        }
      }
    } else if (stormPhaseRef.current === "clearing") {
      // 放晴过渡: 尘土强度按秒指数衰减, 天空遮罩与尘土粒子随之逐渐消散, 归零回 idle
      dustIntensityRef.current *= 0.6;
      if (dustIntensityRef.current <= 0.02) {
        dustIntensityRef.current = 0;
        stormPhaseRef.current = "idle";
        setStormClearing(false);
      }
      setDustIntensity(dustIntensityRef.current);
    } else {
      stormElapsedRef.current += 1;
      const el = stormElapsedRef.current;
      // 区域风暴进行到一半: 掷一次就地升级判定, 命中则发展为全球级沙尘暴（金星酸雾不升级）
      if (m.id !== "venus1" && !globalStormRef.current && !midRollRef.current && el >= stormDurRef.current * 0.5) {
        midRollRef.current = true;
        if (Math.random() < STORM_MIDUPGRADE_CHANCE) {
          globalStormRef.current = true;
          setGlobalStormActive(true);
          stormDurRef.current = el + STORM_GLOBAL_MIN_S * 0.8 + Math.random() * STORM_GLOBAL_SPAN_S * 0.6;
          setGlobalStormRemainS(Math.max(0, Math.ceil(stormDurRef.current - el)));
          pushLog("WEATHER", "风暴强度骤增, 已发展为全球性沙尘暴, 所有火面活动暂停", "critical");
          commQueueRef.current = [...globalStormStartComm(m)];
          playAlarmBeep("critical");
        }
      }
      const dur = stormDurRef.current;
      const riseEnd = globalStormRef.current ? dur * 0.12 : dur * 0.2;
      const fallStart = globalStormRef.current ? dur * 0.88 : dur * 0.8;
      let target = 1;
      if (el < riseEnd) {
        target = el / riseEnd;
        stormPhaseRef.current = "rising";
      } else if (el >= fallStart) {
        target = Math.max(0, (dur - el) / Math.max(1, dur - fallStart));
        stormPhaseRef.current = "falling";
      } else {
        stormPhaseRef.current = "peak";
      }
      if (target >= 0.98) stormFullRef.current = true;
      dustIntensityRef.current += (target - dustIntensityRef.current) * (globalStormRef.current ? 0.55 : 0.4);
      // 全球风暴期间电力进入亏损: 累计掉电随时间加深（有上限）
      if (globalStormRef.current) {
        stormPowerDrainRef.current = Math.min(STORM_POWER_DRAIN_CAP, stormPowerDrainRef.current + 0.22);
      }
      if (el >= dur) {
        const wasGlobal = globalStormRef.current;
        // 放晴过渡: 强度不再瞬间清零, 转入 clearing 相位按秒衰减（天空/尘土粒子逐渐消散）
        stormPhaseRef.current = "clearing";
        setStormClearing(true);
        playStormClearingChime();
        dustStormActiveRef.current = false;
        setDustStormActive(false);
        globalStormRef.current = false;
        setGlobalStormActive(false);
        setGlobalStormRemainS(null);
        stormPowerDrainRef.current = 0;
        if (wasGlobal) {
          pushLog("WEATHER", "全球风暴过境, 火星天空逐渐放晴, 光照与下行链路缓慢恢复", "nominal");
          commQueueRef.current = [...globalStormEndComm(m)];
          if (stormFullRef.current) {
            stormSeenRef.current += 1;
            unlockAchievement("apocalypse");
            if (stormSeenRef.current >= 3) unlockAchievement("storm_chaser");
          }
          nextStormAtRef.current = t + Math.floor((STORM_NEXT_MIN + Math.random() * STORM_NEXT_SPAN) / weatherMult);
        } else if (m.id === "venus1") {
          // 金星酸雾锋面过境: 不进全球级卷土重来路径（pendingGlobal 恒 false）
          pushLog("WEATHER", "酸雾锋面过境, 气溶胶光学深度回落, 能见度与下行链路速率恢复", "nominal");
          commQueueRef.current = [...acidHazeEndComm(m)];
          nextStormAtRef.current = t + Math.floor((STORM_NEXT_MIN + Math.random() * STORM_NEXT_SPAN) / weatherMult);
        } else {
          pushLog("WEATHER", "沙尘暴过境, 光照恢复, 太阳能翼恢复供电, 下行链路速率回升", "nominal");
          commQueueRef.current = [...stormEndComm(m)];
          if (stormFullRef.current) {
            stormSeenRef.current += 1;
            unlockAchievement("dust_storm");
            if (stormSeenRef.current >= 3) unlockAchievement("storm_chaser");
          }
          if (Math.random() < STORM_RELAY_CHANCE) {
            // 25% 概率: 尘带未消散, 10–20s 内以全球级风暴卷土重来
            pendingGlobalRef.current = true;
            nextStormAtRef.current = t + STORM_RELAY_MIN + Math.floor(Math.random() * STORM_RELAY_SPAN);
            pushLog("WEATHER", "轨道气象卫星警示: 尘带未消散反而扩大增强, 短时内可能发展为全球性沙尘暴", "caution");
          } else {
            nextStormAtRef.current = t + Math.floor((STORM_NEXT_MIN + Math.random() * STORM_NEXT_SPAN) / weatherMult);
          }
        }
      } else {
        setDustIntensity(dustIntensityRef.current);
        // 全球风暴生存倒计时: 每 tick 刷新剩余整秒（区域级风暴不显示）
        if (globalStormRef.current) {
          const remain = Math.max(0, Math.ceil(dur - el));
          setGlobalStormRemainS(remain);
          // 最后 10 秒倒计时警报音: 每秒一声短哔, ≤3s 变高急促（静音开关由音频层统一管控）
          if (remain > 0 && remain <= 10) playStormCountdownTick(remain);
        }
      }
    }
  }, []);

  return {
    dustStormActive,
    dustIntensity,
    globalStormActive,
    globalStormRemainS,
    stormClearing,
    stormPhaseRef,
    stormFullRef,
    dustIntensityRef,
    dustStormActiveRef,
    globalStormRef,
    nextStormAtRef,
    stormPowerDrainRef,
    stormSeenRef,
    advanceStorm,
    scheduleFirstStorm,
    triggerStormSoon,
    resetStorm,
  };
}
