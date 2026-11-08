import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/cache'
import { createMaterialSchema, parseOr400 } from '@/lib/schemas'
import { apiError } from '@/lib/api-error'

// GET /api/materials - list all materials (optionally filtered by category/tag)
// ?full=true includes nested papers/classifications/efficiencies/verifications
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const q = searchParams.get('q')
  const tag = searchParams.get('tag')
  const full = searchParams.get('full') === 'true'

  const where: Record<string, unknown> = {}
  if (category && category !== 'all') where.category = category
  if (q) {
    // Expand query with synonyms (Chinese ↔ English)
    const synonyms: Record<string, string[]> = {
      'perovskite': ['perovskite', '钙钛矿'],
      '钙钛矿': ['perovskite', '钙钛矿'],
      'chalcogenide': ['chalcogenide', '硫族'],
      'oxide': ['oxide', '氧化物'],
      '氧化物': ['oxide', '氧化物'],
    }
    const expanded = synonyms[q.toLowerCase()] || [q]
    where.OR = [
      ...expanded.flatMap(eq => [
        { name: { contains: eq } },
        { aliases: { contains: eq } },
        { notes: { contains: eq } },
        { category: { contains: eq } },
      ]),
    ]
  }
  // Tag filter: match materials whose tags field (semicolon-separated) contains the given tag
  if (tag && tag !== 'all') {
    // SQLite contains() is substring-based, so we match `;tag;` by wrapping
    // the stored tags in semicolons on both sides for exact-token match.
    // Prisma SQLite doesn't support REPLACE in where, so we fall back to
    // fetching all and filtering in JS (cheap because material count is ~60).
    const all = await db.material.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { papers: true, efficiencies: true, verifications: true },
        },
        ...(full
          ? {
              papers: { select: { doi: true, title: true }, take: 5 },
              classifications: {
                where: { synthesized: 'yes' },
                take: 1,
                orderBy: { confidence: 'desc' },
              },
              efficiencies: { orderBy: { efficiencyValue: 'desc' }, take: 1 },
              verifications: { take: 1, orderBy: { updatedAt: 'desc' } },
            }
          : {}),
      },
    })
    const tagToken = tag.trim().toLowerCase()
    const filtered = all.filter(m => {
      const tokens = (m.tags || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean)
      return tokens.includes(tagToken)
    })
    return NextResponse.json({ materials: filtered })
  }

  const materials = await db.material.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: {
      _count: {
        select: { papers: true, efficiencies: true, verifications: true },
      },
      ...(full
        ? {
            papers: {
              select: { doi: true, title: true },
              take: 5,
            },
            classifications: {
              where: { synthesized: 'yes' },
              take: 1,
              orderBy: { confidence: 'desc' },
            },
            efficiencies: {
              orderBy: { efficiencyValue: 'desc' },
              take: 1,
            },
            verifications: {
              take: 1,
              orderBy: { updatedAt: 'desc' },
            },
          }
        : {}),
    },
  })
  return NextResponse.json({ materials })
}

// POST /api/materials - create a new material
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parsed = parseOr400(createMaterialSchema, body)
  if (!parsed.ok) return parsed.response

  const { name, aliases, category, notes, tags } = parsed.data
  try {
    const material = await db.material.create({
      data: { name: name.trim(), aliases, category, notes, tags },
    })
    // New material changes coverage matrix and stats
    invalidate('stats:')
    invalidate('materials:')
    invalidate('coverage')
    return NextResponse.json({ material }, { status: 201 })
  } catch (e) {
    return apiError('Failed to create material', 500, e)
  }
}
