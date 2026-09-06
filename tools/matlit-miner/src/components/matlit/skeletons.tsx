'use client'

import { Skeleton } from '@/components/ui/skeleton'

/** Reusable loading skeleton for paper cards */
export function PaperCardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <div className="flex items-start gap-3">
        <Skeleton className="w-4 h-4 rounded shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-3 w-12 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-3 w-2/3 rounded" />
          <Skeleton className="h-3 w-1/3 rounded" />
        </div>
        <Skeleton className="h-3 w-8 rounded shrink-0" />
      </div>
    </div>
  )
}

/** Loading skeleton list for papers */
export function PaperListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <PaperCardSkeleton key={i} />
      ))}
    </div>
  )
}

/** Loading skeleton for stat cards */
export function StatCardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-7 w-12 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
        </div>
        <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
      </div>
    </div>
  )
}

/** Loading skeleton for coverage matrix */
export function CoverageMatrixSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-3 w-6 rounded" />
          </div>
          <div className="grid grid-cols-5 gap-1">
            {Array.from({ length: 5 }).map((_, j) => (
              <Skeleton key={j} className="h-9 w-full rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Loading skeleton for activity timeline */
export function ActivityTimelineSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="w-7 h-7 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="h-3 w-12 rounded" />
            </div>
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-2 w-2/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
