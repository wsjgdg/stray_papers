import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/papers/[id]/figures
// Fetches figure/image URLs for a paper from OpenAlex (which provides figure URLs via its API).
// This allows the VLM phase-diagram recognition to work without manual URL input.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const paper = await db.paper.findUnique({
    where: { id },
    select: { id: true, doi: true, title: true, oaUrl: true, source: true },
  })

  if (!paper) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
  }

  const figures: Array<{ url: string; source: string; description?: string }> = []

  // 1. Try OpenAlex to get figure URLs
  if (paper.doi) {
    try {
      const oaResp = await fetch(
        `https://api.openalex.org/works/doi:${encodeURIComponent(paper.doi)}?select=id,doi,title,open_access,best_oa_location,primary_location&mailto=research@matlit.dev`,
        { headers: { 'User-Agent': 'MatLitMiner/1.0 (mailto:research@matlit.dev)' } },
      )
      if (oaResp.ok) {
        const oaData = await oaResp.json()
        // OpenAlex sometimes provides figure URLs in the open_access or best_oa_location
        const bestOa = oaData.best_oa_location
        if (bestOa?.pdf_url) {
          figures.push({ url: bestOa.pdf_url, source: 'openalex_pdf', description: 'Open access PDF' })
        }
        if (bestOa?.landing_page_url) {
          figures.push({ url: bestOa.landing_page_url, source: 'openalex_landing', description: 'Publisher landing page' })
        }
      }
    } catch (e) {
      // External 3rd-party API — failures are usually transient (rate
      // limits, missing DOI, network). Log so a totally broken OpenAlex
      // integration doesn't silently degrade figure discovery.
      console.warn('[papers/figures] OpenAlex lookup failed:', e)
    }
  }

  // 2. Try Unpaywall for OA PDF
  if (paper.doi && figures.length === 0) {
    try {
      const unpaywallResp = await fetch(
        `https://api.unpaywall.org/v2/${encodeURIComponent(paper.doi)}?email=research@matlit.dev`,
        { headers: { 'User-Agent': 'MatLitMiner/1.0' } },
      )
      if (unpaywallResp.ok) {
        const upData = await unpaywallResp.json()
        if (upData.best_oa_location?.url_for_pdf) {
          figures.push({ url: upData.best_oa_location.url_for_pdf, source: 'unpaywall_pdf', description: 'OA PDF via Unpaywall' })
        }
        // Also check all OA locations for figure-like URLs
        if (upData.oa_locations) {
          for (const loc of upData.oa_locations.slice(0, 3)) {
            if (loc.url_for_pdf && !figures.find((f) => f.url === loc.url_for_pdf)) {
              figures.push({ url: loc.url_for_pdf, source: 'unpaywall_alt', description: `OA PDF (${loc.host_type || 'repository'})` })
            }
          }
        }
      }
    } catch (e) {
      // External 3rd-party API — failures are usually transient (rate
      // limits, missing DOI, network). Log so a totally broken Unpaywall
      // integration doesn't silently degrade figure discovery.
      console.warn('[papers/figures] Unpaywall lookup failed:', e)
    }
  }

  // 3. Include stored OA URL from our database
  if (paper.oaUrl) {
    if (!figures.find((f) => f.url === paper.oaUrl)) {
      figures.push({ url: paper.oaUrl, source: 'stored_oa', description: 'Stored OA URL' })
    }
  }

  return NextResponse.json({
    paperId: paper.id,
    title: paper.title,
    doi: paper.doi,
    figures,
    note: figures.length === 0
      ? 'No open-access figures found. You can manually provide an image URL below.'
      : `${figures.length} potential figure/PDF source(s) found. Click one to analyze with VLM.`,
  })
}
