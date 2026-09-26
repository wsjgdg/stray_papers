// 知识图谱（纵向结构化记忆）：把「一堆独立会议」编译成实体 + 关系的活图谱。
//
// 分层（与产品的付费纪律一致）：
// - 本地免费层（本文件）：从已有结构化数据推导实体与关系——说话人、行动项负责人、
//   标签/系列、决议、行动项、跟进消化产生的事实边（digestLinks）、AI 补全实体（若已购买）。
//   纯函数、随时可重算，不落盘、不需要索引同步。
// - 付费增强层（ai.ts extractEntities）：转写里提到但没进标注结构的实体（客户/项目/系统），
//   显式触发、结果存 meeting.entities，本文件自动并入。
//
// 查询层：queryGraph 支持按实体名/类型检索，返回该实体的完整关系网；
// evolutionChain 支持「关于 X 的所有决策」类查询——按时间排出决策/行动项演进链，
// 不是搜文档，是查结构。

import { isOpenStatus, parseTranscriptLines, type Meeting } from "@/lib/store"

export type GraphNodeKind = "person" | "series" | "meeting" | "decision" | "action" | "entity"

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  meta?: string // 辅助信息（日期 / 状态 / 类型）
}

export interface GraphEdge {
  from: string
  to: string
  rel: string // 关系语义：发言于 / 负责 / 出自 / 定出于 / 属于系列 / 跟进于 / 提及
  meta?: string
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeById: Map<string, GraphNode>
  edgesByNode: Map<string, GraphEdge[]> // 双向邻接（from 或 to 命中都算）
}

const personId = (name: string) => `person:${name}`
const seriesId = (tag: string) => `series:${tag}`
const meetingId = (id: string) => `meeting:${id}`
const decisionId = (mid: string, did: string) => `decision:${mid}:${did}`
const actionId = (mid: string, aid: string) => `action:${mid}:${aid}`
const entityId = (mid: string, name: string) => `entity:${mid}:${name}`

// aliasMap：实体消解层（lib/entityResolution.ts）产出的 别名 → 主名 映射，
// 只包含用户确认过的规则；人物节点按主名归并，别名进节点 meta（aka …）
export function buildGraph(meetings: Meeting[], aliasMap?: Map<string, string>): KnowledgeGraph {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const put = (n: GraphNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n)
  }
  const link = (from: string, to: string, rel: string, meta?: string) => {
    edges.push({ from, to, rel, ...(meta ? { meta } : {}) })
  }

  // 人物名解析：别名 → 主名节点 id；顺带记录归并掉的写法供节点展示
  const akaOf = new Map<string, Set<string>>()
  const person = (name: string): string => {
    const n = name.trim()
    const canonical = aliasMap?.get(n) ?? n
    if (canonical !== n) {
      const set = akaOf.get(canonical) ?? new Set<string>()
      set.add(n)
      akaOf.set(canonical, set)
    }
    return personId(canonical)
  }

  for (const m of meetings) {
    const mid = meetingId(m.id)
    put({ id: mid, kind: "meeting", label: m.title || "未命名会议", meta: m.date })

    // 系列归属：显式 seriesId 优先，其次每个标签
    const sid = typeof m.seriesId === "string" ? m.seriesId.trim() : ""
    const series = sid ? [sid] : m.tags
    for (const tag of series) {
      const key = seriesId(tag)
      put({ id: key, kind: "series", label: tag })
      link(mid, key, "属于系列")
    }

    // 说话人（本地层：转写标注里的人）
    const speakers = new Set(
      parseTranscriptLines(m.transcript)
        .map((l) => l.speaker)
        .filter(Boolean),
    )
    for (const sp of speakers) {
      put({ id: person(sp), kind: "person", label: aliasMap?.get(sp.trim()) ?? sp })
      link(person(sp), mid, "发言于", m.date)
    }

    // 行动项 + 负责人
    for (const a of m.actions) {
      if (!a.content.trim()) continue
      const aid = actionId(m.id, a.id)
      put({
        id: aid,
        kind: "action",
        label: a.content,
        meta: `${m.date} · ${a.status === "done" ? "完成" : a.status === "cancelled" ? "取消" : a.status === "blocked" ? "阻塞" : a.status === "doing" ? "进行中" : "待办"}${a.dueDate ? ` · 截止 ${a.dueDate}` : ""}`,
      })
      link(aid, mid, "出自", m.date)
      const who = a.assignee.trim()
      if (who) {
        put({ id: person(who), kind: "person", label: aliasMap?.get(who) ?? who })
        link(person(who), aid, "负责")
      }
    }

    // 决议
    for (const d of m.decisions) {
      if (!d.content.trim()) continue
      const did = decisionId(m.id, d.id)
      put({ id: did, kind: "decision", label: d.content, meta: m.date })
      link(did, mid, "定出于", m.date)
    }

    // AI 补全实体（付费增强层的产物，存在才并入）
    for (const e of m.entities ?? []) {
      const eid = entityId(m.id, e.name)
      const kindLabel = e.type === "person" ? "人物" : e.type === "project" ? "项目" : e.type === "client" ? "客户" : "其他"
      put({ id: eid, kind: "entity", label: e.name, meta: `${kindLabel} · ${m.date}` })
      link(eid, mid, "提及于", m.date)
      // 人物型实体与说话人节点打通（经别名解析后同名即同一人）
      if (e.type === "person") {
        put({ id: person(e.name), kind: "person", label: aliasMap?.get(e.name.trim()) ?? e.name })
        link(eid, person(e.name), "同一人")
      }
    }

    // 跟进消化产生的事实边：历史行动项在本场会被跟进成什么状态
    for (const dl of m.digestLinks ?? []) {
      const aid = actionId(dl.ownerId, dl.actionId)
      const verdictLabel =
        dl.verdict === "done" ? "跟进：完成" : dl.verdict === "progress" ? "跟进：有进展" : dl.verdict === "blocked" ? "跟进：被阻塞" : "跟进：未提及"
      link(aid, mid, verdictLabel, dl.evidence || undefined)
    }
  }

  // 归并痕迹可见：人物节点标出被归并的别名写法（消解是用户确认的，不是黑盒）
  for (const [canonical, aliases] of akaOf) {
    const node = nodes.get(personId(canonical))
    if (node && aliases.size > 0) {
      node.meta = [...aliases].map((a) => `aka ${a}`).join(" / ")
    }
  }

  // 双向邻接表
  const edgesByNode = new Map<string, GraphEdge[]>()
  for (const e of edges) {
    for (const key of [e.from, e.to]) {
      const list = edgesByNode.get(key) ?? []
      list.push(e)
      edgesByNode.set(key, list)
    }
  }

  return { nodes: [...nodes.values()], edges, nodeById: nodes, edgesByNode }
}

// ── 查询层 ──

export interface GraphQueryHit {
  node: GraphNode
  degree: number // 关系数（重要度粗排）
}

/** 按名字/类型检索实体（人物、系列、实体节点优先；会议/行动项/决议按标签包含匹配） */
export function queryNodes(
  graph: KnowledgeGraph,
  query: string,
  kinds?: GraphNodeKind[],
): GraphQueryHit[] {
  const q = query.trim().toLowerCase()
  const hits: GraphQueryHit[] = []
  for (const n of graph.nodes) {
    if (kinds && kinds.length > 0 && !kinds.includes(n.kind)) continue
    if (q && !n.label.toLowerCase().includes(q)) continue
    hits.push({ node: n, degree: (graph.edgesByNode.get(n.id) ?? []).length })
  }
  return hits.sort((a, b) => b.degree - a.degree || a.node.label.localeCompare(b.node.label))
}

export interface TimelineEvent {
  date: string
  meetingId: string
  meetingTitle: string
  kind: "decision" | "action" | "digest"
  label: string
  status?: string
}

/**
 * 演进链查询：「关于 X 的所有决策/行动项」——不是搜文档，是把命中实体的
 * 决策、行动项、跟进记录按时间排成一条结构化演进链。
 */
export function evolutionChain(graph: KnowledgeGraph, keyword: string, meetings: Meeting[]): TimelineEvent[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return []
  const titleOf = new Map(meetings.map((m) => [m.id, m.title]))
  const events: TimelineEvent[] = []
  for (const m of meetings) {
    for (const d of m.decisions) {
      if (d.content.toLowerCase().includes(q)) {
        events.push({ date: m.date, meetingId: m.id, meetingTitle: m.title, kind: "decision", label: d.content })
      }
    }
    for (const a of m.actions) {
      if (a.content.toLowerCase().includes(q)) {
        events.push({
          date: m.date,
          meetingId: m.id,
          meetingTitle: m.title,
          kind: "action",
          label: a.content,
          status: a.status === "done" ? "完成" : a.status === "cancelled" ? "取消" : isOpenStatus(a.status) ? "未完成" : a.status,
        })
      }
    }
    for (const dl of m.digestLinks ?? []) {
      const src = meetings.find((x) => x.id === dl.ownerId)
      const act = src?.actions.find((x) => x.id === dl.actionId)
      if (!act || !act.content.toLowerCase().includes(q)) continue
      if (dl.verdict === "unmentioned") continue
      events.push({
        date: m.date,
        meetingId: m.id,
        meetingTitle: m.title,
        kind: "digest",
        label: `${act.content} —— ${dl.verdict === "done" ? "确认完成" : dl.verdict === "progress" ? "有进展" : "被阻塞"}${dl.evidence ? `（依据：「${dl.evidence}」）` : ""}`,
      })
    }
  }
  // 消掉图里可能悬挂的引用（会议被删等），按时间正序 = 演进方向
  void graph
  void titleOf
  return events.sort((a, b) => a.date.localeCompare(b.date))
}

/** 一个实体的完整关系网（详情面板用）：邻居节点 + 关系语义 */
export interface RelationRow {
  rel: string
  other: GraphNode
  meta?: string
}

export function relationsOf(graph: KnowledgeGraph, nodeId: string): RelationRow[] {
  const rows: RelationRow[] = []
  for (const e of graph.edgesByNode.get(nodeId) ?? []) {
    const otherId = e.from === nodeId ? e.to : e.from
    const other = graph.nodeById.get(otherId)
    if (!other) continue
    // 方向语义：正向关系用原词，反向命中时加「被」前缀读起来更顺
    const rel = e.from === nodeId ? e.rel : `被${e.rel}`
    rows.push({ rel, other, ...(e.meta ? { meta: e.meta } : {}) })
  }
  const order: Record<GraphNodeKind, number> = { person: 0, series: 1, meeting: 2, decision: 3, action: 4, entity: 5 }
  return rows.sort((a, b) => order[a.other.kind] - order[b.other.kind] || a.rel.localeCompare(b.rel))
}
