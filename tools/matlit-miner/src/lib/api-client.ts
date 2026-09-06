// Lightweight fetch wrappers used by the client.
// All endpoints are relative paths so they go through the Next.js dev server.

import {
  loadConfig,
  getEnabledLLMConfigs,
  getEnabledSearchConfigs,
  type LLMConfigEntry,
  type SearchConfigEntry,
  type SearchConfigType,
} from './config-store'

/**
 * Return LLM-related request headers derived from the user's multi-config.
 *
 * Sends TWO things in parallel, for backward compatibility with the existing
 * backend (P2/P3 will switch to reading `x-llm-configs` exclusively):
 *
 *   1. The legacy single-value headers, populated from the FIRST enabled
 *      LLM config (sorted by priority):
 *        x-llm-provider, x-llm-baseurl, x-llm-apikey, x-llm-model
 *      These are what `src/lib/llm.ts` and the existing API routes read
 *      today, so all current callers keep working unchanged.
 *
 *   2. `x-llm-configs`: a JSON array of ALL enabled LLM configs (sorted by
 *      priority). Each element carries `{ id, label, provider, baseURL,
 *      apiKey, model, priority }`. P3 will read this header to implement
 *      failover: if the first config returns an error, try the next, etc.
 *
 * Returns an empty object on SSR or when no LLM config is enabled.
 */
export function getLLMHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const enabled = getEnabledLLMConfigs()
    if (enabled.length === 0) return {}
    const first = enabled[0]
    const headers: Record<string, string> = {
      'x-llm-provider': first.provider,
    }
    if (first.baseURL) headers['x-llm-baseurl'] = first.baseURL
    if (first.apiKey) headers['x-llm-apikey'] = first.apiKey
    if (first.model) headers['x-llm-model'] = first.model
    // Full ordered list for backend failover (consumed by P3).
    headers['x-llm-configs'] = JSON.stringify(
      enabled.map((c) => ({
        id: c.id,
        label: c.label,
        provider: c.provider,
        baseURL: c.baseURL,
        apiKey: c.apiKey,
        model: c.model,
        priority: c.priority,
      })),
    )
    return headers
  } catch {
    return {}
  }
}

/**
 * Return the ordered list of enabled LLM configs for callers that need to
 * iterate them directly (without going through headers) — e.g. the PDF
 * upload path that builds a `FormData` request and wants the LLM headers
 * attached without forcing a default `Content-Type: application/json`.
 *
 * Sorted by priority (lower = tried first).
 */
export function getLLMConfigsForRequest(): LLMConfigEntry[] {
  if (typeof window === 'undefined') return []
  return getEnabledLLMConfigs()
}

/**
 * Read user-configured search-API keys + LLM config from the multi-config
 * store and return them as request headers.
 *
 * Search APIs (s2 / crossref / openalex / unpaywall): sends BOTH the legacy
 * single-value headers (populated from the FIRST enabled config of each type)
 * AND the new `x-search-configs` JSON array (containing ALL enabled search
 * configs across all 4 types, sorted by priority). The backend (R3) reads
 * the array to implement multi-key failover: if the first key for a source
 * returns an error, try the next enabled key, etc. The legacy single-key
 * headers are kept so older routes / out-of-scope code that only reads
 * `x-s2-key` / `x-crossref-email` keep working unchanged.
 *
 * Unpaywall: when no Unpaywall-specific config exists, the Crossref email
 * list is mirrored into the Unpaywall slot (matches the legacy behavior).
 *
 * LLM: delegates to `getLLMHeaders()` (legacy single-value headers from the
 * first enabled config + new `x-llm-configs` array for failover).
 */
export function getApiKeyHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    // Touch the store once so any pending migration from the legacy
    // `matlit-api-keys` format runs before we read.
    loadConfig()
    const headers: Record<string, string> = {}

    // Collect ALL enabled search configs across all 4 types, sorted by
    // priority (lower = tried first). The backend groups by `type` and
    // iterates each group in priority order for multi-key failover.
    const allSearch: SearchConfigEntry[] = [
      ...getEnabledSearchConfigs('s2'),
      ...getEnabledSearchConfigs('crossref'),
      ...getEnabledSearchConfigs('openalex'),
      ...getEnabledSearchConfigs('unpaywall'),
    ].sort((a, b) => a.priority - b.priority)

    if (allSearch.length > 0) {
      headers['x-search-configs'] = JSON.stringify(
        allSearch.map((c) => ({
          id: c.id,
          label: c.label,
          type: c.type,
          key: c.key,
          priority: c.priority,
        })),
      )
    }

    // Legacy single-value headers (populated from the FIRST enabled config
    // of each type) — kept for backward compat with routes that haven't
    // migrated to reading `x-search-configs` yet.
    const firstKey = (type: SearchConfigType): string => {
      const list = getEnabledSearchConfigs(type)
      return list.length > 0 ? list[0].key : ''
    }
    const s2 = firstKey('s2')
    if (s2) headers['x-s2-key'] = s2
    const crossref = firstKey('crossref')
    if (crossref) headers['x-crossref-email'] = crossref
    const openalex = firstKey('openalex')
    if (openalex) headers['x-openalex-email'] = openalex
    const unpaywall = firstKey('unpaywall')
    // Unpaywall uses the same email as Crossref by default if not configured.
    if (unpaywall) headers['x-unpaywall-email'] = unpaywall
    else if (crossref) headers['x-unpaywall-email'] = crossref

    // LLM headers (legacy single-config + new x-llm-configs array).
    Object.assign(headers, getLLMHeaders())
    return headers
  } catch {
    return {}
  }
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getApiKeyHeaders(),
      ...(init?.headers ?? {}),
    },
  })
  const text = await resp.text()
  let json: unknown = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = text
    }
  }
  if (!resp.ok) {
    const msg =
      (json && typeof json === 'object' && 'error' in json
        ? String((json as { error: unknown }).error)
        : `HTTP ${resp.status}`) || `HTTP ${resp.status}`
    throw new Error(msg)
  }
  return json as T
}

export function doiUrl(doi: string) {
  if (!doi) return ''
  if (doi.startsWith('http')) return doi
  return `https://doi.org/${doi}`
}
