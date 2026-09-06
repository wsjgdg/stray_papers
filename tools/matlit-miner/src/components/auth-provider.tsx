'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'

/**
 * Wraps the app in next-auth's SessionProvider so client components
 * can call `useSession()`. Mounted once in the root layout.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Disable session polling entirely:
  //   - refetchInterval: 0  → no timed background refresh
  //   - refetchOnWindowFocus: false → don't re-fetch when the user tabs back
  // Sessions here are JWT-based and last 30 days (see route.ts), so the
  // client only needs to re-fetch on actual sign-in / sign-out events,
  // not every 5 seconds.
  return (
    <SessionProvider
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      {children}
    </SessionProvider>
  )
}
