'use client'

// LLMModelFetcher
//
// A self-contained "Fetch models" button + dropdown that calls
// POST /api/llm/models and lets the user pick a chat model from the
// provider's `/v1/models` response (OpenAI-compatible) or from the
// hardcoded Z.ai list.
//
// Created as a SEPARATE component (rather than inlined into settings-dialog.tsx)
// so it can be developed independently of the P1 agent that is also editing
// settings-dialog.tsx — see task P2 notes.
//
// Integration (settings-dialog.tsx):
//
//   import { LLMModelFetcher } from '@/components/llm-model-fetcher'
//
//   // …inside the LLM Configuration block (after the API Key field, before
//   // or replacing the COMMON_LLM_MODELS preset dropdown):
//   <LLMModelFetcher
//     config={{
//       provider: keys.llmProvider,
//       baseURL: keys.llmBaseURL,
//       apiKey: keys.llmApiKey,
//     }}
//     onModelSelect={(modelId) => setKeys({ ...keys, llmModel: modelId })}
//   />
//
// Props:
//   - config:        { provider, baseURL, apiKey } — current LLM config.
//   - onModelsFetched (optional): called with the fetched models array, so
//                    the parent can persist them (e.g. localStorage).
//   - onModelSelect:  called when the user picks a model from the dropdown.
//   - currentModel (optional): the currently selected model id (used to
//                    highlight the active item in the dropdown).
//
// Behaviour:
//   - The button is disabled while a fetch is in flight.
//   - On success: a shadcn/ui Select dropdown appears below the button,
//     pre-filled with the fetched model ids (and labels if present).
//   - The fetched list is cached in component state for the lifetime of
//     the component — re-clicking "Fetch" re-fetches only if the
//     provider/baseURL/apiKey signature has changed (otherwise it just
//     re-uses the cache). The "Refresh" affordance re-fetches unconditionally.
//   - On error: a red error message appears below the button, with the
//     raw error string from the API.
//   - The component is fully i18n-aware via `useI18n()` — no inline
//     locale-based ternaries.

import { useState, useCallback, useRef } from 'react'
import { Loader2, RefreshCw, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/components/i18n/provider'

export interface LLMModel {
  id: string
  label?: string
}

export interface LLMModelFetcherConfig {
  provider: string
  baseURL: string
  apiKey: string
}

export interface LLMModelFetcherProps {
  config: LLMModelFetcherConfig
  onModelsFetched?: (models: LLMModel[]) => void
  onModelSelect: (modelId: string) => void
  /** Currently selected model id (highlighted in dropdown, optional). */
  currentModel?: string
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; models: LLMModel[] }
  | { status: 'error'; message: string }

/**
 * Signature used as the cache key. If provider/baseURL/apiKey are unchanged,
 * the cached model list is re-used instead of re-fetching.
 */
function cacheKey(c: LLMModelFetcherConfig): string {
  return `${c.provider || ''}::${(c.baseURL || '').trim()}::${(c.apiKey || '').trim()}`
}

export function LLMModelFetcher({
  config,
  onModelsFetched,
  onModelSelect,
  currentModel,
}: LLMModelFetcherProps) {
  const { t } = useI18n()
  const [state, setState] = useState<FetchState>({ status: 'idle' })
  // Cache: keyed by `provider::baseURL::apiKey` so switching back to a
  // previously-fetched config is instant. The component never refetches
  // on every render — only when the user clicks the button.
  const cacheRef = useRef<Map<string, LLMModel[]>>(new Map())
  // Track which signature is currently active so the dropdown only shows
  // when the displayed list actually corresponds to the current config.
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const fetchModels = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const resp = await fetch('/api/llm/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          baseURL: config.baseURL,
          apiKey: config.apiKey,
        }),
      })
      // Route always returns 200 (errors are in the body). 400 only happens
      // on malformed JSON, which is a programmer error, not a user error.
      const data = (await resp.json()) as { models?: LLMModel[]; error?: string }
      if (!resp.ok) {
        setState({
          status: 'error',
          message: data.error || `HTTP ${resp.status}`,
        })
        return
      }
      if (data.error) {
        setState({ status: 'error', message: data.error })
        return
      }
      const models = Array.isArray(data.models) ? data.models : []
      const key = cacheKey(config)
      cacheRef.current.set(key, models)
      setActiveKey(key)
      setState({ status: 'success', models })
      onModelsFetched?.(models)
    } catch (e) {
      setState({
        status: 'error',
        message: (e as Error).message || 'Network error',
      })
    }
  }, [config, onModelsFetched])

  // Handler for the "Fetch models" button. Uses the cache if the signature
  // matches; otherwise fetches fresh.
  const handleFetch = useCallback(() => {
    const key = cacheKey(config)
    const cached = cacheRef.current.get(key)
    if (cached) {
      setActiveKey(key)
      setState({ status: 'success', models: cached })
      onModelsFetched?.(cached)
      return
    }
    fetchModels()
  }, [config, fetchModels, onModelsFetched])

  // Whether the displayed model list corresponds to the current config.
  const modelsMatchConfig = activeKey === cacheKey(config)
  const showDropdown =
    state.status === 'success' &&
    modelsMatchConfig &&
    state.models.length > 0

  // Button label: shows "Fetch models" when idle, spinner when loading,
  // "Refresh" when there are already-fetched models that match config.
  const buttonLabel = () => {
    if (state.status === 'loading') return t('settings.models.fetching')
    if (showDropdown) return t('settings.models.refresh')
    return t('settings.models.fetch')
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleFetch}
          disabled={state.status === 'loading'}
          className="h-7 px-2.5 text-xs"
        >
          {state.status === 'loading' ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : showDropdown ? (
            <RefreshCw className="w-3 h-3 mr-1" />
          ) : (
            <ChevronDown className="w-3 h-3 mr-1" />
          )}
          {buttonLabel()}
        </Button>
        {state.status === 'success' && modelsMatchConfig && state.models.length > 0 && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            {t('settings.models.count', { n: state.models.length })}
          </span>
        )}
        {state.status === 'success' && modelsMatchConfig && state.models.length === 0 && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            {t('settings.models.empty')}
          </span>
        )}
      </div>

      {/* Stale-cache notice: models were fetched for a different config. */}
      {state.status === 'success' && !modelsMatchConfig && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 italic">
          {t('settings.models.stale')}
        </p>
      )}

      {state.status === 'error' && (
        <p
          className="text-[10px] text-red-500 dark:text-red-400 break-words"
          title={state.message}
        >
          {state.message}
        </p>
      )}

      {showDropdown && (
        <Select
          value={currentModel || ''}
          onValueChange={(v) => {
            if (v) onModelSelect(v)
          }}
        >
          <SelectTrigger className="h-9 text-xs w-full">
            <SelectValue placeholder={t('settings.models.selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {state.models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label ? `${m.id} — ${m.label}` : m.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
