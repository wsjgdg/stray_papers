// 问答自路由（按查询复杂度选择处理策略）：
//
// 并非所有问题都值得走「召回 → 重排 → LLM 综合」的完整 RAG 管线。
// 「老王手上有哪些没完成的事」「X 谁负责」「这次定了哪些决议」这类**结构化事实查询**，
// 答案就在行动项 / 决议的结构化字段里——本地直答：零费用、毫秒级、100% 忠实
// （直接读用户数据，不存在模型改写引入的失真）。
//
// 路由是「规则分类器」而非小模型（诚实说明取舍）：
// - 查询意图的类别是封闭的（负责人 / 未完成清单 / 截止日 / 决议 / 状态），规则可枚举；
// - 规则分类零成本零延迟，且判定过程可解释（UI 上能说出「为什么没走 AI」）；
// - 保守原则：**拿不准就路由去 RAG**。规则只在「模式命中 且 结构化数据里确有答案」
//   时才直答，误判代价 = 用户多等一次模型调用，而不是拿到错误答案。
//
// 复杂综合类问题（演进 / 对比 / 为什么 / 趋势）显式强制走 RAG——
// 这类问题需要跨会议综合与原文引用，结构化字段装不下。

import { isOpenStatus, type Meeting, type MeetingAction } from "@/lib/store"

export type QaRoute =
  | { route: "structured"; answer: string; kind: string }
  | { route: "rag" }

// 复杂综合意图：命中即强制 RAG，不进结构化直答
const COMPLEX_RE =
  /(为什么|为何|演进|演变|趋势|脉络|对比|比较|异同|总结|归纳|综合|规律|教训|整体|全部会议|所有会议|怎么回事|前因后果|时间线)/

// 结构化意图模式（按判定优先级排列）
const WHO_RE = /(谁|何人|哪位)(负责|跟进|来做|牵头|认领|owner)/
const WHO_FOR_RE = /(负责|跟进|牵头)(人|者)?是?谁/
const OPEN_LIST_RE = /(手上|名下|负责|待办|未完成|没完成|没有完成|没做完|open).*(哪些|什么|清单|列表|事项|事情|任务|行动项)|(哪些|什么).*(未完成|没完成|待办|没做完).*?(事|任务|行动项)?/
const DUE_RE = /(什么时候|何时|哪天)(截止|到期|交付|完成)|截止(时间|日期)|due|deadline/
const DECISION_RE = /(定了|通过|拍板|做出).*(哪些|什么).*决议|决议(有哪些|清单|列表)|哪些决议/
const STATUS_RE = /(完成|做完|进展|状态)(了)?(吗|没有|没|如何|怎样)/

// 行动项状态的中文口径（与 ACTION_STATUSES 展示一致）
const STATUS_LABEL: Record<MeetingAction["status"], string> = {
  open: "提出",
  doing: "进行中",
  blocked: "阻塞",
  done: "完成",
  cancelled: "取消",
}

// 疑问词/停用词剥离后剩下的实义片段，用于行动项内容匹配
const STOP_WORDS =
  /(的|了|吗|呢|吧|啊|有哪些|有什么|哪些|什么时候|何时|哪天|什么|是谁|谁|请问|帮我|看下|看看|一下|现在|目前|最近|上次|手上|名下|未完成|没完成|没有完成|待办|负责|跟进|牵头|截止|到期|交付|状态|进展|完成|决议|定了|通过|行动项|任务|事情|事项|清单|列表)/g

function contentKeywords(question: string, person: string): string[] {
  const stripped = question
    .replace(STOP_WORDS, " ")
    .replace(person, " ")
    .replace(/[？?！!。，,、\s]+/g, " ")
    .trim()
  return stripped.split(" ").filter((w) => w.length >= 2).slice(0, 4)
}

function fmtAction(a: MeetingAction, m: Meeting): string {
  const bits = [`- ${a.content}`, `[${STATUS_LABEL[a.status] ?? a.status}]`]
  if (a.assignee) bits.push(`负责人：${a.assignee}`)
  if (a.dueDate) bits.push(`截止：${a.dueDate}`)
  bits.push(`（《${m.title}》${m.date}）`)
  return bits.join(" ")
}

// 全库行动项（连同所属会议）；只要未取消的
function allActions(meetings: Meeting[]): { a: MeetingAction; m: Meeting }[] {
  const out: { a: MeetingAction; m: Meeting }[] = []
  for (const m of meetings) {
    for (const a of m.actions) {
      if (a.status !== "cancelled" && a.content.trim()) out.push({ a, m })
    }
  }
  return out
}

// 已知负责人名单（结构化数据里真实出现过的 assignee）——人名识别不猜，只认名单内的
function knownAssignees(meetings: Meeting[]): string[] {
  const set = new Set<string>()
  for (const m of meetings) {
    for (const a of m.actions) if (a.assignee.trim()) set.add(a.assignee.trim())
  }
  return [...set]
}

const MAX_LIST = 15 // 直答清单上限：超过说明问题该走 RAG 综合（或用户该去跟进中心看全量）

export function classifyQuery(question: string, meetings: Meeting[]): QaRoute {
  const q = question.trim()
  if (!q || q.length > 80 || COMPLEX_RE.test(q)) return { route: "rag" }
  const acts = allActions(meetings)
  if (acts.length === 0) return { route: "rag" }
  const people = knownAssignees(meetings)
  // 问题里出现的最长已知人名（「老王」优于「王」——名单内前缀包含时取最长）
  const person = people
    .filter((p) => q.includes(p))
    .sort((a, b) => b.length - a.length)[0] ?? ""

  // 1) 「X 手上有哪些没完成的事」类：人名 + 未完成清单
  if (person && OPEN_LIST_RE.test(q)) {
    const open = acts.filter(
      ({ a }) => a.assignee === person && isOpenStatus(a.status),
    )
    if (open.length === 0) {
      return {
        route: "structured",
        kind: "person-open-actions",
        answer: `${person} 名下没有未完成的行动项（结构化数据直查，未调用 AI；全部 ${acts.filter(({ a }) => a.assignee === person).length} 条里均已完成或取消）。`,
      }
    }
    if (open.length > MAX_LIST) return { route: "rag" }
    return {
      route: "structured",
      kind: "person-open-actions",
      answer: `${person} 名下共 ${open.length} 条未完成行动项（按截止日排序）：\n${open
        .sort((x, y) => (x.a.dueDate || "9999").localeCompare(y.a.dueDate || "9999"))
        .map(({ a, m }) => fmtAction(a, m))
        .join("\n")}`,
    }
  }

  // 2) 「谁负责 X」：内容关键词 → 命中行动项的负责人
  if (WHO_RE.test(q) || WHO_FOR_RE.test(q)) {
    const kws = contentKeywords(q, person)
    if (kws.length === 0) return { route: "rag" }
    const hits = acts.filter(({ a }) => kws.some((k) => a.content.includes(k)))
    if (hits.length === 0 || hits.length > MAX_LIST) return { route: "rag" }
    const lines = hits.map(({ a, m }) =>
      `- 「${a.content}」→ ${a.assignee || "（未指定负责人）"} [${STATUS_LABEL[a.status] ?? a.status}]（《${m.title}》${m.date}）`,
    )
    return {
      route: "structured",
      kind: "who-owns",
      answer: `按关键词「${kws.join("、")}」在行动项里找到 ${hits.length} 条：\n${lines.join("\n")}`,
    }
  }

  // 3) 「X 什么时候截止」：关键词 → 命中行动项的截止日
  if (DUE_RE.test(q)) {
    const kws = contentKeywords(q, person)
    const hits = (kws.length > 0
      ? acts.filter(({ a }) => kws.some((k) => a.content.includes(k)))
      : person
        ? acts.filter(({ a }) => a.assignee === person)
        : []
    ).filter(({ a }) => a.dueDate && isOpenStatus(a.status))
    if (hits.length === 0 || hits.length > MAX_LIST) return { route: "rag" }
    return {
      route: "structured",
      kind: "due-lookup",
      answer: `找到 ${hits.length} 条带截止日的未完成行动项（按截止日排序）：\n${hits
        .sort((x, y) => x.a.dueDate.localeCompare(y.a.dueDate))
        .map(({ a, m }) => fmtAction(a, m))
        .join("\n")}`,
    }
  }

  // 4) 「定了哪些决议」：全库决议清单（近会优先）
  if (DECISION_RE.test(q)) {
    const decisions: { content: string; m: Meeting }[] = []
    for (const m of [...meetings].sort((a, b) => b.date.localeCompare(a.date))) {
      for (const d of m.decisions) {
        if (d.content.trim()) decisions.push({ content: d.content.trim(), m })
      }
    }
    if (decisions.length === 0) return { route: "rag" }
    const shown = decisions.slice(0, MAX_LIST)
    return {
      route: "structured",
      kind: "decision-list",
      answer: `全库共 ${decisions.length} 条决议${decisions.length > shown.length ? `，按时间倒序列出最近 ${shown.length} 条` : ""}：\n${shown
        .map((d) => `- ${d.content}（《${d.m.title}》${d.m.date}）`)
        .join("\n")}`,
    }
  }

  // 5) 「X 完成了吗 / 进展如何」：关键词 → 命中行动项的状态
  if (STATUS_RE.test(q)) {
    const kws = contentKeywords(q, person)
    if (kws.length === 0) return { route: "rag" }
    const hits = acts.filter(({ a }) => kws.some((k) => a.content.includes(k)))
    if (hits.length === 0 || hits.length > MAX_LIST) return { route: "rag" }
    return {
      route: "structured",
      kind: "status-lookup",
      answer: `按关键词「${kws.join("、")}」找到 ${hits.length} 条行动项：\n${hits
        .map(({ a, m }) => fmtAction(a, m))
        .join("\n")}`,
    }
  }

  return { route: "rag" }
}
