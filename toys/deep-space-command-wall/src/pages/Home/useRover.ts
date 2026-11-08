// 玉兔号月球车遥控 Logic（由 useHome 组合，View 只消费快照）。
// 纯前端模拟：位置/速度/里程/电量/温度状态机 + 键盘与屏幕方向键输入 + 巡视里程碑日志
// + 机械臂采样状态机（idle→deploy→drill→retract→stored，约 7 秒，耗电 8-10%）。
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommLine } from "@/lib/commScript";
import { playAckConfirm, playAlarmBeep, playCoverClick, playRoverFlash, playRoverHorn, playRoverMelody, playStormCountdownTick } from "@/lib/missionAudio";
import type { MissionId, RoverCfg } from "@/lib/missions";
import {
  ANALYSIS_TOTAL_S,
  analysisStageAt,
  buildSampleReport,
  type SampleReport,
} from "@/lib/sampleAnalysis";

export type RoverDir = "up" | "down" | "left" | "right";

export type RoverLogLevel = "nominal" | "caution" | "critical";

/** 机械臂采样阶段：待机 → 展开 → 钻取 → 收回 → 样品入舱 */
export type ArmPhase = "idle" | "deploy" | "drill" | "retract" | "stored";

export interface RoverSample {
  id: number;
  /** 样品编号，如 YT-S001 */
  code: string;
  /** 采集点位名（最近路过的撞击坑 或 当前坐标点位） */
  siteName: string;
  /** 采样点遥感预测评级（世界坐标散列, 与 canvas 预览圈同源公式）——真实化验向其倾斜 */
  predGrade?: "S" | "A" | "B";
  /** 新鲜冰晶窗口加成标记（欧罗巴冰裂隙喷发玩法）：化验通道对该样品强制 S 级 */
  forceGrade?: "S";
}

export interface RoverSnapshot {
  x: number; // 世界坐标 (m)
  y: number;
  heading: number; // 弧度, 0 = 指向 +x
  speed: number; // m/s
  odometer: number; // 累计行驶 (m)
  battery: number; // 电池电量 %
  tempC: number; // 车体温度 ℃
  moving: boolean;
  batteryDead: boolean;
  /** 机械臂当前阶段 */
  armPhase: ArmPhase;
  /** 机械臂伸出比例 0..1（canvas 动画用） */
  armExtension: number;
  /** 是否处于钻取中（canvas 画采样点脉冲） */
  armDrilling: boolean;
  /** 机械臂暂停中（deploy/drill 阶段挂起, 钻头悬停可续钻） */
  armPaused: boolean;
  /** 采样点世界坐标（臂激活期间非空） */
  armSite: { x: number; y: number } | null;
  /** 木卫二冰裂隙事件：裂隙世界坐标与走向（显示期间非空, canvas 画锯齿暗线） */
  crack: { x: number; y: number; ang: number } | null;
  /** 裂隙告警进行中（未绕行/未制动, 面板红徽标） */
  crackAlert: boolean;
  /** 车停在裂隙旁（<9m, 可做裂隙深度探测） */
  crackNearby: boolean;
  /** 紧急制动车身晃动（0.5s 窗口） */
  hardBrake: boolean;
  /** 裂隙绕行驾驶评价（3.2s 窗口后消失） */
  crackReview: string | null;
  /** 裂隙取样窗口剩余整秒（裂隙存在期间非空, 归零即闭合） */
  crackRemainS: number | null;
  /** 越野拉力赛检查点（比赛进行中非空, canvas 画编号旗标; seq = 通过顺序号, 倒序航线旗号与物理顺序相反） */
  rallyPoints: { x: number; y: number; got: boolean; seq: number }[] | null;
  /** 夜航无灯拉力进行中（canvas 暗幕 + 头灯光晕, 旗标画成发光信标） */
  rallyNight: boolean;
  /** 车轮陷沙（非空 = 陷车中: alt 有效摇摆次数/6, remainS 自动脱困倒计时, rescueReady 救援车已就位可拖曳, tug 钢缆挂接次数/3） */
  stuck: { alt: number; remainS: number; rescueReady: boolean; tug: number } | null;
  /** 补给空投箱（非空 = 场上有补给箱: 世界坐标 + 信标剩余秒, 驶过 4m 内拾取回电; rare = 稀有物资 +50%, 仅 40s 争夺窗口） */
  supply: { x: number; y: number; remainS: number; rare: boolean } | null;
  /** 稀有箱拾取庆祝特效（世界坐标 + 结束时间戳, canvas 画金色冲击环与星芒粒子, 约 1.4s） */
  supplyBurst: { x: number; y: number; until: number } | null;
  /** 太阳能板积尘百分比（0-100, 折减静止回充效率; ≥40% 面板提示清扫） */
  dust: number;
  /** 清扫刷行程进行中（约 1.5s, 期间不落尘） */
  dustCleaning: boolean;
  /** 发电报表：本次任务累计太阳能发电量与积尘折损量（%, 取整） */
  gen: { total: number; lost: number };
  /** 喇叭最近按下时间戳（canvas 画声波环扩散约 0.9s; 0 = 未响过） */
  hornAt: number;
  /** 前照灯双闪截止时间戳（canvas 闪三下; 已过 = 不闪） */
  flashUntil: number;
  /** 摩斯灯语播放中的时间线（canvas 按 segments 表闪烁; null = 未在播放） */
  morse: { startAt: number; totalMs: number; segs: { on: boolean; dur: number }[] } | null;
  /** 原地漂移旋转中（按住动作按钮; canvas 扬环形尘土） */
  spin: boolean;
  /** 精细操作模式（速度上限 ×0.4, 采样对点与绕坑更稳） */
  fineMode: boolean;
  /** 拍照闪光时间戳（canvas 白闪 0.25s + 1s 取景框; 0 = 未拍过） */
  photoFlash: number;
  /** 拍照滤镜（0 标准白 / 1 金色纪念 / 2 冰蓝 / 3 复古, 手动切换; canvas 取景框染色, 复古颗粒越拍越浓） */
  photoFilter: number;
  /** 累计拍照张数（成就/相册计数） */
  photoCount: number;
  /** 复古滤镜颗粒浓度（0-200 手动滑杆, canvas RETRO 取景噪点数量） */
  grainLevel: number;
}

export interface CraterMark {
  id: number;
  x: number;
  y: number;
  r: number;
}

/** 样品化验进行中快照（RoverControl 进度条 + 阶段文案用） */
export interface AnalysisProgress {
  sampleId: number;
  sampleCode: string;
  stageIndex: number;
  stageLabel: string;
  progress: number;
}

/** 冰下海洋探测（木卫二专属）：进行中进度 + 每次探测的结果卡 */
export interface IceProbeProgress {
  stageLabel: string;
  progress: number;
}

export interface IceProbeResult {
  id: number;
  /** 冰壳厚度 (m) */
  iceShellM: number;
  /** 海洋深度 (m) */
  oceanDepthM: number;
  /** 盐度 (g/L) */
  salinity: number;
  /** 热液活跃度指数 0-100 */
  hydrothermal: number;
  /** 生命迹象等级 */
  bioHint: string;
}

/** 冰裂隙深度探测结果（停在裂隙旁时可发起） */
export interface CrackProbeResult {
  id: number;
  /** 裂隙深度 (m) */
  depthM: number;
  /** 识别出的冰壳沉积层数 */
  layers: number;
  /** 判定裂隙是否直通冰下海洋 */
  oceanLink: boolean;
}

/** 拉力赛航线变体：正序（由近及远 1→2→3）/ 倒序（先冲最远旗标 3→2→1 折返）/ 夜航无灯（正序路线 + 暗幕头灯光晕, 旗标发光信标） */
export type RallyVariant = "normal" | "reverse" | "night";

/** 越野拉力赛成绩（完赛后生成; grade 按总用时定级, 撞坑罚时计入） */
export interface RallyResult {
  timeS: number;
  penaltyS: number;
  grade: "S" | "A" | "B" | "C" | "DNF";
  best: boolean;
  variant: RallyVariant;
}

/** 拉力赛检查点（按 seq 顺序通过, canvas 画编号旗标） */
interface RallyPoint {
  x: number;
  y: number;
  got: boolean;
  /** 通过顺序号（1 = 第一目标; 倒序航线时物理最远的点 seq=1） */
  seq: number;
}

/** 月面撞击坑（确定性分布, canvas 与里程碑事件共用同一份世界坐标） */
export const ROVER_CRATERS: CraterMark[] = Array.from({ length: 12 }, (_, i) => {
  const angle = i * 2.39996; // 黄金角散布
  const rad = 24 + 30 * Math.sqrt(i + 1);
  return {
    id: i + 1,
    x: Math.cos(angle) * rad * 1.5,
    y: Math.sin(angle) * rad,
    r: 4.5 + ((i * 7) % 9),
  };
});

/** 泰坦甲烷湖标记（世界坐标, canvas 湖面渲染与湖岸采样判定共用） */
export interface TitanLakeMark {
  id: number;
  /** 湖名（泰坦真实湖泊命名: 神话海怪 / 湖泊） */
  name: string;
  x: number;
  y: number;
  r: number;
}

/** 泰坦甲烷湖（确定性分布; 湖岸采样出 HC 碳氢样品, S 级概率上浮） */
export const TITAN_LAKES: TitanLakeMark[] = [
  { id: 1, name: "克拉肯海", x: -142, y: -68, r: 27 },
  { id: 2, name: "丽姬亚海", x: 126, y: -108, r: 20 },
  { id: 3, name: "蓬加海", x: -58, y: 132, r: 15 },
  { id: 4, name: "安大略湖", x: 152, y: 92, r: 11 },
];

const ROVER_TICK_MS = 150;
// 钢缆挂接时机判定：光标扫过周期与判定绿区（与 index.css .tug-sweep 动画周期严格一致, 改一处必须同步另一处）
const TUG_CYCLE_MS = 1600;
const TUG_WIN_LO = 0.35;
const TUG_WIN_HI = 0.65;

/** 挂接绿区窗口：基准 35%-65%, 每成功挂接一次两侧各向内收 3%（越挂越窄, 第三钩最考验时机） */
export function tugWindowAt(tug: number): { lo: number; hi: number } {
  const shrink = Math.min(tug, 2) * 0.03;
  return { lo: TUG_WIN_LO + shrink, hi: TUG_WIN_HI - shrink };
}
const ROVER_MAX_SPEED = 2.4; // m/s
const ROVER_RESP = 5.5; // 油门响应系数
const ROVER_FRICTION = 3.2; // 松手减速 m/s^2
const SPEED_EPS = 0.08;
const BATTERY_DRAIN = 0.55; // %/s 行驶耗电
const SOLAR_CHARGE = 0.85; // %/s 静止太阳能回充（受电池板积尘折减）

/* ---- 太阳能板积尘常量 ---- */
const DUST_GAIN = 0.15; // %/s 常态落尘速率
const DUST_STORM_GAIN = 0.5; // %/s 沙尘暴期间落尘速率
const DUST_CLEAN_MS = 1500; // 清扫刷行程时长
const DUST_CLEAN_MIN = 20; // 允许发起清扫的最低积尘 %

/* ---- 摩斯灯语（自定义短句, 最多 6 个字母）---- */
const MORSE_MAP: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---",
  K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-",
  U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
};
const MORSE_DOT_MS = 100; // 点时长（划 = 3 倍, 符号间 1 点, 字母间 3 点）

/** 动作快捷键组合匹配：binding 形如 "shift+q" / "ctrl+alt+k" / " " / "f"（修饰键前缀 + 主键） */
function matchActionKey(binding: string, e: KeyboardEvent, ignoreMods = false): boolean {
  const parts = binding.split("+");
  const base = parts[parts.length - 1];
  const k = e.key.toLowerCase();
  const baseHit = k === base || (base === " " && e.code === "Space");
  if (!baseHit) return false;
  if (ignoreMods) return true;
  return e.ctrlKey === parts.includes("ctrl") && e.shiftKey === parts.includes("shift") && e.altKey === parts.includes("alt");
}

/** 文本 → 摩斯灯语明灭时间线（on/off 段序列） */
function buildMorseSegs(text: string): { on: boolean; dur: number }[] {
  const segs: { on: boolean; dur: number }[] = [];
  text.split("").forEach((ch, ci) => {
    const code = MORSE_MAP[ch];
    if (!code) return;
    if (ci > 0) segs.push({ on: false, dur: MORSE_DOT_MS * 2 }); // 字母间额外间隔（符号间 1 点已含）
    code.split("").forEach((sym, si) => {
      if (si > 0) segs.push({ on: false, dur: MORSE_DOT_MS });
      segs.push({ on: true, dur: sym === "." ? MORSE_DOT_MS : MORSE_DOT_MS * 3 });
    });
  });
  return segs;
}
const DEAD_REVIVE_AT = 5; // 回充到该电量恢复机动
const ODO_MARK_STEP = 100; // 每 N 米插一条里程日志

/* ---- 机械臂采样常量 ---- */
const ARM_DEPLOY_S = 1.5;
const ARM_DRILL_S = 3.0;
const ARM_RETRACT_S = 1.5;
const ARM_STORE_S = 1.0;
const ARM_TOTAL_S = ARM_DEPLOY_S + ARM_DRILL_S + ARM_RETRACT_S + ARM_STORE_S;
const ARM_WORK_S = ARM_DEPLOY_S + ARM_DRILL_S + ARM_RETRACT_S; // 耗电分摊区间
const SAMPLE_COST_MIN = 8; // 采样耗电下限 %
const SAMPLE_COST_SPAN = 2; // 耗电随机浮动 %
const SAMPLE_MIN_BATTERY = 15; // 电量门限 %
const ARM_REACH_M = 4.5; // 采样点距车体中心 (m)
const SURVIVAL_DRAIN = 0.22; // %/s 全球风暴生存模式电池亏损

/* ---- 冰下海洋探测常量（木卫二专属） ---- */
const ICE_PROBE_TOTAL_S = 9; // 三段全程时长
const ICE_PROBE_COST = 25; // 单次探测耗电 %
const ICE_PROBE_MIN_BATTERY = 40; // 电量门限 %

/* ---- 越野拉力赛常量 ---- */
const RALLY_TIME_S = 90; // 单场限时（秒）
const RALLY_POINTS = 3; // 检查点数量
const RALLY_CP_RADIUS_M = 5; // 检查点通过判定半径 (m)
const RALLY_CRATER_PENALTY_S = 3; // 撞坑罚时（秒/坑, 每坑限一次）

const INITIAL_SNAPSHOT: RoverSnapshot = {
  x: 0,
  y: 0,
  heading: -Math.PI / 2,
  speed: 0,
  odometer: 0,
  battery: 100,
  tempC: 21,
  moving: false,
  batteryDead: false,
  armPhase: "idle",
  armPaused: false,
  armExtension: 0,
  armDrilling: false,
  armSite: null,
  crack: null,
  crackAlert: false,
  crackNearby: false,
  hardBrake: false,
  crackReview: null,
  crackRemainS: null,
  rallyPoints: null,
  rallyNight: false,
  stuck: null,
  supply: null,
  supplyBurst: null,
  dust: 0,
  dustCleaning: false,
  gen: { total: 0, lost: 0 },
  hornAt: 0,
  flashUntil: 0,
  morse: null,
  spin: false,
  fineMode: false,
  photoFlash: 0,
  photoFilter: 0,
  photoCount: 0,
  grainLevel: 110,
};

/** 快照容差深比较：数值差小于显示精度（0.05）视为相等, 用于抑制静止/收敛态的无谓整页重渲染。
 *  引用相等短路 + 结构对称递归, 每 150ms 一次的比较开销可忽略。 */
function snapNear(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.05;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => snapNear(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  if (ak.length !== Object.keys(bo).length) return false;
  return ak.every((k) => snapNear(ao[k], bo[k]));
}

interface UseRoverOptions {
  /** 着陆完成后为 true */
  unlocked: boolean;
  /** 回放模式等场景挂起遥控 */
  suspended: boolean;
  pushLog: (system: string, message: string, level: RoverLogLevel) => void;
  /** 向地面通话字幕队列追加对话（采样汇报用） */
  pushComm: (lines: CommLine[]) => void;
  /** 当前任务的巡视车配置（玉兔号 / 祝融号） */
  roverCfg: RoverCfg;
  /** 撞击坑命名（按 mission 风格） */
  craterNamer: (id: number) => string;
  /** 采样汇报字幕说话方 */
  speakers: { bj: string; cdre: string };
  /** 当前任务 id（化验报告按月壤 / 火星壤语境生成） */
  missionId: MissionId;
  /** 成就解锁回调（幂等, 由 useHome 提供） */
  unlockAchievement: (id: string) => void;
  /** 火星沙尘暴强度 0..1（>0 时: 太阳能回充停止 / 车速上限降低 / 车体温度缓降） */
  stormIntensity: number;
  /** 全球级沙尘暴（强制停车: 车速上限归 0 / 输入禁用 / 电池进入生存亏损） */
  stormGlobal: boolean;
  /** 行驶耗电倍率（金星生存窗口内 = 1.5, 高温环境电机与制冷负载更重） */
  powerMult?: number;
  /** 撤离锁定（金星紧急上升撤离中 = true: 并入全球风暴强制停车通道, 禁驶禁采样） */
  evacLock?: boolean;
  /** 月球微陨石雨「近失弹」命中脉冲（计数递增: 展开/钻取中采样进度扣 30%） */
  armSetbackPulse?: number;
  /** 欧罗巴冰裂隙喷发中断脉冲（计数递增: 作废当前采样 + 样品舱保护锁 3 秒） */
  interruptPulse?: number;
  /** 新鲜冰晶窗口进行中：完成入舱的样品打上必得 S 级标记（化验通道消费 sample.forceGrade） */
  forceGradeS?: boolean;
  /** 泰坦甲烷浓雾遮蔽遥感：采样日志中预测评级显示为「???」（真实化验倾斜不受影响） */
  fogBlind?: boolean;
  /** 本地存档恢复：拉力赛三航线最佳初值（缺省 = 尚无纪录; 仅初始化时读取一次） */
  initialRallyBests?: { std: number | null; rev: number | null; night: number | null };
}

export function useRover({
  unlocked,
  suspended,
  pushLog,
  pushComm,
  roverCfg,
  craterNamer,
  speakers,
  missionId,
  unlockAchievement,
  stormIntensity,
  stormGlobal,
  powerMult = 1,
  evacLock = false,
  armSetbackPulse = 0,
  interruptPulse = 0,
  forceGradeS = false,
  fogBlind = false,
  initialRallyBests,
}: UseRoverOptions) {
  const [roverSnap, setRoverSnap] = useState<RoverSnapshot>(INITIAL_SNAPSHOT);
  // 上一次真正提交给 state 的快照：tick 里先做容差深比较, 没实质变化就跳过 setRoverSnap,
  // 避免静止待机时仍以 6.7Hz 拖着整页 40+ 面板重渲染
  const lastSnapRef = useRef<RoverSnapshot>(INITIAL_SNAPSHOT);
  const [sampleList, setSampleList] = useState<RoverSample[]>([]);
  // 样品化验: 进行中进度 / 已出报告(按样品 id) / 当前打开的报告弹层
  const [analysisState, setAnalysisState] = useState<AnalysisProgress | null>(null);
  const [sampleReports, setSampleReports] = useState<Record<number, SampleReport>>({});
  const [activeReport, setActiveReport] = useState<{ sample: RoverSample; report: SampleReport } | null>(null);
  // 冰下海洋探测（木卫二专属）: 进行中进度 / 最近一次结果卡
  const [iceProbeState, setIceProbeState] = useState<IceProbeProgress | null>(null);
  const [iceProbeLatest, setIceProbeLatest] = useState<IceProbeResult | null>(null);

  const posRef = useRef({ x: 0, y: 0 });
  const velRef = useRef({ x: 0, y: 0 });
  const headingRef = useRef(-Math.PI / 2);
  const batteryRef = useRef(100);
  const odoRef = useRef(0);
  const tempRef = useRef(21);
  const deadRef = useRef(false);
  const keysRef = useRef<Set<RoverDir>>(new Set());
  const visitedCratersRef = useRef<Set<number>>(new Set());
  const nextOdoMarkRef = useRef(ODO_MARK_STEP);

  // 机械臂采样状态
  const armPhaseRef = useRef<ArmPhase>("idle");
  // 机械臂暂停（deploy/drill 阶段可挂起——钻头悬停原地, 可续钻或放弃收臂; 悬停低电边缘告警一次）
  const armPausedRef = useRef(false);
  const armPausedLowBattRef = useRef(false);
  const armElapsedRef = useRef(0);
  const armSiteRef = useRef<{ x: number; y: number } | null>(null);
  const armCostRef = useRef(0);
  const armSampleRef = useRef<RoverSample | null>(null);
  // 表面专属事件介入（月球微陨石雨 / 欧罗巴冰裂隙喷发）：样品舱保护锁截止时间戳 + 新鲜冰晶强制 S 标记
  const chamberLockUntilRef = useRef(0);
  const forceGradeRef = useRef(false);
  const sampleCountRef = useRef(0);
  const lastCraterRef = useRef<number | null>(null);

  // 化验状态机 + 成就回调 ref
  const analysisRef = useRef<{ sampleId: number; elapsed: number } | null>(null);
  const reportsRef = useRef<Record<number, SampleReport>>({});
  // 会话累计 S 级化验报告数（跨任务保留, 满 3 解锁 s_collector）
  const sTotalRef = useRef(0);
  const sampleListRef = useRef<RoverSample[]>([]);
  const drive500Ref = useRef(false);
  const missionIdRef = useRef(missionId);
  const unlockRef = useRef(unlockAchievement);

  /** 巡视车游戏时钟：初值取墙钟, 之后仅在遥控 tick 中按 ROVER_TICK_MS 推进（后台标签被节流时
   *  与物理 dt 同步变慢）, 所有事件期限/冷却/窗口一律基于它, 消除「物理冻结但期限照过期」的双时基错乱 */
  const nowRef = useRef(Date.now());

  // 冰下探测状态机 + 木卫二裂隙事件
  const iceProbeRef = useRef<{ elapsed: number } | null>(null);
  const iceProbeCountRef = useRef(0);
  const crackRef = useRef<{ x: number; y: number; ang: number; until: number; headingAtSpawn: number; spawnAt: number; resolved: boolean } | null>(null);
  const nextCrackAtRef = useRef(nowRef.current + 20000);
  const crackSlowUntilRef = useRef(0);
  const hardBrakeUntilRef = useRef(0);
  const crackReviewRef = useRef<{ text: string; until: number } | null>(null);
  const lowBattLoggedRef = useRef(false);
  // 裂隙深度探测（停在裂隙 <9m 内可发起, 4s 出结果）
  const crackProbeRef = useRef<{ elapsed: number } | null>(null);
  const crackProbeCountRef = useRef(0);
  const [crackProbeState, setCrackProbeState] = useState<{ progress: number } | null>(null);
  const [crackProbeLatest, setCrackProbeLatest] = useState<CrackProbeResult | null>(null);
  const latestCrackProbeRef = useRef<CrackProbeResult | null>(null);
  // 驾驶统计（规避次数 / 教科书级次数）+ 海洋取水状态机
  const evadeCountRef = useRef(0);
  const aceEvadeRef = useRef(0);
  const oceanSampleRef = useRef<{ elapsed: number } | null>(null);
  const oceanSampledIdsRef = useRef<Set<number>>(new Set());
  // 取水失败重试：每道裂隙限一次的「应力回弹重开」已用记录
  const crackRetryUsedIdsRef = useRef<Set<number>>(new Set());
  const crackTickRef = useRef(-1);
  // 越野拉力赛状态机 + 驾驶行为统计（紧急制动计数, 任务结算消费）
  const rallyRef = useRef<{
    points: RallyPoint[];
    /** 通过顺序（points 数组下标序列; 正序 [0,1,2], 倒序 [2,1,0]） */
    order: number[];
    variant: RallyVariant;
    remainMs: number;
    elapsedMs: number;
    hitCraters: Set<number>;
  } | null>(null);
  const rallyBestRef = useRef<number | null>(initialRallyBests?.std ?? null);
  // 倒序航线与夜航无灯各自独立最佳纪录（与正序分开计, 均跨任务保留; 初值可来自本地存档）
  const rallyBestRevRef = useRef<number | null>(initialRallyBests?.rev ?? null);
  const rallyBestNightRef = useRef<number | null>(initialRallyBests?.night ?? null);
  const [rallyHud, setRallyHud] = useState<{ remainS: number; got: number; total: number; penaltyS: number; variant: RallyVariant } | null>(null);
  const [rallyResult, setRallyResult] = useState<RallyResult | null>(null);
  const [rallyBestS, setRallyBestS] = useState<number | null>(initialRallyBests?.std ?? null);
  const [rallyBestRevS, setRallyBestRevS] = useState<number | null>(initialRallyBests?.rev ?? null);
  const [rallyBestNightS, setRallyBestNightS] = useState<number | null>(initialRallyBests?.night ?? null);
  // 车轮陷沙（行驶中低概率, 前后交替按键摇摆脱困; 4s 后救援车就位, 光标扫过绿区时连点三次挂接钢缆拖曳脱困; 8s 超时自动脱困耗电）
  const stuckRef = useRef<{ alt: number; lastDir: RoverDir | null; remainMs: number; elapsedMs: number; tug: number; tugStartAt: number } | null>(null);
  // 补给空投箱（着陆后随机空投, 驶过拾取回电; 普通箱 60s 信标失效, rare 稀有物资 +50% 电量且只有 40s 争夺窗口——最后 10s 每秒倒数哔声）
  const supplyRef = useRef<{ x: number; y: number; remainMs: number; rare: boolean; lastTickS: number } | null>(null);
  // 稀有箱拾取庆祝特效（金色冲击环+星芒粒子, 1.4s 播完自动消失）
  const supplyBurstRef = useRef<{ x: number; y: number; until: number } | null>(null);
  // 太阳能板积尘（常态缓慢落尘, 沙尘暴加速; 折减回充效率; ≥70% 边缘告警一次; 清扫刷 1.5s 行程归零）
  const dustRef = useRef({ pct: 0, cleaningUntil: 0, warnLogged: false });
  // 发电报表（累计发电量与积尘折损量, 静止回充时积分; 切任务复位）
  const genRef = useRef({ total: 0, lost: 0 });
  // 巡视车动作互动：喇叭（声波环）/ 前照灯双闪 / 原地漂移旋转
  const hornAtRef = useRef(0);
  const lastHonkRef = useRef(0);
  const hornCountRef = useRef(0);
  const flashUntilRef = useRef(0);
  const spinHeldRef = useRef(false);
  const spinLoggedRef = useRef(false);
  // 实际旋转中（tick 判定门限通过后置位; snapshot/canvas 尘环消费）
  const spinActiveRef = useRef(false);
  // 漂移累计秒数（结算盘点 + 30s 解锁 drift_king 成就）
  const spinSecsRef = useRef(0);
  const spinAchRef = useRef(false);
  // 单次漂移会话（按下-松开）：时长与累计圈数, 松开时评 S/A/B 级
  const spinSessionRef = useRef({ startAt: 0, turns: 0 });
  // 单次漂移最佳秒数（会话级, 结算盘点「漂移秒数」徽章附注）
  const spinBestRef = useRef(0);
  // 坑沿巡航累计秒数（距撞击坑沿 6m 内行驶的时长, 驾驶风格统计进结算盘点）
  const edgeSecsRef = useRef(0);
  // 摩斯灯语累计发送次数（5 次解锁 morse_ace）
  const morseCountRef = useRef(0);
  // 音乐会三首曲目集齐标记（全 true 解锁 lunar_tour 巡演成就）
  const melodySeenRef = useRef([false, false, false]);
  // 精细操作模式（速度上限 ×0.4）与拍照互动（快门白闪 + 累计计数, 10 张解锁成就; 滤镜每拍轮换: 0 标准 / 1 金色纪念 / 2 冰蓝）
  const fineModeRef = useRef(false);
  const photoCountRef = useRef(0);
  const photoFlashAtRef = useRef(0);
  const photoFilterRef = useRef(0);
  // 复古颗粒浓度手动滑杆（0-200, 默认 110; canvas RETRO 取景噪点数量）
  const grainLevelRef = useRef(110);
  // 喇叭节奏彩蛋：3 秒窗口内的按键时间戳（连按 8 声触发月面小音乐会旋律, 10s 冷却; 三首曲目轮换）
  const recentHornRef = useRef<number[]>([]);
  const lastMelodyRef = useRef(0);
  const melodyIdxRef = useRef(0);
  // 摩斯灯语播放时间线（自定义短句, segments 明灭表; snapshot 透传给 canvas 按表闪烁）
  const morseRef = useRef<{ startAt: number; totalMs: number; segs: { on: boolean; dur: number }[] } | null>(null);
  const nextSupplyAtRef = useRef(0);
  const hardBrakeCountRef = useRef(0);
  const [oceanSampleState, setOceanSampleState] = useState<{ progress: number } | null>(null);
  const [oceanSampleTaken, setOceanSampleTaken] = useState(false);
  // 拍照相册（最新在前, 最多存 20 张: 序号/滤镜/拍摄坐标/拍摄时刻; 面板相册回看消费）
  const [photoLog, setPhotoLog] = useState<{ n: number; filter: number; x: number; y: number; ts: number }[]>([]);

  const unlockedRef = useRef(unlocked);
  const suspendedRef = useRef(suspended);
  const stormRef = useRef(stormIntensity);
  const stormGlobalRef = useRef(stormGlobal || evacLock);
  // 行驶耗电倍率（金星生存窗口 1.5）
  const powerMultRef = useRef(powerMult);
  const prevUnlockedRef = useRef(false);
  // 任务级配置（切换 mission 后回调闭包也能读到最新值）
  const roverCfgRef = useRef(roverCfg);
  const craterNamerRef = useRef(craterNamer);
  const speakersRef = useRef(speakers);

  useEffect(() => {
    roverCfgRef.current = roverCfg;
    craterNamerRef.current = craterNamer;
    speakersRef.current = speakers;
    missionIdRef.current = missionId;
    unlockRef.current = unlockAchievement;
  });

  useEffect(() => {
    unlockedRef.current = unlocked;
    suspendedRef.current = suspended;
  }, [unlocked, suspended]);

  useEffect(() => {
    stormRef.current = stormIntensity;
    // 撤离锁定并入全球风暴强制停车通道: 车速上限归 0 / 输入清空 / 采样与拉力全禁
    stormGlobalRef.current = stormGlobal || evacLock;
    powerMultRef.current = powerMult;
  }, [stormIntensity, stormGlobal, evacLock, powerMult]);

  // 新鲜冰晶窗口标记同步（采样入舱瞬间消费）
  useEffect(() => {
    forceGradeRef.current = forceGradeS;
  }, [forceGradeS]);

  // 泰坦浓雾遥感遮蔽标记同步（采样发起瞬间消费）
  const fogBlindRef = useRef(fogBlind);
  useEffect(() => {
    fogBlindRef.current = fogBlind;
  }, [fogBlind]);

  // 微陨石「近失弹」命中：展开/钻取阶段采样进度回退 30%（动作锁由 useHome 并入 evacLock 通道）
  useEffect(() => {
    if (!armSetbackPulse) return;
    const ph = armPhaseRef.current;
    if (ph === "deploy" || ph === "drill") {
      armElapsedRef.current *= 0.7;
      pushLog("ROVER", "微陨石撞击震扰车体——机械臂钻取进度回退 30%", "caution");
    } else {
      pushLog("ROVER", "微陨石近失撞击! 冲击波震得车体一晃, 机动短暂锁定", "caution");
    }
  }, [armSetbackPulse, pushLog]);

  // 冰裂隙喷发中断：作废当前采样紧急收臂 + 样品舱保护锁 3 秒
  useEffect(() => {
    if (!interruptPulse) return;
    const ph = armPhaseRef.current;
    if (ph === "deploy" || ph === "drill") {
      armSampleRef.current = null;
      armElapsedRef.current = ARM_DEPLOY_S + ARM_DRILL_S; // 跳到回收段起点
      pushLog("ROVER", "冰裂隙喷发震扰车体——本次钻取作废, 机械臂紧急回收", "caution");
    }
    chamberLockUntilRef.current = nowRef.current + 3000;
    pushLog("ROVER", "样品舱进入喷发保护锁定（3 秒）, 期间无法发起新采样", "caution");
  }, [interruptPulse, pushLog]);

  // 着陆解锁剧情衔接
  useEffect(() => {
    if (unlocked && !prevUnlockedRef.current) {
      pushLog("ROVER", roverCfgRef.current.unlockLog, "nominal");
      // 着陆解锁后排定首次补给空投（45-90s 后）
      nextSupplyAtRef.current = nowRef.current + 45000 + Math.random() * 45000;
    }
    prevUnlockedRef.current = unlocked;
  }, [unlocked, pushLog]);

  /** 陷车中记录有效摇摆：前/后方向交替按压才计数（满 6 次脱困） */
  const noteStuckPress = (dir: RoverDir) => {
    const st = stuckRef.current;
    if (st && (dir === "up" || dir === "down") && st.lastDir !== dir) {
      st.alt += 1;
      st.lastDir = dir;
    }
  };

  /** 请求救援车拖曳：陷车且救援车已就位（4s 后）时可用——光标扫进绿区时点击才算挂牢钢缆, 连挂三次拖曳脱困不耗电（自救摇摆则完全不用等） */
  const requestRescue = useCallback(() => {
    const st = stuckRef.current;
    if (!st || st.elapsedMs < 4000) return;
    // 时机判定：光标相位 = 就位以来时间在扫过周期中的位置, 落在绿区才算挂牢（绿区随挂接次数收窄）
    const phase = ((nowRef.current - st.tugStartAt) % TUG_CYCLE_MS) / TUG_CYCLE_MS;
    const win = tugWindowAt(st.tug);
    if (phase < win.lo || phase > win.hi) {
      playAlarmBeep("caution");
      pushLog("ROVER", "挂钩没对准! 钢缆滑脱——等光标扫进中央绿区再点, 慌什么", "caution");
      return;
    }
    st.tug += 1;
    playAckConfirm();
    if (st.tug < 3) {
      pushLog("ROVER", `钢缆挂接 ${st.tug}/3——绿区已收窄, 盯住光标扫进亮区再挂下一钩!`, "nominal");
      return;
    }
    stuckRef.current = null;
    pushLog("ROVER", "三段钢缆全部挂死, 救援车发力拖曳脱困——没耗车上的电, 不过这趟救援机会用掉了", "nominal");
    pushComm([
      {
        speaker: speakersRef.current.bj,
        text: `救援车已把你们拖出来了, 检查一下底盘。记住: 自己摇摆脱困比等拖曳更快, 也更练手艺。`,
      },
    ]);
  }, [pushLog, pushComm]);

  /** 启动太阳能板清扫刷：积尘 ≥20% 可用, 1.5s 行程匀速推尘归零（行程中不再落尘） */
  const startDustClean = useCallback(() => {
    const du = dustRef.current;
    if (du.pct < DUST_CLEAN_MIN || nowRef.current < du.cleaningUntil) return;
    du.cleaningUntil = nowRef.current + DUST_CLEAN_MS;
    pushLog("ROVER", `清扫刷已启动, ${Math.round(du.pct)}% 积尘开始清除——行程约 1.5 秒, 期间照常值守`, "nominal");
  }, [pushLog]);

  /** 喇叭：双音短鸣 + canvas 声波环（400ms 冷却防连刷; 累计 10 次解锁 moon_honk, 第 3/10 次有专属日志与北京回应） */
  const honkRover = useCallback(() => {
    if (!unlockedRef.current || suspendedRef.current) return;
    const now = nowRef.current;
    if (now - lastHonkRef.current < 400) return;
    lastHonkRef.current = now;
    hornAtRef.current = now;
    hornCountRef.current += 1;
    playRoverHorn();
    // 节奏彩蛋：3 秒内连按 8 声 → 月面小音乐会（八音上行旋律, 10 秒冷却）
    recentHornRef.current = [...recentHornRef.current.filter((ts) => now - ts <= 3000), now];
    if (recentHornRef.current.length >= 8 && now - lastMelodyRef.current > 10000) {
      lastMelodyRef.current = now;
      recentHornRef.current = [];
      const variant = melodyIdxRef.current % 3;
      melodyIdxRef.current += 1;
      playRoverMelody(variant);
      unlockRef.current("lunar_concert");
      melodySeenRef.current[variant] = true;
      const tune = ["八音上行音阶", "欢乐颂", "小星星"][variant];
      pushLog("ROVER", `你在月面按出了一场小音乐会! 喇叭连鸣八声, 这次奏的是「${tune}」——成就「月面小音乐会」解锁, 三首曲目每次轮换`, "nominal");
      if (melodySeenRef.current.every(Boolean)) {
        unlockRef.current("lunar_tour");
        pushLog("ROVER", "三首曲目全部奏齐——成就「月面巡演」解锁! 北京: 这场月面巡回演出圆满收官, 掌声（在真空里）送给你", "nominal");
      }
    }
    if (hornCountRef.current === 3) {
      pushLog("ROVER", `喇叭按到第 ${hornCountRef.current} 次了——这里没有空气, 这声「嘀嘀」其实只有车自己在听`, "nominal");
    }
    if (hornCountRef.current >= 10) unlockRef.current("moon_honk");
    if (hornCountRef.current === 10) {
      pushLog("ROVER", "第十声喇叭! 成就解锁「月面大喇叭」——声波环都替你把尘吹开了一圈", "nominal");
      pushComm([
        {
          speaker: speakersRef.current.bj,
          text: `收到你们连按十声喇叭的记录。月面示意规范里没这一条, 但北京决定睁一只眼闭一只眼——开心就好。`,
        },
      ]);
    }
    if (hornCountRef.current >= 30) unlockRef.current("horn_maestro");
    if (hornCountRef.current === 30) {
      pushLog("ROVER", "第 30 声喇叭! 成就解锁「喇叭演奏家」——真空独奏会圆满收官, 演奏家兼唯一观众都是你", "nominal");
    }
  }, [pushLog, pushComm]);

  /** 前照灯双闪：1.2s 内闪三下（canvas 灯语信标）+ 短嗒音 */
  const flashRoverLights = useCallback(() => {
    if (!unlockedRef.current || suspendedRef.current) return;
    if (nowRef.current < flashUntilRef.current) return;
    flashUntilRef.current = nowRef.current + 1200;
    playRoverFlash();
    pushLog("ROVER", "前照灯双闪三下——给周围的月壤打个灯光信号", "nominal");
  }, [pushLog]);

  /** 摩斯灯语：把自定义短句（≤6 个字母）转成点划时间线, 前照灯按表自动闪烁 */
  const morseFlash = useCallback(
    (text: string) => {
      if (!unlockedRef.current || suspendedRef.current) return;
      const cur = morseRef.current;
      if (cur && nowRef.current < cur.startAt + cur.totalMs) return; // 播放中不重入
      const clean = (text || "HI").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
      if (!clean) return;
      const segs = buildMorseSegs(clean);
      if (segs.length === 0) return;
      const totalMs = segs.reduce((acc, s) => acc + s.dur, 0);
      morseRef.current = { startAt: nowRef.current, totalMs, segs };
      morseCountRef.current += 1;
      playRoverFlash();
      pushLog("ROVER", `前照灯切摩斯灯语——闪出「${clean}」（${(totalMs / 1000).toFixed(1)} 秒）, 向深空发一句只有懂的人才懂的问候`, "nominal");
      if (morseCountRef.current === 5) {
        unlockRef.current("morse_ace");
        pushLog("ROVER", "第 5 句摩斯灯语发出——成就「深空电报员」解锁! 北京: 灯语打得比通信岗还溜", "nominal");
      }
    },
    [pushLog],
  );

  /** 原地漂移：按住快转航向（tick 内耗电+扬尘）, 松开即停并给本次漂移评级（≥8s S / ≥4s A / 其余 B, 满 1s 才报） */
  const pressRoverSpin = useCallback(() => {
    spinHeldRef.current = true;
    spinSessionRef.current = { startAt: nowRef.current, turns: 0 };
  }, []);
  const releaseRoverSpin = useCallback(() => {
    spinHeldRef.current = false;
    const sess = spinSessionRef.current;
    spinSessionRef.current = { startAt: 0, turns: 0 };
    const durMs = nowRef.current - sess.startAt;
    if (durMs >= 1000) {
      const secs = Math.round(durMs / 100) / 10;
      const turns = Math.floor(sess.turns);
      if (secs > spinBestRef.current) spinBestRef.current = secs;
      if (secs >= 8) {
        pushLog("ROVER", `本次漂移 ${secs}s · 转了 ${turns} 圈——S 级漂移大师! 北京: 月壤都被你扫出了一圈环形山`, "nominal");
      } else if (secs >= 4) {
        pushLog("ROVER", `本次漂移 ${secs}s · 转了 ${turns} 圈——A 级, 有模有样。差一点就到 S 级（8 秒）`, "nominal");
      } else {
        pushLog("ROVER", `本次漂移 ${secs}s · 转了 ${turns} 圈——B 级, 想转得更漂亮就多按住一会儿`, "nominal");
      }
    }
  }, [pushLog]);

  /** 精细操作模式切换：速度上限 ×0.4, 采样对点与绕坑微调更稳 */
  const toggleFineMode = useCallback(() => {
    fineModeRef.current = !fineModeRef.current;
    pushLog(
      "ROVER",
      fineModeRef.current
        ? "精细操作模式开启——车速上限压到 40%, 对点和绕坑都更稳（再点一次关闭）"
        : "精细操作模式关闭——恢复全速机动",
      "nominal",
    );
  }, [pushLog]);

  /** 拍照滤镜手动切换（标准 → 金色纪念 → 冰蓝 → 复古 循环; 拍照不再自动轮换） */
  const cyclePhotoFilter = useCallback(() => {
    photoFilterRef.current = (photoFilterRef.current + 1) % 4;
    playCoverClick();
    pushLog("ROVER", `拍照滤镜已切到「${["标准", "金色纪念", "冰蓝", "复古"][photoFilterRef.current]}」——下一张就按这个色调出片`, "nominal");
  }, [pushLog]);

  /** 复古颗粒浓度手动调节（0-200; RETRO 滤镜取景噪点数量, 实时生效） */
  const setGrainLevel = useCallback((v: number) => {
    grainLevelRef.current = Math.max(0, Math.min(200, v));
  }, []);

  /** 相册删除单张：仅移除相册记录, 拍照累计数与成就不回退 */
  const removePhoto = useCallback((n: number) => {
    setPhotoLog((prev) => prev.filter((p) => p.n !== n));
  }, []);

  /** 桅杆相机拍照：快门咔哒 + canvas 白闪与取景框（按当前滤镜染色）; 800ms 冷却, 累计 10 张解锁成就, 每张记入相册 */
  const takePhoto = useCallback(() => {
    if (!unlockedRef.current || suspendedRef.current) return;
    const now = nowRef.current;
    if (now - photoFlashAtRef.current < 800) return;
    photoFlashAtRef.current = now;
    photoCountRef.current += 1;
    setPhotoLog((prev) =>
      [
        { n: photoCountRef.current, filter: photoFilterRef.current, x: Math.round(posRef.current.x), y: Math.round(posRef.current.y), ts: Date.now() },
        ...prev,
      ].slice(0, 20),
    );
    playCoverClick();
    if (photoCountRef.current === 1) {
      pushLog("ROVER", `桅杆相机快门第一次按下——白闪一闪, 这张「到此一游」已存进任务相册（滤镜: ${["标准", "金色纪念", "冰蓝", "复古"][photoFilterRef.current]}）`, "nominal");
    }
    if (photoCountRef.current >= 10) unlockRef.current("space_photographer");
    if (photoCountRef.current === 10) {
      pushLog("ROVER", "第 10 张快门落下——成就「太空首席摄影师」解锁! 北京: 这批月面写真可以办展了", "nominal");
    }
  }, [pushLog]);

  /** 机械臂暂停/续钻：deploy/drill 阶段挂起进度（钻头悬停）, 再点恢复; 暂停中才可一键收臂（防误触） */
  const toggleArmPause = useCallback(() => {
    const ph = armPhaseRef.current;
    if (ph !== "deploy" && ph !== "drill") return;
    armPausedRef.current = !armPausedRef.current;
    if (!armPausedRef.current) armPausedLowBattRef.current = false;
    pushLog(
      "ROVER",
      armPausedRef.current
        ? "机械臂已暂停——钻头悬停原地, 想好了再续钻（悬停期间姿态控制持续小耗电 0.15%/s, 暂停中可收臂放弃）"
        : "续钻指令收到——机械臂从悬停处接着干",
      "nominal",
    );
  }, [pushLog]);

  /** 机械臂一键收臂：仅暂停中可用——放弃本次钻取直接回收（样品作废, 省下剩余时间） */
  const cancelArm = useCallback(() => {
    const ph = armPhaseRef.current;
    if ((ph !== "deploy" && ph !== "drill") || !armPausedRef.current) return;
    armElapsedRef.current = ARM_DEPLOY_S + ARM_DRILL_S; // 跳到回收段起点
    armSampleRef.current = null;
    armPausedRef.current = false;
    armPausedLowBattRef.current = false;
    pushLog("ROVER", "收臂指令收到——机械臂放弃本次钻取, 直接回收（样品作废, 省下了钻取时间）", "caution");
  }, [pushLog]);

  const pressRoverDir = useCallback((dir: RoverDir) => {
    keysRef.current.add(dir);
    noteStuckPress(dir);
  }, []);

  const releaseRoverDir = useCallback((dir: RoverDir) => {
    keysRef.current.delete(dir);
  }, []);

  /** 发起机械臂采样：仅静止且电量 > 15% 且机械臂待机时可用 */
  const startSampling = useCallback(() => {
    if (!unlockedRef.current || suspendedRef.current || stormGlobalRef.current) return;
    if (armPhaseRef.current !== "idle") return;
    if (nowRef.current < chamberLockUntilRef.current) {
      pushLog("ROVER", "样品舱仍在喷发保护锁定中, 机械臂暂不能展开", "caution");
      return;
    }
    const speedNow = Math.hypot(velRef.current.x, velRef.current.y);
    if (speedNow > SPEED_EPS) return;
    if (deadRef.current || batteryRef.current <= SAMPLE_MIN_BATTERY) return;

    const heading = headingRef.current;
    const site = {
      x: posRef.current.x + Math.cos(heading) * ARM_REACH_M,
      y: posRef.current.y + Math.sin(heading) * ARM_REACH_M,
    };
    const nextId = sampleCountRef.current + 1;
    const cfg = roverCfgRef.current;
    // 泰坦湖岸采样点判定: 钻取位落在甲烷湖岸带内 → HC 碳氢样品编号（化验享湖岸富集加成）
    const titanLake =
      missionIdRef.current === "titan1"
        ? (TITAN_LAKES.find((lk) => Math.hypot(site.x - lk.x, site.y - lk.y) <= lk.r + 4) ?? null)
        : null;
    const siteName = titanLake
      ? `${titanLake.name}湖岸`
      : lastCraterRef.current
        ? `${craterNamerRef.current(lastCraterRef.current)}附近`
        : `${cfg.surfaceWord}坐标 (${posRef.current.x.toFixed(0)}, ${posRef.current.y.toFixed(0)}) 点位`;
    armSiteRef.current = site;
    armCostRef.current = SAMPLE_COST_MIN + Math.random() * SAMPLE_COST_SPAN;
    // 遥感预测评级：与 canvas 预览圈同源的世界坐标散列（真实化验 score 向其倾斜; 湖岸带 S 阈值放宽）
    const hsh = Math.abs(Math.sin(site.x * 12.9898 + site.y * 78.233) * 43758.5453) % 1;
    const predGrade: "S" | "A" | "B" = hsh < (titanLake ? 0.3 : 0.12) ? "S" : hsh < 0.4 ? "A" : "B";
    const sampleCode = titanLake
      ? `${cfg.samplePrefix}-HC${String(nextId).padStart(3, "0")}`
      : `${cfg.samplePrefix}-S${String(nextId).padStart(3, "0")}`;
    armSampleRef.current = { id: nextId, code: sampleCode, siteName, predGrade };
    armPhaseRef.current = "deploy";
    armElapsedRef.current = 0;
    // 泰坦浓雾期间光学遥感失效: 日志中预测评级显示为「???」（内部散列照常, 真实化验倾斜不受影响）
    const predText = fogBlindRef.current ? "被浓雾遮蔽 ???" : `${predGrade} 级`;
    pushLog(
      "ROVER",
      `机械臂展开, 在${siteName}开始第 ${nextId} 号样品钻取作业（遥感预测 ${predText}${titanLake ? " · 湖岸碳氢富集带" : ""}）`,
      "nominal",
    );
  }, [pushLog]);

  /** 启动样品化验：约 5.5 秒四段流程（破碎→光谱扫描→成分解析→出报告），舱内设备供电, 不耗车辆电量 */
  const startAnalysis = useCallback(
    (sampleId: number) => {
      if (!unlockedRef.current || suspendedRef.current) return;
      if (analysisRef.current) return;
      if (reportsRef.current[sampleId]) return;
      const sample = sampleListRef.current.find((s) => s.id === sampleId);
      if (!sample) return;
      analysisRef.current = { sampleId, elapsed: 0 };
      setAnalysisState({ sampleId, sampleCode: sample.code, stageIndex: 0, stageLabel: "样品破碎", progress: 0 });
      pushLog("LAB", `样品 ${sample.code} 送入分析舱, 化验流程启动 (破碎 → 光谱扫描 → 成分解析 → 出报告)`, "nominal");
    },
    [pushLog],
  );

  /** 打开已化验样品的成分报告（可反复查看, 同一样品结果恒定） */
  const openSampleReport = useCallback((sampleId: number) => {
    const report = reportsRef.current[sampleId];
    const sample = sampleListRef.current.find((s) => s.id === sampleId);
    if (!report || !sample) return;
    setActiveReport({ sample, report });
  }, []);

  const closeSampleReport = useCallback(() => setActiveReport(null), []);

  /** 发起冰裂隙深度探测：停在裂隙 9m 内 + 静止 + 各机构空闲, 4 秒出分层结果 */
  const startCrackProbe = useCallback(() => {
    if (!unlockedRef.current || suspendedRef.current) return;
    const crack = crackRef.current;
    if (!crack || crackProbeRef.current || iceProbeRef.current || armPhaseRef.current !== "idle") return;
    const dist = Math.hypot(posRef.current.x - crack.x, posRef.current.y - crack.y);
    if (dist > 9) return;
    const speedNow = Math.hypot(velRef.current.x, velRef.current.y);
    if (speedNow > SPEED_EPS || deadRef.current) return;
    crackProbeRef.current = { elapsed: 0 };
    setCrackProbeState({ progress: 0 });
    pushLog("PROBE", "深度探测仪放入冰裂隙, 冰壳分层测深开始", "nominal");
  }, [pushLog]);

  /** 发起冰下海洋取水：最近一次测深判定直通海洋、裂隙窗口仍开放且未取过水, 静止时 5s 提取（耗电 10%） */
  const startOceanSample = useCallback(() => {
    if (!unlockedRef.current || suspendedRef.current) return;
    const latest = latestCrackProbeRef.current;
    if (!latest?.oceanLink || oceanSampledIdsRef.current.has(latest.id)) return;
    // 取水样管必须放进仍然张开的裂隙——窗口闭合后不可再取
    if (!crackRef.current) return;
    if (oceanSampleRef.current || crackProbeRef.current || iceProbeRef.current || armPhaseRef.current !== "idle") return;
    const speedNow = Math.hypot(velRef.current.x, velRef.current.y);
    if (speedNow > SPEED_EPS || deadRef.current) return;
    oceanSampleRef.current = { elapsed: 0 };
    setOceanSampleState({ progress: 0 });
    pushLog("PROBE", "取水样管下放, 经直通裂隙从冰下海洋直接提取水样", "nominal");
  }, [pushLog]);

  /** 发起越野拉力赛：限时依次通过 3 个检查点（正序由近及远 / 倒序先冲最远旗标折返 / 夜航无灯暗幕信标）, 撞坑罚时, 完赛定级并刷新对应航线本地最佳 */
  const startRally = useCallback((variant: RallyVariant = "normal") => {
    if (!unlockedRef.current || suspendedRef.current || stormGlobalRef.current) return;
    if (rallyRef.current || armPhaseRef.current !== "idle" || iceProbeRef.current || crackProbeRef.current || oceanSampleRef.current) return;
    if (deadRef.current) return;
    const pts: RallyPoint[] = [];
    let px = posRef.current.x;
    let py = posRef.current.y;
    for (let i = 0; i < RALLY_POINTS; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 25 + Math.random() * 30;
      px += Math.cos(ang) * dist;
      py += Math.sin(ang) * dist;
      // 倒序航线：物理最远的点先冲（seq=1）, 依次折返; 正序与夜航按由近及远
      pts.push({ x: px, y: py, got: false, seq: variant === "reverse" ? RALLY_POINTS - i : i + 1 });
    }
    const order = variant === "reverse" ? [RALLY_POINTS - 1, RALLY_POINTS - 2, 0] : [0, 1, 2];
    rallyRef.current = { points: pts, order, variant, remainMs: RALLY_TIME_S * 1000, elapsedMs: 0, hitCraters: new Set() };
    setRallyResult(null);
    setRallyHud({ remainS: RALLY_TIME_S, got: 0, total: RALLY_POINTS, penaltyS: 0, variant });
    pushLog(
      "ROVER",
      variant === "reverse"
        ? `越野拉力赛（倒序航线 REVERSE）开始! 限时 ${RALLY_TIME_S}s 先冲最远旗标再依次折返, 擦撞坑沿每次罚时 +${RALLY_CRATER_PENALTY_S}s`
        : variant === "night"
          ? `越野拉力赛（夜航无灯 NIGHT RUN）开始! 场地熄灯, 限时 ${RALLY_TIME_S}s 借头灯光晕与信标旗光依次过点, 撞坑罚时照旧 +${RALLY_CRATER_PENALTY_S}s`
          : `越野拉力赛开始! 限时 ${RALLY_TIME_S}s 依次通过 ${RALLY_POINTS} 个检查点, 擦撞坑沿每次罚时 +${RALLY_CRATER_PENALTY_S}s`,
      "nominal",
    );
  }, [pushLog]);

  /** 发起冰下海洋探测（木卫二专属）：静止 + 电量 > 40% + 机械臂/探测均空闲, 全程 9s 耗电 25% */
  const startIceProbe = useCallback(() => {
    if (!unlockedRef.current || suspendedRef.current) return;
    if (missionIdRef.current !== "europa1") return;
    if (iceProbeRef.current || armPhaseRef.current !== "idle") return;
    const speedNow = Math.hypot(velRef.current.x, velRef.current.y);
    if (speedNow > SPEED_EPS) return;
    if (deadRef.current || batteryRef.current <= ICE_PROBE_MIN_BATTERY) return;
    iceProbeRef.current = { elapsed: 0 };
    setIceProbeState({ stageLabel: "熔钻下潜", progress: 0 });
    pushLog("PROBE", "熔钻探测器布放, 冰下海洋探测流程启动 (熔钻下潜 → 声呐扫描 → 数据解析)", "nominal");
  }, [pushLog]);

  // 键盘遥控: W/A/S/D + 方向键（解锁且非回放时生效）
  useEffect(() => {
    const keyMap: Record<string, RoverDir> = {
      w: "up", W: "up", ArrowUp: "up",
      s: "down", S: "down", ArrowDown: "down",
      a: "left", A: "left", ArrowLeft: "left",
      d: "right", D: "right", ArrowRight: "right",
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const dir = keyMap[e.key];
      if (!dir || !unlockedRef.current || suspendedRef.current || stormGlobalRef.current) return;
      // 输入焦点在文本框时不劫持按键（否则在输入框里打 w/a/s/d 或方向键会驱动巡视车并吞键）
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      if (!keysRef.current.has(dir)) noteStuckPress(dir); // 长按重复 keydown 不重复计数
      keysRef.current.add(dir);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const dir = keyMap[e.key];
      if (dir) keysRef.current.delete(dir);
    };
    const onBlur = () => keysRef.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // 键盘动作快捷键（自定义映射: keymapRef 存当前按键, actionKeys state 镜像给面板显示; 键位持久化到 localStorage 会话记忆）
  const keymapRef = useRef({ honk: " ", flash: "f", drift: "q" });
  const [actionKeys, setActionKeys] = useState({ honk: " ", flash: "f", drift: "q" });
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("rover-action-keys");
      if (raw) {
        const saved = JSON.parse(raw) as { honk?: string; flash?: string; drift?: string };
        const next = { honk: saved.honk ?? " ", flash: saved.flash ?? "f", drift: saved.drift ?? "q" };
        keymapRef.current = next;
        setActionKeys(next);
      }
    } catch {
      /* 存储不可用时静默走默认键位 */
    }
  }, []);
  /** 重映射动作快捷键（honk 喇叭 / flash 双闪 / drift 漂移; 支持组合键串如 shift+q）——冲突检测: 新键已被其它动作占用时自动清空对方槽位并播报 */
  const setActionKey = useCallback(
    (action: "honk" | "flash" | "drift", key: string) => {
      const next = key.toLowerCase();
      const conflict = (["honk", "flash", "drift"] as const).find((a) => a !== action && keymapRef.current[a] === next);
      if (conflict) {
        keymapRef.current = { ...keymapRef.current, [conflict]: "" };
        pushLog("ROVER", `键位冲突: 「${next}」已改绑给${action === "honk" ? "喇叭" : action === "flash" ? "双闪" : "漂移"}, 原${conflict === "honk" ? "喇叭" : conflict === "flash" ? "双闪" : "漂移"}动作键已清空（点徽章可重绑）`, "caution");
      }
      keymapRef.current = { ...keymapRef.current, [action]: next };
      setActionKeys({ ...keymapRef.current });
      try {
        window.localStorage.setItem("rover-action-keys", JSON.stringify(keymapRef.current));
      } catch {
        /* 存储不可用时仅本会话生效 */
      }
    },
    [pushLog],
  );
  /** 动作快捷键恢复默认（空格=喇叭 / F=双闪 / Q=漂移）, 同步写 localStorage */
  const resetActionKeys = useCallback(() => {
    keymapRef.current = { honk: " ", flash: "f", drift: "q" };
    setActionKeys({ ...keymapRef.current });
    try {
      window.localStorage.setItem("rover-action-keys", JSON.stringify(keymapRef.current));
    } catch {
      /* 存储不可用时仅本会话生效 */
    }
    pushLog("ROVER", "动作快捷键已恢复默认: 空格=喇叭 / F=双闪 / Q=漂移", "nominal");
  }, [pushLog]);
  useEffect(() => {
    const onActionKey = (e: KeyboardEvent) => {
      if (!unlockedRef.current || suspendedRef.current || stormGlobalRef.current) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.repeat) return;
      if (matchActionKey(keymapRef.current.honk, e)) {
        e.preventDefault();
        honkRover();
      } else if (matchActionKey(keymapRef.current.flash, e)) {
        flashRoverLights();
      } else if (matchActionKey(keymapRef.current.drift, e)) {
        e.preventDefault();
        pressRoverSpin();
      }
    };
    const onActionKeyUp = (e: KeyboardEvent) => {
      // 松开判定忽略修饰键状态（组合键先松修饰也能正确停止漂移）
      if (matchActionKey(keymapRef.current.drift, e, true)) releaseRoverSpin();
    };
    const onWinBlur = () => releaseRoverSpin();
    window.addEventListener("keydown", onActionKey);
    window.addEventListener("keyup", onActionKeyUp);
    window.addEventListener("blur", onWinBlur);
    return () => {
      window.removeEventListener("keydown", onActionKey);
      window.removeEventListener("keyup", onActionKeyUp);
      window.removeEventListener("blur", onWinBlur);
    };
  }, [honkRover, flashRoverLights, pressRoverSpin, releaseRoverSpin]);

  // 运动/电量/温度/里程碑/机械臂主循环（解锁后才启动）
  useEffect(() => {
    if (!unlocked) return;
    const dt = ROVER_TICK_MS / 1000;
    const timer = window.setInterval(() => {
      if (suspendedRef.current) return;
      // 游戏时钟推进：与物理 dt 同源, 标签页隐藏被节流时二者一起变慢, 事件期限不再提前过期
      nowRef.current += ROVER_TICK_MS;

      // ---- 机械臂采样推进（采样期间锁定机动与太阳能回充） ----
      const armActive = armPhaseRef.current !== "idle";
      let armExtension = 0;
      let armDrilling = false;
      if (armActive) {
        keysRef.current.clear();
        if (!armPausedRef.current) armElapsedRef.current += dt;
        else {
          // 悬停姿态控制耗电; 低电边缘告警一次（解除暂停/收臂后复位）
          batteryRef.current = Math.max(0, batteryRef.current - 0.15 * dt);
          if (batteryRef.current <= 20 && !armPausedLowBattRef.current) {
            armPausedLowBattRef.current = true;
            pushLog("ROVER", "机械臂悬停耗电已把电量拖进低电区间——建议尽快续钻收尾或收臂, 别把电耗在发呆上", "caution");
          }
        }
        const el = armElapsedRef.current;
        if (el < ARM_DEPLOY_S) {
          armPhaseRef.current = "deploy";
          armExtension = el / ARM_DEPLOY_S;
        } else if (el < ARM_DEPLOY_S + ARM_DRILL_S) {
          armPhaseRef.current = "drill";
          armExtension = 1;
          armDrilling = !armPausedRef.current;
        } else if (el < ARM_WORK_S) {
          armPhaseRef.current = "retract";
          armExtension = 1 - (el - ARM_DEPLOY_S - ARM_DRILL_S) / ARM_RETRACT_S;
        } else if (el < ARM_TOTAL_S) {
          armPhaseRef.current = "stored";
          armExtension = 0;
        } else {
          // 采样完成：样品入舱 + 里程碑日志 + 汇报字幕
          const sample = armSampleRef.current;
          armPhaseRef.current = "idle";
          armPausedRef.current = false;
          armPausedLowBattRef.current = false;
          armSiteRef.current = null;
          armSampleRef.current = null;
          if (sample) {
            // 新鲜冰晶窗口：入舱样品打上必得 S 级标记（化验通道强制覆盖评级）
            if (forceGradeRef.current) sample.forceGrade = "S";
            sampleCountRef.current += 1;
            sampleListRef.current = [...sampleListRef.current, sample];
            setSampleList((prev) => [...prev, sample]);
            unlockRef.current("first_sample");
            if (sampleCountRef.current >= 3) unlockRef.current("samples_3");
            pushLog(
              "ROVER",
              `在${sample.siteName}完成第 ${sample.id} 号样品采集, 样品 ${sample.code} 已封装入舱`,
              "nominal",
            );
            pushComm([
              {
                speaker: speakersRef.current.cdre,
                text: `北京，${roverCfgRef.current.roverName}报告：第${sample.id}号样品采集完成，编号 ${sample.code}，已密封封装入舱。`,
              },
              {
                speaker: speakersRef.current.bj,
                text: `北京收到，确认 ${sample.code} 号样品入舱。密封状态良好，按计划继续巡视。`,
              },
            ]);
          }
        }
        // 耗电按工作段（展开→钻取→收回）分摊
        if (el < ARM_WORK_S) {
          batteryRef.current = Math.max(0, batteryRef.current - (armCostRef.current * dt) / ARM_WORK_S);
        }
      }

      // ---- 样品化验推进（分析舱用着陆器电, 不耗车辆电量, 与机械臂可并行） ----
      if (analysisRef.current) {
        const an = analysisRef.current;
        an.elapsed += dt;
        const progress = Math.min(1, an.elapsed / ANALYSIS_TOTAL_S);
        const anSample = sampleListRef.current.find((s) => s.id === an.sampleId) ?? null;
        const stage = analysisStageAt(progress);
        setAnalysisState({
          sampleId: an.sampleId,
          sampleCode: anSample?.code ?? "",
          stageIndex: stage.index,
          stageLabel: stage.label,
          progress,
        });
        if (progress >= 1) {
          analysisRef.current = null;
          setAnalysisState(null);
          if (anSample) {
            const report = buildSampleReport({
              sampleCode: anSample.code,
              siteName: anSample.siteName,
              missionId: missionIdRef.current,
              predGrade: anSample.predGrade,
              forceGrade: anSample.forceGrade,
            });
            reportsRef.current = { ...reportsRef.current, [anSample.id]: report };
            setSampleReports(reportsRef.current);
            // S 级收藏家：会话累计化验出 3 份 S 级报告解锁（跨任务保留）
            if (report.grade === "S") {
              sTotalRef.current += 1;
              if (sTotalRef.current === 3) {
                unlockRef.current("s_collector");
                pushLog("LAB", "第 3 份 S 级化验报告出具——成就「S 级收藏家」解锁! 北京: 你的样品柜已经是半个珍宝馆了", "nominal");
              }
            }
            if (report.oceanWater) {
              pushLog(
                "LAB",
                `海洋水样 ${anSample.code} 化验完成: 确认液态水体, 溶质谱与地球深海水高度相似, 科学价值 S 级`,
                "nominal",
              );
            } else {
              pushLog(
                "LAB",
                `样品 ${anSample.code} 化验完成: 科学价值评级 ${report.grade} 级${report.waterSignal ? ", 光谱检出明确含水信号" : ""}`,
                "nominal",
              );
            }
            unlockRef.current("first_analysis");
            // 成就解锁与播报分开：海洋水样恒 S 级 + 恒含水, 两枚成就照常解锁, 播报走专属台词
            if (report.grade === "S") unlockRef.current("grade_s");
            if (report.waterSignal) unlockRef.current("water_signal");
            if (report.oceanWater) {
              pushComm([
                {
                  speaker: speakersRef.current.bj,
                  text: `北京通报全体：海洋水样 ${anSample.code} 化验结果出来了——液态水体确认，盐度与 pH 落在宜居区间，还检出了有机大分子！这是人类第一次拿到外星海洋的化学成分表，历史会记住今天！`,
                },
                {
                  speaker: speakersRef.current.cdre,
                  text: `北京，收到通报，乘组全体起立鼓掌。我们从冰裂隙里取回的那管水，真的是一片活着的海。请求把 ${anSample.code} 列为最高优先级回传样品。`,
                },
              ]);
            } else if (report.grade === "S") {
              pushComm([
                {
                  speaker: speakersRef.current.bj,
                  text: `北京通报全体：样品 ${anSample.code} 化验结果出来了——科学价值 S 级！矿物组合极为罕见，这是本次任务最重大的发现之一！`,
                },
                {
                  speaker: speakersRef.current.cdre,
                  text: `收到北京的通报，${roverCfgRef.current.roverName}乘组与有荣焉。S 级样品已加密封存，建议列为优先回传候选。`,
                },
              ]);
            } else if (report.waterSignal) {
              pushComm([
                {
                  speaker: speakersRef.current.bj,
                  text: `重大发现！样品 ${anSample.code} 光谱数据中检出明确含水信号，约 ${report.waterPpm} ppm，科学团队正在复核，这可能改写我们对这片区域水文历史的认知！`,
                },
              ]);
            }
          }
        }
      }

      const keys = keysRef.current;
      // 全球级沙尘暴: 强制停车, 清空全部机动输入
      const globalNow = stormGlobalRef.current;
      if (globalNow) keys.clear();

      // ---- 冰下海洋探测推进（探测期间锁定机动, 耗电分摊全程） ----
      if (iceProbeRef.current) {
        keys.clear();
        const pr = iceProbeRef.current;
        pr.elapsed += dt;
        batteryRef.current = Math.max(0, batteryRef.current - (ICE_PROBE_COST * dt) / ICE_PROBE_TOTAL_S);
        const probeProgress = Math.min(1, pr.elapsed / ICE_PROBE_TOTAL_S);
        const probeStage = probeProgress < 0.4 ? "熔钻下潜" : probeProgress < 0.75 ? "声呐扫描" : "数据解析";
        setIceProbeState({ stageLabel: probeStage, progress: probeProgress });
        if (probeProgress >= 1) {
          iceProbeRef.current = null;
          setIceProbeState(null);
          iceProbeCountRef.current += 1;
          const bioRoll = Math.random();
          const result: IceProbeResult = {
            id: iceProbeCountRef.current,
            iceShellM: Math.round(16 + Math.random() * 14),
            oceanDepthM: Math.round(60 + Math.random() * 90),
            salinity: Math.round((8 + Math.random() * 27) * 10) / 10,
            hydrothermal: Math.round(35 + Math.random() * 60),
            bioHint: bioRoll < 0.22 ? "显著" : bioRoll < 0.6 ? "中等" : "微弱",
          };
          setIceProbeLatest(result);
          unlockRef.current("ice_ocean");
          pushLog(
            "PROBE",
            `第 ${result.id} 次冰下探测完成: 冰壳厚约 ${result.iceShellM} m, 声呐确认液态海洋(深约 ${result.oceanDepthM} m), 盐度 ${result.salinity} g/L, 热液活跃度 ${result.hydrothermal}, 生命迹象「${result.bioHint}」`,
            "nominal",
          );
          pushComm([
            {
              speaker: speakersRef.current.cdre,
              text: `北京，${roverCfgRef.current.roverName}报告：冰下海洋探测完成——熔钻穿透 ${result.iceShellM} 米冰壳，声呐确认下方存在液态海洋，盐度 ${result.salinity} 克每升，接近地球海水！`,
            },
            {
              speaker: speakersRef.current.bj,
              text: `收到，重大发现！热液活跃度指数 ${result.hydrothermal}，生命迹象评估「${result.bioHint}」，科学团队已启动复核。这片冰下海洋比我们想象的更活跃。`,
            },
          ]);
        }
      }

      // ---- 木卫二冰裂隙随机事件（行驶中低概率, 带冷却; 需手动转向绕行, 否则逼近时紧急制动） ----
      if (crackRef.current && nowRef.current >= crackRef.current.until) {
        const latestId = latestCrackProbeRef.current?.id;
        const sampling = oceanSampleRef.current !== null;
        // 取水失败重试机制：每道裂隙限一次——失败瞬间冰壳应力回弹, 裂隙短暂重开 8s
        const canRetry =
          sampling && latestId !== undefined && !oceanSampledIdsRef.current.has(latestId) && !crackRetryUsedIdsRef.current.has(latestId);
        if (sampling) {
          oceanSampleRef.current = null;
          setOceanSampleState(null);
        }
        if (canRetry) {
          crackRetryUsedIdsRef.current.add(latestId as number);
          crackRef.current.until = nowRef.current + 8000;
          crackTickRef.current = -1;
          pushLog("PROBE", "取水样管紧急回收! 冰壳应力回弹——裂隙短暂重开约 8 秒, 这是本道裂隙最后一次取水机会", "critical");
          pushComm([
            {
              speaker: speakersRef.current.bj,
              text: `北京紧急通报：监测到裂隙冰壳应力回弹，窗口将短暂重开约 8 秒！这是最后机会, 批准立即重试取水——动作要快！`,
            },
          ]);
        } else {
          crackRef.current = null;
          crackSlowUntilRef.current = 0;
          crackTickRef.current = -1;
          if (sampling) {
            pushLog("PROBE", "裂隙窗口闭合! 取水样管紧急回收, 本次冰下海洋取水失败——等待下一道直通裂隙", "critical");
            pushComm([
              {
                speaker: speakersRef.current.cdre,
                text: `北京，${roverCfgRef.current.roverName}报告：裂隙在我们取水时重新封冻了，取样管已紧急回收，差一点就被夹住。等下一道窗口吧。`,
              },
            ]);
          }
        }
      }
      // 窗口最后 5 秒逐秒短哔（车在裂隙 14m 内才响, 免扰）
      if (crackRef.current) {
        const remainMs = crackRef.current.until - nowRef.current;
        const distTick = Math.hypot(posRef.current.x - crackRef.current.x, posRef.current.y - crackRef.current.y);
        if (remainMs <= 5000 && distTick < 14) {
          const remainS = Math.max(1, Math.ceil(remainMs / 1000));
          if (remainS !== crackTickRef.current) {
            crackTickRef.current = remainS;
            playStormCountdownTick(remainS);
          }
        }
      }
      if (missionIdRef.current === "europa1" && !crackRef.current && nowRef.current >= nextCrackAtRef.current) {
        const speedProbe = Math.hypot(velRef.current.x, velRef.current.y);
        if (speedProbe > SPEED_EPS && Math.random() < 0.03) {
          const ang = headingRef.current;
          crackRef.current = {
            x: posRef.current.x + Math.cos(ang) * 13 + (Math.random() - 0.5) * 5,
            y: posRef.current.y + Math.sin(ang) * 13 + (Math.random() - 0.5) * 5,
            ang: ang + Math.PI / 2 + (Math.random() - 0.5) * 0.6,
            until: nowRef.current + 16000,
            headingAtSpawn: ang,
            spawnAt: nowRef.current,
            resolved: false,
          };
          nextCrackAtRef.current = nowRef.current + 26000 + Math.random() * 22000;
          crackSlowUntilRef.current = nowRef.current + 2600;
          pushLog("ROVER", "前方探测到冰裂隙(宽约 2-3 m)! 请立即转向绕行, 保持航向将触发紧急制动", "critical");
        }
      }
      const crackSlow = nowRef.current < crackSlowUntilRef.current;

      let dx = 0;
      let dy = 0;
      if (!deadRef.current && !globalNow) {
        if (keys.has("up")) dy -= 1;
        if (keys.has("down")) dy += 1;
        if (keys.has("left")) dx -= 1;
        if (keys.has("right")) dx += 1;
      }
      const inputLen = Math.hypot(dx, dy);
      if (inputLen > 0) {
        dx /= inputLen;
        dy /= inputLen;
        headingRef.current = Math.atan2(dy, dx);
      }

      // 原地漂移旋转：按住动作按钮航向快转 + 耗电 + canvas 扬起尘环（电量枯竭/陷沙/全球风暴不可用）
      if (spinHeldRef.current && !deadRef.current && !stuckRef.current && !globalNow && batteryRef.current > 3) {
        spinActiveRef.current = true;
        headingRef.current += 5.5 * dt;
        spinSessionRef.current.turns += (5.5 * dt) / (Math.PI * 2);
        batteryRef.current = Math.max(0, batteryRef.current - 0.6 * dt);
        spinSecsRef.current += dt;
        if (!spinAchRef.current && spinSecsRef.current >= 30) {
          spinAchRef.current = true;
          unlockRef.current("drift_king");
          pushLog("ROVER", "累计漂移满 30 秒——成就「漂移之王」解锁! 北京: 玩归玩, 别忘了正事", "nominal");
        }
        if (!spinLoggedRef.current) {
          spinLoggedRef.current = true;
          pushLog("ROVER", "原地漂移! 六轮搓起一圈尘环——好玩是好玩, 电也在哗哗地掉（0.6%/s）", "nominal");
        }
      } else {
        spinActiveRef.current = false;
        if (spinLoggedRef.current && !spinHeldRef.current) {
          spinLoggedRef.current = false;
        }
      }

      // 速度积分（油门逼近最大速度, 松手按摩擦衰减; 沙尘暴期间车速上限降低, 全球风暴上限归 0; 裂隙规避期间限速 45%; 陷车期间归 0; 精细操作模式 ×0.4）
      const stormNow = stormRef.current;
      const stuckNow = stuckRef.current !== null;
      const maxSpd =
        globalNow || stuckNow
          ? 0
          : ROVER_MAX_SPEED * (1 - 0.55 * stormNow) * (crackSlow ? 0.45 : 1) * (fineModeRef.current ? 0.4 : 1);
      let vx = velRef.current.x;
      let vy = velRef.current.y;
      if (inputLen > 0) {
        const k = Math.min(1, ROVER_RESP * dt);
        vx += (dx * maxSpd - vx) * k;
        vy += (dy * maxSpd - vy) * k;
      } else {
        const cur = Math.hypot(vx, vy);
        const drop = Math.max(0, cur - ROVER_FRICTION * dt);
        const scale = cur > 0 ? drop / cur : 0;
        vx *= scale;
        vy *= scale;
      }
      velRef.current = { x: vx, y: vy };
      const speedNow = Math.hypot(vx, vy);

      posRef.current = { x: posRef.current.x + vx * dt, y: posRef.current.y + vy * dt };
      odoRef.current += speedNow * dt;

      // ---- 车轮陷沙随机事件（行驶中低概率触发; 前后交替按压摇摆 6 次自救, 4s 后救援车就位可拖曳, 8s 超时自动脱困耗电 5%） ----
      // 坑沿松土联动：距撞击坑沿 6m 内行驶时陷沙概率 ×3（碾坑沿扬尘爆发的代价）; 同时累计「坑沿巡航」驾驶风格秒数
      let nearCraterEdge = false;
      for (const c of ROVER_CRATERS) {
        if (Math.abs(Math.hypot(posRef.current.x - c.x, posRef.current.y - c.y) - c.r) < 6) {
          nearCraterEdge = true;
          break;
        }
      }
      if (nearCraterEdge && speedNow > 0.5) edgeSecsRef.current += dt;
      if (!stuckRef.current && !globalNow && speedNow > 1.2 && Math.random() < (nearCraterEdge ? 0.012 : 0.004)) {
        stuckRef.current = { alt: 0, lastDir: null, remainMs: 8000, elapsedMs: 0, tug: 0, tugStartAt: 0 };
        velRef.current = { x: 0, y: 0 };
        keysRef.current.clear();
        pushLog(
          "ROVER",
          `${nearCraterEdge ? "坑沿的松软浮土没托住驱动轮, " : ""}驱动轮陷进松软${roverCfgRef.current.surfaceWord}! 快速交替按「前进/后退」摇摆自救（需 6 次交替）, 或等 4 秒救援车就位后连点三次挂接钢缆拖曳; 8 秒都没动静将自动大电流脱困（耗电 5%）`,
          "caution",
        );
      }
      if (stuckRef.current) {
        const st = stuckRef.current;
        st.remainMs -= dt * 1000;
        const wasReady = st.elapsedMs >= 4000;
        st.elapsedMs += dt * 1000;
        if (!wasReady && st.elapsedMs >= 4000) {
          st.tugStartAt = nowRef.current;
          pushLog("ROVER", "救援车已抵达陷车点! 面板出现「拖曳」按钮——盯住时机条, 光标扫进中央绿区时点击挂接钢缆, 连挂三次拖出不耗电; 自救摇摆则更能练手艺", "nominal");
          pushComm([
            {
              speaker: speakersRef.current.bj,
              text: `救援车已到位, 钢缆盘就挂在车尾。挂钩讲究时机——光标扫进绿区再点, 连挂三次就牢。当然, 你们要是想自己摇出来, 北京也乐得看一场脱困教学。`,
            },
          ]);
        }
        if (st.alt >= 6) {
          stuckRef.current = null;
          playAckConfirm();
          pushLog("ROVER", "前后摇摆脱困成功, 驱动轮重新咬合——教科书级自救, 一滴电都没花!", "nominal");
          pushComm([
            {
              speaker: speakersRef.current.cdre,
              text: `北京，${roverCfgRef.current.roverName}报告：陷车已自救脱困！这套前后摇摆的操作可以写进驾驶手册了, 救援车可以原路返回。`,
            },
          ]);
        } else if (st.remainMs <= 0) {
          stuckRef.current = null;
          batteryRef.current = Math.max(0, batteryRef.current - 5);
          pushLog("ROVER", "驱动轮空转大电流自行脱困（电量 -5%）——下次试试交替摇摆或喊救援车拖曳, 都更省", "caution");
        }
      }

      // ---- 补给空投箱（随机空投在 40-80m 处; 普通箱 60s 信标失效; 25% 为稀有物资箱 +50%, 但只有 40s 限时争夺窗口） ----
      if (!supplyRef.current && !globalNow && !deadRef.current && nextSupplyAtRef.current > 0 && nowRef.current >= nextSupplyAtRef.current) {
        const angS = Math.random() * Math.PI * 2;
        const distS = 40 + Math.random() * 40;
        const rareS = Math.random() < 0.25;
        supplyRef.current = {
          x: posRef.current.x + Math.cos(angS) * distS,
          y: posRef.current.y + Math.sin(angS) * distS,
          remainMs: rareS ? 40000 : 60000,
          rare: rareS,
          lastTickS: -1,
        };
        pushLog(
          "ROVER",
          rareS
            ? "稀有补给空投! 一箱同位素电池组伞降在附近（金色信标）——限时争夺窗口只有 40 秒, 最后 10 秒信标转红告急, 抢到电量 +50%!"
            : "补给空投! 一箱应急补给伞降在附近——信标 60 秒内驶过即可拾取（备用电池 +25%）",
          "nominal",
        );
        pushComm([
          {
            speaker: speakersRef.current.bj,
            text: rareS
              ? `注意, 这次空投的是稀有物资——一箱同位素电池组, 金色信标坐标已下发。降落伞挂在低轨道上, 回收窗口只有 40 秒, 最后 10 秒信标会转红——全速去抢!`
              : `注意, 地面刚空投了一箱应急补给, 信标坐标已下发。60 秒内去把它捡回来——里面的备用电池正是你们需要的。`,
          },
        ]);
      }
      if (supplyRef.current) {
        const sp = supplyRef.current;
        sp.remainMs -= dt * 1000;
        // 稀有箱争夺告急（最后 10s）：每秒一声倒数哔, 剩余 ≤3s 音调更高更急促（复用风暴倒计时音）
        if (sp.rare && sp.remainMs <= 10000 && sp.remainMs > 0) {
          const secNow = Math.ceil(sp.remainMs / 1000);
          if (secNow !== sp.lastTickS) {
            sp.lastTickS = secNow;
            playStormCountdownTick(secNow);
          }
        }
        const distPick = Math.hypot(posRef.current.x - sp.x, posRef.current.y - sp.y);
        if (distPick < 4) {
          supplyRef.current = null;
          if (sp.rare) supplyBurstRef.current = { x: sp.x, y: sp.y, until: nowRef.current + 1400 };
          batteryRef.current = Math.min(100, batteryRef.current + (sp.rare ? 50 : 25));
          nextSupplyAtRef.current = nowRef.current + 90000 + Math.random() * 90000;
          playAckConfirm();
          pushLog(
            "ROVER",
            sp.rare
              ? "稀有补给争夺成功! 40 秒窗口内抢回同位素电池组, 电量 +50%——这箱空投够跑一整天"
              : "补给箱回收成功! 备用电池接入, 电量 +25%——北京的空投总是很及时",
            "nominal",
          );
        } else if (sp.remainMs <= 0) {
          supplyRef.current = null;
          nextSupplyAtRef.current = nowRef.current + 90000 + Math.random() * 90000;
          pushLog("ROVER", `补给箱信标失效, 回收窗口关闭${sp.rare ? "——一箱稀有物资就这么错过了" : ""}, 下次空投记得抓紧`, "caution");
        }
      }

      // 裂隙判定（位置更新后）：转向超过 ~35° 绕行成功; 未转向逼近则紧急制动。
      // 裂隙本体保留到超时消散——停在旁边可发起深度探测
      if (crackRef.current && !crackRef.current.resolved) {
        const c = crackRef.current;
        let dHeading = Math.abs(headingRef.current - c.headingAtSpawn);
        while (dHeading > Math.PI) dHeading = Math.abs(dHeading - Math.PI * 2);
        const distCrack = Math.hypot(posRef.current.x - c.x, posRef.current.y - c.y);
        if (dHeading > 0.6) {
          c.resolved = true;
          crackSlowUntilRef.current = 0;
          // 驾驶评价：反应用时 + 与裂隙的距离综合定级（计入成就统计）
          const reactS = (nowRef.current - c.spawnAt) / 1000;
          const review =
            reactS < 2
              ? distCrack < 9
                ? "险之又险!教科书级规避"
                : "教科书级规避"
              : reactS < 4
                ? "规避出色"
                : "安全规避";
          crackReviewRef.current = { text: review, until: nowRef.current + 3200 };
          evadeCountRef.current += 1;
          if (evadeCountRef.current >= 3) unlockRef.current("crack_evade_3");
          if (reactS < 2) {
            aceEvadeRef.current += 1;
            if (aceEvadeRef.current >= 3) unlockRef.current("ace_driver");
          }
          pushLog("ROVER", `冰裂隙绕行成功（反应 ${reactS.toFixed(1)}s, 距裂隙 ${distCrack.toFixed(0)}m）, 驾驶评价「${review}」· 累计规避 ${evadeCountRef.current} 次; 裂隙保持在旁, 可停车做深度探测`, "nominal");
        } else if (distCrack < 6.5 && speedNow > SPEED_EPS) {
          velRef.current = { x: 0, y: 0 };
          keysRef.current.clear();
          c.resolved = true;
          hardBrakeUntilRef.current = nowRef.current + 550;
          hardBrakeCountRef.current += 1;
          pushLog("ROVER", "裂隙边缘紧急制动执行! 车辆已在安全距离停住, 可就地做裂隙深度探测, 或转向绕行后继续前进", "critical");
        }
      }

      // ---- 裂隙深度探测推进（4s, 结果卡: 深度 + 冰壳沉积层数） ----
      if (crackProbeRef.current) {
        keys.clear();
        const cp = crackProbeRef.current;
        cp.elapsed += dt;
        const cpProgress = Math.min(1, cp.elapsed / 4);
        setCrackProbeState({ progress: cpProgress });
        if (cpProgress >= 1) {
          crackProbeRef.current = null;
          setCrackProbeState(null);
          crackProbeCountRef.current += 1;
          const depthM = Math.round(12 + Math.random() * 73);
          // 深海沟式裂隙直通冰下海洋（深裂隙必通, 浅裂隙小概率）
          const oceanLink = depthM >= 58 || Math.random() < 0.16;
          const cpResult: CrackProbeResult = {
            id: crackProbeCountRef.current,
            depthM,
            layers: Math.round(3 + Math.random() * 6),
            oceanLink,
          };
          setCrackProbeLatest(cpResult);
          latestCrackProbeRef.current = cpResult;
          setOceanSampleTaken(false);
          pushLog(
            "PROBE",
            `第 ${cpResult.id} 次裂隙深度探测完成: 深约 ${depthM} m, 识别 ${cpResult.layers} 层冰壳沉积层, 连通性判定「${oceanLink ? "直通冰下海洋" : "未达海洋层"}」`,
            oceanLink ? "nominal" : "nominal",
          );
          if (oceanLink) {
            pushComm([
              {
                speaker: speakersRef.current.bj,
                text: `北京通报：第 ${cpResult.id} 号裂隙测深 ${depthM} 米，判定裂隙直通冰下海洋！这是天然的取样窗口，科学团队兴奋极了，建议列为优先科考点位。`,
              },
              {
                speaker: speakersRef.current.cdre,
                text: `北京，${roverCfgRef.current.roverName}收到！能把探测仪直接放进通往海洋的裂隙，是这次任务最幸运的事之一。已标记点位，等待后续指令。`,
              },
            ]);
          }
        }
      }

      // ---- 冰下海洋取水推进（5s, 耗电 10%, 完成即特殊水样入舱） ----
      if (oceanSampleRef.current) {
        keys.clear();
        const os = oceanSampleRef.current;
        os.elapsed += dt;
        batteryRef.current = Math.max(0, batteryRef.current - (10 * dt) / 5);
        const osProgress = Math.min(1, os.elapsed / 5);
        setOceanSampleState({ progress: osProgress });
        if (osProgress >= 1) {
          oceanSampleRef.current = null;
          setOceanSampleState(null);
          const pid = latestCrackProbeRef.current?.id ?? 0;
          oceanSampledIdsRef.current.add(pid);
          setOceanSampleTaken(true);
          sampleCountRef.current += 1;
          const cfg = roverCfgRef.current;
          const waterSample: RoverSample = {
            id: sampleCountRef.current,
            code: `${cfg.samplePrefix}-W${String(sampleCountRef.current).padStart(3, "0")}`,
            siteName: `直通裂隙第 ${pid} 号 · 冰下海洋水样`,
          };
          sampleListRef.current = [...sampleListRef.current, waterSample];
          setSampleList(sampleListRef.current);
          unlockRef.current("ocean_sample");
          pushLog(
            "PROBE",
            `冰下海洋水样提取完成! 样品 ${waterSample.code} 已密封入舱——首次直接取得木卫二冰下海洋水体`,
            "nominal",
          );
          pushComm([
            {
              speaker: speakersRef.current.cdre,
              text: `北京，${cfg.roverName}报告：取水样管回收完毕，${waterSample.code} 号水样密封入舱。这是冰下海洋的水，真正的水！历史性的一刻！`,
            },
            {
              speaker: speakersRef.current.bj,
              text: `确认 ${waterSample.code} 入舱！全场为你们鼓掌。请立即安排化验——我们迫不及待想知道这片海洋的化学成分。`,
            },
          ]);
        }
      }

      // ---- 越野拉力赛推进（按航线顺序过点 + 撞坑罚时 + 完赛定级, 正序/倒序分航线记最佳） ----
      if (rallyRef.current) {
        const r = rallyRef.current;
        r.remainMs -= dt * 1000;
        r.elapsedMs += dt * 1000;
        const nextIdx = r.order.find((pi) => !r.points[pi].got);
        if (nextIdx !== undefined) {
          const pt = r.points[nextIdx];
          if (Math.hypot(posRef.current.x - pt.x, posRef.current.y - pt.y) < RALLY_CP_RADIUS_M) {
            pt.got = true;
            playAckConfirm();
            pushLog("ROVER", `拉力赛检查点 ${pt.seq}/${r.points.length} 通过!${r.variant === "reverse" ? "（倒序航线）" : r.variant === "night" ? "（夜航信标）" : ""}`, "nominal");
          }
        }
        // 擦撞坑沿罚时（每坑限一次）
        for (const c of ROVER_CRATERS) {
          if (r.hitCraters.has(c.id)) continue;
          if (Math.hypot(posRef.current.x - c.x, posRef.current.y - c.y) < c.r * 0.9) {
            r.hitCraters.add(c.id);
            r.remainMs -= RALLY_CRATER_PENALTY_S * 1000;
            pushLog("ROVER", `拉力赛中擦撞${craterNamerRef.current(c.id)}坑沿! 罚时 +${RALLY_CRATER_PENALTY_S}s`, "caution");
          }
        }
        const gotCount = r.points.filter((pt) => pt.got).length;
        const allGot = gotCount === r.points.length;
        if (allGot || r.remainMs <= 0) {
          const timeS = Math.round(((RALLY_TIME_S * 1000 - r.remainMs) / 1000) * 10) / 10;
          const penaltyS = r.hitCraters.size * RALLY_CRATER_PENALTY_S;
          const grade: RallyResult["grade"] = !allGot
            ? "DNF"
            : timeS <= 45
              ? "S"
              : timeS <= 60
                ? "A"
                : timeS <= 75
                  ? "B"
                  : "C";
          // 正序 / 倒序 / 夜航三航线分别记最佳（跨任务保留）
          const bestRef = r.variant === "reverse" ? rallyBestRevRef : r.variant === "night" ? rallyBestNightRef : rallyBestRef;
          const isBest = grade !== "DNF" && (bestRef.current === null || timeS < bestRef.current);
          if (isBest) {
            bestRef.current = timeS;
            if (r.variant === "reverse") setRallyBestRevS(timeS);
            else if (r.variant === "night") setRallyBestNightS(timeS);
            else setRallyBestS(timeS);
          }
          rallyRef.current = null;
          setRallyHud(null);
          setRallyResult({ timeS, penaltyS, grade, best: isBest, variant: r.variant });
          if (grade === "S") unlockRef.current("rally_record");
          const variantWord = r.variant === "reverse" ? "（倒序航线）" : r.variant === "night" ? "（夜航无灯）" : "";
          if (grade === "DNF") {
            pushLog("ROVER", `拉力赛${variantWord}超时未完赛 (通过 ${gotCount}/${r.points.length} 检查点), 挑战失败`, "caution");
          } else {
            pushLog(
              "ROVER",
              `拉力赛${variantWord}完赛! 总用时 ${timeS}s (含罚时 ${penaltyS}s), 成绩评级「${grade}」${isBest ? " · 刷新该航线本地最佳纪录!" : ""}`,
              "nominal",
            );
            pushComm([
              {
                speaker: speakersRef.current.cdre,
                text: `北京，${roverCfgRef.current.roverName}报告：越野拉力赛${r.variant === "reverse" ? "倒序航线" : r.variant === "night" ? "夜航无灯模式" : ""}完赛，总用时 ${timeS} 秒，评级 ${grade}${isBest ? "，刷新了这条航线的最佳纪录" : ""}！这台小车比看上去能跑多了。`,
              },
            ]);
          }
        } else {
          setRallyHud({
            remainS: Math.max(0, Math.ceil(r.remainMs / 1000)),
            got: gotCount,
            total: r.points.length,
            penaltyS: r.hitCraters.size * RALLY_CRATER_PENALTY_S,
            variant: r.variant,
          });
        }
      }

      // 低电量警戒（边缘触发一次 caution 日志, 回充过 25% 复位）
      if (batteryRef.current <= 15 && !lowBattLoggedRef.current && !deadRef.current) {
        lowBattLoggedRef.current = true;
        pushLog("ROVER", `${roverCfgRef.current.roverName}电池电量低于 15%, 进入低电警戒, 建议立即停车太阳能回充`, "caution");
      } else if (batteryRef.current > 25 && lowBattLoggedRef.current) {
        lowBattLoggedRef.current = false;
      }

      // 电量: 行驶耗电 / 静止太阳能回充（机械臂作业期间不回充; 沙尘暴遮光回充停止）
      if (speedNow > SPEED_EPS) {
        batteryRef.current = Math.max(0, batteryRef.current - BATTERY_DRAIN * powerMultRef.current * dt);
        if (batteryRef.current <= 0 && !deadRef.current) {
          deadRef.current = true;
          keysRef.current.clear();
          pushLog("ROVER", `${roverCfgRef.current.roverName}电池电量耗尽, 转入待机充电模式, 机动指令暂时无效`, "caution");
        }
      } else if (!armActive && stormNow < 0.1) {
        // 积尘折减回充效率（100% 积尘约剩 23%）; 发电报表同步积分（累计发电 vs 积尘折损）
        const dustFrac = Math.min(1, dustRef.current.pct / 130);
        const gained = SOLAR_CHARGE * (1 - dustFrac) * dt;
        batteryRef.current = Math.min(100, batteryRef.current + gained);
        genRef.current.total += gained;
        genRef.current.lost += SOLAR_CHARGE * dustFrac * dt;
        if (deadRef.current && batteryRef.current >= DEAD_REVIVE_AT) {
          deadRef.current = false;
          pushLog("ROVER", `太阳能充电达到机动门限, ${roverCfgRef.current.roverName}恢复接受遥控指令`, "nominal");
        }
      } else if (globalNow && !armActive) {
        // 全球风暴生存模式: 太阳能完全停止, 加热与姿控维持导致电池缓慢亏损
        batteryRef.current = Math.max(0, batteryRef.current - SURVIVAL_DRAIN * dt);
        if (batteryRef.current <= 0 && !deadRef.current) {
          deadRef.current = true;
          pushLog("ROVER", `${roverCfgRef.current.roverName}电池在全球风暴中耗尽, 仅保留最低生存供电, 等待风暴过境`, "critical");
        }
      }

      // 太阳能板积尘：常态缓慢落尘, 沙尘暴/全球风暴期间加速; 清扫行程中匀速推尘, 归零播确认音
      {
        const du = dustRef.current;
        if (nowRef.current < du.cleaningUntil) {
          du.pct = Math.max(0, du.pct - (100 / (DUST_CLEAN_MS / 1000)) * dt);
          if (du.pct === 0) {
            playAckConfirm();
            pushLog("ROVER", "清扫刷行程完毕, 太阳能板面恢复如新——回充效率满血复活", "nominal");
          }
        } else {
          du.pct = Math.min(100, du.pct + (stormNow > 0.1 || globalNow ? DUST_STORM_GAIN : DUST_GAIN) * dt);
          if (du.pct >= 70 && !du.warnLogged) {
            du.warnLogged = true;
            pushLog("ROVER", `太阳能板积尘已达 ${Math.round(du.pct)}%, 回充效率明显下降——建议尽快启动清扫刷`, "caution");
          } else if (du.pct < 60 && du.warnLogged) {
            du.warnLogged = false;
          }
        }
      }

      // 车体温度: 行驶电机发热, 静止回落; 沙尘暴遮光期间缓降（全球风暴降温更狠）;
      // 金星表面 465°C 环境——车体温度恒高, 制冷回路只能把它压在百度线上
      const venusHeat = missionIdRef.current === "venus1";
      const tempTarget = venusHeat
        ? 116 + (speedNow > SPEED_EPS ? 24 : 0) - 8 * stormNow
        : (speedNow > SPEED_EPS ? 58 : 21) - (globalNow ? 46 : 30) * stormNow;
      tempRef.current += (tempTarget - tempRef.current) * 0.02;

      // 巡视里程碑: 撞击坑 + 累计里程
      const px = posRef.current.x;
      const py = posRef.current.y;
      for (const crater of ROVER_CRATERS) {
        if (visitedCratersRef.current.has(crater.id)) continue;
        if (Math.hypot(px - crater.x, py - crater.y) <= crater.r + 2.5) {
          visitedCratersRef.current.add(crater.id);
          lastCraterRef.current = crater.id;
          if (visitedCratersRef.current.size >= 5) unlockRef.current("craters_5");
          pushLog("ROVER", `驶过${craterNamerRef.current(crater.id)}, 地形相机拍照与土壤探测数据已回传`, "nominal");
        }
      }
      while (odoRef.current >= nextOdoMarkRef.current) {
        pushLog("ROVER", `${roverCfgRef.current.roverName}累计巡视 ${nextOdoMarkRef.current} 米, 导航状态正常`, "nominal");
        nextOdoMarkRef.current += ODO_MARK_STEP;
      }
      if (!drive500Ref.current && odoRef.current >= 500) {
        drive500Ref.current = true;
        unlockRef.current("drive_500");
        pushLog("ROVER", `累计巡视里程突破 500 米, 刷新本次任务巡视纪录`, "nominal");
      }

      const nextSnap: RoverSnapshot = {
        x: px,
        y: py,
        heading: headingRef.current,
        speed: speedNow,
        odometer: odoRef.current,
        battery: batteryRef.current,
        tempC: tempRef.current,
        moving: speedNow > SPEED_EPS,
        batteryDead: batteryRef.current <= 0,
        armPhase: armPhaseRef.current,
        armPaused: armPausedRef.current,
        armExtension,
        armDrilling,
        armSite: armSiteRef.current,
        crack: crackRef.current ? { x: crackRef.current.x, y: crackRef.current.y, ang: crackRef.current.ang } : null,
        crackAlert: crackRef.current !== null && !crackRef.current.resolved,
        crackNearby:
          crackRef.current !== null &&
          Math.hypot(posRef.current.x - crackRef.current.x, posRef.current.y - crackRef.current.y) < 9,
        hardBrake: nowRef.current < hardBrakeUntilRef.current,
        crackReview:
          crackReviewRef.current && nowRef.current < crackReviewRef.current.until ? crackReviewRef.current.text : null,
        crackRemainS: crackRef.current
          ? Math.max(0, Math.ceil((crackRef.current.until - nowRef.current) / 1000))
          : null,
        rallyPoints: rallyRef.current ? rallyRef.current.points : null,
        rallyNight: rallyRef.current ? rallyRef.current.variant === "night" : false,
        stuck: stuckRef.current
          ? {
              alt: stuckRef.current.alt,
              remainS: Math.max(0, Math.ceil(stuckRef.current.remainMs / 1000)),
              rescueReady: stuckRef.current.elapsedMs >= 4000,
              tug: stuckRef.current.tug,
            }
          : null,
        supply: supplyRef.current
          ? { x: supplyRef.current.x, y: supplyRef.current.y, remainS: Math.max(0, Math.ceil(supplyRef.current.remainMs / 1000)), rare: supplyRef.current.rare }
          : null,
        supplyBurst: supplyBurstRef.current && nowRef.current < supplyBurstRef.current.until ? supplyBurstRef.current : null,
        dust: Math.round(dustRef.current.pct),
        dustCleaning: nowRef.current < dustRef.current.cleaningUntil,
        gen: { total: Math.round(genRef.current.total), lost: Math.round(genRef.current.lost) },
        hornAt: hornAtRef.current,
        flashUntil: flashUntilRef.current,
        morse: morseRef.current && nowRef.current < morseRef.current.startAt + morseRef.current.totalMs ? morseRef.current : null,
        spin: spinActiveRef.current,
        fineMode: fineModeRef.current,
        photoFlash: photoFlashAtRef.current,
        photoFilter: photoFilterRef.current,
        photoCount: photoCountRef.current,
        grainLevel: grainLevelRef.current,
      };
      // 容差深比较：数值变化小于显示精度即视为「没变」, 静止待机时不再触发整页重渲染
      if (!snapNear(lastSnapRef.current, nextSnap)) {
        lastSnapRef.current = nextSnap;
        setRoverSnap(nextSnap);
      }
    }, ROVER_TICK_MS);
    return () => window.clearInterval(timer);
  }, [unlocked, pushLog, pushComm]);

  // 任务切换全量重置: 归位锁定 + 电量温度复位 + 机械臂待机 + 样品清空
  const resetRover = useCallback(() => {
    posRef.current = { x: 0, y: 0 };
    velRef.current = { x: 0, y: 0 };
    headingRef.current = -Math.PI / 2;
    batteryRef.current = 100;
    odoRef.current = 0;
    tempRef.current = 21;
    deadRef.current = false;
    keysRef.current.clear();
    visitedCratersRef.current.clear();
    nextOdoMarkRef.current = ODO_MARK_STEP;
    armPhaseRef.current = "idle";
    armPausedRef.current = false;
    armPausedLowBattRef.current = false;
    armElapsedRef.current = 0;
    armSiteRef.current = null;
    armCostRef.current = 0;
    armSampleRef.current = null;
    sampleCountRef.current = 0;
    chamberLockUntilRef.current = 0;
    lastCraterRef.current = null;
    prevUnlockedRef.current = false;
    analysisRef.current = null;
    reportsRef.current = {};
    sampleListRef.current = [];
    drive500Ref.current = false;
    iceProbeRef.current = null;
    iceProbeCountRef.current = 0;
    crackRef.current = null;
    nextCrackAtRef.current = nowRef.current + 20000;
    crackSlowUntilRef.current = 0;
    hardBrakeUntilRef.current = 0;
    crackReviewRef.current = null;
    lowBattLoggedRef.current = false;
    crackProbeRef.current = null;
    crackProbeCountRef.current = 0;
    latestCrackProbeRef.current = null;
    evadeCountRef.current = 0;
    aceEvadeRef.current = 0;
    oceanSampleRef.current = null;
    oceanSampledIdsRef.current.clear();
    crackRetryUsedIdsRef.current.clear();
    crackTickRef.current = -1;
    rallyRef.current = null;
    hardBrakeCountRef.current = 0;
    stuckRef.current = null;
    supplyRef.current = null;
    supplyBurstRef.current = null;
    dustRef.current = { pct: 0, cleaningUntil: 0, warnLogged: false };
    genRef.current = { total: 0, lost: 0 };
    hornAtRef.current = 0;
    lastHonkRef.current = 0;
    hornCountRef.current = 0;
    flashUntilRef.current = 0;
    morseRef.current = null;
    recentHornRef.current = [];
    lastMelodyRef.current = 0;
    spinHeldRef.current = false;
    spinActiveRef.current = false;
    spinLoggedRef.current = false;
    spinSecsRef.current = 0;
    spinAchRef.current = false;
    spinBestRef.current = 0;
    spinSessionRef.current = { startAt: 0, turns: 0 };
    edgeSecsRef.current = 0;
    morseCountRef.current = 0;
    melodySeenRef.current = [false, false, false];
    fineModeRef.current = false;
    photoCountRef.current = 0;
    photoFlashAtRef.current = 0;
    photoFilterRef.current = 0;
    grainLevelRef.current = 110;
    setPhotoLog([]);
    nextSupplyAtRef.current = 0;
    setRallyHud(null);
    setRallyResult(null);
    setRoverSnap(INITIAL_SNAPSHOT);
    lastSnapRef.current = INITIAL_SNAPSHOT;
    // 游戏时钟与墙钟重新对齐, 避免锁定期间长时间停走后事件期限基准漂移过远
    nowRef.current = Date.now();
    setSampleList([]);
    setAnalysisState(null);
    setSampleReports({});
    setActiveReport(null);
    setIceProbeState(null);
    setIceProbeLatest(null);
    setCrackProbeState(null);
    setCrackProbeLatest(null);
    setOceanSampleState(null);
    setOceanSampleTaken(false);
  }, []);

  /** 清除存档联动：三航线拉力最佳纪录全部归零（由 useHome 清除存档动作调用） */
  const clearRallyBests = useCallback(() => {
    rallyBestRef.current = null;
    rallyBestRevRef.current = null;
    rallyBestNightRef.current = null;
    setRallyBestS(null);
    setRallyBestRevS(null);
    setRallyBestNightS(null);
  }, []);

  /** 驾驶行为统计快照（任务结算评分消费, 打开结算单时读取; 拉力最佳取正序/倒序/夜航三航线中的更优成绩） */
  const getDriveStats = useCallback(
    () => {
      const bests = [rallyBestRef.current, rallyBestRevRef.current, rallyBestNightRef.current].filter(
        (v): v is number => v !== null,
      );
      return {
        evades: evadeCountRef.current,
        aces: aceEvadeRef.current,
        hardBrakes: hardBrakeCountRef.current,
        rallyBestS: bests.length ? Math.min(...bests) : null,
        // 发电报表（任务结算单「发电账本」行消费）
        genTotal: Math.round(genRef.current.total),
        genLost: Math.round(genRef.current.lost),
        // 漂移累计秒数与单次最佳（结算盘点「漂移秒数」徽章消费）
        spinSecs: Math.round(spinSecsRef.current),
        spinBestS: Math.round(spinBestRef.current * 10) / 10,
        // 坑沿巡航秒数（驾驶风格统计, 结算盘点消费）
        craterEdgeS: Math.round(edgeSecsRef.current),
        // 拍照张数（结算盘点「纪念拍照」徽章消费）
        photos: photoCountRef.current,
      };
    },
    [],
  );

  return {
    roverSnap,
    roverUnlocked: unlocked,
    roverSuspended: suspended,
    pressRoverDir,
    releaseRoverDir,
    requestRescue,
    startDustClean,
    honkRover,
    flashRoverLights,
    morseFlash,
    pressRoverSpin,
    releaseRoverSpin,
    toggleFineMode,
    takePhoto,
    cyclePhotoFilter,
    photoLog,
    removePhoto,
    setGrainLevel,
    toggleArmPause,
    cancelArm,
    actionKeys,
    setActionKey,
    resetActionKeys,
    sampleList,
    startSampling,
    analysisState,
    sampleReports,
    activeReport,
    startAnalysis,
    openSampleReport,
    closeSampleReport,
    iceProbeState,
    iceProbeLatest,
    startIceProbe,
    crackProbeState,
    crackProbeLatest,
    startCrackProbe,
    oceanSampleState,
    oceanSampleTaken,
    startOceanSample,
    rallyHud,
    rallyResult,
    rallyBestS,
    rallyBestRevS,
    rallyBestNightS,
    startRally,
    getDriveStats,
    resetRover,
    clearRallyBests,
  };
}
