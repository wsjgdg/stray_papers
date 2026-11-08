/**
 * 剧情对话页 Logic 层：
 * 读 ?line= → 取剧本 → 拍平成节点流 → 打字机推进 → 选项累计沉默值与好感 → 幕结算 → 结局分档。
 * 好感度系统：关键选项加真话点数；某蛙坦诚度过 40/80 时，在选项后的位置插入该蛙真心话节点；
 * 湖边夜谈按最高好感蛙微调 1-2 句台词；出场 NPC 蛙坦诚度全部 ≥85 时追加全员真话收束段。
 * 系统层（galgame 外壳批次 A）：对话回想 backlog / 已读快进 / 设置接线（文字速度·自动间隔）/ 自动档。
 * 不含 JSX；续播进度与已答选项都写入本地存档，防止重复累计沉默值与好感。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AFFINITY_TIERS,
  FROG_CHARACTERS,
  affinityTierOf,
  type FrogCharacterId,
} from "@/data/characters";
import {
  STORY_SCRIPTS,
  storylineById,
  buildingById,
  type Act,
  type Choice,
  type DialogueLine,
  type Ending,
  type StorylineId,
  type StorylineMeta,
  type StoryScript,
} from "@/data/storylines";
import { expressionForSilence, type FrogExpression } from "@/components/frog/Frog";
import {
  HEART_TALK_THRESHOLDS,
  SELF_ID,
  SELF_TRUTH_DELTA,
  TRUE_FRIEND_THRESHOLD,
  affinityPercent,
  allTrueFriends,
  topTrueFrog,
  type AffinityFlash,
  type HeartTalkLevel,
} from "@/lib/affinity";
import {
  addAffinity,
  addAttention,
  addReputation,
  addSilence,
  addTruth,
  applyThemeToDocument,
  clearLineAct,
  countCompletedLines,
  flushReadIds,
  getAffinity,
  getAttention,
  getLockedRoute,
  getPlaythrough,
  isLakeUnlocked,
  loadAnsweredChoiceIds,
  loadChoiceSemesters,
  loadGameSave,
  loadPickedThisSemester,
  loadReadMap,
  loadSettings,
  loadTheme,
  markCgSeen,
  markLineCompleted,
  markOpSeen,
  markLineVisited,
  persistGameSave,
  persistTheme,
  recordBehavior,
  recordShred,
  recordCroak,
  bumpTruthRelay,
  markSilenceHeard,
  recordPickThisSemester,
  recordPause,
  recordRewind,
  recordFastForward,
  recordStay,
  collusionQuoteOf,
  markCollusion,
  shieldOf,
  applyShield,
  reportOf,
  applyReport,
  recordDeferred,
  upsertDossier,
  rememberChoiceId,
  rememberChoiceSemester,
  saveLineAct,
  saveSettings,
  snapshotSlot,
  TEXT_SPEED_MS,
  unlockEnding,
  writeSlot,
  existenceTierOf,
  latestPlayerReportOf,
  factionJoinedSemesterOf,
  departedFrogsOf,
  departedReturnOf,
  vanishThisSemesterOf,
  markCroakBurst,
  hasCroakBurstThisSemester,
  markMoltPending,
  type ExistenceTier,
  type GameSaveData,
  type GameSettings,
  type ThemeId,
} from "@/lib/gameSave";
import { achievementById, unlockAchievement } from "@/lib/achievements";
import { impressionPercent } from "@/lib/impression";
import { dayOfDoneCount, seedRandom, weatherForDay } from "@/lib/calendar";
import { weatherIntroFor } from "@/data/weatherFlavor";
import { memoryIntroFor, type MemoryIntroLine } from "@/data/newGamePlus";
import { ROUTE_LAKE_LINES, type RouteFrogId } from "@/data/commonRoute";
import { cgSceneById, type CgSceneMeta } from "@/data/cg";
import { OP_PLATES, endingPlateOf, openingPlateOf } from "@/data/scenePlates";
import { dossierComment } from "@/components/endings/DossierSection";
import { privateDossierOfFrog, TRACE_FROG_OF_LINE } from "@/data/privateDossiers";
import { REPORT_TRACE_MARK, reportLineOf } from "@/data/playerReports";
import { FACTIONS, FACTION_INFO_LINES, type FactionId } from "@/data/factions";
import { DEPARTURE_RETURN_MARK, departureMetaOf } from "@/data/departures";
import {
  isSoundOn,
  playSe,
  playSfx,
  setSoundOn,
  startRainAmbience,
  startWindAmbience,
  stopRainAmbience,
  stopWindAmbience,
} from "@/lib/audio";
import type { PlaySeId } from "@/lib/audio";
import {
  bgmCrescendoFinale,
  bgmDuckPulse,
  isBgmOn,
  playBgm,
  playCeremonyJingle,
  releaseBgmHandoff,
  setBgmDuckSustain,
  setBgmOn,
  stopBgm,
  type BgmTrackId,
} from "@/lib/bgm";
import { seedCodeOf } from "@/lib/seedCode";
import { stageTrackOf } from "@/lib/bgmMapping";

/** 跳过已读：已读段每一段的推进间隔（每段最多一声轻嗒） */
const SKIP_READ_MS = 120;
/** 对话历史上限（FIFO） */
const BACKLOG_CAP = 200;

/**
 * 表情差分档位（批次 D1）：NPC 蛙按当前坦诚度单调映射，关系越近表情越柔。
 * 真心蛙友（85+）→ soft / 树洞（55+）→ smile / 饭搭子（25+）→ 维持角色默认（null 不覆盖）/
 * 点头之交（0+）→ frozen。阈值取自称呼四档，不在本文件里另立口径。
 */
const SPEAKER_EXPRESSION_TIERS = {
  soft: AFFINITY_TIERS.find((tier) => tier.id === "true-frog-friend")?.threshold ?? TRUE_FRIEND_THRESHOLD,
  smile: AFFINITY_TIERS.find((tier) => tier.id === "tree-hole")?.threshold ?? 55,
  /** 饭搭子档：不覆盖，维持该蛙预设默认表情 */
  keep: AFFINITY_TIERS.find((tier) => tier.id === "meal-mate")?.threshold ?? 25,
};

/** 各剧情线的 BGM 映射（批次 B1）：进线切该线曲目，二周目前缀层用回响曲，结局相位用终章 */
const LINE_BGM: Record<string, BgmTrackId> = {
  "first-class": "daily",
  "roll-king": "library",
  canteen: "canteen",
  club: "club",
  lawn: "field",
  "self-study": "study",
  administration: "admin",
  lake: "night",
  "lights-out": "night",
  "sick-note": "infirmary",
};

/** 各剧情线的「走完线」成就映射（批次 K 泛化）：结局相位按本表解锁；岔路全走成就由结局图鉴页处理 */
const LINE_ACHIEVEMENT_DONE: Record<string, string> = {
  "lights-out": "ach-dorm-done",
  "roll-king": "ach-library-done",
  canteen: "ach-canteen-done",
  club: "ach-club-done",
  lawn: "ach-fl-done",
  "self-study": "ach-zz-done",
  administration: "ach-xg-done",
  "first-class": "ach-fc-done",
  lake: "ach-lk-done",
  "sick-note": "ach-yj-done",
};

export type PlayPhase = "invalid" | "dialogue" | "choice" | "actSummary" | "ending" | "finale";
export type InvalidReason = "missing-id" | "no-script" | "locked";
export type ActProgressState = "done" | "current" | "todo";

export interface ClosestFrog {
  name: string;
  tierLabel: string;
  percent: number;
}

/** 回想（对话历史）条目：每展示一个台词节点记一条，选项不进历史 */
export interface BacklogEntry {
  speakerName: string;
  text: string;
  innerVoice?: string;
  kind: "narration" | "speech" | "inner" | "choice";
  /** 选择登记（批次 Z·被涂改的历史）：truth=正常字体 / performance=灰色斜体 / silence=空白行 */
  register?: "truth" | "performance" | "silence";
  /** 二周目回响节点 */
  remember?: boolean;
  /** 真心话节点 */
  heart?: boolean;
  /** CG 定格节点：回想面板里加一枚「CG」小徽标（批次 B2） */
  cgTitle?: string;
}

/** 转场演出（批次 B2）：enter 进线黑场揭示 / act 幕间过渡 / ending 结局白闪 / map 返回地图淡出 */
export type SceneTransitionKind = "enter" | "act" | "ending" | "map";

/** 系统层弹层：存读档 / 设置 / 回想三个 overlay 互斥，同一时间只开一个 */
export type SystemOverlayKind = "none" | "save" | "load" | "settings" | "history";

type FlatNode =
  | { kind: "line"; act: Act; actIndex: number; line: DialogueLine }
  | {
      kind: "choice";
      act: Act;
      actIndex: number;
      sceneId: string;
      choices: Choice[];
      /** 在基础剧本流里的位置：真心话节点插在它后面 */
      baseIndex: number;
    };

interface QueuedTalk {
  charId: FrogCharacterId;
  level: HeartTalkLevel;
  baseIndex: number;
  /** 真分支：选项带 branch 时传入，插入段尾节点带 merge 落进该节点（选项 → 真心话 → 分支段落 → 汇流） */
  jumpTo?: string;
}

/** 二周目回响：与 heartTalks 同一套插入机制；内容与跳转目标都从基础流里按 baseIndex + choiceId 现解析 */
interface EchoTalk {
  choiceId: string;
  baseIndex: number;
  /** 真分支：选项带 branch 且该 baseIndex 无排队真心话时，echo 节点带 merge 落进该节点 */
  jumpTo?: string;
}

function flattenScript(script: StoryScript): FlatNode[] {
  const out: FlatNode[] = [];
  for (const act of script.acts) {
    for (const scene of act.scenes) {
      for (const line of scene.lines) {
        out.push({ kind: "line", act, actIndex: act.index, line });
      }
      if (scene.choices && scene.choices.length > 0) {
        out.push({
          kind: "choice",
          act,
          actIndex: act.index,
          sceneId: scene.id,
          choices: scene.choices,
          baseIndex: out.length,
        });
      }
    }
  }
  return out;
}

function quoteByName(quoteBy: Act["quoteBy"]): string {
  if (!quoteBy || quoteBy === "narration") return "";
  return FROG_CHARACTERS[quoteBy].displayName;
}

/** 回想条目的说话人名：旁白 / 角色名 / 「角色名 · 内心」 */
function backlogSpeakerName(line: DialogueLine): string {
  if (line.speakerId === "narration") return "旁白";
  const displayName = FROG_CHARACTERS[line.speakerId as FrogCharacterId]?.displayName ?? "旁白";
  return line.text ? displayName : `${displayName} · 内心`;
}

/* ---------- 湖边夜谈：按最高好感蛙微调 1-2 句台词 ---------- */

const LAKE_TOP_LINES: Partial<
  Record<FrogCharacterId, { lineId: string; text: string; extra: string }>
> = {
  moMo: {
    lineId: "lk-l3",
    text: "（合上计划表）我今晚把发呆排了两小时。备注写的是「劳逸结合」。……给你留了旁边那个位置。",
    extra: "（小声）要是你也没答案……那就先不答。我陪你把最后一截玉米吃完。",
  },
  meiMei: {
    lineId: "lk-l4",
    text: "（笑容比平时小一点，但看起来是真的）我今晚没开美颜。手机放宿舍了。……你来了，就更用不上了。",
    extra: "（轻轻地）不管你怎么答，我都给你鼓掌。不用修图的那种。",
  },
  huiHui: {
    lineId: "lk-l5",
    text: "（躺着）我今天坐起来了。算给你们面子。……你来了的话，我再加练一小时。",
    extra: "（看着湖面）答不答都行。肯坐在这儿想一晚上，已经是半个答案了。",
  },
  ganFanShu: {
    lineId: "lk-l6",
    text: "（提着一桶煮玉米）已……嗯。都趁热吃。公示外的量，今晚我请。",
    extra: "（把最后半根玉米塞给你）答不上来就先吃。天大的事，热的都能压一压。",
  },
};

/** 全员真话收束段：四只 NPC 蛙坦诚度全部 ≥85 时追加在夜谈最后 */
const FINALE_CODA: { speakerId: FrogCharacterId | "narration"; text: string; inner?: string }[] = [
  { speakerId: "narration", text: "风停了一拍。月亮把湖面铺成一张白纸，四只蛙都安静了下来。" },
  {
    speakerId: "moMo",
    text: "……其实我今晚的发呆没排期。我就是想来看看，不排期的日子长什么样。",
  },
  {
    speakerId: "meiMei",
    text: "其实我今天化了妆，只化了心情好的那一半。另一半留素颜，给你们。",
  },
  {
    speakerId: "huiHui",
    text: "其实我不是没有意义。我是在等一个不用先证明意义的早晨。",
  },
  {
    speakerId: "ganFanShu",
    text: "其实牌子背面那行字，我想挂上来好几年了。今天算挂上了。",
  },
  { speakerId: "narration", text: "原来我们都在装。谢谢你没有拆穿。" },
  { speakerId: "naiBai", text: "", inner: "（四只蛙都笑了。这一晚，没有一蛙在营业。）" },
];

/** 把一次真心话变成四个对话节点：摘面具旁白 + 两句真话 + 奶白内心 */
function buildHeartTalkNodes(talk: QueuedTalk, act: Act): FlatNode[] {
  const data = FROG_CHARACTERS[talk.charId].heartTalk;
  if (!data) return [];
  const [start, reaction] = talk.level === 40 ? [0, 0] : [2, 1];
  const talkLine = (line: DialogueLine): FlatNode => ({
    kind: "line",
    act,
    actIndex: act.index,
    line,
  });
  return [
    talkLine({ id: `ht-${talk.level}-${talk.charId}-p`, speakerId: "narration", text: data.preface, heart: true }),
    talkLine({ id: `ht-${talk.level}-${talk.charId}-a`, speakerId: talk.charId, text: data.lines[start], heart: true }),
    talkLine({ id: `ht-${talk.level}-${talk.charId}-b`, speakerId: talk.charId, text: data.lines[start + 1], heart: true }),
    talkLine({ id: `ht-${talk.level}-${talk.charId}-r`, speakerId: SELF_ID, text: "", innerVoice: data.reactions[reaction], heart: true }),
  ];
}

/**
 * 播放流 = 基础剧本流 + 湖边微调 + 二周目回响（选项 → 回响 → 真心话）+ 记忆锚点段 + 全员真话收束段。
 * 回响 / 锚点段纯叙事（remember 节点），不改任何数值；插不进就跳过，不崩。
 */
function buildStream(
  flat: FlatNode[],
  talks: QueuedTalk[],
  echoTalks: EchoTalk[],
  lakeTopFrog: FrogCharacterId | null,
  finaleCoda: boolean,
  playthrough: number,
  resonances: StoryScript["resonances"],
  lineId: string | undefined,
  lockedRoute: RouteFrogId | null,
): FlatNode[] {
  let nodes = flat;

  if (lakeTopFrog) {
    const tweak = LAKE_TOP_LINES[lakeTopFrog];
    if (tweak) {
      nodes = nodes.map((node) => {
        if (node.kind === "line" && node.line.id === tweak.lineId) {
          return { ...node, line: { ...node.line, text: tweak.text, heart: true } };
        }
        return node;
      });
      const insertAt = nodes.findIndex((node) => node.kind === "line" && node.line.id === "lk-l24");
      if (insertAt >= 0) {
        const anchor = nodes[insertAt];
        if (anchor && anchor.kind === "line") {
          const extra: FlatNode = {
            kind: "line",
            act: anchor.act,
            actIndex: anchor.actIndex,
            line: {
              id: `lk-extra-${lakeTopFrog}`,
              speakerId: lakeTopFrog,
              text: tweak.extra,
              heart: true,
            },
          };
          nodes = [...nodes.slice(0, insertAt + 1), extra, ...nodes.slice(insertAt + 1)];
        }
      }
    }
  }

  /* ---------- 路线认定的湖边专属台词（批次 C1）：插在最高好感微调之后、最后一问（lk-l24）之前。
     纯叙事插入：无 remember / heart / merge，不改数值；未锁定路线或找不到锚点就跳过 ---------- */
  if (lockedRoute) {
    const routeLines = ROUTE_LAKE_LINES[lockedRoute] ?? [];
    if (routeLines.length > 0) {
      const insertAt = nodes.findIndex((node) => node.kind === "line" && node.line.id === "lk-l24");
      if (insertAt >= 0) {
        const anchor = nodes[insertAt];
        if (anchor && anchor.kind === "line") {
          const routeNodes: FlatNode[] = routeLines.map((node, index) => ({
            kind: "line" as const,
            act: anchor.act,
            actIndex: anchor.actIndex,
            line: {
              id: `lk-rl-${lockedRoute}-${index}`,
              speakerId: node.speakerId,
              text: node.text,
              innerVoice: node.innerVoice,
            },
          }));
          nodes = [...nodes.slice(0, insertAt), ...routeNodes, ...nodes.slice(insertAt)];
        }
      }
    }
  }

  /* ---------- 真心话组：按 baseIndex 聚合 ---------- */
  const byBase = new Map<number, FlatNode[]>();
  for (const talk of talks) {
    const anchor = flat[talk.baseIndex];
    if (!anchor) continue;
    const built = buildHeartTalkNodes(talk, anchor.act);
    if (built.length === 0) continue;
    byBase.set(talk.baseIndex, [...(byBase.get(talk.baseIndex) ?? []), ...built]);
  }
  if (byBase.size > 0) {
    /* 选项带真分支时，merge 只落在整组插入段的最后一个节点上——
       落在中间节点会把后面几段真心话整段跳过 */
    for (const [baseIndex, group] of byBase) {
      const talk = talks.find((item) => item.baseIndex === baseIndex);
      if (!talk?.jumpTo || group.length === 0) continue;
      const tail = group[group.length - 1];
      if (tail.kind === "line") {
        group[group.length - 1] = { ...tail, line: { ...tail.line, merge: talk.jumpTo } };
      }
    }
  }

  /* ---------- 二周目回响：插在选项节点后、真心话插入段之前（同一遍 forEach：选项 → 回响 → 真心话组） ---------- */
  const byEchoBase = new Map<number, FlatNode[]>();
  for (const echoTalk of echoTalks) {
    const anchor = flat[echoTalk.baseIndex];
    if (!anchor || anchor.kind !== "choice") continue;
    const choice = anchor.choices.find((item) => item.id === echoTalk.choiceId);
    if (!choice?.echo) continue;
    /* 有真心话时跳转由插入段尾节点的 merge 负责：echo 若也带 merge 会把真心话整段跳过 */
    const echoLine: DialogueLine = {
      id: `${lineId ?? "x"}-echo-${choice.id}`,
      speakerId: choice.echo.speakerId,
      text: choice.echo.text,
      innerVoice: choice.echo.innerVoice,
      remember: true,
      merge: choice.branch && !byBase.has(echoTalk.baseIndex) ? choice.branch : undefined,
    };
    byEchoBase.set(echoTalk.baseIndex, [
      ...(byEchoBase.get(echoTalk.baseIndex) ?? []),
      { kind: "line", act: anchor.act, actIndex: anchor.actIndex, line: echoLine },
    ]);
  }

  if (byEchoBase.size > 0 || byBase.size > 0) {
    const out: FlatNode[] = [];
    nodes.forEach((node) => {
      out.push(node);
      if (node.kind === "choice") {
        const echoes = byEchoBase.get(node.baseIndex);
        if (echoes) out.push(...echoes);
        const injected = byBase.get(node.baseIndex);
        if (injected) out.push(...injected);
      }
    });
    nodes = out;
  }

  /* ---------- 二周目记忆锚点段：playthrough ≥ 2 才插，位置在回响/真心话之后、收束段之前。
     锚点解析不到、锚点行带 merge（会破坏分支跳转语义）或带 heart（真心话节点不接锚）都跳过，不插、不崩 ---------- */
  if (playthrough >= 2 && resonances && resonances.length > 0) {
    const byAfterId = new Map<string, FlatNode[]>();
    for (let r = 0; r < resonances.length; r++) {
      const resonance = resonances[r];
      if (!resonance || !resonance.afterId || resonance.lines.length === 0) continue;
      const anchor = nodes.find(
        (node) => node.kind === "line" && node.line.id === resonance.afterId,
      );
      if (!anchor || anchor.kind !== "line") continue;
      if (anchor.line.merge || anchor.line.heart) continue;
      const group = resonance.lines.map((item, i) => ({
        kind: "line" as const,
        act: anchor.act,
        actIndex: anchor.actIndex,
        line: {
          id: `${lineId ?? "x"}-res-${r}-${i}`,
          speakerId: item.speakerId,
          text: item.text,
          innerVoice: item.innerVoice,
          remember: true,
        },
      }));
      byAfterId.set(resonance.afterId, group);
    }
    if (byAfterId.size > 0) {
      const out: FlatNode[] = [];
      nodes.forEach((node) => {
        out.push(node);
        if (node.kind === "line") {
          const group = byAfterId.get(node.line.id);
          if (group) out.push(...group);
        }
      });
      nodes = out;
    }
  }

  if (finaleCoda && nodes.length > 0) {
    const lastLineNode = [...nodes].reverse().find((node) => node.kind === "line");
    const act = lastLineNode && lastLineNode.kind === "line" ? lastLineNode.act : nodes[nodes.length - 1].act;
    const codaNodes: FlatNode[] = FINALE_CODA.map((item, i) => ({
      kind: "line" as const,
      act,
      actIndex: act.index,
      line: {
        id: `lk-coda-${i}`,
        speakerId: item.speakerId,
        text: item.text,
        innerVoice: item.inner,
        heart: true,
      },
    }));
    nodes = [...nodes, ...codaNodes];
  }

  return nodes;
}

/* ---------- 蛙的生物学（批次 AH）：鸣叫 / 冷血 ---------- */

/** 冷血：不动多久之后，角色开始关心你是不是还活着 */
const FROZEN_IDLE_SECONDS = 30;

/** 冷血三句：不叫挂机提醒——是有人开始关心。轮着问，问完从第一句重新问 */
const FROZEN_NOTICES = [
  "（不远处传来一句：「你冷吗？」——声音很近，看不清是谁。）",
  "（「你怎么不动了？」这句问第二遍时，尾音里带了点别的。）",
  "（「你是不是……冻住了？」问完之后，档案柜那边传来翻页声。没有人来把你翻回去。）",
];

/** 鸣叫的回声：有的回应，有的不——按种子派生，同一局同一次恒定 */
const CROAK_REPLY_LINES = [
  "（草丛那头回了一声。听不出是谁——回完就装作没事。）",
  "（湖面溅了一下。回音，还是回应，档案分不清。）",
  "（食堂的排风扇停了一秒，又转起来。）",
  "（有谁也叫了一声，慢半拍。像在学你。）",
  "（公告栏后面探出半张脸，又缩回去。）",
];
const CROAK_SILENT_LINES = [
  "（没有谁回应。声音撞在公示栏的玻璃上，弹了回来。）",
  "（安静。这一声被登记进「声音」一栏，编号照旧往后排。）",
  "（风把这一声带走了。柜子里多了一行：无回应。）",
  "（没回应。都习惯了。）",
];

/** 旧皮的一瞥（批次 AH）：蜕过皮的玩家进线时偶尔瞥见——柜子最里层那层皮还保持着当时的形状 */
const SKIN_GLIMPSE_LINES = [
  "（进楼的时候，档案柜最里层那层旧皮动了一下。没有风。）",
  "（你路过档案柜。有一层皮叠得很仔细，像在叠一份文件。）",
  "（柜子最里面，有一层皮还保持着蜕下来那天的形状。）",
];

/** 场景的缺席（批次 BB）：这三栋楼的特征是它们自己的——不是维修，是空间自己选择不开放 */
const SPATIAL_ABSENCE: Partial<Record<StorylineId, string>> = {
  lake: "（湖边今天没有水声。不是坏了——它今天不想响。）",
  lawn: "（操场今天没有风。旗子垂着，草也不动。）",
  administration: "（行政楼今天没有温馨提示。窗口开着，但没有话。）",
};

/**
 * 传话（批次 AJ）：你说过的一句真话会在别的蛙嘴里走——首进一条线时按种子决定这一线要不要听见。
 * 手数由档案记账（bumpTruthRelay，跨学期保留）；传得越久，剩下的越是别的蛙以为的意思。
 */
function relayLineFor(save: GameSaveData): string | null {
  if (save.truthJar.length === 0) return null;
  const day = dayOfDoneCount(countCompletedLines(save));
  if (seedRandom(save.weatherSeed * 131 + day * 37 + save.playthrough * 5) >= 0.45) return null;
  const pick = seedRandom(save.weatherSeed * 71 + day * 13 + save.playthrough * 3);
  const truth = save.truthJar[Math.floor(pick * save.truthJar.length) % save.truthJar.length];
  const hop = bumpTruthRelay(truth);
  const quoted = truth.trim().slice(0, 24);
  if (hop >= 3) return `（传到第 ${hop} 手了：「${quoted}」。你已经听不太出这是你说过的那一句。）`;
  if (hop === 2) return `（这句话你不是第一次听见了：「${quoted}」。这回更短。剩下的都是别的蛙以为的意思。）`;
  return `（走廊里，两只不认识的蛙在讨论一句话。那句话是你的：「${quoted}」。只差两个字——传话的蛙替它修了边。）`;
}

export function usePlay() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawLineId = searchParams.get("line") ?? "";

  const storyline = useMemo<StorylineMeta | undefined>(
    () => (rawLineId ? storylineById(rawLineId) : undefined),
    [rawLineId],
  );
  const lineId = storyline?.id;
  const script = useMemo<StoryScript | undefined>(
    () => (lineId ? STORY_SCRIPTS[lineId] : undefined),
    [lineId],
  );
  const baseFlat = useMemo<FlatNode[]>(() => (script ? flattenScript(script) : []), [script]);

  const [save, setSave] = useState<GameSaveData>(() => loadGameSave());
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => loadTheme());
  const [nodeIndex, setNodeIndex] = useState(0);
  const [phase, setPhase] = useState<PlayPhase>("dialogue");
  const [displayedText, setDisplayedText] = useState("");
  const [autoMode, setAutoMode] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [gainFlash, setGainFlash] = useState<{ delta: number; stamp: number } | null>(null);
  const [stageSpeakerId, setStageSpeakerId] = useState<FrogCharacterId | null>(null);
  const [runGain, setRunGain] = useState(0);
  const [actGain, setActGain] = useState<{ actIndex: number; gain: number }>({ actIndex: 0, gain: 0 });
  const [ending, setEnding] = useState<Ending | null>(null);
  const [summaryAct, setSummaryAct] = useState<Act | null>(null);
  /* ---------- 好感度 ---------- */
  const [heartTalks, setHeartTalks] = useState<QueuedTalk[]>([]);
  /* ---------- 二周目回响：与 heartTalks 同一套插入机制（选项 → 回响 → 真心话） ---------- */
  const [echoTalks, setEchoTalks] = useState<EchoTalk[]>([]);
  const [lakeTopFrog, setLakeTopFrog] = useState<FrogCharacterId | null>(null);
  const [finaleCoda, setFinaleCoda] = useState(false);
  const [affinityFlash, setAffinityFlash] = useState<AffinityFlash | null>(null);

  /* ---------- 演出层（批次 B2）：CG 定格 / 转场 / 震动 ---------- */

  /** CG 定格：本段播放里最近一次展开过的 CG id（同 CG 连续行只展开一次，不重复打断） */
  const lastCgShownRef = useRef<string | null>(null);
  const [cgOpen, setCgOpen] = useState(false);
  const closeCg = useCallback(() => setCgOpen(false), []);

  /** 震动演出：silenceDelta ≥ 3 的选项首次确认时盖一个时间戳，舞台轻晃 120ms */
  const [shakeStamp, setShakeStamp] = useState(0);

  /** 转场演出：kind + 时间戳（View 以 key={stamp} 重播动画） */
  const [transition, setTransition] = useState<{ kind: SceneTransitionKind; stamp: number } | null>(null);

  /* ---------- 系统层（galgame 外壳批次 A） ---------- */

  /** 设置：文字速度 / 自动间隔 / 音量（音量由 audio.ts 内部相乘，不改调用方） */
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings(saveSettings(patch));
  }, []);
  /** 打字机每字间隔：慢 60 / 正常 26 / 快 12 / 瞬间 0 */
  const typeSpeedMs = TEXT_SPEED_MS[settings.textSpeed];

  /** 对话历史（回想）：每展示一个台词节点记一条，节点 id 去重，上限 200 FIFO；选项不进历史 */
  const [backlog, setBacklog] = useState<BacklogEntry[]>([]);
  const backlogSeenRef = useRef<Set<string>>(new Set());
  /* 调阅记录（批次 CI）：打印件可以销毁——销毁不是删除，是换一种记录（档案落一笔，沉默 +2） */
  const shredBacklog = useCallback(() => {
    if (backlog.length === 0) return;
    recordShred(backlog.length);
    setBacklog([]);
  }, [backlog]);

  /** 已读记录：本线已读节点 id（进场读盘，展示即记，advance 批量落盘 + 卸载 flush） */
  const readRef = useRef<Set<string>>(new Set());
  const pendingReadRef = useRef<Map<string, Set<string>>>(new Map());
  /** 当前节点到达时是否已读（跳过已读的推进节奏依据；真心话节点恒按未读处理） */
  const readArrivalRef = useRef(false);
  const [skipReadMode, setSkipReadMode] = useState(false);
  const toggleSkipRead = useCallback(() => setSkipReadMode((prev) => !prev), []);
  /* 跳到没读过（批次 CY-27）：这一幕里没有未读剧情时的提示，浮一会儿自己收起 */
  const [jumpNotice, setJumpNotice] = useState<{ text: string; stamp: number } | null>(null);
  /* 成就盖章（批次 CY-29）：新解锁的成就在舞台上当场点名——之前只有乐句响一声，名字看不见 */
  const [achToast, setAchToast] = useState<{ name: string; stamp: number } | null>(null);

  /** 系统层弹层：存读档 / 设置 / 回想互斥 */
  const [overlay, setOverlay] = useState<SystemOverlayKind>("none");
  const openOverlay = useCallback((kind: SystemOverlayKind) => setOverlay(kind), []);
  const closeOverlay = useCallback(() => setOverlay("none"), []);

  /** 已读批量落盘：把内存攒下的节点 id 并进持久层（advance 与卸载 flush 调用） */
  const flushPendingRead = useCallback(() => {
    if (pendingReadRef.current.size === 0) return;
    const pending: Record<string, string[]> = {};
    for (const [line, ids] of pendingReadRef.current) pending[line] = [...ids];
    pendingReadRef.current = new Map();
    flushReadIds(pending);
  }, []);

  useEffect(() => () => flushPendingRead(), [flushPendingRead]);

  /** 自动档标签：第 N 学期 · 线名 · 幕名（剧本文案取用） */
  const slotLabelFor = useCallback(
    (playthrough: number, actTitle: string): string => {
      const parts = [
        `第 ${Math.max(1, Math.round(playthrough))} 学期`,
        storyline?.title ?? "",
        actTitle,
      ].filter(Boolean);
      return parts.join(" · ");
    },
    [storyline],
  );

  /** 静默写 auto 档（整包快照，含学期档案与本学期流水） */
  const writeAutoSlot = useCallback(
    (playthrough: number, actTitle: string, currentLineId: string) => {
      if (!currentLineId) return;
      writeSlot("auto", snapshotSlot(slotLabelFor(playthrough, actTitle), currentLineId));
    },
    [slotLabelFor],
  );

  const pendingBoundaryRef = useRef(0);
  const answeredRef = useRef<Set<string>>(new Set());
  const queuedTalkKeysRef = useRef<Set<string>>(new Set());
  /** 选项学期档案（二周目回响判定用）：进场时与存档同步，选择时在内存里先更新再落盘 */
  const choiceSemestersRef = useRef<Record<string, number>>({});

  /* ---------- 校园日历：进线那天的天气旁白（天数由完成线数派生，取进场快照） ---------- */
  const [entryDay, setEntryDay] = useState(() =>
    dayOfDoneCount(countCompletedLines(loadGameSave())),
  );

  /* ---------- 多周目继承：进场时的周目快照（二周目起才有「蛙记得你」） ---------- */
  const [entryPlaythrough, setEntryPlaythrough] = useState(() => getPlaythrough(loadGameSave()));

  /* 片头（批次 J 起）：本线每学期第一次进线自动播，点击跳过；看过后不再自动（批次 K 泛化按线查表） */
  const [opOpen, setOpOpen] = useState(
    () => Boolean(lineId && OP_PLATES[lineId]) && loadGameSave().opSeen?.[lineId ?? ""] !== true,
  );
  const closeOp = useCallback(() => {
    setOpOpen(false);
    if (lineId) markOpSeen(lineId);
    setSave(loadGameSave());
  }, [lineId]);

  /* 天气种子（批次 H2）：随档走，开新档重摇；换天时顺便重读一次，与 entryDay 同步 */
  const entryWeatherSeed = useMemo(() => loadGameSave().weatherSeed, [entryDay]);

  const weatherIntro = useMemo<string[]>(
    () => (lineId ? weatherIntroFor(lineId, weatherForDay(entryDay, entryWeatherSeed), entryDay) : []),
    [lineId, entryDay, entryWeatherSeed],
  );

  /* 「蛙记得你」开场：playthrough ≥ 2 才有内容，一周目返回空数组；不改任何数值 */
  const memoryIntro = useMemo<MemoryIntroLine[]>(
    () => (lineId ? memoryIntroFor(lineId, entryPlaythrough) : []),
    [lineId, entryPlaythrough],
  );

  /* 传话（批次 AJ）：真话在别的蛙嘴里走——初始化 effect 里按种子决定并落盘手数（见下） */
  const [relayIntro, setRelayIntro] = useState<string | null>(null);
  const relayDoneRef = useRef<Set<string>>(new Set());

  const stream = useMemo<FlatNode[]>(() => {
    /* 路线认定只在地图页发生，播放页不会中途变化：进 memo 时读一次即可，不进依赖数组 */
    const routeNow = lineId === "lake" ? getLockedRoute() : null;
    const base = buildStream(
      baseFlat,
      heartTalks,
      echoTalks,
      lakeTopFrog,
      finaleCoda,
      entryPlaythrough,
      script?.resonances,
      lineId,
      routeNow,
    );
    if (base.length === 0) return base;
    const first = base[0];
    /* 开场前缀顺序固定：蛙的记忆（二周目起）→ 天气旁白 → 正片 */
    const memoryNodes: FlatNode[] = memoryIntro.map((item, i) => ({
      kind: "line" as const,
      act: first.act,
      actIndex: first.actIndex,
      line: {
        id: `ngp-${lineId ?? "x"}-${i}`,
        speakerId: item.speakerId,
        text: item.text,
      },
    }));
    const wxNodes: FlatNode[] = weatherIntro.map((text, i) => ({
      kind: "line" as const,
      act: first.act,
      actIndex: first.actIndex,
      line: {
        id: `wx-${lineId ?? "x"}-${i}`,
        speakerId: "narration" as const,
        text,
      },
    }));
    /* 传话（批次 AJ）：真话在别的蛙嘴里走——进线前缀的最后一环（每条线每学期至多一次） */
    const relayNodes: FlatNode[] = relayIntro
      ? [
          {
            kind: "line" as const,
            act: first.act,
            actIndex: first.actIndex,
            line: {
              id: `relay-${lineId ?? "x"}`,
              speakerId: "narration" as const,
              text: relayIntro,
            },
          },
        ]
      : [];
    return [...memoryNodes, ...wxNodes, ...relayNodes, ...base];
  }, [
    baseFlat,
    heartTalks,
    echoTalks,
    lakeTopFrog,
    finaleCoda,
    entryPlaythrough,
    script,
    weatherIntro,
    memoryIntro,
    relayIntro,
    lineId,
  ]);

  /* 真分支跳转索引：基于最终播放流按 id 定位。
     真心话插入与前缀层都会让绝对索引漂移，所有跳转只认 id，解析不到就降级为顺序推进。 */
  const indexById = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    stream.forEach((node, i) => {
      if (node.kind === "line") map.set(node.line.id, i);
    });
    return map;
  }, [stream]);

  /* ---------- 校验（无 id / 无剧本 / 湖边未解锁） ---------- */

  const phaseResolved: PlayPhase = useMemo(() => {
    /* 空骨架（正文未填）与无剧本同等对待：走 PlayPage 的「剧本还在路上」占位，不进对话流 */
    if (!storyline || !script || script.acts.length === 0) return "invalid";
    if (storyline.hidden && !isLakeUnlocked(save)) return "invalid";
    return phase;
  }, [storyline, script, save, phase]);

  const invalidReason: InvalidReason | null = useMemo(() => {
    if (phaseResolved !== "invalid") return null;
    if (!storyline) return "missing-id";
    if (!script || script.acts.length === 0) return "no-script";
    return "locked";
  }, [phaseResolved, storyline, script]);

  /* ---------- 初始化：主题 / 存档 / 访问标记 / 续播幕 / 湖边微调对象 ---------- */

  useEffect(() => {
    answeredRef.current = new Set(loadAnsweredChoiceIds());
    queuedTalkKeysRef.current = new Set();
    choiceSemestersRef.current = loadChoiceSemesters();
    setActiveTheme(loadTheme());
    applyThemeToDocument(loadTheme());
    /* 换线前先把上一条线攒下的已读节点落盘，再读新线的已读集合 */
    flushPendingRead();
    readRef.current = new Set(lineId ? (loadReadMap()[lineId] ?? []) : []);
    readArrivalRef.current = false;
    /* 换线重进（批次 CY-30）：节点守卫复位，新线第一个节点照常捕捉到达态 */
    readMarkNodeRef.current = -1;
    /* 回想历史随换线清空：本线从第一条开始记 */
    setBacklog([]);
    backlogSeenRef.current = new Set();
    const fresh = loadGameSave();
    setSave(fresh);
    setEntryDay(dayOfDoneCount(countCompletedLines(fresh)));
    setEntryPlaythrough(getPlaythrough(fresh));
    setHeartTalks([]);
    setEchoTalks([]);
    setFinaleCoda(false);
    setAffinityFlash(null);
    /* 湖边最高好感微调（CY-129）：限定在湖边在场蛙里取最高。
       棉棉/再再/格格不在湖边名单（老师/后来扩线的蛙），全表取最高会命中
       一个没有 LAKE_TOP_LINES 条目的 id，微调整个静默跳过——
       连四只在场蛙的专属开场与 lk-l24 前的加话都跟着丢。 */
    const lakeCast = storylineById("lake")?.castIds;
    const topFrog = topTrueFrog(fresh, lakeCast);
    setLakeTopFrog(topFrog);
    if (!lineId || !script || !storyline) return;
    if (storyline.hidden && !isLakeUnlocked(fresh)) return;
    if (!fresh.completedLines.includes(lineId)) {
      markLineVisited(lineId);
    }
    const priorAct = fresh.lineAct[lineId];
    /* 传话（批次 AJ）：只在首次进线（本学期没走到过这线）时发生——每条线每学期至多传一手 */
    let relayText: string | null = null;
    if (lineId && priorAct === undefined && !relayDoneRef.current.has(lineId)) {
      relayDoneRef.current.add(lineId);
      relayText = relayLineFor(fresh);
    }
    setRelayIntro(relayText);
    if (priorAct === undefined) {
      /* 首次进线：前缀层（蛙的记忆 + 天气旁白 + 传话）照播——每个学期只播这一次 */
      setNodeIndex(0);
    } else {
      /* 续播：在 buildStream 的基础流里按幕定位（基础流不含本会话真心话/回响插入），
         再垫上前缀层；绝对索引会因插入段漂移，按幕定位永远准 */
      const playthroughNow = getPlaythrough(fresh);
      const routeNow = lineId === "lake" ? getLockedRoute(fresh) : null;
      const baseStream = buildStream(
        baseFlat,
        [],
        [],
        topFrog,
        false,
        playthroughNow,
        script.resonances,
        lineId,
        routeNow,
      );
      const baseStart = baseStream.findIndex((node) => node.actIndex === priorAct);
      const prefixLength = memoryIntro.length + weatherIntro.length + (relayText ? 1 : 0);
      setNodeIndex(baseStart >= 0 ? baseStart + prefixLength : 0);
    }
    /* 自动档：进线即静默写 auto（label 同格式，快照含当前幕的续播位置） */
    const startAct =
      script.acts.find((act) => act.index === (priorAct ?? script.acts[0]?.index)) ??
      script.acts[0];
    writeAutoSlot(getPlaythrough(fresh), startAct?.title ?? "", lineId);
    setPhase("dialogue");
    setRunGain(0);
    setEnding(null);
    setSummaryAct(null);
    setStageSpeakerId(null);
    setActGain({ actIndex: 0, gain: 0 });
  }, [lineId, script, storyline, baseFlat]);

  /* ---------- 当前节点派生 ---------- */

  const currentNode = stream[nodeIndex];
  const activeLine = currentNode?.kind === "line" ? currentNode.line : null;
  /** 曾表态淡标（批次 CY-31）：上一学期勾过的选项——回看时整条打淡、盖「曾表态」小章，但仍可重选 */
  const answeredChoiceIds = useMemo(() => {
    const node = currentNode;
    if (node?.kind !== "choice") return [] as string[];
    return node.choices
      .filter((choice) => answeredRef.current.has(`${lineId ?? ""}:${node.act.id}:${node.sceneId}:${choice.id}`))
      .map((choice) => choice.id);
  }, [currentNode, lineId]);
  /** 这一幕的已读进度（批次 CY-31）：只数台词行；真心话不记账，永远算没读过的那头 */
  const actReadStat = useMemo(() => {
    const cur = stream[nodeIndex];
    if (!cur) return null;
    let total = 0;
    let read = 0;
    for (const node of stream) {
      if (node.actIndex !== cur.actIndex || node.kind !== "line") continue;
      total += 1;
      if (readRef.current.has(node.line.id)) read += 1;
    }
    return { read: Math.min(read, total), total };
    /* readRef 是账本引用：nodeIndex / stream 每变一次都到了重数的时机，引用本身不进依赖 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, nodeIndex]);
  /**
   * 舞台背景（批次 J 起，批次 K 改 sticky）：视觉小说标准行为——背景一旦切上就留在台上，
   * 直到下一张 `show bg`。所以行没标 bg 时沿用本线最近一次的 bg（分支段不闪跳回默认建筑场景）；
   * 本线从头到尾没标过 bg 则回落 null = 既有建筑场景背景（其他八条半线不受影响）。
   */
  const activeBg = useMemo(() => {
    let bg: string | null = null;
    for (let i = 0; i <= nodeIndex; i++) {
      const node = stream[i];
      const b = node?.kind === "line" ? node.line.bg : undefined;
      if (b) bg = b;
    }
    return bg;
  }, [stream, nodeIndex]);
  /** 说话蛙姿势/服装差分（批次 J）：pose 三变体与格格查寝装备，由 View 透传立绘 */
  const activePose = activeLine?.pose ?? "stand";
  const activeGear = activeLine?.gear === true;
  /** 换景脚步（批次 CY-27）：舞台背景换上去的那一下，配一声极轻的脚步——到了哪儿，像是走过去到的 */
  const prevStageBgRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevStageBgRef.current === undefined) {
      prevStageBgRef.current = activeBg;
      return;
    }
    if (activeBg && activeBg !== prevStageBgRef.current) playSe("se-steps");
    prevStageBgRef.current = activeBg;
  }, [activeBg]);
  const rawText = activeLine?.text ?? "";
  const innerVoice = activeLine?.innerVoice ?? "";
  /** 内心独白行（只有 innerVoice 的行）也走打字机 */
  const fullText = rawText || innerVoice;
  const isTyping = fullText.length > 0 && displayedText.length < fullText.length;

  const speakerId: FrogCharacterId | null =
    activeLine && activeLine.speakerId !== "narration" ? activeLine.speakerId : null;
  const lineKind: "narration" | "speech" | "inner" = !speakerId
    ? "narration"
    : rawText
      ? "speech"
      : "inner";
  const speakerName =
    lineKind === "inner"
      ? `${FROG_CHARACTERS[speakerId ?? "naiBai"].displayName} · 内心`
      : speakerId
        ? FROG_CHARACTERS[speakerId].displayName
        : "旁白";
  const speakerRole = speakerId ? FROG_CHARACTERS[speakerId].role : "";
  /* 离校（批次 CC）：说话蛙本学期不在了——那条线还在，但它不在了；
     它的每一行降级为脚注（原稿还在，它没带走），舞台上的位置变成空白 */
  const speakerDeparted = useMemo<boolean>(
    () => Boolean(speakerId && speakerId !== SELF_ID && departedFrogsOf(save).includes(speakerId)),
    [speakerId, save],
  );
  /* 编目（批次 BS）：说话蛙的认定层级——否认的蛙被渲染成空白（非编目），翻动三次的自行降级；
     离校（批次 CC）的蛙沿用同一套空白渲染，脚注章与批语换成学籍口径 */
  const speakerTier = useMemo<ExistenceTier>(
    () =>
      speakerDeparted
        ? "footnote"
        : speakerId && speakerId !== SELF_ID
          ? existenceTierOf(save, speakerId, save.playthrough)
          : "none",
    [speakerId, save, speakerDeparted],
  );
  /** 离校（批次 CC）：脚注章文案——学籍变动（缺省沿用编目的「非编目」） */
  const degradedLabel = useMemo<string | undefined>(
    () => (speakerDeparted ? "学籍变动" : undefined),
    [speakerDeparted],
  );
  /** 停顿（批次 BS）：被否认的蛙第一次开口之前的那一下——话到嘴边，名字没说出来 */
  const [pauseNote, setPauseNote] = useState("");
  const pausedSpeakersRef = useRef<Set<FrogCharacterId>>(new Set());
  useEffect(() => {
    if (speakerTier === "none" || !speakerId || speakerId === SELF_ID) {
      setPauseNote("");
      return;
    }
    if (pausedSpeakersRef.current.has(speakerId)) {
      setPauseNote("");
      return;
    }
    pausedSpeakersRef.current.add(speakerId);
    setPauseNote("（它说到这里停了一下。那个名字在嘴边，没有说出来。）");
  }, [speakerId, speakerTier]);
  /** 调阅痕（批次 BV）：私档被翻过的蛙——下一次见面不看你，先说「你翻我东西了」，铭牌从此带痕 */
  const [traceNote, setTraceNote] = useState("");
  const tracedSpeakersRef = useRef<Set<FrogCharacterId>>(new Set());
  useEffect(() => {
    if (!speakerId || speakerId === SELF_ID) {
      setTraceNote("");
      return;
    }
    if (tracedSpeakersRef.current.has(speakerId)) {
      setTraceNote("");
      return;
    }
    const dossier = privateDossierOfFrog(speakerId);
    if (!dossier || !save.dossierReads?.[speakerId]) {
      setTraceNote("");
      return;
    }
    tracedSpeakersRef.current.add(speakerId);
    setTraceNote(dossier.traceLine);
  }, [speakerId, save]);
  /** 调阅痕（批次 BV）：说话蛙的私档被翻过——铭牌从此带痕；补录过说明后加「已备案」（批次 BW） */
  const traceMark = useMemo<boolean>(
    () => Boolean(speakerId && speakerId !== SELF_ID && save.dossierReads?.[speakerId]),
    [speakerId, save],
  );
  /** 调阅痕角标文案（批次 BW）：补录过说明后从「调阅痕」换成「调阅痕 · 已备案」——
   *  备案不撤销痕迹，只给痕迹一个编号 */
  const traceLabel = useMemo<string>(
    () => (save.explainSeen ? "调阅痕 · 已备案" : "调阅痕"),
    [save],
  );
  /** 撰写痕（批次 BZ）：被写过的蛙——下一次见面它先提那份报告，但不知道是谁写的。
   *  报告写在本学期它说「最近有人写了」；写在更早的学期它说「档案柜里有一份」——它记得，不知道是谁 */
  const [reportNote, setReportNote] = useState("");
  const reportedSpeakersRef = useRef<Set<FrogCharacterId>>(new Set());
  useEffect(() => {
    if (!speakerId || speakerId === SELF_ID) {
      setReportNote("");
      return;
    }
    if (reportedSpeakersRef.current.has(speakerId)) {
      setReportNote("");
      return;
    }
    const line = reportLineOf(save, speakerId);
    if (!line) {
      setReportNote("");
      return;
    }
    reportedSpeakersRef.current.add(speakerId);
    setReportNote(line);
  }, [speakerId, save]);
  /** 撰写痕（批次 BZ）：说话蛙被写过报告——铭牌从此带这一枚（它不知道是谁写的） */
  const reportMark = useMemo<boolean>(
    () => Boolean(speakerId && speakerId !== SELF_ID && latestPlayerReportOf(save, speakerId)),
    [speakerId, save],
  );
  /** 团体（批次 CA）：说话蛙所在团体你加入过——铭牌带「团体」，你比旁的蛙多知道一件（一次性） */
  const joinedFactionOf = useMemo<FactionId | null>(() => {
    if (!speakerId || speakerId === SELF_ID) return null;
    const hit = FACTIONS.find(
      (meta) =>
        meta.members.some((member) => member.frogId === speakerId) &&
        factionJoinedSemesterOf(save, meta.id) !== null,
    );
    return hit ? hit.id : null;
  }, [speakerId, save]);
  const [factionNote, setFactionNote] = useState("");
  const factionNotedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!joinedFactionOf || factionNotedRef.current.has(joinedFactionOf)) {
      setFactionNote("");
      return;
    }
    factionNotedRef.current.add(joinedFactionOf);
    setFactionNote(FACTION_INFO_LINES[joinedFactionOf] ?? "");
  }, [joinedFactionOf]);
  /** 团体（批次 CA）：铭牌上的团体角标——档案照写：该蛙所在团体 */
  const factionMark = useMemo<boolean>(() => joinedFactionOf !== null, [joinedFactionOf]);
  /** 本能（批次 CE）：发作中的那一种——鸣叫在正片里发作（没有预警），其余在地图上 */
  const [instinct, setInstinct] = useState<null | "croak">(null);
  /** 叫了之后怎么办：解释（表演分 +1）/ 沉默（沉默 +1、被注意值 +1——档案照写：该蛙无故鸣叫） */
  const ackInstinct = useCallback((mode: "explain" | "silent") => {
    if (mode === "explain") addReputation(1);
    else {
      addSilence(1);
      addAttention(1);
    }
    setSave(loadGameSave());
  }, []);
  /** 收下（浮层收起——叫已经叫了） */
  const closeInstinct = useCallback(() => setInstinct(null), []);
  /** 离校（批次 CC）：上一学期走了、这一学期回来了——它不记得你（档案重置，你的没有） */
  const departReturnFrog = useMemo<FrogCharacterId | undefined>(() => departedReturnOf(save), [save]);
  const [departNote, setDepartNote] = useState("");
  const departNotedRef = useRef<Set<FrogCharacterId>>(new Set());
  useEffect(() => {
    if (!speakerId || speakerId === SELF_ID) {
      setDepartNote("");
      return;
    }
    if (departNotedRef.current.has(speakerId)) {
      setDepartNote("");
      return;
    }
    const meta = speakerId === departReturnFrog ? departureMetaOf(speakerId) : undefined;
    if (!meta) {
      setDepartNote("");
      return;
    }
    departNotedRef.current.add(speakerId);
    setDepartNote(meta.returnNote);
  }, [speakerId, departReturnFrog]);
  /** 离校（批次 CC）：铭牌上的「回来了」角标——档案重置，它不记得你 */
  const departMark = useMemo<boolean>(
    () => Boolean(speakerId && speakerId !== SELF_ID && speakerId === departReturnFrog),
    [speakerId, departReturnFrog],
  );
  /* ---------- 消迹（批次 CF）：那一句从档案里没了——渗出一行「那一栏是空的」 ---------- */
  const vanishThis = useMemo(() => vanishThisSemesterOf(save), [save]);
  const [vanishNote, setVanishNote] = useState("");
  const vanishNotedRef = useRef<string>("");
  useEffect(() => {
    const key = vanishThis ? `${vanishThis.semester}-${vanishThis.day}` : "";
    if (!key || vanishNotedRef.current === key) {
      setVanishNote("");
      return;
    }
    vanishNotedRef.current = key;
    setVanishNote("（柜子里那一栏是空的。那一句还在你身上——只是不在纸上了。）");
  }, [vanishThis]);
  /** 空白（批次 BS）：在场名单里被否认/自行降级的蛙——位置还在，蛙不在了；
   *  离校（批次 CC）的蛙沿用空白渲染，角标换成「学籍变动」 */
  const stageBlanks = useMemo<{ id: FrogCharacterId; tier: "footnote" | "demoted"; label?: string }[]>(
    () =>
      (storyline?.castIds ?? [])
        .filter((id) => id !== SELF_ID)
        .map((id): { id: FrogCharacterId; tier: "footnote" | "demoted"; label?: string } | null => {
          if (departedFrogsOf(save).includes(id)) return { id, tier: "footnote", label: "学籍变动" };
          const tier = existenceTierOf(save, id, save.playthrough);
          if (tier === "none") return null;
          return { id, tier };
        })
        .filter((item): item is { id: FrogCharacterId; tier: "footnote" | "demoted"; label?: string } => item !== null),
    [storyline, save],
  );
  const isHeartLine = activeLine?.heart === true;
  /** 二周目回响节点（echo / 记忆锚点段）：View 据此显示「上学期」小徽标 */
  const isRememberLine = activeLine?.remember === true;
  /**
   * 表情差分（批次 D1）：本行说话蛙的表情。
   * 优先级：剧本标注 > 主角沉默值口径（expressionForSilence）> NPC 按坦诚度档位单调映射；
   * 返回 null = 维持该蛙预设默认表情（饭搭子档、旁白行、真心话插入段走标注或缺省）。
   */
  const speakerExpression = useMemo<FrogExpression | null>(() => {
    if (!speakerId) return null;
    if (activeLine?.expression) return activeLine.expression;
    if (speakerId === SELF_ID) return expressionForSilence(save.silenceValue);
    const percent = affinityPercent(speakerId, save.affinity[speakerId] ?? 0);
    if (percent >= SPEAKER_EXPRESSION_TIERS.soft) return "soft";
    if (percent >= SPEAKER_EXPRESSION_TIERS.smile) return "smile";
    if (percent >= SPEAKER_EXPRESSION_TIERS.keep) return null;
    return "frozen";
  }, [speakerId, activeLine?.expression, save.silenceValue, save.affinity]);
  /** 当前节点绑定的 CG 定格（批次 B2）：注册表解析，未注册 id 按无 CG 处理 */
  const activeCg = useMemo<CgSceneMeta | null>(() => {
    const cgId = activeLine?.cg;
    if (!cgId) return null;
    return cgSceneById(cgId) ?? null;
  }, [activeLine?.cg]);

  const viewingActIndex = currentNode?.actIndex ?? 1;
  const actTotal = script?.acts.length ?? 0;

  useEffect(() => {
    const node = stream[nodeIndex];
    if (node?.kind === "line" && node.line.speakerId !== "narration") {
      setStageSpeakerId(node.line.speakerId);
    }
  }, [nodeIndex, stream]);

  /* ---------- CG 定格（批次 B2）：节点带 cg → 全屏定格展开 + 记收集；
     同一张 CG 只在本段播放里展开一次（连续多行共享同一 CG 时不重复打断） ---------- */

  useEffect(() => {
    const cgId = activeLine?.cg;
    if (!cgId || cgId === lastCgShownRef.current) return;
    lastCgShownRef.current = cgId;
    markCgSeen(cgId);
    playSfx("shutter");
    setCgOpen(true);
  }, [nodeIndex, stream, activeLine?.cg]);

  /* ---------- 真心话前奏：每段 heart 插入段的第一行出现时心跳一声（批次 B2） ---------- */

  const prevHeartRef = useRef(false);
  useEffect(() => {
    const node = stream[nodeIndex];
    const isHeart = node?.kind === "line" && node.line.heart === true;
    if (isHeart && !prevHeartRef.current) playSfx("heartbeat");
    prevHeartRef.current = isHeart;
  }, [nodeIndex, stream]);

  /* ---------- 天气氛围（批次 B2）：按进线那天的天气开雨声 / 风声（同存档同天恒定；
     卸载或换天时清理，与地图页同机制互不叠加） ---------- */

  const entryWeather = useMemo(() => weatherForDay(entryDay, entryWeatherSeed), [entryDay, entryWeatherSeed]);

  useEffect(() => {
    if (entryWeather === "rain") startRainAmbience();
    else if (entryWeather === "wind") startWindAmbience();
    return () => {
      stopRainAmbience();
      stopWindAmbience();
    };
  }, [entryWeather]);

  /* ---------- 已读记录：节点展示即记入（ref 幂等；真心话节点不记，快进永远停在它面前） ---------- */

  /* 新旧区分（批次 CY-30）：「到达这一行时读没读过」——只在落到新节点的那一下取一次。
     本 effect 之后同一节点还会因流插入重跑，届时账里刚添了本行、重算会误判旧为新落定，
     所以用节点索引守卫，一次到达只取一次。真心话行永远当新（账里不记它）。 */
  const [lineReadBefore, setLineReadBefore] = useState(false);
  const readMarkNodeRef = useRef(-1);

  useEffect(() => {
    const node = stream[nodeIndex];
    if (readMarkNodeRef.current !== nodeIndex) {
      readMarkNodeRef.current = nodeIndex;
      setLineReadBefore(
        node?.kind === "line" && node.line.heart !== true && readRef.current.has(node.line.id),
      );
    }
    if (!node || node.kind !== "line") return;
    const id = node.line.id;
    readArrivalRef.current = readRef.current.has(id);
    if (lineId && !readArrivalRef.current && !node.line.heart) {
      readRef.current.add(id);
      const pending = pendingReadRef.current.get(lineId) ?? new Set<string>();
      pending.add(id);
      pendingReadRef.current.set(lineId, pending);
    }
  }, [nodeIndex, stream, lineId]);

  /* ---------- 回想：每展示一个台词节点记一条（节点 id 去重，上限 200 FIFO；选项不进历史） ---------- */

  useEffect(() => {
    const node = stream[nodeIndex];
    if (!node || node.kind !== "line") return;
    const id = node.line.id;
    if (backlogSeenRef.current.has(id)) return;
    backlogSeenRef.current.add(id);
    const line = node.line;
    const speakerId = line.speakerId !== "narration" ? (line.speakerId as FrogCharacterId) : null;
    const kind: BacklogEntry["kind"] = !speakerId ? "narration" : line.text ? "speech" : "inner";
    setBacklog((prev) => {
      const next: BacklogEntry[] = [
        ...prev,
        {
          speakerName: backlogSpeakerName(line),
          text: line.text || line.innerVoice || "",
          innerVoice: line.text && line.innerVoice ? line.innerVoice : undefined,
          kind,
          remember: line.remember === true,
          heart: line.heart === true,
          cgTitle: line.cg ? (cgSceneById(line.cg)?.title ?? undefined) : undefined,
        },
      ];
      return next.length > BACKLOG_CAP ? next.slice(next.length - BACKLOG_CAP) : next;
    });
  }, [nodeIndex, stream]);

  /* ---------- 打字机 ---------- */

  useEffect(() => {
    if (phaseResolved !== "dialogue" || !fullText) return;
    /* 跳过已读：到达时已读的普通台词不打字，整句瞬显（真心话 / 未读节点照常逐字） */
    if (skipReadMode && readArrivalRef.current) {
      setDisplayedText(fullText);
      return;
    }
    /* 瞬间档：不打字，整句直接显示 */
    if (typeSpeedMs <= 0) {
      setDisplayedText(fullText);
      return;
    }
    setDisplayedText("");
    const timer = window.setInterval(() => {
      setDisplayedText((prev) => {
        if (prev.length >= fullText.length) {
          window.clearInterval(timer);
          return prev;
        }
        return fullText.slice(0, prev.length + 1);
      });
    }, typeSpeedMs);
    return () => window.clearInterval(timer);
    // fullText 随 nodeIndex 变化，这里只按位置重跑；readArrivalRef 由上面的已读记录 effect 先行写入
  }, [phaseResolved, nodeIndex, lineId, fullText, skipReadMode, typeSpeedMs]);

  /* ---------- 推进状态机 ---------- */

  const finishLine = useCallback(() => {
    if (!lineId || !script) return;
    const fresh = loadGameSave();
    // 真话选项可把累计沉默压成负数， clamp 到 0 避免负值落不进任何分档而误入最高档
    const value = Math.max(0, fresh.silenceValue);
    /* 私档（批次 BV）：调阅过本线主蛙的私档后，「不知道」档永久关闭——从候选里剔掉，
       落点顺延到剩余档位里最接近的一档（不再兜到最高档） */
    const traceFrog = TRACE_FROG_OF_LINE[lineId];
    const traced = traceFrog ? Boolean(fresh.dossierReads?.[traceFrog]) : false;
    const candidates = traced
      ? script.endings.filter((item) => item.forbidTrace !== true)
      : script.endings;
    const matched =
      candidates.find((item) => {
        const min = item.minSilence ?? Number.NEGATIVE_INFINITY;
        const max = item.maxSilence ?? Number.POSITIVE_INFINITY;
        return value >= min && value <= max;
      }) ?? candidates[candidates.length - 1] ?? null;
    setEnding(matched);
    markLineCompleted(lineId);
    if (matched) unlockEnding(matched.id);
    /* 蜕皮发作（批次 CE）：打完一个结局，身体自己蜕——旧皮入柜，新皮是空的。
       不是在这里蜕（结局卡还挂着），是回到地图的那一刻（moltPending，地图挂载时消费） */
    {
      const now = loadGameSave();
      if (
        now.completedLines.length > 0 &&
        seedRandom(((Math.round(now.weatherSeed) % 1000000) * 1217 + now.playthrough * 17 + (now.molts ?? 0) * 31 + 181) % 1000000) < 0.3
      ) {
        markMoltPending(
          `第 ${now.playthrough} 学期 · 沉默 ${now.silenceValue} · 表演 ${now.reputation} · 真话 ${now.truthJar.length} 条 · 走完 ${now.completedLines.length} 条线`,
        );
      }
    }
    clearLineAct(lineId);
    setSave(loadGameSave());
    playSfx("chime");
    /* 结局揭示转场：白闪淡出，结局卡随后浮出（批次 B2） */
    setTransition({ kind: "ending", stamp: Date.now() });
    setPhase(lineId === "lake" ? "finale" : "ending");
  }, [lineId, script]);

  /** 从 index 节点之后做一次转移：merge 跳转优先 → 同幕下一节点 / 幕边界 / 全线完结 */
  const transitionFrom = useCallback(
    (index: number) => {
      const cur = stream[index];
      if (!cur) return;
      /* 分支段落末尾的 merge 跳转放在幕边界判断之前：
         分支段落与锚点同幕（actIndex 相同），跳转目标也多在同幕，不会误触结算卡 */
      if (cur.kind === "line" && cur.line.merge) {
        const target = indexById.get(cur.line.merge);
        const targetNode = target !== undefined ? stream[target] : undefined;
        if (target !== undefined && targetNode) {
          setNodeIndex(target);
          setPhase(targetNode.kind === "choice" ? "choice" : "dialogue");
          return;
        }
        /* 目标 id 解析不到：降级为顺序推进，不崩、不黑屏 */
      }
      const next = stream[index + 1];
      if (!next) {
        finishLine();
        return;
      }
      if (next.actIndex !== cur.actIndex) {
        if (cur.act.index >= (script?.acts.length ?? 1)) {
          finishLine();
          return;
        }
        /* 记下一幕的 actIndex 而不是绝对索引：真心话节点会插进流里，绝对索引整体后移，按幕定位永远准 */
        pendingBoundaryRef.current = next.actIndex;
        setSummaryAct(cur.act);
        playSfx("chime");
        setPhase("actSummary");
        return;
      }
      if (next.kind === "choice") {
        setNodeIndex(index + 1);
        setPhase("choice");
        return;
      }
      setNodeIndex(index + 1);
      setPhase("dialogue");
    },
    [stream, script, indexById, finishLine],
  );

  /**
   * 一键跳到下一段没读过的剧情（批次 CY-27）。
   * 只在当前这一幕里往后找，不跨幕边界（跨幕要走结算卡，不能跳过去）：
   * 遇第一行「没读过的台词」停下；选项本身没有已读与否，但若它某个分支通向没读过的段落，也算「值得停」。
   * 一幕里全是读过的 → 不跳，浮一句提示。真心话段落没被记已读，天然会被停在它面前。
   */
  const jumpToUnread = useCallback(() => {
    if (phaseResolved !== "dialogue" && phaseResolved !== "choice") return;
    const start = stream[nodeIndex];
    if (!start) return;
    const curAct = start.actIndex;
    /* 选项分支是否通向没读过的行 */
    const choiceHasUnread = (node: Extract<FlatNode, { kind: "choice" }>): boolean =>
      node.choices.some((c) => {
        if (!c.branch) return false;
        const target = indexById.get(c.branch);
        if (target === undefined) return false;
        const tnode = stream[target];
        return tnode?.kind === "line" && !readRef.current.has(tnode.line.id);
      });
    for (let i = nodeIndex + 1; i < stream.length; i++) {
      const node = stream[i];
      if (node.actIndex !== curAct) break; /* 幕边界：交回结算卡，不跳 */
      if (node.kind === "line") {
        if (!readRef.current.has(node.line.id)) {
          setNodeIndex(i);
          setPhase("dialogue");
          playSfx("swoosh");
          return;
        }
      } else if (choiceHasUnread(node)) {
        setNodeIndex(i);
        setPhase("choice");
        playSfx("swoosh");
        return;
      }
    }
    setJumpNotice({ text: "这一幕里，你全都读过了。", stamp: Date.now() });
  }, [phaseResolved, stream, nodeIndex, indexById]);

  /* 跳到没读过的提示：浮一会儿自己收起 */
  useEffect(() => {
    if (!jumpNotice) return;
    const timer = window.setTimeout(() => setJumpNotice(null), 1600);
    return () => window.clearTimeout(timer);
  }, [jumpNotice]);

  /* 成就盖章：多停几秒——盖章是大事，值得看完（批次 CY-29） */
  useEffect(() => {
    if (!achToast) return;
    const timer = window.setTimeout(() => setAchToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [achToast]);

  /* ---------- 蛙的生物学（批次 AH）：鸣叫 / 冷血 ---------- */

  /** 鸣叫的回声提示（约七秒后自行收起） */
  const [croakNotice, setCroakNotice] = useState<{ text: string; stamp: number } | null>(null);
  /** 冷血提示：长时不动，角色开始关心你是不是还活着 */
  const [frozenNotice, setFrozenNotice] = useState<{ text: string; stamp: number } | null>(null);
  const frozenStepRef = useRef(0);
  const activityRef = useRef(Date.now());
  const bumpActivity = useCallback(() => {
    activityRef.current = Date.now();
  }, []);

  /* 鸣叫（批次 AH）：没有理由的发声——被记录，但不叫「鸣叫值」，叫「声音」。
     有的回应，有的不（按种子派生，同一局同一次恒定）；攒满二十，下一个深夜事件里全校园同时鸣叫。 */
  const handleCroak = useCallback(() => {
    if (phaseResolved === "ending" || phaseResolved === "finale") return;
    playSfx("ding");
    bgmDuckPulse(0.45, 0.45);
    bumpActivity();
    const calls = recordCroak();
    const save = loadGameSave();
    const day = dayOfDoneCount(countCompletedLines(save));
    const replied = seedRandom(save.weatherSeed * 733 + calls * 131 + day * 17) < 0.55;
    const pick = seedRandom(save.weatherSeed * 991 + calls * 313 + 7);
    const pool = replied ? CROAK_REPLY_LINES : CROAK_SILENT_LINES;
    const text = pool[Math.floor(pick * pool.length) % pool.length];
    setCroakNotice({ text, stamp: Date.now() });
  }, [phaseResolved, bumpActivity]);

  /* 「动了」的判定：节点 / 相位 / 弹层 / 定格 / 片头变化，以及打字中的连点（advanceWithSound） */
  useEffect(() => {
    activityRef.current = Date.now();
  }, [nodeIndex, phaseResolved, overlay, cgOpen, opOpen]);

  /* 冷血（批次 AH）：三十秒不动 → 角色开始关心你是不是还活着；轮着问，问完从第一句重新问 */
  useEffect(() => {
    if (phaseResolved === "ending" || phaseResolved === "finale") return;
    const timer = window.setInterval(() => {
      if (overlay !== "none" || cgOpen || opOpen) {
        activityRef.current = Date.now();
        return;
      }
      const idleSec = Math.round((Date.now() - activityRef.current) / 1000);
      if (idleSec < FROZEN_IDLE_SECONDS) return;
      const step = frozenStepRef.current % FROZEN_NOTICES.length;
      frozenStepRef.current += 1;
      recordBehavior({ kind: "idle", seconds: idleSec });
      setFrozenNotice({ text: FROZEN_NOTICES[step], stamp: Date.now() });
      activityRef.current = Date.now();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phaseResolved, overlay, cgOpen, opOpen]);

  /* 回声 / 冷血提示：浮出几秒后自行收起（不抢推进） */
  useEffect(() => {
    if (!croakNotice) return;
    const timer = window.setTimeout(() => setCroakNotice(null), 6800);
    return () => window.clearTimeout(timer);
  }, [croakNotice]);
  useEffect(() => {
    if (!frozenNotice) return;
    const timer = window.setTimeout(() => setFrozenNotice(null), 7600);
    return () => window.clearTimeout(timer);
  }, [frozenNotice]);

  /** 旧皮的一瞥（批次 AH）：每次进线至多一次——蜕过皮的玩家偶尔瞥见柜子最里层那层皮（纯叙事零数值） */
  const [glimpseNotice, setGlimpseNotice] = useState<{ text: string; stamp: number } | null>(null);
  const glimpseDoneRef = useRef(false);
  useEffect(() => {
    if (!lineId || glimpseDoneRef.current) return;
    glimpseDoneRef.current = true;
    const save = loadGameSave();
    const molts = save.molts ?? 0;
    if (molts === 0) return;
    if (seedRandom(save.weatherSeed * 37 + molts * 71) >= 0.35) return;
    const pick = seedRandom(save.weatherSeed * 53 + molts * 97);
    const text = SKIN_GLIMPSE_LINES[Math.floor(pick * SKIN_GLIMPSE_LINES.length) % SKIN_GLIMPSE_LINES.length];
    setGlimpseNotice({ text, stamp: Date.now() });
  }, [lineId]);
  useEffect(() => {
    if (!glimpseNotice) return;
    const timer = window.setTimeout(() => setGlimpseNotice(null), 7200);
    return () => window.clearTimeout(timer);
  }, [glimpseNotice]);

  /* ---------- 共谋（批次 AZ）：角色之间有他们自己的档案系统——不走流程 ---------- */

  /** 场景的缺席（批次 BB）：这三栋楼的特征是它们自己的——湖边的水声、操场的风、行政楼的温馨提示 */
  const [colludeNotice, setColludeNotice] = useState<{ text: string; stamp: number } | null>(null);
  const colludeDoneRef = useRef(false);
  useEffect(() => {
    if (!lineId || !storyline || colludeDoneRef.current) return;
    colludeDoneRef.current = true;
    const fresh = loadGameSave();
    const frogId = storyline.castIds[0];
    if (!frogId || frogId === SELF_ID) return;
    const frogName = FROG_CHARACTERS[frogId].displayName;
    const report = reportOf(fresh, lineId, frogId, frogName, storyline.title);
    if (report) {
      applyReport(frogId);
      setColludeNotice({ text: report.text, stamp: Date.now() });
      setSave(loadGameSave());
      return;
    }
    const shield = shieldOf(fresh, lineId, frogName, storyline.title);
    if (shield) {
      applyShield(lineId);
      setColludeNotice({ text: shield.text, stamp: Date.now() });
      setSave(loadGameSave());
      return;
    }
    const collusion = collusionQuoteOf(fresh, lineId, frogName, storyline.title);
    if (collusion) {
      markCollusion(lineId);
      setColludeNotice({ text: collusion.text, stamp: Date.now() });
      setSave(loadGameSave());
      return;
    }
    /* 场景也可以不出现（批次 BB）：不是维修——空间自己选择不开放。种子里派生，同一天恒定 */
    const spatial = SPATIAL_ABSENCE[lineId];
    if (spatial && seedRandom(Math.round(fresh.weatherSeed) * 307 + lineId.length * 91) < 0.15) {
      setColludeNotice({ text: spatial, stamp: Date.now() });
      return;
    }
    /* 场景腐烂（批次 BD）：隔了一个学期没来的楼，颜色淡了一层——你不来的地方，会自己淡下去 */
    const lastVisitSemester = fresh.lastVisits?.[lineId];
    if (lastVisitSemester !== undefined && (fresh.playthrough ?? 1) - lastVisitSemester >= 1) {
      setColludeNotice({ text: "（这栋楼有点褪色。它有一阵子没被翻开了——你不来的地方，会自己淡下去。）", stamp: Date.now() });
    }
  }, [lineId, storyline]);
  useEffect(() => {
    if (!colludeNotice) return;
    const timer = window.setTimeout(() => setColludeNotice(null), 7200);
    return () => window.clearTimeout(timer);
  }, [colludeNotice]);

  /* 停留（批次 AT）：state 先行声明——advance 的推进 guard 与停留逻辑都要读它们 */
  const [staying, setStaying] = useState(false);
  const [staySeconds, setStaySeconds] = useState(0);
  const [stayNotice, setStayNotice] = useState<{ text: string; stamp: number } | null>(null);

  const advance = useCallback(() => {
    if (phaseResolved !== "dialogue") return;
    /* CG 定格展开期间推进停摆：先收 CG 才继续（批次 B2） */
    if (cgOpen) return;
    /* 停留（批次 AT）：不推进——你说了要待着 */
    if (staying) return;
    const cur = stream[nodeIndex];
    if (!cur || cur.kind !== "line") return;
    if (fullText && displayedText.length < fullText.length) {
      setDisplayedText(fullText);
      return;
    }
    /* 推进即批量落盘已读节点（攒满待写才真正写一次） */
    flushPendingRead();
    transitionFrom(nodeIndex);
  }, [phaseResolved, cgOpen, staying, stream, nodeIndex, fullText, displayedText, transitionFrom, flushPendingRead]);

  /** 对话框点击的继续：带推进音；自动播放走原 advance，免得轻嗒变成节拍器 */
  const advanceWithSound = useCallback(() => {
    bumpActivity();
    playSfx("advance");
    advance();
  }, [advance, bumpActivity]);

  /* ---------- 好感度：关键选项 → 真话点数 + 阈值真心话排队 ---------- */

  const applyAffinityEffects = useCallback(
    (choice: Choice, castIds: FrogCharacterId[], baseIndex: number, jumpTo?: string): QueuedTalk[] => {
      const targets: FrogCharacterId[] = [];
      if (choice.affinityTarget === "all") {
        targets.push(...castIds.filter((id) => id !== SELF_ID));
      } else if (choice.affinityTarget) {
        targets.push(choice.affinityTarget);
      }
      const selfGain = choice.silenceDelta === 0 ? SELF_TRUTH_DELTA : 0;
      if (targets.length === 0 && selfGain === 0) return [];

      const delta = choice.affinityDelta ?? 0;
      const newTalks: QueuedTalk[] = [];
      let tierLabel: string | null = null;
      let flashId: FrogCharacterId | "all" | null = null;
      let flashDelta = 0;

      for (const target of targets) {
        if (delta === 0) continue;
        const beforePoints = getAffinity(target);
        const afterSave = addAffinity(target, delta);
        const afterPoints = afterSave.affinity[target] ?? 0;
        const beforePct = affinityPercent(target, beforePoints);
        const afterPct = affinityPercent(target, afterPoints);
        if (afterPct > beforePct && affinityTierOf(afterPct).id !== affinityTierOf(beforePct).id) {
          tierLabel = affinityTierOf(afterPct).label;
        }
        for (const level of HEART_TALK_THRESHOLDS) {
          const talkKey = `${target}:${level}`;
          if (
            beforePct < level &&
            afterPct >= level &&
            FROG_CHARACTERS[target].heartTalk &&
            !queuedTalkKeysRef.current.has(talkKey)
          ) {
            queuedTalkKeysRef.current.add(talkKey);
            newTalks.push({ charId: target, level, baseIndex, jumpTo });
          }
        }
        if (flashId === null) {
          flashId = targets.length > 1 ? "all" : target;
          flashDelta = delta;
        }
      }

      /* 真话出口：主角也离自己近一点 */
      if (selfGain !== 0) {
        const beforePoints = getAffinity(SELF_ID);
        const afterSave = addAffinity(SELF_ID, selfGain);
        const beforePct = affinityPercent(SELF_ID, beforePoints);
        const afterPct = affinityPercent(SELF_ID, afterSave.affinity[SELF_ID] ?? 0);
        if (targets.length === 0) {
          if (afterPct > beforePct && affinityTierOf(afterPct).id !== affinityTierOf(beforePct).id) {
            tierLabel = affinityTierOf(afterPct).label;
          }
          flashId = SELF_ID;
          flashDelta = selfGain;
        }
      }

      setSave(loadGameSave());
      if (newTalks.length > 0) setHeartTalks((prev) => [...prev, ...newTalks]);
      if (flashId !== null) {
        playSfx("ding");
        setAffinityFlash({ charId: flashId, delta: flashDelta, tierLabel, stamp: Date.now() });
      }
      return newTalks;
    },
    [],
  );

  const chooseOption = useCallback(
    (choice: Choice) => {
      if (phaseResolved !== "choice") return;
      const cur = stream[nodeIndex];
      if (!cur || cur.kind !== "choice") return;
      playSfx("confirm");
      /* 选择登记（批次 Z·被涂改的历史）：真话（≤0）正常记、表演（>0）记斜体、沉默（隐藏选项）记空白——
         回想面板里玩家能直观看到这一路说了多少真话、演了多少戏 */
      setBacklog((prev) => {
        const entry: BacklogEntry = {
          speakerName: "奶白",
          text: choice.text,
          kind: "choice",
          register: choice.id.endsWith("-idle")
            ? "silence"
            : choice.silenceDelta <= 0
              ? "truth"
              : "performance",
        };
        const next = [...prev, entry];
        return next.length > BACKLOG_CAP ? next.slice(next.length - BACKLOG_CAP) : next;
      });
      let newTalks: QueuedTalk[] = [];
      const key = `${lineId ?? ""}:${cur.act.id}:${cur.sceneId}:${choice.id}`;
      /* 二周目回响：先判后盖——学期未知（旧档）视为更早学期，升级后第一次重选也触发回响 */
      const prior = choiceSemestersRef.current[key];
      const echoActive =
        entryPlaythrough >= 2 &&
        Boolean(choice.echo) &&
        (prior === undefined || prior < entryPlaythrough);
      if (!answeredRef.current.has(key)) {
        answeredRef.current.add(key);
        rememberChoiceId(key);
        if (choice.silenceDelta !== 0) {
          addSilence(choice.silenceDelta);
          setRunGain((prev) => prev + choice.silenceDelta);
        }
        /* 印象分：沉默 delta ≥2 视为「表演」，同步累计表演分（幂等：已答选项不重计） */
        if (choice.silenceDelta >= 2) {
          addReputation(choice.silenceDelta);
        }
        /* 震动演出（批次 B2）：delta ≥ 3 的选项首次确认，舞台轻晃 120ms（克制） */
        if (choice.silenceDelta >= 3) {
          setShakeStamp(Date.now());
        }
        /* 真话罐：沉默 delta ≤0 的选项文案自动收进罐子（addTruth 内部按文案幂等去重） */
        if (choice.silenceDelta <= 0) {
          addTruth(choice.text);
        }
        /* 被注意值：说真话（≤0）被记一笔 +1，表演（≥2）被漏一笔 −1，+1 不变。
           只挂数值不改结局——沉默值仍是唯一分档依据，被注意值是档案里的平行记录 */
        if (choice.silenceDelta <= 0) {
          addAttention(1);
        }
        if (choice.silenceDelta >= 2) {
          addAttention(-1);
        }
        setActGain((prev) =>
          prev.actIndex === cur.actIndex
            ? { actIndex: cur.actIndex, gain: prev.gain + choice.silenceDelta }
            : { actIndex: cur.actIndex, gain: choice.silenceDelta },
        );
        setGainFlash({ delta: choice.silenceDelta, stamp: Date.now() });
        newTalks = applyAffinityEffects(choice, storyline?.castIds ?? [], cur.baseIndex, choice.branch);
      }
      /* 盖章放在幂等守卫外：每次选择都记（幂等，只保留最早学期），
         否则旧档未盖章的选项永远无法升级为「已知学期」 */
      const currentStamp = choiceSemestersRef.current[key];
      if (currentStamp === undefined || currentStamp > entryPlaythrough) {
        choiceSemestersRef.current = { ...choiceSemestersRef.current, [key]: entryPlaythrough };
      }
      rememberChoiceSemester(key, entryPlaythrough);
      /* 岔路收束：本学期选过哪些选项也记一笔（幂等去重；结局卡据此列出你走过的岔路） */
      recordPickThisSemester(key, entryPlaythrough);
      /* 回响排在真心话之前插入：选项 → 回响 → 真心话 → 分支段落 → 汇流 */
      if (echoActive) {
        setEchoTalks((prev) => [
          ...prev,
          { choiceId: choice.id, baseIndex: cur.baseIndex, jumpTo: choice.branch },
        ]);
      }
      /* 湖边夜谈：每次选择后幂等检查全员真话收束段 */
      if (lineId === "lake" && allTrueFriends(loadGameSave())) {
        setFinaleCoda(true);
      }
      /* 插入段（真心话 / 回响）紧跟在选项节点之后：把指针挪进插入段；
         带真心话时插入段尾节点的 merge → 选项的分支目标（选项 → 真心话 → 分支段落 → 汇流），
         只有回响时由 echo 节点自己带 merge 落进分支；
         没有 branch 时由 transitionFrom 照常落到幕边界 / 下一节点——幕边界前的插入段不会被结算卡跳过 */
      if (newTalks.length > 0 || echoActive) {
        setNodeIndex(nodeIndex + 1);
        setPhase("dialogue");
        return;
      }
      /* 真分支：选项带 branch → 播放流跳到该分支段落首节点 */
      const branchTarget = choice.branch ? indexById.get(choice.branch) : undefined;
      if (branchTarget !== undefined) {
        const targetNode = stream[branchTarget];
        setNodeIndex(branchTarget);
        setPhase(targetNode?.kind === "choice" ? "choice" : "dialogue");
        return;
      }
      transitionFrom(nodeIndex);
    },
    [
      phaseResolved,
      stream,
      nodeIndex,
      lineId,
      storyline,
      entryPlaythrough,
      indexById,
      transitionFrom,
      applyAffinityEffects,
    ],
  );

  /** 让它替我选（批次 BC「替换」）：你放弃了选择——它替你选，选的和你想的不一样。
   *  档案仍然记在你头上：该蛙的选择由他人代为做出。 */
  const deferChoice = useCallback((): boolean => {
    if (phaseResolved !== "choice") return false;
    const cur = stream[nodeIndex];
    if (!cur || cur.kind !== "choice") return false;
    /* 它替你选：按种子从这一组里挑一支——挑中的常常不是你想的那支（沉默那条它不替你选） */
    const pool = cur.choices.filter((choice) => !choice.idle);
    const pick = pool[Math.floor(seedRandom(save.weatherSeed + nodeIndex * 71) * pool.length) % pool.length] ?? cur.choices[0];
    if (!pick) return false;
    const frogId = storyline?.castIds[0];
    const frogName = frogId ? FROG_CHARACTERS[frogId].displayName : "它";
    recordDeferred();
    recordBehavior({ kind: "defer", label: frogName });
    setColludeNotice({
      text: `（${frogName}替你选了。它选的和你想的不一样——你以为它会懂。档案一行：该蛙的选择由他人代为做出。）`,
      stamp: Date.now(),
    });
    setSave(loadGameSave());
    chooseOption(pick);
    return true;
  }, [phaseResolved, stream, nodeIndex, save.weatherSeed, storyline, chooseOption]);

  const goNextAct = useCallback(() => {
    if (!lineId) return;
    /* 幕间过渡（批次 B2）：黑场扫过再揭幕 */
    setTransition({ kind: "act", stamp: Date.now() });
    playSfx("swoosh");
    /* 幕边界按 actIndex 定位：真心话插入后绝对索引会漂移，按幕找该幕首个节点永远对 */
    const boundaryAct = pendingBoundaryRef.current;
    const targetIndex = stream.findIndex((node) => node.actIndex === boundaryAct);
    if (targetIndex < 0) {
      finishLine();
      return;
    }
    saveLineAct(lineId, stream[targetIndex].actIndex);
    setNodeIndex(targetIndex);
    setPhase("dialogue");
    setSave(loadGameSave());
    /* 鸣叫发作（批次 CE）：安静下来的那一幕结束之后，你叫了一声——没有选项，没有预警。
       不是「要不要叫」——叫已经叫了；是「叫了之后怎么办」。每学期至多一次。 */
    if (!hasCroakBurstThisSemester(loadGameSave())) {
      const fresh = loadGameSave();
      const roll =
        (Math.round(fresh.weatherSeed) % 1000000) * 1207 + fresh.playthrough * 13 + (boundaryAct ?? 0) * 29 + 179;
      if ((fresh.silenceValue ?? 0) >= 2 && seedRandom(roll % 1000000) < 0.22) {
        markCroakBurst();
        recordCroak();
        setInstinct("croak");
      }
    }
  }, [lineId, stream, finishLine]);

  /** 快进（批次 AT 语义升级）：不是跳过文本，是跳过时间——一路推进到下一处抉择 / 真心话 / 幕尾 / 结局；
      逐节点遵循 merge 跳转，没选中的分支段落不会被顺带扫过。
      跳过的行被记录进档案（forwards + fastForwardLog，暂停里可以翻）：
      快进越多，档案越厚，但玩家越薄。commit=false（停留的场景自己结束时）不记录。 */
  const skipForward = useCallback(
    (commit = true) => {
      if (phaseResolved !== "dialogue") return;
      /* CG 定格展开期间快进停摆（批次 B2） */
      if (cgOpen) return;
      let i = nodeIndex;
      let guard = 0;
      const passedLines: string[] = [];
      while (guard++ < 600) {
        const cur = stream[i];
        if (!cur) return;
        if (cur.kind === "choice") {
          if (commit && passedLines.length > 0) {
            recordFastForward(passedLines.length, passedLines[Math.floor(passedLines.length / 2)] ?? "");
            setSave(loadGameSave());
          }
          setNodeIndex(i);
          setPhase("choice");
          return;
        }
        if (cur.kind === "line") {
          if (cur.line.heart) {
            if (commit && passedLines.length > 0) {
              recordFastForward(passedLines.length, passedLines[Math.floor(passedLines.length / 2)] ?? "");
              setSave(loadGameSave());
            }
            setNodeIndex(i);
            setPhase("dialogue");
            return;
          }
          /* 分支段落末尾的 merge：跳进汇流段落，绕开没选中的分支 */
          const merged = cur.line.merge ? indexById.get(cur.line.merge) : undefined;
          if (merged !== undefined && merged !== i) {
            i = merged;
            continue;
          }
        }
        const next = stream[i + 1];
        if (!next) {
          if (commit && passedLines.length > 0) {
            recordFastForward(passedLines.length, passedLines[Math.floor(passedLines.length / 2)] ?? "");
            setSave(loadGameSave());
          }
          finishLine();
          return;
        }
        if (next.actIndex !== cur.actIndex) {
          if (commit && passedLines.length > 0) {
            recordFastForward(passedLines.length, passedLines[Math.floor(passedLines.length / 2)] ?? "");
            setSave(loadGameSave());
          }
          pendingBoundaryRef.current = next.actIndex;
          setSummaryAct(cur.act);
          setPhase("actSummary");
          return;
        }
        /* 收集跳过的行（当前正在显示的这一行不算——玩家至少看过它一眼） */
        if (i > nodeIndex && cur.kind === "line") passedLines.push(cur.line.text);
        i += 1;
      }
    },
    [phaseResolved, cgOpen, stream, indexById, nodeIndex, finishLine],
  );

  /* ---------- 时间机器（批次 AT）：暂停 / 倒带 / 停留——时间本身变成可操作的东西 ---------- */

  /* 暂停：背景不变、音乐继续，玩家在暂停里查看数值、档案、图鉴与快进记录。
     不冻结世界：自动播放与选项的犹豫计时照走——你以为你停住了世界，
     但世界只是等你不在的时候自己走（暂停够久，关掉时场景已经不在原地）。 */
  const [paused, setPaused] = useState(false);
  const pauseStartRef = useRef(0);
  const [pauseSeconds, setPauseSeconds] = useState(0);
  /** 关掉一次够久的暂停后渗出的那行：你不在的时候，它们自己走了一段 */
  const [pauseReturnNotice, setPauseReturnNotice] = useState<{ seconds: number; stamp: number } | null>(null);
  const togglePause = useCallback(() => {
    setPaused((prev) => {
      if (prev) {
        const seconds = Math.max(0, Math.round((Date.now() - pauseStartRef.current) / 1000));
        if (seconds >= 3) {
          recordPause(seconds);
          setSave(loadGameSave());
          if (seconds >= 20) setPauseReturnNotice({ seconds, stamp: Date.now() });
        }
      } else {
        pauseStartRef.current = Date.now();
        setPauseSeconds(0);
      }
      return !prev;
    });
  }, []);
  useEffect(() => {
    if (!paused) return;
    const timer = window.setInterval(
      () => setPauseSeconds(Math.round((Date.now() - pauseStartRef.current) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [paused]);

  /* 倒带：不是读档——场景回到本幕开头，数值不回退（发生过的事都记着），
     但角色记得原来的版本。倒带次数进档案。 */
  const canRewind = useMemo(() => {
    if (phaseResolved !== "dialogue" || cgOpen) return false;
    const cur = stream[nodeIndex];
    if (!cur) return false;
    const actStart = stream.findIndex((node) => node.actIndex === cur.actIndex);
    return actStart >= 0 && actStart < nodeIndex;
  }, [phaseResolved, cgOpen, stream, nodeIndex]);
  const [rewindNotice, setRewindNotice] = useState<{ stamp: number } | null>(null);
  const rewind = useCallback(() => {
    if (phaseResolved !== "dialogue" || cgOpen) return;
    const cur = stream[nodeIndex];
    if (!cur) return;
    const actStart = stream.findIndex((node) => node.actIndex === cur.actIndex);
    if (actStart < 0 || actStart >= nodeIndex) return;
    recordRewind();
    setSave(loadGameSave());
    setRewindNotice({ stamp: Date.now() });
    setNodeIndex(actStart);
    setPhase("dialogue");
    setDisplayedText("");
  }, [phaseResolved, cgOpen, stream, nodeIndex]);

  /* 停留：不推进、不跳过、不存档，就是待在那里。待久了——它问你、它沉默、
     背景变暗、场景自己结束。试图留在某个瞬间，但瞬间不会留在你身边。
     （state 已在 advance 之前声明） */
  const enterStay = useCallback(() => {
    if (phaseResolved !== "dialogue" || cgOpen || paused || staying) return;
    setStaying(true);
    setStaySeconds(0);
  }, [phaseResolved, cgOpen, paused, staying]);
  const leaveStay = useCallback(() => {
    if (!staying) return;
    setStaying(false);
    recordStay();
    setSave(loadGameSave());
    setStayNotice({ text: "（你走了。没有一次留住。）", stamp: Date.now() });
  }, [staying]);
  useEffect(() => {
    if (!staying) return;
    const timer = window.setInterval(() => setStaySeconds((prev) => prev + 1), 1000);
    return () => window.clearInterval(timer);
  }, [staying]);
  useEffect(() => {
    if (!staying) return;
    if (staySeconds < 30) return;
    /* 场景自己结束：不记快进（这不是你快进的），推进到下一个关键节点 */
    setStaying(false);
    recordStay();
    setSave(loadGameSave());
    setStayNotice({ text: "（场景自己结束了。你没有走——是它先动的。）", stamp: Date.now() });
    skipForward(false);
  }, [staying, staySeconds, skipForward]);
  useEffect(() => {
    if (!stayNotice) return;
    const timer = window.setTimeout(() => setStayNotice(null), 7200);
    return () => window.clearTimeout(timer);
  }, [stayNotice]);
  /** 停留的分段旁白：待多久，它说什么由时间决定 */
  const stayLine = useMemo<string | null>(() => {
    if (!staying) return null;
    if (staySeconds >= 20) return "背景在变暗。这里不欢迎停留，也不赶你走。";
    if (staySeconds >= 12) return "它不再看你，也不再说话。";
    if (staySeconds >= 5) return "「你不走吗？」";
    return null;
  }, [staying, staySeconds]);
  useEffect(() => {
    if (!pauseReturnNotice) return;
    const timer = window.setTimeout(() => setPauseReturnNotice(null), 7200);
    return () => window.clearTimeout(timer);
  }, [pauseReturnNotice]);

  /* ---------- 注视（批次 AY）：第四面墙本来就不存在——角色一直能看见玩家，只是之前没看 ---------- */

  /** 被注视（批次 AY）：被注意值攒到 8——名单在列之后，它开始看屏幕。
   *  玩家动鼠标，它的视线跟着；玩家点击，它眨一下眼。 */
  const gazeOn = getAttention(save) >= 8 && phaseResolved === "dialogue" && !cgOpen;
  const [gaze, setGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const gazeRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!gazeOn) return;
    const onMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      /* 变化太小就不动——视线是慢慢跟的 */
      if (Math.abs(x - gazeRef.current.x) < 0.06 && Math.abs(y - gazeRef.current.y) < 0.06) return;
      gazeRef.current = { x, y };
      setGaze({ x, y });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [gazeOn]);
  /** 点击眨眼（批次 AY）：你动一下，它也动一下（节流三秒，免得眨成抽搐） */
  const [blinkNotice, setBlinkNotice] = useState<{ text: string; stamp: number } | null>(null);
  const blinkAtRef = useRef(0);
  const blinkOnStageClick = useCallback(() => {
    if (!gazeOn) return;
    const now = Date.now();
    if (now - blinkAtRef.current < 3000) return;
    blinkAtRef.current = now;
    setBlinkNotice({ text: "（它眨了一下眼。）", stamp: now });
  }, [gazeOn]);
  useEffect(() => {
    if (!blinkNotice) return;
    const timer = window.setTimeout(() => setBlinkNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [blinkNotice]);

  /** 注视角色（批次 AY）：玩家可以注视某个角色——你不说话，但你的目光在说话。
   *  分段：你看我干什么 → 它不自在 → 它回看你 → 你是不是有话要说 → 档案没有收这一眼。 */
  const [staring, setStaring] = useState<FrogCharacterId | null>(null);
  const [stareSeconds, setStareSeconds] = useState(0);
  const toggleStare = useCallback(
    (id: FrogCharacterId) => {
      /* 挡开（批次 AY）：行政楼的窗口不看脸——你被允许看什么，是被规定的 */
      if (lineId === "administration") {
        setFileCardOpen(true);
        return;
      }
      setStaring((prev) => (prev === id ? null : id));
      setStareSeconds(0);
    },
    [lineId],
  );
  useEffect(() => {
    if (!staring) return;
    const timer = window.setInterval(() => setStareSeconds((prev) => prev + 1), 1000);
    return () => window.clearInterval(timer);
  }, [staring]);
  const stareLine = useMemo<string | null>(() => {
    if (!staring) return null;
    if (stareSeconds >= 14) return "（它还在等。档案没有收这一眼。）";
    if (stareSeconds >= 10) return "「你是不是有话要说？」";
    if (stareSeconds >= 7) return "（它回看了你。）";
    if (stareSeconds >= 4) return "（它有点不自在。）";
    if (stareSeconds >= 2) return "「你看我干什么？」";
    return null;
  }, [staring, stareSeconds]);

  /** 挡开（批次 AY）：行政楼的文件——它把你的视线物理地挡回纸面上 */
  const [fileCardOpen, setFileCardOpen] = useState(false);
  const closeFileCard = useCallback(() => setFileCardOpen(false), []);

  /* ---------- 自动播放 ---------- */

  useEffect(() => {
    if (!autoMode || phaseResolved !== "dialogue" || isTyping) return;
    /* CG 定格展开期间自动播放停摆：先收 CG 才继续（批次 B2） */
    if (cgOpen) return;
    /* 停留（批次 AT）：你显式说了要待着——自动播放陪你停这一拍 */
    if (staying) return;
    /* 跳过已读模式下，已读段由下面的快进节奏接管，避免两个计时器抢同一格 */
    if (skipReadMode && readArrivalRef.current) return;
    const timer = window.setTimeout(() => advance(), settings.autoMs);
    return () => window.clearTimeout(timer);
  }, [autoMode, phaseResolved, isTyping, advance, settings.autoMs, skipReadMode, cgOpen, staying]);

  const toggleAuto = useCallback(() => setAutoMode((prev) => !prev), []);

  /* ---------- 跳过已读：已读段瞬显后 120ms 自动走一段，每段最多一声轻嗒。
      遇选项 / 真心话 / 未读节点停住（它们的 readArrivalRef 恒为 false）；
      幕边界与结局相位在 advance → transitionFrom / finishLine 改相位后自然停；
      merge / branch 跳转全部走既有 transitionFrom，没走过的分支段落不在已读集合里，
      快进到它面前就会停下来 ---------- */

  useEffect(() => {
    if (!skipReadMode || phaseResolved !== "dialogue" || isTyping) return;
    /* CG 定格展开期间快进停摆：先收 CG 才继续（批次 B2） */
    if (cgOpen) return;
    /* 停留（批次 AT）：待着的时候，已读快进也停一拍 */
    if (staying) return;
    if (!readArrivalRef.current) return;
    const timer = window.setTimeout(() => advanceWithSound(), SKIP_READ_MS);
    return () => window.clearTimeout(timer);
  }, [skipReadMode, phaseResolved, isTyping, advanceWithSound, cgOpen, staying]);

  /* ---------- 手动存档 / 提示闪烁 ---------- */

  /** 顶栏「存档」：先把当前幕记进续播进度（快照的 lineAct 才准），再打开存读档弹层 */
  const manualSave = useCallback(() => {
    if (lineId) saveLineAct(lineId, currentNode?.actIndex ?? 1);
    persistGameSave(loadGameSave());
    setSave(loadGameSave());
    setSavedFlash(true);
    setOverlay("save");
  }, [lineId, currentNode]);

  /* ---------- 自动档：幕结算与结局相位静默写 auto（快照含下一幕的续播位置） ---------- */

  useEffect(() => {
    if (!lineId || !script) return;
    if (phaseResolved === "actSummary" && summaryAct) {
      const nextActIndex = pendingBoundaryRef.current;
      if (nextActIndex >= 1) saveLineAct(lineId, nextActIndex);
      writeAutoSlot(entryPlaythrough, summaryAct.title, lineId);
      return;
    }
    if ((phaseResolved === "ending" || phaseResolved === "finale") && ending) {
      const lastAct = script.acts[script.acts.length - 1];
      writeAutoSlot(entryPlaythrough, lastAct?.title ?? "", lineId);
    }
  }, [phaseResolved, summaryAct, ending, lineId, script, entryPlaythrough, writeAutoSlot]);

  useEffect(() => {
    if (!savedFlash) return;
    /* 仪式小乐句（批次 CY-21）：存档落笔时轻响两声铃 */
    playCeremonyJingle("save");
    const timer = window.setTimeout(() => setSavedFlash(false), 1600);
    return () => window.clearTimeout(timer);
  }, [savedFlash]);

  useEffect(() => {
    if (!gainFlash) return;
    const timer = window.setTimeout(() => setGainFlash(null), 1500);
    return () => window.clearTimeout(timer);
  }, [gainFlash]);

  useEffect(() => {
    if (!affinityFlash) return;
    const timer = window.setTimeout(() => setAffinityFlash(null), 2000);
    return () => window.clearTimeout(timer);
  }, [affinityFlash]);

  /* ---------- 主题 ---------- */

  const switchTheme = useCallback((themeId: ThemeId) => {
    setActiveTheme(themeId);
    persistTheme(themeId);
    applyThemeToDocument(themeId);
  }, []);

  /* ---------- 音效开关（顶栏图标按钮用；偏好单独落盘，开新档不清） ---------- */

  const [soundOn, setSoundOnState] = useState(() => isSoundOn());
  const toggleSound = useCallback(() => {
    setSoundOnState(setSoundOn(!isSoundOn()));
  }, []);

  /* ---------- BGM（批次 B1）：按线切曲；二周目前缀层用回响曲；结局相位切终章；幕结算不停曲 ---------- */

  const [bgmOn, setBgmOnState] = useState(() => isBgmOn());
  const toggleBgm = useCallback(() => {
    setBgmOnState(setBgmOn(!isBgmOn()));
  }, []);

  const lineTrack = useMemo<BgmTrackId>(
    () => (lineId ? (LINE_BGM[lineId] ?? "afternoon") : "afternoon"),
    [lineId],
  );

  /** 场景→曲映射（批次 J 起；批次 S 抽到 bgmMapping 共享——深夜/白日事件弹层同地点同曲） */
  const bgTrack = useMemo<BgmTrackId | null>(() => stageTrackOf(activeBg), [activeBg]);

  /** 本页此刻该响的曲子：进正片后一直跟线走，进入结局相位换成终章收束 */
  const desiredBgm = useMemo<BgmTrackId | null>(() => {
    if (!lineId || !script) return null;
    if (phaseResolved === "ending" || phaseResolved === "finale") return "ending";
    /* 二周目：开场「蛙的记忆」前缀层用回响曲，进入天气旁白 / 正片切该线曲目 */
    if (entryPlaythrough >= 2 && memoryIntro.length > 0 && nodeIndex < memoryIntro.length) {
      return "memory";
    }
    /* 线内切曲（批次 J）：行级 bgm 覆盖 > 背景场景映射 > 线缺省曲 */
    if (activeLine?.bgm) return activeLine.bgm as BgmTrackId;
    if (bgTrack) return bgTrack;
    return lineTrack;
  }, [lineId, script, phaseResolved, entryPlaythrough, nodeIndex, memoryIntro, lineTrack, bgTrack, activeLine?.bgm]);

  /** 行音效（批次 J）：进入带 se 的行播一次，同行不重播 */
  const playedSeRef = useRef<string | null>(null);
  useEffect(() => {
    const seId = activeLine?.se;
    const lineIdNow = activeLine?.id ?? "";
    if (!seId || !lineIdNow) return;
    const stamp = `${lineIdNow}:${seId}`;
    if (playedSeRef.current === stamp) return;
    playedSeRef.current = stamp;
    playSe(seId as PlaySeId);
  }, [activeLine?.id, activeLine?.se]);

  /* 学期变奏（批次 W）：同一首曲子第二学期放慢一成、第三学期只剩节奏——熟悉但说不清哪里变了 */
  useEffect(() => {
    if (desiredBgm) playBgm(desiredBgm, entryPlaythrough);
    else stopBgm();
  }, [desiredBgm, entryPlaythrough]);

  /* 终幕渐强收尾（批次 CY-8）：走进终幕、等换曲淡入落定后，结局曲自己涌一次——
     音量抬三成半、音色开亮、速度悄悄加速一成二，涌到头停在高位不落回，像整首歌替你憋住那口气。 */
  useEffect(() => {
    if (phaseResolved !== "finale") return;
    const timer = window.setTimeout(() => bgmCrescendoFinale(), 1400);
    return () => window.clearTimeout(timer);
  }, [phaseResolved]);

  /* 音量自动闪避（批次 CY-10）：有人开口，配乐就自动低头让路——
     普通台词轻让一档，真心话让得更深（那句话值得整个房间安静），内心独白再抬半格；
     没人说话的纯叙述只是轻轻垫低。说完不掐，声音引擎按拍子缓缓把音乐抬回原位。 */
  useEffect(() => {
    const node = stream[nodeIndex];
    if (!node || node.kind !== "line") return;
    const line = node.line;
    const isNarration = line.speakerId === "narration";
    if (!isNarration && line.text) bgmDuckPulse(line.heart === true ? 0.55 : 0.34, line.heart === true ? 0.5 : 0.3);
    else if (!isNarration) bgmDuckPulse(0.42, 0.4);
    else bgmDuckPulse(0.2, 0.22);
  }, [nodeIndex, stream]);

  /* 持续压低（批次 CY-10 / CY-17）：选项挂出、或系统弹层（存档/读档/回想/行政规定）
     开着时配乐待在低位；两件同时发生取更深的一方，都关了回满 */
  useEffect(() => {
    const want = Math.max(overlay !== "none" ? 0.38 : 0, phaseResolved === "choice" ? 0.45 : 0);
    setBgmDuckSustain(want);
    return () => setBgmDuckSustain(0);
  }, [overlay, phaseResolved]);

  /* 离开剧情页（卸载）走换页宽限期（批次 CY-17）：450ms 内下一站点了歌就首尾相接，
     没人接歌（去了不放配乐的页面）才真的停 */
  useEffect(() => () => releaseBgmHandoff(), []);

  /* 档案成就（批次 J 起，批次 K 泛化）：结局相位按线解锁对应「走完线」成就；岔路成就由结局图鉴页解锁 */
  useEffect(() => {
    if (phaseResolved !== "ending" && phaseResolved !== "finale") return;
    const fresh = loadGameSave();
    const doneAch = lineId ? LINE_ACHIEVEMENT_DONE[lineId] : undefined;
    /* 仪式小乐句（批次 CY-21）：真解锁到新成就才响（unlockAchievement 只有新解锁返回 true）；
       两条成就各判各的，不用 || 短路——第一条中了第二条也要照常结算 */
    let newly = false;
    /* 新解锁的成就名（批次 CY-29）：乐句之外再在舞台上当场盖章点名 */
    let lastAchId: string | null = null;
    if (doneAch && lineId && fresh.completedLines.includes(lineId as StorylineId)) {
      const got = unlockAchievement(doneAch);
      newly = got || newly;
      if (got) lastAchId = doneAch;
    }
    if (getAttention(fresh) >= 8) {
      const got = unlockAchievement("ach-attention");
      newly = got || newly;
      if (got) lastAchId = "ach-attention";
    }
    if (newly) {
      playCeremonyJingle("achievement");
      const def = lastAchId ? achievementById(lastAchId) : undefined;
      if (def) setAchToast({ name: def.name, stamp: Date.now() });
    }
  }, [phaseResolved, lineId]);
  /* 学期档案快照（批次 V）：结局相位把当学期数值与选择归档——档案柜的每一页。
     comment 按数值组合生成（档案腔）；同学期重复触发覆盖为最新。 */
  useEffect(() => {
    if (phaseResolved !== "ending" && phaseResolved !== "finale") return;
    if (!lineId) return;
    const fresh = loadGameSave();
    const truthCount = loadPickedThisSemester().keys.length;
    const denialCount = (fresh.denialLog ?? []).length;
    const attention = getAttention(fresh);
    const branch = loadPickedThisSemester().keys.map((key) => key.split(":").slice(1).join(":"));
    const entry = {
      playthrough: getPlaythrough(fresh),
      silenceValue: fresh.silenceValue,
      reputation: fresh.reputation,
      attention,
      truthCount,
      branchWalked: branch,
      nightTitles: (fresh.seenNightEvents ?? []).map((id) => id),
      denialCount,
      lockedRoute: getLockedRoute(fresh) ?? undefined,
      visitedLines: [...fresh.visitedLines, ...fresh.completedLines],
      stamp: attention >= 8 ? "under-watch" : attention >= 3 ? "on-file" : "no-seal",
      comment: dossierComment({
        silenceValue: fresh.silenceValue,
        reputation: fresh.reputation,
        attention,
        truthCount,
        denialCount,
      }),
      seedCode: seedCodeOf(fresh.weatherSeed),
      seedLineage: fresh.seedParents
        ? `混种 · 父 ${seedCodeOf(fresh.seedParents[0])} · 母 ${seedCodeOf(fresh.seedParents[1])}`
        : undefined,
    } as const;
    upsertDossier({ ...entry, branchWalked: [...entry.branchWalked], visitedLines: [...entry.visitedLines], nightTitles: [...entry.nightTitles] });
  }, [phaseResolved, lineId]);

  /* ---------- 侧栏派生数据 ---------- */

  const finishedRun = phaseResolved === "ending" || phaseResolved === "finale";

  const actProgress = useMemo(() => {
    if (!script) return [];
    return script.acts.map((act) => ({
      index: act.index,
      title: act.title,
      state: (finishedRun || act.index < viewingActIndex
        ? "done"
        : act.index === viewingActIndex
          ? "current"
          : "todo") as ActProgressState,
    }));
  }, [script, viewingActIndex, finishedRun]);

  const collectedQuotes = useMemo(() => {
    if (!script) return [];
    return script.acts
      .filter((act) => act.quote && (finishedRun || act.index < viewingActIndex))
      .map((act) => ({ quote: act.quote ?? "", byName: quoteByName(act.quoteBy) }));
  }, [script, viewingActIndex, finishedRun]);

  const summary = useMemo(() => {
    if (phaseResolved !== "actSummary" || !summaryAct) return null;
    const nextAct = script?.acts.find((act) => act.index === summaryAct.index + 1);
    return {
      actTitle: summaryAct.title,
      actIndex: summaryAct.index,
      quote: summaryAct.quote ?? "",
      quoteByName: quoteByName(summaryAct.quoteBy),
      gain: actGain.actIndex === summaryAct.index ? actGain.gain : 0,
      nextActTitle: nextAct?.title ?? "",
    };
  }, [phaseResolved, summaryAct, script, actGain]);

  const endingTier = useMemo(() => {
    if (!ending || !script) return 0;
    return script.endings.findIndex((item) => item.id === ending.id);
  }, [ending, script]);

  /** 已收（批次 AW）：这份结局之前就解锁过——重复提交不另起一格，柜子只说「已收到」 */
  const repeatEnding = useMemo(() => {
    if (!ending) return false;
    const firstSeen = save.endingFirstSeen?.[ending.id];
    return firstSeen !== undefined && firstSeen < (save.playthrough ?? 1);
  }, [ending, save]);

  /** 替它走这一趟（批次 BC）：本学期替的是这条线——结局卡上多一行「档案上写的是你的名字」 */
  const substituteName = useMemo(() => {
    if (!lineId || save.substituteFor !== lineId) return null;
    const frogId = storyline?.castIds[0];
    return frogId ? (FROG_CHARACTERS[frogId]?.displayName ?? "它") : "它";
  }, [lineId, save.substituteFor, storyline]);

  /** 岔路收束：本学期（与进场学期一致的流水）在这条线上走过的支路，
      按幕/场顺序取每条支路的收束语；只消费 phase 进入结局态时的最新流水 */
  const branchCodas = useMemo<string[]>(() => {
    if (!script) return [];
    const record = loadPickedThisSemester();
    if (record.semester !== entryPlaythrough || record.keys.length === 0) return [];
    const picked = new Set(record.keys);
    const out: string[] = [];
    for (const act of script.acts) {
      for (const scene of act.scenes) {
        if (!scene.choices) continue;
        for (const choice of scene.choices) {
          if (!choice.coda) continue;
          const key = `${lineId ?? ""}:${act.id}:${scene.id}:${choice.id}`;
          if (picked.has(key)) out.push(choice.coda);
        }
      }
    }
    return out.slice(0, 4);
    /* 流水随选择递增，这里只按结局相位重算一次：进结局态时流水已定稿 */
  }, [script, entryPlaythrough, lineId, phaseResolved]);

  /** 离真心最近的一只 NPC 蛙（结局卡展示用） */
  const closestFrog = useMemo<ClosestFrog | null>(() => {
    let top: ClosestFrog | null = null;
    for (const character of Object.values(FROG_CHARACTERS)) {
      if (character.id === SELF_ID) continue;
      const percent = affinityPercent(character.id, save.affinity[character.id] ?? 0);
      if (percent <= 0) continue;
      if (!top || percent > top.percent) {
        top = {
          name: character.displayName,
          tierLabel: affinityTierOf(percent).label,
          percent,
        };
      }
    }
    return top;
  }, [save]);

  /** 印象分（公开形象）：表演分 ÷ 全剧本表演分满值 × 100，口径同坦诚度 */
  const impression = useMemo(() => impressionPercent(save.reputation), [save.reputation]);

  /* ---------- 导航 ---------- */

  /** 返回地图的淡出转场（批次 B2）：短暂淡黑后跳转，重复点击不叠计时器 */
  const mapNavTimerRef = useRef<number | null>(null);
  const backToMap = useCallback(() => {
    if (mapNavTimerRef.current !== null) return;
    setTransition({ kind: "map", stamp: Date.now() });
    playSfx("swoosh");
    mapNavTimerRef.current = window.setTimeout(() => {
      mapNavTimerRef.current = null;
      navigate("/map");
    }, 300);
  }, [navigate]);
  useEffect(
    () => () => {
      if (mapNavTimerRef.current !== null) window.clearTimeout(mapNavTimerRef.current);
    },
    [],
  );

  /* 进线黑场揭示（批次 B2）：首次挂载与换线都会揭一次幕 */
  useEffect(() => {
    if (!lineId) return;
    setTransition({ kind: "enter", stamp: Date.now() });
  }, [lineId]);

  const backHome = useCallback(() => navigate("/"), [navigate]);
  /** 暂停里直奔结局图鉴（批次 AT）：暂停中可以查看所有数值、档案、图鉴 */
  const goToEndings = useCallback(() => navigate("/endings"), [navigate]);

  /* ---------- 沉默的物理空间（批次 AK）：沉默值不只是数字，它在吞噬场景 ---------- */

  /** 选项档位（0-3）：≥5 真话那条先淡出去 / ≥9 再收一条 / ≥13 只剩「沉默」 */
  const silenceStage =
    save.silenceValue >= 13 ? 3 : save.silenceValue >= 9 ? 2 : save.silenceValue >= 5 ? 1 : 0;
  /** 背景与立绘档位（0-4）：≥5 开始空 / ≥9 更空 / ≥13 空旷 / ≥16 只剩位置 */
  const silenceVeilStage =
    save.silenceValue >= 16 ? 4 : save.silenceValue >= 13 ? 3 : save.silenceValue >= 9 ? 2 : save.silenceValue >= 5 ? 1 : 0;

  /** 沉默被听见（批次 AK）：沉默值第一次进入中档（≥5）时播那场三句对话——每学期一次。
     只在对白相位弹（不盖在选项 / 幕结算上）；落档后同步状态，否则关掉会被旧守卫立刻弹回来 */
  const [heardOpen, setHeardOpen] = useState(false);
  useEffect(() => {
    if (heardOpen || save.silenceHeardPlayed) return;
    if (phaseResolved !== "dialogue") return;
    if (save.silenceValue < 5) return;
    markSilenceHeard();
    setSave(loadGameSave());
    setHeardOpen(true);
  }, [save.silenceValue, save.silenceHeardPlayed, heardOpen, phaseResolved]);
  const dismissHeard = useCallback(() => setHeardOpen(false), []);

  return {
    /* 导航与主题 */
    storyline,
    buildingLabel: storyline ? (buildingById(storyline.building)?.label ?? "") : "",
    backToMap,
    backHome,
    goToEndings,
    activeTheme,
    switchTheme,
    /* 音效 */
    soundOn,
    toggleSound,
    /* BGM（批次 B1） */
    bgmOn,
    toggleBgm,
    /* 演出层（批次 B2）：CG 定格 / 转场 / 震动 */
    cgOpen,
    closeCg,
    activeCg,
    shakeStamp,
    transition,
    /* 校验 */
    invalidReason,
    /* 推进 */
    phase: phaseResolved,
    actTitle: currentNode?.act.title ?? "",
    actIndex: viewingActIndex,
    actTotal,
    displayedText,
    fullText,
    innerVoice,
    lineKind,
    isTyping,
    speakerName,
    speakerRole,
    stageSpeakerId,
    speakerExpression,
    /* 编目（批次 BS）：否认的蛙——文本降级为脚注，位置变成空白；翻三次自行降级；离校换学籍口径（批次 CC） */
    speakerTier,
    degradedLabel,
    pauseNote,
    /* 私档（批次 BV）：调阅痕——铭牌带痕 + 第一次开口先认账；补录后加「已备案」（批次 BW） */
    traceMark,
    traceLabel,
    traceNote,
    /* 撰写（批次 BZ）：撰写痕——铭牌带「被写过」+ 它先提那份报告（但不知道是谁写的） */
    reportMark,
    reportLabel: REPORT_TRACE_MARK,
    reportNote,
    /* 团体（批次 CA）：铭牌带「团体」+ 你比旁的蛙多知道一件（加入过的那一份信息） */
    factionMark,
    factionNote,
    /* 离校（批次 CC）：它回来了——铭牌带「回来了」+ 它不记得你（档案重置，你的没有） */
    departMark,
    departLabel: DEPARTURE_RETURN_MARK,
    departNote,
    /* 消迹（批次 CF）：那一句从档案里没了——渗出一行「那一栏是空的」 */
    vanishNote,
    /* 本能（批次 CE）：发作中的那一种 + 叫了之后怎么办 */
    instinct,
    ackInstinct,
    closeInstinct,
    stageBlanks,
    /* 批次 J：舞台背景场景、立绘姿势/服装差分、线级结局定格、片头（批次 K 泛化查表） */
    activeBg,
    activePose,
    activeGear,
    endingCg: script?.endingCg,
    endingPlate: endingPlateOf(lineId ?? null),
    opOpen,
    opPlate: openingPlateOf(lineId ?? null),
    closeOp,
    isHeartLine,
    isRememberLine,
    castIds: storyline?.castIds ?? [],
    advance: advanceWithSound,
    choices: currentNode?.kind === "choice" ? currentNode.choices : [],
    /* 曾表态淡标（批次 CY-31）：这一组选项里上一学期勾过的 id */
    answeredChoiceIds,
    /* 这一幕的已读进度（批次 CY-31） */
    actRead: actReadStat,
    chooseOption,
    autoMode,
    toggleAuto,
    skipForward,
    /* 时间机器（批次 AT）：暂停 / 倒带 / 停留——时间本身变成可操作的东西 */
    paused,
    pauseSeconds,
    togglePause,
    pauseReturnNotice,
    canRewind,
    rewind,
    rewindNotice,
    dismissRewind: () => setRewindNotice(null),
    staying,
    staySeconds,
    stayLine,
    enterStay,
    leaveStay,
    stayNotice,
    /* 注视（批次 AY）：第四面墙本来就不存在 */
    gazeOn,
    gaze,
    blinkNotice,
    blinkOnStageClick,
    staring,
    stareSeconds,
    stareLine,
    toggleStare,
    fileCardOpen,
    closeFileCard,
    /* 共谋（批次 AZ）：角色之间有他们自己的档案系统 */
    colludeNotice,
    /* 替换（批次 BC）：让它替我选 */
    deferChoice,
    manualSave,
    savedFlash,
    /* 系统层：回想 / 已读快进 / 设置 / 存读档弹层 */
    backlog,
    shredBacklog,
    shredCount: (save.shredLog ?? []).length,
    overlay,
    openOverlay,
    closeOverlay,
    settings,
    idleEnabled: settings.idleWait,
    onHesitate: (seconds: number) => {
      const cur = stream[nodeIndex];
      const label = cur && cur.kind === "choice" ? `第 ${cur.act.index} 幕 · 选项前` : "选项前";
      recordBehavior({ kind: "hesitate", seconds, label });
    },
    updateSettings,
    skipReadMode,
    toggleSkipRead,
    /* 一键跳到下一段没读过的剧情（批次 CY-27） */
    jumpToUnread,
    jumpNotice,
    /* 新旧区分（批次 CY-30）：当前这一行到达时是否已读过（对话框据此把旧内容变淡） */
    lineReadBefore,
    /* 成就盖章（批次 CY-29） */
    achToast,
    /* 沉默值 */
    silenceValue: save.silenceValue,
    silenceExpression: expressionForSilence(save.silenceValue) as FrogExpression,
    /* 被注意值：结局卡按它三档追加「档案注意记录」一行（不改结局分档） */
    attention: save.attention,
    gainFlash,
    runGain,
    doneCount: countCompletedLines(save),
    lakeUnlocked: isLakeUnlocked(save),
    isFinaleLine: lineId === "lake",
    /* 好感度 */
    affinityFlash,
    finaleCoda,
    closestFrog,
    /* 印象分（公开形象） */
    impressionPercent: impression,
    /* 幕结算 / 结局 */
    summary,
    goNextAct,
    ending,
    repeatEnding,
    substituteName,
    endingTier,
    /* 岔路收束：本学期在这条线上走过的支路（结局卡「这学期你走过的岔路」区块） */
    branchCodas,
    /* 二周目：进场学期快照（结局卡档案补记与大结局学期徽标用） */
    playthrough: entryPlaythrough,
    isPlusPlaythrough: entryPlaythrough >= 2,
    /* 三周目免检批注：playthrough ≥ 3 才在档案补记之下追加（纯展示，不改任何数值） */
    isThirdPlaythrough: entryPlaythrough >= 3,
    /* 侧栏 */
    actProgress,
    collectedQuotes,
    /* 蛙的生物学（批次 AH）：鸣叫（K / 顶栏）/ 冷血（长时不动，角色关心）/ 旧皮的一瞥 */
    croakNotice,
    frozenNotice,
    glimpseNotice,
    handleCroak,
    /* 沉默的物理空间（批次 AK）：选项档位 / 背景与立绘档位 / 沉默被听见 */
    silenceStage,
    silenceVeilStage,
    heardOpen,
    dismissHeard,
  };
}

export type UsePlayReturn = ReturnType<typeof usePlay>;
