import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/export/json
// Export all aggregated results as a structured JSON file.
export async function GET() {
  const materials = await db.material.findMany({
    orderBy: { name: 'asc' },
    include: {
      papers: { select: { doi: true, title: true, year: true, source: true } },
      classifications: {
        where: { synthesized: 'yes' },
        take: 1,
        orderBy: { confidence: 'desc' },
      },
      efficiencies: { orderBy: { efficiencyValue: 'desc' }, take: 1 },
      verifications: { take: 1, orderBy: { updatedAt: 'desc' } },
    },
  })

  const data = materials.map((m) => {
    const cls = m.classifications[0]
    const eff = m.efficiencies[0]
    const ver = m.verifications[0]
    return {
      material: m.name,
      aliases: m.aliases,
      category: m.category,
      notes: m.notes,
      synthesized: cls?.synthesized || null,
      bandgap_eV: cls?.bandgapValue || null,
      synthesisMethod: cls?.synthesisMethod || null,
      conditions: cls?.conditions || null,
      phaseDiagramInfo: cls?.phaseDiagramInfo || null,
      maxEfficiency_pct: eff?.efficiencyValue || null,
      efficiencySource: eff?.source || null,
      efficiencyCertified: eff?.certified || false,
      verificationStatus: ver?.status || 'pending',
      reviewer: ver?.reviewer || null,
      primaryDOI: m.papers.find((p) => p.doi)?.doi || null,
      paperCount: m.papers.length,
      evidence: cls?.evidence || null,
      confidence: cls?.confidence || null,
    }
  })

  return new NextResponse(JSON.stringify({ generated: new Date().toISOString(), totalMaterials: data.length, materials: data }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="matlit-results-${Date.now()}.json"`,
    },
  })
}
