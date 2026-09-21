// Standalone auth stub.
//
// The app runs fully client-side with no third-party account provider. AI is opt-in
// via environment variables (see lib/aiConfig.ts) and is free to use locally, so
// visitors never "pay" for it here — the billing-confirm flow is disabled.

export function getAuthHeaders(): Record<string, string> {
  return {}
}

export function redirectToLogin(): void {
  // No third-party login in standalone mode.
}

export const visitorPaysForAi = false
