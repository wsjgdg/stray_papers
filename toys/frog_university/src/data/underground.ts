/**
 * 奶蛙大学 · 地下组织（批次 CD）
 * 校园里有一个地下组织，专门帮蛙处理档案。没有名字、没有固定成员、没有固定地点——
 * 你只能在深夜的某个场景里偶然遇到它们。它们做的事：
 * 帮蛙修改档案里的某一行；帮蛙逃避某次约谈；帮蛙把一份报告从「已提交」变回「草稿」。
 * 加入之后，你的所有选择都变成双面的：表面上你在上课、吃饭、躺草坪；暗地里你在帮某个蛙改档案、传消息、藏东西。
 * 被发现的风险永远存在——不是数值，是具体的人。被发现之后不是结局：它们不再联系你，
 * 而你的档案上多了一行：「该蛙曾参与非正式档案活动。」
 * 但如果你不加入呢？有些蛙的结局你永远打不出来——那些结局的前提，是有人帮它们改过档案。
 */

/** 三件它们做的事 */
export type UndergroundServiceKind = "correct" | "evade" | "draft";

/** 加入之后，白天那件事也会长出夜里那一面 */
export type UndergroundJobKind = "class" | "skip" | "line" | "night";

export const UNDERGROUND_SERVICE_LABEL: Record<UndergroundServiceKind, string> = {
  correct: "改一行",
  evade: "躲一场",
  draft: "回草稿",
};

/** 托付的措辞（{name} 由 useCampusMap 填） */
export const UNDERGROUND_SERVICE_ASK: Record<UndergroundServiceKind, string> = {
  correct: "{name}的那份档案，有一行要改。改了之后，那一行就不在原处了。",
  evade: "{name}有一场约谈。名单上写着到了，人得不在。",
  draft: "{name}交过一份报告——已提交。要变回草稿，只差一个章。",
};

export const UNDERGROUND_SERVICE_DONE: Record<UndergroundServiceKind, string> = {
  correct:
    "你递了表。柜台盖章的时候没抬头——这一行从此是新的。它不知道是谁改的；它只知道那一行变了。",
  evade: "你把名单上的那一行描了描——墨迹均匀，看不出改过。约谈那天它不在，名单照记：已通知，未到。没有人追。",
  draft: "你把回执折了角。那份报告从「已提交」变回了「草稿」——草稿不算数，草稿像没写过。它不知道是谁帮的忙。",
};

export const UNDERGROUND_SERVICE_REFUSED: Record<UndergroundServiceKind, string> = {
  correct: "你没有接。它们没说什么——那份档案的第七页，明天照旧是旧的那行。",
  evade: "你没有接。约谈那天，它到了。它坐在椅子上，回答得很标准。",
  draft: "你没有接。那份报告照常归档——它写下的每一个字，都算它说过的。",
};

/** 招募夜（第一次遇到它们）：走廊尽头那扇没上锁的门 */
export const UNDERGROUND_RECRUIT_NODES = [
  "走廊尽头有一扇没上锁的门。里面亮着灯，声音压得很低——你数了数，至少三只蛙。没有名字，没有牌子，门口那格登记表是空白的。",
  "它们在做的事你认得：一份档案摊在桌上，某一行的字和旁边的字不一样——墨是新的，纸是旧的。有人在改它。",
  "有蛙抬头看了你一眼，没有赶你。它把椅子往旁边挪了半格：「坐不坐随你。这地方没有规矩，只有事。」",
];

/** 托付夜（你加入之后，它们来问你一件事） */
export const UNDERGROUND_JOB_NODES = [
  "还是那扇门。这次它们先开口——手里那份档案，有一行等着改。",
  "「你递还是我递？」有蛙把表推过来。经手那一栏，它们用的是你的学号——不是它不知道你是谁，是柜台认你的字。",
  "白天你照常上课、吃饭、躺草坪。夜里的事不进任何一栏——不进名册，不进名单，也不进你的档案。",
];

/** 断联夜（被暴露之后，它们最后一次出现） */
export const UNDERGROUND_CLOSED_NODES = [
  "那扇门锁上了。锁是新的——不是它们换的，是行政楼装的。",
  "你敲了两下，没有人应。走廊的登记表上，那一格被划掉了——划痕是别人的笔迹。",
  "它们不再联系你。不是翻脸，是章程：被看见的名字不能再用。",
];

/** 加入的回执（这一栏不存在——这就是它不在的原因） */
export const UNDERGROUND_JOIN_NOTE =
  "没有章，没有编号，没有欢迎词。这一栏不存在——这就是这份工作的第一课：你做的事，档案上不写。白天你照常上课、吃饭、躺草坪；夜里，档案上不写的那部分归它们。";

/** 暴露那一场：具体的人，不是数值 */
export const UNDERGROUND_EXPOSE_LEAD =
  "行政楼的窗口后面，那只蛙叫住了你：「你最近……和谁走得比较近？」";

export const UNDERGROUND_EXPOSE_BODY =
  "你没有答。它也没等你答——它把一张表推出来，上面那一栏已经填好了：该蛙曾参与非正式档案活动。";

export const UNDERGROUND_EXPOSE_NOTE =
  "它们不再联系你。不是翻脸，是章程：被看见的名字不能再用。你的档案上多了一行——那一行是别人写的，和你档案里别的行一样。";

/** 两面的账：加入之后，你做的每一件正常的事都长出夜里那一面（{n} 由 useCampusMap 填） */
export const UNDERGROUND_JOB_TEXTS: Record<
  UndergroundJobKind,
  { surface: (n: string) => string; underneath: string }[]
> = {
  class: [
    {
      surface: (n) => `第 ${n} 天 · 白天，你上了一节课。`,
      underneath: "夜里，有人把某一栏改了——不是你的档案。你没有问是谁的。",
    },
    {
      surface: (n) => `第 ${n} 天 · 白天，你交了一份笔记。`,
      underneath: "交上去的那一叠里，有一页不是你的——它抄你的格式抄得很好，你认不出来才对。",
    },
  ],
  skip: [
    {
      surface: (n) => `第 ${n} 天 · 白天，你逃了一节课。`,
      underneath: "档案照记：出勤正常。替你到的那一只，没留名字。",
    },
    {
      surface: (n) => `第 ${n} 天 · 白天，你没去。`,
      underneath: "你没去的那节课，有一只蛙替你坐着——它的位置在名单上是你的。",
    },
  ],
  line: [
    {
      surface: () => "你走完了一条线。",
      underneath: "走完的线里，有一行不是原来的那行。改的人不认识你——你也别回头。",
    },
  ],
  night: [
    {
      surface: (n) => `第 ${n} 天 · 深夜，你看见了一件东西。`,
      underneath: "第二天，别人的档案里少了一行。你没看错，也没说。",
    },
    {
      surface: (n) => `第 ${n} 天 · 深夜，你路过那扇门。`,
      underneath: "门里的事照常在办。你看见了，就当没看见——这也是一种办事。",
    },
  ],
};

/** 按服务取托付措辞（填好蛙名） */
export function undergroundAskOf(kind: UndergroundServiceKind, frogName: string): string {
  return (UNDERGROUND_SERVICE_ASK[kind] ?? "").replace("{name}", frogName);
}
