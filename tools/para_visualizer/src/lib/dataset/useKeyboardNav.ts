"use client";
/**
 * Global keyboard shortcuts hook.
 * - Arrow keys / j/k: navigate rows in detail view
 * - 1-5: switch views
 * - b: toggle bookmark
 * - /: focus search
 * - Escape: clear selection / close dialogs
 * - Cmd+A: select all filtered
 * - Cmd+G: go to row
 */
import { useEffect } from "react";
import { useDatasetStore } from "./store";
import { useFilteredRows } from "./hooks";

export function useKeyboardNav() {
  const filtered = useFilteredRows();
  const selectedRowId = useDatasetStore((s) => s.selectedRowId);
  const setSelectedRow = useDatasetStore((s) => s.setSelectedRow);
  const viewMode = useDatasetStore((s) => s.viewMode);
  const setViewMode = useDatasetStore((s) => s.setViewMode);
  const toggleBookmark = useDatasetStore((s) => s.toggleBookmark);
  const setShowCommandPalette = useDatasetStore((s) => s.setShowCommandPalette);
  const showCommandPalette = useDatasetStore((s) => s.showCommandPalette);
  const setShowFilterPanel = useDatasetStore((s) => s.setShowFilterPanel);
  const showFilterPanel = useDatasetStore((s) => s.showFilterPanel);
  const setSearch = useDatasetStore((s) => s.setSearch);
  const clearSelection = useDatasetStore((s) => s.clearSelection);
  const selectAllFiltered = useDatasetStore((s) => s.selectAllFiltered);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Helper: check if a form field is focused
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Cmd/Ctrl+K always handled in CommandPalette; skip here
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) return;
      // Cmd/Ctrl+O, Cmd/Ctrl+F, Cmd/Ctrl+E handled in AppShell
      if ((e.ctrlKey || e.metaKey) && ["o", "f", "e", "a"].includes(e.key.toLowerCase())) {
        if (e.key.toLowerCase() === "a") {
          // Cmd+A = select all filtered
          e.preventDefault();
          selectAllFiltered();
          return;
        }
        return;
      }

      // Escape closes top-most layer
      if (e.key === "Escape") {
        if (showCommandPalette) {
          setShowCommandPalette(false);
          return;
        }
        if (showFilterPanel) {
          setShowFilterPanel(false);
          return;
        }
        if (selectedRowId) {
          setSelectedRow(null);
          return;
        }
        return;
      }

      // Don't trigger shortcuts when typing in inputs
      if (isTyping) return;

      // "/" focuses search
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]');
        input?.focus();
        return;
      }

      // number keys 1-5 switch view (only when no dataset dialog open)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "1") {
          setViewMode("grid");
          return;
        }
        if (e.key === "2") {
          setViewMode("table");
          return;
        }
        if (e.key === "3") {
          setViewMode("detail");
          return;
        }
        if (e.key === "4") {
          setViewMode("compare");
          return;
        }
        if (e.key === "5") {
          setViewMode("stats");
          return;
        }
      }

      // Navigation only matters in detail/grid view
      if (viewMode !== "detail" && viewMode !== "grid") return;
      if (filtered.length === 0) return;

      const currentIdx = selectedRowId ? filtered.findIndex((r) => r.id === selectedRowId) : -1;

      // j/k or ArrowDown/ArrowUp
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = currentIdx < 0 ? 0 : Math.min(currentIdx + 1, filtered.length - 1);
        setSelectedRow(filtered[nextIdx].id);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx = currentIdx <= 0 ? 0 : currentIdx - 1;
        setSelectedRow(filtered[prevIdx].id);
        return;
      }
      if (e.key === "g") {
        // g then number = jump to page; simple version: jump to first/last
        return;
      }
      // b toggles bookmark on current row
      if (e.key === "b") {
        if (selectedRowId) toggleBookmark(selectedRowId);
        return;
      }
      // [ ] switch active file, { } jump to prev/next bookmark
      if (e.key === "[") {
        if (e.shiftKey) {
          // { = prev bookmark
          const { bookmarks, getFilteredRows, setSelectedRow, selectedRowId } = useDatasetStore.getState();
          const filteredRows = getFilteredRows();
          const bookmarkedRows = filteredRows.filter((r) => bookmarks[r.id]);
          if (bookmarkedRows.length === 0) return;
          const currentIdx = selectedRowId ? bookmarkedRows.findIndex((r) => r.id === selectedRowId) : -1;
          const prevIdx = currentIdx <= 0 ? bookmarkedRows.length - 1 : currentIdx - 1;
          setSelectedRow(bookmarkedRows[prevIdx].id);
        } else {
          // [ = prev file
          const { dataset, activeFileIndex, setActiveFileIndex } = useDatasetStore.getState();
          if (dataset) {
            if (activeFileIndex === null) setActiveFileIndex(0);
            else if (activeFileIndex > 0) setActiveFileIndex(activeFileIndex - 1);
          }
        }
        return;
      }
      if (e.key === "]") {
        if (e.shiftKey) {
          // } = next bookmark
          const { bookmarks, getFilteredRows, setSelectedRow, selectedRowId } = useDatasetStore.getState();
          const filteredRows = getFilteredRows();
          const bookmarkedRows = filteredRows.filter((r) => bookmarks[r.id]);
          if (bookmarkedRows.length === 0) return;
          const currentIdx = selectedRowId ? bookmarkedRows.findIndex((r) => r.id === selectedRowId) : -1;
          const nextIdx = currentIdx >= bookmarkedRows.length - 1 ? 0 : currentIdx + 1;
          setSelectedRow(bookmarkedRows[nextIdx].id);
        } else {
          // ] = next file
          const { dataset, activeFileIndex, setActiveFileIndex } = useDatasetStore.getState();
          if (dataset && dataset.files.length > 1) {
            if (activeFileIndex === null) setActiveFileIndex(0);
            else if (activeFileIndex < dataset.files.length - 1) setActiveFileIndex(activeFileIndex + 1);
          }
        }
        return;
      }
      // n = jump to next decode failure row
      if (e.key === "n") {
        const state = useDatasetStore.getState();
        const failures = state.failures;
        if (failures.length > 0) {
          // Find the next failure after the current selected row
          const currentIdx = selectedRowId ? filtered.findIndex((r) => r.id === selectedRowId) : -1;
          const failureRowIds = new Set(failures.map((f) => f.rowId));
          const nextFailure = filtered.slice(currentIdx + 1).find((r) => failureRowIds.has(r.id));
          if (nextFailure) {
            setSelectedRow(nextFailure.id);
          } else {
            // wrap around
            const firstFailure = filtered.find((r) => failureRowIds.has(r.id));
            if (firstFailure) setSelectedRow(firstFailure.id);
          }
        }
        return;
      }
      // f = jump to next row with an image
      if (e.key === "f") {
        const state = useDatasetStore.getState();
        const imgField = state.imageField;
        if (imgField) {
          const currentIdx = selectedRowId ? filtered.findIndex((r) => r.id === selectedRowId) : -1;
          const nextWithImage = filtered.slice(currentIdx + 1).find((r) => {
            const v = r.data[imgField];
            return v != null && v !== "";
          });
          if (nextWithImage) {
            setSelectedRow(nextWithImage.id);
          } else {
            // wrap around
            const firstWithImage = filtered.find((r) => {
              const v = r.data[imgField!];
              return v != null && v !== "";
            });
            if (firstWithImage) setSelectedRow(firstWithImage.id);
          }
        }
        return;
      }
      // t = jump to next annotated row
      if (e.key === "t") {
        const state = useDatasetStore.getState();
        const annotations = state.annotations;
        const annotatedIds = new Set(Object.keys(annotations).filter((id) => (annotations[id]?.length ?? 0) > 0));
        if (annotatedIds.size > 0) {
          const currentIdx = selectedRowId ? filtered.findIndex((r) => r.id === selectedRowId) : -1;
          const nextAnnotated = filtered.slice(currentIdx + 1).find((r) => annotatedIds.has(r.id));
          if (nextAnnotated) {
            setSelectedRow(nextAnnotated.id);
          } else {
            const firstAnnotated = filtered.find((r) => annotatedIds.has(r.id));
            if (firstAnnotated) setSelectedRow(firstAnnotated.id);
          }
        }
        return;
      }
      // d = jump to next bookmarked row (alias for })
      if (e.key === "d") {
        const { bookmarks, getFilteredRows, setSelectedRow, selectedRowId } = useDatasetStore.getState();
        const filteredRows = getFilteredRows();
        const bookmarkedRows = filteredRows.filter((r) => bookmarks[r.id]);
        if (bookmarkedRows.length === 0) return;
        const currentIdx = selectedRowId ? bookmarkedRows.findIndex((r) => r.id === selectedRowId) : -1;
        const nextIdx = currentIdx >= bookmarkedRows.length - 1 ? 0 : currentIdx + 1;
        setSelectedRow(bookmarkedRows[nextIdx].id);
        return;
      }
      // x clears multi-selection
      if (e.key === "x") {
        clearSelection();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    filtered,
    selectedRowId,
    viewMode,
    setSelectedRow,
    setViewMode,
    toggleBookmark,
    setShowCommandPalette,
    showCommandPalette,
    setShowFilterPanel,
    showFilterPanel,
    setSearch,
    clearSelection,
    selectAllFiltered,
  ]);
}
