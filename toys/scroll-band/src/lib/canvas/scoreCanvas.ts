// 滚动乐团 · 作曲画布对象模型
// CanvasObject 是渲染层与音频层共享的唯一数据源：
//   points(归一化坐标) → compile/refresh → audio 曲线 → toEvents/LoopSpec → audioEngine lookahead 排程
// 同时提供 命中检测 / 编辑辅助 / ?canvas= URL 编解码。

// 接龙账本类型（编码/解码见 score.ts 的 encodeRelayParam/decodeRelayParam）
import type { RelayLeg } from "@/lib/audio/score";
import { VOICES } from "@/lib/audio/scales";

export interface CanvasPt {
  x: number; // 归一化 0..1
  y: number; // 归一化 0..1（上=高音）
  t: number; // 绘制时间戳（秒，performance 时基）
}

// 钢琴卷帘的显式音符：拍位（相对循环起点，1/4 拍网格）+ 音级（带内 0..degs-1）+ 力度
export interface RollNote {
  beat: number;
  deg: number;
  vel: number;
}

// 参数曲线自动化：curveParam 仅在 type==="curve" 时有意义（纯 JSON 字段，撤销/存档/分享全链路兼容）
export type CurveParam = "vol" | "cutoff" | "pan" | "reverb";

// 曲线四参数元数据：中文名 + 固定色相（hsla 体系与 renderer 音级色相同源，不引入新品牌色）
export const CURVE_PARAM_ORDER: CurveParam[] = ["vol", "cutoff", "pan", "reverb"];
export const CURVE_PARAM_META: Record<CurveParam, { name: string; hue: number }> = {
  vol: { name: "音量", hue: 45 },
  cutoff: { name: "滤波", hue: 185 },
  pan: { name: "声像", hue: 215 },
  reverb: { name: "混响", hue: 280 },
};

// AI 歌词生成：字↔音符对齐，words 下标 = 本对象 toLoopSpec 事件数组下标；
// 纯 JSON 字段——撤销栈/IndexedDB/?canvas= 分享编码全链路向后兼容（旧链接缺字段 = 无词）
export const LYRIC_LANGS = ["zh", "en", "ja"] as const;
export type LyricLang = (typeof LYRIC_LANGS)[number];
export interface ObjectLyrics {
  lang: LyricLang;
  words: string[]; // 一字（词）一音符；"" = 该音为无词延音；整行改写后重新对齐
  notes: number; // 配词时音符数（参考量；呈现/高亮按当下编译事件数现算，几何改动天然重对齐）
  text: string; // 整行原文（静态展示与整行改写回填）
}

export interface CanvasObject {
  id: string;
  type: "stroke" | "anchor" | "curve";
  // 曲线判别字段（仅 curve 使用）：音频语义字段不走 pitchCurve/velocityCurve/closed，
  // 编译路径（toLoopSpec/卷帘/MIDI/出关）遇 curve 全部短路，不发音
  curveParam?: CurveParam;
  points: CanvasPt[];
  audio: {
    pitchCurve: number[]; // 音级度数（相对当前八度，可为负或 ≥5 表示越带）
    velocityCurve: number[]; // 0..1
    closed: boolean;
    loopBeats: number;
  };
  // 钢琴卷帘覆盖：存在且非空时循环事件按它发声（不再采样曲线）；
  // 线本体几何改动（拖动/拉伸/换音阶重编译）会自动清除，回到笔迹曲线
  roll?: RollNote[];
  // ---- AI 指挥台字段（全部可选纯 JSON 字段：撤销/IndexedDB/分享编码向后兼容，旧链接缺省即默认）----
  aiGain?: number; // 音量乘子（混音建议/风格分层落地；串进分轨混音与曲线自动化链，与 vol 曲线相乘）
  muted?: boolean; // per-object 静音：编译短路不出事件（曲线被静音 = 自动化不生效）
  voiceId?: string; // 单对象换音色（缺省跟随全局；仅预设音色）
  drum?: boolean; // 鼓律动线：按力度曲线铺固定打击乐型出鼓事件（音高无意义）
  styleGenerated?: boolean; // 风格引擎生成的对象（滤波曲线/爵士和弦锚点）：载入重放前先剥旧防叠加
  lyrics?: ObjectLyrics; // AI 歌词：挂在所配旋律线上随对象走（删除/撤销/持久/分享）；复制派生不带词（防假对齐）
  createdAt: number;
}

export interface LoopEvent {
  t: number; // 秒（相对本对象循环起点）
  idx: number; // 绝对音级索引
  v: number; // 0..1
  c: number; // 滤波档位 0..15
  d?: number; // 鼓谱索引（audioEngine DRUM_KINDS 下标）；存在 = 打击乐事件，idx 无意义
}

export interface LoopSpec {
  id: string;
  period: number; // 秒
  events: LoopEvent[];
  voice?: string; // 单对象音色覆盖（AI 换乐器），缺省跟随全局
}

export const MAX_CANVAS_OBJECTS = 24;
// 全宽笔画对应的拍数（循环时长换算唯一真源；曲线 → 时间轴的换算也读这里）
export const FULL_WIDTH_BEATS = 12;
// 闭合判定阈值（归一化距离：终点到起点的距离小于该值即判成闭合圈→琶音）。
// 唯一真源：compileStroke 的判定与草稿预览层（renderer 虚线提示）都读这里，
// 预览与判定永不脱钩
export const CLOSE_DIST = 0.14;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// 非有限值兜底：clamp 对 NaN 会原样放行（Math.max(0, NaN)=NaN），导入链接解码 / AI 数据
// 混进的 NaN 会在编译成事件时被"合法化"再传进引擎，所以量化入口全部先经这里归一
function fin(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

// degs = 画布音区级数（唯一真源 scales.bandRange：E2–C6 大区），不再是音阶一个八度的级数；
// 发声/锚点的绝对音级索引 = 音区基准索引 bandRange(scale).lo + deg（编译时由调用方传入）

export function newCanvasId(): string {
  return `o${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function degFromY(y: number, degs: number): number {
  return clamp(Math.floor((1 - y) * degs), 0, degs - 1);
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// 闭合临近判定（与 compileStroke 同阈值同点数门槛）：画线草稿实时调用，
// 终点进入阈值即返回 true → 渲染层提示「松手将闭合成琶音」
export function closingNear(pts: CanvasPt[]): boolean {
  if (pts.length <= 6) return false;
  const first = pts[0];
  const last = pts[pts.length - 1];
  return !!first && !!last && dist2(first.x, first.y, last.x, last.y) < CLOSE_DIST;
}

function downsample(pts: CanvasPt[], maxN: number): CanvasPt[] {
  if (pts.length <= maxN) return pts;
  const out: CanvasPt[] = [];
  const step = (pts.length - 1) / (maxN - 1);
  for (let i = 0; i < maxN; i += 1) {
    out.push(pts[Math.round(i * step)]);
  }
  return out;
}

function meanAbsDelta(arr: number[]): number {
  if (arr.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < arr.length; i += 1) sum += Math.abs(arr[i] - arr[i - 1]);
  return sum / (arr.length - 1);
}

function xExtent(pts: CanvasPt[]): { x0: number; x1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
  }
  return { x0: x0 === Infinity ? 0 : x0, x1: x1 === -Infinity ? 1 : x1 };
}

// 按 x 均匀采样 m 段（时间 = 水平方向，左→右）
function sampleCurves(pts: CanvasPt[], m: number, n: number): { degs: number[]; vels: number[] } {
  const { x0, x1 } = xExtent(pts);
  const span = Math.max(0.03, x1 - x0);
  const byX = [...pts].sort((a, b) => a.x - b.x);
  const degs: number[] = [];
  const vels: number[] = [];
  for (let s = 0; s < m; s += 1) {
    const tx = x0 + (span * s) / (m - 1 || 1);
    // 找相邻两点插值
    let lo = byX[0];
    let hi = byX[byX.length - 1];
    for (let i = 1; i < byX.length; i += 1) {
      if (byX[i].x >= tx) {
        lo = byX[i - 1];
        hi = byX[i];
        break;
      }
    }
    const f = hi.x - lo.x > 1e-6 ? (tx - lo.x) / (hi.x - lo.x) : 0;
    const y = lo.y + (hi.y - lo.y) * f;
    const dt = Math.max(0.008, hi.t - lo.t);
    const speed01 = clamp(((hi.x - lo.x) / dt) / 1.1, 0, 1);
    degs.push(degFromY(y, n));
    vels.push(clamp(0.18 + speed01 * 0.6, 0.08, 0.9));
  }
  return { degs, vels };
}

export function compileStroke(ptsRaw: CanvasPt[], degs: number): CanvasObject {
  const pts = downsample(ptsRaw, 60).map((p) => ({ ...p }));
  const first = pts[0];
  const last = pts[pts.length - 1];
  const m = clamp(Math.round(xExtent(pts).x1 - xExtent(pts).x0 < 0 ? 8 : (xExtent(pts).x1 - xExtent(pts).x0) * 30) + 8, 8, 20);
  const { degs: degsOut, vels } = sampleCurves(pts, m, degs);
  const closed = pts.length > 6 && first && last && dist2(first.x, first.y, last.x, last.y) < CLOSE_DIST;
  const { x0, x1 } = xExtent(pts);
  const loopBeats = clamp(Math.round(clamp(x1 - x0, 0.05, 1.2) * FULL_WIDTH_BEATS * 4) / 4, 1.5, 16);
  return {
    id: newCanvasId(),
    type: "stroke",
    points: pts,
    audio: {
      pitchCurve: degsOut,
      velocityCurve: vels,
      closed,
      loopBeats,
    },
    createdAt: Date.now(),
  };
}

// 参数曲线对象：几何（点列）即语义（X=时间、Y=参数值 0..1），不走音高/力度编译；
// audio 字段只保留 loopBeats 占位（供播报「约 N 拍」与对象同权编辑），曲线永远不出循环事件
export function compileCurve(ptsRaw: CanvasPt[], param: CurveParam): CanvasObject {
  const pts = downsample(ptsRaw, 60).map((p) => ({ ...p }));
  const { x0, x1 } = xExtent(pts);
  const loopBeats = clamp(Math.round(clamp(x1 - x0, 0.05, 1.2) * FULL_WIDTH_BEATS * 4) / 4, 1.5, 16);
  return {
    id: newCanvasId(),
    type: "curve",
    curveParam: param,
    points: pts,
    audio: {
      pitchCurve: [],
      velocityCurve: [],
      closed: false,
      loopBeats,
    },
    createdAt: Date.now(),
  };
}

export function compileAnchor(x: number, y: number, vel: number, degs: number): CanvasObject {
  return {
    id: newCanvasId(),
    type: "anchor",
    points: [{ x, y, t: 0 }],
    audio: {
      pitchCurve: [degFromY(y, degs)],
      velocityCurve: [clamp(vel, 0.1, 0.9)],
      closed: false,
      // 锚点 = 一次性音：放置即响、点击重响，不循环（修复"无操作时重复单音"）
      loopBeats: 0,
    },
    createdAt: Date.now(),
  };
}

// 初始化卷帘：按与 toLoopSpec 完全同款的步距/采样规则把笔迹曲线量化成显式音符，
// 保证「打开卷帘那一刻」循环听感不变，之后的拖动才是用户真正的编辑
export function rollFromObject(obj: CanvasObject, degs: number): RollNote[] {
  const m = obj.audio.pitchCurve.length;
  if (obj.type !== "stroke" || m === 0) return [];
  const jagged = meanAbsDelta(obj.audio.pitchCurve) > 0.7;
  const naturalStep = obj.audio.closed || jagged ? 0.25 : 0.5;
  // 上限 96：步距自适应——自然步距超过 96 步能盖满的量（长循环/「慢 2×」拉长后的线）时
  // 自动采样变粗，保证整圈全覆盖（旧实现直接砍步数，尾部一拍不响——"循环没跑完"的根因）
  const stepBeats = Math.max(naturalStep, obj.audio.loopBeats / 96);
  const steps = Math.min(96, Math.max(2, Math.floor(obj.audio.loopBeats / stepBeats)));
  const out: RollNote[] = [];
  for (let i = 0; i < steps; i += 1) {
    const k = obj.audio.closed
      ? Math.floor((i / steps) * m) % m
      : Math.round((i / Math.max(1, steps - 1)) * (m - 1));
    out.push({
      beat: Math.round(i * stepBeats * 4) / 4,
      // 越带旧数据（复制 +1 等）夹回带内，卷帘网格与画布参考线一一对应
      deg: clamp(Math.round(obj.audio.pitchCurve[k] ?? 0), 0, degs - 1),
      vel: obj.audio.velocityCurve[k] ?? 0.5,
    });
  }
  return out;
}

// 几何变更 / 音阶切换后即时重编译音高/力度曲线与循环时长（按当前音阶级数量化）
export function refreshAudio(obj: CanvasObject, degs: number): void {
  // 几何已改动：卷帘覆盖与笔迹脱钩，自动清回曲线编译（UI 会提前告知用户）
  obj.roll = undefined;
  if (obj.type === "curve") {
    // 曲线不走音高编译：拖动/拉伸只重算时间跨度（播报与占位用），点列本身就是曲线语义
    const { x0, x1 } = xExtent(obj.points);
    obj.audio.loopBeats = clamp(Math.round(clamp(x1 - x0, 0.05, 1.2) * FULL_WIDTH_BEATS * 4) / 4, 1.5, 16);
    return;
  }
  if (obj.type === "anchor") {
    const p = obj.points[0];
    if (p) {
      obj.audio.pitchCurve = [degFromY(p.y, degs)];
    }
    return;
  }
  const m = obj.audio.pitchCurve.length || 12;
  const { degs: degsOut, vels } = sampleCurves(obj.points, clamp(m, 8, 20), degs);
  obj.audio.pitchCurve = degsOut;
  obj.audio.velocityCurve = vels;
  const { x0, x1 } = xExtent(obj.points);
  obj.audio.loopBeats = clamp(Math.round(clamp(x1 - x0, 0.05, 1.2) * FULL_WIDTH_BEATS * 4) / 4, 1.5, 16);
}

export function shiftObject(obj: CanvasObject, dx: number, dy: number, degs: number): void {
  for (const p of obj.points) {
    p.x = clamp(p.x + dx, -0.05, 1.05);
    p.y = clamp(p.y + dy, -0.3, 1.3);
  }
  refreshAudio(obj, degs);
}

// 复制 = 音高 +1 音级（上移一个音位带）的派生对象
export function duplicateObject(obj: CanvasObject): CanvasObject {
  if (obj.type === "curve") {
    // 曲线复制 = 同参数同形状的副本（垂直偏移会改变参数值，所以只横向错开一点防重叠）
    return {
      id: newCanvasId(),
      type: "curve",
      curveParam: obj.curveParam,
      points: obj.points.map((p) => ({ x: p.x, y: p.y, t: p.t })),
      audio: {
        pitchCurve: [],
        velocityCurve: [],
        closed: false,
        loopBeats: obj.audio.loopBeats,
      },
      createdAt: Date.now(),
    };
  }
  const clone: CanvasObject = {
    id: newCanvasId(),
    type: obj.type,
    points: obj.points.map((p) => ({ x: p.x, y: p.y - 0.2, t: p.t })),
    audio: {
      pitchCurve: [...obj.audio.pitchCurve],
      velocityCurve: [...obj.audio.velocityCurve],
      closed: obj.audio.closed,
      loopBeats: obj.audio.loopBeats,
    },
    // 派生副本继承音色与鼓标记；音量乘子保留（混音意图随派生走）；静音不继承（复制 = 想要一条能响的）
    voiceId: obj.voiceId,
    aiGain: obj.aiGain,
    drum: obj.drum,
    createdAt: Date.now(),
  };
  clone.audio.pitchCurve = clone.audio.pitchCurve.map((d) => d + 1);
  clone.audio.velocityCurve = [...obj.audio.velocityCurve];
  return clone;
}

export function handlePoint(obj: CanvasObject): { x: number; y: number } {
  if (obj.type === "anchor") return obj.points[0] ?? { x: 0, y: 0 };
  const { x1 } = xExtent(obj.points);
  const last = obj.points[obj.points.length - 1];
  return { x: x1, y: last ? last.y : 0.5 };
}

// 拖右端手柄 = 水平拉伸 = 改循环时长
export function stretchTo(obj: CanvasObject, nx: number, degs: number): void {
  const { x0, x1 } = xExtent(obj.points);
  const target = clamp(nx, x0 + 0.05, 1.1);
  const scale = target / Math.max(0.04, x1 - x0);
  for (const p of obj.points) {
    p.x = x0 + (p.x - x0) * scale;
  }
  refreshAudio(obj, degs);
}

function nearEx(px: number, py: number, nx: number, ny: number, tolX: number, tolY: number): boolean {
  return Math.hypot((nx - px) / tolX, (ny - py) / tolY) < 1;
}

function nearPolyline(pts: CanvasPt[], nx: number, ny: number, tolX: number, tolY: number): boolean {
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const ax = (a.x - nx) / tolX;
    const ay = (a.y - ny) / tolY;
    const bx = (b.x - nx) / tolX;
    const by = (b.y - ny) / tolY;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const f = len2 > 0 ? clamp((-(ax * dx + ay * dy)) / len2, 0, 1) : 0;
    const px = ax + dx * f;
    const py = ay + dy * f;
    if (Math.hypot(px, py) < 1) return true;
  }
  return false;
}

export function hitTest(
  objs: CanvasObject[],
  nx: number,
  ny: number,
  tolX: number,
  tolY: number,
  selectedId: string | null,
): { id: string; part: "body" | "handle" } | null {
  for (let i = objs.length - 1; i >= 0; i -= 1) {
    const o = objs[i];
    if (o.type === "anchor") {
      const p = o.points[0];
      if (p && nearEx(p.x, p.y, nx, ny, tolX, tolY)) return { id: o.id, part: "body" };
      continue;
    }
    if (o.id === selectedId) {
      const h = handlePoint(o);
      if (nearEx(h.x, h.y, nx, ny, tolX * 1.4, tolY * 1.4)) return { id: o.id, part: "handle" };
    }
    if (nearPolyline(o.points, nx, ny, tolX, tolY)) return { id: o.id, part: "body" };
  }
  return null;
}

// 确定性伪随机（0..1）：按字符串哈希，同一对象同一音序每次编译抖动一致——
// 人性化不能是每编辑一次变一次声的真随机，也不能两个对象撞出同一相位
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// 对象 → 循环事件（供 audioEngine 独立循环调度，音画同步唯一真源）
export function toLoopSpec(obj: CanvasObject, bpm: number, baseIdx: number, degs: number): LoopSpec {
  // 曲线对象不出任何循环事件（MIDI 导出/出关/卷帘统计等所有经此的链路天然短路）；
  // AI 静音（muted）同样编译短路——canvasStep/MIDI/音频导出经此一律无声
  if (obj.type === "curve" || obj.muted) return { id: obj.id, period: 0, events: [] };
  const beat = 60 / fin(clamp(bpm, 40, 240), 0.5);
  const period = fin(Math.max(0.25, obj.audio.loopBeats * beat), 1);
  const { x0 } = xExtent(obj.points);
  // 量化：层起点吸附 1/4 拍网格——自由画出的时间偏移不再让多层叠加互相错位，
  // 叠得再多也都踩在同一张节拍网上（loopBeats 与步距本就 1/4 拍对齐，起点是最后一个自由量）
  const grid = beat / 4;
  const offset = fin(Math.round((x0 * 4 * beat) / grid) * grid, 0);
  // AI 音量乘子（串进现有调度与曲线自动化链：乘在事件力度上 = 音量缩放，与 vol 曲线相乘不冲突）
  const ag = clamp(fin(obj.aiGain ?? 1, 1), 0.1, 1.3);
  const voice = obj.voiceId;
  const events: LoopEvent[] = [];
  const base = baseIdx;
  if (obj.type === "anchor") {
    const deg = fin(obj.audio.pitchCurve[0] ?? 0, 0);
    const vel = fin(obj.audio.velocityCurve[0] ?? 0.5, 0.5);
    events.push({ t: 0, idx: base + deg, v: clamp(vel * ag, 0.05, 1), c: 9 });
    return { id: obj.id, period, events, voice };
  }
  // 鼓律动线：按 1/2 拍步进铺固定打击乐型（kick/hat/snare 循环），idx 无意义
  if (obj.type === "stroke" && obj.drum) {
    const steps = clamp(Math.floor(obj.audio.loopBeats / 0.5), 2, 32);
    const PAT = [0, 2, 1, 2, 0, 0, 2, 1];
    const vc = obj.audio.velocityCurve;
    for (let i = 0; i < steps; i += 1) {
      const k = Math.round((i / Math.max(1, steps - 1)) * Math.max(0, vc.length - 1));
      const vel = clamp(fin(vc[k] ?? 0.6, 0.6) * ag, 0.05, 1);
      const hv = hash01(`${obj.id}#d${i}`) - 0.5;
      events.push({
        t: Math.max(0, offset + i * 0.5 * beat + hv * 0.02 * beat),
        idx: base,
        v: vel,
        c: 0,
        d: PAT[i % PAT.length],
      });
    }
    return { id: obj.id, period, events, voice };
  }
  // 卷帘覆盖优先：显式音符序列直接成事件（保留同款确定性人性化抖动，种子里带 r 段防与曲线撞相位）
  if (obj.type === "stroke" && obj.roll && obj.roll.length > 0) {
    for (let i = 0; i < obj.roll.length; i += 1) {
      const n = obj.roll[i];
      const vel = clamp(fin(n.vel, 0.5), 0.05, 1);
      const hv = hash01(`${obj.id}#r${i}v`) - 0.5;
      const ht = hash01(`${obj.id}#r${i}t`) - 0.5;
      events.push({
        t: Math.max(0, offset + fin(n.beat, 0) * beat + ht * 0.05 * beat),
        idx: base + clamp(Math.round(fin(n.deg, 0)), 0, degs - 1),
        v: clamp(vel * (1 + hv * 0.18) * ag, 0.05, 1),
        c: clamp(6 + Math.round(vel * 5), 0, 15),
      });
    }
    events.sort((a, z) => a.t - z.t);
    return { id: obj.id, period, events, voice };
  }
  const m = obj.audio.pitchCurve.length;
  if (m === 0) return { id: obj.id, period, events, voice };
  const jagged = meanAbsDelta(obj.audio.pitchCurve) > 0.7;
  const naturalStep = obj.audio.closed || jagged ? 0.25 : 0.5;
  // 上限 96：步距自适应——自然步距超过 96 步能盖满的量（长循环/「慢 2×」拉长后的线）时
  // 自动采样变粗，保证整圈全覆盖（旧实现直接砍步数，尾部一拍不响——"循环没跑完"的根因）
  const stepBeats = Math.max(naturalStep, obj.audio.loopBeats / 96);
  const steps = Math.min(96, Math.max(2, Math.floor(obj.audio.loopBeats / stepBeats)));
  for (let i = 0; i < steps; i += 1) {
    const k = obj.audio.closed
      ? Math.floor((i / steps) * m) % m
      : Math.round((i / Math.max(1, steps - 1)) * (m - 1));
    const deg = fin(obj.audio.pitchCurve[k] ?? 0, 0);
    const vel = fin(obj.audio.velocityCurve[k] ?? 0.5, 0.5);
    const c = clamp(jagged ? 9 + Math.round(vel * 4) : 6 + Math.round(vel * 5), 0, 15);
    // 人性化：以对象 id + 步序做种子的确定性微抖动（力度 ±9%、时间 ±0.025 拍），
    // 循环不再像节拍器一样死板；每次重编译抖动不变，听感稳定
    const hv = hash01(`${obj.id}#v${i}`) - 0.5;
    const ht = hash01(`${obj.id}#t${i}`) - 0.5;
    events.push({
      t: Math.max(0, offset + i * stepBeats * beat + ht * 0.05 * beat),
      idx: base + deg,
      v: clamp(vel * (1 + hv * 0.18) * ag, 0.05, 1),
      c,
    });
  }
  return { id: obj.id, period, events, voice };
}

export function buildLoopSpecs(
  objs: CanvasObject[],
  bpm: number,
  baseIdx: number,
  degs: number,
): LoopSpec[] {
  // 锚点为一次性音、曲线不出事件，都不进循环（旧数据可能带 loopBeats>0，这里统一跳过）
  return objs
    .filter((o) => o.type === "stroke" && o.audio.loopBeats > 0)
    .map((o) => toLoopSpec(o, bpm, baseIdx, degs));
}

// ---- ?canvas= URL 编解码（点列量化 + 降采样控长度）----

function q2(v: number): string {
  return Math.round(clamp(v, 0, 1) * 1295)
    .toString(36)
    .padStart(2, "0");
}
function u2(s: string): number {
  return parseInt(s, 36) / 1295;
}
function qy(v: number): string {
  return q2((clamp(v, -0.3, 1.3) + 0.3) / 1.6);
}
function uy(s: string): number {
  return u2(s) * 1.6 - 0.3;
}
function qv(v: number): string {
  return Math.round(clamp(v, 0, 1) * 35)
    .toString(36)
    .padStart(1, "0");
}

// AI 字段可选尾段（`~` 起头）：旧版解码器按定长读取、天然忽略尾部；旧链接无尾段 = 全默认。
// a<gain36> | m | v<voice36> | d | s
function tailOf(o: CanvasObject): string {
  const seg: string[] = [];
  if (typeof o.aiGain === "number") {
    const gi = clamp(Math.round((clamp(o.aiGain, 0.2, 1.25) - 0.2) / 0.03), 0, 35);
    seg.push(`a${gi.toString(36).padStart(1, "0")}`);
  }
  if (o.muted) seg.push("m");
  if (o.voiceId) {
    const vi = VOICES.findIndex((v) => v.id === o.voiceId);
    if (vi >= 0) seg.push(`v${vi.toString(36).padStart(1, "0")}`);
  }
  if (o.drum) seg.push("d");
  if (o.styleGenerated) seg.push("s");
  // 歌词尾段 `l<语言>.<音符数>.<码点36...>`：恒放最后一段——解析器读到 l 即吃尽余下整段
  //（码点表意文字无法被误认成 a/v/m/d/s 字段位），旧链接无此段 = 无词，向后兼容
  if (o.lyrics && o.lyrics.text) {
    const li = Math.max(0, LYRIC_LANGS.indexOf(o.lyrics.lang));
    const cps = Array.from(o.lyrics.text)
      .map((c) => (c.codePointAt(0) ?? 0).toString(36))
      .join(".");
    const n36 = Math.min(999, Math.max(0, Math.round(o.lyrics.notes))).toString(36);
    seg.push(`l${li.toString(36)}.${n36}.${cps}`);
  }
  return seg.length > 0 ? `~${seg.join("")}` : "";
}

interface FieldTail {
  aiGain?: number;
  muted?: boolean;
  voiceId?: string;
  drum?: boolean;
  styleGenerated?: boolean;
  lyrics?: ObjectLyrics;
}

function parseFieldTail(t: string): FieldTail {
  const out: FieldTail = {};
  let i = 0;
  while (i < t.length) {
    const ch = t[i];
    if (ch === "a" && i + 1 < t.length) {
      const gi = parseInt(t[i + 1], 36);
      if (!Number.isNaN(gi)) out.aiGain = Math.round((0.2 + gi * 0.03) * 100) / 100;
      i += 2;
    } else if (ch === "v" && i + 1 < t.length) {
      const vi = parseInt(t[i + 1], 36);
      const hit = VOICES[vi];
      if (hit) out.voiceId = hit.id;
      i += 2;
    } else if (ch === "m") {
      out.muted = true;
      i += 1;
    } else if (ch === "d") {
      out.drum = true;
      i += 1;
    } else if (ch === "s") {
      out.styleGenerated = true;
      i += 1;
    } else if (ch === "l") {
      // 歌词尾段（恒最后一段）：l<语言>.<音符数>.<码点1.码点2...>，读毕即止
      const segs = t.slice(i + 1).split(".");
      if (segs.length >= 3) {
        const lang = LYRIC_LANGS[parseInt(segs[0], 36)] ?? "zh";
        const notesRaw = parseInt(segs[1], 36);
        let text = "";
        for (let k = 2; k < segs.length; k += 1) {
          const cp = parseInt(segs[k], 36);
          if (!Number.isNaN(cp)) text += String.fromCodePoint(cp);
        }
        if (text) {
          // 分享态先带原文 + 配词时音符数占位，words 由展示层按当下编译事件数现算重对齐
          out.lyrics = { lang, notes: Number.isNaN(notesRaw) ? 0 : notesRaw, words: [], text };
        }
      }
      break;
    } else {
      i += 1; // 未知字段跳过 = 前向兼容
    }
  }
  return out;
}

export function encodeCanvasObjects(objs: CanvasObject[]): string {
  if (objs.length === 0) return "";
  const parts = objs.map((o) => {
    if (o.type === "curve") {
      // c<参数档><循环拍数><点数><点列（x/y 与线同款，力度槽恒 0）><可选尾段>——旧版解码器整段跳过（向后兼容）
      const pi = CURVE_PARAM_ORDER.indexOf(o.curveParam ?? "vol");
      const dp = downsample(o.points, 16);
      const lb = q2(clamp(o.audio.loopBeats, 1, 32) / 32);
      const pts = dp.map((p) => `${q2(p.x)}${qy(p.y)}0`).join("");
      const n = Math.min(35, dp.length)
        .toString(36)
        .padStart(1, "0");
      return `c${pi}${lb}${n}${pts}${tailOf(o)}`;
    }
    if (o.type === "anchor") {
      const p = o.points[0] ?? { x: 0, y: 0, t: 0 };
      const v = o.audio.velocityCurve[0] ?? 0.5;
      return `a${q2(p.x)}${qy(p.y)}${qv(v)}${tailOf(o)}`;
    }
    const dp = downsample(o.points, 16);
    const lb = q2(clamp(o.audio.loopBeats, 1, 32) / 32);
    const pts = dp
      .map((p, i) => `${q2(p.x)}${qy(p.y)}${qv(o.audio.velocityCurve[i] ?? 0.5)}`)
      .join("");
    const n = Math.min(35, dp.length)
      .toString(36)
      .padStart(1, "0");
    return `s${o.audio.closed ? "1" : "0"}${lb}${n}${pts}${tailOf(o)}`;
  });
  return `v1.${parts.join(",")}`;
}

// ---- 接龙账本映射（?relay= 账本 [{n,k}]，对象解码顺序 = 到达顺序 = 棒次顺序）----

/** 前人对象总数 = 账本 Σk（数组前缀到此为止归前人），钳到画布实际对象数（账本损坏也不越界） */
export function relayLockedCount(ledger: RelayLeg[], objTotal: number): number {
  let sum = 0;
  for (const l of ledger) sum += Math.max(0, Math.floor(l.k));
  return Math.min(objTotal, Math.max(0, sum));
}

/** 第 objIndex 个对象归属的前人棒次（0 起）；-1 = 超出账本 = 本棒新增 */
export function relayOwnerOf(ledger: RelayLeg[], objIndex: number): number {
  let acc = 0;
  for (let i = 0; i < ledger.length; i += 1) {
    acc += Math.max(0, Math.floor(ledger[i].k));
    if (objIndex < acc) return i;
  }
  return -1;
}

export function decodeCanvasObjects(raw: string, degs: number): CanvasObject[] {
  if (!raw.startsWith("v1.")) return [];
  const objs: CanvasObject[] = [];
  const parts = raw.slice(3).split(",");
  for (const partRaw of parts) {
    // AI 字段尾段（~ 起头，可选）：先剥离再走定长解码 = 旧链接零变化、新字段向后兼容
    const tilde = partRaw.indexOf("~");
    const tail = tilde < 0 ? null : parseFieldTail(partRaw.slice(tilde + 1));
    const part = tilde < 0 ? partRaw : partRaw.slice(0, tilde);
    const applyTail = (o: CanvasObject) => {
      if (tail?.aiGain !== undefined) o.aiGain = tail.aiGain;
      if (tail?.muted) o.muted = true;
      if (tail?.voiceId) o.voiceId = tail.voiceId;
      if (tail?.drum) o.drum = true;
      if (tail?.styleGenerated) o.styleGenerated = true;
      if (tail?.lyrics) o.lyrics = tail.lyrics;
      return o;
    };
    if (part.startsWith("c") && part.length >= 6) {
      const param = CURVE_PARAM_ORDER[parseInt(part.slice(1, 2), 36)];
      if (!param) continue;
      const loopBeats = u2(part.slice(2, 4)) * 32;
      const n = parseInt(part.slice(4, 5), 36);
      if (Number.isNaN(n) || n <= 0) continue;
      const body = part.slice(5);
      const pts: CanvasPt[] = [];
      for (let i = 0; i < n; i += 1) {
        const seg = body.slice(i * 5, i * 5 + 5);
        if (seg.length < 5) break;
        pts.push({ x: u2(seg.slice(0, 2)), y: uy(seg.slice(2, 4)), t: 0 });
      }
      if (pts.length < 2) continue;
      objs.push(
        applyTail({
          id: newCanvasId(),
          type: "curve" as const,
          curveParam: param,
          points: pts,
          audio: {
            pitchCurve: [] as number[],
            velocityCurve: [] as number[],
            closed: false,
            loopBeats: clamp(loopBeats, 1, 16),
          },
          createdAt: Date.now(),
        }),
      );
    } else if (part.startsWith("a") && part.length === 7) {
      const x = u2(part.slice(1, 3));
      const y = uy(part.slice(3, 5));
      const v = parseInt(part.slice(5, 6), 36) / 35;
      const obj = compileAnchor(x, y, v, degs);
      objs.push(applyTail(obj));
    } else if (part.startsWith("s") && part.length >= 6) {
      const closed = part[1] === "1";
      const loopBeats = u2(part.slice(2, 4)) * 32;
      const n = parseInt(part.slice(4, 5), 36);
      if (Number.isNaN(n) || n <= 0) continue;
      const body = part.slice(5);
      const pts: CanvasPt[] = [];
      const vels: number[] = [];
      const degCurve: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const seg = body.slice(i * 5, i * 5 + 5);
        if (seg.length < 5) break;
        const x = u2(seg.slice(0, 2));
        const y = uy(seg.slice(2, 4));
        const v = parseInt(seg.slice(4, 5), 36) / 35;
        pts.push({ x, y, t: 0 });
        vels.push(v);
        degCurve.push(degFromY(y, degs));
      }
      if (pts.length < 2) continue;
      objs.push(
        applyTail({
          id: newCanvasId(),
          type: "stroke" as const,
          points: pts,
          audio: {
            pitchCurve: degCurve,
            velocityCurve: vels,
            closed,
            loopBeats: clamp(loopBeats, 1, 16),
          },
          createdAt: Date.now(),
        }),
      );
    }
  }
  return objs.slice(0, MAX_CANVAS_OBJECTS);
}
