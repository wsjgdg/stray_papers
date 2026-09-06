import { NextRequest, NextResponse } from 'next/server'

// POST /api/keys/check/llm
//
// Validates the LLM entry the user is currently editing in Settings.
//
// Called by SettingsDialog.testLLM with the four legacy single-entry headers:
//   x-llm-provider  'openai' (the only supported backend now)
//   x-llm-baseurl   OpenAI-compatible base URL (must end in /v1)
//   x-llm-apikey    bearer key
//   x-llm-model     model id
//
// IMPORTANT — this route deliberately reads only the legacy single-entry
// headers and IGNORES `x-llm-configs`. src/lib/api-client.ts always injects
// `x-llm-configs` (every saved enabled config), and getLLMConfigsFromHeaders()
// prefers that header over the legacy ones. If this route used
// getLLMConfigsFromHeaders(), clicking Test on an unsaved draft would
// silently validate the already-saved config instead of the key the user just
// typed -- the exact thing this button is for.
//
// Response is always HTTP 200 with { ok, message }; see src/lib/api-test.ts.

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const baseURL = (req.headers.get('x-llm-baseurl') ?? '').trim()
  const apiKey = (req.headers.get('x-llm-apikey') ?? '').trim()
  const model = (req.headers.get('x-llm-model') ?? '').trim()

  if (!baseURL) {
    return NextResponse.json({ ok: false, message: 'Base URL is empty.' })
  }
  if (!apiKey) {
    return NextResponse.json({ ok: false, message: 'API key is empty.' })
  }

  const { probe, stripTrailingSlash } = await import('@/lib/api-test')

  // A real (tiny) completion is the honest test: it exercises the same
  // endpoint the app actually uses. max_tokens is deliberately omitted --
  // some OpenAI-compatible providers reject unknown parameters, which would
  // produce a misleading 400 on a perfectly good key. One prompt is the
  // price of a correct signal.
  const result = await probe({
    label: `LLM${model ? ` (${model})` : ''}`,
    url: `${stripTrailingSlash(baseURL)}/chat/completions`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: {
      ...(model ? { model } : {}),
      messages: [{ role: 'user', content: 'Reply with a single period.' }],
    },
    okNote: 'made a minimal chat/completions call',
    interpret: (status, bodyText) => {
      if (status === 401) return 'Invalid API key (401 Unauthorized).'
      if (status === 403) return 'API key rejected or lacks permission (403 Forbidden).'
      if (status === 404) {
        return `Endpoint not found at ${stripTrailingSlash(baseURL)}/chat/completions (404). Base URL should end in /v1, e.g. https://api.openai.com/v1.`
      }
      if (status === 402) return 'Billing not set up or out of credits (402).'
      if (status === 429) return 'Key is valid but rate limited / out of quota (429).'
      if (status === 400 && model && /model/i.test(bodyText)) {
        return `Model "${model}" is not available from this provider. Pick one from the model list.`
      }
      return undefined
    },
  })

  return NextResponse.json(result)
}
