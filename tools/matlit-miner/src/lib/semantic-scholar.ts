// Semantic Scholar API client (server-side only)
// Docs: https://api.semanticscholar.org/api-docs/graph
//
// Resilience strategy:
//   1. CircuitBreaker — if S2 is consistently failing (429/5xx/network), open
//      the circuit so subsequent requests fail fast. S2's free tier is
//      notoriously aggressive with 429s, so we use a tighter threshold (5
//      consecutive failures) and a shorter cool-down (30s) than CrossRef.
//   2. fetchWithRetry — retry 429 / 5xx with exponential backoff, honouring
//      the `Retry-After` header that S2 returns on 429s. The previous
//      behaviour (429 throws immediately) is gone — we now back off and try
//      again before giving up.

import { CircuitBreaker, fetchWithRetry, type CircuitBreakerStatus } from './api-client-resilience'
import { sanitizePaperText } from './text-sanitizer'

const S2_BASE = 'https://api.semanticscholar.org/graph/v1'

// ---------------------------------------------------------------------------
// Retry config (env-overridable)
// ---------------------------------------------------------------------------
const S2_RETRY = {
  maxRetries: Number(process.env.S2_RETRY_MAX ?? 4),
  baseDelayMs: Number(process.env.S2_RETRY_BASE_MS ?? 1000),
}

// ---------------------------------------------------------------------------
// Module-level breaker instance for Semantic Scholar
// ---------------------------------------------------------------------------
// S2 429s much more readily than CrossRef, so a tighter threshold + shorter
// reset window keeps the circuit from sticking open for a full minute after
// a brief rate-limit blip.
export const s2Breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  name: 's2',
})

/**
 * Observable snapshot of the Semantic Scholar circuit breaker.
 * Useful for a status pill in the UI or a /api/sources/status endpoint.
 */
export function getS2BreakerStatus(): CircuitBreakerStatus {
  return s2Breaker.getStatus()
}

/**
 * S2-specific fetchWithRetry wrapper. Binds the shared retry helper to the
 * S2 breaker + env-overridable retry config.
 *
 * 429s (with or without Retry-After) are retried with backoff — the previous
 * "throw immediately on 429" behaviour is intentionally removed.
 */
function s2Fetch(url: string, init?: RequestInit): Promise<Response> {
  return fetchWithRetry(url, init, {
    breaker: s2Breaker,
    maxRetries: S2_RETRY.maxRetries,
    baseDelayMs: S2_RETRY.baseDelayMs,
    name: 's2',
  })
}

export interface S2Paper {
  paperId: string
  title: string
  year?: number | null
  abstract?: string | null
  venue?: string | null
  citationCount?: number | null
  url?: string
  externalIds?: {
    DOI?: string
    ArXiv?: string
    PubMed?: string
  }
  authors?: Array<{ name: string }>
}

export interface S2SearchResponse {
  total: number
  data: S2Paper[]
  offset: number
  next?: number
}

const FIELDS = 'title,year,abstract,venue,citationCount,url,externalIds,authors'

/**
 * Search Semantic Scholar for papers matching the query.
 * Respects rate limits (1 req/sec on free tier, higher with API key).
 * 429 responses are retried with exponential backoff (honouring Retry-After).
 * @param apiKey Optional Semantic Scholar API key for higher rate limits
 */
export async function searchPapers(query: string, limit = 20, apiKey?: string): Promise<S2Paper[]> {
  const url = `${S2_BASE}/paper/search?query=${encodeURIComponent(query)}&fields=${FIELDS}&limit=${limit}`
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  if (apiKey) {
    headers['x-api-key'] = apiKey
  }
  const resp = await s2Fetch(url, { headers })
  if (!resp.ok) {
    // 429 used to short-circuit here; now fetchWithRetry already exhausted
    // its backoff retries before letting the response through, so a 429 at
    // this point means "give up for real" — surface a clear message.
    if (resp.status === 429) {
      throw new Error('Semantic Scholar rate limit exceeded (429) after retries. Please wait and retry.')
    }
    throw new Error(`Semantic Scholar search failed: ${resp.status} ${resp.statusText}`)
  }
  const json: S2SearchResponse = await resp.json()
  return json.data ?? []
}

/**
 * Lookup a paper by DOI.
 * 429 / 5xx responses are retried with backoff; a 404 returns null.
 */
export async function getPaperByDOI(doi: string): Promise<S2Paper | null> {
  const url = `${S2_BASE}/paper/DOI:${encodeURIComponent(doi)}?fields=${FIELDS}`
  const resp = await s2Fetch(url, { headers: { 'Accept': 'application/json' } })
  if (resp.status === 404) return null
  if (!resp.ok) {
    throw new Error(`Semantic Scholar DOI lookup failed: ${resp.status} ${resp.statusText}`)
  }
  return (await resp.json()) as S2Paper
}

/**
 * Fetch paper details (recommendations / references) by paperId.
 * 429 / 5xx responses are retried with backoff; a 404 returns null.
 */
export async function getPaperDetails(paperId: string): Promise<S2Paper | null> {
  const url = `${S2_BASE}/paper/${encodeURIComponent(paperId)}?fields=${FIELDS}`
  const resp = await s2Fetch(url, { headers: { 'Accept': 'application/json' } })
  if (resp.status === 404) return null
  if (!resp.ok) {
    throw new Error(`Semantic Scholar paper details failed: ${resp.status} ${resp.statusText}`)
  }
  return (await resp.json()) as S2Paper
}

/**
 * Convert S2 paper to a normalized object for DB storage.
 */
export function normalizeS2Paper(p: S2Paper) {
  return {
    title: sanitizePaperText(p.title || 'Untitled'),
    year: p.year ?? null,
    doi: p.externalIds?.DOI || '',
    abstract: sanitizePaperText(p.abstract || ''),
    authors: (p.authors ?? []).map(a => a.name).join('; '),
    venue: p.venue || '',
    url: p.url || (p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : ''),
    citationCount: p.citationCount ?? 0,
  }
}
