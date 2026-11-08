// 滚动乐团 · 音阶、音色与鼓组风格包注册表（唯一真源：渲染层、编译层、合成层共用）
// 音阶 = 一个八度内的半音集合；X 轴音高量化与作曲对象 Y→音高编译都按当前音阶量化。
// 鼓组风格包 = 打字鼓组（含循环回放里的鼓事件）的音色包，与旋律音色相互独立。

export interface Scale {
  id: string;
  name: string; // 中文名（HUD / aria 播报）
  semitones: number[]; // 相对主音的八度内半音偏移，长度 = 音阶级数
}

export interface Voice {
  id: string;
  name: string; // 中文名（HUD / aria 播报）
}

export const SCALES: Scale[] = [
  { id: "penta", name: "五声", semitones: [0, 2, 4, 7, 9] }, // 宫商角徵羽
  { id: "major", name: "大调", semitones: [0, 2, 4, 5, 7, 9, 11] },
  { id: "minor", name: "小调", semitones: [0, 2, 3, 5, 7, 8, 10] },
  { id: "blues", name: "布鲁斯", semitones: [0, 3, 5, 6, 7, 10] },
  { id: "in", name: "都节", semitones: [0, 1, 5, 7, 8] }, // 日本阴阶（都节调式）
  { id: "whole", name: "全音", semitones: [0, 2, 4, 6, 8, 10] },
];

// 音色只作用旋律声部（鼓/颗粒/垫音不受影响）
export const VOICES: Voice[] = [
  { id: "glass", name: "玻璃" }, // 正弦+三次泛音，清亮通透（默认）
  { id: "chip", name: "芯片" }, // 方波，复古游戏感
  { id: "lead", name: "锯齿Lead" }, // 锯齿+低通跟力度，明亮
  { id: "pluck", name: "拨弦" }, // 短衰减+高八度泛音，弹跳
  { id: "bell", name: "钟" }, // FM 两载波，金属长尾
  { id: "bass", name: "贝斯" }, // 低八度 正弦+锯齿 短肥包络
  { id: "guitar", name: "吉他" }, // 双锯齿 快起音 拨弦扫味
  { id: "strings", name: "弦乐" }, // 三角慢起音+揉音 长弓
  // 自造 = 音色编辑器（简化合成器）：参数见 synthPatch.ts。
  // T 循环只在上面预设里转，自造只能从 HUD 音色菜单显式进入（防误切）
  { id: "custom", name: "自造" },
];

// 鼓组风格包只作用打字鼓组与循环回放里的鼓事件（旋律/颗粒/垫音不受影响）
export interface DrumKit {
  id: string;
  name: string; // 中文名（HUD / aria 播报）
  desc: string; // 一句话质感描述
}

export const DRUM_KITS: DrumKit[] = [
  { id: "acoustic", name: "原声", desc: "标准 kick/snare/hat/click" }, // 默认，向后兼容旧链接
  { id: "elec808", name: "电子808", desc: "深低频长尾 kick · 清脆 hat · 电子舞曲感" },
  { id: "lofi", name: "Lo-fi", desc: "低通压暗 · 短闷 kick · 旧磁带沙沙尾" },
  { id: "metal", name: "金属", desc: "非谐波金属敲击 · 低频短顿 · 工业打击乐感" },
];

export const DEFAULT_SCALE_ID = "penta";
export const DEFAULT_VOICE_ID = "glass";
export const DEFAULT_DRUMKIT_ID = "acoustic";

const BASE_FREQ = 130.81; // C3 主音参考

export function scaleById(id: string): Scale {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

export function voiceById(id: string): Voice {
  return VOICES.find((v) => v.id === id) ?? VOICES[0];
}

export function scaleIndexOf(id: string): number {
  const i = SCALES.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

export function voiceIndexOf(id: string): number {
  const i = VOICES.findIndex((v) => v.id === id);
  return i < 0 ? 0 : i;
}

export function drumKitById(id: string): DrumKit {
  return DRUM_KITS.find((k) => k.id === id) ?? DRUM_KITS[0];
}

export function drumKitIndexOf(id: string): number {
  const i = DRUM_KITS.findIndex((k) => k.id === id);
  return i < 0 ? 0 : i;
}

/** 绝对音级索引（mod 级数 = 音级，商 = 八度带）→ 频率 */
export function scaleFreq(scale: Scale, idx: number): number {
  const n = scale.semitones.length;
  const deg = ((idx % n) + n) % n;
  const band = Math.floor(idx / n);
  return BASE_FREQ * Math.pow(2, (scale.semitones[deg] + band * 12) / 12);
}

/** 音阶级索引 → MIDI 音号（BASE_FREQ=C3=48，与 scaleFreq 同一映射的离散版；MIDI 导出/画布变谱面共用） */
export function scaleMidi(scale: Scale, idx: number): number {
  const n = scale.semitones.length;
  const deg = ((idx % n) + n) % n;
  const band = Math.floor(idx / n);
  return 48 + band * 12 + scale.semitones[deg];
}

// ---- 画布音区（拓宽版唯一真源）：E2–C6 固定大区，不再是「一屏一八度 + 八度切换」 ----
// 纵向画布/参考线/卷帘/编译/哼唱映射全部按这里的区间量化；音区内第一格 = 不低于 E2 的合法级。
export const BAND_LO_MIDI = 40; // E2
export const BAND_HI_MIDI = 84; // C6

/**
 * 画布音区在当前音阶下的合法音级区间：lo = 绝对音级索引（deg=0 对应它，可低于 C3 为负），
 * degs = 音区内合法级数（五声 19、七声 26/27）。
 */
export function bandRange(scale: Scale): { lo: number; hi: number; degs: number } {
  let lo = 0;
  while (scaleMidi(scale, lo) > BAND_LO_MIDI) lo -= 1;
  while (scaleMidi(scale, lo) < BAND_LO_MIDI) lo += 1;
  let hi = lo;
  while (scaleMidi(scale, hi + 1) <= BAND_HI_MIDI) hi += 1;
  return { lo, hi, degs: hi - lo + 1 };
}

/** 音区级数简写（degFromY/compileStroke 等量化参数） */
export function bandDegs(scale: Scale): number {
  return bandRange(scale).degs;
}

const SEMI_SOLFA = ["Do", "Di", "Re", "Ri", "Mi", "Fa", "Fi", "Sol", "Si", "La", "Li", "Ti"];

/** 首调唱名（半音→唱名映射，对任意音阶都成立） */
export function solfaFor(scale: Scale, deg: number): string {
  const n = scale.semitones.length;
  const d = ((deg % n) + n) % n;
  return SEMI_SOLFA[scale.semitones[d] % 12];
}

const PENTA_NAMES = ["宫", "商", "角", "徵", "羽"];
const PENTA_SOLFA = ["Do", "Re", "Mi", "Sol", "La"];

/** HUD / aria 音名：五声用中国音阶名，其余音阶用唱名 */
export function degLabel(scale: Scale, deg: number): string {
  if (scale.id === "penta") {
    const d = ((deg % 5) + 5) % 5;
    return `${PENTA_NAMES[d]}（${PENTA_SOLFA[d]}）`;
  }
  return solfaFor(scale, deg);
}
