import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/papers/summary — lightweight aggregation endpoint.
//
// Replaces the 4 heavy `/api/papers?limit=500` calls in
// knowledge-graph, papers-timeline, and history-trend-chart that were
// downloading ~500 full paper objects (~50KB each) just to compute
// aggregated counts. This endpoint returns ONLY the fields each caller
// needs.
//
// Variants:
//   ?groupBy=material[&materialIds=id1,id2]
//     → [{ materialId, paperIds: string[] }]
//     Used by the citation-context view in the knowledge graph: it
//     only needs to know which paper IDs belong to which material so it
//     can look up cached citation contexts in batches.
//
//   ?groupBy=year
//     → [{ year, count }]
//     Used by the papers-by-year bar chart in PapersTimeline.
//
//   ?groupBy=year&includeEfficiency=true
//     → [{ year, count, maxEfficiency, avgEfficiency }]
//     Used by the HistoryTrendChart popover. `efficiencyValue` is the
//     per-paper Classification.efficiencyValue string parsed to a
//     number; papers with no parseable efficiency are excluded from the
//     efficiency aggregates but still counted in `count`.
//
// The response is cached for 5 minutes via Cache-Control + Next.js
// fetch memoization (same URL within one request batch hits the same
// Prisma query).

const FIVE_MINUTES = 300

interface MaterialGroup {
  materialId: string
  paperIds: string[]
}

interface YearGroup {
  year: number
  count: number
}

interface YearEfficiencyGroup {
  year: number
  count: number
  maxEfficiency: number | null
  avgEfficiency: number | null
}

function parseBool(v: string | null): boolean {
  return v === 'true' || v === '1' || v === 'yes'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupBy = searchParams.get('groupBy')
  const includeEfficiency = parseBool(searchParams.get('includeEfficiency'))
  const materialIdsParam = searchParams.get('materialIds')?.trim()

  // ─── groupBy=material ────────────────────────────────────────────────
  // Returns only materialId + paperIds[] (no abstracts/titles/authors).
  if (groupBy === 'material') {
    // Optional filter: only return groups for the requested material IDs.
    // Used by the knowledge graph so we don't pull papers for the other
    // ~40 materials that aren't in the current graph.
    const materialIds = materialIdsParam
      ? materialIdsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null

    // Sanity-cap: 200 material IDs per call (the dataset has ~60).
    const filteredIds = materialIds ? materialIds.slice(0, 200) : null

    const where =
      filteredIds && filteredIds.length > 0
        ? { materialId: { in: filteredIds } }
        : {}

    const rows = await db.paper.findMany({
      where,
      select: { id: true, materialId: true },
      // Order by materialId so the grouping is stable / cacheable.
      orderBy: [{ materialId: 'asc' }, { createdAt: 'desc' }],
    })

    const byMat = new Map<string, string[]>()
    for (const r of rows) {
      const arr = byMat.get(r.materialId)
      if (arr) arr.push(r.id)
      else byMat.set(r.materialId, [r.id])
    }

    const result: MaterialGroup[] = Array.from(byMat.entries()).map(
      ([materialId, paperIds]) => ({ materialId, paperIds }),
    )

    const res = NextResponse.json(result)
    res.headers.set(
      'Cache-Control',
      `public, max-age=${FIVE_MINUTES}, s-maxage=${FIVE_MINUTES}, stale-while-revalidate=${FIVE_MINUTES}`,
    )
    return res
  }

  // ─── groupBy=year ────────────────────────────────────────────────────
  // Returns year + count, optionally with efficiency aggregates.
  if (groupBy === 'year') {
    if (includeEfficiency) {
      // Join Paper → Classification to pull the per-paper efficiency
      // string. SQLite stores it as TEXT so we parse to float on the
      // server (cheaper than shipping the strings to the client).
      const rows = await db.paper.findMany({
        where: { year: { not: null } },
        select: {
          year: true,
          classification: { select: { efficiencyValue: true } },
        },
        orderBy: { year: 'asc' },
      })

      const map = new Map<number, { count: number; effs: number[] }>()
      for (const r of rows) {
        const y = r.year
        if (y === null) continue
        const entry = map.get(y) ?? { count: 0, effs: [] }
        entry.count++
        const ev = r.classification?.efficiencyValue
        if (ev) {
          const n = parseFloat(ev)
          if (Number.isFinite(n) && n > 0) entry.effs.push(n)
        }
        map.set(y, entry)
      }

      const result: YearEfficiencyGroup[] = Array.from(map.entries())
        .map(([year, v]) => ({
          year,
          count: v.count,
          maxEfficiency: v.effs.length > 0 ? Math.max(...v.effs) : null,
          avgEfficiency:
            v.effs.length > 0
              ? Number(
                  (v.effs.reduce((a, b) => a + b, 0) / v.effs.length).toFixed(2),
                )
              : null,
        }))
        .sort((a, b) => a.year - b.year)

      const res = NextResponse.json(result)
      res.headers.set(
        'Cache-Control',
        `public, max-age=${FIVE_MINUTES}, s-maxage=${FIVE_MINUTES}, stale-while-revalidate=${FIVE_MINUTES}`,
      )
      return res
    }

    // Plain year + count — no efficiency join.
    const rows = await db.paper.findMany({
      where: { year: { not: null } },
      select: { year: true },
    })

    const map = new Map<number, number>()
    for (const r of rows) {
      if (r.year === null) continue
      map.set(r.year, (map.get(r.year) ?? 0) + 1)
    }

    const result: YearGroup[] = Array.from(map.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year)

    const res = NextResponse.json(result)
    res.headers.set(
      'Cache-Control',
      `public, max-age=${FIVE_MINUTES}, s-maxage=${FIVE_MINUTES}, stale-while-revalidate=${FIVE_MINUTES}`,
    )
    return res
  }

  // Unknown / missing groupBy — fail fast with a helpful hint.
  return NextResponse.json(
    {
      error:
        "Invalid 'groupBy'. Supported values: 'material', 'year'. Optional: 'includeEfficiency=true' (with groupBy=year), 'materialIds=id1,id2' (with groupBy=material).",
    },
    { status: 400 },
  )
}
