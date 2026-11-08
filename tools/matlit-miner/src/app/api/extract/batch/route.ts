import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { extractData, getLLMConfigsFromHeaders } from '@/lib/llm'
import { reportJobStart, reportProgress, reportJobComplete } from '@/lib/progress-reporter'
import { trackJob, updateJob, completeJob } from '@/lib/server-job-progress'
import { isJobCancelled, clearCancelFlag } from '@/app/api/jobs/[id]/cancel/route'
import { rateLimit, getIdentifier, RATE_LIMITS } from '@/lib/rate-limit'

// POST /api/extract/batch
// Body: { limit?: number, onlySynthesized?: boolean, jobId?: string }
// Deep-extract ALL classified papers (status='classified') across all materials.
// Reports fine-grained progress via WebSocket if jobId is provided.
//
// R5 — ABORT SUPPORT:
//   • The client can abort the underlying fetch (AbortController) — we
//     observe that via `req.signal.aborted` and bail out.
//   • The client can also POST /api/jobs/[id]/cancel — we observe that
//     via `isJobCancelled(jobId)` and bail out.
//   • On either path, we stop after the current chunk resolves and return
//     partial results with `{ aborted: true }` so the caller can show
//     "Cancelled — N/M extracted" instead of a generic success.
//   • The job is also tracked via `trackJob` (HTTP polling endpoint) so
//     the RunDialog can discover the server-side job id and POST to
//     /api/jobs/[id]/cancel once it's adopted the id.
export async function POST(req: NextRequest) {
  // --- Rate limit (very expensive — 5/min per IP) -------------------------
  const ip = getIdentifier(req)
  const rl = rateLimit(`extract-batch:${ip}`, RATE_LIMITS.batch)
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
  const { limit = 200, onlySynthesized = true, jobId } = body

  // Configure LLM from request headers (openai-compatible backend).
  const configs = getLLMConfigsFromHeaders(req.headers)

  const where: Record<string, unknown> = { status: 'classified' }
  if (onlySynthesized) where.synthesized = 'yes'

  const classifications = await db.classification.findMany({
    where,
    take: Math.min(limit, 500),
    include: { paper: { include: { material: true } } },
  })

  if (classifications.length === 0) {
    return NextResponse.json({ message: 'No papers pending extraction', processed: 0 })
  }

  if (jobId) {
    reportJobStart(jobId, 'extract', classifications.length)
    trackJob({ id: jobId, type: 'extract', total: classifications.length, message: `Extracting ${classifications.length} papers` })
  }

  let processed = 0
  let errors = 0
  let aborted = false
  const CHUNK = 4
  for (let i = 0; i < classifications.length; i += CHUNK) {
    // R5: check for cancellation BEFORE starting the next chunk. Covers
    // both the client-aborted fetch (req.signal) and the cancel endpoint
    // (isJobCancelled). The previous chunk's results are preserved.
    if (req.signal?.aborted || isJobCancelled(jobId)) {
      aborted = true
      break
    }
    const chunk = classifications.slice(i, i + CHUNK)
    const results = await Promise.allSettled(
      chunk.map(async (c) => {
        const result = await extractData(c.paper.abstract || c.paper.title, c.paper.material.name, undefined, configs)
        await db.classification.update({
          where: { id: c.id },
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
        // Report progress per paper (fine-grained)
        if (jobId) {
          const done = processed + errors + 1
          reportProgress(jobId, done, classifications.length, errors, `Extracted ${done}/${classifications.length}`)
          updateJob(jobId, { completed: done, errors, currentPaperTitle: c.paper.title, message: `Extracted ${done}/${classifications.length}` })
        }
        return result
      }),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') processed++
      else errors++
    }
    if (jobId) {
      reportProgress(jobId, processed + errors, classifications.length, errors, `Extracted ${processed + errors}/${classifications.length}`)
      updateJob(jobId, { completed: processed + errors, errors, message: `Extracted ${processed + errors}/${classifications.length}` })
    }
  }

  // Clean up the cancel flag if we observed it (so a re-run with the same
  // id starts clean). No-op if the flag was never set.
  if (aborted && jobId) clearCancelFlag(jobId)

  if (jobId) {
    const finalMessage = aborted
      ? `Cancelled after ${processed}/${classifications.length}`
      : `Processed ${processed}, errors ${errors}`
    reportJobComplete(jobId, errors > 0 && processed === 0 ? 'failed' : 'completed', finalMessage)
    completeJob(jobId, errors > 0 && processed === 0 ? 'error' : 'done', finalMessage)
  }

  return NextResponse.json({
    processed,
    errors,
    total: classifications.length,
    aborted,
  })
}
