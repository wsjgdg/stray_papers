import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sanitizePaperText } from '@/lib/text-sanitizer'
import { invalidate } from '@/lib/cache'
import { titleSimilarity } from '@/lib/dedup'

// POST /api/papers/sanitize
// One-time cleanup that:
//  1. Sanitizes HTML entities / inline markup in existing paper titles + abstracts
//  2. Deduplicates papers within each material (merging sources, keeping richest record)
//
// Body: { dryRun?: boolean }
// Returns: { sanitized: number, dedupedMerged: number, totalScanned: number }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as { dryRun?: boolean }))
  const dryRun = body?.dryRun === true

  // 1. Sanitize all paper titles and abstracts
  const allPapers = await db.paper.findMany({
    select: { id: true, title: true, abstract: true, materialId: true, doi: true },
  })
  let sanitized = 0
  for (const p of allPapers) {
    const cleanTitle = sanitizePaperText(p.title)
    const cleanAbstract = p.abstract ? sanitizePaperText(p.abstract) : ''
    const titleChanged = cleanTitle !== p.title
    const abstractChanged = cleanAbstract !== p.abstract
    if (titleChanged || abstractChanged) {
      sanitized++
      if (!dryRun) {
        await db.paper.update({
          where: { id: p.id },
          data: {
            ...(titleChanged && { title: cleanTitle }),
            ...(abstractChanged && { abstract: cleanAbstract }),
          },
        })
      }
    }
  }

  // 2. Within each material, find duplicates by title similarity and merge
  const materialIds = Array.from(new Set(allPapers.map(p => p.materialId)))
  let dedupedMerged = 0
  for (const materialId of materialIds) {
    const mats = await db.paper.findMany({
      where: { materialId },
      select: { id: true, title: true, doi: true, source: true, altSources: true, abstract: true, oaUrl: true, oaStatus: true, citationCount: true },
      orderBy: { createdAt: 'asc' },
    })
    const processed = new Set<string>()
    for (let i = 0; i < mats.length; i++) {
      const base = mats[i]
      if (processed.has(base.id)) continue
      const dupes: typeof mats = []
      for (let j = i + 1; j < mats.length; j++) {
        const cand = mats[j]
        if (processed.has(cand.id)) continue
        const isDup =
          (base.doi && cand.doi && base.doi.toLowerCase() === cand.doi.toLowerCase()) ||
          (base.title && cand.title && titleSimilarity(base.title, cand.title) >= 0.85)
        if (isDup) {
          dupes.push(cand)
          processed.add(cand.id)
        }
      }
      if (dupes.length > 0) {
        dedupedMerged += dupes.length
        if (!dryRun) {
          for (const d of dupes) {
            const existingAlts = base.altSources ? base.altSources.split(';').filter(Boolean) : []
            const baseSources = new Set([base.source, ...existingAlts])
            const dupeSources = [d.source, ...(d.altSources ? d.altSources.split(';').filter(Boolean) : [])]
            const newAlts = dupeSources.filter(s => !baseSources.has(s))
            const mergedAlts = [...existingAlts, ...newAlts].join(';')
            const mergedAbstract = base.abstract || d.abstract
            const mergedOaUrl = base.oaUrl || d.oaUrl
            const mergedOaStatus = base.oaStatus || d.oaStatus
            const mergedDoi = base.doi || d.doi
            const mergedCitations = Math.max(base.citationCount, d.citationCount)
            await db.paper.update({
              where: { id: base.id },
              data: {
                altSources: mergedAlts,
                abstract: mergedAbstract,
                oaUrl: mergedOaUrl,
                oaStatus: mergedOaStatus,
                doi: mergedDoi,
                citationCount: mergedCitations,
              },
            })
            base.altSources = mergedAlts
            base.abstract = mergedAbstract
            base.oaUrl = mergedOaUrl
            base.oaStatus = mergedOaStatus
            base.doi = mergedDoi
            base.citationCount = mergedCitations
            // Move any classification pointing to dupe to point to base
            await db.classification.updateMany({ where: { paperId: d.id }, data: { paperId: base.id } })
            await db.paper.delete({ where: { id: d.id } })
          }
        }
      }
    }
  }

  if (!dryRun) {
    invalidate('stats:')
    invalidate('citations:')
    invalidate('coverage')
  }

  return NextResponse.json({
    sanitized,
    dedupedMerged,
    totalScanned: allPapers.length,
    dryRun,
  })
}
