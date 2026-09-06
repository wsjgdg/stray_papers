import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  translatePaperText,
  getLLMConfigsFromHeaders,
  isLLMTimeoutError,
} from '@/lib/llm'
import { detectLanguage, languageLabel } from '@/lib/language-detector'
import { apiError, apiNotFound } from '@/lib/api-error'

// POST /api/papers/[id]/translate
// Detects the paper's language; if non-English, uses the LLM to translate
// the title + abstract into English and persists the result.
//
// Headers (optional): x-llm-provider, x-llm-baseurl, x-llm-apikey, x-llm-model
//
// Response:
//   { skipped: true, reason: 'already English' }   // when paper is in English
//   { originalLanguage, translatedTitle, translatedAbstract }   // on success
//   { error: string }                                // on failure (status 500)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Configure LLM from request headers (falls back to the server env OpenAI config)
  const configs = getLLMConfigsFromHeaders(req.headers)

  const paper = await db.paper.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      abstract: true,
      originalLanguage: true,
      translatedTitle: true,
      translatedAbstract: true,
    },
  })

  if (!paper) {
    return apiNotFound('Paper not found')
  }

  // Detect language from title + abstract combined
  const combined = `${paper.title}\n${paper.abstract}`
  const detected = detectLanguage(combined)

  // Persist the detected language even if we skip translation
  if (detected !== 'en' && paper.originalLanguage !== detected) {
    await db.paper.update({
      where: { id },
      data: { originalLanguage: detected },
    })
  } else if (detected === 'en' && !paper.originalLanguage) {
    await db.paper.update({
      where: { id },
      data: { originalLanguage: 'en' },
    })
  }

  if (detected === 'en') {
    return NextResponse.json({
      skipped: true,
      reason: 'already English',
      originalLanguage: 'en',
    })
  }

  // If we already have a translation, just return it
  if (paper.translatedTitle && paper.translatedAbstract) {
    return NextResponse.json({
      originalLanguage: detected,
      translatedTitle: paper.translatedTitle,
      translatedAbstract: paper.translatedAbstract,
      cached: true,
    })
  }

  try {
    const translation = await translatePaperText(
      paper.title,
      paper.abstract,
      detected,
      undefined,
      configs,
    )
    await db.paper.update({
      where: { id },
      data: {
        originalLanguage: detected,
        translatedTitle: translation.title,
        translatedAbstract: translation.abstract,
      },
    })

    return NextResponse.json({
      originalLanguage: detected,
      originalLanguageLabel: languageLabel(detected),
      translatedTitle: translation.title,
      translatedAbstract: translation.abstract,
    })
  } catch (e) {
    // Timeout → 504 Gateway Timeout (NOT 500) so clients can retry.
    if (isLLMTimeoutError(e)) {
      return apiError(e.message, 504, e)
    }
    return apiError('Translation failed', 500, e)
  }
}
