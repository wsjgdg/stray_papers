// 评估台（个人 golden set）：选几场有代表性的会议固定成评估集，
// 每次调提示词 / 换模型后一键重跑完整生成管线，产出快照存进「评估运行」记录，
// 人工按四个维度打分——同一套题反复考，质量变化才可比较、可追踪，
// 而不是「感觉变好了但说不清」。
//
// 关键立场：
// - 评估运行绝不触碰既有纪要——重跑结果只存进评估记录，人工打分后与历史运行对比；
// - 学术评估框架（P-MESA / FineSurE 一类）把忠实度、完整性等拆成可独立打分的维度，
//   这里取其简化版四维：忠实度（结论都有原文支撑）/ 覆盖率（关键信息不遗漏）/
//   可操作性（行动项清晰可执行）/ 可读性；
// - 生成口径与生产一致（同样的模板提示语、Agent 附加指令、置信度门槛），
//   但不注入随手记与系列上下文——控制变量，两次运行之间的差异才归因于本次改动。

export const EVAL_DIMENSIONS = ["faithfulness", "coverage", "actionable", "readability"] as const

export type EvalDimension = (typeof EVAL_DIMENSIONS)[number]

export const DIMENSION_LABELS: Record<EvalDimension, string> = {
  faithfulness: "忠实度",
  coverage: "覆盖率",
  actionable: "可操作性",
  readability: "可读性",
}

export const DIMENSION_HINTS: Record<EvalDimension, string> = {
  faithfulness: "结论是否都有原文支撑：对照转写稿抽查议题要点与行动项，有没有编造、夸大、张冠李戴",
  coverage: "关键信息是否遗漏：转写里的决定、承诺、数字、时间点，摘要是否都收进来了",
  actionable: "行动项是否清晰可执行：谁、做什么、何时——拿到就能直接跟进，不需要回读原文",
  readability: "组织与措辞：议题划分合理、要点具体不空泛、没有车轱辘话",
}

// 自动指标（全部本地免费计算，跑管线时顺手产出）：
// - quotePassRate 引用校验通过率：模型给出的事实中通过「source_quote 逐字对账」的比例，
//   通不过的都是编造/改写原文的引用——忠实度的机器代理，越低说明幻觉越多；
// - factReferenceRate 事实引用率：议题要点实际引用了多少已核验事实（FRAME 管线的 factIds），
//   高显著度事实没被组织进摘要 = 覆盖不足的信号；
// - omissionCount 遗漏自查候选数：本地规则从转写稿抽关键实体/数字/时间点，摘要未提及的条数。
// 人工只需要看「可读性」和对比选择——机器能算的不让人打。
export interface EvalAutoMetrics {
  quotePassRate: number | null // 0-1；未走 FRAME 事实路径时为 null
  factReferenceRate: number | null // 0-1；无事实层时为 null
  omissionCount: number
}

// 单场会议的评估产出快照（与生产管线同构，但独立存放）
export interface EvalMeetingResult {
  meetingId: string
  title: string
  brief: string
  topics: { topic: string; points: string[] }[]
  actions: { content: string; assignee: string; dueDate: string }[]
  factsCount: number // 事实层提取条数（0 = 走了回退路径）
  discardedCount: number // 被机器校验丢弃的条数（无原文支撑/低置信）
  factsDiscarded?: number // 其中事实层丢弃数（引用校验通过率的分母用；旧记录没有）
  usedFallback: boolean // 摘要是否回退了一次成稿路径
  model: string // 实际产出模型（降级后可能与首选不同）
  auto?: EvalAutoMetrics // 自动指标（旧记录没有）
  error?: string // 该场失败时的原因（其余场继续跑）
}

// 评分：对比判定是主路径（三按钮，秒级完成）；四维细打分降级为可选的深度评估。
// verdict 的语义：本次运行相对**上一次运行**（同一场会议）是更好 / 差不多 / 更差
export interface EvalScores {
  verdict?: "better" | "same" | "worse"
  faithfulness?: number
  coverage?: number
  actionable?: number
  readability?: number
  note?: string
}

export interface EvalRun {
  id: string
  at: number
  label: string // 本次改了什么（如「抽取提示词 v2」「换 gemini-3.5-flash」）
  preferredModel: string // 运行时的首选模型（降级明细看各场 result.model）
  results: EvalMeetingResult[]
  scores: Record<string, EvalScores> // meetingId → 评分
  sampledCount?: number // 抽样场数（缺省 = 全量运行；旧记录没有）
  goldenTotal?: number // 当时评估集总场数（抽样口径可追溯）
}

import { vaultGetItem, vaultSetItem } from "@/lib/vault"

const EVAL_RUNS_KEY = "meeting-notes-evalruns-v1"
const EVAL_RUNS_CAP = 12 // 每次运行含全部产出快照，滚动保留最近 12 次足够看趋势

export function loadEvalRuns(): EvalRun[] {
  try {
    const raw = vaultGetItem(EVAL_RUNS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return []
    return (list as EvalRun[])
      .filter((r) => r && typeof r.id === "string" && Array.isArray(r.results))
      .slice(0, EVAL_RUNS_CAP)
  } catch {
    return []
  }
}

export function saveEvalRuns(runs: EvalRun[]): void {
  try {
    vaultSetItem(EVAL_RUNS_KEY, JSON.stringify(runs.slice(0, EVAL_RUNS_CAP)))
  } catch {
    // 评估记录写失败不阻塞业务；面板会如实显示未保存（下次操作重试）
  }
}

// 一次运行的维度均分（只算已打分的场次；全未打分返回 null）
export function runAverages(run: EvalRun): Record<EvalDimension, number | null> {
  const out = {} as Record<EvalDimension, number | null>
  for (const dim of EVAL_DIMENSIONS) {
    const vals = run.results
      .map((r) => run.scores[r.meetingId]?.[dim])
      .filter((v): v is number => typeof v === "number")
    out[dim] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  return out
}

export function runScoredCount(run: EvalRun): number {
  return run.results.filter((r) => {
    const s = run.scores[r.meetingId]
    return s && (s.verdict !== undefined || EVAL_DIMENSIONS.some((d) => typeof s[d] === "number"))
  }).length
}

// 引用校验通过率：从快照计数推导。旧记录没有 factsDiscarded（只有合并的 discardedCount）时返回 null，不猜
export function quotePassRateOf(r: EvalMeetingResult): number | null {
  if (r.error) return null
  if (typeof r.factsDiscarded !== "number") return null
  const total = r.factsCount + r.factsDiscarded
  return total > 0 ? r.factsCount / total : null
}

// 一次运行的对比判定汇总：本次相对上次「更好 / 差不多 / 更差」的场次分布
export function runVerdictTally(run: EvalRun): { better: number; same: number; worse: number; total: number } {
  let better = 0
  let same = 0
  let worse = 0
  for (const r of run.results) {
    const v = run.scores[r.meetingId]?.verdict
    if (v === "better") better++
    else if (v === "same") same++
    else if (v === "worse") worse++
  }
  return { better, same, worse, total: better + same + worse }
}
