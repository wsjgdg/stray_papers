/**
 * 片头（OP）与片尾（ED）文案表（批次 J 起，批次 K 泛化为按线查表）。
 * 凡是写给玩家看的字一律走档案腔——它不是菜单文案，是这份卷宗的一部分。
 * 新线接入时在此补键；没配的线不播 OP、结局卡不显示 ED 块。
 */

export interface OpeningPlate {
  /** 眉行：楼栋 · 时刻（档案腔小字） */
  place: string;
  /** 标题前段（普通色） */
  title: string;
  /** 标题高亮尾段（primary 色，可缺省） */
  titleTail?: string;
  /** 引文：一句档案腔，写制度的动作而不是剧情预告 */
  quote: string;
  /** 舞台背景 id（StageBackground 注册表） */
  bgId: string;
  /** 收尾定格 id（CgArt 注册表） */
  cgId: string;
}

export interface EndingPlate {
  /** 收尾一行（如「熄灯之后 · 完」） */
  label: string;
  /** 档案腔制作名单（剧本 / 立绘 / 定格画 / 音乐），不写真实职务、不写感谢语 */
  staff: string[];
}

/** 片头表：线 id → 文案 */
export const OP_PLATES: Record<string, OpeningPlate> = {
  "lights-out": {
    place: "宿舍楼 · 第二十二时",
    title: "熄灯",
    titleTail: "之后",
    quote: "十一点整，整栋楼的电走一次。它不迟到，也不解释。",
    bgId: "bg-dorm-lobby",
    cgId: "cg-green-lamp",
  },
  canteen: {
    place: "食堂 · 十二点零三分",
    title: "已老实",
    titleTail: "食堂",
    quote: "公示过的量，加了算我打错。",
    bgId: "bg-canteen-noon",
    cgId: "cg-menu-board",
  },
  lake: {
    place: "湖边 · 学期末最后一天",
    title: "蛙生",
    titleTail: "的意义",
    quote: "湖边。十点。带上你自己。",
    bgId: "bg-lake-shore",
    cgId: "cg-lake-moon",
  },
  "first-class": {
    place: "教学楼 · 开学第一天",
    title: "开学",
    titleTail: "第一课",
    quote: "先交表。我等。",
    bgId: "bg-class-gate",
    cgId: "cg-plan-sheet",
  },
  administration: {
    place: "行政楼 · 下午三点二十",
    title: "最终",
    titleTail: "解释权",
    quote: "本通知最终解释权归学工办所有。",
    bgId: "bg-admin-window",
    cgId: "cg-stamp-window",
  },
  "self-study": {
    place: "自习楼 · 下午四点四十七",
    title: "上岸",
    titleTail: "第一剑",
    quote: "报名表上没有「二战」这个选项，只能填：其他人员。",
    bgId: "bg-study-hall",
    cgId: "cg-locker-notes",
  },
  lawn: {
    place: "操场 · 傍晚六点半",
    title: "躺在草坪上",
    titleTail: "思考蛙生",
    quote: "两盏灯坏了半年，报修单填过三回。",
    bgId: "bg-lawn-track",
    cgId: "cg-field-dusk",
  },
  club: {
    place: "社团活动中心 · 招新日",
    title: "抽象",
    titleTail: "社团招新",
    quote: "一百多张桌子，每张后面坐着一只笑得很标准的蛙。",
    bgId: "bg-club-stage",
    cgId: "cg-club-stage",
  },
  "roll-king": {
    place: "图书馆 · 凌晨三点",
    title: "卷王",
    titleTail: "养成计划",
    quote: "图书馆的灯亮得像白天。窗帘全拉着，你分不出天色。",
    bgId: "bg-library-hall",
    cgId: "cg-library-window",
  },
};

/** 片尾表：线 id → 文案。卷宗号按线注册顺延（第一课一 / 卷王二 / 食堂三 / 招新四 / 草坪五 / 湖边六 / 自习楼七 / 行政楼八 / 宿舍楼九） */
export const ED_PLATES: Record<string, EndingPlate> = {
  "lights-out": {
    label: "熄灯之后 · 完",
    staff: [
      "剧本 · 本案卷宗第九号",
      "立绘 · 灰灰、格格（客串）与一只没被查到的蛙",
      "定格画 · 六十个正常 / 绿色应急灯 / 二十三点整 / 帘子里的光 / 合格 / 十一点零五 / 天亮之后",
      "音乐 · 楼道口、上下铺、断电之后、帘子里的夜谈、天亮之前",
    ],
  },
  canteen: {
    label: "已老实食堂 · 完",
    staff: [
      "剧本 · 本案卷宗第三号",
      "立绘 · 干饭叔与一只排在队尾的蛙",
      "定格画 · 窗口的勺 / 元气煲 / 半格饭盆 / 打烊的操作台 / 最后一盏灯 / 锅沿的年轮 / 那条围裙",
      "音乐 · 食堂波尔卡、深夜窗口、打烊之后",
    ],
  },
  lake: {
    label: "蛙生的意义 · 完",
    staff: [
      "剧本 · 本案卷宗第六号",
      "立绘 · 五只原班蛙与一个没被回答完的问题",
      "定格画 · 湖面月色 / 屏幕朝下 / 锅里的玉米 / 二十年没换 / 还剩一扇灯 / 只剩湖 / 五块石头",
      "音乐 · 湖畔夜曲、都放下了、散场没有仪式",
    ],
  },
  "first-class": {
    label: "开学第一课 · 完",
    staff: [
      "剧本 · 本案卷宗第一号",
      "立绘 · 干饭叔（客串）与一只第一次填表的蛙",
      "定格画 · 课桌上的规划表 / 礼堂的灯 / 后墙的倒计时 / 撕剩的半张 / 时间轴的尽头 / 还是那张表 / 四道光 / 两张名单",
      "音乐 · 晨光进行曲、青春风采、我等",
    ],
  },
  administration: {
    label: "最终解释权 · 完",
    staff: [
      "剧本 · 本案卷宗第八号",
      "立绘 · 格格与一只在窗口排队的蛙",
      "定格画 · 盖章窗口 / 回收十一份 / 七百字的三种写法 / 实习期倒计时 / 温馨提示 / 最终解释权 / 没落款的那张",
      "音乐 · 规整进行曲、那一格灯、改到手指自己会动",
    ],
  },
  "self-study": {
    label: "上岸第一剑 · 完",
    staff: [
      "剧本 · 本案卷宗第七号",
      "立绘 · 再再与一只来找插座的蛙",
      "定格画 · 储物柜便利贴 / 修订第 9 版 / 402 的窗 / 两板褪黑素 / 对折的纸 / 不敢拆的答案",
      "音乐 · 凌晨四点的滴答、天从橘色褪成灰蓝、前后三秒",
    ],
  },
  lawn: {
    label: "躺在草坪上思考蛙生 · 完",
    staff: [
      "剧本 · 本案卷宗第五号",
      "立绘 · 灰灰与一只带汽水来的蛙",
      "定格画 · 操场黄昏 / 两根草茎 / 坏灯之间 / 体检报告 / 两瓶汽水 / 合唱",
      "音乐 · 草坪白日梦、辩完了、夜风把草坪吹凉了",
    ],
  },
  club: {
    label: "抽象社团招新 · 完",
    staff: [
      "剧本 · 本案卷宗第四号",
      "立绘 · 莓莓与一只笑得不够到位的蛙",
      "定格画 · 招新舞台 / 招新桌的台账 / 官号的九宫格 / 剩余四十三 / 下拉菜单 / 没人回去开",
      "音乐 · 招新快步、保持微笑、没人回去开",
    ],
  },
  "roll-king": {
    label: "卷王养成计划 · 完",
    staff: [
      "剧本 · 本案卷宗第二号",
      "立绘 · 抹抹与一只借她灯的蛙",
      "定格画 · 凌晨的窗 / 占座水杯阵 / 闭馆倒计时 / 内耗那格 / 两列分数 / 十七扇窗",
      "音乐 · 倒计时节拍、凌晨之后、公示栏前",
    ],
  },
};

/** 按线查片头；没配返回 null（不播） */
export function openingPlateOf(lineId: string | null): OpeningPlate | null {
  if (!lineId) return null;
  return OP_PLATES[lineId] ?? null;
}

/** 按线查片尾；没配返回 null（结局卡不显示 ED 块） */
export function endingPlateOf(lineId: string | null): EndingPlate | null {
  if (!lineId) return null;
  return ED_PLATES[lineId] ?? null;
}
