// Shared helper for the Settings "Test" buttons.
//
// Every /api/keys/check/* route returns HTTP 200 with { ok, message } -- never a
// non-2xx response. That is load-bearing: src/lib/api-client.ts throws when
// `!resp.ok`, and the settings dialog renders the thrown message verbatim.
// Returning 200 + ok:false lets the dialog show a friendly per-entry error
// instead of a stack-trace-style exception for what is only a bad key.
// (src/app/api/llm/models/route.ts follows the same convention.)

export interface ApiTestResult {
  ok: boolean
  message: string
}

export interface ProbeOptions {
  /** Human label, e.g. "Semantic Scholar" or `LLM (gpt-4o-mini)`. */
  label: string
  url: string
  method?: 'GET' | 'POST' | 'HEAD'
  headers?: Record<string, string>
  /** JSON-serialised when provided. */
  body?: unknown
  timeoutMs?: number
  /** Appended to the success message. */
  okNote?: string
  /** Return a friendly failure message for a given status, or undefined to
      fall back to the generic "HTTP <status> · <body>" form. */
  interpret?: (status: number, bodyText: string) => string | undefined
}

export const DEFAULT_PROBE_TIMEOUT_MS = 8000

/** Error text that indicates the network path itself failed, not the API. */
const NETWORK_FAILURE_RE =
  /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ETIMEDOUT|fetch failed|NetworkError/i

export async function probe(opts: ProbeOptions): Promise<ApiTestResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()

  try {
    const resp = await fetch(opts.url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    })
    const latency = Date.now() - started
    // Collapse whitespace: providers return pretty-printed JSON, and the
    // message is rendered inline in the settings dialog where a multi-line
    // body would blow out the layout.
    const bodyText = (await resp.text().catch(() => ''))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180)

    if (resp.ok) {
      const note = opts.okNote ? ` · ${opts.okNote}` : ''
      return {
        ok: true,
        message: `${opts.label} OK · HTTP ${resp.status} in ${latency}ms${note}`,
      }
    }

    return {
      ok: false,
      message:
        opts.interpret?.(resp.status, bodyText) ??
        `${opts.label} HTTP ${resp.status}${bodyText ? ` · ${bodyText}` : ''}`,
    }
  } catch (e) {
    const err = e as Error
    if (err.name === 'AbortError') {
      return {
        ok: false,
        message: `${opts.label} timed out after ${timeoutMs / 1000}s`,
      }
    }
    const msg = err.message || 'Network error'
    if (NETWORK_FAILURE_RE.test(msg)) {
      return {
        ok: false,
        message: `${opts.label} unreachable · ${msg.slice(0, 140)}`,
      }
    }
    return { ok: false, message: `${opts.label} ${msg.slice(0, 180)}` }
  } finally {
    clearTimeout(timer)
  }
}

/** Strip trailing slashes so callers can append a path segment safely. */
export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** Polite-pool User-Agent for open literature APIs. The email is a courtesy
    requirement (rate-limit / contact policy), not authentication. */
export function politeUA(email: string): string {
  return email
    ? `MatLitMiner/1.0 (mailto:${email})`
    : 'MatLitMiner/1.0'
}
