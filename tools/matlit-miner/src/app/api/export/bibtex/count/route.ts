import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/export/bibtex/count
// Body: { materialId?, category?, synthOnly? }
// Returns the count of papers that would be exported with the given filters.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { materialId, category, synthOnly } = body

  const where: Record<string, unknown> = {}
  if (materialId) where.materialId = materialId
  if (category) where.material = { category }
  if (synthOnly) {
    where.classification = { synthesized: 'yes' }
  }

  const count = await db.paper.count({ where })
  return NextResponse.json({ count })
}
