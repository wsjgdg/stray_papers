'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ShieldAlert, Loader2, ExternalLink, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'

interface ValidationItem {
  paperId: string
  doi: string
  title: string
  valid: boolean
  registered?: string
  crossrefTitle?: string
  error?: string
}

interface ValidationResult {
  results: ValidationItem[]
  validCount: number
  invalidCount: number
  total: number
}

/**
 * Inline DOI validator UI.
 *
 * Shows a "Validate DOIs" button, a progress bar during validation,
 * and a results table with status badges. Invalid DOIs get a
 * "Search by title" link to Google Scholar.
 *
 * Designed to be embedded inside a Dialog (see papers-tab integration).
 */
export function DoiValidator({
  paperIds,
  onClose,
}: {
  paperIds?: string[]
  onClose?: () => void
}) {
  const { t } = useI18n()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const { data, isFetching, refetch, dataUpdatedAt } = useQuery<ValidationResult>({
    queryKey: ['doi-validation', paperIds?.join(',') ?? 'all'],
    queryFn: async () => {
      // The API runs all validations in one POST request; we simulate
      // progress by polling the result.
      setProgress({ done: 0, total: 1 })
      const result = await api<ValidationResult>('/api/papers/validate-dois', {
        method: 'POST',
        body: JSON.stringify({ paperIds }),
      })
      setProgress({ done: result.total, total: result.total })
      return result
    },
    enabled: false, // run only on user click
    staleTime: 30_000,
  })

  // Simulated progress: the API is a single batch call, so we step
  // the progress bar while the request is in-flight.
  const [simulatedPct, setSimulatedPct] = useState(0)
  const runValidation = async () => {
    setSimulatedPct(5)
    setProgress({ done: 0, total: 1 })
    // Animate the bar up to 90% while waiting
    const interval = setInterval(() => {
      setSimulatedPct((p) => (p < 90 ? p + Math.max(1, (90 - p) / 8) : p))
    }, 200)
    try {
      await refetch()
    } finally {
      clearInterval(interval)
      setSimulatedPct(100)
      setTimeout(() => setSimulatedPct(0), 800)
    }
  }

  const results = data?.results ?? []
  const sorted = [...results].sort((a, b) => {
    // Invalid first, then by title
    if (a.valid !== b.valid) return a.valid ? 1 : -1
    return a.title.localeCompare(b.title)
  })

  return (
    <div className="space-y-3">
      {/* Stats summary */}
      {data && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-2 border border-emerald-200 dark:border-emerald-900">
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{data.validCount}</div>
            <div className="text-[10px] text-slate-500">{t('papers.doi.valid')}</div>
          </div>
          <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-2 border border-red-200 dark:border-red-900">
            <div className="text-lg font-bold text-red-700 dark:text-red-300 tabular-nums">{data.invalidCount}</div>
            <div className="text-[10px] text-slate-500">{t('papers.doi.invalid')}</div>
          </div>
          <div className="rounded-md bg-slate-50 dark:bg-slate-900/50 p-2 border border-slate-200 dark:border-slate-800">
            <div className="text-lg font-bold text-slate-700 dark:text-slate-300 tabular-nums">{data.total}</div>
            <div className="text-[10px] text-slate-500">{t('papers.doi.summary')}</div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {(isFetching || simulatedPct > 0) && (
        <div className="space-y-1">
          <Progress value={simulatedPct} className="h-2" />
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('papers.doi.progress', {
              done: progress?.done ?? 0,
              total: progress?.total ?? 0,
            })}
          </p>
        </div>
      )}

      {/* Run button */}
      {!isFetching && (
        <div className="flex items-center gap-2">
          <Button onClick={runValidation} size="sm" className="bg-rose-600 hover:bg-rose-700">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            {t('papers.doi.validate')}
          </Button>
          {data && (
            <span className="text-[10px] text-slate-400">
              {t('doi.updatedAt', { time: new Date(dataUpdatedAt).toLocaleTimeString() })}
            </span>
          )}
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose} className="ml-auto">
              {t('common.close')}
            </Button>
          )}
        </div>
      )}

      {/* Results table */}
      {sorted.length > 0 && (
        <div className="rounded-md border border-slate-200 dark:border-slate-800 max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
              <tr className="text-left text-slate-500">
                <th className="p-2 font-medium">{t('papers.table.title')}</th>
                <th className="p-2 font-medium w-32">DOI</th>
                <th className="p-2 font-medium w-20">{t('doi.status')}</th>
                <th className="p-2 font-medium w-20">{t('doi.registered')}</th>
                <th className="p-2 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.paperId} className="border-t border-slate-100 dark:border-slate-800 align-top">
                  <td className="p-2">
                    <div className="line-clamp-2 font-medium">{r.title}</div>
                    {r.crossrefTitle && r.crossrefTitle !== r.title && (
                      <div className="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">
                        Crossref: {r.crossrefTitle}
                      </div>
                    )}
                    {r.error && (
                      <div className="text-[10px] text-red-500 mt-0.5">{r.error}</div>
                    )}
                  </td>
                  <td className="p-2">
                    {r.doi ? (
                      <a
                        href={`https://doi.org/${r.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-600 dark:text-sky-400 hover:underline font-mono text-[11px] break-all"
                      >
                        {r.doi}
                      </a>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700">—</span>
                    )}
                  </td>
                  <td className="p-2">
                    {isFetching && !data ? (
                      <Badge variant="outline" className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {t('papers.doi.pending')}
                      </Badge>
                    ) : r.valid ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
                        <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />
                        {t('papers.doi.valid')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800">
                        <ShieldAlert className="w-2.5 h-2.5 mr-0.5" />
                        {t('papers.doi.invalid')}
                      </Badge>
                    )}
                  </td>
                  <td className="p-2 text-slate-500 tabular-nums">{r.registered || '—'}</td>
                  <td className="p-2">
                    {!r.valid && (
                      <a
                        href={`https://scholar.google.com/scholar?q=${encodeURIComponent(r.title)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                        title={t('papers.doi.searchTitle')}
                      >
                        <Search className="w-3 h-3" />
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!data && !isFetching && simulatedPct === 0 && (
        <p className="text-xs text-slate-400 text-center py-4">
          {t('doi.emptyHint')}
        </p>
      )}
    </div>
  )
}
