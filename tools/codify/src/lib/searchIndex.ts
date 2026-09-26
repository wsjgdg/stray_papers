// 增量检索索引：搜索不再「每次按键全库重建检索文本」。
//
// 每场会议维护一份归一化检索文本（haystack）缓存，按内容戳（updatedAt / 转写 / 摘要 /
// 抽取的最大时间）做脏标记：戳没变 → 缓存直接复用；戳变了 → 该场重建，其余不动。
// 持久化副本存 IndexedDB searchIndex store（LZ4 压缩），后台防抖批量刷盘——
// 修改时只标脏，不立即写库；定时器到点一次事务处理全部脏记录与已删记录。
//
// 匹配语义与旧内联实现完全一致：空格分隔多关键词、子串包含、大小写不敏感。

import { compressBytes, decompressBytes, type Codec } from "@/lib/compression"
import { readIndexRecords, writeIndexRecords } from "@/lib/idbStore"
import type { SearchDoc } from "@/lib/searchCore"
import { contentStamp, type Meeting } from "@/lib/store"

interface CacheEntry {
  stamp: number
  haystack: string
}

// 内存缓存：id → { 内容戳, 检索文本 }
const cache = new Map<string, CacheEntry>()
// 已落盘版本的内容戳：脏标记 = cache 里的 stamp 与它不一致（或缓存新建）
const persistedStamps = new Map<string, number>()

export function indexStampOf(m: Meeting): number {
  return Math.max(m.updatedAt, contentStamp(m))
}

// 与旧版 filteredMeetings 内联实现逐字段一致（行为不变）
function buildHaystack(m: Meeting): string {
  return [
    m.title,
    m.date,
    m.transcript,
    m.brief?.content ?? "",
    ...(m.outline?.topics ?? []).flatMap((t) => [t.topic, ...t.points]),
    ...m.actions.map((a) => `${a.content} ${a.assignee}`),
    ...m.decisions.map((d) => d.content),
    ...m.tags,
  ]
    .join("\n")
    .toLowerCase()
}

// 同步取检索文本：命中缓存（戳未变）零成本，未命中才构建并回填。
// 搜索框逐键过滤只付「子串扫描」的钱，不再付「全库字符串重建」的钱。
export function haystackOf(m: Meeting): string {
  const stamp = indexStampOf(m)
  const hit = cache.get(m.id)
  if (hit && hit.stamp === stamp) return hit.haystack
  const haystack = buildHaystack(m)
  cache.set(m.id, { stamp, haystack })
  return haystack
}

export function dropFromIndex(ids: Iterable<string>): void {
  for (const id of ids) cache.delete(id)
}

// ── 检索文档构造：倒排索引（searchCore）消费的载荷 ──

// 加权前置文本：标题/日期/摘要/议题/行动项/决议/标签（不含转写稿）——
// 命中这些层的词比只命中转写全文的词得分高
function buildHead(m: Meeting): string {
  return [
    m.title,
    m.date,
    m.brief?.content ?? "",
    ...(m.outline?.topics ?? []).flatMap((t) => [t.topic, ...t.points]),
    ...m.actions.map((a) => `${a.content} ${a.assignee}`),
    ...m.decisions.map((d) => d.content),
    ...m.tags,
  ]
    .join("\n")
    .toLowerCase()
}

export function searchDocOf(m: Meeting): SearchDoc {
  return {
    id: m.id,
    stamp: indexStampOf(m),
    updatedAt: m.updatedAt,
    title: m.title.toLowerCase(),
    tags: m.tags.join(" ").toLowerCase(),
    head: buildHead(m),
    haystack: haystackOf(m),
  }
}

// ── 持久化：启动回填 + 脏记录后台批量刷盘 ──

// 冷启动：把库里的索引记录解压回填内存缓存——已缓存的会议无需从转写稿重建。
// 非阻塞调用；失败静默（haystackOf 会按需自建，只损失首次构建成本）。
export async function loadPersistedIndex(): Promise<void> {
  try {
    const records = await readIndexRecords()
    if (records.length === 0) return
    const decoded = await Promise.all(
      records.map(async (r) => ({
        meetingId: r.meetingId,
        stamp: r.stamp,
        text: await decompressBytes({ codec: r.codec as Codec, data: r.data }).then(
          (b) => new TextDecoder().decode(b),
          () => null,
        ),
      })),
    )
    for (const d of decoded) {
      if (d.text === null) continue
      persistedStamps.set(d.meetingId, d.stamp)
      // 内存里已有更新的版本（加载期间用户已经在改）就不覆盖
      const cur = cache.get(d.meetingId)
      if (!cur || cur.stamp < d.stamp) {
        cache.set(d.meetingId, { stamp: d.stamp, haystack: d.text })
      }
    }
  } catch {
    // 索引只是加速层，坏了不影响正确性
  }
}

let flushTimer: ReturnType<typeof setTimeout> | null = null

// 标脏 + 排程：会议数据变化后调用；800ms 防抖，把这段时间内的全部变更
// 攒成一次批量刷盘（而不是每次修改立即重建落盘）
export function queueIndexPersist(meetings: Meeting[]): void {
  if (flushTimer !== null) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushIndexPersist(meetings)
  }, 800)
}

async function flushIndexPersist(meetings: Meeting[]): Promise<void> {
  try {
    const liveIds = new Set<string>()
    const upserts: { meetingId: string; stamp: number; codec: Codec; data: Uint8Array }[] = []
    for (const m of meetings) {
      liveIds.add(m.id)
      const stamp = indexStampOf(m)
      // 已落盘且内容戳没变 → 跳过（haystackOf 缓存可能是旧的，脏判断必须以 stamp 为准）
      if (persistedStamps.get(m.id) === stamp) continue
      const haystack = haystackOf(m) // 未命中/过期的缓存会在这里重建
      const compressed = await compressBytes(new TextEncoder().encode(haystack), "active")
      upserts.push({ meetingId: m.id, stamp, codec: compressed.codec, data: compressed.data })
    }
    const deleteIds: string[] = []
    for (const id of persistedStamps.keys()) {
      if (!liveIds.has(id)) deleteIds.push(id)
    }
    if (upserts.length === 0 && deleteIds.length === 0) return
    await writeIndexRecords(upserts, deleteIds)
    for (const u of upserts) persistedStamps.set(u.meetingId, u.stamp)
    for (const id of deleteIds) {
      persistedStamps.delete(id)
      cache.delete(id)
    }
  } catch {
    // 刷盘失败不打扰用户：内存缓存仍然生效，下次排队重试
  }
}
