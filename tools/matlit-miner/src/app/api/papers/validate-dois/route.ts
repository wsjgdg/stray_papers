import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { batchValidateDois } from '@/lib/doi-validator'
import { mergeApiKeys } from '@/lib/api-keys'

// POST /api/papers/validate-dois
// Body: { paperIds?: string[] }
//   - If paperIds omitted: validates all papers with non-empty DOI (limit 100).
//   - If provided: validates only those papers (still limited to 100 total).
//
// Returns:
//   { results: [{ paperId, doi, valid, title?, registered? }], validCount, invalidCount, total }
//
// Uses Crossref's `works/{doi}` endpoint with a 3-concurrent rate limit.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { paperIds } = (body || {}) as { paperIds?: string[] }

  // Build the query
  const where: Record<string, unknown> = { doi: { not: '' } }
  if (Array.isArray(paperIds) && paperIds.length > 0) {
    where.id = { in: paperIds.slice(0, 100) }
  }

  const papers = await db.paper.findMany({
    where,
    select: { id: true, doi: true, title: true },
    take: 100,
    orderBy: { createdAt: 'desc' },
  })

  if (papers.length === 0) {
    return NextResponse.json({
      results: [],
      validCount: 0,
      invalidCount: 0,
      total: 0,
    })
  }

  // Read user-configured crossref email from headers (polite pool)
  const keys = mergeApiKeys({
    crossrefEmail: req.headers.get('x-crossref-email') || undefined,
  })

  const doiToPapers = new Map<string, typeof papers>()
  for (const p of papers) {
    const doi = p.doi.trim()
    if (!doi) continue
    const arr = doiToPapers.get(doi) || []
    arr.push(p)
    doiToPapers.set(doi, arr)
  }

  const validated = await batchValidateDois(
    Array.from(doiToPapers.keys()),
    keys.crossrefEmail || undefined,
    3,
  )

  const results = papers.map((p) => {
    const doi = p.doi.trim()
    const v = doi ? validated.get(doi) : undefined
    return {
      paperId: p.id,
      doi,
      title: p.title,
      valid: v?.valid ?? false,
      registered: v?.registered,
      crossrefTitle: v?.title,
      error: v?.error,
    }
  })

  const validCount = results.filter((r) => r.valid).length
  const invalidCount = results.length - validCount

  return NextResponse.json({
    results,
    validCount,
    invalidCount,
    total: results.length,
  })
}
