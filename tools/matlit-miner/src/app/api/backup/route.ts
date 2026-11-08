import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/backup
// Export the entire database as a JSON backup file.
export async function GET() {
  const [materials, papers, classifications, efficiencies, verifications] = await Promise.all([
    db.material.findMany(),
    db.paper.findMany({ select: { id: true, materialId: true, title: true, year: true, doi: true, abstract: true, authors: true, venue: true, url: true, source: true, altSources: true, citationCount: true, oaUrl: true, oaStatus: true, createdAt: true } }),
    db.classification.findMany(),
    db.efficiency.findMany(),
    db.verification.findMany(),
  ])

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      materials: materials.length,
      papers: papers.length,
      classifications: classifications.length,
      efficiencies: efficiencies.length,
      verifications: verifications.length,
    },
    data: {
      materials,
      papers,
      classifications,
      efficiencies,
      verifications,
    },
  }

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="matlit-backup-${Date.now()}.json"`,
    },
  })
}
