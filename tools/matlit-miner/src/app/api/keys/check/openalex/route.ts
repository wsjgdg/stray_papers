import { NextRequest, NextResponse } from 'next/server'

// GET /api/test/openalex
//
// Validates the OpenAlex entry in Settings. Same honest framing as CrossRef:
// OpenAlex has no key authentication, the email is a courtesy requirement.

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const email = (req.headers.get('x-openalex-email') ?? '').trim()

  const { probe, politeUA } = await import('@/lib/api-test')

  const result = await probe({
    label: 'OpenAlex',
    url: 'https://api.openalex.org/works?search=test&per-page=1&select=id',
    headers: {
      'User-Agent': politeUA(email),
      Accept: 'application/json',
    },
    okNote: email
      ? 'reached · email sent as User-Agent contact'
      : 'reached · no email set (OpenAlex has no key; an email only improves your rate limit)',
    interpret: (status) => {
      if (status === 429) return 'Rate limited (429). Try again shortly.'
      return undefined
    },
  })

  return NextResponse.json(result)
}
