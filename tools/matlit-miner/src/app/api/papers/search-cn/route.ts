import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { searchCrossref, normalizeCrossrefWork } from '@/lib/crossref'
import { mergeApiKeys } from '@/lib/api-keys'
import { invalidate } from '@/lib/cache'
import { deduplicatePapers, titleSimilarity } from '@/lib/dedup'
import { translatePaperText, getLLMConfigsFromHeaders, type LLMConfigEntry } from '@/lib/llm'
import { sanitizePaperText } from '@/lib/text-sanitizer'

// POST /api/papers/search-cn
// Search for Chinese-language papers via CrossRef using a translated
// (Chinese) query. CNKI/万方 require paid keys, so we approximate by
// querying CrossRef (which does index Chinese-language journals) with
// the user's query translated to Chinese, plus any Chinese aliases
// already attached to the material. Results are filtered to papers
// whose title contains CJK characters and tagged with
// `originalLanguage: 'zh'` so the UI can show the 中文 badge.
//
// Body:
//   { query?: string }                  // free-text query (translated to Chinese)
//   { materialId?: string }             // OR look up the material + its aliases
//   { limit?: number }                  // per query term (default 15, max 30)
//   { persist?: boolean }               // when true and materialId is set,
//                                       // save results into the Paper table
//                                       // (default: true when materialId is set)
//
// Response:
//   {
//     query: string,                    // original (English) query echoed back
//     chineseQueries: string[],         // translated queries actually sent to CrossRef
//     found: number,                    // count after CJK filtering + dedup
//     inserted?: number,                // when persisted
//     updated?: number,
//     papers: Array<{
//       title: string,
//       year: number | null,
//       doi: string,
//       abstract: string,
//       authors: string,
//       venue: string,
//       url: string,
//       citationCount: number,
//       originalLanguage: 'zh',
//     }>,
//     errors?: Array<{ source: string; error: string }>,
//   }

// Small built-in dictionary for common materials-science terms so the
// endpoint can build a useful Chinese query without depending on the
// LLM (useful when the LLM is unconfigured or rate-limited). The LLM
// is still tried first as a more general solution.
const ZH_DICT: Record<string, string> = {
  perovskite: '钙钛矿',
  'solar cell': '太阳能电池',
  'solar cells': '太阳能电池',
  photovoltaic: '光伏',
  photovoltaics: '光伏',
  semiconductor: '半导体',
  battery: '电池',
  batteries: '电池',
  catalyst: '催化剂',
  'light-emitting': '发光',
  led: '发光二极管',
  nanomaterial: '纳米材料',
  'thin film': '薄膜',
  'thin films': '薄膜',
  'crystal structure': '晶体结构',
  alloy: '合金',
  polymer: '聚合物',
  electrode: '电极',
  electrolyte: '电解质',
  'band gap': '带隙',
  bandgap: '带隙',
  efficiency: '效率',
  'charge transport': '电荷传输',
  'hole transport': '空穴传输',
  'electron transport': '电子传输',
  'lead-free': '无铅',
  'mixed halide': '混合卤化物',
  'double perovskite': '双钙钛矿',
  methylammonium: '甲基铵',
  formamidinium: '甲脒',
  cesium: '铯',
  tin: '锡',
  lead: '铅',
  iodide: '碘化物',
  bromide: '溴化物',
  chloride: '氯化物',
  bismuth: '铋',
  antimony: '锑',
  copper: '铜',
  zinc: '锌',
  iron: '铁',
  titanium: '钛',
  oxide: '氧化物',
  sulfide: '硫化物',
  selenide: '硒化物',
}

// Returns true if the string contains any CJK Unified Ideograph.
function containsCJK(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s || '')
}

// Translate an arbitrary (likely English) query string into Chinese.
// Tries: (1) dictionary, (2) LLM (translatePaperText with empty abstract),
// (3) returns the original string as a last-resort fallback.
async function translateQueryToChinese(
  query: string,
  configs: LLMConfigEntry[],
): Promise<string> {
  const q = query.trim()
  if (!q) return ''
  // (1) Direct dictionary hit (case-insensitive).
  const lower = q.toLowerCase()
  if (ZH_DICT[lower]) return ZH_DICT[lower]
  // (1b) Tokenise and translate word-by-word, keeping unknown tokens as-is.
  // This handles "perovskite solar cell" → "钙钛矿 太阳能电池".
  const tokens = q.split(/\s+/).filter(Boolean)
  const translatedTokens = tokens.map((tok) => {
    const cleaned = tok.replace(/[^a-zA-Z-]/g, '').toLowerCase()
    return ZH_DICT[cleaned] || ZH_DICT[tok.toLowerCase()] || tok
  })
  // If at least one token was translated, use the token-based result.
  if (translatedTokens.some((t, i) => t !== tokens[i])) {
    return translatedTokens.join(' ')
  }
  // (2) LLM fallback.
  try {
    const result = await translatePaperText(q, '', 'en', undefined, configs)
    // translatePaperText is designed for title+abstract; the title field
    // will hold the translated query. Sanity-check the result has CJK.
    if (result.title && containsCJK(result.title)) {
      return result.title.trim()
    }
  } catch (e) {
    // Fall through to the original-query return below, but log so we can
    // spot a broken translation backend vs. just an untranslated query.
    console.warn('[papers/search-cn] LLM query translation failed, using original:', e)
  }
  // (3) Last resort: return the original query so CrossRef can still try.
  return q
}

type NormPaper = {
  title: string
  year: number | null
  doi: string
  abstract: string
  authors: string
  venue: string
  url: string
  citationCount: number
  oaUrl: string
  oaStatus: string
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    query,
    materialId,
    limit = 15,
    persist,
  }: {
    query?: string
    materialId?: string
    limit?: number
    persist?: boolean
  } = body

  const perQuery = Math.min(Math.max(1, Number(limit) || 15), 30)

  // Configure LLM from request headers (used by translateQueryToChinese).
  // Falls back to the server env OpenAI config when none supplied.
  const configs = getLLMConfigsFromHeaders(req.headers)

  // API keys (for CrossRef polite pool)
  const keys = mergeApiKeys({
    crossrefEmail: req.headers.get('x-crossref-email') || undefined,
  })

  // Resolve the effective English query + any pre-existing Chinese aliases.
  let englishQuery = ''
  let materialName = ''
  let materialCategory: string | undefined
  let chineseAliases: string[] = []
  let resolvedMaterialId: string | undefined
  if (materialId) {
    const material = await db.material.findUnique({ where: { id: materialId } })
    if (!material) {
      return NextResponse.json({ error: 'material not found' }, { status: 404 })
    }
    materialName = material.name
    materialCategory = material.category || undefined
    resolvedMaterialId = material.id
    englishQuery = material.name
    // Split aliases on ';' and keep any that contain CJK.
    if (material.aliases) {
      const all = material.aliases
        .split(';')
        .map((a) => a.trim())
        .filter(Boolean)
      chineseAliases = all.filter(containsCJK)
    }
  } else if (typeof query === 'string' && query.trim()) {
    englishQuery = query.trim()
  } else {
    return NextResponse.json(
      { error: 'either `query` or `materialId` is required' },
      { status: 400 },
    )
  }

  // Build the list of Chinese query strings to fire at CrossRef.
  // We always try the LLM/dictionary translation of the English query,
  // and additionally include any Chinese aliases already on the material.
  const chineseQueries: string[] = []
  const primaryZh = await translateQueryToChinese(englishQuery, configs)
  if (primaryZh && !chineseQueries.includes(primaryZh)) {
    chineseQueries.push(primaryZh)
  }
  // Add a more specific "材料 + 钙钛矿" style query when we know it's a perovskite.
  if (materialCategory === 'perovskite' && primaryZh && !primaryZh.includes('钙钛矿')) {
    chineseQueries.push(`${primaryZh} 钙钛矿`)
  }
  for (const alias of chineseAliases) {
    if (!chineseQueries.includes(alias)) chineseQueries.push(alias)
  }
  // Deduplicate case-insensitively while preserving order.
  const seen = new Set<string>()
  const uniqueQueries = chineseQueries.filter((q) => {
    const k = q.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  const merged = new Map<string, NormPaper>()
  const errors: Array<{ source: string; error: string }> = []
  const sourceCounts: Record<string, number> = {}

  const register = (p: NormPaper) => {
    // Hard filter: keep only papers whose title contains CJK characters.
    // This is the "Chinese paper" signal — CrossRef occasionally returns
    // English-titled hits for a Chinese query, and we want to drop those.
    if (!containsCJK(p.title)) return
    const key = (p.doi || p.title).toLowerCase().trim()
    // Look for an existing duplicate (DOI or high title similarity).
    let bestMatchKey: string | null = null
    for (const [existingKey, existing] of merged.entries()) {
      if (p.doi && existing.doi && p.doi.toLowerCase() === existing.doi.toLowerCase()) {
        bestMatchKey = existingKey
        break
      }
      if (p.title && existing.title && titleSimilarity(p.title, existing.title) >= 0.85) {
        bestMatchKey = existingKey
        break
      }
    }
    if (!bestMatchKey) {
      merged.set(key, { ...p })
    } else {
      const existing = merged.get(bestMatchKey)!
      if (!existing.abstract && p.abstract) existing.abstract = p.abstract
      if (!existing.doi && p.doi) existing.doi = p.doi
      if ((existing.citationCount || 0) < (p.citationCount || 0)) {
        existing.citationCount = p.citationCount
      }
    }
    sourceCounts['crossref_cn'] = (sourceCounts['crossref_cn'] || 0) + 1
  }

  // Fire one CrossRef request per Chinese query, in parallel.
  const tasks = uniqueQueries.map(
    (q) =>
      new Promise<void>(async (resolve) => {
        try {
          // Append the material category suffix so CrossRef ranks
          // domain-relevant hits higher (matches the existing search
          // route's "solar cell" suffix pattern for perovskites).
          const suffix = materialCategory === 'perovskite' ? ' 太阳能电池' : ''
          const fullQuery = `${q}${suffix}`
          const works = await searchCrossref(fullQuery, perQuery, keys.crossrefEmail || undefined)
          for (const w of works) {
            const norm = normalizeCrossrefWork(w)
            // Re-sanitize defensively (normalizeCrossrefWork already does this).
            register({
              title: sanitizePaperText(norm.title),
              year: norm.year,
              doi: norm.doi,
              abstract: sanitizePaperText(norm.abstract),
              authors: norm.authors,
              venue: norm.venue,
              url: norm.url,
              citationCount: norm.citationCount,
              oaUrl: '',
              oaStatus: '',
            })
          }
        } catch (e) {
          errors.push({ source: `crossref_cn:${q}`, error: (e as Error).message })
        }
        resolve()
      }),
  )
  await Promise.allSettled(tasks)

  const collected = deduplicatePapers(Array.from(merged.values()), 0.85)

  // Tag every surviving paper as Chinese.
  const papers = collected.map((p) => ({
    ...p,
    originalLanguage: 'zh' as const,
  }))

  // Optional persistence — only when a materialId was supplied and the
  // caller didn't explicitly disable it. Mirrors the search/route.ts
  // persistence shape so the papers show up in the regular list view.
  let inserted = 0
  let updated = 0
  const shouldPersist = resolvedMaterialId !== undefined && persist !== false
  if (shouldPersist && papers.length > 0) {
    for (const p of papers) {
      let existing: {
        id: string
        title: string
        doi: string
        abstract: string
        originalLanguage: string
      } | null = null
      if (p.doi) {
        existing = await db.paper.findFirst({
          where: { doi: p.doi, materialId: resolvedMaterialId },
        })
      }
      if (!existing) {
        const candidates = await db.paper.findMany({
          where: { materialId: resolvedMaterialId!, title: { not: '' } },
          select: { id: true, title: true, doi: true, abstract: true, originalLanguage: true },
        })
        for (const c of candidates) {
          if (p.doi && c.doi && p.doi.toLowerCase() === c.doi.toLowerCase()) {
            existing = c
            break
          }
          if (p.title && c.title && titleSimilarity(p.title, c.title) >= 0.85) {
            existing = c
            break
          }
        }
      }

      if (existing) {
        // Merge: fill in missing abstract / language tag.
        const patch: Record<string, unknown> = {}
        if (!existing.abstract && p.abstract) patch.abstract = p.abstract
        // Always mark as Chinese if it isn't already.
        const existingLang = existing.originalLanguage
        if (!existingLang || existingLang === 'en') {
          patch.originalLanguage = 'zh'
        }
        if (Object.keys(patch).length > 0) {
          await db.paper.update({ where: { id: existing.id }, data: patch })
          updated++
        }
        continue
      }

      await db.paper.create({
        data: {
          materialId: resolvedMaterialId!,
          title: p.title,
          year: p.year,
          doi: p.doi,
          abstract: p.abstract,
          authors: p.authors,
          venue: p.venue,
          url: p.url,
          citationCount: p.citationCount,
          source: 'crossref_cn',
          altSources: '',
          oaUrl: '',
          oaStatus: '',
          originalLanguage: 'zh',
        },
      })
      inserted++
    }

    invalidate('stats:')
    invalidate('citations:')
    invalidate('coverage')
  }

  return NextResponse.json({
    query: englishQuery,
    materialName: materialName || undefined,
    chineseQueries: uniqueQueries,
    found: papers.length,
    ...(shouldPersist ? { inserted, updated } : {}),
    papers,
    sourceCounts,
    errors: errors.length ? errors : undefined,
  })
}
