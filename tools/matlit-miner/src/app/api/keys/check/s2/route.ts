import { NextRequest, NextResponse } from 'next/server'

// GET /api/keys/check/s2
//
// Validates the Semantic Scholar entry in Settings. The key is optional --
// unauthenticated requests are rate-limited hard, so a missing key usually
// shows up as 429 rather than a clean failure.
//
// Reads the legacy single-entry header `x-s2-key` and deliberately ignores
// the auto-injected `x-search-configs` for the same reason
// src/app/api/keys/check/llm/route.ts does: this button must validate the draft
// entry, not the saved one.

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const apiKey = (req.headers.get('x-s2-key') ?? '').trim()

  const { probe } = await import('@/lib/api-test')

  const result = await probe({
    label: 'Semantic Scholar',
    url: 'https://api.semanticscholar.org/graph/v1/paper/search?query=test&limit=1&fields=title',
    headers: {
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      Accept: 'application/json',
    },
    okNote: apiKey
      ? 'key accepted'
      : 'reached without a key (S2 permits this but rate-limits aggressively)',
    interpret: (status) => {
      if (status === 401 || status === 403) {
        return 'Invalid API key (401/403). Double-check it -- S2 keys come from https://www.semanticscholar.org/product/api.'
      }
      if (status === 429) {
        return apiKey
          ? 'Rate limited (429). Key looks valid but you have hit S2\'s quota.'
          : 'Rate limited (429). S2 throttles unauthenticated traffic; add an API key to raise the limit.'
      }
      return undefined
    },
  })

  return NextResponse.json(result)
}
