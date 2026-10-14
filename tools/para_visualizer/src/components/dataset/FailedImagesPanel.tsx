"use client";
/**
 * Sidebar listing thumbnails that failed to decode/load.
 * Each row: reason + a Retry button (re-fetches just that image). A header
 * "Retry all" re-attempts every failed image at once.
 */
import { useDatasetStore } from "@/lib/dataset/store";
import { Button } from "@/components/ui/button";
import { RotateCw, AlertTriangle, X } from "lucide-react";

export function FailedImagesPanel() {
  const failures = useDatasetStore((s) => s.failures);
  const retryOne = useDatasetStore((s) => s.retryOne);
  const retryAll = useDatasetStore((s) => s.bumpRetryEpoch);
  const clearFailures = useDatasetStore((s) => s.clearFailures);
  const setSelectedRow = useDatasetStore((s) => s.setSelectedRow);

  return (
    <div className="flex flex-col h-full bg-card/40">
      <div className="flex items-center gap-2 px-3 h-10 border-b shrink-0">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold">Failed images</span>
        <span className="ml-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300">
          {failures.length}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {failures.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => retryAll()} title="Retry all failed">
              <RotateCw className="h-3 w-3 mr-1" /> Retry all
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => clearFailures()} title="Clear list">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-1.5">
        {failures.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground/60 gap-2 py-10">
            <AlertTriangle className="h-6 w-6 opacity-40" />
            <p className="text-xs">No failed images.</p>
          </div>
        ) : (
          failures.map((f, i) => (
            <div
              key={`${f.rowId}:${f.field}:${i}`}
              className="rounded-md border bg-background/60 p-2 text-[11px] hover:border-amber-400/50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-foreground/80 truncate">{f.rowId}</span>
                <span className="text-muted-foreground/50">·</span>
                <span className="text-muted-foreground/70 truncate">{f.field}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 px-1.5 text-[10px]"
                  onClick={() => retryOne(f.rowId, f.field)}
                  title="Retry this image"
                >
                  <RotateCw className="h-3 w-3" />
                </Button>
              </div>
              <p className="mt-1 text-muted-foreground/70 leading-snug line-clamp-3">{f.reason}</p>
              <button
                className="mt-1 text-[10px] text-primary/80 hover:underline"
                onClick={() => setSelectedRow(f.rowId)}
              >
                Jump to row →
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
