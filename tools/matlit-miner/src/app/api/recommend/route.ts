import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'
import { parseBandgap } from '@/lib/bandgap-predictor'

// POST /api/recommend
//
// Material selection recommender. Pure filtering + scoring — no LLM call.
//
// Request body:
//   {
//     requirements: {
//       minEfficiency?: number,    // % — best recorded efficiency must be ≥ this
//       maxBandgap?: number,       // eV — bandgap must be ≤ this
//       minBandgap?: number,       // eV — bandgap must be ≥ this
//       leadFree?: boolean,        // exclude materials whose name/aliases contain 'Pb'
//       category?: string,         // perovskite | chalcogenide | oxide | other
//       stabilityRequired?: boolean // at least one paper title/abstract mentions stability
//     }
//   }
//
// Algorithm:
//   1. Fetch every material with its best efficiency record, highest-confidence
//      bandgap classification, and a flag for whether any paper mentions
//      "stability" / "stable" (case-insensitive).
//   2. For each criterion the user specified, evaluate the material:
//        - If satisfied → add the criterion label to `matchedCriteria`.
//        - If has data but doesn't satisfy → filter OUT (hard filter).
//        - If lacks the data needed to evaluate → filter OUT (hard filter,
//          because we can't claim it matches).
//   3. For materials that pass the filter, compute a 0–100 score from:
//        - Baseline 50 for passing the filter.
//        - +5 per matched criterion (capped at +25).
//        - +min(15, max(0, (bestEff - minEfficiency))) efficiency headroom.
//        - +10 bandgap-in-centre bonus (if both bounds specified).
//        - +5 per present data field (efficiency, bandgap, stability, papers).
//   4. Return top 5 by score. Each item carries matchedCriteria (labels of
//      criteria the user specified that the material satisfies) and
//      missingCriteria (informational labels of data the material lacks,
//      e.g. "no bandgap record" — empty when the material has full data).
//
// Cache: 5 minutes per requirements-hash. Cheap to recompute but the join
// is non-trivial on a large corpus, so the cache pays off when the user
// tweaks sliders repeatedly.

const RECOMMEND_TTL_MS = 5 * 60 * 1000

interface RecommendRequirements {
  minEfficiency?: number | null
  maxBandgap?: number | null
  minBandgap?: number | null
  leadFree?: boolean | null
  category?: string | null
  stabilityRequired?: boolean | null
}

interface RecommendItem {
  materialId: string
  name: string
  score: number
  matchedCriteria: string[]
  missingCriteria: string[]
}

interface RecommendResponse {
  results: RecommendItem[]
  total: number
  generatedAt: string
}

interface MaterialCandidate {
  id: string
  name: string
  aliases: string
  category: string
  bestEfficiency: number | null
  certified: boolean
  bandgap: number | null
  synthesisMethod: string
  paperCount: number
  hasStability: boolean
}

/**
 * Materialise every material along with the data the recommender cares
 * about: best efficiency, highest-confidence bandgap, paper count, and a
 * stability-mention flag (cheap substring sweep over title + abstract).
 *
 * Kept single-query (with the standard Prisma relation include) so the
 * request stays well under 100 ms even on a 60-material corpus.
 */
async function fetchCandidates(): Promise<MaterialCandidate[]> {
  const materials = await db.material.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { papers: true } },
      classifications: {
        where: { bandgapValue: { not: '' } },
        orderBy: { confidence: 'desc' },
        take: 1,
        select: { bandgapValue: true, synthesisMethod: true },
      },
      efficiencies: {
        orderBy: { efficiencyValue: 'desc' },
        take: 1,
        select: { efficiencyValue: true, certified: true },
      },
      papers: {
        select: { title: true, abstract: true },
        take: 200, // cap to keep the stability sweep bounded
      },
    },
  })

  return materials.map((m) => {
    const bg = m.classifications[0]?.bandgapValue
      ? parseBandgap(m.classifications[0].bandgapValue)
      : null
    const bestEff = m.efficiencies[0]?.efficiencyValue ?? null
    const certified = m.efficiencies[0]?.certified ?? false
    // Substring sweep — covers "stability", "stable", "stabilization",
    // "stabilised", "long-term stable", etc. Case-insensitive on purpose.
    const hasStability = m.papers.some(
      (p) =>
        (p.title !== '' && /stabil/i.test(p.title)) ||
        (p.abstract !== '' && /stabil/i.test(p.abstract)),
    )
    return {
      id: m.id,
      name: m.name,
      aliases: m.aliases || '',
      category: m.category || 'other',
      bestEfficiency: bestEff,
      certified,
      bandgap: bg,
      synthesisMethod: m.classifications[0]?.synthesisMethod || '',
      paperCount: m._count.papers,
      hasStability,
    }
  })
}

/**
 * Tiny stable hash so identical requirement sets hit the same cache key.
 * Uses the same FNV-1a 32-bit hash as the draft endpoint.
 */
function hashRequirements(req: RecommendRequirements): string {
  const normalised = JSON.stringify({
    minEfficiency: req.minEfficiency ?? null,
    maxBandgap: req.maxBandgap ?? null,
    minBandgap: req.minBandgap ?? null,
    leadFree: req.leadFree ?? null,
    category: req.category ?? null,
    stabilityRequired: req.stabilityRequired ?? null,
  })
  let h = 0x811c9dc5
  for (let i = 0; i < normalised.length; i++) {
    h ^= normalised.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

interface CriterionResult {
  /** Label shown to the user, e.g. "Efficiency ≥ 15%". */
  label: string
  /** Did the material satisfy this criterion? */
  satisfied: boolean
  /** Did the material have enough data to evaluate this criterion? */
  hasData: boolean
}

/**
 * Evaluate a single user requirement against a candidate.
 * Returns { label, satisfied, hasData } so the caller can both filter and
 * surface matched / missing criteria in the UI.
 */
function evaluateCriterion(
  req: RecommendRequirements,
  m: MaterialCandidate,
): CriterionResult[] {
  const out: CriterionResult[] = []

  if (req.minEfficiency !== undefined && req.minEfficiency !== null) {
    const threshold = Number(req.minEfficiency)
    const hasData = m.bestEfficiency !== null
    out.push({
      label: `Efficiency ≥ ${threshold}%`,
      satisfied: hasData && m.bestEfficiency !== null && m.bestEfficiency >= threshold,
      hasData,
    })
  }

  if (req.maxBandgap !== undefined && req.maxBandgap !== null) {
    const threshold = Number(req.maxBandgap)
    const hasData = m.bandgap !== null
    out.push({
      label: `Bandgap ≤ ${threshold} eV`,
      satisfied: hasData && m.bandgap !== null && m.bandgap <= threshold,
      hasData,
    })
  }

  if (req.minBandgap !== undefined && req.minBandgap !== null) {
    const threshold = Number(req.minBandgap)
    const hasData = m.bandgap !== null
    out.push({
      label: `Bandgap ≥ ${threshold} eV`,
      satisfied: hasData && m.bandgap !== null && m.bandgap >= threshold,
      hasData,
    })
  }

  if (req.leadFree) {
    // Match the /api/export semantics: a material is lead-free when neither
    // its name nor its aliases contain the literal token "Pb".
    const containsPb = m.name.includes('Pb') || m.aliases.includes('Pb')
    out.push({
      label: 'Lead-free',
      satisfied: !containsPb,
      hasData: true,
    })
  }

  if (req.category) {
    out.push({
      label: `Category: ${req.category}`,
      satisfied: m.category === req.category,
      hasData: true,
    })
  }

  if (req.stabilityRequired) {
    out.push({
      label: 'Stability reported',
      satisfied: m.hasStability,
      hasData: m.paperCount > 0,
    })
  }

  return out
}

/**
 * Score a candidate 0–100. Only called for materials that passed the hard
 * filter (so every user criterion is satisfied). The score rewards data
 * completeness and "headroom" — materials that exceed the minimum efficiency
 * or sit in the centre of the requested bandgap range rank higher.
 */
function scoreCandidate(
  req: RecommendRequirements,
  m: MaterialCandidate,
  criteria: CriterionResult[],
): number {
  let score = 50 // baseline for passing the filter

  // +5 per matched criterion (capped at +25)
  const matched = criteria.filter((c) => c.satisfied).length
  score += Math.min(25, matched * 5)

  // Efficiency headroom — bonus for clearing the floor with room to spare.
  if (
    req.minEfficiency !== undefined &&
    req.minEfficiency !== null &&
    m.bestEfficiency !== null
  ) {
    const headroom = Math.max(0, m.bestEfficiency - Number(req.minEfficiency))
    score += Math.min(15, headroom)
  }

  // Bandgap centred in range — when both bounds specified, reward materials
  // sitting in the middle 50% of the window.
  if (
    req.minBandgap !== undefined &&
    req.minBandgap !== null &&
    req.maxBandgap !== undefined &&
    req.maxBandgap !== null &&
    m.bandgap !== null
  ) {
    const lo = Number(req.minBandgap)
    const hi = Number(req.maxBandgap)
    const centre = (lo + hi) / 2
    const half = (hi - lo) / 2
    if (half > 0) {
      const dist = Math.abs(m.bandgap - centre) / half
      if (dist <= 0.5) score += 10
      else if (dist <= 1) score += 5
    }
  }

  // Data completeness — reward materials that have rich data (helps break
  // ties between equally-matching candidates).
  if (m.bestEfficiency !== null) score += 5
  if (m.bandgap !== null) score += 5
  if (m.hasStability) score += 5
  if (m.paperCount >= 3) score += 5

  return Math.min(100, Math.max(0, Math.round(score)))
}

/**
 * Build the informational missingCriteria list. After the hard filter this
 * is empty for user-specified criteria (since they all matched), but we
 * surface data-availability gaps the user might care about even if they
 * didn't ask: "no bandgap record", "no efficiency record", "no stability
 * data", "few papers (< 3)". Empty when the material has full data.
 */
function missingDataLabels(m: MaterialCandidate): string[] {
  const out: string[] = []
  if (m.bandgap === null) out.push('no bandgap record')
  if (m.bestEfficiency === null) out.push('no efficiency record')
  if (!m.hasStability) out.push('no stability data')
  if (m.paperCount < 3) out.push(`few papers (${m.paperCount})`)
  return out
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const reqBody = (body ?? {}) as { requirements?: RecommendRequirements }
  const requirements: RecommendRequirements = reqBody.requirements ?? {}

  // Coerce numeric fields (frontend may send strings).
  const cleaned: RecommendRequirements = {
    minEfficiency:
      requirements.minEfficiency !== undefined &&
      requirements.minEfficiency !== null &&
      !Number.isNaN(Number(requirements.minEfficiency))
        ? Number(requirements.minEfficiency)
        : null,
    maxBandgap:
      requirements.maxBandgap !== undefined &&
      requirements.maxBandgap !== null &&
      !Number.isNaN(Number(requirements.maxBandgap))
        ? Number(requirements.maxBandgap)
        : null,
    minBandgap:
      requirements.minBandgap !== undefined &&
      requirements.minBandgap !== null &&
      !Number.isNaN(Number(requirements.minBandgap))
        ? Number(requirements.minBandgap)
        : null,
    leadFree: requirements.leadFree === true,
    category:
      typeof requirements.category === 'string' && requirements.category.trim()
        ? requirements.category.trim()
        : null,
    stabilityRequired: requirements.stabilityRequired === true,
  }

  const cacheKey = `recommend:${hashRequirements(cleaned)}`

  const result = await getOrSet(
    cacheKey,
    RECOMMEND_TTL_MS,
    async (): Promise<RecommendResponse> => {
      const candidates = await fetchCandidates()

      const scored: RecommendItem[] = []
      for (const m of candidates) {
        const criteria = evaluateCriterion(cleaned, m)
        // Hard filter: every user-specified criterion must be satisfied
        // (i.e. have data AND match). If any fails, drop the material.
        if (criteria.some((c) => !c.satisfied)) continue

        const score = scoreCandidate(cleaned, m, criteria)
        scored.push({
          materialId: m.id,
          name: m.name,
          score,
          matchedCriteria: criteria
            .filter((c) => c.satisfied)
            .map((c) => c.label),
          missingCriteria: missingDataLabels(m),
        })
      }

      scored.sort((a, b) => b.score - a.score)
      const top = scored.slice(0, 5)

      return {
        results: top,
        total: scored.length,
        generatedAt: new Date().toISOString(),
      }
    },
  )

  return NextResponse.json(result)
}
