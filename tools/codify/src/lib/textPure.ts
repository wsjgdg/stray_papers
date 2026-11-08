// 纯文本计算（零依赖，主线程与 text.worker 共用同一份实现）：
// 转写行解析、内容指纹、相似度。从 store.ts 抽出是为了让 Worker 打包不拖进
// store → providers → llm → pocketbase 的依赖链；store.ts 原样再导出，既有引用不受影响。

// 转写文本行解析：识别常见「[00:01:23] 说话人：内容」/「说话人 00:01」格式，
// 只用于展示着色，不改变原文。
const LINE_RE = /^\s*(?:\[?\(?(?<time>\d{1,2}:\d{2}(?::\d{2})?)\]?\)?\s*)?(?:(?<speaker>[^:：[\]\d][^:：]{0,19})[:：]\s*)?(?<text>.*)$/

export interface TranscriptLine {
  time: string
  speaker: string
  text: string
  raw: string
}

export function parseTranscriptLines(transcript: string): TranscriptLine[] {
  return transcript.split("\n").map((raw) => {
    const m = LINE_RE.exec(raw)
    if (!m || (!m.groups?.time && !m.groups?.speaker)) {
      return { time: "", speaker: "", text: raw, raw }
    }
    return {
      time: m.groups?.time ?? "",
      speaker: (m.groups?.speaker ?? "").trim(),
      text: (m.groups?.text ?? raw).trim(),
      raw,
    }
  })
}

// 转写文本指纹：忽略空白与大小写差异后做双哈希。
// 用于检测「同一场会议的不同粘贴版本」——完全相同的输入会被识别出来。
export function transcriptFingerprint(text: string): string {
  const norm = text.replace(/\s+/g, "").toLowerCase()
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < norm.length; i++) {
    const c = norm.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  return `${norm.length}-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`
}

// 文本相似度（0-1）：去空白归一化后取字符 8-gram 集合算 Jaccard。
// 用于抓「同一场会议的修订版 / 清洗前后版」——精确指纹抓不到、但内容高度重叠的情况。
// 纯本地计算；长文本建议先截断再比（调用方控制）。
export function textSimilarity(a: string, b: string): number {
  const na = a.replace(/\s+/g, "").toLowerCase()
  const nb = b.replace(/\s+/g, "").toLowerCase()
  if (!na || !nb) return 0
  if (na === nb) return 1
  const K = 8
  if (na.length < K || nb.length < K) return 0
  const shingles = (s: string): Set<string> => {
    const set = new Set<string>()
    for (let i = 0; i + K <= s.length; i++) set.add(s.slice(i, i + K))
    return set
  }
  const A = shingles(na)
  const B = shingles(nb)
  const [small, large] = A.size <= B.size ? [A, B] : [B, A]
  let inter = 0
  for (const s of small) if (large.has(s)) inter++
  const union = A.size + B.size - inter
  return union > 0 ? inter / union : 0
}

// ── 重复检测扫描（组合任务：一次 Worker 往返完成整套比对，避免 N 次请求开销）──

export interface DedupCandidate {
  id: string
  title: string
  transcript: string
}

export interface DedupResult {
  id: string
  title: string
  percent: number
}

// 精确指纹 → 8-gram 相似度两级检测；输入约定调用方已做长度比例预筛与截断
export function findDuplicate(
  raw: string,
  candidates: DedupCandidate[],
  opts: { clip?: number; threshold?: number } = {},
): DedupResult | null {
  const clip = opts.clip ?? 20_000
  const threshold = opts.threshold ?? 0.85
  const fp = transcriptFingerprint(raw)
  const exact = candidates.find((m) => transcriptFingerprint(m.transcript) === fp)
  if (exact) return { id: exact.id, title: exact.title, percent: 100 }
  const clipped = raw.slice(0, clip)
  let best: DedupCandidate | null = null
  let bestSim = 0
  for (const m of candidates) {
    const sim = textSimilarity(clipped, m.transcript.slice(0, clip))
    if (sim > bestSim) {
      bestSim = sim
      best = m
    }
  }
  if (best && bestSim >= threshold) {
    return { id: best.id, title: best.title, percent: Math.round(bestSim * 100) }
  }
  return null
}
