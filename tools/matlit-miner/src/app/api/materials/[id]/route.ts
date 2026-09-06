import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError } from '@/lib/api-error'
import { parseOr400, updateMaterialSchema } from '@/lib/schemas'

// PUT /api/materials/[id] - update
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = parseOr400(updateMaterialSchema, body)
  if (!parsed.ok) return parsed.response

  // Strip `undefined` keys so Prisma doesn't treat them as "no change".
  const data: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) data[k] = v
  }
  if (Object.keys(data).length === 0) {
    return apiError('No fields provided to update', 400)
  }
  try {
    const material = await db.material.update({ where: { id }, data })
    return NextResponse.json({ material })
  } catch (e) {
    return apiError('Failed to update material', 500, e)
  }
}

// DELETE /api/materials/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    await db.material.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError('Failed to delete material', 500, e)
  }
}
