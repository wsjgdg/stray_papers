/**
 * In-memory sliding-window rate limiter.
 *
 * Single-instance deployment — adequate for abuse prevention. The Map resets
 * on server restart, which is acceptable: an attacker would need to keep up
 * the abuse continuously, and a restart at least clears the slate.
 *
 * Usage (inside an API route handler):
 *
 *   import { rateLimit, getIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
 *
 *   const ip = getIdentifier(req)
 *   const rl = rateLimit(`classify:${ip}`, RATE_LIMITS.llm)
 *   if (!rl.allowed) {
 *     return NextResponse.json(
 *       { error: 'Rate limit exceeded', resetAt: rl.resetAt },
 *       {
 *         status: 429,
 *         headers: {
 *           'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
 *         },
 *       },
 *     )
 *   }
 *
 * The `identifier` key SHOULD include a route-namespace prefix (e.g.
 * `classify:${ip}`) so that limits on different routes don't share a bucket
 * — otherwise a heavy /api/classify user would also exhaust /api/extract.
 */

import type { NextRequest } from 'next/server'

export interface RateLimitConfig {
  /** Window duration in milliseconds. */
  windowMs: number
  /** Max number of requests allowed within the window. */
  max: number
}

export interface RateLimitEntry {
  count: number
  windowStart: number
}

export interface RateLimitResult {
  /** Whether the current request is allowed. */
  allowed: boolean
  /** Remaining requests in the current window (≥0). */
  remaining: number
  /** Epoch ms at which the current window resets. */
  resetAt: number
}

/**
 * Shared Map keyed by `identifier`. Periodically garbage-collected by
 * `cleanupExpired` (invoked every N calls) to avoid unbounded growth from
 * one-off IPs.
 */
const limits = new Map<string, RateLimitEntry>()

/** Tunable: every N `rateLimit` calls, sweep the map for expired entries. */
const CLEANUP_INTERVAL = 256
let callCount = 0

function cleanupExpired(now: number): void {
  // Sweep the map for buckets whose window has elapsed. We don't track the
  // max windowMs across all configs, so we use a conservative 1-hour
  // horizon — any entry idle for >1h is dead.
  const horizon = 60 * 60 * 1000
  for (const [key, entry] of limits) {
    if (now - entry.windowStart > horizon) {
      limits.delete(key)
    }
  }
}

/**
 * Check (and increment) the rate-limit bucket for `identifier`.
 *
 * - If the bucket doesn't exist OR its window has elapsed, a fresh bucket is
 *   created with `count = 1` and the request is allowed.
 * - If the bucket exists and `count < max`, `count` is incremented and the
 *   request is allowed.
 * - Otherwise the request is denied (count is NOT incremented again —
 *   the caller already saw `allowed: false` and will 429, so the bucket
 *   stays at its cap until the window resets).
 *
 * @param identifier  Unique key for the bucket. Should include route + IP.
 * @param config      Window + max for this route.
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now()

  // Lazy GC — cheap (O(n) over the map every 256 calls, n typically <1k).
  callCount++
  if (callCount % CLEANUP_INTERVAL === 0) {
    cleanupExpired(now)
  }

  const entry = limits.get(identifier)
  const resetAt = now + config.windowMs

  if (!entry || now - entry.windowStart > config.windowMs) {
    // Fresh window — first request in the bucket.
    limits.set(identifier, { count: 1, windowStart: now })
    return {
      allowed: true,
      remaining: Math.max(0, config.max - 1),
      resetAt,
    }
  }

  if (entry.count >= config.max) {
    // Window still active and bucket exhausted. Don't increment — let the
    // caller 429 without skewing the bucket further.
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + config.windowMs,
    }
  }

  entry.count += 1
  return {
    allowed: true,
    remaining: Math.max(0, config.max - entry.count),
    resetAt: entry.windowStart + config.windowMs,
  }
}

/**
 * Extract a best-effort client identifier (IP) from a Request.
 *
 * Order:
 *   1. `x-forwarded-for` — first IP in the comma-separated list (set by
 *      proxies like Caddy / nginx / Vercel).
 *   2. `x-real-ip` — single IP set by some proxies.
 *   3. Falls back to the literal string `'unknown'`, which means all
 *      unidentified clients share a single bucket. This is acceptable for
 *      abuse prevention (a single bad actor behind no proxy still gets
 *      capped), but NOT for per-user metering.
 *
 * NOTE: this is intentionally simple. IP spoofing via header manipulation is
 * only possible if the proxy in front trusts client-supplied headers —
 * Caddy / Vercel don't, so we're fine in this project's deploy topology.
 */
export function getIdentifier(req: Request | NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}

/**
 * Default per-route rate-limit configs. Import these so the rates stay
 * consistent and discoverable in one place.
 *
 *   - llm:   20/min — single-paper classify / extract / chat (LLM expensive)
 *   - batch:  5/min — batch classify / extract / demo seed/reset (very
 *                      expensive: hits LLM many times OR wipes the DB)
 *   - upload: 10/min — PDF upload (CPU + LLM per file, up to 10 files)
 *   - write: 30/min — general write routes
 *   - read:  100/min — general read routes
 */
export const RATE_LIMITS = {
  llm: { windowMs: 60_000, max: 20 },
  batch: { windowMs: 60_000, max: 5 },
  upload: { windowMs: 60_000, max: 10 },
  write: { windowMs: 60_000, max: 30 },
  read: { windowMs: 60_000, max: 100 },
} as const satisfies Record<string, RateLimitConfig>
