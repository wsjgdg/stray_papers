import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// GET /api/export/xlsx
// Export all aggregated results as an Excel file with formatted headers.
export async function GET() {
  const materials = await db.material.findMany({
    orderBy: { name: 'asc' },
    include: {
      papers: { select: { doi: true, title: true } },
      classifications: { where: { synthesized: 'yes' }, take: 1, orderBy: { confidence: 'desc' } },
      efficiencies: { orderBy: { efficiencyValue: 'desc' }, take: 1 },
      verifications: { take: 1, orderBy: { updatedAt: 'desc' } },
    },
  })

  const rows = materials.map((m) => {
    const cls = m.classifications[0]
    const eff = m.efficiencies[0]
    const ver = m.verifications[0]
    const primaryDoi = m.papers.find((p) => p.doi)?.doi || m.papers[0]?.doi || ''
    return {
      'Material': m.name,
      'Aliases': m.aliases,
      'Category': m.category,
      'Synthesized': cls?.synthesized || '',
      'Bandgap (eV)': cls?.bandgapValue || '',
      'Synthesis Method': cls?.synthesisMethod || '',
      'Conditions': cls?.conditions || '',
      'Phase Diagram Info': cls?.phaseDiagramInfo || '',
      'Max Efficiency (%)': eff?.efficiencyValue || '',
      'Efficiency Source': eff?.source || '',
      'Certified': eff?.certified ? 'Yes' : 'No',
      'Verification Status': ver?.status || 'pending',
      'Reviewer': ver?.reviewer || '',
      'Primary DOI': primaryDoi,
      'Evidence': cls?.evidence || '',
      'Confidence': cls ? (cls.confidence * 100).toFixed(0) + '%' : '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  // Set column widths
  ws['!cols'] = [
    { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
    { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 20 },
    { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'MatLit Results')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="matlit-results-${Date.now()}.xlsx"`,
    },
  })
}
