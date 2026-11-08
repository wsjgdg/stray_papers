import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  predictBandgap,
  type MaterialForPrediction,
  type BandgapPrediction,
} from '@/lib/bandgap-predictor'

// GET /api/predict/bandgap
//
// Predicts bandgap values for materials that don't yet have one. Predictions
// are computed by `predictBandgap` (pure function in src/lib/bandgap-predictor.ts)
// using three fallback strategies: KNN by category → element-average →
// category-average.
//
// Query params:
//   ?materialId=X  — predict only for the given material (regardless of whether
//                    it already has a bandgap; useful for inspection/debugging)
//
// Response:
//   { predictions: Array<{ materialId, materialName, predictedBandgap,
//                          confidence, method, nearestNeighbors }> }
//   Sorted by confidence (descending). Materials with no usable prediction are
//   omitted.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const materialId = searchParams.get('materialId')

  // Fetch every material along with any classification carrying a bandgap.
  // We pre-filter classifications to non-empty bandgapValue so Prisma returns
  // only the rows we care about, then take the highest-confidence one per
  // material (the first entry after orderBy).
  const materials = await db.material.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      classifications: {
        where: { bandgapValue: { not: '' } },
        orderBy: { confidence: 'desc' },
      },
    },
  })

  const forPrediction: MaterialForPrediction[] = materials.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    bandgapValue:
      m.classifications.length > 0 ? m.classifications[0].bandgapValue : null,
  }))

  // Materials without a bandgap are prediction targets. If `materialId` is
  // supplied, predict for that single material instead (allows inspecting the
  // prediction even for materials that already have a bandgap).
  const targets = materialId
    ? forPrediction.filter((m) => m.id === materialId)
    : forPrediction.filter((m) => m.bandgapValue === null)

  // Build a name lookup so the response can include materialName without
  // leaking the full Prisma objects.
  const nameById = new Map(forPrediction.map((m) => [m.id, m.name]))

  const predictions: Array<
    BandgapPrediction & { materialName: string }
  > = []
  for (const target of targets) {
    const p = predictBandgap(target, forPrediction)
    if (!p) continue
    predictions.push({
      ...p,
      materialName: nameById.get(p.materialId) ?? target.name,
    })
  }

  predictions.sort((a, b) => b.confidence - a.confidence)

  return NextResponse.json({ predictions })
}
