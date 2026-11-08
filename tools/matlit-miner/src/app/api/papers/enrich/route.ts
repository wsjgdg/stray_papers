import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { batchGetOa } from '@/lib/unpaywall'

// POST /api/papers/enrich
// Body: { materialId?: string, limit?: number }
// Runs Unpaywall over papers that have a DOI but no oaUrl yet.
// Uses user-configured email from x-unpaywall-email header.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { materialId, limit = 50 } = body

  const unpaywallEmail = req.headers.get('x-unpaywall-email') || undefined

  const where: Record<string, unknown> = {
    doi: { not: '' },
    oaUrl: '',
  }
  if (materialId) where.materialId = materialId

  const papers = await db.paper.findMany({
    where,
    take: Math.min(limit, 200),
    select: { id: true, doi: true },
  })

  if (papers.length === 0) {
    return NextResponse.json({ message: 'No papers need enrichment', processed: 0 })
  }

  const dois = papers.map(p => p.doi).filter(Boolean)
  const oaMap = await batchGetOa(dois, 4, unpaywallEmail)

  let processed = 0
  for (const p of papers) {
    const oa = oaMap[p.doi]
    if (!oa) continue
    await db.paper.update({
      where: { id: p.id },
      data: {
        oaUrl: oa.oaUrl,
        oaStatus: oa.oaStatus,
      },
    })
    processed++
  }

  return NextResponse.json({
    processed,
    total: papers.length,
  })
}
