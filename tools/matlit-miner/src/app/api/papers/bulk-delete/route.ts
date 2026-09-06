import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/papers/bulk-delete
// Body: { ids: string[] }
// Deletes the specified papers (and their classifications via cascade).
//
// R6: wrapped in `db.$transaction` so the deletion is atomic. A single
// `deleteMany` is already atomic at the SQL level, but the explicit
// transaction makes the intent clear and is forward-compatible with
// adding related writes (audit log, cache invalidation side-effects,
// dependent extractions cleanup, etc.) without risking partial deletes.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { ids } = body as { ids?: string[] }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }
  const result = await db.$transaction(async (tx) => {
    return tx.paper.deleteMany({ where: { id: { in: ids } } })
  })
  return NextResponse.json({ deleted: result.count })
}
