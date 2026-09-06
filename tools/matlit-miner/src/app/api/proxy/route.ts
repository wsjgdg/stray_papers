import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiBadRequest } from '@/lib/api-error'

// GET /api/proxy?url=<encoded external url>
// Streams external images / PDFs through the server to bypass CORS and
// X-Frame-Options restrictions for in-app display (PDF viewer, VLM image fetch).
const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'application/pdf',
])

const FETCH_TIMEOUT_MS = 15_000

/**
 * CORS allowlist for the proxy response.
 *
 * S2 hardening — previously this route returned
 * `Access-Control-Allow-Origin: '*'`, allowing ANY site to fetch proxied
 * images/PDFs through our server (SSRF amplification + bandwidth abuse
 * vector). Now we reflect the request's `Origin` header back ONLY if it
 * appears in the allowlist.
 *
 * Allowlist source (priority order):
 *   1. `process.env.CORS_ORIGINS` — comma-separated list, e.g.
 *      `http://localhost:3000,https://matlit.example.com`
 *   2. Default: `http://localhost:3000` only.
 *
 * Origins are matched by exact string equality after trimming whitespace.
 * No wildcard (`*`) is honored — every allowed origin must be explicit.
 */
function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS
  if (raw && raw.trim()) {
    const list = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (list.length > 0) return list
  }
  return ['http://localhost:3000']
}

/**
 * Returns the origin to reflect back in `Access-Control-Allow-Origin`, or
 * `null` if the request's Origin is not in the allowlist (in which case
 * the header is omitted entirely — browsers will block the response).
 */
function resolveCorsOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin')
  if (!origin) return null
  const allowed = getAllowedOrigins()
  return allowed.includes(origin) ? origin : null
}

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url')
  if (!urlParam) {
    return apiBadRequest('Missing "url" query parameter')
  }

  let target: URL
  try {
    target = new URL(urlParam)
  } catch {
    return apiBadRequest('Invalid url parameter')
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return apiBadRequest('Only http(s) URLs are allowed')
  }

  // Resolve the CORS origin up-front so we can also use it on error
  // responses (OPTIONS preflight is not needed because this route only
  // supports simple GET requests with no auth headers).
  const corsOrigin = resolveCorsOrigin(req)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Browser-like UA helps with publishers that block default fetcher UAs.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept:
          'image/*,application/pdf,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (!upstream.ok) {
      return apiError(`Upstream responded ${upstream.status}`, 502)
    }

    const contentType = (upstream.headers.get('content-type') || '')
      .toLowerCase()
      .split(';')[0]
      .trim()

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return apiError(
        `Unsupported content-type: ${contentType || 'unknown'}. Only images and PDFs are proxied.`,
        415,
      )
    }

    const body = await upstream.arrayBuffer()

    // S2: only reflect the request Origin if it's in the allowlist. If the
    // Origin header is missing (same-origin request from the app itself,
    // or a non-browser client) or not allowed, we omit the CORS header
    // entirely — browsers will treat the response as same-origin only.
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
    if (corsOrigin) {
      headers['Access-Control-Allow-Origin'] = corsOrigin
      // When we reflect a specific origin, `Vary: Origin` is required so
      // caches don't serve a CORS-allowed response to a different origin.
      headers['Vary'] = 'Origin'
    }

    return new NextResponse(body, {
      status: 200,
      headers,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.toLowerCase().includes('abort')) {
      return apiError('Upstream fetch timed out', 504)
    }
    return apiError('Proxy fetch failed', 502, err)
  } finally {
    clearTimeout(timer)
  }
}

// OPTIONS /api/proxy — explicit CORS preflight handler. Browsers send this
// for non-simple cross-origin requests; even though our GET is "simple"
// (no auth header, no custom content-type on the request), we handle
// OPTIONS explicitly so a preflight never 405s and the CORS allowlist is
// enforced symmetrically.
export async function OPTIONS(req: NextRequest) {
  const corsOrigin = resolveCorsOrigin(req)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
  if (corsOrigin) {
    headers['Access-Control-Allow-Origin'] = corsOrigin
    headers['Vary'] = 'Origin'
  }
  return new NextResponse(null, { status: 204, headers })
}
