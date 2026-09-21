// Standalone stub replacing the VibeX/RunningHub PocketBase client.
//
// The app no longer depends on a PocketBase backend. Persistent data lives in
// IndexedDB (see lib/localStore.ts); AI calls are routed through lib/aiConfig.ts.
// This module only exists so legacy lib code (e.g. lib/aigc.ts, which is kept
// for compatibility) keeps compiling. None of these functions perform network I/O.

export function getPocketBaseUrl(): string {
  return ""
}

// React Router basename. Local dev has no sub-path prefix.
export function getBasename(): string {
  return "/"
}

// Auth header helper — no-op in standalone mode.
// Accepts an optional token so legacy callers (e.g. lib/aigc.ts) keep compiling.
export function pbAuthHeader(_token?: string): Record<string, string> {
  return {}
}

export function isDirectPbHost(): boolean {
  return true
}

export const PB_USER_AUTH_HEADER = "X-Pb-Auth"

// Minimal stand-in so `pb.authStore.token` / `pb.beforeSend` / `pb.authStore.onChange`
// references in legacy code keep type-checking. It never touches the network.
export const pb = {
  authStore: {
    token: "",
    isValid: false,
    onChange() {
      /* no-op */
    },
    clear() {
      /* no-op */
    },
  },
  beforeSend: null as null | ((url: string, opts: RequestInit) => { url: string; options: RequestInit }),
}
