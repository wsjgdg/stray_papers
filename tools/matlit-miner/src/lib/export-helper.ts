/**
 * Browser-side download / clipboard helpers.
 *
 * Centralises the recurring "create Blob → object URL → anchor → click → revoke"
 * and `window.open('/api/export/...')` patterns that were previously duplicated
 * across materials-tab, results-tab, and command-palette.
 *
 * These functions touch `window` / `document` / `navigator` and must only be
 * invoked from client components (all callers are `'use client'`).
 */

/**
 * Trigger a file download in the browser.
 *
 * Accepts either a raw string body or a pre-built `Blob`. When a string is
 * supplied, the optional `mimeType` (default `application/octet-stream`) is
 * used to construct the Blob.
 *
 * The object URL is revoked on the next macrotask so the download has time
 * to resolve in browsers that fire the anchor click asynchronously.
 */
export function downloadFile(
  content: string | Blob,
  filename: string,
  mimeType: string = 'application/octet-stream',
): void {
  if (typeof window === 'undefined') return
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke slightly so the download has a chance to start in browsers
  // that resolve the anchor asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Download an arbitrary JSON-serialisable value as a `.json` file.
 *
 * Equivalent to building a `Blob([JSON.stringify(data, null, 2)])` and
 * calling `downloadFile` with `application/json`.
 */
export function downloadJSON(data: unknown, filename: string): void {
  downloadFile(JSON.stringify(data, null, 2), filename, 'application/json')
}

/**
 * Trigger a server-rendered download (CSV / Excel / Markdown / BibTeX …) by
 * opening the export URL in a new tab. The server responds with the actual
 * file via `Content-Disposition: attachment`.
 */
export function downloadFromAPI(url: string): void {
  if (typeof window === 'undefined') return
  window.open(url, '_blank')
}

/**
 * Copy text to the clipboard with a graceful fallback for older browsers /
 * insecure contexts where `navigator.clipboard.writeText` is unavailable.
 *
 * Returns `true` on success, `false` otherwise (so callers can show a
 * fallback "press Ctrl+C" toast).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to legacy path.
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
  return false
}
