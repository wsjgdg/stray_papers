// 命令面板（Cmd/Ctrl + K）：「我想找某个东西」的统一入口。
// 一个输入框实时返回 会议标题 / 转写内容 / 行动项 / 决议 / 标签 五类结果，
// 按类型分组、图标区分，键盘上下选择回车跳转——用户不需要记住哪个功能在哪个入口。
// 全部为本地内存检索，零 AI 调用；语义搜索仍走列表页的独立入口。

import { useMemo, useState } from "react"
import { Command } from "cmdk"
import {
  CalendarClock,
  ListTodo,
  NotebookText,
  Scale,
  ScrollText,
  Search,
  Tag,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { isOpenStatus, type Meeting, type SourceAnchor } from "@/lib/store"
import type { TabKey } from "@/hooks/useMeetingNotes"

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  meetings: Meeting[]
  allTags: string[]
  // 跳转：选中会议 + 切到对应页签（可选带原文锚点，转写页会精确选中命中行）
  onJump: (meetingId: string, tab: TabKey, anchor?: SourceAnchor | null) => void
  onFilterTag: (tag: string) => void
  onOpenQa: () => void
}

type Hit =
  | { group: "meeting"; key: string; title: string; sub: string; meetingId: string }
  | { group: "transcript"; key: string; title: string; sub: string; meetingId: string; anchor: SourceAnchor }
  | { group: "action"; key: string; title: string; sub: string; meetingId: string; open: boolean }
  | { group: "decision"; key: string; title: string; sub: string; meetingId: string }
  | { group: "tag"; key: string; title: string; sub: string; tag: string }

const GROUP_META: Record<
  Hit["group"],
  { label: string; icon: typeof Search; order: number }
> = {
  meeting: { label: "会议", icon: NotebookText, order: 0 },
  transcript: { label: "转写内容", icon: ScrollText, order: 1 },
  action: { label: "行动项", icon: ListTodo, order: 2 },
  decision: { label: "决议", icon: Scale, order: 3 },
  tag: { label: "标签", icon: Tag, order: 4 },
}

const PER_GROUP = 6

// 转写命中行的上下文摘录：命中词前后各留一截，替换换行
function snippetOf(text: string, idx: number, kwLen: number): string {
  const from = Math.max(0, idx - 18)
  const to = Math.min(text.length, idx + kwLen + 34)
  const s = text.slice(from, to).replace(/\s+/g, " ")
  return `${from > 0 ? "…" : ""}${s}${to < text.length ? "…" : ""}`
}

export function CommandPalette({
  open,
  onClose,
  meetings,
  allTags,
  onJump,
  onFilterTag,
  onOpenQa,
}: CommandPaletteProps) {
  // 面板关闭时父级直接卸载本组件，每次打开都是全新挂载——输入框天然回到空态，无需 effect 重置
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()

  const hits = useMemo<Hit[]>(() => {
    if (!q) return []
    const out: { group: Hit["group"]; hit: Hit; rank: number }[] = []

    for (const m of meetings) {
      // 会议标题（前缀命中排前）
      const title = m.title || "未命名会议"
      const tIdx = title.toLowerCase().indexOf(q)
      if (tIdx >= 0) {
        out.push({
          group: "meeting",
          rank: tIdx === 0 ? 0 : 1,
          hit: {
            group: "meeting",
            key: `m-${m.id}`,
            title,
            sub: `${m.date}${m.tags.length ? ` · ${m.tags.join(" / ")}` : ""}`,
            meetingId: m.id,
          },
        })
      }

      // 行动项与决议
      for (const a of m.actions) {
        const text = `${a.content} ${a.assignee}`.toLowerCase()
        const idx = text.indexOf(q)
        if (idx >= 0) {
          out.push({
            group: "action",
            rank: idx === 0 ? 0 : 1,
            hit: {
              group: "action",
              key: `a-${m.id}-${a.id}`,
              title: a.content,
              sub: `《${title}》${a.assignee ? ` · 负责人 ${a.assignee}` : ""}${a.dueDate ? ` · 截止 ${a.dueDate}` : ""}`,
              meetingId: m.id,
              open: isOpenStatus(a.status),
            },
          })
        }
      }
      for (const d of m.decisions) {
        if (d.content.toLowerCase().includes(q)) {
          out.push({
            group: "decision",
            rank: 1,
            hit: {
              group: "decision",
              key: `d-${m.id}-${d.id}`,
              title: d.content,
              sub: `《${title}》`,
              meetingId: m.id,
            },
          })
        }
      }

      // 转写内容：每场会议只取第一个命中行（避免长转写刷屏）
      if (m.transcript) {
        const raw = m.transcript
        const idx = raw.toLowerCase().indexOf(q)
        if (idx >= 0) {
          const line = raw.slice(0, idx).split("\n").length
          out.push({
            group: "transcript",
            rank: 2,
            hit: {
              group: "transcript",
              key: `t-${m.id}`,
              title: snippetOf(raw, idx, q.length),
              sub: `《${title}》 · 第 ${line} 行`,
              meetingId: m.id,
              anchor: { line, start: idx, end: idx + q.length },
            },
          })
        }
      }
    }

    for (const t of allTags) {
      if (t.toLowerCase().includes(q)) {
        const n = meetings.filter((m) => m.tags.includes(t)).length
        out.push({
          group: "tag",
          rank: 0,
          hit: { group: "tag", key: `g-${t}`, title: t, sub: `${n} 场会议带此标签`, tag: t },
        })
      }
    }

    // 分组截断：每组最多 PER_GROUP 条，组内前缀命中优先
    const result: Hit[] = []
    for (const g of Object.keys(GROUP_META) as Hit["group"][]) {
      result.push(
        ...out
          .filter((x) => x.group === g)
          .sort((a, b) => a.rank - b.rank)
          .slice(0, PER_GROUP)
          .map((x) => x.hit),
      )
    }
    return result
  }, [q, meetings, allTags])

  if (!open) return null

  const grouped = (Object.keys(GROUP_META) as Hit["group"][])
    .map((g) => ({ g, items: hits.filter((h) => h.group === g) }))
    .filter((x) => x.items.length > 0)

  const runHit = (h: Hit) => {
    if (h.group === "tag") {
      onFilterTag(h.tag)
    } else if (h.group === "transcript") {
      onJump(h.meetingId, "transcript", h.anchor)
    } else if (h.group === "action") {
      onJump(h.meetingId, "actions")
    } else if (h.group === "decision") {
      onJump(h.meetingId, "decisions")
    } else {
      onJump(h.meetingId, "summary")
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/25 pt-[12vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="搜索与跳转"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[var(--radius-lg)] border border-border bg-popover shadow-[0_16px_48px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会议、转写内容、行动项、决议、标签…"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          <kbd className="hidden shrink-0 rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block cjk-latin">
            Esc
          </kbd>
        </div>

        <Command shouldFilter={false} className="max-h-[52vh] overflow-y-auto p-2">
          <Command.List>
            {!q ? (
              <div className="px-2 py-3">
                <p className="text-[11px] font-medium text-muted-foreground">最近会议</p>
                <ul className="mt-1.5 space-y-0.5">
                  {meetings.slice(0, 5).map((m) => (
                    <li key={m.id}>
                      <button
                        onClick={() => {
                          onJump(m.id, "summary")
                          onClose()
                        }}
                        className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors hover:bg-muted"
                      >
                        <NotebookText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                          {m.title || "未命名会议"}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground cjk-latin tabular-nums">
                          {m.date}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
                  输入关键词可同时检索标题、转写全文、行动项、决议与标签；
                  <button
                    onClick={() => {
                      onOpenQa()
                      onClose()
                    }}
                    className="ml-1 text-primary underline-offset-2 transition-opacity hover:opacity-75"
                  >
                    想让 AI 跨会议回答 → 打开问答
                  </button>
                </p>
              </div>
            ) : grouped.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-sm text-foreground/85">没有找到「{query.trim()}」</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  换个更短的关键词试试，或在列表页用语义搜索让 AI 按含义找
                  <button
                    onClick={() => {
                      onOpenQa()
                      onClose()
                    }}
                    className="ml-1 text-primary underline-offset-2 transition-opacity hover:opacity-75"
                  >
                    直接问 AI
                  </button>
                </p>
              </div>
            ) : (
              grouped.map(({ g, items }) => {
                const meta = GROUP_META[g]
                const Icon = meta.icon
                return (
                  <Command.Group
                    key={g}
                    heading={
                      <span className="flex items-center gap-1.5 px-1 text-[10px] font-medium text-muted-foreground">
                        <Icon className="h-3 w-3" />
                        {meta.label}
                        <span className="cjk-latin tabular-nums">{items.length}</span>
                      </span>
                    }
                  >
                    {items.map((h) => (
                      <Command.Item
                        key={h.key}
                        value={h.key}
                        onSelect={() => runHit(h)}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 transition-colors",
                          "aria-selected:bg-muted",
                        )}
                      >
                        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] leading-snug text-foreground">
                            {h.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground cjk-latin">
                            {h.sub}
                          </span>
                        </span>
                        {h.group === "action" ? (
                          <span
                            className={cn(
                              "mt-0.5 shrink-0 rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px]",
                              h.open
                                ? "border-primary/30 bg-primary/5 text-primary"
                                : "border-border bg-muted text-muted-foreground/70",
                            )}
                          >
                            {h.open ? "未完成" : "已结束"}
                          </span>
                        ) : null}
                        {h.group === "transcript" ? (
                          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        ) : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )
              })
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
