/**
 * 奶蛙大学 · 天气旁白（校园日历）
 * 进入任意剧情线时，在第一个节点前插入 1-2 句当前天气的旁白。
 * 通用池按天气给 2 个变体，按天确定性轮换（同一天恒定，刷新不闪变）；
 * 湖边与操场在雨天各有专属变体，湖边多一句雾天专属。
 */
import type { WeatherId } from "@/lib/calendar";
import { seedRandom } from "@/lib/calendar";
import type { StorylineId } from "@/data/storylines";

/** 通用天气旁白：每个天气 2 个变体，每个变体 1-2 句 */
const GENERAL_FLAVOR: Record<WeatherId, string[][]> = {
  sunny: [
    ["太阳很好。好到没有蛙好意思说累。"],
    ["阳光把横幅照得发白。那张「欢迎新同学」已经挂了七周，没人觉得它旧。"],
  ],
  cloudy: [
    ["天是灰的，像一张还没批下来的请假条。"],
    ["云压得很低。操场上那点热闹，也跟着压低了一点。"],
  ],
  rain: [
    ["下雨了。伞面在人流里一开一合，像一批来不及说出口的借口。"],
    ["雨点打在公告栏的玻璃上，把「逾期未交」四个字泡得发胀。"],
  ],
  fog: [
    ["雾很大。五米之外的蛙只剩一个轮廓，看不出笑没笑。"],
    ["雾把校园缩小了一圈。缩掉的那部分，今天可以先不去想。"],
  ],
  wind: [
    ["风很大，把海报的一角掀起来，啪嗒啪嗒地响，像有人在鼓掌。"],
    ["风把树吹得东倒西歪。站着不动的，只有公告栏前那几张纸。"],
  ],
};

/** 线 × 天气专属变体：湖边与操场（lawn）的雨天，湖边的雾天 */
const LINE_FLAVOR: Partial<Record<StorylineId, Partial<Record<WeatherId, string[][]>>>> = {
  lake: {
    rain: [
      ["雨落进湖里，连个声音都轮不到。你忽然不想说话了。"],
      ["湖面被雨点砸出一层白。五只蛙的倒影糊在一起，分不清谁是谁。"],
    ],
    fog: [["雾从湖面上漫过来。对岸的教学楼只剩一排亮着的窗，像谁没关的灯。"]],
  },
  lawn: {
    rain: [
      ["雨把跑道浇成深色。八百米那条起跑线，今天空着。"],
      ["雨点敲着看台的铁皮棚。这个声音你听过——体测那天，也是这么响的。"],
    ],
  },
  "self-study": {
    rain: [
      ["雨点砸在自习楼的窗上。亮着的那些格子，从昨晚到现在一格都没暗过。"],
      ["雨下大了。走廊里没人打伞——进来背书的蛙，本来也没打算今天出去。"],
    ],
  },
};

/**
 * 取某条线进场时的天气旁白（1-2 句）。
 * 变体按天确定性轮换：variant = seedRandom(day * 31 + 7)，同一天永远同一句。
 */
export function weatherIntroFor(
  lineId: StorylineId,
  weather: WeatherId,
  day: number,
): string[] {
  const linePool = LINE_FLAVOR[lineId]?.[weather];
  const pool = linePool && linePool.length > 0 ? linePool : GENERAL_FLAVOR[weather];
  if (!pool || pool.length === 0) return [];
  const roll = seedRandom(Math.round(day) * 31 + 7);
  const variant = pool[Math.floor(roll * pool.length) % pool.length];
  return variant ?? [];
}
