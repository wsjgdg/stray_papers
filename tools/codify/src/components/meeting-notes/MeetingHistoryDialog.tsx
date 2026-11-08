// 会议历史对话框：某场会议的事件日志时间线（lib/eventJournal.ts）。
// 三个能力——
//   1. 变更时间线：每条事件显示时刻、标签与字段级前后差异（可展开看明细）；
//   2. 条目追踪：选一个行动项/决议，只看它从提出到现在经历的状态变化；
//   3. 时间点回滚：「回到此时间点之前」= 逆向重放该时刻之后的全部事件。
//      含大文本变更（转写稿等）或批量截断差异的区间不可回滚，按钮禁用并说明原因。

import { useState } from "react"
import { CornerUpLeft, History, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ACTION_STATUSES, type Meeting } from "@/lib/store"
import {
  buildRevertPatch,
  eventsForMeeting,
  fieldLabel,
  itemTrail,
  type JournalChange,
  type JournalListDiff,
} from "@/lib/eventJournal"

interface MeetingHistoryDialogProps {
  meeting: Meeting | null
  open: boolean
  onClose: () => void
  onRevert: (patch: Partial<Meeting>, label: string) => void
}

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  ACTION_STATUSES.map((s) => [s.value, s.label]),
)

const ITEM_FIELD_LABELS: Record<string, string> = {
  content: "内容",
  assignee: "负责人",
  dueDate: "截止日",
  status: "状态",
  editedByUser: "用户编辑标记",
  confidence: "置信度",
  support: "支撑核验",
  sourceQuote: "原文引用",
  text: "文本",
  supersededBy: "被取代标记",
  at: "时刻",
}

function fmtTs(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const hm = `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

function shortValue(v: unknown, max = 28): string {
  if (v === null || v === undefined || v === "") return "（空）"
  let s: string
  if (typeof v === "string") s = v
  else if (typeof v === "boolean") s = v ? "是" : "否"
  else if (typeof v === "number") s = String(v)
  else {
    try {
      s = JSON.stringify(v) ?? "…"
    } catch {
      s = "…"
    }
  }
  s = s.replace(/\s+/g, " ")
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function listCounts(ch: JournalChange): string {
  const items = ch.items ?? []
  const add = items.filter((i) => i.op === "add").length
  const remove = items.filter((i) => i.op === "remove").length
  const update = items.filter((i) => i.op === "update").length
  return [add ? `+${add}` : "", remove ? `−${remove}` : "", update ? `~${update}` : ""]
    .filter(Boolean)
    .join(" ")
}

function describeChange(ch: JournalChange): string {
  if (ch.kind === "omitted") {
    return `${fieldLabel(ch.field)}：大文本变更（${ch.prevLen ?? 0} → ${ch.nextLen ?? 0} 字符，不支持回滚）`
  }
  if (ch.kind === "list") {
    return `${fieldLabel(ch.field)} ${listCounts(ch)}${ch.truncated ? "（差异过大已截断）" : ""}`
  }
  if (ch.field === "status") return `状态：${shortValue(ch.prev)} → ${shortValue(ch.next)}`
  return `${fieldLabel(ch.field)}：${shortValue(ch.prev)} → ${shortValue(ch.next)}`
}

// 条目级差异明细：把 update 的 prev/next 对象展开成「字段：旧 → 新」行
function ItemDiffDetail({ diff }: { diff: JournalListDiff }) {
  const opLabel = diff.op === "add" ? "新增" : diff.op === "remove" ? "删除" : "修改"
  const prev = (diff.prev ?? null) as Record<string, unknown> | null
  const next = (diff.next ?? null) as Record<string, unknown> | null
  const changedKeys =
    diff.op === "update" && prev && next
      ? Object.keys(next).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]))
      : []
  return (
    <div className="rounded-[var(--radius-sm)] border border-border/60 bg-background px-2.5 py-1.5 text-[11px]">
      <p className="cjk-latin font-medium text-foreground/80">
        {opLabel}
        {diff.big ? "（条目过大，只记操作类型）" : ` · ${shortValue(next?.content ?? prev?.content ?? next?.text ?? prev?.text ?? "", 40)}`}
      </p>
      {changedKeys.map((k) => {
        const pv = prev?.[k]
        const nv = next?.[k]
        return (
          <p key={k} className="cjk-latin mt-0.5 text-muted-foreground">
            {ITEM_FIELD_LABELS[k] ?? k}：
            {k === "status"
              ? `${STATUS_LABELS[String(pv)] ?? shortValue(pv)} → ${STATUS_LABELS[String(nv)] ?? shortValue(nv)}`
              : `${shortValue(pv)} → ${shortValue(nv)}`}
          </p>
        )
      })}
    </div>
  )
}

export function MeetingHistoryDialog({ meeting, open, onClose, onRevert }: MeetingHistoryDialogProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [trackId, setTrackId] = useState("")
  const [confirmTs, setConfirmTs] = useState<number | null>(null)
  const [revertError, setRevertError] = useState("")

  // 日志是同步读（localStorage），直接在渲染体里取——回滚写入后会议对象换引用，
  // 宿主重渲染即重读最新日志，无需额外刷新状态
  const events = open && meeting ? eventsForMeeting(meeting.id) : []

  const trackOptions = (() => {
    if (!meeting) return []
    const seen = new Map<string, string>()
    for (const a of meeting.actions) seen.set(a.id, a.content)
    for (const a of meeting.pendingActions ?? []) if (!seen.has(a.id)) seen.set(a.id, a.content)
    for (const d of meeting.decisions) if (!seen.has(d.id)) seen.set(d.id, d.content)
    // 日志里出现过但已被删除的条目也保留在选项里（履历恰恰对「被删掉的条目」最有价值）
    for (const ev of events) {
      for (const ch of ev.changes) {
        if (ch.kind !== "list" || !ch.items) continue
        for (const it of ch.items) {
          if (seen.has(it.id)) continue
          const src = (it.next ?? it.prev) as Record<string, unknown> | undefined
          seen.set(it.id, String(src?.content ?? src?.text ?? "（已删除的条目）"))
        }
      }
    }
    return [...seen.entries()].map(([id, content]) => ({ id, content }))
  })()

  const trail = trackId && meeting ? itemTrail(meeting.id, trackId) : []

  if (!open || !meeting) return null

  const revertableUpTo = (ts: number): boolean =>
    events.filter((e) => e.ts >= ts).every((e) => e.revertable && e.changes.length > 0)

  const doRevert = (ts: number) => {
    const patch = buildRevertPatch(meeting, ts)
    if (!patch) {
      setRevertError("该时间点之后包含不可回滚的变更（大文本或批量截断），无法整体回退")
      setConfirmTs(null)
      return
    }
    onRevert(patch, `回滚到 ${fmtTs(ts)} 之前的状态`)
    setConfirmTs(null)
    setRevertError("")
  }

  const visible: { key: string; ts: number; label: string; info?: string; revertable: boolean; changes: JournalChange[] }[] =
    trackId
      ? trail.map(({ event, diffs }) => ({
          key: `${event.id}:${diffs.map((d) => d.id).join()}`,
          ts: event.ts,
          label: event.label,
          revertable: false, // 追踪视图聚焦履历阅读，回滚请在「全部变更」视图操作
          changes: [{ field: "items", kind: "list", items: diffs }],
        }))
      : events.map((e) => ({
          key: e.id,
          ts: e.ts,
          label: e.label,
          ...(e.info ? { info: e.info } : {}),
          revertable: e.revertable,
          changes: e.changes,
        }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4 dark:bg-background/70"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="会议历史"
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-[var(--radius-lg)] border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="flex min-w-0 items-center gap-2 font-[var(--font-display)] text-sm font-semibold tracking-tight text-foreground">
            <History className="h-4 w-4 shrink-0 text-primary" />
            会议历史
            <span className="truncate font-normal text-muted-foreground">· {meeting.title}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="关闭会议历史"
            className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-5 py-2.5">
          <label className="shrink-0 text-[11px] text-muted-foreground" htmlFor="mn-history-track">
            追踪条目
          </label>
          <select
            id="mn-history-track"
            value={trackId}
            onChange={(e) => {
              setTrackId(e.target.value)
              setConfirmTs(null)
              setRevertError("")
            }}
            className="h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-background px-2 text-[11px] text-foreground"
          >
            <option value="">全部变更（{events.length} 条事件）</option>
            {trackOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.content.length > 30 ? `${o.content.slice(0, 30)}…` : o.content}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 py-3.5">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-xs leading-relaxed text-muted-foreground">
              {trackId
                ? "这个条目还没有变更记录——它的状态变化（改派 / 完成 / 编辑）都会记在这里"
                : "还没有变更记录。编辑标题、勾选行动项、生成纪要等操作都会以事件形式记在这里（本机保存，每场最多 80 条）"}
            </p>
          ) : (
            visible.map((ev) => {
              const isOpen = expanded.has(ev.key)
              const canRevert = !trackId && revertableUpTo(ev.ts)
              return (
                <div
                  key={ev.key}
                  className="rounded-[var(--radius-md)] border border-border/70 bg-background/60 px-3 py-2"
                >
                  <button
                    className="flex w-full items-baseline justify-between gap-2 text-left"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        if (next.has(ev.key)) next.delete(ev.key)
                        else next.add(ev.key)
                        return next
                      })
                    }
                    aria-expanded={isOpen}
                  >
                    <span className="cjk-latin text-[11px] font-medium text-foreground/85">
                      {ev.label}
                      {ev.info ? <span className="ml-1.5 font-normal text-muted-foreground">{ev.info}</span> : null}
                    </span>
                    <span className="cjk-latin shrink-0 text-[10px] tabular-nums text-muted-foreground">{fmtTs(ev.ts)}</span>
                  </button>

                  {!isOpen && ev.changes.length > 0 ? (
                    <p className="cjk-latin mt-0.5 truncate text-[10px] text-muted-foreground">
                      {ev.changes.map(describeChange).join(" · ")}
                    </p>
                  ) : null}

                  {isOpen ? (
                    <div className="mt-1.5 space-y-1.5">
                      {ev.changes.map((ch, i) =>
                        ch.kind === "list" && ch.items ? (
                          <div key={`${ev.key}-${i}`} className="space-y-1">
                            <p className="cjk-latin text-[10px] text-muted-foreground">
                              {ch.field === "items" ? "条目变化" : `${fieldLabel(ch.field)} ${listCounts(ch)}`}
                            </p>
                            {ch.items.map((it) => (
                              <ItemDiffDetail key={it.id + it.op + it.idx} diff={it} />
                            ))}
                          </div>
                        ) : (
                          <p key={`${ev.key}-${i}`} className="cjk-latin text-[10px] leading-relaxed text-muted-foreground">
                            {describeChange(ch)}
                          </p>
                        ),
                      )}
                      {!trackId ? (
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                            {canRevert
                              ? "回滚会撤销此时刻起（含）之后的全部变更"
                              : "此时间点之后含大文本 / 批量变更，不支持回滚"}
                          </p>
                          {confirmTs === ev.ts ? (
                            <button
                              onClick={() => doRevert(ev.ts)}
                              className="flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] bg-destructive px-2 py-1 text-[10px] font-medium text-destructive-foreground"
                            >
                              <CornerUpLeft className="h-3 w-3" />
                              再点一次确认回滚
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setConfirmTs(ev.ts)
                                setRevertError("")
                              }}
                              disabled={!canRevert}
                              className={cn(
                                "flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-1 text-[10px]",
                                canRevert
                                  ? "border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                                  : "cursor-not-allowed border-border/40 text-muted-foreground/40",
                              )}
                            >
                              <CornerUpLeft className="h-3 w-3" />
                              回到此时间点之前
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
          {revertError ? <p className="text-[11px] text-destructive">{revertError}</p> : null}
        </div>

        <div className="shrink-0 border-t border-border/60 px-5 py-2.5">
          <p className="text-[10px] leading-relaxed text-muted-foreground/80">
            事件日志只存本机（每场会议滚动保留最近 80 条），不随备份导出；转写稿等大文本只记变更长度不记内容，
            因此含大文本变更的时间段不可整体回滚——转写整理请用「还原到整理前」。
          </p>
        </div>
      </div>
    </div>
  )
}
