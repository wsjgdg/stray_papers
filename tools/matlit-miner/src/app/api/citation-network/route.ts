import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'

// GET /api/citation-network?materialId=xxx&limit=50
// Returns nodes (papers) and edges (citation links) for a force-directed graph.
// Since we don't store explicit citation relationships between papers in our DB,
// we build a co-material network: papers sharing the same material are linked,
// and papers are grouped by material. This visualizes the research landscape.
//
// Cached for 5 minutes (relatively expensive graph build, rarely changes).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const materialId = searchParams.get('materialId')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)

  // Cache key includes materialId + limit so different views don't collide
  const cacheKey = `citation-network:${materialId || 'all'}:${limit}`

  const data = await getOrSet(
    cacheKey,
    5 * 60_000,
    async () => {
      const where: Record<string, unknown> = {}
      if (materialId) where.materialId = materialId

      const papers = await db.paper.findMany({
        where,
        take: limit,
        select: {
          id: true,
          title: true,
          year: true,
          doi: true,
          citationCount: true,
          source: true,
          materialId: true,
          material: { select: { name: true, category: true } },
        },
        orderBy: { citationCount: 'desc' },
      })

      // Nodes: one per paper
      const nodes = papers.map((p) => ({
        id: p.id,
        label: p.title.length > 60 ? p.title.slice(0, 57) + '…' : p.title,
        year: p.year,
        citations: p.citationCount,
        source: p.source,
        material: p.material.name,
        category: p.material.category,
        doi: p.doi,
        group: p.materialId,
      }))

      // Edges: connect papers that share the same material
      const byMaterial = new Map<string, typeof papers>()
      for (const p of papers) {
        const arr = byMaterial.get(p.materialId) || []
        arr.push(p)
        byMaterial.set(p.materialId, arr)
      }

      const edges: Array<{ source: string; target: string; weight: number }> = []
      for (const [, group] of byMaterial) {
        for (let i = 0; i < group.length; i++) {
          if (i < group.length - 1) {
            edges.push({ source: group[i].id, target: group[i + 1].id, weight: 1 })
          }
          if (i < group.length - 2) {
            edges.push({ source: group[i].id, target: group[i + 2].id, weight: 0.5 })
          }
        }
      }

      return {
        nodes,
        links: edges,
        materialCount: byMaterial.size,
        paperCount: papers.length,
      }
    },
  )

  return NextResponse.json(data)
}
