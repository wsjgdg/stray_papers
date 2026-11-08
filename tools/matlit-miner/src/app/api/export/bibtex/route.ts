import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/export/bibtex
// Query params: ?materialId=xxx&category=perovskite&synthOnly=true
// Export papers (optionally filtered) as a BibTeX file.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const materialId = searchParams.get('materialId')
  const category = searchParams.get('category')
  const synthOnly = searchParams.get('synthOnly') === 'true'

  const where: Record<string, unknown> = {}
  if (materialId) where.materialId = materialId
  if (category) where.material = { category }
  if (synthOnly) {
    where.classification = { synthesized: 'yes' }
  }

  const papers = await db.paper.findMany({
    where,
    orderBy: [{ year: 'desc' }, { title: 'asc' }],
    include: { material: { select: { name: true } } },
  })

  const entries: string[] = []
  const seenKeys = new Set<string>()

  const escapeBibtex = (s: string) => s.replace(/[&%$#_{}~^\\]/g, '').replace(/\s+/g, ' ').trim()
  const makeKey = (authors: string, year: number | null, title: string) => {
    const firstAuthor = (authors.split(';')[0] || 'anon').split(',').map(s => s.trim())[0] || 'anon'
    const surname = firstAuthor.split(' ').pop()?.toLowerCase() || 'anon'
    const firstWord = (title.split(/\s+/)[0] || 'paper').toLowerCase().replace(/[^a-z]/g, '')
    let key = `${surname}${year ?? 'XXXX'}${firstWord}`
    let i = 2
    while (seenKeys.has(key)) {
      key = `${surname}${year ?? 'XXXX'}${firstWord}${i}`
      i++
    }
    seenKeys.add(key)
    return key
  }

  for (const p of papers) {
    const year = p.year ?? ''
    const authors = p.authors
      ? p.authors.split(';').map(a => a.trim()).filter(Boolean).join(' and ')
      : 'Anonymous'
    const title = escapeBibtex(p.title) || 'Untitled'
    const key = makeKey(p.authors, p.year, p.title)
    const doi = p.doi ? `\n  doi = {${p.doi}},` : ''
    const url = p.url ? `\n  url = {${p.url}},` : (p.doi ? `\n  url = {https://doi.org/${p.doi}},` : '')
    const venue = p.venue ? `\n  journal = {${escapeBibtex(p.venue)}},` : ''
    const note = `\n  note = {Retrieved via MatLit Miner for material: ${p.material.name}},`

    entries.push(`@article{${key},
  author = {${authors}},
  title = {{${title}}},${venue}
  year = {${year}},${doi}${url}${note}
}`)
  }

  const filterDesc = [
    materialId ? 'material-filtered' : '',
    category ? `cat-${category}` : '',
    synthOnly ? 'synth-only' : '',
  ].filter(Boolean).join('-')
  const filename = filterDesc ? `matlit-papers-${filterDesc}-${Date.now()}.bib` : `matlit-papers-${Date.now()}.bib`
  const bibtex = `% MatLit Miner BibTeX export\n% Generated: ${new Date().toISOString()}\n% Total entries: ${entries.length}\n${filterDesc ? `% Filter: ${filterDesc}\n` : ''}\n${entries.join('\n\n')}\n`

  return new NextResponse(bibtex, {
    headers: {
      'Content-Type': 'application/x-bibtex; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
