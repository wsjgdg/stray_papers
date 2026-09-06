// CrossRef API client (fallback when Semantic Scholar is rate-limited)
// Docs: https://api.crossref.org/swagger-ui/index.html
//
// Resilience strategy:
//   1. CircuitBreaker — if CrossRef is consistently failing (429/5xx/network),
//      "open" the circuit so subsequent requests fail fast instead of piling
//      up against a degraded service. After `resetTimeoutMs`, allow a single
//      "half-open" probe; if it succeeds the circuit closes.
//   2. fetchWithRetry — for individual requests, retry 429/5xx with exponential
//      backoff (respecting Retry-After). The breaker wraps this: it decides
//      whether a request is even allowed to start.
//
// Both the CircuitBreaker class and the fetchWithRetry function live in the
// shared module `@/lib/api-client-resilience` so that S2 / OpenAlex / CrossRef
// all share the same pattern.

import {
  CircuitBreaker,
  type CircuitBreakerOptions,
  type CircuitBreakerStatus,
  type CircuitState,
  fetchWithRetry,
} from './api-client-resilience'
import { sanitizePaperText } from './text-sanitizer'

// Re-export the breaker types so any historical importer that did
// `import { CircuitBreaker, CircuitState } from '@/lib/crossref'` keeps working.
export { CircuitBreaker, type CircuitBreakerOptions, type CircuitBreakerStatus, type CircuitState }

const CROSSREF_BASE = 'https://api.crossref.org/works'

// ---------------------------------------------------------------------------
// Retry config (env-overridable)
// ---------------------------------------------------------------------------
const CROSSREF_RETRY = {
  maxRetries: Number(process.env.CROSSREF_RETRY_MAX ?? 4),
  baseDelayMs: Number(process.env.CROSSREF_RETRY_BASE_MS ?? 1000),
}

// ---------------------------------------------------------------------------
// Module-level breaker instance for CrossRef
// ---------------------------------------------------------------------------
export const crossrefBreaker = new CircuitBreaker({ name: 'crossref' })

/**
 * Observable snapshot of the CrossRef circuit breaker.
 * Useful for a status pill in the UI or a /api/health endpoint.
 */
export function getCrossrefBreakerStatus(): CircuitBreakerStatus {
  return crossrefBreaker.getStatus()
}

/**
 * CrossRef-specific fetchWithRetry wrapper. Binds the shared retry helper to
 * the CrossRef breaker + env-overridable retry config so call sites below
 * stay one-liners.
 */
function crossrefFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetchWithRetry(url, init, {
    breaker: crossrefBreaker,
    maxRetries: CROSSREF_RETRY.maxRetries,
    baseDelayMs: CROSSREF_RETRY.baseDelayMs,
    name: 'crossref',
  })
}

// ---------------------------------------------------------------------------
// CrossRef API surface
// ---------------------------------------------------------------------------

export interface CrossrefWork {
  DOI?: string
  title?: string[]
  abstract?: string
  'container-title'?: string[]
  author?: Array<{ given?: string; family?: string }>
  'published-print'?: { 'date-parts': Array<Array<number>> }
  'published-online'?: { 'date-parts': Array<Array<number>> }
  'is-referenced-by-count'?: number
  URL?: string
}

export interface CrossrefResponse {
  status: string
  message: {
    'total-results': number
    items: CrossrefWork[]
  }
}

/**
 * Search CrossRef for works matching the query.
 * Free, polite pool ~50 req/sec.
 * @param query  Free-text query (will be URL-encoded).
 * @param rows   Max results to return (default 15).
 * @param email  Optional email for CrossRef polite pool (higher rate limits).
 */
export async function searchCrossref(query: string, rows = 15, email?: string): Promise<CrossrefWork[]> {
  const mailto = email || 'research@example.com'
  const url = `${CROSSREF_BASE}?query=${encodeURIComponent(query)}&rows=${rows}&select=DOI,title,abstract,container-title,author,published-print,published-online,is-referenced-by-count,URL&mailto=${encodeURIComponent(mailto)}`
  const resp = await crossrefFetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': `MatLitMiner/1.0 (mailto:${mailto})`,
    },
  })
  if (!resp.ok) {
    throw new Error(`CrossRef search failed: ${resp.status} ${resp.statusText}`)
  }
  const json: CrossrefResponse = await resp.json()
  return json.message?.items ?? []
}

/**
 * Fetch a single CrossRef work by DOI.
 * @returns The work, or `null` if CrossRef has no record for this DOI (404).
 */
export async function fetchCrossrefByDOI(doi: string, email?: string): Promise<CrossrefWork | null> {
  const mailto = email || 'research@example.com'
  const url = `${CROSSREF_BASE}/${encodeURIComponent(doi)}?mailto=${encodeURIComponent(mailto)}`
  const resp = await crossrefFetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': `MatLitMiner/1.0 (mailto:${mailto})`,
    },
  })
  if (resp.status === 404) return null
  if (!resp.ok) {
    throw new Error(`CrossRef DOI lookup failed: ${resp.status} ${resp.statusText}`)
  }
  const json = (await resp.json()) as { message?: CrossrefWork }
  return json.message ?? null
}

/**
 * Normalize a CrossRef work to the same shape as S2 papers.
 */
export function normalizeCrossrefWork(w: CrossrefWork) {
  const yearPart =
    w['published-print']?.['date-parts']?.[0] ||
    w['published-online']?.['date-parts']?.[0] ||
    []
  const year = yearPart[0] ?? null
  const authors = (w.author ?? [])
    .map((a) => [a.given, a.family].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('; ')
  // CrossRef abstracts often come wrapped in <jats:p> tags - strip them
  const abstract = w.abstract ? sanitizePaperText(w.abstract) : ''
  return {
    title: sanitizePaperText((w.title && w.title[0]) || 'Untitled'),
    year,
    doi: w.DOI || '',
    abstract,
    authors,
    venue: (w['container-title'] && w['container-title'][0]) || '',
    url: w.URL || (w.DOI ? `https://doi.org/${w.DOI}` : ''),
    citationCount: w['is-referenced-by-count'] ?? 0,
  }
}
