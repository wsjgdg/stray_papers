/**
 * 奶蛙大学 · 种子码（批次 X）
 * 每局的四层差异——天气序列、天气性格、深夜事件顺序、共通日程顺序——全部由存档里的
 * 一颗种子派生（seedRandom 无状态哈希，同输入永远同输出）。所以一颗种子就是一整个世界：
 * 种子码把这颗种子编成能抄在纸条上的号码，贴回标题页就能重走那一局的世界。
 * 风味段（雨多 / 风停）只作展示——重现只认数字段，风味由种子重新算出来。
 */
import { weatherBiasOf, weatherForDay, type WeatherBiasId, type WeatherId } from "@/lib/calendar";

/** 天气性格短码：一句话压成两个字（档案腔） */
const BIAS_CODES: Record<WeatherBiasId, string> = {
  none: "平常",
  sunny: "晴多",
  cloudy: "常阴",
  rain: "雨多",
  fog: "雾慢",
  wind: "风起",
};

/** 开学第一天天气短码：第二层风味——性格之外，开局实际碰上的那个天 */
const DAY_CODES: Record<WeatherId, string> = {
  sunny: "晴天",
  cloudy: "阴天",
  rain: "雨天",
  fog: "雾天",
  wind: "起风",
};

/** 局号格式：NAIWA-042317-雨多-晴天（六位数字段是种子本体） */
export function seedCodeOf(seed: number): string {
  const s = Math.max(0, Math.round(seed)) % 1000000;
  const bias = weatherBiasOf(s);
  const day1 = weatherForDay(1, s);
  return `NAIWA-${String(s).padStart(6, "0")}-${BIAS_CODES[bias]}-${DAY_CODES[day1]}`;
}

/** 从一串手抄种子码里认出种子：取第一段 4–8 位数字；认不出来返回 null（提示玩家重抄） */
export function parseSeedCode(code: string): number | null {
  const match = String(code).match(/(\d{4,8})/);
  if (!match) return null;
  return Math.max(0, Math.round(Number(match[1]))) % 1000000;
}

/**
 * 混合两颗种子（批次 AM）：两颗放进同一台机器，出来的是第三颗。
 * 确定性混合——同两颗父本永远混出同一个子代；它不属于谁，但档案记下了它属于谁。
 */
export function mixSeeds(a: number, b: number): number {
  const sa = Math.max(0, Math.round(a)) % 1000000;
  const sb = Math.max(0, Math.round(b)) % 1000000;
  return (((sa * 7919 + sb * 104729 + 40503) % 1000000) + 1000000) % 1000000;
}
