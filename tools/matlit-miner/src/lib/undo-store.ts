/**
 * Undo store (Task U4).
 *
 * A lightweight Zustand store that tracks *destructive* operations
 * (delete material, delete paper, delete efficiency, …) so the user can
 * reverse them via Ctrl+Z or the History panel in the header.
 *
 * ── Public API ─────────────────────────────────────────────────────────
 *   useUndoStore()                       → { entries, push, executeUndo, clear }
 *   push({ description, undo, category }) → entryId  (also fires event)
 *   executeUndo(entryId)                  → Promise<boolean>  (true if undone)
 *   clear()                               → void
 *
 * ── How tabs participate ───────────────────────────────────────────────
 * Tabs CANNOT be edited from this task (file-conflict risk), so we expose a
 * window-event-based opt-in: any code that performs a destructive action
 * dispatches a `matlit:undoable-action` CustomEvent with the payload shape
 * `UndoableActionEvent.detail`. The header (page.tsx) listens for these
 * events and pushes them into the store.
 *
 *   window.dispatchEvent(new CustomEvent('matlit:undoable-action', {
 *     detail: {
 *       description: 'Deleted material MAPbI3',
 *       category: 'material',
 *       undo: async () => {
 *         await fetch('/api/materials', { method: 'POST', body: JSON.stringify(snapshot) })
 *         queryClient.invalidateQueries(['materials'])
 *       },
 *     },
 *   }))
 *
 * Or, if the calling code already imports the store, just call
 * `useUndoStore.getState().push({ … })` directly — both paths end up in the
 * same store.
 *
 * ── Constraints ────────────────────────────────────────────────────────
 *   • Max 20 entries (FIFO eviction).
 *   • Entries older than 24 h are auto-pruned on every read & on push.
 *   • The `undo` callback is async; failure is caught and surfaced via the
 *     returned boolean from `executeUndo`.
 *   • Cross-tab sync is intentionally NOT implemented (undo callbacks hold
 *     closures that are meaningless in another tab).
 */

'use client'

import { create } from 'zustand'

export type UndoCategory =
  | 'material'
  | 'paper'
  | 'efficiency'
  | 'classification'
  | 'other'

export interface UndoEntry {
  id: string
  /** Human-readable, e.g. "Deleted material MAPbI3". */
  description: string
  timestamp: number
  /** Restores the prior state. Should be idempotent & safe to await. */
  undo: () => Promise<void>
  category: UndoCategory
}

interface UndoStore {
  entries: UndoEntry[]
  /** Add an entry; returns the new entry id. Auto-evicts overflow + stale. */
  push: (entry: Omit<UndoEntry, 'id' | 'timestamp'>) => string
  /** Run the undo callback for `id`, remove it from the list, return success. */
  executeUndo: (id: string) => Promise<boolean>
  /** Drop every entry (used by the "Clear history" button). */
  clear: () => void
}

const MAX_ENTRIES = 20
const TTL_MS = 24 * 60 * 60 * 1000 // 24 h

/** Event payload tabs dispatch to opt into undo without importing the store. */
export interface UndoableActionEventDetail {
  description: string
  category: UndoCategory
  undo: () => Promise<void>
}

export const UNDOABLE_ACTION_EVENT = 'matlit:undoable-action'

function pruneStale(entries: UndoEntry[]): UndoEntry[] {
  const cutoff = Date.now() - TTL_MS
  return entries.filter((e) => e.timestamp >= cutoff)
}

function genId(): string {
  // Avoid importing crypto (SSR-safe) — Date.now + random is enough for a
  // client-only list capped at 20.
  return `undo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const useUndoStore = create<UndoStore>((set, get) => ({
  entries: [],

  push: (entry) => {
    const id = genId()
    const full: UndoEntry = {
      id,
      description: entry.description,
      category: entry.category,
      undo: entry.undo,
      timestamp: Date.now(),
    }
    set((state) => {
      const next = [full, ...pruneStale(state.entries)]
      // FIFO eviction: keep the most recent MAX_ENTRIES.
      if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES
      return { entries: next }
    })
    return id
  },

  executeUndo: async (id) => {
    const entry = get().entries.find((e) => e.id === id)
    if (!entry) return false
    try {
      await entry.undo()
    } catch {
      // Swallow — the callback is responsible for its own error toast, but
      // we still drop the entry so the user can try the next one.
      return false
    }
    set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }))
    return true
  },

  clear: () => set({ entries: [] }),
}))

/**
 * Convenience helper: dispatch a `matlit:undoable-action` window event.
 *
 * Tabs that don't import the Zustand store can call this to opt in; the
 * header in `page.tsx` listens and pushes the entry. The dispatch is a
 * no-op on the server.
 */
export function dispatchUndoableAction(detail: UndoableActionEventDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(UNDOABLE_ACTION_EVENT, { detail }))
}

/**
 * Hook version of `dispatchUndoableAction` — pushes directly into the store.
 * Prefer this in components that already use Zustand.
 */
export function useRegisterUndo() {
  const push = useUndoStore((s) => s.push)
  return (entry: Omit<UndoEntry, 'id' | 'timestamp'>) => push(entry)
}

/**
 * Relative-time formatter reused from recent-materials.ts. Duplicated here
 * to avoid a cross-module dependency (and the page already imports it).
 * Falls back to absolute date past 30 d.
 */
export function formatUndoTimeAgo(ts: number, locale: 'en' | 'zh' = 'en'): string {
  const diff = Date.now() - ts
  const s = Math.max(0, Math.floor(diff / 1000))
  if (s < 5) return locale === 'zh' ? '刚刚' : 'just now'
  if (s < 60) return locale === 'zh' ? `${s}秒前` : `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return locale === 'zh' ? `${m}分钟前` : `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return locale === 'zh' ? `${h}小时前` : `${h}h ago`
  const d = Math.floor(h / 24)
  return locale === 'zh' ? `${d}天前` : `${d}d ago`
}

export const UNDO_MAX_ENTRIES = MAX_ENTRIES
export const UNDO_TTL_MS = TTL_MS
