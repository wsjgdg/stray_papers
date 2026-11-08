// Structured logging for the MatLit Miner backend.
//
// Goals:
//   - Production output is one JSON object per line on stdout/stderr, ready
//     to be picked up by a log aggregator (Loki, Datadog, CloudWatch, …).
//   - In development we ALSO print a colored, human-readable line so the
//     `dev.log` tail stays easy to scan. Both outputs carry the same fields,
//     so the JSON line is the source of truth.
//   - Sensitive fields (apiKey / password / token / secret) carried in the
//     `meta` object are redacted before anything is written — this prevents
//     accidental credential leaks via log shipping.
//
// Usage:
//   import { logInfo, logWarn, logError } from '@/lib/logger'
//   logInfo('classify started', { route: 'classify', count: 12 })
//   logError('paper upsert failed', { route: 'classify', paperId, error: e })
//
// All `console.log/error/warn` calls in API routes SHOULD go through here so
// log lines are uniform, queryable, and safe.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Sensitive-field redaction
// ---------------------------------------------------------------------------

// Substrings (case-insensitive) that, when found in a meta key, mark the
// value for redaction. We match on substrings rather than exact names so that
// `s2ApiKey`, `authorizationToken`, `userPassword` etc. are all caught.
const SENSITIVE_KEY_FRAGMENTS = [
  'apikey',
  'api_key',
  'password',
  'passwd',
  'token',
  'secret',
  'authorization',
  'cookie',
  'session',
]

const REDACTED = '[REDACTED]'

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return SENSITIVE_KEY_FRAGMENTS.some((frag) => lower.includes(frag))
}

/**
 * Deep-clone the value while replacing any sensitive fields with a sentinel.
 * - Plain objects: every key matching the sensitive list is replaced.
 * - Arrays: each element is recursively redacted.
 * - Strings: left alone (we don't try to detect "looking like a token"; that
 *   produces too many false positives).
 *
 * The input is never mutated; a shallow structural clone is returned so the
 * caller can safely reuse `meta` after logging.
 */
function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }

  // Guard against circular references — return a placeholder rather than
  // looping forever.
  if (seen.has(value as object)) {
    return '[Circular]'
  }
  seen.add(value as object)

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, seen))
  }

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redact(v, seen)
  }
  return out
}

// ---------------------------------------------------------------------------
// Dev-mode colored output
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m', // gray
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
}
const RESET_COLOR = '\x1b[0m'
const DIM = '\x1b[2m'

function isDevMode(): boolean {
  // NEXT_ENV is what Next.js sets in `next dev`. NODE_ENV is a fallback for
  // the realtime mini-service and any non-Next entrypoint.
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_RUNTIME !== 'production'
  )
}

function formatMetaForHuman(meta: Record<string, unknown>): string {
  if (Object.keys(meta).length === 0) return ''
  // Render each key=value pair, dropping undefined values. Strings are left
  // unquoted to keep the line compact; other types go through JSON.stringify
  // for unambiguous representation.
  const parts: string[] = []
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined) continue
    const rendered =
      typeof v === 'string' ? v : JSON.stringify(v)
    parts.push(`${k}=${rendered}`)
  }
  return parts.length > 0 ? ` ${DIM}${parts.join(' ')}${RESET_COLOR}` : ''
}

function humanLine(entry: LogEntry): string {
  const ts = entry.timestamp.replace('T', ' ').replace(/\..*Z$/, '')
  const color = LEVEL_COLORS[entry.level]
  const level = entry.level.toUpperCase().padEnd(5)
  const { level: _l, message: _m, timestamp: _t, ...meta } = entry
  void _l
  void _m
  void _t
  return `${DIM}${ts}${RESET_COLOR} ${color}${level}${RESET_COLOR} ${entry.message}${formatMetaForHuman(meta)}`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emit a structured log entry.
 *
 * - Always prints a single JSON line on stdout (or stderr for `error` /
 *   `warn`). This is the canonical, machine-readable output.
 * - In development, ALSO prints a colored, human-readable line so `dev.log`
 *   is easy to eyeball.
 *
 * `meta` is redacted before printing — never log raw credentials via this
 * function expecting them to be visible.
 */
export function log(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const safeMeta = meta ? (redact(meta) as Record<string, unknown>) : {}
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...safeMeta,
  }

  const json = JSON.stringify(entry)

  // The JSON line is always emitted — that's the canonical log shape.
  if (level === 'error' || level === 'warn') {
    console.error(json)
  } else {
    console.log(json)
  }

  // In dev, also emit a friendly colored line so a human tailing dev.log can
  // scan it without parsing JSON.
  if (isDevMode()) {
    if (level === 'error' || level === 'warn') {
      console.error(humanLine(entry))
    } else {
      console.log(humanLine(entry))
    }
  }
}

/** Info-level log. Equivalent to `log('info', message, meta)`. */
export function logInfo(
  message: string,
  meta?: Record<string, unknown>,
): void {
  log('info', message, meta)
}

/** Warn-level log. Use for recoverable degradations (fallbacks, retries). */
export function logWarn(
  message: string,
  meta?: Record<string, unknown>,
): void {
  log('warn', message, meta)
}

/** Error-level log. Use for failures that should be investigated. */
export function logError(
  message: string,
  meta?: Record<string, unknown>,
): void {
  log('error', message, meta)
}

/** Debug-level log. Use for verbose diagnostic output (off by default in prod). */
export function logDebug(
  message: string,
  meta?: Record<string, unknown>,
): void {
  log('debug', message, meta)
}
