import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { translatePaperText, getLLMConfigsFromHeaders } from '@/lib/llm'
import { detectLanguage } from '@/lib/language-detector'
import { invalidate } from '@/lib/cache'

// POST /api/papers/translate
// Batch-translate non-English papers' titles + abstracts into English
// via the LLM. Hard-capped at 20 papers per call so a single request
// can't burn through the entire daily quota.
//
// Body: { paperIds: string[] }
//
// Skips:
//   - unknown paper IDs (returned as `failed` with reason "not_found")
//   - papers whose detected language is English (counted as `skipped`)
//   - papers that already have BOTH translatedTitle + translatedAbstract
//     (counted as `skipped` with reason "already_translated")
//
// Response:
//   {
//     translated: number,
//     skipped: number,
//     failed: number,
//     total: number,
//     details: Array<{ id: string; status: 'translated' | 'skipped' | 'failed'; lang?: string; reason?: string }>
//   }

const MAX_PER_CALL = 20

type Detail = {
  id: string
  status: 'translated' | 'skipped' | 'failed'
  lang?: string
  reason?: string
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const paperIds: unknown = body.paperIds

  if (!Array.isArray(paperIds) || paperIds.length === 0) {
    return NextResponse.json(
      { error: '`paperIds` must be a non-empty array of paper IDs' },
      { status: 400 },
    )
  }

  // De-duplicate + hard-cap so callers can't blow through the LLM quota
  // in a single request.
  const uniqueIds = Array.from(new Set(paperIds.map(String))).slice(0, MAX_PER_CALL)

  // Configure LLM from request headers (falls back to the server env OpenAI
  // config when none supplied).
  const configs = getLLMConfigsFromHeaders(req.headers)

  // Fetch all candidate papers in one query.
  const papers = await db.paper.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      title: true,
      abstract: true,
      originalLanguage: true,
      translatedTitle: true,
      translatedAbstract: true,
    },
  })

  // Maintain the order of `uniqueIds` so the caller can correlate
  // details back to their request.
  const byId = new Map(papers.map((p) => [p.id, p]))

  const details: Detail[] = []
  let translated = 0
  let skipped = 0
  let failed = 0

  for (const id of uniqueIds) {
    const p = byId.get(id)
    if (!p) {
      failed++
      details.push({ id, status: 'failed', reason: 'not_found' })
      continue
    }

    // (1) Already translated? Skip the LLM call entirely.
    if (p.translatedTitle && p.translatedAbstract) {
      skipped++
      details.push({
        id,
        status: 'skipped',
        reason: 'already_translated',
        lang: p.originalLanguage || undefined,
      })
      continue
    }

    // (2) Detect language (or use the previously-detected value).
    const combined = `${p.title}\n${p.abstract}`
    const detected = p.originalLanguage && p.originalLanguage !== ''
      ? p.originalLanguage
      : detectLanguage(combined)

    if (detected === 'en') {
      // English paper — record language and skip.
      if (p.originalLanguage !== 'en') {
        await db.paper.update({
          where: { id },
          data: { originalLanguage: 'en' },
        }).catch(() => { /* ignore — best-effort */ })
      }
      skipped++
      details.push({ id, status: 'skipped', reason: 'english', lang: 'en' })
      continue
    }

    // (3) Non-English paper — call the LLM.
    try {
      const translation = await translatePaperText(p.title, p.abstract, detected, undefined, configs)
      await db.paper.update({
        where: { id },
        data: {
          originalLanguage: detected,
          translatedTitle: translation.title,
          translatedAbstract: translation.abstract,
        },
      })
      translated++
      details.push({ id, status: 'translated', lang: detected })
    } catch (e) {
      failed++
      // Still record the detected language so we don't re-detect next time.
      try {
        await db.paper.update({
          where: { id },
          data: { originalLanguage: detected },
        })
      } catch (e) {
        // Best-effort metadata write on the failure path — log so we
        // notice if Prisma itself is also down (not just translation).
        console.warn('[papers/translate] failed to record detected language:', e)
      }
      details.push({
        id,
        status: 'failed',
        lang: detected,
        reason: (e as Error).message.slice(0, 120),
      })
    }
  }

  // Invalidate cached aggregates since translated titles may surface in
  // search / stats queries.
  invalidate('stats:')
  invalidate('citations:')

  return NextResponse.json({
    translated,
    skipped,
    failed,
    total: uniqueIds.length,
    requested: paperIds.length,
    capped: paperIds.length > MAX_PER_CALL,
    details,
  })
}
