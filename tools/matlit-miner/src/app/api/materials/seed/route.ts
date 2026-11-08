import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { seedMaterialsIfEmpty } from '@/lib/seed-data'
import { apiError } from '@/lib/api-error'

// POST /api/materials/seed - seed default 60 materials if empty
export async function POST() {
  try {
    const count = await seedMaterialsIfEmpty()
    const total = await db.material.count()
    return NextResponse.json({ seeded: count, total })
  } catch (e) {
    return apiError('Seed failed', 500, e)
  }
}
