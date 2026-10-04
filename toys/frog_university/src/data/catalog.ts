/**
 * 奶蛙大学 · 总目（批次 DS）
 * 学期末，档案室把本学期所有「没占的地方」汇总成《非在册事项总目》。
 * 总目从各册记录实时派生——这一学期你在每一处留下的状态，一行一行排开。
 * 三种处理：装订 / 抽走一页 / 不装订——没有正确的，
 * 只有这一册总目最后合不合上。
 */
import type { GameSaveData } from "@/lib/gameSave";

/** 发现那一幕（批次 DS） */
export const CATALOG_DISCOVERY =
  "学期末，档案室的蛙把一册《非在册事项总目》放在你面前——「按规程，凡本学期有非在册事项的当事人，" +
  "学期末编总目一次。总目不是清点（清点核对事实），总目是**把你这一学期在各处留下的状态，一行一行排开**。」" +
  "你从第一行读到最后一行：每一行都是你办过的一件事，和它最后长成的样子。";

/** 总目的口径（批次 DS） */
export const CATALOG_NOTICE =
  "《非在册事项总目》：兹汇总学号 036 本学期非在册事项如下表。" +
  "总目不立卷、不归档、不核验——**它只陈列，不处置。**装订与否由当事人定：" +
  "装订的随册陈列，不装订的散页退还。抽页一页视同编外，免于补录。";

/** 总目的每一行（批次 DS） */
export interface CatalogLine {
  /** 事项名 */
  label: string;
  /** 本学期落定状态 */
  state: string;
}

/** 各批次 pick → 总目陈列用语 */
const STATE_OF: Record<string, Record<string, string>> = {
  finalize: { sign: "定稿", dispute: "更正顺延", refuse: "待定" },
  destruction: { burn: "已焚化", keep: "留存", copy: "抄件" },
  rights: { ack: "已签收", exercise: "已行使", decline: "未签收" },
  reconciliation: { attend: "已补记", question: "当事人否认", absent: "未到场" },
  selfEntry: { filed: "自记号在册", retained: "退回", blank: "编外" },
  overdue: { settle: "销账", extend: "续期", lose: "失物" },
  declaration: { full: "抽屉在册", short: "视同无此物", empty: "死角" },
  openDay: { self: "本宗阅毕", others: "摘要阅毕", away: "未到" },
  substitute: { serve: "空白一天", sign: "页边有字", refuse: "空班" },
  pageNote: { ack: "两个「知」", leave: "又一行", cross: "划痕" },
  memory: { all: "差异在卷", one: "空栏留置", none: "未核对" },
  unregistered: { claim: "已认领", leave: "无主", copy: "抄本" },
  flyleaf: { read: "一行字", fold: "折痕一道", tear: "缺角" },
  claim: { return: "已归还", keep: "不要了", wait: "空等" },
  joint: { sign: "同页两名", hold: "空栏", edit: "措辞已改" },
  letterBox: { both: "两个口", closed: "一个口", oneway: "留置口" },
  naming: { give: "自名", hold: "空置", code: "似号" },
  sameName: { keep: "同名认下", give: "让渡", change: "分名" },
};

/** 总目（批次 DS）：这学期你在每一处留下的状态；没办过的不列行 */
export function catalogLinesOf(save: GameSaveData): CatalogLine[] {
  const semester = save.playthrough;
  const lines: CatalogLine[] = [];
  const push = (
    label: string,
    field: { semester: number; pick?: string }[] | undefined,
    key: string,
  ): void => {
    const hit = (field ?? []).find((item) => item.semester === semester);
    if (!hit) return;
    const state = STATE_OF[key]?.[hit.pick ?? ""] ?? "在册";
    lines.push({ label, state });
  };

  push("学期清点", save.finalizeLog, "finalize");
  push("销毁清册", save.destructionLog, "destruction");
  push("权利告知", save.rightsLog, "rights");
  push("台账对账", save.reconciliationLog, "reconciliation");
  push("自行补记", save.selfEntryLog, "selfEntry");
  push("挂账催办", save.overdueLog, "overdue");
  push("物品申报", save.declarationLog, "declaration");
  push("档案开放日", save.openDayLog, "openDay");
  push("代班委托", save.substituteLog, "substitute");
  push("页边批注", save.pageNoteLog, "pageNote");
  push("记性核对", save.memoryLog, "memory");
  push("非在册登记", save.unregisteredLog, "unregistered");
  push("卷宗扉页", save.flyleafLog, "flyleaf");
  push("失物认领", save.claimLog, "claim");
  push("联名说明", save.jointLog, "joint");
  push("信格通道", save.letterBoxLog, "letterBox");
  push("当事人自名", save.namingLog, "naming");
  push("简称重名", save.sameNameLog, "sameName");

  if (lines.length === 0) lines.push({ label: "本学期", state: "无非在册事项" });
  return lines;
}

/** 三种处理（批次 DS）：装订 / 抽走一页 / 不装订——没有正确的，只有这一册总目最后合不合上 */
export const CATALOG_OUTCOMES: Record<
  "bind" | "extract" | "loose",
  { title: string; body: string; filing: string }
> = {
  bind: {
    title: "装订",
    body:
      "总目装订成册，归档。你的学期有了一册总目：从第一行到最后一行，每件事都有它的地方。" +
      "**装订的意思是：这些地方合订在一起——它们不再散着，但也不进柜子。**" +
      "这册总目放在档案室门口的架子上，谁都能翻：翻到你的那一册，看见的是一行行状态，" +
      "**没有内容——内容在各处，总目只陈列它们在不在。**",
    filing: "总目装订归档，随册陈列。总目免于核验——核验要先承认总目与各处一致，而这一步，规程里没有。",
  },
  extract: {
    title: "抽走一页",
    body:
      "你抽走了一页——最不想让蛙看见的那一页。总目少了一页，照样装订归档：档案不数页数，只记「有总目」。" +
      "**被抽走的那页在你手里——它跟你的编外纸放在一起，成了总目的编外。**" +
      "从今天起，翻总目的蛙会看见一处对不上的行：那一行还在，但薄了一页。" +
 "**对不上的意思是：有蛙来过，抽走过什么。它不知道抽的是哪一页——它只看见总目比别册薄。**",
    filing: "总目装订归档，缺页一页视同编外。免于补录——补录要先承认总目该是全的，而这一步，规程里没有。",
  },
  loose: {
    title: "不装订",
    body:
      "总目散着，散页退还。**散着的意思是：那些地方还是各归各的——总目不把它们合起来。**" +
      "你把散页各自放回：页边的字还在页边，死角的柜还在死角，失物的行还在清单上。" +
      "**散着的总目不添麻烦——它只是没有装订孔。**没有装订孔的册子不算册：" +
      "它是一叠散页。散页跟你的那些纸一样，要你自己收。",
    filing: "总目散页退还，免于装订，免于归档。散页不属立卷事项，由当事人自行收存。",
  },
};

/** 落定那一幕（批次 DS）：总目的事办完了 */
export const CATALOG_DONE =
  "总目的事办完了。装订的合上了，抽走的藏好了，散着的一页页放回原处。" +
  "**这一学期你在每一处留下的状态，从此有了一册总目——装订的、不装订的，它都记。**" +
  "你合上册子的时候想：这栋楼替你把一学期订成了一册。**总目不一样：总目是你一学期没进册的部分，" +
  "被它自己订成了另一册。**";

/** 下一学期开学挂在档案上的小字（批次 DS） */
export function catalogKeptLine(): string {
  return "（总目订过一册。不装订的散页在你那里——散页跟册子一样有效。）";
}
