import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classifyAbstract, getLLMConfigsFromHeaders } from '@/lib/llm'
import { reportJobStart, reportProgress, reportJobComplete } from '@/lib/progress-reporter'
import { trackJob, updateJob, completeJob } from '@/lib/server-job-progress'
import { isJobCancelled, clearCancelFlag } from '@/app/api/jobs/[id]/cancel/route'
import { rateLimit, getIdentifier, RATE_LIMITS } from '@/lib/rate-limit'

// POST /api/classify/batch
// Body: { limit?: number, jobId?: string }
// Classify ALL unclassified papers across all materials, in batches.
// Reports fine-grained progress via WebSocket if jobId is provided.
//
// R5 — ABORT SUPPORT:
//   • The client can abort the underlying fetch (AbortController) — we
//     observe that via `req.signal.aborted` and bail out.
//   • The client can also POST /api/jobs/[id]/cancel — we observe that
//     via `isJobCancelled(jobId)` and bail out.
//   • On either path, we stop after the current chunk resolves and return
//     partial results with `{ aborted: true }` so the caller can show
//     "Cancelled — N/M classified" instead of a generic success.
//   • The job is also tracked via `trackJob` (HTTP polling endpoint) so
//     the RunDialog can discover the server-side job id and POST to
//     /api/jobs/[id]/cancel once it's adopted the id.
export async function POST(req: NextRequest) {
  // --- Rate limit (very expensive — 5/min per IP) -------------------------
  const ip = getIdentifier(req)
  const rl = rateLimit(`classify-batch:${ip}`, RATE_LIMITS.batch)
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

  const body = await req.json().catch(() => ({}))
  const { limit = 200, jobId } = body

  // Configure LLM from request headers (openai-compatible backend).
  const configs = getLLMConfigsFromHeaders(req.headers)

  const papers = await db.paper.findMany({
    where: { classification: null },
    take: Math.min(limit, 500),
    include: { material: true },
  })

  if (papers.length === 0) {
    return NextResponse.json({ message: 'No unclassified papers', processed: 0 })
  }

  // Start progress tracking (WebSocket + HTTP polling so the RunDialog
  // can discover the job id for cancel).
  if (jobId) {
    reportJobStart(jobId, 'classify', papers.length)
    trackJob({ id: jobId, type: 'classify', total: papers.length, message: `Classifying ${papers.length} papers` })
  }

  let processed = 0
  let errors = 0
  let aborted = false
  const items = papers.map(p => ({ id: p.id, abstract: p.abstract, material: p.material.name }))
  const CHUNK = 6
  for (let i = 0; i < items.length; i += CHUNK) {
    // R5: check for cancellation BEFORE starting the next chunk. Covers
    // both the client-aborted fetch (req.signal) and the cancel endpoint
    // (isJobCancelled). The previous chunk's results are preserved.
    if (req.signal?.aborted || isJobCancelled(jobId)) {
      aborted = true
      break
    }
    const chunk = items.slice(i, i + CHUNK)
    const results = await Promise.allSettled(
      chunk.map(async (item) => {
        const result = await classifyAbstract(item.abstract, item.material, undefined, configs)
        const paper = papers.find(p => p.id === item.id)
        if (!paper) return
        const toBool = (v: unknown) => v === true || v === 'true'
        const toStr = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''))
        await db.classification.upsert({
          where: { paperId: item.id },
          create: {
            paperId: item.id,
            materialId: paper.materialId,
            synthesized: result.synthesized,
            hasBandgap: toBool(result.hasBandgap),
            hasMethod: toBool(result.hasMethod),
            hasEfficiency: toBool(result.hasEfficiency),
            hasPhaseDiagram: toBool(result.hasPhaseDiagram),
            evidence: toStr(result.evidence).slice(0, 500),
            confidence: result.confidence,
            status: 'classified',
            model: configs[0]?.model || 'gpt-4o-mini',
          },
          update: {
            synthesized: result.synthesized,
            hasBandgap: toBool(result.hasBandgap),
            hasMethod: toBool(result.hasMethod),
            hasEfficiency: toBool(result.hasEfficiency),
            hasPhaseDiagram: toBool(result.hasPhaseDiagram),
            evidence: toStr(result.evidence).slice(0, 500),
            confidence: result.confidence,
            status: 'classified',
          },
        })
        // Report progress per paper (fine-grained)
        if (jobId) {
          const done = processed + errors + 1
          reportProgress(jobId, done, papers.length, errors, `Classified ${done}/${papers.length}`)
          updateJob(jobId, { completed: done, errors, currentPaperTitle: paper.title, message: `Classified ${done}/${papers.length}` })
        }
        return result
      }),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') processed++
      else errors++
    }
    // Report progress after each chunk
    if (jobId) {
      reportProgress(jobId, processed + errors, papers.length, errors, `Classified ${processed + errors}/${papers.length}`)
      updateJob(jobId, { completed: processed + errors, errors, message: `Classified ${processed + errors}/${papers.length}` })
    }
  }

  // Clean up the cancel flag if we observed it (so a re-run with the same
  // id starts clean). No-op if the flag was never set.
  if (aborted && jobId) clearCancelFlag(jobId)

  // Complete the job. On abort we still mark it "completed" (not "failed")
  // because the route returned partial results successfully — the caller
  // decides how to surface the abort via the `aborted` flag in the body.
  if (jobId) {
    const finalMessage = aborted
      ? `Cancelled after ${processed}/${papers.length}`
      : `Processed ${processed}, errors ${errors}`
    reportJobComplete(jobId, errors > 0 && processed === 0 ? 'failed' : 'completed', finalMessage)
    completeJob(jobId, errors > 0 && processed === 0 ? 'error' : 'done', finalMessage)
  }

  return NextResponse.json({
    processed,
    errors,
    total: papers.length,
    aborted,
  })
}
