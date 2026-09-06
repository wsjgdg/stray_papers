// Unpaywall API client - open-access PDF locator by DOI
// Docs: https://unpaywall.org/products/api
// Free, requires email. Best for enriching existing papers with OA PDF links.

const UNPAYWALL_BASE = 'https://api.unpaywall.org/v2'
const EMAIL = 'research@matlit.dev'

export interface UnpaywallLocation {
  url?: string
  url_for_pdf?: string
  url_for_landing_page?: string
  host_type?: string
  version?: string
  license?: string
  is_best?: boolean
}

export interface UnpaywallResult {
  doi: string
  is_oa: boolean
  oa_status?: string // gold | green | hybrid | bronze | closed
  best_oa_location?: UnpaywallLocation | null
  oa_locations?: UnpaywallLocation[]
  title?: string
  published_date?: string
  genre?: string
  journal_name?: string
}

/**
 * Look up the OA status + best PDF URL for a DOI.
 * @param email Optional email for Unpaywall (required by API, defaults to matlit.dev)
 */
export async function getOaLocation(doi: string, email?: string): Promise<UnpaywallResult | null> {
  if (!doi) return null
  const mailto = email || EMAIL
  const url = `${UNPAYWALL_BASE}/${encodeURIComponent(doi)}?email=${encodeURIComponent(mailto)}`
  try {
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': `MatLitMiner/1.0 (mailto:${mailto})` },
    })
    if (!resp.ok) return null
    return (await resp.json()) as UnpaywallResult
  } catch {
    return null
  }
}

/**
 * Batch enrich: returns a map of doi -> { oaUrl, oaStatus }.
 * Concurrency-limited to be polite (Unpaywall asks ~100k/day).
 */
export async function batchGetOa(
  dois: string[],
  concurrency = 4,
  email?: string,
): Promise<Record<string, { oaUrl: string; oaStatus: string }>> {
  const result: Record<string, { oaUrl: string; oaStatus: string }> = {}
  let idx = 0
  async function worker() {
    while (idx < dois.length) {
      const doi = dois[idx++]
      if (!doi) continue
      const r = await getOaLocation(doi, email)
      if (r) {
        result[doi] = {
          oaUrl: r.best_oa_location?.url_for_pdf || r.best_oa_location?.url || '',
          oaStatus: r.oa_status || (r.is_oa ? 'oa' : 'closed'),
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, dois.length) }, () => worker()))
  return result
}
