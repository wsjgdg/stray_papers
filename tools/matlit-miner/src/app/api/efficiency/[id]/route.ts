import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/cache'
import { apiError, apiNotFound } from '@/lib/api-error'

// PUT /api/efficiency/[id] — update an existing efficiency record
// Body: { efficiencyValue?, certified?, source?, testConditions?, doi?, year?, notes? }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  try {
    const existing = await db.efficiency.findUnique({ where: { id } })
    if (!existing) {
      return apiNotFound('Efficiency record not found')
    }
    const data: Record<string, unknown> = {}
    if (typeof body.efficiencyValue === 'number') data.efficiencyValue = body.efficiencyValue
    if (typeof body.certified === 'boolean') data.certified = body.certified
    if (typeof body.source === 'string') data.source = body.source
    if (typeof body.testConditions === 'string') data.testConditions = body.testConditions
    if (typeof body.doi === 'string') data.doi = body.doi
    if (typeof body.year === 'number') data.year = body.year
    if (typeof body.notes === 'string') data.notes = body.notes
    const updated = await db.efficiency.update({ where: { id }, data })
    invalidate('stats:')
    return NextResponse.json(updated)
  } catch (e) {
    return apiError('Failed to update efficiency record', 500, e)
  }
}

// DELETE /api/efficiency/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    // Check existence first so we return 404 (not 500) for missing records.
    const existing = await db.efficiency.findUnique({ where: { id } })
    if (!existing) {
      return apiNotFound('Efficiency record not found')
    }
    await db.efficiency.delete({ where: { id } })
    invalidate('stats:')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError('Failed to delete efficiency record', 500, e)
  }
}
