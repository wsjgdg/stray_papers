// 实时转写「保底录音」持久化层（独立 IndexedDB，区别于主会议库）。
// 把整场原始音频分段时间写入，停止时标记 finalized：既避免数小时录音全驻内存，
// 也防止刷新 / 崩溃 / 切走前未停止导致整场丢失。
// 记录分 temp（转录完或 1 天后自动清除）与 permanent（长期保存）两种；临时记录到期由 pruneExpiredRecordings 清理。

const DB_NAME = "codify-recordings"
const DB_VERSION = 1
const META_STORE = "meta"
const SEG_STORE = "segments"

export type RecordingKind = "temp" | "permanent"

export interface RecordingSegmentMeta {
  seq: number
  size: number
}
export interface RecordingMeta {
  id: string
  meetingId: string
  kind: RecordingKind
  createdAt: number
  expiresAt: number | null
  mime: string
  segments: RecordingSegmentMeta[]
  finalized: boolean
  size: number
}

interface SegRecord {
  key: string
  recordingId: string
  seq: number
  blob: Blob
}

let dbPromise: Promise<IDBDatabase> | null = null
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB 不可用"))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains(SEG_STORE)) {
        const seg = db.createObjectStore(SEG_STORE, { keyPath: "key" })
        seg.createIndex("byRecording", "recordingId", { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** 写入一段录音分片（按 seq 顺序，停止时再拼回） */
export async function appendSegment(id: string, seq: number, blob: Blob): Promise<void> {
  const db = await openDB()
  const t = db.transaction(SEG_STORE, "readwrite")
  const rec: SegRecord = { key: `${id}#${seq}`, recordingId: id, seq, blob }
  t.objectStore(SEG_STORE).put(rec)
  await txDone(t)
}

/** 标记录音完成并写入元数据（含分片清单、temp / permanent、过期时间） */
export async function finalizeRecording(meta: RecordingMeta): Promise<void> {
  const db = await openDB()
  const t = db.transaction(META_STORE, "readwrite")
  t.objectStore(META_STORE).put(meta)
  await txDone(t)
}

/** 读取并拼接整段录音；不存在返回 null（load 失败也让上层优雅降级） */
export async function loadRecording(id: string): Promise<{ blob: Blob; meta: RecordingMeta } | null> {
  const db = await openDB()
  const meta = (await reqToPromise(
    db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(id),
  )) as RecordingMeta | undefined
  if (!meta) return null
  const blobs: Blob[] = []
  await new Promise<void>((resolve, reject) => {
    const idx = db.transaction(SEG_STORE, "readonly").objectStore(SEG_STORE).index("byRecording")
    const cursorReq = idx.openCursor(IDBKeyRange.only(id))
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (cursor) {
        blobs[(cursor.value as SegRecord).seq] = (cursor.value as SegRecord).blob
        cursor.continue()
      } else {
        resolve()
      }
    }
    cursorReq.onerror = () => reject(cursorReq.error)
  })
  const ordered = blobs.filter(Boolean)
  if (ordered.length === 0) return null
  return { blob: new Blob(ordered, { type: meta.mime || "audio/webm" }), meta }
}

/** 删除录音（元数据 + 全部分片） */
export async function deleteRecording(id: string): Promise<void> {
  const db = await openDB()
  const t = db.transaction([META_STORE, SEG_STORE], "readwrite")
  t.objectStore(META_STORE).delete(id)
  const idx = t.objectStore(SEG_STORE).index("byRecording")
  await new Promise<void>((resolve, reject) => {
    const cursorReq = idx.openCursor(IDBKeyRange.only(id))
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      } else {
        resolve()
      }
    }
    cursorReq.onerror = () => reject(cursorReq.error)
  })
  await txDone(t)
}

/** 列出录音（可选按会议过滤），按创建时间倒序 */
export async function listRecordings(meetingId?: string): Promise<RecordingMeta[]> {
  const db = await openDB()
  const all = (await reqToPromise(
    db.transaction(META_STORE, "readonly").objectStore(META_STORE).getAll(),
  )) as RecordingMeta[]
  const filtered = meetingId ? all.filter((m) => m.meetingId === meetingId) : all
  return filtered.sort((a, b) => b.createdAt - a.createdAt)
}

/** 某会议最近一段录音（重新打开会议 / 刷新后用于恢复 UI） */
export async function latestRecordingForMeeting(meetingId: string): Promise<RecordingMeta | null> {
  const list = await listRecordings(meetingId)
  return list[0] ?? null
}

/** 转长期保存：取消过期时间 */
export async function saveRecordingPermanent(id: string): Promise<void> {
  const db = await openDB()
  const t = db.transaction(META_STORE, "readwrite")
  const store = t.objectStore(META_STORE)
  const meta = (await reqToPromise(store.get(id))) as RecordingMeta | undefined
  if (!meta) return
  meta.kind = "permanent"
  meta.expiresAt = null
  store.put(meta)
  await txDone(t)
}

/** 开新会话前清掉同一会议的历史临时录音（长期保存的保留） */
export async function deleteTempForMeeting(meetingId: string): Promise<void> {
  const list = await listRecordings(meetingId)
  for (const m of list.filter((x) => x.kind === "temp")) {
    await deleteRecording(m.id)
  }
}

/** 清理过期临时录音（转录完 / 1 天后自动清除）；返回清除数量 */
export async function pruneExpiredRecordings(): Promise<number> {
  const list = await listRecordings()
  const now = Date.now()
  let removed = 0
  for (const m of list.filter((x) => x.expiresAt != null && x.expiresAt < now)) {
    await deleteRecording(m.id)
    removed += 1
  }
  return removed
}
