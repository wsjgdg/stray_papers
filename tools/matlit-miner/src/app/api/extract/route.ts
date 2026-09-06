import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { batchExtract, getLLMConfigsFromHeaders } from '@/lib/llm'
import { logInfo, logError } from '@/lib/logger'
import { rateLimit, getIdentifier, RATE_LIMITS } from '@/lib/rate-limit'

// POST /api/extract
// Body: { materialId?: string, onlySynthesized?: boolean, limit?: number }
// Headers:
//   x-llm-configs  — JSON array of LLMConfigEntry from P1's api-client
//                    (multi-config failover; tried in priority order).
//   x-llm-provider — legacy single-config header (still honored as a
//                    fallback by getLLMConfigsFromHeaders when x-llm-configs
//                    is absent).
//
// Runs deep extraction on classified papers (status='classified'),
// filling bandgapValue, synthesisMethod, conditions, etc.
export async function POST(req: NextRequest) {
  // --- Rate limit (LLM expensive — 20/min per IP) -------------------------
  const ip = getIdentifier(req)
  const rl = rateLimit(`extract:${ip}`, RATE_LIMITS.llm)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetAt: rl.resetAt },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    )
  }

  // Read multi-config failover list from headers (P3).
  const configs = getLLMConfigsFromHeaders(req.headers)

  const body = await req.json().catch(() => ({}))
  const { materialId, onlySynthesized = true, limit = 30 } = body

  const where: Record<string, unknown> = {
    status: 'classified',
  }
  if (onlySynthesized) {
    where.synthesized = 'yes'
  }
  if (materialId) where.materialId = materialId

  const classifications = await db.classification.findMany({
    where,
    take: Math.min(limit, 80),
    include: { paper: { include: { material: true } } },
  })

  if (classifications.length === 0) {
    logInfo('extract: no papers pending extraction', {
      route: 'extract',
      materialId: materialId ?? null,
      onlySynthesized,
    })
    return NextResponse.json({
      message: 'No papers pending extraction',
      processed: 0,
    })
  }

  logInfo('extract: batch started', {
    route: 'extract',
    count: classifications.length,
    materialId: materialId ?? null,
    onlySynthesized,
  })

  const items = classifications.map(c => ({
    id: c.id,
    text: c.paper.abstract || c.paper.title,
    material: c.paper.material.name,
  }))

  const results = await batchExtract(items, 2, undefined, configs)
  let processed = 0
  let errors = 0
  for (const { id, result } of results) {
    try {
      await db.classification.update({
        where: { id },
        data: {
          bandgapValue: result.bandgapValue,
          synthesisMethod: result.synthesisMethod,
          conditions: result.conditions,
          phaseDiagramInfo: result.phaseDiagramInfo,
          efficiencyValue: result.efficiencyValue,
          evidence: result.evidence,
          confidence: result.confidence,
          status: 'extracted',
        },
      })
      processed++
    } catch (e) {
      errors++
      logError('extract: classification update failed', {
        route: 'extract',
        classificationId: id,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  logInfo('extract: batch completed', {
    route: 'extract',
    processed,
    errors,
    total: classifications.length,
  })

  return NextResponse.json({
    processed,
    total: classifications.length,
    errors,
  })
}
