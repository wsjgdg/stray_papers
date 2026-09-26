// 说话人推断——规则层（纯本地，免费）。
// LLM 推断层在 lib/ai.ts（inferSpeakers）；两层产出同一种 SpeakerSuggestion，
// 都只作为「建议」进审阅面板，用户勾选确认后才写入转写稿，绝不自动改原文。

import { parseTranscriptLines } from "@/lib/store"

export interface SpeakerSuggestion {
  line: number // 1-based 行号
  speaker: string
  confidence: number // 0-1；<0.6 UI 标「待确认」且默认不勾选
  source: "rule" | "ai"
  reason?: string
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// 称呼语模式：「老王你觉得呢 / 老王来说说 / 老王你怎么看 / 老王的意见是」
const VOCATIVE_SUFFIX = "(?:你)?(?:觉得|看|说|讲|来|聊|谈|汇报|补充|怎么|什么意见|你的意见|有没有意见)"

// 公开邀请模式：「这个问题谁来回答 / 谁先说说 / 哪位来讲一下 / 大家谁补充 / 谁有想法」——
// 问句之后的首条未标注发言大概率是应答者（问答轮替信号）
const SOLICIT_RE =
  /(?:谁来|谁先|哪位|谁愿意|大家谁|有谁)(?:来|先|愿意)?\s*(?:回答|说说|说一下|说两句|讲讲|讲一下|发言|补充|介绍|聊聊|谈一谈|汇报|接一下|负责)|谁有(?:想法|意见|补充)|这个问题谁/

export function ruleInferSpeakers(transcript: string): SpeakerSuggestion[] {
  const parsed = parseTranscriptLines(transcript)
  const known = [...new Set(parsed.map((l) => l.speaker).filter(Boolean))]
  const out: SpeakerSuggestion[] = []
  const claimed = new Set<number>()

  // 模式一：未标注行里自我介绍「我是X / 我叫X」→ 该行归 X
  parsed.forEach((l, i) => {
    if (l.speaker || !l.text.trim()) return
    const m = l.text.match(/^(?:大家好[，,、]?\s*)?我(?:是|叫)([^，。,.\s：:！!？?]{1,12})/)
    if (m) {
      out.push({ line: i + 1, speaker: m[1], confidence: 0.85, source: "rule", reason: "行内自我介绍" })
      claimed.add(i + 1)
    }
  })

  // 模式二：某行出现对已知说话人 X 的称呼语 → 紧随其后的第一条未标注行大概率是 X 的回应；
  // 中间若先撞上另一条已标注行，说明应答关系已断，不再往后找
  for (let i = 0; i < parsed.length; i++) {
    const l = parsed[i]
    if (!l.text.trim()) continue
    for (const name of known) {
      if (l.speaker === name) continue // 自己称呼自己不算
      if (!new RegExp(`${escapeRe(name)}\\s*${VOCATIVE_SUFFIX}`).test(l.text)) continue
      for (let j = i + 1; j < parsed.length; j++) {
        const cand = parsed[j]
        if (!cand.text.trim()) continue
        if (cand.speaker) break
        if (!claimed.has(j + 1)) {
          out.push({
            line: j + 1,
            speaker: name,
            confidence: 0.75,
            source: "rule",
            reason: `上一行称呼「${name}」`,
          })
          claimed.add(j + 1)
        }
        break
      }
      break
    }
  }

  // 模式三（问答轮替）：已标注说话人 A 发出公开邀请（「这个问题谁来回答 / 谁先说说」）后，
  // 紧随其后的第一条未标注行大概率是应答者。应答者是谁无法从问句本身得知，
  // 因此只在「除 A 外已知说话人恰好一位」时给出低置信度建议（必然落进「待确认」），
  // 多人场景不猜名字——宁可漏，不可错
  const knownOthers = (asker: string) => known.filter((k) => k !== asker)
  for (let i = 0; i < parsed.length; i++) {
    const l = parsed[i]
    if (!l.speaker || !l.text.trim() || !SOLICIT_RE.test(l.text)) continue
    const others = knownOthers(l.speaker)
    if (others.length !== 1) continue
    for (let j = i + 1; j < parsed.length; j++) {
      const cand = parsed[j]
      if (!cand.text.trim()) continue
      if (cand.speaker) break // 先撞上另一条已标注行，应答关系已断
      if (!claimed.has(j + 1)) {
        out.push({
          line: j + 1,
          speaker: others[0],
          confidence: 0.5,
          source: "rule",
          reason: `上一行「${l.speaker}」公开邀请应答`,
        })
        claimed.add(j + 1)
      }
      break
    }
  }

  return out.sort((a, b) => a.line - b.line)
}

// 未标注的非空行行号（1-based）——两层推断共同的作业范围
export function unlabeledLineNumbers(transcript: string): number[] {
  return parseTranscriptLines(transcript)
    .map((l, i) => ({ l, i }))
    .filter((x) => !x.l.speaker && x.l.text.trim())
    .map((x) => x.i + 1)
}
