import { NextResponse } from 'next/server'
import { clearAll, getCacheStats, invalidate } from '@/lib/cache'

// POST /api/cache/clear
// Body (optional): { prefix?: string }
//   - If `prefix` provided, only keys starting with that prefix are removed.
//   - Otherwise the entire in-memory cache is wiped.
//
// Returns: { cleared: number, remaining: number, stats: {...} }
export async function POST(req: Request) {
  let prefix: string | undefined
  try {
    const body = await req.json()
    if (body && typeof body === 'object' && typeof body.prefix === 'string') {
      prefix = body.prefix
    }
  } catch (e) {
    // Body is optional — ignore JSON parse errors, but log at debug level
    // in case the client is consistently sending malformed payloads.
    console.warn('[cache/clear] optional body parse failed:', e)
  }

  const before = getCacheStats()
  const cleared = prefix ? invalidate(prefix) : clearAll()
  const after = getCacheStats()

  return NextResponse.json({
    cleared,
    remaining: after.entries,
    beforeStats: before,
    afterStats: after,
  })
}

// GET /api/cache/clear — returns current cache stats (read-only)
export async function GET() {
  return NextResponse.json(getCacheStats())
}
