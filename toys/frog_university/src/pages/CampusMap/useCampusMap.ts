/**
 * 校园地图大厅 Logic 层：读存档 → 建筑角标状态 → 选中剧情线 → 跳对话页
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
/* 地图页瘦身（批次 CY-108）：静态只依赖轻量的 storylinesMeta（线目录/建筑表）；
   全部剧本正文（STORY_SCRIPTS，421K）改为挂载后动态加载——角标计数等就绪再显示，
   进线探测在点击时按需取。首屏不再背着十条线正文。 */
import {
  ALL_LINE_IDS,
  BUILDINGS,
  REGULAR_LINE_IDS,
  storylineByBuilding,
  type BuildingId,
  type StorylineId,
  type StorylineMeta,
} from "@/data/storylinesMeta";
import type { StoryScript } from "@/data/storylines";
import {
  addAttention,
  addSilence,
  addTruth,
  applyThemeToDocument,
  attendClass,
  countCompletedLines,
  clearMoltEcho,
  croakChorusReady,
  getAttention,
  getLockedRoute,
  getPlayedCommonDays,
  lineLockHintOf,
  lineState,
  getPlaythrough,
  graduateEarly,
  loadGameSave,
  loadTheme,
  lockRoute,
  markArchiveClaimPlayed,
  markCommonDayPlayed,
  markDossierEchoed,
  markDayEventSeen,
  markCroakPlayed,
  markHybridEchoed,
  markLineVisited,
  addAffinity,
  markNightEventSeen,
  markSideStorySeen,
  hasSeenSideStory,
  markBroadcastPlayed,
  markNoticePosted,
  answerRollcall,
  missRollcall,
  markSurrogateSeen,
  signPackage,
  replacePackage,
  markPostedSeen,
  recordVisitSkip,
  substituteFor,
  applySwap,
  applyAbsenceDecay,
  packageDayOf,
  postedDayOf,
  packageItemOf,
  postedDocOf,
  markHolidayPlayed,
  markInventoryDone,
  markOfficeSeen,
  alignDayOf,
  auditDayOf,
  auditDossiersOf,
  baselineDayOf,
  markAlign,
  markBaseline,
  markVolume,
  volumeDayOf,
  isLakeUnlocked,
  markOrientation,
  orientationDayOf,
  markRegister,
  budgetDayOf,
  closestFrogOf,
  handoverDayOf,
  markAudit,
  markMeetingList,
  markMeetingRecorder,
  markHandover,
  markMentoring,
  markRecusalSeen,
  markWindowOffice,
  markSilenceBudget,
  markInspection,
  markDoorDuty,
  markDossierRead,
  markExplainFiling,
  doorDutyDayOf,
  inspectionDayOf,
  inspectorOf,
  serverOf,
  meetingDayOf,
  meetingRosterOf,
  mentorOf,
  mentorDayOf,
  pendingHandoverOf,
  recusalOf,
  recorderDayOf,
  windowDayOf,
  windowRequestsOf,
  holidayDayOf,
  inventoryDayOf,
  officeDayOf,
  consumeZeroPending,
  type PackageItem,
  type PostedDoc,
  type MeetingRoster,
  type PendingHandover,
  addReputation,
  carryDossier,
  lendSilence,
  skipClass,
  spendSilence,
  recordAbsence,
  recordDenial,
  recordTamper,
  repaySilence,
  resetAttention,
  markTutorialSeen,
  persistGameSave,
  persistTheme,
  totalEndingCount,
  explainMinuteOf,
  broadcastDayOf,
  rollcallDaysOf,
  broadcastTruthOf,
  EARLY_CEREMONY_FLAG,
  type GameSaveData,
  type LineState,
  type ThemeId,
  signOffItemsOf,
  markSignOff,
  markSignOffSeen,
  type SignOffItem,
  sealColorOf,
  markSeal,
  markSealSeen,
  hasPlayerReportThisSemester,
  markPlayerReport,
  markNightDaySpent,
  type PlayerReport,
  factionActionDayOf,
  factionActedThisSemesterOf,
  factionJoinedSemesterOf,
  factionSplitSideOf,
  factionSplitDueOf,
  markFactionAction,
  joinFaction,
  watchFaction,
  splitFaction,
  courierDayOf,
  courierSentThisSemesterOf,
  courierFactOf,
  markCourier,
  type CourierFact,
  departureDayOf,
  departurePickOf,
  departureThisSemesterOf,
  markDeparture,
  respondDeparture,
  vanishDayOf,
  vanishPickOf,
  vanishThisSemesterOf,
  vanishedTextsOf,
  markVanish,
  respondVanish,
  finishedDayOf,
  finishedThisSemesterOf,
  markFinished,
  respondFinished,
  finishedNoteOf,
  recorderFindDayOf,
  recorderThisSemesterOf,
  markRecorder,
  respondRecorder,
  quietingThisSemesterOf,
  markQuieting,
  respondQuieting,
  shiftHandoverThisSemesterOf,
  shiftItemsOf,
  markShiftHandover,
  respondShiftHandover,
  latestRespondedShiftOf,
  testimonyThisSemesterOf,
  markTestimony,
  respondTestimony,
  successionThisSemesterOf,
  hasShiftRecordOf,
  markSuccession,
  respondSuccession,
  misdeliveryThisSemesterOf,
  markMisdelivery,
  respondMisdelivery,
  lostPageThisSemesterOf,
  markLostPage,
  respondLostPage,
  mergerThisSemesterOf,
  markMerger,
  respondMerger,
  transitThisSemesterOf,
  markTransit,
  respondTransit,
  bereadThisSemesterOf,
  markBeread,
  respondBeread,
  noteThisSemesterOf,
  hasBereadOf,
  markNote,
  respondNote,
  finalizeThisSemesterOf,
  markFinalize,
  respondFinalize,  destructionThisSemesterOf,
  markDestruction,
  respondDestruction,  rightsThisSemesterOf,
  markRights,
  respondRights,  reconciliationThisSemesterOf,
  markReconciliation,
  respondReconciliation,  selfEntryThisSemesterOf,
  markSelfEntry,
  respondSelfEntry,  overdueThisSemesterOf,
  markOverdue,
  respondOverdue,  declarationThisSemesterOf,
  markDeclaration,
  respondDeclaration,  openDayThisSemesterOf,
  markOpenDay,
  respondOpenDay,  substituteThisSemesterOf,
  markSubstitute,
  respondSubstitute,  pageNoteThisSemesterOf,
  markPageNote,
  respondPageNote,  memoryThisSemesterOf,
  markMemory,
  respondMemory,  unregisteredThisSemesterOf,
  markUnregistered,
  respondUnregistered,  flyleafThisSemesterOf,
  markFlyleaf,
  respondFlyleaf,  claimThisSemesterOf,
  markClaim,
  respondClaim,  jointThisSemesterOf,
  markJoint,
  respondJoint,  letterBoxThisSemesterOf,
  markLetterBox,
  respondLetterBox,  namingThisSemesterOf,
  markNaming,
  respondNaming,  sameNameThisSemesterOf,
  markSameName,
  respondSameName,  catalogThisSemesterOf,
  markCatalog,
  respondCatalog,  carryoverThisSemesterOf,
  markCarryover,
  respondCarryover,  blankThisSemesterOf,
  markBlank,
  respondBlank,
  isUndergroundActive,
  joinUnderground,
  markUndergroundMet,
  markUndergroundClosedSeen,
  logUndergroundJob,
  undergroundFavorOf,
  hasUndergroundActThisSemester,
  recordUndergroundFavor,
  recordUndergroundRefusal,
  exposeUnderground,
  undergroundRiskDayOf,
  undergroundJobTextOf,
  involuntaryHibernate,
  consumeHibernateWake,
  shedSkinNow,
  consumeMoltPending,
  saveLineAct,
} from "@/lib/gameSave";
import {
  WEATHER_BIAS_HINT,
  WEATHER_META,
  dayOfDoneCount,
  daysToExam,
  isFinalWeek,
  FINAL_WEEK_FROM,
  seedRandom,
  seededOrder,
  weatherBiasOf,
  weatherForDay,
  type WeatherMeta,
} from "@/lib/calendar";
import { buildClassSchedule, todaySlotOf, type ClassKind } from "@/lib/schedule";
import type { AwayRecord } from "@/lib/gameSave";
import { bulletinForDay } from "@/data/campusBulletin";
import {
  FINAL_NIGHT_EVENTS,
  NIGHT_EVENTS,
  NIGHT_TALK_EVENT,
  NIGHT_ARCHIVE_EVENT,
  DISCOVERY_NIGHT_EVENTS,
  REPORT_NIGHT_EVENTS,
  UNDERGROUND_NIGHT_EVENT,
  RAIN_NIGHT_EVENT,
  FOG_NIGHT_EVENT,
  CLOUDY_NIGHT_EVENT,
  SUNNY_NIGHT_EVENT,
  THUNDER_NIGHT_EVENT,
  WEATHER_PATROL_EVENT,
  FIVE_NIGHT_EVENT,
  type NightChoice,
  type NightEvent,
  type NightNode,
} from "@/data/nightEvents";
import { DOSSIER_LINE_OF, privateDossierOfFrog } from "@/data/privateDossiers";
import { type ReportClaim } from "@/data/playerReports";
import { FACTIONS, FACTION_LINES, factionById } from "@/data/factions";
import { courierScriptOf, type CourierScript } from "@/data/couriers";
import { FROG_LINE, departureMetaOf } from "@/data/departures";
import { vanishSpeakerOf } from "@/data/vanishes";
import { type ShiftResponse } from "@/data/testimony";
import { type SuccessionCandidate } from "@/data/succession";
import { type MergerCounterpart } from "@/data/merger";
import {
  UNDERGROUND_CLOSED_NODES,
  UNDERGROUND_JOB_NODES,
  UNDERGROUND_RECRUIT_NODES,
} from "@/data/underground";
import { DAY_EVENTS, type DayChoice, type DayEvent } from "@/data/dayEvents";
import {
  COMMON_DATE_SCENES,
  GATE_DAY,
  ROUTE_BUILDINGS,
  ROUTE_NEAR_HINTS,
  ROUTE_REACTIONS,
  type CommonDateNode,
  type CommonDateScene,
  type DateChoice,
  type RouteFrogId,
} from "@/data/commonRoute";
import { FROG_CHARACTERS, type FrogCharacterId } from "@/data/characters";
import { expressionForSilence, type FrogExpression } from "@/components/frog/Frog";
import type { LedgerDeskKind } from "@/components/campus-map/LedgerDeskOverlay";
import type { HandoverItem } from "@/components/campus-map/HandoverOverlay";
import { seedCodeOf } from "@/lib/seedCode";
import {
  TRUE_FRIEND_THRESHOLD,
  affinityRows,
  type AffinityRow,
} from "@/lib/affinity";
import { impressionPercent, impressionTierOf, truthJarReport } from "@/lib/impression";
import { unlockAchievement } from "@/lib/achievements";
import { sideStoryTotal } from "@/data/sideStories";
import { isSoundOn, playSfx, playSe, setSoundOn, startRainAmbience, stopRainAmbience, startWindAmbience, stopWindAmbience, startSunnyAmbience, stopSunnyAmbience } from "@/lib/audio";
import { isBgmOn, playBgm, releaseBgmHandoff, setBgmOn, type BgmTrackId } from "@/lib/bgm";
import { stageTrackOf } from "@/lib/bgmMapping";

export interface BuildingTile {
  building: (typeof BUILDINGS)[number];
  line?: StorylineMeta;
  state: LineState;
  /** 锁定原因（批次 T）：可进的线为 null */
  lockHint?: string | null;
  /** 剧情线结局完成度（批次 CY-33）：被撕掉的页不计，口径与结局图鉴一致 */
  lineProgress?: { collected: number; total: number } | null;
}

/** 深夜入口三态：今晚有事件 / 当日已触发（收起）/ 全部看完（置灰） */
export type NightSpotState = "ready" | "hidden" | "done";

/** 深夜事件播放阶段：节点推进 → 抉择 → 落定 */
export type NightPhase = "nodes" | "choice" | "aftermath";

/* ---------- 共通日程（批次 C1）：里程碑 / 认定表 ---------- */

/** 日程入口态：待看（day ≤ 当前天数且未播） / 已读 */
export type DateEntryState = "due" | "read";

export interface DateEntry {
  scene: CommonDateScene;
  state: DateEntryState;
}

/** 日程播放阶段：与深夜事件同一套骨架 */
export type DatePhase = "nodes" | "choice" | "aftermath";

/** 认定表阶段：选项 → 二次确认 → 接播反应 → 收尾；null = 不在认定流程 */
export type GateStage = "table" | "confirm" | "reactions" | "done";

/* ---------- 被记录的社会面（批次 AJ）：借沉默（带利息）/ 替人背档案 ---------- */

/** 沉默出借的本金：借 3 还 4——多出来的 1 点是利息（沉默是会生息的） */
const LOAN_PRINCIPAL = 3;

export interface RoutePickOption {
  /** 要写进档案的蛙；null = 「先不填，再看看」 */
  frogId: RouteFrogId | null;
  text: string;
  hint: string;
}

/** 取「day ≤ 当前天数且未播放」的最早里程碑（挂载自动弹出用，一次只弹一个） */
function dueCommonSceneOf(save: GameSaveData): CommonDateScene | null {
  const currentDay = dayOfDoneCount(countCompletedLines(save));
  const played = getPlayedCommonDays(save);
  for (const scene of COMMON_DATE_SCENES) {
    if (scene.day <= currentDay && !played.includes(scene.day)) return scene;
  }
  return null;
}

/* ---------- 白日小事件「校园角落」（批次 I）：每局差异层 ---------- */

/** 白日小事件触发窗口：第 2-7 天才可能出（开学第一天与期末周不出） */
const DAY_EVENT_WINDOW: [number, number] = [2, 7];

/**
 * 取当日可能自动弹出的白日小事件（挂载用，与 dueCommonSceneOf 同一机制位）：
 * 窗口 2-7 天 / 每天最多一个（lastDayEventDay 兜底）/ 按 seededOrder(DAY_EVENTS, weatherSeed)
 * 洗牌后取第一个未看的——每局洗牌、同一局顺序恒定；已看记录跨周目保留。
 */
function dueDayEventOf(save: GameSaveData): DayEvent | null {
  const currentDay = dayOfDoneCount(countCompletedLines(save));
  if (currentDay < DAY_EVENT_WINDOW[0] || currentDay > DAY_EVENT_WINDOW[1]) return null;
  if (save.lastDayEventDay >= currentDay) return null;
  const seen = new Set(save.seenDayEvents);
  return seededOrder(DAY_EVENTS, save.weatherSeed).find((item) => !seen.has(item.id)) ?? null;
}

/**
 * 地下组织（批次 CD）：三种形态——招募 / 托付 / 断联，节点按存档现拼（照《约谈》的拼法）。
 * 招募：走廊尽头那扇没上锁的门；托付：帮哪只、办哪件由种子定；断联：被看见的名字不能再用。
 */
function undergroundEventFor(save: GameSaveData, base: NightEvent): NightEvent {
  if (save.undergroundExposed) {
    return {
      ...base,
      title: "不再联系",
      nodes: UNDERGROUND_CLOSED_NODES.map((text, index) => ({
        id: `night-underground-c${index + 1}`,
        speakerId: "narration" as const,
        text,
      })),
      choices: [{ id: "night-underground-close", text: "记下。", silenceDelta: 0 }],
    };
  }
  if (save.undergroundJoined === true) {
    const favor = undergroundFavorOf(save, save.weatherSeed);
    const frogName = FROG_CHARACTERS[favor.frogId]?.displayName ?? "在册的一只";
    return {
      ...base,
      title: "还是那扇门",
      nodes: UNDERGROUND_JOB_NODES.map((text, index) => ({
        id: `night-underground-j${index + 1}`,
        speakerId: "narration" as const,
        text,
      })),
      choices: [{ id: "night-underground-hear", text: "听它们说完。", silenceDelta: 0 }],
      hint: `${frogName}的事，它们今晚要办。`,
    };
  }
  return {
    ...base,
    nodes: UNDERGROUND_RECRUIT_NODES.map((text, index) => ({
      id: `night-underground-r${index + 1}`,
      speakerId: "narration" as const,
      text,
    })),
    choices: [
      { id: "night-underground-join", text: "坐下。", silenceDelta: 0 },
      { id: "night-underground-leave", text: "离开。什么都没看见。", silenceDelta: 1 },
    ],
  };
}

/** 档案认领（批次 AA）：周目 ≥ 2 且上一学期档案有玩家自己补的那句——
 *  这学期被当值的蛙照着念出来。引用节点的语义是「档案在替你说话」；
 *  玩家写什么都成立（档案腔照抄，不评判），只收前 40 字、不进数值。 */
/** 旧结局渗入（批次 AB·档案柜会认领）：开学期派生认领的那份旧卷宗——
 *  不属于本学期，但柜子把它放回来了。纯叙事零数值；每学期只渗一次。 */
function archiveClaimNode(fresh: GameSaveData): NightNode | null {
  const claimed = fresh.archiveClaimed;
  const title = fresh.archiveClaimTitle;
  if (!claimed || !title) return null;
  return {
    id: `archive-claim-${claimed}`,
    speakerId: "narration",
    text: `本学期的柜子里，混进了一份不属于它的卷宗：《${title}》。柜子没记这次放回——它不在任何清单上。但它在你面前。`,
  };
}

function claimedNoteNode(fresh: GameSaveData): NightNode & { remember: true } | null {
  const current = fresh.playthrough ?? 1;
  if (current < 2) return null;
  const note = (fresh.dossiers ?? [])
    .filter((item) => item.playthrough < current)
    .sort((a, b) => b.playthrough - a.playthrough)[0]?.playerNote;
  if (!note || note.trim().length === 0) return null;
  const quoted = note.trim().slice(0, 40);
  return {
    id: `dossier-claimed-${current}`,
    speakerId: "narration",
    text: `上一学期，你在这页档案的空白处补过一句——「${quoted}」。备注栏没给它留格子。这一学期，它被抄进来了。`,
    remember: true,
  };
}

/** 穿回旧皮的回响（批次 AH）：蜕下的皮被穿回来了——剧情会认出你。
 *  纯叙事零数值，播一次即清（clearMoltEcho 由 buildNightPlus 调用，防止重复渗出）。 */
function moltEchoNode(fresh: GameSaveData): NightNode | null {
  if (!fresh.moltEchoPending) return null;
  return {
    id: `molt-echo-${fresh.playthrough ?? 1}`,
    speakerId: "narration",
    text: "……你不是已经蜕过了吗？（没人回答。档案柜最里面，那层旧皮此刻是空的——它认得你，也认得出那间空出来的位置。）",
  };
}

/** 全员共鸣（批次 AH）：「声音」攒满二十——全校园的蛙同时鸣叫（纯叙事零数值，全档一次）。
 *  档案的处理方式是把那一声共鸣登记成「设备检测」：它收得下声音，收不下理由。 */
function croakChorusNode(): NightNode {
  return {
    id: "croak-chorus-once",
    speakerId: "narration",
    text: "这一夜，全校园的蛙同时鸣叫了。没有日程表，没有理由栏。声音里的东西不肯写进档案——档案只登记了一句：设备检测，正常。",
  };
}

/** 混种回响（批次 AM）：这一局的种子是混出来的——开学报表的局号栏比别人的长（纯叙事零数值，每学期一次） */
function hybridEchoNode(fresh: GameSaveData): NightNode | null {
  const parents = fresh.seedParents;
  if (!parents) return null;
  return {
    id: `hybrid-echo-${fresh.playthrough ?? 1}`,
    speakerId: "narration",
    text: `（开学报表的局号栏比别人的长：父本 ${seedCodeOf(parents[0])}，母本 ${seedCodeOf(parents[1])}，混成 ${seedCodeOf(fresh.weatherSeed)}。第四行空着——那一栏的名字叫原种。混出来的东西没有原种：它的原种是它自己。）`,
  };
}

export function useCampusMap() {
  const navigate = useNavigate();
  const [save, setSave] = useState<GameSaveData>(() => loadGameSave());
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => loadTheme());
  const [hoverBuilding, setHoverBuilding] = useState<BuildingId | null>(null);
  const [selectedLine, setSelectedLine] = useState<StorylineMeta | null>(null);
  /** 锁定原因（批次 T）：详情卡与开始按钮共用这行提示 */
  const selectedLockHint = useMemo(
    () => (selectedLine ? lineLockHintOf(save, selectedLine.id) : null),
    [selectedLine, save],
  );
  const [affinityOpen, setAffinityOpen] = useState(false);
  /* 地图页瘦身（批次 CY-108）：剧本正文懒载——null=还没到，就绪后角标计数才显示 */
  const [lazyScripts, setLazyScripts] = useState<Partial<Record<StorylineId, StoryScript>> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("@/data/storylines").then((mod) => {
      if (!cancelled) setLazyScripts(mod.STORY_SCRIPTS);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  /* ---------- 角色番外（番外篇批次）：树洞档（55%）解锁，好感名册里点开 ----------
     批次 CY-123：sideStoryId 仅专属番外（真心蛙友档）传入；树洞档那集按蛙取件，口径不变 */
  const [sideStoryFrog, setSideStoryFrog] = useState<FrogCharacterId | null>(null);
  const [sideStoryId, setSideStoryId] = useState<string | null>(null);
  /* ---------- 校园日历：深夜事件播放 ---------- */
  const [nightActive, setNightActive] = useState<NightEvent | null>(null);
  const [nightPhase, setNightPhase] = useState<NightPhase>("nodes");
  const [nightNodeIndex, setNightNodeIndex] = useState(0);
  const [nightPicked, setNightPicked] = useState<NightChoice | null>(null);
  /* 黄昏远钟（批次 CY-27）：白天滑进深夜的那一下，钟从校园深处飘来一声——
     只有「开进夜里」这个瞬间响，进图时已在夜里不补响（那是刚才已经响过的那一声） */
  const prevNightOpenRef = useRef(nightActive !== null);
  useEffect(() => {
    const nowNight = nightActive !== null;
    if (nowNight && !prevNightOpenRef.current) playSfx("bell-far");
    prevNightOpenRef.current = nowNight;
  }, [nightActive]);
  /* ---------- 私档（批次 BV）：选「翻开」后弹出的文书全屏层 ---------- */
  const [dossierFrog, setDossierFrog] = useState<FrogCharacterId | null>(null);
  /* ---------- 补录（批次 BW）：私档被翻过后制度递来的那份《情况说明》 ---------- */
  const [explainOpen, setExplainOpen] = useState(false);
  /* ---------- 会签（批次 BX）：说明流转到各部门——每个部门加自己的评语 ---------- */
  const [signOffOpen, setSignOffOpen] = useState(false);
  /* ---------- 归档（批次 BY）：说明装订成卷——封卷、铅封、编号、入柜 ---------- */
  const [sealOpen, setSealOpen] = useState(false);
  /* ---------- 撰写（批次 BZ）：空白档案页——你第一次从被记录的人，变成记录别人的人 ---------- */
  const [reportOpen, setReportOpen] = useState(false);
  /* ---------- 团体（批次 CA）：关系网——它们自己动 / 它们自己裂 ---------- */
  const [factionActionId, setFactionActionId] = useState<string | null>(null);
  const [factionSplitId, setFactionSplitId] = useState<string | null>(null);
  /* ---------- 递件（批次 CB）：团体要你办的第一件事——替它递一份写你的表 ---------- */
  const [courierFactionId, setCourierFactionId] = useState<string | null>(null);
  const [courierFactState, setCourierFactState] = useState<CourierFact | null>(null);
  /* ---------- 离校（批次 CC）：某个角色突然不在了——没有预告，没有告别 ---------- */
  const [departureFrogId, setDepartureFrogId] = useState<FrogCharacterId | null>(null);
  const [departureOtherName, setDepartureOtherName] = useState("");
  /* ---------- 消迹（批次 CF）：你说过的一句真话，从档案里没了——计数还在，内容没了 ---------- */
  const [vanishText, setVanishText] = useState<string | null>(null);
  const [vanishSpeakerName, setVanishSpeakerName] = useState("");
  /* ---------- 已结（批次 CG）：那份提前归好的卷——它还在上课 ---------- */
  const [finishedOpen, setFinishedOpen] = useState(false);
  /* ---------- 批阅者（批次 CL）：记录员 014——它知道你的一切，你知道它的编号 ---------- */
  const [recorderOpen, setRecorderOpen] = useState(false);
  /* ---------- 传染（批次 CM）：你成了开头的那一只 ---------- */
  const [quietingOpen, setQuietingOpen] = useState(false);
  /* ---------- 交班（批次 CP）：你不是毕业生，你是经办人 ---------- */
  const [shiftOpen, setShiftOpen] = useState(false);
  /* ---------- 回单（批次 CQ）：你签过的单子，回来了 ---------- */
  const [testimonyOpen, setTestimonyOpen] = useState(false);
  const [testimonyAbout, setTestimonyAbout] = useState<ShiftResponse>("sign");
  /* ---------- 接任（批次 CR）：接办人那一栏，归你管了 ---------- */
  const [successionOpen, setSuccessionOpen] = useState(false);
  /* ---------- 误投（批次 CS）：这张纸上写什么，取决于投递的那半秒 ---------- */
  const [misdeliveryOpen, setMisdeliveryOpen] = useState(false);
  /* ---------- 补页（批次 CT）：档案也会丢东西。丢了之后，它来找你 ---------- */
  const [lostPageOpen, setLostPageOpen] = useState(false);
  /* ---------- 合档（批次 CV）：一宗，两个名字 ---------- */
  const [mergerOpen, setMergerOpen] = useState(false);
  /* ---------- 转递（批次 CW）：你的纸出过一次门 ---------- */
  const [transitOpen, setTransitOpen] = useState(false);
  /* ---------- 被读（批次 CY）：有人读了你的档案 ---------- */
  const [bereadOpen, setBereadOpen] = useState(false);
  /* ---------- 便条（批次 CZ）：一张没编号的纸 ---------- */
  const [noteOpen, setNoteOpen] = useState(false);
  /* ---------- 定稿（批次 DA）：签了字，这一学期就是定稿 ---------- */
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [destructionOpen, setDestructionOpen] = useState(false);
  const [rightsOpen, setRightsOpen] = useState(false);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [selfEntryOpen, setSelfEntryOpen] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [declarationOpen, setDeclarationOpen] = useState(false);
  const [openDayOpen, setOpenDayOpen] = useState(false);
  const [substituteOpen, setSubstituteOpen] = useState(false);
  const [pageNoteOpen, setPageNoteOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [unregisteredOpen, setUnregisteredOpen] = useState(false);
  const [flyleafOpen, setFlyleafOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [jointOpen, setJointOpen] = useState(false);
  const [letterBoxOpen, setLetterBoxOpen] = useState(false);
  const [namingOpen, setNamingOpen] = useState(false);
  const [sameNameOpen, setSameNameOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [carryoverOpen, setCarryoverOpen] = useState(false);
  const [blankOpen, setBlankOpen] = useState(false);
  /* 上一学期也很安静（开学就还在安静）：从学期档案快照派生 */
  /* 合档（批次 CV）：重号的另一只——名册上离你的名字不超过三页的陌生蛙（种子派生） */
  const mergerCounterpart = useMemo<MergerCounterpart>(() => {
    const pool = (Object.values(FROG_CHARACTERS) as { id: FrogCharacterId; displayName: string }[]).filter(
      (item) => item.id !== "naiBai",
    );
    const hit = pool[Math.floor(seedRandom((Math.round(save.weatherSeed) % 1000000) * 1499 + 311) * pool.length) % pool.length];
    return {
      name: hit?.displayName ?? "名册另一页那只",
      note: "与学号 036 共用一个局号。",
    };
  }, [save.weatherSeed]);

  /* 接任（批次 CR）：行政楼门口打盹的那只——填名时把它的名字写进接办人栏（种子派生，每学期可能换） */
  const successionCandidate = useMemo<SuccessionCandidate>(() => {
    const pool = (Object.values(FROG_CHARACTERS) as { id: FrogCharacterId; displayName: string }[]).filter(
      (item) => item.id !== "naiBai",
    );
    const hit = pool[Math.floor(seedRandom((Math.round(save.weatherSeed) % 1000000) * 1391 + 269) * pool.length) % pool.length];
    return {
      name: hit?.displayName ?? "窗台那只",
      note: "它常在行政楼门口打盹——打盹也是轮值的一部分。",
    };
  }, [save.weatherSeed]);

  const quietCarried = useMemo<boolean>(() => {
    const prev = save.playthrough - 1;
    const snap = (save.dossiers ?? []).find((item) => item.playthrough === prev);
    return Boolean(snap && snap.silenceValue >= 8);
  }, [save]);
  /* ---------- 地下组织（批次 CD）：没有名字的门——加入之后你的选择都是双面的 ---------- */
  const [undergroundMode, setUndergroundMode] = useState<null | "join" | "job" | "expose">(null);
  /* ---------- 本能（批次 CE）：发作中的那一种——睡去 / 醒来 / 蜕皮 ---------- */
  const [instinctMode, setInstinctMode] = useState<null | "sleep" | "wake" | "molt">(null);
  const [missedItems, setMissedItems] = useState<string[]>([]);
  const [moltNoteState, setMoltNoteState] = useState("");
  /* ---------- 共通日程（批次 C1）：里程碑播放 + 路线认定 ---------- */
  const [dateActive, setDateActive] = useState<CommonDateScene | null>(null);
  /** 补填模式：不经场景直接进认定表（期末周起可补填） */
  const [filingOpen, setFilingOpen] = useState(false);
  const [datePhase, setDatePhase] = useState<DatePhase>("nodes");
  const [dateNodeIndex, setDateNodeIndex] = useState(0);
  const [datePicked, setDatePicked] = useState<DateChoice | null>(null);
  const [gateStage, setGateStage] = useState<GateStage | null>(null);
  const [gatePick, setGatePick] = useState<RoutePickOption | null>(null);
  const [gateReactionIndex, setGateReactionIndex] = useState(0);
  /* ---------- 白日小事件「校园角落」（批次 I）：播放状态与深夜事件同一套骨架 ---------- */
  const [dayActive, setDayActive] = useState<DayEvent | null>(null);
  const [dayPhase, setDayPhase] = useState<NightPhase>("nodes");
  const [dayNodeIndex, setDayNodeIndex] = useState(0);
  const [dayPicked, setDayPicked] = useState<DayChoice | null>(null);
  /* ---------- 新手引导：第一次进校园（没看过引导且还没通任何线）时弹一次 ---------- */
  const [tutorialOpen, setTutorialOpen] = useState(false);

  /* ---------- 被记录的社会面（批次 AJ）：账台——借沉默（带利息）/ 替人背档案 ---------- */
  const [ledgerOpen, setLedgerOpen] = useState<LedgerDeskKind | null>(null);
  const openLedger = useCallback((kind: LedgerDeskKind) => setLedgerOpen(kind), []);
  const closeLedger = useCallback(() => setLedgerOpen(null), []);

  /* ---------- 校园是活的系统（批次 AP）：课表 / 维修门贴 / 提前毕业 / 你回来了 ---------- */
  const [scheduleOpen, setScheduleOpen] = useState(false);
  /** 维修中的楼：点开的是门上的告示，不是剧情卡（不提前通知——到了门口才知道） */
  const [maintenanceOpen, setMaintenanceOpen] = useState<BuildingId | null>(null);
  const [graduateOpen, setGraduateOpen] = useState(false);
  /** 缺席记录（批次 AP）：回来的那一段——档案替你补的「无记录」 */
  const [returnRecord, setReturnRecord] = useState<AwayRecord | null>(null);
  /** 角色腐烂（批次 BD）：回来的这次，好感褪了一层没有 */
  const [decayed, setDecayed] = useState(false);
  const returnOpen = returnRecord !== null;
  /* ---------- 校园的声音（批次 AQ）：广播 / 点名 / 期末公示 ---------- */
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  /** 点名浮层：本学期第几次名单日（day 记着，供应答/未应答落档） */
  const [rollcallDay, setRollcallDay] = useState<number | null>(null);
  const rollcallOpen = rollcallDay !== null;
  /* ---------- 你的位置（批次 AR）：替身 / 签收 / 署名启事 ---------- */
  const [packageOpen, setPackageOpen] = useState(false);
  const [packageReplacedOpen, setPackageReplacedOpen] = useState(false);
  const [postedOpen, setPostedOpen] = useState(false);
  /* ---------- 另一些日子（批次 AS）：停课 / 清点 / 教研室的门 ---------- */
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [officeOpen, setOfficeOpen] = useState(false);
  /* ---------- 会议（批次 BG）：列席 → 执笔——先听一场，再写一场 ---------- */
  const [meetingRole, setMeetingRole] = useState<"list" | "recorder" | null>(null);
  /* ---------- 交接（批次 BH）：移交单 → 抽屉——制度把位置交给你 ---------- */
  const [handoverOpen, setHandoverOpen] = useState(false);
  /* ---------- 窗口（批次 BI）：值班 → 收表 → 签章——你坐进了流程的那一边 ---------- */
  const [windowOpen, setWindowOpen] = useState(false);
  /* ---------- 帮带（批次 BJ）：帮带 → 本子 → 代值 → 出师——你不是学会了制度，你是制度长出来的那只 ---------- */
  const [mentoringOpen, setMentoringOpen] = useState(false);
  /* ---------- 互查（批次 BK）：编组 → 同数 → 空档 → 补评——你翻到了它们的档案 ---------- */
  const [auditOpen, setAuditOpen] = useState(false);
  /* ---------- 迎检（批次 BL）：迎检 → 轮查 → 查阅申请 → 检查意见——这次轮到你的柜子被翻 ---------- */
  const [inspectionOpen, setInspectionOpen] = useState(false);
  /* ---------- 门后（批次 BM）：调任 → 钥匙 → 递卷 → 名牌——那扇一直关着的门，开了 ---------- */
  const [archiveOpen, setArchiveOpen] = useState(false);
  /* ---------- 基准（批次 BN）：取样 → 基准线 → 比对 → 偏差——你成了那条线 ---------- */
  const [baselineOpen, setBaselineOpen] = useState(false);
  /* ---------- 不符（批次 BO）：退回 → 态度栏 → 对质 → 全齐——最后一只不齐的，由你去核 ---------- */
  const [misalignOpen, setMisalignOpen] = useState(false);
  /* ---------- 结卷（批次 BP）：合订 → 目录 → 页脚 → 卷脊——你的学期被检索了 ---------- */
  const [volumeOpen, setVolumeOpen] = useState(false);
  /* ---------- 登记（批次 BQ）：公告 → 签到表 → 事由 → 签名——制度到了湖边 ---------- */
  const [registerOpen, setRegisterOpen] = useState(false);
  /* ---------- 用途（批次 BR）：申报 → 不予受理 → 名目 → 结转——沉默成了预算 ---------- */
  const [budgetOpen, setBudgetOpen] = useState(false);
  /* ---------- 迎新（批次 BT）：报到 → 第一行 → 指路 → 编号——名册上有了下一号 ---------- */
  const [orientationOpen, setOrientationOpen] = useState(false);
  /* ---------- 开口（批次 AU）：零点——沉默值第一次被交到 0 的那一格 ---------- */
  const [zeroOpen, setZeroOpen] = useState(false);

  /** 借沉默：当场扣，下一次深夜事件连本带息还（同一时刻只允许一笔） */
  const doLend = useCallback((amount: number, repay: number): boolean => {
    if (!lendSilence(amount, repay)) return false;
    setSave(loadGameSave());
    return true;
  }, []);

  /** 替人背档案：被注意值 +2，他从此不进档；每天最多一次 */
  const doCarry = useCallback((): boolean => {
    const next = carryDossier();
    if (next === null) return false;
    setSave(loadGameSave());
    return true;
  }, []);

  /** 申请重置（批次 AL）：把自己从名单上拿下来——盖章收 3 点沉默；被注意值清零，重置计数 +1 */
  const doReset = useCallback((): boolean => {
    if (save.attention < 8 || save.silenceValue < 3) return false;
    resetAttention(3);
    setSave(loadGameSave());
    return true;
  }, [save.attention, save.silenceValue]);

  /** 消耗沉默（批次 AO）：把攒下的沉默交出去，换名单上那一笔淡一点——每天最多一次 */
  const doSpend = useCallback((): boolean => {
    if (spendSilence() === null) return false;
    setSave(loadGameSave());
    return true;
  }, []);

  useEffect(() => {
    let fresh = loadGameSave();
    /* 零点（批次 AU）：沉默值第一次被交到 0——回到地图时弹出那一格（addSilence 跨界时挂的标记） */
    if (consumeZeroPending()) {
      setZeroOpen(true);
      fresh = loadGameSave();
    }
    /* 排课（批次 AP）：旧档没有课表时补排一张——按上一学期结档快照派生（开学时 resetGameSave 已排过，这里只兜底） */
    if (!fresh.classSchedule || fresh.classSchedule.length === 0) {
      persistGameSave({
        ...fresh,
        classSchedule: buildClassSchedule(fresh.lastTermSnapshot ?? null, fresh.weatherSeed),
      });
      fresh = loadGameSave();
    }
    /* 缺席记录（批次 AP）：现实时间 = 游戏时间——离校满三天，档案替你补一行「无记录」，
       蛙们隔着一段距离说「你回来了」。回来的这一段只记一次（重复离校另起一段） */
    const away = recordAbsence();
    if (away) {
      /* 角色腐烂（批次 BD）：离校满七天回来，好感没被看着——全体褪了一层（每学期一次） */
      setDecayed(applyAbsenceDecay() !== null);
      setReturnRecord(away);
      fresh = loadGameSave();
    }
    /* 校园的声音（批次 AQ）：公示（期末周第一天）> 广播（真话转播日）> 点名（名单日）——
       一天至多弹一个新浮层，避免把校园的一天挤成三件同时发生的事 */
    const dayNow = dayOfDoneCount(countCompletedLines(fresh));
    const semesterNow = getPlaythrough(fresh);
    /* 冬眠发作（批次 CE）：学期末，身体自己选——不是「要不要睡」，是「醒来之后发现错过了什么」。
       睡去不打招呼：档案照写「该蛙冬眠期间无记录」，错过的清单醒来才看见。 */
    const hibernateDue =
      dayNow >= 9 &&
      (fresh.playthrough ?? 1) >= 2 &&
      !fresh.hibernateWake &&
      seedRandom(((Math.round(fresh.weatherSeed) % 1000000) * 1201 + fresh.playthrough * 19 + 191) % 1000000) < 0.35;
    if (hibernateDue) {
      const missed: string[] = [];
      const seen = new Set(fresh.seenNightEvents);
      const unseenNights = [
        ...NIGHT_EVENTS,
        ...FINAL_NIGHT_EVENTS,
        ...DISCOVERY_NIGHT_EVENTS,
        ...REPORT_NIGHT_EVENTS,
        UNDERGROUND_NIGHT_EVENT,
      ].filter((item) => !seen.has(item.id)).length;
      if (unseenNights > 0) missed.push(`深夜的池子里，还有 ${unseenNights} 夜你没看。`);
      const unfinished = REGULAR_LINE_IDS.filter((id) => !fresh.completedLines.includes(id)).length;
      if (unfinished > 0) missed.push(`有 ${unfinished} 条线，这个学期没有走完。`);
      if (!(fresh.explainLog ?? []).some((item) => item.semester === fresh.playthrough)) {
        missed.push("那份说明，这学期没有补。");
      }
      missed.push("学期最后一天的档案，只有一行：该蛙冬眠期间无记录。");
      involuntaryHibernate(missed);
      setSave(loadGameSave());
      setInstinctMode("sleep");
      return;
    }
    /* 冬眠（批次 CE）：醒来——错过了什么，现在才看见（回执消费即清） */
    if (fresh.hibernateWake) {
      const wake = consumeHibernateWake();
      setMissedItems(wake?.missed ?? []);
      fresh = loadGameSave();
      setSave(fresh);
      setInstinctMode("wake");
      return;
    }
    /* 蜕皮发作（批次 CE）：打完一个结局之后，身体自己蜕——旧皮入柜，新皮是空的。
       不是「要不要蜕」——是蜕完之后看着旧皮。 */
    if (fresh.moltPending === true) {
      setMoltNoteState(consumeMoltPending() ?? "");
      shedSkinNow();
      fresh = loadGameSave();
      setSave(fresh);
      setInstinctMode("molt");
      return;
    }
    const noticeDue =
      dayNow - 1 === FINAL_WEEK_FROM && !(fresh.noticeSemesters ?? []).includes(semesterNow);
    const broadcastDue =
      !noticeDue &&
      dayNow === broadcastDayOf(fresh.weatherSeed) &&
      !fresh.broadcastPlayed &&
      broadcastTruthOf(fresh) !== null;
    const rollcallDue =
      !noticeDue &&
      !broadcastDue &&
      rollcallDaysOf(fresh.weatherSeed).includes(dayNow) &&
      !(fresh.rollcallLog ?? []).includes(dayNow);
    if (noticeDue) markNoticePosted(semesterNow);
    if (broadcastDue) markBroadcastPlayed();
    /* 你的位置（批次 AR）：被代签（到达第三天起，不签的东西会被处理——处理的方式是签收）>
       签收（到达日起两天内等你；「先放着」关掉不落档，它还会再等你）。落档后刷新，
       让签收状态对齐——签过/被代签的那份不再弹。 */
    const packageArrived = packageDayOf(fresh.weatherSeed);
    const replacedDue = dayNow >= packageArrived + 2 && !fresh.packageSigned && !fresh.packageReplaced;
    const packageDue =
      !replacedDue && dayNow >= packageArrived && dayNow < packageArrived + 2 && !fresh.packageSigned && !fresh.packageReplaced;
    if (replacedDue) replacePackage();
    /* 另一些日子（批次 AS）：停课日（当天错过就过去了）> 清点日（当天来当天走）> 教研室（那扇门一直在，从派生日起贴着）。
       三件都是单按钮浮层——弹出即落档，不在链里占第二回。 */
    const holidayDue = dayNow === holidayDayOf(fresh.weatherSeed) && !fresh.holidayPlayed;
    const inventoryDue = !holidayDue && dayNow === inventoryDayOf(fresh.weatherSeed) && !fresh.inventoryPlayed;
    const officeDue = !holidayDue && !inventoryDue && dayNow >= officeDayOf(fresh.weatherSeed) && !fresh.officeSeen;
    if (holidayDue) markHolidayPlayed();
    if (inventoryDue) markInventoryDone();
    if (officeDue) markOfficeSeen();
    /* 会议（批次 BG）：列席（可以听，不能说）> 执笔（轮到你写纪要）。两件都从种子派生日
       起贴着不走；执笔必须先列席过——同一天撞上时列席先行，执笔顺延到下一次进图。 */
    const meetingListDue =
      dayNow >= meetingDayOf(fresh.weatherSeed) &&
      !(fresh.meetings ?? []).some((item) => item.semester === semesterNow && item.role === "list");
    const meetingRecorderDue =
      !meetingListDue &&
      dayNow >= recorderFindDayOf(fresh.weatherSeed) &&
      (fresh.meetings ?? []).some((item) => item.semester === semesterNow && item.role === "list") &&
      !(fresh.meetings ?? []).some((item) => item.semester === semesterNow && item.role === "recorder");
    /* 交接（批次 BH）：移交单（你接任记录员）> 抽屉（三份积压的档案等结论）。
       接任要等你执过笔——同一天撞上时会议先行，移交单顺延到下一次进图。 */
    const handoverDue =
      dayNow >= handoverDayOf(fresh.weatherSeed) &&
      fresh.handoverSeen !== true &&
      (fresh.meetings ?? []).some((item) => item.semester === semesterNow && item.role === "recorder");
    /* 用途（批次 BR）：沉默要报用途——申报表在你接任之后发下来，名目只有三个。
       「无用途」不予受理；受理之后沉默按名目结转（最多十点），新学期一次性发放。 */
    const budgetDue =
      dayNow >= budgetDayOf(fresh.weatherSeed) &&
      fresh.budgetSeen !== true &&
      fresh.handoverSeen === true;
    /* 窗口（批次 BI）：值班（你在窗口坐了一整天）> 收表 > 签章（那份申请最后一定盖了章）。
       值班要等你接任过——同一天撞上时交接先行，排班表顺延到下一次进图。 */
    const windowDue =
      dayNow >= windowDayOf(fresh.weatherSeed) &&
      fresh.windowSeen !== true &&
      fresh.handoverSeen === true;
    /* 帮带（批次 BJ）：帮带（窗口配帮带一名）> 第一课（窗口不判断）> 代值 > 出师。
       帮带要等你值过班——同一天撞上时值班先行，通知顺延到下一次进图。 */
    const mentoringDue =
      dayNow >= mentorDayOf(fresh.weatherSeed) &&
      fresh.mentoringSeen !== true &&
      fresh.windowSeen === true;
    /* 互查（批次 BK）：编组（你在第三组，组里只有你）> 同数 > 空档 > 补评。
       互查要等你带过帮带——同一天撞上时帮带先行，通知顺延到下一次进图。 */
    const auditDue =
      dayNow >= auditDayOf(fresh.weatherSeed) &&
      fresh.auditSeen !== true &&
      fresh.mentoringSeen === true;
    /* 迎检（批次 BL）：你的柜子在重点名册上——互查名单倒着排，你翻过它的柜子，它翻你的。
       迎检要等你互查过——同一天撞上时互查先行，通知顺延到下一次进图。 */
    const inspectionDue =
      dayNow >= inspectionDayOf(fresh.weatherSeed) &&
      fresh.inspectionSeen !== true &&
      fresh.auditSeen === true;
    /* 门后（批次 BM）：调任（那扇一直关着的门开了）> 钥匙 > 递卷 > 名牌。
       调任要等你迎检过——同一天撞上时迎检先行，调任单顺延到下一次进图。 */
    const archiveDue =
      dayNow >= doorDutyDayOf(fresh.weatherSeed) &&
      fresh.doorDutySeen !== true &&
      fresh.inspectionSeen === true;
    /* 基准（批次 BN）：取样（你的档案进了「正常值」）> 基准线 > 比对 > 偏差。
       取样要等你看过柜——同一天撞上时看柜先行，通知顺延到下一次进图。 */
    const baselineDue =
      dayNow >= baselineDayOf(fresh.weatherSeed) &&
      fresh.baselineSeen !== true &&
      fresh.doorDutySeen === true;
    /* 不符（批次 BO）：那份退回三回的档案由你去核——最后一只不齐的。
       核对要等你取过样——同一天撞上时取样先行，通知顺延到下一次进图。 */
    const misalignDue =
      dayNow >= alignDayOf(fresh.weatherSeed) &&
      fresh.alignSeen !== true &&
      fresh.baselineSeen === true;
    /* 结卷（批次 BP）：学期档案合订成册——卷首有目录，卷末有页脚，卷脊贴标签。
       结卷要等你核过那份不符档案——同一天撞上时核对先行，通知顺延到下一次进图。 */
    const volumeDue =
      dayNow >= volumeDayOf(fresh.weatherSeed) &&
      fresh.volumeSeen !== true &&
      fresh.alignSeen === true;
    /* 登记（批次 BQ）：制度到了湖边——全校唯一没有墙的地方，立了一块牌子。
       牌子在常规线全通（湖边解锁）之后立起来；立了就一直在，不与结卷争先后。 */
    const registerDue = isLakeUnlocked(fresh) && fresh.registerSeen !== true;
    /* 迎新（批次 BT）：新蛙来了——你替它写第一行，然后给它指了另一张表。
       迎新要等你立过牌（湖边解锁之后名册开始变长）。 */
    const orientationDue =
      dayNow >= orientationDayOf(fresh.weatherSeed) &&
      fresh.orientationSeen !== true &&
      fresh.registerSeen === true;
    /* 团体（批次 CA）：它们在你不在的时候自己动了——一学期一次，从种子派生日贴着不走。
       勾结被看见的时候，行动本身成了材料（被注意值 +2，口径在 markFactionAction 内）。 */
    const factionActionDue = FACTIONS.find(
      (meta) =>
        !factionActedThisSemesterOf(fresh, meta.id) && dayNow >= factionActionDayOf(fresh.weatherSeed, meta.id),
    );
    /* 团体（批次 CA）：它们自己裂了——不是你挑拨的，是它们自己的问题。条件齐了它们自己裂。 */
    const factionSplitDue = factionSplitDueOf(fresh);
    /* 递件（批次 CB）：团体要你办的第一件事——替它把一份表交上去（被反映人一栏写着 036）。
       只托你加入过的团体，每学期一封；递件日从种子派生，贴着不走。 */
    const courierDue = FACTIONS.find(
      (meta) =>
        factionJoinedSemesterOf(fresh, meta.id) !== null &&
        !courierSentThisSemesterOf(fresh) &&
        dayNow >= courierDayOf(fresh.weatherSeed, meta.id),
    );
    if (courierDue) setCourierFactState(courierFactOf(fresh, fresh.weatherSeed));
    /* 离校（批次 CC）：学期中途，某个角色突然不在了——没有预告，没有告别。
       每学期最多一次，第 4~9 天由种子派生；走的是哪一只由种子定，你无法通过任何操作阻止它。 */
    const departureDue = !departureThisSemesterOf(fresh) && dayNow >= departureDayOf(fresh.weatherSeed);
    const departureFrog = departureDue ? departurePickOf(fresh) : null;
    if (departureFrog) {
      markDeparture(dayNow, departureFrog);
      const others = (Object.keys(FROG_LINE) as FrogCharacterId[]).filter((id) => id !== departureFrog);
      const pick = Math.floor(seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1117 + 163) * others.length) % others.length;
      setDepartureFrogId(departureFrog);
      setDepartureOtherName(FROG_CHARACTERS[others[pick] ?? others[0]]?.displayName ?? "别的蛙");
      fresh = loadGameSave();
    }
    /* 地下组织（批次 CD）：被发现的风险永远存在——不是数值，是具体的人。被发现之后不是结局。 */
    const undergroundExposeDue =
      isUndergroundActive(fresh) &&
      dayNow >= undergroundRiskDayOf(fresh.weatherSeed) &&
      ((fresh.undergroundJobs?.length ?? 0) >= 2 ||
        (fresh.undergroundActs ?? []).some((item) => item.kind !== "refused"));
    if (undergroundExposeDue) {
      exposeUnderground();
      fresh = loadGameSave();
    }
    /* 消迹（批次 CF）：你说过的一句真话，从档案里没了——不是你删的，是某天你翻档案那一栏空了。
       罐里有货、学期后半、种子到了就发生；你无法通过任何操作阻止它。每学期最多一次。 */
    const vanishDue =
      !vanishThisSemesterOf(fresh) &&
      fresh.truthJar.length > 0 &&
      dayNow >= vanishDayOf(fresh.weatherSeed) &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1249 + 199) < 0.4;
    if (vanishDue) {
      const picked = vanishPickOf(fresh);
      markVanish(dayNow, picked);
      const speakers = (Object.keys(FROG_LINE) as FrogCharacterId[]).filter((id) => id !== "naiBai");
      const speakPick = Math.floor(seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1259 + 211) * speakers.length) % speakers.length;
      setVanishText(picked);
      setVanishSpeakerName(FROG_CHARACTERS[vanishSpeakerOf(speakers, speakPick)]?.displayName ?? "那只蛙");
      fresh = loadGameSave();
    }
    /* 已结（批次 CG）：档案柜最里面那份卷——封面写着「该生已毕业」，日期是下学期末。
       认识橡皮蛙（first-class 走过）才有这份卷的重量；学期后半、种子到了就发现；你无法阻止它。 */
    const finishedDue =
      !finishedThisSemesterOf(fresh) &&
      fresh.completedLines.includes("first-class") &&
      dayNow >= finishedDayOf(fresh.weatherSeed) &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1289 + 223) < 0.5;
    if (finishedDue) {
      markFinished(dayNow);
      setFinishedOpen(true);
      fresh = loadGameSave();
    }
    /* 批阅者（批次 CL）：翻过档案才注意到页脚的落款——记录员 014。
       调阅过档案（dossierReads 有记录）+ 学期中段 + 种子到了就发现；每学期一次。 */
    const recorderDue =
      !recorderThisSemesterOf(fresh) &&
      Object.keys(fresh.dossierReads ?? {}).length > 0 &&
      dayNow >= recorderDayOf(fresh.weatherSeed) &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1319 + 233) < 0.45;
    if (recorderDue) {
      markRecorder(dayNow);
      setRecorderOpen(true);
      fresh = loadGameSave();
    }
    /* 传染（批次 CM）：沉默值攒够了，校园开始安静——你数得出来的就有三件。
       沉默值 ≥8 + 学期后半 + 种子到了就发现；每学期一次。 */
    const quietingDue =
      !quietingThisSemesterOf(fresh) &&
      fresh.silenceValue >= 8 &&
      dayNow >= 6 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1361 + 241) < 0.5;
    if (quietingDue) {
      markQuieting(dayNow);
      setQuietingOpen(true);
      fresh = loadGameSave();
    }
    /* 交班（批次 CP）：学期最后一天，门要交了——你经手过的每一件事都得写清楚。
       dayNow ≥ 8（学期末）才交；每学期一次。 */
    const shiftDue = !shiftHandoverThisSemesterOf(fresh) && dayNow >= 8;
    if (shiftDue) {
      markShiftHandover(dayNow);
      setShiftOpen(true);
      fresh = loadGameSave();
    }
    /* 回单（批次 CQ）：签过的单子被退回来了——事由按上学期怎么交的派生。
       新学期第 2 天起才回来；每学期一次；上学期没交过班就没有这一出。 */
    const lastShift = latestRespondedShiftOf(fresh);
    const lastShiftResponse = lastShift?.response;
    const testimonyDue =
      !testimonyThisSemesterOf(fresh) && dayNow >= 2 && !!lastShiftResponse &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1379 + 257) < 0.6;
    if (testimonyDue && lastShiftResponse) {
      markTestimony(dayNow, lastShiftResponse);
      setTestimonyAbout(lastShiftResponse);
      setTestimonyOpen(true);
      fresh = loadGameSave();
    }
    /* 接任（批次 CR）：接办人一栏还空着，退回来了——填谁，现在归你管。
       新学期第 3 天起；交过班才轮得到；每学期一次。 */
    const successionDue =
      !successionThisSemesterOf(fresh) && dayNow >= 3 && hasShiftRecordOf(fresh) &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1391 + 271) < 0.6;
    if (successionDue) {
      markSuccession(dayNow);
      setSuccessionOpen(true);
      fresh = loadGameSave();
    }
    /* 误投（批次 CS）：信格里有你的名字，事由里没有你的事。
       新学期第 4 天起；每学期一次。 */
    const misdeliveryDue =
      !misdeliveryThisSemesterOf(fresh) && dayNow >= 4 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1429 + 283) < 0.55;
    if (misdeliveryDue) {
      markMisdelivery(dayNow);
      setMisdeliveryOpen(true);
      fresh = loadGameSave();
    }
    /* 补页（批次 CT）：你的卷宗缺了一页——遗失页由你补述，回来的是哪一版以你讲的为准。
       新学期第 5 天起；每学期一次。 */
    const lostPageDue =
      !lostPageThisSemesterOf(fresh) && dayNow >= 5 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1483 + 293) < 0.55;
    if (lostPageDue) {
      markLostPage(dayNow);
      setLostPageOpen(true);
      fresh = loadGameSave();
    }
    /* 合档（批次 CV）：你的卷宗和另一卷重号了——已经合了，按期结转，除非你拆。
       新学期第 6 天起；每学期一次。 */
    const mergerDue =
      !mergerThisSemesterOf(fresh) && dayNow >= 6 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1511 + 313) < 0.55;
    if (mergerDue) {
      markMerger(dayNow);
      setMergerOpen(true);
      fresh = loadGameSave();
    }
    /* 转递（批次 CW）：卷宗点名离柜，途经部门可依职权调阅——免于登记就是用来保证你不知道的。
       新学期第 7 天起；每学期一次。 */
    const transitDue =
      !transitThisSemesterOf(fresh) && dayNow >= 7 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1559 + 337) < 0.55;
    if (transitDue) {
      markTransit(dayNow);
      setTransitOpen(true);
      fresh = loadGameSave();
    }
    /* 被读（批次 CY）：那张不该存在的知会单到了——调阅不通报当事人，它却通报了。
       新学期第 3 天起；每学期一次。 */
    const bereadDue =
      !bereadThisSemesterOf(fresh) && dayNow >= 3 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1571 + 347) < 0.5;
    if (bereadDue) {
      markBeread(dayNow);
      setBereadOpen(true);
      fresh = loadGameSave();
    }
    /* 便条（批次 CZ）：违反流程的那只蛙第二次出手——这张纸没编号、没抬头、没落款。
       新学期第 4 天起；被知会过才来；每学期一次。 */
    const noteDue =
      !noteThisSemesterOf(fresh) && dayNow >= 4 && hasBereadOf(fresh) &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1597 + 353) < 0.5;
    if (noteDue) {
      markNote(dayNow);
      setNoteOpen(true);
      fresh = loadGameSave();
    }
    /* 定稿（批次 DA）：交班前的学期清点——表上列着这学期发生在你身上的每一件事。
       新学期第 6 天起；每学期一次。 */
    const finalizeDue =
      !finalizeThisSemesterOf(fresh) && dayNow >= 6 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1613 + 359) < 0.55;
    if (finalizeDue) {
      markFinalize(dayNow);
      setFinalizeOpen(true);
      fresh = loadGameSave();
    }
    /* 销毁（批次 DB）：定稿之后，作废文书按清册焚化——清册上有一行是你的。
       新学期第 7 天起；每学期一次。 */
    const destructionDue =
      !destructionThisSemesterOf(fresh) && dayNow >= 7 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1657 + 373) < 0.55;
    if (destructionDue) {
      markDestruction(dayNow);
      setDestructionOpen(true);
      fresh = loadGameSave();
    }
    /* 权利（批次 DC）：新学期的卷宗里夹着一页《当事人权利告知书》。
       新学期第 2 天起；每学期一次。 */
    const rightsDue =
      !rightsThisSemesterOf(fresh) && dayNow >= 2 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1699 + 389) < 0.5;
    if (rightsDue) {
      markRights(dayNow);
      setRightsOpen(true);
      fresh = loadGameSave();
    }
    /* 对账（批次 DD）：台账日逐项核对——对账不通报当事人。
       新学期第 3 天起；每学期一次。 */
    const reconciliationDue =
      !reconciliationThisSemesterOf(fresh) && dayNow >= 3 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1721 + 401) < 0.5;
    if (reconciliationDue) {
      markReconciliation(dayNow);
      setReconciliationOpen(true);
      fresh = loadGameSave();
    }
    /* 自记（批次 DE）：当事人自行补记本人名下事项——给那张没编号的纸要不要个号。
       新学期第 4 天起；每学期一次。 */
    const selfEntryDue =
      !selfEntryThisSemesterOf(fresh) && dayNow >= 4 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1741 + 419) < 0.5;
    if (selfEntryDue) {
      markSelfEntry(dayNow);
      setSelfEntryOpen(true);
      fresh = loadGameSave();
    }
    /* 催办（批次 DF）：挂账满一学期的事项，启动催办——时限是这件事不再等你的时候。
       新学期第 5 天起；每学期一次。 */
    const overdueDue =
      !overdueThisSemesterOf(fresh) && dayNow >= 5 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1753 + 431) < 0.5;
    if (overdueDue) {
      markOverdue(dayNow);
      setOverdueOpen(true);
      fresh = loadGameSave();
    }
    /* 申报（批次 DG）：个人物品申报自愿——你说的算数。
       新学期第 6 天起；每学期一次。 */
    const declarationDue =
      !declarationThisSemesterOf(fresh) && dayNow >= 6 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1759 + 439) < 0.5;
    if (declarationDue) {
      markDeclaration(dayNow);
      setDeclarationOpen(true);
      fresh = loadGameSave();
    }
    /* 开放日（批次 DH）：全宗向全体在册蛙开放，免于登记，免于通报。
       新学期第 7 天起；每学期一次。 */
    const openDayDue =
      !openDayThisSemesterOf(fresh) && dayNow >= 7 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1801 + 433) < 0.5;
    if (openDayDue) {
      markOpenDay(dayNow);
      setOpenDayOpen(true);
      fresh = loadGameSave();
    }
    /* 顶班（批次 DI）：替别的蛙值班一日——你办的事记在它的名下。
       新学期第 8 天起；每学期一次。 */
    const substituteDue =
      !substituteThisSemesterOf(fresh) && dayNow >= 8 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1823 + 461) < 0.5;
    if (substituteDue) {
      markSubstitute(dayNow);
      setSubstituteOpen(true);
      fresh = loadGameSave();
    }
    /* 页边（批次 DJ）：规程之外的页边批注——有蛙留了一个「知」。
       本学期顶过班才来；每学期一次。 */
    const pageNoteDue =
      !pageNoteThisSemesterOf(fresh) && dayNow >= 8 && substituteThisSemesterOf(fresh) &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1871 + 499) < 0.5;
    if (pageNoteDue) {
      markPageNote(dayNow);
      setPageNoteOpen(true);
      fresh = loadGameSave();
    }
    /* 记性（批次 DK）：把你的记性跟档案对一遍——它第一次承认可能记错。
       新学期第 9 天起；每学期一次。 */
    const memoryDue =
      !memoryThisSemesterOf(fresh) && dayNow >= 9 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1877 + 503) < 0.5;
    if (memoryDue) {
      markMemory(dayNow);
      setMemoryOpen(true);
      fresh = loadGameSave();
    }
    /* 登记（批次 DL）：非在册文书登记簿——它不收纸，只记「有纸在它不知道的地方」。
       新学期第 5 天起；每学期一次。 */
    const unregisteredDue =
      !unregisteredThisSemesterOf(fresh) && dayNow >= 5 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1889 + 509) < 0.5;
    if (unregisteredDue) {
      markUnregistered(dayNow);
      setUnregisteredOpen(true);
      fresh = loadGameSave();
    }
    /* 扉页（批次 DM）：卷宗封二的一行字——制度自己写在它没占的地方。
       新学期第 2 天起；每学期一次。 */
    const flyleafDue =
      !flyleafThisSemesterOf(fresh) && dayNow >= 2 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1901 + 521) < 0.5;
    if (flyleafDue) {
      markFlyleaf(dayNow);
      setFlyleafOpen(true);
      fresh = loadGameSave();
    }
    /* 认领（批次 DN）：失物认领——制度不查找，只等认领人发起。
       新学期第 7 天起；每学期一次。 */
    const claimDue =
      !claimThisSemesterOf(fresh) && dayNow >= 7 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1913 + 541) < 0.5;
    if (claimDue) {
      markClaim(dayNow);
      setClaimOpen(true);
      fresh = loadGameSave();
    }
    /* 联名（批次 DO）：联名说明——两个名字落在同一页纸上。
       新学期第 4 天起、本学期被调阅过；每学期一次。 */
    const jointDue =
      !jointThisSemesterOf(fresh) && dayNow >= 4 && hasBereadOf(fresh) &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1931 + 557) < 0.5;
    if (jointDue) {
      markJoint(dayNow);
      setJointOpen(true);
      fresh = loadGameSave();
    }
    /* 互通（批次 DP）：信格通道——不编号、不登记、不归档。
       新学期第 5 天起；每学期一次。 */
    const letterBoxDue =
      !letterBoxThisSemesterOf(fresh) && dayNow >= 5 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1949 + 563) < 0.5;
    if (letterBoxDue) {
      markLetterBox(dayNow);
      setLetterBoxOpen(true);
      fresh = loadGameSave();
    }
    /* 命名（批次 DQ）：当事人自命名——它不核验、不解释、不改。
       新学期第 6 天起；每学期一次。 */
    const namingDue =
      !namingThisSemesterOf(fresh) && dayNow >= 6 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1973 + 577) < 0.5;
    if (namingDue) {
      markNaming(dayNow);
      setNamingOpen(true);
      fresh = loadGameSave();
    }
    /* 同名（批次 DR）：简称重名——同一个词有两个使用者。
       新学期第 7 天起、本学期起过名（give/code）；每学期一次。 */
    const sameNamePick = namingThisSemesterOf(fresh)?.pick;
    const sameNameDue =
      !sameNameThisSemesterOf(fresh) && dayNow >= 7 &&
      (sameNamePick === "give" || sameNamePick === "code") &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 1997 + 587) < 0.5;
    if (sameNameDue) {
      markSameName(dayNow);
      setSameNameOpen(true);
      fresh = loadGameSave();
    }
    /* 总目（批次 DS）：学期末编非在册事项总目——总目只陈列，不处置。
       新学期第 8 天起；每学期一次。 */
    const catalogDue =
      !catalogThisSemesterOf(fresh) && dayNow >= 8 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 2011 + 599) < 0.5;
    if (catalogDue) {
      markCatalog(dayNow);
      setCatalogOpen(true);
      fresh = loadGameSave();
    }
    /* 结转（批次 DT）：学期移交——在册事项随卷宗结转，非在册事项由当事人定。
       新学期第 9 天起；每学期一次。 */
    const carryoverDue =
      !carryoverThisSemesterOf(fresh) && dayNow >= 9 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 2017 + 607) < 0.5;
    if (carryoverDue) {
      markCarryover(dayNow);
      setCarryoverOpen(true);
      fresh = loadGameSave();
    }
    /* 留白（批次 DU）：卷宗末页留白——留给下一学期的一页。
       新学期第 2 天起；每学期一次。 */
    const blankDue =
      !blankThisSemesterOf(fresh) && dayNow >= 2 && (fresh.playthrough ?? 1) >= 2 &&
      seedRandom((Math.round(fresh.weatherSeed) % 1000000) * 2027 + 613) < 0.5;
    if (blankDue) {
      markBlank(dayNow);
      setBlankOpen(true);
      fresh = loadGameSave();
    }
    if (noticeDue || broadcastDue || replacedDue || holidayDue || inventoryDue || officeDue) fresh = loadGameSave();
    if (noticeDue) setNoticeOpen(true);
    else if (broadcastDue) setBroadcastOpen(true);
    else if (rollcallDue) setRollcallDay(dayNow);
    else if (replacedDue) setPackageReplacedOpen(true);
    else if (packageDue) setPackageOpen(true);
    else if (holidayDue) setHolidayOpen(true);
    else if (inventoryDue) setInventoryOpen(true);
    else if (officeDue) setOfficeOpen(true);
    /* 会议（批次 BG）：被请进会议室——先给一个座次（列席），再给一支笔（执笔） */
    else if (meetingListDue) setMeetingRole("list");
    else if (meetingRecorderDue) setMeetingRole("recorder");
    /* 交接（批次 BH）：你坐进了那间办公室——抽屉里的档案开始等你结论 */
    else if (handoverDue) setHandoverOpen(true);
    /* 用途（批次 BR）：沉默要报用途——「无用途」不予受理，名目只有三个 */
    else if (budgetDue) setBudgetOpen(true);
    /* 窗口（批次 BI）：你坐进了流程的那一边——窗口不判断，窗口只负责收 */
    else if (windowDue) setWindowOpen(true);
    /* 帮带（批次 BJ）：窗口后面多了一只——它抄格式，然后坐上窗口 */
    else if (mentoringDue) setMentoringOpen(true);
    /* 互查（批次 BK）：柜子对着柜子——你翻到了它们的档案，也翻到了空档 */
    else if (auditDue) setAuditOpen(true);
    /* 迎检（批次 BL）：这次轮到你的柜子被翻——你翻过它的柜子，它翻你的 */
    else if (inspectionDue) setInspectionOpen(true);
    /* 门后（批次 BM）：你坐进了那扇关了很多年的门——文件后面是你 */
    else if (archiveDue) setArchiveOpen(true);
    /* 基准（批次 BN）：你的数字被印成了「正常值」——你不是跟着制度走，制度跟着你走 */
    else if (baselineDue) setBaselineOpen(true);
    /* 不符（批次 BO）：最后一只不齐的由你去核——柜子全齐的意思是没有一只蛙说不 */
    else if (misalignDue) setMisalignOpen(true);
    /* 结卷（批次 BP）：这一学期订成了一本——卷脊上只有编号，名字不参与检索 */
    else if (volumeDue) setVolumeOpen(true);
    /* 登记（批次 BQ）：制度到了湖边——连唯一没有墙的地方都有一张签到表 */
    else if (registerDue) setRegisterOpen(true);
    /* 迎新（批次 BT）：名册上有了下一号——制度有了下一个你 */
    else if (orientationDue) setOrientationOpen(true);
    /* 署名启事（批次 AR）：贴在墙上不会消失——排在日程之后，迟到不算错过 */
    else if (dayNow >= postedDayOf(fresh.weatherSeed) && !fresh.postedSeen) setPostedOpen(true);
    /* 补录（批次 BW）：未经申请的调阅要补一份说明——你伸了手，制度不追问内容，只收下你写的那一行 */
    else if (Object.keys(fresh.dossierReads ?? {}).length > 0 && !fresh.explainSeen) setExplainOpen(true);
    /* 会签（批次 BX）：说明流转到各部门——每个部门加自己的评语，制度不核对内容，只核对有这份说明 */
    else if (fresh.explainSeen && !fresh.signOffSeen) setSignOffOpen(true);
    /* 归档（批次 BY）：说明装订成卷——会签评语回来之后，封卷、铅封、编号、入柜 */
    else if (fresh.signOffSeen && !fresh.sealSeen) setSealOpen(true);
    /* 团体（批次 CA）：它们在你不在的时候动了——你什么都没做，但世界自己动了 */
    else if (factionActionDue) setFactionActionId(factionActionDue.id);
    /* 团体（批次 CA）：它们自己裂了——两边都会来找你，要你站队 */
    else if (factionSplitDue) setFactionSplitId(factionSplitDue);
    /* 递件（批次 CB）：团体要你办的第一件事——替它递那份写你的表 */
    else if (courierDue) setCourierFactionId(courierDue.id);
    /* 离校（批次 CC）：它不在了——发现、去找、三种回应（没有正确的回应） */
    else if (departureFrog) setDepartureFrogId(departureFrog);
    /* 地下组织（批次 CD）：被发现的风险永远存在——行政楼先开了口 */
    else if (undergroundExposeDue) setUndergroundMode("expose");
    /* 消迹（批次 CF）：那一栏空了——发现、追问、三种选择（没有正确的选择） */
    else if (vanishDue) setVanishText(vanishPickOf(fresh));
    /* 已结（批次 CG）：那份提前归好的卷——它还在上课 */
    else if (finishedDue) setFinishedOpen(true);
    /* 批阅者（批次 CL）：页脚的落款——发现、三处可查、三种选择 */
    else if (recorderDue) setRecorderOpen(true);
    /* 传染（批次 CM）：校园安静下来了——发现、三种选择（没有正确的选择） */
    else if (quietingDue) setQuietingOpen(true);
    /* 交班（批次 CP）：学期末的经办交接——照单交 / 少交一项 / 多交一项 */
    else if (shiftDue) setShiftOpen(true);
    /* 回单（批次 CQ）：签过的单子回来了——照认 / 指单 / 补圆 */
    else if (testimonyDue) setTestimonyOpen(true);
    /* 接任（批次 CR）：接办人一栏归你管了——填名 / 交系统 / 填自己 */
    else if (successionDue) setSuccessionOpen(true);
    /* 误投（批次 CS）：去更正 / 不吭声 / 原样退回 */
    else if (misdeliveryDue) setMisdeliveryOpen(true);
    /* 补页（批次 CT）：照实补述 / 少说一点 / 多写一点 */
    else if (lostPageDue) setLostPageOpen(true);
    /* 合档（批次 CV）：申请拆卷 / 不管它 / 去认识它 */
    else if (mergerDue) setMergerOpen(true);
    /* 转递（批次 CW）：让它们送 / 自己送 / 申请封缄 */
    else if (transitDue) setTransitOpen(true);
    /* 被读（批次 CY）：签收回执 / 申请查明 / 装作没看见 */
    else if (bereadDue) setBereadOpen(true);
    /* 便条（批次 CZ）：回一张 / 收着不回 / 去蹲信格 */
    else if (noteDue) setNoteOpen(true);
    /* 定稿（批次 DA）：逐行签字 / 指出一处 / 拒签 */
    else if (finalizeDue) setFinalizeOpen(true);
    /* 销毁（批次 DB）：照单焚化 / 申请留存 / 抄一遍再焚化 */
    else if (destructionDue) setDestructionOpen(true);
    /* 权利（批次 DC）：签收 / 行使 / 不签 */
    else if (rightsDue) setRightsOpen(true);
    /* 对账（批次 DD）：到场 / 问一句 / 不到场 */
    else if (reconciliationDue) setReconciliationOpen(true);
    /* 自记（批次 DE）：照格式记 / 不照格式记 / 不记 */
    else if (selfEntryDue) setSelfEntryOpen(true);
    /* 催办（批次 DF）：办结 / 申请延期 / 逾期挂失 */
    else if (overdueDue) setOverdueOpen(true);
    /* 申报（批次 DG）：全报 / 少报一样 / 空报 */
    else if (declarationDue) setDeclarationOpen(true);
    /* 开放日（批次 DH）：查本宗 / 查摘要 / 不去 */
    else if (openDayDue) setOpenDayOpen(true);
    /* 顶班（批次 DI）：照办 / 留名 / 不顶 */
    else if (substituteDue) setSubstituteOpen(true);
    /* 页边（批次 DJ）：回一个字 / 不动它 / 划掉 */
    else if (pageNoteDue) setPageNoteOpen(true);
    /* 记性（批次 DK）：照实核 / 只说一件 / 不核 */
    else if (memoryDue) setMemoryOpen(true);
    /* 登记（批次 DL）：认领 / 不认领 / 抄进抽屉 */
    else if (unregisteredDue) setUnregisteredOpen(true);
    /* 扉页（批次 DM）：照读 / 折起来 / 撕掉 */
    else if (flyleafDue) setFlyleafOpen(true);
    /* 认领（批次 DN）：领回 / 不领 / 让它们找 */
    else if (claimDue) setClaimOpen(true);
    /* 联名（批次 DO）：签 / 不签 / 改一处 */
    else if (jointDue) setJointOpen(true);
    /* 互通（批次 DP）：通 / 不通 / 单向 */
    else if (letterBoxDue) setLetterBoxOpen(true);
    /* 命名（批次 DQ）：起一个 / 不起 / 起一个像编号的 */
    else if (namingDue) setNamingOpen(true);
    /* 同名（批次 DR）：认下 / 让给它 / 换个名 */
    else if (sameNameDue) setSameNameOpen(true);
    /* 总目（批次 DS）：装订 / 抽走一页 / 不装订 */
    else if (catalogDue) setCatalogOpen(true);
    /* 结转（批次 DT）：照单 / 全带走 / 全交出 */
    else if (carryoverDue) setCarryoverOpen(true);
    /* 留白（批次 DU）：照留 / 写一句 / 夹一张纸 */
    else if (blankDue) setBlankOpen(true);
    setSave(fresh);
    setActiveTheme(loadTheme());
    applyThemeToDocument(loadTheme());
    if (!fresh.tutorialSeen && countCompletedLines(fresh) === 0) setTutorialOpen(true);
    /* 回到地图（挂载）：有到期未播的共通日程就主动弹出（一次只弹一个；日程优先于深夜事件，
       深夜事件仍按既有机制在地图入口等玩家来开） */
    const dueScene = dueCommonSceneOf(fresh);
    if (dueScene) {
      /* 二周目回响（批次 U）：周目 ≥ 2 时把日程的 plus 追加为带「上学期」标的附加节点；
         上一学期档案里玩家自己写的那句被抄进来（批次 AA·档案认领） */
      const plusNodes =
        (fresh.playthrough ?? 1) >= 2 && dueScene.plus && dueScene.plus.length > 0
          ? dueScene.plus.map((node: CommonDateNode) => ({ ...node, remember: true }))
          : [];
      const claimed = fresh.dossierEchoPlayed ? null : claimedNoteNode(fresh);
      const archive = fresh.archiveClaimPlayed ? null : archiveClaimNode(fresh);
      if (claimed) markDossierEchoed();
      if (archive) markArchiveClaimPlayed();
      const fullPlus = [claimed, archive, ...plusNodes].filter(Boolean) as CommonDateNode[];
      setDateActive(fullPlus.length > 0 ? { ...dueScene, nodes: [...dueScene.nodes, ...fullPlus] } : dueScene);
      setDatePhase("nodes");
      setDateNodeIndex(0);
      setDatePicked(null);
      return;
    }
    /* 白日小事件（批次 I）：日程优先、深夜不抢——共通日程没得弹时，轮到校园角落 */
    const dueDay = dueDayEventOf(fresh);
    if (dueDay) {
      /* 二周目起：白天也记得你——档案补记接在原节点之后、选项之前（照深夜的接法） */
      const plusNodes =
        (fresh.playthrough ?? 1) >= 2 && dueDay.plus && dueDay.plus.length > 0
          ? dueDay.plus.map((node) => ({ ...node, remember: true }))
          : [];
      setDayActive(
        plusNodes.length > 0 ? { ...dueDay, nodes: [...dueDay.nodes, ...plusNodes] } : dueDay,
      );
      setDayPhase("nodes");
      setDayNodeIndex(0);
      setDayPicked(null);
    }
  }, []);

  const switchTheme = useCallback((themeId: ThemeId) => {
    setActiveTheme(themeId);
    persistTheme(themeId);
    applyThemeToDocument(themeId);
  }, []);

  const doneCount = useMemo(() => countCompletedLines(save), [save]);

  /* ---------- 校园日历：时间与天气（天数由完成线数派生，不落盘） ---------- */

  const day = useMemo(() => dayOfDoneCount(doneCount), [doneCount]);
  // 天气种子随档走（批次 H2）：开新档重摇，每局一套序列；同局内同一天恒定
  const weatherInfo = useMemo<WeatherMeta>(
    () => WEATHER_META[weatherForDay(day, save.weatherSeed)],
    [day, save.weatherSeed],
  );
  /* 天气预报（批次 CY-102）：明天的天气是排好的——卡片提前一天说 */
  const weatherTomorrow = useMemo<WeatherMeta>(
    () => WEATHER_META[weatherForDay(day + 1, save.weatherSeed)],
    [day, save.weatherSeed],
  );
  const finalWeek = useMemo(() => isFinalWeek(doneCount), [doneCount]);

  /* 期末周钟摆（批次 CY-96）：走廊挂钟每 6 秒一下——静音时 playSe 自己零开销；
     深夜弹层开着时连钟也停（批次 CY-97）：夜里的事不该被走廊催 */
  useEffect(() => {
    if (!finalWeek || nightActive !== null) return;
    const timer = window.setInterval(() => playSe("se-clock"), 6000);
    return () => window.clearInterval(timer);
  }, [finalWeek, nightActive]);
  const examCountdown = useMemo(() => daysToExam(day), [day]);

  /* ---------- 氛围音效：雨天白噪声只在地图页响（期末周不额外变化），静音开关顶栏控制 ---------- */

  const [soundOn, setSoundOnState] = useState(() => isSoundOn());
  const toggleSound = useCallback(() => {
    const next = setSoundOn(!isSoundOn());
    setSoundOnState(next);
    /* 重新开声的瞬间，若今天是雨/风天，氛围音跟着回来（批次 CY-95） */
    if (next && weatherInfo.id === "rain") startRainAmbience();
    if (next && weatherInfo.id === "wind") startWindAmbience();
    if (next && weatherInfo.id === "sunny") startSunnyAmbience();
  }, [weatherInfo.id]);

  useEffect(() => {
    if (soundOn && weatherInfo.id === "rain") startRainAmbience();
    else stopRainAmbience();
    /* 风天氛围（批次 CY-95）：bandpass 雨噪 + 慢 LFO 阵风，一阵一阵地过 */
    if (soundOn && weatherInfo.id === "wind") startWindAmbience();
    else stopWindAmbience();
    /* 晴天虫鸣（批次 CY-98）：极贴耳的一声“沙——”，深夜弹层打开时由 duckAmbience 统一压低 */
    if (soundOn && weatherInfo.id === "sunny") startSunnyAmbience();
    else stopSunnyAmbience();
    /* 离开地图（卸载）时淡出，不把雨声风声带进别的页面 */
    return () => {
      stopRainAmbience();
      stopWindAmbience();
      stopSunnyAmbience();
    };
  }, [soundOn, weatherInfo.id]);

  /* ---------- BGM（批次 B1）：进图放校园午后，期末周切图书馆，深夜弹层切深夜曲 ---------- */

  const [bgmOn, setBgmOnState] = useState(() => isBgmOn());
  const toggleBgm = useCallback(() => {
    setBgmOnState(setBgmOn(!isBgmOn()));
  }, []);

  /** 地图上的日常曲目：期末周换「屏息」（心跳比秒针快的冲刺周，就该比平时紧） */
  const mapTrack = useMemo<BgmTrackId>(() => (finalWeek ? "tension" : "afternoon"), [finalWeek]);
  const nightOpen = nightActive !== null;

  /** 事件弹层的曲（批次 S；CY-23 起深夜事件可点名挂专属曲）：
   *  事件专属曲 > 按地点取同款曲（与正片同地点同曲）> 回落夜曲 / 地图日常曲；日程弹层优先级最高 */
  useEffect(() => {
    const evBg = dateActive?.bgId ?? dayActive?.bgId ?? nightActive?.bgId;
    /* 学期变奏（批次 W）：弹层配乐同样按学期收变——第二学期慢一成，第三学期去旋律 */
    playBgm(
      nightActive?.bgm ?? stageTrackOf(evBg) ?? (nightOpen ? "night" : mapTrack),
      getPlaythrough(save),
    );
  }, [nightOpen, mapTrack, dayActive, nightActive, dateActive]);

  /* 离开地图（卸载）走换页宽限期（批次 CY-17）：450ms 内下一站点歌就首尾相接，没人接歌才停 */
  useEffect(() => () => releaseBgmHandoff(), []);

  /* ---------- 深夜事件：今晚的池子与入口状态 ---------- */

  /**
   * 可达判定：《约谈》要被注意值攒够 8；《档案室的夜》（批次 BU）要等你接任过档案室；
   * 私档发现夜（批次 BV）要等对应蛙的本线走到第二幕——你们有过第一次具体的接触，才有东西可翻；
   * 空白档案页（批次 BZ）要等本学期还没写过——写过之后，那张纸就不在了；
   * 地下组织（批次 CD）：招募每学期最多一次、托付等你决定、被看见的名字不能再用
   */
  const nightReachable = useCallback(
    (item: NightEvent) => {
      if (item.id === NIGHT_TALK_EVENT.id && getAttention(save) < 8) return false;
      if (item.id === NIGHT_ARCHIVE_EVENT.id && save.doorDutySeen !== true) return false;
      const dossierLine = DOSSIER_LINE_OF[item.id];
      if (dossierLine && (save.lineAct?.[dossierLine] ?? 0) < 2) return false;
      if (item.id === "night-report-blank" && hasPlayerReportThisSemester(save)) return false;
      if (item.id === "night-underground") {
        if (save.undergroundExposed) return save.undergroundClosedSeen !== true;
        if (save.undergroundJoined !== true) {
          return !(save.undergroundMetSemesters ?? []).includes(save.playthrough);
        }
        return !hasUndergroundActThisSemester(save);
      }
      return true;
    },
    [save],
  );

  const nightState = useMemo<NightSpotState>(() => {
    const seen = new Set(save.seenNightEvents);
    /* 不可达的条目不挡「全部看完」的判定，免得入口亮着却点不出东西 */
    const allSeen = [
      ...NIGHT_EVENTS,
      ...FINAL_NIGHT_EVENTS,
      ...DISCOVERY_NIGHT_EVENTS,
      ...REPORT_NIGHT_EVENTS,
      UNDERGROUND_NIGHT_EVENT,
    ].every(
      (item) => !nightReachable(item) || seen.has(item.id),
    );
    if (allSeen) return "done";
    if (save.lastNightDay >= day) return "hidden";
    return "ready";
  }, [save, day]);

  /* 还剩几段夜里的事（批次 CY-32）：入口浮层的进度感——口径与「都看过了」一致，不可达的不算欠账 */
  const nightRemaining = useMemo(() => {
    const seen = new Set(save.seenNightEvents);
    return [...NIGHT_EVENTS, ...FINAL_NIGHT_EVENTS, ...DISCOVERY_NIGHT_EVENTS, ...REPORT_NIGHT_EVENTS, UNDERGROUND_NIGHT_EVENT].filter(
      (item) => nightReachable(item) && !seen.has(item.id),
    ).length;
  }, [save.seenNightEvents, nightReachable]);

  /** 期末深夜池：被注意值攒到 8，期末三夜之后追加第四夜《约谈》——名单到了，就有人来照名单约 */
  const finalPool = useMemo<NightEvent[]>(() => {
    if (!finalWeek) return [];
    return getAttention(save) >= 8
      ? FINAL_NIGHT_EVENTS
      : FINAL_NIGHT_EVENTS.filter((item) => item.id !== NIGHT_TALK_EVENT.id);
  }, [finalWeek, save]);

  /** 今晚要播的事件：私档发现夜（批次 BV）、空白档案页（批次 BZ）条件齐了就优先；
   *  期末周换期末池（放完回退常规池），否则按顺序取第一个未看的；不可达的条目（《约谈》《档案室的夜》）不进池 */
  const tonightEvent = useMemo<NightEvent | null>(() => {
    if (nightState !== "ready") return null;
    const seen = new Set(save.seenNightEvents);
    const unseenIn = (pool: NightEvent[]) => pool.filter((item) => !seen.has(item.id));
    /* 雨夜限定（批次 CY-98）：今晚下雨且这把伞还没还——雨夜戏排最前，一学期只淋这一场 */
    if (weatherInfo.id === "rain" && !seen.has(RAIN_NIGHT_EVENT.id)) return RAIN_NIGHT_EVENT;
    /* 雾夜限定（批次 CY-100）：今晚起雾且这句还没说出口——雾夜戏紧跟雨夜排最前，一学期只见这一回 */
    if (weatherInfo.id === "fog" && !seen.has(FOG_NIGHT_EVENT.id)) return FOG_NIGHT_EVENT;
    /* 阴天限定（批次 CY-101）：不下雨的晴夜之外的空白夜——灰灰只在这种天躺得外面一点 */
    if (weatherInfo.id === "cloudy" && !seen.has(CLOUDY_NIGHT_EVENT.id)) return CLOUDY_NIGHT_EVENT;
    /* 雷夜续集（批次 CY-102）：伞还过了、今晚又下雨——雷替蛙们喊一次停 */
    if (weatherInfo.id === "rain" && seen.has(RAIN_NIGHT_EVENT.id) && !seen.has(THUNDER_NIGHT_EVENT.id)) return THUNDER_NIGHT_EVENT;
    /* 晴夜失眠（批次 CY-102）：月亮大的晚上也是一种天气夜 */
    if (weatherInfo.id === "sunny" && !seen.has(SUNNY_NIGHT_EVENT.id)) return SUNNY_NIGHT_EVENT;
    /* 三夜集齐（批次 CY-102）：伞、雾、阴天都遇过——第四夜归巡逻台账 */
    if (
      [RAIN_NIGHT_EVENT.id, FOG_NIGHT_EVENT.id, CLOUDY_NIGHT_EVENT.id].every((id) => seen.has(id)) &&
      ["rain", "fog", "cloudy"].includes(weatherInfo.id) &&
      !seen.has(WEATHER_PATROL_EVENT.id)
    )
      return WEATHER_PATROL_EVENT;
    /* 五夜集齐（批次 CY-102）：伞雷雾阴月全过完——终夜不看天气，今晚归天快亮 */
    if (
      ["night-rain-door", "night-rain-thunder", "night-fog-figure", "night-cloudy-gray", "night-sunny-moon"].every(
        (id) => seen.has(id),
      ) &&
      !seen.has(FIVE_NIGHT_EVENT.id)
    )
      return FIVE_NIGHT_EVENT;
    /* 私档发现夜（批次 BV）：条件齐了就先安排——这些是「你正好路过」的场景，等不得 */
    const pendingDossier = DISCOVERY_NIGHT_EVENTS.find(
      (item) => !seen.has(item.id) && nightReachable(item),
    );
    if (pendingDossier) return pendingDossier;
    /* 撰写（批次 BZ）：空白档案页一直在桌上——本学期还没写，它就先于常池出现。
       每学期只收一份亲手写的：写过之后这张纸就收走了，不再出现（否则提交会被守卫吞掉） */
    const pendingReport = hasPlayerReportThisSemester(save)
      ? undefined
      : REPORT_NIGHT_EVENTS.find((item) => !seen.has(item.id) && nightReachable(item));
    if (pendingReport) return pendingReport;
    /* 地下组织（批次 CD）：那扇门在等你——招募每学期一次，托付等你决定，被看见的名字不能再用 */
    if (!seen.has(UNDERGROUND_NIGHT_EVENT.id) && nightReachable(UNDERGROUND_NIGHT_EVENT)) {
      return UNDERGROUND_NIGHT_EVENT;
    }
    /* 池序按局洗牌（批次 H3）：同一局出场顺序恒定，不同局顺序不同 */
    const pool = seededOrder(finalWeek ? finalPool : NIGHT_EVENTS, save.weatherSeed).filter(nightReachable);
    const picked = unseenIn(pool)[0];
    if (picked) return picked;
    return unseenIn(seededOrder(NIGHT_EVENTS, save.weatherSeed).filter(nightReachable))[0] ?? null;
  }, [nightState, save.seenNightEvents, finalWeek, finalPool, save.weatherSeed, nightReachable, weatherInfo.id]);

  /* ---------- 共通日程：里程碑进度与认定表（日程是脊柱不是收集品，随学期重开） ---------- */

  const playedCommonDays = useMemo(() => getPlayedCommonDays(save), [save]);

  /** 入口卡数据：只列「day ≤ 当前天数」的里程碑（未到的天数不显示） */
  const dateEntries = useMemo<DateEntry[]>(() => {
    const played = new Set(playedCommonDays);
    return COMMON_DATE_SCENES.filter((scene) => scene.day <= day).map((scene) => ({
      scene,
      state: played.has(scene.day) ? ("read" as const) : ("due" as const),
    }));
  }, [day, playedCommonDays]);

  /** 当期未播的日程段数（含今日）：入口卡「有 n 段日程待看」 */
  const dateDueCount = useMemo(
    () => dateEntries.filter((entry) => entry.state === "due").length,
    [dateEntries],
  );

  /** 今天的里程碑（day3 / day6 是普通的一天，返回 null；已播的当天也返回 null） */
  const todayDateScene = useMemo<CommonDateScene | null>(() => {
    const scene = COMMON_DATE_SCENES.find((item) => item.day === day);
    if (!scene) return null;
    return playedCommonDays.includes(scene.day) ? null : scene;
  }, [day, playedCommonDays]);

  /** 今日日程是否已读（当天有里程碑且播过） */
  const todayDateRead = useMemo(() => {
    const scene = COMMON_DATE_SCENES.find((item) => item.day === day);
    return scene ? playedCommonDays.includes(scene.day) : false;
  }, [day, playedCommonDays]);

  /* ---------- 路线认定：锁定状态与补填入口 ---------- */

  const lockedRouteFrog = useMemo(() => getLockedRoute(save), [save]);
  const lockedRouteName = lockedRouteFrog ? FROG_CHARACTERS[lockedRouteFrog].displayName : null;
  /** 锁定蛙所在建筑：地图上挂「认定」徽章 */
  const lockedRouteBuilding = lockedRouteFrog ? ROUTE_BUILDINGS[lockedRouteFrog] : null;
  /** 期末周起且未锁定：补填入口可见 */
  const routeFilingAvailable = finalWeek && !lockedRouteFrog;

  /* ---------- 团体（批次 CA）：站了那边，这边的线永久关闭——不是拉黑，是剩下的事都轮不到你 ---------- */

  const factionLocks = useMemo<Partial<Record<StorylineId, string>>>(() => {
    const out: Partial<Record<StorylineId, string>> = {};
    for (const meta of FACTIONS) {
      const side = factionSplitSideOf(save, meta.id);
      if (!side || side === "none") continue;
      const pair = FACTION_LINES[meta.id];
      if (!pair) continue;
      const index = meta.members.findIndex((item) => item.frogId === side);
      if (index !== 0 && index !== 1) continue;
      const closedLine = index === 0 ? pair[1] : pair[0];
      out[closedLine] = FROG_CHARACTERS[side]?.displayName ?? side;
    }
    return out;
  }, [save]);

  const tiles = useMemo<BuildingTile[]>(() => {
    /* 结局收集口径与结局图鉴对齐（批次 CY-33）：撕掉的页不算收集到 */
    const unlockedIds = new Set(save.unlockedEndings);
    const tornIds = new Set(save.tornEndings ?? []);
    return BUILDINGS.map((building) => {
      const line = storylineByBuilding(building.id);
      const closedByFaction = line ? factionLocks[line.id] : undefined;
      const baseState = line ? lineState(save, line.id) : "ready";
      /* 已经走完的线不再锁回去——关闭的是还没走完的部分 */
      const lockedByFaction = closedByFaction !== undefined && baseState !== "completed";
      const endings = line && lazyScripts ? lazyScripts[line.id]?.endings ?? [] : [];
      const collected = endings.filter((ending) => unlockedIds.has(ending.id) && !tornIds.has(ending.id)).length;
      return {
        building,
        line,
        state: lockedByFaction ? ("locked" as LineState) : baseState,
        lockHint: lockedByFaction
          ? `你站了${closedByFaction}那边。这边的事，从此没有你的事。`
          : line
            ? lineLockHintOf(save, line.id)
            : null,
        lineProgress: line && endings.length > 0 ? { collected, total: endings.length } : null,
      };
    });
  }, [save, factionLocks, lazyScripts]);

  const lakeUnlocked = useMemo(
    () => tiles.find((tile) => tile.building.id === "lake")?.state !== "locked",
    [tiles],
  );

  const silenceExpression = useMemo<FrogExpression>(
    () => expressionForSilence(save.silenceValue),
    [save.silenceValue],
  );

  /* ---------- 好感名册 ---------- */

  const affinityList = useMemo<AffinityRow[]>(() => affinityRows(save), [save]);

  /* ---------- 角色番外（番外篇批次）：播放与落档 ---------- */
  const openSideStory = useCallback((frogId: FrogCharacterId, storyId?: string) => {
    setSideStoryFrog(frogId);
    setSideStoryId(storyId ?? null);
  }, []);
  const closeSideStory = useCallback(() => {
    setSideStoryFrog(null);
    setSideStoryId(null);
  }, []);
  /**
   * 番外收尾落档：已看标记幂等；数值只在首看结算一次（真话入罐 / 沉默入账），
   * 重看不重复计数——档案只收一次。
   */
  const finishSideStory = useCallback(
    (storyId: string, choice: { text: string; silenceDelta: number }) => {
      const firstView = !hasSeenSideStory(storyId, save);
      markSideStorySeen(storyId);
      if (firstView) {
        if (choice.silenceDelta <= 0) addTruth(choice.text);
        else addSilence(choice.silenceDelta);
      }
      setSave(loadGameSave());
    },
    [save],
  );

  /** 认定表动态选项：排除主角，按坦诚度降序取前 3；全 0 照常列出 + 兜底固定项；固定追加「先不填」 */
  const routePickOptions = useMemo<RoutePickOption[]>(() => {
    const npcRows = affinityList.filter((row) => !row.isSelf);
    const sorted = [...npcRows].sort((a, b) => b.percent - a.percent).slice(0, 3);
    const allZero = npcRows.length === 0 || npcRows.every((row) => row.percent <= 0);
    const options: RoutePickOption[] = sorted.map((row) => ({
      frogId: row.charId as RouteFrogId,
      text: `${row.displayName} · ${row.tier.label}`,
      hint: ROUTE_NEAR_HINTS[row.charId as RouteFrogId] ?? "",
    }));
    if (allZero && sorted[0]) {
      const first = sorted[0];
      options.push({
        frogId: first.charId as RouteFrogId,
        text: "就写排在第一位的",
        hint: ROUTE_NEAR_HINTS[first.charId as RouteFrogId] ?? "",
      });
    }
    options.push({
      frogId: null,
      text: "先不填，再看看",
      hint: "这一栏今天先空着。空着不算违纪。",
    });
    return options;
  }, [affinityList]);

  const trueFrogCount = useMemo(
    () => affinityList.filter((row) => !row.isSelf && row.percent >= TRUE_FRIEND_THRESHOLD).length,
    [affinityList],
  );

  /* ---------- 结局图鉴 ---------- */

  const collectedEndings = useMemo(() => save.unlockedEndings.length, [save]);
  const totalEndings = useMemo(() => totalEndingCount(), []);

  /* ---------- 全通谢幕：十条线（九常规 + 湖边）全部完成后，页脚亮一句毕业典礼提示 ---------- */

  const graduateReady = useMemo(
    () => ALL_LINE_IDS.every((lineId) => save.completedLines.includes(lineId)),
    [save],
  );

  /* ---------- 成就（成就扩容批次）：番外 / 真心蛙友 / 全通 / 真话罐——随存档变化结算（unlockAchievement 幂等） ---------- */
  useEffect(() => {
    if (save.sideStoriesSeen.length >= sideStoryTotal()) unlockAchievement("ach-side-all");
    if (affinityList.some((row) => !row.isSelf && row.percent >= TRUE_FRIEND_THRESHOLD)) {
      unlockAchievement("ach-true-friend");
    }
    if (graduateReady) unlockAchievement("ach-all-lines");
    if (truthJarReport(save).complete) unlockAchievement("ach-truth-jar");
  }, [save, affinityList, graduateReady]);

  /* ---------- 校园是活的系统（批次 AP） ---------- */

  /** 维修中的楼（批次 AP）：第 2 天起按种子派生（约四分之一的概率一天一栋），期末周与开学第一天不修；
   *  不提前通知——玩家到了门口才看见门上的告示。 */
  const maintenanceBuilding = useMemo<BuildingId | null>(() => {
    if (day <= 1 || finalWeek) return null;
    if (seedRandom(save.weatherSeed * 97 + day * 53) >= 0.26) return null;
    const candidates = BUILDINGS.filter((item) => item.id !== "lake");
    const picked =
      candidates[Math.floor(seedRandom(save.weatherSeed * 89 + day * 29) * candidates.length) % candidates.length];
    return picked?.id ?? null;
  }, [day, finalWeek, save.weatherSeed]);

  /** 今日课（批次 AP）：课表 10 节循环——第 (day-1) % 10 节是今天的课 */
  const classSlot = useMemo(() => todaySlotOf(day), [day]);
  const todayClassKind = useMemo<ClassKind | null>(() => {
    const schedule = save.classSchedule ?? [];
    const kind = schedule[classSlot];
    return kind === "study" || kind === "talk" || kind === "show" || kind === "talkwith" ? kind : null;
  }, [save.classSchedule, classSlot]);
  /** 今天已经处理过课（上过或逃过） */
  const classHandledToday = useMemo(() => (save.lastClassDay ?? 0) >= day, [save, day]);

  /** 提前毕业可申请（批次 AP）：本学期走过两条线即可申请；全通之后入口消失（那时有完整的典礼） */
  const canApplyGraduation = useMemo(() => doneCount >= 2 && !graduateReady, [doneCount, graduateReady]);

  /* ---------- 校园是活的系统（批次 AP）：浮层与动作 ---------- */

  const openSchedule = useCallback(() => setScheduleOpen(true), []);
  const closeSchedule = useCallback(() => setScheduleOpen(false), []);
  const closeMaintenance = useCallback(() => setMaintenanceOpen(null), []);
  const closeReturn = useCallback(() => setReturnRecord(null), []);

  /** 去上课（批次 AP）：按课型给数值——学校把你往哪边推，你就往哪边走一步 */
  const doAttend = useCallback(
    (kind: ClassKind): boolean => {
      if (attendClass(kind, day) === null) return false;
      setSave(loadGameSave());
      return true;
    },
    [day],
  );

  /** 逃课（批次 AP）：逃课会被记录——次数多了，课被排进更空的教室 */
  const doSkip = useCallback((): boolean => {
    if (skipClass(day) === null) return false;
    setSave(loadGameSave());
    return true;
  }, [day]);

  /** 申请毕业（批次 AP）：毕业不必等十条线走完——学校照发证；跳图鉴，典礼已经布置好了 */
  const openGraduate = useCallback(() => setGraduateOpen(true), []);
  const closeGraduate = useCallback(() => setGraduateOpen(false), []);
  const applyGraduation = useCallback((): boolean => {
    if (doneCount < 2 || graduateReady) return false;
    if (!graduateEarly()) return false;
    try {
      window.sessionStorage.setItem(EARLY_CEREMONY_FLAG, "1");
    } catch {
      /* 会话存储不可用就不自动开典礼——图鉴入口还在 */
    }
    setSave(loadGameSave());
    navigate("/endings");
    return true;
  }, [doneCount, graduateReady, navigate]);

  /* ---------- 校园的声音（批次 AQ）：广播 / 点名 / 期末公示 ---------- */

  /** 广播要念的那句（真话罐按种子取一条；传过几手就念更短的版本） */
  const broadcastInfo = useMemo(() => broadcastTruthOf(save), [save]);
  /** 点名剩余次数：本学期两次名单日，剩下的还没轮到 */
  const rollcallRemaining = Math.max(0, 2 - (save.rollcallLog ?? []).length);
  /** 名单更新：未应答攒满三，点名不再叫你的名字 */
  const rollcallSkipped = (save.rollcallMisses ?? 0) >= 3;

  const closeNotice = useCallback(() => setNoticeOpen(false), []);
  const closeBroadcast = useCallback(() => setBroadcastOpen(false), []);
  const dismissRollcall = useCallback(() => setRollcallDay(null), []);

  /* ---------- 你的位置（批次 AR）：替身 / 签收 / 署名启事 ---------- */

  /** 那份等你签收的东西与那张署名启事（种子派生：同一颗种子同一份） */
  const packageInfo = useMemo<{ day: number; item: PackageItem }>(
    () => ({ day: packageDayOf(save.weatherSeed), item: packageItemOf(save.weatherSeed) }),
    [save.weatherSeed],
  );
  const postedInfo = useMemo<{ day: number; doc: PostedDoc }>(
    () => ({ day: postedDayOf(save.weatherSeed), doc: postedDocOf(save.weatherSeed) }),
    [save.weatherSeed],
  );
  /** 签收入口亮着（页脚按钮）：到了、没签、还没被代签 */
  const canSignPackage = day >= packageInfo.day && !save.packageSigned && !save.packageReplaced;
  /** 替身还没见过：逃课满三次——第一次进课表先看见它 */
  const surrogateDue = (save.skips ?? 0) >= 3 && save.surrogateEver !== true;
  /** 名字被使用的累计次数（亲手签 + 被代签，跨学期保留） */
  const signingsCount = save.signings ?? 0;

  const openPackage = useCallback(() => setPackageOpen(true), []);
  const closePackage = useCallback(() => setPackageOpen(false), []);
  const closePackageReplaced = useCallback(() => setPackageReplacedOpen(false), []);
  const closePosted = useCallback(() => setPostedOpen(false), []);

  /** 亲手签收：档案一行「该蛙签收了它自己都不知道是什么的东西」 */
  const doSignPackage = useCallback((): boolean => {
    if (signPackage() === null) return false;
    setSave(loadGameSave());
    return true;
  }, []);

  /** 见过替身（落档）：此后它一直在——档案没换名字 */
  const ackSurrogate = useCallback(() => {
    markSurrogateSeen();
    setSave(loadGameSave());
  }, []);

  /** 看过署名启事（落档 + 收浮层）：档案里没有这一行——它不记录它没安排的事 */
  const ackPosted = useCallback(() => {
    markPostedSeen();
    setSave(loadGameSave());
    setPostedOpen(false);
  }, []);

  /* ---------- 另一些日子（批次 AS）：停课 / 清点 / 教研室的门 ---------- */

  /** 今天是不是停课日：课表动作区换停课说明，页脚课标跟着改 */
  const isHolidayToday = useMemo(
    () => day === holidayDayOf(save.weatherSeed),
    [day, save.weatherSeed],
  );

  /** 过了停课这一天（落档 + 收浮层）：档案里这一天是空的 */
  const ackHoliday = useCallback(() => {
    markHolidayPlayed();
    setSave(loadGameSave());
    setHolidayOpen(false);
  }, []);

  /** 清点过了（落档 + 收浮层）：你被数过了，在柜 */
  const ackInventory = useCallback(() => {
    markInventoryDone();
    setSave(loadGameSave());
    setInventoryOpen(false);
  }, []);

  /** 站过了教研室门外（落档 + 收浮层）：门内无记录 */
  const ackOffice = useCallback(() => {
    markOfficeSeen();
    setSave(loadGameSave());
    setOfficeOpen(false);
  }, []);

  /* ---------- 会议（批次 BG）：列席 → 执笔 ---------- */

  /** 会议上的那只蛙：好感最高的非主角——举到一半的手是它的（不足 40 点按种子指定一只） */
  const meetingFrogId = useMemo<FrogCharacterId>(() => {
    const closest = closestFrogOf(save);
    if (closest !== null) return closest;
    const pool = (Object.keys(FROG_CHARACTERS) as FrogCharacterId[]).filter((id) => id !== "naiBai");
    return pool[Math.floor(seedRandom((Math.round(save.weatherSeed) % 1000000) * 619 + 83) * pool.length)] ?? pool[0] ?? "moMo";
  }, [save]);

  /** 会议名册：议题、主持人、与会成员（同一颗种子同一间会议室；点名那只不在名册里） */
  const meetingRoster = useMemo<MeetingRoster>(
    () => meetingRosterOf(save.weatherSeed, meetingRole ?? "list", FROG_CHARACTERS[meetingFrogId].displayName),
    [save.weatherSeed, meetingRole, meetingFrogId],
  );

  /** 会议上的那只蛙的名字：举到一半的手是它的（两场会议都用它） */
  const meetingObjectorName = FROG_CHARACTERS[meetingFrogId].displayName;

  /** 列席完了（落档 + 收浮层）：口径是开没开口——说没说，纸上都一样 */
  const ackMeetingList = useCallback(
    (spoke: boolean) => {
      markMeetingList(day, spoke);
      setSave(loadGameSave());
      setMeetingRole(null);
    },
    [day],
  );

  /** 执笔完了（落档 + 收浮层）：那句反对记了还是没记——它知道你选了哪一边 */
  const ackMeetingRecorder = useCallback(
    (objection: "kept" | "dropped") => {
      markMeetingRecorder(day, objection, meetingFrogId);
      setSave(loadGameSave());
      setMeetingRole(null);
    },
    [day, meetingFrogId],
  );

  /* ---------- 交接（批次 BH）：移交单 → 抽屉 → 结论 ---------- */

  /** 抽屉里积压的档案（种子派生：同一颗种子同一只抽屉） */
  const handoverItems = useMemo<HandoverItem[]>(
    () =>
      pendingHandoverOf(save.weatherSeed).map((item: PendingHandover) => ({
        frogName: FROG_CHARACTERS[item.frogId].displayName,
        text: item.text,
        day: item.day,
      })),
    [save.weatherSeed],
  );

  /** 三份的结论一次签完（落档 + 数值 + 收浮层）：属实 −4 好感/+1 表演，核销 +4 好感/+1 被注意 */
  const ackHandover = useCallback(
    (verdicts: ("confirmed" | "denied")[]) => {
      const pending = pendingHandoverOf(save.weatherSeed);
      markHandover(
        day,
        pending.map((item, index) => ({ frogId: item.frogId, verdict: verdicts[index] ?? "denied" })),
      );
      setSave(loadGameSave());
      setHandoverOpen(false);
    },
    [day, save.weatherSeed],
  );

  /* ---------- 补录（批次 BW）：未经申请的调阅要补一份说明——制度不追问内容，只收下你写的那一行 ---------- */

  /** 说明送达通知上的具体时刻（分钟，种子派生；表格时间栏用） */
  const explainMinute = useMemo<number>(() => explainMinuteOf(save.weatherSeed), [save.weatherSeed]);

  /** 补录完了（落档 + 数值 + 收浮层）：口径在 markExplainFiling 内（照深夜选项同一套） */
  const ackExplain = useCallback(
    (mode: "routine" | "unclear" | "confess" | "confess-all", subject: string) => {
      markExplainFiling(day, mode, subject);
      setSave(loadGameSave());
      setExplainOpen(false);
    },
    [day],
  );

  /* ---------- 会签（批次 BX）：说明流转到各部门——每个部门加自己的评语，制度不核对内容，只核对有这份说明 ---------- */

  /** 会签评语（种子派生：同一颗种子同一批，评语栏填的不是评语，是「有这份说明」这一件事） */
  const signOffItems = useMemo<SignOffItem[]>(() => signOffItemsOf(save.weatherSeed), [save.weatherSeed]);

  /** 会签完了（落档 + 收浮层）：口径在 markSignOff 内（制度不核对内容，只核对有这份说明） */
  const ackSignOff = useCallback(() => {
    markSignOff(day, "学工办", "有这份说明。");
    markSignOffSeen();
    setSave(loadGameSave());
    setSignOffOpen(false);
  }, [day]);

  /* ---------- 归档（批次 BY）：说明装订成卷——封卷、铅封、编号、入柜 ---------- */

  /** 卷号（学期内递增；柜子不问内容，只问封条颜色和编号对不对得上） */
  const sealVolume = useMemo(
    () => (save.sealLog ?? []).filter((item) => item.semester === save.playthrough).length + 1,
    [save],
  );

  /** 封条颜色（种子派生，同一颗种子同一色——制度不核对内容，只核对颜色和编号对得上） */
  const sealColor = useMemo(() => sealColorOf(save.weatherSeed), [save.weatherSeed]);

  /** 归档完了（落档 + 收浮层）：口径在 markSeal 内——封卷、铅封、编号、入柜 */
  const ackSeal = useCallback(() => {
    markSeal(day, sealVolume, sealColor);
    markSealSeen();
    setSave(loadGameSave());
    setSealOpen(false);
  }, [day, sealVolume, sealColor]);

  /* ---------- 撰写（批次 BZ）：空白档案页——你第一次从被记录的人，变成记录别人的人 ---------- */

  /** 档案柜里你写过的报告（跨学期保留——二周目的柜子里还在，署名是你学号） */
  const reportLog = useMemo<PlayerReport[]>(() => save.reportLog ?? [], [save]);

  /** 提交（落档 + 数值 + 刷新存档）：口径在 markPlayerReport 内；浮层留在原地展示回执——不可撤销。
     每学期只收一份亲手写的：守卫拦下（返回 false）时浮层给出「已收过」回执，不再停在提交那一步 */
  const submitReport = useCallback(
    (frogId: FrogCharacterId, claim: ReportClaim) => {
      const added = markPlayerReport(day, frogId, claim.verdict, claim.text);
      setSave(loadGameSave());
      return added !== null;
    },
    [day],
  );

  /** 收浮层（收下回执 / 合上空白页——没写就是没写，那张纸还在桌上） */
  const closeReport = useCallback(() => setReportOpen(false), []);

  /* ---------- 团体（批次 CA）：关系网——它们自己动 / 它们自己裂 ---------- */

  /** 它们行动时你看得见的内情：勾结被看见了（仅公示栏）——被看见的勾结不叫勾结，叫材料 */
  const factionExposed = useMemo(() => {
    if (factionActionId !== "bulletin") return null;
    const meta = factionById("bulletin");
    if (!meta?.exposed) return null;
    return (save.collusionSeen ?? []).some((id) => id === "administration" || id === "club")
      ? meta.exposed
      : null;
  }, [factionActionId, save]);

  /** 分裂通知的引子口径：你在这边才看得见内部说法——旁观只有外面的样子 */
  const factionSplitJoined = useMemo<boolean>(
    () => (factionSplitId ? factionJoinedSemesterOf(save, factionSplitId) !== null : false),
    [factionSplitId, save],
  );

  /** 你已经在这边（内情直接给你看；不再发邀请——加入没有第二次邀请这一栏） */
  const factionJoinedAlready = useMemo<boolean>(
    () => (factionActionId ? factionJoinedSemesterOf(save, factionActionId) !== null : false),
    [factionActionId, save],
  );

  /** 它们动了（加入 / 不掺和——加入没有退出这一栏，档案照写：该蛙所在团体） */
  const ackFactionAction = useCallback(
    (join: boolean) => {
      const id = factionActionId;
      if (!id) return;
      markFactionAction(day, id);
      if (join) joinFaction(day, id);
      else watchFaction(day, id);
      setSave(loadGameSave());
    },
    [day, factionActionId],
  );

  /** 站队（站一边 → 另一线永久关闭；两边都不站 → 两边都不再信任你） */
  const ackFactionSplit = useCallback(
    (side: FrogCharacterId | "none") => {
      const id = factionSplitId;
      if (!id) return;
      splitFaction(day, id, side);
      setSave(loadGameSave());
    },
    [day, factionSplitId],
  );

  /** 收下（行动回执 / 站队回执） */
  const closeFaction = useCallback(() => {
    setFactionActionId(null);
    setFactionSplitId(null);
  }, []);

  /* ---------- 递件（批次 CB）：团体要你办的第一件事——替它递一份写你的表 ---------- */

  /** 谁托的（档案腔脚本；加入过的那批才有） */
  const courierScript = useMemo<CourierScript | null>(
    () => (courierFactionId ? (courierScriptOf(courierFactionId) ?? null) : null),
    [courierFactionId],
  );

  /** 是不是第二次受托（递过一次之后，它说话就顺了） */
  const courierRepeat = useMemo<boolean>(
    () => (courierFactionId ? (save.courierLog ?? []).some((item) => item.factionId === courierFactionId) : false),
    [courierFactionId, save],
  );

  /** 递上去 / 压下去（落档 + 数值；浮层留在原地展示回执——递过的每一份都记在你名下） */
  const ackCourier = useCallback(
    (verdict: "delivered" | "held") => {
      const id = courierFactionId;
      if (!id || !courierFactState) return;
      markCourier(day, id, verdict, courierFactState.text);
      setSave(loadGameSave());
    },
    [day, courierFactionId, courierFactState],
  );

  /** 收下 */
  const closeCourier = useCallback(() => {
    setCourierFactionId(null);
    setCourierFactState(null);
  }, []);

  /* ---------- 离校（批次 CC）：发现 → 去找 → 三种回应 ---------- */

  /** 回应落档（接受 / 追问 / 沉默——没有正确的回应，只有你选了哪一种） */
  const ackDeparture = useCallback((response: "accepted" | "pursued" | "silent", steps?: number) => {
    respondDeparture(response, steps);
    setSave(loadGameSave());
  }, []);

  /** 收下 */
  const closeDeparture = useCallback(() => setDepartureFrogId(null), []);

  /* ---------- 消迹（批次 CF）：发现 → 追问 → 三种选择 ---------- */

  /** 选择落档（补录 / 不补 / 再问一次——没有正确的选择，只有你要不要认） */
  const ackVanish = useCallback((response: "filed" | "letgo" | "insist") => {
    respondVanish(response);
    setSave(loadGameSave());
  }, []);

  /** 收下 */
  const closeVanish = useCallback(() => setVanishText(null), []);

  /* ---------- 已结（批次 CG）：发现 → 查三处 → 三种选择 ---------- */

  /** 选择落档（添注 / 不动 / 替它记上——没有正确的选择，只有你认不认这份卷） */
  const ackFinished = useCallback((response: "annotate" | "still" | "note") => {
    respondFinished(response);
    setSave(loadGameSave());
  }, []);

  /** 收下 */
  const closeFinished = useCallback(() => setFinishedOpen(false), []);

  /* ---------- 批阅者（批次 CL）：发现 → 查三处 → 三种选择 ---------- */

  /** 选择落档（留条 / 等 / 不动——没有正确的选择） */
  const ackRecorder = useCallback((response: "note" | "wait" | "still") => {
    respondRecorder(response);
    setSave(loadGameSave());
  }, []);

  /** 收下 */
  const closeRecorder = useCallback(() => setRecorderOpen(false), []);

  /* ---------- 传染（批次 CM）：发现 → 三种选择 ---------- */

  /** 选择落档（继续 / 说一句话 / 不承认——没有正确的选择） */
  const ackQuieting = useCallback((response: "keep" | "speak" | "deny") => {
    respondQuieting(response);
    setSave(loadGameSave());
  }, []);

  /** 收下 */
  const closeQuieting = useCallback(() => setQuietingOpen(false), []);

  /* ---------- 交班（批次 CP）：发现 → 三种交法 ---------- */

  /** 选择落档（照单交 / 少交一项 / 多交一项——没有正确的选择） */
  const ackShift = useCallback(
    (response: "sign" | "omit" | "extra", items: number) => {
      respondShiftHandover(response, items);
      setSave(loadGameSave());
    },
    [],
  );

  /** 收下 */
  const closeShift = useCallback(() => setShiftOpen(false), []);

  /* ---------- 回单（批次 CQ）：发现 → 三种说明 ---------- */

  /** 应对落档（照认 / 指单 / 补圆——没有正确的，只有你交出去的版本） */
  const ackTestimony = useCallback(
    (response: "confirm" | "point" | "smooth") => {
      respondTestimony(response);
      setSave(loadGameSave());
    },
    [],
  );

  /** 收下 */
  const closeTestimony = useCallback(() => setTestimonyOpen(false), []);

  /* ---------- 接任（批次 CR）：发现 → 三种填法 ---------- */

  /** 填法落档（填名 / 交系统 / 填自己——没有正确的，只有栏里最后是谁） */
  const ackSuccession = useCallback(
    (pick: "name" | "blank" | "self", frog?: string) => {
      respondSuccession(pick, frog);
      setSave(loadGameSave());
    },
    [],
  );

  /** 收下 */
  const closeSuccession = useCallback(() => setSuccessionOpen(false), []);

  /* ---------- 误投（批次 CS）：发现 → 三种处理 ---------- */

  /** 处理落档（去更正 / 不吭声 / 原样退回——没有正确的，只有你把自己放在哪一栏） */
  const ackMisdelivery = useCallback(
    (pick: "correct" | "carry" | "return") => {
      respondMisdelivery(pick);
      setSave(loadGameSave());
    },
    [],
  );

  /** 收下 */
  const closeMisdelivery = useCallback(() => setMisdeliveryOpen(false), []);

  /* ---------- 补页（批次 CT）：发现 → 三种补法 ---------- */

  /** 补法落档（照实补述 / 少说一点 / 多写一点——没有正确的，只有补上去的是什么） */
  const ackLostPage = useCallback(
    (pick: "faithful" | "sparse" | "extra") => {
      respondLostPage(pick);
      setSave(loadGameSave());
    },
    [],
  );

  /** 收下 */
  const closeLostPage = useCallback(() => setLostPageOpen(false), []);

  /* ---------- 合档（批次 CV）：发现 → 三种处理 ---------- */

  /** 处理落档（拆卷 / 不管它 / 去认识它——没有正确的，只有那宗纸最后装着什么） */
  const ackMerger = useCallback(
    (pick: "split" | "carry" | "meet", frog?: string) => {
      respondMerger(pick, frog);
      setSave(loadGameSave());
    },
    [],
  );

  /** 收下 */
  const closeMerger = useCallback(() => setMergerOpen(false), []);

  /* ---------- 转递（批次 CW）：发现 → 三种送法 ---------- */

  /** 送法落档（让它们送 / 自己送 / 申请封缄——没有正确的，只有你的纸在路上被谁看过） */
  const ackTransit = useCallback(
    (pick: "send" | "self" | "seal") => {
      respondTransit(pick);
      setSave(loadGameSave());
    },
    [],
  );

  /** 收下 */
  const closeTransit = useCallback(() => setTransitOpen(false), []);

  /* ---------- 被读（批次 CY）：发现 → 三种处理 ---------- */

  /** 处理落档（签收回执 / 申请查明 / 装作没看见——没有正确的，只有你让这件事停在哪一层） */
  const ackBeread = useCallback(
    (pick: "ack" | "seek" | "hold") => {
      respondBeread(pick);
      setSave(loadGameSave());
    },
    [],
  );

  /** 收下 */
  const closeBeread = useCallback(() => setBereadOpen(false), []);

  /* ---------- 便条（批次 CZ）：发现 → 三种处理 ---------- */

  /** 处理落档（回一张 / 收着不回 / 去蹲信格——没有正确的，只有这张纸最后停在谁手里） */
  const ackNote = useCallback(
    (pick: "reply" | "keep" | "watch") => {
      respondNote(pick);
      setSave(loadGameSave());
    },
    [],
  );

  /** 收下 */
  const closeNote = useCallback(() => setNoteOpen(false), []);

  /* ---------- 定稿（批次 DA）：发现 → 三种处理 ---------- */

  /** 处理落档（逐行签字 / 指出一处 / 拒签——没有正确的，只有这个学期最后停在哪一栏） */
  const ackFinalize = useCallback(
    (pick: "sign" | "dispute" | "refuse") => {
      respondFinalize(pick);
      setSave(loadGameSave());
    },
    [],
  );

  /** 收下 */
  const closeFinalize = useCallback(() => setFinalizeOpen(false), []);

  const ackDestruction = useCallback(
    (pick: "burn" | "keep" | "copy") => {
      respondDestruction(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeDestruction = useCallback(() => setDestructionOpen(false), []);

  const ackRights = useCallback(
    (pick: "ack" | "exercise" | "decline") => {
      respondRights(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeRights = useCallback(() => setRightsOpen(false), []);

  const ackReconciliation = useCallback(
    (pick: "attend" | "question" | "absent") => {
      respondReconciliation(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeReconciliation = useCallback(() => setReconciliationOpen(false), []);

  const ackSelfEntry = useCallback(
    (pick: "filed" | "retained" | "blank") => {
      respondSelfEntry(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeSelfEntry = useCallback(() => setSelfEntryOpen(false), []);

  const ackOverdue = useCallback(
    (pick: "settle" | "extend" | "lose") => {
      respondOverdue(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeOverdue = useCallback(() => setOverdueOpen(false), []);

  const ackDeclaration = useCallback(
    (pick: "full" | "short" | "empty") => {
      respondDeclaration(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeDeclaration = useCallback(() => setDeclarationOpen(false), []);

  const ackOpenDay = useCallback(
    (pick: "self" | "others" | "away") => {
      respondOpenDay(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeOpenDay = useCallback(() => setOpenDayOpen(false), []);

  const ackSubstitute = useCallback(
    (pick: "serve" | "sign" | "refuse") => {
      respondSubstitute(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeSubstitute = useCallback(() => setSubstituteOpen(false), []);

  const ackPageNote = useCallback(
    (pick: "ack" | "leave" | "cross") => {
      respondPageNote(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closePageNote = useCallback(() => setPageNoteOpen(false), []);

  const ackMemory = useCallback(
    (pick: "all" | "one" | "none") => {
      respondMemory(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeMemory = useCallback(() => setMemoryOpen(false), []);

  const ackUnregistered = useCallback(
    (pick: "claim" | "leave" | "copy") => {
      respondUnregistered(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeUnregistered = useCallback(() => setUnregisteredOpen(false), []);

  const ackFlyleaf = useCallback(
    (pick: "read" | "fold" | "tear") => {
      respondFlyleaf(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeFlyleaf = useCallback(() => setFlyleafOpen(false), []);

  const ackClaim = useCallback(
    (pick: "return" | "keep" | "wait") => {
      respondClaim(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeClaim = useCallback(() => setClaimOpen(false), []);

  const ackJoint = useCallback(
    (pick: "sign" | "hold" | "edit") => {
      respondJoint(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeJoint = useCallback(() => setJointOpen(false), []);

  const ackLetterBox = useCallback(
    (pick: "both" | "closed" | "oneway") => {
      respondLetterBox(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeLetterBox = useCallback(() => setLetterBoxOpen(false), []);

  const ackNaming = useCallback(
    (pick: "give" | "hold" | "code") => {
      respondNaming(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeNaming = useCallback(() => setNamingOpen(false), []);

  const ackSameName = useCallback(
    (pick: "keep" | "give" | "change") => {
      respondSameName(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeSameName = useCallback(() => setSameNameOpen(false), []);

  const ackCatalog = useCallback(
    (pick: "bind" | "extract" | "loose") => {
      respondCatalog(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeCatalog = useCallback(() => setCatalogOpen(false), []);

  const ackCarryover = useCallback(
    (pick: "follow" | "pocket" | "surrender") => {
      respondCarryover(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeCarryover = useCallback(() => setCarryoverOpen(false), []);

  const ackBlank = useCallback(
    (pick: "keep" | "write" | "tuck") => {
      respondBlank(pick);
      setSave(loadGameSave());
    },
    [],
  );
  const closeBlank = useCallback(() => setBlankOpen(false), []);

  /* ---------- 地下组织（批次 CD）：没有名字的门 ---------- */

  /** 这学期的托付（帮哪只、办哪件——种子定，你挑不了） */
  const undergroundFavor = useMemo(
    () => undergroundFavorOf(save, save.weatherSeed),
    [save],
  );

  /** 帮它办 / 这次不帮（落档 + 数值；浮层留在原地展示回执——档案上不写） */
  const ackUnderground = useCallback(
    (doIt: boolean) => {
      const favor = undergroundFavorOf(save, save.weatherSeed);
      if (doIt) recordUndergroundFavor(day, favor.frogId, favor.kind);
      else recordUndergroundRefusal(day, favor.frogId);
      setSave(loadGameSave());
    },
    [day, save],
  );

  /** 收下 */
  const closeUnderground = useCallback(() => setUndergroundMode(null), []);

  /* ---------- 本能（批次 CE）：发作之后怎么面对 ---------- */

  /** 睡去（冬眠已发生，这一层只是把它变成可感的） */
  const ackInstinctSleep = useCallback(() => setInstinctMode(null), []);

  /** 收下（醒来 / 蜕完） */
  const closeInstinctMap = useCallback(() => setInstinctMode(null), []);

  /* ---------- 用途（批次 BR）：申报 → 不予受理 → 名目 → 结转 ---------- */

  /** 申报完了（落档 + 数值 + 收浮层）：受理计入考评 +1 表演；结转余额按名目算好（最多十点） */
  const ackBudget = useCallback(
    (purpose: "study" | "mood" | "other") => {
      markSilenceBudget(day, purpose);
      setSave(loadGameSave());
      setBudgetOpen(false);
    },
    [day],
  );

  /* ---------- 窗口（批次 BI）：值班 → 收表 → 签章 → 下班 ---------- */

  /** 窗口的普通表（种子派生：同一颗种子同一班） */
  const windowSheets = useMemo<string[]>(() => windowRequestsOf(save.weatherSeed), [save.weatherSeed]);

  /** 值班完了（落档 + 数值 + 收浮层）：表演 +2，退过件 −1/+2 被注意，没退过 +1；那份申请的蛙好感 +2 */
  const ackWindow = useCallback(
    (returned: boolean) => {
      markWindowOffice(day, returned, meetingFrogId);
      setSave(loadGameSave());
      setWindowOpen(false);
    },
    [day, meetingFrogId],
  );

  /* ---------- 帮带（批次 BJ）：帮带 → 本子 → 代值 → 出师 ---------- */

  /** 帮带是哪只（种子派生；点名那只已经举过手，不用再学） */
  const apprenticeFrogId = useMemo<FrogCharacterId>(
    () => mentorOf(save.weatherSeed, FROG_CHARACTERS[meetingFrogId].displayName),
    [save.weatherSeed, meetingFrogId],
  );

  /** 帮带完了（落档 + 数值 + 收浮层）：带教计入考评 +2 表演，它的章记在你名下 +1 被注意，它记得你教的 +2 好感 */
  const ackMentoring = useCallback(() => {
    markMentoring(day, apprenticeFrogId);
    setSave(loadGameSave());
    setMentoringOpen(false);
  }, [day, apprenticeFrogId]);

  /* ---------- 互查（批次 BK）：编组 → 同数 → 空档 → 补评 ---------- */

  /** 互查的六份档案（种子派生顺序；评语跟蛙走） */
  const auditPages = useMemo(
    () =>
      auditDossiersOf(save.weatherSeed).map((item) => ({
        name: FROG_CHARACTERS[item.frogId].displayName,
        comment: item.comment,
      })),
    [save.weatherSeed],
  );

  /** 互查完了（落档 + 数值 + 收浮层）：查阅 +1 被注意，检查计入考评 +1 表演 */
  const ackAudit = useCallback(
    (note: string) => {
      markAudit(day, note);
      setSave(loadGameSave());
      setAuditOpen(false);
    },
    [day],
  );

  /* ---------- 迎检（批次 BL）：迎检 → 轮查 → 查阅申请 → 检查意见 ---------- */

  /** 查你档案的那只（互查名单倒着排——你翻过它的柜子；点名那只不参与） */
  const inspectorFrogId = useMemo<FrogCharacterId>(
    () => inspectorOf(save.weatherSeed, FROG_CHARACTERS[meetingFrogId].displayName),
    [save.weatherSeed, meetingFrogId],
  );

  /** 受检完了（落档 + 数值 + 收浮层）：表演 +1，重点名册 +1 被注意，申请过查阅再加一笔 */
  const ackInspection = useCallback(
    (applied: boolean) => {
      markInspection(day, inspectorFrogId, applied);
      setSave(loadGameSave());
      setInspectionOpen(false);
    },
    [day, inspectorFrogId],
  );

  /* ---------- 门后（批次 BM）：调任 → 钥匙 → 递卷 → 名牌 ---------- */

  /** 来查档的那只（柜台不认人——你递出去的第一份，是你自己的那份） */
  const servedFrogId = useMemo<FrogCharacterId>(
    () => serverOf(save.weatherSeed, FROG_CHARACTERS[meetingFrogId].displayName),
    [save.weatherSeed, meetingFrogId],
  );

  /** 看柜完了（落档 + 数值 + 收浮层）：调任计入考评 +2 表演，新岗位进新名册 +1 被注意 */
  const ackArchive = useCallback(() => {
    markDoorDuty(day, servedFrogId);
    setSave(loadGameSave());
    setArchiveOpen(false);
  }, [day, servedFrogId]);

  /* ---------- 基准（批次 BN）：取样 → 基准线 → 比对 → 偏差 ---------- */

  /** 入选样本完了（落档 + 数值 + 收浮层）：入选样本计入考评 +2 表演——评价标准不需要被评价 */
  const ackBaseline = useCallback(() => {
    markBaseline(day);
    setSave(loadGameSave());
    setBaselineOpen(false);
  }, [day]);

  /* ---------- 不符（批次 BO）：退回 → 态度栏 → 对质 → 全齐 ---------- */

  /** 核完了（落档 + 数值 + 收浮层）：按基准来 −8 好感/+2 表演；复核 −4/+1/+1 被注意 */
  const ackMisalign = useCallback(
    (resolved: "aligned" | "reviewed") => {
      markAlign(day, meetingFrogId, resolved);
      setSave(loadGameSave());
      setMisalignOpen(false);
    },
    [day, meetingFrogId],
  );

  /* ---------- 结卷（批次 BP）：合订 → 目录 → 页脚 → 卷脊 ---------- */

  /** 本卷目录的计数（来自存档既有记录——同一颗种子同一本卷） */
  const volumeCounts = useMemo(
    () => ({
      meetings: (save.meetings ?? []).length,
      handovers: (save.handoverLog ?? []).length,
      shifts: (save.windowLog ?? []).length,
      mentorings: (save.mentoringLog ?? []).length,
      audits: (save.auditLog ?? []).length,
      inspections: (save.inspectionLog ?? []).length,
      duties: (save.doorDutyLog ?? []).length,
      baselines: (save.baselineLog ?? []).length,
      misalignments: (save.alignLog ?? []).length,
      truths: save.truthJar.length,
      endings: save.unlockedEndings.length,
    }),
    [save],
  );

  /** 结卷完了（落档 + 数值 + 收浮层）：结卷计入考评 +1 表演 */
  const ackVolume = useCallback(() => {
    markVolume(day);
    setSave(loadGameSave());
    setVolumeOpen(false);
  }, [day]);

  /* ---------- 登记（批次 BQ）：公告 → 签到表 → 事由 → 签名 ---------- */

  /** 登记完了（落档 + 数值 + 收浮层）：登记进名册 +1 被注意，到场计入考评 +1 表演 */
  const ackRegister = useCallback(() => {
    markRegister(day);
    setSave(loadGameSave());
    setRegisterOpen(false);
  }, [day]);

  /* ---------- 迎新（批次 BT）：报到 → 第一行 → 指路 → 编号 ---------- */

  /** 迎新完了（落档 + 数值 + 收浮层）：迎新计入考评 +2 表演，新蛙进名册 +1 被注意 */
  const ackOrientation = useCallback(
    (note: string) => {
      markOrientation(day, note);
      setSave(loadGameSave());
      setOrientationOpen(false);
    },
    [day],
  );

  /** 看过零点（收浮层）：空白的那一格，看过一次就够了 */
  const closeZero = useCallback(() => setZeroOpen(false), []);

  /* ---------- 腐烂（批次 BD）：场景会褪色——你不去的楼，会自己淡下去 ---------- */

  /** 某栋楼的褪色等级（0=完好 1=有点褪色 2=快想不起来自己了）：按距上次访问的学期差派生 */
  const decayOf = useCallback(
    (buildingId: BuildingId): 0 | 1 | 2 => {
      const last = save.lastVisits?.[buildingId];
      if (last === undefined || last <= 0) return 0;
      const gap = (save.playthrough ?? 1) - last;
      if (gap >= 2) return 2;
      if (gap >= 1) return 1;
      return 0;
    },
    [save],
  );

  /* ---------- 缺席（批次 BB）：沉默是你选择不说，缺席是你选择不在 ---------- */

  /** 角色不出现（批次 BB）：按种子派生某一天哪栋楼的主蛙没来（约 18%，同一颗种子同一天恒定） */
  const absenteeOf = useCallback(
    (offset: number): BuildingId | null => {
      if (seedRandom(save.weatherSeed * 211 + (day + offset) * 37) >= 0.18) return null;
      const pool = BUILDINGS.filter((item) => item.id !== "lake");
      const picked = pool[Math.floor(seedRandom(save.weatherSeed * 89 + (day + offset) * 61) * pool.length) % pool.length];
      return picked?.id ?? null;
    },
    [day, save.weatherSeed],
  );

  /** 选中线的缺席说明：今天没来 / 昨天没来今天带着一段你没见过的剧情回来了 */
  const absenteeNote = useMemo<string | null>(() => {
    if (!selectedLine) return null;
    if (absenteeOf(0) === selectedLine.building) {
      const frog = FROG_CHARACTERS[selectedLine.castIds[0]]?.displayName ?? "它";
      return `${frog}今天没来。不是请假——它有自己的事。缺席的角色，会在第二天带回来一段你没见过的剧情：那段是它自己的，不属于你。`;
    }
    if (absenteeOf(-1) === selectedLine.building) {
      const frog = FROG_CHARACTERS[selectedLine.castIds[0]]?.displayName ?? "它";
      return `${frog}昨天没来。它今天回来了——带着一段你没见过的剧情。那段剧情只属于它：你没有在场，档案也没有。`;
    }
    return null;
  }, [selectedLine, absenteeOf]);

  /** 玩家不出现（批次 BB）：今天不去了——按楼计数，你在但你不在场 */
  const doSkipVisit = useCallback((buildingId: BuildingId) => {
    recordVisitSkip(buildingId);
    setSave(loadGameSave());
  }, []);

  /* ---------- 替换（批次 BC）：不是换角色，是换位置 ---------- */

  /** 替它走这一趟（批次 BC）：本学期记一笔（结局相位消费口径）——已经替着别的线时办不成 */
  const doSubstitute = useCallback(
    (lineId: StorylineMeta["id"]): boolean => substituteFor(lineId),
    [],
  );

  /** 换位申请（批次 BC）：账台第六栏——你体验了别人的档案，但你的档案还在 */
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapCount, setSwapCount] = useState<number | null>(null);
  const doSwap = useCallback((): boolean => {
    const next = applySwap();
    setSwapCount(next);
    setSave(loadGameSave());
    return true;
  }, []);

  /** 点名应答：档案一行「该蛙应答。声音比平时低」 */
  const doAnswerRollcall = useCallback((): { answered: number; misses: number } | null => {
    if (rollcallDay === null) return null;
    const next = answerRollcall(rollcallDay);
    if (next === null) return null;
    setSave(loadGameSave());
    return next;
  }, [rollcallDay]);

  /** 点名未应答：被注意值 +1，名单上多一笔 */
  const doMissRollcall = useCallback((): { answered: number; misses: number } | null => {
    if (rollcallDay === null) return null;
    const next = missRollcall(rollcallDay);
    if (next === null) return null;
    setSave(loadGameSave());
    return next;
  }, [rollcallDay]);

  /* ---------- 印象分（顶栏小显示，档位称号） ---------- */

  const impression = useMemo(() => impressionPercent(save.reputation), [save.reputation]);
  const impressionTier = useMemo(() => impressionTierOf(impression), [impression]);

  const toggleAffinity = useCallback(() => setAffinityOpen((prev) => !prev), []);

  /** 收起引导：「知道了」和「跳过」都算看过，之后不再弹 */
  const dismissTutorial = useCallback(() => {
    setTutorialOpen(false);
    setSave(markTutorialSeen());
  }, []);

  const openLine = useCallback(
    (line: StorylineMeta) => {
      /* 维修（批次 AP）：这栋楼今天锁着——点开的是门上的告示，不是剧情卡 */
      if (maintenanceBuilding && line.building === maintenanceBuilding) {
        setMaintenanceOpen(line.building);
        return;
      }
      setSelectedLine(line);
    },
    [maintenanceBuilding],
  );

  const closeLine = useCallback(() => setSelectedLine(null), []);

  const startLine = useCallback(() => {
    if (!selectedLine) return;
    if (lineState(save, selectedLine.id) === "locked") return;
    /* 正文未填的空骨架线不标「进行中」：先探剧本有没有正文，避免占位线被计进度。
       剧本懒载未就绪时点击现拉（等模块到位再走，通常已在挂载后加载完） */
    const proceed = (scriptMap: Partial<Record<StorylineId, StoryScript>>) => {
      const script = scriptMap[selectedLine.id];
      if (script && script.acts.length > 0) {
        markLineVisited(selectedLine.id);
        setSave(loadGameSave());
      }
      navigate(`/play?line=${selectedLine.id}`);
    };
    if (lazyScripts) {
      proceed(lazyScripts);
      return;
    }
    void import("@/data/storylines").then((mod) => proceed(mod.STORY_SCRIPTS));
  }, [navigate, selectedLine, lazyScripts]);

  /** 章节选择（内容扩容批次）：走完的线可从指定幕直接重走——复用岔路册的 saveLineAct 跳转机制 */
  const startLineAtAct = useCallback(
    (actIndex: number) => {
      if (!selectedLine) return;
      if (!save.completedLines.includes(selectedLine.id)) return;
      saveLineAct(selectedLine.id, actIndex);
      markLineVisited(selectedLine.id);
      setSave(loadGameSave());
      navigate(`/play?line=${selectedLine.id}`);
    },
    [navigate, save.completedLines, selectedLine],
  );

  const backHome = useCallback(() => navigate("/"), [navigate]);

  const goToEndings = useCallback(() => navigate("/endings"), [navigate]);

  /* ---------- 深夜事件播放 ---------- */

  /* 深夜事件的 plus 拼装（照日程的接法）：补记认领（每学期一次）→ 旧结局渗入（每学期一次）→
     档案补记 → 还沉默（带利息，见贷必还）→ 混种回响（每学期一次）→ 穿回旧皮的回响（播一次即清）→ 全员共鸣（全档一次） */
  const buildNightPlus = useCallback((event: NightEvent): NightNode[] => {
    const plusNodes =
      (save.playthrough ?? 1) >= 2 && event.plus && event.plus.length > 0
        ? event.plus.map((node) => ({ ...node, remember: true }))
        : [];
    const claimed = save.dossierEchoPlayed ? null : claimedNoteNode(save);
    const archive = save.archiveClaimPlayed ? null : archiveClaimNode(save);
    /* 还沉默（批次 AJ）：出借中的账在下一次深夜事件连本带息收回——还款节点插在渗入之后 */
    const repay = repaySilence();
    const repayNode: NightNode | null =
      repay > 0
        ? {
            id: `loan-repay-${save.playthrough ?? 1}`,
            speakerId: "narration",
            text: `（有人把${repay}点沉默还了回来——${repay - LOAN_PRINCIPAL}点是利息。它没说是谁的，只说：「账清了。」）`,
          }
        : null;
    /* 混种回响（批次 AM）：混出来的这局，开学报表上多两行来历 */
    const hybridEcho = save.hybridEchoPlayed ? null : hybridEchoNode(save);
    const moltEcho = save.moltEchoPending ? moltEchoNode(save) : null;
    const chorus = croakChorusReady() ? croakChorusNode() : null;
    if (claimed) markDossierEchoed();
    if (archive) markArchiveClaimPlayed();
    if (hybridEcho) markHybridEchoed();
    if (moltEcho) clearMoltEcho();
    if (chorus) markCroakPlayed();
    return [claimed, archive, repayNode, hybridEcho, ...plusNodes, moltEcho, chorus].filter(Boolean) as NightNode[];
  }, [save]);

  const openNight = useCallback(() => {
    if (!tonightEvent) return;
    /* 二周目起：夜里也记得你——档案补记接在原节点之后、选项之前（纯叙事，数值不受影响）；
       上一学期档案里玩家自己写的那句，这一学期被当值的蛙照着念出来（批次 AA·档案认领） */
    const plusNodes = buildNightPlus(tonightEvent);
    /* 逐条对质（批次 V）：约谈事件把真话罐前 4 条原文变成对质节点——
       每条真话展开为「引子节点 → 承认节点 / 否认节点」三节点，承认后接下一条。
       承认走 0（真话罐口径不变）；否认走 +1 并把原文记进否认档案（recordDenial，跨周目保留）。
       全承认收束出独白；有否认收束出「记录在案」。 */
    let assembled = tonightEvent;
    /* 地下组织（批次 CD）：三种形态（招募 / 托付 / 断联）的节点按存档现拼 */
    if (tonightEvent.id === "night-underground") {
      assembled = undergroundEventFor(save, tonightEvent);
    }
    if (tonightEvent.interrogation && tonightEvent.interrogationCopy) {
      const copy = tonightEvent.interrogationCopy;
      /* 消迹（批次 CF）：被抽走的那一句也念不出来——它不在柜子里了 */
      const vanishedSet = new Set(vanishedTextsOf(loadGameSave()));
      const truths = loadGameSave()
        .truthJar.filter((item) => !vanishedSet.has(item))
        .slice(0, 4);
      const headNodes = tonightEvent.nodes.slice(0, 3);
      const nodes: typeof tonightEvent.nodes = [...headNodes];
      /* 共谋（批次 AZ）：约谈记录的最后一页夹着举报记录——上面有那个名字。你被记录了，
         但记录你的人是你认识的那只。 */
      const latest = loadGameSave();
      if (latest.reportedBy) {
        nodes.push({
          id: "night-talk-report",
          speakerId: "narration",
          text: `（举报记录夹在最后一页。举报人，${FROG_CHARACTERS[latest.reportedBy].displayName}。字迹很稳——不是第一次写你的名字了。）`,
        });
      }
      /* 回避（批次 BG）：约谈也是会。回避栏填最向着你的那只的名字——它不知道今天有这场约谈；
         从今天起凡是涉及你的事，它都不能在场。每学期至多办一次。 */
      const recused = recusalOf(latest);
      if (recused) {
        markRecusalSeen();
        nodes.push({
          id: "night-talk-recusal",
          speakerId: "narration",
          text: `（登记表上有一栏叫「回避」。你填了：${FROG_CHARACTERS[recused].displayName}。理由一栏，你写的是：与该蛙关系密切。它不知道今天有这场约谈。）`,
        });
        nodes.push({
          id: "night-talk-recusal-note",
          speakerId: "narration",
          text: `（从今天起，凡是涉及你的事，它都不能在场。这不是保护——是程序。程序不问它愿不愿意。档案：约谈回避，回避人员${FROG_CHARACTERS[recused].displayName}，已核。）`,
        });
      }
      truths.forEach((truth, i) => {
        nodes.push({
          id: `night-talk-q${i}`,
          speakerId: "narration",
          text: `${copy.lead.replace("{n}", String(i + 2))}
${truth}`,
        });
        nodes.push({
          id: `night-talk-a${i}`,
          speakerId: "narration",
          text: copy.admitNote,
        });
        nodes.push({
          id: `night-talk-d${i}`,
          speakerId: "narration",
          text: copy.denyNote,
        });
      });
      nodes.push(
        truths.length > 0
          ? { id: "night-talk-end-admit", speakerId: "narration", text: copy.allAdmit }
          : { id: "night-talk-end-empty", speakerId: "narration", text: copy.denyWrap },
      );
      /* 被重置（批次 AL）：约谈结束，名单先知道——被注意值清零，档案留一行（系统替你办，不收费） */
      const beforeAttention = resetAttention(0);
      if (beforeAttention > 0) {
        nodes.push({
          id: "night-talk-reset",
          speakerId: "narration",
          text: `（谈话结束。名单更新了——你不在上面了。不是被原谅，是这一页被换掉了。档案里多了一行：该蛙已被重置。此前被注意 ${beforeAttention} 点，现在从零开始记。）`,
        });
      }
      assembled = {
        ...tonightEvent,
        nodes,
        /* 对质路径的承认/否认选项由 chooseNight 的 interrogation 分支处理（不渲染 choices 浮层） */
        choice: undefined,
        choices: undefined,
      };
    }
    setNightActive(
      plusNodes.length > 0 ? { ...assembled, nodes: [...assembled.nodes, ...plusNodes] } : assembled,
    );
    setNightPhase("nodes");
    setNightNodeIndex(0);
    setNightPicked(null);
    /* 还沉默 / 渗入限额都可能改了档：弹层开着的时候把状态对齐到最新存档 */
    setSave(loadGameSave());
  }, [tonightEvent, save]);

  const advanceNight = useCallback(() => {
    if (!nightActive) return;
    if (nightNodeIndex + 1 < nightActive.nodes.length) {
      setNightNodeIndex((prev) => prev + 1);
      return;
    }
    /* 对质路径（批次 V）：约谈节点流末尾没有 choices 浮层——推进完直接落结算页 */
    if (nightActive.interrogation) {
      setNightPhase("aftermath");
      markNightEventSeen(nightActive.id, day);
      setSave(loadGameSave());
      return;
    }
    setNightPhase("choice");
  }, [nightActive, nightNodeIndex, day]);

  /** 把那句话说出口：沉默值按选项走，≤0 的文案自动进真话罐，被注意值同一口径，事件标记为已看 */
  const chooseNight = useCallback(
    (pickedChoice: NightChoice) => {
    /* 对质分支（批次 V）：承认/否认没有 choices 浮层，玩家点按钮直接给 NightChoice。
       承认走 0；否认走 +1 并把原文记进否认档案（recordDenial，跨周目保留）。
       选择后推进到该选择的旁白节点（aN=承认后 / dN=否认后），继续下一条对质——
       直到节点流末尾才走常规结算（advanceNight 的对质路径）。 */
    if (pickedChoice.id === "night-talk-admit" || pickedChoice.id === "night-talk-deny" || pickedChoice.id === "night-talk-tamper") {
      if (!nightActive) return;
      if (pickedChoice.silenceDelta !== 0) addSilence(pickedChoice.silenceDelta);
      if (pickedChoice.id === "night-talk-deny" && pickedChoice.text) recordDenial(pickedChoice.text);
      /* 修改记录（批次 AC）：不是说谎，是伪造公文——档案上那条真话被改掉，印象分 +2（改得干净也算本事） */
      if (pickedChoice.id === "night-talk-tamper") {
        if (pickedChoice.text) recordTamper(pickedChoice.text);
        addReputation(2);
      }
      const currentNode = nightActive.nodes[Math.min(nightNodeIndex, nightActive.nodes.length - 1)];
      const qIndex = Number(currentNode.id.replace("night-talk-q", "")) || 0;
      /* 修改记录走承认旁白那一格——改完的那页，看起来和「都承认」的那页一样干净 */
      const followId = pickedChoice.id === "night-talk-deny" ? `night-talk-d${qIndex}` : `night-talk-a${qIndex}`;
      const followIndex = nightActive.nodes.findIndex((n) => n.id === followId);
      if (followIndex >= 0) {
        setNightNodeIndex(followIndex);
        return;
      }
      setNightPhase("aftermath");
      markNightEventSeen(nightActive.id, day);
      setSave(loadGameSave());
      return;
    }
      if (!nightActive) return;
      /* 地下组织（批次 CD）：这一夜只占今天——招募每学期一次，托付等你决定，被看见的名字不能再用 */
      if (nightActive.id === "night-underground") {
        if (pickedChoice.silenceDelta !== 0) addSilence(pickedChoice.silenceDelta);
        markNightDaySpent(day);
        if (pickedChoice.id === "night-underground-join") {
          joinUnderground();
          markUndergroundMet();
          setUndergroundMode("join");
        } else if (pickedChoice.id === "night-underground-leave") {
          markUndergroundMet();
        } else if (pickedChoice.id === "night-underground-hear") {
          setUndergroundMode("job");
        } else if (pickedChoice.id === "night-underground-close") {
          markUndergroundClosedSeen();
        }
        /* 地下组织（批次 CD）：加入之后，深夜也是双面的——你看见的东西，第二天在别人的档案里少一行 */
        if (isUndergroundActive(loadGameSave())) {
          const job = undergroundJobTextOf("night", day);
          logUndergroundJob("night", day, job.surface, job.underneath);
        }
        setSave(loadGameSave());
        setNightPicked(pickedChoice);
        setNightPhase("aftermath");
        return;
      }
      if (pickedChoice.silenceDelta !== 0) addSilence(pickedChoice.silenceDelta);
      if (pickedChoice.silenceDelta <= 0) {
        addTruth(pickedChoice.text);
        addAttention(1);
      }
      if (pickedChoice.silenceDelta >= 2) addAttention(-1);
      /* 羁绊（批次 CY-100）：雨/雾夜隐藏戏落定——淋过同一把伞、在雾里说过话的蛙，好感先记上 */
      if (nightActive.affinityFrog && (nightActive.affinityDelta ?? 0) !== 0) {
        addAffinity(nightActive.affinityFrog, nightActive.affinityDelta ?? 0);
      }
      /* 私档（批次 BV）：「翻开」即调阅——先落档再刷新存档，随后弹出文书全屏层 */
      const isDossierOpen =
        Boolean(nightActive.dossier) && pickedChoice.id === `${nightActive.id}-open`;
      if (isDossierOpen && nightActive.dossier) markDossierRead(nightActive.dossier, day);
      /* 撰写（批次 BZ）：空白档案页每晚都在桌上，直到你写完——只占今天，不进已看清单 */
      const isReportNight = nightActive.id === "night-report-blank";
      const isReportOpen = isReportNight && pickedChoice.id === "night-report-blank-open";
      if (isReportNight) markNightDaySpent(day);
      else markNightEventSeen(nightActive.id, day);
      setSave(loadGameSave());
      if (isDossierOpen && nightActive.dossier) setDossierFrog(nightActive.dossier);
      if (isReportOpen) setReportOpen(true);
      setNightPicked(pickedChoice);
      setNightPhase("aftermath");
    },
    [nightActive, day],
  );

  /** 咽回去：什么都不发生，但今晚也过了 */
  const swallowNight = useCallback(() => {
    if (!nightActive) return;
    markNightEventSeen(nightActive.id, day);
    setSave(loadGameSave());
    setNightPicked(null);
    setNightPhase("aftermath");
  }, [nightActive, day]);

  const closeNight = useCallback(() => setNightActive(null), []);

  /* 私档文书层（批次 BV）：翻开即弹出文书全文，合上回到夜的落定 */
  const closeDossier = useCallback(() => setDossierFrog(null), []);

  /* 三周目免检批注（第三学期）：playthrough ≥ 3 且本夜事件有批注时，落定页追加一行档案腔；纯展示，节点流与数值不动 */
  const nightThirdNote = useMemo(
    () => ((save.playthrough ?? 1) >= 3 ? tonightEvent?.thirdNote : undefined),
    [save, tonightEvent],
  );

  /* ---------- 白日小事件「校园角落」播放（批次 I）：骨架照深夜，窗口只在白天 ---------- */

  const advanceDayEvent = useCallback(() => {
    if (!dayActive) return;
    if (dayNodeIndex + 1 < dayActive.nodes.length) {
      setDayNodeIndex((prev) => prev + 1);
      return;
    }
    setDayPhase("choice");
  }, [dayActive, dayNodeIndex]);

  /** 把那句话说出口：沉默值按选项走，≤0 的文案自动进真话罐，被注意值同一口径，事件标记为已看（照 chooseNight） */
  const chooseDayEvent = useCallback(
    (pickedChoice: DayChoice) => {
      if (!dayActive) return;
      if (pickedChoice.silenceDelta !== 0) addSilence(pickedChoice.silenceDelta);
      if (pickedChoice.silenceDelta <= 0) {
        addTruth(pickedChoice.text);
        addAttention(1);
      }
      if (pickedChoice.silenceDelta >= 2) addAttention(-1);
      markDayEventSeen(dayActive.id, day);
      setSave(loadGameSave());
      setDayPicked(pickedChoice);
      setDayPhase("aftermath");
    },
    [dayActive, day],
  );

  /** 咽回去：什么都不发生，但这件小事也算遇过了（同样记已看，今天不再弹第二个） */
  const swallowDayEvent = useCallback(() => {
    if (!dayActive) return;
    markDayEventSeen(dayActive.id, day);
    setSave(loadGameSave());
    setDayPicked(null);
    setDayPhase("aftermath");
  }, [dayActive, day]);

  const closeDayEvent = useCallback(() => setDayActive(null), []);

  /* 三周目免检批注：playthrough ≥ 3 且本事件有批注时，落定页追加一行档案腔（照深夜的接法） */
  const dayThirdNote = useMemo(
    () => ((save.playthrough ?? 1) >= 3 ? dayActive?.thirdNote : undefined),
    [save, dayActive],
  );

  /* ---------- 共通日程播放（批次 C1） ---------- */

  /** 打开一段日程：从头播（gate 场景播到结尾会进入认定表） */
  const openDateScene = useCallback((scene: CommonDateScene) => {
    setFilingOpen(false);
    setDateActive(scene);
    setDatePhase("nodes");
    setDateNodeIndex(0);
    setDatePicked(null);
    setGateStage(null);
    setGatePick(null);
    setGateReactionIndex(0);
  }, []);

  /** 关闭日程浮层：播放态全部归零 */
  const closeDate = useCallback(() => {
    setDateActive(null);
    setFilingOpen(false);
    setDatePhase("nodes");
    setDateNodeIndex(0);
    setDatePicked(null);
    setGateStage(null);
    setGatePick(null);
    setGateReactionIndex(0);
  }, []);

  /** 打开「路线认定」：gate 场景还没播过 → 先补播场景；已播 → 直接进认定表 */
  const openRouteFiling = useCallback(() => {
    const gateScene = COMMON_DATE_SCENES.find((scene) => scene.gate) ?? null;
    if (gateScene && !getPlayedCommonDays(save).includes(gateScene.day)) {
      openDateScene(gateScene);
      return;
    }
    setDateActive(null);
    setFilingOpen(true);
    setDatePhase("nodes");
    setDateNodeIndex(0);
    setDatePicked(null);
    setGateStage("table");
    setGatePick(null);
    setGateReactionIndex(0);
  }, [openDateScene, save]);

  /** 推进日程节点：末尾后 → gate 场景进认定表；有选项进 choice；否则标记已播进收尾 */
  const advanceDate = useCallback(() => {
    if (!dateActive) return;
    if (dateNodeIndex + 1 < dateActive.nodes.length) {
      setDateNodeIndex((prev) => prev + 1);
      return;
    }
    if (dateActive.gate) {
      setGateStage("table");
      setGatePick(null);
      return;
    }
    if (dateActive.choice && dateActive.choice.length > 0) {
      setDatePhase("choice");
      return;
    }
    markCommonDayPlayed(dateActive.day);
    setSave(loadGameSave());
    setDatePicked(null);
    setDatePhase("aftermath");
  }, [dateActive, dateNodeIndex]);

  /** 说出口：沉默值按选项走，≤ 0 的文案自动进真话罐，被注意值同一口径，日程标记已播 */
  const chooseDate = useCallback(() => {
    if (!dateActive) return;
    const pickedChoice = dateActive.choice?.[0];
    if (!pickedChoice) return;
    if (pickedChoice.silenceDelta !== 0) addSilence(pickedChoice.silenceDelta);
    if (pickedChoice.silenceDelta <= 0) {
      addTruth(pickedChoice.text);
      addAttention(1);
    }
    if (pickedChoice.silenceDelta >= 2) addAttention(-1);
    markCommonDayPlayed(dateActive.day);
    setSave(loadGameSave());
    setDatePicked(pickedChoice);
    setDatePhase("aftermath");
  }, [dateActive]);

  /** 咽回去：什么都不发生，但这一天也过了 */
  const swallowDate = useCallback(() => {
    if (!dateActive) return;
    markCommonDayPlayed(dateActive.day);
    setSave(loadGameSave());
    setDatePicked(null);
    setDatePhase("aftermath");
  }, [dateActive]);

  /* ---------- 路线认定流程（批次 C1） ---------- */

  /** 认定表点选：选蛙 → 二次确认；「先不填」→ 直接收尾（这一栏空着交上去） */
  const pickRouteOption = useCallback(
    (option: RoutePickOption) => {
      setGatePick(option);
      if (!option.frogId) {
        markCommonDayPlayed(dateActive?.day ?? GATE_DAY);
        setSave(loadGameSave());
        setGateStage("done");
        return;
      }
      setGateStage("confirm");
    },
    [dateActive],
  );

  /** 二次确认里反悔：回到认定表重选 */
  const backToGateTable = useCallback(() => {
    setGatePick(null);
    setGateStage("table");
  }, []);

  /** 二次确认通过：进入该蛙的即时反应 */
  const confirmGate = useCallback(() => {
    if (!gatePick?.frogId) return;
    setGateStage("reactions");
    setGateReactionIndex(0);
  }, [gatePick]);

  /** 推进反应：最后一句放完 → 锁定路线 + 标记已播 + 收尾卡 */
  const advanceGateReaction = useCallback(() => {
    const frogId = gatePick?.frogId;
    if (!frogId) return;
    const list = ROUTE_REACTIONS[frogId] ?? [];
    if (gateReactionIndex + 1 < list.length) {
      setGateReactionIndex((prev) => prev + 1);
      return;
    }
    lockRoute(frogId);
    markCommonDayPlayed(dateActive?.day ?? GATE_DAY);
    setSave(loadGameSave());
    setGateStage("done");
  }, [gatePick, gateReactionIndex, dateActive]);

  const selectedState: LineState = selectedLine ? lineState(save, selectedLine.id) : "ready";

  return {
    save,
    activeTheme,
    switchTheme,
    soundOn,
    toggleSound,
    bgmOn,
    toggleBgm,
    graduateReady,
    doneCount,
    silenceExpression,
    lakeUnlocked,
    affinityOpen,
    toggleAffinity,
    affinityList,
    trueFrogCount,
    collectedEndings,
    totalEndings,
    impressionPercent: impression,
    impressionTierLabel: impressionTier.label,
    impressionTierBlurb: impressionTier.blurb,
    /* 校园日历 */
    day,
    weatherInfo,
    weatherTomorrow,
    finalWeek,
    /* 每局差异层（批次 H3）：今日公告 + 天气性格闲话 */
    bulletin: bulletinForDay(day, save.weatherSeed, finalWeek),
    weatherBiasHint: WEATHER_BIAS_HINT[weatherBiasOf(save.weatherSeed)],
    attention: save.attention,
    examCountdown,
    nightState,
    /* 还剩几段夜里的事（批次 CY-32）：入口浮层显示 */
    nightRemaining,
    tonightEvent,
    nightActive,
    nightInterrogationCopy: nightActive?.interrogationCopy,
    nightPhase,
    nightNodeIndex,
    nightPicked,
    openNight,
    advanceNight,
    chooseNight,
    swallowNight,
    closeNight,
    nightThirdNote,
    /* 私档文书层（批次 BV）：翻开即展示文书全文；调阅痕随存档走 */
    dossierFrog,
    dossierRecord: dossierFrog ? privateDossierOfFrog(dossierFrog) ?? null : null,
    closeDossier,
    /* 白日小事件「校园角落」（批次 I） */
    dayActive,
    dayPhase,
    dayNodeIndex,
    dayPicked,
    dayThirdNote,
    advanceDayEvent,
    chooseDayEvent,
    swallowDayEvent,
    closeDayEvent,
    /* 共通日程与路线认定（批次 C1） */
    dateActive,
    filingOpen,
    datePhase,
    dateNodeIndex,
    datePicked,
    gateStage,
    gateOptions: routePickOptions,
    gatePick,
    gateReactionIndex,
    lockedRouteName,
    lockedRouteBuilding,
    routeFilingAvailable,
    dateEntries,
    dateDueCount,
    todayDateScene,
    todayDateRead,
    dateOverlayOpen: dateActive !== null || filingOpen,
    openDateScene,
    openRouteFiling,
    advanceDate,
    chooseDate,
    swallowDate,
    closeDate,
    pickRouteOption,
    backToGateTable,
    confirmGate,
    advanceGateReaction,
    tutorialOpen,
    dismissTutorial,
    /* 被记录的社会面（批次 AJ / AL / AO）：账台——借沉默（带利息）/ 替人背档案 / 申请重置 / 消耗沉默 */
    loanOut: save.silenceLoan ?? 0,
    carriedCount: save.carried ?? 0,
    carriedToday: (save.lastCarryDay ?? 0) >= day,
    resetsCount: save.resets ?? 0,
    spentCount: save.silenceSpent ?? 0,
    spentToday: (save.lastSpendDay ?? 0) >= day,
    ledgerOpen,
    openLedger,
    closeLedger,
    doLend,
    doCarry,
    doReset,
    doSpend,
    /* 校园是活的系统（批次 AP）：课表 / 维修 / 提前毕业 / 你回来了 */
    scheduleOpen,
    openSchedule,
    closeSchedule,
    todayClassKind,
    classSlot,
    classHandledToday,
    attendedCount: save.attended ?? 0,
    skipsCount: save.skips ?? 0,
    doAttend,
    doSkip,
    maintenanceBuilding,
    maintenanceOpen,
    closeMaintenance,
    canApplyGraduation,
    graduateOpen,
    openGraduate,
    closeGraduate,
    applyGraduation,
    returnRecord,
    returnOpen,
    decayed,
    closeReturn,
    /* 校园的声音（批次 AQ）：广播 / 点名 / 期末公示 */
    noticeOpen,
    closeNotice,
    broadcastOpen,
    closeBroadcast,
    broadcastInfo,
    rollcallOpen,
    rollcallRemaining,
    rollcallSkipped,
    dismissRollcall,
    doAnswerRollcall,
    doMissRollcall,
    /* 你的位置（批次 AR）：替身 / 签收 / 署名启事 */
    surrogateDue,
    ackSurrogate,
    packageInfo,
    canSignPackage,
    signingsCount,
    packageOpen,
    openPackage,
    closePackage,
    packageReplacedOpen,
    closePackageReplaced,
    doSignPackage,
    postedInfo,
    postedOpen,
    closePosted,
    ackPosted,
    /* 另一些日子（批次 AS）：停课 / 清点 / 教研室的门 */
    isHolidayToday,
    holidayOpen,
    ackHoliday,
    inventoryOpen,
    ackInventory,
    officeOpen,
    ackOffice,
    /* 会议（批次 BG）：列席 → 执笔 */
    meetingRole,
    meetingRoster,
    meetingObjectorName,
    ackMeetingList,
    ackMeetingRecorder,
    /* 交接（批次 BH）：移交单 → 抽屉 → 结论 */
    handoverOpen,
    handoverItems,
    ackHandover,
    /* 补录（批次 BW）：未经申请的调阅要补一份说明——制度不追问内容，只收下你写的那一行 */
    explainOpen,
    explainMinute,
    ackExplain,
    /* 会签（批次 BX）：说明流转到各部门——每个部门加自己的评语，制度不核对内容，只核对有这份说明 */
    signOffOpen,
    signOffItems,
    ackSignOff,
    /* 归档（批次 BY）：说明装订成卷——封卷、铅封、编号、入柜 */
    sealOpen,
    sealVolume,
    sealColor,
    ackSeal,
    /* 撰写（批次 BZ）：空白档案页——你第一次从被记录的人，变成记录别人的人 */
    reportOpen,
    reportLog,
    submitReport,
    closeReport,
    /* 团体（批次 CA）：它们自己动 / 它们自己裂——你可以加入，也可以旁观 */
    factionAction: factionActionId ? (factionById(factionActionId) ?? null) : null,
    factionExposed,
    factionJoinedAlready,
    ackFactionAction,
    factionSplit: factionSplitId ? (factionById(factionSplitId) ?? null) : null,
    factionSplitJoined,
    ackFactionSplit,
    closeFaction,
    /* 递件（批次 CB）：团体要你办的第一件事——替它递那份写你的表 */
    courierScript,
    courierRepeat,
    courierFact: courierFactState,
    ackCourier,
    closeCourier,
    /* 离校（批次 CC）：它不在了——发现、去找、三种回应（没有正确的回应） */
    departureMeta: departureFrogId ? (departureMetaOf(departureFrogId) ?? null) : null,
    departureOtherName,
    ackDeparture,
    closeDeparture,
    /* 消迹（批次 CF）：那一栏空了——发现、追问、三种选择（没有正确的选择） */
    vanishText,
    vanishJarCount: save.truthJar.length,
    vanishSpeakerName,
    ackVanish,
    closeVanish,
    /* 已结（批次 CG）：那份提前归好的卷——发现、查三处、三种选择（没有正确的选择） */
    finishedOpen,
    finishedAnnotate: finishedNoteOf(save) ?? null,
    ackFinished,
    closeFinished,
    /* 批阅者（批次 CL）：落款——发现、查三处、三种选择（没有正确的选择） */
    recorderOpen,
    recorderNoteLeft: save.recorderNoteLeft === true,
    ackRecorder,
    closeRecorder,
    /* 传染（批次 CM）：校园安静下来了——发现、三种选择（没有正确的选择） */
    quietingOpen,
    quietCarried,
    ackQuieting,
    closeQuieting,
    /* 交班（批次 CP）：学期末的经办交接——照单交 / 少交一项 / 多交一项 */
    shiftOpen,
    shiftItems: shiftItemsOf(save),
    ackShift,
    closeShift,
    /* 回单（批次 CQ）：签过的单子回来了——照认 / 指单 / 补圆 */
    testimonyOpen,
    testimonyAbout,
    ackTestimony,
    closeTestimony,
    /* 接任（批次 CR）：接办人一栏归你管了——填名 / 交系统 / 填自己 */
    successionOpen,
    successionCandidate,
    ackSuccession,
    closeSuccession,
    /* 误投（批次 CS）：去更正 / 不吭声 / 原样退回 */
    misdeliveryOpen,
    ackMisdelivery,
    closeMisdelivery,
    /* 补页（批次 CT）：照实补述 / 少说一点 / 多写一点 */
    lostPageOpen,
    ackLostPage,
    closeLostPage,
    /* 合档（批次 CV）：申请拆卷 / 不管它 / 去认识它 */
    mergerOpen,
    mergerCounterpart,
    ackMerger,
    closeMerger,
    /* 转递（批次 CW）：让它们送 / 自己送 / 申请封缄 */
    transitOpen,
    ackTransit,
    closeTransit,
    /* 被读（批次 CY）：签收回执 / 申请查明 / 装作没看见 */
    bereadOpen,
    ackBeread,
    closeBeread,
    /* 便条（批次 CZ）：回一张 / 收着不回 / 去蹲信格 */
    noteOpen,
    ackNote,
    closeNote,
    /* 定稿（批次 DA）：逐行签字 / 指出一处 / 拒签 */
    finalizeOpen,
    ackFinalize,
    closeFinalize,
    /* 销毁（批次 DB）：照单焚化 / 申请留存 / 抄一遍再焚化 */
    destructionOpen,
    ackDestruction,
    closeDestruction,
    /* 权利（批次 DC）：签收 / 行使 / 不签 */
    rightsOpen,
    ackRights,
    closeRights,
    /* 对账（批次 DD）：到场 / 问一句 / 不到场 */
    reconciliationOpen,
    ackReconciliation,
    closeReconciliation,
    /* 自记（批次 DE）：照格式记 / 不照格式记 / 不记 */
    selfEntryOpen,
    ackSelfEntry,
    closeSelfEntry,
    /* 催办（批次 DF）：办结 / 申请延期 / 逾期挂失 */
    overdueOpen,
    ackOverdue,
    closeOverdue,
    /* 申报（批次 DG）：全报 / 少报一样 / 空报 */
    declarationOpen,
    ackDeclaration,
    closeDeclaration,
    /* 开放日（批次 DH）：查本宗 / 查摘要 / 不去 */
    openDayOpen,
    ackOpenDay,
    closeOpenDay,
    /* 顶班（批次 DI）：照办 / 留名 / 不顶 */
    substituteOpen,
    ackSubstitute,
    closeSubstitute,
    /* 页边（批次 DJ）：回一个字 / 不动它 / 划掉 */
    pageNoteOpen,
    ackPageNote,
    closePageNote,
    /* 记性（批次 DK）：照实核 / 只说一件 / 不核 */
    memoryOpen,
    ackMemory,
    closeMemory,
    /* 登记（批次 DL）：认领 / 不认领 / 抄进抽屉 */
    unregisteredOpen,
    ackUnregistered,
    closeUnregistered,
    /* 扉页（批次 DM）：照读 / 折起来 / 撕掉 */
    flyleafOpen,
    ackFlyleaf,
    closeFlyleaf,
    /* 认领（批次 DN）：领回 / 不领 / 让它们找 */
    claimOpen,
    ackClaim,
    closeClaim,
    /* 联名（批次 DO）：签 / 不签 / 改一处 */
    jointOpen,
    ackJoint,
    closeJoint,
    /* 互通（批次 DP）：通 / 不通 / 单向 */
    letterBoxOpen,
    ackLetterBox,
    closeLetterBox,
    /* 命名（批次 DQ）：起一个 / 不起 / 起一个像编号的 */
    namingOpen,
    ackNaming,
    closeNaming,
    /* 同名（批次 DR）：认下 / 让给它 / 换个名 */
    sameNameOpen,
    ackSameName,
    closeSameName,
    /* 总目（批次 DS）：装订 / 抽走一页 / 不装订 */
    catalogOpen,
    ackCatalog,
    closeCatalog,
    /* 结转（批次 DT）：照单 / 全带走 / 全交出 */
    carryoverOpen,
    ackCarryover,
    closeCarryover,
    /* 留白（批次 DU）：照留 / 写一句 / 夹一张纸 */
    blankOpen,
    ackBlank,
    closeBlank,
    /* 地下组织（批次 CD）：没有名字的门——加入之后你的选择都是双面的 */
    undergroundMode,
    undergroundFavor,
    undergroundJobs: save.undergroundJobs ?? [],
    ackUnderground,
    closeUnderground,
    /* 本能（批次 CE）：发作中的那一种——睡去 / 醒来 / 蜕皮 */
    instinctMode,
    missedItems,
    moltNote: moltNoteState,
    ackInstinctSleep,
    closeInstinctMap,
    /* 用途（批次 BR）：申报 → 不予受理 → 名目 → 结转 */
    budgetOpen,
    ackBudget,
    /* 窗口（批次 BI）：值班 → 收表 → 签章 → 下班 */
    windowOpen,
    windowSheets,
    ackWindow,
    /* 帮带（批次 BJ）：帮带 → 本子 → 代值 → 出师 */
    mentoringOpen,
    apprenticeName: FROG_CHARACTERS[apprenticeFrogId].displayName,
    ackMentoring,
    /* 互查（批次 BK）：编组 → 同数 → 空档 → 补评 */
    auditOpen,
    auditPages,
    ackAudit,
    /* 迎检（批次 BL）：迎检 → 轮查 → 查阅申请 → 检查意见 */
    inspectionOpen,
    inspectorName: FROG_CHARACTERS[inspectorFrogId].displayName,
    ackInspection,
    /* 门后（批次 BM）：调任 → 钥匙 → 递卷 → 名牌 */
    archiveOpen,
    servedName: FROG_CHARACTERS[servedFrogId].displayName,
    ackArchive,
    /* 基准（批次 BN）：取样 → 基准线 → 比对 → 偏差 */
    baselineOpen,
    ackBaseline,
    /* 不符（批次 BO）：退回 → 态度栏 → 对质 → 全齐 */
    misalignOpen,
    ackMisalign,
    /* 结卷（批次 BP）：合订 → 目录 → 页脚 → 卷脊 */
    volumeOpen,
    volumeCounts,
    ackVolume,
    /* 登记（批次 BQ）：公告 → 签到表 → 事由 → 签名 */
    registerOpen,
    ackRegister,
    /* 迎新（批次 BT）：报到 → 第一行 → 指路 → 编号 */
    orientationOpen,
    ackOrientation,
    /* 开口（批次 AU）：零点 */
    zeroOpen,
    closeZero,
    /* 缺席（批次 BB）与替换（批次 BC）与腐烂（批次 BD） */
    absenteeNote,
    doSkipVisit,
    doSubstitute,
    decayOf,
    swapOpen,
    setSwapOpen,
    swapCount,
    doSwap,
    goToEndings,
    tiles,
    hoverBuilding,
    setHoverBuilding,
    selectedLine,
    selectedLockHint,
    selectedState,
    openLine,
    closeLine,
    startLine,
    startLineAtAct,
    completedLineIds: save.completedLines,
    /* 角色番外（番外篇批次） */
    sideStoryFrog,
    sideStoryId,
    sideStoriesSeen: save.sideStoriesSeen,
    openSideStory,
    closeSideStory,
    finishSideStory,
    backHome,
  };
}
