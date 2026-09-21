// 滚动乐团 · AI 指挥台（纯前端规则引擎，零外部调用）
// 对 CanvasObject 集合做音高/密度/力度/重叠/总线统计，混音建议 / 编曲建议 / 风格迁移三件套共用。
// 全程浏览器本地纯函数计算；确定性要求：同画布同参数 → 建议列表稳定复现——
// 一切「挑一个」都用对象下标/createdAt/音级数值裁决，禁止 Math.random。
import {
  CURVE_PARAM_META,
  MAX_CANVAS_OBJECTS,
  clamp,
  duplicateObject,
  newCanvasId,
  toLoopSpec,
  type CanvasObject,
  type RollNote,
} from "@/lib/canvas/scoreCanvas";
import { VOICES } from "@/lib/audio/scales";

export interface AiContext {
  bpm: number;
  degs: number; // 画布大区级数（bandDegs）
  scaleLen: number; // 音阶一个八度的级数（pitchCurve +它 = 真实升一个八度）
  baseIdx: number; // 绝对音级基准（与 syncCanvasLoops 同源）
  limiterReductionDb: number; // 主限制器实时削减（dB，≤0；0 = 没在削）
  masterVol: number; // 当前主音量 0..1
  globalVoice: string; // 当前全局音色 id
}

// ---- 建议动作（数据而非闭包：useHome 单一解释器落地，保证走同一撤销栈/持久化/重排程）----
export type AiAction =
  | { t: "gain"; id: string; gain: number } // 设 aiGain 乘子（幂等赋值，不连乘）
  | { t: "octaveUp"; id: string } // 整条音高曲线 +一个八度（量化天然回当前音阶）
  | { t: "addVolCurve" } // 自动铺一条渐强渐弱音量曲线
  | { t: "mute"; id: string } // per-object 静音（编译短路）
  | { t: "masterDown" } // 主音量下调一档
  | { t: "addObjs"; objs: CanvasObject[] } // 和弦锚点组 / 鼓律动轨 / 重复变奏副本
  | { t: "voice"; id: string; voiceId: string }; // 单对象换音色

export interface AiAdvice {
  id: string;
  kind: "mix" | "arrange";
  text: string; // 具体可执行话术（含对象名与数值）
  targets: string[]; // hover 时画布描边的对象 id
  action: AiAction;
  status: "pending" | "applied" | "ignored";
}

// ---- 对象命名（与混音台/卷帘统计同款数法：线 N / 锚 N / 音量曲线 等）----
export function objLabels(objs: CanvasObject[]): Map<string, string> {
  const out = new Map<string, string>();
  let s = 0;
  let a = 0;
  const c: Record<string, number> = {};
  for (const o of objs) {
    if (o.type === "stroke") {
      s += 1;
      out.set(o.id, `线 ${s}`);
    } else if (o.type === "anchor") {
      a += 1;
      out.set(o.id, `锚 ${a}`);
    } else {
      const key = o.curveParam ?? "vol";
      c[key] = (c[key] ?? 0) + 1;
      out.set(o.id, `${CURVE_PARAM_META[key]?.name ?? "参数"}曲线${c[key] > 1 ? ` ${c[key]}` : ""}`);
    }
  }
  return out;
}

function labelOf(map: Map<string, string>, id: string): string {
  return map.get(id) ?? "某个对象";
}

// ---- 统计小工具（全确定性）----
function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length);
}

function eventCount(o: CanvasObject, ctx: AiContext): number {
  return toLoopSpec(o, ctx.bpm, ctx.baseIdx, ctx.degs).events.length;
}

function xExtent(o: CanvasObject): { x0: number; x1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const p of o.points) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
  }
  return { x0: x0 === Infinity ? 0 : x0, x1: x1 === -Infinity ? 1 : x1 };
}

function avgY(o: CanvasObject): number {
  if (o.points.length === 0) return 0.5;
  return o.points.reduce((a, p) => a + p.y, 0) / o.points.length;
}

function pitchRange(o: CanvasObject): { lo: number; hi: number } {
  const c = o.audio.pitchCurve;
  if (c.length === 0) return { lo: 0, hi: 0 };
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of c) {
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return { lo, hi };
}

// 笔迹曲线按 16 点线性重采样（相似度比较用）
function resample16(c: number[]): number[] {
  const out: number[] = [];
  const m = c.length;
  if (m === 0) return out;
  for (let i = 0; i < 16; i += 1) {
    const f = (i / 15) * (m - 1);
    const k = Math.floor(f);
    const z = Math.min(m - 1, k + 1);
    out.push(c[k] + (c[z] - c[k]) * (f - k));
  }
  return out;
}

// 发声对象 = 笔迹且会循环（曲线不出声、锚点一次性，都不参与密度/动态统计）
function soundingStrokes(objs: CanvasObject[]): CanvasObject[] {
  return objs.filter((o) => o.type === "stroke" && o.audio.loopBeats > 0 && !o.muted);
}

// ============================================================
// 混音助手
// ============================================================
export function analyzeMix(objs: CanvasObject[], ctx: AiContext): AiAdvice[] {
  const out: AiAdvice[] = [];
  const labels = objLabels(objs);
  const strokes = soundingStrokes(objs);

  // ① 音量平衡：事件密度显著高于均值
  const dens = new Map<string, number>();
  for (const o of strokes) {
    const spec = toLoopSpec(o, ctx.bpm, ctx.baseIdx, ctx.degs);
    dens.set(o.id, spec.period > 0 ? spec.events.length / spec.period : 0);
  }
  const avg = strokes.length > 0 ? [...dens.values()].reduce((a, b) => a + b, 0) / strokes.length : 0;
  const hot = strokes
    .filter((o) => (dens.get(o.id) ?? 0) > Math.max(1.6 * avg, 6))
    .sort((a, b) => (dens.get(b.id) ?? 0) - (dens.get(a.id) ?? 0))
    .slice(0, 2);
  for (const o of hot) {
    const ratio = avg > 0 ? (dens.get(o.id) ?? 0) / avg : 99;
    const base = clamp(o.aiGain ?? 1, 0.2, 1.25);
    out.push({
      id: `mix-gain-${o.id}`,
      kind: "mix",
      text: `「${labelOf(labels, o.id)}」音符太密（${(dens.get(o.id) ?? 0).toFixed(1)} 音/秒，整体的 ${ratio.toFixed(1)} 倍），像鼓太响了，建议音量降 20%`,
      targets: [o.id],
      action: { t: "gain", id: o.id, gain: Math.round(base * 0.8 * 100) / 100 },
      status: "pending",
    });
  }

  // ② 频率冲突：音域大范围重叠 + 循环相位活跃重叠 → 少音/后创建的一条升八度
  let clashes = 0;
  outer: for (let i = 0; i < strokes.length; i += 1) {
    for (let j = i + 1; j < strokes.length; j += 1) {
      const a = strokes[i];
      const b = strokes[j];
      const ra = pitchRange(a);
      const rb = pitchRange(b);
      const oLo = Math.max(ra.lo, rb.lo);
      const oHi = Math.min(ra.hi, rb.hi);
      const small = Math.min(ra.hi - ra.lo, rb.hi - rb.lo);
      if (oHi - oLo < Math.max(1.5, small * 0.6)) continue;
      const wa = xExtent(a);
      const wb = xExtent(b);
      const aS = wa.x0 * 12;
      const aE = aS + a.audio.loopBeats;
      const bS = wb.x0 * 12;
      const bE = bS + b.audio.loopBeats;
      if (Math.min(aE, bE) - Math.max(aS, bS) < Math.min(a.audio.loopBeats, b.audio.loopBeats) * 0.25) continue;
      const ca = eventCount(a, ctx);
      const cb = eventCount(b, ctx);
      const target = ca !== cb ? (ca < cb ? a : b) : a.createdAt >= b.createdAt ? a : b;
      out.push({
        id: `mix-clash-${target.id}`,
        kind: "mix",
        text: `「${labelOf(labels, a.id)}」和「${labelOf(labels, b.id)}」音域撞了，两声部糊在一起，建议把「${labelOf(labels, target.id)}」整体升一个八度错开`,
        targets: [a.id, b.id],
        action: { t: "octaveUp", id: target.id },
        status: "pending",
      });
      clashes += 1;
      if (clashes >= 2) break outer;
    }
  }

  // ③ 动态太平：发声线力度方差都极低且画布没有音量曲线
  const hasVolCurve = objs.some((o) => o.type === "curve" && o.curveParam === "vol" && !o.muted);
  if (strokes.length >= 2 && !hasVolCurve && strokes.every((o) => std(o.audio.velocityCurve) < 0.045)) {
    out.push({
      id: "mix-volcurve",
      kind: "mix",
      text: "整体力度几乎没有起伏，动态太平，建议加一条渐强渐弱的音量曲线让循环有呼吸",
      targets: strokes.slice(0, 3).map((o) => o.id),
      action: { t: "addVolCurve" },
      status: "pending",
    });
  }

  // ④ 低频堆积：低音区（画布底部）堆叠过多 → 静音最低的一条
  const lows = strokes.filter((o) => avgY(o) > 0.75);
  if (lows.length >= 3) {
    const worst = [...lows].sort((a, b) => avgY(b) - avgY(a))[0];
    out.push({
      id: `mix-lowpile-${worst.id}`,
      kind: "mix",
      text: `低音区堆了 ${lows.length} 条线，低频浑浊，建议把最低的「${labelOf(labels, worst.id)}」静音`,
      targets: lows.map((o) => o.id),
      action: { t: "mute", id: worst.id },
      status: "pending",
    });
  } else if (objs.length >= 20) {
    // ④b 对象逼近上限：最密的一条静音腾地方
    const densest = [...strokes].sort(
      (a, b) => (dens.get(b.id) ?? 0) - (dens.get(a.id) ?? 0) || a.createdAt - b.createdAt,
    )[0];
    if (densest && !densest.muted) {
      out.push({
        id: `mix-cap-${densest.id}`,
        kind: "mix",
        text: `对象已经 ${objs.length} 个、快顶到 ${MAX_CANVAS_OBJECTS} 上限，建议把最密的「${labelOf(labels, densest.id)}」静音腾地方`,
        targets: [densest.id],
        action: { t: "mute", id: densest.id },
        status: "pending",
      });
    }
  }

  // ⑤ 总线过载：主限制器持续削减超标
  if (ctx.limiterReductionDb <= -2.5 && ctx.masterVol > 0.2) {
    out.push({
      id: "mix-master",
      kind: "mix",
      text: `主总线被限制器压着（正在削 ${Math.abs(Math.round(ctx.limiterReductionDb * 10) / 10)} dB），整体发闷，建议主音量下调一档`,
      targets: strokes.slice(0, 2).map((o) => o.id),
      action: { t: "masterDown" },
      status: "pending",
    });
  }

  return out;
}

// ============================================================
// 编曲建议（目标旋律 = 选中对象，未选中取音符最多者）
// ============================================================
export function pickTarget(objs: CanvasObject[], selectedId: string | null): CanvasObject | null {
  const sel = selectedId ? objs.find((o) => o.id === selectedId) : undefined;
  const usable = (o?: CanvasObject) => !!o && o.type !== "curve" && !o.muted;
  if (usable(sel)) return sel as CanvasObject;
  const strokes = soundingStrokes(objs);
  if (strokes.length === 0 && usable(objs.find((o) => o.type === "anchor"))) {
    return objs.filter((o) => o.type === "anchor" && !o.muted)[0] ?? null;
  }
  return strokes.sort((a, b) => eventCount(b, { bpm: 96, degs: 1, scaleLen: 5, baseIdx: 0, limiterReductionDb: 0, masterVol: 0.5, globalVoice: "" }) - eventCount(a, { bpm: 96, degs: 1, scaleLen: 5, baseIdx: 0, limiterReductionDb: 0, masterVol: 0.5, globalVoice: "" }) || a.createdAt - b.createdAt)[0] ?? null;
}

function pickTargetCtx(objs: CanvasObject[], selectedId: string | null, ctx: AiContext): CanvasObject | null {
  const sel = selectedId ? objs.find((o) => o.id === selectedId) : undefined;
  const usable = (o?: CanvasObject) => !!o && o.type !== "curve" && !o.muted;
  if (usable(sel)) return sel as CanvasObject;
  const strokes = soundingStrokes(objs);
  if (strokes.length > 0) {
    return [...strokes].sort((a, b) => eventCount(b, ctx) - eventCount(a, ctx) || a.createdAt - b.createdAt)[0] ?? null;
  }
  return objs.find((o) => o.type === "anchor" && !o.muted) ?? null;
}

// 找画布 x 轴最大空隙（锚点和弦/律动轨都往空区铺）
function widestGap(objs: CanvasObject[]): number {
  const spans = objs
    .filter((o) => o.points.length > 0)
    .map((o) => xExtent(o))
    .sort((a, b) => a.x0 - b.x0);
  let best = 0;
  let cx = 0.5;
  let cur = 0;
  for (const s of spans) {
    const gap = Math.max(s.x0 - cur, 0);
    if (gap > best) {
      best = gap;
      cx = cur + gap / 2;
    }
    cur = Math.max(cur, s.x1 + 0.04);
  }
  if (1 - cur > best) {
    best = 1 - cur;
    cx = cur + (1 - cur) / 2;
  }
  return clamp(cx, 0.06, 0.94);
}

// 和弦锚点组：按目标旋律出现最多的音级推断主音，低音区铺根-三-五-七四枚锚点
export function buildChordAnchors(
  objs: CanvasObject[],
  target: CanvasObject | null,
  ctx: AiContext,
  styleGenerated: boolean,
): CanvasObject[] {
  const src = target && target.audio.pitchCurve.length > 0 ? target : null;
  if (!src) return [];
  const counts = new Map<number, number>();
  for (const d of src.audio.pitchCurve) counts.set(d, (counts.get(d) ?? 0) + 1);
  let mode = 0;
  let best = -1;
  for (const [d, k] of Array.from(counts.entries()).sort((a, b) => a[0] - b[0])) {
    if (k > best) {
      best = k;
      mode = d;
    }
  }
  const rootIdx = ((mode % ctx.scaleLen) + ctx.scaleLen) % ctx.scaleLen;
  const base = 2 + rootIdx;
  const chordDegs = [base, base + 2, base + 4, base + 6].map((d) => clamp(d, 1, ctx.degs - 1));
  const cx = widestGap(objs);
  return chordDegs.map((d, i) => ({
    id: newCanvasId(),
    type: "anchor" as const,
    points: [{ x: cx, y: clamp(1 - (d + 0.5) / ctx.degs, 0, 1), t: 0 }],
    audio: {
      pitchCurve: [d],
      velocityCurve: [i === 0 ? 0.55 : 0.42],
      closed: false,
      loopBeats: 0,
    },
    createdAt: Date.now() + i,
    ...(styleGenerated ? { styleGenerated: true } : {}),
  }));
}

// 鼓律动对象：画布底部一排短促刻痕 = 一条打击轨（toLoopSpec 的 drum 分支出鼓事件）
export function buildDrumGroove(): CanvasObject {
  const pts = [];
  const vels = [];
  for (let i = 0; i < 12; i += 1) {
    pts.push({ x: 0.04 + (i / 11) * 0.92, y: 0.9 + Math.sin(i * 1.7) * 0.012, t: 0 });
    vels.push(0.7 + ((i * 7) % 5) * 0.04);
  }
  return {
    id: newCanvasId(),
    type: "stroke",
    drum: true,
    points: pts,
    audio: {
      pitchCurve: pts.map(() => 0),
      velocityCurve: vels,
      closed: false,
      loopBeats: 4,
    },
    createdAt: Date.now(),
  };
}

const VOICE_FLAVOR: Record<string, string> = {
  chip: "复古芯片味，颗粒感立现",
  bell: "空灵金属尾音，留出空间感",
  strings: "绵长弓味，旋律变连贯",
  pluck: "干脆拨奏，节奏感更跳",
  guitar: "双锯齿拨扫，带点爵士琴味",
  bass: "低八度短肥包络，铺底更沉",
  lead: "锯齿明亮档，主推旋律",
  glass: "清亮玻璃感，回归通透",
};

export function analyzeArrange(objs: CanvasObject[], selectedId: string | null, ctx: AiContext): AiAdvice[] {
  const out: AiAdvice[] = [];
  const target = pickTargetCtx(objs, selectedId, ctx);
  if (!target || objs.filter((o) => o.type !== "curve").length === 0) return out;
  const labels = objLabels(objs);

  // ① 加和弦（4 枚锚点，需有位置）
  const chords = buildChordAnchors(objs, target, ctx, false);
  if (chords.length > 0 && objs.length + chords.length <= MAX_CANVAS_OBJECTS) {
    out.push({
      id: "arr-chords",
      kind: "arrange",
      text: `按「${labelOf(labels, target.id)}」的调性推断主音，在低音区空档铺一组七和弦锚点垫底（4 音）`,
      targets: [target.id],
      action: { t: "addObjs", objs: chords },
      status: "pending",
    });
  }

  // ② 加节奏型（鼓律动轨）
  if (!objs.some((o) => o.drum) && objs.length + 1 <= MAX_CANVAS_OBJECTS) {
    out.push({
      id: "arr-groove",
      kind: "arrange",
      text: `按 BPM ${ctx.bpm} 生成一条 4 拍鼓律动轨铺在画布底部，给整曲一个骨架`,
      targets: [target.id],
      action: { t: "addObjs", objs: [buildDrumGroove()] },
      status: "pending",
    });
  }

  // ③ 换乐器（单对象音色，循环到下一个预设音色）
  const pool = VOICES.filter((v) => v.id !== "custom");
  const cur = target.voiceId ?? ctx.globalVoice;
  const at = pool.findIndex((v) => v.id === cur);
  const next = pool[(at + 1 + pool.length) % pool.length];
  if (next && next.id !== cur) {
    out.push({
      id: `arr-voice-${target.id}`,
      kind: "arrange",
      text: `给「${labelOf(labels, target.id)}」单独换音色：换成「${next.name}」——${VOICE_FLAVOR[next.id] ?? "换个质感"}`,
      targets: [target.id],
      action: { t: "voice", id: target.id, voiceId: next.id },
      status: "pending",
    });
  }

  // ④ 段落重复/变奏：目标与其它线旋律轮廓高度相似 → 复制派生并升两级
  const tc = resample16(target.audio.pitchCurve);
  if (tc.length >= 8) {
    const sib = objs.find(
      (o) =>
        o.id !== target.id &&
        o.type === "stroke" &&
        o.audio.loopBeats > 0 &&
        !o.muted &&
        Math.abs(o.audio.loopBeats - target.audio.loopBeats) <= Math.max(1, target.audio.loopBeats * 0.3) &&
        (() => {
          const oc = resample16(o.audio.pitchCurve);
          if (oc.length < 8) return false;
          const diff = oc.reduce((a, b, i) => a + Math.abs(b - tc[i]), 0) / oc.length;
          return diff < 0.9;
        })(),
    );
    const like = sib ? (target.audio.pitchCurve.length >= sib.audio.pitchCurve.length ? target : sib) : null;
    if (like && objs.length + 1 <= MAX_CANVAS_OBJECTS) {
      const clone = duplicateObject(like);
      clone.audio.pitchCurve = clone.audio.pitchCurve.map((d) => d + 1); // duplicate 已 +1，这里再 +1 = 共升两级
      clone.points = clone.points.map((p) => ({ ...p, x: clamp(p.x + 0.06, -0.05, 1.05) }));
      clone.voiceId = like.voiceId;
      out.push({
        id: `arr-echo-${like.id}`,
        kind: "arrange",
        text: `「${labelOf(labels, like.id)}」和另一条旋律几乎一样，建议重复它并升两级做变奏（往右错开半拍距离落新线）`,
        targets: [like.id, sib ? sib.id : like.id],
        action: { t: "addObjs", objs: [clone] },
        status: "pending",
      });
    }
  }

  return out;
}

// ============================================================
// 风格迁移（五个规则引擎预设；幂等：重复应用/载入重放结果一致）
// ============================================================
export type StylePresetId = "jazz" | "bit8" | "orch" | "lofi" | "synthpop";

export interface StylePreset {
  id: StylePresetId;
  name: string;
  hint: string;
  voiceId: string; // 迁移后的全局音色
  cutoff01: number; // 附加的全局滤波曲线值（0..1，进既有曲线自动化链）
  groove: "swing" | "dense8" | "sparse" | "steady8" | "none"; // 卷帘律动改写
  pad: boolean; // 环境垫音层增强
  gainLayer: boolean; // 对象增益分层
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: "jazz", name: "爵士", hint: "摇摆律动 · 低音七和弦铺底 · 滤波变暗", voiceId: "guitar", cutoff01: 0.4, groove: "swing", pad: false, gainLayer: false },
  { id: "bit8", name: "8-bit", hint: "芯片音色 · 密集八分律动 · 滤波提亮", voiceId: "chip", cutoff01: 0.82, groove: "dense8", pad: false, gainLayer: false },
  { id: "orch", name: "管弦乐", hint: "弦乐 · 垫音增强 · 增益分层 · 柔化", voiceId: "strings", cutoff01: 0.55, groove: "none", pad: true, gainLayer: true },
  { id: "lofi", name: "Lo-fi", hint: "滤波压低 · 律动抽稀 · 磁带味", voiceId: "glass", cutoff01: 0.28, groove: "sparse", pad: false, gainLayer: false },
  { id: "synthpop", name: "合成流行", hint: "锯齿 Lead · 稳定八分律动 · 中置提亮", voiceId: "lead", cutoff01: 0.76, groove: "steady8", pad: false, gainLayer: false },
];

export function stylePresetById(id: string | null | undefined): StylePreset | null {
  return STYLE_PRESETS.find((s) => s.id === id) ?? null;
}

// 卷帘律动改写：从笔迹音高曲线重铺显式音符序列（幂等：结果只依赖当前 pitchCurve）
function grooveRoll(obj: CanvasObject, mode: StylePreset["groove"], degs: number): RollNote[] {
  const c = obj.audio.pitchCurve;
  if (c.length === 0) return [];
  const stepBeats = mode === "sparse" ? 1 : 0.5;
  const steps = clamp(Math.floor(obj.audio.loopBeats / stepBeats), 2, 96);
  const out: RollNote[] = [];
  for (let i = 0; i < steps; i += 1) {
    const k = Math.round((i / Math.max(1, steps - 1)) * (c.length - 1));
    const z = Math.round((i / Math.max(1, steps - 1)) * ((obj.audio.velocityCurve.length || 1) - 1));
    const velBase = obj.audio.velocityCurve[z] ?? 0.6;
    let beat = i * stepBeats;
    let vel = velBase;
    if (mode === "swing" && i % 2 === 1) beat += 0.15;
    if (mode === "dense8") vel = clamp(0.5 + velBase * 0.3, 0.2, 0.9);
    if (mode === "steady8") vel = clamp(0.45 + velBase * 0.4, 0.25, 0.92);
    if (mode === "sparse") vel = clamp(velBase * 0.85, 0.1, 0.9);
    out.push({
      beat: Math.round(beat * 100) / 100,
      deg: clamp(Math.round(c[k] ?? 0), 0, degs - 1),
      vel: Math.round(vel * 100) / 100,
    });
  }
  return out;
}

// 渐强渐弱音量曲线（混音建议「动态太平」与风格引擎共用）
export function buildVolCurveObject(): CanvasObject {
  return {
    id: newCanvasId(),
    type: "curve",
    curveParam: "vol",
    points: [
      { x: 0.04, y: 1 - 0.2, t: 0 },
      { x: 0.36, y: 1 - 0.85, t: 0 },
      { x: 0.68, y: 1 - 0.25, t: 0 },
      { x: 0.96, y: 1 - 0.8, t: 0 },
    ],
    audio: { pitchCurve: [], velocityCurve: [], closed: false, loopBeats: 12 },
    createdAt: Date.now(),
  };
}

// 全局滤波曲线（风格引擎专用；styleGenerated 标记让载入重放可先去旧再加新 = 幂等）
function buildCutoffCurveObject(cutoff01: number): CanvasObject {
  return {
    id: newCanvasId(),
    type: "curve",
    curveParam: "cutoff",
    styleGenerated: true,
    points: [
      { x: 0.02, y: clamp(1 - cutoff01, 0, 1), t: 0 },
      { x: 0.98, y: clamp(1 - cutoff01, 0, 1), t: 0 },
    ],
    audio: { pitchCurve: [], velocityCurve: [], closed: false, loopBeats: 12 },
    createdAt: Date.now(),
  };
}

/**
 * 就地语义但返回新数组（JSON 深拷贝，撤销栈快照与它互不共享引用）。
 * 幂等：先剥掉 styleGenerated 对象（旧的滤波曲线/爵士和弦），再按 preset 重写
 * 每条发声线的 voiceId / 律动 roll /（可选）增益分层，最后补上本风格的曲线与和弦。
 * 旋律（points/pitchCurve 本体）不动——风格只改质感与律动，不重谱写曲。
 */
export function applyStyle(objs: CanvasObject[], p: StylePreset, ctx: AiContext): CanvasObject[] {
  const kept: CanvasObject[] = (JSON.parse(JSON.stringify(objs)) as CanvasObject[]).filter(
    (o) => !o.styleGenerated,
  );
  const sounding = kept.filter((o) => o.type === "stroke" && o.audio.loopBeats > 0 && !o.muted);
  sounding.forEach((o, i) => {
    o.voiceId = p.voiceId;
    if (p.groove !== "none") o.roll = grooveRoll(o, p.groove, ctx.degs);
    if (p.gainLayer) o.aiGain = i % 2 === 0 ? 1.05 : 0.8;
  });
  const extra: CanvasObject[] = [];
  const room = Math.max(0, MAX_CANVAS_OBJECTS - kept.length);
  if (room > 0) extra.push(buildCutoffCurveObject(p.cutoff01));
  if (p.id === "jazz" && room > extra.length + 3) {
    const target = sounding.sort((a, b) => b.audio.pitchCurve.length - a.audio.pitchCurve.length)[0] ?? null;
    extra.push(...buildChordAnchors(kept, target, ctx, true));
  }
  return [...kept, ...extra];
}
