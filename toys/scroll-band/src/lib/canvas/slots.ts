// 滚动乐团 · 作曲多存档位（localStorage 命名快照）
//   与 IndexedDB 的「当前画布」自动持久相互独立：这里存的是可反复载入的命名版本。
//   数据量小（≤24 对象 × 几十字节/点），JSON 直存；读写失败静默降级为不持久。

import type { CanvasObject } from "@/lib/canvas/scoreCanvas";

const KEY = "so-slots-v1";
export const MAX_SLOTS = 12;

interface SlotEntry {
  savedAt: number;
  objs: CanvasObject[];
}

type SlotMap = Record<string, SlotEntry>;

function readMap(): SlotMap {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const val = JSON.parse(raw) as SlotMap;
    return val && typeof val === "object" ? val : {};
  } catch {
    return {};
  }
}

function writeMap(map: SlotMap): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export interface SlotMeta {
  name: string;
  savedAt: number;
  count: number;
}

export function listSlots(): SlotMeta[] {
  return Object.entries(readMap())
    .map(([name, e]) => ({ name, savedAt: e.savedAt, count: e.objs.length }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function readSlot(name: string): CanvasObject[] | null {
  const e = readMap()[name];
  if (!e) return null;
  try {
    return JSON.parse(JSON.stringify(e.objs)) as CanvasObject[];
  } catch {
    return null;
  }
}

/** 新增或覆写一个存档位；超过上限且是新名时拒绝，返回 false 由上层播报 */
export function writeSlot(name: string, objs: CanvasObject[]): boolean {
  const map = readMap();
  if (!(name in map) && Object.keys(map).length >= MAX_SLOTS) return false;
  map[name] = { savedAt: Date.now(), objs: JSON.parse(JSON.stringify(objs)) };
  return writeMap(map);
}

export function deleteSlot(name: string): void {
  const map = readMap();
  delete map[name];
  writeMap(map);
}
