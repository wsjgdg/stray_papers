/**
 * 奶蛙大学 · 挂档（行政宇宙 · 收口）
 * 每办完一件事，档案上就挂一行小字。小字不占编号、不进总目——
 * 但它挂着：从办完那天起，翻档案都翻得到。开新学期也还挂着。
 * 这里把全宇宙三十件事项的挂档小字收进一处，办完哪件，哪行就挂着。
 */
import type { GameSaveData } from "@/lib/gameSave";
import { successionKeptLine } from "@/data/succession";
import { misdeliveryKeptLine } from "@/data/misdelivery";
import { lostPageKeptLine } from "@/data/lostPage";
import { mergerKeptLine } from "@/data/merger";
import { transitKeptLine } from "@/data/transit";
import { bereadKeptLine } from "@/data/beread";
import { noteKeptLine } from "@/data/note";
import { shiftKeptLine } from "@/data/shiftHandover";
import { testimonyKeptLine } from "@/data/testimony";
import { finalizeKeptLine } from "@/data/finalize";
import { destructionKeptLine } from "@/data/destruction";
import { rightsKeptLine } from "@/data/rights";
import { reconciliationKeptLine } from "@/data/reconciliation";
import { selfEntryKeptLine } from "@/data/selfEntry";
import { overdueKeptLine } from "@/data/overdue";
import { declaredKeptLine } from "@/data/declaration";
import { openDayKeptLine } from "@/data/openDay";
import { substitutedKeptLine } from "@/data/substitute";
import { pageNoteKeptLine } from "@/data/pageNote";
import { memoryKeptLine } from "@/data/memory";
import { registryKeptLine } from "@/data/registry";
import { flyleafKeptLine } from "@/data/flyleaf";
import { claimedKeptLine } from "@/data/claim";
import { jointKeptLine } from "@/data/joint";
import { letterBoxKeptLine } from "@/data/letterBox";
import { namingKeptLine } from "@/data/naming";
import { sameNameKeptLine } from "@/data/sameName";
import { catalogKeptLine } from "@/data/catalog";
import { carryoverKeptLine } from "@/data/carryover";
import { blankKeptLine } from "@/data/blank";

/** 挂档上的一行小字 */
export interface KeptNote {
  /** 事项 key */
  key: string;
  /** 事项名（柜子的说法：承任 / 误投 / 留白……） */
  label: string;
  /** 学期号（记录里最后一次的那学期；没查到为 null） */
  semester: number | null;
  /** 挂档那一天（记录里最后一次的那天；没查到为 null） */
  day: number | null;
  /** 小字 */
  note: string;
}

/** 小字来源：事项 → 该办完没（日志非空）→ 那一行小字 */
const KEPT_SOURCES: {
  key: string;
  label: string;
  records: (save: GameSaveData) => unknown[];
  line: () => string;
}[] = [
  { key: "succession", label: "承任", records: (save) => save.successionLog ?? [], line: successionKeptLine },
  { key: "misdelivery", label: "误投", records: (save) => save.misdeliveryLog ?? [], line: misdeliveryKeptLine },
  { key: "lostPage", label: "补页", records: (save) => save.lostPageLog ?? [], line: lostPageKeptLine },
  { key: "merger", label: "合档", records: (save) => save.mergerLog ?? [], line: mergerKeptLine },
  { key: "transit", label: "转递", records: (save) => save.transitLog ?? [], line: transitKeptLine },
  { key: "beread", label: "被读", records: (save) => save.bereadLog ?? [], line: bereadKeptLine },
  { key: "note", label: "便条", records: (save) => save.noteLog ?? [], line: noteKeptLine },
  { key: "shift", label: "交班", records: (save) => save.shiftHandoverLog ?? [], line: shiftKeptLine },
  { key: "testimony", label: "回单", records: (save) => save.testimonyLog ?? [], line: testimonyKeptLine },
  { key: "finalize", label: "定稿", records: (save) => save.finalizeLog ?? [], line: finalizeKeptLine },
  { key: "destruction", label: "销毁", records: (save) => save.destructionLog ?? [], line: destructionKeptLine },
  { key: "rights", label: "权利", records: (save) => save.rightsLog ?? [], line: rightsKeptLine },
  { key: "reconciliation", label: "对账", records: (save) => save.reconciliationLog ?? [], line: reconciliationKeptLine },
  { key: "selfEntry", label: "自记", records: (save) => save.selfEntryLog ?? [], line: selfEntryKeptLine },
  { key: "overdue", label: "催办", records: (save) => save.overdueLog ?? [], line: overdueKeptLine },
  { key: "declaration", label: "申报", records: (save) => save.declarationLog ?? [], line: declaredKeptLine },
  { key: "openDay", label: "开放日", records: (save) => save.openDayLog ?? [], line: openDayKeptLine },
  { key: "substitute", label: "顶班", records: (save) => save.substituteLog ?? [], line: substitutedKeptLine },
  { key: "pageNote", label: "页边", records: (save) => save.pageNoteLog ?? [], line: pageNoteKeptLine },
  { key: "memory", label: "记性", records: (save) => save.memoryLog ?? [], line: memoryKeptLine },
  { key: "registry", label: "登记", records: (save) => save.unregisteredLog ?? [], line: registryKeptLine },
  { key: "flyleaf", label: "扉页", records: (save) => save.flyleafLog ?? [], line: flyleafKeptLine },
  { key: "claim", label: "认领", records: (save) => save.claimLog ?? [], line: claimedKeptLine },
  { key: "joint", label: "联名", records: (save) => save.jointLog ?? [], line: jointKeptLine },
  { key: "letterBox", label: "互通", records: (save) => save.letterBoxLog ?? [], line: letterBoxKeptLine },
  { key: "naming", label: "命名", records: (save) => save.namingLog ?? [], line: namingKeptLine },
  { key: "sameName", label: "同名", records: (save) => save.sameNameLog ?? [], line: sameNameKeptLine },
  { key: "catalog", label: "总目", records: (save) => save.catalogLog ?? [], line: catalogKeptLine },
  { key: "carryover", label: "结转", records: (save) => save.carryoverLog ?? [], line: carryoverKeptLine },
  { key: "blank", label: "留白", records: (save) => save.blankLog ?? [], line: blankKeptLine },
  /* 天气夜戏（批次 CY-100）：遇见过就挂着——已看清单跨周目保留，伞和雾的事一挂就是一辈子 */
  {
    key: "nightRain",
    label: "雨伞",
    records: (save) => ((save.seenNightEvents ?? []).includes("night-rain-door") ? ["seen"] : []),
    line: () =>
      "失物招领箱第三格，伞的去向一栏改成了：借出。淋过同一檐雨的那只蛙，替它记着这笔账。",
  },
  {
    key: "nightFog",
    label: "雾气",
    records: (save) => ((save.seenNightEvents ?? []).includes("night-fog-figure") ? ["seen"] : []),
    line: () =>
      "楼梯口的走廊灯一到雾天就常亮。雾里没说破的那半句话，有人替它收着。楼梯口那三十级，从此不算白走。",
  },
  {
    key: "nightTrio",
    label: "三夜",
    records: (save) =>
      ["night-rain-door", "night-fog-figure", "night-cloudy-gray"].every((id) =>
        (save.seenNightEvents ?? []).includes(id),
      )
        ? ["seen"]
        : [],
    line: () =>
      "伞、雾、阴天，三个晚上都遇齐了。巡逻台账最后一页的事由栏，从这晚起有了第一个被用上的词。",
  },
  {
    key: "nightFinal",
    label: "五夜",
    records: (save) =>
      [
        "night-rain-door",
        "night-rain-thunder",
        "night-fog-figure",
        "night-cloudy-gray",
        "night-sunny-moon",
        "night-weather-patrol",
      ].every((id) => (save.seenNightEvents ?? []).includes(id))
        ? ["seen"]
        : [],
    line: () =>
      "伞、雷、雾、阴天、月亮——五个晚上全部遇齐。校门口天快亮的那层光底下，有一条不用转发通知。",
  },
];

/** 挂档：把办完的事一行一行挂出来（批次日志跨周目保留——新学期开学，它们还挂着；按最近一次挂档时间倒序，没查到日期的靠后） */
export function keptNotesOf(save: GameSaveData): KeptNote[] {
  const notes: KeptNote[] = [];
  for (const source of KEPT_SOURCES) {
    const records = source.records(save);
    if (!Array.isArray(records) || records.length === 0) continue;
    const last = records[records.length - 1] as { semester?: unknown; day?: unknown } | undefined;
    const semester = last && typeof last.semester === "number" ? last.semester : null;
    const day = last && typeof last.day === "number" ? last.day : null;
    notes.push({ key: source.key, label: source.label, semester, day, note: source.line() });
  }
  return notes.sort((a, b) => {
    if (a.semester === null && b.semester === null) return 0;
    if (a.semester === null) return 1;
    if (b.semester === null) return -1;
    if (b.semester !== a.semester) return b.semester - a.semester;
    if (a.day === null && b.day === null) return 0;
    if (a.day === null) return 1;
    if (b.day === null) return -1;
    return b.day - a.day;
  });
}
