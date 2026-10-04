/**
 * 奶蛙大学 · 定稿（批次 DA）
 * 学期快完了。按规程，卷宗在交班前要跟当事人清点一遍——表上列着这学期发生在你身上的
 * 每一件事。逐行核对，有异议就指出，没有就签字。签了字，这一学期就是定稿：
 * 从此不再受理更正。
 */
import type { GameSaveData } from "@/lib/gameSave";

/** 发现那一幕（批次 DA） */
export const FINALIZE_DISCOVERY =
  "「学期快完了。按规程，卷宗在交班前要跟当事人清点一遍。」档案室的蛙把一张《学期清点表》" +
  "放在你面前——表上列着这学期发生在你身上的每一件事：你的班、你的单子、你的错页、你的重号、" +
  "你的转递、你的知会。「逐行核对。有异议就指出来。没有异议就签字。」它把笔搁在表上：" +
  "「签了字，这一学期就是定稿。定稿之后，不再受理更正。」";

/** 清点表的口径（批次 DA） */
export const FINALIZE_NOTICE =
  "兹清点学号 036 本学期事项如下表。逐行核对无误后由当事人签字确认；" +
  "签字后本学期卷宗定稿，不再受理更正。拒签的学期按「待定稿」结转。";

/** 清点表的一行（批次 DA）：事项名 + 结果 */
export interface FinalizeLine {
  label: string;
  result: string;
}

const PICK_TEXT: Record<string, string> = {
  sign: "照单交，逐项核签",
  omit: "缺一项，遗留经办",
  extra: "多交一项，予以收录",
  confirm: "已认责",
  point: "移交原单",
  smooth: "补充说明，已采纳",
  name: "接办人已提名",
  blank: "接办人待指派",
  self: "原经办人续任",
  correct: "已更正，已确认知悉",
  carry: "已入档（按编号核）",
  return: "已退回，理由栏「无」",
  faithful: "补页入卷，以补述为准",
  sparse: "补述收讫，无补充",
  extraLost: "补页入卷，编号续上",
  split: "已拆分，合宗历史留存",
  meet: "混排不变，合宗继续",
  send: "转递办结",
  selfSend: "本人押送，情况知悉",
  seal: "封缄启封，销毁留痕",
  ack: "已知悉",
  seek: "查明申请，已批复",
  hold: "未回执，按未送达计",
  note: "（本条无内容可写）",
};

const textOf = (key: string): string => PICK_TEXT[key] ?? "已结转";

/** 清点表（批次 DA）：这学期发生在你身上的每一件事，从各册记录派生；没有就是「无事项」 */
export function finalizeLinesOf(save: GameSaveData): FinalizeLine[] {
  const semester = save.playthrough;
  const lines: FinalizeLine[] = [];
  const pickOf = (log: { semester: number; pick?: string }[] | undefined, fallback: string): string => {
    const hit = (log ?? []).find((item) => item.semester === semester);
    return hit ? textOf(hit.pick ?? fallback) : textOf(fallback);
  };

  const shift = (save.shiftHandoverLog ?? []).find((item) => item.semester === semester);
  if (shift) lines.push({ label: "学期交接", result: pickOf(save.shiftHandoverLog, "sign") });

  const testimony = (save.testimonyLog ?? []).find((item) => item.semester === semester);
  if (testimony) lines.push({ label: "核对通知", result: pickOf(save.testimonyLog, "confirm") });

  const succession = (save.successionLog ?? []).find((item) => item.semester === semester);
  if (succession) lines.push({ label: "接办人登记", result: pickOf(save.successionLog, "blank") });

  const misdelivery = (save.misdeliveryLog ?? []).find((item) => item.semester === semester);
  if (misdelivery) lines.push({ label: "处分决定书（误投）", result: pickOf(save.misdeliveryLog, "carry") });

  const lostPage = (save.lostPageLog ?? []).find((item) => item.semester === semester);
  if (lostPage) {
    const result = lostPage.pick === "extra" ? textOf("extraLost") : textOf(lostPage.pick ?? "faithful");
    lines.push({ label: "补述笔录", result });
  }

  const merger = (save.mergerLog ?? []).find((item) => item.semester === semester);
  if (merger) lines.push({ label: "合并通知书", result: pickOf(save.mergerLog, "carry") });

  const transit = (save.transitLog ?? []).find((item) => item.semester === semester);
  if (transit) {
    const result = transit.pick === "self" ? textOf("selfSend") : textOf(transit.pick ?? "send");
    lines.push({ label: "卷宗转递", result });
  }

  const beread = (save.bereadLog ?? []).find((item) => item.semester === semester);
  if (beread) lines.push({ label: "调阅知会", result: pickOf(save.bereadLog, "ack") });

  const note = (save.noteLog ?? []).find((item) => item.semester === semester);
  if (note) lines.push({ label: "无编号往来", result: textOf("note") });

  if (lines.length === 0) lines.push({ label: "本学期", result: "无事项" });
  return lines;
}

/** 三种处理（批次 DA）：逐行签字 / 指出一处 / 拒签——没有正确的，只有这个学期最后停在哪一栏 */
export const FINALIZE_OUTCOMES: Record<
  "sign" | "dispute" | "refuse",
  { title: string; body: string; filing: string }
> = {
  sign: {
    title: "逐行签字",
    body:
      "你一行一行核下去。每行都属实——不是说它们公道，是说它们准确。你签了。" +
      "这一学期定稿：从此不再受理更正。定稿的意思不是没错——是没错要改了。" +
      "改的窗口关上了，纸上的学期和你过掉的学期，从今天起是同一个。" +
      "你走出档案室的时候想：原来「过去了」是一种手续。",
    filing: "档案照写：本学期清点完毕，当事人签字确认，卷宗定稿。更正受理栏关闭。",
  },
  dispute: {
    title: "指出一处",
    body:
      "你指着一行：「这里不对。」其实哪一行都对——你只指了最轻的那一处，一个日期的写法。" +
      "窗口的蛙核了核，改了，重新打印。改过的地方盖了一枚章：更正。你要的那一个字回来了——" +
      "为它，整张表重新走了一遍流程，定稿晚了三天。更正不是擦掉，是在旁边加一行：" +
      "你的那行比原来那行，多一枚章。",
    filing: "档案照写：当事人对清点表提出更正一处，予以更正。定稿顺延三日，更正栏留章。",
  },
  refuse: {
    title: "拒签",
    body:
      "你把表推了回去，没签。「不签也行。」档案室的蛙收了表，语气没变：" +
      "「按规程，拒签的学期按『待定稿』计——不定稿不是不定案，它只是永远停在这一步，等一只不会来的签。」" +
      "你这学期从此是悬着的。悬着的学期不结转。它归你——跟缺的那一项、跟抽屉里的便条放在一起。" +
      "你名下没写完的东西，又多了一整个学期。",
    filing: "档案照写：当事人拒签，本学期按「待定稿」结转。定稿栏空置，空置免于催办。",
  },
};

/** 落定那一幕（批次 DA）：表收走了 */
export const FINALIZE_DONE =
  "表收走了。柜子里那一宗，从今天起要么是定稿，要么是待定——都是它最后的形状。" +
  "你路过档案室的时候没有多看。这学期的事，你要么签了，要么指了，要么留下了。" +
  "三种都是办完的样子。";

/** 下一学期开学挂在档案上的小字（批次 DA） */
export function finalizeKeptLine(): string {
  return "（上一学期清点过了。是定稿还是待定，档案知道。）";
}
