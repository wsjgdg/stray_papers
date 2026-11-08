import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clearAll } from '@/lib/cache'
import { apiError } from '@/lib/api-error'
import { rateLimit, getIdentifier, RATE_LIMITS } from '@/lib/rate-limit'

// POST /api/demo/reset
// -----------------------------------------------------------------------------
// Wipes the entire user dataset so a fresh-start user can re-seed from scratch
// or build their own clean corpus. Deletes in dependency-safe order (children
// before parents); FK relations also cascade, but explicit ordering avoids
// any race-condition noise in Prisma's SQLite backend.
//
// Returns `{ deleted: true }` plus pre-deletion counts so callers can audit
// what was removed (and so a confirmation toast can say "N materials, …
// deleted"). Clears the in-memory response cache too.
// -----------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // --- Rate limit (destructive — wipes entire dataset — 5/min per IP) ----
  const ip = getIdentifier(req)
  const rl = rateLimit(`demo-reset:${ip}`, RATE_LIMITS.batch)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetAt: rl.resetAt },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    )
  }

  try {
    const [
      materialsCount,
      papersCount,
      classificationsCount,
      efficienciesCount,
      verificationsCount,
      extractionsCount,
    ] = await Promise.all([
      db.material.count(),
      db.paper.count(),
      db.classification.count(),
      db.efficiency.count(),
      db.verification.count(),
      db.extractionJob.count(),
    ])

    // Children first — every relation uses onDelete: Cascade but we delete
    // bottom-up so partial failures (if any) leave the schema consistent.
    await db.verification.deleteMany({})
    await db.efficiency.deleteMany({})
    await db.extractionJob.deleteMany({})
    await db.classification.deleteMany({})
    await db.paper.deleteMany({})
    await db.material.deleteMany({})

    // Drop cached responses so /api/stats, /api/health, /api/coverage etc.
    // recompute from an empty DB instead of serving stale demo numbers.
    clearAll()

    return NextResponse.json({
      deleted: true,
      counts: {
        materials: materialsCount,
        papers: papersCount,
        classifications: classificationsCount,
        efficiencies: efficienciesCount,
        verifications: verificationsCount,
        extractions: extractionsCount,
      },
    })
  } catch (e) {
    return apiError('Demo reset failed', 500, e)
  }
}
