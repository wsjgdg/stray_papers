"use client";
/**
 * Zustand store for the dataset browser.
 */
import { create } from "zustand";
import type {
  Bookmark,
  DecodeFailure,
  FilterRule,
  LoadedDataset,
  SchemaField,
  SortRule,
  ViewMode,
} from "./types";
import { flattenRows, applyFilters, applySearch, applySort } from "./filter";
import type { RowRef } from "./filter";
import type { Annotation } from "./persist";

interface DatasetState {
  // --- loaded datasets (multi-dataset support) ---
  datasets: LoadedDataset[];
  activeDatasetIndex: number;
  // which file is "active" (others hidden). null = merge all
  activeFileIndex: number | null;
  // field roles overrides by user
  fieldRoles: Record<string, "image" | "url" | "text" | "category" | "numeric" | "datetime" | "identifier" | "meta">;
  // which image field is currently used as the "primary image"
  imageField: string | null;
  // hidden fields (won't show in table/grid/info)
  hiddenFields: Set<string>;
  // recently opened history
  recent: { name: string; size: number; rows: number; openedAt: string }[];

  // --- dataset comparison ---
  compareDatasetIndices: number[]; // indices into datasets[] for side-by-side compare

  // --- view ---
  viewMode: ViewMode;
  rowsPerPage: number;
  page: number;
  thumbnailSize: number; // px

  // --- selection ---
  selectedRowId: string | null;
  selectedRowIds: Set<string>; // multi-select for bulk actions
  compareRowIds: string[];
  bookmarks: Record<string, Bookmark>;

  // --- filter & sort ---
  search: string;
  filterRules: FilterRule[];
  sort: SortRule | null;

  // --- decode state ---
  // blobUrl cache by rowId-field, so we don't re-decode on every render
  blobCache: Record<string, { url: string; format: string; width: number; height: number; size: number; source?: string; error?: string }>;
  failures: DecodeFailure[];

  // --- annotations ---
  // map of rowId -> annotations list (user-drawn boxes + labels)
  annotations: Record<string, Annotation[]>;
  annotationMode: boolean;
  annotationColor: string;

  // --- ui ---
  loading: boolean;
  loadError: string | null;
  showLoadDialog: boolean;
  showFilterPanel: boolean;
  showExportDialog: boolean;
  showSchemaDialog: boolean;
  showBboxOverlay: boolean;
  showAnnotations: boolean;
  sidebarOpen: boolean;
  detailPanelOpen: boolean;
  failedPanelOpen: boolean;
  showCommandPalette: boolean;
  showBookmarkPanel: boolean;
  showRowJumpDialog: boolean;
  // max rows to load at once (for large datasets)
  maxRows: number;

  // last uploaded session's File blobs (for "restore previous files" / auto-restore)
  sessionFiles: File[] | null;

  // ---- actions ----
  setDataset: (ds: LoadedDataset | null) => void;
  addDataset: (ds: LoadedDataset) => void;
  setActiveDatasetIndex: (i: number) => void;
  removeDataset: (i: number) => void;
  toggleCompareDataset: (i: number) => void;
  clearCompareDatasets: () => void;
  setViewMode: (m: ViewMode) => void;
  setPage: (p: number) => void;
  setThumbnailSize: (n: number) => void;
  setSelectedRow: (id: string | null) => void;
  toggleSelectedRow: (id: string) => void;
  clearSelection: () => void;
  selectAllFiltered: () => void;
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
  toggleBookmark: (id: string, note?: string) => void;
  removeBookmark: (id: string) => void;
  setSearch: (s: string) => void;
  setFilterRules: (r: FilterRule[]) => void;
  addFilterRule: (r: FilterRule) => void;
  removeFilterRule: (id: string) => void;
  setSort: (s: SortRule | null) => void;
  setImageField: (f: string | null) => void;
  toggleHiddenField: (f: string) => void;
  setActiveFileIndex: (i: number | null) => void;
  setShowLoadDialog: (v: boolean) => void;
  setShowFilterPanel: (v: boolean) => void;
  setShowExportDialog: (v: boolean) => void;
  setShowSchemaDialog: (v: boolean) => void;
  setShowBboxOverlay: (v: boolean) => void;
  setShowAnnotations: (v: boolean) => void;
  setSidebarOpen: (v: boolean) => void;
  setDetailPanelOpen: (v: boolean) => void;
  setFailedPanelOpen: (v: boolean) => void;
  setShowCommandPalette: (v: boolean) => void;
  setShowBookmarkPanel: (v: boolean) => void;
  setShowRowJumpDialog: (v: boolean) => void;
  setMaxRows: (n: number) => void;
  setSessionFiles: (f: File[] | null) => void;
  setLoading: (v: boolean) => void;
  setLoadError: (v: string | null) => void;
  addRecent: (r: { name: string; size: number; rows: number }) => void;
  cacheBlob: (key: string, info: { url: string; format: string; width: number; height: number; size: number; source?: string; error?: string }) => void;
  clearBlob: (key: string) => void;
  addFailure: (f: DecodeFailure) => void;
  clearFailures: () => void;
  retryEpoch: number;
  bumpRetryEpoch: () => void;
  retryOne: (rowId: string, field: string) => void;
  addAnnotation: (a: Annotation) => void;
  removeAnnotation: (rowId: string, annotationId: string) => void;
  clearAnnotations: (rowId: string) => void;
  setAnnotationMode: (v: boolean) => void;
  setAnnotationColor: (c: string) => void;
  getActiveRows: () => RowRef[];
  getFilteredRows: () => RowRef[];
  getSchema: () => SchemaField[];
  reset: () => void;
}

export const useDatasetStore = create<DatasetState>((set, get) => ({
  datasets: [],
  activeDatasetIndex: 0,
  activeFileIndex: null,
  fieldRoles: {},
  imageField: null,
  hiddenFields: new Set(),
  recent: [],

  compareDatasetIndices: [],

  viewMode: "grid",
  rowsPerPage: 60,
  page: 0,
  thumbnailSize: 180,

  selectedRowId: null,
  selectedRowIds: new Set<string>(),
  compareRowIds: [],
  bookmarks: {},

  search: "",
  filterRules: [],
  sort: null,

  blobCache: {},
  failures: [],

  annotations: {},
  annotationMode: false,
  annotationColor: "#22d3ee",

  loading: false,
  loadError: null,
  showLoadDialog: false,
  showFilterPanel: false,
  showExportDialog: false,
  showSchemaDialog: false,
  showBboxOverlay: true,
  showAnnotations: true,
  sidebarOpen: true,
  detailPanelOpen: true,
  failedPanelOpen: false,
  showCommandPalette: false,
  showBookmarkPanel: false,
  showRowJumpDialog: false,
  maxRows: 5000,

  sessionFiles: null,

  setDataset: (ds) =>
    set((s) => {
      if (!ds) {
        return {
          ...s,
          datasets: [],
          activeDatasetIndex: 0,
          imageField: null,
          selectedRowId: null,
          compareRowIds: [],
          blobCache: {},
          failures: [],
          page: 0,
          compareDatasetIndices: [],
        };
      }
      const firstFile = ds.files[0];
      const schema = firstFile?.schema || [];
      // auto-pick first image or URL field as the image field
      let imageField = schema.find((f) => f.role === "image")?.name || null;
      if (!imageField) imageField = schema.find((f) => f.role === "url")?.name || null;
      if (!imageField && schema.length > 0) imageField = schema[0].name;
      const recent = ds
        ? [
            ...ds.files.map((f) => ({
              name: f.name,
              size: f.sizeBytes,
              rows: f.rowsCount,
              openedAt: new Date().toISOString(),
            })),
            ...s.recent,
          ].slice(0, 10)
        : s.recent;
      return {
        ...s,
        datasets: [ds],
        activeDatasetIndex: 0,
        imageField,
        selectedRowId: null,
        compareRowIds: [],
        page: 0,
        recent,
        showLoadDialog: false,
        viewMode: "grid",
        compareDatasetIndices: [],
      };
    }),

  addDataset: (ds) =>
    set((s) => {
      const firstFile = ds.files[0];
      const schema = firstFile?.schema || [];
      let imageField = schema.find((f) => f.role === "image")?.name || s.imageField;
      if (!imageField) imageField = schema.find((f) => f.role === "url")?.name || s.imageField;
      if (!imageField && schema.length > 0) imageField = schema[0].name;
      const recent = [
        ...ds.files.map((f) => ({
          name: f.name,
          size: f.sizeBytes,
          rows: f.rowsCount,
          openedAt: new Date().toISOString(),
        })),
        ...s.recent,
      ].slice(0, 10);
      return {
        ...s,
        datasets: [...s.datasets, ds],
        activeDatasetIndex: s.datasets.length, // switch to new dataset
        imageField,
        selectedRowId: null,
        compareRowIds: [],
        page: 0,
        recent,
        showLoadDialog: false,
        viewMode: "grid",
        blobCache: {},
        failures: [],
      };
    }),

  setActiveDatasetIndex: (i) =>
    set((s) => ({
      activeDatasetIndex: i,
      activeFileIndex: null,
      page: 0,
      selectedRowId: null,
      compareRowIds: [],
      blobCache: {},
    })),

  removeDataset: (i) =>
    set((s) => {
      const next = s.datasets.filter((_, idx) => idx !== i);
      const nextActive = Math.min(s.activeDatasetIndex, Math.max(0, next.length - 1));
      const nextCompare = s.compareDatasetIndices
        .filter((idx) => idx !== i)
        .map((idx) => (idx > i ? idx - 1 : idx));
      return {
        datasets: next,
        activeDatasetIndex: nextActive,
        compareDatasetIndices: nextCompare,
        selectedRowId: null,
        compareRowIds: [],
        blobCache: {},
      };
    }),

  toggleCompareDataset: (i) =>
    set((s) => {
      const exists = s.compareDatasetIndices.includes(i);
      const next = exists
        ? s.compareDatasetIndices.filter((x) => x !== i)
        : [...s.compareDatasetIndices, i].slice(-4);
      return { compareDatasetIndices: next };
    }),

  clearCompareDatasets: () => set({ compareDatasetIndices: [] }),

  setViewMode: (m) => set({ viewMode: m, page: 0 }),
  setPage: (p) => set({ page: Math.max(0, p) }),
  setThumbnailSize: (n) => set({ thumbnailSize: Math.max(80, Math.min(360, n)) }),
  setSelectedRow: (id) => set({ selectedRowId: id, viewMode: id ? "detail" : get().viewMode }),
  toggleSelectedRow: (id) =>
    set((s) => {
      const next = new Set(s.selectedRowIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedRowIds: next };
    }),
  clearSelection: () => set({ selectedRowIds: new Set<string>() }),
  selectAllFiltered: () => {
    const filtered = get().getFilteredRows();
    set({ selectedRowIds: new Set(filtered.map((r) => r.id)) });
  },
  toggleCompare: (id) =>
    set((s) => {
      const exists = s.compareRowIds.includes(id);
      const next = exists ? s.compareRowIds.filter((x) => x !== id) : [...s.compareRowIds, id].slice(-4);
      return { compareRowIds: next, viewMode: next.length >= 2 ? "compare" : s.viewMode };
    }),
  clearCompare: () => set({ compareRowIds: [] }),
  toggleBookmark: (id, note) =>
    set((s) => {
      const next = { ...s.bookmarks };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = { rowId: id, note, createdAt: new Date().toISOString() };
      }
      return { bookmarks: next };
    }),
  removeBookmark: (id) =>
    set((s) => {
      const next = { ...s.bookmarks };
      delete next[id];
      return { bookmarks: next };
    }),
  setSearch: (s) => set({ search: s, page: 0 }),
  setFilterRules: (r) => set({ filterRules: r, page: 0 }),
  addFilterRule: (r) => set((s) => ({ filterRules: [...s.filterRules, r], page: 0 })),
  removeFilterRule: (id) => set((s) => ({ filterRules: s.filterRules.filter((r) => r.id !== id), page: 0 })),
  setSort: (s) => set({ sort: s }),
  setImageField: (f) => set({ imageField: f, blobCache: {} }),
  toggleHiddenField: (f) =>
    set((s) => {
      const next = new Set(s.hiddenFields);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return { hiddenFields: next };
    }),
  setActiveFileIndex: (i) => set({ activeFileIndex: i, page: 0, selectedRowId: null, compareRowIds: [], blobCache: {} }),
  setShowLoadDialog: (v) => set({ showLoadDialog: v }),
  setShowFilterPanel: (v) => set({ showFilterPanel: v }),
  setShowExportDialog: (v) => set({ showExportDialog: v }),
  setShowSchemaDialog: (v) => set({ showSchemaDialog: v }),
  setShowBboxOverlay: (v) => set({ showBboxOverlay: v }),
  setShowAnnotations: (v) => set({ showAnnotations: v }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setDetailPanelOpen: (v) => set({ detailPanelOpen: v }),
  setFailedPanelOpen: (v) => set({ failedPanelOpen: v }),
  setShowCommandPalette: (v) => set({ showCommandPalette: v }),
  setShowBookmarkPanel: (v) => set({ showBookmarkPanel: v }),
  setShowRowJumpDialog: (v) => set({ showRowJumpDialog: v }),
  setMaxRows: (n) => set({ maxRows: n }),
  sessionFiles: null,
  // bumped to force re-decode of previously-failed thumbnails (e.g. after a
  // flaky network recovers). Thumbnails include it in their decode key.
  retryEpoch: 0,
  setSessionFiles: (f) => set({ sessionFiles: f }),
  setLoading: (v) => set({ loading: v }),
  setLoadError: (v) => set({ loadError: v }),
  addRecent: (r) => set((s) => ({ recent: [r, ...s.recent].slice(0, 10) })),
  cacheBlob: (key, info) =>
    set((s) => ({
      blobCache: {
        ...s.blobCache,
        [key]: info,
      },
    })),
  clearBlob: (key) =>
    set((s) => {
      if (!(key in s.blobCache)) return s;
      const next = { ...s.blobCache };
      delete next[key];
      return { blobCache: next };
    }),
  addFailure: (f) =>
    set((s) => {
      // dedupe by rowId+field
      if (s.failures.some((x) => x.rowId === f.rowId && x.field === f.field)) return s;
      return { failures: [...s.failures, f].slice(-500) };
    }),
  clearFailures: () => set({ failures: [] }),
  bumpRetryEpoch: () => set((s) => ({ retryEpoch: s.retryEpoch + 1, failures: [] })),
  // Retry a single failed thumbnail: drop its cached error and re-decode it
  // (alongside any other queued retries via the epoch bump).
  retryOne: (rowId: string, field: string) =>
    set((s) => {
      const key = `${rowId}:${field}`;
      const next = { ...s.blobCache };
      delete next[key];
      // keep other failures; this one will re-add itself if it fails again
      const failures = s.failures.filter((f) => !(f.rowId === rowId && f.field === field));
      return { blobCache: next, failures, retryEpoch: s.retryEpoch + 1 };
    }),
  addAnnotation: (a) =>
    set((s) => {
      const list = s.annotations[a.rowId] || [];
      return {
        annotations: {
          ...s.annotations,
          [a.rowId]: [...list, a],
        },
      };
    }),
  removeAnnotation: (rowId, annotationId) =>
    set((s) => {
      const list = s.annotations[rowId] || [];
      return {
        annotations: {
          ...s.annotations,
          [rowId]: list.filter((a) => a.id !== annotationId),
        },
      };
    }),
  clearAnnotations: (rowId) =>
    set((s) => {
      const next = { ...s.annotations };
      delete next[rowId];
      return { annotations: next };
    }),
  setAnnotationMode: (v) => set({ annotationMode: v }),
  setAnnotationColor: (c) => set({ annotationColor: c }),

  getActiveRows: () => {
    const { datasets, activeDatasetIndex, activeFileIndex, maxRows } = get();
    const dataset = datasets[activeDatasetIndex];
    if (!dataset) return [];
    const files =
      activeFileIndex === null ? dataset.files : dataset.files.filter((_, i) => i === activeFileIndex);
    // Slice files' rows to maxRows to prevent loading huge datasets at once
    const slicedFiles = files.map((f) => ({
      ...f,
      rows: f.rows.slice(0, maxRows),
    }));
    return flattenRows(slicedFiles);
  },

  getFilteredRows: () => {
    const all = get().getActiveRows();
    const { search, filterRules, sort, getSchema } = get();
    const schema = getSchema();
    const filtered = applyFilters(all, filterRules);
    const searched = applySearch(filtered, search, schema);
    return applySort(searched, sort);
  },

  getSchema: () => {
    const { datasets, activeDatasetIndex, activeFileIndex, fieldRoles } = get();
    const dataset = datasets[activeDatasetIndex];
    if (!dataset) return [];
    const file = activeFileIndex !== null ? dataset.files[activeFileIndex] : dataset.files[0];
    if (!file) return [];
    return file.schema.map((f) => ({
      ...f,
      role: fieldRoles[f.name] || f.role,
    }));
  },

  reset: () =>
    set({
      datasets: [],
      activeDatasetIndex: 0,
      imageField: null,
      selectedRowId: null,
      compareRowIds: [],
      compareDatasetIndices: [],
      blobCache: {},
      failures: [],
      page: 0,
      filterRules: [],
      search: "",
      sort: null,
    }),
}));

