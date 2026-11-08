'use client'

import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  ExternalLink,
  Trash2,
  Quote,
  Calendar,
  Users,
  BarChart3,
  Sparkles,
  FileDown,
  ChevronRight,
  CheckCircle2,
  Languages,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { doiUrl } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'
import { FormulaViewer } from '@/components/matlit/formula-viewer'
import { Paper, isChinesePaper, SOURCE_META, OA_STATUS_COLOR } from './shared'

/**
 * PaperCard — the row card shown in the mobile / "cards" view of PapersTab.
 *
 * Extracted from `papers-tab.tsx` (M1b). The prop API is unchanged from the
 * original inline definition so the parent doesn't need any edits beyond the
 * import line.
 *
 * Two render paths:
 *   - Desktop / non-touch (default): bare card, click-to-open.
 *   - Mobile / touch (`enableSwipe` set): wrapped in a draggable layer with
 *     left/right action reveals — swipe right toggles selection, swipe left
 *     deletes. dragSnapToOrigin springs the card back so the action fires
 *     exactly once in onDragEnd.
 */
export interface PaperCardProps {
  paper: Paper
  selected: boolean
  onToggleSelect: () => void
  onOpenDrawer: () => void
  onDelete?: () => void
  enableSwipe?: boolean
}

export function PaperCard({ paper, selected, onToggleSelect, onOpenDrawer, onDelete, enableSwipe }: PaperCardProps) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const authors = paper.authors ? paper.authors.split(';').map(a => a.trim()).filter(Boolean) : []
  const doi = paper.doi
  const cls = paper.classification
  const altSources = paper.altSources ? paper.altSources.split(';').filter(Boolean) : []
  const allSources = [paper.source, ...altSources].filter(Boolean)

  // D5 — swipe-to-select / swipe-to-delete on touch devices.
  //
  // framer-motion's drag uses pointer events but does NOT intercept the
  // browser's subsequent `click` event after pointerup. Without a guard,
  // every swipe would also open the detail drawer. We track a ref flag set
  // in onDragEnd and check it in the inner card body's onClick handler,
  // resetting it after a short tick so normal taps still work.
  const dragHappenedRef = useRef(false)
  const swipe = !!enableSwipe

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: { offset: { x: number; y: number } }) => {
    const dx = info.offset.x
    if (Math.abs(dx) > 10) {
      dragHappenedRef.current = true
    }
    // Threshold: |dx| > 50px triggers the action; otherwise dragSnapToOrigin
    // springs the card back to x=0.
    if (dx > 50) {
      onToggleSelect()
    } else if (dx < -50 && onDelete) {
      onDelete()
    }
    window.setTimeout(() => { dragHappenedRef.current = false }, 150)
  }

  const innerCard = (
    <div
      className={`rounded-lg border p-3 transition-all ${
        selected
          ? 'border-sky-400 bg-sky-50/60 dark:bg-sky-950/30 ring-1 ring-sky-300 dark:border-sky-600 dark:ring-sky-700'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-300 dark:hover:border-sky-700 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Selection checkbox. The <label> is the 44x44 tap target (mobile a11y)
            and the Checkbox is the real accessible control, so toggling,
            keyboard handling and the focus ring all come from Radix. The wrapper
            used to be a <button> wrapping a <Checkbox> -- but Checkbox renders
            its own <button role="checkbox">, so this was a button inside a
            button: invalid HTML, a hydration error, and no keyboard access. */}
        <label className="shrink-0 -ml-1 p-1 min-w-[44px] min-h-[44px] flex items-start justify-center cursor-pointer">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            className="mt-1.5"
            aria-label={t('papers.paperCard.selectAria')}
          />
        </label>
        {/* Card body — tap (or Enter/Space) to open the detail drawer. */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={(e) => {
            // Suppress the click that follows a drag (swipe gesture).
            // framer-motion's drag uses pointer events but doesn't intercept
            // the browser's post-drag click, so we gate it here via a ref
            // flag set in onDragEnd. This is a no-op when swipe is disabled.
            if (dragHappenedRef.current) {
              e.preventDefault()
              e.stopPropagation()
              return
            }
            onOpenDrawer()
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDrawer() } }}
          aria-label={t('papers.paperCard.openAria')}
        >
          {/* Row 1: material + synth badge + language badge */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <Badge variant="outline" className="text-[11px] sm:text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
              <FormulaViewer formula={paper.material.name} size="sm" colorful={false} />
            </Badge>
            {cls && (
              <Badge
                variant="outline"
                className={`text-[11px] sm:text-[10px] ${
                  cls.synthesized === 'yes'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : cls.synthesized === 'no'
                    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300'
                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300'
                }`}
              >
                <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                {t(`common.${cls.synthesized}`)}
              </Badge>
            )}
            {/* P2-8: language badge for Chinese papers — amber pill with a
                tooltip hinting that an English translation is available
                (either already translated or available via "Translate all"). */}
            {isChinesePaper(paper) && (
              <Badge
                variant="outline"
                className="text-[11px] sm:text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900"
                title={paper.translatedTitle
                  ? (t('papers.paperCard.translatedAvailable'))
                  : (t('papers.paperCard.translateHint'))}
              >
                <Languages className="w-2.5 h-2.5 mr-0.5" />
                中文
              </Badge>
            )}
          </div>
          {/* Title — 2-line clamp, prominent */}
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2" title={paper.title}>
            {paper.title}
          </h4>
          {/* P2-8: English translation (if available) shown in parentheses
              directly under the original Chinese title, dimmed + italicised. */}
          {paper.translatedTitle && paper.translatedTitle.trim() && paper.translatedTitle.trim() !== paper.title.trim() && (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic leading-snug line-clamp-2 mt-0.5">
              ({paper.translatedTitle})
            </p>
          )}
          {/* Authors — 1-line clamp */}
          {authors.length > 0 && (
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Users className="w-3 h-3 shrink-0" />
              <span className="line-clamp-1">{authors.slice(0, 4).join(', ')}{authors.length > 4 ? ' et al.' : ''}</span>
            </div>
          )}
          {/* Row 2: year + citations + venue (1-line clamp metadata) */}
          <div className="flex items-center gap-2 flex-wrap mt-1.5 text-xs text-slate-500">
            {paper.year && (
              <span className="flex items-center gap-0.5 shrink-0">
                <Calendar className="w-3 h-3" /> {paper.year}
              </span>
            )}
            {paper.citationCount > 0 && (
              <span className="flex items-center gap-0.5 shrink-0">
                <BarChart3 className="w-3 h-3" /> {paper.citationCount} {t('common.cit')}
              </span>
            )}
            {paper.venue && (
              <span className="italic line-clamp-1 min-w-0">{paper.venue}</span>
            )}
          </div>
          {/* Source provenance badges */}
          {allSources.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1.5">
              {allSources.map((src) => {
                const meta = SOURCE_META[src]
                if (!meta) return null
                return (
                  <span key={src} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-[9px] font-medium border ${meta.color}`} title={meta.label}>
                    {meta.short}
                  </span>
                )
              })}
              {allSources.length > 1 && (
                <span className="text-[10px] sm:text-[9px] text-slate-400 ml-0.5">×{allSources.length} {t('common.sources')}</span>
              )}
            </div>
          )}
          {/* Abstract toggle — stopPropagation so it doesn't open the drawer */}
          {paper.abstract && (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
              >
                <Quote className="w-3 h-3" />
                {expanded ? t('papers.results.hideAbstract') : t('papers.results.showAbstract')}
              </button>
              {expanded && (
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-2 rounded">
                  {paper.abstract}
                </p>
              )}
            </div>
          )}
        </div>
        {/* Right column: chevron (tap hint) + DOI/OA links */}
        <div className="flex flex-col items-end gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <ChevronRight className="w-4 h-4 text-slate-400 mt-0.5" aria-hidden="true" />
          {doi ? (
            <a
              href={doiUrl(doi)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"
            >
              DOI <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <span className="text-xs text-slate-400">{t('papers.results.noDoi')}</span>
          )}
          {paper.oaUrl && (
            <a
              href={paper.oaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              <FileDown className="w-3 h-3" /> {t('papers.results.pdf')}
            </a>
          )}
          {paper.oaStatus && paper.oaStatus !== 'closed' && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-[9px] font-medium border ${OA_STATUS_COLOR[paper.oaStatus] || OA_STATUS_COLOR.oa}`}>
              {paper.oaStatus}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  // Desktop / non-touch: render the bare card (click-to-open, no swipe layer).
  if (!swipe) {
    return innerCard
  }

  // Mobile / touch: wrap the card in a draggable layer with two background
  // action reveals — green check on the LEFT (revealed when swiping right →
  // toggle selection) and red trash on the RIGHT (revealed when swiping
  // left → delete). dragSnapToOrigin springs the card back to x=0 after
  // release, so the action fires once in onDragEnd and the card visually
  // resets. Threshold is enforced inside handleDragEnd (50px).
  return (
    <div className="relative rounded-lg overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 w-1/2 bg-emerald-500 flex items-center justify-center text-white"
        aria-hidden="true"
      >
        <CheckCircle2 className="w-6 h-6" />
      </div>
      <div
        className="absolute inset-y-0 right-0 w-1/2 bg-red-500 flex items-center justify-center text-white"
        aria-hidden="true"
      >
        <Trash2 className="w-6 h-6" />
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: -120, right: 120 }}
        dragSnapToOrigin
        dragElastic={0.5}
        onDragStart={() => { dragHappenedRef.current = false }}
        onDragEnd={handleDragEnd}
        className="relative z-10"
      >
        {innerCard}
      </motion.div>
    </div>
  )
}
