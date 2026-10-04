/**
 * 奶蛙大学 · 记性（批次 DK）
 * 本学期开展记性核对一次。记性不是记忆——记性核对是把
 * 你记得的事，跟档案对一遍。
 * 三种处理：照实核 / 只说一件 / 不核——没有正确的，
 * 只有差异那一栏最后记成什么样。
 */
import type { GameSaveData } from "@/lib/gameSave";

/** 发现那一幕（批次 DK） */
export const MEMORY_DISCOVERY =
  "档案室的通知：本学期开展记性核对一次。「记性不是记忆——记性核对是把**你记得的事**，跟档案对一遍。」" +
  "窗口的蛙把一张《记性核对单》递过来，单子的末尾有一栏：差异。" +
  "差异不处罚——它只是「这栋楼知道，它记的和你的记性不一样」。" +
  "**这是它第一次承认，它可能记错。**";

/** 记性核对单的口径（批次 DK） */
export const MEMORY_NOTICE =
  "兹核对学号 036 本学期事项。核对方式：当事人自述记性，逐项与档案对读。" +
  "对得上的按档案计；对不上的记入差异栏。差异免于处理，免于改判，免于追责。" +
  "当事人可不参加——不参加视同记性不作核对，记性归属不变。";

/** 核对的项数（批次 DK）：本学期办过多少件事，就核多少项 */
export function memoryItemCountOf(save: GameSaveData): number {
  const semester = save.playthrough;
  let count = 0;
  if ((save.shiftHandoverLog ?? []).some((item) => item.semester === semester)) count += 1;
  if ((save.testimonyLog ?? []).some((item) => item.semester === semester)) count += 1;
  if ((save.successionLog ?? []).some((item) => item.semester === semester)) count += 1;
  if ((save.misdeliveryLog ?? []).some((item) => item.semester === semester)) count += 1;
  if ((save.lostPageLog ?? []).some((item) => item.semester === semester)) count += 1;
  if ((save.mergerLog ?? []).some((item) => item.semester === semester)) count += 1;
  if ((save.transitLog ?? []).some((item) => item.semester === semester)) count += 1;
  if ((save.bereadLog ?? []).some((item) => item.semester === semester)) count += 1;
  if ((save.noteLog ?? []).some((item) => item.semester === semester)) count += 1;
  return Math.max(1, count);
}

/** 三种处理（批次 DK）：照实核 / 只说一件 / 不核——没有正确的，只有差异那一栏最后记成什么样 */
export const MEMORY_OUTCOMES: Record<
  "all" | "one" | "none",
  { title: string; body: string; filing: string }
> = {
  all: {
    title: "照实核",
    body:
      "你把你记得的都说了。你说完了，窗口的蛙照单记。有一件事它记得你不记得，有一件事你记得它没记——" +
      "两种情况都有一栏：差异。差异不处罚，它只是「这栋楼知道，它记的和你的记性不一样」。" +
      "**这是它第一次承认它可能记错。**承认的意思不是改——改要定稿，定稿要签字。" +
      "承认的意思只是：从此有一个地方，记着「它记的跟你记得的不一样」。那个地方叫差异。" +
      "它跟空白、编外、死角、页边一样，是这栋楼没占的地方之一。",
    filing: "记性核对按自述计，差异入卷。差异免于处理——处理要先承认差异里有一头是对的。",
  },
  one: {
    title: "只说一件",
    body:
      "你只说了那一件事——你记得最清楚的一件。你说完了，窗口的蛙查了台账：那一件事，台账上没有。" +
      "它把那一栏空着了。**空着不等于没有：空着是「有这回事，但没进档案」。**" +
      "这一栏从今天起挂在你名下。空栏跟空白不一样：空白是「今天没发生什么」，" +
      "空栏是「这一栏留着，等你补」。它不催——空栏免于催办。",
    filing: "记性核对按自述计，空栏留置。空栏免于催办——催办要先承认有一件事悬着。",
  },
  none: {
    title: "不核",
    body:
      "你没去。没核的意思是：你的记性是你的。这栋楼从来没承认过你的记性——承认要先有格式，" +
      "而记性没有格式。你没去，所以它也没问。你的记性还是你的：它不进档案，也不销毁。" +
      "它长在你身上，跟你的页边一样——**页边是它没占的地方，你的记性也是。**" +
      "档案上多了一行：当事人未参加记性核对。未参加免于追责——追责要先承认记性可以核。",
    filing: "记性核对未参加，免于另行告知。未核免于补核——补核要先承认记性有正本。",
  },
};

/** 落定那一幕（批次 DK）：核对办结 */
export const MEMORY_DONE =
  "记性核对办结。差异那一栏有了它的形状：有数、空着，或者没有这一栏。" +
  "三种形状都是这栋楼认的——它第一次给你的记性留了地方。" +
  "**你的记性跟你的页边、你的抽屉、你的编外纸放在一起：它们都不在册，但它们都在。**";

/** 下一学期开学挂在档案上的小字（批次 DK） */
export function memoryKeptLine(): string {
  return "（记性核对过一次。差异那一栏有数——数是你记得它没记的那些。）";
}
