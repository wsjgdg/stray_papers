'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  Upload,
  UploadCloud,
  FileUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useI18n } from '@/components/i18n/provider'
import { getLLMHeaders } from '@/lib/api-client'

/**
 * G8: PDF upload + LLM extraction dialog.
 *
 * Lets the user drag-drop (or click to pick) up to 10 local PDFs, optionally
 * select a target material, then sequentially extracts a Paper record
 * (title / authors / DOI / abstract / bandgap / efficiency / synthesis
 * method / conditions) from each PDF via the LLM. Per-file live status:
 * pending → processing → success / error. On completion, invalidates the
 * `papers` query so the new records surface in the parent list.
 *
 * Extracted from `papers-tab.tsx` (M1b). This is a "smart" component — it
 * owns all upload-related state (file list, drag flag, target material,
 * running flag) so the parent only needs to render `<UploadPdfDialog
 * open={…} onOpenChange={…} materials={…} />`.
 */

type UploadItemStatus = 'pending' | 'processing' | 'success' | 'error'
type UploadItem = {
  id: string // client-side unique id (filename + counter)
  file: File
  status: UploadItemStatus
  // Populated once the API responds for this file.
  paperId?: string | null
  title?: string
  materialName?: string
  error?: string
}

export interface UploadPdfDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  materials: Array<{ id: string; name: string }>
}

/**
 * Read user-configured LLM headers from the multi-config store.
 *
 * Mirrors `getApiKeyHeaders` in src/lib/api-client.ts but ONLY returns the
 * LLM-related headers (x-llm-provider, x-llm-baseurl, x-llm-apikey,
 * x-llm-model, x-llm-configs) — WITHOUT forcing a default
 * `Content-Type: application/json` (which would break FormData uploads,
 * since the browser needs to set the multipart boundary itself).
 *
 * Only the LLM-config headers are included; the source-API keys (S2 /
 * Crossref / OpenAlex / Unpaywall) aren't relevant to the upload endpoint.
 */
function getApiKeyHeaderForUpload(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  return getLLMHeaders()
}

export function UploadPdfDialog({ open, onOpenChange, materials }: UploadPdfDialogProps) {
  const { t } = useI18n()
  const qc = useQueryClient()

  const [uploadItems, setUploadItems] = useState<UploadItem[]>([])
  const [uploadMaterialId, setUploadMaterialId] = useState<string>('')
  const [uploadRunning, setUploadRunning] = useState(false)
  // Drag-active flag — flips while a file is dragged over the dropzone so
  // we can render a highlighted border.
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Counter for generating stable UploadItem ids (incremented on every add).
  const uploadIdCounterRef = useRef(0)

  // Reset upload dialog state when the user closes it so a re-open starts
  // with an empty file list and a clean per-file status. We fire this on
  // open→false transitions only (not on every render) and skip while a run
  // is in flight (the close button is disabled mid-run anyway).
  const resetUploadDialog = useCallback(() => {
    setUploadItems([])
    setUploadMaterialId('')
    setDragActive(false)
  }, [])

  // Reset on close. Wrapped in useEffect so the parent's `open` state
  // change is the single source of truth — when it flips to false and no
  // upload is running, we clear local state for the next open.
  useEffect(() => {
    if (!open && !uploadRunning) {
      resetUploadDialog()
    }
  }, [open, uploadRunning, resetUploadDialog])

  // Add PDF files from drag-drop or the file input. We cap at 10 files per
  // batch to match the server limit, and reject anything that isn't a PDF
  // by content-type OR extension.
  const addPdfFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList)
    const pdfs = incoming.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    )
    const rejected = incoming.length - pdfs.length
    if (rejected > 0) {
      toast.warning(
        t('papers.uploadPdf.toast.excluded', { count: rejected }),
      )
    }
    if (pdfs.length === 0) return
    setUploadItems((prev) => {
      // De-dup by name+size so re-adding the same file via drag + click
      // doesn't double up.
      const existing = new Set(prev.map((p) => `${p.file.name}:${p.file.size}`))
      const next: UploadItem[] = [...prev]
      for (const file of pdfs) {
        const key = `${file.name}:${file.size}`
        if (existing.has(key)) continue
        existing.add(key)
        uploadIdCounterRef.current += 1
        next.push({
          id: `upload-${uploadIdCounterRef.current}`,
          file,
          status: 'pending',
        })
      }
      // Hard-cap at 10 to match the server-side MAX_FILES limit.
      return next.slice(0, 10)
    })
  }, [t])

  const removeUploadItem = useCallback((id: string) => {
    setUploadItems((prev) => prev.filter((p) => p.id !== id))
  }, [])

  // Run extraction sequentially over each pending file. We do per-file
  // fetches (instead of one batched multipart request) so the UI can show
  // a live spinner on the currently-processing file and an inline result
  // for each completed one. After the last file, invalidate the papers
  // query so the new records show up in the list.
  const runPdfUpload = useCallback(async () => {
    if (uploadRunning) return
    const pending = uploadItems.filter((p) => p.status === 'pending')
    if (pending.length === 0) return
    setUploadRunning(true)

    let succeeded = 0
    let failed = 0

    for (const item of pending) {
      // Flip this file to "processing".
      setUploadItems((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'processing' } : p)),
      )
      try {
        const fd = new FormData()
        fd.append('files', item.file)
        if (uploadMaterialId) fd.append('materialId', uploadMaterialId)

        const resp = await fetch('/api/papers/upload-pdf', {
          method: 'POST',
          body: fd,
          headers: {
            // api-client adds API-key headers from localStorage on its own
            // fetch wrapper; here we use plain fetch so we replicate the
            // LLM-config headers manually.
            ...getApiKeyHeaderForUpload(),
          },
        })
        const data = await resp.json().catch(() => ({}))

        if (!resp.ok) {
          throw new Error(
            (data && typeof data === 'object' && 'error' in data
              ? String((data as { error: unknown }).error)
              : `HTTP ${resp.status}`) || `HTTP ${resp.status}`,
          )
        }
        const result = (data?.results?.[0] ?? null) as {
          paperId?: string | null
          success?: boolean
          error?: string
          extracted?: { title?: string; materialName?: string }
        } | null
        if (result?.success) {
          succeeded++
          setUploadItems((prev) =>
            prev.map((p) =>
              p.id === item.id
                ? {
                    ...p,
                    status: 'success',
                    paperId: result.paperId ?? null,
                    title: result.extracted?.title,
                    materialName: result.extracted?.materialName,
                  }
                : p,
            ),
          )
        } else {
          failed++
          setUploadItems((prev) =>
            prev.map((p) =>
              p.id === item.id
                ? {
                    ...p,
                    status: 'error',
                    error: result?.error || 'Unknown error',
                  }
                : p,
            ),
          )
        }
      } catch (e) {
        failed++
        setUploadItems((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? { ...p, status: 'error', error: (e as Error).message.slice(0, 200) }
              : p,
          ),
        )
      }
    }

    setUploadRunning(false)

    const total = succeeded + failed
    if (succeeded > 0) {
      toast.success(
        t('papers.uploadPdf.toast.extracted', { succeeded, total }),
      )
      qc.invalidateQueries({ queryKey: ['papers'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    } else {
      toast.error(
        t('papers.uploadPdf.toast.allFailed', { total }),
      )
    }
  }, [uploadItems, uploadRunning, uploadMaterialId, qc, t])

  // Derived: counts for the summary header.
  const uploadCounts = useMemo(() => {
    let succeeded = 0
    let failed = 0
    let processing = 0
    let pending = 0
    for (const it of uploadItems) {
      if (it.status === 'success') succeeded++
      else if (it.status === 'error') failed++
      else if (it.status === 'processing') processing++
      else pending++
    }
    return { succeeded, failed, processing, pending, total: uploadItems.length }
  }, [uploadItems])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o && !uploadRunning) resetUploadDialog()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-violet-500" />
            {t('papers.uploadPdf.dialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('papers.uploadPdf.dialog.desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {/* Material selector (optional). When left blank the backend
              auto-matches against existing materials by scanning the
              extracted text for material name / alias hits. */}
          <div>
            <Label htmlFor="upload-material" className="text-xs flex items-center gap-1.5">
              <span className="text-slate-500">
                {t('papers.uploadPdf.targetMaterial')}
              </span>
            </Label>
            <Select
              value={uploadMaterialId || '__auto__'}
              onValueChange={(v) => setUploadMaterialId(v === '__auto__' ? '' : v)}
            >
              <SelectTrigger id="upload-material" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">
                  {t('papers.uploadPdf.autoMatch')}
                </SelectItem>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Drag-drop zone + hidden file input. Click anywhere on the
              zone triggers the file picker; drag-enter highlights the
              border in violet. */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              if (uploadRunning) return
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                addPdfFiles(e.dataTransfer.files)
              }
            }}
            onClick={() => !uploadRunning && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !uploadRunning) {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            aria-label={t('papers.uploadPdf.dropzoneAria')}
            className={`relative cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              dragActive
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                : 'border-slate-300 dark:border-slate-700 hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20'
            } ${uploadRunning ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  addPdfFiles(e.target.files)
                }
                // Reset the input value so the same file can be picked
                // again after removal — without this the change event
                // won't fire for a re-pick of the same path.
                e.target.value = ''
              }}
              aria-label={t('papers.uploadPdf.pickAria')}
            />
            <FileUp className={`w-8 h-8 mx-auto mb-2 ${dragActive ? 'text-violet-500' : 'text-slate-400'}`} />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('papers.uploadPdf.dropzonePrimary')}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {t('papers.uploadPdf.dropzoneSecondary')}
            </p>
          </div>

          {/* Per-file list with status. Each row shows: filename,
              status icon (pending / spinner / check / x), extracted title
              + material (on success) or error message (on failure). */}
          {uploadItems.length > 0 && (
            <div className="rounded-md border border-slate-200 dark:border-slate-800">
              {/* Summary header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {t('papers.uploadPdf.fileList')}
                  <span className="ml-1.5 tabular-nums text-slate-400">({uploadItems.length})</span>
                </span>
                {uploadCounts.succeeded + uploadCounts.failed > 0 && (
                  <span className={`tabular-nums ${uploadCounts.failed > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {t('papers.uploadPdf.extracted', { done: uploadCounts.succeeded, total: uploadCounts.succeeded + uploadCounts.failed })}
                    {uploadCounts.failed > 0 && (
                      <span className="ml-1.5 text-amber-600 dark:text-amber-400">
                        {t('papers.uploadPdf.failed', { count: uploadCounts.failed })}
                      </span>
                    )}
                  </span>
                )}
              </div>
              {/* Scrollable list — max height to keep the dialog manageable
                  when 10 files are queued. Custom scrollbar styling via
                  Tailwind utility classes. */}
              <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 [scrollbar-width:thin]">
                {uploadItems.map((item) => (
                  <li key={item.id} className="px-3 py-2 flex items-start gap-2 text-xs">
                    {/* Status icon */}
                    <span className="shrink-0 mt-0.5">
                      {item.status === 'pending' && (
                        <span className="inline-block w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600" aria-label="pending" />
                      )}
                      {item.status === 'processing' && (
                        <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin" aria-label="processing" />
                      )}
                      {item.status === 'success' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-label="success" />
                      )}
                      {item.status === 'error' && (
                        <X className="w-3.5 h-3.5 text-red-500" aria-label="error" />
                      )}
                    </span>
                    {/* Filename + extracted metadata / error */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="line-clamp-1 font-medium text-slate-700 dark:text-slate-200">
                          {item.file.name}
                        </span>
                        <span className="text-[11px] sm:text-[10px] text-slate-400 tabular-nums shrink-0">
                          {(item.file.size / 1024).toFixed(0)} KB
                        </span>
                        {/* Remove button — only when not currently processing
                            and the run hasn't started (or item is done). */}
                        {!uploadRunning && (
                          <button
                            onClick={() => removeUploadItem(item.id)}
                            className="ml-auto text-slate-400 hover:text-red-500 shrink-0"
                            aria-label={t('papers.uploadPdf.remove')}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {item.status === 'success' && (
                        <div className="mt-0.5 pl-5 text-[11px] text-slate-500 dark:text-slate-400">
                          {item.materialName && (
                            <span className="inline-flex items-center gap-0.5 mr-2">
                              <Badge variant="outline" className="text-[10px] sm:text-[9px] py-0 px-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
                                {item.materialName}
                              </Badge>
                            </span>
                          )}
                          <span className="line-clamp-1 italic">
                            {item.title || t('papers.uploadPdf.noTitle')}
                          </span>
                        </div>
                      )}
                      {item.status === 'error' && (
                        <p className="mt-0.5 pl-5 text-[11px] text-red-600 dark:text-red-400 line-clamp-2">
                          {item.error}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Final summary banner — only shows after at least one file
              has finished processing. */}
          {uploadCounts.succeeded + uploadCounts.failed > 0 && !uploadRunning && (
            <div className={`rounded-md p-2.5 text-xs border ${
              uploadCounts.failed > 0
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200'
                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
            }`}>
              <span className="flex items-start gap-1.5">
                {uploadCounts.failed > 0 ? (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                )}
                <span>
                  {t('papers.uploadPdf.summary', {
                    succeeded: uploadCounts.succeeded,
                    total: uploadCounts.total,
                    failed: uploadCounts.failed > 0 ? t('papers.uploadPdf.summary.failed', { failed: uploadCounts.failed }) : '',
                  })}
                </span>
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              if (!uploadRunning) resetUploadDialog()
            }}
            disabled={uploadRunning}
          >
            {t('common.close')}
          </Button>
          <Button
            onClick={() => runPdfUpload()}
            disabled={uploadRunning || uploadCounts.pending === 0}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {uploadRunning ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-1.5" />
            )}
            {uploadRunning
              ? t('papers.uploadPdf.extracting', { done: uploadCounts.succeeded + uploadCounts.failed, total: uploadCounts.total })
              : t('papers.uploadPdf.uploadBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
