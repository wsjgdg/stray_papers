import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/restore
// Body: { data: { materials: [], papers: [], ... } }
// Restore database from a JSON backup. Does NOT delete existing data — only inserts new records.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const data = body.data

  if (!data || !Array.isArray(data.materials)) {
    return NextResponse.json({ error: 'Invalid backup format' }, { status: 400 })
  }

  let inserted = { materials: 0, papers: 0, classifications: 0, efficiencies: 0, verifications: 0 }

  // Restore materials (skip existing by name)
  for (const m of data.materials || []) {
    const exists = await db.material.findFirst({ where: { name: m.name } })
    if (exists) continue
    await db.material.create({ data: { name: m.name, aliases: m.aliases || '', category: m.category || 'other', notes: m.notes || '' } })
    inserted.materials++
  }

  // Build material name→id map
  const allMaterials = await db.material.findMany()
  const matMap = new Map(allMaterials.map(m => [m.name, m.id]))

  // Restore papers (skip existing by DOI+materialId)
  for (const p of data.papers || []) {
    const matId = matMap.get(p.materialName || '') || p.materialId
    if (!matId) continue
    const exists = p.doi
      ? await db.paper.findFirst({ where: { doi: p.doi, materialId: matId } })
      : null
    if (exists) continue
    try {
      await db.paper.create({
        data: {
          materialId: matId,
          title: p.title || 'Untitled',
          year: p.year || null,
          doi: p.doi || '',
          abstract: p.abstract || '',
          authors: p.authors || '',
          venue: p.venue || '',
          url: p.url || '',
          source: p.source || 'manual',
          citationCount: p.citationCount || 0,
        },
      })
      inserted.papers++
    } catch (e) {
      // Skip duplicates (P2002) — expected during idempotent restore.
      // Log other Prisma errors so we don't silently drop real failures.
      console.warn('[restore] paper upsert skipped:', e)
    }
  }

  return NextResponse.json({ ok: true, inserted })
}
