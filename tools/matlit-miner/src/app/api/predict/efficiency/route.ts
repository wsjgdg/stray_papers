import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'

// GET /api/predict/efficiency
// Forecasts the year each material may cross an efficiency threshold
// (25%, 30%, 33%) based on a simple linear regression over historical
// efficiency data points. Data points are sourced from BOTH the
// `Efficiency` table (database records, e.g. NREL) AND parsed
// `Classification.efficiencyValue` joined to `Paper.year` (literature
// extraction). For each year we keep the maximum efficiency observed
// across all sources.
//
// A material is included only when it has >= 2 year-data-points and a
// strictly positive slope. Thresholds already crossed return `null`
// (already achieved). Predicted years are capped at currentYear + 20.

export interface PredictionDataPoint {
  year: number
  eff: number
}

export interface MaterialPrediction {
  materialId: string
  materialName: string
  currentBest: number
  slope: number // pp/year
  intercept: number
  r2: number
  predictions: {
    threshold25: number | null
    threshold30: number | null
    threshold33: number | null
  }
  dataPoints: PredictionDataPoint[]
}

interface PredictionResponse {
  predictions: MaterialPrediction[]
  generatedAt: string
}

const THRESHOLDS = [25, 30, 33] as const
const CAP_YEARS_AHEAD = 20

/**
 * Parse a free-form efficiency string (e.g. "23.08%", "~22.5", "14.2 ± 0.3")
 * into a numeric percentage. Returns null when no plausible value is found
 * or when the value is out of range [0, 100].
 */
function parseEfficiency(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[%()]/g, '').trim()
  const match = cleaned.match(/-?\d+(\.\d+)?/)
  if (!match) return null
  const v = parseFloat(match[0])
  if (!Number.isFinite(v) || v < 0 || v > 100) return null
  return v
}

/**
 * Ordinary least squares regression of `eff` on `year`.
 * Returns slope (pp/year), intercept, and coefficient of determination (r^2).
 * r^2 is clamped to [0, 1] — negative r^2 (which can occur when the model
 * fits worse than a horizontal line at the mean, only possible with
 * non-OLS models) is treated as 0.
 */
function linearRegression(points: PredictionDataPoint[]): {
  slope: number
  intercept: number
  r2: number
} {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 }
  const xs = points.map((p) => p.year)
  const ys = points.map((p) => p.eff)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  let totalSS = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
    totalSS += (ys[i] - meanY) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = meanY - slope * meanX
  let residualSS = 0
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept
    residualSS += (ys[i] - pred) ** 2
  }
  const r2 = totalSS === 0 ? 0 : Math.max(0, Math.min(1, 1 - residualSS / totalSS))
  return { slope, intercept, r2 }
}

/**
 * Predict the calendar year in which the regression line crosses `threshold`.
 * Returns null when:
 *   - the threshold has already been achieved (currentBest >= threshold)
 *   - slope is non-positive (cannot reach a higher threshold)
 * Predicted years are rounded up (a threshold crossed mid-year counts as
 * the following year) and capped at currentYear + 20 to avoid absurdly
 * far-future forecasts.
 */
function predictYear(
  slope: number,
  intercept: number,
  threshold: number,
  currentBest: number,
): number | null {
  if (currentBest >= threshold) return null
  if (slope <= 0) return null
  const rawYear = (threshold - intercept) / slope
  if (!Number.isFinite(rawYear)) return null
  const currentYear = new Date().getFullYear()
  const capped = Math.min(rawYear, currentYear + CAP_YEARS_AHEAD)
  return Math.ceil(capped)
}

export async function GET(): Promise<Response> {
  const result = await getOrSet<PredictionResponse>(
    'predict:efficiency',
    60_000,
    async () => {
      // 1. Database Efficiency records (canonical, e.g. NREL / Perovskite Database)
      const effRecords = await db.efficiency.findMany({
        where: { year: { not: null } },
        select: {
          materialId: true,
          year: true,
          efficiencyValue: true,
          material: { select: { name: true } },
        },
      })

      // 2. Classification.efficiencyValue parsed + Paper.year (literature-extracted)
      const classRecords = await db.classification.findMany({
        where: {
          efficiencyValue: { not: '' },
          paper: { year: { not: null } },
        },
        select: {
          materialId: true,
          efficiencyValue: true,
          paper: { select: { year: true } },
          material: { select: { name: true } },
        },
      })

      // Combine into materialId -> { name, yearEff: Map<year, maxEff> }
      const byMaterial = new Map<
        string,
        { name: string; yearEff: Map<number, number> }
      >()
      const ensure = (materialId: string, name: string) => {
        let entry = byMaterial.get(materialId)
        if (!entry) {
          entry = { name, yearEff: new Map<number, number>() }
          byMaterial.set(materialId, entry)
        }
        return entry
      }

      for (const r of effRecords) {
        if (r.year == null) continue
        const entry = ensure(r.materialId, r.material.name)
        const prev = entry.yearEff.get(r.year) ?? -Infinity
        if (r.efficiencyValue > prev) entry.yearEff.set(r.year, r.efficiencyValue)
      }
      for (const c of classRecords) {
        const year = c.paper.year
        if (year == null) continue
        const parsed = parseEfficiency(c.efficiencyValue)
        if (parsed == null) continue
        const entry = ensure(c.materialId, c.material.name)
        const prev = entry.yearEff.get(year) ?? -Infinity
        if (parsed > prev) entry.yearEff.set(year, parsed)
      }

      const predictions: MaterialPrediction[] = []
      for (const [materialId, { name, yearEff }] of byMaterial) {
        const points: PredictionDataPoint[] = Array.from(yearEff.entries())
          .map(([year, eff]) => ({ year, eff }))
          .sort((a, b) => a.year - b.year)
        if (points.length < 2) continue
        const { slope, intercept, r2 } = linearRegression(points)
        if (slope <= 0) continue
        const currentBest = points.reduce((m, p) => Math.max(m, p.eff), 0)
        predictions.push({
          materialId,
          materialName: name,
          currentBest,
          slope,
          intercept,
          r2,
          predictions: {
            threshold25: predictYear(slope, intercept, THRESHOLDS[0], currentBest),
            threshold30: predictYear(slope, intercept, THRESHOLDS[1], currentBest),
            threshold33: predictYear(slope, intercept, THRESHOLDS[2], currentBest),
          },
          dataPoints: points,
        })
      }

      // Sort by slope descending — fastest-improving materials first.
      predictions.sort((a, b) => b.slope - a.slope)

      return {
        predictions,
        generatedAt: new Date().toISOString(),
      }
    },
  )

  return NextResponse.json(result)
}
