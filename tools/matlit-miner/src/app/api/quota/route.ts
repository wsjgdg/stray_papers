/**
 * LLM usage quota API.
 *
 * GET  /api/quota
 *   Returns the caller's current quota status:
 *   { used, limit, remaining, resetAt, percentUsed, tokensEstimate, history, identifier }
 *
 * POST /api/quota  body: { limit?: number; identifier?: string; reset?: boolean }
 *   Admin endpoint (no auth — P3-11 not landed). Sets a per-identifier
 *   daily-limit override, or resets the window when `reset: true`.
 *   Returns the updated status.
 *
 * The identifier is resolved from request headers (x-forwarded-for,
 * x-real-ip, x-user-email) and falls back to `"default"` for localhost /
 * dev. This matches what `callLLM` records under, so the dev dashboard
 * reflects real usage.
 */
import { NextResponse } from 'next/server'
import {
  getQuotaStatus,
  setQuotaLimit,
  resetQuota,
  getIdentifierFromHeaders,
  DEFAULT_QUOTA,
} from '@/lib/llm-quota'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const identifier = getIdentifierFromHeaders(request.headers)
  const status = getQuotaStatus(identifier)
  return NextResponse.json({
    ...status,
    identifier,
    defaultLimit: DEFAULT_QUOTA.dailyLimit,
    windowMs: DEFAULT_QUOTA.windowMs,
  })
}

export async function POST(request: Request) {
  let body: { limit?: number; identifier?: string; reset?: boolean } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }

  const identifier =
    body.identifier || getIdentifierFromHeaders(request.headers)

  if (body.reset) {
    resetQuota(identifier)
  }

  if (typeof body.limit === 'number' && Number.isFinite(body.limit)) {
    // limit <= 0 clears the override (falls back to DEFAULT_QUOTA)
    setQuotaLimit(identifier, Math.max(0, Math.floor(body.limit)))
  }

  const status = getQuotaStatus(identifier)
  return NextResponse.json({
    ...status,
    identifier,
    defaultLimit: DEFAULT_QUOTA.dailyLimit,
    windowMs: DEFAULT_QUOTA.windowMs,
    ok: true,
  })
}
