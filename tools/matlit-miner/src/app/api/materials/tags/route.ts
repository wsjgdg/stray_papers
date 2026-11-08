import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/materials/tags — list all unique tags across all materials with counts.
// Tags are stored as a semicolon-separated string on each Material row.
// Returns: { tags: [{ tag, count }] }
export async function GET() {
  const materials = await db.material.findMany({
    select: { tags: true },
  })

  const counts = new Map<string, number>()
  for (const m of materials) {
    const tokens = (m.tags || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    // dedupe within a single material so each material counts at most once per tag
    const uniq = Array.from(new Set(tokens))
    for (const t of uniq) {
      counts.set(t, (counts.get(t) || 0) + 1)
    }
  }

  const items = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))

  return NextResponse.json({ tags: items })
}
