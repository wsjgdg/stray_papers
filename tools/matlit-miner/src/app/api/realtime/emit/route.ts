import { NextResponse } from 'next/server'

/**
 * P2-10 — Realtime emit relay.
 *
 * POST /api/realtime/emit
 *   body: { event: 'job:progress' | 'notification:new' | 'comment:new' | string,
 *           data: Record<string, unknown>,
 *           room?: string }
 *
 * Forwards the payload to the standalone realtime mini-service's HTTP `/emit`
 * endpoint on port 3005 (which then broadcasts via Socket.io to all connected
 * clients). Other API routes (classify, papers search, comments, …) call this
 * to trigger realtime UI updates without each needing to manage its own
 * Socket.io client.
 *
 * Why a relay instead of calling port 3005 directly? Because the Next.js
 * server-side fetch needs an absolute URL, and centralising it here (read
 * from `process.env.REALTIME_HTTP_URL` with a `http://localhost:3005`
 * fallback) means:
 *   - the URL/port is configured in exactly one place,
 *   - other routes can `await fetch('/api/realtime/emit', …)` using a relative
 *     path (no absolute URL leak in the codebase),
 *   - we can add auth / rate-limiting / logging in one spot later.
 *
 * The relay is best-effort: if the realtime service is down we log and move
 * on (return 200 with `{ ok: false, skipped: true }`) so the calling API
 * route's primary work isn't blocked by a transient realtime outage.
 */

interface EmitBody {
  event: string
  data: Record<string, unknown>
  room?: string
}

/**
 * Base URL of the standalone realtime mini-service's HTTP endpoint.
 *
 * Defaults to `http://localhost:3005` for local development (where the
 * bun mini-service in `mini-services/realtime-service/` listens). In
 * production the deployer overrides this via the `REALTIME_HTTP_URL`
 * environment variable (e.g. `https://realtime.example.com`). We keep
 * the `/emit` and `/health` path suffixes as separate constants so the
 * same base can serve both endpoints.
 */
const REALTIME_HTTP_BASE = process.env.REALTIME_HTTP_URL || 'http://localhost:3005'
const REALTIME_HTTP_URL = `${REALTIME_HTTP_BASE}/emit`

export async function POST(request: Request): Promise<Response> {
  let body: EmitBody
  try {
    body = (await request.json()) as EmitBody
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body.event !== 'string' || body.event.length === 0) {
    return NextResponse.json(
      { error: '`event` (string) is required' },
      { status: 400 },
    )
  }
  if (body.data !== undefined && typeof body.data !== 'object') {
    return NextResponse.json(
      { error: '`data` must be an object when provided' },
      { status: 400 },
    )
  }

  try {
    const upstream = await fetch(REALTIME_HTTP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: body.event,
        data: body.data ?? {},
        room: body.room,
      }),
      // Don't let a slow realtime service stall the calling route.
      signal: AbortSignal.timeout(3_000),
    })
    const text = await upstream.text()
    let json: unknown = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = text
      }
    }
    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'realtime service returned non-200',
          status: upstream.status,
          detail: json,
        },
        { status: 502 },
      )
    }
    return NextResponse.json({ ok: true, relayed: true, upstream: json })
  } catch (err) {
    // Best-effort: realtime is a nice-to-have, not a hard dependency.
    // Log to server console for debugging but don't fail the caller.
    console.warn('[realtime/emit] relay failed:', err)
    return NextResponse.json(
      { ok: false, skipped: true, reason: 'realtime service unavailable' },
      { status: 200 },
    )
  }
}

/**
 * GET /api/realtime/emit — tiny health-check that pings the realtime
 * service's /health endpoint on port 3005. Useful for smoke tests and the
 * eventual /api/health aggregation.
 */
export async function GET(): Promise<Response> {
  try {
    const upstream = await fetch(`${REALTIME_HTTP_BASE}/health`, {
      signal: AbortSignal.timeout(2_000),
    })
    const text = await upstream.text()
    let json: unknown = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = text
      }
    }
    return NextResponse.json({ ok: upstream.ok, upstream: json })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'realtime service unreachable', detail: String(err) },
      { status: 200 },
    )
  }
}
