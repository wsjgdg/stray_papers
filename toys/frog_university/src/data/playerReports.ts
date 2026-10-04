/**
 * 奶蛙大学 · 撰写（批次 BZ）
 * 反转：你不只是被学校记录，也可以主动写一份关于某个角色的报告。
 * 深夜事件《空白档案页》里拿笔——选谁、写什么、提交，不可撤销（报告没有撤回这一栏）。
 * 提交之后：那只蛙的剧情线从此换一种关系；档案柜里多一份署名你学号的报告（跨学期保留，
 * 二周目的柜子里还在）；它不知道是谁写的，但会在某一天说：「最近有人写了我一份报告。」
 * 这个机制的重量在于：记录别人比被记录更难受。
 */
import type { FrogCharacterId } from "@/data/characters";
import type { PlayerReport } from "@/lib/gameSave";

/** 报告的两档口径（批次 BZ） */
export type ReportVerdict = "true" | "false";

/** 一支事由：写在「事由」栏里的那句话 + 制度核过之后的处置 */
export interface ReportClaim {
  /** "true" 实话（会被核）| "false" 不是实话（会被放过） */
  verdict: ReportVerdict;
  /** 事由栏原文（档案腔，像别人写的） */
  text: string;
  /** 提交回执上写给你的处置 */
  disposition: string;
}

/** 一只被写蛙：姓名栏、两支事由、被写过之后它开口的那行 */
export interface ReportSubject {
  frogId: FrogCharacterId;
  /** 姓名栏（学工办的表上写的是这个名字） */
  name: string;
  /** 所在楼（姓名栏旁边的小字） */
  place: string;
  claims: ReportClaim[];
  /** 被写过之后，下一次见面它开口的那行（报告写在本学期） */
  reportLine: string;
  /** 报告写在更早的学期：它记得有人写过自己，不知道是谁 */
  reportLineEcho: string;
}

export const REPORT_SUBJECTS: ReportSubject[] = [
  {
    frogId: "huiHui",
    name: "灰灰",
    place: "草坪",
    claims: [
      {
        verdict: "true",
        text: "该蛙本学期及上学期均未参加任何集体活动。集体活动报名表上均无其姓名。经查，草坪上常有该蛙独自停留，时间不定。",
        disposition: "处置：通报批评一次。制度核过了——核的结论是属实。",
      },
      {
        verdict: "false",
        text: "该蛙积极参加集体活动，多次主动报名，表现良好。",
        disposition: "处置：无异常。制度没有核对真伪——制度只核对有没有这份报告。",
      },
    ],
    reportLine:
      "他没看你。「最近有人写了我一份报告。」（琴声没停。通报贴在草坪边的公告栏——他没去看，你替他看了。）",
    reportLineEcho:
      "他没看你。「档案柜里有一份写我的报告。署名是个学号。我对不上这个学号——也可能对得上，只是没人告诉我。」",
  },
  {
    frogId: "zaiZai",
    name: "再再",
    place: "自习楼四楼",
    claims: [
      {
        verdict: "true",
        text: "该蛙每日自习至凌晨，连续三个学期。集体活动报名表累计四张，签名栏空白。备考科目不明。",
        disposition: "处置：约谈一次。约谈记录上多了一份——不是你的。",
      },
      {
        verdict: "false",
        text: "该蛙已报名多项集体活动，备考状态良好。",
        disposition: "处置：无异常。制度没有核对真伪——制度只核对有没有这份报告。",
      },
    ],
    reportLine:
      "他没抬头。「最近有人写了我一份报告。上周有人找我问话——问的人不看我，只看纸。」",
    reportLineEcho:
      "他没抬头。「有人写过我一份报告。不是这学期的事。柜子里的东西，比人记得久。」",
  },
  {
    frogId: "geGe",
    name: "格格",
    place: "学工办",
    claims: [
      {
        verdict: "true",
        text: "该蛙在学工办值班期间，多次于非工作时间调阅档案。无加班记录，无审批记录。",
        disposition: "处置：列入观察名单。名单上多了一只蛙——这次不是你。",
      },
      {
        verdict: "false",
        text: "该蛙作息规律，从不加班，岗位敬业。",
        disposition: "处置：无异常。制度没有核对真伪——制度只核对有没有这份报告。",
      },
    ],
    reportLine:
      "她把抽屉关上了。「最近有人写了我一份报告。写完之后，名单上多了一栏——栏里是我的名字。」",
    reportLineEcho:
      "她把抽屉关上了。「上一学期有人写过我一份报告。署名是个学号。这栋楼里没有一栏，是写给自己看的。」",
  },
  {
    frogId: "ganFanShu",
    name: "干饭叔",
    place: "食堂窗口",
    claims: [
      {
        verdict: "true",
        text: "该蛙在窗口打饭，份量按人头发放，不按交情。窗口秩序良好，建议保留。",
        disposition: "处置：情况属实，建议保留。它被护住了——护它的方式，是给它再上一道锁。",
      },
      {
        verdict: "false",
        text: "该窗口服务热情，多次收到同学表扬，屡次破例多给。",
        disposition: "处置：无异常。制度没有核对真伪——制度只核对有没有这份报告。",
      },
    ],
    reportLine:
      "他把勺子放下。「最近有人写了我一份报告。写的是实话。现在我打饭的时候，后头有人看着。」",
    reportLineEcho:
      "他把勺子放下。「上一学期，有人写过我一份报告。谁写的，不知道。写的是好话还是坏话，我也不知道——没人念给我听过。」",
  },
];

/**
 * 某只蛙该开口的那行（批次 BZ）：报告写在本学期，它说「最近有人写了」；
 * 报告写在更早的学期，它说「档案柜里有一份」——它记得有人写过自己，不知道是谁。
 */
export function reportLineOf(
  save: { playthrough: number; reportLog?: PlayerReport[] },
  frogId: FrogCharacterId,
): string | null {
  const list = (save.reportLog ?? []).filter((item) => item.frogId === frogId);
  const latest = list[list.length - 1] as PlayerReport | undefined;
  if (!latest) return null;
  const subject = REPORT_SUBJECTS.find((item) => item.frogId === frogId);
  if (!subject) return null;
  return latest.semester < save.playthrough ? subject.reportLineEcho : subject.reportLine;
}

/** 铭牌上的撰写痕角标（被写过的蛙，名牌从此带这一枚——它不知道是谁写的） */
export const REPORT_TRACE_MARK = "被写过";
