import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PUT /api/classification/[id]
// Manually edit a classification/extraction result.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const {
    synthesized,
    bandgapValue,
    synthesisMethod,
    conditions,
    phaseDiagramInfo,
    efficiencyValue,
    evidence,
    confidence,
    status,
  } = body

  const existing = await db.classification.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Classification not found' }, { status: 404 })
  }

  const updated = await db.classification.update({
    where: { id },
    data: {
      ...(synthesized !== undefined && { synthesized }),
      ...(bandgapValue !== undefined && { bandgapValue }),
      ...(synthesisMethod !== undefined && { synthesisMethod }),
      ...(conditions !== undefined && { conditions }),
      ...(phaseDiagramInfo !== undefined && { phaseDiagramInfo }),
      ...(efficiencyValue !== undefined && { efficiencyValue }),
      ...(evidence !== undefined && { evidence }),
      ...(confidence !== undefined && { confidence }),
      ...(status !== undefined && { status }),
    },
  })

  return NextResponse.json({ classification: updated })
}
