/**
 * Unified user preferences store (T7).
 *
 * Before T7, user preferences were scattered across many localStorage keys:
 *   - `matlit-locale`           → language (en / zh)
 *   - `theme`                   → next-themes' default key (light / dark / system)
 *   - `matlit-theme-prompted`   → first-visit banner flag (not a pref, kept as-is)
 *   - `matlit-tab-order`        → custom tab ordering (array of tab IDs)
 *   - `matlit-recent-materials` → recently-viewed materials (separate store)
 *
 * This module consolidates the *preference-shaped* subset (theme, locale,
 * activeTab, lastVisitedMaterialId, sidebarCollapsed, …) under a single
 * `matlit-preferences` key. Migration is *copy-only*: legacy keys are left
 * intact so existing components keep working unchanged. New components can
 * opt-in to `usePreferences()` / `getPreferences()` / `setPreferences()`.
 *
 * What this is NOT:
 *   - A replacement for `comments-store`, `favorites-store`, `workspace-store`,
 *     `config-store`, etc. Those are domain stores with their own shapes and
 *     semantics. Only generic "user-level preference" fields belong here.
 *   - A server-side preference system. Single-user, localStorage-scoped.
 *
 * Storage layout:
 *   localStorage['matlit-preferences'] = JSON.stringify(UserPreferences)
 *   { v: 1, theme: 'dark', locale: 'zh', activeTab: 'papers', ... }
 *
 * The `v` field is a schema version for future migrations.
 */
'use client'

import { create } from 'zustand'
import { useEffect } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
export type LocalePref = 'en' | 'zh'

export interface UserPreferences {
  /** Schema version (for future migrations). */
  v: 1
  /** UI color theme (mirrors next-themes' `theme` key). */
  theme: ThemePref
  /** UI language (mirrors `matlit-locale`). */
  locale: LocalePref
  /** Currently-active tab id (e.g. 'papers' / 'dashboard' / 'efficiency'). */
  activeTab: string
  /** Last material the user opened (for restore-on-revisit UX). */
  lastVisitedMaterialId?: string
  /** Whether the side rail is collapsed. */
  sidebarCollapsed: boolean
  /** Last project the user worked on (for restore-on-revisit UX). */
  lastProjectId?: string
  /** Whether onboarding tour has been completed (mirrors `matlit-onboarding-complete`). */
  onboardingCompleted: boolean
}

const STORAGE_KEY = 'matlit-preferences'
const CHANGE_EVENT = 'matlit:preferences-changed'

// ─── legacy key names (used for one-way migration only) ────────────────────
const LEGACY_LOCALE_KEY = 'matlit-locale'
const LEGACY_THEME_KEY = 'theme' // next-themes default
const LEGACY_ONBOARDING_KEY = 'matlit-onboarding-complete'

const DEFAULTS: UserPreferences = {
  v: 1,
  theme: 'system',
  locale: 'en',
  activeTab: 'dashboard',
  sidebarCollapsed: false,
  onboardingCompleted: false,
}

function isThemePref(x: unknown): x is ThemePref {
  return x === 'light' || x === 'dark' || x === 'system'
}
function isLocalePref(x: unknown): x is LocalePref {
  return x === 'en' || x === 'zh'
}

/**
 * One-time migration: read legacy keys and merge into a fresh preferences
 * object. Returns the migrated preferences, or `null` if no legacy data
 * existed. Does NOT delete the legacy keys (existing components still read
 * them; we only mirror their values into the unified store).
 */
function migrateFromLegacy(): UserPreferences | null {
  if (typeof window === 'undefined') return null
  let touched = false
  const next: UserPreferences = { ...DEFAULTS }

  try {
    const localeRaw = window.localStorage.getItem(LEGACY_LOCALE_KEY)
    if (isLocalePref(localeRaw)) {
      next.locale = localeRaw
      touched = true
    }
  } catch {
    /* ignore */
  }

  try {
    const themeRaw = window.localStorage.getItem(LEGACY_THEME_KEY)
    if (isThemePref(themeRaw)) {
      next.theme = themeRaw
      touched = true
    }
  } catch {
    /* ignore */
  }

  try {
    const onboardingRaw = window.localStorage.getItem(LEGACY_ONBOARDING_KEY)
    if (onboardingRaw === '1' || onboardingRaw === 'true') {
      next.onboardingCompleted = true
      touched = true
    }
  } catch {
    /* ignore */
  }

  return touched ? next : null
}

/**
 * Parse + validate the persisted preferences blob. Falls back to DEFAULTS
 * (after a migration attempt) on any error. Side-effect: if migration
 * succeeds, writes the unified blob for next time.
 */
function readPreferences(): UserPreferences {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Partial<UserPreferences>
        // Per-field validation: only copy across fields that are present and
        // well-typed; fall back to DEFAULTS for the rest.
        const merged: UserPreferences = { ...DEFAULTS, ...p }
        if (!isThemePref(merged.theme)) merged.theme = DEFAULTS.theme
        if (!isLocalePref(merged.locale)) merged.locale = DEFAULTS.locale
        if (typeof merged.activeTab !== 'string') merged.activeTab = DEFAULTS.activeTab
        if (typeof merged.sidebarCollapsed !== 'boolean') merged.sidebarCollapsed = DEFAULTS.sidebarCollapsed
        if (typeof merged.onboardingCompleted !== 'boolean') merged.onboardingCompleted = DEFAULTS.onboardingCompleted
        if (merged.lastVisitedMaterialId !== undefined && typeof merged.lastVisitedMaterialId !== 'string') {
          merged.lastVisitedMaterialId = undefined
        }
        if (merged.lastProjectId !== undefined && typeof merged.lastProjectId !== 'string') {
          merged.lastProjectId = undefined
        }
        return merged
      }
    }
    // No unified blob yet — try migrating from legacy keys.
    const migrated = migrateFromLegacy()
    if (migrated) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      } catch {
        /* ignore quota */
      }
      return migrated
    }
  } catch {
    /* parse error — fall through to defaults */
  }
  return { ...DEFAULTS }
}

function writePreferences(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    // localStorage unavailable (private mode / quota) — in-memory store
    // keeps working, we just lose refresh-survival.
  }
}

// ─── Zustand store ─────────────────────────────────────────────────────────

interface PreferencesStore {
  prefs: UserPreferences
  /** Replace the entire prefs object (used by load()). */
  set: (patch: Partial<UserPreferences>) => void
  /** Re-read from localStorage (used on mount / focus / cross-tab). */
  load: () => void
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  prefs: readPreferences(),
  set: (patch) => {
    const next: UserPreferences = { ...get().prefs, ...patch, v: 1 }
    writePreferences(next)
    set({ prefs: next })
  },
  load: () => {
    const fresh = readPreferences()
    const cur = get().prefs
    // No-op if unchanged (avoids spurious re-renders).
    if (JSON.stringify(fresh) === JSON.stringify(cur)) return
    set({ prefs: fresh })
  },
}))

// ─── plain getters / setters (non-hook, for use outside React) ─────────────

/** Read the current preferences synchronously (no reactivity). */
export function getPreferences(): UserPreferences {
  return readPreferences()
}

/** Patch the preferences synchronously (no reactivity). */
export function setPreferences(patch: Partial<UserPreferences>): void {
  const next: UserPreferences = { ...readPreferences(), ...patch, v: 1 }
  writePreferences(next)
  usePreferencesStore.setState({ prefs: next })
}

/**
 * React hook: subscribe to the unified preferences store.
 *
 * Returns the current preferences + a `set` patcher. Re-renders when any
 * preference changes (via the Zustand subscription) or when a cross-tab
 * `storage` event updates the same key.
 *
 * Example:
 *   const { theme, set } = usePreferences()
 *   set({ theme: 'dark' })
 */
export function usePreferences(): UserPreferences & {
  set: (patch: Partial<UserPreferences>) => void
} {
  const prefs = usePreferencesStore((s) => s.prefs)
  const set = usePreferencesStore((s) => s.set)
  const load = usePreferencesStore((s) => s.load)

  // Re-hydrate on mount + on cross-tab storage events so preferences edited
  // in another tab propagate to this one. The effect is always called
  // (rules-of-hooks); the SSR guard lives inside `load()` / `readPreferences()`
  // which both no-op on the server.
  useEffect(() => {
    load()
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) load()
    }
    const onCustom = () => load()
    window.addEventListener('storage', onStorage)
    window.addEventListener(CHANGE_EVENT, onCustom)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CHANGE_EVENT, onCustom)
    }
  }, [load])

  return { ...prefs, set }
}
