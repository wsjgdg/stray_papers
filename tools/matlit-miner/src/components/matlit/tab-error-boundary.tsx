'use client'

import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { useI18n } from '@/components/i18n/provider'

interface TabErrorBoundaryProps {
  children: ReactNode
  /** Display name of the tab — shown in the error card and used to reset
   *  error state when the user switches tabs. */
  tabName: string
}

interface TabErrorBoundaryState {
  hasError: boolean
  error?: Error
  /** Snapshot of the component stack captured in `componentDidCatch`. */
  componentStack?: string | null
  /** Marker used to detect when `tabName` changes so we can auto-clear a
   *  stale error state on tab switch (prevents the card from "sticking"
   *  after the user navigates away and back). */
  tabName: string
}

/**
 * Per-tab React error boundary.
 *
 * The global <ErrorBoundary /> in `src/components/error-boundary.tsx`
 * catches anything that escapes a tab, but it covers *all* tab content at
 * once — meaning a single broken tab poisons the entire TabsContent slot
 * and even sibling tabs can't be re-rendered cleanly. This component wraps
 * *each* tab individually so a runtime crash in (e.g.) PapersTab renders a
 * friendly inline card *only* inside the Papers tab while the rest of the
 * shell (header, sidebar, other tabs) keeps working.
 *
 * Behaviour:
 *  - On an uncaught render error: render an amber error card with the
 *    truncated error message, a "Reload tab" button (clears state →
 *    children re-mount), a "Copy error" button (full stack+message to the
 *    clipboard for bug reports), and a placeholder "Report issue" link.
 *  - `componentDidCatch` logs the error + component stack to the console
 *    so devs can see what happened without needing to wire up an API.
 *  - When `props.tabName` changes (e.g. user switches tabs), the boundary
 *    auto-clears any previous error so the new tab starts fresh. This is
 *    implemented via `getDerivedStateFromProps`.
 */
export class TabErrorBoundary extends Component<
  TabErrorBoundaryProps,
  TabErrorBoundaryState
> {
  constructor(props: TabErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, tabName: props.tabName }
  }

  static getDerivedStateFromError(error: Error): Partial<TabErrorBoundaryState> {
    return { hasError: true, error }
  }

  static getDerivedStateFromProps(
    props: TabErrorBoundaryProps,
    state: TabErrorBoundaryState,
  ): Partial<TabErrorBoundaryState> | null {
    // Auto-clear the error when the tab changes. Returning null means
    // "no state update needed".
    if (state.hasError && state.tabName !== props.tabName) {
      return { hasError: false, error: undefined, componentStack: null, tabName: props.tabName }
    }
    if (state.tabName !== props.tabName) {
      return { tabName: props.tabName }
    }
    return null
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // Surface the error in the browser console so devs can debug. We do
    // NOT post to an API per task scope — the "Copy error" button is the
    // user-facing escape hatch for filing bug reports.
    console.error(
      `[TabErrorBoundary:${this.props.tabName}] runtime error:`,
      error,
      info.componentStack,
    )
    this.setState({ componentStack: info.componentStack ?? null })
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, componentStack: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <TabErrorCard
          tabName={this.props.tabName}
          error={this.state.error}
          componentStack={this.state.componentStack}
          onReset={this.handleReset}
        />
      )
    }
    return this.props.children
  }
}

interface TabErrorCardProps {
  tabName: string
  error?: Error
  componentStack?: string | null
  onReset: () => void
}

/**
 * Functional subcomponent for the error card UI. Lives in the same file
 * because it is tightly coupled to TabErrorBoundary and needs access to
 * the i18n hook (which class components can't use directly).
 */
function TabErrorCard({ tabName, error, componentStack, onReset }: TabErrorCardProps) {
  const { t } = useI18n()

  const fullText = [
    `Tab: ${tabName}`,
    `Message: ${error?.message ?? t('errorBoundary.unknown')}`,
    `Stack:`,
    error?.stack ?? '(no stack)',
    componentStack ? `Component stack:\n${componentStack}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(fullText)
        toast.success(t('errorBoundary.copied'))
      } else {
        // Fallback for very old browsers / non-secure contexts.
        const ta = document.createElement('textarea')
        ta.value = fullText
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        toast.success(t('errorBoundary.copied'))
      }
    } catch {
      toast.error(t('errorBoundary.copyFailed'))
    }
  }

  // Truncate the visible message so the card never blows out the layout.
  // The full stack is always available via the "Copy error" button.
  const truncatedMessage =
    error?.message && error.message.length > 500
      ? `${error.message.slice(0, 500)}…`
      : error?.message ?? t('errorBoundary.unknown')

  return (
    <Card
      role="alert"
      aria-live="assertive"
      className="border-amber-300/70 dark:border-amber-700/50 bg-amber-50/60 dark:bg-amber-950/20"
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/40 p-2.5">
            <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('errorBoundary.title')}
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t('errorBoundary.tabLabel', { name: tabName })}
              <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
              {t('errorBoundary.desc')}
            </p>

            <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-amber-200/70 dark:border-amber-800/40 bg-white/80 dark:bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words font-mono">
              {truncatedMessage}
            </pre>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={onReset}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                {t('errorBoundary.reload')}
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                {t('errorBoundary.copyError')}
              </Button>
              <a
                href="https://github.com/matlit/miner/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline-offset-2 hover:underline"
              >
                {t('errorBoundary.report')}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default TabErrorBoundary
