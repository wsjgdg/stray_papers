import type { MetadataRoute } from 'next'

/**
 * T12 — robots.txt (Next.js App Router metadata route).
 *
 * Served at `/robots.txt` by the framework. The SPA is fully client-rendered
 * and all meaningful content is gated behind `/api/*`, so we:
 *   - Allow `/` (the single user-facing entry point).
 *   - Disallow `/api/` so crawlers don't hammer the JSON endpoints (some of
 *     which are LLM-backed and would burn quota / rate-limit budget).
 *   - Point at the sitemap so new content is discovered promptly.
 */
const BASE_URL = 'https://matlit.example.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
