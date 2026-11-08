import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { translatePaperText, getLLMConfigsFromHeaders } from '@/lib/llm'
import { detectLanguage } from '@/lib/language-detector'

// POST /api/papers/[id]/translate/batch
// Detects language for every paper; for non-English papers without an
// existing translation, runs the LLM translate step sequentially
// (1 at a time — LLM calls are expensive).
//
// Query params:
//   ?limit=20   - max papers to translate in one call (default 20, capped 50)
//   ?materialId=xxx  - restrict to a single material
//
// Response:
//   { translated, skipped, failed, totalScanned, details: [{ id, status, lang? }] }
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50)
  const materialId = url.searchParams.get('materialId') || undefined

  // Configure LLM from request headers (openai-compatible backend).
  const configs = getLLMConfigsFromHeaders(req.headers)

  // Find candidate papers: non-empty title, no existing translation
  const where: Record<string, unknown> = {
    translatedTitle: '',
  }
  if (materialId) where.materialId = materialId

  const papers = await db.paper.findMany({
    where,
    select: {
      id: true,
      title: true,
      abstract: true,
      originalLanguage: true,
    },
    take: limit * 4, // scan more because many will be English (skipped)
    orderBy: { createdAt: 'desc' },
  })

  const details: Array<{ id: string; status: 'translated' | 'skipped' | 'failed'; lang?: string; error?: string }> = []
  let translated = 0
  let skipped = 0
  let failed = 0

  for (const p of papers) {
    if (translated >= limit) break

    const combined = `${p.title}\n${p.abstract}`
    const lang = detectLanguage(combined)

    if (lang === 'en') {
      skipped++
      // Record language as English so we don't re-scan
      if (p.originalLanguage !== 'en') {
        await db.paper.update({
          where: { id: p.id },
          data: { originalLanguage: 'en' },
        })
      }
      details.push({ id: p.id, status: 'skipped', lang: 'en' })
      continue
    }

    // Non-English: translate via LLM (sequential — 1 at a time)
    try {
      const translation = await translatePaperText(p.title, p.abstract, lang, undefined, configs)
      await db.paper.update({
        where: { id: p.id },
        data: {
          originalLanguage: lang,
          translatedTitle: translation.title,
          translatedAbstract: translation.abstract,
        },
      })
      translated++
      details.push({ id: p.id, status: 'translated', lang })
    } catch (e) {
      failed++
      details.push({
        id: p.id,
        status: 'failed',
        lang,
        error: (e as Error).message.slice(0, 120),
      })
      // Still record the detected language for next time
      try {
        await db.paper.update({
          where: { id: p.id },
          data: { originalLanguage: lang },
        })
      } catch (e) {
        // Best-effort metadata write on the failure path — log so we
        // notice if Prisma itself is also down (not just translation).
        console.warn('[papers/translate/batch] failed to record detected language:', e)
      }
    }
  }

  return NextResponse.json({
    translated,
    skipped,
    failed,
    totalScanned: papers.length,
    details,
  })
}
