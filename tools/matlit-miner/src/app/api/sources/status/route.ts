import { NextResponse } from 'next/server'
import { getCrossrefBreakerStatus } from '@/lib/crossref'
import { getS2BreakerStatus } from '@/lib/semantic-scholar'
import { getOpenAlexBreakerStatus } from '@/lib/openalex'

// GET /api/sources/status
// Observable snapshot of all external API circuit breakers.
// Returns crossref + s2 + openalex breaker states.
const RESET_TIMEOUT_MS = 60_000

function formatBreaker(status: ReturnType<typeof getCrossrefBreakerStatus>) {
  const now = Date.now()
  const retryInSec =
    status.state === 'open' && status.lastFailureAt > 0
      ? Math.max(0, Math.ceil((RESET_TIMEOUT_MS - (now - status.lastFailureAt)) / 1000))
      : 0
  return {
    state: status.state,
    consecutiveFailures: status.consecutiveFailures,
    lastFailureAt: status.lastFailureAt,
    retryInSec,
  }
}

export async function GET() {
  return NextResponse.json({
    crossref: formatBreaker(getCrossrefBreakerStatus()),
    s2: formatBreaker(getS2BreakerStatus()),
    openalex: formatBreaker(getOpenAlexBreakerStatus()),
  })
}
