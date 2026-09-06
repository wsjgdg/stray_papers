import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { getCached, setCached } from '@/lib/cache'

// POST /api/classify/context
//
// Scite-style citation context analysis. For each paper (max 20 per request),
// ask the LLM to classify the paper's STANCE toward its associated material:
//
//   - "supporting":  validates / confirms the material's reported properties
//                   (e.g. reports high efficiency, confirms bandgap, demonstrates
//                   successful synthesis, stabilizes the phase).
//   - "disputing":   challenges / contradicts the material's reported properties
//                   (e.g. lower-than-expected efficiency, instability, failed
//                   synthesis, unexpected phase).
//   - "mentioning":  only incidental mention (benchmark, review table, comparison
//                   or background reference, no substantive investigation).
//   - "neutral":     ambiguous — discussed but no clear validation/dispute
//                   (e.g. theoretical comparison, prediction only).
//
// Results are cached per-paperId for 1h (in-memory). Frontend caches in
// TanStack Query with the same TTL so the knowledge-graph toggle and the
// classification-tab badges share one source of truth.

export type CitationContext = 'supporting' | 'disputing' | 'mentioning' | 'neutral'

export interface ContextResult {
  paperId: string
  context: CitationContext
  reason: string
}

interface ContextResponse {
  results: ContextResult[]
  cachedAt: number
  cacheTtlMs: number
  processed: number
  fromCache: number
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_PAPERS = 20
const VALID_CONTEXTS: ReadonlySet<CitationContext> = new Set([
  'supporting',
  'disputing',
  'mentioning',
  'neutral',
])

// Lazily-instantiated ZAI client shared across requests in the same Node
// process (the Next.js dev server is single-instance, so this is safe).
let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null
async function getZai() {
  if (!_zai) _zai = await ZAI.create()
  return _zai
}

function cacheKey(paperId: string) {
  return `citation-context:${paperId}`
}

function stripJsonFence(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  }
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1)
  }
  return t
}

/**
 * Call ZAI chat to classify a single paper's citation context toward the
 * given material. Returns a neutral fallback (with the error message in the
 * reason field) on failure so the API never throws 500 on transient LLM
 * errors.
 */
async function classifyContext(
  abstract: string,
  materialName: string,
  paperTitle: string,
): Promise<{ context: CitationContext; reason: string }> {
  const prompt = `You are a materials-science citation-context analyst (in the spirit of Scite.ai).
Given the paper below, classify its stance toward the material "${materialName}":

- "supporting": the paper validates, confirms, or reports positive results about the material's properties (e.g. reports high efficiency, confirms bandgap, demonstrates successful synthesis, stabilizes the phase).
- "disputing":  the paper challenges, contradicts, or reports negative / unexpected results about the material's reported properties (e.g. lower-than-expected efficiency, instability, failed synthesis, phase impurity).
- "mentioning": the paper only mentions the material incidentally (benchmark, review table, comparison, background reference) without substantive investigation.
- "neutral":    the paper discusses the material but the stance is ambiguous (theoretical comparison, prediction only, no clear validation or dispute).

Paper title: ${paperTitle || '(no title)'}

Abstract:
${abstract || '(no abstract)'}

Return ONLY JSON in this exact shape, no commentary:
{"context":"supporting|disputing|mentioning|neutral","reason":"one short sentence (<= 200 chars) explaining the stance"}`

  const zai = await getZai()
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content:
              'You are a precise citation-context analysis assistant. Always output strict JSON only — no prose, no fences.',
          },
          { role: 'user', content: prompt },
        ],
        thinking: { type: 'disabled' },
      })
      const content = completion.choices[0]?.message?.content || ''
      let parsed: { context?: unknown; reason?: unknown } | null = null
      try {
        parsed = JSON.parse(stripJsonFence(content)) as {
          context?: unknown
          reason?: unknown
        }
      } catch {
        parsed = null
      }
      const ctxRaw = String(parsed?.context ?? '').toLowerCase().trim()
      const context: CitationContext = VALID_CONTEXTS.has(ctxRaw as CitationContext)
        ? (ctxRaw as CitationContext)
        : 'neutral'
      const reason =
        (typeof parsed?.reason === 'string' ? parsed.reason : '').trim().slice(0, 300) ||
        (locale => (locale === 'zh' ? '未提供理由' : 'No reason provided'))('en')
      return { context, reason }
    } catch (e) {
      lastErr = e
      const msg = (e as Error).message || ''
      const isTransient =
        msg.includes('429') ||
        msg.includes('Too many requests') ||
        msg.includes('rate limit') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('fetch failed') ||
        msg.includes('network')
      if (!isTransient || attempt === 2) break
      await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, attempt)))
    }
  }
  return {
    context: 'neutral',
    reason: `Analysis failed: ${(lastErr as Error)?.message ?? 'unknown error'}`.slice(0, 300),
  }
}

/**
 * POST handler.
 * Body: { paperIds: string[] } (max 20 — extras are silently truncated).
 * Returns: { results: ContextResult[], cachedAt, cacheTtlMs, processed, fromCache }
 *
 * Missing paperIds are returned with context='neutral' and reason='Paper not
 * found' so callers don't crash. A 400 is returned only if the request body
 * is malformed (no paperIds array, or empty).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json().catch(() => ({}))
  const { paperIds } = body as { paperIds?: unknown }

  if (!Array.isArray(paperIds) || paperIds.length === 0) {
    return NextResponse.json(
      {
        error:
          'paperIds must be a non-empty array of strings (max 20 per request).',
      },
      { status: 400 },
    )
  }

  const ids: string[] = paperIds
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, MAX_PAPERS)

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'paperIds must contain at least one non-empty string.' },
      { status: 400 },
    )
  }

  // Fetch papers in one query. We only need abstract + material name + title.
  const papers = await db.paper.findMany({
    where: { id: { in: ids } },
    include: { material: { select: { name: true } } },
    take: MAX_PAPERS,
  })

  const results: ContextResult[] = []
  const toProcess: Array<{
    paperId: string
    abstract: string
    materialName: string
    title: string
  }> = []
  let fromCache = 0

  for (const id of ids) {
    const cached = getCached<{ context: CitationContext; reason: string }>(cacheKey(id))
    if (cached) {
      fromCache++
      results.push({ paperId: id, ...cached })
      continue
    }
    const paper = papers.find((p) => p.id === id)
    if (!paper) {
      // Missing paper → neutral + reason; do NOT cache (so a future re-add
      // will be re-classified instead of returning the stale neutral entry).
      results.push({
        paperId: id,
        context: 'neutral',
        reason: 'Paper not found',
      })
      continue
    }
    toProcess.push({
      paperId: id,
      abstract: paper.abstract,
      materialName: paper.material.name,
      title: paper.title,
    })
  }

  // Concurrency-limited LLM batch (3 in flight at a time).
  const concurrency = 3
  let index = 0
  async function worker() {
    while (index < toProcess.length) {
      const current = index++
      const item = toProcess[current]
      try {
        const result = await classifyContext(
          item.abstract,
          item.materialName,
          item.title,
        )
        setCached(cacheKey(item.paperId), result, CACHE_TTL_MS)
        results.push({ paperId: item.paperId, ...result })
      } catch (e) {
        const fallback = {
          context: 'neutral' as CitationContext,
          reason: `Error: ${(e as Error).message}`.slice(0, 300),
        }
        setCached(cacheKey(item.paperId), fallback, CACHE_TTL_MS)
        results.push({ paperId: item.paperId, ...fallback })
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, toProcess.length) }, () => worker()),
  )

  // Preserve input order (caller passes paperIds in display order).
  const byId = new Map(results.map((r) => [r.paperId, r]))
  const ordered: ContextResult[] = ids.map((id) => {
    const r = byId.get(id)
    if (r) return r
    // Defensive fallback — should never hit because every id produced a result
    // above, but TS doesn't know that.
    return { paperId: id, context: 'neutral', reason: 'Unknown' }
  })

  const response: ContextResponse = {
    results: ordered,
    cachedAt: Date.now(),
    cacheTtlMs: CACHE_TTL_MS,
    processed: toProcess.length,
    fromCache,
  }
  return NextResponse.json(response)
}

/**
 * GET handler — convenience endpoint that returns cached contexts for the
 * given paperIds without triggering LLM calls. Used by the knowledge-graph
 * toggle to cheaply check if contexts are already available before prompting
 * the user to run analysis.
 *
 * Query: ?paperIds=id1,id2,...  (max 50)
 */
export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url)
  const raw = url.searchParams.get('paperIds') || ''
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is string => s.length > 0)
    .slice(0, 50)

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'paperIds query param required (comma-separated).' },
      { status: 400 },
    )
  }

  const results: ContextResult[] = []
  let fromCache = 0
  for (const id of ids) {
    const cached = getCached<{ context: CitationContext; reason: string }>(cacheKey(id))
    if (cached) {
      fromCache++
      results.push({ paperId: id, ...cached })
    } else {
      results.push({ paperId: id, context: 'neutral', reason: 'Not yet analyzed' })
    }
  }

  return NextResponse.json({
    results,
    fromCache,
    cacheTtlMs: CACHE_TTL_MS,
  })
}
