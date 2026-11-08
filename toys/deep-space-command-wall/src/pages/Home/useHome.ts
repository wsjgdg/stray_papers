import { useCallback, useEffect, useRef, useState } from "react";
import {
  armAudioGesture,
  pauseAmbient,
  playAckConfirm,
  playAlarmBeep,
  playAuroraChime,
  playCoverClick,
  playLaunchRoar,
  playLowBattChime,
  playMuteBye,
  playStormCountdownTick,
  playTouchdownChime,
  playWarpJump,
  resumeAmbient,
  setAmbientEnabled,
  setAmbientVolume,
  setAudioMuted,
  startAmbient,
  startPhaseMusic,
  stopAlarmBeep,
  stopAmbient,
  stopPhaseMusic,
  type MusicPhase,
  type AmbientKind,
} from "@/lib/missionAudio";
import {
  VNS_1_COOLING_COMM,
  VNS_1_EVAC_COMM,
  VNS_1_THERMAL_COMM,
  VNS_1_THERMAL_RECOVER_COMM,
  type CommLine,
} from "@/lib/commScript";
import {
  buildJsonArchive,
  buildTxtArchive,
  downloadArchive,
  type ArchiveAlarmRecord,
  type ArchivePhaseMark,
} from "@/lib/exportArchive";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_TOTAL,
} from "@/lib/achievements";
import { CRISIS_EVENTS, type CrisisEvent } from "@/lib/crisisEvents";
import type { LandingGrade } from "@/components/home/ManualLanding";
import type { DebriefData } from "@/components/home/MissionDebrief";
import { GLOBAL_DUTY_BOARD } from "@/lib/dutyBoard";
import type { DutyTaskView } from "@/components/home/DutyBoard";
import { rollQuiz, type QuizQuestion } from "@/components/home/QuizCard";
import {
  LUNA_9,
  MISSIONS,
  MISSION_ORDER,
  PHASE_INDEX,
  craterNameAt,
  phaseAtFlightSec,
  phaseStartSec,
  type MetricDef,
  type MissionDef,
  type MissionId,
  type PhaseId,
} from "@/lib/missions";
import { useRover, type RoverSample } from "@/pages/Home/useRover";
import type { SampleReport } from "@/lib/sampleAnalysis";
import {
  clearDscSave,
  defaultAudioPrefs,
  defaultCareer,
  type CareerCounters,
  type RallyBests,
} from "@/lib/dscSave";
import { useSaveState } from "@/hooks/useSaveState";
import { useAchievements } from "@/hooks/useAchievements";
import { useReplay } from "@/hooks/useReplay";
import { useDailyChallenge } from "@/hooks/useDailyChallenge";
import { useCareer } from "@/hooks/useCareer";
import { useStorm } from "@/hooks/useStorm";
import { FOG_FULL_LEVEL, useSurfaceEvents } from "@/hooks/useSurfaceEvents";
import { loadPerfTier, nextPerfTier, savePerfTier, setActivePerf, type PerfTier } from "@/lib/perfTier";
import { dailyDateKey } from "@/lib/dailySeed";

export type MissionLevel = "nominal" | "caution" | "critical";

export type { MissionId, PhaseId, MissionDef };

export interface TelemetryMetric {
  key: string;
  label: string;
  labelEn: string;
  unit: string;
  value: number;
  display: string;
  decimals: number;
  series: number[];
}

export interface LogEntry {
  id: number;
  stamp: string;
  system: string;
  message: string;
  level: MissionLevel;
}

export interface GroundStation {
  stationKey: string;
  stationName: string;
  code: string;
  online: boolean;
  linkRate: number;
}

export interface AlarmState {
  metricKey: string;
  level: Exclude<MissionLevel, "nominal">;
  message: string;
}

export interface CommSubtitleState {
  id: number;
  speaker: string;
  text: string;
}

/** 已解锁成就记录类型（实现拆至 useAchievements 子 hook, 此处 re-export 保持既有导入方兼容） */
export type { UnlockedAchievement } from "@/hooks/useAchievements";

/** 值班指令任务（限时完成赚功勋值升军衔） */
interface DutyTaskState extends DutyTaskView {
  kind: string;
  baseline: number;
  deadline: number;
}

/** 全球风暴生存倒计时: 剩余秒数 → MM:SS（主视口横幅与巡视车面板共用） */
export function formatStormRemain(secs: number): string {
  const mm = Math.floor(Math.max(0, secs) / 60);
  const ss = Math.max(0, secs) % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** 样品博物馆陈列厅登记条目（跨任务内存态, 任务切换不清空） */
export interface MuseumSampleEntry {
  /** 唯一键: `${missionId}:${sampleId}`（两条任务内样品 id 会重复, 必须带任务前缀） */
  key: string;
  missionId: MissionId;
  missionBadge: string;
  sampleId: number;
  code: string;
  siteName: string;
  /** 化验完成后合并进来的报告（未化验为 null, 展柜显示「待化验」暗态） */
  report: SampleReport | null;
}

/** 回放类型（实现拆至 useReplay 子 hook, 此处 re-export 保持既有导入方兼容） */
export type { ReplayFrame, ReplaySpeed, ReplayCamId } from "@/hooks/useReplay";
import type { ReplayFrame } from "@/hooks/useReplay";

/* ---------------- 遥测模拟工具 ---------------- */

type EaseKind = "lin" | "in" | "out";

const BOOT_TOTAL = 14;

const SERIES_CAP = 60;
const LOG_CAP = 80;
const T_MINUS_START = 600;

function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

function clockFormat(sec: number, flightActive: boolean): string {
  const sign = flightActive ? "T+" : "T-";
  return `${sign} ${pad2(sec / 3600)}:${pad2((sec % 3600) / 60)}:${pad2(sec % 60)}`;
}

function stampFormat(sec: number, flightActive: boolean): string {
  const sign = flightActive ? "T+" : "T-";
  return `${sign}${pad2((sec % 3600) / 60)}:${pad2(sec % 60)}`;
}

function easeP(kind: EaseKind | undefined, p: number): number {
  if (kind === "in") return p * p * p;
  if (kind === "out") return 1 - (1 - p) * (1 - p);
  return p;
}

function metricNow(def: MetricDef, flightActive: boolean, phaseId: PhaseId, progress: number, t: number): number {
  let core: number;
  if (!flightActive || !def.flight) {
    core = def.base + def.amp * Math.sin(t * def.wave + def.phase);
  } else {
    const curve = def.flight[phaseId];
    if (curve) {
      const a = curve[0];
      const b = curve[1];
      core = a + (b - a) * easeP(curve[2], progress);
    } else {
      core = def.base;
    }
  }
  const noise = (Math.random() - 0.5) * (def.amp * 0.6 + Math.abs(core) * def.relNoise * 2);
  return core + noise;
}

function formatValue(v: number, decimals: number): string {
  if (Math.abs(v) >= 10000) return Math.round(v).toLocaleString("en-US");
  return v.toFixed(decimals);
}

/** 系统级「减弱动画」偏好（无存档时作为应用内开关的初始值, 跟随操作系统无障碍设置） */
function systemPrefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

function buildInitialMetrics(mission: MissionDef): TelemetryMetric[] {
  return mission.metricDefs.map((def) => {
    const series = Array.from({ length: 24 }, (_, i) => metricNow(def, false, "standby", 0, i - 23));
    const last = series[series.length - 1];
    const seeded: TelemetryMetric = {
      key: def.key,
      label: def.label,
      labelEn: def.labelEn,
      unit: def.unit,
      decimals: def.decimals,
      value: last,
      display: formatValue(last, def.decimals),
      series,
    };
    return seeded;
  });
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cloneStations(mission: MissionDef): GroundStation[] {
  return mission.stationSeed.map((s) => ({ ...s }));
}

/* ---------------- 火星沙尘暴（仅 ARES-1 着陆后） ---------------- */

// ---- VNS-1 金星生存窗口（着陆即倒计时, 归零触发紧急上升撤离） ----
const VENUS_SURVIVAL_S = 240; // 触地后表面生存倒计时（秒）
const VENUS_SURVIVAL_WARN_S = 30; // 最后 N 秒红色脉冲 + 逐秒倒计时警报音
const VENUS_EVAC_POWER_MULT = 1.5; // 生存窗口内巡视车耗电倍率（高温散热全功率）

// ---- VNS-1 金星热管理博弈（生存窗口专属: 热负载 0–100%, 过热锁动作, 应急散热换时间） ----
const THERMAL_DRILL_GAIN = 2.5; // 钻探/采样进行中升温（点/秒）
const THERMAL_DRIVE_GAIN = 0.8; // 行驶升温（点/秒）
const THERMAL_HAZE_GAIN = 1.2; // 酸雾事件期间额外升温（点/秒）
const THERMAL_IDLE_LOSS = 2.0; // 静止停放散热（点/秒; 酸雾期间减半）
const THERMAL_OVERHEAT_AT = 100; // 热负载达到该值触发过热保护锁
const THERMAL_RECOVER_AT = 60; // 热负载降回该值以下自动解锁
const THERMAL_COOLING_DROP = 35; // 应急散热立降热负载（点）
const THERMAL_COOLING_COST_S = 15; // 应急散热消耗生存窗口（秒）
const THERMAL_COOLING_MIN = 20; // 热负载低于该值时应急散热禁用

// ---- 每日挑战模式（增强 G）: 纯本地确定性, 修饰参数 ----
const DAILY_VENUS_WINDOW_S = 180; // 「窗口压缩」生效时金星生存窗口（秒）
const DAILY_QUOTA = 3; // 「配额采集」需采满的样品件数

/** 着陆后 BGM 环境音天体音色映射（飞行段统一引擎底噪） */
const LANDED_AMBIENT: Record<MissionId, AmbientKind> = {
  luna9: "moon",
  ares1: "mars",
  europa1: "europa",
  venus1: "venus",
  titan1: "titan",
};

/** 着陆后 BGM 配乐天体映射（月寂/火荒/冰晶/金压/坦雾五套专属淡板） */
const LANDED_MUSIC: Record<MissionId, MusicPhase> = {
  luna9: "landed_moon",
  ares1: "landed_mars",
  europa1: "landed_europa",
  venus1: "landed_venus",
  titan1: "landed_titan",
};

// ---- 呼号抽问连答虚构榜（追问大奖名次对照用, 纯前端模拟席位） ----
const QUIZ_CHAIN_BOARD = [
  { name: "喀什 · 夜莺", chain: 7 },
  { name: "佳木斯 · 苍鹰", chain: 6 },
  { name: "冰桥 · 极光哨", chain: 5 },
  { name: "文昌 · 海风", chain: 4 },
  { name: "三亚 · 听涛", chain: 3 },
];

function quizChainRank(chain: number): number {
  return QUIZ_CHAIN_BOARD.filter((b) => b.chain >= chain).length + 1;
}

/** 连答榜席位挑战播报：链长追平某席位纪录或刚超越某席位时点名（纯前端模拟席位） */
function quizChainCallout(chain: number): string {
  const tie = QUIZ_CHAIN_BOARD.find((b) => b.chain === chain);
  if (tie) return `, 追平了${tie.name}的 ${chain} 连纪录!`;
  const passed = QUIZ_CHAIN_BOARD.filter((b) => b.chain < chain).sort((a, b) => b.chain - a.chain)[0];
  if (passed) return `, 刚刚超越了${passed.name}（${passed.chain} 连）!`;
  return "";
}

/** 每日挑战弹层快照类型（实现拆至 useDailyChallenge 子 hook, 此处 re-export 保持既有导入方兼容） */
export type { DailyChallengeSnap } from "@/hooks/useDailyChallenge";

export function useHome() {
  // 当前任务（LUNA-9 / ARES-1, 仅待发射可切换）
  const [activeMissionId, setActiveMissionId] = useState<MissionId>("luna9");
  const missionRef = useRef<MissionDef>(LUNA_9);

  // 本地存档（dsc-save-v1）：读档 / 节流写档 / 卸载尾沿落盘拆至 useSaveState 子 hook;
  // collect 闭包惰性求值（只在写盘时机执行）, 引用的业务 ref 声明在后也安全
  const {
    initialSave,
    saveLoadedRef,
    saveMetaRef,
    saveFailed,
    scheduleSave,
    markSaveCleared,
  } = useSaveState(() => ({
    achievements: achievementMapRef.current,
    museum: museumRef.current,
    debriefBest: debriefBestRef.current,
    landedMissions: Array.from(landedMissionsRef.current),
    rallyBests: { ...rallyBestsRef.current },
    playBest: { ...playBestRef.current },
    quizChainBest: quizChainBestRef.current,
    dutyMerit: dutyMeritRef.current,
    dutyDone: dutyDoneRef.current,
    reducedMotion: reducedMotionRef.current,
    career: { ...careerRef.current, landings: { ...careerRef.current.landings } },
    audio: { ...audioPrefsRef.current },
  }));
  const saveRestoreLoggedRef = useRef(false);

  const [bootStep, setBootStep] = useState(0);
  const [countdownSecs, setCountdownSecs] = useState(T_MINUS_START);
  const [flightSecs, setFlightSecs] = useState(0);
  const [flightActive, setFlightActive] = useState(false);
  const [phaseId, setPhaseId] = useState<PhaseId>("standby");
  const [moonMix, setMoonMix] = useState(0);
  const metricsRef = useRef<TelemetryMetric[]>(buildInitialMetrics(LUNA_9));
  const [metrics, setMetrics] = useState<TelemetryMetric[]>(metricsRef.current);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [activeAlarm, setActiveAlarm] = useState<AlarmState | null>(null);
  const [stationList, setStationList] = useState<GroundStation[]>(() => cloneStations(LUNA_9));
  const [selectedMetricKey, setSelectedMetricKey] = useState<string | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [soundOn, setSoundOn] = useState(initialSave?.audio.sfxOn ?? true);
  // 本次音效开启的起始时刻：转静音时据此判断播标准告别音还是「轻告别」（开启超 1 分钟）
  const soundOnSinceRef = useRef(Date.now());
  // ---- BGM 环境音偏好（随存档持久化; audioPrefsRef 为写档快照单一来源） ----
  const [bgmOn, setBgmOn] = useState(initialSave?.audio.bgmOn ?? true);
  const [bgmVolume, setBgmVolume] = useState(initialSave?.audio.bgmVolume ?? 0.5);
  const audioPrefsRef = useRef(initialSave ? { ...initialSave.audio } : defaultAudioPrefs());
  const [cinemaMode, setCinemaMode] = useState(false);
  const [landingVisible, setLandingVisible] = useState(false);
  // 气动黑障区（ARES-1）：信号中断窗口
  const [signalLoss, setSignalLoss] = useState(false);
  // 火星沙尘暴 / 金星酸雾天气系统（状态机 / 调度 / 复位拆至 useStorm 子 hook;
  // 遥测降额、警报调度、状态灯与录制器继续读这里解构出的 ref 与 state）
  const {
    dustStormActive,
    dustIntensity,
    globalStormActive,
    globalStormRemainS,
    stormClearing,
    stormPhaseRef,
    dustIntensityRef,
    dustStormActiveRef,
    globalStormRef,
    stormPowerDrainRef,
    advanceStorm,
    scheduleFirstStorm,
    triggerStormSoon,
    resetStorm,
  } = useStorm();
  // 金星生存窗口（VNS-1 专属）：触地后 240s 倒计时剩余整秒（窗口外为 null）+ 紧急上升撤离中标志
  const [venusSurvivalRemainS, setVenusSurvivalRemainS] = useState<number | null>(null);
  const [venusEvacuating, setVenusEvacuating] = useState(false);
  // 金星热管理博弈（VNS-1 专属）：热负载整数 0–100 + 过热保护锁（锁定巡视车全部动作）
  const [hullTemp, setHullTemp] = useState(0);
  const [venusOverheat, setVenusOverheat] = useState(false);
  // 任务简报叠层（上电自检结束后、进入待发射常态前插入, 仅未点火时显示）
  const [briefingOpen, setBriefingOpen] = useState(false);
  // 动效导览弹层（顶栏按钮打开, 全量动画清单 + 触发方式）
  const [guideOpen, setGuideOpen] = useState(false);
  // 减弱动画开关（全局禁用循环/过场 CSS 动画, 内存态）
  const [reducedMotion, setReducedMotion] = useState(initialSave?.reducedMotion ?? systemPrefersReducedMotion());
  // 性能档位（full/balanced/saver 三档, localStorage 记忆; reducedMotion 开启时档位让位于省动画）
  const [perfTier, setPerfTier] = useState<PerfTier>(() => loadPerfTier());

  /** 性能档位循环切换：full → balanced → saver → full, 即时持久化 */
  const cyclePerfTier = useCallback(() => {
    setPerfTier((prev) => {
      const next = nextPerfTier(prev);
      savePerfTier(next);
      return next;
    });
  }, []);

  // 档位剖面同步到模块级单例（canvas 渲染循环逐帧读取; reducedMotion 开启时剖面自动取 saver）
  useEffect(() => {
    setActivePerf(perfTier, reducedMotion);
  }, [perfTier, reducedMotion]);
  // 地面通话字幕状态机
  const [commLine, setCommLine] = useState<CommSubtitleState | null>(null);
  const [commVisible, setCommVisible] = useState(true);
  // 警报处置
  const [ackCount, setAckCount] = useState(0);
  // 成就状态机（解锁幂等 / toast / 清档复位）拆至 useAchievements 子 hook; 成就墙跨任务不清空
  const {
    achievementMap,
    achievementMapRef,
    achievementToast,
    achievementToastDef,
    unlockAchievement,
    resetAchievements,
  } = useAchievements({
    initial: initialSave?.achievements ?? {},
    getClockText: () =>
      clockFormat(
        flightActiveRef.current ? flightSecsRef.current : countdownRef.current,
        flightActiveRef.current,
      ),
    getMissionMeta: () => ({ id: missionRef.current.id, badge: missionRef.current.badge }),
    scheduleSave,
  });
  const [achievementWallOpen, setAchievementWallOpen] = useState(false);
  // 已完成软着陆的任务清单（landedMissionsRef 的 state 镜像, 任务进度总览页消费）
  const [landedMissions, setLandedMissions] = useState<MissionId[]>(initialSave?.landedMissions ?? []);
  // 任务进度总览弹层
  const [overviewOpen, setOverviewOpen] = useState(false);
  // ---- 玩法系统：手动着陆挑战 / 值班指令 / 航行突发事件 / 任务结算单 ----
  const [manualLandingOpen, setManualLandingOpen] = useState(false);
  const [dutyMerit, setDutyMerit] = useState(initialSave?.dutyMerit ?? 0);
  const [dutyTask, setDutyTask] = useState<DutyTaskState | null>(null);
  const [dutyDoneCount, setDutyDoneCount] = useState(initialSave?.dutyDone ?? 0);
  const [crisis, setCrisis] = useState<{ event: CrisisEvent; remainS: number; chainPos?: number; chainLen?: number } | null>(null);
  const [debriefOpen, setDebriefOpen] = useState(false);
  const [debriefData, setDebriefData] = useState<DebriefData | null>(null);
  // 随机交互事件：流星雨观测窗口（金色流星连击递增）/ 突发紧急演练标靶（可升级三连靶+移动靶）/ 中继握手请求（可为信号干扰局）
  const [shower, setShower] = useState<{ remainS: number; hits: number; golds: number } | null>(null);
  const [drill, setDrill] = useState<{ xPct: number; yPct: number; remainS: number; seq: number; total: number; moving: boolean; dash: boolean } | null>(null);
  const [handshake, setHandshake] = useState<{ remainS: number; interference: boolean } | null>(null);
  // 第三十二轮新玩法：系统诊断快检（记忆灯序）/ 北京呼号抽问（四选一）/ 中继天线三段对准（时机盘）/ 极光观测窗口（点击记光谱）
  const [diag, setDiag] = useState<{ remainS: number; decoyRate: number; hintGlow: boolean; extreme: boolean } | null>(null);
  const [quiz, setQuiz] = useState<{ id: number; question: QuizQuestion; remainS: number } | null>(null);
  const [antenna, setAntenna] = useState<{ remainS: number; reverse: boolean; dual: boolean } | null>(null);
  const [aurora, setAurora] = useState<{ remainS: number; hits: number; rare: boolean; wished: boolean } | null>(null);
  // 样品博物馆陈列厅（跨任务内存登记册, 任务切换不清空）
  const [museumSamples, setMuseumSamples] = useState<Record<string, MuseumSampleEntry>>(initialSave?.museum ?? {});
  const [museumOpen, setMuseumOpen] = useState(false);
  const [museumReport, setMuseumReport] = useState<{ sample: RoverSample; report: SampleReport } | null>(null);
  // 本次进厅需要播放光柱仪式的 S 级藏品 key（开厅时计算一次, 关厅清空）
  const [museumCelebrateKeys, setMuseumCelebrateKeys] = useState<string[]>([]);
  // 表面专属事件（陨石雨/冰裂隙/浓雾的横幅与干预脉冲 state）在 useSurfaceEvents 子 hook

  const recLogRef = useRef<LogEntry[]>([]);
  const recLogCountRef = useRef(0);
  // 录制收尾标志（着陆且无风暴窗口后置 true, 停止收帧; 点火/切任务复位）——帧缓冲与回放状态机在 useReplay 子 hook
  const recordingDoneRef = useRef(false);
  const moonMixRef = useRef(0);
  const signalLossRef = useRef(false);
  // 巡视车累计里程镜像（useStorm 的里程触发概率与着陆调度消费）
  const roverOdoRef = useRef(0);
  // 金星生存窗口状态机（ref 供 1Hz tick 读取; 撤离标志锁定巡视车并触发出结算）
  const survivalRemainRef = useRef<number | null>(null);
  const evacuatingRef = useRef(false);
  // 金星热管理状态（ref 供 1Hz tick 累计; thermalStats = 本次任务内过热/散热/峰值计数, 结算消费）
  const hullTempRef = useRef(0);
  const overheatLockRef = useRef(false);
  const thermalStatsRef = useRef({ overheat: 0, cooling: 0, peak: 0 });
  // 巡视车动作镜像（机械臂作业 / 行驶中; useSurfaceEvents 陨石命中率与喷发中断判定消费）
  const roverThermalRef = useRef({ armActive: false, moving: false });
  // 新鲜冰晶窗口内采集的样品 code（「冰泉猎手」成就追踪: 化验出 S 级报告时解锁; 喷发状态机本体在 useSurfaceEvents）
  const freshIceCodesRef = useRef<Set<string>>(new Set());
  const briefingOpenRef = useRef(false);
  const guideOpenRef = useRef(false);
  // 任务档案导出：阶段时间轴 + 警报处置记录（随任务累积）
  const phaseMarksRef = useRef<ArchivePhaseMark[]>([]);
  const alarmRecordsRef = useRef<ArchiveAlarmRecord[]>([]);
  // 陈列厅登记册（内存态, 采样入舱 / 化验出报告时合并登记; 初值可来自本地存档）
  const museumRef = useRef<Record<string, MuseumSampleEntry>>(initialSave?.museum ?? {});
  // 已播放过入馆光柱仪式的 S 级藏品 key（会话级 Set, 不落盘; key 含 missionId 天然跨任务不冲突; 读档恢复的 S 级预置避免重复庆祝）
  const celebratedKeysRef = useRef<Set<string>>(
    new Set(
      Object.values(initialSave?.museum ?? {})
        .filter((e) => e.report?.grade === "S")
        .map((e) => e.key),
    ),
  );
  const landedMissionsRef = useRef<Set<MissionId>>(new Set(initialSave?.landedMissions ?? []));
  const ackTotalRef = useRef(0);
  // ---- 玩法系统 refs ----
  // 手动着陆：本次下降段是否已触发过挑战（避免重复弹出）、着陆评级记录（结算用）
  const manualOfferedRef = useRef(false);
  const manualGradeRef = useRef<LandingGrade | null>(null);
  // 值班指令：调度时刻、当前任务、功勋值镜像
  const nextDutyAtRef = useRef(30);
  const dutyTaskRef = useRef<DutyTaskState | null>(null);
  const dutyMeritRef = useRef(initialSave?.dutyMerit ?? 0);
  const dutyDoneRef = useRef(initialSave?.dutyDone ?? 0);
  // ---- 本地存档持久计数（career 生涯累计 / 拉力最佳镜像 / 减弱动画镜像, 写档快照只读稳定 ref） ----
  const careerRef = useRef<CareerCounters>(initialSave ? { ...defaultCareer(), ...initialSave.career } : defaultCareer());
  const rallyBestsRef = useRef<RallyBests>(initialSave?.rallyBests ?? { std: null, rev: null, night: null });
  const reducedMotionRef = useRef(initialSave?.reducedMotion ?? false);
  // 值班指令进度计数（派发时记基线, 完成判定看增量）
  const cinemaCountRef = useRef(0);
  const metricOpenCountRef = useRef(0);
  const museumOpenCountRef = useRef(0);
  const wallOpenCountRef = useRef(0);
  const roverUnlockedRef = useRef(false);
  const roverSampleCountRef = useRef(0);
  const roverReportsCountRef = useRef(0);
  // 航行突发事件：调度时刻、当前事件、处置统计（结算用）、后续剧情回响（一次性消费）
  const nextCrisisAtRef = useRef(Number.POSITIVE_INFINITY);
  const crisisRef = useRef<{ event: CrisisEvent; deadline: number } | null>(null);
  const crisisStatsRef = useRef({ good: 0, total: 0 });
  // 处置结局的后续剧情影响：下一次飞行阶段推进时插入回响日志+字幕（明智=顺风句, 失当=后遗症句+警报连锁提前）
  const crisisAftermathRef = useRef<{ event: CrisisEvent; good: boolean } | null>(null);
  // 三连危机链：count = 已处置环数（0 = 无链; 单发处置后 40% 概率开链, 环间 6-10s）, good = 链内明智环数
  const crisisChainRef = useRef({ count: 0, good: 0 });
  // 随机交互事件调度（流星雨 / 演练三连靶 / 握手干扰局）
  const nextShowerAtRef = useRef(70 + Math.floor(Math.random() * 90));
  const showerRef = useRef<{ deadline: number; hits: number; golds: number } | null>(null);
  const nextDrillAtRef = useRef(90 + Math.floor(Math.random() * 70));
  const drillRef = useRef<{ deadline: number; xPct: number; yPct: number; seq: number; total: number; moving: boolean; dash: boolean } | null>(null);
  const drillCountRef = useRef(0);
  const nextHandshakeAtRef = useRef(120 + Math.floor(Math.random() * 100));
  const handshakeRef = useRef<{ deadline: number; interference: boolean } | null>(null);
  // 诊断快检 / 呼号抽问 / 天线对准 / 极光观测 调度三件套（绝对秒时基 + ref 真值 + state 镜像）
  const nextDiagAtRef = useRef(150 + Math.floor(Math.random() * 120));
  const diagRef = useRef<{ deadline: number; extreme: boolean } | null>(null);
  const diagWinRef = useRef(0);
  const nextQuizAtRef = useRef(180 + Math.floor(Math.random() * 130));
  const quizRef = useRef<{ id: number; deadline: number; question: QuizQuestion } | null>(null);
  // 题目 id 自增（HomePage 以 key 强制重挂载 QuizCard, 追问题切换时清掉上一题的作答态）
  const quizIdRef = useRef(0);
  const quizWinRef = useRef(0);
  // 呼号抽问连对计数（答错/超时清零, 连对奖励 20→30→40 递增封顶）
  const quizStreakRef = useRef(0);
  // 追问连答链计数（本次弹卡内首答+追问连对数, 链内全对 4 题触发追问大奖 +50）
  const quizChainRef = useRef(0);
  // 个人连答最佳链长（历史最佳, 跨任务跨会话保留, 随存档持久化; 结算盘点「连答纪录」徽章消费）
  const quizChainBestRef = useRef(initialSave?.quizChainBest ?? 0);
  // 值班玩法盘点累计计数（任务结算单「DUTY PLAYS」行消费; 切任务复位）
  const playStatsRef = useRef({ meteors: 0, golds: 0, drills: 0, handshakes: 0, diags: 0, quizzes: 0, antennas: 0, auroras: 0 });
  // 玩法盘点各项历史最佳（跨任务跨会话保留, 随存档持久化; 每次结算对比旧纪录后刷新）
  const playBestRef = useRef<Record<string, number>>({ ...(initialSave?.playBest ?? {}) });
  // 上次结算的玩法称号档位（-1 = 尚未结算过; 本次更高则结算单播「称号晋升」流光动画）
  const playTitleRankRef = useRef(-1);
  const nextAntennaAtRef = useRef(210 + Math.floor(Math.random() * 140));
  const antennaRef = useRef<{ deadline: number; reverse: boolean; dual: boolean } | null>(null);
  const nextAuroraAtRef = useRef(120 + Math.floor(Math.random() * 160));
  const auroraRef = useRef<{ deadline: number; hits: number; rare: boolean; wished: boolean } | null>(null);
  const applyCrisisRef = useRef<((idx: 0 | 1, timedOut: boolean) => void) | null>(null);
  // 任务结算单：着陆后自动出具一次 + 顶栏战报按钮可重开
  const debriefShownRef = useRef(false);
  const debriefTimerRef = useRef<number | null>(null);
  const debriefOpenRef = useRef(false);
  const buildDebriefRef = useRef<(() => DebriefData | null) | null>(null);
  // 结算历史最佳（按任务分键, 总分+五维各自记最高, 跨会话保留, 随存档持久化）
  const debriefBestRef = useRef<Record<string, { total: number; grade: string; dims: number[] }>>(initialSave?.debriefBest ?? {});
  // 手动着陆期间冻结飞行时间轴
  const flightPausedRef = useRef(false);
  // 跳过流程的 3 秒速览快进 interval（非空 = 快进中, 防重复触发; 切任务/卸载时清理）
  const skipAnimRef = useRef<number | null>(null);

  const logIdRef = useRef(1);
  const runSecsRef = useRef(0);
  const countdownRef = useRef(T_MINUS_START);
  const flightSecsRef = useRef(0);
  const flightActiveRef = useRef(false);
  const phaseRef = useRef<PhaseId>("standby");
  const alarmActiveRef = useRef(false);
  const alarmStateRef = useRef<AlarmState | null>(null);
  const alarmStartedAtRef = useRef(0);
  const nextAlarmAtRef = useRef(20 + Math.floor(Math.random() * 20));
  const recoverTimerRef = useRef<number | null>(null);
  const shakeTimerRef = useRef<number | null>(null);
  const commQueueRef = useRef<CommLine[]>([]);
  const commBusyRef = useRef(false);
  const commTimerRef = useRef<number | null>(null);
  const commIdRef = useRef(0);
  const commVisibleRef = useRef(true);

  const def = missionRef.current;
  const bootDone = bootStep >= BOOT_TOTAL;
  const bootPhase = bootDone ? "online" : "boot";
  const bootVisibleLines = def.bootLines.slice(0, Math.max(0, bootStep - 1));
  const litPanelCount = Math.min(def.metricDefs.length, Math.max(0, bootStep - 5));
  const bootProgress = Math.min(1, bootStep / BOOT_TOTAL);

  /* ---------------- 发射回放（录制调度 / 播放状态机 / 多机位拆至 useReplay 子 hook） ---------------- */

  // 收帧回调：返回 null 表示本拍不录（未飞行 / 着陆后录制已收尾）; 沙尘暴/浓雾窗口延续录制
  const captureReplayFrame = useCallback((): ReplayFrame | null => {
    if (!flightActiveRef.current) return null;
    if (phaseRef.current === "landed") {
      const stormy =
        stormPhaseRef.current !== "idle" ||
        dustIntensityRef.current > 0.02 ||
        fogPhaseRef.current !== "idle" ||
        fogLevelRef.current > 0.02;
      if (!stormy) {
        recordingDoneRef.current = true;
        return null;
      }
    } else if (recordingDoneRef.current) {
      return null;
    }
    const m = missionRef.current;
    const meta = m.phases[PHASE_INDEX[phaseRef.current]];
    return {
      flightT: flightSecsRef.current,
      clockText: clockFormat(flightSecsRef.current, true),
      phaseId: phaseRef.current,
      phaseIndex: PHASE_INDEX[phaseRef.current],
      phaseLabel: meta.label,
      phaseLabelEn: meta.labelEn,
      moonMix: moonMixRef.current,
      values: metricsRef.current.map((mm) => mm.value),
      logCount: recLogCountRef.current,
      dustIntensity: dustIntensityRef.current,
      fogLevel: fogLevelRef.current,
    };
  }, []);

  // 进入回放瞬间: 关指标详情浮层 + 掐断警报蜂鸣
  const handleEnterReplay = useCallback(() => {
    setSelectedMetricKey(null);
    stopAlarmBeep();
  }, []);

  const {
    replayMode,
    replayModeRef,
    replayPlaying,
    replaySpeed,
    replayFrameIndex,
    replayFrameCount,
    replayCam,
    replayFramesRef,
    replayCountRef,
    replayFrame,
    replayEnabled,
    exitReplay,
    toggleReplay,
    toggleReplayPlay,
    seekReplayFrame,
    changeReplaySpeed,
    stepReplayFrame,
    selectReplayCam,
    markReplayReady,
    resetReplayState,
    clearRecording,
  } = useReplay({ bootDone, captureFrame: captureReplayFrame, onEnter: handleEnterReplay, unlockAchievement });

  const pushLog = useCallback((system: string, message: string, level: MissionLevel) => {
    const clockSec = flightActiveRef.current ? flightSecsRef.current : countdownRef.current;
    const entry: LogEntry = {
      id: logIdRef.current++,
      stamp: stampFormat(clockSec, flightActiveRef.current),
      system,
      message,
      level,
    };
    // 回放录制: 完整日志时间线（不受实时 LOG_CAP 截断影响）
    recLogRef.current.push(entry);
    recLogCountRef.current += 1;
    setLogEntries((prev) => {
      const next = [...prev, entry];
      return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
    });
  }, []);

  /* ---------------- 每日挑战模式（状态机拆至 useDailyChallenge 子 hook; 纯本地确定性: 当日天体 + 修饰条件, 连击记入生涯） ---------------- */

  // switchMission 经 ref 转发（startDailyChallenge 要切到目标天体, 而 switchMission 声明在后, 避免声明顺序环）
  const switchMissionRef = useRef<(id: MissionId) => void>(() => {});

  const {
    challengeActive,
    challengeRef,
    challengeWeatherMultRef,
    dailyOpen,
    dailyOpenRef,
    dailySnap,
    dailyDoneToday,
    setDailyDoneToday,
    scaledSurfaceGap,
    startDailyChallenge,
    endDailyChallenge,
    completeDailyChallenge,
    openDaily,
    closeDaily,
  } = useDailyChallenge({
    bootDone,
    initialDoneToday: (initialSave?.career.lastDailyDate ?? "") === dailyDateKey(),
    careerRef,
    commQueueRef,
    missionRef,
    flightActiveRef,
    phaseRef,
    replayModeRef,
    switchMission: (id) => switchMissionRef.current(id),
    pushLog,
    scheduleSave,
    unlockAchievement,
  });

  // 天体表面专属事件（月球微陨石雨 / 欧罗巴冰裂隙喷发 / 泰坦甲烷浓雾）：三套状态机内聚到 useSurfaceEvents 子 hook;
  // 震屏通道与巡视车动作镜像仍由 useHome 持有, 经 opts 共享
  const {
    meteorBanner,
    meteorLockActive,
    armSetbackPulse,
    cryoVentBanner,
    interruptPulse,
    freshIceActive,
    fogLevel,
    fogBanner,
    fogActive,
    fogPhaseRef,
    fogLevelRef,
    fogSampledRef,
    advanceSurfaceEvents,
    scheduleFirstSurfaceEvents,
    surfaceEventSoon,
    resetSurfaceEvents,
  } = useSurfaceEvents({
    pushLog,
    commQueueRef,
    careerRef,
    scheduleSave,
    unlockAchievement,
    setShaking,
    shakeTimerRef,
    roverThermalRef,
  });

  // 上电自检: 每 150ms 推进一步, 约 2.1 秒完成
  useEffect(() => {
    const bootTimer = window.setInterval(() => {
      setBootStep((prev) => {
        if (prev >= BOOT_TOTAL) {
          window.clearInterval(bootTimer);
          return prev;
        }
        return prev + 1;
      });
    }, 150);
    return () => window.clearInterval(bootTimer);
  }, []);

  // 任务简报: 上电自检结束后、进入待发射常态前插入（仅未点火且非回放时显示一次）
  useEffect(() => {
    if (!bootDone) return;
    if (flightActiveRef.current || replayModeRef.current) return;
    briefingOpenRef.current = true;
    setBriefingOpen(true);
  }, [bootDone]);

  const dismissBriefing = useCallback(() => {
    briefingOpenRef.current = false;
    setBriefingOpen(false);
  }, []);

  // 存档恢复播报：上电自检完成后插一条 INFO 日志（仅当确实读到存档, 只播一次）
  useEffect(() => {
    if (!bootDone || !saveLoadedRef.current || saveRestoreLoggedRef.current) return;
    saveRestoreLoggedRef.current = true;
    pushLog(
      "ARCHIVE",
      `存档已恢复——成就 ${Object.keys(achievementMapRef.current).length} 枚 / 样品登记 ${Object.keys(museumRef.current).length} 件 / 功勋 ${dutyMeritRef.current} 点已同步回显`,
      "nominal",
    );
  }, [bootDone, pushLog]);

  // 彩蛋: 单次会话连续值守 ≥30 分钟（真实墙钟, 每 30s 查一次, unlock 幂等）
  const sessionStartRef = useRef(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() - sessionStartRef.current >= 30 * 60 * 1000) unlockAchievement("marathon_watch");
    }, 30000);
    return () => window.clearInterval(timer);
  }, [unlockAchievement]);

  // 功勋 / 值班完成数变化 = 存点（state 镜像 effect 统一调度, 免去在十几处功勋加点逐一插写盘）
  const dutySaveInitRef = useRef(true);
  useEffect(() => {
    if (dutySaveInitRef.current) {
      dutySaveInitRef.current = false;
      return;
    }
    scheduleSave();
  }, [dutyMerit, dutyDoneCount, scheduleSave]);

  // 值班指令进度计数读取（全走稳定 ref, tick 闭包安全）
  const dutyGetter = (kind: string): number => {
    switch (kind) {
      case "ack":
        return ackTotalRef.current;
      case "metric":
        return metricOpenCountRef.current;
      case "museum":
        return museumOpenCountRef.current;
      case "wall":
        return wallOpenCountRef.current;
      case "cinema":
        return cinemaCountRef.current;
      case "sample":
        return roverSampleCountRef.current;
      case "analyze":
        return roverReportsCountRef.current;
      default:
        return 0;
    }
  };

  /** 下发一条值班指令：chain=null 为单条（40% 概率升级为 3 环连环指令）; 连环时相邻环尽量不同类 */
  const issueDutyTask = (t: number, chain: { pos: number; len: number; bonus: number; prevKind?: string } | null) => {
    const kinds: { kind: string; desc: string; target: number }[] = [
      { kind: "ack", desc: "手动处置 {n} 次警报", target: 1 },
      { kind: "metric", desc: "查看遥测面板详情 {n} 次", target: 2 },
      { kind: "museum", desc: "巡视样品陈列厅 {n} 次", target: 1 },
      { kind: "wall", desc: "查阅成就墙 {n} 次", target: 1 },
      { kind: "cinema", desc: "进入影院模式盯屏 {n} 次", target: 1 },
    ];
    if (roverUnlockedRef.current) {
      kinds.push(
        { kind: "sample", desc: "完成机械臂采样 {n} 件", target: 1 },
        { kind: "analyze", desc: "完成样品化验 {n} 次", target: 1 },
      );
    }
    const pool = chain?.prevKind ? kinds.filter((k) => k.kind !== chain.prevKind) : kinds;
    const chosen = pick(pool.length ? pool : kinds);
    // 单条完成后 40% 概率升级为连环指令：随机 3–5 环, 环数越多贯通追加功勋越高
    let chainInfo = chain;
    if (!chainInfo && Math.random() < 0.4) {
      const len = 3 + Math.floor(Math.random() * 3);
      chainInfo = { pos: 1, len, bonus: 40 + (len - 3) * 25 + Math.floor(Math.random() * 21) };
    }
    const totalS = chainInfo ? 40 + Math.floor(Math.random() * 21) : 55 + Math.floor(Math.random() * 35);
    const reward = 20 + Math.floor(Math.random() * 21);
    const desc = chosen.desc.replace("{n}", String(chosen.target));
    dutyTaskRef.current = {
      kind: chosen.kind,
      desc,
      target: chosen.target,
      baseline: dutyGetter(chosen.kind),
      progress: 0,
      remainS: totalS,
      totalS,
      reward,
      deadline: t + totalS,
      chainPos: chainInfo?.pos,
      chainLen: chainInfo?.len,
      chainBonus: chainInfo?.bonus,
    };
    setDutyTask({ ...dutyTaskRef.current });
    if (chainInfo?.pos === 1) {
      pushLog(
        "DUTY",
        `连环指令下发（${chainInfo.pos}/${chainInfo.len} 环, 全环贯通追加 ${chainInfo.bonus} 功勋）: 第一环 ${desc}（限时 ${totalS}s）`,
        "nominal",
      );
    } else if (chainInfo) {
      pushLog("DUTY", `连环指令第 ${chainInfo.pos}/${chainInfo.len} 环下发: ${desc}（限时 ${totalS}s, 贯通再 +${chainInfo.bonus} 功勋）`, "nominal");
    } else {
      pushLog("DUTY", `值班指令下发: ${desc}（限时 ${totalS}s, 完成奖励 ${reward} 点功勋）`, "nominal");
    }
  };

  // 主遥测循环: 自检完成后 1Hz 刷新, 飞行中按当前 mission 阶段链推进
  useEffect(() => {
    if (!bootDone) return;
    pushLog("SYS", `全系统上电完成, ${missionRef.current.code} 进入射前常态监测`, "nominal");
    pushLog("LAUNCH", "发射窗口锁定, 等待点火指令", "nominal");

    const tick = window.setInterval(() => {
      runSecsRef.current += 1;
      const t = runSecsRef.current;
      const m = missionRef.current;

      let curPhase: PhaseId = "standby";
      let progress = 0;

      if (flightActiveRef.current) {
        // 手动着陆挑战期间冻结飞行时间轴（阶段停在动力下降段, 挑战结束恢复推进）
        if (!flightPausedRef.current) {
          flightSecsRef.current += 1;
          setFlightSecs(flightSecsRef.current);
        }
        const at = phaseAtFlightSec(m, flightSecsRef.current);
        curPhase = at.phaseId;
        progress = at.progress;

        if (curPhase !== phaseRef.current) {
          phaseRef.current = curPhase;
          setPhaseId(curPhase);
          const meta = m.phases[PHASE_INDEX[curPhase]];
          if (meta && meta.milestone) pushLog("FLIGHT", meta.milestone, "nominal");
          phaseMarksRef.current.push({
            id: curPhase,
            label: meta?.label ?? curPhase,
            startedAtClock: clockFormat(flightSecsRef.current, true),
          });
          // 字幕剧本与阶段推进同步：整段替换播报队列
          commQueueRef.current = [...(m.comm.script[curPhase] ?? [])];
          // 突发事件后续剧情回响：处置后的首次阶段推进一次性消费（明智=顺风句, 失当=后遗症句+警报连锁提前）
          const aftermath = crisisAftermathRef.current;
          if (aftermath) {
            crisisAftermathRef.current = null;
            if (aftermath.good) {
              pushLog("FLIGHT", aftermath.event.aftermathGood, "nominal");
              commQueueRef.current.push({
                speaker: m.comm.speakers.bj,
                text: `多亏此前「${aftermath.event.title}」处置得当, 本阶段工况格外顺利, 北京给值班席记了一笔。`,
              });
            } else {
              pushLog("FLIGHT", aftermath.event.aftermathBad, "caution");
              commQueueRef.current.push({
                speaker: m.comm.speakers.bj,
                text: `注意, 「${aftermath.event.title}」的后遗症还没完全消除, 本阶段各系统都盯紧一点。`,
              });
              nextAlarmAtRef.current = Math.min(nextAlarmAtRef.current, t + 20);
            }
          }
          if (curPhase === "landed") {
            playTouchdownChime();
            setLandingVisible(true);
            markReplayReady();
            pushLog("SYS", "全程遥测录制归档完成, 顶栏回放通道开启", "nominal");
            unlockAchievement("first_landing");
            landedMissionsRef.current.add(m.id);
            setLandedMissions(Array.from(landedMissionsRef.current));
            // 生涯计数：本次任务着陆 +1（着陆 = 存点, 随存档持久化）
            careerRef.current.landings[m.id] = (careerRef.current.landings[m.id] ?? 0) + 1;
            scheduleSave();
            if (landedMissionsRef.current.size >= 2) unlockAchievement("dual_landing");
            if (landedMissionsRef.current.size >= 3) unlockAchievement("triple_landing");
            if (landedMissionsRef.current.size >= 4) unlockAchievement("quadruple_landing");
            if (landedMissionsRef.current.size >= 5) unlockAchievement("penta_landing");
            // VNS-1 金星：触地即启动生存窗口倒计时（归零触发紧急上升撤离）
            if (m.id === "venus1" && !replayModeRef.current) {
              // 每日挑战「窗口压缩」: 金星生存窗口压缩至 180s（非挑战局保持既有 240s 语义不变）
              const venusWindowS =
                challengeRef.current &&
                challengeRef.current.missionId === "venus1" &&
                challengeRef.current.modIds.includes("window_compression")
                  ? DAILY_VENUS_WINDOW_S
                  : VENUS_SURVIVAL_S;
              survivalRemainRef.current = venusWindowS;
              evacuatingRef.current = false;
              setVenusSurvivalRemainS(venusWindowS);
              setVenusEvacuating(false);
              // 热管理博弈随生存窗口一同开局：热负载/过热锁/本局统计全部归零
              hullTempRef.current = 0;
              overheatLockRef.current = false;
              thermalStatsRef.current = { overheat: 0, cooling: 0, peak: 0 };
              setHullTemp(0);
              setVenusOverheat(false);
              pushLog(
                "GNC",
                `金星表面 465°C / 92 倍大气压——生存窗口 ${venusWindowS} 秒倒计时启动, 上升发动机热待机, 样品随采随化验`,
                "caution",
              );
            }
            // ARES-1 / VNS-1 着陆后调度首场沙尘暴 / 酸雾锋面（随机延迟; 里程达阈值后概率上浮;
            // 每日挑战「恶劣天象」= 该天体专属事件调度间隔减半）
            if (m.id === "ares1" || m.id === "venus1") {
              scheduleFirstStorm(t, challengeWeatherMultRef.current);
            }
            // LUNA-9 / EUROPA-1 / TTN-1 着陆后调度首场表面专属事件（陨石雨/冰裂隙/浓雾, 独立调度器, 子 hook 内聚）
            scheduleFirstSurfaceEvents(t, m.id, challengeWeatherMultRef.current);
            // 每日挑战: 软着陆成功 = 达成判定点（无「配额采集」修饰即着陆达成; 有配额则等采满 3 件）
            {
              const ch = challengeRef.current;
              if (ch && !ch.done && ch.missionId === m.id) {
                ch.landedOk = true;
                if (!ch.modIds.includes("quota_collection")) completeDailyChallenge();
              }
            }
          }
          // 进入动力下降段：弹出手动着陆挑战（接管则冻结飞行时钟, 也可转自动着陆）
          if (curPhase === "descent" && !replayModeRef.current && !manualOfferedRef.current) {
            manualOfferedRef.current = true;
            flightPausedRef.current = true;
            setManualLandingOpen(true);
            pushLog("GNC", "动力下降段启动——手动接管窗口开启, 值班员可接管操纵杆执行精确着陆", "nominal");
          }
        }

        // ---- 航行突发事件（转移/制动段随机弹出二选一处置卡, 12s 倒计时） ----
        if (
          !replayModeRef.current &&
          !flightPausedRef.current &&
          (curPhase === "transfer" || curPhase === "braking") &&
          !crisisRef.current &&
          t >= nextCrisisAtRef.current
        ) {
          const event = pick(CRISIS_EVENTS);
          // 危机链环节：链已开启时本条为第 count+1 环（共 3 环）
          const chainPos = crisisChainRef.current.count > 0 ? crisisChainRef.current.count + 1 : undefined;
          crisisRef.current = { event, deadline: t + 12 };
          setCrisis(chainPos ? { event, remainS: 12, chainPos, chainLen: 3 } : { event, remainS: 12 });
          pushLog(
            "CRISIS",
            chainPos
              ? `危机链 ${chainPos}/3: ${event.title}——连锁故障还在升级, 请值班员 12 秒内做出处置决策`
              : `航行突发事件: ${event.title}——请值班员 12 秒内做出处置决策`,
            "critical",
          );
          playAlarmBeep("caution");
        }
        if (crisisRef.current) {
          const remain = crisisRef.current.deadline - t;
          if (remain <= 0) {
            applyCrisisRef.current?.(0, true);
          } else {
            setCrisis((prev) => (prev && prev.remainS !== remain ? { ...prev, remainS: remain } : prev));
          }
        }

        // 气动黑障区窗口（ARES-1）: 链路中断 + 遥测冻结 + 字幕中断提示
        const bw = m.blackout;
        let lossNow = false;
        if (bw && curPhase === bw.phase) {
          const elapsed = flightSecsRef.current - phaseStartSec(m, bw.phase);
          lossNow = elapsed >= bw.startSec && elapsed < bw.startSec + bw.durationSec;
        }
        if (lossNow !== signalLossRef.current) {
          signalLossRef.current = lossNow;
          setSignalLoss(lossNow);
          if (commTimerRef.current !== null) {
            window.clearTimeout(commTimerRef.current);
            commTimerRef.current = null;
          }
          if (lossNow) {
            commQueueRef.current = [];
            commBusyRef.current = true;
            commIdRef.current += 1;
            setCommLine({ id: commIdRef.current, speaker: "SYSTEM · LINK", text: "——黑障区，信号中断——" });
            pushLog("COMM", "进入气动黑障区, 等离子体鞘套屏蔽无线电信号, 链路暂失", "caution");
          } else {
            commBusyRef.current = false;
            setCommLine(null);
            commQueueRef.current = [...(bw?.recoveryComm ?? [])];
            pushLog("COMM", "黑障区穿越完成, 信号恢复, 中继链路重建", "nominal");
          }
        }

        // 沙尘暴 / 酸雾状态机（useStorm 子 hook 每 tick 推进; 回放中冻结; 金星酸雾不走全球级升级路径）
        advanceStorm({
          t,
          mission: m,
          landed: curPhase === "landed",
          replaying: replayModeRef.current,
          roverOdo: roverOdoRef.current,
          weatherMult: challengeWeatherMultRef.current,
          pushLog,
          commQueueRef,
          unlockAchievement,
        });

        // ---- VNS-1 金星生存窗口倒计时（仅实时模式; 回放中不计时） ----
        if (
          m.id === "venus1" &&
          curPhase === "landed" &&
          !replayModeRef.current &&
          survivalRemainRef.current !== null &&
          !evacuatingRef.current
        ) {
          survivalRemainRef.current -= 1;
          const sRemain = Math.max(0, survivalRemainRef.current);
          setVenusSurvivalRemainS(sRemain);
          // ---- 热管理博弈：1Hz 热负载累计（钻探/行驶/酸雾升温, 静止散热且酸雾期散热减半） ----
          {
            const th = roverThermalRef.current;
            const hazeNow = dustStormActiveRef.current;
            let thermalDelta = 0;
            if (th.armActive) thermalDelta += THERMAL_DRILL_GAIN;
            else if (th.moving) thermalDelta += THERMAL_DRIVE_GAIN;
            if (hazeNow) thermalDelta += THERMAL_HAZE_GAIN;
            if (!th.armActive && !th.moving) thermalDelta -= hazeNow ? THERMAL_IDLE_LOSS / 2 : THERMAL_IDLE_LOSS;
            hullTempRef.current = Math.min(THERMAL_OVERHEAT_AT, Math.max(0, hullTempRef.current + thermalDelta));
            if (hullTempRef.current > thermalStatsRef.current.peak) {
              thermalStatsRef.current.peak = hullTempRef.current;
            }
            setHullTemp(Math.round(hullTempRef.current));
            if (!overheatLockRef.current && hullTempRef.current >= THERMAL_OVERHEAT_AT) {
              // 过热保护触发：锁巡视车全部动作（并入 evacLock 通道）, 条转红闪烁 + 告警播报
              overheatLockRef.current = true;
              setVenusOverheat(true);
              thermalStatsRef.current.overheat += 1;
              careerRef.current.overheatCount += 1;
              pushLog("GNC", "热负载冲破 100%——过热保护触发! 夸父一号全系统锁定, 静止散热降至 60% 以下方可解除", "critical");
              commQueueRef.current.push(...VNS_1_THERMAL_COMM);
              playAlarmBeep("critical");
              scheduleSave();
            } else if (overheatLockRef.current && hullTempRef.current <= THERMAL_RECOVER_AT) {
              // 过热解除：恢复巡视车动作 + 恢复播报
              overheatLockRef.current = false;
              setVenusOverheat(false);
              pushLog("GNC", "热负载回落至安全区间, 过热保护解除, 夸父一号恢复行驶与机械臂作业", "nominal");
              commQueueRef.current.push(...VNS_1_THERMAL_RECOVER_COMM);
            }
          }
          // 最后 30 秒: 每秒一声倒计时警报音（复用风暴倒计时音阶, ≤3s 变高急促）
          if (sRemain > 0 && sRemain <= VENUS_SURVIVAL_WARN_S) {
            playStormCountdownTick(sRemain);
            if (sRemain === VENUS_SURVIVAL_WARN_S) {
              pushLog("GNC", `生存窗口只剩最后 ${VENUS_SURVIVAL_WARN_S} 秒——上升发动机点火序列预置, 夸父一号准备撤离回收`, "critical");
              playAlarmBeep("critical");
            }
          }
          if (sRemain <= 0) {
            // 窗口归零: 紧急上升撤离——飞行时钟跳收尾段 / 巡视车锁定 / 结算自动出具 / 撤离剧本入队
            evacuatingRef.current = true;
            survivalRemainRef.current = null;
            setVenusEvacuating(true);
            setVenusSurvivalRemainS(null);
            flightSecsRef.current += 45;
            setFlightSecs(Math.floor(flightSecsRef.current));
            pushLog("GNC", "生存窗口归零——VNS-1 执行紧急上升撤离! 上升发动机点火, 夸父一号锁定回收, 样品舱密封确认", "critical");
            commQueueRef.current.push(...VNS_1_EVAC_COMM);
            commQueueRef.current.push({
              speaker: m.comm.speakers.bj,
              text: "金星表面不是久留之地——你们从炼狱带回了最有价值的样品。干得漂亮, VNS-1!",
            });
            // 金星专属成就: 撤离前完成 ≥3 件样品采集化验（登记册带 report 即算）
            const venusReports = Object.values(museumRef.current).filter(
              (e) => e.missionId === "venus1" && e.report,
            ).length;
            if (venusReports >= 3) unlockAchievement("venus_survivor");
            // 金星专属成就「冷静耐热」: 本生存窗口采满 3 件样品且全程未触发过热保护
            const venusCollected = Object.values(museumRef.current).filter(
              (e) => e.missionId === "venus1",
            ).length;
            if (venusCollected >= 3 && thermalStatsRef.current.overheat === 0) unlockAchievement("venus_cool_head");
            // 热管理冻结清零: 撤离后温度逻辑不再运行（thermalStats 保留至结算单消费）
            hullTempRef.current = 0;
            overheatLockRef.current = false;
            setHullTemp(0);
            setVenusOverheat(false);
            // 结算单自动出具（与着陆浮层关闭同一 debriefShown 通道, 延迟让撤离剧本先播）
            if (!debriefShownRef.current) {
              debriefShownRef.current = true;
              if (debriefTimerRef.current !== null) window.clearTimeout(debriefTimerRef.current);
              debriefTimerRef.current = window.setTimeout(() => {
                debriefTimerRef.current = null;
                if (replayModeRef.current) return;
                const evacData = buildDebriefRef.current?.();
                if (evacData) {
                  setDebriefData(evacData);
                  debriefOpenRef.current = true;
                  setDebriefOpen(true);
                }
              }, 6500);
            }
            // 每日挑战未完成而生存窗口归零: 本局挑战结束（不罚分, 不影响生涯连击）
            if (challengeRef.current && !challengeRef.current.done) endDailyChallenge();
            scheduleSave();
          }
        }

        // 表面专属事件状态机（月球微陨石雨 / 欧罗巴冰裂隙喷发 / 泰坦甲烷浓雾——useSurfaceEvents 子 hook
        // 每 tick 按当前天体推进; 回放中冻结; 横幅/干预脉冲/雾浓度镜像由子 hook 维护）
        advanceSurfaceEvents({
          t,
          mission: m,
          landed: curPhase === "landed",
          replaying: replayModeRef.current,
          weatherMult: challengeWeatherMultRef.current,
        });

        const mix =
          curPhase === "transfer"
            ? easeP("lin", progress)
            : curPhase === "braking" || curPhase === "descent" || curPhase === "touchdown" || curPhase === "landed"
              ? 1
              : 0;
        setMoonMix(mix);
        moonMixRef.current = mix;
      } else {
        if (countdownRef.current > 0) {
          countdownRef.current -= 1;
          setCountdownSecs(countdownRef.current);
        }
      }

      // 黑障区期间遥测数据冻结（保持上一秒读数）
      if (!signalLossRef.current) {
        const stormI = m.id === "ares1" || m.id === "venus1" ? dustIntensityRef.current : 0;
        const stormGlobalNow = globalStormRef.current && stormI > 0.02;
        const fogI = m.id === "titan1" ? fogLevelRef.current : 0;
        const nextMetrics = metricsRef.current.map((mm, i) => {
          const metricDef = m.metricDefs[i];
          let v = metricNow(metricDef, flightActiveRef.current, curPhase, progress, t);
          // 沙尘暴期间: 光照度骤降 / 下行速率下降 / 信号与母线电平衰减（全球级全面加剧）
          if (stormI > 0.02) {
            if (metricDef.key === "illumination") {
              // 全球级: 光照度跌破 40 W/m² 并剧烈抖动
              v = stormGlobalNow
                ? Math.min(39, Math.max(3, v * (1 - 0.93 * stormI) + (Math.random() - 0.5) * 22 * stormI))
                : v * (1 - 0.85 * stormI);
            } else if (metricDef.key === "downlink") {
              // 全球级: 速率骤降接近失联但不归零
              v *= stormGlobalNow ? 1 - 0.9 * stormI : 1 - 0.6 * stormI;
            } else if (metricDef.key === "signal") {
              v -= (stormGlobalNow ? 24 : 14) * stormI;
            } else if (metricDef.key === "power") {
              v -= (stormGlobalNow ? 5 : 4) * stormI;
              if (stormGlobalNow) v -= stormPowerDrainRef.current;
            }
          }
          // 泰坦甲烷浓雾期间: 下行速率 / 信号强度按雾浓度降额, 雾霾光学深度同步攀升
          if (fogI > 0.02) {
            if (metricDef.key === "downlink") {
              v *= 1 - 0.55 * fogI;
            } else if (metricDef.key === "signal") {
              v -= 12 * fogI;
            } else if (metricDef.key === "hazeDepth") {
              v += 9 * fogI;
            }
          }
          const series = [...mm.series, v];
          const nextMetric: TelemetryMetric = {
            ...mm,
            value: v,
            display: formatValue(v, metricDef.decimals),
            series: series.length > SERIES_CAP ? series.slice(series.length - SERIES_CAP) : series,
          };
          return nextMetric;
        });
        metricsRef.current = nextMetrics;
        setMetrics(nextMetrics);
      }

      setStationList((prev) => {
        const [rateMin, rateMax] = m.stationRateRange;
        const rateStep = Math.max(4, (rateMax - rateMin) * 0.045);
        // 沙尘暴期间地面站链路速率整体压降（全球级压得更狠, 接近失联）; 泰坦浓雾同比例压降
        const fogNow = m.id === "titan1" ? fogLevelRef.current : 0;
        const stormFactor =
          (dustStormActiveRef.current
            ? globalStormRef.current
              ? Math.max(0.05, 1 - 0.92 * dustIntensityRef.current)
              : 1 - 0.6 * dustIntensityRef.current
            : 1) * (fogNow > 0.02 ? 1 - 0.5 * fogNow : 1);
        return prev.map((s) => {
          if (Math.random() < 0.015) {
            const backOnline = !s.online;
            const toggled: GroundStation = {
              ...s,
              online: backOnline,
              linkRate: backOnline ? rateMin + Math.random() * (rateMax - rateMin) * 0.6 : 0,
            };
            return toggled;
          }
          if (!s.online) return s;
          const raw = Math.max(rateMin, Math.min(rateMax, s.linkRate + (Math.random() - 0.5) * rateStep));
          const rate = raw * stormFactor;
          const updated: GroundStation = { ...s, linkRate: rate };
          return updated;
        });
      });

      if (Math.random() < 0.55) {
        const pool = flightActiveRef.current ? (m.phaseEvents[curPhase] ?? m.standbyEvents) : m.standbyEvents;
        const item = pick(pool);
        pushLog(item.system, item.message, "nominal");
      }

      // 随机警报调度（CAUTION / CRITICAL, 可手动处置, 数秒后自动恢复兜底; 回放/黑障中不触发;
      // 区域沙尘暴期间暂停, 全球级风暴期间反而触发频率翻倍）
      const stormAlarmPause = dustStormActiveRef.current && !globalStormRef.current;
      if (
        !replayModeRef.current &&
        !signalLossRef.current &&
        !stormAlarmPause &&
        !alarmActiveRef.current &&
        t >= nextAlarmAtRef.current
      ) {
        alarmActiveRef.current = true;
        const goCritical = Math.random() < (globalStormRef.current ? 0.55 : 0.32);
        const source = goCritical ? pick(m.criticalPool) : pick(m.cautionPool);
        const level: Exclude<MissionLevel, "nominal"> = goCritical ? "critical" : "caution";
        const alarmNext: AlarmState = { metricKey: source.metricKey, level, message: source.message };
        alarmStateRef.current = alarmNext;
        alarmStartedAtRef.current = Date.now();
        const alarmClockText = stampFormat(
          flightActiveRef.current ? flightSecsRef.current : countdownRef.current,
          flightActiveRef.current,
        );
        setActiveAlarm(alarmNext);
        pushLog("ALARM", source.message, level);
        playAlarmBeep(level);
        const holdMs = 6000 + Math.random() * 4000;
        recoverTimerRef.current = window.setTimeout(() => {
          setActiveAlarm(null);
          alarmStateRef.current = null;
          alarmActiveRef.current = false;
          recoverTimerRef.current = null;
          alarmRecordsRef.current.push({
            level,
            desc: source.message,
            clock: alarmClockText,
            ackMode: "auto",
            durationMs: holdMs,
          });
          nextAlarmAtRef.current =
            runSecsRef.current + (globalStormRef.current ? 12 : 30) + Math.floor(Math.random() * 31);
          pushLog("SYS", "参数已回到标称范围, 系统自动恢复, 警报解除, 恢复常态监测", "nominal");
        }, holdMs);
      }

      // ---- 值班指令调度（非回放: 定期下发限时指令, 完成赚功勋升军衔; 单条 40% 概率升级为 3 环连环指令） ----
      if (!replayModeRef.current) {
        const dt0 = dutyTaskRef.current;
        if (!dt0 && t >= nextDutyAtRef.current) {
          issueDutyTask(t, null);
        } else if (dt0) {
          const progress = Math.max(0, dutyGetter(dt0.kind) - dt0.baseline);
          const remainS = Math.max(0, dt0.deadline - t);
          if (progress >= dt0.target) {
            dutyMeritRef.current += dt0.reward;
            setDutyMerit(dutyMeritRef.current);
            dutyDoneRef.current += 1;
            setDutyDoneCount(dutyDoneRef.current);
            playAckConfirm();
            const cPos = dt0.chainPos;
            const cLen = dt0.chainLen;
            const inChain = cPos !== undefined && cLen !== undefined;
            if (inChain && cPos < cLen) {
              // 连环未完: 立即下发下一环（无缝衔接, 不留空档）
              pushLog("DUTY", `连环指令第 ${cPos}/${cLen} 环完成: ${dt0.desc}——功勋 +${dt0.reward}, 下一环立即下发`, "nominal");
              if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
              issueDutyTask(t, { pos: cPos + 1, len: cLen, bonus: dt0.chainBonus ?? 0, prevKind: dt0.kind });
            } else {
              if (inChain && dt0.chainBonus) {
                dutyMeritRef.current += dt0.chainBonus;
                setDutyMerit(dutyMeritRef.current);
                pushLog("DUTY", `连环指令全环贯通! 追加功勋 +${dt0.chainBonus}——北京把你的名字记进了值班日志的金色一页`, "nominal");
              } else {
                pushLog("DUTY", `值班指令完成: ${dt0.desc}——功勋 +${dt0.reward}, 北京把你的表现记进了值班日志`, "nominal");
              }
              if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
              dutyTaskRef.current = null;
              setDutyTask(null);
              nextDutyAtRef.current = t + 50 + Math.floor(Math.random() * 55);
            }
          } else if (remainS <= 0) {
            if (dt0.chainPos !== undefined && dt0.chainLen !== undefined) {
              pushLog("DUTY", `连环指令在第 ${dt0.chainPos}/${dt0.chainLen} 环中断: ${dt0.desc} 超时——贯通奖励作废, 下一条连环再战`, "caution");
            } else {
              pushLog("DUTY", `值班指令超时未完成: ${dt0.desc}——错过一单不丢人, 下一单打起精神`, "caution");
            }
            dutyTaskRef.current = null;
            setDutyTask(null);
            nextDutyAtRef.current = t + 40 + Math.floor(Math.random() * 40);
          } else if (progress !== dt0.progress || remainS !== dt0.remainS) {
            dt0.progress = progress;
            dt0.remainS = remainS;
            setDutyTask({ ...dt0 });
          }
        }
      }

      // ---- 随机交互事件调度（流星雨观测窗口 / 突发紧急演练（可升级三连靶）/ 中继握手（可为干扰局）; 回放不触发） ----
      if (!replayModeRef.current) {
        // 流星雨：18s 观测窗口, 点击主视口流星记录赚功勋（14% 金色稀有流星 +15）, 单窗 ≥5 颗解锁 meteor_watcher
        if (!showerRef.current && t >= nextShowerAtRef.current) {
          showerRef.current = { deadline: t + 18, hits: 0, golds: 0 };
          setShower({ remainS: 18, hits: 0, golds: 0 });
          pushLog("OPT", "流星雨进入观测窗口——点击主视口中的流星即可记录（每颗 +3 功勋, 金色稀有流星 +15 起、连抓奖励递增, 单窗记录 5 颗有惊喜）", "nominal");
          commQueueRef.current.push({
            speaker: m.comm.speakers.bj,
            text: "注意, 流星雨正好过顶! 观测窗口 18 秒, 点着哪颗算哪颗——留意带金色光晕的稀有流星, 连着抓奖励还会往上翻!",
          });
        }
        if (showerRef.current) {
          const remain = showerRef.current.deadline - t;
          if (remain <= 0) {
            const { hits, golds } = showerRef.current;
            pushLog("OPT", `流星雨观测窗口关闭: 本窗共记录 ${hits} 颗流星${golds > 0 ? `（含金色稀有 ${golds} 颗）` : ""}${hits >= 5 ? "——数据极其宝贵, 北京通报表扬" : ""}`, "nominal");
            showerRef.current = null;
            setShower(null);
            nextShowerAtRef.current = t + scaledSurfaceGap(150, 150);
          } else {
            setShower((prev) => (prev && prev.remainS !== remain ? { ...prev, remainS: remain } : prev));
          }
        }
        // 突发紧急演练：随机位置 4s 点击窗口, 命中 +10 功勋; 35% 升级三连靶挑战（每靶 50% 为漂移移动靶, 移动组再 40% 为加速冲刺变体, 连中额外 +30 并解锁成就）
        if (!drillRef.current && t >= nextDrillAtRef.current) {
          const total = Math.random() < 0.35 ? 3 : 1;
          const moving = total > 1 && Math.random() < 0.5;
          const dash = moving && Math.random() < 0.4;
          const d = { deadline: t + 4, xPct: 12 + Math.random() * 70, yPct: 18 + Math.random() * 58, seq: 1, total, moving, dash };
          drillRef.current = d;
          setDrill({ xPct: d.xPct, yPct: d.yPct, remainS: 4, seq: 1, total, moving, dash });
          pushLog(
            "DUTY",
            total === 3
              ? `紧急演练升级: 三连靶挑战!${dash ? " 本组为加速冲刺靶——标靶高速游走, 盯紧落点果断出手" : moving ? " 本组为漂移移动靶——标靶会游走, 预判着点" : ""} 每靶限时 4 秒, 三连全中额外 +30 功勋`
              : "突发紧急演练! 4 秒内点击主视口中弹出的演练标靶",
            "caution",
          );
          playAlarmBeep("caution");
        }
        if (drillRef.current) {
          const remain = drillRef.current.deadline - t;
          if (remain <= 0) {
            const d0 = drillRef.current;
            pushLog(
              "DUTY",
              d0.total > 1 && d0.seq > 1
                ? `三连靶挑战中断（命中 ${d0.seq - 1}/${d0.total}）——北京记了一笔: 差一点就全中, 反应速度有待加强`
                : "演练标靶超时未响应——北京记了一笔: 值班反应速度有待加强",
              "caution",
            );
            drillRef.current = null;
            setDrill(null);
            nextDrillAtRef.current = t + scaledSurfaceGap(80, 80);
          } else {
            setDrill((prev) => (prev && prev.remainS !== remain ? { ...prev, remainS: remain } : prev));
          }
        }
        // 中继握手请求：12s 窗口内长按 2s 完成链路校准（+20 功勋）; 40% 为信号干扰局（进度被打回, +30 功勋）
        if (!handshakeRef.current && t >= nextHandshakeAtRef.current && !crisisRef.current) {
          const jam = Math.random() < 0.4;
          handshakeRef.current = { deadline: t + 12, interference: jam };
          setHandshake({ remainS: 12, interference: jam });
          pushLog(
            "COMM",
            jam
              ? "中继星请求手动链路校准——链路正被噪声干扰, 长按要顶住进度回砸（+30 功勋）, 响应窗口 12 秒"
              : "中继星请求手动链路握手校准——长按 2s 完成 (+20 功勋), 响应窗口 12 秒",
            "nominal",
          );
        }
        if (handshakeRef.current) {
          const remain = handshakeRef.current.deadline - t;
          if (remain <= 0) {
            pushLog("COMM", "握手窗口关闭, 中继星转入自动校准——错过这次有点可惜", "caution");
            handshakeRef.current = null;
            setHandshake(null);
            nextHandshakeAtRef.current = t + scaledSurfaceGap(110, 110);
          } else {
            setHandshake((prev) => (prev && prev.remainS !== remain ? { ...prev, remainS: remain } : prev));
          }
        }
        // ---- 第三十二轮新玩法调度（卡片类互斥: 场上已有危机/握手/演练/其它卡时不弹新卡） ----
        const cardsBusy =
          crisisRef.current || handshakeRef.current || drillRef.current || diagRef.current || quizRef.current || antennaRef.current;
        // 系统诊断快检：记忆灯序复点（六步灯序, 24s 窗口, 全对 +35 功勋, 累计 3 次满序解锁 diag_ace; 假灯强度随满序次数上升 0.35→0.75;
        // 满序 ≥3 次的老手 30% 触发盲灯极速模式——八步灯序+演示倍速, 26s 窗口, 全对 +60）
        if (!diagRef.current && t >= nextDiagAtRef.current && !cardsBusy) {
          const decoyRate = Math.min(0.75, 0.35 + diagWinRef.current * 0.08);
          const extreme = diagWinRef.current >= 3 && Math.random() < 0.3;
          diagRef.current = { deadline: t + (extreme ? 26 : 24), extreme };
          // 老手提示：满序 ≥2 次的玩家在卡面明示「真灯带辉光」彩蛋, 新手留给自己发现
          setDiag({ remainS: extreme ? 26 : 24, decoyRate, hintGlow: diagWinRef.current >= 2, extreme });
          pushLog(
            "SYS",
            extreme
              ? "诊断快检升级——盲灯极速模式! 八步灯序加倍速演示, 照序点回（+60 功勋）, 响应窗口 26 秒。北京: 老手就该加点难度"
              : `值班系统请求全链路诊断快检——记住六步灯序并照序点回（+35 功勋）${
                  diagWinRef.current > 0 ? `, 干扰假灯强度 Lv.${Math.min(5, diagWinRef.current) + 1}（越熟练假灯越凶）` : ""
                }, 响应窗口 24 秒`,
            "nominal",
          );
          playAlarmBeep("caution");
        }
        if (diagRef.current) {
          const remain = diagRef.current.deadline - t;
          if (remain <= 0) {
            pushLog("SYS", "诊断快检窗口超时, 巡检转自动模式——错过一次练手的机会", "caution");
            diagRef.current = null;
            setDiag(null);
            nextDiagAtRef.current = t + scaledSurfaceGap(140, 110);
          } else {
            setDiag((prev) => (prev && prev.remainS !== remain ? { ...prev, remainS: remain } : prev));
          }
        }
        // 北京呼号抽问：四选一应答（12s 窗口, 答对 +20 功勋, 累计 3 次答对解锁 quiz_ace）
        if (!quizRef.current && t >= nextQuizAtRef.current && !cardsBusy) {
          const question = rollQuiz();
          quizIdRef.current += 1;
          quizChainRef.current = 0;
          quizRef.current = { id: quizIdRef.current, deadline: t + 12, question };
          setQuiz({ id: quizIdRef.current, question, remainS: 12 });
          pushLog("COMM", "北京发起呼号抽问——值班通话守则随堂考, 四选一挑出规范应答（+20 功勋）, 窗口 12 秒", "nominal");
          playAlarmBeep("caution");
        }
        if (quizRef.current) {
          const remain = quizRef.current.deadline - t;
          if (remain <= 0) {
            quizStreakRef.current = 0;
            quizChainRef.current = 0;
            pushLog("COMM", "呼号抽问超时未应答, 连对计数清零——北京: 守则抄读十遍, 下次抽问还考", "caution");
            quizRef.current = null;
            setQuiz(null);
            nextQuizAtRef.current = t + scaledSurfaceGap(160, 120);
          } else {
            setQuiz((prev) => (prev && prev.remainS !== remain ? { ...prev, remainS: remain } : prev));
          }
        }
        // 中继天线三段对准：时机盘三段全锁 +30 功勋（15s 窗口, 锁偏一发即失败; 40% 反转干扰局指针倒转, 30% 双针干扰局）
        if (!antennaRef.current && t >= nextAntennaAtRef.current && !cardsBusy) {
          const rev = Math.random() < 0.4;
          const dual = Math.random() < 0.3;
          antennaRef.current = { deadline: t + 15, reverse: rev, dual };
          setAntenna({ remainS: 15, reverse: rev, dual });
          pushLog(
            "COMM",
            `中继天线需要手动对准——指针扫进高亮扇区时锁定, 三段全锁接通链路（+30 功勋）, 窗口 15 秒${
              rev && dual
                ? "。注意: 指向机构卡滞指针反转, 盘面还叠了一根干扰副针, 目标扇区也在缓慢漂移——追着亮区打!"
                : rev
                  ? "。注意: 指向机构卡滞, 本次指针反转!"
                  : dual
                    ? "。注意: 盘面叠了一根干扰副针, 目标扇区还会缓慢漂移——判定只认实色主针, 追着亮区打"
                    : ""
            }`,
            "nominal",
          );
          playAlarmBeep("caution");
        }
        if (antennaRef.current) {
          const remain = antennaRef.current.deadline - t;
          if (remain <= 0) {
            pushLog("COMM", "天线对准窗口超时, 指向机构转自动跟踪——手动对准的机会溜走了", "caution");
            antennaRef.current = null;
            setAntenna(null);
            nextAntennaAtRef.current = t + scaledSurfaceGap(180, 130);
          } else {
            setAntenna((prev) => (prev && prev.remainS !== remain ? { ...prev, remainS: remain } : prev));
          }
        }
        // 极光观测窗口：20s 内点击星野中的极光带记录光谱（每段 +10 功勋, 单窗上限 3 段; 20% 为红色罕见极光, 每段 +20; 与流星雨错峰）
        if (!auroraRef.current && t >= nextAuroraAtRef.current && !showerRef.current) {
          const rareA = Math.random() < 0.2;
          auroraRef.current = { deadline: t + 20, hits: 0, rare: rareA, wished: false };
          setAurora({ remainS: 20, hits: 0, rare: rareA, wished: false });
          pushLog(
            "OPT",
            rareA
              ? "极光活动警报——罕见红色极光! 高层大气亮起血红光幕, 还伴着密集流星余迹, 光谱价值翻倍（每段 +20 功勋）! 20 秒窗口, 点击光幕带记录, 上限 3 段"
              : "极光活动警报! 高层大气亮起极光带——20 秒观测窗口, 点击画面里的极光带记录光谱（每段 +10 功勋, 上限 3 段）, 天际偶有流星伴生, 光幕间还会浮现古人的星座连线",
            "nominal",
          );
          playAuroraChime(rareA);
        }
        if (auroraRef.current) {
          const remain = auroraRef.current.deadline - t;
          if (remain <= 0) {
            const hits = auroraRef.current.hits;
            const wasRare = auroraRef.current.rare;
            pushLog("OPT", `极光观测窗口关闭: 共记录 ${hits}/3 段${wasRare ? "红色罕见" : ""}光谱${hits >= 3 ? "——磁层活动数据完整, 北京通报表扬" : ""}`, "nominal");
            auroraRef.current = null;
            setAurora(null);
            nextAuroraAtRef.current = t + scaledSurfaceGap(200, 200);
          } else {
            setAurora((prev) => (prev && prev.remainS !== remain ? { ...prev, remainS: remain } : prev));
          }
        }
      }

      // 字幕状态机: 队列有句就逐句播, 待发射常态偶发抽一句例行通话（回放/黑障中不触发）
      if (!replayModeRef.current && !signalLossRef.current && commVisibleRef.current && !commBusyRef.current) {
        if (commQueueRef.current.length === 0 && !flightActiveRef.current && Math.random() < 0.12) {
          commQueueRef.current.push(pick(m.comm.standbyPool));
        }
        const nextLine = commQueueRef.current.shift();
        if (nextLine) {
          commBusyRef.current = true;
          commIdRef.current += 1;
          setCommLine({ id: commIdRef.current, speaker: nextLine.speaker, text: nextLine.text });
          const holdMs = 2600 + nextLine.text.length * 55;
          if (commTimerRef.current !== null) window.clearTimeout(commTimerRef.current);
          commTimerRef.current = window.setTimeout(() => {
            setCommLine(null);
            commBusyRef.current = false;
            commTimerRef.current = null;
          }, holdMs);
        }
      }
    }, 1000);

    return () => {
      window.clearInterval(tick);
      if (recoverTimerRef.current !== null) window.clearTimeout(recoverTimerRef.current);
      if (commTimerRef.current !== null) window.clearTimeout(commTimerRef.current);
    };
  }, [bootDone, pushLog]);

  // ESC: 任务简报最外层先关, 其后回放模式优先退出回放, 否则依次关成就墙 / 样品厅(厅内报告先关) / 样品报告 / 指标详情浮层
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (guideOpenRef.current) {
        guideOpenRef.current = false;
        setGuideOpen(false);
        return;
      }
      if (briefingOpenRef.current) {
        briefingOpenRef.current = false;
        setBriefingOpen(false);
        return;
      }
      if (replayModeRef.current) {
        exitReplay();
        return;
      }
      if (wallOpenRef.current) {
        wallOpenRef.current = false;
        setAchievementWallOpen(false);
        return;
      }
      if (overviewOpenRef.current) {
        overviewOpenRef.current = false;
        setOverviewOpen(false);
        return;
      }
      // 生涯统计弹层：ESC 链插在任务总览之后
      if (careerOpenRef.current) {
        closeCareer();
        return;
      }
      // 每日挑战弹层：ESC 链插在生涯统计之后
      if (dailyOpenRef.current) {
        closeDaily();
        return;
      }
      if (debriefOpenRef.current) {
        debriefOpenRef.current = false;
        setDebriefOpen(false);
        return;
      }
      if (museumOpenRef.current) {
        if (museumReportRef.current) {
          museumReportRef.current = false;
          setMuseumReport(null);
          return;
        }
        museumOpenRef.current = false;
        setMuseumOpen(false);
        return;
      }
      if (sampleReportOpenRef.current) {
        closeSampleReportRef.current?.();
        return;
      }
      setSelectedMetricKey(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 弹层开关与 rover.closeSampleReport 经 ref 转发（ESC 处理闭包用; careerOpenRef 在 useCareer 子 hook 内）
  const wallOpenRef = useRef(false);
  const overviewOpenRef = useRef(false);
  const museumOpenRef = useRef(false);
  const museumReportRef = useRef(false);
  const sampleReportOpenRef = useRef(false);
  const closeSampleReportRef = useRef<(() => void) | null>(null);

  // 动效导览弹层开关 + 减弱动画全局开关
  const openGuide = () => {
    guideOpenRef.current = true;
    setGuideOpen(true);
  };
  const closeGuide = () => {
    guideOpenRef.current = false;
    setGuideOpen(false);
  };
  // 减弱动画偏好随存档持久化（ref 镜像供写档快照读取）
  const toggleReducedMotion = () => {
    const next = !reducedMotionRef.current;
    reducedMotionRef.current = next;
    setReducedMotion(next);
    scheduleSave();
  };

  // 巡视车遥控（着陆解锁, 回放中挂起；采样汇报经字幕队列播报）
  const pushComm = useCallback((lines: CommLine[]) => {
    commQueueRef.current.push(...lines);
  }, []);

  const craterNamer = useCallback((id: number) => craterNameAt(missionRef.current, id), []);

  const rover = useRover({
    unlocked: phaseId === "landed" && flightActive,
    suspended: replayMode,
    pushLog,
    pushComm,
    roverCfg: def.rover,
    craterNamer,
    speakers: { bj: def.comm.speakers.bj, cdre: def.comm.speakers.cdre },
    missionId: def.id,
    unlockAchievement,
    stormIntensity: dustIntensity,
    stormGlobal: globalStormActive,
    // 金星生存窗口内巡视车耗电 ×1.5（高温散热全功率）; 撤离 / 过热保护时锁定禁驶（并入全球风暴强制停车通道）
    powerMult: activeMissionId === "venus1" && venusSurvivalRemainS !== null ? VENUS_EVAC_POWER_MULT : 1,
    // 微陨石近失 1.5s 动作锁并入强制停车通道（与金星撤离/过热保护同一机制）
    evacLock: venusEvacuating || venusOverheat || meteorLockActive,
    // 月球微陨石雨 / 欧罗巴冰裂隙喷发干预脉冲 + 新鲜冰晶窗口 S 级保底标记
    armSetbackPulse,
    interruptPulse,
    forceGradeS: freshIceActive,
    // 泰坦浓雾遮蔽光学遥感（采样日志预测评级显示「???」）
    fogBlind: fogActive,
    initialRallyBests: initialSave?.rallyBests,
  });

  // 巡视里程回传给沙尘暴调度（里程达阈值后触发概率上浮）
  useEffect(() => {
    roverOdoRef.current = rover.roverSnap.odometer;
  }, [rover.roverSnap.odometer]);

  // 巡视车动作镜像（金星热负载累计: 机械臂作业 / 行驶状态, tick 闭包只读稳定 ref）
  useEffect(() => {
    roverThermalRef.current = {
      armActive: rover.roverSnap.armPhase !== "idle",
      moving: rover.roverSnap.moving,
    };
  }, [rover.roverSnap.armPhase, rover.roverSnap.moving]);

  // ---- 金星热管理博弈：应急散热（主动决策, 热负载立降 35 / 生存窗口 -15s, <20 禁用） ----
  const thermalWindowActive = activeMissionId === "venus1" && venusSurvivalRemainS !== null && !venusEvacuating;
  const emergencyCooling = useCallback(() => {
    if (missionRef.current.id !== "venus1") return;
    if (survivalRemainRef.current === null || evacuatingRef.current) return;
    if (hullTempRef.current < THERMAL_COOLING_MIN) return;
    hullTempRef.current = Math.max(0, hullTempRef.current - THERMAL_COOLING_DROP);
    setHullTemp(Math.round(hullTempRef.current));
    thermalStatsRef.current.cooling += 1;
    careerRef.current.coolingUsed += 1;
    survivalRemainRef.current = Math.max(0, survivalRemainRef.current - THERMAL_COOLING_COST_S);
    setVenusSurvivalRemainS(survivalRemainRef.current);
    pushLog(
      "GNC",
      `应急散热执行——热负载立降 ${THERMAL_COOLING_DROP} 点至 ${Math.round(hullTempRef.current)}%, 生存窗口消耗 ${THERMAL_COOLING_COST_S} 秒, 剩余 ${survivalRemainRef.current} 秒`,
      "caution",
    );
    commQueueRef.current.push(...VNS_1_COOLING_COMM);
    playAckConfirm();
    scheduleSave();
  }, [pushLog, scheduleSave]);

  // 巡视车侧计数镜像（值班指令进度判定用, tick 闭包只读稳定 ref）
  useEffect(() => {
    roverUnlockedRef.current = rover.roverUnlocked;
  }, [rover.roverUnlocked]);
  useEffect(() => {
    roverSampleCountRef.current = rover.sampleList.length;
  }, [rover.sampleList.length]);
  useEffect(() => {
    roverReportsCountRef.current = Object.keys(rover.sampleReports).length;
  }, [rover.sampleReports]);

  /* ---------------- 样品博物馆陈列厅（跨任务登记册） ---------------- */

  // 登记同步：样品入舱 / 化验出报告即合并进跨任务登记册（任务切换重置 rover 态不清空登记册）
  useEffect(() => {
    let changed = false;
    let newSamples = 0;
    let newReports = 0;
    let newSGrade = 0;
    let newOcean = 0;
    let newFogSamples = 0;
    const next: Record<string, MuseumSampleEntry> = { ...museumRef.current };
    for (const s of rover.sampleList) {
      const key = `${activeMissionId}:${s.id}`;
      if (!next[key]) {
        next[key] = {
          key,
          missionId: activeMissionId,
          missionBadge: MISSIONS[activeMissionId].badge,
          sampleId: s.id,
          code: s.code,
          siteName: s.siteName,
          report: null,
        };
        changed = true;
        newSamples += 1;
        // 新鲜冰晶窗口采集的样品入册（「冰泉猎手」追踪: 化验出 S 级报告时解锁）
        if (s.forceGrade === "S" && activeMissionId === "europa1") freshIceCodesRef.current.add(s.code);
        // 泰坦浓雾期间采回的样品: 本场计数（「雾岸行者」判定）+ 生涯累计
        if (activeMissionId === "titan1" && fogLevelRef.current >= FOG_FULL_LEVEL) {
          fogSampledRef.current += 1;
          newFogSamples += 1;
        }
        // 每日挑战「配额采集」计数（挑战进行中的新入舱样品）
        if (challengeRef.current && !challengeRef.current.done && challengeRef.current.missionId === activeMissionId) {
          challengeRef.current.quota += 1;
        }
      }
    }
    for (const idText of Object.keys(rover.sampleReports)) {
      const key = `${activeMissionId}:${idText}`;
      const entry = next[key];
      if (entry && !entry.report) {
        const report = rover.sampleReports[Number(idText)];
        next[key] = { ...entry, report };
        changed = true;
        newReports += 1;
        if (report.grade === "S") newSGrade += 1;
        if (report.oceanWater) newOcean += 1;
        // 成就「冰泉猎手」: 新鲜冰晶窗口内采集的样品化验出 S 级报告
        if (report.grade === "S" && freshIceCodesRef.current.has(entry.code)) {
          freshIceCodesRef.current.delete(entry.code);
          unlockAchievement("europa_geyser_chaser");
        }
      }
    }
    if (changed) {
      museumRef.current = next;
      setMuseumSamples(next);
      // 生涯计数：样品登记 / 化验累计（样品登记 = 存点, 随存档持久化）
      const career = careerRef.current;
      career.samples += newSamples;
      career.analyzed += newReports;
      career.sGrade += newSGrade;
      career.ocean += newOcean;
      career.fogSamples += newFogSamples;
      scheduleSave();
    }
    // 每日挑战「配额采集」: 已软着陆 + 采满 3 件样品 → 挑战达成
    const chNow = challengeRef.current;
    if (chNow && !chNow.done && chNow.landedOk && chNow.modIds.includes("quota_collection") && chNow.quota >= DAILY_QUOTA) {
      completeDailyChallenge();
    }
  }, [rover.sampleList, rover.sampleReports, activeMissionId, scheduleSave, completeDailyChallenge, unlockAchievement]);

  // 拉力赛三航线最佳镜像：rover 侧纪录刷新即回写存档镜像并调度写盘（纪录刷新 = 存点）
  useEffect(() => {
    const rb = rallyBestsRef.current;
    if (rb.std === rover.rallyBestS && rb.rev === rover.rallyBestRevS && rb.night === rover.rallyBestNightS) return;
    rallyBestsRef.current = { std: rover.rallyBestS, rev: rover.rallyBestRevS, night: rover.rallyBestNightS };
    scheduleSave();
  }, [rover.rallyBestS, rover.rallyBestRevS, rover.rallyBestNightS, scheduleSave]);

  // 生涯驾驶累计 + 生涯统计弹层：拆至 useCareer 子 hook（careerRef 计数器本体仍由本 hook 持有, 剧情触发点直接累加）
  const driveStatsNow = rover.getDriveStats();
  const {
    careerOpen,
    careerSnap,
    careerOpenRef,
    setCareerSnap,
    buildCareerSnapshot,
    openCareer,
    closeCareer,
    resetCareerProgress,
  } = useCareer({
    careerRef,
    dutyMeritRef,
    dutyDoneRef,
    achievementMapRef,
    rallyBestsRef,
    saveMetaRef,
    driveInput: {
      odometer: rover.roverSnap.odometer,
      spinSecs: driveStatsNow.spinSecs,
      photos: driveStatsNow.photos,
    },
    scheduleSave,
  });

  // 展厅开关：陈列 ≥5 件样品时打开解锁「馆长」成就；开厅时结算 S 级入馆光柱仪式
  const openMuseum = useCallback(() => {
    museumOpenRef.current = true;
    museumOpenCountRef.current += 1;
    setMuseumOpen(true);
    if (Object.keys(museumRef.current).length >= 5) unlockAchievement("curator");
    // 彩蛋: 陈列规模翻倍到 10 件 → 荣誉馆长
    if (Object.keys(museumRef.current).length >= 10) unlockAchievement("grand_curator");
    // 计算本次进厅「新入馆」的 S 级藏品（已化验 grade==='S' 且本会话尚未庆祝过），
    // 立即记入登记册避免下次重播；仪式纯视觉，不触发成就、不插日志
    const freshSKeys: string[] = [];
    for (const entry of Object.values(museumRef.current)) {
      if (entry.report?.grade === "S" && !celebratedKeysRef.current.has(entry.key)) {
        celebratedKeysRef.current.add(entry.key);
        freshSKeys.push(entry.key);
      }
    }
    setMuseumCelebrateKeys(freshSKeys);
  }, [unlockAchievement]);
  const closeMuseum = useCallback(() => {
    museumOpenRef.current = false;
    setMuseumOpen(false);
    setMuseumCelebrateKeys([]);
  }, []);
  const openMuseumReport = useCallback((entry: MuseumSampleEntry) => {
    if (!entry.report) return;
    museumReportRef.current = true;
    setMuseumReport({
      sample: { id: entry.sampleId, code: entry.code, siteName: entry.siteName },
      report: entry.report,
    });
  }, []);
  const closeMuseumReport = useCallback(() => {
    museumReportRef.current = false;
    setMuseumReport(null);
  }, []);

  const museumEntries = MISSION_ORDER.flatMap((id) =>
    Object.values(museumSamples)
      .filter((e) => e.missionId === id)
      .sort((a, b) => a.sampleId - b.sampleId),
  );

  // 成就墙开关（ref 同步给 ESC 处理闭包）
  const openAchievementWall = useCallback(() => {
    wallOpenRef.current = true;
    wallOpenCountRef.current += 1;
    setAchievementWallOpen(true);
  }, []);
  const closeAchievementWall = useCallback(() => {
    wallOpenRef.current = false;
    setAchievementWallOpen(false);
  }, []);

  // 任务进度总览弹层开关（ref 同步给 ESC 处理闭包）
  const openOverview = useCallback(() => {
    overviewOpenRef.current = true;
    setOverviewOpen(true);
  }, []);
  const closeOverview = useCallback(() => {
    overviewOpenRef.current = false;
    setOverviewOpen(false);
  }, []);

  /* ---------------- 生涯统计弹层（快照构建 / 开关拆至 useCareer 子 hook） ---------------- */

  // rover.clearRallyBests 经 ref 转发（清除存档时联动归零拉力纪录, 避免依赖环）
  const clearRallyBestsRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    clearRallyBestsRef.current = rover.clearRallyBests;
  }, [rover.clearRallyBests]);

  /** 清除存档（生涯弹层两段确认后调用）：删 localStorage + 复位全部对应内存态 + caution 日志 */
  const clearSave = useCallback(() => {
    clearDscSave();
    markSaveCleared();
    resetAchievements();
    museumRef.current = {};
    setMuseumSamples({});
    celebratedKeysRef.current = new Set();
    debriefBestRef.current = {};
    landedMissionsRef.current = new Set();
    setLandedMissions([]);
    playBestRef.current = {};
    quizChainBestRef.current = 0;
    dutyMeritRef.current = 0;
    setDutyMerit(0);
    dutyDoneRef.current = 0;
    setDutyDoneCount(0);
    resetCareerProgress();
    setDailyDoneToday(false);
    // 音频偏好一并恢复缺省（音效开 / BGM 开 / 音量 0.5, 同步进音频模块）
    audioPrefsRef.current = defaultAudioPrefs();
    setSoundOn(true);
    setBgmOn(true);
    setBgmVolume(0.5);
    setAudioMuted(false);
    setAmbientEnabled(true);
    setAmbientVolume(0.5);
    rallyBestsRef.current = { std: null, rev: null, night: null };
    clearRallyBestsRef.current?.();
    reducedMotionRef.current = false;
    setReducedMotion(false);
    setCareerSnap(buildCareerSnapshot());
    pushLog("ARCHIVE", "本地存档已清除——成就墙、样品登记册、历史最佳与生涯统计全部归零, 从下一次点火重新记档", "caution");
  }, [buildCareerSnapshot, pushLog, markSaveCleared, resetAchievements, resetCareerProgress]);

  // 任务进度总览数据：三条任务各自的着陆 / 采样 / 化验 / 成就进度（跨任务内存态派生, 打开即最新）
  const missionProgress = MISSION_ORDER.map((id) => {
    const entries = museumEntries.filter((e) => e.missionId === id);
    const reported = entries.filter((e) => e.report);
    const special =
      id === "ares1"
        ? { label: "完整经历全球级沙尘暴", done: !!achievementMap["apocalypse"] }
        : id === "europa1"
          ? { label: "提取冰下海洋水样", done: !!achievementMap["ocean_sample"] }
          : id === "venus1"
            ? { label: "生存窗口内执行紧急上升撤离", done: venusEvacuating || !!achievementMap["venus_survivor"] }
            : id === "titan1"
              ? { label: "浓雾中采回碳氢样品", done: !!achievementMap["titan_fog_walker"] }
              : { label: "完成两条不同任务着陆", done: !!achievementMap["dual_landing"] };
    return {
      id,
      code: MISSIONS[id].code,
      title: MISSIONS[id].title,
      badge: MISSIONS[id].badge,
      landed: landedMissions.includes(id),
      inProgress: activeMissionId === id && flightActive && !landedMissions.includes(id),
      samples: entries.length,
      analyzed: reported.length,
      sGrade: reported.filter((e) => e.report?.grade === "S").length,
      oceanWater: reported.filter((e) => e.report?.oceanWater).length,
      achievements: Object.values(achievementMap).filter((r) => r.missionId === id).length,
      special,
    };
  });

  // 样品报告弹层状态经 ref 转发（ESC 关闭用）
  useEffect(() => {
    sampleReportOpenRef.current = rover.activeReport !== null;
    closeSampleReportRef.current = rover.closeSampleReport;
  }, [rover.activeReport, rover.closeSampleReport]);

  /* ---------------- 任务切换（仅待发射可用, 切换即全量重置） ---------------- */

  const missionSwitchable = bootDone && !flightActive && !replayMode && phaseId === "standby";

  const switchMission = useCallback(
    (id: MissionId, force = false) => {
      const sameMission = missionRef.current.id === id;
      if (force) {
        // 强制重新部署（着陆后归档回待发射）: 回放中仍禁止
        if (replayModeRef.current) return;
      } else {
        if (sameMission) return;
        // 点火后 / 回放中 / 巡视车解锁后禁止切换
        if (flightActiveRef.current || replayModeRef.current || phaseRef.current !== "standby") return;
      }
      const next = MISSIONS[id];
      missionRef.current = next;
      setActiveMissionId(id);

      // 时钟回 T-
      countdownRef.current = T_MINUS_START;
      setCountdownSecs(T_MINUS_START);
      flightSecsRef.current = 0;
      setFlightSecs(0);
      flightActiveRef.current = false;
      setFlightActive(false);
      if (skipAnimRef.current !== null) {
        window.clearInterval(skipAnimRef.current);
        skipAnimRef.current = null;
      }
      phaseRef.current = "standby";
      setPhaseId("standby");
      moonMixRef.current = 0;
      setMoonMix(0);

      // 遥测按新任务曲线重建
      metricsRef.current = buildInitialMetrics(next);
      setMetrics(metricsRef.current);

      // 日志清空 + 重插上电检查
      recLogRef.current = [];
      recLogCountRef.current = 0;
      logIdRef.current = 1;
      setLogEntries([]);
      if (force && sameMission) {
        pushLog("SYS", `本场出击归档——${next.code} 重新部署回待发射, 顶栏任务下拉可切换下一颗天体`, "nominal");
      } else {
        pushLog("SYS", `任务档案切换至 ${next.code} ${next.title}`, "nominal");
      }
      pushLog("SYS", `全系统上电完成, ${next.code} 进入射前常态监测`, "nominal");
      pushLog("LAUNCH", "发射窗口锁定, 等待点火指令", "nominal");

      // 回放帧清空 + 机位复位（子 hook 全量复位）
      resetReplayState();
      recordingDoneRef.current = false;
      phaseMarksRef.current = [];
      alarmRecordsRef.current = [];

      // 警报状态复位
      if (recoverTimerRef.current !== null) {
        window.clearTimeout(recoverTimerRef.current);
        recoverTimerRef.current = null;
      }
      stopAlarmBeep();
      alarmActiveRef.current = false;
      alarmStateRef.current = null;
      setActiveAlarm(null);
      setAckCount(0);
      ackTotalRef.current = 0;
      nextAlarmAtRef.current = runSecsRef.current + 20 + Math.floor(Math.random() * 20);

      // 黑障区状态复位
      signalLossRef.current = false;
      setSignalLoss(false);

      // 沙尘暴状态复位（含全球级升级路径; 子 hook 全量复位, 会话级风暴计数保留）
      resetStorm();
      roverOdoRef.current = 0;

      // 金星生存窗口复位（倒计时 / 撤离锁定全部归零）
      survivalRemainRef.current = null;
      evacuatingRef.current = false;
      setVenusSurvivalRemainS(null);
      setVenusEvacuating(false);

      // 金星热管理复位（热负载 / 过热锁 / 本局统计全部归零）
      hullTempRef.current = 0;
      overheatLockRef.current = false;
      thermalStatsRef.current = { overheat: 0, cooling: 0, peak: 0 };
      setHullTemp(0);
      setVenusOverheat(false);

      // 表面专属事件复位（微陨石雨 / 冰裂隙喷发 / 甲烷浓雾状态机 + 横幅 + 干预锁, 子 hook 内聚归零）
      resetSurfaceEvents();
      freshIceCodesRef.current = new Set();

      // 中途切任务 = 本局每日挑战结束（不罚分, 不影响生涯连击; 子 hook 内聚复位）
      endDailyChallenge();

      // 字幕队列清空
      commQueueRef.current = [];
      if (commTimerRef.current !== null) {
        window.clearTimeout(commTimerRef.current);
        commTimerRef.current = null;
      }
      commBusyRef.current = false;
      setCommLine(null);

      // 地面站按新任务重建
      setStationList(cloneStations(next));

      // 点火安全盖合上
      setCoverOpen(false);
      setSelectedMetricKey(null);
      setLandingVisible(false);

      // 玩法系统复位：手动着陆/突发事件/结算单/值班指令（功勋与军衔跨任务保留）
      manualOfferedRef.current = false;
      manualGradeRef.current = null;
      flightPausedRef.current = false;
      setManualLandingOpen(false);
      crisisRef.current = null;
      setCrisis(null);
      crisisStatsRef.current = { good: 0, total: 0 };
      crisisAftermathRef.current = null;
      crisisChainRef.current = { count: 0, good: 0 };
      showerRef.current = null;
      setShower(null);
      nextShowerAtRef.current = runSecsRef.current + 70 + Math.floor(Math.random() * 90);
      drillRef.current = null;
      setDrill(null);
      drillCountRef.current = 0;
      nextDrillAtRef.current = runSecsRef.current + 90 + Math.floor(Math.random() * 70);
      handshakeRef.current = null;
      setHandshake(null);
      nextHandshakeAtRef.current = runSecsRef.current + 120 + Math.floor(Math.random() * 100);
      diagRef.current = null;
      setDiag(null);
      diagWinRef.current = 0;
      nextDiagAtRef.current = runSecsRef.current + 150 + Math.floor(Math.random() * 120);
      quizRef.current = null;
      setQuiz(null);
      quizWinRef.current = 0;
      quizStreakRef.current = 0;
      playStatsRef.current = { meteors: 0, golds: 0, drills: 0, handshakes: 0, diags: 0, quizzes: 0, antennas: 0, auroras: 0 };
      nextQuizAtRef.current = runSecsRef.current + 180 + Math.floor(Math.random() * 130);
      antennaRef.current = null;
      setAntenna(null);
      nextAntennaAtRef.current = runSecsRef.current + 210 + Math.floor(Math.random() * 140);
      auroraRef.current = null;
      setAurora(null);
      nextAuroraAtRef.current = runSecsRef.current + 120 + Math.floor(Math.random() * 160);
      nextCrisisAtRef.current = Number.POSITIVE_INFINITY;
      debriefShownRef.current = false;
      if (debriefTimerRef.current !== null) {
        window.clearTimeout(debriefTimerRef.current);
        debriefTimerRef.current = null;
      }
      debriefOpenRef.current = false;
      setDebriefOpen(false);
      setDebriefData(null);
      dutyTaskRef.current = null;
      setDutyTask(null);
      nextDutyAtRef.current = runSecsRef.current + 30;

      // 巡视车归位锁定 + 样品清空
      resetRoverRef.current?.();
    },
    [pushLog],
  );

  // rover.resetRover 经 ref 转发, 避免 switchMission 依赖环
  const resetRoverRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    resetRoverRef.current = rover.resetRover;
  }, [rover.resetRover]);

  /** 重新部署（表面作业链尾节点消费）: 归档本场出击回到待发射, 之后顶栏可自由切换任务 */
  const redeployToStandby = useCallback(() => {
    if (replayModeRef.current) return;
    if (phaseRef.current === "standby" && !flightActiveRef.current) return;
    switchMission(missionRef.current.id, true);
  }, [switchMission]);

  // switchMission 同步进转发 ref（useDailyChallenge 的 startDailyChallenge 经它切到当日天体）
  useEffect(() => {
    switchMissionRef.current = switchMission;
  }, [switchMission]);

  // 全屏状态同步（浏览器 ESC 退出 / 按钮退出都走 fullscreenchange）; 进入全屏即解锁影院模式成就
  useEffect(() => {
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setCinemaMode(active);
      if (active) {
        cinemaCountRef.current += 1;
        unlockAchievement("cinema_mode");
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [unlockAchievement]);

  const toggleCinema = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const toggleSound = useCallback(() => {
    armAudioGesture();
    setSoundOn((prev) => {
      const next = !prev;
      // 转静音前播下行双音告别（与恢复的上行双短哔呼应）——本次音效开启超 1 分钟换「轻告别」版,
      // 余韵深度随陪伴时长继续加深（1 分钟浅 → 5 分钟最深）; 恢复时「叮-叮」确认音效回归
      if (!next) {
        const heldMs = Date.now() - soundOnSinceRef.current;
        playMuteBye(heldMs > 60000, Math.min(1, Math.max(0, (heldMs - 60000) / 240000)));
      }
      setAudioMuted(!next);
      if (next) {
        playAckConfirm();
        soundOnSinceRef.current = Date.now();
      }
      // 音效开关随存档持久化
      audioPrefsRef.current.sfxOn = next;
      scheduleSave();
      return next;
    });
  }, [scheduleSave]);

  // ---- BGM 环境音开关与音量（音频设置弹层消费; 偏好随存档持久化） ----
  const toggleBgm = useCallback(() => {
    armAudioGesture();
    setBgmOn((prev) => {
      const next = !prev;
      setAmbientEnabled(next);
      if (next) playAckConfirm();
      audioPrefsRef.current.bgmOn = next;
      scheduleSave();
      return next;
    });
  }, [scheduleSave]);

  const changeBgmVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v));
      setBgmVolume(clamped);
      setAmbientVolume(clamped);
      audioPrefsRef.current.bgmVolume = clamped;
      scheduleSave();
    },
    [scheduleSave],
  );

  // ---- BGM 环境音调度 ----
  // 挂载时把存档偏好同步进音频模块（音效静音态 / BGM 开关 / BGM 音量）
  useEffect(() => {
    setAudioMuted(!audioPrefsRef.current.sfxOn);
    setAmbientEnabled(audioPrefsRef.current.bgmOn);
    setAmbientVolume(audioPrefsRef.current.bgmVolume);
    return () => {
      stopAmbient(); // 卸载即停, 不留孤儿环境音
      stopPhaseMusic();
    };
  }, []);

  // 飞行段 = 引擎底噪 + 当前阶段专属 BGM; 着陆后 = 天体专属音色 + 天体专属配乐。
  // 配乐优先级——着陆后: 危险天象进行中 > 采样作业律动（收工 3.5s 保持窗防抖）> 天体淡板;
  // 飞行段: 手动着陆挑战 > 每日挑战冲刺 > 阶段配乐。待发射只奏神秘慢板（无环境音）; 回放中全静默
  const surfaceOpsNow =
    rover.roverSnap.armPhase !== "idle" || rover.roverSnap.moving || rover.roverSnap.rallyPoints !== null;
  const [surfaceOpsBusy, setSurfaceOpsBusy] = useState(false);
  const opsHoldRef = useRef<number | null>(null);
  useEffect(() => {
    if (surfaceOpsNow) {
      setSurfaceOpsBusy(true);
      if (opsHoldRef.current !== null) {
        window.clearTimeout(opsHoldRef.current);
        opsHoldRef.current = null;
      }
    } else if (opsHoldRef.current === null) {
      opsHoldRef.current = window.setTimeout(() => {
        setSurfaceOpsBusy(false);
        opsHoldRef.current = null;
      }, 3500);
    }
  }, [surfaceOpsNow]);
  const hazardBusy =
    dustStormActive || globalStormActive || meteorBanner !== null || cryoVentBanner !== null || fogActive || fogBanner !== null;
  // 试听面板恢复信号：停止试听后 +1, 触发下方调度 effect 重跑恢复应播曲目
  const [bgmNonce, setBgmNonce] = useState(0);
  useEffect(() => {
    if (replayMode || !flightActive) {
      stopAmbient();
      stopPhaseMusic();
      return;
    }
    if (phaseId === "standby") {
      stopAmbient();
      startPhaseMusic("standby");
      return;
    }
    startAmbient(phaseId === "landed" ? LANDED_AMBIENT[activeMissionId] : "engine");
    if (phaseId === "landed") {
      startPhaseMusic(hazardBusy ? "hazard" : surfaceOpsBusy ? "ops" : LANDED_MUSIC[activeMissionId]);
    } else if (manualLandingOpen) {
      startPhaseMusic("manual");
    } else if (challengeActive) {
      startPhaseMusic("daily");
    } else {
      startPhaseMusic(phaseId);
    }
  }, [
    replayMode,
    flightActive,
    phaseId,
    activeMissionId,
    surfaceOpsBusy,
    hazardBusy,
    manualLandingOpen,
    challengeActive,
    bgmNonce,
  ]);

  /** 配乐试听（试听面板消费）：直切音乐引擎到所选曲目 */
  const previewMusic = useCallback((key: MusicPhase) => {
    startPhaseMusic(key);
  }, []);
  /** 停止试听：重跑 BGM 调度, 恢复任务当前场景应播曲目（无任务则静默） */
  const stopMusicPreview = useCallback(() => {
    setBgmNonce((n) => n + 1);
  }, []);

  // 页签隐藏即挂起环境音, 回到前台且未静音/未关 BGM 时续播
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) pauseAmbient();
      else resumeAmbient();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const toggleCover = useCallback(() => {
    armAudioGesture();
    playCoverClick();
    setCoverOpen((prev) => !prev);
  }, []);

  /** 跳过流程：开机自检直接完成; 飞行中速览快进到着陆时刻（默认 3 秒, fast=1.5 秒; 阶段链飞速点亮, 自动着陆序列） */
  const skipSequence = useCallback(
    (fast?: boolean) => {
      const m = missionRef.current;
      if (bootStep < BOOT_TOTAL) {
        setBootStep(BOOT_TOTAL);
        pushLog("SYS", "开机自检已跳过——直接转入射前常态监测", "nominal");
        return;
      }
      if (!flightActiveRef.current || phaseRef.current === "landed" || replayModeRef.current) return;
      if (skipAnimRef.current !== null) return;
      // 动力下降段手动着陆弹窗若开着: 关闭并交还制导计算机（按自动着陆处理）
      flightPausedRef.current = false;
      setManualLandingOpen(false);
      const durMs = fast ? 1500 : 3000;
      // 着陆动画速览：flightSecs 平滑快进, 阶段链胶囊逐段飞速点亮, 到点后 tick 自然走着陆完成流程
      const target = phaseStartSec(m, "landed");
      const startSec = flightSecsRef.current;
      const startAt = performance.now();
      pushLog("SYS", fast ? "二倍速快进! 1.5 秒直达着陆——系好安全带" : "飞行流程快进中——3 秒速览剩余阶段, 制导计算机按自动序列执行跳过着陆", "nominal");
      pushComm([
        {
          speaker: m.comm.speakers.bj,
          text: fast
            ? `二倍速快进收到——茶还没泡好你们就要落地了, 坐稳!`
            : `收到快进请求——茶我泡上, 各位坐稳看着陆就行, 落地马上开工。`,
        },
      ]);
      skipAnimRef.current = window.setInterval(() => {
        const pRaw = Math.min(1, (performance.now() - startAt) / durMs);
        // 双段缓动：前 85% 时间快推 97% 航程, 最后 15% 时间把触地慢放演完
        const p = pRaw < 0.85 ? (pRaw / 0.85) * 0.97 : 0.97 + ((pRaw - 0.85) / 0.15) * 0.03;
        flightSecsRef.current = startSec + (target - startSec) * p;
        setFlightSecs(Math.floor(flightSecsRef.current));
        if (pRaw >= 1 && skipAnimRef.current !== null) {
          window.clearInterval(skipAnimRef.current);
          skipAnimRef.current = null;
          pushLog("SYS", "飞行速览完毕——各阶段一切正常, 跳过着陆成功", "nominal");
        }
      }, 100);
    },
    [bootStep, pushLog, pushComm],
  );

  const ignite = useCallback(() => {
    if (flightActiveRef.current || !coverOpen || replayModeRef.current) return;
    const m = missionRef.current;
    armAudioGesture();
    playLaunchRoar();
    flightActiveRef.current = true;
    flightSecsRef.current = 0;
    phaseRef.current = "liftoff";
    signalLossRef.current = false;
    setSignalLoss(false);
    // 每次点火重置回放录制缓冲（本次任务时间线从头录）与档案记录
    clearRecording();
    recLogRef.current = [];
    recLogCountRef.current = 0;
    recordingDoneRef.current = false;
    phaseMarksRef.current = [
      { id: "liftoff", label: m.phases[1].label, startedAtClock: clockFormat(0, true) },
    ];
    alarmRecordsRef.current = [];
    setFlightActive(true);
    setPhaseId("liftoff");
    setFlightSecs(0);
    // 玩法系统复位：手动着陆待触发、危机统计清零、结算单待出具、着陆后 ~40s 首场突发事件
    manualOfferedRef.current = false;
    manualGradeRef.current = null;
    flightPausedRef.current = false;
    setManualLandingOpen(false);
    crisisStatsRef.current = { good: 0, total: 0 };
    crisisRef.current = null;
    setCrisis(null);
    crisisAftermathRef.current = null;
    crisisChainRef.current = { count: 0, good: 0 };
    nextCrisisAtRef.current = runSecsRef.current + 25 + Math.floor(Math.random() * 25);
    debriefShownRef.current = false;
    setShaking(true);
    if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = window.setTimeout(() => setShaking(false), 1600);
    pushLog("FLIGHT", m.phases[1].milestone, "nominal");
    pushLog("LAUNCH", "点火指令执行, 发射序列启动, 全箭振动在限内", "nominal");
    unlockAchievement("first_ignite");
    // 彩蛋: 现实时间凌晨 0–5 点点火 → 深夜指挥官（按墙钟判定, 与任务时钟无关）
    const realHour = new Date().getHours();
    if (realHour < 5) {
      unlockAchievement("night_owl");
      pushLog("LAUNCH", `本地时间 ${String(realHour).padStart(2, "0")} 时点火——深夜值班室的灯还亮着, 成就「深夜指挥官」解锁`, "nominal");
    }
    // 点火即触发升空段通话剧本（倒计时口令 + 起飞确认）
    commQueueRef.current = [...m.comm.script.liftoff];
  }, [coverOpen, pushLog, unlockAchievement]);

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current);
      if (commTimerRef.current !== null) window.clearTimeout(commTimerRef.current);
      if (debriefTimerRef.current !== null) window.clearTimeout(debriefTimerRef.current);
    };
  }, []);

  // 警报手动处置: 立即解除 + 记用时 + 短确认音 + 数秒冷却
  const ackAlarm = useCallback(() => {
    if (!alarmActiveRef.current) return;
    const alarm = alarmStateRef.current;
    if (recoverTimerRef.current !== null) {
      window.clearTimeout(recoverTimerRef.current);
      recoverTimerRef.current = null;
    }
    stopAlarmBeep();
    alarmActiveRef.current = false;
    alarmStateRef.current = null;
    setActiveAlarm(null);
    const elapsed = Math.max(1, Math.round((Date.now() - alarmStartedAtRef.current) / 1000));
    const levelName = alarm?.level === "critical" ? "危急" : "注意";
    if (alarm) {
      alarmRecordsRef.current.push({
        level: alarm.level,
        desc: alarm.message,
        clock: stampFormat(
          flightActiveRef.current ? flightSecsRef.current : countdownRef.current,
          flightActiveRef.current,
        ),
        ackMode: "manual",
        durationMs: Date.now() - alarmStartedAtRef.current,
      });
    }
    pushLog("ALARM", `${levelName}警报已由值班员处置确认（用时 ${elapsed} 秒）`, "nominal");
    playAckConfirm();
    setAckCount((prev) => prev + 1);
    unlockAchievement("first_ack");
    ackTotalRef.current += 1;
    if (ackTotalRef.current >= 3) unlockAchievement("ack_3");
    nextAlarmAtRef.current = runSecsRef.current + 8 + Math.floor(Math.random() * 8);
  }, [pushLog, unlockAchievement]);

  /* ---------------- 航行突发事件处置 ---------------- */

  /** 应用突发事件选项后果（idx 选项序号; timedOut = 倒计时归零自动执行 A 预案） */
  const applyCrisis = useCallback(
    (idx: 0 | 1, timedOut: boolean) => {
      const c = crisisRef.current;
      if (!c) return;
      const opt = c.event.options[idx];
      crisisRef.current = null;
      setCrisis(null);
      crisisStatsRef.current.total += 1;
      if (opt.good) crisisStatsRef.current.good += 1;
      if (timedOut) pushLog("CRISIS", `决策超时——制导系统自动执行 A 预案: ${opt.label}`, "caution");
      pushLog("CRISIS", `${c.event.title}处置结果: ${opt.outcome}`, opt.good ? "nominal" : "caution");
      commQueueRef.current.push({ speaker: missionRef.current.comm.speakers.bj, text: opt.outcome });
      if (opt.merit) {
        dutyMeritRef.current = Math.max(0, dutyMeritRef.current + opt.merit);
        setDutyMerit(dutyMeritRef.current);
        if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
      }
      // 处置失当的连锁后果：马上触发一条随机警报 / 全屏震动
      if (opt.alarm) nextAlarmAtRef.current = runSecsRef.current;
      if (opt.shake) {
        setShaking(true);
        if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = window.setTimeout(() => setShaking(false), 650);
      }
      // 结局写进后续剧情：下一次阶段推进时插入回响（明智=顺风, 失当=后遗症+警报连锁提前）
      crisisAftermathRef.current = { event: c.event, good: opt.good };
      if (opt.good) {
        playAckConfirm();
        if (crisisStatsRef.current.good >= 3) unlockAchievement("crisis_master");
      }
      // ---- 三连危机链调度：单发处置后 40% 概率开链, 链内每环 6-10s 接续, 第三环收束发连锁奖励 ----
      const ch = crisisChainRef.current;
      if (ch.count >= 2) {
        // 刚处置完第三环：危机链收束
        if (opt.good) ch.good += 1;
        dutyMeritRef.current += 30;
        setDutyMerit(dutyMeritRef.current);
        if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
        const allGood = ch.good >= 3;
        pushLog(
          "CRISIS",
          `三连危机链全部处置完毕! 连锁奖励功勋 +30——${allGood ? "全环明智处置, 连锁故障被你掐灭在萌芽" : "系统陆续恢复, 值班主任长舒一口气"}`,
          "nominal",
        );
        commQueueRef.current.push({
          speaker: missionRef.current.comm.speakers.bj,
          text: allGood
            ? "三连连锁危机, 环环处置明智——值班员, 这波危机管理可以写进教材, 北京向你致敬!"
            : "三连危机链收住了, 系统陆续恢复正常。喘口气, 继续盯屏。",
        });
        if (allGood) unlockAchievement("crisis_chain");
        ch.count = 0;
        ch.good = 0;
        nextCrisisAtRef.current = runSecsRef.current + 35 + Math.floor(Math.random() * 45);
      } else if (ch.count > 0 || Math.random() < 0.4) {
        // 开链 / 续链：下一环 6-10s 后杀到
        ch.count += 1;
        if (opt.good) ch.good += 1;
        if (ch.count === 1) {
          pushLog("CRISIS", "危机链告警: 本次事件牵出其他系统连锁故障, 三连危机即将接踵而至（共 3 环, 全环明智处置有稀有嘉奖）", "caution");
        }
        nextCrisisAtRef.current = runSecsRef.current + 6 + Math.floor(Math.random() * 5);
      } else {
        nextCrisisAtRef.current = runSecsRef.current + 35 + Math.floor(Math.random() * 45);
      }
    },
    [pushLog, unlockAchievement],
  );
  useEffect(() => {
    applyCrisisRef.current = applyCrisis;
  }, [applyCrisis]);
  /** View 层二选一按钮回调 */
  const resolveCrisis = useCallback((idx: 0 | 1) => {
    applyCrisisRef.current?.(idx, false);
  }, []);

  /* ---------------- 随机交互事件回调 ---------------- */

  /** 流星雨点击记录（StarfieldCanvas 命中流星后回调; 普通 +3 功勋, 金色稀有按连抓递增 +15/+25/+40/+60/+85 封顶——首颗金色解锁 gold_hunter, 单窗第 5 颗解锁 meteor_watcher） */
  const onMeteorHit = useCallback(
    (gold: boolean) => {
      const s = showerRef.current;
      if (!s) return;
      s.hits += 1;
      if (gold) s.golds += 1;
      playStatsRef.current.meteors += 1;
      if (gold) playStatsRef.current.golds += 1;
      // 生涯计数：流星捕获累计（随功勋变化存点持久化）
      careerRef.current.meteors += 1;
      if (gold) careerRef.current.golds += 1;
      setShower((prev) => (prev ? { ...prev, hits: s.hits, golds: s.golds } : prev));
      // 金色连击奖励：+15/+25/+40/+60, 第 5 颗起 +85 封顶（同窗内金色越抓越值钱, 上限拉高）
      const goldReward = s.golds === 1 ? 15 : s.golds === 2 ? 25 : s.golds === 3 ? 40 : s.golds === 4 ? 60 : 85;
      dutyMeritRef.current += gold ? goldReward : 3;
      setDutyMerit(dutyMeritRef.current);
      if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
      if (gold) {
        unlockAchievement("gold_hunter");
        pushLog(
          "OPT",
          s.golds >= 2
            ? `金色流星连击 ×${s.golds}! 功勋 +${goldReward}${s.golds >= 5 ? "（已至单颗封顶）" : "（连抓奖励递增中）"}——北京: 这波金属碎片群的数据无价`
            : "金色稀有流星捕获! 轨迹亮度远超普通流星, 疑似金属质小行星碎片——功勋 +15, 北京要把这条数据好好研究（同窗连抓奖励最高 +85）",
          "nominal",
        );
      }
      if (s.hits === 5) {
        unlockAchievement("meteor_watcher");
        pushLog("OPT", "单窗记录 5 颗流星! 观测数据打包上传——北京: 这批流星轨迹数据非常漂亮", "nominal");
      }
    },
    [pushLog, unlockAchievement],
  );

  /** 紧急演练标靶点击（+10 功勋, 冲刺靶 +15; 累计 3 次快速响应解锁 drill_master; 三连靶逐靶跳转, 全中额外 +30 并解锁 triple_shot） */
  const onDrillHit = useCallback(() => {
    const d = drillRef.current;
    if (!d) return;
    // 冲刺靶游走更快更难命中, 单靶功勋 +15（普通/移动靶 +10）
    const gain = d.dash ? 15 : 10;
    drillCountRef.current += 1;
    playStatsRef.current.drills += 1;
    careerRef.current.drills += 1; // 生涯计数：演练命中累计
    dutyMeritRef.current += gain;
    setDutyMerit(dutyMeritRef.current);
    if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
    playAckConfirm();
    if (d.seq < d.total) {
      // 三连靶：当前靶命中, 立即在新位置弹下一靶（重置 4s 窗口; 移动靶属性整组保持）
      const nx = 12 + Math.random() * 70;
      const ny = 18 + Math.random() * 58;
      drillRef.current = { deadline: runSecsRef.current + 4, xPct: nx, yPct: ny, seq: d.seq + 1, total: d.total, moving: d.moving, dash: d.dash };
      setDrill({ xPct: nx, yPct: ny, remainS: 4, seq: d.seq + 1, total: d.total, moving: d.moving, dash: d.dash });
      pushLog("DUTY", `演练标靶 ${d.seq}/${d.total} 命中! 功勋 +${gain}${d.dash ? "（冲刺靶加成）" : ""}——下一靶已弹出, 别停`, "nominal");
      playAlarmBeep("caution");
      if (drillCountRef.current >= 3) unlockAchievement("drill_master");
      return;
    }
    drillRef.current = null;
    setDrill(null);
    if (d.total > 1) {
      dutyMeritRef.current += 30;
      setDutyMerit(dutyMeritRef.current);
      if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
      unlockAchievement("triple_shot");
      pushLog(
        "DUTY",
        d.dash
          ? "冲刺三连靶全中! 高速游走靶一靶不落——功勋 +15×3 再 +30 通关奖励, 北京: 这预判能力可以直接上实战了"
          : "三连靶全中! 功勋 +10×3 再 +30 通关奖励——北京: 这个反应速度可以直接上实战了",
        "nominal",
      );
    } else {
      pushLog("DUTY", `紧急演练响应成功! 功勋 +${gain}（累计 ${drillCountRef.current} 次快速响应）`, "nominal");
    }
    if (drillCountRef.current >= 3) unlockAchievement("drill_master");
    nextDrillAtRef.current = runSecsRef.current + scaledSurfaceGap(80, 80);
  }, [pushLog, unlockAchievement]);

  /** 中继握手完成（长按 2s; 常规 +20 / 信号干扰局 +30 功勋） */
  const completeHandshake = useCallback(() => {
    const h = handshakeRef.current;
    if (!h) return;
    const jam = h.interference;
    handshakeRef.current = null;
    setHandshake(null);
    playStatsRef.current.handshakes += 1;
    careerRef.current.handshakes += 1; // 生涯计数：握手校准累计
    dutyMeritRef.current += jam ? 30 : 20;
    setDutyMerit(dutyMeritRef.current);
    if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
    pushLog(
      "COMM",
      jam
        ? "顶着链路噪声完成握手校准! 干扰环境下稳如磐石——功勋 +30, 北京确认链路余量恢复至最佳"
        : "中继握手校准完成, 链路余量恢复至最佳——功勋 +20, 北京确认握手",
      "nominal",
    );
    playAckConfirm();
    nextHandshakeAtRef.current = runSecsRef.current + scaledSurfaceGap(110, 110);
  }, [pushLog, unlockAchievement]);

  /** 系统诊断快检结束（六步灯序全对 +35 功勋; 点错/超时收卡, 累计 3 次满序解锁 diag_ace） */
  const completeDiag = useCallback(
    (ok: boolean) => {
      if (!diagRef.current) return;
      const wasExtreme = diagRef.current.extreme;
      diagRef.current = null;
      setDiag(null);
      nextDiagAtRef.current = runSecsRef.current + scaledSurfaceGap(140, 110);
      if (ok) {
        diagWinRef.current += 1;
        playStatsRef.current.diags += 1;
        careerRef.current.diags += 1; // 生涯计数：诊断满序累计
        dutyMeritRef.current += wasExtreme ? 60 : 35;
        setDutyMerit(dutyMeritRef.current);
        if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
        if (diagWinRef.current >= 3) unlockAchievement("diag_ace");
        if (diagWinRef.current >= 10) unlockAchievement("diag_legend");
        playAckConfirm();
        pushLog(
          "SYS",
          wasExtreme
            ? `盲灯极速八步全对! 功勋 +60（累计 ${diagWinRef.current} 次满序巡检）——北京: 这个记忆力和手速, 诊断岗非你莫属`
            : `全链路诊断六步全对! 功勋 +35（累计 ${diagWinRef.current} 次满序巡检）——各系统状态绿灯${diagWinRef.current === 10 ? ", 十次满序——传奇诊断员!" : ""}`,
          "nominal",
        );
      } else {
        pushLog("SYS", "诊断序列点错, 巡检中断——北京: 灯序要看仔细, 手别比脑子快", "caution");
      }
    },
    [pushLog, unlockAchievement],
  );

  /** 呼号抽问作答（连对奖励 20→30→40 递增封顶, 答错/超时连对清零; 答对 50% 触发限时连答追问——6s 窗口; 延迟 0.75s 收卡看反馈色） */
  const answerQuiz = useCallback(
    (ok: boolean) => {
      const qz = quizRef.current;
      if (!qz) return;
      // 作答后冻结窗口, 交给延迟收卡; 答对时掷一次「北京追问」
      qz.deadline = runSecsRef.current + 5;
      const chain = ok && Math.random() < 0.5;
      if (ok) {
        quizStreakRef.current += 1;
        quizWinRef.current += 1;
        playStatsRef.current.quizzes += 1;
        careerRef.current.quizzes += 1; // 生涯计数：抽问答对累计
        quizChainRef.current += 1;
        const chainN = quizChainRef.current;
        const streak = quizStreakRef.current;
        const quizReward = streak === 1 ? 20 : streak === 2 ? 30 : 40;
        // 追问连答大奖：本次弹卡内首答+三连追问全对（链内 4 连对）额外 +50; 超过 4 链每链再 +10 并刷新虚构榜名次
        const chainJackpot = chainN === 4;
        const chainExtra = chainN > 4 ? 10 : 0;
        // 个人连答最佳链（跨会话持久化, 破纪录时日志专门播报 = 存点）
        const chainRecord = chainN > quizChainBestRef.current;
        if (chainRecord) {
          quizChainBestRef.current = chainN;
          if (chainN > careerRef.current.chainBest) careerRef.current.chainBest = chainN;
          scheduleSave();
        }
        if (chainN >= 7) unlockAchievement("chain_legend");
        dutyMeritRef.current += quizReward + (chainJackpot ? 50 : 0) + chainExtra;
        setDutyMerit(dutyMeritRef.current);
        if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
        if (quizWinRef.current >= 3) unlockAchievement("quiz_ace");
        playAckConfirm();
        pushLog(
          "COMM",
          chainJackpot
            ? `呼号应答正确, 连对 ×${streak}! 功勋 +${quizReward}, 且追问三连全对——连答大奖额外功勋 +50!${chainRecord ? " 还创下了个人连答新纪录!" : ""} 北京: 通话守则被你背透了`
            : streak >= 2
              ? `呼号应答正确, 连对 ×${streak}! 功勋 +${quizReward}${streak >= 3 ? "（已至连对封顶）" : "（连对奖励递增中）"}——北京: 通话守则功底扎实`
              : "呼号应答正确! 功勋 +20——北京: 通话守则功底扎实（连对有奖, 答错清零）",
          "nominal",
        );
        if (chainJackpot) {
          // 虚构连答榜名次对照（纯前端模拟席位）
          const m = missionRef.current;
          pushComm([
            {
              speaker: m.comm.speakers.bj,
              text: `连答大奖确认! 值班网络连答榜实时对照——你的四连目前排第 ${quizChainRank(4)} 位, 前面还有极光哨的五连、苍鹰的六连, 和夜莺保持的七连传奇纪录。接着答, 每多一连, 榜上就有人睡不着觉。`,
            },
          ]);
        } else if (chainExtra > 0) {
          pushLog("COMM", `连答 ×${chainN}! 功勋 +${quizReward + chainExtra}, 连答榜名次升至第 ${quizChainRank(chainN)} 位${quizChainCallout(chainN)}${chainRecord ? " 个人连答新纪录!" : ""}——北京: 夜莺的七连纪录开始紧张了`, "nominal");
        }
      } else {
        quizStreakRef.current = 0;
        quizChainRef.current = 0;
        pushLog("COMM", "呼号应答错误, 连对计数清零——北京: 把值班通话守则再读一遍, 下次抽问还考", "caution");
      }
      window.setTimeout(() => {
        if (quizRef.current !== qz) return;
        if (chain) {
          // 限时连答追问：换新题+新 id（QuizCard 重挂载清作答态）, 窗口只有 6 秒
          const nq = rollQuiz();
          quizIdRef.current += 1;
          qz.id = quizIdRef.current;
          qz.question = nq;
          qz.deadline = runSecsRef.current + 6;
          setQuiz({ id: qz.id, question: nq, remainS: 6 });
          pushLog("COMM", "北京追问! 新呼号已发出——限时连答, 窗口只有 6 秒, 连对奖励继续滚", "nominal");
          playAlarmBeep("caution");
        } else {
          quizRef.current = null;
          setQuiz(null);
          nextQuizAtRef.current = runSecsRef.current + scaledSurfaceGap(160, 120);
        }
      }, 750);
    },
    [pushLog, pushComm, unlockAchievement],
  );

  /** 中继天线对准结束（三段全锁 +30 功勋并延迟 0.85s 收卡展示金色庆典; 锁偏一发即失败收卡） */
  const completeAntenna = useCallback(
    (ok: boolean) => {
      const ref = antennaRef.current;
      if (!ref) return;
      if (ok) {
        playStatsRef.current.antennas += 1;
        careerRef.current.antennas += 1; // 生涯计数：天线全锁累计
        dutyMeritRef.current += 30;
        setDutyMerit(dutyMeritRef.current);
        if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
        playAckConfirm();
        pushLog("COMM", "中继天线三段全锁, 链路接通! 功勋 +30——北京: 这个对星手感, 地面站都得请你讲课", "nominal");
        // 冻结窗口, 延迟收卡让盘面播完金色庆典动画
        ref.deadline = runSecsRef.current + 5;
        window.setTimeout(() => {
          if (antennaRef.current !== ref) return;
          antennaRef.current = null;
          setAntenna(null);
          nextAntennaAtRef.current = runSecsRef.current + scaledSurfaceGap(180, 130);
        }, 850);
      } else {
        antennaRef.current = null;
        setAntenna(null);
        nextAntennaAtRef.current = runSecsRef.current + scaledSurfaceGap(180, 130);
        pushLog("COMM", "天线锁偏, 指向机构回自动跟踪——差一点就锁上了, 稳住节奏再来", "caution");
      }
    },
    [pushLog, unlockAchievement],
  );

  /** 极光观测点击记录（绿色每段 +10 / 红色罕见每段 +20 并解锁 aurora_witness, 单窗上限 3 段） */
  const onAuroraHit = useCallback(() => {
    const a = auroraRef.current;
    if (!a || a.hits >= 3) return;
    a.hits += 1;
    setAurora((prev) => (prev ? { ...prev, hits: a.hits } : prev));
    playStatsRef.current.auroras += 1;
    careerRef.current.auroras += 1; // 生涯计数：极光光谱段数累计
    const gain = a.rare ? 20 : 10;
    dutyMeritRef.current += gain;
    setDutyMerit(dutyMeritRef.current);
    if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
    if (a.rare) unlockAchievement("aurora_witness");
    playAckConfirm();
    pushLog(
      "OPT",
      a.rare
        ? `红色罕见极光光谱记录 ${a.hits}/3——功勋 +20! 这种血红极光百年难遇, 磁层数据价值连城`
        : `极光带光谱记录 ${a.hits}/3——功勋 +10, 磁层活动数据很有价值`,
      "nominal",
    );
  }, [pushLog, unlockAchievement]);

  /** 星座连线彩蛋点击许愿：极光窗口内点中星座星点（+5 功勋, 每窗限一次） */
  const wishConstellation = useCallback(() => {
    const a = auroraRef.current;
    if (!a || a.wished) return;
    a.wished = true;
    setAurora((prev) => (prev ? { ...prev, wished: true } : prev));
    dutyMeritRef.current += 5;
    setDutyMerit(dutyMeritRef.current);
    if (dutyMeritRef.current >= 800) unlockAchievement("duty_commander");
    playAckConfirm();
    pushLog("OPT", "你对着光幕间的古老星座许了个愿——一颗流星应愿划过天际! 功勋 +5。北京: 愿望已收到, 电离层回波一切正常, 祝你轨道常晴", "nominal");
  }, [pushLog, unlockAchievement]);

  /* ---------------- 手动着陆挑战 ---------------- */

  /** 手动着陆结束（含转自动 / 接受硬着陆）：恢复飞行时钟 + 记录评级 + 播报（driftM = 触地横向偏移, 侧风玩法新增） */
  const completeManualLanding = useCallback(
    (grade: LandingGrade, touchdownV: number, driftM?: number) => {
      manualGradeRef.current = grade;
      flightPausedRef.current = false;
      setManualLandingOpen(false);
      if (grade === "AUTO") {
        pushLog("GNC", "制导计算机接管下降段, 自动着陆序列正常执行", "nominal");
      } else {
        unlockAchievement("manual_first");
        if (grade === "S") unlockAchievement("manual_ace");
        const driftText = driftM !== undefined && driftM > 10 ? `, 侧风偏移 ${driftM.toFixed(1)} m 降档` : "";
        pushLog(
          "GNC",
          `手动着陆完成! 触地速度 ${touchdownV.toFixed(2)} m/s${driftText}, 着陆评级「${grade}」——${
            grade === "S" || grade === "A" ? "教科书级操控, 北京为你鼓掌" : grade === "D" ? "着陆器结构受损, 好在乘组与核心设备安全" : "稳稳当当, 合格的操控"
          }`,
          grade === "D" ? "caution" : "nominal",
        );
        commQueueRef.current.push({
          speaker: missionRef.current.comm.speakers.bj,
          text:
            grade === "S"
              ? `触地速度只有 ${touchdownV.toFixed(1)} 米每秒, 侧风中也稳稳压住了漂移! 值班员, 你这手操控可以写进教材——北京为你鼓掌!`
              : grade === "D"
                ? `触地速度 ${touchdownV.toFixed(1)} 米每秒, 着陆器承受了硬冲击……人没事就好, 检查设备后继续任务。`
                : `着陆评级 ${grade} 确认, 触地速度 ${touchdownV.toFixed(1)} 米每秒。侧风不好对付, 干得不错, 指令长!`,
        });
      }
    },
    [pushLog, unlockAchievement],
  );

  /* ---------------- 任务结算单 ---------------- */

  /** 按当前任务的战果数据实时计算结算单（着陆后自动出具, 顶栏战报按钮可重开刷新） */
  const buildDebrief = useCallback((): DebriefData | null => {
    const m = missionRef.current;
    const records = alarmRecordsRef.current;
    const manuals = records.filter((r) => r.ackMode === "manual");
    const avgMs = manuals.length ? manuals.reduce((s, r) => s + r.durationMs, 0) / manuals.length : 0;
    const samples = Object.values(museumRef.current).filter((e) => e.missionId === m.id);
    const sCount = samples.filter((e) => e.report?.grade === "S").length;
    const waterCount = samples.filter((e) => e.report?.waterSignal).length;
    const oceanCount = samples.filter((e) => e.report?.oceanWater).length;
    const drive = rover.getDriveStats();
    const crisisStats = crisisStatsRef.current;

    const gradeL = manualGradeRef.current ?? "AUTO";
    const landingScore =
      gradeL === "S" ? 100 : gradeL === "A" ? 88 : gradeL === "B" ? 74 : gradeL === "C" ? 52 : gradeL === "D" ? 25 : 78;
    const alarmScore =
      records.length === 0
        ? 72
        : Math.round(
            Math.max(
              0,
              Math.min(100, 42 + (manuals.length / records.length) * 42 + (manuals.length > 0 && avgMs < 8000 ? 16 : manuals.length > 0 && avgMs < 15000 ? 8 : 0)),
            ),
          );
    const sampleScore = Math.round(Math.min(100, samples.length * 12 + sCount * 20 + waterCount * 10 + oceanCount * 26));
    const rallyBonus =
      drive.rallyBestS === null ? 0 : drive.rallyBestS <= 45 ? 35 : drive.rallyBestS <= 60 ? 26 : drive.rallyBestS <= 75 ? 16 : 8;
    const driveScore =
      rover.roverSnap.odometer < 20 && samples.length === 0
        ? 55
        : Math.round(Math.max(0, Math.min(100, 32 + drive.evades * 10 + drive.aces * 8 + rallyBonus + samples.length * 6 - drive.hardBrakes * 6)));
    const crisisScore = crisisStats.total === 0 ? 65 : Math.round(60 + (crisisStats.good / crisisStats.total) * 40);
    // 玩法称号评定：七项玩法计数总和分档——称号加成计入总分 + 拼进总评语尾 + 盘点行徽章展示
    const psAll = playStatsRef.current;
    const playTotal = psAll.meteors + psAll.drills + psAll.handshakes + psAll.diags + psAll.quizzes + psAll.antennas + psAll.auroras;
    const playTitle =
      playTotal >= 40 ? "值班厅之王" : playTotal >= 25 ? "王牌值班手" : playTotal >= 12 ? "熟练老手" : playTotal >= 5 ? "新锐值班员" : "围观群众";
    const playBonus = playTotal >= 40 ? 5 : playTotal >= 25 ? 3 : playTotal >= 12 ? 2 : playTotal >= 5 ? 1 : 0;
    // 称号晋升判定：本次档位高于上次结算 → 结算单播流光晋升动画（会话内首次结算不算晋升）
    const playRank = playTotal >= 40 ? 4 : playTotal >= 25 ? 3 : playTotal >= 12 ? 2 : playTotal >= 5 ? 1 : 0;
    const playTitlePromoted = playTitleRankRef.current >= 0 && playRank > playTitleRankRef.current;
    playTitleRankRef.current = Math.max(playTitleRankRef.current, playRank);
    const total = Math.min(
      100,
      Math.round(landingScore * 0.3 + alarmScore * 0.15 + sampleScore * 0.25 + driveScore * 0.15 + crisisScore * 0.15) + playBonus,
    );
    const grade = total >= 90 ? "S" : total >= 75 ? "A" : total >= 58 ? "B" : total >= 40 ? "C" : "D";
    // 历史最佳对比：读取本次结算前该任务的纪录, 结算后按维度与总分刷新（会话内存态, 跨任务切换保留）
    const prevBest = debriefBestRef.current[m.id] ?? null;
    const isRecord = !prevBest || total > prevBest.total;
    const dimScores = [landingScore, alarmScore, sampleScore, driveScore, crisisScore];
    debriefBestRef.current = {
      ...debriefBestRef.current,
      [m.id]: {
        total: Math.max(total, prevBest?.total ?? 0),
        grade: isRecord ? grade : prevBest?.grade ?? grade,
        dims: dimScores.map((s, i) => Math.max(s, prevBest?.dims[i] ?? 0)),
      },
    };
    // 生涯纪录：历史最佳结算总分与评级（只升不降）; 结算出具 = 存点
    if (careerRef.current.bestTotal === null || total > careerRef.current.bestTotal) {
      careerRef.current.bestTotal = total;
      careerRef.current.bestGrade = grade;
    }
    scheduleSave();
    const comment =
      grade === "S"
        ? "教科书级任务表现, 北京建议给你记功——下一颗星, 继续!"
        : grade === "A"
          ? "表现优异, 你已经有王牌值班员的样子了。"
          : grade === "B"
            ? "任务完成得中规中矩, 细节还有提升空间。"
            : grade === "C"
              ? "勉强及格, 飞控中心替你捏了几把汗。"
              : "这次任务跌宕起伏——复盘日志, 下一场把它赢回来。";
    return {
      missionCode: m.code,
      missionTitle: m.title,
      grade,
      total,
      comment: `${comment}本次值班玩法称号:「${playTitle}」（互动 ${playTotal} 次${playBonus > 0 ? `, 称号加成已计入总分 +${playBonus}` : ""}）。`,
      isRecord,
      best: prevBest ? { total: prevBest.total, grade: prevBest.grade } : null,
      // 全球值班网络排行榜（模拟席位固定分 + 玩家本次总分插入重排）
      board: [
        ...GLOBAL_DUTY_BOARD.map((e) => ({ ...e, isPlayer: false })),
        { name: "你 · 本指挥席", score: total, isPlayer: true },
      ]
        .sort((a, b) => b.score - a.score)
        .map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, isPlayer: e.isPlayer })),
      dims: [
        { label: "着陆精度", labelEn: "LANDING", score: landingScore, best: prevBest?.dims[0] ?? null },
        { label: "警报响应", labelEn: "ALARMS", score: alarmScore, best: prevBest?.dims[1] ?? null },
        { label: "样品质量", labelEn: "SAMPLES", score: sampleScore, best: prevBest?.dims[2] ?? null },
        { label: "驾驶行为", labelEn: "DRIVING", score: driveScore, best: prevBest?.dims[3] ?? null },
        { label: "危机处置", labelEn: "CRISIS", score: crisisScore, best: prevBest?.dims[4] ?? null },
      ],
      stats: {
        landingText: gradeL === "AUTO" ? "自动着陆" : `手动 ${gradeL} 级`,
        samples: samples.length,
        sGrade: sCount,
        acks: manuals.length,
        alarms: records.length,
        evades: drive.evades,
        rallyBestText: drive.rallyBestS === null ? "未参赛" : `最佳 ${drive.rallyBestS}s`,
        crisisText: crisisStats.total === 0 ? "未遭遇" : `${crisisStats.good}/${crisisStats.total} 明智`,
        genText:
          drive.genTotal === 0
            ? "未回充"
            : `累计 ${drive.genTotal}%${drive.genLost > 0 ? ` · 尘损 ${drive.genLost}%` : ""}`,
        // 金星热管理统计（仅 VNS-1: 本次生存窗口内过热/应急散热/峰值计数, 其他任务不渲染该行）
        thermalText:
          m.id === "venus1"
            ? `过热 ${thermalStatsRef.current.overheat} 次 / 散热 ${thermalStatsRef.current.cooling} 次 / 峰值 ${Math.round(thermalStatsRef.current.peak)}%`
            : undefined,
      },
      plays: (() => {
        const ps = playStatsRef.current;
        const rows: { key: string; label: string; value: string; n: number }[] = [
          { key: "meteors", label: "流星记录", value: ps.golds > 0 ? `${ps.meteors} · 金 ${ps.golds}` : `${ps.meteors}`, n: ps.meteors },
          { key: "drills", label: "演练命中", value: `${ps.drills}`, n: ps.drills },
          { key: "handshakes", label: "握手校准", value: `${ps.handshakes}`, n: ps.handshakes },
          { key: "diags", label: "诊断满序", value: `${ps.diags}`, n: ps.diags },
          { key: "quizzes", label: "抽问答对", value: `${ps.quizzes}`, n: ps.quizzes },
          { key: "chainBest", label: "连答纪录", value: `${quizChainBestRef.current} 连`, n: quizChainBestRef.current },
          { key: "antennas", label: "天线全锁", value: `${ps.antennas}`, n: ps.antennas },
          { key: "auroras", label: "极光光谱", value: `${ps.auroras}`, n: ps.auroras },
          { key: "spinSecs", label: "漂移秒数", value: `${drive.spinSecs}s${drive.spinBestS > 0 ? ` · 单次最佳 ${drive.spinBestS}s` : ""}`, n: drive.spinSecs },
          { key: "craterEdge", label: "坑沿巡航", value: `${drive.craterEdgeS}s`, n: drive.craterEdgeS },
          { key: "photos", label: "纪念拍照", value: `${drive.photos} 张`, n: drive.photos },
        ];
        // 对比并刷新各项历史最佳（会话内存态, 跨任务保留）
        return rows.map((r) => {
          const best = Math.max(playBestRef.current[r.key] ?? 0, r.n);
          playBestRef.current[r.key] = best;
          return { label: r.label, value: r.value, best };
        });
      })(),
      playTitle,
      playTitlePromoted,
    };
  }, [rover.getDriveStats, rover.roverSnap.odometer, scheduleSave]);
  useEffect(() => {
    buildDebriefRef.current = buildDebrief;
  }, [buildDebrief]);

  const openDebrief = useCallback(() => {
    const data = buildDebriefRef.current?.();
    if (!data) return;
    setDebriefData(data);
    debriefOpenRef.current = true;
    setDebriefOpen(true);
  }, []);
  const closeDebrief = useCallback(() => {
    debriefOpenRef.current = false;
    setDebriefOpen(false);
  }, []);
  /** 战报按钮可用条件：当前任务已完成软着陆 */
  const debriefAvailable = landedMissions.includes(activeMissionId);

  // ---- 阶段迁跃（增强 N）：飞行时间轴直接跳转到目标阶段起点, tick 内既有相位切换逻辑自然接管 ----
  // 迁跃过场动画目标标签（null = 不播放）; seq 递增保证连续迁跃时动画重放
  const [warpLabel, setWarpLabel] = useState<string | null>(null);
  const [warpSeq, setWarpSeq] = useState(0);
  const warpTimerRef = useRef<number | null>(null);
  const startWarp = useCallback(
    (label: string) => {
      if (reducedMotion) return; // 省动画模式跳过过场（时间轴仍即时跳转）
      if (warpTimerRef.current !== null) window.clearTimeout(warpTimerRef.current);
      setWarpLabel(label);
      setWarpSeq((s) => s + 1);
      playWarpJump();
      // 兜底清除（WarpTransition onDone 会提前清）: 1.6s 动画 + 余量
      warpTimerRef.current = window.setTimeout(() => {
        setWarpLabel(null);
        warpTimerRef.current = null;
      }, 1750);
    },
    [reducedMotion],
  );
  const clearWarp = useCallback(() => {
    if (warpTimerRef.current !== null) {
      window.clearTimeout(warpTimerRef.current);
      warpTimerRef.current = null;
    }
    setWarpLabel(null);
  }, []);
  useEffect(() => clearWarp, [clearWarp]);

  const jumpToPhase = useCallback(
    (target: PhaseId) => {
      if (replayModeRef.current || !flightActiveRef.current || flightPausedRef.current) return;
      if (phaseRef.current === "landed" || phaseRef.current === "standby") return;
      if (target === "standby" || target === phaseRef.current) return;
      const m = missionRef.current;
      const meta = m.phases[PHASE_INDEX[target]];
      if (!meta) return;
      flightSecsRef.current = phaseStartSec(m, target);
      setFlightSecs(flightSecsRef.current);
      pushLog("FLIGHT", `时间轴迁跃指令收到——直接跳转至「${meta.label}」阶段`, "nominal");
      startWarp(meta.label);
    },
    [pushLog, startWarp],
  );

  /** 跳过本阶段：迁跃至下一段起点（touchdown 上跳过即进入着陆） */
  const skipCurrentPhase = useCallback(() => {
    if (replayModeRef.current || !flightActiveRef.current || flightPausedRef.current) return;
    const m = missionRef.current;
    const idx = m.phases.findIndex((p) => p.id === phaseRef.current);
    const next = idx >= 0 ? m.phases[idx + 1] : undefined;
    if (next) jumpToPhase(next.id);
  }, [jumpToPhase]);

  /** 立即排程当前天体的表面事件（表面作业链空闲事件节点点击消费; 进行中/回放/未着陆不响应） */
  const triggerSurfaceEvent = useCallback(() => {
    if (replayModeRef.current || phaseRef.current !== "landed" || !flightActiveRef.current) return;
    const m = missionRef.current;
    const t = runSecsRef.current;
    if (m.id === "ares1" && stormPhaseRef.current === "idle") {
      triggerStormSoon(t);
      pushLog("SURF", "作业排程指令收到——沙尘暴过境立即排程", "nominal");
    } else if (m.id === "venus1" && stormPhaseRef.current === "idle") {
      triggerStormSoon(t);
      pushLog("SURF", "作业排程指令收到——酸雾风暴窗口立即排程", "nominal");
    } else {
      // 陨石雨 / 冰裂隙 / 浓雾: 空闲判定与排程内聚在子 hook, 返回事件名供播报
      const label = surfaceEventSoon(m.id, t);
      if (label) pushLog("SURF", `作业排程指令收到——${label}立即排程`, "nominal");
    }
  }, [pushLog, surfaceEventSoon, triggerStormSoon]);

  /** 金星提前撤离：生存窗口置零, 下一 tick 走既有紧急上升全流程（撤离剧本/成就/结算自动出具） */
  const triggerVenusEvac = useCallback(() => {
    if (replayModeRef.current || missionRef.current.id !== "venus1") return;
    if (survivalRemainRef.current === null || evacuatingRef.current) return;
    survivalRemainRef.current = 0;
    setVenusSurvivalRemainS(0);
    pushLog("GNC", "撤离指令收到——提前执行紧急上升, 生存窗口关闭", "caution");
  }, [pushLog]);

  /** 飞行阶段链可点击迁跃条件（手动着陆挑战 / 回放 / 已着陆 / 待发射时禁用） */
  const canJumpPhase =
    flightActive && !replayMode && !manualLandingOpen && phaseId !== "standby" && phaseId !== "landed";

  // 字幕条手动关闭 / 恢复（不受静音开关影响）
  const closeComm = useCallback(() => {    setCommVisible(false);
    commVisibleRef.current = false;
    commQueueRef.current = [];
    if (commTimerRef.current !== null) {
      window.clearTimeout(commTimerRef.current);
      commTimerRef.current = null;
    }
    commBusyRef.current = false;
    setCommLine(null);
  }, []);

  const reopenComm = useCallback(() => {
    setCommVisible(true);
    commVisibleRef.current = true;
  }, []);

  const openMetric = useCallback((key: string) => {
    metricOpenCountRef.current += 1;
    setSelectedMetricKey(key);
  }, []);
  const closeMetric = useCallback(() => setSelectedMetricKey(null), []);
  // 关闭着陆庆祝浮层后紧接着出具任务结算单（每次着陆仅自动一次, 顶栏「战报」可重开刷新）
  const dismissLanding = useCallback(() => {
    setLandingVisible(false);
    if (!debriefShownRef.current && !replayModeRef.current) {
      debriefShownRef.current = true;
      const data = buildDebriefRef.current?.();
      if (data) {
        setDebriefData(data);
        debriefOpenRef.current = true;
        setDebriefOpen(true);
      }
    }
  }, []);

  // 任务档案导出：完整日志时间线 + 阶段轴 + 警报记录 + 遥测摘要, JSON/TXT 双格式前端下载
  const exportEnabled = logEntries.length >= 5;
  const exportArchiveNow = useCallback(() => {
    const logs = recLogRef.current;
    if (logs.length < 5) return;
    const m = missionRef.current;
    const generatedAt = new Date().toISOString();
    const clockNow = clockFormat(
      flightActiveRef.current ? flightSecsRef.current : countdownRef.current,
      flightActiveRef.current,
    );
    const input = {
      missionCode: m.code,
      missionTitle: m.title,
      generatedAt,
      clockText: clockNow,
      phaseMarks: phaseMarksRef.current.slice(),
      alarmRecords: alarmRecordsRef.current.slice(),
      logs: logs.map((l) => ({ clock: l.stamp, type: l.system, level: l.level, text: l.message })),
      telemetrySnapshot: metricsRef.current.map((mm) => ({
        key: mm.key,
        label: mm.label,
        value: mm.display,
        unit: mm.unit,
      })),
    };
    const fileStamp = generatedAt.slice(0, 19).replace(/[:T]/g, "-");
    downloadArchive(`${m.code}-mission-${fileStamp}.json`, buildJsonArchive(input), "application/json");
    downloadArchive(`${m.code}-mission-${fileStamp}.txt`, buildTxtArchive(input), "text/plain");
    pushLog("SYS", "任务档案已导出, JSON 与 TXT 双格式存档下载完成", "nominal");
    unlockAchievement("export_archive");
  }, [pushLog, unlockAchievement]);

  // 回放快照覆盖: 回放模式下把「当前帧」（useReplay 子 hook 派生）作为下发给 View 的展示值, View 保持纯展示
  // 回放帧只存数值, 展示时按 metricDefs 重建完整指标对象; sparkline 曲线取「当前帧往前 SERIES_CAP 帧」的
  // 数值窗口（帧率 2Hz, 约 30s 走势, 与实时 60s 窗口视觉等价）
  const displayMetrics: TelemetryMetric[] = replayFrame
    ? (() => {
        const frames = replayFramesRef.current;
        const endIdx = Math.min(replayFrameIndex, replayCountRef.current - 1);
        const startIdx = Math.max(0, endIdx - SERIES_CAP + 1);
        return def.metricDefs.map((metricDef, i) => {
          const v = replayFrame.values[i] ?? 0;
          const series: number[] = [];
          for (let f = startIdx; f <= endIdx; f++) series.push(frames[f]?.values[i] ?? v);
          return {
            key: metricDef.key,
            label: metricDef.label,
            labelEn: metricDef.labelEn,
            unit: metricDef.unit,
            decimals: metricDef.decimals,
            value: v,
            display: formatValue(v, metricDef.decimals),
            series,
          };
        });
      })()
    : metrics;
  const displayLogs = replayFrame ? recLogRef.current.slice(0, replayFrame.logCount) : logEntries;
  const displayPhaseIndex = replayFrame ? replayFrame.phaseIndex : PHASE_INDEX[phaseId];
  const displayPhaseMeta = def.phases[displayPhaseIndex];

  // 状态灯: 警报优先, 沙尘暴期间独立 CAUTION 态; 全球级风暴期间恒为 CRITICAL（不占用警报处置通道）;
  // 巡视车低电量（≤15% 未耗尽）联动 CAUTION
  const roverLowBatt = rover.roverUnlocked && !rover.roverSnap.batteryDead && rover.roverSnap.battery <= 15;
  // 低电警戒播报提示音：进入警戒瞬间播一次广播式双音（随静音开关管控）
  const prevLowBattRef = useRef(false);
  useEffect(() => {
    if (roverLowBatt && !prevLowBattRef.current) playLowBattChime();
    prevLowBattRef.current = roverLowBatt;
  }, [roverLowBatt]);
  const missionStatus: MissionLevel = replayFrame
    ? "nominal"
    : globalStormActive
      ? "critical"
      : activeAlarm
        ? activeAlarm.level
        : dustStormActive
          ? "caution"
          : fogActive
            ? "caution"
            : roverLowBatt
              ? "caution"
              : "nominal";
  // 回放中按帧重现沙尘暴强度（主视口天空变暗）
  const dustIntensityView = replayFrame ? replayFrame.dustIntensity : dustIntensity;
  // 回放中按帧重现泰坦浓雾浓度（主视口橙褐雾幕）
  const fogLevelView = replayFrame ? replayFrame.fogLevel : fogLevel;
  const selectedMetric = displayMetrics.find((m) => m.key === selectedMetricKey) ?? null;
  const clockSecs = flightActive ? flightSecs : countdownSecs;
  const missionOptions = MISSION_ORDER.map((id) => ({ id, code: MISSIONS[id].code }));
  const achievementCount = Object.keys(achievementMap).length;
  // 任务简报叠层数据（读当前 mission, 切换任务后按新任务简报）
  const briefingStations = def.stationSeed.map((s) => ({
    stationKey: s.stationKey,
    stationName: s.stationName,
    code: s.code,
    online: s.online,
  }));

  return {
    bootPhase,
    bootVisibleLines,
    bootProgress,
    litPanelCount,
    clockText: replayFrame ? replayFrame.clockText : clockFormat(clockSecs, flightActive),
    missionStatus,
    alarmActive: replayFrame ? false : activeAlarm !== null,
    alarmMessage: replayFrame ? "" : activeAlarm?.message ?? "",
    alarmMetricKey: replayFrame ? "" : activeAlarm?.metricKey ?? "",
    ackAlarm,
    ackCount,
    metrics: displayMetrics,
    logEntries: displayLogs,
    saveFailed,
    stationList,
    selectedMetric,
    openMetric,
    closeMetric,
    // 当前任务与切换（仅待发射可切）
    activeMissionId,
    missionOptions,
    missionSwitchable,
    onSwitchMission: switchMission,
    missionCode: def.code,
    missionTitle: def.title,
    missionBadge: def.badge,
    headerEn: def.headerEn,
    phases: def.phases,
    landingSite: def.landingSite,
    landingBody: def.landingBody,
    planetWord: def.planetWord,
    approachEn: def.approachEn,
    linkEn: def.linkEn,
    linkZh: def.linkZh,
    missionVisual: def.visual,
    // 飞行阶段（回放中按快照重现）
    phaseId: replayFrame ? replayFrame.phaseId : phaseId,
    phaseLabel: displayPhaseMeta.label,
    phaseLabelEn: displayPhaseMeta.labelEn,
    phaseIndex: displayPhaseIndex,
    flightActive,
    moonMix: replayFrame ? replayFrame.moonMix : moonMix,
    // 气动黑障区信号中断
    signalLoss: replayFrame ? false : signalLoss,
    // 火星沙尘暴（回放中按帧重现强度, 徽标类状态不重现）
    dustStormActive: replayFrame ? false : dustStormActive,
    dustIntensity: dustIntensityView,
    // 全球级沙尘暴（区域风暴升级路径: CRITICAL 灯 / 巡视车强制停车 / 电力亏损）
    globalStormActive: replayFrame ? false : globalStormActive,
    // 全球风暴生存倒计时（仅实时模式, 回放帧不存该字段）
    globalStormRemainS: replayFrame ? null : globalStormRemainS,
    // 风暴过境放晴过渡（遮罩/尘土随衰减自然消散, 横幅仅实时模式）
    stormClearing: replayFrame ? false : stormClearing,
    // 金星生存窗口（VNS-1 专属: 触地 240s 倒计时; 归零紧急上升撤离并锁定巡视车）
    venusSurvivalRemainS: replayFrame ? null : venusSurvivalRemainS,
    venusEvacuating: replayFrame ? false : venusEvacuating,
    // 金星热管理博弈（VNS-1 专属: 热负载 0–100 / 过热保护锁 / 应急散热, 回放不显示）
    hullTemp: replayFrame ? 0 : hullTemp,
    venusOverheat: replayFrame ? false : venusOverheat,
    thermalWindowActive: replayFrame ? false : thermalWindowActive,
    emergencyCooling,
    // 表面专属事件横幅（月球微陨石雨 / 欧罗巴冰裂隙喷发, 仅实时模式）
    meteorBanner: replayFrame ? null : meteorBanner,
    cryoVentBanner: replayFrame ? null : cryoVentBanner,
    // 泰坦甲烷浓雾（TTN-1 专属: 雾浓度遮罩回放按帧重现; 横幅/作业态仅实时模式）
    fogLevel: fogLevelView,
    fogBanner: replayFrame ? null : fogBanner,
    fogActive: replayFrame ? false : fogActive,
    // 点火交互
    coverOpen,
    toggleCover,
    ignite,
    shaking,
    // 音效 / 影院
    soundOn,
    toggleSound,
    // BGM 环境音（天体专属铺底; 音频设置弹层消费, 偏好随存档持久化）
    bgmOn,
    toggleBgm,
    bgmVolume,
    changeBgmVolume,
    cinemaMode,
    toggleCinema,
    // 着陆庆祝
    landingVisible,
    dismissLanding,
    // 地面通话字幕（回放中不触发不显示）
    commLine: replayFrame ? null : commLine,
    commVisible,
    closeComm,
    reopenComm,
    // 发射回放
    replayMode,
    replayEnabled,
    replayPlaying,
    replaySpeed,
    replayFrameIndex,
    replayFrameCount,
    toggleReplay,
    exitReplay,
    toggleReplayPlay,
    seekReplayFrame,
    stepReplayFrame,
    changeReplaySpeed,
    // 回放多机位
    replayCam,
    selectReplayCam,
    // 任务档案导出
    exportEnabled,
    onExportArchive: exportArchiveNow,
    // 巡视车遥控（玉兔号 / 祝融号）
    roverSnap: rover.roverSnap,
    roverUnlocked: rover.roverUnlocked,
    roverSuspended: rover.roverSuspended,
    pressRoverDir: rover.pressRoverDir,
    releaseRoverDir: rover.releaseRoverDir,
    requestRescue: rover.requestRescue,
    roverName: def.rover.roverName,
    roverNameEn: def.rover.roverNameEn,
    roverSurfaceWord: def.rover.surfaceWord,
    craterNamer,
    // 机械臂采样
    roverSamples: rover.sampleList,
    startRoverSampling: rover.startSampling,
    // 样品舱分析化验
    analysisState: rover.analysisState,
    sampleReports: rover.sampleReports,
    activeSampleReport: rover.activeReport,
    startSampleAnalysis: rover.startAnalysis,
    openSampleReport: rover.openSampleReport,
    closeSampleReport: rover.closeSampleReport,
    // 冰下海洋探测（木卫二专属, 其他任务不渲染探测块）
    iceProbeEnabled: activeMissionId === "europa1",
    iceProbeState: rover.iceProbeState,
    iceProbeLatest: rover.iceProbeLatest,
    startIceProbe: rover.startIceProbe,
    // 冰裂隙深度探测（停在裂隙旁可发起）
    crackProbeState: rover.crackProbeState,
    crackProbeLatest: rover.crackProbeLatest,
    startCrackProbe: rover.startCrackProbe,
    // 冰下海洋取水（测深判定直通后一次性提取特殊水样）
    oceanSampleState: rover.oceanSampleState,
    oceanSampleTaken: rover.oceanSampleTaken,
    startOceanSample: rover.startOceanSample,
    // 成就墙（双任务通用, 内存态, 任务切换不清空）
    achievementList: ACHIEVEMENTS,
    achievementMap,
    achievementCount,
    achievementTotal: ACHIEVEMENT_TOTAL,
    achievementWallOpen,
    openAchievementWall,
    closeAchievementWall,
    achievementToast,
    achievementToastDef,
    // 任务进度总览（三任务着陆/采样/化验/成就进度, 顶栏按钮打开）
    overviewOpen,
    openOverview,
    closeOverview,
    missionProgress,
    landedMissions,
    // 生涯统计弹层（career 持久计数快照 + 清除存档）
    careerOpen,
    careerSnap,
    openCareer,
    closeCareer,
    clearSave,
    // 每日挑战模式（当日天体 + 修饰条件 / 连击数据 / 开始入口）
    dailyOpen,
    dailySnap,
    openDaily,
    closeDaily,
    dailyDoneToday,
    challengeActive,
    startDailyChallenge,
    // 每日挑战「精密着陆」修饰 → 手动着陆侧风 ×1.5 + 成功着陆区收窄
    manualWindBoost: challengeActive && !!challengeRef.current?.modIds.includes("precision_landing") ? 1.5 : 1,
    manualTightZone: challengeActive && !!challengeRef.current?.modIds.includes("precision_landing"),
    // 样品博物馆陈列厅（跨任务内存态, 任务切换不清空）
    museumOpen,
    openMuseum,
    closeMuseum,
    museumEntries,
    museumCount: museumEntries.length,
    museumCelebrateKeys,
    museumReport,
    openMuseumReport,
    closeMuseumReport,
    // 任务简报开场叠层（上电自检结束后、待发射常态前）
    briefingOpen,
    dismissBriefing,
    briefingStations,
    lightDelayNote: def.lightDelayNote,
    // 动效导览弹层 + 减弱动画开关
    guideOpen,
    openGuide,
    closeGuide,
    reducedMotion,
    toggleReducedMotion,
    // 性能档位三档循环（画质/均衡/省电, localStorage 记忆; reducedMotion 优先）
    perfTier,
    cyclePerfTier,
    // 玩法系统：手动着陆挑战 / 值班指令 / 航行突发事件 / 任务结算单 / 越野拉力赛
    manualLandingOpen,
    completeManualLanding,
    dutyMerit,
    dutyTask,
    dutyDoneCount,
    crisis,
    resolveCrisis,
    // 随机交互事件：流星雨点录 / 紧急演练标靶 / 中继握手长按
    shower,
    onMeteorHit,
    drill,
    onDrillHit,
    handshake,
    completeHandshake,
    // 第三十二轮新玩法：诊断快检 / 呼号抽问 / 天线对准 / 极光观测
    diag,
    completeDiag,
    quiz,
    answerQuiz,
    antenna,
    completeAntenna,
    aurora,
    onAuroraHit,
    wishConstellation,
    startDustClean: rover.startDustClean,
    honkRover: rover.honkRover,
    flashRoverLights: rover.flashRoverLights,
    morseFlash: rover.morseFlash,
    pressRoverSpin: rover.pressRoverSpin,
    releaseRoverSpin: rover.releaseRoverSpin,
    toggleRoverFine: rover.toggleFineMode,
    takeRoverPhoto: rover.takePhoto,
    cycleRoverPhotoFilter: rover.cyclePhotoFilter,
    roverPhotoLog: rover.photoLog,
    removeRoverPhoto: rover.removePhoto,
    setRoverGrainLevel: rover.setGrainLevel,
    toggleRoverArmPause: rover.toggleArmPause,
    cancelRoverArm: rover.cancelArm,
    roverActionKeys: rover.actionKeys,
    setRoverActionKey: rover.setActionKey,
    resetRoverActionKeys: rover.resetActionKeys,
    skipSequence,
    debriefOpen,
    debriefData,
    openDebrief,
    closeDebrief,
    debriefAvailable,
    // 阶段迁跃与表面作业链（增强 N）
    onJumpPhase: jumpToPhase,
    onSkipPhase: skipCurrentPhase,
    canJumpPhase,
    onTriggerSurfaceEvent: triggerSurfaceEvent,
    onTriggerVenusEvac: triggerVenusEvac,
    redeployToStandby,
    // 迁跃过场动画（增强 N 扩展）
    warpLabel,
    warpSeq,
    clearWarp,
    // 配乐名目试听（批次 O 再增补）
    previewMusic,
    stopMusicPreview,
    rallyHud: rover.rallyHud,
    rallyResult: rover.rallyResult,
    rallyBestS: rover.rallyBestS,
    rallyBestRevS: rover.rallyBestRevS,
    rallyBestNightS: rover.rallyBestNightS,
    startRally: rover.startRally,
  };
}
