// DOI batch validation via Crossref.
// Calls https://api.crossref.org/works/{doi} for each DOI and reports
// whether the DOI is registered, plus basic metadata for confirmation.

export interface ValidationResult {
  valid: boolean
  doi?: string
  title?: string
  registered?: string // ISO date string from Crossref 'created' or 'published'
  error?: string
}

const CROSSREF_BASE = 'https://api.crossref.org/works'

function buildMailto(email?: string): string {
  const mailto = email && email.includes('@') ? email : 'research@example.com'
  return mailto
}

/**
 * Validate a single DOI via Crossref.
 * Returns { valid: true, doi, title, registered } if found, or { valid: false } otherwise.
 */
export async function validateDoi(
  doi: string,
  email?: string,
): Promise<ValidationResult> {
  const cleanDoi = doi.trim()
  if (!cleanDoi) return { valid: false, error: 'empty DOI' }

  const mailto = buildMailto(email)
  const url = `${CROSSREF_BASE}/${encodeURIComponent(cleanDoi)}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': `MatLitMiner/1.0 (mailto:${mailto})`,
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (resp.status === 404) {
      return { valid: false, doi: cleanDoi, error: 'not found in Crossref' }
    }
    if (!resp.ok) {
      return { valid: false, doi: cleanDoi, error: `HTTP ${resp.status}` }
    }

    const json = (await resp.json()) as {
      message?: {
        DOI?: string
        title?: string[]
        'published-print'?: { 'date-parts'?: number[][] }
        'published-online'?: { 'date-parts'?: number[][] }
        created?: { 'date-parts'?: number[][] }
      }
    }
    const msg = json.message || {}
    const title = (msg.title && msg.title[0]) || ''
    const dateParts =
      msg['published-print']?.['date-parts']?.[0] ||
      msg['published-online']?.['date-parts']?.[0] ||
      msg.created?.['date-parts']?.[0] ||
      []
    const registered = dateParts.length
      ? `${dateParts[0]}${dateParts[1] ? `-${String(dateParts[1]).padStart(2, '0')}` : ''}${dateParts[2] ? `-${String(dateParts[2]).padStart(2, '0')}` : ''}`
      : ''

    return {
      valid: true,
      doi: msg.DOI || cleanDoi,
      title: title.slice(0, 200),
      registered,
    }
  } catch (e) {
    clearTimeout(timeout)
    const err = e as Error
    return {
      valid: false,
      doi: cleanDoi,
      error: err.name === 'AbortError' ? 'timeout' : err.message.slice(0, 80),
    }
  }
}

/**
 * Validate many DOIs concurrently with a rate limit.
 * Default concurrency = 3 (Crossref polite pool supports much higher,
 * but we stay conservative to be safe).
 *
 * @returns Map<doi, ValidationResult>
 */
export async function batchValidateDois(
  dois: string[],
  email?: string,
  concurrency = 3,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, ValidationResult>> {
  const results = new Map<string, ValidationResult>()
  const unique = Array.from(new Set(dois.map(d => d.trim()).filter(Boolean)))
  let index = 0
  let done = 0
  const total = unique.length

  async function worker() {
    while (index < unique.length) {
      const current = index++
      const doi = unique[current]
      const result = await validateDoi(doi, email)
      results.set(doi, result)
      done++
      onProgress?.(done, total)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()),
  )
  return results
}
