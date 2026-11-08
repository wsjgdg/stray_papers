// 滚动乐团 · 导入 .mid 文件转打歌谱
// 标准 MIDI 文件纯前端解析：**只支持 SMF Format 0/1 + PPQ 分辨率**，
// Format 2 与 SMPTE 时间码分轨直接给中文提示，不硬解。
// 头块 / 轨块 / 变长增量 / 速度事件，把所有轨的 note-on 合并到同一条拍轴上，
// 量化到半拍网格，产出与文本谱同款的 seq: [拍位, MIDI][]，喂给 chartByBeats 编译链。
// 异常一律归成中文 error，不抛。
// 超音域音不再默默精简：面板先 scanMidiOob 拿预览统计，用户选完处理策略
// （drop 删减 / transpose 整体移调入域 / clamp 就近贴边）再 parseMidiFile 重排。

import { midiNoteName, pianoPosOfMidi } from "@/lib/audio/pianoMap";

export interface ParsedMidi {
  name: string;
  bpm: number;
  seq: [number, number][];
  /** 同拍同音被去重、超上限被截断、或按所选策略仍落在域外被跳过的音符数 */
  skipped: number;
  error: string | null;
}

/** 域外音处理策略：删减 / 整曲移调进域 / 就近夹到域边缘 */
export type OobMode = "drop" | "transpose" | "clamp";

/** 解析前的域外预览统计（不做任何处理） */
export interface OobScan {
  error: string | null;
  name: string;
  bpm: number;
  total: number;
  oobCount: number;
  lo: number; // 全曲最低 MIDI
  hi: number; // 全曲最高 MIDI
}

const MAX_NOTES = 400;
const MIN_NOTES = 4;

// 可弹音域边界（pianoPosOfMidi 是唯一真源，这里探测出连续区间供移调/夹边使用）
function probeRange(): [number, number] {
  let lo = 127;
  let hi = 0;
  for (let m = 21; m <= 108; m += 1) {
    if (pianoPosOfMidi(m)) {
      if (m < lo) lo = m;
      if (m > hi) hi = m;
    }
  }
  return [lo, hi];
}
const [RANGE_LO, RANGE_HI] = probeRange();

const FORMAT_MSG =
  "只支持标准 MIDI 的 Format 0/1 + PPQ 分辨率（不支持 Format 2 与 SMPTE 时间码），换一份导出的钢琴谱试试";

interface RawNote {
  beat: number;
  midi: number;
}
interface RawMidi {
  name: string;
  bpm: number;
  raw: RawNote[];
}

/** 纯字节层解析：不做音域过滤、不量化，产出全轨 note-on 原始拍轴 */
function readMidiNotes(buf: ArrayBuffer, fallbackName: string): { error: string } | RawMidi {
  const dv = new DataView(buf);
  let p = 0;
  const u8 = () => dv.getUint8(p++);
  const u32 = () => {
    const v = dv.getUint32(p);
    p += 4;
    return v;
  };
  const tag = () => {
    const s = String.fromCharCode(u8(), u8(), u8(), u8());
    return s;
  };
  // MIDI 变长数（最高位续接）
  const vlq = (limit: number): number | null => {
    let v = 0;
    for (let i = 0; i < 4; i += 1) {
      if (p >= limit) return null;
      const b = u8();
      v = (v << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) return v;
    }
    return null;
  };

  if (buf.byteLength < 14 || tag() !== "MThd") return { error: "这个文件不像标准 .mid 文件" };
  const headLen = u32();
  if (headLen < 6) return { error: "MIDI 文件头不完整" };
  const format = dv.getUint16(p);
  const division = dv.getUint16(p + 4);
  p += headLen;
  // 支持范围明示：Format 只认 0/1；division 最高位为 1 = SMPTE 时间码时基
  if (format > 1) return { error: FORMAT_MSG };
  if (division & 0x8000) return { error: FORMAT_MSG };
  const ppq = Math.max(1, division);

  let bpm: number | null = null;
  let name = "";
  const raw: RawNote[] = [];

  while (p + 8 <= dv.byteLength) {
    const tStart = p;
    if (tag() !== "MTrk") {
      // 未知块按声明长度跳过
      p = tStart + 4;
      p = tStart + 8 + u32();
      continue;
    }
    const size = u32();
    const end = Math.min(tStart + 8 + size, dv.byteLength);
    p = tStart + 8;

    let tick = 0;
    let running = -1;
    while (p < end) {
      const delta = vlq(end);
      if (delta === null) break;
      tick += delta;

      // meta（0xFF）与 sysex 不参与 running status，先分流
      const head = dv.getUint8(p);
      if (head === 0xff) {
        p += 1;
        if (p >= end) break;
        const metaType = dv.getUint8(p);
        p += 1;
        const len = vlq(end);
        if (len === null) break;
        if (metaType === 0x51 && len === 3 && p + 3 <= end) {
          const usPerQuarter =
            (dv.getUint8(p) << 16) | (dv.getUint8(p + 1) << 8) | dv.getUint8(p + 2);
          if (usPerQuarter > 0 && bpm === null) bpm = Math.round((60 * 1000000) / usPerQuarter);
        } else if (metaType === 0x03 && !name && len > 0 && p + len <= end) {
          let s = "";
          for (let i = 0; i < len; i += 1) s += String.fromCharCode(dv.getUint8(p + i));
          name = s.trim();
        }
        p += len;
        continue;
      }
      if (head === 0xf0 || head === 0xf7) {
        p += 1;
        const len = vlq(end);
        if (len === null) break;
        p += len;
        continue;
      }
      // 通道消息：状态字节可被 running status 省略
      if (head & 0x80) {
        p += 1;
        running = head;
      } else if (running < 0) {
        break;
      }
      const type = running & 0xf0;
      if (p >= end) break;
      const note = dv.getUint8(p);
      p += 1;
      if (type === 0x90 || type === 0x80 || type === 0xa0 || type === 0xb0) {
        if (p >= end) break;
        const d = dv.getUint8(p);
        p += 1;
        if (type === 0x90 && d > 0) raw.push({ beat: tick / ppq, midi: note });
      }
      // 0xc0 / 0xd0 / 0xe0：音名后无更多数据字节
    }
    p = end === 0 ? tStart + 8 + size : end;
  }

  if (raw.length === 0) return { error: "没在这份 MIDI 里找到旋律音符" };
  return { name: name || fallbackName, bpm: Math.min(240, Math.max(40, bpm ?? 100)), raw };
}

/** 只做统计不做处理：面板先拿它弹「域外音怎么处理」预览 */
export function scanMidiOob(buf: ArrayBuffer, fallbackName: string): OobScan {
  const r = readMidiNotes(buf, fallbackName);
  if ("error" in r)
    return { error: r.error, name: fallbackName, bpm: 100, total: 0, oobCount: 0, lo: 0, hi: 0 };
  let oobCount = 0;
  let lo = 127;
  let hi = 0;
  for (const n of r.raw) {
    if (!pianoPosOfMidi(n.midi)) oobCount += 1;
    if (n.midi < lo) lo = n.midi;
    if (n.midi > hi) hi = n.midi;
  }
  return { error: null, name: r.name, bpm: r.bpm, total: r.raw.length, oobCount, lo, hi };
}

/** 整曲移调的最小八度位移（半音数）；谱面比键盘还宽时取居中折中 */
function transposeShift(raw: RawNote[]): number {
  let lo = 127;
  let hi = 0;
  for (const n of raw) {
    if (n.midi < lo) lo = n.midi;
    if (n.midi > hi) hi = n.midi;
  }
  const k1 = Math.ceil((RANGE_LO - lo) / 12);
  const k2 = Math.floor((RANGE_HI - hi) / 12);
  const k = k1 > k2 ? Math.round((k1 + k2) / 2) : Math.max(k1, Math.min(k2, 0));
  return k * 12;
}

/**
 * 解析 .mid 并按所选策略处理域外音；fallbackName 用文件名（去后缀）兜底曲名。
 * 先 scanMidiOob 预览、用户选完策略再带 oobMode 调这里（默认 drop = 旧精简行为）。
 */
export function parseMidiFile(buf: ArrayBuffer, fallbackName: string, oobMode: OobMode = "drop"): ParsedMidi {
  const fail = (msg: string): ParsedMidi => ({
    name: fallbackName,
    bpm: 100,
    seq: [],
    skipped: 0,
    error: msg,
  });

  const r = readMidiNotes(buf, fallbackName);
  if ("error" in r) return fail(r.error);

  let notes = r.raw;
  if (oobMode === "transpose") {
    const off = transposeShift(notes);
    if (off !== 0) notes = notes.map((n) => ({ beat: n.beat, midi: n.midi + off }));
  } else if (oobMode === "clamp") {
    notes = notes.map((n) => ({ beat: n.beat, midi: Math.min(RANGE_HI, Math.max(RANGE_LO, n.midi)) }));
  }

  // 量化到半拍网格 + 同拍同音去重 + 可弹音域过滤 + 每拍最多 3 音（下落谱的可弹密度）
  let skipped = 0;
  const perBeat = new Map<number, Set<number>>();
  const kept: [number, number][] = [];
  for (const n of notes) {
    const beat = Math.round(n.beat * 2) / 2;
    if (!pianoPosOfMidi(n.midi)) {
      skipped += 1;
      continue;
    }
    let set = perBeat.get(beat);
    if (!set) {
      set = new Set();
      perBeat.set(beat, set);
    }
    if (set.has(n.midi) || set.size >= 3) {
      skipped += 1;
      continue;
    }
    set.add(n.midi);
    kept.push([beat, n.midi]);
  }
  kept.sort((a, z) => a[0] - z[0] || a[1] - z[1]);

  if (kept.length === 0)
    return fail("这些音都超出了可弹音域（C3–D6），换一份钢琴谱试试");
  let seq = kept;
  if (seq.length > MAX_NOTES) {
    skipped += seq.length - MAX_NOTES;
    seq = seq.slice(0, MAX_NOTES);
  }
  if (seq.length < MIN_NOTES) return fail("能弹的音太少（不足 4 个），这份谱子没法开玩");

  return {
    name: r.name,
    bpm: r.bpm,
    seq,
    skipped,
    error: null,
  };
}

/**
 * 拍轴 → 文本谱（给谱架留一份可编辑草稿、以及「复制/导出文本」用）。
 * 文本协议最短粒度是一拍，这里按整拍归拢（同拍多音用 +，空拍 .）；
 * MIDI 的半拍细节存在谱架条目的 seq 里，点 chip 开玩走 seq，不走这份草稿。
 */
export function seqToChartText(name: string, bpm: number, seq: [number, number][]): string {
  const byBeat = new Map<number, string[]>();
  let maxBeat = 0;
  for (const [b, midi] of seq) {
    const beat = Math.round(b);
    const nm = midiNoteName(midi);
    const arr = byBeat.get(beat) ?? [];
    if (arr.length < 3 && !arr.includes(nm)) arr.push(nm);
    byBeat.set(beat, arr);
    if (beat > maxBeat) maxBeat = beat;
  }
  const tokens: string[] = [];
  for (let beat = 0; beat <= maxBeat; beat += 1) {
    const arr = byBeat.get(beat);
    if (!arr || arr.length === 0) tokens.push(".");
    else tokens.push(...arr.map((nm, i) => (i === 0 ? nm : `+${nm}`)));
  }
  return `曲名: ${name}\nBPM: ${bpm}\n${tokens.join(" ")}`;
}

// ---- 串烧统一调性：音级直方图 × 大/小调模板命中，估算调中心 ----

const MAJOR_TPL = [0, 2, 4, 5, 7, 9, 11];
const MINOR_TPL = [0, 2, 3, 5, 7, 8, 11];

/** 返回主音 pitch class（0=C）；命中率过低（无调性/太杂）返回 null 表示别硬移 */
function estimateTonic(seq: [number, number][]): number | null {
  if (seq.length < 4) return null;
  const hist = new Array<number>(12).fill(0);
  for (const [, m] of seq) hist[((m % 12) + 12) % 12] += 1;
  let best = -1;
  let bestT = 0;
  for (let t = 0; t < 12; t += 1) {
    for (const tpl of [MAJOR_TPL, MINOR_TPL]) {
      const set = new Set(tpl.map((x) => (x + t) % 12));
      let hit = 0;
      for (let pc = 0; pc < 12; pc += 1) if (set.has(pc)) hit += hist[pc];
      const cov = hit / seq.length;
      if (cov > best) {
        best = cov;
        bestT = t;
      }
    }
  }
  return best >= 0.5 ? bestT : null;
}

/** 就近半音偏移（-5..+6），把 from 调中心对齐到 to */
function alignOffset(from: number, to: number): number {
  return ((to - from + 18) % 12) - 6;
}

/**
 * 把多份带拍轴的谱串成一张连续谱（串烧）：逐段接排、段间留两拍呼吸，
 * BPM 按音符数加权平均（单一速度轴没法逐段变速）。不足两份返回 null。
 * options.unifyKey：以第一首为基准统一调性——各首估算调中心后整体移调对齐
 * （估不准的不移），移调后域外音就近夹边，消除接排处的调性打架。
 */
export function buildMedley(
  items: { bpm: number; seq: [number, number][] }[],
  options?: { unifyKey?: boolean },
): { bpm: number; seq: [number, number][]; pieces: number; retuned: number } | null {
  const usable = items.filter((i) => i.seq.length > 0);
  if (usable.length < 2) return null;
  let weight = 0;
  let bpmSum = 0;
  for (const it of usable) {
    weight += it.seq.length;
    bpmSum += it.bpm * it.seq.length;
  }
  const bpm = Math.min(240, Math.max(40, Math.round(bpmSum / weight)));
  const refTonic = options?.unifyKey ? estimateTonic(usable[0].seq) : null;
  let retuned = 0;
  const seq: [number, number][] = [];
  let offset = 0;
  for (let idx = 0; idx < usable.length; idx += 1) {
    const it = usable[idx];
    let trans = 0;
    if (refTonic !== null && idx > 0) {
      const t = estimateTonic(it.seq);
      if (t !== null) trans = alignOffset(t, refTonic);
    }
    let maxBeat = 0;
    for (const [b, m] of it.seq) {
      const shifted = m + trans;
      seq.push([b + offset, trans !== 0 ? Math.min(RANGE_HI, Math.max(RANGE_LO, shifted)) : shifted]);
      if (b > maxBeat) maxBeat = b;
    }
    if (trans !== 0) retuned += 1;
    offset += Math.ceil(maxBeat) + 2;
    if (seq.length >= 1200) break;
  }
  return { bpm, seq: seq.slice(0, 1200), pieces: usable.length, retuned };
}
