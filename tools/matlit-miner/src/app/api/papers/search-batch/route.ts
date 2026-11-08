import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { searchPapers, normalizeS2Paper } from '@/lib/semantic-scholar'
import { searchCrossref, normalizeCrossrefWork } from '@/lib/crossref'
import { searchOpenAlex, normalizeOpenAlexWork } from '@/lib/openalex'
import { searchArxiv, normalizeArxivEntry } from '@/lib/arxiv'
import { searchEuropePmc, normalizeEuropePmcResult } from '@/lib/europe-pmc'

// ─── Multi-key failover helpers (R3) ────────────────────────────────────────
//
// Mirrors the same logic in `papers/search/route.ts`. Kept duplicated rather
// than factored into a shared module because (a) the constraints for this
// task scope only these route files + api-client.ts, and (b) the inline
// helpers are small enough that the duplication cost is lower than the cost
// of a shared server-side utility module that would have to coexist with
// the client-side `api-client.ts`.

type SearchConfigType = 's2' | 'crossref' | 'openalex' | 'unpaywall'
type SearchConfigsByType = Record<SearchConfigType, string[]>

/**
 * Parse the `x-search-configs` header into a per-source-type list of keys,
 * preserving priority order. Returns empty arrays for every type when the
 * header is absent or malformed. See `papers/search/route.ts` for full docs.
 */
function parseSearchConfigs(headerValue: string | null): SearchConfigsByType {
  const empty: SearchConfigsByType = {
    s2: [],
    crossref: [],
    openalex: [],
    unpaywall: [],
  }
  if (!headerValue) return empty
  try {
    const parsed: unknown = JSON.parse(headerValue)
    if (!Array.isArray(parsed)) return empty
    const out: SearchConfigsByType = {
      s2: [],
      crossref: [],
      openalex: [],
      unpaywall: [],
    }
    const seen = new Set<string>()
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const obj = item as Record<string, unknown>
      const type = obj.type as SearchConfigType
      if (
        type !== 's2' &&
        type !== 'crossref' &&
        type !== 'openalex' &&
        type !== 'unpaywall'
      ) {
        continue
      }
      const key = typeof obj.key === 'string' ? obj.key.trim() : ''
      if (!key) continue
      const dedupeKey = `${type}:${key}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      out[type].push(key)
    }
    return out
  } catch {
    return empty
  }
}

/**
 * Resolve the final key list for a given source type — prefers `x-search-configs`
 * multi-config keys; falls back to the legacy single-key header; returns []
 * when neither is present (which makes `searchWithFailover` try once with
 * `undefined`, preserving pre-R3 default-rate-limit behavior).
 */
function resolveKeys(
  multi: SearchConfigsByType,
  type: SearchConfigType,
  legacyHeader: string | null,
): string[] {
  if (multi[type].length > 0) return multi[type]
  const legacy = legacyHeader?.trim()
  return legacy ? [legacy] : []
}

/**
 * Try `searchFn` against each key in priority order. On a thrown error,
 * log and try the next key. If `keys` is empty, still calls `searchFn(undefined)`
 * once so the underlying API uses its built-in defaults. Always resolves.
 */
async function searchWithFailover<T>(
  keys: string[],
  searchFn: (key: string | undefined) => Promise<T[]>,
  sourceLabel: string,
): Promise<{ results: T[]; error: string | null }> {
  const tryKeys: Array<string | undefined> =
    keys.length > 0 ? keys : [undefined]
  let lastError: string | null = null
  for (let i = 0; i < tryKeys.length; i++) {
    const key = tryKeys[i]
    try {
      const results = await searchFn(key)
      return { results, error: null }
    } catch (e) {
      const msg = (e as Error).message
      lastError = msg
      const hasNext = i < tryKeys.length - 1
      if (hasNext) {
        console.warn(
          `[search-batch-failover] ${sourceLabel} key #${i + 1}/${tryKeys.length} failed: ${msg.slice(0, 120)}. Trying next key.`,
        )
      }
    }
  }
  return { results: [], error: lastError }
}

// POST /api/papers/search-batch
// Body: {
//   limit?: number,           // per source per material
//   sources?: string[],
//   onlyEmpty?: boolean,      // only materials with 0 papers (default true)
//   maxMaterials?: number,    // safety cap (default 60)
// }
//
// Headers (optional, propagated from the client's settings dialog):
//   x-search-configs     — R3 multi-config JSON array (preferred)
//   x-s2-key             — legacy single Semantic Scholar key (fallback)
//   x-crossref-email     — legacy single CrossRef polite-pool email (fallback)
//   x-openalex-email     — legacy single OpenAlex polite-pool email (fallback)
//   x-unpaywall-email    — legacy single Unpaywall email (fallback)
//
// Sequentially searches every material and returns a per-material summary.
// For each material, the enabled sources are queried in parallel; within
// each source, keys are tried in priority order (R3 multi-key failover).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    limit = 10,
    sources = ['semantic_scholar', 'crossref', 'openalex', 'arxiv', 'europepmc'],
    onlyEmpty = true,
    maxMaterials = 60,
  } = body

  // Parse multi-config keys (R3). Falls back to legacy single-key headers
  // when the multi-config header is absent.
  const searchConfigs = parseSearchConfigs(req.headers.get('x-search-configs'))
  const s2Keys = resolveKeys(searchConfigs, 's2', req.headers.get('x-s2-key'))
  const crossrefKeys = resolveKeys(searchConfigs, 'crossref', req.headers.get('x-crossref-email'))
  const openalexKeys = resolveKeys(searchConfigs, 'openalex', req.headers.get('x-openalex-email'))

  const materials = await db.material.findMany({
    orderBy: { createdAt: 'asc' },
    take: maxMaterials,
    select: { id: true, name: true, aliases: true, category: true, _count: { select: { papers: true } } },
  })

  const targetMaterials = onlyEmpty
    ? materials.filter((m) => m._count.papers === 0)
    : materials

  const perMaterial: Array<{
    material: string
    found: number
    inserted: number
    errors: string[]
  }> = []
  let totalInserted = 0
  let totalErrors = 0

  for (const mat of targetMaterials) {
    const contextSuffix = mat.category === 'perovskite' ? ' perovskite' : ''
    const primaryQuery = `${mat.name}${contextSuffix}`
    const collected: Array<ReturnType<typeof normalizeS2Paper> & { _source: string; oaUrl: string; oaStatus: string }> = []
    const seenKeys = new Set<string>()
    const errors: string[] = []

    // Run sources in parallel for this one material. Within each source,
    // keys are tried in priority order via `searchWithFailover` (R3).
    const tasks: Array<Promise<void>> = []
    if (sources.includes('semantic_scholar')) {
      tasks.push((async () => {
        const { results, error } = await searchWithFailover(
          s2Keys,
          (k) => searchPapers(primaryQuery, limit, k),
          's2',
        )
        if (error) { errors.push(`S2: ${error.slice(0, 60)}`); return }
        for (const p of results) {
          const n = normalizeS2Paper(p)
          const k = (n.doi || n.title).toLowerCase().trim()
          if (!seenKeys.has(k)) { seenKeys.add(k); collected.push({ ...n, _source: 'semantic_scholar', oaUrl: '', oaStatus: '' }) }
        }
      })())
    }
    if (sources.includes('crossref')) {
      tasks.push((async () => {
        const { results, error } = await searchWithFailover(
          crossrefKeys,
          (k) => searchCrossref(`${primaryQuery} solar cell`, limit, k),
          'crossref',
        )
        if (error) { errors.push(`CR: ${error.slice(0, 60)}`); return }
        for (const w of results) {
          const n = normalizeCrossrefWork(w)
          const k = (n.doi || n.title).toLowerCase().trim()
          if (!seenKeys.has(k)) { seenKeys.add(k); collected.push({ ...n, _source: 'crossref', oaUrl: '', oaStatus: '' }) }
        }
      })())
    }
    if (sources.includes('openalex')) {
      tasks.push((async () => {
        const { results, error } = await searchWithFailover(
          openalexKeys,
          (k) => searchOpenAlex(`${primaryQuery} solar cell`, limit, k),
          'openalex',
        )
        if (error) { errors.push(`OA: ${error.slice(0, 60)}`); return }
        for (const w of results) {
          const n = normalizeOpenAlexWork(w)
          const k = (n.doi || n.title).toLowerCase().trim()
          if (!seenKeys.has(k)) { seenKeys.add(k); collected.push({ ...n, _source: 'openalex' }) }
        }
      })())
    }
    if (sources.includes('arxiv')) {
      tasks.push((async () => {
        try {
          for (const e of await searchArxiv(primaryQuery, Math.min(limit, 8))) {
            const n = normalizeArxivEntry(e)
            const k = (n.doi || n.title).toLowerCase().trim()
            if (!seenKeys.has(k)) { seenKeys.add(k); collected.push({ ...n, _source: 'arxiv' }) }
          }
        } catch (e) { errors.push(`aX: ${(e as Error).message.slice(0, 60)}`) }
      })())
    }
    if (sources.includes('europepmc')) {
      tasks.push((async () => {
        try {
          for (const r of await searchEuropePmc(`${primaryQuery} solar cell`, limit)) {
            const n = normalizeEuropePmcResult(r)
            const k = (n.doi || n.title).toLowerCase().trim()
            if (!seenKeys.has(k)) { seenKeys.add(k); collected.push({ ...n, _source: 'europepmc' }) }
          }
        } catch (e) { errors.push(`PMC: ${(e as Error).message.slice(0, 60)}`) }
      })())
    }
    await Promise.allSettled(tasks)

    let inserted = 0
    for (const p of collected) {
      const existing = p.doi
        ? await db.paper.findFirst({ where: { doi: p.doi, materialId: mat.id } })
        : await db.paper.findFirst({ where: { title: p.title, materialId: mat.id } })
      if (existing) continue
      await db.paper.create({
        data: {
          materialId: mat.id,
          title: p.title,
          year: p.year,
          doi: p.doi,
          abstract: p.abstract,
          authors: p.authors,
          venue: p.venue,
          url: p.url,
          citationCount: p.citationCount,
          source: p._source,
          oaUrl: p.oaUrl,
          oaStatus: p.oaStatus,
        },
      })
      inserted++
    }
    totalInserted += inserted
    totalErrors += errors.length
    perMaterial.push({ material: mat.name, found: collected.length, inserted, errors })
  }

  return NextResponse.json({
    materialsProcessed: perMaterial.length,
    totalInserted,
    totalErrors,
    perMaterial,
  })
}
