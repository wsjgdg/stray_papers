import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseElements, jaccardSimilarity, parseBandgap } from '@/lib/bandgap-predictor'

// GET /api/materials/[id]/similar
//
// Computes the top-5 materials most similar to the target material using a
// weighted score with three signals (no LLM call):
//
//   1. Element overlap   — Jaccard similarity between element-token sets
//                          parsed from the chemical formula. Weight: 0.5
//   2. Same category      — +0.3 bonus when both materials share the same
//                          `category` (perovskite / chalcogenide / oxide / other)
//   3. Similar bandgap    — +0.2 bonus when both have a bandgap within 0.5 eV
//                          of each other
//
// The final score is in [0, 1] and is the sum of the three components (the
// Jaccard term is itself in [0, 1] so the cap is reached when both materials
// share all elements, are in the same category, and have nearly identical
// bandgaps).
//
// Response:
//   {
//     materialId: string,
//     similar: Array<{
//       materialId: string,
//       name: string,
//       category: string,
//       score: number,
//       reasons: string[]   // human-readable bullets explaining the score
//     }>
//   }

interface SimilarRow {
  materialId: string
  name: string
  category: string
  score: number
  reasons: string[]
}

/**
 * Fetch every material along with the highest-confidence classification that
 * carries a bandgap value. Mirrors the join used by /api/predict/bandgap so
 * the two endpoints agree on what "the material's bandgap" means.
 */
async function fetchAllMaterials() {
  return db.material.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      category: true,
      classifications: {
        where: { bandgapValue: { not: '' } },
        orderBy: { confidence: 'desc' },
        take: 1,
        select: { bandgapValue: true },
      },
    },
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const rows = await fetchAllMaterials()
  if (rows.length === 0) {
    return NextResponse.json({ materialId: id, similar: [] })
  }

  const target = rows.find((r) => r.id === id)
  if (!target) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  const targetElements = parseElements(target.name)
  const targetBandgap =
    target.classifications.length > 0
      ? parseBandgap(target.classifications[0].bandgapValue)
      : null

  const BANDGAP_TOLERANCE = 0.5 // eV
  const WEIGHT_ELEMENT = 0.5
  const WEIGHT_CATEGORY = 0.3
  const WEIGHT_BANDGAP = 0.2

  const similar: SimilarRow[] = []
  for (const r of rows) {
    if (r.id === id) continue

    const reasons: string[] = []
    let score = 0

    // 1. Element overlap (Jaccard on parsed formula tokens)
    const elems = parseElements(r.name)
    const jaccard = jaccardSimilarity(targetElements, elems)
    score += jaccard * WEIGHT_ELEMENT
    if (jaccard > 0) {
      const shared = [...targetElements].filter((e) => elems.has(e))
      reasons.push(
        `Shares ${shared.length} element token(s) with ${target.name} (Jaccard ${(jaccard * 100).toFixed(0)}%)`,
      )
    }

    // 2. Same category
    if (r.category === target.category) {
      score += WEIGHT_CATEGORY
      reasons.push(`Same category (${r.category})`)
    }

    // 3. Similar bandgap
    const bg = r.classifications.length > 0 ? parseBandgap(r.classifications[0].bandgapValue) : null
    if (targetBandgap !== null && bg !== null) {
      const delta = Math.abs(targetBandgap - bg)
      if (delta <= BANDGAP_TOLERANCE) {
        score += WEIGHT_BANDGAP
        reasons.push(
          `Bandgap within ${BANDGAP_TOLERANCE} eV (${bg.toFixed(2)} vs ${targetBandgap.toFixed(2)} eV)`,
        )
      }
    }

    // Only keep materials with at least one signal — pure-noise rows are
    // excluded so the UI doesn't surface "0-score" recommendations.
    if (score > 0) {
      similar.push({
        materialId: r.id,
        name: r.name,
        category: r.category,
        score: Number(score.toFixed(3)),
        reasons,
      })
    }
  }

  similar.sort((a, b) => b.score - a.score)
  const top5 = similar.slice(0, 5)

  return NextResponse.json({ materialId: id, similar: top5 })
}
