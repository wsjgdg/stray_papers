"use client";
/**
 * Memoized selector hooks for the dataset store.
 *
 * Zustand's useSyncExternalStore checks reference equality, so calling
 * store methods that return new arrays each render triggers infinite
 * loops. These hooks select only primitive state and derive arrays via
 * useMemo.
 */
import { useMemo } from "react";
import { useDatasetStore } from "./store";
import { flattenRows, applyFilters, applySearch, applySort } from "./filter";
import type { SchemaField } from "./types";

/** Rows from the active file(s), memoized by dataset + activeFileIndex. */
export function useActiveRows() {
  const dataset = useDatasetStore((s) => s.dataset);
  const activeFileIndex = useDatasetStore((s) => s.activeFileIndex);
  return useMemo(() => {
    if (!dataset) return [];
    const files =
      activeFileIndex === null ? dataset.files : dataset.files.filter((_, i) => i === activeFileIndex);
    return flattenRows(files);
  }, [dataset, activeFileIndex]);
}

/** Active rows after filtering + search + sort, memoized. */
export function useFilteredRows() {
  const rows = useActiveRows();
  const search = useDatasetStore((s) => s.search);
  const filterRules = useDatasetStore((s) => s.filterRules);
  const sort = useDatasetStore((s) => s.sort);
  const fieldRoles = useDatasetStore((s) => s.fieldRoles);
  return useMemo(() => {
    const schema = useDatasetStore.getState().getSchema();
    const filtered = applyFilters(rows, filterRules);
    const searched = applySearch(filtered, search, schema);
    return applySort(searched, sort);
    // fieldRoles is a dep because schema derivation depends on it
  }, [rows, search, filterRules, sort, fieldRoles]);
}

/** Active schema (with role overrides), memoized. */
export function useSchema(): SchemaField[] {
  const dataset = useDatasetStore((s) => s.dataset);
  const activeFileIndex = useDatasetStore((s) => s.activeFileIndex);
  const fieldRoles = useDatasetStore((s) => s.fieldRoles);
  return useMemo(() => {
    if (!dataset) return [];
    const file = activeFileIndex !== null ? dataset.files[activeFileIndex] : dataset.files[0];
    if (!file) return [];
    return file.schema.map((f) => ({
      ...f,
      role: (fieldRoles[f.name] as SchemaField["role"]) || f.role,
    }));
  }, [dataset, activeFileIndex, fieldRoles]);
}

/** Hidden fields set (memoized via shallow). */
export function useHiddenFields(): Set<string> {
  return useDatasetStore((s) => s.hiddenFields);
}
