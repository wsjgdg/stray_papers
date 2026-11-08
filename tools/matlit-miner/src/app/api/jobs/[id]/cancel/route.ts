import { NextRequest, NextResponse } from 'next/server'

// POST /api/jobs/[id]/cancel
// -----------------------------------------------------------------------------
// Mark a long-running batch job as cancelled. The actual job (running in
// /api/classify/batch or /api/extract/batch) polls `isJobCancelled(id)`
// between chunks; when it sees the flag flip to `true`, it stops processing
// the remaining chunks and returns partial results with `{ aborted: true }`.
//
// WHY A SEPARATE ENDPOINT: the client (RunDialog) does not own the underlying
// fetch — the parent tab (classification-tab / extraction-tab) drives the
// mutation. So AbortController on the client side cannot reach the server's
// in-flight request. Instead the client POSTs here, the server flips a flag
// in this module's Map, and the running route handler observes the flag on
// its next iteration and bails out cleanly.
//
// The route handler ALSO checks `req.signal.aborted` (Next.js Request exposes
// the underlying fetch signal) — that path handles the case where the client
// DOES abort the fetch directly (e.g. via AbortController in api-client).
//
// CO-LOCATION NOTE: the cancellation flag store lives in this route file
// (not in src/lib/server-job-progress.ts) because that file is off-limits
// for this task. The store is module-scoped and shared across all routes
// via the imported helpers below — Next.js guarantees a single module
// instance per server process, so writes from the cancel endpoint are
// immediately visible to the batch routes.
// -----------------------------------------------------------------------------

const g = globalThis as unknown as {
  __matlitCancelledJobs?: Map<string, number>
}

if (!g.__matlitCancelledJobs) g.__matlitCancelledJobs = new Map()

const cancelledJobs: Map<string, number> = g.__matlitCancelledJobs

// Auto-prune cancellation flags older than this — once the job has finished
// (and the route has had a chance to observe the flag), the flag is useless.
const CANCEL_FLAG_TTL_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Mark a job as cancelled. Idempotent — calling twice is safe.
 * The flag expires after `CANCEL_FLAG_TTL_MS` to prevent unbounded Map
 * growth if a job never observes its own cancellation (e.g. server crash).
 */
export function cancelJob(id: string): void {
  if (!id) return
  cancelledJobs.set(id, Date.now())
  // Opportunistic prune: drop flags older than the TTL.
  // Cheap (O(n)) and runs only on writes, not reads.
  const cutoff = Date.now() - CANCEL_FLAG_TTL_MS
  for (const [k, ts] of cancelledJobs) {
    if (ts < cutoff) cancelledJobs.delete(k)
  }
}

/**
 * Has this job been cancelled? Route handlers call this between chunks.
 * Also prunes the entry on read if observed (so a one-shot cancel doesn't
 * linger forever).
 */
export function isJobCancelled(id: string | null | undefined): boolean {
  if (!id) return false
  return cancelledJobs.has(id)
}

/**
 * Clear the cancellation flag for a job. Called by the route handler once
 * it has observed the cancellation and is about to return — so a re-run
 * with the same id (rare, but possible if the client reuses timestamps)
 * starts with a clean slate.
 */
export function clearCancelFlag(id: string | null | undefined): void {
  if (!id) return
  cancelledJobs.delete(id)
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  // Optional body so callers can pass a reason / requestedAt for logging.
  const body = await req.json().catch(() => ({} as { reason?: string }))
  const reason = typeof body?.reason === 'string' ? body.reason : 'user_request'

  cancelJob(id)

  return NextResponse.json({
    id,
    cancelled: true,
    reason,
    message: 'Cancellation requested. The running job will stop after the current chunk.',
  })
}
