/**
 * Browser-side session persistence (IndexedDB).
 *
 * The app is 100% client-side, so uploaded files normally vanish on reload.
 * To fix "上次上传的文件就没有了", we persist the *original uploaded File
 * blobs* to IndexedDB. On next launch we can re-parse them and restore the
 * previous session — no server, no upload, files never leave the browser.
 *
 * We store the raw Files (not the parsed rows) because that keeps the payload
 * equal to the original file size and lets the normal parser re-hydrate.
 */

const DB_NAME = "dib-session";
const STORE = "files";
const META_KEY = "session-meta";

export interface SessionMeta {
  savedAt: string;
  files: { name: string; size: number; type: string }[];
  totalBytes: number;
  // name used for the dataset (first file name / generated)
  datasetName: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

/**
 * Persist the uploaded File list + dataset name as the restore-able session.
 */
export async function saveSession(files: File[], datasetName: string): Promise<void> {
  if (typeof indexedDB === "undefined" || files.length === 0) return;
  const db = await openDb();
  try {
    const meta: SessionMeta = {
      savedAt: new Date().toISOString(),
      files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      totalBytes: files.reduce((a, f) => a + f.size, 0),
      datasetName,
    };
    await tx(db, "readwrite", (store) => {
      store.put(meta, META_KEY);
      // overwrite file entries by index
      store.put(files, "files");
    });
  } finally {
    db.close();
  }
}

export async function loadSessionMeta(): Promise<SessionMeta | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    return await req<SessionMeta | null>(db, "readonly", (store) => store.get(META_KEY));
  } finally {
    db.close();
  }
}

/**
 * Restore the saved File list. Returns null if no session.
 */
export async function loadSessionFiles(): Promise<File[] | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    const files = await req<File[] | null>(db, "readonly", (store) => store.get("files"));
    return files && files.length > 0 ? files : null;
  } finally {
    db.close();
  }
}

export async function clearSession(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  try {
    await tx(db, "readwrite", (store) => {
      store.delete(META_KEY);
      store.delete("files");
    });
  } finally {
    db.close();
  }
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    fn(t.objectStore(STORE));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error || new Error("tx failed"));
    t.onabort = () => reject(t.error || new Error("tx aborted"));
  });
}

function req<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error || new Error("request failed"));
  });
}
