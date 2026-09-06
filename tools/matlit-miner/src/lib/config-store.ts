// Multi-config storage for LLM and Search API providers.
//
// Replaces the old single-config `matlit-api-keys` format with a richer
// multi-config model: users can register multiple OpenAI-compatible LLM
// backends (e.g. OpenAI, Ollama, LM Studio, vLLM) and multiple S2 /
// Crossref / OpenAlex / Unpaywall keys,
// enable/disable each individually, and assign a priority so the system
// knows which to try first (P3 will implement failover across priorities).
//
// Storage layout (localStorage):
//   key: 'matlit-multi-config'
//   val: JSON-serialized MultiConfig
//
// Migration: on first load, if `matlit-multi-config` doesn't exist but the
// legacy `matlit-api-keys` does, the old single-config object is converted
// into the new multi-config format and saved. The old key is intentionally
// LEFT IN PLACE so any out-of-scope code that still reads it (notably the
// PDF-upload dialog, until it's refactored) keeps working with the last-
// saved legacy values. Once every reader is migrated to the new store, the
// old key can be safely deleted.

'use client'

export type LLMProvider = 'openai'
export type SearchConfigType = 's2' | 'crossref' | 'openalex' | 'unpaywall'

export interface LLMConfigEntry {
  /** Stable unique id (crypto.randomUUID when available, fallback to timestamp+random). */
  id: string
  /** User-given display name, e.g. "OpenAI Production". */
  label: string
  provider: LLMProvider
  baseURL: string
  apiKey: string
  model: string
  enabled: boolean
  /** Lower = tried first. Stable across reorders. */
  priority: number
}

export interface SearchConfigEntry {
  id: string
  label: string
  type: SearchConfigType
  /** API key (S2) or polite email (Crossref/OpenAlex/Unpaywall). */
  key: string
  enabled: boolean
  priority: number
}

export interface MultiConfig {
  llm: LLMConfigEntry[]
  search: SearchConfigEntry[]
}

export const MULTI_CONFIG_STORAGE_KEY = 'matlit-multi-config'
export const LEGACY_API_KEYS_STORAGE_KEY = 'matlit-api-keys'

/** Default OpenAI-compatible base URL (used by the "Use default" button). */
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

const EMPTY_CONFIG: MultiConfig = { llm: [], search: [] }

/**
 * Generate a stable unique id. Prefers `crypto.randomUUID()` (available in
 * all modern browsers and Bun); falls back to a random+timestamp string for
 * ancient runtimes / non-secure contexts.
 */
function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Load the multi-config from localStorage. If the new key is missing, tries
 * to migrate from the legacy `matlit-api-keys` format and persists the
 * result so subsequent reads skip the migration step. Returns an empty
 * config on SSR or on any storage error.
 */
export function loadConfig(): MultiConfig {
  if (typeof window === 'undefined') return { ...EMPTY_CONFIG, llm: [], search: [] }
  try {
    const raw = localStorage.getItem(MULTI_CONFIG_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MultiConfig>
      return {
        llm: Array.isArray(parsed.llm) ? parsed.llm.map(normalizeLLMEntry) : [],
        search: Array.isArray(parsed.search) ? parsed.search.map(normalizeSearchEntry) : [],
      }
    }
    // No multi-config yet — try migrating from the legacy single-config.
    const migrated = migrateFromOldFormat()
    if (migrated) {
      saveConfig(migrated)
      return migrated
    }
  } catch {
    /* ignore */
  }
  return { llm: [], search: [] }
}

/** Persist the multi-config to localStorage. No-op on SSR. */
export function saveConfig(config: MultiConfig): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MULTI_CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    /* ignore */
  }
}

/**
 * Return all enabled LLM configs sorted by priority (lower = first).
 * Pass an explicit `config` to avoid re-reading localStorage.
 */
export function getEnabledLLMConfigs(config?: MultiConfig): LLMConfigEntry[] {
  const c = config ?? loadConfig()
  return c.llm
    .filter((e) => e.enabled)
    .slice()
    .sort((a, b) => a.priority - b.priority)
}

/**
 * Return all enabled SearchConfigs of a given type, sorted by priority.
 * Pass an explicit `config` to avoid re-reading localStorage.
 */
export function getEnabledSearchConfigs(
  type: SearchConfigType,
  config?: MultiConfig,
): SearchConfigEntry[] {
  const c = config ?? loadConfig()
  return c.search
    .filter((e) => e.enabled && e.type === type)
    .slice()
    .sort((a, b) => a.priority - b.priority)
}

/**
 * One-time migration from the legacy `matlit-api-keys` format.
 *
 * Reads the old single-config object and produces a MultiConfig:
 *   - One LLMConfigEntry from llmProvider/llmBaseURL/llmApiKey/llmModel
 *     (only if any of those fields is non-empty).
 *   - One SearchConfigEntry per non-empty search key (s2/crossref/openalex).
 *
 * Returns `null` if the old key doesn't exist or can't be parsed. The
 * caller is responsible for persisting the result via `saveConfig()`.
 *
 * NOTE: the old `matlit-api-keys` key is intentionally NOT deleted — any
 * out-of-scope reader that still references it keeps working with the
 * last-saved legacy values until it's refactored to use the new store.
 */
export function migrateFromOldFormat(): MultiConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LEGACY_API_KEYS_STORAGE_KEY)
    if (!raw) return null
    const old = JSON.parse(raw) as {
      semanticScholar?: string
      crossref?: string
      openalex?: string
      llmProvider?: string
      llmBaseURL?: string
      llmApiKey?: string
      llmModel?: string
    }
    const config: MultiConfig = { llm: [], search: [] }
    let llmPriority = 0
    let searchPriority = 0
    if (
      old.llmProvider ||
      old.llmBaseURL ||
      old.llmApiKey ||
      old.llmModel
    ) {
      const provider: LLMProvider = 'openai'
      config.llm.push({
        id: uuid(),
        label: 'OpenAI',
        provider,
        baseURL: old.llmBaseURL || '',
        apiKey: old.llmApiKey || '',
        model: old.llmModel || '',
        enabled: true,
        priority: llmPriority++,
      })
    }
    if (old.semanticScholar) {
      config.search.push({
        id: uuid(),
        label: 'Semantic Scholar',
        type: 's2',
        key: old.semanticScholar,
        enabled: true,
        priority: searchPriority++,
      })
    }
    if (old.crossref) {
      config.search.push({
        id: uuid(),
        label: 'Crossref',
        type: 'crossref',
        key: old.crossref,
        enabled: true,
        priority: searchPriority++,
      })
    }
    if (old.openalex) {
      config.search.push({
        id: uuid(),
        label: 'OpenAlex',
        type: 'openalex',
        key: old.openalex,
        enabled: true,
        priority: searchPriority++,
      })
    }
    return config
  } catch {
    return null
  }
}

/** Construct a fresh LLMConfigEntry with sensible defaults. */
export function newLLMConfigEntry(
  partial?: Partial<LLMConfigEntry>,
): LLMConfigEntry {
  return {
    id: uuid(),
    label: '',
    provider: 'openai',
    baseURL: DEFAULT_OPENAI_BASE_URL,
    apiKey: '',
    model: 'gpt-4o-mini',
    enabled: true,
    priority: Date.now(),
    ...partial,
  }
}

/** Construct a fresh SearchConfigEntry with sensible defaults. */
export function newSearchConfigEntry(
  type: SearchConfigType,
  partial?: Partial<SearchConfigEntry>,
): SearchConfigEntry {
  return {
    id: uuid(),
    label: '',
    type,
    key: '',
    enabled: true,
    priority: Date.now(),
    ...partial,
  }
}

// ─── Internal normalizers ────────────────────────────────────────────────
//
// localStorage is untyped — a config saved by an older build (or hand-edited
// by a user) may be missing fields or have wrong types. These helpers
// coerce a partial entry into a well-typed one with safe defaults.

function normalizeLLMEntry(e: Partial<LLMConfigEntry>): LLMConfigEntry {
  return {
    id: typeof e.id === 'string' && e.id ? e.id : uuid(),
    label: typeof e.label === 'string' ? e.label : '',
    provider: 'openai',
    baseURL: typeof e.baseURL === 'string' ? e.baseURL : '',
    apiKey: typeof e.apiKey === 'string' ? e.apiKey : '',
    model: typeof e.model === 'string' ? e.model : '',
    enabled: e.enabled !== false,
    priority: Number.isFinite(e.priority) ? (e.priority as number) : 0,
  }
}

function normalizeSearchEntry(e: Partial<SearchConfigEntry>): SearchConfigEntry {
  const validTypes: SearchConfigType[] = ['s2', 'crossref', 'openalex', 'unpaywall']
  const type: SearchConfigType = validTypes.includes(e.type as SearchConfigType)
    ? (e.type as SearchConfigType)
    : 's2'
  return {
    id: typeof e.id === 'string' && e.id ? e.id : uuid(),
    label: typeof e.label === 'string' ? e.label : '',
    type,
    key: typeof e.key === 'string' ? e.key : '',
    enabled: e.enabled !== false,
    priority: Number.isFinite(e.priority) ? (e.priority as number) : 0,
  }
}
