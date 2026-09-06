import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// POST /api/vlm/batch-phase-diagram
// Body: { materialId?: string, limit?: number }
// Automatically finds papers with OA URLs, fetches their figure sources,
// and runs VLM phase-diagram recognition on each.
// Returns results array.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { materialId, limit = 10 } = body

  const where: Record<string, unknown> = {
    doi: { not: '' },
    oaUrl: { not: '' },
  }
  if (materialId) where.materialId = materialId

  const papers = await db.paper.findMany({
    where,
    take: Math.min(limit, 20),
    select: {
      id: true,
      title: true,
      doi: true,
      oaUrl: true,
      materialId: true,
      material: { select: { name: true } },
    },
    orderBy: { citationCount: 'desc' },
  })

  if (papers.length === 0) {
    return NextResponse.json({ message: 'No papers with OA URLs found', results: [] })
  }

  const zai = await ZAI.create()
  const results: Array<{
    paperId: string
    title: string
    material: string
    imageUrl: string
    isPhaseDiagram: boolean
    confidence: number
    diagramType: string
    summary: string
    error?: string
  }> = []

  for (const paper of papers) {
    const imageUrl = paper.oaUrl
    try {
      const prompt = `You are a materials science expert. Analyze this image from a paper about ${paper.material.name}. Is this a phase diagram? Respond in JSON: {"isPhaseDiagram": true/false, "confidence": 0.0-1.0, "diagramType": "binary|ternary|P-T|T-x|other|not_a_diagram", "summary": "one sentence"}`

      const response = await zai.chat.completions.createVision({
        model: 'glm-4v',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      })

      const content = response.choices[0]?.message?.content || ''
      let parsed: { isPhaseDiagram?: boolean; confidence?: number; diagramType?: string; summary?: string } = {}
      try {
        let jsonStr = content.trim()
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
        }
        const first = jsonStr.indexOf('{')
        const last = jsonStr.lastIndexOf('}')
        if (first !== -1 && last !== -1) jsonStr = jsonStr.slice(first, last + 1)
        parsed = JSON.parse(jsonStr)
      } catch {
        parsed = { isPhaseDiagram: false, confidence: 0, diagramType: 'not_a_diagram', summary: 'Parse failed' }
      }

      results.push({
        paperId: paper.id,
        title: paper.title,
        material: paper.material.name,
        imageUrl,
        isPhaseDiagram: parsed.isPhaseDiagram || false,
        confidence: parsed.confidence || 0,
        diagramType: parsed.diagramType || 'not_a_diagram',
        summary: parsed.summary || '',
      })
    } catch (e) {
      results.push({
        paperId: paper.id,
        title: paper.title,
        material: paper.material.name,
        imageUrl,
        isPhaseDiagram: false,
        confidence: 0,
        diagramType: 'error',
        summary: '',
        error: (e as Error).message.slice(0, 100),
      })
    }
  }

  return NextResponse.json({ results, total: papers.length })
}
