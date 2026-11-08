// OpenAlex API client - comprehensive open scholarly metadata
// Docs: https://docs.openalex.org/
// Free, no key required (polite pool with email).
//
// Resilience strategy:
//   1. CircuitBreaker — if OpenAlex is consistently failing (429/5xx/network),
//      open the circuit so subsequent requests fail fast. OpenAlex is usually
//      reliable but shares its CDN with high-traffic partners, so occasional
//      5xx blips happen; a 5-failure / 30s breaker keeps a brief outage from
//      cascading.
//   2. fetchWithRetry — retry 429 / 5xx with exponential backoff, honouring
//      the `Retry-After` header when present.

import { CircuitBreaker, fetchWithRetry, type CircuitBreakerStatus } from './api-client-resilience'
import { sanitizePaperText } from './text-sanitizer'

const OPENALEX_BASE = 'https://api.openalex.org/works'

// ---------------------------------------------------------------------------
// Retry config (env-overridable)
// ---------------------------------------------------------------------------
const OPENALEX_RETRY = {
  maxRetries: Number(process.env.OPENALEX_RETRY_MAX ?? 4),
  baseDelayMs: Number(process.env.OPENALEX_RETRY_BASE_MS ?? 1000),
}

// ---------------------------------------------------------------------------
// Module-level breaker instance for OpenAlex
// ---------------------------------------------------------------------------
export const openalexBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  name: 'openalex',
})

/**
 * Observable snapshot of the OpenAlex circuit breaker.
 * Useful for a status pill in the UI or a /api/sources/status endpoint.
 */
export function getOpenAlexBreakerStatus(): CircuitBreakerStatus {
  return openalexBreaker.getStatus()
}

/**
 * OpenAlex-specific fetchWithRetry wrapper. Binds the shared retry helper to
 * the OpenAlex breaker + env-overridable retry config.
 */
function openalexFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetchWithRetry(url, init, {
    breaker: openalexBreaker,
    maxRetries: OPENALEX_RETRY.maxRetries,
    baseDelayMs: OPENALEX_RETRY.baseDelayMs,
    name: 'openalex',
  })
}

export interface OpenAlexAuthorship {
  author?: { display_name?: string; id?: string }
  raw_author_name?: string
}

export interface OpenAlexLocation {
  source?: { display_name?: string; issn_l?: string }
  landing_page_url?: string
  pdf_url?: string
  is_oa?: boolean
  version?: string
}

export interface OpenAlexWork {
  id: string
  doi?: string | null
  title?: string
  abstract_inverted_index?: Record<string, number[]> | null
  publication_year?: number | null
  publication_date?: string | null
  authorships?: OpenAlexAuthorship[]
  primary_location?: OpenAlexLocation | null
  best_oa_location?: OpenAlexLocation | null
  cited_by_count?: number
  type?: string
  open_access?: { is_oa?: boolean; oa_url?: string | null; oa_status?: string | null }
  referenced_works?: string[]
}

export interface OpenAlexResponse {
  meta: { count: number }
  results: OpenAlexWork[]
}

/**
 * Reconstruct abstract text from OpenAlex inverted index.
 */
export function reconstructAbstract(inv?: Record<string, number[]> | null): string {
  if (!inv) return ''
  const positions: Array<{ word: string; pos: number }> = []
  for (const [word, idxs] of Object.entries(inv)) {
    for (const pos of idxs) positions.push({ word, pos })
  }
  positions.sort((a, b) => a.pos - b.pos)
  return positions.map(p => p.word).join(' ')
}

/**
 * Search OpenAlex for works matching the query (full-text search).
 * 429 / 5xx responses are retried with exponential backoff.
 * @param email Optional email for OpenAlex polite pool (higher rate limits)
 */
export async function searchOpenAlex(query: string, perPage = 15, email?: string): Promise<OpenAlexWork[]> {
  const mailto = email || 'research@matlit.dev'
  const url = `${OPENALEX_BASE}?search=${encodeURIComponent(query)}&per-page=${perPage}&select=id,doi,title,abstract_inverted_index,publication_year,publication_date,authorships,primary_location,best_oa_location,cited_by_count,type,open_access&mailto=${encodeURIComponent(mailto)}`
  const resp = await openalexFetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': `MatLitMiner/1.0 (mailto:${mailto})` },
  })
  if (!resp.ok) {
    throw new Error(`OpenAlex search failed: ${resp.status} ${resp.statusText}`)
  }
  const json: OpenAlexResponse = await resp.json()
  return json.results ?? []
}

/**
 * Normalize an OpenAlex work to the shared paper shape.
 */
export function normalizeOpenAlexWork(w: OpenAlexWork) {
  const authors = (w.authorships ?? [])
    .map(a => a.author?.display_name || a.raw_author_name || '')
    .filter(Boolean)
    .join('; ')
  const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, '') : ''
  const venue = w.primary_location?.source?.display_name || ''
  const url = w.primary_location?.landing_page_url || (doi ? `https://doi.org/${doi}` : '')
  return {
    title: sanitizePaperText(w.title || 'Untitled'),
    year: w.publication_year ?? null,
    doi,
    abstract: sanitizePaperText(reconstructAbstract(w.abstract_inverted_index)),
    authors,
    venue,
    url,
    citationCount: w.cited_by_count ?? 0,
    // OpenAlex-specific OA enrichment
    oaUrl: w.best_oa_location?.pdf_url || w.open_access?.oa_url || '',
    oaStatus: w.open_access?.oa_status || (w.open_access?.is_oa ? 'oa' : ''),
  }
}
