import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/verify/prefill?materialId=xxx
// Returns the latest Classification with extracted data for a given material,
// along with paper context (title / DOI / paperId) so the verification form
// can be auto-filled.
//
// Response shape (200):
//   {
//     bandgap, efficiency, method, conditions, evidence,
//     doi, paperTitle, paperId, paperYear, confidence, classificationId
//   }
// 404 if material not found, 200 with `{ found: false }` if no classification.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const materialId = searchParams.get('materialId')
  if (!materialId) {
    return NextResponse.json(
      { error: 'materialId is required' },
      { status: 400 },
    )
  }

  const material = await db.material.findUnique({
    where: { id: materialId },
    select: { id: true, name: true },
  })
  if (!material) {
    return NextResponse.json(
      { error: 'material not found' },
      { status: 404 },
    )
  }

  // Prefer Classifications whose status is 'extracted', but fall back to any
  // Classification that has at least one piece of extracted data.
  // Order: status='extracted' first, then by updatedAt desc.
  const cls = await db.classification.findFirst({
    where: { materialId },
    orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
    include: {
      paper: {
        select: { id: true, doi: true, title: true, year: true },
      },
    },
  })

  if (!cls) {
    return NextResponse.json({ found: false, materialId, materialName: material.name })
  }

  return NextResponse.json({
    found: true,
    materialId,
    materialName: material.name,
    classificationId: cls.id,
    bandgap: cls.bandgapValue || '',
    efficiency: cls.efficiencyValue || '',
    method: cls.synthesisMethod || '',
    conditions: cls.conditions || '',
    evidence: cls.evidence || '',
    confidence: cls.confidence ?? 0,
    doi: cls.paper?.doi || '',
    paperTitle: cls.paper?.title || '',
    paperId: cls.paper?.id || '',
    paperYear: cls.paper?.year ?? null,
    status: cls.status,
    synthesized: cls.synthesized,
  })
}
