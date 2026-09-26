// 修正模式分析：把 editLog 里的用户修正事件聚合成「生成质量信号」——
// 不等用户抱怨，让数据指出该调什么：
// - 某议题反复被改 → 该类议题生成不稳定，可在会议模板里加组织指令；
// - 行动项删除率高 → 抽取过激，可调置信度门槛；手动补充多 → 抽取有漏；
// - 转写修正以替换为主 → 同音错字多（热词表可救）；以删除为主 → 识别丢词；
//   行数/说话人改动多 → 断句与说话人分离是短板；
// - 某会议类型修正率显著偏高 → 该场景 ASR/生成能力不足。
// 纯本地聚合，免费实时计算；结论只是提示，改不改、怎么改由用户决定。

import type { Meeting, MeetingTemplate } from "@/lib/store"
import type { EditEvent } from "@/lib/editLog"

export interface TranscriptQuality {
  sessions: number // 修正会话数（一次连续编辑算一次）
  editChars: number // 修正涉及的内容字符总量
  baseChars: number // 被修正会议的转写总字数（分母）
  rate: number // editChars / baseChars
  subs: number // 替换字符（≈同音错字修正）
  inserts: number // 补进的字符
  deletes: number // 删掉的字符
  punctSessions: number // 只动标点/空白的会话数
  segmentSessions: number // 动了断句/分段的会话数
  speakerSessions: number // 动了说话人标注的会话数
  byKind: { kind: string; rate: number; sessions: number; baseChars: number }[] // 按会议类型
}

export interface SummaryQuality {
  briefEdits: number
  outlineEdits: number
  hotTopics: { topic: string; count: number }[] // 反复被手改的议题（降序，≤5）
}

export interface ActionQuality {
  aiOpen: number // 当前档案里 AI 抽取且未被手改的行动项数（删除率分母的一部分）
  deleted: number
  addedManually: number
  pendingRejected: number
  pendingAccepted: number
  deleteRate: number // deleted / (deleted + aiOpen)
  recentDeleted: string[] // 最近删除的条目内容（示例 ≤5）
}

export interface QualityInsight {
  level: "warn" | "info"
  text: string
}

export interface QualityReport {
  events: number
  oldestAt: number | null // 日志覆盖的起点（判断样本量是否够下结论）
  transcript: TranscriptQuality | null
  summary: SummaryQuality
  actions: ActionQuality
  polishUndos: number
  insights: QualityInsight[]
}

const pct = (x: number): string => `${Math.round(x * 100)}%`

export function analyzeQuality(
  events: EditEvent[],
  meetings: Meeting[],
  templates: MeetingTemplate[],
): QualityReport {
  const kindLabel = (id: string): string =>
    templates.find((t) => t.id === id)?.label || id || "未选模板"

  // ── 转写修正率 ──
  const tEvents = events.filter((e) => e.target === "transcript" && e.profile)
  let transcript: TranscriptQuality | null = null
  if (tEvents.length > 0) {
    const touched = new Set(tEvents.map((e) => e.meetingId))
    const baseChars = meetings
      .filter((m) => touched.has(m.id))
      .reduce((n, m) => n + m.transcript.length, 0)
    const editChars = tEvents.reduce(
      (n, e) => n + (e.profile?.inserts ?? 0) + (e.profile?.deletes ?? 0) + (e.profile?.subs ?? 0),
      0,
    )
    // 按会议类型分桶（分子 = 该类型会议的修正字符，分母 = 该类型全部会议转写字数）
    const byKindMap = new Map<string, { chars: number; sessions: number }>()
    for (const e of tEvents) {
      const k = e.meetingKind
      const cur = byKindMap.get(k) ?? { chars: 0, sessions: 0 }
      cur.chars += (e.profile?.inserts ?? 0) + (e.profile?.deletes ?? 0) + (e.profile?.subs ?? 0)
      cur.sessions += 1
      byKindMap.set(k, cur)
    }
    const baseByKind = new Map<string, number>()
    for (const m of meetings) {
      const k = m.meetingKind ?? ""
      baseByKind.set(k, (baseByKind.get(k) ?? 0) + m.transcript.length)
    }
    const byKind = [...byKindMap.entries()]
      .map(([k, v]) => ({
        kind: kindLabel(k),
        rate: (baseByKind.get(k) ?? 0) > 0 ? v.chars / (baseByKind.get(k) as number) : 0,
        sessions: v.sessions,
        baseChars: baseByKind.get(k) ?? 0,
      }))
      .sort((a, b) => b.rate - a.rate)
    transcript = {
      sessions: tEvents.length,
      editChars,
      baseChars,
      rate: baseChars > 0 ? editChars / baseChars : 0,
      subs: tEvents.reduce((n, e) => n + (e.profile?.subs ?? 0), 0),
      inserts: tEvents.reduce((n, e) => n + (e.profile?.inserts ?? 0), 0),
      deletes: tEvents.reduce((n, e) => n + (e.profile?.deletes ?? 0), 0),
      segmentSessions: tEvents.filter((e) => (e.profile?.linesDelta ?? 0) > 0).length,
      speakerSessions: tEvents.filter((e) => (e.profile?.speakersChanged ?? 0) > 0).length,
      punctSessions: tEvents.filter((e) => e.profile?.punctOnly === true).length,
      byKind,
    }
  }

  // ── 摘要修正与热点议题 ──
  const topicCounts = new Map<string, number>()
  for (const e of events) {
    if (e.target !== "outline" || !e.detail) continue
    for (const name of e.detail.split("、")) {
      const t = name.trim()
      if (t) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1)
    }
  }
  const summary: SummaryQuality = {
    briefEdits: events.filter((e) => e.target === "brief").length,
    outlineEdits: events.filter((e) => e.target === "outline").length,
    hotTopics: [...topicCounts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .filter((t) => t.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  }

  // ── 行动项修正模式 ──
  const deletedEvents = events.filter((e) => e.target === "action-delete")
  const aiOpen = meetings.reduce(
    (n, m) => n + m.actions.filter((a) => a.sourceQuote.trim() && !a.editedByUser).length,
    0,
  )
  const deleted = deletedEvents.length
  const actions: ActionQuality = {
    aiOpen,
    deleted,
    addedManually: events.filter((e) => e.target === "action-add").length,
    pendingRejected: events.filter((e) => e.target === "pending-reject").length,
    pendingAccepted: events.filter((e) => e.target === "pending-accept").length,
    deleteRate: deleted + aiOpen > 0 ? deleted / (deleted + aiOpen) : 0,
    recentDeleted: deletedEvents
      .slice(0, 5)
      .map((e) => e.detail || e.before || "")
      .filter(Boolean),
  }

  const polishUndos = events.filter((e) => e.target === "polish-undo").length

  // ── 可操作结论（阈值刻意保守：宁可少说，不说空话）──
  const insights: QualityInsight[] = []
  if (transcript && transcript.sessions >= 3) {
    const total = transcript.subs + transcript.inserts + transcript.deletes
    if (total >= 30) {
      const subShare = transcript.subs / total
      const delShare = transcript.deletes / total
      if (subShare >= 0.5) {
        insights.push({
          level: "warn",
          text: `转写修正以同音错字替换为主（占 ${pct(subShare)}）——识别引擎没有热词注入口，但历史档案积累的专有名词词表会在「补标点分段」时自动校正写法；高频错词也可考虑加入会议标题/标签让词表更快命中`,
        })
      } else if (delShare >= 0.4) {
        insights.push({
          level: "warn",
          text: `转写修正以删字为主（占 ${pct(delShare)}）——识别结果常有多字/重复，注意该场景是否有重叠发言或噪声；重要会议可考虑粘贴书面稿`,
        })
      }
    }
    if (transcript.byKind.length >= 2) {
      const worst = transcript.byKind[0]
      const others = transcript.byKind.slice(1)
      const otherRate =
        others.reduce((n, k) => n + k.rate * k.baseChars, 0) /
        Math.max(1, others.reduce((n, k) => n + k.baseChars, 0))
      if (worst.rate > 0.05 && worst.rate > otherRate * 1.8) {
        insights.push({
          level: "warn",
          text: `「${worst.kind}」类会议的转写修正率（${pct(worst.rate)}）显著高于其他类型（${pct(otherRate)}）——该场景下识别或转写质量偏弱，生成结论请多留意核对`,
        })
      }
    }
    if (transcript.speakerSessions >= Math.max(3, Math.ceil(transcript.sessions * 0.5))) {
      insights.push({
        level: "info",
        text: `${transcript.speakerSessions}/${transcript.sessions} 次转写修正动了说话人标注——实时转写不区分人声，长会建议边说边点选「现在谁在说」，或用「智能标注」批量推断`,
      })
    }
  }
  for (const t of summary.hotTopics.slice(0, 2)) {
    insights.push({
      level: "warn",
      text: `议题「${t.topic}」被你手改过 ${t.count} 次——这类议题的生成不稳定，可在对应会议模板的提示语里补充它的组织要求（设置 → 会议模板）`,
    })
  }
  if (actions.deleted + actions.aiOpen >= 8 && actions.deleteRate >= 0.3) {
    insights.push({
      level: "warn",
      text: `${pct(actions.deleteRate)} 的 AI 行动项被你删除——抽取偏激进，可在设置里调高置信度门槛，或给抽取 Agent 加附加指令（如「只抽明确指派给某人的事项」）`,
    })
  }
  if (actions.addedManually >= 3) {
    insights.push({
      level: "info",
      text: `你手动补充过 ${actions.addedManually} 条行动项——抽取可能漏掉了某类承诺（常见于没有明确负责人的事项），可给抽取 Agent 加附加指令强调这类内容`,
    })
  }
  if (actions.pendingRejected >= 3 && actions.pendingRejected > actions.pendingAccepted) {
    insights.push({
      level: "info",
      text: `待确认队列里你放弃了 ${actions.pendingRejected} 条、采纳了 ${actions.pendingAccepted} 条——模型自评的不确定大多是真的不确定，当前置信度分流在工作`,
    })
  }
  if (polishUndos >= 2) {
    insights.push({
      level: "warn",
      text: `「补标点分段」的整理稿被你还原过 ${polishUndos} 次——若保真校验面板频繁报疑似改写，可在标注 Agent 的附加指令里进一步收紧（如「逐句原样保留，只加标点」）`,
    })
  }
  if (insights.length === 0 && events.length >= 5) {
    insights.push({
      level: "info",
      text: "修正信号都在健康范围内——继续正常使用，这里会随着你的修改自动积累证据",
    })
  }

  return {
    events: events.length,
    oldestAt: events.length > 0 ? events[events.length - 1].at : null,
    transcript,
    summary,
    actions,
    polishUndos,
    insights,
  }
}
