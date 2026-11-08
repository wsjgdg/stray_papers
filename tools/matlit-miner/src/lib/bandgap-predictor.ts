// Bandgap missing-value prediction (pure functions, no DB access).
//
// Used by /api/predict/bandgap to estimate bandgap values for materials that
// don't yet have a measured/reported bandgap. Three strategies are attempted
// in order of decreasing specificity:
//
//   1. knn-category      — same-category neighbors weighted by element overlap
//   2. element-average   — cross-category neighbors sharing element tokens
//   3. category-average  — plain mean of all bandgaps in the same category
//
// If none of the three can produce a prediction (e.g. no material in the DB
// has a bandgap at all), `predictBandgap` returns `null`.

export interface MaterialForPrediction {
  id: string
  name: string
  category: string
  /** Raw bandgap string (e.g. "1.55") or null when missing. */
  bandgapValue: string | null
}

export type BandgapMethod = 'knn-category' | 'element-average' | 'category-average'

export interface BandgapNeighbor {
  name: string
  bandgap: number
  /** 0-1 Jaccard similarity (strategy 1) or overlap fraction (strategy 2). */
  similarity: number
}

export interface BandgapPrediction {
  materialId: string
  predictedBandgap: number
  /** 0-1 confidence. Higher = more trustworthy. */
  confidence: number
  method: BandgapMethod
  nearestNeighbors: BandgapNeighbor[]
}

/** Maximum neighbors used for KNN / element-average strategies. */
const MAX_NEIGHBORS = 5

/** Minimum neighbor counts required to trust each strategy. */
const KNN_MIN_NEIGHBORS = 3
const ELEMENT_MIN_NEIGHBORS = 2

/**
 * Parse a chemical formula into a set of element / pseudo-element tokens.
 *
 * Element symbol = one capital letter + optional lowercase letter. We strip
 * digits, parentheses, brackets, braces, dots and whitespace first so that
 * formulas like "(CH3NH3)PbI3" reduce to "CHNHPbI" before tokenization.
 *
 * Examples:
 *   "CsPbI3"    → { Cs, Pb, I }
 *   "MAPbI3"    → { M, A, Pb, I }   (M and A are not real elements but are
 *                                    treated consistently for similarity)
 *   "FAPbBr3"   → { F, A, Pb, Br }
 *
 * The token set is used purely for Jaccard-set comparison — consistency
 * matters more than chemical correctness here.
 */
export function parseElements(formula: string): Set<string> {
  if (!formula) return new Set()
  const cleaned = formula.replace(/[0-9(){}\[\].\s]/g, '')
  const matches = cleaned.match(/[A-Z][a-z]?/g)
  return matches ? new Set(matches) : new Set()
}

/** Jaccard similarity between two token sets: |A∩B| / |A∪B|. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const x of a) if (b.has(x)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** Parse a bandgap string into a finite number, or null if invalid/empty. */
export function parseBandgap(v: string | null): number | null {
  if (v === null || v.trim() === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Predict a bandgap value for `target` using `allMaterials` as the training
 * set. Returns `null` if no prediction can be made.
 *
 * The target's own bandgapValue is ignored — callers should only invoke this
 * for materials lacking a bandgap, but the function is defensive: it filters
 * the training set by id (target excluded) and bandgap validity.
 */
export function predictBandgap(
  target: MaterialForPrediction,
  allMaterials: MaterialForPrediction[],
): BandgapPrediction | null {
  const targetElements = parseElements(target.name)

  // Build the training set: every other material with a valid bandgap.
  const withBandgap: Array<{ m: MaterialForPrediction; bg: number }> = []
  for (const m of allMaterials) {
    if (m.id === target.id) continue
    const bg = parseBandgap(m.bandgapValue)
    if (bg !== null) withBandgap.push({ m, bg })
  }

  if (withBandgap.length === 0) return null

  const sameCategoryWithBandgap = withBandgap.filter(
    (x) => x.m.category === target.category,
  )

  // ── Strategy 1: KNN by category (element-overlap weighted) ───────────────
  if (sameCategoryWithBandgap.length >= KNN_MIN_NEIGHBORS && targetElements.size > 0) {
    const scored = sameCategoryWithBandgap.map((x) => {
      const elems = parseElements(x.m.name)
      const sim = jaccardSimilarity(targetElements, elems)
      return { ...x, sim, elems }
    })

    const withOverlap = scored.filter((s) => s.sim > 0)
    if (withOverlap.length >= KNN_MIN_NEIGHBORS) {
      withOverlap.sort((a, b) => b.sim - a.sim)
      const top = withOverlap.slice(0, Math.min(MAX_NEIGHBORS, withOverlap.length))

      const totalSim = top.reduce((sum, s) => sum + s.sim, 0)
      const weightedBandgap =
        top.reduce((sum, s) => sum + s.sim * s.bg, 0) / (totalSim || 1)

      const avgSim = totalSim / top.length
      const neighborFactor = Math.min(1, top.length / MAX_NEIGHBORS)
      // Confidence in [0.7, 0.9] — driven by neighbor count + mean similarity.
      const confidence = clamp(0.5 + neighborFactor * 0.2 + avgSim * 0.2, 0.7, 0.9)

      return {
        materialId: target.id,
        predictedBandgap: weightedBandgap,
        confidence,
        method: 'knn-category',
        nearestNeighbors: top.map((s) => ({
          name: s.m.name,
          bandgap: s.bg,
          similarity: s.sim,
        })),
      }
    }
  }

  // ── Strategy 2: Element average (cross-category, overlap-weighted) ───────
  if (targetElements.size > 0) {
    const scored = withBandgap.map((x) => {
      const elems = parseElements(x.m.name)
      const overlap = [...targetElements].filter((e) => elems.has(e)).length
      return { ...x, overlap, elems }
    })

    const withOverlap = scored.filter((s) => s.overlap > 0)
    if (withOverlap.length >= ELEMENT_MIN_NEIGHBORS) {
      withOverlap.sort((a, b) => b.overlap - a.overlap)
      const top = withOverlap.slice(0, Math.min(MAX_NEIGHBORS, withOverlap.length))

      const totalOverlap = top.reduce((sum, s) => sum + s.overlap, 0)
      const weightedBandgap =
        top.reduce((sum, s) => sum + s.overlap * s.bg, 0) / (totalOverlap || 1)

      const avgOverlap = totalOverlap / top.length
      // Confidence in [0.4, 0.6] — element signal is weaker than same-category.
      const confidence = clamp(0.3 + avgOverlap * 0.1, 0.4, 0.6)

      return {
        materialId: target.id,
        predictedBandgap: weightedBandgap,
        confidence,
        method: 'element-average',
        nearestNeighbors: top.map((s) => ({
          name: s.m.name,
          bandgap: s.bg,
          similarity: s.overlap / Math.max(targetElements.size, s.elems.size),
        })),
      }
    }
  }

  // ── Strategy 3: Category average (no element signal) ─────────────────────
  if (sameCategoryWithBandgap.length > 0) {
    const avg =
      sameCategoryWithBandgap.reduce((sum, x) => sum + x.bg, 0) /
      sameCategoryWithBandgap.length
    // Confidence in [0.2, 0.3] — weakest signal, just a category prior.
    const confidence = clamp(0.1 + sameCategoryWithBandgap.length * 0.02, 0.2, 0.3)

    return {
      materialId: target.id,
      predictedBandgap: avg,
      confidence,
      method: 'category-average',
      nearestNeighbors: sameCategoryWithBandgap
        .slice(0, MAX_NEIGHBORS)
        .map((x) => ({ name: x.m.name, bandgap: x.bg, similarity: 0 })),
    }
  }

  // No same-category materials with bandgap and no element overlap anywhere.
  return null
}
