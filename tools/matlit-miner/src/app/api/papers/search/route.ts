import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { searchPapers, normalizeS2Paper } from '@/lib/semantic-scholar'
import { searchCrossref, normalizeCrossrefWork } from '@/lib/crossref'
import { searchOpenAlex, normalizeOpenAlexWork } from '@/lib/openalex'
import { searchArxiv, normalizeArxivEntry } from '@/lib/arxiv'
import { searchEuropePmc, normalizeEuropePmcResult } from '@/lib/europe-pmc'
import { invalidate } from '@/lib/cache'
import { deduplicatePapers, titleSimilarity } from '@/lib/dedup'
import { logWarn, logInfo } from '@/lib/logger'

// ─── Multi-key failover helpers (R3) ────────────────────────────────────────
//
// The frontend (api-client.ts) sends an `x-search-configs` header containing
// a JSON array of all enabled SearchConfigEntry objects across all 4 source
// types (s2 / crossref / openalex / unpaywall), sorted by priority. We parse
// it once per request, group keys by source type (preserving priority order),
// and use `searchWithFailover` to try each key in turn: if the first key
// throws (429 / 5xx / network), we move on to the next. If `x-search-configs`
// is absent (older client), we fall back to the legacy single-key headers
// (`x-s2-key`, `x-crossref-email`, etc.) wrapped into a one-element list —
// preserving the pre-R3 behavior.

type SearchConfigType = 's2' | 'crossref' | 'openalex' | 'unpaywall'
type SearchConfigsByType = Record<SearchConfigType, string[]>

/**
 * Parse the `x-search-configs` header into a per-source-type list of keys,
 * preserving priority order. Returns empty arrays for every type when the
 * header is absent or malformed — callers then fall back to legacy headers.
 *
 * Defensive parsing: localStorage is untyped, and the header may have been
 * crafted by an older client (missing fields) or hand-edited. We coerce
 * each entry into a safe shape and de-dupe keys within each source.
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
      // De-dupe within each source — no point trying the same key twice.
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
 * Resolve the final key list for a given source type:
 *   1. If `x-search-configs` provided keys for this source → use them (in
 *      priority order).
 *   2. Else if the legacy single-key header is present → wrap it into a
 *      one-element list (keeps pre-R3 clients working).
 *   3. Else → return an empty list. `searchWithFailover` interprets an empty
 *      list as "try once with `undefined`" so the underlying API uses its
 *      default rate limits / polite pool.
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
 * Run `searchFn` against each key in `keys` in priority order. On a thrown
 * error (429 / 5xx / network), log a warning and try the next key. Returns
 * the results from the first successful attempt.
 *
 * If `keys` is empty, the function still calls `searchFn(undefined)` once so
 * the underlying API can fall back to its built-in defaults (e.g. CrossRef's
 * `research@example.com` polite email or S2's unauthenticated tier).
 *
 * Always resolves — never throws. Failures surface as `{ results: [], error }`.
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
        // S4: structured log instead of console.warn — keeps the same
        // human-readable info but now also emits a JSON line that log
        // aggregators can filter on `route: 'papers/search'`.
        logWarn('search: source key failover, trying next key', {
          route: 'papers/search',
          source: sourceLabel,
          keyIndex: i + 1,
          keyCount: tryKeys.length,
          error: msg.slice(0, 120),
        })
      }
    }
  }
  return { results: [], error: lastError }
}

// ─── Source-level fallback ordering (R4) ────────────────────────────────────
//
// When `fallbackOnError=true` and a source completely fails (all keys
// exhausted), we automatically retry the query with the next source in this
// canonical order. The chain mirrors typical reliability / coverage for
// materials-science queries: S2 → CrossRef → OpenAlex → arXiv → Europe PMC.
const FALLBACK_ORDER = [
  'semantic_scholar',
  'crossref',
  'openalex',
  'arxiv',
  'europepmc',
] as const

// GET /api/papers/search?q=...&limit=8
// Lightweight DB-side search across title / abstract / DOI for the
// command palette. Returns a minimal shape so the palette can render
// results without hydrating entire Paper records (no classification /
// altSources / OA metadata).
//
// Response: Array<{
//   id: string
//   title: string
//   doi: string
//   year: number | null
//   materialId: string
//   materialName: string
// }>
//
// Empty / whitespace-only `q` returns []. Capped at 25 results.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '8', 10) || 8), 25)

  if (!q) {
    return NextResponse.json([])
  }

  // Three-way OR on title / abstract / DOI. SQLite `contains` maps to
  // LIKE '%q%' (case-insensitive for ASCII). Order by year desc then
  // citationCount desc so the most-recent highly-cited hits surface first.
  const rows = await db.paper.findMany({
    where: {
      OR: [
        { title: { contains: q } },
        { abstract: { contains: q } },
        { doi: { contains: q } },
      ],
    },
    select: {
      id: true,
      title: true,
      doi: true,
      year: true,
      citationCount: true,
      materialId: true,
      material: { select: { name: true } },
    },
    orderBy: [{ year: 'desc' }, { citationCount: 'desc' }],
    take: limit,
  })

  const payload = rows.map((r) => ({
    id: r.id,
    title: r.title,
    doi: r.doi,
    year: r.year,
    materialId: r.materialId,
    materialName: r.material.name,
  }))

  return NextResponse.json(payload)
}

// POST /api/papers/search
// Body: {
//   materialId?: string,     // when provided, results are persisted to DB
//                           // linked to this material (existing behavior).
//   query?: string,         // free-text query; when provided WITHOUT a
//                           // materialId, runs a stateless search (no DB
//                           // persistence) — used for the R3 smoke test and
//                           // for ad-hoc queries that shouldn't pollute the
//                           // material's paper set. When both are provided,
//                           // `query` overrides the material's name as the
//                           // search term but results still persist.
//   limit?: number,           // per source
//   useAlias?: boolean,       // also search first alias (materialId mode only)
//   sources?: string[],       // subset of: semantic_scholar, crossref, openalex, arxiv, europepmc
//                            // default: all five
//   fallbackOnError?: boolean // R4 — when true, run sources sequentially and
//                            // auto-retry with the next source (even one not
//                            // in `sources`) if a source completely fails.
//                            // Default: false (parallel, current behavior).
// }
//
// At least one of `materialId` or `query` is required.
//
// For each source, keys are tried in priority order (R3 multi-key failover):
// if the first key fails (429/5xx/network), the next enabled key for that
// source is tried. Only when ALL keys for a source fail is the source
// considered "failed" — at which point (if `fallbackOnError=true`) the next
// source in the canonical chain is tried as a fallback.
//
// Merges results by DOI (or title fallback), records multi-source provenance
// (RRI-style), and (when materialId is provided) persists to DB.
//
// Response shape (materialId mode — existing):
//   { materialId, queried, sources, sourceCounts, found, inserted, updated,
//     dedupedSkipped, errors?, fallbacksTriggered? }
//   Status 502 when no papers retrieved from any source.
//
// Response shape (stateless mode — query only, no materialId):
//   { queried, sources, sourceCounts, found, results: NormPaper[],
//     errors?, fallbacksTriggered? }
//   Status 200 even when all sources fail (returns empty `results` + errors).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    materialId,
    query,
    limit = 15,
    useAlias = false,
    sources = ['semantic_scholar', 'crossref', 'openalex', 'arxiv', 'europepmc'],
    fallbackOnError = false,
  } = body

  // Require at least one of materialId or query.
  const hasQuery = typeof query === 'string' && query.trim().length > 0
  if (!materialId && !hasQuery) {
    return NextResponse.json(
      { error: 'materialId or query is required' },
      { status: 400 },
    )
  }

  logInfo('search: request received', {
    route: 'papers/search',
    mode: materialId ? 'materialId' : 'stateless',
    materialId: materialId ?? null,
    queryPreview: hasQuery ? String(query).slice(0, 60) : null,
    limit,
    sources,
    fallbackOnError,
  })

  // Optional material lookup — only when materialId is provided. When
  // absent, the request is in "stateless" mode (no DB persistence).
  let material: { name: string; aliases: string; category: string } | null = null
  if (materialId) {
    const m = await db.material.findUnique({
      where: { id: materialId },
      select: { name: true, aliases: true, category: true },
    })
    if (!m) {
      return NextResponse.json({ error: 'material not found' }, { status: 404 })
    }
    material = m
  }

  // Parse multi-config keys (R3). Falls back to legacy single-key headers
  // when the multi-config header is absent.
  const searchConfigs = parseSearchConfigs(req.headers.get('x-search-configs'))
  const s2Keys = resolveKeys(searchConfigs, 's2', req.headers.get('x-s2-key'))
  const crossrefKeys = resolveKeys(searchConfigs, 'crossref', req.headers.get('x-crossref-email'))
  const openalexKeys = resolveKeys(searchConfigs, 'openalex', req.headers.get('x-openalex-email'))

  // Build the primary search query:
  //   - Explicit `query` wins (used for stateless mode and for overriding
  //     the material name when both are provided).
  //   - Otherwise use the material's name (+ optional alias + perovskite
  //     context suffix) — existing behavior.
  let primaryQuery: string
  if (hasQuery) {
    primaryQuery = (query as string).trim()
  } else {
    // materialId was provided and material is non-null (validated above).
    const m = material as { name: string; aliases: string; category: string }
    const queryTerms = [m.name]
    if (useAlias && m.aliases) {
      const aliasList = m.aliases.split(';').map((a) => a.trim()).filter(Boolean)
      if (aliasList[0]) queryTerms.push(aliasList[0])
    }
    const contextSuffix = m.category === 'perovskite' ? ' perovskite' : ''
    primaryQuery = `${queryTerms[0]}${contextSuffix}`
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
  // Map of dedupeKey -> merged paper + sources that contributed
  const merged = new Map<string, NormPaper & { sources: Set<string> }>()
  const errors: Array<{ source: string; error: string }> = []
  const sourceCounts: Record<string, number> = {}

  // Helper to register a paper from a source
  const register = (p: NormPaper, source: string) => {
    const key = (p.doi || p.title).toLowerCase().trim()
    // Try to find an existing merged paper that's a duplicate (DOI match OR title similarity >= 0.85)
    let bestMatchKey: string | null = null
    for (const [existingKey, existing] of merged.entries()) {
      const exPaper = existing as NormPaper
      // Exact DOI match
      if (p.doi && exPaper.doi && p.doi.toLowerCase() === exPaper.doi.toLowerCase()) {
        bestMatchKey = existingKey
        break
      }
      // High title similarity (treat as duplicate)
      if (p.title && exPaper.title && titleSimilarity(p.title, exPaper.title) >= 0.85) {
        bestMatchKey = existingKey
        break
      }
    }
    if (!bestMatchKey) {
      merged.set(key, { ...p, sources: new Set([source]) })
    } else {
      const existing = merged.get(bestMatchKey!)!
      existing.sources.add(source)
      // Prefer the record with the richest abstract / OA info
      if (!existing.abstract && p.abstract) existing.abstract = p.abstract
      if (!existing.oaUrl && p.oaUrl) existing.oaUrl = p.oaUrl
      if (!existing.oaStatus && p.oaStatus) existing.oaStatus = p.oaStatus
      if ((existing.citationCount || 0) < (p.citationCount || 0)) existing.citationCount = p.citationCount
      // Prefer non-empty DOI
      if (!existing.doi && p.doi) existing.doi = p.doi
    }
    sourceCounts[source] = (sourceCounts[source] || 0) + 1
  }

  // Source runner: tries the source with multi-key failover (R3). Returns
  // the normalized papers from the first successful key, or `{ error }` if
  // all keys for that source failed.
  type SourceResult = {
    source: string
    papers: NormPaper[]
    error: string | null
  }
  const runSource = async (source: string): Promise<SourceResult> => {
    try {
      if (source === 'semantic_scholar') {
        const { results, error } = await searchWithFailover(
          s2Keys,
          (k) => searchPapers(primaryQuery, limit, k),
          's2',
        )
        if (error) return { source, papers: [], error }
        return {
          source,
          papers: results.map((p) => ({ ...normalizeS2Paper(p), oaUrl: '', oaStatus: '' })),
          error: null,
        }
      }
      if (source === 'crossref') {
        const { results, error } = await searchWithFailover(
          crossrefKeys,
          (k) => searchCrossref(`${primaryQuery} solar cell`, limit, k),
          'crossref',
        )
        if (error) return { source, papers: [], error }
        return {
          source,
          papers: results.map((w) => ({ ...normalizeCrossrefWork(w), oaUrl: '', oaStatus: '' })),
          error: null,
        }
      }
      if (source === 'openalex') {
        const { results, error } = await searchWithFailover(
          openalexKeys,
          (k) => searchOpenAlex(`${primaryQuery} solar cell`, limit, k),
          'openalex',
        )
        if (error) return { source, papers: [], error }
        return {
          source,
          papers: results.map((w) => normalizeOpenAlexWork(w)),
          error: null,
        }
      }
      if (source === 'arxiv') {
        // arXiv has no API key — single attempt, no failover.
        const entries = await searchArxiv(primaryQuery, Math.min(limit, 10))
        return {
          source,
          papers: entries.map((e) => normalizeArxivEntry(e)),
          error: null,
        }
      }
      if (source === 'europepmc') {
        // Europe PMC has no API key — single attempt, no failover.
        const results = await searchEuropePmc(`${primaryQuery} solar cell`, limit)
        return {
          source,
          papers: results.map((r) => normalizeEuropePmcResult(r)),
          error: null,
        }
      }
      return { source, papers: [], error: `unknown source: ${source}` }
    } catch (e) {
      return { source, papers: [], error: (e as Error).message }
    }
  }

  // Tracks sources that were auto-tried as a fallback (not in the original
  // `sources` list) — surfaced in the response so callers can see which
  // sources were used as recovery.
  const fallbacksTriggered: string[] = []

  if (fallbackOnError) {
    // ─── R4: Sequential source-level fallback ───────────────────────────
    // Try sources one at a time in priority order. If a source completely
    // fails (all keys exhausted), automatically try the next source in the
    // canonical fallback chain — even if it wasn't in the original `sources`
    // list. This implements "auto-retry other sources" for the same query.
    //
    // We continue iterating after a success too, so multi-source provenance
    // is still gathered — but once we have results AND have tried every
    // originally-requested source, additional fallback sources are skipped
    // (no need to keep probing once the user has data).
    const queue: string[] = []
    for (const s of sources) {
      if (!queue.includes(s)) queue.push(s)
    }
    for (const s of FALLBACK_ORDER) {
      if (!queue.includes(s)) queue.push(s)
    }

    let hasResults = false
    let originalSourcesTried = 0
    const originalCount = sources.length

    for (const source of queue) {
      const isFallback = !sources.includes(source)
      // Once we have results from all originally-requested sources, stop
      // probing fallback sources — we have enough data.
      if (isFallback && hasResults && originalSourcesTried >= originalCount) continue

      // Record any source tried as a fallback (whether it ultimately
      // succeeds or fails) so the caller can see which sources were
      // auto-tried as recovery.
      if (isFallback) fallbacksTriggered.push(source)

      const result = await runSource(source)
      if (!isFallback) originalSourcesTried++

      if (result.error) {
        errors.push({ source, error: result.error })
        // Continue to next source as fallback (R4).
        continue
      }
      for (const p of result.papers) register(p, source)
      if (result.papers.length > 0) hasResults = true
    }
  } else {
    // ─── Default: parallel execution (current behavior) ────────────────
    // All sources run concurrently. No source-level fallback — each source
    // independently fails or succeeds. Multi-key failover (R3) still
    // applies within each source.
    const tasks = sources.map((s) => runSource(s))
    const results = await Promise.all(tasks)
    for (const r of results) {
      if (r.error) {
        errors.push({ source: r.source, error: r.error })
        continue
      }
      for (const p of r.papers) register(p, r.source)
    }
  }

  if (merged.size === 0) {
    // Stateless mode (no materialId): return 200 with empty results +
    // errors so callers can introspect what failed without treating it as
    // a hard HTTP error. This is the path the R3 smoke test exercises.
    if (!materialId) {
      return NextResponse.json({
        queried: primaryQuery,
        sources,
        sourceCounts,
        found: 0,
        results: [],
        errors: errors.length ? errors : undefined,
        fallbacksTriggered: fallbacksTriggered.length ? fallbacksTriggered : undefined,
      })
    }
    // Material mode (existing behavior): 502 signals "all sources failed".
    return NextResponse.json(
      {
        error: 'No papers retrieved from any source.',
        errors,
        sourceCounts,
        fallbacksTriggered: fallbacksTriggered.length ? fallbacksTriggered : undefined,
      },
      { status: 502 },
    )
  }

  // Deduplicate the merged set across sources.
  const collected = deduplicatePapers(Array.from(merged.values()), 0.85)
  const dedupedSkipped = merged.size - collected.length

  // ─── Stateless mode (no materialId): skip DB persistence ────────────────
  // Return the raw merged + deduplicated papers so the caller can preview
  // without polluting any material's paper set.
  if (!materialId) {
    return NextResponse.json({
      queried: primaryQuery,
      sources,
      sourceCounts,
      found: collected.length,
      results: collected.map((p) => ({
        title: p.title,
        year: p.year,
        doi: p.doi,
        abstract: p.abstract,
        authors: p.authors,
        venue: p.venue,
        url: p.url,
        citationCount: p.citationCount,
        oaUrl: p.oaUrl,
        oaStatus: p.oaStatus,
        sources: Array.from(p.sources),
      })),
      dedupedSkipped,
      errors: errors.length ? errors : undefined,
      fallbacksTriggered: fallbacksTriggered.length ? fallbacksTriggered : undefined,
    })
  }

  // ─── Material mode: persist to DB ──────────────────────────────────────
  // Skip duplicates by DOI or title; merge sources if existing.
  let inserted = 0
  let updated = 0
  for (const p of collected) {
    // Find existing paper by DOI first, then by exact title, then by high-similarity title
    let existing: {
      id: string
      title: string
      doi: string
      altSources: string
      source: string
      oaUrl: string
      oaStatus: string
      abstract: string
    } | null = null
    if (p.doi) {
      existing = await db.paper.findFirst({ where: { doi: p.doi, materialId } })
    }
    if (!existing) {
      // Look for any paper for this material with similar title (handles cross-source duplicates)
      const candidatePapers = await db.paper.findMany({
        where: { materialId, title: { not: '' } },
        select: { id: true, title: true, doi: true, altSources: true, source: true, oaUrl: true, oaStatus: true, abstract: true },
      })
      for (const c of candidatePapers) {
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

    const sourceList = Array.from(p.sources)
    const primarySource = sourceList[0]
    const altSources = sourceList.slice(1).join(';')

    if (existing) {
      // Merge new source into altSources if not already recorded
      const existingAlts = existing.altSources
        ? existing.altSources.split(';').filter(Boolean)
        : []
      const existingSources = new Set([existing.source, ...existingAlts])
      const newAlts = sourceList.filter(s => !existingSources.has(s))
      if (newAlts.length > 0 || (!existing.oaUrl && p.oaUrl) || (!existing.abstract && p.abstract)) {
        await db.paper.update({
          where: { id: existing.id },
          data: {
            altSources: [...existingAlts, ...newAlts].join(';'),
            ...(p.oaUrl && !existing.oaUrl && { oaUrl: p.oaUrl }),
            ...(p.oaStatus && !existing.oaStatus && { oaStatus: p.oaStatus }),
            ...(p.abstract && !existing.abstract && { abstract: p.abstract }),
          },
        })
        updated++
      }
      continue
    }

    await db.paper.create({
      data: {
        materialId,
        title: p.title,
        year: p.year,
        doi: p.doi,
        abstract: p.abstract,
        authors: p.authors,
        venue: p.venue,
        url: p.url,
        citationCount: p.citationCount,
        source: primarySource,
        altSources,
        oaUrl: p.oaUrl,
        oaStatus: p.oaStatus,
      },
    })
    inserted++
  }

  // Invalidate cached aggregates that depend on the paper set
  invalidate('stats:')
  invalidate('citations:')
  invalidate('coverage')

  // Q6 — broadcast a notification to subscribers of this material when new
  // papers are inserted. Best-effort: never fail the main response if the
  // emit fails (realtime service down, network blip, etc.). Only emit when
  // something was actually inserted so we don't spam "0 new" notifications.
  if (inserted > 0) {
    // Find the latest paper (by year, fallback to first collected) to surface
    // as a teaser in the notification toast on the client.
    const latest = collected.reduce<{ title: string; year: number | null } | null>(
      (acc, p) => {
        if (!acc) return { title: p.title, year: p.year }
        if ((p.year ?? 0) > (acc.year ?? 0)) return { title: p.title, year: p.year }
        return acc
      },
      null,
    )
    // material is non-null here (materialId was provided and validated).
    const matName = (material as { name: string }).name
    fetch(`${process.env.REALTIME_HTTP_URL || 'http://localhost:3005'}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'notification:new',
        data: {
          materialId,
          materialName: matName,
          newCount: inserted,
          latestPaperTitle: latest?.title ?? null,
          latestPaperDate: latest?.year ?? null,
        },
        // Restrict broadcast to clients subscribed to this material's room.
        room: `material:${materialId}`,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({
    materialId,
    queried: primaryQuery,
    sources: sources,
    sourceCounts,
    found: collected.length,
    inserted,
    updated,
    dedupedSkipped,
    errors: errors.length ? errors : undefined,
    fallbacksTriggered: fallbacksTriggered.length ? fallbacksTriggered : undefined,
  })
}
