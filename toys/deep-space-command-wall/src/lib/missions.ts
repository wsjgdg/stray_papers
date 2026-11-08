// 任务定义中心：LUNA-9 月面着陆 与 ARES-1 火星着陆 两条任务剧情共用同一套组件与状态机，
// 阶段链 / 遥测曲线 / 事件与警报池 / 地面站 / 巡视车 / 通讯剧本 / 视觉参数全部按 mission 组织。
// useHome 按 activeMissionId 消费本模块；纯数据 + 纯函数，不含任何组件。

import {
  ARES_1_BLACKOUT_RECOVERY,
  ARES_1_COMM,
  EUROPA_1_BLACKOUT_RECOVERY,
  EUROPA_1_COMM,
  LUNA_9_COMM,
  TITAN_1_BLACKOUT_RECOVERY,
  TITAN_1_COMM,
  VNS_1_BLACKOUT_RECOVERY,
  VNS_1_COMM,
  type CommLine,
  type MissionComm,
} from "@/lib/commScript";

export type MissionId = "luna9" | "ares1" | "europa1" | "venus1" | "titan1";

export type PhaseId =
  | "standby"
  | "liftoff"
  | "separation"
  | "transfer"
  | "braking"
  | "descent"
  | "touchdown"
  | "landed";

export interface PhaseMetaItem {
  id: PhaseId;
  label: string;
  labelEn: string;
  milestone: string;
  /** 模拟飞行秒数（standby / landed 为 Infinity） */
  durationSec: number;
}

export type EaseKind = "lin" | "in" | "out";
export type FlightMap = Partial<Record<PhaseId, [number, number, EaseKind?]>>;

export interface MetricDef {
  key: string;
  label: string;
  labelEn: string;
  unit: string;
  decimals: number;
  base: number; // 待发射常态基准
  amp: number; // 待发射常态波动幅度
  wave: number;
  phase: number;
  relNoise: number; // 与数值成比例的抖动
  flight?: FlightMap;
}

export interface StationSeedItem {
  stationKey: string;
  stationName: string;
  code: string;
  online: boolean;
  linkRate: number;
}

export interface EventItem {
  system: string;
  message: string;
}

export interface AlarmPoolItem {
  metricKey: string;
  message: string;
}

/** 气动黑障区：信号中断窗口（模拟时间压缩，窗口时长为压缩后的飞行秒数） */
export interface BlackoutDef {
  phase: PhaseId;
  /** 相对该阶段起点的进入秒数 */
  startSec: number;
  durationSec: number;
  /** 信号恢复瞬间入队的字幕 */
  recoveryComm: CommLine[];
}

/** StarfieldCanvas / RoverCanvas 视觉参数：全部基于 :root token 派生，不写死色值 */
export interface MissionVisual {
  planet: "moon" | "mars" | "europa" | "venus" | "titan";
  /** 目标星球主色源 token（月球用 foreground 冷灰，火星用 destructive 调相红橙） */
  hueSourceVar: string;
  hueShift: number;
  satScale: number;
  lightScale: number;
  /** 星野暖尘辉光强度（0 = 无，火星 > 0） */
  dustAlpha: number;
}

export interface RoverCfg {
  roverName: string;
  roverNameEn: string;
  /** 样品编号前缀，如 YT-S001 / ZR-S001 */
  samplePrefix: string;
  /** 地表语境词：月面 / 火面 */
  surfaceWord: string;
  /** 着陆解锁时的日志文案 */
  unlockLog: string;
  /** 撞击坑命名风格：null = 数字编号（N 号撞击坑），数组 = 地名循环（天问撞击坑等） */
  craterNames: string[] | null;
}

export interface MissionDef {
  id: MissionId;
  code: string;
  title: string;
  /** 顶栏圆形徽标缩写 */
  badge: string;
  headerEn: string;
  landingSite: string;
  /** 星球语境词：月球 / 火星（主视口大标题用） */
  planetWord: string;
  /** 主视口左上追踪文案 */
  approachEn: string;
  /** 主视口左下链路文案 */
  linkEn: string;
  /** 地面站底栏链路标题 */
  linkZh: string;
  /** 光行延迟叙事文案 */
  lightDelayNote: string;
  /** 着陆庆祝浮层正文 */
  landingBody: string;
  phases: PhaseMetaItem[];
  metricDefs: MetricDef[];
  bootLines: string[];
  standbyEvents: EventItem[];
  phaseEvents: Partial<Record<PhaseId, EventItem[]>>;
  cautionPool: AlarmPoolItem[];
  criticalPool: AlarmPoolItem[];
  stationSeed: StationSeedItem[];
  /** 地面站链路速率随机游走区间 [min, max] Mbps（火星链路更低） */
  stationRateRange: [number, number];
  blackout: BlackoutDef | null;
  visual: MissionVisual;
  rover: RoverCfg;
  comm: MissionComm;
}

export const PHASE_INDEX: Record<PhaseId, number> = {
  standby: 0,
  liftoff: 1,
  separation: 2,
  transfer: 3,
  braking: 4,
  descent: 5,
  touchdown: 6,
  landed: 7,
};

const FLIGHT_CHAIN: PhaseId[] = [
  "liftoff",
  "separation",
  "transfer",
  "braking",
  "descent",
  "touchdown",
  "landed",
];

/** 按飞行秒数解算当前阶段与阶段内进度 */
export function phaseAtFlightSec(def: MissionDef, s: number): { phaseId: PhaseId; progress: number } {
  let acc = 0;
  for (const id of FLIGHT_CHAIN) {
    const meta = def.phases[PHASE_INDEX[id]];
    const d = meta.durationSec;
    if (!Number.isFinite(d)) return { phaseId: id, progress: 1 };
    if (s < acc + d) return { phaseId: id, progress: Math.min(1, (s - acc) / d) };
    acc += d;
  }
  return { phaseId: "landed", progress: 1 };
}

/** 某阶段起点对应的飞行秒数（黑障区窗口定位用） */
export function phaseStartSec(def: MissionDef, id: PhaseId): number {
  let acc = 0;
  for (const cid of FLIGHT_CHAIN) {
    if (cid === id) return acc;
    const d = def.phases[PHASE_INDEX[cid]].durationSec;
    if (!Number.isFinite(d)) break;
    acc += d;
  }
  return acc;
}

/** 撞击坑命名（按 mission 风格）：月球数字编号 / 火星地名循环 */
export function craterNameAt(def: MissionDef, id: number): string {
  const names = def.rover.craterNames;
  if (!names || names.length === 0) return `${id} 号撞击坑`;
  return `${names[(id - 1) % names.length]}撞击坑`;
}

/* ============================ LUNA-9 月面着陆任务 ============================ */

export const LUNA_9: MissionDef = {
  id: "luna9",
  code: "LUNA-9",
  title: "月面着陆任务",
  badge: "L9",
  headerEn: "LUNAR LANDING MISSION WALL",
  landingSite: "虹湾",
  planetWord: "月球",
  approachEn: "LUNAR APPROACH · TRACKING LOCK",
  linkEn: "EARTH–MOON LINK · QQ RELAY LOCK",
  linkZh: "地月链路 · 地面站网络",
  lightDelayNote: "地月光行延迟约 1.28 秒",
  landingBody:
    "器箭分离至今, LUNA-9 完成地月转移、近月制动与动力下降, 着陆腿触月姿态角 1.4°, 太阳翼已展开, 月面工作段正式开启。",
  phases: [
    { id: "standby", label: "待发射", labelEn: "STANDBY", milestone: "", durationSec: Infinity },
    { id: "liftoff", label: "点火起飞", labelEn: "LIFTOFF", milestone: "点火!LUNA-9 按时起飞, 塔架摆开, 程序转弯开始", durationSec: 12 },
    { id: "separation", label: "级段分离", labelEn: "STAGE SEP", milestone: "一二级分离确认, 上面级发动机二次点火成功", durationSec: 10 },
    { id: "transfer", label: "地月转移", labelEn: "TLI COAST", milestone: "器箭分离, 地月转移轨道确认, 太阳翼展开", durationSec: 24 },
    { id: "braking", label: "近月制动", labelEn: "LOI BURN", milestone: "近月制动点火, 3000N 主发动机满推力工作", durationSec: 12 },
    { id: "descent", label: "动力下降", labelEn: "DESCENT", milestone: "动力下降段开始, 着陆发动机点火", durationSec: 16 },
    { id: "touchdown", label: "月面软着陆", labelEn: "TOUCHDOWN", milestone: "着陆腿触月灯亮, 发动机关机, 软着陆成功!", durationSec: 6 },
    { id: "landed", label: "着陆完成", labelEn: "LANDED", milestone: "着陆确认, LUNA-9 月面工作段开始", durationSec: Infinity },
  ],
  metricDefs: [
    {
      key: "altitude", label: "高度", labelEn: "ALTITUDE", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 0, relNoise: 0.0004,
      flight: {
        liftoff: [0, 68, "in"], separation: [68, 185], transfer: [185, 362000, "in"],
        braking: [362000, 200, "out"], descent: [200, 0.02, "out"], touchdown: [0.02, 0], landed: [0, 0],
      },
    },
    {
      key: "velocity", label: "飞行速度", labelEn: "VELOCITY", unit: "km/s", decimals: 3,
      base: 0, amp: 0, wave: 0, phase: 1.2, relNoise: 0.0015,
      flight: {
        liftoff: [0, 2.31, "in"], separation: [2.31, 7.79], transfer: [7.79, 0.25, "out"],
        braking: [0.25, 1.63], descent: [1.63, 0.003, "out"], touchdown: [0.003, 0], landed: [0, 0],
      },
    },
    {
      key: "deltaV", label: "Δv 剩余", labelEn: "DELTA-V REMAIN", unit: "m/s", decimals: 0,
      base: 10250, amp: 0.4, wave: 0.1, phase: 0.4, relNoise: 0.0002,
      flight: {
        liftoff: [10250, 6800], separation: [6800, 5600], transfer: [5600, 5350],
        braking: [5350, 3100], descent: [3100, 920, "out"], touchdown: [920, 880], landed: [880, 880],
      },
    },
    {
      key: "isp", label: "比冲", labelEn: "SPEC. IMPULSE", unit: "s", decimals: 0,
      base: 302, amp: 0.2, wave: 0.2, phase: 2.2, relNoise: 0.0005,
      flight: {
        liftoff: [302, 302], separation: [340, 340], transfer: [455, 455],
        braking: [455, 455], descent: [315, 315], touchdown: [315, 0, "out"], landed: [0, 0],
      },
    },
    {
      key: "thrust", label: "发动机推力", labelEn: "ENGINE THRUST", unit: "kN", decimals: 1,
      base: 0, amp: 0, wave: 0, phase: 3.3, relNoise: 0.002,
      flight: {
        liftoff: [4320, 4320], separation: [0, 1400, "out"], transfer: [0, 0],
        braking: [3.0, 3.0], descent: [7.5, 4.5], touchdown: [4.5, 0, "out"], landed: [0, 0],
      },
    },
    {
      key: "fuel", label: "燃料余量", labelEn: "FUEL", unit: "%", decimals: 1,
      base: 100, amp: 0.05, wave: 0.2, phase: 2.4, relNoise: 0.0004,
      flight: {
        liftoff: [100, 86], separation: [86, 74], transfer: [74, 71],
        braking: [71, 41], descent: [41, 14, "out"], touchdown: [14, 13], landed: [13, 13],
      },
    },
    {
      key: "range", label: "着陆点距离", labelEn: "RANGE TO SITE", unit: "km", decimals: 0,
      base: 384400, amp: 2, wave: 0.05, phase: 1.1, relNoise: 0.00005,
      flight: {
        liftoff: [384400, 384340], separation: [384340, 384100], transfer: [384100, 620, "in"],
        braking: [620, 200], descent: [200, 0.02, "out"], touchdown: [0.02, 0], landed: [0, 0],
      },
    },
    {
      key: "inclination", label: "轨道倾角", labelEn: "INCLINATION", unit: "°", decimals: 1,
      base: 28.5, amp: 0.02, wave: 0.1, phase: 4.4, relNoise: 0.0003,
      flight: {
        liftoff: [28.5, 28.5], separation: [28.5, 26.4], transfer: [26.4, 28.9],
        braking: [28.9, 88.5], descent: [88.5, 88.5], touchdown: [88.5, 88.5], landed: [88.5, 88.5],
      },
    },
    {
      key: "perilune", label: "近月点高度", labelEn: "PERILUNE", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 5.1, relNoise: 0.001,
      flight: {
        liftoff: [0, 0], separation: [0, 185], transfer: [185, 200], braking: [200, 200],
        descent: [200, 200], touchdown: [200, 0], landed: [0, 0],
      },
    },
    {
      key: "apolune", label: "远月点高度", labelEn: "APOLUNE", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 0.9, relNoise: 0.001,
      flight: {
        liftoff: [0, 68], separation: [68, 185], transfer: [185, 362000, "in"],
        braking: [362000, 200, "out"], descent: [200, 200], touchdown: [200, 0], landed: [0, 0],
      },
    },
    {
      key: "lightDelay", label: "地月光行延迟", labelEn: "LIGHT DELAY", unit: "s", decimals: 3,
      base: 0.0013, amp: 0.0001, wave: 0.3, phase: 3.7, relNoise: 0.002,
      flight: {
        liftoff: [0.0013, 0.0013], separation: [0.0015, 0.0015], transfer: [0.0015, 1.25, "in"],
        braking: [1.26, 1.26], descent: [1.27, 1.27], touchdown: [1.28, 1.28], landed: [1.28, 1.28],
      },
    },
    {
      key: "signal", label: "信号强度", labelEn: "SIGNAL", unit: "dBm", decimals: 1,
      base: -84.2, amp: 1.8, wave: 0.35, phase: 0.7, relNoise: 0.004,
      flight: {
        liftoff: [-80, -82], separation: [-82, -92], transfer: [-92, -112],
        braking: [-108, -104], descent: [-102, -98], touchdown: [-96, -95], landed: [-94, -93],
      },
    },
    {
      key: "cabinPressure", label: "舱压", labelEn: "CABIN PRESS", unit: "kPa", decimals: 1,
      base: 101.2, amp: 0.22, wave: 0.3, phase: 4.2, relNoise: 0.0008,
    },
    {
      key: "power", label: "电力", labelEn: "POWER", unit: "%", decimals: 1,
      base: 93.8, amp: 1.4, wave: 0.15, phase: 5.0, relNoise: 0.003,
      flight: {
        liftoff: [97, 96], separation: [96, 95], transfer: [95, 94],
        braking: [94, 93], descent: [93, 88], touchdown: [88, 86], landed: [86, 86],
      },
    },
    {
      key: "downlink", label: "下行速率", labelEn: "DOWNLINK", unit: "Mbps", decimals: 1,
      base: 126, amp: 8, wave: 0.45, phase: 2.0, relNoise: 0.01,
      flight: {
        liftoff: [256, 220], separation: [220, 192], transfer: [192, 12, "out"],
        braking: [10, 8], descent: [8, 2.4, "out"], touchdown: [2.4, 2], landed: [2, 1.2],
      },
    },
  ],
  bootLines: [
    "POWER BUS 一次电源上电自检 ······ OK",
    "GNC 惯性导航对准 ················ OK",
    "COMM 鹊桥中继链路握手 ··········· OK",
    "THERMAL 热控回路增压 ············ OK",
    "PROP 推进剂贮箱增压保压 ········· OK",
    "PAYLOAD 着陆载荷初始化 ·········· OK",
    "TELEMETRY 遥测数据流启动 ········ LIVE",
  ],
  standbyEvents: [
    { system: "LAUNCH", message: "发射场气象会商完成, 高空风切变满足窗口要求" },
    { system: "PROP", message: "推进剂加注至 98%, 贮箱增压保压正常" },
    { system: "GNC", message: "惯导平台精对准完成, 漂移率优于 0.005°/h" },
    { system: "COMM", message: "鹊桥中继星双向测距音完成, 链路余量充足" },
    { system: "ESC", message: "逃逸塔火工品配电安全解锁" },
    { system: "THERMAL", message: "推进剂温控回路平衡, 贮箱温度梯度收敛" },
    { system: "FLIGHT", message: "射前检查程序推进中, 各号位报告正常" },
    { system: "DSN", message: "佳木斯站捕获预置完成, 自动跟踪待命" },
  ],
  phaseEvents: {
    liftoff: [
      { system: "GNC", message: "程序转弯完成, 攻角保持在包线内" },
      { system: "PROP", message: "发动机涡轮泵转速稳定, 推力室压力标称" },
      { system: "FLIGHT", message: "最大动压点通过, 气动载荷峰值回落" },
      { system: "ESC", message: "逃逸塔分离确认, 落入预定安全区" },
    ],
    separation: [
      { system: "FLIGHT", message: "整流罩分离, 载荷暴露空间环境" },
      { system: "GNC", message: "上面级姿态建立, 三轴稳定保持" },
      { system: "PROP", message: "上面级发动机工况正常, 混合比稳定" },
    ],
    transfer: [
      { system: "GNC", message: "中途轨道修正 MCC 点火 12s, 偏差收敛" },
      { system: "COMM", message: "鹊桥中继星测距刷新, 光行延迟符合星历" },
      { system: "EPS", message: "太阳翼对日定向, 母线电压平稳" },
      { system: "THERMAL", message: "月影段热控预案加载, 回路温度稳定" },
      { system: "GNC", message: "星敏感器识别 14 颗导航星, 惯性基准刷新" },
    ],
    braking: [
      { system: "PROP", message: "主发动机泵压稳定, 剩余推进剂符合预期" },
      { system: "GNC", message: "制动关机点解算刷新, 近月点高度收敛" },
      { system: "FLIGHT", message: "200×200 km 环月轨道建立, 轨道根数标称" },
    ],
    descent: [
      { system: "GNC", message: "避障机动完成, 选定平坦着陆区" },
      { system: "FLIGHT", message: "恒定下降率保持, 激光高度计交叉校准" },
      { system: "PROP", message: "着陆发动机节流工作, 涡轮温度正常" },
      { system: "COMM", message: "中继链路延迟 1.28s, 遥测帧完整率 100%" },
    ],
    touchdown: [
      { system: "FLIGHT", message: "着陆腿缓冲行程正常, 姿角 1.4°" },
      { system: "PROP", message: "推进剂隔离阀关闭, 发动机吹除完成" },
    ],
    landed: [
      { system: "EPS", message: "太阳翼展开锁定, 月面发电建立" },
      { system: "PAYLOAD", message: "地形相机首帧成像, 数据完整" },
      { system: "COMM", message: "月面工作段下行链路稳定" },
      { system: "THERMAL", message: "月面昼夜温差预案就绪" },
    ],
  },
  cautionPool: [
    { metricKey: "signal", message: "下行信号强度跌破阈值, 切换鹊桥中继备份链路" },
    { metricKey: "downlink", message: "下行速率降级, 数据压缩比自动上调" },
    { metricKey: "power", message: "母线电压波动, 非关键负载重新分配" },
    { metricKey: "lightDelay", message: "地月光行延迟抖动, 中继测距重新校准" },
    { metricKey: "cabinPressure", message: "舱压轻微波动, 密封段增压补偿启动" },
  ],
  criticalPool: [
    { metricKey: "fuel", message: "燃料余量逼近红线, 非必要机动全部冻结" },
    { metricKey: "altitude", message: "轨道高度偏离标称值, 紧急机动预案待命" },
    { metricKey: "thrust", message: "推力室压力异常, 备份涡轮泵切换" },
  ],
  stationSeed: [
    { stationKey: "jms", stationName: "佳木斯", code: "JMS-66", online: true, linkRate: 256 },
    { stationKey: "ksh", stationName: "喀什", code: "KSH-35", online: true, linkRate: 184 },
    { stationKey: "queqiao", stationName: "鹊桥中继星", code: "QQ-R1", online: true, linkRate: 384 },
    { stationKey: "baire", stationName: "布宜诺斯艾利斯", code: "BUE-12", online: false, linkRate: 0 },
  ],
  stationRateRange: [24, 420],
  blackout: null,
  visual: {
    planet: "moon",
    hueSourceVar: "--foreground",
    hueShift: 0,
    satScale: 1,
    lightScale: 1,
    dustAlpha: 0,
  },
  rover: {
    roverName: "玉兔号",
    roverNameEn: "YUTU-9",
    samplePrefix: "YT",
    surfaceWord: "月面",
    unlockLog: "玉兔号转移机构展开到位, 巡视器驶离着陆平台, 月面遥控通道建立",
    craterNames: null,
  },
  comm: LUNA_9_COMM,
};

/* ============================ ARES-1 火星着陆任务 ============================ */

export const ARES_1: MissionDef = {
  id: "ares1",
  code: "ARES-1",
  title: "火星着陆任务",
  badge: "A1",
  headerEn: "MARS LANDING MISSION WALL",
  landingSite: "乌托邦平原",
  planetWord: "火星",
  approachEn: "MARS APPROACH · TRACKING LOCK",
  linkEn: "EARTH–MARS LINK · TW RELAY LOCK",
  linkZh: "地火链路 · 地面站网络",
  lightDelayNote: "地火光行延迟约 4–20 分钟波动",
  landingBody:
    "器箭分离至今, ARES-1 完成地火转移、气动减速穿越黑障区、伞降与动力下降, 着陆腿触火姿态角 1.2°, 太阳翼已展开, 乌托邦平原火面工作段正式开启。",
  phases: [
    { id: "standby", label: "待发射", labelEn: "STANDBY", milestone: "", durationSec: Infinity },
    { id: "liftoff", label: "点火起飞", labelEn: "LIFTOFF", milestone: "点火!ARES-1 按时起飞, 塔架摆开, 程序转弯开始", durationSec: 12 },
    { id: "separation", label: "级段分离", labelEn: "STAGE SEP", milestone: "一二级分离确认, 上面级发动机二次点火成功", durationSec: 10 },
    { id: "transfer", label: "地火转移", labelEn: "TMI COAST", milestone: "器箭分离, 地火转移轨道确认, 太阳翼展开", durationSec: 40 },
    { id: "braking", label: "气动减速入轨", labelEn: "EDL ENTRY", milestone: "气动减速开始, 着陆舱进入火星大气层, 隔热罩温度飙升", durationSec: 26 },
    { id: "descent", label: "动力下降", labelEn: "POWERED DESC", milestone: "伞降减速完成, 反推发动机点火, 动力下降段开始", durationSec: 16 },
    { id: "touchdown", label: "火星软着陆", labelEn: "TOUCHDOWN", milestone: "着陆腿触火灯亮, 发动机关机, 乌托邦平原软着陆成功!", durationSec: 6 },
    { id: "landed", label: "着陆完成", labelEn: "LANDED", milestone: "着陆确认, ARES-1 火面工作段开始", durationSec: Infinity },
  ],
  metricDefs: [
    {
      key: "altitude", label: "高度", labelEn: "ALTITUDE", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 0, relNoise: 0.0004,
      flight: {
        liftoff: [0, 72, "in"], separation: [72, 210], transfer: [210, 5500000, "in"],
        braking: [5500000, 120, "out"], descent: [120, 0.02, "out"], touchdown: [0.02, 0], landed: [0, 0],
      },
    },
    {
      key: "velocity", label: "飞行速度", labelEn: "VELOCITY", unit: "km/s", decimals: 3,
      base: 0, amp: 0, wave: 0, phase: 1.2, relNoise: 0.0015,
      flight: {
        liftoff: [0, 2.42, "in"], separation: [2.42, 8.35], transfer: [8.35, 5.42, "out"],
        braking: [5.42, 0.42, "out"], descent: [0.42, 0.003, "out"], touchdown: [0.003, 0], landed: [0, 0],
      },
    },
    {
      key: "deltaV", label: "Δv 剩余", labelEn: "DELTA-V REMAIN", unit: "m/s", decimals: 0,
      base: 13650, amp: 0.5, wave: 0.1, phase: 0.4, relNoise: 0.0002,
      flight: {
        liftoff: [13650, 8200], separation: [8200, 6400], transfer: [6400, 6050],
        braking: [6050, 2400, "out"], descent: [2400, 620, "out"], touchdown: [620, 580], landed: [580, 580],
      },
    },
    {
      key: "isp", label: "比冲", labelEn: "SPEC. IMPULSE", unit: "s", decimals: 0,
      base: 306, amp: 0.2, wave: 0.2, phase: 2.2, relNoise: 0.0005,
      flight: {
        liftoff: [306, 306], separation: [344, 344], transfer: [462, 462],
        braking: [462, 462], descent: [318, 318], touchdown: [318, 0, "out"], landed: [0, 0],
      },
    },
    {
      key: "thrust", label: "发动机推力", labelEn: "ENGINE THRUST", unit: "kN", decimals: 1,
      base: 0, amp: 0, wave: 0, phase: 3.3, relNoise: 0.002,
      flight: {
        liftoff: [4860, 4860], separation: [0, 1580, "out"], transfer: [0, 0],
        braking: [0, 0], descent: [9.2, 5.4], touchdown: [5.4, 0, "out"], landed: [0, 0],
      },
    },
    {
      key: "fuel", label: "燃料余量", labelEn: "FUEL", unit: "%", decimals: 1,
      base: 100, amp: 0.05, wave: 0.2, phase: 2.4, relNoise: 0.0004,
      flight: {
        liftoff: [100, 84], separation: [84, 70], transfer: [70, 66],
        braking: [66, 44, "out"], descent: [44, 16, "out"], touchdown: [16, 15], landed: [15, 15],
      },
    },
    {
      key: "range", label: "着陆点距离", labelEn: "RANGE TO SITE", unit: "km", decimals: 0,
      base: 55000000, amp: 30, wave: 0.05, phase: 1.1, relNoise: 0.00002,
      flight: {
        liftoff: [55000000, 54999900], separation: [54999900, 54999400], transfer: [54999400, 4200, "in"],
        braking: [4200, 120, "out"], descent: [120, 0.02, "out"], touchdown: [0.02, 0], landed: [0, 0],
      },
    },
    {
      key: "inclination", label: "轨道倾角", labelEn: "INCLINATION", unit: "°", decimals: 1,
      base: 28.5, amp: 0.02, wave: 0.1, phase: 4.4, relNoise: 0.0003,
      flight: {
        liftoff: [28.5, 28.5], separation: [28.5, 26.8], transfer: [26.8, 25.4],
        braking: [25.4, 24.9], descent: [24.9, 24.9], touchdown: [24.9, 24.9], landed: [24.9, 24.9],
      },
    },
    {
      key: "periapsis", label: "近火点高度", labelEn: "PERIAPSIS", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 5.1, relNoise: 0.001,
      flight: {
        liftoff: [0, 0], separation: [0, 210], transfer: [210, 380], braking: [380, 120, "out"],
        descent: [120, 120], touchdown: [120, 0], landed: [0, 0],
      },
    },
    {
      key: "apoapsis", label: "远火点高度", labelEn: "APOAPSIS", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 0.9, relNoise: 0.001,
      flight: {
        liftoff: [0, 72], separation: [72, 210], transfer: [210, 5500000, "in"],
        braking: [5500000, 260, "out"], descent: [260, 260], touchdown: [260, 0], landed: [0, 0],
      },
    },
    {
      key: "lightDelay", label: "地火光行延迟", labelEn: "LIGHT DELAY", unit: "min", decimals: 1,
      base: 12.4, amp: 7.2, wave: 0.06, phase: 3.7, relNoise: 0.004,
      flight: {
        liftoff: [0.02, 0.02], separation: [0.02, 0.05], transfer: [0.05, 13.6, "in"],
        braking: [13.6, 16.2], descent: [16.2, 17.1], touchdown: [17.1, 17.4], landed: [17.4, 17.4],
      },
    },
    {
      key: "signal", label: "信号强度", labelEn: "SIGNAL", unit: "dBm", decimals: 1,
      base: -96.4, amp: 2.2, wave: 0.35, phase: 0.7, relNoise: 0.004,
      flight: {
        liftoff: [-92, -96], separation: [-96, -108], transfer: [-108, -138],
        braking: [-136, -128], descent: [-126, -122], touchdown: [-120, -118], landed: [-117, -115],
      },
    },
    {
      key: "cabinPressure", label: "舱压", labelEn: "CABIN PRESS", unit: "kPa", decimals: 1,
      base: 101.4, amp: 0.24, wave: 0.3, phase: 4.2, relNoise: 0.0008,
    },
    {
      key: "power", label: "电力", labelEn: "POWER", unit: "%", decimals: 1,
      base: 92.6, amp: 1.6, wave: 0.15, phase: 5.0, relNoise: 0.003,
      flight: {
        liftoff: [96, 95], separation: [95, 94], transfer: [94, 92],
        braking: [92, 89], descent: [89, 84], touchdown: [84, 82], landed: [82, 82],
      },
    },
    {
      key: "illumination", label: "光照度", labelEn: "ILLUMINANCE", unit: "W/m²", decimals: 0,
      base: 590, amp: 6, wave: 0.2, phase: 1.3, relNoise: 0.006,
      flight: {
        liftoff: [590, 590], separation: [590, 588], transfer: [588, 585],
        braking: [585, 560], descent: [560, 520], touchdown: [520, 505], landed: [505, 498],
      },
    },
    {
      key: "downlink", label: "下行速率", labelEn: "DOWNLINK", unit: "Mbps", decimals: 2,
      base: 42, amp: 3, wave: 0.45, phase: 2.0, relNoise: 0.012,
      flight: {
        liftoff: [86, 72], separation: [72, 54], transfer: [54, 2.8, "out"],
        braking: [2.2, 1.4, "out"], descent: [1.2, 0.62, "out"], touchdown: [0.6, 0.5], landed: [0.5, 0.42],
      },
    },
  ],
  bootLines: [
    "POWER BUS 一次电源上电自检 ······ OK",
    "GNC 惯性导航对准 ················ OK",
    "COMM 天问中继链路握手 ··········· OK",
    "THERMAL 热控回路增压 ············ OK",
    "PROP 推进剂贮箱增压保压 ········· OK",
    "PAYLOAD 着陆载荷初始化 ·········· OK",
    "TELEMETRY 遥测数据流启动 ········ LIVE",
  ],
  standbyEvents: [
    { system: "LAUNCH", message: "发射场气象会商完成, 地火转移窗口条件满足" },
    { system: "PROP", message: "推进剂加注至 97%, 贮箱增压保压正常" },
    { system: "GNC", message: "惯导平台精对准完成, 火星星历注入校验通过" },
    { system: "COMM", message: "天问中继星双向测距音完成, 深空链路余量充足" },
    { system: "ESC", message: "逃逸塔火工品配电安全解锁" },
    { system: "THERMAL", message: "隔热罩热防护层温控巡检正常, 无异常热点" },
    { system: "FLIGHT", message: "射前检查程序推进中, 各号位报告正常" },
    { system: "DSN", message: "佳木斯站大口径天线捕获预置完成, 自动跟踪待命" },
  ],
  phaseEvents: {
    liftoff: [
      { system: "GNC", message: "程序转弯完成, 攻角保持在包线内" },
      { system: "PROP", message: "发动机涡轮泵转速稳定, 推力室压力标称" },
      { system: "FLIGHT", message: "最大动压点通过, 气动载荷峰值回落" },
      { system: "ESC", message: "逃逸塔分离确认, 落入预定安全区" },
    ],
    separation: [
      { system: "FLIGHT", message: "整流罩分离, 载荷暴露空间环境" },
      { system: "GNC", message: "上面级姿态建立, 三轴稳定保持" },
      { system: "PROP", message: "上面级发动机工况正常, 混合比稳定" },
    ],
    transfer: [
      { system: "GNC", message: "中途轨道修正 MCC 点火 15s, 火星瞄准点偏差收敛" },
      { system: "COMM", message: "天问中继星测距刷新, 地火光行延迟符合星历" },
      { system: "EPS", message: "太阳翼对日定向, 母线电压平稳" },
      { system: "THERMAL", message: "深空冷背景热控预案加载, 回路温度稳定" },
      { system: "GNC", message: "星敏感器识别 16 颗导航星, 惯性基准刷新" },
      { system: "RAD", message: "行星际辐射剂量监测正常, 舱内屏蔽余量充足" },
    ],
    braking: [
      { system: "FLIGHT", message: "火星大气捕获确认, 气动过载峰值 4.2g 在限内" },
      { system: "THERMAL", message: "隔热罩表面温度峰值通过, 烧蚀层工作正常" },
      { system: "GNC", message: "再入走廊横向制导修正, 着陆瞄准点收敛" },
    ],
    descent: [
      { system: "FLIGHT", message: "减速伞工作正常, 伞降减速段完成" },
      { system: "GNC", message: "避障机动完成, 选定乌托邦平原平坦着陆区" },
      { system: "PROP", message: "反推发动机节流工作, 涡轮温度正常" },
      { system: "COMM", message: "天问中继链路延迟分钟级, 遥测帧完整率 100%" },
    ],
    touchdown: [
      { system: "FLIGHT", message: "着陆腿缓冲行程正常, 姿角 1.2°" },
      { system: "PROP", message: "推进剂隔离阀关闭, 发动机吹除完成" },
    ],
    landed: [
      { system: "EPS", message: "太阳翼展开锁定, 火面发电建立" },
      { system: "PAYLOAD", message: "地形相机首帧成像, 乌托邦平原岩块分布清晰" },
      { system: "COMM", message: "火面工作段经天问中继下行链路稳定" },
      { system: "THERMAL", message: "火星沙尘与昼夜温差预案就绪" },
    ],
  },
  cautionPool: [
    { metricKey: "signal", message: "火星沙尘干扰下行信号, 切换天问中继备份链路" },
    { metricKey: "downlink", message: "深空下行速率降级, 数据压缩比自动上调" },
    { metricKey: "power", message: "母线电压波动, 非关键负载重新分配" },
    { metricKey: "lightDelay", message: "地火光行延迟抖动, 深空网测距重新校准" },
    { metricKey: "cabinPressure", message: "热控回路温度波动, 舱压轻微波动, 密封段增压补偿启动" },
  ],
  criticalPool: [
    { metricKey: "fuel", message: "燃料余量逼近红线, 非必要机动全部冻结" },
    { metricKey: "altitude", message: "再入弹道偏离标称走廊, 紧急制导预案待命" },
    { metricKey: "thrust", message: "反推发动机推力室压力异常, 备份涡轮泵切换" },
  ],
  stationSeed: [
    { stationKey: "jms", stationName: "佳木斯", code: "JMS-66", online: true, linkRate: 96 },
    { stationKey: "ksh", stationName: "喀什", code: "KSH-35", online: true, linkRate: 64 },
    { stationKey: "tianwen", stationName: "天问中继星", code: "TW-R1", online: true, linkRate: 128 },
    { stationKey: "baire", stationName: "布宜诺斯艾利斯", code: "BUE-12", online: false, linkRate: 0 },
  ],
  stationRateRange: [8, 150],
  blackout: {
    phase: "braking",
    startSec: 6,
    durationSec: 14,
    recoveryComm: ARES_1_BLACKOUT_RECOVERY,
  },
  visual: {
    planet: "mars",
    hueSourceVar: "--destructive",
    hueShift: 18,
    satScale: 0.86,
    lightScale: 0.84,
    dustAlpha: 0.14,
  },
  rover: {
    roverName: "祝融号",
    roverNameEn: "ZHURONG-7",
    samplePrefix: "ZR",
    surfaceWord: "火面",
    unlockLog: "祝融号转移坡道展开到位, 巡视器驶离着陆平台, 火面遥控通道建立",
    craterNames: [
      "天问", "祝融", "荧惑", "凤凰", "乌托邦", "伊希地",
      "大流沙", "麒麟", "朱雀", "玄武", "揽月", "文昌",
    ],
  },
  comm: ARES_1_COMM,
};

/* ============================ EUROPA-1 木卫二冰面着陆任务 ============================ */

export const EUROPA_1: MissionDef = {
  id: "europa1",
  code: "EUROPA-1",
  title: "木卫二冰面着陆任务",
  badge: "E1",
  headerEn: "EUROPA LANDING MISSION WALL",
  landingSite: "柯纳马拉混沌区",
  planetWord: "木卫二",
  approachEn: "EUROPA APPROACH · TRACKING LOCK",
  linkEn: "EARTH–EUROPA LINK · ICE RELAY LOCK",
  linkZh: "地木链路 · 地面站网络",
  lightDelayNote: "地木光行延迟约 35–52 分钟波动",
  landingBody:
    "器箭分离至今, EUROPA-1 完成地木转移、穿越木星辐射带入轨制动与动力下降, 着陆腿触冰姿态角 1.1°, 冰锚固着良好, 太阳翼已展开, 柯纳马拉混沌区冰面工作段正式开启。",
  phases: [
    { id: "standby", label: "待发射", labelEn: "STANDBY", milestone: "", durationSec: Infinity },
    { id: "liftoff", label: "点火起飞", labelEn: "LIFTOFF", milestone: "点火!EUROPA-1 按时起飞, 塔架摆开, 程序转弯开始", durationSec: 12 },
    { id: "separation", label: "级段分离", labelEn: "STAGE SEP", milestone: "一二级分离确认, 上面级发动机二次点火成功", durationSec: 10 },
    { id: "transfer", label: "地木转移", labelEn: "EARTH–JUPITER", milestone: "器箭分离, 地木转移轨道确认, 大面积太阳翼展开", durationSec: 48 },
    { id: "braking", label: "入轨制动", labelEn: "JOVI ORBIT INSERT", milestone: "木星系统捕获制动点火, 穿越辐射带短时静默", durationSec: 16 },
    { id: "descent", label: "动力下降", labelEn: "POWERED DESC", milestone: "反推发动机点火, 冰面上空动力下降段开始", durationSec: 18 },
    { id: "touchdown", label: "冰面软着陆", labelEn: "TOUCHDOWN", milestone: "着陆腿触冰灯亮, 发动机关机, 柯纳马拉混沌区软着陆成功!", durationSec: 6 },
    { id: "landed", label: "着陆完成", labelEn: "LANDED", milestone: "着陆确认, EUROPA-1 冰面工作段开始", durationSec: Infinity },
  ],
  metricDefs: [
    {
      key: "altitude", label: "高度", labelEn: "ALTITUDE", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 0, relNoise: 0.0004,
      flight: {
        liftoff: [0, 76, "in"], separation: [76, 230], transfer: [230, 628000000, "in"],
        braking: [628000000, 400, "out"], descent: [400, 0.02, "out"], touchdown: [0.02, 0], landed: [0, 0],
      },
    },
    {
      key: "velocity", label: "飞行速度", labelEn: "VELOCITY", unit: "km/s", decimals: 3,
      base: 0, amp: 0, wave: 0, phase: 1.2, relNoise: 0.0015,
      flight: {
        liftoff: [0, 2.51, "in"], separation: [2.51, 9.12], transfer: [9.12, 8.6, "out"],
        braking: [8.6, 1.9, "out"], descent: [1.9, 0.003, "out"], touchdown: [0.003, 0], landed: [0, 0],
      },
    },
    {
      key: "deltaV", label: "Δv 剩余", labelEn: "DELTA-V REMAIN", unit: "m/s", decimals: 0,
      base: 15800, amp: 0.5, wave: 0.1, phase: 0.4, relNoise: 0.0002,
      flight: {
        liftoff: [15800, 9100], separation: [9100, 7200], transfer: [7200, 6800],
        braking: [6800, 2900, "out"], descent: [2900, 700, "out"], touchdown: [700, 650], landed: [650, 650],
      },
    },
    {
      key: "isp", label: "比冲", labelEn: "SPEC. IMPULSE", unit: "s", decimals: 0,
      base: 310, amp: 0.2, wave: 0.2, phase: 2.2, relNoise: 0.0005,
      flight: {
        liftoff: [310, 310], separation: [348, 348], transfer: [468, 468],
        braking: [468, 468], descent: [322, 322], touchdown: [322, 0, "out"], landed: [0, 0],
      },
    },
    {
      key: "thrust", label: "发动机推力", labelEn: "ENGINE THRUST", unit: "kN", decimals: 1,
      base: 0, amp: 0, wave: 0, phase: 3.3, relNoise: 0.002,
      flight: {
        liftoff: [5240, 5240], separation: [0, 1720, "out"], transfer: [0, 0],
        braking: [2.4, 2.4], descent: [10.5, 6.2], touchdown: [6.2, 0, "out"], landed: [0, 0],
      },
    },
    {
      key: "fuel", label: "燃料余量", labelEn: "FUEL", unit: "%", decimals: 1,
      base: 100, amp: 0.05, wave: 0.2, phase: 2.4, relNoise: 0.0004,
      flight: {
        liftoff: [100, 82], separation: [82, 67], transfer: [67, 62],
        braking: [62, 38, "out"], descent: [38, 15, "out"], touchdown: [15, 14], landed: [14, 14],
      },
    },
    {
      key: "range", label: "着陆点距离", labelEn: "RANGE TO SITE", unit: "km", decimals: 0,
      base: 628000000, amp: 400, wave: 0.05, phase: 1.1, relNoise: 0.00001,
      flight: {
        liftoff: [628000000, 627999900], separation: [627999900, 627999400], transfer: [627999400, 9600, "in"],
        braking: [9600, 400, "out"], descent: [400, 0.02, "out"], touchdown: [0.02, 0], landed: [0, 0],
      },
    },
    {
      key: "inclination", label: "轨道倾角", labelEn: "INCLINATION", unit: "°", decimals: 1,
      base: 28.5, amp: 0.02, wave: 0.1, phase: 4.4, relNoise: 0.0003,
      flight: {
        liftoff: [28.5, 28.5], separation: [28.5, 27.1], transfer: [27.1, 22.8],
        braking: [22.8, 66.2], descent: [66.2, 66.2], touchdown: [66.2, 66.2], landed: [66.2, 66.2],
      },
    },
    {
      key: "periapsis", label: "近木点高度", labelEn: "PERIJOVE", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 5.1, relNoise: 0.001,
      flight: {
        liftoff: [0, 0], separation: [0, 230], transfer: [230, 420], braking: [420, 150, "out"],
        descent: [150, 150], touchdown: [150, 0], landed: [0, 0],
      },
    },
    {
      key: "apoapsis", label: "远木点高度", labelEn: "APOJOVE", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 0.9, relNoise: 0.001,
      flight: {
        liftoff: [0, 76], separation: [76, 230], transfer: [230, 628000000, "in"],
        braking: [628000000, 300, "out"], descent: [300, 300], touchdown: [300, 0], landed: [0, 0],
      },
    },
    {
      key: "lightDelay", label: "地木光行延迟", labelEn: "LIGHT DELAY", unit: "min", decimals: 1,
      base: 44.2, amp: 7.6, wave: 0.05, phase: 3.7, relNoise: 0.004,
      flight: {
        liftoff: [0.02, 0.02], separation: [0.02, 0.06], transfer: [0.06, 38.4, "in"],
        braking: [38.4, 44.8], descent: [44.8, 47.2], touchdown: [47.2, 47.6], landed: [47.6, 47.6],
      },
    },
    {
      key: "signal", label: "信号强度", labelEn: "SIGNAL", unit: "dBm", decimals: 1,
      base: -108.6, amp: 2.6, wave: 0.35, phase: 0.7, relNoise: 0.004,
      flight: {
        liftoff: [-102, -108], separation: [-108, -122], transfer: [-122, -152],
        braking: [-150, -140], descent: [-138, -132], touchdown: [-130, -128], landed: [-127, -125],
      },
    },
    {
      key: "cabinPressure", label: "舱压", labelEn: "CABIN PRESS", unit: "kPa", decimals: 1,
      base: 101.6, amp: 0.26, wave: 0.3, phase: 4.2, relNoise: 0.0008,
    },
    {
      key: "power", label: "电力", labelEn: "POWER", unit: "%", decimals: 1,
      base: 91.4, amp: 1.8, wave: 0.15, phase: 5.0, relNoise: 0.003,
      flight: {
        liftoff: [95, 94], separation: [94, 92], transfer: [92, 89],
        braking: [89, 85], descent: [85, 80], touchdown: [80, 78], landed: [78, 78],
      },
    },
    {
      key: "radDose", label: "辐射剂量率", labelEn: "RAD DOSE RATE", unit: "mSv/h", decimals: 1,
      base: 0.05, amp: 0.01, wave: 0.2, phase: 1.3, relNoise: 0.02,
      flight: {
        liftoff: [0.06, 0.1], separation: [0.1, 0.18], transfer: [0.18, 0.42],
        braking: [0.42, 38.5], descent: [38.5, 12.4, "out"], touchdown: [12.4, 8.2], landed: [8.2, 7.6],
      },
    },
    {
      key: "downlink", label: "下行速率", labelEn: "DOWNLINK", unit: "Mbps", decimals: 2,
      base: 18, amp: 1.6, wave: 0.45, phase: 2.0, relNoise: 0.012,
      flight: {
        liftoff: [42, 36], separation: [36, 26], transfer: [26, 1.2, "out"],
        braking: [0.9, 0.5, "out"], descent: [0.45, 0.24, "out"], touchdown: [0.22, 0.18], landed: [0.18, 0.14],
      },
    },
  ],
  bootLines: [
    "POWER BUS 一次电源上电自检 ······ OK",
    "GNC 惯性导航对准 ················ OK",
    "COMM 冰桥中继链路握手 ··········· OK",
    "THERMAL 低温热控回路预冷 ········ OK",
    "RAD 抗辐射屏蔽层自检 ············ OK",
    "PROP 推进剂贮箱增压保压 ········· OK",
    "PAYLOAD 冰面着陆载荷初始化 ······ OK",
    "TELEMETRY 遥测数据流启动 ········ LIVE",
  ],
  standbyEvents: [
    { system: "LAUNCH", message: "发射场气象会商完成, 地木转移窗口条件满足" },
    { system: "PROP", message: "推进剂加注至 96%, 贮箱增压保压正常" },
    { system: "GNC", message: "惯导平台精对准完成, 木星星历注入校验通过" },
    { system: "COMM", message: "冰桥中继星双向测距音完成, 超深空链路余量充足" },
    { system: "RAD", message: "抗辐射屏蔽层完整性确认, 舱内剂量计校零" },
    { system: "THERMAL", message: "低温热控回路预冷完成, 冰面着陆缓冲预热正常" },
    { system: "FLIGHT", message: "射前检查程序推进中, 各号位报告正常" },
    { system: "DSN", message: "佳木斯站大口径天线捕获预置完成, 自动跟踪待命" },
  ],
  phaseEvents: {
    liftoff: [
      { system: "GNC", message: "程序转弯完成, 攻角保持在包线内" },
      { system: "PROP", message: "发动机涡轮泵转速稳定, 推力室压力标称" },
      { system: "FLIGHT", message: "最大动压点通过, 气动载荷峰值回落" },
      { system: "ESC", message: "逃逸塔分离确认, 落入预定安全区" },
    ],
    separation: [
      { system: "FLIGHT", message: "整流罩分离, 载荷暴露空间环境" },
      { system: "GNC", message: "上面级姿态建立, 三轴稳定保持" },
      { system: "PROP", message: "上面级发动机工况正常, 混合比稳定" },
    ],
    transfer: [
      { system: "GNC", message: "中途轨道修正 MCC 点火 20s, 木星瞄准点偏差收敛" },
      { system: "COMM", message: "冰桥中继星测距刷新, 地木光行延迟符合星历" },
      { system: "EPS", message: "大面积太阳翼对日定向, 母线电压平稳" },
      { system: "THERMAL", message: "深空冷背景热控预案加载, 回路温度稳定" },
      { system: "RAD", message: "行星际辐射剂量缓升, 屏蔽余量充足" },
      { system: "GNC", message: "星敏感器识别 18 颗导航星, 惯性基准刷新" },
    ],
    braking: [
      { system: "FLIGHT", message: "木星系统捕获确认, 入轨制动主发动机点火" },
      { system: "RAD", message: "辐射带通量急剧攀升, 剂量率进入警戒区间" },
      { system: "COMM", message: "强辐射干扰链路, 转入自主导航静默模式" },
    ],
    descent: [
      { system: "GNC", message: "冰面避障机动完成, 避开冰脊与裂隙选定平坦着陆区" },
      { system: "PROP", message: "反推发动机节流工作, 涡轮温度正常" },
      { system: "FLIGHT", message: "恒定下降率保持, 冰面激光高度计交叉校准" },
      { system: "COMM", message: "冰桥中继链路延迟 47 分钟, 遥测帧完整率 100%" },
    ],
    touchdown: [
      { system: "FLIGHT", message: "着陆腿缓冲行程正常, 姿角 1.1°, 冰锚固着良好" },
      { system: "PROP", message: "推进剂隔离阀关闭, 发动机吹除完成" },
    ],
    landed: [
      { system: "EPS", message: "太阳翼展开锁定, 冰面发电建立" },
      { system: "PAYLOAD", message: "地形相机首帧成像, 柯纳马拉混沌区冰块分布清晰" },
      { system: "COMM", message: "冰面工作段经冰桥中继下行链路稳定" },
      { system: "THERMAL", message: "冰面极低温预案就绪, 同位素热源功率标称" },
    ],
  },
  cautionPool: [
    { metricKey: "signal", message: "木星辐射带干扰下行信号, 切换冰桥中继备份链路" },
    { metricKey: "downlink", message: "超深空下行速率降级, 数据压缩比自动上调" },
    { metricKey: "power", message: "母线电压波动, 非关键负载重新分配" },
    { metricKey: "lightDelay", message: "地木光行延迟抖动, 深空网测距重新校准" },
    { metricKey: "cabinPressure", message: "低温热控回路温度波动, 舱压轻微波动, 密封段增压补偿启动" },
    { metricKey: "radDose", message: "辐射剂量率短时攀升, 乘组舱屏蔽加强" },
  ],
  criticalPool: [
    { metricKey: "fuel", message: "燃料余量逼近红线, 非必要机动全部冻结" },
    { metricKey: "altitude", message: "制动弹道偏离标称走廊, 紧急制导预案待命" },
    { metricKey: "radDose", message: "辐射剂量率突破安全阈值, 载荷降级运行" },
    { metricKey: "thrust", message: "反推发动机推力室压力异常, 备份涡轮泵切换" },
  ],
  stationSeed: [
    { stationKey: "jms", stationName: "佳木斯", code: "JMS-66", online: true, linkRate: 42 },
    { stationKey: "ksh", stationName: "喀什", code: "KSH-35", online: true, linkRate: 28 },
    { stationKey: "icebridge", stationName: "冰桥中继星", code: "IB-R1", online: true, linkRate: 64 },
    { stationKey: "baire", stationName: "布宜诺斯艾利斯", code: "BUE-12", online: false, linkRate: 0 },
  ],
  stationRateRange: [3, 80],
  blackout: {
    phase: "braking",
    startSec: 5,
    durationSec: 9,
    recoveryComm: EUROPA_1_BLACKOUT_RECOVERY,
  },
  visual: {
    planet: "europa",
    hueSourceVar: "--primary",
    hueShift: -16,
    satScale: 0.42,
    lightScale: 1.3,
    dustAlpha: 0,
  },
  rover: {
    roverName: "凌波号",
    roverNameEn: "LINGBO-3",
    samplePrefix: "LB",
    surfaceWord: "冰面",
    unlockLog: "凌波号转移坡道展开到位, 冰面巡视器驶离着陆平台, 冰面遥控通道建立",
    craterNames: [
      "柯纳马拉", "米诺斯", "锡拉", "西顿", "卡德摩斯", "芬里尔",
      "普维尔", "洛基", "御盖", "阿加维", "提亚马特", "埃利",
    ],
  },
  comm: EUROPA_1_COMM,
};

/* ============================ VNS-1 金星着陆任务 ============================ */

export const VENUS_1: MissionDef = {
  id: "venus1",
  code: "VNS-1",
  title: "金星着陆任务",
  badge: "V1",
  headerEn: "VENUS LANDING MISSION WALL",
  landingSite: "拉维尼亚平原",
  planetWord: "金星",
  approachEn: "VENUS APPROACH · TRACKING LOCK",
  linkEn: "EARTH–VENUS LINK · VOR RELAY LOCK",
  linkZh: "地金链路 · 地面站网络",
  lightDelayNote: "地金光行延迟约 3–12 分钟波动",
  landingBody:
    "器箭分离至今, VNS-1 完成地金转移、高空投放、气动减速与酸云穿透, 着陆腿短暂触金姿态角 1.3°, 表面温度 465°C, 气压 92 倍标准大气压——生存窗口 240 秒已开启, 夸父一号随时待命, 上升发动机保持热待机。",
  phases: [
    { id: "standby", label: "待发射", labelEn: "STANDBY", milestone: "", durationSec: Infinity },
    { id: "liftoff", label: "点火起飞", labelEn: "LIFTOFF", milestone: "点火!VNS-1 按时起飞, 塔架摆开, 程序转弯开始", durationSec: 12 },
    { id: "separation", label: "级段分离", labelEn: "STAGE SEP", milestone: "一二级分离确认, 上面级发动机二次点火成功", durationSec: 10 },
    { id: "transfer", label: "地金转移", labelEn: "VENUS TRANSFER", milestone: "器箭分离, 地金转移轨道确认, 太阳翼展开", durationSec: 36 },
    { id: "braking", label: "气动减速", labelEn: "AERO BRAKING", milestone: "高空投放开始, 气动减速加热, 隔热罩温度飙升", durationSec: 28 },
    { id: "descent", label: "酸云穿透", labelEn: "ACID CLOUD DESC", milestone: "穿入浓硫酸云层, 能见度归零, 耐蚀防护满功率工作", durationSec: 18 },
    { id: "touchdown", label: "短暂触地", labelEn: "TOUCHDOWN", milestone: "着陆腿触金灯亮, 反推关机, 拉维尼亚平原短暂触地成功!", durationSec: 6 },
    { id: "landed", label: "表面工作", labelEn: "SURFACE OPS", milestone: "触地确认, 表面生存窗口 240 秒倒计时开启", durationSec: Infinity },
  ],
  metricDefs: [
    {
      key: "altitude", label: "高度", labelEn: "ALTITUDE", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 0, relNoise: 0.0004,
      flight: {
        liftoff: [0, 70, "in"], separation: [70, 220], transfer: [220, 41000000, "in"],
        braking: [41000000, 130, "out"], descent: [130, 0.05, "out"], touchdown: [0.05, 0], landed: [0, 0],
      },
    },
    {
      key: "velocity", label: "飞行速度", labelEn: "VELOCITY", unit: "km/s", decimals: 3,
      base: 0, amp: 0, wave: 0, phase: 1.2, relNoise: 0.0015,
      flight: {
        liftoff: [0, 2.45, "in"], separation: [2.45, 8.62], transfer: [8.62, 9.24, "in"],
        braking: [9.24, 0.38, "out"], descent: [0.38, 0.004, "out"], touchdown: [0.004, 0], landed: [0, 0],
      },
    },
    {
      key: "deltaV", label: "Δv 剩余", labelEn: "DELTA-V REMAIN", unit: "m/s", decimals: 0,
      base: 14200, amp: 0.5, wave: 0.1, phase: 0.4, relNoise: 0.0002,
      flight: {
        liftoff: [14200, 8600], separation: [8600, 6900], transfer: [6900, 6600],
        braking: [6600, 5200], descent: [5200, 1450, "out"], touchdown: [1450, 1380], landed: [1380, 1380],
      },
    },
    {
      key: "isp", label: "比冲", labelEn: "SPEC. IMPULSE", unit: "s", decimals: 0,
      base: 308, amp: 0.2, wave: 0.2, phase: 2.2, relNoise: 0.0005,
      flight: {
        liftoff: [308, 308], separation: [346, 346], transfer: [464, 464],
        braking: [464, 464], descent: [320, 320], touchdown: [320, 0, "out"], landed: [0, 0],
      },
    },
    {
      key: "thrust", label: "发动机推力", labelEn: "ENGINE THRUST", unit: "kN", decimals: 1,
      base: 0, amp: 0, wave: 0, phase: 3.3, relNoise: 0.002,
      flight: {
        liftoff: [5020, 5020], separation: [0, 1650, "out"], transfer: [0, 0],
        braking: [0, 0], descent: [11.4, 6.6], touchdown: [6.6, 0, "out"], landed: [0, 0],
      },
    },
    {
      key: "fuel", label: "燃料余量", labelEn: "FUEL", unit: "%", decimals: 1,
      base: 100, amp: 0.05, wave: 0.2, phase: 2.4, relNoise: 0.0004,
      flight: {
        liftoff: [100, 83], separation: [83, 69], transfer: [69, 66],
        braking: [66, 63], descent: [63, 30, "out"], touchdown: [30, 28], landed: [28, 28],
      },
    },
    {
      key: "range", label: "着陆点距离", labelEn: "RANGE TO SITE", unit: "km", decimals: 0,
      base: 41000000, amp: 25, wave: 0.05, phase: 1.1, relNoise: 0.00002,
      flight: {
        liftoff: [41000000, 40999900], separation: [40999900, 40999400], transfer: [40999400, 3600, "in"],
        braking: [3600, 130, "out"], descent: [130, 0.05, "out"], touchdown: [0.05, 0], landed: [0, 0],
      },
    },
    {
      key: "periapsis", label: "近金点高度", labelEn: "PERICYTHERION", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 5.1, relNoise: 0.001,
      flight: {
        liftoff: [0, 0], separation: [0, 220], transfer: [220, 400], braking: [400, 130, "out"],
        descent: [130, 130], touchdown: [130, 0], landed: [0, 0],
      },
    },
    {
      key: "lightDelay", label: "地金光行延迟", labelEn: "LIGHT DELAY", unit: "min", decimals: 1,
      base: 5.2, amp: 3.4, wave: 0.06, phase: 3.7, relNoise: 0.004,
      flight: {
        liftoff: [0.02, 0.02], separation: [0.02, 0.05], transfer: [0.05, 5.4, "in"],
        braking: [5.4, 5.7], descent: [5.7, 5.9], touchdown: [5.9, 6.0], landed: [6.0, 6.0],
      },
    },
    {
      key: "signal", label: "信号强度", labelEn: "SIGNAL", unit: "dBm", decimals: 1,
      base: -94.8, amp: 2.1, wave: 0.35, phase: 0.7, relNoise: 0.004,
      flight: {
        liftoff: [-90, -94], separation: [-94, -106], transfer: [-106, -132],
        braking: [-130, -124], descent: [-122, -118], touchdown: [-116, -114], landed: [-113, -111],
      },
    },
    {
      key: "cabinPressure", label: "舱压", labelEn: "CABIN PRESS", unit: "kPa", decimals: 1,
      base: 101.5, amp: 0.25, wave: 0.3, phase: 4.2, relNoise: 0.0008,
    },
    {
      key: "power", label: "电力", labelEn: "POWER", unit: "%", decimals: 1,
      base: 92.2, amp: 1.7, wave: 0.15, phase: 5.0, relNoise: 0.003,
      flight: {
        liftoff: [96, 95], separation: [95, 93], transfer: [93, 90],
        braking: [90, 85], descent: [85, 78], touchdown: [78, 75], landed: [75, 68],
      },
    },
    {
      key: "surfaceTemp", label: "表面温度", labelEn: "SURFACE TEMP", unit: "°C", decimals: 0,
      base: 22, amp: 0.4, wave: 0.2, phase: 1.3, relNoise: 0.003,
      flight: {
        liftoff: [22, 22], separation: [22, 18], transfer: [18, -38, "out"],
        braking: [-38, 320, "in"], descent: [320, 452, "in"], touchdown: [452, 464], landed: [464, 465],
      },
    },
    {
      key: "surfacePressure", label: "表面气压", labelEn: "SURFACE PRESS", unit: "atm", decimals: 1,
      base: 1.0, amp: 0.01, wave: 0.2, phase: 2.6, relNoise: 0.002,
      flight: {
        liftoff: [1, 0.6, "out"], separation: [0.6, 0.02, "out"], transfer: [0.02, 0.001, "out"],
        braking: [0.001, 1.8, "in"], descent: [1.8, 68, "in"], touchdown: [68, 91], landed: [91, 92],
      },
    },
    {
      key: "cloudOpticalDepth", label: "酸云光学深度", labelEn: "ACID CLOUD τ", unit: "τ", decimals: 1,
      base: 0, amp: 0.02, wave: 0.15, phase: 3.9, relNoise: 0.01,
      flight: {
        liftoff: [0, 0], separation: [0, 0], transfer: [0, 0],
        braking: [0, 4.2, "in"], descent: [4.2, 36, "in"], touchdown: [36, 8, "out"], landed: [8, 3, "out"],
      },
    },
    {
      key: "downlink", label: "下行速率", labelEn: "DOWNLINK", unit: "Mbps", decimals: 2,
      base: 56, amp: 4, wave: 0.45, phase: 2.0, relNoise: 0.012,
      flight: {
        liftoff: [110, 92], separation: [92, 68], transfer: [68, 3.6, "out"],
        braking: [2.8, 1.8, "out"], descent: [1.5, 0.8, "out"], touchdown: [0.75, 0.62], landed: [0.6, 0.5],
      },
    },
  ],
  bootLines: [
    "POWER BUS 一次电源上电自检 ······ OK",
    "GNC 惯性导航对准 ················ OK",
    "COMM 金星轨道中继链路握手 ······· OK",
    "THERMAL 主动制冷回路预冷 ········ OK",
    "SHIELD 耐蚀外壳完整性巡检 ········ OK",
    "PROP 上升段推进剂单独增压保压 ··· OK",
    "PAYLOAD 着陆载荷初始化 ·········· OK",
    "TELEMETRY 遥测数据流启动 ········ LIVE",
  ],
  standbyEvents: [
    { system: "LAUNCH", message: "发射场气象会商完成, 地金转移窗口条件满足" },
    { system: "PROP", message: "推进剂加注至 99%, 上升段贮箱单独增压保压正常" },
    { system: "GNC", message: "惯导平台精对准完成, 金星星历注入校验通过" },
    { system: "COMM", message: "金星轨道中继星双向测距音完成, 深空链路余量充足" },
    { system: "SHIELD", message: "耐蚀外壳镀层完整性确认, 酸雾防护裕度充足" },
    { system: "THERMAL", message: "着陆舱主动制冷回路预冷完成, 相变蓄冷模块充能标称" },
    { system: "FLIGHT", message: "射前检查程序推进中, 各号位报告正常" },
    { system: "DSN", message: "佳木斯站大口径天线捕获预置完成, 自动跟踪待命" },
  ],
  phaseEvents: {
    liftoff: [
      { system: "GNC", message: "程序转弯完成, 攻角保持在包线内" },
      { system: "PROP", message: "发动机涡轮泵转速稳定, 推力室压力标称" },
      { system: "FLIGHT", message: "最大动压点通过, 气动载荷峰值回落" },
      { system: "ESC", message: "逃逸塔分离确认, 落入预定安全区" },
    ],
    separation: [
      { system: "FLIGHT", message: "整流罩分离, 载荷暴露空间环境" },
      { system: "GNC", message: "上面级姿态建立, 三轴稳定保持" },
      { system: "PROP", message: "上面级发动机工况正常, 混合比稳定" },
    ],
    transfer: [
      { system: "GNC", message: "中途轨道修正 MCC 点火 12s, 大气入口走廊瞄准点收敛" },
      { system: "COMM", message: "金星轨道中继星测距刷新, 地金光行延迟符合星历" },
      { system: "EPS", message: "太阳翼对日定向, 母线电压平稳" },
      { system: "THERMAL", message: "主动制冷回路巡检正常, 相变蓄冷模块余量充足" },
      { system: "GNC", message: "星敏感器识别 15 颗导航星, 惯性基准刷新" },
    ],
    braking: [
      { system: "FLIGHT", message: "金星大气捕获确认, 气动过载峰值 6.8g 在结构限内" },
      { system: "THERMAL", message: "隔热罩表面温度峰值通过, 烧蚀层工作正常" },
      { system: "GNC", message: "高空投放弹道横向制导修正, 着陆瞄准点收敛" },
      { system: "COMM", message: "高温电离层干扰加剧, 链路裕量快速收窄" },
    ],
    descent: [
      { system: "SHIELD", message: "浓硫酸云层内外壳腐蚀速率在防护裕度内" },
      { system: "THERMAL", message: "主动制冷满功率工作, 舱内温度梯度收敛" },
      { system: "GNC", message: "云底界穿出确认, 反推发动机点火, 恒定下降率保持" },
      { system: "COMM", message: "金星轨道中继链路延迟分钟级, 遥测帧完整率 100%" },
    ],
    touchdown: [
      { system: "FLIGHT", message: "着陆腿缓冲行程正常, 姿角 1.3°" },
      { system: "PROP", message: "反推发动机关机, 上升发动机转入热待机" },
    ],
    landed: [
      { system: "THERMAL", message: "表面温度 465°C 确认, 生存窗口倒计时运行, 蓄冷余量持续下降" },
      { system: "PAYLOAD", message: "地形相机首帧成像, 赭金色岩原在酸雾中若隐若现" },
      { system: "COMM", message: "金面工作段经金星轨道中继下行链路稳定" },
      { system: "PROP", message: "上升发动机热待机建立, 紧急撤离通道随时可用" },
    ],
  },
  cautionPool: [
    { metricKey: "signal", message: "酸雾电离干扰下行信号, 切换金星轨道中继备份链路" },
    { metricKey: "downlink", message: "深空下行速率降级, 数据压缩比自动上调" },
    { metricKey: "power", message: "高温环境电力负载攀升, 非关键负载重新分配" },
    { metricKey: "surfaceTemp", message: "舱外温度高于预测曲线, 主动制冷回路加档" },
    { metricKey: "lightDelay", message: "地金光行延迟抖动, 深空网测距重新校准" },
  ],
  criticalPool: [
    { metricKey: "fuel", message: "燃料余量逼近红线, 上升撤离推进剂严禁挪用" },
    { metricKey: "surfacePressure", message: "舱内外压差逼近结构阈值, 承压壳体加强监测" },
    { metricKey: "surfaceTemp", message: "热控回路逼近工作极限, 生存窗口加速消耗" },
    { metricKey: "thrust", message: "反推发动机推力室压力异常, 备份涡轮泵切换" },
  ],
  stationSeed: [
    { stationKey: "jms", stationName: "佳木斯", code: "JMS-66", online: true, linkRate: 84 },
    { stationKey: "ksh", stationName: "喀什", code: "KSH-35", online: true, linkRate: 56 },
    { stationKey: "vorelay", stationName: "金星轨道中继星", code: "VO-R1", online: true, linkRate: 110 },
    { stationKey: "baire", stationName: "布宜诺斯艾利斯", code: "BUE-12", online: false, linkRate: 0 },
  ],
  stationRateRange: [5, 130],
  blackout: {
    phase: "braking",
    startSec: 6,
    durationSec: 12,
    recoveryComm: VNS_1_BLACKOUT_RECOVERY,
  },
  visual: {
    planet: "venus",
    hueSourceVar: "--destructive",
    hueShift: 36,
    satScale: 0.92,
    lightScale: 0.92,
    dustAlpha: 0.2,
  },
  rover: {
    roverName: "夸父一号",
    roverNameEn: "KUAFU-1",
    samplePrefix: "KF",
    surfaceWord: "金面",
    unlockLog: "夸父一号释放坡道展开到位, 耐蚀巡视器驶上金星地表, 金面遥控通道建立",
    craterNames: [
      "班昭", "清照", "文姬", "则天", "薛涛", "道韫",
      "若昭", "贞仪", "淑兰", "婉卿", "令仪", "惠班",
    ],
  },
  comm: VNS_1_COMM,
};

/* ============================ TTN-1 土卫六泰坦着陆任务 ============================ */

export const TITAN_1: MissionDef = {
  id: "titan1",
  code: "TTN-1",
  title: "土卫六泰坦着陆任务",
  badge: "T1",
  headerEn: "TITAN LANDING MISSION WALL",
  landingSite: "香格里拉沙丘场",
  planetWord: "泰坦",
  approachEn: "TITAN APPROACH · TRACKING LOCK",
  linkEn: "EARTH–TITAN LINK · TO RELAY LOCK",
  linkZh: "地土链路 · 地面站网络",
  lightDelayNote: "地土光行延迟约 66–91 分钟波动",
  landingBody:
    "器箭分离至今, TTN-1 完成地土转移、土星系统捕获制动与降落伞减速穿透橙色雾霾层, 着陆腿触地姿态角 1.2°, 表面温度 -179°C, 气压 1.45 倍标准大气压——甲烷湖岸工作段正式开启。",
  phases: [
    { id: "standby", label: "待发射", labelEn: "STANDBY", milestone: "", durationSec: Infinity },
    { id: "liftoff", label: "点火起飞", labelEn: "LIFTOFF", milestone: "点火!TTN-1 按时起飞, 塔架摆开, 程序转弯开始", durationSec: 12 },
    { id: "separation", label: "级段分离", labelEn: "STAGE SEP", milestone: "一二级分离确认, 上面级发动机二次点火成功", durationSec: 10 },
    { id: "transfer", label: "地土转移", labelEn: "EARTH–SATURN", milestone: "器箭分离, 地土转移轨道确认, 大面积太阳翼展开", durationSec: 56 },
    { id: "braking", label: "入轨制动", labelEn: "SATURN ORBIT INSERT", milestone: "土星系统捕获制动点火, 气动黑障短时信号中断", durationSec: 20 },
    { id: "descent", label: "伞降穿雾", labelEn: "PARA DESCENT", milestone: "主伞开伞, 穿入橙色雾霾层, 能见度急剧下降", durationSec: 20 },
    { id: "touchdown", label: "泰坦软着陆", labelEn: "TOUCHDOWN", milestone: "着陆腿触地灯亮, 发动机关机, 香格里拉沙丘场软着陆成功!", durationSec: 6 },
    { id: "landed", label: "着陆完成", labelEn: "LANDED", milestone: "着陆确认, TTN-1 泰坦湖岸工作段开始", durationSec: Infinity },
  ],
  metricDefs: [
    {
      key: "altitude", label: "高度", labelEn: "ALTITUDE", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 0, relNoise: 0.0004,
      flight: {
        liftoff: [0, 78, "in"], separation: [78, 240], transfer: [240, 1200000000, "in"],
        braking: [1200000000, 180, "out"], descent: [180, 0.02, "out"], touchdown: [0.02, 0], landed: [0, 0],
      },
    },
    {
      key: "velocity", label: "飞行速度", labelEn: "VELOCITY", unit: "km/s", decimals: 3,
      base: 0, amp: 0, wave: 0, phase: 1.2, relNoise: 0.0015,
      flight: {
        liftoff: [0, 2.55, "in"], separation: [2.55, 9.42], transfer: [9.42, 7.4, "out"],
        braking: [7.4, 1.7, "out"], descent: [1.7, 0.003, "out"], touchdown: [0.003, 0], landed: [0, 0],
      },
    },
    {
      key: "deltaV", label: "Δv 剩余", labelEn: "DELTA-V REMAIN", unit: "m/s", decimals: 0,
      base: 16400, amp: 0.5, wave: 0.1, phase: 0.4, relNoise: 0.0002,
      flight: {
        liftoff: [16400, 9600], separation: [9600, 7600], transfer: [7600, 7200],
        braking: [7200, 3100, "out"], descent: [3100, 760, "out"], touchdown: [760, 710], landed: [710, 710],
      },
    },
    {
      key: "isp", label: "比冲", labelEn: "SPEC. IMPULSE", unit: "s", decimals: 0,
      base: 312, amp: 0.2, wave: 0.2, phase: 2.2, relNoise: 0.0005,
      flight: {
        liftoff: [312, 312], separation: [350, 350], transfer: [470, 470],
        braking: [470, 470], descent: [324, 324], touchdown: [324, 0, "out"], landed: [0, 0],
      },
    },
    {
      key: "thrust", label: "发动机推力", labelEn: "ENGINE THRUST", unit: "kN", decimals: 1,
      base: 0, amp: 0, wave: 0, phase: 3.3, relNoise: 0.002,
      flight: {
        liftoff: [5480, 5480], separation: [0, 1800, "out"], transfer: [0, 0],
        braking: [2.6, 2.6], descent: [11.2, 6.8], touchdown: [6.8, 0, "out"], landed: [0, 0],
      },
    },
    {
      key: "fuel", label: "燃料余量", labelEn: "FUEL", unit: "%", decimals: 1,
      base: 100, amp: 0.05, wave: 0.2, phase: 2.4, relNoise: 0.0004,
      flight: {
        liftoff: [100, 81], separation: [81, 66], transfer: [66, 61],
        braking: [61, 37, "out"], descent: [37, 15, "out"], touchdown: [15, 14], landed: [14, 14],
      },
    },
    {
      key: "range", label: "着陆点距离", labelEn: "RANGE TO SITE", unit: "km", decimals: 0,
      base: 1200000000, amp: 800, wave: 0.05, phase: 1.1, relNoise: 0.00001,
      flight: {
        liftoff: [1200000000, 1199999900], separation: [1199999900, 1199999400], transfer: [1199999400, 12000, "in"],
        braking: [12000, 180, "out"], descent: [180, 0.02, "out"], touchdown: [0.02, 0], landed: [0, 0],
      },
    },
    {
      key: "periapsis", label: "近土点高度", labelEn: "PERISATURN", unit: "km", decimals: 0,
      base: 0, amp: 0, wave: 0, phase: 5.1, relNoise: 0.001,
      flight: {
        liftoff: [0, 0], separation: [0, 240], transfer: [240, 460], braking: [460, 160, "out"],
        descent: [160, 160], touchdown: [160, 0], landed: [0, 0],
      },
    },
    {
      key: "lightDelay", label: "地土光行延迟", labelEn: "LIGHT DELAY", unit: "min", decimals: 1,
      base: 78.6, amp: 6.8, wave: 0.05, phase: 3.7, relNoise: 0.004,
      flight: {
        liftoff: [0.02, 0.02], separation: [0.02, 0.07], transfer: [0.07, 68.2, "in"],
        braking: [68.2, 76.4], descent: [76.4, 78.2], touchdown: [78.2, 78.6], landed: [78.6, 78.6],
      },
    },
    {
      key: "signal", label: "信号强度", labelEn: "SIGNAL", unit: "dBm", decimals: 1,
      base: -112.4, amp: 2.8, wave: 0.35, phase: 0.7, relNoise: 0.004,
      flight: {
        liftoff: [-106, -112], separation: [-112, -126], transfer: [-126, -156],
        braking: [-154, -144], descent: [-142, -136], touchdown: [-134, -132], landed: [-131, -129],
      },
    },
    {
      key: "cabinPressure", label: "舱压", labelEn: "CABIN PRESS", unit: "kPa", decimals: 1,
      base: 101.7, amp: 0.26, wave: 0.3, phase: 4.2, relNoise: 0.0008,
    },
    {
      key: "power", label: "电力", labelEn: "POWER", unit: "%", decimals: 1,
      base: 90.8, amp: 1.8, wave: 0.15, phase: 5.0, relNoise: 0.003,
      flight: {
        liftoff: [95, 94], separation: [94, 92], transfer: [92, 88],
        braking: [88, 84], descent: [84, 79], touchdown: [79, 77], landed: [77, 77],
      },
    },
    {
      key: "surfaceTemp", label: "表面温度", labelEn: "SURFACE TEMP", unit: "°C", decimals: 0,
      base: 20, amp: 0.4, wave: 0.2, phase: 1.3, relNoise: 0.003,
      flight: {
        liftoff: [20, 20], separation: [20, 14], transfer: [14, -120, "out"],
        braking: [-120, -168, "out"], descent: [-168, -177], touchdown: [-177, -179], landed: [-179, -179],
      },
    },
    {
      key: "surfacePressure", label: "表面气压", labelEn: "SURFACE PRESS", unit: "atm", decimals: 2,
      base: 1.0, amp: 0.01, wave: 0.2, phase: 2.6, relNoise: 0.002,
      flight: {
        liftoff: [1, 0.6, "out"], separation: [0.6, 0.02, "out"], transfer: [0.02, 0.001, "out"],
        braking: [0.001, 0.01, "in"], descent: [0.01, 1.2, "in"], touchdown: [1.2, 1.44], landed: [1.44, 1.45],
      },
    },
    {
      key: "hazeDepth", label: "雾霾光学深度", labelEn: "HAZE OPT. DEPTH", unit: "τ", decimals: 1,
      base: 0, amp: 0.02, wave: 0.15, phase: 3.9, relNoise: 0.01,
      flight: {
        liftoff: [0, 0], separation: [0, 0], transfer: [0, 0],
        braking: [0, 1.2, "in"], descent: [1.2, 12, "in"], touchdown: [12, 4.6, "out"], landed: [4.6, 3.8, "out"],
      },
    },
    {
      key: "downlink", label: "下行速率", labelEn: "DOWNLINK", unit: "Mbps", decimals: 2,
      base: 14, amp: 1.4, wave: 0.45, phase: 2.0, relNoise: 0.012,
      flight: {
        liftoff: [34, 28], separation: [28, 20], transfer: [20, 0.9, "out"],
        braking: [0.7, 0.4, "out"], descent: [0.36, 0.2, "out"], touchdown: [0.18, 0.14], landed: [0.14, 0.11],
      },
    },
  ],
  bootLines: [
    "POWER BUS 一次电源上电自检 ······ OK",
    "GNC 惯性导航对准 ················ OK",
    "COMM 泰坦轨道中继链路握手 ······· OK",
    "THERMAL 低温保温回路预冷 ········ OK",
    "PARA 伞降系统展开预检 ············ OK",
    "PROP 推进剂贮箱增压保压 ········· OK",
    "PAYLOAD 着陆载荷初始化 ·········· OK",
    "TELEMETRY 遥测数据流启动 ········ LIVE",
  ],
  standbyEvents: [
    { system: "LAUNCH", message: "发射场气象会商完成, 地土转移窗口条件满足" },
    { system: "PROP", message: "推进剂加注至 98%, 贮箱增压保压正常" },
    { system: "GNC", message: "惯导平台精对准完成, 土星星历注入校验通过" },
    { system: "COMM", message: "泰坦轨道中继星双向测距音完成, 超深空链路余量充足" },
    { system: "PARA", message: "伞降系统展开预检通过, 主伞备份伞双通道就绪" },
    { system: "THERMAL", message: "低温保温回路预冷完成, 同位素热源功率标称" },
    { system: "FLIGHT", message: "射前检查程序推进中, 各号位报告正常" },
    { system: "DSN", message: "佳木斯站大口径天线捕获预置完成, 自动跟踪待命" },
  ],
  phaseEvents: {
    liftoff: [
      { system: "GNC", message: "程序转弯完成, 攻角保持在包线内" },
      { system: "PROP", message: "发动机涡轮泵转速稳定, 推力室压力标称" },
      { system: "FLIGHT", message: "最大动压点通过, 气动载荷峰值回落" },
      { system: "ESC", message: "逃逸塔分离确认, 落入预定安全区" },
    ],
    separation: [
      { system: "FLIGHT", message: "整流罩分离, 载荷暴露空间环境" },
      { system: "GNC", message: "上面级姿态建立, 三轴稳定保持" },
      { system: "PROP", message: "上面级发动机工况正常, 混合比稳定" },
    ],
    transfer: [
      { system: "GNC", message: "中途轨道修正 MCC 点火 22s, 土星瞄准点偏差收敛" },
      { system: "COMM", message: "泰坦轨道中继星测距刷新, 地土光行延迟符合星历" },
      { system: "EPS", message: "大面积太阳翼对日定向, 母线电压平稳" },
      { system: "THERMAL", message: "深空冷背景热控预案加载, 回路温度稳定" },
      { system: "RAD", message: "行星际辐射剂量监测正常, 舱内屏蔽余量充足" },
      { system: "GNC", message: "星敏感器识别 19 颗导航星, 惯性基准刷新" },
    ],
    braking: [
      { system: "FLIGHT", message: "土星系统捕获确认, 入轨制动主发动机点火" },
      { system: "COMM", message: "气动黑障区等离子体鞘套形成, 链路短时中断" },
      { system: "GNC", message: "制动关机点解算刷新, 环绕轨道根数标称" },
    ],
    descent: [
      { system: "PARA", message: "主伞开伞确认, 伞衣充满, 下降率压至标称区间" },
      { system: "FLIGHT", message: "穿入橙色雾霾层, 光学导航失效转雷达高度计" },
      { system: "PAYLOAD", message: "下降相机穿透雾隙成像, 甲烷湖岸线识别成功" },
      { system: "COMM", message: "泰坦轨道中继链路延迟 78 分钟, 遥测帧完整率 100%" },
    ],
    touchdown: [
      { system: "FLIGHT", message: "着陆腿缓冲行程正常, 姿角 1.2°" },
      { system: "PROP", message: "推进剂隔离阀关闭, 发动机吹除完成" },
    ],
    landed: [
      { system: "EPS", message: "太阳翼展开锁定, 同位素电源并网供电建立" },
      { system: "PAYLOAD", message: "地形相机首帧成像, 橙色雾霭中的甲烷湖岸清晰可辨" },
      { system: "COMM", message: "泰坦表面工作段经轨道中继下行链路稳定" },
      { system: "MET", message: "表面气象站开机: -179°C / 1.45 atm, 低层大气温湿度持续监测" },
    ],
  },
  cautionPool: [
    { metricKey: "signal", message: "雾霾层散射干扰下行信号, 切换泰坦轨道中继备份链路" },
    { metricKey: "downlink", message: "超深空下行速率降级, 数据压缩比自动上调" },
    { metricKey: "power", message: "低温环境电力负载攀升, 非关键负载重新分配" },
    { metricKey: "hazeDepth", message: "雾霾光学深度高于预测, 光学载荷转入保护模式" },
    { metricKey: "lightDelay", message: "地土光行延迟抖动, 深空网测距重新校准" },
  ],
  criticalPool: [
    { metricKey: "fuel", message: "燃料余量逼近红线, 非必要机动全部冻结" },
    { metricKey: "surfaceTemp", message: "舱外温度低于保温回路设计裕度, 同位素热源加档" },
    { metricKey: "surfacePressure", message: "舱内外压差逼近结构阈值, 承压壳体加强监测" },
    { metricKey: "thrust", message: "反推发动机推力室压力异常, 备份涡轮泵切换" },
  ],
  stationSeed: [
    { stationKey: "jms", stationName: "佳木斯", code: "JMS-66", online: true, linkRate: 34 },
    { stationKey: "ksh", stationName: "喀什", code: "KSH-35", online: true, linkRate: 22 },
    { stationKey: "torelay", stationName: "泰坦轨道中继星", code: "TO-R1", online: true, linkRate: 52 },
    { stationKey: "baire", stationName: "布宜诺斯艾利斯", code: "BUE-12", online: false, linkRate: 0 },
  ],
  stationRateRange: [2, 60],
  blackout: {
    phase: "braking",
    startSec: 5,
    durationSec: 10,
    recoveryComm: TITAN_1_BLACKOUT_RECOVERY,
  },
  visual: {
    planet: "titan",
    hueSourceVar: "--destructive",
    hueShift: 30,
    satScale: 0.72,
    lightScale: 0.8,
    dustAlpha: 0.18,
  },
  rover: {
    roverName: "沧浪号",
    roverNameEn: "CANGLANG-2",
    samplePrefix: "CL",
    surfaceWord: "泰坦表面",
    unlockLog: "沧浪号转移坡道展开到位, 低温巡视器驶离着陆平台, 泰坦湖岸遥控通道建立",
    craterNames: [
      "玄冥", "河伯", "洛神", "共工", "飞廉", "应龙",
      "相柳", "屏翳", "冯夷", "天吴", "陵鱼", "冰夷",
    ],
  },
  comm: TITAN_1_COMM,
};

export const MISSIONS: Record<MissionId, MissionDef> = {
  luna9: LUNA_9,
  ares1: ARES_1,
  europa1: EUROPA_1,
  venus1: VENUS_1,
  titan1: TITAN_1,
};

export const MISSION_ORDER: MissionId[] = ["luna9", "ares1", "europa1", "venus1", "titan1"];
