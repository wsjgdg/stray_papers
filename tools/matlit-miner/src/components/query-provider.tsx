'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 1 minute — most MatLit data (materials, papers, stats) does
            // not change every 30s; a longer staleTime cuts redundant
            // refetches on tab switches and remounts.
            staleTime: 60_000,
            // Keep unused cached data around for 5 minutes so a quick
            // back-and-forth between tabs doesn't re-fire queries.
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          // O8: global mutation error fallback. Most mutations define their
          // own `onError` (which fires first and toasts a specific message);
          // this default runs after, and only surfaces a generic toast when
          // the failure looks like a connectivity drop — so the user gets a
          // single actionable "you're offline" cue even from mutations that
          // don't bother wiring their own onError handler.
          mutations: {
            onError: (err) => {
              const online =
                typeof navigator !== 'undefined' ? navigator.onLine : true
              if (online) return
              // err is unknown per React Query's types; coerce to message.
              const msg =
                err instanceof Error ? err.message : String(err ?? '')
              // Only toast for actual fetch/network failures — regular 4xx
              // API errors with structured `error` fields are already
              // surfaced by the per-mutation handlers.
              const isNetwork =
                /Failed to fetch|NetworkError|load failed|ERR_NETWORK/i.test(
                  msg,
                )
              if (!isNetwork) return
              toast.error(
                'Network error — check your connection',
              )
            },
          },
        },
      }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
