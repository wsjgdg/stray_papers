'use client'

import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loading skeleton shown while a lazily-loaded tab chunk is being fetched
 * (next/dynamic). Each variant mirrors the rough visual shape of its tab so
 * the transition from skeleton → real content feels smooth instead of jarring.
 *
 * Used by `src/app/page.tsx` via `dynamic(() => import('...'), { loading })`.
 */

export function DashboardTabSkeleton() {
  return (
    <div className="space-y-6 p-1">
      {/* Hero KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-7 w-16 rounded" />
            <Skeleton className="h-2 w-full rounded" />
          </div>
        ))}
      </div>
      {/* Chart + side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-64 w-full rounded" />
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <Skeleton className="h-4 w-32 rounded" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-3 w-10 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function PapersTabSkeleton() {
  return (
    <div className="space-y-3 p-1">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <Skeleton className="h-9 w-56 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>
      {/* Table-ish rows */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 border-b border-slate-100 dark:border-slate-800 last:border-0"
          >
            <Skeleton className="h-4 w-4 rounded shrink-0" />
            <Skeleton className="h-4 w-20 rounded shrink-0" />
            <Skeleton className="h-4 flex-1 rounded" />
            <Skeleton className="h-4 w-12 rounded shrink-0" />
            <Skeleton className="h-4 w-10 rounded shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function GenericTabSkeleton() {
  return (
    <div className="space-y-4 p-1">
      <Skeleton className="h-8 w-48 rounded-md" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-32 w-full rounded" />
            <Skeleton className="h-3 w-2/3 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Default export — pick the right one by tab name. */
export function TabSkeleton({ tab }: { tab?: string }) {
  if (tab === 'dashboard') return <DashboardTabSkeleton />
  if (tab === 'papers') return <PapersTabSkeleton />
  return <GenericTabSkeleton />
}

export default TabSkeleton
