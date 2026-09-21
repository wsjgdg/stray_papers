// 滚动乐团 · 哼唱转音符（人声 → 音高轮廓 → 作曲对象，纯本地 Web Audio 分析，零依赖）
// 链路：HumTracker（话筒拾音 + YIN 基频，分析支路只读数据、不接任何发声总线）
//   → segmentHum（帧序列分段成「音」）→ humToStroke（音列 → 阶梯折线 CanvasObject，
//   经 compileStroke 既有编译入口重建 audio 曲线，与手画线同权：可卷帘/变形/接龙/发布）。
// YIN 参数：窗 1024（48kHz 下 ≈21ms）、每 rAF 帧一窗（hop≈16.7ms，帧内 O(N²/2)≈26 万次内）、
//   差分 + 累计归一（CMN）+ 抛物线插值，清晰度阈值 0.2，频率夹 60–1600Hz。

import {
  compileStroke,
  type CanvasObject,
  type CanvasPt,
} from "@/lib/canvas/scoreCanvas";
import { bandRange, scaleMidi, type Scale } from "@/lib/audio/scales";

export interface HumFrame {
  t: number; // 秒（performance 时基，与 CanvasPt.t 同域）
  freqHz: number; // 基频（未判有声时可能是上次值或 0，看 voiced）
  clarity: number; // YIN CMN 谷值：越小越清晰
  rms: number; // 短时能量（0..1 量级）
  voiced: boolean; // 清晰度 + 频率范围 + 能量三判据都过
}

export interface HumNote {
  startSec: number;
  endSec: number;
  midiF: number; // 绝对 MIDI 音高（带小数）
  rms: number; // 句内平均能量
}

export interface HumPhrase {
  notes: HumNote[];
  phraseSec: number; // 首音起点到末音终点
  avgMidi: number; // 按音长加权的平均音高（摘要「平均音区」用）
}

const YIN_WINDOW = 1024;
const CLARITY_THRESHOLD = 0.2;
const FREQ_MIN = 60;
const FREQ_MAX = 1600;
const VOICE_RMS_FLOOR = 0.008;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Hz → 绝对 MIDI（A4=69=440Hz） */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(Math.max(1, hz) / 440);
}

/** MIDI → 音区词 + 近似音名（摘要「平均音区」用） */
export function midiZoneWord(midiF: number): string {
  const rounded = Math.round(midiF);
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const name = `${names[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
  const zone = midiF < 55 ? "低音区" : midiF > 72 ? "高音区" : "中音区";
  return `${zone} · 约 ${name}`;
}

/** YIN 基频检测：返回 {freqHz, clarity}（clarity = 选定谷的 CMN 值，缺谷记 1） */
export function yinDetect(buf: Float32Array, sampleRate: number): { freqHz: number; clarity: number } {
  const n = buf.length;
  const half = n >> 1;
  const d = new Float32Array(half);
  for (let tau = 1; tau < half; tau += 1) {
    let sum = 0;
    for (let i = 0; i + tau < n; i += 1) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // 累计归一差分：cm[tau] = d[tau] / mean(d[1..tau])
  const cm = new Float32Array(half).fill(1);
  let running = 0;
  for (let tau = 1; tau < half; tau += 1) {
    running += d[tau];
    cm[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  // 首个下穿阈值的谷（沿下行走到局部极小）
  let tau = -1;
  for (let i = 1; i < half - 1; i += 1) {
    if (cm[i] < CLARITY_THRESHOLD) {
      while (i + 1 < half - 1 && cm[i + 1] < cm[i]) i += 1;
      tau = i;
      break;
    }
  }
  if (tau < 1) return { freqHz: 0, clarity: 1 };
  // 抛物线插值亚格化
  let tStar = tau;
  const s0 = cm[tau - 1];
  const s1 = cm[tau];
  const s2 = cm[tau + 1];
  const denom = s0 - 2 * s1 + s2;
  if (denom !== 0) tStar = tau + (0.5 * (s0 - s2)) / denom;
  tStar = clamp(tStar, 1, half - 2);
  return { freqHz: clamp(sampleRate / tStar, FREQ_MIN, FREQ_MAX), clarity: s1 };
}

/**
 * 哼唱拾音器：自建分析用 AudioContext（不碰引擎主总线），
 * MediaStreamSource → AnalyserNode 即止（不接 destination，绝不出声），rAF 逐帧 YIN。
 * stop() 释放话筒轨道、断开节点、关闭自有 ctx。
 */
export class HumTracker {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buf = new Float32Array(YIN_WINDOW);
  private raf = 0;
  private running = false;

  /** 用户手势里同步 new AudioContext（避免 iOS 手势链断裂），再挂流开环 */
  start(stream: MediaStream, onFrame: (f: HumFrame) => void): Promise<void> {
    this.stop();
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.stream = stream;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = YIN_WINDOW;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser); // 只到分析器为止：无 destination 连线 = 零发声
    this.source = source;
    this.analyser = analyser;
    this.running = true;
    const loop = () => {
      if (!this.running || !this.analyser) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      const { freqHz, clarity } = yinDetect(this.buf, ctx.sampleRate);
      let sq = 0;
      for (let i = 0; i < this.buf.length; i += 1) sq += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(sq / this.buf.length);
      const voiced =
        clarity < CLARITY_THRESHOLD &&
        freqHz >= FREQ_MIN &&
        freqHz <= FREQ_MAX &&
        rms > VOICE_RMS_FLOOR;
      onFrame({ t: performance.now() / 1000, freqHz, clarity, rms, voiced });
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    return ctx.state === "suspended" ? ctx.resume().catch(() => undefined) : Promise.resolve();
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.source = null;
    this.analyser = null;
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.stream = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);
  }
}

// ---- 分段：帧序列 → 「音」列表 ----

interface NoteAcc {
  t0: number;
  t1: number;
  midiSum: number;
  count: number;
  rmsSum: number;
}

function accFrom(f: HumFrame): NoteAcc {
  return { t0: f.t, t1: f.t, midiSum: hzToMidi(f.freqHz), count: 1, rmsSum: f.rms };
}

function accMidi(a: NoteAcc): number {
  return a.midiSum / a.count;
}

/**
 * 帧 → 音列。规则：静音 gap > 120ms 断句；句内 ±0.5 半音容差连续同级归并成一个音；
 * 跳变 > 0.6 半音且新值连续稳定 60ms 才换音；有效音最短 80ms。
 */
export function segmentHum(frames: HumFrame[]): HumPhrase {
  // 1) 按 gap > 120ms 切句（未判有声的帧不进句，其时长靠后继帧的 gap 体现）
  const groups: HumFrame[][] = [];
  let group: HumFrame[] = [];
  for (const f of frames) {
    if (!f.voiced) continue;
    if (group.length > 0 && f.t - group[group.length - 1].t > 0.12) {
      groups.push(group);
      group = [];
    }
    group.push(f);
  }
  if (group.length > 0) groups.push(group);

  // 2) 句内归并成音
  const notes: HumNote[] = [];
  const push = (a: NoteAcc) => {
    if (a.t1 - a.t0 < 0.08) return; // < 80ms 的碎音丢弃
    notes.push({
      startSec: a.t0,
      endSec: a.t1,
      midiF: accMidi(a),
      rms: a.rmsSum / a.count,
    });
  };
  for (const g of groups) {
    let cur: NoteAcc | null = null;
    let cand: NoteAcc | null = null;
    for (const f of g) {
      const m = hzToMidi(f.freqHz);
      if (!cur) {
        cur = accFrom(f);
        cand = null;
        continue;
      }
      const curM = accMidi(cur);
      if (Math.abs(m - curM) <= 0.5) {
        // 同级延伸
        cur.t1 = f.t;
        cur.midiSum += m;
        cur.count += 1;
        cur.rmsSum += f.rms;
        cand = null;
      } else if (m - curM > 0.6 || curM - m > 0.6) {
        // 疑似换音：候选独立归并，稳定 60ms 才生效
        if (cand && Math.abs(m - accMidi(cand)) <= 0.5) {
          cand.t1 = f.t;
          cand.midiSum += m;
          cand.count += 1;
          cand.rmsSum += f.rms;
        } else {
          cand = accFrom(f);
        }
        if (cand.t1 - cand.t0 >= 0.06) {
          push(cur);
          cur = cand;
          cand = null;
        }
      }
      // 0.5–0.6 半音之间的摆动：既不算同级也不算换音，忽略当帧保持当前音
    }
    if (cur) push(cur);
  }

  if (notes.length === 0) return { notes: [], phraseSec: 0, avgMidi: 0 };
  const first = notes[0];
  const last = notes[notes.length - 1];
  let wsum = 0;
  let msum = 0;
  for (const nt of notes) {
    const w = Math.max(0.01, nt.endSec - nt.startSec);
    wsum += w;
    msum += nt.midiF * w;
  }
  return { notes, phraseSec: last.endSec - first.startSec, avgMidi: msum / wsum };
}

// ---- 音列 → 画布笔迹 ----

export interface HumStrokeOpts {
  scale: Scale;
  bpm: number;
  snapScale: boolean; // 贴音阶：midi 就近吸附音阶合法级（关 = 轮廓连续滑音）
  quantBeat: boolean; // 对拍子：音起止对齐 1/4 拍网格
  lockBeats?: number; // 接龙锁：整段线性压进该拍数（4）
}

// FULL_WIDTH_BEATS=12 与 compileStroke 同构：点列横向总长 loopBeats/12 时，
// 编译入口反推出的 loopBeats 恰为目标整拍数——循环时长走现成几何真源，不手填曲线
const SPAN_PER_BEAT = 1 / 12;
const X_LEFT = 0.06;

/**
 * midi → 音级索引（全带搜索，浮点）。贴音阶 = 就近合法级；不贴 = 相邻合法级间线性插值。
 * 修复（用户报障「哼唱只出一个音」）：旧版搜索窗从 idx=1 起（= C3/MIDI 48）只向上展开，
 * 哼唱落在 C3 以下（人哼唱多在大字组~小字一组，拾音下限 60Hz≈MIDI 35）时全部被夹到
 * 同一个下缘合法音、lo 下界兜底永远缺位，轮廓整个塌缩。现窗口下探 4 个八度（scaleMidi
 * 的负 idx 天然成立），上下都覆盖拾音范围；八度适配交给下游秩重排/平移。
 */
function midiToIdx(m: number, scale: Scale, snap: boolean): number {
  const n = scale.semitones.length;
  const IDX_LO = -4 * n; // 五声下 -20 级 ≈ MIDI 12，远低于拾音下限 MIDI 35
  const IDX_HI = 8 * n; // 上到 ~MIDI 145，远高于拾音上限 1600Hz≈MIDI 86
  let bestIdx = 0;
  let bestD = Infinity;
  let lo = 0;
  let loM = -Infinity;
  for (let idx = IDX_LO; idx <= IDX_HI; idx += 1) {
    const mm = scaleMidi(scale, idx);
    const d = Math.abs(mm - m);
    if (d < bestD) {
      bestD = d;
      bestIdx = idx;
    }
    if (mm <= m && mm > loM) {
      loM = mm;
      lo = idx;
    }
  }
  if (snap) return bestIdx;
  if (!isFinite(loM) || lo + 1 > 8 * n) return bestIdx; // 哼在音阶表下缘之外：退回最近级
  const hiM = scaleMidi(scale, lo + 1);
  const f = hiM - loM > 1e-6 ? clamp((m - loM) / (hiM - loM), 0, 1) : 0;
  return lo + f;
}

/**
 * 音列 → 一条「阶梯折线笔迹」CanvasObject。
 * 点列 x 均匀铺开（时间）、y 按音级（贴音阶开关联动）、t 编码速度（compileStroke 的
 * sampleCurves 按 dx/dt 反推 velocityCurve——力度随 rms 通过 t 走既有编译入口）；
 * loopBeats 由 x 总长经 compileStroke 反推出整拍。
 */
export function humToStroke(notes: HumNote[], opts: HumStrokeOpts): CanvasObject | null {
  if (notes.length === 0) return null;
  const scale = opts.scale;
  const n = scale.semitones.length; // 八度周期（级/八度）——整体贴回音区时的八度步移用
  const range = bandRange(scale); // 画布大区 E2–C6（与渲染/编译同一真源）
  const B = range.degs;

  // 音域适配（音区 = 画布纵向可见区）：哼在 E2–C6 内 → 直接保持绝对音高落位；
  // 超出 → 先按整八度平移贴边（音级形状不动），跨度仍大于大区时按比例压缩。
  // 旧版把一切秩重排压进单八度、哼唱音域被迫塌成画布一屏，随画布音区拓宽一并废除。
  let degs = notes.map((nt) => midiToIdx(nt.midiF, scale, opts.snapScale) - range.lo);
  let lo = Math.min(...degs);
  let hi = Math.max(...degs);
  const EPS = 0.02; // 只防浮点尾差；边界音（音区最低/最高合法级）本就合法落位，不额外留边
  if (hi - lo > B - 1 - EPS) {
    const k = (B - 1 - EPS) / Math.max(1e-6, hi - lo);
    degs = degs.map((d) => lo + (d - lo) * k);
    hi = lo + (hi - lo) * k;
  }
  let shift = 0;
  if (lo < 0) shift = Math.ceil(-lo / n) * n; // 低于音区：整八度抬上来（音级形状不动）
  if (hi + shift > B - 1) shift -= Math.ceil((hi + shift - (B - 1)) / n) * n; // 高于：整八度压回去
  if (lo + shift < 0) shift = -lo; // 极端残差（八度步跨不进带时）：线性最小平移兜底
  degs = degs.map((d) => d + shift);

  // 拍位：量化到 1/4 拍网格（开关），循环总拍 = 哼唱拍数向上取整（接龙锁 4 拍时全段线性压进）
  const beat = 60 / clamp(opts.bpm, 40, 240);
  const t0 = notes[0].startSec;
  const quant = (b: number): number => (opts.quantBeat ? Math.round(b * 4) / 4 : b);
  const rawTotal = Math.max(0.25, (notes[notes.length - 1].endSec - t0) / beat);
  const totalBeats = quant(rawTotal);
  const loopBeats = clamp(opts.lockBeats ?? Math.ceil(totalBeats), 2, 12);
  const span = loopBeats * SPAN_PER_BEAT;
  const xOf = (b: number): number => X_LEFT + (b / totalBeats) * span;

  // 力度：句内相对响度 → 目标 velocity（0.2..0.76）
  let rmin = Infinity;
  let rmax = -Infinity;
  for (const nt of notes) {
    if (nt.rms < rmin) rmin = nt.rms;
    if (nt.rms > rmax) rmax = nt.rms;
  }
  const rspan = Math.max(1e-6, rmax - rmin);

  // 阶梯点列（t 编码速度）：横段 dt 由目标 velocity 反推；上限 29 音防 downsample 截断
  const pts: CanvasPt[] = [];
  let t = 0;
  const MAX_STEP = 29;
  for (let k = 0; k < notes.length && pts.length < MAX_STEP * 2; k += 1) {
    const nt = notes[k];
    const startB = Math.max(k > 0 ? quant((notes[k - 1].endSec - t0) / beat) : 0, quant((nt.startSec - t0) / beat));
    const endB = k + 1 < notes.length ? Math.max(startB, quant((notes[k + 1].startSec - t0) / beat)) : Math.max(totalBeats, startB + 0.03);
    const xA = xOf(startB);
    const xB = xOf(endB);
    const dx = xB - xA;
    if (dx < 0.004) continue; // 量化塌缩的碎音并入前音（前音右界自然延长）
    const y = 1 - (degs[k] + 0.5) / B;
    const vel = 0.2 + 0.56 * ((nt.rms - rmin) / rspan);
    let sp = clamp((vel - 0.18) / 0.6, 0.02, 1);
    sp = Math.min(sp, dx / (1.1 * 0.012)); // dt 下限 12ms：velocity 分辨率优雅退化
    const dt = Math.max(dx / (sp * 1.1), 0.001);
    pts.push({ x: xA, y, t });
    pts.push({ x: xB, y, t: t + dt });
    t += dt + 0.001; // 竖直跳段的微步长
  }
  if (pts.length < 4) return null;

  // 既有编译入口：pitchCurve/velocityCurve/loopBeats 全部由几何反推（与手画线同权）
  const obj = compileStroke(pts, B);
  obj.audio.closed = false; // 哼唱谱永不判成闭合琶音
  obj.audio.loopBeats = loopBeats; // 浮点尾差兜底：锁回整拍目标
  return obj;
}
