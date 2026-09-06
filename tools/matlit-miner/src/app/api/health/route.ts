import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'
import { getCrossrefBreakerStatus } from '@/lib/crossref'
import { getS2BreakerStatus } from '@/lib/semantic-scholar'
import { getOpenAlexBreakerStatus } from '@/lib/openalex'
import type { CircuitBreakerStatus } from '@/lib/api-client-resilience'

// GET /api/health — aggregated observability endpoint.
//
// Returns TWO things in one payload:
//
//   1. `checks` — live status of every backend dependency:
//        - database    : Prisma `count()` round-trip latency
//        - realtime    : the mini-service on port 3005 (`/health` GET, 2s
//                        timeout) that broadcasts job / notification /
//                        comment events to the browser via Socket.io
//        - crossref    : circuit breaker state (closed / open / half-open)
//        - s2          : same shape — Semantic Scholar breaker
//        - openalex    : same shape — OpenAlex breaker
//        - llm         : always "up" — we don't ping the LLM because a real
//                        probe would burn tokens; the breaker isn't engaged
//                        for the LLM client (it has its own retry policy)
//
//   2. `metrics` + `recommendations` — the existing dashboard data-health
//      model (per-dimension scores 0–100, weighted overall health, and a
//      prioritized recommendation list). Unchanged from the pre-S6 shape so
//      the dashboard keeps working.
//
// The top-level `status` is derived:
//   - "healthy"   : every check is "up" (DB + realtime + 3 breakers closed
//                   + LLM nominal)
//   - "degraded"  : DB is up but at least one other check is down (e.g.
//                   a breaker is open, or the realtime service is offline)
//   - "unhealthy" : DB itself is down — the app cannot serve users.
//
// The whole payload is cached for 10s (shorter than the old 30s window) so
// a status dashboard can poll every few seconds without hammering the DB or
// the realtime service.

type Priority = 'high' | 'medium' | 'low'

interface Recommendation {
  key: string
  priority: Priority
  action: string
  target: string
  desc: string
  cta: { tab: string }
}

interface MetricSummary {
  count: number
  target?: number | null
  total?: number
  eligible?: number
  avgPerMaterial?: number
  pct?: number
  health: number
}

type CheckStatus = 'up' | 'down'

interface BaseCheck {
  status: CheckStatus
  latencyMs?: number
  error?: string
}

interface DbCheck extends BaseCheck {
  status: CheckStatus
  latencyMs: number
}

interface RealtimeCheck extends BaseCheck {
  status: CheckStatus
  latencyMs: number
  clients?: number
}

interface BreakerCheck extends BaseCheck {
  status: CheckStatus
  breakerState: CircuitBreakerStatus['state']
  consecutiveFailures: number
}

interface LlmCheck extends BaseCheck {
  status: CheckStatus
}

interface HealthChecks {
  database: DbCheck
  realtime: RealtimeCheck
  crossref: BreakerCheck
  s2: BreakerCheck
  openalex: BreakerCheck
  llm: LlmCheck
}

type OverallStatus = 'healthy' | 'degraded' | 'unhealthy'

interface HealthResponse {
  status: OverallStatus
  overallHealth: number
  checks: HealthChecks
  metrics: {
    materials: MetricSummary
    papers: MetricSummary
    classifications: MetricSummary
    extractions: MetricSummary
    efficiencies: MetricSummary
    verifications: MetricSummary
  }
  recommendations: Recommendation[]
}

// Tunable targets — kept server-side so the API stays self-describing.
const MATERIALS_TARGET = 60
const PAPERS_PER_MATERIAL_TARGET = 20

// How long to wait for the realtime `/health` probe before declaring it
// "down". 2s is generous for a localhost call — anything slower indicates
// the service is genuinely degraded.
const REALTIME_PROBE_TIMEOUT_MS = 2_000

// Health endpoint cache TTL. Polling is allowed every few seconds; the
// underlying DB count + realtime probe would be wasteful to run on every
// request. 10s strikes a balance between freshness and load.
const HEALTH_CACHE_TTL_MS = 10_000

// ---------------------------------------------------------------------------
// Per-dependency probes
// ---------------------------------------------------------------------------

async function probeDatabase(): Promise<DbCheck> {
  const t0 = Date.now()
  try {
    await db.material.count()
    return { status: 'up', latencyMs: Date.now() - t0 }
  } catch (e) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * Probe the realtime mini-service (port 3005) by GETting its `/health`
 * endpoint. Returns latency + the `clients` count if available.
 *
 * The URL is configurable via `REALTIME_HTTP_URL` so prod deploys / docker
 * compose can point at `http://realtime-service:3005` without code changes.
 */
async function probeRealtime(): Promise<RealtimeCheck> {
  const t0 = Date.now()
  const base = process.env.REALTIME_HTTP_URL || 'http://localhost:3005'
  const url = `${base}/health`
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REALTIME_PROBE_TIMEOUT_MS)
    try {
      const resp = await fetch(url, { signal: ctrl.signal })
      if (!resp.ok) {
        return {
          status: 'down',
          latencyMs: Date.now() - t0,
          error: `HTTP ${resp.status}`,
        }
      }
      const body = (await resp.json().catch(() => ({}))) as {
        ok?: boolean
        clients?: number
      }
      return {
        status: 'up',
        latencyMs: Date.now() - t0,
        clients: typeof body.clients === 'number' ? body.clients : undefined,
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * Map a CircuitBreakerStatus onto our `BreakerCheck` shape.
 *
 * A breaker that is `closed` or `half-open` is considered "up" — half-open
 * means the breaker is testing whether the service has recovered, which is
 * still an "operational" state. `open` means we've given up temporarily, so
 * that's "down".
 */
function breakerToCheck(
  status: CircuitBreakerStatus,
): BreakerCheck {
  const up = status.state !== 'open'
  return {
    status: up ? 'up' : 'down',
    breakerState: status.state,
    consecutiveFailures: status.consecutiveFailures,
    ...(up ? {} : { error: `circuit open after ${status.consecutiveFailures} failures` }),
  }
}

/**
 * The LLM check is a stub — we don't probe the LLM endpoint because doing so
 * would burn tokens for every health poll. The LLM client has its own retry
 * + timeout policy (see src/lib/llm.ts); if it's failing, that surfaces via
 * `apiError` -> `reportError` -> the /api/errors buffer rather than here.
 */
function probeLlm(): LlmCheck {
  return { status: 'up' }
}

// ---------------------------------------------------------------------------
// Status aggregation
// ---------------------------------------------------------------------------

function deriveOverallStatus(checks: HealthChecks): OverallStatus {
  if (checks.database.status === 'down') return 'unhealthy'
  const anyDown =
    checks.realtime.status === 'down' ||
    checks.crossref.status === 'down' ||
    checks.s2.status === 'down' ||
    checks.openalex.status === 'down' ||
    checks.llm.status === 'down'
  return anyDown ? 'degraded' : 'healthy'
}

// ---------------------------------------------------------------------------
// Existing dashboard metrics (unchanged) — kept here so /api/health stays a
// single round-trip for the dashboard.
// ---------------------------------------------------------------------------

interface DashboardMetrics {
  metrics: HealthResponse['metrics']
  overallHealth: number
  recommendations: Recommendation[]
}

async function computeDashboardMetrics(): Promise<DashboardMetrics> {
  const [
    materialsCount,
    papersCount,
    classificationsCount,
    synthesizedCount,
    extractedCount,
    efficiencyCount,
    verifiedCount,
    verificationsCount,
  ] = await Promise.all([
    db.material.count(),
    db.paper.count(),
    db.classification.count(),
    db.classification.count({ where: { synthesized: 'yes' } }),
    db.classification.count({ where: { status: 'extracted' } }),
    db.efficiency.count(),
    db.verification.count({ where: { status: 'verified' } }),
    db.verification.count(),
  ])

  const avgPerMaterial = materialsCount > 0 ? papersCount / materialsCount : 0
  const classificationPct =
    papersCount > 0 ? (classificationsCount / papersCount) * 100 : 0
  const extractionEligible = synthesizedCount
  // Aim for at least one efficiency record per material (NREL or
  // literature-extracted) so trend charts have signal.
  const efficiencyTarget = materialsCount

  const materialsHealth = Math.min(
    100,
    Math.round((materialsCount / MATERIALS_TARGET) * 100),
  )
  const papersHealth = Math.min(
    100,
    Math.round((avgPerMaterial / PAPERS_PER_MATERIAL_TARGET) * 100),
  )
  const classificationsHealth = Math.min(100, Math.round(classificationPct))
  const extractionsHealth =
    extractionEligible > 0
      ? Math.min(100, Math.round((extractedCount / extractionEligible) * 100))
      : 0
  const efficienciesHealth =
    efficiencyTarget > 0
      ? Math.min(100, Math.round((efficiencyCount / efficiencyTarget) * 100))
      : 0
  const verificationsHealth =
    materialsCount > 0
      ? Math.min(100, Math.round((verifiedCount / materialsCount) * 100))
      : 0

  // Weighted overall health — classifications dominate because they unlock
  // extraction, which unlocks verification.
  const overallHealth = Math.round(
    0.1 * materialsHealth +
      0.15 * papersHealth +
      0.3 * classificationsHealth +
      0.15 * extractionsHealth +
      0.15 * efficienciesHealth +
      0.15 * verificationsHealth,
  )

  const recommendations: Recommendation[] = []

  // 1. Classification gap — highest priority because it gates extraction.
  const unclassified = Math.max(0, papersCount - classificationsCount)
  if (papersCount > 0 && classificationPct < 90) {
    const pctUnc = (100 - classificationPct).toFixed(1)
    recommendations.push({
      key: 'classify',
      priority: 'high',
      action: 'Run classification',
      target: 'Classification tab',
      desc: `${unclassified} papers unclassified (${pctUnc}%). Run batch classification to enable extraction.`,
      cta: { tab: 'classification' },
    })
  }

  // 2. Efficiency records gap — high priority because trend/prediction
  //    charts need at least one record per material to be meaningful.
  if (efficiencyCount < materialsCount) {
    const needed = Math.max(0, materialsCount - efficiencyCount)
    const recWord = efficiencyCount === 1 ? 'record' : 'records'
    const matWord = needed === 1 ? 'material' : 'materials'
    recommendations.push({
      key: 'efficiency',
      priority: 'high',
      action: 'Add efficiency records',
      target: 'Efficiency tab',
      desc: `Only ${efficiencyCount} efficiency ${recWord}. Add NREL/literature values for ${needed} key ${matWord}.`,
      cta: { tab: 'efficiency' },
    })
  }

  // 3. Extraction gap — medium priority; only meaningful once some
  //    synthesized materials exist.
  if (extractionEligible > 0 && extractedCount < extractionEligible) {
    recommendations.push({
      key: 'extract',
      priority: 'medium',
      action: 'Run extraction',
      target: 'Extraction tab',
      desc: `${extractedCount} of ${extractionEligible} synthesized materials extracted.`,
      cta: { tab: 'extraction' },
    })
  }

  // 4. Verification gap — low priority polish step.
  if (extractedCount > 0 && verifiedCount < materialsCount) {
    recommendations.push({
      key: 'verify',
      priority: 'low',
      action: 'Verify results',
      target: 'Verification tab',
      desc: `Spot-check extracted data against source papers. ${verifiedCount}/${materialsCount} verified.`,
      cta: { tab: 'verification' },
    })
  }

  const priorityOrder: Record<Priority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  }
  recommendations.sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  )

  return {
    metrics: {
      materials: {
        count: materialsCount,
        target: MATERIALS_TARGET,
        health: materialsHealth,
      },
      papers: {
        count: papersCount,
        avgPerMaterial: parseFloat(avgPerMaterial.toFixed(1)),
        target: PAPERS_PER_MATERIAL_TARGET,
        health: papersHealth,
      },
      classifications: {
        count: classificationsCount,
        total: papersCount,
        pct: parseFloat(classificationPct.toFixed(1)),
        health: classificationsHealth,
      },
      extractions: {
        count: extractedCount,
        eligible: extractionEligible,
        health: extractionsHealth,
      },
      efficiencies: {
        count: efficiencyCount,
        target: efficiencyTarget,
        health: efficienciesHealth,
      },
      verifications: {
        count: verifiedCount,
        total: verificationsCount,
        health: verificationsHealth,
      },
    },
    overallHealth,
    recommendations,
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  const data = await getOrSet<HealthResponse>(
    'health:overview',
    HEALTH_CACHE_TTL_MS,
    async () => {
      // Run the dependency probes in parallel — none of them depend on each
      // other, and running them concurrently keeps the endpoint snappy.
      const [dbCheck, realtimeCheck, dashboard] = await Promise.all([
        probeDatabase(),
        probeRealtime(),
        computeDashboardMetrics(),
      ])

      const checks: HealthChecks = {
        database: dbCheck,
        realtime: realtimeCheck,
        crossref: breakerToCheck(getCrossrefBreakerStatus()),
        s2: breakerToCheck(getS2BreakerStatus()),
        openalex: breakerToCheck(getOpenAlexBreakerStatus()),
        llm: probeLlm(),
      }

      return {
        status: deriveOverallStatus(checks),
        overallHealth: dashboard.overallHealth,
        checks,
        metrics: dashboard.metrics,
        recommendations: dashboard.recommendations,
      }
    },
  )

  return NextResponse.json(data)
}
