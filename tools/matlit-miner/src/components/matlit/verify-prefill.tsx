'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles,
  Loader2,
  FileText,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Quote,
  AlertCircle,
  CheckCircle2,
  Download,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, doiUrl } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'

export interface PrefillData {
  found: boolean
  materialId: string
  materialName?: string
  classificationId?: string
  bandgap: string
  efficiency: string
  method: string
  conditions: string
  evidence: string
  confidence: number
  doi: string
  paperTitle: string
  paperId: string
  paperYear: number | null
  status: string
  synthesized: string
}

interface VerifyPrefillProps {
  /** Material to fetch prefill data for. */
  materialId: string
  /** Increment this number to force a re-fetch (e.g. when the user clicks "Load extracted data"). */
  refreshKey?: number
  /** Called when fresh prefill data arrives (used by the parent to seed form state). */
  onData?: (data: PrefillData | null) => void
}

/**
 * Banner + collapsible evidence viewer shown above the verification form.
 * Fetches the latest extracted Classification for the given material and
 * surfaces the data to the parent via `onData`. Also exposes a "Reset to
 * auto-fill" button so the parent can restore the original auto values
 * (the parent owns the actual input state).
 */
export function VerifyPrefill({ materialId, refreshKey = 0, onData }: VerifyPrefillProps) {
  const { t } = useI18n()
  const [showSource, setShowSource] = useState(false)
  // Remember the last data we handed to the parent so we don't spam onData.
  const lastSentRef = useRef<string>('')

  const { data, isLoading, isError, refetch, isFetching } = useQuery<PrefillData>({
    queryKey: ['verify-prefill', materialId, refreshKey],
    queryFn: () => api<PrefillData>(`/api/verify/prefill?materialId=${encodeURIComponent(materialId)}`),
    enabled: !!materialId,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!data) return
    const sig = `${data.found}|${data.classificationId ?? ''}|${data.bandgap}|${data.efficiency}|${data.method}|${data.conditions}|${data.doi}`
    if (sig !== lastSentRef.current) {
      lastSentRef.current = sig
      onData?.(data.found ? data : null)
    }
  }, [data, onData])

  // Nothing to render if we have no data and aren't loading.
  if (!materialId) return null

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
        {t('verification.prefill.loading')}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <AlertCircle className="w-3.5 h-3.5" />
        {t('verification.prefill.error')}
      </div>
    )
  }

  if (!data || !data.found) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
        {t('verification.prefill.noData')}
      </div>
    )
  }

  const confidencePct = Math.round((data.confidence ?? 0) * 100)

  return (
    <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2.5 space-y-2">
      {/* Banner */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Sparkles className="w-3.5 h-3.5 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5 flex-wrap">
              {t('verification.prefill.banner')}
              {data.paperTitle && (
                <span className="text-emerald-700 dark:text-emerald-300 truncate font-normal">
                  ({t('verification.prefill.source')}: {data.paperTitle}
                  {data.paperYear ? `, ${data.paperYear}` : ''})
                </span>
              )}
            </div>
            {data.confidence > 0 && (
              <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                {t('verification.prefill.confidence')}: {confidencePct}% ·
                <span className="ml-1 capitalize">{data.synthesized}</span>
                <span className="ml-1">· {data.status}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
            onClick={() => setShowSource((s) => !s)}
            aria-expanded={showSource}
          >
            {showSource ? <ChevronDown className="w-3 h-3 mr-0.5" /> : <ChevronRight className="w-3 h-3 mr-0.5" />}
            {t('verification.prefill.showSource')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
            onClick={() => refetch()}
            disabled={isFetching}
            title={t('verification.prefill.reload')}
          >
            {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Collapsible source / evidence panel */}
      {showSource && (
        <div className="space-y-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-900/60">
          {data.paperTitle && (
            <div className="flex items-start gap-1.5 text-xs">
              <FileText className="w-3 h-3 mt-0.5 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('verification.prefill.paperTitle')}</div>
                <div className="text-slate-700 dark:text-slate-200 break-words">{data.paperTitle}</div>
              </div>
              {data.doi && (
                <a
                  href={doiUrl(data.doi)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline shrink-0 inline-flex items-center gap-0.5"
                >
                  DOI ↗
                </a>
              )}
            </div>
          )}
          {data.evidence ? (
            <div className="flex items-start gap-1.5 text-xs">
              <Quote className="w-3 h-3 mt-0.5 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('verification.prefill.evidence')}</div>
                <blockquote className="text-slate-700 dark:text-slate-200 italic text-xs leading-relaxed bg-white/60 dark:bg-slate-900/40 border-l-2 border-emerald-300 dark:border-emerald-700 pl-2 py-1 mt-0.5">
                  {data.evidence}
                </blockquote>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 italic">{t('verification.prefill.noEvidence')}</div>
          )}
          {/* Quick-fill summary */}
          <div className="flex items-center gap-1.5 flex-wrap text-[10px] pt-1">
            <Badge variant="outline" className="text-[9px] bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" /> {t('verification.prefill.autoFilled')}
            </Badge>
            {data.bandgap && <span className="text-slate-500">bandgap: {data.bandgap}</span>}
            {data.efficiency && <span className="text-slate-500">eff: {data.efficiency}%</span>}
            {data.method && <span className="text-slate-500 truncate max-w-[180px]">method: {data.method}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Small badge to render next to a form input that has been auto-filled and
 * whose current value still matches the auto-fill value.
 */
export function AutoBadge({ active }: { active: boolean }) {
  const { t } = useI18n()
  if (!active) return null
  return (
    <Badge
      variant="outline"
      className="text-[9px] px-1 py-0 h-3.5 ml-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
      title={t('verification.prefill.autoFilled')}
    >
      {t('verification.prefill.autoBadge')}
    </Badge>
  )
}

/** Convenience hook for parents that want a "Load extracted data" button. */
export function LoadExtractedButton({
  onClick,
  disabled,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
      onClick={onClick}
      disabled={disabled}
    >
      <Download className="w-3 h-3 mr-1" />
      {t('verification.prefill.loadButton')}
    </Button>
  )
}
