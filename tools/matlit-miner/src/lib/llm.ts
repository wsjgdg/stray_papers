// LLM service using z-ai-web-dev-sdk for paper classification & data extraction
// Supports custom OpenAI-compatible API backends (OpenAI, Ollama, LM Studio, etc.)
import ZAI from 'z-ai-web-dev-sdk'
import {
  checkQuota,
  recordUsage,
  estimateTokens,
  QuotaExceededError,
  getIdentifierFromHeaders,
} from './llm-quota'

/**
 * Per-request LLM quota identifier.
 *
 * Defaults to `"default"` (aggregates all anonymous calls). API routes
 * that want per-user / per-IP quota tracking should call
 * `setLLMIdentifier(getIdentifierFromHeaders(req.headers))` at the start
 * of their handler and `clearLLMIdentifier()` in a `finally` block.
 *
 * NOTE: this is module-level state, so in a single-process dev server it
 * is shared across concurrent requests. For true per-request isolation
 * use AsyncLocalStorage — out of scope until P3-11 auth lands.
 */
let _currentIdentifier: string | null = null

export function setLLMIdentifier(id: string): void {
  _currentIdentifier = id
}

export function clearLLMIdentifier(): void {
  _currentIdentifier = null
}

export function getLLMIdentifier(): string {
  return _currentIdentifier ?? 'default'
}

/** Re-export so routes can `import { getIdentifierFromHeaders } from '@/lib/llm'`. */
export { getIdentifierFromHeaders, QuotaExceededError }

export interface LLMConfig {
  provider: 'zai' | 'openai'
  baseURL?: string
  apiKey?: string
  model?: string
}

/**
 * A single entry in the multi-config failover list (P3).
 *
 * API routes read `x-llm-configs` (a JSON array of these entries from P1's
 * api-client) and pass them to `callLLMWithFailover`, which tries them in
 * `priority` order (lower number = higher priority). Entries with
 * `enabled: false` are skipped. The `id` is used only for failover logging
 * (so you can see "config A failed, trying config B").
 *
 * For `provider: 'zai'`, `baseURL`/`apiKey`/`model` are unused (the SDK
 * reads its credentials from env). For `provider: 'openai'`, `baseURL`
 * and `apiKey` are required at call time.
 */
export interface LLMConfigEntry extends LLMConfig {
  id: string
  enabled: boolean
  priority: number
}

/**
 * Options for `callLLMWithFailover`. All fields optional with sensible
 * defaults; passing an explicit value overrides per-call.
 */
export interface FailoverOptions {
  /** Per-config retries (default 3). Each config gets up to `retries+1` attempts. */
  retries?: number
  /** Per-attempt timeout in ms (default `LLM_TIMEOUT_MS` = 60 s, clamped to `LLM_TIMEOUT_MAX_MS`). */
  timeoutMs?: number
  /**
   * Global cap across all configs × retries (default 10). Prevents infinite
   * loops when many configs × many retries would otherwise spin forever.
   * Once hit, `callLLMWithFailover` stops trying further configs/attempts
   * and throws the last error.
   */
  maxTotalAttempts?: number
  /** Exponential backoff base delay in ms (default 1000). */
  backoffBaseMs?: number
  /** Max delay between retries in ms (default 30_000 — don't wait > 30 s). */
  backoffMaxMs?: number
  /** Random jitter range in ms added to each backoff (default 500). */
  backoffJitterMs?: number
  /**
   * Exponential base (default 2). Use 1.5 for gentler backoff, 3 for more
   * aggressive escalation. `base * expBase^attempt`.
   */
  backoffExponentialBase?: number
}

// ─── Failover / backoff defaults ──────────────────────────────────────────
const DEFAULT_BACKOFF_BASE_MS = 1_000
const DEFAULT_BACKOFF_MAX_MS = 30_000
const DEFAULT_BACKOFF_JITTER_MS = 500
const DEFAULT_BACKOFF_EXP_BASE = 2
const DEFAULT_MAX_TOTAL_ATTEMPTS = 10
const DEFAULT_RETRIES = 3

export interface ClassificationResult {
  synthesized: 'yes' | 'no' | 'uncertain'
  hasBandgap: boolean
  hasMethod: boolean
  hasEfficiency: boolean
  hasPhaseDiagram: boolean
  evidence: string
  confidence: number
}

export interface ExtractionResult {
  bandgapValue: string
  synthesisMethod: string
  conditions: string
  phaseDiagramInfo: string
  efficiencyValue: string
  evidence: string
  confidence: number
}

// ─── Unified LLM call timeout ─────────────────────────────────────────────
//
// Every LLM call (classify / extract / review / draft / chat / discover) is
// bounded by a per-attempt timeout so a slow provider can never hang the
// request indefinitely. Each retry attempt gets a FRESH timer, so the
// worst-case wall-clock time for a call is `retries * timeoutMs` (180 s by
// default). Callers that want a different budget can pass `timeoutMs` to
// `callLLM` or any of the high-level wrappers (e.g. chat → 30 s, extract →
// 120 s). The value is clamped to `LLM_TIMEOUT_MAX_MS` to prevent abuse.

/** Default per-attempt LLM call timeout (60 s). Exported for callers. */
export const LLM_TIMEOUT_MS = 60_000
/** Hard cap on `timeoutMs` (180 s). Longer values are clamped to this. */
export const LLM_TIMEOUT_MAX_MS = 180_000

/**
 * Error thrown when an LLM call exceeds its per-attempt timeout.
 *
 * API routes should catch this via `isLLMTimeoutError(e)` and return HTTP
 * 504 Gateway Timeout (NOT 500) so clients can distinguish "the provider
 * hung" from "the request was malformed" and retry appropriately.
 */
export class LLMTimeoutError extends Error {
  readonly timeoutMs: number
  constructor(timeoutMs: number) {
    super(`LLM call timed out after ${(timeoutMs / 1000).toFixed(0)}s`)
    this.name = 'LLMTimeoutError'
    this.timeoutMs = timeoutMs
    // Restore prototype chain so `instanceof` works after transpilation.
    Object.setPrototypeOf(this, LLMTimeoutError.prototype)
  }
}

/** Type guard for `LLMTimeoutError`. */
export function isLLMTimeoutError(e: unknown): e is LLMTimeoutError {
  return e instanceof LLMTimeoutError
}

/**
 * Detect an `AbortController`-triggered AbortError coming from `fetch` or
 * the SDK. Cross-runtime safe: checks both `name === 'AbortError'` and a
 * message regex (Bun/Node sometimes wrap the original).
 */
function isAbortError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  if (e.name === 'AbortError') return true
  return /\baborted\b/i.test(e.message)
}

/** Clamp a caller-supplied timeout to the [1 s, LLM_TIMEOUT_MAX_MS] range. */
function clampTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return LLM_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) return LLM_TIMEOUT_MS
  return Math.min(timeoutMs, LLM_TIMEOUT_MAX_MS)
}

/**
 * Race an arbitrary promise against a timeout.
 *
 * - Resolves/rejects with the original promise's outcome if it settles first.
 * - Rejects with `LLMTimeoutError` if the timer fires first.
 * - The timer is always cleared on settlement so it doesn't leak.
 *
 * Used for the `z-ai-web-dev-sdk` path because the SDK's
 * `chat.completions.create` does NOT accept an `AbortSignal` (its signature
 * is `(body: CreateChatCompletionBody) => Promise<any>` with no signal
 * option). A timed-out SDK call will still complete in the background — we
 * can't cancel it — but we stop awaiting it and move on to the next retry.
 */
export function raceWithTimeout<T>(
  p: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new LLMTimeoutError(timeoutMs))
    }, timeoutMs)
    p.then(
      (v) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZai() {
  if (!_zai) {
    _zai = await ZAI.create()
  }
  return _zai
}

// Current LLM config (can be overridden via API request headers)
let _llmConfig: LLMConfig = { provider: 'zai' }

export function setLLMConfig(config: LLMConfig) {
  _llmConfig = config
}

export function getLLMConfig(): LLMConfig {
  return _llmConfig
}

type ChatRole = 'system' | 'user' | 'assistant'
type ChatMessageLike = Array<{ role: ChatRole; content: string }>

// ─── Single-shot LLM calls (no retry) ─────────────────────────────────────
//
// `callZaiOnce` and `callOpenAIOnce` perform ONE LLM call with a per-call
// timeout. The retry loop + exponential backoff + multi-config failover
// logic lives in `callLLMWithFailover`, which calls these single-shot
// helpers. Splitting them out keeps the retry code in one place and makes
// the per-attempt timeout semantics explicit (each attempt = one fresh
// timer, so worst case = attempts × timeoutMs).

/** One-shot call to z-ai-web-dev-sdk with per-call timeout (no retry). */
async function callZaiOnce(
  messages: ChatMessageLike,
  timeoutMs: number,
): Promise<string> {
  const zai = await getZai()
  // The SDK's `chat.completions.create` does NOT accept an AbortSignal, so
  // we race the call against a timeout promise. A timed-out call still
  // completes in the background (we can't cancel it) — we just stop
  // awaiting it and let the retry loop decide what to do next.
  const completion = await raceWithTimeout(
    zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    }),
    timeoutMs,
  )
  return completion.choices[0]?.message?.content || ''
}

/**
 * One-shot call to an OpenAI-compatible endpoint (OpenAI, Ollama, LM
 * Studio, etc.) with per-call timeout via fetch's `signal` option (no retry).
 *
 * When the response carries a `Retry-After` header (typical for 429s), the
 * value (in seconds) is attached to the thrown error as `retryAfterSec`
 * so the retry loop can honor it instead of using exponential backoff.
 */
async function callOpenAIOnce(
  messages: ChatMessageLike,
  config: LLMConfig,
  timeoutMs: number,
): Promise<string> {
  const url = `${config.baseURL}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'system' : m.role,
          content: m.content,
        })),
        temperature: 0,
      }),
      signal: controller.signal,
    })
    if (!resp.ok) {
      const errText = await resp.text()
      const retryAfterSec = parseRetryAfter(resp)
      const err = new Error(
        `OpenAI API error ${resp.status}: ${errText.slice(0, 200)}`,
      ) as Error & { retryAfterSec: number | null }
      err.retryAfterSec = retryAfterSec
      throw err
    }
    const data = await resp.json()
    return data.choices?.[0]?.message?.content || ''
  } finally {
    clearTimeout(timer)
  }
}

// ─── Backoff / retry helpers ──────────────────────────────────────────────

/** Detect transient errors that warrant a retry (timeouts, 429s, network). */
function isTransientError(e: unknown): boolean {
  if (e instanceof LLMTimeoutError) return true
  if (isAbortError(e)) return true
  const msg = (e as Error)?.message || ''
  return (
    msg.includes('429') ||
    msg.includes('Too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('fetch failed') ||
    msg.includes('network')
  )
}

/**
 * Parse a `Retry-After` response header to seconds. Supports both the
 * delta-seconds form (`Retry-After: 30`) and the HTTP-date form
 * (`Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`). Returns null when the
 * header is absent or unparseable.
 */
function parseRetryAfter(resp: Response): number | null {
  const val = resp.headers.get('retry-after')
  if (!val) return null
  const n = parseInt(val, 10)
  if (Number.isFinite(n) && n > 0) return n
  // HTTP-date form.
  const t = Date.parse(val)
  if (Number.isFinite(t)) {
    const diff = (t - Date.now()) / 1000
    return diff > 0 ? diff : null
  }
  return null
}

/**
 * Extract a `Retry-After` value (in seconds) from a thrown error. Currently
 * only `callOpenAIOnce` attaches `retryAfterSec` to its errors (because the
 * z-ai SDK does not expose the underlying response); for the z-ai path this
 * returns null and the retry loop falls back to exponential backoff.
 */
function extractRetryAfter(e: unknown): number | null {
  if (e && typeof e === 'object' && 'retryAfterSec' in e) {
    const v = (e as { retryAfterSec: unknown }).retryAfterSec
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  }
  return null
}

/**
 * Compute exponential backoff delay: `base * expBase^attempt`, capped at
 * `maxMs`, plus uniform random jitter in `[0, jitterMs)`.
 */
function computeBackoff(
  attempt: number,
  baseMs: number,
  maxMs: number,
  jitterMs: number,
  expBase: number,
): number {
  const raw = baseMs * Math.pow(expBase, attempt)
  const capped = Math.min(raw, maxMs)
  const jitter = Math.random() * jitterMs
  return capped + jitter
}

/**
 * Compute the wait time before the next retry attempt. Honors a
 * `Retry-After` value (in seconds) when present (typically from a 429);
 * the header value takes precedence over the computed exponential backoff
 * but is still capped at `maxMs` so a misbehaving server can't make us
 * wait indefinitely.
 */
function computeWait(
  attempt: number,
  retryAfterSec: number | null,
  opts: { baseMs: number; maxMs: number; jitterMs: number; expBase: number },
): number {
  if (retryAfterSec !== null && Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1000, opts.maxMs)
  }
  return computeBackoff(attempt, opts.baseMs, opts.maxMs, opts.jitterMs, opts.expBase)
}

/** Human-readable label for a config (used in failover log messages). */
function configLabel(config: LLMConfigEntry | LLMConfig): string {
  if ('id' in config && config.id) return config.id
  if (config.provider === 'openai' && config.baseURL) {
    try {
      const u = new URL(config.baseURL)
      return `openai:${u.host}`
    } catch {
      return 'openai'
    }
  }
  return config.provider
}

// ─── Multi-config failover entry point ────────────────────────────────────

/**
 * Call the LLM with multi-config failover + exponential backoff.
 *
 * Behaviour:
 *  1. Try `configs` in priority order (lower number = higher priority).
 *     Entries with `enabled: false` are skipped.
 *  2. For each config, retry up to `retries` times with exponential backoff
 *     (configurable base, cap, jitter, and exponential base).
 *  3. On a 429 with a `Retry-After` header (OpenAI path), honor the header
 *     value (capped at `backoffMaxMs`) instead of exponential backoff.
 *  4. If all retries for a config fail, move to the next config and log
 *     `[llm] Failover: config "X" failed, trying "Y"` (warn level).
 *  5. `maxTotalAttempts` is a global cap across all configs × retries to
 *     prevent infinite loops. Default 10. Once hit, stops entirely and
 *     throws the last error.
 *  6. If all configs are exhausted, throws the last error — or an
 *     `LLMTimeoutError` if the last error was a timeout (callers should
 *     catch via `isLLMTimeoutError(e)` and return HTTP 504).
 *
 * Quota: checks the current identifier's daily quota BEFORE the call and
 * records usage AFTER (only on success). Throws `QuotaExceededError`
 * (re-exported) when the limit is hit — API routes should catch this and
 * return HTTP 429.
 */
export async function callLLMWithFailover(
  messages: ChatMessageLike,
  configs: LLMConfigEntry[],
  options: FailoverOptions = {},
): Promise<string> {
  // ── quota check (before) ──────────────────────────────────────────────
  const identifier = getLLMIdentifier()
  const q = checkQuota(identifier)
  if (!q.allowed) {
    throw new QuotaExceededError(identifier, q.resetAt, q.limit, q.used)
  }

  const retries = options.retries ?? DEFAULT_RETRIES
  const effectiveTimeout = clampTimeout(options.timeoutMs)
  const maxTotalAttempts =
    options.maxTotalAttempts ?? DEFAULT_MAX_TOTAL_ATTEMPTS
  const backoff = {
    baseMs: options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS,
    maxMs: options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS,
    jitterMs: options.backoffJitterMs ?? DEFAULT_BACKOFF_JITTER_MS,
    expBase: options.backoffExponentialBase ?? DEFAULT_BACKOFF_EXP_BASE,
  }

  // Filter to enabled configs only, sort by priority ascending (lower = higher prio).
  // `.slice()` before sort to avoid mutating the caller's array.
  const enabled = configs
    .filter((c) => c.enabled !== false)
    .slice()
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

  if (enabled.length === 0) {
    throw new Error('callLLMWithFailover: no enabled configs provided')
  }

  let attemptsUsed = 0
  let lastErr: unknown = null
  let lastErrWasTimeout = false

  configLoop: for (let ci = 0; ci < enabled.length; ci++) {
    const config = enabled[ci]
    const label = configLabel(config)
    const isLast = ci === enabled.length - 1

    for (let attempt = 0; attempt <= retries; attempt++) {
      // ── global cap check ─────────────────────────────────────────────
      // Stop entirely (break out of both loops) once we've hit the global
      // attempt cap — no point starting a fresh config if we can't even
      // make one more call.
      if (attemptsUsed >= maxTotalAttempts) {
        break configLoop
      }
      attemptsUsed++

      try {
        // Dispatch to the right single-shot helper based on provider. If
        // provider is 'openai' but baseURL/apiKey are missing, fall through
        // to the z-ai path (mirrors the legacy callLLM behaviour and avoids
        // a confusing fetch error). Production callers should validate
        // their configs before passing them in.
        const content =
          config.provider === 'openai' && config.baseURL && config.apiKey
            ? await callOpenAIOnce(messages, config, effectiveTimeout)
            : await callZaiOnce(messages, effectiveTimeout)
        // ── quota record (after, only on success) ─────────────────────
        recordUsage(identifier, 1, estimateTokens(messages, content))
        return content
      } catch (e) {
        lastErr = e
        lastErrWasTimeout = isAbortError(e) || e instanceof LLMTimeoutError
        const transient = isTransientError(e)
        // Break this config's retry loop if any of:
        //   - the error is non-transient (no point retrying a 400 / auth error)
        //   - this was the final attempt for this config
        //   - the global cap is about to be hit (next iteration would break
        //     out of configLoop anyway, so don't sleep for nothing)
        if (
          !transient ||
          attempt === retries ||
          attemptsUsed >= maxTotalAttempts
        ) {
          break
        }
        const retryAfterSec = extractRetryAfter(e)
        const wait = computeWait(attempt, retryAfterSec, backoff)
        await new Promise((r) => setTimeout(r, wait))
      }
    }

    // Config exhausted — log failover if there's a next config to try.
    if (!isLast) {
      const nextLabel = configLabel(enabled[ci + 1])
      console.warn(
        `[llm] Failover: config "${label}" failed, trying "${nextLabel}"`,
      )
    }
  }

  if (lastErrWasTimeout) {
    // Surface a clean timeout error so API routes can return 504 instead
    // of a generic 500.
    throw new LLMTimeoutError(effectiveTimeout)
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('LLM call failed (all configs exhausted)')
}

/**
 * Read multi-config failover list from request headers.
 *
 * Priority:
 *  1. `x-llm-configs` header (JSON array of `LLMConfigEntry` from P1's
 *     api-client). Each entry needs at minimum `{ id, provider }`;
 *     `enabled` defaults to `true` and `priority` defaults to `0` when
 *     absent. Malformed JSON is silently ignored (falls through to legacy).
 *  2. Legacy single-config headers (`x-llm-provider`, `x-llm-baseurl`,
 *     `x-llm-apikey`, `x-llm-model`) — wrapped into a single-entry list
 *     so the existing api-client (which still sends these) keeps working
 *     until P1 ships the new multi-config UI.
 *  3. Default Z.ai:
 *     `[{ id: 'default', provider: 'zai', enabled: true, priority: 0 }]`.
 */
export function getLLMConfigsFromHeaders(headers: Headers): LLMConfigEntry[] {
  // ── 1. New multi-config header ────────────────────────────────────────
  const raw = headers.get('x-llm-configs')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const configs: LLMConfigEntry[] = []
        for (const entry of parsed) {
          if (!entry || typeof entry !== 'object') continue
          const e = entry as Record<string, unknown>
          const provider = e.provider === 'openai' ? 'openai' : 'zai'
          const id =
            typeof e.id === 'string' && e.id
              ? e.id
              : provider === 'openai'
                ? `openai:${typeof e.baseURL === 'string' ? e.baseURL : ''}`
                : 'zai'
          configs.push({
            id,
            provider,
            baseURL: typeof e.baseURL === 'string' ? e.baseURL : undefined,
            apiKey: typeof e.apiKey === 'string' ? e.apiKey : undefined,
            model: typeof e.model === 'string' ? e.model : undefined,
            enabled: e.enabled !== false,
            priority: typeof e.priority === 'number' ? e.priority : 0,
          })
        }
        if (configs.length > 0) return configs
      }
    } catch {
      // Malformed JSON — fall through to legacy / default paths.
    }
  }

  // ── 2. Legacy single-config headers (backward compat with P0 api-client) ──
  const legacyProvider = headers.get('x-llm-provider')
  if (legacyProvider === 'openai') {
    return [
      {
        id: 'legacy-openai',
        provider: 'openai',
        baseURL: headers.get('x-llm-baseurl') || undefined,
        apiKey: headers.get('x-llm-apikey') || undefined,
        model: headers.get('x-llm-model') || undefined,
        enabled: true,
        priority: 0,
      },
    ]
  }
  if (legacyProvider === 'zai') {
    return [{ id: 'legacy-zai', provider: 'zai', enabled: true, priority: 0 }]
  }

  // ── 3. Default Z.ai ──────────────────────────────────────────────────
  return [{ id: 'default', provider: 'zai', enabled: true, priority: 0 }]
}

// ─── Backward-compat single-config entry point ────────────────────────────
//
// `callLLM` (the original single-config API) is kept as a thin wrapper
// around `callLLMWithFailover` so the many existing routes that still call
// it via `setLLMConfig({...}) + callLLM(messages, retries, timeoutMs)`
// continue to work unchanged. New routes should call `callLLMWithFailover`
// directly with configs from `getLLMConfigsFromHeaders`.

/**
 * Call the LLM with simple retry + exponential backoff for 429 / transient errors.
 * Uses the current global config set via `setLLMConfig()`.
 *
 * Quota: checks the current identifier's daily quota BEFORE the call and
 * records usage AFTER. Throws `QuotaExceededError` (re-exported) when the
 * limit is hit — API routes should catch this and return HTTP 429.
 *
 * Timeout: each ATTEMPT is bounded by `timeoutMs` (default `LLM_TIMEOUT_MS`
 * = 60 s, clamped to `LLM_TIMEOUT_MAX_MS` = 180 s). A timed-out attempt is
 * treated as transient and retried (subject to `retries`). If every attempt
 * times out, an `LLMTimeoutError` is thrown — callers should catch it via
 * `isLLMTimeoutError(e)` and return HTTP 504 Gateway Timeout (NOT 500).
 *
 * Optional `configs` param: when provided, uses `callLLMWithFailover`
 * directly with the given configs (ignoring the global `_llmConfig`). When
 * omitted, wraps the global `_llmConfig` into a single-entry list — this
 * preserves backward compat for the many routes that still call
 * `setLLMConfig(...)` + `callLLM(...)`.
 */
async function callLLM(
  messages: ChatMessageLike,
  retries = 3,
  timeoutMs: number = LLM_TIMEOUT_MS,
  configs?: LLMConfigEntry[],
): Promise<string> {
  const effectiveConfigs =
    configs ??
    [
      {
        id: 'default',
        provider: _llmConfig.provider,
        baseURL: _llmConfig.baseURL,
        apiKey: _llmConfig.apiKey,
        model: _llmConfig.model,
        enabled: true,
        priority: 0,
      },
    ]
  return callLLMWithFailover(messages, effectiveConfigs, { retries, timeoutMs })
}

function stripJsonFence(text: string): string {
  let t = text.trim()
  // remove ```json ... ``` fences
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  }
  // find first { and last }
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1)
  }
  return t
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stripJsonFence(text))
  } catch {
    return null
  }
}

/**
 * Classify an abstract: does it report synthesis of `materialName`,
 * and does it mention bandgap / synthesis method / efficiency / phase diagram?
 *
 * `timeoutMs` (optional) overrides the default per-attempt LLM timeout.
 */
export async function classifyAbstract(
  abstract: string,
  materialName: string,
  timeoutMs?: number,
  configs?: LLMConfigEntry[],
): Promise<ClassificationResult> {
  const prompt = `你是一名材料科学文献分析助手。请阅读以下论文摘要，判断该论文是否明确报道了材料 ${materialName} 的合成（实验合成，非纯理论预测）。同时判断摘要中是否提到了实验带隙值、合成方法、太阳能电池效率、相图信息。

摘要：
${abstract || '(无摘要)'}

请仅输出 JSON 格式，包含字段：
- synthesized: "yes" 或 "no" 或 "uncertain"
- hasBandgap: true 或 false
- hasMethod: true 或 false
- hasEfficiency: true 或 false
- hasPhaseDiagram: true 或 false
- evidence: 摘要中支持你判断的原文句子（中文/英文均可，<= 200 字符）
- confidence: 0-1 之间的浮点数

只输出 JSON，不要输出其他文字。`

  const content = await callLLM(
    [
      { role: 'assistant', content: 'You are a precise materials-science literature analysis assistant. Always output strict JSON only.' },
      { role: 'user', content: prompt },
    ],
    3,
    timeoutMs,
    configs,
  )

  const parsed = safeParse(content)

  const toBool = (v: unknown) => v === true || v === 'true' || v === 'True' || v === 1
  const toStr = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''))

  return {
    synthesized: (parsed?.synthesized as ClassificationResult['synthesized']) || 'uncertain',
    hasBandgap: toBool(parsed?.hasBandgap),
    hasMethod: toBool(parsed?.hasMethod),
    hasEfficiency: toBool(parsed?.hasEfficiency),
    hasPhaseDiagram: toBool(parsed?.hasPhaseDiagram),
    evidence: toStr(parsed?.evidence).slice(0, 500),
    confidence: typeof parsed?.confidence === 'number' ? parsed.confidence : 0.5,
  }
}

/**
 * Extract detailed data from an abstract (or short text snippet).
 *
 * `timeoutMs` (optional) overrides the default per-attempt LLM timeout.
 */
export async function extractData(
  text: string,
  materialName: string,
  timeoutMs?: number,
  configs?: LLMConfigEntry[],
): Promise<ExtractionResult> {
  const prompt = `以下是一篇关于材料 ${materialName} 的论文摘要/文本片段。请从中提取以下信息：

1. 实验带隙值（单位 eV，若无则填 null）
2. 合成方法（如固相反应、溶液旋涂、化学气相沉积、热蒸发等）
3. 关键合成条件（温度、时间、气氛、溶剂等）
4. 相图信息（如有，请描述相图主要内容或指出图号）
5. 太阳能电池效率（% ，若无则填 null）

请以 JSON 格式输出，每个字段若未找到则填空字符串 ""。同时附上原文中对应的句子作为证据（evidence 字段）。

字段：
- bandgapValue
- synthesisMethod
- conditions
- phaseDiagramInfo
- efficiencyValue
- evidence
- confidence

文本：
${text || '(无文本)'}

只输出 JSON，不要其他文字。`

  const content = await callLLM(
    [
      { role: 'assistant', content: 'You are a precise materials-science data extraction assistant. Always output strict JSON only.' },
      { role: 'user', content: prompt },
    ],
    3,
    timeoutMs,
    configs,
  )

  const parsed = safeParse(content)
  const toStr = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v))

  return {
    bandgapValue: toStr(parsed?.bandgapValue),
    synthesisMethod: toStr(parsed?.synthesisMethod),
    conditions: toStr(parsed?.conditions),
    phaseDiagramInfo: toStr(parsed?.phaseDiagramInfo),
    efficiencyValue: toStr(parsed?.efficiencyValue),
    evidence: toStr(parsed?.evidence).slice(0, 1000),
    confidence: typeof parsed?.confidence === 'number' ? parsed.confidence : 0.5,
  }
}

/**
 * Translate a non-English paper's title + abstract into English using the LLM.
 * Returns { title, abstract } in English.
 * Used by the multilingual paper support feature (#18).
 *
 * `timeoutMs` (optional) overrides the default per-attempt LLM timeout.
 */
export async function translatePaperText(
  title: string,
  abstract: string,
  fromLang: string,
  timeoutMs?: number,
  configs?: LLMConfigEntry[],
): Promise<{ title: string; abstract: string }> {
  const langName: Record<string, string> = {
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    ru: 'Russian',
    ar: 'Arabic',
    de: 'German',
    fr: 'French',
    es: 'Spanish',
  }
  const from = langName[fromLang] || fromLang

  const prompt = `Translate the following academic paper title and abstract from ${from} to English. Return JSON: { "title": "...", "abstract": "..." }. Only JSON, no commentary.

Title: ${title || '(empty)'}
Abstract: ${abstract || '(empty)'}`

  const content = await callLLM(
    [
      { role: 'assistant', content: 'You are a precise academic translator. Always output strict JSON only.' },
      { role: 'user', content: prompt },
    ],
    3,
    timeoutMs,
    configs,
  )

  const parsed = safeParse(content)
  const toStr = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v))
  return {
    title: toStr(parsed?.title).slice(0, 1000),
    abstract: toStr(parsed?.abstract).slice(0, 8000),
  }
}

/**
 * Batch-classify an array of abstracts with simple concurrency limit.
 */
export async function batchClassify(
  items: Array<{ id: string; abstract: string; material: string }>,
  concurrency = 3,
  onProgress?: (done: number, total: number) => void,
  configs?: LLMConfigEntry[],
): Promise<Array<{ id: string; result: ClassificationResult }>> {
  const results: Array<{ id: string; result: ClassificationResult }> = []
  let index = 0
  let done = 0
  const total = items.length

  async function worker() {
    while (index < items.length) {
      const current = index++
      const item = items[current]
      try {
        const result = await classifyAbstract(item.abstract, item.material, undefined, configs)
        results.push({ id: item.id, result })
      } catch (e) {
        results.push({
          id: item.id,
          result: {
            synthesized: 'uncertain',
            hasBandgap: false,
            hasMethod: false,
            hasEfficiency: false,
            hasPhaseDiagram: false,
            evidence: `ERROR: ${(e as Error).message}`,
            confidence: 0,
          },
        })
      }
      done++
      onProgress?.(done, total)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

/**
 * Batch-extract data.
 */
export async function batchExtract(
  items: Array<{ id: string; text: string; material: string }>,
  concurrency = 2,
  onProgress?: (done: number, total: number) => void,
  configs?: LLMConfigEntry[],
): Promise<Array<{ id: string; result: ExtractionResult }>> {
  const results: Array<{ id: string; result: ExtractionResult }> = []
  let index = 0
  let done = 0
  const total = items.length

  async function worker() {
    while (index < items.length) {
      const current = index++
      const item = items[current]
      try {
        const result = await extractData(item.text, item.material, undefined, configs)
        results.push({ id: item.id, result })
      } catch (e) {
        results.push({
          id: item.id,
          result: {
            bandgapValue: '',
            synthesisMethod: '',
            conditions: '',
            phaseDiagramInfo: '',
            efficiencyValue: '',
            evidence: `ERROR: ${(e as Error).message}`,
            confidence: 0,
          },
        })
      }
      done++
      onProgress?.(done, total)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}
