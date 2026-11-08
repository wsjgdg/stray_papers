'use client'

import { useState, useEffect } from 'react'

/**
 * Recently-viewed materials quick-access (D3).
 *
 * Stored in localStorage as a JSON array under `matlit-recent-materials`.
 * Most-recent-first, deduped by id, capped at MAX entries.
 *
 * Layout of an entry:
 *   { id, name, category?, visitedAt }
 *
 * `category` is optional because some callers (e.g. command palette) only
 * have the id at call time and look the rest up lazily. The UI degrades
 * gracefully when category is missing (no badge rendered).
 */

export interface RecentMaterial {
  id: string
  name: string
  category?: string
  visitedAt: number
}

const KEY = 'matlit-recent-materials'
const MAX = 10
const CHANGE_EVENT = 'matlit:recent-materials-changed'

function isRecentMaterial(x: unknown): x is RecentMaterial {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    (r.category === undefined || typeof r.category === 'string') &&
    typeof r.visitedAt === 'number'
  )
}

export function getRecentMaterials(): RecentMaterial[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentMaterial).slice(0, MAX)
  } catch {
    return []
  }
}

export function addRecentMaterial(m: Omit<RecentMaterial, 'visitedAt'>): void {
  if (typeof window === 'undefined') return
  if (!m.id || !m.name) return
  try {
    const cur = getRecentMaterials()
    const filtered = cur.filter((x) => x.id !== m.id)
    const next: RecentMaterial[] = [
      { ...m, visitedAt: Date.now() },
      ...filtered,
    ].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    /* ignore */
  }
}

export function clearRecentMaterials(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY)
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    /* ignore */
  }
}

/**
 * Subscribe to recently-viewed materials from localStorage.
 *
 * Re-reads on:
 *  - the custom `matlit:recent-materials-changed` event (this tab)
 *  - the native `storage` event (other tabs)
 */
export function useRecentMaterials(): RecentMaterial[] {
  const [recents, setRecents] = useState<RecentMaterial[]>([])
  useEffect(() => {
    setRecents(getRecentMaterials())
    const handler = () => setRecents(getRecentMaterials())
    window.addEventListener(CHANGE_EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return recents
}

/**
 * Human-friendly relative time, e.g. "2m ago" / "2分钟前".
 * Falls back to absolute time for very old entries.
 */
export function formatTimeAgo(ts: number, locale: 'en' | 'zh' = 'en'): string {
  const diff = Date.now() - ts
  const s = Math.max(0, Math.floor(diff / 1000))
  if (s < 5) return locale === 'zh' ? '刚刚' : 'just now'
  if (s < 60) return locale === 'zh' ? `${s}秒前` : `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return locale === 'zh' ? `${m}分钟前` : `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return locale === 'zh' ? `${h}小时前` : `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return locale === 'zh' ? `${d}天前` : `${d}d ago`
  try {
    return new Date(ts).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')
  } catch {
    return locale === 'zh' ? `${d}天前` : `${d}d ago`
  }
}

export const RECENT_MATERIALS_MAX = MAX
