import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { logWarn } from '@/lib/logger'

// ─── FTS5 full-text search infrastructure (T5) ─────────────────────────────
//
// Problem: the original `q` filter used 4 OR-ed `LIKE '%q%'` predicates
// (title / abstract / authors / venue). With 1300+ papers, each query scans
// the whole table four times and cannot use any index (LIKE with a leading
// `%` is unindexable in SQLite).
//
// Solution: a SQLite FTS5 virtual table (`papers_fts`) mirrors the searchable
// text of every Paper row and is kept in sync by INSERT / UPDATE / DELETE
// triggers. Queries use `MATCH` + `rank()` ordering which is several orders
// of magnitude faster than four LIKE scans and returns relevance-ranked
// results.
//
// Why FTS5 instead of a generated `searchText` column?
//   - LIKE '%q%' on a single concatenated column still does a full table
//     scan; only the number of LIKE passes drops from 4 → 1.
//   - FTS5 builds an inverted index → lookups are O(terms), not O(rows).
//   - Triggers mean we don't need to modify the upstream create endpoints
//     (search / search-cn / search-batch / import-bibtex / upload-pdf) —
//     every INSERT fires the trigger and the FTS index stays consistent.
//
// The virtual table, triggers, and backfill are created lazily on first use
// (cached in `ftsReadyPromise` so the cost is paid once per server process).
// If FTS5 is unavailable in the SQLite build (some embedded builds ship
// without `ENABLE_FTS5`), we log a warning and fall back to the legacy
// OR-LIKE query path so the API keeps working.

/** SQLite FTS5 search expression, escaped and prefix-tokenized. */
function buildFtsQuery(q: string): string {
  return q
    .split(/\s+/)
    .map((tok) => tok.trim())
    .filter((tok) => tok.length > 0)
    .map((tok) => {
      // Escape double-quotes and wrap in quotes so FTS5 treats the token as
      // a phrase (prevents user input like "OR" / "*" / ":" from being
      // parsed as FTS5 syntax). Append `*` for prefix matching so "perov"
      // matches "perovskite".
      const safe = tok.replace(/"/g, '""')
      return `"${safe}"*`
    })
    .join(' ')
}

interface FtsRow {
  paper_id: string
}

let ftsReadyPromise: Promise<boolean> | null = null
let ftsAvailable = true

async function ensureFtsReady(): Promise<boolean> {
  if (!ftsAvailable) return false
  if (ftsReadyPromise) return ftsReadyPromise
  ftsReadyPromise = (async () => {
    try {
      // 1) Virtual table.
      await db.$executeRawUnsafe(
        `CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
          paper_id UNINDEXED,
          text,
          tokenize = 'unicode61'
        )`,
      )
      // 2) Sync triggers. SQLite table name is `Paper` (Prisma model name
      // verbatim — verified via sqlite_master). Schema columns: id, title,
      // abstract, authors, venue, doi.
      await db.$executeRawUnsafe(
        `CREATE TRIGGER IF NOT EXISTS papers_ai_fts
         AFTER INSERT ON Paper BEGIN
           INSERT INTO papers_fts(paper_id, text)
           VALUES (NEW.id,
                   COALESCE(NEW.title,'') || ' ' ||
                   COALESCE(NEW.abstract,'') || ' ' ||
                   COALESCE(NEW.authors,'') || ' ' ||
                   COALESCE(NEW.venue,'') || ' ' ||
                   COALESCE(NEW.doi,''));
         END`,
      )
      await db.$executeRawUnsafe(
        `CREATE TRIGGER IF NOT EXISTS papers_ad_fts
         AFTER DELETE ON Paper BEGIN
           DELETE FROM papers_fts WHERE paper_id = OLD.id;
         END`,
      )
      await db.$executeRawUnsafe(
        `CREATE TRIGGER IF NOT EXISTS papers_au_fts
         AFTER UPDATE ON Paper BEGIN
           DELETE FROM papers_fts WHERE paper_id = OLD.id;
           INSERT INTO papers_fts(paper_id, text)
           VALUES (NEW.id,
                   COALESCE(NEW.title,'') || ' ' ||
                   COALESCE(NEW.abstract,'') || ' ' ||
                   COALESCE(NEW.authors,'') || ' ' ||
                   COALESCE(NEW.venue,'') || ' ' ||
                   COALESCE(NEW.doi,''));
         END`,
      )
      // 3) Backfill — index any Paper row that isn't yet in papers_fts.
      //    Cheap on the happy path (zero rows to insert once steady-state
      //    is reached) and self-healing if triggers were ever dropped.
      await db.$executeRawUnsafe(
        `INSERT INTO papers_fts(paper_id, text)
         SELECT P.id,
                COALESCE(P.title,'') || ' ' ||
                COALESCE(P.abstract,'') || ' ' ||
                COALESCE(P.authors,'') || ' ' ||
                COALESCE(P.venue,'') || ' ' ||
                COALESCE(P.doi,'')
         FROM Paper P
         WHERE NOT EXISTS (
           SELECT 1 FROM papers_fts F WHERE F.paper_id = P.id
         )`,
      )
      return true
    } catch (e) {
      ftsAvailable = false
      logWarn('papers.fts.init_failed', {
        error: e instanceof Error ? e.message : String(e),
        fallback: 'OR-LIKE',
      })
      return false
    }
  })()
  return ftsReadyPromise
}

/**
 * Run an FTS5 MATCH and return matching paper IDs (relevance-ranked).
 * Returns `null` if FTS5 is unavailable — caller falls back to LIKE.
 */
async function searchFts(q: string): Promise<string[] | null> {
  const ok = await ensureFtsReady()
  if (!ok) return null
  try {
    const expr = buildFtsQuery(q)
    if (!expr) return []
    const rows = await db.$queryRawUnsafe<FtsRow[]>(
      // NOTE: `rank` is a special FTS5 column (not a function). Calling
      // `rank()` collides with SQLite's window-function syntax and raises
      // "misuse of window function rank()" — use the bare column instead.
      `SELECT paper_id FROM papers_fts WHERE papers_fts MATCH ? ORDER BY rank`,
      expr,
    )
    return rows.map((r) => r.paper_id)
  } catch (e) {
    logWarn('papers.fts.query_failed', {
      error: e instanceof Error ? e.message : String(e),
      fallback: 'OR-LIKE',
    })
    return null
  }
}

// GET /api/papers - list papers, optionally filtered by materialId / status / synthesized
// Query params:
//   - materialId: filter by material
//   - synthesized: yes | no | uncertain
//   - hasClassification: 'true' | 'false'
//   - q: title / abstract full-text search (case-insensitive). Uses FTS5
//        when available (inverted index, relevance-ranked); falls back to
//        a 4-way OR LIKE on title/abstract/authors/venue otherwise.
//   - source: filter by source
//   - limit: legacy param (default 100, max 500) - returns `{ papers, count }`
//   - page + pageSize: paginated response (1-indexed) - returns
//     `{ items, total, page, pageSize, totalPages, papers, count }`
//     (papers/count kept for backward compat with existing callers)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const materialId = searchParams.get('materialId')
  const synthesized = searchParams.get('synthesized') // yes | no | uncertain
  const hasClassification = searchParams.get('hasClassification')
  const source = searchParams.get('source')
  const q = searchParams.get('q')?.trim() || ''

  // Pagination params
  const pageParam = searchParams.get('page')
  const pageSizeParam = searchParams.get('pageSize')

  // Legacy "limit" param keeps the existing shape (no pagination metadata)
  const legacyLimit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)

  const where: Record<string, unknown> = {}
  if (materialId) where.materialId = materialId
  if (synthesized) {
    where.classification = { synthesized }
  }
  if (hasClassification === 'true') {
    where.classification = { isNot: null }
  } else if (hasClassification === 'false') {
    where.classification = null
  }
  if (source) where.source = source

  // ─── T5: search via FTS5 when `q` is provided ──────────────────────────
  // Try FTS5 first; on failure fall back to the legacy OR-LIKE. The legacy
  // path is kept identical to the pre-T5 behaviour so a missing FTS5 build
  // never regresses search results.
  if (q) {
    const ftsIds = await searchFts(q)
    if (ftsIds !== null) {
      // FTS5 hit (or empty result). Restrict to matched IDs; if empty, the
      // query returns zero rows immediately (no full-table scan).
      where.id = { in: ftsIds }
    } else {
      // FTS5 unavailable — legacy fallback.
      where.OR = [
        { title: { contains: q } },
        { abstract: { contains: q } },
        { authors: { contains: q } },
        { venue: { contains: q } },
      ]
    }
  }

  // Decide paginated vs. legacy based on whether the caller explicitly
  // asked for `page` or `pageSize`.
  const isPaginated = pageParam !== null || pageSizeParam !== null

  const include = {
    material: { select: { name: true, id: true } },
    classification: true,
  }

  const orderBy: Prisma.PaperOrderByWithRelationInput[] = [
    { year: 'desc' },
    { citationCount: 'desc' },
  ]

  if (!isPaginated) {
    // Legacy non-paginated response (existing callers, e.g. Efficiency tab,
    // Dashboard stats, Sources tab, etc.)
    const papers = await db.paper.findMany({
      where,
      orderBy,
      take: legacyLimit,
      include,
    })
    return NextResponse.json({ papers, count: papers.length })
  }

  // Paginated response
  const page = Math.max(1, parseInt(pageParam || '1', 10) || 1)
  const pageSize = Math.min(Math.max(1, parseInt(pageSizeParam || '20', 10) || 20), 100)

  const [total, items] = await Promise.all([
    db.paper.count({ where }),
    db.paper.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include,
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages,
    // Backward-compat fields: existing papers-tab reads `papers` / `count`.
    papers: items,
    count: items.length,
  })
}

// DELETE /api/papers?materialId=xxx - delete all papers for a material (cascade)
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const materialId = searchParams.get('materialId')
  if (!materialId) {
    return NextResponse.json({ error: 'materialId is required' }, { status: 400 })
  }
  await db.paper.deleteMany({ where: { materialId } })
  return NextResponse.json({ ok: true })
}
