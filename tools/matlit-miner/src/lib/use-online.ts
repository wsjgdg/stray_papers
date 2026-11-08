'use client'

import { useEffect, useState } from 'react'

/**
 * Subscribes to the browser's `online` / `offline` window events and
 * returns the current connectivity state.
 *
 * SSR-safe: defaults to `true` (online) when `navigator` is not defined
 * (e.g. during the server render pass) so the first client paint matches
 * the SSR markup and there's no hydration mismatch. The hook then
 * re-reads `navigator.onLine` on mount and updates on every subsequent
 * `online` / `offline` event.
 *
 * Used by the global offline banner in `src/app/page.tsx` and by the
 * mutation `onError` default in `src/components/query-provider.tsx`.
 */
export function useOnlineStatus(): boolean {
  // Always initialize to `true` so SSR markup and client hydration paint
  // match exactly. The real value is read inside useEffect (client-only),
  // which runs after hydration completes — avoiding any mismatch.
  const [online, setOnline] = useState<boolean>(true)
  useEffect(() => {
    // Re-sync once mounted in case SSR assumed online but the browser
    // is actually offline.
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
