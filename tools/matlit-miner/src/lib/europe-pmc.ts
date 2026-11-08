// Europe PMC API client - biomedical/chemistry open repository
// Docs: https://europepmc.org/RestfulWebService
// Free, no key. Returns JSON.

import { sanitizePaperText } from './text-sanitizer'

const EPMC_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'

export interface EuropePmcResult {
  id: string
  source?: string
  pmid?: string
  pmcid?: string
  doi?: string
  title?: string
  abstractText?: string
  journalTitle?: string
  pubYear?: string
  authorString?: string
  citedByCount?: number
  isOpenAccess?: 'Y' | 'N'
  inEPMC?: 'Y' | 'N'
  inPMC?: 'Y' | 'N'
}

export interface EuropePmcResponse {
  hitCount: number
  resultList?: { result: EuropePmcResult[] }
}

/**
 * Search Europe PMC for articles matching the query.
 */
export async function searchEuropePmc(query: string, pageSize = 15): Promise<EuropePmcResult[]> {
  const url = `${EPMC_BASE}?query=${encodeURIComponent(query)}&format=json&pageSize=${pageSize}`
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'MatLitMiner/1.0' },
  })
  if (!resp.ok) {
    throw new Error(`Europe PMC search failed: ${resp.status} ${resp.statusText}`)
  }
  const json: EuropePmcResponse = await resp.json()
  return json.resultList?.result ?? []
}

/**
 * Normalize a Europe PMC result to the shared paper shape.
 */
export function normalizeEuropePmcResult(r: EuropePmcResult) {
  const year = r.pubYear ? parseInt(r.pubYear, 10) : null
  return {
    title: sanitizePaperText(r.title || 'Untitled'),
    year,
    doi: r.doi || '',
    abstract: sanitizePaperText(r.abstractText || ''),
    authors: r.authorString || '',
    venue: r.journalTitle || '',
    url: r.doi ? `https://doi.org/${r.doi}` : (r.pmid ? `https://europepmc.org/article/med/${r.pmid}` : ''),
    citationCount: r.citedByCount ?? 0,
    oaUrl: r.inEPMC === 'Y' && r.pmcid ? `https://europepmc.org/article/PMC/${r.pmcid}` : '',
    oaStatus: r.isOpenAccess === 'Y' ? 'oa' : '',
  }
}
