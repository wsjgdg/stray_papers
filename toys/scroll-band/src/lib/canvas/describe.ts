// 无障碍 · 画布轨迹文字描述：把作曲画布上的线/锚点翻译成一句句中文，
// 供屏幕朗读念出、贴给他人转述、或导出 .txt 留档。视觉即乐谱，文字也要是乐谱。
import type { Scale } from "@/lib/audio/scales";
import { bandRange, scaleMidi } from "@/lib/audio/scales";
import { midiNoteName } from "@/lib/audio/pianoMap";
import { CURVE_PARAM_META, rollFromObject, type CanvasObject } from "./scoreCanvas";

/** 画布 → 逐对象文字描述（多行文本，第一行为概览头）。音区级基准/级数取自画布大区 E2–C6 */
export function describeCanvasText(objs: CanvasObject[], scale: Scale, bpm: number): string {
  const range = bandRange(scale);
  const degs = range.degs;
  const base = range.lo;
  const name = (idx: number) => midiNoteName(scaleMidi(scale, idx));
  const lines: string[] = [];
  const strokes = objs.filter((o) => o.type === "stroke").length;
  const anchors = objs.filter((o) => o.type === "anchor").length;
  const curves = objs.filter((o) => o.type === "curve").length;
  lines.push(
    `画布轨迹描述 · ${strokes} 条线 ${anchors} 个锚点${curves > 0 ? ` ${curves} 条参数曲线` : ""} · 音阶 ${scale.name} · BPM ${bpm}`,
  );
  let si = 0;
  let ai = 0;
  let ci = 0;
  for (const o of objs) {
    if (o.type === "anchor") {
      ai += 1;
      const deg = Math.round(o.audio.pitchCurve[0] ?? 0);
      lines.push(`锚点 ${ai}：单音 ${name(base + deg)}`);
      continue;
    }
    if (o.type === "curve") {
      ci += 1;
      const vs = o.points.map((p) => Math.round((1 - p.y) * 100));
      const pname = o.curveParam ? CURVE_PARAM_META[o.curveParam].name : "参数";
      lines.push(
        `曲线 ${ci}（${pname}，不发音）：横跨 ${o.audio.loopBeats} 拍，取值约 ${vs[0] ?? 50}% → ${
          vs[vs.length - 1] ?? 50
        }%（上=大）`,
      );
      continue;
    }
    si += 1;
    const notes = o.roll && o.roll.length > 0 ? o.roll : rollFromObject(o, degs);
    if (notes.length === 0) {
      lines.push(`线 ${si}：暂无可发音的音符`);
      continue;
    }
    const midis = notes.map((n) => base + n.deg);
    const first = name(midis[0]);
    const last = name(midis[midis.length - 1]);
    const lo = name(Math.min(...midis));
    const hi = name(Math.max(...midis));
    let ups = 0;
    let downs = 0;
    for (let i = 1; i < midis.length; i += 1) {
      if (midis[i] > midis[i - 1]) ups += 1;
      else if (midis[i] < midis[i - 1]) downs += 1;
    }
    const dir = o.audio.closed
      ? "闭合成环（琶音循环）"
      : ups === 0 && downs === 0
        ? "同音保持"
        : ups > 0 && downs > 0 && Math.abs(ups - downs) <= Math.max(1, (ups + downs) * 0.3)
          ? "起伏波动"
          : ups > downs
            ? "总体上行"
            : "总体下行";
    const edited = o.roll && o.roll.length > 0 ? "（卷帘编辑过的音符序列）" : "";
    lines.push(
      `线 ${si}：${notes.length} 个音、时长 ${o.audio.loopBeats} 拍，${first} → ${last}，音域 ${lo}–${hi}，走向${dir}${edited}`,
    );
  }
  return lines.join("\n");
}
