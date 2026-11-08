import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'

// GET /api/stats/history?granularity=day|week|month&days=90
// Returns the number of papers added per time bucket + cumulative count.
//
// Prisma stores DateTime columns as INTEGER (Unix ms) in SQLite, so we
// convert to a date string via `date(createdAt/1000, 'unixepoch')`.
//
//   - day   -> date(createdAt/1000, 'unixepoch')         -> 'YYYY-MM-DD'
//   - week  -> strftime('%Y-%W', createdAt/1000, 'unixepoch')  -> 'YYYY-WW'
//   - month -> strftime('%Y-%m', createdAt/1000, 'unixepoch')  -> 'YYYY-MM'
//
// Response shape:
//   { points: [{ date, count, cumulative }], granularity, days, total }
//
// T4: Added server-side caching (5min TTL, keyed by granularity+days). The
// raw SQL aggregation runs over the full Paper table (~125ms cold). Paper
// imports / deletions change the underlying data, but no mutation today
// calls `invalidate('stats-history')` — the 5min TTL is the freshness
// backstop, and a manual refresh (or any future invalidation hook) keeps
// it correct. Acceptable for a research dashboard where the user isn't
// actively watching the history chart while importing papers.

type Row = { bucket: string | null; c: bigint | number }

interface HistoryPoint {
  date: string
  count: number
  cumulative: number
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}

function bucketToIsoDate(bucket: string, granularity: string): string {
  if (granularity === 'month') {
    // 'YYYY-MM' -> 'YYYY-MM-01' (sortable)
    return `${bucket}-01`
  }
  if (granularity === 'week') {
    // 'YYYY-WW' -> Monday of that ISO week (sortable date string).
    const parts = bucket.split('-')
    const y = parseInt(parts[0] ?? '0', 10)
    const w = parseInt(parts[1] ?? '0', 10)
    if (!y || !w) return bucket
    const jan4 = new Date(Date.UTC(y, 0, 4))
    const dayOfWeek = (jan4.getUTCDay() + 6) % 7 // Mon=0
    const week1Monday = new Date(jan4)
    week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek)
    const target = new Date(week1Monday)
    target.setUTCDate(week1Monday.getUTCDate() + (w - 1) * 7)
    return `${target.getUTCFullYear()}-${pad2(target.getUTCMonth() + 1)}-${pad2(target.getUTCDate())}`
  }
  // day granularity -> bucket is already 'YYYY-MM-DD'
  return bucket
}

// Allow-list of truncation SQL fragments (granularity is enum-validated).
const TRUNC_BY_GRANULARITY: Record<string, string> = {
  day: `date("createdAt"/1000, 'unixepoch')`,
  week: `strftime('%Y-%W', "createdAt"/1000, 'unixepoch')`,
  month: `strftime('%Y-%m', "createdAt"/1000, 'unixepoch')`,
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const granularityRaw = (searchParams.get('granularity') || 'day')
  const granularity = (granularityRaw in TRUNC_BY_GRANULARITY
    ? granularityRaw
    : 'day') as 'day' | 'week' | 'month'
  // days: 0 (or 'all') = all time. Otherwise clamp to [7, 3650].
  const daysParam0 = searchParams.get('days') || '90'
  const daysParsed = daysParam0 === 'all' ? 0 : parseInt(daysParam0, 10)
  const days = Number.isNaN(daysParsed) ? 90 : Math.min(Math.max(0, daysParsed), 3650)

  // T4: cache key includes granularity + days so different parameter
  // combinations get independent cache entries.
  const cacheKey = `stats-history:${granularity}:${days}`

  const data = await getOrSet(
    cacheKey,
    5 * 60_000, // 5 min
    async () => {
      const truncExpr = TRUNC_BY_GRANULARITY[granularity]
      // 0 = no date filter (all time)
      const useDateFilter = days > 0
      const daysParam = String(-days)

      // Build the SQL. truncExpr is from a static allow-list so it is safe to
      // interpolate. The `-N days` value is a sanitized signed integer string.
      const sql = useDateFilter
        ? `SELECT ${truncExpr} AS bucket, COUNT(*) AS c
           FROM "Paper"
           WHERE ${truncExpr} >= date('now', ?)
           GROUP BY bucket
           ORDER BY bucket ASC`
        : `SELECT ${truncExpr} AS bucket, COUNT(*) AS c
           FROM "Paper"
           GROUP BY bucket
           ORDER BY bucket ASC`

      const rows = useDateFilter
        ? await db.$queryRawUnsafe<Row[]>(sql, `${daysParam} days`)
        : await db.$queryRawUnsafe<Row[]>(sql)

      const points: HistoryPoint[] = []
      let cumulative = 0
      for (const r of rows) {
        if (!r.bucket) continue
        cumulative += Number(r.c)
        points.push({
          date: bucketToIsoDate(r.bucket, granularity),
          count: Number(r.c),
          cumulative,
        })
      }

      return {
        points,
        granularity,
        days,
        total: cumulative,
      }
    },
  )

  return NextResponse.json(data)
}
