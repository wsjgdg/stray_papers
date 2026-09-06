import { NextRequest, NextResponse } from 'next/server'
import { reportError } from './error-reporter'

/**
 * Unified API error response helper.
 *
 * All API routes should use this instead of constructing their own
 * `NextResponse.json({ error: '...' }, { status: 5xx })` so that error
 * payloads are consistent across the surface area:
 *
 *   {
 *     error:   string,            // human-readable message
 *     status:  number,            // echoed HTTP status (mirrors the response code)
 *     details?: string            // optional truncated details (≤200 chars)
 *   }
 *
 * S4/S5: every error is also recorded in the in-memory error-reporter
 * buffer (`src/lib/error-reporter.ts`). `reportError` itself forwards the
 * report to the structured logger (`src/lib/logger.ts`), so a single call
 * here lands the error in BOTH the in-memory `/api/errors` buffer AND
 * `dev.log` as a JSON line — no need to call `logError` separately.
 *
 * The optional `req` argument lets us pull the route path out of the
 * request URL so log entries are filterable by route. Callers that don't
 * have a NextRequest handy (e.g. a lib function called from a route) can
 * omit it; the report will then carry `route: 'unknown'`.
 */
export function apiError(
  message: string,
  status: number = 500,
  details?: unknown,
  req?: NextRequest,
) {
  // Pull the route path out of the request (when available) so the log /
  // error-report entries are easy to filter in an aggregator. We use the
  // pathname only — the query string can contain user input we don't want
  // to ship into a structured log.
  const url = req?.url ? new URL(req.url).pathname : undefined
  const meta: Record<string, unknown> = { route: url ?? 'unknown', status }
  if (details !== undefined) {
    meta.details = String(details).slice(0, 200)
  }

  // reportError buffers the report AND forwards it to the structured logger.
  reportError(message, meta)

  return NextResponse.json(
    {
      error: message,
      status,
      ...(details ? { details: String(details).slice(0, 200) } : {}),
    },
    { status },
  )
}

/** Shorthand for 400 Bad Request. */
export function apiBadRequest(message: string, details?: unknown, req?: NextRequest) {
  return apiError(message, 400, details, req)
}

/** Shorthand for 404 Not Found. */
export function apiNotFound(message: string, req?: NextRequest) {
  return apiError(message, 404, undefined, req)
}
