import type { MetadataRoute } from 'next'

/**
 * T12 — Dynamic sitemap (Next.js App Router metadata route).
 *
 * Served at `/sitemap.xml` by the framework. We only advertise the two public
 * HTML routes that exist today (`/` and `/docs`); all functional surface area
 * lives behind `/api/*` and is intentionally excluded (see robots.ts).
 *
 * `lastModified` is recomputed per request so newly-deployed content gets
 * re-crawled without us having to remember to bump a constant.
 */
const BASE_URL = 'https://matlit.example.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/docs`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]
}
