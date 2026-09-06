import { NextRequest, NextResponse } from 'next/server'
import {
  getJob,
  getLatestActiveJob,
  type ServerJobSnapshot,
  type ServerJobType,
} from '@/lib/server-job-progress'

// GET /api/jobs/[id]
//
// Poll-based progress endpoint. Two modes:
//
//   1. GET /api/jobs/<uuid>     — fetch a specific job by id (returned in the
//                                  POST /api/classify response as `jobId`).
//
//   2. GET /api/jobs/latest     — fetch the most recent active job, optionally
//                                  filtered by `?type=classify|extract|search`.
//                                  Used by the RunDialog when it doesn't yet
//                                  know the server-generated id (because the
//                                  POST that started the job is still in
//                                  flight). Pass `?since=<ms>` to restrict to
//                                  jobs that started at-or-after a wall-clock
//                                  timestamp, so a stale job from a previous
//                                  run is never adopted.
//
// Response: 200 with the ServerJobSnapshot, or 404 if no matching job exists.
// The RunDialog polls every 1s while `phase === 'running'` and falls back to
// the time-based estimate when this endpoint returns 404 (e.g. for `/api/extract`
// which doesn't yet report progress here).
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  if (id === 'latest') {
    const sp = req.nextUrl.searchParams
    const typeParam = sp.get('type')
    const sinceParam = sp.get('since')

    // Validate `type` against the known set; treat unknown values as "any".
    const knownTypes: ServerJobType[] = ['classify', 'extract', 'search', 'unknown']
    const type =
      typeParam && knownTypes.includes(typeParam as ServerJobType)
        ? (typeParam as ServerJobType)
        : undefined

    const sinceMs =
      sinceParam !== null && /^\d+$/.test(sinceParam)
        ? Number(sinceParam)
        : undefined

    const job: ServerJobSnapshot | null = getLatestActiveJob(type, sinceMs)
    if (!job) {
      return NextResponse.json(
        { error: 'No active job found', type: type ?? null },
        { status: 404 },
      )
    }
    return NextResponse.json(job)
  }

  const job = getJob(id)
  if (!job) {
    return NextResponse.json(
      { error: 'Job not found', id },
      { status: 404 },
    )
  }
  return NextResponse.json(job)
}
