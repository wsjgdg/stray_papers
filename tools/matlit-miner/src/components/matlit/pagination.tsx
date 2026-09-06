'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/components/i18n/provider'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
}

/**
 * Reusable pagination control with page-size selector.
 * - Shows "Showing X–Y of Z" summary
 * - Previous / Next buttons
 * - Numbered page buttons with ellipsis when there are many pages
 * - Optional page-size selector (default: 10 / 20 / 50 / 100)
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationProps) {
  const { t } = useI18n()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(total, currentPage * pageSize)

  // Build the page list with ellipsis.
  // Always show first / last / current ± 1.
  const pageItems = useMemo<(number | 'ellipsis')[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const items: (number | 'ellipsis')[] = [1]
    const left = Math.max(2, currentPage - 1)
    const right = Math.min(totalPages - 1, currentPage + 1)
    if (left > 2) items.push('ellipsis')
    for (let p = left; p <= right; p++) items.push(p)
    if (right < totalPages - 1) items.push('ellipsis')
    items.push(totalPages)
    return items
  }, [currentPage, totalPages])

  if (total === 0) return null

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 py-2 text-xs">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-slate-500">
          {t('papers.pagination.showing')}{' '}
          <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{start}</span>
          {'–'}
          <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{end}</span>
          {' '}
          {t('papers.pagination.of')}{' '}
          <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{total}</span>
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 hidden sm:inline">{t('papers.pagination.pageSize')}</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="h-7 w-[72px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label={t('papers.pagination.previous')}
        >
          <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
          <span className="hidden sm:inline">{t('papers.pagination.previous')}</span>
        </Button>
        {pageItems.map((p, idx) =>
          p === 'ellipsis' ? (
            <span
              key={`e-${idx}`}
              className="inline-flex w-7 h-7 items-center justify-center text-slate-400"
              aria-hidden
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </span>
          ) : (
            <Button
              key={p}
              variant={p === currentPage ? 'default' : 'outline'}
              size="sm"
              className={`h-7 w-7 p-0 text-xs ${
                p === currentPage
                  ? 'bg-sky-600 hover:bg-sky-700 text-white border-sky-600'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
              onClick={() => onPageChange(p)}
              aria-label={`${t('papers.pagination.page')} ${p}`}
              aria-current={p === currentPage ? 'page' : undefined}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label={t('papers.pagination.next')}
        >
          <span className="hidden sm:inline">{t('papers.pagination.next')}</span>
          <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
        </Button>
      </div>
    </div>
  )
}
