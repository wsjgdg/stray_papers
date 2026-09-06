'use client'

import { useState, useEffect } from 'react'

/**
 * N2 — Material subscription store.
 *
 * Persists the user's "followed" materials in localStorage under
 * `matlit-subscriptions`. Each entry tracks when it was created, when it was
 * last checked for new papers, and a cached `newPaperCount` (mirrored from the
 * API so the UI can render a badge without an extra request).
 *
 * Re-uses the same cross-tab sync pattern as `recent-materials.ts`:
 *  - a custom `matlit:subscriptions-changed` event for same-tab updates
 *  - the native `storage` event for other-tab updates
 *
 * Layout of an entry:
 *   { materialId, materialName, createdAt, lastCheckedAt, newPaperCount }
 *
 * `lastCheckedAt` is the watermark used by `/api/notifications` — papers whose
 * `createdAt > lastCheckedAt` are considered "new". When the user opens a
 * notification we call `updateLastChecked(id, 0)` so subsequent polls won't
 * re-surface the same papers.
 */

export interface Subscription {
  materialId: string
  materialName: string
  createdAt: number
  lastCheckedAt: number
  newPaperCount: number
}

const KEY = 'matlit-subscriptions'
const MAX = 50
const CHANGE_EVENT = 'matlit:subscriptions-changed'

function isSubscription(x: unknown): x is Subscription {
  if (typeof x !== 'object' || x === null) return false
  const s = x as Record<string, unknown>
  return (
    typeof s.materialId === 'string' &&
    typeof s.materialName === 'string' &&
    typeof s.createdAt === 'number' &&
    typeof s.lastCheckedAt === 'number' &&
    typeof s.newPaperCount === 'number'
  )
}

export function getSubscriptions(): Subscription[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSubscription).slice(0, MAX)
  } catch {
    return []
  }
}

function saveSubscriptions(subs: Subscription[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(subs.slice(0, MAX)))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    /* ignore */
  }
}

/** Subscribe to a material. No-op if already subscribed. */
export function subscribe(materialId: string, materialName: string): void {
  if (!materialId || !materialName) return
  const cur = getSubscriptions()
  if (cur.some((s) => s.materialId === materialId)) return
  const now = Date.now()
  const next: Subscription[] = [
    {
      materialId,
      materialName,
      createdAt: now,
      // Start the watermark "now" so only papers added *after* subscribing
      // count as new — subscribing shouldn't immediately surface the entire
      // existing backlog as notifications.
      lastCheckedAt: now,
      newPaperCount: 0,
    },
    ...cur,
  ].slice(0, MAX)
  saveSubscriptions(next)
}

/** Remove a subscription. No-op if not subscribed. */
export function unsubscribe(materialId: string): void {
  const cur = getSubscriptions()
  const next = cur.filter((s) => s.materialId !== materialId)
  if (next.length !== cur.length) saveSubscriptions(next)
}

/** Whether the given material is currently subscribed. */
export function isSubscribed(materialId: string): boolean {
  return getSubscriptions().some((s) => s.materialId === materialId)
}

/**
 * Update the last-checked watermark for a single subscription.
 *
 * Called when the user views a material's papers (from the notification
 * popover) or hits "Mark all as read". Pass `count = 0` to clear the cached
 * badge — the next poll will recompute it.
 */
export function updateLastChecked(materialId: string, count: number): void {
  const cur = getSubscriptions()
  let changed = false
  const next = cur.map((s) => {
    if (s.materialId === materialId) {
      changed = true
      return { ...s, lastCheckedAt: Date.now(), newPaperCount: count }
    }
    return s
  })
  if (changed) saveSubscriptions(next)
}

/**
 * Mark every subscription as checked right now. Used by the "Mark all as read"
 * button in the notification popover and "Check all now" in the management
 * dialog.
 */
export function markAllChecked(): void {
  const cur = getSubscriptions()
  if (cur.length === 0) return
  const now = Date.now()
  saveSubscriptions(
    cur.map((s) => ({ ...s, lastCheckedAt: now, newPaperCount: 0 })),
  )
}

/**
 * React hook that re-reads the subscription list whenever it changes
 * (same tab via the custom event, other tab via the native `storage` event).
 */
export function useSubscriptions(): Subscription[] {
  const [subs, setSubs] = useState<Subscription[]>([])
  useEffect(() => {
    setSubs(getSubscriptions())
    const handler = () => setSubs(getSubscriptions())
    window.addEventListener(CHANGE_EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return subs
}

export const SUBSCRIPTIONS_MAX = MAX
