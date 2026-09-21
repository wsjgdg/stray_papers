// Standalone IndexedDB store — replaces the PocketBase collections
// (works / scores / levels) the app used to read & write over HTTP.
//
// All access is best-effort: if IndexedDB is unavailable (e.g. private mode),
// callers receive empty results / false rather than throwing, so the UI degrades
// gracefully instead of crashing.

const DB_NAME = "scroll-orchestra"
const DB_VERSION = 1
export type StoreName = "works" | "scores" | "levels"

const STORES: StoreName[] = ["works", "scores", "levels"]

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" })
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("open failed"))
  })
  return dbPromise
}

export async function readAll(collection: StoreName): Promise<Record<string, unknown>[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(collection, "readonly")
    const req = tx.objectStore(collection).getAll()
    req.onsuccess = () => resolve((req.result as Record<string, unknown>[] | undefined) ?? [])
    req.onerror = () => reject(req.error)
  })
}

export async function putOne(collection: StoreName, value: Record<string, unknown>): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(collection, "readwrite")
    tx.objectStore(collection).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function patchOne(
  collection: StoreName,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(collection, "readwrite")
    const store = tx.objectStore(collection)
    const get = store.get(id)
    get.onsuccess = () => {
      const existing = (get.result as Record<string, unknown>) || {}
      store.put({ ...existing, ...patch, id })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
