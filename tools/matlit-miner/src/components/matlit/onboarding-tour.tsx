'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, ChevronLeft, Check, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/components/i18n/provider'

/**
 * P1-4 — 5-step onboarding tour for first-time users.
 *
 * Behaviour:
 *  - Auto-starts on first visit (when `matlit-onboarding-complete` is absent
 *    from localStorage). A short delay lets the dashboard render first.
 *  - Each step highlights a UI element with a spotlight (dark backdrop with a
 *    cutout via a huge box-shadow) and shows a tooltip card next to it.
 *  - Tooltip placement is computed from the target's bounding rect and
 *    available viewport space (below → above → right → left).
 *  - "Skip" / X / Escape mark the tour complete and close it.
 *  - "Next" on the final step marks complete and closes.
 *  - "Replay tour" is triggered via a `matlit:replay-tour` CustomEvent
 *    (dispatched from the Help dialog button). Replay clears the localStorage
 *    flag, navigates back to the dashboard, and restarts from step 1.
 *
 * Targeting:
 *  - Step 1 (hero card): `main#main-content [data-slot="card"]` (first card
 *    on the dashboard, which is the gradient hero).
 *  - Steps 2–5 (tabs): `[data-tour="<tab>"]` attributes added to the
 *    TabsTrigger elements in page.tsx. This is locale- and order-independent.
 *  - When multiple matches exist (desktop + mobile tab lists), the first
 *    element with non-zero layout size is picked.
 *  - The target is scrolled into view (handles the mobile horizontal tab
 *    scroller) before measuring.
 */

const STORAGE_KEY = 'matlit-onboarding-complete'
const REPLAY_EVENT = 'matlit:replay-tour'

type Placement = 'bottom' | 'top' | 'right' | 'left'

interface TourStep {
  /** CSS selector for the element to highlight. */
  selector: string
  titleEn: string
  titleZh: string
  descEn: string
  descZh: string
}

const STEPS: TourStep[] = [
  {
    selector: 'main#main-content [data-slot="card"]',
    titleEn: 'Welcome to MatLit Miner',
    titleZh: '欢迎使用 MatLit Miner',
    descEn:
      "This tool helps you mine material science literature with AI. Let's take a quick tour of the key workflow.",
    descZh: '本工具帮你用 AI 挖掘材料科学文献。让我们快速浏览一下核心工作流。',
  },
  {
    selector: '[data-tour="materials"]',
    titleEn: 'Materials tab',
    titleZh: 'Materials 标签',
    descEn:
      'Start by exploring 60+ solar cell materials with their properties — bandgap, crystal structure, and synthesis routes.',
    descZh: '从这里开始，浏览 60+ 种太阳能电池材料及其属性——带隙、晶体结构与合成路线。',
  },
  {
    selector: '[data-tour="papers"]',
    titleEn: 'Papers tab',
    titleZh: 'Papers 标签',
    descEn:
      'Search thousands of papers from Semantic Scholar & CrossRef. Batch-search by material or query.',
    descZh: '搜索来自 Semantic Scholar 与 CrossRef 的数千篇论文，可按材料批量检索。',
  },
  {
    selector: '[data-tour="classification"]',
    titleEn: 'Classification tab',
    titleZh: 'Classification 标签',
    descEn:
      'Use AI to classify papers by whether they report synthesis of your target material — filter the noise instantly.',
    descZh: '用 AI 判断论文是否报道了目标材料的合成——快速过滤无关文献。',
  },
  {
    selector: '[data-tour="results"]',
    titleEn: 'Results tab',
    titleZh: 'Results 标签',
    descEn:
      'Export your aggregated findings as CSV, BibTeX, or LaTeX — ready for your review or manuscript.',
    descZh: '将汇总结果导出为 CSV、BibTeX 或 LaTeX——可直接用于评审或论文撰写。',
  },
]

/** Pick the first visible (non-zero-size) element matching the selector. */
function findVisibleElement(selector: string): HTMLElement | null {
  const matches = Array.from(document.querySelectorAll<HTMLElement>(selector))
  if (matches.length === 0) return null
  for (const el of matches) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return el
  }
  return matches[0] ?? null
}

interface TooltipPosition {
  top: number
  left: number
  placement: Placement
}

export function OnboardingTour({
  onNavigateHome,
}: {
  /** Called when the tour starts so the dashboard (step 1 target) is visible. */
  onNavigateHome?: () => void
}) {
  const { t, pick } = useI18n()

  const [isActive, setIsActive] = useState(false)
  const [step, setStep] = useState(0)
  const [spotlight, setSpotlight] = useState<{
    top: number
    left: number
    width: number
    height: number
    radius: number
  } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null)

  const tooltipRef = useRef<HTMLDivElement>(null)
  const navigateHomeRef = useRef(onNavigateHome)
  useEffect(() => {
    navigateHomeRef.current = onNavigateHome
  }, [onNavigateHome])

  /** Mark the tour complete and tear down. */
  const complete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* localStorage unavailable — ignore */
    }
    setIsActive(false)
    setStep(0)
    setSpotlight(null)
    setTooltipPos(null)
  }, [])

  /** (Re)start the tour from step 1. Used by both auto-start and replay. */
  const start = useCallback(() => {
    // Clear the flag so a subsequent first-visit check would also fire.
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    navigateHomeRef.current?.()
    // Allow the dashboard tab to render before measuring step 1's target.
    setStep(0)
    setSpotlight(null)
    setTooltipPos(null)
    window.setTimeout(() => setIsActive(true), 450)
  }, [])

  // Auto-start on first visit (localStorage flag absent).
  useEffect(() => {
    let done = false
    try {
      done = localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      /* ignore */
    }
    if (done) return
    const id = window.setTimeout(() => {
      navigateHomeRef.current?.()
      // Extra delay so the dashboard's hero card has rendered + laid out.
      window.setTimeout(() => setIsActive(true), 500)
    }, 900)
    return () => window.clearTimeout(id)
  }, [])

  // Listen for the replay custom event (dispatched from the Help dialog).
  useEffect(() => {
    const handler = () => start()
    window.addEventListener(REPLAY_EVENT, handler)
    return () => window.removeEventListener(REPLAY_EVENT, handler)
  }, [start])

  // Lock body scroll while the tour is active so the spotlight stays stable.
  useEffect(() => {
    if (!isActive) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isActive])

  // Recompute spotlight rect + tooltip position whenever the step changes.
  useLayoutEffect(() => {
    if (!isActive) return
    const current = STEPS[step]
    if (!current) return

    const measure = () => {
      const el = findVisibleElement(current.selector)
      if (!el) {
        setSpotlight(null)
        setTooltipPos(null)
        return
      }
      // Scroll the target into view first (matters for the mobile tab
      // scroller and for elements lower down the dashboard).
      try {
        el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
      } catch {
        /* scrollIntoView may throw on very old browsers — ignore */
      }
      // Defer the measurement until after the smooth-scroll settles.
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        const radius = (() => {
          const v = parseFloat(window.getComputedStyle(el).borderRadius || '0')
          return Number.isFinite(v) ? Math.min(v, 16) : 8
        })()
        setSpotlight({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          radius,
        })

        // Tooltip placement: prefer below, then above, right, left.
        const tt = tooltipRef.current
        const ttW = tt?.offsetWidth ?? 340
        const ttH = tt?.offsetHeight ?? 220
        const margin = 12
        const vw = window.innerWidth
        const vh = window.innerHeight

        let placement: Placement = 'bottom'
        if (rect.bottom + ttH + margin <= vh) placement = 'bottom'
        else if (rect.top - ttH - margin >= 0) placement = 'top'
        else if (rect.right + ttW + margin <= vw) placement = 'right'
        else if (rect.left - ttW - margin >= 0) placement = 'left'
        else placement = 'bottom'

        let top: number
        let left: number
        if (placement === 'bottom') {
          top = rect.bottom + margin
          left = rect.left + rect.width / 2 - ttW / 2
        } else if (placement === 'top') {
          top = rect.top - ttH - margin
          left = rect.left + rect.width / 2 - ttW / 2
        } else if (placement === 'right') {
          top = rect.top + rect.height / 2 - ttH / 2
          left = rect.right + margin
        } else {
          top = rect.top + rect.height / 2 - ttH / 2
          left = rect.left - ttW - margin
        }
        // Clamp into the viewport (16px safe margin).
        left = Math.max(16, Math.min(left, vw - ttW - 16))
        top = Math.max(16, Math.min(top, vh - ttH - 16))
        setTooltipPos({ top, left, placement })
      })
    }

    measure()
    // Recompute on viewport changes or ancestor scrolls.
    const onViewport = () => measure()
    window.addEventListener('resize', onViewport)
    window.addEventListener('scroll', onViewport, true)
    // Periodic re-measure handles lazy-loaded content shifting the layout.
    const interval = window.setInterval(measure, 600)
    return () => {
      window.removeEventListener('resize', onViewport)
      window.removeEventListener('scroll', onViewport, true)
      window.clearInterval(interval)
    }
  }, [isActive, step])

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) {
      complete()
    } else {
      setStep((s) => s + 1)
    }
  }, [step, complete])

  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1))
  }, [])

  // Keyboard shortcuts: Esc = skip, → = next, ← = prev.
  useEffect(() => {
    if (!isActive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        complete()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, next, prev, complete])

  if (!isActive) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const pad = 6 // spotlight padding around the target

  return (
    <div
      className="fixed inset-0 z-[200] font-sans"
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.aria')}
    >
      {/* Spotlight: a small div positioned over the target with a giant
          box-shadow that darkens everything outside the cutout. */}
      <AnimatePresence>
        {spotlight ? (
          <motion.div
            key="spotlight"
            initial={false}
            animate={{
              top: spotlight.top - pad,
              left: spotlight.left - pad,
              width: spotlight.width + pad * 2,
              height: spotlight.height + pad * 2,
            }}
            transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
            className="absolute pointer-events-none"
            style={{
              borderRadius: spotlight.radius + pad,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.62)',
              outline: '2px solid rgb(16, 185, 129)',
              outlineOffset: '2px',
            }}
          />
        ) : (
          <motion.div
            key="backdrop-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/62 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        {tooltipPos && (
          <motion.div
            key={step}
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 6 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute z-[201] w-[min(92vw,340px)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-4"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <Compass className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 leading-tight">
                  {pick(current.titleEn, current.titleZh)}
                </h3>
              </div>
              <button
                type="button"
                onClick={complete}
                className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-md p-0.5"
                aria-label={t('onboarding.closeAria')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              {pick(current.descEn, current.descZh)}
            </p>

            {/* Step indicator dots + counter */}
            <div className="flex items-center gap-1.5 mb-3">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step
                      ? 'w-6 bg-emerald-500'
                      : i < step
                        ? 'w-1.5 bg-emerald-300 dark:bg-emerald-700'
                        : 'w-1.5 bg-slate-200 dark:bg-slate-700'
                  }`}
                />
              ))}
              <span className="ml-auto text-[10px] text-slate-400 tabular-nums">
                {step + 1} / {STEPS.length}
              </span>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                onClick={complete}
              >
                {t('onboarding.skip')}
              </Button>
              <div className="flex items-center gap-1.5">
                {step > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={prev}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    {t('onboarding.back')}
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={next}
                >
                  {isLast
                    ? t('onboarding.finish')
                    : t('onboarding.next')}
                  {isLast ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Centered fallback tooltip when no target is found for the step. */}
      {!spotlight && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto w-[min(92vw,340px)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-4 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('onboarding.locating')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
