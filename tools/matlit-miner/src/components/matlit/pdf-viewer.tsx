'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ExternalLink,
  Download,
  RefreshCw,
  FileText,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useI18n } from '@/components/i18n/provider'

interface PdfViewerProps {
  url: string
  paperId?: string
}

const LOAD_TIMEOUT_MS = 12_000

/**
 * Embedded PDF viewer.
 *
 * Most OA publishers set X-Frame-Options: DENY/SAMEORIGIN, which blocks the
 * browser's native PDF viewer inside an iframe. We work around this by routing
 * the request through /api/proxy/pdf, which strips those headers and adds
 * `Content-Disposition: inline` so the browser renders the PDF inline.
 *
 * If the proxy fails (publisher 403, dead link, etc.) we show a fallback panel
 * with an "Open PDF in new tab" button so the user can still access the file.
 */
export function PdfViewer({ url, paperId }: PdfViewerProps) {
  const { t } = useI18n()
  const [loadFailed, setLoadFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [useProxy, setUseProxy] = useState(true)
  const [retryNonce, setRetryNonce] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(false)

  const proxiedSrc = `/api/proxy/pdf?url=${encodeURIComponent(url)}`
  const directSrc = url
  const iframeSrc = useProxy ? proxiedSrc : directSrc

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    setLoadFailed(false)
    setLoaded(false)
    loadedRef.current = false
    clearTimer()
    timerRef.current = setTimeout(() => {
      // If onLoad never fired within the timeout, mark as failed.
      if (!loadedRef.current) {
        setLoadFailed(true)
      }
    }, LOAD_TIMEOUT_MS)
    return clearTimer
  }, [iframeSrc, clearTimer])

  const handleLoad = useCallback(() => {
    clearTimer()
    loadedRef.current = true
    setLoaded(true)
    setLoadFailed(false)
  }, [clearTimer])

  const handleRetry = useCallback(() => {
    setLoadFailed(false)
    setLoaded(false)
    loadedRef.current = false
    // Bump nonce to remount the iframe via key, forcing a fresh load.
    setRetryNonce((n) => n + 1)
  }, [])

  return (
    <div className="relative w-full h-[70vh] rounded-lg border bg-muted/30 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
          {t('papers.pdfViewer.title')}
        </span>
        <Badge
          variant="outline"
          className="ml-1 text-[9px] px-1 py-0 h-4 font-mono text-slate-500"
        >
          PDF
        </Badge>

        <div className="ml-auto flex items-center gap-1">
          {/* Read-only zoom indicator (browser native viewer controls actual zoom) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] text-slate-500 cursor-default"
                tabIndex={-1}
                disabled
              >
                100%
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom controlled by browser PDF viewer</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" asChild className="h-9 sm:h-7 w-9 sm:w-7 p-0">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('papers.pdfViewer.openExternal')}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('papers.pdfViewer.openExternal')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" asChild className="h-9 sm:h-7 w-9 sm:w-7 p-0">
                <a
                  href={proxiedSrc}
                  download
                  aria-label={t('papers.pdfViewer.download')}
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('papers.pdfViewer.download')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex-1 min-h-0">
        {!loadFailed ? (
          <iframe
            key={`${useProxy}-${retryNonce}`}
            id={`pdf-viewer-iframe-${paperId ?? 'default'}`}
            src={iframeSrc}
            title={t('papers.pdfViewer.title')}
            onLoad={handleLoad}
            className="absolute inset-0 w-full h-full border-0"
            // Allow same-origin so the native PDF viewer can render; popups/forms
            // are needed for viewer chrome (zoom, download) to function.
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        ) : (
          <FallbackPanel
            url={url}
            proxiedSrc={proxiedSrc}
            useProxy={useProxy}
            onToggleProxy={() => setUseProxy((v) => !v)}
            onRetry={handleRetry}
          />
        )}

        {/* Loading shimmer while iframe is loading */}
        {!loaded && !loadFailed && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/30 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-xs">{t('common.loading')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer with proxy indicator */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-t bg-background/95 text-[10px] text-slate-500">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 cursor-help">
              <Info className="w-3 h-3" />
              {useProxy ? 'Image proxy enabled' : 'Direct connection'}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            PDF is streamed through /api/proxy/pdf to bypass X-Frame-Options
            restrictions set by many publishers. Toggle to attempt a direct
            connection.
          </TooltipContent>
        </Tooltip>
        <span className="ml-auto truncate max-w-[60%]" title={url}>
          {url}
        </span>
      </div>
    </div>
  )
}

function FallbackPanel({
  url,
  proxiedSrc,
  useProxy,
  onToggleProxy,
  onRetry,
}: {
  url: string
  proxiedSrc: string
  useProxy: boolean
  onToggleProxy: () => void
  onRetry: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border bg-background p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-medium">
            {t('papers.pdfViewer.loadFailed')}
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          The publisher may be blocking embedded display. Try opening the PDF
          directly, or toggle the connection mode and retry.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              {t('papers.pdfViewer.openExternal')}
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={proxiedSrc} download>
              <Download className="w-3.5 h-3.5 mr-1" />
              {t('papers.pdfViewer.download')}
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={onToggleProxy}>
            {useProxy ? 'Use direct connection' : 'Use image proxy'}
          </Button>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            {t('papers.pdfViewer.retry')}
          </Button>
        </div>
      </div>
    </div>
  )
}
