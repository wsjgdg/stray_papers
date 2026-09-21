// 滚动乐团 · Canvas 视觉渲染（粒子对象池 + 光带拖尾 + 冲击波 + 作曲对象）
// 绘制色相在 canvas 运行时计算，DOM 层仍全部使用设计 token。

import { CURVE_PARAM_META, closingNear, handlePoint, type CanvasObject, type CanvasPt } from "@/lib/canvas/scoreCanvas";
import { PIANO_KEYS, midiNoteName, pianoKeyLabel, pianoPosOfMidi } from "@/lib/audio/pianoMap";
import { PERFECT_EDGE_MS, type ChartNote, type FingerMark, type JudgeKind } from "@/lib/audio/challenge";

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max?: number;
  size: number;
  hue: number;
  lit: number;
  char?: string;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  speed: number;
  max: number;
  hue: number;
  alpha: number;
}

interface TrailPt {
  x: number;
  y: number;
  born: number;
  hue: number;
  bright: number;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
}

export const PENTA_HUES = [196, 262, 322, 38, 152];

// 色盲友好配色（Okabe-Ito 安全色基底的五色）：五音级换用红绿色盲下仍可分辨的色相，
// 并按音级附加明度差（cbLightOff），色相几乎分不出时靠明暗兜底。
// 模块级开关：作曲参考线 / 背景琴键 / 下落块 / 冲击波 / 草稿全部共用 hueOfDeg 单一真源，
// 一处切换全站换色（渲染层与 Logic 侧 setDraft 传色相同步生效）。
const CB_HUES = [200, 39, 329, 54, 164];
const CB_L_OFF = [2, -3, 3, 14, -10];
let CB_ON = false;

/** 色盲模式下的逐音级明度补偿（非色盲模式恒 0，可直接加进 L 分量） */
export function cbLightOff(deg: number): number {
  if (!CB_ON) return 0;
  return CB_L_OFF[((deg % 5) + 5) % 5];
}

/** 音级 → 色相：色相映射不随音阶改变（同色相循环、亮度随力度）；色盲模式自动换安全色盘 */
export function hueOfDeg(deg: number): number {
  const m = ((deg % 5) + 5) % 5;
  return CB_ON ? CB_HUES[m] : PENTA_HUES[m];
}
const DRUM_HUES = [210, 268, 320, 42];
const MAX_POOL = 700;
const REDUCED_POOL = 160;
// 性能模式粒子池上限（介于 reduced 与全量之间，保留基本冲击感）
const PERF_POOL = 180;
const TRAIL_KEEP = 48;
const TRAIL_AGE = 0.45;

export class VisualRenderer {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private pool: Particle[] = [];
  private cap = MAX_POOL;
  private ripples: Ripple[] = [];
  private trail: TrailPt[] = [];
  private dust: Dust[] = [];
  private raf = 0;
  private last = 0;
  // FPS 采样（每秒向 Logic 报一次，供性能模式自动降级判断）
  private fpsCb: ((fps: number) => void) | null = null;
  private fpsCount = 0;
  private fpsSince = 0;
  private hue = 215;
  private hueTarget = 215;
  private bright = 0.55;
  private speed = 0.2;
  private down = false;
  private downX = 0;
  private downHue = 196;
  private shake = 0;
  private reduced = false;
  private perf = false;
  // 无障碍：色盲友好配色（红闪/判定字换安全色相）+ 纯视觉节奏模式（判定线/闪烁/判定文字增强）
  private cb = false;
  private vis = false;
  private compose = false;
  private scaleDegs = 5;
  private voiceStyle = "glass";
  private trailAge = TRAIL_AGE;
  private objs: CanvasObject[] = [];
  private selectedId = "";
  // AI 指挥台建议 hover 描边：对应对象画虚线轮廓（只跟随建议面板，不参与选中/编辑语义）
  private highlightIds: string[] = [];
  private phaseOf: ((id: string) => number | null) | null = null;
  // 接龙态渲染：前人对象（索引 < relayAll）压成淡影；其中最后一棒（索引 >= relayLastStart）
  // 的点集水平包围盒右半段以更亮描边叠加（"接得上的那口气"）。-1 = 非接龙态
  private relayAll = -1;
  private relayLastStart = -1;
  private draft: CanvasPt[] | null = null;
  // 草稿笔迹色相（Logic 随点传入）：闭合临近虚线预览跟随笔迹色
  private draftHue = 196;
  // 草稿正在画参数曲线：虚线 + 参数色，且不显示闭合临近预览（曲线不是音符）
  private draftCurve = false;
  // 背景钢琴层（打字=钢琴模式时的半透明键盘叠加）
  private pianoBg = false;
  private pianoPress = new Map<number, { t0: number; vel: number }>();
  private pedalGlow = false;
  private softDim = false;
  // 挑战模式层：下落音符块 + 判定线 + 判定文字 / Miss 轨道红闪
  private challengeOn = false;
  private chart: ChartNote[] = [];
  private chartTime: (() => number) | null = null;
  private fall = 2;
  private beatSec = 0; // 节拍网格周期（秒）；0 = 不绘制
  private judgeFx: {
    key: number;
    kind: JudgeKind;
    t0: number;
    hintKey?: number;
    hintBlack?: boolean;
    dtMs?: number;
  }[] = [];
  private laneFlash: { key: number; t0: number }[] = [];
  // 双音预警组：同一拍位到达（Δt<20ms）的 ≥2 个音符 → 提前脉冲闪烁 + 连线提示同按
  private chartDoubles: { t: number; keys: number[] }[] = [];
  // Perfect 边缘带（|Δt|≥60ms 的压点边缘命中）→ 判定点星芒闪光 + 外扩圆环
  private edgeFx: { key: number; t0: number }[] = [];
  // 演奏遥测（力度条 + 调制环，右下角）：telemetry() 推入，frame 里随空闲衰减淡出
  private telVel = 0;
  private telCut = 0;
  private telHue = 210;
  private telShow = 0;
  private telPeak = 0;
  private telVoice = "";
  // 遥测整体上移量（触屏键盘浮出时抬高，避免被键盘条盖住）
  private telOff = 0;

  setTelOffset(px: number): void {
    this.telOff = px;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.resize();
    this.seedDust();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.seedDust();
  }

  setReducedMotion(b: boolean): void {
    this.reduced = b;
    this.cap = this.perf ? PERF_POOL : b ? REDUCED_POOL : MAX_POOL;
  }

  /** 性能模式：砍粒子池 / 停光带拖尾与碎光 / 去抖动，保留判定与谱面等关键视觉 */
  setPerfMode(b: boolean): void {
    this.perf = b;
    if (b) this.shake = 0;
    this.cap = b ? PERF_POOL : this.reduced ? REDUCED_POOL : MAX_POOL;
    this.seedDust();
  }

  /** 每秒一次的帧率回调；Logic 据此做「低于 30fps 自动降级」 */
  setFpsListener(cb: ((fps: number) => void) | null): void {
    this.fpsCb = cb;
    this.fpsCount = 0;
    this.fpsSince = performance.now();
  }

  /** 色盲友好配色：音级色相换 Okabe-Ito 安全色盘（模块级，作曲/琴键/下落块同源换色），红闪与 Miss 字换朱红 */
  setCbMode(b: boolean): void {
    CB_ON = b;
    this.cb = b;
  }

  /** 纯视觉节奏模式：判定线加粗增亮、Miss 轨道闪加强、判定文字放大（配合静音游玩挑战） */
  setVisualMode(b: boolean): void {
    this.vis = b;
  }

  /** AI 合奏回应音：琴键上方浮一枚蓝色「♪」+ 小涟漪，把你的音符和它的区分开（性能/reduced 下省掉） */
  jamPulse(midi: number, vel: number): void {
    if (this.reduced || this.perf) return;
    const pos = pianoPosOfMidi(midi);
    if (!pos) return;
    const x = (pos.key + 0.5) * (this.w / PIANO_KEYS.length);
    const y = this.judgeY() - 12;
    this.ripples.push({ x, y, r: 6, speed: 120, max: 56, hue: 215, alpha: 0.45 });
    this.spawn({
      x: x + (Math.random() - 0.5) * 12,
      y,
      vx: (Math.random() - 0.5) * 14,
      vy: -30 - vel * 46,
      life: 0.9 + Math.random() * 0.3,
      size: 12,
      hue: 215,
      lit: 74,
      char: "♪",
    });
  }

  setCompose(on: boolean): void {
    this.compose = on;
    if (!on) this.draft = null;
  }

  /** 作曲参考线数量 = 画布音区（E2–C6 大区）级数（唯一真源 scales.bandRange） */
  setScaleDegs(n: number): void {
    this.scaleDegs = Math.max(1, Math.min(32, Math.round(n)));
  }

  /** 音色视觉联动：chip 更硬直角描边、bell 尾迹加长（色相仍映射音级） */
  setVoiceStyle(id: string): void {
    this.voiceStyle = id;
    this.trailAge = id === "bell" ? TRAIL_AGE * 2.3 : id === "chip" ? TRAIL_AGE * 0.75 : TRAIL_AGE;
  }

  setCanvasView(view: {
    objects: CanvasObject[];
    selectedId: string | null;
    phaseOf: ((id: string) => number | null) | null;
    relay?: { allCount: number; lastLegStartIdx: number } | null;
  }): void {
    this.objs = view.objects;
    this.selectedId = view.selectedId ?? "";
    this.phaseOf = view.phaseOf;
    this.relayAll = view.relay ? Math.max(0, view.relay.allCount) : -1;
    this.relayLastStart = view.relay ? Math.max(0, view.relay.lastLegStartIdx) : -1;
  }

  /** AI 建议 hover 高亮：给画布上对应对象描一圈虚线（hover 离开传空数组清除） */
  setHighlightIds(ids: string[]): void {
    this.highlightIds = ids;
  }

  setDraft(pts: CanvasPt[] | null, hue?: number, isCurve?: boolean): void {
    this.draft = pts;
    if (typeof hue === "number" && Number.isFinite(hue)) this.draftHue = hue;
    this.draftCurve = pts !== null && Boolean(isCurve);
  }

  /** 背景钢琴层开关（打字=钢琴模式时开启；关闭即隐藏并清空按压动画） */
  setPianoBg(on: boolean): void {
    this.pianoBg = on;
    if (!on) this.pianoPress.clear();
  }

  /** 钢琴延音踏板踩下：背景键盘层顶沿亮边提示（reduced-motion 时绘制端跳过） */
  setPedalGlow(on: boolean): void {
    this.pedalGlow = on;
  }

  /** 弱音器踏板踩下：背景钢琴键盘层整体亮度降至约75%（直接切换无动画，reduced-motion 下同样稳定） */
  setSoftPedalVisual(on: boolean): void {
    this.softDim = on;
  }

  /** 练习指法标注（与 chart 按索引对齐；演示/常规挑战传空 = 不画） */
  private chartFing: (FingerMark | null)[] = [];

  /** 跟随高亮：左右手各自「下一个该弹」音符在 chart 里的下标（-1 = 无）；命中后 Logic 随 judged 推进 */
  private chartActive = new Set<number>();

  /** 设置下落块跟随高亮（与 setChallenge 的 notes 索引对齐；-1 表示该手无高亮） */
  setChallengeActive(idxL: number, idxR: number): void {
    this.chartActive = new Set();
    if (idxL >= 0) this.chartActive.add(idxL);
    if (idxR >= 0 && idxR !== idxL) this.chartActive.add(idxR);
  }

  /** 挑战模式下落层开关：谱面事件 + 歌曲时钟 getter（返回谱内秒数；暂停 = 引擎 suspend 让 getter 自动冻结）
   *  + 下落时长 + 节拍秒（判定线上方节拍网格线周期，0 = 不绘制）
   *  + 可选指法表（仅练习态传，与 notes 索引对齐，块下音名旁追加「R3」小字） */
  setChallenge(
    on: boolean,
    notes: ChartNote[] | null,
    timeOf: (() => number) | null,
    fallSec: number,
    beatSec = 0,
    fingering?: (FingerMark | null)[] | null,
  ): void {
    this.challengeOn = on;
    this.chart = on && notes ? notes : [];
    this.chartFing = on && fingering ? fingering : [];
    this.chartTime = on ? timeOf : null;
    this.fall = Math.max(0.6, fallSec || 2);
    this.beatSec = on && beatSec > 0 ? beatSec : 0;
    // 扫一遍谱面归组同拍双音（notes 已按 t 升序；Δt<20ms 视为同拍到达）
    this.chartDoubles = [];
    for (let i = 0; i < this.chart.length; ) {
      let j = i + 1;
      while (j < this.chart.length && Math.abs(this.chart[j].t - this.chart[i].t) < 0.02) j += 1;
      if (j - i >= 2) this.chartDoubles.push({ t: this.chart[i].t, keys: this.chart.slice(i, j).map((n) => n.key) });
      i = j;
    }
    if (!on) {
      this.judgeFx = [];
      this.laneFlash = [];
      this.edgeFx = [];
      this.chartActive = new Set();
    }
  }

  /** 判定反馈：判定线上方文字短闪；Perfect 追加冲击波粒子（reduced-motion 仅文字）；
   *  Miss 该轨道红闪一次，hint 给出本应命中的键位 → MISS 文字下方追加「按 K」小字提示（黑键含 ⇧） */
  challengeFx(
    key: number,
    black: boolean,
    kind: JudgeKind,
    hint?: { key: number; black: boolean },
    dtMs?: number,
  ): void {
    const t = performance.now() / 1000;
    this.judgeFx.push({
      key,
      kind,
      t0: t,
      hintKey: kind === "miss" && hint ? hint.key : undefined,
      hintBlack: kind === "miss" && hint ? hint.black : undefined,
      dtMs: kind === "good" || kind === "perfect" ? dtMs : undefined,
    });
    // Perfect 边缘带（|Δt|≥60ms）：判定点追加星芒闪光（reduced-motion 不闪）
    if (kind === "perfect" && !this.reduced && !this.perf && dtMs !== undefined && Math.abs(dtMs) >= PERFECT_EDGE_MS) {
      this.edgeFx.push({ key, t0: t });
      if (this.edgeFx.length > 6) this.edgeFx.shift();
    }
    if (this.judgeFx.length > 12) this.judgeFx.shift();
    if (kind === "miss") {
      this.laneFlash.push({ key, t0: t });
      if (this.laneFlash.length > 8) this.laneFlash.shift();
      return;
    }
    // 性能模式：判定文字与 Miss 红闪保留，冲击波/星芒粒子全部省掉
    if (this.reduced || this.perf) return;
    const pk = PIANO_KEYS[Math.max(0, Math.min(PIANO_KEYS.length - 1, key))];
    const midi = black ? pk.blackMidi ?? pk.midi : pk.midi;
    const hue = hueOfDeg(midi);
    const x = (key + 0.5) * (this.w / PIANO_KEYS.length);
    const y = this.judgeY();
    if (kind === "perfect") {
      this.ripples.push({ x, y, r: 8, speed: 260, max: 150, hue, alpha: 0.85 });
      for (let i = 0; i < 12; i += 1) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        const sp = 60 + Math.random() * 220;
        this.spawn({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.35 + Math.random() * 0.4,
          size: 1.2 + Math.random() * 2,
          hue,
          lit: 65 + Math.random() * 20,
        });
      }
    } else {
      this.ripples.push({ x, y, r: 6, speed: 140, max: 70, hue, alpha: 0.5 });
    }
  }

  /** 背景键盘高度（drawPiano 与判定线共用唯一真源） */
  private pianoKeyH(): number {
    return Math.min(110, Math.max(52, this.h * 0.16));
  }

  /** 判定线 Y = 背景键盘上沿 */
  private judgeY(): number {
    return this.h - this.pianoKeyH();
  }

  /** 按压背景琴键：亮起 + 下沉几像素再弹回（约150ms 衰减；reduced-motion 只亮不沉） */
  pressPianoKey(index: number, isBlack: boolean, vel: number): void {
    if (!this.pianoBg) return;
    if (index < 0 || index >= PIANO_KEYS.length) return;
    this.pianoPress.set(index * 2 + (isBlack ? 1 : 0), {
      t0: performance.now() / 1000,
      vel: Math.min(1, Math.max(0, vel)),
    });
  }

  grainVisual(x: number, y: number, speed01: number, hue: number): void {
    if (this.reduced || this.perf) return;
    const n = 1 + Math.floor(speed01 * 3);
    for (let i = 0; i < n; i += 1) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 14,
        vx: (Math.random() - 0.5) * 80 * (0.4 + speed01),
        vy: (Math.random() - 0.5) * 80 * (0.4 + speed01),
        life: 0.25 + Math.random() * 0.35,
        size: 0.8 + Math.random() * 1.6,
        hue,
        lit: 60 + speed01 * 20,
      });
    }
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy(): void {
    this.stop();
    this.pool = [];
    this.ripples = [];
    this.trail = [];
  }

  pointerMove(x: number, y: number, speed01: number, bright01: number, hue: number): void {
    this.speed = speed01;
    this.bright = bright01;
    const now = performance.now() / 1000;
    // 性能模式：不记光带轨迹、不放随动碎光（遥测亮度照常更新）
    if (this.perf) return;
    this.trail.push({ x, y, born: now, hue, bright: bright01 });
    if (this.trail.length > TRAIL_KEEP) this.trail.shift();
    if (!this.reduced && speed01 > 0.25) {
      const n = 1 + Math.floor(speed01 * 3);
      for (let i = 0; i < n; i += 1) {
        this.spawn({
          x: x + (Math.random() - 0.5) * 8,
          y: y + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 30 - 10,
          life: 0.5 + Math.random() * 0.5,
          size: 1 + Math.random() * 2,
          hue,
          lit: 55 + bright01 * 20,
        });
      }
    }
  }

  pointerDown(x: number, hue: number): void {
    this.down = true;
    this.downX = x;
    this.downHue = hue;
  }

  pointerUp(): void {
    this.down = false;
  }

  /** 演奏遥测：每次发声推入当前力度与滤波截止（Hz 按 200~12000 对数归一），右下角力度条+调制环实时更新 */
  telemetry(vel01: number, cutoffHz: number, hue: number, voiceLabel?: string): void {
    this.telVel = Math.max(0, Math.min(1, vel01));
    const h = Math.max(200, Math.min(12000, cutoffHz));
    this.telCut = Math.log(h / 200) / Math.log(60);
    this.telHue = hue;
    this.telShow = 1;
    this.telPeak = Math.max(this.telVel, this.telPeak * 0.98);
    if (voiceLabel !== undefined) this.telVoice = voiceLabel;
  }

  /** 力度条瞬时峰值标记随时间回落 */
  private telPeakDecay(dt: number): void {
    this.telPeak *= Math.pow(0.5, dt);
  }

  /** 右下角遥测表：竖条=力度（含峰值刻线），圆环=滤波截止（开口朝下的 3/4 弧），空闲约 1.5s 淡出；
   *  reduced-motion 无动画但仍静态可读 */
  private drawTelemetry(g: CanvasRenderingContext2D): void {
    if (this.telShow <= 0.02) return;
    const a = Math.min(1, this.telShow);
    const cx = this.w - 44;
    const cy = this.h - 46 - this.telOff;
    const barX = cx - 40;
    const barH = 56;
    const barW = 5;
    const barY = cy - barH / 2;
    g.save();
    g.textAlign = "center";
    g.font = "8px ui-monospace, monospace";
    // 力度竖条：底向上填充，色相跟随当前音级
    const vh = Math.max(2, this.telVel * barH * a);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(barX, barY, barW, barH);
    g.fillStyle = `hsla(${Math.round(this.telHue)}, 85%, ${Math.round(45 + this.telVel * 25)}%, ${(0.35 + a * 0.5).toFixed(2)})`;
    g.fillRect(barX, barY + barH - vh, barW, vh);
    // 峰值刻线（保留片刻，帮玩家看见刚才那一下有多重）
    if (this.telPeak > 0.05) {
      const ph = this.telPeak * barH * a;
      g.strokeStyle = `rgba(255,255,255,${(0.4 + a * 0.3).toFixed(2)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(barX - 2, barY + barH - ph);
      g.lineTo(barX + barW + 2, barY + barH - ph);
      g.stroke();
    }
    g.fillStyle = `rgba(226,232,240,${(0.35 * a).toFixed(2)})`;
    g.fillText("力度", barX + barW / 2, barY + barH + 12);
    // 调制环：270° 量程弧（缺口朝下），填充比例=滤波截止归一值
    const R = 17;
    const A0 = Math.PI * 0.75;
    const SWEEP = Math.PI * 1.5;
    g.strokeStyle = "rgba(255,255,255,0.1)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, R, A0, A0 + SWEEP);
    g.stroke();
    g.strokeStyle = `hsla(${Math.round(this.telHue)}, 90%, 66%, ${(0.4 + a * 0.5).toFixed(2)})`;
    g.lineCap = "round";
    g.beginPath();
    g.arc(cx, cy, R, A0, A0 + SWEEP * Math.max(0.02, this.telCut * a));
    g.stroke();
    // 环心读数：Hz（≥1k 显示 k）
    const hz = 200 * Math.pow(60, this.telCut);
    g.fillStyle = `rgba(240,244,248,${(0.55 + a * 0.35).toFixed(2)})`;
    g.font = "bold 9px ui-monospace, monospace";
    g.fillText(hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`, cx, cy + 3);
    g.font = "8px ui-monospace, monospace";
    g.fillStyle = `rgba(226,232,240,${(0.35 * a).toFixed(2)})`;
    g.fillText("滤波", cx, cy + R + 13);
    // 动态音色档位小字（环下方，仅动色开启时由 Logic 推入）
    if (this.telVoice) {
      g.font = "bold 8px ui-monospace, monospace";
      g.fillStyle = `hsla(${Math.round(this.telHue)}, 85%, 70%, ${(0.45 + a * 0.4).toFixed(2)})`;
      g.fillText(this.telVoice, cx, cy + R + 25);
    }
    g.restore();
  }

  notePulse(idx: number, vel01: number, x: number, y: number): void {
    const hue = hueOfDeg(idx);
    this.ripples.push({
      x,
      y,
      r: this.reduced ? 30 : 8,
      speed: this.reduced ? 60 : 140 + vel01 * 220,
      max: 60 + vel01 * 180,
      hue,
      alpha: 0.5 + vel01 * 0.4,
    });
    if (this.reduced || this.perf) return;
    const n = 5 + Math.floor(vel01 * 16);
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 160 * (0.4 + vel01);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.9,
        size: 1.5 + Math.random() * 2.5,
        hue,
        lit: 50 + vel01 * 30,
      });
    }
  }

  drumPulse(gi: number, vel01: number): void {
    const hue = DRUM_HUES[gi % DRUM_HUES.length];
    this.shake = Math.min(10, this.shake + (this.reduced ? 1 : this.perf ? 0 : 3 + vel01 * 5));
    this.ripples.push({
      x: this.w / 2,
      y: this.h - 30,
      r: 10,
      speed: this.reduced ? 80 : 200,
      max: 120 + vel01 * 120,
      hue,
      alpha: 0.35 + vel01 * 0.3,
    });
    if (this.reduced || this.perf) return;
    for (let i = 0; i < 4; i += 1) {
      this.spawn({
        x: this.w / 2 + (Math.random() - 0.5) * 120,
        y: this.h - 24,
        vx: (Math.random() - 0.5) * 60,
        vy: -40 - Math.random() * 60,
        life: 0.4 + Math.random() * 0.5,
        size: 1.5 + Math.random() * 2,
        hue,
        lit: 60,
      });
    }
  }

  spawnShard(ch: string): void {
    if (this.reduced || this.perf) return;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i += 1) {
      this.spawn({
        x: this.w * (0.35 + Math.random() * 0.3),
        y: this.h * (0.6 + Math.random() * 0.25),
        vx: (Math.random() - 0.5) * 50,
        vy: -50 - Math.random() * 80,
        life: 0.8 + Math.random() * 0.7,
        size: 11 + Math.random() * 8,
        hue: DRUM_HUES[Math.floor(Math.random() * 4)],
        lit: 72,
        char: ch,
      });
    }
  }

  centerBurst(): void {
    const cx = this.w / 2;
    const cy = this.h / 2;
    for (let i = 0; i < 3; i += 1) {
      this.ripples.push({
        x: cx,
        y: cy,
        r: 10 + i * 30,
        speed: 260 + i * 90,
        max: Math.max(this.w, this.h),
        hue: 215,
        alpha: 0.6,
      });
    }
    if (this.reduced) return;
    for (let i = 0; i < 90; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 420;
      this.spawn({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1 + Math.random() * 1.4,
        size: 1.5 + Math.random() * 3,
        hue: 196 + Math.random() * 140,
        lit: 60 + Math.random() * 25,
      });
    }
  }

  private drawComposer(g: CanvasRenderingContext2D): void {
    // 水平参考线数量 = 画布音区级数（上=高；大区 E2–C6）
    const lines = this.scaleDegs;
    g.strokeStyle = "rgba(255,255,255,0.05)";
    g.lineWidth = 1;
    for (let i = 0; i < lines; i += 1) {
      const y = ((i + 0.5) / lines) * this.h;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(this.w, y);
      g.stroke();
    }

    const relayOn = this.relayAll >= 0;
    for (let oi = 0; oi < this.objs.length; oi += 1) {
      const o = this.objs[oi];
      // 接龙态：前人对象压淡影；最后一棒的右半段稍后提亮叠加；本棒新对象照常
      const ghost = relayOn && oi < this.relayAll;
      const brightHalf = ghost && oi >= this.relayLastStart;
      const sel = o.id === this.selectedId;
      const deg = o.audio.pitchCurve[0] ?? 0;
      const hue = hueOfDeg(deg);
      const pts = o.points;
      if (pts.length === 0) continue;
      // AI 指挥台 hover 描边：虚线轮廓垫在对象本体之下（先画后被本体盖住中段，边缘露出 = 描边观感）
      if (!ghost && this.highlightIds.length > 0 && this.highlightIds.indexOf(o.id) >= 0) {
        g.setLineDash([5, 4]);
        g.lineWidth = 1.4;
        g.strokeStyle = "rgba(255,255,255,0.75)";
        if (o.type === "anchor") {
          const p = pts[0];
          g.beginPath();
          g.arc(p.x * this.w, p.y * this.h, 13, 0, Math.PI * 2);
          g.stroke();
        } else {
          g.beginPath();
          g.moveTo(pts[0].x * this.w, pts[0].y * this.h);
          for (let pi = 1; pi < pts.length; pi += 1) {
            g.lineTo(pts[pi].x * this.w, pts[pi].y * this.h);
          }
          g.stroke();
        }
        g.setLineDash([]);
      }
      if (o.type === "curve") {
        // 参数曲线：虚线 + 参数固定色相（与笔迹的音级色相体系区分开），起点旁标参数名。
        // 无播放头（不发音、无循环 spec），选中 = 提亮 + 右端手柄（拖手柄只拉时间跨度）
        const meta = o.curveParam ? CURVE_PARAM_META[o.curveParam] : null;
        const cHue = meta ? meta.hue : 196;
        g.lineCap = "round";
        g.lineJoin = "round";
        g.setLineDash([8, 6]);
        g.strokeStyle = `hsla(${cHue}, 85%, ${sel ? 78 : 62}%, ${ghost ? 0.1 : sel ? 0.95 : 0.5})`;
        g.lineWidth = sel ? 2.5 : 1.5;
        g.beginPath();
        g.moveTo(pts[0].x * this.w, pts[0].y * this.h);
        for (let i = 1; i < pts.length; i += 1) {
          g.lineTo(pts[i].x * this.w, pts[i].y * this.h);
        }
        g.stroke();
        g.setLineDash([]);
        if (!ghost) {
          g.font = "10px ui-monospace, monospace";
          g.fillStyle = `hsla(${cHue}, 85%, 74%, ${sel ? 0.95 : 0.7})`;
          g.fillText(meta ? meta.name : "曲线", pts[0].x * this.w + 4, Math.max(10, pts[0].y * this.h - 6));
        }
        if (sel) {
          const hnd = handlePoint(o);
          g.fillStyle = `hsla(${cHue}, 90%, 80%, 0.95)`;
          g.fillRect(hnd.x * this.w - 3, hnd.y * this.h - 3, 6, 6);
        }
        continue;
      }
      if (o.type === "anchor") {
        const p = pts[0];
        const r = 3.5 + (o.audio.velocityCurve[0] ?? 0.5) * 3.5;
        g.fillStyle = `hsla(${hue}, 85%, ${(60 + cbLightOff(deg) + (sel ? 15 : 0))}%, ${ghost ? 0.1 : sel ? 0.95 : 0.6})`;
        g.beginPath();
        g.arc(p.x * this.w, p.y * this.h, r, 0, Math.PI * 2);
        g.fill();
        if (sel) {
          g.strokeStyle = "rgba(255,255,255,0.9)";
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(p.x * this.w, p.y * this.h, r + 5, 0, Math.PI * 2);
          g.stroke();
        }
        continue;
      }
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = `hsla(${hue}, 85%, ${(sel ? 78 : 58 + cbLightOff(deg))}%, ${ghost ? 0.1 : sel ? 0.95 : 0.45})`;
      g.lineWidth = sel ? 2.5 : 1.4;
      g.beginPath();
      g.moveTo(pts[0].x * this.w, pts[0].y * this.h);
      for (let i = 1; i < pts.length; i += 1) {
        g.lineTo(pts[i].x * this.w, pts[i].y * this.h);
      }
      if (o.audio.closed) {
        g.closePath();
        g.strokeStyle = `hsla(${hue}, 85%, ${(sel ? 78 : 58 + cbLightOff(deg))}%, ${ghost ? 0.12 : sel ? 0.95 : 0.55})`;
      }
      g.stroke();
      // 接龙「最后 2 小节」：最后一棒对象的点集水平包围盒右半段以更亮描边叠加
      // （= 下一棒能参考的"那口气"）。逐段扫描，只算标量、不分配
      if (brightHalf && pts.length > 1) {
        let bx0 = Infinity;
        let bx1 = -Infinity;
        for (const p of pts) {
          if (p.x < bx0) bx0 = p.x;
          if (p.x > bx1) bx1 = p.x;
        }
        const mid = (bx0 + bx1) / 2;
        g.strokeStyle = `hsla(${hue}, 92%, 80%, 0.8)`;
        g.lineWidth = 1.8;
        g.beginPath();
        let inRun = false;
        for (let i = 0; i < pts.length; i += 1) {
          const on = pts[i].x >= mid;
          if (on) {
            if (inRun) g.lineTo(pts[i].x * this.w, pts[i].y * this.h);
            else {
              g.moveTo(pts[i].x * this.w, pts[i].y * this.h);
              inRun = true;
            }
          } else {
            inRun = false;
          }
        }
        g.stroke();
      }
      if (sel) {
        const hnd = handlePoint(o);
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.fillRect(hnd.x * this.w - 3, hnd.y * this.h - 3, 6, 6);
      }
      // 播放头：循环相位对应的轨迹位置点，音画同步的视觉指示（ghost 前人不画，保持安静的淡影）
      const phase = this.phaseOf && !ghost ? this.phaseOf(o.id) : null;
      if (phase !== null && pts.length > 1) {
        let x0 = Infinity;
        let x1 = -Infinity;
        for (const p of pts) {
          if (p.x < x0) x0 = p.x;
          if (p.x > x1) x1 = p.x;
        }
        const tx = x0 + (x1 - x0) * phase;
        let px = pts[0].x;
        let py = pts[0].y;
        for (let i = 1; i < pts.length; i += 1) {
          if (pts[i].x >= tx) {
            const f = pts[i].x - pts[i - 1].x > 1e-6 ? (tx - pts[i - 1].x) / (pts[i].x - pts[i - 1].x) : 0;
            px = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f;
            py = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f;
            break;
          }
        }
        g.fillStyle = `hsla(${hue}, 95%, ${72 + cbLightOff(deg)}%, 0.9)`;
        g.beginPath();
        g.arc(px * this.w, py * this.h, 3, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = `hsla(${hue}, 95%, 72%, 0.25)`;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(px * this.w, py * this.h, 8, 0, Math.PI * 2);
        g.stroke();
      }
    }

    // 绘制中的草稿笔画
    if (this.draft && this.draft.length > 1) {
      g.lineCap = "round";
      g.lineJoin = "round";
      if (this.draftCurve) {
        // 画曲线中：参数色虚线（与已落曲线同款语言），不做闭合临近预览
        g.setLineDash([8, 6]);
        g.strokeStyle = `hsla(${this.draftHue}, 90%, 74%, 0.9)`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(this.draft[0].x * this.w, this.draft[0].y * this.h);
        for (let i = 1; i < this.draft.length; i += 1) {
          g.lineTo(this.draft[i].x * this.w, this.draft[i].y * this.h);
        }
        g.stroke();
        g.setLineDash([]);
        return;
      }
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(this.draft[0].x * this.w, this.draft[0].y * this.h);
      for (let i = 1; i < this.draft.length; i += 1) {
        g.lineTo(this.draft[i].x * this.w, this.draft[i].y * this.h);
      }
      g.stroke();
      // 闭合临近预览：终点进入闭合判定阈值（scoreCanvas.closingNear，与编译判定同源）
      // 即画「终点→起点」虚线 + 起点目标圈，提示松手将闭合成琶音；未达阈值不显示
      if (closingNear(this.draft)) {
        const first = this.draft[0];
        const last = this.draft[this.draft.length - 1];
        g.setLineDash([6, 6]);
        g.strokeStyle = `hsla(${this.draftHue}, 85%, 72%, 0.6)`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(last.x * this.w, last.y * this.h);
        g.lineTo(first.x * this.w, first.y * this.h);
        g.stroke();
        g.setLineDash([]);
        g.beginPath();
        g.arc(first.x * this.w, first.y * this.h, 6, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }

  private pressLevel(slot: number, t: number, decay: number): number {
    const rec = this.pianoPress.get(slot);
    if (!rec) return 0;
    const age = t - rec.t0;
    if (age >= decay) {
      this.pianoPress.delete(slot);
      return 0;
    }
    return 1 - age / decay;
  }

  // 背景钢琴：画面底部一条贯穿全屏宽的键盘，恰好覆盖 26 个映射白键（C3 起升序）；
  // 白键等宽平铺、黑键按真实半音位置叠加右邻边界；色相跟随 hueOfDeg 音级规则，半透明叠加。
  private drawPiano(g: CanvasRenderingContext2D, t: number): void {
    // 弱音器踩下：整层键盘压暗到约75%（无动画直接切换）
    if (this.softDim) {
      g.save();
      g.globalAlpha = 0.75;
    }
    const n = PIANO_KEYS.length; // 26 白键
    const wk = this.w / n;
    const keyH = this.pianoKeyH();
    const baseY = this.h;
    const DECAY = 0.15;
    for (let i = 0; i < n; i += 1) {
      const pk = PIANO_KEYS[i];
      const hue = hueOfDeg(pk.midi);
      const press = this.pressLevel(i * 2, t, DECAY);
      const sink = this.reduced ? 0 : press * 5;
      const x = i * wk;
      const top = baseY - keyH + sink;
      g.fillStyle = `hsla(${hue}, ${Math.round(22 + press * 58)}%, ${Math.round(86 + press * 8)}%, ${(0.1 + press * 0.45).toFixed(2)})`;
      g.fillRect(x + 1, top, wk - 2, keyH);
      g.strokeStyle = `hsla(${hue}, 40%, 80%, ${(0.06 + press * 0.5).toFixed(2)})`;
      g.lineWidth = 1;
      g.strokeRect(x + 1, top, wk - 2, keyH);
      if (pk.blackMidi !== null) {
        const bpress = this.pressLevel(i * 2 + 1, t, DECAY);
        const bsink = this.reduced ? 0 : bpress * 4;
        const bh = keyH * 0.62;
        const bw = wk * 0.55;
        const bx = (i + 1) * wk - bw / 2;
        const bHue = hueOfDeg(pk.blackMidi);
        g.fillStyle = `hsla(${bHue}, ${Math.round(28 + bpress * 47)}%, ${Math.round(14 + bpress * 48)}%, ${(0.82 + bpress * 0.13).toFixed(2)})`;
        g.fillRect(bx, baseY - bh + bsink, bw, bh);
      }
    }
    // 音高标注：每个白键键面下缘画科学音名（等宽小字、半透明不抢戏，背景钢琴层开启时恒显示）；
    // 黑键在其位标更小的 D#/F#…，键面太窄（移动端）时黑键标注省略以免糊成一团
    const labelSize = Math.round(Math.max(7, Math.min(10, wk * 0.5)));
    g.textAlign = "center";
    g.font = `${labelSize}px ui-monospace, monospace`;
    for (let i = 0; i < n; i += 1) {
      const pk = PIANO_KEYS[i];
      g.fillStyle = "rgba(226,232,240,0.34)";
      g.fillText(midiNoteName(pk.midi), i * wk + wk / 2, baseY - 6);
    }
    if (wk >= 26) {
      g.font = `${Math.max(6, labelSize - 2)}px ui-monospace, monospace`;
      for (let i = 0; i < n; i += 1) {
        const pk = PIANO_KEYS[i];
        if (pk.blackMidi === null) continue;
        g.fillStyle = "rgba(236,240,245,0.5)";
        g.fillText(midiNoteName(pk.blackMidi), (i + 1) * wk, baseY - Math.max(4, keyH * 0.12));
      }
      g.font = `${labelSize}px ui-monospace, monospace`;
    }
    // 踏板踩下：键盘顶沿一条微弱亮边泛光（reduced-motion 跳过）
    if (this.pedalGlow && !this.reduced) {
      const top = baseY - keyH - 3;
      g.strokeStyle = "rgba(255,255,255,0.08)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, top);
      g.lineTo(this.w, top);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.3)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, top + 1);
      g.lineTo(this.w, top + 1);
      g.stroke();
    }
    if (this.softDim) g.restore();
  }

  // 挑战层：判定线贴键盘上沿；下落块 = 直角细条（宽 = 白键宽），色相按音级 hueOfDeg，
  // 黑键谱面块加白描边以示 Shift；判定文字在判定线上方短闪上飘；Miss 轨道红闪一次。
  private drawChallenge(g: CanvasRenderingContext2D, t: number): void {
    g.save();
    const now = this.chartTime ? this.chartTime() : 0;
    const wk = this.w / PIANO_KEYS.length;
    const judgeY = this.judgeY();
    // 纯视觉节奏模式：判定线增亮加粗（无声游玩时它是唯一的"何时按"锚点）
    g.strokeStyle = this.vis ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.22)";
    g.lineWidth = this.vis ? 2 : 1;
    g.beginPath();
    g.moveTo(0, judgeY + 0.5);
    g.lineTo(this.w, judgeY + 0.5);
    g.stroke();

    const BLOCK_H = 15;
    const TRAVEL = judgeY + 30; // 从顶部外 30px 处落到判定线
    // 节拍网格：随音符滚动的每拍细横线（与谱面节拍对齐，0 拍 = 首音符时刻），每 4 拍稍亮；
    // 静态横线无动画，reduced-motion 下照常绘制
    if (this.beatSec > 0 && this.chart.length > 0) {
      const origin = this.chart[0].t;
      const kFrom = Math.max(0, Math.floor((now - origin) / this.beatSec) - 1);
      const kTo = Math.ceil((now + this.fall - origin) / this.beatSec) + 1;
      for (let k = kFrom; k <= kTo; k += 1) {
        const dtn = origin + k * this.beatSec - now;
        const y = judgeY - (dtn / this.fall) * TRAVEL;
        if (y < -1 || y > judgeY - 1) continue;
        g.strokeStyle = k % 4 === 0 ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, y + 0.5);
        g.lineTo(this.w, y + 0.5);
        g.stroke();
      }
    }
    g.textAlign = "center";
    for (let ci = 0; ci < this.chart.length; ci += 1) {
      const n = this.chart[ci];
      const dtn = n.t - now;
      if (dtn < -0.25 || dtn > this.fall) continue;
      const pk = PIANO_KEYS[Math.max(0, Math.min(PIANO_KEYS.length - 1, n.key))];
      const midi = n.black ? pk.blackMidi ?? pk.midi : pk.midi;
      const hue = hueOfDeg(midi);
      const y = Math.min(judgeY, judgeY - (dtn / this.fall) * TRAVEL);
      const x = n.key * wk + 2;
      const near = Math.min(1, Math.max(0, 1 - Math.abs(dtn) / 0.4)); // 贴近判定线时增亮
      g.fillStyle = `hsla(${hue}, 82%, ${Math.round(58 + cbLightOff(midi) + near * 14)}%, ${(0.55 + near * 0.35).toFixed(2)})`;
      g.fillRect(x, y - BLOCK_H, wk - 4, BLOCK_H);
      if (n.black) {
        g.strokeStyle = "rgba(255,255,255,0.85)";
        g.lineWidth = 1;
        g.strokeRect(x + 0.5, y - BLOCK_H + 0.5, wk - 5, BLOCK_H - 1);
      }
      // 跟随高亮：该手「下一个该弹」的块加粗白描边，与控制条指法行亮格同源同步；
      // 纯静态描边无动画，reduced-motion 照常
      if (this.chartActive.has(ci)) {
        g.strokeStyle = "rgba(255,255,255,0.95)";
        g.lineWidth = 2;
        g.strokeRect(x + 1, y - BLOCK_H - 1.5, wk - 6, BLOCK_H + 3);
      }
      // 块面主视觉 = 要按的字母（白键 `J`、黑键 `⇧K`）：白键块深字、黑键块浅字，reduced-motion 无差别
      const fs = Math.max(9, Math.min(12, Math.floor(wk - 3)));
      g.font = `bold ${fs}px ui-monospace, monospace`;
      g.fillStyle = n.black ? "rgba(255,255,255,0.95)" : "rgba(16,20,26,0.9)";
      g.fillText(pianoKeyLabel(n.key, n.black), n.key * wk + wk / 2, y - BLOCK_H / 2 + fs * 0.36);
      // 音名降级为更小的字放块下方辅助；块太窄放不下时省略（字母优先）；
      // 练习态音名旁追加指法小字（如「A4 R3」「F#4 L2」），演示/常规无指法数据只画音名
      if (wk >= 30) {
        const fs2 = 8;
        g.font = `${fs2}px ui-monospace, monospace`;
        g.fillStyle = "rgba(226,230,240,0.42)";
        const fin = this.chartFing[ci];
        const name = midiNoteName(midi);
        g.fillText(fin ? `${name} ${fin.hand}${fin.finger}` : name, n.key * wk + wk / 2, y + fs2 + 2);
      }
    }

    // 双音提前预警：同拍双音符进入预警窗（≈0.8 拍，下限 0.6s）时，两轨道随接近脉冲闪烁、
    // 块间画虚线连接 + 「双键」小字，提示需同时按两键；reduced-motion 不闪烁、静态连线常亮
    if (this.chartDoubles.length > 0) {
      const WARN = Math.max(0.6, this.beatSec * 0.8);
      const pulse = this.reduced ? 0.5 : 0.32 + 0.22 * Math.sin(t * Math.PI * 5);
      g.textAlign = "center";
      for (const d of this.chartDoubles) {
        const dtn = d.t - now;
        if (dtn < -0.05 || dtn > WARN) continue;
        const y = Math.min(judgeY, judgeY - (dtn / this.fall) * TRAVEL);
        const xs = d.keys.map((k) => k * wk + wk / 2);
        const xL = xs[0] - wk / 2 + 2;
        const xR = xs[xs.length - 1] + wk / 2 - 2;
        // 两轨道整列微弱脉冲（reduced-motion 恒亮）
        g.fillStyle = `rgba(255,255,255,${(pulse * 0.07).toFixed(3)})`;
        for (const k of d.keys) g.fillRect(k * wk + 2, 0, wk - 4, judgeY);
        // 块间虚线连接 + 端点圆环
        g.strokeStyle = `rgba(255,255,255,${pulse.toFixed(2)})`;
        g.lineWidth = 1.5;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.moveTo(xL, y - BLOCK_H / 2);
        g.lineTo(xR, y - BLOCK_H / 2);
        g.stroke();
        g.setLineDash([]);
        for (const cx of xs) {
          g.beginPath();
          g.arc(cx, y - BLOCK_H / 2, 3, 0, Math.PI * 2);
          g.stroke();
        }
        // 「双键」小字浮在连线上方
        g.font = "bold 10px ui-monospace, monospace";
        g.fillStyle = `rgba(255,255,255,${(pulse + 0.25).toFixed(2)})`;
        g.fillText("双键", (xL + xR) / 2, y - BLOCK_H - 6);
      }
    }

    // Perfect 边缘带闪光：判定点 8 芒星刺外扩 + 外扩细圆环 + 「压点!」小字（reduced-motion 不触发）
    const nextEdge: { key: number; t0: number }[] = [];
    for (const e of this.edgeFx) {
      const age = t - e.t0;
      if (age >= 0.3) continue;
      nextEdge.push(e);
      const k = 1 - age / 0.3;
      const cx = (e.key + 0.5) * wk;
      const cy = judgeY - 4;
      g.strokeStyle = `hsla(48, 95%, 70%, ${(k * 0.9).toFixed(2)})`;
      g.lineWidth = 1.5;
      const r0 = 8 + age * 90;
      const r1 = r0 + 10;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + age * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.6);
        g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.6);
        g.stroke();
      }
      g.strokeStyle = `rgba(255,255,255,${(k * 0.5).toFixed(2)})`;
      g.beginPath();
      g.arc(cx, cy, 10 + age * 120, 0, Math.PI * 2);
      g.stroke();
      g.textAlign = "center";
      g.font = "bold 10px ui-monospace, monospace";
      g.fillStyle = `hsla(48, 95%, 72%, ${k.toFixed(2)})`;
      g.fillText("压点!", cx, cy - 26 - age * 16);
    }
    this.edgeFx = nextEdge;

    const nextFlash: { key: number; t0: number }[] = [];
    for (const f of this.laneFlash) {
      const age = t - f.t0;
      if (age >= 0.28) continue;
      nextFlash.push(f);
      // Miss 轨道闪：色盲模式换朱红（与绿色系块面不混色）；纯视觉模式闪得更重
      g.fillStyle = `hsla(${this.cb ? 25 : 0}, ${this.cb ? 85 : 80}%, ${this.cb ? 55 : 60}%, ${((1 - age / 0.28) * (this.vis ? 0.5 : 0.3)).toFixed(2)})`;
      g.fillRect(f.key * wk + 2, 0, wk - 4, judgeY);
    }
    this.laneFlash = nextFlash;

    const nextFx: { key: number; kind: JudgeKind; t0: number; hintKey?: number; hintBlack?: boolean; dtMs?: number }[] = [];
    g.textAlign = "center";
    g.font = `bold ${this.vis ? 15 : 12}px ui-monospace, monospace`;
    for (const fx of this.judgeFx) {
      const age = t - fx.t0;
      if (age >= 0.45) continue;
      nextFx.push(fx);
      const k = 1 - age / 0.45;
      const cx = (fx.key + 0.5) * wk;
      const cy = judgeY - 14 - age * 18;
      const label = fx.kind === "perfect" ? "PERFECT" : fx.kind === "good" ? "GOOD" : "MISS";
      g.fillStyle =
        fx.kind === "miss"
          ? `hsla(${this.cb ? 25 : 0}, ${this.cb ? 90 : 78}%, ${this.cb ? 64 : 62}%, ${k.toFixed(2)})`
          : fx.kind === "perfect"
            ? `rgba(255,255,255,${k.toFixed(2)})`
            : `rgba(190,200,210,${k.toFixed(2)})`;
      g.fillText(label, cx, cy);
      // Miss 时提示本应命中的键位（含 ⇧ 黑键提示），随文字一同上飘
      if (fx.kind === "miss" && fx.hintKey !== undefined) {
        g.font = "10px ui-monospace, monospace";
        g.fillStyle = `rgba(255,255,255,${(k * 0.85).toFixed(2)})`;
        g.fillText(`按 ${pianoKeyLabel(fx.hintKey, fx.hintBlack === true)}`, cx, cy + 12);
      }
      // Good 时显示偏差毫秒数（+ = 晚按，− = 早按），帮玩家校准手感
      if (fx.kind === "good" && fx.dtMs !== undefined) {
        const off = Math.round(fx.dtMs);
        g.font = "10px ui-monospace, monospace";
        g.fillStyle = `rgba(190,200,210,${(k * 0.9).toFixed(2)})`;
        g.fillText(`${off >= 0 ? "+" : "−"}${Math.abs(off)}ms`, cx, cy + 12);
      }
    }
    this.judgeFx = nextFx;
    g.restore();
  }

  private spawn(p: Omit<Particle, "active">): void {
    let reused = false;
    for (let i = 0; i < this.pool.length; i += 1) {
      if (!this.pool[i].active) {
        Object.assign(this.pool[i], p, { active: true });
        reused = true;
        break;
      }
    }
    if (!reused && this.pool.length < this.cap) {
      this.pool.push({ ...p, active: true });
    }
  }

  private seedDust(): void {
    this.dust = [];
    const n = this.reduced ? 14 : this.perf ? 8 : 36;
    for (let i = 0; i < n; i += 1) {
      this.dust.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 6,
        vy: -4 - Math.random() * 10,
        r: 0.6 + Math.random() * 1.4,
        hue: Math.random() * 60 + 200,
      });
    }
  }

  private frame(now: number): void {
    const g = this.g;
    if (!g) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = now / 1000;

    // 帧率采样：每秒报一次整数 FPS（性能模式自动降级依据）
    this.fpsCount += 1;
    const fpsSpan = now - this.fpsSince;
    if (fpsSpan >= 1000) {
      this.fpsCb?.((this.fpsCount * 1000) / fpsSpan);
      this.fpsCount = 0;
      this.fpsSince = now;
    }

    this.hue += (this.hueTarget - this.hue) * Math.min(1, dt * 1.5);
    this.telShow *= Math.pow(0.22, dt); // 约 1.5s 空闲淡出
    if (this.telShow < 0.02) this.telShow = 0;
    this.telPeakDecay(dt);
    if (this.shake > 0.01 && !this.reduced) this.shake *= Math.pow(0.001, dt);
    else this.shake = 0;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.shake > 0.1) {
      g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    // 背景：随八度 hue + 随亮度渐深
    const lg = g.createLinearGradient(0, 0, 0, this.h);
    const topL = 4 + this.bright * 8;
    lg.addColorStop(0, `hsl(${Math.round(this.hue)}, 30%, ${topL.toFixed(1)}%)`);
    lg.addColorStop(1, `hsl(${Math.round(this.hue)}, 25%, 3%)`);
    g.fillStyle = lg;
    g.fillRect(-20, -20, this.w + 40, this.h + 40);

    // 漂浮微尘
    for (const d of this.dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt * (this.reduced ? 0.4 : 1);
      if (d.y < -4) {
        d.y = this.h + 4;
        d.x = Math.random() * this.w;
      }
      if (d.x < -4) d.x = this.w + 4;
      if (d.x > this.w + 4) d.x = -4;
      g.fillStyle = `hsla(${Math.round(d.hue)}, 40%, 70%, ${(0.08 + this.bright * 0.1).toFixed(2)})`;
      g.fillRect(d.x, d.y, d.r, d.r);
    }

    // 按住时的持续光柱
    if (this.down) {
      const pg = g.createLinearGradient(this.downX, 0, this.downX, this.h);
      pg.addColorStop(0, `hsla(${this.downHue}, 90%, 65%, 0)`);
      pg.addColorStop(0.5, `hsla(${this.downHue}, 90%, 65%, ${(0.1 + this.bright * 0.18).toFixed(2)})`);
      pg.addColorStop(1, `hsla(${this.downHue}, 90%, 65%, 0)`);
      g.fillStyle = pg;
      g.fillRect(this.downX - 4, 0, 8, this.h);
    }

    // 光带拖尾
    const alive: TrailPt[] = [];
    for (const p of this.trail) {
      if (t - p.born <= this.trailAge) alive.push(p);
    }
    this.trail = alive;
    if (alive.length > 1) {
      const hard = this.voiceStyle === "chip";
      g.lineCap = hard ? "butt" : "round";
      g.lineJoin = hard ? "miter" : "round";
      for (let i = 1; i < alive.length; i += 1) {
        const a = alive[i - 1];
        const b = alive[i];
        const ageK = 1 - (t - b.born) / TRAIL_AGE;
        const wdt = 0.5 + ageK * (1 + this.speed * 4);
        g.strokeStyle = `hsla(${Math.round(b.hue)}, 90%, ${(50 + b.bright * 25).toFixed(0)}%, ${(ageK * 0.6).toFixed(2)})`;
        g.lineWidth = wdt;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
    }

    // 作曲模式：音位参考线 + 持久对象（视觉即乐谱）+ 选中/手柄/播放头
    if (this.compose) this.drawComposer(g);

    // 背景钢琴半透明叠加层（深海背景与粒子照常，键盘压在其上、冲击波在其上）
    if (this.pianoBg) this.drawPiano(g, t);

    // 挑战模式：判定线 + 下落块 + 判定反馈（压在键盘层之上）
    if (this.challengeOn) this.drawChallenge(g, t);

    // 演奏遥测表（力度条 + 调制环，挑战模式不显示）
    if (!this.challengeOn) this.drawTelemetry(g);

    // 冲击波环
    const nextRipples: Ripple[] = [];
    for (const r of this.ripples) {
      r.r += r.speed * dt;
      if (r.r < r.max) {
        nextRipples.push(r);
        const fade = 1 - r.r / r.max;
        g.strokeStyle = `hsla(${Math.round(r.hue)}, 90%, 62%, ${(fade * r.alpha).toFixed(2)})`;
        g.lineWidth = Math.max(0.5, 3 * fade);
        g.beginPath();
        g.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        g.stroke();
      }
    }
    this.ripples = nextRipples.slice(-40);

    // 粒子（对象池）
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.3, dt);
      p.vy *= Math.pow(0.3, dt);
      const fade = Math.min(1, p.life / (p.max || 1));
      if (p.char) {
        g.fillStyle = `hsla(${Math.round(p.hue)}, 80%, ${Math.round(p.lit)}%, ${(fade * 0.85).toFixed(2)})`;
        g.font = `${Math.round(p.size)}px ui-monospace, monospace`;
        g.fillText(p.char, p.x, p.y);
      } else {
        g.fillStyle = `hsla(${Math.round(p.hue)}, 85%, ${Math.round(p.lit)}%, ${(fade * 0.8).toFixed(2)})`;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (0.5 + fade * 0.5), 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}
