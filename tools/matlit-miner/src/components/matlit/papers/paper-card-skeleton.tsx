'use client'

/**
 * Shimmer skeleton placeholder for a paper card. Used by `papers-tab.tsx`
 * during the initial load (5 skeletons) and during background refetches
 * (3 skeletons appended below existing cards).
 *
 * Extracted from `papers-tab.tsx` (M1b). No props — render as-is.
 */
export function PaperCardSkeleton() {
  return (
    <>
      <style>{`
        @keyframes matlit-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 bg-[length:200%_100%] animate-[matlit-shimmer_1.5s_linear_infinite] p-3">
        <div className="flex items-start gap-2.5">
          {/* checkbox skeleton */}
          <div className="w-5 h-5 rounded border border-slate-300/70 dark:border-slate-600/70 bg-white/50 dark:bg-slate-900/50 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-2">
            {/* material + synth badge row */}
            <div className="flex items-center gap-2">
              <div className="h-3 w-16 rounded bg-white/60 dark:bg-slate-900/60" />
              <div className="h-3 w-10 rounded-full bg-white/60 dark:bg-slate-900/60" />
            </div>
            {/* title */}
            <div className="h-4 w-3/4 rounded bg-white/70 dark:bg-slate-900/70" />
            <div className="h-3 w-1/2 rounded bg-white/50 dark:bg-slate-900/50" />
            {/* metadata row */}
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-8 rounded bg-white/40 dark:bg-slate-900/40" />
              <div className="h-2.5 w-12 rounded bg-white/40 dark:bg-slate-900/40" />
              <div className="h-2.5 w-20 rounded bg-white/40 dark:bg-slate-900/40" />
            </div>
          </div>
          {/* chevron skeleton */}
          <div className="w-4 h-4 rounded bg-white/50 dark:bg-slate-900/50 shrink-0 mt-1" />
        </div>
      </div>
    </>
  )
}
