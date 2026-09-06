import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/verify/batch
// Body: { materialIds: string[], status: 'verified' | 'flagged' | 'rejected', reviewer?: string }
// Batch-update verification status for multiple materials.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { materialIds, status = 'verified', reviewer = 'batch' } = body as {
    materialIds?: string[]
    status?: string
    reviewer?: string
  }

  if (!Array.isArray(materialIds) || materialIds.length === 0) {
    return NextResponse.json({ error: 'materialIds array is required' }, { status: 400 })
  }

  if (!['verified', 'flagged', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  let updated = 0
  for (const materialId of materialIds) {
    const existing = await db.verification.findFirst({
      where: { materialId },
      orderBy: { updatedAt: 'desc' },
    })
    if (existing) {
      await db.verification.update({
        where: { id: existing.id },
        data: { status, reviewer, notes: existing.notes || `Batch ${status} by ${reviewer}` },
      })
    } else {
      await db.verification.create({
        data: { materialId, status, reviewer, notes: `Batch ${status} by ${reviewer}` },
      })
    }
    updated++
  }

  return NextResponse.json({ updated, total: materialIds.length })
}
