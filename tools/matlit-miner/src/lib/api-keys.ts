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
 *
 * The contact email used for polite-pool APIs (Crossref / OpenAlex /
 * Unpaywall) can be overridden via the `CONTACT_EMAIL` server env var; it
 * otherwise falls back to a generic placeholder. Set it to a real, monitored
 * address in production so API providers can reach you about rate limits.
 */
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'research@example.com'

export const DEFAULT_API_KEYS: ApiKeysConfig = {
  semanticScholarKey: '',
  crossrefEmail: CONTACT_EMAIL,
  openalexEmail: CONTACT_EMAIL,
  unpaywallEmail: CONTACT_EMAIL,
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
