// arXiv API client - preprint server, strong for physics/materials
// Docs: https://info.arxiv.org/help/api/index.html
// Free, no key. Returns Atom XML.

import { sanitizePaperText } from './text-sanitizer'

const ARXIV_BASE = 'https://export.arxiv.org/api/query'

export interface ArxivEntry {
  id: string // arxiv URL
  title: string
  summary: string
  published: string
  updated?: string
  authors: string[]
  doi?: string
  primaryCategory?: string
  pdfUrl?: string
  journalRef?: string
}

/**
 * Search arXiv for entries matching the query.
 */
export async function searchArxiv(query: string, max = 15): Promise<ArxivEntry[]> {
  // arXiv search uses its own query syntax; we pass a simple all: term
  const url = `${ARXIV_BASE}?search_query=all:${encodeURIComponent(query)}&max_results=${max}&sortBy=relevance`
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/atom+xml', 'User-Agent': 'MatLitMiner/1.0' },
  })
  if (!resp.ok) {
    throw new Error(`arXiv search failed: ${resp.status} ${resp.statusText}`)
  }
  const xml = await resp.text()
  return parseArxivAtom(xml)
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Minimal Atom XML parser for arXiv responses (no external dep).
 */
function parseArxivAtom(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = []
  // match each <entry>...</entry>
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let m: RegExpExecArray | null
  while ((m = entryRegex.exec(xml)) !== null) {
    const body = m[1]
    const pick = (tag: string): string => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(body)
      return r ? decodeXml(r[1].trim()) : ''
    }
    const pickAttr = (tag: string, attr: string): string => {
      const r = new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`).exec(body)
      return r ? r[1] : ''
    }
    const authors: string[] = []
    const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g
    let am: RegExpExecArray | null
    while ((am = authorRegex.exec(body)) !== null) {
      authors.push(decodeXml(am[1].trim()))
    }
    const id = pick('id')
    const arxivId = id.replace(/^https?:\/\/arxiv\.org\/abs\//i, '')
    entries.push({
      id,
      title: pick('title').replace(/\s+/g, ' '),
      summary: pick('summary').replace(/\s+/g, ' '),
      published: pick('published'),
      updated: pick('updated') || undefined,
      authors,
      doi: pick('arxiv:doi') || pick('doi') || undefined,
      primaryCategory: pickAttr('arxiv:primary_category', 'term'),
      pdfUrl: pickAttr('link', 'href') || `https://arxiv.org/pdf/${arxivId}`,
      journalRef: pick('arxiv:journal_ref') || undefined,
    })
  }
  return entries
}

/**
 * Normalize an arXiv entry to the shared paper shape.
 */
export function normalizeArxivEntry(e: ArxivEntry) {
  const year = e.published ? parseInt(e.published.slice(0, 4), 10) : null
  return {
    title: sanitizePaperText(e.title || 'Untitled'),
    year,
    doi: e.doi || '',
    abstract: sanitizePaperText(e.summary || ''),
    authors: e.authors.join('; '),
    venue: e.journalRef || (e.primaryCategory ? `arXiv [${e.primaryCategory}]` : 'arXiv'),
    url: e.id,
    citationCount: 0, // arXiv doesn't provide citation counts
    oaUrl: e.pdfUrl || '',
    oaStatus: 'green',
  }
}
