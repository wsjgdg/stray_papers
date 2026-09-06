'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Languages, Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'
import { languageLabel } from '@/lib/language-detector'

export interface PaperTranslationInfo {
  id: string
  title: string
  abstract: string
  originalLanguage?: string
  translatedTitle?: string
  translatedAbstract?: string
}

interface TranslateResponse {
  skipped?: boolean
  reason?: string
  originalLanguage?: string
  translatedTitle?: string
  translatedAbstract?: string
  cached?: boolean
  error?: string
}

/**
 * Inline multilingual paper translation UI.
 *
 * - If `originalLanguage` is empty, shows a "Detect language" button.
 * - If non-English and no translation yet, shows a "Translate to English" button.
 * - If a translation exists, shows a toggle to switch between original / English.
 * - Shows original + translation side-by-side when both are visible.
 */
export function PaperTranslation({ paper }: { paper: PaperTranslationInfo }) {
  const { t } = useI18n()
  const [view, setView] = useState<'original' | 'english'>('original')

  const detectMut = useMutation({
    mutationFn: () => api<TranslateResponse>(`/api/papers/${paper.id}/translate`, { method: 'POST' }),
    onSuccess: (data) => {
      if (data.skipped) {
        // Already English — nothing else to do
      }
    },
  })

  const translateMut = useMutation({
    mutationFn: () => api<TranslateResponse>(`/api/papers/${paper.id}/translate`, { method: 'POST' }),
    onSuccess: (data) => {
      if (!data.skipped && data.translatedTitle) {
        setView('english')
      }
    },
  })

  const lang = paper.originalLanguage || detectMut.data?.originalLanguage || ''
  const isEnglish = lang === 'en' || (!lang && !detectMut.data)
  const hasTranslation = !!(paper.translatedTitle || translateMut.data?.translatedTitle)
  const translatedTitle = paper.translatedTitle || translateMut.data?.translatedTitle || ''
  const translatedAbstract = paper.translatedAbstract || translateMut.data?.translatedAbstract || ''

  const isLoading = detectMut.isPending || translateMut.isPending

  // Determine display language label
  const langLabel = lang ? languageLabel(lang) : ''

  // If language hasn't been detected yet, show only the detect button
  if (!lang && !detectMut.data) {
    return (
      <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5 text-violet-500" />
            {t('translation.multilingual')}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => detectMut.mutate()}
            disabled={isLoading}
            className="h-7 text-xs"
          >
            {isLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Languages className="w-3 h-3 mr-1" />}
            {t('papers.translation.detect')}
          </Button>
        </div>
        {detectMut.isError && (
          <p className="text-[10px] text-red-500 mt-1.5">
            {(detectMut.error as Error).message}
          </p>
        )}
      </div>
    )
  }

  // English paper — show a small badge, no translation needed
  if (isEnglish) {
    return (
      <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 p-2.5">
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t('translation.detectedEnglish')}
        </div>
      </div>
    )
  }

  // Non-English paper
  return (
    <div className="rounded-md border border-violet-200 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/20 p-2.5 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Languages className="w-3.5 h-3.5 text-violet-500" />
          <Badge variant="outline" className="text-[10px] bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800">
            {langLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {!hasTranslation ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => translateMut.mutate()}
              disabled={isLoading}
              className="h-7 text-xs border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:text-violet-300"
            >
              {isLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              {t('papers.translation.translate')}
            </Button>
          ) : (
            <div className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => setView('original')}
                className={`px-2 h-7 text-[11px] transition-colors ${view === 'original' ? 'bg-violet-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {t('papers.translation.original', { lang: langLabel })}
              </button>
              <button
                onClick={() => setView('english')}
                className={`px-2 h-7 text-[11px] transition-colors ${view === 'english' ? 'bg-violet-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {t('papers.translation.english')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Translation content */}
      {hasTranslation && (
        <div className="space-y-1.5">
          {view === 'original' ? (
            <>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-slate-400 mb-0.5">
                  {t('papers.translation.original', { lang: langLabel })} · {t('papers.detail.title')}
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{paper.title}</p>
              </div>
              {paper.abstract && (
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-slate-400 mb-0.5">
                    {t('papers.translation.original', { lang: langLabel })} · {t('papers.detail.abstract')}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-2 rounded max-h-40 overflow-y-auto">
                    {paper.abstract}
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-violet-500 mb-0.5">
                  {t('papers.translation.english')} · {t('papers.detail.title')}
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{translatedTitle}</p>
              </div>
              {translatedAbstract && (
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-violet-500 mb-0.5">
                    {t('papers.translation.english')} · {t('papers.detail.abstract')}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-violet-50/50 dark:bg-violet-950/30 p-2 rounded max-h-40 overflow-y-auto">
                    {translatedAbstract}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Translating indicator */}
      {isLoading && (
        <p className="text-[11px] text-violet-600 dark:text-violet-400 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('papers.translation.translating')}
        </p>
      )}

      {/* Error */}
      {translateMut.isError && (
        <p className="text-[10px] text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {t('papers.translation.failed')}: {(translateMut.error as Error).message}
        </p>
      )}
    </div>
  )
}
