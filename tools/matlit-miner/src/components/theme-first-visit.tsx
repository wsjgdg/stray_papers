'use client'

import { useEffect, useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/components/i18n/provider'

const PROMPT_KEY = 'matlit-theme-prompted'

/**
 * One-time dark-mode hint banner.
 *
 * Behaviour:
 *  - On first visit (no `matlit-theme-prompted` flag in localStorage),
 *    show a small dismissible banner above the tabs.
 *  - The banner tells the user dark mode is supported and where the toggle is.
 *  - Clicking "Got it" (or the X) sets the flag so the banner never reappears.
 *
 * The next-themes ThemeProvider is configured with
 * `defaultTheme="system" enableSystem`, so a user with no preference
 * automatically gets their OS preference (and light as the final fallback).
 */
export function ThemeFirstVisit() {
  const { t } = useI18n()
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      const prompted = localStorage.getItem(PROMPT_KEY)
      if (!prompted) {
        // Small delay so it doesn't flash before the page settles
        const id = setTimeout(() => setShow(true), 600)
        return () => clearTimeout(id)
      }
    } catch {
      // localStorage may be unavailable (private mode); skip silently
    }
  }, [])

  const dismiss = () => {
    setShow(false)
    try {
      localStorage.setItem(PROMPT_KEY, '1')
    } catch {
      // ignore
    }
  }

  if (!show) return null

  return (
    <Alert className="mb-4 border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <Lightbulb className="h-4 w-4 text-amber-500 dark:text-amber-400" />
      <AlertTitle className="flex items-center gap-2">
        {t('theme.firstVisit.banner')}
        <button
          onClick={dismiss}
          aria-label={t('theme.firstVisit.close')}
          className="ml-auto text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </AlertTitle>
      <AlertDescription className="flex items-center gap-2 flex-wrap">
        <span>{t('theme.firstVisit.toggleHint')}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={dismiss}
          className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/50"
        >
          {t('theme.firstVisit.dismiss')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
