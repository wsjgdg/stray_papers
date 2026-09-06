'use client'

import { useEffect, useState } from 'react'

/**
 * SSR-safe media query hook.
 * Returns false during SSR / first render, then resolves to the real
 * matchMedia result after mount. This avoids hydration mismatches.
 *
 * @example
 *   const isMobile = useMediaQuery('(max-width: 640px)')
 *   const isWide = useMediaQuery('(min-width: 1024px)')
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    // Sync initial value
    setMatches(mql.matches)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    // addEventListener is the modern API (addListener is deprecated)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
