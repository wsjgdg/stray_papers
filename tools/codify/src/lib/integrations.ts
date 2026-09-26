// 外部工具集成层（预留接口位 + 文件类内置实现）。
//
// 两类契约：
// 1. TaskSyncTarget —— 行动项推送目标（Obsidian / GitHub Issues / Todoist / Slack 等）。
//    在线服务直连在本环境不可达（页面不能调第三方 API），内置目标只有「文件」类；
//    fork / 自托管实现在线目标并注册进 TASK_SYNC_TARGETS，导出入口自动多一个可选目标。
//    设计约定：单向推送（本工具 → 外部），不做双向同步——个人工具不值得承担冲突合并复杂度。
// 2. KnowledgeBridge —— 知识库导出桥（MCP 消费面）。把全库组织成「路径 + 内容」的文本文件清单，
//    任何外部进程（MCP server、同步盘、静态站生成器）都能直接消费；
//    内置 markdown 桥与现有「导出 Markdown 合集」同源（复用 buildMarkdown），
//    fork 里起一个 MCP server 读这份清单即可暴露 search_meetings / get_meeting 等工具。

import { buildMarkdown, downloadActionsMarkdown, isOpenStatus, todayStr, type Meeting, type QaRecord } from "@/lib/store"
import { buildDecisionLog } from "@/lib/workflows"

// ── 行动项推送目标 ──

export interface TaskSyncTarget {
  id: string
  label: string
  runtime: "file" | "online"
  description: string
  /** 推送跨会议未完成行动项；file 类目标产出下载，online 类目标调用外部 API（需 fork 注册） */
  pushActions: (meetings: Meeting[]) => Promise<void>
}

export const obsidianMarkdownTarget: TaskSyncTarget = {
  id: "obsidian-markdown",
  label: "Markdown 清单（Obsidian 等笔记软件可直接勾选）",
  runtime: "file",
  description: "跨会议未完成行动项导出为 checkbox 清单，带负责人 / 截止日 / 逾期标注，放进 vault 即可用",
  pushActions: async (meetings) => {
    downloadActionsMarkdown(meetings)
  },
}

// 注册表：GitHub Issues / Todoist / Slack 等在线目标在 fork / 自托管里往这里加
export const TASK_SYNC_TARGETS: TaskSyncTarget[] = [obsidianMarkdownTarget]

export function getTaskSyncTarget(id?: string): TaskSyncTarget | null {
  return TASK_SYNC_TARGETS.find((t) => t.id === (id ?? TASK_SYNC_TARGETS[0]?.id)) ?? null
}

export async function pushActionsToTarget(meetings: Meeting[], targetId?: string): Promise<boolean> {
  const target = getTaskSyncTarget(targetId)
  if (!target) return false
  await target.pushActions(meetings)
  return true
}

// ── 知识库导出桥（MCP 消费面）──

// 会议查询契约（Dataview 启发的设计）：所有字段可选、语义为「与」、值都是普通 JSON——
// fork 的 MCP server 把它直接作为 search_meetings(query) 的入参 schema，
// 用户就能像写 Dataview 查询一样自由组合视图：
//   { tags: ["项目A"], hasOpenActions: true }            → 项目A所有带未完成事项的会
//   { assignee: "老王", status: "open" }                 → 老王名下没关掉的行动项来自哪些会
//   { dateFrom: "2026-01-01", kind: "review" }           → 今年所有评审会
//   { text: "定价" }                                     → 全文含「定价」的会
export interface MeetingQuery {
  text?: string // 标题/转写/摘要/议题/行动项/决议 全文包含匹配（小写化）
  tags?: string[] // 含任一标签即命中
  seriesId?: string // 显式系列 id 精确匹配
  kind?: string // 会议模板 id
  dateFrom?: string // yyyy-mm-dd，含当天
  dateTo?: string
  assignee?: string // 存在该负责人的行动项（不含已取消）
  status?: "open" | "done" // open=有未完成行动项；done=有已完成行动项
  hasOpenActions?: boolean
  hasDecisions?: boolean
  limit?: number // 缺省 50，按日期降序取前 N
}

// 查询契约的机器可读描述：MCP server 可直接拿它生成工具入参 schema
export const MEETING_QUERY_DOC = {
  text: "全文包含匹配（标题/转写/摘要/议题/行动项/决议），大小写不敏感",
  tags: "含任一标签即命中（string[]）",
  seriesId: "显式系列 id 精确匹配",
  kind: "会议模板 id（general/weekly/review/client/oneonone 或自定义模板 id）",
  dateFrom: "会议日期下界 yyyy-mm-dd（含）",
  dateTo: "会议日期上界 yyyy-mm-dd（含）",
  assignee: "存在该负责人的未完成行动项",
  status: "open=有未完成行动项 / done=有已完成行动项",
  hasOpenActions: "true=只要有未完成行动项的会议",
  hasDecisions: "true=只要有决议的会议",
  limit: "返回上限，缺省 50，按日期降序",
} as const

export function runMeetingQuery(meetings: Meeting[], query: MeetingQuery): Meeting[] {
  const q = query.text?.trim().toLowerCase()
  const assignee = query.assignee?.trim()
  return meetings
    .filter((m) => {
      if (query.tags?.length && !query.tags.some((t) => m.tags.includes(t))) return false
      if (query.seriesId && m.seriesId !== query.seriesId) return false
      if (query.kind && (m.meetingKind ?? "general") !== query.kind) return false
      if (query.dateFrom && m.date < query.dateFrom) return false
      if (query.dateTo && m.date > query.dateTo) return false
      const live = m.actions.filter((a) => a.status !== "cancelled")
      if (assignee && !live.some((a) => a.assignee.trim() === assignee)) return false
      if (query.status === "open" && !live.some((a) => a.status !== "done")) return false
      if (query.status === "done" && !live.some((a) => a.status === "done")) return false
      if (query.hasOpenActions && !live.some((a) => a.status !== "done")) return false
      if (query.hasDecisions && m.decisions.length === 0) return false
      if (q) {
        const haystack = [
          m.title,
          m.transcript,
          m.brief?.content ?? "",
          ...(m.outline?.topics ?? []).flatMap((t) => [t.topic, ...t.points]),
          ...m.actions.map((a) => `${a.content} ${a.assignee}`),
          ...m.decisions.map((d) => d.content),
          ...m.tags,
        ]
          .join("\n")
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, query.limit ?? 50)
}

export interface KnowledgeFile {
  path: string // 相对路径，如 meetings/2026-09-22-产品周会.md
  content: string
}

export interface KnowledgeBridge {
  id: string
  label: string
  /** 把全库组织成外部工具可直接消费的文件清单（每场会议一个文件 + 一份机器可读索引） */
  toFiles: (meetings: Meeting[], qaHistory: QaRecord[]) => KnowledgeFile[]
}

function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 60)
}

export const markdownKnowledgeBridge: KnowledgeBridge = {
  id: "markdown-bundle",
  label: "Markdown 知识库（每会一文件 + JSON 索引）",
  toFiles: (meetings, qaHistory) => {
    const sorted = [...meetings].sort((a, b) => b.date.localeCompare(a.date))
    const files: KnowledgeFile[] = sorted.map((m) => ({
      path: `meetings/${m.date}-${safeFileName(m.title)}.md`,
      content: buildMarkdown(m),
    }))
    const index = {
      generatedAt: new Date().toISOString(),
      meetingCount: sorted.length,
      qaCount: qaHistory.length,
      meetings: sorted.map((m) => ({
        id: m.id,
        title: m.title,
        date: m.date,
        tags: m.tags,
        kind: m.meetingKind ?? "general",
        ...(m.seriesId ? { seriesId: m.seriesId } : {}),
        ...(m.recStartedAt ? { recordedAt: new Date(m.recStartedAt).toISOString() } : {}),
        ...(m.tz ? { timezone: m.tz } : {}),
        brief: m.brief?.content ?? "",
        topics: (m.outline?.topics ?? []).map((t) => t.topic),
        actionStats: {
          total: m.actions.length,
          open: m.actions.filter((a) => a.status !== "done" && a.status !== "cancelled").length,
          done: m.actions.filter((a) => a.status === "done").length,
          overdue: m.actions.filter(
            (a) => a.status !== "done" && a.status !== "cancelled" && a.dueDate && a.dueDate < todayStr(),
          ).length,
        },
        openActions: m.actions.filter((a) => isOpenStatus(a.status)).map((a) => ({
          content: a.content,
          assignee: a.assignee,
          dueDate: a.dueDate,
          status: a.status,
        })),
        decisions: m.decisions.map((d) => d.content),
        file: `meetings/${m.date}-${safeFileName(m.title)}.md`,
      })),
    }
    files.push({ path: "index.json", content: JSON.stringify(index, null, 2) })
    // 决策日志自动随行（工作流④的「同步文档」形态）：知识库每次导出都带上
    // 按时间倒序、含被取代标注的全量决策记录，外部文档系统 / 静态站直接消费
    files.push({ path: "decision-log.md", content: buildDecisionLog(meetings) })
    // 查询接口说明：MCP server / 脚本消费方按此契约组合查询（与 runMeetingQuery 一致）
    files.push({
      path: "query-interface.json",
      content: JSON.stringify(
        {
          tool: "search_meetings",
          description:
            "所有字段可选、语义为「与」；实现可直接复用本仓库 lib/integrations.ts 的 runMeetingQuery(meetings, query)",
          query: MEETING_QUERY_DOC,
        },
        null,
        2,
      ),
    })
    return files
  },
}

// 注册表：其他形态（单文件 JSON 桥、静态站桥等）往这里加
export const KNOWLEDGE_BRIDGES: KnowledgeBridge[] = [markdownKnowledgeBridge]

export function getKnowledgeBridge(id?: string): KnowledgeBridge | null {
  return KNOWLEDGE_BRIDGES.find((b) => b.id === (id ?? KNOWLEDGE_BRIDGES[0]?.id)) ?? null
}
