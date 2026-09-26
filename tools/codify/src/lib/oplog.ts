// 待完成操作日志（崩溃安全的「先写意图，再写结果」）：
//
// 关键操作（AI 生成这类花时间花钱才产出的结果）开始前，先在 localStorage 同步写一个
// 轻量意图标记；结果经「立即落盘」（flushPersist）确认写入 IndexedDB 后清除标记。
// 两步之间任何环节被打断（关标签页 / 崩溃 / 断电），标记都会残留——
// 下次启动 takeStaleOps() 读出并清空，页面挂恢复提示，引导用户检查并重跑。
//
// 设计边界（如实）：标记只记录「哪个操作可能没保存完」，不缓存操作结果本身
// （AI 产物可达数 MB，localStorage 装不下也不该装）——所以恢复动作是「提示重跑」
// 而不是「自动还原」。配合关键操作的立即落盘，真正的暴露窗口只剩
// 「结果已进内存、 IndexedDB 事务尚未提交」的几百毫秒。
//
// localStorage 在这里恰好是对的选择：写入同步、独立于 IndexedDB 连接，
// 浏览器崩溃时最后一条标记也在。

import { vaultGetItem, vaultRemoveItem, vaultSetItem } from "@/lib/vault"

const OPLOG_KEY = "mn-oplog"


export interface OpEntry {
  id: string
  kind: string // 操作描述（生成摘要 / 抽取行动项 / 整理转写…），直接进恢复提示文案
  meetingId: string
  meetingTitle: string
  startedAt: number
}

function readRaw(): OpEntry[] {
  try {
    const text = vaultGetItem(OPLOG_KEY)
    if (!text) return []
    const arr = JSON.parse(text) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (o): o is OpEntry =>
        !!o &&
        typeof o === "object" &&
        typeof (o as OpEntry).id === "string" &&
        typeof (o as OpEntry).kind === "string",
    )
  } catch {
    return []
  }
}

function writeRaw(entries: OpEntry[]): void {
  try {
    if (entries.length === 0) vaultRemoveItem(OPLOG_KEY)
    else vaultSetItem(OPLOG_KEY, JSON.stringify(entries))
  } catch {
    // 标记写不进去（配额满等）不阻塞操作本身——最坏情况退回「无恢复提示」的旧行为
  }
}

// 开始一个关键操作：写意图标记，返回操作 id（供 endOp 清除）
export function beginOp(kind: string, meetingId: string, meetingTitle: string): string {
  const id = `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  writeRaw([...readRaw(), { id, kind, meetingId, meetingTitle, startedAt: Date.now() }])
  return id
}

// 操作完成（结果已确认落盘，或确定没有产出）：清除标记
export function endOp(id: string): void {
  const rest = readRaw().filter((o) => o.id !== id)
  writeRaw(rest)
}

// 启动扫描：读出上个会话残留的全部标记并清空日志（新会话从干净状态开始，
// 避免同一条中断记录反复提示）。返回空数组 = 上次会话善终。
export function takeStaleOps(): OpEntry[] {
  const stale = readRaw()
  if (stale.length > 0) writeRaw([])
  return stale
}
