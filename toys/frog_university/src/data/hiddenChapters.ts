/**
 * 奶蛙大学 · 异常卷宗分章（打磨）
 * 柜子里一百三十来格不再摊在同一片：按柜子自己的说法分章——
 * 章名是这栋楼的腔调，章内保持原来的次序；没收录进去的归入「未编目」。
 * ids 里的全名精确收录；以「-」结尾的按前缀收录（一个批次三格同章）。
 */
export interface HiddenChapterSpec {
  /** 章 key */
  key: string;
  /** 章名 */
  label: string;
  /** 章首一句（柜子腔） */
  note: string;
  /** 本章包含的格子 */
  ids: string[];
}

export const HIDDEN_CHAPTERS: HiddenChapterSpec[] = [
  {
    key: "system",
    label: "柜子自己查出来的",
    note: "它们是系统自己查出来的——查出来之后，柜子没有把它们放回去。",
    ids: [
      "secret-tamper",
      "secret-torn",
      "secret-repeat",
      "secret-erased",
      "secret-carried",
      "secret-reset",
      "secret-hybrid",
      "secret-early",
    ],
  },
  {
    key: "dossier",
    label: "别人的档案",
    note: "不是好感度解锁的资料——是这只蛙自己写的、或者别人写的、关于它自己的东西。",
    ids: ["secret-transfer", "secret-restored", "secret-unsubmitted", "secret-backside", "secret-unstamped", "secret-explained"],
  },
  {
    key: "reports",
    label: "你交出去的",
    note: "你写下的每一份都照收。收下之后，它们按自己的方式流转。",
    ids: ["secret-signed", "secret-passed"],
  },
  {
    key: "network",
    label: "关系与没有名字的地方",
    note: "加入是绑定，站队是关闭——这两件事都不随学期清。而有的门在走廊尽头。",
    ids: ["secret-inside", "secret-outside", "secret-corrected", "secret-evaded", "secret-drafted", "secret-informal"],
  },
  {
    key: "gone",
    label: "离开与消失",
    note: "有些事会从档案里消失。消失不是没发生，是换了一种在。",
    ids: [
      "secret-absent",
      "secret-vanished",
      "secret-refiled",
      "secret-unbound",
      "secret-pressing",
      "secret-abscond-settle",
      "secret-abscond-promise",
      "secret-abscond-claim",
    ],
  },
  {
    key: "finished",
    label: "档案比蛙先毕业",
    note: "日期还没到，卷已经结了。它还在第三排。",
    ids: ["secret-annotated", "secret-untouched", "secret-noted"],
  },
  {
    key: "review",
    label: "批阅与安静",
    note: "每一行批语都是它写的。安静也是会传染的。",
    ids: [
      "secret-recorder-note",
      "secret-recorder-wait",
      "secret-recorder-still",
      "secret-quiet-start",
      "secret-quiet-spoon",
      "secret-quiet-deny",
    ],
  },
  {
    key: "naming",
    label: "名字",
    note: "有名字的才好被处理——名字是你填的。",
    ids: ["secret-named", "secret-unnamed"],
  },
  {
    key: "lifecycle",
    label: "纸的生命周期",
    note: "从一张交接单到焚化门——一张纸的一生，都在流程里。",
    ids: [
      "secret-shift-",
      "secret-testimony-",
      "secret-succession-",
      "secret-misdelivery-",
      "secret-lostpage-",
      "secret-merger-",
      "secret-transit-",
      "secret-beread-",
      "secret-note-",
      "secret-finalize-",
      "secret-destruction-",
    ],
  },
  {
    key: "rights",
    label: "权利与账目",
    note: "这栋楼第一次告诉你：你有什么。以及它自己知道它可能记错。",
    ids: ["secret-rights-", "secret-reconciliation-", "secret-selfentry-", "secret-overdue-"],
  },
  {
    key: "declared",
    label: "申报与开放日",
    note: "你说什么，它们记什么。这一天秘密换了主人。",
    ids: ["secret-declaration-", "secret-open-day-"],
  },
  {
    key: "beyond",
    label: "规程之外",
    note: "顶过班、回过页边、核过记性、登过记——规程管不到的地方，也是规程里写着的。",
    ids: ["secret-substitute-", "secret-page-note-", "secret-memory-", "secret-unregistered-", "secret-flyleaf-", "secret-claim-"],
  },
  {
    key: "two-frogs",
    label: "两蛙与语言",
    note: "两个名字落在同一页上。它记名字，意思在蛙这里。",
    ids: ["secret-joint-", "secret-letterbox-", "secret-naming-", "secret-same-name-", "secret-two-nights"],
  },
  {
    key: "closing",
    label: "收口",
    note: "总目、移交、留白——这一学期你留下的地方。",
    ids: ["secret-catalog-", "secret-carryover-", "secret-blank-"],
  },
  {
    key: "uncataloged",
    label: "未编目",
    note: "没有编号的一份。柜子没把它放回去，也没办法把它收进来。",
    ids: ["secret-uncataloged"],
  },
];

/** 一格归哪一章（按声明顺序取第一个命中；全都没中归「未编目」） */
export function hiddenChapterOf(id: string): string {
  for (const chapter of HIDDEN_CHAPTERS) {
    for (const pattern of chapter.ids) {
      if (pattern.endsWith("-") ? id.startsWith(pattern) : id === pattern) return chapter.key;
    }
  }
  return "uncataloged";
}
