import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'

// GET /api/citations/top?limit=10&type=papers|materials
// Returns top-N papers (by citationCount) OR top-N materials (aggregated citation counts).
//
// T4: Added server-side caching (5min TTL, keyed by type+limit). This is a
// pure read over Paper.citationCount — values only change when papers are
// imported/updated, and every such mutation already calls
// `invalidate('citations:')` (see papers/search, import-dois, import-bibtex,
// upload-pdf, sanitize routes). 5min TTL keeps repeated dashboard visits
// sub-millisecond while still allowing instant invalidation on writes.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50)
  const type = searchParams.get('type') === 'materials' ? 'materials' : 'papers'

  const data = await getOrSet(
    `citations:top:${type}:${limit}`,
    5 * 60_000, // 5 min
    async () => {
      if (type === 'papers') {
        const papers = await db.paper.findMany({
          orderBy: { citationCount: 'desc' },
          take: limit,
          select: {
            id: true,
            title: true,
            year: true,
            doi: true,
            citationCount: true,
            material: { select: { name: true } },
          },
        })

        return {
          type: 'papers',
          items: papers.map((p) => ({
            id: p.id,
            title: p.title,
            year: p.year,
            doi: p.doi,
            citationCount: p.citationCount,
            materialName: p.material.name,
          })),
        }
      }

      // type === 'materials' — aggregate Paper.citationCount by materialId
      const papers = await db.paper.findMany({
        select: {
          materialId: true,
          citationCount: true,
          material: { select: { name: true } },
        },
      })

      const agg = new Map<
        string,
        { name: string; total: number; count: number }
      >()
      for (const p of papers) {
        const cur =
          agg.get(p.materialId) || { name: p.material.name, total: 0, count: 0 }
        cur.total += p.citationCount
        cur.count += 1
        agg.set(p.materialId, cur)
      }

      const items = Array.from(agg.entries())
        .map(([id, v]) => ({
          id,
          name: v.name,
          citationCount: v.total,
          paperCount: v.count,
        }))
        .sort((a, b) => b.citationCount - a.citationCount)
        .slice(0, limit)

      return { type: 'materials', items }
    },
  )

  return NextResponse.json(data)
}
