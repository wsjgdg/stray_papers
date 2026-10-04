/**
 * 奶蛙大学 · 团体（批次 CA）
 * 角色不是独立个体——它们有自己的关系网，这张网是活的：
 * 它们自己组成小团体，在你不知道的时候自己做事，积累够了自己分裂；
 * 你可以加入（拿信息、拿资源、拿保护——也被绑定），也可以旁观（安全——但永远不知道它们在做什么）。
 * 分裂不是你挑拨的，是它们自己的问题。分裂之后两边都来找你，要你站队。
 */
import type { FrogCharacterId } from "@/data/characters";
import type { StorylineId } from "@/data/storylines";

export type FactionId = "curfew" | "bulletin" | "ledger";

/** 站队的一边：它的话与它所在的那条线（站了它，另一边的线永久关闭） */
export interface FactionMemberLine {
  frogId: FrogCharacterId;
  lineId: StorylineId;
  sideLine: string;
}

export interface FactionMeta {
  id: FactionId;
  /** 团名（档案腔） */
  title: string;
  /** 它们的关系（你没介入之前的样子） */
  bond: string;
  /** 它们自己做的一件事（一学期一次，种子派生第几天） */
  action: {
    title: string;
    /** 你看见的样子（旁观版） */
    text: string;
    /** 加入之后才知道的内情 */
    inside: string;
    /** 行动之后递来的那句话（入会邀请） */
    joinOffer: string;
  };
  /** 加入之后档案写的那一行 */
  joinReceipt: string;
  /** 发现它们的勾结之后，它们怎么对你（仅 bulletin 使用） */
  exposed?: { text: string; disposition: string };
  /** 分裂的引子：内部说法（你在这边才看得见） */
  splitLeadInside: string;
  /** 分裂的引子：旁观版 */
  splitLeadOutside: string;
  members: [FactionMemberLine, FactionMemberLine];
  /** 两边都不站的代价 */
  sideCost: string;
  /** 站队之后另一边关闭的说明 */
  sideClosed: string;
  /** 分裂的条件（档案腔，写的是它自己的账，不是你的功劳） */
  splitCondition: string;
}

export const FACTIONS: FactionMeta[] = [
  {
    id: "curfew",
    title: "熄灯之后",
    bond: "灰灰的琴是格格帮忙登记进器材室的。宿舍那一栋楼，一只管灯，一只管表——十一点整的电走一次，十一点零五她上楼，是同一趟。",
    action: {
      title: "熄灯改了",
      text: "宿舍的熄灯从十一点改到了十一点半。公告栏没有贴通知，名单没有更新——只是这一学期，走廊的灯每晚多亮半个小时。灰灰的琴声也从十一点半开始，多弹半个小时。",
      inside: "时间不是学校改的——是格格在值班表上改的，改完把表放回原位，没人核对值班表。灰灰知道了，也没说谢谢。这件事两个人都没提过。",
      joinOffer: "散场的时候，格格跟你说了半句：「今晚的灯，是我让亮的。」",
    },
    joinReceipt: "档案照写：该蛙所在团体：《熄灯之后》。以后这一栋楼的灯，有你一份。",
    splitLeadInside: "这学期他们在走廊里擦肩而过三次，一次招呼都没打。你早看出来了——改灯那件事，从没在两个人嘴里一起出现过。",
    splitLeadOutside: "这学期他们在走廊里擦肩而过三次，一次招呼都没打。你不知道为什么。",
    members: [
      {
        frogId: "huiHui",
        lineId: "lawn",
        sideLine: "灰灰没看你：「她改灯的时候，没跟我商量。」",
      },
      {
        frogId: "geGe",
        lineId: "administration",
        sideLine: "格格把值班表推过来：「琴再弹下去，隔壁楼的投诉单要走到我这儿。」",
      },
    ],
    sideCost: "不站队——两边都不再跟你提这件事。你们之间少了半个话题，谁也没说什么。",
    sideClosed: "另一边从此没有你的事——不是拉黑，是那栋楼里剩下的话题，都轮不到你。",
    splitCondition: "两只走得一样近的时候，谁也不会先开口。离得不一样近，就会有一只先开口。",
  },
  {
    id: "bulletin",
    title: "公示栏",
    bond: "社团官号的九宫格走学工办的章；学工办的招新名单，一半是社团报上去的。两边的章盖在同一张纸上——这叫流程，不叫勾结。",
    action: {
      title: "一张你没见过的海报",
      text: "你在图书馆待了一整天。出来的时候，公告栏多了一张你没见过的海报：社团招新延期，落款两个——学工办、社团。两边的章都在，盖得很齐。",
      inside: "章是莓莓拿去盖的。格格说的：「一起盖一个，省一张纸。」招新延后的那一周，名单走的是行政楼那边——是谁在用这张纸办事，海报上没写。",
      joinOffer: "莓莓把剩下的浆糊推给你：「贴贴？这活儿轻。」",
    },
    joinReceipt: "档案照写：该蛙所在团体：《公示栏》。以后这张墙上贴了什么，有你一份。",
    exposed: {
      text: "这件事被看见了。被看见的勾结不叫勾结，叫材料——它们一起把材料处理了。",
      disposition: "名单更新了：你的名字并了一行。它们不问你看见了什么——被看见本身就是材料。",
    },
    splitLeadInside: "章盖歪了一次。两个人都说不是自己盖的。你早知道这份勾结走不长——纸只有一张，章有两只。",
    splitLeadOutside: "章盖歪了一次。两个人都说不是自己盖的。你不知道那枚章在谁手里。",
    members: [
      {
        frogId: "geGe",
        lineId: "administration",
        sideLine: "格格把那份材料推过来：「签字那一栏，你来。」",
      },
      {
        frogId: "meiMei",
        lineId: "club",
        sideLine: "莓莓笑得跟平时一样：「我就是想贴个海报。谁想这么多。」",
      },
    ],
    sideCost: "不站队——两边都不再跟你提这件事。公示栏照旧贴东西，只是那两张章，你再也对不上。",
    sideClosed: "另一边从此没有你的事——不是拉黑，是那张纸上剩下的事，都轮不到你。",
    splitCondition: "一张纸上有两枚章，本来是流程。章开始互相推让的那一天，流程就结束了。",
  },
  {
    id: "ledger",
    title: "三号窗口",
    bond: "卷王嫌窗口慢，干饭叔嫌复盘吵。三号窗口的牌子翻过去翻过来，一学期一次。",
    action: {
      title: "「已老实」窗口关了",
      text: "你从图书馆出来，食堂三号窗口的「已老实」牌子翻过去了，窗口关着。队伍绕到二楼去了。没人解释。",
      inside: "不是吵的。是干饭叔把打饭时间往后挪了半小时，抹抹把复习时间挪出来还他——两个人把这件事谈完了，谁也没提。牌子翻过去，是谈完了的意思。",
      joinOffer: "干饭叔把勺子搁下：「以后这个点，给你留一份。」",
    },
    joinReceipt: "档案照写：该蛙所在团体：《三号窗口》。以后这个点，有你一份。",
    splitLeadInside: "三号窗口开了两天，又关了。这次两个人都没说话。你早知道那一笔账早晚要算——两个人的账，从来不是一只蛙的账。",
    splitLeadOutside: "三号窗口开了两天，又关了。这次两个人都没说话。你不知道那一笔账算到哪儿了。",
    members: [
      {
        frogId: "ganFanShu",
        lineId: "canteen",
        sideLine: "他把勺子搁下：「规矩是我定的。要改，也得我说了算。」",
      },
      {
        frogId: "moMo",
        lineId: "roll-king",
        sideLine: "她推了推眼镜：「排队四十分钟。我背完了两套卷子。你选。」",
      },
    ],
    sideCost: "不站队——两边都不再跟你提这件事。窗口照旧开，只是那半个话题，从此没人跟你对。",
    sideClosed: "另一边从此没有你的事——不是拉黑，是那扇窗口剩下的规矩，都轮不到你。",
    splitCondition: "两套时间表碰在一起，本来是排队的问题。排队的问题解决不了，就成了站队的问题。",
  },
];

/** 按 id 取团体 */
export function factionById(id: string): FactionMeta | undefined {
  return FACTIONS.find((item) => item.id === id);
}

/** 团体两边的线（站队之后，另一边的线永久关闭） */
export const FACTION_LINES: Record<FactionId, [StorylineId, StorylineId]> = {
  curfew: ["lawn", "administration"],
  bulletin: ["administration", "club"],
  ledger: ["canteen", "roll-king"],
};

/** 某蛙该开口的团体信息行（批次 CA；加入过的团体才说这一行，一次性） */
export const FACTION_INFO_LINES: Record<FactionId, string> = {
  curfew: "（灰灰压低声音：「那半小时的灯，别在格格面前提。」——你比旁的蛙多知道一件：这半小时不是学校给的。）",
  bulletin: "（莓莓边贴边说：「章是现成的，别问。」——你比旁的蛙多知道一件：这张纸是两个人一起要的。）",
  ledger: "（干饭叔把份打好：「这个点来，别跟别人说。」——你比旁的蛙多知道一件：牌子翻过去是谈完了的意思。）",
};

/** 入会之后铭牌上的团体角标（档案腔「该蛙所在团体」） */
export const FACTION_MARK = "团体";

/** 每个团体来托你办事的那只（批次 CB）：它说话有分量，它的事也最绕不开窗口 */
export const FACTION_REQUESTER: Record<FactionId, FrogCharacterId> = {
  curfew: "geGe",
  bulletin: "meiMei",
  ledger: "ganFanShu",
};
