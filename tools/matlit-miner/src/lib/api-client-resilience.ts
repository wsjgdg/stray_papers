// Shared resilience utilities for outbound API clients.
//
// Used by:
//   - src/lib/crossref.ts           (CrossRef)
//   - src/lib/semantic-scholar.ts   (S2)
//   - src/lib/openalex.ts           (OpenAlex)
//
// Two layers, designed to compose:
//
//   1. CircuitBreaker — if an external service is consistently failing
//      (429 / 5xx / network), "open" the circuit so subsequent requests
//      fail fast instead of piling up against a degraded service. After
//      `resetTimeoutMs`, allow a single "half-open" probe; if it succeeds
//      the circuit closes.
//
//   2. fetchWithRetry — for individual requests, retry 429 / 5xx / network
//      errors with exponential backoff (honouring `Retry-After`). The
//      breaker wraps this: it decides whether a request is even allowed
//      to start.
//
// A breaker instance can be passed via `RetryOpts.breaker` so that the
// shared `fetchWithRetry` records success / failure on it automatically.
// All breakers register themselves in an in-process registry keyed by
// their `name`, which `getBreakerStatus(name)` reads for observability
// endpoints (e.g. /api/sources/status).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  /** Consecutive failures required to open the circuit. @default 10 */
  failureThreshold?: number
  /** How long (ms) the circuit stays open before allowing a half-open probe. @default 60000 */
  resetTimeoutMs?: number
  /** Max concurrent test requests allowed through while half-open. @default 1 */
  halfOpenMaxCalls?: number
  /** Logger name prefix used in state-transition logs. Also the registry key. @default 'circuit-breaker' */
  name?: string
}

export interface CircuitBreakerStatus {
  state: CircuitState
  consecutiveFailures: number
  lastFailureAt: number
}

/** Alias kept for the public spec — same shape as `CircuitBreakerStatus`. */
export type BreakerStatus = CircuitBreakerStatus

export interface RetryOpts {
  /** Breaker to consult before each attempt. If omitted, no circuit guard is applied (pure retry). */
  breaker?: CircuitBreaker
  /** Max retry attempts (not counting the initial try). @default 4 */
  maxRetries?: number
  /** Base delay for exponential backoff (ms). @default 1000 */
  baseDelayMs?: number
  /** Log prefix used in retry / breaker messages. @default 'fetch' */
  name?: string
}

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

/**
 * A small, dependency-free circuit breaker for guarding outbound calls to
 * external services.
 *
 * States:
 *  - 'closed'    : normal operation; every call goes through.
 *  - 'open'      : service is considered down; calls fail fast immediately.
 *                  After `resetTimeoutMs` elapses since the last failure, the
 *                  next `canExecute()` call transitions to 'half-open'.
 *  - 'half-open' : a single (configurable) probe call is allowed through. On
 *                  success the circuit closes; on failure it re-opens.
 *
 * Note: this class tracks in-flight probe calls for the half-open state. Callers
 * MUST invoke `recordSuccess()` or `recordFailure()` after `canExecute()`
 * returns true, otherwise the half-open slot leaks and the circuit can get
 * stuck in half-open until the process restarts.
 *
 * On construction the breaker registers itself in a module-level registry
 * keyed by `name`, so `getBreakerStatus(name)` can find it later without
 * the caller needing to keep a reference.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private consecutiveFailures = 0
  private lastFailureAt = 0
  private halfOpenInFlight = 0

  private readonly failureThreshold: number
  private readonly resetTimeoutMs: number
  private readonly halfOpenMaxCalls: number
  readonly name: string

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 10
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 60_000
    this.halfOpenMaxCalls = opts.halfOpenMaxCalls ?? 1
    this.name = opts.name ?? 'circuit-breaker'
    registerBreaker(this.name, this)
  }

  /**
   * Decide whether a request may proceed. Returns true if the caller should
   * attempt the request; in that case the caller MUST later call
   * `recordSuccess()` or `recordFailure()`.
   */
  canExecute(): boolean {
    if (this.state === 'closed') {
      return true
    }

    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureAt
      if (elapsed >= this.resetTimeoutMs) {
        // Cool-down elapsed — try a single probe.
        this.state = 'half-open'
        this.halfOpenInFlight = 0
        this.halfOpenInFlight += 1
        console.warn(`[${this.name}] Circuit HALF-OPEN — allowing test request.`)
        return true
      }
      return false
    }

    // half-open: only allow up to `halfOpenMaxCalls` probe(s).
    if (this.halfOpenInFlight < this.halfOpenMaxCalls) {
      this.halfOpenInFlight += 1
      return true
    }
    return false
  }

  /** Mark the last attempted call as successful — close the circuit. */
  recordSuccess(): void {
    const wasOpen = this.state !== 'closed'
    this.consecutiveFailures = 0
    this.halfOpenInFlight = 0
    this.state = 'closed'
    if (wasOpen) {
      console.log(`[${this.name}] Circuit CLOSED — service recovered.`)
    }
  }

  /** Mark the last attempted call as failed; possibly open the circuit. */
  recordFailure(): void {
    this.consecutiveFailures += 1
    this.lastFailureAt = Date.now()

    if (this.state === 'half-open') {
      // Probe failed — re-open immediately and wait another full cool-down.
      this.state = 'open'
      this.halfOpenInFlight = 0
      console.error(
        `[${this.name}] Circuit re-OPENED — half-open probe failed. Failing fast for ${Math.round(
          this.resetTimeoutMs / 1000,
        )}s.`,
      )
      return
    }

    if (this.state === 'closed' && this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'open'
      console.error(
        `[${this.name}] Circuit OPEN after ${this.consecutiveFailures} consecutive failures. Failing fast for ${Math.round(
          this.resetTimeoutMs / 1000,
        )}s.`,
      )
    }
  }

  /** Snapshot of breaker state — useful for observability / status indicators. */
  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureAt: this.lastFailureAt,
    }
  }
}

// ---------------------------------------------------------------------------
// Breaker registry — lets /api/sources/status look up breakers by name
// without callers having to thread instances around.
// ---------------------------------------------------------------------------

const breakerRegistry = new Map<string, CircuitBreaker>()

function registerBreaker(name: string, breaker: CircuitBreaker): void {
  const existing = breakerRegistry.get(name)
  if (existing && existing !== breaker) {
    // Same name registered twice — unusual but not fatal. Last one wins.
    console.warn(`[circuit-breaker] Overwriting existing breaker named "${name}".`)
  }
  breakerRegistry.set(name, breaker)
}

/**
 * Look up a breaker by name and return its status snapshot.
 * Returns a default "closed / 0 failures" status if no breaker with that
 * name has been registered yet (e.g. process just started, no calls made).
 */
export function getBreakerStatus(name: string): BreakerStatus {
  const breaker = breakerRegistry.get(name)
  if (!breaker) {
    return { state: 'closed', consecutiveFailures: 0, lastFailureAt: 0 }
  }
  return breaker.getStatus()
}

// ---------------------------------------------------------------------------
// fetchWithRetry — exponential backoff, optionally guarded by a breaker
// ---------------------------------------------------------------------------

function computeBackoffMs(attempt: number, retryAfterHeader: string | null, baseDelayMs: number): number {
  // Honour Retry-After (seconds) when present and numeric.
  if (retryAfterHeader) {
    const ra = parseInt(retryAfterHeader, 10)
    if (!Number.isNaN(ra) && ra >= 0) {
      return ra * 1000
    }
  }
  // Exponential backoff with full-jitter: base * 2^attempt + [0, 250)ms.
  return baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250)
}

/**
 * Fetch wrapper that:
 *  - Asks the circuit breaker for permission first (fails fast if open).
 *  - Retries 429 / 5xx / network errors with exponential backoff
 *    (honouring `Retry-After`).
 *  - Lets 4xx (non-429) pass through immediately — those are caller errors,
 *    not service degradation, and the server still responded (so we tell the
 *    breaker the service is healthy).
 *  - Records success/failure on the breaker so it can open / close / probe.
 *
 * Returns the raw Response. Callers are responsible for parsing the body and
 * for deciding whether a non-2xx status is fatal for their use case.
 *
 * Pass `opts.breaker` to engage circuit-breaker protection; omit it for a
 * pure retry wrapper (no breaker state changes).
 */
export async function fetchWithRetry(url: string, init?: RequestInit, opts?: RetryOpts): Promise<Response> {
  const breaker = opts?.breaker
  const maxRetries = opts?.maxRetries ?? 4
  const baseDelayMs = opts?.baseDelayMs ?? 1000
  const name = opts?.name ?? 'fetch'

  if (breaker && !breaker.canExecute()) {
    throw new Error(`${name} service unavailable (circuit open). Try again later.`)
  }

  const maxAttempts = maxRetries + 1 // initial try + retries
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, init)

      // 2xx — service is healthy.
      if (resp.ok) {
        breaker?.recordSuccess()
        return resp
      }

      // 4xx (non-429) — caller error, not a service-level failure. The
      // service responded, so the breaker sees this as "service up".
      // Don't retry.
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
        breaker?.recordSuccess()
        return resp
      }

      // 429 or 5xx — retryable service degradation.
      lastError = new Error(`${name} request failed: ${resp.status} ${resp.statusText}`)

      if (attempt < maxRetries) {
        const delay = computeBackoffMs(attempt, resp.headers.get('retry-after'), baseDelayMs)
        console.warn(
          `[${name}] ${resp.status} on attempt ${attempt + 1}/${maxAttempts}, retrying in ${delay}ms`,
        )
        await new Promise((r) => setTimeout(r, delay))
        continue
      }

      // Retries exhausted.
      break
    } catch (err) {
      // Network error (fetch threw). Retryable.
      lastError = err
      if (attempt < maxRetries) {
        const delay = computeBackoffMs(attempt, null, baseDelayMs)
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(
          `[${name}] network error on attempt ${attempt + 1}/${maxAttempts}: ${msg}, retrying in ${delay}ms`,
        )
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      break
    }
  }

  // All retries exhausted (or a non-retryable loop exit) — count against the
  // breaker and surface the last error.
  breaker?.recordFailure()
  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error(`${name} request failed after retries`)
}
