import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createEfficiencySchema, parseOr400 } from '@/lib/schemas'

// GET /api/efficiency?materialId=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const materialId = searchParams.get('materialId')
  const where: Record<string, unknown> = {}
  if (materialId) where.materialId = materialId
  const records = await db.efficiency.findMany({
    where,
    orderBy: { efficiencyValue: 'desc' },
    include: { material: { select: { name: true, id: true } } },
  })
  return NextResponse.json({ records })
}

// POST /api/efficiency
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parsed = parseOr400(createEfficiencySchema, body)
  if (!parsed.ok) return parsed.response

  const {
    materialId,
    efficiencyValue,
    certified,
    source,
    sourceType,
    testConditions,
    doi,
    year,
    notes,
  } = parsed.data

  const record = await db.efficiency.create({
    data: {
      materialId,
      efficiencyValue,
      certified,
      source,
      sourceType,
      testConditions,
      doi,
      year: year ?? null,
      notes,
    },
  })
  return NextResponse.json({ record }, { status: 201 })
}
