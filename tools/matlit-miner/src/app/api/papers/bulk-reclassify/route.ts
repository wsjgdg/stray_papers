import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classifyAbstract, getLLMConfigsFromHeaders } from '@/lib/llm'

// POST /api/papers/bulk-reclassify
// Body: { ids: string[] }
// Re-runs LLM classification on the specified papers.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { ids } = body as { ids?: string[] }

  // Configure LLM from request headers (openai-compatible backend).
  const configs = getLLMConfigsFromHeaders(req.headers)
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }

  const papers = await db.paper.findMany({
    where: { id: { in: ids } },
    include: { material: true, classification: true },
  })

  let processed = 0
  let errors = 0
  // Process in chunks of 4 with concurrency
  const CHUNK = 4
  for (let i = 0; i < papers.length; i += CHUNK) {
    const chunk = papers.slice(i, i + CHUNK)
    const results = await Promise.allSettled(
      chunk.map(async (p) => {
        const result = await classifyAbstract(p.abstract, p.material.name, undefined, configs)
        const toBool = (v: unknown) => v === true || v === 'true'
        const toStr = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''))
        if (p.classification) {
          await db.classification.update({
            where: { id: p.classification.id },
            data: {
              synthesized: result.synthesized,
              hasBandgap: toBool(result.hasBandgap),
              hasMethod: toBool(result.hasMethod),
              hasEfficiency: toBool(result.hasEfficiency),
              hasPhaseDiagram: toBool(result.hasPhaseDiagram),
              evidence: toStr(result.evidence).slice(0, 500),
              confidence: result.confidence,
              status: 'classified',
            },
          })
        } else {
          await db.classification.create({
            data: {
              paperId: p.id,
              materialId: p.materialId,
              synthesized: result.synthesized,
              hasBandgap: toBool(result.hasBandgap),
              hasMethod: toBool(result.hasMethod),
              hasEfficiency: toBool(result.hasEfficiency),
              hasPhaseDiagram: toBool(result.hasPhaseDiagram),
              evidence: toStr(result.evidence).slice(0, 500),
              confidence: result.confidence,
              status: 'classified',
              model: configs[0]?.model || 'gpt-4o-mini',
            },
          })
        }
      }),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') processed++
      else errors++
    }
  }

  return NextResponse.json({ processed, errors, total: papers.length })
}
