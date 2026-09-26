// 会中实时洞察（纯本地规则，免费，不调任何模型）：
// 实时转写进行中，对「新写入的行」做三类高置信信号检测，命中才提醒——
//   1. assignee  无主任务：现场派活的疑问句（「谁来跟进」）或 承诺句+时间点但听不到具体负责人
//   2. drift     疑似离题：最近 10 行完全不含会议主题锚点词（标题+标签的 2-gram），每 10 行只提醒一次
//   3. echo      历史决议呼应：新行与某条历史决议有 ≥6 字连续重合——提示「若要推翻请会上明说」
// 设计纪律：宁可漏报不可误报（规则全是高精度模式），提醒只是旁注，绝不改动转写内容；
// 去重靠 seen 集合（调用方持有），同一行同一信号只提醒一次。

import { parseTranscriptLines } from "@/lib/store"

export type InsightKind = "assignee" | "drift" | "echo"

export interface LiveInsight {
  id: string
  kind: InsightKind
  line: number // 1-based 行号（drift 为检测时的总行数）
  text: string
}

export interface InsightContext {
  title: string
  tags: string[]
  pastDecisions: { content: string; title: string; date: string }[]
}

// 派活疑问：「谁来跟进 / 哪位负责 / 有人认领吗」
const ASSIGN_QUESTION_RE = /(谁|哪位|哪个同学|有没有人|有人)(来|负责|跟进|认领|对接|处理|看一下|搞|牵个头)/
// 承诺/待办动词 + 将来时间词 同时出现 = 像是在定带时间点的事
const COMMIT_RE = /(需要|要|得|尽快|安排|落实|跟进|对接|输出|给出|提供|准备|整理|同步|确认|排期|上线|交付)/
const DUE_RE = /(明天|后天|本周|下周|这周|周[一二三四五六日天]|月底|节前|之前|以内|尽快|之前完成)/
// 句中出现「某某来/负责/跟进」形态的人名指向（2-3 字中文名 + 动作），有它就不算无主
const OWNER_NAMED_RE = /[一-龥]{2,3}(来|负责|跟进|这边|去做|认领|对接|处理|牵头)/

const NORM_RE = /[\s“”"‘’'《》〈〉【】\[\]（）()。，,、；;：:！!？?…—\-–·]+/g

function normalize(s: string): string {
  return s.replace(NORM_RE, "").toLowerCase()
}

// a 中是否含有与 b 长度 ≥n 的连续重合片段（b 切 n-gram，a 扫描）
function shareGram(a: string, b: string, n: number): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na.length < n || nb.length < n) return false
  const grams = new Set<string>()
  for (let i = 0; i + n <= nb.length; i++) grams.add(nb.slice(i, i + n))
  for (let i = 0; i + n <= na.length; i++) {
    if (grams.has(na.slice(i, i + n))) return true
  }
  return false
}

// 主题锚点：标题 + 标签的 2-gram 集合
function anchorGrams(ctx: InsightContext): Set<string> {
  const src = normalize(`${ctx.title} ${ctx.tags.join(" ")}`)
  const grams = new Set<string>()
  for (let i = 0; i + 2 <= src.length; i++) grams.add(src.slice(i, i + 2))
  return grams
}

/**
 * 检查 [fromIdx, lines.length) 的新行，产出高置信提醒。
 * seen 由调用方跨调用持有（同一信号不重复提醒）；本函数不修改任何内容。
 */
export function inspectNewLines(
  lines: string[],
  fromIdx: number,
  ctx: InsightContext,
  seen: Set<string>,
): LiveInsight[] {
  const out: LiveInsight[] = []
  const push = (ins: LiveInsight) => {
    if (seen.has(ins.id)) return
    seen.add(ins.id)
    out.push(ins)
  }

  const fresh = lines.slice(fromIdx)
  const parsed = parseTranscriptLines(fresh.join("\n"))
  parsed.forEach((l, i) => {
    const lineNo = fromIdx + i + 1
    const text = l.text.trim()
    if (text.length < 6) return

    // 信号 1a：派活疑问句——现场就该把负责人定下来
    if (ASSIGN_QUESTION_RE.test(text)) {
      push({
        id: `assign-q-${lineNo}`,
        kind: "assignee",
        line: lineNo,
        text: `第 ${lineNo} 行像是在现场派活（「${text.slice(0, 24)}…」）——建议散会前把负责人定下来`,
      })
      return
    }
    // 信号 1b：承诺 + 时间点，但句子里听不到具体负责人
    if (
      COMMIT_RE.test(text) &&
      DUE_RE.test(text) &&
      !OWNER_NAMED_RE.test(text) &&
      !/[一-龥]{2,3}(的方案|的稿|的版)/.test(text)
    ) {
      push({
        id: `assign-c-${lineNo}`,
        kind: "assignee",
        line: lineNo,
        text: `第 ${lineNo} 行定了带时间点的事（「${text.slice(0, 24)}…」）但没听到具体负责人——建议补问一句「谁来负责」`,
      })
    }
    // 信号 3：与历史决议连续 ≥6 字重合——可能延续也可能要推翻，都值得当面对齐
    for (const d of ctx.pastDecisions) {
      if (shareGram(text, d.content, 6)) {
        push({
          id: `echo-${lineNo}-${d.title}-${d.content.slice(0, 6)}`,
          kind: "echo",
          line: lineNo,
          text: `第 ${lineNo} 行谈及历史决议「${d.content.slice(0, 30)}${d.content.length > 30 ? "…" : ""}」（《${d.title}》${d.date}）——若要变更，建议会上明说并记进本场决议`,
        })
        break
      }
    }
  })

  // 信号 2：疑似离题——每满 10 行检查一次最近 10 行，全程无主题锚点词才提醒
  const total = lines.length
  const bucket = Math.floor(total / 10)
  if (bucket >= 2 && total - fromIdx > 0 && !seen.has(`drift-${bucket}`)) {
    const anchors = anchorGrams(ctx)
    if (anchors.size > 0) {
      const recent = normalize(lines.slice(-10).join(" "))
      const onTopic = [...anchors].some((g) => recent.includes(g))
      if (!onTopic) {
        push({
          id: `drift-${bucket}`,
          kind: "drift",
          line: total,
          text: `最近 10 行没再提到会议主题「${ctx.title || "未命名会议"}」——若是新话题，建议口头点一句题，会后分段会自然把它归成新议题`,
        })
      } else {
        seen.add(`drift-${bucket}`) // 本桶检查过且在题内，不再重复检查
      }
    }
  }

  return out
}
