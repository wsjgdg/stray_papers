import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { extractData, getLLMConfigsFromHeaders } from '@/lib/llm'

// POST /api/papers/[id]/reextract
// Force re-run LLM extraction on a single paper (creates classification if missing).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Configure LLM from request headers (openai-compatible backend).
  const configs = getLLMConfigsFromHeaders(req.headers)
  const paper = await db.paper.findUnique({
    where: { id },
    include: { material: true, classification: true },
  })
  if (!paper) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
  }

  const text = paper.abstract || paper.title
  const result = await extractData(text, paper.material.name, undefined, configs)

  // First ensure a classification row exists (so we can attach extraction data)
  let classification = paper.classification
  if (!classification) {
    classification = await db.classification.create({
      data: {
        paperId: paper.id,
        materialId: paper.materialId,
        synthesized: 'yes', // user-triggered reextract implies they believe it's synthesized
        status: 'classified',
        model: configs[0]?.model || 'gpt-4o-mini',
      },
    })
  }

  await db.classification.update({
    where: { id: classification.id },
    data: {
      bandgapValue: result.bandgapValue,
      synthesisMethod: result.synthesisMethod,
      conditions: result.conditions,
      phaseDiagramInfo: result.phaseDiagramInfo,
      efficiencyValue: result.efficiencyValue,
      evidence: result.evidence,
      confidence: result.confidence,
      status: 'extracted',
    },
  })

  return NextResponse.json({
    ok: true,
    paperId: paper.id,
    material: paper.material.name,
    ...result,
  })
}
