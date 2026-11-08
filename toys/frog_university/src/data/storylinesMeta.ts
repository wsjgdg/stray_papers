/**
 * 奶蛙大学 · 剧情线元信息（轻量模块）
 * 十条线的「地图层」元信息 + 正式结局索引。本文件不引任何剧本正文——
 * 首屏链路（标题界面 / 存档系统）只 import 这里；剧本正文、隐藏结局目录与
 * SECRET_ENDING 在 storylines.ts（重模块，仅地图 / 剧情 / 图鉴等路由 chunk 引）。
 */
import type { FrogCharacterId } from "@/data/characters";


/** 校园里十座可交互的点位 */
export type BuildingId =
  | "teaching"
  | "library"
  | "canteen"
  | "field"
  | "club"
  | "lake"
  | "study"
  | "admin"
  | "dorm"
  | "infirmary";

/** 十条剧情线（九条常规 + 一条湖边隐藏线；新线节点 id 前缀 zz=自习楼 / xg=行政楼 / ss=宿舍楼 / yj=医务室） */
export type StorylineId =
  | "first-class"
  | "roll-king"
  | "canteen"
  | "club"
  | "lawn"
  | "lake"
  | "self-study"
  | "administration"
  | "lights-out"
  | "sick-note";

/* ---------- 地图层元信息 ---------- */

export interface StorylineMeta {
  id: StorylineId;
  /** 完整线名，如《开学第一课》 */
  title: string;
  /** 地图气泡用的短名 */
  shortTitle: string;
  /** 关联建筑 */
  building: BuildingId;
  /** 一句话简介（地图 hover / 剧情卡共用） */
  intro: string;
  /** 梗浓度星级 1~5 */
  memeLevel: number;
  /** 幕数 */
  actCount: number;
  /** 出场奶蛙 */
  castIds: FrogCharacterId[];
  /** 隐藏线：需其余常规线全部完成 */
  hidden?: boolean;
}

export interface BuildingInfo {
  id: BuildingId;
  /** 建筑名 */
  label: string;
  /** 在校园平面图 SVG（viewBox 0 0 820 560）里的落点 */
  x: number;
  y: number;
}

export const STORYLINES: StorylineMeta[] = [
  {
    id: "first-class",
    title: "开学第一课",
    shortTitle: "开学第一课",
    building: "teaching",
    intro: "新生报到被要求填《大学四年规划表》，选项只有卷、更卷和卷中卷。",
    memeLevel: 3,
    actCount: 3,
    castIds: ["naiBai", "ganFanShu"],
  },
  {
    id: "roll-king",
    title: "卷王养成计划",
    shortTitle: "卷王养成计划",
    building: "library",
    intro: "凌晨三点的图书馆，抹抹还在卷。你躺也不是，卷也不敢。",
    memeLevel: 5,
    actCount: 3,
    castIds: ["naiBai", "moMo"],
  },
  {
    id: "canteen",
    title: "已老实食堂",
    shortTitle: "已老实食堂",
    building: "canteen",
    intro: "打饭窗口前的干饭叔只说两个字：已老实。多加一勺也没有用。",
    memeLevel: 4,
    actCount: 3,
    castIds: ["naiBai", "ganFanShu"],
  },
  {
    id: "club",
    title: "抽象社团招新",
    shortTitle: "抽象社团招新",
    building: "club",
    intro: "人人都在表演快乐。莓莓笑得最标准，也最累。",
    memeLevel: 5,
    actCount: 3,
    castIds: ["naiBai", "meiMei"],
  },
  {
    id: "lawn",
    title: "躺在草坪上思考蛙生",
    shortTitle: "草坪躺平辩论",
    building: "field",
    intro: "灰灰邀请你一起躺着。躺着躺着，就开始思考蛙生的意义。",
    memeLevel: 3,
    actCount: 3,
    castIds: ["naiBai", "huiHui"],
  },
  {
    id: "lake",
    title: "蛙生的意义",
    shortTitle: "湖边夜谈",
    building: "lake",
    intro: "五只奶蛙的湖边夜谈。把白天的热闹全部放下，再回答一次：蛙生的意义是什么？",
    memeLevel: 2,
    actCount: 3,
    castIds: ["naiBai", "moMo", "meiMei", "huiHui", "ganFanShu"],
    hidden: true,
  },
  {
    id: "self-study",
    title: "上岸第一剑",
    shortTitle: "上岸第一剑",
    building: "study",
    intro: "24 小时自习楼，再再把「考上就好了」抵押给了明年。储物柜里放着他一直不敢拆开验证的答案。",
    memeLevel: 4,
    actCount: 3,
    castIds: ["naiBai", "zaiZai"],
  },
  {
    id: "administration",
    title: "最终解释权",
    shortTitle: "最终解释权",
    building: "admin",
    intro: "学工办窗口的格格把坏消息翻译成「温馨提示」。翻译久了，她也听不出原文了。",
    memeLevel: 3,
    actCount: 4,
    castIds: ["naiBai", "geGe"],
  },
  {
    id: "lights-out",
    title: "熄灯之后",
    shortTitle: "熄灯之后",
    building: "dorm",
    intro: "十一点整栋断电，签到表替六十只蛙写好了「正常」。评分贴封顶在「良好」，之上没有了。",
    memeLevel: 3,
    actCount: 3,
    castIds: ["naiBai", "huiHui", "geGe"],
  },
  {
    id: "sick-note",
    title: "病假条",
    shortTitle: "病假条",
    building: "infirmary",
    intro: "医务室是校园里唯一允许你不舒服的地方——可不舒服要事由，体温计决定你能不能休息，白床只给三十分钟。",
    memeLevel: 3,
    actCount: 5,
    castIds: ["naiBai", "mianMian"],
  },
];

export const BUILDINGS: BuildingInfo[] = [
  { id: "teaching", label: "教学楼", x: 150, y: 168 },
  { id: "library", label: "图书馆", x: 560, y: 132 },
  { id: "canteen", label: "食堂", x: 148, y: 372 },
  { id: "field", label: "操场", x: 332, y: 452 },
  { id: "club", label: "社团活动中心", x: 618, y: 316 },
  { id: "lake", label: "湖边", x: 636, y: 470 },
  { id: "study", label: "自习楼", x: 64, y: 292 },
  { id: "admin", label: "行政楼", x: 736, y: 146 },
  { id: "dorm", label: "宿舍楼", x: 748, y: 344 },
  { id: "infirmary", label: "医务室", x: 392, y: 226 },
];

/** 九条常规线（进度分母；湖边隐藏线不计入） */
export const REGULAR_LINE_IDS: StorylineId[] = [
  "first-class",
  "roll-king",
  "canteen",
  "club",
  "lawn",
  "self-study",
  "administration",
  "lights-out",
  "sick-note",
];

export const ALL_LINE_IDS: StorylineId[] = [...REGULAR_LINE_IDS, "lake"];

export function storylineById(lineId: string): StorylineMeta | undefined {
  return STORYLINES.find((line) => line.id === lineId);
}

export function storylineByBuilding(buildingId: BuildingId): StorylineMeta | undefined {
  return STORYLINES.find((line) => line.building === buildingId);
}

export function buildingById(buildingId: BuildingId): BuildingInfo | undefined {
  return BUILDINGS.find((item) => item.id === buildingId);
}

/* ---------- 结局索引（首屏瘦身批次） ---------- */

/** 结局登记表条目 */
export interface EndingIndexEntry {
  id: string;
  title: string;
}

/**
 * 十线正式结局索引（30 条，id + 名）——存档清洗、图鉴计数与档案结局名从这里取数。
 * 与剧本正文手工保持同步：storylines.ts 里有开发期一致性自检，失配会在控制台告警。
 */
export const ENDING_INDEX: EndingIndexEntry[] = [
  { id: "fc-e1", title: "状况良好" }, // first-class
  { id: "fc-e2", title: "第四十一场" }, // first-class
  { id: "fc-e3", title: "细则第三条" }, // first-class
  { id: "rk-e1", title: "首次外借" }, // roll-king
  { id: "rk-e2", title: "备用时段" }, // roll-king
  { id: "rk-e3", title: "脚印" }, // roll-king
  { id: "cn-e1", title: "合理损耗" }, // canteen
  { id: "cn-e2", title: "十一次" }, // canteen
  { id: "cn-e3", title: "正面朝外" }, // canteen
  { id: "cb-e1", title: "四舍五入" }, // club
  { id: "cb-e2", title: "七分钟" }, // club
  { id: "cb-e3", title: "先发我看" }, // club
  { id: "fl-e1", title: "恢复时长" }, // lawn
  { id: "fl-e2", title: "先看表" }, // lawn
  { id: "fl-e3", title: "四十分钟" }, // lawn
  { id: "lk-e1", title: "新横幅" }, // lake
  { id: "lk-e2", title: "记不全" }, // lake
  { id: "lk-e3", title: "带上简历" }, // lake
  { id: "zz-e1", title: "第二张便利贴" }, // self-study
  { id: "zz-e2", title: "失物招领" }, // self-study
  { id: "zz-e3", title: "23:30-23:40" }, // self-study
  { id: "xg-e1", title: "官方说人话" }, // administration
  { id: "xg-e2", title: "总用得上" }, // administration
  { id: "xg-e3", title: "最终解释权" }, // administration
  { id: "ss-e1", title: "二十三点零五" }, // lights-out
  { id: "ss-e2", title: "合格" }, // lights-out
  { id: "ss-e3", title: "替你填的人" }, // lights-out
  { id: "yj-e1", title: "理由栏" }, // sick-note
  { id: "yj-e2", title: "三十分钟" }, // sick-note
  { id: "yj-e3", title: "体温正常" }, // sick-note
];
