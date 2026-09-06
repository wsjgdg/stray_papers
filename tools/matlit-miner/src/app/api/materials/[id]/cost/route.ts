import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { estimateCost, type CostEstimate } from '@/lib/cost-estimator'
import { getCached, setCached } from '@/lib/cache'

// GET /api/materials/[id]/cost
//
// Returns a cost estimate for synthesizing 1 gram of the material, broken
// down per element. All heavy lifting (formula parsing, price lookup, molar
// mass + cost-per-gram calculation) lives in the pure `estimateCost` function
// in `src/lib/cost-estimator.ts` — this route is a thin DB + cache wrapper.
//
// The result is cached in memory for 1 hour per material id. The formula
// rarely changes, and the price table is embedded in the lib, so a long TTL
// is fine. Pass `?refresh=1` to bypass the cache.
//
// Response:
//   {
//     materialId: string,
//     formula: string,
//     estimate: CostEstimate  // see src/lib/cost-estimator.ts
//   }

const COST_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CachedPayload {
  formula: string
  estimate: CostEstimate
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const refresh = new URL(req.url).searchParams.get('refresh') === '1'
  const cacheKey = `cost:${id}`

  if (!refresh) {
    const cached = getCached<CachedPayload>(cacheKey)
    if (cached) {
      return NextResponse.json({
        materialId: id,
        formula: cached.formula,
        estimate: cached.estimate,
      })
    }
  }

  const material = await db.material.findUnique({
    where: { id },
    select: { id: true, name: true },
  })
  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  const estimate = estimateCost(material.name)
  const payload: CachedPayload = { formula: material.name, estimate }
  setCached(cacheKey, payload, COST_TTL_MS)

  return NextResponse.json({
    materialId: id,
    formula: material.name,
    estimate,
  })
}
