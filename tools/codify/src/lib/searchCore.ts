// 检索核心（纯函数，无 DOM / Worker 依赖）：倒排索引 + trigram 模糊 + 混合打分。
// search.worker.ts 与 searchClient.ts 的主线程降级路径共用本模块，保证两种模式行为一致。
//
// 索引结构（三级，打分前先缩小候选集，绝不对全量文本做昂贵计算）：
// - bigram（2-gram）倒排：任意 ≥2 字查询词的主通道——候选 = 各 bigram  posting 交集，
//   再用原文 substring 精确验证（与旧版 haystack.includes 语义完全一致）；
// - trigram（3-gram）倒排：模糊通道——精确通道无命中时，按 trigram 重叠率圈出
//   「长得像」的候选，再做词级编辑距离（≤1）验证，覆盖拼写容错；
// - term 倒排：完整词项（拉丁词 / 数字串 / 连续 CJK 段），用于精确命中加分与模糊验证。
// 单字查询退化为全量扫描（posting 无区分度，且在 Worker 里扫、不卡输入）。
//
// 打分（混合排序）：字段权重（标题 > 标签 > 摘要层 > 全文）+ 词频（封顶）+ 精确词项加分；
// 模糊命中整体降权；同分按更新时间倒序。多关键词仍是 AND 语义（每个词都必须命中）。

export interface SearchDoc {
  id: string
  stamp: number // 内容戳：增量同步的脏标记
  updatedAt: number
  title: string // 已小写
  tags: string // 已小写、空格连接
  head: string // 加权前置文本（标题/日期/摘要/议题/行动项/决议/标签，不含转写），已小写
  haystack: string // 全量检索文本（含转写），已小写——与 searchIndex.haystackOf 一致
}

export interface SearchHit {
  id: string
  score: number
  fuzzy: boolean // 该命中里是否含模糊匹配的关键词（UI 可提示「含近似匹配」）
}

// ── 索引结构 ──

export interface SearchIndex {
  docs: Map<string, SearchDoc>
  compacted: Map<string, string> // 去空白后的 haystack：gram 索引与模糊验证的基底
  bigrams: Map<string, Set<string>>
  trigrams: Map<string, Set<string>>
  terms: Map<string, Set<string>>
  docTerms: Map<string, Set<string>> // doc → 词项集合（模糊验证用）
}

export function createIndex(): SearchIndex {
  return {
    docs: new Map(),
    compacted: new Map(),
    bigrams: new Map(),
    trigrams: new Map(),
    terms: new Map(),
    docTerms: new Map(),
  }
}

const compact = (s: string) => s.replace(/\s+/g, "")

// 词项切分：拉丁/数字串 + 连续 CJK 段（CJK 不做分词——bigram 通道已覆盖其子串检索）
const TERM_RE = /[a-z0-9]+|[㐀-䶿一-鿿豈-﫿]+/g

function gramsOf(s: string, n: number, out: Set<string>): void {
  for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n))
}

function postingAdd(map: Map<string, Set<string>>, key: string, id: string): void {
  const set = map.get(key)
  if (set) set.add(id)
  else map.set(key, new Set([id]))
}

function postingDel(map: Map<string, Set<string>>, key: string, id: string): void {
  const set = map.get(key)
  if (!set) return
  set.delete(id)
  if (set.size === 0) map.delete(key)
}

export function indexRemove(idx: SearchIndex, id: string): void {
  const doc = idx.docs.get(id)
  if (!doc) return
  const c = idx.compacted.get(id) ?? ""
  const bg = new Set<string>()
  const tg = new Set<string>()
  gramsOf(c, 2, bg)
  gramsOf(c, 3, tg)
  for (const g of bg) postingDel(idx.bigrams, g, id)
  for (const g of tg) postingDel(idx.trigrams, g, id)
  for (const t of idx.docTerms.get(id) ?? []) postingDel(idx.terms, t, id)
  idx.docTerms.delete(id)
  idx.docs.delete(id)
  idx.compacted.delete(id)
}

export function indexUpsert(idx: SearchIndex, doc: SearchDoc): void {
  const prev = idx.docs.get(doc.id)
  if (prev && prev.stamp === doc.stamp) return // 内容戳没变：索引保持不变（增量）
  indexRemove(idx, doc.id)

  idx.docs.set(doc.id, doc)
  const c = compact(doc.haystack)
  idx.compacted.set(doc.id, c)

  const bg = new Set<string>()
  const tg = new Set<string>()
  gramsOf(c, 2, bg)
  gramsOf(c, 3, tg)
  for (const g of bg) postingAdd(idx.bigrams, g, doc.id)
  for (const g of tg) postingAdd(idx.trigrams, g, doc.id)

  const terms = new Set<string>(c.match(TERM_RE) ?? [])
  idx.docTerms.set(doc.id, terms)
  for (const t of terms) postingAdd(idx.terms, t, doc.id)
}

// ── 查询 ──

// 有界编辑距离：只关心是否 ≤ max（默认 1），超过立即短路
function editDistanceAtMost(a: string, b: string, max = 1): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  if (a === b) return true
  // 简易 DP，行滚动 + 早退
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return false
    prev = cur
  }
  return prev[b.length] <= max
}

// 词频（封顶计数）：出现越多越相关，但 4 次封顶避免长转写稿霸榜
function countCapped(haystack: string, token: string, cap = 4): number {
  let n = 0
  let pos = haystack.indexOf(token)
  while (pos !== -1 && n < cap) {
    n++
    pos = haystack.indexOf(token, pos + token.length)
  }
  return n
}

interface TokenMatch {
  score: number
  fuzzy: boolean
}

// 单个关键词对单份文档的打分；未命中返回 null
function scoreToken(idx: SearchIndex, id: string, token: string, fuzzy: boolean): TokenMatch | null {
  const doc = idx.docs.get(id)
  if (!doc) return null
  if (fuzzy) {
    // 模糊命中：给基础分并整体降权，不再叠加字段加分（近似匹配不值得精确匹配权重）
    return { score: 0.4 * (1 + countCapped(idx.compacted.get(id) ?? "", token, 2) * 0.5), fuzzy: true }
  }
  let score = 1
  if (doc.title.includes(token)) score += 5 // 标题命中权重最高
  if (doc.tags.includes(token)) score += 3
  if (doc.head.includes(token)) score += 3 // 摘要/议题/行动项/决议层
  if (idx.docTerms.get(id)?.has(token)) score += 2 // 完整词项精确命中
  score += countCapped(doc.haystack, token) * 0.5 // 词频加分（封顶 2）
  return { score, fuzzy: false }
}

// bigram 交集圈候选 → 原文 substring 精确验证（语义与旧版 includes 完全一致）
function exactCandidates(idx: SearchIndex, token: string): string[] {
  if (token.length === 1) {
    // 单字无区分度：全量扫描（在 Worker 里执行，不阻塞输入）
    const out: string[] = []
    for (const [id, doc] of idx.docs) if (doc.haystack.includes(token)) out.push(id)
    return out
  }
  const tGrams = new Set<string>()
  gramsOf(compact(token), 2, tGrams)
  let candidates: Set<string> | null = null
  for (const g of tGrams) {
    const posting = idx.bigrams.get(g)
    if (!posting || posting.size === 0) return [] // 任一 bigram 无 posting → O(1) 判空
    candidates = candidates === null ? new Set(posting) : intersect(candidates, posting)
    if (candidates.size === 0) return []
  }
  const out: string[] = []
  for (const id of candidates ?? []) {
    if (idx.docs.get(id)?.haystack.includes(token)) out.push(id)
  }
  return out
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  const out = new Set<string>()
  for (const x of small) if (large.has(x)) out.add(x)
  return out
}

// trigram 重叠圈候选 → 词级编辑距离（≤1）验证：拼写容错通道
function fuzzyCandidates(idx: SearchIndex, token: string): string[] {
  if (token.length < 3) return [] // 太短的词模糊化误报率不可接受
  const tGrams = new Set<string>()
  gramsOf(compact(token), 3, tGrams)
  if (tGrams.size === 0) return []
  const overlap = new Map<string, number>()
  for (const g of tGrams) {
    for (const id of idx.trigrams.get(g) ?? []) {
      overlap.set(id, (overlap.get(id) ?? 0) + 1)
    }
  }
  const threshold = Math.max(1, Math.ceil(tGrams.size * 0.3))
  const out: string[] = []
  for (const [id, n] of overlap) {
    if (n < threshold) continue
    // 词级验证：文档任一完整词项与查询词编辑距离 ≤1 才算模糊命中
    for (const term of idx.docTerms.get(id) ?? []) {
      if (editDistanceAtMost(term, token, 1)) {
        out.push(id)
        break
      }
    }
  }
  return out
}

export function runSearch(idx: SearchIndex, tokens: string[]): SearchHit[] {
  const clean = tokens.map((t) => t.trim().toLowerCase()).filter(Boolean)
  if (clean.length === 0 || idx.docs.size === 0) return []

  // 每个关键词独立求「id → 打分」，再按 AND 语义求交集、总分相加
  let acc: Map<string, { score: number; fuzzy: boolean }> | null = null
  for (const token of clean) {
    const perToken = new Map<string, { score: number; fuzzy: boolean }>()
    for (const id of exactCandidates(idx, token)) {
      const m = scoreToken(idx, id, token, false)
      if (m) perToken.set(id, { score: m.score, fuzzy: false })
    }
    if (perToken.size === 0) {
      // 精确通道无命中 → trigram 模糊通道兜底（打错字 / 记得不精确的场景）
      for (const id of fuzzyCandidates(idx, token)) {
        const m = scoreToken(idx, id, token, true)
        if (m) perToken.set(id, { score: m.score, fuzzy: true })
      }
    }
    if (perToken.size === 0) return [] // AND：任一关键词零命中 → 整体零结果
    if (acc === null) {
      acc = perToken
    } else {
      const next = new Map<string, { score: number; fuzzy: boolean }>()
      for (const [id, cur] of acc) {
        const add = perToken.get(id)
        if (add) next.set(id, { score: cur.score + add.score, fuzzy: cur.fuzzy || add.fuzzy })
      }
      acc = next
      if (acc.size === 0) return []
    }
  }

  const hits: SearchHit[] = []
  for (const [id, v] of acc ?? []) {
    hits.push({ id, score: Math.round(v.score * 1000) / 1000, fuzzy: v.fuzzy })
  }
  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (idx.docs.get(b.id)?.updatedAt ?? 0) - (idx.docs.get(a.id)?.updatedAt ?? 0)
  })
  return hits
}
