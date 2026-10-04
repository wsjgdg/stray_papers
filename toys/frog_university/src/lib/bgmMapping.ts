/**
 * 奶蛙大学 · 舞台背景 → 曲目映射（批次 S 抽出共享）：
 * 正片（usePlay）与校园地图的深夜 / 白日事件弹层（useCampusMap）共用同一张表——
 * 同一个地点，白天在正片里、深夜在弹层里，听到的必须是同一首曲。
 * 事件弹层按事件挂的 bgId 取曲；没配 bgId 的事件回落到湖畔夜曲（深夜）或地图日常曲（白日）。
 */
import type { BgmTrackId } from "@/lib/bgm";

/** 舞台背景 id → 该地点自带基调（与切片批次 J-R 的场景切曲完全同源） */
const STAGE_TRACK: Record<string, BgmTrackId> = {
  /* 宿舍楼组 */
  "bg-dorm-lobby": "dorm-hall",
  "bg-dorm-corridor": "dorm-hall",
  "bg-dorm-room": "dorm-room",
  "bg-dorm-corridor-out": "dorm-dark",
  "bg-dorm-room-out": "dorm-dark",
  /* 图书馆组 */
  "bg-library-hall": "library",
  "bg-library-late": "library-late",
  "bg-library-exit": "library-late",
  "bg-library-board": "library-list",
  /* 食堂组 */
  "bg-canteen-noon": "canteen",
  "bg-canteen-late": "canteen-late",
  "bg-canteen-closing": "canteen-after",
  /* 社团组 */
  "bg-club-stage": "club",
  "bg-club-corridor": "club-smile",
  "bg-club-room": "club-smile",
  /* 农场专属曲（批次 CY-22）：拔萝卜的碎步，不再借社团走廊的傻笑 */
  "bg-club-farm": "farm",
  "bg-club-dark": "club-blackout",
  /* 操场组 */
  "bg-lawn-track": "field",
  /* 日落操场专属曲（批次 CY-22）：影子拉长的时候，白日的曲子太亮了 */
  "bg-lawn-dusk": "dusk-field",
  "bg-lawn-night": "field-night",
  /* 自习楼组 */
  "bg-study-hall": "study",
  "bg-study-lockers": "study",
  "bg-study-desk": "study-desk",
  "bg-study-late": "study-locked",
  /* 行政楼组 */
  "bg-admin-window": "admin",
  "bg-admin-office": "admin-night",
  "bg-admin-night": "admin-night",
  /* 教学楼组：教室专属曲（批次 CY-22），散课后的走廊另有回声曲 */
  "bg-class-gate": "class",
  "bg-class-room": "class",
  /* 走廊专属曲（批次 CY-21）：散课后的回声脚步，不再借教室进行曲 */
  "bg-class-corridor": "corridor",
  /* 湖边组 */
  "bg-lake-shore": "night",
  "bg-lake-mid": "lk-quiet",
  "bg-lake-dawn": "lk-dawn",
  /* 医务室（第十条线《病假条》）：专属曲（批次 CY-21），不再借回忆曲 */
  "bg-infirmary": "infirmary",
};

/** 按舞台背景 id 查曲；未注册的 id 返回 null（调用方自行回落） */
export function stageTrackOf(bgId: string | null | undefined): BgmTrackId | null {
  if (!bgId) return null;
  return STAGE_TRACK[bgId] ?? null;
}
