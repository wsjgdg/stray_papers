import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'
import {
  TEMPLATES,
  getTemplate,
  buildExtractionPrompt,
  coerceFieldValue,
  type ExtractionTemplate,
} from '@/lib/extraction-templates'

// POST /api/extract/template
// Body: { materialId?: string, templateId: string, paperIds?: string[] }
// Runs template-driven structured extraction across a set of papers using
// the LLM. Returns one row per paper with the template's fields populated.
//
// Caching: results are cached per (templateId + sorted paperIds) for 1h.
// Limits: max 20 papers per call (LLM cost control).

const MAX_PAPERS = 20
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

type FieldValue = number | string | boolean | null
type RowData = Record<string, FieldValue>

interface TemplateResult {
  paperId: string
  title: string
  year: number | null
  doi: string
  materialId: string
  materialName: string
  data: RowData
}

interface ResponseShape {
  templateId: string
  templateName: string
  results: TemplateResult[]
  cached: boolean
}

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null
async function getZai() {
  if (!_zai) _zai = await ZAI.create()
  return _zai
}

/**
 * Call the LLM with simple retry/backoff for transient errors.
 * Mirrors the helper in src/lib/llm.ts without modifying that file.
 */
async function callLLM(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  retries = 3,
): Promise<string> {
  const zai = await getZai()
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: 'disabled' },
      })
      return completion.choices[0]?.message?.content || ''
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
      if (!isTransient || attempt === retries) break
      const wait = 1500 * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('LLM call failed')
}

function stripJsonFence(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim()
  }
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1)
  }
  return t
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stripJsonFence(text)) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Run template extraction on a single paper. On hard failure every field is
 * set to null so the table still renders the row (with "—" cells).
 */
async function extractPaper(
  template: ExtractionTemplate,
  paper: { id: string; title: string; abstract: string },
): Promise<RowData> {
  const prompt = buildExtractionPrompt(template, paper.title, paper.abstract)
  const data: RowData = {}
  try {
    const content = await callLLM([
      {
        role: 'assistant',
        content:
          'You are a precise materials-science data extraction assistant. Always output strict JSON only.',
      },
      { role: 'user', content: prompt },
    ])
    const parsed = safeParse(content)
    for (const field of template.fields) {
      data[field.key] = parsed ? coerceFieldValue(field, parsed[field.key]) : null
    }
  } catch {
    for (const field of template.fields) data[field.key] = null
  }
  return data
}

/** Stable hash of the paper-id list so identical requests hit cache. */
function hashPaperIds(ids: string[]): string {
  return [...ids].sort().join('|')
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { materialId, templateId, paperIds } = body as {
    materialId?: string
    templateId?: string
    paperIds?: string[]
  }

  if (!templateId) {
    return NextResponse.json(
      { error: 'templateId is required' },
      { status: 400 },
    )
  }
  const template = getTemplate(templateId)
  if (!template) {
    return NextResponse.json(
      {
        error: `Unknown templateId "${templateId}". Available: ${TEMPLATES.map((t) => t.id).join(', ')}`,
      },
      { status: 400 },
    )
  }
  // Bind to a non-null const so the type narrows for closures below.
  const tmpl: ExtractionTemplate = template

  // Resolve the paper set.
  let papers: Array<{
    id: string
    title: string
    abstract: string
    year: number | null
    doi: string
    material: { name: string; id: string }
  }>

  if (paperIds && Array.isArray(paperIds) && paperIds.length > 0) {
    const ids = paperIds.slice(0, MAX_PAPERS)
    const found = await db.paper.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        abstract: true,
        year: true,
        doi: true,
        material: { select: { name: true, id: true } },
      },
    })
    // Preserve caller's order.
    const byId = new Map(found.map((p) => [p.id, p]))
    papers = ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
  } else {
    // No explicit paperIds — pull from the DB by material (or all, capped at 30).
    const cap = 30
    const where: Record<string, unknown> = {}
    if (materialId) where.materialId = materialId
    const candidates = await db.paper.findMany({
      where,
      orderBy: [{ citationCount: 'desc' }, { year: 'desc' }],
      take: cap,
      select: {
        id: true,
        title: true,
        abstract: true,
        year: true,
        doi: true,
        material: { select: { name: true, id: true } },
      },
    })
    // Prefer papers that actually have abstracts (more useful for LLM extraction).
    papers = candidates
      .sort((a, b) => (b.abstract?.length ?? 0) - (a.abstract?.length ?? 0))
      .slice(0, MAX_PAPERS)
  }

  if (papers.length === 0) {
    return NextResponse.json(
      {
        templateId,
        templateName: template.name,
        results: [],
        cached: false,
        message: 'No papers found for the given scope.',
      },
      { status: 200 },
    )
  }

  const cacheKey = `extract:template:${templateId}:${hashPaperIds(papers.map((p) => p.id))}`

  const result = await getOrSet<ResponseShape>(
    cacheKey,
    CACHE_TTL_MS,
    async () => {
      // Concurrency: 3 parallel LLM calls keeps latency reasonable without
      // hammering the rate limit.
      const CONCURRENCY = 3
      const results: TemplateResult[] = new Array(papers.length)
      let idx = 0
      async function worker() {
        while (idx < papers.length) {
          const i = idx++
          const p = papers[i]
          const data = await extractPaper(tmpl, {
            id: p.id,
            title: p.title,
            abstract: p.abstract,
          })
          results[i] = {
            paperId: p.id,
            title: p.title,
            year: p.year,
            doi: p.doi,
            materialId: p.material.id,
            materialName: p.material.name,
            data,
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, papers.length) }, () => worker()),
      )
      return {
        templateId,
        templateName: template.name,
        results,
        cached: false,
      }
    },
  )

  // Mark cache hits so the UI can show a "from cache" badge.
  return NextResponse.json({ ...result, cached: true })
}
