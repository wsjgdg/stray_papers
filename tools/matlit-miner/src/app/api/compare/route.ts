import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/compare?ids=id1,id2,id3
// Returns side-by-side comparison data for up to 4 materials.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const idsParam = searchParams.get('ids') || ''
  const ids = idsParam.split(',').filter(Boolean).slice(0, 4)

  if (ids.length < 2) {
    return NextResponse.json({ error: 'At least 2 material IDs required' }, { status: 400 })
  }

  const materials = await db.material.findMany({
    where: { id: { in: ids } },
    include: {
      classifications: {
        where: { synthesized: 'yes' },
        take: 1,
        orderBy: { confidence: 'desc' },
      },
      efficiencies: { orderBy: { efficiencyValue: 'desc' }, take: 1 },
      papers: { select: { id: true, year: true, citationCount: true } },
    },
  })

  const comparison = materials.map((m) => {
    const cls = m.classifications[0]
    const eff = m.efficiencies[0]
    const years = m.papers.map(p => p.year).filter(Boolean).sort()
    return {
      id: m.id,
      name: m.name,
      category: m.category,
      paperCount: m.papers.length,
      yearRange: years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : '—',
      maxCitations: m.papers.length > 0 ? Math.max(...m.papers.map(p => p.citationCount || 0)) : 0,
      synthesized: cls?.synthesized || '—',
      bandgap: cls?.bandgapValue || '—',
      method: cls?.synthesisMethod || '—',
      conditions: cls?.conditions || '—',
      maxEfficiency: eff?.efficiencyValue || null,
      efficiencyCertified: eff?.certified || false,
      efficiencySource: eff?.source || '—',
    }
  })

  return NextResponse.json({ comparison })
}
