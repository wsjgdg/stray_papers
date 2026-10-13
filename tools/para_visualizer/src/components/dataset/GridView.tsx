"use client";
/**
 * Grid view: virtualized thumbnail grid.
 */
import { useMemo, useRef, useState } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema } from "@/lib/dataset/hooks";
import { Thumbnail } from "./Thumbnail";
import { formatValue } from "@/lib/dataset/filter";
import { Bookmark, BookmarkCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PAGE_SIZE = 60;

export function GridView() {
  const filtered = useFilteredRows();
  const schema = useSchema();
  const page = useDatasetStore((s) => s.page);
  const setPage = useDatasetStore((s) => s.setPage);
  const thumbnailSize = useDatasetStore((s) => s.thumbnailSize);
  const imageField = useDatasetStore((s) => s.imageField);
  const selectedRowId = useDatasetStore((s) => s.selectedRowId);
  const setSelectedRow = useDatasetStore((s) => s.setSelectedRow);
  const toggleCompare = useDatasetStore((s) => s.toggleCompare);
  const compareRowIds = useDatasetStore((s) => s.compareRowIds);
  const bookmarks = useDatasetStore((s) => s.bookmarks);
  const toggleBookmark = useDatasetStore((s) => s.toggleBookmark);
  const showBboxOverlay = useDatasetStore((s) => s.showBboxOverlay);

  const hoverLabelField = useMemo(() => {
    // pick a representative text field for caption
    return (
      schema.find((f) => f.role === "text" && f.name !== imageField)?.name ||
      schema.find((f) => f.role === "category")?.name ||
      null
    );
  }, [schema, imageField]);

  const captionField2 = useMemo(() => {
    return schema.find((f) => f.role === "category" && f.name !== hoverLabelField)?.name || null;
  }, [schema, hoverLabelField]);

  const start = page * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto custom-scroll p-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Star className="h-8 w-8 opacity-40" />
            <p>No rows match the current filters.</p>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))`,
            }}
          >
            {pageRows.map((r) => {
              const isSel = selectedRowId === r.id;
              const inCompare = compareRowIds.includes(r.id);
              const bookmarked = !!bookmarks[r.id];
              const imgValue = imageField ? r.data[imageField] : undefined;
              const bboxes = r.data["extra_input_figure_bboxes"];
              const w = r.data["image_width"];
              const h = r.data["image_height"];
              return (
                <div
                  key={r.id}
                  className={cn(
                    "group relative rounded-lg border bg-card overflow-hidden transition-all hover:shadow-md hover:border-primary/40",
                    isSel ? "ring-2 ring-primary border-primary" : "",
                    inCompare ? "ring-2 ring-amber-400" : "",
                  )}
                >
                  <Thumbnail
                    rowId={r.id}
                    imageValue={imgValue}
                    fieldName={imageField || ""}
                    className="aspect-[3/2] w-full"
                    onClick={() => setSelectedRow(r.id)}
                    showBbox={showBboxOverlay}
                    bboxes={Array.isArray(bboxes) ? bboxes as number[] : undefined}
                    imgWidth={typeof w === "number" ? w : undefined}
                    imgHeight={typeof h === "number" ? h : undefined}
                    alt={`Row ${r.index + 1}: ${formatValue(r.data[hoverLabelField || ""])}`}
                  />
                  <div className="p-2 border-t bg-card/60">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono text-muted-foreground">#{r.index + 1}</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBookmark(r.id);
                          }}
                          className={cn(
                            "p-1 rounded hover:bg-accent",
                            bookmarked ? "text-amber-500" : "text-muted-foreground/50",
                          )}
                          title={bookmarked ? "Remove bookmark" : "Add bookmark"}
                        >
                          {bookmarked ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCompare(r.id);
                          }}
                          className={cn(
                            "p-1 rounded hover:bg-accent",
                            inCompare ? "text-amber-500" : "text-muted-foreground/50",
                          )}
                          title="Toggle compare"
                        >
                          <Star className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {hoverLabelField && (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-[11px] line-clamp-2 leading-tight text-foreground/80">
                              {formatValue(r.data[hoverLabelField])}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">{formatValue(r.data[hoverLabelField])}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {captionField2 && (
                      <p className="text-[10px] mt-0.5 text-muted-foreground/70 line-clamp-1">
                        {formatValue(r.data[captionField2])}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t bg-card/40 text-xs text-muted-foreground">
          <span>
            Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded border hover:bg-accent disabled:opacity-40"
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
            >
              Prev
            </button>
            <span className="font-mono">
              {page + 1} / {totalPages}
            </span>
            <button
              className="px-2 py-1 rounded border hover:bg-accent disabled:opacity-40"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
