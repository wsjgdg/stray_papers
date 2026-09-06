import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCached, invalidate } from '@/lib/cache'

// POST /api/review/auto-update
//
// G14 — Auto literature review update.
//
// Subscriptions live in the browser's localStorage (see
// src/lib/subscription-store.ts), so this endpoint can't enumerate them
// server-side. Instead the client passes the list of `materialIds` it's
// currently subscribed to and we figure out, per material, whether the
// AI review needs to be regenerated:
//
//   1. Read the cached review entry (`review:<id>`) — it stores the
//      `paperCount` and `generatedAt` from when the review was last
//      produced by /api/materials/[id]/review.
//   2. Count the current papers for that material in the DB.
//   3. If the cached review is missing OR `currentPaperCount >
//      cached.paperCount` (i.e. new papers have arrived since the last
//      generation), invalidate the cache entry and call the existing
//      /api/materials/[id]/review?refresh=1 endpoint internally to
//      regenerate it.
//
// The endpoint never crashes on a per-material failure — if one
// regeneration throws (LLM rate-limit, network, etc.) we record
// `reviewRegenerated: false` for that row and move on so the rest of
// the batch still completes.
//
// Caps at 10 materials per call to bound LLM cost (the caller is
// expected to slice client-side too, but we enforce it server-side as
// a safety net).
//
// Request body:
//   { materialIds: string[] }
//
// Response:
//   {
//     updated: Array<{
//       materialId: string,
//       materialName: string,
//       newPaperCount: number,        // papers added since last review
//       reviewRegenerated: boolean,   // did we call /review?refresh=1
//       reviewGeneratedAt: string | null, // ISO ts of the freshest review
//       reason: 'new_papers' | 'no_review' | 'up_to_date' | 'not_found' | 'no_papers'
//     }>,
//     checkedAt: string // ISO timestamp
//   }

const MAX_MATERIALS = 10

/**
 * Shape of the cached review entry stored by
 * /api/materials/[id]/review (see REVIEW_TTL_MS = 1h cache).
 * The cache may also store `{ notFound: true }` when the material
 * didn't exist at cache time — we treat that as "no review".
 */
interface CachedReview {
  review?: string
  generatedAt?: string
  paperCount?: number
  source?: 'llm' | 'fallback'
  notFound?: boolean
}

interface FreshnessInfo {
  generatedAt: string
  paperCount: number
}

/**
 * Read the cached review entry for `materialId` and return just the
 * freshness info we care about. Returns null when there's no cache, the
 * cache says "not found", or the entry is malformed.
 */
function readCachedFreshness(materialId: string): FreshnessInfo | null {
  const cached = getCached<CachedReview>(`review:${materialId}`)
  if (!cached) return null
  if (cached.notFound) return null
  if (
    typeof cached.generatedAt !== 'string' ||
    typeof cached.paperCount !== 'number'
  ) {
    return null
  }
  return {
    generatedAt: cached.generatedAt,
    paperCount: cached.paperCount,
  }
}

interface UpdatedItem {
  materialId: string
  materialName: string
  newPaperCount: number
  reviewRegenerated: boolean
  reviewGeneratedAt: string | null
  reason:
    | 'new_papers'
    | 'no_review'
    | 'up_to_date'
    | 'not_found'
    | 'no_papers'
}

export async function POST(req: NextRequest) {
  // Parse the body defensively — a missing/invalid body should yield a
  // 400, not a 500.
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Invalid body: expected JSON object with materialIds[]' },
      { status: 400 },
    )
  }
  const { materialIds } = body as { materialIds?: unknown }
  if (!Array.isArray(materialIds)) {
    return NextResponse.json(
      { error: 'materialIds must be a string[]' },
      { status: 400 },
    )
  }
  if (!materialIds.every((x) => typeof x === 'string')) {
    return NextResponse.json(
      { error: 'materialIds must contain only strings' },
      { status: 400 },
    )
  }

  // Dedupe + cap to MAX_MATERIALS to bound LLM cost.
  const uniqueIds = Array.from(new Set(materialIds)).slice(0, MAX_MATERIALS)

  const updated: UpdatedItem[] = []

  for (const id of uniqueIds) {
    // Single DB round-trip: fetch the material name + paper count.
    const material = await db.material
      .findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          _count: { select: { papers: true } },
        },
      })
      .catch(() => null)

    if (!material) {
      updated.push({
        materialId: id,
        materialName: id,
        newPaperCount: 0,
        reviewRegenerated: false,
        reviewGeneratedAt: null,
        reason: 'not_found',
      })
      continue
    }

    const currentPaperCount = material._count.papers
    const cached = readCachedFreshness(id)

    // No papers and no existing review → nothing to review yet.
    if (currentPaperCount === 0 && !cached) {
      updated.push({
        materialId: id,
        materialName: material.name,
        newPaperCount: 0,
        reviewRegenerated: false,
        reviewGeneratedAt: null,
        reason: 'no_papers',
      })
      continue
    }

    // Compute how many new papers arrived since the last review.
    const newPaperCount = cached
      ? Math.max(0, currentPaperCount - cached.paperCount)
      : currentPaperCount

    // If the cache is fresh AND no new papers arrived, skip regeneration.
    if (cached && newPaperCount === 0) {
      updated.push({
        materialId: id,
        materialName: material.name,
        newPaperCount: 0,
        reviewRegenerated: false,
        reviewGeneratedAt: cached.generatedAt,
        reason: 'up_to_date',
      })
      continue
    }

    // Otherwise: invalidate the stale cache entry and re-generate by
    // calling the existing review endpoint internally with ?refresh=1.
    // Using `invalidate` rather than `setCached(...,null,...)` keeps the
    // code symmetric with how /api/materials/[id]/review is invalidated
    // elsewhere in the app.
    invalidate(`review:${id}`)

    const reason: UpdatedItem['reason'] = cached ? 'new_papers' : 'no_review'
    let reviewRegenerated = false
    let reviewGeneratedAt: string | null = cached?.generatedAt ?? null

    try {
      // Build an absolute URL on the same origin so the internal fetch
      // hits the local dev server (not the Caddy gateway).
      const refreshUrl = new URL(
        `/api/materials/${encodeURIComponent(id)}/review?refresh=1`,
        req.url,
      )
      // Generous timeout: LLM calls can take 20-40s on the first hit.
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 90_000)
      const resp = await fetch(refreshUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (resp.ok) {
        const data = (await resp.json().catch(() => null)) as Partial<{
          generatedAt: string
          paperCount: number
        }> | null
        if (data && typeof data.generatedAt === 'string') {
          reviewRegenerated = true
          reviewGeneratedAt = data.generatedAt
        }
      }
      // If resp not ok or payload malformed, we leave reviewRegenerated
      // as false and fall through with the previous generatedAt (if any).
    } catch (e) {
      // Network/abort/parse error — swallow so the rest of the batch
      // still completes. The caller will see reviewRegenerated=false
      // and can retry on the next cycle. Log so we can spot a
      // systematically broken review endpoint vs. transient blips.
      console.warn('[review/auto-update] review regeneration call failed:', e)
    }

    updated.push({
      materialId: id,
      materialName: material.name,
      newPaperCount,
      reviewRegenerated,
      reviewGeneratedAt,
      reason,
    })
  }

  return NextResponse.json({
    updated,
    checkedAt: new Date().toISOString(),
  })
}

// GET on this route is a tiny helper that returns the rate limit + the
// cap so the client can render "up to N materials per call" copy
// without hard-coding it.
export async function GET() {
  return NextResponse.json({
    maxMaterialsPerCall: MAX_MATERIALS,
    description:
      'POST { materialIds: string[] } to check & regenerate stale AI reviews for subscribed materials.',
  })
}
