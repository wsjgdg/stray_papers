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
  const dataset = useDatasetStore((s) => s.datasets[s.activeDatasetIndex]);
  const total = useActiveRows();
  const filtered = useFilteredRows();
  const bookmarks = useDatasetStore((s) => s.bookmarks);
  const compare = useDatasetStore((s) => s.compareRowIds);
  const failures = useDatasetStore((s) => s.failures);
  const loading = useDatasetStore((s) => s.loading);
  const loadError = useDatasetStore((s) => s.loadError);
  const filterRules = useDatasetStore((s) => s.filterRules);

  return (
    <footer className="border-t bg-gradient-to-r from-card/40 via-card/30 to-card/40 px-3 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground overflow-x-auto whitespace-nowrap custom-scroll" role="status" aria-live="polite">
      <div className="flex items-center gap-1.5 shrink-0">
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
        ) : (
          <Database className="h-3 w-3 text-violet-500/70" />
        )}
        <span>
          {dataset ? (
            <>
              <span className="font-medium text-foreground/80">{dataset.name}</span>
              <span className="text-muted-foreground/50"> · </span>
            </>
          ) : "No dataset"}
          <span className="font-mono tabular-nums font-medium text-foreground/70">{total.length}</span> rows
        </span>
      </div>
      {filterRules.length > 0 && (
        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 shrink-0">
          <Filter className="h-3 w-3" />
          <span className="font-mono tabular-nums font-medium">{filtered.length}</span> filtered
        </div>
      )}
      <div className="flex items-center gap-1 shrink-0">
        <Bookmark className={`h-3 w-3 transition-colors ${Object.keys(bookmarks).length > 0 ? "text-amber-500" : "text-muted-foreground/40"}`} />
        <span className="font-mono tabular-nums">{Object.keys(bookmarks).length}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Star className={`h-3 w-3 transition-colors ${compare.length > 0 ? "text-amber-500" : "text-muted-foreground/40"}`} />
        <span className="font-mono tabular-nums">{compare.length}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {failures.length === 0 ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span>No errors</span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-3 w-3 text-rose-500" />
            <span className="font-mono tabular-nums text-rose-500">{failures.length} failures</span>
          </>
        )}
      </div>
      {loadError && (
        <div className="flex items-center gap-1 text-rose-600 shrink-0">
          <AlertTriangle className="h-3 w-3" />
          <span className="truncate max-w-[200px]">{loadError}</span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <span className="opacity-50 font-medium">Dataset Image Browser</span>
      </div>
    </footer>
  );
}
