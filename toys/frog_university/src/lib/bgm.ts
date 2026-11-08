/**
 * 奶蛙大学 · 合成 BGM 曲库（Web Audio 程序化合成，零外部音频文件、零新依赖）
 * 33 首曲子全部用数据化谱面定义（BPM / 调式 / 和弦进行 / 鼓·低音·琶音·铺底四轨 / 波形与滤波），
 * 由一个 lookahead 调度器实时合成；换曲走 0.8s 交叉淡入淡出。
 * 学期变奏不只动节奏：转调 / 换调式侧面 / 和弦转位 / 声部八度呼吸，九学期一圈、每曲偏移各自不同；
 * 曲内按遍交替换面——奇数遍琶音反向、旋律模进上三度、铺底添九音、小节末低音提前半步走近下一个和弦；
 * 语境调音：天气换基调（雾天换平调子）、心情换亮度、每次起曲掷骰子；曲子走着走着还会自己慢慢漂移半音。
 * 空间与活气（批次 CY-9）：全曲并一条反馈回声（越回越暗）、声部各有立体声摆位、
 * 铺底双振荡器微失谐、长音带微颤，每四遍鼓组加花、每六遍撒一颗星光高音。
 * 唤醒策略与 audio.ts 一致：AudioContext 要等一次用户手势才真正出声；
 * 任何音频失败都静默降级，绝不影响页面。
 * 音量读 settings.bgmVolume、开关读 settings.bgmOn（与 SE 音量 settings.volume 完全独立）。
 */
import { countCompletedLines, loadGameSave, loadSettings, saveSettings, type GameSaveData } from "@/lib/gameSave";
import { dayOfDoneCount, weatherForDay } from "@/lib/calendar";

import { getUnlockedAchievements } from "@/lib/achievements";

export type BgmTrackId =
  | "daily"
  | "afternoon"
  | "canteen"
  | "library"
  | "club"
  | "field"
  | "study"
  | "admin"
  | "night"
  | "memory"
  | "tension"
  | "ending"
  | "dorm-hall"
  | "dorm-room"
  | "dorm-dark"
  | "dorm-talk"
  | "dorm-dawn"
  | "library-late"
  | "library-list"
  | "canteen-late"
  | "canteen-after"
  | "club-smile"
  | "club-blackout"
  | "field-debate"
  | "field-night"
  | "study-desk"
  | "study-locked"
  | "admin-night"
  | "admin-template"
  | "fc-hall"
  | "fc-wait"
  | "lk-quiet"
  | "lk-dawn"
  /* 批次 CY-21 补场景专属曲 */
  | "infirmary"
  | "corridor"
  /* 批次 CY-22 补场景专属曲：教室 / 日落操场 / 社团农场 */
  | "class"
  | "dusk-field"
  | "farm"
  /* 批次 CY-23 深夜自习室专属曲 */
  | "study-lamp"
  /* 批次 CY-25 隐藏曲：弹法全部集齐才出现的安可曲 */
  | "encore"
  /* 批次 CY-105 隐藏曲：五个天气夜集齐（观夜员成就）才亮出来的天气合唱 */
  | "nights-weather";

export interface BgmTrackMeta {
  id: BgmTrackId;
  title: string;
  mood: string;
}

/* ---------- 谱面（数据化：整首歌就是一份配置） ---------- */

/** 一小节 16 步；'-' 休止，数字字符 = 该声部内的取样位（和弦音序号 / 音阶度数） */
type StepPattern = string;

/* 调式半音表：谱面里只写调式数组，音高由 root + scale 算出 */
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
/** 近五声（宫调五声音阶去掉 4、7 级）：帘子里的夜谈专用，怎么走都不刺 */
const PENTA = [0, 2, 4, 7, 9];
/** 平调子（批次 CX 新基调）：雾天专用——五声家族里最「收着」的一支，小二度贴着走，怎么走都不亮 */
const HIRAJOSHI = [0, 2, 3, 7, 8];

interface DrumVoice {
  kick?: StepPattern;
  snare?: StepPattern;
  hat?: StepPattern;
  /** 时钟滴答（自习楼 / 图书馆的秒针感） */
  tick?: StepPattern;
  kickGain?: number;
  snareGain?: number;
  hatGain?: number;
  tickGain?: number;
}

interface BassVoice {
  wave: OscillatorType;
  gain: number;
  /** 16 步节奏；数字 = 和弦音序号（超出和弦长度自动循环），'-' 休止 */
  pattern: StepPattern;
  /** 相对主音的八度偏移（半音），缺省 -12 */
  oct?: number;
  /** 单音时值（秒），缺省一个八分音符 */
  decay?: number;
  cutoff?: number;
}

interface ArpVoice {
  wave: OscillatorType;
  gain: number;
  /** 16 步琶音；数字 = 和弦音序号（自动循环），'-' 休止 */
  pattern: StepPattern;
  oct?: number;
  decay?: number;
  cutoff?: number;
}

interface PadVoice {
  wave: OscillatorType;
  gain: number;
  /** 起音时长（秒）：慢起音 = 空气感，快起音 = 规整感 */
  attack?: number;
  oct?: number;
  cutoff?: number;
}

interface MelodyVoice {
  wave: OscillatorType;
  gain: number;
  /** 每小节一句旋律（循环取模对齐和弦进行）；数字 = 音阶度数（≥7 上八度），'-' 休止 */
  bars: StepPattern[];
  oct?: number;
  decay?: number;
  cutoff?: number;
}

interface BgmScore {
  bpm: number;
  /** 调式主音（MIDI 编号，60 = C4） */
  root: number;
  scale: number[];
  /** 和弦进行：每小节一个和弦（音阶度数索引数组；≥7 表示上八度） */
  progression: number[][];
  /** 摇摆量 0-0.3：奇数 16 分音符往后拖一点 */
  swing?: number;
  /** 整轨音色（低通截止频率决定「远/近、闷/亮」；鼓组不走这层滤波） */
  tone?: { cutoff: number; q?: number };
  drums?: DrumVoice;
  bass?: BassVoice;
  arp?: ArpVoice;
  pad?: PadVoice;
  melody?: MelodyVoice;
}

interface BgmTrack {
  meta: BgmTrackMeta;
  score: BgmScore;
}

const TRACK_ORDER: BgmTrackId[] = [
  "daily",
  "afternoon",
  "canteen",
  "library",
  "club",
  "field",
  "study",
  "admin",
  "night",
  "memory",
  "tension",
  "ending",
  "dorm-hall",
  "dorm-room",
  "dorm-dark",
  "dorm-talk",
  "dorm-dawn",
  "library-late",
  "library-list",
  "canteen-late",
  "canteen-after",
  "club-smile",
  "club-blackout",
  "field-debate",
  "field-night",
  "study-desk",
  "study-locked",
  "admin-night",
  "admin-template",
  "fc-hall",
  "fc-wait",
  "lk-quiet",
  "lk-dawn",
  "infirmary",
  "corridor",
  "class",
  "dusk-field",
  "farm",
  "study-lamp",
  "encore",
  "nights-weather",
];

/* 40 首曲子（批次 CY-25 起，含 1 首集齐弹法才出现的隐藏安可曲）：每首一条听感注释。全部参数都是数据，合成器只认这一张表。 */
const TRACKS: Record<BgmTrackId, BgmTrack> = {
  daily: {
    meta: { id: "daily", title: "晨光进行曲", mood: "闹钟没响的上午，一切都还来得及。" },
    score: {
      bpm: 96,
      root: 60,
      scale: MAJOR,
      progression: [
        [0, 2, 4, 7],
        [5, 7, 9, 12],
        [3, 5, 7, 10],
        [4, 6, 8, 11],
      ],
      swing: 0.08,
      tone: { cutoff: 4200, q: 0.6 },
      drums: {
        kick: "x-------x-x-----",
        snare: "----x-------x---",
        hat: "--x---x---x---x-",
        kickGain: 0.12,
        snareGain: 0.05,
        hatGain: 0.032,
      },
      bass: { wave: "triangle", gain: 0.11, pattern: "0---3---0---2---", oct: -12, decay: 0.42, cutoff: 900 },
      arp: { wave: "triangle", gain: 0.045, pattern: "0-2-3-2-0-2-3-2-", oct: 12, decay: 0.22, cutoff: 3200 },
      pad: { wave: "triangle", gain: 0.05, attack: 0.5, cutoff: 1800 },
    },
  },
  afternoon: {
    meta: { id: "afternoon", title: "午后缓板", mood: "阳光落在课桌上，风把第二节课吹得很慢。" },
    score: {
      bpm: 74,
      root: 59,
      scale: MAJOR,
      progression: [
        [0, 2, 4, 7],
        [3, 5, 7, 10],
        [1, 3, 5, 8],
        [5, 7, 9, 12],
      ],
      swing: 0.14,
      tone: { cutoff: 2100, q: 0.5 },
      drums: {
        kick: "x---------------",
        hat: "----x-------x---",
        kickGain: 0.08,
        hatGain: 0.03,
      },
      bass: { wave: "sine", gain: 0.1, pattern: "0-------3-------", oct: -12, decay: 1.6, cutoff: 700 },
      arp: { wave: "sine", gain: 0.04, pattern: "0---2---3---2---", oct: 12, decay: 0.5, cutoff: 2200 },
      pad: { wave: "sine", gain: 0.075, attack: 0.9, cutoff: 1300 },
    },
  },
  canteen: {
    meta: { id: "canteen", title: "食堂波尔卡", mood: "不锈钢餐盘叮当响，和永远差一勺的饭。" },
    score: {
      bpm: 112,
      root: 62,
      scale: MIXOLYDIAN,
      progression: [
        [0, 2, 4, 6],
        [3, 5, 7, 9],
        [4, 6, 8, 10],
        [3, 5, 7, 9],
      ],
      swing: 0.1,
      tone: { cutoff: 4000, q: 0.7 },
      drums: {
        kick: "x---x-x-x---x-x-",
        snare: "----x-------x---",
        hat: "x-x-x-x-x-x-x-x-",
        kickGain: 0.12,
        snareGain: 0.06,
        hatGain: 0.03,
      },
      bass: { wave: "triangle", gain: 0.11, pattern: "0-0-0-3-0-0-2-3-", oct: -12, decay: 0.28, cutoff: 1000 },
      arp: { wave: "square", gain: 0.032, pattern: "0-2-3-2-0-2-3-2-", oct: 12, decay: 0.16, cutoff: 2800 },
      pad: { wave: "triangle", gain: 0.04, attack: 0.3, cutoff: 1600 },
    },
  },
  library: {
    meta: { id: "library", title: "倒计时节拍", mood: "翻书声很轻，倒计时的秒针很响。" },
    score: {
      bpm: 104,
      root: 57,
      scale: MINOR,
      progression: [
        [0, 2, 4, 7],
        [5, 7, 9, 12],
        [2, 4, 6, 9],
        [6, 8, 10, 13],
      ],
      tone: { cutoff: 2800, q: 0.8 },
      drums: {
        tick: "x---x---x---x---",
        kick: "x-------x-------",
        kickGain: 0.07,
        tickGain: 0.05,
      },
      bass: { wave: "triangle", gain: 0.1, pattern: "0---0-0-0---2-2-", oct: -12, decay: 0.4, cutoff: 800 },
      arp: { wave: "triangle", gain: 0.05, pattern: "0-2-1-2-0-2-1-2-", oct: 12, decay: 0.18, cutoff: 2600 },
      pad: { wave: "sine", gain: 0.05, attack: 0.7, cutoff: 1200 },
    },
  },
  club: {
    meta: { id: "club", title: "招新快步", mood: "招新舞台的音响开到最大，快乐是排练过的。" },
    score: {
      bpm: 124,
      root: 62,
      scale: MAJOR,
      progression: [
        [0, 2, 4, 7],
        [4, 6, 8, 11],
        [5, 7, 9, 12],
        [3, 5, 7, 10],
      ],
      tone: { cutoff: 5600, q: 0.5 },
      drums: {
        kick: "x---x---x---x---",
        snare: "----x-------x---",
        hat: "--x---x---x---x-",
        kickGain: 0.14,
        snareGain: 0.07,
        hatGain: 0.038,
      },
      bass: { wave: "sawtooth", gain: 0.1, pattern: "0-0-3-0-0-3-2-3-", oct: -12, decay: 0.2, cutoff: 750 },
      arp: { wave: "square", gain: 0.03, pattern: "0-2-3-2-0-3-2-3-", oct: 12, decay: 0.14, cutoff: 3600 },
      pad: { wave: "sawtooth", gain: 0.028, attack: 0.25, cutoff: 1800 },
    },
  },
  field: {
    meta: { id: "field", title: "草坪白日梦", mood: "躺在草坪上，云替你把没说完的话说完。" },
    score: {
      bpm: 64,
      root: 55,
      scale: LYDIAN,
      progression: [
        [0, 2, 4, 7],
        [1, 3, 5, 8],
        [5, 7, 9, 12],
        [0, 4, 2, 7],
      ],
      tone: { cutoff: 2300, q: 0.4 },
      bass: { wave: "sine", gain: 0.09, pattern: "0-------3-------", oct: -24, decay: 2.2, cutoff: 600 },
      arp: { wave: "sine", gain: 0.04, pattern: "0-------4-------", oct: 12, decay: 1.1, cutoff: 2400 },
      pad: { wave: "triangle", gain: 0.085, attack: 1.3, cutoff: 1500 },
      melody: {
        wave: "triangle",
        gain: 0.038,
        bars: [
          "4-------2-------",
          "5-------4-------",
          "3-------2-------",
          "4-------2-------",
        ],
        oct: 12,
        decay: 1.4,
        cutoff: 2600,
      },
    },
  },
  study: {
    meta: { id: "study", title: "凌晨四点的滴答", mood: "整栋楼只剩滴答声陪你写完最后一页。" },
    score: {
      bpm: 88,
      root: 57,
      scale: MINOR,
      progression: [
        [0, 2, 4, 7],
        [5, 7, 9, 12],
        [3, 5, 7, 10],
        [4, 6, 8, 11],
      ],
      tone: { cutoff: 2000, q: 0.7 },
      drums: {
        tick: "x---x---x---x---",
        tickGain: 0.055,
      },
      bass: { wave: "triangle", gain: 0.09, pattern: "0-------0---3---", oct: -12, decay: 1.2, cutoff: 700 },
      arp: { wave: "sine", gain: 0.05, pattern: "0-2-3-2-0-2-3-2-", oct: 12, decay: 0.14, cutoff: 2200 },
      pad: { wave: "sine", gain: 0.045, attack: 1.0, cutoff: 1000 },
    },
  },
  admin: {
    meta: { id: "admin", title: "规整进行曲", mood: "盖章的声音很整齐，像这栋楼里的每一天。" },
    score: {
      bpm: 100,
      root: 60,
      scale: MAJOR,
      progression: [
        [0, 2, 4, 7],
        [4, 6, 8, 11],
        [0, 2, 4, 7],
        [3, 5, 7, 10],
      ],
      tone: { cutoff: 3400, q: 1.2 },
      drums: {
        kick: "x---x---x---x---",
        hat: "x-x-x-x-x-x-x-x-",
        kickGain: 0.1,
        hatGain: 0.026,
      },
      bass: { wave: "sawtooth", gain: 0.09, pattern: "0---0---3---3---", oct: -12, decay: 0.22, cutoff: 700 },
      arp: { wave: "square", gain: 0.03, pattern: "0-3-1-3-0-3-1-3-", oct: 12, decay: 0.1, cutoff: 3000 },
      pad: { wave: "triangle", gain: 0.03, attack: 0.08, cutoff: 1400 },
    },
  },
  night: {
    meta: { id: "night", title: "湖畔夜曲", mood: "宿舍熄灯之后，心事才开始说话。" },
    score: {
      bpm: 56,
      root: 53,
      scale: MINOR,
      progression: [
        [0, 2, 4, 7],
        [5, 7, 9, 12],
        [2, 4, 6, 9],
        [6, 8, 10, 13],
      ],
      tone: { cutoff: 1100, q: 0.5 },
      drums: {
        kick: "x---------------",
        kickGain: 0.06,
      },
      bass: { wave: "sine", gain: 0.09, pattern: "0---------------", oct: -24, decay: 2.6, cutoff: 420 },
      arp: { wave: "sine", gain: 0.035, pattern: "0-------3-------", oct: 12, decay: 1.6, cutoff: 1600 },
      pad: { wave: "sine", gain: 0.08, attack: 1.6, cutoff: 900 },
    },
  },
  memory: {
    meta: { id: "memory", title: "上学期的回响", mood: "隔着一年想起来，像别人的故事。" },
    score: {
      bpm: 52,
      root: 60,
      scale: DORIAN,
      progression: [
        [0, 2, 4, 7],
        [5, 7, 9, 12],
        [3, 5, 7, 10],
        [4, 6, 8, 11],
      ],
      tone: { cutoff: 2500, q: 0.5 },
      bass: { wave: "sine", gain: 0.075, pattern: "0---------------", oct: -12, decay: 2.2, cutoff: 520 },
      arp: { wave: "triangle", gain: 0.05, pattern: "0-2-3-2-1-2-3-2-", oct: 24, decay: 0.9, cutoff: 3200 },
      pad: { wave: "sine", gain: 0.05, attack: 1.2, cutoff: 1000 },
      melody: {
        wave: "triangle",
        gain: 0.04,
        bars: [
          "4---3---2-------",
          "5---4---3-------",
          "3---2---1-------",
          "2---1---0-------",
        ],
        oct: 12,
        decay: 1.3,
        cutoff: 2800,
      },
    },
  },
  infirmary: {
    meta: { id: "infirmary", title: "消毒水味的午睡", mood: "消毒水和太阳晒过的被子混在一起，睡一小会儿就当好了一半。" },
    score: {
      bpm: 56,
      root: 62,
      scale: MAJOR,
      progression: [
        [0, 2, 4],
        [3, 5, 7],
        [5, 7, 9],
        [0, 2, 4],
      ],
      tone: { cutoff: 1600, q: 0.4 },
      bass: { wave: "sine", gain: 0.065, pattern: "0-------3-------", oct: -12, decay: 2.0, cutoff: 500 },
      arp: { wave: "triangle", gain: 0.034, pattern: "0-------4-------", oct: 12, decay: 1.2, cutoff: 2400 },
      pad: { wave: "sine", gain: 0.07, attack: 1.5, cutoff: 900 },
      melody: {
        wave: "triangle",
        gain: 0.038,
        bars: [
          "0---2---4-------",
          "4---2---0-------",
          "2---4---7-------",
          "7---4---2-------",
        ],
        oct: 12,
        decay: 1.4,
        cutoff: 2600,
      },
    },
  },
  corridor: {
    meta: { id: "corridor", title: "隔着一墙的铃", mood: "下课了，走廊里的脚步和笑声都隔着一层墙。" },
    score: {
      bpm: 76,
      root: 64,
      scale: MIXOLYDIAN,
      progression: [
        [0, 2, 4],
        [6, 8, 10],
        [3, 5, 7],
        [5, 7, 9],
      ],
      swing: 0.1,
      tone: { cutoff: 2200, q: 0.6 },
      drums: {
        kick: "0-------0-------",
        tick: "-0--0-0--0--0-0-",
        kickGain: 0.06,
        tickGain: 0.05,
      },
      bass: { wave: "triangle", gain: 0.09, pattern: "0---0---3---3---", oct: -12, decay: 0.4, cutoff: 800 },
      arp: { wave: "sine", gain: 0.04, pattern: "0-2---2-0-2---2-", oct: 24, decay: 0.5, cutoff: 3000 },
      pad: { wave: "triangle", gain: 0.035, attack: 0.6, cutoff: 1300 },
      melody: {
        wave: "triangle",
        gain: 0.042,
        bars: [
          "0-2-4-2-0-------",
          "4-2-0-2-4-------",
          "2-4-7-4-2-------",
          "7---4---2---0---",
        ],
        oct: 12,
        decay: 0.7,
        cutoff: 3000,
      },
    },
  },
  /* 教室专属曲（批次 CY-22）：tick 是粉笔点黑板，旋律句句抄到一半就停笔 */
  class: {
    meta: { id: "class", title: "笔记抄不齐的一半", mood: "老师敲黑板的节奏很催眠，走神的部分刚好和下课铃重合。" },
    score: {
      bpm: 72,
      root: 60,
      scale: MAJOR,
      progression: [
        [0, 2, 4],
        [5, 7, 9],
        [3, 5, 7],
        [4, 6, 8],
      ],
      tone: { cutoff: 1900, q: 0.5 },
      drums: {
        tick: "0---0---0---0---",
        hat: "----0-------0---",
        tickGain: 0.045,
        hatGain: 0.02,
      },
      bass: { wave: "triangle", gain: 0.08, pattern: "0---0---2---2---", oct: -12, decay: 0.5, cutoff: 700 },
      arp: { wave: "sine", gain: 0.036, pattern: "0-2-4-2-0-2-4-2-", oct: 24, decay: 0.4, cutoff: 2800 },
      pad: { wave: "sine", gain: 0.05, attack: 0.8, cutoff: 1000 },
      melody: {
        wave: "triangle",
        gain: 0.04,
        bars: [
          "0-2-4---2---4---",
          "4-4-2-0--4------",
          "2-4-7---4-2-----",
          "7-7-5-4-2---0---",
          "0---2-4-4-2-----",
          "4---4-2-0-2-4---",
          "2-2-4-4-7-7-4---",
          "0-0--2--4---2---",
        ],
        oct: 12,
        decay: 0.8,
        cutoff: 2800,
      },
    },
  },
  /* 日落操场专属曲（批次 CY-22）：跑道上被拉长的影子，鼓收着，只剩铺底和一声远哨 */
  "dusk-field": {
    meta: { id: "dusk-field", title: "日落跑道", mood: "太阳压到看台后面，跑道把每个人的影子都拉成了慢动作。" },
    score: {
      bpm: 64,
      root: 57,
      scale: DORIAN,
      swing: 0.16,
      progression: [
        [0, 2, 4],
        [3, 5, 7],
        [5, 7, 9],
        [2, 4, 6],
      ],
      tone: { cutoff: 1400, q: 0.4 },
      drums: {
        tick: "--------0-------",
        tickGain: 0.035,
      },
      bass: { wave: "sine", gain: 0.07, pattern: "0-------3-------", oct: -12, decay: 1.8, cutoff: 450 },
      arp: { wave: "triangle", gain: 0.03, pattern: "0---4---2---4---", oct: 24, decay: 1.0, cutoff: 2000 },
      pad: { wave: "sine", gain: 0.08, attack: 1.6, cutoff: 800 },
      melody: {
        wave: "sine",
        gain: 0.04,
        bars: [
          "4---2---0---2---",
          "5---4---2---0---",
          "0-2----4---20---",
          "4-2----0---42---",
          "7-----5-4---2---",
          "0---2---4-5----7",
          "5-4----20-2----0",
          "4------2---0----",
        ],
        oct: 12,
        decay: 1.6,
        cutoff: 2200,
      },
    },
  },
  /* 社团农场专属曲（批次 CY-22）：拔萝卜的蓝草小碎步，snare 打在反拍 */
  farm: {
    meta: { id: "farm", title: "棚里的萝卜熟了", mood: "本来只是浇个水，不知怎么就比谁拔得快了起来。" },
    score: {
      bpm: 92,
      root: 65,
      scale: MIXOLYDIAN,
      swing: 0.08,
      progression: [
        [0, 2, 4],
        [4, 6, 8],
        [3, 5, 7],
        [0, 2, 4],
      ],
      tone: { cutoff: 2600, q: 0.6 },
      drums: {
        kick: "0-------0-------",
        snare: "----0-------0---",
        kickGain: 0.08,
        snareGain: 0.05,
      },
      bass: { wave: "square", gain: 0.085, pattern: "0-0-0---5-5-5---", oct: -12, decay: 0.3, cutoff: 900 },
      arp: { wave: "triangle", gain: 0.042, pattern: "0-4-7-9-7-4-0-4-", oct: 12, decay: 0.35, cutoff: 3200 },
      pad: { wave: "square", gain: 0.028, attack: 0.3, cutoff: 1500 },
      melody: {
        wave: "square",
        gain: 0.034,
        bars: [
          "0-0-2-2-4-4-2-0-",
          "4-2-0-2-4-7----4",
          "5-4-2-4-0---2-4-",
          "7-7-4-4-2-2-0---",
          "0-4-7---4-7----9",
          "9-7-7-4-4-2-2-0-",
          "0-2-4-5-7---5-4-",
          "2-0----00-2-4---",
        ],
        oct: 12,
        decay: 0.4,
        cutoff: 3200,
      },
    },
  },
  tension: {
    meta: { id: "tension", title: "屏息", mood: "心跳比秒针快，教室里安静得能听见自己。" },
    score: {
      bpm: 132,
      root: 55,
      scale: PHRYGIAN,
      progression: [
        [0, 2, 4, 7],
        [1, 3, 5, 8],
        [0, 2, 4, 7],
        [1, 3, 5, 8],
      ],
      tone: { cutoff: 3800, q: 2.2 },
      drums: {
        kick: "x---x-x-x---x-x-",
        snare: "----x-------x---",
        hat: "x-xxx-xxx-xxx-xx",
        kickGain: 0.13,
        snareGain: 0.07,
        hatGain: 0.03,
      },
      bass: { wave: "sawtooth", gain: 0.11, pattern: "0-0-0-0-0-0-0-0-", oct: -12, decay: 0.16, cutoff: 800 },
      arp: { wave: "sawtooth", gain: 0.045, pattern: "0-1-0-2-0-1-0-2-", oct: 12, decay: 0.11, cutoff: 3000 },
      pad: { wave: "sawtooth", gain: 0.04, attack: 0.5, cutoff: 1000 },
    },
  },
  ending: {
    meta: { id: "ending", title: "谢幕之后", mood: "谢幕的时候，湖面终于平静下来了。" },
    score: {
      bpm: 70,
      root: 60,
      scale: MAJOR,
      progression: [
        [0, 2, 4, 7],
        [5, 7, 9, 12],
        [3, 5, 7, 10],
        [4, 6, 8, 11],
      ],
      tone: { cutoff: 3000, q: 0.5 },
      drums: {
        kick: "x-------x-------",
        hat: "----x-------x---",
        kickGain: 0.07,
        hatGain: 0.022,
      },
      bass: { wave: "sine", gain: 0.09, pattern: "0-------3-------", oct: -12, decay: 1.5, cutoff: 650 },
      arp: { wave: "sine", gain: 0.04, pattern: "0---2---3---2---", oct: 12, decay: 0.5, cutoff: 2600 },
      pad: { wave: "triangle", gain: 0.07, attack: 0.9, cutoff: 1500 },
      melody: {
        wave: "sine",
        gain: 0.045,
        bars: [
          "3---2---4-------",
          "2---1---4-------",
          "1---2---3-------",
          "4-------2---0---",
        ],
        oct: 12,
        decay: 1.1,
        cutoff: 3000,
      },
    },
  },
  /* 《熄灯之后》宿舍夜曲五首（表现层切片）：楼道口的暖、上下铺的静、断电的黑、帘子里的夜谈、天亮前的收束 */
  "dorm-hall": {
    meta: {
      id: "dorm-hall",
      title: "楼道口",
      mood: "刷卡进门的第一格灯是暖的。宿管台的登记本翻在今晚这页，笔还没有放下。",
    },
    score: {
      bpm: 72,
      root: 62,
      scale: MAJOR,
      progression: [
        [0, 2, 4, 7],
        [3, 5, 7, 10],
        [4, 6, 8, 11],
        [0, 2, 4, 7],
      ],
      swing: 0.1,
      tone: { cutoff: 2300, q: 0.55 },
      drums: {
        kick: "x---------------",
        hat: "----x-------x---",
        kickGain: 0.07,
        hatGain: 0.026,
      },
      bass: { wave: "sine", gain: 0.095, pattern: "0-------3-------", oct: -12, decay: 1.4, cutoff: 680 },
      arp: { wave: "triangle", gain: 0.042, pattern: "0---2---3---2---", oct: 12, decay: 0.44, cutoff: 2400 },
      pad: { wave: "triangle", gain: 0.07, attack: 1.0, cutoff: 1400 },
      melody: {
        wave: "sine",
        gain: 0.04,
        bars: ["4---3---2---0---", "1---2---3-------", "2---1---0-------", "3---4---2-------"],
        oct: 12,
        decay: 1.2,
        cutoff: 2600,
      },
    },
  },
  "dorm-room": {
    meta: {
      id: "dorm-room",
      title: "上下铺",
      mood: "上铺翻了个身，床架吱呀一声。谁的书还没合上，谁已经先睡了。",
    },
    score: {
      bpm: 64,
      root: 60,
      scale: MAJOR,
      progression: [
        [0, 2, 4, 7],
        [5, 7, 9, 12],
        [3, 5, 7, 10],
        [4, 6, 8, 11],
      ],
      tone: { cutoff: 1750, q: 0.5 },
      drums: {
        kick: "x---------------",
        kickGain: 0.055,
      },
      bass: { wave: "triangle", gain: 0.1, pattern: "0-------4-------", oct: -12, decay: 1.8, cutoff: 560 },
      arp: { wave: "triangle", gain: 0.05, pattern: "0-2-3-2-1-2-3-2-", oct: 12, decay: 0.16, cutoff: 2600 },
      pad: { wave: "sine", gain: 0.06, attack: 1.4, cutoff: 1100 },
    },
  },
  "dorm-dark": {
    meta: {
      id: "dorm-dark",
      title: "断电之后",
      mood: "风扇停了，整层楼一起黑掉的那三秒，比任何台词都安静。",
    },
    score: {
      bpm: 58,
      root: 57,
      scale: MINOR,
      progression: [
        [0, 2, 4, 7],
        [5, 7, 9, 12],
        [2, 4, 6, 9],
        [6, 8, 10, 13],
      ],
      tone: { cutoff: 900, q: 0.5 },
      drums: {
        kick: "x---------------",
        kickGain: 0.05,
      },
      bass: { wave: "sine", gain: 0.085, pattern: "0---------------", oct: -24, decay: 2.8, cutoff: 400 },
      arp: { wave: "sine", gain: 0.03, pattern: "0-------3-------", oct: 12, decay: 1.8, cutoff: 1400 },
      pad: { wave: "sine", gain: 0.075, attack: 1.8, cutoff: 800 },
      melody: {
        wave: "sine",
        gain: 0.035,
        bars: ["0---------------", "--------4-------", "2---------------", "--------1-------"],
        oct: 12,
        decay: 2.0,
        cutoff: 1200,
      },
    },
  },
  "dorm-talk": {
    meta: {
      id: "dorm-talk",
      title: "帘子里的夜谈",
      mood: "帘子拉上之后，说话声都自动调小了半格。有些话只对一格光说。",
    },
    score: {
      bpm: 66,
      root: 59,
      scale: PENTA,
      progression: [
        [0, 2, 4],
        [1, 3, 5],
        [2, 4, 6],
        [1, 3, 5],
      ],
      tone: { cutoff: 2100, q: 0.5 },
      drums: {
        kick: "x-------x-------",
        hat: "----x-------x---",
        kickGain: 0.06,
        hatGain: 0.024,
      },
      bass: { wave: "triangle", gain: 0.09, pattern: "0-------3-------", oct: -12, decay: 1.2, cutoff: 640 },
      arp: { wave: "triangle", gain: 0.04, pattern: "0-2-3-2-4-2-3-2-", oct: 12, decay: 0.3, cutoff: 2600 },
      pad: { wave: "sine", gain: 0.07, attack: 1.1, cutoff: 1300 },
      melody: {
        wave: "triangle",
        gain: 0.042,
        bars: ["4---3---2-------", "5---4---3-------", "3---2---4-------", "2---1---0-------"],
        oct: 12,
        decay: 0.9,
        cutoff: 2400,
      },
    },
  },
  "dorm-dawn": {
    meta: {
      id: "dorm-dawn",
      title: "天亮之前",
      mood: "窗帘缝透进第一点灰蓝。夜谈到此为止，闹钟还有五分钟才响。",
    },
    score: {
      bpm: 70,
      root: 60,
      scale: MAJOR,
      progression: [
        [0, 2, 4, 7],
        [3, 5, 7, 10],
        [4, 6, 8, 11],
        [0, 2, 4, 7],
      ],
      tone: { cutoff: 3000, q: 0.5 },
      drums: {
        kick: "x-------x-------",
        hat: "--x---x---x---x-",
        kickGain: 0.065,
        hatGain: 0.02,
      },
      bass: { wave: "sine", gain: 0.09, pattern: "0-------3-------", oct: -12, decay: 1.4, cutoff: 660 },
      arp: { wave: "triangle", gain: 0.042, pattern: "0---2---4---2---", oct: 12, decay: 0.5, cutoff: 2800 },
      pad: { wave: "triangle", gain: 0.075, attack: 1.0, cutoff: 1600 },
      melody: {
        wave: "sine",
        gain: 0.045,
        bars: ["2---3---4-------", "3---4---5-------", "4---5---6-------", "5---4---2---0---"],
        oct: 12,
        decay: 1.1,
        cutoff: 3000,
      },
    },
  },
  "library-late": {
    meta: {
      id: "library-late",
      title: "凌晨之后",
      mood: "合笔声停了之后，整层楼只剩翻页和笔尖。连秒针都放轻了。",
    },
    score: {
      bpm: 58,
      root: 55,
      scale: MINOR,
      progression: [
        [0, 2, 4, 7],
        [5, 7, 9, 12],
        [3, 5, 7, 10],
        [4, 6, 8, 11],
      ],
      tone: { cutoff: 1000, q: 0.5 },
      /* 声部删到三个：超轻的秒针、一轨低音、一轨稀疏旋律。比 dorm-dark 更空一层 */
      drums: {
        tick: "x---x---x---x---",
        tickGain: 0.018,
      },
      bass: { wave: "sine", gain: 0.085, pattern: "0---------------", oct: -24, decay: 3.0, cutoff: 420 },
      melody: {
        wave: "sine",
        gain: 0.035,
        bars: ["0---------------", "--------3-------", "2---------------", "--------1-------"],
        oct: 12,
        decay: 2.4,
        cutoff: 1100,
      },
    },
  },
  "library-list": {
    meta: {
      id: "library-list",
      title: "公示栏前",
      mood: "名单贴出来的第三分钟，热闹就开始了。热闹是别人的，她只看了一遍。",
    },
    score: {
      bpm: 76,
      root: 62,
      scale: DORIAN,
      progression: [
        [0, 2, 4, 7],
        [6, 8, 10, 13],
        [3, 5, 7, 10],
        [4, 6, 8, 11],
      ],
      tone: { cutoff: 2400, q: 0.9 },
      /* 紧张但不激烈：重拍全落在切分上，像人群在人堆里找名字的骚动 */
      drums: {
        kick: "----x-----x-x---",
        snare: "------------x---",
        hat: "--x-x---x-x-x-x-",
        kickGain: 0.08,
        snareGain: 0.035,
        hatGain: 0.026,
      },
      bass: { wave: "triangle", gain: 0.1, pattern: "0-----0---0-2---", oct: -12, decay: 0.5, cutoff: 760 },
      arp: { wave: "triangle", gain: 0.04, pattern: "0-3-2-3-0-3-2-3-", oct: 12, decay: 0.14, cutoff: 2800 },
      pad: { wave: "sawtooth", gain: 0.035, attack: 0.9, cutoff: 1200 },
      melody: {
        wave: "triangle",
        gain: 0.038,
        bars: ["--3---2---0-----", "--5---3---2-----", "--4---3---1-----", "--2---1---0---5-"],
        oct: 12,
        decay: 0.55,
        cutoff: 2600,
      },
    },
  },
  /* 《已老实食堂》深夜二首（表现层切片三）：深夜只剩一盏灯的暖、打烊之后灯灭的收束 */
  "canteen-late": {
    meta: {
      id: "canteen-late",
      title: "深夜窗口",
      mood: "食堂只剩一盏灯。灯下那碗饭，是他今天吃的头一口。",
    },
    score: {
      bpm: 58,
      root: 57,
      scale: MINOR,
      progression: [
        [0, 3, 5, 8],
        [2, 5, 7, 10],
        [0, 3, 5, 9],
        [4, 7, 9, 12],
      ],
      tone: { cutoff: 920, q: 0.55 },
      /* 一个声部打底，旋律像有人在很远的地方哼 */
      drums: {
        hat: "x-------x-------",
        hatGain: 0.012,
      },
      bass: { wave: "sine", gain: 0.09, pattern: "0-------3-------", oct: -12, decay: 2.2, cutoff: 460 },
      melody: {
        wave: "sine",
        gain: 0.04,
        bars: ["0-------2-------", "4---------------", "--------3-------", "2---------------"],
        oct: 12,
        decay: 2.8,
        cutoff: 1200,
      },
      pad: { wave: "sine", gain: 0.05, attack: 2.0, cutoff: 860 },
    },
  },
  "canteen-after": {
    meta: {
      id: "canteen-after",
      title: "打烊之后",
      mood: "灯灭到第三排。他把明天的饭盒一只只扣上盖——这是他的收工，也是他的开工。",
    },
    score: {
      bpm: 66,
      root: 55,
      scale: MINOR,
      progression: [
        [0, 2, 4, 7],
        [3, 5, 7, 10],
        [0, 2, 5, 8],
        [1, 4, 6, 11],
      ],
      tone: { cutoff: 1050, q: 0.5 },
      /* 长音为主：关灯之后还在屋里停两秒 */
      drums: {
        tick: "x---------------",
        tickGain: 0.016,
      },
      bass: { wave: "sine", gain: 0.095, pattern: "0---------------", oct: -24, decay: 3.4, cutoff: 420 },
      melody: {
        wave: "sine",
        gain: 0.03,
        bars: ["0---------------", "--------4-------", "3---------------", "----------------"],
        oct: 12,
        decay: 3.2,
        cutoff: 1000,
      },
    },
  },
  /* 《蛙生的意义》二首（表现层切片终章）：都放下之后只剩五声、散场没有仪式的天光 */
  "lk-quiet": {
    meta: {
      id: "lk-quiet",
      title: "都放下了",
      mood: "湖边好像有个看不见的开关，进来的蛙都被调回了出厂设置。",
    },
    score: {
      bpm: 52,
      root: 57,
      scale: PENTA,
      progression: [
        [0, 2, 4, 2],
        [4, 2, 0, 2],
      ],
      tone: { cutoff: 780, q: 0.6 },
      /* 声部删到一个：梗密度全场最低，曲也是 */
      bass: { wave: "sine", gain: 0.07, pattern: "0---------------", oct: -24, decay: 4.4, cutoff: 340 },
      melody: {
        wave: "sine",
        gain: 0.024,
        bars: ["0-------2-------", "4---------------", "--------2-------", "----------------"],
        oct: 12,
        decay: 4.0,
        cutoff: 820,
      },
    },
  },
  "lk-dawn": {
    meta: {
      id: "lk-dawn",
      title: "散场没有仪式",
      mood: "第二天新横幅照挂，新一届表格照发。",
    },
    score: {
      bpm: 58,
      root: 60,
      scale: PENTA,
      progression: [
        [0, 2, 4, 4],
        [2, 4, 0, 0],
      ],
      tone: { cutoff: 920, q: 0.55 },
      /* 天光渐亮的收束感：最后一个和弦落在不解决的那一格 */
      bass: { wave: "sine", gain: 0.075, pattern: "0---------------", oct: -24, decay: 4.0, cutoff: 380 },
      melody: {
        wave: "sine",
        gain: 0.026,
        bars: ["0-------2-------", "4-------2-------", "0---------------", "----------------"],
        oct: 12,
        decay: 3.8,
        cutoff: 900,
      },
      pad: { wave: "sine", gain: 0.035, attack: 2.6, cutoff: 720 },
    },
  },
  /* 《开学第一课》二首（表现层切片八）：慢放两遍的三秒掌声、把「等」放在桌边 */
  "fc-hall": {
    meta: {
      id: "fc-hall",
      title: "青春风采",
      mood: "掌声最响的三秒被慢放了两遍，配了字幕。",
    },
    score: {
      bpm: 84,
      root: 62,
      scale: MAJOR,
      progression: [
        [0, 4, 5, 4],
        [0, 4, 5, 4],
      ],
      tone: { cutoff: 2200, q: 0.55 },
      /* 辉煌但空：重拍全落在字幕点上 */
      drums: {
        kick: "x---x---x-x-x---",
        kickGain: 0.07,
        snare: "----x-------x---",
        snareGain: 0.05,
        hat: "--x---x---x---x-",
        hatGain: 0.024,
      },
      bass: { wave: "triangle", gain: 0.095, pattern: "0-0-4-0-0-5-0-4-", oct: -12, decay: 0.42, cutoff: 640 },
      arp: { wave: "square", gain: 0.024, pattern: "0-4-5-4-0-4-5-4-", oct: 12, decay: 0.16, cutoff: 2600 },
      pad: { wave: "sine", gain: 0.05, attack: 0.8, cutoff: 1500 },
    },
  },
  "fc-wait": {
    meta: {
      id: "fc-wait",
      title: "我等",
      mood: "他不催。他把那个「等」放在这儿，像把一把椅子搬到桌边，然后看着你。",
    },
    score: {
      bpm: 56,
      root: 55,
      scale: MINOR,
      progression: [
        [0, 2, 4, 7],
        [1, 3, 5, 8],
      ],
      tone: { cutoff: 760, q: 0.6 },
      /* 一个声部悬着，尾音不落：等本身 */
      bass: { wave: "sine", gain: 0.075, pattern: "0---------------", oct: -24, decay: 4.2, cutoff: 360 },
      melody: {
        wave: "sine",
        gain: 0.024,
        bars: ["0---------------", "----------------", "3---------------", "----------------"],
        oct: 12,
        decay: 4.0,
        cutoff: 840,
      },
    },
  },
  /* 《最终解释权》二首（表现层切片七）：整栋楼黑着的那格灯、改稿改到手指自己会动 */
  "admin-night": {
    meta: {
      id: "admin-night",
      title: "那一格灯",
      mood: "整栋楼黑着。学工办那一格灯，是这层楼唯一还醒着的东西。",
    },
    score: {
      bpm: 62,
      root: 57,
      scale: MINOR,
      progression: [
        [0, 2, 4, 7],
        [3, 5, 7, 10],
      ],
      tone: { cutoff: 900, q: 0.55 },
      /* 规整进行曲的骨架但声部减半，像下了班的走廊 */
      drums: {
        hat: "x-------x-------",
        hatGain: 0.012,
      },
      bass: { wave: "sine", gain: 0.085, pattern: "0---------------", oct: -24, decay: 3.0, cutoff: 400 },
      melody: {
        wave: "sine",
        gain: 0.03,
        bars: ["0---------------", "--------3-------", "2---------------", "----------------"],
        oct: 12,
        decay: 3.0,
        cutoff: 950,
      },
      pad: { wave: "sine", gain: 0.04, attack: 2.2, cutoff: 780 },
    },
  },
  "admin-template": {
    meta: {
      id: "admin-template",
      title: "改到手指自己会动",
      mood: "问多了，她自己也想问。想问的时候就去改稿。",
    },
    score: {
      bpm: 74,
      root: 62,
      scale: MAJOR,
      progression: [
        [0, 4, 2, 5],
        [0, 4, 2, 5],
      ],
      tone: { cutoff: 1700, q: 0.6 },
      /* 规整到机械：琶音一板一眼，像输入法的候选第一位 */
      drums: {
        tick: "x---x---x---x---",
        tickGain: 0.024,
      },
      bass: { wave: "triangle", gain: 0.085, pattern: "0-0-2-0-0-4-0-2-", oct: -12, decay: 0.5, cutoff: 560 },
      arp: { wave: "square", gain: 0.026, pattern: "0-2-4-2-0-2-4-2-", oct: 12, decay: 0.14, cutoff: 2100 },
    },
  },
  /* 《上岸第一剑》二首（表现层切片六）：天色一格格退、夹层抽纸前后三秒的心跳 */
  "study-desk": {
    meta: {
      id: "study-desk",
      title: "天从橘色褪成灰蓝",
      mood: "楼道里的声控灯亮了又灭。这段时间，你们谁也没说话。",
    },
    score: {
      bpm: 68,
      root: 59,
      scale: MINOR,
      progression: [
        [0, 2, 4, 7],
        [3, 5, 7, 10],
        [0, 2, 5, 8],
        [1, 3, 5, 8],
      ],
      tone: { cutoff: 1150, q: 0.5 },
      /* 铺底薄，像天色一格格退 */
      drums: {
        hat: "x-------x-------",
        hatGain: 0.014,
      },
      bass: { wave: "sine", gain: 0.085, pattern: "0-------3-------", oct: -12, decay: 2.4, cutoff: 460 },
      melody: {
        wave: "sine",
        gain: 0.03,
        bars: ["0-------2-------", "----------------", "3---------------", "--------1-------"],
        oct: 12,
        decay: 3.0,
        cutoff: 1050,
      },
      pad: { wave: "sine", gain: 0.05, attack: 1.8, cutoff: 820 },
    },
  },
  "study-locked": {
    meta: {
      id: "study-locked",
      title: "前后三秒",
      mood: "打开，看了一眼，又折回去。前后三秒。",
    },
    score: {
      bpm: 72,
      root: 55,
      scale: MINOR,
      progression: [
        [0, 2, 4, 7],
        [0, 2, 5, 8],
      ],
      tone: { cutoff: 950, q: 0.6 },
      /* 心跳鼓点一记一记，尾音悬着不落 */
      drums: {
        kick: "x-------x-------",
        kickGain: 0.06,
      },
      bass: { wave: "sine", gain: 0.09, pattern: "0---------------", oct: -24, decay: 2.6, cutoff: 420 },
      melody: {
        wave: "sine",
        gain: 0.032,
        bars: ["0---------------", "--------2-------", "1---------------", "----------------"],
        oct: 12,
        decay: 2.8,
        cutoff: 980,
      },
    },
  },
  /* 深夜自习室专属曲（批次 CY-23）：预约系统显示「已离开」，可灯底下的笔尖还没停。
     十六分的小碎步是笔尖划纸，八分一声的 tick 是整层楼只剩的那座钟 */
  "study-lamp": {
    meta: {
      id: "study-lamp",
      title: "凌晨三点的那排灯",
      mood: "预约屏说你走了，可最后一排灯底下，笔尖还在。",
    },
    score: {
      bpm: 76,
      root: 59,
      scale: MINOR,
      progression: [
        [0, 2, 4],
        [3, 5, 7],
        [5, 7, 9],
        [4, 6, 8],
      ],
      tone: { cutoff: 1300, q: 0.5 },
      drums: {
        hat: "0-0-0-0-0-0-0-0-",
        tick: "--------0-------",
        hatGain: 0.016,
        tickGain: 0.04,
      },
      bass: { wave: "sine", gain: 0.06, pattern: "0-------2---0---", oct: -12, decay: 1.6, cutoff: 450 },
      arp: { wave: "triangle", gain: 0.028, pattern: "0-------4-------", oct: 24, decay: 1.0, cutoff: 2200 },
      pad: { wave: "sine", gain: 0.055, attack: 1.2, cutoff: 800 },
      melody: {
        wave: "triangle",
        gain: 0.034,
        bars: [
          "0-------2-4-----",
          "2---4-------2---",
          "4---2---0-------",
          "0-------4---5---",
          "5---4---2---0---",
          "2-------0-2-----",
          "4---5---7---5---",
          "4---2---0-------",
        ],
        oct: 12,
        decay: 1.2,
        cutoff: 2400,
      },
    },
  },
  /* 隐藏曲（批次 CY-25）：弹法收集全部集齐才亮出来的安可曲。
     高音区的正弦泛音像返场的小钟，散场的剧场里只剩一只蛙，乐队为它多弹一首 */
  /* 隐藏曲（批次 CY-105）：五个天气夜集齐才亮出来的天气合唱。
    多利亚调式的夜雨小调——伞、雷、雾、阴天、月亮挤进同一个晚上，柜子不认的天气，电台在播 */
  "nights-weather": {
    meta: {
      id: "nights-weather",
      title: "五夜都下了雨",
      mood: "伞、雷、雾、阴天、月亮挤进同一个晚上。台账上写着天气正常，电台放的是另一套。",
    },
    score: {
      bpm: 62,
      root: 55,
      scale: DORIAN,
      progression: [
        [0, 2, 4],
        [2, 4, 6],
        [5, 2, 0],
        [0, 2, 4],
      ],
      tone: { cutoff: 1500, q: 0.4 },
      drums: {
        tick: "--------0-------",
        tickGain: 0.025,
      },
      bass: { wave: "sine", gain: 0.06, pattern: "0-------3-------", oct: -12, decay: 2.0, cutoff: 450 },
      arp: { wave: "triangle", gain: 0.028, pattern: "2-------5-------", oct: 24, decay: 1.3, cutoff: 2400 },
      pad: { wave: "sine", gain: 0.05, attack: 1.6, cutoff: 800 },
      melody: {
        wave: "sine",
        gain: 0.036,
        bars: [
          "0---3---5---3---",
          "5---7---5---3---",
          "3---2---0---2---",
          "7---5---3---0---",
          "0-2-3-5-7---5-3-",
          "5-3-2-0-2---3---",
          "3---5---7---9---",
          "7---5---3---0---",
        ],
        oct: 24,
        decay: 1.3,
        cutoff: 2500,
      },
    },
  },
  encore: {
    meta: {
      id: "encore",
      title: "安可是观众要的",
      mood: "清场广播放到第三遍，剧场只剩一只蛙。乐队把灯重新打开：那就再来一首。",
    },
    score: {
      bpm: 70,
      root: 65,
      scale: MAJOR,
      progression: [
        [0, 2, 4],
        [2, 4, 6],
        [3, 5, 7],
        [0, 2, 4],
      ],
      tone: { cutoff: 1700, q: 0.4 },
      drums: {
        tick: "--------0-------",
        tickGain: 0.03,
      },
      bass: { wave: "sine", gain: 0.06, pattern: "0-------4-------", oct: -12, decay: 1.8, cutoff: 480 },
      arp: { wave: "sine", gain: 0.03, pattern: "4-------7-------", oct: 24, decay: 1.1, cutoff: 2600 },
      pad: { wave: "sine", gain: 0.055, attack: 1.4, cutoff: 850 },
      melody: {
        wave: "sine",
        gain: 0.038,
        bars: [
          "4---5---6---7---",
          "5---4---2---4---",
          "7-----5---42----",
          "0---2---4---7---",
          "7-7-5-5-4-4-2-0-",
          "0-2-4-5-7---5---",
          "4-5-7---9---7-5-",
          "6---5---4---2---",
        ],
        oct: 24,
        decay: 1.2,
        cutoff: 2600,
      },
    },
  },
  /* 《躺在草坪上思考蛙生》二首（表现层切片五）：黄昏辩不完的题、夜风里的真话 */
  "field-debate": {
    meta: {
      id: "field-debate",
      title: "辩完了",
      mood: "这题一千年没辩出来过。赢的永远是汽水。",
    },
    score: {
      bpm: 76,
      root: 62,
      scale: MAJOR,
      progression: [
        [0, 3, 5, 4],
        [0, 3, 5, 4],
        [5, 2, 4, 3],
        [5, 2, 4, 3],
      ],
      tone: { cutoff: 1400, q: 0.5 },
      /* 两声部一来一回像抬杠，尾音带一点笑 */
      drums: {
        kick: "x-----x---------",
        kickGain: 0.045,
        hat: "--x-x---x-x-x---",
        hatGain: 0.02,
      },
      bass: { wave: "triangle", gain: 0.09, pattern: "0-------5-------", oct: -12, decay: 1.6, cutoff: 520 },
      arp: { wave: "triangle", gain: 0.038, pattern: "0-4-2-4-5-4-2-4-", oct: 12, decay: 0.22, cutoff: 2400 },
      pad: { wave: "sine", gain: 0.045, attack: 1.0, cutoff: 1050 },
    },
  },
  "field-night": {
    meta: {
      id: "field-night",
      title: "夜风把草坪吹凉了",
      mood: "远处的灯一格一格亮。躺着的人到这时才开始说真话。",
    },
    score: {
      bpm: 54,
      root: 57,
      scale: MINOR,
      progression: [
        [0, 4, 2, 7],
        [3, 0, 5, 2],
      ],
      tone: { cutoff: 820, q: 0.6 },
      /* 慢而远：风感铺底，旋律像被人含在嘴里 */
      drums: {
        hat: "x-------x-------",
        hatGain: 0.009,
      },
      bass: { wave: "sine", gain: 0.08, pattern: "0---------------", oct: -24, decay: 3.8, cutoff: 380 },
      melody: {
        wave: "sine",
        gain: 0.028,
        bars: ["0---------------", "--------2-------", "4---------------", "----------------"],
        oct: 12,
        decay: 3.6,
        cutoff: 900,
      },
    },
  },
  /* 《抽象社团招新》二首（表现层切片四）：打气循环的甜与累、灯灭后没人管的静 */
  "club-smile": {
    meta: {
      id: "club-smile",
      title: "保持微笑",
      mood: "打一个爆一个。她还笑——给路过的学弟指路的那种笑。",
    },
    score: {
      bpm: 74,
      root: 60,
      scale: MAJOR,
      progression: [
        [0, 4, 2, 5],
        [0, 4, 2, 5],
        [3, 1, 4, 5],
        [3, 1, 4, 5],
      ],
      tone: { cutoff: 1500, q: 0.5 },
      /* 四小节动机来回两遍：笑维持到第六个小时的循环感 */
      drums: {
        kick: "x-------x---x---",
        kickGain: 0.05,
        hat: "--x---x---x---x-",
        hatGain: 0.022,
      },
      bass: { wave: "triangle", gain: 0.095, pattern: "0---0---4---4---", oct: -12, decay: 1.4, cutoff: 560 },
      arp: { wave: "triangle", gain: 0.04, pattern: "0-2-4-2-0-2-4-2-", oct: 12, decay: 0.2, cutoff: 2400 },
      pad: { wave: "sine", gain: 0.05, attack: 1.2, cutoff: 1100 },
    },
  },
  "club-blackout": {
    meta: {
      id: "club-blackout",
      title: "没人回去开",
      mood: "灯灭了十分钟。那是这间屋子一学期里唯一没被排班的十分钟。",
    },
    score: {
      bpm: 54,
      root: 57,
      scale: MINOR,
      progression: [
        [0, 2, 4, 7],
        [0, 2, 5, 9],
      ],
      tone: { cutoff: 880, q: 0.55 },
      /* 声部删到两个，尾音长而散：没人负责的安静 */
      bass: { wave: "sine", gain: 0.085, pattern: "0---------------", oct: -24, decay: 3.6, cutoff: 400 },
      melody: {
        wave: "sine",
        gain: 0.03,
        bars: ["0---------------", "3---------------", "----------------", "----------------"],
        oct: 12,
        decay: 3.4,
        cutoff: 980,
      },
    },
  },
};

/** 音乐鉴赏分组（批次 CY-17）：按生活场景分四格——白天日常 / 社团活动 / 深夜怪谈 / 回忆告别 */
export type BgmGroupId = "day" | "club" | "night" | "memory";

const TRACK_GROUPS: Record<BgmTrackId, BgmGroupId> = {
  daily: "day",
  afternoon: "day",
  canteen: "day",
  library: "day",
  admin: "day",
  "library-list": "day",
  "admin-template": "day",
  club: "club",
  "club-smile": "club",
  "club-blackout": "club",
  field: "club",
  "field-debate": "club",
  "field-night": "club",
  "fc-hall": "club",
  "fc-wait": "club",
  night: "night",
  study: "night",
  "study-desk": "night",
  "study-locked": "night",
  "study-lamp": "night",
  encore: "memory",
  "nights-weather": "night",
  "library-late": "night",
  "canteen-late": "night",
  "canteen-after": "night",
  "dorm-hall": "night",
  "dorm-room": "night",
  "dorm-dark": "night",
  "dorm-talk": "night",
  "dorm-dawn": "night",
  tension: "night",
  "admin-night": "night",
  infirmary: "day",
  corridor: "day",
  class: "day",
  "dusk-field": "club",
  farm: "club",
  memory: "memory",
  ending: "memory",
  "lk-quiet": "memory",
  "lk-dawn": "memory",
};

/* ---------- 隐藏曲（批次 CY-25）：弹法收集集齐才亮出来的安可曲 ---------- */

/** 隐藏曲目：不进曲库清单、不进收集分母——集齐前它们不存在 */
const HIDDEN_TRACKS: ReadonlySet<BgmTrackId> = new Set<BgmTrackId>(["encore", "nights-weather"]);

/** 是不是隐藏曲（图鉴据此决定卡面显示收集灯还是谢幕语） */
export function isHiddenBgmTrack(id: BgmTrackId): boolean {
  return HIDDEN_TRACKS.has(id);
}

/** 按「弹法集齐」判定是否集齐：可收集曲 = 全部非隐藏曲；每首 = 8 支乐队，结局曲锁死只算原乐队 */
function isVariantSetComplete(heard: Record<string, number>): boolean {
  for (const id of TRACK_ORDER) {
    if (HIDDEN_TRACKS.has(id)) continue;
    const keys: BgmKeynoteId[] = id === "ending" ? ["milk"] : KEYNOTE_IDS.filter(isKeynoteId);
    for (const kid of keys) {
      if ((heard[`${id}|${kid}`] ?? 0) <= 0) return false;
    }
  }
  return true;
}

/** 安可曲是否已解锁（图鉴头部/卡面与起曲放行共用） */
export function isEncoreUnlocked(): boolean {
  return isVariantSetComplete(loadSettings().bgmVariantHeard);
}

/** 隐藏曲按各自的钥匙解锁（批次 CY-105）：安可=弹法集齐；天气合唱=观夜员成就 */
function isHiddenTrackUnlocked(id: BgmTrackId): boolean {
  if (id === "encore") return isEncoreUnlocked();
  if (id === "nights-weather") return getUnlockedAchievements().includes("ach-night-weather");
  return false;
}

/** 曲库清单（音乐鉴赏区块用；顺序即展示顺序；group = 分格归属；隐藏曲未解锁前不出现） */
export function listBgmTracks(): Array<BgmTrackMeta & { group: BgmGroupId }> {
  return TRACK_ORDER.filter((id) => !HIDDEN_TRACKS.has(id) || isHiddenTrackUnlocked(id)).map((id) => ({
    ...TRACKS[id].meta,
    group: TRACK_GROUPS[id] ?? "day",
  }));
}

/* ---------- 引擎：AudioContext / 总线 / 调度器 ---------- */

const LOOKAHEAD_S = 0.28;
const TICK_MS = 55;
const CROSSFADE_S = 0.8;

interface BgmRig {
  ctx: AudioContext;
  bus: GainNode;
  /** 空间链（批次 CY-9）：总线干信号之外并一条反馈回声，回声在低通里逐次变暗 */
  delay: DelayNode;
  delayFb: GainNode;
  wetGain: GainNode;
}

interface BgmInstance {
  id: BgmTrackId;
  score: BgmScore;
  /** 学期变奏：1 = 原曲；2+ 逐学期转调 / 换调式侧面 / 转位（见 PITCH_PLANS） */
  variant: number;
  /** 语境键（批次 CX）：起曲时的天气|心情——天气或心情变了，曲子交叉淡入淡出地跟着换调 */
  ctxKey: string;
  /** 漂移（批次 CX）：曲子走着走着自己挪的半音数（±2 内），让每一遍都不完全一样 */
  drift: number;
  /** 曲轨音量：交叉淡入淡出都发生在这个节点上 */
  gain: GainNode;
  /** 整轨音色滤波（鼓组绕过它，保证打击点始终清脆） */
  filter: BiquadFilterNode | null;
  stepIndex: number;
  /** 和声进行已经走了几整遍：曲内离调回光按「双数遍」触发 */
  cycles: number;
  nextTime: number;
  /** 正在淡出、不再排新音符 */
  dead: boolean;
}

let rig: BgmRig | null = null;
let rigFailed = false;
let gestureWired = false;
let noise: AudioBuffer | null = null;

/** 最后一次被页面请求的曲目：静音后再开 BGM 就从它继续 */
let desiredId: BgmTrackId | null = null;
let desiredVariant = 1;
let active: BgmInstance | null = null;
const fading: BgmInstance[] = [];
let currentId: BgmTrackId | null = null;

let ticker: number | null = null;
let tickCount = 0;
let busVolume = 0;
let onCache: boolean | null = null;

type BgmListener = (id: BgmTrackId | null) => void;
const listeners = new Set<BgmListener>();

function readBgmOn(): boolean {
  if (onCache === null) onCache = loadSettings().bgmOn;
  return onCache;
}

function readBgmVolume(): number {
  const volume = loadSettings().bgmVolume;
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.5;
}

/** BGM 开关当前值（顶栏图标 / 设置弹层用） */
export function isBgmOn(): boolean {
  return readBgmOn();
}

/** 立刻把 settings.bgmVolume 同步到总线增益（设置里拖滑条后即时生效） */
export function applyBgmVolume(): void {
  syncBusVolume(true);
}

function syncBusVolume(force = false): void {
  const r = rig;
  if (!r) return;
  const target = readBgmVolume() * (1 - 0.6 * duckLevel());
  if (!force && Math.abs(target - busVolume) < 0.004) return;
  busVolume = target;
  try {
    r.bus.gain.setTargetAtTime(target, r.ctx.currentTime, 0.12);
  } catch {
    /* 数值异常就下次再试 */
  }
}

/* ---------- 音量自动闪避（批次 CY-10）：有话说时，BGM 自动低头 ---------- */

/** 持续闪避（选项摊开等决定这类场景）与脉冲闪避（一句话出口的一下）叠加取强 */
let duckSustain = 0;
let duckPulseLevel = 0;
let duckPulseUntil = 0;

/** 脉冲闪避：立刻压到 level、holdS 秒后回满；连续触发取更强、更久的那个 */
export function bgmDuckPulse(level = 0.32, holdS = 0.3): void {
  duckPulseLevel = Math.max(duckPulseLevel, Math.min(1, level));
  duckPulseUntil = Math.max(duckPulseUntil, Date.now() + Math.max(0.05, holdS) * 1000);
  syncBusVolume(true);
}

/** 持续闪避：传 0 解除；与脉冲同时存在时取更深的一方 */
export function setBgmDuckSustain(level: number): void {
  duckSustain = Math.min(1, Math.max(0, level));
  syncBusVolume(true);
}

/** 当前闪避深度（0-1）：脉冲到期自动归零，由调度心跳兜底刷新 */
function duckLevel(): number {
  if (duckPulseLevel > 0 && Date.now() >= duckPulseUntil) duckPulseLevel = 0;
  return Math.max(duckSustain, duckPulseLevel);
}

/** 每 ~1s 把开关与音量的设置值拉进缓存（设置面板改完最迟一秒生效，兜底） */
function syncSettings(): void {
  const settings = loadSettings();
  onCache = settings.bgmOn;
  keynoteCache = keynoteFrom(settings.bgmKeynote);
  autoKeyCache = settings.bgmAutoKeynote === true;
  syncBusVolume();
}

function ensureRig(): BgmRig | null {
  if (rigFailed) return null;
  if (rig) return rig;
  if (typeof window === "undefined") {
    rigFailed = true;
    return null;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    rigFailed = true;
    return null;
  }
  try {
    const ctx = new Ctor();
    const bus = ctx.createGain();
    busVolume = readBgmVolume();
    bus.gain.value = busVolume;
    bus.connect(ctx.destination);
    /* 空间链（批次 CY-9）：bus 分一路进 0.34s 反馈延迟，回声每遍经 2.6k 低通变暗一层，
       湿声 0.22 独立回混——所有曲子从此自带一间屋子；淡出的旧曲也会拖出回声尾巴。 */
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.34;
    const delayFb = ctx.createGain();
    delayFb.gain.value = 0.32;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2600;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.22;
    bus.connect(delay);
    delay.connect(damp);
    damp.connect(delayFb);
    delayFb.connect(delay);
    damp.connect(wetGain);
    wetGain.connect(ctx.destination);
    rig = { ctx, bus, delay, delayFb, wetGain };
  } catch {
    rigFailed = true;
    return null;
  }
  return rig;
}

/** 浏览器自动播放策略：AudioContext 要等一次用户手势。挂一次全局兜底监听，失败静默 */
function wake(r: BgmRig): void {
  try {
    if (r.ctx.state === "suspended") void r.ctx.resume().catch(() => undefined);
  } catch {
    /* 这次手势没被认可就先哑着 */
  }
  if (gestureWired) return;
  gestureWired = true;
  const resume = () => {
    const current = rig;
    if (current && current.ctx.state === "suspended") {
      void current.ctx.resume().catch(() => undefined);
    }
  };
  window.addEventListener("pointerdown", resume, { passive: true });
  window.addEventListener("keydown", resume, { passive: true });
}

function notify(): void {
  const id = currentId;
  for (const listener of [...listeners]) {
    try {
      listener(id);
    } catch {
      /* 单个订阅方出错不影响别人 */
    }
  }
}

function syncTicker(): void {
  const needed = active !== null || fading.length > 0 || desiredId !== null;
  if (needed && ticker === null) ticker = window.setInterval(tickAll, TICK_MS);
  else if (!needed && ticker !== null) {
    window.clearInterval(ticker);
    ticker = null;
  }
}

function createInstance(id: BgmTrackId, score: BgmScore, r: BgmRig, variant = 1, ctxKey = ""): BgmInstance {
  const gain = r.ctx.createGain();
  gain.gain.value = 0.0001;
  let filter: BiquadFilterNode | null = null;
  const tone = score.tone;
  if (tone && tone.cutoff > 0) {
    filter = r.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = tone.cutoff;
    filter.Q.value = tone.q ?? 0.7;
    filter.connect(gain);
  }
  gain.connect(r.bus);
  return {
    id,
    score,
    variant,
    ctxKey,
    drift: 0,
    gain,
    filter,
    stepIndex: 0,
    cycles: 0,
    nextTime: r.ctx.currentTime + 0.06,
    dead: false,
  };
}

/* ---------- 学期变奏（批次 W 定骨架，批次 CU 重写成「变调」） ---------- */

/** 相对调旋转：把调式从第 N 级重新数起——数学上就是「关系调」。
 *  大调旋 5 级即关系小调，其余调式各得一个新侧面；五声旋转仍是五声，怎么转都不刺。 */
function rotateMode(scale: number[], rotation: number): number[] {
  const len = Math.max(1, scale.length);
  const at = (i: number): number => scale[((i % len) + len) % len] ?? 0;
  const off = at(rotation);
  return scale.map((_, i) => {
    const raw = at(i + rotation) - off;
    return ((raw % 12) + 12) % 12;
  });
}

/** 主音夹在能被四轨共同呼吸的音区里：太高低音发飘，太低铺底发闷 */
function clampRoot(midi: number): number {
  return Math.max(48, Math.min(67, midi));
}

/** 每学期的「调」：转多少、转去哪个调式侧面、偶数和弦转不转位、旋律换不换音区 */
interface PitchPlan {
  /** 整体移调（半音）：正 = 拔高，负 = 沉底 */
  semis: number;
  /** 调式旋转（音阶级）：0 = 不换侧面 */
  rotate: number;
  /** 偶数和弦转位：把每第二个和弦的音序轮一格，低音走向就变了 */
  invert: boolean;
  /** 旋律八度微调（半音）：换一个音区呼吸 */
  melodyShift: number;
}

const PITCH_PLANS: PitchPlan[] = [
  { semis: 0, rotate: 0, invert: false, melodyShift: 0 }, // 第 1 学期：原曲
  { semis: -2, rotate: 0, invert: false, melodyShift: 0 }, // 第 2 学期：低大二度——同一首，往下沉了一点
  { semis: 3, rotate: 1, invert: false, melodyShift: -12 }, // 第 3 学期：上小三度 + 换调式侧面，旋律收抽屉的那学期音区也降一档
  { semis: -5, rotate: 5, invert: true, melodyShift: 0 }, // 第 4 学期：下纯四度转关系调，偶数和弦转位
  { semis: 5, rotate: 3, invert: true, melodyShift: 12 }, // 第 5 学期：上纯四度再转一次，旋律抬八度
  { semis: -3, rotate: 4, invert: true, melodyShift: 0 }, // 第 6 学期：下小三度，换到混合侧面，继续转位
  { semis: 7, rotate: 2, invert: false, melodyShift: 0 }, // 第 7 学期：上纯五度——离原调最远的一次
  { semis: -7, rotate: 1, invert: true, melodyShift: 0 }, // 第 8 学期：下纯五度回航
  { semis: 2, rotate: 4, invert: false, melodyShift: 0 }, // 第 9 学期：回到原调附近，调式侧面换完一整圈
];

/** 各曲在本学期的微差（批次 CU 拓展）：同一学期里不同曲子往不同方向偏半音上下——
 *  整个曲库不是平行移动的，换学期之后曲与曲之间的相对关系也会变。 */
function trackJitterOf(id: BgmTrackId): number {
  const index = TRACK_ORDER.indexOf(id);
  return [0, -1, 1, 0, 2, -2][((index < 0 ? 0 : index) % 6 + 6) % 6] ?? 0;
}

/* ---------- 语境调音（批次 CX）：天气 / 心情 / 随机因素进调性 ---------- */

/** 语境调音的形状：移调、调式旋转、换基调音阶、音色明暗、速度微调 */
interface BgmTint {
  semis: number;
  rotate: number;
  scale?: number[];
  cutoffMul: number;
  bpmAdd: number;
}

/** 天气 → 基调：晴照旧；阴下沉；雨又暗又慢；雾换平调子（全新基调）并收暗；风拔高催一步 */
const WEATHER_TINT: Record<string, Partial<BgmTint>> = {
  sunny: { semis: 0 },
  cloudy: { semis: -2, cutoffMul: 0.9 },
  rain: { semis: -3, rotate: 1, cutoffMul: 0.8, bpmAdd: -2 },
  fog: { semis: -4, scale: HIRAJOSHI, cutoffMul: 0.62, bpmAdd: -3 },
  wind: { semis: 2, rotate: 4, bpmAdd: 3 },
};

/** 心情 → 亮度：被注意多了就紧（拔高、催一步、开亮），沉默多了就低（转关系小调、收暗），两头都轻就暖（转大调侧面） */
const MOOD_TINT: Record<string, Partial<BgmTint>> = {
  calm: { semis: 0 },
  warm: { semis: 0, rotate: 3, cutoffMul: 1.1, bpmAdd: 1 },
  tense: { semis: 1, rotate: 2, cutoffMul: 1.15, bpmAdd: 4 },
  low: { semis: -2, rotate: 5, cutoffMul: 0.7, bpmAdd: -3 },
};

/* ---------- 基调（批次 CY）：玩家可选的整库底色 ---------- */

export type BgmKeynoteId = "milk" | "soda" | "dusk" | "phantom" | "nap" | "festival" | "musicbox" | "jazz";

export interface BgmKeynoteMeta {
  id: BgmKeynoteId;
  label: string;
  /** 菜单副标题：一句听感 */
  blurb: string;
}

/** 八套基调 = 八首「另一首歌」+ 八支「另一支乐队」（批次 CY-21 补八音盒与爵士）：每套自带全新的主旋律乐句库与和声进行（见 KEYNOTE_SONGS），
 *  外加底色（移调 / 换音阶 / 明暗 / 快慢），外加编曲（见 KEYNOTE_ARRANGE：换波形、配器比例、摇摆、回声厅深）。
 *  换基调 = 整库曲子的旋律、和声、乐队、厅堂全部换掉，只留每首曲子的节奏骨架（场景还认得出，歌和乐队都是新的）。
 *  批次 CY-11 把六套拉得更开：音阶五套各不相同、移调跨度 -5～+4、速度跨度 -10～+14、编曲各走极端。 */
const KEYNOTES: Array<BgmKeynoteMeta & { tint: Partial<BgmTint> }> = [
  { id: "milk", label: "奶黄原味", blurb: "原曲原乐队：那间教室的味道，什么都不加", tint: {} },
  { id: "soda", label: "清晨汽水", blurb: "方波气泡 + 催拍鼓：开盖就跳的错拍主题歌", tint: { semis: 4, scale: LYDIAN, cutoffMul: 1.2, bpmAdd: 9 } },
  { id: "dusk", label: "黄昏站台", blurb: "正弦长音 + 长回声：一声声往下掉的告别", tint: { semis: -5, scale: DORIAN, cutoffMul: 0.7, bpmAdd: -8 } },
  { id: "phantom", label: "午夜幽灵", blurb: "鼓退到墙后：深混响大厅里的执念念白", tint: { semis: -4, scale: PHRYGIAN, cutoffMul: 0.5, bpmAdd: -3 } },
  { id: "nap", label: "午睡云田", blurb: "鼓声睡着了的漂浮摇篮曲，只剩五声长音", tint: { semis: 2, scale: PENTA, cutoffMul: 0.85, bpmAdd: -10 } },
  { id: "festival", label: "祭典太鼓", blurb: "全乐队踩满的干声祭曲：鼓要敲破", tint: { semis: 3, scale: MIXOLYDIAN, cutoffMul: 1.3, bpmAdd: 14 } },
  { id: "musicbox", label: "八音盒华尔兹", blurb: "没有鼓发条乐队：叮叮咚咚的三拍子，回声最深", tint: { semis: 5, cutoffMul: 1.35, bpmAdd: -2 } },
  { id: "jazz", label: "雨夜爵士", blurb: "拖半拍的正弦四重奏：摇摆、七和弦、楼道里的烟味（没有烟）", tint: { semis: -2, scale: DORIAN, cutoffMul: 0.92, bpmAdd: -6 } },
];

/* ---------- 基调换曲（批次 CY-3）：每套基调自带全新的旋律与和声，换基调 = 换一首歌 ---------- */

/** 一套基调的「另一首歌」：专属和声进行 + 专属主旋律乐句库。
 *  谱面照旧只写音阶级数，所以同一套基调落在不同曲子的音阶 / 音色上，长出一整库的新歌。 */
interface KeynoteSong {
  /** 专属和声进行（音阶级数数组，按原曲进行长度循环截取） */
  progression: number[][];
  /** 专属主题旋律乐句库（一小节一句；每首曲子从不同起点、不同步长领句，整库不重样） */
  phrases: StepPattern[];
}

const KEYNOTE_SONGS: Partial<Record<BgmKeynoteId, KeynoteSong>> = {
  /* 清晨汽水：切分音短句 + 大跳，像开瓶的气泡一路蹦 */
  soda: {
    progression: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]],
    phrases: [
      "0-0-2-4-2-0---4-",
      "4-4-2-2-0-0-7---",
      "2-4-5-4-2-0-2---",
      "0-2-4-7-4-2-0---",
      "7-5-4-2-4---0---",
      "2-2-4-4-5-4-2-0-",
      "0---4---2---0---",
      "4-5-4-2-0-2-4---",
      "0-4-0-4-7-4-0-4-",
      "7-4-2-0-2-4-7-4-",
      "2-0-2-4-2---7-5-",
      "4---7-4---2-0-4-",
      "0-2-0-4-0-7-4-2-",
      "5-4-2-4-7---5-4-",
      "2-7-4-7-2-4-0---",
      "0-0-7-7-4-4-0---",
    ],
  },
  /* 黄昏站台：长音下叹，句句往下掉，掉进留白里 */
  dusk: {
    progression: [[0, 2, 4], [6, 8, 10], [5, 7, 9], [3, 5, 7]],
    phrases: [
      "5---4---2---0---",
      "4---2-------0---",
      "2---0-------5---",
      "0-------2---4---",
      "7---5-------4---",
      "4-------0---2---",
      "5-4---2---0-----",
      "2---4---0-------",
      "7-------5---4---",
      "5---2-------0---",
      "0---4-------2---",
      "4-2---0-------5-",
      "2-------4---2---",
      "0-----2---4-5---",
      "5-4-2-0-------2-",
      "7-------4-------",
    ],
  },
  /* 午夜幽灵：窄音域执念反复，小二度贴着走，两个和弦的念白 */
  phantom: {
    progression: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [1, 3, 6]],
    phrases: [
      "0-0-1-0-3-0-1---",
      "3-1-0---1-3-5---",
      "0-1-3-1-0-------",
      "5-3-1-0-1---0---",
      "1---0---3---1---",
      "0-1-0-3-5---3---",
      "3-5-7-5-3---1---",
      "0---1-3-0-------",
      "1-3-1-0-1---0---",
      "0-0-0-1-3-1-0-0-",
      "5-5-3-1-3---1---",
      "1---3-5-3-1-----",
      "0-3-1-1-0-------",
      "3-3-5-3-1-0-1---",
      "6-5-3-1-0---0---",
      "0-1-0-0-3---1---",
    ],
  },
  /* 午睡云田：五声上的长音漂浮，句子之间全是云 */
  nap: {
    progression: [[0, 2, 4], [3, 5, 7], [0, 2, 4], [2, 4, 6]],
    phrases: [
      "0-----2-----4---",
      "4---2-------0---",
      "2-----4---2-----",
      "0---4-----2-----",
      "4-----7-----4---",
      "2-------0-----2-",
      "0-2---4-------2-",
      "4---2-0---------",
      "7-----4-----2---",
      "2---0-------4---",
      "0-----2-------4-",
      "4-2-------2-0---",
      "7---4-------2-0-",
      "2-4---0-------2-",
      "0---2---4-------",
      "4-----0---2-----",
    ],
  },
  /* 祭典太鼓：一口气十六分往上跑，句尾甩出去再接下一句 */
  festival: {
    progression: [[0, 2, 4], [6, 8, 10], [3, 5, 7], [6, 8, 10]],
    phrases: [
      "0-0-2-2-4-4-2-2-",
      "4-4-7-7-4-4-2-2-",
      "0-2-4-7-9-7-4-2-",
      "7-7-5-4-2-4-5-7-",
      "0-4-7-4-0-4-7-9-",
      "2-2-4-4-7-7-4-4-",
      "9-7-7-4-4-2-2-0-",
      "0-0-4-4-7-9-7---",
      "0-2-4-5-7-5-4-2-",
      "4-5-7-9-7-5-4---",
      "0-0-4-7-4-0-4-7-",
      "7-9-7-5-4-7-5-4-",
      "2-4-7-4-2-0-2-4-",
      "9-9-7-7-5-4-4-2-",
      "0-4-4-7-7-9-7---",
      "5-4-2-0-4-2-0---",
    ],
  },
  /* 八音盒华尔兹（批次 CY-21）：三拍子的发条舞曲，句子绕着主音转圈，叮完一圈再叮下一圈 */
  musicbox: {
    progression: [[0, 2, 4], [4, 6, 8], [0, 2, 4], [2, 4, 6]],
    phrases: [
      "0---4---2-4---0-",
      "0-2-4-2-0---4---",
      "4---7-4-2---0---",
      "0---2-4-7---4---",
      "2-4-7-4-2-4-0---",
      "7---4---2-0----4",
      "0-4-2-4-0-2-4-7-",
      "4-2-0---4---2-4-",
      "0---0-4----74---",
      "7-4-2---4-2-0---",
      "2---0---4---7---",
      "0-2----4---24---",
      "4-7----42---0-4-",
      "2-4----74-2----0",
      "0-0-4-4-7-7-4---",
      "7---5---4---2-0-",
    ],
  },
  /* 雨夜爵士（批次 CY-21）：七和弦上的懒调子，句子总晚半拍进门，说完半句先喘口气 */
  jazz: {
    progression: [[0, 2, 4, 6], [5, 7, 9, 11], [3, 5, 7, 9], [6, 8, 10, 12]],
    phrases: [
      "2---0-2---4-2---",
      "0----2-4--2-0---",
      "4-----2-0-2----4",
      "2-2----0-2-4---2",
      "7-----5-4-2----0",
      "0-2---4-5-4----2",
      "4-4----20-0----4",
      "2---4---2-0----2",
      "7-5----42-2----0",
      "0---2-4----24-2-",
      "5---4-2----02-4-",
      "3-3----20-2----4",
      "4-----4-2---0-2-",
      "0-0--2--4---2-0-",
      "2-4-7-4----20---",
      "7-----7-4-2---0-",
    ],
  },
};

/** 用基调自己的歌替换原曲的旋律与和声：鼓 / 贝斯 / 琶音 / 铺底 / 音色 / 速度骨架不动，
 *  所以场景还认得出，但旋律与和声是另一首歌。
 *  选句种子（CY-5）：曲目位置 × 学期——同一个基调每学期换一批句子、和声换个起点起步；
 *  雨天与雾天自动放慢抽句（步长锁 1，句子一个接一个，不跳着唱）。 */
function keynoteSongScore(
  score: BgmScore | undefined,
  keynote: BgmKeynoteId,
  trackId: BgmTrackId,
  variant: number,
  weather: string,
): BgmScore | undefined {
  if (!score) return score;
  const song = KEYNOTE_SONGS[keynote];
  if (!song) return score;
  const progLen = song.progression.length;
  const progShift = (Math.max(1, variant) - 1) % progLen;
  const progression = Array.from(
    { length: score.progression.length },
    (_, i) => song.progression[(i + progShift) % progLen] ?? score.progression[i] ?? [0, 2, 4],
  );
  if (!score.melody) return { ...score, progression };
  const len = song.phrases.length;
  const offset = TRACK_ORDER.indexOf(trackId) + 1;
  const semester = Math.max(1, variant) - 1;
  const start = (offset * 3 + semester * 7) % len;
  const stride = weather === "rain" || weather === "fog" ? 1 : 1 + ((offset + semester) % 3);
  const bars = score.melody.bars.map((original, i) => song.phrases[(start + i * stride) % len] ?? original);
  return { ...score, progression, melody: { ...score.melody, bars } };
}

/* ---------- 基调编曲（批次 CY-11）：每套基调另一支乐队，连厅堂大小都不一样 ---------- */

/** 一套基调的编曲配置：换波形（配器法）、配器比例、摇摆感、贝斯长短、铺底起音、回声厅深 */
interface KeynoteArrange {
  /** 各声部换波形（没写的声部留原曲波形） */
  waves?: Partial<Record<"bass" | "arp" | "pad" | "melody", OscillatorType>>;
  /** 各声部音量倍数：0 = 这声部退场，1 = 不动 */
  gains?: Partial<Record<"drums" | "bass" | "arp" | "pad" | "melody", number>>;
  /** 摇摆量（覆盖原曲）：0 = 方方正正，越大越拖沓 */
  swing?: number;
  /** 铺底起音秒数（覆盖）：大厅慢起音 = 阴魂不散，小快起音 = 干脆利落 */
  padAttack?: number;
  /** 贝斯单音时值秒数（覆盖）：短 = 弹跳，长 = 裹住整首 */
  bassDecay?: number;
  /** 回声（延音走廊）深度；不写 = 默认厅 0.22 */
  wet?: number;
}

const KEYNOTE_ARRANGE: Partial<Record<BgmKeynoteId, KeynoteArrange>> = {
  /* 清晨汽水：方波/锯齿的亮乐队，鼓催、琶音顶、厅很干——一切都往前冲 */
  soda: {
    waves: { bass: "sawtooth", arp: "square", pad: "square", melody: "square" },
    gains: { drums: 1.35, bass: 1.1, arp: 1.45, pad: 0.75, melody: 1.15 },
    swing: 0.14, padAttack: 0.12, bassDecay: 0.18, wet: 0.1,
  },
  /* 黄昏站台：纯正弦的软乐队，鼓半退场、铺底顶上来，贝斯拉成长音，回声拖得很长 */
  dusk: {
    waves: { bass: "sine", arp: "sine", pad: "sine", melody: "triangle" },
    gains: { drums: 0.45, bass: 0.95, arp: 0.6, pad: 1.45, melody: 1.05 },
    swing: 0.2, padAttack: 1.4, bassDecay: 1.8, wet: 0.34,
  },
  /* 午夜幽灵：鼓几乎撤走，锯齿铺底大起音像墙缝里的风，最深的大混响 */
  phantom: {
    waves: { bass: "sine", arp: "sine", pad: "sawtooth", melody: "sine" },
    gains: { drums: 0.3, bass: 1.15, arp: 0.85, pad: 1.5, melody: 1.0 },
    swing: 0, padAttack: 2.6, bassDecay: 2.2, wet: 0.48,
  },
  /* 午睡云田：鼓声睡着（×0.12），全正弦的漂浮声底，五声长音飘在云上 */
  nap: {
    waves: { bass: "sine", arp: "triangle", pad: "sine", melody: "sine" },
    gains: { drums: 0.12, bass: 0.85, arp: 1.15, pad: 1.6, melody: 1.1 },
    swing: 0.16, padAttack: 2.0, bassDecay: 2.4, wet: 0.4,
  },
  /* 祭典太鼓：锯齿/方波的铜管式乐队，鼓×1.7 踩满，零摇摆直线冲，厅最干——全糊在耳边 */
  festival: {
    waves: { bass: "sawtooth", arp: "sawtooth", pad: "square", melody: "sawtooth" },
    gains: { drums: 1.7, bass: 1.3, arp: 1.55, pad: 0.65, melody: 1.25 },
    swing: 0, padAttack: 0.08, bassDecay: 0.14, wet: 0.06,
  },
  /* 八音盒华尔兹（批次 CY-21）：全正弦的发条小乐队——鼓和贝斯直接退场，
     琶音与旋律顶到最亮（敲钟的动静），铺底慢起音垫在底下，回声全库最深 */
  musicbox: {
    waves: { bass: "sine", arp: "sine", pad: "sine", melody: "sine" },
    gains: { drums: 0, bass: 0.55, arp: 1.55, pad: 0.45, melody: 1.35 },
    swing: 0, padAttack: 2.2, bassDecay: 1.4, wet: 0.5,
  },
  /* 雨夜爵士（批次 CY-21）：贝斯换正弦低音提琴、旋律换三角形的中音萨克斯风味，
     铺底锯齿像旧音箱的底噪，摇摆拉到全库最大——每拍都拖半拍下菜 */
  jazz: {
    waves: { bass: "sine", arp: "triangle", pad: "sawtooth", melody: "triangle" },
    gains: { drums: 0.7, bass: 1.3, arp: 0.75, pad: 1.4, melody: 1.1 },
    swing: 0.24, padAttack: 0.5, bassDecay: 0.5, wet: 0.3,
  },
};

/* ---------- 配器跟剧情走（批次 CY-21）：心情层不只挪调，还当场重排乐队 ---------- */

/** 心情 → 编曲微配（叠在基调编曲之上，同音量倍数连乘）。平静不动，三种心情各拨一次： */
const MOOD_ARRANGE: Record<string, KeynoteArrange> = {
  /* 紧张：鼓和贝斯顶上前排催拍，铺底往后收——整个乐队都绷着 */
  tense: { gains: { drums: 1.25, bass: 1.15, arp: 1.2, pad: 0.85 } },
  /* 低落：鼓撤到后排，铺底漫上来裹住一切 */
  low: { gains: { drums: 0.45, bass: 0.9, arp: 0.5, pad: 1.35 } },
  /* 温暖：铺底与琶音的暖光各抬一档 */
  warm: { gains: { pad: 1.1, arp: 1.1 } },
};

/** 把一份编曲配置烤进谱面：换波形、按倍数重配各声部音量、盖摇摆 / 铺底起音 / 贝斯长短。
 *  鼓组空位按排程器的默认音量（0.12 / 0.07 / 0.03 / 0.05）折算，保证没写音量的鼓也吃得到倍数。
 *  批次 CY-21 起收编曲配置本体（不再按基调 id 现查），基调层与心情层可以各烤一遍、叠着生效。 */
function arrangeScore(score: BgmScore, arr: KeynoteArrange | undefined): BgmScore {
  if (!arr) return score;
  const g = arr.gains ?? {};
  const next: BgmScore = { ...score };
  if (arr.swing !== undefined) next.swing = arr.swing;
  if (next.bass)
    next.bass = {
      ...next.bass,
      wave: arr.waves?.bass ?? next.bass.wave,
      gain: next.bass.gain * (g.bass ?? 1),
      decay: arr.bassDecay ?? next.bass.decay,
    };
  if (next.arp)
    next.arp = {
      ...next.arp,
      wave: arr.waves?.arp ?? next.arp.wave,
      gain: next.arp.gain * (g.arp ?? 1),
    };
  if (next.pad)
    next.pad = {
      ...next.pad,
      wave: arr.waves?.pad ?? next.pad.wave,
      gain: next.pad.gain * (g.pad ?? 1),
      attack: arr.padAttack ?? next.pad.attack,
    };
  if (next.melody)
    next.melody = {
      ...next.melody,
      wave: arr.waves?.melody ?? next.melody.wave,
      gain: next.melody.gain * (g.melody ?? 1),
    };
  if (next.drums) {
    const d = next.drums;
    const df = g.drums ?? 1;
    next.drums = {
      ...d,
      kickGain: (d.kickGain ?? 0.12) * df,
      snareGain: (d.snareGain ?? 0.07) * df,
      hatGain: (d.hatGain ?? 0.03) * df,
      tickGain: (d.tickGain ?? 0.05) * df,
    };
  }
  return next;
}

const KEYNOTE_IDS: string[] = KEYNOTES.map((k) => k.id);

function isKeynoteId(raw: unknown): raw is BgmKeynoteId {
  return typeof raw === "string" && KEYNOTE_IDS.includes(raw);
}

/** 基调缓存：随 syncSettings 的一秒兜底同步刷新，setBgmKeynote 即时改写 */
let keynoteCache: BgmKeynoteId | null = null;

function keynoteFrom(raw: string): BgmKeynoteId {
  return isKeynoteId(raw) ? raw : "milk";
}

function readKeynote(): BgmKeynoteId {
  if (keynoteCache === null) keynoteCache = keynoteFrom(loadSettings().bgmKeynote);
  return keynoteCache;
}

/** 当前基调 id（配乐菜单显示勾选用） */
export function getBgmKeynote(): BgmKeynoteId {
  return readKeynote();
}

/** 基调清单（配乐菜单渲染用；不含引擎内部参数） */
export function listBgmKeynotes(): BgmKeynoteMeta[] {
  return KEYNOTES.map(({ id, label, blurb }) => ({ id, label, blurb }));
}

/** 换基调：写进设置，正在播的曲子当场交叉淡入淡出地换调，不掐断；
 *  换成功敲一声「换场过门」（CY-14）——两音小铃铛，提示乐队开始换歌了 */
export function setBgmKeynote(id: BgmKeynoteId): BgmKeynoteId {
  saveSettings({ bgmKeynote: id });
  keynoteCache = id;
  /* 重新接受即销账（批次 CY-20）：玩家又选了某天气的专属基调 = 之前的婉拒不算数了 */
  for (const [wk, reco] of Object.entries(RECO_WEATHER)) {
    if (reco.id === id && loadSettings().bgmOfferRefusals[wk]) {
      const refusals = { ...loadSettings().bgmOfferRefusals };
      delete refusals[wk];
      saveSettings({ bgmOfferRefusals: refusals });
    }
  }
  const inst = active;
  if (inst && !inst.dead && readBgmOn()) {
    startInstance(inst.id, inst.variant);
    keynoteSting();
  }
  return id;
}

/** 换场过门（批次 CY-14）：E5→A5 两音三角波铃铛，轻轻两下落在总线上，盖过交叉淡入的间隙 */
function keynoteSting(): void {
  const r = rig;
  if (!r) return;
  const ctx = r.ctx;
  const now = ctx.currentTime;
  [659.25, 880].forEach((freq, i) => {
    const at = now + 0.1 * i;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.05, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    osc.connect(gain);
    gain.connect(r.bus);
    osc.start(at);
    osc.stop(at + 0.36);
  });
}

/* ---------- 仪式小乐句（批次 CY-21）：成就解锁 / 存档落笔的一两声铃 ---------- */

export type CeremonyJingleId = "achievement" | "save";

/** 仪式小乐句：给总线上敲一小串铃，不占曲目、不掐正在播的歌。
 *  成就 = 四音上行小号角（C 大调琶音一路爬上去）；存档 = 两声轻铃，像笔尖点了个点。
 *  配乐关着不打扰；乐句走的是总总线，音量跟着背景配乐音量一起收。 */
export function playCeremonyJingle(kind: CeremonyJingleId): void {
  if (!readBgmOn()) return;
  const r = ensureRig();
  if (!r) return;
  wake(r);
  const ctx = r.ctx;
  const now = ctx.currentTime + 0.05;
  const notes: Array<[freq: number, at: number, peak: number]> =
    kind === "achievement"
      ? [
          [523.25, 0, 0.045],
          [659.25, 0.09, 0.045],
          [783.99, 0.18, 0.05],
          [1046.5, 0.27, 0.055],
        ]
      : [
          [880, 0, 0.03],
          [1174.66, 0.11, 0.026],
        ];
  for (const [freq, at, peak] of notes) {
    const start = now + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + (kind === "achievement" ? 0.5 : 0.3));
    osc.connect(gain);
    gain.connect(r.bus);
    osc.start(start);
    osc.stop(start + (kind === "achievement" ? 0.52 : 0.32));
  }
}

/* ---------- 基调随剧情自动推荐（批次 CY-12） ---------- */

export interface BgmKeynoteReco {
  id: BgmKeynoteId;
  /** 推荐理由（菜单里给玩家看的一句中文） */
  reason: string;
  /** 天气系推荐才带：婉拒记账按这个归到对应天气（批次 CY-20） */
  weather?: string;
}

/** 天气系推荐：晴的日常不推荐（留玩家自选），坏天气各有各的搭法 */
const RECO_WEATHER: Record<string, BgmKeynoteReco> = {
  rain: { id: "dusk", reason: "雨天适合黄昏站台的告别", weather: "rain" },
  fog: { id: "nap", reason: "起雾了——雾天的专属基调是午睡云田", weather: "fog" },
  wind: { id: "soda", reason: "风大赶路的日子，先开一瓶汽水", weather: "wind" },
};

/* ---------- 坏天气上门推荐（批次 CY-18 雾 / CY-19 雨雪风全家） ---------- */

type BgmOfferListener = (reco: BgmKeynoteReco) => void;
const offerListeners = new Set<BgmOfferListener>();

/** 订阅「上门推荐」：天气转进雨/雾/风且玩家没开自动跟时广播一次，界面弹出可点的换基调卡片 */
export function subscribeKeynoteOffer(listener: BgmOfferListener): () => void {
  offerListeners.add(listener);
  return () => offerListeners.delete(listener);
}

/** 上一次的天气（只在「转进某个坏天气」这个瞬间推荐一次，天气不变就不重复轰炸） */
let lastWeatherForOffer = "";

/** 每秒一跳的天气过渡检查：转进雨/雾/风 + 配乐开着 + 没开自动跟 + 还不在那天的专属基调上
 *  + 这种天气没被婉拒满三次（批次 CY-20）→ 上门问一句 */
function syncWeatherOffer(): void {
  const wk = contextKeyOf().split("|")[0] ?? "sunny";
  if (wk === lastWeatherForOffer) return;
  lastWeatherForOffer = wk;
  const reco = RECO_WEATHER[wk];
  if (!reco) return;
  if (!readBgmOn() || readAutoKeynote() || readKeynote() === reco.id) return;
  if ((loadSettings().bgmOfferRefusals[wk] ?? 0) >= 3) return;
  for (const listener of Array.from(offerListeners)) listener(reco);
}

/** 记一次婉拒（点「再听听」时调）：同一天气满 3 次就不再上门；只记天气系推荐 */
export function reportBgmOfferRefusal(weather: string | undefined): void {
  if (!weather || !RECO_WEATHER[weather]) return;
  try {
    const refusals = { ...loadSettings().bgmOfferRefusals };
    refusals[weather] = Math.min(9, (refusals[weather] ?? 0) + 1);
    saveSettings({ bgmOfferRefusals: refusals });
  } catch {
    /* 记账尽力而为 */
  }
}

/** 当前场面的基调推荐：场面身份优先（怪谈→幽灵、温情→云田），其次天气。
 *  结局曲自带锁定（基调怎么换都不影响它），不推荐、也不许自动跟去白闪一次。 */
export function recommendKeynote(): BgmKeynoteReco | null {
  if (!currentId) return null;
  if (currentId === "ending") return null;
  const kind = sceneKindOf(currentId);
  if (kind === "dread") return { id: "phantom", reason: "怪谈场面，午夜幽灵才够冷" };
  if (kind === "tender") return { id: "nap", reason: "温情场面，配一首午睡云田的摇篮曲" };
  return RECO_WEATHER[contextKeyOf().split("|")[0] ?? "sunny"] ?? null;
}

/** 自动跟开关缓存：与基调缓存同一套一秒兜底同步 */
let autoKeyCache: boolean | null = null;

function readAutoKeynote(): boolean {
  if (autoKeyCache === null) autoKeyCache = loadSettings().bgmAutoKeynote === true;
  return autoKeyCache;
}

/** 基调自动跟场面是否开启（配乐菜单显示用） */
export function isBgmAutoKeynote(): boolean {
  return readAutoKeynote();
}

/** 打开 / 关掉头自动跟场面：开启的瞬间当场就按推荐换一次 */
export function setBgmAutoKeynote(on: boolean): boolean {
  saveSettings({ bgmAutoKeynote: on });
  autoKeyCache = on;
  if (on) followRecommendation();
  return on;
}

/** 跟随执行：推荐存在且与当前基调不同才换（没配乐 / 没推荐 / 已经对了都不动，零打扰）。
 *  换成功的当场广播一条「DJ 注释」，界面拿来飘一句旁白（批次 CY-13） */
function followRecommendation(): void {
  if (!readAutoKeynote() || !readBgmOn()) return;
  const reco = recommendKeynote();
  if (!reco || reco.id === readKeynote()) return;
  setBgmKeynote(reco.id);
  const info: BgmFollowNote = {
    keynoteLabel: KEYNOTES.find((k) => k.id === reco.id)?.label ?? "",
    trackTitle: currentId ? TRACKS[currentId]?.meta.title ?? "" : "",
    reason: reco.reason,
  };
  for (const listener of Array.from(followListeners)) listener(info);
}

/** 自动换基调时的注释内容：换到哪套基调 / 当时在播哪首 / 为什么换 */
export interface BgmFollowNote {
  keynoteLabel: string;
  trackTitle: string;
  reason: string;
}

type BgmFollowListener = (note: BgmFollowNote) => void;
const followListeners = new Set<BgmFollowListener>();

/** 订阅「基调自动跟场面」事件：引擎每次自动换基调广播一次，界面飘注释用 */
export function subscribeKeynoteFollow(listener: BgmFollowListener): () => void {
  followListeners.add(listener);
  return () => followListeners.delete(listener);
}

/* ---------- 特殊场面加移（批次 CY）：按曲目身份再压一层变调 ---------- */

/** 惊悚系 / 温情回忆系的曲子在基调之上再压一层——同一首怪谈曲，
 *  换到哪套基调都听得出「它跟日常不是一个调」；日常曲不受这层影响。 */
const DREAD_SHIFT: Partial<BgmTint> = { semis: -1, rotate: 2, cutoffMul: 0.74, bpmAdd: -2 };
const TENDER_SHIFT: Partial<BgmTint> = { semis: 2, rotate: 3, cutoffMul: 1.12, bpmAdd: -3 };
const DREAD_TRACKS: ReadonlySet<string> = new Set<string>([
  "tension",
  "club-blackout",
  "dorm-dark",
  "admin-night",
  "fc-wait",
  "study-locked",
  "library-late",
]);
const TENDER_TRACKS: ReadonlySet<string> = new Set<string>([
  "ending",
  "memory",
  "dorm-talk",
  "dorm-dawn",
  "lk-dawn",
  "lk-quiet",
  "fc-hall",
]);

/** 场面身份（CY-6）：惊悚 / 温情 / 无——既决定加移（CY），也决定借哪套基调的旋律来唱（CY-6） */
function sceneKindOf(id: BgmTrackId): "dread" | "tender" | null {
  if (DREAD_TRACKS.has(id)) return "dread";
  if (TENDER_TRACKS.has(id)) return "tender";
  return null;
}

function sceneShiftOf(id: BgmTrackId): Partial<BgmTint> | null {
  const kind = sceneKindOf(id);
  if (kind === "dread") return DREAD_SHIFT;
  if (kind === "tender") return TENDER_SHIFT;
  return null;
}

/** 特殊场面的自动换调旋律（CY-6）：怪谈场面自动改唱「午夜幽灵」那首歌，温情场面改唱「午睡云田」；
 *  奶黄原味不动（原曲是基准，特殊场面只加移不换歌），玩家本来就选了被套那套的也不动。 */
function melodyKeynoteOf(base: BgmKeynoteId, kind: "dread" | "tender" | null): BgmKeynoteId {
  if (base === "milk" || !kind) return base;
  const borrowed: BgmKeynoteId = kind === "dread" ? "phantom" : "nap";
  return base === borrowed ? base : borrowed;
}

/** 场面加移叠进语境调音：移调与侧面相加、明暗相乘；已换的音阶不被场面覆盖 */
function mergeShift(base: BgmTint, shift: Partial<BgmTint> | null): BgmTint {
  if (!shift) return base;
  return {
    semis: base.semis + (shift.semis ?? 0),
    rotate: base.rotate + (shift.rotate ?? 0),
    scale: base.scale ?? shift.scale,
    cutoffMul: base.cutoffMul * (shift.cutoffMul ?? 1),
    bpmAdd: base.bpmAdd + (shift.bpmAdd ?? 0),
  };
}

/** 心情从存档派生：被注意值 / 沉默值过阈值就换脸，其余按 calm / warm 分 */
function moodOf(save: GameSaveData): string {
  const silence = save.silenceValue ?? 0;
  const attention = save.attention ?? 0;
  if (attention >= 10) return "tense";
  if (silence >= 10) return "low";
  if (attention <= 1 && silence <= 1) return "warm";
  return "calm";
}

/** 语境键：天气|心情|基调——天气与心情从存档与日历派生，基调读玩家设置；
 *  任一格变了，syncContext 就交叉淡入淡出地换调（玩家换基调也因此当场生效） */
function contextKeyOf(): string {
  try {
    const save = loadGameSave();
    const day = dayOfDoneCount(countCompletedLines(save));
    return `${weatherForDay(day, save.weatherSeed)}|${moodOf(save)}|${readKeynote()}`;
  } catch {
    return `sunny|calm|${readKeynote()}`;
  }
}

/** 语境键 → 调音：基调打底（玩家选的），天气与心情在其上叠加；每次起曲掷一次骰子——
 *  ±1 半音、15% 概率多转一个侧面、速度抖 ±2，同一首曲子没有两次一样的天气 */
function tintOf(key: string): BgmTint {
  const [weather, mood, keynote] = key.split("|");
  const kn = KEYNOTES.find((k) => k.id === keynote)?.tint ?? {};
  const w = WEATHER_TINT[weather ?? "sunny"] ?? {};
  const m = MOOD_TINT[mood ?? "calm"] ?? {};
  const roll = Math.random();
  return {
    semis: (kn.semis ?? 0) + (w.semis ?? 0) + (m.semis ?? 0) + (roll < 0.18 ? -1 : roll > 0.82 ? 1 : 0),
    rotate: (kn.rotate ?? 0) + (w.rotate ?? 0) + (m.rotate ?? 0) + (Math.random() < 0.15 ? 2 : 0),
    scale: kn.scale ?? w.scale,
    cutoffMul: (kn.cutoffMul ?? 1) * (w.cutoffMul ?? 1) * (m.cutoffMul ?? 1),
    bpmAdd: (kn.bpmAdd ?? 0) + (w.bpmAdd ?? 0) + (m.bpmAdd ?? 0) + Math.round((Math.random() - 0.5) * 4),
  };
}

/** 把语境调音烤进谱面：换基调优先于换侧面；音色只缩放既有的整轨滤波 */
function contextScore(score: BgmScore, tint: BgmTint): BgmScore {
  const scale = tint.scale ?? (tint.rotate ? rotateMode(score.scale, tint.rotate) : score.scale);
  return {
    ...score,
    bpm: Math.max(24, Math.min(180, score.bpm + tint.bpmAdd)),
    root: clampRoot(score.root + tint.semis),
    scale,
    tone:
      score.tone && tint.cutoffMul !== 1
        ? { ...score.tone, cutoff: Math.round(score.tone.cutoff * tint.cutoffMul) }
        : score.tone,
  };
}

/** 语境变了没有：变了就交叉淡入淡出地换调（同曲重启） */
function syncContext(): void {
  const inst = active;
  if (!inst || inst.dead) return;
  const key = contextKeyOf();
  if (inst.ctxKey !== key) startInstance(inst.id, inst.variant);
}

/* ---------- 天气环境音（批次 CY-17）：雾天的低嗡进耳朵，跟配乐一起呼吸 ----------
 *  雨声与风声早在音效层就有（跟随音效开关）；雾一直没有属于自己的声音——
 *  这层垫底归配乐管：跟随配乐开关、对白闪避时一起低头，像雾把整间教室包起来。 */

/** 一层环境声：噪声源 + 滤波 +（可选）慢摆动，整层挂在总线上（吃音量旋钮与对白闪避） */
interface AmbienceLayer {
  key: string;
  gain: GainNode;
  stoppable: Array<{ stop: (when?: number) => void }>;
}

let ambience: AmbienceLayer | null = null;
let ambienceFadeTimer: number | null = null;

function makeNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function startFogAmbience(r: BgmRig): void {
  const ctx = r.ctx;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.connect(r.bus);
  const stoppable: Array<{ stop: (when?: number) => void }> = [];
  /* 雾：压到极低频的噪声垫底 + 两个失谐的嗡音，闷在帘子里 */
  const noise = makeNoiseSource(ctx);
  stoppable.push(noise);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 180;
  noise.connect(lp);
  lp.connect(gain);
  [55, 58.4].forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.014;
    osc.connect(oscGain);
    oscGain.connect(gain);
    osc.start();
    stoppable.push(osc);
  });
  noise.start();
  gain.gain.linearRampToValueAtTime(0.058, ctx.currentTime + 1.4);
  ambience = { key: "fog", gain, stoppable };
}

function fadeOutAmbience(): void {
  const layer = ambience;
  const r = rig;
  if (!layer) return;
  ambience = null;
  if (!r) {
    for (const node of layer.stoppable) {
      try {
        node.stop();
      } catch {
        /* 已停 */
      }
    }
    return;
  }
  const now = r.ctx.currentTime;
  try {
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setValueAtTime(Math.max(0.0001, layer.gain.gain.value), now);
    layer.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    if (ambienceFadeTimer) window.clearTimeout(ambienceFadeTimer);
    ambienceFadeTimer = window.setTimeout(() => {
      for (const node of layer.stoppable) {
        try {
          node.stop();
        } catch {
          /* 已停 */
        }
      }
    }, 1000);
  } catch {
    /* 忽略 */
  }
}

/** 天气进耳朵：在放曲 + 配乐开着 + 起雾时垫一层雾嗡；雾散/停曲/关配乐就交叉退层 */
function syncAmbience(): void {
  const r = rig;
  const wk = contextKeyOf().split("|")[0] ?? "sunny";
  const wantKey: string = r && readBgmOn() && active && !active.dead && wk === "fog" ? "fog" : "none";
  const have = ambience?.key ?? "none";
  if (wantKey === have) return;
  if (ambience) fadeOutAmbience();
  if (wantKey !== "none" && r) startFogAmbience(r);
}

/** 第二学期起整曲放慢一成；第三学期起旋律收进抽屉——这两条是「档案替你记」的听觉形状，保留。
 *  变调四件套按学期号循环取用（超出表长回到第 2 套继续转），让每学期都换一个调性侧面。 */
function semesterScore(score: BgmScore | undefined, variant: number, id: BgmTrackId): BgmScore | undefined {
  if (!score || variant <= 1) return score;
  const plan = PITCH_PLANS[(variant - 1) % PITCH_PLANS.length];
  if (!plan) return score;
  const scale = plan.rotate ? rotateMode(score.scale, plan.rotate) : score.scale;
  const progression = plan.invert
    ? score.progression.map((chord, i) =>
        i % 2 === 1 && chord.length > 1 ? [...chord.slice(1), chord[0]] : chord,
      )
    : score.progression;
  return {
    ...score,
    bpm: Math.max(24, Math.round(score.bpm * 0.92)),
    root: clampRoot(score.root + plan.semis + trackJitterOf(id)),
    scale,
    progression,
    melody:
      variant >= 3
        ? undefined
        : score.melody
          ? { ...score.melody, oct: (score.melody.oct ?? 12) + plan.melodyShift }
          : score.melody,
  };
}

/** 开（或切）一首曲子：已在播同一首就不动，否则 0.8s 交叉淡入淡出 */
function startInstance(id: BgmTrackId, variant = 1): void {
  const r = ensureRig();
  if (!r) return;
  const ctxKey = contextKeyOf();
  /* 基调先整首换成基调自己的歌（CY-3），再进学期变奏 */
  const weatherOf = ctxKey.split("|")[0] ?? "sunny";
  /* 结局演出锁定（CY-7）：结局主题谁也别换——不过基调、不借场面歌、不加移，
   *  只留天气/心情的明暗微调；结局曲从头到尾都是它自己那首歌。 */
  const locked = id === "ending";
  /* 特殊场面（CY-6）：怪谈/温情戏自动借对应基调的旋律来唱，其余场面用玩家选的基调 */
  const melodyKeynote: BgmKeynoteId = locked ? "milk" : melodyKeynoteOf(readKeynote(), sceneKindOf(id));
  const base = semesterScore(
    keynoteSongScore(TRACKS[id]?.score, melodyKeynote, id, variant, weatherOf),
    variant,
    id,
  );
  /* 叠五层：基调 + 天气/心情（tintOf）→ 特殊场面加移（sceneShiftOf）→ 烤进谱面
     → 基调编曲（CY-11）→ 心情编曲（CY-21：配器跟剧情走）。结局锁定两层编曲都不过。 */
  const tintKey = locked ? `${ctxKey.split("|").slice(0, 2).join("|")}|milk` : ctxKey;
  const arrangeKey: BgmKeynoteId = locked ? "milk" : readKeynote();
  const moodOfCtx = ctxKey.split("|")[1] ?? "calm";
  const score = base
    ? arrangeScore(
        arrangeScore(
          contextScore(base, mergeShift(tintOf(tintKey), locked ? null : sceneShiftOf(id))),
          locked ? undefined : KEYNOTE_ARRANGE[arrangeKey],
        ),
        locked ? undefined : MOOD_ARRANGE[moodOfCtx],
      )
    : undefined;
  if (!score) return;
  /* 每支基调乐队自带厅堂大小（CY-11）：幽灵是深回声大厅、祭典是干耳朵排练房；
     结局锁定回到默认厅。换基调时 ctxKey 必变、必起新实例，所以这里顺带把整个厅重调即可 */
  try {
    r.wetGain.gain.setTargetAtTime(KEYNOTE_ARRANGE[arrangeKey]?.wet ?? 0.22, r.ctx.currentTime, 0.6);
  } catch {
    /* 忽略 */
  }
  if (active && !active.dead && active.id === id && active.variant === variant && active.ctxKey === ctxKey) return;
  /* 变奏收藏（批次 CY-24）：这一「曲 × 乐队」组合真响起来了才记一笔——
     图鉴切了基调但没起曲不算听过；结局曲锁死不变奏，任何基调下都记到原乐队名下 */
  recordVariantHeard(id, locked ? "milk" : arrangeKey);
  const now = r.ctx.currentTime;
  const inst = createInstance(id, score, r, variant, ctxKey);
  try {
    inst.gain.gain.setValueAtTime(0.0001, now);
    inst.gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_S);
  } catch {
    /* 忽略 */
  }
  if (active) fadeOut(active, active.dead ? 0.15 : CROSSFADE_S);
  active = inst;
  currentId = id;
  syncBusVolume();
  syncTicker();
}

/** 让一条曲轨淡出：立刻停止排新音符，已排队的音符跟着音量淡完 */
function fadeOut(inst: BgmInstance, seconds: number): void {
  inst.dead = true;
  const r = rig;
  if (r) {
    const now = r.ctx.currentTime;
    try {
      inst.gain.gain.cancelScheduledValues(now);
      inst.gain.gain.setValueAtTime(Math.max(0.0001, inst.gain.gain.value), now);
      inst.gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    } catch {
      /* 数值异常就直接淡到零 */
    }
  }
  fading.push(inst);
  window.setTimeout(
    () => {
      const index = fading.indexOf(inst);
      if (index >= 0) fading.splice(index, 1);
      try {
        inst.gain.disconnect();
      } catch {
        /* 已断开 */
      }
      if (inst.filter) {
        try {
          inst.filter.disconnect();
        } catch {
          /* 已断开 */
        }
      }
      syncTicker();
    },
    Math.ceil((seconds + 0.2) * 1000),
  );
}

/** 起曲轮次计数（批次 CY-17）：供换页宽限期判断「新页面有没有接着点歌」 */
let playEpoch = 0;

/**
 * 换页宽限期（批次 CY-17）：页面卸载时不再硬停曲，等 450ms——
 * 下一站如果点了歌（哪怕同名的另一页重挂载），这 450ms 足够它把起曲排进来，
 * 交叉淡入淡出首尾相接；只有 450ms 里没人点歌（去了不放配乐的页面）才真的停。
 */
export function releaseBgmHandoff(delayMs = 450): void {
  const epoch = playEpoch;
  window.setTimeout(() => {
    if (playEpoch === epoch) stopBgm();
  }, Math.max(150, delayMs));
}

/**
 * 播放一首曲子（bgmOn=false 时不发声，只记住意图；重新开启会从它继续）。
 * 换曲交叉淡入淡出 0.8s；失败静默降级。
 */
export function playBgm(id: BgmTrackId, variant = 1): void {
  if (!TRACKS[id]) return;
  /* 隐藏曲起曲闸门（批次 CY-25）：弹法没集齐之前，安可曲放不出来 */
  if (HIDDEN_TRACKS.has(id) && !isEncoreUnlocked()) return;
  playEpoch += 1;
  desiredId = id;
  desiredVariant = variant;
  if (!readBgmOn()) {
    notify();
    return;
  }
  bumpPlayCount(id);
  const r = ensureRig();
  if (r) wake(r);
  startInstance(id, variant);
  notify();
}

/** 变奏收藏记账（批次 CY-24）：「曲目|基调」每真起一次曲 +1，图鉴据此点亮收集格 */
function recordVariantHeard(id: BgmTrackId, keynote: BgmKeynoteId): void {
  try {
    const heard = { ...loadSettings().bgmVariantHeard };
    const before = isVariantSetComplete(heard);
    const key = `${id}|${keynote}`;
    heard[key] = Math.min(9999, (heard[key] ?? 0) + 1);
    saveSettings({ bgmVariantHeard: heard });
    /* 集齐的瞬间广播一次（批次 CY-25）：图鉴当场把隐藏安可曲亮出来 */
    if (!before && isVariantSetComplete(heard)) notify();
  } catch {
    /* 记账尽力而为，失败不影响起曲 */
  }
}

/** 变奏收藏账本（批次 CY-24）：「曲目id|基调id」→ 听过次数，音乐鉴赏收集视图用 */
export function getBgmVariantHeard(): Record<string, number> {
  return loadSettings().bgmVariantHeard;
}

/** 播放计数（批次 CY-15）：每真正起一次曲记一笔，音乐鉴赏里显示「已听 N 次」 */
function bumpPlayCount(id: BgmTrackId): void {
  try {
    const plays = { ...loadSettings().bgmPlays };
    plays[id] = Math.min(99999, (plays[id] ?? 0) + 1);
    saveSettings({ bgmPlays: plays });
  } catch {
    /* 计数尽力而为，失败不影响起曲 */
  }
}

/** 各曲目播放次数（音乐鉴赏区块显示用） */
export function getBgmPlayCounts(): Record<string, number> {
  return loadSettings().bgmPlays;
}

/** 收藏清单（批次 CY-33）：曲目 id → 是否收藏，音乐鉴赏里收藏的单列顶上 */
export function getBgmFavorites(): Record<string, boolean> {
  return loadSettings().bgmFavorites;
}

/** 收藏 / 取消收藏一首歌（批次 CY-33）：返回翻转后的状态 */
export function toggleBgmFavorite(id: BgmTrackId): boolean {
  const favorites = { ...loadSettings().bgmFavorites };
  const next = !favorites[id];
  if (next) favorites[id] = true;
  else delete favorites[id];
  saveSettings({ bgmFavorites: favorites });
  return next;
}

/** 停止 BGM（0.8s 淡出）；离开页面时由各页 Logic 层在卸载清理里调用 */
export function stopBgm(): void {
  desiredId = null;
  /* 天气环境音跟曲一起退场（批次 CY-17） */
  fadeOutAmbience();
  stopCrescendo();
  const inst = active;
  if (inst) {
    active = null;
    currentId = null;
    fadeOut(inst, CROSSFADE_S);
  }
  notify();
  syncTicker();
}

/**
 * 开关 BGM：关 = 立刻淡出（记住 desiredId）；开 = 从最后请求的曲子继续。
 * 持久化走 settings（saveSettings），顶栏图标只负责显示。
 */
export function setBgmOn(on: boolean): boolean {
  const next = saveSettings({ bgmOn: on });
  onCache = next.bgmOn;
  if (!next.bgmOn) {
    const inst = active;
    if (inst) {
      active = null;
      currentId = null;
      fadeOut(inst, 0.35);
      notify();
      syncTicker();
    }
  } else if (desiredId) {
    const r = ensureRig();
    if (r) wake(r);
    startInstance(desiredId, desiredVariant);
    notify();
  }
  return next.bgmOn;
}

/** 当前正在播的曲目 id（淡出中的旧轨不算；没有在播返回 null） */
export function currentBgmId(): BgmTrackId | null {
  return currentId;
}

/** 订阅「当前曲目变化」（音乐鉴赏区块的高亮同步用）；返回取消订阅函数 */
export function subscribeBgm(listener: BgmListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ---------- 终幕渐强收尾（批次 CY-8） ---------- */

let crescendoTimer: number | null = null;

function stopCrescendo(): void {
  if (crescendoTimer !== null) {
    window.clearInterval(crescendoTimer);
    crescendoTimer = null;
  }
}

/**
 * 终幕渐强收尾：正在播的曲子（剧情页只在终幕相位调用）在 seconds 秒内完成一次「涌起」——
 * 音量抬三成半、低通开到两倍亮、速度悄然加速一成二，涌到头后停在高位不落回：
 * 整首歌替你把这口气憋住，送这一学期出门。任何失败静默跳过，不影响曲子继续循环。
 */
export function bgmCrescendoFinale(seconds = 8): void {
  const inst = active;
  const r = rig;
  if (!r || !inst || inst.dead) return;
  stopCrescendo();
  const now = r.ctx.currentTime;
  const peakAt = now + seconds * 0.75;
  const baseGain = Math.max(0.0001, inst.gain.gain.value);
  try {
    inst.gain.gain.cancelScheduledValues(now);
    inst.gain.gain.setValueAtTime(baseGain, now);
    inst.gain.gain.linearRampToValueAtTime(Math.min(1.6, baseGain * 1.35), peakAt);
    inst.gain.gain.linearRampToValueAtTime(Math.min(1.5, baseGain * 1.22), now + seconds);
  } catch {
    /* 自动化失败就只剩速度与音色的渐强 */
  }
  if (inst.filter) {
    const f0 = inst.filter.frequency.value;
    try {
      inst.filter.frequency.cancelScheduledValues(now);
      inst.filter.frequency.setValueAtTime(f0, now);
      inst.filter.frequency.linearRampToValueAtTime(Math.min(18000, f0 * 2.1), peakAt);
      inst.filter.frequency.linearRampToValueAtTime(Math.min(18000, f0 * 1.6), now + seconds);
    } catch {
      /* 滤波器自动化失败不影响音量层 */
    }
  }
  const bpm0 = inst.score.bpm;
  crescendoTimer = window.setInterval(() => {
    const live = active;
    const elapsed = r.ctx.currentTime - now;
    if (!live || live !== inst || live.dead || elapsed >= seconds * 0.75) {
      stopCrescendo();
      return;
    }
    const k = Math.min(1, elapsed / (seconds * 0.75));
    /* 调度器每个 tick 现读 score.bpm（2254 行），所以这里挪它就是全场加速 */
    live.score.bpm = Math.min(200, bpm0 * (1 + 0.12 * k));
  }, 120);
}

/* ---------- 调度与合成 ---------- */

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 音阶度数 → MIDI：度数超出音阶长度表示上八度（7 = 高八度主音） */
function degreeMidi(scale: number[], root: number, deg: number): number {
  const len = Math.max(1, scale.length);
  const oct = Math.floor(deg / len);
  const idx = ((deg % len) + len) % len;
  const step = scale[idx] ?? 0;
  return root + step + oct * 12;
}

interface NoteOptions {
  time: number;
  midi: number;
  dur: number;
  wave: OscillatorType;
  gain: number;
  attack?: number;
  cutoff?: number;
  dest: AudioNode;
  /** 立体声偏移 -1~1（批次 CY-9）：各声部坐在屋子不同位置 */
  pan?: number;
  /** > 0 时叠第二只振荡器做 ±detune 音分拍频（批次 CY-9）：铺底的厚度来源 */
  detune?: number;
  /** 长音加 5.3Hz 微颤（批次 CY-9）：旋律与铺底的活气 */
  vibrato?: boolean;
}

/** 排一颗音：快起、指数衰减、收尾干净；单颗失败静默跳过 */
function scheduleNote(opts: NoteOptions): void {
  try {
    if (opts.gain <= 0.0002) return;
    const ctx = rig?.ctx;
    if (!ctx) return;
    const freq = midiToFreq(opts.midi);
    const osc = ctx.createOscillator();
    osc.type = opts.wave;
    osc.frequency.setValueAtTime(freq, opts.time);
    const oscs: OscillatorNode[] = [osc];
    /* 双振荡器微失谐：两只只差几音分的同频音互相拍频，长音听感从「一条线」变「一团气」 */
    if (opts.detune && opts.detune > 0) {
      osc.detune.value = -opts.detune;
      const osc2 = ctx.createOscillator();
      osc2.type = opts.wave;
      osc2.frequency.setValueAtTime(freq, opts.time);
      osc2.detune.value = opts.detune;
      oscs.push(osc2);
    }
    /* 微颤 LFO：±0.55% 音高的正弦摆动，只喂给够长的音 */
    let lfo: OscillatorNode | null = null;
    if (opts.vibrato && opts.dur >= 0.18) {
      lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 5.3;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = freq * 0.0055;
      lfo.connect(lfoDepth);
      for (const o of oscs) lfoDepth.connect(o.frequency);
      lfo.start(opts.time);
      lfo.stop(opts.time + opts.dur + 0.06);
    }
    const env = ctx.createGain();
    const atk = Math.max(0.006, Math.min(opts.attack ?? 0.012, opts.dur * 0.7));
    env.gain.setValueAtTime(0.0001, opts.time);
    env.gain.exponentialRampToValueAtTime(opts.gain, opts.time + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, opts.time + opts.dur);
    for (const o of oscs) o.connect(env);
    let tail: AudioNode = env;
    if (opts.cutoff && opts.cutoff > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = opts.cutoff;
      lp.Q.value = 0.7;
      env.connect(lp);
      tail = lp;
    }
    /* 声位：pan 在这颗音上现挂摆位器，屋子左右就有了分工 */
    if (opts.pan && Math.abs(opts.pan) > 0.02 && typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      tail.connect(panner);
      tail = panner;
    }
    tail.connect(opts.dest);
    for (const o of oscs) {
      o.start(opts.time);
      o.stop(opts.time + opts.dur + 0.06);
    }
    osc.onended = () => {
      try {
        for (const o of oscs) o.disconnect();
        env.disconnect();
        tail.disconnect();
        lfo?.disconnect();
      } catch {
        /* 已断开 */
      }
    };
  } catch {
    /* 静默降级 */
  }
}

function sharedNoise(ctx: AudioContext): AudioBuffer {
  if (noise) return noise;
  const length = Math.floor(ctx.sampleRate * 1);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noise = buffer;
  return buffer;
}

/** 底鼓：正弦快滑 150→46Hz，短促收束 */
function playKick(r: BgmRig, inst: BgmInstance, time: number, gain: number): void {
  try {
    const osc = r.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(46, time + 0.13);
    const env = r.ctx.createGain();
    env.gain.setValueAtTime(Math.max(0.0002, gain), time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    osc.connect(env);
    env.connect(inst.gain);
    osc.start(time);
    osc.stop(time + 0.3);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
      } catch {
        /* 已断开 */
      }
    };
  } catch {
    /* 静默降级 */
  }
}

function playNoiseBurst(
  r: BgmRig,
  inst: BgmInstance,
  time: number,
  opts: { type: BiquadFilterType; freq: number; q: number; gain: number; dur: number },
): void {
  try {
    const source = r.ctx.createBufferSource();
    source.buffer = sharedNoise(r.ctx);
    const filter = r.ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.value = opts.freq;
    filter.Q.value = opts.q;
    const env = r.ctx.createGain();
    env.gain.setValueAtTime(Math.max(0.0002, opts.gain), time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + opts.dur);
    source.connect(filter);
    filter.connect(env);
    env.connect(inst.gain);
    source.start(time, Math.random() * 0.4);
    source.stop(time + opts.dur + 0.04);
    source.onended = () => {
      try {
        source.disconnect();
        filter.disconnect();
        env.disconnect();
      } catch {
        /* 已断开 */
      }
    };
  } catch {
    /* 静默降级 */
  }
}

function playSnare(r: BgmRig, inst: BgmInstance, time: number, gain: number): void {
  playNoiseBurst(r, inst, time, { type: "bandpass", freq: 1800, q: 1, gain, dur: 0.12 });
  scheduleNote({ time, midi: 56, dur: 0.09, wave: "sine", gain: gain * 0.5, attack: 0.004, dest: inst.gain });
}

function playHat(r: BgmRig, inst: BgmInstance, time: number, gain: number): void {
  playNoiseBurst(r, inst, time, { type: "highpass", freq: 6800, q: 0.7, gain, dur: 0.045 });
}

/** 时钟滴答：高频短促一点，自习楼与图书馆的秒针感 */
function playTick(inst: BgmInstance, time: number, gain: number): void {
  scheduleNote({ time, midi: 98, dur: 0.035, wave: "square", gain, attack: 0.004, cutoff: 5200, dest: inst.gain });
}

function scheduleDrums(r: BgmRig, inst: BgmInstance, d: DrumVoice, inBar: number, at: number): void {
  const hit = (pattern: string | undefined): boolean => Boolean(pattern && pattern.charAt(inBar) === "x");
  if (hit(d.kick)) playKick(r, inst, at, d.kickGain ?? 0.12);
  if (hit(d.snare)) playSnare(r, inst, at, d.snareGain ?? 0.07);
  if (hit(d.hat)) playHat(r, inst, at, d.hatGain ?? 0.03);
  if (hit(d.tick)) playTick(inst, at, d.tickGain ?? 0.05);
}

/** 排一小节的第 inBar 步：铺底在每小节开头起一次，其余轨按各自 16 步节奏取样 */
function scheduleStep(
  r: BgmRig,
  inst: BgmInstance,
  stepIndex: number,
  time: number,
  stepDur: number,
  bars: number,
  cycle: number,
): void {
  const score = inst.score;
  const bar = Math.floor(stepIndex / 16) % bars;
  const inBar = stepIndex % 16;
  const rawChord = score.progression[bar];
  const chord = rawChord && rawChord.length > 0 ? rawChord : [0, 2, 4];
  const noteOf = (toneIdx: number): number =>
    degreeMidi(score.scale, score.root, chord[toneIdx % chord.length] ?? 0);
  const at = time + (inBar % 2 === 1 ? stepDur * (score.swing ?? 0) : 0);
  const dest = inst.filter ?? inst.gain;
  /* 曲内按遍换面（批次 CU 拓展）：和声进行每走完一遍，下一遍就换一副面孔——
     奇数遍琶音反向（轮廓从上行变成下行）、旋律整体上移一个三度（模进）、铺底多垫一个九音。
     偶数遍回到基准版。有旋律的曲子靠这些换面呼吸；回光只在没有旋律的曲里补位。 */
  const oddCycle = cycle % 2 === 1;
  const lift = oddCycle && bar === bars - 1 && !score.melody ? 2 : 0;
  const drift = inst.drift;

  const pad = score.pad;
  if (pad && inBar === 0) {
    const barDur = stepDur * 16;
    /* 铺底摆位（CY-9）：和弦各音按顺序在左右展开、每音双振荡器微失谐 + 微颤——
       铺底从「正前方一团」变成「屋子上方罩着的一片」 */
    const spread = (chord.length - 1) / 2;
    for (let i = 0; i < chord.length; i += 1) {
      scheduleNote({
        time: at,
        midi: noteOf(i) + (pad.oct ?? 0) + drift,
        dur: barDur * 0.96,
        wave: pad.wave,
        gain: pad.gain,
        attack: pad.attack ?? 0.45,
        cutoff: pad.cutoff,
        dest,
        pan: (i - spread) * 0.45,
        detune: 7,
        vibrato: true,
      });
    }
    /* 奇数遍添九音：和弦根音高八度再上一步——和声厚度按遍增减，铺底不再是同一团 */
    if (oddCycle) {
      scheduleNote({
        time: at,
        midi: degreeMidi(score.scale, score.root, (chord[0] ?? 0) + 8) + (pad.oct ?? 0) + drift,
        dur: barDur * 0.96,
        wave: pad.wave,
        gain: pad.gain * 0.55,
        attack: pad.attack ?? 0.45,
        cutoff: pad.cutoff,
        dest,
        pan: 0.12,
        detune: 7,
      });
    }
  }

  const bass = score.bass;
  if (bass) {
    const ch = bass.pattern.charAt(inBar);
    /* 走动低音（批次 CU 拓展）：小节末拍空着时，按音阶级提前半步落在下一小节的根音下面——
       和弦之间的接缝有了横向的音高移动，低音线不再是一格一格的落点。 */
    if (inBar === 15 && (ch === "-" || ch === "")) {
      const nextChord = score.progression[(bar + 1) % bars];
      if (nextChord && nextChord.length > 0) {
        scheduleNote({
          time: at,
          midi: degreeMidi(score.scale, score.root, nextChord[0] - 1) + (bass.oct ?? -12) + drift,
          dur: stepDur * 0.9,
          wave: bass.wave,
          gain: bass.gain * 0.55,
          attack: 0.012,
          cutoff: bass.cutoff,
          dest,
        });
      }
    }
    if (ch !== "-" && ch !== "") {
      const idx = Number.parseInt(ch, 10);
      if (Number.isFinite(idx)) {
        scheduleNote({
          time: at,
          midi: noteOf(idx) + (bass.oct ?? -12) + drift,
          dur: bass.decay ?? stepDur * 1.8,
          wave: bass.wave,
          gain: bass.gain,
          attack: 0.012,
          cutoff: bass.cutoff,
          dest,
        });
      }
    }
  }

  const arp = score.arp;
  if (arp) {
    const pattern = oddCycle ? arp.pattern.split("").reverse().join("") : arp.pattern;
    const ch = pattern.charAt(inBar);
    if (ch !== "-" && ch !== "") {
      const idx = Number.parseInt(ch, 10);
      if (Number.isFinite(idx)) {
        scheduleNote({
          time: at,
          midi: noteOf(idx) + (arp.oct ?? 12) + lift + drift,
          dur: arp.decay ?? stepDur * 0.9,
          wave: arp.wave,
          gain: arp.gain,
          attack: 0.006,
          cutoff: arp.cutoff,
          dest,
          pan: -0.5,
        });
      }
    }
  }

  const melody = score.melody;
  if (melody) {
    const pattern = melody.bars[bar % melody.bars.length] ?? "";
    const ch = pattern.charAt(inBar);
    if (ch !== "-" && ch !== "") {
      const deg = Number.parseInt(ch, 10);
      if (Number.isFinite(deg)) {
        scheduleNote({
          time: at,
          midi: degreeMidi(score.scale, score.root, deg + (oddCycle ? 2 : 0)) + (melody.oct ?? 12) + lift + drift,
          dur: melody.decay ?? stepDur * 2.5,
          wave: melody.wave,
          gain: melody.gain,
          attack: 0.01,
          cutoff: melody.cutoff,
          dest,
          pan: 0.3,
          vibrato: true,
        });
      }
    }
  }

  /* 遍末加花（批次 CY-9）：每四遍走到最后一小节，鼓组轻滚四步、旋律高位趋近收口——编曲的换气 */
  const fill = cycle % 4 === 3 && bar === bars - 1;
  if (fill && inBar >= 12) playHat(r, inst, at, 0.02);
  if (fill && inBar === 14 && score.melody) {
    scheduleNote({
      time: at,
      midi: degreeMidi(score.scale, score.root, (chord[0] ?? 0) + 7) + ((score.melody.oct ?? 12) - 12) + drift,
      dur: stepDur * 1.6,
      wave: score.melody.wave,
      gain: score.melody.gain * 0.5,
      attack: 0.008,
      cutoff: score.melody.cutoff,
      dest,
      pan: 0.3,
    });
  }
  /* 星光（批次 CY-9）：每六遍在句头往远处撒一颗很轻的高音——曲中偶尔闪一下的意外 */
  if (cycle % 6 === 2 && bar === 0 && inBar === 0) {
    scheduleNote({
      time: at + stepDur * 2,
      midi: score.root + 36 + drift,
      dur: 0.7,
      wave: "triangle",
      gain: 0.028,
      attack: 0.006,
      cutoff: 8000,
      dest: inst.gain,
      pan: -0.15,
    });
  }

  const drums = score.drums;
  if (drums) scheduleDrums(r, inst, drums, inBar, at);
}

function tickInstance(r: BgmRig, inst: BgmInstance): void {
  if (inst.dead) return;
  const ctx = r.ctx;
  const stepDur = 60 / Math.max(20, inst.score.bpm) / 4;
  const bars = Math.max(1, inst.score.progression.length);
  const totalSteps = bars * 16;
  let guard = 0;
  while (inst.nextTime < ctx.currentTime + LOOKAHEAD_S && guard++ < 64) {
    /* 唤醒 / 卡顿后的追帧保护：从当前时刻重新起步，不补播积压 */
    if (inst.nextTime < ctx.currentTime - 0.06) inst.nextTime = ctx.currentTime + 0.04;
    scheduleStep(r, inst, inst.stepIndex, inst.nextTime, stepDur, bars, inst.cycles);
    inst.stepIndex = (inst.stepIndex + 1) % totalSteps;
    if (inst.stepIndex === 0) {
      inst.cycles += 1;
      /* 语境调音（批次 CX）：每一遍走完有概率自己挪半音（±2 内）——曲子像被潮气泡着，慢慢走调 */
      if (Math.random() < 0.22) {
        inst.drift = Math.max(-2, Math.min(2, inst.drift + (Math.random() < 0.5 ? -1 : 1)));
      }
    }
    inst.nextTime += stepDur;
  }
}

/** 全局心跳：推进在播曲目的调度器；顺带兜底（设置改了开关/音量、期望曲目没起等情况） */
function tickAll(): void {
  tickCount += 1;
  const r = rig;
  if (r) {
    const inst = active;
    if (inst) tickInstance(r, inst);
    /* 闪避回弹（批次 CY-10）：脉冲到期要尽快把音量还回去——挂在 55ms 心跳上，
       syncBusVolume 自带变化阈值，没有变化时不产生任何自动化 */
    syncBusVolume();
    if (tickCount % 20 === 0) {
      syncSettings();
      syncContext();
      /* 基调随剧情自动推荐（批次 CY-12）：一秒一跳查一次，场面/天气变了就跟着推荐换 */
      followRecommendation();
      /* 天气环境音（批次 CY-17）：换天气 / 起停曲 / 开关配乐后一分钟内层跟到位 */
      syncAmbience();
      /* 坏天气上门推荐（批次 CY-18/19）：只在转进雨/雾/风的那一秒问一次 */
      syncWeatherOffer();
    }
  }
  if (active && !readBgmOn()) {
    const dying = active;
    active = null;
    currentId = null;
    fadeOut(dying, 0.4);
    notify();
    syncTicker();
    return;
  }
  if (!active && desiredId && readBgmOn()) {
    startInstance(desiredId);
    notify();
  }
}
