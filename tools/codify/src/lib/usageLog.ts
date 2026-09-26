// AI 调用账本：每次付费调用记录一条（模型、降级、耗时、token 用量、归属会议），
// 供设置页做「按服务商 / 按会议 / 按时间」的消耗聚合与降级可观测性。
// 纯本地 localStorage（上限 500 条滚动淘汰）；token 数是计费依据的参考，
// 具体金额以 RunningHub 账单为准——这里不虚构价格。

import { AGENT_OF_KIND, type AgentRole } from "@/lib/agents"
import { vaultGetItem, vaultRemoveItem, vaultSetItem } from "@/lib/vault"

export interface TokenUsage {
  input?: number
  output?: number
  total?: number
}

export interface AiCallRecord {
  id: string
  at: number
  kind: string // summary / extract / polish / ask / find / infer
  agent?: string // 归属 Agent（summary / extract / retrieve / annotate）——多 Agent 编排后按此聚合
  meetingId?: string
  meetingTitle?: string
  providerId: string // 服务商 id（当前恒为 rh-llm，多服务商时按此聚合）
  model: string // 实际产出结果的模型
  preferredModel?: string // 用户首选模型（与 model 不同 = 发生了降级）
  fellBack: boolean
  failReasons: string[] // 降级链上失败尝试的原因（timeout / bad_json / not_found / …）
  durationMs: number
  tokens?: TokenUsage
  ok: boolean
}

const USAGE_KEY = "meeting-notes-usage-v1"
const USAGE_CAP = 500

export function loadUsageLog(): AiCallRecord[] {
  try {
    const raw = vaultGetItem(USAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as unknown
    return Array.isArray(list) ? (list as AiCallRecord[]).slice(0, USAGE_CAP) : []
  } catch {
    return []
  }
}

export function recordAiCall(rec: Omit<AiCallRecord, "id">): void {
  try {
    const list = loadUsageLog()
    const entry: AiCallRecord = {
      ...rec,
      // 归属 Agent 缺省时按调用类型推导（老调用点不用改签名也能按 Agent 聚合）
      agent: rec.agent ?? AGENT_OF_KIND[rec.kind],
      id: `u-${rec.at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    }
    list.unshift(entry)
    vaultSetItem(USAGE_KEY, JSON.stringify(list.slice(0, USAGE_CAP)))
  } catch {
    // 账本写失败不阻塞业务
  }
}

export function clearUsageLog(): void {
  try {
    vaultRemoveItem(USAGE_KEY)
  } catch {
    // ignore
  }
}

// 后端 usage 形态不保证（各模型网关字段不一），能抠出数字就记，抠不出就不记——不猜
export function normalizeUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined
  const u = usage as Record<string, unknown>
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined
  const input = num(u.input_tokens ?? u.prompt_tokens ?? u.inputTokens)
  const output = num(u.output_tokens ?? u.completion_tokens ?? u.outputTokens)
  const total = num(u.total_tokens ?? u.totalTokens) ?? (input !== undefined && output !== undefined ? input + output : undefined)
  if (input === undefined && output === undefined && total === undefined) return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  }
}

// ── 聚合 ──

export interface UsageSummary {
  calls: number
  okCalls: number
  tokens: number // 有 token 记录的调用合计；0 = 后端没回传用量
  tokensKnown: boolean
  fallbacks: number
  fallbackReasons: Record<string, number> // 原因 → 次数
  failReasons: Record<string, number> // 整条降级链耗尽/鉴权失败（ok:false）的原因 → 次数
  avgDurationMs: number
  byModel: { model: string; calls: number; tokens: number }[]
  byKind: { kind: string; calls: number }[]
  byAgent: { agent: AgentRole; calls: number }[] // 按 Agent 聚合（老记录按调用类型推导归属）
  topMeetings: { title: string; calls: number }[]
  daily: { day: string; calls: number }[] // 最近 14 天（含零调用日）
}

export const KIND_LABELS: Record<string, string> = {
  summary: "生成摘要",
  facts: "事实提取",
  review: "交叉审查",
  extract: "抽取行动项",
  support: "支撑核验",
  polish: "补标点分段",
  ask: "跨会议问答",
  find: "语义找会",
  infer: "说话人标注",
  insight: "流程洞察",
  digest: "跟进消化",
  evolution: "演进脉络",
  entities: "实体抽取",
  eval: "评估台",
}

export function summarizeUsage(records: AiCallRecord[], days: number): UsageSummary {
  const since = days > 0 ? Date.now() - days * 86_400_000 : 0
  const list = records.filter((r) => r.at >= since)
  const fallbackReasons: Record<string, number> = {}
  const failReasons: Record<string, number> = {}
  const modelMap = new Map<string, { calls: number; tokens: number }>()
  const kindMap = new Map<string, number>()
  const agentMap = new Map<AgentRole, number>()
  const meetingMap = new Map<string, number>()
  let tokens = 0
  let tokensKnown = false
  let fallbacks = 0
  let okCalls = 0
  let durationSum = 0
  for (const r of list) {
    if (r.ok) okCalls++
    else for (const reason of r.failReasons) failReasons[reason] = (failReasons[reason] ?? 0) + 1
    durationSum += r.durationMs || 0
    if (r.tokens?.total) {
      tokens += r.tokens.total
      tokensKnown = true
    }
    if (r.fellBack) {
      fallbacks++
      for (const reason of r.failReasons) fallbackReasons[reason] = (fallbackReasons[reason] ?? 0) + 1
    }
    // 失败记录没有产出模型（model 为空串），不进「按模型」聚合
    if (r.model) {
      const mm = modelMap.get(r.model) ?? { calls: 0, tokens: 0 }
      mm.calls++
      mm.tokens += r.tokens?.total ?? 0
      modelMap.set(r.model, mm)
    }
    kindMap.set(r.kind, (kindMap.get(r.kind) ?? 0) + 1)
    const role = (r.agent ?? AGENT_OF_KIND[r.kind]) as AgentRole | undefined
    if (role) agentMap.set(role, (agentMap.get(role) ?? 0) + 1)
    if (r.meetingTitle) meetingMap.set(r.meetingTitle, (meetingMap.get(r.meetingTitle) ?? 0) + 1)
  }
  const daily: { day: string; calls: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000)
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const count = list.filter((r) => r.at >= start && r.at < start + 86_400_000).length
    daily.push({ day: key, calls: count })
  }
  return {
    calls: list.length,
    okCalls,
    tokens,
    tokensKnown,
    fallbacks,
    fallbackReasons,
    failReasons,
    avgDurationMs: list.length > 0 ? Math.round(durationSum / list.length) : 0,
    byModel: [...modelMap.entries()]
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.calls - a.calls),
    byKind: [...kindMap.entries()]
      .map(([kind, calls]) => ({ kind, calls }))
      .sort((a, b) => b.calls - a.calls),
    byAgent: [...agentMap.entries()]
      .map(([agent, calls]) => ({ agent, calls }))
      .sort((a, b) => b.calls - a.calls),
    topMeetings: [...meetingMap.entries()]
      .map(([title, calls]) => ({ title, calls }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5),
    daily,
  }
}
