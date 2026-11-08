'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'

/**
 * Reusable empty-state placeholder.
 *
 * Renders a centered, vertically-stacked block with:
 *  - a large faded icon (optional)
 *  - a short title
 *  - a longer description (1-2 lines)
 *  - an optional primary action button
 *  - an optional small faded hint line at the bottom
 *
 * Designed to replace ad-hoc "no data" placeholders across tabs so that
 * every empty surface explains *why* it's empty and *what to do next*.
 */
export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void }
  hint?: string
}

export function EmptyState({ icon, title, description, action, hint }: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center text-center py-12 px-4"
    >
      {icon && (
        <div className="mb-3 text-slate-300 dark:text-slate-600 opacity-70 [&>svg]:w-12 [&>svg]:h-12">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">
        {title}
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick} size="sm" className="mt-4">
          {action.label}
        </Button>
      )}
      {hint && (
        <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500 italic max-w-sm">
          {hint}
        </p>
      )}
    </div>
  )
}

export default EmptyState
