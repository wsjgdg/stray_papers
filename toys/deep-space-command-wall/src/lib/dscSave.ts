// 深空指挥墙本地存档（localStorage, 键 dsc-save-v1）：成就 / 样品登记册 / 历史最佳 /
// 功勋 / 拉力纪录 / 生涯累计计数的持久化。存储不可用或结构不兼容时静默降级为内存态,
// 任何读写异常都不得外抛中断任务运行。
import type { MissionId } from "@/lib/missions";
import type { MuseumSampleEntry, UnlockedAchievement } from "@/pages/Home/useHome";

export const DSC_SAVE_KEY = "dsc-save-v1";
/** 写前备份键：每次覆盖主键前把上一份原样存到这里, 主档损坏/版本不识别时可回退 */
export const DSC_SAVE_BAK_KEY = "dsc-save-v1:bak";
/** 当前存档结构版本 */
const DSC_SAVE_VERSION = 1;

/** 版本迁移器通道：migrators[v] 把 v 版结构升到 v+1（当前仅 v1, 未来加 v2 时在此注册） */
const SAVE_MIGRATORS: Record<number, (p: Record<string, unknown>) => Record<string, unknown>> = {};

/** 把旧版本存档逐级迁移到当前版本; 版本越界或缺迁移器返回 null */
function migrateToLatest(parsed: Record<string, unknown>): Record<string, unknown> | null {
  let v = typeof parsed.v === "number" && Number.isFinite(parsed.v) ? parsed.v : -1;
  if (v < 1 || v > DSC_SAVE_VERSION) return null;
  let p = parsed;
  while (v < DSC_SAVE_VERSION) {
    const step = SAVE_MIGRATORS[v];
    if (!step) return null;
    p = step(p);
    v += 1;
  }
  return p;
}

/** 拉力赛三航线最佳纪录（正序 / 倒序 / 夜航, 单位秒; null = 尚未完赛） */
export interface RallyBests {
  std: number | null;
  rev: number | null;
  night: number | null;
}

/** 生涯累计计数（跨任务跨会话只增不减, 「清除存档」归零） */
export interface CareerCounters {
  /** 各任务累计着陆次数（按任务 id 分键） */
  landings: Partial<Record<MissionId, number>>;
  /** 生涯巡视总里程（米） */
  odometerM: number;
  /** 样品登记 / 化验 / S 级 / 海洋水样累计 */
  samples: number;
  analyzed: number;
  sGrade: number;
  ocean: number;
  /** 玩法累计：流星（含金色）/ 演练命中 / 握手 / 诊断满序 / 抽问答对 / 天线全锁 / 极光段数 */
  meteors: number;
  golds: number;
  drills: number;
  handshakes: number;
  diags: number;
  quizzes: number;
  antennas: number;
  auroras: number;
  /** 最长连答链 / 漂移总秒数 / 拍照张数 */
  chainBest: number;
  spinSecs: number;
  photos: number;
  /** 金星热管理累计：过热保护触发次数 / 应急散热执行次数 */
  overheatCount: number;
  coolingUsed: number;
  /** 泰坦雾情累计：浓雾中作业总秒数 / 浓雾期间采回的样品件数 */
  fogTimeS: number;
  fogSamples: number;
  /** 每日挑战累计：完成次数 / 当前连击 / 最佳连击 / 最近完成日期（YYYY-MM-DD, 空串 = 从未完成） */
  dailyCompletions: number;
  dailyStreak: number;
  dailyBestStreak: number;
  lastDailyDate: string;
  /** 历史最佳结算总分与评级（从未结算为 null） */
  bestTotal: number | null;
  bestGrade: string | null;
}

/** 音频偏好（音效开关 / BGM 开关 / BGM 音量 0..1, 随存档持久化） */
export interface AudioPrefs {
  sfxOn: boolean;
  bgmOn: boolean;
  bgmVolume: number;
}

export function defaultAudioPrefs(): AudioPrefs {
  return { sfxOn: true, bgmOn: true, bgmVolume: 0.5 };
}

/** 存档快照（v:1 版本字段, 结构不兼容时按缺省合并） */
export interface DscSaveV1 {
  v: 1;
  savedAt: string;
  achievements: Record<string, UnlockedAchievement>;
  museum: Record<string, MuseumSampleEntry>;
  debriefBest: Record<string, { total: number; grade: string; dims: number[] }>;
  landedMissions: MissionId[];
  rallyBests: RallyBests;
  playBest: Record<string, number>;
  quizChainBest: number;
  dutyMerit: number;
  dutyDone: number;
  reducedMotion: boolean;
  career: CareerCounters;
  audio: AudioPrefs;
}

/** 生涯统计弹层快照（打开弹层 / 清除存档后一次性构建, View 只消费） */
export interface CareerSnapshot {
  career: CareerCounters;
  merit: number;
  dutyDone: number;
  achCount: number;
  achTotal: number;
  /** 已解锁的稀有成就名称（生涯分享卡稀有成就栏消费） */
  rareUnlocked: string[];
  /** 稀有成就总数 */
  rareTotal: number;
  rally: RallyBests;
  savedAt: string | null;
}

export function defaultCareer(): CareerCounters {
  return {
    landings: {},
    odometerM: 0,
    samples: 0,
    analyzed: 0,
    sGrade: 0,
    ocean: 0,
    meteors: 0,
    golds: 0,
    drills: 0,
    handshakes: 0,
    diags: 0,
    quizzes: 0,
    antennas: 0,
    auroras: 0,
    chainBest: 0,
    spinSecs: 0,
    photos: 0,
    overheatCount: 0,
    coolingUsed: 0,
    fogTimeS: 0,
    fogSamples: 0,
    dailyCompletions: 0,
    dailyStreak: 0,
    dailyBestStreak: 0,
    lastDailyDate: "",
    bestTotal: null,
    bestGrade: null,
  };
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function record(v: unknown): Record<string, never> | Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 解析并归一化单份存档原文：结构损坏 / 版本无法迁移返回 null */
function normalizeSave(raw: string | null): DscSaveV1 | null {
  try {
    if (!raw) return null;
    const json = JSON.parse(raw) as Record<string, unknown> | null;
    if (!json || typeof json !== "object") return null;
    const migrated = migrateToLatest(json);
    if (!migrated) return null;
    const parsed = migrated as Partial<DscSaveV1>;
    const rawCareer = (parsed.career ?? {}) as Partial<CareerCounters>;
    const rawRally = (parsed.rallyBests ?? {}) as Partial<RallyBests>;
    const career: CareerCounters = {
      landings:
        rawCareer.landings && typeof rawCareer.landings === "object"
          ? (rawCareer.landings as Partial<Record<MissionId, number>>)
          : {},
      odometerM: num(rawCareer.odometerM),
      samples: num(rawCareer.samples),
      analyzed: num(rawCareer.analyzed),
      sGrade: num(rawCareer.sGrade),
      ocean: num(rawCareer.ocean),
      meteors: num(rawCareer.meteors),
      golds: num(rawCareer.golds),
      drills: num(rawCareer.drills),
      handshakes: num(rawCareer.handshakes),
      diags: num(rawCareer.diags),
      quizzes: num(rawCareer.quizzes),
      antennas: num(rawCareer.antennas),
      auroras: num(rawCareer.auroras),
      chainBest: num(rawCareer.chainBest),
      spinSecs: num(rawCareer.spinSecs),
      photos: num(rawCareer.photos),
      overheatCount: num(rawCareer.overheatCount),
      coolingUsed: num(rawCareer.coolingUsed),
      fogTimeS: num(rawCareer.fogTimeS),
      fogSamples: num(rawCareer.fogSamples),
      dailyCompletions: num(rawCareer.dailyCompletions),
      dailyStreak: num(rawCareer.dailyStreak),
      dailyBestStreak: num(rawCareer.dailyBestStreak),
      lastDailyDate: typeof rawCareer.lastDailyDate === "string" ? rawCareer.lastDailyDate : "",
      bestTotal: numOrNull(rawCareer.bestTotal),
      bestGrade: typeof rawCareer.bestGrade === "string" ? rawCareer.bestGrade : null,
    };
    return {
      v: 1,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      achievements: record(parsed.achievements) as DscSaveV1["achievements"],
      museum: record(parsed.museum) as DscSaveV1["museum"],
      debriefBest: record(parsed.debriefBest) as DscSaveV1["debriefBest"],
      landedMissions: Array.isArray(parsed.landedMissions) ? parsed.landedMissions : [],
      rallyBests: {
        std: numOrNull(rawRally.std),
        rev: numOrNull(rawRally.rev),
        night: numOrNull(rawRally.night),
      },
      playBest: record(parsed.playBest) as DscSaveV1["playBest"],
      quizChainBest: num(parsed.quizChainBest),
      dutyMerit: num(parsed.dutyMerit),
      dutyDone: num(parsed.dutyDone),
      reducedMotion: parsed.reducedMotion === true,
      career,
      // 音频偏好: 缺失字段按缺省归一化（老存档没有 audio 键 → 全默认, 不改版本号）
      audio: {
        sfxOn: parsed.audio?.sfxOn !== false,
        bgmOn: parsed.audio?.bgmOn !== false,
        bgmVolume: parsed.audio && typeof parsed.audio.bgmVolume === "number" && Number.isFinite(parsed.audio.bgmVolume)
          ? Math.max(0, Math.min(1, parsed.audio.bgmVolume))
          : 0.5,
      },
    };
  } catch {
    return null;
  }
}

/** 读档并归一化：主档损坏 / 版本不符时回退到写前备份档, 均失败返回 null（静默降级为内存态） */
export function loadDscSave(): DscSaveV1 | null {
  let main: string | null = null;
  try {
    main = window.localStorage.getItem(DSC_SAVE_KEY);
  } catch {
    return null; // 存储不可用, 备份也读不了
  }
  const fromMain = normalizeSave(main);
  if (fromMain) return fromMain;
  try {
    return normalizeSave(window.localStorage.getItem(DSC_SAVE_BAK_KEY));
  } catch {
    return null;
  }
}

/** 写档（写前把上一份主档备份到 :bak 键; 静默失败, 返回是否写入成功——false 时上层应提示用户） */
export function writeDscSave(data: Omit<DscSaveV1, "v" | "savedAt">): boolean {
  try {
    const payload: DscSaveV1 = { v: DSC_SAVE_VERSION as 1, savedAt: new Date().toISOString(), ...data };
    const next = JSON.stringify(payload);
    const prev = window.localStorage.getItem(DSC_SAVE_KEY);
    if (prev && prev !== next) {
      try {
        window.localStorage.setItem(DSC_SAVE_BAK_KEY, prev);
      } catch {
        // 备份失败（如配额紧张）不阻断主档写入
      }
    }
    window.localStorage.setItem(DSC_SAVE_KEY, next);
    return true;
  } catch {
    return false;
  }
}

/** 删除存档（连同写前备份一起清, 静默失败） */
export function clearDscSave(): void {
  try {
    window.localStorage.removeItem(DSC_SAVE_KEY);
    window.localStorage.removeItem(DSC_SAVE_BAK_KEY);
  } catch {
    // 存储不可用时保持内存态即可
  }
}
