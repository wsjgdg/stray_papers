import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/cache'
import { titleSimilarity } from '@/lib/dedup'
import { fetchCrossrefByDOI, normalizeCrossrefWork, type CrossrefWork } from '@/lib/crossref'
import { sanitizePaperText } from '@/lib/text-sanitizer'
import { importDoisSchema, parseOr400 } from '@/lib/schemas'

// ─── Multi-key failover helpers (R3) ────────────────────────────────────────
//
// Same pattern as `papers/search/route.ts` but specialized for CrossRef DOI
// lookups. Reads `x-search-configs` (preferred) and falls back to the legacy
// `x-crossref-email` header when the multi-config header is absent.

type SearchConfigType = 's2' | 'crossref' | 'openalex' | 'unpaywall'
type SearchConfigsByType = Record<SearchConfigType, string[]>

/**
 * Parse the `x-search-configs` header into a per-source-type list of keys.
 * Returns empty arrays for every type when the header is absent or
 * malformed. See `papers/search/route.ts` for full docs.
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
 * Try `fetchCrossrefByDOI` against each CrossRef key in priority order. On a
 * thrown error (429 / 5xx / network after the underlying retry+breaker
 * logic), log a warning and try the next key.
 *
 * Returns:
 *   - `{ work, error: null }` on success (work may be `null` for a
 *     legitimate 404 — DOI not registered in CrossRef; this is NOT an error
 *     and does NOT trigger failover to the next key).
 *   - `{ work: null, error }` when all keys have been exhausted with errors.
 *
 * If `crossrefKeys` is empty, the function still calls once with `undefined`
 * so `fetchCrossrefByDOI` falls back to its built-in default polite email
 * (`research@example.com`).
 */
async function fetchCrossrefByDOIWithFailover(
  doi: string,
  crossrefKeys: string[],
): Promise<{ work: CrossrefWork | null; error: string | null }> {
  const tryKeys: Array<string | undefined> =
    crossrefKeys.length > 0 ? crossrefKeys : [undefined]
  let lastError: string | null = null
  for (let i = 0; i < tryKeys.length; i++) {
    const key = tryKeys[i]
    try {
      const work = await fetchCrossrefByDOI(doi, key)
      // `null` means CrossRef returned 404 — DOI not registered. This is a
      // legitimate "not found" result, not a transient failure, so we do
      // NOT try the next key. Surface it as a successful (but empty) result.
      return { work, error: null }
    } catch (e) {
      const msg = (e as Error).message
      lastError = msg
      const hasNext = i < tryKeys.length - 1
      if (hasNext) {
        console.warn(
          `[import-dois-failover] DOI ${doi} CrossRef key #${i + 1}/${tryKeys.length} failed: ${msg.slice(0, 100)}. Trying next key.`,
        )
      }
    }
  }
  return { work: null, error: lastError }
}

// POST /api/papers/import-dois
//
// Body:
//   { dois: string[], materialId?: string }
//
// For each DOI, fetches metadata from CrossRef (reusing fetchCrossrefByDOI
// which is wrapped by the circuit breaker + retry logic in src/lib/crossref),
// normalizes the work, and upserts it into the DB.
//
//   - Max 50 DOIs per request.
//   - Run in parallel with a concurrency limit of 5 (CrossRef polite pool).
//   - Material assignment: explicit materialId wins; otherwise auto-match
//     by material name in the title (longest match wins). Entries with no
//     match are skipped + reported in `errors`.
//
// Response:
//   {
//     imported: number,
//     failed: number,
//     errors: Array<{ doi: string; error: string }>,
//     total: number,
//   }

const MAX_DOIS = 50
const CONCURRENCY = 5

/**
 * Run an async mapper over `items` with at most `limit` calls in flight at
 * once. Preserves input order in the output. Errors are caught per-item and
 * surfaced as `{ ok: false, error }` entries so one bad DOI doesn't fail
 * the whole batch.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R; index: number } | { ok: false; error: string; index: number }>> {
  const results: Array<{ ok: true; value: R; index: number } | { ok: false; error: string; index: number }> = []
  let cursor = 0
  const worker = async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      try {
        const value = await fn(items[i], i)
        results.push({ ok: true, value, index: i })
      } catch (e) {
        results.push({ ok: false, error: (e as Error).message, index: i })
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  // Sort by original index so the response order is stable + matches input.
  results.sort((a, b) => a.index - b.index)
  return results
}

/**
 * Normalize a raw DOI string: trim, strip any URL prefix (https://doi.org/,
 * http://dx.doi.org/, doi:), lowercase. Empty/invalid values yield ''.
 */
function normalizeDoi(raw: string): string {
  let d = (raw || '').trim()
  if (!d) return ''
  // Strip URL prefixes
  d = d.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
  d = d.replace(/^doi:/i, '')
  // CrossRef DOIs are case-insensitive but conventionally lowercased
  return d.trim().toLowerCase()
}

/**
 * Split a pasted blob of DOIs into a clean list. Accepts newlines, commas,
 * semicolons, and whitespace as separators. De-dupes case-insensitively
 * while preserving order.
 */
function splitDois(blob: string): string[] {
  const parts = (blob || '')
    .split(/[\r\n,;]+/)
    .map((s) => normalizeDoi(s))
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of parts) {
    if (seen.has(d)) continue
    seen.add(d)
    out.push(d)
  }
  return out
}

/**
 * Auto-match a material by checking which material name (or alias) appears
 * in the title. Longest match wins (most specific). Mirrors the helper in
 * the import-bibtex route.
 */
async function matchMaterialIdByTitle(
  title: string,
  materials: Array<{ id: string; name: string; aliases: string }>,
): Promise<string | null> {
  const lower = title.toLowerCase()
  let best: { id: string; len: number } | null = null
  for (const m of materials) {
    const name = m.name.toLowerCase()
    if (name && lower.includes(name)) {
      if (!best || name.length > best.len) best = { id: m.id, len: name.length }
    }
    if (m.aliases) {
      for (const alias of m.aliases.split(';').map((a) => a.trim()).filter(Boolean)) {
        const a = alias.toLowerCase()
        if (a && lower.includes(a)) {
          if (!best || a.length > best.len) best = { id: m.id, len: a.length }
        }
      }
    }
  }
  return best?.id ?? null
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parsed = parseOr400(importDoisSchema, body)
  if (!parsed.ok) return parsed.response

  const { dois, materialId } = parsed.data

  // Accept either an array of DOIs or a single newline/comma-separated blob
  // (the UI sends a blob; programmatic callers may send an array).
  const rawList = Array.isArray(dois)
    ? dois
    : typeof dois === 'string'
    ? splitDois(dois)
    : []

  // Normalize + de-dupe
  const cleanDois: string[] = []
  const seen = new Set<string>()
  for (const d of rawList) {
    const n = normalizeDoi(String(d))
    if (!n || seen.has(n)) continue
    seen.add(n)
    cleanDois.push(n)
  }

  if (cleanDois.length === 0) {
    return NextResponse.json(
      { error: 'dois is required (array or newline/comma-separated string)' },
      { status: 400 },
    )
  }

  if (cleanDois.length > MAX_DOIS) {
    return NextResponse.json(
      {
        error: `too many DOIs (${cleanDois.length}) — max ${MAX_DOIS} per request`,
      },
      { status: 413 },
    )
  }

  // Resolve the explicit target material (if provided)
  let explicitMaterial: { id: string; name: string } | null = null
  if (materialId) {
    explicitMaterial = await db.material.findUnique({
      where: { id: materialId },
      select: { id: true, name: true },
    })
    if (!explicitMaterial) {
      return NextResponse.json(
        { error: 'material not found' },
        { status: 404 },
      )
    }
  }

  // Polite-pool email for CrossRef — resolve multi-config keys (R3) with
  // fallback to the legacy `x-crossref-email` single-key header. Empty list
  // means `fetchCrossrefByDOIWithFailover` will try once with `undefined`,
  // letting the underlying client use its built-in default polite email.
  const searchConfigs = parseSearchConfigs(req.headers.get('x-search-configs'))
  const crossrefKeys = (() => {
    if (searchConfigs.crossref.length > 0) return searchConfigs.crossref
    const legacy = req.headers.get('x-crossref-email')?.trim()
    return legacy ? [legacy] : []
  })()

  // Fetch all DOIs in parallel (capped to 5 concurrent requests). Each DOI
  // lookup tries CrossRef keys in priority order via `fetchCrossrefByDOIWithFailover` (R3).
  const fetchResults = await mapWithConcurrency(cleanDois, CONCURRENCY, async (doi) => {
    const { work, error } = await fetchCrossrefByDOIWithFailover(doi, crossrefKeys)
    if (error) {
      return { doi, work: null, error }
    }
    if (!work) {
      // CrossRef returned 404 — DOI not registered
      return { doi, work: null, error: 'DOI not found in CrossRef' }
    }
    return { doi, work, error: null as string | null }
  })

  // Preload materials for auto-matching (only when no explicit materialId)
  const allMaterials = explicitMaterial
    ? []
    : await db.material.findMany({ select: { id: true, name: true, aliases: true } })

  let imported = 0
  let failed = 0
  const errors: Array<{ doi: string; error: string }> = []

  for (const r of fetchResults) {
    if (!r.ok) {
      // Network / unexpected error during fetch
      failed++
      errors.push({ doi: cleanDois[r.index], error: r.error })
      continue
    }
    const { doi, work, error } = r.value
    if (!work) {
      failed++
      errors.push({ doi, error: error || 'not found' })
      continue
    }

    const norm = normalizeCrossrefWork(work)
    const cleanTitle = sanitizePaperText(norm.title || '')
    if (!cleanTitle || cleanTitle === 'Untitled') {
      failed++
      errors.push({ doi, error: 'no title from CrossRef' })
      continue
    }

    // Resolve material: explicit override > auto-match by title
    const resolvedMaterialId = explicitMaterial?.id ||
      (await matchMaterialIdByTitle(cleanTitle, allMaterials))
    if (!resolvedMaterialId) {
      failed++
      errors.push({
        doi,
        error: 'no material matched — pick a target material',
      })
      continue
    }

    try {
      // Find existing paper by DOI (within material) first, then by title
      let existing: { id: string; abstract: string; authors: string; citationCount: number } | null = null
      existing = await db.paper.findFirst({
        where: { doi, materialId: resolvedMaterialId },
        select: { id: true, abstract: true, authors: true, citationCount: true },
      })
      if (!existing) {
        const candidates = await db.paper.findMany({
          where: { materialId: resolvedMaterialId, title: { not: '' } },
          select: { id: true, title: true, doi: true, abstract: true, authors: true, citationCount: true },
        })
        for (const c of candidates) {
          if (c.doi && doi && c.doi.toLowerCase() === doi) {
            existing = c
            break
          }
          if (titleSimilarity(cleanTitle, c.title) >= 0.85) {
            existing = c
            break
          }
        }
      }

      const cleanAbstract = sanitizePaperText(norm.abstract || '')

      if (existing) {
        // Backfill missing fields; refresh citation count (CrossRef is authoritative)
        const patch: Record<string, unknown> = {}
        if (!existing.abstract && cleanAbstract) patch.abstract = cleanAbstract
        if (!existing.authors && norm.authors) patch.authors = norm.authors
        if ((existing.citationCount || 0) < (norm.citationCount || 0)) {
          patch.citationCount = norm.citationCount
        }
        if (Object.keys(patch).length > 0) {
          await db.paper.update({ where: { id: existing.id }, data: patch })
          imported++
        } else {
          // Already fully up-to-date — count as imported (matched + verified)
          imported++
        }
        continue
      }

      await db.paper.create({
        data: {
          materialId: resolvedMaterialId,
          title: cleanTitle,
          year: norm.year,
          doi,
          abstract: cleanAbstract,
          authors: norm.authors,
          venue: sanitizePaperText(norm.venue || ''),
          url: norm.url || `https://doi.org/${doi}`,
          citationCount: norm.citationCount,
          source: 'crossref',
          altSources: '',
          oaUrl: '',
          oaStatus: '',
        },
      })
      imported++
    } catch (e) {
      failed++
      errors.push({ doi, error: (e as Error).message })
    }
  }

  invalidate('stats:')
  invalidate('citations:')
  invalidate('coverage')

  return NextResponse.json({
    imported,
    failed,
    errors,
    total: cleanDois.length,
  })
}
