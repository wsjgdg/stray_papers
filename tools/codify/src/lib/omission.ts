// 摘要的「遗漏」检测（反向覆盖检查）：幻觉是「说了不该说的」，遗漏是「该说的没说」——
// 交叉审查（LLM）覆盖前者，这里用纯本地规则覆盖后者，零调用、免费、随时重算。
//
// 三路信号，全部来自已有数据，不新增任何 LLM 调用：
// ① 事实层回溯（FRAME 管线开启时）：显著度高、却没被任何议题 fact_ids 引用、
//    且陈述与摘要文本 bigram 覆盖低的已核验事实 = 最可疑的遗漏；
// ② 关键实体：说话人、行动项负责人、AI 实体、引号内专有名词、大写拉丁词
//    （项目代号 / 产品名）——在摘要（brief + 议题要点）里找不到对应提及就列出；
// ③ 关键数字与时间点：金额、百分比、日期、周几——承诺类信息最容易在归纳时被抹掉。
// 结果只是「可能遗漏」提示，由用户判断是否需要补充——提及与否不等于该不该写进摘要。

export type OmissionKind = "fact" | "person" | "term" | "number" | "date"

export interface OmissionCandidate {
  kind: OmissionKind
  text: string // 未被提及的关键点（事实陈述 / 实体名 / 数字 / 时间点）
  count: number // 转写稿中出现次数（事实类为 1）
  weight: number // 排序权重（越高越可疑）
  example: string // 转写稿中的上下文示例行（事实类为支撑句）
}

export interface OmissionSource {
  transcript: string // 转写稿（清洗稿优先）
  summaryText: string // 摘要全文（brief + 议题 + 要点拼接）
  /** 额外实体（行动项负责人 / AI 实体等结构化来源），按 person/term 处理 */
  extraTerms?: { token: string; kind: OmissionKind }[]
  /** FRAME 事实层（可选）：已核验的原子事实 */
  facts?: { id: string; statement: string; salience: number; sourceQuote: string }[]
  /** 议题要点已引用的事实编号（这些事实算已覆盖） */
  referencedFactIds?: string[]
}

const MAX_CANDIDATES = 12
// 时间戳标记不参与实体/数字抽取（[00:12] 里的数字不是会议内容）
const TS_TOKEN_RE = /\[\s*\d{1,2}:\d{2}(?::\d{2})?\s*\]|\(\s*\d{1,2}:\d{2}(?::\d{2})?\s*\)/g
// 归一化：小写 + 去空白与引号括号类符号（保留 % 等单位字符，避免「30」误配「300」）
const NORM_STRIP_RE = /[\s“”"‘’'「」『』《》〈〉【】[\]（）()]/g

function norm(s: string): string {
  return s.toLowerCase().replace(NORM_STRIP_RE, "")
}

// 转写稿行首说话人标注：[00:12] 老王：… / 老王：…
const LABEL_SPEAKER_RE = /^[ \t]*(?:\[[^\]]*\][ \t]*)?([^:：[\]\n]{1,12})[:：]/gm
// 通用指代不算关键实体（没有「遗漏一个人」的意义）
const GENERIC_RE = /^(?:说话人|发言人|未知|主持|我|对方|客户|用户|大家|同事|经理|老板|老师|speaker|spk)/i
// 大写拉丁词（项目代号 / 产品名 / 缩写），≥2 字符
const LATIN_TERM_RE = /[A-Za-z][A-Za-z0-9+\-_.]{1,19}/g
// 常见无信息量大写词（寒暄 / 语气 / 通用缩写）
const LATIN_STOPWORDS = new Set([
  "OK", "OKAY", "YES", "NO", "THANKS", "THX", "BYE", "HELLO", "HI", "PLEASE",
  "THE", "AND", "FOR", "YOU", "ARE", "WAS", "WITH", "THIS", "THAT", "FROM",
  "TODO", "TBD", "ASAP", "AM", "PM", "A", "I", "AN", "OF", "TO", "IN", "ON", "AT", "BY", "IT", "IS",
])
// 引号内的专有名词（中文会议里被引号标出的往往就是项目/产品/方案名）
const QUOTED_RE = /[「『“《]([^」』”》\n]{2,14})[」』”》]/g
// 「XX项目 / XX系统 / XX平台」类显式命名单词。后缀刻意收窄：「方案/产品/功能」在会议里
// 太常作普通名词用（「给出方案」「有个想法」），收进来会把动宾短语误当实体
const NAMED_RE = /([一-鿿A-Za-z][一-鿿A-Za-z0-9]{1,7}(?:项目|系统|平台|小程序))/g
// 关键数字：金额 / 百分比 / 数量单位（数字与单位间容忍空白，「20 万」也要抓到）
const NUMBER_RE = /\d+(?:\.\d+)?\s*(?:%|％|元|万元|万|亿|块钱|块|人|天|周|个月|小时|分钟|倍)/g
// 关键时间点：具体日期 / 周几 / 季度
const DATE_RE = /\d{1,2}月\d{1,2}[日号]|(?:下|本|这|上)?周[一二三四五六日天末]|Q[1-4](?![0-9])/g

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let n = 0
  let idx = haystack.indexOf(needle)
  while (idx >= 0) {
    n++
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return n
}

// 事实陈述被摘要覆盖的程度：陈述的字符 bigram 有多少出现在摘要里。
// 摘要要点常换措辞（「定价 99 元」→「确定专业版价格」），bigram 覆盖比子串匹配宽容，
// 又比全有全无的包含判断细腻——覆盖率低 + 没被议题引用 = 可疑遗漏。
function bigramCoverage(statement: string, summaryNorm: string): number {
  const s = norm(statement)
  if (s.length < 2) return summaryNorm.includes(s) ? 1 : 0
  let hit = 0
  let total = 0
  for (let i = 0; i + 2 <= s.length; i++) {
    total++
    if (summaryNorm.includes(s.slice(i, i + 2))) hit++
  }
  return total > 0 ? hit / total : 0
}

// 示例行：token 第一次出现的转写行（剥时间戳、截断），给用户「在哪说的」的线索
function exampleLine(transcript: string, token: string): string {
  const lower = transcript.toLowerCase()
  const idx = lower.indexOf(token.toLowerCase())
  if (idx < 0) return ""
  const lineStart = transcript.lastIndexOf("\n", idx) + 1
  let lineEnd = transcript.indexOf("\n", idx)
  if (lineEnd < 0) lineEnd = transcript.length
  const line = transcript.slice(lineStart, lineEnd).replace(TS_TOKEN_RE, "").trim()
  return line.length > 70 ? line.slice(0, 70) + "…" : line
}

export function detectOmissions(src: OmissionSource): OmissionCandidate[] {
  const body = src.transcript.replace(TS_TOKEN_RE, "")
  const summaryNorm = norm(src.summaryText)
  if (!body.trim() || !summaryNorm) return []

  const out: OmissionCandidate[] = []
  const seen = new Set<string>()
  const add = (c: OmissionCandidate) => {
    const key = norm(c.text)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(c)
  }
  // 摘要里已有对应提及（归一化子串匹配）= 已覆盖
  const covered = (token: string): boolean => summaryNorm.includes(norm(token))

  // ── ① 事实层回溯：显著度高却没进议题要点的事实 ──
  const referenced = new Set(src.referencedFactIds ?? [])
  for (const f of src.facts ?? []) {
    if (referenced.has(f.id)) continue
    if (f.salience < 0.55) continue // 低显著度事实本来就不该占摘要篇幅
    if (bigramCoverage(f.statement, summaryNorm) >= 0.5) continue // 换措辞提过 = 已覆盖
    add({
      kind: "fact",
      text: f.statement,
      count: 1,
      weight: 2.5 + f.salience * 2,
      example: f.sourceQuote ? `原文：「${f.sourceQuote.slice(0, 60)}」` : "",
    })
  }

  // ── ② 关键实体 ──
  const persons = new Map<string, number>()
  LABEL_SPEAKER_RE.lastIndex = 0
  let mm: RegExpExecArray | null
  while ((mm = LABEL_SPEAKER_RE.exec(body)) !== null) {
    const name = mm[1].trim()
    if (!name || GENERIC_RE.test(name) || /\d/.test(name)) continue
    persons.set(name, (persons.get(name) ?? 0) + 1)
  }
  for (const [name, count] of persons) {
    if (covered(name)) continue
    // 姓氏单字兜底：摘要里写「王总」而转写标注「老王」——按首字再查一次降低误报
    if (name.length >= 2 && summaryNorm.includes(norm(name[0]))) continue
    add({
      kind: "person",
      text: name,
      count,
      weight: 3 + Math.min(count, 5) * 0.2,
      example: exampleLine(body, name),
    })
  }
  for (const t of src.extraTerms ?? []) {
    const token = t.token.trim()
    if (!token || GENERIC_RE.test(token) || covered(token)) continue
    const count = countOccurrences(body.toLowerCase(), token.toLowerCase())
    if (count === 0) continue // 转写里都没出现过（脏数据）不列
    add({
      kind: t.kind === "person" ? "person" : "term",
      text: token,
      count,
      weight: (t.kind === "person" ? 3 : 2) + Math.min(count, 5) * 0.2,
      example: exampleLine(body, token),
    })
  }
  // 引号内专有名词与显式命名单词：被引号/命名后缀标出的通常是会上反复指代的对象
  const terms = new Map<string, number>()
  for (const re of [QUOTED_RE, NAMED_RE]) {
    re.lastIndex = 0
    let m2: RegExpExecArray | null
    while ((m2 = re.exec(body)) !== null) {
      const w = m2[1].trim()
      if (w.length < 2) continue
      terms.set(w, (terms.get(w) ?? 0) + 1)
    }
  }
  // 大写拉丁词：出现 ≥2 次才收（单次出现的英文碎片噪声大）
  const latin = new Map<string, number>()
  LATIN_TERM_RE.lastIndex = 0
  let m3: RegExpExecArray | null
  while ((m3 = LATIN_TERM_RE.exec(body)) !== null) {
    const w = m3[0]
    if (!/[A-Z]/.test(w) || LATIN_STOPWORDS.has(w.toUpperCase())) continue
    latin.set(w, (latin.get(w) ?? 0) + 1)
  }
  for (const [w, count] of [...terms, ...latin]) {
    if ((terms.has(w) && count < 1) || (!terms.has(w) && count < 2)) continue
    if (covered(w)) continue
    add({
      kind: "term",
      text: w,
      count,
      weight: 2 + Math.min(count, 5) * 0.15,
      example: exampleLine(body, w),
    })
  }

  // ── ③ 关键数字与时间点：承诺类信息最容易在归纳时被抹掉 ──
  const numbers = new Map<string, number>()
  NUMBER_RE.lastIndex = 0
  let m4: RegExpExecArray | null
  while ((m4 = NUMBER_RE.exec(body)) !== null) {
    const w = m4[0]
    numbers.set(w, (numbers.get(w) ?? 0) + 1)
  }
  for (const [w, count] of numbers) {
    if (covered(w)) continue
    // 数字变体宽容：摘要写「99 元」或「99元」都算提及（norm 已去空白）
    if (summaryNorm.includes(norm(w).replace(/[元块]/, ""))) continue
    add({
      kind: "number",
      text: w,
      count,
      weight: 2.2 + Math.min(count, 5) * 0.1,
      example: exampleLine(body, w),
    })
  }
  const dates = new Map<string, number>()
  DATE_RE.lastIndex = 0
  let m5: RegExpExecArray | null
  while ((m5 = DATE_RE.exec(body)) !== null) {
    const w = m5[0]
    dates.set(w, (dates.get(w) ?? 0) + 1)
  }
  for (const [w, count] of dates) {
    if (covered(w)) continue
    // 「周五」与「星期五」互认：把「周X」映射成「星期X」再查一次
    const alt = w.replace(/周([一二三四五六日天])/, "星期$1")
    if (alt !== w && summaryNorm.includes(norm(alt))) continue
    add({
      kind: "date",
      text: w,
      count,
      weight: 2 + Math.min(count, 5) * 0.1,
      example: exampleLine(body, w),
    })
  }

  return out.sort((a, b) => b.weight - a.weight || b.count - a.count).slice(0, MAX_CANDIDATES)
}
