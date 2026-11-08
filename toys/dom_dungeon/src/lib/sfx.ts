/**
 * 《标签地牢》轻量音效。
 *
 * 全部用 Web Audio 现场合成（振荡器 + 增益包络），不加载任何音频文件、不依赖外部包。
 * 每次播放前先读本地存档里的音效开关，关掉就直接返回。
 * 浏览器不支持 / 音频上下文创建失败 / 单个音出错，都静默降级，绝不打断战斗。
 */

import { loadDungeonSave } from "@/lib/dungeonSave"

export type SfxName =
  | "hit"
  | "crit"
  | "kill"
  | "skill"
  | "dodge"
  | "pick"
  | "lose"
  | "win"
  /** 手动切换锁定目标：短促清脆的「切换」声 */
  | "switch"
  /** 完美闪避：清脆的高音「叮」 */
  | "perfect"
  /** 连击叠满：上扬的和弦 */
  | "comboMax"
  /** 连击中断：向下的短音 */
  | "comboBreak"
  /** 关闭标签（拖拽 / 弹窗 ×）：干脆的「咔」关闭声 */
  | "close"
  /** 拾取碎片 / 金币：明亮上扬的双音 */
  | "coin"
  /** 词条手动激活：明亮上扬的确认音 */
  | "activate"
  /** Boss QTE 进入：急促的低鸣警报，提醒马上要操作 */
  | "qteAlert"
  /** Boss QTE 成功：清脆利落的双音「完美应对」 */
  | "qteHit"
  /** Boss QTE 失败：下坠的闷音 */
  | "qteFail"
  /** 内存消耗：短促的下行电子音 */
  | "memorySpend"
  /** 内存回复 / 产出：柔和的上行提示音 */
  | "memoryGain"
  /** 弹射（事件监听 / 回调地狱）：轻快的嗖声 */
  | "bounce"
  /** 三连击（防抖）：三下快速的断奏 */
  | "triple"
  /** 链式暴击（Promise 链）：低沉的轰鸣 */
  | "chainCrit"
  /** 护盾分裂（伪元素）：清脆的碎裂散开声 */
  | "split"
  /** 响应式重构（媒体查询）：明亮上扬的重构音 */
  | "refactor"
  /** 暗黑模式切换：低频的次声感闷音 */
  | "darkToggle"
  /** CDN 加速穿透（批次 C·N4）：短促的穿甲「嗤」声 */
  | "pierce"
  /** Service Worker 免死（批次 C·M6）：先抑后扬的救援音 */
  | "deathWard"
  /** 任务管理器面板展开（内核包 v2）：干脆利落的系统双音 + 高音尾 */
  | "taskmgrOpen"
  /** 结束进程（任务管理器）：低频闷响的「当场回收」 */
  | "taskEnd"
  /** 限制进程（任务管理器）：断电般的下坠音 */
  | "taskThrottle"
  /** 优化「攻击.exe」（任务管理器）：三连上行琶音 */
  | "taskBoost"
  /** 手动斩杀（表现包）：干脆的两段利落断音 */
  | "execute"
  /** 路线卡片翻页（表现包）：轻快的纸面翻动 */
  | "pageFlip"
  /** 祭坛现身（表现包）：神秘的下行低吟 */
  | "mystery"
  /** 代价事件现身（表现包）：悬疑的半音颤动 */
  | "suspense"
  /** 主动技释放特写（表现包）：低音冲击 + 高频闪尾的电影感「咚」 */
  | "skillFocus"
  /** 顿帧（glitch-feel-pack.md 一）：暴击/斩杀瞬间的低频闷「顿」 */
  | "hitstop"
  /** 故障打击（glitch-feel-pack.md 三）：短促上行锯齿 + 高频撕裂尾音 */
  | "glitchHit"
  /** 内存错位（glitch-feel-pack.md 四）：假数据摇摆的三叠正弦 */
  | "memFake"
  /** 糊屏弹窗上脸（popup-jam-pack.md）：贱兮兮的客服双音铃 */
  | "jamIn"
  /** 弹窗被甩出屏幕（popup-jam-pack.md）：下行噪声「嗖」 */
  | "jamEscape"
  /** 糊屏弹窗到点爆炸（popup-jam-pack.md）：低频闷响叠碎裂尾 */
  | "jamBurst"
  /** 弱点 × 命中（skeuo-boss-pack.md 一）：高频脆「叮」+ 短电音尾，比 crit 更尖 */
  | "weakHit"
  /** 伪装按钮上当（skeuo-boss-pack.md 二）：低频闷响叠一小段上行嘲弄尾 */
  | "trapClick"

type ToneSpec = {
  type: OscillatorType
  from: number
  to: number
  duration: number
  volume: number
  /** 相对本次播放起点的延迟，用来拼两三个音的短句 */
  delay?: number
}

const RECIPES: Record<SfxName, ToneSpec[]> = {
  hit: [{ type: "square", from: 240, to: 150, duration: 0.07, volume: 0.05 }],
  crit: [
    { type: "sawtooth", from: 520, to: 260, duration: 0.11, volume: 0.055 },
    {
      type: "square",
      from: 300,
      to: 180,
      duration: 0.09,
      volume: 0.035,
      delay: 0.03,
    },
  ],
  kill: [
    { type: "triangle", from: 440, to: 220, duration: 0.12, volume: 0.055 },
    {
      type: "triangle",
      from: 220,
      to: 110,
      duration: 0.16,
      volume: 0.05,
      delay: 0.09,
    },
  ],
  skill: [{ type: "sawtooth", from: 300, to: 880, duration: 0.22, volume: 0.05 }],
  dodge: [{ type: "sine", from: 900, to: 1500, duration: 0.09, volume: 0.04 }],
  pick: [
    { type: "sine", from: 660, to: 660, duration: 0.09, volume: 0.05 },
    {
      type: "sine",
      from: 990,
      to: 990,
      duration: 0.14,
      volume: 0.05,
      delay: 0.08,
    },
  ],
  lose: [
    { type: "triangle", from: 420, to: 200, duration: 0.2, volume: 0.055 },
    {
      type: "triangle",
      from: 200,
      to: 90,
      duration: 0.34,
      volume: 0.05,
      delay: 0.16,
    },
  ],
  win: [
    { type: "square", from: 523, to: 523, duration: 0.1, volume: 0.045 },
    {
      type: "square",
      from: 659,
      to: 659,
      duration: 0.1,
      volume: 0.045,
      delay: 0.1,
    },
    {
      type: "square",
      from: 784,
      to: 784,
      duration: 0.2,
      volume: 0.05,
      delay: 0.2,
    },
  ],
  switch: [{ type: "sine", from: 720, to: 1080, duration: 0.07, volume: 0.04 }],
  perfect: [
    { type: "sine", from: 1320, to: 1320, duration: 0.09, volume: 0.05 },
    {
      type: "sine",
      from: 1980,
      to: 1980,
      duration: 0.14,
      volume: 0.045,
      delay: 0.05,
    },
  ],
  comboMax: [
    { type: "square", from: 523, to: 523, duration: 0.08, volume: 0.045 },
    {
      type: "square",
      from: 784,
      to: 784,
      duration: 0.08,
      volume: 0.045,
      delay: 0.07,
    },
    {
      type: "square",
      from: 1046,
      to: 1046,
      duration: 0.16,
      volume: 0.05,
      delay: 0.14,
    },
  ],
  comboBreak: [
    { type: "triangle", from: 420, to: 200, duration: 0.12, volume: 0.04 },
  ],
  close: [
    { type: "square", from: 520, to: 200, duration: 0.06, volume: 0.05 },
    {
      type: "square",
      from: 200,
      to: 110,
      duration: 0.08,
      volume: 0.045,
      delay: 0.04,
    },
  ],
  coin: [
    { type: "sine", from: 880, to: 880, duration: 0.06, volume: 0.05 },
    {
      type: "sine",
      from: 1175,
      to: 1175,
      duration: 0.12,
      volume: 0.05,
      delay: 0.05,
    },
  ],
  activate: [
    { type: "triangle", from: 660, to: 990, duration: 0.08, volume: 0.05 },
    {
      type: "sine",
      from: 990,
      to: 1320,
      duration: 0.14,
      volume: 0.045,
      delay: 0.06,
    },
  ],
  qteAlert: [
    { type: "sawtooth", from: 220, to: 220, duration: 0.09, volume: 0.05 },
    {
      type: "sawtooth",
      from: 300,
      to: 300,
      duration: 0.09,
      volume: 0.05,
      delay: 0.12,
    },
  ],
  qteHit: [
    { type: "sine", from: 880, to: 880, duration: 0.07, volume: 0.05 },
    {
      type: "sine",
      from: 1320,
      to: 1760,
      duration: 0.14,
      volume: 0.05,
      delay: 0.05,
    },
  ],
  qteFail: [
    { type: "triangle", from: 360, to: 160, duration: 0.16, volume: 0.055 },
    {
      type: "triangle",
      from: 160,
      to: 80,
      duration: 0.22,
      volume: 0.05,
      delay: 0.12,
    },
  ],
  memorySpend: [
    { type: "square", from: 600, to: 320, duration: 0.06, volume: 0.04 },
  ],
  memoryGain: [
    { type: "sine", from: 520, to: 780, duration: 0.09, volume: 0.035 },
  ],
  bounce: [
    { type: "sine", from: 340, to: 720, duration: 0.08, volume: 0.04 },
  ],
  triple: [
    { type: "square", from: 420, to: 420, duration: 0.05, volume: 0.045 },
    {
      type: "square",
      from: 520,
      to: 520,
      duration: 0.05,
      volume: 0.045,
      delay: 0.06,
    },
    {
      type: "square",
      from: 640,
      to: 640,
      duration: 0.05,
      volume: 0.045,
      delay: 0.12,
    },
  ],
  chainCrit: [
    { type: "sawtooth", from: 160, to: 60, duration: 0.24, volume: 0.06 },
    {
      type: "square",
      from: 120,
      to: 50,
      duration: 0.2,
      volume: 0.045,
      delay: 0.05,
    },
  ],
  split: [
    { type: "triangle", from: 900, to: 480, duration: 0.07, volume: 0.045 },
    {
      type: "triangle",
      from: 720,
      to: 360,
      duration: 0.07,
      volume: 0.04,
      delay: 0.05,
    },
    {
      type: "triangle",
      from: 560,
      to: 280,
      duration: 0.07,
      volume: 0.035,
      delay: 0.1,
    },
  ],
  refactor: [
    { type: "sine", from: 392, to: 523, duration: 0.1, volume: 0.04 },
    {
      type: "sine",
      from: 523,
      to: 784,
      duration: 0.14,
      volume: 0.04,
      delay: 0.08,
    },
  ],
  darkToggle: [
    { type: "sine", from: 120, to: 55, duration: 0.35, volume: 0.06 },
  ],
  pierce: [
    { type: "sawtooth", from: 980, to: 1500, duration: 0.07, volume: 0.04 },
    {
      type: "square",
      from: 620,
      to: 340,
      duration: 0.06,
      volume: 0.03,
      delay: 0.04,
    },
  ],
  deathWard: [
    { type: "triangle", from: 180, to: 140, duration: 0.1, volume: 0.04 },
    {
      type: "sine",
      from: 440,
      to: 880,
      duration: 0.18,
      volume: 0.05,
      delay: 0.08,
    },
  ],
  taskmgrOpen: [
    { type: "square", from: 659, to: 659, duration: 0.05, volume: 0.04 },
    {
      type: "square",
      from: 988,
      to: 988,
      duration: 0.09,
      volume: 0.04,
      delay: 0.06,
    },
    {
      type: "sine",
      from: 1319,
      to: 1319,
      duration: 0.12,
      volume: 0.03,
      delay: 0.15,
    },
  ],
  taskEnd: [
    { type: "sawtooth", from: 280, to: 70, duration: 0.16, volume: 0.055 },
    {
      type: "square",
      from: 110,
      to: 55,
      duration: 0.1,
      volume: 0.045,
      delay: 0.1,
    },
  ],
  taskThrottle: [
    { type: "triangle", from: 620, to: 140, duration: 0.26, volume: 0.05 },
  ],
  taskBoost: [
    { type: "triangle", from: 440, to: 440, duration: 0.06, volume: 0.045 },
    {
      type: "triangle",
      from: 554,
      to: 554,
      duration: 0.06,
      volume: 0.045,
      delay: 0.06,
    },
    {
      type: "triangle",
      from: 659,
      to: 880,
      duration: 0.14,
      volume: 0.05,
      delay: 0.12,
    },
  ],
  skillFocus: [
    { type: "triangle", from: 160, to: 48, duration: 0.18, volume: 0.06 },
    {
      type: "square",
      from: 110,
      to: 44,
      duration: 0.12,
      volume: 0.045,
      delay: 0.02,
    },
    {
      type: "sine",
      from: 1400,
      to: 2400,
      duration: 0.09,
      volume: 0.025,
      delay: 0.05,
    },
  ],
  execute: [
    { type: "square", from: 1400, to: 500, duration: 0.05, volume: 0.06 },
    {
      type: "square",
      from: 700,
      to: 120,
      duration: 0.1,
      volume: 0.055,
      delay: 0.04,
    },
  ],
  pageFlip: [
    { type: "triangle", from: 900, to: 1400, duration: 0.05, volume: 0.035 },
    {
      type: "triangle",
      from: 1400,
      to: 700,
      duration: 0.06,
      volume: 0.03,
      delay: 0.05,
    },
  ],
  mystery: [
    { type: "sine", from: 330, to: 220, duration: 0.3, volume: 0.045 },
    {
      type: "sine",
      from: 220,
      to: 165,
      duration: 0.4,
      volume: 0.04,
      delay: 0.22,
    },
  ],
  suspense: [
    { type: "sawtooth", from: 233, to: 220, duration: 0.22, volume: 0.04 },
    {
      type: "sawtooth",
      from: 220,
      to: 233,
      duration: 0.22,
      volume: 0.04,
      delay: 0.2,
    },
    {
      type: "square",
      from: 116,
      to: 110,
      duration: 0.3,
      volume: 0.035,
      delay: 0.42,
    },
  ],
  hitstop: [
    { type: "sine", from: 140, to: 70, duration: 0.14, volume: 0.07 },
  ],
  glitchHit: [
    { type: "sawtooth", from: 320, to: 900, duration: 0.06, volume: 0.05 },
    {
      type: "square",
      from: 1500,
      to: 600,
      duration: 0.08,
      volume: 0.04,
      delay: 0.05,
    },
    {
      type: "sawtooth",
      from: 120,
      to: 240,
      duration: 0.1,
      volume: 0.045,
      delay: 0.11,
    },
  ],
  memFake: [
    { type: "sine", from: 520, to: 380, duration: 0.1, volume: 0.045 },
    {
      type: "sine",
      from: 380,
      to: 560,
      duration: 0.1,
      volume: 0.04,
      delay: 0.09,
    },
    {
      type: "sine",
      from: 560,
      to: 300,
      duration: 0.12,
      volume: 0.035,
      delay: 0.19,
    },
  ],
  jamIn: [
    /* 客服铃：两记上行三角波 + 高频贱尾 */
    { type: "triangle", from: 660, to: 880, duration: 0.09, volume: 0.05 },
    {
      type: "triangle",
      from: 880,
      to: 1170,
      duration: 0.09,
      volume: 0.05,
      delay: 0.1,
    },
    {
      type: "square",
      from: 2200,
      to: 1800,
      duration: 0.06,
      volume: 0.025,
      delay: 0.2,
    },
  ],
  jamEscape: [
    /* 甩飞：快速下坠的「嗖」 */
    { type: "sawtooth", from: 900, to: 120, duration: 0.18, volume: 0.05 },
    {
      type: "triangle",
      from: 1400,
      to: 300,
      duration: 0.12,
      volume: 0.03,
      delay: 0.03,
    },
  ],
  jamBurst: [
    /* 爆炸：低频闷响 + 高频碎裂尾 */
    { type: "sine", from: 160, to: 40, duration: 0.22, volume: 0.08 },
    {
      type: "square",
      from: 800,
      to: 150,
      duration: 0.1,
      volume: 0.04,
      delay: 0.02,
    },
  ],
  weakHit: [
    /* 弱点命中：高频脆「叮」+ 短电音尾（比暴击音更尖） */
    { type: "square", from: 1180, to: 1560, duration: 0.06, volume: 0.05 },
    {
      type: "sawtooth",
      from: 1560,
      to: 920,
      duration: 0.09,
      volume: 0.035,
      delay: 0.05,
    },
  ],
  trapClick: [
    /* 上当：低频闷响 + 一小段上行「嘿嘿」嘲弄尾 */
    { type: "sine", from: 140, to: 55, duration: 0.16, volume: 0.07 },
    {
      type: "triangle",
      from: 300,
      to: 640,
      duration: 0.13,
      volume: 0.04,
      delay: 0.13,
    },
  ],
}

/** 同名音效的最小间隔，顺带压掉开发模式下 state 更新函数被重复调用导致的叠音 */
const MIN_GAP_MS = 45
const lastPlayedAt: Partial<Record<SfxName, number>> = {}

type AudioCtor = new () => AudioContext

/** 老 Safari 只有 webkitAudioContext，这里统一取一次构造器 */
function getAudioCtor(): AudioCtor | null {
  const scope = globalThis as unknown as {
    AudioContext?: AudioCtor
    webkitAudioContext?: AudioCtor
  }
  return scope.AudioContext ?? scope.webkitAudioContext ?? null
}

let audioCtx: AudioContext | null = null
let audioUnavailable = false

function getContext(): AudioContext | null {
  if (typeof window === "undefined" || audioUnavailable) return null
  try {
    if (!audioCtx) {
      const Ctor = getAudioCtor()
      if (!Ctor) {
        audioUnavailable = true
        return null
      }
      audioCtx = new Ctor()
    }
    const ctx = audioCtx
    if (!ctx) return null
    if (ctx.state === "suspended") {
      void ctx.resume()
    }
    return ctx
  } catch {
    audioUnavailable = true
    return null
  }
}

/** 当前存档里的音效开关（读不到存档时按关闭处理） */
export function isSfxOn(): boolean {
  try {
    return loadDungeonSave().settings.sound
  } catch {
    return false
  }
}

/** 音量系数：存档里的 volume 是 0–100，换算成 0–1 的增益倍数 */
function sfxVolumeScale(): number {
  try {
    const volume = loadDungeonSave().settings.volume
    if (typeof volume !== "number") return 0.8
    return Math.min(1, Math.max(0, volume / 100))
  } catch {
    return 0.8
  }
}

/** 播放一个短音效；音效关掉、音量归零、或环境不支持时什么都不做 */
export function playSfx(name: SfxName): void {
  if (!isSfxOn()) return

  const volumeScale = sfxVolumeScale()
  if (volumeScale <= 0) return

  const recipe = RECIPES[name]
  if (!recipe) return

  const stamp = Date.now()
  if (stamp - (lastPlayedAt[name] ?? 0) < MIN_GAP_MS) return
  lastPlayedAt[name] = stamp

  const ctx = getContext()
  if (!ctx) return

  const start = ctx.currentTime
  recipe.forEach((tone) => {
    try {
      const at = start + (tone.delay ?? 0)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = tone.type
      osc.frequency.setValueAtTime(tone.from, at)
      if (tone.to !== tone.from) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(40, tone.to),
          at + tone.duration,
        )
      }

      // 指数包络不接受 0，音量拉到底时给一个听不见的下限
      const peak = Math.max(0.0002, tone.volume * volumeScale)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.duration)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + tone.duration + 0.03)
    } catch {
      // 单个音出错不影响其它音与战斗流程
    }
  })
}

/**
 * 连击每叠一层的升调音：叠得越高音调越高，最多 15 层，最高一档封顶。
 * 走同一份音效开关与音量；叠太快时靠 MIN_GAP 自然限流。
 */
export function playComboStackSfx(stack: number): void {
  if (!isSfxOn()) return
  const volumeScale = sfxVolumeScale()
  if (volumeScale <= 0) return
  const stamp = Date.now()
  if (stamp - (lastPlayedAt.hit ?? 0) < MIN_GAP_MS) return
  lastPlayedAt.hit = stamp

  const ctx = getContext()
  if (!ctx) return
  try {
    const step = Math.min(Math.max(stack, 1), 15) - 1
    const freq = 440 + step * 46
    const at = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "square"
    osc.frequency.setValueAtTime(freq, at)
    const peak = Math.max(0.0002, 0.04 * volumeScale)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.08)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(at)
    osc.stop(at + 0.1)
  } catch {
    // 合成失败静默降级
  }
}

/** 蓄力持续音：一个频率持续爬升的长音，松手时 stopChargeTone 关掉 */
let chargeNodes: { osc: OscillatorNode; gain: GainNode } | null = null

/** 开始蓄力上升音（受音效开关 / 音量控制）；已在响时不重复起 */
export function startChargeTone(): void {
  if (!isSfxOn() || chargeNodes) return
  const volumeScale = sfxVolumeScale()
  if (volumeScale <= 0) return
  const ctx = getContext()
  if (!ctx) return
  try {
    const at = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sawtooth"
    osc.frequency.setValueAtTime(200, at)
    osc.frequency.linearRampToValueAtTime(900, at + 2)
    const peak = Math.max(0.0002, 0.03 * volumeScale)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.linearRampToValueAtTime(peak, at + 0.08)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(at)
    chargeNodes = { osc, gain }
  } catch {
    chargeNodes = null
  }
}

/** 结束蓄力：把持续音淡出并断开 */
export function stopChargeTone(): void {
  const nodes = chargeNodes
  if (!nodes) return
  chargeNodes = null
  try {
    const ctx = nodes.osc.context
    const at = ctx.currentTime
    nodes.gain.gain.cancelScheduledValues(at)
    nodes.gain.gain.setValueAtTime(Math.max(0.0001, nodes.gain.gain.value), at)
    nodes.gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.08)
    nodes.osc.stop(at + 0.1)
  } catch {
    // 收尾失败无所谓，引用已清
  }
}
