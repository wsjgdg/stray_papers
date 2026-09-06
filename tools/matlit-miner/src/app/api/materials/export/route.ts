import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/materials/export
// Download all materials as a CSV file.
export async function GET() {
  const materials = await db.material.findMany({
    orderBy: { name: 'asc' },
    select: { name: true, aliases: true, category: true, notes: true },
  })

  const headers = ['material_name', 'aliases', 'category', 'notes']
  const escape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`
    }
    return v
  }
  const rows = materials.map(m =>
    [escape(m.name), escape(m.aliases), escape(m.category), escape(m.notes)].join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="matlit-materials-${Date.now()}.csv"`,
    },
  })
}
