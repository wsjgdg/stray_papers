// LLM service for paper classification & data extraction.
// Uses a configurable OpenAI-compatible backend (OpenAI, Ollama, LM Studio, etc.).
// The backend is configured per-request (via x-llm-configs headers) or falls
// back to the server env vars OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL,
// then to the persisted user config file (Settings → /api/user/config), and
// finally to a built-in default.
import { readFileSync } from 'fs'
import path from 'path'
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
  provider: 'openai'
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
 * For `provider: 'openai'`, `baseURL` and `apiKey` are required at call time
 * (or fall back to the server env vars). `model` selects the chat/Vision model.
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
 * Generic helper: races any promise against a timeout so slow providers
 * (or any call that does not honor an `AbortSignal`) cannot hang the request
 * indefinitely.
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

/** Default OpenAI-compatible base URL (mirrors config-store DEFAULT_OPENAI_BASE_URL). */
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

/**
 * Server-side default LLM config resolution order (first match wins):
 *   1. OPENAI_* environment variables,
 *   2. persisted user config file (`data/user-config.json`, written by the
 *      Settings dialog via /api/user/config),
 *   3. built-in default (api.openai.com, gpt-4o-mini).
 *
 * Used when a request does not supply its own `x-llm-configs` / legacy
 * headers, so the backend works without the browser localStorage config
 * (and survives restarts / is shared across clients).
 */
const USER_CONFIG_FILE = path.join(process.cwd(), 'data', 'user-config.json')

function readUserConfigSync(): Record<string, Record<string, unknown>> {
  try {
    const raw = readFileSync(USER_CONFIG_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, Record<string, unknown>>
    }
  } catch {
    /* missing or invalid — treat as empty */
  }
  return {}
}

function serverDefaultConfig(): LLMConfig {
  const envBase = process.env.OPENAI_BASE_URL || ''
  const envKey = process.env.OPENAI_API_KEY || ''
  const envModel = process.env.OPENAI_MODEL || ''
  // Fast path: env vars present → use them directly (no file IO).
  if (envBase || envKey) {
    return {
      provider: 'openai',
      baseURL: envBase || DEFAULT_OPENAI_BASE_URL,
      apiKey: envKey,
      model: envModel || 'gpt-4o-mini',
    }
  }
  // Fall back to the persisted user config (Settings → /api/user/config).
  // Prefer a named-user entry over the anonymous one, but accept either.
  const store = readUserConfigSync()
  const named = Object.entries(store).find(([k]) => k !== '_anonymous')?.[1]
  const entry = (named ?? store['_anonymous']) as Record<string, unknown> | undefined
  if (entry) {
    const uBase = typeof entry.llmBaseURL === 'string' ? entry.llmBaseURL : ''
    const uKey = typeof entry.llmApiKey === 'string' ? entry.llmApiKey : ''
    const uModel = typeof entry.llmModel === 'string' ? entry.llmModel : ''
    if (uBase || uKey) {
      return {
        provider: 'openai',
        baseURL: uBase || DEFAULT_OPENAI_BASE_URL,
        apiKey: uKey,
        model: uModel || 'gpt-4o-mini',
      }
    }
  }
  // Built-in default.
  return {
    provider: 'openai',
    baseURL: DEFAULT_OPENAI_BASE_URL,
    apiKey: '',
    model: 'gpt-4o-mini',
  }
}

// Current LLM config (legacy global; prefer passing configs from headers).
let _llmConfig: LLMConfig = serverDefaultConfig()

export function setLLMConfig(config: LLMConfig) {
  _llmConfig = config
}

export function getLLMConfig(): LLMConfig {
  return _llmConfig
}

type ChatRole = 'system' | 'user' | 'assistant'

/**
 * A single chat message. `content` may be a plain string, or a multimodal
 * array (text + image_url parts) for Vision-capable endpoints. The OpenAI
 * chat completions API accepts both shapes directly.
 */
export type LLMMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >

type ChatMessageLike = Array<{ role: ChatRole; content: LLMMessageContent }>

// ─── Single-shot LLM calls (no retry) ─────────────────────────────────────
//
// `callOpenAIOnce` performs ONE LLM call with a per-call timeout. The retry
// loop + exponential backoff + multi-config failover logic lives in
// `callLLMWithFailover`, which calls this single-shot helper. Splitting it
// out keeps the retry code in one place and makes the per-attempt timeout
// semantics explicit (each attempt = one fresh timer, so worst case =
// attempts × timeoutMs).

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
  if (!config.baseURL || !config.apiKey) {
    throw new Error(
      'OpenAI backend not configured: set OPENAI_BASE_URL and OPENAI_API_KEY (server env) or add an LLM backend with a Base URL + API key in Settings.',
    )
  }
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
          role: m.role,
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
 * Extract a `Retry-After` value (in seconds) from a thrown error. Only
 * `callOpenAIOnce` attaches `retryAfterSec` to its errors (parsed from the
 * upstream `Retry-After` header); when absent the retry loop falls back to
 * exponential backoff.
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
        // Only the OpenAI-compatible provider is supported. `callOpenAIOnce`
        // validates that baseURL + apiKey are present and throws a clear error
        // otherwise (so callers get a useful message instead of a confusing
        // fetch failure).
        const content = await callOpenAIOnce(
          messages,
          config,
          effectiveTimeout,
        )
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
 *     until P1 ships the new multi-config UI. Only the `openai` provider
 *     is recognised.
 *  3. Default OpenAI (server env):
 *     `[{ id: 'default', provider: 'openai', ...envConfig }]`. Kicks in
 *     when no header is present — the backend falls back to OPENAI_BASE_URL
 *     / OPENAI_API_KEY / OPENAI_MODEL from the environment.
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
          // Only the 'openai' provider is supported; anything else is ignored.
          if (e.provider !== 'openai') continue
          const provider: 'openai' = 'openai'
          const id =
            typeof e.id === 'string' && e.id
              ? e.id
              : `openai:${typeof e.baseURL === 'string' ? e.baseURL : ''}`
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

  // ── 3. Default: server env OpenAI config ─────────────────────────────
  const def = serverDefaultConfig()
  return [
    {
      id: 'default',
      provider: 'openai',
      baseURL: def.baseURL,
      apiKey: def.apiKey,
      model: def.model,
      enabled: true,
      priority: 0,
    },
  ]
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
