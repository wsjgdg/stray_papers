// IndexedDB 存储层：分片 + 压缩 + 增量写入 + 两阶段装载。
//
// 结构（两个 objectStore 分离元数据与数据块，另加 kv 与检索索引两个辅助 store）：
// - meta：会议元数据（剔除大文本后的全部字段），单条小、读写快；
// - chunks：大文本数据块，主键 [docId, index]，docId = `${meetingId}::${field}`；
//   转写稿 / 清洗稿 / 整理前快照按 UTF-8 字节边界分片（每片 ≤ 800KB），逐片独立压缩，
//   避免单条记录过大触发浏览器实现限制或内存压力；
// - kv：问答历史等小对象；
// - searchIndex：增量检索索引（searchIndex.ts 读写，见该文件）。
//
// 两阶段装载（分片恢复而非全量恢复）：loadStoreData 只读 meta + kv——列表与结构化
// 字段立即可交互；外置大文本先以空串占位并返回 pending 清单，由调用方经
// hydrateMeetingFields 逐会回填（通常当前选中会议优先）。回填完成前上层不得落盘，
// 否则占位空串会被当成「用户清空」误删库内分片（闸门在 useMeetingsStore）。
//
// 增量写入：每个分片带内容哈希、每份 meta 带序列化哈希，与上次落盘版本比对，
// 未变化的部分不重写——高频防抖保存的实际写入量只有本次真正改动的会议。
// 压缩/解压走文本 Worker（compressChunkTask，主线程只收发字节）；
// 归档状态切换（LZ4 ↔ Zstd 分层变化）会触发该会议大文本字段的整体重压。
//
// 降级链：IndexedDB 打不开（无痕模式等）→ 回退 localStorage 单键整存（旧版行为）；
// IndexedDB 写入抛错 → 兜底再试一次 localStorage，仍失败返回 false，上层挂横幅提醒备份。
// 例外：开启档案加密后降级链关闭（localStorage 兜底路径无法保证密文一致性），
// IndexedDB 不可用即按写入失败处理——加密档案依赖 IndexedDB，设置页如实说明。
//
// 静态加密（可选，lib/vault.ts）：vault 激活（已开启且已解锁）时，meta / chunks / kv /
// searchIndex 四类记录逐条自描述加密——密文记录带 enc 标记，与明文记录可共存，
// 开启 / 关闭加密中途被打断数据依然可读（rewriteVaultRecords 重跑即收敛）。
// chunks 是「先压缩后加密」（加密数据不可压，顺序不能反）。

import { type Codec, type Tier } from "@/lib/compression"
import { compressChunkTask, decompressChunkTask } from "@/lib/textWorkerClient"
import { loadStore, saveStore, type Meeting, type StoreData } from "@/lib/store"
import {
  aesDecryptBytes,
  aesDecryptText,
  aesEncryptBytes,
  aesEncryptText,
  isVaultEnabled,
  vaultActive,
} from "@/lib/vault"

const DB_NAME = "meeting-notes-db"
const DB_VERSION = 1
const META_STORE = "meta"
const CHUNK_STORE = "chunks"
const KV_STORE = "kv"
export const INDEX_STORE = "searchIndex"

// 单片上限 800KB（UTF-8 字节）：远低于各浏览器单条记录的实际上限，留出安全边际
const CHUNK_MAX_BYTES = 800 * 1024
// 超过该字节数的大文本才外置分片；小文本内联在 meta 里，减少记录数与事务开销
const EXTERNAL_MIN_BYTES = 48 * 1024

// 可外置的大文本字段（Meeting 上均为 string | undefined）
const TEXT_FIELDS = ["transcript", "cleaned", "prePolish"] as const
export type TextField = (typeof TEXT_FIELDS)[number]

interface FieldExt {
  chunks: number // 分片数
  bytes: number // 未压缩 UTF-8 字节数
  hashes: number[] // 每片 32-bit FNV-1a 哈希：增量写入的比对依据
  tier: Tier // 写入时的压缩分层；tier 变化即使内容没变也要重压
}

// meta 记录 = Meeting 剔除已外置的大文本字段 + ext 描述
type MetaRecord = Omit<Meeting, TextField> & {
  ext: Partial<Record<TextField, FieldExt>>
} & Partial<Record<TextField, string>> // 未达外置阈值的小文本仍内联

interface ChunkRecord {
  docId: string
  index: number
  codec: Codec
  data: Uint8Array
  enc?: 1 // 带此标记 = data 是 AES-GCM 密文（iv||ct），解压前先解密
}

// 加密态的 meta / kv 记录：主键字段保持明文（keyPath 要求），载荷整体密文。
// 记录级自描述——enc 字段存在即密文，明文密文可共存（开启/关闭中途被打断仍可读）
interface EncMetaRecord {
  id: string
  enc: Uint8Array
}

interface KvRecord {
  key: string
  value?: unknown
  enc?: Uint8Array
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ── 记录级加解密（vault 未激活时全部直通，行为与旧版一致）──

async function sealMetaRecord(rec: MetaRecord): Promise<MetaRecord | EncMetaRecord> {
  if (!vaultActive()) return rec
  return { id: rec.id, enc: await aesEncryptText(JSON.stringify(rec)) }
}

async function openMetaRecord(stored: MetaRecord | EncMetaRecord): Promise<MetaRecord | null> {
  const enc = (stored as EncMetaRecord).enc
  if (enc instanceof Uint8Array) {
    try {
      return JSON.parse(await aesDecryptText(enc)) as MetaRecord
    } catch (err) {
      // 解密失败（记录损坏）：跳过该条不阻塞其余数据，与「分片缺失回填空串」同一容错口径
      console.error("[idbStore] meta 解密失败，跳过", (stored as EncMetaRecord).id, err)
      return null
    }
  }
  return stored as MetaRecord
}

async function sealKvValue(value: unknown): Promise<{ value?: unknown; enc?: Uint8Array }> {
  if (!vaultActive()) return { value }
  return { enc: await aesEncryptText(JSON.stringify(value)) }
}

async function openKvValue<T>(rec: KvRecord): Promise<T | undefined> {
  if (rec.enc instanceof Uint8Array) {
    try {
      return JSON.parse(await aesDecryptText(rec.enc)) as T
    } catch (err) {
      console.error("[idbStore] kv 解密失败", rec.key, err)
      return undefined
    }
  }
  return rec.value as T | undefined
}

async function sealBytes(data: Uint8Array): Promise<Uint8Array> {
  return vaultActive() ? aesEncryptBytes(data) : data
}

async function openBytes(rec: { data: Uint8Array; enc?: unknown }): Promise<Uint8Array> {
  return rec.enc ? aesDecryptBytes(rec.data) : rec.data
}

// ── 上次落盘快照（内存缓存）：增量写入的比对基线，loadStoreData 时用库内数据回填 ──
const lastMetaStr = new Map<string, string>() // meetingId → meta（不含 ext）序列化
const lastExt = new Map<string, Partial<Record<TextField, FieldExt>>>() // meetingId → 各大文本字段描述

function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// 按 UTF-8 字节边界分片：切点若落在多字节字符中间（后续字节形如 10xxxxxx），向前回退到字符边界，
// 保证每片都是合法 UTF-8 序列，可独立解码 / 独立压缩。
export function splitUtf8Chunks(bytes: Uint8Array, maxBytes: number = CHUNK_MAX_BYTES): Uint8Array[] {
  const out: Uint8Array[] = []
  let start = 0
  while (start < bytes.length) {
    let end = Math.min(start + maxBytes, bytes.length)
    if (end < bytes.length) {
      while (end > start && (bytes[end] & 0xc0) === 0x80) end--
    }
    out.push(bytes.subarray(start, end))
    start = end
  }
  return out.length > 0 ? out : [bytes.subarray(0, 0)]
}

// ── IndexedDB 打开与事务封装 ──

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") {
          resolve(null)
          return
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains(META_STORE)) {
            db.createObjectStore(META_STORE, { keyPath: "id" })
          }
          if (!db.objectStoreNames.contains(CHUNK_STORE)) {
            db.createObjectStore(CHUNK_STORE, { keyPath: ["docId", "index"] })
          }
          if (!db.objectStoreNames.contains(KV_STORE)) {
            db.createObjectStore(KV_STORE, { keyPath: "key" })
          }
          if (!db.objectStoreNames.contains(INDEX_STORE)) {
            db.createObjectStore(INDEX_STORE, { keyPath: "meetingId" })
          }
        }
        req.onsuccess = () => {
          const db = req.result
          // 其他标签页升级版本时让出连接，避免 blocked
          db.onversionchange = () => db.close()
          resolve(db)
        }
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return dbPromise
}

export type StorageBackend = "indexeddb" | "localStorage"

export async function getStorageBackend(): Promise<StorageBackend> {
  return (await openDb()) ? "indexeddb" : "localStorage"
}

function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 请求失败"))
  })
}

function txPromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 事务失败"))
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB 事务被中止"))
  })
}

// 某会议某字段的全部分片主键范围（[docId, 0] … [docId, +∞)）
function chunkRange(docId: string): IDBKeyRange {
  return IDBKeyRange.bound([docId, 0], [docId, Number.MAX_SAFE_INTEGER])
}

// ── kv 读写（问答历史 / 迁移标记）──

export async function setKv(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  if (!db) return
  const sealed = await sealKvValue(value)
  const tx = db.transaction(KV_STORE, "readwrite")
  tx.objectStore(KV_STORE).put({ key, ...sealed })
  await txPromise(tx)
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  if (!db) return undefined
  const tx = db.transaction(KV_STORE, "readonly")
  const rec = (await reqPromise(tx.objectStore(KV_STORE).get(key))) as KvRecord | undefined
  return rec ? openKvValue<T>(rec) : undefined
}

// ── 检索索引记录的存取（供 searchIndex.ts 使用，同一 DB 避免多库连接）──

export interface IndexRecord {
  meetingId: string
  stamp: number
  codec: Codec
  data: Uint8Array // 压缩后的检索文本
  enc?: 1 // data 是密文（检索文本派生自会议内容，vault 激活时同样加密）
}

export async function readIndexRecords(): Promise<IndexRecord[]> {
  const db = await openDb()
  if (!db) return []
  try {
    const tx = db.transaction(INDEX_STORE, "readonly")
    const all = await reqPromise(tx.objectStore(INDEX_STORE).getAll() as IDBRequest<IndexRecord[]>)
    await txPromise(tx)
    return await Promise.all(
      all.map(async (r) => (r.enc ? { ...r, data: await aesDecryptBytes(r.data), enc: undefined } : r)),
    )
  } catch {
    return []
  }
}

export async function writeIndexRecords(upserts: IndexRecord[], deleteIds: string[]): Promise<void> {
  const db = await openDb()
  if (!db || (upserts.length === 0 && deleteIds.length === 0)) return
  const sealed = await Promise.all(
    upserts.map(async (r) =>
      vaultActive() ? { ...r, data: await aesEncryptBytes(r.data), enc: 1 as const } : r,
    ),
  )
  const tx = db.transaction(INDEX_STORE, "readwrite")
  const store = tx.objectStore(INDEX_STORE)
  for (const rec of sealed) store.put(rec)
  for (const id of deleteIds) store.delete(id)
  await txPromise(tx)
}

// ── 分片解码：密文分片先解密 → 逐片并行解压（大分片走 Worker）→ 字节拼接后整体解码 ──
//（分片切在 UTF-8 字符边界上，拼接后 decode 与逐片 decode 结果一致，整体解码更省）

async function decodeChunkList(list: ChunkRecord[]): Promise<string> {
  if (list.length === 0) return ""
  list.sort((a, b) => a.index - b.index)
  const parts = await Promise.all(
    list.map(async (c) => decompressChunkTask({ codec: c.codec, data: await openBytes(c) })),
  )
  const total = parts.reduce((n, p) => n + p.byteLength, 0)
  const all = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    all.set(p, off)
    off += p.byteLength
  }
  return decoder.decode(all)
}

// ── 装载阶段 A：只读 meta + kv（列表立即可交互）；空库时自动从 localStorage 迁移 ──

// 待背景回填的外置大文本（data.meetings 里对应字段暂为空串占位）
export interface PendingText {
  meetingId: string
  field: TextField
}

export interface LoadResult {
  data: StoreData
  pending: PendingText[]
  migrated: boolean // 本次是否执行了 localStorage → IndexedDB 迁移
  backend: StorageBackend
}

export async function loadStoreData(): Promise<LoadResult> {
  const db = await openDb()
  if (!db) {
    // 无痕模式 / IndexedDB 被禁：退回 localStorage 单键整存。
    // 例外：加密档案强依赖 IndexedDB——兜底路径的密文持久化是异步队列，
    // 无法维持「写入失败绝不静默」的强一致口径，此时如实返回空数据 + 让写入失败挂横幅
    if (isVaultEnabled()) {
      console.error("[idbStore] 已开启档案加密但 IndexedDB 不可用，拒绝 localStorage 降级")
      return {
        data: { meetings: [], qaHistory: [] },
        pending: [],
        migrated: false,
        backend: "localStorage",
      }
    }
    return { data: loadStore(), pending: [], migrated: false, backend: "localStorage" }
  }
  try {
    // 同一事务内全部请求先发后等（IndexedDB 并行执行，消除逐条 await 的往返瀑布）；
    // 不触碰 chunks 大文本库——阶段 B 按会回填
    const tx = db.transaction([META_STORE, KV_STORE], "readonly")
    const metaReq = tx.objectStore(META_STORE).getAll() as IDBRequest<
      (MetaRecord | EncMetaRecord)[]
    >
    const qaReq = tx.objectStore(KV_STORE).get("qa") as IDBRequest<KvRecord | undefined>
    const migratedReq = tx.objectStore(KV_STORE).get("migratedFromLocalStorageAt") as IDBRequest<
      KvRecord | undefined
    >
    const [metaStored, qaRec, migratedRec] = await Promise.all([
      reqPromise(metaReq),
      reqPromise(qaReq),
      reqPromise(migratedReq),
    ])
    await txPromise(tx)

    // 开启档案加密时逐条解密（vault 未激活则原样直通）；解密失败的记录跳过不阻塞其余数据
    const metaRecs: MetaRecord[] = []
    for (const stored of metaStored) {
      const rec = await openMetaRecord(stored)
      if (rec) metaRecs.push(rec)
    }
    const qaHistory = qaRec ? ((await openKvValue<StoreData["qaHistory"]>(qaRec)) ?? []) : []
    const migratedBefore = migratedRec ? await openKvValue<number>(migratedRec) : undefined

    if (metaRecs.length === 0) {
      // 首次运行：localStorage 里有旧数据就整体迁移进来；迁移成功后旧键原样保留作应急快照。
      // 已经迁移过（migratedBefore）则绝不再迁——否则用户删光全部会议后，
      // 旧快照里的数据会被当成「首次运行的遗产」复活。
      const legacy = migratedBefore ? null : loadStore()
      if (legacy && (legacy.meetings.length > 0 || legacy.qaHistory.length > 0)) {
        const ok = await saveStoreData(legacy)
        if (ok) {
          await setKv("migratedFromLocalStorageAt", Date.now())
          return { data: legacy, pending: [], migrated: true, backend: "indexeddb" }
        }
      }
      if (!migratedBefore) {
        // 全新库也落标记：此后 IndexedDB 是唯一数据源，
        // 任何残留 / 兜底写入的 localStorage 数据都不会再被当作遗产复活
        await setKv("migratedFromLocalStorageAt", Date.now())
      }
      return {
        data: { meetings: [], qaHistory },
        pending: [],
        migrated: false,
        backend: "indexeddb",
      }
    }

    const pending: PendingText[] = []
    const meetings = metaRecs.map((rec) => {
      const { ext, ...rest } = rec
      const m = rest as Meeting
      for (const f of TEXT_FIELDS) {
        if (ext?.[f]) {
          // 外置字段：先占位空串，阶段 B 经 hydrateMeetingFields 回填；
          // 分片缺失（写入中断等）回填结果也是空串，不阻塞其余数据
          ;(m as unknown as Record<string, unknown>)[f] = ""
          pending.push({ meetingId: rec.id, field: f })
        } else {
          // 内联（或缺失）字段：强制收敛为字符串，避免下游读 transcript.trim() 时遇 undefined 崩溃
          const v = (m as unknown as Record<string, unknown>)[f]
          ;(m as unknown as Record<string, unknown>)[f] = typeof v === "string" ? v : ""
        }
      }
      // 回填增量写入的比对基线
      const snapshot: MetaRecord = { ...rec, ext: {} }
      lastMetaStr.set(rec.id, stableMetaString(snapshot))
      lastExt.set(rec.id, ext ?? {})
      return m
    })

    return {
      data: { meetings, qaHistory },
      pending,
      migrated: false,
      backend: "indexeddb",
    }
  } catch (err) {
    console.error("[idbStore] 读取失败，回退 localStorage", err)
    return { data: loadStore(), pending: [], migrated: false, backend: "localStorage" }
  }
}

// ── 装载阶段 B：按会回填外置大文本（调用方决定顺序，通常选中会议优先）──
// 返回该会议各字段的解码文本；读取失败返回空对象（字段维持占位，不抛出）

export async function hydrateMeetingFields(
  meetingId: string,
  fields: readonly TextField[],
): Promise<Partial<Record<TextField, string>>> {
  const db = await openDb()
  if (!db || fields.length === 0) return {}
  try {
    const tx = db.transaction(CHUNK_STORE, "readonly")
    // 各字段的分片范围查询在同一事务内先发后等，并行读取
    const reqs = fields.map(
      (f) =>
        reqPromise(
          tx.objectStore(CHUNK_STORE).getAll(chunkRange(`${meetingId}::${f}`)) as IDBRequest<
            ChunkRecord[]
          >,
        ),
    )
    const lists = await Promise.all(reqs)
    await txPromise(tx)
    const decoded = await Promise.all(lists.map((list) => decodeChunkList(list)))
    const out: Partial<Record<TextField, string>> = {}
    fields.forEach((f, i) => {
      out[f] = decoded[i]
    })
    return out
  } catch (err) {
    console.error("[idbStore] 大文本回填失败", err)
    return {}
  }
}

// meta 比对用的序列化：剔除 ext（ext 单独比对），键序稳定
function stableMetaString(rec: MetaRecord): string {
  const rest: Partial<MetaRecord> = { ...rec }
  delete rest.ext
  return JSON.stringify(rest)
}

// ── 全库写：事务外完成分片/哈希/压缩，单事务落盘；只写真正变化的部分 ──

export async function saveStoreData(data: StoreData): Promise<boolean> {
  const db = await openDb()
  // 加密档案不走 localStorage 兜底（同 loadStoreData 的口径）：失败返回 false 挂横幅
  if (!db) return isVaultEnabled() ? false : saveStore(data) // localStorage 降级路径（同步）

  try {
    // 1) 事务外准备：分片、哈希比对、并行压缩（wasm/异步操作绝不能卡在事务里）
    const metaPuts: MetaRecord[] = []
    const chunkPuts: ChunkRecord[] = []
    const chunkClears: string[] = [] // 需要整段清掉旧分片的 docId（重写 / 收缩 / 删除）
    const metaDeletes: string[] = []
    const compressJobs: Promise<void>[] = [] // 全部待重压字段跨会议并行，压缩走 Worker

    const knownIds = new Set<string>()
    for (const m of data.meetings) {
      knownIds.add(m.id)
      const tier: Tier = m.archived ? "archive" : "active"
      const rec = { ...m } as unknown as Record<string, unknown>
      delete rec.transcript
      delete rec.cleaned
      delete rec.prePolish

      const ext: Partial<Record<TextField, FieldExt>> = {}
      for (const field of TEXT_FIELDS) {
        const text = (m[field] as string | undefined) ?? ""
        const prev = lastExt.get(m.id)?.[field]
        const docId = `${m.id}::${field}`
        if (!text) {
          // 字段被清空：若上一版是外置存储，清掉遗留分片
          if (prev) chunkClears.push(docId)
          continue
        }
        const bytes = encoder.encode(text)
        if (bytes.byteLength < EXTERNAL_MIN_BYTES) {
          // 缩回阈值以下 → 内联 meta；同样要清掉上一版的外置分片
          if (prev) chunkClears.push(docId)
          rec[field] = text // 小文本内联 meta
          continue
        }
        const parts = splitUtf8Chunks(bytes)
        const hashes = parts.map(fnv1a)
        const sameContent =
          !!prev &&
          prev.hashes.length === hashes.length &&
          prev.hashes.every((h, i) => h === hashes[i])
        const sameTier = prev?.tier === tier
        if (!sameContent || !sameTier) {
          // 内容或压缩分层变了 → 该字段整体重写：先清旧分片再写新分片
          chunkClears.push(docId)
          compressJobs.push(
            Promise.all(parts.map((p) => compressChunkTask(p, tier))).then(async (compressed) => {
              for (let i = 0; i < compressed.length; i++) {
                const c = compressed[i]
                // 压缩后再加密（加密数据不可压，顺序不能反）；vault 未激活时 sealBytes 直通
                chunkPuts.push({
                  docId,
                  index: i,
                  codec: c.codec,
                  data: await sealBytes(c.data),
                  ...(vaultActive() ? { enc: 1 as const } : {}),
                })
              }
            }),
          )
        }
        ext[field] = { chunks: parts.length, bytes: bytes.byteLength, hashes, tier }
      }

      const metaRec = { ...(rec as Omit<Meeting, TextField>), ext } as MetaRecord
      const metaStr = stableMetaString(metaRec)
      const extStr = JSON.stringify(ext)
      const prevExtStr = JSON.stringify(lastExt.get(m.id) ?? {})
      if (metaStr !== lastMetaStr.get(m.id) || extStr !== prevExtStr) {
        metaPuts.push(metaRec)
      }
      lastMetaStr.set(m.id, metaStr)
      lastExt.set(m.id, ext)
    }

    // 2) 已删除的会议：meta 与其全部分片一并清理
    for (const id of lastMetaStr.keys()) {
      if (!knownIds.has(id)) {
        metaDeletes.push(id)
        for (const f of TEXT_FIELDS) chunkClears.push(`${id}::${f}`)
      }
    }
    for (const id of metaDeletes) {
      lastMetaStr.delete(id)
      lastExt.delete(id)
    }

    // 全部压缩在事务外完成（跨会议、跨字段并行），事务内只做同步写盘
    await Promise.all(compressJobs)

    // meta / kv 记录在事务外加密（vault 未激活时直通）：事务内只做同步 put
    const sealedMeta = await Promise.all(metaPuts.map(sealMetaRecord))
    const sealedQa = await sealKvValue(data.qaHistory)

    if (
      metaPuts.length === 0 &&
      chunkPuts.length === 0 &&
      chunkClears.length === 0 &&
      metaDeletes.length === 0
    ) {
      // 数据没变：只更新 kv 里的问答历史（小记录，直接写）
      const txKv = db.transaction(KV_STORE, "readwrite")
      txKv.objectStore(KV_STORE).put({ key: "qa", ...sealedQa })
      await txPromise(txKv)
      return true
    }

    // 3) 单事务落盘全部变更
    const tx = db.transaction([META_STORE, CHUNK_STORE, KV_STORE], "readwrite")
    const metaStore = tx.objectStore(META_STORE)
    const chunkStore = tx.objectStore(CHUNK_STORE)
    for (const rec of sealedMeta) metaStore.put(rec)
    for (const id of metaDeletes) metaStore.delete(id)
    for (const docId of chunkClears) chunkStore.delete(chunkRange(docId))
    for (const c of chunkPuts) chunkStore.put(c)
    tx.objectStore(KV_STORE).put({ key: "qa", ...sealedQa })
    await txPromise(tx)

    // 4) 读回校验：事务 oncomplete 已是提交确认，但浏览器在存储压力下仍可能
    // 静默丢弃写入（配额驱逐等）——刚写的最后一条 meta 读不回来、或总条数对不上，
    // 一律按写入失败处理（上层挂横幅引导立即备份），绝不假装成功
    if (metaPuts.length > 0 || metaDeletes.length > 0) {
      const vTx = db.transaction(META_STORE, "readonly")
      const countReq = vTx.objectStore(META_STORE).count()
      const probeId = metaPuts.length > 0 ? metaPuts[metaPuts.length - 1].id : null
      const probeReq = probeId !== null ? vTx.objectStore(META_STORE).get(probeId) : null
      const [count, probe] = await Promise.all([
        reqPromise(countReq),
        probeReq ? reqPromise(probeReq) : Promise.resolve(null),
      ])
      await txPromise(vTx)
      if (count !== data.meetings.length || (probeId !== null && !probe)) {
        console.error("[idbStore] 读回校验失败：写入疑似被静默丢弃", {
          count,
          expected: data.meetings.length,
          probeId,
        })
        return false
      }
    }
    return true
  } catch (err) {
    console.error("[idbStore] 写入失败", err)
    // 兜底：降级往 localStorage 写一份（配额可能不够），仍失败由上层挂横幅；
    // 加密档案不走兜底（见文件头注释），直接按失败处理
    return isVaultEnabled() ? false : saveStore(data)
  }
}

// ── 分片范围读取：给「编辑器只拉可视区域分片」这类流式消费预留的 API ──
// 返回 [from, to] 闭区间内的分片解码文本；当前 UI 尚未接入，接入点见 idbStore 头注释。
export async function readFieldChunkRange(
  meetingId: string,
  field: TextField,
  from: number,
  to: number,
): Promise<string> {
  const db = await openDb()
  if (!db) return ""
  const docId = `${meetingId}::${field}`
  const tx = db.transaction(CHUNK_STORE, "readonly")
  const list = (await reqPromise(
    tx.objectStore(CHUNK_STORE).getAll(chunkRange(docId)) as IDBRequest<ChunkRecord[]>,
  )).filter((c) => c.index >= from && c.index <= to)
  await txPromise(tx)
  return decodeChunkList(list)
}

// ── 占用估算：优先浏览器 storage.estimate()（同时给出预估配额上限），
// 失败时按分片字节数求和（此时配额未知，quotaKb = 0）──

export interface StorageEstimate {
  usageKb: number
  quotaKb: number // 0 = 环境不提供配额信息
}

export async function estimateStorage(): Promise<StorageEstimate> {
  try {
    const nav = navigator as Navigator & {
      storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> }
    }
    const est = await nav.storage?.estimate?.()
    if (est && typeof est.usage === "number" && est.usage > 0) {
      return {
        usageKb: Math.round(est.usage / 1024),
        quotaKb:
          typeof est.quota === "number" && est.quota > 0 ? Math.round(est.quota / 1024) : 0,
      }
    }
  } catch {
    // 继续走分片求和
  }
  const db = await openDb()
  if (!db) return { usageKb: 0, quotaKb: 0 }
  try {
    // 兜底：把压缩分片读出来按实际字节求和（无 estimate API 的环境才走这里，低频可接受）；
    // 两个 store 的读取放同一事务先发后等
    const tx = db.transaction([CHUNK_STORE, META_STORE], "readonly")
    const chunkReq = tx.objectStore(CHUNK_STORE).getAll() as IDBRequest<ChunkRecord[]>
    const metaReq = tx.objectStore(META_STORE).getAll() as IDBRequest<unknown[]>
    const [all, metas] = await Promise.all([reqPromise(chunkReq), reqPromise(metaReq)])
    await txPromise(tx)
    const chunkBytes = all.reduce((n, c) => n + (c.data?.byteLength ?? 0), 0)
    const metaBytes = encoder.encode(JSON.stringify(metas)).byteLength
    return { usageKb: Math.round((chunkBytes + metaBytes) / 1024), quotaKb: 0 }
  } catch {
    return { usageKb: 0, quotaKb: 0 }
  }
}

// ── 全库重加密（开启 / 关闭档案加密 / 修改密码共用）──
// 显式传密钥而不依赖会话状态，支持「旧钥解 → 新钥加」的改密场景：
// fromKey=null 表示盘上记录当前是明文；toKey=null 表示目标态是明文。
// 记录自描述（enc 标记），中断后重跑安全——已是目标态的记录原地直通。
// chunks 按批处理（每批 8 条，单条 ≤800KB+加密开销），内存占用有界。

export async function recryptAllRecords(
  fromKey: CryptoKey | null,
  toKey: CryptoKey | null,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const db = await openDb()
  if (!db) return 0

  const countTx = db.transaction([META_STORE, CHUNK_STORE, KV_STORE, INDEX_STORE], "readonly")
  const counts = await Promise.all([
    reqPromise(countTx.objectStore(META_STORE).count()),
    reqPromise(countTx.objectStore(CHUNK_STORE).count()),
    reqPromise(countTx.objectStore(KV_STORE).count()),
    reqPromise(countTx.objectStore(INDEX_STORE).count()),
  ])
  await txPromise(countTx)
  const total = counts.reduce((n, c) => n + c, 0)
  let done = 0
  const bump = () => {
    done++
    onProgress?.(done, total)
  }

  const dec = (sealed: Uint8Array) => aesDecryptBytes(sealed, fromKey)
  const enc = (plain: Uint8Array) => (toKey ? aesEncryptBytes(plain, toKey) : Promise.resolve(plain))

  // meta：整条记录的 JSON 密文
  {
    const rTx = db.transaction(META_STORE, "readonly")
    const all = await reqPromise(
      rTx.objectStore(META_STORE).getAll() as IDBRequest<(MetaRecord | EncMetaRecord)[]>,
    )
    await txPromise(rTx)
    const out: (MetaRecord | EncMetaRecord)[] = []
    for (const rec of all) {
      const plain =
        (rec as EncMetaRecord).enc instanceof Uint8Array
          ? (JSON.parse(await aesDecryptText((rec as EncMetaRecord).enc, fromKey)) as MetaRecord)
          : (rec as MetaRecord)
      out.push(
        toKey
          ? { id: plain.id, enc: await aesEncryptText(JSON.stringify(plain), toKey) }
          : plain,
      )
      bump()
    }
    const wTx = db.transaction(META_STORE, "readwrite")
    for (const rec of out) wTx.objectStore(META_STORE).put(rec)
    await txPromise(wTx)
  }

  // kv：value 的 JSON 密文
  {
    const rTx = db.transaction(KV_STORE, "readonly")
    const all = await reqPromise(rTx.objectStore(KV_STORE).getAll() as IDBRequest<KvRecord[]>)
    await txPromise(rTx)
    const out: KvRecord[] = []
    for (const rec of all) {
      const plain =
        rec.enc instanceof Uint8Array
          ? JSON.parse(await aesDecryptText(rec.enc, fromKey))
          : rec.value
      out.push(toKey ? { key: rec.key, enc: await aesEncryptText(JSON.stringify(plain), toKey) } : { key: rec.key, value: plain })
      bump()
    }
    const wTx = db.transaction(KV_STORE, "readwrite")
    for (const rec of out) wTx.objectStore(KV_STORE).put(rec)
    await txPromise(wTx)
  }

  // chunks + searchIndex：字节级密文（数据本体是压缩字节，直接加解密不重新压缩）
  for (const storeName of [CHUNK_STORE, INDEX_STORE] as const) {
    const kTx = db.transaction(storeName, "readonly")
    const keys = await reqPromise(
      kTx.objectStore(storeName).getAllKeys() as IDBRequest<IDBValidKey[]>,
    )
    await txPromise(kTx)
    const BATCH = 8
    for (let i = 0; i < keys.length; i += BATCH) {
      const slice = keys.slice(i, i + BATCH)
      const rTx = db.transaction(storeName, "readonly")
      const recs = await Promise.all(
        slice.map((k) =>
          reqPromise(
            rTx.objectStore(storeName).get(k) as IDBRequest<
              (ChunkRecord | IndexRecord) & { enc?: unknown }
            >,
          ),
        ),
      )
      await txPromise(rTx)
      const out: (ChunkRecord | IndexRecord)[] = []
      for (const rec of recs) {
        if (!rec) continue
        const isEnc = rec.enc === 1
        const plain = isEnc ? await dec(rec.data) : rec.data
        out.push({ ...rec, data: await enc(plain), ...(toKey ? { enc: 1 as const } : { enc: undefined }) })
        bump()
      }
      const wTx = db.transaction(storeName, "readwrite")
      for (const rec of out) wTx.objectStore(storeName).put(rec)
      await txPromise(wTx)
    }
  }
  return done
}

// ── 安全删除（尽力而为的覆写）──
// 如实边界：浏览器无法从 JS 擦除物理扇区——IndexedDB 的 delete 只是逻辑删除，
// 旧字节可能残留在底层存储引擎的文件里直到压缩（compaction）。这里在删除前
// 先用等长随机字节覆写该会议的全部分片 / meta / 检索索引记录，再执行删除，
// 显著降低「从磁盘直接翻出已删内容」的可能，但**不构成保证**。
// 高敏感场景的正确解是开启档案加密：盘上只有密文，删除即等于销毁明文可读性。
export async function secureDeleteMeetingRecords(meetingId: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const docIds = TEXT_FIELDS.map((f) => `${meetingId}::${f}`)
    const rTx = db.transaction([CHUNK_STORE, META_STORE, INDEX_STORE], "readonly")
    const reqs = [
      ...docIds.map((d) =>
        reqPromise(rTx.objectStore(CHUNK_STORE).getAll(chunkRange(d)) as IDBRequest<ChunkRecord[]>),
      ),
      reqPromise(rTx.objectStore(META_STORE).get(meetingId) as IDBRequest<unknown>),
      reqPromise(rTx.objectStore(INDEX_STORE).get(meetingId) as IDBRequest<IndexRecord | undefined>),
    ]
    const results = await Promise.all(reqs)
    await txPromise(rTx)
    const chunkLists = results.slice(0, docIds.length) as ChunkRecord[][]
    const idxRec = results[docIds.length + 1] as IndexRecord | undefined

    const wTx = db.transaction([CHUNK_STORE, META_STORE, INDEX_STORE], "readwrite")
    const cs = wTx.objectStore(CHUNK_STORE)
    for (const list of chunkLists) {
      for (const rec of list) {
        // 覆写与删除放同一事务：先写等长随机字节，再按主键删除
        cs.put({ ...rec, data: crypto.getRandomValues(new Uint8Array(rec.data.byteLength)) })
        cs.delete([rec.docId, rec.index])
      }
    }
    const ms = wTx.objectStore(META_STORE)
    ms.put({ id: meetingId, enc: crypto.getRandomValues(new Uint8Array(512)) })
    ms.delete(meetingId)
    if (idxRec) {
      const is = wTx.objectStore(INDEX_STORE)
      is.put({ ...idxRec, data: crypto.getRandomValues(new Uint8Array(idxRec.data.byteLength)) })
      is.delete(meetingId)
    }
    await txPromise(wTx)
  } catch {
    // 覆写失败不阻塞删除本身（常规删除路径照常清理记录），如实降级
  }
}

// ── 彻底清空本机档案（设置页「隐私与安全」的终局选项）──
// 删除两个 IndexedDB 库（主库 + 语义向量库）。调用方负责先覆写/清除 localStorage
// 各键并刷新页面（见 vaultOps.ts 的 wipeLocalArchive）。
export function wipeArchiveDatabases(): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve()
        return
      }
      let pending = 2
      const step = () => {
        pending--
        if (pending <= 0) resolve()
      }
      // 向量库名与 embedding.worker.ts 的 VDB_NAME 保持一致（worker 模块不在主线程导入，避免拉入推理依赖）
      for (const name of [DB_NAME, "meeting-notes-vectors"]) {
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = step
        req.onerror = step
        req.onblocked = step
      }
    } catch {
      resolve()
    }
  })
}
