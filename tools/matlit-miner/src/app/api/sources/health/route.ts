import { NextResponse } from 'next/server'
import { getOrSet } from '@/lib/cache'

// GET /api/sources/health
// Pings each literature API to check if it's reachable.
// Uses short timeouts (5s) and shared in-memory caching (60s TTL) to minimize latency.
// arXiv uses a HEAD request instead of GET (faster, no XML download).

const CACHE_KEY = 'sources:health'
const CACHE_TTL = 60_000 // 60 seconds

export async function GET() {
  const data = await getOrSet(
    CACHE_KEY,
    CACHE_TTL,
    async () => {
      const checks = [
        { id: 'semantic_scholar', url: 'https://api.semanticscholar.org/graph/v1/paper/search?query=test&limit=1&fields=title', method: 'GET' },
        { id: 'crossref', url: 'https://api.crossref.org/works?query=test&rows=1&select=DOI', method: 'GET' },
        { id: 'openalex', url: 'https://api.openalex.org/works?search=test&per-page=1&select=id', method: 'GET' },
        { id: 'arxiv', url: 'https://export.arxiv.org/api/query?search_query=all:test&max_results=1', method: 'HEAD' },
        { id: 'europepmc', url: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=test&format=json&pageSize=1', method: 'GET' },
        { id: 'unpaywall', url: 'https://api.unpaywall.org/v2/10.1038/nature12352?email=research@matlit.dev', method: 'GET' },
      ]

      const results = await Promise.all(
        checks.map(async (check) => {
          const start = Date.now()
          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5000)
            const resp = await fetch(check.url, {
              method: check.method,
              signal: controller.signal,
              headers: { 'User-Agent': 'MatLitMiner/1.0 (mailto:research@matlit.dev)' },
            })
            clearTimeout(timeout)
            const latency = Date.now() - start
            return {
              id: check.id,
              status: resp.ok ? 'up' : 'degraded',
              statusCode: resp.status,
              latency,
            }
          } catch (e) {
            const latency = Date.now() - start
            return {
              id: check.id,
              status: 'down',
              statusCode: 0,
              latency,
              error: (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message.slice(0, 60),
            }
          }
        }),
      )

      return { results }
    },
  )

  return NextResponse.json(data)
}
