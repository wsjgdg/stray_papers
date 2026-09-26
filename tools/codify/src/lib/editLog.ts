// 修正事件日志：用户对 AI 产出的每一次修正都是一条质量信号——
// 「改过的摘要不覆盖」只保护了用户资产，这里进一步把修正本身结构化记下来，
// 供「质量信号」面板做修正模式分析：哪个议题反复被改（生成不稳定）、
// 行动项删除率多高（抽取过激）、转写修正以什么类型为主（ASR 哪项能力不足）。
//
// 设计口径：
// - 只记「用户主动修正 AI 产出」的动作；实时转写/粘贴追加的新内容不算修正
//   （hook 侧用「归一化前缀」判定排除纯追加会话）；
// - before/after 截断保存（每条 ≤300 字），日志滚动上限 500 条，纯 localStorage，
//   随「导出备份」之外的独立键存放——它是诊断数据，不是用户资产，丢了不影响档案；
// - 转写修正带 DiffProfile（复用保真校验的字符级对齐引擎）：
//   替换为主 ≈ 同音错字，删除为主 ≈ 丢词/删句，行数变化 ≈ 断句重排。

export type EditTarget =
  | "brief" // 一句话摘要被手改
  | "outline" // 议题纪要被手改（detail 记被改的议题名）
  | "action-content" // 行动项结论被手改
  | "action-delete" // 行动项被删除（detail 记被删内容）
  | "action-add" // 手动补充行动项（抽取漏了的信号）
  | "decision-content" // 决议被手改
  | "decision-delete" // 决议被删除
  | "pending-reject" // 待确认条目被放弃（抽取不确定 + 用户否决）
  | "pending-accept" // 待确认条目被采纳（模型自评不确定但用户认可）
  | "transcript" // 转写稿被手动修正（带 profile）
  | "polish-undo" // 补标点整理稿被还原（整理质量差的信号）

// 转写修正的字符级画像（内容字符口径，来自 verifyFidelity 的聚合计数）
export interface TranscriptEditProfile {
  inserts: number // 补进的内容字符
  deletes: number // 删掉的内容字符
  subs: number // 替换的内容字符（同音错字修正的主要形态）
  punctOnly: boolean // 内容字符完全一致，只动了标点/空白
  linesDelta: number // 行数变化绝对值（断句/分段重排信号）
  speakersChanged: number // 说话人标注变化处数
}

export interface EditEvent {
  id: string
  at: number
  meetingId: string
  meetingTitle: string
  meetingKind: string // 会议模板 id（按会议类型聚合修正率）
  target: EditTarget
  before?: string // 修改前（≤300 字）
  after?: string // 修改后（≤300 字）
  detail?: string // 补充信息：被改议题名 / 被删条目内容等（≤120 字）
  profile?: TranscriptEditProfile
}

import { vaultGetItem, vaultRemoveItem, vaultSetItem } from "@/lib/vault"

const EDITLOG_KEY = "meeting-notes-editlog-v1"
const EDITLOG_CAP = 500
const SNIPPET_CAP = 300

export function clipSnippet(s: string): string {
  const t = s.trim()
  return t.length > SNIPPET_CAP ? t.slice(0, SNIPPET_CAP) + "…" : t
}

export function loadEditLog(): EditEvent[] {
  try {
    const raw = vaultGetItem(EDITLOG_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as unknown
    return Array.isArray(list) ? (list as EditEvent[]).slice(0, EDITLOG_CAP) : []
  } catch {
    return []
  }
}

function persist(events: EditEvent[]): void {
  try {
    vaultSetItem(EDITLOG_KEY, JSON.stringify(events.slice(0, EDITLOG_CAP)))
  } catch {
    // 日志写失败不阻塞业务（诊断数据，宁丢不误伤主流程）
  }
}

// 追加一条修正事件（读-改-写；个人单机、低频操作，无需内存缓存层）
export function recordEditEvent(
  meeting: { id: string; title: string; meetingKind?: string },
  event: Omit<EditEvent, "id" | "at" | "meetingId" | "meetingTitle" | "meetingKind">,
): void {
  const entry: EditEvent = {
    id: `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    meetingKind: typeof meeting.meetingKind === "string" ? meeting.meetingKind : "",
    ...event,
  }
  persist([entry, ...loadEditLog()])
}

export function clearEditLog(): void {
  try {
    vaultRemoveItem(EDITLOG_KEY)
  } catch {
    // 忽略
  }
}
