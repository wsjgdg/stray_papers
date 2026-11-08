import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiBadRequest } from '@/lib/api-error'

// GET /api/proxy/pdf?url=<encoded pdf url>
// Same as /api/proxy but specifically for PDFs — adds Content-Disposition: inline
// so the browser displays the PDF in the iframe instead of forcing a download.
const FETCH_TIMEOUT_MS = 15_000

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url')
  if (!urlParam) {
    return apiBadRequest('Missing "url" query parameter')
  }

  let target: URL
  try {
    target = new URL(urlParam)
  } catch {
    return apiBadRequest('Invalid url parameter')
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return apiBadRequest('Only http(s) URLs are allowed')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/pdf,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (!upstream.ok) {
      return apiError(`Upstream responded ${upstream.status}`, 502)
    }

    const contentType =
      (upstream.headers.get('content-type') || '')
        .toLowerCase()
        .split(';')[0]
        .trim() || 'application/pdf'

    // Reject obviously non-PDF content types
    if (!contentType.includes('pdf') && contentType !== 'application/octet-stream') {
      return apiError(`Upstream is not a PDF (content-type: ${contentType})`, 415)
    }

    const body = await upstream.arrayBuffer()

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.toLowerCase().includes('abort')) {
      return apiError('Upstream fetch timed out', 504)
    }
    return apiError('Proxy fetch failed', 502, err)
  } finally {
    clearTimeout(timer)
  }
}
