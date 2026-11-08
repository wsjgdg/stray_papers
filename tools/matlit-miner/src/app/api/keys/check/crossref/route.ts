import { NextRequest, NextResponse } from 'next/server'

// GET /api/keys/check/crossref
//
// Validates the CrossRef entry in Settings.
//
// Honest framing: CrossRef has NO key-based authentication. The email is a
// courtesy requirement (polite pool / contact policy) that only affects
// rate limiting, so this test can never really "fail" because of a bad key.
// It reports reachability plus whether the email is well-formed.

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const email = (req.headers.get('x-crossref-email') ?? '').trim()

  const { probe, politeUA } = await import('@/lib/api-test')

  const result = await probe({
    label: 'CrossRef',
    url: 'https://api.crossref.org/works?query=test&rows=1&select=DOI',
    headers: {
      'User-Agent': politeUA(email),
      Accept: 'application/json',
    },
    okNote: email
      ? `reached · email sent as User-Agent contact`
      : 'reached · no email set (CrossRef has no key; an email only improves your rate limit)',
    interpret: (status) => {
      if (status === 429) return 'Rate limited (429). Try again shortly.'
      if (status === 400) {
        return 'CrossRef rejected the request (400). This usually means the email was parsed as malformed in the User-Agent.'
      }
      return undefined
    },
  })

  return NextResponse.json(result)
}
