import { NextResponse, type NextRequest } from 'next/server'

/**
 * Global proxy — the Next.js 16 replacement for the `middleware` convention.
 *
 * Next.js 16.1 deprecated `src/middleware.ts` in favour of `src/proxy.ts`
 * exporting a `proxy()` function; the old filename still works but emits a
 * deprecation warning on every boot and will break in a future major.
 *
 * T9 — API versioning:
 *   Adds `X-API-Version: 1` to every `/api/*` response so clients can pin /
 *   negotiate the API contract without scanning route signatures. The matcher
 *   below restricts this proxy to `/api/` so static assets, SSR pages,
 *   `_next/*`, and the new metadata routes (`/sitemap.xml`, `/robots.txt`) are
 *   not touched.
 *
 *   The version is a hard-coded constant for now (single deployed generation).
 *   When a v2 surface is introduced, bump this and routes can read the same
 *   header from inbound requests to gate behavior.
 */
export const API_VERSION = '1'

export function proxy(_req: NextRequest) {
  const res = NextResponse.next()
  res.headers.set('X-API-Version', API_VERSION)
  return res
}

export const config = {
  // Only run on API routes — keep page / asset requests fast and untouched.
  matcher: ['/api/:path*'],
}
