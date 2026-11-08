// 滚动乐团 · 打字钢琴 26 键映射（唯一真源：Logic 触发层、合成层、渲染层共用）
// 键盘物理排布 qwertyuiop → asdfghjkl → zxcvbnm 共 26 键，
// 依次映射从 C3 起升序的 26 个互不重复白键；Shift 触发右邻黑键（E/B 无黑键回落白键）。

export const PIANO_C3_MIDI = 48;

// 一个八度内白键半音偏移（C D E F G A B）
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
// 白键右邻是否存在黑键（C D · E无 · F G A · B无）
const HAS_BLACK_AFTER = [true, true, false, true, true, true, false];

const KEY_ORDER = "qwertyuiopasdfghjklzxcvbnm"; // 26 键物理顺序

export interface PianoKey {
  ch: string; // 物理字母（小写）
  midi: number; // 白键 MIDI 音高
  blackMidi: number | null; // 右邻黑键 MIDI；E/B 为 null
}

export const PIANO_KEYS: PianoKey[] = KEY_ORDER.split("").map((ch, i) => {
  const octave = Math.floor(i / WHITE_OFFSETS.length);
  const wi = i % WHITE_OFFSETS.length;
  const midi = PIANO_C3_MIDI + octave * 12 + WHITE_OFFSETS[wi];
  return { ch, midi, blackMidi: HAS_BLACK_AFTER[wi] ? midi + 1 : null };
});

/** 物理字母 → 键位索引 0..25；非映射键返回 -1 */
export function pianoIndexOf(ch: string): number {
  return KEY_ORDER.indexOf(ch.toLowerCase());
}

// ---- 双键盘布局 ----
// qwerty = 上方物理三行横向 26 白键（Shift 弹黑）；
// piano  = 经典 DAW 双八度钢琴排布（26 键）：下排 Z X C V B N M = C3–B3 七白，
//          中排 A S D F G H J K L ; ' , = C4–G5 十二白，上排 W E T Y U O P = 主八度黑键
//          （C#4 D#4 F#4 G#4 A#4 C#5 D#5，直接按即黑键、无需 Shift）。
// 挑战模式固定按 qwerty 解析（键符与谱面同源），布局只影响演奏/作曲/触屏键盘。

export type Keymap = "qwerty" | "piano";

export interface PianoLayoutKey {
  ch: string; // 物理键字符（小写，含 ; ' , 标点键）
  midi: number; // 直接按下即发的音高
  black: boolean; // 是否黑键位
}

function buildPianoLayout(): PianoLayoutKey[] {
  const out: PianoLayoutKey[] = [];
  // 下排七白 C3–B3
  "zxcvbnm".split("").forEach((ch, i) => {
    out.push({ ch, midi: PIANO_C3_MIDI + WHITE_OFFSETS[i], black: false });
  });
  // 中排十二白 C4–G5
  "asdfghjkl;,'".split("").forEach((ch, i) => {
    const oct = Math.floor(i / 7);
    const wi = i % 7;
    out.push({ ch, midi: PIANO_C3_MIDI + 12 + oct * 12 + WHITE_OFFSETS[wi], black: false });
  });
  // 上排七黑（主八度 C#4–D#5）
  const blackSemitones = [1, 3, 6, 8, 10, 13, 15]; // 距 C4 的半音数
  "wetyuop".split("").forEach((ch, i) => {
    out.push({ ch, midi: PIANO_C3_MIDI + 12 + blackSemitones[i], black: true });
  });
  return out;
}

export const PIANO_LAYOUT: PianoLayoutKey[] = buildPianoLayout();

/** piano 布局下按下的键 → 直接音高；未映射返回 null */
export function layoutKeyOf(ch: string): PianoLayoutKey | null {
  const c = ch.toLowerCase();
  return PIANO_LAYOUT.find((k) => k.ch === c) ?? null;
}

/** piano 布局下某 MIDI 音高的键名标注（大写）；该音无专属键返回 null */
export function layoutLabelOfMidi(midi: number): string | null {
  return PIANO_LAYOUT.find((k) => k.midi === midi)?.ch.toUpperCase() ?? null;
}

/** MIDI 音级 → 频率（A4=440 标准律） */
export function midiFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---- 打字层玩法（鼓 ↔ 钢琴）----

export type TypingMode = "drum" | "piano";

export function typingModeName(m: TypingMode): string {
  return m === "piano" ? "钢琴" : "鼓";
}

export function nextTypingMode(m: TypingMode): TypingMode {
  return m === "piano" ? "drum" : "piano";
}

// ---- 音名标注（唯一真源：背景键盘层与挑战下落块共用）----

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** MIDI 音高 → 科学音名（如 60→"C4"、75→"D#5"） */
export function midiNoteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  return `${SHARP_NAMES[pc]}${Math.floor(midi / 12) - 1}`;
}

/** 键位索引 + 是否黑键 → 要按的字母标注（白键 `J`、黑键 `⇧K` 示 Shift；下落块单一真源） */
export function pianoKeyLabel(index: number, black: boolean): string {
  const pk = PIANO_KEYS[index];
  if (!pk) return "";
  const ch = pk.ch.toUpperCase();
  return black ? `⇧${ch}` : ch;
}

/** MIDI 音高 →（白键索引 0..25，是否黑键）；超出 26 键映射范围返回 null */
export function pianoPosOfMidi(midi: number): { key: number; black: boolean } | null {
  for (let i = 0; i < PIANO_KEYS.length; i += 1) {
    const pk = PIANO_KEYS[i];
    if (pk.midi === midi) return { key: i, black: false };
    if (pk.blackMidi === midi) return { key: i, black: true };
  }
  return null;
}
