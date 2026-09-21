// 滚动乐团 · 作曲画布 IndexedDB 本地持久化（刷新不丢，失败静默降级为不持久）

import type { CanvasObject } from "@/lib/canvas/scoreCanvas";

const DB_NAME = "scroll-orchestra";
const STORE = "canvas";
const KEY = "objs";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadCanvasObjects(): Promise<CanvasObject[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const val = req.result as CanvasObject[] | undefined;
        resolve(Array.isArray(val) ? val : []);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export function saveCanvasObjects(objs: CanvasObject[]): void {
  void (async () => {
    const db = await openDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(objs.map((o) => ({ ...o })), KEY);
    } catch {
      // 持久化失败不影响演奏
    }
  })();
}
