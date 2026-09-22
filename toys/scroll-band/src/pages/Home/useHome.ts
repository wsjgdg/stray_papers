import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine, cutoffFromIdx, DRUM_KINDS, type AutoCurve, type DrumKind } from "@/lib/audio/audioEngine";
import {
  buildLevelShareUrl,
  buildShareUrl,
  buildTParam,
  canvasParamFromUrl,
  decodeRelayParam,
  encodeRelayParam,
  encodeScore,
  relayParamFromUrl,
  roParamFromUrl,
  scoreParamFromUrl,
  styleParamFromUrl,
  tParamFromUrl,
  type RelayLeg,
  type ScoreEvent,
} from "@/lib/audio/score";
import {
  analyzeArrange,
  analyzeMix,
  applyStyle,
  buildVolCurveObject,
  objLabels,
  STYLE_PRESETS,
  stylePresetById,
  type AiAction,
  type AiAdvice,
  type StylePresetId,
} from "@/lib/musicAi";
import {
  LLM_ERR_ZH,
  LYRIC_LLM_MODEL,
  alignLyricWords,
  buildLyricMessages,
  compileLyricEvents,
  lyricTargetOk,
  parseLyricJson,
  tokenizeLyric,
} from "@/lib/canvas/lyrics";
import { callLlmWithFallback } from "@/lib/llm";
import { useCostConfirm } from "@/hooks/useCostConfirm";
import type { LyricLang } from "@/lib/canvas/scoreCanvas";
import {
  appendRecHistory,
  listRecHistory,
  removeRecHistory,
  toggleRecHistoryStar,
  type RecHistoryEntry,
} from "@/lib/audio/recHistory";
import {
  PIANO_C3_MIDI,
  PIANO_KEYS,
  layoutKeyOf,
  nextTypingMode,
  pianoIndexOf,
  pianoKeyLabel,
  pianoPosOfMidi,
  typingModeName,
  type Keymap,
  type TypingMode,
} from "@/lib/audio/pianoMap";
import { startMidiInput, stopMidiInput } from "@/lib/audio/midiIn";
import {
  HumTracker,
  segmentHum,
  humToStroke,
  midiZoneWord,
  type HumFrame,
  type HumPhrase,
} from "@/lib/audio/humDetect";
import {
  CHALLENGE_LEVELS,
  CHALLENGE_TAIL,
  COUNTDOWN_SEC,
  GOOD_WINDOW,
  PERFECT_WINDOW,
  annotateFingering,
  barSecFor,
  canvasToChart,
  chartByBeats,
  decodeChartLevel,
  encodeChartLevel,
  fallSecFor,
  gradeFor,
  levelWindows,
  loadChallengeProgress,
  rateChart,
  loadSurvivalBest,
  loadSurvivalDailyBest,
  saveChallengeResult,
  saveSurvivalBest,
  saveSurvivalDailyBest,
  createSurvivalGen,
  survivalDailyKey,
  survivalDailySeed,
  survivalGrade,
  SURVIVAL_BPM,
  SURVIVAL_DAILY_SCORE_LEVEL,
  SURVIVAL_DOUBLE_HITS,
  SURVIVAL_DOUBLE_LEN,
  SURVIVAL_LIVES,
  SURVIVAL_SCORE_LEVEL,
  SURVIVAL_SPEEDUP_HITS,
  SURVIVAL_SPEED_MIN,
  SURVIVAL_SPEED_STEP,
  SURVIVAL_START_BARS,
  totalBarsOf,
  type ChallengeLevel,
  type ChallengeProgress,
  type ChartNote,
  type ChartRating,
  type FingerMark,
  type Grade,
  type SurvivalGen,
} from "@/lib/audio/challenge";
import {
  DRUM_KITS,
  SCALES,
  VOICES,
  bandDegs,
  bandRange,
  degLabel,
  drumKitById,
  drumKitIndexOf,
  scaleById,
  scaleFreq,
  scaleIndexOf,
  scaleMidi,
  voiceById,
  type Scale,
} from "@/lib/audio/scales";
import {
  DEFAULT_SYNTH_PATCH,
  SYNTH_TEMPLATES,
  loadSynthPatch,
  saveSynthPatch,
  type SynthPatch,
} from "@/lib/audio/synthPatch";
import {
  CURVE_PARAM_META,
  FULL_WIDTH_BEATS,
  MAX_CANVAS_OBJECTS,
  buildLoopSpecs,
  compileAnchor,
  compileCurve,
  compileStroke,
  decodeCanvasObjects,
  duplicateObject,
  encodeCanvasObjects,
  hitTest,
  newCanvasId,
  refreshAudio,
  relayLockedCount,
  rollFromObject,
  shiftObject,
  stretchTo,
  toLoopSpec,
  type CanvasObject,
  type CanvasPt,
  type CurveParam,
  type RollNote,
} from "@/lib/canvas/scoreCanvas";
import { describeCanvasText } from "@/lib/canvas/describe";
import { JamEngine, type JamPersona } from "@/lib/jam/jamEngine";
import { deformObject, type DeformOp } from "@/lib/canvas/deform";
import { loadCanvasObjects, saveCanvasObjects } from "@/lib/canvas/storeCanvas";
import { MAX_SLOTS, deleteSlot, listSlots, readSlot, writeSlot, type SlotMeta } from "@/lib/canvas/slots";
import { buildMidiFile, downloadMidi, type AnchorNote } from "@/lib/audio/midiExport";
import { recordStreamToWavFile } from "@/lib/audio/audioExport";
import { renderShareCard } from "@/lib/canvas/shareCard";
import {
  displayNick,
  findLevelById,
  getNick,
  listLevels,
  listTopScores,
  listWorks,
  patchLevelPlays,
  publishLevel,
  publishWork,
  setNick,
  submitScore,
  type LevelItem,
  type ScoreItem,
  type WorkItem,
} from "@/lib/social";
import { VisualRenderer, hueOfDeg } from "@/lib/visual/renderer";

const HINT_KEY = "so-compose-hint-seen";

// 指法手动微调：控制条指法 chip 携带谱面音索引（n），点击循环 右手1–5→左手1–5→自动；
// 覆盖表 key = `<关卡下标>:<音索引>`，空 = 跟随启发式建议，随 localStorage 持久
interface FinChip {
  s: string;
  n: number;
}
const FIN_OV_KEY = "so-chfin-override";

// 拖手柄改循环时长时的音符处理模式：scale=按新旧时长比值等比缩放（现行几何拉伸即此语义）
// / repeat=保持原音符相对位置、按原长重复复制填满新时长（超出截断）。
// null（未记住）= 每次松手弹选择条询问；记住后持久 so-resize-mode-v1
export type ResizeMode = "scale" | "repeat";
const RESIZE_MODE_KEY = "so-resize-mode-v1";
function loadResizeMode(): ResizeMode | null {
  const v = window.localStorage.getItem(RESIZE_MODE_KEY);
  return v === "scale" || v === "repeat" ? v : null;
}

// 分轨混音：每个画布对象（线/锚点）的音量/声像/静音/独奏，按对象 id 存本地
const MIX_KEY = "so-mix-v1";
type TrackMix = { gain: number; pan: number; muted: boolean; solo: boolean };
const DEFAULT_MIX: TrackMix = { gain: 1, pan: 0, muted: false, solo: false };

function loadMix(): Record<string, TrackMix> {
  try {
    const raw = window.localStorage.getItem(MIX_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, Partial<TrackMix>>;
    const out: Record<string, TrackMix> = {};
    for (const [id, m] of Object.entries(obj)) {
      if (!m || typeof m.gain !== "number") continue;
      out[id] = {
        gain: Math.min(1.5, Math.max(0, m.gain)),
        pan: Math.min(1, Math.max(-1, typeof m.pan === "number" ? m.pan : 0)),
        muted: m.muted === true,
        solo: m.solo === true,
      };
    }
    return out;
  } catch {
    return {};
  }
}
// chip 点击循环序：右1→右5→左1→左5→自动（= 清除覆盖回落启发式建议）
const CH_FIN_CYCLE: (FingerMark | null)[] = [
  { hand: "R", finger: 1 },
  { hand: "R", finger: 2 },
  { hand: "R", finger: 3 },
  { hand: "R", finger: 4 },
  { hand: "R", finger: 5 },
  { hand: "L", finger: 1 },
  { hand: "L", finger: 2 },
  { hand: "L", finger: 3 },
  { hand: "L", finger: 4 },
  { hand: "L", finger: 5 },
  null,
];
function loadFinOverrides(): Record<string, FingerMark> {
  try {
    const raw = localStorage.getItem(FIN_OV_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, FingerMark>) : {};
  } catch {
    return {};
  }
}

// 挑战模式内部阶段（与 mode 三态正交：mode==="challenge" 时才有意义）
// 撤销栈一步 = 状态快照 + 该步动作描述（HUD「历史」面板直接复用这套文案源）
type HistStep = { snap: string; label: string };
// 分享链接回放时间轴的视图状态（null = 不在链接回放会话中）
export type ReplayTimelineState = { total: number; time: number; playing: boolean };

type ChallengePhase = "select" | "countdown" | "play" | "paused" | "result";

// 结算快照（评级 + 准确率 + 最高连击 + P/G/M 计数 + 得分）
interface ChallengeSummary {
  rating: Grade;
  accuracy: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  score: number;
  /** 生存模式结算附加：坚持秒数 + 是否刷新本地/今日最佳（常规关卡缺省）；每日局带 day 日期键 */
  survival?: { seconds: number; newRecord: boolean; daily?: boolean; day?: string };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// 切音阶保旧音高：旧音阶音级（画布大区基准）→ 目标音阶在大区 E2–C6 内的最近合法绝对音级（大区基准）
function retuneDegToBand(
  toScale: Scale,
  toRange: { lo: number; hi: number },
  fromScale: Scale,
  fromLo: number,
  deg: number,
): number {
  const midi = scaleMidi(fromScale, fromLo + Math.round(deg));
  let best = toRange.lo;
  let bestD = Infinity;
  for (let idx = toRange.lo; idx <= toRange.hi; idx += 1) {
    const d = Math.abs(scaleMidi(toScale, idx) - midi);
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  }
  return best - toRange.lo;
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// 垫音基频：音阶主音低两个八度处的频率（画布音区拓宽后不再有八度旋钮，垫音固定音高锚定主音）
function padRootFreq(scale: Scale): number {
  return scaleFreq(scale, 2 * scale.semitones.length) / 2;
}

function describeDeg(scale: Scale, deg: number, vel: number): string {
  const n = scale.semitones.length;
  const absOct = Math.floor((bandRange(scale).lo + deg) / n) + 2;
  const zone = absOct <= 2 ? "低音区" : absOct >= 5 ? "高音区" : "中音区";
  const velWord = vel >= 0.6 ? "强力度" : vel >= 0.3 ? "中力度" : "弱力度";
  return `${degLabel(scale, ((deg % n) + n) % n)}，${zone}，${velWord}`;
}

export function useHome() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const rendererRef = useRef<VisualRenderer | null>(null);
  const stageRef = useRef<"intro" | "live">("intro");
  // 分享链接 ?t= 恢复创作者的音阶/音色/鼓包；旧链接缺段回落 五声+玻璃+原声
  const initialT = tParamFromUrl();
  const scaleRef = useRef(scaleById(initialT.scaleId));
  const voiceRef = useRef(voiceById(initialT.voiceId).id);
  const drumKitRef = useRef(drumKitById(initialT.drumKitId).id);
  // 打字层玩法：鼓（默认，向后兼容旧链接）↔ 钢琴；钢琴默认带背景琴键可视化
  const typingModeRef = useRef<TypingMode>(initialT.typingMode);
  const pianoBgRef = useRef(initialT.typingMode === "piano");
  const pendingScoreRef = useRef(scoreParamFromUrl());
  // 最近一次触摸事件时刻：用于吞掉触屏后浏览器合成的幽灵鼠标事件（防幻影光带/重复发声）
  const lastTouchRef = useRef(0);
  const pointerRef = useRef({
    x: 0,
    y: 0,
    lastMove: 0,
    lastIdx: -1,
    lastNoteAt: 0,
    down: false,
  });
  const recRef = useRef({
    active: false,
    start: 0,
    events: [] as ScoreEvent[],
    timer: 0,
  });
  const bpmRef = useRef(96);
  const lastLoopRef = useRef<ScoreEvent[]>([]);
  const loopCancelRef = useRef<(() => void) | null>(null);
  // 分享链接回放时间轴（访客只读演出 + 挑战「分享演奏」回放共用）：Logic 侧独立逻辑时钟，
  // 暂停/seek = 重排 scheduleSequence（t 平移回锚点、丢弃已越过的音符），主排程位仍单一；
  // 链接编码格式不变，纯查看端交互增强
  const rtEventsRef = useRef<ScoreEvent[]>([]);
  const rtTotalRef = useRef(0);
  const rtOffsetRef = useRef(0); // 会话锚点：已消费到的逻辑秒（暂停时冻结在这里）
  const rtStartAbsRef = useRef(0); // 锚点对应的引擎时刻（对齐 scheduleSequence 的 +0.2 起点）
  const rtPlayingRef = useRef(false);
  const rtCancelRef = useRef<(() => void) | null>(null);
  const [replayTimeline, setReplayTimeline] = useState<{
    total: number;
    time: number;
    playing: boolean;
  } | null>(null);
  // 演奏历史：停止录音自动存快照（≤6 条新在前，so-rechistory-v1），HUD「历史」面板可重放/删除
  const [recHistory, setRecHistory] = useState<RecHistoryEntry[]>(() => listRecHistory());
  const [recHistoryOpen, setRecHistoryOpen] = useState(false);
  // 回放进行中指示（历史重放/上次录音回放共用）：自然播完或被其他排程接管时熄灭
  const [replayActive, setReplayActive] = useState(false);
  const lastKeyAtRef = useRef(0);
  const sustainRef = useRef(false); // 钢琴延音踏板踩下中（失焦/切 tab 自动松开）
  const softRef = useRef(false); // 钢琴弱音器踏板踩下中（失焦/切 tab 自动松开）

  const modeRef = useRef<"perform" | "compose" | "challenge">("perform");
  const objectsRef = useRef<CanvasObject[]>([]);
  const selectedRef = useRef<string | null>(null);
  const draftRef = useRef<{
    points: CanvasPt[];
    startX: number;
    startY: number;
    curve: CurveParam | null; // 非空 = 这一笔在画参数曲线（关 = null 画笔迹）
  } | null>(null);
  const dragRef = useRef<
    | { kind: "body"; id: string; sx: number; sy: number; orig: CanvasPt[] }
    | { kind: "handle"; id: string }
    | null
  >(null);
  const cursorRef = useRef({ x: 0.5, y: 0.5 });
  const padOnRef = useRef(false); // 环境垫音默认关（新访客无垫音；HUD 打开后本次会话保持）
  const lastSyncRef = useRef(0);
  const capToastTimerRef = useRef(0);
  // 挑战模式（下落式音符）：ref 驱动 lookahead 调度，state 仅供 HUD / 浮层
  const chPhaseRef = useRef<ChallengePhase>("select");
  const chLevelRef = useRef(0);
  const chNotesRef = useRef<(ChartNote & { judged: boolean })[]>([]);
  const chStartRef = useRef(0); // 谱面 0 点对应的 engine.currentTime
  const chIdxRef = useRef(0); // lookahead 消费游标
  const chTimerRef = useRef(0);
  const chRafRef = useRef(0);
  const chScoreRef = useRef(0);
  const chComboRef = useRef(0);
  const chMaxComboRef = useRef(0);
  const chPRef = useRef(0);
  const chGRef = useRef(0);
  const chMRef = useRef(0);
  const chPausedRef = useRef(false); // 空格手动暂停中（tab 切回不自动续播）
  // 挑战演奏回放：race 局里每次命中记一个 p 事件（含真实偏差时值），结算后可生成分享链接
  const chPerfRef = useRef<ScoreEvent[]>([]);
  const chPerfUrlRef = useRef("");
  // 挑战辅助模式：race 常规 / demo 自动演示 / practice 慢速逐小节练习 / survival 无尽生存
  //（均挂 countdown/play 相位，phase 复用 play/paused，互斥）
  const chModeRef = useRef<"race" | "demo" | "practice" | "survival">("race");
  // 生存模式局内状态：提速系数（秒距与 fall 同比例，0.55 下限）/ 正确音计数 / 双倍余窗 /
  // 生成器与续批小节边界（只往 chNotesRef 尾部 push，判定与渲染零改动）
  const chSurvGenRef = useRef<SurvivalGen | null>(null);
  const chSurvSeqRef = useRef(0); // 一次性种子序号（每局不同、LCG 可复现）
  const chSurvFactorRef = useRef(1);
  const chSurvMadeRef = useRef(0); // 已生成音数（细胞渐进 / 黑键点缀门槛）
  const chSurvBarEndRef = useRef(0); // 最后生成小节的结束时刻（谱内秒）
  const chSurvCorrectRef = useRef(0);
  const chSurvNextSpeedRef = useRef(SURVIVAL_SPEEDUP_HITS);
  const chSurvNextDoubleRef = useRef(SURVIVAL_DOUBLE_HITS);
  const chSurvDoubleLeftRef = useRef(0);
  const chSurvSecRef = useRef(-1); // 上次上报 HUD 的整秒（变化才 setState）
  const chSurvDailyRef = useRef(false); // 当局是否每日挑战局（日期种子 + level=200 上报）
  const chScaleRef = useRef(1); // 练习速度倍率（0.5/0.75/1）：谱面 t/fall/beat 在时间域拉伸，判定窗保持真实毫秒
  const chLoopBarRef = useRef(false); // 练习循环本小节开关
  const chLoopAnchorRef = useRef(0); // 循环锚：正在循环的小节号（0 起，跳转/变速时跟随）
  const chStreakRef = useRef(0); // 练习「全中遍」连击：循环回卷即一遍边界，该遍无 Miss 则 +1，Miss 即清零
  const chPassMissRef = useRef(false); // 本遍是否出过 Miss（tick 超窗漏按与练习按错/空按共用捕获点）
  const fingeringOnRef = useRef(true); // 练习「指法」chip（默认开，View 同步渲染开关态）
  const chFingeringRef = useRef<(FingerMark | null)[] | null>(null); // 与 chNotesRef 按索引对齐；指法只看键位，不随时间拉伸变
  const chFinBarRef = useRef(-1); // 上次计算「本小节指法」行的小节号（0 起），跳小节/变速后 -1 强制重算
  const chProgressRef = useRef<ChallengeProgress>(loadChallengeProgress());

  const [stage, setStage] = useState<"intro" | "live">("intro");
  const [pitchLabel, setPitchLabel] = useState(`${scaleRef.current.name} · C 宫调`);
  // 音名标签节流：演奏态鼠标每划过一个音位都要更新一次（最快 13Hz），每次都重绘整棵 HUD——
  // 相同文案去重 + 120ms 最小间隔 + 尾帧补写（停下时最后一音一定落在标签上），砍掉大头无效重渲染
  const pitchLabelShownRef = useRef(pitchLabel);
  const pitchLabelAtRef = useRef(0);
  const pitchLabelTrailerRef = useRef(0);
  const setPitchLabelLive = useCallback((s: string) => {
    if (s === pitchLabelShownRef.current) return;
    const wait = 120 - (performance.now() - pitchLabelAtRef.current);
    const commit = () => {
      pitchLabelAtRef.current = performance.now();
      pitchLabelShownRef.current = s;
      setPitchLabel(s);
    };
    if (wait <= 0) {
      window.clearTimeout(pitchLabelTrailerRef.current);
      commit();
    } else {
      window.clearTimeout(pitchLabelTrailerRef.current);
      pitchLabelTrailerRef.current = window.setTimeout(commit, wait);
    }
  }, []);
  const [bpm, setBpm] = useState(96);
  const [scaleId, setScaleId] = useState(scaleRef.current.id);
  const [voiceId, setVoiceId] = useState(voiceRef.current);
  // 自造音色（简化合成器面板）：补丁持久 so-synth-patch，读档逐字段 clamp 兜底；
  // 面板开合 + 试听/模板/恢复出厂出口都从这里走，patch 改动实时灌引擎（热更新）
  const synthPatchRef = useRef<SynthPatch>(loadSynthPatch());
  const [synthPatch, setSynthPatchState] = useState<SynthPatch>(synthPatchRef.current);
  const [synthOpen, setSynthOpen] = useState(false);
  const [drumKitId, setDrumKitId] = useState(drumKitRef.current);
  const [typingMode, setTypingMode] = useState<TypingMode>(initialT.typingMode);
  const [pianoBgOn, setPianoBgOn] = useState(initialT.typingMode === "piano");
  // 触屏键盘开关（HUD「琴键」）：开启后屏幕底部浮出 26 白键 + 黑键，点按即弹
  const [touchKeys, setTouchKeys] = useState(false);
  // 键盘布局（HUD「键位」）：qwerty 横向映射 / piano 经典 DAW 双八度钢琴排布（黑键直按）
  const [keymap, setKeymapState] = useState<Keymap>(() =>
    window.localStorage.getItem("so-keymap-v1") === "piano" ? "piano" : "qwerty",
  );
  const keymapRef = useRef(keymap);
  keymapRef.current = keymap;
  // 黑键模式（qwerty 布局专属）：HUD「黑键」chip 或 Caps Lock 切换，等效常驻 Shift
  const [blackMode, setBlackModeState] = useState(() => window.localStorage.getItem("so-blackmode-v1") === "1");
  const blackRef = useRef(blackMode);
  blackRef.current = blackMode;
  const setKeymap = useCallback((m: Keymap) => {
    setKeymapState(m);
    try {
      window.localStorage.setItem("so-keymap-v1", m);
    } catch {
      /* 存不上就本次会话内生效 */
    }
    setAnnounce(m === "piano" ? "键位：钢琴布局（中排白键、上排 W E T Y U O P 直按黑键）" : "键位：横向布局（Shift 或黑键模式弹黑）");
  }, []);
  const setBlackMode = useCallback((on: boolean) => {
    setBlackModeState(on);
    try {
      window.localStorage.setItem("so-blackmode-v1", on ? "1" : "0");
    } catch {
      /* 存不上就本次会话内生效 */
    }
  }, []);
  // 键盘浮出时把右下角遥测表抬高一个键盘条的高度，不被盖住
  useEffect(() => {
    rendererRef.current?.setTelOffset(touchKeys ? 96 : 0);
  }, [touchKeys]);
  // 公共画廊（PocketBase works/scores）：打开即拉最新；昵称本地持久供发布与天梯署名
  const [galleryOpen, setGalleryOpen] = useState(false);
  // 乐团指挥（常驻 AI 角色）浮层：多轮对话，人设与玩法知识在角色母本里
  const [conductorOpen, setConductorOpen] = useState(false);
  const [galleryWorks, setGalleryWorks] = useState<WorkItem[]>([]);
  const [nick, setNickEdit] = useState(getNick());
  const [recActive, setRecActive] = useState(false);
  const [recClock, setRecClock] = useState("0:00");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [autoScore, setAutoScore] = useState(false);
  const [loopPlaying, setLoopPlaying] = useState(false);
  const [mode, setMode] = useState<"perform" | "compose" | "challenge">("perform");
  const [challengePhase, setChallengePhase] = useState<ChallengePhase>("select");
  const [challengeLevel, setChallengeLevel] = useState(0);
  const [challengeScore, setChallengeScore] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [countdownNum, setCountdownNum] = useState(3);
  const [chProgress, setChProgress] = useState<ChallengeProgress>(() => chProgressRef.current);
  const [chResult, setChResult] = useState<ChallengeSummary | null>(null);
  const [chMode, setChMode] = useState<"race" | "demo" | "practice" | "survival">("race"); // HUD 演示/练习/生存态标识
  // 生存模式 HUD/面板状态：生命 / 坚持整秒 / 速度百分比 / 双倍段亮 / 本地最佳秒数 / 生存榜 Top5（null=未拉取）
  const [survLives, setSurvLives] = useState(3);
  const [survSec, setSurvSec] = useState(0);
  const [survPct, setSurvPct] = useState(100);
  const [survDouble, setSurvDouble] = useState(false);
  const [survBest, setSurvBest] = useState(() => loadSurvivalBest());
  const [survBoard, setSurvBoard] = useState<ScoreItem[] | null>(null);
  // 每日挑战：今日最佳（隔天作废，开局时刷新）/ 每日榜 Top5（null=未拉取）/ 当局是否每日局
  const [dailyBest, setDailyBest] = useState(() => loadSurvivalDailyBest(survivalDailyKey()));
  const [dailyBoard, setDailyBoard] = useState<ScoreItem[] | null>(null);
  const [survivalDaily, setSurvivalDaily] = useState(false);
  const [practiceScale, setPracticeScale] = useState(1); // 练习控制条速度 chip
  const [practiceLoop, setPracticeLoop] = useState(false); // 练习「循环本小节」chip
  const [practiceHintBar, setPracticeHintBar] = useState(0); // 练顺提示条：第 N 小节已练顺（0 = 不显示）
  const [fingeringOn, setFingeringOn] = useState(true); // 练习「指法」开关 chip（开 = primary）
  const [practiceFinSeq, setPracticeFinSeq] = useState<{ L: FinChip[]; R: FinChip[] }>({ L: [], R: [] }); // 当前小节指法，左右手分行（s=手指数字、n=谱面音索引，点击 chip 可改指法）
  const [practiceFinActive, setPracticeFinActive] = useState<{ L: number; R: number }>({ L: -1, R: -1 }); // 指法行跟随高亮：各手中「下一个该弹」的 chip 下标（-1 = 该手已弹完/无音），随 judged 实时推进
  const chFinActiveRef = useRef<{ L: number; R: number }>({ L: -1, R: -1 }); // 上次上报的高亮下标，防每 tick setState
  const chBlkActiveRef = useRef<{ L: number; R: number }>({ L: -1, R: -1 }); // 上次推给渲染层的「下一个该弹」谱面索引，防每 tick 重设
  const [practiceClick, setPracticeClick] = useState(false); // 练习节拍器开关（默认关，本会话记住；仅练习态出声）
  const practiceClickRef = useRef(false);
  const chClickBeatRef = useRef(-1e9); // 上一次打点的拍序号；跳节/回卷/变速/重开置哨兵，避免跳变连击
  // 指法手动微调覆盖表：key = `<关卡下标>:<音索引>`，值为手动指定的手/指；无 key = 跟随启发式建议。
  // 持久 localStorage（与解锁进度同族、同命名空间），换设备/清缓存回落自动建议
  const chFinOvRef = useRef<Record<string, FingerMark>>(loadFinOverrides());
  // 自定义乐谱打歌：导入的文本谱编译成追加的"第 6 关"（不落本地进度、不上天梯，随时可换）
  const [customLevel, setCustomLevel] = useState<ChallengeLevel | null>(null);
  const customLevelRef = useRef<ChallengeLevel | null>(null);
  const [chartEditorOpen, setChartEditorOpen] = useState(false);
  // ---- UGC 自定义关卡：全站关卡库（热门榜）/ 发布预览 / 当局自定义关（HUD 曲名 + plays 回写） ----
  const [customLevels, setCustomLevels] = useState<LevelItem[] | null>(null); // null = 未拉取
  const [ugcPreview, setUgcPreview] = useState<
    | (ChartRating & { notes: ChartNote[]; title: string; dur: number })
    | null
  >(null);
  const [ugcBusy, setUgcBusy] = useState(false); // 发布请求在途（浮层按钮防连点）
  const [activeCustomLevel, setActiveCustomLevel] = useState<{
    title: string;
    stars: number;
  } | null>(null);
  // 拉全站关卡库并把新发布的置顶：热度 = plays 本地降序，刚发布的（plays=0）挤进首位可见
  const loadCustomLevels = useCallback(() => {
    void listLevels().then((list) => {
      const hot = [...list]
        .sort((a, z) => (z.plays ?? 0) - (a.plays ?? 0))
        .slice(0, 10);
      setCustomLevels(hot);
    });
  }, []);
  // 游玩回调（tick/跳转/指法等）取关的唯一入口：ref 保证 lookahead 循环里永远读到最新导入谱
  const chLevels = useCallback(
    () =>
      customLevelRef.current ? [...CHALLENGE_LEVELS, customLevelRef.current] : CHALLENGE_LEVELS,
    [],
  );
  // 把手动覆盖叠到启发式建议上（annotateFingering 后立即调，与音索引对齐）
  const chApplyFinOverrides = useCallback((marks: (FingerMark | null)[]) => {
    const pre = `${chLevelRef.current}:`;
    const ov = chFinOvRef.current;
    for (const k in ov) {
      if (!k.startsWith(pre)) continue;
      const i = Number(k.slice(pre.length));
      if (Number.isInteger(i) && i >= 0 && i < marks.length) marks[i] = ov[k];
    }
    return marks;
  }, []);
  const [practiceAutoNext, setPracticeAutoNext] = useState(false); // 练顺自动跳节开关（默认关=保持「提示条+按→」手动语义）
  const chAutoNextRef = useRef(false);
  const [practiceWait, setPracticeWait] = useState(false); // 等待模式开关：下一个音到判定线仍未命中 → 冻结时钟等你弹对才继续
  const chWaitRef = useRef(false);
  const chWaitHoldRef = useRef(false); // 当前正处于冻结等待中（相位保持 play，只挂起引擎钟）
  const [demoBar, setDemoBar] = useState(1); // 演示控制条：当前小节号（1 起）
  const [demoBars, setDemoBars] = useState(1); // 演示控制条：总小节数
  const [objectsVersion, setObjectsVersion] = useState(0);
  const [objectCount, setObjectCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [padOn, setPadOn] = useState(false); // 环境垫音默认关（新访客默认无垫音）
  const [sustainOn, setSustainOn] = useState(false);
  const [softOn, setSoftOn] = useState(false);
  const [composeHint, setComposeHint] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [guestCanvas, setGuestCanvas] = useState(false);
  const [capToast, setCapToast] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false); // 音频导出中（HUD「音频」按钮禁用并显示录音中）

  // ---- 循环录音台（Loop Station，演奏模式）：L 录一层 → 循环 → 循环中再 L 叠加，Shift+L 全清。
  // 复用引擎既有 loop 排程（scheduleSequence loop+loopEnd，单一主排程位）：循环台接管时顶掉空格乐句循环，反之亦然
  const [lsState, setLsState] = useState<"off" | "rec" | "play" | "dub">("off");
  const lsStateRef = useRef<"off" | "rec" | "play" | "dub">("off");
  const lsBufRef = useRef<ScoreEvent[]>([]); // 当前正在录的层（相对秒）
  const lsStartRef = useRef(0); // 本层录音起点（ctx 时间）
  const lsLayersRef = useRef<ScoreEvent[][]>([]); // 已叠层
  const lsPeriodRef = useRef(0); // 循环周期（秒），首层落定时按整数拍取 ≥2 小节
  const lsCancelRef = useRef<null | (() => void)>(null);
  // 链接回放时间轴会话终止：循环台/空格循环/本地重放等一切主排程位接管都拆掉时间轴
  const rtEndSession = useCallback(() => {
    rtCancelRef.current?.();
    rtCancelRef.current = null;
    rtPlayingRef.current = false;
    rtEventsRef.current = [];
    setReplayTimeline(null);
  }, []);
  const lsStop = useCallback(() => {
    lsCancelRef.current?.();
    lsCancelRef.current = null;
    lsStateRef.current = "off";
    setLsState("off");
    lsBufRef.current = [];
    lsLayersRef.current = [];
    lsPeriodRef.current = 0;
    setReplayActive(false); // 任何排程接管都熄灭回放指示
    rtEndSession(); // 同理熄灭链接回放时间轴
  }, [rtEndSession]);

  const recordEvent = useCallback((ev: Omit<ScoreEvent, "t">, atAbs?: number, skipLs = false) => {
    const engine = engineRef.current;
    if (!engine) return;
    const at = atAbs ?? engine.currentTime; // 宏发声排在未来时刻时传入绝对时间，录制保持滚奏相对关系
    const rec = recRef.current;
    if (rec.active) rec.events.push({ ...ev, t: at - rec.start });
    // 循环台采集通道：只收用户实时演奏（循环自身播出的事件不走这里，不会自叠加膨胀；
    // skipLs = 合奏 AI 音专用——只进录音带，不烤进 loop 层）
    const ls = lsStateRef.current;
    if (!skipLs && (ls === "rec" || ls === "dub") && engine.currentTime >= lsStartRef.current) {
      lsBufRef.current.push({ ...ev, t: at - lsStartRef.current });
    }
  }, []);

  // 动态音色档位：off = 关 / auto = 逐音按鼠标速度在 玻璃(柔)→拨弦→锯齿Lead(利) 实时切换 /
  // glass|pluck|lead = 锁定档位（HUD「动色」菜单直选，锁定档仍保留遥测档位小字与画线实时发声）
  type TimbreMode = "off" | "auto" | "glass" | "pluck" | "lead";
  const [timbreMode, setTimbreMode] = useState<TimbreMode>("off");
  const timbreRef = useRef<TimbreMode>("off");
  // 作曲画线实时预览的发声节流（笔位音 + 音色档变化才响，防连珠炮）
  const draftVoiceRef = useRef({ idx: -1, tier: "", at: 0 });
  const setTimbre = useCallback((m: TimbreMode) => {
    timbreRef.current = m;
    setTimbreMode(m);
    setAnnounce(
      m === "off"
        ? "动态音色已关闭"
        : m === "auto"
          ? "动态音色已开启：速度越快音色越亮"
          : `音色已锁定：${voiceById(m).name}`,
    );
  }, []);

  // 乐句宏：off → 琶音（根357叠三度四音向上扫）→ 音阶（六音跑动）→ off，A 键/HUD chip 循环
  const [macro, setMacro] = useState<"off" | "arp" | "scale">("off");
  const macroRef = useRef<"off" | "arp" | "scale">("off");
  const toggleMacro = useCallback(() => {
    const next = macroRef.current === "off" ? "arp" : macroRef.current === "arp" ? "scale" : "off";
    macroRef.current = next;
    setMacro(next);
    setAnnounce(next === "off" ? "乐句宏已关闭" : next === "arp" ? "乐句宏：琶音" : "乐句宏：音阶");
  }, []);

  // 钢琴延音踏板 Logic 单源：引擎 / 渲染层亮边 / HUD / aria-live 播报同步（幂等）
  const pressPedal = useCallback((on: boolean) => {
    if (sustainRef.current === on) return;
    sustainRef.current = on;
    setSustainOn(on);
    engineRef.current?.setSustainPedal(on);
    rendererRef.current?.setPedalGlow(on);
    setAnnounce(on ? "踏板踩下" : "踏板松开");
  }, []);

  const toggleSustain = useCallback(() => pressPedal(!sustainRef.current), [pressPedal]);

  // 钢琴弱音器 Logic 单源：引擎压暗 / 渲染层键盘变暗 / HUD / aria-live 播报同步（幂等，与延音踏板互相独立可叠加）
  const pressSoft = useCallback((on: boolean) => {
    if (softRef.current === on) return;
    softRef.current = on;
    setSoftOn(on);
    engineRef.current?.setSoftPedal(on);
    rendererRef.current?.setSoftPedalVisual(on);
    setAnnounce(on ? "弱音踩下" : "弱音松开");
  }, []);

  const toggleSoft = useCallback(() => pressSoft(!softRef.current), [pressSoft]);

  // 画布音高所见即所听：循环发声基准 = 画布音区基准，画在多高就响多高，
  // 与键盘参考、锚点单音、卷帘行名、MIDI 导出全部对齐。
  // （旧版整体低一个八度想让旋律浮在伴奏上方，但造成「线的高度和听到的音对不上、
  // 同高度锚点与循环线互差八度」的困惑，取消错位；如需恢复伴奏错开，改回 1 即可）
  const ACCOMP_OCTAVE_SHIFT = 0;

  const syncCanvasLoops = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const sc = scaleRef.current;
    const specs = buildLoopSpecs(
      objectsRef.current,
      bpmRef.current,
      bandRange(sc).lo - sc.semitones.length * ACCOMP_OCTAVE_SHIFT,
      bandDegs(sc),
    );
    engine.setCanvasLoops(specs);
    // 参数曲线：x（0..1 画布宽 = 12 拍）换算到秒的统一时间轴，y 取反（上=大）；
    // 时间轴长度 = max(各循环周期, 最远曲线终点, 2 拍)，覆盖段之外引擎保持中性值
    const beat = 60 / clamp(bpmRef.current, 40, 240);
    const autoCurves: AutoCurve[] = [];
    let maxT = 0;
    for (const o of objectsRef.current) {
      // 曲线对象须启用才生效（AI 静音字段 muted 的曲线不进自动化链）
      if (o.type !== "curve" || !o.curveParam || o.points.length < 2 || o.muted) continue;
      const pts = o.points
        .slice()
        .sort((a, b) => a.x - b.x)
        .map((p) => ({ t: Math.max(0, p.x) * FULL_WIDTH_BEATS * beat, v: clamp(1 - p.y, 0, 1) }));
      const c: AutoCurve = {
        param: o.curveParam,
        t0: pts[0].t,
        t1: pts[pts.length - 1].t,
        pts,
      };
      maxT = Math.max(maxT, c.t1);
      autoCurves.push(c);
    }
    const period = Math.max(2 * beat, maxT, ...specs.map((s) => s.period));
    engine.setCanvasAuto(period, autoCurves);
  }, []);

  // 已启用的曲线参数集合（供 HUD 角标）；任何改动走 commitCanvas 都重算，与存档/撤销/编辑全同步
  const [curveActive, setCurveActive] = useState<CurveParam[]>([]);
  const commitCanvas = useCallback(() => {
    setObjectsVersion((v) => v + 1);
    setObjectCount(objectsRef.current.length);
    saveCanvasObjects(objectsRef.current);
    syncCanvasLoops();
    const active: CurveParam[] = [];
    for (const o of objectsRef.current) {
      if (o.type === "curve" && o.curveParam && o.points.length >= 2 && !o.muted) active.push(o.curveParam);
    }
    setCurveActive(active);
  }, [syncCanvasLoops]);

  // 撤销/重做：作曲对象数组 JSON 快照栈（≤80 层）；同类连击（方向键 nudging）700ms 内合并。
  // 每层带该步动作描述（HUD「历史」面板列全部步骤 + 时间旅行跳转的同一数据源）
  const undoRef = useRef<HistStep[]>([]);
  const redoRef = useRef<HistStep[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [histVersion, setHistVersion] = useState(0); // 栈任何变化都 bump，驱动历史面板重算
  const [histOpen, setHistOpen] = useState(false);
  const lastHistRef = useRef({ kind: "", at: 0 });
  const preDragRef = useRef<string | null>(null); // 拖起点快照；拖动确实改变才在拖尾压栈
  const dragMovedRef = useRef(false);

  // 拖手柄改循环时长：松手后待选的音符处理方式（View 浮出小选择条）。
  // orig = 拉伸前的对象快照（rollFromObject 按原长取音符）；后续任何入栈动作都会作废它
  const [resizePick, setResizePick] = useState<{ id: string; orig: CanvasObject } | null>(null);
  const resizePickRef = useRef(resizePick);
  resizePickRef.current = resizePick;
  const resizeModeRef = useRef<ResizeMode | null>(loadResizeMode());

  const syncHist = useCallback(() => {
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
    setHistVersion((v) => v + 1);
  }, []);

  const pushHistory = useCallback(
    (kind = "op", label = "编辑画布") => {
      // 其他编辑动作发生时，作废尚未作答的「改循环长度」选择条
      setResizePick(null);
      const now = performance.now();
      if (kind !== "op" && lastHistRef.current.kind === kind && now - lastHistRef.current.at < 700) {
        // 同类连按合并 = 历史里仍是一条，只把描述更新为最近一次动作
        lastHistRef.current.at = now;
        const top = undoRef.current[undoRef.current.length - 1];
        if (top) top.label = label;
        setHistVersion((v) => v + 1);
        return;
      }
      lastHistRef.current = { kind, at: now };
      undoRef.current.push({ snap: JSON.stringify(objectsRef.current), label });
      if (undoRef.current.length > 80) undoRef.current.shift();
      redoRef.current = [];
      syncHist();
    },
    [syncHist],
  );

  const restoreSnapshot = useCallback(
    (json: string, verb: string) => {
      objectsRef.current = JSON.parse(json) as CanvasObject[];
      const id = selectedRef.current;
      if (id && !objectsRef.current.some((o) => o.id === id)) {
        selectedRef.current = null;
        setSelectedId(null);
      }
      setResizePick(null);
      commitCanvas();
      syncHist();
      setAnnounce(verb);
    },
    [commitCanvas, syncHist],
  );

  const undo = useCallback(() => {
    const step = undoRef.current.pop();
    if (step === undefined) return;
    redoRef.current.push({ snap: JSON.stringify(objectsRef.current), label: step.label });
    restoreSnapshot(step.snap, "已撤销");
  }, [restoreSnapshot]);

  const redo = useCallback(() => {
    const step = redoRef.current.pop();
    if (step === undefined) return;
    undoRef.current.push({ snap: JSON.stringify(objectsRef.current), label: step.label });
    restoreSnapshot(step.snap, "已重做");
  }, [restoreSnapshot]);

  // 「历史」面板时间旅行：target = 状态节点下标（0 = 未做任何改动，i = 第 i 步完成后）。
  // 只在撤销/重做两栈之间挪动（重做栈保留，向后跳仍可前进回未来状态），落位只 commit 一次
  const jumpHistory = useCallback(
    (target: number) => {
      const pos = undoRef.current.length;
      if (target === pos || target < 0) return;
      const stack = undoRef.current;
      const fwd = redoRef.current;
      let cur = JSON.stringify(objectsRef.current);
      if (target < pos) {
        for (let i = 0; i < pos - target; i += 1) {
          const step = stack.pop();
          if (step === undefined) break;
          fwd.push({ snap: cur, label: step.label });
          cur = step.snap;
        }
      } else {
        for (let i = 0; i < target - pos; i += 1) {
          const step = fwd.pop();
          if (step === undefined) break;
          stack.push({ snap: cur, label: step.label });
          cur = step.snap;
        }
      }
      restoreSnapshot(cur, target === 0 ? "已回到初始状态" : `已跳到第 ${target} 步`);
    },
    [restoreSnapshot],
  );

  // 「重复填充」落地：线的新循环时长内，把拉伸前（orig）按原长编译出的音符序列整段重复
  // 复制铺满，超出新时长截断——音符相对位置不变（区别于现行几何拉伸的等比缩放）。
  // 结果写进卷帘覆盖（obj.roll，与钢琴卷帘同源机制；后续几何改动会按既有规则自动清回曲线）
  const applyRepeatFill = useCallback(
    (cur: CanvasObject, orig: CanvasObject) => {
      const degs = bandDegs(scaleRef.current);
      const content = Math.max(0.25, orig.audio.loopBeats);
      const target = cur.audio.loopBeats;
      const base = rollFromObject(orig, degs);
      if (base.length === 0) return false;
      const notes: RollNote[] = [];
      for (let rep = 0; rep * content < target; rep += 1) {
        for (const n of base) {
          const beat = n.beat + rep * content;
          if (beat < target - 1e-6) notes.push({ beat, deg: n.deg, vel: n.vel });
        }
      }
      if (notes.length === 0) return false;
      cur.roll = notes;
      commitCanvas();
      return true;
    },
    [commitCanvas],
  );

  // 选择条作答：scale 什么都不用做（现行拉伸即等比缩放语义）；repeat 补写卷帘覆盖。
  // 撤销栈已在松手时压过拉伸前快照，所以「改动 + 所选方式」整体仍是一步撤销
  const chooseResizeMode = useCallback(
    (mode: ResizeMode, remember: boolean) => {
      const pick = resizePickRef.current;
      setResizePick(null);
      if (remember) {
        resizeModeRef.current = mode;
        try {
          window.localStorage.setItem(RESIZE_MODE_KEY, mode);
        } catch {
          // 持久失败不影响本会话生效
        }
      }
      if (!pick || mode !== "repeat") return;
      const cur = objectsRef.current.find((o) => o.id === pick.id);
      if (!cur || cur.type !== "stroke") return;
      if (applyRepeatFill(cur, pick.orig)) {
        setAnnounce("已按重复填充铺满新循环时长");
      }
    },
    [applyRepeatFill],
  );

  const cancelResizePick = useCallback(() => {
    const pick = resizePickRef.current;
    setResizePick(null);
    // 不作答 = 默认按比例（现行几何状态）
    if (pick) setAnnounce("循环时长已按比例缩放");
  }, []);

  // 空间效果 + 主音量（HUD「空间」面板）：混响/回声走引擎既有 FX 发送链（湿量封顶 0.5），
  // 音量映射 master 0.08..0.9；三值持久 localStorage，引擎启动时一次性同步
  type FxState = { vol: number; rev: number; dly: number };
  const FX_KEY = "so-fx-v1";
  const [fx, setFxState] = useState<FxState>(() => {
    try {
      const raw = window.localStorage.getItem(FX_KEY);
      if (raw) {
        const v = JSON.parse(raw) as Partial<FxState>;
        return {
          vol: typeof v.vol === "number" ? clamp(v.vol, 0, 1) : 0.45,
          rev: typeof v.rev === "number" ? clamp(v.rev, 0, 1) : 0,
          dly: typeof v.dly === "number" ? clamp(v.dly, 0, 1) : 0,
        };
      }
    } catch {
      // 解析失败用默认
    }
    return { vol: 0.45, rev: 0, dly: 0 };
  });

  // 曲线自动化画笔（HUD「曲线」菜单）：关 = 画笔迹；选参数后落笔画该参数的曲线。
  // 会话内选择，不持久（低语：曲风玩法随画布现场决定，刷新回到画笔迹）
  const [autoParam, setAutoParamState] = useState<"off" | CurveParam>("off");
  const autoParamRef = useRef<"off" | CurveParam>("off");
  const onSetCurveParam = useCallback((p: "off" | CurveParam) => {
    autoParamRef.current = p;
    setAutoParamState(p);
    setAnnounce(
      p === "off"
        ? "曲线画笔已关：回到画笔迹模式"
        : `曲线画笔：${CURVE_PARAM_META[p].name}——在画布上横着画一条线，上下高低就是它随时间的变化`,
    );
  }, []);

  // 参数曲线编辑窗：把「在画布上画曲线」收敛到一个独立小窗，四条轨道分别绘制，
  // 避免与笔画/锚点落笔混淆。底层仍走 type:"curve" 对象 + engine.setCanvasAuto 编译链。
  const [curvePanelOpen, setCurvePanelOpen] = useState(false);
  // 打开时抓取当前各参数曲线的快照（在事件回调里读 ref 合规），作为面板初始值，避免渲染期读 ref
  const [curveInitial, setCurveInitial] = useState<Record<CurveParam, CanvasPt[] | null> | null>(null);
  const getCurveByParam = useCallback((): Record<CurveParam, CanvasPt[] | null> => {
    const out: Record<CurveParam, CanvasPt[] | null> = { vol: null, cutoff: null, pan: null, reverb: null };
    for (const o of objectsRef.current) {
      if (o.type === "curve" && o.curveParam && o.points.length >= 2) {
        out[o.curveParam] = o.points.map((p) => ({ x: p.x, y: p.y, t: p.t }));
      }
    }
    return out;
  }, []);
  const onOpenCurvePanel = useCallback(() => {
    setCurveInitial(getCurveByParam());
    setCurvePanelOpen(true);
  }, [getCurveByParam]);
  const onCloseCurvePanel = useCallback(() => setCurvePanelOpen(false), []);
  const setCurveForParam = useCallback(
    (param: CurveParam, pts: CanvasPt[] | null) => {
      // 先移除本参数已有的曲线对象（每个参数只保留一条），再按需新增
      objectsRef.current = objectsRef.current.filter(
        (o) => !(o.type === "curve" && o.curveParam === param),
      );
      if (pts && pts.length >= 2) {
        if (objectsRef.current.length >= MAX_CANVAS_OBJECTS) {
          flashCap();
          return;
        }
        objectsRef.current.push(compileCurve(pts, param));
      }
      commitCanvas();
    },
    [commitCanvas],
  );
  // ---- 听感（「听感」面板）：音乐推子 + 挑战判定延迟校准 ----
  // 音乐推子串乘在 master 上（主音量仍归空间面板的 fx.vol）；语音音量在指挥朗读侧自取（so-voice-v1）
  const MUSIC_KEY = "so-music-v1";
  const [musicVol, setMusicVolState] = useState(() => {
    try {
      const raw = window.localStorage.getItem(MUSIC_KEY);
      const v = raw === null ? 1 : Number(raw);
      return Number.isFinite(v) ? clamp(v, 0, 1) : 1;
    } catch {
      return 1;
    }
  });
  const musicRef = useRef(musicVol);
  const setMusicVol = useCallback((v: number) => {
    musicRef.current = clamp(v, 0, 1);
    setMusicVolState(musicRef.current);
    try {
      window.localStorage.setItem(MUSIC_KEY, String(musicRef.current));
    } catch {
      /* 忽略 */
    }
    engineRef.current?.setMusicVolume(musicRef.current);
  }, []);

  // 判定延迟校准：声音到耳朵比音频时钟慢（声卡输出延迟 + 听反应），实测中位差写 here。
  // 判定侧从 st 里扣掉这份偏移——「听到哒的瞬间按键」即算压线，跨设备同一套窗口。
  const CALIB_KEY = "so-calib-v1";
  const [calibMs, setCalibMsState] = useState(() => {
    try {
      const n = Number(window.localStorage.getItem(CALIB_KEY));
      return Number.isFinite(n) ? Math.min(200, Math.max(-100, n)) : 0;
    } catch {
      return 0;
    }
  });
  const calibMsRef = useRef(calibMs);
  const applyCalib = useCallback((ms: number) => {
    const v = Math.round(Math.min(200, Math.max(-100, ms)));
    calibMsRef.current = v;
    setCalibMsState(v);
    try {
      window.localStorage.setItem(CALIB_KEY, String(v));
    } catch {
      /* 忽略 */
    }
  }, []);

  // 校准向导：连续 8 拍节拍器「哒」（间隔 600ms），用户在听到的瞬间空格/按钮；
  // 每次敲击对最近一拍记偏差，取中位数 → 校准值（中位数抗个别早/晚按的噪声）
  const [calibRunning, setCalibRunning] = useState(false);
  const [calibTaps, setCalibTaps] = useState<number[]>([]);
  const calibClicksRef = useRef<number[]>([]);
  const calibTapsRef = useRef<number[]>([]);
  const calibTimerRef = useRef(0);
  const finishCalib = useCallback(() => {
    window.clearTimeout(calibTimerRef.current);
    setCalibRunning(false);
    const t = calibTapsRef.current;
    if (t.length >= 3) {
      const s = [...t].sort((a, z) => a - z);
      applyCalib(s[Math.floor(s.length / 2)]);
    }
  }, [applyCalib]);
  const startCalib = useCallback(() => {
    const e = engineRef.current;
    if (!e || allMutedRef.current) return; // 全局静音中哒哒听不见，面板侧也把按钮禁掉
    e.ensure();
    const t0 = e.currentTime + 1.1;
    calibClicksRef.current = Array.from({ length: 8 }, (_, i) => t0 + i * 0.6);
    calibClicksRef.current.forEach((t, i) => e.playClick(i % 4 === 0, t));
    calibTapsRef.current = [];
    setCalibTaps([]);
    setCalibRunning(true);
    window.clearTimeout(calibTimerRef.current);
    calibTimerRef.current = window.setTimeout(finishCalib, 8 * 600 + 1800);
  }, [finishCalib]);
  const calibTap = useCallback(() => {
    const e = engineRef.current;
    if (!e || calibTapsRef.current.length >= calibClicksRef.current.length) return;
    const now = e.currentTime;
    const clicks = calibClicksRef.current;
    // 只匹配「还没配走」的拍里最近的一拍：早按晚按都如实记下，中位数自会过滤
    let bi = clicks.length - 1;
    let bd = Infinity;
    for (let i = calibTapsRef.current.length; i < clicks.length; i += 1) {
      const d = Math.abs(now - clicks[i]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    calibTapsRef.current.push((now - clicks[bi]) * 1000);
    setCalibTaps([...calibTapsRef.current]);
    if (calibTapsRef.current.length >= clicks.length) finishCalib();
  }, [finishCalib]);
  const abortCalib = useCallback(() => {
    window.clearTimeout(calibTimerRef.current);
    setCalibRunning(false);
  }, []);
  // 校准进行中：空格/J/F 都算一次敲击（捕获阶段截住，别顺手触发循环播放等站内快捷键）
  useEffect(() => {
    if (!calibRunning) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code === "Space" || ev.key === "j" || ev.key === "J" || ev.key === "f" || ev.key === "F") {
        ev.preventDefault();
        ev.stopPropagation();
        calibTap();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [calibRunning, calibTap]);
  const engineLatencyMs = engineRef.current ? engineRef.current.outputLatencyMs() : 0;

  // ---- 性能模式：自动（实测 <30fps 持续 3 秒自动降级、回到 55fps 以上自动恢复）/ 完整 / 省电 ----
  const PERF_KEY = "so-perf-mode-v1";
  const [perfMode, setPerfModeState] = useState<"auto" | "full" | "perf">(() => {
    try {
      const v = window.localStorage.getItem(PERF_KEY);
      if (v === "auto" || v === "full" || v === "perf") return v;
    } catch {
      // 读不到按默认「自动」
    }
    return "auto";
  });
  const perfModeRef = useRef(perfMode);
  const [perfAuto, setPerfAutoState] = useState(false);
  const perfAutoRef = useRef(false);
  const setPerfAuto = useCallback((b: boolean) => {
    if (perfAutoRef.current === b) return;
    perfAutoRef.current = b;
    setPerfAutoState(b);
  }, []);
  const [fpsNow, setFpsNow] = useState(60);
  const lowStreakRef = useRef(0);
  const highStreakRef = useRef(0);
  const setPerfMode = useCallback(
    (m: "auto" | "full" | "perf") => {
      perfModeRef.current = m;
      setPerfModeState(m);
      if (m !== "auto") setPerfAuto(false);
      try {
        window.localStorage.setItem(PERF_KEY, m);
      } catch {
        // 持久失败不影响本会话生效
      }
    },
    [setPerfAuto],
  );
  const perfActive = perfMode === "perf" || (perfMode === "auto" && perfAuto);
  useEffect(() => {
    rendererRef.current?.setPerfMode(perfActive);
  }, [perfActive]);

  // ---- 无障碍：色盲友好配色 + 纯视觉节奏模式 + 画布轨迹文字描述 ----
  const CB_KEY = "so-cb-palette-v1";
  const VIS_KEY = "so-visual-only-v1";
  const [cbMode, setCbModeState] = useState(() => {
    try {
      return window.localStorage.getItem(CB_KEY) === "1";
    } catch {
      return false;
    }
  });
  const cbModeRef = useRef(cbMode);
  const [visualOnly, setVisualOnlyState] = useState(() => {
    try {
      return window.localStorage.getItem(VIS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const visualOnlyRef = useRef(visualOnly);
  const setCbMode = useCallback((b: boolean) => {
    cbModeRef.current = b;
    setCbModeState(b);
    try {
      window.localStorage.setItem(CB_KEY, b ? "1" : "0");
    } catch {
      // 持久失败不影响本会话生效
    }
    rendererRef.current?.setCbMode(b);
  }, []);
  const setVisualOnly = useCallback((b: boolean) => {
    visualOnlyRef.current = b;
    setVisualOnlyState(b);
    try {
      window.localStorage.setItem(VIS_KEY, b ? "1" : "0");
    } catch {
      // 持久失败不影响本会话生效
    }
    rendererRef.current?.setVisualMode(b);
    setAnnounce(
      b
        ? "纯视觉节奏模式已开启：挑战击符声与练习节拍器静音，判定线与判定文字增强"
        : "纯视觉节奏模式已关闭，恢复常听演奏",
    );
  }, []);

  // 轨迹文字描述：把画布上的线/锚点翻译成逐条中文，复制进剪贴板（剪贴板被拦则存成 txt）
  const exportCanvasText = useCallback(() => {
    const objs = objectsRef.current;
    if (objs.length === 0) {
      setAnnounce("画布还是空的——先画两条线，才有描述可导出");
      return;
    }
    const text = describeCanvasText(objs, scaleRef.current, bpmRef.current);
    const saveTxt = () => {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "轨迹文字描述.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setAnnounce("剪贴板不可用——文字描述已存成 txt 文件");
    };
    if (!navigator.clipboard?.writeText) {
      saveTxt();
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => setAnnounce("画布轨迹的文字描述已复制到剪贴板"))
      .catch(saveTxt);
  }, []);

  // ---- AI 合奏伙伴（Jam Session）：本地规则引擎，你弹一句它回一句（仅演奏模式接旋律）----
  const JAM_KEY = "so-jam-v1";
  const [jamOn, setJamOnState] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(JAM_KEY) || "{}").on === true;
    } catch {
      return false;
    }
  });
  const jamOnRef = useRef(jamOn);
  const [jamPersona, setJamPersonaState] = useState<JamPersona>(() => {
    try {
      const p = JSON.parse(window.localStorage.getItem(JAM_KEY) || "{}").persona;
      if (p === "mirror" || p === "contrast" || p === "drive" || p === "canon") return p;
    } catch {
      // 坏值按默认「模仿型」
    }
    return "mirror";
  });
  const jamPersonaRef = useRef(jamPersona);
  const [jamHarmony, setJamHarmonyState] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(JAM_KEY) || "{}").harmony === true;
    } catch {
      return false;
    }
  });
  const jamHarmonyRef = useRef(jamHarmony);
  // 卡农型轮唱层数 1-4（默认 2：跟读 + 错两拍的第二层）
  const [jamVoices, setJamVoicesState] = useState(() => {
    try {
      const v = Number(JSON.parse(window.localStorage.getItem(JAM_KEY) || "{}").canonVoices);
      if (v >= 1 && v <= 4) return Math.round(v);
    } catch {
      // 坏值用默认
    }
    return 2;
  });
  const jamVoicesRef = useRef(jamVoices);
  // 卡农型轮唱相邻层错开进入的拍数（1 紧接 / 2 标准 / 4 宽松），默认 2
  const [jamGap, setJamGapState] = useState(() => {
    try {
      const g = Number(JSON.parse(window.localStorage.getItem(JAM_KEY) || "{}").canonGapBeats);
      if (g === 1 || g === 2 || g === 4) return g;
    } catch {
      // 坏值用默认
    }
    return 2;
  });
  const jamGapRef = useRef(jamGap);
  const [jamSpeaking, setJamSpeaking] = useState(false);
  const jamEngineRef = useRef<JamEngine | null>(null);
  const jamPendingRef = useRef<{ when: number; midi: number; vel: number; h?: number }[]>([]);
  const saveJam = useCallback(() => {
    try {
      window.localStorage.setItem(
        JAM_KEY,
        JSON.stringify({
          on: jamOnRef.current,
          persona: jamPersonaRef.current,
          harmony: jamHarmonyRef.current,
          canonVoices: jamVoicesRef.current,
          canonGapBeats: jamGapRef.current,
        }),
      );
    } catch {
      // 持久失败不影响本会话生效
    }
  }, []);
  const toggleJamHarmony = useCallback(() => {
    const next = !jamHarmonyRef.current;
    jamHarmonyRef.current = next;
    setJamHarmonyState(next);
    setAnnounce(next ? "合奏和声已开：它每个音都带一个轻的三度和声" : "合奏和声已关，回到单旋律回应");
    saveJam();
  }, [saveJam]);
  const setJamVoices = useCallback(
    (n: number) => {
      const v = clamp(Math.round(n), 1, 4);
      jamVoicesRef.current = v;
      setJamVoicesState(v);
      setAnnounce(
        v === 1
          ? "轮唱单层：它只跟读一遍"
          : `轮唱 ${v} 层：回声错开 ${jamGapRef.current} 拍依次进入，共 ${v} 个回声声部`,
      );
      saveJam();
    },
    [saveJam],
  );
  const setJamGap = useCallback(
    (g: number) => {
      const v = g === 1 || g === 4 ? g : 2;
      jamGapRef.current = v;
      setJamGapState(v);
      setAnnounce(`轮唱声部错开 ${v} 拍进入`);
      saveJam();
    },
    [saveJam],
  );
  const toggleJam = useCallback(() => {
    const next = !jamOnRef.current;
    jamOnRef.current = next;
    setJamOnState(next);
    if (!next) {
      jamEngineRef.current?.clear();
      jamPendingRef.current = [];
      setJamSpeaking(false);
      setAnnounce("合奏伙伴已离场");
    } else {
      setAnnounce(`合奏伙伴已就位（${jamPersonaRef.current === "mirror" ? "模仿型" : jamPersonaRef.current === "contrast" ? "对比型" : jamPersonaRef.current === "drive" ? "推进型" : "卡农型"}）——弹一句试试，停一拍它会接话`);
    }
    saveJam();
  }, [saveJam]);
  const setJamPersona = useCallback(
    (p: JamPersona) => {
      jamPersonaRef.current = p;
      setJamPersonaState(p);
      jamEngineRef.current?.clear();
      jamPendingRef.current = [];
      setJamSpeaking(false);
      setAnnounce(
        p === "mirror"
          ? "合奏人格：模仿型——学你的旋律轮廓，换个节奏型回给你"
          : p === "contrast"
            ? "合奏人格：对比型——反着来：你低它高、你密它疏、你响它轻"
            : p === "drive"
              ? "合奏人格：推进型——越接越热，力度密度逐级抬升；你慢下来它也降温"
              : "合奏人格：卡农型——你弹的这句它照原样按原节奏跟读；句子不超过六拍时，它还会自己错开两拍叠进第二层，转成轮唱",
      );
      saveJam();
    },
    [saveJam],
  );
  // 监听演奏发声（鼠标/打字钢琴/触屏键盘共用入口）：喂引擎 + 玩家抢话时 AI 立刻让路
  const jamObserve = useCallback((midi: number, vel: number) => {
    if (!jamOnRef.current || modeRef.current !== "perform") return;
    const engine = engineRef.current;
    if (!engine) return;
    if (!jamEngineRef.current) jamEngineRef.current = new JamEngine();
    jamEngineRef.current.observe(midi, vel, engine.currentTime);
    if (jamPendingRef.current.length > 0) {
      jamPendingRef.current = []; // 你压过话头，AI 不硬接——排好的音当场咽回
      setJamSpeaking(false);
    }
  }, []);
  // 轮话调度：60ms 一拍检查——该接话就排句子（playPiano 绝对时刻排程），排好的到点发声
  useEffect(() => {
    if (!jamOn) return;
    const timer = window.setInterval(() => {
      const engine = engineRef.current;
      const renderer = rendererRef.current;
      if (!engine || !jamEngineRef.current) return;
      const now = engine.currentTime;
      if (modeRef.current !== "perform") {
        if (jamPendingRef.current.length > 0) {
          jamPendingRef.current = [];
          setJamSpeaking(false);
        }
        return;
      }
      const pending = jamPendingRef.current;
      if (pending.length > 0) {
        const keep: typeof pending = [];
        for (const n of pending) {
          if (n.when <= now + 0.12) {
            engine.playPiano(n.midi - PIANO_C3_MIDI, n.vel, Math.max(n.when, now + 0.01));
            const pos = pianoPosOfMidi(n.midi);
            // 和声只出声不抢戏：蓝色 ♪ 视觉标记只给旋律线（和声一并入录音带，回放是完整的）
            if (!n.h) {
              if (pos) renderer?.pressPianoKey(pos.key, pos.black, n.vel);
              renderer?.jamPulse(n.midi, n.vel); // 它的音符：蓝色 ♪ 上浮，与你的区分开
            }
            // 你录音时它的接话一并入带（按排程的绝对时刻收，回放节奏准确）；循环台不收 AI，避免烤进 loop 层
            if (recRef.current.active && pos) {
              recordEvent({ k: "p", ki: pos.key, b: pos.black ? 1 : 0, v: Math.round(n.vel * 15), s: 0, soft: 0 }, n.when, true);
            }
          } else {
            keep.push(n);
          }
        }
        jamPendingRef.current = keep;
        if (keep.length === 0) setJamSpeaking(false);
        return;
      }
      const jam = jamEngineRef.current;
      const gapMs = jam.suggestGapMs();
      if (!jam.ready(now, gapMs)) return;
      const beatSec = 60 / clamp(bpmRef.current, 40, 240);
      const phrase = jam.respond(scaleRef.current, jamPersonaRef.current, beatSec * 1000, jamHarmonyRef.current, jamVoicesRef.current, jamGapRef.current);
      if (phrase.length === 0) return;
      // 乐句起点贴到下一整拍：AI 的起音正好踩在拍子上
      const lead = Math.ceil((now + 0.15) / beatSec) * beatSec;
      jamPendingRef.current = phrase.map((n) => ({ when: lead + n.dtMs / 1000, midi: n.midi, vel: n.vel, h: n.h }));
      setJamSpeaking(true);
      setAnnounce(`合奏接话：${phrase.length} 音回应`);
    }, 60);
    return () => {
      window.clearInterval(timer);
      jamPendingRef.current = [];
      setJamSpeaking(false);
    };
  }, [jamOn]);

  const fxRef = useRef(fx);
  const syncFx = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    const f = fxRef.current;
    e.setMasterVolume(f.vol);
    e.setMusicVolume(musicRef.current);
    e.setFx("reverb", f.rev);
    e.setFx("delay", f.dly);
  }, []);
  const setFxValue = useCallback(
    (k: keyof FxState, v: number) => {
      const next = { ...fxRef.current, [k]: clamp(v, 0, 1) };
      fxRef.current = next;
      setFxState(next);
      try {
        window.localStorage.setItem(FX_KEY, JSON.stringify(next));
      } catch {
        // 持久失败不影响本会话生效
      }
      syncFx();
    },
    [syncFx],
  );

  // 触屏键盘点按：与键盘打字弹同一映射（白键/右邻黑键），发声+背景琴键点亮+入录音缓冲
  const touchPlayKey = useCallback(
    (keyIdx: number, black: boolean) => {
      const engine = engineRef.current;
      const pk = PIANO_KEYS[keyIdx];
      if (!engine || !pk) return;
      const useBlack = black && pk.blackMidi !== null;
      const midi = useBlack ? pk.blackMidi ?? pk.midi : pk.midi;
      const vel = clamp((useBlack ? 0.7 : 0.85) + (Math.random() - 0.5) * 0.2, 0.2, 1);
      engine.playPiano(midi - PIANO_C3_MIDI, vel);
      jamObserve(midi, vel);
      recordEvent({
        k: "p",
        ki: keyIdx,
        b: useBlack ? 1 : 0,
        v: Math.round(vel * 15),
        s: sustainRef.current ? 1 : 0,
        soft: softRef.current ? 1 : 0,
      });
      rendererRef.current?.pressPianoKey(keyIdx, useBlack, vel);
    },
    [recordEvent],
  );

  // 天梯榜静默提交（结算后 fire-and-forget；同会话每关只交一次，失败不打扰）
  const chScoreSentRef = useRef<Set<number>>(new Set());
  // dur 传入 = 生存/每日局：每局都是独立成绩，不走「同会话同关只交一次」的去重闸门；
  // 每日局（level=200）额外带 day 日期键 + hits 命中数，与普通生存 level=100 互不干扰
  const chSubmitScore = useCallback(
    (level: number, grade: string, acc: number, combo: number, dur?: number, day?: string, hits?: number) => {
      if (dur === undefined) {
        if (chScoreSentRef.current.has(level)) return;
        chScoreSentRef.current.add(level);
      }
      void submitScore({
        level,
        nick: displayNick(),
        grade,
        acc: Math.round(acc * 1000) / 1000,
        combo,
        dur,
        day,
        hits,
      });
    },
    [],
  );

  // 命名存档位（localStorage，≤12 个）：HUD「存档」面板 存/载入/覆写/删；载入前压撤销栈可反悔
  const [slotMetas, setSlotMetas] = useState<SlotMeta[]>(() => listSlots());

  const saveSlot = useCallback((name: string) => {
    const n = name.trim() || `存档 ${listSlots().length + 1}`;
    if (writeSlot(n, objectsRef.current)) {
      setSlotMetas(listSlots());
      setAnnounce(`已保存到存档「${n}」`);
      return true;
    }
    setAnnounce(`存档位已满（最多 ${MAX_SLOTS} 个），先删一个再存`);
    return false;
  }, []);

  const loadSlot = useCallback(
    (name: string) => {
      if (relayLedgerRef.current) {
        setAnnounce("接龙态不能整盘载入存档——会把各棒归属打乱；先传棒，再开新一局随便用");
        return;
      }
      const objs = readSlot(name);
      if (!objs) return;
      pushHistory("slot", `载入存档「${name}」`);
      objectsRef.current = objs;
      selectedRef.current = null;
      setSelectedId(null);
      commitCanvas();
      setAnnounce(`已载入存档「${name}」`);
    },
    [pushHistory, commitCanvas],
  );

  const removeSlot = useCallback((name: string) => {
    deleteSlot(name);
    setSlotMetas(listSlots());
    setAnnounce(`已删除存档「${name}」`);
  }, []);

  // 跨存档复制：存档面板里挑对象（线/锚点，默认全选=整档）粘贴为「新对象」追加进当前画布。
  // 位置整体右移并按序错开避免重叠（纯水平平移：音高曲线/卷帘拍位/循环时长均不受影响、免重编译）；
  // 原存档只读不动；pushHistory 后批量追加 = 整体一步撤销
  const [copyPick, setCopyPick] = useState<{ name: string; objs: CanvasObject[] } | null>(null);

  const startCopySlot = useCallback((name: string) => {
    const objs = readSlot(name);
    if (!objs) {
      setAnnounce(`读不到存档「${name}」`);
      return;
    }
    if (objs.length === 0) {
      setAnnounce(`存档「${name}」是空的`);
      return;
    }
    setCopyPick({ name, objs });
  }, []);

  const confirmCopySlot = useCallback(
    (ids: string[]) => {
      if (!copyPick) return;
      const sel = copyPick.objs.filter((o) => ids.includes(o.id));
      if (sel.length === 0) {
        setAnnounce("先勾选要复制的对象");
        return;
      }
      const room = MAX_CANVAS_OBJECTS - objectsRef.current.length;
      if (room <= 0) {
        setAnnounce(`画布已满（最多 ${MAX_CANVAS_OBJECTS} 个对象），先删几个再复制`);
        return;
      }
      const take = sel.slice(0, room);
      pushHistory("op", `从存档「${copyPick.name}」复制 ${take.length} 个对象`);
      take.forEach((o, i) => {
        const clone = JSON.parse(JSON.stringify(o)) as CanvasObject;
        clone.id = newCanvasId();
        clone.createdAt = Date.now();
        const dx = 0.04 + (i % 3) * 0.02;
        for (const p of clone.points) p.x = clamp(p.x + dx, -0.05, 1.05);
        objectsRef.current.push(clone);
      });
      commitCanvas();
      setAnnounce(
        `已把「${copyPick.name}」的 ${take.length} 个对象复制进当前画布${
          take.length < sel.length ? `，画布放满，其余 ${sel.length - take.length} 个没挤进来` : ""
        }`,
      );
      setCopyPick(null);
    },
    [copyPick, pushHistory, commitCanvas],
  );

  // 导出 MIDI：与播放器同源的 LoopSpec（含人性化抖动），窗口 = 最长循环 × N 遍，
  // 手动速度（HUD「BPM」面板）：改写 bpmRef 并重排画布循环（MIDI 导出/宏/演奏同源即时生效）
  const setBpmValue = useCallback(
    (v: number) => {
      const n = clamp(Math.round(v), 40, 240);
      if (n === bpmRef.current) return;
      bpmRef.current = n;
      setBpm(n);
      syncCanvasLoops();
    },
    [syncCanvasLoops],
  );

  // 各对象按自身周期反复铺满；锚点按起点 1/4 拍量化落在第 1 遍窗口内
  const exportMidi = useCallback(
    (repeats: number) => {
      const degs = bandDegs(scaleRef.current);
      const bpm = clamp(bpmRef.current, 40, 240);
      const objs = objectsRef.current;
      // MIDI 只装会发声的轨：笔迹 + 锚点；参数曲线不参与（导出的 .mid 没有自动化通道）；
      // AI 静音（muted）的轨跳过（鼓律动线的事件在 buildMidiFile 里按 d 标志逐音跳过）
      const strokes = objs.filter((o) => o.type === "stroke" && o.audio.loopBeats > 0 && !o.muted);
      const anchors = objs.filter((o) => o.type === "anchor" && o.points.length > 0 && !o.muted);
      if (strokes.length === 0 && anchors.length === 0) {
        setAnnounce("画布是空的，先画几条线再导出");
        return;
      }
      const beat = 60 / bpm;
      const anchorNotes: AnchorNote[] = anchors.map((o) => {
        const x0 = o.points[0].x;
        return {
          t: Math.round((x0 * 4 * beat) / (beat / 4)) * (beat / 4),
          idx: bandRange(scaleRef.current).lo + (o.audio.pitchCurve[0] ?? 0),
          v: o.audio.velocityCurve[0] ?? 0.6,
        };
      });
      const bytes = buildMidiFile({
        specs: buildLoopSpecs(
          objs,
          bpm,
          bandRange(scaleRef.current).lo - scaleRef.current.semitones.length * ACCOMP_OCTAVE_SHIFT,
          degs,
        ),
        anchors: anchorNotes,
        scale: scaleRef.current,
        bpm,
        repeats,
      });
      downloadMidi(bytes, `scroll-orchestra-x${repeats}.mid`);
      setAnnounce(`已导出 MIDI：${strokes.length} 条循环 × ${repeats} 遍，${anchors.length} 个锚点`);
    },
    [],
  );

  // 音频导出：从主总线实时录下「听见的一切」（循环 + 鼓 + 钢琴 + 垫音 + 动色），
  // 转成通用 WAV 下载；时长 = 最长循环 × N 遍（空画布则按 8 秒现场窗录，随手弹什么都录得到）
  const audioBusyRef = useRef(false);
  const exportAudio = useCallback((repeats: number) => {
    const engine = engineRef.current;
    if (!engine) {
      setAnnounce("先点醒舞台发出声音，再导音频");
      return;
    }
    if (audioBusyRef.current) {
      setAnnounce("音频正在导出中，稍等一下");
      return;
    }
    const bpm = clamp(bpmRef.current, 40, 240);
    const beat = 60 / bpm;
    // 时长只看发声对象（笔迹）；参数曲线的 loopBeats 只是占位，不参与撑时长
    const beats = objectsRef.current.reduce(
      (m, o) => Math.max(m, o.type === "stroke" ? o.audio.loopBeats || 0 : 0),
      0,
    );
    const seconds = clamp(Math.round((beats > 0 ? beats * beat : 8) * repeats), 2, 90);
    const stream = engine.recordTap();
    if (!stream) {
      setAnnounce("这台设备的浏览器不支持音频导出");
      return;
    }
    audioBusyRef.current = true;
    setAudioBusy(true);
    setAnnounce(`正在录制演奏 · ${seconds} 秒，录完自动存成音频文件`);
    void recordStreamToWavFile(stream, seconds, `scroll-orchestra-x${repeats}.wav`, (phase) => {
      if (phase === "encoding") setAnnounce("录好了，正在转成通用音频格式…");
    })
      .then((res) => {
        if (res.ok) setAnnounce("音频已保存到你的下载 · .wav 任何播放器都能开");
        else setAnnounce(res.reason ?? "音频导出失败，再试一次");
      })
      .finally(() => {
        audioBusyRef.current = false;
        setAudioBusy(false);
      });
  }, []);

  // 封面分享图：画布作品渲染成 16:9 PNG 卡（配 .wav 一起发），配色取自当前设计 token
  const exportCover = useCallback(() => {
    const objs = objectsRef.current;
    if (objs.length === 0) {
      setAnnounce("画布还是空的——先画两条线，封面才有画");
      return;
    }
    const strokes = objs.filter((o) => o.type === "stroke").length;
    const anchors = objs.filter((o) => o.type === "anchor").length;
    const curves = objs.filter((o) => o.type === "curve").length;
    const today = new Date().toLocaleDateString("zh-CN");
    const info = `音阶 ${scaleById(scaleRef.current.id).name} · 音色 ${voiceById(voiceRef.current).name} · BPM ${bpmRef.current} · ${strokes} 线 ${anchors} 锚${curves > 0 ? ` ${curves} 曲线` : ""} · ${today}`;
    void renderShareCard(objs, { title: `${nick} 的作品`, info })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "scroll-orchestra-cover.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
        setAnnounce("封面图已保存 · 配着导出的 .wav 一起发正合适");
      })
      .catch(() => setAnnounce("封面图生成失败，再试一次"));
  }, [nick]);

  // ---- 分轨混音台：每条线/锚点独立音量、声像、静音、独奏（solo 生效时其余轨静音）----
  const [mixOpen, setMixOpen] = useState(false);
  const [mixState, setMixState] = useState<Record<string, TrackMix>>(() => loadMix());
  const mixRef = useRef(mixState);
  mixRef.current = mixState;
  // 离开作曲模式就把混音台收起来（回来时不残留弹出）
  useEffect(() => {
    if (mode !== "compose") setMixOpen(false);
  }, [mode]);
  // 混音改动 → 折算生效值（mute / 任一独奏）实时推给引擎，下一声起立即生效
  useEffect(() => {
    try {
      window.localStorage.setItem(MIX_KEY, JSON.stringify(mixState));
    } catch {
      /* 存不上就本次会话内生效 */
    }
    const anySolo = Object.values(mixState).some((m) => m.solo);
    // 逐对象折算：分轨混音 × AI 音量乘子（aiGain），任一静音来源（轨道 mute / per-object muted /
    // 被独奏挡住）都归零；曲线不出声不推（setObjectMix 清掉遗留记录）
    for (const o of objectsRef.current) {
      if (o.type === "curve") {
        engineRef.current?.setObjectMix(o.id, null);
        continue;
      }
      const m = mixState[o.id];
      let gain = m ? m.gain : 1;
      if (m?.muted || o.muted || (anySolo && !m?.solo)) gain = 0;
      else gain = Math.round(gain * (o.aiGain ?? 1) * 100) / 100;
      engineRef.current?.setObjectMix(o.id, { gain, pan: m?.pan ?? 0 });
    }
  }, [mixState, objectsVersion]);
  const setObjMix = useCallback((id: string, patch: Partial<TrackMix>) => {
    setMixState((s) => ({ ...s, [id]: { ...(s[id] ?? DEFAULT_MIX), ...patch } }));
  }, []);
  const resetMix = useCallback(() => {
    setMixState({});
    setAnnounce("混音台已复位：所有轨回到满音量");
  }, []);
  // 混音预设：按当前画布对象一键配比（静音/独奏一并清掉，改完可逐轨再微调）
  const applyMixPreset = useCallback((preset: "anchorLead" | "strokeLead" | "panSwirl") => {
    const objs = objectsRef.current;
    if (!objs.some((o) => o.type !== "curve")) {
      setAnnounce("画布还是空的——先画几条线或落几个锚点，再试预设");
      return;
    }
    const next: Record<string, TrackMix> = {};
    // 参数曲线不占混音轨（它不出声、只改参数），预设只配比发声对象
    objs.forEach((o, i) => {
      if (o.type === "curve") return;
      if (preset === "anchorLead") next[o.id] = { ...DEFAULT_MIX, gain: o.type === "anchor" ? 1 : 0.55 };
      else if (preset === "strokeLead") next[o.id] = { ...DEFAULT_MIX, gain: o.type === "anchor" ? 0.55 : 1 };
      else next[o.id] = { ...DEFAULT_MIX, pan: i % 2 === 0 ? -0.6 : 0.6 };
    });
    setMixState(next);
    setAnnounce(
      preset === "anchorLead"
        ? "混音预设：锚点突出，旋律线降到 55%"
        : preset === "strokeLead"
          ? "混音预设：旋律线突出，锚点降到 55%"
          : "混音预设：左右环绕，相邻轨交替 L60 / R60",
    );
  }, []);
  // 面板行：与画布对象同序同数（线 N / 锚 N），未调过的轨给默认值
  const mixItems = useMemo(() => {
    let strokeNo = 0;
    let anchorNo = 0;
    return objectsRef.current
      .filter((o) => o.type !== "curve") // 参数曲线不出声，不占混音轨
      .map((o) => {
        const isAnchor = o.type === "anchor";
        const m = mixState[o.id];
        if (isAnchor) anchorNo += 1;
        else strokeNo += 1;
        return {
          id: o.id,
          label: isAnchor ? `锚 ${anchorNo}` : `线 ${strokeNo}`,
          gain: m?.gain ?? DEFAULT_MIX.gain,
          pan: m?.pan ?? DEFAULT_MIX.pan,
          muted: m?.muted ?? DEFAULT_MIX.muted,
          solo: m?.solo ?? DEFAULT_MIX.solo,
        };
      });
  }, [mixState, objectsVersion]);

  // ---- 只读分享：?ro=1 打开的画布禁一切编辑（画线/拖动/锚点/删除/清空/卷帘…），演奏照常；
  // 顶栏「复制继续创作」解锁成自己的作品。分享侧勾选「只读」后链接自动带 ro=1 ----
  const [roMode, setRoMode] = useState(() => roParamFromUrl());
  const roRef = useRef(roMode);
  roRef.current = roMode;

  // 画布循环 = 伴奏本体：作曲、演奏模式持续响（可叠着即兴），只在挑战模式后台静音
  // （不干扰击符判定）；只读分享演出恒响（访客的「线在自动演奏」就是它）。
  // 静音只跳过发声、索引照常推进，切回即从当前相位无缝续播。
  // （曾加过「循伴」开关，可持久关成演奏全静音——是个误触陷阱，已移除；要安静用 HUD「静音」/Shift+M。）
  useEffect(() => {
    engineRef.current?.setCanvasMuted(mode === "challenge" && !roMode);
  }, [mode, roMode]);

  // 全局静音（HUD「静音」chip）：一键让整页安静（演奏/循环/鼓/垫音全灭），再点恢复当前音量。
  // 会话级开关，不持久——刷新默认有声。静音期间画布循环连发声都跳过，顺带省合成开销。
  const [allMuted, setAllMuted] = useState(false);
  const allMutedRef = useRef(false);
  const toggleAllMuted = useCallback(() => {
    const next = !allMutedRef.current;
    allMutedRef.current = next;
    setAllMuted(next);
    engineRef.current?.setMasterMuted(next);
    setAnnounce(next ? "全局静音：全部声音暂时安静" : "静音解除，回到原音量");
  }, []);
  // 开始录音（R / 循环台首层）时自动解除静音：录音却听不到声是坑，悄悄帮你恢复
  const unmuteForRecord = useCallback(() => {
    if (!allMutedRef.current) return;
    allMutedRef.current = false;
    setAllMuted(false);
    engineRef.current?.setMasterMuted(false);
    setAnnounce("录音中，已自动解除静音");
  }, []);
  // 伴奏临时暂停（会话级，刷新自动恢复）：冻住循环相位让耳根清静一下，
  // 再点从暂停的那刻继续，不会跳拍
  const [accompPaused, setAccompPaused] = useState(false);
  const accompPausedRef = useRef(false);
  const toggleAccompPause = useCallback(() => {
    const next = !accompPausedRef.current;
    accompPausedRef.current = next;
    setAccompPaused(next);
    engineRef.current?.setCanvasPaused(next);
    setAnnounce(next ? "伴奏暂停：留谱安静一下" : "伴奏继续：从暂停处接上");
  }, []);

  const [shareRo, setShareRo] = useState(false);
  const guardRo = useCallback(() => {
    if (!roRef.current) return false;
    setAnnounce("这是别人的只读分享作品——点顶栏「复制继续创作」就能改成自己的");
    return true;
  }, []);
  const unlockRo = useCallback(() => {
    setRoMode(false);
    setAnnounce("已复制成你的作品，放心改");
  }, []);

  // ---- 接龙作曲（异步协作传纸条）：?relay= 账本的作曲模式叠加态，不新增第四种主模式 ----
  // 账本 [{n:昵称, k:该棒新增对象数}] 全走链接自带：画布对象数组按解码顺序 = 到达顺序 = 棒次顺序，
  // Σk 前缀归前人（锁定：不可拖动/删除/变形/选中，「清空」也只清本棒），只有本棒尾部新对象可编辑。
  // 起局者（「开始接龙」）写第一条账本 = 自己 + 当时画布对象数，relaySelfLeg 标记账本最后一条
  // 正是自己在画的棒（不归入锁定前缀）；传棒 = 全量重编码 + 账本追加，全程无服务端状态。
  const [relayLedger, setRelayLedger] = useState<RelayLeg[] | null>(null);
  const relayLedgerRef = useRef(relayLedger);
  relayLedgerRef.current = relayLedger;
  const relaySelfLegRef = useRef(false);
  const [relayOpen, setRelayOpen] = useState(false);
  const [relaySoloLeg, setRelaySoloLeg] = useState<number | null>(null);
  const relaySoloRef = useRef<number | null>(null);

  // 前人锁定对象数（起局者扣掉自己最后一条账本），钳到当前画布实际数
  const relayLockNow = useCallback((): number => {
    const ledger = relayLedgerRef.current;
    if (!ledger) return 0;
    if (relaySelfLegRef.current) {
      let sum = 0;
      for (let i = 0; i < ledger.length - 1; i += 1) sum += Math.max(0, Math.floor(ledger[i].k));
      return Math.min(objectsRef.current.length, Math.max(0, sum));
    }
    return relayLockedCount(ledger, objectsRef.current.length);
  }, []);

  // 该对象是否前人锁定（非接龙态恒 false）
  const isRelayLocked = useCallback(
    (id: string): boolean => {
      if (!relayLedgerRef.current) return false;
      const idx = objectsRef.current.findIndex((o) => o.id === id);
      return idx >= 0 && idx < relayLockNow();
    },
    [relayLockNow],
  );

  // 接龙面板 / HUD / 渲染层共用的派生视图：棒次列表（含本棒虚拟行）、棒次序号、上棒昵称、
  // 本棒新增数、渲染层 ghost/提亮边界。随账本与画布版本重算
  const relayInfo = useMemo(() => {
    const ledger = relayLedger;
    if (!ledger) return null;
    const total = objectsRef.current.length;
    let sum = 0;
    const legs: { n: string; k: number; start: number; mine: boolean }[] = ledger.map((l) => {
      const k = Math.min(Math.max(0, Math.floor(l.k)), Math.max(0, total - sum));
      const start = sum;
      sum += k;
      return { n: l.n, k, start, mine: false };
    });
    const selfLeg = relaySelfLegRef.current;
    if (selfLeg) {
      // 最后一条账本 = 自己在画的棒：起局时记的 k 只到开棒那一刻，实际按画布尾巴算
      const mine = legs[legs.length - 1];
      if (mine) {
        mine.k = Math.max(0, total - mine.start);
        mine.mine = true;
      }
      const ghosts = legs.slice(0, Math.max(0, legs.length - 1));
      const lastGhost = ghosts.length > 0 ? ghosts[ghosts.length - 1] : null;
      return {
        myLegNo: Math.max(1, ledger.length),
        prevNick: ghosts.length > 0 ? ghosts[ghosts.length - 1].n : null,
        myCount: mine ? mine.k : total,
        myLegIdx: legs.length - 1,
        relayAllCount: mine ? mine.start : 0,
        relayLastLegStartIdx: lastGhost ? lastGhost.start : mine ? mine.start : 0,
        legs,
      };
    }
    const myCount = Math.max(0, total - sum);
    const lastGhost = legs.length > 0 ? legs[legs.length - 1] : null;
    legs.push({ n: displayNick(), k: myCount, start: sum, mine: true });
    return {
      myLegNo: ledger.length + 1,
      prevNick: lastGhost ? lastGhost.n : null,
      myCount,
      myLegIdx: legs.length - 1,
      relayAllCount: sum,
      relayLastLegStartIdx: lastGhost ? lastGhost.start : sum,
      legs,
    };
  }, [relayLedger, objectsVersion]);

  // 起局：当前画布作为第 1 段入账本（空画布也行，起局后现画）；先解 ro、清 ro 分享位
  const onStartRelay = useCallback(() => {
    setRoMode(false);
    setShareRo(false); // 传棒链接不带只读位——下一个人要能画
    relaySelfLegRef.current = true;
    setRelayLedger([{ n: displayNick(), k: objectsRef.current.length }]);
    relaySoloRef.current = null;
    setRelaySoloLeg(null);
    setAnnounce("接龙开始：你是第 1 棒，画一段再点「传给下一位」生成传棒链接");
  }, []);

  // 传棒：全量对象重编码 + 账本追加 {n, k: 本棒新增数}；超长守护 = 从最早棒次整段丢
  // （按账本 k 边界切数组、账本同步 shift）直到链接进安全线，至少保留最近一棒
  const onPassRelay = useCallback(() => {
    const ledger = relayLedgerRef.current;
    if (!ledger) return;
    const objs = objectsRef.current;
    let sum = 0;
    for (const l of ledger) sum += Math.max(0, Math.floor(l.k));
    const selfLeg = relaySelfLegRef.current;
    const base = selfLeg ? sum - Math.max(0, Math.floor(ledger[ledger.length - 1].k)) : sum;
    if (objs.length - base <= 0) {
      setAnnounce("这一棒还没画乐句——先画一条线或落一个锚点，再传给下一位");
      return;
    }
    const next: RelayLeg[] = selfLeg
      ? [...ledger.slice(0, -1), { n: displayNick(), k: Math.max(0, objs.length - base) }]
      : [...ledger, { n: displayNick(), k: Math.max(0, objs.length - base) }];
    let cutObjs = objs;
    let cutLedger = next;
    let trimmed = false;
    const build = () =>
      buildShareUrl(undefined, encodeCanvasObjects(cutObjs), undefined, encodeRelayParam(cutLedger));
    while (cutLedger.length > 1 && build().length > 1800) {
      const drop = Math.max(0, Math.floor(cutLedger[0].k));
      cutObjs = cutObjs.slice(drop);
      cutLedger = cutLedger.slice(1);
      trimmed = true;
    }
    setShareRo(false);
    setShareUrl(build());
    setShareOpen(true);
    setRelayOpen(false);
    setAnnounce(
      trimmed
        ? "这条接力棒太长啦，截到能传的长度——只带走最近的几棒，你本地看到的还是全曲"
        : "传棒链接已生成，发给下一位就能接着画",
    );
  }, []);

  // 单听某棒：复用分轨混音 solo 机制——该棒对象 solo=true、其余 false；再点同一棒 = 全清还原
  const onToggleRelaySoloLeg = useCallback((legIdx: number) => {
    const ledger = relayLedgerRef.current;
    if (!ledger) return;
    const objs = objectsRef.current;
    const ranges: [number, number][] = [];
    let sum = 0;
    for (const l of ledger) {
      const k = Math.min(Math.max(0, Math.floor(l.k)), Math.max(0, objs.length - sum));
      ranges.push([sum, sum + k]);
      sum += k;
    }
    ranges.push([sum, objs.length]); // 本棒（含未入账本的新对象）
    const r = ranges[legIdx];
    if (!r) return;
    if (r[1] - r[0] <= 0) {
      setAnnounce(`第 ${legIdx + 1} 棒没有乐句，单听个寂寞——换一段试试`);
      return;
    }
    const same = relaySoloRef.current === legIdx;
    setMixState((s) => {
      const nextMix = { ...s };
      objs.forEach((o, idx) => {
        nextMix[o.id] = { ...(nextMix[o.id] ?? DEFAULT_MIX), solo: !same && idx >= r[0] && idx < r[1] };
      });
      return nextMix;
    });
    relaySoloRef.current = same ? null : legIdx;
    setRelaySoloLeg(same ? null : legIdx);
    setAnnounce(same ? "独奏解除：恢复全乐队合奏" : `独奏第 ${legIdx + 1} 棒：现在只听这一棒的声音`);
  }, []);

  // ---- 钢琴卷帘：选中一条线 → 把笔迹量化成显式音符，逐个拖音高/时值、双击删、点空加 ----
  const [rollOpen, setRollOpen] = useState(false);
  useEffect(() => {
    if (mode !== "compose") {
      setRollOpen(false);
      setHistOpen(false);
    }
  }, [mode]);
  const openRoll = useCallback(() => {
    if (guardRo()) return;
    // 未选中可编辑的线时，自动挑第一条可循环笔迹，免得点开没反应（演奏模式常见：没手动选过线）
    let o = selectedId ? objectsRef.current.find((x) => x.id === selectedId) : undefined;
    if (!o || o.type !== "stroke" || o.audio.loopBeats <= 0) {
      const first = objectsRef.current.find((x) => x.type === "stroke" && x.audio.loopBeats > 0);
      if (!first) {
        setAnnounce("先在画布上选中一条线，再开钢琴卷帘");
        return;
      }
      setSelectedId(first.id);
      o = first;
    }
    if (!o.roll || o.roll.length === 0) o.roll = rollFromObject(o, bandDegs(scaleRef.current));
    pushHistory("op", "钢琴卷帘编辑"); // 整段卷帘编辑 = 一步可撤销
    setRollOpen(true);
    setAnnounce("钢琴卷帘：拖方块改音高和时间，空白拖动框选后可整组搬移，右键弹出删除/复制/量化/变调菜单，底部力度条逐音调力度，滚轮缩放音高、Shift 滚轮缩放时间");
  }, [selectedId, pushHistory, guardRo]);
  // 当前卷帘编辑目标（含「线 N」标签，与混音台同序）
  const rollTarget = useMemo(() => {
    if (!rollOpen || !selectedId) return null;
    let strokeNo = 0;
    for (const o of objectsRef.current) {
      if (o.type !== "stroke") continue; // 锚点与参数曲线都不进卷帘
      strokeNo += 1;
      if (o.id === selectedId) {
        if (o.audio.loopBeats <= 0) return null;
        const sc = scaleRef.current;
        return {
          id: o.id,
          label: `线 ${strokeNo}`,
          loopBeats: o.audio.loopBeats,
          degs: bandDegs(sc),
          // 八度 = 多少个音阶级（卷帘「变调 · 升/降八度」的步距）
          octaveDegs: sc.semitones.length,
          // 每行的音名标注（与画布参考线同一套语言；音级名按音阶级数循环）
          rowLabels: Array.from({ length: bandDegs(sc) }, (_, d) => degLabel(sc, d)),
          notes: (o.roll ?? []).map((n) => ({ ...n })),
        };
      }
    }
    return null;
  }, [rollOpen, selectedId, objectsVersion, scaleId]);

  // ---- 乐句变形器：选中一条线/锚点 → 一键出变体（倒影/逆行/移调/加密/稀疏/节奏缩放）----
  const deformTarget = useMemo(() => {
    if (mode !== "compose" || !selectedId) return null;
    const o = objectsRef.current.find((x) => x.id === selectedId);
    if (!o) return null;
    if (o.type === "curve") return null; // 参数曲线没有音高/节奏可变形，不露变形入口
    let strokeNo = 0;
    let anchorNo = 0;
    for (const x of objectsRef.current) {
      if (x.type === "anchor") anchorNo += 1;
      else if (x.type === "stroke") strokeNo += 1;
      if (x.id === selectedId) break;
    }
    return {
      id: o.id,
      label: o.type === "stroke" ? `线 ${strokeNo}` : `锚点 ${anchorNo}`,
      isStroke: o.type === "stroke",
    };
  }, [mode, selectedId, objectsVersion]);
  const applyDeform = useCallback(
    (op: DeformOp, asCopy = false) => {
      if (guardRo()) return;
      const o = objectsRef.current.find((x) => x.id === selectedId);
      if (!o) {
        setAnnounce("先在画布上点选一条线或锚点，再变形");
        return;
      }
      if (o.type === "curve") {
        setAnnounce("参数曲线不能变形——想改形状就重画一条，或拖动它整体挪位置");
        return;
      }
      let target = o;
      let label = "";
      if (asCopy) {
        // 线专属变形对锚点无效——先挡住，免得克隆出一条没法变形的副本
        if (o.type !== "stroke" && ["retrograde", "mirror", "densify", "sparse", "speedUp", "slowDown"].includes(op)) {
          setAnnounce("锚点只有一个音：倒影/逆行/加密/稀疏/节奏缩放请选中一条线再用");
          return;
        }
        // 变体副本：整对象克隆 + 位置微移 → 变形只作用在副本上，原线分毫不动
        if (objectsRef.current.length >= MAX_CANVAS_OBJECTS) {
          setAnnounce(`画布已满（最多 ${MAX_CANVAS_OBJECTS} 个对象），先删几个再出变体`);
          return;
        }
        const clone = JSON.parse(JSON.stringify(o)) as CanvasObject;
        clone.id = newCanvasId();
        clone.createdAt = Date.now();
        const dx = 0.06;
        for (const p of clone.points) p.x = clamp(p.x + dx, -0.05, 1.05);
        pushHistory("op", "乐句变形（变体副本）");
        objectsRef.current.push(clone);
        target = clone;
        label = "变体副本：";
      } else {
        pushHistory("op", "乐句变形"); // 每个变形 = 一步可撤销，Ctrl+Z 反悔
      }
      const msg = deformObject(target, op, scaleRef.current.semitones.length, bandDegs(scaleRef.current));
      // 接龙态本棒段：节奏缩放等改了循环时长也锁回 4 拍（接龙段恒 4 小节）
      if (relayLedgerRef.current && target.type === "stroke") target.audio.loopBeats = 4;
      commitCanvas();
      setAnnounce(`变形：${label}${msg}`);
    },
    [selectedId, guardRo, pushHistory, commitCanvas],
  );
  const applyRoll = useCallback(
    (notes: RollNote[]) => {
      const o = objectsRef.current.find((x) => x.id === selectedId);
      if (!o) return;
      o.roll = notes;
      commitCanvas();
    },
    [selectedId, commitCanvas],
  );
  const resetRollToCurve = useCallback(() => {
    const o = objectsRef.current.find((x) => x.id === selectedId);
    if (!o) return;
    pushHistory("op", "清除卷帘编辑");
    o.roll = undefined;
    refreshAudio(o, bandDegs(scaleRef.current));
    commitCanvas();
    setRollOpen(false);
    setAnnounce("已清掉卷帘编辑，这条线回到你的笔迹");
  }, [selectedId, pushHistory, commitCanvas]);

  const phaseOf = useCallback((id: string) => engineRef.current?.canvasPhase(id) ?? null, []);

  // 渲染器生命周期
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new VisualRenderer(canvas);
    rendererRef.current = renderer;
    renderer.start();
    // 性能模式初始态 + 帧率采样接线
    renderer.setPerfMode(
      perfModeRef.current === "perf" || (perfModeRef.current === "auto" && perfAutoRef.current),
    );
    renderer.setFpsListener((fps) => {
      // 读数只在变化 ≥3 FPS 时才更新——每秒刷新一次会每秒重绘整棵页面树，本身成了周期性卡顿源
      const fpsRounded = Math.round(fps);
      setFpsNow((prev) => (Math.abs(prev - fpsRounded) >= 3 ? fpsRounded : prev));
      if (perfModeRef.current !== "auto") return;
      if (fps < 30) {
        lowStreakRef.current += 1;
        highStreakRef.current = 0;
        if (lowStreakRef.current >= 3) setPerfAuto(true); // 连续 3 秒低于 30fps → 自动降级
      } else {
        lowStreakRef.current = 0;
        if (perfAutoRef.current && fps >= 55) {
          highStreakRef.current += 1;
          if (highStreakRef.current >= 5) setPerfAuto(false); // 恢复流畅 5 秒 → 自动回到完整画质
        } else {
          highStreakRef.current = 0;
        }
      }
    });
    // 无障碍初始态：色盲配色 / 纯视觉节奏模式（创建 effect 在各自 setter 之后注册，须在此回放持久化值）
    renderer.setCbMode(cbModeRef.current);
    renderer.setVisualMode(visualOnlyRef.current);
    renderer.setScaleDegs(bandDegs(scaleRef.current));
    // 自造音色渲染层走 lead 视觉档（分享链接可直接带着自造档进来，这里同样要映射）
    renderer.setVoiceStyle(voiceRef.current === "custom" ? "lead" : voiceRef.current);
    renderer.setPianoBg(pianoBgRef.current && typingModeRef.current === "piano");

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    renderer.setReducedMotion(mq.matches);
    const onMq = () => renderer.setReducedMotion(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onMq);

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (mq.removeEventListener) mq.removeEventListener("change", onMq);
      if (chTimerRef.current) window.clearInterval(chTimerRef.current);
      if (chRafRef.current) cancelAnimationFrame(chRafRef.current);
      renderer.destroy();
      rendererRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // 载入画布：URL 分享优先（访客乐谱），否则本地 IndexedDB。
  // ?relay= 账本有效时进入接龙态（前人对象锁定、本棒只画自己的段落）；账本损坏解码为 null 走普通访客
  useEffect(() => {
    let alive = true;
    const urlRaw = canvasParamFromUrl();
    const urlRelay = relayParamFromUrl();
    const urlObjs = urlRaw
      ? decodeCanvasObjects(urlRaw, bandDegs(scaleRef.current))
      : [];
    if (urlObjs.length > 0 || urlRelay) {
      // ?style= 风格标记重放：分享时画布已含变换但卷帘律动不进编码——打开方先快照、
      // 再对解码出的对象重放同款幂等变换（applyStyle 自带先剥 styleGenerated 旧对象 = 不叠加）
      const styleHit = stylePresetById(styleParamFromUrl());
      if (styleHit && urlObjs.length > 0) {
        styleSnapRef.current = { objs: JSON.stringify(urlObjs), voiceId: voiceRef.current };
        setStyleSnapshotOn(true);
        const sc0 = scaleRef.current;
        objectsRef.current = applyStyle(urlObjs, styleHit, {
          bpm: bpmRef.current,
          degs: bandDegs(sc0),
          scaleLen: sc0.semitones.length,
          baseIdx: bandRange(sc0).lo,
          limiterReductionDb: 0,
          masterVol: 0.5,
          globalVoice: voiceRef.current,
        });
        setStylePresetState(styleHit.id);
        setAnnounce(`这首作品带着「${styleHit.name}」风格——已按该风格重放变换`);
      } else {
        objectsRef.current = urlObjs;
      }
      setGuestCanvas(true);
      setObjectCount(objectsRef.current.length); // 风格重放会增对象，计数取最终数组长度
      setObjectsVersion((v) => v + 1);
      if (urlRelay) {
        relaySelfLegRef.current = false;
        setRelayLedger(urlRelay);
        setAnnounce(
          `已收到接力棒：你是第 ${urlRelay.length + 1} 棒（上棒 ${urlRelay[urlRelay.length - 1]?.n ?? "?"}）——前人的声音已就位，画一段你的再接龙`,
        );
      }
    } else {
      loadCanvasObjects().then((objs) => {
        if (!alive || objs.length === 0) return;
        const n = bandDegs(scaleRef.current);
        for (const o of objs) refreshAudio(o, n);
        objectsRef.current = objs;
        setObjectCount(objs.length);
        setObjectsVersion((v) => v + 1);
        syncCanvasLoops();
      });
    }
    return () => {
      alive = false;
    };
  }, [syncCanvasLoops]);

  // 作曲对象视图同步到渲染层（接龙态附带 ghost/右半提亮边界）
  useEffect(() => {
    rendererRef.current?.setCanvasView({
      objects: objectsRef.current,
      selectedId,
      phaseOf,
      relay: relayInfo
        ? {
            allCount: relayInfo.relayAllCount,
            lastLegStartIdx: relayInfo.relayLastLegStartIdx,
          }
        : null,
    });
  }, [objectsVersion, selectedId, phaseOf, relayInfo]);

  const selectObject = useCallback((obj: CanvasObject | null) => {
    selectedRef.current = obj ? obj.id : null;
    setSelectedId(obj ? obj.id : null);
    if (obj) {
      if (obj.type === "curve") {
        setAnnounce(
          `选中${obj.curveParam ? CURVE_PARAM_META[obj.curveParam].name : ""}曲线：可整体拖动、拉右端手柄改作用时长，Delete 删除`,
        );
        return;
      }
      const deg = obj.audio.pitchCurve[0] ?? 0;
      setAnnounce(`选中乐句：${describeDeg(scaleRef.current, deg, obj.audio.velocityCurve[0] ?? 0.5)}`);
    }
  }, []);

  const flashCap = useCallback(() => {
    setCapToast(true);
    if (capToastTimerRef.current) window.clearTimeout(capToastTimerRef.current);
    capToastTimerRef.current = window.setTimeout(() => setCapToast(false), 2200);
  }, []);

  // 只读分享的分享链接：勾选「只读」后自动带 &ro=1（守卫逻辑见上方「只读分享」段）
  const shownShareUrl = shareRo && shareUrl ? `${shareUrl}&ro=1` : shareUrl;

  // 锚点一次性音：放置/点击时立刻发声（不再靠循环触发，修复重复单音）
  const playAnchorVoice = useCallback((obj: CanvasObject) => {
    const engine = engineRef.current;
    if (!engine) return;
    const degs = bandDegs(scaleRef.current);
    const deg = obj.audio.pitchCurve[0] ?? 0;
    const vel = obj.audio.velocityCurve[0] ?? 0.6;
    // 分轨混音：静音/被独奏挡住的锚点重响也不出声，音量声像与循环一致
    if (obj.muted) return; // AI per-object 静音：点击重响也静默
    const m = mixRef.current[obj.id];
    const anySolo = Object.values(mixRef.current).some((x) => x.solo);
    // 无混音记录的新对象按默认满音量；被静音/独奏挡住的给 0；AI 音量乘子串进来
    const g = (!m ? DEFAULT_MIX.gain : !m.muted && (!anySolo || m.solo) ? m.gain : 0) * (obj.aiGain ?? 1);
    if (g <= 0.001) return;
    // 画布存在参数曲线时锚点也进自动化链（与循环音同等待遇），无曲线时 canvasOut=null 走原直连
    engine.playNote(
      bandRange(scaleRef.current).lo + deg,
      vel * g,
      cutoffFromIdx(degs - 1),
      undefined,
      undefined,
      obj.voiceId, // AI 换乐器：单对象音色覆盖（缺省跟随全局）
      m?.pan,
      engine.canvasOut ?? undefined,
    );
    setAnnounce(`锚点重响：${describeDeg(scaleRef.current, deg, vel)}`);
  }, []);

  const placeAnchor = useCallback(
    (nx: number, ny: number, vel = 0.6) => {
      if (guardRo()) return;
      if (objectsRef.current.length >= MAX_CANVAS_OBJECTS) {
        flashCap();
        return;
      }
      pushHistory("op", "放置锚点");
      const obj = compileAnchor(nx, ny, vel, bandDegs(scaleRef.current));
      objectsRef.current.push(obj);
      commitCanvas();
      selectObject(obj);
      playAnchorVoice(obj);
    },
    [commitCanvas, flashCap, selectObject, playAnchorVoice, pushHistory, guardRo],
  );

  const enterComposeFx = useCallback(() => {
    setAnnounce("进入作曲模式：上高下低，画一条线试试");
    let seen = false;
    try {
      seen = !!window.localStorage.getItem(HINT_KEY);
    } catch {
      seen = false;
    }
    if (!seen) {
      setComposeHint(true);
      try {
        window.localStorage.setItem(HINT_KEY, "1");
      } catch {
        // 忽略
      }
      window.setTimeout(() => setComposeHint(false), 3000);
    }
  }, []);

  const goPerformCore = useCallback(() => {
    rendererRef.current?.setCompose(false);
    setAnnounce("进入演奏模式");
  }, []);

  // ---- 挑战模式 ----

  const chSetPhase = useCallback((ph: ChallengePhase) => {
    chPhaseRef.current = ph;
    setChallengePhase(ph);
  }, []);

  const chStopTimers = useCallback(() => {
    if (chTimerRef.current) {
      window.clearInterval(chTimerRef.current);
      chTimerRef.current = 0;
    }
    if (chRafRef.current) {
      cancelAnimationFrame(chRafRef.current);
      chRafRef.current = 0;
    }
  }, []);

  // 谱内秒数（渲染层 getter）：暂停时 engine suspend 冻结 currentTime → 音符与声音同步冻结
  const chSongTime = useCallback(() => {
    const e = engineRef.current;
    return e ? e.currentTime - chStartRef.current : 0;
  }, []);

  // 锚点平移后的游标重建（小节跳转 / 循环回卷 / 闸门回卷共用）：新 songTime 之前的音全部静默置 judged，
  // 严格 <（含 1e-6 容差）让正好落在小节头的音视为未弹——回卷/跳转后小节头音可被重弹或被 tick 自动演奏
  const chRebuildCursor = useCallback((st: number) => {
    const notes = chNotesRef.current;
    let idx = 0;
    for (let i = 0; i < notes.length; i += 1) {
      notes[i].judged = notes[i].t < st - 1e-6;
      if (notes[i].judged) idx = i + 1;
    }
    chIdxRef.current = idx;
    chClickBeatRef.current = -1e9; // 拍号跳变哨兵：重建游标后第一拍不响，从下一个整拍开始跟
  }, []);

  // 生存续批（tick 内调用，rAF/setInterval 权威钟驱动，禁 setTimeout）：未判音符余量不足 2 小节时
  // 按当前提速系数向 chNotesRef 尾部增量补小节——只 push、不重写历史音符的 t/judged，判定与渲染零改动
  //（渲染层与 chNotesRef 共享同一数组引用，push 即时可见；fall 只在提速当下经 setChallenge 同步）
  const chSurvFillBars = useCallback((st: number) => {
    const gen = chSurvGenRef.current;
    if (!gen) return;
    const beat = (60 / SURVIVAL_BPM) * chSurvFactorRef.current;
    const bs = beat * 4;
    while (chSurvBarEndRef.current < st + 2 * bs) {
      const batch = gen.nextBar(chSurvBarEndRef.current, beat, chSurvMadeRef.current);
      for (const n of batch) chNotesRef.current.push({ ...n, judged: false });
      chSurvMadeRef.current += batch.length;
      chSurvBarEndRef.current += bs;
    }
  }, []);

  // 生存结算（扣完 3 命或意外收束时由 chStep 调用）：坚持时长取结算当下的 songTime（暂停冻结自然不含），
  // 评级按时长档（每日/普通共用）。普通局 best 写本地、level=100 + dur 上报；
  // 每日局今日最佳按日期存、level=200 + day + hits 上报，两条天梯互不干扰
  const chSurvSettle = useCallback(
    (rawSec: number) => {
      const seconds = Math.max(0, Math.floor(rawSec));
      chStopTimers();
      rendererRef.current?.setChallenge(false, null, null, 0);
      const hits = chPRef.current + chGRef.current;
      const judged = hits + chMRef.current;
      const accuracy = judged > 0 ? hits / judged : 0;
      const rating = survivalGrade(seconds);
      const daily = chSurvDailyRef.current;
      const day = daily ? survivalDailyKey() : "";
      const newRecord = daily ? saveSurvivalDailyBest(day, seconds) : saveSurvivalBest(seconds);
      if (newRecord) {
        if (daily) setDailyBest(seconds);
        else setSurvBest(seconds);
      }
      setChResult({
        rating,
        accuracy,
        maxCombo: chMaxComboRef.current,
        perfect: chPRef.current,
        good: chGRef.current,
        miss: chMRef.current,
        score: chScoreRef.current,
        survival: { seconds, newRecord, daily: daily || undefined, day: day || undefined },
      });
      chSetPhase("result");
      chPerfUrlRef.current = ""; // 生存局不提供演奏回放（结算面板不给分享入口）
      if (daily) chSubmitScore(SURVIVAL_DAILY_SCORE_LEVEL, rating, accuracy, chMaxComboRef.current, seconds, day, hits);
      else chSubmitScore(SURVIVAL_SCORE_LEVEL, rating, accuracy, chMaxComboRef.current, seconds);
      setAnnounce(
        daily
          ? newRecord
            ? `每日挑战结束：坚持 ${fmtClock(seconds)}，命中 ${hits} 音，刷新今日最佳，评级 ${rating}`
            : `每日挑战结束：坚持 ${fmtClock(seconds)}，命中 ${hits} 音，评级 ${rating}`
          : newRecord
            ? `生存结束：坚持 ${fmtClock(seconds)}，命中 ${hits} 音，刷新个人最佳，评级 ${rating}`
            : `生存结束：坚持 ${fmtClock(seconds)}，命中 ${hits} 音，评级 ${rating}`,
      );
    },
    [chSetPhase, chStopTimers, chSubmitScore],
  );

  // lookahead 消费（与 AudioEngine.scheduleSequence 同款模式：25ms tick + currentTime 判定，
  // 禁 setTimeout 驱动音符）：只负责超窗 Miss、演示自动命中、练习闸门/循环与收束，命中声音在按键当下即时发出
  const chStep = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const st = engine.currentTime - chStartRef.current;
    // 玩家时间轴 = st 扣校准偏移：超窗 Miss 与等待闸门按「听到的时刻」放宽，不因设备延迟冤杀；
    // 演示自动命中走原始 st（声音是它自己排的，不需要人耳补偿）
    const stJ = st - calibMsRef.current / 1000;
    const notes = chNotesRef.current;
    const renderer = rendererRef.current;
    const mode = chModeRef.current;
    const demo = mode === "demo";
    const practice = mode === "practice";
    const survival = mode === "survival";
    // 关卡自带判定窗（UGC 高难关收紧）；生存不挂关、一律全局窗——公版五关与生存行为零变化
    const wins = survival
      ? { pw: PERFECT_WINDOW, gw: GOOD_WINDOW }
      : levelWindows(chLevels()[chLevelRef.current]);
    // 等待模式冻结中：钟已挂起（st 不再前进），tick 只空转，命中当下由 chHit 唤醒
    if (practice && chWaitHoldRef.current) return;
    // 演示：到判定时刻（st ≥ n.t）当拍自动命中发声点亮，tick 25ms 抖动远小于 Perfect 容差；
    // 挑战/练习：超出 Good 窗仍未 judged 才消耗。练习的 t 在入谱时已 ×timeScale（st 同为真实秒），
    // 比较同处真实时间域，判定窗天然保持真实 90/180ms，两侧无需再乘除倍率。同一 lookahead tick 驱动，禁 setTimeout。
    while (
      chIdxRef.current < notes.length &&
      notes[chIdxRef.current].t + (demo ? 0 : wins.gw) <= (demo ? st : stJ)
    ) {
      const n = notes[chIdxRef.current];
      if (!n.judged) {
        n.judged = true;
        if (demo) {
          const pk = PIANO_KEYS[Math.max(0, Math.min(PIANO_KEYS.length - 1, n.key))];
          const midi = n.black ? pk.blackMidi ?? pk.midi : pk.midi;
          // 纯视觉节奏模式：演示自动演奏也静音，视觉照常点亮
          if (!visualOnlyRef.current) engine.playPiano(midi - PIANO_C3_MIDI, 0.85);
          renderer?.pressPianoKey(n.key, n.black, 0.85);
          renderer?.challengeFx(n.key, n.black, "perfect");
        } else if (!practice) {
          chMRef.current += 1;
          chComboRef.current = 0;
          // 超窗漏按：miss 文字下提示该音符本应的键位；生存态同步扣命 HUD
          if (survival) setSurvLives(Math.max(0, SURVIVAL_LIVES - chMRef.current));
          renderer?.challengeFx(n.key, n.black, "miss", { key: n.key, black: n.black });
        } else {
          // 练习漏按：只给轨道红闪与键位提示，不计数、combo 不动（计分链路整条不挂）；
          // 同时是练顺判定的 Miss 捕获点：本遍记 Miss + 全中连击清零 + 提示条收起
          chPassMissRef.current = true;
          chStreakRef.current = 0;
          setPracticeHintBar(0);
          renderer?.challengeFx(n.key, n.black, "miss", { key: n.key, black: n.black });
        }
      }
      chIdxRef.current += 1;
    }
    // 生存模式 tick 专属三件事（同一权威钟，禁 setTimeout）：坚持时长上报（整秒变化才 setState）、
    // 未判余量不足 2 小节时向尾部续批、扣完 3 命当刻立即结算（无 Miss 缓冲）
    if (survival) {
      if (st >= 0) {
        const s = Math.floor(st);
        if (s !== chSurvSecRef.current) {
          chSurvSecRef.current = s;
          setSurvSec(s);
        }
      }
      chSurvFillBars(st);
      if (chMRef.current >= SURVIVAL_LIVES) {
        chSurvSettle(st);
        return;
      }
    }
    // 等待模式：谱面第一个未判的音已到判定线（st ≥ t）仍没弹上 → 挂起引擎冻结一切，
    // 不产生 Miss 不计分，弹对那个键的瞬间恢复；播报提示该按哪个键
    if (practice && chWaitRef.current) {
      let target: (typeof notes)[number] | null = null;
      for (let i = 0; i < notes.length; i += 1) {
        if (!notes[i].judged) {
          target = notes[i];
          break;
        }
      }
      if (target && stJ >= target.t) {
        engine.suspend();
        chWaitHoldRef.current = true;
        setAnnounce(`等待弹奏 ${pianoKeyLabel(target.key, target.black)}`);
        return;
      }
    }
    if (mode === "race" || survival) {
      setComboCount(chComboRef.current);
    } else {
      // 控制条小节号：songTime/barSec 对齐谱面 0 拍，夹在 [1, 总小节数]；练习 barSec 随倍速拉伸，小节号与常速一致
      const lv = chLevels()[chLevelRef.current];
      if (lv) {
        const bs = barSecFor(lv.bpm) * (practice ? chScaleRef.current : 1);
        setDemoBar(Math.max(1, Math.min(Math.floor(st / bs) + 1, totalBarsOf(notes, bs))));
        if (practice) {
          // 节拍器：四分音符 click（每小节第 1 拍重拍），与判定共用 25ms tick、暂停 suspend 时自然冻结；
          // 只在拍号连续 +1 前进时出声，跳小节/回卷/变速的拍号跳变（含哨兵）天然静音
          const bi = Math.floor(st / (bs / 4));
          if (bi !== chClickBeatRef.current) {
            const prev = chClickBeatRef.current;
            chClickBeatRef.current = bi;
            if (practiceClickRef.current && !visualOnlyRef.current && st >= 0 && bi === prev + 1) {
              engine.playClick(bi % 4 === 0);
            }
          }
          // 「本小节指法」行：小节变化才重算（指法只看键位与倍速无关，只按当下小节分桶；跳转/变速已置 -1）
          if (fingeringOnRef.current && chFingeringRef.current) {
            const bIdx = Math.max(0, Math.floor(st / bs));
            if (bIdx !== chFinBarRef.current) {
              chFinBarRef.current = bIdx;
              const seq: { L: FinChip[]; R: FinChip[] } = { L: [], R: [] };
              for (let i = 0; i < notes.length; i += 1) {
                if (notes[i].t >= (bIdx + 1) * bs) break;
                if (notes[i].t >= bIdx * bs) {
                  const m = chFingeringRef.current[i];
                  if (m) seq[m.hand].push({ s: `${m.finger}`, n: i });
                }
              }
              setPracticeFinSeq(seq);
            }
            // 跟随高亮：统计本小节各手 judged（已命中或已滑过）的音数 = 该手已走过的 chip 数，
            // 下一个该弹的下标即高亮位；命中即 judged，所以跟着真实演奏前进。仅在变化时上报。
            // 同时把该音符在谱面里的索引推给渲染层，下落块画粗描边与指法行亮格同源。
            let aL = 0, aR = 0, cL = 0, cR = 0, nL = -1, nR = -1;
            for (let i = 0; i < notes.length; i += 1) {
              if (notes[i].t >= (bIdx + 1) * bs) break;
              if (notes[i].t >= bIdx * bs) {
                const m = chFingeringRef.current[i];
                if (!m) continue;
                if (m.hand === "L") {
                  cL += 1;
                  if (notes[i].judged) aL += 1;
                  else if (nL < 0) nL = i;
                } else {
                  cR += 1;
                  if (notes[i].judged) aR += 1;
                  else if (nR < 0) nR = i;
                }
              }
            }
            const next = { L: aL < cL ? aL : -1, R: aR < cR ? aR : -1 };
            if (next.L !== chFinActiveRef.current.L || next.R !== chFinActiveRef.current.R) {
              chFinActiveRef.current = next;
              setPracticeFinActive(next);
            }
            if (nL !== chBlkActiveRef.current.L || nR !== chBlkActiveRef.current.R) {
              chBlkActiveRef.current = { L: nL, R: nR };
              renderer?.setChallengeActive(nL, nR);
            }
          }
          const anchor = chLoopAnchorRef.current;
          if (chLoopBarRef.current) {
            // 循环本小节：越过末小节线 → 锚点平移回本小节头 + 重建游标（仍是同一权威钟；
            // 正好落在小节头的音经严格 < 重建为未判，回卷后可重弹）
            if (st > (anchor + 1) * bs) {
              // 回卷 = 一遍的边界：该遍「全中」= 无 Miss 捕获 + 本小节音符全部已判（尾部音判定窗
              // 未过而没弹属于"没弹完"，不加分也不清零）；Miss 已在捕获点实时清零；连两遍全中浮提示
              let passAllHit = !chPassMissRef.current;
              if (passAllHit) {
                for (let i = 0; i < notes.length; i += 1) {
                  if (notes[i].t >= (anchor + 1) * bs) break;
                  if (notes[i].t >= anchor * bs && !notes[i].judged) {
                    passAllHit = false;
                    break;
                  }
                }
              }
              let rewindMsg = `已倒回第 ${anchor + 1} 小节重跑`;
              let advanced = false;
              if (passAllHit) {
                chStreakRef.current += 1;
                if (chStreakRef.current >= 2) {
                  const nb = anchor + 1;
                  const total = totalBarsOf(notes, bs);
                  if (chAutoNextRef.current && nb < total) {
                    // 自动跳节：直接平移到下一小节头（点击提示条的自动版），循环锚跟到新小节头继续循环
                    chStartRef.current += st - nb * bs;
                    chRebuildCursor(nb * bs);
                    chLoopAnchorRef.current = nb;
                    chStreakRef.current = 0;
                    chFinBarRef.current = -1; // 新小节指法行强制重算
                    setDemoBar(nb + 1);
                    setAnnounce(`第 ${anchor + 1} 小节已练顺，自动进入第 ${nb + 1} 小节`);
                    advanced = true;
                  } else {
                    setPracticeHintBar(anchor + 1);
                    rewindMsg = `第 ${anchor + 1} 小节已练顺，按 → 去下一小节`;
                  }
                }
              }
              if (!advanced) {
                chPassMissRef.current = false;
                chStartRef.current += st - anchor * bs;
                chRebuildCursor(anchor * bs);
                setDemoBar(anchor + 1);
                setAnnounce(rewindMsg);
              }
            }
          } else if (chIdxRef.current < notes.length) {
            // 小节闸门：过小节线多放 0.4s 尾音再自动暂停；回卷时锚先平移回小节线，
            // 0.4s 越界期不吃掉下一小节头音，冻结点 songTime 恰在小节线上、恢复后不会立刻再触发
            const done = Math.floor(st / bs);
            if (done >= 1 && st > done * bs + 0.4) {
              chStartRef.current += st - done * bs;
              chRebuildCursor(done * bs);
              engine.suspend();
              chPausedRef.current = true;
              chSetPhase("paused");
              setDemoBar(done + 1);
              setAnnounce(`第 ${done} 小节练完，空格/▶ 继续，或 ⏭ 跳到下一小节`);
            }
          }
        }
      }
    }
    const last = notes[notes.length - 1];
    if (chIdxRef.current >= notes.length && last && st >= last.t + CHALLENGE_TAIL) {
      chStopTimers();
      renderer?.setChallenge(false, null, null, 0);
      const chLv = chLevels()[chLevelRef.current];
      const lvName = chLv ? `${chLv.name} · ${chLv.song}` : "";
      if (survival) {
        // 生存无尽：续批保证此分支理论上不触发（生成器异常兜底），到时长按常规结算
        chSurvSettle(st);
        return;
      }
      if (mode === "demo" || mode === "practice") {
        // 演示/练习收束：不计分、不写 localStorage、不进结算面板，直接回关卡选择
        chModeRef.current = "race";
        setChMode("race");
        chSetPhase("select");
        setAnnounce(
          demo
            ? `演示播放完毕：${lvName}，已回到关卡选择`
            : `练习完毕：${lvName}，已回到关卡选择`,
        );
        return;
      }
      const total = notes.length;
      const accuracy = total > 0 ? (chPRef.current + chGRef.current) / total : 0;
      const rating = gradeFor(accuracy);
      const saved = saveChallengeResult(chLevelRef.current, rating);
      chProgressRef.current = saved.progress;
      setChProgress(saved.progress);
      setChResult({
        rating,
        accuracy,
        maxCombo: chMaxComboRef.current,
        perfect: chPRef.current,
        good: chGRef.current,
        miss: chMRef.current,
        score: chScoreRef.current,
      });
      chSetPhase("result");
      // 结算即预生成「我的演奏」回放链接（≥4 击才值得分享）：p 事件 + 关卡 BPM + t 参数强制访客进钢琴视图
      const perf = [...chPerfRef.current].sort((a, z) => a.t - z.t);
      chPerfUrlRef.current =
        perf.length >= 4
          ? buildShareUrl(
              encodeScore(perf, chLv?.bpm ?? 100),
              undefined,
              buildTParam(scaleRef.current.id, voiceRef.current, drumKitRef.current, "piano"),
            )
          : "";
      // 天梯只收公版关卡；自定义谱成绩不上榜（saveChallengeResult 对追加位同样自动跳过）
      if (chLevelRef.current < CHALLENGE_LEVELS.length) {
        chSubmitScore(chLevelRef.current + 1, rating, accuracy, chMaxComboRef.current);
      }
      setAnnounce(`关卡 ${lvName} 完成，评级 ${rating}，准确率 ${Math.round(accuracy * 100)}%`);
    }
  }, [chSetPhase, chStopTimers, chRebuildCursor, chSubmitScore, chSurvFillBars, chSurvSettle]);

  // 选关 → 3·2·1 倒计时（UI 走 rAF，起始时刻精确对齐音频时钟）→ 游玩
  const chStartLevel = useCallback(
    (index: number, mode: "race" | "demo" | "practice" = "race") => {
      const engine = engineRef.current;
      if (!engine) return;
      const lv = chLevels()[index];
      if (!lv) return;
      // 解锁闸门只管公版关卡；自定义谱（追加位）随时可玩
      if (index < CHALLENGE_LEVELS.length && index >= chProgressRef.current.unlocked) return;
      chStopTimers();
      chLevelRef.current = index;
      setChallengeLevel(index);
      // 演示/练习与挑战共用倒计时→下落全流程（同一单钟锚定），差别只在自动命中、不计分与慢速谱面
      chModeRef.current = mode;
      setChMode(mode);
      // 每一轮辅助模式都从 1× 起、循环关：变速/循环经控制条就地切换，不跨局携带
      chScaleRef.current = 1;
      setPracticeScale(1);
      chLoopBarRef.current = false;
      setPracticeLoop(false);
      chPerfRef.current = []; // 回放从本局重新收录
      chPerfUrlRef.current = "";
      chStreakRef.current = 0;
      chPassMissRef.current = false;
      setPracticeHintBar(0);
      // timeScale 唯一作用点 = 谱面时间域烘焙（t′ = t×倍率，开局恒 1×，变速经 chSetPracticeScale 重建）：
      // 渲染/判定/偏差/小节闸门此后全按真实秒直接比较，判定窗保持真实毫秒，倍率不分散进各链路
      chNotesRef.current = lv.notes.map((n) => ({ ...n, t: n.t * chScaleRef.current, judged: false }));
      setDemoBar(1);
      setDemoBars(totalBarsOf(lv.notes, barSecFor(lv.bpm))); // 小节数不随倍率变（t 与 barSec 同缩放），按原谱计
      chLoopAnchorRef.current = 0;
      // 练习指法表：与谱面按索引对齐的启发式建议（只看键位，时间拉伸不影响指法本身）；非练习一律清空
      chFingeringRef.current = mode === "practice" ? chApplyFinOverrides(annotateFingering(chNotesRef.current)) : null;
      chFinBarRef.current = -1;
      chClickBeatRef.current = -1e9;
      chFinActiveRef.current = { L: -1, R: -1 };
      chBlkActiveRef.current = { L: -1, R: -1 };
      rendererRef.current?.setChallengeActive(-1, -1);
      setPracticeFinSeq({ L: [], R: [] });
      setPracticeFinActive({ L: -1, R: -1 });
      chIdxRef.current = 0;
      chScoreRef.current = 0;
      chComboRef.current = 0;
      chMaxComboRef.current = 0;
      chPRef.current = 0;
      chGRef.current = 0;
      chMRef.current = 0;
      setChallengeScore(0);
      setComboCount(0);
      setChResult(null);
      chPausedRef.current = false;
      chWaitHoldRef.current = false;
      engine.ensure();
      engine.resume();
      // 单钟锚定（时序 bug 修复）：进入倒计时的当下就把谱面 0 点 chStart 锚到「倒计时起点 + 3 秒」——
      // 倒计时期间 songTime 天然是 -3 → 0 的负值，渲染层据此只让音符按真实拍位进入画面、
      // 判定与 tick 在 play 前一律不激活；rAF 只采样 currentTime 画数字，不另起计时钟。
      // （旧实现在倒计时结束时才写 chStart，期间 songTime = currentTime - 上一次/0 的旧锚点，
      // 首次进入时 ≈ 原始 ctx.currentTime，谱面音符会提前落向判定线，看似"倒计时没结束就开始"。）
      const cStart = engine.currentTime + 0.05;
      chStartRef.current = cStart + COUNTDOWN_SEC;
      rendererRef.current?.setChallenge(
        true,
        chNotesRef.current,
        chSongTime,
        lv.fall,
        60 / lv.bpm,
        mode === "practice" && fingeringOnRef.current ? chFingeringRef.current : undefined,
      );
      chSetPhase("countdown");
      setCountdownNum(COUNTDOWN_SEC);
      const raf = () => {
        const rem = COUNTDOWN_SEC - (engine.currentTime - cStart);
        if (rem <= 0) {
          // 此刻 songTime = currentTime - chStart ≈ 0（±rAF 一帧）：倒计时走完的瞬间正是乐谱 0 拍
          chRafRef.current = 0;
          chSetPhase("play");
          chTimerRef.current = window.setInterval(chStep, 25);
          return;
        }
        setCountdownNum(Math.max(1, Math.ceil(rem)));
        chRafRef.current = requestAnimationFrame(raf);
      };
      chRafRef.current = requestAnimationFrame(raf);
    },
    [chSetPhase, chStep, chStopTimers],
  );

  // 生存模式开一局：预生成 3 小节 + 单钟锚定倒计时（与 chStartLevel 同款时序，无尽谱面由 tick 续批）。
  // 不占用解锁进度、不进练习/演示分支；空格暂停复用现有挂起机制（songTime 冻结、计时不含暂停）。
  // daily=true 每日挑战局：种子 = 本地日期哈希（当天所有人同谱、再来一局不换种子）；
  // 普通局一次性随机种子（每局不同，行为与既往完全一致）
  const chStartSurvival = useCallback((daily = false) => {
    const engine = engineRef.current;
    if (!engine) return;
    chStopTimers();
    chModeRef.current = "survival";
    setChMode("survival");
    // 上一局练习/演示遗留全部复位，避免跨模式泄漏
    chScaleRef.current = 1;
    setPracticeScale(1);
    chLoopBarRef.current = false;
    setPracticeLoop(false);
    chStreakRef.current = 0;
    chPassMissRef.current = false;
    setPracticeHintBar(0);
    chFingeringRef.current = null;
    chFinBarRef.current = -1;
    chFinActiveRef.current = { L: -1, R: -1 };
    chBlkActiveRef.current = { L: -1, R: -1 };
    rendererRef.current?.setChallengeActive(-1, -1);
    setPracticeFinSeq({ L: [], R: [] });
    setPracticeFinActive({ L: -1, R: -1 });
    // 种子：每日局 = 本地日期哈希（同天同谱，与提速进程无关）；普通局 = 一次性种子 + 引擎内 LCG
    chSurvDailyRef.current = daily;
    setSurvivalDaily(daily);
    setDailyBest(loadSurvivalDailyBest(survivalDailyKey())); // 开局刷新今日最佳（跨零点自动换天）
    chSurvSeqRef.current += 1;
    const gen = daily
      ? createSurvivalGen(survivalDailySeed())
      : createSurvivalGen(
          ((Date.now() % 2147483647) * 48271 + chSurvSeqRef.current * 9301 + 40493) >>> 0,
        );
    chSurvGenRef.current = gen;
    const bs = barSecFor(SURVIVAL_BPM);
    const notes: (ChartNote & { judged: boolean })[] = [];
    chSurvMadeRef.current = 0;
    for (let bar = 0; bar < SURVIVAL_START_BARS; bar += 1) {
      const batch = gen.nextBar(bar * bs, 60 / SURVIVAL_BPM, chSurvMadeRef.current);
      for (const n of batch) notes.push({ ...n, judged: false });
      chSurvMadeRef.current += batch.length;
    }
    chNotesRef.current = notes;
    chSurvFactorRef.current = 1;
    chSurvBarEndRef.current = SURVIVAL_START_BARS * bs;
    chSurvCorrectRef.current = 0;
    chSurvNextSpeedRef.current = SURVIVAL_SPEEDUP_HITS;
    chSurvNextDoubleRef.current = SURVIVAL_DOUBLE_HITS;
    chSurvDoubleLeftRef.current = 0;
    chSurvSecRef.current = -1;
    chIdxRef.current = 0;
    chScoreRef.current = 0;
    chComboRef.current = 0;
    chMaxComboRef.current = 0;
    chPRef.current = 0;
    chGRef.current = 0;
    chMRef.current = 0;
    chPerfUrlRef.current = "";
    setChallengeScore(0);
    setComboCount(0);
    setChResult(null);
    setSurvLives(SURVIVAL_LIVES);
    setSurvSec(0);
    setSurvPct(100);
    setSurvDouble(false);
    setDemoBar(1);
    chPausedRef.current = false;
    chWaitHoldRef.current = false;
    chClickBeatRef.current = -1e9;
    engine.ensure();
    engine.resume();
    const cStart = engine.currentTime + 0.05;
    chStartRef.current = cStart + COUNTDOWN_SEC;
    rendererRef.current?.setChallenge(true, notes, chSongTime, fallSecFor(SURVIVAL_BPM), 60 / SURVIVAL_BPM);
    chSetPhase("countdown");
    setCountdownNum(COUNTDOWN_SEC);
    const raf = () => {
      const rem = COUNTDOWN_SEC - (engine.currentTime - cStart);
      if (rem <= 0) {
        chRafRef.current = 0;
        chSetPhase("play");
        chTimerRef.current = window.setInterval(chStep, 25);
        return;
      }
      setCountdownNum(Math.max(1, Math.ceil(rem)));
      chRafRef.current = requestAnimationFrame(raf);
    };
    chRafRef.current = requestAnimationFrame(raf);
    setAnnounce(
      daily
        ? "每日挑战：今天所有人同一套音符流，零点换新谱；三次 Miss 结束"
        : "生存模式：音符无限下落、越弹越快，三次 Miss 结束",
    );
  }, [chSetPhase, chStep, chStopTimers, chSongTime]);

  // Tab 离开时生存当局作废（不上报、不进结算）：收定时器与下落层直接回选关层。
  // 只经 chVoidSurvivalRef 在 visibilitychange 里调，避免动大 effect 依赖表
  const chVoidSurvival = useCallback(() => {
    chStopTimers();
    rendererRef.current?.setChallenge(false, null, null, 0);
    chSurvGenRef.current = null;
    chSurvDailyRef.current = false;
    setSurvivalDaily(false);
    chModeRef.current = "race";
    setChMode("race");
    chPausedRef.current = false;
    setChResult(null);
    chSetPhase("select");
    setAnnounce("离开页面，本局生存作废，不计成绩");
  }, [chSetPhase, chStopTimers]);
  const chVoidSurvivalRef = useRef<() => void>(() => {});
  chVoidSurvivalRef.current = chVoidSurvival;

  // 生存榜：level=100 的成绩按坚持时长降序取 Top5（本地拉一次展开；服务端排序不动，本地重排兜底）
  const loadSurvivalBoard = useCallback(() => {
    void listTopScores(SURVIVAL_SCORE_LEVEL, 5).then((rows) => {
      setSurvBoard([...rows].sort((a, z) => (z.dur ?? 0) - (a.dur ?? 0)));
    });
  }, []);

  // 每日榜：level=200 拉回后本地过滤 day=今天、按坚持时长降序 Top5（隔天旧成绩自然不入榜）
  const loadDailyBoard = useCallback(() => {
    const today = survivalDailyKey();
    void listTopScores(SURVIVAL_DAILY_SCORE_LEVEL, 50).then((rows) => {
      setDailyBoard(
        rows
          .filter((s) => s.day === today)
          .sort((a, z) => (z.dur ?? 0) - (a.dur ?? 0))
          .slice(0, 5),
      );
    });
  }, []);

  // 击符：与 pianoMap 同映射（字母=白键，Shift+字母=右邻黑键），只看窗口内未判的同键位同黑白谱面音符
  const chHit = useCallback((key: string, shift: boolean) => {
    if (chPhaseRef.current !== "play") return;
    if (chModeRef.current === "demo") return; // 演示中玩家按键不参与判定与计分
    const practice = chModeRef.current === "practice"; // 练习：判定/声音/特效/偏差全同常规，只不计数不计分
    const engine = engineRef.current;
    if (!engine) return;
    const ki = pianoIndexOf(key);
    if (ki < 0) return;
    // 判定时间轴扣掉校准偏移：玩家按「听到的哒」按键时 st ≈ n.t + 延迟，扣除后即为压线
    const st = engine.currentTime - chStartRef.current - calibMsRef.current / 1000;
    const pk = PIANO_KEYS[ki];
    const wantBlack = shift && pk.blackMidi !== null;
    const renderer = rendererRef.current;
    const notes = chNotesRef.current;
    // 关卡自带判定窗（与 chStep 同一入口，两条链路同窗）；生存一律全局窗
    const wins =
      chModeRef.current === "survival"
        ? { pw: PERFECT_WINDOW, gw: GOOD_WINDOW }
        : levelWindows(chLevels()[chLevelRef.current]);
    let bestI = -1;
    let bestDt = Infinity;
    for (let i = 0; i < notes.length; i += 1) {
      const n = notes[i];
      if (n.judged) continue;
      if (n.t - st > wins.gw) break; // 谱面按时间升序，后面的都太远
      if (st - n.t > wins.gw) continue;
      if (n.key !== ki || n.black !== wantBlack) continue;
      const dt = Math.abs(n.t - st);
      if (dt < bestDt) {
        bestDt = dt;
        bestI = i;
      }
    }
    if (bestI >= 0) {
      notes[bestI].judged = true;
      // 等待模式中命中目标音 → 唤醒冻结的时钟继续行进（错键不会走到这里，自然保持等待）
      if (chWaitHoldRef.current) {
        chWaitHoldRef.current = false;
        engine.resume();
      }
      const perfect = bestDt <= wins.pw;
      if (!practice) {
        chComboRef.current += 1;
        chMaxComboRef.current = Math.max(chMaxComboRef.current, chComboRef.current);
        // 生存：双倍段内本音得分 ×2（判定/连击/基础分值完全复用 race 链路）
        const doubleMul =
          chModeRef.current === "survival" && chSurvDoubleLeftRef.current > 0 ? 2 : 1;
        chScoreRef.current += (perfect ? 100 + chComboRef.current * 2 : 50) * doubleMul;
        if (perfect) chPRef.current += 1;
        else chGRef.current += 1;
        if (chModeRef.current === "survival") {
          if (chSurvDoubleLeftRef.current > 0) {
            chSurvDoubleLeftRef.current -= 1;
            if (chSurvDoubleLeftRef.current === 0) setSurvDouble(false);
          }
          chSurvCorrectRef.current += 1;
          // 每 50 正确音触发双倍段（触发当下播报 + chip 亮起；新里程碑到点重新触发）
          if (chSurvCorrectRef.current >= chSurvNextDoubleRef.current) {
            chSurvNextDoubleRef.current += SURVIVAL_DOUBLE_HITS;
            chSurvDoubleLeftRef.current = SURVIVAL_DOUBLE_LEN;
            setSurvDouble(true);
            setAnnounce(`双倍分数段：接下来 ${SURVIVAL_DOUBLE_LEN} 个音得分翻倍`);
          }
          // 每 20 正确音提速 5%：新续批小节的拍距与 fall 同比例缩短（不重写历史 t），到下限不再快
          if (chSurvCorrectRef.current >= chSurvNextSpeedRef.current) {
            chSurvNextSpeedRef.current += SURVIVAL_SPEEDUP_HITS;
            if (chSurvFactorRef.current > SURVIVAL_SPEED_MIN) {
              const f = Math.max(SURVIVAL_SPEED_MIN, chSurvFactorRef.current * SURVIVAL_SPEED_STEP);
              if (f !== chSurvFactorRef.current) {
                chSurvFactorRef.current = f;
                const beat = (60 / SURVIVAL_BPM) * f;
                // 共享同一 notes 数组引用重挂下落层：只同步 fall 与节拍网格周期，历史音自然滚过
                rendererRef.current?.setChallenge(
                  true,
                  chNotesRef.current,
                  chSongTime,
                  fallSecFor(SURVIVAL_BPM) * f,
                  beat,
                  null,
                );
              }
              setSurvPct(Math.round(100 / chSurvFactorRef.current));
            }
          }
        }
        setChallengeScore(chScoreRef.current);
        setComboCount(chComboRef.current);
      }
      // 纯视觉节奏模式：命中不出声（判定/计分/视觉反馈完全不变），靠加亮的判定线与判定文字打谱
      const midi = wantBlack ? pk.blackMidi ?? pk.midi : pk.midi;
      if (!visualOnlyRef.current) engine.playPiano(midi - PIANO_C3_MIDI, 0.85);
      renderer?.pressPianoKey(ki, wantBlack, 0.85);
      // 偏差毫秒统一上报：Good 显示 ±NNms；Perfect 交渲染层判边缘带（≥60ms 触发「压点!」闪光）。
      // 练习态无需 ÷倍率换算：st 与 t′ 同为真实秒，offMs 报出的就是玩家相对真实拍位的偏差毫秒
      const offMs = (st - notes[bestI].t) * 1000;
      renderer?.challengeFx(ki, wantBlack, perfect ? "perfect" : "good", undefined, offMs);
      if (!practice) {
        // 正式局收录这一下（用玩家真实触达时刻，回放带本人节奏偏差）
        chPerfRef.current.push({ t: Math.max(0, st), k: "p", ki, b: wantBlack ? 1 : 0, v: 13, s: 0, soft: 0 });
      }
    } else {
      // 按错 / 空按：combo 清零（对应谱面音符未消耗，仍可在窗口内被正确键补中）；练习态不动 combo；
      // 漏按的谱面音符不发声——没弹就没有声音，由 chStep 超窗记 Miss（练习只闪不记）
      if (!practice) {
        chComboRef.current = 0;
        setComboCount(0);
      } else {
        // 练习按错/空按：同算 Miss 事件——本遍记 Miss、全中连击清零、练顺提示收起
        chPassMissRef.current = true;
        chStreakRef.current = 0;
        setPracticeHintBar(0);
      }
      // 按错/空按：找窗口内最近的未判定音符当"该按哪个键"提示（窗口放宽 0.1s，找不到则只报 MISS）
      let hintI = -1;
      let hintDt = Infinity;
      for (let i = 0; i < notes.length; i += 1) {
        const n = notes[i];
        if (n.judged) continue;
        if (n.t - st > wins.gw + 0.1) break;
        const dt = Math.abs(n.t - st);
        if (st - n.t > wins.gw + 0.1) continue;
        if (dt < hintDt) {
          hintDt = dt;
          hintI = i;
        }
      }
      renderer?.challengeFx(
        ki,
        false,
        "miss",
        hintI >= 0 ? { key: notes[hintI].key, black: notes[hintI].black } : undefined,
      );
    }
  }, [chSongTime]);

  // ---- MIDI 键盘输入（Web MIDI）：外接键盘 note-on → 26 键映射 → 复用既有弹琴/挑战判定入口 ----
  const [midiIn, setMidiIn] = useState(false);
  const [midiDevs, setMidiDevs] = useState<string[]>([]);
  // 经 ref 分发：开一次 MIDI 后逻辑升级不用重绑设备回调，也避免闭包拿旧引用
  const midiNoteOnRef = useRef<(midi: number) => void>(() => {});
  midiNoteOnRef.current = (midi: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    // 外接键盘首弹即唤醒 AudioContext：MIDI 连上时未必点过屏幕琴键，
    // 若 ctx 仍 suspended，touchPlayKey→playPiano 全静音。此处 ensure() 顺手 resume。
    engine.ensure();
    const pos = pianoPosOfMidi(midi);
    if (!pos) return; // 26 键之外的音直接忽略（不发声也不误判）
    // 外接 MIDI 键盘始终按钢琴键位发声，与打字玩法（鼓/钢琴）无关——
    // 默认 typingMode 是 "drum" 也不该让它静音，故演奏/作曲两种模式都直发 touchPlayKey
    if (modeRef.current === "challenge") chHit(PIANO_KEYS[pos.key].ch, pos.black);
    else if (modeRef.current === "perform" || modeRef.current === "compose")
      touchPlayKey(pos.key, pos.black);
  };
  const toggleMidiIn = useCallback(async () => {
    if (midiIn) {
      stopMidiInput();
      setMidiIn(false);
      setMidiDevs([]);
      setAnnounce("MIDI 键盘已断开");
      return;
    }
    const res = await startMidiInput({ onNoteOn: (m) => midiNoteOnRef.current(m) });
    if (!res.ok) {
      setAnnounce(res.reason ?? "MIDI 输入没开起来，再试一次");
      return;
    }
    setMidiIn(true);
    setMidiDevs(res.devices);
    engineRef.current?.ensure(); // 连上外接键盘即唤醒 AudioContext，避免 ctx 仍 suspended 导致静音
    setAnnounce(
      res.devices.length > 0
        ? `MIDI 键盘就绪：${res.devices[0]}${res.devices.length > 1 ? ` 等 ${res.devices.length} 台` : ""}`
        : "MIDI 已连接，但还没看到设备——插好键盘再点一次",
    );
  }, [midiIn]);

  // 退出演示/练习：收定时器与下落渲染，回到关卡选择层（挑战模式内，不切出）；暂停态退出要先恢复引擎
  const chEndDemo = useCallback(() => {
    chStopTimers();
    if (chPausedRef.current) {
      engineRef.current?.resume();
      chPausedRef.current = false;
    }
    rendererRef.current?.setChallenge(false, null, null, 0);
    chModeRef.current = "race";
    setChMode("race");
    chScaleRef.current = 1;
    setPracticeScale(1);
    chLoopBarRef.current = false;
    setPracticeLoop(false);
    chStreakRef.current = 0;
    chPassMissRef.current = false;
    setPracticeHintBar(0);
    chFingeringRef.current = null;
    chFinBarRef.current = -1;
    chFinActiveRef.current = { L: -1, R: -1 };
    chBlkActiveRef.current = { L: -1, R: -1 };
    chWaitHoldRef.current = false; // 等待冻结随退练解除（引擎 resume 由退出流程统一做）
    setPracticeFinSeq({ L: [], R: [] });
    setPracticeFinActive({ L: -1, R: -1 });
    chSetPhase("select");
    setAnnounce("已退出辅助模式，回到关卡选择");
  }, [chSetPhase, chStopTimers]);

  // 逐小节跳转（演示/练习共用）：直接平移谱面 0 点锚（chStartRef ∓ barSec，songTime 瞬时平移，仍同一权威时钟），
  // 随后经 chRebuildCursor 重建消费游标：新 songTime 之前的音静默跳过，小节头音可被重弹/自动演奏。
  // 练习 barSec 随倍速拉伸；跳转把循环锚带到新小节头。不强制改变当前暂停/播放态。
  const chDemoJumpBar = useCallback(
    (dir: -1 | 1) => {
      if (chModeRef.current === "race" || chModeRef.current === "survival") return;
      const engine = engineRef.current;
      if (!engine) return;
      const lv = chLevels()[chLevelRef.current];
      if (!lv) return;
      const bs = barSecFor(lv.bpm) * (chModeRef.current === "practice" ? chScaleRef.current : 1);
      if (chWaitHoldRef.current) {
        chWaitHoldRef.current = false; // 等待冻结中跳节 = 解除冻结继续走（跳完按新位置重新判定是否再等）
        engine.resume();
      }
      chStartRef.current -= dir * bs; // →下一小节：songTime 前进 barSec；←上一小节：后退
      const st = engine.currentTime - chStartRef.current;
      chRebuildCursor(st);
      chLoopAnchorRef.current = Math.max(0, Math.floor(st / bs));
      // 换小节：全中连击与练顺提示复位（提示条也因按 → 到达"消失"语义）；指法行强制按新小节重算
      chStreakRef.current = 0;
      chPassMissRef.current = false;
      setPracticeHintBar(0);
      chFinBarRef.current = -1;
      const total = totalBarsOf(chNotesRef.current, bs);
      const bar = Math.max(1, Math.min(Math.floor(st / bs) + 1, total));
      setDemoBar(bar);
      setAnnounce(`已跳到第 ${bar} / ${total} 小节`);
    },
    [chRebuildCursor],
  );

  // 空格：选关页快速开始最新解锁关；游玩中（含演示）= 暂停（引擎挂起，音符与声音同步冻结）/ 继续；
  // 演示退出一律走「结束演示」按钮（旧「空格退出演示」语义已改）
  const chSpace = useCallback(() => {
    const ph = chPhaseRef.current;
    if (ph === "select") {
      chStartLevel(Math.max(0, chProgressRef.current.unlocked - 1));
    } else if (ph === "play") {
      engineRef.current?.suspend();
      chPausedRef.current = true;
      chSetPhase("paused");
      setAnnounce(
        chModeRef.current === "demo"
          ? "演示已暂停"
          : chModeRef.current === "practice"
            ? "练习已暂停"
            : "已暂停",
      );
    } else if (ph === "paused") {
      chPausedRef.current = false;
      chWaitHoldRef.current = false; // 手动继续 = 解除等待冻结标记（未弹上则下个 tick 按等待规则再冻）
      engineRef.current?.resume();
      chSetPhase("play");
      setAnnounce(
        chModeRef.current === "demo"
          ? "演示已继续"
          : chModeRef.current === "practice"
            ? "练习已继续"
            : "已继续",
      );
    }
  }, [chSetPhase, chStartLevel]);

  // 进入挑战：强制背景钢琴层（判定区），HUD 背景开关随之隐藏
  const chEnterCore = useCallback(() => {
    rendererRef.current?.setCompose(false);
    rendererRef.current?.setPianoBg(true);
    setPianoBgOn(true);
    chStopTimers();
    setChResult(null);
    setChallengeScore(0);
    setComboCount(0);
    chModeRef.current = "race";
    setChMode("race");
    chSetPhase("select");
    loadCustomLevels(); // 顺手拉全站热门自定义关卡（选关页「热门自定义」区）
    setAnnounce("进入挑战模式：选择关卡，空格或点击卡片开始");
  }, [chSetPhase, chStopTimers, loadCustomLevels]);

  // 离开挑战：收定时器、恢复暂停态音频、恢复进入前的背景钢琴偏好
  const chLeaveCore = useCallback(() => {
    chStopTimers();
    if (chPausedRef.current || chWaitHoldRef.current) {
      // 等待冻结同样挂起过引擎（未记入 chPausedRef），退出时必须一并唤醒
      engineRef.current?.resume();
      chWaitHoldRef.current = false;
      chPausedRef.current = false;
    }
    rendererRef.current?.setChallenge(false, null, null, 0);
    const pianoKeep = pianoBgRef.current && typingModeRef.current === "piano";
    rendererRef.current?.setPianoBg(pianoKeep);
    setPianoBgOn(pianoKeep);
    setChResult(null);
    chModeRef.current = "race";
    setChMode("race");
    setActiveCustomLevel(null); // 当局自定义关身份随离开挑战清除（HUD 关卡位回落）
  }, [chStopTimers]);

  // Tab 三态循环：演奏 → 作曲 → 挑战 → 演奏
  const cycleMode = useCallback(() => {
    const cur = modeRef.current;
    const next = cur === "perform" ? "compose" : cur === "compose" ? "challenge" : "perform";
    if (cur === "challenge") chLeaveCore();
    modeRef.current = next;
    setMode(next);
    rendererRef.current?.setCompose(next === "compose");
    if (next === "compose") enterComposeFx();
    else if (next === "challenge") chEnterCore();
    else setAnnounce("进入演奏模式");
  }, [chEnterCore, chLeaveCore, enterComposeFx]);

  // M 保持演奏 ↔ 作曲快切；挑战模式下 M 退出回演奏
  const toggleABMode = useCallback(() => {
    const cur = modeRef.current;
    if (cur === "challenge") {
      chLeaveCore();
      modeRef.current = "perform";
      setMode("perform");
      goPerformCore();
      return;
    }
    const next = cur === "perform" ? "compose" : "perform";
    modeRef.current = next;
    setMode(next);
    rendererRef.current?.setCompose(next === "compose");
    if (next === "compose") enterComposeFx();
    else setAnnounce("进入演奏模式");
  }, [chLeaveCore, enterComposeFx, goPerformCore]);

  // HUD「挑战」chip 一键直达
  const jumpToChallenge = useCallback(() => {
    if (modeRef.current === "challenge") return;
    if (modeRef.current === "compose") rendererRef.current?.setCompose(false);
    modeRef.current = "challenge";
    setMode("challenge");
    chEnterCore();
  }, [chEnterCore]);

  // 结算「重来 / 再来一局」：生存当局重新倒计时开一局（每日局沿用当天种子重开同一谱面），常规关重跑本关
  const chRetry = useCallback(() => {
    if (chModeRef.current === "survival") chStartSurvival(chSurvDailyRef.current);
    else chStartLevel(chLevelRef.current);
  }, [chStartLevel, chStartSurvival]);
  // 结算「分享演奏」：把本局命中事件编成回放链接，复用分享浮层（访客打开自动演奏）
  const chSharePerformance = useCallback(() => {
    if (!chPerfUrlRef.current) {
      setAnnounce("本局命中太少，没能生成回放链接");
      return;
    }
    setShareUrl(chPerfUrlRef.current);
    setShareOpen(true);
  }, []);
  // 导入文本谱 → 编译成追加的自定义关卡并直接开玩（lead = 半个下落时长，与公版关同量级）
  const startCustomChart = useCallback(
    (name: string, bpm: number, seq: [number, number][]) => {
      const fall = fallSecFor(bpm);
      const lv: ChallengeLevel = {
        id: "custom",
        name: name.trim() || "自定义乐谱",
        song: "自定义谱面",
        bpm,
        fall,
        desc: `导入 · ${seq.length} 音符`,
        notes: chartByBeats(bpm, Math.max(0.8, fall / 2), seq),
      };
      customLevelRef.current = lv;
      setCustomLevel(lv);
      setActiveCustomLevel(null); // 导入谱开玩顶掉当局 UGC 身份（HUD 关卡位显示本谱而非旧曲名）
      setChartEditorOpen(false);
      chStartLevel(CHALLENGE_LEVELS.length, "race");
    },
    [chStartLevel],
  );
  // ---- UGC 发布 / 游玩 / ?lid= 直达 ----
  // 统一发布入口：谱先归零起点、自动评级，浮出预览（曲名可改）等确认；空谱直接温和播报不弹层
  const beginPublishUgc = useCallback(
    (rawNotes: ChartNote[], srcBpm: number, defaultTitle: string) => {
      if (rawNotes.length === 0) {
        setAnnounce("这份谱编译不出可弹的音，发布不了");
        return;
      }
      const sorted = [...rawNotes].sort((a, z) => a.t - z.t);
      const zeroed = sorted.map((n) => ({ ...n, t: Math.max(0, n.t - sorted[0].t) }));
      const rate = rateChart(zeroed, srcBpm);
      setUgcPreview({
        notes: zeroed,
        title: defaultTitle.trim().slice(0, 40) || "我的旋律",
        dur: zeroed[zeroed.length - 1].t,
        ...rate,
      });
    },
    [],
  );
  // 「从我的画布出关」：画布（循环线 + 锚点）按当前 BPM/音阶编译成下落谱
  const publishFromCanvas = useCallback(() => {
    const objs = objectsRef.current;
    if (objs.length === 0) {
      setAnnounce("画布还是空的——先画几条线或落几个锚点，再把它出成关卡");
      return;
    }
    const r = canvasToChart(objs, bpmRef.current, scaleRef.current);
    if (r.notes.length === 0) {
      setAnnounce("画布编译不出琴键范围内的音——线条可能都落在音域外了");
      return;
    }
    if (r.truncated) setAnnounce(`画布谱超过 320 音上限，已截取前 320 音发布`);
    beginPublishUgc(r.notes, bpmRef.current, "我的旋律");
  }, [beginPublishUgc]);
  // 谱架「发布成关卡」：复用与画布出关完全相同的预览→发布流程（先收谱架浮层，预览浮层才不被盖住）
  const publishCustomChart = useCallback(
    (name: string, bpm: number, seq: [number, number][]) => {
      const notes = chartByBeats(bpm, 0, seq);
      if (notes.length === 0) {
        setAnnounce(`《${name}》编译不出可弹的音，发布不了`);
        return;
      }
      setChartEditorOpen(false);
      beginPublishUgc(notes, bpm, name);
    },
    [beginPublishUgc],
  );
  const confirmUgcPublish = useCallback(async () => {
    const pv = ugcPreview;
    if (!pv || ugcBusy) return; // 请求在途 = 防连点
    setUgcBusy(true);
    const code = encodeChartLevel(pv.notes, pv.bpm);
    if (!code) {
      setUgcBusy(false);
      setUgcPreview(null);
      setAnnounce("关卡编码失败——谱面数据异常，没发布成关卡");
      return;
    }
    const title = pv.title.trim().slice(0, 40) || "我的旋律";
    const id = await publishLevel({
      title,
      code,
      bpm: pv.bpm,
      stars: pv.stars,
      notes: pv.notes.length,
      nick: displayNick(),
    });
    setUgcBusy(false);
    if (!id) {
      setAnnounce("发布失败——网络不可用，稍后再试");
      return;
    }
    setUgcPreview(null);
    const item: LevelItem = {
      id,
      title,
      code: "",
      bpm: pv.bpm,
      stars: pv.stars,
      notes: pv.notes.length,
      nick: displayNick(),
      plays: 0,
    };
    setCustomLevels((prev) => [item, ...(prev ?? []).filter((x) => x.id !== id)].slice(0, 10));
    setAnnounce(`《${title}》已发布成关卡，热门榜可见——点卡片上的分享邀朋友来弹`);
  }, [ugcPreview, ugcBusy]);
  // 开打一张自定义关：解码 → 重建自带参数的关卡塞进追加位 → plays 尽力回写 → 直接倒计时
  // asDemo=true：试听——复用演示自动演奏看一遍整关，不计游玩数（plays 不 +1 不回写）
  const playCustomLevel = useCallback(
    (lv: LevelItem, asDemo = false) => {
      const dec = decodeChartLevel(lv.code);
      if (!dec) {
        setAnnounce("这个关卡的谱面数据已损坏，打不开——换一张试试");
        return;
      }
      const rate = rateChart(dec.notes, dec.bpm);
      const lead = Math.max(0.8, rate.fall / 2);
      const built: ChallengeLevel = {
        id: `ugc:${lv.id}`,
        name: lv.title || "自定义关卡",
        song: "玩家关卡",
        bpm: dec.bpm,
        fall: rate.fall,
        desc: `玩家发布 · ${dec.notes.length} 音符 · ★${rate.stars}`,
        notes: dec.notes.map((n) => ({ ...n, t: n.t + lead })),
        pw: rate.pw,
        gw: rate.gw,
        stars: rate.stars,
      };
      customLevelRef.current = built;
      setCustomLevel(built);
      setActiveCustomLevel({ title: built.name, stars: rate.stars });
      if (!asDemo) {
        patchLevelPlays(lv.id, (lv.plays ?? 0) + 1); // 尽力回写，失败静默
        setCustomLevels((prev) =>
          prev ? prev.map((x) => (x.id === lv.id ? { ...x, plays: (x.plays ?? 0) + 1 } : x)) : prev,
        );
      }
      chStartLevel(CHALLENGE_LEVELS.length, asDemo ? "demo" : "race");
    },
    [chStartLevel],
  );
  // ?lid= 直达：拉到关卡后引擎就绪即自动进挑战并开打（与 ?score=/?canvas= 互斥，优先级最低）
  const lidLevelRef = useRef<LevelItem | null>(null);
  const openLidLevel = useCallback(() => {
    const lv = lidLevelRef.current;
    if (!lv || !engineRef.current) return;
    lidLevelRef.current = null;
    if (modeRef.current !== "challenge") jumpToChallenge();
    playCustomLevel(lv);
  }, [jumpToChallenge, playCustomLevel]);
  useEffect(() => {
    const lid = new URLSearchParams(window.location.search).get("lid");
    if (!lid) return;
    if (scoreParamFromUrl() || canvasParamFromUrl()) return; // 曲谱参数优先，lid 最低
    findLevelById(lid).then((lv) => {
      if (!lv) {
        setAnnounce("没找到这个自定义关卡——可能已被删掉，在选关页挑一张玩的吧");
        return;
      }
      lidLevelRef.current = lv;
      openLidLevel(); // 引擎已就绪立刻开打；未就绪由「开始」按钮补开
    });
  }, [openLidLevel]);
  const chNextLevel = useCallback(() => chStartLevel(chLevelRef.current + 1), [chStartLevel]);
  // 结算面板「看演示」/「慢速练习本关」：重跑本关为演示/练习（复用同一 chStartLevel 流程，1× 起）
  const chWatchDemo = useCallback(() => chStartLevel(chLevelRef.current, "demo"), [chStartLevel]);
  const chPracticeThisLevel = useCallback(
    () => chStartLevel(chLevelRef.current, "practice"),
    [chStartLevel],
  );
  // 练习变速（0.5/0.75/1）：按新倍率重建谱面与下落参数，锚点落回当前小节的小节头，judged 全复位重游
  const chSetPracticeScale = useCallback(
    (next: number) => {
      if (chModeRef.current !== "practice") return;
      const engine = engineRef.current;
      if (!engine) return;
      const lv = chLevels()[chLevelRef.current];
      if (!lv) return;
      const barBase = barSecFor(lv.bpm);
      const st = engine.currentTime - chStartRef.current;
      const B = Math.max(0, Math.floor(st / (barBase * chScaleRef.current))); // 当前小节（0 起）
      chScaleRef.current = next;
      setPracticeScale(next);
      chNotesRef.current = lv.notes.map((n) => ({ ...n, t: n.t * next, judged: false }));
      chStartRef.current = engine.currentTime - B * barBase * next; // 重锚：songTime 恰落在第 B+1 小节小节头
      chIdxRef.current = 0;
      chLoopAnchorRef.current = B;
      chStreakRef.current = 0;
      chPassMissRef.current = false;
      setPracticeHintBar(0); // 变速重游谱面，连击与提示复位
      chFingeringRef.current = chApplyFinOverrides(annotateFingering(chNotesRef.current)); // 指法只看键位、本不随倍率变，随重建重算保持索引对齐（含手动覆盖）
      chClickBeatRef.current = -1e9; // 变速后拍号落在新时间域，置哨兵从下一个整拍重新跟
      chFinBarRef.current = -1;
      if (chWaitHoldRef.current) {
        chWaitHoldRef.current = false; // 变速重建谱面后解除等待冻结，按新时间域重新判定（仍等待则下个 tick 再冻）
        engine.resume();
      }
      rendererRef.current?.setChallenge(
        true,
        chNotesRef.current,
        chSongTime,
        lv.fall * next,
        (60 / lv.bpm) * next, // 拍格线间距随倍速：网格与音符保持同一时间域
        fingeringOnRef.current ? chFingeringRef.current : undefined,
      );
      setDemoBar(B + 1);
      setAnnounce(`练习速度 ${Math.round(next * 100)}%，已回到第 ${B + 1} 小节小节头`);
    },
    [chSongTime],
  );
  // 循环本小节：开启时锚定当下正在的小节，tick 越过末小节线自动回卷小节头重跑
  const chTogglePracticeLoop = useCallback(() => {
    const on = !chLoopBarRef.current;
    chLoopBarRef.current = on;
    setPracticeLoop(on);
    chStreakRef.current = 0; // 循环开关即换统计语境：连击与提示复位
    chPassMissRef.current = false;
    setPracticeHintBar(0);
    const engine = engineRef.current;
    const lv = chLevels()[chLevelRef.current];
    if (engine && lv) {
      const bs = barSecFor(lv.bpm) * chScaleRef.current;
      chLoopAnchorRef.current = Math.max(
        0,
        Math.floor((engine.currentTime - chStartRef.current) / bs),
      );
    }
    setAnnounce(on ? "已开启循环本小节" : "已关闭循环本小节");
  }, []);
  // 练习「节拍器」开关：开 = 从下一个整拍开始跟打四分 click（小节头重拍）；本会话记住开关态
  const chTogglePracticeClick = useCallback(() => {
    const on = !practiceClickRef.current;
    practiceClickRef.current = on;
    setPracticeClick(on);
    chClickBeatRef.current = -1e9; // 开关当下对齐到下一个整拍再响，避免半截拍抢点
    setAnnounce(on ? "节拍器已开启" : "节拍器已关闭");
  }, []);
  // 练习「等待模式」开关：开 = 下一个音到判定线没弹上就冻结，弹对才走；关 = 恢复常速行进（若正冻结则立刻唤醒）
  const chTogglePracticeWait = useCallback(() => {
    const on = !chWaitRef.current;
    chWaitRef.current = on;
    setPracticeWait(on);
    if (!on && chWaitHoldRef.current) {
      chWaitHoldRef.current = false;
      engineRef.current?.resume();
    }
    setAnnounce(on ? "等待模式已开启：弹对才继续" : "等待模式已关闭");
  }, []);
  // 练习「自动跳节」开关：开 = 同一小节连续两遍全中后直接自动进入下一小节（替代提示条）；关 = 手动「按 →」语义
  const chTogglePracticeAutoNext = useCallback(() => {
    const on = !chAutoNextRef.current;
    chAutoNextRef.current = on;
    setPracticeAutoNext(on);
    if (on) setPracticeHintBar(0); // 开启当下收起已浮出的提示条，后续改走自动跳
    setAnnounce(on ? "已开启练顺自动跳下一小节" : "已关闭自动跳节，练顺后按 → 手动跳");
  }, []);
  // 练习「指法」开关：关 = 下落块指法小字与控制条指法行同时隐藏；开 = 立即重建下落层数据恢复标注
  const chToggleFingering = useCallback(() => {
    const on = !fingeringOnRef.current;
    fingeringOnRef.current = on;
    setFingeringOn(on);
    chFinBarRef.current = -1;
    chFinActiveRef.current = { L: -1, R: -1 };
    setPracticeFinActive({ L: -1, R: -1 });
    chBlkActiveRef.current = { L: -1, R: -1 };
    rendererRef.current?.setChallengeActive(-1, -1); // 关 = 块面描边同时撤（tick 停更，需显式清）；开 = 下个 tick 重推
    if (!on) setPracticeFinSeq({ L: [], R: [] });
    if (chModeRef.current !== "practice") return;
    const lv = chLevels()[chLevelRef.current];
    if (!lv) return;
    rendererRef.current?.setChallenge(
      true,
      chNotesRef.current,
      chSongTime,
      lv.fall * chScaleRef.current,
      (60 / lv.bpm) * chScaleRef.current,
      on ? chFingeringRef.current : undefined,
    );
  }, [chSongTime]);
  // 点击指法 chip = 给该音换指（右1→…→左5→自动 循环）：写覆盖表 + 持久化，
  // 指法表整表重算（控制条 chip 行 + 下落块小字同步），当前小节指法行强制重算
  const chCycleFingering = useCallback(
    (noteIdx: number) => {
      if (chModeRef.current !== "practice") return;
      const base = annotateFingering(chNotesRef.current);
      const marks = chApplyFinOverrides(base);
      const cur = marks[noteIdx];
      if (!cur) return;
      let pos = CH_FIN_CYCLE.findIndex(
        (m) => m !== null && m.hand === cur.hand && m.finger === cur.finger,
      );
      if (pos < 0) pos = 0;
      const nxt = CH_FIN_CYCLE[(pos + 1) % CH_FIN_CYCLE.length];
      const key = `${chLevelRef.current}:${noteIdx}`;
      const ov = chFinOvRef.current;
      if (nxt) {
        ov[key] = nxt;
        marks[noteIdx] = nxt;
        setAnnounce(`该音指法改为${nxt.hand === "R" ? "右" : "左"}手 ${nxt.finger} 指`);
      } else {
        delete ov[key];
        marks[noteIdx] = base[noteIdx];
        setAnnounce("该音指法已恢复自动建议");
      }
      try {
        localStorage.setItem(FIN_OV_KEY, JSON.stringify(ov));
      } catch {
        /* 隐私模式等写失败 = 本会话内生效，不阻断 */
      }
      chFingeringRef.current = marks;
      chFinBarRef.current = -1; // 当前小节 chip 行强制重算
      const lv = chLevels()[chLevelRef.current];
      if (lv) {
        rendererRef.current?.setChallenge(
          true,
          chNotesRef.current,
          chSongTime,
          lv.fall * chScaleRef.current,
          (60 / lv.bpm) * chScaleRef.current,
          fingeringOnRef.current ? marks : undefined,
        );
      }
    },
    [chApplyFinOverrides, chSongTime],
  );
  // 重置本关全部手动微调：删掉该关所有覆盖条目并持久化，指法表回落纯启发式建议
  const chResetFinOverrides = useCallback(() => {
    if (chModeRef.current !== "practice") return;
    const pre = `${chLevelRef.current}:`;
    const ov = chFinOvRef.current;
    let n = 0;
    for (const k in ov) {
      if (k.startsWith(pre)) {
        delete ov[k];
        n += 1;
      }
    }
    if (n === 0) return;
    try {
      localStorage.setItem(FIN_OV_KEY, JSON.stringify(ov));
    } catch {
      /* 写失败 = 本会话内生效 */
    }
    chFingeringRef.current = annotateFingering(chNotesRef.current);
    chFinBarRef.current = -1; // 控制条 chip 行强制重算
    const lv = chLevels()[chLevelRef.current];
    if (lv) {
      rendererRef.current?.setChallenge(
        true,
        chNotesRef.current,
        chSongTime,
        lv.fall * chScaleRef.current,
        (60 / lv.bpm) * chScaleRef.current,
        fingeringOnRef.current ? chFingeringRef.current : undefined,
      );
    }
    setAnnounce(`已重置本关 ${n} 处自定义指法，全部恢复自动建议`);
  }, [chSongTime]);
  const exitChallenge = useCallback(() => {
    chLeaveCore();
    modeRef.current = "perform";
    setMode("perform");
    goPerformCore();
  }, [chLeaveCore, goPerformCore]);

  const deleteSelected = useCallback(() => {
    if (guardRo()) return;
    const id = selectedRef.current;
    if (!id) return;
    if (isRelayLocked(id)) {
      setAnnounce("接龙态：前人的乐句是锁定的，只能删自己这一棒新画的");
      return;
    }
    pushHistory("op", "删除乐句");
    objectsRef.current = objectsRef.current.filter((o) => o.id !== id);
    selectedRef.current = null;
    setSelectedId(null);
    setAnnounce("已删除选中乐句");
    commitCanvas();
  }, [commitCanvas, pushHistory, guardRo, isRelayLocked]);

  const duplicateSelected = useCallback(() => {
    if (guardRo()) return;
    const id = selectedRef.current;
    if (!id) return;
    if (isRelayLocked(id)) return; // 接龙态：前人乐句不可复制派生
    const src = objectsRef.current.find((o) => o.id === id);
    if (!src) return;
    if (objectsRef.current.length >= MAX_CANVAS_OBJECTS) {
      flashCap();
      return;
    }
    const clone = duplicateObject(src);
    clone.points = clone.points.map((p) => ({ ...p, x: clamp(p.x + 0.02, -0.05, 1.05) }));
    refreshAudio(clone, bandDegs(scaleRef.current));
    if (relayLedgerRef.current && clone.type === "stroke") clone.audio.loopBeats = 4; // 接龙本棒段锁 4 拍
    pushHistory("op", src.type === "curve" ? `复制${src.curveParam ? CURVE_PARAM_META[src.curveParam].name : ""}曲线` : "复制乐句");
    objectsRef.current.push(clone);
    commitCanvas();
    selectObject(clone);
    if (clone.type === "curve" && clone.curveParam) {
      setAnnounce(`已复制${CURVE_PARAM_META[clone.curveParam].name}曲线，副本已横向错开一点`);
    }
  }, [commitCanvas, flashCap, selectObject, pushHistory, guardRo, isRelayLocked]);

  const moveSelected = useCallback(
    (dx: number, dy: number) => {
      if (guardRo()) return;
      const id = selectedRef.current;
      if (!id) return;
      if (isRelayLocked(id)) return; // 接龙态：方向键只挪得动本棒新对象
      const obj = objectsRef.current.find((o) => o.id === id);
      if (!obj) return;
      pushHistory("nudge", "移动乐句");
      shiftObject(obj, dx, dy, bandDegs(scaleRef.current));
      if (relayLedgerRef.current && obj.type === "stroke") obj.audio.loopBeats = 4; // 接龙本棒段锁 4 拍
      setObjectsVersion((v) => v + 1);
      saveCanvasObjects(objectsRef.current);
      syncCanvasLoops();
      if (obj.type === "curve") {
        setAnnounce(
          `已挪动${obj.curveParam ? CURVE_PARAM_META[obj.curveParam].name : ""}曲线：横向=时间，上下=参数值`,
        );
        return;
      }
      const deg = obj.audio.pitchCurve[0] ?? 0;
      setAnnounce(describeDeg(scaleRef.current, deg, obj.audio.velocityCurve[0] ?? 0.5));
    },
    [syncCanvasLoops, pushHistory, guardRo, isRelayLocked],
  );

  const onClearCanvas = useCallback(() => {
    if (guardRo()) return;
    pushHistory("op", "清空画布");
    if (relayLedgerRef.current) {
      // 接龙态：只清本棒新增（前人锁定前缀整段保留）——「清空」不许抹掉别人的接力段
      objectsRef.current = objectsRef.current.slice(0, relayLockNow());
      setAnnounce("接龙态：只清掉了你这一棒的乐句，前人的都还在");
    } else {
      objectsRef.current = [];
      setAnnounce("画布已清空");
    }
    selectedRef.current = null;
    setSelectedId(null);
    commitCanvas();
  }, [commitCanvas, pushHistory, guardRo, relayLockNow]);

  const onTogglePad = useCallback(() => {
    const next = !padOnRef.current;
    padOnRef.current = next;
    setPadOn(next);
    const engine = engineRef.current;
    if (!engine) return;
    if (next) {
      if (engine.isActive) engine.startPad(padRootFreq(scaleRef.current));
    } else {
      engine.stopPad();
    }
    setAnnounce(next ? "环境垫音开" : "环境垫音关");
  }, []);

  // 音阶/音色是全局状态：演奏与作曲共用，作曲对象音高曲线按当前音阶重编译
  const applyScale = useCallback(
    (next: Scale, withAnnounce: boolean) => {
      if (next.id === scaleRef.current.id) return;
      const fromScale = scaleRef.current;
      const fromRange = bandRange(fromScale);
      scaleRef.current = next;
      setScaleId(next.id);
      engineRef.current?.setScale(next);
      const toRange = bandRange(next);
      rendererRef.current?.setScaleDegs(toRange.degs);
      // 旧音符保原音高：各点按实际音高重挂到新音阶在画布大区内的最近合法音级，之后新画的线才用新音阶
      for (const o of objectsRef.current) {
        o.audio.pitchCurve = o.audio.pitchCurve.map((d) =>
          clamp(retuneDegToBand(next, toRange, fromScale, fromRange.lo, d), 0, toRange.degs - 1),
        );
        if (o.roll && o.roll.length > 0) {
          o.roll = o.roll.map((rn) => ({
            ...rn,
            deg: clamp(retuneDegToBand(next, toRange, fromScale, fromRange.lo, rn.deg), 0, toRange.degs - 1),
          }));
        }
      }
      for (const o of objectsRef.current) refreshAudio(o, toRange.degs);
      if (objectsRef.current.length > 0) commitCanvas();
      setPitchLabelLive(`${next.name} · C 宫调`);
      if (withAnnounce) setAnnounce(`音阶：${next.name}（旧音符保持原音高）`);
    },
    [commitCanvas],
  );

  const cycleScale = useCallback(() => {
    applyScale(SCALES[(scaleIndexOf(scaleRef.current.id) + 1) % SCALES.length], true);
  }, [applyScale]);

  const selectScaleIndex = useCallback(
    (i: number) => {
      const s = SCALES[i];
      if (s) applyScale(s, true);
    },
    [applyScale],
  );

  // 音色统一切换入口：custom 的渲染层视觉档映射成 lead（自造不新配色）；选中自造时同步灌补丁
  const applyVoiceId = useCallback((id: string) => {
    const hit = voiceById(id);
    voiceRef.current = hit.id;
    setVoiceId(hit.id);
    const engine = engineRef.current;
    engine?.setVoice(hit.id);
    if (hit.id === "custom") engine?.setSynthPatch(synthPatchRef.current);
    rendererRef.current?.setVoiceStyle(hit.id === "custom" ? "lead" : hit.id);
  }, []);

  // T 循环只在预设音色里转，「自造」不进循环（只能从 HUD 音色菜单显式进入，防误切）
  const cycleVoice = useCallback(() => {
    const pool = VOICES.filter((x) => x.id !== "custom");
    const at = pool.findIndex((x) => x.id === voiceRef.current);
    const next = pool[(at + 1 + pool.length) % pool.length];
    applyVoiceId(next.id);
    setAnnounce(`音色：${next.name}`);
  }, [applyVoiceId]);

  // ---- 音色编辑器（简化合成器面板）----
  const onSynthChange = useCallback((next: SynthPatch) => {
    synthPatchRef.current = next;
    setSynthPatchState(next);
    engineRef.current?.setSynthPatch(next);
    saveSynthPatch(next);
  }, []);

  const onOpenSynth = useCallback(() => {
    setSynthOpen(true);
    // 打开面板即选中「自造」：现场拧参数当场就能听见
    applyVoiceId("custom");
  }, [applyVoiceId]);

  const onCloseSynth = useCallback(() => setSynthOpen(false), []);

  const onSynthAudition = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const beat = 60 / bpmRef.current;
    const t0 = engine.currentTime + 0.06;
    engine.playNote(7, 0.85, cutoffFromIdx(10), t0, 1.8, "custom");
    engine.playNote(11, 0.95, cutoffFromIdx(12), t0 + beat, 1.8, "custom");
  }, []);

  const onSynthReset = useCallback(() => {
    onSynthChange({ ...DEFAULT_SYNTH_PATCH });
    setAnnounce("自造音色已恢复出厂");
  }, [onSynthChange]);

  const onSynthTemplate = useCallback(
    (id: string) => {
      const tpl = SYNTH_TEMPLATES.find((x) => x.id === id);
      if (!tpl) return;
      onSynthChange({ ...tpl.patch });
      setAnnounce(`已载入起点模板：${tpl.name}`);
    },
    [onSynthChange],
  );

  const onPickVoice = useCallback(
    (id: string) => {
      applyVoiceId(id);
      setAnnounce(`音色：${voiceById(id).name}`);
    },
    [applyVoiceId],
  );

  // 鼓组风格包：只影响打字鼓组与循环回放里的鼓事件，旋律/颗粒/垫音不重编译
  const cycleDrumKit = useCallback(() => {
    const next = DRUM_KITS[(drumKitIndexOf(drumKitRef.current) + 1) % DRUM_KITS.length];
    drumKitRef.current = next.id;
    setDrumKitId(next.id);
    const engine = engineRef.current;
    engine?.setDrumKit(next.id);
    setAnnounce(`鼓：${next.name}`);
    // 切包即自动奏一小节示范（kick-hat-snare-hat-kick），让风格差异立刻可听
    if (engine) {
      const half = 30 / bpmRef.current; // 半拍秒数
      const demo: [DrumKind, number, number][] = [
        ["kick", 0.9, 0],
        ["hat", 0.7, 1],
        ["snare", 0.9, 2],
        ["hat", 0.7, 3],
        ["kick", 0.75, 4],
      ];
      const t0 = engine.currentTime + 0.08;
      for (const [kind, vel, step] of demo) {
        engine.playDrum(kind, vel, t0 + step * half);
      }
    }
  }, []);

  // 指挥建议一键上台：ConductorPanel 从指挥回复末尾解析出「stage 指令块」回传这里统一执行。
  // 值允许中文菜单名或英文 id；scale/voice/drum/timbre/bpm/octave 之外静默忽略；返回真正生效的条数。
  const applyConductorHints = useCallback(
    (hints: Record<string, string | number>) => {
      const applied: string[] = [];
      const s = hints.scale;
      if (typeof s === "string") {
        const hit = SCALES.find((x) => x.id === s || x.name === s);
        if (hit && hit.id !== scaleRef.current.id) {
          applyScale(hit, false);
          applied.push(`音阶 ${hit.name}`);
        }
      }
      const v = hints.voice;
      if (typeof v === "string") {
        const hit = VOICES.find((x) => x.id === v || x.name === v);
        if (hit) {
          applyVoiceId(hit.id);
          applied.push(`音色 ${hit.name}`);
        }
      }
      const d = hints.drum;
      if (typeof d === "string") {
        const hit = DRUM_KITS.find((x) => x.id === d || x.name === d);
        if (hit) {
          drumKitRef.current = hit.id;
          setDrumKitId(hit.id);
          engineRef.current?.setDrumKit(hit.id);
          applied.push(`鼓 ${hit.name}`);
        }
      }
      if (typeof hints.bpm === "number" && Number.isFinite(hints.bpm)) {
        const target = clamp(Math.round(hints.bpm), 40, 240);
        if (target !== bpmRef.current) {
          setBpmValue(target);
          applied.push(`BPM ${target}`);
        }
      }
      const t = hints.timbre;
      if (typeof t === "string") {
        const hit = (["off", "auto", "glass", "pluck", "lead"] as TimbreMode[]).find((x) => x === t);
        if (hit && hit !== timbreRef.current) {
          setTimbre(hit);
          applied.push(hit === "off" ? "动色关" : `动色 ${hit === "auto" ? "自动" : voiceById(hit).name}`);
        }
      }
      setAnnounce(
        applied.length > 0 ? `指挥的建议已上台：${applied.join(" · ")}` : "这条建议不用换设置，照着手感来就行",
      );
      return applied.length;
    },
    [applyScale, setBpmValue, setTimbre, applyVoiceId],
  );

  // 指挥逐项确认/撤销用：当前可上台设置的快照（键与 stage 块同名），
  // 面板在应用每条建议前取一份，撤销 = 把快照里该键的旧值再 apply 回去
  const conductorSnapshot = useCallback(
    () =>
      ({
        scale: scaleRef.current.id,
        voice: voiceRef.current,
        drum: drumKitRef.current,
        bpm: bpmRef.current,
        timbre: timbreRef.current,
      }) as Record<string, string | number>,
    [],
  );

  // 画布体检摘要：把作曲画布压成指挥读得懂的短文本（「画布挑毛病」按钮的隐藏上下文，用户气泡只显示一句话）
  const canvasCritiqueBrief = useCallback(() => {
    const objs = objectsRef.current;
    const strokes = objs.filter((o) => o.type === "stroke").length;
    const anchors = objs.filter((o) => o.type === "anchor").length;
    const curves = objs.filter((o) => o.type === "curve").length;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const yWord = (v: number) => (v < 0.34 ? "偏高音区" : v > 0.66 ? "偏低音区" : "中音区");
    const t = timbreRef.current;
    const lines: string[] = [];
    lines.push(
      `设置：音阶 ${scaleById(scaleRef.current.id).name} · 音色 ${voiceById(voiceRef.current).name} · 鼓 ${
        drumKitById(drumKitRef.current).name
      } · BPM ${bpmRef.current} · 画布音区 E2–C6 · 动色 ${
        t === "off" ? "关" : t === "auto" ? "自动" : `锁定 ${voiceById(t).name}`
      } · 垫音 ${padOnRef.current ? "开" : "关"}`,
    );
    lines.push(
      `对象：${strokes} 条线、${anchors} 个锚点${curves > 0 ? `、${curves} 条参数曲线（只改音量/滤波/声像/混响，不发音）` : ""}`,
    );
    objs.forEach((o, i) => {
      const x0 = o.points[0]?.x ?? 0;
      const x1 = o.points[o.points.length - 1]?.x ?? x0;
      const vel =
        o.audio.velocityCurve.reduce((a, b) => a + b, 0) / (o.audio.velocityCurve.length || 1);
      if (o.type === "curve") {
        const vs = o.points.map((p) => 1 - p.y);
        lines.push(
          `曲线${i + 1}（${o.curveParam ? CURVE_PARAM_META[o.curveParam].name : "?"}）：横向占 ${pct(
            Math.min(x0, x1),
          )}→${pct(Math.max(x0, x1))}，参数值从 ${pct(vs[0] ?? 0.5)} 到 ${pct(vs[vs.length - 1] ?? 0.5)}（上=大）`,
        );
        return;
      }
      if (o.type === "stroke") {
        const ys = o.points.map((p) => p.y);
        const first = ys[0] ?? 0.5;
        const last = ys[ys.length - 1] ?? first;
        const dir = last < first - 0.08 ? "上行" : last > first + 0.08 ? "下行" : "大致水平";
        lines.push(
          `线${i + 1}：横向占 ${pct(Math.min(x0, x1))}→${pct(Math.max(x0, x1))}，${dir}，音区 ${yWord(
            Math.min(...ys),
          )}～${yWord(Math.max(...ys))}，${o.audio.closed ? "闭合圈（琶音）" : "开口线"}，循环 ${o.audio.loopBeats.toFixed(
            1,
          )} 拍，平均力度 ${vel.toFixed(2)}`,
        );
      } else {
        lines.push(
          `锚点${i + 1}：横向 ${pct(x0)}，音高 ${describeDeg(scaleRef.current, o.audio.pitchCurve[0] ?? 0, vel)}`,
        );
      }
    });
    return `【画布现状】\n${lines.join("\n")}`;
  }, []);

  // 打字层玩法切换：鼓 ↔ 钢琴；切到钢琴默认开背景琴键，切回鼓自动隐藏；切走时强制松延音/弱音踏板防卡
  const cycleTypingMode = useCallback(() => {
    pressPedal(false);
    pressSoft(false);
    const next = nextTypingMode(typingModeRef.current);
    typingModeRef.current = next;
    setTypingMode(next);
    const piano = next === "piano";
    pianoBgRef.current = piano;
    setPianoBgOn(piano);
    rendererRef.current?.setPianoBg(piano);
    setAnnounce(`打字：${typingModeName(next)}`);
  }, [pressPedal, pressSoft]);

  // 公共画廊：拉最新 24 条；发布复用分享同款 canvas/t 编码；载入前压撤销栈可 ↶ 反悔
  const refreshGallery = useCallback(() => {
    void listWorks(24).then(setGalleryWorks);
  }, []);
  const onToggleGallery = useCallback(() => {
    setGalleryOpen((v) => {
      const next = !v;
      if (next) refreshGallery();
      return next;
    });
  }, [refreshGallery]);
  const onSaveNick = useCallback((name: string) => {
    const n = name.trim().slice(0, 24);
    setNick(n);
    setNickEdit(n);
    setAnnounce(n ? `昵称已改为 ${n}` : "昵称已清空，将署名匿名乐手");
  }, []);
  const publishCurrentWork = useCallback(
    (title: string) => {
      if (objectsRef.current.length === 0) {
        setAnnounce("画布是空的，先画点东西再发布");
        return;
      }
      const canvas = encodeCanvasObjects(objectsRef.current);
      const tcode = buildTParam(
        scaleRef.current.id,
        voiceRef.current,
        drumKitRef.current,
        typingModeRef.current,
      );
      // 接龙态发布：账本补完「含本棒」后随作品入库（存库不受传棒链接 1800 字符守护限制，
      // 画廊带走的是全曲；载入者续传撞超长时由传棒逻辑自己截）；本棒没画就不追加
      let relayCode: string | undefined;
      const ledger = relayLedgerRef.current;
      if (ledger) {
        const objs = objectsRef.current;
        let sum = 0;
        for (const l of ledger) sum += Math.max(0, Math.floor(l.k));
        const selfLeg = relaySelfLegRef.current;
        const base = selfLeg ? sum - Math.max(0, Math.floor(ledger[ledger.length - 1].k)) : sum;
        const mine = Math.max(0, objs.length - base);
        const done: RelayLeg[] = selfLeg
          ? [...ledger.slice(0, -1), { n: displayNick(), k: mine }]
          : mine > 0
            ? [...ledger, { n: displayNick(), k: mine }]
            : ledger;
        relayCode = encodeRelayParam(done);
      }
      void publishWork({
        title: title.trim().slice(0, 40) || "无名乐句",
        canvas,
        tcode,
        nick: displayNick(),
        relay: relayCode,
      }).then((ok) => {
        setAnnounce(
          ok
            ? relayCode
              ? "接力曲已发布到画廊（含各棒署名），别人从画廊点开就能续传"
              : "已发布到画廊"
            : "发布失败，稍后再试",
        );
        if (ok) refreshGallery();
      });
    },
    [refreshGallery],
  );
  const loadGalleryWork = useCallback(
    (item: WorkItem) => {
      if (relayLedgerRef.current) {
        setAnnounce("接龙态不能从画廊整盘载入作品——会把各棒归属打乱；先传棒再玩别的");
        return;
      }
      const mm = /^s(\d)v(\d)(?:k(\d))?(?:m(\d))?$/.exec(item.tcode || "");
      const scaleIdx = mm ? parseInt(mm[1], 10) : -1;
      const scale = scaleIdx >= 0 && scaleIdx < SCALES.length ? SCALES[scaleIdx] : scaleRef.current;
      const objs = decodeCanvasObjects(item.canvas, bandDegs(scale));
      if (objs.length === 0) {
        setAnnounce("这件作品载入失败");
        return;
      }
      pushHistory("op", `载入作品「${item.title}」`);
      objectsRef.current = objs;
      selectedRef.current = null;
      setSelectedId(null);
      if (scale.id !== scaleRef.current.id) applyScale(scale, false);
      const voiceIdx = mm ? parseInt(mm[2], 10) : -1;
      const voice = voiceIdx >= 0 && voiceIdx < VOICES.length ? VOICES[voiceIdx] : null;
      if (voice && voice.id !== voiceRef.current) applyVoiceId(voice.id);
      const kitIdx = mm && mm[3] ? parseInt(mm[3], 10) : -1;
      const kit = kitIdx >= 0 && kitIdx < DRUM_KITS.length ? DRUM_KITS[kitIdx] : null;
      if (kit && kit.id !== drumKitRef.current) {
        drumKitRef.current = kit.id;
        setDrumKitId(kit.id);
        engineRef.current?.setDrumKit(kit.id);
      }
      commitCanvas();
      const relayLedger = item.relay ? decodeRelayParam(item.relay) : null;
      if (relayLedger) {
        // 接力作品：载入即接过棒——前人锁定、本棒画自己的段落，与 ?relay= 链接同一套语义
        relaySelfLegRef.current = false;
        setRelayLedger(relayLedger);
        relaySoloRef.current = null;
        setRelaySoloLeg(null);
        setGuestCanvas(true);
        setAnnounce(
          `已从画廊接过接力棒「${item.title}」：你是第 ${relayLedger.length + 1} 棒（上棒 ${relayLedger[relayLedger.length - 1]?.n ?? "?"}）——前人的声音已就位，画一段你的再传`,
        );
      } else {
        setAnnounce(`已载入「${item.title}」，反悔按 Ctrl+Z`);
      }
    },
    [applyScale, commitCanvas, pushHistory, applyVoiceId],
  );

  // 背景钢琴开关（仅钢琴模式有意义）：钢琴键盘 ↔ 深海粒子
  const cyclePianoBg = useCallback(() => {
    const next = !pianoBgRef.current;
    pianoBgRef.current = next;
    setPianoBgOn(next);
    rendererRef.current?.setPianoBg(next && typingModeRef.current === "piano");
    setAnnounce(next ? "背景钢琴" : "背景深海");
  }, []);

  // 回放/循环里的钢琴事件 → 背景琴键按压动画（渲染层内部按开关门控）
  const pianoVisual = useCallback((ki: number, black: boolean, vel: number) => {
    rendererRef.current?.pressPianoKey(ki, black, vel);
  }, []);

  // 当前逻辑播放位置：播放中随引擎时钟推进（钳到总长），暂停时冻结在锚点
  const rtElapsed = useCallback(() => {
    const eng = engineRef.current;
    if (!eng || !rtPlayingRef.current) return rtOffsetRef.current;
    return Math.min(rtTotalRef.current, rtOffsetRef.current + (eng.currentTime - rtStartAbsRef.current));
  }, []);

  // 从 at 秒起排：停旧排程 → 丢弃越过锚点的音符、t 平移重排（复用引擎 lookahead 排程本体）
  const rtStartFrom = useCallback(
    (at: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      rtCancelRef.current?.();
      const shifted = rtEventsRef.current
        .filter((e) => e.t >= at)
        .map((e) => ({ ...e, t: e.t - at }));
      if (shifted.length === 0) {
        // 锚点已在最后一个音符之后：直接落到收尾态（可再从头播）
        rtPlayingRef.current = false;
        rtCancelRef.current = null;
        rtOffsetRef.current = rtTotalRef.current;
        setAutoScore(false);
        setReplayTimeline({ total: rtTotalRef.current, time: rtTotalRef.current, playing: false });
        return;
      }
      rtOffsetRef.current = at;
      rtStartAbsRef.current = engine.currentTime + 0.2; // 对齐 scheduleSequence 内部 base 起点
      rtPlayingRef.current = true;
      rtCancelRef.current = engine.scheduleSequence(shifted, {
        loop: false,
        onEnd: () => {
          rtPlayingRef.current = false;
          rtCancelRef.current = null;
          rtOffsetRef.current = rtTotalRef.current;
          setAutoScore(false);
          setReplayTimeline((prev) =>
            prev ? { ...prev, time: prev.total, playing: false } : prev,
          );
        },
        onPiano: pianoVisual,
      });
      setReplayTimeline({ total: rtTotalRef.current, time: at, playing: true });
    },
    [pianoVisual],
  );

  const startReplay = useCallback(() => {
    const engine = engineRef.current;
    const pending = pendingScoreRef.current;
    if (!engine || !pending) return;
    setBpm(pending.bpm);
    bpmRef.current = pending.bpm;
    setAutoScore(true);
    lsStop(); // 单一主排程位：访客谱自动回放接管，清掉循环台状态
    const sorted = [...pending.events].sort((a, b) => a.t - b.t);
    let last = 0;
    for (const e of sorted) last = Math.max(last, e.t);
    rtEventsRef.current = sorted;
    rtTotalRef.current = Math.max(1, last);
    rtStartFrom(0);
  }, [lsStop, rtStartFrom]);

  // 时间轴 seek：播放中 = 重建排程从落点续播；暂停中 = 只挪锚点（再播即从落点开始）
  const onReplaySeek = useCallback(
    (t: number) => {
      if (rtEventsRef.current.length === 0) return;
      const at = clamp(t, 0, rtTotalRef.current);
      if (rtPlayingRef.current) {
        rtStartFrom(at);
      } else {
        rtOffsetRef.current = at;
        setReplayTimeline((prev) => (prev ? { ...prev, time: at } : prev));
      }
    },
    [rtStartFrom],
  );

  const onReplayTogglePlay = useCallback(() => {
    if (rtEventsRef.current.length === 0) return;
    if (rtPlayingRef.current) {
      const cur = rtElapsed();
      rtCancelRef.current?.();
      rtCancelRef.current = null;
      rtPlayingRef.current = false;
      rtOffsetRef.current = cur;
      setReplayTimeline((prev) => (prev ? { ...prev, time: cur, playing: false } : prev));
    } else {
      // 已播完再按 = 从头再来
      if (rtOffsetRef.current >= rtTotalRef.current - 0.05) rtOffsetRef.current = 0;
      setAutoScore(true);
      rtStartFrom(rtOffsetRef.current);
    }
  }, [rtElapsed, rtStartFrom]);

  // 播放头实时跟随：不在 Logic 侧轮询 setState（80ms 一次的整页重渲染是卡顿源），
  // 由时间轴组件持有 replayGetTime 自己 rAF 直写 DOM；Logic 只在 起播/暂停/seek/播完 四处更新 state。

  const onStart = useCallback(() => {
    if (stageRef.current === "live") return;
    if (!engineRef.current) engineRef.current = new AudioEngine();
    engineRef.current.ensure();
    engineRef.current.setScale(scaleRef.current);
    engineRef.current.setVoice(voiceRef.current);
    engineRef.current.setSynthPatch(synthPatchRef.current); // 引擎刚建好：持久化自造补丁一次性灌上
    engineRef.current.setDrumKit(drumKitRef.current);
    syncFx(); // 引擎刚建好：把上次持久化的空间效果/音量一次性同步上去
    if (padOnRef.current) engineRef.current.startPad(padRootFreq(scaleRef.current));
    // 引擎新建时 effect 不会再跑，这里按当前模式补一次画布循环静音门控（挑战静音，见 roMode 段）
    engineRef.current.setCanvasMuted(modeRef.current === "challenge" && !roRef.current);
    engineRef.current.setCanvasPaused(accompPausedRef.current);
    syncCanvasLoops();
    rendererRef.current?.setPianoBg(pianoBgRef.current && typingModeRef.current === "piano");
    rendererRef.current?.centerBurst();
    stageRef.current = "live";
    setStage("live");
    if (pendingScoreRef.current) startReplay();
    openLidLevel(); // ?lid= 直达：引擎就绪的当下自动进挑战开打开卡关卡（无 lid 时零动作）
  }, [startReplay, syncCanvasLoops, syncFx, openLidLevel]);

  const stopRecording = useCallback(() => {
    const rec = recRef.current;
    if (!rec.active) return;
    rec.active = false;
    if (rec.timer) window.clearInterval(rec.timer);
    setRecActive(false);
    const engine = engineRef.current;
    const canvasCode = encodeCanvasObjects(objectsRef.current);
    const scoreCode = engine && rec.events.length > 0 ? encodeScore(rec.events, bpmRef.current) : "";
    if (engine && rec.events.length > 0) lastLoopRef.current = rec.events;
    // 自动入演奏历史（空录音/超体积不入，失败静默）
    if (appendRecHistory(rec.events, bpmRef.current) !== null) setRecHistory(listRecHistory());
    if (scoreCode || canvasCode) {
      setShareUrl(
        buildShareUrl(
          scoreCode || undefined,
          canvasCode || undefined,
          buildTParam(
            scaleRef.current.id,
            voiceRef.current,
            drumKitRef.current,
            typingModeRef.current,
          ),
          undefined,
          // 风格迁移标记：打开方重放同款变换；未迁移过 = 不带参数（旧链接形态）
          stylePresetRef.current ?? undefined,
        ),
      );
      setShareOpen(true);
    }
  }, []);

  const toggleRecording = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (recRef.current.active) {
      stopRecording();
      return;
    }
    engine.ensure();
    unmuteForRecord();
    recRef.current = {
      active: true,
      start: engine.currentTime,
      events: [],
      timer: window.setInterval(() => {
        setRecClock(fmtClock(engine.currentTime - recRef.current.start));
      }, 250),
    };
    setRecClock("0:00");
    setRecActive(true);
  }, [stopRecording, unmuteForRecord]);

  const toggleLoop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (loopCancelRef.current) {
      loopCancelRef.current();
      loopCancelRef.current = null;
      setLoopPlaying(false);
      return;
    }
    const events = lastLoopRef.current;
    if (events.length === 0) return;
    // 完整循环整段录音：不再按 16 拍裁剪（旧上限会把长录音/长合奏拦腰截断）
    const seqEnd = events.reduce((m, e) => Math.max(m, e.t), 0) + 0.5;
    lsStop(); // 单一主排程位：空格乐句循环接管，清掉循环台状态
    loopCancelRef.current = engine.scheduleSequence(events, {
      loop: true,
      loopEnd: seqEnd,
      onPiano: pianoVisual,
    });
    setLoopPlaying(true);
  }, [pianoVisual, lsStop]);

  // 循环台核心三件套：合并排程 / L 三态推进 / 清空
  const lsSchedule = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const merged = lsLayersRef.current.flat().filter((e) => e.t <= lsPeriodRef.current);
    if (merged.length === 0) {
      lsStop();
      return;
    }
    // 接管主排程位前先看有没有空格乐句循环在响（scheduleSequence 内部会 stopSequence 顶掉它，状态同步归零）
    if (loopCancelRef.current) {
      loopCancelRef.current = null;
      setLoopPlaying(false);
    }
    lsCancelRef.current?.();
    lsCancelRef.current = engine.scheduleSequence(merged, {
      loop: true,
      loopEnd: lsPeriodRef.current,
      onPiano: pianoVisual,
    });
  }, [lsStop, pianoVisual]);
  const lsToggle = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const s = lsStateRef.current;
    if (s === "off") {
      engine.ensure();
      unmuteForRecord();
      lsBufRef.current = [];
      lsStartRef.current = engine.currentTime + 0.05; // 让下一个音必然落在本层时窗内
      lsStateRef.current = "rec";
      setLsState("rec");
      setAnnounce("循环台录音中，再按 L 开始循环");
      return;
    }
    if (s === "rec") {
      const buf = lsBufRef.current;
      if (buf.length === 0) {
        lsBufRef.current = [];
        lsStateRef.current = "off";
        setLsState("off");
        setAnnounce("这层没录到声音，已取消");
        return;
      }
      const beat = 60 / clamp(bpmRef.current, 60, 180);
      const maxT = buf.reduce((m, e) => Math.max(m, e.t), 0);
      lsPeriodRef.current = Math.max(8 * beat, Math.ceil(maxT / beat) * beat); // 整数拍、≥2 小节
      lsLayersRef.current = [buf];
      lsBufRef.current = [];
      lsStateRef.current = "play";
      setLsState("play");
      lsSchedule();
      setAnnounce("循环中，再按 L 叠加新层");
      return;
    }
    if (s === "play") {
      lsBufRef.current = [];
      lsStartRef.current = engine.currentTime + 0.05;
      lsStateRef.current = "dub";
      setLsState("dub");
      setAnnounce("叠录新层：现有循环继续响，再按 L 合并");
      return;
    }
    // dub：合并新层并从头重排（循环网格周期不变，超窗事件自然裁掉）
    const buf = lsBufRef.current;
    lsBufRef.current = [];
    if (buf.length === 0) {
      lsStateRef.current = "play";
      setLsState("play");
      setAnnounce("没录到新音，保持原循环");
      return;
    }
    lsLayersRef.current = [...lsLayersRef.current, buf];
    lsStateRef.current = "play";
    setLsState("play");
    lsSchedule();
    setAnnounce(`已叠加第 ${lsLayersRef.current.length} 层，循环继续`);
  }, [lsSchedule, unmuteForRecord]);
  const lsClear = useCallback(() => {
    if (lsStateRef.current === "off") return;
    lsStop();
    setAnnounce("循环台已清空");
  }, [lsStop]);
  // 撤销最上层：循环中弹掉最后叠加的一层并重排循环；叠录进行中则先丢弃当前叠录层；撤销到空 = 清空
  const lsUndoLayer = useCallback(() => {
    const s = lsStateRef.current;
    if (s === "off") return;
    if (s === "dub") {
      lsBufRef.current = [];
      lsStateRef.current = "play";
      setLsState("play");
      setAnnounce("已取消本次叠录");
      return;
    }
    lsLayersRef.current = lsLayersRef.current.slice(0, -1);
    if (lsLayersRef.current.length === 0) {
      lsStop();
      setAnnounce("循环台已清空");
      return;
    }
    lsStateRef.current = "play";
    setLsState("play");
    lsSchedule();
    setAnnounce(`已撤销一层，剩 ${lsLayersRef.current.length} 层`);
  }, [lsSchedule, lsStop]);

  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const closeShare = useCallback(() => setShareOpen(false), []);

  const onCopy = useCallback(() => {
    if (!shownShareUrl) return;
    navigator.clipboard
      .writeText(shownShareUrl)
      .catch(() => undefined)
      .finally(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      });
  }, [shownShareUrl]);

  const onReplayRecording = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || lastLoopRef.current.length === 0) return;
    lsStop(); // 单一主排程位：回放接管，清掉循环台状态
    setReplayActive(true);
    engine.scheduleSequence(lastLoopRef.current, {
      loop: false,
      onPiano: pianoVisual,
      onEnd: () => setReplayActive(false),
    });
  }, [pianoVisual, lsStop]);

  // 历史快照重放：按当下排程位规则接管（清循环台）；speed≠1 时事件时间轴整体缩放（慢练/加速听）
  const onPlayRecHistory = useCallback((savedAt: number, speed = 1) => {
    const engine = engineRef.current;
    const entry = listRecHistory().find((e) => e.savedAt === savedAt);
    if (!engine || !entry) return;
    lsStop(); // 单一主排程位：历史回放接管，清掉循环台状态
    const s = Math.min(2, Math.max(0.5, speed));
    const events = s === 1 ? entry.events : entry.events.map((e) => ({ ...e, t: e.t / s }));
    setReplayActive(true);
    engine.scheduleSequence(events, {
      loop: false,
      onPiano: pianoVisual,
      onEnd: () => setReplayActive(false),
    });
    setAnnounce(`重放历史演奏：${entry.events.length} 个音${s !== 1 ? ` · ${s}× 速度` : ""}`);
  }, [pianoVisual, lsStop]);
  const onRemoveRecHistory = useCallback((savedAt: number) => {
    removeRecHistory(savedAt);
    setRecHistory(listRecHistory());
  }, []);
  const onStarRecHistory = useCallback((savedAt: number) => {
    const starred = toggleRecHistoryStar(savedAt);
    setRecHistory(listRecHistory());
    if (starred !== null) setAnnounce(starred ? "已收藏这段演奏，不会被新录音顶掉" : "已取消收藏");
  }, []);
  // 历史快照直接分享：事件编成访客回放链接（打开即自动重播这段演奏）
  const onShareRecHistory = useCallback((savedAt: number) => {
    const entry = listRecHistory().find((e) => e.savedAt === savedAt);
    if (!entry) return;
    const scoreCode = encodeScore(entry.events, entry.bpm);
    if (!scoreCode) return;
    setShareUrl(
      buildShareUrl(
        scoreCode,
        undefined,
        buildTParam(scaleRef.current.id, voiceRef.current, drumKitRef.current, typingModeRef.current),
      ),
    );
    setShareOpen(true);
  }, []);

  // 演奏层 + 作曲层输入事件
  useEffect(() => {
    if (stage !== "live") return;
    const engine = engineRef.current;
    if (!engine) return;
    const uiBlocked = () =>
      helpOpen ||
      shareOpen ||
      galleryOpen ||
      chartEditorOpen ||
      conductorOpen ||
      recHistoryOpen ||
      histOpen ||
      relayOpen;

    const canvasOf = (): DOMRect | null =>
      canvasRef.current ? canvasRef.current.getBoundingClientRect() : null;

    const mapPointer = (cx: number, cy: number) => {
      const rect = canvasOf();
      if (!rect) return null;
      const x = clamp(cx - rect.left, 0, rect.width);
      const y = clamp(cy - rect.top, 0, rect.height);
      const range = bandRange(scaleRef.current);
      const deg = clamp(Math.floor((x / rect.width) * range.degs), 0, range.degs - 1);
      const idx = range.lo + deg;
      const bright01 = 1 - y / rect.height;
      const cIdx = clamp(Math.floor(bright01 * 15), 0, 15);
      return { x, y, nx: x / rect.width, ny: y / rect.height, deg, idx, bright01, cIdx, w: rect.width, h: rect.height };
    };

    // 动态音色档位解析：关 → 无覆盖；auto → 按速度三档；锁定档 → 原样返回（单一真源，
    // playPhrase / 遥测小字 / 画线实时发声三处共用）
    const timbreVoiceOf = (speed01: number): string | undefined => {
      const m = timbreRef.current;
      if (m === "off") return undefined;
      if (m !== "auto") return m;
      return speed01 < 0.34 ? "glass" : speed01 < 0.67 ? "pluck" : "lead";
    };
    // 动态音色档位名（遥测表环下小字；档位关返回空串 = 仪表不显示）
    const telVoiceLabel = (speed01: number): string => {
      const v = timbreVoiceOf(speed01);
      return v ? voiceById(v).name : "";
    };

    // 乐句宏：开启时把触发音换成向上扫过的琶音（叠三度）/ 音阶跑动（六音级进），
    // 快速排程走 playNote 的 when 参数（同一权威时钟，非 setTimeout）；录制传绝对时间保持滚奏
    const playPhrase = (idx: number, vel: number, cIdx: number, speed01: number): void => {
      // 合奏伙伴：鼠标划过音阶弹出的逐音也是"说给它听的一句"（宏模式只喂根音，轮廓不失真）
      jamObserve(scaleMidi(scaleRef.current, idx), vel);
      // 动态音色：按档位解析逐音覆盖（宏的整串保持同一档，扫弦中途音色不跳变）
      const vid = timbreVoiceOf(speed01);
      const m = macroRef.current;
      if (m === "off") {
        engine.playNote(idx, vel, cutoffFromIdx(cIdx), undefined, undefined, vid);
        recordEvent({ k: "n", idx, v: Math.round(vel * 15), c: cIdx });
        return;
      }
      const offs = m === "arp" ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5];
      const step = m === "arp" ? 0.055 : 0.045;
      const t0 = engine.currentTime + 0.02;
      offs.forEach((o, i) => {
        const vv = i === 0 ? vel : vel * 0.8;
        const when = t0 + i * step;
        engine.playNote(idx + o, vv, cutoffFromIdx(cIdx), when, undefined, vid);
        recordEvent({ k: "n", idx: idx + o, v: Math.round(vv * 15), c: cIdx }, when);
      });
    };

    // 作曲模式：绘制中的颗粒层（速度→密度、曲率→散射、线宽/速度→数量）
    const emitGrains = (pt: { x: number; y: number; nx: number; ny: number }, speed01: number, curv: number) => {
      const range = bandRange(scaleRef.current);
      const degs = range.degs;
      const deg = degFromNy(pt.ny, degs);
      const n = 1 + Math.floor(speed01 * 2);
      for (let i = 0; i < n; i += 1) {
        const scatter = (Math.random() - 0.5) * (120 + curv * 900);
        engine.playGrain(range.lo + deg, 0.12 + speed01 * 0.35, scatter);
      }
      rendererRef.current?.grainVisual(pt.x, pt.y, speed01, hueOfDeg(deg));
    };

    const composeMove = (
      pt: {
        x: number;
        y: number;
        nx: number;
        ny: number;
        deg: number;
        idx: number;
        bright01: number;
        cIdx: number;
      },
      speed01: number,
    ) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      cursorRef.current = { x: pt.nx, y: pt.ny };
      const drag = dragRef.current;
      if (drag) {
        const obj = objectsRef.current.find((o) => o.id === drag.id);
        if (!obj) return;
        dragMovedRef.current = true;
        if (drag.kind === "body") {
          const dx = pt.nx - drag.sx;
          const dy = pt.ny - drag.sy;
          obj.points = drag.orig.map((p) => ({
            x: clamp(p.x + dx, -0.05, 1.05),
            y: clamp(p.y + dy, -0.3, 1.3),
            t: p.t,
          }));
          refreshAudio(obj, bandDegs(scaleRef.current));
        } else {
          stretchTo(obj, pt.nx, bandDegs(scaleRef.current));
        }
        // 接龙态：拖拽（含拉手柄）重算出的时长一律锁回 4 拍；接龙中拖得到的必是本棒对象（前人抓不住）
        if (relayLedgerRef.current && obj.type === "stroke") obj.audio.loopBeats = 4;
        const now = performance.now();
        if (now - lastSyncRef.current > 150) {
          lastSyncRef.current = now;
          syncCanvasLoops();
        }
        return;
      }
      const draft = draftRef.current;
      if (draft) {
        const last = draft.points[draft.points.length - 1];
        if (!last || Math.hypot(pt.nx - last.x, pt.ny - last.y) > 0.004) {
          draft.points.push({ x: pt.nx, y: pt.ny, t: performance.now() / 1000 });
          // 画参数曲线：只更新虚线笔迹——不驱动力度仪表、不试音、不放颗粒
          //（曲线不是音符，落笔预览声音会造成误导）
          if (draft.curve) {
            renderer.setDraft(draft.points, CURVE_PARAM_META[draft.curve].hue, true);
            return;
          }
          renderer.setDraft(draft.points, hueOfDeg(pt.deg));
          // 画线时仪表实时反映「将要编译成的力度」：与 sampleCurves 同一映射（0.18+速度×0.6），
          // 调制环跟随笔迹纵位（画到哪儿、亮到哪儿）；动色开启时环下浮出当前音色档
          renderer.telemetry(
            clamp(0.18 + speed01 * 0.6, 0.08, 0.9),
            cutoffFromIdx(pt.cIdx),
            hueOfDeg(pt.deg),
            telVoiceLabel(speed01),
          );
          // 动色开启（自动或锁定档）：笔位实时发声，音色与 playPhrase 同一解析——画快画慢
          // 当场听见玻璃/拨弦/锯齿Lead 的切换，落笔前就预览到这条线循环起来的味道
          const tier = timbreVoiceOf(speed01);
          if (tier) {
            const tNow = performance.now() / 1000;
            const prev = draftVoiceRef.current;
            if ((pt.idx !== prev.idx || tier !== prev.tier) && tNow - prev.at > 0.12) {
              engine.playNote(
                pt.idx,
                clamp(0.15 + speed01 * 0.4, 0.05, 0.6),
                cutoffFromIdx(pt.cIdx),
                undefined,
                undefined,
                tier,
              );
              draftVoiceRef.current = { idx: pt.idx, tier, at: tNow };
            }
          }
          if (draft.points.length >= 3) {
            const a = draft.points[draft.points.length - 3];
            const b = draft.points[draft.points.length - 2];
            const c = draft.points[draft.points.length - 1];
            const a1 = Math.atan2(b.y - a.y, b.x - a.x);
            const a2 = Math.atan2(c.y - b.y, c.x - b.x);
            let curv = Math.abs(a2 - a1);
            if (curv > Math.PI) curv = Math.PI * 2 - curv;
            emitGrains(pt, speed01, clamp(curv / Math.PI, 0, 1));
          } else {
            emitGrains(pt, speed01, 0);
          }
        }
        return;
      }
      // 弱化的即兴叠加层
      renderer.pointerMove(pt.x, pt.y, speed01, pt.bright01, hueOfDeg(pt.deg));
      const p = pointerRef.current;
      const now = performance.now() / 1000;
      if (pt.idx !== p.lastIdx && now - p.lastNoteAt > 0.14) {
        const vel = clamp(0.12 + speed01 * 0.3, 0.05, 0.45);
        playPhrase(pt.idx, vel, pt.cIdx, speed01);
        renderer.telemetry(vel, cutoffFromIdx(pt.cIdx), hueOfDeg(pt.deg), telVoiceLabel(speed01));
        p.lastIdx = pt.idx;
        p.lastNoteAt = now;
        setPitchLabelLive(`${degLabel(scaleRef.current, pt.deg)} · ${scaleRef.current.name} C 调`);
      }
    };

    // 输入源自适应：触摸后 0.7s 内的 mouse 事件视为浏览器合成噪声吞掉（防幻影光带）；
    // 真实鼠标移动则自动收起触屏键盘（回到鼠标演奏态）
    const onPointerMove = (e: PointerEvent) => {
      if (modeRef.current === "challenge") return; // 挑战模式：鼠标不发声
      if (e.pointerType === "touch") {
        lastTouchRef.current = performance.now();
      } else if (e.pointerType === "mouse") {
        if (performance.now() - lastTouchRef.current < 700) return;
        setTouchKeys((v) => (v ? false : v));
      }
      const renderer = rendererRef.current;
      const pt = mapPointer(e.clientX, e.clientY);
      if (!renderer || !pt) return;
      const p = pointerRef.current;
      const now = performance.now() / 1000;
      const dt = p.lastMove > 0 ? Math.max(0.008, now - p.lastMove) : 0.016;
      const dist = Math.hypot(pt.x - p.x, pt.y - p.y);
      const speed01 = clamp(dist / dt / 1500, 0, 1);
      p.x = pt.x;
      p.y = pt.y;
      p.lastMove = now;

      if (modeRef.current === "compose") {
        if (!uiBlocked()) composeMove(pt, speed01);
        return;
      }

      const hue = hueOfDeg(pt.deg);
      renderer.pointerMove(pt.x, pt.y, speed01, pt.bright01, hue);

      if (p.down) {
        engine.updateSustain(pt.idx, cutoffFromIdx(pt.cIdx));
        // 按住持续音：调制环实时跟随上下移动（力度维持中档）
        renderer.telemetry(0.55, cutoffFromIdx(pt.cIdx), hue);
        return;
      }
      if (pt.idx !== p.lastIdx && now - p.lastNoteAt > 0.075) {
        const vel = clamp(0.2 + speed01 * 0.55, 0.05, 0.85);
        playPhrase(pt.idx, vel, pt.cIdx, speed01);
        renderer.notePulse(pt.idx, vel * 0.7, pt.x, pt.y);
        renderer.telemetry(vel, cutoffFromIdx(pt.cIdx), hue, telVoiceLabel(speed01));
        p.lastIdx = pt.idx;
        p.lastNoteAt = now;
        setPitchLabelLive(`${degLabel(scaleRef.current, pt.deg)} · ${scaleRef.current.name} C 调`);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current === "challenge") return; // 挑战模式：画布点击不发声（选关卡是 DOM 按钮）
      // 触屏按下记账 + 吞掉触屏后浏览器合成的幽灵点击（否则一次点按发两声）
      if (e.pointerType === "touch") lastTouchRef.current = performance.now();
      else if (e.pointerType === "mouse" && performance.now() - lastTouchRef.current < 700) return;
      const renderer = rendererRef.current;
      const pt = mapPointer(e.clientX, e.clientY);
      if (!renderer || !pt) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest("button")) return;

      if (modeRef.current === "compose") {
        if (uiBlocked()) return;
        // 只读分享：作曲画布的一切指针编辑（画线/拖动/锚点/选择）统一挡下
        if (roRef.current) {
          guardRo();
          return;
        }
        cursorRef.current = { x: pt.nx, y: pt.ny };
        const hit = hitTest(
          objectsRef.current,
          pt.nx,
          pt.ny,
          14 / pt.w,
          14 / pt.h,
          selectedRef.current,
        );
        if (hit) {
          const obj = objectsRef.current.find((o) => o.id === hit.id);
          if (obj) {
            if (isRelayLocked(hit.id)) {
              // 接龙态前人锁定：锚点点照常重响（听觉参考不受限），但不选中、不拖动
              if (hit.part === "body" && obj.type === "anchor") playAnchorVoice(obj);
              return;
            }
            selectObject(obj);
            // 拖起点快照：拖动确实改变几何时才在松手压入撤销栈
            preDragRef.current = JSON.stringify(objectsRef.current);
            dragMovedRef.current = false;
            // 点到锚点即重响一次（拖拽移动不受影响）
            if (hit.part === "body" && obj.type === "anchor") playAnchorVoice(obj);
            if (hit.part === "body") {
              dragRef.current = {
                kind: "body",
                id: hit.id,
                sx: pt.nx,
                sy: pt.ny,
                orig: obj.points.map((p) => ({ ...p })),
              };
            } else {
              dragRef.current = { kind: "handle", id: hit.id };
            }
          }
          return;
        }
        selectObject(null);
        const curveDraw = autoParamRef.current === "off" ? null : autoParamRef.current;
        draftRef.current = {
          points: [{ x: pt.nx, y: pt.ny, t: performance.now() / 1000 }],
          startX: pt.nx,
          startY: pt.ny,
          curve: curveDraw,
        };
        renderer.setDraft(
          draftRef.current.points,
          curveDraw ? CURVE_PARAM_META[curveDraw].hue : hueOfDeg(pt.deg),
          curveDraw !== null,
        );
        return;
      }

      const p = pointerRef.current;
      p.down = true;
      const vel = 0.6;
      engine.ensure();
      engine.playNote(pt.idx, vel, cutoffFromIdx(pt.cIdx));
      jamObserve(scaleMidi(scaleRef.current, pt.idx), vel); // 合奏伙伴：鼠标弹出的一句也进耳朵
      engine.startSustain(pt.idx, 0.5, cutoffFromIdx(pt.cIdx));
      recordEvent({ k: "n", idx: pt.idx, v: 10, c: pt.cIdx });
      recordEvent({ k: "s", idx: pt.idx, v: 8, c: pt.cIdx });
      renderer.pointerDown(pt.x, hueOfDeg(pt.deg));
      renderer.notePulse(pt.idx, vel, pt.x, pt.y);
      renderer.telemetry(vel, cutoffFromIdx(pt.cIdx), hueOfDeg(pt.deg));
      setPitchLabelLive(`${degLabel(scaleRef.current, pt.deg)} · ${scaleRef.current.name} C 调`);
    };

    const finalizeDraft = () => {
      const draft = draftRef.current;
      draftRef.current = null;
      rendererRef.current?.setDraft(null);
      if (!draft) return;
      const pts = draft.points;
      const span = pts.reduce(
        (acc, p) => ({
          x0: Math.min(acc.x0, p.x),
          x1: Math.max(acc.x1, p.x),
          y0: Math.min(acc.y0, p.y),
          y1: Math.max(acc.y1, p.y),
        }),
        { x0: 1, x1: 0, y0: 1, y1: 0 },
      );
      const size = Math.hypot(span.x1 - span.x0, span.y1 - span.y0);
      const last = pts[pts.length - 1];
      if (draft.curve) {
        // 参数曲线落笔：太小的一横不收成曲线（也绝不能误落锚点），提示重画
        if (pts.length < 4 || size < 0.02) {
          setAnnounce(`这条${CURVE_PARAM_META[draft.curve].name}曲线太短了——横向拖开一点再松手，画出一条随时间的变化`);
          return;
        }
        if (objectsRef.current.length >= MAX_CANVAS_OBJECTS) {
          flashCap();
          return;
        }
        pushHistory("op", `添加${CURVE_PARAM_META[draft.curve].name}曲线`);
        const obj = compileCurve(pts, draft.curve);
        // 接龙的 4 拍锁只约束发声循环；曲线的时间跨度不锁（接龙里画曲线照常生效）
        objectsRef.current.push(obj);
        commitCanvas();
        setAnnounce(`已添加${CURVE_PARAM_META[draft.curve].name}曲线 · 约 ${obj.audio.loopBeats.toFixed(1)} 拍`);
        return;
      }
      if (pts.length < 4 || size < 0.02) {
        placeAnchor(last ? last.x : draft.startX, last ? last.y : draft.startY);
        return;
      }
      if (objectsRef.current.length >= MAX_CANVAS_OBJECTS) {
        flashCap();
        return;
      }
      pushHistory("op", "绘制新乐句");
      const obj = compileStroke(pts, bandDegs(scaleRef.current));
      // 接龙态：本棒新画的循环窗口锁为 4 拍（编译完成后覆盖；锚点不经此处，照常一次性音）
      if (relayLedgerRef.current) obj.audio.loopBeats = 4;
      objectsRef.current.push(obj);
      commitCanvas();
      const deg = obj.audio.pitchCurve[0] ?? 0;
      setAnnounce(`新乐句：${describeDeg(scaleRef.current, deg, obj.audio.velocityCurve[0] ?? 0.5)}，${obj.audio.closed ? "闭合循环琶音" : "循环播放中"}`);
    };

    const onPointerUp = () => {
      if (modeRef.current === "compose") {
        if (dragRef.current) {
          const wasHandle = dragRef.current.kind === "handle";
          const dragId = dragRef.current.id;
          const preSnap = preDragRef.current;
          dragRef.current = null;
          // 拖动真正改变了对象才入撤销栈（纯点击选中不留空记录）
          if (dragMovedRef.current && preDragRef.current !== null) {
            undoRef.current.push({
              snap: preDragRef.current,
              label: wasHandle ? "调整循环长度" : "拖动乐句",
            });
            if (undoRef.current.length > 80) undoRef.current.shift();
            redoRef.current = [];
            syncHist();
          }
          // 拖手柄改了循环时长 → 选「音符怎么处理」：记住了直接按存的方式办，
          // 没记住浮出选择条（未作答 = 默认按比例，即现行拉伸状态）
          if (wasHandle && dragMovedRef.current && preSnap !== null) {
            const snap = JSON.parse(preSnap) as CanvasObject[];
            const orig = snap.find((o) => o.id === dragId);
            const cur = objectsRef.current.find((o) => o.id === dragId);
            if (orig && cur && cur.type === "stroke" && orig.audio.loopBeats !== cur.audio.loopBeats) {
              const saved = resizeModeRef.current;
              if (saved === "repeat") {
                applyRepeatFill(cur, orig);
                setAnnounce("循环时长已按重复填充铺满");
              } else if (saved === null) {
                setResizePick({ id: dragId, orig });
              }
            }
          }
          preDragRef.current = null;
          dragMovedRef.current = false;
          lastSyncRef.current = 0;
          commitCanvas();
        }
        finalizeDraft();
        return;
      }
      const p = pointerRef.current;
      if (!p.down) return;
      p.down = false;
      engine.stopSustain();
      recordEvent({ k: "x" });
      rendererRef.current?.pointerUp();
    };

    const onDblClick = (e: MouseEvent) => {
      if (modeRef.current !== "compose" || uiBlocked()) return;
      const pt = mapPointer(e.clientX, e.clientY);
      if (!pt) return;
      const hit = hitTest(objectsRef.current, pt.nx, pt.ny, 14 / pt.w, 14 / pt.h, null);
      if (hit) duplicateSelected();
    };

    // 画布音区拓宽为固定大区（E2–C6）后不再有八度挡位；滚轮仍拦下页面滚动
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    // 打字钢琴：双布局——qwerty 物理三行 26 白键（Shift/黑键模式弹右邻黑）；
    // piano 经典 DAW 双八度（黑键 W E T Y U O P 直按）。黑键基准力度略轻、白键带随机人性化抖动
    const playPianoKey = (key: string, shift: boolean) => {
      if (keymapRef.current === "piano") {
        const slot = layoutKeyOf(key);
        if (!slot) return;
        const vel = clamp((slot.black ? 0.7 : 0.85) + (Math.random() - 0.5) * 0.2, 0.2, 1);
        engine.playPiano(slot.midi - PIANO_C3_MIDI, vel);
        jamObserve(slot.midi, vel);
        // 录音仍折算成既有 (白键索引, 黑键) 模型 → 分享/回放/背景琴键全链路兼容
        const pos = pianoPosOfMidi(slot.midi);
        if (pos) {
          recordEvent({
            k: "p",
            ki: pos.key,
            b: pos.black ? 1 : 0,
            v: Math.round(vel * 15),
            s: sustainRef.current ? 1 : 0,
            soft: softRef.current ? 1 : 0,
          });
          rendererRef.current?.pressPianoKey(pos.key, pos.black, vel);
        }
        rendererRef.current?.spawnShard(key);
        return;
      }
      const idx = pianoIndexOf(key);
      if (idx < 0) return;
      const pk = PIANO_KEYS[idx];
      const useBlack = (shift || blackRef.current) && pk.blackMidi !== null;
      const midi = useBlack ? pk.blackMidi ?? pk.midi : pk.midi;
      const base = useBlack ? 0.7 : 0.85;
      const vel = clamp(base + (Math.random() - 0.5) * 0.2, 0.2, 1);
      engine.playPiano(midi - PIANO_C3_MIDI, vel);
      jamObserve(midi, vel);
      // 录音带延音/弱音位：演奏瞬间两踏板是否踩着，回放分别重现长尾与压暗变轻音色
      recordEvent({
        k: "p",
        ki: idx,
        b: useBlack ? 1 : 0,
        v: Math.round(vel * 15),
        s: sustainRef.current ? 1 : 0,
        soft: softRef.current ? 1 : 0,
      });
      rendererRef.current?.pressPianoKey(idx, useBlack, vel);
      rendererRef.current?.spawnShard(key);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const onControl =
        target !== null && (target.tagName === "BUTTON" || target.tagName === "INPUT");
      // 焦点在按钮/输入框时，把会触发控件或光标移动的键交还给控件
      if (
        onControl &&
        [" ", "Enter", "Delete", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        return;
      }
      // 焦点在文本输入时不劫持任何键
      if (
        target !== null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        return;
      }
      // Ctrl/Cmd+D 复制选中（先于 ctrl 守卫）
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        if (modeRef.current === "compose" && !uiBlocked() && selectedRef.current) {
          e.preventDefault();
          duplicateSelected();
        }
        return;
      }
      // Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 +Y 重做（作曲模式改动全在快照栈内）
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        if (modeRef.current === "compose" && !uiBlocked()) {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        if (modeRef.current === "compose" && !uiBlocked()) {
          e.preventDefault();
          redo();
        }
        return;
      }
      // Tab 三态循环 演奏→作曲→挑战（钢琴模式下 m 让位琴键，仅 Tab 保留全循环）
      if (e.key === "Tab") {
        e.preventDefault();
        cycleMode();
        return;
      }
      // Shift+M 全局静音（钢琴玩法让位：Shift+M 是黑键 M#；挑战模式击符优先）
      if (
        e.shiftKey &&
        (e.key === "m" || e.key === "M") &&
        typingModeRef.current !== "piano" &&
        modeRef.current !== "challenge" &&
        !uiBlocked()
      ) {
        e.preventDefault();
        toggleAllMuted();
        return;
      }
      if ((e.key === "m" || e.key === "M") && typingModeRef.current !== "piano") {
        e.preventDefault();
        toggleABMode();
        return;
      }
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      // 挑战模式快捷键让位：只留 Tab/空格/?；26 字母（含 Shift）全部专用击符，
      // 1-6/S/T/G/K/R/0/9 等一律禁用不响应（Tab 与 ? 已在上面/本块处理，其余直接吞掉）
      if (modeRef.current === "challenge") {
        if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
          e.preventDefault();
          toggleHelp();
          return;
        }
        if (uiBlocked()) return;
        if (e.key === " ") {
          e.preventDefault();
          chSpace();
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          // 演示/练习专属：←/→ 逐小节跳转；常规挑战与演奏里方向键不响应
          if (chModeRef.current !== "race") {
            e.preventDefault();
            chDemoJumpBar(e.key === "ArrowRight" ? 1 : -1);
          }
          return;
        }
        if (e.key.length === 1 && /[a-z]/i.test(e.key)) {
          e.preventDefault();
          chHit(e.key, e.shiftKey);
          return;
        }
        return;
      }
      // 循环台运行中：空格（乐句循环）让位，循环台期间由 L 统一管理
      if (e.key === " " && lsStateRef.current === "off") {
        e.preventDefault();
        toggleLoop();
        return;
      }
      // 录音快捷键只在鼓组玩法保留；钢琴模式下 r 让位琴键（录音走 HUD ● 按钮）
      if (typingModeRef.current !== "piano" && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        toggleRecording();
        return;
      }
      // 循环台：L 推进（录→循环→叠录），Shift+L 清空；钢琴模式 L 是琴键，一律走 HUD 按钮
      if (typingModeRef.current !== "piano" && !uiBlocked() && e.key === "L") {
        e.preventDefault();
        lsClear();
        return;
      }
      if (typingModeRef.current !== "piano" && !uiBlocked() && e.key === "l") {
        e.preventDefault();
        lsToggle();
        return;
      }
      // 乐句宏：A 循环 关→琶音→音阶；钢琴模式 A 是琴键，走 HUD chip
      if (typingModeRef.current !== "piano" && !uiBlocked() && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        toggleMacro();
        return;
      }
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        toggleHelp();
        return;
      }
      // 钢琴模式彻底让位：26 个字母键（含 r/k/m）全部弹琴，切玩法/录音/切模式一律走 HUD 按钮；
      // 仅劫持不碰撞的非字母数字键：0=长按延音、9=长按弱音（e.repeat 已在上方统一忽略；鼓组模式下这两键照常打鼓不劫持）
      if (typingModeRef.current === "piano") {
        if (!uiBlocked() && e.key === "0") {
          e.preventDefault();
          pressPedal(true);
          return;
        }
        if (!uiBlocked() && e.key === "9") {
          e.preventDefault();
          pressSoft(true);
          return;
        }
        const punctuationKey = keymapRef.current === "piano" && (e.key === ";" || e.key === "," || e.key === "'");
        if (e.key.length === 1 && (/[a-z]/i.test(e.key) || punctuationKey)) {
          e.preventDefault();
          playPianoKey(e.key, e.shiftKey);
          return;
        }
      }
      // 音阶/音色/鼓包切换：1-6 直达音阶、S 循环音阶、T 循环音色、G 循环鼓包；弹层打开时不劫持
      if (!uiBlocked() && typingModeRef.current !== "piano") {
        if (e.key >= "1" && e.key <= "6") {
          e.preventDefault();
          selectScaleIndex(Number(e.key) - 1);
          return;
        }
        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          cycleScale();
          return;
        }
        if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          cycleVoice();
          return;
        }
        if (e.key === "g" || e.key === "G") {
          e.preventDefault();
          cycleDrumKit();
          return;
        }
      }
      // 作曲模式键盘全操作
      if (modeRef.current === "compose" && !uiBlocked()) {
        if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
          if (selectedRef.current) {
            e.preventDefault();
            if (e.key === "ArrowUp") moveSelected(0, -0.2);
            else if (e.key === "ArrowDown") moveSelected(0, 0.2);
            else if (e.key === "ArrowLeft") moveSelected(-0.03, 0);
            else moveSelected(0.03, 0);
          }
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          placeAnchor(cursorRef.current.x, cursorRef.current.y);
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          deleteSelected();
          return;
        }
      }
      if (e.key.length === 1) {
        // 钢琴模式下非字母单键（标点等）不触发鼓组，并重置节奏基准避免下次鼓点力度尖峰
        if (typingModeRef.current === "piano") {
          lastKeyAtRef.current = 0;
          return;
        }
        // 打字 → 鼓组，速度驱动 BPM 与力度
        const now = performance.now();
        const gap = lastKeyAtRef.current > 0 ? now - lastKeyAtRef.current : 400;
        lastKeyAtRef.current = now;
        const density = clamp(60000 / Math.max(80, gap), 60, 180);
        bpmRef.current = Math.round(density);
        setBpm(bpmRef.current);
        const vel = clamp(0.4 + (1 - Math.min(1, gap / 600)) * 0.6, 0.3, 1);
        const gi = e.key.charCodeAt(0) % DRUM_KINDS.length;
        engine.playDrum(DRUM_KINDS[gi], vel);
        recordEvent({ k: "d", g: gi, v: Math.round(vel * 15) });
        rendererRef.current?.drumPulse(gi, vel);
        rendererRef.current?.spawnShard(e.key);
      }
    };

    // 松 0/9 / 窗口失焦 / 切走 tab 都强制松开延音与弱音踏板，防"卡踏板"
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "0" && sustainRef.current) pressPedal(false);
      if (e.key === "9" && softRef.current) pressSoft(false);
      // Caps Lock 松手时读系统状态同步黑键模式（比 keydown 稳，灯亮=黑键模式开）
      if (e.key === "CapsLock" && keymapRef.current === "qwerty" && !uiBlocked()) {
        setBlackMode(e.getModifierState("CapsLock"));
      }
    };
    const onBlur = () => {
      if (sustainRef.current) pressPedal(false);
      if (softRef.current) pressSoft(false);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (sustainRef.current) pressPedal(false);
        if (softRef.current) pressSoft(false);
        // 生存局进行中（倒计时/游玩/暂停）离开页面 = 当局作废：不上报不计成绩，直接回选关层
        const visPh = chPhaseRef.current;
        if (
          modeRef.current === "challenge" &&
          chModeRef.current === "survival" &&
          (visPh === "countdown" || visPh === "play" || visPh === "paused")
        ) {
          engine.suspend();
          chVoidSurvivalRef.current();
          return;
        }
        engine.suspend();
      } else if (!chPausedRef.current) {
        // 挑战模式空格手动暂停中：切回标签页不自动续播（保持冻结）
        chWaitHoldRef.current = false; // 切回唤醒即清冻结标记，tick 按等待规则重新判定（未弹上会立即再冻）
        engine.resume();
      }
    };

    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("dblclick", onDblClick);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("dblclick", onDblClick);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [stage, helpOpen, shareOpen, galleryOpen, chartEditorOpen, conductorOpen, recHistoryOpen, histOpen, relayOpen, isRelayLocked, setBlackMode, recordEvent, pressPedal, pressSoft, toggleLoop, toggleRecording, toggleHelp, cycleMode, toggleABMode, chHit, chSpace, chDemoJumpBar, duplicateSelected, deleteSelected, moveSelected, placeAnchor, commitCanvas, flashCap, selectObject, syncCanvasLoops, cycleScale, selectScaleIndex, cycleVoice, cycleDrumKit, cycleTypingMode, playAnchorVoice, lsToggle, lsClear, toggleMacro]);

  // 卸载时挂起音频
  useEffect(() => {
    const onUnload = () => engineRef.current?.suspend();
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  // ---- 哼唱转音符（人声 → MIDI）：作曲模式专属，纯本地 Web Audio 分析 ----
  // 拾音器/帧缓冲走 ref（60fps 帧不进 setState，面板 rAF 直读直绘）；
  // 只有秒表/摘要/开关这类低频 UI 态走 state
  const [humOpen, setHumOpen] = useState(false);
  const [humRecording, setHumRecording] = useState(false);
  const [humSeconds, setHumSeconds] = useState(0);
  const [humError, setHumError] = useState<string | null>(null);
  const [humSummary, setHumSummary] = useState<{ notes: number; beats: number; zone: string } | null>(null);
  const [humSnapOn, setHumSnapOn] = useState(true);
  const [humQuantOn, setHumQuantOn] = useState(true);
  const humTrackerRef = useRef<HumTracker | null>(null);
  const humFramesRef = useRef<HumFrame[]>([]);
  const humPhraseRef = useRef<HumPhrase | null>(null);
  const humStartAtRef = useRef(0);
  const humTickRef = useRef(0);

  const humStopPickup = useCallback((keepResult: boolean) => {
    humTrackerRef.current?.stop();
    humTrackerRef.current = null;
    if (humTickRef.current) {
      window.clearInterval(humTickRef.current);
      humTickRef.current = 0;
    }
    setHumRecording(false);
    if (!keepResult) {
      humFramesRef.current = [];
      humPhraseRef.current = null;
      setHumSummary(null);
    }
  }, []);

  const humStart = useCallback(async () => {
    if (humTrackerRef.current) return; // 正在拾音，不重复开
    setHumError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setHumError("这个浏览器不支持话筒授权，换个浏览器再试。");
      return;
    }
    try {
      // 关三件套自动处理：噪声抑制/回声消除/自动增益都会扭曲基频，拾音分析必须裸采
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const tracker = new HumTracker();
      humTrackerRef.current = tracker;
      await tracker.start(stream, (f) => {
        const arr = humFramesRef.current;
        arr.push(f);
        // 只保最近 8s（面板 6s 滚动窗 + 2s 余量），长跑不吃内存
        while (arr.length > 0 && f.t - arr[0].t > 8) arr.shift();
      });
      humStartAtRef.current = performance.now();
      setHumRecording(true);
      setHumSeconds(0);
      setHumSummary(null);
      humPhraseRef.current = null;
      humTickRef.current = window.setInterval(() => {
        setHumSeconds(Math.min(120, (performance.now() - humStartAtRef.current) / 1000));
      }, 200);
    } catch {
      // 授权被拒 / 无设备 / 设备被占：温和提示，不循环请求
      humTrackerRef.current?.stop();
      humTrackerRef.current = null;
      setHumError("打不开话筒：在浏览器地址栏或站点设置里允许使用麦克风，再点「开始哼」。");
    }
  }, []);

  const humStop = useCallback(() => {
    if (!humTrackerRef.current) return;
    humStopPickup(true); // 保留帧缓冲给「落进画布」
    const phrase = segmentHum(humFramesRef.current);
    humPhraseRef.current = phrase;
    if (phrase.notes.length === 0) {
      setHumSummary(null);
      setHumError("没听清明确音高：大声一点、稳一点哼，每个音拖长些（≥0.1 秒）再试。");
      return;
    }
    const beatSec = 60 / clamp(bpmRef.current, 40, 240);
    setHumSummary({
      notes: phrase.notes.length,
      beats: Math.max(1, Math.round((phrase.phraseSec / beatSec) * 4) / 4),
      zone: midiZoneWord(phrase.avgMidi),
    });
  }, [humStopPickup]);

  const humCommit = useCallback(() => {
    if (guardRo()) return;
    const phrase = humPhraseRef.current;
    if (!phrase || phrase.notes.length === 0) return;
    if (objectsRef.current.length >= MAX_CANVAS_OBJECTS) {
      flashCap();
      return;
    }
    const obj = humToStroke(phrase.notes, {
      scale: scaleRef.current,
      bpm: bpmRef.current,
      snapScale: humSnapOn,
      quantBeat: humQuantOn,
      // 接龙态：哼超长自动把整段时间映射压进 4 拍（与画线同锁，结果计入本棒——
      // 账本只数前人对象，push 在尾部即天然归本棒）
      lockBeats: relayLedgerRef.current ? 4 : undefined,
    });
    if (!obj) {
      setAnnounce("哼唱结果太短，落不成谱——多哼几个音再落。");
      return;
    }
    pushHistory("op", `哼唱落谱 ${phrase.notes.length} 音`);
    objectsRef.current.push(obj);
    commitCanvas();
    setAnnounce(
      `哼唱落谱：${phrase.notes.length} 音 · ${obj.audio.loopBeats} 拍循环播放中${relayLedgerRef.current ? "，已计入本棒" : ""}`,
    );
    humStopPickup(false);
    setHumOpen(false);
  }, [guardRo, flashCap, pushHistory, commitCanvas, humSnapOn, humQuantOn, humStopPickup]);

  const onOpenHum = useCallback(() => {
    setHumError(null);
    setHumOpen(true);
  }, []);
  const onCloseHum = useCallback(() => {
    humStopPickup(false);
    setHumOpen(false);
  }, [humStopPickup]);

  // 哼唱是作曲模式专属：切走模式自动停拾音（与卷帘/变形同规则）
  useEffect(() => {
    if (mode !== "compose") {
      humStopPickup(false);
      setHumOpen(false);
    }
  }, [mode, humStopPickup]);
  // 切走标签页即停拾音释放轨道；卸载兜底
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && humTrackerRef.current) {
        humStopPickup(false);
        setHumOpen(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      humTrackerRef.current?.stop();
      if (humTickRef.current) window.clearInterval(humTickRef.current);
    };
  }, [humStopPickup]);

  // ---- AI 指挥台（混音建议 / 编曲建议 / 风格迁移；纯前端规则引擎，零外部调用）----
  // 建议 = 数据动作（AiAction），统一解释器落地：pushHistory 撤销栈 + IndexedDB 持久化 +
  // 重编译重排程（commitCanvas）+ aria 播报，与手动画线/变形/卷帘同一条数据流。
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTab, setAiTab] = useState<"mix" | "arrange" | "style" | "lyric">("mix");
  const [aiMixList, setAiMixList] = useState<AiAdvice[]>([]);
  const [aiArrangeList, setAiArrangeList] = useState<AiAdvice[]>([]);
  // hover 描边目标（渲染层虚线轮廓；state 命名避开浏览器全局）
  const [aiHoverIds, setAiHoverIds] = useState<string[]>([]);
  const [stylePreset, setStylePresetState] = useState<StylePresetId | null>(null);
  const stylePresetRef = useRef(stylePreset);
  stylePresetRef.current = stylePreset;
  const styleSnapRef = useRef<{ objs: string; voiceId: string } | null>(null);
  const [styleSnapshotOn, setStyleSnapshotOn] = useState(false);

  useEffect(() => {
    rendererRef.current?.setHighlightIds(aiHoverIds);
  }, [aiHoverIds]);

  // 分析上下文（与 syncCanvasLoops 同源的音区基准；限制器削减实时取）
  const buildAiCtx = useCallback(() => {
    const sc = scaleRef.current;
    return {
      bpm: bpmRef.current,
      degs: bandDegs(sc),
      scaleLen: sc.semitones.length,
      baseIdx: bandRange(sc).lo - sc.semitones.length * ACCOMP_OCTAVE_SHIFT,
      limiterReductionDb: engineRef.current?.limiterReductionDb ?? 0,
      masterVol: fxRef.current.vol,
      globalVoice: voiceRef.current,
    };
  }, []);

  const aiRunAnalyze = useCallback(() => {
    const c = buildAiCtx();
    setAiMixList(analyzeMix(objectsRef.current, c));
    setAiArrangeList(analyzeArrange(objectsRef.current, selectedRef.current, c));
  }, [buildAiCtx]);

  // 动作解释器：就地改 objectsRef（调用方负责前后 pushHistory/commitCanvas）；返回结果短语，null = 不成立
  const aiApplyAction = useCallback(
    (a: AiAction): string | null => {
      const objs = objectsRef.current;
      switch (a.t) {
        case "gain": {
          const o = objs.find((x) => x.id === a.id);
          if (!o) return null;
          // AI 回包数值不保证有限：脏值直接进对象会在编译/混音链路里扩散成 NaN
          o.aiGain = Number.isFinite(a.gain) ? a.gain : 1;
          return "音量已调低";
        }
        case "octaveUp": {
          const o = objs.find((x) => x.id === a.id);
          if (!o || o.type === "curve") return null;
          const len = scaleRef.current.semitones.length;
          o.audio.pitchCurve = o.audio.pitchCurve.map((d) => d + len);
          o.points = o.points.map((p) => ({ ...p, y: clamp(p.y - len / bandDegs(scaleRef.current), -0.3, 1.3) }));
          o.roll = undefined; // 卷帘格是带内音级，整条升八度后覆盖作废、回曲线编译
          return "已整体升一个八度";
        }
        case "addVolCurve": {
          if (objs.length >= MAX_CANVAS_OBJECTS) return null;
          objs.push(buildVolCurveObject());
          return "已铺渐强渐弱音量曲线";
        }
        case "mute": {
          const o = objs.find((x) => x.id === a.id);
          if (!o) return null;
          o.muted = true;
          return "已静音";
        }
        case "masterDown": {
          setFxValue("vol", fxRef.current.vol * 0.8);
          return "主音量已下调一档";
        }
        case "addObjs": {
          if (objs.length + a.objs.length > MAX_CANVAS_OBJECTS) return null;
          objs.push(...a.objs);
          return `已铺进 ${a.objs.length} 个新对象`;
        }
        case "voice": {
          const o = objs.find((x) => x.id === a.id);
          if (!o) return null;
          o.voiceId = a.voiceId;
          return `已换成「${voiceById(a.voiceId).name}」音色`;
        }
        default:
          return null;
      }
    },
    [setFxValue],
  );

  const markAiStatus = useCallback((id: string, status: "applied" | "ignored") => {
    setAiMixList((s) => s.map((a) => (a.id === id ? { ...a, status } : a)));
    setAiArrangeList((s) => s.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  const aiApplyOne = useCallback(
    (id: string) => {
      if (guardRo()) return;
      // 接龙态：AI 变换会动到前人锁定对象/改变对象计数让账本失准——可查看、应用置灰
      if (relayLedgerRef.current) {
        setAnnounce("接龙态前人的段落锁着拍子，AI 建议先不合拍——传完这棒再来应用");
        return;
      }
      const item = [...aiMixList, ...aiArrangeList].find((a) => a.id === id);
      if (!item || item.status !== "pending") return;
      pushHistory("op", "应用 AI 建议");
      const done = aiApplyAction(item.action);
      if (done === null) {
        undo(); // 容量不足等不成立分支：弹掉刚才的快照，历史不留空步
        flashCap();
        return;
      }
      commitCanvas();
      markAiStatus(id, "applied");
      setAnnounce(`已应用：${item.text}`);
    },
    [guardRo, aiMixList, aiArrangeList, pushHistory, aiApplyAction, undo, flashCap, commitCanvas, markAiStatus],
  );

  const aiApplyAll = useCallback(() => {
    if (guardRo()) return;
    if (relayLedgerRef.current) {
      setAnnounce("接龙态前人的段落锁着拍子，AI 建议先不合拍——传完这棒再来应用");
      return;
    }
    const pend = [...aiMixList, ...aiArrangeList].filter((a) => a.status === "pending");
    if (pend.length === 0) return;
    pushHistory("op", `一键应用 ${pend.length} 条 AI 建议`);
    let n = 0;
    let skipped = 0;
    for (const item of pend) {
      if (aiApplyAction(item.action) !== null) {
        n += 1;
        markAiStatus(item.id, "applied");
      } else {
        skipped += 1;
      }
    }
    commitCanvas();
    if (n === 0) {
      undo(); // 全部不成立：不留空步
      flashCap();
      return;
    }
    setAnnounce(skipped > 0 ? `已应用 ${n} 条建议，${skipped} 条因 24 对象上限跳过` : `已应用 ${n} 条建议`);
  }, [guardRo, aiMixList, aiArrangeList, pushHistory, aiApplyAction, undo, flashCap, commitCanvas, markAiStatus]);

  const aiIgnore = useCallback(
    (id: string) => {
      markAiStatus(id, "ignored");
    },
    [markAiStatus],
  );

  const aiApplyStyle = useCallback(
    (pid: string) => {
      if (guardRo()) return;
      if (relayLedgerRef.current) {
        setAnnounce("接龙态前人的段落锁着拍子，风格迁移会动整曲——传完这棒再来");
        return;
      }
      const hit = stylePresetById(pid);
      if (!hit) return;
      styleSnapRef.current = { objs: JSON.stringify(objectsRef.current), voiceId: voiceRef.current };
      setStyleSnapshotOn(true);
      pushHistory("op", `风格迁移：${hit.name}`);
      objectsRef.current = applyStyle(objectsRef.current, hit, buildAiCtx());
      applyVoiceId(hit.voiceId);
      if (hit.pad && !padOnRef.current) onTogglePad();
      setStylePresetState(hit.id);
      commitCanvas();
      setAnnounce(`风格迁移完成：${hit.name}${hit.pad ? "，垫音层已铺上" : ""}`);
    },
    [guardRo, pushHistory, commitCanvas, buildAiCtx, applyVoiceId, onTogglePad],
  );

  const aiRestoreStyle = useCallback(() => {
    if (guardRo()) return;
    if (relayLedgerRef.current) {
      setAnnounce("接龙态前人的段落锁着拍子，还原会动整曲——传完这棒再来");
      return;
    }
    const snap = styleSnapRef.current;
    if (!snap) return;
    pushHistory("op", "风格迁移还原");
    objectsRef.current = JSON.parse(snap.objs) as CanvasObject[];
    applyVoiceId(snap.voiceId);
    styleSnapRef.current = null;
    setStyleSnapshotOn(false);
    setStylePresetState(null);
    commitCanvas();
    setAnnounce("已还原原样");
  }, [guardRo, pushHistory, commitCanvas, applyVoiceId]);

  // ---- AI 歌词（文本生成接力）：选中旋律线 → 主题+语言 → 返回与音符对齐的分词歌词 ----
  // 歌词挂在所配对象上随对象走：撤销栈 / IndexedDB / ?canvas= 分享编码全走 CanvasObject 既有链路；
  // 逐字高亮复用引擎 canvasPhase（与 lookahead 排程同源时钟），组件 rAF 自取、不另起定时器
  const ccLyric = useCostConfirm();
  const [lyricTheme, setLyricTheme] = useState("");
  const [lyricLang, setLyricLang] = useState<LyricLang>("zh");
  const [lyricBusy, setLyricBusy] = useState(false);
  const [lyricError, setLyricError] = useState<string | null>(null);
  const [lyricActiveId, setLyricActiveId] = useState<string | null>(null);
  const [lyricStripOpen, setLyricStripOpen] = useState(true);
  const lyricBusyRef = useRef(false); // loading 防重（按钮 disabled 之外的双保险）
  const lyricActiveIdRef = useRef<string | null>(null);
  lyricActiveIdRef.current = lyricActiveId;

  // 配词基准索引：与 syncCanvasLoops 同款换算（排程与歌词高亮共用一份真源）
  const lyricBase = useCallback(
    () => {
      const sc = scaleRef.current;
      return { baseIdx: bandRange(sc).lo - sc.semitones.length * ACCOMP_OCTAVE_SHIFT, degs: bandDegs(sc) };
    },
    [],
  );

  // 选中目标 + 循环音符事件（bpm/音阶/画布任何改动即重算）
  const lyricCtx = useMemo(() => {
    const o = selectedId ? objectsRef.current.find((x) => x.id === selectedId) ?? null : null;
    if (!o || !lyricTargetOk(o)) return null;
    const b = lyricBase();
    const events = compileLyricEvents(o, bpmRef.current, b.baseIdx, b.degs);
    return {
      id: o.id,
      obj: o,
      label: objLabels(objectsRef.current).get(o.id) ?? "当前这条线",
      events,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, objectsVersion, bpm, scaleId, lyricBase]);

  // 选中已有词的对象 → 歌词条自动展开（词随选中对象走）
  useEffect(() => {
    const o = selectedId ? objectsRef.current.find((x) => x.id === selectedId) ?? null : null;
    if (o?.lyrics) {
      setLyricActiveId(o.id);
      setLyricStripOpen(true);
    }
  }, [selectedId, objectsVersion]);

  // 目标消失（取消选中/换鼓线/删对象）时歌词页签退回混音
  useEffect(() => {
    if (aiTab === "lyric" && !lyricCtx) setAiTab("mix");
  }, [aiTab, lyricCtx]);

  // 歌词条静态数据（words 按当下编译事件数现算对齐——几何改动天然重对齐）
  const lyricStrip = useMemo(() => {
    if (!lyricActiveId || !lyricStripOpen) return null;
    const o = objectsRef.current.find((x) => x.id === lyricActiveId) ?? null;
    if (!o?.lyrics) return null;
    const b = lyricBase();
    const events = compileLyricEvents(o, bpmRef.current, b.baseIdx, b.degs);
    return {
      objId: o.id,
      label: objLabels(objectsRef.current).get(o.id) ?? "当前这条线",
      lang: o.lyrics.lang,
      text: o.lyrics.text,
      words: alignLyricWords(tokenizeLyric(o.lyrics.text, o.lyrics.lang), events.length),
      frozen: accompPaused, // 伴奏暂停 = 非播放态 → 整行静态
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyricActiveId, lyricStripOpen, objectsVersion, bpm, scaleId, accompPaused, lyricBase]);

  // 逐字高亮时钟：引擎画布相位 → 循环内时刻 → 事件序号（rAF 自取，禁 setTimeout 驱动）
  const getLyricActive = useCallback((): number | null => {
    const id = lyricActiveIdRef.current;
    if (!id || accompPausedRef.current) return null;
    const o = objectsRef.current.find((x) => x.id === id) ?? null;
    if (!o?.lyrics) return null;
    const engine = engineRef.current;
    if (!engine) return null;
    const b = lyricBase();
    const spec = toLoopSpec(o, bpmRef.current, b.baseIdx, b.degs);
    const events = spec.events.filter((e) => e.d === undefined);
    const phase = engine.canvasPhase(o.id);
    if (phase === null || spec.period <= 0 || events.length === 0) return null;
    const t = phase * spec.period;
    let idx = -1;
    for (let i = 0; i < events.length; i += 1) {
      if (events[i].t <= t) idx = i;
      else break;
    }
    // 回卷：相位在本圈首音之前 = 上一圈尾巴，亮最后一字（空词位向前找最近有词的）
    if (idx < 0) idx = events.length - 1;
    while (idx >= 0 && o.lyrics.words.length <= idx) idx -= 1;
    return idx;
  }, [lyricBase]);

  const runLyricGen = useCallback(async () => {
    if (!lyricCtx || lyricBusyRef.current) return;
    lyricBusyRef.current = true;
    setLyricBusy(true);
    setLyricError(null);
    try {
      const messages = buildLyricMessages({
        events: lyricCtx.events,
        bpm: bpmRef.current,
        loopBeats: lyricCtx.obj.audio.loopBeats,
        theme: lyricTheme.trim(),
        lang: lyricLang,
      });
      const result = await callLlmWithFallback(LYRIC_LLM_MODEL, { messages, page: "home" });
      const target = objectsRef.current.find((x) => x.id === lyricCtx.id);
      if (!target) return; // 生成途中对象被删：静默作废
      if (result.ok && result.status === "success" && result.text) {
        const words = parseLyricJson(result.text);
        if (!words) {
          // 形状不对 = 业务失败：提示再试/换题，不空转重试同 prompt
          setLyricError("带回来的不是歌词形状，再试一次或换个主题");
          setAnnounce("歌词生成失败");
          return;
        }
        const aligned = alignLyricWords(words, lyricCtx.events.length);
        pushHistory("op", "AI 配词");
        target.lyrics = {
          lang: lyricLang,
          words: aligned,
          notes: lyricCtx.events.length,
          text: aligned.join(lyricLang === "zh" ? "" : " "),
        };
        commitCanvas();
        setLyricActiveId(target.id);
        setLyricStripOpen(true);
        setAnnounce("歌词已生成");
      } else {
        const code = result.needsLogin ? "rh_login_required" : result.error || "unknown";
        setLyricError(LLM_ERR_ZH[code] ?? LLM_ERR_ZH.unknown);
        setAnnounce("歌词生成失败，可以再试一次或换个主题");
      }
    } catch {
      setLyricError("发生未知错误，请再试一次或换个主题");
      setAnnounce("歌词生成失败");
    } finally {
      lyricBusyRef.current = false;
      setLyricBusy(false);
    }
  }, [lyricCtx, lyricTheme, lyricLang, pushHistory, commitCanvas]);

  const onGenerateLyrics = useCallback(() => {
    if (guardRo()) return;
    if (relayLedgerRef.current) {
      setLyricError("接龙态前人的段落锁着拍子——传完这棒再配词");
      return;
    }
    if (!lyricCtx) {
      setLyricError("先选中一条旋律线：鼓律动轨、自动化曲线与锚点不能配词");
      return;
    }
    if (lyricBusyRef.current) return; // loading 期间禁重复提交
    if (lyricCtx.events.length < 8) {
      setLyricError("这段太短，多画几个音再配词");
      return;
    }
    ccLyric.runWithCostConfirm(
      () => {
        void runLyricGen();
      },
      "将调用平台文本生成，可能消耗你的 RunningHub RH币/钱包余额，实际扣费以 RunningHub 为准",
    );
  }, [guardRo, lyricCtx, ccLyric, runLyricGen]);

  // 整行改写：按字数重新对齐（不做单字精修），随对象持久/分享/撤销
  const onRewriteLyric = useCallback(
    (raw: string) => {
      if (guardRo()) return;
      const text = raw.trim();
      if (!text) return;
      const o = objectsRef.current.find((x) => x.id === lyricActiveId) ?? null;
      if (!o?.lyrics) return;
      const b = lyricBase();
      const events = compileLyricEvents(o, bpmRef.current, b.baseIdx, b.degs);
      pushHistory("op", "改写歌词");
      o.lyrics = {
        lang: o.lyrics.lang,
        words: alignLyricWords(tokenizeLyric(text, o.lyrics.lang), events.length),
        notes: events.length,
        text,
      };
      commitCanvas();
      setAnnounce("歌词已改写");
    },
    [guardRo, lyricActiveId, pushHistory, commitCanvas, lyricBase],
  );

  const onToggleAi = useCallback(() => {
    const next = !aiOpen;
    setAiOpen(next);
    // 每次打开都重新分析（同画布确定性复现；「重新分析」按钮走同一入口）
    if (next) aiRunAnalyze();
  }, [aiOpen, aiRunAnalyze]);

  // AI 面板与接龙/卷帘同规则：只归作曲模式
  useEffect(() => {
    if (mode !== "compose") {
      setAiOpen(false);
      setAiHoverIds([]);
    }
  }, [mode]);

  return {
    canvasRef,
    stage,
    pitchLabel,
    bpm,
    recActive,
    recClock,
    shareOpen,
    shareUrl: shownShareUrl, // 勾选只读后自动带 &ro=1
    shareRo,
    onToggleShareRo: () => setShareRo((v) => !v),
    // 只读分享（?ro=1 打开时）：编辑全部挡下，顶栏可复制成自己的作品
    roMode,
    onUnlockRo: unlockRo,
    copied,
    helpOpen,
    autoScore,
    loopPlaying,
    mode,
    scaleName: scaleById(scaleId).name,
    voiceId,
    voiceName: voiceById(voiceId).name,
    // 音色编辑器（简化合成器）：HUD 音色菜单「造音色…」→ SynthPanel
    synthOpen,
    synthPatch,
    onOpenSynth,
    onCloseSynth,
    onSynthChange,
    onSynthAudition,
    onSynthReset,
    onSynthTemplate,
    onPickVoice,
    drumKitName: drumKitById(drumKitId).name,
    typingMode,
    typingModeName: typingModeName(typingMode),
    pianoBgOn,
    objectCount,
    maxObjects: MAX_CANVAS_OBJECTS,
    autoParam, // 曲线画笔：off = 笔迹；vol/cutoff/pan/reverb = 画该参数的曲线
    curveLabel: autoParam === "off" ? "曲线" : `曲线·${CURVE_PARAM_META[autoParam].name}`,
    onSetCurveParam,
    curvePanelOpen,
    onOpenCurvePanel,
    onCloseCurvePanel,
    curveInitial,
    getCurveByParam,
    setCurveForParam,
    curveActive,
    selectedId,
    padOn,
    sustainOn,
    softOn,
    composeHint,
    announce,
    guestCanvas,
    capToast,
    onStart,
    onCopy,
    onCloseShare: closeShare,
    onCloseHelp: closeHelp,
    onToggleHelp: toggleHelp,
    onReplayRecording,
    // 分享链接回放时间轴（只读演出 + 挑战「分享演奏」回放共用）：播放头跟随、拖/点 seek 续播
    replayTimeline,
    replayGetTime: rtElapsed, // 供时间轴组件 rAF 自取当前播放位置（不驱动整页重渲染）
    onReplaySeek,
    allMuted,
    onToggleAllMuted: toggleAllMuted,
    accompPaused,
    onToggleAccompPause: toggleAccompPause,
    onReplayTogglePlay,
    // 演奏历史：停止录音自动入档（≤6 条），HUD「历史」面板重放/两步确认删
    recHistory,
    recHistoryOpen,
    replayActive,
    onOpenRecHistory: () => setRecHistoryOpen(true),
    onCloseRecHistory: () => setRecHistoryOpen(false),
    onPlayRecHistory,
    onShareRecHistory,
    onStarRecHistory,
    onRemoveRecHistory,
    onTogglePad,
    onToggleSustain: toggleSustain,
    onToggleSoft: toggleSoft,
    onToggleRecord: toggleRecording,
    onClearCanvas,
    onCycleScale: cycleScale,
    onCycleVoice: cycleVoice,
    onCycleDrum: cycleDrumKit,
    onCycleTyping: cycleTypingMode,
    onTogglePianoBg: cyclePianoBg,
    onApplyConductorHints: applyConductorHints, // 指挥回复末尾的「stage 指令块」一键上台
    onConductorSnapshot: conductorSnapshot, // 逐项确认/撤销：应用前取当前设置快照，撤销回灌旧值
    onCanvasCritiqueBrief: canvasCritiqueBrief, // 「画布挑毛病」：把作曲画布摘要给指挥看
    // ---- 挑战模式 ----
    challengePhase,
    challengeLevel,
    challengeLevelName: (() => {
      if (chMode === "survival") return survivalDaily ? "生存·每日" : "生存";
      // 当局在打 UGC 自定义关（追加位）：HUD 关卡位显「曲名 ★N」
      if (activeCustomLevel && challengeLevel >= CHALLENGE_LEVELS.length)
        return `${activeCustomLevel.title} ★${activeCustomLevel.stars}`;
      const lv = chLevels()[challengeLevel];
      return lv ? `${lv.name} · ${lv.song}` : "";
    })(),
    challengeScore,
    comboCount,
    countdownNum,
    challengeResult: chResult,
    challengeLevels: [
      ...CHALLENGE_LEVELS.map((lv, i) => ({
        name: lv.name,
        song: lv.song,
        bpm: lv.bpm,
        desc: lv.desc,
        noteCount: lv.notes.length,
        unlocked: i < chProgress.unlocked,
        best: chProgress.best[i] ?? null,
        custom: false,
      })),
      customLevel
        ? {
            name: customLevel.name,
            song: "自定义谱面",
            bpm: customLevel.bpm,
            desc: customLevel.desc,
            noteCount: customLevel.notes.length,
            unlocked: true,
            best: null,
            custom: true,
          }
        : null,
    ],
    onOpenChartEditor: () => setChartEditorOpen(true),
    onCloseChartEditor: () => setChartEditorOpen(false),
    chartEditorOpen,
    onStartCustomChart: startCustomChart,
    // ---- UGC 自定义关卡（热门榜 / 出关发布 / 游玩分享） ----
    customLevels: customLevels
      ? customLevels.map((lv) => ({
          id: lv.id,
          title: lv.title,
          bpm: lv.bpm,
          stars: lv.stars,
          noteCount: lv.notes,
          nick: lv.nick,
          plays: lv.plays ?? 0,
          isMine: getNick().trim() !== "" && lv.nick === getNick().trim(),
        }))
      : null,
    onPlayCustomLevel: (id: string) => {
      const lv = (customLevels ?? []).find((x) => x.id === id);
      if (lv) playCustomLevel(lv);
    },
    onAuditionCustomLevel: (id: string) => {
      const lv = (customLevels ?? []).find((x) => x.id === id);
      if (lv) playCustomLevel(lv, true);
    },
    onShareCustomLevel: (id: string) => {
      setShareUrl(buildLevelShareUrl(id));
      setShareOpen(true);
    },
    onPublishFromCanvas: publishFromCanvas,
    onPublishCustomChart: publishCustomChart,
    ugcPreview: ugcPreview
      ? {
          title: ugcPreview.title,
          stars: ugcPreview.stars,
          bpm: ugcPreview.bpm,
          noteCount: ugcPreview.notes.length,
          dur: Math.max(1, Math.round(ugcPreview.dur)),
        }
      : null,
    ugcBusy,
    onUgcTitleChange: (v: string) =>
      setUgcPreview((prev) => (prev ? { ...prev, title: v.slice(0, 40) } : prev)),
    onUgcConfirmPublish: () => void confirmUgcPublish(),
    onUgcCancel: () => setUgcPreview(null),
    challengeHasNext:
      chResult !== null &&
      challengeLevel + 1 < CHALLENGE_LEVELS.length &&
      chProgress.unlocked > challengeLevel + 1,
    challengeMode: chMode, // "race" | "demo" | "practice"：HUD 标识与控制条形态共用
    challengeDemoBar: demoBar,
    challengeDemoBars: demoBars,
    practiceScale,
    practiceLoop,
    practiceHintBar, // 练顺提示条小节号（0 = 隐藏）；点击 = 调 onDemoJumpBar(1) 跳下一小节并自动收起
    fingeringOn,
    practiceFinSeq, // 当前小节指法左右手分行（chip 含手指数字 + 谱面音索引），点击 chip 循环改指法（覆盖持久化）
    onCycleFingering: chCycleFingering,
    // 本关是否存在手动微调（渲染期现算：cycle/reset/换关都伴随其他 setState 触发重渲染，取最新覆盖表）
    hasFinOverrides: Object.keys(chFinOvRef.current).some((k) => k.startsWith(`${chLevelRef.current}:`)),
    onResetFinOverrides: chResetFinOverrides,
    practiceFinActive, // 指法行跟随高亮：各手「下一个该弹」chip 下标（-1 = 无），随 judged 实时推进
    practiceClick, // 练习节拍器开关态（四分 click、小节头重拍，仅练习播放中出声）
    onTogglePracticeClick: chTogglePracticeClick,
    practiceAutoNext, // 练顺自动跳节开关态（开 = 两遍全中直接进下一小节）
    onTogglePracticeAutoNext: chTogglePracticeAutoNext,
    practiceWait, // 等待模式开关态（开 = 下一个音到线没弹上冻结时钟，弹对才继续）
    onTogglePracticeWait: chTogglePracticeWait,
    macro, // 乐句宏三态 off|arp|scale：触发音换成琶音扫弦/音阶跑动（A 键/HUD chip 循环）
    onToggleMacro: toggleMacro,
    canUndo, // 作曲撤销/重做（快照栈 + Ctrl+Z/Ctrl+Y/HUD ↶↷；拖动只在实际改变时入栈）
    canRedo,
    onUndo: undo,
    onRedo: redo,
    // 作曲历史面板：栈每步带动作描述，当前位置 = 撤销栈长度；跳转 = 在撤销/重做栈之间挪位
    histOpen,
    histSteps: useMemo(() => undoRef.current.map((s) => s.label), [histVersion]),
    histPos: undoRef.current.length,
    histAhead: redoRef.current.length,
    histLimit: 80,
    onToggleHist: () => setHistOpen((v) => !v),
    onCloseHist: () => setHistOpen(false),
    onHistJump: jumpHistory,
    slotMetas, // 命名存档位（HUD「存档」面板：存新档/载入/覆写/删，载入前压撤销栈）
    onSaveSlot: saveSlot,
    onLoadSlot: loadSlot,
    onRemoveSlot: removeSlot,
    // 跨存档复制：存档行「复制」→ 勾选对象（默认全选）→ 追加进当前画布（错开/可撤销/原档不动）
    copyPick,
    onStartCopySlot: startCopySlot,
    onCancelCopySlot: () => setCopyPick(null),
    onConfirmCopySlot: confirmCopySlot,
    // 拖手柄改循环时长的音符处理选择条（松手浮出；记住后持久 so-resize-mode-v1）
    resizePick: (() => {
      if (!resizePick) return null;
      const cur = objectsRef.current.find((o) => o.id === resizePick.id);
      return cur ? { from: resizePick.orig.audio.loopBeats, to: cur.audio.loopBeats } : null;
    })(),
    onChooseResizeMode: chooseResizeMode,
    onCancelResizePick: cancelResizePick,
    onExportMidi: exportMidi, // MIDI 导出：repeats = 最长循环 × N 遍（objectCount/bpm 已在返回块别处）
    onExportAudio: exportAudio, // 音频导出：实时录主总线 → WAV 下载
    audioBusy,
    onExportCover: exportCover, // 封面分享图：画布作品 → 16:9 PNG
    // 分轨混音台：每条线/锚点独立音量/声像/静音/独奏（so-mix-v1 持久，引擎发声侧即时生效）
    mixOpen,
    mixItems,
    onSetObjMix: setObjMix,
    onOpenMix: () => setMixOpen(true),
    onCloseMix: () => setMixOpen(false),
    onResetMix: resetMix,
    onMixPreset: applyMixPreset,
    // 钢琴卷帘（选中线后打开）：拖音高/时值、双击删、点空加、一键回到笔迹曲线
    rollOpen,
    rollTarget,
    // 乐句变形器：当前选中对象（含「线 N」标签）与变形动作入口
    deformTarget,
    onDeform: applyDeform,
    onOpenRoll: openRoll,
    onApplyRoll: applyRoll,
    onResetRollToCurve: resetRollToCurve,
    onCloseRoll: () => setRollOpen(false),
    fx, // 空间效果：vol/rev/dly 0..1（master 0.08..0.9、湿量封顶 0.5，持久 so-fx-v1）
    onSetFx: setFxValue,
    // 听感：音乐推子（master 上的串乘，持久 so-music-v1）+ 判定延迟校准（so-calib-v1，ms）
    musicVol,
    onSetMusicVol: setMusicVol,
    calibMs,
    calibRunning,
    calibTaps,
    engineLatencyMs,
    onCalibStart: startCalib,
    onCalibTap: calibTap,
    onCalibAbort: abortCalib,
    onSetCalibMs: applyCalib,
    perfMode,
    perfActive,
    fpsNow,
    onSetPerfMode: setPerfMode,
    // 无障碍：色盲友好配色 / 纯视觉节奏模式 / 轨迹文字描述导出
    cbMode,
    visualOnly,
    onSetCbMode: setCbMode,
    onSetVisualOnly: setVisualOnly,
    onExportCanvasText: exportCanvasText,
    // AI 合奏伙伴：开关 / 人格（模仿·对比·推进）/ 和声 / 是否正在接话
    jamOn,
    jamPersona,
    jamHarmony,
    jamVoices,
    jamGap,
    jamSpeaking,
    onToggleJam: toggleJam,
    onSetJamPersona: setJamPersona,
    onToggleJamHarmony: toggleJamHarmony,
    onSetJamVoices: setJamVoices,
    onSetJamGap: setJamGap,
    // 画布循环速度 + HUD BPM 面板（滑杆/±2/打拍，setBpmValue 同步重排循环；bpm 本体在上方已返回）
    onSetBpm: setBpmValue,
    // MIDI 键盘输入（Web MIDI）：演奏钢琴玩法 + 挑战判定共用；note-on → 26 键映射 → 既有入口
    midiIn,
    midiDevs,
    onToggleMidiIn: toggleMidiIn,
    touchKeys, // 触屏键盘开关（HUD「琴键」；TouchPiano 浮层 + touchPlayKey 发声）
    onToggleTouchKeys: () => setTouchKeys((v) => !v),
    // 键盘布局与黑键模式（HUD「键位」「黑键」chip；均本地持久）
    keymap,
    blackMode,
    onToggleKeymap: () => setKeymap(keymap === "qwerty" ? "piano" : "qwerty"),
    onToggleBlackMode: () => setBlackMode(!blackMode),
    onTouchKey: touchPlayKey,
    galleryOpen, // 公共画廊浮层（作品列表/发布/载入 + 昵称 + 天梯）
    conductorOpen, // 乐团指挥浮层（常驻 AI 角色多轮对话）
    onToggleConductor: () => setConductorOpen((v) => !v),
    onCloseConductor: () => setConductorOpen(false),
    galleryWorks,
    nick,
    onToggleGallery: onToggleGallery,
    onCloseGallery: () => setGalleryOpen(false),
    onPublishWork: publishCurrentWork,
    onLoadWork: loadGalleryWork,
    onSaveNick,
    timbreMode, // 动态音色档位 off|auto|glass|pluck|lead（HUD「动色」菜单直选）
    timbreLabel:
      timbreMode === "off" ? "动色" : timbreMode === "auto" ? "动色·自动" : `动色·${voiceById(timbreMode).name}`,
    onSetTimbre: setTimbre,
    lsState, // 循环台状态 off|rec|play|dub（HUD chip + 空格让位判定同源）
    lsLayerCount: lsLayersRef.current.length, // 已叠加层数（重排/清空伴随 setState，渲染期取到最新）
    onLsToggle: lsToggle,
    onLsClear: lsClear,
    onLsUndoLayer: lsUndoLayer,
    onToggleFingering: chToggleFingering,
    onDemoTogglePause: chSpace, // 演示/练习通用暂停·继续（空格同义）
    onDemoJumpBar: chDemoJumpBar,
    onSetPracticeScale: chSetPracticeScale,
    onTogglePracticeLoop: chTogglePracticeLoop,
    onEnterChallenge: jumpToChallenge,
    onStartLevel: (index: number) => chStartLevel(index),
    onStartDemoLevel: (index: number) => chStartLevel(index, "demo"),
    onStartPracticeLevel: (index: number) => chStartLevel(index, "practice"),
    // ---- 生存模式（HUD + 选关卡 + 结算共用）----
    onStartSurvival: () => chStartSurvival(),
    onStartSurvivalDaily: () => chStartSurvival(true), // 每日挑战：当天日期种子，全员同谱
    survivalBest: survBest, // 本地最佳坚持秒数（0 = 还没有纪录）
    survivalBoard: survBoard, // level=100 Top5（null = 未拉取）
    onLoadSurvivalBoard: loadSurvivalBoard,
    dailyBest, // 今日最佳（隔天作废）
    dailyBoard, // level=200 过滤今天后 Top5（null = 未拉取）
    onLoadDailyBoard: loadDailyBoard,
    survivalDaily, // 当局是否每日挑战局（HUD 关卡位与结算文案用）
    survivalLives: survLives,
    survivalSeconds: survSec,
    survivalSpeedPct: survPct,
    survivalDouble: survDouble,
    onChallengeRetry: chRetry,
    onChallengeSharePerformance: chSharePerformance,
    onChallengeNext: chNextLevel,
    onChallengeDemo: chWatchDemo,
    onChallengePractice: chPracticeThisLevel,
    onEndDemo: chEndDemo,
    onEndPractice: chEndDemo, // 同一收束逻辑（暂停态先恢复引擎）
    onExitChallenge: exitChallenge,
    // ---- 接龙作曲（异步协作传纸条）：账本走 ?relay= 链接，无服务端状态 ----
    relayLedger, // null = 非接龙态
    relayInfo, // { myLegNo, prevNick, myCount, myLegIdx, legs, ...渲染边界 }
    relayOpen,
    onToggleRelay: () => setRelayOpen((v) => !v),
    onCloseRelay: () => setRelayOpen(false),
    onStartRelay,
    onPassRelay,
    relayCanPass: relayInfo !== null && relayInfo.myCount > 0, // 本棒一件没画就禁传
    relaySoloLeg,
    onToggleRelaySoloLeg,
    // ---- 哼唱转音符（作曲模式专属）：面板开关 / 拾音态 / 实时帧缓冲（面板 rAF 直绘零 setState）----
    humOpen,
    onOpenHum,
    onCloseHum,
    humRecording,
    humSeconds,
    humError,
    humSummary,
    onHumStart: humStart,
    onHumStop: humStop,
    onHumCommit: humCommit,
    humSnapOn,
    onToggleHumSnap: () => setHumSnapOn((v) => !v),
    humQuantOn,
    onToggleHumQuant: () => setHumQuantOn((v) => !v),
    humFramesRef,
    humScaleSemitones: scaleById(scaleId).semitones,
    // ---- AI 指挥台（混音建议 / 编曲建议 / 风格迁移；纯本地规则引擎）----
    aiOpen,
    onToggleAi,
    aiTab,
    onSetAiTab: (t: "mix" | "arrange" | "style" | "lyric") => setAiTab(t),
    aiMixList,
    aiArrangeList,
    aiApplyLocked: relayLedger !== null, // 接龙态：可查看、应用置灰
    onAiAnalyze: aiRunAnalyze,
    onAiApply: aiApplyOne,
    onAiApplyAll: aiApplyAll,
    onAiIgnore: aiIgnore,
    onAiHover: (ids: string[]) => setAiHoverIds(ids),
    stylePresets: STYLE_PRESETS,
    stylePreset,
    styleSnapshotOn,
    onAiApplyStyle: aiApplyStyle,
    onAiRestoreStyle: aiRestoreStyle,
    // ---- AI 歌词（文本生成接力：与音符对齐的分词歌词 + 循环逐字高亮；访客登录后自付）----
    costCc: ccLyric,
    lyricTargetAvailable: lyricCtx !== null,
    lyricTargetLabel: lyricCtx ? lyricCtx.label : "",
    lyricNoteCount: lyricCtx ? lyricCtx.events.length : 0,
    lyricHasExisting: !!(lyricCtx && lyricCtx.obj.lyrics),
    lyricTheme,
    onSetLyricTheme: (v: string) => setLyricTheme(v),
    lyricLang,
    onSetLyricLang: (l: LyricLang) => setLyricLang(l),
    lyricBusy,
    lyricError,
    onGenerateLyrics,
    onRewriteLyric,
    lyricStrip,
    getLyricActive,
    onCloseLyricStrip: () => setLyricStripOpen(false),
  };
}

// Y → 音级度数（作曲层复用，上=高，按当前音阶级数量化）
function degFromNy(ny: number, degs: number): number {
  return clamp(Math.floor((1 - clamp(ny, 0, 1)) * degs), 0, degs - 1);
}
