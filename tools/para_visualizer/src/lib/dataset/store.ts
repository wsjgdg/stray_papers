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

interface DatasetState {
  // --- loaded dataset ---
  dataset: LoadedDataset | null;
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

  // --- view ---
  viewMode: ViewMode;
  rowsPerPage: number;
  page: number;
  thumbnailSize: number; // px

  // --- selection ---
  selectedRowId: string | null;
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

  // --- ui ---
  loading: boolean;
  loadError: string | null;
  showLoadDialog: boolean;
  showFilterPanel: boolean;
  showExportDialog: boolean;
  showSchemaDialog: boolean;
  showBboxOverlay: boolean;
  sidebarOpen: boolean;
  detailPanelOpen: boolean;

  // ---- actions ----
  setDataset: (ds: LoadedDataset | null) => void;
  setViewMode: (m: ViewMode) => void;
  setPage: (p: number) => void;
  setThumbnailSize: (n: number) => void;
  setSelectedRow: (id: string | null) => void;
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
  setSidebarOpen: (v: boolean) => void;
  setDetailPanelOpen: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setLoadError: (v: string | null) => void;
  addRecent: (r: { name: string; size: number; rows: number }) => void;
  cacheBlob: (key: string, info: { url: string; format: string; width: number; height: number; size: number; source?: string; error?: string }) => void;
  addFailure: (f: DecodeFailure) => void;
  clearFailures: () => void;
  getActiveRows: () => RowRef[];
  getFilteredRows: () => RowRef[];
  getSchema: () => SchemaField[];
  reset: () => void;
}

export const useDatasetStore = create<DatasetState>((set, get) => ({
  dataset: null,
  activeFileIndex: null,
  fieldRoles: {},
  imageField: null,
  hiddenFields: new Set(),
  recent: [],

  viewMode: "grid",
  rowsPerPage: 60,
  page: 0,
  thumbnailSize: 180,

  selectedRowId: null,
  compareRowIds: [],
  bookmarks: {},

  search: "",
  filterRules: [],
  sort: null,

  blobCache: {},
  failures: [],

  loading: false,
  loadError: null,
  showLoadDialog: false,
  showFilterPanel: false,
  showExportDialog: false,
  showSchemaDialog: false,
  showBboxOverlay: true,
  sidebarOpen: true,
  detailPanelOpen: true,

  setDataset: (ds) =>
    set((s) => {
      if (!ds) {
        return {
          ...s,
          dataset: null,
          imageField: null,
          selectedRowId: null,
          compareRowIds: [],
          blobCache: {},
          failures: [],
          page: 0,
        };
      }
      const firstFile = ds.files[0];
      const schema = firstFile?.schema || [];
      // auto-pick first image field
      let imageField = schema.find((f) => f.role === "image")?.name || null;
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
        dataset: ds,
        imageField,
        selectedRowId: null,
        compareRowIds: [],
        page: 0,
        recent,
        showLoadDialog: false,
        viewMode: "grid",
      };
    }),

  setViewMode: (m) => set({ viewMode: m, page: 0 }),
  setPage: (p) => set({ page: Math.max(0, p) }),
  setThumbnailSize: (n) => set({ thumbnailSize: Math.max(80, Math.min(360, n)) }),
  setSelectedRow: (id) => set({ selectedRowId: id, viewMode: id ? "detail" : get().viewMode }),
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
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setDetailPanelOpen: (v) => set({ detailPanelOpen: v }),
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
  addFailure: (f) =>
    set((s) => {
      // dedupe by rowId+field
      if (s.failures.some((x) => x.rowId === f.rowId && x.field === f.field)) return s;
      return { failures: [...s.failures, f].slice(-500) };
    }),
  clearFailures: () => set({ failures: [] }),

  getActiveRows: () => {
    const { dataset, activeFileIndex } = get();
    if (!dataset) return [];
    const files =
      activeFileIndex === null ? dataset.files : dataset.files.filter((_, i) => i === activeFileIndex);
    return flattenRows(files);
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
    const { dataset, activeFileIndex, fieldRoles } = get();
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
      dataset: null,
      imageField: null,
      selectedRowId: null,
      compareRowIds: [],
      blobCache: {},
      failures: [],
      page: 0,
      filterRules: [],
      search: "",
      sort: null,
    }),
}));

