// WebAudio 合成音效引擎（零外部音频文件）。
// 浏览器自动播放策略：AudioContext 只允许在首次用户手势里创建/恢复，
// 页面加载后的自动事件（警报）只有在用户已经交互过之后才会真正出声。

let audioCtx: AudioContext | null = null;
let gestureArmed = false;
let muted = false;

type AudioCtor = typeof AudioContext;

/** 静音开关（默认不静音）; 静音同时挂起环境音与阶段音乐, 恢复时按上次类型续播 */
export function setAudioMuted(value: boolean): void {
  muted = value;
  if (value) {
    stopAmbientNodes();
    stopMusicNodes();
  } else {
    applyAmbient();
    applyMusic();
  }
}

/** 当前是否处于静音态（供 UI 联动提示, 如悬停预览音效的「🔇 已静音」浮字） */
export function isAudioMuted(): boolean {
  return muted;
}

/** 在任何用户点击 handler 里调用：创建/恢复 AudioContext */
export function armAudioGesture(): void {
  gestureArmed = true;
  if (!audioCtx) {
    const win = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const AC = win.AudioContext ?? win.webkitAudioContext;
    if (!AC) return;
    try {
      audioCtx = new AC();
      noiseBuf = null; // 新 context 的噪声缓冲要重建
    } catch {
      audioCtx = null;
      return;
    }
  }
  if (audioCtx.state === "suspended") void audioCtx.resume();
  // 手势解锁后补拉环境音与阶段音乐（解锁前 startAmbient / startPhaseMusic 只记类型不出声）
  applyAmbient();
  applyMusic();
}

function activeCtx(): AudioContext | null {
  if (muted || !gestureArmed || !audioCtx) return null;
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/** 一次性音源播完后统一断开自身节点链, 避免高频 SFX 的 WebAudio 节点堆积（长驻环境音/BGM 不走这里, 由各自 master 停止时断开） */
function releaseOnEnded(src: OscillatorNode | AudioBufferSourceNode, ...nodes: AudioNode[]): void {
  src.onended = () => {
    for (const n of [src as AudioNode, ...nodes]) {
      try {
        n.disconnect();
      } catch {
        // 已断开, 忽略
      }
    }
  };
}

function blip(
  ac: AudioContext,
  type: OscillatorType,
  freq: number,
  startAt: number,
  dur: number,
  peak: number,
): OscillatorNode {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(peak, startAt + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
  releaseOnEnded(osc, g);
  return osc;
}

// 正在播放的警报蜂鸣节点（供处置 ACK 时立即掐断）
let alarmNodes: OscillatorNode[] = [];

/** 安全盖开合：短促机械咔哒 */
export function playCoverClick(): void {
  const ac = activeCtx();
  if (!ac) return;
  blip(ac, "triangle", 300, ac.currentTime, 0.05, 0.09);
}

/** 点火发射：3.5s 低频轰鸣（白噪声过低通扫频 + 次低频振荡器） */
export function playLaunchRoar(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const dur = 3.5;

  const frameCount = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, frameCount, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) data[i] = Math.random() * 2 - 1;

  const src = ac.createBufferSource();
  src.buffer = buffer;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(600, t0);
  lp.frequency.exponentialRampToValueAtTime(80, t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(lp);
  lp.connect(g);
  g.connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur);
  releaseOnEnded(src, lp, g);

  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(32, t0);
  osc.frequency.linearRampToValueAtTime(60, t0 + 1.2);
  osc.frequency.linearRampToValueAtTime(28, t0 + dur);
  const og = ac.createGain();
  og.gain.setValueAtTime(0.0001, t0);
  og.gain.exponentialRampToValueAtTime(0.4, t0 + 0.25);
  og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(og);
  og.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
  releaseOnEnded(osc, og);
}

/** 警报蜂鸣：CAUTION 三声低音调 / CRITICAL 五声高音调急促 */
export function playAlarmBeep(level: "caution" | "critical"): void {
  const ac = activeCtx();
  if (!ac) return;
  alarmNodes = [];
  const critical = level === "critical";
  const count = critical ? 5 : 3;
  const freq = critical ? 988 : 622;
  const step = critical ? 0.17 : 0.24;
  const t0 = ac.currentTime;
  for (let i = 0; i < count; i++) {
    alarmNodes.push(blip(ac, "square", freq, t0 + i * step, 0.11, 0.13));
  }
}

/** 处置 ACK：立即掐断仍在排的警报蜂鸣 */
export function stopAlarmBeep(): void {
  for (const osc of alarmNodes) {
    try {
      osc.stop();
    } catch {
      // 节点已自然结束, 忽略
    }
  }
  alarmNodes = [];
}

/** 警报处置确认：双短哔 */
export function playAckConfirm(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  blip(ac, "sine", 880, t0, 0.08, 0.14);
  blip(ac, "sine", 1174.66, t0 + 0.11, 0.1, 0.14);
}

/** 软着陆成功：上行四音钟鸣 */
export function playTouchdownChime(): void {
  const ac = activeCtx();
  if (!ac) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const t0 = ac.currentTime;
  notes.forEach((freq, i) => {
    blip(ac, "sine", freq, t0 + i * 0.16, 0.32, 0.16);
  });
}

/** 全球风暴生存倒计时：最后 10 秒每秒短哔（剩余 ≤3s 音调更高更急促） */
export function playStormCountdownTick(remainS: number): void {
  const ac = activeCtx();
  if (!ac) return;
  const urgent = remainS <= 3;
  blip(ac, "square", urgent ? 1568 : 1046.5, ac.currentTime, urgent ? 0.12 : 0.07, 0.1);
}

/** 风暴过境放晴：上行双音短钟鸣（呼应恢复播报） */
export function playStormClearingChime(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  blip(ac, "sine", 659.25, t0, 0.24, 0.13);
  blip(ac, "sine", 987.77, t0 + 0.18, 0.34, 0.13);
}

/** 全球风暴闪电：低频滚雷（两段超低 triangle 滚过 + 一记短促劈啪高频）
 *  near = 落点近（音调略高、滚程短）; far = 落点远（更低沉、滚程长） */
export function playStormThunder(near: boolean): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  blip(ac, "triangle", near ? 78 : 58, t0, near ? 0.7 : 0.95, 0.16);
  blip(ac, "triangle", near ? 52 : 42, t0 + 0.22, near ? 0.9 : 1.25, 0.13);
  blip(ac, "sine", near ? 120 : 88, t0 + 0.04, 0.3, 0.07);
}

/** 三星统帅庆典礼花：上行五音号角 + 两记低频定音鼓垫底 */
export function playTripleFanfare(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((freq, i) => {
    blip(ac, "triangle", freq, t0 + i * 0.13, 0.42, 0.14);
  });
  blip(ac, "sine", 130.81, t0, 0.9, 0.18);
  blip(ac, "sine", 196.0, t0 + 0.52, 0.8, 0.14);
}

/** 低电量警戒播报提示音：广播式双音两组（叮咚-叮咚），随状态灯 CAUTION 联动触发 */
export function playLowBattChime(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  blip(ac, "sine", 880.0, t0, 0.16, 0.12);
  blip(ac, "sine", 659.25, t0 + 0.18, 0.16, 0.12);
  blip(ac, "sine", 880.0, t0 + 0.4, 0.16, 0.12);
  blip(ac, "sine", 659.25, t0 + 0.58, 0.24, 0.12);
}

/** 极光观测窗口开启提示音：绿色常规为柔和上行双音; 红色罕见为神秘下行三音+低吟铺底（专属音效） */
export function playAuroraChime(rare: boolean): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  if (rare) {
    blip(ac, "sine", 987.77, t0, 0.5, 0.11);
    blip(ac, "sine", 783.99, t0 + 0.3, 0.5, 0.11);
    blip(ac, "sine", 587.33, t0 + 0.6, 0.8, 0.13);
    blip(ac, "triangle", 146.83, t0, 1.5, 0.1);
  } else {
    blip(ac, "sine", 659.25, t0, 0.34, 0.1);
    blip(ac, "sine", 880.0, t0 + 0.24, 0.44, 0.1);
  }
}

/** 巡视车喇叭：方波双音短鸣（嘀-嘀, 月面示意用） */
export function playRoverHorn(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  blip(ac, "square", 392.0, t0, 0.11, 0.07);
  blip(ac, "square", 523.25, t0 + 0.14, 0.13, 0.07);
}

/** 巡视车灯双闪：两记高频短嗒 */
export function playRoverFlash(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  blip(ac, "triangle", 1244.5, t0, 0.05, 0.06);
  blip(ac, "triangle", 1244.5, t0 + 0.16, 0.05, 0.06);
  blip(ac, "triangle", 1567.98, t0 + 0.32, 0.06, 0.06);
}

/** S 级矿点已对准确认音：轻柔上行双音「叮-✓」（引导线转蓝瞬间一次, 边沿触发防连响） */
export function playAlignConfirm(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  blip(ac, "sine", 880.0, t0, 0.09, 0.07);
  blip(ac, "sine", 1318.5, t0 + 0.1, 0.16, 0.08);
}

/** 锁定倒计时进度音阶：读秒每过 0.5s 一格（step 0-4）, 音调逐格升高——听声辨进度 */
export function playLockTick(step: number): void {
  const ac = activeCtx();
  if (!ac) return;
  const freqs = [659.25, 783.99, 880.0, 987.77, 1174.66];
  blip(ac, "sine", freqs[Math.max(0, Math.min(4, Math.floor(step)))], ac.currentTime, 0.05, 0.05);
}

/** 高精度快锁达成专属音：上行三音 + 最高八度闪烁尾音（比普通锁定的双短哔更华丽, 偏差 <3° 快锁才配） */
export function playPrecisionLock(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  blip(ac, "sine", 783.99, t0, 0.09, 0.09);
  blip(ac, "sine", 1046.5, t0 + 0.08, 0.09, 0.09);
  blip(ac, "sine", 1567.98, t0 + 0.16, 0.22, 0.1);
  blip(ac, "triangle", 2093.0, t0 + 0.2, 0.18, 0.04);
}

/** 转静音下行告别双音：音效关闭前最后一声（低八度滑落, 与恢复的上行确认音呼应）
 *  soft = 本次音效开启超过 1 分钟后的「轻告别」——音量减半、尾音拖长 + 弱回声余韵
 *  depth 0..1 = 余韵深浅（陪伴越久混响越深: 回声更响, >0.7 追加第三级最低音长尾） */
export function playMuteBye(soft = false, depth = 0.5): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const peak = soft ? 0.045 : 0.07;
  blip(ac, "sine", 659.25, t0, soft ? 0.16 : 0.1, peak);
  blip(ac, "sine", 440.0, t0 + (soft ? 0.18 : 0.12), soft ? 0.26 : 0.16, peak);
  if (soft) {
    // 余韵混响：两级递弱回声随 depth 变响, 像声音在空荡的值班厅里慢慢散掉
    const gain = 0.6 + Math.max(0, Math.min(1, depth)) * 0.8;
    blip(ac, "sine", 440.0, t0 + 0.34, 0.2, 0.022 * gain);
    blip(ac, "sine", 329.63, t0 + 0.52, 0.3, 0.014 * gain);
    if (depth > 0.7) {
      // 最深档第三级回声: 最低音拖长尾, 久久不散
      blip(ac, "sine", 261.63, t0 + 0.72, 0.42, 0.01);
    }
  }
}

/** 月面小音乐会彩蛋：喇叭 3 秒内连按 8 声触发——三首 8 音小旋律轮换（0 八音上行 / 1 欢乐颂 / 2 小星星） */
export function playRoverMelody(variant = 0): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const sets: number[][] = [
    [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5],
    [659.25, 659.25, 698.46, 783.99, 783.99, 698.46, 659.25, 587.33],
    [523.25, 523.25, 783.99, 783.99, 880.0, 880.0, 783.99, 698.46],
  ];
  const notes = sets[variant % 3];
  notes.forEach((f, i) => {
    blip(ac, "sine", f, t0 + i * 0.13, 0.16, 0.1);
  });
}

/* ================= 环境音（BGM）引擎：Web Audio 合成持续铺底, 零外部音频文件 =================
 * 飞行段 = 引擎底噪; 着陆后按天体切换专属音色（月球极静声呐 / 火星风噪 / 欧罗巴冰鸣 /
 * 金星闷雷 / 泰坦雾霭低嗡）。startAmbient 幂等: 同类型重复调用不重建节点。
 * 自动播放策略: 手势解锁前只记类型不出声, armAudioGesture 后自动补拉。 */

export type AmbientKind = "engine" | "moon" | "mars" | "europa" | "venus" | "titan";

interface AmbientProfile {
  filter: BiquadFilterType;
  freq: number;
  q: number;
  /** 噪声支路电平（相对 master） */
  noise: number;
  /** 持续低频 drone 振荡器（可选） */
  drone?: { type: OscillatorType; freq: number; level: number };
  /** 滤波频率慢摆 LFO（火星风噪用） */
  lfo?: { rate: number; depth: number };
  /** 偶发点缀音（声呐滴答 / 冰裂 ping / 气泡）: every = 随机间隔秒区间 */
  tick?: { freq: number; every: [number, number]; level: number; slide?: boolean };
  /** master 基础音量（乘 ambientVolume 缩放） */
  base: number;
}

const AMBIENT_PROFILES: Record<AmbientKind, AmbientProfile> = {
  engine: { filter: "lowpass", freq: 130, q: 0.8, noise: 0.5, drone: { type: "sawtooth", freq: 52, level: 0.16 }, base: 0.085 },
  moon: { filter: "lowpass", freq: 220, q: 0.7, noise: 0.16, base: 0.05, tick: { freq: 1244.5, every: [7, 13], level: 0.05 } },
  mars: { filter: "bandpass", freq: 420, q: 0.6, noise: 0.5, base: 0.06, lfo: { rate: 0.07, depth: 160 } },
  europa: { filter: "lowpass", freq: 260, q: 0.7, noise: 0.3, drone: { type: "sine", freq: 96, level: 0.1 }, base: 0.055, tick: { freq: 2489, every: [9, 15], level: 0.04 } },
  venus: { filter: "lowpass", freq: 95, q: 0.9, noise: 0.6, drone: { type: "sine", freq: 41, level: 0.22 }, base: 0.085 },
  titan: { filter: "lowpass", freq: 170, q: 0.8, noise: 0.4, drone: { type: "triangle", freq: 65, level: 0.14 }, base: 0.07, tick: { freq: 520, every: [8, 13], level: 0.035, slide: true } },
};

let ambientEnabled = true;
let ambientVolume = 0.5; // 0..1
let ambientKind: AmbientKind | null = null; // 期望播放的类型（静音/未解锁期间也记住）
let ambientNodes: { master: GainNode; sources: AudioScheduledSourceNode[]; timer: number | null } | null = null;
let noiseBuf: AudioBuffer | null = null;

function getNoiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    const len = Math.floor(ac.sampleRate * 2);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function ambientMasterTarget(): number {
  const profile = ambientKind ? AMBIENT_PROFILES[ambientKind] : null;
  if (!profile) return 0.0001;
  return Math.max(0.0002, profile.base * (0.3 + 0.7 * ambientVolume));
}

function stopAmbientNodes(): void {
  if (!ambientNodes) return;
  const { master, sources, timer } = ambientNodes;
  ambientNodes = null;
  if (timer !== null) window.clearTimeout(timer);
  const ac = audioCtx;
  if (ac) {
    try {
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(0.0001, ac.currentTime, 0.25);
    } catch {
      // 节点已断开, 忽略
    }
  }
  // 淡出后再停源（留 0.8s 尾音）
  window.setTimeout(() => {
    for (const src of sources) {
      try {
        src.stop();
      } catch {
        // 已停止, 忽略
      }
    }
    try {
      master.disconnect();
    } catch {
      // 已断开, 忽略
    }
  }, 800);
}

function scheduleAmbientTick(profile: AmbientProfile): number | null {
  const tick = profile.tick;
  if (!tick) return null;
  const [lo, hi] = tick.every;
  const delayMs = (lo + Math.random() * (hi - lo)) * 1000;
  return window.setTimeout(() => {
    if (!ambientNodes || muted || !ambientEnabled) return;
    const live = activeCtx();
    if (!live) return;
    const t0 = live.currentTime;
    const osc = live.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(tick.freq, t0);
    if (tick.slide) osc.frequency.exponentialRampToValueAtTime(tick.freq * 1.9, t0 + 0.14);
    const g = live.createGain();
    const peak = tick.level * (0.3 + 0.7 * ambientVolume);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (tick.slide ? 0.22 : 0.3));
    osc.connect(g);
    g.connect(live.destination);
    osc.start(t0);
    osc.stop(t0 + 0.35);
    releaseOnEnded(osc, g);
    // 递归排下一次点缀音
    if (ambientNodes) ambientNodes.timer = scheduleAmbientTick(profile);
  }, delayMs);
}

/** 按当前 ambientKind / 开关 / 静音态重建环境音节点（幂等: 已在播同类型则不动） */
function applyAmbient(): void {
  if (!ambientEnabled || muted || !ambientKind || !gestureArmed || !audioCtx) return;
  if (ambientNodes) return; // 同类型已在播
  const ac = audioCtx;
  if (ac.state === "suspended") void ac.resume();
  const kind = ambientKind;
  const profile = AMBIENT_PROFILES[kind];
  const t0 = ac.currentTime;

  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(ambientMasterTarget(), t0 + 1.6);
  master.connect(ac.destination);

  const sources: AudioScheduledSourceNode[] = [];

  // 噪声支路: 循环白噪声过滤波
  const noise = ac.createBufferSource();
  noise.buffer = getNoiseBuffer(ac);
  noise.loop = true;
  const filter = ac.createBiquadFilter();
  filter.type = profile.filter;
  filter.frequency.setValueAtTime(profile.freq, t0);
  filter.Q.value = profile.q;
  const noiseGain = ac.createGain();
  noiseGain.gain.value = profile.noise;
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(t0);
  sources.push(noise);

  // LFO 慢摆滤波频率（风噪呼吸感）
  if (profile.lfo) {
    const lfo = ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = profile.lfo.rate;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = profile.lfo.depth;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(t0);
    sources.push(lfo);
  }

  // 低频 drone 支路
  if (profile.drone) {
    const drone = ac.createOscillator();
    drone.type = profile.drone.type;
    drone.frequency.value = profile.drone.freq;
    const dg = ac.createGain();
    dg.gain.value = profile.drone.level;
    drone.connect(dg);
    dg.connect(master);
    drone.start(t0);
    sources.push(drone);
  }

  ambientNodes = { master, sources, timer: null };
  if (profile.tick) ambientNodes.timer = scheduleAmbientTick(profile);
}

/** 启动/切换环境音（幂等; 手势未解锁或静音时只记类型, 解锁后自动补拉） */
export function startAmbient(kind: AmbientKind): void {
  if (ambientKind === kind && ambientNodes) return;
  const changed = ambientKind !== kind;
  ambientKind = kind;
  if (changed) stopAmbientNodes();
  applyAmbient();
}

/** 停止环境音（切任务 / 回放 / 关闭 BGM 时调用; 清空期望类型） */
export function stopAmbient(): void {
  ambientKind = null;
  stopAmbientNodes();
}

/** 临时挂起环境音与阶段音乐（页签隐藏）: 保留期望类型, resumeAmbient 时续播 */
export function pauseAmbient(): void {
  stopAmbientNodes();
  stopMusicNodes();
}

/** 恢复环境音与阶段音乐（页签回到前台） */
export function resumeAmbient(): void {
  applyAmbient();
  applyMusic();
}

/** BGM 开关（环境音 + 阶段音乐; 关闭立即停, 打开按期望类型续播） */
export function setAmbientEnabled(value: boolean): void {
  ambientEnabled = value;
  if (!value) {
    stopAmbientNodes();
    stopMusicNodes();
  } else {
    applyAmbient();
    applyMusic();
  }
}

/** BGM 音量 0..1（独立于音效主增益, 实时更新在播节点; 阶段音乐共用同一音量） */
export function setAmbientVolume(value: number): void {
  ambientVolume = Math.max(0, Math.min(1, value));
  if (audioCtx) {
    if (ambientNodes) ambientNodes.master.gain.setTargetAtTime(ambientMasterTarget(), audioCtx.currentTime, 0.15);
    if (musicNodes) musicNodes.master.gain.setTargetAtTime(musicMasterTarget(), audioCtx.currentTime, 0.15);
  }
}

/* ================= 阶段音乐引擎：每个飞行阶段一段独立生成式 BGM（Web Audio 合成, 零外部音频文件） =================
 * standby 神秘慢板 / liftoff 驱动快板 / separation 机械律动 / transfer 辽阔行板 /
 * braking 紧张脉冲 / descent 读秒专注 / touchdown 温暖颂歌 / landed 宁静淡板。
 * 每小节按和弦进行排 pad + 贝斯 + 琶音 + 打击四层, 递归 setTimeout 逐小节生成。
 * startPhaseMusic 幂等: 同阶段重复调用不重建; 切阶段旧乐 0.6s 淡出、新乐淡入交叉。
 * 与环境音共用 BGM 开关 / 音量 / 静音态; 手势解锁前只记阶段不出声。 */

export type MusicPhase =
  | "standby"
  | "liftoff"
  | "separation"
  | "transfer"
  | "braking"
  | "descent"
  | "touchdown"
  | "landed"
  | "landed_moon"
  | "landed_mars"
  | "landed_europa"
  | "landed_venus"
  | "landed_titan"
  | "ops"
  | "hazard"
  | "manual"
  | "daily";

interface MusicProfile {
  bpm: number;
  /** 主音频率 Hz */
  root: number;
  /** 音阶半音偏移表 */
  scale: number[];
  /** 和弦进行: 每项 = 和弦根的音阶级数, 每小节换一次 */
  chords: number[];
  /** 垫底长音三和弦（慢起音, 跨小节延留） */
  pad: { type: OscillatorType; level: number };
  /** 低音层: 八分音符图案触发（x=奏, .=休） */
  bass?: { type: OscillatorType; level: number; pattern: string };
  /** 琶音层: 每 every 个八分音符奏一音, 度数按和弦循环 */
  arp?: { type: OscillatorType; level: number; octave: number; every: number };
  /** 打击层: 高通噪声短击图案 */
  perc?: { level: number; pattern: string };
  /** master 基础音量 */
  base: number;
}

const MUSIC_MINOR = [0, 2, 3, 5, 7, 8, 10];
const MUSIC_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MUSIC_PENTA = [0, 2, 4, 7, 9];
const MUSIC_DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MUSIC_PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

const MUSIC_PROFILES: Record<MusicPhase, MusicProfile> = {
  // 待发射：低频慢速神秘——稀疏 sine 垫 + 每小节一记远钟式单音, 倒计时前的屏息感
  standby: {
    bpm: 56, root: 110, scale: MUSIC_MINOR, chords: [0, 5, 3, 4],
    pad: { type: "sine", level: 0.05 },
    arp: { type: "triangle", level: 0.035, octave: 3, every: 8 },
    base: 0.8,
  },
  // 点火起飞：快速驱动——锯齿贝斯连击 + 军鼓式噪声 + 明亮琶音, 推力全开的压迫感
  liftoff: {
    bpm: 150, root: 98, scale: MUSIC_MINOR, chords: [0, 0, 3, 5],
    pad: { type: "triangle", level: 0.03 },
    bass: { type: "sawtooth", level: 0.08, pattern: "x.xx.x.." },
    arp: { type: "triangle", level: 0.045, octave: 2, every: 2 },
    perc: { level: 0.055, pattern: "x..x..x." },
    base: 0.9,
  },
  // 级段分离：机械律动——干脆断奏 + 方波点缀, 火工品起爆的金属节奏感
  separation: {
    bpm: 126, root: 110, scale: MUSIC_MINOR, chords: [0, 3, 5, 4],
    pad: { type: "triangle", level: 0.025 },
    bass: { type: "triangle", level: 0.07, pattern: "x..x..x." },
    arp: { type: "square", level: 0.026, octave: 2, every: 4 },
    perc: { level: 0.05, pattern: "..x...x." },
    base: 0.85,
  },
  // 转移轨道：辽阔平稳大调——暖 pad + 慢琶音, 太阳翼展开后的星际巡航感
  transfer: {
    bpm: 72, root: 130.81, scale: MUSIC_MAJOR, chords: [0, 3, 4, 0],
    pad: { type: "triangle", level: 0.05 },
    bass: { type: "sine", level: 0.05, pattern: "x......." },
    arp: { type: "sine", level: 0.04, octave: 2, every: 4 },
    base: 0.8,
  },
  // 制动点火：紧张脉冲——低音逐步紧逼 + 稳定底鼓, 捕获窗口逼近的压迫感
  braking: {
    bpm: 104, root: 87.31, scale: MUSIC_MINOR, chords: [0, 0, 5, 4],
    pad: { type: "triangle", level: 0.025 },
    bass: { type: "sawtooth", level: 0.075, pattern: "x.x.x.x." },
    arp: { type: "triangle", level: 0.04, octave: 2, every: 2 },
    perc: { level: 0.055, pattern: "x...x..." },
    base: 0.9,
  },
  // 动力下降：读秒专注——均匀打击像倒计时读数 + 高音区快速琶音, 悬停找点的专注感
  descent: {
    bpm: 116, root: 98, scale: MUSIC_MINOR, chords: [0, 4, 0, 3],
    pad: { type: "triangle", level: 0.025 },
    bass: { type: "triangle", level: 0.065, pattern: "x.xxx.x." },
    arp: { type: "triangle", level: 0.032, octave: 3, every: 2 },
    perc: { level: 0.05, pattern: "x.x.x.x." },
    base: 0.85,
  },
  // 触地瞬间：温暖颂歌——大调慢板铺满 + 明亮琶音上扬, 着陆灯亮起的释然感
  touchdown: {
    bpm: 84, root: 130.81, scale: MUSIC_MAJOR, chords: [0, 3, 4, 0],
    pad: { type: "triangle", level: 0.055 },
    bass: { type: "sine", level: 0.065, pattern: "x......." },
    arp: { type: "triangle", level: 0.05, octave: 2, every: 2 },
    base: 0.85,
  },
  // 着陆后（通用兜底）：宁静淡板——五声音阶 + 极疏点缀
  landed: {
    bpm: 60, root: 146.83, scale: MUSIC_PENTA, chords: [0, 3, 1, 2],
    pad: { type: "sine", level: 0.045 },
    arp: { type: "triangle", level: 0.03, octave: 3, every: 8 },
    base: 0.6,
  },
  // 月面：极寂前奏——比通用更慢更空, 高音区远钟呼应月夜死寂
  landed_moon: {
    bpm: 52, root: 110, scale: MUSIC_MINOR, chords: [0, 5, 3, 0],
    pad: { type: "sine", level: 0.04 },
    arp: { type: "triangle", level: 0.026, octave: 3, every: 8 },
    base: 0.55,
  },
  // 火面：荒凉多利亚——中速空旷, 稀疏低音像远方峡谷回声
  landed_mars: {
    bpm: 64, root: 98, scale: MUSIC_DORIAN, chords: [0, 3, 0, 4],
    pad: { type: "triangle", level: 0.045 },
    bass: { type: "sine", level: 0.05, pattern: "x......." },
    arp: { type: "sine", level: 0.03, octave: 2, every: 4 },
    base: 0.6,
  },
  // 冰面：晶莹微光——大调慢板, 三角波高音琶音像冰晶折射
  landed_europa: {
    bpm: 58, root: 146.83, scale: MUSIC_MAJOR, chords: [0, 2, 3, 0],
    pad: { type: "sine", level: 0.04 },
    arp: { type: "triangle", level: 0.028, octave: 3, every: 4 },
    base: 0.55,
  },
  // 金星：压迫低鸣——极慢小调 + 锯齿低音, 462°C 高压表面的窒息感
  landed_venus: {
    bpm: 48, root: 82.41, scale: MUSIC_MINOR, chords: [0, 0, 4, 0],
    pad: { type: "sine", level: 0.055 },
    bass: { type: "sawtooth", level: 0.045, pattern: "x......." },
    base: 0.6,
  },
  // 泰坦：雾霭梦境——低音五声朦胧铺底, 像橙色雾霾里透出的微光
  landed_titan: {
    bpm: 54, root: 87.31, scale: MUSIC_PENTA, chords: [0, 3, 1, 2],
    pad: { type: "triangle", level: 0.05 },
    arp: { type: "sine", level: 0.028, octave: 3, every: 8 },
    base: 0.55,
  },
  // 采样作业：轻机械律动——机械臂展开/行驶/拉力作业时的工作循环配乐,
  // 多利亚调式 + 轻打击像钻头节拍, 作业结束自动淡回天体专属配乐
  ops: {
    bpm: 96, root: 110, scale: MUSIC_DORIAN, chords: [0, 0, 3, 4],
    pad: { type: "triangle", level: 0.02 },
    bass: { type: "triangle", level: 0.06, pattern: "x..x..x." },
    arp: { type: "triangle", level: 0.032, octave: 2, every: 4 },
    perc: { level: 0.04, pattern: "..x...x." },
    base: 0.7,
  },
  // 危险天象（沙尘暴/酸雾/陨石雨/喷发/浓雾进行中）：弗里吉亚不谐急板——
  // 小二度压迫 + gallop 低音 + 连续打击, 天体发怒时的紧张声场
  hazard: {
    bpm: 132, root: 98, scale: MUSIC_PHRYGIAN, chords: [0, 0, 1, 0],
    pad: { type: "triangle", level: 0.025 },
    bass: { type: "sawtooth", level: 0.08, pattern: "x.xxx.xx" },
    arp: { type: "triangle", level: 0.04, octave: 2, every: 2 },
    perc: { level: 0.055, pattern: "x.x.x.x." },
    base: 0.9,
  },
  // 手动着陆挑战：读秒滴答——连续八分打击像倒计时读数, 悬屏找点的屏息感
  manual: {
    bpm: 120, root: 87.31, scale: MUSIC_MINOR, chords: [0, 4, 0, 3],
    pad: { type: "triangle", level: 0.02 },
    bass: { type: "triangle", level: 0.065, pattern: "x..x..x." },
    arp: { type: "triangle", level: 0.035, octave: 3, every: 2 },
    perc: { level: 0.045, pattern: "xxxxxxxx" },
    base: 0.85,
  },
  // 每日挑战飞行段：冲刺固定音型——多利亚调式驱动 ostinato, 限时刷分的紧迫感
  daily: {
    bpm: 132, root: 110, scale: MUSIC_DORIAN, chords: [0, 3, 0, 4],
    pad: { type: "triangle", level: 0.025 },
    bass: { type: "sawtooth", level: 0.075, pattern: "x.x.xx.x" },
    arp: { type: "square", level: 0.026, octave: 2, every: 2 },
    perc: { level: 0.05, pattern: "x..x..x." },
    base: 0.85,
  },
};

let musicPhase: MusicPhase | null = null; // 期望播放的阶段（静音/未解锁期间也记住）
let musicNodes: { master: GainNode; barTimer: number | null; bar: number } | null = null;

function musicMasterTarget(): number {
  const profile = musicPhase ? MUSIC_PROFILES[musicPhase] : null;
  if (!profile) return 0.0001;
  return Math.max(0.0002, profile.base * (0.3 + 0.7 * ambientVolume));
}

/** 音阶取音: degree 可越界（自动折八度） */
function noteFreq(root: number, scale: number[], degree: number, octave = 0): number {
  const n = scale.length;
  const i = ((degree % n) + n) % n;
  const oct = octave + Math.floor(degree / n);
  return root * Math.pow(2, scale[i] / 12 + oct);
}

/** 排一个包络单音到目标增益（振荡器自停, 不进 sources 清单） */
function musicNote(
  ac: AudioContext,
  dest: AudioNode,
  type: OscillatorType,
  freq: number,
  t0: number,
  dur: number,
  peak: number,
  attack = 0.02,
): void {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  releaseOnEnded(osc, g);
}

/** 排一记高通噪声短击（打击层） */
function musicPerc(ac: AudioContext, dest: AudioNode, t0: number, level: number): void {
  const src = ac.createBufferSource();
  src.buffer = getNoiseBuffer(ac);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(level, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + 0.12);
  releaseOnEnded(src, hp, g);
}

/** 递归排下一小节：pad 三和弦 + 低音/琶音/打击按八分图案触发, 小节号推进和弦进行 */
function scheduleMusicBar(): void {
  const nodes = musicNodes;
  const phase = musicPhase;
  if (!nodes || !phase) return;
  const ac = audioCtx;
  if (!ac || muted || !ambientEnabled) return;
  const profile = MUSIC_PROFILES[phase];
  const eighth = 60 / profile.bpm / 2;
  const barDur = eighth * 8;
  const t0 = ac.currentTime + 0.08; // 小步前瞻, 避免贴边抖动
  const chordDeg = profile.chords[nodes.bar % profile.chords.length];

  // 垫底三和弦：慢起音、跨小节延留, 三音微错峰更自然
  [0, 2, 4].forEach((off, i) => {
    musicNote(
      ac, nodes.master, profile.pad.type,
      noteFreq(profile.root, profile.scale, chordDeg + off, 1),
      t0 + i * 0.03, barDur * 1.4, profile.pad.level, 0.5,
    );
  });

  for (let s = 0; s < 8; s++) {
    const t = t0 + s * eighth;
    if (profile.bass && profile.bass.pattern[s % profile.bass.pattern.length] === "x") {
      musicNote(ac, nodes.master, profile.bass.type, noteFreq(profile.root, profile.scale, chordDeg, 0), t, eighth * 1.6, profile.bass.level, 0.015);
    }
    if (profile.arp && s % profile.arp.every === 0) {
      // 琶音度数在和弦上三度音间循环, 全局步进保证跨小节连续
      const step = Math.floor((nodes.bar * 8 + s) / profile.arp.every);
      const deg = chordDeg + [0, 2, 4, 2][step % 4];
      musicNote(ac, nodes.master, profile.arp.type, noteFreq(profile.root, profile.scale, deg, profile.arp.octave), t, eighth * 1.8, profile.arp.level, 0.01);
    }
    if (profile.perc && profile.perc.pattern[s % profile.perc.pattern.length] === "x") {
      musicPerc(ac, nodes.master, t, profile.perc.level);
    }
  }
  nodes.bar += 1;
  nodes.barTimer = window.setTimeout(scheduleMusicBar, barDur * 1000);
}

function stopMusicNodes(): void {
  if (!musicNodes) return;
  const { master, barTimer } = musicNodes;
  musicNodes = null;
  if (barTimer !== null) window.clearTimeout(barTimer);
  const ac = audioCtx;
  if (ac) {
    try {
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(0.0001, ac.currentTime, 0.2);
    } catch {
      // 节点已断开, 忽略
    }
  }
  // 淡出后断开 master（已排出的小节尾音自然收掉）
  window.setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      // 已断开, 忽略
    }
  }, 900);
}

/** 按当前 musicPhase / 开关 / 静音态重建音乐节点（幂等: 同阶段已在播则不动） */
function applyMusic(): void {
  if (!ambientEnabled || muted || !musicPhase || !gestureArmed || !audioCtx) return;
  if (musicNodes) return;
  const ac = audioCtx;
  if (ac.state === "suspended") void ac.resume();
  const t0 = ac.currentTime;
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(musicMasterTarget(), t0 + 1.2);
  master.connect(ac.destination);
  musicNodes = { master, barTimer: null, bar: 0 };
  scheduleMusicBar();
}

/** 启动/切换阶段音乐（幂等; 手势未解锁或静音时只记阶段, 解锁后自动补拉） */
export function startPhaseMusic(phase: MusicPhase): void {
  if (musicPhase === phase && musicNodes) return;
  const changed = musicPhase !== phase;
  musicPhase = phase;
  if (changed) stopMusicNodes();
  applyMusic();
}

/** 停止阶段音乐（回放 / 任务结束 / 卸载时调用; 清空期望阶段） */
export function stopPhaseMusic(): void {
  musicPhase = null;
  stopMusicNodes();
}

/** 配乐名目（试听面板消费）: 全部循环曲目按场景分组, 名称/描述为产品语言 */
export interface MusicTrackMeta {
  key: MusicPhase;
  group: "飞行阶段" | "天体着陆" | "情景配乐";
  name: string;
  desc: string;
}

export const MUSIC_TRACKS: MusicTrackMeta[] = [
  { key: "standby", group: "飞行阶段", name: "待发射 · 神秘慢板", desc: "56 拍 · 稀疏铺底与远钟, 倒计时前的屏息" },
  { key: "liftoff", group: "飞行阶段", name: "点火起飞 · 驱动快板", desc: "150 拍 · 锯齿贝斯连击 + 军鼓, 推力全开" },
  { key: "separation", group: "飞行阶段", name: "级段分离 · 机械律动", desc: "126 拍 · 干脆断奏 + 方波点缀, 金属节奏" },
  { key: "transfer", group: "飞行阶段", name: "转移轨道 · 辽阔行板", desc: "72 拍 · 大调暖垫 + 慢琶音, 星际巡航" },
  { key: "braking", group: "飞行阶段", name: "制动点火 · 紧张脉冲", desc: "104 拍 · 低音紧逼 + 底鼓, 捕获窗口逼近" },
  { key: "descent", group: "飞行阶段", name: "动力下降 · 读秒专注", desc: "116 拍 · 均匀打击如读数 + 高音琶音" },
  { key: "touchdown", group: "飞行阶段", name: "触地瞬间 · 温暖颂歌", desc: "84 拍 · 大调慢板铺满, 着陆灯亮起" },
  { key: "landed_moon", group: "天体着陆", name: "月面 · 极寂前奏", desc: "52 拍 · 小调远钟, 月夜死寂" },
  { key: "landed_mars", group: "天体着陆", name: "火面 · 荒凉多利亚", desc: "64 拍 · 空旷中速, 低音如峡谷回声" },
  { key: "landed_europa", group: "天体着陆", name: "冰面 · 晶莹微光", desc: "58 拍 · 大调高音琶音, 冰晶折射" },
  { key: "landed_venus", group: "天体着陆", name: "金星 · 压迫低鸣", desc: "48 拍 · 极慢小调 + 锯齿低音, 高压窒息" },
  { key: "landed_titan", group: "天体着陆", name: "泰坦 · 雾霭梦境", desc: "54 拍 · 低音五声朦胧, 橙雾透光" },
  { key: "ops", group: "情景配乐", name: "采样作业 · 工作律动", desc: "96 拍 · 轻机械节奏, 打击像钻头起落" },
  { key: "hazard", group: "情景配乐", name: "危险天象 · 不谐急板", desc: "132 拍 · 弗里吉亚小二度压迫 + gallop 低音" },
  { key: "manual", group: "情景配乐", name: "手动着陆 · 读秒滴答", desc: "120 拍 · 连续八分打击, 悬屏找点" },
  { key: "daily", group: "情景配乐", name: "每日挑战 · 冲刺音型", desc: "132 拍 · 多利亚固定音型, 限时紧迫" },
];

/* ================= 泰坦浓雾 / 结算战报专属音效 ================= */

/** 甲烷浓雾逼近：1.4s 下行滤波噪声呼啸 + 低频压迫感铺垫 */
export function playFogRollIn(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const dur = 1.4;
  const src = ac.createBufferSource();
  src.buffer = getNoiseBuffer(ac);
  src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(900, t0);
  bp.frequency.exponentialRampToValueAtTime(180, t0 + dur);
  bp.Q.value = 0.8;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
  releaseOnEnded(src, bp, g);
  blip(ac, "triangle", 58, t0 + 0.2, 1.1, 0.1);
}

/** 甲烷浓雾消散：柔和上行双音（能见度回升的松弛感） */
export function playFogClear(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  blip(ac, "sine", 392, t0, 0.3, 0.1);
  blip(ac, "sine", 587.33, t0 + 0.22, 0.4, 0.1);
}

/** 战报打开：短促上扬 whoosh */
export function playDebriefWhoosh(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const dur = 0.38;
  const src = ac.createBufferSource();
  src.buffer = getNoiseBuffer(ac);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(400, t0);
  hp.frequency.exponentialRampToValueAtTime(2600, t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(hp);
  hp.connect(g);
  g.connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
  releaseOnEnded(src, hp, g);
}

/** 阶段迁跃过场：长 whoosh 扫频 + 正弦上行滑音 + 深空回声尾（延迟反馈, 约 1.5s 余韵） */
export function playWarpJump(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const dur = 0.9;
  // 回声送声：0.28s 延迟 + 0.32 反馈 + 低通衰减, 尾音像跃迁走廊里的多次折射
  const delay = ac.createDelay(1.2);
  delay.delayTime.value = 0.28;
  const fb = ac.createGain();
  fb.gain.value = 0.32;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  const wet = ac.createGain();
  wet.gain.value = 0.45;
  delay.connect(lp);
  lp.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(ac.destination);
  // 噪声 whoosh：带通自低频扫上高频再回落
  const src = ac.createBufferSource();
  src.buffer = getNoiseBuffer(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(220, t0);
  bp.frequency.exponentialRampToValueAtTime(3400, t0 + dur * 0.75);
  bp.frequency.exponentialRampToValueAtTime(900, t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  g.connect(delay); // 干声同时送回声链
  src.start(t0);
  src.stop(t0 + dur + 0.05);
  releaseOnEnded(src, bp, g);
  // 正弦上行滑音：低频推向高频, 与 whoosh 叠出跃迁感
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(110, t0);
  osc.frequency.exponentialRampToValueAtTime(880, t0 + dur * 0.8);
  const og = ac.createGain();
  og.gain.setValueAtTime(0.0001, t0);
  og.gain.exponentialRampToValueAtTime(0.06, t0 + 0.25);
  og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(og);
  og.connect(ac.destination);
  og.connect(delay); // 滑音也带回声
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  releaseOnEnded(osc, og);
  // 回声链在尾音自然衰减后断开（反馈 0.32, 约 2s 后已不可闻）
  window.setTimeout(() => {
    for (const n of [delay, lp, fb, wet]) {
      try {
        n.disconnect();
      } catch {
        // 已断开, 忽略
      }
    }
  }, 3000);
}

/** 结算凯旋号角（约 3.2s）：上行大调琶音号角 + 定音鼓式低击 + 长延主和弦 + 高音闪烁尾,
 *  结算单打开时在 whoosh 之后错拍奏响（一次性演出, 不循环） */
export function playVictoryFanfare(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  // 上行琶音号角：C-E-G-C-E 三角波, 明亮号角感
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((f, i) => blip(ac, "triangle", f, t0 + i * 0.11, 0.3, 0.08));
  // 定音鼓式低击：下坠正弦夯底
  const tim = ac.createOscillator();
  tim.type = "sine";
  tim.frequency.setValueAtTime(130.81, t0 + 0.4);
  tim.frequency.exponentialRampToValueAtTime(65.41, t0 + 0.9);
  const tg = ac.createGain();
  tg.gain.setValueAtTime(0.0001, t0 + 0.4);
  tg.gain.exponentialRampToValueAtTime(0.12, t0 + 0.44);
  tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
  tim.connect(tg);
  tg.connect(ac.destination);
  tim.start(t0 + 0.4);
  tim.stop(t0 + 1.25);
  releaseOnEnded(tim, tg);
  // 长延主和弦：C 大三和弦 + 双八度, 慢起慢落约 2.2s
  [261.63, 329.63, 392.0, 523.25].forEach((f, i) => {
    const osc = ac.createOscillator();
    osc.type = i === 3 ? "triangle" : "sine";
    osc.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0 + 0.42);
    g.gain.exponentialRampToValueAtTime(0.068, t0 + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.7);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0 + 0.42);
    osc.stop(t0 + 2.85);
    releaseOnEnded(osc, g);
  });
  // 高音闪烁尾：凯旋余韵
  blip(ac, "sine", 1567.98, t0 + 0.95, 0.5, 0.045);
  blip(ac, "sine", 2093.0, t0 + 1.12, 0.7, 0.035);
}

/** 刷新历史最佳：明亮双叮（高音区确认感） */
export function playRecordDing(): void {  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  blip(ac, "sine", 1318.5, t0, 0.16, 0.12);
  blip(ac, "sine", 1760, t0 + 0.14, 0.3, 0.12);
}

/** S 级评级金光音：快速上行四音闪烁琶音 */
export function playGradeSShine(): void {
  const ac = activeCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const notes = [1046.5, 1318.5, 1567.98, 2093.0];
  notes.forEach((f, i) => {
    blip(ac, "sine", f, t0 + i * 0.09, 0.26, 0.09);
  });
}
