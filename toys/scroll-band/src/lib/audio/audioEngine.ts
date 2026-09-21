// 滚动乐团 · 浏览器内实时合成引擎
// 音阶量化旋律（6 套音阶 · 5 种音色，见 scales.ts）+ 噪声/正弦鼓组，主总线限制器保护，lookahead 排程回放。
// 音色只分发到旋律振荡器构建路径，包络与主总线限制器路径全部保持不变。

import {
  DEFAULT_DRUMKIT_ID,
  DEFAULT_SCALE_ID,
  DEFAULT_VOICE_ID,
  drumKitById,
  scaleById,
  scaleFreq,
  voiceById,
  type Scale,
} from "@/lib/audio/scales";
import { PIANO_C3_MIDI, PIANO_KEYS, midiFreq } from "@/lib/audio/pianoMap";
import { DEFAULT_SYNTH_PATCH, type SynthPatch } from "@/lib/audio/synthPatch";
import type { LoopSpec } from "@/lib/canvas/scoreCanvas";

// ---- 钢琴延音踏板常量：15% 延音电平 / 最长约12s 封顶 / 松开时间常数约0.42s / 回放等效长尾约5s ----
const PIANO_SUSTAIN_RATIO = 0.15;
const PIANO_MAX_SUSTAIN = 12;
const PIANO_RELEASE_TAU = 0.42;
const PIANO_LONG_TAIL = 5.0;

// ---- 弱音器踏板（una corda）常量：专用钢琴总线整体降至约40%增益、低通压暗至约900Hz；放开态 1 / 18kHz ≈ 透明 ----
const PIANO_SOFT_GAIN = 0.4;
const PIANO_SOFT_CUTOFF = 900;
const PIANO_BUS_OPEN_CUTOFF = 18000;

// 延音踏板登记的琴音 voice（含 gain 节点与 stop 计划），osc 自然结束时自动移除
interface PianoVoice {
  semi: number; // 同键去重用：C3 起半音偏移
  g: GainNode;
  oscs: OscillatorNode[];
  peak: number; // 原始峰值（换算 15% 延音电平）
  sustained: boolean; // 是否已挂在延音电平（踩下中收集）
  releasing: boolean; // 是否已进入统一收束
}

// 取消在途衰减并保持当前值：优先 cancelAndHoldAtTime，老浏览器回落 cancel+setValueAtTime 快照
function holdParam(p: AudioParam, t: number): void {
  if (typeof p.cancelAndHoldAtTime === "function") {
    p.cancelAndHoldAtTime(t);
    return;
  }
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
}

// 自造音色（简化合成器）单声部句柄：playNote 一次性发声与持续音共用同一构建器，
// start 排包络、release 触发放音/滤波收尾、stopAll 统一收振荡器（含 LFO，不留泄漏）
interface SynthVoice {
  o1: OscillatorNode;
  o2: OscillatorNode;
  amp: GainNode;
  filter: BiquadFilterNode;
  octMul: number; // 补丁八度偏移倍率：updateSustain 改频率时同乘
  start(t: number): void;
  release(t: number): void;
  stopAll(t: number): void;
}

// 自造音色专用效果总线：customIn →[失真]→ j1 →[合唱]→ j2 →[延迟]→ j3 →[混响]→ customOut → master。
// 每级 dry/wet 并联，mix=0 整级旁通（重接线省 CPU）；预设音色不挂此链，主总线限制器仍唯一
interface CustomFx {
  in: GainNode;
  j1: GainNode;
  j2: GainNode;
  j3: GainNode;
  out: GainNode;
  shaper: WaveShaperNode;
  distDry: GainNode;
  distWet: GainNode;
  chorDelay: DelayNode;
  chorDry: GainNode;
  chorWet: GainNode;
  chorLfo: OscillatorNode;
  chorLfoAmt: GainNode;
  dlyNode: DelayNode;
  dlyFb: GainNode;
  dlyDry: GainNode;
  dlyWet: GainNode;
  conv: ConvolverNode;
  revDry: GainNode;
  revWet: GainNode;
}

export type DrumKind = "kick" | "snare" | "hat" | "click";

export const DRUM_KINDS: DrumKind[] = ["kick", "snare", "hat", "click"];

/** 非有限值兜底：发声入参的上游有导入链接解码 / AI 动作 / 本地旧缓存等多条路，
 *  NaN 一旦写进 AudioParam 会直接抛 non-finite TypeError 打断整个调度循环，
 *  全部在引擎边界统一回落，不让任何脏数据把声音链路炸掉 */
function fin(v: number | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function cutoffFromIdx(c: number): number {
  const k = Math.min(15, Math.max(0, fin(c, 8)));
  return 200 * Math.pow(60, k / 15); // 200Hz ~ 12000Hz
}

function voiceOscPair(voice: string): [OscillatorType, OscillatorType] {
  if (voice === "chip") return ["square", "square"];
  if (voice === "lead") return ["sawtooth", "sawtooth"];
  if (voice === "pluck") return ["triangle", "triangle"];
  if (voice === "bell") return ["sine", "sine"];
  if (voice === "bass") return ["sine", "sawtooth"]; // 基体肥厚 + 高八度锯齿给颗粒
  if (voice === "guitar") return ["sawtooth", "triangle"]; // 双源拨扫味
  if (voice === "strings") return ["triangle", "triangle"]; // 慢起音长弓
  return ["sine", "triangle"]; // glass（默认）
}

// 画布参数曲线自动化：一条曲线 = 某参数在循环时间轴上的覆盖段 + 采样点（时间域，引擎无 BPM 概念）
export interface AutoCurve {
  param: "vol" | "cutoff" | "pan" | "reverb";
  t0: number; // 覆盖段起点（循环相对秒）
  t1: number; // 覆盖段终点
  pts: { t: number; v: number }[]; // 按 t 升序；v 0..1
}

// 曲线自动化中性值（覆盖段之外 / 首条曲线出现前）
const AUTO_NEUTRAL: Record<AutoCurve["param"], number> = {
  vol: 1,
  cutoff: 1, // 1 → 18kHz 全开
  pan: 0.5, // → 0 居中
  reverb: 0, // 不叠加，发送 = HUD 基准
};

// 单条曲线求值：端点间线性插值；端点外取最近端点值（调用方已按 t0..t1 判定覆盖）
function evalAutoCurve(c: AutoCurve, songT: number): number {
  const pts = c.pts;
  if (pts.length === 0) return AUTO_NEUTRAL[c.param];
  if (songT <= pts[0].t) return pts[0].v;
  const last = pts[pts.length - 1];
  if (songT >= last.t) return last.v;
  for (let i = 1; i < pts.length; i += 1) {
    if (songT <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      const span = b.t - a.t;
      return span <= 1e-6 ? b.v : a.v + ((b.v - a.v) * (songT - a.t)) / span;
    }
  }
  return last.v;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lim: DynamicsCompressorNode | null = null; // 主总线限制器（reduction 供 AI 总线过载建议只读）
  private delayWet: GainNode | null = null;
  private revWet: GainNode | null = null;
  // ---- 画布自动化链（只有画布循环音/画布锚点走，且仅当画布上存在曲线时才接进总线）----
  // canvasBus(Gain 音量) → canvasFilter(lowpass 滤波) → canvasPan(StereoPanner 声像) → master
  //                                  canvasBus → canvasRevSend(混响发送) → 既有混响 conv
  private canvasBus: GainNode | null = null;
  private canvasFilter: BiquadFilterNode | null = null;
  private canvasPanNode: StereoPannerNode | null = null;
  private canvasRevWet: GainNode | null = null; // 曲线混响加料专用 wet（HUD 基准由 master 全局链负责）
  private autoCurves: AutoCurve[] = [];
  private autoPeriod = 0; // 全局循环时间轴长度（秒）
  private canvasSongBase = 0; // songTime 锚点（ctx 时基）
  private noise: AudioBuffer | null = null;
  private tapNode: MediaStreamAudioDestinationNode | null = null;
  private scale: Scale = scaleById(DEFAULT_SCALE_ID);
  private voiceId = DEFAULT_VOICE_ID;
  private drumKitId = DEFAULT_DRUMKIT_ID;
  private sust: {
    o1: OscillatorNode;
    o2: OscillatorNode;
    g: GainNode;
    f: BiquadFilterNode;
    synth?: SynthVoice; // 自造音色持续音：收尾走 release/stopAll 而不是预设的两振荡器收束
  } | null = null;
  // 自造音色（voiceId === "custom"）：补丁参数 + 专用效果总线（首次 custom 发声才建）
  private synthPatch: SynthPatch = { ...DEFAULT_SYNTH_PATCH };
  private cfx: CustomFx | null = null;
  private lastRevSize = 0;
  private lastDrive = -1;
  private fxMixKey = "";
  private seqTimer: number | null = null;
  private canvasTimer: number | null = null;
  private canvasSpecs: LoopSpec[] = [];
  private canvasState = new Map<string, { i: number; base: number }>();
  private pad: {
    a: OscillatorNode;
    b: OscillatorNode;
    g: GainNode;
    f: BiquadFilterNode;
    lfo: OscillatorNode;
  } | null = null;
  // 钢琴延音踏板：踩下中标志 + 在响/延音 voice 登记列表
  private pedalOn = false;
  private pianoVoices: PianoVoice[] = [];
  // 弱音器踏板（una corda）：所有琴音走专用 pianoBus → pianoTone(低通) → master 链，
  // 踩下时只调这两级参数，与延音踏板（voice 级包络操作）完全独立、可叠加
  private pianoBus: GainNode | null = null;
  private pianoTone: BiquadFilterNode | null = null;
  private softOn = false;

  /** 首次用户手势时调用：创建 / 恢复 AudioContext */
  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.45; // 默认音量偏低
      const lim = ctx.createDynamicsCompressor(); // 主总线限制器
      lim.threshold.value = -16;
      lim.knee.value = 8;
      lim.ratio.value = 12;
      lim.attack.value = 0.003;
      lim.release.value = 0.15;
      master.connect(lim);
      lim.connect(ctx.destination);
      this.lim = lim;
      // FX 发送链（效果器）：master → 延迟/混响 → wet 音量 → lim。wet=0 时完全静默，
      // 挂在 lim 之前所以效果同样过限制器防爆音
      const delay = ctx.createDelay(1.5);
      delay.delayTime.value = 0.34;
      const fb = ctx.createGain();
      fb.gain.value = 0.34;
      const delayWet = ctx.createGain();
      delayWet.gain.value = 0;
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(delayWet);
      delayWet.connect(lim);
      master.connect(delay);
      const conv = ctx.createConvolver();
      const irLen = Math.floor(ctx.sampleRate * 2.2);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch += 1) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i += 1) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.4) * 0.6;
        }
      }
      conv.buffer = ir;
      const revWet = ctx.createGain();
      revWet.gain.value = 0;
      master.connect(conv);
      conv.connect(revWet);
      revWet.connect(lim);
      this.delayWet = delayWet;
      this.revWet = revWet;
      // 画布自动化链（先建不接：无曲线时画布音不进 canvasBus，接线与听觉跟今天完全一致 = 零成本直通）
      const canvasBus = ctx.createGain();
      canvasBus.gain.value = 1;
      const canvasFilter = ctx.createBiquadFilter();
      canvasFilter.type = "lowpass";
      canvasFilter.frequency.value = 18000; // 中性 = 全开
      canvasFilter.Q.value = 0.7;
      const canvasPanNode =
        typeof ctx.createStereoPanner === "function"
          ? ctx.createStereoPanner()
          : null;
      // 画布混响加料：独立 convolver + wet（HUD 的 revWet 受全局混响旋钮门控，
      // 不能借用——否则 HUD 混响=0 时曲线加混响会没声）。曲线值 = 在 HUD 基准之上叠加的加料量
      const canvasConv = ctx.createConvolver();
      canvasConv.buffer = ir; // 复用 master 混响的同一 IR buffer（只读共享）
      const canvasRevWet = ctx.createGain();
      canvasRevWet.gain.value = 0; // 中性 = 不加料
      canvasBus.connect(canvasFilter);
      if (canvasPanNode) {
        canvasFilter.connect(canvasPanNode);
        canvasPanNode.connect(master);
      } else {
        canvasFilter.connect(master); // 无 StereoPanner 的环境退化为直连
      }
      canvasBus.connect(canvasConv);
      canvasConv.connect(canvasRevWet);
      canvasRevWet.connect(lim); // 干链一样过主限制器防爆音
      // 链头 canvasBus 平时没有任何输入 = 纯静音过节点，开销可忽略；
      // 「零成本直通」由 playNote/canvasStep 是否把音送进 canvasBus 决定（无曲线 = 不送）
      this.canvasBus = canvasBus;
      this.canvasFilter = canvasFilter;
      this.canvasPanNode = canvasPanNode;
      this.canvasRevWet = canvasRevWet;
      // 专用钢琴总线（必须在首次 playPiano 前建好）：琴音全部经此链汇入 master，
      // 弱音器只调这条链，旋律/鼓组/颗粒/垫音不受影响
      const pianoBus = ctx.createGain();
      pianoBus.gain.value = 1;
      const pianoTone = ctx.createBiquadFilter();
      pianoTone.type = "lowpass";
      pianoTone.frequency.value = PIANO_BUS_OPEN_CUTOFF; // 放开态约透明
      pianoTone.Q.value = 0.7;
      pianoBus.connect(pianoTone);
      pianoTone.connect(master);
      this.ctx = ctx;
      this.master = master;
      this.pianoBus = pianoBus;
      this.pianoTone = pianoTone;
      if (this.autoCurves.length > 0) this.canvasSongBase = ctx.currentTime + 0.2;
      if (this.canvasSpecs.length > 0 || this.autoCurves.length > 0) this.ensureCanvasTimer();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  get isActive(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** 主总线限制器实时削减量（dB，≤0；越大越接近 0 = 削得越多）——AI「总线过载」建议的唯一输入 */
  get limiterReductionDb(): number {
    if (!this.lim || !this.ctx) return 0;
    return typeof this.lim.reduction === "number" ? this.lim.reduction : 0;
  }

  /** 音频导出抽头：master 另分一路进 MediaStream（现场监听链不受影响），
   *  外部 MediaRecorder 直接录返回的流即可把听到的演奏存成文件 */
  recordTap(): MediaStream | null {
    if (!this.ctx || !this.master) return null;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (!this.tapNode) {
      this.tapNode = this.ctx.createMediaStreamDestination();
      this.master.connect(this.tapNode);
    }
    return this.tapNode.stream;
  }

  get currentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** 当前音阶（唯一真源由 useHome 写入，创建引擎与切换时调用） */
  setScale(scale: Scale): void {
    this.scale = scale;
  }

  /** 当前音色（非法 id 回落玻璃） */
  setVoice(id: string): void {
    this.voiceId = voiceById(id).id;
  }

  get voice(): string {
    return this.voiceId;
  }

  /** 当前鼓组风格包（非法 id 回落原声）；只作用于打字鼓组与循环回放里的鼓事件 */
  setDrumKit(id: string): void {
    this.drumKitId = drumKitById(id).id;
  }

  get drumKit(): string {
    return this.drumKitId;
  }

  private freqOf(idx: number): number {
    return scaleFreq(this.scale, idx);
  }

  private voiceCutoff(cutoffHz: number, v: number): number {
    const base = Math.max(140, cutoffHz);
    if (this.voiceId === "lead") return Math.min(14000, base * (0.6 + v * 1.4)); // 低通跟力度
    if (this.voiceId === "bell") return Math.max(base, 5200); // 金属感保持明亮
    return base;
  }

  playNote(
    idx: number,
    vel: number,
    cutoffHz: number,
    when?: number,
    durScale?: number,
    voiceId?: string, // 动态音色：逐音覆盖当前音色选择（缺省跟随 HUD 设定）
    pan?: number, // 分轨声像（-1 左 … 1 右），缺省走主总线
    out?: AudioNode, // 输出覆盖（曲线自动化：画布音送 canvasBus 而非 master），缺省 master
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const dst = out ?? this.master;
    // 入参全部经 fin 兜底：画布循环/回放/AI 动作哪条路上游混进 NaN 都在这里拦下，
    // 否则一个脏事件会把 25ms 的调度 tick 整个炸掉（AudioParam non-finite）
    const t = fin(when, ctx.currentTime + 0.005);
    const v = Math.min(1, Math.max(0.05, fin(vel, 0.5)));
    const freq = fin(this.freqOf(fin(idx, 12)), 220);
    const voice = voiceId ?? this.voiceId;
    // 自造音色：走独立合成分支（双振荡器→滤波 ADSR→放大 ADSR→自造效果链），
    // 循环调度 / scheduleSequence / 画布逐音都经这里，天然共用同一实现、零预设特判污染
    if (voice === "custom") {
      const vc = this.synthVoice(ctx, freq, v, pan, out);
      if (!vc) return;
      const dur = (0.22 + v * 0.35) * fin(durScale, 1);
      vc.start(t);
      const relAt = t + dur + 0.02;
      vc.release(relAt);
      vc.stopAll(relAt + Math.max(0.25, this.synthPatch.aR + this.synthPatch.fR + 0.1));
      return;
    }
    let dur = (0.22 + v * 0.35) * fin(durScale, 1);
    let peak = 0.16 * v + 0.015;
    let tail = 0.05;
    if (voice === "chip") {
      peak *= 0.7;
    } else if (voice === "lead") {
      peak *= 0.9;
    } else if (voice === "pluck") {
      dur *= 0.42; // 短衰减
      peak *= 1.1;
    } else if (voice === "bell") {
      dur *= 2.6; // 长尾
      peak *= 0.8;
      tail = 0.6;
    } else if (voice === "bass") {
      dur *= 0.75; // 短促肥厚
      peak *= 1.1;
    } else if (voice === "guitar") {
      dur *= 0.55; // 拨扫短弓
      peak *= 1.05;
    } else if (voice === "strings") {
      dur *= 2.2; // 长弓
      peak *= 0.7;
      tail = 0.35;
    }
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = this.voiceCutoff(fin(cutoffHz, 1000), v);
    f.Q.value = 0.9;
    const g = ctx.createGain();
    const atk = voice === "strings" ? 0.12 : 0.01; // 弦乐慢起音（bow attack）
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const oscs: OscillatorNode[] = [];
    if (voice === "bell") {
      // FM 钟：调制器→深度→载波1 音高；载波2 非倍频泛音增加金属感
      const mod = ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.value = freq * 2.76;
      const modG = ctx.createGain();
      modG.gain.value = freq * (3 + v * 14);
      mod.connect(modG);
      const c1 = ctx.createOscillator();
      c1.type = "sine";
      c1.frequency.value = freq;
      modG.connect(c1.frequency);
      const c2 = ctx.createOscillator();
      c2.type = "sine";
      c2.frequency.value = freq * 4.01;
      c2.detune.value = 4;
      c1.connect(f);
      c2.connect(f);
      oscs.push(mod, c1, c2);
    } else {
      const pair = voiceOscPair(voice);
      const base = voice === "bass" ? freq / 2 : freq; // 贝斯下移一个八度
      const o1 = ctx.createOscillator();
      o1.type = pair[0];
      o1.frequency.value = base;
      const o2 = ctx.createOscillator();
      o2.type = pair[1];
      o2.frequency.value = voice === "pluck" ? freq * 2 : freq; // 拨弦高八度轻泛音；贝斯时 freq 相对 base 恰为高八度
      o2.detune.value = voice === "chip" ? 8 : voice === "lead" ? 7 : voice === "pluck" ? 0 : 4;
      o1.connect(f);
      o2.connect(f);
      oscs.push(o1, o2);
    }
    f.connect(g);
    if (pan && typeof ctx.createStereoPanner === "function") {
      // 分轨声像：该音符经立体声声像器再入目标总线
      const p = ctx.createStereoPanner();
      p.pan.value = Math.min(1, Math.max(-1, pan));
      g.connect(p);
      p.connect(dst);
    } else {
      g.connect(dst);
    }
    const end = t + dur + tail;
    for (const o of oscs) {
      o.start(t);
      o.stop(end);
    }
  }

  startSustain(idx: number, vel: number, cutoffHz: number): void {
    this.stopSustain();
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const v = Math.min(1, Math.max(0.05, fin(vel, 0.5)));
    const freq = fin(this.freqOf(fin(idx, 12)), 220);
    const voice = this.voiceId;
    // 自造音色持续音：与 playNote 同一 synthVoice 构建器，松手走 release/stopAll
    if (voice === "custom") {
      const vc = this.synthVoice(ctx, freq, v);
      if (!vc) return;
      vc.start(t);
      this.sust = { o1: vc.o1, o2: vc.o2, g: vc.amp, f: vc.filter, synth: vc };
      return;
    }
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = this.voiceCutoff(fin(cutoffHz, 1000), v);
    f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09 * v + 0.01, t + 0.05);
    const pair = voiceOscPair(voice);
    const o1 = ctx.createOscillator();
    o1.type = pair[0];
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = pair[1];
    o2.frequency.value = freq;
    o2.detune.value = voice === "bell" ? -11 : voice === "chip" ? -9 : -6;
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.master);
    o1.start(t);
    o2.start(t);
    this.sust = { o1, o2, g, f };
  }

  updateSustain(idx: number, cutoffHz: number): void {
    if (!this.sust || !this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = this.freqOf(idx);
    if (this.sust.synth) {
      // 自造持续音：音高跟手（含补丁八度），鼠标 Y 当亮度旋钮在补丁截止附近扫动
      const p = this.synthPatch;
      const mul = this.sust.synth.octMul;
      this.sust.o1.frequency.setTargetAtTime(freq * mul, t, 0.03);
      this.sust.o2.frequency.setTargetAtTime(freq * mul, t, 0.03);
      const r = Math.min(1, Math.max(0, cutoffHz / 12000));
      this.sust.f.frequency.setTargetAtTime(
        Math.min(12000, Math.max(80, p.cutoff * (0.3 + r))),
        t,
        0.05,
      );
      return;
    }
    this.sust.o1.frequency.setTargetAtTime(freq, t, 0.03);
    this.sust.o2.frequency.setTargetAtTime(freq, t, 0.03);
    this.sust.f.frequency.setTargetAtTime(this.voiceCutoff(cutoffHz, 0.6), t, 0.05);
  }

  stopSustain(): void {
    const s = this.sust;
    if (!s || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (s.synth) {
      // 自造持续音：走补丁 R 段的正常收尾，音尾按 aR/fR 留足再停源
      s.synth.release(t);
      s.synth.stopAll(t + Math.max(0.3, this.synthPatch.aR + this.synthPatch.fR + 0.15));
      this.sust = null;
      return;
    }
    s.g.gain.cancelScheduledValues(t);
    s.g.gain.setTargetAtTime(0.0001, t, 0.04);
    s.o1.stop(t + 0.25);
    s.o2.stop(t + 0.25);
    this.sust = null;
  }

  // ---- 自造音色（简化合成器）：补丁热更新 + 专用效果总线 + 单声部构建器 ----

  /** 补丁热更新：全局效果节点 value 当场变（滑杆拖动即时生效）；
   *  已排程音保持下键时参数不重建；效果链只在旁通状态（mix 过零）变化时重接线；
   *  Convolver IR 仅 size 变化时重新生成，绝不在逐音路径生成 */
  setSynthPatch(patch: SynthPatch): void {
    this.synthPatch = patch;
    const ctx = this.ctx;
    const f = this.cfx;
    if (!ctx || !f) return; // 总线未建：参数已存，首次 custom 发声时 ensureCustomFx 直接按新值建
    const t = ctx.currentTime;
    f.chorLfo.frequency.setTargetAtTime(Math.max(0.1, patch.choRate), t, 0.05);
    f.chorLfoAmt.gain.setTargetAtTime((patch.choDepth / 100) * 0.006, t, 0.05);
    f.dlyNode.delayTime.setTargetAtTime(patch.dlyTime, t, 0.05);
    f.dlyFb.gain.setTargetAtTime(Math.min(0.9, patch.dlyFb), t, 0.05);
    if (patch.drive !== this.lastDrive) {
      this.lastDrive = patch.drive;
      f.shaper.curve = this.distCurve(patch.drive);
    }
    if (patch.revSize !== this.lastRevSize) {
      this.lastRevSize = patch.revSize;
      f.conv.buffer = this.makeImpulse(patch.revSize);
    }
    this.wireCustomFx();
  }

  private makeImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const len = Math.max(128, Math.floor(ctx.sampleRate * Math.min(4, Math.max(0.3, seconds))));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i += 1) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * 0.55;
      }
    }
    return buf;
  }

  private distCurve(drive: number): Float32Array<ArrayBuffer> {
    const n = 1024;
    const curve = new Float32Array(new ArrayBuffer(n * 4));
    const k = 1 + (Math.min(100, Math.max(0, drive)) / 100) * 22;
    for (let i = 0; i < n; i += 1) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    return curve;
  }

  private ensureCustomFx(): CustomFx | null {
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;
    if (this.cfx) return this.cfx;
    const p = this.synthPatch;
    const g = (): GainNode => {
      const n = ctx.createGain();
      n.gain.value = 1;
      return n;
    };
    const inN = g();
    const j1 = g();
    const j2 = g();
    const j3 = g();
    const out = g();
    const shaper = ctx.createWaveShaper();
    shaper.oversample = "2x";
    shaper.curve = this.distCurve(p.drive);
    const chorDelay = ctx.createDelay(0.2);
    chorDelay.delayTime.value = 0.026; // 合唱基延迟 ~26ms，LFO 在其上摆动
    const chorLfo = ctx.createOscillator();
    chorLfo.type = "sine";
    chorLfo.frequency.value = Math.max(0.1, p.choRate);
    const chorLfoAmt = ctx.createGain();
    chorLfoAmt.gain.value = (p.choDepth / 100) * 0.006;
    chorLfo.connect(chorLfoAmt);
    chorLfoAmt.connect(chorDelay.delayTime);
    chorLfo.start(); // 全局合唱 LFO 常驻（一个振荡器开销可忽略），custom 总线随引擎生老
    const dlyNode = ctx.createDelay(1.5);
    dlyNode.delayTime.value = p.dlyTime;
    const dlyFb = ctx.createGain();
    dlyFb.gain.value = Math.min(0.9, p.dlyFb);
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(p.revSize);
    this.cfx = {
      in: inN,
      j1,
      j2,
      j3,
      out,
      shaper,
      distDry: g(),
      distWet: g(),
      chorDelay,
      chorDry: g(),
      chorWet: g(),
      chorLfo,
      chorLfoAmt,
      dlyNode,
      dlyFb,
      dlyDry: g(),
      dlyWet: g(),
      conv,
      revDry: g(),
      revWet: g(),
    };
    this.lastRevSize = p.revSize;
    this.lastDrive = p.drive;
    this.fxMixKey = "";
    this.wireCustomFx();
    return this.cfx;
  }

  private wireCustomFx(): void {
    const f = this.cfx;
    if (!f || !this.master) return;
    const p = this.synthPatch;
    const dist = p.distMix > 0.002 && p.drive > 0.5;
    const chor = p.choMix > 0.002;
    const dly = p.dlyMix > 0.002;
    const rev = p.revMix > 0.002;
    f.distDry.gain.value = dist ? Math.max(0, 1 - p.distMix) : 1;
    f.distWet.gain.value = dist ? p.distMix : 0;
    f.chorWet.gain.value = chor ? p.choMix : 0;
    f.dlyWet.gain.value = dly ? p.dlyMix : 0;
    f.revWet.gain.value = rev ? p.revMix : 0;
    const key = `${dist ? 1 : 0}${chor ? 1 : 0}${dly ? 1 : 0}${rev ? 1 : 0}`;
    if (key === this.fxMixKey) return; // 旁通格局没变：增益已就地更新，不必重接线
    this.fxMixKey = key;
    // 只重接效果链干路；合唱 LFO→delayTime 调制接在 chorLfoAmt 出侧，不在断开名单
    const nodes: AudioNode[] = [
      f.in,
      f.j1,
      f.j2,
      f.j3,
      f.out,
      f.shaper,
      f.distDry,
      f.distWet,
      f.chorDelay,
      f.chorDry,
      f.chorWet,
      f.dlyNode,
      f.dlyFb,
      f.dlyDry,
      f.dlyWet,
      f.conv,
      f.revDry,
      f.revWet,
    ];
    for (const n of nodes) n.disconnect();
    const stage = (
      src: GainNode,
      dst: GainNode,
      fxIn: AudioNode | null,
      wet: GainNode,
      dry: GainNode,
      loop: GainNode | null,
    ): void => {
      if (!fxIn) {
        src.connect(dst); // 旁通：直连，fx 节点整级脱离信号流省 CPU
        return;
      }
      src.connect(dry);
      dry.connect(dst);
      src.connect(fxIn);
      fxIn.connect(wet);
      wet.connect(dst);
      if (loop) {
        fxIn.connect(loop);
        loop.connect(fxIn);
      }
    };
    stage(f.in, f.j1, dist ? f.shaper : null, f.distWet, f.distDry, null);
    stage(f.j1, f.j2, chor ? f.chorDelay : null, f.chorWet, f.chorDry, null);
    stage(f.j2, f.j3, dly ? f.dlyNode : null, f.dlyWet, f.dlyDry, dly ? f.dlyFb : null);
    stage(f.j3, f.out, rev ? f.conv : null, f.revWet, f.revDry, null);
    f.out.connect(this.master);
  }

  /** 自造单声部：振荡器 A/B（波形各选、B 失谐、共享八度）→ lowpass（Q + 滤波 ADSR，
   *  起始截止随力度浮动沿用现有习惯）→ 放大 ADSR → [可选声像] → 自造效果总线。
   *  LFO 每音符一实例随声部回收。调用方保证 ctx 已建 */
  private synthVoice(ctx: AudioContext, freq: number, v: number, pan?: number, out?: AudioNode): SynthVoice | null {
    // out 覆盖（画布曲线自动化）：信号直送外部总线、跳过自造效果链（自动化链自带音量/滤波/声像，
    // 二者不叠乘；这是曲线激活期间 custom 音色的既定取舍）
    const bus = out ? null : this.ensureCustomFx();
    if (!bus && !out) return null;
    const inNode: AudioNode = out ?? bus!.in;
    const p = this.synthPatch;
    const octMul = Math.pow(2, Math.round(Math.max(-2, Math.min(2, p.octave))));
    const f0 = Math.max(27.5, freq * octMul);
    const cutoff = Math.max(80, Math.min(12000, p.cutoff));
    const peak = 0.14 * v + 0.012;
    const o1 = ctx.createOscillator();
    o1.type = p.waveA;
    o1.frequency.value = f0;
    const o2 = ctx.createOscillator();
    o2.type = p.waveB;
    o2.frequency.value = f0;
    o2.detune.value = p.detuneB;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = Math.max(0.1, Math.min(18, p.q));
    const amp = ctx.createGain();
    o1.connect(filter);
    o2.connect(filter);
    filter.connect(amp);
    let lfo: OscillatorNode | null = null;
    if (p.lfoDepth > 0.5) {
      lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = Math.max(0.05, Math.min(12, p.lfoRate));
      const amt = ctx.createGain();
      if (p.lfoTarget === "pitch") amt.gain.value = p.lfoDepth; // 音分
      else if (p.lfoTarget === "filter") amt.gain.value = cutoff * (p.lfoDepth / 100) * 0.7; // Hz
      else amt.gain.value = peak * (p.lfoDepth / 100) * 0.9; // 叠加进放大包络
      lfo.connect(amt);
      if (p.lfoTarget === "pitch") {
        amt.connect(o1.detune);
        amt.connect(o2.detune);
      } else if (p.lfoTarget === "filter") {
        amt.connect(filter.frequency);
      } else {
        amt.connect(amp.gain);
      }
    }
    if (pan && typeof ctx.createStereoPanner === "function") {
      const sp = ctx.createStereoPanner();
      sp.pan.value = Math.min(1, Math.max(-1, pan));
      amp.connect(sp);
      sp.connect(inNode);
    } else {
      amp.connect(inNode);
    }
    const atkA = Math.max(0.003, p.aA);
    const atkF = Math.max(0.005, p.fA);
    // 滤波起音起点随力度浮动（沿用 lead「低通跟力度」习惯）：越用力起始越亮
    const startHz = Math.min(cutoff * 0.95, Math.max(80, cutoff * (0.12 + v * 0.26)));
    const susHz = Math.max(80, cutoff * p.fS);
    const aRel = Math.max(0.02, p.aR / 3);
    const fRel = Math.max(0.03, p.fR / 3);
    return {
      o1,
      o2,
      amp,
      filter,
      octMul,
      start: (t: number) => {
        o1.start(t);
        o2.start(t);
        if (lfo) lfo.start(t);
        filter.frequency.setValueAtTime(startHz, t);
        filter.frequency.linearRampToValueAtTime(cutoff, t + atkF);
        filter.frequency.setTargetAtTime(susHz, t + atkF, Math.max(0.03, p.fD / 3));
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.linearRampToValueAtTime(peak, t + atkA);
        amp.gain.setTargetAtTime(Math.max(0.00012, peak * p.aS), t + atkA, Math.max(0.03, p.aD / 3));
      },
      release: (t: number) => {
        holdParam(amp.gain, t);
        amp.gain.setTargetAtTime(0.0001, t, aRel);
        holdParam(filter.frequency, t);
        filter.frequency.setTargetAtTime(110, t, fRel);
      },
      stopAll: (t: number) => {
        o1.stop(t);
        o2.stop(t);
        if (lfo) lfo.stop(t);
      },
    };
  }

  playDrum(kind: DrumKind, vel: number, when?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    // 引擎边界兜底（与 playNote 同理）：脏力度/脏时间不放进任何鼓包合成路径
    vel = Math.min(1.5, Math.max(0.05, fin(vel, 0.7)));
    when = when !== undefined && Number.isFinite(when) ? when : undefined;
    // 鼓组风格包分发：非原声包走各自合成路径（旋律/颗粒/垫音不受影响，主总线限制器不变）
    if (this.drumKitId === "elec808") {
      this.playDrum808(kind, vel, when);
      return;
    }
    if (this.drumKitId === "lofi") {
      this.playDrumLofi(kind, vel, when);
      return;
    }
    if (this.drumKitId === "metal") {
      this.playDrumMetal(kind, vel, when);
      return;
    }
    // 原声 Acoustic（默认包）：以下合成与引入鼓包前完全一致，保证旧链接听感不变
    const t = when ?? ctx.currentTime + 0.005;
    const v = Math.min(1, Math.max(0.1, vel));
    if (kind === "kick") {
      const o = ctx.createOscillator();
      o.type = "sine";
      const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      g.gain.setValueAtTime(0.8 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.35);
      return;
    }
    if (kind === "snare") {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + 0.2);
      const body = ctx.createOscillator();
      body.type = "triangle";
      body.frequency.value = 190;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.25 * v, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      body.connect(bg);
      bg.connect(this.master);
      body.start(t);
      body.stop(t + 0.15);
      return;
    }
    if (kind === "hat") {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.15 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + 0.06);
      return;
    }
    // click
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.05);
  }

  // ---- 电子 808：正弦深低频长尾 kick、轻失真 snare、更脆 hat，电子舞曲感 ----

  private playDrum808(kind: DrumKind, vel: number, when?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = when ?? ctx.currentTime + 0.005;
    const v = Math.min(1, Math.max(0.1, vel));
    if (kind === "kick") {
      const o = ctx.createOscillator();
      o.type = "sine";
      const g = ctx.createGain();
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
      g.gain.setValueAtTime(0.72 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.85);
      return;
    }
    if (kind === "snare") {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      bp.Q.value = 0.7;
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.driveCurve();
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.38 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      src.connect(bp);
      bp.connect(shaper);
      shaper.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + 0.26);
      const body = ctx.createOscillator();
      body.type = "sine";
      body.frequency.setValueAtTime(200, t);
      body.frequency.exponentialRampToValueAtTime(150, t + 0.1);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.3 * v, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      body.connect(bg);
      bg.connect(this.master);
      body.start(t);
      body.stop(t + 0.2);
      return;
    }
    if (kind === "hat") {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 9200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + 0.05);
      return;
    }
    // click：808 式高频短 blip
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 1350;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.05);
  }

  private driveCurve(): Float32Array<ArrayBuffer> {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); // 轻度过载，不炸
    }
    return curve;
  }

  // ---- Lo-fi：全部串一个低截止低通压暗，kick 短闷、snare 沙沙长尾，旧磁带感 ----

  private playDrumLofi(kind: DrumKind, vel: number, when?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = when ?? ctx.currentTime + 0.005;
    const v = Math.min(1, Math.max(0.1, vel));
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = kind === "hat" ? 3000 : 1500;
    lp.Q.value = 0.7;
    lp.connect(this.master);
    if (kind === "kick") {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.detune.value = (Math.random() - 0.5) * 24; // 轻微 wow 音高抖动（磁带晃）
      const g = ctx.createGain();
      o.frequency.setValueAtTime(115, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.07);
      g.gain.setValueAtTime(0.62 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g);
      g.connect(lp);
      o.start(t);
      o.stop(t + 0.18);
      return;
    }
    if (kind === "snare") {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf();
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.34 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32); // 沙沙噪声长尾
      src.connect(g);
      g.connect(lp);
      src.start(t);
      src.stop(t + 0.35);
      const body = ctx.createOscillator();
      body.type = "triangle";
      body.frequency.value = 175;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.2 * v, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      body.connect(bg);
      bg.connect(lp);
      body.start(t);
      body.stop(t + 0.12);
      return;
    }
    if (kind === "hat") {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf();
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
      src.connect(g);
      g.connect(lp);
      src.start(t);
      src.stop(t + 0.08);
      return;
    }
    // click：闷化的钝击
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 720;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g);
    g.connect(lp);
    o.start(t);
    o.stop(t + 0.07);
  }

  // ---- 金属 Perc：非谐波多正弦金属敲击为主，无传统 kick，工业打击乐感 ----

  private playDrumMetal(kind: DrumKind, vel: number, when?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = when ?? ctx.currentTime + 0.005;
    const v = Math.min(1, Math.max(0.1, vel));
    if (kind === "kick") {
      // 无传统 kick：短顿低频击 + 高频金属上击点缀
      const o = ctx.createOscillator();
      o.type = "sine";
      const g = ctx.createGain();
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.06);
      g.gain.setValueAtTime(0.55 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.12);
      this.metalHit(t, 2600, 0.05 * v, 0.07);
      return;
    }
    if (kind === "snare") {
      this.metalHit(t, 1900, 0.11 * v, 0.22);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.2 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + 0.14);
      return;
    }
    if (kind === "hat") {
      this.metalHit(t, 6800, 0.06 * v, 0.05);
      return;
    }
    // click：高频金属 ping
    this.metalHit(t, 3400, 0.08 * v, 0.09);
  }

  /** 金属敲击：非谐波比例多正弦叠加，高次衰减更快，短指数包络 */
  private metalHit(when: number, base: number, peak: number, dur: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const ratios = [1, 1.41, 1.93];
    for (const r of ratios) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * r;
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak / ratios.length, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur * (0.6 + r * 0.25));
      o.connect(g);
      g.connect(this.master);
      o.start(when);
      o.stop(when + dur * 2 + 0.05);
    }
  }

  // ---- 钢琴层（打字钢琴玩法）：加性合成 基频+2/3次谐波、指数衰减约1.2s、双osc轻detune，走主总线限制器 ----
  // 延音踏板（setSustainPedal）：踩下时新琴音衰减到 15% 延音电平后保持（osc 约12s 封顶），
  // 已在响的琴音立刻取消衰减改挂延音电平；松开统一柔和收束（时间常数约0.42s）。
  // 同键重复触发先柔和收掉旧的延音 voice，音量不无限叠加。
  // 回放事件 sustain 位走等效长尾：淡到 15% 后继续缓落约5s 归零（与踏板保持区分，不受当前踏板状态影响）。

  playPiano(
    semiOffsetFromC3: number,
    vel: number,
    when?: number,
    sustain = false,
    softNote = false,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.pianoBus) return;
    const t = fin(when, ctx.currentTime + 0.005);
    const v = Math.min(1, Math.max(0.1, fin(vel, 0.7)));
    const freq = fin(midiFreq(PIANO_C3_MIDI + fin(semiOffsetFromC3, 0)), 261);
    const dur = 1.2;
    const peak = 0.13 * v + 0.012;
    const sus = Math.max(0.0002, peak * PIANO_SUSTAIN_RATIO);
    const pedaled = this.pedalOn;
    if (pedaled) this.collectSustaining(Math.round(fin(semiOffsetFromC3, 0)), 0.3, 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.012);
    let end: number;
    if (pedaled) {
      g.gain.exponentialRampToValueAtTime(sus, t + dur); // 衰减到 15% 延音电平后保持
      end = t + PIANO_MAX_SUSTAIN;
    } else if (sustain) {
      g.gain.exponentialRampToValueAtTime(sus, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + PIANO_LONG_TAIL); // 回放长尾，不无限保持
      end = t + PIANO_LONG_TAIL + 0.05;
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur); // 不踩踏板：与改造前听感一致
      end = t + dur + 0.05;
    }
    if (softNote) {
      // 回放软音位：独立压暗+降增益路径，绕开 pianoBus 全局踩放态（避免时序串扰）
      const slp = ctx.createBiquadFilter();
      slp.type = "lowpass";
      slp.frequency.value = PIANO_SOFT_CUTOFF;
      const sg = ctx.createGain();
      sg.gain.value = PIANO_SOFT_GAIN;
      g.connect(slp);
      slp.connect(sg);
      sg.connect(this.master);
    } else {
      g.connect(this.pianoBus);
    }
    // [谐波倍频, 声部电平, detune(cent)]；基频双 osc ±6 cent 轻失谐，与鼓组同档音量
    const partials: [number, number, number][] = [
      [1, 0.5, -6],
      [1, 0.5, 6],
      [2, 0.3, 3],
      [3, 0.12, -4],
    ];
    const oscs: OscillatorNode[] = [];
    for (const [mult, level, detune] of partials) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * mult;
      o.detune.value = detune;
      const pg = ctx.createGain();
      pg.gain.value = level;
      o.connect(pg);
      pg.connect(g);
      o.start(t);
      o.stop(end);
      oscs.push(o);
    }
    // 记入 active 列表（含 gain 节点与 stop 计划），osc 自然结束时自动移除；踏板据此收集/收束
    const voice: PianoVoice = {
      semi: semiOffsetFromC3,
      g,
      oscs,
      peak,
      sustained: pedaled,
      releasing: false,
    };
    this.pianoVoices.push(voice);
    const first = oscs[0];
    if (first) {
      first.onended = () => {
        const i = this.pianoVoices.indexOf(voice);
        if (i >= 0) this.pianoVoices.splice(i, 1);
      };
    }
  }

  /** 效果器湿量（0..1，幂等）：延迟回声 / 大厅混响；引擎未起或值未变时 no-op */
  setFx(kind: "delay" | "reverb", value01: number): void {
    const node = kind === "delay" ? this.delayWet : this.revWet;
    if (!node || !this.ctx) return;
    const g = Math.min(1, Math.max(0, value01)) * 0.5; // 湿量封顶 0.5，避免满湿糊掉干声
    node.gain.setTargetAtTime(g, this.ctx.currentTime, 0.03);
  }

  /** 主音量：0..1 → master gain 0.08..0.9（0.45 ≈ 出厂默认 0.45 的原响度）；
   *  音乐推子（musicScale）串乘在同一节点上，全局静音时恒压到零 */
  private masterVol = 0;
  private masterMute = false;
  private musicScale = 1;

  private applyMasterGain(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(
      this.masterMute ? 0.0001 : (0.08 + this.masterVol * 0.82) * this.musicScale,
      this.ctx.currentTime,
      0.03,
    );
  }

  setMasterVolume(value01: number): void {
    if (!this.ctx || !this.master) return;
    this.masterVol = Math.min(1, Math.max(0, value01));
    this.applyMasterGain();
  }

  /** 音乐推子（「听感」面板）：0..1 串乘在 master 上——压低只让乐器变轻，
   *  节拍器 click（校准用）走独立低电平链不受影响的场景没有（click 本就够轻），够用 */
  setMusicVolume(value01: number): void {
    if (!this.ctx || !this.master) return;
    this.musicScale = Math.min(1, Math.max(0, value01));
    this.applyMasterGain();
  }

  /** 设备输出延迟（秒→毫秒）：声卡把声音送到耳朵的固定耗时，供判定校准向导显示参考 */
  outputLatencyMs(): number {
    if (!this.ctx) return 0;
    const c = this.ctx as AudioContext & { outputLatency?: number; baseLatency?: number };
    const lat = c.outputLatency || c.baseLatency || 0;
    return Math.round(lat * 1000);
  }

  /** 全局静音（HUD「静音」chip）：主输出压零，解除时回到当前音量；
   *  静音期间画布循环连发声都跳过（省合成开销），索引照常推进 */
  setMasterMuted(on: boolean): void {
    this.masterMute = on;
    this.applyMasterGain();
  }

  /** 练习节拍器 click：短正弦点（重拍 1200Hz / 弱拍 800Hz，~40ms 指数衰减），
   *  直入 master 不过钢琴总线（与琴音互不染色）；音量低档不抢琴声 */
  playClick(accent: boolean, when?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = accent ? 1200 : 800;
    const g = ctx.createGain();
    const peak = accent ? 0.16 : 0.09;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  /** 钢琴延音踏板开关（幂等）：踩下把在响琴音收进踏板挂 15% 延音电平；松开统一柔和收束 */
  setSustainPedal(on: boolean): void {
    if (this.pedalOn === on) return;
    this.pedalOn = on;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (on) {
      for (const vo of this.pianoVoices) {
        if (vo.sustained || vo.releasing) continue; // 已在踏板中 / 正在收束的不动
        holdParam(vo.g.gain, t); // 取消在途衰减，改挂延音电平
        vo.g.gain.setTargetAtTime(Math.max(0.0002, vo.peak * PIANO_SUSTAIN_RATIO), t, 0.05);
        for (const o of vo.oscs) o.stop(t + PIANO_MAX_SUSTAIN);
        vo.sustained = true;
      }
    } else {
      for (const vo of [...this.pianoVoices]) {
        if (vo.sustained && !vo.releasing) this.releaseVoice(vo, PIANO_RELEASE_TAU, 1.9);
      }
    }
  }

  get sustainPedal(): boolean {
    return this.pedalOn;
  }

  /** 弱音器踏板开关（una corda，幂等）：踩下时钢琴总线整体降至约40%增益、低通压暗至约900Hz；松开恢复明亮；与延音踏板完全独立可叠加 */
  setSoftPedal(on: boolean): void {
    if (this.softOn === on) return;
    this.softOn = on;
    const ctx = this.ctx;
    if (!ctx || !this.pianoBus || !this.pianoTone) return;
    const t = ctx.currentTime;
    this.pianoBus.gain.setTargetAtTime(on ? PIANO_SOFT_GAIN : 1, t, 0.03);
    this.pianoTone.frequency.setTargetAtTime(
      on ? PIANO_SOFT_CUTOFF : PIANO_BUS_OPEN_CUTOFF,
      t,
      0.04,
    );
  }

  get softPedal(): boolean {
    return this.softOn;
  }

  /** 同键重复触发：柔和收掉同 semi 偏移的旧延音 voice */
  private collectSustaining(semi: number, tau: number, stopPad: number): void {
    for (const vo of [...this.pianoVoices]) {
      if (vo.semi === semi && vo.sustained && !vo.releasing) this.releaseVoice(vo, tau, stopPad);
    }
  }

  private releaseVoice(vo: PianoVoice, tau: number, stopPad: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    holdParam(vo.g.gain, t);
    vo.g.gain.setTargetAtTime(0.0001, t, tau);
    for (const o of vo.oscs) o.stop(t + stopPad);
    vo.releasing = true;
  }

  /** 基于 currentTime 的 lookahead 排程回放，返回取消函数 */
  scheduleSequence(
    events: {
      t: number;
      k: string;
      idx?: number;
      v?: number;
      c?: number;
      g?: number;
      ki?: number;
      b?: number;
      s?: number; // 钢琴事件的延音踏板位（回放长尾）
      soft?: number; // 钢琴事件的弱音器位（回放重现压暗变轻音色）
    }[],
    opts: {
      loop?: boolean;
      loopEnd?: number;
      onEnd?: () => void;
      onPiano?: (ki: number, black: boolean, vel: number) => void;
    },
  ): () => void {
    const ctx = this.ctx;
    if (!ctx || events.length === 0) return () => {};
    const sorted = [...events].sort((a, b) => a.t - b.t);
    let lastT = 0;
    for (const e of sorted) lastT = Math.max(lastT, e.t);
    const len = opts.loopEnd && opts.loopEnd > 0 ? opts.loopEnd : lastT + 0.5;
    let base = ctx.currentTime + 0.2;
    let i = 0;
    const step = () => {
      if (!this.ctx) return;
      const horizon = this.ctx.currentTime + 0.12;
      while (i < sorted.length && base + sorted[i].t <= horizon) {
        const e = sorted[i];
        const when = base + e.t;
        if (e.k === "n" || e.k === "s") {
          this.playNote(
            e.idx ?? 12,
            (e.v ?? 8) / 15,
            cutoffFromIdx(e.c ?? 8),
            when,
            e.k === "s" ? 2.2 : 1,
          );
        } else if (e.k === "d") {
          this.playDrum(DRUM_KINDS[e.g ?? 0], ((e.v ?? 8) / 15) * 1.2, when);
        } else if (e.k === "p") {
          const ki = Math.min(PIANO_KEYS.length - 1, Math.max(0, e.ki ?? 0));
          const pk = PIANO_KEYS[ki];
          const black = e.b === 1 && pk.blackMidi !== null;
          const midi = black ? pk.blackMidi ?? pk.midi : pk.midi;
          const vel = (e.v ?? 10) / 15;
          this.playPiano(midi - PIANO_C3_MIDI, vel, when, e.s === 1, e.soft === 1);
          opts.onPiano?.(ki, black, vel);
        }
        i += 1;
      }
      if (i >= sorted.length) {
        if (opts.loop) {
          i = 0;
          base += len;
        } else {
          this.stopSequence();
          opts.onEnd?.();
        }
      }
    };
    this.stopSequence();
    this.seqTimer = window.setInterval(step, 25);
    step();
    return () => this.stopSequence();
  }

  get sequenceRunning(): boolean {
    return this.seqTimer !== null;
  }

  stopSequence(): void {
    if (this.seqTimer !== null) {
      window.clearInterval(this.seqTimer);
      this.seqTimer = null;
    }
  }

  // ---- 分轨混音：每个画布对象的生效音量/声像（solo/mute 折算后传入），发声瞬间生效 ----

  private mixMap = new Map<string, { gain: number; pan: number }>();

  setObjectMix(id: string, mix: { gain: number; pan: number } | null): void {
    if (!mix) this.mixMap.delete(id);
    else this.mixMap.set(id, mix);
  }

  // ---- 作曲对象独立循环调度：setCanvasLoops 原地更新事件、保留各循环时序 ----

  // 画布循环静音门控（退出作曲模式后台不出声）：静音时索引照常推进、相位不丢，回作曲模式无缝续播
  private canvasMuted = false;

  setCanvasMuted(on: boolean): void {
    this.canvasMuted = on;
  }

  // 伴奏临时暂停：冻结相位（不是快进静音），恢复时把停止时长从各循环相位里补掉，从暂停的那刻继续
  private canvasPaused = false;
  private canvasPausedAt = 0;

  setCanvasPaused(on: boolean): void {
    if (on === this.canvasPaused) return;
    this.canvasPaused = on;
    if (on) {
      this.canvasPausedAt = this.ctx?.currentTime ?? 0;
    } else if (this.ctx) {
      const gap = this.ctx.currentTime - this.canvasPausedAt;
      for (const st of this.canvasState.values()) st.base += gap;
      this.canvasSongBase += gap; // 曲线时间轴与各循环同步冻结
    }
  }

  get canvasIsPaused(): boolean {
    return this.canvasPaused;
  }

  setCanvasLoops(specs: LoopSpec[]): void {
    this.canvasSpecs = specs;
    const alive = new Set(specs.map((s) => s.id));
    for (const id of Array.from(this.canvasState.keys())) {
      if (!alive.has(id)) this.canvasState.delete(id);
    }
    if (this.ctx) this.ensureCanvasTimer();
  }

  canvasPhase(id: string): number | null {
    const st = this.canvasState.get(id);
    const sp = this.canvasSpecs.find((s) => s.id === id);
    if (!st || !sp || !this.ctx || sp.period <= 0) return null;
    const p = (this.ctx.currentTime - st.base) % sp.period;
    return (p + sp.period) % sp.period / sp.period;
  }

  // ---- 参数曲线自动化：画布循环音的音量/滤波/声像/混响随时间轴实时变化 ----

  /** 曲线激活时画布音的目标总线（无曲线 = null → 调用方走原直连，零成本直通） */
  get canvasOut(): AudioNode | null {
    return this.autoCurves.length > 0 ? this.canvasBus : null;
  }

  /** 声明当前画布上的全部曲线（全量替换）。period = 全局循环时间轴长度（秒）。
   *  画布循环各自独立周期、没有天然的统一 songTime，这里以「声明时刻 +0.2s 起、
   *  按 period 取模」定义统一时间轴，覆盖段之外的参数保持中性值。 */
  setCanvasAuto(period: number, curves: AutoCurve[]): void {
    const had = this.autoCurves.length > 0;
    this.autoCurves = curves;
    this.autoPeriod = Math.max(period, 0.001);
    if (curves.length > 0 && !had && this.ctx) {
      this.canvasSongBase = this.ctx.currentTime + 0.2;
    }
    if (had && curves.length === 0 && this.ctx) {
      this.resetAutoParams(); // 曲线清空：链复位中性（链本身常接、只是平时没有输入）
    }
    if (this.ctx) this.ensureCanvasTimer();
  }

  private resetAutoParams(): void {
    const ctx = this.ctx;
    if (!ctx || !this.canvasBus || !this.canvasFilter) return;
    this.canvasBus.gain.setTargetAtTime(AUTO_NEUTRAL.vol, ctx.currentTime, 0.02);
    this.canvasFilter.frequency.setTargetAtTime(
      200 * Math.pow(90, AUTO_NEUTRAL.cutoff),
      ctx.currentTime,
      0.02,
    );
    if (this.canvasPanNode) {
      this.canvasPanNode.pan.setTargetAtTime(AUTO_NEUTRAL.pan * 2 - 1, ctx.currentTime, 0.02);
    }
    if (this.canvasRevWet) {
      this.canvasRevWet.gain.setTargetAtTime(AUTO_NEUTRAL.reverb * 0.5, ctx.currentTime, 0.02);
    }
  }

  /** 每 tick 在当前 songTime 求值四条参数（后画的曲线覆盖先画的），平滑写入自动化节点 */
  private sampleAutomation(now: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.canvasBus || !this.canvasFilter) return;
    const period = this.autoPeriod;
    const songT = ((((now - this.canvasSongBase) % period) + period) % period);
    const val: Record<AutoCurve["param"], number> = { ...AUTO_NEUTRAL };
    // 反序扫描 = 数组里靠后（后画）的曲线命中即停，实现「重叠段后画者说了算」
    for (const p of ["vol", "cutoff", "pan", "reverb"] as const) {
      for (let i = this.autoCurves.length - 1; i >= 0; i -= 1) {
        const c = this.autoCurves[i];
        if (c.param !== p || songT < c.t0 || songT > c.t1) continue;
        val[p] = evalAutoCurve(c, songT);
        break;
      }
    }
    const tau = 0.02;
    this.canvasBus.gain.setTargetAtTime(val.vol, now, tau);
    // cutoff 对数映射：0→200Hz，1→18kHz（200×90）
    this.canvasFilter.frequency.setTargetAtTime(200 * Math.pow(90, val.cutoff), now, tau);
    if (this.canvasPanNode) {
      this.canvasPanNode.pan.setTargetAtTime(val.pan * 2 - 1, now, tau);
    }
    if (this.canvasRevWet) {
      // 曲线值 = 在 HUD 全局混响基准之上叠加的加料量（HUD 干路自带，这里只管加）
      this.canvasRevWet.gain.setTargetAtTime(Math.min(1, Math.max(0, val.reverb)) * 0.5, now, tau);
    }
  }

  private ensureCanvasTimer(): void {
    const wanted = this.canvasSpecs.length > 0 || this.autoCurves.length > 0;
    if (this.canvasTimer !== null && !wanted) {
      window.clearInterval(this.canvasTimer);
      this.canvasTimer = null;
      this.canvasState.clear();
      return;
    }
    if (this.canvasTimer === null && wanted && this.ctx) {
      const step = () => this.canvasStep();
      this.canvasTimer = window.setInterval(step, 25);
      step();
    }
  }

  private canvasStep(): void {
    const ctx = this.ctx;
    // 引擎挂起（切后台/挑战暂停）时冻结调度： currentTime 不推进时空转会重复排整串
    // 过期事件堆爆音源，恢复后循环长时间没声——这里直接跳过，等 running 再继续
    if (!ctx || this.canvasPaused || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const horizon = now + 0.12;
    // 曲线自动化采样（复用同一 lookahead tick，不另起定时器；h<horizon 内的小提前量
    // 对 25ms 级的参数曲线无感）
    if (this.autoCurves.length > 0) this.sampleAutomation(now);
    const autoOut = this.autoCurves.length > 0 ? this.canvasBus ?? undefined : undefined;
    for (const spec of this.canvasSpecs) {
      let st = this.canvasState.get(spec.id);
      if (!st) {
        st = { i: 0, base: ctx.currentTime + 0.2 };
        this.canvasState.set(spec.id, st);
      }
      // 允许一次步进跨多圈追上进度（长时间卡顿后不再拖半截循环）；
      // 明显已过期（>0.25s）的音符只前进指针不出声，避免追帧时炸出一坨糊音
      for (let guard = 0; guard < 64; guard += 1) {
        let progressed = false;
        while (st.i < spec.events.length && st.base + spec.events[st.i].t <= horizon) {
          const e = spec.events[st.i];
          const when = st.base + e.t;
          const mix = this.mixMap.get(spec.id);
          if (
            when > now - 0.25 &&
            !this.canvasMuted &&
            !this.masterMute &&
            (!mix || mix.gain > 0.001)
          ) {
            // 静音轨直接跳过发声；音量按系数缩、声像带进主总线；
            // 画布存在曲线时送进自动化链（canvasBus），否则维持原直连 master
            if (e.d !== undefined) {
              // AI 鼓律动线事件：走打字鼓组同款发声（分轨音量同样生效）
              this.playDrum(DRUM_KINDS[e.d] ?? DRUM_KINDS[0], Math.min(1, (mix ? e.v * mix.gain : e.v) * 1.1), when);
            } else {
              this.playNote(
                e.idx,
                mix ? e.v * mix.gain : e.v,
                cutoffFromIdx(e.c),
                when,
                undefined,
                spec.voice,
                mix?.pan,
                autoOut,
              );
            }
          }
          st.i += 1;
          progressed = true;
        }
        if (st.i >= spec.events.length && spec.period > 0) {
          st.i = 0;
          st.base += spec.period;
          continue;
        }
        if (!progressed) break;
      }
    }
  }

  // ---- 颗粒层：短包络微颗粒（正弦 + 随机噪声成分），纯合成无麦克风 ----

  playGrain(idx: number, vel: number, detuneCents: number, when?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = fin(when, ctx.currentTime + 0.004);
    const v = Math.min(1, Math.max(0.05, fin(vel, 0.5)));
    const freq = fin(this.freqOf(fin(idx, 12)) * Math.pow(2, fin(detuneCents, 0) / 1200), 220);
    const dur = 0.03 + Math.random() * 0.05;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 * v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
    if (Math.random() < 0.4) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = Math.min(9000, freq * 3);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.02 * v, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.8);
      src.connect(hp);
      hp.connect(ng);
      ng.connect(this.master);
      src.start(t);
      src.stop(t + dur);
    }
  }

  // ---- 环境层 pad：双失谐正弦 + 慢滤波扫动，极低音量的持续底噪 ----

  startPad(freq: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.pad) return;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 220;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.012, t + 3.5);
    const a = ctx.createOscillator();
    a.type = "sine";
    a.frequency.value = freq;
    const b = ctx.createOscillator();
    b.type = "sine";
    b.frequency.value = freq * 1.006;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.055;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 110;
    lfo.connect(lfoG);
    lfoG.connect(f.frequency);
    a.connect(f);
    b.connect(f);
    f.connect(g);
    g.connect(this.master);
    a.start(t);
    b.start(t);
    lfo.start(t);
    this.pad = { a, b, g, f, lfo };
  }

  setPadFreq(freq: number): void {
    if (!this.pad || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.pad.a.frequency.setTargetAtTime(freq, t, 0.8);
    this.pad.b.frequency.setTargetAtTime(freq * 1.006, t, 0.8);
  }

  stopPad(): void {
    const p = this.pad;
    if (!p || !this.ctx) return;
    const t = this.ctx.currentTime;
    p.g.gain.cancelScheduledValues(t);
    p.g.gain.setTargetAtTime(0.0001, t, 0.5);
    p.a.stop(t + 2);
    p.b.stop(t + 2);
    p.lfo.stop(t + 2);
    this.pad = null;
  }

  get padActive(): boolean {
    return this.pad !== null;
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  dispose(): void {
    this.stopSequence();
    this.stopSustain();
    this.pedalOn = false;
    this.softOn = false;
    this.pianoBus = null;
    this.pianoTone = null;
    this.pianoVoices = [];
    this.setCanvasLoops([]);
    if (this.canvasTimer !== null) {
      window.clearInterval(this.canvasTimer);
      this.canvasTimer = null;
    }
    this.pad = null;
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.canvasBus = null;
    this.canvasFilter = null;
    this.canvasPanNode = null;
    this.canvasRevWet = null;
    this.autoCurves = [];
    this.autoPeriod = 0;
  }

  private noiseBuf(): AudioBuffer {
    const ctx = this.ctx;
    if (!ctx) throw new Error("audio engine not ready");
    if (!this.noise) {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noise = buf;
    }
    return this.noise;
  }
}
