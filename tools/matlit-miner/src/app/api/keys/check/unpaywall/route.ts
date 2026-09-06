import { NextRequest, NextResponse } from 'next/server'

// GET /api/keys/check/unpaywall
//
// Validates the Unpaywall entry in Settings. Unlike CrossRef and OpenAlex,
// Unpaywall genuinely REQUIRES the email: it is a mandatory query parameter
// on every request, so a missing or malformed email produces a real 400.
// That makes this the one open-literature test that can meaningfully fail.
//
// A fixed, widely-indexed open-access DOI is used. It only needs to exist in
// Unpaywall's index; the test is about the request being accepted, not the
// DOI's content.

export const runtime = 'nodejs'

const TEST_DOI = '10.1038/nature12352'

export async function GET(req: NextRequest) {
  const email = (req.headers.get('x-unpaywall-email') ?? '').trim()

  const { probe } = await import('@/lib/api-test')

  const url = new URL(`https://api.unpaywall.org/v2/${encodeURIComponent(TEST_DOI)}`)
  if (email) url.searchParams.set('email', email)

  const result = await probe({
    label: 'Unpaywall',
    url: url.toString(),
    okNote: `reached · email accepted for DOI ${TEST_DOI}`,
    interpret: (status, bodyText) => {
      // Unpaywall answers with 422 (not 400) for email problems, and it
      // rejects RESERVED placeholder domains -- "researcher@example.com" is
      // refused, as is any of example.org / example.net / email.com. So the
      // distinction below is not cosmetic; a user following the obvious
      // example.com hint would otherwise hit this and be stuck.
      if (status === 400 || status === 422) {
        const t = bodyText.toLowerCase()
        if (t.includes('please use your own email')) {
          return 'Unpaywall rejects placeholder addresses (422). Use a real mailbox, e.g. you@yourdomain.com -- example.com and similar reserved domains are refused.'
        }
        if (t.includes('email address required')) {
          return 'Unpaywall requires an email on every request (422). Set one in Settings.'
        }
        return `Unpaywall rejected the request (HTTP ${status}). Check the email address.`
      }
      if (status === 401 || status === 403) {
        return 'Unpaywall rejected the request (401/403). Check the email parameter.'
      }
      if (status === 429) return 'Rate limited (429). Try again shortly.'
      if (status === 404) {
        return `DOI ${TEST_DOI} is not in Unpaywall's index (404). The API itself is reachable -- this is a data-side miss, not a configuration error.`
      }
      return undefined
    },
  })

  return NextResponse.json(result)
}
