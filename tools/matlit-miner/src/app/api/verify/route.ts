import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/cache'

// GET /api/verify?materialId=xxx&status=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const materialId = searchParams.get('materialId')
  const status = searchParams.get('status')
  const where: Record<string, unknown> = {}
  if (materialId) where.materialId = materialId
  if (status) where.status = status
  const records = await db.verification.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { material: { select: { name: true, id: true } } },
  })
  return NextResponse.json({ records })
}

// POST /api/verify - create or update a verification record (one per material per status)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    materialId,
    status = 'pending',
    reviewer = 'anonymous',
    notes = '',
    checkedFields = '',
    doiChecked = '',
    project = 'default',
  } = body
  if (!materialId) {
    return NextResponse.json({ error: 'materialId is required' }, { status: 400 })
  }
  // Try to find an existing record for this material + project
  const existing = await db.verification.findFirst({
    where: { materialId, project },
    orderBy: { updatedAt: 'desc' },
  })
  let record
  if (existing) {
    record = await db.verification.update({
      where: { id: existing.id },
      data: { status, reviewer, notes, checkedFields, doiChecked, project },
    })
  } else {
    record = await db.verification.create({
      data: { materialId, status, reviewer, notes, checkedFields, doiChecked, project },
    })
  }
  // Verification status affects coverage & stats
  invalidate('stats:')
  invalidate('coverage')
  return NextResponse.json({ record }, { status: 201 })
}
