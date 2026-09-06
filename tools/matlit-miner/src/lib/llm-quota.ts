/**
 * LLM usage quota tracking — in-memory, per-identifier (user email or IP).
 *
 * Design:
 * - A `Map<string, QuotaEntry>` holds rolling-window usage counters.
 * - `DEFAULT_QUOTA` = 100 calls / 24 h. Per-identifier overrides via
 *   `setQuotaLimit`.
 * - `checkQuota(id)` is called BEFORE every LLM call; throws nothing but
 *   returns `{ allowed, remaining, resetAt, used }`.
 * - `recordUsage(id, calls, tokens)` is called AFTER every LLM call.
 * - A 7-day daily bucket history is kept for the dashboard sparkline.
 *
 * Persistence: NONE. The Map resets on server restart. This is acceptable
 * until P3-11 (auth) lands a DB-backed quota table.
 *
 * Concurrency: the Map is process-local. In Next.js dev (single process)
 * this is fine. In production with multiple workers, each worker has its
 * own Map — enforcement becomes per-worker. A Redis backend should replace
 * this when going multi-instance.
 */

export interface QuotaEntry {
  identifier: string
  calls: number
  tokensEstimate: number
  windowStart: number
  lastCall: number
  /** Per-identifier daily-limit override (undefined = use DEFAULT_QUOTA). */
  customLimit?: number
  /** Rolling 7-day buckets for the dashboard chart. Oldest first. */
  history: Array<{ date: string; calls: number; tokens: number }>
}

export interface QuotaConfig {
  dailyLimit: number
  windowMs: number
}

export const DEFAULT_QUOTA: QuotaConfig = {
  dailyLimit: 100,
  windowMs: 24 * 60 * 60 * 1000,
}

export interface QuotaCheckResult {
  allowed: boolean
  remaining: number
  resetAt: number
  used: number
  limit: number
}

export interface QuotaStatus {
  used: number
  limit: number
  remaining: number
  resetAt: number
  percentUsed: number
  tokensEstimate: number
  history: Array<{ date: string; calls: number; tokens: number }>
}

/**
 * Error thrown by `callLLM` when the identifier has exhausted its daily
 * quota. API routes should catch this and respond with HTTP 429:
 *
 *   try { await classifyAbstract(...) }
 *   catch (e) {
 *     if (e instanceof QuotaExceededError) {
 *       return NextResponse.json(
 *         { error: 'Daily LLM quota exceeded', resetAt: e.resetAt },
 *         { status: 429 },
 *       )
 *     }
 *     throw e
 *   }
 */
export class QuotaExceededError extends Error {
  readonly resetAt: number
  readonly identifier: string
  readonly limit: number
  readonly used: number

  constructor(identifier: string, resetAt: number, limit: number, used: number) {
    super(
      `Daily LLM quota exceeded for "${identifier}" (${used}/${limit}). Resets at ${new Date(resetAt).toISOString()}.`,
    )
    this.name = 'QuotaExceededError'
    this.resetAt = resetAt
    this.identifier = identifier
    this.limit = limit
    this.used = used
  }
}

export function isQuotaExceededError(e: unknown): e is QuotaExceededError {
  return e instanceof QuotaExceededError
}

// ─── internal store ────────────────────────────────────────────────────────

const _store = new Map<string, QuotaEntry>()

/** "today" bucket key in YYYY-MM-DD (UTC) for the history chart. */
function todayBucket(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** Trim history to last 7 days. */
function trimHistory(h: QuotaEntry['history']): QuotaEntry['history'] {
  const cutoff = todayBucket(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))
  return h.filter((b) => b.date >= cutoff)
}

function getOrCreate(identifier: string): QuotaEntry {
  let e = _store.get(identifier)
  if (!e) {
    const now = Date.now()
    e = {
      identifier,
      calls: 0,
      tokensEstimate: 0,
      windowStart: now,
      lastCall: now,
      history: [{ date: todayBucket(), calls: 0, tokens: 0 }],
    }
    _store.set(identifier, e)
  }
  return e
}

/** If the rolling window has expired, reset the counter (but keep history). */
function maybeResetWindow(e: QuotaEntry): void {
  const now = Date.now()
  if (now - e.windowStart >= DEFAULT_QUOTA.windowMs) {
    e.calls = 0
    e.tokensEstimate = 0
    e.windowStart = now
  }
}

function limitFor(e: QuotaEntry): number {
  return e.customLimit ?? DEFAULT_QUOTA.dailyLimit
}

// ─── public API ────────────────────────────────────────────────────────────

/**
 * Check whether `identifier` may make one more LLM call.
 * Does NOT mutate state — call `recordUsage` after the call succeeds.
 */
export function checkQuota(identifier: string): QuotaCheckResult {
  const e = getOrCreate(identifier)
  maybeResetWindow(e)
  const limit = limitFor(e)
  const used = e.calls
  const remaining = Math.max(0, limit - used)
  const allowed = used < limit
  const resetAt = e.windowStart + DEFAULT_QUOTA.windowMs
  return { allowed, remaining, resetAt, used, limit }
}

/**
 * Record a successful LLM call. `calls` is normally 1; `tokensEstimate` is a
 * rough char/4 estimate of total prompt + completion tokens.
 */
export function recordUsage(
  identifier: string,
  calls: number,
  tokensEstimate: number,
): void {
  const e = getOrCreate(identifier)
  maybeResetWindow(e)
  e.calls += calls
  e.tokensEstimate += tokensEstimate
  e.lastCall = Date.now()

  // update today's history bucket
  const today = todayBucket()
  let bucket = e.history.find((b) => b.date === today)
  if (!bucket) {
    bucket = { date: today, calls: 0, tokens: 0 }
    e.history.push(bucket)
    e.history = trimHistory(e.history)
  }
  bucket.calls += calls
  bucket.tokens += tokensEstimate
}

/**
 * Full status snapshot for the dashboard widget.
 */
export function getQuotaStatus(identifier: string): QuotaStatus {
  const e = getOrCreate(identifier)
  maybeResetWindow(e)
  const limit = limitFor(e)
  const used = e.calls
  const remaining = Math.max(0, limit - used)
  const resetAt = e.windowStart + DEFAULT_QUOTA.windowMs
  const percentUsed = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return {
    used,
    limit,
    remaining,
    resetAt,
    percentUsed,
    tokensEstimate: e.tokensEstimate,
    history: trimHistory(e.history),
  }
}

/**
 * Set a per-identifier daily-limit override (admin operation).
 * Pass `limit <= 0` to clear the override and fall back to DEFAULT_QUOTA.
 */
export function setQuotaLimit(identifier: string, limit: number): void {
  const e = getOrCreate(identifier)
  if (limit <= 0) {
    delete e.customLimit
  } else {
    e.customLimit = Math.floor(limit)
  }
}

/**
 * Reset an identifier's current-window counter (history is preserved).
 * Useful for testing / admin "give me more calls now" without changing the
 * configured limit.
 */
export function resetQuota(identifier: string): void {
  const e = getOrCreate(identifier)
  e.calls = 0
  e.tokensEstimate = 0
  e.windowStart = Date.now()
}

// ─── request helpers ───────────────────────────────────────────────────────

/**
 * Extract a stable identifier from request headers.
 *
 * Priority:
 *  1. `x-user-email` (set by auth middleware in future P3-11)
 *  2. first non-localhost `x-forwarded-for` IP
 *  3. `x-real-ip`
 *  4. fallback to `"default"` (dev / unknown)
 *
 * Localhost / private IPs collapse to `"default"` so the dev dashboard
 * shows the same counter that `callLLM` records under.
 */
export function getIdentifierFromHeaders(headers: Headers): string {
  const email = headers.get('x-user-email')
  if (email) return email.toLowerCase()

  const xff = headers.get('x-forwarded-for') || ''
  const firstIp = xff.split(',')[0]?.trim()
  if (firstIp && !isLocalhostIp(firstIp)) return firstIp

  const realIp = headers.get('x-real-ip') || ''
  if (realIp && !isLocalhostIp(realIp)) return realIp

  return 'default'
}

function isLocalhostIp(ip: string): boolean {
  return (
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip === 'localhost' ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.2') ||
    ip.startsWith('192.168.')
  )
}

/**
 * Format a "resets in Xh Ym" countdown for the UI.
 */
export function formatResetIn(resetAt: number, locale: 'en' | 'zh' = 'en'): string {
  const ms = Math.max(0, resetAt - Date.now())
  const totalMin = Math.ceil(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (locale === 'zh') {
    if (h > 0) return `${h}小时${m}分钟后重置`
    return `${m}分钟后重置`
  }
  if (h > 0) return `Resets in ${h}h ${m}m`
  return `Resets in ${m}m`
}

/**
 * Rough token estimate: ~4 chars per token for English/mixed text.
 * Used by `callLLM` when the SDK doesn't return usage stats.
 */
export function estimateTokens(
  messages: Array<{ content: string | unknown }>,
  completion = '',
): number {
  const promptChars = messages.reduce((s, m) => {
    const c = m.content
    return s + (typeof c === 'string' ? c.length : 0)
  }, 0)
  return Math.ceil(promptChars / 4) + Math.ceil(completion.length / 4)
}
