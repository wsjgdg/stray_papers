/**
 * 奶蛙大学 · 本地存档
 * 全部游戏数据只写在浏览器 localStorage 里，不经过任何服务器：
 * 剧情线完成标记 / 进行中标记 / 沉默值累计 / 好感度（真话点数）/
 * 表演分（印象分）与真话罐 / 被注意值 / 三主题选择。
 */
import { FROG_CHARACTERS, type FrogCharacterId } from "@/data/characters";
import { ENDING_INDEX, REGULAR_LINE_IDS, STORYLINES, storylineById, type StorylineId } from "@/data/storylinesMeta";
import { ALL_NIGHT_EVENT_IDS } from "@/data/nightEvents";
import { DAY_EVENTS } from "@/data/dayEvents";
import { ROUTE_FROG_IDS, type RouteFrogId } from "@/data/commonRoute";
import { WEATHER_META, dayOfDoneCount, seedRandom, weatherForDay } from "@/lib/calendar";
import { FACTIONS, FACTION_LINES, FACTION_REQUESTER, factionById, type FactionId } from "@/data/factions";
import { FROG_LINE } from "@/data/departures";
import { ANNOTATE_TEXT } from "@/data/finished";
import { UNDERGROUND_JOB_TEXTS, type UndergroundJobKind, type UndergroundServiceKind } from "@/data/underground";
import type { ShiftResponse } from "@/data/testimony";
import { buildClassSchedule, type ClassKind, type TermSnapshot } from "@/lib/schedule";
export type { ClassKind, TermSnapshot } from "@/lib/schedule";

/** 结局名（批次 AB）：从结局索引里找认领卷宗的结局名；找不到返回 undefined（外置结局如未编目） */
function endingTitleOf(endingId: string): string | undefined {
  return ENDING_INDEX.find((item) => item.id === endingId)?.title;
}

export type ThemeId = "cream" | "candy" | "paper";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  /** 顶栏紧凑模式下的短名 */
  short: string;
  hint: string;
}

/** 三套可切换的视觉主题（与全局 CSS 变量分组一一对应） */
/* 批次 CH「行政化」：三套主题即三种行政风格——同一份档案，换一种纸与章 */
export const THEME_OPTIONS: ThemeOption[] = [
  { id: "cream", label: "奶白 · 档案纸", short: "奶白", hint: "淡黄档案纸 · 黑色宋体 · 红色印章（盖章声：咔）" },
  { id: "candy", label: "红头 · 喜报", short: "红头", hint: "高饱和红头文件 · 喜报腔（盖章声：唰）" },
  { id: "paper", label: "深夜 · 灯下", short: "深夜", hint: "台灯下的纸面 · 终端章（盖章声：嘀）" },
];

const SAVE_KEY = "naiwa-univ-save-v1";
const THEME_KEY = "naiwa-univ-theme-v1";
/** 音效开关单独落盘：不属于存档本体，开新档（resetGameSave 只清 SAVE_KEY）不会把它清掉 */
const SOUND_KEY = "naiwa-univ-sound-v1";

/** 好感度：按蛙索引的「真话点数」（0-100），旧存档缺字段读档时自动补 0 */
export type AffinityPoints = Record<FrogCharacterId, number>;

export function emptyAffinity(): AffinityPoints {
  const out = {} as AffinityPoints;
  for (const id of Object.keys(FROG_CHARACTERS) as FrogCharacterId[]) out[id] = 0;
  return out;
}

/**
 * 私档（批次 BV）：调阅记录——蛙 id → 首次调阅发生在第几天（day，1 起）。
 * 只进不退：读档不回退（restoreSlot 取两份记录里更早的一次）；开新档清零。
 */
export type DossierReads = Partial<Record<FrogCharacterId, number>>;

export interface GameSaveData {
  /** 多周目计数：现在是第几个学期（开新档时 +1；旧存档缺字段补 1） */
  playthrough: number;
  /** 已完成的剧情线 */
  completedLines: StorylineId[];
  /** 已到达过的剧情线（进行中） */
  visitedLines: StorylineId[];
  /** 沉默值累计：越配合表演，内心越沉默 */
  silenceValue: number;
  /** 好感度（真话点数）：好感不是攻略数值，是你离这只蛙面具背后真话的距离 */
  affinity: AffinityPoints;
  /** 各线续播进度：下次进入直接播放该幕（1 起） */
  lineAct: Partial<Record<StorylineId, number>>;
  /** 结局图鉴：已达成的结局 id（收集要素跨周目保留，开新档不清） */
  unlockedEndings: string[];
  /** 表演分累计：沉默 delta ≥2 的「表演」选项分值之和（印象分的分子；随沉默值一起在开新档时清零） */
  reputation: number;
  /**
   * 被注意值：说真话（沉默 delta ≤0）被记一笔 +1，表演（≥2）被漏一笔 −1，+1 不变。
   * 沉默值记录你被驯化了多少，它记录你被盯上了多少——攒到 8，期末夜会多一个只有高注意才触发的《约谈》。
   * 结局分档不看它（沉默值仍是唯一分档依据）；钳 0 下限、不设上限；开新档清零；旧档缺字段补 0。
   */
  attention: number;
  /** 天气种子：开新档时随机重摇（每局一套天气序列）；同局内同一天恒定；旧档缺字段补 0（沿用旧序列）；批次 H2 */
  weatherSeed: number;
  /** 真话罐：说出口的真话选项文案（跨周目保留，语义同 unlockedEndings，开新档不清） */
  truthJar: string[];
  /** 深夜事件收集：已看过的深夜事件 id（收集品，跨周目保留，开新档不清） */
  seenNightEvents: string[];
  /** CG 定格收集：已展开过的 CG id（收集品，跨周目保留，开新档不清；批次 B2） */
  seenCg: string[];
  /** 角色番外已看记录：讲过的番外 id（收集品，跨周目保留，开新档不清；番外篇批次） */
  sideStoriesSeen: string[];
  /** 新手引导已看过（一次性标记，跨周目保留：看过一次，之后每个学期都不再弹） */
  tutorialSeen: boolean;
  /**
   * 片头已看过（批次 J 起，批次 K 泛化为按线记录）：{ 线 id: 已看过 }。
   * OP 每学期第一次进线自动播，跳过/播完都标记；跨周目保留。
   * 旧档兼容：无此字段视为都没看过；旧字段 opSeenDorm 为真时并入 lights-out 键（迁移逻辑见 sanitizeOpSeen）。
   */
  opSeen?: Record<string, boolean>;
  /** 批次 J 旧字段：宿舍线片头已看过（仅旧档存在，loadGameSave 迁移后不再写入） */
  opSeenDorm?: boolean;
  /** 最近一次触发深夜事件的日历日（每晚只触发一次；天数本身由完成线数派生，这里只记标记） */
  lastNightDay: number;
  /**
   * 白日小事件「校园角落」：已看过的事件 id（批次 I）。
   * 只算已看记录（跨周目保留，开新档不清），不进图鉴、不算收集品分母、不影响任何既有数值口径。
   */
  seenDayEvents: string[];
  /** 最近一次触发白日小事件的日历日（每天最多一个，lastDayEventDay 兜底；开新档清零） */
  lastDayEventDay: number;
  /** 路线认定：本学期锁定的角色线（进行时字段，旧档缺字段按未锁定；开新档清零；批次 C1） */
  lockedRoute?: FrogCharacterId;
  /** 已播过的共通日程里程碑日（进行时字段：[2,4,5,7,8]，旧档缺字段补空数组；开新档清零；批次 C1） */
  playedCommonDays: number[];
  /**
   * 约谈否认档案（批次 V）：约谈里选择「记不清了」的真话原文，跨周目保留——
   * 「档案里多了一行：该蛙否认了某年某月某日的记录。」
   */
  denialLog?: string[];
  /** 学期档案（批次 V）：结局相位快照当学期数值与选择，跨周目保留；档案柜翻阅用 */
  dossiers?: Dossier[];
  /** 涂改档案（批次 AC）：被改过的真话原文（跨学期保留）——约谈里下一周目以「更正记录」重现；凑满三处解锁《涂改》 */
  tamperLog?: string[];
  /** 残卷（下一批）：被撕掉的结局 id 集合 */
  tornEndings?: string[];
  /** 现实行为入档（批次 AF）：记录员的眼睛不看你选了什么，看你何时犹豫、何时停留、何时深夜打开。
   *  跨学期保留；下一周目以「记录员：系统」的口径出现在档案柜里。 */
  behaviorLog?: BehaviorRecord[];
  /** 读档次数（批次 AF）：按剧情线累计——同一页被翻回来的次数多了，纸会起毛 */
  loadCounts?: Record<string, number>;
  /** 复读（下一批）：用同一颗种子走进同一学期的次数 */
  lockedSeedRuns?: number;
  /** 无档（下一批）：被删除种子的学期数（被抹去的学期数） */
  erasedSemesters?: number;
  /** 档案柜认领（批次 AB）：开学期派生的旧结局 id——它不属于本学期，但柜子把它放回来了 */
  archiveClaimed?: string;
  /** 认领卷宗的结局名（派生时一并记下，避免运行时再扫十线） */
  archiveClaimTitle?: string;
  /** 玩家补记认领是否已播（每学期一次；开学期重置） */
  dossierEchoPlayed?: boolean;
  /** 旧结局渗入是否已播（每学期一次；开学期重置） */
  archiveClaimPlayed?: boolean;
  /** 鸣叫「声音」（批次 AH）：没有理由的发声被记录的次数，跨学期保留；攒满二十触一次全员共鸣 */
  calls?: number;
  /** 冬眠（批次 AH）：选择了不参与的学期数——醒来的次数越多，角色越淡（不消失，变淡） */
  hibernations?: number;
  /** 蜕皮（批次 AH）：蜕过的层数——数值清空重来，旧皮留在柜子里，可穿回 */
  molts?: number;
  /** 蜕下的皮（批次 AH）：完整的学期快照，可穿回；上限六层 */
  shedSkins?: ShedSkin[];
  /** 穿回旧皮的回响待播（批次 AH）：下一个深夜事件里，剧情会认出你 */
  moltEchoPending?: boolean;
  /** 全员共鸣已播（批次 AH）：播过之后不再触发 */
  croakChorusPlayed?: boolean;
  /** 传话手数（批次 AJ）：真话被别的蛙传走——key = 真话前 24 字，value = 已传的手数，跨学期保留 */
  truthRelays?: Record<string, number>;
  /** 沉默出借（批次 AJ）：借出去还没还回来的金额（含利息）——本学期内清账，开新学期即作废 */
  silenceLoan?: number;
  /** 替人背档案（批次 AJ）：替别的蛙认下的记录份数，跨学期保留；攒满三解锁《代签》 */
  carried?: number;
  /** 上次替人背档案的日历日（每天最多一次；开新学期清零） */
  lastCarryDay?: number;
  /** 沉默被听见（批次 AK）：本学期是否已播过那场三句对话——每学期一次，开学期重置 */
  silenceHeardPlayed?: boolean;
  /** 被重置（批次 AL）：被注意值被清零的次数——约谈之后系统替你办一次，窗口边你自己申请一次；跨学期保留 */
  resets?: number;
  /** 混种谱系（批次 AM）：这一局的种子是混出来的——[父本, 母本]（本学期字段，开学期清零） */
  seedParents?: [number, number];
  /** 混种计数（批次 AM）：以混出来的种子开局过的次数，跨学期保留；攒满三解锁《混种》 */
  mixedSeeds?: number;
  /** 混种回响是否已播（本学期一次；开学期重置） */
  hybridEchoPlayed?: boolean;
  /** 合上档案柜（批次 AN）：档案室的柜子被玩家亲手合上——闭柜不在流程里，所以没有人记录这件事 */
  cabinetClosed?: boolean;
  /** 合上的时刻（供档案腔引用「早关了十分钟」那一行） */
  cabinetClosedAt?: number;
  /** 合上过几次（跨学期保留；再打开会再记一笔） */
  cabinetCloses?: number;
  /** 再打开过几次（跨学期保留——柜子不问为什么） */
  cabinetOpens?: number;
  /** 沉默主动消耗（批次 AO）：玩家把攒下的沉默交出去的累计点数，跨学期保留；记录员不问原因 */
  silenceSpent?: number;
  /** 上次消耗沉默的日历日（每天最多一次；开学期清零） */
  lastSpendDay?: number;
  /** 上一学期结档快照（批次 AP）：课表从它派生——沉默高排自习、坦诚高排讨论、表演高排展示、被盯上排约谈；跨学期保留 */
  lastTermSnapshot?: TermSnapshot;
  /** 本学期课表（批次 AP）：开学时由快照派生生成，随学期重置；玩家不能改课表，只能决定去不去 */
  classSchedule?: string[];
  /** 逃课次数（批次 AP）：逃课会被记录——次数多了，课被排进更空的教室；跨学期保留 */
  skips?: number;
  /** 到堂节数（批次 AP）：上过的课按节计（跨学期保留——档案照常在数） */
  attended?: number;
  /** 上次处理课的日历日（上过或逃过都算处理过；开学期清零） */
  lastClassDay?: number;
  /** 提前毕业（批次 AP）：主动申请过——学校照发证，成绩单写「未完成全部课程」；图鉴多一页《提前》；跨学期保留 */
  earlyGraduated?: boolean;
  /** 缺席记录（批次 AP）：现实时间 = 游戏时间——离校满三天的每一段，档案替你补一行「无记录」；跨学期保留 */
  awayLog?: AwayRecord[];
  /** 校园广播（批次 AQ）：本学期是否播过那一次真话转播（每学期一次；开学期重置） */
  broadcastPlayed?: boolean;
  /** 点名记录（批次 AQ）：本学期被点过名的日历日（每学期至多两次；开学期清零） */
  rollcallLog?: number[];
  /** 点名应答次数（批次 AQ）：应答也被记录——档案一行「该蛙应答。声音比平时低」；跨学期保留 */
  rollcallAnswered?: number;
  /** 点名未应答次数（批次 AQ）：名单上多一笔；攒满三，点名不再叫你的名字；跨学期保留 */
  rollcallMisses?: number;
  /** 成绩公示（批次 AQ）：公示过的学期号（每学期一次，期末周第一天） */
  noticeSemesters?: number[];
  /** 替身（批次 AR）：逃课满三次之后，教室里坐了一只没有名字的蛙——它替你上过课了；档案没换名字；跨学期保留 */
  surrogateEver?: boolean;
  /** 亲手签收（批次 AR）：本学期那份等你的东西签过了（开学期重置） */
  packageSigned?: boolean;
  /** 被代签（批次 AR）：你不签的东西，第三天起有人替你签——签收人栏的字迹不是你的；开学期重置 */
  packageReplaced?: boolean;
  /** 名字被使用（批次 AR）：亲手签收与被代签的累计次数，跨学期保留 */
  signings?: number;
  /** 署名启事（批次 AR）：本学期是否已看过那张署名是你的启事（每学期贴一次；开学期重置） */
  postedSeen?: boolean;
  /** 署名启事（批次 AR）：看过几次——档案里没有这一行，它不记录它没安排的事；跨学期保留 */
  postings?: number;
  /** 停课日（批次 AS）：本学期那次停课是否已过（每学期一次；开学期重置） */
  holidayPlayed?: boolean;
  /** 经历过的停课日数（批次 AS）：没有安排的日子档案不收，只有你记得；跨学期保留 */
  holidays?: number;
  /** 清点日（批次 AS）：本学期档案柜被清点过（每学期一次；开学期重置） */
  inventoryPlayed?: boolean;
  /** 被清点的次数（批次 AS）：你被数过了——结论照例是「在柜」；跨学期保留 */
  inventories?: number;
  /** 教研室（批次 AS）：本学期是否已在门外站过（每学期一次；开学期重置） */
  officeSeen?: boolean;
  /** 在教研室门外站过的次数（批次 AS）：门内无记录——签字的从来不是你见过的那只；跨学期保留 */
  sightings?: number;
  /** 暂停（批次 AT）：累计暂停的秒数——你以为停住了世界，世界只是等你不在的时候自己走；跨学期保留 */
  pausedTotal?: number;
  /** 倒带（批次 AT）：累计倒带次数——改了剧情，但角色记得原来的版本；跨学期保留 */
  rewinds?: number;
  /** 快进（批次 AT）：累计跳过的行数——你选择了效率，失去了过程；跨学期保留 */
  forwards?: number;
  /** 快进记录（批次 AT）：每一段被跳过的过程留一条摘要（上限 12 条），暂停里可以翻 */
  fastForwardLog?: string[];
  /** 停留（批次 AT）：累计停留次数——试图留在某个瞬间，但瞬间不会留在你身边；跨学期保留 */
  stays?: number;
  /** 记录员的话（批次 AU）：它开过几次口——最多三次，之后把这一栏删了；跨学期保留 */
  recorderLines?: number;
  /** 零点（批次 AU）：沉默值第一次被交到 0 的那一格你看过没有；跨学期保留 */
  silenceZeroSeen?: boolean;
  /** 零点（批次 AU）：浮层待弹标记（addSilence 里跨界时置位，浮层弹出即消费） */
  zeroPending?: boolean;
  /** 词义册（批次 AV）：本学期用那个词回应过一次（每学期一次；开学期重置） */
  wordSaid?: boolean;
  /** 划掉的字（批次 AV）：按结局 id 记划掉的字符与位置——你在改文本，但文本记得你改了什么；跨学期保留 */
  struckChars?: Record<string, StruckChar[]>;
  /** 折叠（批次 AV）：读完了全部内容的结局份数——没展开的那些，你没读；跨学期保留 */
  fullReads?: number;
  /** 结局首见学期（批次 AW）：结局 id → 第一次解锁它的学期——之后每一份都按「已收」计 */
  endingFirstSeen?: Record<string, number>;
  /** 满意度调查（批次 AX）：填过的学期号——每学期一份，五格全部只能填「收到」 */
  surveys?: number[];
  /** 共谋·串供（批次 AZ）：本学期在哪些线听过角色引述你的原话（每线每学期一次；开学期重置） */
  collusionSeen?: string[];
  /** 共谋·串供计数（批次 AZ）：跨学期累计——它们有自己的档案系统，不走流程 */
  collusions?: number;
  /** 共谋·包庇（批次 AZ）：被包庇的次数（跨学期累计）——包庇满三，那只蛙被约谈，之后不再包庇 */
  shields?: number;
  /** 共谋·包庇（批次 AZ）：本学期在哪些线被包庇过（每线每学期一次；开学期重置） */
  shieldSeen?: string[];
  /** 共谋·出卖（批次 AZ）：被举报的次数（跨学期累计）——记录你的人是你认识的人 */
  reports?: number;
  /** 共谋·出卖（批次 AZ）：最近举报你的那只蛙（跨学期保留）——约谈记录上有它的名字 */
  reportedBy?: FrogCharacterId;
  /** 缺席（批次 BB）：按楼记「今天不去了」的次数（跨学期保留）——你在，但你不在场 */
  visitSkips?: Record<string, number>;
  /** 替换（批次 BC）：替别人走线的次数（跨学期保留）——你走了别人的路，档案写你的名字 */
  substitutions?: number;
  /** 替换（批次 BC）：本学期替谁走的线（结局相位消费；lineId） */
  substituteFor?: StorylineId;
  /** 替换（批次 BC）：让角色替你选的次数（跨学期保留）——你放弃了选择，档案仍然记在你头上 */
  deferred?: number;
  /** 替换（批次 BC）：换位申请的次数（跨学期保留）——你体验了别人的档案，但你的档案还在 */
  swaps?: number;
  /** 腐烂（批次 BD）：好感衰减触发过的学期戳——离校满七天回来，全员好感 −5（每学期一次） */
  decaySemester?: number;
  /** 腐烂（批次 BD）：各楼最后被访问的学期——你不去的楼会自己褪色 */
  lastVisits?: Record<string, number>;
  /** 借阅（批次 BE）：借走你档案的蛙与学期（上限六条）——你不会知道它读出了什么 */
  borrowers?: BorrowRecord[];
  /** 会议（批次 BG）：你列席过、执笔过的会议——你在会议室，纸上未必有你（上限八条） */
  meetings?: MeetingRecord[];
  /** 会议（批次 BG）：约谈的回避栏出现过没有——填的是最向着你的那只；跨学期只办一次 */
  recusalSeen?: boolean;
  /** 交接（批次 BH）：你按下的结论——认定属实 / 不予认定，制度不问你懂不懂（上限十二份） */
  handoverLog?: HandoverRecord[];
  /** 交接（批次 BH）：本学期交接过没有——抽屉每学期换一批，结论每年都要重新签 */
  handoverSeen?: boolean;
  /** 窗口（批次 BI）：你值班的那几天——收表、签章、退件（上限十次） */
  windowLog?: WindowRecord[];
  /** 窗口（批次 BI）：本学期值班过没有——排班表每学期换一批，窗口永远有人坐 */
  windowSeen?: boolean;
  /** 帮带（批次 BJ）：带过的帮带——跟学内容一栏只有一个词（上限八条） */
  mentoringLog?: MentorRecord[];
  /** 帮带（批次 BJ）：本学期帮带过没有——每学期都有一只新帮带，流程一直有人教 */
  mentoringSeen?: boolean;
  /** 互查（批次 BK）：你翻过的柜子——数值三栏全部和你的档案一样（上限六次） */
  auditLog?: AuditRecord[];
  /** 互查（批次 BK）：本学期互查过没有——柜子每学期互相打开一次 */
  auditSeen?: boolean;
  /** 迎检（批次 BL）：你被查过的那几次——检查记录只写「无异常」（上限六次） */
  inspectionLog?: InspectionRecord[];
  /** 迎检（批次 BL）：本学期受检过没有——重点名册每学期换一批 */
  inspectionSeen?: boolean;
  /** 门后（批次 BM）：你在档案室看过的柜——递卷不认人（上限六次） */
  doorDutyLog?: DutyRecord[];
  /** 门后（批次 BM）：本学期调任过没有——看柜的岗位一直在，坐进去的换 */
  doorDutySeen?: boolean;
  /** 基准（批次 BN）：你的档案被抽进「正常值」的那几次——偏差一栏写着 0（上限六次） */
  baselineLog?: BaselineRecord[];
  /** 基准（批次 BN）：本学期取样过没有——基准每学期修订，修订从你取样 */
  baselineSeen?: boolean;
  /** 不符（批次 BO）：你核对过的那份不符档案——对不上的那一栏没有数字（上限六次） */
  alignLog?: AlignRecord[];
  /** 不符（批次 BO）：本学期核对过没有——柜子每学期都要齐一次 */
  alignSeen?: boolean;
  /** 结卷（批次 BP）：结成册的学期——卷首有目录，卷末有页脚，卷脊贴标签（上限六册） */
  volumeLog?: VolumeRecord[];
  /** 结卷（批次 BP）：本学期结过卷没有——每学期合订一册 */
  volumeSeen?: boolean;
  /** 登记（批次 BQ）：湖边立牌的那几次——制度到了唯一没有墙的地方（上限六次） */
  registerLog?: RegisterRecord[];
  /** 登记（批次 BQ）：本学期登记过没有——牌子立了就一直在 */
  registerSeen?: boolean;
  /** 用途（批次 BR）：沉默申报过用途的那几次——有名字的东西才好扣（上限六次） */
  budgetLog?: BudgetRecord[];
  /** 用途（批次 BR）：本学期申报过没有——名目每学期换一次 */
  budgetSeen?: boolean;
  /** 用途（批次 BR）：按名目算好的结转余额（最多十点）——新学期开始时一次性发放后清零 */
  silenceCarry?: number;
  /** 编目（批次 BS）：存在认定记录——否认不是删除，是「从来没存在过，但文本里留下了痕迹」（上限二十四条） */
  existenceLog?: ExistenceRecord[];
  /** 编目（批次 BS）：自行申请降级的蛙（跨学期保留——自己选择消失的不回来） */
  selfDemoted?: FrogCharacterId[];
  /** 编目（批次 BS）：权限说明看过没有——之后它只替你执行，不再解释 */
  existenceIntroSeen?: boolean;
  /** 迎新（批次 BT）：你替新蛙写下的第一行——档案不修改第一行（上限六次） */
  orientationLog?: OrientationRecord[];
  /** 迎新（批次 BT）：本学期迎新过没有——每学期都有一只新蛙，名册一直变长 */
  orientationSeen?: boolean;
  /**
   * 私档（批次 BV）：调阅记录——蛙 id → 首次调阅发生在第几天（day，1 起）。
   * 只进不退：读档不回退（restoreSlot 取两份记录里更早的一次）；开新档清零。
   * 你看了，角色就会知道——这条线从此换一种关系，不可逆。
   */
  dossierReads?: DossierReads;
  /** 补录（批次 BW）：补交的《情况说明》——事由一栏是你自己写的（上限六份，跨学期保留） */
  explainLog?: ExplainRecord[];
  /** 补录（批次 BW）：本学期补录过没有——每学期查一次，查完归档 */
  explainSeen?: boolean;
  /** 会签（批次 BX）：各部门在说明上的评语——制度不核对内容，只核对有这份说明（上限六次，跨学期保留） */
  signOffLog?: SignOffRecord[];
  /** 会签（批次 BX）：本学期会签过没有——说明每学期流转一轮 */
  signOffSeen?: boolean;
  /** 归档（批次 BY）：封卷记录——封卷、铅封、编号、入柜（上限六卷，跨学期保留） */
  sealLog?: SealRecord[];
  /** 归档（批次 BY）：本学期归档过没有——说明每学期封卷一次 */
  sealSeen?: boolean;
  /** 撰写（批次 BZ）：你写的报告——署名是你学号，被写的不知道是谁写的（上限十二份，跨学期保留） */
  reportLog?: PlayerReport[];
  /** 团体（批次 CA）：关系网的记录——它们动了 / 你加入 / 你旁观 / 它们裂了（上限十二条，跨学期保留） */
  factionLog?: FactionRecord[];
  /** 递件（批次 CB）：你替团体经手的表——被反映人一栏写着你（上限十二份，跨学期保留） */
  courierLog?: CourierRecord[];
  /** 离校（批次 CC）：学期中途不在了的那个——回应三档，档案照写（上限六份，跨学期保留） */
  departureLog?: DepartureRecord[];
  /** 消迹（批次 CF）：被抽走的那一行——计数还在，内容没了（上限八份，跨学期保留） */
  vanishLog?: VanishRecord[];
  /** 已结（批次 CG）：那份提前归好的卷——三档回应，档案照写（上限六份，跨学期保留） */
  finishedLog?: FinishedRecord[];
  /** 离校申请（批次 CH）：事由四选一——申请离校要填表，填完才走（跨学期保留） */
  leaveLog?: LeaveRecord[];
  /** 登记姓名（批次 CH）：入学登记表填的；留空则档案上写「该蛙未登记姓名」（跨周目保留） */
  playerDisplayName?: string;
  /** 具名（批次 CO）：补录/登记过姓名没有——有名字的才好被处理（更名不受理第二次） */
  playerRenamed?: boolean;
  /** 销毁记录（批次 CI）：调阅记录打印后销毁的那几批——销毁也是被记录的行为（上限六批，跨学期保留） */
  shredLog?: ShredRecord[];
  /** 销毁过的档案格（批次 CK）：柜子里没有删除，只有销毁——销毁后那一格多一张空白页（跨学期保留） */
  destroyedSlots?: string[];
  /** 批阅者（批次 CL）：找过记录员 014 没有——三档回应，档案照写（上限六份，跨学期保留） */
  recorderLog?: RecorderRecord[];
  /** 留过的条（批次 CL）：「我想见你。」——压在它桌面玻璃板下，跨周目都在 */
  recorderNoteLeft?: boolean;
  /** 传染（批次 CM）：对校园安静程度变化的三档回应——你成了开头的那一只（上限六份，跨学期保留） */
  quietingLog?: QuietingRecord[];
  /** 不告而别（批次 CN）：没办手续直接关掉页面的次数——它不怪你，它只是记录（跨学期保留） */
  abscondCount?: number;
  /** 不告而别（批次 CN）：补办过说明没有——补过一次就记着（跨学期保留） */
  abscondSettled?: boolean;
  /** 不告而别（批次 CN）：最近一次说明选的是哪一种（三档——结局派生用，跨学期保留） */
  abscondResponse?: "settle" | "promise" | "claim";
  /** 交班（批次 CP）：学期末的经办交接——三档回应，档案照写（上限六份，跨学期保留） */
  shiftHandoverLog?: ShiftHandoverRecord[];
  /** 回单（批次 CQ）：签过的单子被叫回来核对——三档应对（上限六份，跨学期保留） */
  testimonyLog?: TestimonyRecord[];
  /** 接任（批次 CR）：接办人一栏的填法——三档（上限六份，跨学期保留） */
  successionLog?: SuccessionRecord[];
  /** 误投（批次 CS）：处分决定书投错了——三档处理（上限六份，跨学期保留） */
  misdeliveryLog?: MisdeliveryRecord[];
  /** 补页（批次 CT）：卷宗缺了一页，遗失页由你补述——三档补法（上限六份，跨学期保留） */
  lostPageLog?: LostPageRecord[];
  /** 合档（批次 CV）：卷宗重号合并为一宗——三档处理（上限六份，跨学期保留） */
  mergerLog?: MergerRecord[];
  /** 转递（批次 CW）：卷宗离柜复核一趟——三档送法（上限六份，跨学期保留） */
  transitLog?: TransitRecord[];
  /** 被读（批次 CY）：档案被调阅一次，知会单按规定不应当存在——三档处理（上限六份，跨学期保留） */
  bereadLog?: BereadRecord[];
  /** 便条（批次 CZ）：信格里一张没编号的手写纸——三档处理（上限六份，跨学期保留） */
  noteLog?: NoteRecord[];
  /** 定稿（批次 DA）：学期清点表签字与否——三档处理（上限六份，跨学期保留） */
  finalizeLog?: FinalizeRecord[];
  /** 销毁（批次 DB）：作废文书按清册焚化——三档处理（上限六份，跨学期保留） */
  destructionLog?: DestructionRecord[];
  /** 权利（批次 DC）：当事人权利告知书——三档处理（上限六份，跨学期保留） */
  rightsLog?: RightsRecord[];
  /** 对账（批次 DD）：台账日逐项核对——三档处理（上限六份，跨学期保留） */
  reconciliationLog?: ReconciliationRecord[];
  /** 自记（批次 DE）：当事人自行补记本人名下事项——三档处理（上限六份，跨学期保留） */
  selfEntryLog?: SelfEntryRecord[];
  /** 催办（批次 DF）：挂账满一学期的事项——三档处理（上限六份，跨学期保留） */
  overdueLog?: OverdueRecord[];
  /** 申报（批次 DG）：个人物品申报——三档处理（上限六份，跨学期保留） */
  declarationLog?: DeclarationRecord[];
  /** 开放日（批次 DH）：档案开放日——三档处理（上限六份，跨学期保留） */
  openDayLog?: OpenDayRecord[];
  /** 顶班（批次 DI）：替别的蛙值班一日——三档处理（上限六份，跨学期保留） */
  substituteLog?: SubstituteRecord[];
  /** 页边（批次 DJ）：规程之外的页边批注——三档处理（上限六份，跨学期保留） */
  pageNoteLog?: PageNoteRecord[];
  /** 记性（批次 DK）：记性核对——三档处理（上限六份，跨学期保留） */
  memoryLog?: MemoryRecord[];
  /** 登记（批次 DL）：非在册文书登记簿——三档处理（上限六份，跨学期保留） */
  unregisteredLog?: UnregisteredRecord[];
  /** 扉页（批次 DM）：卷宗封二的一行字——三档处理（上限六份，跨学期保留） */
  flyleafLog?: FlyleafRecord[];
  /** 认领（批次 DN）：失物认领——三档处理（上限六份，跨学期保留） */
  claimLog?: ClaimRecord[];
  /** 联名（批次 DO）：联名说明——三档处理（上限六份，跨学期保留） */
  jointLog?: JointRecord[];
  /** 互通（批次 DP）：信格通道——三档处理（上限六份，跨学期保留） */
  letterBoxLog?: LetterBoxRecord[];
  /** 命名（批次 DQ）：当事人自命名——三档处理（上限六份，跨学期保留） */
  namingLog?: NamingRecord[];
  /** 同名（批次 DR）：简称重名——三档处理（上限六份，跨学期保留） */
  sameNameLog?: SameNameRecord[];
  /** 总目（批次 DS）：非在册事项总目——三档处理（上限六份，跨学期保留） */
  catalogLog?: CatalogRecord[];
  /** 结转（批次 DT）：学期移交——三档处理（上限六份，跨学期保留） */
  carryoverLog?: CarryoverRecord[];
  /** 留白（批次 DU）：卷宗末页留白——三档处理（上限六份，跨学期保留） */
  blankLog?: BlankRecord[];
  /** 地下组织（批次 CD）：你加入过没有（加入没有退出这一栏；跨学期保留） */
  undergroundJoined?: boolean;
  /** 地下组织（批次 CD）：被暴露的学期号（0 或缺省 = 还没被看见） */
  undergroundExposed?: number;
  /** 地下组织（批次 CD）：断联那夜看过没有（看过之后它们不再出现） */
  undergroundClosedSeen?: boolean;
  /** 地下组织（批次 CD）：它们递过话的学期号（招募每学期最多一次） */
  undergroundMetSemesters?: number[];
  /** 地下组织（批次 CD）：两面的账——白天那件事 / 夜里那一面（上限十二条，跨学期保留） */
  undergroundJobs?: UndergroundJob[];
  /** 地下组织（批次 CD）：托付记录——帮过 / 没帮（上限十二条，跨学期保留） */
  undergroundActs?: UndergroundAct[];
  /** 本能（批次 CE）：上一次鸣叫发作的学期号（每学期至多一次；随学期重置） */
  croakBurstSemester?: number;
  /** 本能（批次 CE）：冬眠待醒回执——醒来之后才发现错过了什么（消费即清） */
  hibernateWake?: HibernationWake;
  /** 本能（批次 CE）：蜕皮待发标记与旧皮摘要（消费即清） */
  moltPending?: boolean;
  moltNote?: string;
  updatedAt: number;
}

/** 借阅记录（批次 BE）：借阅人栏有名字，理由栏空白 */
export interface BorrowRecord {
  frog: FrogCharacterId;
  semester: number;
}

/**
 * 会议记录（批次 BG）：列席与执笔——会议室里的一切都落在纸上，
 * 纸上没有的东西（列席的你、被没记下的反对）就不算发生过。
 */
export interface MeetingRecord {
  /** 学期号 */
  semester: number;
  /** 天数 */
  day: number;
  /** "list" 列席（可以听，不能说）| "recorder" 记录员（轮到你执笔） */
  role: "list" | "recorder";
  /** 列席时是否开了口（说了也没被记录——记录员没有抬笔） */
  spoke?: boolean;
  /** 执笔时那句反对你怎么处理："kept" 记了（被退回重写）| "dropped" 没记（等于没发生） */
  objection?: "kept" | "dropped";
}

/** 交接结论（批次 BH）：抽屉里积压的档案——制度不问你懂不懂，只问你签不签 */
export interface HandoverRecord {
  /** 学期号 */
  semester: number;
  /** 你按下结论的那一天 */
  day: number;
  /** 这份档案是关于哪只蛙的 */
  frogId: FrogCharacterId;
  /** "confirmed" 经认定属实（从此那是它的档案）| "denied" 不予认定（归档的方式是取消） */
  verdict: "confirmed" | "denied";
}

/**
 * 值班记录（批次 BI）：你在窗口坐了一整天。收表不判断；签章的那份申请（把本蛙从名单上移除，
 * 理由栏空白）最后一定盖了章——第一次是你盖的，或者它换了格式回来、每一处你都挑不出毛病、你只能盖。
 * 退过的那一次，是流程里出现判断的那一次。
 */
export interface WindowRecord {
  /** 学期号 */
  semester: number;
  /** 你值班的那一天 */
  day: number;
  /** 交申请的那只蛙（好感最高的那只——它不知道窗口后面是你） */
  applicant: FrogCharacterId;
  /** 退过一次没有：退了，它换了格式回来，第二次你只能盖 */
  returned: boolean;
}

/**
 * 帮带记录（批次 BJ）：跟学内容一栏只有一个词——流程。
 * 本子的格式和你的档案一模一样；推荐人一栏的字，是它照着你的笔迹描的。
 */
export interface MentorRecord {
  /** 学期号 */
  semester: number;
  /** 完成帮带的那一天 */
  day: number;
  /** 帮带是哪只 */
  apprentice: FrogCharacterId;
}

/**
 * 互查记录（批次 BK）：你翻过的柜子。
 * 数值三栏全部和你的档案一样——一套制度量出来的都是同一套数字，不是巧合：表格只有一张；
 * 第七份没有内容——上一只记录员的档案，它什么都没写。
 */
export interface AuditRecord {
  /** 学期号 */
  semester: number;
  /** 互查的那一天 */
  day: number;
  /** 你在空档评语栏补的那一行（≤40 字；空着就是不补） */
  note?: string;
}

/**
 * 迎检记录（批次 BL）：你被查了。互查名单倒着排——你翻过它的柜子，它翻你的。
 * 检查记录只写「无异常」；查阅本人档案被不予受理——档案里写你的是别人。
 */
export interface InspectionRecord {
  /** 学期号 */
  semester: number;
  /** 受检的那一天 */
  day: number;
  /** 查你档案的那只（互查名单倒着排——你翻过它的柜子） */
  checker: FrogCharacterId;
  /** 你有没有申请过查阅本人档案（被不予受理：越权） */
  applied: boolean;
}

/**
 * 门后记录（批次 BM）：你在档案室坐了一班。柜台不认人——不问姓名，只问编号；
 * 递出去的第一份是你自己的那份，它翻完说「谢了」就走。
 * 上一批（BE）你等了三学期的那道题「它读出了什么」，答案在这里：什么都没有。
 */
export interface DutyRecord {
  /** 学期号 */
  semester: number;
  /** 调任的那一天 */
  day: number;
  /** 来查档的那只 */
  served: FrogCharacterId;
}

/**
 * 基准记录（批次 BN）：你的档案被抽进「正常值」的样本。
 * 别的蛙按这一栏对齐；偏差一栏写着 0——制度不评价你，因为你就是评价的标准。
 */
export interface BaselineRecord {
  /** 学期号 */
  semester: number;
  /** 基准公布的那一天 */
  day: number;
}

/**
 * 不符档案的核对结果（批次 BO）：那只蛙的档案被退回重写了三回，理由都是「与基准不符」——
 * 数值对得上、措辞对得上、格式对得上，对不上的那一栏没有数字：态度。
 * 你是基准样本，制度派你去核。两种处理最后都落在「已核」上——
 * 区别在档案：要求复核的那份多一行「该蛙曾要求复核」——流程里没有这一项，它是被记进去的。
 */
export interface AlignRecord {
  /** 学期号 */
  semester: number;
  /** 核对的那一天 */
  day: number;
  /** 不符档案是哪只的 */
  frogId: FrogCharacterId;
  /** "aligned" 按基准来（它自己改了）| "reviewed" 要求过复核（维持原认定，档案里多一行） */
  resolved: "aligned" | "reviewed";
}

/**
 * 结卷记录（批次 BP）：这一学期的事订成了一本——卷首有目录，卷末有页脚，卷脊贴标签。
 * 目录上的每一行都能翻到对应的页：检索过的学期，比经历过的短。
 */
export interface VolumeRecord {
  /** 学期号 */
  semester: number;
  /** 结卷的那一天 */
  day: number;
}

/**
 * 登记记录（批次 BQ）：湖是全校唯一没有墙的地方。
 * 登记处的签到表和宿舍那张同一批印的；事由一栏，大家都写「散步」——像「正常」一样。
 */
export interface RegisterRecord {
  /** 学期号 */
  semester: number;
  /** 立牌的那一天 */
  day: number;
}

/**
 * 沉默用途申报（批次 BR）：沉默必须有用途——「无用途」不予受理（沉默的用途是它的属性）。
 * 受理之后你的沉默有了名目（备考／情绪／其他人员，只有这三个）；
 * 学期末没用完的按名目结转，最多十点——你的沉默成了预算。
 */
export interface BudgetRecord {
  /** 学期号 */
  semester: number;
  /** 申报的那一天 */
  day: number;
  /** 名目 */
  purpose: SilencePurpose;
}

/**
 * 存在认定记录（批次 BS）：确认或否认一个角色。
 * 否认不是删除——是「从来没存在过，但文本里留下了痕迹」：该蛙出现的场景重新渲染成空白，
 * 关于它的文本降级为脚注（原文还在，可以点开看，但已降级）。
 * 每学期认定一次口径；同一只蛙同一学期反复确认又否认，第三次起它自己申请降级（跨学期不回来）。
 */
export interface ExistenceRecord {
  /** 学期号 */
  semester: number;
  /** 认定的是哪只 */
  frogId: FrogCharacterId;
  /** "confirmed" 在册 | "denied" 非编目 */
  verdict: "confirmed" | "denied";
}

/**
 * 迎新记录（批次 BT）：窗口后面是你，递表来的是一只新蛙——没有名字，只有编号（第 7 号）。
 * 新档案的第一行由你写，档案不修改第一行；它问哪里能不填表，你指了湖的方向——
 * 你以为你给它指了条路，你指的只是另一张表。
 */
export interface OrientationRecord {
  /** 学期号 */
  semester: number;
  /** 迎新的那一天 */
  day: number;
  /** 你替它写的第一行（≤24 字） */
  note?: string;
}

/**
 * 补录说明（批次 BW）：未经申请的调阅，事后补的那份《情况说明》。
 * 事由一栏是你自己写的——这是你档案里第一页由你自己书写的记录（跨学期保留）。
 */
export interface ExplainRecord {
  /** 学期号 */
  semester: number;
  /** 递交说明的那一天 */
  day: number;
  /** 事由一栏（玩家选项原文） */
  subject: string;
  /** 备案口径：routine 例行 / unclear 不详 / confess 照录 / confess-all 全录 */
  mode: "routine" | "unclear" | "confess" | "confess-all";
}

/** 划掉的字（批次 AV）：第 i 个字符、字符本身、划掉的时刻（档案行要用） */
export interface StruckChar {
  i: number;
  ch: string;
  at: number;
}

/** 缺席记录（批次 AP）：一段现实的离开——档案只记起止日期，不记期间发生了什么 */
export interface AwayRecord {
  /** 离开时刻（Unix 毫秒） */
  from: number;
  /** 回来时刻（Unix 毫秒） */
  to: number;
  /** 缺席天数（向下取整） */
  days: number;
}

/** 缺席清洗（批次 AP）：字段齐且日期合理的条目才收；上限六段（更旧的滚出柜子） */
function sanitizeAwayLog(raw: unknown): AwayRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: AwayRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.from !== "number" || typeof o.to !== "number" || !Number.isFinite(o.from) || !Number.isFinite(o.to)) continue;
    if (o.to < o.from) continue;
    out.push({
      from: Math.round(o.from),
      to: Math.round(o.to),
      days: typeof o.days === "number" && Number.isFinite(o.days) ? Math.max(0, Math.round(o.days)) : 0,
    });
  }
  return out.slice(-6);
}

/** 上一学期快照清洗（批次 AP）：字段非负整数，形状不对整条丢弃 */
function sanitizeTermSnapshot(raw: unknown): TermSnapshot | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.silence !== "number" || typeof o.attention !== "number") return undefined;
  const num = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return { silence: num(o.silence), truth: num(o.truth), impression: num(o.impression), attention: num(o.attention) };
}

/** 课表清洗（批次 AP）：每项必须是已知的课型；长度补齐 / 截断到 10 节 */
const CLASS_KIND_SET = new Set<string>(["study", "talk", "show", "talkwith"]);

function sanitizeClassSchedule(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !CLASS_KIND_SET.has(item)) continue;
    out.push(item);
  }
  return out.slice(0, 10);
}

/** 已知的线 id 集合（sanitize 用） */
const KNOWN_LINE_SET = new Set<string>(STORYLINES.map((line) => line.id));

/** 举报人清洗（批次 AZ）：必须是已知的蛙 id，形状不对整条丢弃 */
function sanitizeReportedBy(raw: unknown): FrogCharacterId | undefined {
  if (typeof raw !== "string") return undefined;
  return raw in FROG_CHARACTERS ? (raw as FrogCharacterId) : undefined;
}

/** 划掉的字清洗（批次 AV）：每格是 { i, ch, at } 的数组，形状不对的条目丢弃 */function sanitizeStruckChars(raw: unknown): Record<string, StruckChar[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, StruckChar[]> = {};
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const items: StruckChar[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (typeof o.i !== "number" || typeof o.ch !== "string" || o.ch.length !== 1) continue;
      items.push({
        i: Math.max(0, Math.round(o.i)),
        ch: o.ch,
        at: typeof o.at === "number" && Number.isFinite(o.at) ? o.at : 0,
      });
    }
    if (items.length > 0) out[key] = items.slice(0, 8);
  }
  return out;
}

/** 正整数列表清洗（批次 AQ：公示过的学期号；去重、去非正整数） */
function sanitizePositiveInts(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const value of raw) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1) continue;
    seen.add(Math.round(value));
  }
  return [...seen].sort((a, b) => a - b);
}

/** 学期档案（批次 V）：一局结束时的自我观察快照；档案柜的每一页 */
export interface Dossier {
  /** 第几个学期 */
  playthrough: number;
  silenceValue: number;
  reputation: number;
  attention: number;
  /** 真话条数（本学期） */
  truthCount: number;
  /** 本学期走过的岔路（选项文案） */
  branchWalked: string[];
  /** 本学期看过的深夜事件标题 */
  nightTitles: string[];
  /** 约谈否认条数 */
  denialCount: number;
  /** 本学期认定的蛙（未认定则空） */
  lockedRoute?: FrogCharacterId;
  /** 本学期完成/走到过的线 */
  visitedLines: string[];
  /** 档案印章：no-seal=无章 / on-file=在册 / under-watch=重点 */
  stamp: "no-seal" | "on-file" | "under-watch";
  /** 档案批语（按数值组合生成，档案腔） */
  comment: string;
  /** 局号（批次 X）：这一学期的种子码——贴回标题页就能重走这一局的世界；旧档无此字段 */
  seedCode?: string;
  /** 混种谱系（批次 AM）：这学期是混出来的——「混种 · 父 NAIWA-xxxxxx · 母 NAIWA-xxxxxx」 */
  seedLineage?: string;
  /** 本人补记（批次 AA）：玩家自己写进档案的那句（≤60 字）——下一学期被当值的蛙照着念出来 */
  playerNote?: string;
  /** 该学期的种子已被玩家抹去（批次 AE）：局号栏只留「（已抹去）」 */
  erased?: boolean;
}

export function emptySave(): GameSaveData {
  return {
    playthrough: 1,
    completedLines: [],
    visitedLines: [],
    silenceValue: 0,
    affinity: emptyAffinity(),
    lineAct: {},
    unlockedEndings: [],
    reputation: 0,
    attention: 0,
    weatherSeed: newWeatherSeed(),
    truthJar: [],
    seenNightEvents: [],
    seenCg: [],
    sideStoriesSeen: [],
    tutorialSeen: false,
    lastNightDay: 0,
    seenDayEvents: [],
    lastDayEventDay: 0,
    lockedRoute: undefined,
    playedCommonDays: [],
    denialLog: [],
    dossiers: [],
    dossierReads: {},
    explainLog: [],
    signOffLog: [],
    sealLog: [],
    reportLog: [],
    factionLog: [],
    courierLog: [],
    departureLog: [],
    vanishLog: [],
    finishedLog: [],
    leaveLog: [],
    shredLog: [],
    destroyedSlots: [],
    recorderLog: [],
    recorderNoteLeft: false,
    quietingLog: [],
    abscondCount: 0,
    abscondSettled: false,
    abscondResponse: undefined,
    shiftHandoverLog: [],
    testimonyLog: [],
    successionLog: [],
    misdeliveryLog: [],
    lostPageLog: [],
    mergerLog: [],
    transitLog: [],
    bereadLog: [],
    noteLog: [],
    finalizeLog: [],
    destructionLog: [],
    rightsLog: [],
    reconciliationLog: [],
    selfEntryLog: [],
    overdueLog: [],
    declarationLog: [],
    openDayLog: [],
    substituteLog: [],
    pageNoteLog: [],
    memoryLog: [],
    unregisteredLog: [],
    flyleafLog: [],
    claimLog: [],
    jointLog: [],
    letterBoxLog: [],
    namingLog: [],
    sameNameLog: [],
    catalogLog: [],
    carryoverLog: [],
    blankLog: [],
    undergroundJobs: [],
    undergroundActs: [],
    undergroundMetSemesters: [],
    hibernateWake: undefined,
    moltPending: false,
    updatedAt: 0,
  };
}

/** 私档清洗（批次 BV）：只认已登记的蛙，日期钳到 ≥1 */
function sanitizeDossierReads(raw: unknown): DossierReads {
  const out: DossierReads = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(key in FROG_CHARACTERS)) continue;
    if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
      out[key as FrogCharacterId] = Math.round(value);
    }
  }
  return out;
}

function sanitizeAffinity(raw: unknown): AffinityPoints {
  const out = emptyAffinity();
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(key in out)) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key as FrogCharacterId] = Math.min(100, Math.max(0, Math.round(value)));
    }
  }
  return out;
}

function sanitize(raw: unknown): GameSaveData {
  const base = emptySave();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const knownIds = new Set<string>(STORYLINES.map((line) => line.id));
  const knownEndings = knownEndingIds();
  const pickIds = (value: unknown): StorylineId[] =>
    Array.isArray(value)
      ? value.filter((id): id is StorylineId => typeof id === "string" && knownIds.has(id))
      : [];
  return {
    playthrough: sanitizePlaythrough(obj.playthrough),
    completedLines: pickIds(obj.completedLines),
    visitedLines: pickIds(obj.visitedLines),
    silenceValue:
      typeof obj.silenceValue === "number" && Number.isFinite(obj.silenceValue)
        ? Math.max(0, Math.round(obj.silenceValue))
        : 0,
    affinity: sanitizeAffinity(obj.affinity),
    lineAct: sanitizeLineAct(obj.lineAct, knownIds),
    unlockedEndings: sanitizeEndings(obj.unlockedEndings, knownEndings),
    reputation: sanitizeReputation(obj.reputation),
    attention: sanitizeAttention(obj.attention),
    weatherSeed: sanitizeWeatherSeed(obj.weatherSeed),
    truthJar: sanitizeTruthJar(obj.truthJar),
    seenNightEvents: sanitizeNightEvents(obj.seenNightEvents),
    seenCg: sanitizeCgIds(obj.seenCg),
    sideStoriesSeen: sanitizeSideStories(obj.sideStoriesSeen),
    tutorialSeen: obj.tutorialSeen === true,
    lastNightDay: sanitizeNightDay(obj.lastNightDay),
    seenDayEvents: sanitizeDayEvents(obj.seenDayEvents),
    lastDayEventDay: sanitizeNightDay(obj.lastDayEventDay),
    lockedRoute: sanitizeLockedRoute(obj.lockedRoute),
    playedCommonDays: sanitizePlayedDays(obj.playedCommonDays),
    denialLog: sanitizeStringList(obj.denialLog),
    dossiers: sanitizeDossiers(obj.dossiers),
    dossierReads: sanitizeDossierReads(obj.dossierReads),
    explainLog: sanitizeExplainLog(obj.explainLog),
    explainSeen: obj.explainSeen === true,
    signOffLog: sanitizeSignOffLog(obj.signOffLog),
    signOffSeen: obj.signOffSeen === true,
    sealLog: sanitizeSealLog(obj.sealLog),
    sealSeen: obj.sealSeen === true,
    reportLog: sanitizePlayerReports(obj.reportLog),
    factionLog: sanitizeFactionLog(obj.factionLog),
    courierLog: sanitizeCourierLog(obj.courierLog),
    departureLog: sanitizeDepartureLog(obj.departureLog),
    vanishLog: sanitizeVanishLog(obj.vanishLog),
    finishedLog: sanitizeFinishedLog(obj.finishedLog),
    leaveLog: sanitizeLeaveLog(obj.leaveLog),
    playerRenamed: obj.playerRenamed === true,
    shredLog: sanitizeShredLog(obj.shredLog),
    destroyedSlots: sanitizeDestroyedSlots(obj.destroyedSlots),
    recorderLog: sanitizeRecorderLog(obj.recorderLog),
    recorderNoteLeft: obj.recorderNoteLeft === true,
    quietingLog: sanitizeQuietingLog(obj.quietingLog),
    abscondCount: sanitizeAbscondCount(obj.abscondCount),
    abscondSettled: obj.abscondSettled === true,
    shiftHandoverLog: sanitizeShiftHandoverLog(obj.shiftHandoverLog),
    testimonyLog: sanitizeTestimonyLog(obj.testimonyLog),
    successionLog: sanitizeSuccessionLog(obj.successionLog),
    misdeliveryLog: sanitizeMisdeliveryLog(obj.misdeliveryLog),
    lostPageLog: sanitizeLostPageLog(obj.lostPageLog),
    mergerLog: sanitizeMergerLog(obj.mergerLog),
    transitLog: sanitizeTransitLog(obj.transitLog),
    bereadLog: sanitizeBereadLog(obj.bereadLog),
    noteLog: sanitizeNoteLog(obj.noteLog),
    finalizeLog: sanitizeFinalizeLog(obj.finalizeLog),
    destructionLog: sanitizeDestructionLog(obj.destructionLog),
    rightsLog: sanitizeRightsLog(obj.rightsLog),
    reconciliationLog: sanitizeReconciliationLog(obj.reconciliationLog),
    selfEntryLog: sanitizeSelfEntryLog(obj.selfEntryLog),
    overdueLog: sanitizeOverdueLog(obj.overdueLog),
    declarationLog: sanitizeDeclarationLog(obj.declarationLog),
    openDayLog: sanitizeOpenDayLog(obj.openDayLog),
    substituteLog: sanitizeSubstituteLog(obj.substituteLog),
    pageNoteLog: sanitizePageNoteLog(obj.pageNoteLog),
    memoryLog: sanitizeMemoryLog(obj.memoryLog),
    unregisteredLog: sanitizeUnregisteredLog(obj.unregisteredLog),
    flyleafLog: sanitizeFlyleafLog(obj.flyleafLog),
    claimLog: sanitizeClaimLog(obj.claimLog),
    jointLog: sanitizeJointLog(obj.jointLog),
    letterBoxLog: sanitizeLetterBoxLog(obj.letterBoxLog),
    namingLog: sanitizeNamingLog(obj.namingLog),
    sameNameLog: sanitizeSameNameLog(obj.sameNameLog),
    catalogLog: sanitizeCatalogLog(obj.catalogLog),
    carryoverLog: sanitizeCarryoverRecord(obj.carryoverLog),
    blankLog: sanitizeBlankRecord(obj.blankLog),
    abscondResponse:
      obj.abscondResponse === "settle" || obj.abscondResponse === "promise" || obj.abscondResponse === "claim"
        ? obj.abscondResponse
        : undefined,
    playerDisplayName: sanitizeDisplayName(obj.playerDisplayName),
    undergroundJoined: obj.undergroundJoined === true,
    undergroundExposed: typeof obj.undergroundExposed === "number" && obj.undergroundExposed > 0 ? Math.round(obj.undergroundExposed) : 0,
    undergroundClosedSeen: obj.undergroundClosedSeen === true,
    undergroundMetSemesters: sanitizePositiveInts(obj.undergroundMetSemesters),
    undergroundJobs: sanitizeUndergroundJobs(obj.undergroundJobs),
    undergroundActs: sanitizeUndergroundActs(obj.undergroundActs),
    croakBurstSemester: typeof obj.croakBurstSemester === "number" && obj.croakBurstSemester > 0 ? Math.round(obj.croakBurstSemester) : undefined,
    hibernateWake: sanitizeHibernateWake(obj.hibernateWake),
    moltPending: obj.moltPending === true,
    moltNote: typeof obj.moltNote === "string" ? obj.moltNote.slice(0, 80) : undefined,
    tamperLog: sanitizeStringList(obj.tamperLog),
    behaviorLog: sanitizeBehaviorLog(obj.behaviorLog),
    loadCounts: sanitizeLoadCounts(obj.loadCounts),
    calls: typeof obj.calls === "number" ? Math.max(0, Math.round(obj.calls)) : 0,
    hibernations: typeof obj.hibernations === "number" ? Math.max(0, Math.round(obj.hibernations)) : 0,
    molts: typeof obj.molts === "number" ? Math.max(0, Math.round(obj.molts)) : 0,
    shedSkins: sanitizeShedSkins(obj.shedSkins),
    moltEchoPending: obj.moltEchoPending === true,
    croakChorusPlayed: obj.croakChorusPlayed === true,
    truthRelays: sanitizeLoadCounts(obj.truthRelays),
    silenceLoan: typeof obj.silenceLoan === "number" ? Math.max(0, Math.round(obj.silenceLoan)) : 0,
    carried: typeof obj.carried === "number" ? Math.max(0, Math.round(obj.carried)) : 0,
    lastCarryDay: typeof obj.lastCarryDay === "number" ? Math.max(0, Math.round(obj.lastCarryDay)) : 0,
    silenceHeardPlayed: obj.silenceHeardPlayed === true,
    resets: typeof obj.resets === "number" ? Math.max(0, Math.round(obj.resets)) : 0,
    seedParents: sanitizeSeedParents(obj.seedParents),
    mixedSeeds: typeof obj.mixedSeeds === "number" ? Math.max(0, Math.round(obj.mixedSeeds)) : 0,
    hybridEchoPlayed: obj.hybridEchoPlayed === true,
    cabinetClosed: obj.cabinetClosed === true,
    cabinetClosedAt: typeof obj.cabinetClosedAt === "number" ? Math.max(0, Math.round(obj.cabinetClosedAt)) : 0,
    cabinetCloses: typeof obj.cabinetCloses === "number" ? Math.max(0, Math.round(obj.cabinetCloses)) : 0,
    cabinetOpens: typeof obj.cabinetOpens === "number" ? Math.max(0, Math.round(obj.cabinetOpens)) : 0,
    silenceSpent: typeof obj.silenceSpent === "number" ? Math.max(0, Math.round(obj.silenceSpent)) : 0,
    lastSpendDay: typeof obj.lastSpendDay === "number" ? Math.max(0, Math.round(obj.lastSpendDay)) : 0,
    lastTermSnapshot: sanitizeTermSnapshot(obj.lastTermSnapshot),
    classSchedule: sanitizeClassSchedule(obj.classSchedule),
    skips: typeof obj.skips === "number" ? Math.max(0, Math.round(obj.skips)) : 0,
    attended: typeof obj.attended === "number" ? Math.max(0, Math.round(obj.attended)) : 0,
    lastClassDay: typeof obj.lastClassDay === "number" ? Math.max(0, Math.round(obj.lastClassDay)) : 0,
    earlyGraduated: obj.earlyGraduated === true,
    awayLog: sanitizeAwayLog(obj.awayLog),
    broadcastPlayed: obj.broadcastPlayed === true,
    rollcallLog: sanitizePlayedDays(obj.rollcallLog),
    rollcallAnswered: typeof obj.rollcallAnswered === "number" ? Math.max(0, Math.round(obj.rollcallAnswered)) : 0,
    rollcallMisses: typeof obj.rollcallMisses === "number" ? Math.max(0, Math.round(obj.rollcallMisses)) : 0,
    noticeSemesters: sanitizePositiveInts(obj.noticeSemesters),
    surrogateEver: obj.surrogateEver === true,
    packageSigned: obj.packageSigned === true,
    packageReplaced: obj.packageReplaced === true,
    signings: typeof obj.signings === "number" ? Math.max(0, Math.round(obj.signings)) : 0,
    postedSeen: obj.postedSeen === true,
    postings: typeof obj.postings === "number" ? Math.max(0, Math.round(obj.postings)) : 0,
    holidayPlayed: obj.holidayPlayed === true,
    holidays: typeof obj.holidays === "number" ? Math.max(0, Math.round(obj.holidays)) : 0,
    inventoryPlayed: obj.inventoryPlayed === true,
    inventories: typeof obj.inventories === "number" ? Math.max(0, Math.round(obj.inventories)) : 0,
    officeSeen: obj.officeSeen === true,
    sightings: typeof obj.sightings === "number" ? Math.max(0, Math.round(obj.sightings)) : 0,
    pausedTotal: typeof obj.pausedTotal === "number" ? Math.max(0, Math.round(obj.pausedTotal)) : 0,
    rewinds: typeof obj.rewinds === "number" ? Math.max(0, Math.round(obj.rewinds)) : 0,
    forwards: typeof obj.forwards === "number" ? Math.max(0, Math.round(obj.forwards)) : 0,
    fastForwardLog: sanitizeStringList(obj.fastForwardLog).slice(-12),
    stays: typeof obj.stays === "number" ? Math.max(0, Math.round(obj.stays)) : 0,
    recorderLines: typeof obj.recorderLines === "number" ? Math.max(0, Math.round(obj.recorderLines)) : 0,
    silenceZeroSeen: obj.silenceZeroSeen === true,
    zeroPending: obj.zeroPending === true,
    wordSaid: obj.wordSaid === true,
    struckChars: sanitizeStruckChars(obj.struckChars),
    fullReads: typeof obj.fullReads === "number" ? Math.max(0, Math.round(obj.fullReads)) : 0,
    endingFirstSeen: sanitizeLoadCounts(obj.endingFirstSeen),
    surveys: sanitizePositiveInts(obj.surveys),
    collusionSeen: sanitizeStringList(obj.collusionSeen),
    collusions: typeof obj.collusions === "number" ? Math.max(0, Math.round(obj.collusions)) : 0,
    shields: typeof obj.shields === "number" ? Math.max(0, Math.round(obj.shields)) : 0,
    shieldSeen: sanitizeStringList(obj.shieldSeen),
    reports: typeof obj.reports === "number" ? Math.max(0, Math.round(obj.reports)) : 0,
    reportedBy: sanitizeReportedBy(obj.reportedBy),
    visitSkips: sanitizeLoadCounts(obj.visitSkips),
    substitutions: typeof obj.substitutions === "number" ? Math.max(0, Math.round(obj.substitutions)) : 0,
    substituteFor: typeof obj.substituteFor === "string" && KNOWN_LINE_SET.has(obj.substituteFor) ? (obj.substituteFor as StorylineId) : undefined,
    deferred: typeof obj.deferred === "number" ? Math.max(0, Math.round(obj.deferred)) : 0,
    swaps: typeof obj.swaps === "number" ? Math.max(0, Math.round(obj.swaps)) : 0,
    decaySemester: typeof obj.decaySemester === "number" ? Math.max(0, Math.round(obj.decaySemester)) : 0,
    lastVisits: sanitizeLoadCounts(obj.lastVisits),
    borrowers: sanitizeBorrowers(obj.borrowers),
    meetings: sanitizeMeetings(obj.meetings),
    recusalSeen: obj.recusalSeen === true,
    handoverLog: sanitizeHandoverLog(obj.handoverLog),
    handoverSeen: obj.handoverSeen === true,
    windowLog: sanitizeWindowLog(obj.windowLog),
    windowSeen: obj.windowSeen === true,
    mentoringLog: sanitizeMentoringLog(obj.mentoringLog),
    mentoringSeen: obj.mentoringSeen === true,
    auditLog: sanitizeAuditLog(obj.auditLog),
    auditSeen: obj.auditSeen === true,
    inspectionLog: sanitizeInspectionLog(obj.inspectionLog),
    inspectionSeen: obj.inspectionSeen === true,
    doorDutyLog: sanitizeDutyLog(obj.doorDutyLog),
    doorDutySeen: obj.doorDutySeen === true,
    baselineLog: sanitizeBaselineLog(obj.baselineLog),
    baselineSeen: obj.baselineSeen === true,
    alignLog: sanitizeAlignLog(obj.alignLog),
    alignSeen: obj.alignSeen === true,
    volumeLog: sanitizeVolumeLog(obj.volumeLog),
    volumeSeen: obj.volumeSeen === true,
    registerLog: sanitizeRegisterLog(obj.registerLog),
    registerSeen: obj.registerSeen === true,
    budgetLog: sanitizeBudgetLog(obj.budgetLog),
    budgetSeen: obj.budgetSeen === true,
    silenceCarry:
      typeof obj.silenceCarry === "number" && Number.isFinite(obj.silenceCarry)
        ? Math.max(0, Math.min(Math.round(obj.silenceCarry), 12))
        : undefined,
    existenceLog: sanitizeExistenceLog(obj.existenceLog),
    selfDemoted: sanitizeSelfDemoted(obj.selfDemoted),
    existenceIntroSeen: obj.existenceIntroSeen === true,
    orientationLog: sanitizeOrientationLog(obj.orientationLog),
    orientationSeen: obj.orientationSeen === true,
    tornEndings: sanitizeStringList(obj.tornEndings),
    lockedSeedRuns: typeof obj.lockedSeedRuns === "number" ? Math.max(0, Math.round(obj.lockedSeedRuns)) : undefined,
    erasedSemesters: typeof obj.erasedSemesters === "number" ? Math.max(0, Math.round(obj.erasedSemesters)) : undefined,
    archiveClaimed: typeof obj.archiveClaimed === "string" ? obj.archiveClaimed.slice(0, 40) : undefined,
    archiveClaimTitle: typeof obj.archiveClaimTitle === "string" ? obj.archiveClaimTitle.slice(0, 40) : undefined,
    dossierEchoPlayed: obj.dossierEchoPlayed === true,
    archiveClaimPlayed: obj.archiveClaimPlayed === true,
    opSeen: sanitizeOpSeen(obj.opSeen, obj.opSeenDorm),
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : 0,
  };
}

/**
 * 片头已看记录（批次 J 起）：按线 id 记录。旧档只有 opSeenDorm 布尔字段——为真时并入 dorm 键；
 * 新档结构为 Record<string, boolean>，值非真的一律不收（空对象 = 都没看过）。
 */
function sanitizeOpSeen(raw: unknown, legacyDorm: unknown): Record<string, boolean> {
  const seen: Record<string, boolean> = {};
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === true) seen[key] = true;
    }
  }
  if (legacyDorm === true) seen["lights-out"] = true;
  return seen;
}

/** 字符串列表清洗：保留非空字符串 */
function sanitizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/** 学期档案清洗（批次 V）：逐条校验字段类型，未知形状整条丢弃 */
function sanitizeDossiers(raw: unknown): Dossier[] {
  if (!Array.isArray(raw)) return [];
  const out: Dossier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.playthrough !== "number" || typeof o.silenceValue !== "number") continue;
    if (typeof o.comment !== "string" || o.comment.length === 0) continue;
    out.push({
      playthrough: Math.max(1, Math.round(o.playthrough)),
      silenceValue: typeof o.silenceValue === "number" ? Math.max(0, o.silenceValue) : 0,
      reputation: typeof o.reputation === "number" ? Math.max(0, o.reputation) : 0,
      attention: typeof o.attention === "number" ? Math.max(0, o.attention) : 0,
      truthCount: typeof o.truthCount === "number" ? Math.max(0, o.truthCount) : 0,
      branchWalked: sanitizeStringList(o.branchWalked),
      nightTitles: sanitizeStringList(o.nightTitles),
      denialCount: typeof o.denialCount === "number" ? Math.max(0, o.denialCount) : 0,
      lockedRoute: typeof o.lockedRoute === "string" ? (o.lockedRoute as Dossier["lockedRoute"]) : undefined,
      visitedLines: sanitizeStringList(o.visitedLines),
      stamp: o.stamp === "on-file" || o.stamp === "under-watch" ? o.stamp : "no-seal",
      comment: o.comment,
      seedCode: typeof o.seedCode === "string" ? o.seedCode.slice(0, 48) : undefined,
      seedLineage: typeof o.seedLineage === "string" ? o.seedLineage.slice(0, 80) : undefined,
      playerNote: typeof o.playerNote === "string" ? o.playerNote.slice(0, 60) : undefined,
      erased: o.erased === true,
    });
  }
  return out;
}

/** 现实行为记录（批次 AF）：kind 分档——hesitate=选项前犹豫秒数 / night=深夜打开 / idle=长时无操作 */
export interface BehaviorRecord {
  kind: "hesitate" | "night" | "idle" | "setting" | "defer";
  /** 行为发生时的 Unix 毫秒 */
  at: number;
  /** 数值（hesitate 的秒数 / idle 的秒数）；night 不带 */
  seconds?: number;
  /** hesitate 的场景标签（哪个问题面前犹豫的）；setting 是改了哪一项 */
  label?: string;
}

/** 蜕下的皮（批次 AH）：一份可穿回的学期快照——旧皮上写着这一局走的路、说过的真话、沉默的次数 */
export interface ShedSkin {
  /** 蜕皮时的学期数 */
  playthrough: number;
  /** 蜕皮时刻 */
  stamp: number;
  /** 快照（深拷贝）——穿回 = 把存档主档换回它 */
  save: GameSaveData;
}

function sanitizeShedSkins(raw: unknown): ShedSkin[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-6).filter((item): item is ShedSkin => Boolean(item && typeof item === "object" && typeof (item as ShedSkin).playthrough === "number"));
}

function sanitizeBehaviorLog(raw: unknown): BehaviorRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: BehaviorRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.at !== "number") continue;
    if (o.kind !== "hesitate" && o.kind !== "night" && o.kind !== "idle") continue;
    out.push({
      kind: o.kind,
      at: o.at,
      seconds: typeof o.seconds === "number" ? Math.max(0, Math.round(o.seconds)) : undefined,
      label: typeof o.label === "string" ? o.label.slice(0, 40) : undefined,
    });
  }
  return out.slice(-60);
}

/** 混种谱系清洗（批次 AM）：[父本, 母本] 两个 0~999999 的数；形状不对整条丢弃 */
function sanitizeSeedParents(raw: unknown): [number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
  const [a, b] = raw;
  if (typeof a !== "number" || typeof b !== "number") return undefined;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return [Math.max(0, Math.round(a)) % 1000000, Math.max(0, Math.round(b)) % 1000000];
}

function sanitizeLoadCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) out[key.slice(0, 40)] = Math.round(value);
  }
  return out;
}

/** 多周目计数：正整数，缺字段补 1（旧存档兼容，升级后二周目内容自然生效） */
function sanitizePlaythrough(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 1;
  return Math.max(1, Math.round(raw));
}

function sanitizeLineAct(
  raw: unknown,
  knownIds: Set<string>,
): Partial<Record<StorylineId, number>> {
  const out: Partial<Record<StorylineId, number>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!knownIds.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 9) {
      out[key as StorylineId] = Math.round(value);
    }
  }
  return out;
}

/* ---------- 结局图鉴：清洗 ---------- */

/** 全游戏结局 id 集合（按结局索引取数），清洗存档时剔除未知 id */
function knownEndingIds(): Set<string> {
  return new Set(ENDING_INDEX.map((item) => item.id));
}

function sanitizeEndings(raw: unknown, known: Set<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string" || !known.has(id)) continue;
    seen.add(id);
  }
  return [...seen];
}

/** 表演分：非负整数，缺字段补 0（旧存档兼容） */
function sanitizeReputation(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
}

/** 新的天气种子：每局（开新档）随机重摇一次；同局内由确定性伪随机保证同一天恒定 */
function newWeatherSeed(): number {
  return Math.floor(Math.random() * 1000000);
}

/** 天气种子清洗：非负整数有效；旧档缺字段补 0（沿用旧版固定序列，不闪变） */
function sanitizeWeatherSeed(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw)) % 1000000;
}

/** 被注意值：非负整数，缺字段补 0（旧存档兼容） */
function sanitizeAttention(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
}

/** 真话罐：字符串去重，缺字段补空数组（旧存档兼容） */
function sanitizeTruthJar(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const text of raw) {
    if (typeof text !== "string") continue;
    const trimmed = text.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/** 深夜事件收集：剔除未知 id 并去重，缺字段补空数组（旧存档兼容） */
function sanitizeNightEvents(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(ALL_NIGHT_EVENT_IDS);
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string" || !known.has(id)) continue;
    seen.add(id);
  }
  return [...seen];
}

/**
 * 番外已看记录：字符串去重 + 数量夹紧（番外篇批次）。
 * 不做 id 白名单——番外正文住在路由 chunk，首屏链路引它会把全文带进首屏包；
 * 伪造 id 匹配不到任何番外，展示侧自动无效，无害。
 */
function sanitizeSideStories(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string" || id.length === 0 || id.length > 64) continue;
    seen.add(id);
    if (seen.size >= 32) break;
  }
  return [...seen];
}

/** 白日小事件已看记录：剔除未知 id 并去重，缺字段补空数组（旧存档兼容；批次 I） */
function sanitizeDayEvents(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(DAY_EVENTS.map((item) => item.id));
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string" || !known.has(id)) continue;
    seen.add(id);
  }
  return [...seen];
}

/** CG 定格收集：字符串去重，缺字段补空数组（旧存档兼容；未知 id 在图鉴侧被忽略，不崩） */
function sanitizeCgIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string" || !id) continue;
    seen.add(id);
  }
  return [...seen];
}

/** 深夜事件触发日标记：非负整数，缺字段补 0（旧存档兼容） */
function sanitizeNightDay(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
}

/* ---------- 共通日程与路线认定：清洗（批次 C1） ---------- */

/**
 * 锁定的角色线：必须是六只 NPC 蛙之一（主角奶白不进认定表）。
 * 旧档缺字段 / 非法值按未锁定处理（undefined 不落键）。
 */
function sanitizeLockedRoute(raw: unknown): RouteFrogId | undefined {
  if (typeof raw !== "string") return undefined;
  if (raw === "naiBai") return undefined;
  if (!(raw in FROG_CHARACTERS)) return undefined;
  return raw as RouteFrogId;
}

/** 已播过的日程里程碑日：正整数去重、升序（旧档缺字段补空数组） */
function sanitizePlayedDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const value of raw) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const day = Math.round(value);
    if (day < 1 || day > 9) continue;
    seen.add(day);
  }
  return [...seen].sort((a, b) => a - b);
}

/* ---------- 存档损坏提示（优化批次） ---------- */

/** loadGameSave 检出损坏并清档时置位；标题界面消费一次，如实告知玩家（不再静默重置） */
let corruptSaveDetected = false;

/** 消费存档损坏提示标记：只在损坏被检出后的第一次读取返回 true */
export function consumeCorruptSaveNotice(): boolean {
  if (!corruptSaveDetected) return false;
  corruptSaveDetected = false;
  return true;
}

export function loadGameSave(): GameSaveData {
  if (typeof window === "undefined") return emptySave();
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    // 首次访问（盘上无档）：把带随机天气种子的空档落盘建档，让本局天气从此稳定
    if (!raw) return persistGameSave(emptySave());
    return sanitize(JSON.parse(raw));
  } catch {
    /* 存档损坏（JSON 异常等）：先把原文副本留在 -corrupt 键备查，再按空档重开——
       否则下一次 persist 会直接覆盖旧档，玩家进度无声丢失 */
    corruptSaveDetected = true;
    try {
      const broken = window.localStorage.getItem(SAVE_KEY);
      if (broken) window.localStorage.setItem(`${SAVE_KEY}-corrupt`, broken);
    } catch {
      /* 连副本都写不进（隐私模式）就当无事发生 */
    }
    return emptySave();
  }
}

export function persistGameSave(save: GameSaveData): GameSaveData {
  const next: GameSaveData = { ...save, updatedAt: Date.now() };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    /* 不告而别（批次 CN）：本会话推进过就打脏标记——直接关掉页面，也算一次离校 */
    window.sessionStorage.setItem(DIRTY_KEY, "1");
  } catch {
    /* 隐私模式下写入失败就当没存，游戏照常玩 */
  }
  return next;
}

const DIRTY_KEY = "naiwa-univ-session-dirty";

/** 是否有值得「继续进度」的旧存档 */
export function hasExistingSave(): boolean {
  const save = loadGameSave();
  return save.completedLines.length > 0 || save.visitedLines.length > 0 || save.silenceValue > 0;
}

/**
 * 开新档：清空剧情进度、沉默值与表演分，但保留结局图鉴、真话罐与深夜事件收集（跨周目留存）。
 * 多周目继承：只要旧档里有这一学期的痕迹（玩过线 / 有沉默值 / 已是继承档），playthrough +1——
 * 进度清零，「蛙记得你」从下一个学期开始生效。
 */
export function resetGameSave(): GameSaveData {
  const previous = loadGameSave();
  const keptEndings = previous.unlockedEndings;
  const keptTruths = previous.truthJar;
  const keptNightEvents = previous.seenNightEvents;
  const keptDayEvents = previous.seenDayEvents;
  const keptSeenCg = previous.seenCg;
  const keptSideStories = previous.sideStoriesSeen;
  const keptTutorial = previous.tutorialSeen;
  const hadSemester =
    previous.completedLines.length > 0 ||
    previous.visitedLines.length > 0 ||
    previous.silenceValue > 0 ||
    Object.keys(previous.lineAct).length > 0 ||
    previous.playthrough > 1;
  const nextPlaythrough = hadSemester ? previous.playthrough + 1 : 1;
  /* 学期纪念册（批次 CY-37）：结档瞬间自动收一页——开新学期 / 冬眠 / 蜕皮都从这里过，一页不落。
   * 尽力而为：收册失败绝不拦结档 */
  if (hadSemester) {
    try {
      const settingsNow = loadSettings();
      const topEntry = Object.entries(settingsNow.bgmPlays)
        .filter((entry) => entry[1] > 0)
        .sort((a, b) => b[1] - a[1])[0];
      const memo: SemesterMemo = {
        semester: previous.playthrough,
        stamp: Date.now(),
        lines: previous.completedLines.map((lineId) => storylineById(lineId)?.title ?? lineId),
        silence: Math.max(0, previous.silenceValue),
        reputation: Math.max(0, previous.reputation),
        attention: Math.max(0, previous.attention),
        truths: Object.values(previous.affinity).reduce((sum, n) => sum + (Number.isFinite(n) ? Math.max(0, n) : 0), 0),
        endings: keptEndings.length,
        jar: keptTruths.length,
        nights: keptNightEvents.length,
        pins: Object.keys(settingsNow.endingFavorites).length,
        notes: Object.keys(settingsNow.endingNotes).length,
        topTrack: topEntry ? topEntry[0] : "",
        /* 结档那天的天气（批次 CY-56）：天数口径与地图同源——完成数 +1 */
        weather: WEATHER_META[weatherForDay(dayOfDoneCount(previous.completedLines.length), previous.weatherSeed)].label,
      };
      saveSettings({ memorabilia: [...settingsNow.memorabilia, memo].slice(-12) });
    } catch {
      /* 纪念册尽力而为 */
    }
  }
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 同上，忽略 */
  }
  /* 档案柜认领（批次 AB）：新学期开始，柜子从你已解锁的结局里挑一份旧卷宗放回——
     种子派生（同一颗种子认领同一份，与天气序列共用随机源）；全收集之前柜子认领不到 */
  /* 锁定的种子（批次 AE）：锁住 = 反复重走同一局。第三遍起，异常卷宗《复读》开始计数 */
  const locked = loadLockedSeed();
  const repeats = locked !== null && locked === previous.weatherSeed ? (previous.lockedSeedRuns ?? 0) + 1 : previous.lockedSeedRuns ?? 0;
  const claimRoll = seedRandom(newWeatherSeed() * 31 + 7);
  const claimIndex = keptEndings.length > 0 ? Math.floor(claimRoll * keptEndings.length) % keptEndings.length : -1;
  const claimedId = claimIndex >= 0 ? keptEndings[claimIndex] : undefined;
  const next: GameSaveData = {
    ...emptySave(),
    /* 用途（批次 BR）：上学期申报过名目的，没用完的沉默按名目结转（最多十点）——
       发放一次即清零：用不完的不是你的，是名目里的余额 */
    silenceValue: previous.silenceCarry ?? 0,
    playthrough: nextPlaythrough,
    unlockedEndings: keptEndings,
    truthJar: keptTruths,
    seenNightEvents: keptNightEvents,
    seenDayEvents: keptDayEvents,
    seenCg: keptSeenCg,
    sideStoriesSeen: keptSideStories,
    tutorialSeen: keptTutorial,
    opSeen: previous.opSeen,
    denialLog: previous.denialLog,
    dossiers: previous.dossiers,
    tamperLog: previous.tamperLog,
    behaviorLog: previous.behaviorLog,
    loadCounts: previous.loadCounts,
    calls: previous.calls,
    hibernations: previous.hibernations,
    molts: previous.molts,
    shedSkins: previous.shedSkins,
    moltEchoPending: previous.moltEchoPending,
    croakChorusPlayed: previous.croakChorusPlayed,
    truthRelays: previous.truthRelays,
    carried: previous.carried,
    resets: previous.resets,
    mixedSeeds: previous.mixedSeeds,
    cabinetClosed: previous.cabinetClosed,
    cabinetClosedAt: previous.cabinetClosedAt,
    cabinetCloses: previous.cabinetCloses,
    cabinetOpens: previous.cabinetOpens,
    silenceSpent: previous.silenceSpent,
    tornEndings: previous.tornEndings,
    erasedSemesters: previous.erasedSemesters,
    archiveClaimed: claimedId,
    archiveClaimTitle: claimedId ? endingTitleOf(claimedId) : undefined,
    dossierEchoPlayed: false,
    archiveClaimPlayed: false,
    silenceHeardPlayed: false,
    hybridEchoPlayed: false,
    lockedSeedRuns: repeats,
    lastTermSnapshot: hadSemester
      ? {
          silence: previous.silenceValue,
          truth: previous.truthJar.length,
          impression: previous.reputation,
          attention: previous.attention,
        }
      : previous.lastTermSnapshot,
    skips: previous.skips,
    attended: previous.attended,
    lastClassDay: 0,
    earlyGraduated: previous.earlyGraduated,
    /* 认定不随学期被收回（批次 AH 修复）：冬眠是「这一学期不参与」，不是除名；
       蜕皮清的是数值，不是你填过的那张意向表。保留认定 = 新学期主场线照常可走，
       不会出现「冬眠一觉醒来，除了教学楼哪里都进不去」的断崖 */
    lockedRoute: previous.lockedRoute,
    awayLog: previous.awayLog,
    rollcallAnswered: previous.rollcallAnswered,
    rollcallMisses: previous.rollcallMisses,
    noticeSemesters: previous.noticeSemesters,
    surrogateEver: previous.surrogateEver,
    signings: previous.signings,
    postings: previous.postings,
    holidays: previous.holidays,
    inventories: previous.inventories,
    sightings: previous.sightings,
    pausedTotal: previous.pausedTotal,
    rewinds: previous.rewinds,
    forwards: previous.forwards,
    fastForwardLog: previous.fastForwardLog,
    stays: previous.stays,
    recorderLines: previous.recorderLines,
    silenceZeroSeen: previous.silenceZeroSeen,
    zeroPending: previous.zeroPending,
    struckChars: previous.struckChars,
    fullReads: previous.fullReads,
    endingFirstSeen: previous.endingFirstSeen,
    surveys: previous.surveys,
    collusions: previous.collusions,
    shields: previous.shields,
    reports: previous.reports,
    reportedBy: previous.reportedBy,
    visitSkips: previous.visitSkips,
    substitutions: previous.substitutions,
    substituteFor: previous.substituteFor,
    deferred: previous.deferred,
    swaps: previous.swaps,
    decaySemester: previous.decaySemester,
    lastVisits: previous.lastVisits,
    borrowers: previous.borrowers,
    meetings: previous.meetings,
    recusalSeen: previous.recusalSeen,
    handoverLog: previous.handoverLog,
    windowLog: previous.windowLog,
    mentoringLog: previous.mentoringLog,
    auditLog: previous.auditLog,
    inspectionLog: previous.inspectionLog,
    doorDutyLog: previous.doorDutyLog,
    baselineLog: previous.baselineLog,
    alignLog: previous.alignLog,
    volumeLog: previous.volumeLog,
    registerLog: previous.registerLog,
    budgetLog: previous.budgetLog,
    existenceLog: previous.existenceLog,
    selfDemoted: previous.selfDemoted,
    existenceIntroSeen: previous.existenceIntroSeen,
    orientationLog: previous.orientationLog,
    explainLog: previous.explainLog,
    signOffLog: previous.signOffLog,
    signOffSeen: false,
    sealLog: previous.sealLog,
    /* 撰写（批次 BZ）：报告留在柜子里——二周目的档案柜里还在，被写的隐约记得有人写过自己 */
    reportLog: previous.reportLog,
    /* 团体（批次 CA）：加入是绑定，站队是关闭——这两件事都不随学期清 */
    factionLog: previous.factionLog,
    /* 递件（批次 CB）：经手过的每一份都记在你名下——档案不问那件事是不是你做的 */
    courierLog: previous.courierLog,
    /* 离校（批次 CC）：走过的每一只都记在册——下学期它回来，但它不记得你 */
    departureLog: previous.departureLog,
    /* 消迹（批次 CF）：被抽走的那一行也跨学期留档——抽走的不还，但记得抽走这回事 */
    vanishLog: previous.vanishLog,
    /* 已结（批次 CG）：见过那份卷就记在册——下一周目它还在柜子最里头 */
    finishedLog: previous.finishedLog,
    /* 行政化（批次 CH）：离校申请与登记姓名都跨学期保留——同一只蛙，走到哪儿都带着自己的名字 */
    leaveLog: previous.leaveLog,
    playerDisplayName: previous.playerDisplayName,
    playerRenamed: previous.playerRenamed,
    /* 调阅记录（批次 CI）：销毁过的每一批都记在册——销毁不是没发生，是换了一种在 */
    shredLog: previous.shredLog,
    /* 档案格（批次 CK）：销毁过的格子空着，但「销毁过」这件事留着 */
    destroyedSlots: previous.destroyedSlots,
    /* 批阅者（批次 CL）：找过它就记在册——条子压在玻璃板下，下一周目还在 */
    recorderLog: previous.recorderLog,
    recorderNoteLeft: previous.recorderNoteLeft,
    /* 传染（批次 CM）：注意到了就记在册——安静学会了过学期 */
    quietingLog: previous.quietingLog,
    /* 不告而别（批次 CN）：次数跟着档案走——走到哪儿都记着你有几次没办手续 */
    abscondCount: previous.abscondCount,
    abscondSettled: previous.abscondSettled,
    abscondResponse: previous.abscondResponse,
    /* 交班（批次 CP）：交过的班记在册——下一学期有人接着管 */
    shiftHandoverLog: previous.shiftHandoverLog,
    /* 回单（批次 CQ）：作过的证留在档案里——用的是你交出去的版本 */
    testimonyLog: previous.testimonyLog,
    /* 接任（批次 CR）：接办人栏填过就记着——栏里最后是谁，档案照写 */
    successionLog: previous.successionLog,
    /* 误投（批次 CS）：那张纸的去向记着——落在谁名下，按编号核 */
    misdeliveryLog: previous.misdeliveryLog,
    /* 补页（批次 CT）：补上去的那一页留档——回来的是哪一版，以你讲的为准 */
    lostPageLog: previous.lostPageLog,
    /* 合档（批次 CV）：那宗纸记着——一宗，两个名字 */
    mergerLog: previous.mergerLog,
    /* 转递（批次 CW）：出过门的卷宗记着——回来的那一版，是它自己的 */
    transitLog: previous.transitLog,
    /* 被读（批次 CY）：知会单记着——你知道有人读了你，这就够了 */
    bereadLog: previous.bereadLog,
    /* 便条（批次 CZ）：那张没编号的纸记着——它比档案结实 */
    noteLog: previous.noteLog,
    /* 定稿（批次 DA）：清点过的学期记着——定稿还是待定，档案知道 */
    finalizeLog: previous.finalizeLog,
    /* 销毁（批次 DB）：焚化单存根记着——这栋楼里连「没有」都要留一份底 */
    destructionLog: previous.destructionLog,
    /* 权利（批次 DC）：告知过一次，你的权利就一直在——用没用过，卷里记着 */
    rightsLog: previous.rightsLog,
    /* 对账（批次 DD）：对不上的那笔按台账补记——柜子知道是哪种对上法 */
    reconciliationLog: previous.reconciliationLog,
    /* 自记（批次 DE）：你记没记是一回事，台账认不认是另一回事 */
    selfEntryLog: previous.selfEntryLog,
    /* 催办（批次 DF）：不再等的那件事有了它该有的下场 */
    overdueLog: previous.overdueLog,
    /* 申报（批次 DG）：你抽屉里的东西在制度里有了名字——名字是你起的 */
    declarationLog: previous.declarationLog,
    /* 开放日（批次 DH）：被翻过的柜门，关的时候都比没翻过的慢一点 */
    openDayLog: previous.openDayLog,
    /* 顶班（批次 DI）：档案上有一天的空白——空白里装的是谁的一天，你知道 */
    substituteLog: previous.substituteLog,
    /* 页边（批次 DJ）：它不算数，但它在——在页跟在册是两种存在 */
    pageNoteLog: previous.pageNoteLog,
    /* 记性（批次 DK）：差异那一栏有数——数是你记得它没记的那些 */
    memoryLog: previous.memoryLog,
    /* 登记（批次 DL）：那册簿子只记数字——数字是你抽屉里的页数 */
    unregisteredLog: previous.unregisteredLog,
    /* 扉页（批次 DM）：它每年都说一遍那句话——你每次怎么接，它都记着 */
    flyleafLog: previous.flyleafLog,
    /* 认领（批次 DN）：它承认了「找不到」的那段时间——那段时间里，纸一直在你这里 */
    claimLog: previous.claimLog,
    /* 联名（批次 DO）：那页纸上有一个空栏——空栏的意思，它和你都懂 */
    jointLog: previous.jointLog,
    /* 互通（批次 DP）：它给的那个口，开没开、开多宽，都是你定的 */
    letterBoxLog: previous.letterBoxLog,
    /* 命名（批次 DQ）：它不知道意思，但它认——认的意思是它不再改 */
    namingLog: previous.namingLog,
    /* 同名（批次 DR）：它记名字，意思在蛙这里 */
    sameNameLog: previous.sameNameLog,
    catalogLog: previous.catalogLog,
    carryoverLog: previous.carryoverLog,
    blankLog: previous.blankLog,
    /* 地下组织（批次 CD）：加入是长期的，两面的账与托付记录都留档——被暴露的名字不能再用 */
    undergroundJoined: previous.undergroundJoined,
    undergroundExposed: previous.undergroundExposed,
    undergroundClosedSeen: previous.undergroundClosedSeen,
    undergroundJobs: previous.undergroundJobs,
    undergroundActs: previous.undergroundActs,
    /* 本能（批次 CE）：冬眠错过了什么，醒来还要看见——回执跨学期保留直到消费 */
    hibernateWake: previous.hibernateWake,
    broadcastPlayed: false,
    rollcallLog: [],
    packageSigned: false,
    packageReplaced: false,
    postedSeen: false,
    holidayPlayed: false,
    inventoryPlayed: false,
    officeSeen: false,
    wordSaid: false,
    collusionSeen: [],
    shieldSeen: [],
  };
  /* 离校（批次 CC）：上一学期走了没回应的，档案补一行沉默——不回应也是一种回应，只是没字 */
  next.departureLog = (next.departureLog ?? []).map((item) =>
    item.semester === previous.playthrough && !item.response ? { ...item, response: "silent" as const } : item,
  );
  if (locked !== null) {
    next.weatherSeed = locked;
  }
  /* 排课（批次 AP）：开学时把这一学期的课表排好——由上一学期的结档快照派生（沉默高的排自习、
     坦诚高的排讨论、表演高的排展示、被盯上的排约谈；第一学期按标准课表排，不排约谈）。
     种子用本学期天气种子：锁住种子重走同一局时，课表也一并重走同局。 */
  next.classSchedule = buildClassSchedule(
    hadSemester
      ? {
          silence: previous.silenceValue,
          truth: previous.truthJar.length,
          impression: previous.reputation,
          attention: previous.attention,
        }
      : previous.lastTermSnapshot ?? null,
    next.weatherSeed,
  );
  if (
    !hadSemester &&
    keptEndings.length === 0 &&
    keptTruths.length === 0 &&
    keptNightEvents.length === 0 &&
    keptDayEvents.length === 0 &&
    keptSeenCg.length === 0 &&
    !keptTutorial
  ) {
    return next;
  }
  return persistGameSave(next);
}

/** 当前第几个学期（多周目计数；旧存档缺字段按 1 处理） */
export function getPlaythrough(save: GameSaveData = loadGameSave()): number {
  return Math.max(1, Math.round(save.playthrough));
}

export function markLineVisited(lineId: StorylineId): GameSaveData {
  const save = loadGameSave();
  /* 腐烂（批次 BD）：每次进楼都刷新访问学期——你不来的楼会自己褪色 */
  const lastVisits = { ...(save.lastVisits ?? {}), [lineId]: save.playthrough };
  if (save.completedLines.includes(lineId) || save.visitedLines.includes(lineId)) {
    return persistGameSave({ ...save, lastVisits });
  }
  return persistGameSave({ ...save, visitedLines: [...save.visitedLines, lineId], lastVisits });
}

export function markLineCompleted(lineId: StorylineId): GameSaveData {
  const save = loadGameSave();
  if (save.completedLines.includes(lineId)) return save;
  const result = persistGameSave({
    ...save,
    completedLines: [...save.completedLines, lineId],
    visitedLines: save.visitedLines.filter((id) => id !== lineId),
  });
  /* 地下组织（批次 CD）：加入之后，走线也是双面的——走完的线里有一行不是原来的那行 */
  if (isUndergroundActive(loadGameSave())) {
    const currentDay = dayOfDoneCount(countCompletedLines(result));
    const job = undergroundJobTextOf("line", currentDay);
    logUndergroundJob("line", currentDay, job.surface, job.underneath);
  }
  return result;
}

export function addSilence(delta: number): GameSaveData {
  const save = loadGameSave();
  const next = Math.max(0, save.silenceValue + delta);
  /* 零点（批次 AU）：沉默值第一次被交到 0——空白不是没有，是你把能说的都说完了。
     挂 zeroPending 标记，页面挂载时弹一次；不置 silenceZeroSeen 的话同一格还会再触发 */
  const crossing = save.silenceValue > 0 && next === 0 && !save.silenceZeroSeen;
  const extra = crossing ? { silenceZeroSeen: true as const, zeroPending: true as const } : {};
  return persistGameSave({ ...save, silenceValue: next, ...extra });
}

/* ---------- 好感度（真话点数） ---------- */

/** 读某只蛙当前的好感点数（缺字段按 0 处理，向后兼容旧存档） */
export function getAffinity(charId: FrogCharacterId, save: GameSaveData = loadGameSave()): number {
  return save.affinity[charId] ?? 0;
}

/** 给某只蛙加好感点数（钳制在 0-100），返回最新存档 */
export function addAffinity(charId: FrogCharacterId, delta: number): GameSaveData {
  const save = loadGameSave();
  if (!FROG_CHARACTERS[charId] || delta === 0) return save;
  const current = save.affinity[charId] ?? 0;
  const next = Math.min(100, Math.max(0, current + Math.round(delta)));
  if (next === current) return save;
  return persistGameSave({ ...save, affinity: { ...save.affinity, [charId]: next } });
}

/** 记录某线播放到第几幕（续播用） */
export function saveLineAct(lineId: StorylineId, actIndex: number): GameSaveData {
  const save = loadGameSave();
  return persistGameSave({
    ...save,
    lineAct: { ...save.lineAct, [lineId]: Math.max(1, actIndex) },
  });
}

/** 线完结后清掉续播进度 */
export function clearLineAct(lineId: StorylineId): GameSaveData {
  const save = loadGameSave();
  const nextLineAct = { ...save.lineAct };
  delete nextLineAct[lineId];
  return persistGameSave({ ...save, lineAct: nextLineAct });
}

/* ---------- 结局图鉴：写入与读取 ---------- */

/** 记录一个已达成的结局（幂等：重复达成不会重复写入），返回最新存档 */
export function unlockEnding(endingId: string): GameSaveData {
  if (isRecordingMuted()) return loadGameSave();
  const save = loadGameSave();
  const firstSeen = { ...(save.endingFirstSeen ?? {}) };
  if (firstSeen[endingId] === undefined) firstSeen[endingId] = save.playthrough;
  if (save.unlockedEndings.includes(endingId)) {
    /* 已收（批次 AW）：重复提交的结局不再另起一格——柜子只说「已收到」；首见学期照记不误 */
    if (save.endingFirstSeen?.[endingId] === undefined) {
      return persistGameSave({ ...save, endingFirstSeen: firstSeen });
    }
    return save;
  }
  return persistGameSave({ ...save, unlockedEndings: [...save.unlockedEndings, endingId], endingFirstSeen: firstSeen });
}

/** 读某一格结局的首次解锁学期（批次 AW；没解锁过返回 undefined） */
export function endingFirstSeenOf(endingId: string): number | undefined {
  return loadGameSave().endingFirstSeen?.[endingId];
}

/** 读取已解锁的结局 id 列表（旧档缺字段按空数组处理） */
export function getUnlockedEndings(save: GameSaveData = loadGameSave()): string[] {
  return save.unlockedEndings;
}

/** 全游戏结局总数（按结局索引统计） */
export function totalEndingCount(): number {
  return ENDING_INDEX.length;
}

/* ---------- 印象分（表演分）与真话罐 ---------- */

/** 累计表演分（沉默 delta ≥2 的选项分值），返回最新存档 */
export function addReputation(points: number): GameSaveData {
  if (!Number.isFinite(points) || points <= 0) return loadGameSave();
  const save = loadGameSave();
  return persistGameSave({ ...save, reputation: Math.max(0, save.reputation + Math.round(points)) });
}

/** 把一句真话收进罐子（幂等：同一句不重复收），返回是否新收入 */
export function addTruth(text: string): boolean {
  if (isRecordingMuted()) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const save = loadGameSave();
  if (save.truthJar.includes(trimmed)) return false;
  persistGameSave({ ...save, truthJar: [...save.truthJar, trimmed] });
  return true;
}

/** 读取真话罐（旧档缺字段按空数组处理） */
export function getTruthJar(save: GameSaveData = loadGameSave()): string[] {
  return save.truthJar;
}

/* ---------- 被注意值 ---------- */

/** 读被注意值（旧档缺字段按 0 处理，向后兼容旧存档） */
export function getAttention(save: GameSaveData = loadGameSave()): number {
  return save.attention;
}

/**
 * 被注意值增减：说真话（沉默 delta ≤0）被记一笔 +1，表演（≥2）被漏一笔 −1。
 * 钳 0 下限、不设上限（表演可以往回压）；delta 为 0 或非数时是 no-op。返回最新存档。
 */
export function addAttention(delta: number): GameSaveData {
  if (!Number.isFinite(delta) || delta === 0) return loadGameSave();
  const save = loadGameSave();
  return persistGameSave({ ...save, attention: Math.max(0, save.attention + Math.round(delta)) });
}

/* ---------- 校园日历：深夜事件 ---------- */

/**
 * 标记一个深夜事件已看过，并记下触发日（每晚只触发一次）。
 * seenNightEvents 是收集品：开新档不清空，跨周目保留。
 */
export function markNightEventSeen(eventId: string, day: number): GameSaveData {
  const save = loadGameSave();
  const seen = save.seenNightEvents.includes(eventId)
    ? save.seenNightEvents
    : [...save.seenNightEvents, eventId];
  return persistGameSave({
    ...save,
    seenNightEvents: seen,
    lastNightDay: Math.max(save.lastNightDay, Math.max(0, Math.round(day))),
  });
}

/**
 * 角色番外（番外篇批次）：标记一集番外已讲过（幂等）。
 * sideStoriesSeen 是收集品：开新档不清空，跨周目保留（与深夜事件同口径）。
 */
export function markSideStorySeen(storyId: string): GameSaveData {
  const save = loadGameSave();
  if (save.sideStoriesSeen.includes(storyId)) return save;
  return persistGameSave({ ...save, sideStoriesSeen: [...save.sideStoriesSeen, storyId] });
}

/** 番外是否讲过：重看时不再计数（真话不重复入罐、沉默不重复入账） */
export function hasSeenSideStory(storyId: string, save: GameSaveData = loadGameSave()): boolean {
  return save.sideStoriesSeen.includes(storyId);
}

/**
 * 标记一个白日小事件已看过，并记下触发日（每天最多一个，lastDayEventDay 兜底）。
 * seenDayEvents 只算已看记录：开新档不清空，跨周目保留；不进图鉴、不算收集分母（批次 I）。
 */
export function markDayEventSeen(eventId: string, day: number): GameSaveData {
  const save = loadGameSave();
  const seen = save.seenDayEvents.includes(eventId)
    ? save.seenDayEvents
    : [...save.seenDayEvents, eventId];
  return persistGameSave({
    ...save,
    seenDayEvents: seen,
    lastDayEventDay: Math.max(save.lastDayEventDay, Math.max(0, Math.round(day))),
  });
}

/** 读取白日小事件已看记录（旧档缺字段按空数组处理） */
export function getSeenDayEvents(save: GameSaveData = loadGameSave()): string[] {
  return save.seenDayEvents;
}

/* ---------- 共通日程与路线认定（批次 C1） ---------- */

/**
 * 把一条角色线写进本学期档案（路线认定）。
 * 一学期只认一次：已有认定时是 no-op（「认定后这学期不改」由存档层兜底，不只靠 UI）。
 */
export function lockRoute(frogId: RouteFrogId): GameSaveData {
  const save = loadGameSave();
  if (!frogId || !FROG_CHARACTERS[frogId]) return save;
  if (save.lockedRoute) return save;
  return persistGameSave({ ...save, lockedRoute: frogId });
}

/** 读本学期锁定的角色线（旧档缺字段 / 非法值按未锁定） */
export function getLockedRoute(save: GameSaveData = loadGameSave()): RouteFrogId | null {
  return sanitizeLockedRoute(save.lockedRoute) ?? null;
}

/**
 * 标记一段共通日程已播过（幂等追加；日程是脊柱不是收集品，随学期重开）。
 * 返回最新存档。
 */
export function markCommonDayPlayed(day: number): GameSaveData {
  const save = loadGameSave();
  const normalized = Math.round(day);
  if (!Number.isFinite(normalized) || normalized < 1) return save;
  if (save.playedCommonDays.includes(normalized)) return save;
  return persistGameSave({
    ...save,
    playedCommonDays: [...save.playedCommonDays, normalized].sort((a, b) => a - b),
  });
}

/** 读已播过的日程里程碑日（旧档缺字段按空数组处理） */
export function getPlayedCommonDays(save: GameSaveData = loadGameSave()): number[] {
  return sanitizePlayedDays(save.playedCommonDays);
}

/* ---------- CG 定格收集（批次 B2） ---------- */

/** 记一张 CG 已展开（幂等：重复展示不重复写入），返回最新存档 */
export function markCgSeen(cgId: string): GameSaveData {
  if (!cgId) return loadGameSave();
  const save = loadGameSave();
  if (save.seenCg.includes(cgId)) return save;
  return persistGameSave({ ...save, seenCg: [...save.seenCg, cgId] });
}

/** 读取已展开的 CG id 列表（旧档缺字段按空数组处理） */
export function getCgSeen(save: GameSaveData = loadGameSave()): string[] {
  return save.seenCg;
}

/* ---------- 新手引导 ---------- */

/**
 * 记下「引导已看过」：跳过和看完都算看过，之后不再弹（一次性，跨周目保留）。
 */
export function markTutorialSeen(): GameSaveData {
  const save = loadGameSave();
  if (save.tutorialSeen) return save;
  return persistGameSave({ ...save, tutorialSeen: true });
}

/**
 * 约谈否认（批次 V）：把「记不清了」的那句话原文记进否认档案；跨周目保留。
 * 同一条原文重复否认不重复记（按文案幂等去重）。
 */
export function recordDenial(text: string): GameSaveData {
  if (!text) return loadGameSave();
  const save = loadGameSave();
  const log = save.denialLog ?? [];
  if (log.includes(text)) return save;
  return persistGameSave({ ...save, denialLog: [...log, `${text}`] });
}

/**
 * 学期档案快照（批次 V）：结局相位把当学期数值与选择写进档案柜；同学期重复触发覆盖为最新。
 * comment 由调用方生成（档案腔批语），本函数只负责落盘。
 */
export function upsertDossier(entry: Dossier): GameSaveData {
  if (isRecordingMuted()) return loadGameSave();
  const save = loadGameSave();
  const list = (save.dossiers ?? []).filter((item) => item.playthrough !== entry.playthrough);
  return persistGameSave({ ...save, dossiers: [...list, entry] });
}

/** 读全部学期档案（旧档缺字段补空数组） */
export function getDossiers(save: GameSaveData = loadGameSave()): Dossier[] {
  return save.dossiers ?? [];
}

const ENROLL_SEEN_KEY = "naiwa-univ-enroll-seen";

/** 入学登记已看过（批次 AF）：第一次打开游戏才出现档案条；看过之后不再弹 */
export function hasEnrollSeen(): boolean {
  try {
    return window.localStorage.getItem(ENROLL_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function saveEnrollSeen(): void {
  try {
    window.localStorage.setItem(ENROLL_SEEN_KEY, "1");
  } catch {
    /* 同上 */
  }
}

/** 记一笔现实行为（批次 AF）：犹豫 / 深夜打开 / 长时无操作——记录员是系统，不是任何一只蛙 */
export function recordBehavior(entry: Omit<BehaviorRecord, "at"> & { at?: number }): void {
  const save = loadGameSave();
  const record: BehaviorRecord = { ...entry, at: entry.at ?? Date.now() };
  const log = [...(save.behaviorLog ?? []), record].slice(-60);
  persistGameSave({ ...save, behaviorLog: log });
}

/** 鸣叫（批次 AH）：没有理由的发声——被记录，但不叫「鸣叫值」，叫「声音」 */
export function recordCroak(): number {
  const save = loadGameSave();
  const calls = (save.calls ?? 0) + 1;
  persistGameSave({ ...save, calls });
  return calls;
}

/** 冬眠（批次 AH）：跳过一整学期——数值照清（沿用开新学期语义），但档案上写「冬眠期间无记录」 */
export function hibernateNow(): GameSaveData {
  const save = loadGameSave();
  const fresh = resetGameSave();
  return persistGameSave({ ...fresh, hibernations: (save.hibernations ?? 0) + 1 });
}

/** 蜕一层皮（批次 AH）：数值清空开新学期，旧皮留进柜子（上限六层，满则最旧的那张自然掉落） */
export function shedSkinNow(): GameSaveData {
  const save = loadGameSave();
  const skin: ShedSkin = { playthrough: getPlaythrough(save), stamp: Date.now(), save: JSON.parse(JSON.stringify(save)) as GameSaveData };
  const skins = [...(save.shedSkins ?? []), skin].slice(-6);
  const fresh = resetGameSave();
  return persistGameSave({ ...fresh, molts: (save.molts ?? 0) + 1, shedSkins: skins });
}

/** 穿回旧皮（批次 AH）：数值回来，剧情会认出你——下一个深夜事件里多一句「你不是已经蜕过了吗」 */
export function wearSkin(skinStamp: number): boolean {
  const save = loadGameSave();
  const skin = (save.shedSkins ?? []).find((item) => item.stamp === skinStamp);
  if (!skin) return false;
  const kept = { behaviorLog: save.behaviorLog, loadCounts: save.loadCounts, calls: save.calls, hibernations: save.hibernations, molts: save.molts, shedSkins: (save.shedSkins ?? []).filter((item) => item.stamp !== skinStamp), tamperLog: save.tamperLog, tornEndings: save.tornEndings, erasedSemesters: save.erasedSemesters, unlockedEndings: save.unlockedEndings, truthJar: save.truthJar, seenNightEvents: save.seenNightEvents, seenDayEvents: save.seenDayEvents, seenCg: save.seenCg, dossiers: save.dossiers, archiveClaimed: save.archiveClaimed, archiveClaimTitle: save.archiveClaimTitle };
  const restored = { ...skin.save, ...kept, moltEchoPending: true };
  persistGameSave(restored);
  return true;
}

/** 旧皮列表（旧档缺字段补空数组） */
export function getShedSkins(): ShedSkin[] {
  return loadGameSave().shedSkins ?? [];
}

/** 全员共鸣已播（批次 AH）：播过之后不再触发——档案把那声共鸣记成了「设备检测」 */
export function markCroakPlayed(): void {
  persistGameSave({ ...loadGameSave(), croakChorusPlayed: true });
}

/** 全员共鸣是否就绪（批次 AH）：「声音」攒满二十且尚未播过——湖面开始共振 */
export function croakChorusReady(): boolean {
  const save = loadGameSave();
  return (save.calls ?? 0) >= 20 && save.croakChorusPlayed !== true;
}

/** 清除穿回回响待播（批次 AH）：下一个深夜事件播完「你不是已经蜕过了吗」之后调用 */
export function clearMoltEcho(): void {
  const save = loadGameSave();
  if (!save.moltEchoPending) return;
  persistGameSave({ ...save, moltEchoPending: false });
}

/* ---------- 校园是活的系统（批次 AP）：排课 / 逃课 / 提前毕业 / 缺席记录 ---------- */

/** 提前毕业的一次性标记（批次 AP）：申请后跳图鉴，图鉴挂载时读它自动开一次典礼 */
export const EARLY_CEREMONY_FLAG = "naiwa-univ-early-ceremony";

/** 上课（批次 AP）：按课型给数值——学校把你往哪边推，你就往哪边走一步。
 *  自习 +1 沉默 / 讨论 −1 沉默 / 展示 +1 表演 / 约谈 +1 被注意。每天最多一节；办不成返回 null。 */
export function attendClass(kind: ClassKind, day: number): { empty: boolean } | null {
  const save = loadGameSave();
  if ((save.lastClassDay ?? 0) >= day) return null;
  if (!(save.classSchedule ?? []).includes(kind)) return null;
  const empty = (save.skips ?? 0) >= 3;
  const attended = (save.attended ?? 0) + 1;
  if (kind === "study") persistGameSave({ ...addSilence(1), attended, lastClassDay: day });
  else if (kind === "talk") persistGameSave({ ...addSilence(-1), attended, lastClassDay: day });
  else if (kind === "show") persistGameSave({ ...addReputation(1), attended, lastClassDay: day });
  else persistGameSave({ ...addAttention(1), attended, lastClassDay: day });
  /* 地下组织（批次 CD）：加入之后，上课也是双面的——白天是课，夜里那一栏不进档案 */
  if (isUndergroundActive(loadGameSave())) {
    const job = undergroundJobTextOf("class", day);
    logUndergroundJob("class", day, job.surface, job.underneath);
  }
  return { empty };
}

/** 逃课（批次 AP）：逃课会被记录——次数多了，课被排进更空的教室。每天最多一次。 */
export function skipClass(day: number): number | null {
  const save = loadGameSave();
  if ((save.lastClassDay ?? 0) >= day) return null;
  const next = (save.skips ?? 0) + 1;
  persistGameSave({ ...save, skips: next, lastClassDay: day });
  /* 地下组织（批次 CD）：加入之后，逃课也是双面的——档案照记，替你到的那只没留名字 */
  if (isUndergroundActive(loadGameSave())) {
    const job = undergroundJobTextOf("skip", day);
    logUndergroundJob("skip", day, job.surface, job.underneath);
  }
  return next;
}

/** 读逃课次数（旧档缺字段按 0） */
export function getSkips(): number {
  return loadGameSave().skips ?? 0;
}

/** 申请毕业（批次 AP）：毕业不必等十条线走完——学校照发证，但成绩单会写「未完成全部课程」。
 *  跨学期保留一次；图鉴多一页《提前》。 */
export function graduateEarly(): boolean {
  const save = loadGameSave();
  if (save.earlyGraduated) return false;
  persistGameSave({ ...save, earlyGraduated: true });
  return true;
}

/** 读是否申请过提前毕业 */
export function hasEarlyGraduated(): boolean {
  return loadGameSave().earlyGraduated === true;
}

/** 离校天数（批次 AP）：现实时间 = 游戏时间——距上次活动（updatedAt）过了几天 */
export function absentDaysOf(save: GameSaveData = loadGameSave()): number {
  if (!Number.isFinite(save.updatedAt) || save.updatedAt <= 0) return 0;
  return Math.floor((Date.now() - save.updatedAt) / 86400000);
}

/** 是否算「许久未到校」（批次 AP）：离校满三天，且档里有学期痕迹 */
export function isLongAbsent(save: GameSaveData = loadGameSave()): boolean {
  return absentDaysOf(save) >= 3;
}

/**
 * 缺席记录（批次 AP）：离校满三天的这一段，档案替你补一行「无记录」。
 * 同一段不重复记（按离开时刻去重）；上限六段，更旧的滚出柜子。
 * 返回新记下的那一段（本次没有新段返回 null——浮层只在真正回来了的时候弹）。
 */
export function recordAbsence(): AwayRecord | null {
  const save = loadGameSave();
  const last = save.updatedAt;
  if (!Number.isFinite(last) || last <= 0) return null;
  const now = Date.now();
  const days = Math.floor((now - last) / 86400000);
  if (days < 3) return null;
  const log = save.awayLog ?? [];
  if (log.some((item) => item.from === last)) return null;
  const record: AwayRecord = { from: last, to: now, days };
  persistGameSave({ ...save, awayLog: [...log, record].slice(-6) });
  return record;
}

/** 档案腔日期（批次 AP）：X 年 X 月 X 日 */
export function formatCnDate(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/* ---------- 校园的声音（批次 AQ）：广播 / 点名 / 期末公示——档案开始念你 ---------- */

/** 本学期的广播日（批次 AQ）：第 3~9 天里由种子派生的那一天；同一颗种子同一日 */
export function broadcastDayOf(seed: number): number {
  return 3 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 173 + 11) * 7);
}

/** 本学期的两次点名日（批次 AQ）：第 3~9 天里由种子派生的两个日子（可能重合成一个） */
export function rollcallDaysOf(seed: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 2; i++) {
    const d = 3 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 191 + i * 37 + 5) * 7);
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/**
 * 广播要念的那句（批次 AQ）：从真话罐按种子取一条。传话（批次 AJ）联动——
 * 同一句被传过几手，广播就念更短的版本：走廊传到第 N 手的那句，今天上了广播。
 */
export function broadcastTruthOf(save: GameSaveData): { truth: string; relays: number; trimmed: string } | null {
  const jar = save.truthJar;
  if (jar.length === 0) return null;
  const index = Math.floor(seedRandom((Math.round(save.weatherSeed) % 1000000) * 251 + 17) * jar.length) % jar.length;
  const truth = jar[index];
  const relays = save.truthRelays?.[truth.trim().slice(0, 24)] ?? 0;
  const keep = Math.max(8, truth.length - relays * 5);
  const trimmed = relays > 0 ? `${truth.slice(0, keep)}……` : truth;
  return { truth, relays, trimmed };
}

/** 校园广播已播（批次 AQ）：每学期一次；开学期重置 */
export function markBroadcastPlayed(): void {
  const save = loadGameSave();
  if (save.broadcastPlayed) return;
  persistGameSave({ ...save, broadcastPlayed: true });
}

/**
 * 点名应答（批次 AQ）：档案一行「该蛙应答。声音比平时低」。本学期至多两次；
 * 已点过名的天是 no-op（返回 null）。返回最新计数。
 */
export function answerRollcall(day: number): { answered: number; misses: number } | null {
  const save = loadGameSave();
  if ((save.rollcallLog ?? []).includes(day)) return null;
  const next = {
    rollcallLog: [...(save.rollcallLog ?? []), day],
    rollcallAnswered: (save.rollcallAnswered ?? 0) + 1,
  };
  persistGameSave({ ...save, ...next });
  return { answered: next.rollcallAnswered, misses: save.rollcallMisses ?? 0 };
}

/**
 * 点名未应答（批次 AQ）：被注意值 +1，名单上多一笔。档案一行「该蛙未应答」。
 * 攒满三次，名单更新——点名不再叫你的名字。
 */
export function missRollcall(day: number): { answered: number; misses: number } | null {
  const save = loadGameSave();
  if ((save.rollcallLog ?? []).includes(day)) return null;
  const next = {
    rollcallLog: [...(save.rollcallLog ?? []), day],
    rollcallMisses: (save.rollcallMisses ?? 0) + 1,
  };
  persistGameSave({ ...addAttention(1), ...next });
  return { answered: save.rollcallAnswered ?? 0, misses: next.rollcallMisses };
}

/** 成绩公示（批次 AQ）：期末周第一天公示一次；公示无异议——没有人对无异议提出异议 */
export function markNoticePosted(playthrough: number): boolean {
  const save = loadGameSave();
  const list = save.noticeSemesters ?? [];
  if (list.includes(playthrough)) return false;
  persistGameSave({ ...save, noticeSemesters: [...list, playthrough] });
  return true;
}

/* ---------- 你的位置（批次 AR）：名字开始被别的东西使用——档案记的是名字，不是你 ---------- */

/** 本学期那份等你的东西哪一天到（批次 AR）：第 2~8 天里由种子派生的那一天；同一颗种子同一日 */
export function packageDayOf(seed: number): number {
  return 2 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 307 + 3) * 7);
}

/** 本学期那张署名启事贴出来哪一天（批次 AR）：第 2~9 天里由种子派生的那一天 */
export function postedDayOf(seed: number): number {
  return 2 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 353 + 7) * 8);
}

/** 待签的三种东西（批次 AR）：同一颗种子同一份 */
export interface PackageItem {
  /** 物件名 */
  title: string;
  /** 描述（档案腔） */
  text: string;
}

const PACKAGE_ITEMS: PackageItem[] = [
  { title: "一份核对表", text: "收件人：该蛙。内容那一栏印着：已核对。核对的是哪一栏，表上没写。" },
  { title: "一封没有寄信人的信", text: "拆开是一张白纸。附言一行小字：如内容缺失，以档案为准。" },
  { title: "一个包裹", text: "重量与档案一致。内容那一栏空白，封口已经封好了——不是你封的。" },
];

export function packageItemOf(seed: number): PackageItem {
  const index = Math.floor(seedRandom((Math.round(seed) % 1000000) * 419 + 13) * PACKAGE_ITEMS.length) % PACKAGE_ITEMS.length;
  return PACKAGE_ITEMS[index] ?? PACKAGE_ITEMS[0];
}

/** 署名启事的三种标题（批次 AR）：同一颗种子同一张 */
export interface PostedDoc {
  /** 启事标题（署名：你） */
  title: string;
  /** 落款下面那行小字 */
  footer: string;
}

const POSTED_DOCS: PostedDoc[] = [
  { title: "关于调整课表的若干意见", footer: "意见已收讫，不作回复。" },
  { title: "关于改善食堂伙食的建议", footer: "建议已归档，不必再提。" },
  { title: "关于本学期公示结果的说明", footer: "说明与公示一致，无需补充。" },
];

export function postedDocOf(seed: number): PostedDoc {
  const index = Math.floor(seedRandom((Math.round(seed) % 1000000) * 503 + 19) * POSTED_DOCS.length) % POSTED_DOCS.length;
  return POSTED_DOCS[index] ?? POSTED_DOCS[0];
}

/** 替身已见过（批次 AR）：第一次进课表看见它——此后它一直在；档案没换名字；跨学期保留一次 */
export function markSurrogateSeen(): void {
  const save = loadGameSave();
  if (save.surrogateEver) return;
  persistGameSave({ ...save, surrogateEver: true });
}

/** 亲手签收（批次 AR）：档案一行「该蛙签收了它自己都不知道是什么的东西」。签过或被代签后办不成 */
export function signPackage(): number | null {
  const save = loadGameSave();
  if (save.packageSigned || save.packageReplaced) return null;
  const next = (save.signings ?? 0) + 1;
  persistGameSave({ ...save, packageSigned: true, signings: next });
  return next;
}

/**
 * 被代签（批次 AR）：你不签的东西，第三天起有人替你签——签收人栏的字迹不是你的。
 * 名字照常记在你名下。只发生一次；签过或被代签后办不成。
 */
export function replacePackage(): number | null {
  const save = loadGameSave();
  if (save.packageSigned || save.packageReplaced) return null;
  const next = (save.signings ?? 0) + 1;
  persistGameSave({ ...save, packageReplaced: true, signings: next });
  return next;
}

/** 署名启事已看过（批次 AR）：每学期贴一次，看过计数跨学期保留——档案里没有这一行 */
export function markPostedSeen(): number | null {
  const save = loadGameSave();
  if (save.postedSeen) return null;
  const next = (save.postings ?? 0) + 1;
  persistGameSave({ ...save, postedSeen: true, postings: next });
  return next;
}

/* ---------- 另一些日子（批次 AS）：校园里那些不为你存在的部分 ---------- */

/** 本学期哪一天停课（批次 AS）：第 2~9 天里由种子派生的那一天；停课不需要理由 */
export function holidayDayOf(seed: number): number {
  return 2 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 601 + 23) * 8);
}

/** 本学期哪一天清点档案柜（批次 AS）：第 3~8 天里由种子派生的那一天 */
export function inventoryDayOf(seed: number): number {
  return 3 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 709 + 29) * 6);
}

/** 本学期哪一天路过教研室（批次 AS）：第 4~9 天里由种子派生的那一天；那扇门一直在 */
export function officeDayOf(seed: number): number {
  return 4 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 809 + 31) * 6);
}

/** 停课日已过（批次 AS）：没有安排的日子档案不收——只有你记得；每学期一次 */
export function markHolidayPlayed(): number | null {
  const save = loadGameSave();
  if (save.holidayPlayed) return null;
  const next = (save.holidays ?? 0) + 1;
  persistGameSave({ ...save, holidayPlayed: true, holidays: next });
  return next;
}

/** 档案柜已清点（批次 AS）：你被数过了——结论照例是「在柜」；每学期一次 */
export function markInventoryDone(): number | null {
  const save = loadGameSave();
  if (save.inventoryPlayed) return null;
  const next = (save.inventories ?? 0) + 1;
  persistGameSave({ ...save, inventoryPlayed: true, inventories: next });
  return next;
}

/** 已在教研室门外站过（批次 AS）：门内无记录——签字的从来不是你见过的那只；每学期一次 */
export function markOfficeSeen(): number | null {
  const save = loadGameSave();
  if (save.officeSeen) return null;
  const next = (save.sightings ?? 0) + 1;
  persistGameSave({ ...save, officeSeen: true, sightings: next });
  return next;
}

/* ---------- 时间机器（批次 AT）：暂停 / 倒带 / 快进 / 停留——时间本身变成可操作的东西 ---------- */

/** 记一次暂停（批次 AT）：累计秒数。你不在的这段时间，世界没有停 */
export function recordPause(seconds: number): number {
  const save = loadGameSave();
  const next = (save.pausedTotal ?? 0) + Math.max(0, Math.round(seconds));
  persistGameSave({ ...save, pausedTotal: next });
  return next;
}

/** 记一次倒带（批次 AT）：场景回到之前，角色保留记忆——改了剧情，有人记得原来的版本 */
export function recordRewind(): number {
  const save = loadGameSave();
  const next = (save.rewinds ?? 0) + 1;
  persistGameSave({ ...save, rewinds: next });
  return next;
}

/**
 * 记一次快进（批次 AT）：跳过的行数进累计，每一段被跳过的过程留一条摘要进档案。
 * 快进越多，档案越厚，但玩家越薄。
 */
export function recordFastForward(lines: number, sample: string): number {
  const save = loadGameSave();
  const trimmed = sample.trim().slice(0, 24);
  const log = [
    ...(save.fastForwardLog ?? []),
    `跳过 ${lines} 行：「${trimmed}${sample.trim().length > 24 ? "……" : ""}」`,
  ].slice(-12);
  const next = (save.forwards ?? 0) + Math.max(0, Math.round(lines));
  persistGameSave({ ...save, forwards: next, fastForwardLog: log });
  return next;
}

/** 记一次停留（批次 AT）：不推进、不跳过、不存档，就是待在那里——没有一次留住 */
export function recordStay(): number {
  const save = loadGameSave();
  const next = (save.stays ?? 0) + 1;
  persistGameSave({ ...save, stays: next });
  return next;
}

/* ---------- 开口（批次 AU）：制度的文本开始对你说话、开始有空白、开始有错 ---------- */

/**
 * 记录员的话（批次 AU）：档案腔之外的第一人称——它只开口三次，之后把这一栏删了。
 * 第二学期起第一句，每学期一句；这三句话不会出现在任何档案里。
 */
export const RECORDER_LINES: string[] = [
  "（记录员想问一句：你还好吗。这句话不会出现在任何档案里。）",
  "（上一学期你问过的问题，记录员也没找到答案。它把问题抄了下来，抄在这一栏——这一栏本来是空的。）",
  "（这是它第三次开口。之后不会再有了——开口不在流程里，它把这一栏删了。）",
];

/** 现在该不该开口、开口说哪一句（批次 AU）：第一学期它还只是记录；说完三次收笔 */
export function recorderLineOf(save: GameSaveData): string | null {
  const lines = save.recorderLines ?? 0;
  if (save.playthrough < 2 || lines >= RECORDER_LINES.length) return null;
  if (lines >= save.playthrough - 1) return null;
  return RECORDER_LINES[lines] ?? null;
}

/** 记录员开过口了（批次 AU）：这一句落档，下一次它只会说下一句 */
export function markRecorderLine(): void {
  const save = loadGameSave();
  if ((save.recorderLines ?? 0) >= RECORDER_LINES.length) return;
  persistGameSave({ ...save, recorderLines: (save.recorderLines ?? 0) + 1 });
}

/** 取走零点待弹标记（批次 AU）：浮层弹出即消费——空白的那一格，你看过一次就够了 */
export function consumeZeroPending(): boolean {
  const save = loadGameSave();
  if (!save.zeroPending) return false;
  persistGameSave({ ...save, zeroPending: false });
  return true;
}

/* ---------- 语言本身（批次 AV）：语言不只是文本内容——它可以变成可操作的对象 ---------- */

/** 用那个词回应一次（批次 AV）：每学期一次。词还是那个词，释义由你挑 */
export function sayWord(): boolean {
  const save = loadGameSave();
  if (save.wordSaid) return false;
  persistGameSave({ ...save, wordSaid: true });
  return true;
}

/** 划掉一个字（批次 AV）：同一格不重复划；每页至多八个。文本记得你改了什么 */
export function strikeChar(endingId: string, index: number, ch: string): boolean {
  const save = loadGameSave();
  if (!endingId || index < 0 || ch.length !== 1) return false;
  const map = { ...(save.struckChars ?? {}) };
  const list = map[endingId] ?? [];
  if (list.some((item) => item.i === index)) return false;
  if (list.length >= 8) return false;
  map[endingId] = [...list, { i: index, ch, at: Date.now() }];
  persistGameSave({ ...save, struckChars: map });
  return true;
}

/** 读某一页被划掉的字（批次 AV，旧档缺字段按空） */
export function getStruckChars(endingId: string): StruckChar[] {
  return loadGameSave().struckChars?.[endingId] ?? [];
}

/** 记一次读完全部内容（批次 AV）：没展开的那些，你没读——展开过才进档案 */
export function recordFullRead(): number {
  const save = loadGameSave();
  const next = (save.fullReads ?? 0) + 1;
  persistGameSave({ ...save, fullReads: next });
  return next;
}

/* ---------- 同届（批次 AX）：你不是唯一的一个——但制度不提供认识彼此的功能 ---------- */

/** 满意度调查已提交（批次 AX）：每学期一份，五格全部「收到」；填过的学期不再发 */
export function markSurveyDone(playthrough: number): boolean {
  const save = loadGameSave();
  const list = save.surveys ?? [];
  if (list.includes(playthrough)) return false;
  persistGameSave({ ...save, surveys: [...list, playthrough] });
  return true;
}

/* ---------- 共谋（批次 AZ）：角色之间有他们自己的档案系统——不走流程 ---------- */

/**
 * 串供（批次 AZ）：进某条线时，本线主蛙引述你在别的线说过的一句真话——一字不差。
 * 每线每学期至多一次；真话罐为空或种子不中（约 35%）则返回 null。
 * 返回值供舞台耳语渲染；quote 原样取自真话罐（与传话的「修边」相反：串供不改一个字）。
 */
export function collusionQuoteOf(
  save: GameSaveData,
  lineId: StorylineId,
  frogName: string,
  placeLabel: string,
): { text: string; quote: string } | null {
  if ((save.collusionSeen ?? []).includes(lineId)) return null;
  if (save.truthJar.length === 0) return null;
  const seed = Math.round(save.weatherSeed) % 1000000;
  if (seedRandom(seed * 83 + lineId.length * 41 + 7) >= 0.35) return null;
  const quote = save.truthJar[Math.floor(seedRandom(seed * 97 + lineId.length * 13) * save.truthJar.length) % save.truthJar.length];
  const text = `（${placeLabel}。${frogName}头也没抬：「${quote}」——另一栋楼那边传过来的，一字不差。它们有自己的档案系统，不走我们的流程。）`;
  return { text, quote };
}

/** 串供已听过（批次 AZ）：本线本学期记一笔 + 计数 */
export function markCollusion(lineId: StorylineId): void {
  const save = loadGameSave();
  if ((save.collusionSeen ?? []).includes(lineId)) return;
  persistGameSave({
    ...save,
    collusionSeen: [...(save.collusionSeen ?? []), lineId],
    collusions: (save.collusions ?? 0) + 1,
  });
}

/**
 * 包庇（批次 AZ）：名单在列（被注意值 ≥ 8）且没被约谈出局（包庇未满三）时，
 * 本线主蛙可能替你把话头带开——它的名字往名单上挪一格，你的少一笔（被注意值 −2）。
 * 每线每学期至多一次；种子不中（约 30%）或包庇名额用完返回 null。
 */
export function shieldOf(
  save: GameSaveData,
  lineId: StorylineId,
  frogName: string,
  placeLabel: string,
): { frogName: string; text: string } | null {
  if ((save.shields ?? 0) >= 3) return null;
  if ((save.shieldSeen ?? []).includes(lineId)) return null;
  if (save.attention < 8) return null;
  const seed = Math.round(save.weatherSeed) % 1000000;
  if (seedRandom(seed * 131 + lineId.length * 57 + 3) >= 0.3) return null;
  const nth = (save.shields ?? 0) + 1;
  const text =
    nth === 1
      ? `（${placeLabel}。${frogName}替你把话头带开了。它自己的名字，往名单上挪了一格——你的名单上少了两笔。）`
      : nth === 2
        ? `（又是${frogName}。它没问为什么——包庇是不问的。它名单上的那一栏，又厚了一行。）`
        : `（${frogName}替你把话头带开了。它名单上的名字已经换了行距——这一格快写不下了。）`;
  return { frogName, text };
}

/** 包庇落档（批次 AZ）：被注意值 −2（转移走）、包庇计数 +1、本线记一笔 */
export function applyShield(lineId: StorylineId): void {
  const save = loadGameSave();
  if ((save.shields ?? 0) >= 3) return;
  persistGameSave({
    ...addAttention(-2),
    shields: (save.shields ?? 0) + 1,
    shieldSeen: [...(save.shieldSeen ?? []), lineId],
  });
}

/**
 * 出卖（批次 AZ）：好感高（该蛙真话点数 ≥ 80）且被注意值 ≥ 8 时，那只蛙可能主动把你的名字报上去。
 * 它不是背叛——它选了表格上「如实填写」那一栏。种子不中（约 25%）返回 null。
 */
export function reportOf(
  save: GameSaveData,
  lineId: StorylineId,
  frogId: FrogCharacterId,
  reporterName: string,
  placeLabel: string,
): { frogName: string; text: string } | null {
  if (save.attention < 8) return null;
  if ((save.affinity[frogId] ?? 0) < 80) return null;
  const seed = Math.round(save.weatherSeed) % 1000000;
  if (seedRandom(seed * 173 + lineId.length * 71 + 11) >= 0.25) return null;
  const nth = (save.reports ?? 0) + 1;
  const text =
    nth === 1
      ? `（${placeLabel}。${reporterName}把你的名字报了上去。它想了很久，然后选了表格上「如实填写」那一栏。它的好感掉了，评价栏升了——制度给诚实标价。）`
      : `（又是${reporterName}。这一次它没有犹豫——第一次已经把这一步走熟了。制度给熟练也标价。）`;
  return { frogName: reporterName, text };
}

/** 举报落档（批次 AZ）：举报人好感 −20（它出卖了你）、表演分 +3（制度给诚实标价）、计数与名字照记 */
export function applyReport(frogId: FrogCharacterId): void {
  const save = loadGameSave();
  persistGameSave({
    ...addAffinity(frogId, -20),
    ...addReputation(3),
    reports: (save.reports ?? 0) + 1,
    reportedBy: frogId,
  });
}

/* ---------- 缺席（批次 BB）：沉默是你选择不说，缺席是你选择不在 ---------- */

/**
 * 今天不去了（批次 BB）：站在门口转身走——你在，但你不在场。
 * 按楼计数（跨学期保留）；返回累计次数。
 */
export function recordVisitSkip(buildingId: string): number {
  const save = loadGameSave();
  const map = { ...(save.visitSkips ?? {}) };
  const next = (map[buildingId] ?? 0) + 1;
  map[buildingId] = next;
  persistGameSave({ ...save, visitSkips: map });
  return next;
}

/* ---------- 替换（批次 BC）：不是换角色，是换位置 ---------- */

/**
 * 替它走这一趟（批次 BC）：你走别人的路，档案写你的名字。
 * 本学期记一笔（结局相位消费）；已经替着别的线时办不成。
 */
export function substituteFor(lineId: StorylineId): boolean {
  const save = loadGameSave();
  if (save.substituteFor) return false;
  persistGameSave({ ...save, substituteFor: lineId, substitutions: (save.substitutions ?? 0) + 1 });
  return true;
}

/** 让角色替你选（批次 BC）：你放弃了选择，档案仍然记在你头上。返回累计次数 */
export function recordDeferred(): number {
  const save = loadGameSave();
  const next = (save.deferred ?? 0) + 1;
  persistGameSave({ ...save, deferred: next });
  return next;
}

/** 换位申请（批次 BC）：你体验了别人的档案，但你的档案还在。返回累计次数 */
export function applySwap(): number {
  const save = loadGameSave();
  const next = (save.swaps ?? 0) + 1;
  persistGameSave({ ...save, swaps: next });
  return next;
}

/* ---------- 腐烂（批次 BD）：档案会旧，记忆会淡，角色会薄——你不看它们，它们就会淡下去 ---------- */

/**
 * 角色腐烂（批次 BD）：离校满七天回来，全员好感 −5——每学期最多触发一次。
 * 不是掉了，是没被看着的东西会褪色；淡下去的那部分，要用真话一点点描回来。
 * 触发过返回本学期号（浮层加一行褪色说明），没触发返回 null。
 */
export function applyAbsenceDecay(): number | null {
  const save = loadGameSave();
  if (absentDaysOf(save) < 7) return null;
  if ((save.decaySemester ?? 0) >= save.playthrough) return null;
  const next = { ...save.affinity };
  for (const id of Object.keys(next) as FrogCharacterId[]) next[id] = Math.max(0, (next[id] ?? 0) - 5);
  persistGameSave({ ...save, affinity: next, decaySemester: save.playthrough });
  return save.playthrough;
}

/** 某栋楼最后被访问的学期（批次 BD；没去过的楼返回 0——没被认识过的东西不会褪色） */
export function lastVisitSemesterOf(lineId: string): number {
  return loadGameSave().lastVisits?.[lineId] ?? 0;
}

/* ---------- 关于你（批次 BE）：档案系统的三端——被记录的你、记录的它、流通的它 ---------- */

/** 借阅记录清洗（批次 BE）：蛙 id 合法、学期 ≥1；上限六条 */
function sanitizeBorrowers(raw: unknown): BorrowRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: BorrowRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.frog !== "string" || !(o.frog in FROG_CHARACTERS)) continue;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    out.push({ frog: o.frog as FrogCharacterId, semester: Math.round(o.semester) });
  }
  return out.slice(-6);
}

/** 会议记录清洗（批次 BG）：role/学期/天数合法；上限八条 */
function sanitizeMeetings(raw: unknown): MeetingRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: MeetingRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.role !== "list" && o.role !== "recorder") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      role: o.role,
      spoke: o.spoke === true ? true : undefined,
      objection: o.objection === "kept" || o.objection === "dropped" ? o.objection : undefined,
    });
  }
  return out.slice(-8);
}

/** 交接结论清洗（批次 BH）：蛙 id 合法、学期 ≥1、结论只有两档；上限十二份 */
function sanitizeHandoverLog(raw: unknown): HandoverRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: HandoverRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.frogId !== "string" || !(o.frogId in FROG_CHARACTERS)) continue;
    if (o.verdict !== "confirmed" && o.verdict !== "denied") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      frogId: o.frogId as FrogCharacterId,
      verdict: o.verdict,
    });
  }
  return out.slice(-12);
}

/** 本学期的借阅人（批次 BE）：约 30% 的学期有人借你的档案；同一颗种子同一只蛙（也可能没蛙借） */
export function borrowerOf(save: GameSaveData): FrogCharacterId | null {
  if ((save.borrowers ?? []).some((item) => item.semester === save.playthrough)) return null;
  if ((save.dossiers ?? []).length === 0) return null;
  const seed = Math.round(save.weatherSeed) % 1000000;
  if (seedRandom(seed * 233 + 43) >= 0.3) return null;
  const pool = Object.keys(FROG_CHARACTERS).filter((id) => id !== "naiBai") as FrogCharacterId[];
  return pool[Math.floor(seedRandom(seed * 277 + 47) * pool.length) % pool.length] ?? null;
}

/** 借阅落档（批次 BE）：借阅人栏记名字，理由栏空白 */
export function markBorrower(frogId: FrogCharacterId): void {
  const save = loadGameSave();
  persistGameSave({
    ...save,
    borrowers: [...(save.borrowers ?? []), { frog: frogId, semester: save.playthrough }].slice(-6),
  });
}

/* ---------- 会议（批次 BG）：列席 / 一致 / 执笔 / 回避——你在会议室，纸上未必有你 ---------- */

/** 本学期哪一天被叫去列席（批次 BG）：第 4~9 天里由种子派生的那一天；会议通知一直贴在门上 */
export function meetingDayOf(seed: number): number {
  return 4 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 907 + 37) * 6);
}

/** 本学期哪一天轮到你执笔（批次 BG）：第 7~9 天里由种子派生的那一天；先听过，后轮到你写 */
export function recorderDayOf(seed: number): number {
  return 7 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 1013 + 41) * 3);
}

/**
 * 好感最高的非主角（批次 BG）：会议上举到一半的那只手是它的。
 * 至少 40 点才算「关系密切」——不是因为它重要，是因为约谈回避栏要填它的名字。
 */
export function closestFrogOf(save: GameSaveData): FrogCharacterId | null {
  let best: FrogCharacterId | null = null;
  let bestValue = 39;
  for (const id of Object.keys(save.affinity) as FrogCharacterId[]) {
    if (id === "naiBai") continue;
    const value = save.affinity[id] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      best = id;
    }
  }
  return best;
}

/** 约谈回避栏的那只蛙（批次 BG）：最向着你的那只——它不知道今天有这场约谈；用过一次就不再办 */
export function recusalOf(save: GameSaveData): FrogCharacterId | null {
  if (save.recusalSeen) return null;
  return closestFrogOf(save);
}

/** 回避已办（批次 BG）：签到表上那一栏用过一次就够 */
export function markRecusalSeen(): void {
  const save = loadGameSave();
  if (save.recusalSeen) return;
  persistGameSave({ ...save, recusalSeen: true });
}

/** 列席落档（批次 BG）：与会人员一致通过——座次表上写着「列席：一」，没有名字；每学期一次 */
export function markMeetingList(day: number, spoke: boolean): number | null {
  const save = loadGameSave();
  const list = save.meetings ?? [];
  if (list.some((item) => item.semester === save.playthrough && item.role === "list")) return null;
  const next = [...list, { semester: save.playthrough, day, role: "list" as const, spoke }];
  persistGameSave({ ...save, meetings: next });
  return next.length;
}

/**
 * 执笔落档（批次 BG）：定稿上都是你的名字——区别不在纸上，在你这里。
 * 那句反对怎么处理，决定了那只蛙怎么看你：记了（被退回重写）−6；没记 −10。
 * 「记录规范」被周报表扬过一次——印象分 +2。每学期一次。
 */
export function markMeetingRecorder(
  day: number,
  objection: "kept" | "dropped",
  frogId: FrogCharacterId,
): number | null {
  const save = loadGameSave();
  const list = save.meetings ?? [];
  if (list.some((item) => item.semester === save.playthrough && item.role === "recorder")) return null;
  const next = [...list, { semester: save.playthrough, day, role: "recorder" as const, objection }];
  persistGameSave({
    ...addAffinity(frogId, objection === "kept" ? -6 : -10),
    ...addReputation(2),
    meetings: next,
  });
  return next.length;
}

/** 会议名册（批次 BG）：议题、主持人、与会成员——同一颗种子同一间会议室（点名那只不在名册里） */
export interface MeetingRoster {
  /** 议题（档案腔） */
  topic: string;
  /** 主持人的名字 */
  host: string;
  /** 与会成员的名字（两名） */
  members: string[];
}

const MEETING_TOPICS: Record<"list" | "recorder", string[]> = {
  list: ["《自习纪律补充流程（试行）》", "《日常行为记录规范（试行）》", "《课表调整申请流程》"],
  recorder: ["《意见受理流程（修订）》", "《行为记录复核补充流程》", "《名单管理办法（修订）》"],
};

export function meetingRosterOf(seed: number, role: "list" | "recorder", exclude?: string): MeetingRoster {
  const base = Math.round(seed) % 1000000;
  const topics = MEETING_TOPICS[role];
  const topic = topics[Math.floor(seedRandom(base * (role === "list" ? 523 : 541) + 67) * topics.length) % topics.length] ?? topics[0];
  const pool = (Object.keys(FROG_CHARACTERS) as FrogCharacterId[]).filter(
    (id) => id !== "naiBai" && FROG_CHARACTERS[id].displayName !== exclude,
  );
  const host = pool[Math.floor(seedRandom(base * (role === "list" ? 557 : 569) + 71) * pool.length) % pool.length] ?? pool[0];
  if (!host) return { topic, host: "记录在案的一只", members: [] };
  const others = pool.filter((id) => id !== host);
  const first = others[Math.floor(seedRandom(base * (role === "list" ? 577 : 587) + 73) * others.length) % others.length] ?? others[0];
  const second = others[Math.floor(seedRandom(base * (role === "list" ? 599 : 607) + 79) * others.length) % others.length] ?? first;
  const members = [...new Set([first, second].filter((id): id is FrogCharacterId => Boolean(id)))].map(
    (id) => FROG_CHARACTERS[id].displayName,
  );
  return { topic, host: FROG_CHARACTERS[host].displayName, members };
}

/* ---------- 交接（批次 BH）：移交单 / 抽屉 / 属实·不予认定 / 接任——制度把位置交给你 ---------- */

/** 本学期哪一天收到移交单（批次 BH）：第 8~9 天里由种子派生的那一天；单子一直贴在门上 */
export function handoverDayOf(seed: number): number {
  return 8 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 727 + 53) * 2);
}

/** 抽屉里积压的事项（批次 BH）：每一份都在等一个结论——「存疑」不在流程里 */
const HANDOVER_ITEMS: string[] = [
  "在自习楼的窗户边站了很久。窗外的操场没有开灯。",
  "把食堂的汤打了两份。第二份没有喝，放在桌上走掉了。",
  "在楼道的公示栏前停下来，看了很久，没有动手。",
  "连续三天最后一个离开教学楼。门是它锁的。",
  "在熄灯之后的走廊里说话。声音不大，但走廊是空的，听得很清楚。",
  "把桌上的名牌摆正了。名牌上不是它的名字。",
];

const HANDOVER_FALLBACK = HANDOVER_ITEMS[0] ?? "在自习楼的窗户边站了很久。窗外的操场没有开灯。";

/** 一份等结论的档案：谁的事、什么事、哪天收文（同一颗种子同一只抽屉） */
export interface PendingHandover {
  frogId: FrogCharacterId;
  text: string;
  day: number;
}

export function pendingHandoverOf(seed: number): PendingHandover[] {
  const base = Math.round(seed) % 1000000;
  const frogPool = (Object.keys(FROG_CHARACTERS) as FrogCharacterId[]).filter((id) => id !== "naiBai");
  const textPool = [...HANDOVER_ITEMS];
  const frogs: FrogCharacterId[] = [];
  const texts: string[] = [];
  const days: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    if (frogPool.length > 0) {
      const fi = Math.floor(seedRandom(base * (631 + i * 17) + 89) * frogPool.length) % frogPool.length;
      const frog = frogPool.splice(fi, 1)[0];
      if (frog) frogs.push(frog);
    }
    if (textPool.length > 0) {
      const ti = Math.floor(seedRandom(base * (647 + i * 19) + 97) * textPool.length) % textPool.length;
      const text = textPool.splice(ti, 1)[0];
      if (text) texts.push(text);
    }
    days.push(2 + Math.floor(seedRandom(base * (661 + i * 23) + 101) * 8));
  }
  return frogs.map((frogId, i) => ({ frogId, text: texts[i] ?? HANDOVER_FALLBACK, day: days[i] ?? 2 }));
}

/** 交接落档（批次 BH）：三份档案的结论一次签完——
 *  认定属实：那份从此是它的档案（好感 −4），制度记你一笔（表演分 +1）；
 *  不予认定：核销，像没有发生过一样（好感 +4），学校开始注意「新任记录员手松」（被注意值 +1）。
 *  周报表扬一次：新任记录员上手很快（表演分 +1）。每学期一次。 */
export function markHandover(
  day: number,
  verdicts: { frogId: FrogCharacterId; verdict: "confirmed" | "denied" }[],
): number | null {
  const save = loadGameSave();
  if (save.handoverSeen) return null;
  const list = save.handoverLog ?? [];
  const next = [
    ...list,
    ...verdicts.map((item) => ({ semester: save.playthrough, day, frogId: item.frogId, verdict: item.verdict })),
  ].slice(-12);
  persistGameSave({ ...save, handoverLog: next, handoverSeen: true });
  for (const item of verdicts) {
    if (item.verdict === "confirmed") {
      addAffinity(item.frogId, -4);
      addReputation(1);
    } else {
      addAffinity(item.frogId, 4);
      addAttention(1);
    }
  }
  addReputation(1);
  return next.length;
}

/* ---------- 窗口（批次 BI）：值班 / 收表 / 签章 / 下班——你坐进了流程的那一边 ---------- */

/** 本学期哪一天轮到你值班（批次 BI）：第 8~9 天里由种子派生的那一天；排班表上你的名字加粗了 */
export function windowDayOf(seed: number): number {
  return 8 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 839 + 59) * 2);
}

/** 窗口收进来的普通表（批次 BI）：窗口不判断，窗口只负责收 */
const WINDOW_REQUESTS: string[] = [
  "物品借用单。借用教室的钥匙，用途一栏写的是：开门。",
  "换课申请。理由一栏写的是：时间。",
  "设备报修。报修的是第 4 栏的灯。第 3 栏的灯上周报过，还没修。",
  "出入登记。进出这栋楼的蛙，进出这栋楼。",
  "补考申请。补考的是它自己考过的那一门。",
  "失物招领登记。失物是一张表格。招领处说，表格没有丢。",
];

const WINDOW_REQUEST_FALLBACK = WINDOW_REQUESTS[0] ?? "物品借用单。借用教室的钥匙，用途一栏写的是：开门。";

/** 窗口值班的表单（批次 BI）：普通表两张 + 需要签章的一份（同一颗种子同一班） */
export function windowRequestsOf(seed: number): string[] {
  const base = Math.round(seed) % 1000000;
  const pool = [...WINDOW_REQUESTS];
  const picks: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    const pi = Math.floor(seedRandom(base * (677 + i * 29) + 103) * pool.length) % pool.length;
    const picked = pool.splice(pi, 1)[0];
    if (picked) picks.push(picked);
  }
  if (picks.length < 2) picks.push(WINDOW_REQUEST_FALLBACK);
  return picks.slice(0, 2);
}

/** 值班记录清洗（批次 BI）：蛙 id 合法、学期 ≥1；上限十次 */
function sanitizeWindowLog(raw: unknown): WindowRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: WindowRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.applicant !== "string" || !(o.applicant in FROG_CHARACTERS)) continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      applicant: o.applicant as FrogCharacterId,
      returned: o.returned === true,
    });
  }
  return out.slice(-10);
}

/** 值班落档（批次 BI）：值班表上多了你的名字（表演分 +2）；
 *  退过件：流程里出现了判断——制度不表彰这个（表演分 −1，被注意值 +2「手续不符」）；
 *  没退过：一次签章 + 被注意值 +1。那份申请盖了章，名单更新——那只蛙下来了（好感 +2），
 *  它不知道那一下是你按的：它以为这是制度的结果。每学期一次。 */
export function markWindowOffice(day: number, returned: boolean, applicant: FrogCharacterId): number | null {
  const save = loadGameSave();
  if (save.windowSeen) return null;
  const list = save.windowLog ?? [];
  const next = [...list, { semester: save.playthrough, day, applicant, returned }].slice(-10);
  persistGameSave({
    ...save,
    windowLog: next,
    windowSeen: true,
    reputation: Math.max(0, save.reputation + (returned ? 1 : 2)),
  });
  addAttention(returned ? 2 : 1);
  addAffinity(applicant, 2);
  return next.length;
}

/* ---------- 帮带（批次 BJ）：帮带 / 本子 / 代值 / 出师——你不是学会了制度，你是制度长出来的那只 ---------- */

/** 本学期哪一天开始跟学（批次 BJ）：第 8~9 天里由种子派生的那一天；值班之后，窗口后面多了一只 */
export function mentorDayOf(seed: number): number {
  return 8 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 853 + 61) * 2);
}

/** 帮带由谁当（批次 BJ）：种子派生的在册蛙（点名那只除外——它已经举过手，不用再学） */
export function mentorOf(seed: number, exclude?: string): FrogCharacterId {
  const pool = (Object.keys(FROG_CHARACTERS) as FrogCharacterId[]).filter(
    (id) => id !== "naiBai" && FROG_CHARACTERS[id].displayName !== exclude,
  );
  const pick = Math.floor(seedRandom((Math.round(seed) % 1000000) * 857 + 67) * pool.length) % pool.length;
  return pool[pick] ?? "moMo";
}

/** 帮带记录清洗（批次 BJ）：蛙 id 合法、学期 ≥1；上限八条 */
function sanitizeMentoringLog(raw: unknown): MentorRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: MentorRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.apprentice !== "string" || !(o.apprentice in FROG_CHARACTERS)) continue;
    out.push({ semester: Math.round(o.semester), day: Math.round(o.day), apprentice: o.apprentice as FrogCharacterId });
  }
  return out.slice(-8);
}

/** 帮带落档（批次 BJ）：带教计入考评（表演分 +2），它盖的章记在你名下（被注意值 +1），
 *  它记得你教的（好感 +2）。出师之后值班表那一格写的是它的名字。每学期一次。 */
export function markMentoring(day: number, apprentice: FrogCharacterId): number | null {
  const save = loadGameSave();
  if (save.mentoringSeen) return null;
  const list = save.mentoringLog ?? [];
  const next = [...list, { semester: save.playthrough, day, apprentice }].slice(-8);
  persistGameSave({ ...save, mentoringLog: next, mentoringSeen: true });
  addReputation(2);
  addAttention(1);
  addAffinity(apprentice, 2);
  return next.length;
}

/* ---------- 互查（批次 BK）：编组 / 同数 / 空档 / 补评——你翻到了它们的档案 ---------- */

/** 本学期哪一天开始互查（批次 BK）：第 8~9 天里由种子派生的那一天；帮带之后，柜子互相打开 */
export function auditDayOf(seed: number): number {
  return 8 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 863 + 71) * 2);
}

/** 互查评语（批次 BK）：同一张表格，同一套句式——每只一句，句式都长一样（主角不入档） */
const AUDIT_COMMENTS: Partial<Record<FrogCharacterId, string>> = {
  moMo: "该蛙卷。卷不计入休息。",
  meiMei: "该蛙表演。表演分已公示。",
  huiHui: "该蛙躺平。躺平已登记。",
  ganFanShu: "该蛙已老实。老实不算错误。",
  zaiZai: "该蛙备考。备考不占课表。",
  geGe: "该蛙转达。转达无责任。",
};

/** 互查的六份档案（批次 BK）：在册六蛙按种子排一份顺序，评语跟蛙走（同一颗种子同一次互查） */
export function auditDossiersOf(seed: number): { frogId: FrogCharacterId; comment: string }[] {
  const base = Math.round(seed) % 1000000;
  const frogPool = (Object.keys(FROG_CHARACTERS) as FrogCharacterId[]).filter((id) => id !== "naiBai");
  const out: { frogId: FrogCharacterId; comment: string }[] = [];
  const total = frogPool.length;
  for (let i = 0; i < total; i += 1) {
    const fi = Math.floor(seedRandom(base * (881 + i * 13) + 73) * frogPool.length) % frogPool.length;
    const frogId = frogPool.splice(fi, 1)[0];
    if (!frogId) continue;
    out.push({ frogId, comment: AUDIT_COMMENTS[frogId] ?? "该蛙在册。在册即合规。" });
  }
  return out;
}

/** 互查记录清洗（批次 BK）：学期 ≥1、备注限 40 字；上限六次 */
function sanitizeAuditLog(raw: unknown): AuditRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: AuditRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      note: typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 40) : undefined,
    });
  }
  return out.slice(-6);
}

/** 互查落档（批次 BK）：查阅记录（被注意值 +1）、检查计入考评（表演分 +1）。
 *  补的那一行学期末归档——它档案里的第一行，是别人替它写的。每学期一次。 */
export function markAudit(day: number, note: string): number | null {
  const save = loadGameSave();
  if (save.auditSeen) return null;
  const list = save.auditLog ?? [];
  const trimmed = note.trim().slice(0, 40);
  const next = [...list, { semester: save.playthrough, day, ...(trimmed ? { note: trimmed } : {}) }].slice(-6);
  persistGameSave({ ...save, auditLog: next, auditSeen: true });
  addAttention(1);
  addReputation(1);
  return next.length;
}

/* ---------- 迎检（批次 BL）：迎检 / 轮查 / 查阅申请 / 检查意见——这次轮到你的柜子被翻 ---------- */

/** 本学期哪一天迎检（批次 BL）：第 8~9 天里由种子派生的那一天；互查之后，柜子被倒着翻 */
export function inspectionDayOf(seed: number): number {
  return 8 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 877 + 73) * 2);
}

/** 查你档案的是哪只（批次 BL）：互查名单倒着排——你翻过它的柜子；点名那只不参与 */
export function inspectorOf(seed: number, exclude?: string): FrogCharacterId {
  const pool = (Object.keys(FROG_CHARACTERS) as FrogCharacterId[]).filter(
    (id) => id !== "naiBai" && FROG_CHARACTERS[id].displayName !== exclude,
  );
  const pick = Math.floor(seedRandom((Math.round(seed) % 1000000) * 887 + 79) * pool.length) % pool.length;
  return pool[pick] ?? "moMo";
}

/** 迎检记录清洗（批次 BL）：蛙 id 合法、学期 ≥1；上限六次 */
function sanitizeInspectionLog(raw: unknown): InspectionRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: InspectionRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.checker !== "string" || !(o.checker in FROG_CHARACTERS)) continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      checker: o.checker as FrogCharacterId,
      applied: o.applied === true,
    });
  }
  return out.slice(-6);
}

/** 迎检落档（批次 BL）：检查意见无异常计入考评（表演分 +1）；
 *  你在重点名册上（被注意值 +1），申请过查阅本人档案再加一笔（不予受理也要归档）。每学期一次。 */
export function markInspection(day: number, checker: FrogCharacterId, applied: boolean): number | null {
  const save = loadGameSave();
  if (save.inspectionSeen) return null;
  const list = save.inspectionLog ?? [];
  const next = [...list, { semester: save.playthrough, day, checker, applied }].slice(-6);
  persistGameSave({ ...save, inspectionLog: next, inspectionSeen: true });
  addAttention(applied ? 2 : 1);
  addReputation(1);
  return next.length;
}

/* ---------- 门后（批次 BM）：调任 / 钥匙 / 递卷 / 名牌——那扇一直关着的门，开了 ---------- */

/** 本学期哪一天调任（批次 BM）：第 8~9 天里由种子派生的那一天；迎检之后，门开了 */
export function doorDutyDayOf(seed: number): number {
  return 8 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 911 + 89) * 2);
}

/** 来查档的是哪只（批次 BM）：柜台不认人——你递出去的第一份，是你自己的那份 */
export function serverOf(seed: number, exclude?: string): FrogCharacterId {
  const pool = (Object.keys(FROG_CHARACTERS) as FrogCharacterId[]).filter(
    (id) => id !== "naiBai" && FROG_CHARACTERS[id].displayName !== exclude,
  );
  const pick = Math.floor(seedRandom((Math.round(seed) % 1000000) * 919 + 97) * pool.length) % pool.length;
  return pool[pick] ?? "moMo";
}

/** 门后记录清洗（批次 BM）：蛙 id 合法、学期 ≥1；上限六次 */
function sanitizeDutyLog(raw: unknown): DutyRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: DutyRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.served !== "string" || !(o.served in FROG_CHARACTERS)) continue;
    out.push({ semester: Math.round(o.semester), day: Math.round(o.day), served: o.served as FrogCharacterId });
  }
  return out.slice(-6);
}

/** 门后落档（批次 BM）：调任计入考评（表演分 +2），新岗位进新名册（被注意值 +1）。每学期一次。 */
export function markDoorDuty(day: number, served: FrogCharacterId): number | null {
  const save = loadGameSave();
  if (save.doorDutySeen) return null;
  const list = save.doorDutyLog ?? [];
  const next = [...list, { semester: save.playthrough, day, served }].slice(-6);
  persistGameSave({ ...save, doorDutyLog: next, doorDutySeen: true });
  addReputation(2);
  addAttention(1);
  return next.length;
}

/* ---------- 私档（批次 BV）：调阅记录——你看了，角色就会知道 ---------- */

/** 私档调阅过的蛙（首次调阅第几天；缺字段 = 未调阅） */
export function dossierReadDayOf(save: GameSaveData, frogId: FrogCharacterId): number | undefined {
  return save.dossierReads?.[frogId];
}

/** 私档落档（批次 BV）：调阅即登记。只进不退——已登记的蛙不重复登记；好感、印象分都不动（它不是数值，是关系） */
export function markDossierRead(frogId: FrogCharacterId, day: number): void {
  const save = loadGameSave();
  if (save.dossierReads?.[frogId]) return;
  persistGameSave({ ...save, dossierReads: { ...(save.dossierReads ?? {}), [frogId]: Math.max(1, day) } });
}

/** 调阅记录合并（批次 BV，读档用）：取两份里更早的那次——档案被调阅的痕迹不因回档消失 */
export function mergeDossierReads(current?: DossierReads, snap?: DossierReads): DossierReads {
  const out: DossierReads = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(snap ?? {})) {
    if (typeof value !== "number") continue;
    const prev = out[key as FrogCharacterId];
    out[key as FrogCharacterId] = typeof prev === "number" ? Math.min(prev, value) : value;
  }
  return out;
}

/* ---------- 补录（批次 BW）：未经申请的调阅，事后补的那份说明 ---------- */

/** 本学期哪一天送出补录通知（第 7~9 天里由种子派生；上面那层是，桌面下是你） */
export function explainDayOf(seed: number): number {
  return 7 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 991 + 61) * 3);
}

/** 说明送达通知上的具体时刻（同上学期口径，钟点由种子派生） */
export function explainMinuteOf(seed: number): number {
  return Math.floor(seedRandom((Math.round(seed) % 1000000) * 997 + 71) * 60);
}

/** 补录说明清洗（批次 BW）：学期/日期合理才收，事由截断到 60 字，上限六份 */
function sanitizeExplainLog(raw: unknown): ExplainRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ExplainRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    const mode = o.mode === "routine" || o.mode === "unclear" || o.mode === "confess" || o.mode === "confess-all" ? o.mode : "unclear";
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      subject: typeof o.subject === "string" ? o.subject.slice(0, 60) : "",
      mode,
    });
  }
  return out.slice(-6);
}

/**
 * 补录落档（批次 BW）：把《情况说明》订进卷宗——制度不追问内容，只核对有这份说明。
 * 口径（照深夜选项同一套）：例行按「表演」计（表演分 +2）；「记不清了」进否认档案；
 * 看见/全录是真话出口（收进真话罐 + 被注意值 +1）。
 * 每学期一次。好感、印象分都不动（它不是数值，是关系）。
 */
export function markExplainFiling(day: number, mode: ExplainRecord["mode"], subject: string): number | null {
  const save = loadGameSave();
  if (save.explainSeen) return null;
  const list = save.explainLog ?? [];
  const next = [...list, { semester: save.playthrough, day, subject, mode }].slice(-6);
  persistGameSave({ ...save, explainLog: next, explainSeen: true });
  if (mode === "routine") {
    addSilence(2);
    addReputation(2);
  } else if (mode === "unclear") {
    addSilence(1);
    recordDenial(subject);
  } else {
    addSilence(mode === "confess-all" ? -2 : -1);
    addTruth(subject);
    addAttention(1);
  }
  return next.length;
}

/* ---------- 会签（批次 BX）：说明流转到各部门——每个部门加自己的评语 ---------- */

/** 会签记录（批次 BX）：流转到的部门 → 各自的评语（上限六次，跨学期保留） */
export interface SignOffRecord {
  /** 学期号 */
  semester: number;
  /** 会签的那一天 */
  day: number;
  /** 流转到的部门（会签方） */
  dept: string;
  /** 该部门的评语 */
  comment: string;
}

/** 本学期哪一天开始会签（第 8~9 天里由种子派生的那一天；说明交上去之后，流转到了各部门） */
export function signOffDayOf(seed: number): number {
  return 8 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 1009 + 113) * 2);
}

/** 会签评语（批次 BX）：种子派生，同一颗种子同一批——每个部门加自己的评语 */
export interface SignOffItem {
  dept: string;
  comment: string;
}

/** 会签评语（批次 BX）：种子派生，同一颗种子同一批——评语栏填的不是评语，是「有这份说明」这一件事 */
export function signOffItemsOf(seed: number): SignOffItem[] {
  const picks = [
    { dept: "学工办", comment: "有这份说明。制度不核对内容，只核对有这份说明。" },
    { dept: "教务处", comment: "收到。转交。评语栏照格式填，格式不核内容。" },
    { dept: "总务处", comment: "收到。转交。评语栏照格式填，格式不核内容。" },
    { dept: "图书馆", comment: "收到。转交。评语栏照格式填，格式不核内容。" },
    { dept: "学生会", comment: "收到。转交。评语栏照格式填，格式不核内容。" },
    { dept: "辅导员", comment: "收到。转交。评语栏照格式填，格式不核内容。" },
  ];
  const start = Math.floor(seedRandom((Math.round(seed) % 1000000) * 1013 + 67) * picks.length);
  const count = 3 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 1019 + 71) * 3);
  const out: SignOffItem[] = [];
  for (let i = 0; i < Math.min(count, picks.length); i += 1) {
    out.push(picks[(start + i) % picks.length] as SignOffItem);
  }
  return out;
}

/** 会签记录清洗（批次 BX）：学期 ≥1、日期 ≥1、部门与评语非空；上限六次 */
function sanitizeSignOffLog(raw: unknown): SignOffRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: SignOffRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.dept !== "string" || !o.dept) continue;
    if (typeof o.comment !== "string" || !o.comment) continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      dept: String(o.dept).slice(0, 20),
      comment: String(o.comment).slice(0, 120),
    });
  }
  return out.slice(-6);
}

/**
 * 会签落档（批次 BX）：把说明流转到各部门——每个部门加自己的评语，制度不核对内容，只核对有这份说明。
 * 每学期一次。会签评语按部门轮转（同一颗种子同一批）。
 */
export function markSignOff(day: number, dept: string, comment: string): number | null {
  const save = loadGameSave();
  const list = save.signOffLog ?? [];
  const next = [...list, { semester: save.playthrough, day, dept, comment }].slice(-6);
  persistGameSave({ ...save, signOffLog: next });
  return next.length;
}

/** 会签落档（批次 BX）：本学期会签过没有——说明每学期流转一轮 */
export function markSignOffSeen(): void {
  const save = loadGameSave();
  if (save.signOffSeen) return;
  persistGameSave({ ...save, signOffSeen: true });
}

/* ---------- 归档（批次 BY）：封卷 → 铅封 → 编号 → 入柜——说明的最后一站 ---------- */

/** 归档记录（批次 BY）：封卷的学期、卷号、封条颜色（上限六卷，跨学期保留） */
export interface SealRecord {
  /** 学期号 */
  semester: number;
  /** 归档的那一天 */
  day: number;
  /** 卷号（学期内递增） */
  volume: number;
  /** 封条颜色（种子派生，同一颗种子同一色） */
  seal: string;
}

/** 本学期哪一天开始归档（第 8~9 天里由种子派生的那一天；会签评语回来之后，封卷） */
export function sealDayOf(seed: number): number {
  return 8 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 1021 + 127) * 2);
}

/** 归档封条颜色（批次 BY）：种子派生，同一颗种子同一色 */
export function sealColorOf(seed: number): string {
  const colors = ["红", "蓝", "灰"];
  const i = Math.floor(seedRandom((Math.round(seed) % 1000000) * 1031 + 79) * colors.length);
  return colors[Math.min(i, colors.length - 1)] as string;
}

/** 归档记录清洗（批次 BY）：学期 ≥1、日期 ≥1、卷号 ≥1；上限六卷 */
function sanitizeSealLog(raw: unknown): SealRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: SealRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.volume !== "number" || o.volume < 1) continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      volume: Math.round(o.volume),
      seal: typeof o.seal === "string" ? String(o.seal).slice(0, 8) : "",
    });
  }
  return out.slice(-6);
}

/**
 * 归档落档（批次 BY）：把说明封进卷宗——封卷、铅封、编号、入柜。
 * 制度不核对内容，只核对封条颜色与编号对得上。每学期一次。
 */
export function markSeal(day: number, volume: number, seal: string): number | null {
  const save = loadGameSave();
  if (save.sealSeen) return null;
  const list = save.sealLog ?? [];
  const next = [...list, { semester: save.playthrough, day, volume, seal }].slice(-6);
  persistGameSave({ ...save, sealLog: next, sealSeen: true });
  return next.length;
}

/** 归档落档（批次 BY）：本学期归档过没有——说明每学期封卷一次 */
export function markSealSeen(): void {
  const save = loadGameSave();
  if (save.sealSeen) return;
  persistGameSave({ ...save, sealSeen: true });
}

/* ---------- 撰写（批次 BZ）：你不只是被学校记录，也可以写一份关于别人的报告 ----------
 * 第一次从被记录的人，变成记录别人的人。笔比你想的轻，纸比你想的顺——
 * 格式你已经会了：抬头、编号、事由、署名，每一栏的位置你都记得，因为它们都记过你。 */

/** 玩家的学号（批次 BZ）：座位按学号排，你是 036——署名栏填的就是这个号，制度认号不认笔迹 */
export const REPORT_STUDENT_ID = "036";

/**
 * 撰写记录（批次 BZ）：你写的报告。跨学期保留（二周目的档案柜里还在）；
 * 一学期一份——空白档案页按这个口径决定出不出现。
 * by（批次 CB 起）："you" 你写的 / "courier" 你经手的（替团体递的那份，署名栏空白）。
 */
export interface PlayerReport {
  /** 学期号 */
  semester: number;
  /** 递交的那一天 */
  day: number;
  /** 写的是哪一只 */
  frogId: FrogCharacterId;
  /** "true" 实话（会被核）| "false" 不是实话（会被放过） */
  verdict: "true" | "false";
  /** 报告「事由」栏原文 */
  text: string;
  /** 谁写的：you 你亲手 / courier 你经手（批次 CB；旧档缺字段按 you） */
  by?: "you" | "courier";
}

/** 报告清洗（批次 BZ）：蛙 id 合法、学期/日期 ≥1、两档口径、事由截 80 字；上限十二份 */
function sanitizePlayerReports(raw: unknown): PlayerReport[] {
  if (!Array.isArray(raw)) return [];
  const out: PlayerReport[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.frogId !== "string" || !(o.frogId in FROG_CHARACTERS)) continue;
    if (o.verdict !== "true" && o.verdict !== "false") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      frogId: o.frogId as FrogCharacterId,
      verdict: o.verdict,
      text: typeof o.text === "string" ? o.text.slice(0, 80) : "",
      by: o.by === "courier" ? ("courier" as const) : ("you" as const),
    });
  }
  return out.slice(-12);
}

/** 本学期写过报告没有（一学期一份；经手的递件不算——写过之后，那张空白档案页就不再出现了） */
export function hasPlayerReportThisSemester(save: GameSaveData): boolean {
  return (save.reportLog ?? []).some(
    (item) => item.semester === save.playthrough && item.by !== "courier",
  );
}

/** 某只蛙最近被写过的一份报告（没有返回 null；跨学期都算——它隐约记得有人写过自己） */
export function latestPlayerReportOf(save: GameSaveData, frogId: FrogCharacterId): PlayerReport | null {
  const list = (save.reportLog ?? []).filter((item) => item.frogId === frogId);
  return list.length > 0 ? (list[list.length - 1] as PlayerReport) : null;
}

/**
 * 报告提交（批次 BZ）：档案柜里多一份署名是你学号的报告——不可撤销，没有撤回这一栏。
 * 实话：事由原文收进真话罐（沉默 −1、被注意值 +1——你的笔进了制度的手），
 *   它被核过、会被处理（好感 −4：你们之间多了一件不能提的事，这一件是你写的）；
 * 不是实话：它被放过了——印象分 +2、被注意值 −1（没人需要盯一个写好话的记录员），
 *   它照常跟你说笑（好感 +2：它不知道有人写过它，知道了也不会知道写的是假话）。
 * 制度不核对真伪——制度只核对有没有这份报告。一学期一份，已写过返回 null。
 */
export function markPlayerReport(
  day: number,
  frogId: FrogCharacterId,
  verdict: "true" | "false",
  text: string,
): number | null {
  const save = loadGameSave();
  const log = save.reportLog ?? [];
  if (log.some((item) => item.semester === save.playthrough && item.by !== "courier")) return null;
  const next = [...log, { semester: save.playthrough, day, frogId, verdict, text, by: "you" as const }].slice(-12);
  persistGameSave({ ...save, reportLog: next });
  if (verdict === "true") {
    addSilence(-1);
    addTruth(text);
    addAttention(1);
    addAffinity(frogId, -4);
  } else {
    addSilence(2);
    addReputation(2);
    addAttention(-1);
    addAffinity(frogId, 2);
  }
  return next.length;
}

/**
 * 深夜占日标记（批次 BZ）：只占今天，不进已看清单——空白档案页每晚都在桌上，直到你写完。
 * （与 markNightEventSeen 的区别：不往 seenNightEvents 里收，第二天夜里它还会出现。）
 */
export function markNightDaySpent(day: number): GameSaveData {
  const save = loadGameSave();
  return persistGameSave({
    ...save,
    lastNightDay: Math.max(save.lastNightDay, Math.max(0, Math.round(day))),
  });
}

/* ---------- 递件（批次 CB）：团体要你办的第一件事——替它把一份表交上去 ---------- */

/** 团体记录（批次 CB）：你经手的递件——verdict delivered 递进去了 / held 压在你手里 */
export interface CourierRecord {
  /** 学期号 */
  semester: number;
  /** 受托的那一天 */
  day: number;
  /** 哪个团体托的 */
  factionId: string;
  /** "delivered" 递进去了 | "held" 压在你手里 */
  verdict: "delivered" | "held";
  /** 那张表「事由」栏原文（写的是你） */
  text: string;
}

/** 本学期哪一天有东西等你递（批次 CB）：第 3~9 天里由种子派生；同一颗种子同一日 */
export function courierDayOf(seed: number, factionId: string): number {
  const multipliers: Record<string, number> = { curfew: 1087, bulletin: 1091, ledger: 1093 };
  const base = Math.round(seed) % 1000000;
  const multiplier = multipliers[factionId] ?? 1087;
  return 3 + Math.floor(seedRandom(base * multiplier + 139) * 7);
}

/** 递件清洗（批次 CB）：学期/日期 ≥1、团体与两档合法；上限十二份 */
function sanitizeCourierLog(raw: unknown): CourierRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: CourierRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.factionId !== "string" || !(o.factionId in FACTION_ID_SET)) continue;
    if (o.verdict !== "delivered" && o.verdict !== "held") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      factionId: o.factionId,
      verdict: o.verdict,
      text: typeof o.text === "string" ? o.text.slice(0, 80) : "",
    });
  }
  return out.slice(-12);
}

/** 本学期受托过没有（每学期一封；团体要你办的事不多——但每一件都用你的名字） */
export function courierSentThisSemesterOf(save: GameSaveData): boolean {
  return (save.courierLog ?? []).some((item) => item.semester === save.playthrough);
}

/** 事由候选（批次 CB）：写进那份报告的每一行，都来自你自己的档案 */
export interface CourierFact {
  /** 事由栏原文 */
  text: string;
  /** 这一行的出处（档案腔） */
  from: string;
}

/**
 * 那张表写的是哪一件事（批次 CB）：种子从你自己档案的事实里挑一行。
 * 你翻过的私档、你写过的报告、你逃过的课、你在名单上的位置——都可能是事由。
 * 兜底是「无异常」：没有内容的报告最难反驳。
 */
export function courierFactOf(save: GameSaveData, seed: number): CourierFact {
  const pool: CourierFact[] = [];
  if ((save.reportLog ?? []).some((item) => item.by !== "courier")) {
    pool.push({
      text: "该蛙本学期提交《情况反映》一份，经手人栏均为其本人。建议：留意。",
      from: "你写过的报告",
    });
  }
  const reads = Object.keys(save.dossierReads ?? {}).length;
  if (reads > 0) {
    pool.push({
      text: `该蛙档案查阅记录：未经申请，共 ${reads} 处。无审批。`,
      from: "调阅痕",
    });
  }
  if ((save.skips ?? 0) >= 3) {
    pool.push({
      text: `该蛙本学期集体活动缺席 ${save.skips} 次。无说明。`,
      from: "逃课记录",
    });
  }
  if (save.attention >= 3) {
    pool.push({
      text: `该蛙已在重点关注名单，被注意 ${save.attention} 点。建议：持续。`,
      from: "名单",
    });
  }
  if (save.silenceValue >= 10) {
    pool.push({
      text: `该蛙沉默值累计 ${save.silenceValue} 点。用途一栏：${save.budgetSeen ? "已申报。" : "空白。"}`,
      from: "沉默值",
    });
  }
  if ((save.rollcallMisses ?? 0) >= 3) {
    pool.push({
      text: `该蛙点名未应答 ${save.rollcallMisses} 次。名单上多了一笔。`,
      from: "点名",
    });
  }
  pool.push({ text: "该蛙无异常。建议：持续留意。", from: "空白" });
  const pick = Math.floor(seedRandom((Math.round(seed) % 1000000) * 1097 + 149) * pool.length) % pool.length;
  return pool[pick] ?? (pool[pool.length - 1] as CourierFact);
}

/**
 * 受托落档（批次 CB）：你替团体递的那份表——被反映人一栏写着 036，事由写的是你自己。
 * 递上去：经手是你（表演分 +2「办事利落」、被注意值 +1「经手记录」）、它记下了（好感 +4）；
 *   报告进柜（被反映人：奶白；署名栏空白——署名的不是你，经手的是你）；
 * 压下去：它不问为什么，但它记住了（好感 −6）；你藏了一件东西（沉默 +2、被注意值 +1——
 *   私扣不在流程里，所以没有一栏收它；它只在的地方，是你手里）。
 * 每学期一封。已受托返回 null。
 */
export function markCourier(
  day: number,
  factionId: string,
  verdict: "delivered" | "held",
  text: string,
): number | null {
  const save = loadGameSave();
  if (courierSentThisSemesterOf(save)) return null;
  const log = [
    ...(save.courierLog ?? []),
    { semester: save.playthrough, day, factionId, verdict, text },
  ].slice(-12);
  const requester = FACTION_REQUESTER[factionId as FactionId];
  if (verdict === "delivered") {
    persistGameSave({
      ...addReputation(2),
      ...addAttention(1),
      courierLog: log,
      reportLog: [
        ...(save.reportLog ?? []),
        {
          semester: save.playthrough,
          day,
          frogId: "naiBai" as const,
          verdict: "true" as const,
          text,
          by: "courier" as const,
        },
      ].slice(-12),
    });
    if (requester) addAffinity(requester, 4);
  } else {
    persistGameSave({
      ...addSilence(2),
      ...addAttention(1),
      courierLog: log,
    });
    if (requester) addAffinity(requester, -6);
  }
  return log.length;
}

/* ---------- 离校（批次 CC）：某个角色突然不在了——没有预告，没有告别 ---------- */

/**
 * 离校记录（批次 CC）：不是结局——学期中途，某个角色突然不在了。
 * response 未填 = 学期内没有回应（开学期补记为沉默：不回应也是一种回应，只是没字）。
 */
export interface DepartureRecord {
  /** 学期号 */
  semester: number;
  /** 它不在的那一天 */
  day: number;
  /** 走的是哪一只 */
  frogId: FrogCharacterId;
  /** 回应：accepted 接受 / pursued 追问 / silent 沉默 */
  response?: "accepted" | "pursued" | "silent";
  /** 追问走到第几站（pursued 专用：行政楼 → 档案柜 → 约谈） */
  steps?: number;
}

/** 离校记录清洗（批次 CC）：学期/日期 ≥1、蛙 id 合法（不含主角）、回应三档；上限六份 */
function sanitizeDepartureLog(raw: unknown): DepartureRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: DepartureRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.frogId !== "string" || o.frogId === "naiBai" || !(o.frogId in FROG_CHARACTERS)) continue;
    if (o.response !== undefined && o.response !== "accepted" && o.response !== "pursued" && o.response !== "silent") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      frogId: o.frogId as FrogCharacterId,
      response: o.response as DepartureRecord["response"],
      steps: typeof o.steps === "number" && Number.isFinite(o.steps) ? Math.max(0, Math.round(o.steps)) : undefined,
    });
  }
  return out.slice(-6);
}

/** 本学期哪一天它不在了（批次 CC）：第 4~9 天里由种子派生；同一颗种子同一日 */
export function departureDayOf(seed: number): number {
  return 4 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 1103 + 151) * 6);
}

/**
 * 走的是哪一只（批次 CC）：优先在你进过楼的那些里挑——你认识的走了，才轮到没认识的。
 * 挑谁不由你决定：同一颗种子同一只，你无法通过任何操作阻止它。
 */
export function departurePickOf(save: GameSaveData): FrogCharacterId {
  const all = (Object.keys(FROG_LINE) as FrogCharacterId[]).filter((id) => id !== "naiBai");
  const known = all.filter((id) => save.visitedLines.includes(FROG_LINE[id]));
  const pool = known.length > 0 ? known : all;
  const pick = Math.floor(seedRandom((Math.round(save.weatherSeed) % 1000000) * 1109 + 157) * pool.length) % pool.length;
  return pool[pick] ?? (all[0] as FrogCharacterId);
}

/** 本学期谁离校了（批次 CC；没有返回 undefined） */
export function departureThisSemesterOf(save: GameSaveData): DepartureRecord | undefined {
  return (save.departureLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 离校落档（批次 CC）：没有预告，没有告别——你只是某一天去了，发现它不在。每学期最多一次 */
export function markDeparture(day: number, frogId: FrogCharacterId): void {
  const save = loadGameSave();
  if (departureThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    departureLog: [...(save.departureLog ?? []), { semester: save.playthrough, day, frogId }].slice(-6),
  });
}

/**
 * 回应落档（批次 CC）：接受 / 追问 / 沉默——没有正确的回应，只有你选了哪一种。
 * 追问：被记一笔（被注意值 +2「多次询问学籍变动」、沉默 +1）——追问的收束是「材料已收讫，不予受理」；
 * 沉默：沉默 +2（不回应也是一种回应，只是没字）；接受：数值不动（它不奖励接受）。
 */
export function respondDeparture(response: "accepted" | "pursued" | "silent", steps?: number): void {
  const save = loadGameSave();
  const log = save.departureLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    departureLog: log.map((item, i) => (i === index ? { ...item, response, steps } : item)),
  });
  if (response === "pursued") {
    addAttention(2);
    addSilence(1);
  } else if (response === "silent") {
    addSilence(2);
  }
}

/** 本学期不在场的蛙（批次 CC）：那条线还在，但它不在了——它的每一行都降级为脚注 */
export function departedFrogsOf(save: GameSaveData): FrogCharacterId[] {
  return (save.departureLog ?? [])
    .filter((item) => item.semester === save.playthrough)
    .map((item) => item.frogId);
}

/** 上一学期走了、这一学期回来了的那只（批次 CC）：档案被重置了，它不记得你；你的没有 */
export function departedReturnOf(save: GameSaveData): FrogCharacterId | undefined {
  const prior = save.playthrough - 1;
  return (save.departureLog ?? []).find((item) => item.semester === prior)?.frogId;
}

/* ---------- 消迹（批次 CF）：你说过的一句真话，从档案里没了 ---------- */

/**
 * 消迹记录（批次 CF）：不是结局——某天你翻档案，那一栏是空的。
 * 计数还在（真话 X 条），内容没了：像它没被写过，但你知道它发生过。
 * response 未填 = 学期内没有追问（开学期照旧，不补记）。
 */
export interface VanishRecord {
  /** 学期号 */
  semester: number;
  /** 发现那一天 */
  day: number;
  /** 被抽走的那一句（真话罐里的原文） */
  text: string;
  /** 追问：filed 补录 / letgo 不补 / insist 再问一次 */
  response?: "filed" | "letgo" | "insist";
}

/** 消迹记录清洗（批次 CF）：学期/日期 ≥1、原文非空、追问三档；上限八份 */
function sanitizeVanishLog(raw: unknown): VanishRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: VanishRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.text !== "string" || o.text.trim().length === 0) continue;
    if (o.response !== undefined && o.response !== "filed" && o.response !== "letgo" && o.response !== "insist") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      text: o.text.trim().slice(0, 120),
      response: o.response as VanishRecord["response"],
    });
  }
  return out.slice(-8);
}

/** 消迹触发日（批次 CF）：学期后半（第 5~9 天里由种子派生）；同一颗种子同一日 */
export function vanishDayOf(seed: number): number {
  return 5 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 1231 + 193) * 5);
}

/** 挑哪一句（批次 CF）：真话罐里由种子定的一句——你不知道少的是哪句，直到你翻 */
export function vanishPickOf(save: GameSaveData): string {
  const jar = save.truthJar;
  if (jar.length === 0) return "";
  const pick = Math.floor(seedRandom((Math.round(save.weatherSeed) % 1000000) * 1237 + 197) * jar.length) % jar.length;
  return jar[pick] ?? (jar[0] as string);
}

/** 本学期被抽走了吗（批次 CF；没有返回 undefined） */
export function vanishThisSemesterOf(save: GameSaveData): VanishRecord | undefined {
  return (save.vanishLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 本学期的追问落了吗（批次 CF） */
export function vanishRespondedOf(save: GameSaveData): boolean {
  const record = vanishThisSemesterOf(save);
  return record !== undefined && record.response !== undefined;
}

/** 跨学期被抽走的全部原文（批次 CF）：展示侧用它把那一行从报告里滤掉 */
export function vanishedTextsOf(save: GameSaveData): string[] {
  return (save.vanishLog ?? []).map((item) => item.text);
}

/** 消迹落档（批次 CF）：发现不靠你去找——那一天到了，那一栏就空了。每学期最多一次 */
export function markVanish(day: number, text: string): void {
  const save = loadGameSave();
  if (vanishThisSemesterOf(save)) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  persistGameSave({
    ...save,
    vanishLog: [...(save.vanishLog ?? []), { semester: save.playthrough, day, text: trimmed.slice(0, 120) }].slice(-8),
  });
}

/**
 * 追问落档（批次 CF）：补录 / 不补 / 再问一次——没有正确的选择，只有你要不要认。
 * 补录：被驳回（被注意值 +1——伸手就要留名）；再问一次：被注意值 +2（它们让你坐下了）；
 * 不补：数值不动（它不奖励放弃）。
 */
export function respondVanish(response: "filed" | "letgo" | "insist"): void {
  const save = loadGameSave();
  const log = save.vanishLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    vanishLog: log.map((item, i) => (i === index ? { ...item, response } : item)),
  });
  if (response === "filed") addAttention(1);
  else if (response === "insist") addAttention(2);
}

/* ---------- 已结（批次 CG）：档案比蛙先毕业 ---------- */

/**
 * 已结记录（批次 CG）：你在档案柜最里头找到一份卷——编号 035（橡皮蛙）。
 * 封面写着「该生已毕业」，日期是下学期末。它还在上课。
 * 你选了哪一种就落哪一种；没动它也是落了（该卷查阅，未动）。
 */
export interface FinishedRecord {
  /** 学期号 */
  semester: number;
  /** 找到那一天 */
  day: number;
  /** 三种选择：annotate 添注 / still 不动 / note 替它记上 */
  response?: "annotate" | "still" | "note";
}

/** 已结记录清洗（批次 CG）：学期/日期 ≥1、选择三档；上限六份 */
function sanitizeFinishedLog(raw: unknown): FinishedRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: FinishedRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.response !== undefined && o.response !== "annotate" && o.response !== "still" && o.response !== "note") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      response: o.response as FinishedRecord["response"],
    });
  }
  return out.slice(-6);
}

/** 已结落档日（批次 CG）：学期后半（第 5~9 天里由种子派生）；同一颗种子同一日 */
export function finishedDayOf(seed: number): number {
  return 5 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 1277 + 211) * 5);
}

/** 本学期见过那份卷没有（批次 CG；没有返回 undefined） */
export function finishedThisSemesterOf(save: GameSaveData): FinishedRecord | undefined {
  return (save.finishedLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 已结落档（批次 CG）：发现不靠你去找——那一天到了，柜子最里头就有。每学期最多一次 */
export function markFinished(day: number): void {
  const save = loadGameSave();
  if (finishedThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    finishedLog: [...(save.finishedLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 选择落档（批次 CG）：添注 / 不动 / 替它记上——没有正确的选择。
 * 添注：档案照写「不予受理」——你写的那一行进不了卷（被注意值 +1——伸手就要留名）；
 * 不动：数值不动（它不奖励放弃，也不奖励顺从）；
 * 替它记上：备注栏有了内容——「那咋了」进了柜子（沉默值 +1——你替它开口了一次）。
 */
export function respondFinished(response: "annotate" | "still" | "note"): void {
  const save = loadGameSave();
  const log = save.finishedLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    finishedLog: log.map((item, i) => (i === index ? { ...item, response } : item)),
  });
  if (response === "annotate") addAttention(1);
  else if (response === "note") addSilence(1);
}

/** 添注的那一行（批次 CG）：跨周目保留——下一周目你翻开它，看到自己上一周目写的字 */
export function finishedNoteOf(save: GameSaveData): string | null {
  const noted = (save.finishedLog ?? []).find((item) => item.response === "annotate");
  return noted ? ANNOTATE_TEXT : null;
}

/* ---------- 行政化（批次 CH）：入学登记表 / 申请离校 ---------- */

/**
 * 离校记录（批次 CH）：退出不是退出，是申请离校——填表才能走。
 * 没有正确的理由。事由四选一，系统照收，档案不问真假。
 */
export interface LeaveRecord {
  /** 学期号 */
  semester: number;
  /** 事由：transfer 转学 / physical 体检 / normal 正常毕业 / other 其他（原文自填） */
  reason: "transfer" | "physical" | "normal" | "other";
  /** 其他事由的原文（reason=other 时才有） */
  note?: string;
}

/** 离校记录清洗（批次 CH）：学期 ≥1、事由四档；上限六份 */
function sanitizeLeaveLog(raw: unknown): LeaveRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: LeaveRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (o.reason !== "transfer" && o.reason !== "physical" && o.reason !== "normal" && o.reason !== "other") continue;
    out.push({
      semester: Math.round(o.semester),
      reason: o.reason,
      note: typeof o.note === "string" && o.note.trim().length > 0 ? o.note.trim().slice(0, 40) : undefined,
    });
  }
  return out.slice(-6);
}

/** 登记姓名清洗（批次 CH）：最多 12 字，去首尾空白 */
function sanitizeDisplayName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().slice(0, 12);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 登记姓名（批次 CH/CO）：入学登记表或补录表提交时落档；空串 = 档案写「该蛙未登记姓名」。
     补录过就记着（具名）：学籍信息补全不受理第二次 */
export function persistPlayerDisplayName(name: string): GameSaveData {
  const save = loadGameSave();
  const trimmed = name.trim().slice(0, 12);
  return persistGameSave({
    ...save,
    playerDisplayName: trimmed.length > 0 ? trimmed : undefined,
    playerRenamed: trimmed.length > 0 ? true : save.playerRenamed,
  });
}

/** 具名（批次 CO）：登记/补录过姓名没有 */
export function playerRenamedOf(save: GameSaveData): boolean {
  return save.playerRenamed === true;
}

/** 成绩单/署名用的名字（批次 CO）：登记了用名字，没登记写「该蛙未登记姓名」——有名字的才好被处理 */
export function displayNameOf(save: GameSaveData): string {
  const name = (save.playerDisplayName ?? "").trim();
  return name.length > 0 ? name : "该蛙未登记姓名";
}

/** 读登记姓名（批次 CH）：没有 = 「该蛙未登记姓名」 */
export function playerDisplayNameOf(save: GameSaveData): string {
  const name = (save.playerDisplayName ?? "").trim();
  return name.length > 0 ? name : "该蛙未登记姓名";
}

/** 申请离校落档（批次 CH）：填表才走——事由照收，档案不问真假 */
export function recordLeaveSchool(reason: "transfer" | "physical" | "normal" | "other", note?: string): void {
  const save = loadGameSave();
  persistGameSave({
    ...save,
    leaveLog: [...(save.leaveLog ?? []), { semester: save.playthrough, reason, note: note?.trim().slice(0, 40) }].slice(-6),
  });
}

/* ---------- 调阅记录（批次 CI）：打印 → 归档或销毁 ---------- */

/**
 * 销毁记录（批次 CI）：调阅记录可以打印，打印件可以销毁。
 * 销毁之后，历史记录里那段就没了——但销毁这个动作本身要占一行：柜子里多一张「已销毁」。
 */
export interface ShredRecord {
  /** 学期号 */
  semester: number;
  /** 销毁的条数 */
  count: number;
}

/** 销毁记录清洗（批次 CI）：学期 ≥1、条数 ≥0；上限六批 */
function sanitizeShredLog(raw: unknown): ShredRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ShredRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.count !== "number" || o.count < 0) continue;
    out.push({ semester: Math.round(o.semester), count: Math.round(o.count) });
  }
  return out.slice(-6);
}

/** 销毁落档（批次 CI）：销毁不是删除，是换一种记录——沉默值 +2（该蛙申请销毁调阅记录） */
export function recordShred(count: number): void {
  const save = loadGameSave();
  persistGameSave({
    ...save,
    shredLog: [...(save.shredLog ?? []), { semester: save.playthrough, count: Math.max(0, Math.round(count)) }].slice(-6),
    silenceValue: save.silenceValue + 2,
  });
}

/** 销毁过的档案格清洗（批次 CK）：只留合法槽位 id（s1-s6 / auto 不许销毁） */
function sanitizeDestroyedSlots(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (item === "auto") continue;
    if (!/^s[1-6]$/.test(item)) continue;
    if (!out.includes(item)) out.push(item);
  }
  return out.slice(-6);
}

/** 档案格销毁落档（批次 CK）：柜子里没有删除，只有销毁——销毁后那一格多一张空白页 */
export function recordSlotDestroyed(slotId: string): void {
  if (slotId === "auto" || !/^s[1-6]$/.test(slotId)) return;
  const save = loadGameSave();
  const list = save.destroyedSlots ?? [];
  if (list.includes(slotId)) return;
  persistGameSave({ ...save, destroyedSlots: [...list, slotId].slice(-6) });
}

/** 这一格销毁过吗（批次 CK） */
export function slotDestroyedOf(save: GameSaveData, slotId: string): boolean {
  return (save.destroyedSlots ?? []).includes(slotId);
}

/* ---------- 批阅者（批次 CL）：你的档案上每一行批语都是它写的 ---------- */

/**
 * 批阅者记录（批次 CL）：记录员 014——它知道你的一切，你知道它的编号。
 * 三档回应：note 留条 / wait 等 / still 不动。
 */
export interface RecorderRecord {
  /** 学期号 */
  semester: number;
  /** 找到那一天 */
  day: number;
  /** 回应：note 留条 / wait 等 / still 不动 */
  response?: "note" | "wait" | "still";
}

/** 批阅者记录清洗（批次 CL）：学期/日期 ≥1、回应三档；上限六份 */
function sanitizeRecorderLog(raw: unknown): RecorderRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: RecorderRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.response !== undefined && o.response !== "note" && o.response !== "wait" && o.response !== "still") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      response: o.response as RecorderRecord["response"],
    });
  }
  return out.slice(-6);
}

/** 批阅者落档日（批次 CL）：学期中段（第 3~9 天里由种子派生）；同一颗种子同一日 */
export function recorderFindDayOf(seed: number): number {
  return 3 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 1301 + 229) * 7);
}

/** 本学期找过它没有（批次 CL；没有返回 undefined） */
export function recorderThisSemesterOf(save: GameSaveData): RecorderRecord | undefined {
  return (save.recorderLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 遇见过它没有（批次 CL）：翻过档案才注意到落款——dossierReads 有记录 */
export function recorderMetOf(save: GameSaveData): boolean {
  return recorderThisSemesterOf(save) !== undefined;
}

/** 批阅者落档（批次 CL）：发现不靠你去找——翻档案翻到页脚就看见了。每学期最多一次 */
export function markRecorder(day: number): void {
  const save = loadGameSave();
  if (recorderThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    recorderLog: [...(save.recorderLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 回应落档（批次 CL）：留条 / 等 / 不动——没有正确的选择。
 * 留条：跨周目压在玻璃板下（recorderNoteLeft，下一周目多一行「每年都问。每年都不必。」）；
 * 等：它看得见你——沉默 +1；不动：数值不动（它不奖励放弃，也不奖励顺从）。
 */
export function respondRecorder(response: "note" | "wait" | "still"): void {
  const save = loadGameSave();
  const log = save.recorderLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  const next = log.map((item, i) => (i === index ? { ...item, response } : item));
  if (response === "note") {
    persistGameSave({ ...save, recorderLog: next, recorderNoteLeft: true, silenceValue: save.silenceValue + 1 });
    return;
  }
  if (response === "wait") {
    persistGameSave({ ...save, recorderLog: next, silenceValue: save.silenceValue + 1 });
    return;
  }
  persistGameSave({ ...save, recorderLog: next });
}

/* ---------- 传染（批次 CM）：沉默是会传染的 ---------- */

/**
 * 传染记录（批次 CM）：校园安静下来了——不是因为你，是因为安静本身会学。
 * 三档回应：keep 继续 / speak 说一句话 / deny 不承认。
 */
export interface QuietingRecord {
  /** 学期号 */
  semester: number;
  /** 注意到那一天 */
  day: number;
  /** 回应：keep 继续 / speak 说一句话 / deny 不承认 */
  response?: "keep" | "speak" | "deny";
}

/** 传染记录清洗（批次 CM）：学期/日期 ≥1、回应三档；上限六份 */
function sanitizeQuietingLog(raw: unknown): QuietingRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: QuietingRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.response !== undefined && o.response !== "keep" && o.response !== "speak" && o.response !== "deny") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      response: o.response as QuietingRecord["response"],
    });
  }
  return out.slice(-6);
}

/** 本学期注意到过没有（批次 CM；没有返回 undefined） */
export function quietingThisSemesterOf(save: GameSaveData): QuietingRecord | undefined {
  return (save.quietingLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 传染落档（批次 CM）：沉默值 ≥8 之后的学期中段——你数得出来的就有三件。每学期最多一次 */
export function markQuieting(day: number): void {
  const save = loadGameSave();
  if (quietingThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    quietingLog: [...(save.quietingLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 回应落档（批次 CM）：继续 / 说一句话 / 不承认——没有正确的选择。
 * 继续：沉默 +1（你就是开头）；说一句话：被注意 +2（打破要被记录——但确实打破了）；
 * 不承认：被注意 +1（否认要先承认存在需要否认的事）。
 */
export function respondQuieting(response: "keep" | "speak" | "deny"): void {
  const save = loadGameSave();
  const log = save.quietingLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    quietingLog: log.map((item, i) => (i === index ? { ...item, response } : item)),
  });
  if (response === "keep") {
    const fresh = loadGameSave();
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  } else if (response === "speak") {
    addAttention(2);
  } else {
    addAttention(1);
  }
}

/* ---------- 不告而别（批次 CN）：没有退出只有申请离校——直接关掉页面，也算一次离校 ---------- */

/** 未办手续离校的次数清洗（批次 CN）：非负封顶 99 */
function sanitizeAbscondCount(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(99, Math.round(raw));
}

/** 读未办手续离校的次数（批次 CN） */
export function abscondCountOf(save: GameSaveData): number {
  return save.abscondCount ?? 0;
}

/**
 * 不告而别落档（批次 CN）：页面隐藏/关闭时调用——只有本会话真的推进过（脏标记在）才记一次。
 * 每次会话至多记一次。它不怪你：档案只多一行「离校，未办手续」。
 */
export function markAbscond(): void {
  try {
    if (window.sessionStorage.getItem(DIRTY_KEY) !== "1") return;
    window.sessionStorage.removeItem(DIRTY_KEY);
  } catch {
    return;
  }
  const save = loadGameSave();
  persistGameSave({ ...save, abscondCount: abscondCountOf(save) + 1 });
}

/** 说明落档（批次 CN）：最近一次选的是哪一种——补表销记录，其余照收（每学期至多办一次说明） */
export function settleAbscond(response: "settle" | "promise" | "claim"): void {
  const save = loadGameSave();
  persistGameSave({
    ...save,
    abscondResponse: response,
    abscondSettled: true,
    ...(response === "settle" ? { abscondCount: 0 } : {}),
  });
}

/* ---------- 交班（批次 CP）：你不是毕业生，你是经办人 ---------- */

/**
 * 交班记录（批次 CP）：学期末的经办交接——你经手过的每一件事都得写清楚，交给下一只。
 * 三档回应：sign 照单交 / omit 少交一项 / extra 多交一项。
 */
export interface ShiftHandoverRecord {
  /** 学期号 */
  semester: number;
  /** 交接那一天 */
  day: number;
  /** 回应：sign 照单交 / omit 少交一项 / extra 多交一项 */
  response?: "sign" | "omit" | "extra";
  /** 照单交时核签的事项数（从存档派生，落档时快照） */
  items?: number;
}

/**
 * 回单记录（批次 CQ）：你签过的单子被叫回来核对。
 * about 按上学期怎么交的派生；三档应对：confirm 照认 / point 指单 / smooth 补圆。
 */
export interface TestimonyRecord {
  /** 学期号 */
  semester: number;
  /** 核对那一天 */
  day: number;
  /** 回单的事由：上学期哪种交法惹的 */
  about: ShiftResponse;
  /** 应对：confirm 照认 / point 指单 / smooth 补圆 */
  response?: "confirm" | "point" | "smooth";
}

/**
 * 接任记录（批次 CR）：《工作交接单》退回来，接办人一栏要填。
 * 三档填法：name 填了候选的名字 / blank 交给系统 / self 填回你自己。
 */
export interface SuccessionRecord {
  /** 学期号 */
  semester: number;
  /** 登记那一天 */
  day: number;
  /** 填法三档 */
  pick?: "name" | "blank" | "self";
  /** 填名时登记的那只蛙（角色 id，纯记录——档案知道，它自己不知道） */
  frog?: string;
}

/**
 * 误投记录（批次 CS）：处分决定书投错了信格。抬头是你的学号，事由不是你的事。
 * 三档处理：correct 去更正 / carry 不吭声 / return 原样退回。
 */
export interface MisdeliveryRecord {
  /** 学期号 */
  semester: number;
  /** 送达那一天 */
  day: number;
  /** 处理三档 */
  pick?: "correct" | "carry" | "return";
}

/**
 * 补页记录（批次 CT）：卷宗缺了一页，遗失原因——经办失误。遗失页由当事人补述。
 * 三档补法：faithful 照实补述 / sparse 少说一点 / extra 多写一点。
 */
export interface LostPageRecord {
  /** 学期号 */
  semester: number;
  /** 补述那一天 */
  day: number;
  /** 补法三档 */
  pick?: "faithful" | "sparse" | "extra";
}

/**
 * 合档记录（批次 CV）：卷宗重号，按规程合并为一宗——那宗里有你，也有它。
 * 三档处理：split 申请拆卷 / carry 不管它 / meet 去认识它。
 */
export interface MergerRecord {
  /** 学期号 */
  semester: number;
  /** 通知那一天 */
  day: number;
  /** 处理三档 */
  pick?: "split" | "carry" | "meet";
  /** 重号的另一只（角色 id，纯记录——它可能连通知都没收到） */
  frog?: string;
}

/**
 * 转递记录（批次 CW）：卷宗被点名转递复核，离柜一趟——途经部门可依职权调阅，免于登记。
 * 三档送法：send 让它们送 / self 自己送 / seal 申请封缄。
 */
export interface TransitRecord {
  /** 学期号 */
  semester: number;
  /** 通知那一天 */
  day: number;
  /** 送法三档 */
  pick?: "send" | "self" | "seal";
}

/**
 * 被读记录（批次 CY）：档案被调阅一次，知会单按规定不应当存在——有蛙违反流程通知了你。
 * 三档处理：ack 签收回执 / seek 申请查明 / hold 装作没看见。
 */
export interface BereadRecord {
  /** 学期号 */
  semester: number;
  /** 知会那一天 */
  day: number;
  /** 处理三档 */
  pick?: "ack" | "seek" | "hold";
}

/**
 * 便条记录（批次 CZ）：信格里一张没编号的手写纸——违反流程的那只蛙，第二次出手。
 * 三档处理：reply 回一张 / keep 收着不回 / watch 去蹲信格。
 */
export interface NoteRecord {
  /** 学期号 */
  semester: number;
  /** 收到那一天 */
  day: number;
  /** 处理三档 */
  pick?: "reply" | "keep" | "watch";
}

/**
 * 定稿记录（批次 DA）：交班前的学期清点——表上列着这学期发生在你身上的每一件事。
 * 三档处理：sign 逐行签字（定稿）/ dispute 指出一处（更正顺延）/ refuse 拒签（待定稿）。
 */
export interface FinalizeRecord {
  /** 学期号 */
  semester: number;
  /** 清点那一天 */
  day: number;
  /** 处理三档 */
  pick?: "sign" | "dispute" | "refuse";
}

/**
 * 销毁记录（批次 DB）：作废文书按清册焚化——焚化室的门上没有编号。
 * 三档处理：burn 照单焚化 / keep 申请留存 / copy 抄一遍再焚化。
 */
export interface DestructionRecord {
  /** 学期号 */
  semester: number;
  /** 张贴那一天 */
  day: number;
  /** 处理三档 */
  pick?: "burn" | "keep" | "copy";
}

/** 销毁记录清洗（批次 DB）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeDestructionLog(raw: unknown): DestructionRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: DestructionRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "burn" && o.pick !== "keep" && o.pick !== "copy") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as DestructionRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 权利记录（批次 DC）：新学期的卷宗里夹着一页《当事人权利告知书》。
 * 三档处理：ack 签收 / exercise 行使（申请查阅本人卷宗）/ decline 不签。
 */
export interface RightsRecord {
  /** 学期号 */
  semester: number;
  /** 发现那一天 */
  day: number;
  /** 处理三档 */
  pick?: "ack" | "exercise" | "decline";
}

/** 权利记录清洗（批次 DC）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeRightsLog(raw: unknown): RightsRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: RightsRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "ack" && o.pick !== "exercise" && o.pick !== "decline") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as RightsRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 对账记录（批次 DD）：台账日逐项核对——对账不通报当事人。
 * 三档处理：attend 到场（亲眼看补记）/ question 问一句（当面否认一行）/ absent 不到场（后来听说）。
 */
export interface ReconciliationRecord {
  /** 学期号 */
  semester: number;
  /** 张贴那一天 */
  day: number;
  /** 处理三档 */
  pick?: "attend" | "question" | "absent";
}

/** 对账记录清洗（批次 DD）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeReconciliationLog(raw: unknown): ReconciliationRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ReconciliationRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "attend" && o.pick !== "question" && o.pick !== "absent") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as ReconciliationRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 自记记录（批次 DE）：当事人自行补记本人名下事项——四栏照办或自设一格。
 * 三档处理：filed 照格式记（给它一个自记号）/ retained 不照格式记（退回）/ blank 不记（编外）。
 */
export interface SelfEntryRecord {
  /** 学期号 */
  semester: number;
  /** 领表那一天 */
  day: number;
  /** 处理三档 */
  pick?: "filed" | "retained" | "blank";
}

/** 自记记录清洗（批次 DE）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeSelfEntryLog(raw: unknown): SelfEntryRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: SelfEntryRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "filed" && o.pick !== "retained" && o.pick !== "blank") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as SelfEntryRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 催办记录（批次 DF）：挂账满一学期的事项，启动催办——时限是这件事不再等你的时候。
 * 三档处理：settle 办结（销账）/ extend 申请延期（挂账时长重新计）/ lose 逾期挂失（转入《失物清单》）。
 */
export interface OverdueRecord {
  /** 学期号 */
  semester: number;
  /** 递单那一天 */
  day: number;
  /** 处理三档 */
  pick?: "settle" | "extend" | "lose";
}

/** 催办记录清洗（批次 DF）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeOverdueLog(raw: unknown): OverdueRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: OverdueRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "settle" && o.pick !== "extend" && o.pick !== "lose") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as OverdueRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 申报记录（批次 DG）：个人物品申报——申报自愿，内容按当事人自述计，不再另行核验。
 * 三档处理：full 全报（抽屉在册）/ short 少报一样（缺报视同无此物）/ empty 空报（死角）。
 */
export interface DeclarationRecord {
  /** 学期号 */
  semester: number;
  /** 张贴那一天 */
  day: number;
  /** 处理三档 */
  pick?: "full" | "short" | "empty";
}

/** 申报记录清洗（批次 DG）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeDeclarationLog(raw: unknown): DeclarationRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: DeclarationRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "full" && o.pick !== "short" && o.pick !== "empty") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as DeclarationRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 开放日记录（批次 DH）：档案开放日——全宗向全体在册蛙开放，免于登记，免于通报。
 * 三档处理：self 查本宗 / others 查摘要（翻别蛙的）/ away 不去。
 */
export interface OpenDayRecord {
  /** 学期号 */
  semester: number;
  /** 张贴那一天 */
  day: number;
  /** 处理三档 */
  pick?: "self" | "others" | "away";
}

/** 开放日记录清洗（批次 DH）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeOpenDayLog(raw: unknown): OpenDayRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: OpenDayRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "self" && o.pick !== "others" && o.pick !== "away") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as OpenDayRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 顶班记录（批次 DI）：替别的蛙值班一日——办的事记在它的名下，你的名字不进档案。
 * 三档处理：serve 照办（档案上一天是空白）/ sign 留名（页边写自己的名字）/ refuse 不顶。
 */
export interface SubstituteRecord {
  /** 学期号 */
  semester: number;
  /** 求顶那一天 */
  day: number;
  /** 处理三档 */
  pick?: "serve" | "sign" | "refuse";
}

/** 顶班记录清洗（批次 DI）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeSubstituteLog(raw: unknown): SubstituteRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: SubstituteRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "serve" && o.pick !== "sign" && o.pick !== "refuse") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as SubstituteRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 页边记录（批次 DJ）：规程之外的页边批注——有蛙留了一个字。
 * 三档处理：ack 回一个字 / leave 不动它（页边在长）/ cross 划掉（划痕比字迹重）。
 */
export interface PageNoteRecord {
  /** 学期号 */
  semester: number;
  /** 发现那一天 */
  day: number;
  /** 处理三档 */
  pick?: "ack" | "leave" | "cross";
}

/** 页边记录清洗（批次 DJ）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizePageNoteLog(raw: unknown): PageNoteRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: PageNoteRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "ack" && o.pick !== "leave" && o.pick !== "cross") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as PageNoteRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 记性记录（批次 DK）：记性核对——把你的记性跟档案对一遍，对不上的记入差异栏。
 * 三档处理：all 照实核（差异入卷）/ one 只说一件（空栏留置）/ none 不核（记性归属不变）。
 */
export interface MemoryRecord {
  /** 学期号 */
  semester: number;
  /** 张贴那一天 */
  day: number;
  /** 处理三档 */
  pick?: "all" | "one" | "none";
}

/** 记性记录清洗（批次 DK）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeMemoryLog(raw: unknown): MemoryRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "all" && o.pick !== "one" && o.pick !== "none") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as MemoryRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 登记记录（批次 DL）：非在册文书登记簿——它不收纸，只记「有纸在它不知道的地方」。
 * 三档处理：claim 认领（签那一行）/ leave 不认领（空行按无主计）/ copy 抄进抽屉（抽屉有了目录）。
 */
export interface UnregisteredRecord {
  /** 学期号 */
  semester: number;
  /** 张贴那一天 */
  day: number;
  /** 处理三档 */
  pick?: "claim" | "leave" | "copy";
}

/** 登记记录清洗（批次 DL）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeUnregisteredLog(raw: unknown): UnregisteredRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: UnregisteredRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "claim" && o.pick !== "leave" && o.pick !== "copy") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as UnregisteredRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 扉页记录（批次 DM）：卷宗封二的一行字——制度自己写在它没占的地方。
 * 三档处理：read 照读（接受了它的话）/ fold 折起来（折痕替你答了）/ tear 撕掉（撕掉本身进了档案）。
 */
export interface FlyleafRecord {
  /** 学期号 */
  semester: number;
  /** 换封那一天 */
  day: number;
  /** 处理三档 */
  pick?: "read" | "fold" | "tear";
}

/** 扉页记录清洗（批次 DM）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeFlyleafLog(raw: unknown): FlyleafRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: FlyleafRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "read" && o.pick !== "fold" && o.pick !== "tear") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as FlyleafRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 认领记录（批次 DN）：失物认领——制度不查找，只等认领人发起。
 * 三档处理：return 领回（原清单行划销）/ keep 不领（从「找不到」变成「不要了」）/ wait 让它们找（查找义务不予启动）。
 */
export interface ClaimRecord {
  /** 学期号 */
  semester: number;
  /** 张贴那一天 */
  day: number;
  /** 处理三档 */
  pick?: "return" | "keep" | "wait";
}

/** 认领记录清洗（批次 DN）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeClaimLog(raw: unknown): ClaimRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ClaimRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "return" && o.pick !== "keep" && o.pick !== "wait") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as ClaimRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 联名记录（批次 DO）：联名说明——两个名字落在同一页纸上。
 * 三档处理：sign 签（空缺变成两个名字）/ hold 不签（空栏留置）/ edit 改一处（它写的说明用你的话归档）。
 */
export interface JointRecord {
  /** 学期号 */
  semester: number;
  /** 递单那一天 */
  day: number;
  /** 处理三档 */
  pick?: "sign" | "hold" | "edit";
}

/** 联名记录清洗（批次 DO）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeJointLog(raw: unknown): JointRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: JointRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "sign" && o.pick !== "hold" && o.pick !== "edit") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as JointRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 互通记录（批次 DP）：信格通道——不编号、不登记、不归档。
 * 三档处理：both 双向开通（两个口）/ closed 不通（一个口）/ oneway 单向开通（反向口留置）。
 */
export interface LetterBoxRecord {
  /** 学期号 */
  semester: number;
  /** 递单那一天 */
  day: number;
  /** 处理三档 */
  pick?: "both" | "closed" | "oneway";
}

/** 互通记录清洗（批次 DP）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeLetterBoxLog(raw: unknown): LetterBoxRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: LetterBoxRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "both" && o.pick !== "closed" && o.pick !== "oneway") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as LetterBoxRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 命名记录（批次 DQ）：当事人自命名——它不核验、不解释、不改。
 * 三档处理：give 起一个（它第一次收下不懂意思的名字）/ hold 不起（空栏等）/ code 起一个像编号的（用它的格式藏你的话）。
 */
export interface NamingRecord {
  /** 学期号 */
  semester: number;
  /** 张贴那一天 */
  day: number;
  /** 处理三档 */
  pick?: "give" | "hold" | "code";
}

/** 命名记录清洗（批次 DQ）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeNamingLog(raw: unknown): NamingRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: NamingRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "give" && o.pick !== "hold" && o.pick !== "code") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as NamingRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 同名记录（批次 DR）：简称重名——同一个词有两个使用者，两个意思。
 * 三档处理：keep 认下（两个意思共用一个词）/ give 让给它（一个词只属于一只蛙）/ change 换个名（原词归它，新词归你）。
 */
export interface SameNameRecord {
  /** 学期号 */
  semester: number;
  /** 发现那一天 */
  day: number;
  /** 处理三档 */
  pick?: "keep" | "give" | "change";
}

/** 同名记录清洗（批次 DR）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeSameNameLog(raw: unknown): SameNameRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: SameNameRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "keep" && o.pick !== "give" && o.pick !== "change") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as SameNameRecord["pick"],
    });
  }
  return out.slice(-6);
}

/**
 * 总目记录（批次 DS）：学期末编非在册事项总目——总目只陈列，不处置。
 * 三档处理：bind 装订（随册陈列）/ extract 抽走一页（缺页视同编外）/ loose 不装订（散页退还）。
 */
export interface CatalogRecord {
  /** 学期号 */
  semester: number;
  /** 编目那一天 */
  day: number;
  /** 处理三档 */
  pick?: "bind" | "extract" | "loose";
}

/** 总目记录清洗（批次 DS）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeCatalogLog(raw: unknown): CatalogRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "bind" && o.pick !== "extract" && o.pick !== "loose") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as CatalogRecord["pick"],
    });
  }
  return out.slice(-6);
}

/** 本学期的总目记录（批次 DS） */
export function catalogThisSemesterOf(save: GameSaveData): CatalogRecord | undefined {
  return (save.catalogLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 总目落档（批次 DS）：学期末编目一次。每学期最多一次 */
export function markCatalog(day: number): void {
  const save = loadGameSave();
  if (catalogThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    catalogLog: [...(save.catalogLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DS）：装订 / 抽走一页 / 不装订。
 * 装订：被注意 +1（总目陈列而不处置）；抽走一页：被注意 +2（总目比别册薄了一页）；
 * 不装订：沉默 +1（散页要你自己收）。
 */
export function respondCatalog(pick: "bind" | "extract" | "loose"): void {
  const save = loadGameSave();
  const log = save.catalogLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    catalogLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "bind") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "extract") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/**
 * 结转记录（批次 DT）：学期移交——在册事项随卷宗结转，非在册事项由当事人定。
 * 三档处理：follow 照单（该结转的结转）/ pocket 全带走（新学期从零起算）/ surrender 全交出（编外宇宙进制度）。
 */
export interface CarryoverRecord {
  /** 学期号 */
  semester: number;
  /** 递单那一天 */
  day: number;
  /** 处理三档 */
  pick?: "follow" | "pocket" | "surrender";
}

/** 结转记录清洗（批次 DT）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeCarryoverRecord(raw: unknown): CarryoverRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: CarryoverRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "follow" && o.pick !== "pocket" && o.pick !== "surrender") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as CarryoverRecord["pick"],
    });
  }
  return out.slice(-6);
}

/** 本学期的结转记录（批次 DT） */
export function carryoverThisSemesterOf(save: GameSaveData): CarryoverRecord | undefined {
  return (save.carryoverLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 结转落档（批次 DT）：学期末移交一次。每学期最多一次 */
export function markCarryover(day: number): void {
  const save = loadGameSave();
  if (carryoverThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    carryoverLog: [...(save.carryoverLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DT）：照单 / 全带走 / 全交出。
 * 照单：被注意 +1（两样都办完了）；全带走：被注意 +2（抽屉装的是一整个学期的下落）；
 * 全交出：沉默 +1（这栋楼第一次完整地拥有了你名下的一切）。
 */
export function respondCarryover(pick: "follow" | "pocket" | "surrender"): void {
  const save = loadGameSave();
  const log = save.carryoverLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    carryoverLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "follow") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "pocket") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/**
 * 留白记录（批次 DU）：卷宗末页留白——留给下一学期的一页。
 * 三档处理：keep 照留（这一页等着但不催）/ write 写一句（唯一一句不是它说的话）/ tuck 夹一张纸（同一页两种读法）。
 */
export interface BlankRecord {
  /** 学期号 */
  semester: number;
  /** 发现那一天 */
  day: number;
  /** 处理三档 */
  pick?: "keep" | "write" | "tuck";
}

/** 留白记录清洗（批次 DU）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeBlankRecord(raw: unknown): BlankRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: BlankRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "keep" && o.pick !== "write" && o.pick !== "tuck") continue;
    out.push({
      semester: o.semester,
      day: o.day,
      pick: o.pick as BlankRecord["pick"],
    });
  }
  return out.slice(-6);
}

/** 本学期的留白记录（批次 DU） */
export function blankThisSemesterOf(save: GameSaveData): BlankRecord | undefined {
  return (save.blankLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 留白落档（批次 DU）：新学期开学翻卷宗时来。每学期最多一次 */
export function markBlank(day: number): void {
  const save = loadGameSave();
  if (blankThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    blankLog: [...(save.blankLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DU）：照留 / 写一句 / 夹一张纸。
 * 照留：被注意 +1（白的意思是「还没有」）；写一句：被注意 +2（它是这册卷宗里唯一一句不是它说的话）；
 * 夹一张纸：沉默 +1（制度翻到那一页看见的是留白，你翻到那一页看见的是你的纸）。
 */
export function respondBlank(pick: "keep" | "write" | "tuck"): void {
  const save = loadGameSave();
  const log = save.blankLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    blankLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "keep") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "write") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 交班记录清洗（批次 CP）：学期/日期 ≥1、回应三档；上限六份 */
function sanitizeShiftHandoverLog(raw: unknown): ShiftHandoverRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ShiftHandoverRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.response !== undefined && o.response !== "sign" && o.response !== "omit" && o.response !== "extra") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      response: o.response as ShiftHandoverRecord["response"],
      items: typeof o.items === "number" && o.items >= 0 ? Math.round(o.items) : undefined,
    });
  }
  return out.slice(-6);
}

/** 本学期交过班没有（批次 CP；没有返回 undefined） */
export function shiftHandoverThisSemesterOf(save: GameSaveData): ShiftHandoverRecord | undefined {
  return (save.shiftHandoverLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 这学期经办的事项数（批次 CP）：值班 + 会议 + 报告 + 递件 + 地下托付，从既有日志派生 */
export function shiftItemsOf(save: GameSaveData): number {
  return (
    (save.doorDutyLog ?? []).length +
    (save.meetings ?? []).length +
    (save.reportLog ?? []).length +
    (save.courierLog ?? []).length +
    (save.undergroundJobs ?? []).length
  );
}

/** 交班落档（批次 CP）：学期最后一天，门要交了。每学期最多一次 */
export function markShiftHandover(day: number): void {
  const save = loadGameSave();
  if (shiftHandoverThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    shiftHandoverLog: [...(save.shiftHandoverLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 回应落档（批次 CP）：照单交 / 少交一项 / 多交一项——没有正确的选择。
 * 照单交：被注意 +1（交清楚的好经办，被记了一笔好）；少交一项：沉默 +1（缺的那一项归你管）；
 * 多交一项：被注意 +2（主动申报——它们最记这个）。
 */
export function respondShiftHandover(response: "sign" | "omit" | "extra", items: number): void {
  const save = loadGameSave();
  const log = save.shiftHandoverLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    shiftHandoverLog: log.map((item, i) => (i === index ? { ...item, response, items } : item)),
  });
  if (response === "sign") {
    const fresh = loadGameSave();
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (response === "omit") {
    const fresh = loadGameSave();
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  } else {
    const fresh = loadGameSave();
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  }
}

/* ---------- 回单（批次 CQ）：你签过的单子，回来了 ---------- */

/** 回单记录清洗（批次 CQ）：学期/日期 ≥1、事由三档、应对三档；上限六份 */
function sanitizeTestimonyLog(raw: unknown): TestimonyRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: TestimonyRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.about !== "sign" && o.about !== "omit" && o.about !== "extra") continue;
    if (o.response !== undefined && o.response !== "confirm" && o.response !== "point" && o.response !== "smooth") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      about: o.about,
      response: o.response as TestimonyRecord["response"],
    });
  }
  return out.slice(-6);
}

/** 最近一份有回应的交班记录（批次 CQ）：回单的事由按它派生；没有返回 undefined */
export function latestRespondedShiftOf(save: GameSaveData): ShiftHandoverRecord | undefined {
  const log = save.shiftHandoverLog ?? [];
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const item = log[i];
    if (item && item.response) return item;
  }
  return undefined;
}

/** 本学期被叫回去核对过没有（批次 CQ；没有返回 undefined） */
export function testimonyThisSemesterOf(save: GameSaveData): TestimonyRecord | undefined {
  return (save.testimonyLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 回单落档（批次 CQ）：单子被退回来了。每学期最多一次 */
export function markTestimony(day: number, about: ShiftResponse): void {
  const save = loadGameSave();
  if (testimonyThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    testimonyLog: [...(save.testimonyLog ?? []), { semester: save.playthrough, day, about }].slice(-6),
  });
}

/**
 * 应对落档（批次 CQ）：照认 / 指单 / 补圆——没有正确的，只有你交出去的版本。
 * 照认：被注意 +1（纰漏落到你名下，纸面上从此有了着落）；指单：沉默 +1（话停在单子上）；
 * 补圆：被注意 +2（当场圆一个说法——它们最记会把纸面写平的）。
 */
export function respondTestimony(response: "confirm" | "point" | "smooth"): void {
  const save = loadGameSave();
  const log = save.testimonyLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    testimonyLog: log.map((item, i) => (i === index ? { ...item, response } : item)),
  });
  const fresh = loadGameSave();
  if (response === "confirm") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (response === "point") {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  } else {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  }
}

/* ---------- 接任（批次 CR）：接办人那一栏，归你管了 ---------- */

/** 接任记录清洗（批次 CR）：学期/日期 ≥1、填法三档；上限六份 */
function sanitizeSuccessionLog(raw: unknown): SuccessionRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: SuccessionRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "name" && o.pick !== "blank" && o.pick !== "self") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      pick: o.pick as SuccessionRecord["pick"],
      frog: typeof o.frog === "string" && o.frog.length > 0 ? o.frog : undefined,
    });
  }
  return out.slice(-6);
}

/** 本学期登记过接办人没有（批次 CR；没有返回 undefined） */
export function successionThisSemesterOf(save: GameSaveData): SuccessionRecord | undefined {
  return (save.successionLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 交过班没有（批次 CR）：接办人登记只在交过之后才轮得到 */
export function hasShiftRecordOf(save: GameSaveData): boolean {
  return (save.shiftHandoverLog ?? []).length > 0;
}

/** 接办人落档（批次 CR）：空栏退回来了。每学期最多一次 */
export function markSuccession(day: number): void {
  const save = loadGameSave();
  if (successionThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    successionLog: [...(save.successionLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 填法落档（批次 CR）：填名 / 交系统 / 填自己——没有正确的，只有栏里最后是谁。
 * 填名：被注意 +1（你第一次决定让谁被处理）；交系统：沉默 +1（空栏让制度填）；
 * 填自己：被注意 +2（交出去的班自己接回来——它们最记主动担任）。
 */
export function respondSuccession(pick: "name" | "blank" | "self", frog?: string): void {
  const save = loadGameSave();
  const log = save.successionLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    successionLog: log.map((item, i) => (i === index ? { ...item, pick, frog } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "name") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "blank") {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  } else {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  }
}

/* ---------- 误投（批次 CS）：这张纸上写什么，取决于投递的那半秒 ---------- */

/** 误投记录清洗（批次 CS）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeMisdeliveryLog(raw: unknown): MisdeliveryRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: MisdeliveryRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "correct" && o.pick !== "carry" && o.pick !== "return") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      pick: o.pick as MisdeliveryRecord["pick"],
    });
  }
  return out.slice(-6);
}

/** 本学期收错过决定书没有（批次 CS；没有返回 undefined） */
export function misdeliveryThisSemesterOf(save: GameSaveData): MisdeliveryRecord | undefined {
  return (save.misdeliveryLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 误投落档（批次 CS）：决定书进了你的信格。每学期最多一次 */
export function markMisdelivery(day: number): void {
  const save = loadGameSave();
  if (misdeliveryThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    misdeliveryLog: [...(save.misdeliveryLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 CS）：去更正 / 不吭声 / 原样退回。
 * 去更正：被注意 +2（主动申报错误，还得签收「已阅」——它们最记主动申报）；
 * 不吭声：沉默 +1（处分记你名下，说不出口的又多一件）；原样退回：被注意 +1（退回也是收发动作，收发要留痕）。
 */
export function respondMisdelivery(pick: "correct" | "carry" | "return"): void {
  const save = loadGameSave();
  const log = save.misdeliveryLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    misdeliveryLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "correct") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else if (pick === "carry") {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  } else {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  }
}

/* ---------- 补页（批次 CT）：档案也会丢东西。丢了之后，它来找你 ---------- */

/** 补页记录清洗（批次 CT）：学期/日期 ≥1、补法三档；上限六份 */
function sanitizeLostPageLog(raw: unknown): LostPageRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: LostPageRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "faithful" && o.pick !== "sparse" && o.pick !== "extra") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      pick: o.pick as LostPageRecord["pick"],
    });
  }
  return out.slice(-6);
}

/** 本学期补述过没有（批次 CT；没有返回 undefined） */
export function lostPageThisSemesterOf(save: GameSaveData): LostPageRecord | undefined {
  return (save.lostPageLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 补页落档（批次 CT）：档案室的蛙第一次离开柜台。每学期最多一次 */
export function markLostPage(day: number): void {
  const save = loadGameSave();
  if (lostPageThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    lostPageLog: [...(save.lostPageLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 补法落档（批次 CT）：照实补述 / 少说一点 / 多写一点。
 * 照实：被注意 +1（你的记性有了编号）；少说：沉默 +1（缺的那部分归你一个人管）；
 * 多写：被注意 +2（往档案里塞一件它没记过的事——写上去的，就是发生过的）。
 */
export function respondLostPage(pick: "faithful" | "sparse" | "extra"): void {
  const save = loadGameSave();
  const log = save.lostPageLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    lostPageLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "faithful") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "sparse") {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  } else {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  }
}

/* ---------- 合档（批次 CV）：一宗，两个名字 ---------- */

/** 合档记录清洗（批次 CV）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeMergerLog(raw: unknown): MergerRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: MergerRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "split" && o.pick !== "carry" && o.pick !== "meet") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      pick: o.pick as MergerRecord["pick"],
      frog: typeof o.frog === "string" && o.frog.length > 0 ? o.frog : undefined,
    });
  }
  return out.slice(-6);
}

/** 本学期被合过宗没有（批次 CV；没有返回 undefined） */
export function mergerThisSemesterOf(save: GameSaveData): MergerRecord | undefined {
  return (save.mergerLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 合档落档（批次 CV）：既成事实，先登记再说。每学期最多一次 */
export function markMerger(day: number): void {
  const save = loadGameSave();
  if (mergerThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    mergerLog: [...(save.mergerLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 CV）：拆卷 / 不管它 / 去认识它。
 * 拆卷：被注意 +1（你提交了申请，档案上多一行合宗历史）；不管它：沉默 +1（混排继续，
 * 你们是这栋楼里离得最近的陌生蛙）；去认识它：被注意 +2（主动接触——它们最记主动申报，
 * 而且你们见面聊的事现在都有编号了）。
 */
export function respondMerger(pick: "split" | "carry" | "meet", frog?: string): void {
  const save = loadGameSave();
  const log = save.mergerLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    mergerLog: log.map((item, i) => (i === index ? { ...item, pick, frog } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "split") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "carry") {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  } else {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  }
}

/* ---------- 转递（批次 CW）：你的纸出过一次门 ---------- */

/** 转递记录清洗（批次 CW）：学期/日期 ≥1、送法三档；上限六份 */
function sanitizeTransitLog(raw: unknown): TransitRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: TransitRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "send" && o.pick !== "self" && o.pick !== "seal") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      pick: o.pick as TransitRecord["pick"],
    });
  }
  return out.slice(-6);
}

/** 本学期转过没有（批次 CW；没有返回 undefined） */
export function transitThisSemesterOf(save: GameSaveData): TransitRecord | undefined {
  return (save.transitLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 转递落档（批次 CW）：卷宗点名离柜。每学期最多一次 */
export function markTransit(day: number): void {
  const save = loadGameSave();
  if (transitThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    transitLog: [...(save.transitLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 送法落档（批次 CW）：让它们送 / 自己送 / 申请封缄。
 * 让它们送：被注意 +1（合规放行，回执附卷）；自己送：被注意 +2（全校园都看见你抱着自己的档案，
 * 它们最记本人押送）；申请封缄：沉默 +1（你把「不许看」说得很轻——轻到只有封条听见）。
 */
export function respondTransit(pick: "send" | "self" | "seal"): void {
  const save = loadGameSave();
  const log = save.transitLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    transitLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "send") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "self") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/* ---------- 被读（批次 CY）：有人读了你的档案 ---------- */

/** 被读记录清洗（批次 CY）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeBereadLog(raw: unknown): BereadRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: BereadRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "ack" && o.pick !== "seek" && o.pick !== "hold") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      pick: o.pick as BereadRecord["pick"],
    });
  }
  return out.slice(-6);
}

/** 本学期被知会过没有（批次 CY；没有返回 undefined） */
export function bereadThisSemesterOf(save: GameSaveData): BereadRecord | undefined {
  return (save.bereadLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 知会落档（批次 CY）：那张不该存在的单子到了。每学期最多一次 */
export function markBeread(day: number): void {
  const save = loadGameSave();
  if (bereadThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    bereadLog: [...(save.bereadLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 CY）：签收回执 / 申请查明 / 装作没看见。
 * 签收：被注意 +1（签收也是配合，被记一笔「已知悉」）；申请查明：被注意 +2
 * （追查本身就是一次更深的被读——它们最记追查）；装作没看见：沉默 +1（最轻的动作，最响的落抽屉声）。
 */
export function respondBeread(pick: "ack" | "seek" | "hold"): void {
  const save = loadGameSave();
  const log = save.bereadLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    bereadLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "ack") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "seek") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/* ---------- 便条（批次 CZ）：一张没编号的纸 ---------- */

/** 便条记录清洗（批次 CZ）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeNoteLog(raw: unknown): NoteRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "reply" && o.pick !== "keep" && o.pick !== "watch") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      pick: o.pick as NoteRecord["pick"],
    });
  }
  return out.slice(-6);
}

/** 本学期收过便条没有（批次 CZ；没有返回 undefined） */
export function noteThisSemesterOf(save: GameSaveData): NoteRecord | undefined {
  return (save.noteLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 被知会过没有（批次 CZ）：便条只在被读之后才来 */
export function hasBereadOf(save: GameSaveData): boolean {
  return (save.bereadLog ?? []).length > 0;
}

/** 便条落档（批次 CZ）：信格里有张手写的纸。每学期最多一次 */
export function markNote(day: number): void {
  const save = loadGameSave();
  if (noteThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    noteLog: [...(save.noteLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 CZ）：回一张 / 收着不回 / 去蹲信格。
 * 回一张：被注意 +1（你先违反的——最轻的一种违反）；收着不回：沉默 +1
 * （把它保持在它最好的形状里）；去蹲信格：被注意 +2（你们互相知道对方长什么样了——它们最记这种）。
 */
export function respondNote(pick: "reply" | "keep" | "watch"): void {
  const save = loadGameSave();
  const log = save.noteLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    noteLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "reply") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "keep") {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  } else {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  }
}

/* ---------- 定稿（批次 DA）：签了字，这一学期就是定稿 ---------- */

/** 定稿记录清洗（批次 DA）：学期/日期 ≥1、处理三档；上限六份 */
function sanitizeFinalizeLog(raw: unknown): FinalizeRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: FinalizeRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.pick !== undefined && o.pick !== "sign" && o.pick !== "dispute" && o.pick !== "refuse") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      pick: o.pick as FinalizeRecord["pick"],
    });
  }
  return out.slice(-6);
}

/** 本学期清点过没有（批次 DA；没有返回 undefined） */
export function finalizeThisSemesterOf(save: GameSaveData): FinalizeRecord | undefined {
  return (save.finalizeLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 清点落档（批次 DA）：交班前的例行手续。每学期最多一次 */
export function markFinalize(day: number): void {
  const save = loadGameSave();
  if (finalizeThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    finalizeLog: [...(save.finalizeLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DA）：逐行签字 / 指出一处 / 拒签。
 * 签字：被注意 +1（确认了「过去」这种手续）；指出一处：被注意 +2（你要回一个字，
 * 整张表重走一遍——它们最记这种较真）；拒签：沉默 +1（悬着的学期不结转，它归你）。
 */
export function respondFinalize(pick: "sign" | "dispute" | "refuse"): void {
  const save = loadGameSave();
  const log = save.finalizeLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    finalizeLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "sign") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "dispute") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的销毁记录（批次 DB） */
export function destructionThisSemesterOf(save: GameSaveData): DestructionRecord | undefined {
  return (save.destructionLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 销毁落档（批次 DB）：定稿后的例行手续。每学期最多一次 */
export function markDestruction(day: number): void {
  const save = loadGameSave();
  if (destructionThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    destructionLog: [...(save.destructionLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DB）：照单焚化 / 申请留存 / 抄一遍再焚化。
 * 照单焚化：被注意 +1（它知道你在看，你也知道它知道）；申请留存：被注意 +2（救下一页纸，
 * 用的是给它重新编号）；抄一遍再焚化：沉默 +1（抽屉里现在有两张没有编号的纸）。
 */
export function respondDestruction(pick: "burn" | "keep" | "copy"): void {
  const save = loadGameSave();
  const log = save.destructionLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    destructionLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "burn") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "keep") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的权利记录（批次 DC） */
export function rightsThisSemesterOf(save: GameSaveData): RightsRecord | undefined {
  return (save.rightsLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 权利落档（批次 DC）：告知书随卷宗来。每学期最多一次 */
export function markRights(day: number): void {
  const save = loadGameSave();
  if (rightsThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    rightsLog: [...(save.rightsLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DC）：签收 / 行使 / 不签。
 * 签收：被注意 +1（它把你有什么写在了纸上，然后把那张纸收进了柜子）；
 * 行使：被注意 +2（你查阅了自己，也多了一页被查的记录）；
 * 不签：沉默 +1（你用沉默权的方式是没签那张写着你有沉默权的纸）。
 */
export function respondRights(pick: "ack" | "exercise" | "decline"): void {
  const save = loadGameSave();
  const log = save.rightsLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    rightsLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "ack") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "exercise") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的对账记录（批次 DD） */
export function reconciliationThisSemesterOf(save: GameSaveData): ReconciliationRecord | undefined {
  return (save.reconciliationLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 对账落档（批次 DD）：台账日例行手续。每学期最多一次 */
export function markReconciliation(day: number): void {
  const save = loadGameSave();
  if (reconciliationThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    reconciliationLog: [...(save.reconciliationLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DD）：到场 / 问一句 / 不到场。
 * 到场：被注意 +1（它知道你在看，你也知道它知道）；问一句：被注意 +2（否认过比存在过更重）；
 * 不到场：沉默 +1（不知道，是这栋楼里唯一不会进档案的东西）。
 */
export function respondReconciliation(pick: "attend" | "question" | "absent"): void {
  const save = loadGameSave();
  const log = save.reconciliationLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    reconciliationLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "attend") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "question") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的自记记录（批次 DE） */
export function selfEntryThisSemesterOf(save: GameSaveData): SelfEntryRecord | undefined {
  return (save.selfEntryLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 自记落档（批次 DE）：补记规程的申请窗口。每学期最多一次 */
export function markSelfEntry(day: number): void {
  const save = loadGameSave();
  if (selfEntryThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    selfEntryLog: [...(save.selfEntryLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DE）：照格式记 / 不照格式记 / 不记。
 * 照格式记：被注意 +1（你想让它存在，就必得让它可以被看见）；
 * 不照格式记：被注意 +2（这栋楼不听不合格式的话，但话在纸也在）；
 * 不记：沉默 +1（编号是它们给纸的资格，那张纸不要这个资格）。
 */
export function respondSelfEntry(pick: "filed" | "retained" | "blank"): void {
  const save = loadGameSave();
  const log = save.selfEntryLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    selfEntryLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "filed") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "retained") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的催办记录（批次 DF） */
export function overdueThisSemesterOf(save: GameSaveData): OverdueRecord | undefined {
  return (save.overdueLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 催办落档（批次 DF）：挂账满一学期例行启动。每学期最多一次 */
export function markOverdue(day: number): void {
  const save = loadGameSave();
  if (overdueThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    overdueLog: [...(save.overdueLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DF）：办结 / 申请延期 / 逾期挂失。
 * 办结：被注意 +1（销账之后跟没挂过一样，区别只有你记得）；
 * 申请延期：被注意 +2（它不问为什么，它只问还要等多久）；
 * 逾期挂失：沉默 +1（失物不添麻烦——它们只是不在，但你还在）。
 */
export function respondOverdue(pick: "settle" | "extend" | "lose"): void {
  const save = loadGameSave();
  const log = save.overdueLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    overdueLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "settle") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "extend") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的申报记录（批次 DG） */
export function declarationThisSemesterOf(save: GameSaveData): DeclarationRecord | undefined {
  return (save.declarationLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 申报落档（批次 DG）：本学期一次的自愿手续。每学期最多一次 */
export function markDeclaration(day: number): void {
  const save = loadGameSave();
  if (declarationThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    declarationLog: [...(save.declarationLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DG）：全报 / 少报一样 / 空报。
 * 全报：被注意 +1（记下跟拿走是两种效力，它们只登记第一种）；
 * 少报一样：被注意 +2（视同无此物——制度替你把「有它」取消了）；
 * 空报：沉默 +1（死角不在它们的世界里）。
 */
export function respondDeclaration(pick: "full" | "short" | "empty"): void {
  const save = loadGameSave();
  const log = save.declarationLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    declarationLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "full") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "short") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的开放日记录（批次 DH） */
export function openDayThisSemesterOf(save: GameSaveData): OpenDayRecord | undefined {
  return (save.openDayLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 开放日落档（批次 DH）：本学期一次的全宗开放。每学期最多一次 */
export function markOpenDay(day: number): void {
  const save = loadGameSave();
  if (openDayThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    openDayLog: [...(save.openDayLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DH）：查本宗 / 查摘要 / 不去。
 * 查本宗：被注意 +1（在别人看你之前，你知道你会被看到什么）；
 * 查摘要：被注意 +2（那一页被翻得比别的页旧）；
 * 不去：沉默 +1（不进也是一种记录——它记在你身上，不记在档案里）。
 */
export function respondOpenDay(pick: "self" | "others" | "away"): void {
  const save = loadGameSave();
  const log = save.openDayLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    openDayLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "self") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "others") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的顶班记录（批次 DI） */
export function substituteThisSemesterOf(save: GameSaveData): SubstituteRecord | undefined {
  return (save.substituteLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 顶班落档（批次 DI）：代班委托单。每学期最多一次 */
export function markSubstitute(day: number): void {
  const save = loadGameSave();
  if (substituteThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    substituteLog: [...(save.substituteLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DI）：照办 / 留名 / 不顶。
 * 照办：被注意 +1（你办过，但没有人能证明）；留名：被注意 +2（页边那行不算数，但谁也擦不掉）；
 * 不顶：沉默 +1（档案上没有这一眼，但你有）。
 */
export function respondSubstitute(pick: "serve" | "sign" | "refuse"): void {
  const save = loadGameSave();
  const log = save.substituteLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    substituteLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "serve") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "sign") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的页边记录（批次 DJ） */
export function pageNoteThisSemesterOf(save: GameSaveData): PageNoteRecord | undefined {
  return (save.pageNoteLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 页边落档（批次 DJ）：例行核对时发现。每学期最多一次 */
export function markPageNote(day: number): void {
  const save = loadGameSave();
  if (pageNoteThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    pageNoteLog: [...(save.pageNoteLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DJ）：回一个字 / 不动它 / 划掉。
 * 回一个字：被注意 +1（两个都留了字的页边）；不动它：沉默 +1（这栋楼里有人记得那一天）；
 * 划掉：被注意 +2（划痕也是一种留名——它证明你读过）。
 */
export function respondPageNote(pick: "ack" | "leave" | "cross"): void {
  const save = loadGameSave();
  const log = save.pageNoteLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    pageNoteLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "ack") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "cross") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的记性核对记录（批次 DK） */
export function memoryThisSemesterOf(save: GameSaveData): MemoryRecord | undefined {
  return (save.memoryLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 记性核对落档（批次 DK）：本学期一次。每学期最多一次 */
export function markMemory(day: number): void {
  const save = loadGameSave();
  if (memoryThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    memoryLog: [...(save.memoryLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DK）：照实核 / 只说一件 / 不核。
 * 照实核：被注意 +1（它第一次承认它可能记错）；只说一件：被注意 +2（空栏是「等你补」）；
 * 不核：沉默 +1（记性归属不变——它不进档案，也不销毁）。
 */
export function respondMemory(pick: "all" | "one" | "none"): void {
  const save = loadGameSave();
  const log = save.memoryLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    memoryLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "all") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "one") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的登记记录（批次 DL） */
export function unregisteredThisSemesterOf(save: GameSaveData): UnregisteredRecord | undefined {
  return (save.unregisteredLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 登记落档（批次 DL）：本学期一次。每学期最多一次 */
export function markUnregistered(day: number): void {
  const save = loadGameSave();
  if (unregisteredThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    unregisteredLog: [...(save.unregisteredLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DL）：认领 / 不认领 / 抄进抽屉。
 * 认领：被注意 +1（它给你的第一张收据）；不认领：沉默 +1（无主地没人翻）；
 * 抄进抽屉：被注意 +2（两本账记的是同一件事——它知道它那本，不知道你这本）。
 */
export function respondUnregistered(pick: "claim" | "leave" | "copy"): void {
  const save = loadGameSave();
  const log = save.unregisteredLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    unregisteredLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "claim") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "copy") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的扉页记录（批次 DM） */
export function flyleafThisSemesterOf(save: GameSaveData): FlyleafRecord | undefined {
  return (save.flyleafLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 扉页落档（批次 DM）：换封皮时来。每学期最多一次 */
export function markFlyleaf(day: number): void {
  const save = loadGameSave();
  if (flyleafThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    flyleafLog: [...(save.flyleafLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DM）：照读 / 折起来 / 撕掉。
 * 照读：被注意 +1（它第一次自己写一句——挑的话是给你的）；
 * 折起来：被注意 +2（折痕是「我碰过这一页」）；
 * 撕掉：沉默 +1（缺的那页你带走了，缺的这件事它留着）。
 */
export function respondFlyleaf(pick: "read" | "fold" | "tear"): void {
  const save = loadGameSave();
  const log = save.flyleafLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    flyleafLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "read") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "fold") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的认领记录（批次 DN） */
export function claimThisSemesterOf(save: GameSaveData): ClaimRecord | undefined {
  return (save.claimLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 认领落档（批次 DN）：失物满一学期可申请。每学期最多一次 */
export function markClaim(day: number): void {
  const save = loadGameSave();
  if (claimThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    claimLog: [...(save.claimLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DN）：领回 / 不领 / 让它们找。
 * 领回：被注意 +1（它承认了「找不到」的那一段时间）；不领：沉默 +1（从「找不到」变成「不要了」）；
 * 让它们找：被注意 +2（找的义务在认领人，而你不认领）。
 */
export function respondClaim(pick: "return" | "keep" | "wait"): void {
  const save = loadGameSave();
  const log = save.claimLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    claimLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "return") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "wait") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的联名记录（批次 DO） */
export function jointThisSemesterOf(save: GameSaveData): JointRecord | undefined {
  return (save.jointLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 联名落档（批次 DO）：调阅过才会来。每学期最多一次 */
export function markJoint(day: number): void {
  const save = loadGameSave();
  if (jointThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    jointLog: [...(save.jointLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DO）：签 / 不签 / 改一处。
 * 签：被注意 +1（两个名字之间隔着整栋楼的规程）；不签：沉默 +1（两份纸都缺一个名字）；
 * 改一处：被注意 +2（它替你瞒的事，你替它认了；它写的字，你替它说了）。
 */
export function respondJoint(pick: "sign" | "hold" | "edit"): void {
  const save = loadGameSave();
  const log = save.jointLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    jointLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "sign") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "edit") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的信格记录（批次 DP） */
export function letterBoxThisSemesterOf(save: GameSaveData): LetterBoxRecord | undefined {
  return (save.letterBoxLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 信格落档（批次 DP）：通道申请。每学期最多一次 */
export function markLetterBox(day: number): void {
  const save = loadGameSave();
  if (letterBoxThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    letterBoxLog: [...(save.letterBoxLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DP）：通 / 不通 / 单向。
 * 通：被注意 +1（全程都在它看不见的地方）；不通：沉默 +1（它等的不是通道，是你说「开」）；
 * 单向：被注意 +2（所有往来的开口都是制度定的；只有一个口，是蛙定的）。
 */
export function respondLetterBox(pick: "both" | "closed" | "oneway"): void {
  const save = loadGameSave();
  const log = save.letterBoxLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    letterBoxLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "both") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "oneway") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的命名记录（批次 DQ） */
export function namingThisSemesterOf(save: GameSaveData): NamingRecord | undefined {
  return (save.namingLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 命名落档（批次 DQ）：本学期一次的简称申请。每学期最多一次 */
export function markNaming(day: number): void {
  const save = loadGameSave();
  if (namingThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    namingLog: [...(save.namingLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DQ）：起一个 / 不起 / 起一个像编号的。
 * 起一个：被注意 +1（它第一次收下不懂意思的名字）；不起：沉默 +1（第二次有一件事永远等着你）；
 * 起一个像编号的：被注意 +2（用它的格式藏你的话）。
 */
export function respondNaming(pick: "give" | "hold" | "code"): void {
  const save = loadGameSave();
  const log = save.namingLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    namingLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "give") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "code") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 本学期的同名记录（批次 DR） */
export function sameNameThisSemesterOf(save: GameSaveData): SameNameRecord | undefined {
  return (save.sameNameLog ?? []).find((item) => item.semester === save.playthrough);
}

/** 同名落档（批次 DR）：起过简称才来。每学期最多一次 */
export function markSameName(day: number): void {
  const save = loadGameSave();
  if (sameNameThisSemesterOf(save)) return;
  persistGameSave({
    ...save,
    sameNameLog: [...(save.sameNameLog ?? []), { semester: save.playthrough, day }].slice(-6),
  });
}

/**
 * 处理落档（批次 DR）：认下 / 让给它 / 换个名。
 * 认下：被注意 +1（它不知道你的意思，但它用了你的词）；让给它：被注意 +2（一个词从今天起只属于一只蛙）；
 * 换个名：沉默 +1（同一栋楼的纸，写两个不同的词）。
 */
export function respondSameName(pick: "keep" | "give" | "change"): void {
  const save = loadGameSave();
  const log = save.sameNameLog ?? [];
  const index = log.findIndex((item) => item.semester === save.playthrough);
  if (index < 0) return;
  persistGameSave({
    ...save,
    sameNameLog: log.map((item, i) => (i === index ? { ...item, pick } : item)),
  });
  const fresh = loadGameSave();
  if (pick === "keep") {
    persistGameSave({ ...fresh, attention: fresh.attention + 1 });
  } else if (pick === "give") {
    persistGameSave({ ...fresh, attention: fresh.attention + 2 });
  } else {
    persistGameSave({ ...fresh, silenceValue: fresh.silenceValue + 1 });
  }
}

/** 说明已办过没有（批次 CN）：每学期至多办一次——办过就不再弹 */
export function abscondSettledOf(save: GameSaveData): boolean {
  return save.abscondSettled === true;
}

/* ---------- 地下组织（批次 CD）：没有名字、没有固定成员、没有固定地点 ---------- */

/** 两面的账（批次 CD）：白天那件事 / 夜里那一面——夜里那一面不进任何一栏 */
export interface UndergroundJob {
  /** 学期号 */
  semester: number;
  /** 发生在哪一天 */
  day: number;
  /** 哪件正常的事长出了另一面 */
  kind: UndergroundJobKind;
  /** 白天那件事（你做的） */
  surface: string;
  /** 夜里那一面（实际发生的） */
  underneath: string;
}

/** 托付记录（批次 CD）：帮过 / 没帮——帮过的那几件，是有些结局的前提 */
export interface UndergroundAct {
  /** 学期号 */
  semester: number;
  /** 办事的那一天 */
  day: number;
  /** 为哪只办的 */
  frogId: FrogCharacterId;
  /** correct 改一行 / evade 躲一场 / draft 回草稿 / refused 没帮 */
  kind: UndergroundServiceKind | "refused";
  /** 办完之后的档案腔一句 */
  note?: string;
}

/** 两面的账清洗（批次 CD）：学期/日期 ≥1、类型合法、两面非空；上限十二条 */
function sanitizeUndergroundJobs(raw: unknown): UndergroundJob[] {
  if (!Array.isArray(raw)) return [];
  const out: UndergroundJob[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.kind !== "string" || !(o.kind in UNDERGROUND_JOB_KIND_SET)) continue;
    if (typeof o.surface !== "string" || !o.surface) continue;
    if (typeof o.underneath !== "string" || !o.underneath) continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      kind: o.kind as UndergroundJobKind,
      surface: o.surface.slice(0, 60),
      underneath: o.underneath.slice(0, 80),
    });
  }
  return out.slice(-12);
}

const UNDERGROUND_JOB_KIND_SET: Record<string, true> = { class: true, skip: true, line: true, night: true };

/** 托付记录清洗（批次 CD）：蛙 id 合法、学期/日期 ≥1、四档；上限十二条 */
function sanitizeUndergroundActs(raw: unknown): UndergroundAct[] {
  if (!Array.isArray(raw)) return [];
  const out: UndergroundAct[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.frogId !== "string" || o.frogId === "naiBai" || !(o.frogId in FROG_CHARACTERS)) continue;
    if (o.kind !== "correct" && o.kind !== "evade" && o.kind !== "draft" && o.kind !== "refused") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      frogId: o.frogId as FrogCharacterId,
      kind: o.kind,
      note: typeof o.note === "string" ? o.note.slice(0, 80) : undefined,
    });
  }
  return out.slice(-12);
}

/** 地下还开着吗（批次 CD）：加入过且没被看见——被看见的名字不能再用 */
export function isUndergroundActive(save: GameSaveData): boolean {
  return save.undergroundJoined === true && !(save.undergroundExposed && save.undergroundExposed > 0);
}

/** 被暴露在第几学期（0 = 还没被看见；档案那一行「该蛙曾参与非正式档案活动」从此在） */
export function undergroundExposedSemesterOf(save: GameSaveData): number {
  return save.undergroundExposed ?? 0;
}

/** 本学期哪一天有风险（第 3~9 天里由种子派生；风险不是数值，是具体的人） */
export function undergroundRiskDayOf(seed: number): number {
  return 3 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 1181 + 167) * 7);
}

/** 加入（批次 CD）：没有章，没有编号，没有欢迎词——这一栏不存在。你开始瞒（沉默 +2、被注意 −1） */
export function joinUnderground(): void {
  const save = loadGameSave();
  if (save.undergroundJoined) return;
  persistGameSave({ ...addSilence(2), ...addAttention(-1), undergroundJoined: true });
}

/** 递过话（批次 CD）：它们每学期最多找你一次——偶然遇到，不是天天有 */
export function markUndergroundMet(): void {
  const save = loadGameSave();
  const list = save.undergroundMetSemesters ?? [];
  if (list.includes(save.playthrough)) return;
  persistGameSave({ ...save, undergroundMetSemesters: [...list, save.playthrough] });
}

/** 断联已看过（批次 CD）：它们不再出现——被看见的名字不能再用 */
export function markUndergroundClosedSeen(): void {
  const save = loadGameSave();
  if (save.undergroundClosedSeen) return;
  persistGameSave({ ...save, undergroundClosedSeen: true });
}

/** 两面的账（批次 CD）：白天那件事照常发生；夜里那一面归它们 */
export function logUndergroundJob(kind: UndergroundJobKind, day: number, surface: string, underneath: string): void {
  const save = loadGameSave();
  if (!isUndergroundActive(save)) return;
  persistGameSave({
    ...save,
    undergroundJobs: [
      ...(save.undergroundJobs ?? []),
      { semester: save.playthrough, day, kind, surface, underneath },
    ].slice(-12),
  });
}

/** 两面的账措辞（批次 CD）：种子挑一条，同一颗种子同一句 */
export function undergroundJobTextOf(
  kind: UndergroundJobKind,
  day: number,
): { surface: string; underneath: string } {
  const pool = UNDERGROUND_JOB_TEXTS[kind];
  const pick = Math.floor(seedRandom((day * 1229 + kind.length * 31) % 1000000) * pool.length) % pool.length;
  const item = pool[pick] ?? pool[0];
  const n = String(day);
  return { surface: item.surface(n), underneath: item.underneath };
}

/** 这学期的托付（批次 CD）：帮哪只、办哪件——种子定，你挑不了 */
export function undergroundFavorOf(
  _save: GameSaveData,
  seed: number,
): { frogId: FrogCharacterId; kind: UndergroundServiceKind } {
  const base = Math.round(seed) % 1000000;
  const pool = (Object.keys(FROG_CHARACTERS) as FrogCharacterId[]).filter((id) => id !== "naiBai");
  const frog = pool[Math.floor(seedRandom(base * 1153 + 171) * pool.length) % pool.length] ?? pool[0];
  const kinds: UndergroundServiceKind[] = ["correct", "evade", "draft"];
  const kind = kinds[Math.floor(seedRandom(base * 1163 + 173) * kinds.length) % kinds.length] ?? "correct";
  return { frogId: frog ?? "moMo", kind: kind ?? "correct" };
}

/** 本学期托付过没有（帮过或没帮都算——这扇门一学期只开一次） */
export function hasUndergroundActThisSemester(save: GameSaveData): boolean {
  return (save.undergroundActs ?? []).some((item) => item.semester === save.playthrough);
}

/** 帮它办（批次 CD）：它记下了（好感 +4）；你做的事不进任何一栏（表演分 +2、沉默 +1） */
export function recordUndergroundFavor(
  day: number,
  frogId: FrogCharacterId,
  kind: UndergroundServiceKind,
  note?: string,
): void {
  const save = loadGameSave();
  const list = [...(save.undergroundActs ?? []), { semester: save.playthrough, day, frogId, kind, note }].slice(-12);
  persistGameSave({ ...addReputation(2), ...addSilence(1), undergroundActs: list });
  addAffinity(frogId, 4);
}

/** 没帮（批次 CD）：它们没说什么——但它记住了（好感 −2）。这一门关了，下学期再开 */
export function recordUndergroundRefusal(day: number, frogId: FrogCharacterId): void {
  const save = loadGameSave();
  const list = [
    ...(save.undergroundActs ?? []),
    { semester: save.playthrough, day, frogId, kind: "refused" as const },
  ].slice(-12);
  persistGameSave({ ...save, undergroundActs: list });
  addAffinity(frogId, -2);
}

/** 被暴露（批次 CD）：不是结局——它们不再联系你；档案上多一行「该蛙曾参与非正式档案活动」 */
export function exposeUnderground(): void {
  const save = loadGameSave();
  if (save.undergroundExposed) return;
  persistGameSave({ ...addAttention(3), undergroundExposed: save.playthrough });
}

/** 帮过的某一件事（图鉴派生用：有些结局的前提，是有人帮它们改过档案） */
export function undergroundFavorCountOf(save: GameSaveData, kind: UndergroundServiceKind): number {
  return (save.undergroundActs ?? []).filter((item) => item.kind === kind).length;
}

/* ---------- 本能（批次 CE）：这些不是玩家选的，是蛙的身体自己选的 ----------
 * 玩家能做的，只是在发作之后决定怎么面对。不是「要不要叫」，是「叫了之后怎么办」；
 * 不是「要不要冬眠」，是「醒来之后发现错过了什么」；不是「要不要蜕皮」，是「蜕完之后看着旧皮」。 */

/** 鸣叫发作的学期戳（批次 CE）：每学期至多发作一次 */
export function markCroakBurst(): void {
  persistGameSave({ ...loadGameSave(), croakBurstSemester: loadGameSave().playthrough });
}

/** 鸣叫发作过没有（本学期） */
export function hasCroakBurstThisSemester(save: GameSaveData): boolean {
  return save.croakBurstSemester === save.playthrough;
}

/** 待醒回执（批次 CE）：冬眠错过了什么——醒来才看见 */
export interface HibernationWake {
  /** 睡去的时刻 */
  stamp: number;
  /** 错过的事（档案腔，最多六条） */
  missed: string[];
}

/** 待醒回执清洗（批次 CE）：stamp 非负、missed 非空字符串；上限六条 */
function sanitizeHibernateWake(raw: unknown): HibernationWake | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.stamp !== "number" || o.stamp <= 0) return undefined;
  const missed = Array.isArray(o.missed)
    ? o.missed.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, 6)
    : [];
  return { stamp: Math.round(o.stamp), missed };
}

/**
 * 冬眠发作（批次 CE）：某个学期末，你会不可抗拒地进入冬眠——不是「要不要睡」，是「醒来之后发现错过了什么」。
 * 醒来时世界已经变了；档案照写：「该蛙冬眠期间无记录。」
 */
export function involuntaryHibernate(missed: string[]): void {
  const fresh = hibernateNow();
  persistGameSave({ ...fresh, hibernateWake: { stamp: Date.now(), missed: missed.slice(0, 6) } });
}

/** 取走待醒回执（批次 CE）：浮层弹出即消费——错过的事只看见一次 */
export function consumeHibernateWake(): HibernationWake | null {
  const save = loadGameSave();
  const wake = save.hibernateWake;
  if (!wake) return null;
  persistGameSave({ ...save, hibernateWake: undefined });
  return wake;
}

/** 蜕皮待发（批次 CE）：打完一个结局之后，身体自己蜕——旧皮入柜，新皮是空的 */
export function markMoltPending(note: string): void {
  persistGameSave({ ...loadGameSave(), moltPending: true, moltNote: note.slice(0, 80) });
}

/** 取走蜕皮待发（批次 CE）：地图挂载时蜕——返回旧皮上写着的那一行 */
export function consumeMoltPending(): string | null {
  const save = loadGameSave();
  if (save.moltPending !== true) return null;
  const note = save.moltNote ?? "";
  persistGameSave({ ...save, moltPending: false, moltNote: undefined });
  return note;
}

/* ---------- 团体（批次 CA）：关系网——它们自己组成、自己做事、自己分裂 ---------- */

/** 团体记录（批次 CA）：action 它们动了 / joined 你加入 / watched 你旁观 / split 它们裂了 */
export interface FactionRecord {
  /** 学期号 */
  semester: number;
  /** 发生在哪一天 */
  day: number;
  /** 哪个团体 */
  factionId: string;
  kind: "action" | "joined" | "watched" | "split";
  /** kind=split 时记站了哪一边（none = 两边都不站） */
  side?: FrogCharacterId | "none";
}

/** 本学期哪一天它们自己动手（批次 CA）：第 2~8 天里由种子派生；同一颗种子同一天 */
export function factionActionDayOf(seed: number, factionId: string): number {
  const multipliers: Record<string, number> = { curfew: 1049, bulletin: 1061, ledger: 1069 };
  const base = Math.round(seed) % 1000000;
  const multiplier = multipliers[factionId] ?? 1049;
  return 2 + Math.floor(seedRandom(base * multiplier + 137) * 7);
}

/** 团体记录清洗（批次 CA）：学期/日期 ≥1、团体与类型合法；上限十二条 */
function sanitizeFactionLog(raw: unknown): FactionRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: FactionRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.factionId !== "string" || !(o.factionId in FACTION_ID_SET)) continue;
    if (o.kind !== "action" && o.kind !== "joined" && o.kind !== "watched" && o.kind !== "split") continue;
    if (o.side !== undefined && o.side !== "none" && (typeof o.side !== "string" || !(o.side in FROG_CHARACTERS))) continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      factionId: o.factionId,
      kind: o.kind,
      side: o.side as FrogCharacterId | "none" | undefined,
    });
  }
  return out.slice(-12);
}

/** 合法团体 id 集合（清洗用；FACTIONS 在 src/data/factions.ts，此处只认 id） */
const FACTION_ID_SET: Record<string, true> = { curfew: true, bulletin: true, ledger: true };

/** 某团体的记录（批次 CA，旧档缺字段按空） */
function factionRecordsOf(save: GameSaveData, factionId: string): FactionRecord[] {
  return (save.factionLog ?? []).filter((item) => item.factionId === factionId);
}

/** 加入过没有（批次 CA）：有就是那学期的编号 */
export function factionJoinedSemesterOf(save: GameSaveData, factionId: string): number | null {
  const joined = factionRecordsOf(save, factionId).find((item) => item.kind === "joined");
  return joined ? joined.semester : null;
}

/** 见过它们动过没有（批次 CA）：行动 / 加入 / 旁观都算见过 */
export function factionSeenOf(save: GameSaveData, factionId: string): boolean {
  return factionRecordsOf(save, factionId).some((item) => item.kind !== "split");
}

/** 本学期它动过没有（批次 CA）：一学期动一次 */
export function factionActedThisSemesterOf(save: GameSaveData, factionId: string): boolean {
  return factionRecordsOf(save, factionId).some(
    (item) => item.kind === "action" && item.semester === save.playthrough,
  );
}

/** 分裂过没有（批次 CA）：裂一次就是一次，站队落点跟着它走 */
export function factionSplitSideOf(
  save: GameSaveData,
  factionId: string,
): FrogCharacterId | "none" | null {
  const split = factionRecordsOf(save, factionId).find((item) => item.kind === "split");
  return split ? (split.side ?? "none") : null;
}

/** 你加入过几个团体（批次 CA） */
export function factionJoinedCountOf(save: GameSaveData): number {
  const ids = Object.keys(FACTION_ID_SET);
  return ids.filter((id) => factionJoinedSemesterOf(save, id) !== null).length;
}

/** 见过它们动过、一次也没加入过（批次 CA）：在场外的口径 */
export function isFactionOutside(save: GameSaveData): boolean {
  const seen = Object.keys(FACTION_ID_SET).some((id) => factionSeenOf(save, id));
  return seen && factionJoinedCountOf(save) === 0;
}

/**
 * 站队之后被关闭的那条线（批次 CA）：站了这一边，另一边的线永久关闭——
 * 返回被关闭的线 id 集合（跨学期保留：另一边的事，从此没有你的事）。
 */
export function factionClosedLinesOf(save: GameSaveData): StorylineId[] {
  const out: StorylineId[] = [];
  for (const factionId of Object.keys(FACTION_ID_SET)) {
    const side = factionSplitSideOf(save, factionId);
    if (!side || side === "none") continue;
    const pair = FACTION_LINES[factionId as FactionId];
    if (!pair) continue;
    const meta = factionById(factionId);
    if (!meta) continue;
    const index = meta.members.findIndex((item) => item.frogId === side);
    if (index !== 0 && index !== 1) continue;
    const closedLine = index === 0 ? pair[1] : pair[0];
    if (!out.includes(closedLine)) out.push(closedLine);
  }
  return out;
}

/** 团体行动落档（批次 CA）：它们在你不在的时候动了——档案记「该蛙所在团体」那行之前，先记它们这行 */
export function markFactionAction(day: number, factionId: string): void {
  const save = loadGameSave();
  if (factionActedThisSemesterOf(save, factionId)) return;
  persistGameSave({
    ...save,
    factionLog: [
      ...(save.factionLog ?? []),
      { semester: save.playthrough, day, factionId, kind: "action" as const },
    ].slice(-12),
  });
  /* 勾结被看见了（批次 CA，仅公示栏）：被看见的勾结不叫勾结，叫材料——它们一起把材料处理了 */
  if (factionId === "bulletin" && (save.collusionSeen ?? []).some((id) => id === "administration" || id === "club")) {
    addAttention(2);
  }
}

/** 加入落档（批次 CA）：拿信息、拿资源、拿保护——档案照写：该蛙所在团体。加入没有退出这一栏 */
export function joinFaction(day: number, factionId: string): void {
  const save = loadGameSave();
  if (factionJoinedSemesterOf(save, factionId) !== null) return;
  persistGameSave({
    ...addAttention(-1),
    ...addReputation(1),
    factionLog: [
      ...(save.factionLog ?? []),
      { semester: save.playthrough, day, factionId, kind: "joined" as const },
    ].slice(-12),
  });
  const meta = factionById(factionId);
  if (meta) {
    addAffinity(meta.members[0].frogId, 2);
    addAffinity(meta.members[1].frogId, 2);
  }
}

/** 旁观落档（批次 CA）：你没掺和——安全，但这一栏从此空白 */
export function watchFaction(day: number, factionId: string): void {
  const save = loadGameSave();
  persistGameSave({
    ...save,
    factionLog: [
      ...(save.factionLog ?? []),
      { semester: save.playthrough, day, factionId, kind: "watched" as const },
    ].slice(-12),
  });
}

/**
 * 站队落档（批次 CA）：两边都来找你了，你要个说法——
 * 站一边：它记下了（好感 +4），另一边的线永久关闭；
 * 两边都不站：两边都不再信任你（好感各 −8，被注意值 +2——两边都记了一笔）。
 */
export function splitFaction(day: number, factionId: string, side: FrogCharacterId | "none"): void {
  const save = loadGameSave();
  const meta = factionById(factionId);
  if (!meta) return;
  const record: FactionRecord = { semester: save.playthrough, day, factionId, kind: "split", side };
  persistGameSave({
    ...save,
    factionLog: [...(save.factionLog ?? []), record].slice(-12),
  });
  if (side === "none") {
    addAffinity(meta.members[0].frogId, -8);
    addAffinity(meta.members[1].frogId, -8);
    addAttention(2);
  } else {
    addAffinity(side, 4);
  }
}

/**
 * 团体分裂判定（批次 CA）：不是你挑拨的，是它们自己的问题——条件齐了它们自己裂。
 * 一学期至多裂一个；裂过的不再裂。三条账都是它们自己的：
 * 熄灯之后（灰灰·格格）：两只离得不一样近（好感差 ≥ 40 且两栋楼都进过）；
 * 公示栏（格格·莓莓）：勾结被看见了（串供听过）；
 * 三号窗口（干饭叔·抹抹）：两套时间表都算过账（两条线都走完过）。
 */
export function factionSplitDueOf(save: GameSaveData): string | null {
  for (const meta of FACTIONS) {
    if (factionSplitSideOf(save, meta.id) !== null) continue;
    if (meta.id === "curfew") {
      const close =
        save.visitedLines.includes("lawn") &&
        save.visitedLines.includes("administration") &&
        Math.abs((save.affinity.huiHui ?? 0) - (save.affinity.geGe ?? 0)) >= 40;
      if (close) return meta.id;
    } else if (meta.id === "bulletin") {
      if ((save.collusionSeen ?? []).some((id) => id === "administration" || id === "club")) return meta.id;
    } else if (meta.id === "ledger") {
      if (save.completedLines.includes("canteen") && save.completedLines.includes("roll-king")) return meta.id;
    }
  }
  return null;
}

/* ---------- 基准（批次 BN）：取样 / 基准线 / 比对 / 偏差——你成了那条线 ---------- */

/** 本学期哪一天公布基准（批次 BN）：第 8~9 天里由种子派生的那一天；看柜之后，你成了尺子 */
export function baselineDayOf(seed: number): number {
  return 8 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 929 + 101) * 2);
}

/** 基准记录清洗（批次 BN）：学期 ≥1；上限六次 */
function sanitizeBaselineLog(raw: unknown): BaselineRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: BaselineRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    out.push({ semester: Math.round(o.semester), day: Math.round(o.day) });
  }
  return out.slice(-6);
}

/** 基准落档（批次 BN）：入选样本计入考评（表演分 +2）。每学期一次。 */
export function markBaseline(day: number): number | null {
  const save = loadGameSave();
  if (save.baselineSeen) return null;
  const list = save.baselineLog ?? [];
  const next = [...list, { semester: save.playthrough, day }].slice(-6);
  persistGameSave({ ...save, baselineLog: next, baselineSeen: true });
  addReputation(2);
  return next.length;
}

/* ---------- 不符（批次 BO）：退回 / 态度栏 / 对质 / 全齐——最后一只不齐的，由你去核 ---------- */

/** 本学期哪一天接手这份不符档案（批次 BO）：第 8~9 天里由种子派生的那一天；取样之后，柜子要齐 */
export function alignDayOf(seed: number): number {
  return 8 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 937 + 103) * 2);
}

/** 不符档案清洗（批次 BO）：蛙 id 合法、学期 ≥1；上限六次 */
function sanitizeAlignLog(raw: unknown): AlignRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: AlignRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (typeof o.frogId !== "string" || !(o.frogId in FROG_CHARACTERS)) continue;
    if (o.resolved !== "aligned" && o.resolved !== "reviewed") continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      frogId: o.frogId as FrogCharacterId,
      resolved: o.resolved,
    });
  }
  return out.slice(-6);
}

/** 不符落档（批次 BO）：
 *  按基准来——你说了会议室里那句「就按这个来」，它自己改了（好感 −8，表演分 +2）；
 *  要求复核——流程里有这一项，用得少但一直有；复核维持原认定，它自己改了
 *  （好感 −4，表演分 +1，被注意值 +1：流程里没有「要求复核」这一格，它是被记进去的）。
 *  学期末它调走了——柜子里少了一份不齐的。每学期一次。 */
export function markAlign(day: number, frogId: FrogCharacterId, resolved: "aligned" | "reviewed"): number | null {
  const save = loadGameSave();
  if (save.alignSeen) return null;
  const list = save.alignLog ?? [];
  const next = [...list, { semester: save.playthrough, day, frogId, resolved }].slice(-6);
  persistGameSave({ ...save, alignLog: next, alignSeen: true });
  if (resolved === "aligned") {
    addAffinity(frogId, -8);
    addReputation(2);
  } else {
    addAffinity(frogId, -4);
    addReputation(1);
    addAttention(1);
  }
  return next.length;
}

/* ---------- 结卷（批次 BP）：合订 / 目录 / 页脚 / 卷脊——你的学期被检索了 ---------- */

/** 本学期哪一天结卷（批次 BP）：学期最后一天；核对之后，柜子合上 */
export function volumeDayOf(seed: number): number {
  return 9 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 947 + 107) * 1);
}

/** 结卷记录清洗（批次 BP）：学期 ≥1；上限六册 */
function sanitizeVolumeLog(raw: unknown): VolumeRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: VolumeRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    out.push({ semester: Math.round(o.semester), day: Math.round(o.day) });
  }
  return out.slice(-6);
}

/** 结卷落档（批次 BP）：结卷计入考评（表演分 +1）。每学期一册。 */
export function markVolume(day: number): number | null {
  const save = loadGameSave();
  if (save.volumeSeen) return null;
  const list = save.volumeLog ?? [];
  const next = [...list, { semester: save.playthrough, day }].slice(-6);
  persistGameSave({ ...save, volumeLog: next, volumeSeen: true });
  addReputation(1);
  return next.length;
}

/* ---------- 登记（批次 BQ）：公告 / 签到表 / 事由 / 签名——制度到了湖边 ---------- */

/** 本学期哪一天立牌（批次 BQ）：第 9 天；湖边解锁之后，那块地有了一块牌子 */
export function registerDayOf(seed: number): number {
  return 9 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 967 + 109) * 1);
}

/** 登记记录清洗（批次 BQ）：学期 ≥1；上限六次 */
function sanitizeRegisterLog(raw: unknown): RegisterRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: RegisterRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    out.push({ semester: Math.round(o.semester), day: Math.round(o.day) });
  }
  return out.slice(-6);
}

/** 登记落档（批次 BQ）：登记进名册（被注意值 +1），到场计入考评（表演分 +1）。每学期一次。 */
export function markRegister(day: number): number | null {
  const save = loadGameSave();
  if (save.registerSeen) return null;
  const list = save.registerLog ?? [];
  const next = [...list, { semester: save.playthrough, day }].slice(-6);
  persistGameSave({ ...save, registerLog: next, registerSeen: true });
  addAttention(1);
  addReputation(1);
  return next.length;
}

/* ---------- 迎新（批次 BT）：报到 / 第一行 / 指路 / 编号——名册上有了下一号 ---------- */

/** 本学期哪一天迎新（批次 BT）：第 1~3 天里由种子派生的那一天；湖边立牌之后，新蛙来了 */
export function orientationDayOf(seed: number): number {
  return 1 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 983 + 127) * 3);
}

/**
 * 迎新记录（批次 BT）：窗口后面是你，递表来的是一只新蛙——没有名字，只有编号（第 7 号）。
 * 新档案的第一行由你写，档案不修改第一行；它问哪里能不填表，你指了湖的方向——
 * 你以为你给它指了条路，你指的只是另一张表。
 */
export interface OrientationRecord {
  /** 学期号 */
  semester: number;
  /** 迎新的那一天 */
  day: number;
  /** 你替它写的第一行（≤24 字） */
  note?: string;
}

/** 迎新清洗（批次 BT）：学期 ≥1、第一行限 24 字；上限六次 */
function sanitizeOrientationLog(raw: unknown): OrientationRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: OrientationRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    out.push({
      semester: Math.round(o.semester),
      day: Math.round(o.day),
      note: typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 24) : undefined,
    });
  }
  return out.slice(-6);
}

/** 迎新落档（批次 BT）：迎新计入考评（表演分 +2），新蛙进名册（被注意值 +1）。每学期一次。 */
export function markOrientation(day: number, note: string): number | null {
  const save = loadGameSave();
  if (save.orientationSeen) return null;
  const list = save.orientationLog ?? [];
  const trimmed = note.trim().slice(0, 24);
  const next = [...list, { semester: save.playthrough, day, ...(trimmed ? { note: trimmed } : {}) }].slice(-6);
  persistGameSave({ ...save, orientationLog: next, orientationSeen: true });
  addReputation(2);
  addAttention(1);
  return next.length;
}

/* ---------- 用途（批次 BR）：申报 / 不予受理 / 名目 / 结转——沉默成了预算 ---------- */

/** 本学期哪一天发申报表（批次 BR）：第 5~9 天里由种子派生的那一天；接任之后，沉默要报用途 */
export function budgetDayOf(seed: number): number {
  return 5 + Math.floor(seedRandom((Math.round(seed) % 1000000) * 977 + 113) * 5);
}

/** 沉默的三个法定名目（批次 BR）：表格背面印着可选的用途，只有这三个——和报名表一样，没有第四个 */
export type SilencePurpose = "study" | "mood" | "other";

export const SILENCE_PURPOSES: Record<SilencePurpose, string> = {
  study: "备考",
  mood: "情绪",
  other: "其他人员",
};

/**
 * 沉默用途申报（批次 BR）：沉默必须有用途——「无用途」不予受理（沉默的用途是它的属性）。
 * 受理之后你的沉默有了名目；学期末没用完的按名目结转，最多十点——你的沉默成了预算。
 */
export interface BudgetRecord {
  /** 学期号 */
  semester: number;
  /** 申报的那一天 */
  day: number;
  /** 名目 */
  purpose: SilencePurpose;
}

/** 用途申报清洗（批次 BR）：名目三选一、学期 ≥1；上限六次 */
function sanitizeBudgetLog(raw: unknown): BudgetRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: BudgetRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.day !== "number" || o.day < 1) continue;
    if (o.purpose !== "study" && o.purpose !== "mood" && o.purpose !== "other") continue;
    out.push({ semester: Math.round(o.semester), day: Math.round(o.day), purpose: o.purpose });
  }
  return out.slice(-6);
}

/** 用途申报落档（批次 BR）：受理计入考评（表演分 +1）；按名目算好结转余额（最多十点，
 *  新学期开始时一次性发放——用不完不是你的，是名目里的余额）。每学期一次。 */
export function markSilenceBudget(day: number, purpose: SilencePurpose): number | null {
  const save = loadGameSave();
  if (save.budgetSeen) return null;
  const list = save.budgetLog ?? [];
  const next = [...list, { semester: save.playthrough, day, purpose }].slice(-6);
  persistGameSave({
    ...save,
    budgetLog: next,
    budgetSeen: true,
    silenceCarry: Math.min(save.silenceValue, 10),
    reputation: Math.max(0, save.reputation + 1),
  });
  return next.length;
}

/* ---------- 编目（批次 BS）：认定 / 非编目 / 自行降级——你决定什么算存在 ---------- */

/** 存在认定清洗（批次 BS）：蛙 id 合法、学期 ≥1；上限二十四条 */
function sanitizeExistenceLog(raw: unknown): ExistenceRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ExistenceRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.semester !== "number" || o.semester < 1) continue;
    if (typeof o.frogId !== "string" || !(o.frogId in FROG_CHARACTERS) || o.frogId === "naiBai") continue;
    if (o.verdict !== "confirmed" && o.verdict !== "denied") continue;
    out.push({ semester: Math.round(o.semester), frogId: o.frogId as FrogCharacterId, verdict: o.verdict });
  }
  return out.slice(-24);
}

/** 自行降级清洗（批次 BS）：蛙 id 合法、去重；跨学期保留——自己选择消失的不回来 */
function sanitizeSelfDemoted(raw: unknown): FrogCharacterId[] {
  if (!Array.isArray(raw)) return [];
  const out: FrogCharacterId[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !(item in FROG_CHARACTERS) || item === "naiBai") continue;
    if (!out.includes(item as FrogCharacterId)) out.push(item as FrogCharacterId);
  }
  return out;
}

/** 在册蛙的固定编号（批次 BS）：图鉴里的编号还在——名字可以空，编号不空 */
export function frogIndexOf(frogId: FrogCharacterId): number {
  const order: FrogCharacterId[] = ROUTE_FROG_IDS;
  const index = order.indexOf(frogId);
  return index >= 0 ? index + 1 : 0;
}

/** 某蛙某学期的最新口径（批次 BS）：没有记录 = 在册（默认一切存在） */
export function existenceVerdictOf(
  save: GameSaveData,
  frogId: FrogCharacterId,
  semester: number,
): "confirmed" | "denied" | null {
  for (let i = (save.existenceLog ?? []).length - 1; i >= 0; i -= 1) {
    const item = (save.existenceLog ?? [])[i];
    if (item && item.frogId === frogId && item.semester === semester) return item.verdict;
  }
  return null;
}

/** 某蛙某学期被翻动过几次（批次 BS）：翻第三次起，它自己申请降级 */
export function existenceTogglesOf(save: GameSaveData, frogId: FrogCharacterId, semester: number): number {
  return (save.existenceLog ?? []).filter((item) => item.frogId === frogId && item.semester === semester).length;
}

/** 该蛙有没有自行降级（批次 BS）：跨学期保留——自己选择消失的不回来 */
export function isSelfDemoted(save: GameSaveData, frogId: FrogCharacterId): boolean {
  return (save.selfDemoted ?? []).includes(frogId);
}

/** 降级层级（批次 BS）："none" 在册 | "footnote" 非编目（文本降级为脚注）| "demoted" 自行申请降级 */
export type ExistenceTier = "none" | "footnote" | "demoted";

export function existenceTierOf(save: GameSaveData, frogId: FrogCharacterId, semester: number): ExistenceTier {
  if (isSelfDemoted(save, frogId)) return "demoted";
  if (existenceVerdictOf(save, frogId, semester) === "denied") return "footnote";
  return "none";
}

/** 本学期否认与在册的只数（批次 BS）：编目界面的口径——它会记得你做了什么，不提醒你做了什么 */
export function existenceSummaryOf(save: GameSaveData, semester: number): { denied: number; confirmed: number } {
  const denied = ROUTE_FROG_IDS.filter((id) => existenceTierOf(save, id, semester) !== "none").length;
  return { denied, confirmed: 6 - denied };
}

/** 特殊状态（批次 BS）：全部否认 =《独角戏》（学期无其他记录）；六只都亲口确认过 =《群像》（记录过载） */
export function existenceSpecialOf(save: GameSaveData, semester: number): "solo" | "ensemble" | null {
  const roster: FrogCharacterId[] = ROUTE_FROG_IDS;
  if (roster.every((id) => existenceTierOf(save, id, semester) !== "none")) return "solo";
  if (roster.every((id) => existenceVerdictOf(save, id, semester) === "confirmed")) return "ensemble";
  return null;
}

/** 认定落档（批次 BS）：同口径重复点不追加记录。第三次翻动 = 该条目自行申请降级（跨学期不回来）。
 *  没有确认弹窗，没有撤销按钮——否认就是否认。返回最新层级。 */
export function setExistenceVerdict(frogId: FrogCharacterId, verdict: "confirmed" | "denied"): ExistenceTier {
  const save = loadGameSave();
  if ((save.selfDemoted ?? []).includes(frogId)) return "demoted";
  const semester = save.playthrough;
  const log = save.existenceLog ?? [];
  const latest = existenceVerdictOf(save, frogId, semester);
  if (latest === verdict) return existenceTierOf(save, frogId, semester);
  const nextLog = [...log, { semester, frogId, verdict }].slice(-24);
  const toggles = nextLog.filter((item) => item.frogId === frogId && item.semester === semester).length;
  const demoted = toggles >= 3 ? [...new Set([...(save.selfDemoted ?? []), frogId])] : (save.selfDemoted ?? []);
  persistGameSave({ ...save, existenceLog: nextLog, selfDemoted: demoted });
  return existenceTierOf(loadGameSave(), frogId, semester);
}

/** 编目说明看过（批次 BS）：权限说明只讲一次——之后它只替你执行，不再解释 */
export function markExistenceIntroSeen(): void {
  const save = loadGameSave();
  if (save.existenceIntroSeen) return;
  persistGameSave({ ...save, existenceIntroSeen: true });
}
/* ---------- 被记录的社会面（批次 AJ）：传话 / 借沉默 / 替人背档案 ---------- */

/** 传话（批次 AJ）：你说过的一句真话在别的蛙嘴里走——记一手数（同一句传了几手，跨学期保留） */
export function bumpTruthRelay(truth: string): number {
  const save = loadGameSave();
  const key = truth.trim().slice(0, 24);
  const map = { ...(save.truthRelays ?? {}) };
  const next = (map[key] ?? 0) + 1;
  map[key] = next;
  persistGameSave({ ...save, truthRelays: map });
  return next;
}

/** 读某句真话已经传了几手（旧档缺字段按 0） */
export function getTruthRelayCount(truth: string): number {
  return loadGameSave().truthRelays?.[truth.trim().slice(0, 24)] ?? 0;
}

/**
 * 借沉默（批次 AJ）：把沉默值借给别的蛙——当场扣，到期连本带息还。
 * 同一时刻只允许一笔出借；余额不足或还有未清的账时借不出去。
 */
export function lendSilence(amount: number, repay: number): boolean {
  if (amount <= 0 || repay <= amount) return false;
  const save = loadGameSave();
  if (save.silenceValue < amount) return false;
  if ((save.silenceLoan ?? 0) > 0) return false;
  persistGameSave({ ...addSilence(-amount), silenceLoan: repay });
  return true;
}

/** 还沉默（批次 AJ）：到期连本带息收回——下一个深夜事件里还回来，含利息 */
export function repaySilence(): number {
  const save = loadGameSave();
  const loan = save.silenceLoan ?? 0;
  if (loan <= 0) return 0;
  persistGameSave({ ...addSilence(loan), silenceLoan: 0 });
  return loan;
}

/** 替人背档案（批次 AJ）：把别人的记录认到自己名下——被注意值 +2；每天最多一次 */
export function carryDossier(): number | null {
  const save = loadGameSave();
  const day = dayOfDoneCount(countCompletedLines(save));
  if ((save.lastCarryDay ?? 0) >= day) return null;
  const next = (save.carried ?? 0) + 1;
  persistGameSave({ ...addAttention(2), carried: next, lastCarryDay: day });
  return next;
}

/** 沉默被听见（批次 AK）：标记本学期已播过那场三句对话（每学期一次） */
export function markSilenceHeard(): void {
  const save = loadGameSave();
  if (save.silenceHeardPlayed) return;
  persistGameSave({ ...save, silenceHeardPlayed: true });
}

/* ---------- 被重置（批次 AL）：被注意值清零——名单先知道，档案留一行 ---------- */

/**
 * 被重置：被注意值清零，重置计数 +1（跨学期保留）。
 * cost = 代价（申请重置要盖一个章，章收 3 点沉默；约谈之后系统替你办，收 0）。
 * 返回重置前的被注意值（供档案腔引用）。
 */
export function resetAttention(cost: number): number {
  const save = loadGameSave();
  const before = save.attention;
  persistGameSave({ ...addSilence(-cost), attention: 0, resets: (save.resets ?? 0) + 1 });
  return before;
}

/** 读重置次数（旧档缺字段按 0） */
export function getResets(): number {
  return loadGameSave().resets ?? 0;
}

/* ---------- 混合种子（批次 AM）：两颗种子放进同一台机器 ---------- */

/** 读本局的混种谱系（非混种返回 null） */
export function getSeedParents(): [number, number] | null {
  return loadGameSave().seedParents ?? null;
}

/** 混种回响已播（本学期一次；开学期重置） */
export function markHybridEchoed(): void {
  const save = loadGameSave();
  if (save.hybridEchoPlayed) return;
  persistGameSave({ ...save, hybridEchoPlayed: true });
}

/* ---------- 合上档案柜（批次 AN）：闭柜不在流程里，所以没有人记录这件事 ---------- */

/** 合上档案柜：闭柜动作本身没有格子收，档案只数次数——返回这是第几次合上 */
export function closeCabinet(): number {
  const save = loadGameSave();
  const closes = (save.cabinetCloses ?? 0) + 1;
  persistGameSave({ ...save, cabinetClosed: true, cabinetClosedAt: Date.now(), cabinetCloses: closes });
  return closes;
}

/** 再打开一次：柜子不问为什么——返回这是第几次打开 */
export function openCabinet(): number {
  const save = loadGameSave();
  const opens = (save.cabinetOpens ?? 0) + 1;
  persistGameSave({ ...save, cabinetClosed: false, cabinetOpens: opens });
  return opens;
}

/* ---------- 沉默主动消耗（批次 AO）：把攒下的沉默交出去，换名单上那一笔淡一点 ---------- */

/**
 * 主动消耗沉默：交出 3 点沉默，被注意值 −2（你终于开口说话了，所以没人再盯着你）。
 * 每天最多一次；没有可淡的名单（被注意值为 0）或沉默不足 3 点时办不成。
 * 返回这是累计第几次交出（供档案腔引用）；办不成返回 null。
 */
export function spendSilence(): number | null {
  const save = loadGameSave();
  const day = dayOfDoneCount(countCompletedLines(save));
  if (save.silenceValue < 3) return null;
  if (save.attention <= 0) return null;
  if ((save.lastSpendDay ?? 0) >= day) return null;
  const next = (save.silenceSpent ?? 0) + 1;
  persistGameSave({ ...addSilence(-3), ...addAttention(-2), silenceSpent: next, lastSpendDay: day });
  return next;
}

/** 读档计数（批次 AF）：同一页被翻回来的次数——第三次起，纸开始起毛 */
export function bumpLoadCount(lineId: string): number {
  const save = loadGameSave();
  const counts = { ...(save.loadCounts ?? {}) };
  const next = (counts[lineId] ?? 0) + 1;
  counts[lineId] = next;
  persistGameSave({ ...save, loadCounts: counts });
  return next;
}

/** 停止记录态（批次 AG，默认关）：设置开了「未编目之后停止记录」且 30 种结局已全部解锁——
 *  系统不再收真话、不再记档案、不再解锁新结局。玩家会开始怀疑：那它真的发生了吗。 */
export function isRecordingMuted(): boolean {
  const settings = loadSettings();
  if (!settings.muteAfterSecret) return false;
  return loadGameSave().unlockedEndings.length >= totalEndingCount();
}

const INFECTION_KEY = "naiwa-univ-infection";

/** 沉默污染计数（批次 AG）：每读一次空白档 +1；柜子里开始变白的格子数。不可逆。 */
export function loadInfection(): number {
  try {
    const raw = window.localStorage.getItem(INFECTION_KEY);
    return raw ? Math.max(0, Math.round(Number(raw))) : 0;
  } catch {
    return 0;
  }
}

export function bumpInfection(): number {
  const next = loadInfection() + 1;
  try {
    window.localStorage.setItem(INFECTION_KEY, String(next));
  } catch {
    /* 同上 */
  }
  return next;
}

/** 空白归档的档位标签（批次 AG）：这一档没有内容——读进去只有光标在闪 */
export const BLANK_SLOT_LABEL = "（空白）";

const BLANK_NOTE_PREFIX = "naiwa-univ-blank-note-";

/** 读取空白档里玩家写下的话（空串 = 还没写） */
export function loadBlankNote(slotId: string): string {
  try {
    return window.localStorage.getItem(BLANK_NOTE_PREFIX + slotId) ?? "";
  } catch {
    return "";
  }
}

/** 写下空白档的内容：即写即存 */
export function persistBlankNote(text: string, slotId: string): void {
  try {
    window.localStorage.setItem(BLANK_NOTE_PREFIX + slotId, text.slice(0, 400));
  } catch {
    /* 同上 */
  }
}

/** 以空白归档（批次 AG，设置里可开）：存一份没有内容的档——读档数会污染柜子（不可逆） */
export function writeBlankSlot(id: SlotId): SavedSlot {
  const payload: SavedSlot = {
    stamp: Date.now(),
    label: BLANK_SLOT_LABEL,
    lastLineId: "",
    save: loadGameSave(),
    choiceSemesters: loadChoiceSemesters(),
    picked: loadPickedThisSemester(),
  };
  return writeSlot(id, payload);
}

/** 抹去一颗种子（批次 AE）：把某一学期的局号从档案上删掉——不存在的东西不占格子，
 *  但抹除这个动作本身要占：被抹去的学期数攒满三，异常卷宗《无档》解锁。 */
export function eraseSeed(playthrough: number): boolean {
  const save = loadGameSave();
  if (!(save.dossiers ?? []).some((item) => item.playthrough === playthrough && item.seedCode)) return false;
  const list = (save.dossiers ?? []).map((item) =>
    item.playthrough === playthrough ? { ...item, seedCode: undefined, erased: true } : item,
  );
  persistGameSave({ ...save, dossiers: list, erasedSemesters: (save.erasedSemesters ?? 0) + 1 });
  return true;
}

/** 撕掉一页档案（批次 AD）：把已解锁的结局从图鉴里撕下去——内容消失，撕口留下；
 *  撕口的另一半在玩家手里。跨学期保留，凑满三页解锁《残卷》。 */
export function tearEnding(endingId: string): boolean {
  const save = loadGameSave();
  const trimmed = endingId.trim();
  if (trimmed.length === 0) return false;
  const torn = save.tornEndings ?? [];
  if (torn.includes(trimmed)) return false;
  persistGameSave({ ...save, tornEndings: [...torn, trimmed] });
  return true;
}

/** 记一笔涂改（批次 AC）：把说过的话从档案上改掉——跨学期保留，下一周目以「更正记录」重现 */
export function recordTamper(original: string): boolean {
  const save = loadGameSave();
  const trimmed = original.trim();
  if (trimmed.length === 0) return false;
  const log = save.tamperLog ?? [];
  if (log.includes(trimmed)) return false;
  persistGameSave({ ...save, tamperLog: [...log, trimmed] });
  return true;
}

/** 补记认领已播（批次 AB）：每学期只念一次玩家补的那句；开新学期时由 resetGameSave 重置 */
export function markDossierEchoed(): GameSaveData {
  const save = loadGameSave();
  if (save.dossierEchoPlayed) return save;
  return persistGameSave({ ...save, dossierEchoPlayed: true });
}

/** 旧结局渗入已播（批次 AB）：每学期只渗一次旧卷宗；开新学期时重置 */
export function markArchiveClaimPlayed(): GameSaveData {
  const save = loadGameSave();
  if (save.archiveClaimPlayed) return save;
  return persistGameSave({ ...save, archiveClaimPlayed: true });
}

/** 本人补记（批次 AA）：把玩家写的那句写进指定学期的档案页——档案照收，不加批语 */
export function updateDossierNote(playthrough: number, note: string): GameSaveData {
  const save = loadGameSave();
  const list = (save.dossiers ?? []).map((item) =>
    item.playthrough === playthrough ? { ...item, playerNote: note.slice(0, 60) } : item,
  );
  return persistGameSave({ ...save, dossiers: list });
}

/**
 * 记下某条线的片头已看过（批次 J 起）：跳过和播完都算看过，之后不再自动播（一次性，跨周目保留）。
 */
export function markOpSeen(lineId: string): GameSaveData {
  const save = loadGameSave();
  if (save.opSeen?.[lineId]) return save;
  return persistGameSave({ ...save, opSeen: { ...save.opSeen, [lineId]: true } });
}

/* ---------- 已做过的选项（防止重玩时沉默值与好感重复累计） ---------- */

const CHOICES_KEY = "naiwa-univ-choices-v1";

export function loadAnsweredChoiceIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHOICES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberChoiceId(choiceKey: string): void {
  try {
    const known = loadAnsweredChoiceIds();
    if (known.includes(choiceKey)) return;
    window.localStorage.setItem(CHOICES_KEY, JSON.stringify([...known, choiceKey]));
  } catch {
    /* 忽略 */
  }
}

/* ---------- 选项学期档案（二周目回响用） ---------- */

/**
 * 每个选项首次被选是在第几学期（choiceKey → 学期号）。
 * 独立落盘、跨周目保留（resetGameSave 不清）；与 CHOICES_KEY 完全分开，不动旧格式。
 * 旧档没有这条 key = 「学期未知」：回响判定把未知视为更早学期，升级后第一次重选即触发回响。
 */
const CHOICE_SEMESTERS_KEY = "naiwa-univ-choice-semesters-v1";

/** 读学期档案（值非正整数的条目按损坏丢弃；旧档无 key 返回空对象） */
export function loadChoiceSemesters(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CHOICE_SEMESTERS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key !== "string" || !key) continue;
      if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 1) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 盖章：记录选项首次被选的学期（幂等，只保留最早学期）。
 * 已有记录且 ≤ 当前学期号时不覆写——防止把「第 1 学期选过」改成「第 3 学期才选过」；
 * 无记录或记录比当前学期晚（理论不该发生，防御旧档手工改动）才写入。
 */
export function rememberChoiceSemester(choiceKey: string, playthrough: number): void {
  const current = Math.max(1, Math.round(playthrough));
  if (!choiceKey || !Number.isFinite(current)) return;
  try {
    const known = loadChoiceSemesters();
    const prior = known[choiceKey];
    if (prior !== undefined && prior <= current) return;
    known[choiceKey] = current;
    window.localStorage.setItem(CHOICE_SEMESTERS_KEY, JSON.stringify(known));
  } catch {
    /* 隐私模式写不进就当没记，回响判定按学期未知处理 */
  }
}

/* ---------- 本学期选过的选项（岔路收束用） ---------- */

/**
 * 「这个学期你选过哪些选项」的流水（choiceKey 按选择顺序追加）。
 * 学期号对不上当前学期时整体换代：消费方读到学期不匹配就当空表处理。
 * 独立落盘、随学期起止自然更替；与 CHOICES_KEY / CHOICE_SEMESTERS_KEY 完全分开。
 */
const PICKED_SEMESTER_KEY = "naiwa-univ-picked-semester-v1";

export interface PickedThisSemester {
  /** 这份流水对应的学期号（0 = 无效/旧档） */
  semester: number;
  /** 本学期选过的选项 key，按选择顺序追加 */
  keys: string[];
}

/** 读本学期选项流水（旧档无 key 或格式异常按学期 0、空表处理） */
export function loadPickedThisSemester(): PickedThisSemester {
  if (typeof window === "undefined") return { semester: 0, keys: [] };
  try {
    const raw = window.localStorage.getItem(PICKED_SEMESTER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return { semester: 0, keys: [] };
    const obj = parsed as Record<string, unknown>;
    const semester =
      typeof obj.semester === "number" && Number.isFinite(obj.semester)
        ? Math.max(0, Math.round(obj.semester))
        : 0;
    const keys = Array.isArray(obj.keys)
      ? obj.keys.filter((key): key is string => typeof key === "string" && key.length > 0)
      : [];
    return { semester, keys };
  } catch {
    return { semester: 0, keys: [] };
  }
}

/** 记一笔「本学期选过这个选项」：学期换代时整表重开，key 幂等去重（追加顺序保留） */
export function recordPickThisSemester(choiceKey: string, playthrough: number): void {
  const current = Math.max(1, Math.round(playthrough));
  if (!choiceKey || !Number.isFinite(current)) return;
  const prior = loadPickedThisSemester();
  const next: PickedThisSemester =
    prior.semester === current
      ? { semester: current, keys: prior.keys.includes(choiceKey) ? prior.keys : [...prior.keys, choiceKey] }
      : { semester: current, keys: [choiceKey] };
  try {
    window.localStorage.setItem(PICKED_SEMESTER_KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式写不进就当没记，岔路收束按空表处理 */
  }
}

/** 常规线完成了几条（湖边隐藏线不计入） */
export function countCompletedLines(save: GameSaveData): number {
  return REGULAR_LINE_IDS.filter((id) => save.completedLines.includes(id)).length;
}

/** 常规线全通才解锁湖边 */
export function isLakeUnlocked(save: GameSaveData): boolean {
  return REGULAR_LINE_IDS.every((id) => save.completedLines.includes(id));
}

export type LineState = "completed" | "progress" | "ready" | "locked";

/** 单条剧情线在地图上的角标状态 */
/**
 * 线路状态（批次 T 路线结构重排）：
 * - 完成过的线 → completed；
 * - 湖边隐藏线：九条常规线全通才开放（不变）；
 * - 走过的线 → progress；
 * - **共通线结构**：新档与新学期先走共通线——教学线（共通性质）随时可走，其余按「认定」解锁；
 * - **旧档自由模式**：有进度但从未认定的旧档维持旧行为（全部 ready），不锁死老玩家。
 */
export function lineState(save: GameSaveData, lineId: StorylineId): LineState {
  if (save.completedLines.includes(lineId)) return "completed";
  const meta = storylineById(lineId);
  if (meta?.hidden && !isLakeUnlocked(save)) return "locked";
  if (save.visitedLines.includes(lineId)) return "progress";
  if (isFreeRoamSave(save)) return "ready";
  return unlockedLineIdsOf(save).includes(lineId) ? "ready" : "locked";
}

/**
 * 自由模式判定（批次 T）：有进度但从未走过第 5 天意向表的旧档——它们的玩法结构在
 * 路线重排之前就已建立，维持全部可进，避免锁死。新档（零进度）与新学期（重置后）走新结构。
 */
export function isFreeRoamSave(save: GameSaveData): boolean {
  if (save.lockedRoute) return false;
  return save.completedLines.length > 0 || save.visitedLines.length > 0;
}

/**
 * 当前学期解锁的剧情线（批次 T）：
 * - 教学线恒解锁（共通性质——开学第一天的故事，共通线期间随时可走）；
 * - 医务室线恒解锁（第十条线批次——不舒服不需要认定，随时允许发生）；
 * - 认定蛙 → 主场线 + 客串线（灰灰 / 格格连带宿舍楼）；
 * - 未认定 → 只有教学线和医务室线。
 */
export function unlockedLineIdsOf(save: GameSaveData): StorylineId[] {
  const out: StorylineId[] = ["first-class", "sick-note"];
  const frog = getLockedRoute(save);
  if (frog) {
    for (const lineId of ROUTE_UNLOCK_LINES[frog] ?? []) out.push(lineId);
  }
  return out;
}

/**
 * 线 → 所属蛙（批次 T·U）：锁定提示的「预告」用。九条常规线各归属到可认定蛙；
 * 教学线是共通性质不在此表（它恒解锁）；湖边按隐藏线规则走。
 */
const LINE_FROGS: Partial<Record<string, string[]>> = {
  "roll-king": ["moMo"],
  club: ["meiMei"],
  lawn: ["huiHui"],
  canteen: ["ganFanShu"],
  "self-study": ["zaiZai"],
  administration: ["geGe"],
  "lights-out": ["huiHui", "geGe"],
};

/** 锁定原因（批次 T 起，批次 U 泛化）：地图上的锁定建筑与列表显示这行档案腔提示；可进的线返回 null */
export function lineLockHintOf(save: GameSaveData, lineId: StorylineId): string | null {
  if (lineState(save, lineId) !== "locked") return null;
  const frog = getLockedRoute(save);
  const owners = (LINE_FROGS[lineId] ?? []).map((id) => FROG_LOCK_NAMES[id]).filter(Boolean);
  const ownerText = owners.length === 1 ? owners[0] : owners.length === 2 ? `${owners[0]}和${owners[1]}` : "";
  if (!frog) {
    return ownerText
      ? `先走完共通线。周五的意向表会问你想走近谁——这条线，是${ownerText}的。`
      : "先走完共通线。周五的意向表会问你想走近谁。";
  }
  const frogName = FROG_LOCK_NAMES[frog] ?? "";
  return ownerText
    ? `本学期认定的是${frogName}。${ownerText}的故事，下学期再认定一次。`
    : `本学期认定的是${frogName}。想走这条线，下学期再认定一次。`;
}

/** 认定蛙 → 解锁的剧情线（批次 T）：主场 + 客串；灰灰与格格的客串场都在宿舍楼 */
const ROUTE_UNLOCK_LINES: Record<string, StorylineId[]> = {
  moMo: ["roll-king"],
  meiMei: ["club"],
  huiHui: ["lawn", "lights-out"],
  ganFanShu: ["canteen"],
  zaiZai: ["self-study"],
  geGe: ["administration", "lights-out"],
};

/** 认定蛙的显示名（锁定提示用；避免依赖 characters 模块的循环引用，此处维护一份） */
const FROG_LOCK_NAMES: Record<string, string> = {
  moMo: "抹抹",
  meiMei: "莓莓",
  huiHui: "灰灰",
  ganFanShu: "干饭叔",
  zaiZai: "再再",
  geGe: "格格",
}

/* ---------- 主题 ---------- */

export function loadTheme(): ThemeId {
  if (typeof window === "undefined") return "cream";
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return raw === "candy" || raw === "paper" ? raw : "cream";
  } catch {
    return "cream";
  }
}

/** 把主题挂到 body 的 data-theme 上（cream 为默认主题，不需要属性） */
export function applyThemeToDocument(themeId: ThemeId): void {
  if (typeof document === "undefined") return;
  if (themeId === "cream") {
    delete document.body.dataset.theme;
  } else {
    document.body.dataset.theme = themeId;
  }
}

/**
 * 把阅读舒适度设置挂到文档上（批次 CY-27）：
 * 字号动的是 html 基准字号（rem 体系整页跟着缩放）；行距 / 减少动效 / 高对比
 * 是 body 上的 data 开关，样式规则见 index.css——开关挂 body 与主题同层，不会被主题 token 盖掉。
 */
export function applyReadComfort(
  settings: Pick<GameSettings, "textScale" | "lineSpacing" | "reduceMotion" | "highContrast" | "nightLamp">,
): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize =
    settings.textScale === "small" ? "93.75%" : settings.textScale === "large" ? "112.5%" : "";
  const body = document.body;
  if (settings.lineSpacing === "normal") delete body.dataset.lineSpacing;
  else body.dataset.lineSpacing = settings.lineSpacing;
  if (settings.reduceMotion) body.dataset.reduceMotion = "on";
  else delete body.dataset.reduceMotion;
  if (settings.highContrast) body.dataset.highContrast = "on";
  else delete body.dataset.highContrast;
  if (settings.nightLamp) body.dataset.nightLamp = "on";
  else delete body.dataset.nightLamp;
}

export function persistTheme(themeId: ThemeId): ThemeId {
  applyThemeToDocument(themeId);
  try {
    window.localStorage.setItem(THEME_KEY, themeId);
  } catch {
    /* 忽略 */
  }
  return themeId;
}

/* ---------- 音效开关 ---------- */

/** 音效开关（localStorage 持久化，缺省开；旧档与隐私模式读不到按开处理） */
export function loadSoundOn(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(SOUND_KEY);
    if (raw === null) return true;
    return raw !== "0";
  } catch {
    return true;
  }
}

/** 记住音效开关；resetGameSave 不碰这条 key，静音偏好跨周目保留 */
export function persistSoundOn(on: boolean): boolean {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    /* 隐私模式下写不进就当没存，本次会话内开关仍然生效 */
  }
  return on;
}

/* ---------- 设置：文字速度 / 自动间隔 / 音量（galgame 外壳批次 A） ---------- */

export type TextSpeedId = "slow" | "normal" | "fast" | "instant";

/** 文字速度 → 打字机每字间隔毫秒（慢 60 / 正常 26 / 快 12 / 瞬间 0） */
export const TEXT_SPEED_MS: Record<TextSpeedId, number> = {
  slow: 60,
  normal: 26,
  fast: 12,
  instant: 0,
};

export const TEXT_SPEED_OPTIONS: Array<{ id: TextSpeedId; label: string; hint: string }> = [
  { id: "slow", label: "慢", hint: "逐字品读" },
  { id: "normal", label: "正常", hint: "默认节奏" },
  { id: "fast", label: "快", hint: "带一点风" },
  { id: "instant", label: "瞬间", hint: "整句瞬显" },
];

/** 自动播放三档：快 / 正常 / 慢 */
export const AUTO_SPEED_OPTIONS: Array<{
  id: "fast" | "normal" | "slow";
  label: string;
  ms: 900 | 1700 | 2600;
}> = [
  { id: "fast", label: "快", ms: 900 },
  { id: "normal", label: "正常", ms: 1700 },
  { id: "slow", label: "慢", ms: 2600 },
];

/** 学期纪念册的一页（批次 CY-37）：结档瞬间（开新学期 / 冬眠 / 蜕皮都算）自动收进——
 *  「本学期」字段来自进行时数值，「累计」字段是结档那一刻的总量，视图层分开措辞 */
export interface SemesterMemo {
  /** 第几学期结的档 */
  semester: number;
  /** 结档时刻（毫秒时间戳，排序与展示用） */
  stamp: number;
  /** 本学期走完成的剧情线名（标题字面） */
  lines: string[];
  /** 本学期沉默值终值 */
  silence: number;
  /** 本学期印象分（表演分） */
  reputation: number;
  /** 本学期被注意值 */
  attention: number;
  /** 本学期真话点数（好感总和） */
  truths: number;
  /** 结档时图鉴累计已收结局数 */
  endings: number;
  /** 结档时真话罐累计句数 */
  jar: number;
  /** 结档时深夜事件累计段数 */
  nights: number;
  /** 结档时钉过心的结局页数 */
  pins: number;
  /** 结档时写过页边批注的行数 */
  notes: number;
  /** 结档时听得最多的曲目 id（从没听过为空串） */
  topTrack: string;
  /** 结档那天的天气字面（批次 CY-56）：按学期种子确定性推得；旧页没这栏就是空串 */
  weather: string;
}

/** 图鉴筛选组合（批次 CY-143）：一组筛选条件的快照——线/档位/撕页/集齐/钉心/检索一次带回 */
export interface GalleryPreset {
  id: string;
  name: string;
  lineId: string | null;
  tier: "all" | "真话档" | "转述档" | "沉默档";
  tornOnly: boolean;
  incompleteOnly: boolean;
  favoritesOnly: boolean;
  query: string;
}

export interface GameSettings {
  textSpeed: TextSpeedId;
  autoMs: 900 | 1700 | 2600;
  /** 音效音量 0-1（audio.ts 内部相乘，不改对外签名） */
  volume: number;
  /** BGM 开关（bgm.ts 读取；与音效开关分开，批次 B1） */
  bgmOn: boolean;
  /** BGM 音量 0-1（独立于音效音量 volume，bgm.ts 内部相乘） */
  bgmVolume: number;
  /** BGM 基调（批次 CY）：玩家在配乐菜单里选的整库底色，bgm.ts 读取；"milk" = 原曲 */
  bgmKeynote: string;
  /** BGM 基调自动跟场面（批次 CY-12）：开启后场景/天气变了，基调跟着推荐换；默认关 */
  bgmAutoKeynote: boolean;
  /** BGM 播放次数（批次 CY-15）：曲目 id → 听过几遍，音乐鉴赏里显示「已听 N 次」 */
  bgmPlays: Record<string, number>;
  /** BGM 变奏收藏（批次 CY-24）：「曲目id|基调id」→ 听过次数，图鉴里看每种弹法收没收到 */
  bgmVariantHeard: Record<string, number>;
  /** BGM 上门推荐婉拒账（批次 CY-20）：天气 → 被「再听听」挥手的次数，满 3 该天气不再上门 */
  bgmOfferRefusals: Record<string, number>;
  /** BGM 收藏置顶（批次 CY-33）：曲目 id → 是否收藏；收藏的歌在音乐鉴赏里单列顶上 */
  bgmFavorites: Record<string, boolean>;
  /** 音乐盒连播（批次 CY-144）：开着时正在播的歌每两分钟自动换下一首，走完从头再来 */
  bgmAutoAdvance: boolean;
  /** 念回留痕（批次 CY-145）：最近念回来的组合口令（去重，最多 10 句，新在前） */
  presetRecalls: string[];
  /** 结局收藏置顶（批次 CY-34）：结局 id → 是否钉心；钉心的结局页在图鉴里排到最前 */
  endingFavorites: Record<string, boolean>;
  /** 图鉴筛选组合（批次 CY-143）：存下来的常用筛选组合（最多 8 组，按存入顺序） */
  galleryPresets: GalleryPreset[];
  /** 结局页边批注（批次 CY-35）：结局 id → 你写的一句话（≤60 字），档案原样抄录 */
  endingNotes: Record<string, string>;
  /** 学期纪念册（批次 CY-37）：结档瞬间自动收进的一页页纪念——新学期的门槛踩过一次，这里就多一页（存最近 12 页） */
  memorabilia: SemesterMemo[];
  /** 已存出的纸（批次 CY-42）：每次「存成图」成功登记一笔（文件名 + 时刻），登记簿存最近 20 笔 */
  exportLog: Array<{ name: string; stamp: number }>;
  /** 纪念册补笔（批次 CY-43；CY-53 起可多行）：学期页键 → 你亲手写的话（≤3 行、每行 ≤40 字），印在页上、出图带走 */
  memoNotes: Record<string, string>;
  /** 纪念册钉心（批次 CY-45）：学期页键 → 是否按了心；钉心的页在封面上合计，卡面挂「本册最爱」 */
  memoFavorites: Record<string, boolean>;
  /** 册子添了新页（批次 CY-47）：最近一次在标题界面签收过的纪念页结档时刻；比册子里最新页旧 = 递一次新页 */
  lastSeenMemoStamp: number;
  /** 册尾空白页（批次 CY-54）：不属任何学期的那一页，留给玩家自己落笔（≤6 行、每行 ≤40 字） */
  freeLeaf: string;
  /** 空白页落款（批次 CY-55）：最近一次落笔的时刻；页归 0 = 页还空着 */
  freeLeafStamp: number;
  /** 空白页盖章（批次 CY-59）：玩家自盖的蛙校印——章是自己的，不是档案室的 */
  freeLeafSeal: boolean;
  /** 盖章时刻（批次 CY-60）：空白页这枚章盖于何时；取掉归 0 */
  freeLeafSealStamp: number;
  /** 学期页自盖章（批次 CY-60；CY-61 起值为盖讫时刻）：学期页键 → 盖章时刻（旧档 true 迁为 0 = 盖过但没日期） */
  memoSeals: Record<string, number>;
  /** 沉默等待（批次 V）：关键节点 30 秒无操作自动走沉默分支；默认开，设置里可关 */
  idleWait: boolean;
  /** 未编目之后停止记录（批次 AG，默认关）：全收集后系统不再收真话、不再记档案、不再解锁结局 */
  muteAfterSecret: boolean;
  /** 沉默存档污染（批次 AG，默认关）：允许「以空白归档」并让空白在柜子里蔓延 */
  blankInfection: boolean;
  /** 字号（批次 CY-27）：整页基准字号缩放，读起来省力优先 */
  textScale: "small" | "normal" | "large";
  /** 行距（批次 CY-27）：正文段落行与行的松紧 */
  lineSpacing: "snug" | "normal" | "relaxed";
  /** 减少动效（批次 CY-27，默认关）：开启后全站的呼吸 / 浮出 / 转场动画停下来 */
  reduceMotion: boolean;
  /** 高对比文字（批次 CY-27，默认关）：淡灰的辅助文字提亮成正文色 */
  highContrast: boolean;
  /** 夜灯模式（批次 CY-28，默认关）：整块画面蒙一层暖黄柔光，夜里读剧情不刺眼，与任何主题叠加 */
  nightLamp: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  textSpeed: "normal",
  autoMs: 1700,
  volume: 0.9,
  bgmOn: true,
  bgmVolume: 0.5,
  bgmKeynote: "milk",
  bgmAutoKeynote: false,
  bgmPlays: {},
  bgmVariantHeard: {},
  bgmOfferRefusals: {},
  bgmFavorites: {},
  bgmAutoAdvance: false,
  presetRecalls: [],
  endingFavorites: {},
  endingNotes: {},
  galleryPresets: [],
  memorabilia: [],
  exportLog: [],
  memoNotes: {},
  memoFavorites: {},
  lastSeenMemoStamp: 0,
  freeLeaf: "",
  freeLeafStamp: 0,
  freeLeafSeal: false,
  freeLeafSealStamp: 0,
  memoSeals: {},
  idleWait: true,
  muteAfterSecret: false,
  blankInfection: false,
  textScale: "normal",
  lineSpacing: "normal",
  reduceMotion: false,
  highContrast: false,
  nightLamp: false,
};

const SETTINGS_KEY = "naiwa-univ-settings-v1";

function sanitizeSettings(raw: unknown): GameSettings {
  const out: GameSettings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.idleWait === "boolean") out.idleWait = obj.idleWait;
  /* 阅读舒适度（批次 CY-27）：非法值补默认 */
  if (obj.textScale === "small" || obj.textScale === "normal" || obj.textScale === "large") {
    out.textScale = obj.textScale;
  }
  if (obj.lineSpacing === "snug" || obj.lineSpacing === "normal" || obj.lineSpacing === "relaxed") {
    out.lineSpacing = obj.lineSpacing;
  }
  if (typeof obj.reduceMotion === "boolean") out.reduceMotion = obj.reduceMotion;
  if (typeof obj.highContrast === "boolean") out.highContrast = obj.highContrast;
  if (typeof obj.nightLamp === "boolean") out.nightLamp = obj.nightLamp;
  if (typeof obj.muteAfterSecret === "boolean") out.muteAfterSecret = obj.muteAfterSecret;
  if (typeof obj.blankInfection === "boolean") out.blankInfection = obj.blankInfection;
  if (
    obj.textSpeed === "slow" ||
    obj.textSpeed === "normal" ||
    obj.textSpeed === "fast" ||
    obj.textSpeed === "instant"
  ) {
    out.textSpeed = obj.textSpeed;
  }
  if (obj.autoMs === 900 || obj.autoMs === 1700 || obj.autoMs === 2600) {
    out.autoMs = obj.autoMs;
  }
  if (typeof obj.volume === "number" && Number.isFinite(obj.volume)) {
    out.volume = Math.min(1, Math.max(0, obj.volume));
  }
  /* 图鉴筛选组合（批次 CY-143）：非法条目丢弃，只收字段齐全的，最多 8 组 */
  if (Array.isArray(obj.galleryPresets)) {
    out.galleryPresets = obj.galleryPresets
      .filter(
        (item): item is GalleryPreset =>
          Boolean(item) &&
          typeof (item as GalleryPreset).id === "string" &&
          typeof (item as GalleryPreset).name === "string" &&
          typeof (item as GalleryPreset).query === "string" &&
          ((item as GalleryPreset).tier === undefined ||
            (["all", "真话档", "转述档", "沉默档"] as string[]).includes((item as GalleryPreset).tier)) &&
          typeof (item as GalleryPreset).tornOnly === "boolean" &&
          typeof (item as GalleryPreset).incompleteOnly === "boolean" &&
          typeof (item as GalleryPreset).favoritesOnly === "boolean",
      )
      .slice(0, 8);
  }
  /* BGM（批次 B1）：旧档缺字段补默认 bgmOn=true / bgmVolume=0.5 */
  if (typeof obj.bgmOn === "boolean") out.bgmOn = obj.bgmOn;
  if (typeof obj.bgmVolume === "number" && Number.isFinite(obj.bgmVolume)) {
    out.bgmVolume = Math.min(1, Math.max(0, obj.bgmVolume));
  }
  /* BGM 基调（批次 CY）：旧档缺字段补默认 milk；非法值由 bgm.ts 兜回原曲 */
  if (typeof obj.bgmKeynote === "string") out.bgmKeynote = obj.bgmKeynote;
  /* BGM 基调自动跟场面（批次 CY-12）：旧档缺字段补默认关 */
  if (typeof obj.bgmAutoKeynote === "boolean") out.bgmAutoKeynote = obj.bgmAutoKeynote;
  /* BGM 播放次数（批次 CY-15）：只收非负有限数，脏条目丢弃 */
  if (obj.bgmPlays && typeof obj.bgmPlays === "object") {
    const plays: Record<string, number> = {};
    for (const [key, value] of Object.entries(obj.bgmPlays as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        plays[key] = Math.min(99999, Math.floor(value));
      }
    }
    out.bgmPlays = plays;
  }
  /* BGM 变奏收藏（批次 CY-24）：键是「曲目id|基调id」，只收非负有限数，脏条目丢弃 */
  if (obj.bgmVariantHeard && typeof obj.bgmVariantHeard === "object") {
    const variants: Record<string, number> = {};
    for (const [key, value] of Object.entries(obj.bgmVariantHeard as Record<string, unknown>)) {
      if (typeof key === "string" && key.includes("|") && typeof value === "number" && Number.isFinite(value) && value >= 0) {
        variants[key] = Math.min(9999, Math.floor(value));
      }
    }
    out.bgmVariantHeard = variants;
  }
  /* BGM 收藏置顶（批次 CY-33）：只收值为 true 的条目，取消收藏直接键删除 */
  if (obj.bgmFavorites && typeof obj.bgmFavorites === "object") {
    const favorites: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(obj.bgmFavorites as Record<string, unknown>)) {
      if (value === true) favorites[key] = true;
    }
    out.bgmFavorites = favorites;
  }
  /* 音乐盒连播（批次 CY-144）：旧档缺字段补默认关 */
  if (typeof obj.bgmAutoAdvance === "boolean") out.bgmAutoAdvance = obj.bgmAutoAdvance;
  /* 念回留痕（批次 CY-145）：只收非空短句，最多 10 条 */
  if (Array.isArray(obj.presetRecalls)) {
    out.presetRecalls = obj.presetRecalls
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item.length <= 120)
      .slice(0, 10);
  }
  /* 结局收藏置顶（批次 CY-34）：只收值为 true 的条目，取消钉心直接键删除 */
  if (obj.endingFavorites && typeof obj.endingFavorites === "object") {
    const favorites: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(obj.endingFavorites as Record<string, unknown>)) {
      if (value === true) favorites[key] = true;
    }
    out.endingFavorites = favorites;
  }
  /* 结局页边批注（批次 CY-35）：只收去空白后非空的字符串，超 60 字截断 */
  if (obj.endingNotes && typeof obj.endingNotes === "object") {
    const notes: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj.endingNotes as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim().length > 0) {
        notes[key] = value.trim().slice(0, 60);
      }
    }
    out.endingNotes = notes;
  }
  /* 学期纪念册（批次 CY-37）：一页一页清洗，脏字段兜安全值，只留最后 12 页 */
  if (Array.isArray(obj.memorabilia)) {
    const pages: SemesterMemo[] = [];
    for (const item of obj.memorabilia as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const raw = item as Record<string, unknown>;
      const safeNum = (value: unknown): number =>
        typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
      pages.push({
        semester: Math.max(1, safeNum(raw.semester) || 1),
        stamp: safeNum(raw.stamp),
        lines: Array.isArray(raw.lines)
          ? (raw.lines as unknown[])
              .filter((line): line is string => typeof line === "string")
              .slice(0, 10)
              .map((line) => line.slice(0, 20))
          : [],
        silence: safeNum(raw.silence),
        reputation: safeNum(raw.reputation),
        attention: safeNum(raw.attention),
        truths: safeNum(raw.truths),
        endings: safeNum(raw.endings),
        jar: safeNum(raw.jar),
        nights: safeNum(raw.nights),
        pins: safeNum(raw.pins),
        notes: safeNum(raw.notes),
        topTrack: typeof raw.topTrack === "string" ? raw.topTrack.slice(0, 24) : "",
        weather: typeof raw.weather === "string" ? raw.weather.slice(0, 4) : "",
      });
    }
    out.memorabilia = pages.slice(-12);
  }
  /* 已存出的纸（批次 CY-42）：只收名字非空的条目，时刻取非负整数，留最后 20 笔 */
  if (Array.isArray(obj.exportLog)) {
    const logs: Array<{ name: string; stamp: number }> = [];
    for (const item of obj.exportLog as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const raw = item as Record<string, unknown>;
      if (typeof raw.name !== "string" || raw.name.trim().length === 0) continue;
      const stamp = typeof raw.stamp === "number" && Number.isFinite(raw.stamp) ? Math.max(0, Math.floor(raw.stamp)) : 0;
      logs.push({ name: raw.name.trim().slice(0, 60), stamp });
    }
    out.exportLog = logs.slice(-20);
  }
  /* 纪念册补笔（批次 CY-43；CY-53 起多行）：每行去空白非空、≤40 字，最多 3 行；册子只存 12 页，笔迹留最近 30 页足够 */
  if (obj.memoNotes && typeof obj.memoNotes === "object") {
    const entries = Object.entries(obj.memoNotes as Record<string, unknown>).filter(
      ([key, value]) =>
        typeof value === "string" && normalizeMemoNote(value).length > 0 && key.trim().length > 0,
    );
    const notes: Record<string, string> = {};
    for (const [key, value] of entries.slice(-30)) {
      notes[key] = normalizeMemoNote(value as string);
    }
    out.memoNotes = notes;
  }
  /* 纪念册钉心（批次 CY-45）：只收 true 条目（同钉心结局口径） */
  if (obj.memoFavorites && typeof obj.memoFavorites === "object") {
    const favorites: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(obj.memoFavorites as Record<string, unknown>)) {
      if (value === true) favorites[key] = true;
    }
    out.memoFavorites = favorites;
  }
  /* 册子新页签收时刻（批次 CY-47）：非负整数，非法补 0 */
  if (typeof obj.lastSeenMemoStamp === "number" && Number.isFinite(obj.lastSeenMemoStamp)) {
    out.lastSeenMemoStamp = Math.max(0, Math.floor(obj.lastSeenMemoStamp));
  }
  /* 册尾空白页（批次 CY-54）：每行去空白、≤40 字、≤6 行；全空 = 页还空着 */
  if (typeof obj.freeLeaf === "string") {
    out.freeLeaf = obj.freeLeaf
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim().slice(0, 40))
      .filter((line) => line.length > 0)
      .slice(0, 6)
      .join("\n");
  }
  /* 空白页落款时刻（批次 CY-55）：非负整数，非法补 0 */
  if (typeof obj.freeLeafStamp === "number" && Number.isFinite(obj.freeLeafStamp)) {
    out.freeLeafStamp = Math.max(0, Math.floor(obj.freeLeafStamp));
  }
  if (typeof obj.freeLeafSeal === "boolean") out.freeLeafSeal = obj.freeLeafSeal;
  if (typeof obj.freeLeafSealStamp === "number" && Number.isFinite(obj.freeLeafSealStamp)) {
    out.freeLeafSealStamp = Math.max(0, Math.floor(obj.freeLeafSealStamp));
  }
  /* 学期页自盖章（批次 CY-60；CY-61 值迁为盖讫时刻）：正整数照收，旧档 true 记 0（盖过、没日期） */
  if (obj.memoSeals && typeof obj.memoSeals === "object") {
    const seals: Record<string, number> = {};
    for (const [key, value] of Object.entries(obj.memoSeals as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) seals[key] = Math.floor(value);
      else if (value === true) seals[key] = 0;
    }
    out.memoSeals = seals;
  }
  /* BGM 上门推荐婉拒账（批次 CY-20）：同样只收非负有限数 */
  if (obj.bgmOfferRefusals && typeof obj.bgmOfferRefusals === "object") {
    const refusals: Record<string, number> = {};
    for (const [key, value] of Object.entries(obj.bgmOfferRefusals as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        refusals[key] = Math.min(9, Math.floor(value));
      }
    }
    out.bgmOfferRefusals = refusals;
  }
  return out;
}

/** 读设置（旧档缺字段补默认 normal / 1700 / 0.9；BGM 补开 / 0.5；损坏按默认处理） */
export function loadSettings(): GameSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 合并写入设置（音效开关单独落盘，这里不碰），返回合并后的完整设置 */
/**
 * 设置也是表态（批次 AW）：改设置这个动作本身会被记录——
 * 你以为设置是给你的便利，设置也是档案。
 */
function describeSettingChange(patch: Partial<GameSettings>): string | null {
  if (patch.textSpeed !== undefined) {
    if (patch.textSpeed === "fast") return "把读字的速度调成了「快」——它不想听完。";
    if (patch.textSpeed === "slow") return "把读字的速度调成了「慢」——它说要听完每一个字。档案照收，不管信不信。";
    return "把读字的速度调回了「正常」——像什么都没发生过。";
  }
  if (patch.autoMs !== undefined) return `把自动播放的间隔调成了 ${Math.round(patch.autoMs / 100) / 10} 秒——它定了自己的节奏。`;
  /* 阅读舒适度（批次 CY-27）：改这些也是表态 */
  if (patch.textScale !== undefined) {
    const scaleLabel = patch.textScale === "small" ? "小" : patch.textScale === "large" ? "大" : "正常";
    return `把字号调成了「${scaleLabel}」——档案不评价字的大小。`;
  }
  if (patch.lineSpacing !== undefined) {
    const spacingLabel = patch.lineSpacing === "snug" ? "紧凑" : patch.lineSpacing === "relaxed" ? "宽松" : "正常";
    return `把行距调成了「${spacingLabel}」——文件的疏密可以自己定。`;
  }
  if (patch.reduceMotion !== undefined)
    return patch.reduceMotion ? "关掉了页面的动效——它想安静一会儿。" : "恢复了页面的动效。";
  if (patch.highContrast !== undefined)
    return patch.highContrast ? "把辅助文字提亮到正文亮度——它想看清每一个字。" : "把辅助文字调回了淡灰。";
  if (patch.nightLamp !== undefined)
    return patch.nightLamp
      ? "开了一盏夜灯——大灯收了，只留一层不刺眼的暖光。"
      : "熄了夜灯——光线放回原样，像重新见了太阳。";
  if (patch.idleWait !== undefined) {
    return patch.idleWait
      ? "把「等待提醒」打开了——它同意被看着。"
      : "把「等待提醒」关掉了——它不需要被催，也不需要被等。";
  }
  if (patch.volume !== undefined) return patch.volume === 0 ? "把音效关到了零——它不想听。" : "把音效调了调。";
  if (patch.bgmOn !== undefined) {
    return patch.bgmOn ? "把音乐打开了——教室里需要一点别的声音。" : "把音乐关掉了——教室里已经够吵了。";
  }
  if (patch.bgmVolume !== undefined) return "把音乐的声音调了调。";
  if (patch.muteAfterSecret !== undefined) return "动了一个没人动过的开关。档案记下了，没有问。";
  /* 钉心也是表态（批次 CY-34）：你最喜欢哪个结局，档案知道 */
  if (patch.endingFavorites !== undefined) return "在图鉴里给一页结局按了颗心。档案没问是哪一页——它猜是那一页。";
  /* 批注也是表态（批次 CY-35）：你在官方文本的页边留下了字 */
  if (patch.endingNotes !== undefined) return "有页结局的页边被添了一行手写字。档案原样抄录，没有润色。";
  /* 出图也登记（批次 CY-42）：纸出了门，柜子留底 */
  if (patch.exportLog !== undefined) return "有一张纸被誊出去带走了。柜子在这一页留了个墨点，注明出档。";
  /* 补笔（批次 CY-43）：这回执笔的不是档案 */
  if (patch.memoNotes !== undefined) return "你在纪念册上补了一行字。这回不是档案执笔——誊写员停了笔，让你写。";
  /* 钉心纪念页（批次 CY-45）：册子里也有你常翻的那一页 */
  if (patch.memoFavorites !== undefined) return "在纪念册的一页上按了颗心。誊写员照实记录：这一页你翻得最勤。";
  /* 空白页落笔（批次 CY-54）：这一回没有表格拦着 */
  if (patch.freeLeaf !== undefined) return "册尾的空白页上落了字。这一回没有栏目、没有口径——只有你自己写的。";
  /* 自盖章（批次 CY-59）：章不是档案室发的 */
  if (patch.freeLeafSeal !== undefined) return "空白页上盖了个章。章是自己刻的——档案室认不认，它没说。";
  /* 学期页盖章（批次 CY-60）：同样的章，盖进了正式页 */
  if (patch.memoSeals !== undefined) return "有一页正式页上也盖了章。档案室看见了，只记了一句：章是自带的。";
  return null;
}

export function saveSettings(patch: Partial<GameSettings>): GameSettings {
  const next = sanitizeSettings({ ...loadSettings(), ...patch });
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式写不进就当没存，本次会话内仍然生效 */
  }
  /* 阅读舒适度（批次 CY-27）：存到哪就生效到哪——字号 / 行距 / 动效 / 对比当场挂上文档 */
  applyReadComfort(next);
  /* 设置也是表态（批次 AW）：改动进系统记录——它不拦你，它记你 */
  const label = describeSettingChange(patch);
  if (label) recordBehavior({ kind: "setting", label });
  return next;
}

/** 结局收藏清单（批次 CY-34）：图鉴里钉过心的结局页 */
export function getEndingFavorites(): Record<string, boolean> {
  return loadSettings().endingFavorites;
}

/** 钉心 / 取心（批次 CY-34）：返回翻转后的状态 */
export function toggleEndingFavorite(endingId: string): boolean {
  const favorites = { ...loadSettings().endingFavorites };
  const next = !favorites[endingId];
  if (next) favorites[endingId] = true;
  else delete favorites[endingId];
  saveSettings({ endingFavorites: favorites });
  return next;
}

/** 读某页结局的页边批注（批次 CY-35）：没写过就是空串 */
export function getEndingNote(endingId: string): string {
  return loadSettings().endingNotes[endingId] ?? "";
}

/** 学期纪念册（批次 CY-37）：结档自动收进的那一页页纪念，图鉴里翻阅 */
export function getMemorabilia(): SemesterMemo[] {
  return loadSettings().memorabilia;
}

/** 读某一页纪念册的补笔（批次 CY-43）：没写过就是空串 */
export function getMemoNote(memoKey: string): string {
  return loadSettings().memoNotes[memoKey] ?? "";
}

/** 补笔归一化（批次 CY-53）：断行去空白、每行 ≤40 字、最多 3 行，空行丢弃 */
export function normalizeMemoNote(raw: string): string {
  return raw
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim().slice(0, 40))
    .filter((line) => line.length > 0)
    .slice(0, 3)
    .join("\n");
}

/** 写 / 擦某一页纪念册的补笔（批次 CY-43；CY-53 起多行）：全空 = 擦掉这些行 */
export function setMemoNote(memoKey: string, note: string): void {
  const notes = { ...loadSettings().memoNotes };
  const trimmed = normalizeMemoNote(note);
  if (trimmed) notes[memoKey] = trimmed;
  else delete notes[memoKey];
  saveSettings({ memoNotes: notes });
}

/** 册尾空白页（批次 CY-54）：读——没落笔就是空串 */
export function getFreeLeaf(): string {
  return loadSettings().freeLeaf;
}

/** 册尾空白页（批次 CY-54；CY-55 落笔同时盖时刻）：写 / 擦——全空 = 页还空着 */
export function setFreeLeaf(text: string): void {
  const normalized = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim().slice(0, 40))
    .filter((line) => line.length > 0)
    .slice(0, 6)
    .join("\n");
  saveSettings({ freeLeaf: normalized, freeLeafStamp: normalized.length > 0 ? Date.now() : 0 });
}

/** 空白页落款时刻（批次 CY-55）：页空着就是 0 */
export function getFreeLeafStamp(): number {
  return loadSettings().freeLeafStamp;
}

/** 空白页自盖章（批次 CY-59；CY-60 盖上同时记时刻）：返回盖没盖 */
export function toggleFreeLeafSeal(): boolean {
  const next = !loadSettings().freeLeafSeal;
  saveSettings({ freeLeafSeal: next, freeLeafSealStamp: next ? Date.now() : 0 });
  return next;
}

/** 空白页这枚章盖于何时（批次 CY-60）：没盖就是 0 */
export function getFreeLeafSealStamp(): number {
  return loadSettings().freeLeafSealStamp;
}

/** 学期页自盖章总表（批次 CY-60；CY-61 值为盖讫时刻，0 = 旧档盖过没日期） */
export function getMemoSeals(): Record<string, number> {
  return loadSettings().memoSeals;
}

/** 学期页盖章 / 取章（批次 CY-60；CY-61 盖上记时刻）：返回盖没盖 */
export function toggleMemoSeal(memoKey: string): boolean {
  const seals = { ...loadSettings().memoSeals };
  const next = seals[memoKey] === undefined;
  if (next) seals[memoKey] = Date.now();
  else delete seals[memoKey];
  saveSettings({ memoSeals: seals });
  return next;
}

/** 纪念册钉心总表（批次 CY-45）：学期页键 → 是否按了心 */
export function getMemoFavorites(): Record<string, boolean> {
  return loadSettings().memoFavorites;
}

/** 给某一页纪念册钉心 / 取心（批次 CY-45）：返回翻转后的状态 */
export function toggleMemoFavorite(memoKey: string): boolean {
  const favorites = { ...loadSettings().memoFavorites };
  const next = !favorites[memoKey];
  if (next) favorites[memoKey] = true;
  else delete favorites[memoKey];
  saveSettings({ memoFavorites: favorites });
  return next;
}

/** 写 / 擦某页结局的页边批注（批次 CY-35）：全空 = 擦掉这一行 */
export function setEndingNote(endingId: string, note: string): void {
  const notes = { ...loadSettings().endingNotes };
  const trimmed = note.trim().slice(0, 60);
  if (trimmed) notes[endingId] = trimmed;
  else delete notes[endingId];
  saveSettings({ endingNotes: notes });
}

/* ---------- 存档槽：6 手动 + 1 自动（整包快照语义） ---------- */

export type SlotId = "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "auto";

export const MANUAL_SLOT_IDS: SlotId[] = ["s1", "s2", "s3", "s4", "s5", "s6"];

export interface SavedSlot {
  /** 保存时间戳 */
  stamp: number;
  /** 展示标签：第 N 学期 · {线名} · {幕名}（由调用方用剧本文案拼） */
  label: string;
  /** 保存时所在的剧情线 id（读档跳转用；空串 = 无上下文，读档回地图） */
  lastLineId: string;
  /** 存档整包快照（深拷贝） */
  save: GameSaveData;
  /** 选项学期档案快照（读档时与当前档案取并集，不删不退） */
  choiceSemesters: Record<string, number>;
  /** 本学期选项流水快照（读档时整包替换） */
  picked: PickedThisSemester;
}

export type SaveSlots = Partial<Record<SlotId, SavedSlot>>;

const SLOTS_KEY = "naiwa-univ-slots-v1";

/** 学期档案条目清洗：key 非空、值 ≥1 的整数，损坏条目丢弃 */
function sanitizeSemesterRecord(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || !key) continue;
    if (typeof value === "number" && Number.isInteger(value) && value >= 1) out[key] = value;
  }
  return out;
}

/** 本学期流水清洗（同 loadPickedThisSemester 的口径，供槽位快照用） */
function sanitizePicked(raw: unknown): PickedThisSemester {
  if (!raw || typeof raw !== "object") return { semester: 0, keys: [] };
  const obj = raw as Record<string, unknown>;
  const semester =
    typeof obj.semester === "number" && Number.isFinite(obj.semester)
      ? Math.max(0, Math.round(obj.semester))
      : 0;
  const keys = Array.isArray(obj.keys)
    ? obj.keys.filter((key): key is string => typeof key === "string" && key.length > 0)
    : [];
  return { semester, keys };
}

/** 深拷贝（数据全是可序列化纯值；异常时退回原引用，不让存档流程中断） */
function deepCopy<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function sanitizeSlot(raw: unknown): SavedSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    stamp: typeof obj.stamp === "number" && Number.isFinite(obj.stamp) ? obj.stamp : 0,
    label: typeof obj.label === "string" ? obj.label : "",
    lastLineId: typeof obj.lastLineId === "string" ? obj.lastLineId : "",
    save: sanitize(obj.save),
    choiceSemesters: sanitizeSemesterRecord(obj.choiceSemesters),
    picked: sanitizePicked(obj.picked),
  };
}

/** 读全部槽位（旧档无 key / 单条损坏按缺失处理，不崩） */
export function loadSlots(): SaveSlots {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SLOTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: SaveSlots = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (key !== "auto" && !MANUAL_SLOT_IDS.includes(key as SlotId)) continue;
      const slot = sanitizeSlot(value);
      if (slot) out[key as SlotId] = slot;
    }
    return out;
  } catch {
    return {};
  }
}

/** 写一个槽位（整包替换该槽位），返回写入的快照 */
export function writeSlot(id: SlotId, payload: SavedSlot): SavedSlot {
  const slots = loadSlots();
  slots[id] = payload;
  try {
    window.localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  } catch {
    /* 隐私模式写不进就当没存 */
  }
  return payload;
}

/** 删除一个槽位（手动档用；自动档入口只读，这里不做守卫） */
export function deleteSlot(id: SlotId): void {
  const slots = loadSlots();
  if (!slots[id]) return;
  delete slots[id];
  try {
    window.localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  } catch {
    /* 忽略 */
  }
}

/**
 * 组装一份槽位快照：读当前三把 key（存档 / 选项学期档案 / 本学期流水）。
 * 只组装不落位——落位交给 writeSlot，由调用方决定写到哪一格。
 */
export function snapshotSlot(label: string, lastLineId: string): SavedSlot {
  return {
    stamp: Date.now(),
    label,
    lastLineId,
    save: deepCopy(loadGameSave()),
    choiceSemesters: deepCopy(loadChoiceSemesters()),
    picked: deepCopy(loadPickedThisSemester()),
  };
}

/** 本学期流水的整包写入（读档用；recordPickThisSemester 是追加语义，不动它） */
function writePickedThisSemesterRaw(picked: PickedThisSemester): void {
  try {
    window.localStorage.setItem(PICKED_SEMESTER_KEY, JSON.stringify(picked));
  } catch {
    /* 忽略 */
  }
}

/**
 * 读档：整包恢复快照，但收集类档案只进不退——
 * unlockedEndings / truthJar / seenNightEvents / seenDayEvents / choiceSemesters 取当前与快照的并集，
 * playthrough 取 max；picked 整包替换；主题 / 音效 / 设置 key 一律不碰。
 * 返回恢复后的 lastLineId 供跳转（槽位不存在返回 null）。
 */
export function restoreSlot(id: SlotId): { lastLineId: string } | null {
  const slots = loadSlots();
  const slot = slots[id];
  if (!slot) return null;
  const current = loadGameSave();
  const snap = slot.save;
  const union = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];
  persistGameSave({
    ...snap,
    playthrough: Math.max(getPlaythrough(current), getPlaythrough(snap)),
    unlockedEndings: union(current.unlockedEndings, snap.unlockedEndings),
    truthJar: union(current.truthJar, snap.truthJar),
    seenNightEvents: union(current.seenNightEvents, snap.seenNightEvents),
    seenDayEvents: union(current.seenDayEvents, snap.seenDayEvents),
    seenCg: union(current.seenCg, snap.seenCg),
    /* 私档（批次 BV）：调阅痕只进不退——快照里没有的调阅记录从当前档里补回去，回档不消失 */
    dossierReads: mergeDossierReads(current.dossierReads, snap.dossierReads),
    updatedAt: Date.now(),
  });
  /* 学期档案取并集：rememberChoiceSemester 只保留最早学期，快照里更晚的盖章不会覆盖当前档案 */
  for (const [choiceKey, semester] of Object.entries(slot.choiceSemesters)) {
    rememberChoiceSemester(choiceKey, semester);
  }
  writePickedThisSemesterRaw(sanitizePicked(slot.picked));
  return { lastLineId: slot.lastLineId };
}

/* ---------- 已读记录：跳过已读用（Record<lineId, 节点 id[]>，每线上限 500 FIFO） ---------- */

export type ReadMap = Record<string, string[]>;

const READ_KEY = "naiwa-univ-read-v1";
const READ_PER_LINE_CAP = 500;

function capReadIds(ids: string[]): string[] {
  return ids.length > READ_PER_LINE_CAP ? ids.slice(ids.length - READ_PER_LINE_CAP) : ids;
}

/** 读已读记录（旧档无 key / 格式异常按空表处理） */
export function loadReadMap(): ReadMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: ReadMap = {};
    for (const [lineId, ids] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof lineId !== "string" || !lineId || !Array.isArray(ids)) continue;
      const clean = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
      out[lineId] = capReadIds(clean);
    }
    return out;
  } catch {
    return {};
  }
}

/** 批量落盘：把内存攒下的已读节点并进持久层（advance 与卸载时调用），失败静默 */
export function flushReadIds(pending: Record<string, string[]>): void {
  const entries = Object.entries(pending);
  if (entries.length === 0) return;
  try {
    const map = loadReadMap();
    for (const [lineId, ids] of entries) {
      if (!lineId || ids.length === 0) continue;
      map[lineId] = capReadIds([...new Set([...(map[lineId] ?? []), ...ids])]);
    }
    window.localStorage.setItem(READ_KEY, JSON.stringify(map));
  } catch {
    /* 隐私模式写不进就当没记，跳过已读按未读处理 */
  }
}

/* ---------- 未编目的一页（全收集限定 · 第四面） ----------
 * 全收集后档案柜最里面那页没有编号的纸。不挂在任何线上、不进学期档案、不随学期清零——
 * 它不属于任何一学期。独立存档键：写下的内容跨学期跨周目保留，下次打开还在。 */

const LOCKED_SEED_KEY = "naiwa-univ-locked-seed";

/** 读取锁定的种子（null = 未锁定，每局重摇） */
export function loadLockedSeed(): number | null {
  try {
    const raw = window.localStorage.getItem(LOCKED_SEED_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) % 1000000 : null;
  } catch {
    return null;
  }
}

/** 锁定 / 解除种子：锁住这颗种子 = 这一局的世界可以反复重走（代价：档案会数你进来了几遍） */
export function persistLockedSeed(seed: number | null): void {
  try {
    if (seed === null) window.localStorage.removeItem(LOCKED_SEED_KEY);
    else window.localStorage.setItem(LOCKED_SEED_KEY, String(Math.max(0, Math.round(seed)) % 1000000));
  } catch {
    /* 存储不可用时静默 */
  }
}

const UNWRITTEN_PAGE_KEY = "naiwa-univ-unwritten-page";
const UNWRITTEN_PAGE_MAX = 2000;

/** 读取这一页上写下的内容（空串 = 还没写过） */
export function loadUnwrittenPage(): string {
  try {
    const raw = window.localStorage.getItem(UNWRITTEN_PAGE_KEY);
    return typeof raw === "string" ? raw.slice(0, UNWRITTEN_PAGE_MAX) : "";
  } catch {
    return "";
  }
}

/** 写下这一页：即写即存；超出上限截断（纸就一张，写不下所有话） */
export function saveUnwrittenPage(text: string): string {
  const trimmed = text.slice(0, UNWRITTEN_PAGE_MAX);
  try {
    window.localStorage.setItem(UNWRITTEN_PAGE_KEY, trimmed);
  } catch {
    /* 存储不可用时静默——这一页本来就是玩家的版本，写不进去也不该报错打断 */
  }
  return trimmed;
}
