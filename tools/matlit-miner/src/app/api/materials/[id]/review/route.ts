import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'
import {
  callLLMWithFailover,
  getLLMConfigsFromHeaders,
  type LLMConfigEntry,
} from '@/lib/llm'

// GET /api/materials/[id]/review
//
// Generates a 3-paragraph AI literature review for a material by feeding its
// papers (title, abstract, year) + classifications (synthesized, bandgap,
// method, efficiency) into the LLM. The LLM call goes through
// `callLLMWithFailover` (P3), so multi-config failover + exponential
// backoff + Retry-After honoring apply automatically when the request
// carries `x-llm-configs` (P1's api-client).
//
// The review is structured as:
//   1. Research progress (key findings, trends).
//   2. Synthesis & properties (methods, bandgap, efficiency).
//   3. Outlook (challenges, opportunities).
//
// The result is cached in memory for 1 hour per material id. If the LLM call
// fails (rate-limit, network, etc.) or returns nothing matching the expected
// section headings, a deterministic fallback summary is compiled from the
// fetched data so the UI always has something to show.
//
// Query params:
//   ?refresh=1  — bypass the cache and force a fresh LLM call.
//
// Headers:
//   x-llm-configs  — JSON array of LLMConfigEntry (multi-config failover).
//   x-llm-provider — legacy single-config header (fallback).
//
// Response:
//   {
//     review: string,            // 3-paragraph markdown-ish text
//     generatedAt: string,       // ISO timestamp
//     paperCount: number,        // number of papers used
//     source: 'llm' | 'fallback' // whether the LLM produced it
//   }

const REVIEW_TTL_MS = 60 * 60 * 1000 // 1 hour

interface ReviewData {
  materialName: string
  papers: Array<{ title: string; year: number | null; abstract: string }>
  classifications: Array<{
    synthesized: string
    bandgapValue: string
    synthesisMethod: string
    efficiencyValue: string
    confidence: number
  }>
}

/**
 * Fetch everything we need to write a review for `materialId`.
 * Per-paper abstracts are capped to keep LLM prompts bounded.
 */
async function fetchReviewData(materialId: string): Promise<ReviewData | null> {
  const material = await db.material.findUnique({
    where: { id: materialId },
    include: {
      papers: {
        orderBy: { year: 'desc' },
        select: {
          title: true,
          year: true,
          abstract: true,
        },
      },
      classifications: {
        select: {
          synthesized: true,
          bandgapValue: true,
          synthesisMethod: true,
          efficiencyValue: true,
          confidence: true,
        },
      },
    },
  })
  if (!material) return null
  return {
    materialName: material.name,
    papers: material.papers.map((p) => ({
      title: p.title,
      year: p.year,
      abstract: (p.abstract || '').slice(0, 800),
    })),
    classifications: material.classifications.map((c) => ({
      synthesized: c.synthesized,
      bandgapValue: c.bandgapValue,
      synthesisMethod: c.synthesisMethod,
      efficiencyValue: c.efficiencyValue,
      confidence: c.confidence,
    })),
  }
}

/**
 * Compile a deterministic non-LLM summary from the fetched data.
 * Used when the LLM call fails or returns nothing useful.
 */
function buildFallbackReview(data: ReviewData): string {
  const { materialName, papers, classifications } = data
  const synth = classifications.filter((c) => c.synthesized === 'yes').length
  const bandgaps = classifications
    .map((c) => parseFloat(c.bandgapValue))
    .filter((n) => Number.isFinite(n))
  const methods = classifications
    .map((c) => c.synthesisMethod)
    .filter(Boolean)
  const effs = classifications
    .map((c) => parseFloat(c.efficiencyValue))
    .filter((n) => Number.isFinite(n))
  const years = papers.map((p) => p.year).filter((y): y is number => y !== null)
  const yearRange =
    years.length > 0 ? `${Math.min(...years)}–${Math.max(...years)}` : 'n/a'

  const bgText =
    bandgaps.length > 0
      ? `Reported bandgap values cluster around ${Math.min(...bandgaps).toFixed(2)}–${Math.max(...bandgaps).toFixed(2)} eV (n=${bandgaps.length}).`
      : 'No bandgap values have been extracted from the literature so far.'
  const effText =
    effs.length > 0
      ? `Reported device efficiencies range from ${Math.min(...effs).toFixed(2)}% to ${Math.max(...effs).toFixed(2)}% (n=${effs.length}).`
      : 'No device efficiencies have been reported yet.'
  const methodText =
    methods.length > 0
      ? `Synthesis routes mentioned include: ${Array.from(new Set(methods)).slice(0, 5).join(', ')}.`
      : 'No specific synthesis methods have been catalogued yet.'

  return [
    `## Research progress\n\nThis entry covers ${materialName}, for which ${papers.length} paper(s) are currently indexed in MatLit Miner (publication years: ${yearRange}). Of these, ${synth} paper(s) were judged by the LLM classifier as reporting experimental synthesis of ${materialName}. ${bgText}`,
    `## Synthesis & properties\n\n${methodText} ${effText} The data above was extracted automatically from paper abstracts via the LLM extraction pipeline; values should be considered approximate pending human verification.`,
    `## Outlook\n\nThe current corpus for ${materialName} is ${papers.length < 5 ? 'sparse' : 'moderate'} in size. Priority next steps: (1) expand the paper search to capture under-represented synthesis routes; (2) run extraction jobs to fill in missing bandgap / efficiency cells; (3) flag the highest-confidence records for human verification. New researchers entering this area should focus on the gaps highlighted above.`,
  ].join('\n\n')
}

/**
 * Build the LLM prompt and call the LLM via `callLLMWithFailover` (P3), which
 * handles multi-config failover + exponential backoff + Retry-After honoring
 * transparently. The prompt asks for a strict 3-paragraph Markdown response
 * with fixed section headings.
 *
 * `configs` is the failover list (typically from `getLLMConfigsFromHeaders`).
 * When omitted, `callLLMWithFailover` would throw — so callers MUST supply
 * at least one entry (the route handler always does, defaulting to the
 * server env OpenAI config).
 */
async function generateLLMReview(
  data: ReviewData,
  configs: LLMConfigEntry[],
): Promise<string> {
  const paperLines = data.papers
    .slice(0, 30) // cap papers sent to the LLM to keep the prompt bounded
    .map((p, i) => {
      const yr = p.year ? ` (${p.year})` : ''
      const abs = p.abstract ? ` — ${p.abstract}` : ''
      return `${i + 1}. ${p.title}${yr}${abs}`
    })
    .join('\n')

  const clLines = data.classifications
    .slice(0, 20)
    .map((c, i) => {
      const parts: string[] = [`#${i + 1}`]
      parts.push(`synth=${c.synthesized}`)
      if (c.bandgapValue) parts.push(`Eg=${c.bandgapValue}eV`)
      if (c.synthesisMethod) parts.push(`method=${c.synthesisMethod}`)
      if (c.efficiencyValue) parts.push(`η=${c.efficiencyValue}%`)
      parts.push(`conf=${c.confidence.toFixed(2)}`)
      return parts.join(' ')
    })
    .join('\n')

  const prompt = `You are a senior materials-science researcher writing a concise literature review for the material "${data.materialName}".

Below is the corpus of papers and structured classification/extraction data currently indexed in MatLit Miner for this material.

=== Papers (title, year, abstract) ===
${paperLines || '(no papers indexed yet)'}

=== Structured extraction (per-paper) ===
${clLines || '(no extractions yet)'}

Write a 3-paragraph review in Markdown. Each paragraph MUST start with one of these exact headings on its own line:

## Research progress
## Synthesis & properties
## Outlook

Paragraph 1 (Research progress): summarise the key findings and trends from the papers above. Cite by [year] inline when relevant. If there are few papers, acknowledge the gap rather than fabricating citations.

Paragraph 2 (Synthesis & properties): describe the synthesis methods, bandgap values, and device efficiencies present in the extraction data. Quote numbers verbatim. If a field is missing, say so explicitly.

Paragraph 3 (Outlook): list 2-3 concrete challenges and 2-3 concrete opportunities for future research on this material, grounded in the corpus above.

Keep the entire review under 600 words. Plain Markdown only — no HTML, no tables. Do not output anything before "## Research progress" or after the Outlook paragraph.`

  return callLLMWithFailover(
    [
      {
        role: 'system',
        content:
          'You are a precise materials-science literature review assistant. Always answer in Markdown with the exact section headings requested.',
      },
      { role: 'user', content: prompt },
    ],
    configs,
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Read multi-config failover list from headers (P3). Read once outside the
  // cache callback so a cache HIT doesn't re-parse the header (cheap, but
  // avoids any chance of the callback running with a stale closure).
  const configs = getLLMConfigsFromHeaders(req.headers)

  // Bypass cache when ?refresh=1 is supplied (manual "Regenerate" action).
  const refresh = new URL(req.url).searchParams.get('refresh') === '1'
  const cacheKey = `review:${id}`

  const result = await getOrSet(
    refresh ? `review:${id}:${Date.now()}` : cacheKey,
    REVIEW_TTL_MS,
    async () => {
      const data = await fetchReviewData(id)
      if (!data) {
        return { notFound: true } as const
      }

      let review = ''
      let source: 'llm' | 'fallback' = 'fallback'
      try {
        const text = await generateLLMReview(data, configs)
        // Accept the LLM output only if it contains at least one of the
        // expected section headings — otherwise fall back.
        if (text && /##\s*(Research progress|Synthesis|Outlook)/i.test(text)) {
          review = text.trim()
          source = 'llm'
        }
      } catch (e) {
        // Swallow — we'll use the fallback below, but log the LLM failure
        // so degraded quality doesn't go unnoticed in production.
        console.warn('[review] LLM review generation failed, using fallback:', e)
      }

      if (!review) {
        review = buildFallbackReview(data)
        source = 'fallback'
      }

      return {
        review,
        generatedAt: new Date().toISOString(),
        paperCount: data.papers.length,
        source,
      }
    },
  )

  if ('notFound' in result && result.notFound) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  return NextResponse.json(result)
}
