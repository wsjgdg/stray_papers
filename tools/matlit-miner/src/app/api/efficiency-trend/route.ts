import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'

// GET /api/efficiency-trend
// Returns efficiency records grouped by year for the trend line chart.
//
// T4: Added server-side caching (5min TTL). The query pulls every
// Efficiency record + its material (~115ms cold). Mutations that change
// efficiency data already call `invalidate('efficiency-trend')` (see
// experiments/route.ts), so the cache is always fresh after a write and
// the 5min TTL is just the natural-expiry backstop.
export async function GET() {
  const data = await getOrSet(
    'efficiency-trend',
    5 * 60_000, // 5 min
    async () => {
      const records = await db.efficiency.findMany({
        orderBy: { year: 'asc' },
        select: { efficiencyValue: true, year: true, certified: true, material: { select: { name: true } } },
      })

      // Group by year, take max efficiency per year
      const byYear = new Map<number, { year: number; maxEff: number; count: number; certified: number }>()
      for (const r of records) {
        const year = r.year ?? 0
        if (year === 0) continue
        const existing = byYear.get(year)
        if (!existing) {
          byYear.set(year, { year, maxEff: r.efficiencyValue, count: 1, certified: r.certified ? r.efficiencyValue : 0 })
        } else {
          existing.maxEff = Math.max(existing.maxEff, r.efficiencyValue)
          existing.count++
          if (r.certified) existing.certified = Math.max(existing.certified, r.efficiencyValue)
        }
      }

      const trend = Array.from(byYear.values()).sort((a, b) => a.year - b.year)
      return { trend }
    },
  )

  return NextResponse.json(data)
}
