/**
 * 奶蛙大学 · 氛围音效（Web Audio 合成）
 * 零外部音频文件、零第三方音频依赖：反馈音与雨天/风天白噪声氛围全部现场合成。
 * 音量克制——各音轨峰值增益 0.03~0.11（远低于刺耳阈值），不做旋律 BGM。
 * soundOn=false 时所有入口在第一行直接返回：不建 AudioContext、不排队任何节点。
 */

import { loadSettings, loadSoundOn, persistSoundOn } from "@/lib/gameSave";

export type SfxName =
  | "advance"
  | "confirm"
  | "ding"
  | "chime"
  | "swoosh"
  | "shutter"
  | "heartbeat"
  | "bell-far"
  | "flip";

/**
 * 场景 SE（表现层切片）：宿舍线与图书馆线的环境音，由剧本行触发、只播一次。
 * knock 敲门两声 / page 翻页 / socket-click 断电咔哒 / steps 脚步渐远 / water-drop 水房滴水 /
 * curtain 床帘滑环 / peel 撕纸 / lamp-hum 应急灯嗡鸣 / clock 闹钟一声即止 / mug 杯子放桌；
 * pen-click 合笔咔哒 / cup-twist 保温杯拧开又拧上 / bell 闭馆铃（图书馆线）；
 * shutter 快门（团建合照四轮 / 公示栏拍照）。
 */
export type PlaySeId =
  | "se-stamp-cream"
  | "se-stamp-candy"
  | "se-stamp-paper"
  | "se-read-stamp"
  | "se-knock"
  | "se-page"
  | "se-socket-click"
  | "se-steps"
  | "se-water-drop"
  | "se-curtain"
  | "se-peel"
  | "se-lamp-hum"
  | "se-clock"
  | "se-mug"
  | "se-pen-click"
  | "se-cup-twist"
  | "se-bell"
  | "se-spoon-scoop"
  | "se-tray-clang"
  | "se-bolt-clang"
  | "se-balloon-pop"
  | "se-pointer-click"
  | "se-switch-off"
  | "se-grass-press"
  | "se-soda-fizz"
  | "se-phone-buzz"
  | "se-locker-clang"
  | "se-pen-scratch"
  | "se-water-slow"
  | "se-stamp-thunk"
  | "se-printer"
  | "se-keys-jingle"
  | "se-flyer-tear"
  | "se-applause"
  | "se-chair-scrape"
  | "se-lap-water"
  | "se-phone-stack"
  | "se-fire-dial"
  | "se-shutter"
  | "se-settle-truth"
  | "se-settle-relay"
  | "se-settle-silence";

interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
}

interface ToneOptions {
  type: OscillatorType;
  freq: number;
  /** 结束频率：与起始不同时做一次滑音（咚的「落定感」靠它） */
  endFreq?: number;
  /** 时长（秒） */
  duration: number;
  /** 峰值增益（0-1，全站克制在 0.11 以内） */
  peak: number;
  /** 相对当前时刻的延迟（秒），双泛音错开一点点更接近真实铃音 */
  delay?: number;
}

let rig: AudioRig | null = null;
let rigFailed = false;
let enabledCache: boolean | null = null;
let gestureWired = false;
/* 雨天白噪声：循环噪声源 + 渐变增益，进地图淡入、离开淡出 */
let rainBuffer: AudioBuffer | null = null;
let rainSource: AudioBufferSourceNode | null = null;
let rainGain: GainNode | null = null;
/* 风天白噪声（批次 B2）：同机制，另带一阵一阵的慢速起伏 */
let windSource: AudioBufferSourceNode | null = null;
let windGain: GainNode | null = null;
/* 晴天虫鸣（批次 CY-98）：高频噪声 + 快 tremolo，音量极低，只在安静日子贴耳听得见 */
let sunnySource: AudioBufferSourceNode | null = null;
let sunnyGain: GainNode | null = null;
let sunnyTremolo: OscillatorNode | null = null;
let sunnyTremoloGain: GainNode | null = null;
let windLfo: OscillatorNode | null = null;
let windLfoGain: GainNode | null = null;
/* SE 用短噪声缓存（swoosh 转场） */
let fxNoiseBuffer: AudioBuffer | null = null;

function readEnabled(): boolean {
  if (enabledCache === null) enabledCache = loadSoundOn();
  return enabledCache;
}

/** 音量（设置里 0-1）：每次现读，设置面板改完立刻生效；读不到按 0.9 */
function readVolume(): number {
  const volume = loadSettings().volume;
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.9;
}

/** 音效开关当前值（顶栏图标用） */
export function isSoundOn(): boolean {
  return readEnabled();
}

/**
 * 切换音效开关：持久化 + 更新缓存；关掉时立即停掉雨天氛围（不等淡出）。
 * 各页面在自己 state 里同步一份用于图标显示。
 */
export function setSoundOn(on: boolean): boolean {
  enabledCache = on;
  persistSoundOn(on);
  if (!on) {
    stopRainAmbience(true);
    stopWindAmbience(true);
  }
  return on;
}

/** 取（或首次创建）AudioContext 与主输出；创建失败就静默降级，此后永远哑巴但不打扰 */
function getRig(): AudioRig | null {
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
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    rig = { ctx, master };
  } catch {
    rigFailed = true;
    return null;
  }
  return rig;
}

/** 浏览器自动播放策略：AudioContext 要等一次用户手势才出声。挂一次全局兜底监听，失败静默 */
function wakeOnGesture(r: AudioRig): void {
  if (r.ctx.state !== "suspended") return;
  void r.ctx.resume().catch(() => {
    /* 这次手势没被浏览器认可就先哑着，下一个手势再试 */
  });
  if (gestureWired) return;
  gestureWired = true;
  const wake = () => {
    if (rig && rig.ctx.state === "suspended") {
      void rig.ctx.resume().catch(() => {
        /* 同上，静默降级 */
      });
    }
  };
  window.addEventListener("pointerdown", wake, { passive: true });
  window.addEventListener("keydown", wake, { passive: true });
}

/** 排一个短音：快起、指数衰减，收尾干净不留尾巴（峰值统一乘设置里的音量） */
function scheduleTone(r: AudioRig, opts: ToneOptions): void {
  const { ctx, master } = r;
  const peak = opts.peak * readVolume();
  if (peak <= 0.0001) return;
  const start = ctx.currentTime + (opts.delay ?? 0);
  const osc = ctx.createOscillator();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.endFreq !== undefined && opts.endFreq > 0) {
    osc.frequency.exponentialRampToValueAtTime(opts.endFreq, start + opts.duration);
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.012, opts.duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + opts.duration + 0.03);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** 排一段带通噪声扫频（swoosh 转场用）：噪声过带通，中心频率从高滑到低，包络快起缓收 */
function scheduleNoiseSweep(
  r: AudioRig,
  opts: { fromFreq: number; toFreq: number; duration: number; peak: number; delay?: number },
): void {
  const { ctx, master } = r;
  const peak = opts.peak * readVolume();
  if (peak <= 0.0001) return;
  if (!fxNoiseBuffer) {
    const length = Math.floor(ctx.sampleRate * Math.max(0.6, opts.duration + 0.1));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    fxNoiseBuffer = buffer;
  }
  const start = ctx.currentTime + (opts.delay ?? 0);
  const source = ctx.createBufferSource();
  source.buffer = fxNoiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.1;
  filter.frequency.setValueAtTime(opts.fromFreq, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.toFreq), start + opts.duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.07);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(start);
  source.stop(start + opts.duration + 0.05);
  source.onended = () => {
    try {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    } catch {
      /* 已断开 */
    }
  };
}

/**
 * 播放一类反馈音（soundOn=false 时零开销：第一行直接返回）。
 * advance 轻嗒 / confirm 咚 / ding 叮 / chime 轻钟；
 * 批次 B2 新增：swoosh 转场 / shutter CG 快门 / heartbeat 真心话前奏；
 * 批次 CY-27 新增：bell-far 黄昏远钟（白天转黑夜时自动飘一声）；
 * 批次 CY-138 新增：flip 翻卡纸声（收藏卡正反切换）。
 */
export function playSfx(name: SfxName): void {
  if (!readEnabled() || readVolume() <= 0.0001) return;
  const r = getRig();
  if (!r) return;
  wakeOnGesture(r);
  /* 还没被任何手势唤醒：这次不出声，不打扰 */
  if (r.ctx.state === "suspended") return;
  switch (name) {
    case "advance":
      /* 轻嗒：三角波高频一瞬下滑，像指尖敲过纸面 */
      scheduleTone(r, { type: "triangle", freq: 1500, endFreq: 950, duration: 0.05, peak: 0.05 });
      break;
    case "confirm":
      /* 咚：低频正弦短滑音，落定感；叠一层高一倍的薄音增加厚度 */
      scheduleTone(r, { type: "sine", freq: 220, endFreq: 120, duration: 0.18, peak: 0.11 });
      scheduleTone(r, { type: "sine", freq: 440, endFreq: 240, duration: 0.08, peak: 0.04 });
      break;
    case "ding":
      /* 叮：E6 + B6 双正弦铃点，好感的轻响 */
      scheduleTone(r, { type: "sine", freq: 1318.5, duration: 0.42, peak: 0.07 });
      scheduleTone(r, { type: "sine", freq: 1975.5, duration: 0.3, peak: 0.035, delay: 0.02 });
      break;
    case "chime":
      /* 轻钟：基音 + 两个弱泛音，长衰减，幕结算与结局共用 */
      scheduleTone(r, { type: "sine", freq: 659.3, duration: 1.1, peak: 0.055 });
      scheduleTone(r, { type: "sine", freq: 989, duration: 0.8, peak: 0.03, delay: 0.006 });
      scheduleTone(r, { type: "sine", freq: 1819, duration: 0.5, peak: 0.018, delay: 0.012 });
      break;
    case "swoosh":
      /* 转场：一段噪声从高频滑到低频，像幕布合拢又掀开 */
      scheduleNoiseSweep(r, { fromFreq: 1500, toFreq: 220, duration: 0.46, peak: 0.065 });
      break;
    case "shutter":
      /* 快门：两声干脆的高频点 + 一记低频落定，CG 展开/收起共用 */
      scheduleTone(r, { type: "square", freq: 2100, duration: 0.03, peak: 0.05 });
      scheduleTone(r, { type: "square", freq: 1500, duration: 0.04, peak: 0.06, delay: 0.09 });
      scheduleTone(r, { type: "sine", freq: 190, endFreq: 95, duration: 0.12, peak: 0.055, delay: 0.1 });
      break;
    case "heartbeat":
      /* 心跳：低频双跳「咚-咚」，真心话开场前奏 */
      scheduleTone(r, { type: "sine", freq: 84, endFreq: 60, duration: 0.16, peak: 0.1 });
      scheduleTone(r, { type: "sine", freq: 78, endFreq: 55, duration: 0.2, peak: 0.08, delay: 0.24 });
      break;
    case "flip":
      /* 翻卡（批次 CY-138）：一记纸页翻过去——噪声从中频上滑到高频再落，尾上带一点轻嗒。
         收藏卡的正反切换用：说出口的话翻过来，纸响一声。 */
      scheduleNoiseSweep(r, { fromFreq: 420, toFreq: 2600, duration: 0.12, peak: 0.05 });
      scheduleTone(r, { type: "triangle", freq: 1250, endFreq: 880, duration: 0.035, peak: 0.035, delay: 0.11 });
      break;
    case "bell-far":
      /* 黄昏远钟（批次 CY-27）：白天转黑夜时从校园深处飘来的一声——
         低基音 + 一记失谐泛音做钟的「嗡」，长衰减、峰值压得很低，像隔着几栋楼听见 */
      scheduleTone(r, { type: "sine", freq: 293.7, duration: 2.6, peak: 0.045 });
      scheduleTone(r, { type: "sine", freq: 617.6, duration: 1.7, peak: 0.018, delay: 0.008 });
      scheduleTone(r, { type: "sine", freq: 880.5, duration: 0.9, peak: 0.01, delay: 0.016 });
      break;
  }
}

/* ---------- 《熄灯之后》场景 SE（表现层切片）：走廊与宿舍的环境音，全部现场合成 ---------- */

/**
 * 播放一个场景 SE（soundOn=false 时零开销：第一行直接返回）。
 * 与 playSfx 同一套守卫：首次交互唤醒、失败静默降级、峰值乘 settings.volume。
 */
export function playSe(id: PlaySeId): void {
  if (!readEnabled() || readVolume() <= 0.0001) return;
  const r = getRig();
  if (!r) return;
  wakeOnGesture(r);
  /* 还没被任何手势唤醒：这次不出声，不打扰 */
  if (r.ctx.state === "suspended") return;
  switch (id) {
    /* 盖章（批次 CH「行政化」）：三套行政风格三种落章声——同一份档案，换一种纸就换一种章 */
    case "se-stamp-cream":
      /* 咔：档案纸上一记章——短促方波高频点，跟一记低频落定 */
      scheduleTone(r, { type: "square", freq: 1650, duration: 0.028, peak: 0.06 });
      scheduleTone(r, { type: "sine", freq: 175, endFreq: 92, duration: 0.1, peak: 0.08, delay: 0.03 });
      break;
    case "se-stamp-candy":
      /* 唰：红头文件一记长章——噪声快速扫落，收在纸面上 */
      scheduleNoiseSweep(r, { fromFreq: 2200, toFreq: 620, duration: 0.2, peak: 0.05 });
      break;
    case "se-stamp-paper":
      /* 嘀：灯下终端章——两枚极短高频点 */
      scheduleTone(r, { type: "triangle", freq: 1980, duration: 0.03, peak: 0.05 });
      scheduleTone(r, { type: "triangle", freq: 2620, duration: 0.022, peak: 0.032, delay: 0.075 });
      break;
    case "se-read-stamp":
      /* 已阅：快进时快速盖过的红章——一记更重的落定 */
      scheduleTone(r, { type: "square", freq: 1180, duration: 0.02, peak: 0.055 });
      scheduleTone(r, { type: "sine", freq: 140, endFreq: 78, duration: 0.14, peak: 0.09, delay: 0.02 });
      break;
    case "se-knock":
      /* 敲门两声：低频短滑音，第二声稍轻、落点靠下，像指节叩在门板上 */
      scheduleTone(r, { type: "sine", freq: 155, endFreq: 92, duration: 0.1, peak: 0.1 });
      scheduleTone(r, { type: "sine", freq: 142, endFreq: 86, duration: 0.09, peak: 0.08, delay: 0.24 });
      break;
    case "se-page":
      /* 翻页：两段带通噪声从高频滑落，纸页擦过又落下 */
      scheduleNoiseSweep(r, { fromFreq: 2600, toFreq: 900, duration: 0.16, peak: 0.045 });
      scheduleNoiseSweep(r, { fromFreq: 2200, toFreq: 700, duration: 0.14, peak: 0.032, delay: 0.19 });
      break;
    case "se-socket-click":
      /* 断电：一记极短方波咔哒，跟着一记长低频滑落——整层楼落闸的声音 */
      scheduleTone(r, { type: "square", freq: 1900, duration: 0.025, peak: 0.07 });
      scheduleTone(r, { type: "sine", freq: 210, endFreq: 48, duration: 0.5, peak: 0.09, delay: 0.04 });
      break;
    case "se-steps":
      /* 走廊脚步渐远：五记低频落点，一声比一声轻、比一声低 */
      [0, 0.42, 0.86, 1.32, 1.8].forEach((delay, i) => {
        scheduleTone(r, {
          type: "sine",
          freq: 150 - i * 8,
          endFreq: 88,
          duration: 0.11,
          peak: [0.075, 0.062, 0.05, 0.038, 0.026][i] ?? 0.026,
          delay,
        });
      });
      break;
    case "se-water-drop":
      /* 水房滴水：三滴正弦上滑，间隔越拉越长 */
      scheduleTone(r, { type: "sine", freq: 620, endFreq: 1240, duration: 0.12, peak: 0.05 });
      scheduleTone(r, { type: "sine", freq: 680, endFreq: 1320, duration: 0.11, peak: 0.045, delay: 0.62 });
      scheduleTone(r, { type: "sine", freq: 720, endFreq: 1400, duration: 0.1, peak: 0.04, delay: 1.3 });
      break;
    case "se-curtain":
      /* 床帘滑环：四枚高频小点连成一串，滑环划过横杆 */
      [0, 0.09, 0.18, 0.27].forEach((delay, i) => {
        scheduleTone(r, { type: "triangle", freq: 1750 + i * 90, duration: 0.05, peak: 0.04, delay });
      });
      break;
    case "se-peel":
      /* 撕纸：带通噪声从低到高快速撕开，收在纸面离开的那一下 */
      scheduleNoiseSweep(r, { fromFreq: 620, toFreq: 2900, duration: 0.26, peak: 0.06 });
      scheduleTone(r, { type: "triangle", freq: 2400, duration: 0.04, peak: 0.03, delay: 0.26 });
      break;
    case "se-lamp-hum":
      /* 应急灯：两只失谐锯齿波短嗡，启辉那一下的电流感 */
      scheduleTone(r, { type: "sawtooth", freq: 100, endFreq: 96, duration: 0.7, peak: 0.035 });
      scheduleTone(r, { type: "sawtooth", freq: 103.5, endFreq: 99, duration: 0.7, peak: 0.028 });
      break;
    case "se-clock":
      /* 闹钟响一声即止：高频铃点 + 泛音，戛然而止 */
      scheduleTone(r, { type: "square", freq: 2093, duration: 0.09, peak: 0.06 });
      scheduleTone(r, { type: "sine", freq: 1396, duration: 0.16, peak: 0.04, delay: 0.01 });
      break;
    case "se-mug":
      /* 杯子放桌：低频落定 + 一记高频陶瓷轻点 */
      scheduleTone(r, { type: "sine", freq: 175, endFreq: 92, duration: 0.12, peak: 0.09 });
      scheduleTone(r, { type: "triangle", freq: 2600, duration: 0.03, peak: 0.035, delay: 0.02 });
      break;
    case "se-pen-click":
      /* 合笔：笔帽扣上的两段咔哒，先清脆后发闷，全程约 80ms */
      scheduleTone(r, { type: "square", freq: 2600, duration: 0.022, peak: 0.065 });
      scheduleTone(r, { type: "triangle", freq: 1500, endFreq: 900, duration: 0.045, peak: 0.04, delay: 0.04 });
      break;
    case "se-cup-twist":
      /* 保温杯拧开又拧上：两段摩擦噪声隔着半拍，螺纹的颗粒感靠两记小咔哒 */
      scheduleNoiseSweep(r, { fromFreq: 1800, toFreq: 520, duration: 0.34, peak: 0.038 });
      scheduleTone(r, { type: "triangle", freq: 2200, duration: 0.03, peak: 0.03, delay: 0.38 });
      scheduleNoiseSweep(r, { fromFreq: 560, toFreq: 1900, duration: 0.3, peak: 0.032, delay: 0.85 });
      scheduleTone(r, { type: "triangle", freq: 1900, duration: 0.028, peak: 0.026, delay: 1.18 });
      break;
    case "se-lap-water":
      /* 湖水拍岸：两下轻拍，间隔半拍 */
      scheduleNoiseSweep(r, { fromFreq: 760, toFreq: 420, duration: 0.3, peak: 0.036 });
      scheduleNoiseSweep(r, { fromFreq: 700, toFreq: 380, duration: 0.26, peak: 0.026, delay: 0.5 });
      break;
    case "se-phone-stack":
      /* 手机摞上石头：两声磕碰，第二声更轻 */
      scheduleTone(r, { type: "sine", freq: 980, duration: 0.06, peak: 0.045 });
      scheduleTone(r, { type: "triangle", freq: 1420, duration: 0.09, peak: 0.028, delay: 0.11 });
      break;
    case "se-fire-dial":
      /* 拨火：酒精炉的铁条拨炭，短促三下 */
      scheduleNoiseSweep(r, { fromFreq: 1600, toFreq: 700, duration: 0.08, peak: 0.032 });
      scheduleNoiseSweep(r, { fromFreq: 1500, toFreq: 640, duration: 0.08, peak: 0.028, delay: 0.16 });
      scheduleNoiseSweep(r, { fromFreq: 1400, toFreq: 560, duration: 0.1, peak: 0.022, delay: 0.32 });
      break;
    case "se-flyer-tear":
      /* 撕海报：纸从电线杆上撕下一半的裂口声 */
      scheduleNoiseSweep(r, { fromFreq: 2400, toFreq: 1100, duration: 0.16, peak: 0.045 });
      scheduleNoiseSweep(r, { fromFreq: 1800, toFreq: 700, duration: 0.12, peak: 0.03, delay: 0.18 });
      break;
    case "se-shutter":
      /* 快门：镜帘两声干脆的点 + 一记低频落定（合照四轮 / 公示栏拍照） */
      scheduleTone(r, { type: "square", freq: 2300, duration: 0.024, peak: 0.05 });
      scheduleTone(r, { type: "square", freq: 1600, duration: 0.032, peak: 0.055, delay: 0.07 });
      scheduleTone(r, { type: "sine", freq: 170, endFreq: 90, duration: 0.1, peak: 0.05, delay: 0.08 });
      break;
    case "se-applause":
      /* 掌声：一阵密集的掌声，两秒渐弱 */
      for (let i = 0; i < 9; i += 1) {
        const jitter = (i % 3) * 0.013 + (i > 5 ? 0.09 : 0);
        scheduleNoiseSweep(r, { fromFreq: 2200 + i * 120, toFreq: 1400, duration: 0.06, peak: 0.03 - i * 0.002, delay: i * 0.1 + jitter });
      }
      break;
    case "se-chair-scrape":
      /* 椅子拖过地：把椅子搬到桌边的那一下 */
      scheduleNoiseSweep(r, { fromFreq: 520, toFreq: 260, duration: 0.36, peak: 0.05 });
      scheduleTone(r, { type: "sine", freq: 180, endFreq: 96, duration: 0.18, peak: 0.05, delay: 0.3 });
      break;
    case "se-stamp-thunk":
      /* 盖章：章落纸上的钝响，柄磕桌面带一点余振 */
      scheduleTone(r, { type: "sine", freq: 240, endFreq: 110, duration: 0.14, peak: 0.1 });
      scheduleTone(r, { type: "square", freq: 640, duration: 0.04, peak: 0.035, delay: 0.01 });
      scheduleTone(r, { type: "sine", freq: 1280, duration: 0.3, peak: 0.016, delay: 0.03 });
      break;
    case "se-printer":
      /* 打印机：进纸、走纸、切纸三段 */
      scheduleNoiseSweep(r, { fromFreq: 900, toFreq: 640, duration: 0.22, peak: 0.03 });
      scheduleNoiseSweep(r, { fromFreq: 1400, toFreq: 1000, duration: 0.34, peak: 0.034, delay: 0.24 });
      scheduleTone(r, { type: "triangle", freq: 1150, duration: 0.05, peak: 0.03, delay: 0.6 });
      break;
    case "se-keys-jingle":
      /* 钥匙串：工牌绳上的钥匙叮当两声 */
      scheduleTone(r, { type: "triangle", freq: 2180, duration: 0.09, peak: 0.036 });
      scheduleTone(r, { type: "triangle", freq: 1740, duration: 0.07, peak: 0.03, delay: 0.13 });
      scheduleTone(r, { type: "triangle", freq: 2480, duration: 0.16, peak: 0.02, delay: 0.24 });
      break;
    case "se-locker-clang":
      /* 储物柜铁门：半开哐一声带金属余振 */
      scheduleTone(r, { type: "sine", freq: 210, endFreq: 96, duration: 0.24, peak: 0.095 });
      scheduleTone(r, { type: "square", freq: 860, duration: 0.05, peak: 0.04, delay: 0.02 });
      scheduleTone(r, { type: "sine", freq: 1720, duration: 0.42, peak: 0.018, delay: 0.05 });
      break;
    case "se-pen-scratch":
      /* 笔尖沙沙：悬了很久才落下的那几笔 */
      scheduleNoiseSweep(r, { fromFreq: 4200, toFreq: 2600, duration: 0.12, peak: 0.026 });
      scheduleNoiseSweep(r, { fromFreq: 3800, toFreq: 2200, duration: 0.1, peak: 0.02, delay: 0.16 });
      break;
    case "se-water-slow":
      /* 接水声：水是凉的，流得不急 */
      scheduleNoiseSweep(r, { fromFreq: 1100, toFreq: 700, duration: 0.5, peak: 0.028 });
      scheduleTone(r, { type: "sine", freq: 340, endFreq: 260, duration: 0.4, peak: 0.016, delay: 0.1 });
      break;
    case "se-grass-press":
      /* 草被压：躺下或起身时草的沙沙加压实的闷响 */
      scheduleNoiseSweep(r, { fromFreq: 1400, toFreq: 420, duration: 0.28, peak: 0.032 });
      scheduleTone(r, { type: "sine", freq: 190, endFreq: 120, duration: 0.16, peak: 0.045, delay: 0.14 });
      break;
    case "se-soda-fizz":
      /* 汽水开瓶：嘶一声加气泡细响两拍 */
      scheduleNoiseSweep(r, { fromFreq: 3600, toFreq: 2400, duration: 0.3, peak: 0.05 });
      scheduleTone(r, { type: "sine", freq: 1980, duration: 0.07, peak: 0.02, delay: 0.32 });
      scheduleTone(r, { type: "sine", freq: 2360, duration: 0.05, peak: 0.015, delay: 0.46 });
      break;
    case "se-phone-buzz":
      /* 手机静音震：两短一长，屏幕点亮前的闷响 */
      scheduleTone(r, { type: "square", freq: 148, duration: 0.07, peak: 0.05 });
      scheduleTone(r, { type: "square", freq: 148, duration: 0.07, peak: 0.05, delay: 0.14 });
      scheduleTone(r, { type: "square", freq: 148, duration: 0.16, peak: 0.05, delay: 0.3 });
      break;
    case "se-balloon-pop":
      /* 气球爆：一记脆响加橡皮碎片的小余响 */
      scheduleNoiseSweep(r, { fromFreq: 2600, toFreq: 700, duration: 0.12, peak: 0.075 });
      scheduleTone(r, { type: "triangle", freq: 420, endFreq: 210, duration: 0.1, peak: 0.06, delay: 0.02 });
      scheduleTone(r, { type: "triangle", freq: 980, duration: 0.05, peak: 0.03, delay: 0.11 });
      break;
    case "se-pointer-click":
      /* 激光笔：按钮咔哒加红点亮起的电子轻鸣 */
      scheduleTone(r, { type: "square", freq: 1900, duration: 0.026, peak: 0.04 });
      scheduleTone(r, { type: "sine", freq: 2740, duration: 0.34, peak: 0.016, delay: 0.05 });
      break;
    case "se-switch-off":
      /* 开关啪一声，灯丝余音往下掉 */
      scheduleTone(r, { type: "square", freq: 1320, duration: 0.03, peak: 0.055 });
      scheduleTone(r, { type: "sine", freq: 760, endFreq: 220, duration: 0.5, peak: 0.03, delay: 0.04 });
      break;
    case "se-spoon-scoop":
      /* 勺背贴锅沿刮一下：金属刮擦带一点涩，先高频摩擦后一记闷响 */
      scheduleNoiseSweep(r, { fromFreq: 3400, toFreq: 900, duration: 0.14, peak: 0.05 });
      scheduleTone(r, { type: "triangle", freq: 620, endFreq: 380, duration: 0.09, peak: 0.05, delay: 0.1 });
      break;
    case "se-tray-clang":
      /* 不锈钢餐盘落台：两记金属脆响，第二声短促的余振 */
      scheduleTone(r, { type: "square", freq: 1180, duration: 0.1, peak: 0.06 });
      scheduleTone(r, { type: "sine", freq: 2360, duration: 0.05, peak: 0.03, delay: 0.01 });
      scheduleTone(r, { type: "square", freq: 980, duration: 0.08, peak: 0.045, delay: 0.14 });
      scheduleTone(r, { type: "sine", freq: 1960, duration: 0.3, peak: 0.02, delay: 0.15 });
      break;
    case "se-bolt-clang":
      /* 泔水间铁门锁扣哐一声：低频撞击加金属余振 */
      scheduleTone(r, { type: "sine", freq: 180, endFreq: 84, duration: 0.22, peak: 0.1 });
      scheduleTone(r, { type: "square", freq: 740, duration: 0.05, peak: 0.04, delay: 0.02 });
      scheduleTone(r, { type: "sine", freq: 1480, duration: 0.4, peak: 0.02, delay: 0.04 });
      break;
    case "se-bell":
      /* 闭馆铃：两声电子铃，第二声更轻；方波铃芯叠一层高八度泛音 */
      scheduleTone(r, { type: "square", freq: 1568, duration: 0.5, peak: 0.07 });
      scheduleTone(r, { type: "sine", freq: 3136, duration: 0.32, peak: 0.028 });
      scheduleTone(r, { type: "square", freq: 1568, duration: 0.42, peak: 0.055, delay: 0.46 });
      scheduleTone(r, { type: "sine", freq: 3136, duration: 0.26, peak: 0.022, delay: 0.46 });
      break;
    /* 结算音（批次 CY-127）：处置单红章落下那一刻，按结局档位给三种收档声——
       真话档是罐子搁上架的清响，转述档是纸折好、章盖上的公文声，沉默档是抽屉推合、钥匙转一圈 */
    case "se-settle-truth":
      /* 真话档：玻璃罐搁上架——三层铃音泛音向上，亮但收得干净 */
      scheduleTone(r, { type: "sine", freq: 1046, duration: 0.5, peak: 0.06 });
      scheduleTone(r, { type: "sine", freq: 1568, duration: 0.38, peak: 0.03, delay: 0.02 });
      scheduleTone(r, { type: "triangle", freq: 2093, duration: 0.22, peak: 0.02, delay: 0.05 });
      break;
    case "se-settle-relay":
      /* 转述档：纸折好、档案合上、一记不轻不重的章 */
      scheduleNoiseSweep(r, { fromFreq: 2400, toFreq: 800, duration: 0.22, peak: 0.04 });
      scheduleTone(r, { type: "sine", freq: 320, endFreq: 150, duration: 0.12, peak: 0.07, delay: 0.26 });
      scheduleTone(r, { type: "square", freq: 900, duration: 0.03, peak: 0.03, delay: 0.27 });
      break;
    case "se-settle-silence":
      /* 沉默档：抽屉推到底的闷响，隔半拍，钥匙转一圈——声音往下沉，不回来 */
      scheduleNoiseSweep(r, { fromFreq: 700, toFreq: 260, duration: 0.4, peak: 0.035 });
      scheduleTone(r, { type: "sine", freq: 150, endFreq: 62, duration: 0.34, peak: 0.1, delay: 0.4 });
      scheduleTone(r, { type: "triangle", freq: 2300, duration: 0.05, peak: 0.03, delay: 0.72 });
      scheduleTone(r, { type: "triangle", freq: 1800, duration: 0.07, peak: 0.022, delay: 0.8 });
      break;
  }
}

/** 2 秒白噪声循环缓冲：噪声本身连续，循环点听感平滑 */
function makeRainBuffer(ctx: AudioContext): AudioBuffer {
  const seconds = 2;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** 雨天氛围开：低通白噪声循环，1.8 秒淡入到极低音量（已在响则不动） */
export function startRainAmbience(): void {
  if (!readEnabled()) return;
  const r = getRig();
  if (!r) return;
  wakeOnGesture(r);
  if (rainSource) return;
  if (!rainBuffer) rainBuffer = makeRainBuffer(r.ctx);
  const source = r.ctx.createBufferSource();
  source.buffer = rainBuffer;
  source.loop = true;
  const filter = r.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.5;
  const gain = r.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, r.ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.03 * readVolume()), r.ctx.currentTime + 1.8);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(r.master);
  source.start();
  rainSource = source;
  rainGain = gain;
}

/** 雨天氛围关：默认 1.2 秒淡出后回收节点；immediate=true 用于静音开关，快停 */
export function stopRainAmbience(immediate = false): void {
  const r = rig;
  const source = rainSource;
  const gain = rainGain;
  if (!r || !source || !gain) return;
  rainSource = null;
  rainGain = null;
  const now = r.ctx.currentTime;
  const fadeSeconds = immediate ? 0.06 : 1.2;
  try {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
  } catch {
    /* 数值异常就直接停 */
  }
  window.setTimeout(
    () => {
      try {
        source.stop();
      } catch {
        /* 已经停了 */
      }
      source.disconnect();
      gain.disconnect();
    },
    Math.ceil((fadeSeconds + 0.1) * 1000),
  );
}

/** 晴天虫鸣开（批次 CY-98）：bandpass 高频 + 19Hz tremolo 的“沙——”，已在响则不动 */
export function startSunnyAmbience(): void {
  if (!readEnabled()) return;
  const r = getRig();
  if (!r) return;
  wakeOnGesture(r);
  if (sunnySource) return;
  if (!rainBuffer) rainBuffer = makeRainBuffer(r.ctx);
  const source = r.ctx.createBufferSource();
  source.buffer = rainBuffer;
  source.loop = true;
  const filter = r.ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 4200;
  filter.Q.value = 6;
  const gain = r.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, r.ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.008 * readVolume()), r.ctx.currentTime + 2.4);
  /* tremolo：虫鸣不是稳音，是每秒近二十次的细密振翅 */
  const tremolo = r.ctx.createOscillator();
  tremolo.frequency.value = 19;
  const tremoloGain = r.ctx.createGain();
  tremoloGain.gain.value = 0.004 * readVolume();
  tremolo.connect(tremoloGain);
  tremoloGain.connect(gain.gain);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(r.master);
  source.start();
  tremolo.start();
  sunnySource = source;
  sunnyGain = gain;
  sunnyTremolo = tremolo;
  sunnyTremoloGain = tremoloGain;
}

/** 晴天虫鸣关：默认 2 秒淡出；immediate=true 用于静音开关 */
export function stopSunnyAmbience(immediate = false): void {
  const r = rig;
  const source = sunnySource;
  const gain = sunnyGain;
  const tremolo = sunnyTremolo;
  const tremoloGain = sunnyTremoloGain;
  if (!r || !source || !gain) return;
  sunnySource = null;
  sunnyGain = null;
  sunnyTremolo = null;
  sunnyTremoloGain = null;
  const now = r.ctx.currentTime;
  const fadeSeconds = immediate ? 0.06 : 2;
  try {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
  } catch {
    /* 数值异常就直接停 */
  }
  window.setTimeout(
    () => {
      try {
        source.stop();
        tremolo?.stop();
      } catch {
        /* 已经停了 */
      }
      source.disconnect();
      gain.disconnect();
      tremoloGain?.disconnect();
      tremolo?.disconnect();
    },
    Math.ceil((fadeSeconds + 0.1) * 1000),
  );
}

/** 氛围压低（批次 CY-96）：深夜弹层开着时把雨声/风声压到三成——人声在前，天气退后 */
export function duckAmbience(duck: boolean): void {
  const r = rig;
  if (!r) return;
  const now = r.ctx.currentTime;
  const apply = (gain: GainNode | null, base: number) => {
    if (!gain) return;
    const target = Math.max(0.0001, base * readVolume() * (duck ? 0.32 : 1));
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.linearRampToValueAtTime(target, now + 0.8);
    } catch {
      /* 数值异常就保持现状 */
    }
  };
  apply(rainGain, 0.03);
  apply(windGain, 0.026);
  apply(sunnyGain, 0.008);
}

/** 风天氛围开（批次 B2）：带通白噪声 + 慢速起伏，已在响则不动 */
export function startWindAmbience(): void {
  if (!readEnabled()) return;
  const r = getRig();
  if (!r) return;
  wakeOnGesture(r);
  if (windSource) return;
  if (!rainBuffer) rainBuffer = makeRainBuffer(r.ctx);
  const source = r.ctx.createBufferSource();
  source.buffer = rainBuffer;
  source.loop = true;
  const filter = r.ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 430;
  filter.Q.value = 0.6;
  const gain = r.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, r.ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.026 * readVolume()), r.ctx.currentTime + 1.8);
  /* 阵风起伏：慢速 LFO 轻推增益，风一阵一阵地过 */
  const lfo = r.ctx.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoGain = r.ctx.createGain();
  lfoGain.gain.value = 0.012 * readVolume();
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(r.master);
  source.start();
  lfo.start();
  windSource = source;
  windGain = gain;
  windLfo = lfo;
  windLfoGain = lfoGain;
}

/** 风天氛围关：默认 1.2 秒淡出后回收节点；immediate=true 用于静音开关，快停 */
export function stopWindAmbience(immediate = false): void {
  const r = rig;
  const source = windSource;
  const gain = windGain;
  const lfo = windLfo;
  const lfoGain = windLfoGain;
  if (!r || !source || !gain) return;
  windSource = null;
  windGain = null;
  windLfo = null;
  windLfoGain = null;
  const now = r.ctx.currentTime;
  const fadeSeconds = immediate ? 0.06 : 1.2;
  try {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
  } catch {
    /* 数值异常就直接停 */
  }
  window.setTimeout(
    () => {
      try {
        source.stop();
      } catch {
        /* 已经停了 */
      }
      try {
        lfo?.stop();
      } catch {
        /* 已经停了 */
      }
      source.disconnect();
      gain.disconnect();
      try {
        lfoGain?.disconnect();
      } catch {
        /* 已断开 */
      }
    },
    Math.ceil((fadeSeconds + 0.1) * 1000),
  );
}
