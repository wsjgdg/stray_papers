import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'

// GET /api/stats - dashboard aggregate stats
//
// T4: server-side TTL bumped from 30s → 5min. This query aggregates 8
// counts + 4 groupBy queries on every cold call (~220ms). It only changes
// on mutations, and every mutation already calls `invalidate('stats:')`
// (see materials/papers/verify/experiments routes), so a longer TTL is
// safe: invalidation is instant, TTL is just the natural-expiry backstop.
export async function GET() {
  const data = await getOrSet(
    'stats:overview',
    5 * 60_000, // 5 min
    async () => {
      const [
        materialsCount,
        papersCount,
        classificationsCount,
        synthesizedCount,
        extractedCount,
        efficiencyCount,
        verifiedCount,
        pendingVerificationCount,
      ] = await Promise.all([
        db.material.count(),
        db.paper.count(),
        db.classification.count(),
        db.classification.count({ where: { synthesized: 'yes' } }),
        db.classification.count({ where: { status: 'extracted' } }),
        db.efficiency.count(),
        db.verification.count({ where: { status: 'verified' } }),
        db.verification.count({ where: { status: 'pending' } }),
      ])

      // papers per material (top 10)
      const papersPerMaterial = await db.material.findMany({
        take: 10,
        orderBy: { papers: { _count: 'desc' } },
        select: {
          id: true,
          name: true,
          _count: { select: { papers: true } },
        },
      })

      // category breakdown
      const byCategory = await db.material.groupBy({
        by: ['category'],
        _count: { _all: true },
      })

      // synthesized breakdown
      const bySynthesized = await db.classification.groupBy({
        by: ['synthesized'],
        _count: { _all: true },
      })

      // top efficiency records
      const topEfficiencies = await db.efficiency.findMany({
        orderBy: { efficiencyValue: 'desc' },
        take: 8,
        include: { material: { select: { name: true } } },
      })

      return {
        counts: {
          materials: materialsCount,
          papers: papersCount,
          classifications: classificationsCount,
          synthesized: synthesizedCount,
          extracted: extractedCount,
          efficiency: efficiencyCount,
          verified: verifiedCount,
          pendingVerification: pendingVerificationCount,
        },
        papersPerMaterial: papersPerMaterial.map(m => ({
          name: m.name,
          count: m._count.papers,
        })),
        byCategory: byCategory.map(c => ({ category: c.category, count: c._count._all })),
        bySynthesized: bySynthesized.map(s => ({ synthesized: s.synthesized, count: s._count._all })),
        topEfficiencies: topEfficiencies.map(e => ({
          material: e.material.name,
          efficiency: e.efficiencyValue,
          certified: e.certified,
          source: e.source,
        })),
      }
    },
  )

  return NextResponse.json(data)
}
