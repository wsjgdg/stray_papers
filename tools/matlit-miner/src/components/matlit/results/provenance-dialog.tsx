'use client'

import { Loader2, Link2, Quote, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { doiUrl } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'
import TabErrorBoundary from '@/components/matlit/tab-error-boundary'

/** Single entry in the provenance chain returned by /api/materials/[id]/provenance. */
export interface ProvenanceEntry {
  value: string
  paperId: string
  paperTitle: string
  paperYear: number | null
  doi: string
  evidence: string
  source: 'classification' | 'database'
}

/** Provenance API response shape (matches /api/materials/[id]/provenance). */
export interface ProvenanceResponse {
  materialId: string
  materialName: string
  fields: {
    bandgap: ProvenanceEntry[]
    efficiency: ProvenanceEntry[]
  }
}

/** Which field's provenance chain is currently being viewed in the dialog. */
export type ProvenanceField = 'bandgap' | 'efficiency'

/**
 * The material + field the user clicked on (the dialog's open-state). When
 * non-null, the dialog is open and the parent fetches
 * /api/materials/[id]/provenance.
 */
export interface ProvenanceTarget {
  materialId: string
  materialName: string
  field: ProvenanceField
}

export interface ProvenanceDialogProps {
  /** When non-null, the dialog is open showing this material / field's chain. */
  target: ProvenanceTarget | null
  /** Provenance API response (null while loading or when target is null). */
  data: ProvenanceResponse | null
  /** True while the fetch is in-flight. */
  loading: boolean
  /** Called when the user closes the dialog (Esc / overlay / X). */
  onClose: () => void
}

/**
 * Provenance chain dialog (G7) — opened by clicking a bandgap / efficiency
 * value in the results table. Shows the historical citation chain for the
 * value: a vertical timeline of every paper that reported it, sorted by year
 * ascending, with the supporting evidence quote + DOI link per entry.
 *
 * Wrapped in `TabErrorBoundary` so a render crash doesn't take down the
 * Results tab.
 */
export function ProvenanceDialog({
  target,
  data,
  loading,
  onClose,
}: ProvenanceDialogProps) {
  const { t } = useI18n()

  return (
    <TabErrorBoundary tabName={t('results.provenance.tabName')}>
      <Dialog
        open={!!target}
        onOpenChange={(o) => {
          if (!o) onClose()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Link2 className="w-4 h-4 text-teal-500 shrink-0" />
              <span>{t('results.provenance.title')}</span>
              {target && (
                <>
                  <span className="text-slate-400">·</span>
                  <span className="font-mono">{target.materialName}</span>
                  <Badge variant="outline" className="text-[11px] sm:text-[10px] uppercase tracking-wide ml-1">
                    {target.field}
                  </Badge>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {t('results.provenance.desc')}
            </DialogDescription>
          </DialogHeader>

          <div className="py-1 max-h-[60vh] overflow-y-auto matlit-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {t('results.provenance.loading')}
              </div>
            ) : !data || !target ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                {t('results.provenance.noData')}
              </div>
            ) : (() => {
              const entries =
                target.field === 'bandgap'
                  ? data.fields.bandgap
                  : data.fields.efficiency
              if (entries.length === 0) {
                return (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    {t('results.provenance.empty')}
                  </div>
                )
              }
              if (entries.length === 1) {
                return (
                  <>
                    <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 p-2 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 mb-3 flex items-center gap-1.5">
                      <Link2 className="w-3 h-3 text-slate-400" />
                      {t('results.provenance.singleSource')}
                    </div>
                    <ProvenanceTimeline entries={entries} />
                  </>
                )
              }
              const first = entries[0]
              const last = entries[entries.length - 1]
              return (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-2 border border-emerald-200 dark:border-emerald-900">
                      <div className="text-[10px] sm:text-[9px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wide font-medium">
                        {t('results.provenance.firstReported')}
                      </div>
                      <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 tabular-nums">
                        {first.paperYear ?? '—'} · {first.value}
                      </div>
                      <div className="text-[11px] sm:text-[10px] text-slate-500 truncate" title={first.paperTitle || first.paperId || '—'}>
                        {first.paperTitle || first.paperId || '—'}
                      </div>
                    </div>
                    <div className="rounded-md bg-sky-50 dark:bg-sky-950/30 p-2 border border-sky-200 dark:border-sky-900">
                      <div className="text-[10px] sm:text-[9px] text-sky-700 dark:text-sky-400 uppercase tracking-wide font-medium">
                        {t('results.provenance.latest')}
                      </div>
                      <div className="text-sm font-semibold text-sky-800 dark:text-sky-300 tabular-nums">
                        {last.paperYear ?? '—'} · {last.value}
                      </div>
                      <div className="text-[11px] sm:text-[10px] text-slate-500 truncate" title={last.paperTitle || last.paperId || '—'}>
                        {last.paperTitle || last.paperId || '—'}
                      </div>
                    </div>
                  </div>
                  <ProvenanceTimeline entries={entries} />
                </>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </TabErrorBoundary>
  )
}

/**
 * Vertical timeline of provenance entries (G7). Renders each report as a
 * node on a left-bordered line, with the year, value, paper title (linked
 * to DOI when available), and the supporting evidence quote.
 *
 * Used inside the citation-chain dialog. Entries are pre-sorted by year
 * ascending (the API does this), so the first node is the earliest known
 * report and the last node is the most recent.
 */
function ProvenanceTimeline({
  entries,
}: {
  entries: ProvenanceEntry[]
}) {
  const { t } = useI18n()
  return (
    <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2 space-y-3 pl-3">
      {entries.map((e, i) => (
        <li key={`${e.paperId || 'db'}-${i}`} className="relative">
          <span className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-teal-500 border-2 border-white dark:border-slate-900" />
          <div className="text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                {e.value}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500 tabular-nums">
                {e.paperYear ?? t('results.provenance.yearUnknown')}
              </span>
              {e.source === 'database' && (
                <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 bg-slate-50 dark:bg-slate-800/60">
                  {e.paperTitle || t('results.provenance.database')}
                </Badge>
              )}
              {e.source === 'classification' && e.evidence && (
                <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900">
                  <Quote className="w-2.5 h-2.5" />
                  {t('results.provenance.evidence')}
                </Badge>
              )}
            </div>
            {e.paperTitle && e.source === 'classification' && (
              <div className="text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                {e.paperTitle}
              </div>
            )}
            {e.doi && (
              <a
                href={doiUrl(e.doi)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] sm:text-[10px] text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5 mt-0.5"
              >
                DOI <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
            {e.evidence && (
              <div className="mt-1 rounded bg-violet-50 dark:bg-violet-950/20 p-1.5 text-[11px] text-slate-600 dark:text-slate-300 border-l-2 border-violet-300 dark:border-violet-700 italic">
                “{e.evidence}”
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
