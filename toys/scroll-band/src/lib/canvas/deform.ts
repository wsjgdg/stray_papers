// 乐句变形器 · 纯函数：选中一条线/锚点，一键出变体——一条线生十条线。
// 两类数据通道：
//   · 移调走音高曲线（pitchCurve 允许越带音级 = 真实级/八度移动，清回曲线编译保持单一真源）；
//   · 倒影/逆行/加密/稀疏/节奏缩放走卷帘覆盖（显式音符序列，变形即重写 roll）。
import { rollFromObject, type CanvasObject, type RollNote } from "./scoreCanvas";

export type DeformOp =
  | "retrograde"
  | "mirror"
  | "densify"
  | "sparse"
  | "stepUp"
  | "stepDown"
  | "octaveUp"
  | "octaveDown"
  | "speedUp"
  | "slowDown";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const snap4 = (v: number) => Math.round(v * 4) / 4;

/**
 * 对一个对象就地变形；返回一句中文结果说明（失败时返回原因）。
 * octaveDegs = 音阶一个八度的级数（移调「升降整八度」用）；bandDegs = 画布大区 E2–C6 级数（卷帘/倒影越界夹回用）。
 */
export function deformObject(obj: CanvasObject, op: DeformOp, octaveDegs: number, bandDegs: number): string {
  const degs = bandDegs;
  // ---- 移调：整条音高曲线平移（锚点也支持），越带合法 → 八度/级都是真移调 ----
  if (op === "stepUp" || op === "stepDown" || op === "octaveUp" || op === "octaveDown") {
    const step = op === "octaveUp" ? octaveDegs : op === "octaveDown" ? -octaveDegs : op === "stepUp" ? 1 : -1;
    obj.audio.pitchCurve = obj.audio.pitchCurve.map((d) => d + step);
    obj.roll = undefined; // 几何未动、只动音高：清掉卷帘覆盖，曲线成为唯一发声源
    return op.startsWith("octave")
      ? `移调 ${step > 0 ? "升" : "降"}一整八度`
      : `移调 沿音阶${step > 0 ? "上" : "下"}移一级`;
  }
  if (obj.type !== "stroke") return "锚点只有一个音，倒影/逆行/加密/稀疏不适用——移调可以";

  // ---- 节奏缩放：循环时长 ×2 或 ÷2（卷帘拍位同步伸缩） ----
  if (op === "speedUp" || op === "slowDown") {
    const f = op === "speedUp" ? 0.5 : 2;
    obj.audio.loopBeats = clamp(Math.round(obj.audio.loopBeats * f * 4) / 4, 0.75, 32);
    if (obj.roll && obj.roll.length > 0) {
      obj.roll = obj.roll.map((n) => ({ ...n, beat: snap4(n.beat * f) }));
    }
    return `节奏${op === "speedUp" ? "加快 2 倍" : "放慢 2 倍"}（循环 ${obj.audio.loopBeats} 拍）`;
  }

  const src = obj.roll && obj.roll.length > 0 ? obj.roll : rollFromObject(obj, degs);
  if (src.length < 2) return "这条线的音太少，这个变形做不了";
  let out: RollNote[];
  if (op === "retrograde") {
    // 时间轴倒转：最后一个音变第一个（按谱面最大拍位镜像回 0 点）
    const lastBeat = Math.max(...src.map((n) => n.beat));
    out = src
      .map((n) => ({ ...n, beat: snap4(lastBeat - n.beat) }))
      .sort((a, b) => a.beat - b.beat);
    return `逆行：${src.length} 个音时间轴倒转，末音变首音`;
  }
  if (op === "mirror") {
    // 倒影：以首音为轴上下翻转，再整体平移夹回音域带（翻形不翻调性）
    const a = src[0].deg;
    const flipped = src.map((n) => ({ ...n, deg: 2 * a - n.deg }));
    const lo = Math.min(...flipped.map((n) => n.deg));
    const hi = Math.max(...flipped.map((n) => n.deg));
    let shift = lo < 0 ? -lo : 0;
    if (hi + shift > degs - 1) shift = Math.max(shift, degs - 1 - hi);
    out = flipped.map((n) => ({ ...n, deg: clamp(n.deg + shift, 0, degs - 1) }));
    return `倒影：${src.length} 个音以首音为轴上下翻转`;
  }
  if (op === "densify") {
    // 加密：相邻两音之间插一个经过音（音高取中点、拍位取中点、力度略轻）
    out = [];
    let inserted = 0;
    for (let i = 0; i < src.length; i += 1) {
      out.push(src[i]);
      const b = src[i + 1];
      if (!b) continue;
      if (b.beat - src[i].beat < 0.25) continue; // 网格挤不下就不硬塞
      out.push({
        beat: snap4((src[i].beat + b.beat) / 2),
        deg: clamp(Math.round((src[i].deg + b.deg) / 2), 0, degs - 1),
        vel: Math.round(Math.min(src[i].vel, b.vel) * 0.8 * 100) / 100,
      });
      inserted += 1;
    }
    if (inserted === 0) return "相邻音都贴满网格了，加密插不进经过音";
    return `加密：插入 ${inserted} 个经过音，${src.length} → ${out.length} 音`;
  }
  // sparse：删掉偶数位置（第 2、4、6…个）音
  out = src.filter((_, i) => i % 2 === 0);
  return `稀疏：删掉偶数位音，${src.length} → ${out.length} 音`;
}
