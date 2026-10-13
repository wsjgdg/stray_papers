"use client";
/**
 * LocalStorage persistence helper.
 * Persists a subset of the dataset store across reloads.
 *
 * Uses a debounced write to avoid blocking the UI during rapid updates
 * (e.g. when many thumbnails decode in sequence).
 */
import { useDatasetStore } from "./store";
import type { Bookmark } from "./types";

const STORAGE_KEY = "dib:state:v1";

interface PersistedState {
  bookmarks: Record<string, Bookmark>;
  recent: { name: string; size: number; rows: number; openedAt: string }[];
  fieldRoles: Record<string, string>;
  viewMode: string;
  thumbnailSize: number;
  sidebarOpen: boolean;
  detailPanelOpen: boolean;
  showBboxOverlay: boolean;
  hiddenFields: string[];
  annotations: Record<string, Annotation[]>;
}

export interface Annotation {
  id: string;
  rowId: string;
  // normalized coords (0-1) of image intrinsic size
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
  createdAt: string;
}

export function loadPersistedState(): Partial<PersistedState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: Partial<PersistedState> = {};

export function savePersistedState(state: Partial<PersistedState>) {
  if (typeof window === "undefined") return;
  pendingState = state;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingState));
    } catch {
      // ignore quota errors
    }
  }, 400);
}

/** Subscribe to store changes and persist a subset. Call once on app mount. */
export function setupPersistence() {
  // hydrate on mount
  const persisted = loadPersistedState();
  const updates: Partial<{
    bookmarks: Record<string, Bookmark>;
    recent: { name: string; size: number; rows: number; openedAt: string }[];
    fieldRoles: Record<string, "image" | "url" | "text" | "category" | "numeric" | "datetime" | "identifier" | "meta">;
    viewMode: "grid" | "table" | "detail" | "compare" | "stats";
    thumbnailSize: number;
    sidebarOpen: boolean;
    detailPanelOpen: boolean;
    showBboxOverlay: boolean;
    hiddenFields: Set<string>;
    annotations: Record<string, Annotation[]>;
  }> = {};
  if (persisted.bookmarks) updates.bookmarks = persisted.bookmarks;
  if (persisted.recent) updates.recent = persisted.recent;
  if (persisted.fieldRoles)
    updates.fieldRoles = persisted.fieldRoles as Record<string, "image" | "url" | "text" | "category" | "numeric" | "datetime" | "identifier" | "meta">;
  if (persisted.viewMode)
    updates.viewMode = persisted.viewMode as "grid" | "table" | "detail" | "compare" | "stats";
  if (typeof persisted.thumbnailSize === "number") updates.thumbnailSize = persisted.thumbnailSize;
  if (typeof persisted.sidebarOpen === "boolean") updates.sidebarOpen = persisted.sidebarOpen;
  if (typeof persisted.detailPanelOpen === "boolean") updates.detailPanelOpen = persisted.detailPanelOpen;
  if (typeof persisted.showBboxOverlay === "boolean") updates.showBboxOverlay = persisted.showBboxOverlay;
  if (persisted.hiddenFields) updates.hiddenFields = new Set(persisted.hiddenFields);
  if (persisted.annotations) updates.annotations = persisted.annotations;

  // Apply all hydration updates in a single setState to avoid cascading renders
  if (Object.keys(updates).length > 0) {
    useDatasetStore.setState(updates);
  }

  // subscribe to changes — debounced write
  return useDatasetStore.subscribe((s) => {
    savePersistedState({
      bookmarks: s.bookmarks,
      recent: s.recent,
      fieldRoles: s.fieldRoles,
      viewMode: s.viewMode,
      thumbnailSize: s.thumbnailSize,
      sidebarOpen: s.sidebarOpen,
      detailPanelOpen: s.detailPanelOpen,
      showBboxOverlay: s.showBboxOverlay,
      hiddenFields: Array.from(s.hiddenFields),
      annotations: s.annotations || {},
    });
  });
}
