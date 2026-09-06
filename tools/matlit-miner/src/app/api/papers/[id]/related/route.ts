import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'
import { apiError, apiNotFound } from '@/lib/api-error'

// GET /api/papers/[id]/related
// ResearchRabbit-style "related papers" recommendations for a single paper.
//
// Scoring (additive,Inspired by ResearchRabbit's topic + citation-overlap
// signal — but here we proxy citation network via shared material/authors/year
// because we don't store a citation graph):
//   - Same material           → +3
//   - Shared ≥3 title/abstract keywords → +2
//   - Similar year (±3 years) → +1
//   - Shared ≥1 author        → +2
//
// Returns top 8 (excluding the source paper itself):
//   [{ paperId, title, year, doi, authors, citationCount, score, reasons[] }]
//
// Response cached 30 minutes (TTL = 1_800_000 ms).

const CACHE_TTL_MS = 30 * 60 * 1000
const MAX_RESULTS = 8
const MIN_SHARED_KEYWORDS = 3
const YEAR_WINDOW = 3

// Lightweight English stopwords — good enough for keyword-overlap scoring.
// Kept short on purpose so domain terms (perovskite, bandgap, etc.) survive.
const STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for',
  'with', 'by', 'at', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'from', 'this', 'that', 'these', 'those', 'it', 'its', 'their', 'his',
  'her', 'our', 'we', 'they', 'which', 'who', 'whom', 'whose', 'into',
  'via', 'using', 'used', 'use', 'based', 'show', 'showed', 'shown',
  'study', 'studies', 'studied', 'report', 'reported', 'reports',
  'have', 'has', 'had', 'not', 'no', 'can', 'could', 'may', 'might',
  'will', 'would', 'should', 'shall', 'than', 'then', 'such', 'both',
  'all', 'any', 'some', 'more', 'most', 'between', 'through', 'after',
  'before', 'during', 'while', 'also', 'about', 'above', 'below',
  'up', 'down', 'out', 'over', 'under', 'again', 'further', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'what', 'which',
])

export interface RelatedPaper {
  paperId: string
  title: string
  year: number | null
  doi: string
  authors: string
  citationCount: number
  materialId: string
  materialName: string
  score: number
  reasons: string[]
}

interface ScoredPaper {
  paper: {
    id: string
    title: string
    year: number | null
    doi: string
    authors: string
    citationCount: number
    materialId: string
  }
  materialName: string
  score: number
  reasons: string[]
}

/**
 * Tokenize a title/abstract into a Set of lowercase keyword tokens.
 * Tokens are alphabetic runs of length >= 3, lowercased, with stopwords
 * removed. Pure-punctuation or numeric-only runs are dropped.
 */
function tokenize(text: string): Set<string> {
  if (!text) return new Set()
  const out = new Set<string>()
  const matches = text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g)
  if (!matches) return out
  for (const m of matches) {
    if (STOPWORDS.has(m)) continue
    out.add(m)
  }
  return out
}

/**
 * Parse the semicolon-separated authors string into a normalized Set
 * of surname tokens. Handles both Western ("John Smith") and
 * "Lastname Initials" ("Smith J.") conventions by taking the LAST
 * whitespace-delimited token whose length >= 3 (skipping tokens that
 * are likely initials, e.g. "SY", "MA", "J."). Falls back to the first
 * token if every token is short.
 *
 * Tokens are lowercased so subsequent Set comparisons are case-insensitive.
 * Trailing punctuation (periods, commas) is stripped before length checks.
 */
function authorSet(authors: string): Set<string> {
  const out = new Set<string>()
  if (!authors) return out
  for (const raw of authors.split(';')) {
    const name = raw.trim()
    if (!name) continue
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length === 0) continue
    const cleaned = parts.map((p) => p.replace(/[.,]+$/, ''))
    let surname: string | null = null
    for (let i = cleaned.length - 1; i >= 0; i--) {
      const p = cleaned[i]
      if (p.length >= 3) {
        surname = p
        break
      }
    }
    if (!surname) surname = cleaned[0]
    if (surname && surname.length >= 2) {
      out.add(surname.toLowerCase())
    }
  }
  return out
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Cache key is per-paper; we don't strip query params because this route
  // doesn't accept any. If the paper is edited/deleted the cache entry will
  // simply expire after 30 min — acceptable for a recommendation surface.
  const cacheKey = `related:${id}`

  try {
    const result = await getOrSet(cacheKey, CACHE_TTL_MS, async () => {
      return computeRelated(id)
    })
    if (result === null) {
      // Source paper not found — propagate as 404.
      return apiNotFound('Paper not found')
    }
    return NextResponse.json({ paperId: id, related: result })
  } catch (e) {
    return apiError('Failed to compute related papers', 500, e)
  }
}

async function computeRelated(id: string): Promise<RelatedPaper[] | null> {
  // --- Load source paper ----------------------------------------------------
  const source = await db.paper.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      abstract: true,
      authors: true,
      year: true,
      materialId: true,
      material: { select: { name: true } },
    },
  })
  if (!source) return null

  const sourceKeywords = tokenize(`${source.title} ${source.abstract}`)
  const sourceAuthors = authorSet(source.authors)
  const sourceYear = source.year
  const sourceMaterialId = source.materialId

  // --- Candidate set --------------------------------------------------------
  // We want a broad pool — pull papers from the same material first (always
  // relevant), plus papers that share authors (otherwise we'd miss cross-
  // material collaborations). For DBs without per-author indexes we
  // over-fetch and filter in JS.
  //
  // Strategy:
  //   1. All papers from the same material (excluding the source).
  //   2. For each source author surname, papers whose authors field
  //      contains that surname (SQLite LIKE is case-insensitive by default
  //      for ASCII — we additionally lowercase the surname).
  //
  // Capped to keep things fast on large DBs.

  const sameMaterial = await db.paper.findMany({
    where: { materialId: sourceMaterialId, id: { not: id } },
    select: {
      id: true,
      title: true,
      abstract: true,
      authors: true,
      year: true,
      doi: true,
      citationCount: true,
      materialId: true,
      material: { select: { name: true } },
    },
    take: 500,
  })

  // Author matches — query each surname separately with LIKE.
  // SQLite ASCII LIKE is case-insensitive for ASCII A-Z; surnames here are
  // generally ASCII so this works fine. We additionally lowercase the
  // surname token before sending it.
  const authorQueries = Array.from(sourceAuthors).slice(0, 10) // bound work
  let authorMatches: Array<(typeof sameMaterial)[number]> = []
  if (authorQueries.length > 0) {
    const orClauses = authorQueries.map((sn) => ({
      authors: { contains: sn },
    }))
    authorMatches = await db.paper.findMany({
      where: {
        id: { not: id },
        OR: orClauses,
      },
      select: {
        id: true,
        title: true,
        abstract: true,
        authors: true,
        year: true,
        doi: true,
        citationCount: true,
        materialId: true,
        material: { select: { name: true } },
      },
      take: 500,
    })
  }

  // Materialize unique candidates into a single Map keyed by id. The
  // sameMaterial list already contains the bulk of candidates; author
  // matches add cross-material collaborations. We re-use the full row
  // shape returned by both queries, so no further DB hits are needed.
  const byId = new Map<string, (typeof sameMaterial)[number]>()
  for (const p of sameMaterial) byId.set(p.id, p)
  for (const p of authorMatches) {
    if (!byId.has(p.id)) byId.set(p.id, p)
  }

  // --- Score every candidate ------------------------------------------------
  const scored: ScoredPaper[] = []
  for (const p of byId.values()) {
    const reasons: string[] = []
    let score = 0

    // (1) Same material — already guaranteed for the sameMaterial subset,
    // but author matches may come from other materials.
    if (p.materialId === sourceMaterialId) {
      score += 3
      reasons.push('same material')
    }

    // (2) Shared keywords in title/abstract.
    const pKeywords = tokenize(`${p.title} ${p.abstract}`)
    if (pKeywords.size > 0 && sourceKeywords.size > 0) {
      let shared = 0
      // Iterate the smaller set for speed.
      const [small, large] =
        pKeywords.size <= sourceKeywords.size
          ? [pKeywords, sourceKeywords]
          : [sourceKeywords, pKeywords]
      for (const k of small) {
        if (large.has(k)) shared++
      }
      if (shared >= MIN_SHARED_KEYWORDS) {
        score += 2
        reasons.push(`shared topic (${shared} terms)`)
      }
    }

    // (3) Similar year (±3).
    if (sourceYear && p.year && Math.abs(sourceYear - p.year) <= YEAR_WINDOW) {
      score += 1
      reasons.push('similar year')
    }

    // (4) Shared authors.
    const pAuthors = authorSet(p.authors)
    if (pAuthors.size > 0 && sourceAuthors.size > 0) {
      let sharedAuthors = 0
      const [small, large] =
        pAuthors.size <= sourceAuthors.size
          ? [pAuthors, sourceAuthors]
          : [sourceAuthors, pAuthors]
      for (const a of small) {
        if (large.has(a)) sharedAuthors++
      }
      if (sharedAuthors > 0) {
        score += 2
        reasons.push(
          sharedAuthors === 1
            ? 'shared author'
            : `shared authors (${sharedAuthors})`,
        )
      }
    }

    if (score === 0) continue
    scored.push({
      paper: {
        id: p.id,
        title: p.title,
        year: p.year,
        doi: p.doi,
        authors: p.authors,
        citationCount: p.citationCount,
        materialId: p.materialId,
      },
      materialName: p.material.name,
      score,
      reasons,
    })
  }

  // --- Rank -----------------------------------------------------------------
  // Sort by score desc, then citation count desc (more-cited papers are
  // generally more useful recommendations), then year desc as a tiebreaker.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.paper.citationCount !== a.paper.citationCount) {
      return b.paper.citationCount - a.paper.citationCount
    }
    return (b.paper.year ?? 0) - (a.paper.year ?? 0)
  })

  const top = scored.slice(0, MAX_RESULTS)
  return top.map<RelatedPaper>((s) => ({
    paperId: s.paper.id,
    title: s.paper.title,
    year: s.paper.year,
    doi: s.paper.doi,
    authors: s.paper.authors,
    citationCount: s.paper.citationCount,
    materialId: s.paper.materialId,
    materialName: s.materialName,
    score: s.score,
    reasons: s.reasons,
  }))
}
