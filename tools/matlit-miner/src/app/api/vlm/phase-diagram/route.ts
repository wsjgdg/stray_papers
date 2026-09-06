import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { apiError, apiBadRequest } from '@/lib/api-error'

// POST /api/vlm/phase-diagram
// Body: { imageUrl: string, materialName?: string }
// Uses VLM to analyze an image and determine if it's a phase diagram,
// and if so, extract key information (phases, temperature ranges, etc.)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { imageUrl, materialName } = body as { imageUrl?: string; materialName?: string }

  if (!imageUrl) {
    return apiBadRequest('imageUrl is required')
  }

  const zai = await ZAI.create()

  const prompt = `You are a materials science expert. Analyze this image from a scientific paper${materialName ? ` about ${materialName}` : ''}.

Determine if this image is a phase diagram (showing phase boundaries, temperature vs composition, Gibbs phase rule, etc.).

Respond in JSON format only:
{
  "isPhaseDiagram": true/false,
  "confidence": 0.0-1.0,
  "diagramType": "binary" | "ternary" | "P-T" | "T-x" | "other" | "not_a_diagram",
  "phases": ["list of phases identified, e.g. alpha, beta, liquid"],
  "temperatureRange": "e.g. 0-800°C or null if not applicable",
  "compositionRange": "e.g. 0-100 mol% or null if not applicable",
  "keyFeatures": ["brief description of key features like eutectic point, peritectic, miscibility gap, etc."],
  "summary": "one-sentence summary of what the diagram shows"
}

If the image is NOT a phase diagram, set isPhaseDiagram to false and diagramType to "not_a_diagram".`

  try {
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

    // Extract JSON from response
    let jsonStr = content.trim()
    // Remove markdown code fences
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
    }
    const first = jsonStr.indexOf('{')
    const last = jsonStr.lastIndexOf('}')
    if (first !== -1 && last !== -1) {
      jsonStr = jsonStr.slice(first, last + 1)
    }

    let result
    try {
      result = JSON.parse(jsonStr)
    } catch {
      result = {
        isPhaseDiagram: false,
        confidence: 0,
        diagramType: 'not_a_diagram',
        phases: [],
        summary: 'Could not parse VLM response',
        rawResponse: content.slice(0, 500),
      }
    }

    return NextResponse.json({ ok: true, imageUrl, materialName, ...result })
  } catch (e) {
    return apiError('VLM analysis failed', 500, e)
  }
}
