import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'

// GET /api/coverage
// Returns a per-material status matrix for the dashboard coverage grid.
//
// T4: server-side TTL bumped from 30s → 5min. The query pulls every
// material + nested papers/classifications/efficiencies/verifications
// (slow on a DB with many materials — ~80ms cold). All mutations that
// affect coverage (paper/material/verification CRUD) call
// `invalidate('coverage')`, so a longer TTL is safe — invalidation is
// instant, TTL is only the natural-expiry backstop.
export async function GET() {
  const data = await getOrSet(
    'coverage',
    5 * 60_000, // 5 min
    async () => {
      const materials = await db.material.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          category: true,
          papers: { select: { id: true } },
          classifications: { select: { id: true, synthesized: true, status: true } },
          efficiencies: { select: { id: true } },
          verifications: { select: { status: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
        },
      })

      const matrix = materials.map((m) => {
        const synthesizedCount = m.classifications.filter((c) => c.synthesized === 'yes').length
        const extractedCount = m.classifications.filter((c) => c.status === 'extracted').length
        const hasClassification = m.classifications.length > 0
        return {
          id: m.id,
          name: m.name,
          category: m.category,
          paperCount: m.papers.length,
          hasClassification,
          synthesizedCount,
          extractedCount,
          hasEfficiency: m.efficiencies.length > 0,
          verificationStatus: m.verifications[0]?.status || 'pending',
        }
      })

      const summary = {
        total: matrix.length,
        withPapers: matrix.filter((m) => m.paperCount > 0).length,
        withClassification: matrix.filter((m) => m.hasClassification).length,
        withSynthesis: matrix.filter((m) => m.synthesizedCount > 0).length,
        withExtraction: matrix.filter((m) => m.extractedCount > 0).length,
        withEfficiency: matrix.filter((m) => m.hasEfficiency).length,
        verified: matrix.filter((m) => m.verificationStatus === 'verified').length,
        flagged: matrix.filter((m) => m.verificationStatus === 'flagged').length,
      }

      return { matrix, summary }
    },
  )

  return NextResponse.json(data)
}
