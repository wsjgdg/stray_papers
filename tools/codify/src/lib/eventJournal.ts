// 事件日志（event-sourcing-lite）：所有会议字段变更以「带前后值的差异事件」追加记录，
// 支撑两种能力——
//   1. 时间点回滚：把某场会议逆向重放到任意事件之前的状态（「撤销到昨天下午」）；
//   2. 条目级履历：查某个行动项从提出到完成经历过的全部状态变化。
//
// 诚实说明边界：这不是完整的事件溯源——当前状态**不是**由事件重放派生的（那需要重写
// 存储层并用快照控制重放成本，对单机工具风险/收益不成比例）。主状态仍是会议对象本身，
// 事件日志是叠加在其上的变更审计层：每个事件记录字段级 prev/next，回滚 = 对目标时刻
// 之后的事件逆序应用 prev。大文本字段（转写稿等，单值 > 6000 字符）只记长度不记内容，
// 这类事件不可回滚（存储体积考量），UI 上如实禁用并说明。
//
// 存储：localStorage 独立键（与活动日志同级），每场会议最多 80 条事件、全局 2000 条滚动
// 淘汰；写入尽力而为——日志写失败绝不阻塞业务写入。不随备份导出（备份契约不变）。

import type { Meeting } from "@/lib/store"
import { vaultGetItem, vaultSetItem } from "@/lib/vault"

const JOURNAL_KEY = "meeting-notes-journal-v1"
const PER_MEETING_CAP = 80
const GLOBAL_CAP = 2000
const VALUE_CAP = 6000 // 单个前后值超过此字符数 → 只记长度（omitted），事件不可回滚
const ITEM_VALUE_CAP = 2500 // 列表条目单值上限（行动项/决议条目通常远小于此）
const LIST_ITEMS_CAP = 150 // 单次事件列表差异条目上限（facts 全量重写这类超大变更不做逐项差异）
const COALESCE_MS = 60_000 // 同会议同字段集的连续标量变更（转写击键）合并窗口

// 自动记录时跳过的派生/噪音字段（时间戳由系统盖，回滚它们没有意义）
const NOISE_FIELDS = new Set(["updatedAt", "transcriptUpdatedAt", "createdAt", "id"])
// 有 id 的列表字段：做条目级差异（支撑「行动项履历」与条目级回滚）
const LIST_FIELDS = new Set(["actions", "decisions", "pendingActions", "notes"])

export const FIELD_LABELS: Record<string, string> = {
  title: "标题",
  date: "日期",
  tags: "标签",
  meetingKind: "会议模板",
  transcript: "转写稿",
  cleaned: "清洗稿",
  cleanReport: "清洗报告",
  prePolish: "整理前快照",
  brief: "一句话摘要",
  outline: "议题要点",
  facts: "事实层",
  factsAt: "事实层时刻",
  factsModel: "事实层模型",
  factsFallback: "事实层回退标记",
  actions: "行动项",
  decisions: "决议",
  pendingActions: "待确认队列",
  notes: "随手记",
  archived: "归档状态",
  archivedAt: "归档时刻",
  golden: "评估集标记",
  digestLinks: "跟进消化链接",
  entities: "实体",
  extractedAt: "抽取时刻",
  seriesId: "系列",
  tz: "时区",
  recStartedAt: "实时转写锚点",
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}

export interface JournalListDiff {
  id: string
  op: "add" | "remove" | "update"
  idx: number // add: 新数组中的位置；remove: 旧数组中的位置；update: 新数组中的位置
  prev?: unknown
  next?: unknown
  big?: boolean // 条目值超限：只记 id 与操作类型，不可回滚
}

export interface JournalChange {
  field: string
  kind: "value" | "omitted" | "list"
  prev?: unknown
  next?: unknown
  prevLen?: number
  nextLen?: number
  items?: JournalListDiff[]
  truncated?: boolean // 列表差异条目超限，只保留了前 LIST_ITEMS_CAP 条
}

export interface JournalEvent {
  id: string
  ts: number
  meetingId: string
  label: string
  auto: boolean // 自动派生标签（可参与击键合并）；显式标签（生成摘要等）不合并
  changes: JournalChange[]
  info?: string // 信息型事件（创建/删除/批量操作）的说明文本
  revertable: boolean
}

function sizeOf(v: unknown): number {
  if (typeof v === "string") return v.length
  try {
    return JSON.stringify(v)?.length ?? 0
  } catch {
    return 0
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

function eventId(ts: number): string {
  return `j-${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ── 差异构建 ──

interface HasId {
  id: string
}

function diffList(prevArr: HasId[], nextArr: HasId[]): { items: JournalListDiff[]; truncated: boolean; big: boolean } {
  const prevById = new Map(prevArr.map((x, i) => [x.id, { x, i }]))
  const nextById = new Map(nextArr.map((x, i) => [x.id, { x, i }]))
  const items: JournalListDiff[] = []
  let big = false
  for (const [id, { x, i }] of prevById) {
    const hit = nextById.get(id)
    if (!hit) {
      if (sizeOf(x) > ITEM_VALUE_CAP) big = true
      items.push({ id, op: "remove", idx: i, ...(sizeOf(x) <= ITEM_VALUE_CAP ? { prev: x } : {}) })
    } else if (!sameValue(x, hit.x)) {
      if (sizeOf(x) > ITEM_VALUE_CAP || sizeOf(hit.x) > ITEM_VALUE_CAP) big = true
      items.push({
        id,
        op: "update",
        idx: hit.i,
        ...(sizeOf(x) <= ITEM_VALUE_CAP ? { prev: x } : {}),
        ...(sizeOf(hit.x) <= ITEM_VALUE_CAP ? { next: hit.x } : {}),
      })
    }
  }
  for (const [id, { x, i }] of nextById) {
    if (!prevById.has(id)) {
      if (sizeOf(x) > ITEM_VALUE_CAP) big = true
      items.push({ id, op: "add", idx: i, ...(sizeOf(x) <= ITEM_VALUE_CAP ? { next: x } : {}) })
    }
  }
  const truncated = items.length > LIST_ITEMS_CAP
  return { items: truncated ? items.slice(0, LIST_ITEMS_CAP) : items, truncated, big }
}

function buildChanges(
  prev: Meeting,
  patch: Partial<Meeting>,
): { changes: JournalChange[]; revertable: boolean } {
  const changes: JournalChange[] = []
  let revertable = true
  for (const key of Object.keys(patch)) {
    if (NOISE_FIELDS.has(key)) continue
    const next = (patch as Record<string, unknown>)[key]
    const old = (prev as unknown as Record<string, unknown>)[key]
    if (sameValue(old, next)) continue
    if (LIST_FIELDS.has(key) && Array.isArray(old) && Array.isArray(next)) {
      const { items, truncated, big } = diffList(old as HasId[], next as HasId[])
      if (items.length === 0) continue
      if (truncated || big) revertable = false
      changes.push({ field: key, kind: "list", items, ...(truncated ? { truncated } : {}) })
    } else if (sizeOf(old) > VALUE_CAP || sizeOf(next) > VALUE_CAP) {
      revertable = false
      changes.push({
        field: key,
        kind: "omitted",
        prevLen: sizeOf(old),
        nextLen: sizeOf(next),
      })
    } else {
      changes.push({ field: key, kind: "value", prev: old, next })
    }
  }
  if (changes.length === 0) revertable = false
  return { changes, revertable }
}

function autoLabel(changes: JournalChange[]): string {
  const first = fieldLabel(changes[0].field)
  return changes.length > 1 ? `${first} 等 ${changes.length} 处变更` : `${first}变更`
}

// ── 存取 ──

let cache: JournalEvent[] | null = null

export function loadJournal(): JournalEvent[] {
  if (cache) return cache
  try {
    const raw = vaultGetItem(JOURNAL_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    cache = Array.isArray(list) ? (list as JournalEvent[]).slice(0, GLOBAL_CAP) : []
  } catch {
    cache = []
  }
  return cache
}

function saveJournal(events: JournalEvent[]): void {
  cache = events
  try {
    vaultSetItem(JOURNAL_KEY, JSON.stringify(events))
  } catch {
    // 配额不足：砍掉最老的一半重试一次；仍失败就放弃本次写入（日志尽力而为，不阻塞业务）
    cache = events.slice(0, Math.max(1, Math.floor(events.length / 2)))
    try {
      vaultSetItem(JOURNAL_KEY, JSON.stringify(cache))
    } catch {
      // ignore
    }
  }
}

function appendEvent(ev: JournalEvent): void {
  const all = loadJournal()
  // 每场会议滚动上限：先淘汰该会议最老的事件
  let count = 0
  const trimmed = all.filter((e) => {
    if (e.meetingId !== ev.meetingId) return true
    count++
    return count < PER_MEETING_CAP
  })
  trimmed.unshift(ev)
  saveJournal(trimmed.slice(0, GLOBAL_CAP))
}

// 击键合并：同会议、同字段集、都是自动标签、窗口内的标量/大文本变更合并为一条
// （保留最早的 prev、取最新的 next）——转写稿连续输入不会淹没真正有意义的事件
function tryCoalesce(ev: JournalEvent): JournalEvent | null {
  const all = loadJournal()
  const last = all.find((e) => e.meetingId === ev.meetingId)
  if (!last || !last.auto || !ev.auto) return null
  if (ev.ts - last.ts > COALESCE_MS) return null
  const lastFields = last.changes.map((c) => c.field).sort().join(",")
  const evFields = ev.changes.map((c) => c.field).sort().join(",")
  if (lastFields !== evFields) return null
  if (ev.changes.some((c) => c.kind === "list") || last.changes.some((c) => c.kind === "list")) return null
  const merged: JournalEvent = {
    ...last,
    ts: ev.ts,
    changes: ev.changes.map((c) => {
      const old = last.changes.find((x) => x.field === c.field)
      if (!old) return c
      return {
        ...c,
        prev: old.prev,
        prevLen: old.prevLen,
      }
    }),
  }
  const without = all.filter((e) => e.id !== last.id)
  without.unshift(merged)
  saveJournal(without.slice(0, GLOBAL_CAP))
  return merged
}

// ── 记录入口 ──

/**
 * 记录一次字段级变更。prev 是变更前的会议快照（用于取旧值），patch 是本次写入的字段。
 * label 缺省时按字段自动派生；显式 label（如「生成摘要」）的事件不参与击键合并。
 */
export function journalPatch(
  meetingId: string,
  prev: Meeting | undefined,
  patch: Partial<Meeting>,
  label?: string,
): void {
  if (!prev) return
  try {
    const { changes, revertable } = buildChanges(prev, patch)
    if (changes.length === 0) return
    const ts = Date.now()
    const ev: JournalEvent = {
      id: eventId(ts),
      ts,
      meetingId,
      label: label ?? autoLabel(changes),
      auto: !label,
      changes,
      revertable,
    }
    if (!tryCoalesce(ev)) appendEvent(ev)
  } catch {
    // 日志失败不影响业务
  }
}

/** 信息型事件：只记「发生了什么」，不带可回滚差异（创建/删除/批量导入等） */
export function journalInfo(meetingId: string, label: string, info?: string): void {
  try {
    const ts = Date.now()
    appendEvent({
      id: eventId(ts),
      ts,
      meetingId,
      label,
      auto: false,
      changes: [],
      ...(info ? { info } : {}),
      revertable: false,
    })
  } catch {
    // ignore
  }
}

/** 删除会议时清掉它的全部历史（保留调用方随后补记的「删除会议」信息事件） */
export function journalPurge(meetingId: string): void {
  const all = loadJournal().filter((e) => e.meetingId !== meetingId)
  saveJournal(all)
}

// ── 查询 ──

/** 某场会议的事件，新 → 旧 */
export function eventsForMeeting(meetingId: string): JournalEvent[] {
  return loadJournal().filter((e) => e.meetingId === meetingId)
}

/**
 * 回滚补丁：把 targetTs 起（含）之后的全部事件逆向应用，得到「回到该事件之前」的补丁。
 * 任一事件不可回滚（大文本 / 截断差异 / 信息型）则返回 null——不支持部分回滚，
 * 那会造成「半新半旧」的拼接状态，比不回滚更糟。
 */
export function buildRevertPatch(current: Meeting, targetTs: number): Partial<Meeting> | null {
  const evs = eventsForMeeting(current.id).filter((e) => e.ts >= targetTs)
  if (evs.length === 0) return null
  if (evs.some((e) => !e.revertable)) return null
  const patch: Record<string, unknown> = {}
  const lists: Record<string, HasId[]> = {}
  for (const ev of evs) {
    // evs 已是新 → 旧；同一字段被多次改过时，最早那次的 prev 生效
    for (const ch of ev.changes) {
      if (ch.kind === "value") {
        if (!(ch.field in patch)) patch[ch.field] = ch.prev
      } else if (ch.kind === "list" && ch.items) {
        let arr =
          lists[ch.field] ??
          [...(((current as unknown as Record<string, unknown>)[ch.field] as HasId[] | undefined) ?? [])]
        for (const it of [...ch.items].reverse()) {
          if (it.op === "add") {
            arr = arr.filter((x) => x.id !== it.id)
          } else if (it.op === "remove") {
            if (it.prev !== undefined) {
              const idx = Math.min(Math.max(0, it.idx), arr.length)
              arr = [...arr.slice(0, idx), it.prev as HasId, ...arr.slice(idx)]
            }
          } else if (it.prev !== undefined) {
            arr = arr.map((x) => (x.id === it.id ? (it.prev as HasId) : x))
          }
        }
        lists[ch.field] = arr
      } else {
        return null
      }
    }
  }
  for (const [field, arr] of Object.entries(lists)) patch[field] = arr
  return patch as Partial<Meeting>
}

/** 某个行动项/决议的履历：只保留动过该条目的事件（条目级差异已按 id 归位） */
export function itemTrail(
  meetingId: string,
  itemId: string,
): { event: JournalEvent; field: string; diffs: JournalListDiff[] }[] {
  const out: { event: JournalEvent; field: string; diffs: JournalListDiff[] }[] = []
  for (const ev of eventsForMeeting(meetingId)) {
    for (const ch of ev.changes) {
      if (ch.kind !== "list" || !ch.items) continue
      const diffs = ch.items.filter((it) => it.id === itemId)
      if (diffs.length > 0) out.push({ event: ev, field: ch.field, diffs })
    }
  }
  return out
}

/** 日志里出现过的全部条目 id（含已被删除的），供「追踪条目」下拉使用 */
export function trailedItemIds(meetingId: string, field: string): string[] {
  const ids = new Set<string>()
  for (const ev of eventsForMeeting(meetingId)) {
    for (const ch of ev.changes) {
      if (ch.field === field && ch.kind === "list" && ch.items) {
        for (const it of ch.items) ids.add(it.id)
      }
    }
  }
  return [...ids]
}
