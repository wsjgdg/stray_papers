// 滚动乐团 · 挑战模式纯逻辑：谱面数据 / 判定窗口 / 计分评级 / 本地进度
// 无 React、无 canvas：t 一律是谱内秒数（由 AudioContext.currentTime 的 lookahead 调度换算），禁 setTimeout 驱动音符。
import { PIANO_KEYS, pianoPosOfMidi } from "@/lib/audio/pianoMap";
import { bandRange, scaleMidi, type Scale } from "@/lib/audio/scales";
import { toLoopSpec, type CanvasObject } from "@/lib/canvas/scoreCanvas";

// 判定窗口（秒）：|Δt|≤90ms Perfect，≤180ms Good，超窗 Miss
export const PERFECT_WINDOW = 0.09;
export const GOOD_WINDOW = 0.18;

// 关卡自带判定窗（UGC 高难关收紧用）：无自带窗的关卡（公版五关 / 生存 / 导入谱）一律回落全局常量，
// tick 与击符两处判定共用同一入口，保证「超窗 Miss」与「窗内选音」两条链路永远同窗
export function levelWindows(
  lv: { pw?: number; gw?: number } | undefined,
): { pw: number; gw: number } {
  return { pw: lv?.pw ?? PERFECT_WINDOW, gw: lv?.gw ?? GOOD_WINDOW };
}
// Perfect 边缘带：|Δt| 在 60–90ms 的 Perfect 算"压点边缘命中"，触发特殊闪光
export const PERFECT_EDGE_MS = 60;
// 最后一个音符到达后再等待这么久收束进结算（尾音）
export const CHALLENGE_TAIL = 1.2;
// 3·2·1 倒计时总时长（秒）：倒计时起点 + COUNTDOWN_SEC = 谱面 0 点（唯一权威时钟 AudioContext.currentTime，rAF 只采样画数字）
export const COUNTDOWN_SEC = 3;

// 下落时长与 BPM 成比例：阅读速度恒定 = 每拍恒定屏高比例（顶部 → 判定线永远走 FALL_BEATS 拍）。
// 于是 1/8 拍的音符垂直间距恰为 1/2 拍的一半，间距严格正比时间；谱面最小拍距 ≥0.5 拍，同轨永不叠块。
export const FALL_BEATS = 4;

export function fallSecFor(bpm: number): number {
  return (FALL_BEATS * 60) / bpm;
}

// 小节 = 4 拍：小节网格与谱面 0 拍（t=0）对齐，供演示逐小节跳转与「第 N / M 小节」显示
export function barSecFor(bpm: number): number {
  return (4 * 60) / bpm;
}

// 总小节数按最后一个音符所在拍位推（含尾音所在小节）
export function totalBarsOf(notes: ChartNote[], barSec: number): number {
  const last = notes.length > 0 ? notes[notes.length - 1].t : 0;
  return Math.max(1, Math.floor(last / barSec) + 1);
}

export type Grade = "S" | "A" | "B" | "C";
export type JudgeKind = "perfect" | "good" | "miss";

export interface ChartNote {
  t: number; // 到达判定线的谱内秒数
  key: number; // pianoMap 白键索引 0..25（轨道 = 该白键水平位置）
  black: boolean; // true = 必须 Shift+字母 命中；false = 直接按字母
}

export interface ChallengeLevel {
  id: string;
  name: string;
  song: string; // 曲名副标题（关卡卡与 HUD 关卡名 chip 共用）
  bpm: number;
  fall: number; // 下落时长 = fallSecFor(bpm)
  desc: string;
  notes: ChartNote[];
  // UGC 自定义关自带参数（缺省 = 全局判定窗 + fallSecFor(bpm)，公版五关与导入谱完全不变）
  pw?: number; // 自带 Perfect 窗（秒）
  gw?: number; // 自带 Good 窗（秒）
  stars?: number; // 自动难度星级 1–5（HUD「曲名 ★N」与关卡卡共用）
}

// 指法建议标注（启发式·建议级，非专业编指）：hand L/R + finger 1–5（钢琴记法，1=拇指…5=小指）。
// 分手：C4=60 为界，低于归左手、及以上归右手——旋律+低音的双音天然分两手各一。
// 同一手连续音符按旋律走向循环指派：上行 +1（到 5 或音程 ≥5 半音跨四度回 1，模拟扩指跨指）、
// 下行 −1（对称回 5）、同音保持；黑键尽量落 2/3/4 长指——非跨指时 1→2、5→4 内移，跨指保持走向。
export type FingerMark = { hand: "L" | "R"; finger: number };

export function annotateFingering(notes: ChartNote[]): (FingerMark | null)[] {
  const marks: (FingerMark | null)[] = new Array(notes.length).fill(null);
  const lastF = { L: 0, R: 0 }; // 0 = 该手还没出现过音
  const lastM = { L: -1, R: -1 };
  for (let i = 0; i < notes.length; i += 1) {
    const n = notes[i];
    const pk = PIANO_KEYS[Math.max(0, Math.min(PIANO_KEYS.length - 1, n.key))];
    const midi = n.black ? pk.blackMidi ?? pk.midi : pk.midi;
    const hand: "L" | "R" = midi < 60 ? "L" : "R";
    let finger: number;
    let wrapped = false;
    if (lastF[hand] === 0) {
      finger = n.black ? 3 : 1; // 该手首音：黑键落长指、白键落拇指
    } else if (midi === lastM[hand]) {
      finger = lastF[hand]; // 同音保持
    } else if (midi > lastM[hand]) {
      wrapped = lastF[hand] === 5 || midi - lastM[hand] >= 5;
      finger = wrapped ? 1 : lastF[hand] + 1;
    } else {
      wrapped = lastF[hand] === 1 || lastM[hand] - midi >= 5;
      finger = wrapped ? 5 : lastF[hand] - 1;
    }
    // 黑键长指偏好：仅非跨指时内移（跨指本就是走向优先的指法动作，保持 1/5）
    if (n.black && !wrapped) finger = finger === 1 ? 2 : finger === 5 ? 4 : finger;
    marks[i] = { hand, finger };
    lastF[hand] = finger;
    lastM[hand] = midi;
  }
  return marks;
}

// 拍号表（MIDI 音高）→ 事件表：[拍位, MIDI]，按 pianoMap 反查成白键索引 + 黑键标志
// 后换算成秒排序；双音同拍 = 同一拍位写两行（旋律 + 低音）。扒谱时音高超出 26 键范围
// 应整体移八度到映射内（C3 起升序白键，Shift = 该白键右邻黑键），反查失败仅作兜底防御跳过。
export function chartByBeats(bpm: number, leadSec: number, seq: [number, number][]): ChartNote[] {
  const beat = 60 / bpm;
  const out: ChartNote[] = [];
  for (const [b, midi] of seq) {
    const pos = pianoPosOfMidi(midi);
    if (!pos) continue;
    out.push({ t: leadSec + b * beat, key: pos.key, black: pos.black });
  }
  return out.sort((a, z) => a.t - z.t);
}

// 五关全部为公版名曲（追加式扩容：旧三关 id/顺序不变，旧 localStorage 存档 best[3]/[4] 自然回落 null）。
// 本轮为逐曲复核后的修正扒谱（节奏与音准）：小星星全曲六句全白键；致爱丽丝 A 段（开头 E/D# 交替是 16 分！）；
// 卡农 D–A–Bm–F#m–G–D–G–A 两轮循环（旋律 2 分 ×2 + 低音根/三度同拍双音，轮 2 高八度再现，弃错音 G#4）；
// 茉莉花五声音阶全曲（无 G#/D#）；土耳其进行曲主题两遍 + A5+A3 双音收束（弃 D# 半音下行错音）。
// MIDI 速查：C4=60 D4=62 E4=64 F4=65 G4=67 A4=69 B4=71 C5=72 C#5=73 D5=74 D#5=75 E5=76 F#5=78
// G5=79 G#5=80 A5=81 B5=83 C6=84 C#6=85 D6=86 E6=88 F6=89 F#6=90；低音 D3=50 F#3=54 G3=55 A3=57 B3=59 C#4=61 D4=62。
export const CHALLENGE_LEVELS: ChallengeLevel[] = [
  {
    id: "awaken",
    name: "初醒",
    song: "小星星",
    bpm: 80,
    fall: fallSecFor(80), // 3.00s
    desc: "全白键 · 全曲六句",
    // 小星星全曲六句（每句 8 拍：前 6 个 4 分 + 第 7 个长音占 2 拍）：
    // ①C C G G A A G(长) ②F F E E D D C(长) ③G G F F E E D(长) ④同③ ⑤同① ⑥同②（尾音长收尾）
    notes: chartByBeats(80, 1.4, [
      // ① 一闪一闪亮晶晶
      [0, 60],
      [1, 60],
      [2, 67],
      [3, 67],
      [4, 69],
      [5, 69],
      [6, 67],
      // ② 满天都是小星星
      [8, 65],
      [9, 65],
      [10, 64],
      [11, 64],
      [12, 62],
      [13, 62],
      [14, 60],
      // ③ 挂在天空放光明
      [16, 67],
      [17, 67],
      [18, 65],
      [19, 65],
      [20, 64],
      [21, 64],
      [22, 62],
      // ④ 好像许多小眼睛
      [24, 67],
      [25, 67],
      [26, 65],
      [27, 65],
      [28, 64],
      [29, 64],
      [30, 62],
      // ⑤ 重复①
      [32, 60],
      [33, 60],
      [34, 67],
      [35, 67],
      [36, 69],
      [37, 69],
      [38, 67],
      // ⑥ 重复②（尾音长收尾）
      [40, 65],
      [41, 65],
      [42, 64],
      [43, 64],
      [44, 62],
      [45, 62],
      [46, 60],
    ]),
  },
  {
    id: "surge",
    name: "暗涌",
    song: "致爱丽丝",
    bpm: 110,
    fall: fallSecFor(110), // 2.18s
    desc: "A 段完整 · D#/G# 用 Shift",
    // 致爱丽丝完整 A 段（修正节奏：开头 E5/D#5 交替是 16 分 = 0.25 拍，不是均匀 8 分）：
    // 主题 16 分交替 → B4 D#5 C5 A4(长) → C4 E4 A4 B4 → E4(长) G#4 B4 C5 → E5(长)
    // → 回绕再现（同主题）→ … → E5(长) → 收尾 B4 E4 C5 A4(长尾)。黑键 = D#5×6 + G#4×2。
    notes: chartByBeats(110, 1.2, [
      // 主题（16 分交替 + 收句）
      [0, 76],
      [0.25, 75],
      [0.5, 76],
      [0.75, 75],
      [1, 76],
      [1.5, 71],
      [2, 75],
      [2.5, 72],
      [3, 69],
      // 下行接句
      [4.5, 60],
      [5, 64],
      [5.5, 69],
      [6, 71],
      [6.5, 64],
      [7.5, 68],
      [8, 71],
      [8.5, 72],
      [9, 76],
      // 回绕再现
      [11, 76],
      [11.25, 75],
      [11.5, 76],
      [11.75, 75],
      [12, 76],
      [12.5, 71],
      [13, 75],
      [13.5, 72],
      [14, 69],
      [15.5, 60],
      [16, 64],
      [16.5, 69],
      [17, 71],
      [17.5, 64],
      [18.5, 68],
      [19, 71],
      [19.5, 72],
      [20, 76],
      // 收尾句
      [22, 71],
      [22.5, 64],
      [23, 72],
      [24, 69],
    ]),
  },
  {
    id: "frenzy",
    name: "狂潮",
    song: "卡农",
    bpm: 100,
    fall: fallSecFor(100), // 2.40s
    desc: "双音持续整曲 · F#/C#",
    // 卡农 8 和弦循环（D A Bm F#m G D G A），每小节 4 拍：旋律 2 个二分音（@0,@2）
    // 与低音 2 个根音/三度（@0,@2）同拍双音持续整曲。轮 1 下行主题，轮 2 高八度再现（旋律 +12），
    // 低音两轮相同；m8 尾音 C#5 回拽进下一轮；收束 D5+D3 双音。黑键 = F#/C# 系（弃旧谱 G#4 错音）。
    notes: chartByBeats(100, 1.0, [
      // 轮 1 旋律 + 低音（每小节 @0 与 @2 各一对双音）
      [0, 78],
      [0, 50],
      [2, 76],
      [2, 54],
      [4, 74],
      [4, 57],
      [6, 73],
      [6, 61],
      [8, 71],
      [8, 59],
      [10, 69],
      [10, 62],
      [12, 71],
      [12, 54],
      [14, 73],
      [14, 57],
      [16, 74],
      [16, 55],
      [18, 71],
      [18, 59],
      [20, 69],
      [20, 50],
      [22, 74],
      [22, 54],
      [24, 71],
      [24, 55],
      [26, 67],
      [26, 59],
      [28, 69],
      [28, 57],
      [30, 73],
      [30, 61],
      // 轮 2：旋律高八度再现 + 低音同轮 1
      [32, 90],
      [32, 50],
      [34, 88],
      [34, 54],
      [36, 86],
      [36, 57],
      [38, 85],
      [38, 61],
      [40, 83],
      [40, 59],
      [42, 81],
      [42, 62],
      [44, 83],
      [44, 54],
      [46, 85],
      [46, 57],
      [48, 86],
      [48, 55],
      [50, 83],
      [50, 59],
      [52, 81],
      [52, 50],
      [54, 86],
      [54, 54],
      [56, 83],
      [56, 55],
      [58, 79],
      [58, 59],
      [60, 81],
      [60, 57],
      [62, 85],
      [62, 61],
      // 收束：D5 + D3 双音
      [64, 74],
      [64, 50],
    ]),
  },
  {
    id: "dawn",
    name: "晨光",
    song: "茉莉花",
    bpm: 95,
    fall: fallSecFor(95), // 2.53s
    desc: "民歌五声 · 附点长音",
    // 茉莉花全曲（C 大调五声音阶，谱内不允许 G#/D#——旧谱两处半音装饰为错音已弃）：
    // P1/P2 好一朵美丽的茉莉花（E E G A A G A E 长）→ P3 芬芳美丽满枝桠（G G A G E(长) D E G E D C D 长）
    // → P4 又香又白人人夸（A A C5 B A G A 长）→ P1'/P2' 再现 → 尾 茉莉花呀茉莉花（E G A G E D E 长尾）
    notes: chartByBeats(95, 1.3, [
      // P1 好一朵美丽的茉莉花
      [0, 64],
      [0.5, 64],
      [1, 67],
      [1.5, 69],
      [2, 69],
      [2.5, 67],
      [3, 69],
      [4, 64],
      // P2  repeats
      [8, 64],
      [8.5, 64],
      [9, 67],
      [9.5, 69],
      [10, 69],
      [10.5, 67],
      [11, 69],
      [12, 64],
      // P3 芬芳美丽满枝桠
      [16, 67],
      [16.5, 67],
      [17, 69],
      [17.5, 67],
      [18, 64],
      [20, 62],
      [20.5, 64],
      [21, 67],
      [21.5, 64],
      [22, 62],
      [22.5, 60],
      [23, 62],
      // P4 又香又白人人夸
      [26, 69],
      [26.5, 69],
      [27, 72],
      [27.5, 71],
      [28, 69],
      [28.5, 67],
      [29, 69],
      // P1' 再现
      [32, 64],
      [32.5, 64],
      [33, 67],
      [33.5, 69],
      [34, 69],
      [34.5, 67],
      [35, 69],
      [36, 64],
      // P2' 再现
      [40, 64],
      [40.5, 64],
      [41, 67],
      [41.5, 69],
      [42, 69],
      [42.5, 67],
      [43, 69],
      [44, 64],
      // 尾 茉莉花呀茉莉花
      [48, 64],
      [48.5, 67],
      [49, 69],
      [49.5, 67],
      [50, 64],
      [50.5, 62],
      [51, 64],
    ]),
  },
  {
    id: "gale",
    name: "疾风",
    song: "土耳其进行曲",
    bpm: 140,
    fall: fallSecFor(140), // 1.71s
    desc: "主题两遍 · A 大调 · 双音收束",
    // 莫扎特 Rondo Alla Turca 主题两遍 + 双音收束（A 大调；A 大调不存在 D#，旧谱半音下行 D#5 系错音已弃）：
    // A5 B5 A5 G#5 A5(长) E5(长) A5 E5 A5(长) → C#4 E4 A4 B4 C#5(长) → 再现号角 → C#5 D5 E5(长)；
    // 第二遍 +18 拍整段重复；尾 A5+A3 双音收束。黑键 = G#5/C#5/C#4。
    notes: chartByBeats(140, 1.0, [
      // 第一遍（@0–15）
      [0, 81],
      [0.5, 83],
      [1, 81],
      [1.5, 80],
      [2, 81],
      [3, 76],
      [4, 81],
      [4.5, 76],
      [5, 81],
      [6, 61],
      [6.5, 64],
      [7, 69],
      [7.5, 71],
      [8, 73],
      [10, 81],
      [10.5, 83],
      [11, 81],
      [11.5, 80],
      [12, 81],
      [13, 76],
      [14, 73],
      [14.5, 74],
      [15, 76],
      // 第二遍（整段 +18 拍）
      [18, 81],
      [18.5, 83],
      [19, 81],
      [19.5, 80],
      [20, 81],
      [21, 76],
      [22, 81],
      [22.5, 76],
      [23, 81],
      [24, 61],
      [24.5, 64],
      [25, 69],
      [25.5, 71],
      [26, 73],
      [28, 81],
      [28.5, 83],
      [29, 81],
      [29.5, 80],
      [30, 81],
      [31, 76],
      [32, 73],
      [32.5, 74],
      [33, 76],
      // 尾：A5 + A3 双音收束
      [36, 81],
      [36, 57],
    ]),
  },
];

// 准确率 = (Perfect + Good) / 总音符；评级阈值见规格
export function gradeFor(accuracy: number): Grade {
  if (accuracy >= 0.95) return "S";
  if (accuracy >= 0.85) return "A";
  if (accuracy >= 0.7) return "B";
  return "C";
}

// ---- 本地进度（localStorage：已解锁关卡数 + 每关最高评级；读取失败只解锁第 1 关）----

const STORE_KEY = "so-challenge-progress";

export interface ChallengeProgress {
  unlocked: number; // 已解锁的关卡数量（1..5）
  best: (Grade | null)[]; // 每关最高评级
}

export function loadChallengeProgress(): ChallengeProgress {
  const fallback: ChallengeProgress = { unlocked: 1, best: CHALLENGE_LEVELS.map(() => null) };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<ChallengeProgress>;
    // 旧存档（3 关）best 数组短于 5：缺口回落 null；unlocked 按新关卡数封顶
    const best = CHALLENGE_LEVELS.map((_, i) => {
      const g = Array.isArray(data.best) ? data.best[i] : null;
      return g === "S" || g === "A" || g === "B" || g === "C" ? g : null;
    });
    const unlocked = Number.isFinite(data.unlocked)
      ? Math.min(CHALLENGE_LEVELS.length, Math.max(1, Math.round((data.unlocked as number) || 1)))
      : 1;
    return { unlocked, best };
  } catch {
    return fallback;
  }
}

const GRADE_RANK: Record<Grade, number> = { C: 0, B: 1, A: 2, S: 3 };

// ---- 生存模式：增量生成 + 提速 / 双倍 / 生命参数 ----

export const SURVIVAL_BPM = 84; // 起始拍速：提速只缩短新续批小节的拍距与 fall，不重写历史 t
export const SURVIVAL_LIVES = 3; // 3 次 Miss 立即结算（无缓冲、无补命）
export const SURVIVAL_SPEEDUP_HITS = 20; // 每 20 个正确音（P+G 合计）整体提速 5%
export const SURVIVAL_SPEED_STEP = 0.95; // 秒距与 fall 同比例缩短的倍率
export const SURVIVAL_SPEED_MIN = 0.55; // 提速下限 = 初始的 55%（到顶不再快）
export const SURVIVAL_DOUBLE_HITS = 50; // 每累计 50 个正确音触发双倍段
export const SURVIVAL_DOUBLE_LEN = 16; // 双倍段 = 接下来 16 个音得分 ×2
export const SURVIVAL_SCORE_LEVEL = 100; // 天梯上报占位关卡号（listTopScores(100) 即生存榜）
export const SURVIVAL_START_BARS = 3; // 开局预生成小节数（tick 里未判余量 < 2 小节时续批）

// 生存评级按时长档（而非准确率）
export function survivalGrade(sec: number): Grade {
  if (sec >= 240) return "S";
  if (sec >= 120) return "A";
  if (sec >= 60) return "B";
  return "C";
}

// 本地最佳坚持时长（秒，number）：结算超越最佳由 Logic 播报
const SURVIVAL_BEST_KEY = "so-survival-best";

export function loadSurvivalBest(): number {
  try {
    const v = Number(window.localStorage.getItem(SURVIVAL_BEST_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

// 只升不降；写入并返回是否刷新了最佳
export function saveSurvivalBest(sec: number): boolean {
  const s = Math.max(0, Math.floor(sec));
  if (s <= loadSurvivalBest()) return false;
  try {
    window.localStorage.setItem(SURVIVAL_BEST_KEY, String(s));
  } catch {
    // localStorage 不可用：本局最佳仅在本次会话内可见
  }
  return true;
}

// ---- 每日挑战种子：本地日期定种子，当天所有人音符流完全一致，零点换新谱 ----

export const SURVIVAL_DAILY_SCORE_LEVEL = 200; // 每日局天梯占位关卡号（普通生存 = 100）

// 本地日期键 "YYYY-MM-DD"（禁用 toISOString 的 UTC 偏移，按本机日历拼）
export function survivalDailyKey(date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

// 日期串 → LCG 种子（FNV-1a 32 位哈希再扰动一轮；同一天同种子，生成器内 LCG 可复现）。
// 生成序列与玩家提速无关：细胞/轮廓只按小节推进、提速只压缩秒距，同种子 = 同序列，公平可比。
export function survivalDailySeed(key?: string): number {
  const k = key ?? survivalDailyKey();
  let h = 2166136261;
  for (let i = 0; i < k.length; i += 1) {
    h ^= k.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h ^ 0x5bd1e995) >>> 0;
}

// 今日最佳按日期存（so-survival-daily-best {day, sec}）：day ≠ 今天视为无（隔天自动作废）
const SURVIVAL_DAILY_BEST_KEY = "so-survival-daily-best";

export function loadSurvivalDailyBest(today: string): number {
  try {
    const raw = window.localStorage.getItem(SURVIVAL_DAILY_BEST_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw) as { day?: unknown; sec?: unknown };
    if (data.day !== today || typeof data.sec !== "number" || !Number.isFinite(data.sec)) return 0;
    return Math.max(0, Math.floor(data.sec));
  } catch {
    return 0;
  }
}

export function saveSurvivalDailyBest(today: string, sec: number): boolean {
  const s = Math.max(0, Math.floor(sec));
  if (s <= loadSurvivalDailyBest(today)) return false;
  try {
    window.localStorage.setItem(SURVIVAL_DAILY_BEST_KEY, JSON.stringify({ day: today, sec: s }));
  } catch {
    // localStorage 不可用：今日最佳仅在本次会话内可见
  }
  return true;
}

// 一小节节奏细胞库（拍位偏移，首项恒为 0 的强拍锚点）：simple = 前 40 音只用的简单细胞，
// 之后逐步放开密细胞（难度渐进）。每小节抽一个且不与上一小节重复。
const SURVIVAL_CELLS: { hits: number[]; simple: boolean }[] = [
  { hits: [0, 1, 2, 3], simple: true }, // 四分平稳
  { hits: [0, 2], simple: true }, // 二分 + 休止呼吸
  { hits: [0, 0.5, 1, 2, 3], simple: true }, // 小跑 + 长音收尾
  { hits: [0, 1.5, 2, 3], simple: true }, // 附点律动
  { hits: [0, 1, 2, 2.5, 3], simple: true }, // 四分 + 八分点缀收尾
  { hits: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], simple: false }, // 八分平稳跑动
  { hits: [0, 0.5, 0.75, 1.5, 2, 2.5, 2.75, 3.5], simple: false }, // 前八后十六 ×2
  { hits: [0, 0.25, 0.5, 0.75, 1, 2, 3], simple: false }, // 十六分跑动 + 长音收尾
  { hits: [0, 0.75, 1.5, 2.25, 3], simple: false }, // 切分摇摆
  { hits: [0, 1, 1.5, 2, 2.5, 3], simple: false }, // 四分 + 反拍切分
];

// 一次性种子 + 引擎内 LCG：可复现、不依赖 Math.random 分布
function survivalLcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 五声音阶（C 宫）在 26 白键域内的音级 → 白键索引映射：deg 每 +1 沿五声步进一个音
const SURVIVAL_PENTA = [0, 1, 2, 4, 5]; // 八度内白键索引（C D E G A）

export function survivalDegToKey(deg: number): number {
  const oct = Math.floor(deg / 5);
  const wi = ((deg % 5) + 5) % 5;
  return oct * 7 + SURVIVAL_PENTA[wi];
}

// 轮廓行走的四类轮廓：升 / 降 / 拱形（先升后降）/ 跳进
type SurvivalContour = "up" | "down" | "arch" | "leap";
const SURVIVAL_CONTOURS: SurvivalContour[] = ["up", "down", "arch", "leap"];

/** 生存谱面生成器：按小节增量产音（只往数组尾部追加，不重写历史音符） */
export interface SurvivalGen {
  /** 生成下一小节：barStartSec = 该小节头（谱内秒），beatSec = 当前拍长（提速已折入），
   *  madeSoFar = 已生成总数（细胞渐进与黑键点缀的门槛） */
  nextBar(barStartSec: number, beatSec: number, madeSoFar: number): ChartNote[];
}

// 音高行走状态：当前音级 + 步向；轮廓分段（段内同轮廓，随机段长，不连续 3 次同轮廓）
export function createSurvivalGen(seed: number): SurvivalGen {
  const r = survivalLcg(seed);
  let lastCell = -1;
  let contour: SurvivalContour = "up";
  const segHist: SurvivalContour[] = []; // 最近两段轮廓（禁连续 3 次同轮廓查这里）
  let segLeft = 0;
  let segLen = 1;
  let archUp = true;
  let deg = 8; // 起手中音区（key≈11，约 C4–D4 一带）
  return {
    nextBar(barStartSec, beatSec, madeSoFar) {
      // 细胞抽取：前 40 音只用简单细胞；不与上一小节重复
      const pool: number[] = [];
      for (let i = 0; i < SURVIVAL_CELLS.length; i += 1) {
        if (i === lastCell) continue;
        if (madeSoFar < 40 && !SURVIVAL_CELLS[i].simple) continue;
        pool.push(i);
      }
      const cell = SURVIVAL_CELLS[pool[Math.floor(r() * pool.length)] ?? pool[0] ?? 0];
      lastCell = SURVIVAL_CELLS.indexOf(cell);
      const out: ChartNote[] = [];
      for (const h of cell.hits) {
        // 轮廓换段：随机 4–8 音一段；禁连续 3 次同轮廓
        if (segLeft <= 0) {
          const n1 = segHist[segHist.length - 1];
          const n2 = segHist[segHist.length - 2];
          const options = SURVIVAL_CONTOURS.filter((c) => !(c === n1 && c === n2));
          contour = options[Math.floor(r() * options.length)] ?? "up";
          segHist.push(contour);
          if (segHist.length > 4) segHist.shift();
          segLen = 4 + Math.floor(r() * 5);
          segLeft = segLen;
          archUp = true;
        }
        segLeft -= 1;
        let step = 0;
        if (contour === "up") step = 1;
        else if (contour === "down") step = -1;
        else if (contour === "arch") {
          if (segLeft * 2 < segLen) archUp = false; // 过段中点转下行
          step = archUp ? 1 : -1;
        } else {
          step = (r() < 0.5 ? -1 : 1) * (2 + Math.floor(r() * 2)); // 跳进 ±2/±3
        }
        let nextDeg = deg + step;
        // 撞域反弹：越出 0..25 白键域即翻转步向重走（音不丢拍；极端情况原地停留）
        let k = survivalDegToKey(nextDeg);
        if (k < 0 || k > 25) {
          step = -step;
          nextDeg = deg + step;
          k = survivalDegToKey(nextDeg);
          if (k < 0 || k > 25) {
            nextDeg = deg;
            k = survivalDegToKey(deg);
          }
          if (contour === "arch") archUp = step >= 0;
        }
        deg = nextDeg;
        // 黑键点缀：累计 ≥60 音后 12% 概率（Shift 提示照常走现有渲染）
        const black = madeSoFar + out.length >= 60 && r() < 0.12;
        out.push({ t: barStartSec + h * beatSec, key: Math.max(0, Math.min(25, k)), black });
      }
      return out;
    },
  };
}

// 完成关卡（无论评级）解锁下一关；最高评级只升不降
export function saveChallengeResult(
  levelIndex: number,
  grade: Grade,
): { progress: ChallengeProgress; unlockedNext: boolean } {
  const progress = loadChallengeProgress();
  if (levelIndex < 0 || levelIndex >= CHALLENGE_LEVELS.length) {
    return { progress, unlockedNext: false };
  }
  const cur = progress.best[levelIndex];
  if (cur === null || GRADE_RANK[grade] > GRADE_RANK[cur]) progress.best[levelIndex] = grade;
  let unlockedNext = false;
  const next = levelIndex + 1;
  if (next < CHALLENGE_LEVELS.length && progress.unlocked <= next) {
    progress.unlocked = next + 1;
    unlockedNext = true;
  }
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(progress));
  } catch {
    // localStorage 不可用：进度仅保留在本次会话内
  }
  return { progress, unlockedNext };
}

// ---- UGC 自定义关卡：自动难度评级 / 关卡编码 / 画布编译 ----

export interface ChartRating {
  stars: number; // 1–5 难度星级
  bpm: number; // 实际采用拍速（源速夹进 60–160）
  fall: number; // 下落时长（高难略快、低难略慢更从容）
  pw: number; // Perfect 窗（秒，随星级收紧）
  gw: number; // Good 窗（秒，随星级收紧）
}

// 难度分 = 密度（主权重）+ 黑键率 + 间隔抖动（相对标准差）+ 键位跨度，加权四段切成 1–5 星；
// 判定窗随星级收紧（90/180ms 起，每高一星 −6/−10ms，下限 60/140ms），下落时长按星级微调
export function rateChart(notes: ChartNote[], srcBpm: number): ChartRating {
  const bpm = Math.min(160, Math.max(60, Math.round(srcBpm) || 100));
  const n = notes.length;
  if (n === 0) {
    return { stars: 1, bpm, fall: fallSecFor(bpm) * 1.15, pw: PERFECT_WINDOW, gw: GOOD_WINDOW };
  }
  const dur = Math.max(1, notes[n - 1].t - notes[0].t);
  let blacks = 0;
  let minKey = 25;
  let maxKey = 0;
  const gaps: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const q = notes[i];
    if (q.black) blacks += 1;
    if (q.key < minKey) minKey = q.key;
    if (q.key > maxKey) maxKey = q.key;
    if (i > 0) gaps.push(q.t - notes[i - 1].t);
  }
  const blackRate = blacks / n;
  let jitter = 0;
  if (gaps.length >= 2) {
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / gaps.length;
    jitter = Math.sqrt(variance) / Math.max(0.05, mean); // 相对抖动：完全规整 = 0
  }
  const score =
    0.5 * Math.min(1, n / dur / 5) +
    0.2 * blackRate +
    0.15 * Math.min(1, jitter) +
    0.15 * Math.min(1, (maxKey - minKey) / 24);
  const stars = score < 0.2 ? 1 : score < 0.4 ? 2 : score < 0.6 ? 3 : score < 0.8 ? 4 : 5;
  return {
    stars,
    bpm,
    fall: fallSecFor(bpm) * (1.15 - (stars - 1) * 0.075),
    pw: Math.max(60, 90 - (stars - 1) * 6) / 1000,
    gw: Math.max(140, 180 - (stars - 1) * 10) / 1000,
  };
}

// 关卡编码：`ch<bpm>.<音数>.` + 每音 6 字符（t 四位 base36·百分秒 + 键位一位 base36 + 黑键位一位）。
// 表头尾部的点是必要分隔：音数位数可变而正文同为数字字符，没有它「音数/正文」无法唯一切分。
// 320 音上限 × 6 + 表头 ≪ 6000 字符字段上限；编码失败（空谱/越界）返回 null 由调用方提示
export function encodeChartLevel(notes: ChartNote[], bpm: number): string | null {
  if (notes.length === 0 || notes.length > 320) return null;
  const b = Math.min(160, Math.max(60, Math.round(bpm) || 100));
  let body = "";
  for (const n of notes) {
    const tCs = Math.round(n.t * 100); // 百分秒（4 位 base36 = 0..45 小时，精度 10ms 远超判定窗需求）
    if (tCs < 0 || tCs > 36 ** 4 - 1 || n.key < 0 || n.key > 25) return null;
    body += `${tCs.toString(36).padStart(4, "0")}${n.key.toString(36)}${n.black ? "1" : "0"}`;
  }
  const code = `ch${b}.${notes.length}.${body}`;
  return code.length <= 6000 ? code : null;
}

// 解码：表头 + 每音 6 字符逐段校验（严格 base36、键位 0..25、黑键位 0/1），任一异常整关作废返回 null
export function decodeChartLevel(
  code: string,
): { notes: ChartNote[]; bpm: number } | null {
  const m = /^ch(\d{2,3})\.(\d{1,3})\.([0-9a-z]*)$/.exec(code);
  if (!m) return null;
  const bpm = Number(m[1]);
  const n = Number(m[2]);
  const body = m[3];
  if (!(bpm >= 60 && bpm <= 160) || n <= 0 || n > 320 || body.length !== n * 6) return null;
  const notes: ChartNote[] = [];
  for (let i = 0; i < n; i += 1) {
    const seg = body.slice(i * 6, i * 6 + 6);
    const t = parseInt(seg.slice(0, 4), 36);
    const key = parseInt(seg.slice(4, 5), 36);
    if (!Number.isFinite(t) || t < 0 || !Number.isFinite(key) || key > 25) return null;
    if (seg[5] !== "0" && seg[5] !== "1") return null;
    notes.push({ t: t / 100, key, black: seg[5] === "1" });
  }
  notes.sort((a, z) => a.t - z.t);
  return { notes, bpm };
}

// 画布 → 下落谱：每条线按当前循环一圈的音高曲线（toLoopSpec 同一真源，卷帘覆盖天然生效）逐音展开，
// 锚点 = 单音；时间量化回 1/4 拍网格（去人性化抖动）、同拍同音去重、超 320 音截断并报 truncated
export function canvasToChart(
  objs: CanvasObject[],
  bpm: number,
  scale: Scale,
): { notes: ChartNote[]; truncated: boolean } {
  const beat = 60 / Math.min(240, Math.max(40, bpm || 100));
  const seen = new Set<string>();
  const out: ChartNote[] = [];
  const range = bandRange(scale);
  for (const obj of objs) {
    const spec = toLoopSpec(obj, bpm, range.lo, range.degs);
    for (const ev of spec.events) {
      const pos = pianoPosOfMidi(scaleMidi(scale, ev.idx));
      if (!pos) continue; // 超出 26 键音域的循环音直接跳过（与击键链路同域）
      const tb = Math.max(0, Math.round((ev.t / beat) * 4) / 4); // 量化到 1/4 拍
      const id = `${tb}|${pos.key}|${pos.black ? 1 : 0}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ t: tb * beat, key: pos.key, black: pos.black });
    }
  }
  out.sort((a, z) => a.t - z.t || a.key - z.key);
  const truncated = out.length > 320;
  return { notes: truncated ? out.slice(0, 320) : out, truncated };
}
