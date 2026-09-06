import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { batchClassify, getLLMConfigsFromHeaders } from '@/lib/llm'
import {
  trackJob,
  updateJob,
  completeJob,
} from '@/lib/server-job-progress'
import { logInfo, logWarn, logError } from '@/lib/logger'
import { rateLimit, getIdentifier, RATE_LIMITS } from '@/lib/rate-limit'

// POST /api/classify
// Body: { materialId?: string, limit?: number }
// Headers:
//   x-llm-configs  — JSON array of LLMConfigEntry from P1's api-client
//                    (multi-config failover; tried in priority order).
//   x-llm-provider — legacy single-config header (still honored as a
//                    fallback by getLLMConfigsFromHeaders when x-llm-configs
//                    is absent, so the existing api-client keeps working
//                    until P1 ships the new multi-config UI).
//
// Backwards-compatible response shape: still returns { processed, total } at
// the end (existing callers in classification-tab.tsx read these). A new
// `jobId` field is added so the RunDialog can adopt the server-side job and
// poll /api/jobs/[id] for REAL per-paper progress (instead of the prior
// time-based estimate). The job is registered with the in-memory Map in
// src/lib/server-job-progress.ts before the first paper is processed, so the
// client's first poll (1 second after `Run`) sees `completed: 0, total: N`.
export async function POST(req: NextRequest) {
  // --- Rate limit (LLM expensive — 20/min per IP) -------------------------
  const ip = getIdentifier(req)
  const rl = rateLimit(`classify:${ip}`, RATE_LIMITS.llm)
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

  // Read multi-config failover list from headers. Falls back to legacy
  // single-config headers when x-llm-configs is absent, and ultimately to
  // the server env OpenAI config (OPENAI_*).
  const configs = getLLMConfigsFromHeaders(req.headers)

  const body = await req.json().catch(() => ({}))
  const { materialId, limit = 50 } = body

  const where: Record<string, unknown> = { classification: null }
  if (materialId) where.materialId = materialId

  const papers = await db.paper.findMany({
    where,
    take: Math.min(limit, 100),
    include: { material: true },
  })

  if (papers.length === 0) {
    logInfo('classify: no unclassified papers found', {
      route: 'classify',
      materialId: materialId ?? null,
    })
    return NextResponse.json({
      message: 'No unclassified papers found',
      processed: 0,
    })
  }

  logInfo('classify: batch started', {
    route: 'classify',
    jobId: null, // assigned below; logged again with the id once known
    count: papers.length,
    materialId: materialId ?? null,
  })

  // Register a server-side job for live progress polling. The id is also
  // surfaced in the response so the RunDialog can poll /api/jobs/[id]
  // directly once it observes the response — but more importantly the
  // dialog polls /api/jobs/latest?type=classify to discover this id BEFORE
  // the response arrives (since the route blocks until done).
  const jobId = trackJob({
    type: 'classify',
    total: papers.length,
    message: `Classifying ${papers.length} papers…`,
  })
  logInfo('classify: job registered', {
    route: 'classify',
    jobId,
    total: papers.length,
  })

  const items = papers.map(p => ({
    id: p.id,
    abstract: p.abstract,
    material: p.material.name,
    title: p.title,
  }))

  // batchClassify already accepts an onProgress callback (per-item). We wire
  // it to the server-job-progress map so /api/jobs/[id] reflects reality.
  // The `configs` array drives multi-provider failover inside callLLMWithFailover.
  const results = await batchClassify(
    items.map(({ id, abstract, material }) => ({ id, abstract, material })),
    3,
    (done, total) => {
      updateJob(jobId, {
        completed: done,
        total,
        message: `Classified ${done}/${total}`,
      })
    },
    configs,
  )

  let processed = 0
  let errors = 0
  for (const { id, result } of results) {
    const paper = papers.find(p => p.id === id)
    if (!paper) {
      errors++
      continue
    }
    // Update the live "current paper" hint BEFORE the DB write so the client
    // sees the title while the upsert is in flight.
    updateJob(jobId, { currentPaperTitle: paper.title })
    try {
      await db.classification.upsert({
        where: { paperId: id },
        create: {
          paperId: id,
          materialId: paper.materialId,
          synthesized: result.synthesized,
          hasBandgap: result.hasBandgap,
          hasMethod: result.hasMethod,
          hasEfficiency: result.hasEfficiency,
          hasPhaseDiagram: result.hasPhaseDiagram,
          evidence: result.evidence,
          confidence: result.confidence,
          status: 'classified',
          model: 'glm-4-flash',
        },
        update: {
          synthesized: result.synthesized,
          hasBandgap: result.hasBandgap,
          hasMethod: result.hasMethod,
          hasEfficiency: result.hasEfficiency,
          hasPhaseDiagram: result.hasPhaseDiagram,
          evidence: result.evidence,
          confidence: result.confidence,
          status: 'classified',
        },
      })
      processed++
    } catch (e) {
      errors++
      logError('classify: paper upsert failed', {
        route: 'classify',
        jobId,
        paperId: id,
        error: e instanceof Error ? e.message : String(e),
        progress: `${processed + errors}/${papers.length}`,
      })
      updateJob(jobId, { errors, message: `Error on paper ${processed + errors}/${papers.length}` })
    }
  }

  completeJob(
    jobId,
    errors > 0 && processed === 0 ? 'error' : 'done',
    `Processed ${processed}, errors ${errors}`,
  )

  logInfo('classify: batch completed', {
    route: 'classify',
    jobId,
    processed,
    errors,
    total: papers.length,
    outcome: errors > 0 && processed === 0 ? 'error' : 'done',
  })

  // Q6 — broadcast job completion to all connected clients via the realtime
  // service on port 3005. Best-effort: never fail the main response if the
  // emit fails (e.g. service down or transient network error). The base URL
  // is configurable via `process.env.REALTIME_HTTP_URL` (defaults to the
  // local dev service on port 3005) so production deploys can point at a
  // different host without code changes.
  fetch(`${process.env.REALTIME_HTTP_URL || 'http://localhost:3005'}/emit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'job:progress',
      data: {
        jobId,
        status: errors > 0 && processed === 0 ? 'error' : 'done',
        completed: processed,
        total: papers.length,
        errors,
        message: `Processed ${processed}, errors ${errors}`,
      },
    }),
  }).catch((e: unknown) => {
    logWarn('classify: realtime emit failed', {
      route: 'classify',
      jobId,
      error: e instanceof Error ? e.message : String(e),
    })
  })

  return NextResponse.json({
    processed,
    total: papers.length,
    errors,
    // NEW: server-generated job id so the client can poll /api/jobs/[id].
    // Existing callers ignore this field; the RunDialog uses it to fetch
    // real-time progress while this POST is still in flight.
    jobId,
  })
}
