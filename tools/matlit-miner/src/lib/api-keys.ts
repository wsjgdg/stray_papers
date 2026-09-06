// Server-side helper to extract API keys from request headers.
// The frontend sends keys via custom headers (x-s2-key, x-crossref-email, etc.)
// These are set by the api-client.ts wrapper when calling literature search APIs.

export interface ApiKeysConfig {
  semanticScholarKey: string
  crossrefEmail: string
  openalexEmail: string
  unpaywallEmail: string
}

/**
 * Extract API key configuration from request headers.
 * Returns empty strings if not provided (falls back to defaults).
 */
export function getApiKeysFromHeaders(req: Request): ApiKeysConfig {
  const headers = req.headers
  return {
    semanticScholarKey: headers.get('x-s2-key') || '',
    crossrefEmail: headers.get('x-crossref-email') || '',
    openalexEmail: headers.get('x-openalex-email') || '',
    unpaywallEmail: headers.get('x-unpaywall-email') || '',
  }
}

/**
 * Default API keys (used when user hasn't configured their own).
 */
export const DEFAULT_API_KEYS: ApiKeysConfig = {
  semanticScholarKey: '',
  crossrefEmail: 'research@example.com',
  openalexEmail: 'research@matlit.dev',
  unpaywallEmail: 'research@matlit.dev',
}

/**
 * Merge user-provided keys with defaults.
 */
export function mergeApiKeys(userKeys: Partial<ApiKeysConfig>): ApiKeysConfig {
  return {
    semanticScholarKey: userKeys.semanticScholarKey || DEFAULT_API_KEYS.semanticScholarKey,
    crossrefEmail: userKeys.crossrefEmail || DEFAULT_API_KEYS.crossrefEmail,
    openalexEmail: userKeys.openalexEmail || DEFAULT_API_KEYS.openalexEmail,
    unpaywallEmail: userKeys.unpaywallEmail || DEFAULT_API_KEYS.unpaywallEmail,
  }
}
