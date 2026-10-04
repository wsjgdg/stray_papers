/**
 * 结局图鉴 Logic 层：读存档 unlockedEndings → 把各线结局聚合成分组卡数据
 * → 槽位三态（未解锁剪影 / 已解锁可回看 / 单线全收集）→ 全文弹层 → 统计与全收集彩蛋。
 * 本页只读展示，不写存档；湖边隐藏线的开放状态沿用「常规线全通」口径。不含 JSX。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FROG_CHARACTERS, affinityTierOf, type FrogCharacterId } from "@/data/characters";
import { exclusiveSideStoryOf, sideStoryById, sideStoryOf } from "@/data/sideStories";
import { buildShelf } from "@/components/endings/SideStoryShelfSection";
import type { GalleryPreset } from "@/lib/gameSave";
import { ROUTE_FROG_IDS } from "@/data/commonRoute";
import {
  ALL_LINE_IDS,
  SECRET_ENDING,
  STORYLINES,
  STORY_SCRIPTS,
  HIDDEN_ENDINGS,
  storylineById,
  type Ending,
  type StorylineId,
  type StorylineMeta,
} from "@/data/storylines";
import { EXPORT_DONE_EVENT, capturePng } from "@/lib/exportPng";
import {
  applyThemeToDocument,
  getLockedRoute,
  getPlaythrough,
  isLakeUnlocked,
  loadChoiceSemesters,
  loadGameSave,
  loadSettings,
  loadTheme,
  persistTheme,
  saveLineAct,
  saveSettings,
  tearEnding as recordTornEnding,
  type GameSaveData,
  type ThemeId,
  getDossiers,
  getShedSkins,
  wearSkin,
  closeCabinet,
  openCabinet,
  sayWord,
  hasSeenSideStory,
  markSurveyDone,
  borrowerOf,
  markBorrower,
  frogIndexOf,
  existenceSummaryOf,
  existenceTierOf,
  existenceSpecialOf,
  existenceTogglesOf,
  markExistenceIntroSeen,
  setExistenceVerdict,
  factionJoinedCountOf,
  isFactionOutside,
  undergroundFavorCountOf,
  vanishedTextsOf,
  displayNameOf,
  getEndingFavorites,
  toggleEndingFavorite,
  getMemorabilia,
} from "@/lib/gameSave";
import { ALL_NIGHT_EVENTS, NIGHT_TALK_EVENT } from "@/data/nightEvents";
import { seedRandom } from "@/lib/calendar";
import { ROUTE_DIPLOMA_NOTES } from "@/data/commonRoute";
import {
  bulletinReviewOf,
  impressionPercent as impressionPercentOf,
  impressionTierOf,
  truthJarReport,
} from "@/lib/impression";
import {
  affinityPercent,
  allTrueFriends as allTrueFriendsOf,
  topTrueFrog,
} from "@/lib/affinity";

/** 各线分组卡头像：常规线用该线主蛙，湖边夜谈是五蛙同框 */
const LINE_FROGS: Record<StorylineId, FrogCharacterId[]> = {
  "first-class": ["naiBai"],
  "roll-king": ["moMo"],
  canteen: ["ganFanShu"],
  club: ["meiMei"],
  lawn: ["huiHui"],
  lake: ["naiBai", "moMo", "meiMei", "huiHui", "ganFanShu"],
  "self-study": ["zaiZai"],
  administration: ["geGe"],
  "lights-out": ["huiHui", "geGe"],
  "sick-note": ["mianMian"],
};

export interface EndingSlotData {
  ending: Ending;
  unlocked: boolean;
  /** 沉默值档位标签，如「沉默值 13+」 */
  tierLabel: string;
  /** 未解锁时的条件提示（不剧透标题与正文），如「这条线沉默值 13+ 时揭晓」 */
  hint: string;
  /** 被玩家撕掉（批次 AD）：内容从图鉴消失，只剩撕口与「已撕」章 */
  torn?: boolean;
}

export interface EndingLineGroup {
  meta: StorylineMeta;
  frogIds: FrogCharacterId[];
  /** 湖边隐藏线：常规线没全通时整条线还没开放 */
  lineOpen: boolean;
  slots: EndingSlotData[];
  collectedCount: number;
  totalCount: number;
  /** 单线全收集标记 */
  complete: boolean;
}

export interface EndingDetail {
  /** 结局 id（批次 AD）：已解锁详情才有——「撕掉这一页」的入口凭它定位 */
  endingId?: string;
  title: string;
  text: string;
  lineTitle: string;
  tierLabel: string;
  /** 二周目档案补记（Ending.plus；playthrough ≥ 2 才带上） */
  plus?: string;
  /** 当前学期（补记标题用） */
  plusSemester?: number;
  /** 三周目免检批注（Ending.thirdNote；playthrough ≥ 3 才带上，与补记并列不替换） */
  thirdNote?: string;
  /** 结算处置单（批次 CY-128）：档案页随详情带出；异常卷宗 / 未编目没有此字段 */
  settlement?: Ending["settlement"];
  /** 本结局沉默值区间（处置单「认定依据」行用；缺省不显示区间） */
  minSilence?: number;
  maxSilence?: number;
}

/** 岔路册 · 单条支路槽位：选项文案永远可见，收束语走过这条支路才给 */
export interface BranchSlot {
  /** 选项 id（流程图连线 keyed 用） */
  choiceId: string;
  choiceText: string;
  /** 收束语（Choice.coda）；没走过为 null */
  coda: string | null;
  /** 第一次走到这条支路的学期号（学期档案里有记录即算走过） */
  semester: number | null;
  /** 是否走过（= semester !== null，统计口径不变） */
  walked: boolean;
}

/** 岔路册 · 一处分岔（一个分岔场景 = 一组三支） */
export interface BranchPointGroup {
  actTitle: string;
  /** 分岔所在幕（1 起）；「去走这条岔路」把续播幕指到这里 */
  actIndex: number;
  slots: BranchSlot[];
}

/** 岔路册 · 一条剧情线的全部分岔 */
export interface BranchLineGroup {
  lineId: StorylineId;
  lineTitle: string;
  points: BranchPointGroup[];
  walked: number;
  total: number;
  /** 本线是否已完成（completedLines 含本线）；只有完成线的未走支路才能「去走」 */
  completed: boolean;
}

/** 岔路册 · 下一条可走的岔路：只给行进坐标（哪条线 · 哪一幕），不剧透选项文案 */
export interface BranchNextPick {
  lineId: StorylineId;
  lineTitle: string;
  actIndex: number;
  actTitle: string;
}

/** 毕业典礼 · 毕业证成绩单的数据形状（全部由现有存档聚合，零新增 schema） */
export interface GraduationDiplomaData {
  /** 第几个学期（多周目计数，旧档缺字段按 1） */
  playthrough: number;
  /** 姓名（批次 CO）：登记名——没登记写「该蛙未登记姓名」 */
  displayName?: string;
  /** 本学期累计沉默值（沉默学学位按它分档） */
  silenceValue: number;
  /** 被注意值：学籍备注按它两档（0–7 无异常 / 8+ 重点关注名单在列） */
  attention: number;
  /** 印象分（0-100）+ 档位称号 + 公示栏最终评语（复用五档） */
  impressionPercent: number;
  impressionTierLabel: string;
  bulletinReview: string;
  /** 离真心最近的 NPC 蛙（坦诚度全 0 时为 null） */
  closestFrog: { name: string; role: string; tierLabel: string; percent: number } | null;
  /** 全员真话达成：出场 NPC 蛙坦诚度全部 ≥85 */
  allTrueFriends: boolean;
  /** 真话罐 n/N 与集齐标记 */
  truthCollected: number;
  truthTotal: number;
  truthComplete: boolean;
  /** 消迹（批次 CF）：被抽走的句数——计数还在，内容没了 */
  truthTaken?: number;
  /** 结局图鉴进度（毕业证附注一行） */
  endingsCollected: number;
  endingsTotal: number;
  /** 岔路册进度：全游戏 63 条支路（21 处分岔 × 每处 3 支）走过几条（毕业证成绩单一行） */
  branchWalked: number;
  branchTotal: number;
  branchComplete: boolean;
  /** 本学期锁定的路线认定（未锁定 = null，毕业证不显示这一行；批次 C1） */
  lockedRoute: { frogId: FrogCharacterId; name: string; note: string } | null;
  /** 提前毕业（批次 AP）：true = 这张证发给了没走完十条线的学期——成绩单写「该蛙未完成全部课程」 */
  earlyGraduated?: boolean;
  /** 已走完的线数（提前毕业时成绩单的口径） */
  linesCompleted?: number;
  /** 全部线数 */
  linesTotal?: number;
  /** 合影（批次 AX）：true = 这一学期教室里坐了替身（或逃课满三）——毕业照上你的位置不一定是 */
  photoSurrogate?: boolean;
  /** 合影（批次 AX）：第三排左起第几位（种子派生，同一颗种子同一格） */
  photoSeat?: number;
}

/** 沉默值档位标签（已解锁槽位展示用） */
function tierLabelOf(ending: Ending): string {
  const min = ending.minSilence ?? 0;
  if (ending.maxSilence === undefined) return `沉默值 ${min}+`;
  return `沉默值 ${min}-${ending.maxSilence}`;
}

/** 未解锁条目的条件提示；湖边线用它的专属区间口径；私档（批次 BV）调阅过的线，「不知道」档换成关闭说明 */
function hintOf(ending: Ending, lineId: StorylineId, traced: boolean): string {
  if (ending.forbidTrace && traced) {
    return "这条结局的前提是「不知道」。你知道了，这一档就永远关闭了。";
  }
  const min = ending.minSilence ?? 0;
  const scope = lineId === "lake" ? "湖边夜谈沉默值" : "这条线沉默值";
  if (ending.maxSilence === undefined) return `${scope} ${min}+ 时揭晓`;
  return `${scope} ${min}-${ending.maxSilence} 时揭晓`;
}

/** 聚合一条线的结局槽位与收集进度（湖边线开放状态由调用方传入）；torn = 被玩家撕掉的那页（内容消失，撕口留下）；
 *  tracedFrogs = 私档被调阅过的蛙（批次 BV）：主蛙被翻过的线，「不知道」档关闭 */
function buildLineGroup(
  meta: StorylineMeta,
  unlocked: Set<string>,
  lakeOpen: boolean,
  torn: Set<string>,
  tracedFrogs: Set<FrogCharacterId>,
): EndingLineGroup {
  const ownerFrog = LINE_FROGS[meta.id]?.[0] ?? "naiBai";
  const traced = tracedFrogs.has(ownerFrog);
  const slots: EndingSlotData[] = (STORY_SCRIPTS[meta.id]?.endings ?? []).map((ending) => ({
    ending,
    unlocked: unlocked.has(ending.id),
    tierLabel: tierLabelOf(ending),
    hint: hintOf(ending, meta.id, traced),
    torn: torn.has(ending.id),
  }));
  const group: EndingLineGroup = {
    meta,
    frogIds: LINE_FROGS[meta.id] ?? ["naiBai"],
    lineOpen: !(meta.hidden && !lakeOpen),
    slots,
    collectedCount: slots.filter((slot) => slot.unlocked && !slot.torn).length,
    totalCount: slots.length,
    complete: slots.length > 0 && slots.every((slot) => slot.unlocked && !slot.torn),
  };
  return group;
}

/** 筛选组合上限（批次 CY-143）：8 组——小本子写满就该翻页，不是往里硬塞 */
const GALLERY_PRESET_CAP = 8;
/** 念回留痕上限（批次 CY-145）：10 句——再多的小本子就翻不动了 */
const PRESET_RECALL_CAP = 10;

/** 当前筛选是否正好落在一组已存组合上（批次 CY-143）：是则高亮那颗章 */
function presetMatchIdOf(
  presets: GalleryPreset[],
  lineId: StorylineId | "all",
  tier: "all" | "真话档" | "转述档" | "沉默档",
  tornOnly: boolean,
  incompleteOnly: boolean,
  favoritesOnly: boolean,
  query: string,
): string | null {
  const hit = presets.find(
    (item) =>
      item.query === query &&
      (item.lineId ?? "all") === lineId &&
      item.tier === tier &&
      item.tornOnly === tornOnly &&
      item.incompleteOnly === incompleteOnly &&
      item.favoritesOnly === favoritesOnly,
  );
  return hit?.id ?? null;
}

/** 组合名（批次 CY-143）：把一组筛选条件念成人话——「医务室 · 真话档 · 搜「存根」」 */
function presetNameOf(
  lineId: StorylineId | "all",
  tier: "all" | "真话档" | "转述档" | "沉默档",
  tornOnly: boolean,
  incompleteOnly: boolean,
  favoritesOnly: boolean,
  query: string,
): string {
  const parts: string[] = [];
  if (lineId !== "all") parts.push(STORYLINES.find((item) => item.id === lineId)?.shortTitle ?? "某条线");
  if (tier !== "all") parts.push(tier);
  if (favoritesOnly) parts.push("钉心");
  if (tornOnly) parts.push("撕页");
  if (incompleteOnly) parts.push("没集齐");
  const q = query.trim();
  if (q) parts.push(`搜「${q}」`);
  return parts.length > 0 ? parts.join(" · ") : "全部";
}

/** 夜谈连播 · 自动翻页的单册停留时长（批次 CY-138）：一夜约读十二秒 */
const NIGHT_AUTO_MS = 12000;

/** 连播顺序（批次 CY-136）：按名册蛙序，每只蛙先树洞档、后专属档；只收已收档的（图鉴重读口径） */
function buildBingeQueue(save: GameSaveData): string[] {
  const seen = new Set(save.sideStoriesSeen);
  const order: FrogCharacterId[] = ["moMo", "meiMei", "huiHui", "ganFanShu", "zaiZai", "geGe"];
  const queue: string[] = [];
  for (const frogId of order) {
    const treeHole = sideStoryOf(frogId);
    if (treeHole && seen.has(treeHole.id)) queue.push(treeHole.id);
    const exclusive = exclusiveSideStoryOf(frogId);
    if (exclusive && seen.has(exclusive.id)) queue.push(exclusive.id);
  }
  return queue;
}

export function useEndings() {
  const navigate = useNavigate();
  const [save, setSave] = useState<GameSaveData>(() => loadGameSave());
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => loadTheme());
  const [detail, setDetail] = useState<EndingDetail | null>(null);
  /* ---------- 图鉴筛选（内容扩容批次）：按线过滤 + 只看没集齐的线——27 格结局与岔路册不用肉眼翻页 ---------- */
  const [filterLineId, setFilterLineId] = useState<StorylineId | "all">("all");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  /* 图鉴检索（批次 CY-141）：搜一个结局、一句判词、一枚章——只搜已解锁的内容，没解锁的不参与匹配（不剧透） */
  const [endingsQuery, setEndingsQuery] = useState("");
  /* 高级筛选（批次 CY-142）：档位收窄 + 只看撕过的——与检索叠加；都只作用于已解锁/撕口已知的内容 */
  const [tierFilter, setTierFilter] = useState<"all" | "真话档" | "转述档" | "沉默档">("all");
  const [tornOnly, setTornOnly] = useState(false);
  /* 结局收藏置顶（批次 CY-34）：钉过心的结局页排到线内最前，也可只看钉过心的 */
  const [endingFavorites, setEndingFavorites] = useState<Record<string, boolean>>(() => getEndingFavorites());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  /* 筛选组合（批次 CY-143）：把当前筛选条件存下来，常用的一次带回；最多 8 组，同组不重复存 */
  const [galleryPresets, setGalleryPresets] = useState<GalleryPreset[]>(() => loadSettings().galleryPresets);
  /* 念回留痕（批次 CY-145）：最近念回来的组合口令——新在前、去重、最多 10 句 */
  const [presetRecalls, setPresetRecalls] = useState<string[]>(() => loadSettings().presetRecalls);
  const saveGalleryPreset = useCallback((): "saved" | "same" | "full" => {
    const settings = loadSettings();
    const name = presetNameOf(filterLineId, tierFilter, tornOnly, incompleteOnly, favoritesOnly, endingsQuery);
    const same = settings.galleryPresets.some(
      (item) =>
        item.query === endingsQuery &&
        (item.lineId ?? "all") === filterLineId &&
        item.tier === tierFilter &&
        item.tornOnly === tornOnly &&
        item.incompleteOnly === incompleteOnly &&
        item.favoritesOnly === favoritesOnly,
    );
    if (same) return "same";
    const next: GalleryPreset[] = [
      ...settings.galleryPresets,
      {
        id: `preset-${Date.now().toString(36)}-${settings.galleryPresets.length}`,
        name,
        lineId: filterLineId === "all" ? null : filterLineId,
        tier: tierFilter,
        tornOnly,
        incompleteOnly,
        favoritesOnly,
        query: endingsQuery,
      },
    ];
    /* 最多 8 组：满了以后不挤掉旧组合，等玩家自己删——存组合不能变成丢组合 */
    if (next.length > GALLERY_PRESET_CAP) return "full";
    saveSettings({ galleryPresets: next });
    setGalleryPresets(next);
    return "saved";
  }, [filterLineId, tierFilter, tornOnly, incompleteOnly, favoritesOnly, endingsQuery]);
  const applyGalleryPreset = useCallback(
    (presetId: string) => {
      const preset = loadSettings().galleryPresets.find((item) => item.id === presetId);
      if (!preset) return;
      /* 线号要校验：存档里可能带着旧目录里已不存在的线——对不上就回「全部」 */
      setFilterLineId(
        STORYLINES.some((line) => line.id === preset.lineId) ? (preset.lineId as StorylineId) : "all",
      );
      setTierFilter(preset.tier);
      setTornOnly(preset.tornOnly);
      setIncompleteOnly(preset.incompleteOnly);
      setFavoritesOnly(preset.favoritesOnly);
      setEndingsQuery(preset.query);
    },
    [],
  );
  const deleteGalleryPreset = useCallback((presetId: string) => {
    const next = loadSettings().galleryPresets.filter((item) => item.id !== presetId);
    saveSettings({ galleryPresets: next });
    setGalleryPresets(next);
  }, []);
  const activePresetId = useMemo(
    () => presetMatchIdOf(galleryPresets, filterLineId, tierFilter, tornOnly, incompleteOnly, favoritesOnly, endingsQuery),
    [galleryPresets, filterLineId, tierFilter, tornOnly, incompleteOnly, favoritesOnly, endingsQuery],
  );
  /* 念回一句组合（批次 CY-144）：口令就是组合名本身——抄给谁，谁念回来，筛选就落回同一页。
     一句没念懂就整句不落地（不半懂），免得「带回来一半」说不清带回了什么 */
  const importPresetLine = useCallback((text: string): "applied" | "unknown" | "empty" => {
    const line = text.trim();
    if (!line) return "empty";
    const tokens = line.split(" · ").map((item) => item.trim()).filter(Boolean);
    if (tokens.length === 0) return "unknown";
    const byShort = new Map(STORYLINES.map((item) => [item.shortTitle, item.id]));
    let nextLine: StorylineId | "all" = "all";
    let nextTier: "all" | "真话档" | "转述档" | "沉默档" = "all";
    let torn = false;
    let incomplete = false;
    let favorites = false;
    let query = "";
    let seen = 0;
    for (const token of tokens) {
      const shortHit = byShort.get(token);
      if (shortHit) {
        nextLine = shortHit;
        seen += 1;
        continue;
      }
      if (token === "真话档" || token === "转述档" || token === "沉默档") {
        nextTier = token;
        seen += 1;
        continue;
      }
      if (token === "钉心") {
        favorites = true;
        seen += 1;
        continue;
      }
      if (token === "撕页") {
        torn = true;
        seen += 1;
        continue;
      }
      if (token === "没集齐") {
        incomplete = true;
        seen += 1;
        continue;
      }
      const queryHit = /^搜「(.+)」$/.exec(token) ?? /^搜"(.+)"$/.exec(token);
      if (queryHit) {
        query = queryHit[1];
        seen += 1;
        continue;
      }
      if (token === "全部") {
        seen += 1;
        continue;
      }
      return "unknown";
    }
    if (seen === 0) return "unknown";
    setFilterLineId(nextLine);
    setTierFilter(nextTier);
    setTornOnly(torn);
    setIncompleteOnly(incomplete);
    setFavoritesOnly(favorites);
    setEndingsQuery(query);
    /* 念回留痕（批次 CY-145）：念懂了才记一笔——同一句挪到最前，凑满十句旧的先让位 */
    const kept = loadSettings().presetRecalls.filter((item) => item !== line);
    const nextRecalls = [line, ...kept].slice(0, PRESET_RECALL_CAP);
    saveSettings({ presetRecalls: nextRecalls });
    setPresetRecalls(nextRecalls);
    return "applied";
  }, []);
  /* 页边批注（批次 CY-35）：写过字的页在槽位挂笔尖记号；写入口在结局全文弹层里 */
  const [endingNotes, setEndingNotes] = useState<Record<string, string>>(() => loadSettings().endingNotes);
  const refreshNotes = useCallback(() => setEndingNotes({ ...loadSettings().endingNotes }), []);
  /* 已存出的纸（批次 CY-42）：出档成功广播一到就翻登记簿 */
  const [exportLog, setExportLog] = useState(() => loadSettings().exportLog);
  const refreshExportLog = useCallback(() => setExportLog(loadSettings().exportLog), []);
  useEffect(() => {
    window.addEventListener(EXPORT_DONE_EVENT, refreshExportLog);
    return () => window.removeEventListener(EXPORT_DONE_EVENT, refreshExportLog);
  }, [refreshExportLog]);
  /* 册子添了新页（批次 CY-47 联动）：进柜时若有没收过页，最新一页盖「今日新收」——翻这一次就算签收，记号只活这一次 */
  const [newMemoStamp] = useState(() => {
    const settingsNow = loadSettings();
    if (settingsNow.memorabilia.length === 0) return 0;
    const latest = settingsNow.memorabilia.reduce((a, b) => (b.stamp > a.stamp ? b : a));
    return latest.stamp > settingsNow.lastSeenMemoStamp ? latest.stamp : 0;
  });
  useEffect(() => {
    if (newMemoStamp > 0) saveSettings({ lastSeenMemoStamp: newMemoStamp });
  }, [newMemoStamp]);
  /* 满意度调查（批次 AX）：本学期走过线且没填过——每学期一份，五格全部「收到」 */
  const [surveyOpen, setSurveyOpen] = useState(false);
  /* 借阅记录（批次 BE）：本学期有人借走了你的档案——理由栏空白 */
  const [borrowOpen, setBorrowOpen] = useState(false);
  /* 编目（批次 BS）：确认或否认一个角色——玩家决定什么算存在 */
  const [existenceOpen, setExistenceOpen] = useState(false);
  /** 否认后的那一下回执：界面记得你做了什么，不提醒你做了什么 */
  const [existenceNote, setExistenceNote] = useState<string | null>(null);

  const existenceRows = useMemo(
    () =>
      ROUTE_FROG_IDS.map((frogId) => {
        const lineMeta = STORYLINES.find((meta) => (LINE_FROGS[meta.id] ?? []).includes(frogId));
        return {
          index: frogIndexOf(frogId),
          frogId,
          name: FROG_CHARACTERS[frogId].displayName,
          lineLabel: lineMeta?.title ?? "（多处出现）",
          tier: existenceTierOf(save, frogId, save.playthrough),
          toggles: existenceTogglesOf(save, frogId, save.playthrough),
        };
      }),
    [save],
  );
  const existenceSummary = useMemo(() => existenceSummaryOf(save, save.playthrough), [save]);
  /** 特殊状态（批次 BS）：全部否认 =《独角戏》；六只都亲口确认过 =《群像》 */
  const existenceSpecial = useMemo(() => existenceSpecialOf(save, save.playthrough), [save]);
  /** 本学期被否认/自行降级的蛙（结局图鉴降级口径） */
  const degradedFrogs = useMemo<FrogCharacterId[]>(
    () =>
      ROUTE_FROG_IDS.filter(
        (id) => existenceTierOf(save, id, save.playthrough) !== "none",
      ),
    [save],
  );
  /** 档案柜里那几页没有名字的档案：只有编号，和一行「该条目已降级为非编目」 */
  const nonCatalogPages = useMemo(
    () =>
      degradedFrogs.map((frogId) => ({
        index: frogIndexOf(frogId),
        semester: save.playthrough,
      })),
    [degradedFrogs, save.playthrough],
  );

  const openExistence = useCallback(() => {
    setExistenceOpen(true);
    setExistenceNote(null);
  }, []);
  const closeExistence = useCallback(() => {
    setExistenceOpen(false);
    setExistenceNote(null);
  }, []);
  const ackExistenceIntro = useCallback(() => {
    markExistenceIntroSeen();
    setSave(loadGameSave());
  }, []);
  /** 认定落档：没有确认弹窗，没有撤销按钮——否认就是否认；翻动第三次起它自己申请降级 */
  const applyExistence = useCallback(
    (frogId: FrogCharacterId, verdict: "confirmed" | "denied") => {
      const tier = setExistenceVerdict(frogId, verdict);
      setSave(loadGameSave());
      setExistenceNote(
        verdict === "denied"
          ? `已否认。从这一行起，它不在了${tier === "demoted" ? "——它自己申请降了级，这一格从此空着。" : "。"}`
          : null,
      );
    },
    [],
  );

  useEffect(() => {
    const fresh = loadGameSave();
    setSave(fresh);
    const savedTheme = loadTheme();
    setActiveTheme(savedTheme);
    applyThemeToDocument(savedTheme);
    /* 满意度调查（批次 AX）：本学期走过线且没填过——每学期一份，五格全部「收到」 */
    const semester = getPlaythrough(fresh);
    if ((fresh.completedLines.length > 0 || (fresh.dossiers ?? []).length > 0) && !(fresh.surveys ?? []).includes(semester)) {
      setSurveyOpen(true);
    }
    /* 借阅记录（批次 BE）：约三成的学期有人借走你的档案——弹出即登记，理由栏空白 */
    const borrower = borrowerOf(fresh);
    if (borrower) {
      markBorrower(borrower);
      setBorrowOpen(true);
    }
  }, []);

  const unlocked = useMemo(() => new Set(save.unlockedEndings), [save]);

  const tornSet = useMemo(() => new Set(save.tornEndings ?? []), [save]);
  /** 私档（批次 BV）：调阅过的蛙——其所在线的「不知道」档关闭 */
  const tracedFrogs = useMemo(
    () => new Set(Object.keys(save.dossierReads ?? {}).filter((id) => id in FROG_CHARACTERS) as FrogCharacterId[]),
    [save],
  );
  const groups = useMemo<EndingLineGroup[]>(
    () => STORYLINES.map((meta) => buildLineGroup(meta, unlocked, isLakeUnlocked(save), tornSet, tracedFrogs)),
    [unlocked, save, tornSet, tracedFrogs],
  );

  const totalCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.totalCount, 0),
    [groups],
  );

  const collectedCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.collectedCount, 0),
    [groups],
  );

  const lineSummaries = useMemo(
    () =>
      groups.map((group) => ({
        title: group.meta.shortTitle,
        count: group.collectedCount,
        total: group.totalCount,
      })),
    [groups],
  );

  const allCollected = totalCount > 0 && collectedCount >= totalCount;

  /* ---------- 异常卷宗（批次 AC 起，十七格）：档案柜里不该有的记录，解锁由异常计数派生；
   *  批次 BV 的五格由私档调阅派生；批次 BZ 的两格由你写的报告派生；批次 CA 的两格由你站没站队派生；批次 CC 的《不在》由学籍变动派生；批次 CD 的四格由地下组织的托付与暴露派生 ---------- */
  const hiddenEndings = useMemo(
    () =>
      HIDDEN_ENDINGS.map((item) => {
        const stats: Record<string, { count: number; goal: number }> = {
          "secret-tamper": { count: save.tamperLog?.length ?? 0, goal: 3 },
          "secret-torn": { count: save.tornEndings?.length ?? 0, goal: 3 },
          "secret-repeat": { count: save.lockedSeedRuns ?? 0, goal: 3 },
          "secret-erased": { count: save.erasedSemesters ?? 0, goal: 3 },
          "secret-carried": { count: save.carried ?? 0, goal: 3 },
          "secret-reset": { count: save.resets ?? 0, goal: 3 },
          "secret-hybrid": { count: save.mixedSeeds ?? 0, goal: 3 },
          "secret-early": { count: save.earlyGraduated ? 1 : 0, goal: 1 },
          "secret-transfer": { count: save.dossierReads?.huiHui ? 1 : 0, goal: 1 },
          "secret-restored": { count: save.dossierReads?.geGe ? 1 : 0, goal: 1 },
          "secret-unsubmitted": { count: save.dossierReads?.zaiZai ? 1 : 0, goal: 1 },
          "secret-backside": { count: save.dossierReads?.ganFanShu ? 1 : 0, goal: 1 },
          "secret-unstamped": { count: save.dossierReads?.mianMian ? 1 : 0, goal: 1 },
          "secret-explained": { count: save.explainLog?.length ?? 0, goal: 1 },
          "secret-signed": {
            count: (save.reportLog ?? []).some((item) => item.verdict === "true" && item.by !== "courier")
              ? 1
              : 0,
            goal: 1,
          },
          "secret-passed": {
            count: (save.reportLog ?? []).some((item) => item.verdict === "false" && item.by !== "courier")
              ? 1
              : 0,
            goal: 1,
          },
          "secret-inside": { count: factionJoinedCountOf(save) >= 1 ? 1 : 0, goal: 1 },
          "secret-outside": { count: isFactionOutside(save) ? 1 : 0, goal: 1 },
          "secret-absent": { count: (save.departureLog ?? []).length >= 1 ? 1 : 0, goal: 1 },
          /* 天气夜戏羁绊（批次 CY-101）：雨夜+雾夜都遇上、两位当事蛙好感都记上过——两页纸才订得起来 */
          "secret-two-nights": {
            count:
              (save.seenNightEvents ?? []).includes("night-rain-door") &&
              (save.seenNightEvents ?? []).includes("night-fog-figure") &&
              (save.affinity?.ganFanShu ?? 0) >= 4 &&
              (save.affinity?.mianMian ?? 0) >= 4
                ? 1
                : 0,
            goal: 1,
          },
          "secret-corrected": { count: undergroundFavorCountOf(save, "correct"), goal: 1 },
          "secret-evaded": { count: undergroundFavorCountOf(save, "evade"), goal: 1 },
          "secret-drafted": { count: undergroundFavorCountOf(save, "draft"), goal: 1 },
          "secret-informal": { count: save.undergroundExposed ? 1 : 0, goal: 1 },
          /* 消迹（批次 CF）：计数还在，内容没了——四档，全部从 vanishLog 派生 */
          "secret-vanished": { count: (save.vanishLog ?? []).length >= 1 ? 1 : 0, goal: 1 },
          "secret-refiled": {
            count: (save.vanishLog ?? []).some((item) => item.response === "filed") ? 1 : 0,
            goal: 1,
          },
          "secret-unbound": {
            count: (save.vanishLog ?? []).some((item) => item.response === "letgo") ? 1 : 0,
            goal: 1,
          },
          "secret-pressing": {
            count: (save.vanishLog ?? []).some((item) => item.response === "insist") ? 1 : 0,
            goal: 1,
          },
          /* 已结（批次 CG）：档案比蛙先毕业——三档，全部从 finishedLog 派生 */
          "secret-annotated": {
            count: (save.finishedLog ?? []).some((item) => item.response === "annotate") ? 1 : 0,
            goal: 1,
          },
          "secret-untouched": {
            count: (save.finishedLog ?? []).some((item) => item.response === "still") ? 1 : 0,
            goal: 1,
          },
          "secret-noted": {
            count: (save.finishedLog ?? []).some((item) => item.response === "note") ? 1 : 0,
            goal: 1,
          },
          /* 批阅者（批次 CL）：记录员 014——三档，全部从 recorderLog 派生 */
          "secret-recorder-note": {
            count: (save.recorderLog ?? []).some((item) => item.response === "note") ? 1 : 0,
            goal: 1,
          },
          "secret-recorder-wait": {
            count: (save.recorderLog ?? []).some((item) => item.response === "wait") ? 1 : 0,
            goal: 1,
          },
          "secret-recorder-still": {
            count: (save.recorderLog ?? []).some((item) => item.response === "still") ? 1 : 0,
            goal: 1,
          },
          /* 传染（批次 CM）：沉默是会传染的——三档，全部从 quietingLog 派生 */
          "secret-quiet-start": {
            count: (save.quietingLog ?? []).some((item) => item.response === "keep") ? 1 : 0,
            goal: 1,
          },
          "secret-quiet-spoon": {
            count: (save.quietingLog ?? []).some((item) => item.response === "speak") ? 1 : 0,
            goal: 1,
          },
          "secret-quiet-deny": {
            count: (save.quietingLog ?? []).some((item) => item.response === "deny") ? 1 : 0,
            goal: 1,
          },
          /* 不告而别（批次 CN）：直接关掉页面也算一次离校——三档，从最近一次说明派生 */
          "secret-abscond-settle": {
            count: (save.abscondSettled === true && save.abscondResponse === "settle") ? 1 : 0,
            goal: 1,
          },
          "secret-abscond-promise": { count: save.abscondResponse === "promise" ? 1 : 0, goal: 1 },
          "secret-abscond-claim": { count: save.abscondResponse === "claim" ? 1 : 0, goal: 1 },
          /* 姓名（批次 CO）：有名字的才好被处理——两档 */
          "secret-named": {
            count: (save.playerDisplayName ?? "").trim().length > 0 && save.playerRenamed === true ? 1 : 0,
            goal: 1,
          },
          "secret-unnamed": {
            count: (save.playerDisplayName ?? "").trim().length === 0 && save.playerRenamed === true ? 1 : 0,
            goal: 1,
          },
          /* 交班（批次 CP）：你不是毕业生，你是经办人——三种交法，从 shiftHandoverLog 派生 */
          "secret-shift-sign": {
            count: (save.shiftHandoverLog ?? []).some((item) => item.response === "sign") ? 1 : 0,
            goal: 1,
          },
          "secret-shift-omit": {
            count: (save.shiftHandoverLog ?? []).some((item) => item.response === "omit") ? 1 : 0,
            goal: 1,
          },
          "secret-shift-extra": {
            count: (save.shiftHandoverLog ?? []).some((item) => item.response === "extra") ? 1 : 0,
            goal: 1,
          },
          /* 回单（批次 CQ）：签过的单子回来了——三种说明，从 testimonyLog 派生 */
          "secret-testimony-confirm": {
            count: (save.testimonyLog ?? []).some((item) => item.response === "confirm") ? 1 : 0,
            goal: 1,
          },
          "secret-testimony-point": {
            count: (save.testimonyLog ?? []).some((item) => item.response === "point") ? 1 : 0,
            goal: 1,
          },
          "secret-testimony-smooth": {
            count: (save.testimonyLog ?? []).some((item) => item.response === "smooth") ? 1 : 0,
            goal: 1,
          },
          /* 接任（批次 CR）：接办人一栏归你管了——三种填法，从 successionLog 派生 */
          "secret-succession-name": {
            count: (save.successionLog ?? []).some((item) => item.pick === "name") ? 1 : 0,
            goal: 1,
          },
          "secret-succession-blank": {
            count: (save.successionLog ?? []).some((item) => item.pick === "blank") ? 1 : 0,
            goal: 1,
          },
          "secret-succession-self": {
            count: (save.successionLog ?? []).some((item) => item.pick === "self") ? 1 : 0,
            goal: 1,
          },
          /* 误投（批次 CS）：这张纸上写什么，取决于投递的那半秒——从 misdeliveryLog 派生 */
          "secret-misdelivery-correct": {
            count: (save.misdeliveryLog ?? []).some((item) => item.pick === "correct") ? 1 : 0,
            goal: 1,
          },
          "secret-misdelivery-carry": {
            count: (save.misdeliveryLog ?? []).some((item) => item.pick === "carry") ? 1 : 0,
            goal: 1,
          },
          "secret-misdelivery-return": {
            count: (save.misdeliveryLog ?? []).some((item) => item.pick === "return") ? 1 : 0,
            goal: 1,
          },
          /* 补页（批次 CT）：档案也会丢东西——三种补法，从 lostPageLog 派生 */
          "secret-lostpage-faithful": {
            count: (save.lostPageLog ?? []).some((item) => item.pick === "faithful") ? 1 : 0,
            goal: 1,
          },
          "secret-lostpage-sparse": {
            count: (save.lostPageLog ?? []).some((item) => item.pick === "sparse") ? 1 : 0,
            goal: 1,
          },
          "secret-lostpage-extra": {
            count: (save.lostPageLog ?? []).some((item) => item.pick === "extra") ? 1 : 0,
            goal: 1,
          },
          /* 合档（批次 CV）：一宗，两个名字——三种处理，从 mergerLog 派生 */
          "secret-merger-split": {
            count: (save.mergerLog ?? []).some((item) => item.pick === "split") ? 1 : 0,
            goal: 1,
          },
          "secret-merger-carry": {
            count: (save.mergerLog ?? []).some((item) => item.pick === "carry") ? 1 : 0,
            goal: 1,
          },
          "secret-merger-meet": {
            count: (save.mergerLog ?? []).some((item) => item.pick === "meet") ? 1 : 0,
            goal: 1,
          },
          /* 转递（批次 CW）：你的纸出过一次门——三种送法，从 transitLog 派生 */
          "secret-transit-send": {
            count: (save.transitLog ?? []).some((item) => item.pick === "send") ? 1 : 0,
            goal: 1,
          },
          "secret-transit-self": {
            count: (save.transitLog ?? []).some((item) => item.pick === "self") ? 1 : 0,
            goal: 1,
          },
          "secret-transit-seal": {
            count: (save.transitLog ?? []).some((item) => item.pick === "seal") ? 1 : 0,
            goal: 1,
          },
          /* 被读（批次 CY）：有人读了你的档案——三种处理，从 bereadLog 派生 */
          "secret-beread-ack": {
            count: (save.bereadLog ?? []).some((item) => item.pick === "ack") ? 1 : 0,
            goal: 1,
          },
          "secret-beread-seek": {
            count: (save.bereadLog ?? []).some((item) => item.pick === "seek") ? 1 : 0,
            goal: 1,
          },
          "secret-beread-hold": {
            count: (save.bereadLog ?? []).some((item) => item.pick === "hold") ? 1 : 0,
            goal: 1,
          },
          /* 便条（批次 CZ）：一张没编号的纸——三种处理，从 noteLog 派生 */
          "secret-note-reply": {
            count: (save.noteLog ?? []).some((item) => item.pick === "reply") ? 1 : 0,
            goal: 1,
          },
          "secret-note-keep": {
            count: (save.noteLog ?? []).some((item) => item.pick === "keep") ? 1 : 0,
            goal: 1,
          },
          "secret-note-watch": {
            count: (save.noteLog ?? []).some((item) => item.pick === "watch") ? 1 : 0,
            goal: 1,
          },
          /* 定稿（批次 DA）：签了字，这一学期就是定稿——三种处理，从 finalizeLog 派生 */
          "secret-finalize-sign": {
            count: (save.finalizeLog ?? []).some((item) => item.pick === "sign") ? 1 : 0,
            goal: 1,
          },
          "secret-finalize-dispute": {
            count: (save.finalizeLog ?? []).some((item) => item.pick === "dispute") ? 1 : 0,
            goal: 1,
          },
          "secret-finalize-refuse": {
            count: (save.finalizeLog ?? []).some((item) => item.pick === "refuse") ? 1 : 0,
            goal: 1,
          },
          /* 销毁（批次 DB）：定稿之后，作废文书按清册焚化——三种处理，从 destructionLog 派生 */
          "secret-destruction-burn": {
            count: (save.destructionLog ?? []).some((item) => item.pick === "burn") ? 1 : 0,
            goal: 1,
          },
          "secret-destruction-keep": {
            count: (save.destructionLog ?? []).some((item) => item.pick === "keep") ? 1 : 0,
            goal: 1,
          },
          "secret-destruction-copy": {
            count: (save.destructionLog ?? []).some((item) => item.pick === "copy") ? 1 : 0,
            goal: 1,
          },
          /* 权利（批次 DC）：新学期的卷宗里夹着一页——三种处理，从 rightsLog 派生 */
          "secret-rights-ack": {
            count: (save.rightsLog ?? []).some((item) => item.pick === "ack") ? 1 : 0,
            goal: 1,
          },
          "secret-rights-exercise": {
            count: (save.rightsLog ?? []).some((item) => item.pick === "exercise") ? 1 : 0,
            goal: 1,
          },
          "secret-rights-decline": {
            count: (save.rightsLog ?? []).some((item) => item.pick === "decline") ? 1 : 0,
            goal: 1,
          },
          /* 对账（批次 DD）：台账日逐项核对——三种处理，从 reconciliationLog 派生 */
          "secret-reconciliation-attend": {
            count: (save.reconciliationLog ?? []).some((item) => item.pick === "attend") ? 1 : 0,
            goal: 1,
          },
          "secret-reconciliation-question": {
            count: (save.reconciliationLog ?? []).some((item) => item.pick === "question") ? 1 : 0,
            goal: 1,
          },
          "secret-reconciliation-absent": {
            count: (save.reconciliationLog ?? []).some((item) => item.pick === "absent") ? 1 : 0,
            goal: 1,
          },
          /* 自记（批次 DE）：当事人自行补记本人名下事项——三种处理，从 selfEntryLog 派生 */
          "secret-selfentry-filed": {
            count: (save.selfEntryLog ?? []).some((item) => item.pick === "filed") ? 1 : 0,
            goal: 1,
          },
          "secret-selfentry-retained": {
            count: (save.selfEntryLog ?? []).some((item) => item.pick === "retained") ? 1 : 0,
            goal: 1,
          },
          "secret-selfentry-blank": {
            count: (save.selfEntryLog ?? []).some((item) => item.pick === "blank") ? 1 : 0,
            goal: 1,
          },
          /* 催办（批次 DF）：挂账满一学期的事项，启动催办——三种处理，从 overdueLog 派生 */
          "secret-overdue-settle": {
            count: (save.overdueLog ?? []).some((item) => item.pick === "settle") ? 1 : 0,
            goal: 1,
          },
          "secret-overdue-extend": {
            count: (save.overdueLog ?? []).some((item) => item.pick === "extend") ? 1 : 0,
            goal: 1,
          },
          "secret-overdue-lose": {
            count: (save.overdueLog ?? []).some((item) => item.pick === "lose") ? 1 : 0,
            goal: 1,
          },
          /* 申报（批次 DG）：个人物品申报自愿——三种处理，从 declarationLog 派生 */
          "secret-declaration-full": {
            count: (save.declarationLog ?? []).some((item) => item.pick === "full") ? 1 : 0,
            goal: 1,
          },
          "secret-declaration-short": {
            count: (save.declarationLog ?? []).some((item) => item.pick === "short") ? 1 : 0,
            goal: 1,
          },
          "secret-declaration-empty": {
            count: (save.declarationLog ?? []).some((item) => item.pick === "empty") ? 1 : 0,
            goal: 1,
          },
          /* 开放日（批次 DH）：全宗开放，免于登记——三种处理，从 openDayLog 派生 */
          "secret-open-day-self": {
            count: (save.openDayLog ?? []).some((item) => item.pick === "self") ? 1 : 0,
            goal: 1,
          },
          "secret-open-day-others": {
            count: (save.openDayLog ?? []).some((item) => item.pick === "others") ? 1 : 0,
            goal: 1,
          },
          "secret-open-day-away": {
            count: (save.openDayLog ?? []).some((item) => item.pick === "away") ? 1 : 0,
            goal: 1,
          },
          /* 顶班（批次 DI）：替别的蛙值班一日——三种处理，从 substituteLog 派生 */
          "secret-substitute-serve": {
            count: (save.substituteLog ?? []).some((item) => item.pick === "serve") ? 1 : 0,
            goal: 1,
          },
          "secret-substitute-sign": {
            count: (save.substituteLog ?? []).some((item) => item.pick === "sign") ? 1 : 0,
            goal: 1,
          },
          "secret-substitute-refuse": {
            count: (save.substituteLog ?? []).some((item) => item.pick === "refuse") ? 1 : 0,
            goal: 1,
          },
          /* 页边（批次 DJ）：规程之外的页边批注——三种处理，从 pageNoteLog 派生 */
          "secret-page-note-ack": {
            count: (save.pageNoteLog ?? []).some((item) => item.pick === "ack") ? 1 : 0,
            goal: 1,
          },
          "secret-page-note-leave": {
            count: (save.pageNoteLog ?? []).some((item) => item.pick === "leave") ? 1 : 0,
            goal: 1,
          },
          "secret-page-note-cross": {
            count: (save.pageNoteLog ?? []).some((item) => item.pick === "cross") ? 1 : 0,
            goal: 1,
          },
          /* 记性（批次 DK）：把你的记性跟档案对一遍——三种处理，从 memoryLog 派生 */
          "secret-memory-all": {
            count: (save.memoryLog ?? []).some((item) => item.pick === "all") ? 1 : 0,
            goal: 1,
          },
          "secret-memory-one": {
            count: (save.memoryLog ?? []).some((item) => item.pick === "one") ? 1 : 0,
            goal: 1,
          },
          "secret-memory-none": {
            count: (save.memoryLog ?? []).some((item) => item.pick === "none") ? 1 : 0,
            goal: 1,
          },
          /* 登记（批次 DL）：非在册文书登记簿——三种处理，从 unregisteredLog 派生 */
          "secret-unregistered-claim": {
            count: (save.unregisteredLog ?? []).some((item) => item.pick === "claim") ? 1 : 0,
            goal: 1,
          },
          "secret-unregistered-leave": {
            count: (save.unregisteredLog ?? []).some((item) => item.pick === "leave") ? 1 : 0,
            goal: 1,
          },
          "secret-unregistered-copy": {
            count: (save.unregisteredLog ?? []).some((item) => item.pick === "copy") ? 1 : 0,
            goal: 1,
          },
          /* 扉页（批次 DM）：卷宗封二的一行字——三种处理，从 flyleafLog 派生 */
          "secret-flyleaf-read": {
            count: (save.flyleafLog ?? []).some((item) => item.pick === "read") ? 1 : 0,
            goal: 1,
          },
          "secret-flyleaf-fold": {
            count: (save.flyleafLog ?? []).some((item) => item.pick === "fold") ? 1 : 0,
            goal: 1,
          },
          "secret-flyleaf-tear": {
            count: (save.flyleafLog ?? []).some((item) => item.pick === "tear") ? 1 : 0,
            goal: 1,
          },
          /* 认领（批次 DN）：失物认领——三种处理，从 claimLog 派生 */
          "secret-claim-return": {
            count: (save.claimLog ?? []).some((item) => item.pick === "return") ? 1 : 0,
            goal: 1,
          },
          "secret-claim-keep": {
            count: (save.claimLog ?? []).some((item) => item.pick === "keep") ? 1 : 0,
            goal: 1,
          },
          "secret-claim-wait": {
            count: (save.claimLog ?? []).some((item) => item.pick === "wait") ? 1 : 0,
            goal: 1,
          },
          /* 联名（批次 DO）：联名说明——三种处理，从 jointLog 派生 */
          "secret-joint-sign": {
            count: (save.jointLog ?? []).some((item) => item.pick === "sign") ? 1 : 0,
            goal: 1,
          },
          "secret-joint-hold": {
            count: (save.jointLog ?? []).some((item) => item.pick === "hold") ? 1 : 0,
            goal: 1,
          },
          "secret-joint-edit": {
            count: (save.jointLog ?? []).some((item) => item.pick === "edit") ? 1 : 0,
            goal: 1,
          },
          /* 互通（批次 DP）：信格通道——三种处理，从 letterBoxLog 派生 */
          "secret-letterbox-both": {
            count: (save.letterBoxLog ?? []).some((item) => item.pick === "both") ? 1 : 0,
            goal: 1,
          },
          "secret-letterbox-closed": {
            count: (save.letterBoxLog ?? []).some((item) => item.pick === "closed") ? 1 : 0,
            goal: 1,
          },
          "secret-letterbox-oneway": {
            count: (save.letterBoxLog ?? []).some((item) => item.pick === "oneway") ? 1 : 0,
            goal: 1,
          },
          /* 命名（批次 DQ）：当事人自命名——三种处理，从 namingLog 派生 */
          "secret-naming-give": {
            count: (save.namingLog ?? []).some((item) => item.pick === "give") ? 1 : 0,
            goal: 1,
          },
          "secret-naming-hold": {
            count: (save.namingLog ?? []).some((item) => item.pick === "hold") ? 1 : 0,
            goal: 1,
          },
          "secret-naming-code": {
            count: (save.namingLog ?? []).some((item) => item.pick === "code") ? 1 : 0,
            goal: 1,
          },
          /* 同名（批次 DR）：简称重名——三种处理，从 sameNameLog 派生 */
          "secret-same-name-keep": {
            count: (save.sameNameLog ?? []).some((item) => item.pick === "keep") ? 1 : 0,
            goal: 1,
          },
          "secret-same-name-give": {
            count: (save.sameNameLog ?? []).some((item) => item.pick === "give") ? 1 : 0,
            goal: 1,
          },
          "secret-same-name-change": {
            count: (save.sameNameLog ?? []).some((item) => item.pick === "change") ? 1 : 0,
            goal: 1,
          },
          /* 总目（批次 DS）：非在册事项总目——三种处理，从 catalogLog 派生 */
          "secret-catalog-bind": {
            count: (save.catalogLog ?? []).some((item) => item.pick === "bind") ? 1 : 0,
            goal: 1,
          },
          "secret-catalog-extract": {
            count: (save.catalogLog ?? []).some((item) => item.pick === "extract") ? 1 : 0,
            goal: 1,
          },
          "secret-catalog-loose": {
            count: (save.catalogLog ?? []).some((item) => item.pick === "loose") ? 1 : 0,
            goal: 1,
          },
          /* 结转（批次 DT）：学期移交——三种处理，从 carryoverLog 派生 */
          "secret-carryover-follow": {
            count: (save.carryoverLog ?? []).some((item) => item.pick === "follow") ? 1 : 0,
            goal: 1,
          },
          "secret-carryover-pocket": {
            count: (save.carryoverLog ?? []).some((item) => item.pick === "pocket") ? 1 : 0,
            goal: 1,
          },
          "secret-carryover-surrender": {
            count: (save.carryoverLog ?? []).some((item) => item.pick === "surrender") ? 1 : 0,
            goal: 1,
          },
          /* 留白（批次 DU）：卷宗末页留白——三种处理，从 blankLog 派生 */
          "secret-blank-keep": {
            count: (save.blankLog ?? []).some((item) => item.pick === "keep") ? 1 : 0,
            goal: 1,
          },
          "secret-blank-write": {
            count: (save.blankLog ?? []).some((item) => item.pick === "write") ? 1 : 0,
            goal: 1,
          },
          "secret-blank-tuck": {
            count: (save.blankLog ?? []).some((item) => item.pick === "tuck") ? 1 : 0,
            goal: 1,
          },
        };
        const stat = stats[item.id] ?? { count: 0, goal: 1 };
        return {
          ...item,
          unlocked: stat.count >= stat.goal,
          done: `${Math.min(stat.count, stat.goal)}/${stat.goal}`,
        };
      }),
    [save],
  );

  const openHidden = useCallback(
    (hiddenId: string) => {
      const entry = hiddenEndings.find((item) => item.id === hiddenId);
      if (!entry || !entry.unlocked || !entry.text) return;
      const playthrough = getPlaythrough(save);
      setDetail({
        title: entry.title,
        text: entry.text,
        lineTitle: "档案室 · 异常卷宗",
        tierLabel: "异常卷宗",
        plus: playthrough >= 2 ? entry.plus : undefined,
        plusSemester: playthrough,
        thirdNote: playthrough >= 3 ? entry.thirdNote : undefined,
      });
    },
    [hiddenEndings, save],
  );

  /* ---------- 三周目免检（第三学期）：playthrough ≥ 3 时图鉴切换成档案腔——已解锁槽位带「免检」角标，详情弹层在补记之下追加批注 ---------- */

  const isThirdVisit = useMemo(() => getPlaythrough(save) >= 3, [save]);

  /* ---------- 毕业典礼（全通谢幕）：十条线全完成后入口出现，二周目可重复观看 ---------- */

  const graduateReady = useMemo(
    () => ALL_LINE_IDS.every((lineId) => save.completedLines.includes(lineId)),
    [save],
  );

  const [ceremonyOpen, setCeremonyOpen] = useState(false);
  const openCeremony = useCallback(() => setCeremonyOpen(true), []);
  const closeCeremony = useCallback(() => setCeremonyOpen(false), []);

  /* ---------- 岔路册（63 条支路的收集册，学期档案里走过的才亮收束语；先算好，毕业证成绩单要引用完成度） ---------- */

  const branchGroups = useMemo<BranchLineGroup[]>(() => {
    const stamps = loadChoiceSemesters();
    const completedLines = new Set(save.completedLines);
    const out: BranchLineGroup[] = [];
    for (const lineId of ALL_LINE_IDS) {
      const script = STORY_SCRIPTS[lineId];
      const meta = storylineById(lineId);
      if (!script || !meta) continue;
      const points: BranchPointGroup[] = [];
      let walked = 0;
      let total = 0;
      for (const act of script.acts) {
        for (const scene of act.scenes) {
          if (!scene.choices || scene.choices.length === 0) continue;
          /* 含分岔的场景按纪律全部选项都是支路口；没有 branch 的场景不进册 */
          if (!scene.choices.some((choice) => choice.branch)) continue;
          const slots: BranchSlot[] = scene.choices.map((choice) => {
            const key = `${lineId}:${act.id}:${scene.id}:${choice.id}`;
            const stamp = stamps[key];
            if (stamp !== undefined) walked += 1;
            total += 1;
            return {
              choiceId: choice.id,
              choiceText: choice.text,
              coda: stamp !== undefined ? (choice.coda ?? null) : null,
              semester: stamp ?? null,
              walked: stamp !== undefined,
            };
          });
          points.push({ actTitle: act.title, actIndex: act.index, slots });
        }
      }
      if (points.length === 0) continue;
      out.push({
        lineId,
        lineTitle: meta.title,
        points,
        walked,
        total,
        completed: completedLines.has(lineId),
      });
    }
    return out;
  }, [save]);

  const branchWalked = useMemo(() => branchGroups.reduce((sum, group) => sum + group.walked, 0), [branchGroups]);
  const branchTotal = useMemo(() => branchGroups.reduce((sum, group) => sum + group.total, 0), [branchGroups]);
  const branchComplete = branchTotal > 0 && branchWalked >= branchTotal;

  /** 下一条还没走的岔路：只从已完成的线里挑——重进已完成线不会把没走完的进度倒回去 */
  const branchNext = useMemo<BranchNextPick | null>(() => {
    const completed = new Set(save.completedLines);
    for (const group of branchGroups) {
      if (group.walked >= group.total) continue;
      if (!completed.has(group.lineId)) continue;
      for (let i = 0; i < group.points.length; i++) {
        const point = group.points[i];
        if (!point || point.slots.every((slot) => slot.coda !== null)) continue;
        return {
          lineId: group.lineId,
          lineTitle: group.lineTitle,
          actIndex: point.actIndex,
          actTitle: point.actTitle,
        };
      }
    }
    return null;
  }, [branchGroups, save]);

  /** 去走指定线上的某一处分岔：先把续播幕指到分岔所在幕再进线，进场快进到抉择口换条路。
   *  只对已完成线生效——未完成线的入口不触发（View 层不渲染可点态），不会倒回没走完的进度。 */
  const goBranchAt = useCallback(
    (lineId: StorylineId, actIndex: number) => {
      if (!save.completedLines.includes(lineId)) return;
      saveLineAct(lineId, actIndex);
      navigate(`/play?line=${lineId}`);
    },
    [save, navigate],
  );

  /** 去走下一处还没走的岔路（branchNext 挑出的行进坐标），内部复用 goBranchAt */
  const goBranch = useCallback(() => {
    if (!branchNext) return;
    goBranchAt(branchNext.lineId, branchNext.actIndex);
  }, [branchNext, goBranchAt]);

  /* ---------- 未编目（全收集限定）：30 种结局全部见过后翻开的一页，解锁状态由全收集派生，不写存档 ---------- */

  const openSecret = useCallback(() => {
    if (!allCollected) return;
    const playthrough = getPlaythrough(save);
    setDetail({
      title: SECRET_ENDING.title,
      text: SECRET_ENDING.text,
      lineTitle: "档案室 · 未编目",
      tierLabel: "全收集限定",
      plus: playthrough >= 2 ? SECRET_ENDING.plus : undefined,
      plusSemester: playthrough,
      thirdNote: playthrough >= 3 ? SECRET_ENDING.thirdNote : undefined,
    });
  }, [allCollected, save]);

  /* 撕掉一页档案（批次 AD）：确认后执行——内容从图鉴消失，撕口进异常计数，弹层收起 */
  const tearEnding = useCallback(
    (endingId: string) => {
      if (save.tornEndings?.includes(endingId)) return;
      recordTornEnding(endingId);
      setDetail(null);
      setSave(loadGameSave());
    },
    [save],
  );

  /* 穿回旧皮（批次 AH）：把柜子里那层皮的学期快照换回来——回到那个学期继续走。
     剧情会认出你：下一个深夜事件里渗出「你不是已经蜕过了吗」。 */
  const wearSkinBy = useCallback(
    (stamp: number) => {
      if (!wearSkin(stamp)) return;
      setDetail(null);
      navigate("/map");
    },
    [navigate],
  );

  /* 合上档案柜（批次 AN）：闭柜不在流程里——全收集后档案室的另一条终点。
     确认后立刻落档，卷终浮层盖上来；之后随时可以再打开（柜子不问为什么，但每一次都数） */
  const [cabinetOverlayOpen, setCabinetOverlayOpen] = useState(false);
  const requestCloseCabinet = useCallback(() => {
    closeCabinet();
    setSave(loadGameSave());
    setCabinetOverlayOpen(true);
  }, []);
  const closeCabinetOverlay = useCallback(() => setCabinetOverlayOpen(false), []);
  const reopenCabinet = useCallback(() => {
    openCabinet();
    setSave(loadGameSave());
  }, []);

  const graduation = useMemo<GraduationDiplomaData | null>(() => {
    /* 提前毕业（批次 AP）：不必等十条线走完——申请过就有典礼，只是成绩单不完整 */
    if (!graduateReady && save.earlyGraduated !== true) return null;
    const topId = topTrueFrog(save);
    const percent = topId ? affinityPercent(topId, save.affinity[topId] ?? 0) : 0;
    const closestFrog = topId
      ? {
          name: FROG_CHARACTERS[topId].displayName,
          role: FROG_CHARACTERS[topId].role,
          tierLabel: affinityTierOf(percent).label,
          percent,
        }
      : null;
    const impression = impressionPercentOf(save.reputation);
    /* 消迹（批次 CF）：被抽走的那一句不渲染——计数还在，内容没了 */
    const truthReport = truthJarReport(save, vanishedTextsOf(save));
    /* 姓名（批次 CO）：成绩单表头用登记名——没登记写「该蛙未登记姓名」 */
    const displayName = displayNameOf(save);
    const data: GraduationDiplomaData = {
      playthrough: getPlaythrough(save),
      displayName,
      silenceValue: save.silenceValue,
      attention: save.attention,
      impressionPercent: impression,
      impressionTierLabel: impressionTierOf(impression).label,
      bulletinReview: bulletinReviewOf(impression),
      closestFrog,
      allTrueFriends: allTrueFriendsOf(save),
      truthCollected: truthReport.collected,
      truthTotal: truthReport.total,
      truthComplete: truthReport.complete,
      truthTaken: truthReport.taken,
      endingsCollected: collectedCount,
      endingsTotal: totalCount,
      branchWalked,
      branchTotal,
      branchComplete,
      /** 提前毕业（批次 AP）：毕业证写「准予毕业」，成绩单写「该蛙未完成全部课程」 */
      earlyGraduated: !graduateReady,
      linesCompleted: ALL_LINE_IDS.filter((lineId) => save.completedLines.includes(lineId)).length,
      linesTotal: ALL_LINE_IDS.length,
      /** 合影（批次 AX）：替身坐过你的位置（或逃课满三）——毕业照上那一格不一定是你 */
      photoSurrogate: save.surrogateEver === true || (save.skips ?? 0) >= 3,
      photoSeat: 1 + Math.floor(seedRandom(Math.round(save.weatherSeed) * 31 + 5) * 8),
      lockedRoute: (() => {
        const routeId = getLockedRoute(save);
        if (!routeId) return null;
        return {
          frogId: routeId,
          name: FROG_CHARACTERS[routeId].displayName,
          note: ROUTE_DIPLOMA_NOTES[routeId],
        };
      })(),
    };
    return data;
  }, [graduateReady, save, collectedCount, totalCount, branchWalked, branchTotal, branchComplete]);

  /* ---------- 真话罐（第二区块：跨周目收集，按剧情线分组） ---------- */

  /* 消迹（批次 CF）：被抽走的那一句不渲染——计数还在，内容没了 */
  const truth = useMemo(() => truthJarReport(save, vanishedTextsOf(save)), [save]);

  /* ---------- 词义册（批次 AV「语言本身」）：同一个词在不同场合的不同释义 ---------- */

  const wordDefs = useMemo<string[]>(() => {
    const done = new Set(save.completedLines);
    const seenNight = new Set(save.seenNightEvents);
    const out: string[] = [];
    if (done.has("canteen")) out.push("canteen");
    if (done.has("administration")) out.push("administration");
    if (done.has("lake")) out.push("lake");
    if (seenNight.has(NIGHT_TALK_EVENT.id)) out.push("night");
    return out;
  }, [save]);

  /** 说一次（批次 AV）：词义作为武器——每学期一次，落档后图鉴收着这次回应 */
  const sayTheWord = useCallback((): boolean => {
    if (!sayWord()) return false;
    setSave(loadGameSave());
    return true;
  }, []);

  /* ---------- 教材（批次 BF）：你的反抗被印成了教程——岔路参考的判定 ---------- */

  const isTextbook = useCallback((key: string): boolean => {
    const hash = key.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return seedRandom(hash * 31 + 89) < 0.25;
  }, []);

  /* ---------- 文本的痕迹（批次 AV）：划掉的字与读完全部的份数 ---------- */

  const struckCount = useMemo(
    () => Object.values(save.struckChars ?? {}).reduce((sum, list) => sum + list.length, 0),
    [save],
  );

  /** 满意度调查提交（批次 AX）：五格全部「收到」——落档收浮层 */
  const acceptSurvey = useCallback(() => {
    markSurveyDone(getPlaythrough(save));
    setSave(loadGameSave());
    setSurveyOpen(false);
  }, [save]);

  const openDetail = useCallback(
    (lineId: StorylineId, endingId: string) => {
      const meta = storylineById(lineId);
      const ending = STORY_SCRIPTS[lineId]?.endings.find((item) => item.id === endingId);
      if (!meta || !ending || !unlocked.has(endingId)) return;
      const playthrough = getPlaythrough(save);
      setDetail({
        endingId: ending.id,
        title: ending.title,
        text: ending.text,
        lineTitle: meta.title,
        tierLabel: tierLabelOf(ending),
        plus: playthrough >= 2 ? ending.plus : undefined,
        plusSemester: playthrough,
        thirdNote: playthrough >= 3 ? ending.thirdNote : undefined,
        settlement: ending.settlement,
        minSilence: ending.minSilence,
        maxSilence: ending.maxSilence,
      });
    },
    [unlocked, save],
  );

  const closeDetail = useCallback(() => {
    /* 划字与折叠（批次 AV）在详情弹层里直接落档——关掉时把柜子对齐到最新 */
    setDetail(null);
    setSave(loadGameSave());
  }, []);

  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/map");
  }, [navigate]);

  const goToMap = useCallback(() => navigate("/map"), [navigate]);

  const switchTheme = useCallback((themeId: ThemeId) => {
    setActiveTheme(themeId);
    persistTheme(themeId);
    applyThemeToDocument(themeId);
  }, []);

  /* ---------- 图鉴筛选（内容扩容批次）：结局分组与岔路册共用的过滤视图 ---------- */
  const toggleIncompleteOnly = useCallback(() => setIncompleteOnly((prev) => !prev), []);
  /* 结局收藏置顶（批次 CY-34）：钉心翻转并刷新本地账 */
  const toggleFavoriteEnding = useCallback((endingId: string) => {
    toggleEndingFavorite(endingId);
    setEndingFavorites({ ...getEndingFavorites() });
  }, []);
  const toggleFavoritesOnly = useCallback(() => setFavoritesOnly((prev) => !prev), []);
  const favoriteEndingCount = useMemo(
    () => Object.keys(endingFavorites).length,
    [endingFavorites],
  );
  const tornEndingCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.slots.filter((slot) => slot.torn).length, 0),
    [groups],
  );
  /* 你钉过的（批次 CY-35 专区；CY-41 带上全文与批注，供「打包存图」誊档案复印件） */
  const pinnedEndings = useMemo(() => {
    const out: {
      lineId: StorylineId;
      lineTitle: string;
      endingId: string;
      title: string;
      tierLabel: string;
      text: string;
      note?: string;
    }[] = [];
    for (const group of groups) {
      for (const slot of group.slots) {
        if (slot.unlocked && endingFavorites[slot.ending.id] === true) {
          out.push({
            lineId: group.meta.id,
            lineTitle: group.meta.shortTitle,
            endingId: slot.ending.id,
            title: slot.ending.title,
            tierLabel: slot.tierLabel,
            text: slot.ending.text,
            note: endingNotes[slot.ending.id],
          });
        }
      }
    }
    return out;
  }, [groups, endingFavorites, endingNotes]);

  /* ---------- 番外重读（批次 CY-135）：图鉴里是纯重读——已收档的那几集可以再过一遍，不计数、不写档。
     档案只记一次，所以收尾只做两件事：关掉弹层、给那张卡盖一枚「重读 · 不另记」的章。 ---------- */
  const [replayId, setReplayId] = useState<string | null>(null);
  const [replayStamp, setReplayStamp] = useState<{ storyId: string; tick: number } | null>(null);
  /* 连播（批次 CY-136）：把已收档的番外按「树洞档 → 专属档、按名册蛙序」排成一串，一集接一集过；
     仍是纯重读——播完一集点「下一集」，中途关掉就整串停。 */
  const [bingeQueue, setBingeQueue] = useState<string[]>([]);
  const [bingeIndex, setBingeIndex] = useState(0);
  const replayStory = useMemo(() => (replayId ? sideStoryById(replayId) : undefined), [replayId]);
  const openReplay = useCallback((storyId: string) => setReplayId(storyId), []);
  const closeReplay = useCallback(() => {
    setReplayId(null);
    setBingeQueue([]);
    setBingeIndex(0);
  }, []);
  const finishReplay = useCallback((storyId: string) => {
    setReplayStamp((prev) => ({ storyId, tick: (prev?.tick ?? 0) + 1 }));
    window.setTimeout(() => setReplayStamp(null), 2400);
  }, []);
  const bingeQueueIds = useMemo(() => buildBingeQueue(save), [save]);
  const startBinge = useCallback(() => {
    if (bingeQueueIds.length < 2) return;
    setBingeQueue(bingeQueueIds);
    setBingeIndex(0);
    setReplayId(bingeQueueIds[0]);
  }, [bingeQueueIds]);
  const advanceBinge = useCallback(() => {
    const next = bingeIndex + 1;
    if (next < bingeQueue.length) {
      setBingeIndex(next);
      setReplayId(bingeQueue[next]);
    } else {
      setBingeQueue([]);
      setBingeIndex(0);
      setReplayId(null);
    }
  }, [bingeIndex, bingeQueue]);
  const bingeHasNext = bingeIndex + 1 < bingeQueue.length;
  const bingeLabel = bingeQueue.length > 0 ? `连播 ${bingeIndex + 1}/${bingeQueue.length}` : undefined;

  /* ---------- 夜谈连播（批次 CY-137）：深夜台词书架也能一册一册过——纯阅读，不计数、不写档 ---------- */
  const [nightQueue, setNightQueue] = useState<string[]>([]);
  const [nightIndex, setNightIndex] = useState(0);
  const nightBook = useMemo(
    () => ALL_NIGHT_EVENTS.find((item) => item.id === nightQueue[nightIndex]) ,
    [nightQueue, nightIndex],
  );
  const startNightBinge = useCallback((ids: string[]) => {
    if (ids.length < 2) return;
    setNightQueue(ids);
    setNightIndex(0);
  }, []);
  const advanceNightBinge = useCallback(() => {
    const next = nightIndex + 1;
    if (next < nightQueue.length) setNightIndex(next);
    else {
      setNightQueue([]);
      setNightIndex(0);
    }
  }, [nightIndex, nightQueue]);
  const closeNightBinge = useCallback(() => {
    setNightQueue([]);
    setNightIndex(0);
  }, []);
  const nightHasNext = nightIndex + 1 < nightQueue.length;
  const nightLabel = nightQueue.length > 0 ? `连播 ${nightIndex + 1}/${nightQueue.length}` : undefined;
  /* 自动翻页（批次 CY-138）：开了自动，每册读约 12 秒翻下一册；关掉或整串播完即停（状态本会话保留） */
  const [nightAuto, setNightAuto] = useState(false);
  const toggleNightAuto = useCallback(() => setNightAuto((prev) => !prev), []);
  useEffect(() => {
    if (!nightAuto || !nightBook) return;
    const timer = window.setTimeout(advanceNightBinge, NIGHT_AUTO_MS);
    return () => window.clearTimeout(timer);
  }, [nightAuto, nightBook, nightIndex, advanceNightBinge]);

  /* ---------- 结算册 · 整册打包（批次 CY-140）：已收的结算处置单拼进同一页图，一次下载 ----------
     舞台挂载在屏幕外，渲染完成后把画布交回来走统一盖章导出通道；已收口径 = unlockedEndings 且没被撕掉。 */
  const [settlementExportOpen, setSettlementExportOpen] = useState(false);
  const [settlementExportState, setSettlementExportState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const settlementItems = useMemo(
    () =>
      groups.flatMap((group) =>
        group.slots
          .filter((slot) => slot.unlocked && !slot.torn)
          .map((slot) => ({ lineTitle: group.meta.shortTitle, ending: slot.ending })),
      ),
    [groups],
  );
  const captureSettlementAlbum = useCallback(async (node: HTMLDivElement) => {
    const ok = await capturePng(node, "奶蛙大学·结算册.png");
    setSettlementExportState(ok ? "done" : "failed");
    window.setTimeout(() => {
      setSettlementExportOpen(false);
      setSettlementExportState("idle");
    }, ok ? 900 : 1400);
  }, []);
  const startSettlementExport = useCallback(() => {
    if (settlementExportState === "busy" || settlementItems.length === 0) return;
    setSettlementExportState("busy");
    setSettlementExportOpen(true);
  }, [settlementExportState, settlementItems.length]);

  /* ---------- 附页合集 · 舞台出图（批次 CY-141）：合集带每集的开场定格封面——图走屏幕外舞台渲染 ---------- */
  const shelfCards = useMemo(() => buildShelf(save), [save]);
  const [sideAlbumOpen, setSideAlbumOpen] = useState(false);
  const [sideAlbumState, setSideAlbumState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const captureSideAlbum = useCallback(async (node: HTMLDivElement) => {
    const ok = await capturePng(node, "奶蛙大学·名册附页合集.png");
    setSideAlbumState(ok ? "done" : "failed");
    window.setTimeout(() => {
      setSideAlbumOpen(false);
      setSideAlbumState("idle");
    }, ok ? 900 : 1400);
  }, []);
  const startSideAlbum = useCallback(() => {
    if (sideAlbumState === "busy" || shelfCards.filter((card) => card.seen).length === 0) return;
    setSideAlbumState("busy");
    setSideAlbumOpen(true);
  }, [sideAlbumState, shelfCards]);

  /* ---------- 收藏动效（批次 CY-135）：本轮在图鉴里亲手钉过的心，入场时高亮一次 ---------- */
  const [initialFavorites] = useState<Record<string, boolean>>(() => getEndingFavorites());
  const freshPinned = useMemo(
    () => pinnedEndings.filter((item) => initialFavorites[item.endingId] !== true).map((item) => item.endingId),
    [pinnedEndings, initialFavorites],
  );
  /* 页边手迹合集（批次 CY-36）：写过批注的已解锁结局页，跨线汇总——抄一份带走 */
  const marginalNotes = useMemo(() => {
    const out: { lineId: StorylineId; lineTitle: string; endingId: string; title: string; note: string }[] = [];
    for (const group of groups) {
      for (const slot of group.slots) {
        const note = endingNotes[slot.ending.id];
        if (note && slot.unlocked) {
          out.push({ lineId: group.meta.id, lineTitle: group.meta.shortTitle, endingId: slot.ending.id, title: slot.ending.title, note });
        }
      }
    }
    return out;
  }, [groups, endingNotes]);
  const filteredGroups = useMemo(() => {
    let list = groups;
    if (filterLineId !== "all") list = list.filter((group) => group.meta.id === filterLineId);
    if (incompleteOnly) list = list.filter((group) => !group.complete);
    /* 检索（批次 CY-141）：只对已解锁的结局匹配（标题/判词/印章/档位名/线名）——没解锁的不参与，搜不到也不露内容 */
    const q = endingsQuery.trim();
    /* 高级筛选（批次 CY-142）：档位只对已解锁的生效；撕过的页单独成筛 */
    if (tierFilter !== "all") {
      list = list
        .map((group) => ({
          ...group,
          slots: group.slots.filter(
            (slot) => slot.unlocked && !slot.torn && slot.ending.settlement?.tierName === tierFilter,
          ),
        }))
        .filter((group) => group.slots.length > 0);
    }
    if (tornOnly) {
      list = list
        .map((group) => ({ ...group, slots: group.slots.filter((slot) => slot.torn === true) }))
        .filter((group) => group.slots.length > 0);
    }
    if (q) {
      list = list
        .map((group) => ({
          ...group,
          slots: group.slots.filter(
            (slot) =>
              slot.unlocked &&
              !slot.torn &&
              (slot.ending.title.includes(q) ||
                slot.ending.settlement?.stamp.includes(q) ||
                slot.ending.settlement?.tierName.includes(q) ||
                slot.ending.settlement?.caption.includes(q) ||
                group.meta.title.includes(q) ||
                group.meta.shortTitle.includes(q)),
          ),
        }))
        .filter((group) => group.slots.length > 0);
    }
    /* 钉过心的结局页排到线内最前（稳定排序，其余保持原顺序） */
    if (favoriteEndingCount > 0) {
      list = list.map((group) => ({
        ...group,
        slots: [...group.slots].sort(
          (a, b) => Number(endingFavorites[b.ending.id] === true) - Number(endingFavorites[a.ending.id] === true),
        ),
      }));
    }
    /* 只看钉过心的：线内只剩钉心页，没钉的线整组收起 */
    if (favoritesOnly) {
      list = list
        .map((group) => ({ ...group, slots: group.slots.filter((slot) => endingFavorites[slot.ending.id] === true) }))
        .filter((group) => group.slots.length > 0);
    }
    return list;
  }, [groups, filterLineId, incompleteOnly, endingFavorites, favoritesOnly, favoriteEndingCount, endingsQuery, tierFilter, tornOnly]);
  const filteredBranchGroups = useMemo(
    () => (filterLineId === "all" ? branchGroups : branchGroups.filter((group) => group.lineId === filterLineId)),
    [branchGroups, filterLineId],
  );

  return {
    save,
    activeTheme,
    switchTheme,
    groups,
    /* 图鉴筛选（内容扩容批次） */
    filterLineId,
    setFilterLineId,
    incompleteOnly,
    toggleIncompleteOnly,
    /* 结局收藏置顶（批次 CY-34）+ 页边批注（批次 CY-35） */
    endingFavorites,
    toggleFavoriteEnding,
    favoritesOnly,
    toggleFavoritesOnly,
    favoriteEndingCount,
    pinnedEndings,
    /* 番外重读（批次 CY-135）+ 连播（CY-136）+ 收藏动效：纯重读不写档，新钉的心入场高亮一次 */
    replayStory,
    replaySeen: replayStory ? hasSeenSideStory(replayStory.id, save) : false,
    openReplay,
    closeReplay,
    finishReplay,
    replayStamp,
    startBinge,
    advanceBinge,
    bingeHasNext,
    bingeLabel,
    /* 夜谈连播（批次 CY-137） */
    nightBook,
    startNightBinge,
    advanceNightBinge,
    closeNightBinge,
    nightHasNext,
    nightLabel,
    nightAuto,
    toggleNightAuto,
    /* 结算册 · 整册打包（批次 CY-140） */
    settlementExportState,
    startSettlementExport,
    settlementItems,
    captureSettlementAlbum,
    settlementExportOpen,
    /* 附页合集 · 舞台出图（批次 CY-141） */
    sideAlbumOpen,
    sideAlbumState,
    startSideAlbum,
    captureSideAlbum,
    /* 图鉴检索（批次 CY-141） */
    endingsQuery,
    setEndingsQuery,
    /* 高级筛选（批次 CY-142） */
    tierFilter,
    setTierFilter,
    tornOnly,
    toggleTornOnly: () => setTornOnly((prev) => !prev),
    tornEndingCount,
    /* 筛选组合（批次 CY-143） */
    galleryPresets,
    activePresetId,
    saveGalleryPreset,
    applyGalleryPreset,
    deleteGalleryPreset,
    importPresetLine,
    presetRecalls,
    freshPinned,
    marginalNotes,
    endingNotes,
    refreshNotes,
    /* 学期纪念册（批次 CY-37）：进图鉴时读一次——结档发生在别处，回柜再翻就是新的 */
    memorabilia: getMemorabilia(),
    /* 今日新收（批次 CY-47 联动）：>0 = 这一页进柜时还没签收，卡面盖「今日新收」 */
    newMemoStamp,
    /* 已存出的纸（批次 CY-42）：出档广播实时翻簿 */
    exportLog,
    filteredGroups,
    filteredBranchGroups,
    collectedCount,
    totalCount,
    lineSummaries,
    allCollected,
    hiddenEndings,
    openHidden,
    tornEndings: save.tornEndings ?? [],
    tearEnding,
    /* 蛙的生物学（批次 AH）：柜子里的旧皮——蜕下的学期快照，可穿回 */
    shedSkins: getShedSkins(),
    wearSkinBy,
    /* 合上档案柜（批次 AN）：闭柜不在流程里——档案室的另一条终点 */
    cabinetClosed: save.cabinetClosed === true,
    cabinetCloses: save.cabinetCloses ?? 0,
    cabinetOpens: save.cabinetOpens ?? 0,
    cabinetOverlayOpen,
    requestCloseCabinet,
    closeCabinetOverlay,
    reopenCabinet,
    /* 校园是活的系统（批次 AP）：提前毕业的学期也有典礼——成绩单不完整；缺席记录在档案柜里 */
    earlyGraduated: save.earlyGraduated === true,
    awayLog: save.awayLog ?? [],
    /* 校园的声音（批次 AQ）：广播转播 / 点名 / 公示——档案开始念你的那几样 */
    broadcastPlayed: save.broadcastPlayed === true,
    rollcallAnswered: save.rollcallAnswered ?? 0,
    rollcallMisses: save.rollcallMisses ?? 0,
    noticeSemesters: save.noticeSemesters ?? [],
    /* 你的位置（批次 AR）：替身已到堂 / 被代签 / 署名启事——名字开始被别的东西使用 */
    surrogateEver: save.surrogateEver === true,
    signings: save.signings ?? 0,
    postings: save.postings ?? 0,
    /* 另一些日子（批次 AS）：停课 / 清点 / 教研室——校园里那些不为你存在的部分 */
    holidays: save.holidays ?? 0,
    inventories: save.inventories ?? 0,
    sightings: save.sightings ?? 0,
    /* 时间的形状（批次 AT）：暂停 / 倒带 / 快进 / 停留——时间本身变成可操作的东西之后 */
    pausedTotal: save.pausedTotal ?? 0,
    rewinds: save.rewinds ?? 0,
    forwards: save.forwards ?? 0,
    stays: save.stays ?? 0,
    /* 语言本身（批次 AV）：词义册 / 划掉的字 / 读完了的份数 */
    wordDefs,
    wordSaid: save.wordSaid === true,
    sayTheWord,
    struckCount,
    fullReads: save.fullReads ?? 0,
    /* 同届（批次 AX）：满意度调查 / 毕业照——你不是唯一的一个，但制度不提供认识彼此的功能 */
    surveyOpen,
    acceptSurvey,
    /* 关于你（批次 BE）：借阅记录——你的档案在流通，你不会知道它读出了什么 */
    borrowOpen,
    closeBorrow: () => setBorrowOpen(false),
    /* 编目（批次 BS）：确认或否认一个角色——玩家决定什么算存在 */
    existenceOpen,
    existenceRows,
    existenceSummary,
    existenceSpecial,
    existenceNote,
    existenceIntroSeen: save.existenceIntroSeen === true,
    openExistence,
    closeExistence,
    ackExistenceIntro,
    applyExistence,
    /** 本学期被否认/自行降级的蛙（图鉴降级口径：位置变成空白，编号还在） */
    degradedFrogs,
    /** 档案柜里那几页没有名字的档案 */
    nonCatalogPages,
    /* 会议（批次 BG）：列席 / 执笔 / 回避——你从被记录的那只，变成了记录的那只 */
    meetings: save.meetings ?? [],
    recusalSeen: save.recusalSeen === true,
    /* 交接（批次 BH）：移交单 / 抽屉 / 结论——制度不问你懂不懂，只问你签不签 */
    handovers: (save.handoverLog ?? []).map((item) => ({
      semester: item.semester,
      day: item.day,
      frogName: FROG_CHARACTERS[item.frogId]?.displayName ?? "不详",
      verdict: item.verdict,
    })),
    /* 窗口（批次 BI）：值班 / 收表 / 签章——窗口不判断，窗口只负责收 */
    windowShifts: (save.windowLog ?? []).map((item) => ({
      semester: item.semester,
      day: item.day,
      applicantName: FROG_CHARACTERS[item.applicant]?.displayName ?? "不详",
      returned: item.returned,
    })),
    /* 帮带（批次 BJ）：帮带 / 本子 / 出师——你不是学会了制度，你是制度长出来的那只 */
    mentorings: (save.mentoringLog ?? []).map((item) => ({
      semester: item.semester,
      day: item.day,
      apprenticeName: FROG_CHARACTERS[item.apprentice]?.displayName ?? "不详",
    })),
    /* 互查（批次 BK）：编组 / 同数 / 空档 / 补评——一套制度量出来的都是同一套数字 */
    audits: (save.auditLog ?? []).map((item) => ({
      semester: item.semester,
      day: item.day,
      note: item.note,
    })),
    /* 迎检（批次 BL）：迎检 / 轮查 / 查阅申请——写你的那一栏，轮不到你自己看 */
    inspections: (save.inspectionLog ?? []).map((item) => ({
      semester: item.semester,
      day: item.day,
      checkerName: FROG_CHARACTERS[item.checker]?.displayName ?? "不详",
      applied: item.applied,
    })),
    /* 门后（批次 BM）：调任 / 钥匙 / 递卷 / 名牌——门后是文件，文件后面是你 */
    archiveDuties: (save.doorDutyLog ?? []).map((item) => ({
      semester: item.semester,
      day: item.day,
      servedName: FROG_CHARACTERS[item.served]?.displayName ?? "不详",
    })),
    /* 基准（批次 BN）：取样 / 基准线 / 偏差——你就是评价的标准 */
    baselines: save.baselineLog ?? [],
    /* 不符（批次 BO）：退回 / 态度栏 / 对质——最后一只不齐的，由你去核 */
    misalignments: (save.alignLog ?? []).map((item) => ({
      semester: item.semester,
      day: item.day,
      frogName: FROG_CHARACTERS[item.frogId]?.displayName ?? "不详",
      resolved: item.resolved,
    })),
    /* 结卷（批次 BP）：合订 / 目录 / 页脚 / 卷脊——卷脊上只有编号，名字不参与检索 */
    volumes: save.volumeLog ?? [],
    /* 登记（批次 BQ）：公告 / 签到表 / 事由——制度到了唯一没有墙的地方 */
    registrations: save.registerLog ?? [],
    /* 用途（批次 BR）：申报 / 名目 / 结转——有名字的东西才好扣，你的沉默成了预算 */
    budgets: save.budgetLog ?? [],
    /* 迎新（批次 BT）：报到 / 第一行 / 指路 / 编号——名册上有了下一号 */
    orientations: save.orientationLog ?? [],
    /* 消迹（批次 CF）：那一栏是空的——计数还在，内容没了 */
    vanishes: (save.vanishLog ?? []).map((item) => ({
      semester: item.semester,
      day: item.day,
      response: item.response as string | undefined,
    })),
    /* 共谋（批次 AZ）：串供 / 包庇 / 出卖——角色之间有他们自己的档案系统 */
    collusions: save.collusions ?? 0,
    shields: save.shields ?? 0,
    reports: save.reports ?? 0,
    reportedByName: save.reportedBy ? FROG_CHARACTERS[save.reportedBy]?.displayName : undefined,
    dossiers: getDossiers(save),
    isThirdVisit,
    graduateReady,
    graduation,
    ceremonyOpen,
    openCeremony,
    closeCeremony,
    truthGroups: truth.groups,
    truthCollected: truth.collected,
    truthTaken: truth.taken,
    truthTotal: truth.total,
    truthComplete: truth.complete,
    branchGroups,
    branchWalked,
    isTextbook,
    branchTotal,
    branchComplete,
    branchNext,
    goBranch,
    goBranchAt,
    openSecret,
    detail,
    openDetail,
    closeDetail,
    goBack,
    goToMap,
  };
}
