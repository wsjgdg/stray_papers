// 滚动乐团 · 作曲画布导出 Standard MIDI File（Format 0，PPQ 480）
//   输入与播放器同源的 LoopSpec（每对象独立循环周期 + 人性化抖动照抄），
//   「N 遍」= 最长循环 × N 的窗口内，各对象按自身周期反复铺满——导出的就是听到的多层叠加。

import type { LoopSpec } from "@/lib/canvas/scoreCanvas";
import type { Scale } from "@/lib/audio/scales";
import { scaleMidi } from "@/lib/audio/scales";

const PPQ = 480;

export interface AnchorNote {
  t: number; // 秒（绝对，第 1 遍窗口内）
  idx: number; // 绝对音级索引
  v: number; // 0..1
}

interface MidiNote {
  on: number; // 秒
  off: number; // 秒
  midi: number;
  vel: number; // 0..1
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 收集 N 遍窗口内全部音符：循环对象按自身 period 反复，锚点只响一次 */
function collectNotes(
  specs: LoopSpec[],
  anchors: AnchorNote[],
  bpm: number,
  repeats: number,
  scale: Scale,
): MidiNote[] {
  const beat = 60 / bpm;
  const maxPeriod = specs.reduce((mx, s) => Math.max(mx, s.period), 0);
  const end = maxPeriod * Math.max(1, repeats);
  const notes: MidiNote[] = [];

  for (const spec of specs) {
    if (spec.events.length === 0 || spec.period <= 0) continue;
    const loops = Math.floor(end / spec.period + 1e-6);
    const sorted = [...spec.events].sort((a, b) => a.t - b.t);
    for (let k = 0; k <= loops; k += 1) {
      const t0 = k * spec.period;
      if (t0 >= end) break;
      for (let i = 0; i < sorted.length; i += 1) {
        const ev = sorted[i];
        if (ev.d !== undefined) continue; // AI 鼓律动线事件不是音高事件，.mid 里跳过（鼓走打字侧不进 MIDI 是既有约定）
        const on = t0 + ev.t;
        if (on >= end) break;
        const next = i + 1 < sorted.length ? sorted[i + 1].t : spec.period + sorted[0].t;
        const gap = Math.max(0.02, next - ev.t);
        const dur = Math.min(0.85 * gap, 1.5 * beat);
        const midi = Math.min(108, Math.max(21, scaleMidi(scale, ev.idx)));
        notes.push({ on, off: Math.min(end, on + dur), midi, vel: clamp01(ev.v) });
      }
    }
  }
  for (const a of anchors) {
    if (a.t >= end) continue;
    notes.push({
      on: a.t,
      off: Math.min(end, a.t + 1.2 * beat),
      midi: Math.min(108, Math.max(21, scaleMidi(scale, a.idx))),
      vel: clamp01(a.v),
    });
  }
  return notes;
}

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  let rest = n >>> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return bytes;
}

function be16(v: number): number[] {
  return [(v >> 8) & 0xff, v & 0xff];
}
function be32(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

interface TimedMsg {
  tick: number;
  msg: number[];
  order: number; // 同 tick：note-off 在前防叠音
}

/** 生成 .mid 文件字节（可直接塞 Blob 下载） */
export function buildMidiFile(args: {
  specs: LoopSpec[];
  anchors: AnchorNote[];
  scale: Scale;
  bpm: number;
  repeats: number;
}): Uint8Array {
  const { specs, anchors, scale, bpm, repeats } = args;
  const tempo = Math.round(60000000 / bpm);

  const events: TimedMsg[] = [];
  const toTick = (sec: number) => Math.max(0, Math.round(((sec * bpm) / 60) * PPQ));
  events.push({ tick: 0, msg: [0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff], order: 0 });

  for (const n of collectNotes(specs, anchors, bpm, repeats, scale)) {
    events.push({ tick: toTick(n.on), msg: [0x90, n.midi, Math.max(1, Math.min(127, Math.round(n.vel * 100 + 20)))], order: 1 });
    events.push({ tick: toTick(n.off), msg: [0x80, n.midi, 0x00], order: 0 });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [];
  let last = 0;
  for (const e of events) {
    track.push(...vlq(e.tick - last), ...e.msg);
    last = e.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = [
    ...[0x4d, 0x54, 0x68, 0x64], // MThd
    ...be32(6),
    ...be16(0),
    ...be16(1),
    ...be16(PPQ),
  ];
  const trackHead = [
    ...[0x4d, 0x54, 0x72, 0x6b], // MTrk
    ...be32(track.length),
  ];
  return new Uint8Array([...header, ...trackHead, ...track]);
}

/** 触发浏览器下载 */
export function downloadMidi(bytes: Uint8Array, filename: string): void {
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  const url = URL.createObjectURL(new Blob([buf], { type: "audio/midi" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
