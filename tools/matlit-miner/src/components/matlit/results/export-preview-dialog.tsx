'use client'

import { useEffect, useState } from 'react'
import {
  Download,
  Loader2,
  Eye,
  FileText,
  Braces,
  Quote,
  FileSpreadsheet,
  FileCode,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/components/i18n/provider'
import TabErrorBoundary from '@/components/matlit/tab-error-boundary'

/** Every export format that can be previewed before download. */
export type ExportPreviewFormat = 'csv' | 'latex' | 'bibtex' | 'json' | 'xlsx' | 'markdown'

/**
 * Export preview dialog state. Constructed by the parent (ResultsTab) via
 * `openExportPreview(format, opts)` and passed to `<ExportPreviewDialog>`.
 */
export interface ExportPreviewState {
  format: ExportPreviewFormat
  /** Full URL used for the actual download (no preview=true). */
  downloadUrl: string
  /**
   * URL fetched to populate the preview pane. For csv/latex this hits
   * /api/export?preview=true&…; for bibtex/json it hits the format's own
   * endpoint (we read a slice of the response and parse the first entry /
   * item); for xlsx there's no fetchable preview (binary) so we leave this
   * null and show a static note.
   */
  previewUrl: string | null
  /** Human-readable title shown in the dialog header (format + filters). */
  title: string
  /** Success toast shown after the download fires. */
  toastMsg: string
}

/** Structured preview payload returned by /api/export?preview=true. */
export interface CsvPreviewData {
  headers: string[]
  rows: Array<Record<string, string | number | boolean>>
  totalRows: number
  format: string
  filename: string
  rawPreview: string
}

/**
 * Alternative preview payload for non-/api/export formats (bibtex / json /
 * markdown). `rawText` is the first entry / first item pretty-printed /
 * first ~80 lines of the markdown doc; `total` is the server-reported
 * total (entries / materials / lines) when available.
 */
export interface AltPreviewData {
  rawText: string
  total: number | null
}

export interface ExportPreviewDialogProps {
  /** When non-null, the dialog is open and shows the preview for this format. */
  state: ExportPreviewState | null
  /** Called when the user closes the dialog (Esc / overlay / Cancel button). */
  onClose: () => void
  /** Called when the user clicks Download — parent fires the actual fetch + toast. */
  onConfirmDownload: (state: ExportPreviewState) => void
}

/**
 * Export preview dialog — opened by every export button (CSV / LaTeX /
 * BibTeX / JSON / Excel / Markdown / preset) so the user can sanity-check
 * the format and the applied filters before committing to a download.
 *
 * Self-contained: manages its own preview-data fetch (csv/latex hit
 * /api/export?preview=true for a structured 5-row sample; bibtex/json/markdown
 * fetch the real endpoint as text and extract the first entry / first item /
 * first ~80 lines; xlsx is binary and shows a static note). The Download
 * button delegates to `onConfirmDownload`, which the parent uses to fire
 * `downloadFromAPI` to the unmodified export URL.
 *
 * Wrapped in `TabErrorBoundary` so a crash in the preview fetch / render
 * doesn't take down the whole Results tab.
 */
export function ExportPreviewDialog({
  state,
  onClose,
  onConfirmDownload,
}: ExportPreviewDialogProps) {
  const { t } = useI18n()
  const [previewData, setPreviewData] = useState<CsvPreviewData | null>(null)
  const [previewAlt, setPreviewAlt] = useState<AltPreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Fetch preview data whenever a preview is opened. Two paths:
  //  • csv/latex → /api/export?preview=true&… returns the structured JSON
  //    ({ headers, rows[<=5], totalRows, format, rawPreview }).
  //  • bibtex/json → fetch the real endpoint as text/json, extract the first
  //    entry / first item for display, and surface the server-reported total.
  // xlsx has no fetchable preview (binary) — we just show a static note.
  useEffect(() => {
    if (!state) return
    if (state.format === 'xlsx') {
      setPreviewData(null)
      setPreviewAlt(null)
      setPreviewLoading(false)
      setPreviewError(null)
      return
    }
    if (!state.previewUrl) return
    // Bind to a const so the non-null narrowing survives the async IIFE
    // closure below (TS does not carry `let` narrowing into callbacks).
    const previewUrl: string = state.previewUrl
    const ctrl = new AbortController()
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewData(null)
    setPreviewAlt(null)
    void (async () => {
      try {
        if (state.format === 'csv' || state.format === 'latex') {
          const r = await fetch(previewUrl, { signal: ctrl.signal })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const json = (await r.json()) as CsvPreviewData
          setPreviewData(json)
        } else if (state.format === 'bibtex') {
          const r = await fetch(previewUrl, { signal: ctrl.signal })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const text = await r.text()
          // First @entry block = from first '@' to the next '@' (or end of
          // text). Falls back to the first 600 chars if no '@' is found.
          const firstAt = text.indexOf('@')
          const secondAt = firstAt >= 0 ? text.indexOf('@', firstAt + 1) : -1
          const firstEntry =
            firstAt < 0
              ? text.slice(0, 600)
              : secondAt > 0
                ? text.slice(firstAt, secondAt).trim()
                : text.slice(firstAt).trim()
          const m = text.match(/Total entries:\s*(\d+)/i)
          setPreviewAlt({ rawText: firstEntry, total: m ? Number(m[1]) : null })
        } else if (state.format === 'json') {
          const r = await fetch(previewUrl, { signal: ctrl.signal })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const json = (await r.json()) as {
            totalMaterials?: number
            materials?: unknown[]
          }
          const first = json.materials?.[0]
          setPreviewAlt({
            rawText: first ? JSON.stringify(first, null, 2) : '{}',
            total: json.totalMaterials ?? json.materials?.length ?? null,
          })
        } else if (state.format === 'markdown') {
          // Markdown export returns text/markdown as a downloadable file —
          // we fetch the same URL the download would hit and show the first
          // ~80 lines so the user can sanity-check the YAML front-matter,
          // the H1 / callout / table layout before committing to a save.
          // `previewUrl` is guaranteed non-null here because the format
          // dispatch above sets it (only `xlsx` leaves it null, and that
          // branch returns early before reaching this IIFE).
          const r = await fetch(state.previewUrl!, { signal: ctrl.signal })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const text = await r.text()
          const lines = text.split('\n')
          const totalLines = lines.length
          const preview = lines.slice(0, 80).join('\n')
          // Extract the material count from the YAML front-matter
          // (`materials: N`) when present so the preview badge can show
          // how many rows the full doc contains.
          const m = text.match(/^materials:\s*(\d+)\s*$/m)
          setPreviewAlt({
            rawText: preview,
            total: m ? Number(m[1]) : totalLines,
          })
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setPreviewError((e as Error).message)
      } finally {
        setPreviewLoading(false)
      }
    })()
    return () => ctrl.abort()
  }, [state])

  return (
    <TabErrorBoundary tabName={t('results.exportPreview.tabName')}>
      <Dialog
        open={!!state}
        onOpenChange={(o) => {
          if (!o) onClose()
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="w-4 h-4 text-teal-500 shrink-0" />
              <span className="truncate">{state?.title}</span>
            </DialogTitle>
            <DialogDescription>
              {t('results.exportPreview.desc')}
            </DialogDescription>
          </DialogHeader>

          <div className="py-1 space-y-3">
            {previewLoading && (
              <div className="flex items-center justify-center py-10 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {t('results.exportPreview.loading')}
              </div>
            )}

            {previewError && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
                {t('results.exportPreview.errorPrefix')}{' '}
                <code className="text-xs">{previewError}</code>
              </div>
            )}

            {/* CSV / LaTeX preview: structured 5-row table + raw first 3 lines */}
            {(state?.format === 'csv' ||
              state?.format === 'latex') &&
              previewData && (
                <>
                  <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 p-2.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                    <span>
                      {t('results.exportPreview.totalRows')}:{' '}
                      <strong className="tabular-nums">{previewData.totalRows}</strong>{' '}
                      <span className="text-slate-400">
                        ({t('results.exportPreview.showingFirst5')})
                      </span>
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[11px] sm:text-[10px] uppercase tracking-wide"
                    >
                      {previewData.format}
                    </Badge>
                  </div>

                  <div className="rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="max-h-72 overflow-auto matlit-scrollbar">
                      <table className="w-full text-[11px] min-w-[700px]">
                        <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                          <tr className="text-left text-slate-500">
                            {previewData.headers.map((h) => (
                              <th
                                key={h}
                                className="p-1.5 font-medium whitespace-nowrap border-b border-slate-200 dark:border-slate-800"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.rows.map((r, i) => (
                            <tr
                              key={i}
                              className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                            >
                              {previewData.headers.map((h) => {
                                const v = String(r[h] ?? '')
                                return (
                                  <td
                                    key={h}
                                    className="p-1.5 align-top whitespace-nowrap max-w-[220px] truncate"
                                    title={v}
                                  >
                                    {v || (
                                      <span className="text-slate-300 dark:text-slate-700">
                                        —
                                      </span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                          {previewData.rows.length === 0 && (
                            <tr>
                              <td
                                colSpan={previewData.headers.length}
                                className="p-6 text-center text-slate-400"
                              >
                                {t('results.exportPreview.noDataRows')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      {t('results.exportPreview.fileHeader')}
                    </div>
                    <pre className="rounded-md bg-slate-900 text-slate-100 dark:bg-black/60 p-3 text-[11px] leading-relaxed overflow-x-auto max-h-44 whitespace-pre-wrap break-all border border-slate-800">
                      {previewData.rawPreview}
                    </pre>
                  </div>
                </>
              )}

            {/* BibTeX preview: first entry as text + total entry count */}
            {state?.format === 'bibtex' && previewAlt && (
              <>
                <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 p-2.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                  <span>
                    {t('results.exportPreview.totalEntries')}:{' '}
                    <strong className="tabular-nums">
                      {previewAlt.total ?? '—'}
                    </strong>{' '}
                    <span className="text-slate-400">
                      ({t('results.exportPreview.showingFirstEntry')})
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[11px] sm:text-[10px] uppercase tracking-wide"
                  >
                    BibTeX
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium flex items-center gap-1.5">
                    <Quote className="w-3.5 h-3.5" />
                    {t('results.exportPreview.firstBibtex')}
                  </div>
                  <pre className="rounded-md bg-slate-900 text-slate-100 dark:bg-black/60 p-3 text-[11px] leading-relaxed overflow-x-auto max-h-80 whitespace-pre-wrap break-all border border-slate-800">
                    {previewAlt.rawText}
                  </pre>
                </div>
              </>
            )}

            {/* JSON preview: first material object + total materials count */}
            {state?.format === 'json' && previewAlt && (
              <>
                <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 p-2.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                  <span>
                    {t('results.exportPreview.totalMaterials')}:{' '}
                    <strong className="tabular-nums">
                      {previewAlt.total ?? '—'}
                    </strong>{' '}
                    <span className="text-slate-400">
                      ({t('results.exportPreview.showingFirstItem')})
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[11px] sm:text-[10px] uppercase tracking-wide"
                  >
                    JSON
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium flex items-center gap-1.5">
                    <Braces className="w-3.5 h-3.5" />
                    {t('results.exportPreview.firstJsonItem')}
                  </div>
                  <pre className="rounded-md bg-slate-900 text-slate-100 dark:bg-black/60 p-3 text-[11px] leading-relaxed overflow-x-auto max-h-80 whitespace-pre-wrap break-all border border-slate-800">
                    {previewAlt.rawText}
                  </pre>
                </div>
              </>
            )}

            {/* Excel preview: binary format, no fetchable preview. Show a
                static note explaining that the download will mirror the CSV
                export's full dataset (all 16 columns). */}
            {state?.format === 'xlsx' && (
              <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 text-sm text-slate-600 dark:text-slate-300 flex items-start gap-3">
                <FileSpreadsheet className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-200 mb-1">
                    {t('results.exportPreview.xlsxTitle')}
                  </p>
                  <p className="text-xs leading-relaxed">
                    {t('results.exportPreview.xlsxDesc')}
                  </p>
                </div>
              </div>
            )}

            {/* Markdown preview (G10): first ~80 lines of the .md doc, with
                a badge showing either the material count (parsed from the
                YAML front-matter) or the total line count. The download URL
                carries no query string by default → full results table;
                pass ?materialId= or ?ids= via openExportPreview for the
                single-card / comparison variants. */}
            {state?.format === 'markdown' && previewAlt && (
              <>
                <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 p-2.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                  <span>
                    {t('results.exportPreview.materialsLines')}:{' '}
                    <strong className="tabular-nums">
                      {previewAlt.total ?? '—'}
                    </strong>{' '}
                    <span className="text-slate-400">
                      ({t('results.exportPreview.showingFirst80')})
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[11px] sm:text-[10px] uppercase tracking-wide"
                  >
                    Markdown
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5" />
                    {t('results.exportPreview.markdownTitle')}
                  </div>
                  <pre className="rounded-md bg-slate-900 text-slate-100 dark:bg-black/60 p-3 text-[11px] leading-relaxed overflow-x-auto max-h-[60vh] whitespace-pre-wrap break-all border border-slate-800">
                    {previewAlt.rawText}
                  </pre>
                  <p className="mt-1.5 text-[11px] sm:text-[10px] text-slate-400">
                    {t('results.exportPreview.markdownDesc')}
                  </p>
                </div>
              </>
            )}

          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="sm:mr-auto"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => state && onConfirmDownload(state)}
              className="bg-teal-600 hover:bg-teal-700"
              disabled={previewLoading}
            >
              <Download className="w-4 h-4 mr-1" />
              {t('results.exportPreview.download')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TabErrorBoundary>
  )
}
