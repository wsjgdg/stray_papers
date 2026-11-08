import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/materials/import
// Body: { materials: Array<{ name, aliases?, category?, notes? }> }
// Bulk-import materials. Skips duplicates (by name, case-insensitive).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { materials } = body as { materials?: Array<{ name: string; aliases?: string; category?: string; notes?: string }> }

  if (!Array.isArray(materials) || materials.length === 0) {
    return NextResponse.json({ error: 'materials array is required' }, { status: 400 })
  }

  let inserted = 0
  let skipped = 0
  const errors: Array<{ name: string; error: string }> = []

  for (const m of materials) {
    const name = (m.name || '').trim()
    if (!name) {
      errors.push({ name: '(empty)', error: 'name is required' })
      continue
    }
    // Check for existing (case-insensitive on PostgreSQL; on SQLite `mode`
    // is not in the StringFilter type but Prisma tolerates it at runtime).
    const existing = await db.material.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } } as never,
    })
    if (existing) {
      skipped++
      continue
    }
    try {
      await db.material.create({
        data: {
          name,
          aliases: m.aliases || '',
          category: m.category || 'other',
          notes: m.notes || '',
        },
      })
      inserted++
    } catch (e) {
      errors.push({ name, error: (e as Error).message })
    }
  }

  return NextResponse.json({
    inserted,
    skipped,
    errors,
    total: materials.length,
  })
}
