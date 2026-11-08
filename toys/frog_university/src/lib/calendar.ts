/**
 * 奶蛙大学 · 校园日历（时间与天气）
 * 时间不单独落盘：天数直接由「已完成的常规剧情线数」派生，每完成一条线推进 1 天。
 * 天气用确定性伪随机：同一天在任何时候都是同一种天气，刷新、重开都不闪变。
 */

export type WeatherId = "sunny" | "cloudy" | "rain" | "fog" | "wind";

export interface WeatherMeta {
  id: WeatherId;
  label: string;
  /** 顶栏悬浮提示里的一句话 */
  hint: string;
}

export const WEATHER_META: Record<WeatherId, WeatherMeta> = {
  sunny: { id: "sunny", label: "晴", hint: "太阳很好，好到没蛙好意思说累" },
  cloudy: { id: "cloudy", label: "阴", hint: "天色和课表一个颜色" },
  rain: { id: "rain", label: "雨", hint: "记得带伞，或者干脆别去" },
  fog: { id: "fog", label: "雾", hint: "看不清的路，多半还是要走" },
  wind: { id: "wind", label: "风", hint: "风把公告栏的纸吹得很响" },
};

/** 期末周阈值：完成 4 条常规线之后进入 */
export const FINAL_WEEK_FROM = 4;

/** 期末笔试定在第七天；期末周横幅显示「距期末 X 天」 */
export const EXAM_DAY = 7;

/**
 * 确定性伪随机：把整数散列到 [0, 1)。
 * 无状态、可复现——同一输入永远同一输出，不依赖 Math.random，所以同一存档同一天恒定。
 */
export function seedRandom(seed: number): number {
  let t = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  t ^= t >>> 13;
  t = Math.imul(t, 0xc2b2ae35);
  t ^= t >>> 16;
  return (t >>> 0) / 4294967296;
}

/** 天数 = 完成的常规线数 + 1（开学第一天 = 第 1 天） */
export function dayOfDoneCount(doneCount: number): number {
  return Math.max(1, Math.round(doneCount) + 1);
}

/** 是否处于期末周 */
export function isFinalWeek(doneCount: number): boolean {
  return doneCount >= FINAL_WEEK_FROM;
}

/** 距期末笔试还有几天（期末周横幅用） */
export function daysToExam(day: number): number {
  return Math.max(0, EXAM_DAY - day);
}

/* 天气基准权重：雨天略高于其余（雨 28 / 晴 24 / 阴 20 / 雾 14 / 风 14）；每局可被「天气性格」偏移 */
const WEATHER_WEIGHTS: [WeatherId, number][] = [
  ["sunny", 24],
  ["cloudy", 20],
  ["rain", 28],
  ["fog", 14],
  ["wind", 14],
];

/* ---------- 天气性格（每局一层差异）：种子派生，给某一种天气加权 ---------- */

export type WeatherBiasId = "none" | WeatherId;

/** 偏移幅度：被点名的天气 +12 权重（基准之外再抬一档） */
const WEATHER_BIAS_BONUS = 12;

/** 本学期的天气性格：种子派生、每局不同、局内恒定；none = 基准分布 */
export function weatherBiasOf(seed = 0): WeatherBiasId {
  const ids: WeatherBiasId[] = ["none", "sunny", "cloudy", "rain", "fog", "wind"];
  const roll = seedRandom((Math.round(seed) % 1000000) * 31 + 7);
  return ids[Math.floor(roll * ids.length) % ids.length];
}

/** 天气性格的一句话（顶栏悬浮 / 公告栏用） */
export const WEATHER_BIAS_HINT: Record<WeatherBiasId, string> = {
  none: "这学期的天气没偏心",
  sunny: "这学期的晴特别多",
  cloudy: "这学期老是阴着",
  rain: "这学期的雨特别多",
  fog: "这学期的雾散得慢",
  wind: "这学期的风没停过",
};

/**
 * 按天数查天气：确定性，同一天恒定，刷新不闪变。
 * seed 由存档携带（开新档时随机重摇，每局一套天气序列 + 一种天气性格）；缺省 0 = 旧版固定序列（旧档兼容，不闪变）。
 */
export function weatherForDay(day: number, seed = 0): WeatherId {
  const bias = weatherBiasOf(seed);
  const weights: [WeatherId, number][] = WEATHER_WEIGHTS.map(([id, weight]) => [
    id,
    id === bias ? weight + WEATHER_BIAS_BONUS : weight,
  ]);
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  const roll =
    seedRandom(Math.round(day) * 97 + 13 + (Math.round(seed) % 1000000) * 7919) * total;
  let acc = 0;
  for (const [id, weight] of weights) {
    acc += weight;
    if (roll < acc) return id;
  }
  return "sunny";
}

/**
 * 确定性洗牌：把列表按种子排成「本局的顺序」。
 * 无状态、可复现——同一局同一池顺序恒定，不同局顺序不同（深夜事件池出场顺序用）。
 */
export function seededOrder<T>(items: T[], seed = 0): T[] {
  return items
    .map((item, index) => ({ item, key: seedRandom((Math.round(seed) % 1000000) + index * 131) }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.item);
}
