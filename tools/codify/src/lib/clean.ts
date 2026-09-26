// 文本清洗与议题粗分段：独立的前置步骤，纯本地规则，不调模型、不花钱。
// 硬约束：清洗不增删行（行号与原文 1:1 对应），保证出处锚点能映射回用户看到的原文。
// 清洗稿作为中间产物保存；摘要与抽取只吃清洗稿，改清洗规则只需重跑下游。

export interface CleanReport {
  changedLines: number
  timestamps: number
  speakers: number
  slips: number // 口误自我纠正处数（见 correctSlips）
  at: number
}

export interface CleanResult {
  cleaned: string
  report: Omit<CleanReport, "at">
}

const ZERO_WIDTH_RE = /[\u200b-\u200f\u2060\ufeff]/g
// 行首时间戳：[00:12:34] / (0:12:34) / 00:12:34 / 12:34 → 统一为 [HH:MM:SS] 或 [MM:SS]
const TS_RE = /^\s*[\[(]?(\d{1,2}):(\d{2})(?::(\d{2}))?[\])]?\s*/
// 说话人标记：Speaker 1: / 说话人1： / spk2: → 说话人N：
const GENERIC_SPEAKER_RE = /^(?:speaker|说话人|发言人|spk)\s*([0-9a-zA-Z]{1,4})\s*[:：]\s*/i
// 人名前缀：张三: → 张三：（仅统一半角冒号，不改名字本身）
const NAME_SPEAKER_RE = /^([^:：[\]\d][^:：]{0,19})[:：]\s*/
// 连续重复标点收敛（……是合法中文省略号，排除）
const DUP_PUNCT_RE = /([。，,、；;：:！!？?])\1+/g

// ── 口误自我纠正（低风险清洗规则）──
// 只处理「显式自我纠正」模式：说话人说错又当场改口，保留改口后的 Y 并标注（已修正）。
// 这不是改写——用户本意就是 Y，保留 X 反而降低可读性；且只作用于清洗稿/整理稿，
// 原文快照（prePolish）随时可还原。规则刻意收窄：必须有显式纠正信号词，宁漏勿误。
const SLIP_RULES: RegExp[] = [
  // X——不，Y / X…不，Y（破折号、省略号后接「不，」：最强的改口信号）
  /([^。！？!?；;：:\n]{1,15})(?:——|—|--|……|…)\s*不\s*[，,]\s*([^。！？!?；;，,\n]{1,20})/g,
  // X，不对/说错了/讲错了/口误，应该是|应是|我说的是 Y（纠正词后必须紧跟修正引导词，
  // 避免把「方案不对，我们换个思路」这类否定判断误当改口）
  /([^。！？!?；;：:\n]{1,15})[，,]\s*(?:不对|说错了|讲错了|口误)\s*[，,]\s*(?:应该是|应是|我说的是)\s*([^。！？!?；;，,\n]{1,20})/g,
  // X，我是说/我的意思是/更正一下 Y
  /([^。！？!?；;：:\n]{1,15})[，,]\s*(?:我是说|我的意思是|更正一下)\s*([^。！？!?；;，,\n]{1,20})/g,
  // X，哦不/噢不/不不不，Y
  /([^。！？!?；;：:\n]{1,15})[，,]\s*(?:哦不|噢不|不不不)\s*[，,]?\s*([^。！？!?；;，,\n]{1,20})/g,
]

/** 单行口误纠正：命中显式改口模式时输出「Y（已修正）」；返回纠正处数供报告展示 */
export function correctSlips(line: string): { text: string; count: number } {
  let out = line
  let count = 0
  for (const re of SLIP_RULES) {
    re.lastIndex = 0
    out = out.replace(re, (_m, _x: string, y: string) => {
      const fixed = y.trim()
      if (!fixed) return _m // 改口后没有实质内容就不动
      count++
      return `${fixed}（已修正）`
    })
  }
  return { text: out, count }
}

function pad2(n: string): string {
  return n.padStart(2, "0")
}

export function cleanTranscript(raw: string): CleanResult {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n")
  let changedLines = 0
  let timestamps = 0
  let speakers = 0
  let slips = 0

  const out = lines.map((original) => {
    let s = original.replace(ZERO_WIDTH_RE, "").replace(/[ \t]+$/, "")
    // 时间戳归一化
    let prefix = ""
    const tm = TS_RE.exec(s)
    if (tm) {
      timestamps++
      prefix =
        tm[3] !== undefined
          ? `[${pad2(tm[1])}:${tm[2]}:${tm[3]}] `
          : `[${pad2(tm[1])}:${tm[2]}] `
      s = s.slice(tm[0].length)
    }
    // 说话人标记归一化
    const gm = GENERIC_SPEAKER_RE.exec(s)
    if (gm) {
      speakers++
      s = `说话人${gm[1]}：${s.slice(gm[0].length)}`
    } else {
      const nm = NAME_SPEAKER_RE.exec(s)
      if (nm && s.charAt(nm[1].length) === ":") {
        speakers++
        s = `${nm[1].trim()}：${s.slice(nm[0].length)}`
      }
    }
    s = prefix + s
    // 常见 ASR 标点噪声：重复标点收敛
    s = s.replace(DUP_PUNCT_RE, "$1")
    // 口误自我纠正（X 不对/我是说 Y → Y（已修正）），只动显式改口模式
    const slip = correctSlips(s)
    if (slip.count > 0) {
      slips += slip.count
      s = slip.text
    }
    if (s !== original) changedLines++
    return s
  })

  return { cleaned: out.join("\n"), report: { changedLines, timestamps, speakers, slips } }
}

// ── 规则粗分段：为 LLM 提供候选边界，LLM 只判「每段属于哪个议题」，不从全文自己找边界 ──

export interface Segment {
  id: number // 1-based
  lineStart: number // 1-based，相对清洗稿（与原文行号一致）
  lineEnd: number
  text: string
}

const MAX_SEGMENT_CHARS = 1500 // 超过强制切
const MIN_SPLIT_CHARS = 300 // 时间戳跳跃切分的最小段长
const SPEAKER_SPLIT_CHARS = 400 // 说话人切换切分的最小段长
const GAP_SPLIT_SECONDS = 120 // 时间戳跳跃阈值

const CLEAN_TS_RE = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/

function parseTsSeconds(line: string): number | null {
  const m = CLEAN_TS_RE.exec(line.trim())
  if (!m) return null
  return m[3] !== undefined ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]
}

function speakerOf(line: string): string | null {
  const t = line.trim()
  const ts = CLEAN_TS_RE.exec(t)
  const rest = ts ? t.slice(ts[0].length).trim() : t
  const m = /^([^:：]{1,20})[:：]/.exec(rest)
  return m ? m[1].trim() : null
}

export function segmentTranscript(text: string): Segment[] {
  const lines = text.split("\n")
  const segments: Segment[] = []
  let cur: string[] = []
  let curStart = 1
  let curChars = 0
  let lastTs: number | null = null
  let lastSpeaker: string | null = null

  const flush = (endLine: number) => {
    const body = cur.join("\n").trim()
    if (body) {
      segments.push({ id: segments.length + 1, lineStart: curStart, lineEnd: endLine, text: body })
    }
    cur = []
    curChars = 0
  }

  lines.forEach((line, i) => {
    const lineNo = i + 1
    const trimmed = line.trim()
    if (!trimmed) {
      // 空行 = 停顿标记，硬边界
      if (cur.length > 0) flush(lineNo - 1)
      curStart = lineNo + 1
      lastTs = null
      lastSpeaker = null
      return
    }
    if (cur.length === 0) curStart = lineNo

    const ts = parseTsSeconds(trimmed)
    const spk = speakerOf(trimmed)
    let boundary = false
    // 时间戳跳跃
    if (ts !== null && lastTs !== null && ts - lastTs >= GAP_SPLIT_SECONDS && curChars >= MIN_SPLIT_CHARS) {
      boundary = true
    }
    // 说话人切换（段落已有一定长度才切，避免一句一段）
    if (!boundary && spk && lastSpeaker && spk !== lastSpeaker && curChars >= SPEAKER_SPLIT_CHARS) {
      boundary = true
    }
    // 长度上限强制切
    if (!boundary && curChars >= MAX_SEGMENT_CHARS) {
      boundary = true
    }
    if (boundary) {
      flush(lineNo - 1)
      curStart = lineNo
    }

    cur.push(line)
    curChars += line.length
    if (ts !== null) lastTs = ts
    if (spk) lastSpeaker = spk
  })
  if (cur.length > 0) flush(lines.length)

  if (segments.length === 0 && text.trim()) {
    segments.push({ id: 1, lineStart: 1, lineEnd: Math.max(lines.length, 1), text: text.trim() })
  }
  return segments
}
