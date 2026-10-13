"use client";
/**
 * Bottom status bar: shows row counts, decode progress, errors.
 */
import { useDatasetStore } from "@/lib/dataset/store";
import { useActiveRows, useFilteredRows } from "@/lib/dataset/hooks";
import {
  Database,
  Filter,
  Bookmark,
  Star,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const dataset = useDatasetStore((s) => s.dataset);
  const total = useActiveRows();
  const filtered = useFilteredRows();
  const bookmarks = useDatasetStore((s) => s.bookmarks);
  const compare = useDatasetStore((s) => s.compareRowIds);
  const failures = useDatasetStore((s) => s.failures);
  const loading = useDatasetStore((s) => s.loading);
  const loadError = useDatasetStore((s) => s.loadError);
  const filterRules = useDatasetStore((s) => s.filterRules);

  return (
    <footer className="border-t bg-card/40 px-3 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground overflow-x-auto whitespace-nowrap">
      <div className="flex items-center gap-1">
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
        ) : (
          <Database className="h-3 w-3" />
        )}
        <span>
          {dataset ? dataset.name : "No dataset"} · <span className="font-mono tabular-nums">{total.length}</span> rows
        </span>
      </div>
      {filterRules.length > 0 && (
        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <Filter className="h-3 w-3" />
          <span className="font-mono tabular-nums">{filtered.length}</span> filtered
        </div>
      )}
      <div className="flex items-center gap-1">
        <Bookmark className={`h-3 w-3 ${Object.keys(bookmarks).length > 0 ? "text-amber-500" : ""}`} />
        <span className="font-mono tabular-nums">{Object.keys(bookmarks).length}</span> bookmarks
      </div>
      <div className="flex items-center gap-1">
        <Star className={`h-3 w-3 ${compare.length > 0 ? "text-amber-500" : ""}`} />
        <span className="font-mono tabular-nums">{compare.length}</span> compare
      </div>
      <div className="flex items-center gap-1">
        {failures.length === 0 ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span>No decode errors</span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            <span>{failures.length} decode failures</span>
          </>
        )}
      </div>
      {loadError && (
        <div className="flex items-center gap-1 text-rose-600">
          <AlertTriangle className="h-3 w-3" />
          <span className="truncate">{loadError}</span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <span className="opacity-60">Dataset Image Browser · v0.1</span>
      </div>
    </footer>
  );
}
