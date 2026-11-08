// 会议工作流编排层：把会议从「记录」变成「下游工作的触发器」。
//
// 设计立场：这些工作流不是孤立功能，而是知识库的自动消费方式——档案积累得越厚，
// 会前简报越有料、Issue 草稿越齐全、决策日志越完整。全部消费逻辑是纯本地函数
// （免费、实时计算、永不漂移），触发点埋在既有流程里（抽取完成 / 状态改为阻塞 / 新建会议）。
//
// 平台边界如实处理：页面不能直连第三方 http(s)，GitHub / Linear / Slack / 飞书的
// 「自动创建 / 自动通知」无法在本环境出货。落地形态是「本地产出标准格式草稿 +
// 一键复制 / 下载」，人到边界处按一次钮；RemoteWorkflowTarget 契约已预留，
// fork / 自托管注册在线目标后，同一批触发事件自动改为直推，UI 零改动。

import {
  actionStatusLabel,
  dueDayOffset,
  isOpenStatus,
  todayStr,
  type Meeting,
  type MeetingAction,
} from "@/lib/store"

// ── 工作流事件与远程目标（预留契约）──

export interface IssueDraft {
  actionId: string
  meetingId: string
  title: string
  body: string // Markdown，可直接粘进 GitHub / Linear 的 Issue 正文
}

export interface BlockNotification {
  actionId: string
  meetingId: string
  meetingTitle: string
  content: string
  assignee: string
  blockedDays: number
  text: string // 可直接粘进 Slack / 飞书的通知文案
}

export type WorkflowEvent =
  | { kind: "actions-extracted"; meetingId: string; meetingTitle: string; drafts: IssueDraft[] }
  | { kind: "decisions-recorded"; meetingId: string; meetingTitle: string; count: number }
  | { kind: "action-blocked"; notification: BlockNotification }
  | { kind: "meeting-created"; meetingId: string }

export interface RemoteWorkflowTarget {
  id: string
  label: string
  kind: "issue" | "notify" | "doc"
  runtime: "online"
  /** 消费一个工作流事件；fork 实现里在这里调 GitHub API / webhook */
  push: (event: WorkflowEvent) => Promise<void>
}

// 注册表：GitHub Issues / Linear / Slack / 飞书 webhook 等在线目标在 fork / 自托管里往这里加。
// 本环境为空——页面直连第三方被平台边界挡死，如实不装假目标。
export const REMOTE_WORKFLOW_TARGETS: RemoteWorkflowTarget[] = []

// 事件分发：触发点只管发事件，有在线目标就直推，没有就静默（草稿仍由 UI 本地消费）。
// 返回实际推送的目标数，调用方可据此告知用户。
export async function dispatchWorkflowEvent(event: WorkflowEvent): Promise<number> {
  let sent = 0
  for (const t of REMOTE_WORKFLOW_TARGETS) {
    try {
      await t.push(event)
      sent++
    } catch {
      // 单个目标失败不阻塞其余目标；失败详情由目标实现自行上报
    }
  }
  return sent
}

// ── 通用小件 ──

function ageDays(a: MeetingAction, m: Meeting): number {
  return Math.max(0, Math.floor((Date.now() - (a.createdAt ?? m.createdAt)) / 86_400_000))
}

function dueText(a: MeetingAction): string {
  if (!a.dueDate) return "未设截止日"
  const off = dueDayOffset(a.dueDate)
  if (off === null) return `截止 ${a.dueDate}`
  if (off < 0) return `截止 ${a.dueDate}（已逾期 ${-off} 天）`
  if (off === 0) return `截止 ${a.dueDate}（今天到期）`
  return `截止 ${a.dueDate}（剩 ${off} 天）`
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── 工作流 ①：行动项 → Issue 草稿包 ──
// 抽取 Agent 识别到行动项后自动备好草稿：标题 = 行动项本身，正文带 source_quote、
// 来源会议、负责人、截止与逾期状态——知识库里有的上下文全部随行，粘贴即建 Issue。

export function buildIssueDrafts(meetings: Meeting[]): IssueDraft[] {
  const out: IssueDraft[] = []
  const sorted = [...meetings].sort((a, b) => b.date.localeCompare(a.date))
  for (const m of sorted) {
    for (const a of m.actions) {
      if (!isOpenStatus(a.status) || !a.content.trim()) continue
      const lines = [
        `**来源会议**：《${m.title}》（${m.date}）`,
        `**负责人**：${a.assignee.trim() || "未指定"}`,
        `**时间要求**：${dueText(a)}`,
        `**当前状态**：${actionStatusLabel(a.status)}${ageDays(a, m) >= 14 ? `（已 ${ageDays(a, m)} 天没有进展）` : ""}`,
      ]
      if (a.sourceQuote.trim()) {
        lines.push("", "**原文依据**：", `> ${a.sourceQuote.trim()}`)
      }
      lines.push("", "---", "_由会议纪要工作台自动生成；出处可回会议档案核对原文。_")
      out.push({
        actionId: a.id,
        meetingId: m.id,
        title: a.content.trim().slice(0, 80),
        body: lines.join("\n"),
      })
    }
  }
  return out
}

export function downloadIssueDrafts(meetings: Meeting[]): number {
  const drafts = buildIssueDrafts(meetings)
  if (drafts.length === 0) return 0
  const parts = [
    `# Issue 草稿包`,
    "",
    `> 生成于 ${new Date().toLocaleString("zh-CN")} · 共 ${drafts.length} 条未完成行动项`,
    "> 每块草稿的标题与正文可直接粘贴到 GitHub / Linear 等系统的建 Issue 表单；正文自带原文依据与来源会议。",
    "",
  ]
  drafts.forEach((d, i) => {
    parts.push(`## ${i + 1}. ${d.title}`, "", d.body, "")
  })
  downloadText(`issue-drafts-${todayStr()}.md`, parts.join("\n"))
  return drafts.length
}

// ── 工作流 ②：阻塞项 → 通知文案 ──
// 行动项被标记「阻塞」的那一刻起，这里自动生成给负责人的通知文案（含卡住天数、
// 截止与逾期、来源会议）——复制即发。webhook 直推走上面的 RemoteWorkflowTarget 预留位。

export function buildBlockNotifications(meetings: Meeting[]): BlockNotification[] {
  const out: BlockNotification[] = []
  for (const m of meetings) {
    for (const a of m.actions) {
      if (a.status !== "blocked" || !a.content.trim()) continue
      const days = ageDays(a, m)
      const who = a.assignee.trim() ? `@${a.assignee.trim()} ` : ""
      const text =
        `${who}「${a.content.trim()}」已阻塞 ${days} 天` +
        `（来源：《${m.title}》${m.date}；${dueText(a)}）。` +
        `请协调解决阻塞，或改派 / 调整截止日；若已不再需要请明确取消。`
      out.push({
        actionId: a.id,
        meetingId: m.id,
        meetingTitle: m.title,
        content: a.content.trim(),
        assignee: a.assignee.trim(),
        blockedDays: days,
        text,
      })
    }
  }
  return out.sort((x, y) => y.blockedDays - x.blockedDays)
}

// ── 工作流 ③：新会议 → 会前简报（自动从知识库拉取）──
// 新建会议（转写还是空的）时自动组装：同系列历史会议概况、未结行动项（谁、何时到期、
// 是否逾期/久未动）、最近决议、当前阻塞——上次会议的遗留问题在开会前就摆在眼前。

export interface BriefingAction {
  content: string
  assignee: string
  dueDate: string
  status: string
  overdue: boolean
  stalledDays: number // ≥14 才有值意义，UI 按此标「久未动」
}

export interface BriefingMeeting {
  id: string
  title: string
  date: string
  brief: string
  openActions: BriefingAction[]
  decisions: string[] // 最近 ≤3 条决议
}

export interface PreMeetingBriefing {
  seriesLabel: string
  meetings: BriefingMeeting[] // 同系列历史会议，新→旧，≤3 场
  blocked: (BriefingAction & { fromTitle?: string })[] // 系列内当前阻塞项（跨会议汇总）
  empty: boolean // 档案里还没有相关历史（新系列第一场会）
}

export function buildPreMeetingBriefing(meeting: Meeting, meetings: Meeting[]): PreMeetingBriefing {
  const sid = typeof meeting.seriesId === "string" ? meeting.seriesId.trim() : ""
  const kin = meetings.filter(
    (x) =>
      x.id !== meeting.id &&
      ((sid && x.seriesId === sid) ||
        (!sid && meeting.tags.length > 0 && x.tags.some((t) => meeting.tags.includes(t)))),
  )
  const seriesLabel = sid || meeting.tags[0] || ""
  if (kin.length === 0) {
    return { seriesLabel, meetings: [], blocked: [], empty: true }
  }
  const recent = kin.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
  const briefs: BriefingMeeting[] = recent.map((m) => ({
    id: m.id,
    title: m.title,
    date: m.date,
    brief: m.brief?.content ?? "",
    openActions: m.actions
      .filter((a) => isOpenStatus(a.status) && a.content.trim())
      .map((a) => {
        const off = dueDayOffset(a.dueDate)
        return {
          content: a.content.trim(),
          assignee: a.assignee.trim(),
          dueDate: a.dueDate,
          status: actionStatusLabel(a.status),
          overdue: off !== null && off < 0,
          stalledDays: ageDays(a, m),
        }
      }),
    decisions: m.decisions
      .filter((d) => d.content.trim() && !d.supersededBy)
      .slice(-3)
      .map((d) => d.content.trim()),
  }))
  const blocked = kin
    .flatMap((m) =>
      m.actions
        .filter((a) => a.status === "blocked" && a.content.trim())
        .map((a) => {
          const off = dueDayOffset(a.dueDate)
          return {
            content: a.content.trim(),
            assignee: a.assignee.trim(),
            dueDate: a.dueDate,
            status: actionStatusLabel(a.status),
            overdue: off !== null && off < 0,
            stalledDays: ageDays(a, m),
            fromTitle: m.title,
          }
        }),
    )
    .sort((x, y) => y.stalledDays - x.stalledDays)
  return { seriesLabel, meetings: briefs, blocked, empty: false }
}

// ── 工作流 ④：决议 → 决策日志（自动同步进知识库导出物）──
// 按时间倒序的全量决策记录：内容、来源会议与日期、原文依据、被取代标注（含新决议去向）。
// 实时从档案编译（不落盘、无漂移），既供单独下载，也自动并入 Markdown 知识库合集。

export function buildDecisionLog(meetings: Meeting[]): string {
  const entries: {
    date: string
    title: string
    meetingId: string
    content: string
    quote: string
    supersededBy?: { meetingId: string; decisionId: string }
  }[] = []
  for (const m of meetings) {
    for (const d of m.decisions) {
      if (!d.content.trim()) continue
      entries.push({
        date: m.date,
        title: m.title,
        meetingId: m.id,
        content: d.content.trim(),
        quote: d.sourceQuote.trim(),
        ...(d.supersededBy ? { supersededBy: d.supersededBy } : {}),
      })
    }
  }
  entries.sort((a, b) => b.date.localeCompare(a.date))
  const successorText = (s: { meetingId: string; decisionId: string }): string => {
    const m = meetings.find((x) => x.id === s.meetingId)
    const d = m?.decisions.find((x) => x.id === s.decisionId)
    if (!m || !d) return "（新决议已不在档案中）"
    return `《${m.title}》（${m.date}）：「${d.content.trim()}」`
  }

  const lines = [
    "# 决策日志",
    "",
    `> 自动汇编自 ${meetings.length} 场会议档案 · 生成于 ${new Date().toLocaleString("zh-CN")}`,
    "> 已被取代的决议保留原文并标注去向——决策的历史也是知识。",
    "",
  ]
  let month = ""
  for (const e of entries) {
    const m = e.date.slice(0, 7) || "未知日期"
    if (m !== month) {
      month = m
      lines.push(`## ${month}`, "")
    }
    lines.push(`- **${e.content}**`)
    lines.push(`  - 出自：《${e.title}》（${e.date}）`)
    if (e.quote) lines.push(`  - 原文依据：「${e.quote}」`)
    if (e.supersededBy) {
      lines.push(`  - ⚠️ 已被取代 → ${successorText(e.supersededBy)}`)
    }
  }
  if (entries.length === 0) {
    lines.push("（档案里还没有记录在案的决议）")
  }
  return lines.join("\n")
}

export function downloadDecisionLog(meetings: Meeting[]): number {
  const count = meetings.reduce((n, m) => n + m.decisions.filter((d) => d.content.trim()).length, 0)
  downloadText(`decision-log-${todayStr()}.md`, buildDecisionLog(meetings))
  return count
}
