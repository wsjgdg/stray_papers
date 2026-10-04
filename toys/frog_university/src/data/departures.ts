/**
 * 奶蛙大学 · 离校（批次 CC）
 * 某个角色突然不在了——不是结局，是学期中途。没有预告，没有告别。
 * 你只是某一天去食堂，发现窗口换了人；去宿舍，发现床空了；去图书馆，卷王的座位坐了别人。
 * 你可以去找，但找不到。没有正确的回应——只有你选了哪一种。
 * 离开的角色会在下学期回来。但它不记得你：它的档案被重置了，你的没有。
 */
import type { FrogCharacterId } from "@/data/characters";
import type { StorylineId } from "@/data/storylines";

/** 每只蛙的「家」：离校之后，那条线里就没有它了（主角奶白不会走，占位仅补全类型） */
export const FROG_LINE: Record<FrogCharacterId, StorylineId> = {
  naiBai: "first-class",
  moMo: "roll-king",
  meiMei: "club",
  huiHui: "lawn",
  ganFanShu: "canteen",
  zaiZai: "self-study",
  geGe: "administration",
  mianMian: "sick-note",
};

export interface DepartureMeta {
  frogId: FrogCharacterId;
  /** 它该在的地方 */
  place: string;
  /** 发现那一幕（你去了它该在的地方） */
  discovery: string;
  /** 下学期它回来了——它不记得你（档案重置，你的没有） */
  returnNote: string;
}

export const DEPARTURES: DepartureMeta[] = [
  {
    frogId: "huiHui",
    place: "草坪",
    discovery:
      "你去了草坪。灯还是那两盏，一盏亮着。草坪上有一块压平的印子——不是今天压的。琴不在了。",
    returnNote: "（它看了你一眼，没有认出来。它档案里那一页是新的——第一行写着：本学期报到。你的那一页，还是你的。）",
  },
  {
    frogId: "geGe",
    place: "学工办",
    discovery:
      "你去了学工办。窗口后面的换了一只蛙，抽屉的钥匙换了颜色。通知照发，名单照报——只是没有一只蛙抬头看你。",
    returnNote: "（她翻了翻材料，像在找一个没来过的蛙。她档案里那一页是新的——第一行写着：本学期报到。你的那一页，还是你的。）",
  },
  {
    frogId: "moMo",
    place: "图书馆",
    discovery:
      "你去了图书馆。她的座位坐了别人——桌上那摞真题搬走了，杯子还在原位，没人动。",
    returnNote: "（她把书码好了才抬头。她档案里那一页是新的——第一行写着：本学期报到。你的那一页，还是你的。）",
  },
  {
    frogId: "meiMei",
    place: "社团",
    discovery:
      "你去了社团。招新桌还在，台账翻到新的一页。官号的九宫格更新了一条，配图里没有她。",
    returnNote: "（她把气球重新拴好了才回头。她档案里那一页是新的——第一行写着：本学期报到。你的那一页，还是你的。）",
  },
  {
    frogId: "zaiZai",
    place: "自习楼四楼",
    discovery:
      "你去了自习楼。他那格储物柜上了锁，锁上了两天。四楼还是满的，只是最靠窗那排空了一格。",
    returnNote: "（他没抬头，倒计时牌换了一张新的。他档案里那一页是新的——第一行写着：本学期报到。你的那一页，还是你的。）",
  },
  {
    frogId: "ganFanShu",
    place: "食堂窗口",
    discovery:
      "你去了食堂。三号窗口换了人——新来的那只动作很熟，份量一样，勺子不一样。牌子照旧翻着。",
    returnNote: "（他把勺子换了只手递给你。他档案里那一页是新的——第一行写着：本学期报到。你的那一页，还是你的。）",
  },
  {
    frogId: "mianMian",
    place: "医务室",
    discovery:
      "你去了医务室。登记台后面坐着一只你没见过的蛙，白大褂的袖口比棉棉的长一截。桌上那本《本学期收到的理由》翻开着——翻到的是新的一本。台历底下空了。",
    returnNote: "（她核完那张存根才抬头。她档案里那一页是新的——第一行写着：本学期报到。你的那一页，还是你的。）",
  },
];

/** 按蛙取离校档案 */
export function departureMetaOf(frogId: FrogCharacterId): DepartureMeta | undefined {
  return DEPARTURES.find((item) => item.frogId === frogId);
}

/** 三处去找的答案（批次 CC；都是「不透露」的三种写法） */
export const DEPARTURE_ASK_LINES = {
  office: "你去了行政楼。窗口后面的蛙推来一张表：《学籍变动查询申请》。受理条件那一栏印着：本人申请。它指了指那一栏——你填不了。你不在那一栏里。",
  other: "你不知道吗？我以为你知道。",
  lake: "你去了湖边。没有人。",
} as const;

/** 铭牌上的「回来了」角标（下学期它回来了——档案重置，你的没有） */
export const DEPARTURE_RETURN_MARK = "回来了";
