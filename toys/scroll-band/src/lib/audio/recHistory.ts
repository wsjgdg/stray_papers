import type { ScoreEvent } from "./score";

// 演奏历史：每次停止录音自动存一份本地快照（≤6 条，新在前），可重放/删除。
// events 是纯 JSON 数据（与 ?score= 编码同源结构），直存 localStorage，读写失败静默降级。
const KEY = "so-rechistory-v1";
const CAP = 6;
// 单条体积护栏：过长的录音（约 >400KB JSON）不入历史，防撑爆 localStorage 配额
const MAX_ENTRY_BYTES = 400_000;

export interface RecHistoryEntry {
  savedAt: number;
  bpm: number;
  events: ScoreEvent[];
  /** 星标收藏：不会被新录音顶掉，恒排在列表最前 */
  starred?: boolean;
}

// 星标优先、其余保持新在前（sort 稳定）
function order(arr: RecHistoryEntry[]): RecHistoryEntry[] {
  return [...arr].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0));
}

export function listRecHistory(): RecHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RecHistoryEntry[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e && Array.isArray(e.events) && e.events.length > 0).slice(0, CAP);
  } catch {
    return [];
  }
}

/** 存一条演奏快照，返回 savedAt；空录音/超体积/存不下返回 null */
export function appendRecHistory(events: ScoreEvent[], bpm: number): number | null {
  if (events.length === 0) return null;
  const entry: RecHistoryEntry = { savedAt: Date.now(), bpm, events };
  try {
    const json = JSON.stringify(entry);
    if (json.length > MAX_ENTRY_BYTES) return null;
    const arr = listRecHistory();
    arr.unshift(entry);
    // 星标段落在淘汰时优先保全，满员时先挤掉最旧的非星标
    window.localStorage.setItem(KEY, JSON.stringify(order(arr).slice(0, CAP)));
    return entry.savedAt;
  } catch {
    return null;
  }
}

/** 切星标；返回切换后的状态，存不下返回 null */
export function toggleRecHistoryStar(savedAt: number): boolean | null {
  try {
    const arr = listRecHistory();
    const e = arr.find((x) => x.savedAt === savedAt);
    if (!e) return null;
    e.starred = !e.starred;
    window.localStorage.setItem(KEY, JSON.stringify(order(arr)));
    return e.starred;
  } catch {
    return null;
  }
}

export function removeRecHistory(savedAt: number): void {
  try {
    const arr = listRecHistory().filter((e) => e.savedAt !== savedAt);
    window.localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* 删不掉就本次会话内忽略 */
  }
}
