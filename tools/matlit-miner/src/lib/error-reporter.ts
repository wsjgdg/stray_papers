// In-memory error reporter for the MatLit Miner backend.
//
// This is a deliberately small Sentry substitute: rather than shipping error
// data to an external service, we collect reports in an in-process ring
// buffer that an internal endpoint (e.g. /api/errors) can read for live
// debugging. The buffer is bounded and per-process, so it's not a durable
// store — but it's enough to spot-trend failures during a session and to
// feed the `/api/health` "degraded" recommendation logic.
//
// Integration:
//   - `reportError(err, meta)` is called from `apiError()` in
//     `src/lib/api-error.ts`, so every 4xx/5xx API failure automatically
//     lands here.
//   - Any other code path (e.g. a background timer that catches an
//     unexpected exception) can call `reportError` directly.
//
// The reporter also forwards every report to the structured logger so
// failures show up in `dev.log` regardless of whether anyone polls the
// /api/errors endpoint.

import { logError } from './logger'

export interface ErrorReport {
  message: string
  stack?: string
  url?: string
  userId?: string
  timestamp: number
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// In-memory ring buffer (per-process)
// ---------------------------------------------------------------------------

// Bound the buffer so a runaway loop can't OOM the process. 500 entries is
// roughly the right size for a research tool: enough to see a pattern across
// a session, small enough that surfacing all of them via /api/errors stays
// snappy.
const MAX_REPORTS = 500

// Persist the buffer across hot reloads in dev so a transient code change
// doesn't wipe a half-built debugging session.
const g = globalThis as unknown as {
  __matlitErrorReports?: ErrorReport[]
}

if (!g.__matlitErrorReports) g.__matlitErrorReports = []

const pendingReports: ErrorReport[] = g.__matlitErrorReports

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function coerceError(error: Error | string): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    }
  }
  // Strings / other primitives: just stringify.
  return { message: String(error) }
}

/**
 * Record an error in the in-memory buffer and forward it to the structured
 * logger. Safe to call from any context (server route, lib, mini-service).
 *
 * `meta` is merged into the report — useful for adding `route`, `userId`,
 * `materialId`, etc. Sensitive fields are redacted by the logger before
 * being written; the in-memory buffer keeps the raw meta so /api/errors can
 * show full context to a developer (this buffer is process-local and never
 * shipped externally).
 */
export function reportError(
  error: Error | string,
  meta?: Record<string, unknown>,
): void {
  const { message, stack } = coerceError(error)
  const report: ErrorReport = {
    message,
    stack,
    timestamp: Date.now(),
    ...meta,
  }

  pendingReports.push(report)
  // Trim oldest entries once over capacity — ring-buffer behavior.
  if (pendingReports.length > MAX_REPORTS) {
    pendingReports.splice(0, pendingReports.length - MAX_REPORTS)
  }

  // Forward to the logger so the failure also lands in dev.log (with
  // sensitive fields redacted). The `route` field (if present) makes the
  // log line easy to filter in a log aggregator.
  logError('reported error', { message, ...meta, hasStack: Boolean(stack) })
}

/**
 * Return a shallow copy of the pending reports. Newest entries are at the
 * end of the array.
 */
export function getPendingReports(): ErrorReport[] {
  return pendingReports.slice()
}

/**
 * Wipe the in-memory buffer. Used by the /api/errors endpoint to allow an
 * admin to "acknowledge" the current batch after investigating.
 */
export function clearReports(): void {
  pendingReports.length = 0
}
