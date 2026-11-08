import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/efficiency/import-from-extraction
// Finds all Classification records with efficiencyValue (non-empty),
// and creates Efficiency records from them (skipping duplicates by materialId).
export async function POST() {
  const classifications = await db.classification.findMany({
    where: {
      efficiencyValue: { not: '' },
      status: 'extracted',
    },
    select: {
      id: true,
      materialId: true,
      efficiencyValue: true,
      paper: { select: { doi: true, year: true } },
    },
  })

  let imported = 0
  let skipped = 0

  for (const cls of classifications) {
    const effValue = parseFloat(cls.efficiencyValue)
    if (isNaN(effValue)) { skipped++; continue }

    // Check if efficiency record already exists for this material
    const existing = await db.efficiency.findFirst({ where: { materialId: cls.materialId } })
    if (existing) { skipped++; continue }

    await db.efficiency.create({
      data: {
        materialId: cls.materialId,
        efficiencyValue: effValue,
        certified: false,
        source: 'Literature (LLM-extracted)',
        sourceType: 'literature',
        doi: cls.paper.doi || '',
        year: cls.paper.year || null,
        notes: `Auto-imported from classification ${cls.id}`,
      },
    })
    imported++
  }

  return NextResponse.json({ imported, skipped, total: classifications.length })
}
