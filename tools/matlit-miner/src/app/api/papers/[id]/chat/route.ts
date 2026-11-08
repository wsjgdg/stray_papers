import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError, apiBadRequest, apiNotFound } from '@/lib/api-error'
import {
  callLLMWithFailover,
  getLLMConfigsFromHeaders,
  isLLMTimeoutError,
  QuotaExceededError,
} from '@/lib/llm'
import { rateLimit, getIdentifier, RATE_LIMITS } from '@/lib/rate-limit'

// POST /api/papers/[id]/chat
// Ask the LLM a question about a specific paper (its abstract + metadata).
// Body: { question: string }
// Returns: { answer: string, paperId: string }
//
// Headers:
//   x-llm-configs  — JSON array of LLMConfigEntry (multi-config failover).
//   x-llm-provider — legacy single-config header (fallback).
//
// Rate limited via the shared src/lib/rate-limit.ts module — 20 req/min per
// IP (single-instance deployment, adequate for abuse prevention).

// Chat is interactive — fail fast (30 s) instead of the default 60 s so the
// user gets feedback quickly when the provider is slow. We pass `retries: 0`
// to `callLLMWithFailover` so each config is tried at most once (matching
// the prior "no retry" behaviour). If the user has multiple configs in
// `x-llm-configs`, failover still applies — the next config is tried when
// the previous one errors or times out.
const CHAT_LLM_TIMEOUT_MS = 30_000

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // --- Rate limit (LLM interactive — 20/min per IP, shared lib) -----------
  const ip = getIdentifier(req)
  const rl = rateLimit(`chat:${ip}`, RATE_LIMITS.llm)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetAt: rl.resetAt },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    )
  }

  // --- Parse body ----------------------------------------------------------
  let body: { question?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return apiBadRequest('Invalid JSON body')
  }
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question) {
    return apiBadRequest('Question is required')
  }
  if (question.length > 2000) {
    return apiBadRequest('Question too long (max 2000 chars)')
  }

  // --- Fetch paper ---------------------------------------------------------
  const paper = await db.paper.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      abstract: true,
      authors: true,
      year: true,
      venue: true,
      doi: true,
      material: { select: { name: true } },
    },
  })
  if (!paper) {
    return apiNotFound('Paper not found')
  }

  // --- Build system prompt -------------------------------------------------
  const authorsList = paper.authors
    ? paper.authors
        .split(';')
        .map((a) => a.trim())
        .filter(Boolean)
        .join(', ')
    : 'Unknown'
  const systemPrompt =
    'You are a materials science research assistant. Answer questions about this paper based on its abstract and metadata. ' +
    "If the answer isn't in the provided info, say so.\n\n" +
    `Paper: ${paper.title}, ` +
    `Abstract: ${paper.abstract || '(no abstract available)'}, ` +
    `Authors: ${authorsList}, ` +
    `Year: ${paper.year ?? 'Unknown'}, ` +
    `Venue: ${paper.venue || 'Unknown'}` +
    (paper.doi ? `, DOI: ${paper.doi}` : '') +
    `, Material: ${paper.material.name}`

  // --- Call LLM ------------------------------------------------------------
  // The chat route uses `callLLMWithFailover` so it benefits from multi-config
  // failover (P3): if the primary LLM errors or times out, the next config
  // in `x-llm-configs` is tried. `retries: 0` per config preserves the prior
  // "no retry" stance — chat responses are user-initiated and the user can
  // simply re-ask if every config is briefly slow. The 30 s per-attempt
  // timeout means worst case = `configs.length * 30 s` wall-clock.
  try {
    const configs = getLLMConfigsFromHeaders(req.headers)
    const answer = await callLLMWithFailover(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      configs,
      { retries: 0, timeoutMs: CHAT_LLM_TIMEOUT_MS },
    )
    if (!answer.trim()) {
      return apiError('The AI did not return an answer. Please try again.', 502)
    }
    return NextResponse.json({ answer, paperId: paper.id })
  } catch (e) {
    // Quota exceeded (daily LLM budget per identifier) → 429.
    if (e instanceof QuotaExceededError) {
      return NextResponse.json(
        {
          error: 'Daily LLM quota exceeded',
          resetAt: e.resetAt,
        },
        { status: 429 },
      )
    }
    // Timeout → 504 Gateway Timeout (NOT 500) so clients can retry.
    if (isLLMTimeoutError(e)) {
      return apiError(e.message, 504, e)
    }
    return apiError('AI request failed', 500, e)
  }
}
