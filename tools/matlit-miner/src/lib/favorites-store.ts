'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'

/**
 * Material favorites / collections (C3).
 *
 * Stored in localStorage as a JSON array under `matlit-favorites`.
 * Layout of an entry:
 *   { materialId, materialName, addedAt, collection? }
 *
 * `collection` is an optional user-defined bucket name (e.g. "My perovskites",
 * "Lead-free candidates"). Favorites without a collection are listed in an
 * implicit "Unassigned" bucket.
 *
 * Cross-tab sync mirrors the pattern in `recent-materials.ts`:
 *   - this tab: a custom `matlit:favorites-changed` event dispatched on every
 *     mutation so all hook instances re-read in the same tab.
 *   - other tabs: the native `storage` event.
 */

export interface Favorite {
  materialId: string
  materialName: string
  addedAt: number
  collection?: string
}

const KEY = 'matlit-favorites'
const CHANGE_EVENT = 'matlit:favorites-changed'

function isFavorite(x: unknown): x is Favorite {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  return (
    typeof r.materialId === 'string' &&
    typeof r.materialName === 'string' &&
    typeof r.addedAt === 'number' &&
    (r.collection === undefined || typeof r.collection === 'string')
  )
}

export function getFavorites(): Favorite[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isFavorite)
  } catch {
    return []
  }
}

function save(favorites: Favorite[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(favorites))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    /* ignore quota / privacy mode errors */
  }
}

export function isFavoriteId(materialId: string): boolean {
  return getFavorites().some((f) => f.materialId === materialId)
}

/** Add a favorite. No-op if already favorited. */
export function addFavorite(materialId: string, materialName: string, collection?: string): void {
  const cur = getFavorites()
  if (cur.some((f) => f.materialId === materialId)) return
  save([
    ...cur,
    { materialId, materialName, addedAt: Date.now(), collection: collection || undefined },
  ])
}

/** Remove a favorite. No-op if not present. */
export function removeFavorite(materialId: string): void {
  const cur = getFavorites()
  if (!cur.some((f) => f.materialId === materialId)) return
  save(cur.filter((f) => f.materialId !== materialId))
}

/**
 * Toggle favorite status. Returns the new state (true = now favorited).
 * The collection is preserved when un-favoriting is re-favorited (it isn't —
 * toggling off removes the entry entirely, including its collection).
 */
export function toggleFavorite(materialId: string, materialName: string): boolean {
  const cur = getFavorites()
  if (cur.some((f) => f.materialId === materialId)) {
    save(cur.filter((f) => f.materialId !== materialId))
    return false
  }
  save([...cur, { materialId, materialName, addedAt: Date.now() }])
  return true
}

/**
 * Assign a favorite to a named collection.
 *
 * If the material isn't favorited yet, this also adds it as a favorite (using
 * the provided `materialName` fallback) — so users can pick a collection from
 * a material row without first clicking the star.
 *
 * Pass an empty string to clear the collection assignment.
 */
export function moveToCollection(materialId: string, collection: string, materialName?: string): void {
  const cur = getFavorites()
  const idx = cur.findIndex((f) => f.materialId === materialId)
  const cleanCollection = collection.trim()
  if (idx === -1) {
    const name = materialName || materialId
    save([
      ...cur,
      { materialId, materialName: name, addedAt: Date.now(), collection: cleanCollection || undefined },
    ])
    return
  }
  const next = [...cur]
  next[idx] = { ...next[idx], collection: cleanCollection || undefined }
  save(next)
}

/** Distinct, alphabetically-sorted list of collection names currently in use. */
export function getCollections(): string[] {
  const cols = new Set<string>()
  for (const f of getFavorites()) {
    if (f.collection) cols.add(f.collection)
  }
  return Array.from(cols).sort((a, b) => a.localeCompare(b))
}

/**
 * React hook for subscribing to favorites from localStorage.
 *
 * Re-reads on:
 *  - the custom `matlit:favorites-changed` event (this tab)
 *  - the native `storage` event (other tabs)
 *
 * Returns a stable object exposing `favorites`, `collections`, `toggle`,
 * `isFavorite`, and `moveToCollection`. Callbacks are memoized so they can be
 * passed as props without re-rendering consumers.
 */
export interface FavoritesStore {
  favorites: Favorite[]
  collections: string[]
  toggle: (materialId: string, materialName: string) => boolean
  isFavorite: (materialId: string) => boolean
  moveToCollection: (materialId: string, collection: string) => void
  /** Convenience: look up the collection name assigned to a material (or undefined). */
  collectionOf: (materialId: string) => string | undefined
  /** Total count, convenient for badges / floating buttons. */
  count: number
}

export function useFavorites(): FavoritesStore {
  const [favorites, setFavorites] = useState<Favorite[]>([])

  useEffect(() => {
    setFavorites(getFavorites())
    const handler = () => setFavorites(getFavorites())
    window.addEventListener(CHANGE_EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  const collections = useMemo(() => {
    const cols = new Set<string>()
    for (const f of favorites) {
      if (f.collection) cols.add(f.collection)
    }
    return Array.from(cols).sort((a, b) => a.localeCompare(b))
  }, [favorites])

  const toggle = useCallback((materialId: string, materialName: string) => {
    return toggleFavorite(materialId, materialName)
  }, [])

  const isFavorite = useCallback(
    (materialId: string) => favorites.some((f) => f.materialId === materialId),
    [favorites],
  )

  const moveToCollectionCb = useCallback(
    (materialId: string, collection: string) => {
      // Look up the existing name from the in-memory list so callers don't
      // have to pass it. Falls back to materialId if the material isn't a
      // favorite yet (in which case this call also favorites it).
      const existing = favorites.find((f) => f.materialId === materialId)
      const name = existing?.materialName ?? materialId
      moveToCollection(materialId, collection, name)
    },
    [favorites],
  )

  const collectionOf = useCallback(
    (materialId: string) => favorites.find((f) => f.materialId === materialId)?.collection,
    [favorites],
  )

  return {
    favorites,
    collections,
    toggle,
    isFavorite,
    moveToCollection: moveToCollectionCb,
    collectionOf,
    count: favorites.length,
  }
}
