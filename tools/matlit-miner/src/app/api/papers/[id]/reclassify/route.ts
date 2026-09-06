import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classifyAbstract, getLLMConfigsFromHeaders } from '@/lib/llm'

// POST /api/papers/[id]/reclassify
// Force re-run LLM classification on a single paper.
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

  const result = await classifyAbstract(paper.abstract, paper.material.name, undefined, configs)

  const toBool = (v: unknown) => v === true || v === 'true'
  const toStr = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''))

  let classification = paper.classification
  if (!classification) {
    classification = await db.classification.create({
      data: {
        paperId: paper.id,
        materialId: paper.materialId,
        synthesized: result.synthesized,
        hasBandgap: toBool(result.hasBandgap),
        hasMethod: toBool(result.hasMethod),
        hasEfficiency: toBool(result.hasEfficiency),
        hasPhaseDiagram: toBool(result.hasPhaseDiagram),
        evidence: toStr(result.evidence).slice(0, 500),
        confidence: result.confidence,
        status: 'classified',
        model: 'glm-4-flash',
      },
    })
  } else {
    await db.classification.update({
      where: { id: classification.id },
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
  }

  return NextResponse.json({
    ok: true,
    paperId: paper.id,
    material: paper.material.name,
    synthesized: result.synthesized,
    hasBandgap: result.hasBandgap,
    hasMethod: result.hasMethod,
    hasEfficiency: result.hasEfficiency,
    hasPhaseDiagram: result.hasPhaseDiagram,
    evidence: result.evidence,
    confidence: result.confidence,
  })
}
