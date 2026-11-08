// 每日挑战模式确定性生成器（纯本地, 无后端）：以本地日期 YYYYMMDD 为整数种子 + mulberry32 伪随机,
// 保证同一自然日任意时刻调用得到完全相同的挑战天体与修饰组合, 跨日自动换新挑战。
import { MISSION_ORDER, type MissionId } from "@/lib/missions";

/** 每日挑战修饰条件 id */
export type DailyModifierId = "window_compression" | "harsh_weather" | "precision_landing" | "quota_collection";

export interface DailyModifierDef {
  id: DailyModifierId;
  name: string;
  en: string;
  desc: string;
}

/** 修饰条件池（每日确定性洗牌后抽 1–2 条不重复） */
export const DAILY_MODIFIERS: DailyModifierDef[] = [
  { id: "window_compression", name: "窗口压缩", en: "WINDOW SQUEEZE", desc: "当日天体为金星时生存窗口压缩至 180 秒; 其他天体表面限时事件频率 ×2" },
  { id: "harsh_weather", name: "恶劣天象", en: "HARSH SKIES", desc: "当日天体专属极端事件（沙尘暴 / 酸雾 / 微陨石雨 / 冰裂隙喷发 / 甲烷浓雾）触发概率翻倍" },
  { id: "precision_landing", name: "精密着陆", en: "PRECISION TOUCHDOWN", desc: "手动着陆侧风 ×1.5, 成功着陆安全区收窄" },
  { id: "quota_collection", name: "配额采集", en: "SAMPLE QUOTA", desc: "本局必须采满 3 件样品才算达标" },
];

export interface DailyChallengeInfo {
  /** YYYYMMDD 整数种子 */
  seed: number;
  /** YYYY-MM-DD 本地日期键（与存档 lastDailyDate 对比 / 连击判定） */
  dateKey: string;
  missionId: MissionId;
  modifiers: DailyModifierDef[];
}

/** 本地日期键 YYYY-MM-DD（连击判定: 昨日键 = 今天减一天） */
export function dailyDateKey(date = new Date()): string {
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const da = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mo}-${da}`;
}

/** 本地日期 → YYYYMMDD 整数种子（同一天同种子, 跨会话确定性） */
export function dailySeedOf(date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** mulberry32 种子化伪随机（与样品化验同源算法, 32 位状态, 输出 [0,1)） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 生成当日挑战：五天体选一 + 修饰池确定性洗牌后取前 1–2 条（50% 双修饰） */
export function getDailyChallenge(date = new Date()): DailyChallengeInfo {
  const seed = dailySeedOf(date);
  const rng = mulberry32(seed);
  const missionId = MISSION_ORDER[Math.floor(rng() * MISSION_ORDER.length)];
  const pool = [...DAILY_MODIFIERS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const count = rng() < 0.5 ? 1 : 2;
  return { seed, dateKey: dailyDateKey(date), missionId, modifiers: pool.slice(0, count) };
}
