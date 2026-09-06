import { NextRequest, NextResponse } from 'next/server'

// POST /api/llm/models
//
// Fetches the list of available chat models from an LLM provider.
//
// Why POST (not GET): the endpoint accepts an `apiKey` in the request body.
// Passing secrets as URL query params would leak them into server logs,
// browser history, and referrer headers. POST keeps them in the body.
//
// Body:
//   { provider: 'openai', baseURL?: string, apiKey?: string }
//
// Response (always 200 with the payload — error info is in `error`):
//   { models: Array<{ id: string, label?: string }>, error?: string }
//
// Notes:
//   - We hit `${baseURL}/models` with `Authorization: Bearer ${apiKey}`
//     (OpenAI-compatible /v1/models). The trailing `/v1` is part of
//     `baseURL` per OpenAI convention (e.g. https://api.openai.com/v1),
//     so we just append `/models`.
//   - We filter the OpenAI response to chat models only (exclude embedding
//     / tts / whisper / dall-e / moderation). A model is kept if its id
//     contains one of the known chat-family substrings (gpt, claude, glm,
//     qwen, deepseek, o1, o3, llama, mistral, gemini, etc.).
//   - Timeout: 5 s (per task spec). Uses AbortController so the fetch is
//     actually cancelled, not just abandoned.
//   - Error handling: 401 (bad key), 404 (wrong baseURL), timeout, network
//     error all return `{ models: [], error: 'message' }` with HTTP 200 so
//     the client can render the error uniformly.

export const runtime = 'nodejs'
// Models list rarely changes — but the user's API key may, so we don't cache
// at the route level. The client caches the result in component state.

const FETCH_TIMEOUT_MS = 5_000

/**
 * Substrings that identify a chat-completion model in an OpenAI-compatible
 * `/v1/models` response. Used to filter out embedding / tts / whisper /
 * dall-e / moderation / audio models that the chat UI cannot use.
 */
const CHAT_MODEL_HINTS = [
  'gpt',
  'claude',
  'glm',
  'qwen',
  'deepseek',
  'o1',
  'o3',
  'o4',
  'llama',
  'mistral',
  'mixtral',
  'gemini',
  'yi',
  'moonshot',
  'kimi',
  'baichuan',
  'chat',
  'instruct',
  'dialog',
]

/** Model id substrings that indicate a NON-chat model — filtered out. */
const EXCLUDE_HINTS = [
  'embed',
  'tts',
  'whisper',
  'dall-e',
  'davinci',
  'babbage',
  'moderation',
  'audio',
  'realtime',
  'image',
  'vision-preview',
]

interface OpenAIModel {
  id: string
  owned_by?: string
}

interface OpenAIModelsResponse {
  data?: OpenAIModel[]
}

function isChatModel(id: string): boolean {
  const lower = id.toLowerCase()
  if (EXCLUDE_HINTS.some((h) => lower.includes(h))) return false
  return CHAT_MODEL_HINTS.some((h) => lower.includes(h))
}

/** Normalise a baseURL: strip trailing slashes so we can safely append `/models`. */
function joinModelsURL(baseURL: string): string {
  const trimmed = baseURL.replace(/\/+$/, '')
  return `${trimmed}/models`
}

/** Friendly label for known model families (purely cosmetic in the dropdown). */
function labelFor(id: string): string | undefined {
  const lower = id.toLowerCase()
  if (lower.startsWith('gpt-4o-mini')) return 'GPT-4o mini (fast, cheap)'
  if (lower.startsWith('gpt-4o')) return 'GPT-4o (multimodal)'
  if (lower.startsWith('gpt-4-turbo')) return 'GPT-4 Turbo'
  if (lower.startsWith('gpt-4')) return 'GPT-4'
  if (lower.startsWith('gpt-3.5')) return 'GPT-3.5 Turbo (legacy)'
  if (lower.startsWith('o1')) return 'o1 reasoning'
  if (lower.startsWith('o3')) return 'o3 reasoning'
  if (lower.startsWith('o4')) return 'o4 reasoning'
  if (lower.startsWith('claude-3-5-sonnet')) return 'Claude 3.5 Sonnet'
  if (lower.startsWith('claude-3-5-haiku')) return 'Claude 3.5 Haiku'
  if (lower.startsWith('claude-3-opus')) return 'Claude 3 Opus'
  if (lower.startsWith('claude-3-sonnet')) return 'Claude 3 Sonnet'
  if (lower.startsWith('claude-3-haiku')) return 'Claude 3 Haiku'
  if (lower.startsWith('glm-4v')) return 'GLM-4V (vision)'
  if (lower.startsWith('glm-4-flash')) return 'GLM-4 Flash (fast, free)'
  if (lower.startsWith('glm-4-long')) return 'GLM-4 Long (long context)'
  if (lower.startsWith('glm-4')) return 'GLM-4'
  if (lower.startsWith('deepseek')) return 'DeepSeek'
  if (lower.startsWith('qwen')) return 'Qwen'
  return undefined
}

async function fetchOpenAIModels(
  baseURL: string,
  apiKey: string,
): Promise<{ models: Array<{ id: string; label?: string }>; error?: string }> {
  if (!baseURL) {
    return { models: [], error: 'Base URL is required for OpenAI provider' }
  }
  if (!apiKey) {
    return { models: [], error: 'API key is required for OpenAI provider' }
  }

  const url = joinModelsURL(baseURL)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    })

    if (resp.status === 401) {
      return { models: [], error: 'Invalid API key (401 Unauthorized)' }
    }
    if (resp.status === 403) {
      return { models: [], error: 'API key lacks permission to list models (403 Forbidden)' }
    }
    if (resp.status === 404) {
      return { models: [], error: `Models endpoint not found at ${url} (404). Check the Base URL.` }
    }
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return {
        models: [],
        error: `Provider returned HTTP ${resp.status}${txt ? `: ${txt.slice(0, 160)}` : ''}`,
      }
    }

    const json = (await resp.json()) as OpenAIModelsResponse
    const data = Array.isArray(json?.data) ? json.data : []
    const models = data
      .map((m) => m?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .filter(isChatModel)
      .sort((a, b) => a.localeCompare(b))
      .map((id) => ({ id, label: labelFor(id) }))

    if (models.length === 0) {
      return {
        models: [],
        error: 'Provider returned no chat models (only embedding/tts/whisper found)',
      }
    }
    return { models }
  } catch (e) {
    const err = e as Error
    // AbortError comes from our 5s timeout.
    if (err.name === 'AbortError') {
      return { models: [], error: `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s` }
    }
    const msg = err.message || 'Network error'
    if (
      msg.includes('ENOTFOUND') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('fetch failed')
    ) {
      return {
        models: [],
        error: `Cannot reach ${url}. Verify the Base URL and network. (${msg.slice(0, 120)})`,
      }
    }
    return { models: [], error: msg.slice(0, 200) }
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req: NextRequest) {
  let body: {
    provider?: string
    baseURL?: string
    apiKey?: string
  } = {}

  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { models: [], error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  // Only OpenAI-compatible providers are supported.
  const baseURL = (body.baseURL ?? '').trim()
  const apiKey = (body.apiKey ?? '').trim()

  const result = await fetchOpenAIModels(baseURL, apiKey)
  // Always 200 — error info lives in the `error` field so the client can
  // render a uniform error message regardless of cause.
  return NextResponse.json(result)
}
