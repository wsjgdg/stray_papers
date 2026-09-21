// 滚动乐团 · 自定义谱面文本解析（纯函数，无 React）
// 文本格式（简单打歌谱）：
//   曲名: 我的练习曲        ← 可选头行（也认 name/title）
//   BPM: 100                ← 可选头行（也认「速度」，40~240 钳制）
//   正文每拍一个音名 token：C4 D4 E4 G4——空格/换行 = 前进一拍，` . `（或 - _）= 休止一拍，
//   `+E5` = 与前一个 token 同拍的双音（写在前音后面）。音名 = 字母 A-G + 可选 #/b + 八度数字；
//   省略八度沿用上一个音的八度（初始 C4 起）。超出 26 键可弹范围的音自动跳过（计入 skipped）。
import { pianoPosOfMidi } from "@/lib/audio/pianoMap";

export interface ParsedChart {
  name: string;
  bpm: number;
  seq: [number, number][]; // [拍位, MIDI]，供 chartByBeats 编译
  skipped: number; // 越界被跳过的音符数
  error: string | null; // 非空 = 解析失败原因（seq 不可用）
}

// 内置模板：导入面板一键填入（音名全部在 C3–D6 可弹范围内）
export const CHART_PRESETS: { label: string; text: string }[] = [
  {
    label: "欢乐练习曲",
    text: `曲名: 欢乐练习曲
BPM: 100
C4 D4 E4 G4 . E4 D4 C4
G4 A4 G4 E4 D4 . C4 .
C5 B4 A4 G4 A4 B4 +D5 C5
E5 D5 C4 . C4 D4 E4 G4`,
  },
  {
    label: "小星星",
    text: `曲名: 小星星
BPM: 90
C4 C4 G4 G4 A4 A4 G4 .
F4 F4 E4 E4 D4 D4 C4 .
G4 G4 F4 F4 E4 E4 D4 .
G4 G4 F4 F4 E4 E4 D4 .
C4 C4 G4 G4 A4 A4 G4 .
F4 F4 E4 E4 D4 D4 C4 .`,
  },
  {
    label: "C大调音阶",
    text: `曲名: C大调音阶往返
BPM: 80
C4 D4 E4 F4 G4 A4 B4 C5
D5 E5 F5 G5 . . . .
G5 F5 E5 D5 C5 B4 A4 G4
F4 E4 D4 C4 . . . .`,
  },
  {
    label: "三和弦连击",
    text: `曲名: 三和弦分解练习
BPM: 72
C4 +E4 +G4 . E4 +G4 +C5 .
G3 +B3 +D4 . F3 +A3 +C4 .
A3 +C4 +E4 . D4 +F4 +A4 .
G3 +B3 +D4 . G4 +B4 +D5 .`,
  },
  {
    label: "黑键练习",
    text: `曲名: 半音上下行（Shift 黑键）
BPM: 66
C4 C#4 D4 D#4 E4 F4 F#4 G4
G#4 A4 A#4 B4 C5 C#5 D5 D#5
D5 D#5 C5 C#5 B4 A#4 A4 G#4
G4 F#4 F4 E4 D#4 D4 C#4 C4 .`,
  },
];

// ---- 本地谱架（localStorage：收藏的自定义谱，≤8 份，同名覆写；读写失败静默降级）----

export interface StoredChart {
  name: string;
  bpm: number;
  text: string;
  /** MIDI 导入的谱会带精确拍轴（半拍精度）；点谱架 chip 直接按它开玩，text 只是可编辑草稿 */
  seq?: [number, number][];
  savedAt: number;
}

const CHARTS_KEY = "so-charts-v1";
const CHART_LEGACY_KEY = "so-chart-v1"; // 旧版单份草稿键，首次读取时迁移进谱架

/** 每类（♪ MIDI 谱 / 文本谱）各自的谱架上限——两个标签页独立计数、互不挤占 */
export const CHART_SHELF_MAX = 8;

/** 谱架条目分类：带精确拍轴 = MIDI 谱，否则 = 文本谱 */
export function isMidiChart(c: StoredChart): boolean {
  return Array.isArray(c.seq) && c.seq.length > 0;
}

export function listCharts(): StoredChart[] {
  try {
    const raw = window.localStorage.getItem(CHARTS_KEY);
    if (!raw) {
      // 迁移：旧版 so-chart-v1 单份草稿 → 谱架一条
      const legacy = window.localStorage.getItem(CHART_LEGACY_KEY);
      if (legacy) {
        const d = JSON.parse(legacy) as { text?: string; name?: string; bpm?: string };
        if (d.text) {
          const migrated: StoredChart = {
            name: d.name || "上次导入",
            bpm: Math.round(Number(d.bpm) || 100),
            text: d.text,
            savedAt: 1,
          };
          window.localStorage.setItem(CHARTS_KEY, JSON.stringify([migrated]));
          window.localStorage.removeItem(CHART_LEGACY_KEY);
          return [migrated];
        }
        window.localStorage.removeItem(CHART_LEGACY_KEY);
      }
      return [];
    }
    const arr = JSON.parse(raw) as StoredChart[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (c) =>
          c &&
          typeof c.name === "string" &&
          (typeof c.text === "string" || Array.isArray(c.seq)),
      )
      .sort((a, z) => z.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

// 存进谱架：同名覆写并置顶；全新谱且**同类型**（MIDI / 文本）已满 CHART_SHELF_MAX 份则拒绝（false）
// seq 可选：MIDI 导入带上精确拍轴，chip 点它直接开玩（半拍细节不丢）
export function saveChart(name: string, bpm: number, text: string, seq?: [number, number][]): boolean {
  const charts = listCharts();
  const wantMidi = isMidiChart({ name, bpm, text, seq, savedAt: 0 });
  const sameType = (c: StoredChart) => isMidiChart(c) === wantMidi;
  const idx = charts.findIndex((c) => c.name === name && sameType(c));
  if (idx < 0 && charts.filter(sameType).length >= CHART_SHELF_MAX) return false;
  const next = charts.filter((_, i) => i !== idx);
  next.unshift({ name, bpm, text, seq, savedAt: Date.now() });
  try {
    window.localStorage.setItem(CHARTS_KEY, JSON.stringify(next));
  } catch {
    /* 写失败 = 本会话内不持久 */
  }
  return true;
}

// 按曲名 + 类别精确删一条（分标签页后同名允许 MIDI 谱 / 文本谱各存一份，不能连坐）；
// 不传 kind = 删所有同名（兼容旧调用）
export function deleteChart(name: string, kind?: "midi" | "text"): void {
  try {
    const drop = (c: StoredChart) =>
      c.name === name && (kind === undefined || isMidiChart(c) === (kind === "midi"));
    window.localStorage.setItem(CHARTS_KEY, JSON.stringify(listCharts().filter((c) => !drop(c))));
  } catch {
    /* 忽略 */
  }
}

/** 清空谱架：不传 = 全清；传 "midi"/"text" = 只清该类标签页，另一类原样保留 */
export function clearCharts(kind?: "midi" | "text"): void {
  try {
    if (!kind) {
      window.localStorage.removeItem(CHARTS_KEY);
      return;
    }
    const keep = listCharts().filter((c) => (kind === "midi" ? !isMidiChart(c) : isMidiChart(c)));
    window.localStorage.setItem(CHARTS_KEY, JSON.stringify(keep));
  } catch {
    /* 忽略 */
  }
}
const SEMIS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

const MAX_NOTES = 400;

export function parseChartText(text: string): ParsedChart {
  // 全角符号归一（中文输入法常打全角冒号/竖线/加号/点）
  const norm = text
    .replace(/[：｜．＋＿]/g, (ch) => ({ "：": ":", "｜": " ", "．": ".", "＋": "+", "＿": "_" })[ch] ?? ch)
    .replace(/＃/g, "#");
  let name = "";
  let bpm = 0;
  const seq: [number, number][] = [];
  let skipped = 0;
  let beat = 0;
  let lastOct = 4;
  for (const rawLine of norm.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const nameM = line.match(/^(?:曲名|曲|name|title)\s*:\s*(.+)$/i);
    if (nameM && !name) {
      name = nameM[1].trim().slice(0, 20);
      continue;
    }
    const bpmM = line.match(/^(?:bpm|速度)\s*:\s*(\d{1,3})$/i);
    if (bpmM && !bpm) {
      bpm = Math.min(240, Math.max(40, Number(bpmM[1])));
      continue;
    }
    for (const tokenRaw of line.split(/\s+/)) {
      if (!tokenRaw) continue;
      const paired = tokenRaw.startsWith("+");
      const token = paired ? tokenRaw.slice(1) : tokenRaw;
      if (token === "." || token === "-" || token === "_") {
        if (!paired) beat += 1; // 休止：+ 号挂休止后无意义，不吞拍
        continue;
      }
      const nm = token.match(/^([a-gA-G])([#bB]?)(-?\d{1,2})?$/);
      if (!nm) continue; // 无法识别的 token（注释性文字等）直接忽略
      const oct = nm[3] !== undefined ? Number(nm[3]) : lastOct;
      if (nm[3] !== undefined) lastOct = oct;
      const semi = SEMIS[nm[1].toLowerCase()] + (nm[2].toLowerCase() === "b" ? -1 : nm[2] ? 1 : 0);
      const midi = (oct + 1) * 12 + semi;
      if (!pianoPosOfMidi(midi)) {
        skipped += 1;
        if (!paired) beat += 1;
        continue;
      }
      const at = paired ? (seq.length > 0 ? seq[seq.length - 1][0] : beat) : beat;
      seq.push([at, midi]);
      if (!paired) beat += 1;
      if (seq.length >= MAX_NOTES) break;
    }
    if (seq.length >= MAX_NOTES) break;
  }
  if (seq.length === 0) {
    return {
      name,
      bpm: bpm || 100,
      seq: [],
      skipped,
      error: "没有解析到有效音符——正文请按「C4 D4 E4」写法排音（音名 = 字母 + #/b + 八度数字）",
    };
  }
  return { name, bpm: bpm || 100, seq, skipped, error: null };
}
